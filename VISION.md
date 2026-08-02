# Selector Almanac — Vision

**An aggregated, trend-aware home page for Lev Selector's weekly AI talks.** One place that turns years of his weekly YouTube seminars + the matching GitHub slide decks into a browsable, searchable timeline of what he covered, *when* — with every claim deep-linked back to the exact video moment and the exact slide.

> An *almanac* of Lev Selector's weekly AI seminars: a week-by-week record you can search and trace, built to surface how the field evolved.

## Why this exists

Lev Selector has run a **weekly AI/data-science seminar since January 2021** ([YouTube @lev-selector](https://www.youtube.com/@lev-selector)), with slides published in his [`lselector/seminar`](https://github.com/lselector/seminar) GitHub repo (PPTX, with `PDF_versions/` subfolders). That's a rare, longitudinal, week-by-week record of how the AI field actually evolved — but it's scattered across dozens of videos and decks with no way to see the arc.

The value isn't the individual talks (those exist). It's the **aggregation across time**: seeing how a topic (agents, RAG, fine-tuning, model releases…) rose, changed, and what Lev said about it *at each point*, with receipts.

## What it does

1. **Aggregated home page** — every seminar as a card: date, title, topics, video, slide deck. One glance across the whole run.
2. **Trend extraction per topic** — pick a topic (e.g. "agents", "RAG", "open models") and see its timeline: when it first appeared, how often it recurred, how the framing shifted.
3. **Deep references — the core feature** — every extracted point links to:
   - the **exact YouTube timestamp** (`...&t=` deep link) where Lev said it, and
   - the **corresponding slide / section** in that week's PPT/PDF.
   No paraphrase without a receipt.
4. **Search across the whole corpus** — free-text and topic search over titles, slide text, and (where available) transcripts.

## Attribution & intent

**This is built on and about Lev Selector's work, with full credit to him.** All content originates from his public YouTube channel and public GitHub repo. The app is a *derived index/lens*, not a replacement — every view points back to his originals. We may eventually **share this with Lev himself** and offer it to him; design every screen so attribution and back-links to his sources are prominent and correct. Respect his licensing on the repo.

## First-cut approach (to be refined)

- **Ingest**
  - Slides: clone/track [`lselector/seminar`](https://github.com/lselector/seminar); parse PPTX → per-slide text + section structure; map each deck to its seminar date/topic.
  - Videos: pull the channel's video list (titles, dates, IDs, chapters/timestamps); transcripts where available.
  - Link decks ↔ videos by date/title.
- **Model** — one record per seminar: `{date, title, topics[], videoId, chapters[], deckPath, slides[]}`; a topic index across all seminars; extracted "points" each carrying `{claim, videoId+t, deckSlide}`.
- **Extract trends** — LLM pass over slide text + transcript to tag topics and pull dated claims, each with its timestamp + slide anchor (never a claim without both).
- **Home page** — static, self-contained first (like the other lab apps): timeline + topic filter + search + a detail view per seminar with the video embed and slide thumbnails, all deep-linked.

## Layout

- `data/` — ingested corpus (raw slides/transcripts gitignored; derived JSON index committed).
- `docs/` — this vision, data-model notes, and the ingest/extraction design.
- `app/` — the home page (add once the data model is settled).

## Open questions

- [ ] Transcript source: YouTube auto-captions vs. whisper — accuracy for timestamped claims?
- [ ] How reliably can deck↔video be auto-matched by date/title? Manual map as fallback?
- [ ] Topic taxonomy: fixed list vs. emergent/LLM-derived clusters?
- [ ] Refresh cadence — weekly re-ingest to keep current with new seminars.

---

*Sources: [YouTube @lev-selector](https://www.youtube.com/@lev-selector) · [GitHub lselector/seminar](https://github.com/lselector/seminar). Created 2026-07-31.*
