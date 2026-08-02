import { ENV } from "@/config/environment";
import { db } from "@/config/db";
import { appDb } from "@/db";
import { settings } from "@/db/schema/settings.schema";
import { exif } from "@/schema";
import { assets } from "@/schema/assets.schema";
import { person } from "@/schema/person.schema";
import { assetFaces } from "@/schema/assetFaces.schema";
import { albumsAssetsAssets } from "@/schema/albumAssetsAssets.schema";
import { eq, and, inArray, desc, isNull, sql } from "drizzle-orm";
import { IUser } from "@/types/user";
import { getUserHeaders } from "@/helpers/user.helper";
import { isSyncAction } from "@/config/constants/workflow";

export const WORKFLOW_API_KEY_SETTING = "workflow_api_key";

interface ActionResult {
  action: string;
  assetsProcessed: number;
  albumId?: string;
  albumName?: string;
  error?: string;
  /** Sync actions only — the two halves of the reconcile, so a run can report
   *  "12 added, 3 removed" instead of a single opaque total. */
  added?: number;
  removed?: number;
}

/** Assets currently in a container, restricted to the same slice of the library
 *  the trigger draws from (the owner's active, non-trashed, timeline assets).
 *  Without that restriction a sync action would strip out archived or trashed
 *  photos that the run never evaluated in the first place. */
const syncScope = (ownerId: string) => [
  eq(assets.ownerId, ownerId),
  eq(assets.visibility, "timeline"),
  eq(assets.status, "active"),
  isNull(assets.deletedAt),
];

async function currentAlbumMembers(albumId: string, ownerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: albumsAssetsAssets.assetId })
    .from(albumsAssetsAssets)
    .innerJoin(assets, eq(assets.id, albumsAssetsAssets.assetId))
    .where(and(eq(albumsAssetsAssets.albumId, albumId), ...syncScope(ownerId)));
  return rows.map((r) => r.id);
}

async function currentTagMembers(tagId: string, ownerId: string): Promise<string[]> {
  const { rows } = await db.execute(sql`
    SELECT ta."assetId"::text AS id
      FROM "tag_asset" ta
      JOIN "asset" a ON a.id = ta."assetId"
     WHERE ta."tagId" = ${tagId}
       AND a."ownerId" = ${ownerId}
       AND a.visibility = 'timeline'
       AND a.status = 'active'
       AND a."deletedAt" IS NULL
  `);
  return (rows as any[]).map((r) => r.id);
}

/** Resolve the tag an action is configured with. The tag actions only ever
 *  change which photos carry a tag -- they never create, rename or delete one,
 *  so this looks the tag up and fails loudly if it's gone rather than
 *  conjuring it into existence. */
async function resolveTag(config: any, user: IUser): Promise<{ id: string; value: string }> {
  const tags = await immichFetch("/tags", "GET", undefined, user);
  const list: any[] = Array.isArray(tags) ? tags : [];

  if (config.tagId) {
    const byId = list.find((t) => t.id === config.tagId);
    if (byId) return { id: byId.id, value: byId.value };
    // Moving or renaming a tag gives it a new id, so fall back to the path we
    // stored next to it before giving up.
    const byStoredValue = config.tagValue && list.find((t) => t.value === config.tagValue);
    if (byStoredValue) return { id: byStoredValue.id, value: byStoredValue.value };
    throw new Error(
      `The tag this action points at no longer exists${config.tagValue ? ` ("${config.tagValue}")` : ""}. ` +
      `Open the action and pick a tag again.`
    );
  }

  // Actions saved before the tag picker stored a hand-typed name.
  if (config.tagName) {
    const byValue = list.find((t) => t.value === config.tagName);
    if (byValue) return { id: byValue.id, value: byValue.value };
    throw new Error(
      `No tag called "${config.tagName}" exists. Open the action and pick an existing tag ` +
      `(these actions no longer create tags -- make it in Tag Manager first).`
    );
  }

  throw new Error("No tag selected for this action");
}

function diff(desired: string[], current: string[]) {
  // Dedupe both sides: two branches of the graph can deliver the same asset to
  // one action, and we don't want the id twice in a request body.
  const desiredSet = new Set(desired);
  const currentSet = new Set(current);
  return {
    toAdd: [...desiredSet].filter((id) => !currentSet.has(id)),
    toRemove: [...currentSet].filter((id) => !desiredSet.has(id)),
  };
}

