import { readdir } from "node:fs/promises";
import { join } from "node:path";

const REPO = "lselector/seminar";
const BRANCH = "master";
const BASE_RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const BASE_BLOB = `https://github.com/${REPO}/blob/${BRANCH}`;

async function walkPptx(dir, prefix = "") {
  const paths = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      paths.push(...await walkPptx(join(dir, entry.name), rel));
    } else if (entry.name.toLowerCase().endsWith(".pptx")) {
      paths.push(rel);
    }
  }
  return paths;
}

export async function fetchDeckPathsFromLocal(cloneRoot) {
  return (await walkPptx(cloneRoot)).sort();
}

export async function fetchDeckPaths() {
  const url = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "selector-almanac-ingest" },
  });
  if (!res.ok) throw new Error(`GitHub tree fetch failed: ${res.status}`);
  const data = await res.json();
  return data.tree
    .filter((t) => t.path.endsWith(".pptx"))
    .map((t) => t.path)
    .sort();
}

export async function resolveDeckPaths(localClonePath) {
  try {
    const local = await fetchDeckPathsFromLocal(localClonePath);
    if (local.length > 0) {
      return { paths: local, source: "local-clone" };
    }
  } catch {
    // fall through to API
  }
  return { paths: await fetchDeckPaths(), source: "github-api" };
}

export function isWeeklyDeckPath(path) {
  return /AI-Updates/i.test(path);
}

export function isWeekly2025Or2026(path) {
  if (!isWeeklyDeckPath(path)) return false;
  const year = path.match(/^(\d{4})\//)?.[1];
  return year === "2025" || year === "2026";
}

export function deckRecord(path) {
  const filename = path.split("/").pop();
  const title = filename
    .replace(/\.pptx$/i, "")
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/^\d{2}-\d{2}-\d{2}-/, "")
    .replace(/_Lev$/, "")
    .replace(/_/g, " ");

  return {
    path,
    filename,
    title,
    githubUrl: `${BASE_BLOB}/${path}`,
    rawUrl: `${BASE_RAW}/${path}`,
  };
}
