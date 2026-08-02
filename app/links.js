/** Client-side link helpers (mirrors scripts/lib/links.mjs). */

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

function isDeckBlobUrl(u) {
  return /github\.com\/lselector\/seminar\/blob\//i.test(u);
}

function isLocalUrl(u) {
  try {
    const { hostname } = new URL(u);
    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]"
    );
  } catch {
    return /localhost|127\.0\.0\.1/i.test(u);
  }
}

export function linkLabel(url) {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, "");
    if (host === "github.com" || host === "github.io") return "GitHub ↗";
    if (host === "youtu.be" || host.endsWith("youtube.com")) return "YouTube ↗";
    if (host.includes("arxiv.org")) return "arXiv ↗";
    if (host.includes("anthropic.com")) return "Anthropic ↗";
    if (host.includes("openai.com")) return "OpenAI ↗";
    if (host.includes("huggingface.co")) return "Hugging Face ↗";
    if (host.includes("ycombinator.com")) return "YC ↗";
    const path = pathname && pathname !== "/" ? pathname : "";
    const short = (host + path).slice(0, 36);
    return (short.length < (host + path).length ? short + "…" : short) + " ↗";
  } catch {
    return "Link ↗";
  }
}

export function extractUrls(text, max = 8) {
  if (!text) return [];
  const seen = new Set();
  const out = [];
  for (const m of text.matchAll(URL_RE)) {
    let u = m[0].replace(/[.,;:)}\]`]+$/, "");
    if (!u || seen.has(u) || isDeckBlobUrl(u) || isLocalUrl(u)) continue;
    seen.add(u);
    out.push({ u, label: linkLabel(u) });
    if (out.length >= max) break;
  }
  return out;
}

/** pt row may carry links at index 5 as [[url, label], ...]. */
export function linksFromPt(pt) {
  if (!pt || !pt[5] || !pt[5].length) return [];
  return pt[5]
    .filter((pair) => !isLocalUrl(pair[0]))
    .map((pair) => ({ u: pair[0], label: pair[1] || linkLabel(pair[0]) }));
}

/** slides.json row: [index, title, text, links?] */
export function linksFromSlideRow(row) {
  if (!row) return [];
  if (row[3]?.length) {
    return row[3]
      .filter((pair) => !isLocalUrl(pair[0]))
      .map((pair) => ({ u: pair[0], label: pair[1] || linkLabel(pair[0]) }));
  }
  return extractUrls((row[1] || "") + "\n" + (row[2] || ""));
}
