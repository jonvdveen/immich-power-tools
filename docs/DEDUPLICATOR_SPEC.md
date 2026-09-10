# De-Duplicator — design spec

Status: **Phase 1 built and deployed to the local stack** (2026-09-09), uncommitted
and unreleased. Phases 2 and 3 not started. Supersedes
`src/pages/assets/bulk-duplicate-finder.tsx`.

## 1. What this is

One screen that handles both kinds of duplicate:

- **Same-library** — two or more copies you own, grouped by Immich's own `duplicateId`.
- **Cross-library** — a copy you own and a copy in a partner-shared library, which Immich
  will never group because `DuplicateService` computes groups strictly per owner
  (`userIds: [asset.ownerId]`) and prunes singletons via `cleanupSingletonGroups`
  before returning.

The existing Bulk Duplicate Finder stays in the nav until this is verified on real
data, then it is removed. This screen is a strict superset.

## 2. Calibration (measured, not assumed)

Sampled 1,500 of Stephanie's assets (1,474 with embeddings), nearest neighbour in
Jon's library, cosine distance over `smart_search.embedding`:

| Band | Pairs | % of sample | Filename-stem match |
|---|---|---|---|
| <= 0.005 | 313 | 21.2% | 98.1% |
| 0.005 - 0.02 | 37 | 2.5% | 91.9% |
| 0.02 - 0.05 | 66 | 4.5% | 33.3% |
| 0.05 - 0.08 | 49 | 3.3% | 6.1% |
| 0.08 - 0.15 | 330 | 22.4% | 3.3% |
| > 0.15 | 679 | 46.1% | 0.1% |

Filename stem = filename lowercased, extension stripped, everything up to the last
`_` or `/` removed. So `20240609_11.27.37_JJV02606.jpg` and `JJV02606.heic` both
reduce to `jjv02606`.

Checksum and raw filename are **useless** as duplicate signals here — only 21 of the
313 sub-0.005 pairs share either, because the overwhelming pattern is the same photo
held as JPG in one library and HEIC in the other. Stem match is the signal that works.

### Bands adopted

| Band | Rule | Auto-pick |
|---|---|---|
| **Exact** | dist <= 0.005 | Yes |
| **Near** | dist <= 0.02, or dist <= 0.05 with stem match | Yes |
| **Review** | dist <= 0.05, no stem match | No — manual only |
| (dropped) | dist > 0.05 | Not surfaced |

Cutting at 0.05 discards the 0.05-0.08 band, which is 6% corroborated — the true
positives in it are not worth the false ones. Revisit only if real usage shows misses.

### Cost

Measured **~31 ms per probe** (1,500 assets in ~46 s), not the ~17 ms estimated
earlier. A full pass over Stephanie's 103,903 assets is roughly **53 minutes**.
Extrapolating the sample, expect on the order of **22,000 exact-band pairs**.

## 3. Scan lifecycle

- Cross-library scanning is **off by default**. With it off, the screen reads Immich's
  precomputed groups only and is instant.
- Turning on partner scope reveals a **Scan now** button. Scan is resumable and
  chunked; progress is reported.
- Subsequent opens do an **incremental top-up** — only assets newer than the stored
  watermark. Index age is displayed.
- No scheduled/background job. Nothing runs unless asked.

## 4. Ranking editor

A drag-to-reorder list. Each row: on/off switch, and a direction where meaningful.

| Criterion | Directions |
|---|---|
| Resolution (pixels) | larger / smaller |
| File size (bytes) | larger / smaller |
| Has GPS | prefer with / prefer without |
| Face count | more / fewer |
| Rating | higher / lower |
| Tag count | more / fewer |
| Favourite | prefer / avoid |
| Owner | prefer mine / prefer partner's |
| Filename length | longer / shorter |
| Date | older / newer |

- **One config**, stored per account in `app.db`, used for both same-library and
  cross-library. The Owner row simply has no effect when every copy is yours.
