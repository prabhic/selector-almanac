import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractTopics, tagAllTopics, buildTrends, topicLabel } from "./topics.mjs";
import { buildInsights } from "./insights.mjs";
import { DATA } from "./sessions.mjs";

export function buildTopicIndex(seminars) {
  const topics = {};

  for (const seminar of seminars) {
    for (const slug of seminar.topics ?? []) {
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

export async function writeAggregates(seminars, {
  refreshedIds = [],
  weeks = null,
  oneDate = null,
  videoCount = null,
  lastDeltaIngest = undefined,
  pendingRefresh = [],
} = {}) {
  const topics = buildTopicIndex(seminars);
  const trends = JSON.parse(await readFile(join(DATA, "trends.json"), "utf8"));
  const meta = JSON.parse(await readFile(join(DATA, "meta.json"), "utf8"));

  meta.generatedAt = new Date().toISOString();
  meta.lastRefresh = {
    at: meta.generatedAt,
    sessions: refreshedIds,
    weeks,
    oneDate,
  };
  meta.pendingRefresh = pendingRefresh;
  if (lastDeltaIngest !== undefined) meta.lastDeltaIngest = lastDeltaIngest;

  meta.counts.seminars = seminars.length;
  meta.counts.decks = seminars.filter((s) => s.deck).length;
  meta.counts.matched = seminars.filter((s) => s.video && s.match?.confidence === "date").length;
  meta.counts.withChapters = seminars.filter((s) => (s.chapters ?? []).length > 0).length;
  meta.counts.slidesParsed = seminars.filter((s) => (s.slides ?? []).length > 0).length;
  if (videoCount != null) meta.counts.videos = videoCount;

  const weekly = seminars.filter(
    (s) => /AI-Updates/i.test(s.deck?.path ?? "") && /^(2025|2026)-/.test(s.date ?? ""),
  );
  const newTrends = buildTrends(seminars, { weeklyOnly: true });
  newTrends.insights = buildInsights(weekly);
  Object.assign(trends, newTrends);

  await writeFile(join(DATA, "topics.json"), JSON.stringify(topics, null, 2));
  await writeFile(join(DATA, "trends.json"), JSON.stringify(trends, null, 2));
  await writeFile(join(DATA, "meta.json"), JSON.stringify(meta, null, 2));

  return { topics, trends, meta };
}
