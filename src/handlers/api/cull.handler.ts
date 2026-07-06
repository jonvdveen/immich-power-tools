import { CREATE_OR_GET_TAG_PATH, LIST_CULL_ASSETS_PATH, TAG_ASSETS_PATH } from "@/config/routes";
import API from "@/lib/api";
import { IAsset } from "@/types/asset";

// Tag names live in config/constants/cull.ts (shared with the API route);
// re-exported here so existing imports keep working.
export { PICK_TAG_NAME, REJECT_TAG_NAME } from "@/config/constants/cull";

/**
 * Immich's POST /tags does NOT upsert — it 400s with "A tag with that name
 * already exists" once the tag exists. So a real get-or-create needs the
 * list check first; this is not just an optimization.
 */
export const getOrCreateTag = async (name: string): Promise<{ id: string; value: string }> => {
  const existing: { id: string; value: string }[] = await API.get(CREATE_OR_GET_TAG_PATH);
  const found = existing.find((t) => t.value === name);
  if (found) return found;
  return API.post(CREATE_OR_GET_TAG_PATH, { name });
};

export const addTagToAssets = (tagId: string, assetIds: string[]) =>
  API.put(TAG_ASSETS_PATH(tagId), { ids: assetIds });

export const removeTagFromAssets = (tagId: string, assetIds: string[]) =>
  API.delete(TAG_ASSETS_PATH(tagId), { ids: assetIds });

/** An asset in the cull feed, carrying its persisted rating + flag state. */
export interface ICullAsset extends IAsset {
  rating: number | null; // 1-5, null = unrated (0 normalized to null server-side)
  picked: boolean;
  rejected: boolean;
}

export type ICullRatingFilter = "any" | "unrated" | "1" | "2" | "3" | "4" | "5";
export type ICullFlagFilter = "any" | "picked" | "rejected" | "unflagged";

export interface ICullAssetsParams {
  albumId?: string;
  startDate?: string; // yyyy-MM-dd, camera-local
  endDate?: string;
  rating?: ICullRatingFilter; // numbers mean ">= N stars", Lightroom-style
  flag?: ICullFlagFilter;
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export const listCullAssets = (
  params: ICullAssetsParams
): Promise<{ assets: ICullAsset[]; total: number; hasNext: boolean }> =>
  API.get(LIST_CULL_ASSETS_PATH, params);
