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

## Face Review (`/face-review`)

- Stable, deployed, 10 user-requested UX enhancements applied 2026-07-05
  (search, scan-results diff, tab-bar layout, single Select mode, cluster
  fixes, Find More multi-select). See `face-review-powertools-integration.md`.
- Upstream PR still deferred by user request — see
  `local-testing/FACE_REVIEW_PR_NOTES.md` (git-ignored) for the as-built
  4-PR split when ready.

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
