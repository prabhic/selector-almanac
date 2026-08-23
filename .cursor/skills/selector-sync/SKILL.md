---
name: selector-sync
description: Pull remote main for new PPTX/deck data, then locally match the latest YouTube video and rebuild indexes so TUI and web stay current. Use when the user runs /selector-sync or asks to sync almanac data, pull CI decks, or refresh YouTube chapters.
disable-model-invocation: true
---

# Selector Sync

**Scope:** This repo only. Pulls `origin/main`, then local YouTube ingest. Do not outreach. Do not commit or push unless the user asks.

## Do this

From the repo root, run:

```bash
npm run ingest:sync
```

That is: `git fetch` + `git pull --ff-only origin main` (CI deck ingest) then `npm run ingest:refresh` (yt-dlp match + chapters + `npm run build`).

Needs **yt-dlp** on PATH. If the script fails because of that, tell the user `brew install yt-dlp`.

## If pull fails

Do **not** force, rebase, or stash unless the user asks. Report the git error. Usual cause: uncommitted `data/` from a previous sync colliding with a new CI commit — ask whether to commit those data files first.

## After success

Report briefly:

- Whether `main` moved
- New or updated weeks: date, YouTube id, chapter count (deck-only if still unmatched)
- That TUI and local web (`npm run serve` → `/app/`) read this `data/` after restart
- That changes are uncommitted

Do not open browse unless asked.
