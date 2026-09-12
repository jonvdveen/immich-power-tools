import {
  DEDUPE_DISMISSALS_PATH, DEDUPE_PAIRS_PATH, DEDUPE_RANKING_PATH, DEDUPE_SCAN_PATH,
  SETTINGS_KV_PATH,
} from "@/config/routes";
import API from "@/lib/api";
import { Band } from "@/lib/duplicates/bands";
import { IRankingRow } from "@/lib/duplicates/ranking";
import { IDuplicateAssetRecord, IPartnerMatch } from "@/types/asset";

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

/** "groups" restores everything you skipped; "pairs" forgets every
 *  "not the same photo" verdict; "all" does both. */
export const clearDismissals = (
  scope: "all" | "groups" | "pairs" = "all"
): Promise<{ cleared: boolean }> => API.delete(DEDUPE_DISMISSALS_PATH, { scope });

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

// ----------------------------------------------------------- cross-library

export interface IScanStatus {
  partners: { id: string; name: string }[];
  /** Assets of yours that can be probed — that is, ones with an embedding. */
  total: number;
  remaining: number;
  scanned: number;
  lastRunAt: string | null;
  counts: { exact: number; near: number; review: number; total: number };
}

export interface IScanChunkResult extends IScanStatus {
  done: boolean;
  stalled?: boolean;
  probed: number;
  found: { exact: number; near: number; review: number };
  elapsedMs: number;
  partner?: { id: string; name: string };
  error?: string;
  message?: string;
}

export const getScanStatus = (): Promise<IScanStatus> => API.get(DEDUPE_SCAN_PATH);

/** Probe one chunk. The caller loops; each call is a few seconds at most. */
export const runScanChunk = (chunkSize?: number): Promise<IScanChunkResult> =>
  API.post(DEDUPE_SCAN_PATH, chunkSize ? { chunkSize } : {});

export const clearScanIndex = (): Promise<{ cleared: boolean }> =>
  API.delete(DEDUPE_SCAN_PATH);

export interface ICrossLibraryPage {
  band: Band;
  /** Every eligible cluster in this band, not just the ones returned. */
  total: number;
  shown: number;
  records: IDuplicateAssetRecord[];
  matches: Record<string, IPartnerMatch[]>;
}

export const getCrossLibraryPairs = (band: Band, limit?: number): Promise<ICrossLibraryPage> =>
  API.get(DEDUPE_PAIRS_PATH, { band, ...(limit ? { limit } : {}) });
