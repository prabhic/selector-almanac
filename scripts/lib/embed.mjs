/** Embedding helpers — build (Node) and query (browser) share normalization. */
import { createHash } from "node:crypto";

export const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBED_DIMS = 384;

/** Short content hash — reuse vector when embed text unchanged. */
export function embedTextHash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Copy one normalized vector row between row-major matrices. */
export function copyVectorRow(src, srcRow, dst, dstRow, dims = EMBED_DIMS) {
  const srcOff = srcRow * dims;
  const dstOff = dstRow * dims;
  for (let d = 0; d < dims; d++) dst[dstOff + d] = src[srcOff + d];
}

/** @param {Float32Array|number[]} vec */
export function l2Normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

/**
 * Brute-force cosine search (vectors are L2-normalized → dot product).
 * @param {Float32Array} queryVec
 * @param {Float32Array} matrix row-major [count * dims]
 */
export function searchVectors(queryVec, matrix, dims, count, { allowedIds, limit = 200, minScore = 0.2 } = {}) {
  const allowed = allowedIds ? new Set(allowedIds) : null;
  const out = [];

  for (let i = 0; i < count; i++) {
    if (allowed && !allowed.has(i)) continue;
    const off = i * dims;
    let dot = 0;
    for (let d = 0; d < dims; d++) dot += queryVec[d] * matrix[off + d];
    if (dot >= minScore) out.push({ id: i, score: dot });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/** Reciprocal rank fusion across ranked id lists. */
export function rrfMerge(lists, k = 60) {
  const scores = new Map();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const id = item.id;
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, score }));
}
