# Backlog — immich-power-tools (local-stack fork)

Short ids, removed when resolved (not archived). See CLAUDE.md-equivalent
context in project memory (`immich-power-tools-cull.md`,
`face-review-powertools-integration.md`) for the "why" behind each area.

## Cull Photos (new photo rating/culling tool, `/assets/cull`)

- **CULL-4**: No upstream PR prep started (mirrors the Face Review PR
  deferral — user wants to be "very very confident and satisfied" first).
- **CULL-5**: 2026-07-06 batch (deployed to local `:8001`, uncommitted, not
  interactively verified): Favorite toggle (F/.) with heart badge; Reviewed
  toggle (R) with a filter dropdown that defaults to Unreviewed (not Any,
  unlike the other filters — the queue should always open where you left
  off); EXIF info panel (I key or on-screen button, reuses the existing
  /api/assets/[id]/detail endpoint AssetInfoPanel already uses); Open in
  Immich button in the viewer; "?" help guide with a shortcut table and
  basic culling-workflow tips.
- Pick/Reject/Reviewed tags renamed 2026-07-06 from flat "Picked"/"Rejected"
  to nested `ImmichPowerTools_CullandRate/IPT_Picked` etc, to avoid colliding
  with a tag a household member might create by hand. The old flat tags had
  zero tagged assets at rename time (verified before switching), so nothing
  needed migrating — they're harmless orphans, deletable via Tag Manager.
  The new namespace + all three child tags were created for real (not test
  data) and verified against the live server during this session.

## Face Review (`/face-review`)

- Stable, deployed, 10 user-requested UX enhancements applied 2026-07-05
  (search, scan-results diff, tab-bar layout, single Select mode, cluster
  fixes, Find More multi-select). See `face-review-powertools-integration.md`.
- Upstream PR still deferred by user request — see
  `local-testing/FACE_REVIEW_PR_NOTES.md` (git-ignored) for the as-built
  4-PR split when ready.

## Tag Manager (new tag tree editor, `/tags`)

- **TAG-1**: Deployed to the local `:8001` container 2026-07-06 but
  UNCOMMITTED and unverified interactively (agent has no logged-in browser
  session). Backend algorithm (rename/nest/un-nest via recreate + copy +
  cascade-delete) was validated directly against the live Immich API,
  including a parent+child subtree case — see lib/tag-manager/move.ts. Also
  added: per-row "view in Immich" link (`{exImmichUrl}/tags?path=<value>`,
  reverse-engineered from Immich's own web bundle since it's not in any
  public API — confirmed via auth-redirect that Immich recognizes the
  route), a colored Tag icon replacing the plain color-swatch rectangle, and
  a "?" help dialog covering limitations (rename/nest/un-nest changes tag
  IDs; this can silently break Workflow conditions, which match by tag ID —
  see HelpGuide.tsx for full text). UI itself (tree rendering, search, color
  picker, inline rename, add-child, move popover, new icon/link/help button)
  still needs a human pass. 2026-07-06: moved the "?"/helper text onto the
  search row (was on the page Header), and switched from one long vertical
  list to a responsive grid — one card per root tag (with its nested
  children inside), to cut down whitespace on wide screens.
- **TAG-2**: No feature branch — built directly on `local-stack`, uncommitted.
- **TAG-3**: Not yet in the public GHCR image.
- Immich v3's tag API can't rename or reparent a tag (verified: its update
  endpoint only accepts `color`, PATCHing name/parentId 500s from an empty
  SQL SET clause) — that's why rename/nest/un-nest recreate the tag(s)
  instead of updating in place, so a moved/renamed tag gets a new id.
