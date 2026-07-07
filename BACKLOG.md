# Backlog — immich-power-tools (local-stack fork)

Short ids, removed when resolved (not archived). See CLAUDE.md-equivalent
context in project memory (`immich-power-tools-cull.md`,
`face-review-powertools-integration.md`) for the "why" behind each area.

## Cull Photos (new photo rating/culling tool, `/assets/cull`)

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
  `docker compose up -d power-tools` from `~/immich-app` — editing the repo
  alone doesn't touch the running container.

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
