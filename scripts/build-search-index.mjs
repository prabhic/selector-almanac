#!/usr/bin/env node
/**
 * Build receipt-level search corpus + BM25 lexical index from seminars.json.
 * Run after ingest / build-index: npm run search:index
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { attachDocLens, buildBm25Index } from "./lib/bm25.mjs";
import { buildSearchChunks } from "./lib/corpus.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");
const SEARCH = join(DATA, "search");

function compactChunk(c, i) {
  const row = {
    i,
    sid: c.sid,
    ty: c.ty,
    pi: c.pi,
    sl: c.sl,
    d: c.d,
    sec: c.sec,
    tp: c.tp,
    td: c.td ? 1 : 0,
    t: c.t,
  };
  if (c.ck) row.ck = c.ck;
  return row;
}

async function main() {
  const seminars = JSON.parse(await readFile(join(DATA, "seminars.json"), "utf8"));
  let concepts = [];
  try {
    concepts = JSON.parse(await readFile(join(DATA, "concepts.json"), "utf8"));
  } catch {
    console.warn("concepts.json missing — concept chunks skipped");
  }

  const fullChunks = buildSearchChunks(seminars, concepts);
  const bm25 = attachDocLens(buildBm25Index(fullChunks), fullChunks);
  const chunks = fullChunks.map(compactChunk);

  const { docLens, ...lexical } = bm25;
  const manifest = {
    v: 1,
    built: new Date().toISOString().slice(0, 10),
    chunks: chunks.length,
    terms: Object.keys(lexical.postings).length,
    avgdl: Math.round(lexical.avgdl * 100) / 100,
    types: {
      chapter: chunks.filter((c) => c.ty === "chapter").length,
      slide: chunks.filter((c) => c.ty === "slide").length,
      concept: chunks.filter((c) => c.ty === "concept").length,
    },
  };

  await mkdir(SEARCH, { recursive: true });
  await writeFile(join(SEARCH, "manifest.json"), JSON.stringify(manifest));
  await writeFile(join(SEARCH, "chunks.json"), JSON.stringify(chunks));
  await writeFile(
    join(SEARCH, "lexical.json"),
    JSON.stringify({ ...lexical, docLens })
  );

  console.log(`Wrote search corpus: ${chunks.length} chunks`);
  console.log(`  chapters ${manifest.types.chapter}, slides ${manifest.types.slide}, concepts ${manifest.types.concept}`);
  console.log(`  lexical terms: ${manifest.terms}, avgdl ${manifest.avgdl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
