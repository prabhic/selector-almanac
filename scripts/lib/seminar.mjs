import { daysBetween } from "./dates.mjs";
import { extractTopics, tagAllTopics, isNoiseChapter } from "./topics.mjs";
import { videoUrlAt } from "./chapters.mjs";

export function matchVideo(deckDate, videosByDate, allVideos) {
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

export function guessSlideForChapter(chapters, chapterIndex, slides) {
  if (!slides?.length) return null;
  if (chapterIndex === 0) return slides[0];
  const ratio = chapterIndex / Math.max(chapters.length - 1, 1);
  const idx = Math.min(slides.length - 1, Math.round(ratio * (slides.length - 1)));
  return slides[idx];
}

export function buildPoints(seminar) {
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
      const topic = extractTopics(slide.text, slide.title)[0] ?? topics?.[0] ?? "general";
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

/** Never clear an established date-matched video unless allowClear is true. */
export function applyVideoMatch(seminar, match, { allowClear = false, log = () => {} } = {}) {
  const video = match?.video ?? null;

  if (!video) {
    const hasEstablished =
      seminar.video?.id && (seminar.match?.confidence === "date" || seminar.chapters?.length > 0);
    if (!allowClear && hasEstablished) {
      log(`  ${seminar.id} — keeping existing video ${seminar.video.id}`);
      return false;
    }
    seminar.video = null;
    seminar.match = { confidence: "deck-only", method: "unmatched" };
    seminar.chapters = [];
    seminar.points = buildPoints(seminar);
    return true;
  }

  seminar.video = {
    id: video.id,
    title: video.title,
    url: video.url,
    thumbnail: video.thumbnail,
    duration: video.duration,
  };
  seminar.match = { confidence: match.confidence, method: match.method };
  seminar.chapters = video.chapters ?? [];
  seminar.points = buildPoints(seminar);
  return true;
}

export function refreshTopicsFromVideo(seminar, video) {
  const topicSet = new Set(seminar.topics ?? []);
  for (const ch of video?.chapters ?? []) {
    if (isNoiseChapter(ch.title)) continue;
    for (const t of tagAllTopics(ch.title)) topicSet.add(t);
  }
  if (topicSet.size) seminar.topics = [...topicSet];
}
