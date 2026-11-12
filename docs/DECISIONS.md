# Decision log

Newest at the bottom. Format: **Decided / Why / Rejected**. Flag it before going against a logged decision.
Public file: no real item names or data.

## 2026-11 — A separate app, built like the family finances app
- **Decided:** A new static GitHub Pages app in its own repo, using the same storage design as the owner's finance app
  (one event-log file per computer in a Google Drive folder) and the same neutral, minimal look (Inter, one blue accent).
- **Why:** Works offline, nothing to host, the data stays in the owner's own Drive, and it syncs between computers
  without conflict copies. Proven in the finance app.
- **Rejected:** Browser-only storage with Export/Import (no sync, and clearing site data erases it). A page inside the
  finance app (its data folder is shared with another person, who would then see the work items).

## 2026-11 — Data folder: one personal Google Drive folder for both sections
- **Decided:** Work and Personal live in the same folder, the owner's personal Google Drive.
- **Why:** The owner's choice: both sections open on every computer.
- **Consequence:** the app reminds the user, on the Work page and in the item editor, to keep work items to names and
  status (no controlled or proprietary details).
- **Rejected:** Work data on the employer's storage and personal data on Google Drive (two folders; work items only on
  the work computer). Everything on the employer's storage.

## 2026-11 — Three levels: category › item › checklist
- **Decided:** Section › category › item, and each item has a flat checklist of steps. Items show checklist progress;
  categories roll up done / total, overdue and blocked.
- **Why:** The owner's choice. Enough for "a build with its steps" without a deep tree to manage.
- **Rejected:** Category › item only (no steps). Unlimited nesting (busier tree, harder to scan).

## 2026-11 — What an item tracks, and the Today page
- **Decided:** Status (To do / In progress / Blocked / Done), priority (High / Medium / Low / none), due date, notes,
  links. Today = overdue, due today, due in the next 7 days, blocked, in progress; each open item appears once (a date
  group wins over a status group); filter Both / Work / Personal. The Today badge counts overdue + due today.
- **Why:** The owner asked for all four (status + due, priority, notes + links, a today/this-week view).

## 2026-11 — Small data files: compaction
- **Decided:** Before each write, this computer's file keeps only its latest event per thing (`Model.compact`).
- **Why:** Ticking checklist steps makes many edits; without this the file grows forever. The merged state is
  unchanged (tested), because the latest event per thing wins.
- **Rejected:** Keeping full history (no use for it here; backups cover recovery).

## 2026-11 — Deleting a category deletes its items
- **Decided:** After a confirm that says how many items go with it. Items whose category is gone (another computer
  deleted it, or a partial backup) show in a "No category" card until moved.
- **Why:** Simplest; a backup file brings them back.

## 2026-11 — iPhone: the same web app, signed in to Google Drive
- **Decided:** No store app. The same site works on the iPhone (Safari, Add to Home Screen). Where the folder picker
  doesn't exist, the app signs in to Google with a full-page redirect and reads and writes the same Drive folder
  through the Drive API, as one more device with its own `tracker-<id>.json`. The phone keeps a full copy in
  IndexedDB, opens and edits offline, and writes waiting edits on the next sync. Computers are unchanged.
- **Why:** The owner's choice. One codebase, the data stays in the owner's Drive, the event-log design already merges
  any number of devices.
- **Scope `drive` (full Drive):** the folder and files were created by Google Drive for desktop, and Google's
  `drive.file` scope only sees files this app created or the user opened with it. Narrower options (a picker on
  every new file) don't fit a folder another device keeps writing to.
- **Token flow, no Google script:** a redirect works in iPhone Safari and installed home-screen apps, where popups
  and third-party scripts are unreliable. The cost: the token lasts an hour, renewed by a quiet redirect; in Google's
  "Testing" status Google may ask to sign in again more often.
- **Rejected:** A Firebase database (moves the data out of Drive; needs Google sign-in on the work laptop too). An App
  Store app (yearly developer fee, signing, review, and it would still need one of the above for sync).

## 2026-11 — Gifts section
- **Decided:** A third section, **Gifts**, where a category is a **person** and an item is a **gift**. Gifts have their
  own statuses (Idea / Bought / Wrapped / Given), a **price** and a free-text **occasion** (with suggestions from earlier
  ones and an occasion filter); they keep the due date, notes, links and checklist, and drop priority. Each person and
  the page show counts per status and **spent** (price of bought, wrapped and given). Gifts appear on Today only when
  due in the next 7 days or late.
- **Why:** The owner's choices (gift statuses + price; occasion as a field; Today only when due soon). Same data model
  and storage: just a new section value plus two optional item fields, so old data and other devices are unaffected.
- **Rejected:** A budget per person (not chosen). Person › occasion › gift (an extra level). Gifts identical to tasks
  (no price or gift stages). Showing every bought gift on Today (keeps surprises off the main screen).
- **Moving an item between a person and a task category** re-fits its status (`Model.fitStatus`: finished stays
  finished, anything else starts the new section's first status). A task keeps any price / occasion it had, unused.

## 2026-11 — Board view and category colors
- **Decided:** On a computer (window 901 px or wider), Work, Personal and Gifts open as a **board**: one column per
  category, its items as cards (chips, title, the first 4 steps tickable on the card, status), finished items folded
  under a per-column "Completed" (gifts: "Given") line. A **Board / List** switch keeps the list one click away; the
  choice is per computer (`localStorage` view state, key `layout`). Phones and narrow windows always get the list.
- **Colors:** a category has an optional `color`, one of 10 preset keys (`Model.COLORS`); `""` = none. It colors the
  board column's bar and each card's left edge, and shows as a stripe on the list's category card (phones too).
  Old categories load with no color; an unknown key is dropped (`Model.normCat`).
- **Why:** The owner's choices: a Planner-style card, 10 swatches shown on the phone as a stripe, a Board / List
  switch, no drag and drop for now. Colors are presets so every one reads well on the white background.
- **Rejected:** A free color picker (some picks unreadable). Board only (the list stays useful for long lists). Drag
  and drop (later, if wanted): items move between categories in the editor, columns with the left / right arrows.
- On the board the Open / All / Done switch is hidden: finished items are always reachable under Completed. The
  priority, occasion and search filters still apply to every card.
