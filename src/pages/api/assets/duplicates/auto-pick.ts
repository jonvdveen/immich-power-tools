import { sql } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

import { db } from "@/config/db";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";
import { autoPickKeepers, IDuplicateCandidate } from "@/lib/duplicates/autoPick";
import { normalizeRanking } from "@/lib/duplicates/ranking";
import { getRanking } from "@/lib/duplicates/rankingStore";

/**
 * Propose a keeper for each duplicate group.
 *
 * Ranked server-side because two of the signals (tag count, and when the asset
 * entered the library) aren't in Immich's /duplicates payload.
 *
 * Groups arrive from the client rather than being derived here, because a
 * partner's copy is not in the same Immich duplicate group -- it has its own
 * duplicateId, or none -- so only the caller knows which partner assets belong
 * with which group. Those ids are still verified here: an asset owned by
 * neither the user nor one of their partners is dropped, whatever the client
 * claims.
 *
 * Read-only: it returns a proposed selection and changes nothing.
 */

export const config = {
  api: {
    // The client batches, but a hand-rolled call shouldn't be silently
    // rejected by the 1MB default before it reaches the handler.
    bodyParser: { sizeLimit: "10mb" },
  },
};

interface IGroupInput {
  duplicateId: string;
  assetIds: string[];
  /** Only sent when the user has opted into partner copies winning. */
  partnerAssetIds?: string[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const currentUser = await getCurrentUser(req);
  if (!currentUser?.id) return res.status(401).json({ error: "Not authenticated" });

  const groups: unknown = req.body?.groups;
  if (!Array.isArray(groups)) return res.status(400).json({ error: "groups must be an array" });

  const parsed = groups as IGroupInput[];
  if (parsed.some((g) => typeof g?.duplicateId !== "string" || !Array.isArray(g?.assetIds))) {
    return res.status(400).json({ error: "each group needs a duplicateId and assetIds" });
  }

  const empty = { keepers: {}, undecided: [], reasons: {}, weakTiebreak: [], guarded: {}, partnerKeepers: [] };
  if (parsed.length === 0) return res.status(200).json(empty);

  // assetId -> the group it was submitted under. A partner's copy can match
  // more than one group; first claim wins, which is enough for ranking.
  const groupOf = new Map<string, string>();
  const partnerClaimed = new Set<string>();
  for (const g of parsed) {
    for (const id of g.assetIds) if (!groupOf.has(id)) groupOf.set(id, g.duplicateId);
    for (const id of g.partnerAssetIds ?? []) {
      if (!groupOf.has(id)) groupOf.set(id, g.duplicateId);
      partnerClaimed.add(id);
    }
  }
  const allIds = [...groupOf.keys()];
  if (allIds.length === 0) return res.status(200).json(empty);

  try {
    const { rows } = await db.execute(sql`
      WITH allowed_owners AS (
        SELECT ${currentUser.id}::uuid AS id
        UNION
        SELECT p."sharedById" FROM "partner" p WHERE p."sharedWithId" = ${currentUser.id}
      )
      SELECT a.id::text                                        AS id,
             a."ownerId"::text                                 AS "ownerId",
             COALESCE(e."exifImageWidth", 0)
               * COALESCE(e."exifImageHeight", 0)              AS pixels,
             COALESCE(e."fileSizeInByte", 0)                   AS bytes,
             (e.latitude IS NOT NULL)                          AS "hasGps",
             (e.description IS NOT NULL AND e.description <> '')
                                                               AS "hasDescription",
             (SELECT count(*) FROM "asset_face" af
               WHERE af."assetId" = a.id)                      AS faces,
             COALESCE(e.rating, 0)                             AS rating,
             (SELECT count(*) FROM "tag_asset" ta
               WHERE ta."assetId" = a.id)                      AS tags,
             a."isFavorite"                                    AS "isFavorite",
             a."createdAt"                                     AS "createdAt",
             encode(a.checksum, 'hex')                         AS checksum,
             a."originalFileName"                              AS "originalFileName"
        FROM "asset" a
        LEFT JOIN "asset_exif" e ON e."assetId" = a.id
       WHERE a."ownerId" IN (SELECT id FROM allowed_owners)
         AND a."deletedAt" IS NULL
         AND a.id IN (${sql.join(allIds.map((id) => sql`${id}::uuid`), sql`, `)})
    `);

    const candidates: IDuplicateCandidate[] = [];
    const ownerOf = new Map<string, string>();
    for (const r of rows as any[]) {
      const duplicateId = groupOf.get(r.id);
      if (!duplicateId) continue;
      ownerOf.set(r.id, r.ownerId);
      candidates.push({
        id: r.id,
        duplicateId,
        pixels: Number(r.pixels) || 0,
        bytes: Number(r.bytes) || 0,
        hasGps: !!r.hasGps,
        faces: Number(r.faces) || 0,
        rating: Number(r.rating) || 0,
        tags: Number(r.tags) || 0,
        isFavorite: !!r.isFavorite,
        hasDescription: !!r.hasDescription,
        isOwn: r.ownerId === currentUser.id,
        createdAt: new Date(r.createdAt).getTime() || 0,
        checksum: String(r.checksum ?? ""),
        originalFileName: String(r.originalFileName ?? ""),
      });
    }

    // The client sends its unsaved edits so the editor can be previewed
    // without committing; anything else falls back to the stored config.
    const ranking = Array.isArray(req.body?.ranking)
      ? normalizeRanking(req.body.ranking)
      : await getRanking(currentUser.id);

    const result = autoPickKeepers(candidates, ranking);

    // Flag groups whose winner belongs to a partner: those discard every copy
    // the user owns, so the UI has to say so rather than just tick a box.
    const partnerKeepers = Object.entries(result.keepers)
      .filter(([, assetId]) => partnerClaimed.has(assetId) && ownerOf.get(assetId) !== currentUser.id)
      .map(([duplicateId]) => duplicateId);

    return res.status(200).json({ ...result, partnerKeepers });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message });
  }
}
