# Backlog — immich-power-tools (local-stack fork)

Short ids, removed when resolved (not archived). See CLAUDE.md-equivalent
context in project memory (`immich-power-tools-cull.md`,
`face-review-powertools-integration.md`) for the "why" behind each area.

## Upstream PRs (all submitted 2026-07-12 — awaiting review)

Everything the fork built beyond the already-merged workflow PRs (#295,
#297–301) is now open against upstream's `prerelease` branch, one PR per
module (Face Review split into four per `FACE_REVIEW_PR_NOTES.md`). Fork-only
files (README banner, GETTING_STARTED, CHANGELOG, BACKLOG, launch.json) were
excluded. Each branch was assembled off current `prerelease`, `tsc`-clean;
upstream CI green on the first ones.

- **#304** `.dockerignore` — exclude `.env` from the build context (security).
- **#305** Rate & Cull.
- **#306** Tag Manager.
- **#307** Maps: Leaflet → MapLibre migration (bun.lock regenerated).
- **#308** GPS Manager (stacked on #307).
- **#309/#310/#311/#312** Face Review — engine / read API / write API / UI
  (a linear stack, review in order).

Since 2026-07-17 the rest of the fork is also upstream: **#315** (workflow
`workflow_processed_assets` growth), **#316** (geo-radius true distance —
superseded by #322), **#317** (workflow `result` storage), **#318** (thumbnail
proxy cache headers), **#319** (Manage People hide-hidden default), **#320**
(FloatingBar centering), **#321** (album picker alpha sort), **#322** (workflow
ALL/ANY + Album condition + node delete + geo inside/outside). The fork's base
was resynced onto current `prerelease` on 2026-07-17 (merge `ea75000`, adopted
onto `local-stack`).

## QUEUED upstream follow-ups (gated on other PRs merging)

Two pieces are prepared but **not yet submitted** because they depend on
still-open PRs landing in `prerelease` first. Submit each when its gate opens
(cherry-pick the ref onto a fresh branch off current `prerelease`, `tsc`-clean,
push, open PR):

- **Geo-Radius point picker** — ref `dcd2353` (place-search / paste-a-pair
  input for the geo condition, replacing the raw lat/lng boxes). **Gated on
  BOTH #308 and #322**: it imports `@/components/location-manager/LocationSearchBox`
  and `@/lib/location-manager/coordinates` (arrive with **#308** GPS Manager),
  and it edits the geo condition UI that **#322** introduces. Cherry-picking it
  before #308 fails `tsc` with 3 module-not-found/any errors (verified
  2026-07-17).
- **Workflow config-panel sizing** — the `h-8`→`h-9` changes on
  `ActionConfig.tsx`, `TriggerConfig.tsx`, `[id].tsx` (from `9ff8544`, the
  v0.31.0 sweep). prerelease still has `h-8` there (8 occurrences). **Gated on
  #322 (+#317)**, not #308 — those PRs touch `[id].tsx` (node delete /
  result-count), so wait for them to avoid a conflict, then apply the mechanical
  `h-8`→`h-9` (protecting `h-8 w-8`) to the three files.

A scheduled watcher (Claude routine) polls the gate PRs and submits each
follow-up when unblocked; delete this note once both are open.

Note upstream tracks a stale `package-lock.json` (they build with bun); left
untouched.

## Fork direction (decided 2026-09-10, not yet started)

Upstream's developer has gone dark, so this stops being a fork that tracks
upstream and becomes its own project under a new name. Nothing has been done
yet. When it happens, the things that will need touching: the repo name and
`package.json`, the README/GETTING_STARTED banners that currently point at
upstream, the GHCR image path in `release.yml` and the compose file, the
`main` branch (today a clean upstream mirror kept for merges and PRs — that
reason disappears), and the still-open upstream PRs #304–#312 etc. listed
above, which would become moot.

## Immich 3.2.0 upgrade — face schema break (fixed 2026-09-12)

Immich auto-updated to **3.2.0** (the compose file tracks `:release`) and
restructured face recognition. Both face modules — **Manage People** (`/`) and
**Face Review** (`/face-review`) — died with
`column asset_face.personId does not exist`. Albums, Rewind, share links and the
workflow person conditions were hit too; nobody had noticed those yet.

What changed in Immich:

- Face clusters moved into a new `person_group` table. `asset_face."personId"`
  became `asset_face."personGroupId"`.
- **`person` lost its `id` column entirely.** A `person` row is now one owner's
  *naming* of a person group, keyed `(ownerId, personGroupId)`. Two users can
  name the same cluster differently — this is the groundwork for face
  recognition across partner-shared libraries.
- New `cluster_group`, one per user today (`user."clusterGroupId"`), so person
  groups are not yet shared between accounts.

The REST API did **not** change: `PersonResponseDto.id` and
`AssetFaceUpdateItem.personId` are unchanged, and that `id` *is* the
`personGroupId`. So the fix lives entirely in the ORM mapping and raw SQL, and
the app keeps using Immich's own naming.

Three things a plain column rename would have got wrong — all found by running
the queries against the live DB rather than by reading them:

