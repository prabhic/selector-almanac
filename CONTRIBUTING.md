# Contributing

Thanks for helping improve Lev Selector Almanac.

## What to contribute

- Bug fixes in `app/` or `scripts/`
- Search / ingest quality improvements
- Documentation and accessibility
- Weekly data refresh PRs after new seminars (see below)

Please **do not** open PRs that remove attribution, rehost Lev's videos/slides, or add features that paraphrase seminar content without receipts.

## Development

```bash
npm install
npm run serve          # http://localhost:3456/app/
```

Full pipeline:

```bash
npm run ingest:quick   # or ingest / ingest:all
npm run build          # index + search corpus + vectors
```

## Data refresh PRs

When Lev publishes a new weekly seminar:

1. Run ingest + build locally
2. Commit updated files under `data/` (not `data/raw/`)
3. PR with date range in the title, e.g. `data: refresh through 2026-08-01`

## Before you open a PR

- Keep changes focused
- Test search and atlas views locally
- Confirm attribution strings in the UI remain accurate

See [ATTRIBUTION.md](ATTRIBUTION.md) and [VISION.md](VISION.md).
