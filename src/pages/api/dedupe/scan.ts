import { eq, sql } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

import { db } from "@/config/db";
import { appDb } from "@/db";
import { dedupePairs, dedupeScanState } from "@/db/schema";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { Band, MAX_SCAN_DISTANCE, classifyBand, stemsMatch } from "@/lib/duplicates/bands";

/**
 * The cross-library scan.
 *
 * Immich computes duplicate groups strictly per owner — `DuplicateService`
 * passes `userIds: [asset.ownerId]` and then prunes singletons — so a photo
 * you and your partner both hold is invisible to it by construction. Finding
 * those means running the nearest-neighbour search ourselves, over the same
 * CLIP embeddings Immich already stores in `smart_search`.
 *
 * That costs about 13ms per asset probed -- measured cold, on three disjoint
 * 200-asset slices, so it is not a cache artefact -- which is roughly 22
 * minutes for this library's 103,206 probeable assets. (An earlier figure of
 * 31ms came from a differently-shaped sample; 13ms is the one to trust.) So
 * this is:
 *
 *  - **Chunked.** One HTTP call probes a few hundred assets and returns. The
 *    client loops. Nothing here runs longer than a few seconds.
 *  - **Resumable.** The cursor lives in app.db, not in the browser, so closing
 *    the tab loses nothing and reopening picks up where it stopped.
 *  - **Incremental.** Once a pass completes, the cursor sits at the newest
 *    asset and later runs only walk what has been added since.
 *  - **Manual.** There is no scheduler. Nothing scans unless asked.
 *
 * GET    — status: how far the index has got and what is in it.
 * POST   — probe one chunk. `{ chunkSize? }`.
 * DELETE — throw the index away and start over.
 */

const DEFAULT_CHUNK = 200;
const MAX_CHUNK = 1000;
/** Neighbours fetched per asset. A partner can hold more than one copy, and
 *  asking the index for three costs no more probes than asking for one. */
const NEIGHBOURS = 3;
/** Bound variables per INSERT. SQLite's default statement limit is 999 and a
 *  pair row binds eight columns. */
const PAIR_INSERT_CHUNK = 100;

interface IPartner {
  id: string;
  name: string;
}

/**
 * "Strictly after the cursor", in a form Postgres can seek to.
 *
 * The row comparison is the correct one -- (createdAt, id) is unique where
 * createdAt alone is not, because Immich stamps it from the transaction clock
 * and a bulk import can hand several assets the same value.
 *
 * But `date_trunc(...)` makes it non-sargable, so on its own the planner walks
 * `asset_createdAt_idx` from the beginning of time and throws away everything
 * before the cursor -- measured at 218,000 discarded rows per chunk once the
 * scan is a few months in, and growing. The redundant `>= watermark` lets it
 * seek instead. It excludes nothing: date_trunc only ever rounds down, so any
 * row satisfying the row comparison satisfies this too. Measured 6x fewer
 * buffers.
 */
function afterCursor(watermark: Date | null, cursorAssetId: string | null) {
  if (!watermark || !cursorAssetId) return sql`true`;
  const ts = watermark.toISOString();
  return sql`a."createdAt" >= ${ts}::timestamptz
             AND (date_trunc('milliseconds', a."createdAt"), a.id)
                   > (${ts}::timestamptz, ${cursorAssetId}::uuid)`;
}

async function listPartners(userId: string): Promise<IPartner[]> {
  const { rows } = await db.execute(sql`
    SELECT u.id::text AS id, COALESCE(NULLIF(u.name, ''), u.email) AS name
      FROM "partner" p
      JOIN "user" u ON u.id = p."sharedById"
     WHERE p."sharedWithId" = ${userId}
     ORDER BY 2
  `);
  return rows as unknown as IPartner[];
}

/**
 * How many of this user's assets are probeable, and how many are still ahead
 * of the cursor.
 *
 * "Probeable" means it has an embedding: an asset Immich hasn't finished
 * machine-learning yet cannot be compared to anything, and counting it would
 * make the progress bar stall at 99% forever.
 */
async function countProgress(
  userId: string,
  watermark: Date | null,
  cursorAssetId: string | null
): Promise<{ total: number; remaining: number }> {
  const ahead = afterCursor(watermark, cursorAssetId);

  const { rows } = await db.execute(sql`
    SELECT count(*)                        AS total,
           count(*) FILTER (WHERE ${ahead}) AS remaining
      FROM "asset" a
      JOIN "smart_search" ss ON ss."assetId" = a.id
     WHERE a."ownerId" = ${userId}
       AND a."deletedAt" IS NULL
       AND a.visibility IN ('timeline', 'archive')
  `);
  const row = (rows as any[])[0] ?? {};
  return { total: Number(row.total) || 0, remaining: Number(row.remaining) || 0 };
}