1. **`GROUP BY p.id` stopped being legal.** Postgres only lets you select
   ungrouped columns when the GROUP BY covers a primary key. The PK is now
   `(ownerId, personGroupId)`, so every grouped person query needs both halves.
   Five places (one raw, four drizzle `.groupBy`).
2. **`deleteEmptyPeople` would have deleted other users' rows.** It matched on
   the group id alone, which used to be globally unique and no longer is. The
   outer `DELETE` now filters `ownerId` as well as the inner `SELECT`.
3. **Person joins need owner scoping.** `JOIN person p ON p."personGroupId" =
   af."personGroupId"` matches every user who named that cluster. Added
   `AND p."ownerId" = ...` in the face-review joins and the workflow
   `person_unnamed` condition (which meant threading `ownerId` into
   `buildSingleCondition`).

Verified: 18 of the app's own Face Review functions run against the live
database (all pass); drizzle proven to emit `"person"."personGroupId"`; the
Manage People query returns real counts and its ids resolve to real
`person_group` rows; the app's declared schema now diffs clean against Immich
3.2.0.

- **FACE-1 — latent, not live: unscoped person joins elsewhere.** The read-only
  drizzle joins in `albums/list.ts`, `albums/[id]/people.ts`, `rewind/stats.ts`,
  `share-link/[token]/people.ts`, `people/[id]/similar-faces.ts` and
  `workflow/actionExecutor.ts` still join person without an owner filter. Today
  every user has their own `cluster_group` and no person group has two owners,
  so each join matches exactly one row and results are correct. If Immich ever
  shares cluster groups between partners — which is plainly what the redesign is
  for — these will double-count or read a partner's name. Fix them then, or
  pre-emptively.
- **FACE-3 — the app pins nothing.** `immich-server:release` will do this again.
  Worth a note in POWER-TOOLS.md that a major Immich bump can break the direct-SQL
  modules, and that `information_schema` diffing (the script used here) finds it
  in seconds.

## De-Duplicator (`/assets/de-duplicator`) — supersedes Bulk Duplicate Finder

**Phase 1 released in v0.35.0 (2026-09-10). Phase 2 built the same day,
deployed to the local stack, not yet released.** Spec — including the measured
calibration behind the confidence bands and the cost figures behind the scan
design — lives in `docs/DEDUPLICATOR_SPEC.md`.

Why the new screen exists: the old page could only permanently delete, ranked
keepers on a chain hardcoded in the source, and had no way to act on a photo
already held in a partner's library. Phase 1 fixed the first two; Phase 2 adds
the third.

- Bulk Duplicate Finder removed entirely 2026-09-10 (was DEDUP-3). Page, nav
  entry, and the three components only it used (`AlbumFilterDropdown`,
  `DuplicateOptionsMenu`, `BulkActionBar` — the last already orphaned) are gone,
  along with the legacy no-disposition branch in `DuplicateAssetRecord`.
- **Trash disposition proven in the wild 2026-09-10 05:19 UTC**: a full run on
  Stephanie's account cleared 152 keepers and trashed 415 discards in ~6
  seconds, all `status = trashed` (recoverable), nothing permanently deleted.
  270 groups → 0. Tag and stack are still unexercised against real assets.
- **DEDUP-4 — Phase 2 done** (see below); **Phase 3** (metadata salvage) not
  started. Phase 2 needed one extra column beyond the four tables in
  `0008_sharp_gideon.sql` — see `0009_old_stardust.sql`.

Implementation notes worth keeping:

- **Trash, never permanent.** `deleteAssets(ids, { force: false })`. This closes
  the "worth revisiting" note under *Cross-module review* above: the handler's
  default is still `force: true` and the old page relied on it, which
  contradicted GETTING_STARTED.md's trash-only promise. Measured consequence:
  the ~15,463 assets removed via the old page on 2026-09-08 bypassed trash.
- **Three dispositions**: trash / tag (configurable name, default `Duplicate`,
  via Immich's `PUT /tags` upsert + `PUT /tags/assets`) / stack (`POST /stacks`,
  first id is the primary, min 2, own assets only). `POST /tags` was NOT used —
  it 400s on an existing name, the common case after the first run.
- **Tag and stack both clear `duplicateId` on the whole group afterwards.**
  Neither operation clears it on its own, so without this the group returns on
  the next load and the list can never be worked down.
- **Skip vs Not duplicates** are deliberately different. *Not duplicates* writes
  `duplicateId: null` to Immich (official mechanism, permanent). *Skip* hides the
  group in `dedupe_dismissals` only — reversible, per-account, nothing written to
  Immich. Needed because a 12k-group backlog is worked over weeks.
- **Ranking is user-tunable** (`src/lib/duplicates/ranking.ts`): drag-reorder,
  per-row enable, per-row direction, stored per account in `dedupe_ranking`.
  Criteria are tagged quality / preference / tiebreak, and a group settled only
  by a tiebreak is flagged for review unless the files are byte-identical.
- **Partner metadata guard** is independent of where `Owner` sits in the order:
  a partner's copy is never auto-picked as keeper when your copy carries GPS,
  description, tags or favourite that theirs lacks, because that metadata cannot
  be written to an asset you do not own.
