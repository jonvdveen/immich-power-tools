import { sqliteTable, text, integer, real, unique, index } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";

/**
 * De-Duplicator state.
 *
 * All four tables land in one migration even though only two are read in
 * Phase 1 — the cross-library scan (Phase 2) writes the other two, and adding
 * them together avoids a second migration against a live app.db.
 */

/**
 * The user's ranking configuration: which criteria decide a keeper, in what
 * order, and which direction each one prefers. One row per account; the whole
 * ordered list is stored as JSON because it is always read and written whole.
 */
export const dedupeRanking = sqliteTable("dedupe_ranking", {
  ownerId: text("owner_id").primaryKey(),
  /** JSON array of { key, enabled, direction } — see lib/duplicates/ranking.ts. */
  config: text("config").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

/**
 * "These are not duplicates." Persisted server-side rather than per-device:
 * the loose band is worked through over weeks, and a dismissal that doesn't
 * survive a browser change makes the band unusable on the second pass.
 *
 * Two shapes share this table:
 *  - a whole Immich group  -> groupKey = duplicateId, pairedAssetId = null
 *  - a cross-library pair  -> groupKey = your asset id, pairedAssetId = theirs
 */
export const dedupeDismissals = sqliteTable("dedupe_dismissals", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  ownerId: text("owner_id").notNull(),
  groupKey: text("group_key").notNull(),
  pairedAssetId: text("paired_asset_id"),
  dismissedAt: integer("dismissed_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (t) => [
  // Dismissing twice is a no-op rather than a duplicate row. SQLite treats
  // NULLs as distinct in a UNIQUE index, so group-level dismissals are
  // de-duplicated by the insert guard in the handler instead.
  unique().on(t.ownerId, t.groupKey, t.pairedAssetId),
  index("dedupe_dismissals_owner_idx").on(t.ownerId),
]);

/**
 * Cross-library pair index, written by the Phase 2 scan. Unread in Phase 1.
 * `distance` is CLIP cosine distance; `stemMatch` records whether the
 * normalised filenames agree, which is an independent corroboration of the
 * distance and is what separates a real match from a coincidence in the
 * 0.02-0.05 band.
 */
export const dedupePairs = sqliteTable("dedupe_pairs", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  ownerId: text("owner_id").notNull(),
  assetId: text("asset_id").notNull(),
  partnerAssetId: text("partner_asset_id").notNull(),
  partnerOwnerId: text("partner_owner_id").notNull(),
  distance: real("distance").notNull(),
  stemMatch: integer("stem_match", { mode: "boolean" }).notNull().default(false),
  /** "exact" | "near" | "review" — derived at scan time, see lib/duplicates/bands.ts. */
  band: text("band").notNull(),
  discoveredAt: integer("discovered_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (t) => [
  unique().on(t.ownerId, t.assetId, t.partnerAssetId),
  index("dedupe_pairs_owner_band_idx").on(t.ownerId, t.band),
]);

/**
 * Where the incremental scan got to, per (you, partner) pair. The watermark is
 * the highest asset createdAt already probed, so a top-up only walks assets
 * added since.
 *
 * `createdAt` alone is not a safe cursor: Immich stamps it from the
 * transaction clock, so a bulk import can give hundreds of assets the same
 * value. Resuming on `> watermark` would step over the rest of a tie, and
 * `>= watermark` would loop on it forever once a tie ran longer than one
 * chunk. The asset id breaks that tie, and (createdAt, id) is unique.
 */
export const dedupeScanState = sqliteTable("dedupe_scan_state", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  ownerId: text("owner_id").notNull(),
  partnerOwnerId: text("partner_owner_id").notNull(),
  watermark: integer("watermark", { mode: "timestamp" }),
  /** Second half of the resume cursor — see the note above. */
  cursorAssetId: text("cursor_asset_id"),
  scannedCount: integer("scanned_count").notNull().default(0),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
}, (t) => [
  unique().on(t.ownerId, t.partnerOwnerId),
]);
