# Ingest pipeline

`npm run ingest` rebuilds `data/seminars.json`, `data/topics.json`, and `data/meta.json`.

## Sources

| Source | Method |
|--------|--------|
| Slide decks | GitHub API tree on [`lselector/seminar`](https://github.com/lselector/seminar) |
| Videos | `yt-dlp` flat playlist on [@lev-selector](https://www.youtube.com/@lev-selector) |
| Chapters | Parsed from YouTube video descriptions (`00:00 Title` lines) |
| Slide text | Optional PPTX download → `jszip` XML parse (`--quick` skips) |

## Matching deck ↔ video

1. Normalize dates from deck filenames (`2025-01-03-…`, `21-01-22-…`).
2. Normalize dates from video titles (`… January 3, 2025`).
3. Pair on exact ISO date; fall back to ±3 day window for timezone skew.
4. Unmatched decks and videos are kept with `match.confidence: "unmatched"`.

## Topic tagging (v1)

Keyword rules over titles, chapter names, and slide text — no LLM pass yet. See `scripts/lib/topics.mjs`.

## Flags

- `--quick` — skip PPTX download/parse (faster; slides array empty)
- `--limit N` — process only N decks (debug)

Requires `yt-dlp` on PATH (`brew install yt-dlp`).
