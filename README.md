# Truong Tracker

A tracker for work and personal items. Two sections, **Work** and **Personal**; each holds **categories**, each
category holds **items**, and each item can carry a **checklist**, a status, a priority, a due date, notes and links.
A **Today** page lists what is overdue, due this week, blocked or in progress.

It is a static web page (no server, no account). Your items are JSON files in a folder **you** choose, normally a
Google Drive for desktop folder, so they sync between your computers and never go anywhere else.

## Use it

1. Open the site in **Google Chrome** or **Microsoft Edge** on a computer.
2. Click **Choose data folder** and pick (or make) **My Drive › Truong Tracker Data**.
3. Open **Work** or **Personal**, click **Add category**, then type items into the *Add an item* box.
4. On your other computer, open the same site and choose the same Drive folder.

**iPhone:** open the site in Safari, tap **Sign in with Google**, then **Share › Add to Home Screen**. The phone reads
and saves the same Drive folder through Google, keeps a copy on the phone, and works without signal. It needs a
one-time Google sign-in key: see [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md).

**How to use** inside the app has the details. **Settings › Back up** downloads everything as one file;
**Load from a file** brings a backup (or a starter list) back.

## Install

Click **Install** in the top bar (Chrome / Edge) to add it as an app. It opens without internet; Google Drive syncs
your changes when you are back online.

## For developers

- Plain HTML/CSS/JS, no build step. Serve the folder over `http://localhost` (or GitHub Pages) and open `index.html`;
  the folder picker and offline copy need https or localhost.
- Tests: `node tests/model.test.js` (logic), `node tests/drive.test.js` (Google sign-in pieces) and
  `node tests/offline.test.js` (offline file list).
- After changing any app file, bump `?v=N` in `index.html` **and** `VERSION` in `sw.js`.
- Read `AGENTS.md`, `docs/DECISIONS.md` and `docs/LESSONS.md` first. This repo is public: never commit data files.
