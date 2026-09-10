/**
 * The tunable ranking used to auto-pick a keeper.
 *
 * Replaces the fixed chain this tool shipped with. The default order is the
 * one that was measured against this library's 12k duplicate groups — the
 * per-criterion notes record how often each one actually separates two copies,
 * because a signal that never varies is just a way to look decisive while
 * deciding nothing. The user can reorder, disable, or invert any of it.
 */

export type RankingKey =
  | "pixels" | "bytes" | "gps" | "faces" | "rating"
  | "tags" | "favorite" | "owner" | "filename" | "date";

/** "desc" is always the first-listed preference (more/larger/mine/longer). */
export type RankingDirection = "desc" | "asc";

export interface IRankingRow {
  key: RankingKey;
  enabled: boolean;
  direction: RankingDirection;
}

/**
 * How much weight a decision by this criterion carries.
 *  - substantive: a real difference in the image or its metadata.
 *  - preference:  a choice about whose copy survives, not about quality.
 *  - cosmetic:    carries no claim at all; exists only so the chain terminates.
 * A group settled by a cosmetic row is flagged for review unless the files are
 * byte-identical, in which case there is genuinely nothing to look at.
 */
export type RankingKind = "substantive" | "preference" | "cosmetic";

export interface IRankingCriterion {
  key: RankingKey;
  label: string;
  kind: RankingKind;
  /** Shown under the label — what this criterion is and how often it decides. */
  hint: string;
  /** Labels for the two directions, in [desc, asc] order. */
  directions: [string, string];
}

export const RANKING_CRITERIA: Record<RankingKey, IRankingCriterion> = {
  pixels: {
    key: "pixels", label: "Resolution", kind: "substantive",
    hint: "Separates 24% of groups. Ahead of file size by default: the two disagree in 8% of groups, and a larger file at lower resolution is a re-encode of a downscaled image.",
    directions: ["Prefer higher", "Prefer lower"],
  },
  bytes: {
    key: "bytes", label: "File size", kind: "substantive",
    hint: "Separates ~95% of groups — the workhorse. At equal resolution, the bigger file is the less compressed one. Invert this to reclaim the most space.",
    directions: ["Prefer larger", "Prefer smaller"],
  },
  gps: {
    key: "gps", label: "Has GPS", kind: "substantive",
    hint: "Separates 11% of groups. Location you can't recover once the copy holding it is gone.",
    directions: ["Prefer with GPS", "Prefer without"],
  },
  faces: {
    key: "faces", label: "Face count", kind: "substantive",
    hint: "Separates 2% of groups. More detected faces usually means the copy Immich has finished processing.",
    directions: ["Prefer more", "Prefer fewer"],
  },
  rating: {
    key: "rating", label: "Rating", kind: "substantive",
    hint: "Separates 3% of groups. A star rating you set by hand is worth keeping.",
    directions: ["Prefer higher", "Prefer lower"],
  },
  tags: {
    key: "tags", label: "Tag count", kind: "substantive",
    hint: "Separates 24% of groups. Tags live in the sidecar and are lost with the asset.",
    directions: ["Prefer more", "Prefer fewer"],
  },
  favorite: {
    key: "favorite", label: "Favourite", kind: "substantive",
    hint: "Separates 6% of groups.",
    directions: ["Prefer favourited", "Prefer not favourited"],
  },
  owner: {
    key: "owner", label: "Owner", kind: "preference",
    hint: "Only has an effect on cross-library matches. Preferring a partner's copy discards every copy you own in that group, leaving you relying on their library.",
    directions: ["Prefer my copy", "Prefer partner's copy"],
  },
  filename: {
    key: "filename", label: "Filename length", kind: "cosmetic",
    hint: "Says nothing about quality. A longer name is usually the more organised one — \"20190615_12.45.29_JJV01165.jpg\" over a bare \"JJV01165.JPG\".",
    directions: ["Prefer longer", "Prefer shorter"],
  },
  date: {
    key: "date", label: "Date added", kind: "cosmetic",
    hint: "When the asset entered the library, not when it was shot. Keeping the oldest means existing references keep pointing at it.",
    directions: ["Prefer oldest", "Prefer newest"],
  },
};

/** Evaluation order when nothing has been configured. */
export const DEFAULT_RANKING: IRankingRow[] = [
  { key: "pixels", enabled: true, direction: "desc" },
  { key: "bytes", enabled: true, direction: "desc" },
  { key: "gps", enabled: true, direction: "desc" },
  { key: "faces", enabled: true, direction: "desc" },
  { key: "rating", enabled: true, direction: "desc" },
  { key: "tags", enabled: true, direction: "desc" },
  { key: "favorite", enabled: true, direction: "desc" },
  // Below the quality signals by default: whose copy it is shouldn't override
  // a genuinely better image, but it should beat a coin flip on the cosmetics.
  { key: "owner", enabled: true, direction: "desc" },
  { key: "filename", enabled: true, direction: "desc" },
  { key: "date", enabled: true, direction: "desc" },
];

/**
 * Coerce whatever came out of the database into a usable, complete ranking.
 * A stored config written before a criterion existed is not an error — the
 * missing rows are appended in their default position rather than rejected.
 */
export function normalizeRanking(input: unknown): IRankingRow[] {
  const rows: IRankingRow[] = [];
  const seen = new Set<RankingKey>();

  if (Array.isArray(input)) {
    for (const raw of input) {
      const key = (raw as any)?.key as RankingKey;
      if (!key || !(key in RANKING_CRITERIA) || seen.has(key)) continue;
      seen.add(key);
      rows.push({
        key,
        enabled: (raw as any).enabled !== false,
        direction: (raw as any).direction === "asc" ? "asc" : "desc",
      });
    }
  }

  for (const fallback of DEFAULT_RANKING) {
    if (!seen.has(fallback.key)) rows.push({ ...fallback });
  }
  return rows;
}

export function isDefaultRanking(rows: IRankingRow[]): boolean {
  return JSON.stringify(rows) === JSON.stringify(DEFAULT_RANKING);
}
