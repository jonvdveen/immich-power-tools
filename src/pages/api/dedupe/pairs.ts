import { and, eq, inArray, sql } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

import { db } from "@/config/db";
import { appDb } from "@/db";
import { dedupeDismissals, dedupePairs } from "@/db/schema";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { Band, isBand } from "@/lib/duplicates/bands";

/**
 * The cross-library clusters, read back out of the index the scan built.
 *
 * Shaped to look exactly like an Immich duplicate group — one of your assets,
 * with the partner's copies attached as matches — so the same list, the same
 * cards and the same keep/discard machinery render it without a second code
 * path. The synthetic group key is `xlib:<your asset id>`, which is also the
 * key its dismissals are filed under.
 *
 * Three things are filtered out on the way, all of them cases where the index
 * has gone stale rather than errors:
 *
 *  - **Assets Immich has since grouped itself.** If your copy picked up a
 *    `duplicateId`, it already appears in the same-library list, where the
 *    partner overlay shows the same partner copy. Showing it twice would be
 *    two places to make one decision.
 *  - **Anything trashed or deleted** since the scan ran — including, usefully,
 *    everything you resolved on a previous pass, which is what makes the list
 *    drain instead of repeating.
 *  - **Pairs you dismissed**, whole clusters and individual pairings alike.
 *
 * The index itself is left alone: a pair whose asset is sitting in the trash
 * is filtered from the view but not deleted, so restoring the asset in Immich
 * brings the match back rather than requiring a rescan.
 */

/* A note on `sql.param` below: drizzle expands a bare JS array in a template
 * into a row constructor -- `ANY(($1, $2)::uuid[])` -- which Postgres rejects.
 * `sql.param` binds the whole array as one parameter, which is also what makes
 * a 20,000-id eligibility check a single bind rather than 20,000 of them. */

const DEFAULT_LIMIT = 2000;
const MAX_LIMIT = 5000;

/** Same key the client uses, so a dismissal made in the browser and one read
 *  back here always agree. */
