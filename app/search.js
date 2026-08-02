/**
 * Hybrid search: BM25 lexical + semantic vectors (RRF merge).
 */
import { embedQuery } from "./search-embed.js";
import { EMBED_DIMS, rrfMerge, searchVectors } from "./search-math.js";

const STOP = new Set([
  "the", "a", "an", "of", "in", "on", "to", "and", "or", "for", "is", "was", "did", "does", "do",
  "when", "what", "how", "why", "who", "first", "about", "with", "it", "he", "lev", "talk", "talked",
  "say", "said", "cover", "covered", "up", "come", "came", "that", "this", "are", "were", "be", "been",
  "has", "have", "had", "will", "would", "can", "could", "should", "may", "might", "into", "from",
]);

const K1 = 1.2;
const B = 0.75;

export function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9+.#-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function isQuestionQuery(q) {
  return /^(when|what|how|why|who|where|which)\b/i.test(q) || q.split(/\s+/).length > 5;
}

function searchBm25(lexical, query, { allowedIds, limit = 200, minScore = 0.01 } = {}) {
  const terms = tokenize(query);
  if (!terms.length) return [];

  const allowed = allowedIds ? new Set(allowedIds) : null;
  const scores = new Map();

  for (const term of terms) {
    const hits = lexical.postings[term];
    if (!hits) continue;
    const idf = Math.log(1 + (lexical.N - lexical.df[term] + 0.5) / (lexical.df[term] + 0.5));
    for (const [docId, tf] of hits) {
      if (allowed && !allowed.has(docId)) continue;
      const dl = lexical.docLens[docId] ?? 1;
      const denom = tf + K1 * (1 - B + B * (dl / lexical.avgdl));
      const score = idf * ((tf * (K1 + 1)) / denom);
      scores.set(docId, (scores.get(docId) ?? 0) + score);
    }
  }

  const out = [];
  for (const [id, score] of scores) {
    if (score >= minScore) out.push({ id, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

export class SearchIndex {
  constructor() {
    this.chunks = null;
    this.lexical = null;
    this.manifest = null;
    this.vectors = null;
    this.loading = null;
    this.error = null;
    this._cache = new Map();
    this._embedFailed = false;
  }

  load(base = "../data/search") {
    if (this.chunks) return Promise.resolve(this);
    if (this.loading) return this.loading;

    this.loading = Promise.all([
      fetch(`${base}/manifest.json`).then((r) => {
        if (!r.ok) throw new Error(`manifest.json ${r.status}`);
        return r.json();
      }),
      fetch(`${base}/chunks.json`).then((r) => {
        if (!r.ok) throw new Error(`chunks.json ${r.status}`);
        return r.json();
      }),
      fetch(`${base}/lexical.json`).then((r) => {
        if (!r.ok) throw new Error(`lexical.json ${r.status}`);
        return r.json();
      }),
      fetch(`${base}/vectors.f32.bin`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null),
    ])
      .then(([manifest, chunks, lexical, vecBuf]) => {
        this.manifest = manifest;
        this.chunks = chunks;
        this.lexical = lexical;
        if (vecBuf && manifest.embed?.dims) {
          this.vectors = new Float32Array(vecBuf);
        }
        return this;
      })
      .catch((err) => {
        this.error = err;
        throw err;
      });
    return this.loading;
  }

  hasVectors() {
    return !!(this.vectors && this.manifest?.embed?.dims);
  }

  _allowedIds(opts) {
    if (!opts.sessionIds?.size && !opts.sessionIds?.length) return null;
    const allow = opts.sessionIds instanceof Set ? opts.sessionIds : new Set(opts.sessionIds);
    return this.chunks.filter((c) => c.sid && allow.has(c.sid)).map((c) => c.i);
  }

  _cacheKey(query, opts) {
    const ids = opts.sessionIds instanceof Set ? [...opts.sessionIds] : (opts.sessionIds ?? []);
    return `${query}\t${ids.sort().join(",")}`;
  }

  searchLexical(query, opts = {}) {
    if (!this.chunks || !this.lexical) return [];
    const q = (query || "").trim();
    if (!q) return [];
    return searchBm25(this.lexical, q, {
      allowedIds: this._allowedIds(opts),
      limit: opts.limit ?? 200,
    });
  }

  async searchVector(query, opts = {}) {
    if (!this.hasVectors() || this._embedFailed) return [];
    const q = (query || "").trim();
    if (!q) return [];

    const dims = this.manifest.embed.dims;
    const count = this.manifest.embed.chunks ?? this.chunks.length;
    const qVec = await embedQuery(q);
    return searchVectors(qVec, this.vectors, dims, count, {
      allowedIds: this._allowedIds(opts),
      limit: opts.limit ?? 200,
      minScore: opts.minVectorScore ?? 0.25,
    });
  }

  /**
   * Hybrid BM25 + semantic search (RRF). Async when vectors are available.
   * @returns {Promise<Array<{ score: number, chunk: object, mode?: string }>>}
   */
  async search(query, opts = {}) {
    await this.load();
    const q = (query || "").trim();
    if (!q) return [];

    const key = this._cacheKey(q, opts);
    if (this._cache.has(key)) return this._cache.get(key);

    const limit = opts.limit ?? 200;
    const lexical = this.searchLexical(q, { ...opts, limit });

    let ranked;
    let mode = "lexical";

    if (this.hasVectors() && !this._embedFailed) {
      try {
        const vector = await this.searchVector(q, { ...opts, limit });
        const lists = [lexical];
        lists.push(vector);
        if (isQuestionQuery(q)) lists.push(vector);
        ranked = rrfMerge(lists).slice(0, limit);
        mode = vector.length ? "hybrid" : "lexical";
      } catch {
        this._embedFailed = true;
        ranked = lexical;
      }
    } else {
      ranked = lexical;
    }

    const hits = ranked.map(({ id, score }) => ({
      score,
      chunk: this.chunks[id],
      mode,
    }));
    this._cache.set(key, hits);
    return hits;
  }

  /** @returns {Promise<string[]>} */
  async sessionIds(query, opts = {}) {
    const hits = await this.search(query, opts);
    const seen = new Set();
    const ids = [];
    for (const { chunk } of hits) {
      if (!chunk.sid || seen.has(chunk.sid)) continue;
      seen.add(chunk.sid);
      ids.push(chunk.sid);
    }
    return ids;
  }

  clearCache() {
    this._cache.clear();
  }
}

export const searchIndex = new SearchIndex();