- **Migrations auto-run at boot** via `runMigrations()` in `src/db/index.ts` —
  the container does NOT need stopping for a schema change. (Stopping it is only
  needed to write `app.db` externally with `sqlite3`.)
- **Phase 2 notes.** The scan probes *your* library against *theirs*, 200 assets
  per HTTP call, ~13 ms per asset measured cold (not the 31 ms first recorded —
  and beware measuring warm, which reports ~2 ms and is a cache artefact). Resume
  cursor is `(createdAt, id)`, because `createdAt` alone is not unique: Immich
  stamps it from the transaction clock. A redundant sargable `createdAt >=`
  alongside the row comparison cut the per-chunk index walk by 6x. A
  cross-library cluster reuses the same record component under a synthetic
  `xlib:<asset id>` key, so there is no second rendering path. Two drizzle
  gotchas cost real time and are worth remembering: a bare JS array in a `sql`
  template expands to a **row constructor** `($1,$2)`, not an array — use
  `sql.param(ids)` for `= ANY(...)`; and the shipped `dedupe_pairs` upsert was
  proven idempotent by re-running an identical chunk, not assumed.
- **Tests**: `local-testing/dedupe/ranking.test.ts` (21 assertions) and
  `local-testing/dedupe/bands.test.ts` (30 assertions, Phase 2 — band
  boundaries, stem normalisation, and the Owner warning). No test runner in the
  repo — each header has the compile-and-run command. A separate
  throwaway-copy integration run confirmed the drizzle layer round-trips and
  that SQLite's UNIQUE index does **not** collapse rows with a NULL
  `paired_asset_id`, which is why the dismissals handler filters existing rows
  by hand instead of relying on the constraint.
