# Changelog

Plain-language notes for each release — what changed and why it matters,
without the code-level detail. If you want the technical version, every
entry links to the commit history.

Every release from here on gets an entry here, written for someone who
just uses the app and doesn't want to read a diff.

## v0.30.1 — 2026-07-11

Follow-up polish for Location Manager based on real use.

- **New:** three explicit favourite buttons — "Apply favourite" (a
  dropdown of your saved spots), "Add favourite" (saves wherever the
  selected pin is), and "Manage favourites" (rename, delete, reorder).
- **Changed:** the sidebar is now split into two clearly separated
  areas — search and action buttons up top, the map and its coordinate
  fields below.
- **Renamed & moved:** "Copy Image Location" is now "Copy Image GPS,"
  and there's a new matching "Copy Map GPS" button — both sit together
  at the top of the sidebar along with "Paste Location." Each one turns
  green (or blue for Paste) when it's actually usable, so you can tell
  at a glance.
- **Renamed:** the "Save" button next to Image Coordinates is now
  "Update," and it now asks you to confirm before writing the new
  location to your selected photos.
- **Fixed:** the "Clear filters" button used to appear and disappear,
  which made the page jump around — it now stays put and just greys out
  when there's nothing to clear.
- **Fixed:** picking an album left no way back to your whole library —
  there's now an "All albums" option.
- **Changed:** the floating bar that used to cover part of your photos
  is gone, replaced by a plain bar docked above the grid.
- **Hidden:** "Missing Locations" no longer shows in the menu — Location
  Manager replaces it.

## v0.30.0 — 2026-07-10

The version jumps from 0.24 to 0.30 because this release adds a whole new
section to the app.

- **New: Location Manager** (sidebar → Tools → Location Manager) — a photo
  grid and a world map side by side, built for fixing photos that don't
  know where they were taken. It replaces the old "Missing Locations"
  tool, which is now hidden from the menu (its page still works if you
  had it bookmarked).
  - **Find the photos:** filter by album, by GPS status (All / ✓ GPS /
    ✗ GPS), and by date taken. The header shows how many photos match —
    watch the "without location" number shrink as you work.
  - **See them on the map:** select photos and their pins appear. Flip on
    "All on map" to plot every loaded photo at once — great for spotting
    the one shot tagged on the wrong continent. Hover a photo to light up
    its pin; click a pin to jump to its photo.
  - **Fix them:** click the map (or search for an address, or paste
    coordinates from Google Maps — even the degrees-minutes-seconds kind)
    to drop a pin, then save it to every selected photo. Or copy the
    location from one photo and paste it onto others.
  - **Favourites:** save places you tag constantly — home, the cottage,
    grandma's — and apply them with one click from the Favourites menu.
    Rename, delete, and drag them into whatever order you like ("Manage
    favourites"); they're saved to your account, so they follow you
    between devices.
  - **Undo:** applied the wrong location? The confirmation message has an
    Undo button that puts back each photo's previous coordinates. (Photos
    that had *no* location before can't be reverted to blank — Immich's
    API doesn't allow clearing GPS — so Undo only offers itself when it
    can actually help.)
  - Every thumbnail wears a green ✓ GPS or red ✗ GPS badge, clicking a
    photo selects it, and the magnifier-style expand button opens a
    full-size preview.
- **Changed:** the album dropdown (here and in Geo Heatmap) now has an
  "All albums" option, so you can get back to your whole timeline after
  picking an album.
- **Hidden:** "Missing Locations" no longer appears in the sidebar —
  Location Manager does everything it did and more.

## v0.24.3 — 2026-07-07

- **Renamed:** "Cull Photos" is now "Rate & Cull" — a plainer name for
  people who haven't run into the photography term "cull" before.
- **New:** keyboard shortcuts on that page are now yours to remap. Click
  the keyboard icon next to the "?" help button, click any shortcut, then
  press whichever key you'd rather use. If that key's already taken by
  something else, the two just swap.
- **Fixed:** Pick and Reject now toggle off the same way Reviewed and
  Favorite already did — press the key once to set it, press it again to
  clear it, instead of needing a separate "unflag" key every time.
- **Fixed:** the GitHub page for this project could send people to install
  the *original* Immich Power Tools instead of this customized version —
  it was still showing the unmodified upstream instructions. Fixed, and
  added a proper getting-started guide.

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
