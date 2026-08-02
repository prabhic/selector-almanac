#!/usr/bin/env node
/** Rebuild trends.json (+ retag seminar topics) from existing seminars.json — no network. */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTrends, tagAllTopics, isNoiseChapter, extractTopics, topicLabel, TREND_LENSES } from "./lib/topics.mjs";
import { buildInsights } from "./lib/insights.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");

function buildTopicIndex(seminars) {
  const topics = {};
  for (const seminar of seminars) {
    for (const slug of seminar.topics ?? []) {
      if (!topics[slug]) {
        topics[slug] = { label: topicLabel(slug), slug, firstSeen: seminar.date, seminarCount: 0, pointCount: 0, seminarIds: [], timeline: [] };
      }
      const t = topics[slug];
      if (seminar.date && (!t.firstSeen || seminar.date < t.firstSeen)) t.firstSeen = seminar.date;
      if (!t.seminarIds.includes(seminar.id)) { t.seminarIds.push(seminar.id); t.seminarCount++; }
    }
    for (const point of seminar.points ?? []) {
      const slug = point.topic;
      if (!topics[slug]) {
        topics[slug] = { label: topicLabel(slug), slug, firstSeen: seminar.date, seminarCount: 0, pointCount: 0, seminarIds: [], timeline: [] };
      }
      topics[slug].pointCount++;
      topics[slug].timeline.push({ date: seminar.date, seminarId: seminar.id, claim: point.claim, videoUrl: point.videoUrl, slideIndex: point.slideIndex });
    }
  }
  for (const t of Object.values(topics)) t.timeline.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  return topics;
}

function retagSeminar(s) {
  const topicSet = new Set();
  for (const ch of s.chapters ?? []) {
    if (isNoiseChapter(ch.title)) continue;
    for (const t of tagAllTopics(ch.title)) topicSet.add(t);
  }
  if (!topicSet.size && s.slides?.length) {
    for (const sl of s.slides.slice(1, 8)) {
      for (const t of extractTopics(sl.text, sl.title)) topicSet.add(t);
    }
  }
  s.topics = topicSet.size ? [...topicSet] : extractTopics(s.title, s.deck?.path, s.video?.title);
  for (const p of s.points ?? []) {
    if (!isNoiseChapter(p.claim)) {
      p.topic = tagAllTopics(p.claim)[0] ?? p.topic ?? "general";
    }
  }
}

const seminars = JSON.parse(await readFile(join(DATA, "seminars.json"), "utf8"));
for (const s of seminars) retagSeminar(s);

const trends = buildTrends(seminars, { weeklyOnly: true });
trends.insights = buildInsights(
  seminars.filter((s) => /AI-Updates/i.test(s.deck?.path ?? "") && /^(2025|2026)-/.test(s.date ?? "")),
);
const topics = buildTopicIndex(seminars);

await writeFile(join(DATA, "seminars.json"), JSON.stringify(seminars, null, 2));
await writeFile(join(DATA, "topics.json"), JSON.stringify(topics, null, 2));
await writeFile(join(DATA, "trends.json"), JSON.stringify(trends, null, 2));

console.log(`trends.json — ${trends.weekCount} weeks, ${trends.ranked.length} active topics`);
console.log("top:", trends.ranked.slice(0, 5).join(", "));
console.log("rising:", trends.rising.map((r) => r.label).join(", ") || "—");
