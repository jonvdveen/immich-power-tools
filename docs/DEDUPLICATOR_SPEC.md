# De-Duplicator — design spec

Status: **Phase 1 released in v0.35.0. Phase 2 built and deployed to the local
stack (2026-09-10), uncommitted and unreleased.** Phase 3 not started.
Superseded and removed `src/pages/assets/bulk-duplicate-finder.tsx`.

## 1. What this is

One screen that handles both kinds of duplicate:

- **Same-library** — two or more copies you own, grouped by Immich's own `duplicateId`.
- **Cross-library** — a copy you own and a copy in a partner-shared library, which Immich
  will never group because `DuplicateService` computes groups strictly per owner
  (`userIds: [asset.ownerId]`) and prunes singletons via `cleanupSingletonGroups`
  before returning.

The Bulk Duplicate Finder was removed in v0.35.0. This screen is a strict
superset of it.

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

Re-measured when Phase 2 was built, because the number drives the whole design.
Three disjoint 200-asset slices, cold, one run each: 3.99 s, 1.90 s, 1.82 s —
**~13 ms per asset** with three neighbours per probe. A full pass over
Stephanie's **103,206 probeable assets is roughly 22 minutes**, not the 53
recorded earlier. The 31 ms figure came from a differently-shaped sample; 13 ms
is the one to trust.

Beware measuring this warm: repeating the same 200-asset slice drops to ~2 ms
per asset, which is a cache artefact and not what a full sequential pass costs.

Asking the index for three neighbours instead of one costs ~1 ms per asset and
occasionally finds a match the nearest neighbour alone misses, so `LIMIT 3` it is.

## 3. Scan lifecycle — as built

- Cross-library scanning is **off by default**, behind the same
  "Compare against partner photos" switch as the Phase 1 overlay. With it off the
  screen reads Immich's precomputed groups only and is instant.
- **Chunked over HTTP.** `POST /api/dedupe/scan` probes 200 assets (2–4 s) and
  returns; the browser loops. No request is held open for the length of a scan.
- **Resumable.** The cursor lives in `app.db`, not the browser, so closing the tab
  costs only the chunk in flight. The button reads *Scan now* / *Continue scan* /
  *Check for new photos* depending on what the index already holds.
- **Incremental top-up.** Once a pass completes the cursor sits at the newest
  asset and later runs walk only what has been added since.
- **One partner at a time.** Each `(you, partner)` pair has its own cursor. Adding
  a partner therefore costs one pass for that partner rather than re-scanning
  everyone. Only Stephanie has an incoming partner share on this stack
  (`Jonathan → Stephanie`), so the multi-partner path is built but unexercised.
- No scheduler. Nothing runs unless asked.

### The resume cursor

`(createdAt, id)`, not `createdAt` alone. Immich stamps `createdAt` from the
transaction clock, so a bulk import can hand several assets the same value;
resuming on `> watermark` would step over the rest of a tie. Measured worst case
on this library: **seven** assets share a millisecond, comfortably inside a chunk.
A stall guard reports rather than spins if that ever exceeds a chunk.

The watermark column is a millisecond timestamp and Postgres keeps microseconds,
so the comparison truncates both sides. That can only re-probe the tail of one
millisecond, never skip past it, and re-probing is free — the write is an upsert
(verified: re-running an identical chunk leaves the row count unchanged).

The predicate carries a redundant `createdAt >= watermark` alongside the row
comparison. `date_trunc` is not sargable, so without it the planner walks
`asset_createdAt_idx` from the beginning of time — measured 218,000 discarded
rows per chunk a few months in, and growing. With it, 36,000 and shrinking.
Six times fewer buffers.

### Known gap

The probe runs *your* library against *theirs*. A partner adding a copy of a
photo you have held for years is therefore found by a full re-scan, not a top-up.
Said plainly in the UI rather than left to be discovered.

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

## 8. Layout — as built

A **switch**, not a filter. Same library / Cross-library, one list at a time, with
band chips (Exact / Near / Review) appearing only in the cross-library view.

The original plan was a single merged list with source chips. Two things argued
against it. The chips were removed in Phase 1 precisely because three labels over
one set of groups meant nothing, and re-adding them over a genuinely mixed list
would put two different questions in one scroll: a same-library group asks *which
of your copies to keep*, a cross-library cluster asks *which library keeps the
photo at all*. The controls only appear once an index exists, so nothing is shown
that cannot yet answer for itself.