- **First visual pass done 2026-09-09** against the real library (270 groups,
  Stephanie's account, via `https://powertools.jvsd4ever.win`). Four defects
  found and fixed, all verified live; see the follow-up commit. Still NOT
  exercised for real: tag and stack have never been applied to actual assets,
  and auto-pick has not been run at scale on this screen.
- Toolbar settled 2026-09-09. The filter bar's search box, Albums dropdown and
  All/Same-library/Cross-library chips were removed (user: "I'm failing to
  understand the utility" — correct; the source chips could only show the same
  groups under three labels until Phase 2 exists, and filtering a duplicate list
  by name or album isn't how the work gets done). Move albums then moved into
  Options beside the disposition it modifies, and every remaining control
  (Select to, the disposition button, Options) moved out of the page header onto
  the group-count bar, leaving only Refresh in the header. The disposition
  indicator is now a real button that opens Options — it read as a disabled
  button when it was inert.
- **DEDUP-5 — RESOLVED in Phase 2 (2026-09-10), by warning rather than refusal.**
  `ownerOutranksQuality()` in `src/lib/duplicates/ranking.ts` detects the
  combination (Owner enabled, preferring the partner, ranked above an enabled
  substantive criterion) and Options shows a red callout directly above the
  auto-pick button saying it will mark every cross-library copy of yours for
  the trash. Not refused: the setting is deliberate, trash is recoverable, and
  the confirm dialog states the partner-keeper count. Stephanie's saved config
  still has Owner at position 1 — she will now see the warning the first time
  she opens Options with partner comparison on.

- **DEDUP-6 — the same-library overlay still probes live.** Now that the
  cross-library index covers those assets too, the ~30 ms-per-group probe on
  every page load could be served from `dedupe_pairs` instead. Left alone in
  Phase 2 on purpose (one change at a time). Worth doing before the index is
  taken for granted anywhere else.

- **DEDUP-7 — the multi-partner scan path is built but unexercised.** Only
  `Jonathan → Stephanie` exists on this stack, so the per-partner cursor logic
  in `src/pages/api/dedupe/scan.ts` has only ever run with one partner. Check it
  before relying on it if another share is added.

- **DEDUP-9 — discard mode marks untouched same-library groups as resolved.**
  `handleApplyDiscards` treats every unticked asset in every *visible* group as
  "reviewed and kept" and clears its `duplicateId` — so trashing five photos also
  resolves the other 265 groups on screen. That may be the intent (discard mode
  as "I have been through the whole list"), or it may be a Phase 1 slip; it
  predates Phase 2 and shipped in v0.35.0, so it was left alone. Phase 2 scoped
  it out of the cross-library view only, where the write provably does nothing.
  Decide which reading is right and make the button say so.

- **DEDUP-8 — both partners running cross-library dedup at once.** The quality
  criteria are symmetric so both accounts pick the same keeper and agree. The
  Owner criterion is not: if both sides set "prefer partner's copy", both sides
  trash their own copy. Recoverable, and each side confirms, but there is no
  cross-account interlock and there probably cannot be one.

- **Phase 2 released in v0.36.0 (2026-09-12).** Cross-library scan
  (`/api/dedupe/scan`), the cluster read-back (`/api/dedupe/pairs`), confidence
  bands, a My library / Cross-library switch, per-pair "not the same photo"
  verdicts, and the DEDUP-5 warning. Exercised for real on Stephanie's account
  (Jonathan has no incoming partner share, so his cannot run it at all): a full
  pass over 104,337 assets against Jonathan's library, indexing 21,091 exact,
  4,442 near and 5,472 review pairs. Nothing has been *applied* from the
  cross-library list yet — the list itself is built and browsed.

## Rate & Cull (photo rating/culling tool, `/assets/cull`; renamed from "Cull Photos" in v0.24.3)

- **CULL-4**: Upstream PR submitted 2026-07-12 as #305 (was deferred until the
  user was "very very confident and satisfied"). Resolve/remove once merged.
- Released in v0.24.0 (2026-07-06): favorites (F/.), Reviewed workflow (R +
  filter defaulting to Unreviewed), EXIF panel (I), open-in-Immich button,
  "?" help guide. Flag tags live at
  `ImmichPowerTools_CullandRate/IPT_{Picked,Rejected,Reviewed}` — renamed
  from flat "Picked"/"Rejected", which had zero tagged assets at rename time
  (verified); the old flat tags are harmless orphans, deletable via Tag
  Manager.
- Released in v0.24.1 (2026-07-07): Pick/Reject/Reviewed all shared the same
  icon shape (Pick and Reject were both a plain `Flag`, just color-coded;
  Reviewed was the same `CheckCircle2` glyph Pick later became) — user
  flagged this as a real mistake risk ("lost photos") on Reject
  specifically, then asked for the full set to be shape-distinct. Now:
  Pick = `CheckCircle2` (circled check), Reject = `XCircle` (circled X,
  matches its existing `(X)` keybinding), Reviewed = `Glasses`. Unflag keeps
  the plain `Flag` icon — no longer ambiguous with either since Pick moved
  off it. User confirmed live on `:8001` before release. Reminder for next
  time: icon/code changes only take effect on `:8001` after
  `docker build -t immich-power-tools:local-stack .` +
  `docker compose up -d power-tools` from `~/Docker/immich-app` (project
  dirs got reorganized under `~/Docker/` and `~/scripts/` at some point —
  `~/immich-power-tools` and `~/immich-app` no longer exist) — editing the
  repo alone doesn't touch the running container.
- Released in v0.24.3 (2026-07-07): renamed "Cull Photos" → "Rate & Cull"
  (sidebar + page header + help dialog) — user's friend didn't recognize
  "cull". Route (`/assets/cull`) and the Immich tag namespace
  (`ImmichPowerTools_CullandRate`) both left untouched on purpose — renaming
  either would orphan/break existing data or bookmarks, unlike a display
  string. Pick/Reject now toggle on keypress in the viewer (press again to
  unflag), matching how Reviewed/Favorite/rating already worked — only
  Pick/Reject were inconsistent, so this is a narrower fix than it sounds.
  Also added user-remappable shortcuts for the six quick-action keys (Pick,
  Reject, Unflag, Reviewed, Favorite, Info) — click the new keyboard icon
  next to "?", click a key, press whatever you want instead; conflicts
  auto-swap the two actions' keys rather than leaving one unbound. Stored in
  `localStorage` (`cullShortcuts`), same per-browser pattern as this app's
  other UI prefs (no per-user settings backend exists to hang it on
  instead). Rating (1-5, 0) and navigation (arrows, Escape) stay fixed —
  not worth customizing. New: `src/lib/cull/shortcuts.ts` (bindings +
  swap-on-conflict logic), `src/components/cull/ShortcutSettings.tsx`
  (remap dialog).

## Face Review (`/face-review`)

- Stable, deployed, 10 user-requested UX enhancements applied 2026-07-05
  (search, scan-results diff, tab-bar layout, single Select mode, cluster
  fixes, Find More multi-select). See `face-review-powertools-integration.md`.
- Upstream PRs submitted 2026-07-12 as the #309→#312 stack (engine / read /
  write / UI), following `local-testing/FACE_REVIEW_PR_NOTES.md`'s 4-PR
  split. Awaiting review.
- Released in v0.24.1 (2026-07-07), three commits (125dfba, 8767bbc,
  17ad8d5). Fixes 5 bugs the user found in manual testing (PersonNameInput
  stale-closure race creating wrong people from autocomplete; whole-person
  merge losing the index page's list filter on redirect; same filter lost
  on plain refresh, fixed by moving it into the URL; new-person cover image
  stuck on placeholder, `unoptimized` was missing on one Image; empty
  person left behind after reassigning their only face, now auto-swept)
  plus hiding "Scan Unassigned Faces" for non-admins (confirmed in Immich's
  own job.controller.js that `PUT /jobs/facialRecognition` requires
  `admin: true` — household has 1 admin + 15 non-admin users). Plus:
  a brand-new person created via "name this whole person" (create + merge,
  when the typed name matches nobody) never got a cover photo — confirmed
  in Immich's own person.service.js that mergePerson() skips the self-heal
  its own per-face reassign endpoints do (createNewFeaturePhoto() when
  faceAssetId is null). `ensurePersonThumbnail()` in actions.ts now
  replicates that self-heal after every merge. Verified live: "Mark
  Skingley" was the one person in the whole 6,538-row table with no
  thumbnail at all (79 others have a null faceAssetId but still render via
  an old thumbnailPath — false positives, not this bug); repaired directly
  via the Immich API before the code fix landed.

## Tag Manager (new tag tree editor, `/tags`)

