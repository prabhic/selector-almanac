import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { extractUrls } from "./links.mjs";
import { videoUrlAt } from "./chapters.mjs";

export const DEFAULT_WEEK_COUNT = 5;

export async function loadWeekly(root) {
  const raw = await readFile(join(root, "data/seminars.json"), "utf8");
  return JSON.parse(raw)
    .filter((s) => s.series === "ai-weekly")
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function seminarLinks(seminar, max = 50) {
  const seen = new Set();
  const out = [];
  for (const slide of seminar.slides ?? []) {
    for (const link of linksForSlideRecord(slide, { max: 8 })) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      out.push(link);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** URLs embedded in one slide (title + body), excluding deck blobs. */
export function linksForSlideRecord(slide, { max = 30 } = {}) {
  return extractUrls(`${slide?.title ?? ""}\n${slide?.text ?? ""}`, { max }).map(([url, label]) => ({
    url,
    label: label.replace(/ ↗$/, ""),
  }));
}

/** Slides that carry external reference links (for per-item link browsing). */
export function slideLinkGroups(seminar) {
  return (seminar.slides ?? [])
    .map((sl) => {
      const links = linksForSlideRecord(sl, { max: 40 });
      return {
        kind: "slide-source",
        index: sl.index,
        title: sl.title ?? "",
        links,
        linkCount: links.length,
      };
    })
    .filter((g) => g.linkCount > 0);
}

export function chapterVideoUrl(seminar, chapter) {
  const vid = seminar.video?.id;
  if (!vid) return null;
  return videoUrlAt(vid, chapter?.startSeconds ?? 0);
}

export function openUrl(url) {
  if (!url) return Promise.reject(new Error("no URL"));
  const cmd =
    process.platform === "darwin"
      ? { bin: "open", argv: [url] }
      : process.platform === "win32"
        ? { bin: "cmd", argv: ["/c", "start", "", url] }
        : { bin: "xdg-open", argv: [url] };
  return new Promise((resolve, reject) => {
    const child = spawn(cmd.bin, cmd.argv, { stdio: "ignore", detached: true });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(url) : reject(new Error(`exit ${code}`))));
    child.unref();
  });
}

export const VIEWS = ["chapters", "slides", "links"];

export function viewLabel(view) {
  return { chapters: "Chapters (YouTube)", slides: "Slides", links: "Links (from deck)" }[view];
}

export function buildViewItems(seminar, view) {
  if (view === "chapters") {
    return (seminar.chapters ?? []).map((ch, i) => ({
      kind: "chapter",
      index: i + 1,
      label: `[${ch.label ?? "—"}] ${ch.title}`,
      url: chapterVideoUrl(seminar, ch),
      detail: chapterVideoUrl(seminar, ch) ?? "",
    }));
  }
  if (view === "slides") {
    return (seminar.slides ?? []).map((sl) => ({
      kind: "slide",
      index: sl.index,
      label: `${sl.index}. ${sl.title}`,
      url: seminar.deck?.githubUrl ?? null,
      detail: (sl.text ?? "").slice(0, 400),
    }));
  }
  return slideLinkGroups(seminar).flatMap((g) =>
    g.links.map((l, i) => ({
      kind: "ref-link",
      slideIndex: g.index,
      index: i + 1,
      label: `Slide ${g.index} · ${l.label}`,
      url: l.url,
      detail: `${g.title}\n\n${l.url}`,
    }))
  );
}

export function buildLinkItemsForGroup(group) {
  if (!group?.links?.length) return [];
  return group.links.map((l, i) => ({
    kind: "ref-link",
    index: i + 1,
    label: `${l.label}`,
    url: l.url,
    detail: l.url,
  }));
}
