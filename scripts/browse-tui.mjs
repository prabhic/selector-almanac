#!/usr/bin/env node
/**
 * Interactive terminal browser for recent AI-Updates weeks.
 * Single pane: latest week first. [ ] prev/next week · w week picker · 1/2/3 views.
 */
import blessed from "neo-blessed";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_WEEK_COUNT,
  VIEWS,
  buildViewItems,
  loadWeekly,
  openUrl,
} from "./lib/browse.mjs";
import { cleanupDeckViewer, guessedSlideIndex, writeDeckViewer } from "./lib/deck-viewer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = process.argv.slice(2);
const countIdx = args.indexOf("--count");
const weekCount = countIdx >= 0 ? Math.max(1, +args[countIdx + 1] || DEFAULT_WEEK_COUNT) : DEFAULT_WEEK_COUNT;

function detectTheme() {
  const forced = process.env.SELECTOR_BROWSE_THEME;
  if (forced === "light" || forced === "dark") return forced;
  const fgbg = process.env.COLORFGBG ?? "";
  const bg = parseInt(fgbg.split(";").pop() ?? "", 10);
  if (!Number.isNaN(bg) && (bg === 15 || bg === 7 || bg >= 250)) return "light";
  if (process.env.TERM_PROGRAM === "Apple_Terminal" && !process.env.COLORFGBG) return "light";
  return "dark";
}

const themeName = detectTheme();
const T = themeName === "light"
  ? {
      screen: { bg: "white", fg: "black" },
      list: {
        fg: "black",
        bg: "white",
        border: { fg: "black" },
        focusBorder: "blue",
        idleBorder: "black",
        selected: { bg: "blue", fg: "white", bold: true },
        item: { fg: "black", bg: "white" },
      },
      header: { fg: "black", bg: "white", bold: true },
      detail: { fg: "black", bg: "white", border: { fg: "black" } },
      status: { fg: "white", bg: "blue", bold: true },
    }
  : {
      screen: { bg: "black", fg: "white" },
      list: {
        fg: "white",
        bg: "black",
        border: { fg: "white" },
        focusBorder: "cyan",
        idleBorder: "gray",
        selected: { bg: "blue", fg: "bright-white", bold: true },
        item: { fg: "white", bg: "black" },
      },
      header: { fg: "bright-white", bg: "black", bold: true },
      detail: { fg: "bright-white", bg: "black", border: { fg: "white" } },
      status: { fg: "black", bg: "bright-white", bold: true },
    };

const TAB_LABELS = { chapters: "Chapters", slides: "Slides", links: "Links" };

const state = {
  weeks: [],
  weekIndex: 0,
  view: "chapters",
};

const HELP_MAIN =
  "[ ] n/p week  w picker  1/2/3 tabs  ↑↓ move  Enter open  y YouTube  d deck  g GitHub  q quit";
const HELP_OVERLAY = "↑↓ week  Enter pick  Esc close";

let helpTimer = null;

function truncate(s, max = 96) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function currentSeminar() {
  return state.weeks[state.weekIndex] ?? null;
}

function weekLabels() {
  return state.weeks.map((s, i) => {
    const mark = i === state.weekIndex ? "› " : "  ";
    return `${mark}${s.date}  (${s.chapters?.length ?? 0} ch)`;
  });
}

function overlayOpen() {
  return Boolean(weekOverlay && !weekOverlay.hidden);
}

function renderTabBar() {
  for (const v of VIEWS) {
    const box = tabBoxes[v];
    const active = v === state.view;
    box.style.bg = active ? "blue" : T.list.bg;
    box.style.fg = active ? "white" : T.list.fg;
    box.style.bold = active;
  }
  tabStrip.style.border.fg = T.list.focusBorder;
}

function selectView(view) {
  if (overlayOpen()) return;
  if (!VIEWS.includes(view) || view === state.view) return;
  state.view = view;
  contentBox.select(0);
  refreshContent();
}

function refreshContent() {
  const seminar = currentSeminar();
  renderTabBar();
  if (!seminar) {
    contentBox.setItems(["No data"]);
    detailBox.setContent("");
    contentHeader.setContent(" ");
    screen.render();
    return;
  }

  const items = buildViewItems(seminar, state.view);
  const width = Math.max(48, (contentBox.width || 90) - 4);
  contentBox.setItems(items.length ? items.map((it) => truncate(it.label, width)) : ["(empty)"]);
  const n = state.weeks.length;
  contentHeader.setContent(
    ` ${seminar.date} · ${items.length} items · week ${state.weekIndex + 1}/${n} `,
  );

  const sel = contentBox.selected;
  if (items[sel]) detailBox.setContent(items[sel].detail || items[sel].url || "");
  keepSelectedVisible(contentBox);
  contentBox.style.border.fg = T.list.focusBorder;
  screen.render();
}

