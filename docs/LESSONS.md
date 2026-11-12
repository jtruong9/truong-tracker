# Lessons

Approaches that took more than two tries, or traps worth remembering. Newest at the bottom.

## 2026-11 — Clear an input before saving from it
The page skips redrawing while a quick-add or add-step box holds typing (so a sync from the other computer doesn't wipe
what is being typed). Saving an item while the box still held its title meant the redraw was skipped and the new item
didn't appear. **Empty the box first, then save.**

## 2026-11 — Testing the folder picker
Chrome's real folder picker can't be driven by a test. The browser test replaces `showDirectoryPicker` with an
in-memory folder and runs two browser contexts against it, so the two-computer merge is exercised for real. Scope row
selectors to the visible page: the hidden Today page holds copies of the same rows.

## 2026-11 — Testing the phone sign-in
Playwright can't fulfill a 302, so the fake Google page sends the browser back with `location.replace`. Route fake
Google by **host**, not by a regex on the URL: the sign-in address contains `googleapis.com` in its scope parameter,
so a URL regex sends it to the fake Drive instead. Block service workers in the phone test (`serviceWorkers: 'block'`):
requests a service worker makes are invisible to page routing and would go to the real Google.

## 2026-11 — iPhone Safari zooms into small boxes
Any input, select or textarea under 16px makes Safari zoom in when it's tapped. On phones every box is 16px; the
phone test checks it.

## 2026-11 — Browser tests and a new default layout
The board became the default on wide windows, so the existing tests (written for the list at 1300-1400 px) failed on
their first list selector. They now set `layout: "list"` in the view state before the app loads, and the board has
its own test. **When a default view changes, pin the old tests to the view they test.**
