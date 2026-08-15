#!/usr/bin/env node
/**
 * Interactive terminal browser for recent AI-Updates weeks.
 * Tab: Chapters (YouTube) · Slides · Links (flat per-slide refs from deck).
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
  focus: "weeks",
};

const STATUS_DEFAULT =
  " 1/2/3 tabs · Tab next · ↑↓ list · ←→ weeks · Enter open · y YouTube · d deck · q quit";

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

function renderTabBar() {
  for (const v of VIEWS) {
    const box = tabBoxes[v];
    const active = v === state.view;
    box.style.bg = active ? "blue" : T.list.bg;
    box.style.fg = active ? "white" : T.list.fg;
    box.style.bold = active;
  }
  tabStrip.style.border.fg = state.focus === "tabs" ? T.list.focusBorder : T.list.idleBorder;
}

function selectView(view) {
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
    screen.render();
    return;
  }

  const items = buildViewItems(seminar, state.view);
  contentBox.setItems(items.length ? items.map((it) => truncate(it.label, 90)) : ["(empty)"]);
  contentHeader.setContent(` ${seminar.date} · ${items.length} items `);

  const sel = contentBox.selected;
  if (items[sel]) detailBox.setContent(items[sel].detail || items[sel].url || "");
  applyFocusStyles();
  screen.render();
}

function applyFocusStyles() {
  weeksBox.style.border.fg = state.focus === "weeks" ? T.list.focusBorder : T.list.idleBorder;
  contentBox.style.border.fg = state.focus === "content" ? T.list.focusBorder : T.list.idleBorder;
  renderTabBar();
}

function setStatus(msg) {
  statusBar.setContent(` {bold}${msg}{/bold} `);
  screen.render();
}

function focusPane(which) {
  state.focus = which;
  applyFocusStyles();
  if (which === "weeks") weeksBox.focus();
  else if (which === "tabs") tabBoxes[state.view]?.focus();
  else contentBox.focus();
  screen.render();
}

function focusNext(dir) {
  const order = ["weeks", "tabs", "content"];
  const i = order.indexOf(state.focus);
  focusPane(order[(i + dir + order.length) % order.length]);
}

async function openSelection() {
  const seminar = currentSeminar();
  if (!seminar) return;
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

function cycleView(dir = 1) {
  const i = VIEWS.indexOf(state.view);
  selectView(VIEWS[(i + dir + VIEWS.length) % VIEWS.length]);
  focusPane("content");
  setStatus(STATUS_DEFAULT);
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

const weeksBox = blessed.list({
  top: 0,
  left: 0,
  width: "30%",
  height: "100%-2",
  label: " Weeks ",
  tags: true,
  keys: true,
  vi: true,
  mouse: true,
  padding: { left: 1, right: 1 },
  border: { type: "line" },
  style: { ...listStyle, border: { fg: T.list.focusBorder } },
  scrollbar: { ch: "│", style: { bg: T.list.idleBorder } },
});

const contentHeader = blessed.box({
  top: 3,
  left: "30%",
  width: "70%",
  height: 1,
  tags: true,
  style: { ...T.header, fg: T.list.idleBorder },
});

const tabStrip = blessed.box({
  top: 0,
  left: "30%",
  width: "70%",
  height: 3,
  tags: true,
  border: { type: "line" },
  style: { border: { fg: T.list.idleBorder }, bg: T.list.bg },
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
    keys: true,
    padding: { left: 1 },
    content: `${i + 1} ${TAB_LABELS[v]}`,
    style: {
      fg: T.list.fg,
      bg: T.list.bg,
    },
  });
  box.on("click", () => {
    selectView(v);
    focusPane("content");
  });
  box.key(["enter", "space"], () => {
    selectView(v);
    focusPane("content");
  });
  box.on("focus", () => {
    state.focus = "tabs";
    applyFocusStyles();
    screen.render();
  });
  tabBoxes[v] = box;
});

const contentBox = blessed.list({
  top: 4,
  left: "30%",
  width: "70%",
  height: "55%",
  tags: true,
  keys: true,
  vi: true,
  mouse: true,
  padding: { left: 1, right: 1 },
  border: { type: "line" },
  style: { ...listStyle, border: { fg: T.list.idleBorder } },
  scrollbar: { ch: "│", style: { bg: T.list.idleBorder } },
});

const detailBox = blessed.box({
  top: "59%",
  left: "30%",
  width: "70%",
  height: "41%-2",
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

const statusBar = blessed.box({
  bottom: 0,
  left: 0,
  width: "100%",
  height: 1,
  tags: true,
  style: T.status,
  content: ` {bold}${STATUS_DEFAULT}{/bold} `,
});

screen.append(weeksBox);
screen.append(tabStrip);
screen.append(contentHeader);
screen.append(contentBox);
screen.append(detailBox);
screen.append(statusBar);

function updateDetail() {
  const items = buildViewItems(currentSeminar(), state.view);
  const item = items[contentBox.selected];
  detailBox.setContent(item?.detail || item?.url || "");
  screen.render();
}

function onWeekChange() {
  state.weekIndex = weeksBox.selected;
  weeksBox.setItems(weekLabels());
  refreshContent();
}

weeksBox.on("select", onWeekChange);
for (const key of ["up", "down", "k", "j", "pageup", "pagedown"]) {
  weeksBox.key(key, () => setImmediate(onWeekChange));
}

for (const key of ["up", "down", "k", "j", "pageup", "pagedown"]) {
  contentBox.key(key, () => setImmediate(updateDetail));
}
contentBox.on("select", () => setImmediate(updateDetail));

screen.key(["left"], () => focusNext(-1));
screen.key(["right"], () => focusNext(1));
screen.key(["tab"], () => cycleView(1));
screen.key(["S-tab"], () => cycleView(-1));
for (let i = 0; i < VIEWS.length; i++) {
  screen.key([String(i + 1)], () => {
    selectView(VIEWS[i]);
    focusPane("content");
  });
}

screen.key(["enter"], async () => {
  if (state.focus === "weeks") {
    focusPane("tabs");
    return;
  }
  if (state.focus === "tabs") {
    focusPane("content");
    return;
  }
  await openSelection();
});

screen.key(["y"], async () => {
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
  const url = currentSeminar()?.deck?.githubUrl;
  if (!url) return setStatus("No deck for this week");
  try {
    await openUrl(url);
    setStatus("Opened slide deck");
  } catch (e) {
    setStatus(`Open failed: ${e.message}`);
  }
});

screen.key(["q", "C-c", "escape"], () => process.exit(0));

weeksBox.on("focus", () => {
  state.focus = "weeks";
  applyFocusStyles();
  screen.render();
});

contentBox.on("focus", () => {
  state.focus = "content";
  applyFocusStyles();
  screen.render();
});

async function main() {
  const weekly = await loadWeekly(ROOT);
  if (!weekly.length) {
    process.stderr.write("browse-tui: no ai-weekly seminars in data/seminars.json\n");
    process.exit(1);
  }
  state.weeks = weekly.slice(0, weekCount);
  weeksBox.setItems(weekLabels());
  weeksBox.select(0);
  refreshContent();
  focusPane("weeks");
  setStatus(`Theme: ${themeName}`);
  screen.render();
}

main().catch((e) => {
  process.stderr.write(`browse-tui: ${e.message}\n`);
  process.exit(1);
});
