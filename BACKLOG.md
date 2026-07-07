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
