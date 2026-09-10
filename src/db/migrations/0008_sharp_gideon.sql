CREATE TABLE `dedupe_dismissals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`group_key` text NOT NULL,
	`paired_asset_id` text,
	`dismissed_at` integer
);
--> statement-breakpoint
CREATE INDEX `dedupe_dismissals_owner_idx` ON `dedupe_dismissals` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `dedupe_dismissals_owner_id_group_key_paired_asset_id_unique` ON `dedupe_dismissals` (`owner_id`,`group_key`,`paired_asset_id`);--> statement-breakpoint
CREATE TABLE `dedupe_pairs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`partner_asset_id` text NOT NULL,
	`partner_owner_id` text NOT NULL,
	`distance` real NOT NULL,
	`stem_match` integer DEFAULT false NOT NULL,
	`band` text NOT NULL,
	`discovered_at` integer
);
--> statement-breakpoint
CREATE INDEX `dedupe_pairs_owner_band_idx` ON `dedupe_pairs` (`owner_id`,`band`);--> statement-breakpoint
CREATE UNIQUE INDEX `dedupe_pairs_owner_id_asset_id_partner_asset_id_unique` ON `dedupe_pairs` (`owner_id`,`asset_id`,`partner_asset_id`);--> statement-breakpoint
CREATE TABLE `dedupe_ranking` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`config` text NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `dedupe_scan_state` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`partner_owner_id` text NOT NULL,
	`watermark` integer,
	`scanned_count` integer DEFAULT 0 NOT NULL,
	`last_run_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dedupe_scan_state_owner_id_partner_owner_id_unique` ON `dedupe_scan_state` (`owner_id`,`partner_owner_id`);