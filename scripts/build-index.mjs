#!/usr/bin/env node
/**
 * Build compact index + slides from seminars.json.
 * Search corpus is built separately via build-search-index.mjs (npm run search:index).
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSessionPoints } from "./lib/corpus.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

function compactSeminar(s) {
  const { ch, pt } = buildSessionPoints(s);

  return {
    id: s.id,
    d: s.date,
    t: s.title,
    se: s.series,
    tp: s.topics ?? [],
    v: s.video
      ? { id: s.video.id, t: s.video.title, dur: s.video.durationSeconds ?? s.video.duration ?? null }
      : null,
    dk: s.deck
      ? { u: s.deck.githubUrl, f: s.deck.filename }
      : null,
    mc: s.match?.confidence ?? s.match?.method ?? null,
    ns: s.slides?.length ?? 0,
    ch,
    pt,
  };
}

function buildSlides(seminars) {
  const out = {};
  for (const s of seminars) {
    if (!s.slides?.length) continue;
    out[s.id] = s.slides.map((sl) => [sl.index, sl.title ?? "", sl.text ?? ""]);
  }
  return out;
}

async function main() {
  const seminars = JSON.parse(await readFile(join(DATA, "seminars.json"), "utf8"));
  const index = seminars.map(compactSeminar);
  const slides = buildSlides(seminars);

  await writeFile(join(DATA, "index.json"), JSON.stringify(index));
  await writeFile(join(DATA, "slides.json"), JSON.stringify(slides));

  const conceptsPath = join(DATA, "concepts.json");
  try {
    await readFile(conceptsPath, "utf8");
    console.log("concepts.json kept (regenerate via scripts/extract-mock-data.mjs)");
  } catch {
    console.warn("concepts.json missing — run: node scripts/extract-mock-data.mjs");
  }

  console.log(`Wrote index.json (${index.length} sessions)`);
  console.log(`Wrote slides.json (${Object.keys(slides).length} decks)`);
  console.log("Run npm run search:index to rebuild lexical search corpus");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