A cross-library cluster is rendered by the **same** component as an Immich group —
one asset of yours with the partner's copies attached as matches, under a
synthetic key `xlib:<your asset id>`. That reuses the cards, the selection model,
the metadata guard and the whole apply path without a second code path. What
differs is only the wording, which is derived from `record.source`.

### Paging

`GET /api/dedupe/pairs` returns at most 2,000 clusters of one band, ordered by
distance so the most certain come first. Twenty thousand clusters of thumbnails is
not a screen anyone can use. The list drains on its own — resolved and dismissed
clusters are filtered out on the next load — so "showing 2,000 of 21,843" becomes
the next 2,000 rather than a dead end.

Three things are filtered out at read time, all staleness rather than error:
assets Immich has since grouped itself (they are in the other list already, with
the same partner overlay), anything trashed or deleted since the scan, and
dismissed pairs. The index rows themselves are left alone, so restoring an asset
from Immich's trash brings its match back rather than needing a rescan.

### Auto-pick in the cross-library view

Excluded unless "let a partner's copy win" is on: the only copy you own in such a
cluster is your own, so with partner copies barred from winning there is nothing
to choose between, and ticking your own copy would mark thousands of clusters
"decided" while deciding nothing. Review-band clusters are never auto-picked —
that is what the band is for.

## 9. app.db schema additions

    dedupe_pairs       (owner_id, asset_id, partner_asset_id, partner_owner_id,
                        distance, stem_match, band, discovered_at)
    dedupe_dismissals  (owner_id, group_key, paired_asset_id, dismissed_at)
    dedupe_scan_state  (owner_id, partner_owner_id, watermark, scanned_count,
                        last_run_at)
    dedupe_ranking     (owner_id, config, updated_at)

All four shipped in migration `0008_sharp_gideon.sql`. Phase 2 added one column
in `0009_old_stardust.sql` — `dedupe_scan_state.cursor_asset_id`, the second half
of the resume cursor (see section 3). Applied at container boot, no stop needed;
confirmed on the live stack.

`dedupe_dismissals` now holds two kinds of row and they are cleared separately.
"Restore all skipped groups" must not also throw away every "not the same photo"
verdict — one is a shelf, the other is a judgement — so the DELETE endpoint takes
`scope: "all" | "groups" | "pairs"` and the Options panel offers each on its own.

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

- **Phase 1** — DONE, released v0.35.0. Screen + ranking editor + three
  dispositions + skip, on Immich groups only. No scan infrastructure.
- **Phase 2** — DONE, unreleased. Cross-library scan, bands, partner clusters,
  incremental top-up, per-pair dismissals, and the Owner-criterion warning that
  Phase 2 made urgent (see below).
- **Phase 3** — metadata salvage. Not started.

### The Owner criterion, and why Phase 2 needed a warning

Ranking Owner as "prefer partner's copy" was close to harmless in Phase 1: it
could only affect the handful of Immich groups that happened to have a partner
match overlaid on them. The cross-library scan changes what it costs. It now
applies to every photo the two libraries share, and in each of those clusters
your copy is the only one you own — so auto-pick would mark every single one for
the trash, limited only by the metadata guard.

That is a legitimate choice for a household that wants one canonical library. It
is not something to find out afterwards. `ownerOutranksQuality()` detects the
configuration — Owner enabled, set to prefer the partner, ranked above at least
one enabled substantive criterion — and the Options panel says plainly what will
happen, immediately above the auto-pick button.

Warned rather than refused. The user set it deliberately, trash is recoverable,
and the confirm dialog states the partner-keeper count. Overriding a deliberate
configuration would be the tool deciding it knows better.

## 11. Open

- Bands are calibrated on the Stephanie/Jon pair only. Other partner pairs may differ;
  worth re-measuring before trusting auto-pick on them.
- Stem normalisation is tuned to this library's naming conventions. It degrades to
  "no corroboration" rather than to false positives, but is not universal.
- **Two accounts running this against each other.** The quality criteria are
  symmetric, so both accounts converge on the same keeper and the result is
  consistent. The Owner criterion is the asymmetric one — if both sides set
  "prefer partner's copy", both sides trash. Recoverable from trash, and each side
  confirms, but worth a thought before both partners run it.
- **The same-library overlay still probes live** (~30 ms per group on load) even
  though the index now covers those assets too. Serving it from the index would
  make that instant. Deliberately not done in Phase 2 — one change at a time.
- Tag and stack have still never been applied to real assets.
