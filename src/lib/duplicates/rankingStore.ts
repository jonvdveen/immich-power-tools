import { eq } from "drizzle-orm";

import { appDb } from "@/db";
import { dedupeRanking } from "@/db/schema";

import { DEFAULT_RANKING, IRankingRow, normalizeRanking } from "./ranking";

/** The stored ranking for an account, falling back to the measured default.
 *  Never throws on bad stored JSON — a corrupt row degrades to the default
 *  rather than breaking auto-pick. */
export async function getRanking(ownerId: string): Promise<IRankingRow[]> {
  const [row] = await appDb
    .select()
    .from(dedupeRanking)
    .where(eq(dedupeRanking.ownerId, ownerId))
    .limit(1);

  if (!row?.config) return [...DEFAULT_RANKING];
  try {
    return normalizeRanking(JSON.parse(row.config));
  } catch {
    return [...DEFAULT_RANKING];
  }
}

export async function saveRanking(ownerId: string, rows: IRankingRow[]): Promise<IRankingRow[]> {
  const normalized = normalizeRanking(rows);
  await appDb
    .insert(dedupeRanking)
    .values({ ownerId, config: JSON.stringify(normalized) })
    .onConflictDoUpdate({
      target: dedupeRanking.ownerId,
      set: { config: JSON.stringify(normalized), updatedAt: new Date() },
    });
  return normalized;
}
