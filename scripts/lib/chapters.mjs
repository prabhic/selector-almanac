export function formatTimestampLabel(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function parseChapters(description) {
  if (!description) return [];

  const lines = description.split(/\r?\n/);
  const chapters = [];
  const re = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    const m = trimmed.match(re);
    if (!m) continue;

    const a = +m[1];
    const b = +m[2];
    const c = m[3] ? +m[3] : null;
    const title = m[4].trim();

    let startSeconds;
    let label;
    if (c !== null) {
      startSeconds = a * 3600 + b * 60 + c;
      label = formatTimestampLabel(startSeconds);
    } else {
      startSeconds = a * 60 + b;
      label = formatTimestampLabel(startSeconds);
    }

    chapters.push({ title, startSeconds, label, source: "description" });
  }

  return chapters;
}

/** Bullet list under "Contents of today's video:" — no timestamps, but still useful. */
export function parseBulletContents(description) {
  if (!description) return [];

  const marker = /---------+\s*contents of today's video:/i;
  const match = description.match(marker);
  if (!match) return [];

  const start = match.index + match[0].length;
  const section = description.slice(start);
  const items = [];

  for (const line of section.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (items.length > 0) break;
      continue;
    }
    if (/^-{3,}/.test(trimmed) || /^need ai consulting/i.test(trimmed)) break;
    if (/^https?:\/\//.test(trimmed)) continue;
    if (/^\d{1,2}:\d{2}/.test(trimmed)) continue;

    const title = trimmed.replace(/^[-•*]\s*/, "").replace(/^\d+\.\s*/, "").trim();
    if (title.length < 4) continue;
    items.push({ title, startSeconds: null, label: null, source: "outline" });
  }

  return items;
}

export function fromYtDlpChapters(ytChapters) {
  if (!ytChapters?.length) return [];
  return ytChapters.map((ch) => {
    const startSeconds = Math.floor(ch.start_time ?? 0);
    return {
      title: ch.title,
      startSeconds,
      label: formatTimestampLabel(startSeconds),
      source: "youtube",
    };
  });
}

/** Prefer YouTube embedded chapters, then description timestamps, then bullet outline. */
export function resolveChapters(description, ytChapters) {
  const fromYt = fromYtDlpChapters(ytChapters);
  if (fromYt.length) return fromYt;

  const fromDesc = parseChapters(description);
  if (fromDesc.length) return fromDesc;

  return parseBulletContents(description);
}

export function videoUrlAt(videoId, seconds) {
  if (seconds == null) return `https://www.youtube.com/watch?v=${videoId}`;
  return `https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`;
}
