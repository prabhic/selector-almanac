# Search architecture

How to evolve Selector Almanac from keyword matching to **meaningful, receipt-backed search** over Lev's seminar corpus.

## Problem today

1. **Typing lag** — each keystroke used to trigger a full DOM repaint (atlas SVG, concepts, etc.). Fixed: the search box keeps a local draft; results commit on **Enter** or **Ask**.
2. **Shallow matching** — `activeQ` is tokenized and matched with `indexOf` over titles, chapter names, and optional slide text. That works for exact terms (`MCP`, `DeepSeek`) but not for questions like *"when did tool use first show up?"* or *"what did Lev say about evals?"*.
3. **No ranked corpus** — every matching chapter is scored equally; there is no BM25, no semantic similarity, no "first mention" detection beyond sorting by date in the Receipts view.

## Design principles (from VISION)

- **Receipts first** — every hit must link to a real chapter title, YouTube timestamp, and slide. No invented summaries.
- **Derived index** — search is a lens on Lev's public videos/decks, not a replacement.
- **Static-first** — prefer build-time indexing and client-side retrieval so the app stays deployable as static files.

## Corpus size (current)

| Asset | Scale |
|-------|-------|
| Sessions | ~315 |
| Receipts (`pt[]` chapter/slide points) | ~6,070 |
| `index.json` | ~700 KB |
| `slides.json` | ~5.5 MB |

Small enough for a **single-machine build** and **in-browser retrieval** without a always-on server.

---

## Target architecture: hybrid retrieval

```
┌─────────────────────────────────────────────────────────────┐
│  User query (natural language or keywords)                  │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
              ┌─────────────────────────┐
              │  Query understanding     │  (optional, phase 3)
              │  expand synonyms, dates  │
              └─────────────┬───────────┘
                            ▼
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
┌───────────────┐                     ┌─────────────────┐
│ Keyword index │                     │ Vector index    │
│ BM25 / trigram│                     │ cosine / HNSW   │
│ exact names   │                     │ paraphrase Qs   │
└───────┬───────┘                     └────────┬────────┘
        └───────────────────┬──────────────────┘
                            ▼
              ┌─────────────────────────┐
              │  Reciprocal rank fusion  │
              │  + receipt metadata boost│
              └─────────────┬───────────┘
                            ▼
              ┌─────────────────────────┐
              │  Receipts UI (existing)  │
              │  grouped by session/date │
              └─────────────────────────┘
```

**Not** a chatbot that paraphrases Lev. Retrieval returns **his chapter titles and slide snippets** with deep links. An optional "answer" layer (phase 3) may synthesize *only* from retrieved chunks with inline citations.

---

## RAG corpus: what to index

Index at **receipt granularity**, not whole seminars.

### Chunk types

| Type | Source | `id` | Text to embed | Metadata |
|------|--------|------|---------------|----------|
| `chapter` | `pt[]` timed | `{sessionId}:{ptIndex}` | chapter title + session title + topics | `date`, `sec`, `slide`, `topic`, `timed` |
| `slide` | `slides.json` | `{sessionId}:s{slideNum}` | slide title + body text | `date`, `slide`, `sessionId` |
| `concept` | `concepts.json` | `concept:{key}` | label + example chapter titles | `first`, `last`, `kind` |
| `transcript` | future ingest | `{sessionId}:t{startMs}` | 30–60s caption window | `date`, `sec`, `sessionId` |

### Chunk text template (for embedding)

```
[2025-03-14] AI Weekly — Agents & MCP
Chapter: Model Context Protocol demo
Topics: agents, openai
```

Keep chunks **short** (title + one paragraph). Long slide bodies can be split into ~400-token windows with the same receipt anchor.

### What not to index

- Boilerplate ("welcome back", "agenda", outline-only chapters with no substance) — reuse `isNoiseChapter` from ingest.
- Raw HTML from slides.
- Duplicate slide + chapter text (dedupe at build time).

---

## Build pipeline

Add `scripts/build-search-index.mjs` (run after `build-index.mjs`):

```
seminars.json + concepts.json
        │
        ├─► data/search/chunks.jsonl     # one JSON object per line, receipt metadata
        ├─► data/search/lexical.json     # inverted index (term → chunk ids + tf)
        └─► data/search/vectors.bin      # float32 matrix OR sqlite with vec0
```

### Phase 1 — Lexical index (fast win)

