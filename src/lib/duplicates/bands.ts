/**
 * Confidence bands for cross-library matches.
 *
 * Immich's own duplicate detection never crosses an owner boundary, so a copy
 * held in a partner's library has to be found by searching CLIP embeddings
 * directly. That search always returns a nearest neighbour — the question is
 * whether it is the same photograph. These thresholds are the answer, and they
 * are measured rather than guessed.
 *
 * Sampled 1,500 of one library's assets against a partner's, cosine distance
 * over `smart_search.embedding`, corroborated against the normalised filename:
 *
 *   distance      pairs   share   filename-stem agreement
 *   <= 0.005        313   21.2%   98.1%
 *   0.005 - 0.02     37    2.5%   91.9%
 *   0.02  - 0.05     66    4.5%   33.3%
 *   0.05  - 0.08     49    3.3%    6.1%
 *   0.08  - 0.15    330   22.4%    3.3%
 *   > 0.15          679   46.1%    0.1%
 *
 * Corroboration collapses across 0.05, which is where the cut is. The
 * 0.05-0.08 band looks tempting at 3% of a library, but 94% of it is a
 * coincidence and this tool moves photos to the trash.
 *
 * Checksums are useless here: only 21 of the 313 sub-0.005 pairs shared one,
 * because the dominant pattern is the same photo held as JPG in one library
 * and HEIC in the other.
 */

export type Band = "exact" | "near" | "review";

/** Beyond this, a match is not recorded at all. */
export const MAX_SCAN_DISTANCE = 0.05;

/** Certain enough that the distance alone carries it. */
const EXACT_MAX = 0.005;
/** Still 92% corroborated without help from the filename. */
const NEAR_MAX = 0.02;

export interface IBandInfo {
  value: Band;
  label: string;
  /** One line, shown next to the count. */
  summary: string;
  /** Whether auto-pick is allowed to decide a cluster in this band. */
  autoPick: boolean;
}

export const BANDS: Record<Band, IBandInfo> = {
  exact: {
    value: "exact",
    label: "Exact",
    summary:
      "Visually identical. 98% of these agree on the filename too, which is an independent check — the safe band to work in bulk.",
    autoPick: true,
  },
  near: {
    value: "near",
    label: "Near",
    summary:
      "Very close, or close with a matching filename. Usually the same photo re-encoded or re-exported.",
    autoPick: true,
  },
  review: {
    value: "review",
    label: "Review",
    summary:
      "Close, but nothing else agrees — often a burst, a bracket, or two frames seconds apart. Judge these by eye; auto-pick leaves them alone.",
    autoPick: false,
  },
};

export const BAND_ORDER: Band[] = ["exact", "near", "review"];

export function isBand(value: unknown): value is Band {
  return value === "exact" || value === "near" || value === "review";
}

/**
 * The filename reduced to the part that identifies the shot.
 *
 * Lowercase, extension removed, then everything up to the last `_` or `/`
 * dropped — so `20240609_11.27.37_JJV02606.jpg` and `JJV02606.heic` both
 * become `jjv02606`. The exports in this household carry a date-and-time
 * prefix that the originals don't, and this is what sees through it.
 *
 * Returns an empty string when there is nothing usable left, which never
 * matches anything: this signal is only ever used to *promote* confidence, so
 * failing to normalise costs a corroboration rather than inventing one.
 */
export function normalizeStem(filename: string | null | undefined): string {
  if (!filename) return "";
  const lower = filename.toLowerCase().trim();
  const withoutExt = lower.replace(/\.[a-z0-9]{1,5}$/, "");
  const lastSeparator = Math.max(withoutExt.lastIndexOf("_"), withoutExt.lastIndexOf("/"));
  const stem = lastSeparator >= 0 ? withoutExt.slice(lastSeparator + 1) : withoutExt;
  // A one-character stem is a coin flip, not a corroboration.
  return stem.length >= 2 ? stem : "";
}

export function stemsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeStem(a);
  if (!left) return false;
  return left === normalizeStem(b);
}

/**
 * Which band a match falls in, or null when it is too far apart to record.
 *
 * The filename only ever helps: it can lift a 0.02-0.05 match out of Review
 * into Near, and it can never push a close match down.
 */
export function classifyBand(distance: number, stemMatch: boolean): Band | null {
  if (!Number.isFinite(distance) || distance > MAX_SCAN_DISTANCE) return null;
  if (distance <= EXACT_MAX) return "exact";
  if (distance <= NEAR_MAX) return "near";
  return stemMatch ? "near" : "review";
}
