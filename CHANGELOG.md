# Changelog

Plain-language notes for each release — what changed and why it matters,
without the code-level detail. If you want the technical version, every
entry links to the commit history.

Every release from here on gets an entry here, written for someone who
just uses the app and doesn't want to read a diff.

## v0.35.0 — 2026-09-10

A new **De-Duplicator** replaces the Bulk Duplicate Finder. It can automatically
choose which copy to keep, based on rules you set and rank yourself. You also
have three options for what happens to the copies you don't keep.

### De-Duplicator

- **Fixed — read this one.** The old screen deleted permanently, skipping
  Immich's trash, so anything it removed was gone for good. Discards now always
  go to the trash, and there is no permanent-delete option at all — you empty
  the trash in Immich when you're ready. Photos cleared with the old screen
  can't be recovered; anything from here on can.

- **Added: three ways to handle the extra copies.** **Move to trash**, as above.
  **Tag only** leaves every photo in place and just labels the extras (default
  "Duplicate", rename it if you like) to review in Immich later. **Stack** folds
  the group into one timeline entry — the clutter goes, nothing is removed.
  Stacking works only on your own photos; Immich won't stack someone else's.

- **Added: you set the rules for picking the keeper.** Ten criteria —
  resolution, file size, location, faces, rating, tags, favourite, whose copy it
  is, filename length, date added. Reorder them, switch any off, or flip which
  way each leans, so "keep the smaller file to save space" is now possible.
  Defaults are unchanged.

- **Added: Skip.** Hides a group and does nothing else — nothing is written to
  Immich, and Options brings them all back. Different from **Not duplicates**,
  which tells Immich to stop grouping those photos for good. Useful when you're
  working through thousands over several sittings.

- **Added: a guard on partner photos.** You can keep a partner's copy and
  discard your own. But if only your copy has a location, description, tags or a
  favourite marker, the automatic picker keeps yours and says why — that
  information can't be moved onto a photo you don't own.

- **Changed: a simpler screen.** The search box, album filter and
  same/cross-library buttons are gone; they didn't help. Every control now sits
  on one row.

- **Removed:** the Bulk Duplicate Finder.

Your ranking, skips and preferences save to your Immich account, so they follow
you between devices. Nothing to set up.

### Everywhere else

- **Fixed: pop-up messages never appeared.** Rate & Cull, GPS Manager and the
  duplicate screens were posting them into a void — successes, warnings and
  errors alike. A failed action could look like nothing happening, and GPS
  Manager's "Undo" after a bulk location change was never clickable. Expect
  feedback you weren't getting before.

## v0.34.0 — 2026-08-01

Workflows can now keep an album or tag in step with their own rules, the tag
actions were quietly broken and are fixed, and a few conveniences in Rate &
Cull and Face Review.

### Workflows

- **Added:** two new actions, **Update Album** and **Update Tag**. Where "Add to
  Album" only ever adds, these keep the album or tag *matching the flow's
  rules*: photos that now match get added, and photos in there that no longer
  match get taken out. Closer to a smart album that maintains itself.

  Two things to know. They do exactly what they say, so if nothing matches, the
  album empties — and a photo you added to that album by hand will be removed
  on the next run, because it doesn't match the rules. They also need the "All
  assets" trigger: on "New assets only" the run only sees part of your library
  and would strip out everything else, so that combination is refused when you
  save. Only albums and tags have this; favourites and archive don't, because
  there'd be nothing to limit the removals to and one flow would end up
  deciding what's favourited across your whole library.

- **Fixed:** the **Add Tag** action — now called **Apply Tag** — had been
  failing silently. It tried to create its tag on every run, and Immich refuses
  to create a tag that already exists, so the action worked the first time and
  errored every time after, while the run still reported success. One flow here
  was matching 808 photos and tagging none of them. It also needed a permission
  the workflow API key isn't usually given, which produced a "Missing required
  permission" error.

- **Changed:** all three tag actions now **pick from a list of your existing
  tags** instead of you typing a name, with sub-tags shown by their full path.
  They only change which photos carry a tag — they never create, rename or
  delete tags. Make tags in Tag Manager. Existing flows keep working and are
  flagged in the editor so you can re-pick when convenient.

- **Changed:** the **Album** condition takes several albums at once — see
  v0.33.0.

### Rate & Cull

- **Changed:** the action bar in full-screen is now a solid panel instead of
  see-through buttons floating over the photo, matching the bar you get when
  multi-selecting in the grid.
- **Added:** an **add-to-album** button on the multi-select bar. Search your
  albums, or type a name that doesn't exist yet and create it with the selected
  photos already in it.

### Face Review

