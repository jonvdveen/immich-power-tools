# Changelog

Plain-language notes for each release — what changed and why it matters,
without the code-level detail. If you want the technical version, every
entry links to the commit history.

Every release from here on gets an entry here, written for someone who
just uses the app and doesn't want to read a diff.

## v0.24.2 — 2026-07-07

- **Fixed:** long tag names in Tag Manager were getting cut off way more
  than they needed to be.
- **Changed:** the row buttons (add sub-tag, move, delete) are now tucked
  behind a single "⋮" menu on the right instead of four separate buttons,
  and the photo count moved next to it — doubling as a link straight to
  that tag in Immich. That frees up the room the tag name needed to
  actually be readable.

## v0.24.1 — 2026-07-07

- **Fixed:** naming someone new by merging their photos into a fresh name
  (instead of picking an existing person) could leave them with no profile
  picture, forever. This now fixes itself automatically the moment the merge
  happens.
- **Fixed:** if you typed a name, saw a suggestion pop up, and hit Enter
  right after clicking an autocomplete suggestion, it could create a brand
  new (misspelled) person instead of using the one you picked.
- **Fixed:** merging a whole person into someone else used to dump you back
  on the default "everyone" list, losing whatever filter you had open (like
  "Unnamed only"). It now takes you back to the list you were actually on —
  same fix also means refreshing the page mid-review no longer resets your
  filter.
- **Fixed:** a person's new profile photo could stay stuck on a gray
  placeholder for up to a minute after it was actually ready, because the
  app was caching the old placeholder image.
- **Fixed:** moving someone's only tagged photo to a different person used
  to leave a ghost, empty person behind. Those now get cleaned up
  automatically.
- **Changed:** "Scan Unassigned Faces" is now only shown to the household
  admin account — running it needs admin permissions in Immich, so
  everyone else no longer sees a button that would just fail for them.
- **Changed:** in Cull Photos, the Pick, Reject, and Reviewed buttons used
  to all look like the same flag icon, just in different colors — easy to
  misclick and lose a photo you meant to keep. They're now three distinct
  shapes: a green checkmark (Pick), a red X (Reject), and a pair of
  glasses (Reviewed).

## v0.24.0 — 2026-07-06

- **New: Tag Manager** — a proper page for browsing, renaming, nesting, and
  cleaning up your Immich tags in one place, instead of hunting through
  individual photos.
- **Improved: Cull Photos** — added a Favorites toggle, a "Reviewed"
  workflow so you can track what you've already gone through (defaults to
  showing what's left), a photo-info panel, an "open in Immich" shortcut,
  and a built-in "?" help guide explaining how it all works. The Pick/
  Reject/Reviewed tags Immich stores were also renamed to avoid clashing
  with anything else in your tag list.

## v0.23.1 — 2026-07-06

- **Improved: Face Review** — photos load noticeably faster and with less
  flicker while browsing someone's tagged faces.

## v0.23.0 — 2026-07-06

- **New: Face Review** — a full tool for reviewing and correcting who's who
  in your photos: browse a person's tagged faces, find more photos of them
  you haven't tagged yet, split off someone you don't recognize, and merge
  duplicate people together. Everyone in the household signs in with their
  own Immich account and only ever sees their own people and photos.
- **New: Cull Photos** (first version) — browse your library or an album
  and mark photos to keep or reject.
- Assorted fixes and small additions carried over from the wider project:
  workflow automation got new conditions (tag, resolution, cleanup rules)
  and a "Remove Tag" action, workflow triggers now handle very large
  libraries correctly, and a few permission/compatibility issues with newer
  Immich versions were resolved.
- **Fixed a privacy issue:** a developer's local settings file (with
  credentials in it) was accidentally being baked into every build of this
  app. It's now excluded — worth knowing about even though it never reached
  a public release.
