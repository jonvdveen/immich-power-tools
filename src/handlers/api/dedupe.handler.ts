import { DEDUPE_DISMISSALS_PATH, DEDUPE_RANKING_PATH, SETTINGS_KV_PATH } from "@/config/routes";
import API from "@/lib/api";
import { IRankingRow } from "@/lib/duplicates/ranking";

export const getRankingConfig = (): Promise<{ ranking: IRankingRow[] }> =>
  API.get(DEDUPE_RANKING_PATH);

export const putRankingConfig = (ranking: IRankingRow[]): Promise<{ ranking: IRankingRow[] }> =>
  API.put(DEDUPE_RANKING_PATH, { ranking });

export const resetRankingConfig = (): Promise<{ ranking: IRankingRow[] }> =>
  API.delete(DEDUPE_RANKING_PATH);

export interface IDismissal {
  groupKey: string;
  pairedAssetId: string | null;
}

export const listDismissals = (): Promise<{ dismissals: IDismissal[] }> =>
  API.get(DEDUPE_DISMISSALS_PATH);

export const addDismissals = (
  payload: { groupKeys?: string[]; pairs?: { groupKey: string; pairedAssetId: string }[] }
): Promise<{ added: number; alreadyDismissed: number }> =>
  API.post(DEDUPE_DISMISSALS_PATH, payload);

export const removeDismissals = (groupKeys: string[]): Promise<{ removed: number }> =>
  API.delete(DEDUPE_DISMISSALS_PATH, { groupKeys });

export const clearDismissals = (): Promise<{ cleared: boolean }> =>
  API.delete(DEDUPE_DISMISSALS_PATH, { all: true });

/** Per-account view preferences, on the existing key/value settings endpoint
 *  rather than a table of their own. A missing key 404s, which reads as
 *  "unset" — the caller supplies the default. */
export const getSetting = async (key: string): Promise<string | null> => {
  try {
    const row = await API.get(SETTINGS_KV_PATH(key));
    return typeof row?.value === "string" ? row.value : null;
  } catch {
    return null;
  }
};

export const putSetting = (key: string, value: string): Promise<unknown> =>
  API.put(SETTINGS_KV_PATH(key), { value });