- Final terminator remains asset id, so auto-pick always reaches a decision.
- **Hard guard, independent of the ordering:** a partner asset is not auto-picked as
  keeper if the discard carries GPS, description, tags or favourite that the keeper
  lacks — that metadata cannot be salvaged onto an asset you do not own, so keeping
  your own copy preserves it. Flagged in the UI; overridable by hand.

## 5. Dispositions

Three actions per cluster, replacing today's keep/discard binary:

1. **Discard -> Immich trash.** `force: false`, always, with no permanent-delete
   option anywhere in the screen. The old code path calls `deleteAssets` with no
   options, which defaults to `force: true` — permanent, bypassing trash. That is how
   15,463 assets were removed on 2026-09-08. Emptying trash is done in Immich.
2. **Tag.** Apply a configurable tag (default `Duplicate`) to the discards and leave
   them in place. Goes through Immich's tag API so `asset_exif.tags` and the `.xmp`
   sidecar stay consistent. No purge action in this tool — sweep them in Immich.
3. **Stack.** Same-library only. Collapses the group into one timeline entry, losing
   nothing. Disabled on cross-library clusters — you cannot stack an asset you do not
   own. Not selectable by auto-pick; it is a deliberate manual choice.

Both tag and stack clear `duplicateId` on the whole group once applied. Neither
operation clears it by itself, so without that the group returns on the next
load and the list can never be worked down.

**Skip is a fourth, non-destructive action, distinct from "Not duplicates".**
*Not duplicates* writes `duplicateId: null` to Immich — the official mechanism,
and permanent. *Skip* records the group in `dedupe_dismissals` and hides it,
writing nothing to Immich, so a group you are not ready to judge can be set
aside and restored later.

Partner assets are never deletable. Where a partner copy is the keeper, the confirm
dialog states plainly how many discards leave the only remaining copy in someone
else's library.

## 6. Metadata salvage

Before discarding, copy GPS / description / tags / favourite from the discard onto the
keeper where the keeper lacks the field. User chooses which fields participate.
Impossible when the keeper is a partner asset — hence the guard in section 4.

## 7. Dismissals

"Not duplicates" persists in `app.db` per account, keyed on the asset pair, and
survives rescans and browser changes. Without this the Review band is unusable after
one pass.

## 8. Layout

Single list of clusters. Filter chips for source (same-library / cross-library) and
band (exact / near / review). Auto-pick and the bulk bar operate on the current
filter, so "cross-library + exact" is one safe sweep and the Review band can be worked
by hand later.

## 9. app.db schema additions

    dedupe_pairs       (owner_id, asset_id, partner_asset_id, partner_owner_id,
                        distance, stem_match, band, discovered_at)
    dedupe_dismissals  (owner_id, group_key, paired_asset_id, dismissed_at)
    dedupe_scan_state  (owner_id, partner_owner_id, watermark, scanned_count,
                        last_run_at)
    dedupe_ranking     (owner_id, config, updated_at)

All four ship in migration `0008_sharp_gideon.sql`, already applied.

Correction to the earlier draft: this needs **no container stop**. `runMigrations()`
in `src/db/index.ts` runs pending migrations at boot and is idempotent. Stopping the
container is only necessary to write `app.db` externally with `sqlite3`.

Two smaller settings — the chosen disposition and the tag name — use the existing
per-account key/value endpoint (`/api/settings/kv/[key]`) rather than columns of
their own.

`dedupe_dismissals` carries a UNIQUE index on (owner, group, paired asset), but
SQLite treats NULLs as distinct, so it does **not** collapse repeated group-level
dismissals. Verified, not assumed — the handler filters already-recorded rows
itself rather than relying on the constraint.

## 10. Build order

- **Phase 1** — DONE. Screen + ranking editor + three dispositions + skip, on Immich
  groups only. No scan infrastructure.
- **Phase 2** — cross-library scan, bands, partner clusters, incremental top-up.
- **Phase 3** — metadata salvage.

## 11. Open

- Bands are calibrated on the Stephanie/Jon pair only. Other partner pairs may differ;
  worth re-measuring before trusting auto-pick on them.
- Stem normalisation is tuned to this library's naming conventions. It degrades to
  "no corroboration" rather than to false positives, but is not universal.
