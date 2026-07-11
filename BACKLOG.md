# Backlog — immich-power-tools (local-stack fork)

Short ids, removed when resolved (not archived). See CLAUDE.md-equivalent
context in project memory (`immich-power-tools-cull.md`,
`face-review-powertools-integration.md`) for the "why" behind each area.

## Rate & Cull (photo rating/culling tool, `/assets/cull`; renamed from "Cull Photos" in v0.24.3)

- **CULL-4**: No upstream PR prep started (mirrors the Face Review PR
  deferral — user wants to be "very very confident and satisfied" first).
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
- Upstream PR still deferred by user request — see
  `local-testing/FACE_REVIEW_PR_NOTES.md` (git-ignored) for the as-built
  4-PR split when ready.
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

- **LOC-3**: Back/Forward (jump to next/previous missing-GPS photo) only
  searches currently-loaded photos (500/page) — can't reach missing-GPS
  photos on unloaded pages. User asked about this 2026-07-11; proposed
  fix is a server endpoint that finds the true next/previous missing-GPS
  asset in the DB (respecting album/date filters) and jumps the grid to
  the page containing it. Not yet built — user hasn't said go.
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
