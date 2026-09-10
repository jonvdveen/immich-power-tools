/**
 * What happens to the copies you didn't keep.
 *
 * The old Bulk Duplicate Finder had one outcome, and it was the most
 * destructive one available: `deleteAssets` defaults to `force: true`, which
 * bypasses Immich's trash entirely. Nothing in this module ever does that.
 */

export type Disposition = "trash" | "tag" | "stack";

export const DEFAULT_TAG_NAME = "Duplicate";

export interface IDispositionInfo {
  value: Disposition;
  label: string;
  /** One line, shown under the selector. */
  summary: string;
  /** Whether it can act on a group that includes a partner's copy. */
  crossLibrary: boolean;
  destructive: boolean;
}

export const DISPOSITIONS: Record<Disposition, IDispositionInfo> = {
  trash: {
    value: "trash",
    label: "Move to trash",
    summary:
      "Discards go to Immich's trash, recoverable until you empty it there. This tool never deletes permanently.",
    crossLibrary: true,
    destructive: true,
  },
  tag: {
    value: "tag",
    label: "Tag only",
    summary:
      "Discards stay where they are and get a tag, so you can review them in Immich and delete them on your own terms.",
    crossLibrary: true,
    destructive: false,
  },
  stack: {
    value: "stack",
    label: "Stack",
    summary:
      "Collapses the group into one timeline entry behind the keeper. Nothing is deleted and nothing is tagged.",
    // Immich cannot stack an asset you do not own, so a group whose keeper or
    // discards include a partner's copy is skipped rather than half-applied.
    crossLibrary: false,
    destructive: false,
  },
};

/** Settings keys, stored per account via /api/settings/kv/[key]. */
export const DISPOSITION_SETTING_KEY = "dedupe_disposition";
export const TAG_NAME_SETTING_KEY = "dedupe_tag_name";

export function isDisposition(value: unknown): value is Disposition {
  return value === "trash" || value === "tag" || value === "stack";
}
