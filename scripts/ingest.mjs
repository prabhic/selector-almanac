#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deckRecord, resolveDeckPaths, isWeekly2025Or2026 } from "./lib/github.mjs";
import { parseDeckDate, daysBetween, slugify } from "./lib/dates.mjs";
import { extractTopics, topicLabel, buildTrends, tagAllTopics, isNoiseChapter } from "./lib/topics.mjs";
import { buildInsights } from "./lib/insights.mjs";
import { videoUrlAt } from "./lib/chapters.mjs";
import { fetchAndParsePptx } from "./lib/pptx.mjs";
import { fetchYouTubeCatalog } from "./lib/youtube.mjs";
import { saveSession, ensureSessionsDir } from "./lib/sessions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

const args = process.argv.slice(2);
const quick = args.includes("--quick");
const includeAll = args.includes("--all");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? +args[limitIdx + 1] : null;
const CLONE_PATH = join(ROOT, "data/raw/seminar");

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
        videoUrl: ch.startSeconds != null
          ? videoUrlAt(video.id, ch.startSeconds)
          : video.url,
        slideIndex: slide?.index ?? null,
        slideTitle: slide?.title ?? null,
        source: ch.source ?? "chapter",
      });
    }
  }

  if (slides?.length) {
    for (const slide of slides.slice(0, 12)) {
      if (slide.text.length < 20) continue;
      const already = points.some((p) => p.slideIndex === slide.index);
      if (already) continue;
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

function buildTopicIndex(seminars) {
  const topics = {};

  for (const seminar of seminars) {
    for (const slug of seminar.topics) {
      if (!topics[slug]) {
        topics[slug] = {
          label: topicLabel(slug),
          slug,
          firstSeen: seminar.date,
          seminarCount: 0,
          pointCount: 0,
          seminarIds: [],
          timeline: [],
        };
      }
      const t = topics[slug];
      if (seminar.date && (!t.firstSeen || seminar.date < t.firstSeen)) {
        t.firstSeen = seminar.date;
      }
      if (!t.seminarIds.includes(seminar.id)) {
        t.seminarIds.push(seminar.id);
        t.seminarCount++;
      }
    }

    for (const point of seminar.points ?? []) {
      const slug = point.topic;
      if (!topics[slug]) {
        topics[slug] = {
          label: topicLabel(slug),
          slug,
          firstSeen: seminar.date,
          seminarCount: 0,
          pointCount: 0,
          seminarIds: [],
          timeline: [],
        };
      }
      topics[slug].pointCount++;
      topics[slug].timeline.push({
        date: seminar.date,
        seminarId: seminar.id,
        claim: point.claim,
        videoUrl: point.videoUrl,
        slideIndex: point.slideIndex,
      });
    }
  }

  for (const t of Object.values(topics)) {
    t.timeline.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  }

  return topics;
}

async function main() {
  log("Selector Almanac ingest");
  log(quick ? "  mode: quick (no PPTX parse)" : "  mode: full");
  log(includeAll ? "  corpus: all decks" : "  corpus: weekly AI-Updates 2025–2026");

  log("\n1/4 Indexing decks…");
  const { paths: allDeckPaths, source: deckSource } = await resolveDeckPaths(CLONE_PATH);
  let deckPaths = includeAll ? allDeckPaths : allDeckPaths.filter(isWeekly2025Or2026);
  if (limit) deckPaths = deckPaths.slice(-limit);
  log(`  ${deckPaths.length} decks (${deckSource}, ${allDeckPaths.length} total in repo)`);

  log("\n2/4 Fetching YouTube channel…");
  const { allVideos, videosByDate } = await fetchYouTubeCatalog({
    log,
    fullMetaAll: true,
    concurrency: 8,
  });

  log("\n3/4 Matching decks ↔ videos & parsing slides…");
  const seminars = [];
  let parsedSlides = 0;

  for (let i = 0; i < deckPaths.length; i++) {
    const path = deckPaths[i];
    const deck = deckRecord(path);
    const date = parseDeckDate(path);
    const match = matchVideo(date, videosByDate, allVideos);
    const video = match?.video ?? null;

    let slides = [];
    if (!quick && deck.rawUrl) {
      try {
        slides = await fetchAndParsePptx(deck.rawUrl);
        parsedSlides++;
        if (parsedSlides % 20 === 0) log(`  parsed ${parsedSlides} decks…`);
      } catch {
        // skip failed downloads
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
    seminars.push(seminar);
  }

  seminars.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const matched = seminars.filter((s) => s.video && s.match?.confidence === "date").length;
  const withChapters = seminars.filter((s) => s.chapters.length > 0).length;

  log(`\n4/4 Writing data files…`);
  log(`  ${seminars.length} seminars, ${matched} date-matched, ${withChapters} with chapters`);

  const topics = buildTopicIndex(seminars);
  const trends = buildTrends(seminars, { weeklyOnly: true });
  trends.insights = buildInsights(
    seminars.filter((s) => /AI-Updates/i.test(s.deck?.path ?? "") && /^(2025|2026)-/.test(s.date ?? "")),
  );
  const meta = {
    generatedAt: new Date().toISOString(),
    ingestMode: quick ? "quick" : "full",
    corpus: includeAll ? "all" : "weekly-2025-2026",
    deckSource,
    counts: {
      seminars: seminars.length,
      decks: deckPaths.length,
      decksInRepo: allDeckPaths.length,
      weekly2025: seminars.filter((s) => s.date?.startsWith("2025")).length,
      weekly2026: seminars.filter((s) => s.date?.startsWith("2026")).length,
      videos: allVideos.length,
      matched,
      withChapters,
      topics: Object.keys(topics).length,
      slidesParsed: parsedSlides,
    },
    sources: {
      youtube: "https://www.youtube.com/@lev-selector",
      github: "https://github.com/lselector/seminar",
      channelId: "UCA4GfsgbI09cLzonTKryC6g",
    },
    attribution: "All content © Lev Selector. This index is a derived lens with links back to originals.",
  };

  await mkdir(DATA, { recursive: true });
  await ensureSessionsDir();
  for (const seminar of seminars) {
    await saveSession(seminar);
  }
  await writeFile(join(DATA, "seminars.json"), JSON.stringify(seminars, null, 2));
  await writeFile(join(DATA, "topics.json"), JSON.stringify(topics, null, 2));
  await writeFile(join(DATA, "trends.json"), JSON.stringify(trends, null, 2));
  await writeFile(join(DATA, "meta.json"), JSON.stringify(meta, null, 2));

  log("\nDone → data/seminars.json, data/topics.json, data/trends.json, data/meta.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
