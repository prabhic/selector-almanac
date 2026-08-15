#!/usr/bin/env node
/**
 * Non-interactive CLI for recent AI-Updates weeks (agents, scripts).
 * For interactive browsing use: npm run browse
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_WEEK_COUNT,
  chapterVideoUrl,
  loadWeekly,
  seminarLinks,
  slideLinkGroups,
} from "./lib/browse.mjs";
import { videoUrlAt } from "./lib/chapters.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const countIdx = args.indexOf("--count");
const count = countIdx >= 0 ? Math.max(1, +args[countIdx + 1] || DEFAULT_WEEK_COUNT) : DEFAULT_WEEK_COUNT;
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Math.max(1, +args[limitIdx + 1] || 20) : 20;

function fail(msg) {
  process.stderr.write(`browse-weeks: ${msg}\n`);
  process.exit(1);
}

function flagValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

function positional() {
  return args.filter((a) => !a.startsWith("--") && a !== String(count) && a !== String(limit));
}

function resolveWeek(weekly, ref) {
  if (!ref) fail("missing week — use ISO date (2026-07-31) or index from `weeks` (1 = latest)");
  if (/^\d+$/.test(ref)) {
    const i = +ref - 1;
    if (i < 0 || i >= weekly.length) fail(`week index ${ref} out of range (1–${weekly.length})`);
    return { seminar: weekly[i], index: i + 1 };
  }
  let hit = weekly.find((s) => s.date === ref);
  if (hit) return { seminar: hit, index: weekly.indexOf(hit) + 1 };
  if (/^\d{2}-\d{2}$/.test(ref)) {
    hit = weekly.find((s) => s.date.endsWith(`-${ref}`));
    if (hit) return { seminar: hit, index: weekly.indexOf(hit) + 1 };
  }
  hit = weekly.find((s) => s.id.includes(ref));
  if (hit) return { seminar: hit, index: weekly.indexOf(hit) + 1 };
  fail(`no week matching "${ref}"`);
}

function emit(data) {
  if (jsonOut) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }
  if (typeof data === "string") process.stdout.write(`${data}\n`);
}

function openUrl(url) {
  if (!url) fail("no URL to open");
  const cmd =
    process.platform === "darwin"
      ? { bin: "open", argv: [url] }
      : process.platform === "win32"
        ? { bin: "cmd", argv: ["/c", "start", "", url] }
        : { bin: "xdg-open", argv: [url] };
  const r = spawnSync(cmd.bin, cmd.argv, { stdio: "inherit" });
  if (r.error) fail(r.error.message);
  if (r.status !== 0) fail(`failed to open ${url}`);
  process.stderr.write(`opened ${url}\n`);
}

function weeksCmd(weekly) {
  const list = weekly.slice(0, count).map((s, i) => ({
    index: i + 1,
    date: s.date,
    title: s.title,
    id: s.id,
    videoUrl: s.video?.url ?? null,
    deckUrl: s.deck?.githubUrl ?? null,
    chapters: s.chapters?.length ?? 0,
    slides: s.slides?.length ?? 0,
  }));
  if (jsonOut) {
    emit({ weeks: list, count: list.length });
    return;
  }
  emit(`Recent ${list.length} AI-Updates weeks:\n`);
  for (const w of list) {
    emit(
      `  ${w.index}. ${w.date}  ${w.title}  (${w.chapters} chapters, ${w.slides} slides)` +
        (w.videoUrl ? `\n     video: ${w.videoUrl}` : "") +
        (w.deckUrl ? `\n     deck:  ${w.deckUrl}` : "")
    );
  }
  emit("\nInteractive browse: npm run browse");
}

function showCmd(weekly, ref) {
  const { seminar, index } = resolveWeek(weekly, ref);
  const chapters = (seminar.chapters ?? []).map((ch, i) => ({
    index: i + 1,
    label: ch.label ?? "—",
    title: ch.title,
    seconds: ch.startSeconds,
    videoUrl: chapterVideoUrl(seminar, ch),
  }));
  const slides = (seminar.slides ?? []).slice(0, limit).map((sl) => ({
    index: sl.index,
    title: sl.title?.slice(0, 120) ?? "",
  }));
  const links = seminarLinks(seminar, 20);

  if (jsonOut) {
    emit({
      index,
      date: seminar.date,
      title: seminar.title,
      id: seminar.id,
      videoUrl: seminar.video?.url ?? null,
      deckUrl: seminar.deck?.githubUrl ?? null,
      topics: seminar.topics ?? [],
      chapters,
      slides,
      links,
      totals: { chapters: seminar.chapters?.length ?? 0, slides: seminar.slides?.length ?? 0 },
    });
    return;
  }

  emit(`# ${seminar.title} — ${seminar.date} (week #${index})\n`);
  if (seminar.video?.url) emit(`YouTube: ${seminar.video.url}`);
  if (seminar.deck?.githubUrl) emit(`Deck:    ${seminar.deck.githubUrl}`);
  if (seminar.topics?.length) emit(`Topics:  ${seminar.topics.join(", ")}`);
  emit(`\n## Chapters (${seminar.chapters?.length ?? 0})`);
  for (const ch of chapters.slice(0, 25)) emit(`  ${ch.index}. [${ch.label}] ${ch.title}`);
  emit(`\n## Slides (${seminar.slides?.length ?? 0})`);
  for (const sl of slides.slice(0, 10)) emit(`  ${sl.index}. ${sl.title}`);
  emit(`\n## Links (${links.length} shown)`);
  links.forEach((l, i) => emit(`  ${i + 1}. ${l.label}: ${l.url}`));
}

function chaptersCmd(weekly, ref) {
  const { seminar, index } = resolveWeek(weekly, ref);
  const chapters = (seminar.chapters ?? []).map((ch, i) => ({
    index: i + 1,
    label: ch.label,
    title: ch.title,
    seconds: ch.startSeconds,
    videoUrl: chapterVideoUrl(seminar, ch),
  }));
  if (jsonOut) {
    emit({ index, date: seminar.date, chapters });
    return;
  }
  emit(`Chapters — ${seminar.date} (week #${index})\n`);
  for (const ch of chapters) {
    emit(`  ${ch.index}. [${ch.label ?? "—"}] ${ch.title}`);
    if (ch.videoUrl) emit(`      ${ch.videoUrl}`);
  }
}

function slidesCmd(weekly, ref) {
  const { seminar, index } = resolveWeek(weekly, ref);
  const slides = (seminar.slides ?? []).slice(0, limit).map((sl) => ({
    index: sl.index,
    title: sl.title,
    preview: (sl.text ?? "").slice(0, 200),
  }));
  if (jsonOut) {
    emit({ index, date: seminar.date, slides, total: seminar.slides?.length ?? 0 });
    return;
  }
  emit(`Slides — ${seminar.date} (week #${index}, showing ${slides.length})\n`);
  for (const sl of slides) emit(`  ${sl.index}. ${sl.title}`);
}

function linksCmd(weekly, ref) {
  const { seminar, index } = resolveWeek(weekly, ref);
  const groups = slideLinkGroups(seminar);
  if (jsonOut) {
    emit({
      index,
      date: seminar.date,
      slides: groups.map((g) => ({
        slide: g.index,
        title: g.title,
        links: g.links,
      })),
    });
    return;
  }
  emit(`Links by slide — ${seminar.date} (week #${index})\n`);
  for (const g of groups) {
    emit(`\nSlide ${g.index}: ${g.title}`);
    g.links.forEach((l, i) => emit(`  ${i + 1}. ${l.label}: ${l.url}`));
  }
}

function openCmd(weekly, kind, ref) {
  const { seminar } = resolveWeek(weekly, ref);

  if (kind === "deck") {
    const url = seminar.deck?.githubUrl;
    if (!url) fail("no deck URL for this week");
    openUrl(url);
    return;
  }

  if (kind === "youtube") {
    const chNum = flagValue("--chapter");
    const at = flagValue("--at");
    const vid = seminar.video?.id;
    if (!vid) fail("no YouTube video for this week");
    let url;
    if (chNum) {
      const i = +chNum - 1;
      const ch = seminar.chapters?.[i];
      if (!ch) fail(`chapter ${chNum} not found`);
      url = chapterVideoUrl(seminar, ch);
    } else if (at != null) {
      url = videoUrlAt(vid, +at);
    } else {
      url = seminar.video?.url ?? videoUrlAt(vid, 0);
    }
    openUrl(url);
    return;
  }

  if (kind === "link") {
    const pos = positional();
    const linkIdx = pos[3];
    if (!linkIdx) fail("usage: open link <date|#> <link#>");
    const links = seminarLinks(seminar, 50);
    const i = +linkIdx - 1;
    if (i < 0 || i >= links.length) fail(`link #${linkIdx} not found (1–${links.length})`);
    openUrl(links[i].url);
    return;
  }

  fail(`unknown open target "${kind}" — use youtube, deck, or link`);
}

async function main() {
  const weekly = await loadWeekly(ROOT);
  if (!weekly.length) fail("no ai-weekly seminars in data/seminars.json");

  const pos = positional();
  const cmd = pos[0];

  switch (cmd) {
    case "weeks":
      weeksCmd(weekly);
      break;
    case "show":
      showCmd(weekly, pos[1]);
      break;
    case "chapters":
      chaptersCmd(weekly, pos[1]);
      break;
    case "slides":
      slidesCmd(weekly, pos[1]);
      break;
    case "links":
      linksCmd(weekly, pos[1]);
      break;
    case "open":
      openCmd(weekly, pos[1], pos[2]);
      break;
    case "help":
    case "--help":
    case "-h":
      emit(`browse-weeks — non-interactive CLI (use npm run browse for TUI)

Commands:
  weeks [--count 5]           List recent weeks
  show <date|#>               Week overview
  chapters|slides|links <date|#>
  open youtube|deck|link <date|#> [...]

Interactive TUI: npm run browse`);
      break;
    default:
      fail(cmd ? `unknown command "${cmd}"` : 'missing command — try "weeks", "browse", or "help"');
  }
}

main().catch((e) => fail(e.message));
