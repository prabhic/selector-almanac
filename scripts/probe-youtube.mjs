#!/usr/bin/env node
/**
 * Probe YouTube channel access (for CI diagnostics).
 * Exit 0 if flat playlist + date coverage work (video matching).
 * Full metadata (chapters) is optional — often blocked on datacenter IPs.
 */
import {
  fetchYouTubeCatalog,
  fetchFlatPlaylist,
  fetchVideoMeta,
  MIN_CHANNEL_VIDEOS,
  videoFromFlatEntry,
} from "./lib/youtube.mjs";

function log(msg) {
  process.stderr.write(`${msg}\n`);
}

async function main() {
  log(`YouTube probe — min videos: ${MIN_CHANNEL_VIDEOS}`);
  log(`Node ${process.version} on ${process.platform} ${process.arch}`);
  if (process.env.YOUTUBE_COOKIES || process.env.YOUTUBE_COOKIES_FILE) {
    log("cookies: configured (full metadata may work)");
  }

  let flat;
  try {
    flat = await fetchFlatPlaylist();
    log(`fetchFlatPlaylist: ${flat.length} video(s)`);
    if (flat.length) {
      const v = videoFromFlatEntry(flat[0]);
      log(`  latest: ${v.id} — ${v.title?.slice(0, 60)} (date ${v.date ?? "?"})`);
    }
  } catch (err) {
    log(`fetchFlatPlaylist FAILED: ${err.message}`);
    process.exit(1);
  }

  if (flat.length < MIN_CHANNEL_VIDEOS) {
    log(`FAIL: flat list too small (${flat.length})`);
    process.exit(1);
  }

  const testId = flat[0]?.id;
  if (testId) {
    try {
      const one = await fetchVideoMeta(testId);
      log(
        `fetchVideoMeta sample: OK — ${one.title?.slice(0, 50)} ` +
          `(${one.chapters?.length ?? 0} chapters, upload ${one.uploadDate ?? "?"})`,
      );
    } catch (err) {
      log(`fetchVideoMeta sample: skipped (${err.message.slice(0, 100)})`);
      log("  (flat playlist is enough for video matching in CI)");
    }
  }

  try {
    const { allVideos, videoIds } = await fetchYouTubeCatalog({
      log,
      minVideos: MIN_CHANNEL_VIDEOS,
      weeksForFullMeta: 8,
    });
    const weekly = allVideos.filter((v) => v.isWeekly).length;
    const withChapters = allVideos.filter((v) => (v.chapters ?? []).length > 0).length;
    const dated = allVideos.filter((v) => v.date).length;
    log(
      `fetchYouTubeCatalog: OK — ${allVideos.length} videos (${videoIds.length} ids), ` +
        `${dated} dated, ${weekly} weekly-titled, ${withChapters} with chapters`,
    );
    process.exit(0);
  } catch (err) {
    log(`fetchYouTubeCatalog FAILED: ${err.message}`);
    process.exit(1);
  }
}

main();
