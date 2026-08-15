#!/usr/bin/env node
/**
 * Add newly published decks from lselector/seminar that are not yet in the corpus.
 * Writes one file per session under data/sessions/.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deckRecord, fetchDeckPaths, isWeekly2025Or2026 } from "./lib/github.mjs";
import { parseDeckDate, slugify } from "./lib/dates.mjs";
import { extractTopics, tagAllTopics, isNoiseChapter } from "./lib/topics.mjs";
import { buildPoints, matchVideo } from "./lib/seminar.mjs";
import { fetchAndParsePptx } from "./lib/pptx.mjs";
import { fetchYouTubeCatalog } from "./lib/youtube.mjs";
import { writeAggregates } from "./lib/aggregate.mjs";
import {
  DATA,
  ensureSessions,
  saveSession,
  compileSeminarsJson,
} from "./lib/sessions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = process.argv.slice(2);
const parsePptx = !args.includes("--no-parse");
const allCorpus = args.includes("--all");
const skipYoutube = args.includes("--skip-youtube");

function log(msg) {
  process.stderr.write(`${msg}\n`);
}

function inferSeries(title, path) {
  if (/ai[- ]?updates?/i.test(title) || /AI-Updates/i.test(path)) return "ai-weekly";
  if (/data_science/i.test(path)) return "data-science-2021";
  if (/data_architect/i.test(path)) return "data-architect-2021";
  if (/^202[2-6]\//.test(path)) return "seminar";
  return "other";
}

async function buildSeminar(path, videosByDate, allVideos) {
  const deck = deckRecord(path);
  const date = parseDeckDate(path);
  const match = matchVideo(date, videosByDate, allVideos);
  const video = match?.video ?? null;

  let slides = [];
  if (parsePptx && deck.rawUrl) {
    try {
      slides = await fetchAndParsePptx(deck.rawUrl);
    } catch (err) {
      log(`  slide parse failed: ${path} — ${err.message}`);
    }
  }

  const title = deck.title;
  const series = inferSeries(title, path);
  const topicSet = new Set();
  for (const ch of video?.chapters ?? []) {
    if (isNoiseChapter(ch.title)) continue;
    for (const t of tagAllTopics(ch.title)) topicSet.add(t);
  }
  if (!topicSet.size && slides.length) {
    for (const sl of slides.slice(1, 8)) {
      for (const t of extractTopics(sl.text, sl.title)) topicSet.add(t);
    }
  }
  const topics = topicSet.size ? [...topicSet] : extractTopics(title, path, video?.title);

  const seminar = {
    id: slugify(`${date ?? "unknown"}-${deck.filename.replace(/\.pptx$/i, "")}`),
    date,
    title,
    series,
    topics,
    video: video
      ? {
          id: video.id,
          title: video.title,
          url: video.url,
          thumbnail: video.thumbnail,
          duration: video.duration,
        }
      : null,
    deck,
    match: match
      ? { confidence: match.confidence, method: match.method }
      : { confidence: video ? "partial" : "deck-only", method: "unmatched" },
    chapters: video?.chapters ?? [],
    slides,
    points: [],
  };
  seminar.points = buildPoints(seminar);
  return seminar;
}

async function main() {
  const sessions = await ensureSessions({ log });
  const known = new Set(sessions.map((s) => s.deck?.path).filter(Boolean));

  log("Delta deck ingest — checking GitHub for new decks…");
  const allPaths = await fetchDeckPaths();
  const deckPaths = allCorpus ? allPaths : allPaths.filter(isWeekly2025Or2026);
  const newPaths = deckPaths.filter((p) => !known.has(p));

  if (!newPaths.length) {
    log("No new decks to add.");
    return;
  }

  log(`  ${newPaths.length} new deck(s):`);
  for (const p of newPaths) log(`    + ${p}`);

  let allVideos = [];
  let videosByDate = new Map();
  if (skipYoutube) {
    log("  skipping YouTube (deck-only; match videos locally later)");
  } else {
    ({ allVideos, videosByDate } = await fetchYouTubeCatalog({ log, weeksForFullMeta: 8 }));
  }
  const addedIds = [];

  for (const path of newPaths) {
    const seminar = await buildSeminar(path, videosByDate, allVideos);
    sessions.push(seminar);
    await saveSession(seminar);
    addedIds.push(seminar.id);
    log(
      `  added ${seminar.date ?? "?"} ${seminar.video ? "✓ " + seminar.video.id : "— no video yet"} (${seminar.slides.length} slides)`,
    );
  }

  const sorted = await compileSeminarsJson(sessions);
  const meta = JSON.parse(await readFile(join(DATA, "meta.json"), "utf8"));
  const pending = [...new Set([...(meta.pendingRefresh ?? []), ...addedIds])];

  await writeAggregates(sorted, {
    refreshedIds: [],
    videoCount: skipYoutube ? meta.counts?.videos ?? null : allVideos.length,
    pendingRefresh: pending,
    lastDeltaIngest: {
      at: new Date().toISOString(),
      added: newPaths,
      sessionIds: addedIds,
    },
  });

  log(`\nAdded ${newPaths.length} seminar(s). Next: refresh-recent + npm run build`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
