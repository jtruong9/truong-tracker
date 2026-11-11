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