function helpText() {
  return overlayOpen() ? HELP_OVERLAY : HELP_MAIN;
}

function renderHelp() {
  const w = Math.max(20, (helpBar.width || 80) - 2);
  helpBar.setContent(` ${truncate(helpText(), w)} `);
}

function setStatus(msg) {
  const w = Math.max(20, (helpBar.width || 80) - 2);
  helpBar.setContent(` {bold}${truncate(msg, w)}{/bold} `);
  screen.render();
  clearTimeout(helpTimer);
  helpTimer = setTimeout(() => {
    renderHelp();
    screen.render();
  }, 2500);
}

function setWeek(index) {
  const next = Math.max(0, Math.min(state.weeks.length - 1, index));
  if (next === state.weekIndex) {
    refreshContent();
    return;
  }
  state.weekIndex = next;
  contentBox.select(0);
  refreshContent();
}

function shiftWeek(dir) {
  if (overlayOpen()) return;
  const next = state.weekIndex + dir;
  if (next < 0 || next >= state.weeks.length) return;
  setWeek(next);
}

function closeWeekPicker() {
  weekOverlay.hide();
  contentBox.focus();
  renderHelp();
  screen.render();
}

function openWeekPicker() {
  weekOverlay.setItems(weekLabels());
  weekOverlay.height = Math.min(16, state.weeks.length + 4);
  weekOverlay.show();
  weekOverlay.select(state.weekIndex);
  weekOverlay.focus();
  renderHelp();
  screen.render();
}

function pickWeekFromOverlay() {
  if (!overlayOpen()) return;
  setWeek(weekOverlay.selected);
  closeWeekPicker();
}

async function openDeckViewerForCurrent() {
  const seminar = currentSeminar();
  if (!seminar) return;
  const slide = guessedSlideIndex(seminar, {
    view: state.view,
    selectedIndex: contentBox.selected,
  });
  setStatus("Opening original deck…");
  try {
    const url = await writeDeckViewer(seminar, { slide });
    if (url) {
      await openUrl(url);
      setStatus(`Opened original PPTX at slide ${slide}`);
    } else {
      setStatus(`Moved viewer to slide ${slide}`);
    }
  } catch (e) {
    setStatus(`Slide viewer failed: ${e.message}`);
  }
}

async function openSelection() {
  const seminar = currentSeminar();
  if (!seminar) return;
  if (state.view === "slides") {
    await openDeckViewerForCurrent();
    return;
  }
  const items = buildViewItems(seminar, state.view);
  const item = items[contentBox.selected];
  if (!item?.url) return setStatus("Nothing to open for this row");
  try {
    await openUrl(item.url);
    setStatus(`Opened: ${truncate(item.url, 72)}`);
  } catch (e) {
    setStatus(`Open failed: ${e.message}`);
  }
}

const screen = blessed.screen({
  smartCSR: true,
  title: "Selector Almanac — Browse",
  fullUnicode: true,
  ...T.screen,
});

const listStyle = {
  fg: T.list.fg,
  bg: T.list.bg,
  border: T.list.border,
  item: T.list.item,
  selected: T.list.selected,
  label: { fg: T.list.fg, bold: true },
};

const contentHeader = blessed.box({
  top: 3,
  left: 0,
  width: "100%",
  height: 1,
  tags: true,
  style: { ...T.header, fg: T.list.idleBorder },
});

const tabStrip = blessed.box({
  top: 0,
  left: 0,
  width: "100%",
  height: 3,
  tags: true,
  border: { type: "line" },
  style: { border: { fg: T.list.focusBorder }, bg: T.list.bg },
});

const tabBoxes = {};
VIEWS.forEach((v, i) => {
  const box = blessed.box({
    parent: tabStrip,
    top: 0,
    left: `${i * 33}%`,
    width: "33%",
    height: 1,
    tags: true,
    mouse: true,
    padding: { left: 1 },
    content: `${i + 1} ${TAB_LABELS[v]}`,
    style: {
      fg: T.list.fg,
      bg: T.list.bg,
    },
  });
  box.on("click", () => {
    if (overlayOpen()) return;
    selectView(v);
    contentBox.focus();
  });
  tabBoxes[v] = box;
});

const contentBox = blessed.list({
  top: 4,
  left: 0,
  width: "100%",
  height: 12,
  tags: true,
  keys: true,
  vi: true,
  mouse: true,
  scrollable: true,
  padding: { left: 1, right: 1 },
  border: { type: "line" },
  style: { ...listStyle, border: { fg: T.list.focusBorder } },
  scrollbar: { ch: "│", style: { bg: T.list.idleBorder } },
});

