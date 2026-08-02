/**
 * Extract external URLs embedded in Lev's slide / chapter text.
 * Returns compact [url, label] pairs for index + UI.
 */

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/** Lev's deck blob URLs — we already link the deck separately. */
function isDeckBlobUrl(u) {
  return /github\.com\/lselector\/seminar\/blob\//i.test(u);
}

/** Local dev URLs from slide setup examples — not useful as external sources. */
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
    if (host.includes("linkedin.com")) return "LinkedIn ↗";
    if (host.includes("x.com") || host === "twitter.com") return "X ↗";
    const path = pathname && pathname !== "/" ? pathname : "";
    const short = (host + path).slice(0, 36);
    return (short.length < (host + path).length ? short + "…" : short) + " ↗";
  } catch {
    return "Link ↗";
  }
}

export function extractUrls(text, { max = 10, exclude = [] } = {}) {
  if (!text) return [];
  const skip = new Set(exclude.map(normalizeUrl));
  const seen = new Set();
  const out = [];
  for (const m of text.matchAll(URL_RE)) {
    let u = m[0].replace(/[.,;:)}\]`]+$/,"");
    u = normalizeUrl(u);
    if (!u || seen.has(u) || skip.has(u)) continue;
    if (isDeckBlobUrl(u) || isLocalUrl(u)) continue;
    seen.add(u);
    out.push([u, linkLabel(u)]);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return u;
  }
}

export function linksForSlide(slide, opts = {}) {
  const title = slide?.title ?? "";
  const text = slide?.text ?? "";
  return extractUrls(`${title}\n${text}`, opts);
}

export function linksForSeminarPoint(seminar, slideIdx, extraText = "") {
  const slides = seminar?.slides ?? [];
  const slide = slideIdx >= 0 ? slides.find((s) => s.index === slideIdx) : null;
  const fromSlide = slide ? linksForSlide(slide, { max: 8 }) : [];
  const fromExtra = extraText ? extractUrls(extraText, { max: 4 }) : [];
  const seen = new Set();
  const out = [];
  for (const pair of [...fromSlide, ...fromExtra]) {
    if (seen.has(pair[0])) continue;
    seen.add(pair[0]);
    out.push(pair);
    if (out.length >= 8) break;
  }
  return out;
}
