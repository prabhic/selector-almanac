/**
 * Search corpus + compact session points — single source of truth for indexing.
 */
import { tagAllTopics, extractTopics, isNoiseChapter } from "./topics.mjs";

const SERIES_LABEL = {
  "ai-weekly": "AI Weekly",
  seminar: "Seminar",
  "data-architect-2021": "Data Architect 2021",
  "data-science-2021": "Data Science 2021",
};

const NOISE_SLIDE =
  /^(we do these weekly videos|stats:|subscribe to this channel|download slides|please pause the video)/i;

const MIN_SLIDE_TEXT = 30;
const MAX_SLIDE_BODY_INDEX = 600;

export function guessSlideForChapter(chapters, chapterIndex, slides) {
  if (!slides?.length) return null;
  if (chapterIndex === 0) return slides[0];
  const ratio = chapterIndex / Math.max(chapters.length - 1, 1);
  const idx = Math.min(slides.length - 1, Math.round(ratio * (slides.length - 1)));
  return slides[idx];
}

export function isNoiseSlide(slide) {
  const title = (slide?.title ?? "").trim();
  const text = (slide?.text ?? "").trim();
  if (!text || text.length < MIN_SLIDE_TEXT) return true;
  if (NOISE_SLIDE.test(title) || NOISE_SLIDE.test(text.slice(0, 120))) return true;
  return isNoiseChapter(title);
}

/** Compact `pt[]` row for index.json — chapters + a capped set of slide fallbacks. */
export function buildSessionPoints(seminar, { maxSlidePoints = 12 } = {}) {
  const ch = (seminar.chapters ?? []).map((c) => {
    const timed = c.startSeconds != null && c.startSeconds >= 0;
    return [c.title, timed ? c.startSeconds : -1, timed ? "y" : "o"];
  });

  const pt = [];
  const slideMap = {};

  if (seminar.video && seminar.chapters?.length) {
    for (let i = 0; i < seminar.chapters.length; i++) {
      const c = seminar.chapters[i];
      if (isNoiseChapter(c.title)) continue;
      const slide = guessSlideForChapter(seminar.chapters, i, seminar.slides);
      const topic = tagAllTopics(c.title)[0] ?? extractTopics(c.title, seminar.title)[0] ?? "general";
      const timed = c.startSeconds != null && c.startSeconds >= 0;
      const sec = timed ? c.startSeconds : -1;
      const slideIdx = slide?.index ?? null;
      if (slideIdx != null) slideMap[sec] = slideIdx;
      pt.push([c.title, sec, slideIdx ?? -1, topic, timed ? "y" : "o"]);
    }
  }

  if (seminar.slides?.length) {
    let added = 0;
    for (const slide of seminar.slides) {
      if (added >= maxSlidePoints) break;
      if (isNoiseSlide(slide)) continue;
      const dup = pt.some((p) => p[2] === slide.index);
      if (dup) continue;
      const topic = extractTopics(slide.text, slide.title, seminar.title)[0] ?? seminar.topics?.[0] ?? "general";
      pt.push([
        slide.title || `Slide ${slide.index}`,
        -1,
        slide.index,
        topic,
        "o",
      ]);
      added++;
    }
  }

  return { ch, pt, slideMap };
}

function sessionContext(seminar) {
  const series = SERIES_LABEL[seminar.series] ?? seminar.series ?? "";
  const topics = (seminar.topics ?? []).join(" ");
  const videoTitle = seminar.video?.title ?? "";
  return {
    sessionTitle: seminar.title ?? "",
    series,
    videoTitle,
    topics,
    date: seminar.date ?? "",
  };
}

/**
 * Receipt-level chunks for lexical / vector search.
 * @returns {Array<{
 *   sid: string, ty: "chapter"|"slide"|"concept", pi: number, sl: number,
 *   d: string, sec: number, tp: string, td: boolean, t: string, b: string,
 *   ck?: string
 * }>}
 */
export function buildSearchChunks(seminars, concepts = []) {
  const chunks = [];

  for (const seminar of seminars) {
    const ctx = sessionContext(seminar);
    const { pt } = buildSessionPoints(seminar, { maxSlidePoints: 0 });
    const usedSlides = new Set();

    for (let pi = 0; pi < pt.length; pi++) {
      const [title, sec, slideIdx, topic, kind] = pt[pi];
      if (slideIdx >= 0) usedSlides.add(slideIdx);
      chunks.push({
        sid: seminar.id,
        ty: "chapter",
        pi,
        sl: slideIdx,
        d: ctx.date,
        sec,
        tp: topic,
        td: kind === "y",
        t: title,
        b: "",
        ...ctx,
      });
    }

    for (const slide of seminar.slides ?? []) {
      if (usedSlides.has(slide.index) || isNoiseSlide(slide)) continue;
      const topic = extractTopics(slide.text, slide.title, seminar.title)[0] ?? seminar.topics?.[0] ?? "general";
      chunks.push({
        sid: seminar.id,
        ty: "slide",
        pi: -1,
        sl: slide.index,
        d: ctx.date,
        sec: -1,
        tp: topic,
        td: false,
        t: slide.title || `Slide ${slide.index}`,
        b: (slide.text ?? "").slice(0, MAX_SLIDE_BODY_INDEX),
        ...ctx,
      });
    }
  }

  for (const concept of concepts) {
    const samples = (concept.m ?? [])
      .slice(0, 8)
      .map((m) => m[3] ?? m[0])
      .filter(Boolean)
      .join(" ");
    chunks.push({
      sid: "",
      ty: "concept",
      ck: concept.k,
      pi: -1,
      sl: -1,
      d: concept.first ?? "",
      sec: -1,
      tp: concept.kind ?? "thread",
      td: false,
      t: concept.label,
      b: samples,
      sessionTitle: "",
      series: "",
      videoTitle: "",
      topics: concept.kind ?? "",
      date: concept.first ?? "",
    });
  }

  return chunks;
}

/** Fields tokenized for BM25 with boosts (title highest). */
export function chunkTermWeights(chunk) {
  const weights = [];
  if (chunk.t) weights.push({ text: chunk.t, boost: 3 });
  if (chunk.b) weights.push({ text: chunk.b, boost: 1 });
  if (chunk.sessionTitle) weights.push({ text: chunk.sessionTitle, boost: 1.5 });
  if (chunk.videoTitle) weights.push({ text: chunk.videoTitle, boost: 1.2 });
  if (chunk.series) weights.push({ text: chunk.series, boost: 0.8 });
  if (chunk.topics) weights.push({ text: chunk.topics, boost: 1.2 });
  if (chunk.ty === "concept" && chunk.b) weights.push({ text: chunk.b, boost: 1.5 });
  return weights;
}

/** Canonical text for embedding (build + re-embed). */
export function chunkEmbedText(chunk) {
  const parts = [];
  if (chunk.d) parts.push(`[${chunk.d}]`);
  if (chunk.sessionTitle) parts.push(chunk.sessionTitle);
  if (chunk.series) parts.push(chunk.series);
  if (chunk.ty === "chapter") parts.push(`Chapter: ${chunk.t}`);
  else if (chunk.ty === "slide") parts.push(`Slide: ${chunk.t}`);
  else if (chunk.ty === "concept") parts.push(`Concept thread: ${chunk.t}`);
  else if (chunk.t) parts.push(chunk.t);
  if (chunk.b) parts.push(chunk.b.slice(0, 480));
  if (chunk.topics) parts.push(`Topics: ${chunk.topics}`);
  return parts.filter(Boolean).join("\n");
}