- Released in v0.24.0 (2026-07-06); user has exercised it and reported
  "mostly very happy". Key implementation notes:
  - Immich v3's tag API can't rename or reparent a tag (verified: its update
    endpoint only accepts `color`, PATCHing name/parentId 500s from an empty
    SQL SET clause) — rename/nest/un-nest recreate the tag(s) via
    lib/tag-manager/move.ts instead, so a moved/renamed tag gets a NEW id.
    This can silently break Workflow tag conditions (they match by id) — the
    "?" help dialog documents it.
  - Per-row "view in Immich" link uses `{exImmichUrl}/tags?path=<value>`,
    reverse-engineered from Immich's own web bundle (not in any public API).
- **TODO — submit upstream: fold into #306** (Tag Manager PR, still open, so
  this belongs as another commit on that branch, not a standalone PR). Fixed
  locally 2026-07-31, deployed to the local stack, **not yet pushed anywhere**.
  Moved/renamed tags were coming back from the dead: `move.ts` re-tagged the
  assets onto the new tag *before* deleting the old one, so for the duration of
  the copy each photo sat on both tags. Immich rewrites an asset's XMP sidecar
  on every tag change (`TagService.addAssets` → `updateTags` → `AssetTag` event
  → `SidecarWrite` job writes `TagsList`), so both the old and new paths got
  baked into the `.xmp` — and Immich's next metadata pass read that file back
  (`applyTagList` → `upsertTags`) and recreated the old tag with all its photos.
  Deleting a tag emits no event and rewrites no sidecar, so the stale keyword
  was never cleaned off disk. Fix is a reorder: delete the old tree first, then
  re-apply the tagging, so the one sidecar write per asset sees only the new
  tag. Asset ids are now snapshotted before any write, the re-tag step retries,
  and the rollback is order-aware (past the delete it keeps the new tree rather
  than tearing it down). Re-verified on Immich **v3.1.0** that `TagUpdateDto`
  still only accepts `color`, so the recreate-and-delete approach is still
  forced. Hit this in the wild on 3 tags (`2010 Holland & Germany`,
  `2019 Ontario`, `2009 Honeymoon in Florida & Bahamas`) — user is cleaning up
  the existing duplicates by hand.
