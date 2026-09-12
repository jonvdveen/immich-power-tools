import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { NextApiRequest, NextApiResponse } from "next";

import { appDb } from "@/db";
import { dedupeDismissals } from "@/db/schema";
import { getCurrentUser } from "@/handlers/serverUtils/user.utils";

/**
 * "These are not duplicates."
 *
 * GET    - every dismissal for this account
 * POST   - { groupKeys: string[] } and/or { pairs: [{ groupKey, pairedAssetId }] }
 * DELETE - { groupKeys: string[] } to un-dismiss specific ones, or
 *          { scope: "all" | "groups" | "pairs" } to reset a whole kind
 *
 * Server-side rather than per-device: the review band is worked through over
 * weeks, and a dismissal that doesn't survive a browser change makes the
 * second pass show everything again.
 */

/** One row per (group, paired asset); the empty half keys a group dismissal. */
const rowKey = (groupKey: string, pairedAssetId: string | null) =>
  `${groupKey}::${pairedAssetId ?? ""}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentUser = await getCurrentUser(req);
  if (!currentUser?.id) return res.status(401).json({ error: "Not authenticated" });
  const ownerId = currentUser.id;

  try {
    if (req.method === "GET") {
      const rows = await appDb
        .select()
        .from(dedupeDismissals)
        .where(eq(dedupeDismissals.ownerId, ownerId));
      return res.status(200).json({
        dismissals: rows.map((r) => ({
          groupKey: r.groupKey,
          pairedAssetId: r.pairedAssetId,
          dismissedAt: r.dismissedAt,
        })),
      });
    }

    if (req.method === "POST") {
      const groupKeys: string[] = Array.isArray(req.body?.groupKeys) ? req.body.groupKeys : [];
      const pairs: { groupKey: string; pairedAssetId: string }[] =
        Array.isArray(req.body?.pairs) ? req.body.pairs : [];

      const values = [
        ...groupKeys
          .filter((k) => typeof k === "string" && k.length > 0)
          .map((groupKey) => ({ ownerId, groupKey, pairedAssetId: null })),
        ...pairs
          .filter((p) => typeof p?.groupKey === "string" && typeof p?.pairedAssetId === "string")
          .map((p) => ({ ownerId, groupKey: p.groupKey, pairedAssetId: p.pairedAssetId })),
      ];
      if (values.length === 0) return res.status(400).json({ error: "nothing to dismiss" });

      // SQLite's UNIQUE index treats NULLs as distinct, so a group-level
      // dismissal would insert a fresh row every time it was re-sent. Filter
      // out what is already recorded rather than relying on the constraint to
      // absorb it.
      const existing = await appDb
        .select({
          groupKey: dedupeDismissals.groupKey,
          pairedAssetId: dedupeDismissals.pairedAssetId,
        })
        .from(dedupeDismissals)
        .where(and(
          eq(dedupeDismissals.ownerId, ownerId),
          inArray(dedupeDismissals.groupKey, values.map((v) => v.groupKey))
        ));
      const seen = new Set(existing.map((e) => rowKey(e.groupKey, e.pairedAssetId)));
      const fresh = values.filter((v) => !seen.has(rowKey(v.groupKey, v.pairedAssetId)));

      if (fresh.length > 0) {
        // Chunked: SQLite caps a statement at 999 bound variables by default,
        // and dismissing a whole filtered view can exceed that.
        for (let i = 0; i < fresh.length; i += 200) {
          await appDb
            .insert(dedupeDismissals)
            .values(fresh.slice(i, i + 200))
            .onConflictDoNothing();
        }
      }
      return res.status(200).json({
        added: fresh.length,
        alreadyDismissed: values.length - fresh.length,
      });
    }

    if (req.method === "DELETE") {
      // The two kinds are cleared separately on purpose. "Restore all skipped
      // groups" must not also throw away every "these are not the same photo"
      // verdict -- one is a shelf, the other is a judgement, and a user
      // tidying the first would not expect to lose the second.
      const scope = req.body?.all === true ? "all" : req.body?.scope;
      if (scope === "all" || scope === "groups" || scope === "pairs") {
        const kind =
          scope === "groups" ? isNull(dedupeDismissals.pairedAssetId)
            : scope === "pairs" ? isNotNull(dedupeDismissals.pairedAssetId)
              : undefined;
        await appDb
          .delete(dedupeDismissals)
          .where(kind ? and(eq(dedupeDismissals.ownerId, ownerId), kind) : eq(dedupeDismissals.ownerId, ownerId));
        return res.status(200).json({ cleared: true, scope });
      }
      const groupKeys: string[] = Array.isArray(req.body?.groupKeys) ? req.body.groupKeys : [];
      if (groupKeys.length === 0) return res.status(400).json({ error: "nothing to restore" });
      for (let i = 0; i < groupKeys.length; i += 200) {
        await appDb.delete(dedupeDismissals).where(and(
          eq(dedupeDismissals.ownerId, ownerId),
          inArray(dedupeDismissals.groupKey, groupKeys.slice(i, i + 200))
        ));
      }
      return res.status(200).json({ removed: groupKeys.length });
    }

    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message });
  }
}