export const crossGroupKey = (assetId: string) => `xlib:${assetId}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  const currentUser = await getCurrentUser(req);
  if (!currentUser?.id) return res.status(401).json({ error: "Not authenticated" });
  const ownerId = currentUser.id;

  const band: Band = isBand(req.query.band) ? req.query.band : "exact";
  const requested = Number(req.query.limit);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : DEFAULT_LIMIT)
  );

  try {
    const indexed = await appDb
      .select()
      .from(dedupePairs)
      .where(and(eq(dedupePairs.ownerId, ownerId), eq(dedupePairs.band, band)))
      .orderBy(dedupePairs.distance);

    if (indexed.length === 0) {
      return res.status(200).json({ band, total: 0, shown: 0, records: [], matches: {} });
    }

    const dismissals = await appDb
      .select({
        groupKey: dedupeDismissals.groupKey,
        pairedAssetId: dedupeDismissals.pairedAssetId,
      })
      .from(dedupeDismissals)
      .where(and(
        eq(dedupeDismissals.ownerId, ownerId),
        inArray(
          dedupeDismissals.groupKey,
          Array.from(new Set(indexed.map((p) => crossGroupKey(p.assetId))))
        )
      ));

    /** Whole clusters set aside. */
    const dismissedGroups = new Set(
      dismissals.filter((d) => !d.pairedAssetId).map((d) => d.groupKey)
    );
    /** Individual "these two are not the same photo" verdicts. */
    const dismissedPairs = new Set(
      dismissals.filter((d) => d.pairedAssetId).map((d) => `${d.groupKey}::${d.pairedAssetId}`)
    );

    const live = indexed.filter((p) => {
      const key = crossGroupKey(p.assetId);
      return !dismissedGroups.has(key) && !dismissedPairs.has(`${key}::${p.partnerAssetId}`);
    });
    if (live.length === 0) {
      return res.status(200).json({ band, total: 0, shown: 0, records: [], matches: {} });
    }

    // One round trip to find out which of your copies are still eligible. Doing
    // this over the whole index rather than just the page is what lets the
    // count be honest -- otherwise the total would still include everything
    // resolved on an earlier pass and would never go down.
    const myIds = Array.from(new Set(live.map((p) => p.assetId)));
    const { rows: eligibleRows } = await db.execute(sql`
      SELECT a.id::text AS id
        FROM "asset" a
       WHERE a."ownerId" = ${ownerId}
         AND a.id = ANY(${sql.param(myIds)}::uuid[])
         AND a."deletedAt" IS NULL
         AND a."duplicateId" IS NULL
         AND a.visibility IN ('timeline', 'archive')
    `);
    const eligible = new Set((eligibleRows as any[]).map((r) => r.id));

    /** Clusters in ascending distance order — the most certain first. */
    const clusters: { assetId: string; pairs: typeof live }[] = [];
    const clusterIndex = new Map<string, number>();
    for (const pair of live) {
      if (!eligible.has(pair.assetId)) continue;
      const at = clusterIndex.get(pair.assetId);
      if (at === undefined) {
        clusterIndex.set(pair.assetId, clusters.length);
        clusters.push({ assetId: pair.assetId, pairs: [pair] });
      } else {
        clusters[at].pairs.push(pair);
      }
    }

    const total = clusters.length;
    const page = clusters.slice(0, limit);
    if (page.length === 0) {
      return res.status(200).json({ band, total, shown: 0, records: [], matches: {} });
    }

    const pageMyIds = page.map((c) => c.assetId);
    const pagePartnerIds = Array.from(new Set(page.flatMap((c) => c.pairs.map((p) => p.partnerAssetId))));

    const [{ rows: mineRows }, { rows: theirRows }] = await Promise.all([
      db.execute(sql`
        SELECT a.id::text                        AS id,
               a."ownerId"::text                 AS "ownerId",
               a.type                            AS type,
               a."originalPath"                  AS "originalPath",
               a."originalFileName"              AS "originalFileName",
               a."isFavorite"                    AS "isFavorite",
               -- The card formats this unconditionally, and date-fns throws on
               -- a null. localDateTime is NOT NULL in Immich, so it is the
               -- honest fallback for an asset with no EXIF capture time.
               COALESCE(e."dateTimeOriginal", a."localDateTime")
                                                 AS "dateTimeOriginal",
               COALESCE(e."fileSizeInByte", 0)   AS "fileSizeInByte",
               COALESCE(e."exifImageWidth", 0)   AS "exifImageWidth",
               COALESCE(e."exifImageHeight", 0)  AS "exifImageHeight",
               e.city                            AS city,
               e.country                         AS country,
               e.make                            AS make,
               e.model                           AS model
          FROM "asset" a
          LEFT JOIN "asset_exif" e ON e."assetId" = a.id
         WHERE a.id = ANY(${sql.param(pageMyIds)}::uuid[])
      `),
      // Partner rows are re-checked for deletion too: their library is not
      // ours to keep in step, and offering a partner copy as the keeper when
      // they have already binned it would discard your only remaining copy.
      db.execute(sql`
        SELECT a.id::text                        AS id,
               a."ownerId"::text                 AS "ownerId",
               COALESCE(NULLIF(u.name, ''), u.email) AS "ownerName",
               a."originalFileName"              AS "originalFileName",
               COALESCE(e."fileSizeInByte", 0)   AS "fileSizeInByte",
               COALESCE(e."exifImageWidth", 0)   AS width,
               COALESCE(e."exifImageHeight", 0)  AS height
          FROM "asset" a
          JOIN "user" u ON u.id = a."ownerId"
          LEFT JOIN "asset_exif" e ON e."assetId" = a.id
         WHERE a.id = ANY(${sql.param(pagePartnerIds)}::uuid[])
           AND a."deletedAt" IS NULL
           AND a.visibility IN ('timeline', 'archive')
      `),
    ]);

    const mineById = new Map((mineRows as any[]).map((r) => [r.id, r]));
    const theirById = new Map((theirRows as any[]).map((r) => [r.id, r]));

    const records: any[] = [];
    const matches: Record<string, any[]> = {};

    for (const cluster of page) {
      const mine = mineById.get(cluster.assetId);
      if (!mine) continue;

      const surviving = cluster.pairs.filter((p) => theirById.has(p.partnerAssetId));
      // Every partner copy gone means there is no longer a cross-library
      // question to answer -- your copy is simply the only one left.
      if (surviving.length === 0) continue;

      matches[mine.id] = surviving.map((p) => {
        const theirs = theirById.get(p.partnerAssetId);
        return {
          id: theirs.id,
          ownerId: theirs.ownerId,
          ownerName: theirs.ownerName,
          originalFileName: theirs.originalFileName,
          fileSizeInByte: Number(theirs.fileSizeInByte) || 0,
          width: Number(theirs.width) || 0,
          height: Number(theirs.height) || 0,
          distance: p.distance,
        };
      });

      const closest = surviving.reduce((best, p) => (p.distance < best.distance ? p : best), surviving[0]);

      records.push({
        duplicateId: crossGroupKey(mine.id),
        source: "cross",
        band,
        distance: closest.distance,
        stemMatch: !!closest.stemMatch,
        assets: [{
          id: mine.id,
          ownerId: mine.ownerId,
          type: mine.type,
          originalPath: mine.originalPath ?? "",
          originalFileName: mine.originalFileName ?? "",
          isFavorite: !!mine.isFavorite,
          duplicateId: crossGroupKey(mine.id),
          exifInfo: {
            dateTimeOriginal: mine.dateTimeOriginal,
            fileSizeInByte: Number(mine.fileSizeInByte) || 0,
            exifImageWidth: Number(mine.exifImageWidth) || 0,
            exifImageHeight: Number(mine.exifImageHeight) || 0,
            city: mine.city,
            country: mine.country,
            make: mine.make,
            model: mine.model,
          },
        }],
      });
    }

    return res.status(200).json({ band, total, shown: records.length, records, matches });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message });
  }
}
