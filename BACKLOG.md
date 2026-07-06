# Backlog — immich-power-tools (local-stack fork)

Short ids, removed when resolved (not archived). See CLAUDE.md-equivalent
context in project memory (`immich-power-tools-cull.md`,
`face-review-powertools-integration.md`) for the "why" behind each area.

## Cull Photos (new photo rating/culling tool, `/assets/cull`)

- **CULL-1**: User has not yet tried the rebuilt version (server-paginated
  loading, full-screen viewer with clickable star/flag overlay, filterable
  grid, multi-select bulk actions, archive/trash). Deployed to the local
  `:8001` container 2026-07-05 but unverified interactively — data-layer
  testing needs a live Postgres session the agent hasn't had in-browser.
- **CULL-2**: No feature branch — built directly on `local-stack`,
  uncommitted, unlike Face Review's `feat/face-review` pattern. Decide
  branch/commit strategy once the user is satisfied with behavior.
- **CULL-3**: Not yet pushed to the public GHCR image
  (`ghcr.io/jonvdveen/immich-power-tools`) — that image currently only has
  Face Review. Re-run the multi-arch build+push if/when friends should get
  Cull Photos too.
- **CULL-4**: No upstream PR prep started (mirrors the Face Review PR
  deferral — user wants to be "very very confident and satisfied" first).

## Face Review (`/face-review`)

- Stable, deployed, 10 user-requested UX enhancements applied 2026-07-05
  (search, scan-results diff, tab-bar layout, single Select mode, cluster
  fixes, Find More multi-select). See `face-review-powertools-integration.md`.
- Upstream PR still deferred by user request — see
  `local-testing/FACE_REVIEW_PR_NOTES.md` (git-ignored) for the as-built
  4-PR split when ready.
