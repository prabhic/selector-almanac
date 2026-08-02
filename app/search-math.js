/** Shared search math — mirrored in scripts/lib/embed.mjs */

export const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBED_DIMS = 384;

export function l2Normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

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

export function rrfMerge(lists, k = 60) {
  const scores = new Map();
  for (const list of lists) {
    list.forEach((item, rank) => {
      scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, score }));
}
