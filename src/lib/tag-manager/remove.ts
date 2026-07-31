import { IUser } from "@/types/user";

import {
  API_BATCH_SIZE,
  fetchAssetIds,
  fetchSubtree,
  immichFetch,
  withRetry,
} from "./immich";

/**
 * Delete a tag (and its whole sub-tree) so that it stays deleted.
 *
 * Immich's own DELETE /tags/{id} removes the tag row and cascades away its
 * tag_asset links, but it emits no event and so never touches two other places
 * the tag's name is recorded:
 *
 *   - `asset_exif.tags`, Immich's own per-asset list of tag values, and
 *   - the photo's XMP sidecar `TagsList` on disk.
 *
 * Both keep the deleted name. Metadata extraction later reads `asset_exif.tags`
 * (MetadataService.applyTagList -> getForMetadataExtractionTags -> upsertTags)
 * and recreates the tag, photos and all — so a plain delete looks like it
 * worked and then silently undoes itself on the next metadata pass. Verified on
 * Immich v3.1.0.
 *
 * Untagging the photos first is what clears both: TagService.removeAssets calls
 * updateTags(assetId), which rewrites `asset_exif.tags` from the asset's real
 * remaining tags, then emits AssetUntag -> SidecarWrite rewrites the .xmp. Only
 * then is it safe to drop the tag itself.
 *
 * Note this rewrites one sidecar file per photo, which is Immich's normal
 * behaviour for any tag change — but it is a write to the library, so the UI
 * says so before asking to confirm.
 */
export async function removeTag({
  tagId,
  ownerId,
  user,
}: {
  tagId: string;
  ownerId: string;
  user: IUser;
}): Promise<{ tagsDeleted: number; assetsUntagged: number }> {
  const subtree = await fetchSubtree(tagId, ownerId);
  const root = subtree.find((n) => n.id === tagId);
  if (!root) throw new Error("Tag not found");

  // Untag depth-first (children before parents) purely so that a failure
  // partway leaves the tree in a coherent state to retry from.
  let assetsUntagged = 0;
  for (const node of [...subtree].reverse()) {
    const assetIds = await fetchAssetIds(node.id, ownerId);
    for (let i = 0; i < assetIds.length; i += API_BATCH_SIZE) {
      const batch = assetIds.slice(i, i + API_BATCH_SIZE);
      await withRetry(() => immichFetch(`/tags/${node.id}/assets`, "DELETE", { ids: batch }, user));
      assetsUntagged += batch.length;
    }
  }

  // Cascades to the whole sub-tree, which is now empty of photos.
  await immichFetch(`/tags/${root.id}`, "DELETE", undefined, user);

  return { tagsDeleted: subtree.length, assetsUntagged };
}
