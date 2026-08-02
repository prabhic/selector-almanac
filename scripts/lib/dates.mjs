const MONTHS = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

export function isoFromParts(year, month, day) {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDeckDate(filename) {
  const base = filename.replace(/\.pptx$/i, "").split("/").pop();

  let m = base.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return isoFromParts(+m[1], +m[2], +m[3]);

  m = base.match(/^(\d{2})-(\d{2})-(\d{2})/);
  if (m) return isoFromParts(2000 + +m[1], +m[2], +m[3]);

  return null;
}

export function parseVideoTitleDate(title) {
  const m = title.match(
    /-\s*([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\s*$/i,
  );
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  return isoFromParts(+m[3], month, +m[2]);
}

export function parseUploadDate(uploadDate) {
  if (!uploadDate || uploadDate.length !== 8) return null;
  return isoFromParts(
    +uploadDate.slice(0, 4),
    +uploadDate.slice(4, 6),
    +uploadDate.slice(6, 8),
  );
}

export function daysBetween(a, b) {
  const da = new Date(a + "T12:00:00Z");
  const db = new Date(b + "T12:00:00Z");
  return Math.round((da - db) / 86400000);
}

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
