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

export async function fetchAndParsePptx(rawUrl) {
  const res = await fetch(rawUrl);
  if (!res.ok) throw new Error(`PPTX fetch failed: ${res.status} ${rawUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return parsePptxBuffer(buf);
}
