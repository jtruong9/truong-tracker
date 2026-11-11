# AGENTS.md: context for AI assistants working on Truong Tracker

Read this first, then `docs/DECISIONS.md` (why things are the way they are) and `docs/LESSONS.md` (mistakes not to
repeat). `CLAUDE.md` points here.

> **This repository is PUBLIC.** It holds code and design notes only. Never commit tracker data: the
> `tracker-*.json` data files, backups, starter lists, or real item names. Many items are about the owner's job, so
> keep employer names, project names, program names and anything work-related out of code, tests and docs; use
> made-up examples ("Projects", "Build #1", "Home"). `.gitignore` blocks `*.json`; don't weaken it.

## What this is

A personal tracker for one person's work and personal items. Static site (no build, no server, no backend), served by
GitHub Pages from the owner's personal account. Desktop Chrome / Edge only (File System Access API). Data lives in a
Google Drive for desktop folder the user picks.

## The model

```
Section (work | personal)
  └─ Category  { id, section, name, order }
       └─ Item { id, section, categoryId, title, status, priority, due, notes, links[], checklist[], created, updated, doneAt }
            └─ checklist step { text, done }
```
- `status`: `todo | doing | blocked | done`. `priority`: `high | med | low | ""`. `due`: `YYYY-MM-DD` local date or `""`.
- An item's `section` always follows its category's section.
- Links are only `http(s)` (`Model.safeUrl`), opened with `target=_blank rel=noopener noreferrer`.

## Storage (same design as the owner's family finances app)

- One **append-only event log per computer**: `tracker-<deviceId>.json` in the chosen folder. A computer writes only its
  own file and reads every `tracker-*.json`, so Drive sync never has two writers on one file.
- Events: `cat`, `cat-del`, `item`, `item-del`, `cfg`. State = replay by `(ts, id)`; the latest event per thing wins.
- `Model.compact` keeps only this computer's latest event per thing before every write, so the file stays small. It
  can't change the merged state: an older event of ours can never win over our own newer one.
- View-only state (open rows, filters, menu) is per computer in `localStorage` (`truong-tracker.view`), never in the data.

## Files

`index.html` (markup + How to use), `css/app.css`, `js/icons.js`, `js/model.js` (pure logic, tested in node),
`js/store.js` (files + merge), `js/app.js` (pages and actions), `js/offline.js` + `sw.js` (offline copy, Install,
Update bar), `tests/`.

## Rules

- After changing any app file, bump `?v=N` in `index.html` and `VERSION` + the file list in `sw.js`
  (`tests/offline.test.js` fails otherwise).
- Run `node tests/model.test.js` and `node tests/offline.test.js` before committing.
- The owner's preferences: ask before assuming, simplest solution first, don't touch unrelated code, say when unsure,
  show 2–3 options before big changes, US spelling. Log decisions in `docs/DECISIONS.md`, approaches that took more
  than 2 tries in `docs/LESSONS.md`.
- The owner pushes to GitHub himself. Commit with `jtruong9@users.noreply.github.com`, never a work address.
