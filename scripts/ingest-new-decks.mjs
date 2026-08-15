#!/usr/bin/env node
/**
 * Add newly published decks from lselector/seminar that are not yet in data/seminars.json.
 * Does not re-ingest the full corpus — use before refresh-recent.mjs in CI.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deckRecord, fetchDeckPaths, isWeekly2025Or2026 } from "./lib/github.mjs";
import { parseDeckDate, daysBetween, slugify } from "./lib/dates.mjs";
import { extractTopics, tagAllTopics, isNoiseChapter } from "./lib/topics.mjs";
import { videoUrlAt } from "./lib/chapters.mjs";
import { fetchAndParsePptx } from "./lib/pptx.mjs";
import { fetchVideoList, fetchAllVideoMeta } from "./lib/youtube.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

const args = process.argv.slice(2);
const parsePptx = !args.includes("--no-parse");
const allCorpus = args.includes("--all");

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

function matchVideo(deckDate, videosByDate, allVideos) {
  if (!deckDate) return null;
  const exact = videosByDate.get(deckDate);
  if (exact?.length) {
    const weekly = exact.find((v) => v.isWeekly) ?? exact[0];
    return { video: weekly, confidence: "date", method: "exact-date" };
  }
  let best = null;
  let bestDelta = Infinity;
  for (const v of allVideos) {
    if (!v.date) continue;
    const delta = Math.abs(daysBetween(deckDate, v.date));
    if (delta <= 3 && delta < bestDelta) {
      best = v;
      bestDelta = delta;
    }
  }
  if (best) return { video: best, confidence: "date", method: `near-date-${bestDelta}d` };
  return null;
}

function guessSlideForChapter(chapters, chapterIndex, slides) {
  if (!slides?.length) return null;
  if (chapterIndex === 0) return slides[0];
  const ratio = chapterIndex / Math.max(chapters.length - 1, 1);
  const idx = Math.min(slides.length - 1, Math.round(ratio * (slides.length - 1)));
  return slides[idx];
}

function buildPoints(seminar) {
  const points = [];
  const { chapters, slides, video, topics } = seminar;

  if (video && chapters?.length) {
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const slide = guessSlideForChapter(chapters, i, slides);
      const topic = tagAllTopics(ch.title)[0] ?? extractTopics(ch.title, seminar.title)[0] ?? "general";
      points.push({
        claim: ch.title,
        topic,
        videoSeconds: ch.startSeconds ?? null,
        videoUrl: ch.startSeconds != null ? videoUrlAt(video.id, ch.startSeconds) : video.url,
        slideIndex: slide?.index ?? null,
        slideTitle: slide?.title ?? null,
        source: ch.source ?? "chapter",
      });
    }
  }

  if (slides?.length) {
    for (const slide of slides.slice(0, 12)) {
      if ((slide.text ?? "").length < 20) continue;
      if (points.some((p) => p.slideIndex === slide.index)) continue;
      const topic = extractTopics(slide.text, slide.title)[0] ?? topics[0] ?? "general";
      points.push({
        claim: slide.title || `Slide ${slide.index}`,
        topic,
        videoSeconds: null,
        videoUrl: video ? video.url : null,
        slideIndex: slide.index,
        slideTitle: slide.title,
        source: "slide",
      });
    }
  }

  return points;
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
  const seminars = JSON.parse(await readFile(join(DATA, "seminars.json"), "utf8"));
  const known = new Set(seminars.map((s) => s.deck?.path).filter(Boolean));

  log("Delta deck ingest — checking GitHub for new decks…");
  const allPaths = await fetchDeckPaths();
  let deckPaths = allCorpus ? allPaths : allPaths.filter(isWeekly2025Or2026);
  const newPaths = deckPaths.filter((p) => !known.has(p));

  if (!newPaths.length) {
    log("No new decks to add.");
    return;
  }

  log(`  ${newPaths.length} new deck(s):`);
  for (const p of newPaths) log(`    + ${p}`);

  log("\nFetching YouTube channel…");
  const videoIds = await fetchVideoList();
  const metaMap = await fetchAllVideoMeta(videoIds, {
    concurrency: 8,
    onProgress: (done, total) => {
      if (done % 50 === 0 || done === total) log(`  metadata ${done}/${total}`);
    },
  });

  const allVideos = [...metaMap.values()].filter((v) => !v.error);
  const videosByDate = new Map();
  for (const v of allVideos) {
    if (!v.date) continue;
    if (!videosByDate.has(v.date)) videosByDate.set(v.date, []);
    videosByDate.get(v.date).push(v);
  }

  for (const path of newPaths) {
    const seminar = await buildSeminar(path, videosByDate, allVideos);
    seminars.push(seminar);
    log(
      `  added ${seminar.date ?? "?"} ${seminar.video ? "✓ " + seminar.video.id : "— no video yet"} (${seminar.slides.length} slides)`
    );
  }

  seminars.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const meta = JSON.parse(await readFile(join(DATA, "meta.json"), "utf8"));
  meta.counts.seminars = seminars.length;
  meta.counts.decks = seminars.filter((s) => s.deck).length;
  meta.counts.decksInRepo = allPaths.length;
  meta.lastDeltaIngest = {
    at: new Date().toISOString(),
    added: newPaths,
  };

  await writeFile(join(DATA, "seminars.json"), JSON.stringify(seminars, null, 2));
  await writeFile(join(DATA, "meta.json"), JSON.stringify(meta, null, 2));

  log(`\nAdded ${newPaths.length} seminar(s). Next: refresh-recent + npm run build`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