/** Read-only version of a sync action, for the canvas dry run — reports what
 *  would change without touching anything. */
export async function previewSyncAction(
  subType: string,
  config: any,
  assetIds: string[],
  user: IUser
): Promise<{ toAdd: number; toRemove: number } | null> {
  try {
    if (subType === "update_album") {
      if (!config.albumId) return null;
      const { toAdd, toRemove } = diff(assetIds, await currentAlbumMembers(config.albumId, user.id));
      return { toAdd: toAdd.length, toRemove: toRemove.length };
    }
    if (subType === "update_tag") {
      const tag = await resolveTag(config, user);
      const { toAdd, toRemove } = diff(assetIds, await currentTagMembers(tag.id, user.id));
      return { toAdd: toAdd.length, toRemove: toRemove.length };
    }
  } catch {
    return null;
  }
  return null;
}

async function getWorkflowApiKey(ownerId: string): Promise<string | null> {
  const [row] = await appDb
    .select()
    .from(settings)
    .where(and(eq(settings.key, WORKFLOW_API_KEY_SETTING), eq(settings.ownerId, ownerId)));
  return row?.value || null;
}

// Immich bulk endpoints are called in batches so large asset sets don't
// produce oversized request bodies.
const API_BATCH_SIZE = 1000;

async function immichFetchBatched(path: string, method: string, ids: string[], extraBody: Record<string, any>, user: IUser): Promise<void> {
  for (let i = 0; i < ids.length; i += API_BATCH_SIZE) {
    await immichFetch(path, method, { ...extraBody, ids: ids.slice(i, i + API_BATCH_SIZE) }, user);
  }
}

async function immichFetch(path: string, method: string, body: any, user: IUser): Promise<any> {
  const workflowApiKey = await getWorkflowApiKey(user.id);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (workflowApiKey) {
    headers["x-api-key"] = workflowApiKey;
  } else {
    const userHeaders = getUserHeaders(user);
    Object.assign(headers, userHeaders);
  }

  const res = await fetch(`${ENV.IMMICH_URL}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Immich API error ${res.status}: ${text}`);
  }
  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return res.json();
  }
  return null;
}

async function resolveTemplate(template: string, assetIds: string[]): Promise<string> {
  if (!template || assetIds.length === 0) return template;

  let result = template;

  if (result.includes("{city}") || result.includes("{state}") || result.includes("{country}") || result.includes("{camera}")) {
    // Get most common EXIF values
    const exifRows = await db
      .select({
        city: exif.city,
        state: exif.state,
        country: exif.country,
        make: exif.make,
        model: exif.model,
      })
      .from(exif)
      .where(inArray(exif.assetId, assetIds))
      .limit(100);

    const mostCommon = (values: (string | null)[]) => {
      const counts = new Map<string, number>();
      for (const v of values) {
        if (v) counts.set(v, (counts.get(v) || 0) + 1);
      }
      let best = "";
      let bestCount = 0;
      for (const [v, c] of counts) {
        if (c > bestCount) { best = v; bestCount = c; }
      }
      return best || "Unknown";
    };

    result = result.replace("{city}", mostCommon(exifRows.map((r) => r.city)));
    result = result.replace("{state}", mostCommon(exifRows.map((r) => r.state)));
    result = result.replace("{country}", mostCommon(exifRows.map((r) => r.country)));
    result = result.replace("{camera}", mostCommon(exifRows.map((r) => [r.make, r.model].filter(Boolean).join(" "))));
  }

  if (result.includes("{date}")) {
    const today = new Date();
    result = result.replace("{date}", today.toISOString().split("T")[0]);
  }

  if (result.includes("{person}")) {
    const faces = await db
      .select({ name: person.name })
      .from(assetFaces)
      .innerJoin(person, eq(assetFaces.personId, person.id))
      .where(inArray(assetFaces.assetId, assetIds))
      .limit(100);

    const names = faces.map((f) => f.name).filter(Boolean);
    const mostCommon = (values: string[]) => {
      const counts = new Map<string, number>();
      for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
      let best = "";
      let bestCount = 0;
      for (const [v, c] of counts) {
        if (c > bestCount) { best = v; bestCount = c; }
      }
      return best || "Unknown";
    };
    result = result.replace("{person}", mostCommon(names));
  }

  return result;
}

