import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseUploadDate, parseVideoTitleDate } from "./dates.mjs";
import { resolveChapters } from "./chapters.mjs";

const execFileAsync = promisify(execFile);
const CHANNEL = "https://www.youtube.com/channel/UCA4GfsgbI09cLzonTKryC6g/videos";

/** Lev Selector channel has ~300 videos; refuse refresh if fetch looks broken. */
export const MIN_CHANNEL_VIDEOS = 50;

export function isWeeklyVideoTitle(title) {
  return (
    /ai\s+updates?\s+weekly/i.test(title) ||
    /exciting\s+ai\s+(news|updates)/i.test(title) ||
    /have you heard these exciting ai news/i.test(title)
  );
}

export async function fetchVideoList() {
  const { stdout } = await execFileAsync("yt-dlp", [
    "--flat-playlist",
    "--print", "%(id)s",
    CHANNEL,
  ], { maxBuffer: 10 * 1024 * 1024 });

  return stdout.trim().split("\n").filter(Boolean);
}

export async function fetchVideoMeta(videoId) {
  const { stdout } = await execFileAsync("yt-dlp", [
    "--skip-download",
    "-j",
    `https://www.youtube.com/watch?v=${videoId}`,
  ], { maxBuffer: 5 * 1024 * 1024 });

  const data = JSON.parse(stdout);
  const title = data.title ?? "";
  const date =
    parseUploadDate(data.upload_date) ??
    parseVideoTitleDate(title);

  return {
    id: videoId,
    title,
    date,
    uploadDate: data.upload_date ?? null,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    description: data.description ?? "",
    chapters: resolveChapters(data.description ?? "", data.chapters),
    duration: data.duration ?? null,
    isWeekly: isWeeklyVideoTitle(title),
  };
}

export async function fetchAllVideoMeta(videoIds, { concurrency = 6, onProgress } = {}) {
  const results = new Map();
  let done = 0;

  async function worker(id) {
    try {
      results.set(id, await fetchVideoMeta(id));
    } catch (err) {
      results.set(id, { id, error: err.message, title: id, date: null, chapters: [] });
    }
    done++;
    onProgress?.(done, videoIds.length);
  }

  const queue = [...videoIds];
  const runners = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const id = queue.shift();
      if (id) await worker(id);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Fetch channel catalog with a sanity check so CI/network failures cannot wipe matches.
 */
export async function fetchYouTubeCatalog({
  minVideos = MIN_CHANNEL_VIDEOS,
  concurrency = 8,
  log = () => {},
  onProgress,
} = {}) {
  log("Fetching YouTube channel…");
  const videoIds = await fetchVideoList();
  if (videoIds.length < minVideos) {
    throw new Error(
      `YouTube channel list too small (${videoIds.length} ids, need ≥${minVideos}). ` +
        "Refusing to update video matches — possible CI/network block.",
    );
  }

  const metaMap = await fetchAllVideoMeta(videoIds, {
    concurrency,
    onProgress:
      onProgress ??
      ((done, total) => {
        if (done % 50 === 0 || done === total) log(`  metadata ${done}/${total}`);
      }),
  });

  const allVideos = [...metaMap.values()].filter((v) => !v.error);
  const errors = videoIds.length - allVideos.length;
  if (allVideos.length < minVideos) {
    throw new Error(
      `YouTube metadata fetch too weak (${allVideos.length} ok, ${errors} errors, need ≥${minVideos}). ` +
        "Refusing to update video matches.",
    );
  }

  const videosByDate = new Map();
  for (const v of allVideos) {
    if (!v.date) continue;
    if (!videosByDate.has(v.date)) videosByDate.set(v.date, []);
    videosByDate.get(v.date).push(v);
  }

  log(`  ${allVideos.length} videos loaded (${errors} metadata errors)`);
  return { allVideos, videosByDate, videoIds };
}
