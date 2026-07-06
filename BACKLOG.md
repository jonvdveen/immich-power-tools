# Backlog — immich-power-tools (local-stack fork)

Short ids, removed when resolved (not archived). See CLAUDE.md-equivalent
context in project memory (`immich-power-tools-cull.md`,
`face-review-powertools-integration.md`) for the "why" behind each area.

## Cull Photos (new photo rating/culling tool, `/assets/cull`)

- **CULL-4**: No upstream PR prep started (mirrors the Face Review PR
  deferral — user wants to be "very very confident and satisfied" first).

## Face Review (`/face-review`)

- Stable, deployed, 10 user-requested UX enhancements applied 2026-07-05
  (search, scan-results diff, tab-bar layout, single Select mode, cluster
  fixes, Find More multi-select). See `face-review-powertools-integration.md`.
- Upstream PR still deferred by user request — see
  `local-testing/FACE_REVIEW_PR_NOTES.md` (git-ignored) for the as-built
  4-PR split when ready.
- **FR-1**: Remote-performance pass 2026-07-06 (server-side face crops via
  sharp at `/api/face-review/faces/[faceId]/crop`, immutable/cache headers on
  image proxies, native lazy-loading `<img>` in FaceCrop). Deployed to the
  local `:8001` container but UNCOMMITTED and not yet in the public GHCR
  image (v0.23.0 predates it) — commit + tag a release once user confirms
  crops look right and remote loading feels fast.