- **Added:** a **Per page** dropdown on **Find more → Faces**, the same as the
  one on Tagged → Faces, so you can pull in 50, 100 or 200 candidates at a time
  instead of a fixed two dozen. Defaults to 50.

## v0.33.0 — 2026-07-31

Tags you move or delete now stay moved and deleted, and a workflow's "Album"
condition can check several albums at once.

### Tag Manager

- **Fixed:** nesting or renaming a tag could leave a duplicate behind at the
  old spot, which then quietly filled back up with the same photos. Immich
  keeps a copy of each photo's tag names inside the photo's own sidecar file,
  and during a move the photos briefly carried both the old and the new name —
  so both got written to those files, and Immich later read the old one back
  and recreated the tag you'd just moved away from. Moves now clear the old tag
  before applying the new one, so only the new name is ever written down.

- **Fixed:** deleting a tag didn't always stick. Immich removes the tag itself
  but leaves its name recorded against each photo, so the tag reappeared the
  next time Immich re-read that information — sometimes days later, which made
  it look random. Deleting now takes the tag off every photo first, which
  clears the name properly, and only then removes the tag. Because that updates
  each photo's sidecar file, the confirmation dialog now says so up front
  instead of promising the photos aren't touched.

  This doesn't retroactively clean up tags you deleted before this release —
  those can still reappear, and you'll need to delete them once more now that
  the button works properly.

### Workflows

- **Added:** the **Album** condition now takes **several albums at once**
  instead of one. Pick as many as you like from a searchable list, then choose
  whether a photo has to be in **any of** them, in **all of** them, or in
  **none of** them. Previously "in this album or that one" meant building three
  separate conditions.

  Worth knowing: **"is in none of"** only rules out the albums you picked — a
  photo that's in some other album still passes. If you want photos that aren't
  in *any* album at all, that's the separate **"Not in Any Album"** condition.
  There's now a note in the editor saying so.

  Workflows you've already built keep working exactly as before.

## v0.32.1 — 2026-07-17

Some layout tidying in the GPS Manager toolbar, plus a behind-the-scenes fix
that shrank the app's own database.

### GPS Manager

- **Changed:** the toolbar above the photos was rearranged. The
  next / previous "photo without GPS" arrows now sit on the **far left**; the
  map toggle — renamed from "All on map" to **"Show all on map"** — sits on the
  **far right**; and **Select all / Deselect all** moved up next to the arrows
  and are now **visible all the time** (greyed out when there's nothing to do)
  instead of only appearing once you'd selected something. The selected-count
  and the copy/paste + coordinate controls follow along to their right.
- **Changed:** the coordinate box is now labelled **"Image GPS"**, and the
  **"Add favourite"** button is now **"Create Favourite"**.

### Workflows

- **Fixed:** every workflow run was saving the full list of every photo it
  touched — twice — into the app's database, which had quietly grown past a
  gigabyte after 885 runs. Runs now keep just a small sample of ids plus a
  total count, which is all the run view ever displays. With a one-off
  cleanup, the database dropped from 1.3 GB to 38 MB. Nothing for you to do.

## v0.32.0 — 2026-07-17

GPS Manager now pages through your photos instead of piling them all onto one
screen, and the "next without GPS" button can carry you across those pages.

- **Changed:** the photo grid is now **paginated** — a "Previous / Next" pair
  at the bottom with a "201–400 of 32,000 · page 2 of 160" readout — instead
  of an ever-growing "Load more" list. Before, working through a big library
  meant loading thousands of photos onto one page until the browser bogged
  down; now only one page is on screen at a time, so it stays fast no matter
  how many photos need locations.
- **Changed:** the **"next photo without GPS"** arrows (next to "All on map")
  now **jump to a different page when they need to.** Reach the last
  un-located photo on the page and the next arrow flips you straight to the
  first one on the following page — so you can sit and geotag your way through
  the whole library without ever touching the page buttons. It loads the next
  page ahead of time so the jump feels instant, stops cleanly at the ends, and
  after you set a location it slides the following photos up so you keep
  working the front of the queue.

## v0.31.0 — 2026-07-17

Rate & Cull polish, and a tidy-up so the controls in the tools we've added
match the size of the ones in the rest of the app.

### Rate & Cull

- **Changed:** the filter bar above the photos now stays put when you scroll
  down through the grid, instead of disappearing off the top. So the source
  picker, the rating/pick/review filters, and the sort button are always
  within reach no matter how far down you've scrolled.
- **New:** a **photos / videos** filter at the top — three little icons for
  All, Photos only, and Videos only. Handy when you just want to rip through
  your videos, or keep them out of the way while rating stills.

### Consistent control sizes

- **Changed:** the buttons, dropdowns and text boxes in the tools we've
  added (Rate & Cull, Face Review, Tag Manager, GPS Manager, Workflows) were
  a touch smaller than the ones in the built-in screens like Manage People
  and Albums. They're now the same size everywhere, so nothing looks
  slightly shrunk when you move between screens.
- Rate & Cull's own **control-size selector** (the three A's in the header)
  still lets you go bigger — "Normal" is now the standard app size, with
  Large and Extra-large above it for big screens, TVs, or tired eyes.

