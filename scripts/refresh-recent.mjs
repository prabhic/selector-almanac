#!/usr/bin/env node
/**
 * Incremental weekly refresh — re-match YouTube videos and optionally re-parse decks.
 * Updates only targeted session files under data/sessions/ (not the whole corpus).
 *
 * Usage:
 *   node scripts/refresh-recent.mjs                    # last 4 weeks + pending delta
 *   node scripts/refresh-recent.mjs --date 2026-07-31  # one session
 *   node scripts/refresh-recent.mjs --weeks 8 --parse  # re-fetch PPTX for recent decks
 *   node scripts/refresh-recent.mjs --all-unmatched    # also refresh old deck-only sessions
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDeckDate } from "./lib/dates.mjs";
import { writeAggregates } from "./lib/aggregate.mjs";
import {
  matchVideo,
  buildPoints,
  applyVideoMatch,
  refreshTopicsFromVideo,
} from "./lib/seminar.mjs";
import { fetchAndParsePptx } from "./lib/pptx.mjs";
import { fetchYouTubeCatalog } from "./lib/youtube.mjs";
import {
  DATA,
  ensureSessions,
  saveSession,
  compileSeminarsJson,
} from "./lib/sessions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = process.argv.slice(2);
const parsePptx = args.includes("--parse");
const allUnmatched = args.includes("--all-unmatched");
const dateIdx = args.indexOf("--date");
const oneDate = dateIdx >= 0 ? args[dateIdx + 1] : null;
const weeksIdx = args.indexOf("--weeks");
const weeks = weeksIdx >= 0 ? +args[weeksIdx + 1] : 4;

function log(msg) {
  process.stderr.write(`${msg}\n`);
}

function cutoffDate(weeksBack) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - weeksBack * 7);
  return d.toISOString().slice(0, 10);
}

function shouldRefresh(seminar, since, { forceIds = new Set() } = {}) {
  if (oneDate) return seminar.date === oneDate;
  if (forceIds.has(seminar.id)) return true;
  if (allUnmatched) {
    if (seminar.match?.confidence === "deck-only" || seminar.match?.method === "unmatched") return true;
    if (!seminar.video) return true;
  }
  return (seminar.date ?? "") >= since;
}

async function main() {
  const since = cutoffDate(weeks);
  log(`Refresh recent seminars (since ${since}, weeks=${weeks}${oneDate ? `, date=${oneDate}` : ""})`);

  const meta = JSON.parse(await readFile(join(DATA, "meta.json"), "utf8"));
  const forceIds = new Set(meta.pendingRefresh ?? []);
  if (forceIds.size) log(`  ${forceIds.size} pending delta session(s)`);

  const sessions = await ensureSessions({ log });
  const targets = sessions.filter((s) => shouldRefresh(s, since, { forceIds }));
  if (!targets.length) {
    log("Nothing to refresh.");
    return;
  }
  log(`  ${targets.length} session(s) to update`);

  const { allVideos, videosByDate } = await fetchYouTubeCatalog({ log, weeksForFullMeta: weeks });

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

    if (video) refreshTopicsFromVideo(seminar, video);

    const videoChanged = applyVideoMatch(seminar, match, { log });
    if (parsePptx || videoChanged) {
      seminar.points = buildPoints(seminar);
    }

    await saveSession(seminar);
    updated++;
    log(
      `  ${seminar.date} ${seminar.video ? "✓ " + seminar.video.id : "— no video"} (${seminar.chapters?.length ?? 0} chapters)`,
    );
  }

  const allSessions = await ensureSessions();
  await compileSeminarsJson(allSessions);
  await writeAggregates(allSessions, {
    refreshedIds: targets.map((s) => s.id),
    weeks,
    oneDate,
    videoCount: allVideos.length,
    pendingRefresh: [],
    lastDeltaIngest: meta.lastDeltaIngest,
  });

  log(`\nUpdated ${updated} session(s) → data/sessions/ + seminars.json`);
  log("Next: npm run build");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
