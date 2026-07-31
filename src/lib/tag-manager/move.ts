import { sql } from "drizzle-orm";

import { db } from "@/config/db";
import { IUser } from "@/types/user";

import {
  API_BATCH_SIZE,
  fetchAssetIds,
  fetchSubtree,
  immichFetch,
  SubtreeNode,
  withRetry,
} from "./immich";

/**
 * Rename / nest / un-nest a tag (and, if it has any, its whole sub-tree).
 *
 * Immich's tag API cannot do either of these directly — verified live against
 * the server, and re-verified on v3.1.0: its update endpoint's schema
 * (TagUpdateDto) still only accepts `color`; sending a new name or parentId
 * hits a server bug (empty SQL SET clause -> 500). Create, delete, and color
 * updates all work fine.
 *
 * So this recreates the tag(s) at the new name/location via the *supported*
 * endpoints, deletes the old tag (Immich cascades that delete to any old
 * descendants, their tag_asset rows, and its internal tag_closure rows in one
 * shot), and only then re-applies the tagging on the new tag(s). That order is
 * load-bearing — see the comment on the delete below. Never touches Immich's
 * database directly for writes — only the reads (which asset ids are on a tag,
 * which tags form the sub-tree) go direct-to-Postgres, same boundary every
 * other module in this app already follows.
 *
 * A moved/renamed tag gets a new id as a side effect; everything visible
 * (name, position, tagged photos) comes out correct.
 */

const leafOf = (value: string) => value.slice(value.lastIndexOf("/") + 1);

export async function moveTag({
  tagId,
  ownerId,
  user,
  newParentId,
  newName,
}: {
  tagId: string;
  ownerId: string;
  user: IUser;
  /** undefined = keep current parent; null = make top-level; string = new parent tag id. */
  newParentId?: string | null;
  /** undefined = keep current leaf name. */
  newName?: string;
}): Promise<{ newId: string; tagsMoved: number; assetsCopied: number }> {
  const subtree = await fetchSubtree(tagId, ownerId);
  const root = subtree.find((n) => n.id === tagId);
  if (!root) throw new Error("Tag not found");

  if (newName !== undefined) {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error("Name can't be empty");
    if (trimmed.includes("/")) throw new Error("Tag names can't contain '/'");
    newName = trimmed;
  }

  const subtreeIds = new Set(subtree.map((n) => n.id));
  if (newParentId) {
    if (subtreeIds.has(newParentId)) {
      throw new Error("Can't nest a tag under itself or one of its own sub-tags");
    }
    const { rows } = await db.execute(sql`
      SELECT 1 FROM "tag" WHERE id = ${newParentId} AND "userId" = ${ownerId} LIMIT 1
    `);
    if (!rows.length) throw new Error("Target parent tag not found");
  }

  const rootNewParentId = newParentId === undefined ? root.parentId : newParentId;
  const rootNewName = newName ?? leafOf(root.value);

  const createdIds: string[] = [];
  const oldToNew = new Map<string, string>();
  let oldTreeDeleted = false;

  // Snapshot which assets are on each node up front. The old tree is deleted
  // before any re-tagging happens (see below), so these ids are the only record
  // of what has to be re-applied.
  const assetsByNode = new Map<string, string[]>();
  for (const node of subtree) {
    assetsByNode.set(node.id, await fetchAssetIds(node.id, ownerId));
  }

  try {
    // Top-down: a node's new parent must exist before the node is created.
    const created = await immichFetch("/tags", "POST", {
      name: rootNewName,
      parentId: rootNewParentId || undefined,
      color: root.color || undefined,
    }, user);
    oldToNew.set(root.id, created.id);
    createdIds.push(created.id);

    const byParent = new Map<string, SubtreeNode[]>();
    for (const n of subtree) {
      if (n.id === root.id) continue;
      const list = byParent.get(n.parentId as string) ?? [];
      list.push(n);
      byParent.set(n.parentId as string, list);
    }
    // BFS from root so every node's old parent has already been recreated.
    let frontier = [root.id];
    while (frontier.length) {
      const next: string[] = [];
      for (const oldParentId of frontier) {
        for (const child of byParent.get(oldParentId) ?? []) {
          const childCreated = await immichFetch("/tags", "POST", {
            name: leafOf(child.value),
            parentId: oldToNew.get(oldParentId),
            color: child.color || undefined,
          }, user);
          oldToNew.set(child.id, childCreated.id);
          createdIds.push(childCreated.id);
          next.push(child.id);
        }
      }
      frontier = next;
    }

    // Drop the old tree *before* re-tagging anything onto the new one.
    //
    // Immich rewrites an asset's XMP sidecar whenever its tags change:
    // TagService.addAssets calls updateTags(assetId), which replaces
    // asset_exif.tags with the asset's current tag values, then emits AssetTag
    // -> MetadataService queues SidecarWrite -> TagsList is written to the .xmp.
    // Re-tagging while the old tag still existed would catch each asset on both
    // the old and the new tag and bake *both* paths into TagsList; Immich's next
    // metadata pass reads that file back (applyTagList -> upsertTags) and
    // recreates the very tag the move just got rid of, complete with all its
    // photos. Deleting a tag emits no event and rewrites no sidecar, so doing it
    // first leaves the old path with no trace on disk to be resurrected from.
    await immichFetch(`/tags/${root.id}`, "DELETE", undefined, user);
    oldTreeDeleted = true;

    // Re-apply the tagging on each new node. This is what triggers the single,
    // correct sidecar write per asset.
    let assetsCopied = 0;
    for (const node of subtree) {
      const assetIds = assetsByNode.get(node.id) ?? [];
      const newId = oldToNew.get(node.id)!;
      for (let i = 0; i < assetIds.length; i += API_BATCH_SIZE) {
        const batch = assetIds.slice(i, i + API_BATCH_SIZE);
        await withRetry(() => immichFetch(`/tags/${newId}/assets`, "PUT", { ids: batch }, user));
        assetsCopied += batch.length;
      }
    }

    return { newId: oldToNew.get(root.id)!, tagsMoved: subtree.length, assetsCopied };
  } catch (error: any) {
    if (!oldTreeDeleted) {
      // The old tree is still intact, so the clean undo is to drop the new one.
      // Deleting the new root cascades to any children already created, so one
      // call takes down the whole partial tree.
      if (createdIds.length) {
        await immichFetch(`/tags/${createdIds[0]}`, "DELETE", undefined, user).catch(() => {});
      }
      throw error;
    }
    // Past the delete the new tree is the only place these assets belong, so
    // tearing it down would throw away the move entirely. Leave it standing and
    // say what's missing. Photos that were missed are recoverable but only to
    // their *old* state: their sidecars still hold the original keyword, and
    // Immich's "Sidecar Metadata" job reads sidecars (it queues SidecarCheck,
    // never SidecarWrite), so running it re-creates the tag this move was
    // getting rid of. It is a way back, not a way forward.
    throw new Error(
      `Moved the tag to "${rootNewName}", but re-tagging its photos failed partway: ` +
        `${error?.message ?? error}. The new tag exists and kept whatever was re-tagged before ` +
        `the failure — add the rest to it to finish. Photos that were missed still carry the old ` +
        `keyword in their XMP sidecar, so Immich's "Sidecar Metadata" job would bring the OLD tag ` +
        `back for them rather than complete this move.`
    );
  }
}