- Tokenize, lowercase, strip stopwords (reuse `STOP` set).
- Store posting lists: `term → [{ id, tf, fieldBoost }]`.
- Score: BM25 or simple TF-IDF with boosts:
  - chapter title ×3
  - concept label ×2
  - slide body ×1
  - session title ×1.5
- Ship `lexical.json` (~1–2 MB). Client loads on first search or lazy-fetch.

**Handles:** `MCP`, `DeepSeek`, `RAG`, product names, acronyms.

### Phase 2 — Vector embeddings

**Build time** (recommended for static hosting):

```bash
# example: local embedding via transformers.js in Node, or API batch
node scripts/embed-chunks.mjs --model text-embedding-3-small
```

- Model: `text-embedding-3-small` (OpenAI, build-time API) or `Xenova/all-MiniLM-L6-v2` (fully local).
- ~6k chunks × 384–1536 dims → **9–36 MB** raw; quantize to int8 for ~6–12 MB.
- At query time: embed the user question (small API call or local model), cosine against index.
- 6k vectors × 384d brute-force in JS is **<50 ms** — no HNSW required yet.

**Handles:** *"tool calling" ↔ "function calling"*, *"when did agents become a theme?"*, conceptual paraphrase.

### Phase 3 — Hybrid + optional synthesis

1. Run lexical + vector in parallel.
2. **RRF merge**: `score = Σ 1/(k + rank_i)` with k≈60.
3. Boost: timed chapters > outline-only; recency optional toggle.
4. Optional LLM pass: input = top 20 chunks + question → output must cite `[sessionId:ptIndex]` only.

---

## Runtime (app)

| Phase | UX | Implementation |
|-------|-----|----------------|
| **Now** | Type freely; **Enter** to search | Draft in `_draftQ`; BM25 over `data/search/` |
| **1** ✅ | Ranked receipts on Ask | `npm run search:index` → chunks + lexical BM25 |
| **2** ✅ | Semantic + hybrid on Ask | `vectors.f32.bin` + browser query embed (MiniLM) |
| **3** | Optional "Summary" panel above receipts | Serverless `/api/ask` or client LLM with strict citation prompt |

Keep search **off the main paint path**:

- Web Worker for tokenization + BM25 + cosine.
- Main thread only renders results.

---

## Query modes

The search box should support two intents without a mode toggle:

| Intent | Example | Primary retrieval |
|--------|---------|-------------------|
| **Keyword** | `MCP`, `DeepSeek V3` | Lexical (high weight) |
| **Question** | `when did MCP first come up?` | Vector + date sort on hits |
| **Topic browse** | `agents` | Concepts index + lexical |

Heuristic: if query matches `/^(when\|what\|how\|why\|who)\b/i` or is >6 words, bump vector weight.

**"First mention"** is not embedding magic — sort semantic hits by `date` ascending and take the top receipt.

---

## Storage layout (proposed)

```
data/
  search/
    manifest.json      # version, chunk count, model id, dims
    chunks.jsonl       # id, type, text, sessionId, date, sec, slide, topic
    lexical.json       # inverted index
    vectors.f32.bin    # row-major float32, row i = chunk i
```

`manifest.json` lets the app lazy-load search assets only when the user first commits a query.

---

## Refresh cadence

1. Weekly ingest → `seminars.json`
2. `npm run index` → `index.json`, `slides.json`
3. `npm run search:index` → rebuild chunks + lexical + vectors (incremental: only embed new/changed chunks by content hash)

---

## Recommended rollout

| Step | Effort | Impact |
|------|--------|--------|
| ✅ Draft input, commit on Enter | Done | Fixes typing jank |
| Build `chunks.jsonl` + lexical index | ~1 day | Better ranking, still static |
| Precompute embeddings + cosine search | ~2 days | Semantic / question queries |
| Transcript chunks from YouTube captions | ingest work | Spoken nuance, more receipts |
| Optional cited summary | later | Nice-to-have, not core |

---

## Open questions

- [ ] Embed at build time via API (quality) vs local model (offline, no key)?
- [ ] Ship vectors in repo vs generate on first `npm run search:index` after clone?
- [ ] Transcript source: YouTube auto-captions vs Whisper — see VISION open questions.
- [ ] Privacy: query embedding API sends user questions to a third party — document in UI if used.

---

*Related: [data-model.md](./data-model.md), [ingest.md](./ingest.md), [VISION.md](../VISION.md).*
