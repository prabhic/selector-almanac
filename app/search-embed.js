/**
 * Browser-side query embedder (lazy-loaded transformers.js).
 * Vectors are precomputed at build time; only the query is embedded at runtime.
 */

import { EMBED_DIMS, EMBED_MODEL, l2Normalize } from "./search-math.js";

let embedderPromise = null;

async function loadEmbedder() {
  if (!embedderPromise) {
    embedderPromise = (async () => {
      const { pipeline, env } = await import(
        "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm"
      );
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      return pipeline("feature-extraction", EMBED_MODEL);
    })();
  }
  return embedderPromise;
}

/** @returns {Promise<Float32Array>} */
export async function embedQuery(text) {
  const extractor = await loadEmbedder();
  const out = await extractor(text, { pooling: "mean", normalize: true });
  const vec = new Float32Array(EMBED_DIMS);
  for (let d = 0; d < EMBED_DIMS; d++) vec[d] = out.data[d];
  return l2Normalize(vec);
}

export function embedderLoading() {
  return !!embedderPromise;
}
