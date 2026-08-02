#!/usr/bin/env node
/**
 * Embed search chunks with Xenova/all-MiniLM-L6-v2 → data/search/vectors.f32.bin
 * Requires chunks.json (run build-search-index.mjs first).
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@xenova/transformers";
import { buildSearchChunks, chunkEmbedText } from "./lib/corpus.mjs";
import { EMBED_DIMS, EMBED_MODEL, l2Normalize } from "./lib/embed.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const SEARCH = join(DATA, "search");

const BATCH = parseInt(process.env.EMBED_BATCH || "24", 10);
const LIMIT = process.env.EMBED_LIMIT ? parseInt(process.env.EMBED_LIMIT, 10) : null;

async function loadChunks() {
  try {
    const manifest = JSON.parse(await readFile(join(SEARCH, "manifest.json"), "utf8"));
    if (manifest.chunks) {
      const seminars = JSON.parse(await readFile(join(DATA, "seminars.json"), "utf8"));
      let concepts = [];
      try {
        concepts = JSON.parse(await readFile(join(DATA, "concepts.json"), "utf8"));
      } catch { /* optional */ }
      return buildSearchChunks(seminars, concepts);
    }
  } catch { /* rebuild path */ }
  const seminars = JSON.parse(await readFile(join(DATA, "seminars.json"), "utf8"));
  let concepts = [];
  try {
    concepts = JSON.parse(await readFile(join(DATA, "concepts.json"), "utf8"));
  } catch { /* optional */ }
  return buildSearchChunks(seminars, concepts);
}

function tensorRow(tensor, row, dims) {
  const out = new Float32Array(dims);
  const data = tensor.data;
  const offset = row * dims;
  for (let d = 0; d < dims; d++) out[d] = data[offset + d];
  return l2Normalize(out);
}

async function main() {
  let chunks = await loadChunks();
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

  console.log(`Embedding ${chunks.length} chunks with ${EMBED_MODEL} (batch ${BATCH})…`);
  const texts = chunks.map(chunkEmbedText);
  const extractor = await pipeline("feature-extraction", EMBED_MODEL);

  const matrix = new Float32Array(chunks.length * EMBED_DIMS);
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const out = await extractor(batch, { pooling: "mean", normalize: true });
    for (let j = 0; j < batch.length; j++) {
      const vec = tensorRow(out, j, EMBED_DIMS);
      matrix.set(vec, (i + j) * EMBED_DIMS);
    }
    if ((i + BATCH) % 240 === 0 || i + BATCH >= texts.length) {
      process.stdout.write(`\r  ${Math.min(i + BATCH, texts.length)} / ${texts.length}`);
    }
  }
  process.stdout.write("\n");

  await writeFile(join(SEARCH, "vectors.f32.bin"), Buffer.from(matrix.buffer));

  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(join(SEARCH, "manifest.json"), "utf8"));
  } catch { /* new */ }

  manifest.embed = {
    model: EMBED_MODEL,
    dims: EMBED_DIMS,
    dtype: "f32",
    normalized: true,
    chunks: chunks.length,
  };
  manifest.v = 2;
  await writeFile(join(SEARCH, "manifest.json"), JSON.stringify(manifest));

  const mb = (matrix.byteLength / (1024 * 1024)).toFixed(2);
  console.log(`Wrote vectors.f32.bin (${mb} MB, ${chunks.length} × ${EMBED_DIMS})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