async function indexedCounts(ownerId: string): Promise<Record<Band | "total", number>> {
  const rows = await appDb
    .select({ band: dedupePairs.band, count: sql<number>`count(*)` })
    .from(dedupePairs)
    .where(eq(dedupePairs.ownerId, ownerId))
    .groupBy(dedupePairs.band);

  const counts = { exact: 0, near: 0, review: 0, total: 0 };
  for (const r of rows) {
    const n = Number(r.count) || 0;
    if (r.band === "exact" || r.band === "near" || r.band === "review") counts[r.band] = n;
    counts.total += n;
  }
  return counts;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser?.id) return res.status(401).json({ error: "Not authenticated" });
  const ownerId = currentUser.id;

  try {
    const partners = await listPartners(ownerId);

    if (req.method === "DELETE") {
      await appDb.delete(dedupePairs).where(eq(dedupePairs.ownerId, ownerId));
      await appDb.delete(dedupeScanState).where(eq(dedupeScanState.ownerId, ownerId));
      return res.status(200).json({ cleared: true });
    }

    const states = await appDb
      .select()
      .from(dedupeScanState)
      .where(eq(dedupeScanState.ownerId, ownerId));
    const stateFor = new Map(states.map((s) => [s.partnerOwnerId, s]));

    // Progress is derived from the cursor on every request rather than from a
    // stored counter: a counter drifts the moment anything is added, removed
    // or re-scanned, and this cannot.
    const perPartner = await Promise.all(
      partners.map(async (p) => {
        const state = stateFor.get(p.id);
        const { total, remaining } = await countProgress(
          ownerId,
          state?.watermark ?? null,
          state?.cursorAssetId ?? null
        );
        return { partner: p, state, total, remaining };
      })
    );

    const total = perPartner.reduce((sum, p) => sum + p.total, 0);
    const remaining = perPartner.reduce((sum, p) => sum + p.remaining, 0);
    const lastRunAt = states.reduce<Date | null>(
      (latest, s) => (s.lastRunAt && (!latest || s.lastRunAt > latest) ? s.lastRunAt : latest),
      null
    );

    if (req.method === "GET") {
      return res.status(200).json({
        partners,
        total,
        remaining,
        scanned: total - remaining,
        lastRunAt,
        counts: await indexedCounts(ownerId),
        maxDistance: MAX_SCAN_DISTANCE,
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    if (partners.length === 0) {
      return res.status(200).json({
        done: true, total: 0, remaining: 0, scanned: 0, probed: 0,
        found: { exact: 0, near: 0, review: 0 }, partners, lastRunAt,
        counts: await indexedCounts(ownerId),
        message: "Nobody is sharing a library with you, so there is nothing to compare against.",
      });
    }

    // Finish one partner before starting the next: each has its own cursor, so
    // interleaving them would just make the progress harder to explain.
    const next = perPartner.find((p) => p.remaining > 0);
    if (!next) {
      return res.status(200).json({
        done: true, total, remaining: 0, scanned: total, probed: 0,
        found: { exact: 0, near: 0, review: 0 },
        counts: await indexedCounts(ownerId), partners, lastRunAt,
      });
    }

    const requested = Number(req.body?.chunkSize);
    const chunkSize = Math.min(
      MAX_CHUNK,
      Math.max(1, Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : DEFAULT_CHUNK)
    );

    const watermark = next.state?.watermark ?? null;
    const cursorAssetId = next.state?.cursorAssetId ?? null;
    // date_trunc on the left because the stored watermark is milliseconds and
    // Postgres keeps microseconds. Truncating both sides can only ever re-probe
    // the tail of one millisecond, never skip past it -- and re-probing is free,
    // the write below is an upsert. Measured worst case on this library: seven
    // assets share a millisecond, well inside a chunk.
    const after = afterCursor(watermark, cursorAssetId);

    const startedAt = Date.now();
    const { rows } = await db.execute(sql`
      WITH mine AS (
        SELECT a.id, a."createdAt", a."originalFileName", ss.embedding
          FROM "asset" a
          JOIN "smart_search" ss ON ss."assetId" = a.id
         WHERE a."ownerId" = ${ownerId}
           AND a."deletedAt" IS NULL
           AND a.visibility IN ('timeline', 'archive')
           AND ${after}
         ORDER BY a."createdAt", a.id
         LIMIT ${chunkSize}
      )
      SELECT mine.id::text            AS "assetId",
             mine."createdAt"         AS "createdAt",
             mine."originalFileName"  AS "myName",
             m.id::text               AS "matchId",
             m."originalFileName"     AS "theirName",
             m.distance               AS distance
        FROM mine
        -- LEFT, not CROSS: an asset with no neighbour close enough still has to
        -- come back, or the cursor could never move past it.
        LEFT JOIN LATERAL (
          SELECT a2.id, a2."originalFileName",
                 (ss2.embedding <=> mine.embedding) AS distance
            FROM "smart_search" ss2
            JOIN "asset" a2 ON a2.id = ss2."assetId"
           WHERE a2."ownerId" = ${next.partner.id}::uuid
             AND a2."deletedAt" IS NULL
             AND a2.visibility IN ('timeline', 'archive')
           ORDER BY ss2.embedding <=> mine.embedding
           LIMIT ${NEIGHBOURS}
        ) m ON true
       ORDER BY mine."createdAt", mine.id
    `);

    const found = { exact: 0, near: 0, review: 0 };
    const values: (typeof dedupePairs.$inferInsert)[] = [];
    const probed = new Set<string>();
    let lastCreatedAt: Date | null = null;
    let lastAssetId: string | null = null;

    for (const r of rows as any[]) {
      probed.add(r.assetId);
      // Rows come back in cursor order, so the last one seen is the new cursor.
      lastCreatedAt = new Date(r.createdAt);
      lastAssetId = r.assetId;

      if (!r.matchId) continue;
      const distance = Number(r.distance);
      const stemMatch = stemsMatch(r.myName, r.theirName);
      const band = classifyBand(distance, stemMatch);
      if (!band) continue;

      found[band] += 1;
      values.push({
        ownerId,
        assetId: r.assetId,
        partnerAssetId: r.matchId,
        partnerOwnerId: next.partner.id,
        distance,
        stemMatch,
        band,
      });
    }

    for (let i = 0; i < values.length; i += PAIR_INSERT_CHUNK) {
      await appDb
        .insert(dedupePairs)
        .values(values.slice(i, i + PAIR_INSERT_CHUNK))
        .onConflictDoUpdate({
          target: [dedupePairs.ownerId, dedupePairs.assetId, dedupePairs.partnerAssetId],
          set: {
            distance: sql`excluded.distance`,
            stemMatch: sql`excluded.stem_match`,
            band: sql`excluded.band`,
            discoveredAt: new Date(),
          },
        });
    }

    // A cursor that doesn't move would loop forever. It can only happen if a
    // whole chunk shares one millisecond of createdAt, which needs hundreds of
    // assets inserted in the same transaction -- report it rather than spin.
    const stalled =
      lastAssetId !== null &&
      lastAssetId === cursorAssetId &&
      lastCreatedAt?.getTime() === watermark?.getTime();

    if (lastAssetId && lastCreatedAt && !stalled) {
      const scannedCount = (next.state?.scannedCount ?? 0) + probed.size;
      await appDb
        .insert(dedupeScanState)
        .values({
          ownerId,
          partnerOwnerId: next.partner.id,
          watermark: lastCreatedAt,
          cursorAssetId: lastAssetId,
          scannedCount,
          lastRunAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [dedupeScanState.ownerId, dedupeScanState.partnerOwnerId],
          set: {
            watermark: lastCreatedAt,
            cursorAssetId: lastAssetId,
            scannedCount,
            lastRunAt: new Date(),
          },
        });
    }

    // An empty chunk with work supposedly left means the two queries disagree
    // about what is probeable. Treat this partner as finished rather than
    // handing the client a loop it can never exit.
    const partnerRemaining =
      lastAssetId && lastCreatedAt
        ? (await countProgress(ownerId, lastCreatedAt, lastAssetId)).remaining
        : 0;
    const remainingNow = perPartner.reduce(
      (sum, p) => sum + (p.partner.id === next.partner.id ? partnerRemaining : p.remaining),
      0
    );

    return res.status(200).json({
      done: remainingNow === 0,
      stalled,
      total,
      remaining: remainingNow,
      scanned: total - remainingNow,
      probed: probed.size,
      found,
      counts: await indexedCounts(ownerId),
      partner: next.partner,
      partners,
      // Included on every reply because the client merges this whole object
      // into the status it is holding; omitting it would blank the line.
      lastRunAt: new Date(),
      elapsedMs: Date.now() - startedAt,
      error: stalled
        ? "The scan could not advance past a block of assets that all share the same timestamp. Clear the index and start over, or raise the chunk size."
        : undefined,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message });
  }
}
