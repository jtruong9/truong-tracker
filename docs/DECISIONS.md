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
