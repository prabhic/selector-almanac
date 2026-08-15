import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseUploadDate, parseVideoTitleDate, isoFromParts } from "./dates.mjs";
import { resolveChapters } from "./chapters.mjs";

const execFileAsync = promisify(execFile);
const CHANNEL = "https://www.youtube.com/channel/UCA4GfsgbI09cLzonTKryC6g/videos";

/** Lev Selector channel has ~300 videos; refuse refresh if fetch looks broken. */
export const MIN_CHANNEL_VIDEOS = 50;

/** Standalone yt-dlp binary needs EJS scripts for YouTube full extraction. */
function ytdlpFullExtractArgs() {
  return ["--remote-components", "ejs:github", "--no-progress"];
}

function ytdlpFlatArgs() {
  return ["--no-progress"];
}

function execError(err) {
  const parts = [err.message];
  if (err.stderr) parts.push(String(err.stderr).trim().slice(0, 300));
  return parts.filter(Boolean).join(" — ");
}

export function isWeeklyVideoTitle(title) {
  return (
    /ai\s+updates?\s+weekly/i.test(title) ||
    /exciting\s+ai\s+(news|updates)/i.test(title) ||
    /have you heard these exciting ai news/i.test(title)
  );
}

function dateFromTimestamp(ts) {
  if (!ts) return null;
  const d = new Date(ts * 1000);
  return isoFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function videoFromFlatEntry(entry) {
  const id = entry.id;
  const title = entry.title ?? "";
  const date =
    parseUploadDate(entry.upload_date) ??
    dateFromTimestamp(entry.timestamp) ??
    parseVideoTitleDate(title);

  return {
    id,
    title,
    date,
    uploadDate: entry.upload_date ?? null,
    url: `https://www.youtube.com/watch?v=${id}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    description: "",
    chapters: [],
    duration: entry.duration ?? null,
    isWeekly: isWeeklyVideoTitle(title),
  };
}

function parseYtdlpJson(stdout) {
  const text = stdout.trim();
  if (!text) throw new Error("yt-dlp returned empty output");
  return JSON.parse(text);
}

/** Fast channel listing — works without Deno/Node JS runtime. */
export async function fetchFlatPlaylist() {
  const { stdout } = await execFileAsync(
    "yt-dlp",
    [...ytdlpFlatArgs(), "--flat-playlist", "-j", CHANNEL],
    { maxBuffer: 50 * 1024 * 1024 },
  );

  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function fetchVideoList() {
  const flat = await fetchFlatPlaylist();
  return flat.map((e) => e.id).filter(Boolean);
}

export function mapVideoFromJson(data, videoId) {
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

/** Full metadata (description, chapters) — requires Deno or Node 20+ in PATH. */
export async function fetchVideoMeta(videoId) {
  try {
    const { stdout } = await execFileAsync(
      "yt-dlp",
      [
        ...ytdlpFullExtractArgs(),
        "--skip-download",
        "-j",
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { maxBuffer: 5 * 1024 * 1024 },
    );

    const data = parseYtdlpJson(stdout);
    return mapVideoFromJson(data, videoId);
  } catch (err) {
    throw new Error(execError(err));
  }
}

export async function fetchAllVideoMeta(videoIds, { concurrency = 4, onProgress } = {}) {
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

function cutoffIsoDate(weeksBack) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - weeksBack * 7);
  return d.toISOString().slice(0, 10);
}

function idsNeedingFullMeta(videos, { weeksForFullMeta, fullMetaIds } = {}) {
  if (fullMetaIds?.size) return [...fullMetaIds];
  if (!weeksForFullMeta) return videos.map((v) => v.id);

  const since = cutoffIsoDate(weeksForFullMeta);
  return videos.filter((v) => (v.date ?? "") >= since).map((v) => v.id);
}

/**
 * Fetch channel catalog with a sanity check so CI/network failures cannot wipe matches.
 *
 * Strategy:
 * 1. Flat playlist for all ids/titles/dates (fast, no JS runtime).
 * 2. Full metadata only for recent weeks (chapters/description) — delta-friendly.
 */
export async function fetchYouTubeCatalog({
  minVideos = MIN_CHANNEL_VIDEOS,
  weeksForFullMeta = 8,
  fullMetaAll = false,
  concurrency = 4,
  log = () => {},
  onProgress,
} = {}) {
  log("Fetching YouTube channel (flat playlist)…");
  const flat = await fetchFlatPlaylist();
  if (flat.length < minVideos) {
    throw new Error(
      `YouTube channel list too small (${flat.length} ids, need ≥${minVideos}). ` +
        "Refusing to update video matches — possible CI/network block.",
    );
  }

  const baseVideos = flat.map(videoFromFlatEntry).filter((v) => v.id);
  const withDate = baseVideos.filter((v) => v.date);
  log(`  ${baseVideos.length} videos (${withDate.length} with dates)`);

  const enrichIds = idsNeedingFullMeta(baseVideos, {
    weeksForFullMeta: fullMetaAll ? null : weeksForFullMeta,
  });
  const uniqueEnrichIds = [...new Set(enrichIds)];

  log(
    `  enriching ${uniqueEnrichIds.length} video(s) with full metadata` +
      (fullMetaAll ? " (full corpus)" : weeksForFullMeta ? ` (last ${weeksForFullMeta} weeks)` : ""),
  );

  const metaMap = await fetchAllVideoMeta(uniqueEnrichIds, {
    concurrency,
    onProgress:
      onProgress ??
      ((done, total) => {
        if (done % 10 === 0 || done === total) log(`  metadata ${done}/${total}`);
      }),
  });

  const fullOk = [...metaMap.values()].filter((v) => !v.error).length;
  const fullErrors = uniqueEnrichIds.length - fullOk;

  if (uniqueEnrichIds.length > 0 && fullOk === 0) {
    const sample = [...metaMap.values()].find((v) => v.error)?.error ?? "unknown";
    throw new Error(
      `YouTube metadata fetch failed (0/${uniqueEnrichIds.length} ok). ` +
        `Sample error: ${sample}. ` +
        "Ensure Deno is installed in CI (see scripts/ci-install-yt-dlp.sh).",
    );
  }

  if (fullErrors) {
    log(`  warning: ${fullErrors} full-metadata error(s), using flat data as fallback`);
  }

  const enrichedById = new Map(baseVideos.map((v) => [v.id, v]));
  for (const [id, meta] of metaMap) {
    if (!meta.error) enrichedById.set(id, meta);
  }

  const allVideos = [...enrichedById.values()];
  if (withDate.length < minVideos) {
    throw new Error(
      `YouTube date coverage too weak (${withDate.length} dated videos, need ≥${minVideos}).`,
    );
  }

  const videosByDate = new Map();
  for (const v of allVideos) {
    if (!v.date) continue;
    if (!videosByDate.has(v.date)) videosByDate.set(v.date, []);
    videosByDate.get(v.date).push(v);
  }

  log(`  ${allVideos.length} videos in catalog, ${fullOk} with chapters/description`);
  return { allVideos, videosByDate, videoIds: baseVideos.map((v) => v.id) };
}
