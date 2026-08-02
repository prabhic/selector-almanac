import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseUploadDate, parseVideoTitleDate } from "./dates.mjs";
import { resolveChapters } from "./chapters.mjs";

const execFileAsync = promisify(execFile);
const CHANNEL = "https://www.youtube.com/channel/UCA4GfsgbI09cLzonTKryC6g/videos";

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
