# Lev Selector Almanac

**An unofficial, open-source index of [Lev Selector](https://www.youtube.com/@lev-selector)'s weekly AI seminars.**

Browse years of weekly talks and [GitHub slide decks](https://github.com/lselector/seminar) on one Atlas grid — searchable, with every match deep-linked to the exact YouTube moment and slide.

> **Not affiliated with Lev Selector** unless he chooses to adopt this project. All seminar content © Lev Selector. This is a derived lens, not a replacement — every view links back to his originals. See [ATTRIBUTION.md](ATTRIBUTION.md).

[![Live demo](https://img.shields.io/badge/demo-live-blue)](http://prabhanjan.in/selector-almanac/app/)

## Live demo

**[prabhanjan.in/selector-almanac/app/](http://prabhanjan.in/selector-almanac/app/)** · [GitHub repo](https://github.com/prabhic/selector-almanac)

Local:

```bash
npm install
npm run serve   # http://localhost:3456/app/
```

## Quick start (developers)

```bash
npm install
npm run ingest:quick   # weekly AI-Updates 2025–2026 (~1 min)
npm run build          # index.json + BM25 corpus + embedding vectors (~1 min)
npm run serve          # http://localhost:3456/app/
```

| Command | Purpose |
|---------|---------|
| `npm run ingest` | Ingest + slide text extraction |
| `npm run ingest:refresh` | Weekly: re-match recent YouTube + rebuild index/search/embed |
| `npm run ingest:all` | Full corpus 2021+ (slow; needs [yt-dlp](https://github.com/yt-dlp/yt-dlp)) |
| `npm run index` | Rebuild `data/index.json` |
| `npm run search:index` | Rebuild BM25 search corpus |
| `npm run search:embed` | Rebuild semantic vectors (`vectors.f32.bin`) |
| `npm run build` | All of the above |

## Features

- **Atlas** — topic heatmap across months; pin threads; cell drill-down with matches
- **Concepts** — longitudinal threads with dossiers and timestamps
- **Results** — hybrid BM25 + semantic search (press **Enter**); ranked hits with YouTube `&t=` links and slide anchors
- **Sessions** — reverse-chronological browse

Hosting is **fully static** — GitHub Pages works; no server required. See [docs/search.md](docs/search.md).

## Layout

| Path | Purpose |
|------|---------|
| [VISION.md](VISION.md) | Product vision |
| [ATTRIBUTION.md](ATTRIBUTION.md) | Content & software attribution |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [docs/OUTREACH.md](docs/OUTREACH.md) | Template message for Lev |
| `scripts/` | Ingest + index pipeline |
| `data/` | Derived JSON index (committed) |
| `app/` | Static UI |

## Data refresh

TUI and the web app both read the same committed `data/` (sessions → `seminars.json` + search index). There is one corpus.

**GitHub Actions (Saturday):** new PPTX from [`lselector/seminar`](https://github.com/lselector/seminar) and slide text only. It does **not** call YouTube.

**Local (your machine, weekly, needs [yt-dlp](https://github.com/yt-dlp/yt-dlp)):** match videos and chapters, then push `data/`:

```bash
npm run ingest:refresh          # re-match YouTube for last 4 weeks + pending decks, then rebuild search
# or one session:
node scripts/refresh-recent.mjs --date 2026-07-31 && npm run build
```

Re-parse PPTX locally when needed: `npm run ingest:refresh:parse`.

**Full corpus rebuild** (new decks in GitHub, annual backfill):

```bash
npm run ingest:all && npm run build
```

Commit updated `data/` (not `data/raw/`, which is gitignored). First semantic search in the browser downloads the MiniLM model (~23 MB, once cached).

## Publish to GitHub Pages

1. Create a **public** repo on GitHub and push this project:

   ```bash
   git init
   git add .
   git commit -m "Initial commit: Lev Selector Almanac"
   git branch -M main
   git remote add origin https://github.com/prabhic/selector-almanac.git
   git push -u origin main
   ```

2. In the repo: **Settings → Pages → Build and deployment**
   - Source: **GitHub Actions**
3. Push to `main` — the [pages workflow](.github/workflows/pages.yml) deploys the repo root.
4. Open [prabhanjan.in/selector-almanac/app/](http://prabhanjan.in/selector-almanac/app/)

## Share with Lev

Outreach issue: [lselector/seminar#4](https://github.com/lselector/seminar/issues/4)

See [docs/OUTREACH.md](docs/OUTREACH.md) for YouTube comment templates.

## License

- Software: [MIT](LICENSE)
- Seminar content: © [Lev Selector](https://www.youtube.com/@lev-selector)