const detailBox = blessed.box({
  top: 16,
  left: 0,
  width: "100%",
  height: 8,
  label: " URL ",
  tags: true,
  wrap: true,
  scrollable: true,
  alwaysScroll: true,
  keys: true,
  vi: true,
  mouse: true,
  padding: { left: 1, right: 1, top: 0, bottom: 0 },
  border: { type: "line" },
  style: { ...T.detail, label: { fg: T.detail.fg, bold: true } },
  content: "",
});

const helpBar = blessed.box({
  bottom: 0,
  left: 0,
  width: "100%",
  height: 1,
  tags: true,
  style: T.status,
  content: ` ${HELP_MAIN} `,
});

const weekOverlay = blessed.list({
  hidden: true,
  top: "center",
  left: "center",
  width: 44,
  height: 10,
  label: " Weeks  (Enter pick · Esc close) ",
  tags: true,
  keys: true,
  vi: true,
  mouse: true,
  padding: { left: 1, right: 1 },
  border: { type: "line" },
  style: { ...listStyle, border: { fg: T.list.focusBorder } },
  scrollbar: { ch: "│", style: { bg: T.list.idleBorder } },
});

screen.append(tabStrip);
screen.append(contentHeader);
screen.append(contentBox);
screen.append(detailBox);
screen.append(helpBar);
screen.append(weekOverlay);

function layoutPanes() {
  const statusH = 1;
  const contentTop = 4;
  const detailH = Math.max(7, Math.round(screen.height * 0.32));
  const contentH = Math.max(5, screen.height - statusH - detailH - contentTop);
  contentBox.height = contentH;
  contentBox.top = contentTop;
  detailBox.top = contentTop + contentH;
  detailBox.height = detailH;
}

function keepSelectedVisible(list) {
  const visible = Math.max(1, list.height - list.iheight);
  if (list.selected < list.childBase) list.childBase = list.selected;
  else if (list.selected >= list.childBase + visible) {
    list.childBase = list.selected - visible + 1;
  }
  list.childOffset = list.selected - list.childBase;
}

layoutPanes();
screen.on("resize", () => {
  layoutPanes();
  keepSelectedVisible(contentBox);
  if (overlayOpen()) keepSelectedVisible(weekOverlay);
  renderHelp();
  screen.render();
});

function updateDetail() {
  const items = buildViewItems(currentSeminar(), state.view);
  const item = items[contentBox.selected];
  detailBox.setContent(item?.detail || item?.url || "");
  screen.render();
}

for (const key of ["up", "down", "k", "j", "pageup", "pagedown"]) {
  contentBox.key(key, () =>
    setImmediate(() => {
      keepSelectedVisible(contentBox);
      updateDetail();
    }),
  );
}
contentBox.on("select", () =>
  setImmediate(() => {
    keepSelectedVisible(contentBox);
    updateDetail();
  }),
);

weekOverlay.on("select", () => pickWeekFromOverlay());

screen.key(["[", "p"], () => shiftWeek(1));
screen.key(["]", "n"], () => shiftWeek(-1));
screen.key(["w"], () => {
  if (overlayOpen()) closeWeekPicker();
  else openWeekPicker();
});
for (let i = 0; i < VIEWS.length; i++) {
  screen.key([String(i + 1)], () => selectView(VIEWS[i]));
}

screen.key(["enter"], async () => {
  if (overlayOpen()) {
    pickWeekFromOverlay();
    return;
  }
  await openSelection();
});

screen.key(["y"], async () => {
  if (overlayOpen()) return;
  const url = currentSeminar()?.video?.url;
  if (!url) return setStatus("No YouTube for this week");
  try {
    await openUrl(url);
    setStatus("Opened full YouTube video");
  } catch (e) {
    setStatus(`Open failed: ${e.message}`);
  }
});

screen.key(["d"], async () => {
  if (overlayOpen()) return;
  await openDeckViewerForCurrent();
});

screen.key(["g"], async () => {
  if (overlayOpen()) return;
  const url = currentSeminar()?.deck?.githubUrl;
  if (!url) return setStatus("No GitHub deck URL");
  try {
    await openUrl(url);
    setStatus("Opened original on GitHub");
  } catch (e) {
    setStatus(`Open failed: ${e.message}`);
  }
});

screen.key(["q", "C-c"], () => {
  cleanupDeckViewer();
  process.exit(0);
});

screen.key(["escape"], () => {
  if (overlayOpen()) {
    closeWeekPicker();
    return;
  }
  cleanupDeckViewer();
  process.exit(0);
});

async function main() {
  const weekly = await loadWeekly(ROOT);
  if (!weekly.length) {
    process.stderr.write("browse-tui: no ai-weekly seminars in data/seminars.json\n");
    process.exit(1);
  }
  state.weeks = weekly.slice(0, weekCount);
  state.weekIndex = 0;
  refreshContent();
  contentBox.focus();
  renderHelp();
  screen.render();
}

main().catch((e) => {
  process.stderr.write(`browse-tui: ${e.message}\n`);
  process.exit(1);
});