## v0.30.6 — 2026-07-16

Workflows can now ask much more precise questions — "any of these" instead
of only "all of these," whether a photo is in an album, and whether it's
inside *or* outside a spot on the map. Rate & Cull can be sized to suit
your screen and your eyes. Plus a distance bug that was quietly returning
the wrong photos, and a fix that gave 3.5 GB of disk back.

### Workflows

- **New:** conditions can be combined with **ALL** or **ANY**. ALL means
  every condition has to be true (this is what it always did, and stays
  the default); ANY means just one of them does. You choose per "If" node
  and per "Switch" case, and the wording between conditions changes to
  "AND" or "OR" so you can read the rule back.
- **New:** an **Album** condition — "in album" / "not in album," with a
  dropdown to pick the album. This replaces "Not in Specific Album," which
  made you paste in an album's internal ID. Any workflow already using the
  old condition keeps working exactly as before; it's just no longer
  offered when you add a new one.
- **New:** **Geo Radius** now works both ways — photos **inside** a radius
  or **outside** it. Handy for "everything that isn't from around home."
- **New:** you no longer type latitude and longitude into two separate
  boxes for Geo Radius. Search for a place by name ("Edmonton") and pick
  it, or paste the whole coordinate pair into one field however you copied
  it — Google Maps format, degrees, or the `53°32'46"N` style all work. If
  it can't read what you pasted, it says so instead of quietly dropping
  you at 0,0 like it used to. Pick a place by name and the node reads
  "Geo Radius inside: Edmonton (50km)" instead of raw numbers.
- **Fixed (important):** Geo Radius was measuring a **square, not a
  circle** — so it reached about 1.4× too far at the corners and let in
  photos that were never within the distance you asked for. On this
  library, a 50 km radius was returning 512 photos it shouldn't have, some
  of them roughly 70 km away. It now measures true distance, so the answer
  matches what you asked for.
- **New:** you can **delete a node** from the canvas using a button in its
  settings panel. (Selecting a node and pressing Delete always worked, but
  nothing said so — leaving stranded nodes with no obvious way to remove
  them.) Removing a node also removes the lines connecting it.
- **Changed:** the condition dropdown is now in alphabetical order rather
  than the order they happened to be written in.
- **Fixed:** every workflow run was recording a permanent row for every
  photo it looked at, forever — so the app's database had grown to **17.6
  million rows and 4.8 GB**, of which only 86,000 rows were actually
  meaningful. It now keeps one row per photo per workflow. The database is
  back down to 1.3 GB and workflow runs have one less thing slowing them
  down. This is applied automatically on upgrade; nothing to do.

### Rate & Cull

- **New:** a **grid size slider** in the bottom-left corner (the same
  control Manage People has). Thumbnails and their badges scale together,
  so the grid can be made genuinely large on a big screen or a TV.
- **New:** a **control size selector** in the header — the three A's. It
  scales the buttons, stars, and keyboard hints in both the bottom action
  bar and the full-screen viewer, in three steps: Normal, Large, and
  Extra-large. Useful if the standard controls read as too small.
  Both settings are remembered per browser, so each person can size it to
  their own display without affecting anyone else.
- **Fixed:** with several photos selected, the **R** (Reviewed) and **F**
  (Favorite) keys only ever switched *on* — there was no way to un-review
  or un-favorite a group. They now toggle: if everything selected is
  already marked, the key clears it; otherwise it applies to all of them.
- **New:** the GPS Manager photo grid gets the same size slider.

### Everywhere else

- **Changed:** every **album dropdown** in the app is now sorted
  alphabetically — Rate & Cull, GPS Manager, Geo Heatmap, Import Shared,
  the album picker dialog, and the workflow album condition and actions.
  They used to appear in whatever order they came back in, usually by
  date, which made finding an album by name a hunt. (The Manage Albums
  page is unchanged, since it has its own sort control that you set.)
- **Changed:** **Manage People** now shows only visible people by default.
  Hidden people were hidden on purpose, so they stay out of the way until
  you switch the Visibility dropdown to "Hidden" or "All."

## v0.30.5 — 2026-07-12

A small readability fix for the full-screen photo viewer in Rate & Cull.

