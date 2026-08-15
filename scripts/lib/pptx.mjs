import JSZip from "jszip";

function decodeXml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

function extractTextFromSlideXml(xml) {
  const parts = [];
  const re = /<a:t[^>]*>([^<]*)<\/a:t>/g;
  let m;
  while ((m = re.exec(xml))) {
    const t = decodeXml(m[1]).trim();
    if (t) parts.push(t);
  }
  return parts.join(" ");
}

export async function parsePptxBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = +a.match(/slide(\d+)/)[1];
      const nb = +b.match(/slide(\d+)/)[1];
      return na - nb;
    });

  const slides = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.file(slideFiles[i]).async("string");
    const text = extractTextFromSlideXml(xml);
    const title = text.split(/\s+/).slice(0, 8).join(" ") || `Slide ${i + 1}`;
    slides.push({ index: i + 1, title, text });
  }

  return slides;
}

const IMAGE_MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/** Raster images referenced by each slide — PPTX stays in memory only. */
export async function extractSlideImages(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const bySlide = {};

  const relFiles = Object.keys(zip.files).filter((n) =>
    /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(n),
  );

  for (const relPath of relFiles) {
    const n = +relPath.match(/slide(\d+)/)[1];
    const xml = await zip.file(relPath).async("string");
    const images = [];
    const re = /Type="[^"]*\/image"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Type="[^"]*\/image"/gi;
    let m;
    while ((m = re.exec(xml))) {
      const target = (m[1] || m[2] || "").replace(/\\/g, "/");
      if (!target || /^https?:/i.test(target)) continue;
      const mediaPath = target.startsWith("/")
        ? target.slice(1)
        : `ppt/slides/${target}`.replace(/\/slides\/\.\.\//g, "/");
      const file = zip.file(mediaPath);
      if (!file) continue;
      const ext = mediaPath.split(".").pop()?.toLowerCase() ?? "";
      const mime = IMAGE_MIME[ext];
      if (!mime) continue;
      const bytes = await file.async("base64");
      images.push(`data:${mime};base64,${bytes}`);
    }
    if (images.length) bySlide[n] = images;
  }

  return bySlide;
}

export async function fetchPptxBuffer(rawUrl) {
  const res = await fetch(rawUrl);
  if (!res.ok) throw new Error(`PPTX fetch failed: ${res.status} ${rawUrl}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function fetchAndParsePptx(rawUrl) {
  return parsePptxBuffer(await fetchPptxBuffer(rawUrl));
}

