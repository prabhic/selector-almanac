/**
 * Live deck viewer on loopback: GitHub PPTX stays in RAM, browser renders it,
 * TUI clicks call goToSlide. Microsoft's viewer cannot start on a given slide.
 */
import http from "node:http";
import { guessSlideForChapter } from "./corpus.mjs";
import { fetchPptxBuffer } from "./pptx.mjs";

const HOST = "127.0.0.1";
const RENDERER =
  "https://cdn.jsdelivr.net/npm/@aiden0z/pptx-renderer@1.2.4/dist/aiden0z-pptx-renderer.browser.es.js";

export function guessedSlideIndex(seminar, { view, selectedIndex } = {}) {
  if (view === "slides" && selectedIndex != null) {
    const sl = seminar.slides?.[selectedIndex];
    if (sl?.index) return sl.index;
  }
  if (view === "chapters" && selectedIndex != null) {
    const slide = guessSlideForChapter(seminar.chapters ?? [], selectedIndex, seminar.slides);
    if (slide?.index) return slide.index;
  }
  return 1;
}

export function officeDeckUrl(rawUrl, slide = 1) {
  const start = Math.max(1, Number(slide) || 1);
  const src = encodeURIComponent(rawUrl);
  return `https://view.officeapps.live.com/op/embed.aspx?src=${src}&wdStartOn=${start}`;
}

const state = { raw: "", slide: 1, date: "", id: "", total: 0 };
const decks = new Map();
const sseClients = new Set();
let server = null;
let port = 0;
let openedAt = 0;

function snapshot() {
  return {
    slide: state.slide,
    id: state.id,
    total: state.total,
    title: `${state.date} · slide ${state.slide}`,
  };
}

function broadcast() {
  const payload = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const res of sseClients) res.write(payload);
}

async function deckBuffer() {
  if (!state.id || !state.raw) throw new Error("no deck");
  if (!decks.has(state.id)) {
    const buf = await fetchPptxBuffer(state.raw);
    decks.clear();
    decks.set(state.id, buf);
  }
  return decks.get(state.id);
}

const VIEWER_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Deck</title>
  <style>
    html, body { margin:0; height:100%; background:#1a1a1a; color:#eee; font:13px system-ui, sans-serif; }
    #stage { position:fixed; inset:0 0 44px 0; }
    #bar { position:fixed; left:0; right:0; bottom:0; height:44px; display:flex; align-items:center; justify-content:center; gap:12px; background:#111; border-top:1px solid #333; }
    #bar button { border:1px solid #555; background:#222; color:#eee; padding:6px 14px; cursor:pointer; font:inherit; }
    #bar button:hover { background:#333; }
    #count { min-width:5.5em; text-align:center; font-variant-numeric:tabular-nums; color:#aaa; }
    #err { color:#fff; padding:24px; }
  </style>
</head>
<body>
  <div id="stage"></div>
  <div id="bar">
    <button type="button" id="prev" aria-label="Previous slide">←</button>
    <span id="count"></span>
    <button type="button" id="next" aria-label="Next slide">→</button>
  </div>
  <script type="module">
    import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from "${RENDERER}";
    const stage = document.getElementById("stage");
    const countEl = document.getElementById("count");
    let viewer = null;
    let loadedId = "";
    let slide = 1;
    let total = 0;
    let going = Promise.resolve();
    let lastFromTui = "";

    function label() {
      countEl.textContent = (total ? slide + " / " + total : String(slide));
      document.title = slide + (total ? " / " + total : "");
    }

    async function show(s, fromTui) {
      if (!s?.id) return;
      slide = Math.max(1, s.slide || 1);
      if (s.total) total = s.total;
      label();
      const idx = slide - 1;
      const key = s.id + ":" + slide;
      if (fromTui) lastFromTui = key;
      going = going.then(async () => {
        if (loadedId !== s.id) {
          if (viewer) { viewer.destroy(); viewer = null; }
          stage.replaceChildren();
          const buf = await fetch("/deck.pptx?id=" + encodeURIComponent(s.id)).then(r => {
            if (!r.ok) throw new Error("deck fetch " + r.status);
            return r.arrayBuffer();
          });
          viewer = await PptxViewer.open(buf, stage, {
            zipLimits: RECOMMENDED_ZIP_LIMITS,
            fitMode: "contain",
            renderMode: "slide",
          });
          loadedId = s.id;
          total = viewer.slideCount || total;
          label();
        }
        await viewer.goToSlide(idx, { behavior: "instant" });
      }).catch((e) => {
        stage.innerHTML = "<p id=err>Could not render slide: " + e.message + "</p>";
      });
      await going;
    }

    async function step(dir) {
      const n = total || viewer?.slideCount || 1;
      const next = ((slide - 1 + dir + n) % n) + 1;
      await show({ id: loadedId, slide: next, total: n }, false);
      fetch("/goto?slide=" + next, { method: "POST" }).catch(() => {});
    }

    document.getElementById("prev").onclick = () => step(-1);
    document.getElementById("next").onclick = () => step(1);
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); step(1); }
    });

    fetch("/state").then(r => r.json()).then(s => show(s, true));
    const es = new EventSource("/events");
    es.onmessage = (e) => {
      const s = JSON.parse(e.data);
      if (s.id + ":" + s.slide === lastFromTui && loadedId) return;
      show(s, true);
    };
  </script>
</body>
</html>`;

function startServer() {
  if (server) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://${HOST}`);
      try {
        if (url.pathname === "/state") {
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify(snapshot()));
          return;
        }
        if (url.pathname === "/goto") {
          const n = Math.max(1, parseInt(url.searchParams.get("slide") || "1", 10) || 1);
          state.slide = n;
          res.writeHead(204);
          res.end();
          return;
        }
        if (url.pathname === "/events") {
          res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-store",
            connection: "keep-alive",
          });
          res.write("\n");
          sseClients.add(res);
          res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
          req.on("close", () => sseClients.delete(res));
          return;
        }
        if (url.pathname === "/deck.pptx") {
          const buf = await deckBuffer();
          res.writeHead(200, {
            "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "cache-control": "no-store",
            "content-length": buf.length,
          });
          res.end(buf);
          return;
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        res.end(VIEWER_HTML);
      } catch (err) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end(String(err.message || err));
      }
    });
    server.on("error", reject);
    server.listen(0, HOST, () => {
      port = server.address().port;
      resolve();
    });
  });
}

export async function cleanupDeckViewer() {
  for (const res of sseClients) {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
  sseClients.clear();
  decks.clear();
  if (server) {
    await new Promise((r) => server.close(r));
    server = null;
    port = 0;
  }
}

export async function writeDeckViewer(seminar, { slide = 1, live = true } = {}) {
  if (!seminar) throw new Error("no seminar");
  const raw = seminar.deck?.rawUrl;
  if (!raw) throw new Error("no original PPTX URL (deck.rawUrl)");
  const start = Math.max(1, Number(slide) || 1);

  if (!live) return officeDeckUrl(raw, start);

  await startServer();
  state.raw = raw;
  state.slide = start;
  state.date = seminar.date ?? "";
  state.id = seminar.id ?? "";
  state.total = seminar.slides?.length ?? 0;
  await deckBuffer();
  broadcast();

  const tabLive = sseClients.size > 0 || Date.now() - openedAt < 8000;
  if (tabLive) return null;

  openedAt = Date.now();
  return `http://${HOST}:${port}/`;
}

process.on("exit", () => {
  try {
    server?.close();
  } catch {
    /* ignore */
  }
});