- **TODO — submit upstream with the above (#306): delete-that-stays-deleted.**
  Same root cause, second symptom. `deleteTag` proxied straight to Immich's
  `DELETE /tags/{id}`, which drops the tag row and cascades `tag_asset` but
  emits no event — so it leaves the name in **both** `asset_exif.tags` and the
  photo's XMP `TagsList`. `MetadataService.applyTagList` reads
  `asset_exif.tags` (via `getForMetadataExtractionTags`), i.e. the DB column,
  *not* the file — so a deleted tag reappears on the next metadata pass without
  the sidecar even being re-read. Confirmed live: after deleting the flat
  `2010 Holland & Germany` in Immich's own UI the tag row was gone while
  `asset_exif.tags` and the `.xmp` both still held the name, sidecar mtime
  unchanged. Immich behaves the same way, so matching Immich was not an option.
  Fix: new `lib/tag-manager/remove.ts` untags every photo first
  (`DELETE /tags/{id}/assets` → `removeAssets` → `updateTags` rewrites
  `asset_exif.tags` + `AssetUntag` → `SidecarWrite` rewrites the `.xmp`), then
  deletes the tag. New route `pages/api/tags/[id]/index.ts` (DELETE);
  `deleteTag` points at it instead of the proxy. Shared plumbing for both
  operations extracted to `lib/tag-manager/immich.ts`. Delete confirm dialog now
  says the sidecars get updated — it writes one file per photo, so it must not
  be a surprise. Note Immich's "Sidecar Metadata" job only queues `SidecarCheck`
  (**read**); there is no official job that rewrites sidecars, so a tag change
  is the only lever.
- Released in v0.24.2 (2026-07-07): tag names were getting cut off — the
  name span had no `min-w-0`, so Tailwind's `truncate` never actually
  engaged (flex items don't shrink below content size by default). Fixed,
  and used the freed-up room to declutter: add-sub-tag/move/delete now live
  behind a single "⋮" `DropdownMenu`, with the photo-count badge moved
  beside it doubling as the "view in Immich" link (the row's old dedicated
  button for that, removed as redundant). "Move to…" moved from a floating
  `Popover` to an inline search box (same slot as "add sub-tag") — nesting
  it inside the new dropdown would have raced the two Radix portals'
  open/close state. Delete's confirm dialog opens via the existing
  `AlertDialog` ref-imperative pattern (`PersonItem.tsx` precedent) rather
  than as a visible nested trigger, for the same reason.

## Maps (app-wide)

- **Migrated every map surface from Leaflet (raster tiles) to MapLibre GL
  (vector tiles) on 2026-07-11**, pointed at the exact same tile source
  Immich's own web app uses — `GET {exImmichUrl}/api/server/config`'s
  `mapLightStyleUrl`/`mapDarkStyleUrl` (public, unauthenticated, the same
  call Immich's frontend makes pre-login), which default to
  `tiles.immich.cloud`'s Protomaps-built vector tiles from OpenStreetMap.
  New shared hook: `src/hooks/useImmichMapStyle.ts` (module-level cache,
  hardcoded fallback to Immich's shipped defaults if the fetch fails).
  Why: raster tiles bake in label language server-side at PNG-render
  time, a hard ceiling every raster provider hit (OSM/CARTO = local
  script only; Esri = English but stale data, reverted same day). Vector
  tiles let the *client* choose — Immich's style literally does
  `coalesce(name:en, name)` — so this gets OSM's fast-updating community
  data and English-preferring labels at once, with zero new API keys
  (confirmed live: Shibuya, Tokyo shows "Shibuya City Office" style
  bilingual labels; a heatmap over the household's real travel history
  renders correctly; AssetInfoPanel's mini-map renders terrain
  accurately).
  - Converted: `LocationManagerMap.tsx` (full interactive map — pins,
    click-to-drop, fitBounds/flyTo, all imperative `maplibregl.Marker`
    DOM elements instead of react-leaflet's declarative `<Marker>`,
    since there's no equivalently mature React binding for MapLibre —
    `react-map-gl` was considered and rejected to avoid a new
    dependency's peer-conflict risk on React 19); `LeafletHeatMap.tsx`
    → new `MapLibreHeatMap.tsx` (native GPU `heatmap` layer type, nicer
    than the old `leaflet.heat` canvas plugin); Missing Locations'
    `TagMissingLocationDialog/Map.tsx` (click-to-place single marker;
    `CustomMarker.tsx` deleted, folded inline since MapLibre markers are
    imperative, not JSX); `AssetInfoPanel.tsx`'s inline `MiniMap`.
  - Removed: `leaflet`, `react-leaflet`, `leaflet.heat`,
    `@types/leaflet`, `@types/leaflet.heat`. Added: `maplibre-gl`.
  - **Gotcha hit during this migration**: the Dockerfile's deps stage
    uses **Bun** (`bun install --frozen-lockfile` against `bun.lock`),
    not npm — `npm install` (used all session for local dev/typecheck)
    only touches `package-lock.json` and never updates `bun.lock`, so
    the first rebuild after editing `package.json` failed at the Docker
    layer with "lockfile had changes, but lockfile is frozen." Fix:
    regenerate `bun.lock` via `docker run --rm -v $(pwd):/app -w /app
    oven/bun:1-alpine bun install` before rebuilding. This hadn't bitten
    before because this session's package.json was never touched until
    now (the location_favorites work only touched the separate Drizzle
    migration system). Also caught mid-fix: `docker build ... | tail
    -N; echo $?` reports **tail's** exit code, not docker build's — a
    bug in this session's own verification commands that silently
    printed "build exit: 0" even on the failed build; use `docker build
    ... > file.log 2>&1; echo $?` (no pipe) to get the real status.

## Cross-module review (2026-07-11 overnight pass)

- **Done — performance**: `LocationManagerMap` marker effects used to
  depend on the parent's inline callback props, so *every* parent render
  (each grid hover included) destroyed and recreated every marker DOM
  node; callbacks now live in refs, markers reconcile against the pin
  set, and hover/selection styling rewrites only the elements whose
  computed HTML changed (verified live: a tagged marker DOM node
  survives hover transitions, exactly one dot restyles). Rate & Cull's
  per-thumbnail badge overlay was O(n²) (`assets.find` per photo per
  render) → memoized Map; selection mapping in `AssetGrid`, cull, and
  GPS Manager switched from `Array.includes` to Sets.
- **Done — safety**: the preview lightbox's fork-added Delete button
  called `deleteAssets` with the handler's `force: true` DEFAULT — a
  permanent delete contradicting GETTING_STARTED.md's trash-only
  promise. Now `force: false` with trash wording. NOTE: the handler's
  default is still `force: true` and upstream pages (missing-locations,
  bulk-duplicate-finder, potential-albums, albums/[albumId]) still rely
  on it — left untouched as upstream behavior, but worth revisiting.
- **Done — mobile**: all four MapLibre surfaces now pair with a
  `ResizeObserver` → `map.resize()` (`src/hooks/useMapContainerResize.ts`);
  MapLibre only reacts to window resize, so flex/breakpoint reflows left
  a desktop-sized canvas bleeding out of phone layouts. Also: dialog map
  un-hardcoded from 500px width; cull viewer's bottom bar wraps; the
  keyboard-shortcut header hint is xl-only; lightbox info panel stacks
  below the photo on <md instead of crushing it beside a fixed 360px
  panel.
- **Known inconsistency (deferred)**: two toast systems coexist —
  face-review/tag-manager/workflows/albums/settings use `react-hot-toast`
  while cull/GPS Manager/AssetGrid use the shadcn `use-toast`. Upstream
  itself is split, so unifying only fork modules wouldn't fix it;
  revisit if toast styling ever bothers anyone.

## GPS Manager (`/assets/location-manager`; renamed from "Location Manager" 2026-07-11 — URL/file path kept, same precedent as the Rate & Cull rename)

- Reverted the Esri map-tile experiment (2026-07-11): user reported real
  accuracy problems (a workplace shown on top of a lake, houses on their
  own street missing) — Esri's World_Street_Map/Dark_Gray_Canvas blend
  several vendors on their own update cadence and can lag OSM by years in
  under-mapped areas. Back on OSM standard (light) / CARTO dark_all
  (dark) — original data freshness (OSM edits propagate in days) at the
  cost of local-script-only labels in non-Latin regions again. Options
  laid out for the user (OSM/CARTO vs Esri vs MapTiler/Mapbox with a free
  API key vs a zoom-dependent hybrid) — user chose "revert," didn't ask
  for the hybrid or paid-key routes; worth revisiting if the label
  complaint resurfaces. Pin-color work (grey + orange outline) and all
  other LocationManagerMap.tsx logic untouched by this revert.
- Second post-v0.30.1 pass (2026-07-11, unreleased): selected-pin color
  simplified — both selected and unselected pins/dots stay dark grey now,
  only an orange border marks the selected one (dropped the blue fill
  from the previous pass). Copy Image GPS and Paste Image/Map GPS now
  auto-deselect the grid selection right after acting — both are
  one-shot actions against whatever was selected at click time, so
  clearing lets the next click start a fresh pick instead of silently
  reusing a stale one. Paste moved out of the sidebar favourites row into
  the (still-selection-conditional) bar above the grid, immediately right
  of Copy Image GPS; that bar is now `justify-between` — the left cluster
  (count, Select all/Deselect all, Copy Image GPS, Paste) stays left,
  Image Coordinates + Update pushed to the far right.
- Post-v0.30.1 pass (2026-07-11, unreleased): **map tiles switched from
  OSM/CARTO to Esri** (`World_Street_Map` for light,
  `Canvas/World_Dark_Gray_Base`+`Reference` stacked for dark) — the
  household complaint was that place names in non-Latin-script regions
  (tested: Shibuya, Tokyo) were unreadable kanji-only. Verified live via
  raw tile fetches before committing: plain OSM/CARTO tiles at that
  location are kanji-only; Esri's tiles show the English/romanized name
  alongside the local script ("Shibuya Sta." / "Dogenzaka1"). Note this is
  bilingual, not English-only — no free keyless raster provider guarantees
  pure-English labels everywhere, this was the best verified option.
  Pin/dot colors also redone: the actively selected object (dropped pin or
  a clicked image pin) is blue with an orange outline; everything
  unselected (image pins, "show all" dots) is dark grey — grid-hover still
  adds a cyan ring on top of either state. Further layout changes:
  search box moved to sit immediately above "Map Coordinates (Selected)"
  (renamed from "Map Coordinates"), which gained its own "Copy Map GPS"
  button; "Copy Image GPS" + a shortened Image Coordinates box + "Update"
  moved out of the sidebar into the (still-conditional) selection bar atop
  the grid; "All on map" toggle moved into a brand-new **always-visible**
  row above that selection bar, alongside new Back/Forward buttons that
  jump the selection to the previous/next currently-loaded photo lacking
  GPS (wraps around; client-side over loaded photos only, same scope as
  the map's other interactions); "Manage favourites" is icon-only now (no
  label, no count); Paste moved into the favourites row and reads "Paste
  Image/Map GPS" (was "…Location").
- Post-v0.30.0 layout pass (2026-07-10, unreleased): sidebar split into two
  visually distinct sections — top (bg-muted/30, border-b-2): search box,
  a Copy/Paste row (**Copy Image GPS**, **Copy Map GPS**, **Paste
  Location** — renamed from "Copy Image Location" and the Map Coordinates
  field's old "Copy" button, both relocated here), and a Favourites row
  (**Apply favourite ▾**, **Add favourite**, **Manage favourites** — all
  three now live here, not split between sidebar and bottom bar); bottom
  (map + Image Coordinates field w/ **Update** button + Map Coordinates
  field, Copy button removed since it moved up). All three copy/paste
  buttons and both favourite-apply buttons tint green (blue for Paste)
  via `!bg-*` important-classes when eligible, on top of the normal
  disabled/greyed look — pattern: `activeButtonClass(active, "green" |
  "blue")` local to location-manager.tsx. "Save" renamed to **Update**
  and gated behind a confirm `AlertDialog` (ref-imperative, opens only
  after coordinate parsing succeeds — TagRow/FavoritesSheet precedent).
  Clear-filters "X" is now always rendered (was conditional, caused
  layout jump) — `disabled` instead of hidden. The old floating
  bottom bar (FloatingBar, covered the grid) is gone; replaced by a
  plain top-docked bar inside the grid column (only Selected-count +
  Select all/Deselect all remain — Copy/Paste/Favourites moved to the
  sidebar per above, so the redundant "Favourites" quick-menu there was
  deleted).
- Released as **v0.30.0** (2026-07-10) — version jumped from 0.24.x to mark
  the new module. Final pre-release fixes: AlbumDropdown gained an "All
  albums" clear option (shared component, also improves Geo Heatmap);
  "Show all on map" moved into the header ("All on map"); Manage-favourites
  sheet no longer duplicates Add; **Missing Locations hidden from the
  sidebar** (page kept at /assets/missing-locations for bookmarks + clean
  upstream merges — sidebarNavs.tsx has the commented-out entry). Release
  notes are text-only by user choice (screenshots of the household library
  would have put family photos in a public release; captured shots were
  deleted).

New module built 2026-07-10, intended to eventually replace Missing
Locations (which stays untouched until then). MVP = Media Viewer (filtered
grid: album + GPS status) + Map (image pins for selected photos, one
dropped/candidate pin, Nominatim search, editable coordinate boxes) with a
unified copy/paste clipboard between the two.

- **LOC-2**: Clearing/removing GPS from an image — confirmed out of scope
  for now, natural fit later (Immich's bulk update accepts null lat/lng).
- Decisions documented for the record (all confirmed or delegated by user):
  "Location Not Set" = `exif.latitude IS NULL` via left join, identical to
  Missing Locations. Writes via Immich bulk `PUT /assets` (user's own
  session, 1000/req chunks). Grid = `AssetGrid` with new `clickToSelect`
  mode (plain click selects one, shift = range, cmd/ctrl = toggle — the
  non-contiguous multi-select came free, so it's in; double-click opens
  preview). Pagination = 500/page "Load more" (largest household library
  has 32.7k missing-GPS assets, unpaginated was not viable). Album filter
  single-select, sort newest-first with toggle, filters live in the URL
  query string (Face Review lesson: survives refresh). Typing in a
  coordinate box does NOT update the paste clipboard — only the explicit
  Copy buttons do; editing the Map Coordinates box while an image pin is
  selected detaches the edit into the dropped/candidate pin rather than
  desyncing the image pin from stored EXIF. After a bulk write under the
  "Location Not Set" filter, updated photos are removed from the grid
  (Missing Locations precedent).
- Enhancement batch (2026-07-10, all six suggestions accepted + two user
  additions): Undo on bulk writes (toast action; restores previous coords —
  photos that had NO location can't be reverted because Immich's API
  rejects null lat/lng, verified in its compiled zod schema
  `latitudeSchema = z.number().min(-90).max(90)`, so the Undo button only
  appears when ≥1 photo is revertible); "Show all on map" switch (loaded
  photos with GPS as violet CircleMarker dots); total count in header +
  "Showing X of Y" footer (COUNT query on page 1 only); date-range filter
  (calendar popover, dateFrom/dateTo in URL); grid↔map hover linkage
  (hover photo → cyan ring on its pin; click any pin/dot → scroll-to +
  cyan flash in grid, incl. lazy placeholders via data-asset-id);
  Favourites moved from a fixed pane to a slide-out Sheet with
  drag-to-reorder (persisted via new `sort_order` column, migration 0006,
  + PUT /api/location-favorites/reorder) plus Move up/down menu items;
  Favourites quick-apply dropdown in the floating bar.
- Refinement pass (2026-07-10, user-directed): single-photo map zoom 10→13;
  GPS filter is now a segmented Tabs toggle (All / ✓GPS / ✗GPS) instead of a
  Select; favourite rows moved Rename/Delete behind a ⋮ menu (TagRow's
  deferred-AlertDialog pattern); floating bar now always offers Deselect
  all. Click behavior flip-flopped in this pass: briefly reverted to
  "click = preview" (AssetGrid standard), then the user corrected course —
  final state is clickToSelect restored (click = select + pin on map,
  double-click still previews) with an explicit Expand button at each
  thumbnail's bottom-right opening the preview lightbox (whose toolbar has
  Open in Immich). `renderExtras(photo, { openPreview })` on AssetGrid is
  the generic hook carrying the green ✓GPS / red ✗GPS badge + Expand
  button (the default corner Immich link is replaced on this page).
- Favourites (added 2026-07-10, was LOC-1 "Location Presets"): per-user
  named locations ("Home") in a pane above the map — add (saves the
  currently selected pin), rename inline, one-click Apply to selected
  photos, delete with confirm; row click previews on the map. Stored
  **server-side** in app.db (`location_favorites`, migration 0005,
  owner-scoped like workflows) rather than localStorage, so favourites
  follow the user across browsers/devices — 16-user household made
  per-browser storage the wrong default.

## Documentation

- Fixed 2026-07-07: a friend followed the GitHub repo's install
  instructions and ended up running the **upstream** image instead of this
  fork's — root cause is that `README.md` was still the untouched upstream
  copy (two `ghcr.io/immich-power-tools/immich-power-tools:latest`
  references, no mention this is a customized fork at all), and worse, the
  fork's **default branch on GitHub is `main`**, not `local-stack` — so
  anyone landing on the repo page saw that untouched README regardless of
  what `local-stack` said. Fixed both: `local-stack`'s README now opens
  with a banner pointing at this fork's image and a new
  `GETTING_STARTED.md` (adapted from the friend-share zip that used to live
  outside the repo, in `~/Archive/immich-power-tools-share/` — same content,
  now the actual on-GitHub source of truth instead of a stale local copy);
  `main` got the same small banner added directly (deliberately NOT
  otherwise touched — it stays a clean mirror of upstream for future
  `git merge upstream/main` and for the eventual upstream PRs, see
  `local-testing/FACE_REVIEW_PR_NOTES.md`). Considered switching the GitHub
  default branch to `local-stack` instead, which would fix this more
  directly — didn't, since it'd change clone/PR-base behavior repo-wide;
  worth reconsidering if this bites someone again.
