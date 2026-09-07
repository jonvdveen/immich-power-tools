/**
 * Auto-pick a keeper for each duplicate group.
 *
 * Ranking was chosen against this library's actual duplicates (12k groups),
 * not from first principles — the comment on each key records how often it
 * actually separates two copies, because a signal that never varies is just
 * a way to look decisive while deciding nothing.
 *
 * Deliberately unused: album membership (varied in 1 group out of 12,031, and
 * dedup transfers albums anyway), file type (0 groups), and the timestamped
 * filename convention (the larger file only 24% of the time, so it reflects
 * the import naming rather than quality).
 *
 * This only ever *proposes* a selection. Nothing here deletes anything.
 */

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
  /** Epoch ms of when the asset entered the library (not when it was shot). */
  createdAt: number;
  /** Immich's file hash. Two copies matching on every quality signal may still
   *  be different images; the checksum is what tells them apart. */
  checksum: string;
}

/** Each key returns a number where HIGHER wins. First non-zero difference decides. */
const RANK_KEYS: { name: string; score: (c: IDuplicateCandidate) => number }[] = [
  // Separates 24% of groups. Ahead of bytes on purpose: the two disagree in 8%
  // of groups, and a larger file at lower resolution is a re-encode of a
  // downscaled image, so pixels is the one to trust.
  { name: "pixels", score: (c) => c.pixels },
  // Separates ~95% — the workhorse. Same pixels means less compression.
  { name: "bytes", score: (c) => c.bytes },
  // The rest are metadata you can't get back once the copy is gone.
  { name: "gps", score: (c) => (c.hasGps ? 1 : 0) },       // 11%
  { name: "faces", score: (c) => c.faces },                 // 2%
  { name: "rating", score: (c) => c.rating },               // 3%
  { name: "tags", score: (c) => c.tags },                   // 24%
  { name: "favorite", score: (c) => (c.isFavorite ? 1 : 0) }, // 6%
];

/** Which key decided between two candidates, or null if they tie on every one. */
export function decidingKey(a: IDuplicateCandidate, b: IDuplicateCandidate): string | null {
  for (const key of RANK_KEYS) {
    if (key.score(a) !== key.score(b)) return key.name;
  }
  return null;
}

function compare(a: IDuplicateCandidate, b: IDuplicateCandidate): number {
  for (const key of RANK_KEYS) {
    const diff = key.score(b) - key.score(a);
    if (diff !== 0) return diff;
  }
  // Everything measurable ties. Oldest-first only to make the order stable —
  // whether it is allowed to *decide* is settled in autoPickKeepers, which
  // checks the checksum first.
  return a.createdAt - b.createdAt;
}

export interface IAutoPickResult {
  /** duplicateId -> the asset to keep. */
  keepers: Record<string, string>;
  /** Groups where the best two copies tie on every signal — left for a human. */
  undecided: string[];
  /** duplicateId -> which key settled it, for explaining the choice in the UI. */
  reasons: Record<string, string>;
}

export function autoPickKeepers(candidates: IDuplicateCandidate[]): IAutoPickResult {
  const groups = new Map<string, IDuplicateCandidate[]>();
  for (const c of candidates) {
    const list = groups.get(c.duplicateId) ?? [];
    list.push(c);
    groups.set(c.duplicateId, list);
  }

  const keepers: Record<string, string> = {};
  const reasons: Record<string, string> = {};
  const undecided: string[] = [];

  for (const [duplicateId, list] of groups) {
    if (list.length === 0) continue;
    if (list.length === 1) {
      // Nothing to choose between; a single-asset group has no discard.
      keepers[duplicateId] = list[0].id;
      reasons[duplicateId] = "only copy";
      continue;
    }

    const sorted = [...list].sort(compare);
    const key = decidingKey(sorted[0], sorted[1]);

    if (key === null) {
      // Tied on every quality signal. Whether that is safe depends entirely on
      // whether they are the same file. Measured on a real 12k-group library,
      // 686 groups reach this point and NOT ONE of them was byte-identical --
      // same dimensions, same size, same metadata, different content. Picking
      // the older one there is a coin flip presented as a decision, so these
      // go to the human instead.
      if (sorted[0].checksum && sorted[0].checksum === sorted[1].checksum) {
        keepers[duplicateId] = sorted[0].id;
        reasons[duplicateId] = "identical file";
        continue;
      }
      undecided.push(duplicateId);
      continue;
    }

    keepers[duplicateId] = sorted[0].id;
    reasons[duplicateId] = key;
  }

  return { keepers, undecided, reasons };
}
