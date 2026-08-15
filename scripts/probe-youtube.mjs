#!/usr/bin/env node
/**
 * Probe YouTube channel access (for CI diagnostics).
 * Exit 0 if ≥50 videos listed; exit 1 with stderr details otherwise.
 */
import { fetchYouTubeCatalog, MIN_CHANNEL_VIDEOS, fetchVideoList } from "./lib/youtube.mjs";

function log(msg) {
  process.stderr.write(`${msg}\n`);
}

async function main() {
  log(`YouTube probe — min videos: ${MIN_CHANNEL_VIDEOS}`);
  log(`Node ${process.version} on ${process.platform} ${process.arch}`);

  try {
    const ids = await fetchVideoList();
    log(`fetchVideoList: ${ids.length} id(s)`);
    if (ids.length) log(`  first: ${ids.slice(0, 3).join(", ")}`);
  } catch (err) {
    log(`fetchVideoList FAILED: ${err.message}`);
    process.exit(1);
  }

  try {
    const { allVideos, videoIds } = await fetchYouTubeCatalog({ log, minVideos: MIN_CHANNEL_VIDEOS });
    log(`fetchYouTubeCatalog: OK — ${allVideos.length} videos (${videoIds.length} ids)`);
    const weekly = allVideos.filter((v) => v.isWeekly).length;
    log(`  weekly-titled: ${weekly}`);
    process.exit(0);
  } catch (err) {
    log(`fetchYouTubeCatalog FAILED: ${err.message}`);
    process.exit(1);
  }
}

main();
