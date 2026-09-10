import { BULK_TAG_ASSETS_PATH, CREATE_OR_GET_TAG_PATH, DELETE_TAG_PATH, LIST_TAGS_PATH, MOVE_TAG_PATH, TAG_PATH, UPSERT_TAGS_PATH } from "@/config/routes";
import API from "@/lib/api";

export interface ITag {
  id: string;
  value: string;
  color: string | null;
  parentId: string | null;
  assetCount: number;
}

export const listTags = (): Promise<{ tags: ITag[] }> => {
  return API.get(LIST_TAGS_PATH);
};

export const createTag = (params: { name: string; parentId?: string; color?: string }): Promise<ITag> =>
  API.post(CREATE_OR_GET_TAG_PATH, params);

/** Deletes the tag *and* untags its photos first, so Immich cannot resurrect it
 * from asset_exif.tags / the XMP sidecars — see lib/tag-manager/remove.ts. */
export const deleteTag = (id: string): Promise<{ tagsDeleted: number; assetsUntagged: number }> =>
  API.delete(DELETE_TAG_PATH(id));

export const updateTagColor = (id: string, color: string | null): Promise<ITag> =>
  API.patch(TAG_PATH(id), { color });

/** Rename and/or move a tag (and its sub-tags) — see lib/tag-manager/move.ts. */
export const moveTag = (
  id: string,
  params: { newParentId?: string | null; newName?: string }
): Promise<{ newId: string; tagsMoved: number; assetsCopied: number }> =>
  API.post(MOVE_TAG_PATH(id), params);

/** Create-or-get tags by name. Immich's PUT /tags is an upsert — POST /tags
 *  returns 400 when the name already exists, which is the common case here. */
export const upsertTags = (names: string[]): Promise<ITag[]> =>
  API.put(UPSERT_TAGS_PATH, { tags: names });

/** Apply tags to assets in one call. Returns how many assets were tagged. */
export const bulkTagAssets = (tagIds: string[], assetIds: string[]): Promise<{ count: number }> =>
  API.put(BULK_TAG_ASSETS_PATH, { tagIds, assetIds });