export async function executeAction(
  subType: string,
  config: any,
  assetIds: string[],
  user: IUser
): Promise<ActionResult> {
  // Sync actions still have work to do with nothing matching — that's the
  // instruction to empty the container.
  if (assetIds.length === 0 && !isSyncAction(subType)) {
    return { action: subType, assetsProcessed: 0 };
  }

  switch (subType) {
    case "update_album": {
      if (!config.albumId) throw new Error("Album ID is required for update_album");
      const { toAdd, toRemove } = diff(assetIds, await currentAlbumMembers(config.albumId, user.id));
      if (toAdd.length) {
        await immichFetchBatched(`/albums/${config.albumId}/assets`, "PUT", toAdd, {}, user);
      }
      if (toRemove.length) {
        await immichFetchBatched(`/albums/${config.albumId}/assets`, "DELETE", toRemove, {}, user);
      }
      return {
        action: "update_album",
        assetsProcessed: toAdd.length + toRemove.length,
        albumId: config.albumId,
        added: toAdd.length,
        removed: toRemove.length,
      };
    }

    case "update_tag": {
      try {
        const tag = await resolveTag(config, user);
        const { toAdd, toRemove } = diff(assetIds, await currentTagMembers(tag.id, user.id));
        if (toAdd.length) {
          await immichFetchBatched(`/tags/${tag.id}/assets`, "PUT", toAdd, {}, user);
        }
        if (toRemove.length) {
          await immichFetchBatched(`/tags/${tag.id}/assets`, "DELETE", toRemove, {}, user);
        }
        return {
          action: "update_tag",
          assetsProcessed: toAdd.length + toRemove.length,
          added: toAdd.length,
          removed: toRemove.length,
        };
      } catch (e: any) {
        return { action: "update_tag", assetsProcessed: 0, error: e.message };
      }
    }

    case "create_album": {
      const albumName = await resolveTemplate(config.nameTemplate || "Auto Album", assetIds);
      const album = await immichFetch("/albums", "POST", { albumName, assetIds: assetIds.slice(0, API_BATCH_SIZE) }, user);
      if (assetIds.length > API_BATCH_SIZE) {
        await immichFetchBatched(`/albums/${album.id}/assets`, "PUT", assetIds.slice(API_BATCH_SIZE), {}, user);
      }
      return { action: "create_album", assetsProcessed: assetIds.length, albumId: album.id, albumName };
    }

    case "add_to_album": {
      if (!config.albumId) throw new Error("Album ID is required for add_to_album");
      await immichFetchBatched(`/albums/${config.albumId}/assets`, "PUT", assetIds, {}, user);
      return { action: "add_to_album", assetsProcessed: assetIds.length, albumId: config.albumId };
    }

    case "remove_from_album": {
      if (!config.albumId) throw new Error("Album ID is required for remove_from_album");
      await immichFetchBatched(`/albums/${config.albumId}/assets`, "DELETE", assetIds, {}, user);
      return { action: "remove_from_album", assetsProcessed: assetIds.length, albumId: config.albumId };
    }

    case "favorite": {
      await immichFetchBatched("/assets", "PUT", assetIds, { isFavorite: true }, user);
      return { action: "favorite", assetsProcessed: assetIds.length };
    }

    case "unfavorite": {
      await immichFetchBatched("/assets", "PUT", assetIds, { isFavorite: false }, user);
      return { action: "unfavorite", assetsProcessed: assetIds.length };
    }

    case "archive": {
      await immichFetchBatched("/assets", "PUT", assetIds, { visibility: "archive" }, user);
      return { action: "archive", assetsProcessed: assetIds.length };
    }

    case "tag": {
      try {
        const tag = await resolveTag(config, user);
        await immichFetchBatched(`/tags/${tag.id}/assets`, "PUT", assetIds, {}, user);
        return { action: "tag", assetsProcessed: assetIds.length };
      } catch (e: any) {
        return { action: "tag", assetsProcessed: 0, error: e.message };
      }
    }

    case "remove_tag": {
      try {
        const tag = await resolveTag(config, user);
        await immichFetchBatched(`/tags/${tag.id}/assets`, "DELETE", assetIds, {}, user);
        return { action: "remove_tag", assetsProcessed: assetIds.length };
      } catch (e: any) {
        return { action: "remove_tag", assetsProcessed: 0, error: e.message };
      }
    }

    default:
      return { action: subType, assetsProcessed: 0, error: `Unknown action: ${subType}` };
  }
}
