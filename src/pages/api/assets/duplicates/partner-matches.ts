import { sql } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";

/**
 * Find copies of the given assets that live in a partner's library.
 *
 * Immich's own duplicate detection can't answer this: it stamps `duplicateId`
 * per owner (DuplicateService passes `userIds: [asset.ownerId]`), so a
 * partner's copy is never in the same group. The underlying repository does
 * accept several users, which is the same trick used here — a CLIP-embedding
 * nearest-neighbour search over `smart_search`, widened to the partners who
 * share with this user.
 *
 * Batched on purpose. Each search is one vchordrq index probe at roughly 30ms,
 * so scanning a whole library would take minutes; the client walks through the
 * groups it is actually showing.
 */

const MAX_BATCH = 200;
/** Immich's own default when duplicateDetection isn't configured. */
const FALLBACK_MAX_DISTANCE = 0.01;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const currentUser = await getCurrentUser(req);
  if (!currentUser?.id) return res.status(401).json({ error: "Not authenticated" });

  const assetIds: unknown = req.body?.assetIds;
  if (!Array.isArray(assetIds) || assetIds.some((id) => typeof id !== "string")) {
    return res.status(400).json({ error: "assetIds must be an array of strings" });
  }
  if (assetIds.length === 0) return res.status(200).json({ matches: {}, partners: [] });
  if (assetIds.length > MAX_BATCH) {
    return res.status(400).json({ error: `At most ${MAX_BATCH} assetIds per request` });
  }

  try {
    // Partners are the people who shared *with* this user — their library is
    // visible here, which is what makes showing their copies legitimate.
    const { rows: partnerRows } = await db.execute(sql`
      SELECT u.id::text AS id, COALESCE(NULLIF(u.name, ''), u.email) AS name
        FROM "partner" p
        JOIN "user" u ON u.id = p."sharedById"
       WHERE p."sharedWithId" = ${currentUser.id}
    `);
    const partners = partnerRows as unknown as { id: string; name: string }[];
    if (partners.length === 0) return res.status(200).json({ matches: {}, partners: [] });

    // Match Immich's own threshold so "duplicate" means the same thing here as
    // it does everywhere else in the app.
    const { rows: cfgRows } = await db.execute(sql`
      SELECT value #>> '{machineLearning,duplicateDetection,maxDistance}' AS d
        FROM "system_metadata" WHERE key = 'system-config'
    `);
    const configured = Number((cfgRows as any[])[0]?.d);
    const maxDistance = Number.isFinite(configured) ? configured : FALLBACK_MAX_DISTANCE;

    const partnerIds = sql.join(partners.map((p) => sql`${p.id}::uuid`), sql`, `);
    const ids = sql.join(assetIds.map((id) => sql`${id}::uuid`), sql`, `);

    // One nearest-neighbour probe per input asset. LIMIT 1 inside the lateral
    // keeps it to a single index probe rather than a full distance sort.
    const { rows } = await db.execute(sql`
      SELECT mine.id::text          AS "assetId",
             m.id::text             AS "matchId",
             m."ownerId"::text      AS "ownerId",
             m."originalFileName"   AS "originalFileName",
             m.owner_name           AS "ownerName",
             m.bytes                AS "fileSizeInByte",
             m.w                    AS width,
             m.h                    AS height,
             m.distance             AS distance
        FROM "asset" mine
        JOIN "smart_search" mine_ss ON mine_ss."assetId" = mine.id
        CROSS JOIN LATERAL (
          SELECT a2.id, a2."ownerId", a2."originalFileName",
                 COALESCE(NULLIF(u2.name, ''), u2.email)  AS owner_name,
                 COALESCE(e2."fileSizeInByte", 0)         AS bytes,
                 COALESCE(e2."exifImageWidth", 0)         AS w,
                 COALESCE(e2."exifImageHeight", 0)        AS h,
                 (ss2.embedding <=> mine_ss.embedding)    AS distance
            FROM "smart_search" ss2
            JOIN "asset" a2 ON a2.id = ss2."assetId"
            JOIN "user" u2 ON u2.id = a2."ownerId"
            LEFT JOIN "asset_exif" e2 ON e2."assetId" = a2.id
           WHERE a2."ownerId" IN (${partnerIds})
             AND a2."deletedAt" IS NULL
             AND a2.visibility IN ('timeline', 'archive')
           ORDER BY ss2.embedding <=> mine_ss.embedding
           LIMIT 1
        ) m
       WHERE mine."ownerId" = ${currentUser.id}
         AND mine.id IN (${ids})
         AND m.distance <= ${maxDistance}
    `);

    const matches: Record<string, any[]> = {};
    for (const r of rows as any[]) {
      (matches[r.assetId] ??= []).push({
        id: r.matchId,
        ownerId: r.ownerId,
        ownerName: r.ownerName,
        originalFileName: r.originalFileName,
        fileSizeInByte: Number(r.fileSizeInByte) || 0,
        width: Number(r.width) || 0,
        height: Number(r.height) || 0,
        distance: Number(r.distance),
      });
    }

    return res.status(200).json({ matches, partners, maxDistance });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message });
  }
}
