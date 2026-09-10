/**
 * Auto-pick a keeper for each duplicate group, using the user's ranking.
 *
 * The order, which criteria count, and which way each one leans all come from
 * the caller now (see lib/duplicates/ranking.ts). What stays fixed here is the
 * part that isn't a preference: the chain always terminates on exactly one
 * copy, and it never proposes a partner's copy when doing so would destroy
 * metadata that can't be moved.
 *
 * Deliberately still absent from the criteria list: album membership (varied
 * in 1 group out of 12,031, and dedup transfers albums anyway) and file type
 * (0 groups) — measured, not assumed.
 *
 * This only ever *proposes* a selection. Nothing here deletes anything.
 */

import {
  DEFAULT_RANKING, IRankingRow, RANKING_CRITERIA, RankingKey, normalizeRanking,
} from "./ranking";

export interface IDuplicateCandidate {
  id: string;
  duplicateId: string;
  pixels: number;
  bytes: number;
  hasGps: boolean;
  faces: number;
  rating: number;
  tags: number;
  isFavorite: boolean;
  hasDescription: boolean;
  /** False for a partner's copy. Drives the "owner" criterion and the guard. */
  isOwn: boolean;
  /** Epoch ms of when the asset entered the library (not when it was shot). */
  createdAt: number;
  /** Immich's file hash. Two copies matching on every quality signal may still
   *  be different images; the checksum is what tells them apart. */
  checksum: string;
  originalFileName: string;
}

/** Raw score per criterion. Higher always wins before direction is applied. */
const SCORERS: Record<RankingKey, (c: IDuplicateCandidate) => number> = {
  pixels: (c) => c.pixels,
  bytes: (c) => c.bytes,
  gps: (c) => (c.hasGps ? 1 : 0),
  faces: (c) => c.faces,
  rating: (c) => c.rating,
  tags: (c) => c.tags,
  favorite: (c) => (c.isFavorite ? 1 : 0),
  owner: (c) => (c.isOwn ? 1 : 0),
  filename: (c) => c.originalFileName.length,
  // Negated so that "higher wins" means oldest, matching the "desc" label
  // ("Prefer oldest") on every other criterion.
  date: (c) => -c.createdAt,
};

/** Metadata that lives on the asset and cannot be copied onto one you don't
 *  own. Losing any of these is what the partner guard exists to prevent. */
function salvageableFields(c: IDuplicateCandidate): Set<string> {
  const fields = new Set<string>();
  if (c.hasGps) fields.add("GPS");
  if (c.hasDescription) fields.add("description");
  if (c.tags > 0) fields.add("tags");
  if (c.isFavorite) fields.add("favourite");
  return fields;
}

/** What the discards hold that this keeper doesn't. */
function lostIfKept(keeper: IDuplicateCandidate, discards: IDuplicateCandidate[]): string[] {
  const kept = salvageableFields(keeper);
  const lost = new Set<string>();
  for (const d of discards) {
    for (const f of salvageableFields(d)) if (!kept.has(f)) lost.add(f);
  }
  return [...lost];
}

interface ActiveKey {
  key: RankingKey;
  score: (c: IDuplicateCandidate) => number;
  /** +1 keeps "higher wins", -1 flips it. */
  sign: number;
  label: string;
  cosmetic: boolean;
}

function activeKeys(ranking: IRankingRow[]): ActiveKey[] {
  return ranking
    .filter((r) => r.enabled)
    .map((r) => ({
      key: r.key,
      score: SCORERS[r.key],
      sign: r.direction === "asc" ? -1 : 1,
      label: RANKING_CRITERIA[r.key].label.toLowerCase(),
      cosmetic: RANKING_CRITERIA[r.key].kind === "cosmetic",
    }));
}

