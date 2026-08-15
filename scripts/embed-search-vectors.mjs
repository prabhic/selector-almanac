#!/usr/bin/env node
/**
 * Embed search chunks with Xenova/all-MiniLM-L6-v2 → data/search/vectors.f32.bin
 *
 * Incremental by default: reuses vectors when chunk key + embed-text hash unchanged.
 * Set FULL_EMBED=1 to force a full rebuild (model change, cache corruption).
 *
 * Requires chunks.json (run build-search-index.mjs first).
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@xenova/transformers";
import { buildSearchChunks, chunkEmbedText, chunkStableKey } from "./lib/corpus.mjs";
import {
  EMBED_DIMS,
  EMBED_MODEL,
  copyVectorRow,
  embedTextHash,
  l2Normalize,
} from "./lib/embed.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const SEARCH = join(DATA, "search");
const EMBED_STATE_PATH = join(SEARCH, "embed-state.json");

const BATCH = parseInt(process.env.EMBED_BATCH || "24", 10);
const LIMIT = process.env.EMBED_LIMIT ? parseInt(process.env.EMBED_LIMIT, 10) : null;
const FORCE_FULL = process.env.FULL_EMBED === "1" || process.env.FULL_EMBED === "true";

async function loadFullChunks() {
  const seminars = JSON.parse(await readFile(join(DATA, "seminars.json"), "utf8"));
  let concepts = [];
  try {
    concepts = JSON.parse(await readFile(join(DATA, "concepts.json"), "utf8"));
  } catch {
    /* optional */
  }
  return buildSearchChunks(seminars, concepts);
}

function tensorRow(tensor, row, dims) {
  const out = new Float32Array(dims);
  const data = tensor.data;
  const offset = row * dims;
  for (let d = 0; d < dims; d++) out[d] = data[offset + d];
  return l2Normalize(out);
}

async function loadEmbedState() {
  try {
    const raw = await readFile(EMBED_STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadOldVectors(state) {
  if (!state?.keys || !Object.keys(state.keys).length) return null;
  try {
    const buf = await readFile(join(SEARCH, "vectors.f32.bin"));
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  } catch {
    return null;
  }
}

function stateUsable(state) {
  return state?.model === EMBED_MODEL && state?.dims === EMBED_DIMS && state?.keys;
}

async function main() {
  let chunks = await loadFullChunks();
  if (LIMIT) chunks = chunks.slice(0, LIMIT);

  try {
    const onDisk = JSON.parse(await readFile(join(SEARCH, "chunks.json"), "utf8"));
    if (!LIMIT && onDisk.length !== chunks.length) {
      console.warn(`chunks.json has ${onDisk.length} rows but corpus has ${chunks.length} — run: npm run search:index`);
      process.exit(1);
    }
  } catch {
    console.warn("chunks.json missing — run: npm run search:index");
    process.exit(1);
  }

  const keys = chunks.map(chunkStableKey);
  const texts = chunks.map(chunkEmbedText);
  const hashes = texts.map(embedTextHash);

  const oldState = FORCE_FULL ? null : await loadEmbedState();
  const oldVectors = stateUsable(oldState) ? await loadOldVectors(oldState) : null;
  const canReuse = !FORCE_FULL && oldVectors && stateUsable(oldState);

  const matrix = new Float32Array(chunks.length * EMBED_DIMS);
  const embedIndices = [];
  const newStateKeys = {};
  let reused = 0;

  for (let i = 0; i < chunks.length; i++) {
    const key = keys[i];
    const hash = hashes[i];
    const prev = canReuse ? oldState.keys[key] : null;

    if (prev?.hash === hash && typeof prev.i === "number") {
      copyVectorRow(oldVectors, prev.i, matrix, i);
      newStateKeys[key] = { hash, i };
      reused++;
    } else {
      embedIndices.push(i);
      newStateKeys[key] = { hash, i };
    }
  }

  if (canReuse && reused > 0) {
    console.log(`Incremental embed: reusing ${reused}, embedding ${embedIndices.length} new/changed chunk(s)…`);
  } else {
    console.log(`Full embed: ${chunks.length} chunks with ${EMBED_MODEL} (batch ${BATCH})…`);
    embedIndices.length = 0;
    for (let i = 0; i < chunks.length; i++) embedIndices.push(i);
    reused = 0;
  }

  if (embedIndices.length) {
    const extractor = await pipeline("feature-extraction", EMBED_MODEL);
    for (let b = 0; b < embedIndices.length; b += BATCH) {
      const batchIdx = embedIndices.slice(b, b + BATCH);
      const batchTexts = batchIdx.map((i) => texts[i]);
      const out = await extractor(batchTexts, { pooling: "mean", normalize: true });
      for (let j = 0; j < batchIdx.length; j++) {
        const row = tensorRow(out, j, EMBED_DIMS);
        matrix.set(row, batchIdx[j] * EMBED_DIMS);
      }
      const done = Math.min(b + BATCH, embedIndices.length);
      if (done % 240 === 0 || done === embedIndices.length) {
        process.stdout.write(`\r  embedded ${done} / ${embedIndices.length}`);
      }
    }
    if (embedIndices.length) process.stdout.write("\n");
  }

  await writeFile(join(SEARCH, "vectors.f32.bin"), Buffer.from(matrix.buffer));

  const embedState = {
    model: EMBED_MODEL,
    dims: EMBED_DIMS,
    chunks: chunks.length,
    updatedAt: new Date().toISOString(),
    keys: newStateKeys,
  };
  await writeFile(EMBED_STATE_PATH, JSON.stringify(embedState));

  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(join(SEARCH, "manifest.json"), "utf8"));
  } catch {
    /* new */
  }

  manifest.embed = {
    model: EMBED_MODEL,
    dims: EMBED_DIMS,
    dtype: "f32",
    normalized: true,
    chunks: chunks.length,
    incremental: canReuse && reused > 0,
    reused,
    embedded: embedIndices.length,
  };
  manifest.v = 2;
  await writeFile(join(SEARCH, "manifest.json"), JSON.stringify(manifest));

  const mb = (matrix.byteLength / (1024 * 1024)).toFixed(2);
  console.log(`Wrote vectors.f32.bin (${mb} MB, ${chunks.length} × ${EMBED_DIMS})`);
  if (canReuse && reused > 0) {
    console.log(`  reused ${reused}, newly embedded ${embedIndices.length}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
