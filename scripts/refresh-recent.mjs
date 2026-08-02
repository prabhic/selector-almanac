#!/usr/bin/env node
/**
 * Incremental weekly refresh — re-match YouTube videos and optionally re-parse decks
 * without re-ingesting the full 300+ seminar corpus.
 *
 * Usage:
 *   node scripts/refresh-recent.mjs                    # deck-only + last 4 weeks
 *   node scripts/refresh-recent.mjs --date 2026-07-31  # one session
 *   node scripts/refresh-recent.mjs --weeks 8 --parse  # re-fetch PPTX for recent decks
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDeckDate, daysBetween } from "./lib/dates.mjs";
import { extractTopics, tagAllTopics, buildTrends, isNoiseChapter, topicLabel } from "./lib/topics.mjs";
import { buildInsights } from "./lib/insights.mjs";
import { videoUrlAt } from "./lib/chapters.mjs";
import { fetchAndParsePptx } from "./lib/pptx.mjs";
import { fetchVideoList, fetchAllVideoMeta } from "./lib/youtube.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

const args = process.argv.slice(2);
const parsePptx = args.includes("--parse");
const dateIdx = args.indexOf("--date");
const oneDate = dateIdx >= 0 ? args[dateIdx + 1] : null;
const weeksIdx = args.indexOf("--weeks");
const weeks = weeksIdx >= 0 ? +args[weeksIdx + 1] : 4;

function log(msg) {
  process.stderr.write(`${msg}\n`);
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
      if (slide.text.length < 20) continue;
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

function cutoffDate(weeksBack) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - weeksBack * 7);
  return d.toISOString().slice(0, 10);
}

function shouldRefresh(seminar, since) {
  if (oneDate) return seminar.date === oneDate;
  if (seminar.match?.confidence === "deck-only" || seminar.match?.method === "unmatched") return true;
  if (!seminar.video) return true;
  return (seminar.date ?? "") >= since;
}

async function main() {
  const since = cutoffDate(weeks);
  log(`Refresh recent seminars (since ${since}, weeks=${weeks}${oneDate ? `, date=${oneDate}` : ""})`);

  const seminars = JSON.parse(await readFile(join(DATA, "seminars.json"), "utf8"));
  const targets = seminars.filter((s) => shouldRefresh(s, since));
  if (!targets.length) {
    log("Nothing to refresh.");
    return;
  }
  log(`  ${targets.length} session(s) to update`);

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

  let updated = 0;
  for (const seminar of targets) {
    const date = seminar.date ?? parseDeckDate(seminar.deck?.path ?? "");
    const match = matchVideo(date, videosByDate, allVideos);
    const video = match?.video ?? null;

    if (parsePptx && seminar.deck?.rawUrl) {
      try {
        seminar.slides = await fetchAndParsePptx(seminar.deck.rawUrl);
        log(`  parsed slides: ${seminar.id} (${seminar.slides.length})`);
      } catch (err) {
        log(`  slide parse failed: ${seminar.id} — ${err.message}`);
      }
    }

    const topicSet = new Set(seminar.topics ?? []);
    for (const ch of video?.chapters ?? []) {
      if (isNoiseChapter(ch.title)) continue;
      for (const t of tagAllTopics(ch.title)) topicSet.add(t);
    }
    if (topicSet.size) seminar.topics = [...topicSet];

    seminar.video = video
      ? {
          id: video.id,
          title: video.title,
          url: video.url,
          thumbnail: video.thumbnail,
          duration: video.duration,
        }
      : null;
    seminar.match = match
      ? { confidence: match.confidence, method: match.method }
      : { confidence: "deck-only", method: "unmatched" };
    seminar.chapters = video?.chapters ?? [];
    seminar.points = buildPoints(seminar);
    updated++;
    log(`  ${seminar.date} ${video ? "✓ " + video.id : "— no video"} (${seminar.chapters.length} chapters)`);
  }

  seminars.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const topics = buildTopicIndex(seminars);
  const trends = JSON.parse(await readFile(join(DATA, "trends.json"), "utf8"));
  const meta = JSON.parse(await readFile(join(DATA, "meta.json"), "utf8"));

  meta.generatedAt = new Date().toISOString();
  meta.lastRefresh = { at: meta.generatedAt, sessions: targets.map((s) => s.id), weeks, oneDate };
  meta.counts.matched = seminars.filter((s) => s.video && s.match?.confidence === "date").length;
  meta.counts.withChapters = seminars.filter((s) => s.chapters.length > 0).length;
  meta.counts.videos = allVideos.length;

  const weekly = seminars.filter(
    (s) => /AI-Updates/i.test(s.deck?.path ?? "") && /^(2025|2026)-/.test(s.date ?? ""),
  );
  const newTrends = buildTrends(seminars, { weeklyOnly: true });
  newTrends.insights = buildInsights(weekly);
  Object.assign(trends, newTrends);

  await writeFile(join(DATA, "seminars.json"), JSON.stringify(seminars, null, 2));
  await writeFile(join(DATA, "topics.json"), JSON.stringify(topics, null, 2));
  await writeFile(join(DATA, "trends.json"), JSON.stringify(trends, null, 2));
  await writeFile(join(DATA, "meta.json"), JSON.stringify(meta, null, 2));

  log(`\nUpdated ${updated} session(s) → data/seminars.json`);
  log("Next: npm run build");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
