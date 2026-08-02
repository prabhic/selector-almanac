/**
 * BM25 lexical index — used at build time; mirrored in app/search.js for retrieval.
 */
import { tokenize } from "./tokenize.mjs";
import { chunkTermWeights } from "./corpus.mjs";

const K1 = 1.2;
const B = 0.75;

/** @param {import('./corpus.mjs').buildSearchChunks extends (...args: any) => infer R ? R : never} chunks */
export function buildBm25Index(chunks) {
  const docLens = [];
  const docTerms = [];

  for (let i = 0; i < chunks.length; i++) {
    const tf = {};
    let len = 0;
    for (const { text, boost } of chunkTermWeights(chunks[i])) {
      const counts = {};
      for (const term of tokenize(text)) {
        counts[term] = (counts[term] ?? 0) + 1;
      }
      for (const [term, n] of Object.entries(counts)) {
        tf[term] = (tf[term] ?? 0) + n * boost;
        len += n * boost;
      }
    }
    docLens.push(len || 1);
    docTerms.push(tf);
  }

  const N = chunks.length;
  const avgdl = docLens.reduce((a, b) => a + b, 0) / Math.max(N, 1);
  const postings = Object.create(null);
  const df = Object.create(null);

  for (let i = 0; i < N; i++) {
    for (const [term, tf] of Object.entries(docTerms[i])) {
      if (!postings[term]) postings[term] = [];
      postings[term].push([i, tf]);
      df[term] = (df[term] ?? 0) + 1;
    }
  }

  return { v: 1, N, avgdl, df, postings };
}

/**
 * @param {ReturnType<typeof buildBm25Index>} index
 * @param {string} query
 * @param {{ allowed?: Set<number>|number[], limit?: number, minScore?: number }} opts
 */
export function searchBm25(index, query, opts = {}) {
  const terms = tokenize(query);
  if (!terms.length) return [];

  const allowed = opts.allowed
    ? opts.allowed instanceof Set
      ? opts.allowed
      : new Set(opts.allowed)
    : null;
  const limit = opts.limit ?? 200;
  const minScore = opts.minScore ?? 0.01;
  const scores = new Map();

  for (const term of terms) {
    const hits = index.postings[term];
    if (!hits) continue;
    const idf = Math.log(1 + (index.N - index.df[term] + 0.5) / (index.df[term] + 0.5));
    for (const [docId, tf] of hits) {
      if (allowed && !allowed.has(docId)) continue;
      const dl = index.docLens?.[docId] ?? 1;
      const denom = tf + K1 * (1 - B + B * (dl / index.avgdl));
      const score = idf * ((tf * (K1 + 1)) / denom);
      scores.set(docId, (scores.get(docId) ?? 0) + score);
    }
  }

  const out = [];
  for (const [docId, score] of scores) {
    if (score >= minScore) out.push({ id: docId, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/** Attach docLens to index for search (not needed in shipped lexical if we embed dl per posting). */
export function attachDocLens(index, chunks) {
  const docLens = [];
  for (const chunk of chunks) {
    let len = 0;
    for (const { text, boost } of chunkTermWeights(chunk)) {
      len += tokenize(text).length * boost;
    }
    docLens.push(len || 1);
  }
  return { ...index, docLens };
}
