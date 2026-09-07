import { sql } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { autoPickKeepers, IDuplicateCandidate } from "@/lib/duplicates/autoPick";

/**
 * Propose a keeper for each duplicate group among the given assets.
 *
 * Ranked server-side because two of the signals (tag count, and when the asset
 * entered the library) aren't in Immich's /duplicates payload, and shipping
 * them to the browser for every asset in every group would cost more than
 * doing the ranking here.
 *
 * Read-only: it returns a proposed selection and changes nothing.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const currentUser = await getCurrentUser(req);
  if (!currentUser?.id) return res.status(401).json({ error: "Not authenticated" });

  const assetIds: unknown = req.body?.assetIds;
  if (!Array.isArray(assetIds) || assetIds.some((id) => typeof id !== "string")) {
    return res.status(400).json({ error: "assetIds must be an array of strings" });
  }
  if (assetIds.length === 0) return res.status(200).json({ keepers: {}, undecided: [], reasons: {} });

  try {
    // Scoped to the caller's own assets: a partner's copy can never be the
    // keeper, because keeping it would discard every copy the user actually
    // owns and leave them relying on someone else's library.
    const { rows } = await db.execute(sql`
      SELECT a.id::text                                        AS id,
             a."duplicateId"::text                             AS "duplicateId",
             COALESCE(e."exifImageWidth", 0)
               * COALESCE(e."exifImageHeight", 0)              AS pixels,
             COALESCE(e."fileSizeInByte", 0)                   AS bytes,
             (e.latitude IS NOT NULL)                          AS "hasGps",
             (SELECT count(*) FROM "asset_face" af
               WHERE af."assetId" = a.id)                      AS faces,
             COALESCE(e.rating, 0)                             AS rating,
             (SELECT count(*) FROM "tag_asset" ta
               WHERE ta."assetId" = a.id)                      AS tags,
             a."isFavorite"                                    AS "isFavorite",
             a."createdAt"                                     AS "createdAt",
             encode(a.checksum, 'hex')                         AS checksum
        FROM "asset" a
        LEFT JOIN "asset_exif" e ON e."assetId" = a.id
       WHERE a."ownerId" = ${currentUser.id}
         AND a."deletedAt" IS NULL
         AND a."duplicateId" IS NOT NULL
         AND a.id::text IN (${sql.join(assetIds.map((id) => sql`${id}`), sql`, `)})
    `);

    const candidates: IDuplicateCandidate[] = (rows as any[]).map((r) => ({
      id: r.id,
      duplicateId: r.duplicateId,
      pixels: Number(r.pixels) || 0,
      bytes: Number(r.bytes) || 0,
      hasGps: !!r.hasGps,
      faces: Number(r.faces) || 0,
      rating: Number(r.rating) || 0,
      tags: Number(r.tags) || 0,
      isFavorite: !!r.isFavorite,
      createdAt: new Date(r.createdAt).getTime() || 0,
      checksum: String(r.checksum ?? ""),
    }));

    return res.status(200).json(autoPickKeepers(candidates));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message });
  }
}
