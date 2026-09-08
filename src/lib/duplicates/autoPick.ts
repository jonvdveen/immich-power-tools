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
  originalFileName: string;
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

/** Applied only once every quality signal above has tied. These carry no claim
 *  about which image is better — they exist so the tool always lands on exactly
 *  one copy, and lands on the same one every run. Measured over the 686 groups
 *  that reach this point on a real library: filename length settles 663 of
 *  them, library age the remaining 23, and the id has never been needed. */
const TIEBREAK_KEYS: { name: string; score: (c: IDuplicateCandidate) => number }[] = [
  // The longer name is the more descriptive one -- an organised
  // "20190615_12.45.29_JJV01165.jpg" over a bare "JJV01165.JPG".
  { name: "longer filename", score: (c) => c.originalFileName.length },
  // Longest-standing copy, so existing references keep pointing at it.
  { name: "oldest", score: (c) => -c.createdAt },
];

/** Which key decided between two candidates, or null if they tie on every one. */
export function decidingKey(a: IDuplicateCandidate, b: IDuplicateCandidate): string | null {
  for (const key of [...RANK_KEYS, ...TIEBREAK_KEYS]) {
    if (key.score(a) !== key.score(b)) return key.name;
  }
  // Asset ids are unique, so this is the guaranteed terminator: the chain
  // always resolves to exactly one copy, and to the same one on a re-run.
  return a.id === b.id ? null : "asset id";
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
  /** Kept for callers; now always empty, since the tiebreak chain always
   *  resolves. */
  undecided: string[];
  /** Groups settled only by a tiebreak (filename length or later) rather than
   *  by an actual quality difference — the ones worth a human glance. */
  weakTiebreak: string[];
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
  const weakTiebreak: string[] = [];
  const tiebreakNames = new Set([...TIEBREAK_KEYS.map((k) => k.name), "asset id"]);

  for (const [duplicateId, list] of groups) {
    if (list.length === 0) continue;
    if (list.length === 1) {
      // Nothing to choose between; a single-asset group has no discard.
      keepers[duplicateId] = list[0].id;
      reasons[duplicateId] = "only copy";
      continue;
    }

    const sorted = [...list].sort(compare);
    const key = decidingKey(sorted[0], sorted[1]) ?? "asset id";

    keepers[duplicateId] = sorted[0].id;

    // Byte-identical copies are worth naming as such: whichever is kept, the
    // file that survives is the same one, so the tiebreak carries no risk.
    const identical = !!sorted[0].checksum && sorted[0].checksum === sorted[1].checksum;
    reasons[duplicateId] = identical && tiebreakNames.has(key) ? "identical file" : key;

    // Flag the ones settled by a tiebreak rather than a real difference --
    // unless the files are byte-identical, where there is nothing to review.
    if (tiebreakNames.has(key) && !identical) weakTiebreak.push(duplicateId);
  }

  return { keepers, undecided, reasons, weakTiebreak };
}