/** Which key decided between two candidates, or null if they tie on every one. */
export function decidingKey(
  a: IDuplicateCandidate,
  b: IDuplicateCandidate,
  ranking: IRankingRow[] = DEFAULT_RANKING
): string | null {
  for (const k of activeKeys(ranking)) {
    if (k.score(a) !== k.score(b)) return k.label;
  }
  // Asset ids are unique, so this is the guaranteed terminator: the chain
  // always resolves to exactly one copy, and to the same one on a re-run —
  // even if the user disables every criterion.
  return a.id === b.id ? null : "asset id";
}

export interface IAutoPickResult {
  /** duplicateId -> the asset to keep. */
  keepers: Record<string, string>;
  /** Kept for callers; the chain always resolves, so this stays empty. */
  undecided: string[];
  /** Groups settled only by a cosmetic criterion (or the id terminator) rather
   *  than by a real difference — the ones worth a human glance. */
  weakTiebreak: string[];
  /** duplicateId -> which key settled it, for explaining the choice in the UI. */
  reasons: Record<string, string>;
  /** Groups where the ranking chose a partner's copy but the guard overrode it
   *  to protect metadata, with what would have been lost. */
  guarded: Record<string, string[]>;
}

export function autoPickKeepers(
  candidates: IDuplicateCandidate[],
  rankingInput: IRankingRow[] = DEFAULT_RANKING
): IAutoPickResult {
  const ranking = normalizeRanking(rankingInput);
  const keys = activeKeys(ranking);
  const cosmeticLabels = new Set(keys.filter((k) => k.cosmetic).map((k) => k.label));
  cosmeticLabels.add("asset id");

  const compare = (a: IDuplicateCandidate, b: IDuplicateCandidate): number => {
    for (const k of keys) {
      const diff = (k.score(b) - k.score(a)) * k.sign;
      if (diff !== 0) return diff;
    }
    // Stable terminator so a re-run lands on the same copy.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };

  const groups = new Map<string, IDuplicateCandidate[]>();
  for (const c of candidates) {
    const list = groups.get(c.duplicateId) ?? [];
    list.push(c);
    groups.set(c.duplicateId, list);
  }

  const keepers: Record<string, string> = {};
  const reasons: Record<string, string> = {};
  const guarded: Record<string, string[]> = {};
  const undecided: string[] = [];
  const weakTiebreak: string[] = [];

  for (const [duplicateId, list] of groups) {
    if (list.length === 0) continue;
    if (list.length === 1) {
      // Nothing to choose between; a single-asset group has no discard.
      keepers[duplicateId] = list[0].id;
      reasons[duplicateId] = "only copy";
      continue;
    }

    const sorted = [...list].sort(compare);
    let winner = sorted[0];
    let runnerUp = sorted[1];

    // The guard. A partner's copy winning means every copy the user owns in
    // this group is discarded — and metadata can't be written onto an asset
    // they don't own, so anything only their copies carry is gone for good.
    // Fall back to the best copy they do own rather than silently losing it.
    if (!winner.isOwn) {
      const discards = sorted.filter((c) => c.id !== winner.id);
      const lost = lostIfKept(winner, discards);
      if (lost.length > 0) {
        const bestOwn = sorted.find((c) => c.isOwn);
        if (bestOwn) {
          guarded[duplicateId] = lost;
          winner = bestOwn;
          runnerUp = sorted.find((c) => c.id !== bestOwn.id) ?? runnerUp;
        }
      }
    }

    const key = decidingKey(winner, runnerUp, ranking) ?? "asset id";
    keepers[duplicateId] = winner.id;

    // Byte-identical copies are worth naming as such: whichever is kept, the
    // file that survives is the same one, so the tiebreak carries no risk.
    const identical = !!winner.checksum && winner.checksum === runnerUp.checksum;
    reasons[duplicateId] = guarded[duplicateId]
      ? `kept your copy — ${guarded[duplicateId].join(", ")} would be lost`
      : identical && cosmeticLabels.has(key)
        ? "identical file"
        : key;

    if (cosmeticLabels.has(key) && !identical && !guarded[duplicateId]) {
      weakTiebreak.push(duplicateId);
    }
  }

  return { keepers, undecided, reasons, weakTiebreak, guarded };
}