- **Changed:** the controls along the bottom of the full-screen viewer used
  to share one faint strip that stretched across the whole width, which
  could wash out against a bright photo. Each group of controls (rating,
  pick status, review status, favorite, archive & trash) now sits on its
  own solid rounded chip, so the buttons stay easy to read no matter what's
  behind them. In light mode the chips are light with dark icons; in dark
  mode they're dark with light icons.

## v0.30.4 — 2026-07-11

Carried yesterday's Rate & Cull bottom-bar redesign into the full-screen
photo viewer, so both bars now match.

- **Changed:** the full-screen viewer's bottom controls are grouped into
  the same outlined boxes as the grid's selection bar (rating / pick
  status / review status / favorite / archive & trash), with the same
  small keyboard-key hints on each group.
- **Changed:** Pick/Reject and Favorite used to be single buttons you'd
  click again to undo — they're now explicit pairs (Pick/Reject/Unflag,
  Favorite/Unfavorite) that light up to show which one is active,
  matching the grid's selection bar.

## v0.30.3 — 2026-07-11

A big Rate & Cull filter/controls redesign, plus an app-wide tune-up
(speed, phone layouts, and one important safety fix) from a full review
of every added module.

### Rate & Cull

- **New:** the filters at the top right are now visual controls under a
  "Filters" label — pick-status icons (you can select more than one),
  actual clickable stars for the rating filter with a `<` / `>` / `=`
  button that changes how the stars are applied (no stars + `=` means
  "unrated"), review-status icons (also multi-select), and the same
  sort-direction toggle button used elsewhere in the app.
- **New:** "Select all" and "Deselect all" buttons sit next to the
  review-scope dropdown, and Cmd/Ctrl+A selects every loaded photo.
- **Changed:** the bottom action bar is redesigned — centered over the
  photo grid, controls grouped into the same outlined boxes as the top
  filters, labeled "Rating controls," with each group showing its
  keyboard key (1–5, P/X/U, R, F — these follow your remapped
  shortcuts). The long shortcut-hint line in the header is gone.
- **Changed:** the stars in the bottom bar now show the rating your
  selected photos share, and clicking the lit star clears the rating —
  the separate clear-rating button is gone.
- **Changed:** clearer icons — "Unflag" is now an empty circle (matching
  the picked check and rejected X), and "Unreviewed" is glasses with a
  slash through them so it no longer looks identical to "Reviewed."
- **Fixed:** the bottom bar's stars were invisible in the light theme.

### Everywhere else

- **Fixed (important):** the trash button in the photo preview really
  did delete permanently, even though this app promises deletions only
  ever go to Immich's recoverable trash. It now uses the trash, and the
  confirmation says so.
- **Fixed:** on phones, maps could render at desktop size and bleed out
  of the layout — every map in the app now resizes with its container.
  Also on phones: the Rate & Cull full-screen viewer no longer cuts off
  its bottom buttons, the photo-info panel stacks below the photo
  instead of squeezing it, and the location-tagging popup's map fits the
  screen.
- **Faster:** the GPS Manager map no longer rebuilds every pin whenever
  you hover a photo — hovering and selecting stay smooth even with
  hundreds of pins on screen. Several photo grids also got
  behind-the-scenes speedups for large selections.
- **Fixed:** small consistency touches — Face Review says "Deselect all"
  like everywhere else, GPS Manager uses the standard loading spinner,
  and Geo Heatmap's "Clear" button greys out properly when there's
  nothing to clear.

## v0.30.2 — 2026-07-10

Maps got a permanent fix, and a couple of small tidy-ups.

- **Fixed for good:** all maps in the app (GPS Manager, Geo Heatmap, the
  mini-map on a photo's info panel, and the location-tagging popup) now
  use the exact same map engine and map data as the main Immich app
  itself. This replaces the earlier raster map experiments — no more
  choosing between readable English labels and accurate, up-to-date
  streets/buildings; you get both, for free, with no API key.
- **Changed:** on the GPS Manager map, the selected pin/dot is grey with
  just an orange outline (no more blue fill), so it stays visually
  consistent with everything else and only the outline marks it as
  selected.
- **Changed:** "Copy Image GPS" and "Paste GPS" moved into the bar right
  above the photo grid, next to each other, instead of being split
  across the sidebar.
- **Changed:** using Copy or Paste GPS now automatically clears your
  photo selection afterward, since both are one-click actions on
  whatever was selected at the time.
- **Renamed:** "Location Manager" is now called "GPS Manager" everywhere
  in the app (same page, same URL — just a clearer name).
- **Changed:** "Potential Albums" moved down in the sidebar to sit below
  "Orphan Finder".

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
