import { sql } from "drizzle-orm";

import { db } from "@/config/db";
import { ENV } from "@/config/environment";
import { getUserHeaders } from "@/helpers/user.helper";
import { IUser } from "@/types/user";

/** Shared plumbing for the tag-manager operations that Immich's API can't do in
 * one call (move/rename, and delete-that-stays-deleted). Writes always go
 * through the Immich API; only reads go direct-to-Postgres, the same boundary
 * every other module in this app follows. */

export const API_BATCH_SIZE = 1000;
const API_RETRIES = 3;

export interface SubtreeNode {
  id: string;
  value: string;
  parentId: string | null;
  color: string | null;
}

export async function immichFetch(path: string, method: string, body: any, user: IUser): Promise<any> {
  const res = await fetch(`${ENV.IMMICH_URL}/api${path}`, {
    method,
    headers: getUserHeaders(user),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Immich API error ${res.status} on ${method} ${path}: ${text}`);
  }
  const contentType = res.headers.get("content-type");
  return contentType?.includes("application/json") ? res.json() : null;
}

/** Retry a call a few times. Used for the steps that run after something has
 * already been destroyed, where giving up would lose information. */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= API_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < API_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  }
  throw lastError;
}

export async function fetchSubtree(rootId: string, ownerId: string): Promise<SubtreeNode[]> {
  const { rows } = await db.execute(sql`
    WITH RECURSIVE subtree AS (
      SELECT id::text, value, "parentId"::text AS "parentId", color
        FROM "tag"
       WHERE id = ${rootId} AND "userId" = ${ownerId}
      UNION ALL
      SELECT t.id::text, t.value, t."parentId"::text AS "parentId", t.color
        FROM "tag" t
        JOIN subtree s ON t."parentId"::text = s.id
    )
    SELECT * FROM subtree
  `);
  return rows as unknown as SubtreeNode[];
}

export async function fetchAssetIds(tagId: string, ownerId: string): Promise<string[]> {
  const { rows } = await db.execute(sql`
    SELECT ta."assetId"::text AS "assetId"
      FROM "tag_asset" ta
      JOIN "asset" a ON a.id = ta."assetId" AND a."ownerId" = ${ownerId} AND a."deletedAt" IS NULL
     WHERE ta."tagId" = ${tagId}
  `);
  return (rows as any[]).map((r) => r.assetId);
}
