import { DCLogic } from "./dc-shim.js";
import { searchIndex } from "./search.js";

const TOPIC_LABELS = {
  claude: "Claude / Anthropic", openai: "OpenAI / GPT", google: "Google / Gemini",
  "open-models": "Open models & China labs", benchmarks: "Benchmarks & leaderboards",
  agents: "Agents & orchestration", coding: "Coding assistants", infra: "Infrastructure & chips",
  rag: "RAG & retrieval", safety: "Safety & policy", jobs: "Jobs & labor market",
  multimodal: "Multimodal & video", "data-engineering": "Data engineering",
  enterprise: "Enterprise adoption", "fine-tuning": "Fine-tuning & training",
  "ml-fundamentals": "ML fundamentals", product: "Product", general: "General",
  "gemini-google": "Google / Gemini", "coding-assistants": "Coding assistants",
  "open-source": "Open models & China labs", "llm": "LLMs"
};
const SERIES_LABELS = {
  "ai-weekly": "AI Weekly", seminar: "Seminar",
  "data-architect-2021": "Data Architect 2021", "data-science-2021": "Data Science 2021"
};
const SOURCE_REPO = "https://github.com/prabhic/selector-almanac";
const DEMO_URL = "http://prabhanjan.in/selector-almanac/app/";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const STOP = new Set(["the","a","an","of","in","on","to","and","or","for","is","was","did","does","do","when","what","how","why","who","first","about","with","it","he","lev","talk","talked","say","said","cover","covered","up","come","came","that","this","are","were"]);

/** Month columns for the atlas heatmap; trailing month is 2× wide (still in progress). */
function buildAtlasColumns(monthsAll) {
  const cols = [];
  for (let i = 0; i < monthsAll.length; i++) {
    const isLast = i === monthsAll.length - 1;
    const w = isLast ? 18 : 9;
    const x = i === 0 ? 0 : cols[i - 1].x + (cols[i - 1].isLast ? 20 : 10);
    cols.push({ month: monthsAll[i], x, w, isLast });
  }
  const totalWidth = cols.length ? cols[cols.length - 1].x + cols[cols.length - 1].w : 0;
  return { cols, totalWidth };
}

function monthAtX(absX, cols) {
  for (let i = cols.length - 1; i >= 0; i--) {
    const c = cols[i];
    if (absX >= c.x && absX < c.x + c.w) return c.month;
  }
  return cols.length ? cols[cols.length - 1].month : null;
}

export class AtlasApp extends DCLogic {
  constructor(props = {}) {
    super(props);
    this._draftQ = "";
    this.state = {
      data: null, concepts: null, slides: null, slidesLoading: false, useSlideText: false,
      activeQ: "", view: props.defaultView || "atlas",
      year: "all", topic: "all", detailId: null, detailStart: 0, limit: 30,
      concept: null, cLimit: 40, atlasSort: "first", cell: null, pins: [], hover: null,
      search: null, loadError: null,
    };
  }

  scopeKey() {
    return this.state.year + "|" + this.state.topic;
  }

  readHash() {
    const h = (location.hash || "").replace(/^#/, "");
    if (!h) return null;
    const o = {};
    h.split("&").forEach(p => { const i = p.indexOf("="); if (i > 0) o[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1)); });
    return o;
  }

  writeHash() {
    const st = this.state;
    const parts = ["v=" + st.view];
    if (st.concept) parts.push("c=" + st.concept);
    if (st.cell) parts.push("cell=" + st.cell.k + "," + st.cell.month);
    if (st.activeQ) parts.push("q=" + encodeURIComponent(st.activeQ));
    if (st.year !== "all") parts.push("y=" + st.year);
    if (st.topic !== "all") parts.push("t=" + st.topic);
    if (st.pins.length) parts.push("p=" + st.pins.join(","));
    const next = "#" + parts.join("&");
    if (location.hash !== next) history.replaceState(null, "", next);
  }

  componentDidUpdate() {
    this.writeHash();
    const st = this.state;
    if (st.activeQ && st.search && st.search.scope !== this.scopeKey()) this.refreshSearch();
  }

  deriveConcepts(cAll, allowed, key) {
    if (!allowed || !this.state.data || !this.state.data.length || !cAll.length) return cAll;
    if (this._memo && this._memo.key === key) return this._memo.list;
    const semById = this._semById || {};
    const maxT = new Date("2026-07-31").getTime(), DAY = 864e5;
    const list = cAll.map(c => {
      const m = c.m.filter(x => allowed[x[0]]);
      if (!m.length) return null;
      const dates = m.map(x => semById[x[0]] && semById[x[0]].d).filter(Boolean).sort();
      const mm = {}; dates.forEach(d => { const k = d.slice(0, 7); mm[k] = (mm[k] || 0) + 1; });
      const recent = dates.filter(d => maxT - new Date(d).getTime() < 180 * DAY).length;
      const prior = dates.filter(d => { const t = maxT - new Date(d).getTime(); return t >= 180 * DAY && t < 360 * DAY; }).length;
      let status = "Steady";
      if (maxT - new Date(dates[0]).getTime() < 200 * DAY) status = "New";
      else if (recent === 0) status = "Dormant";
      else if (recent > prior * 1.4 + 2) status = "Rising";
      else if (prior > recent * 1.4 + 2) status = "Fading";
      const sems = {}; m.forEach(x => { sems[x[0]] = 1; });
      return Object.assign({}, c, {
        m: m, n: m.length, sem: Object.keys(sems).length,
        first: dates[0], last: dates[dates.length - 1], recent: recent, prior: prior, status: status,
        months: Object.keys(mm).sort().map(k => [k, mm[k]])
      });
    }).filter(Boolean).sort((a, b) => b.n - a.n);
    this._memo = { key: key, list: list };
    return list;
  }

  loadCorpus() {
    if (this._corpusLoad) return this._corpusLoad;
    this.setState({ loadError: null });
    this._corpusLoad = Promise.all([
      fetch("../data/index.json").then(async (r) => {
        if (!r.ok) throw new Error(`index.json (${r.status})`);
        return r.json();
      }),
      fetch("../data/concepts.json").then(async (r) => (r.ok ? r.json() : [])).catch(() => []),
    ])
      .then(([data, concepts]) => {
        this.setState({ data, concepts, loadError: null });
        if ((this.state.activeQ || "").trim()) this.refreshSearch();
      })
      .catch((err) => {
        this.setState({ loadError: String(err.message || err), data: null });
      });
    return this._corpusLoad;
  }

  componentDidMount() {
    const h = this.readHash();
    if (h) {
      if (h.q) this._draftQ = h.q;
      this.setState({
        view: (h.v === "stream" ? "sessions" : h.v) || this.state.view, concept: h.c || null, activeQ: h.q || "",
        year: h.y || "all", topic: h.t || "all", pins: h.p ? h.p.split(",") : [],
        cell: h.cell ? (() => { const [k, month] = h.cell.split(","); return k && month ? { k, month } : null; })() : null
      });
    }
    this.loadCorpus();
    this._esc = e => { if (e.key === "Escape" && this.state.detailId) this.setState({ detailId: null }); };
    window.addEventListener("keydown", this._esc);
  }

  componentWillUnmount() {
    if (this._esc) window.removeEventListener("keydown", this._esc);
  }

  loadSlides() {
    if (this.state.slides || this.state.slidesLoading) return;
    this.setState({ slidesLoading: true });
    fetch("../data/slides.json").then(r => r.json()).then(s => this.setState({ slides: s, slidesLoading: false }));
  }

  fmtDate(d) {
    if (!d) return "—";
    const p = d.split("-");
    return MONTHS[parseInt(p[1], 10) - 1] + " " + parseInt(p[2], 10) + ", " + p[0];
  }
  hasTs(sec) { return typeof sec === "number" && sec >= 0; }

  fmtTs(sec) {
    if (!this.hasTs(sec)) return "—";
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    const pad = n => (n < 10 ? "0" + n : "" + n);
    return h ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
  }

  tokens(q) {
    return (q || "").toLowerCase().split(/[^a-z0-9+.#-]+/).filter(t => t.length > 1 && !STOP.has(t));
  }

  all() { return this.state.data || []; }

  scoped() {
    const { year, topic } = this.state;
    return this.all().filter(s => {
      if (year !== "all" && (!s.d || s.d.slice(0, 4) !== year)) return false;
      if (topic !== "all" && (s.tp || []).indexOf(topic) < 0) return false;
      return true;
    });
  }

  scopedIds() {
    const ids = new Set();
    this.scoped().forEach(s => { ids.add(s.id); });
    return ids;
  }

  loadSearchIndex() {
    if (this._searchReady) return Promise.resolve(true);
    if (this._searchLoad) return this._searchLoad;
    this._searchLoad = searchIndex.load().then(() => {
      this._searchReady = true;
      return true;
    }).catch(() => {
      this._searchFailed = true;
      return false;
    });
    return this._searchLoad;
  }

  refreshSearch() {
    const q = (this.state.activeQ || "").trim();
    const scope = this.scopeKey();
    if (!q) {
      this.setState({ search: null });
      return Promise.resolve();
    }
    this.setState({
      search: { q, scope, pending: true, hits: [], mode: null, conceptChunks: [] }
    });
    return this.loadSearchIndex().then(() => {
      searchIndex.clearCache();
      return searchIndex.search(q, { sessionIds: this.scopedIds(), limit: 500 });
    }).then(ranked => {
      if (this.state.activeQ.trim() !== q || this.scopeKey() !== scope) return;
      const conceptChunks = [];
      const hits = [];
      const semById = this._semById || {};
      for (const row of ranked) {
        if (row.chunk.ty === "concept" && row.chunk.ck) {
          conceptChunks.push(row.chunk);
          continue;
        }
        const hit = this.chunkToHit(row.chunk, row.score, semById);
        if (hit) hits.push(hit);
      }
      this.setState({
        search: {
          q, scope, pending: false, hits, conceptChunks,
          mode: ranked[0]?.mode ?? "lexical"
        }
      });
    }).catch(() => {
      if (this.state.activeQ.trim() !== q) return;
      this.setState({ search: { q, scope, pending: false, hits: [], conceptChunks: [], mode: "error" } });
    });
  }

  searchHitsFromState(st) {
    const q = (st.activeQ || "").trim();
    if (!st.search || st.search.q !== q || st.search.scope !== this.scopeKey()) return null;
    return st.search;
  }

  interimLexicalHits(st, semById) {
    if (!this._searchReady || !searchIndex.chunks || !st.activeQ.trim()) return [];
    const ranked = searchIndex.searchLexical(st.activeQ.trim(), { sessionIds: this.scopedIds(), limit: 200 });
    return ranked.map(({ id, score }) => this.chunkToHit(searchIndex.chunks[id], score, semById)).filter(Boolean);
  }

  chunkToHit(chunk, score, semById) {
    if (chunk.ty === "concept" || !chunk.sid) return null;
    const s = semById[chunk.sid];
    if (!s) return null;
    let p;
    if (chunk.pi >= 0 && s.pt && s.pt[chunk.pi]) p = s.pt[chunk.pi];
    else p = [chunk.t, chunk.sec >= 0 ? chunk.sec : -1, chunk.sl >= 0 ? chunk.sl : -1, chunk.tp, chunk.td ? "y" : "o"];
    return { s, p, score };
  }

  matchSeminars() {
    const scoped = this.scoped();
    const q = (this.state.activeQ || "").trim();
    if (!q) return scoped;

    const search = this.searchHitsFromState(this.state);
    if (search?.hits?.length) {
      const byId = {};
      scoped.forEach(s => { byId[s.id] = s; });
      const seen = new Set();
      const out = [];
      for (const hit of search.hits) {
        if (!hit.s?.id || seen.has(hit.s.id)) continue;
        if (byId[hit.s.id]) { out.push(byId[hit.s.id]); seen.add(hit.s.id); }
      }
      if (out.length) return out;
    }

    if (this._searchReady && searchIndex.chunks) {
      const ranked = searchIndex.searchLexical(q, { sessionIds: this.scopedIds(), limit: 500 });
      const byId = {};
      scoped.forEach(s => { byId[s.id] = s; });
      const seen = new Set();
      const out = [];
      for (const { id } of ranked) {
        const sid = searchIndex.chunks[id]?.sid;
        if (!sid || seen.has(sid)) continue;
        if (byId[sid]) { out.push(byId[sid]); seen.add(sid); }
      }
      if (out.length) return out;
    }

    const toks = this.tokens(q);
    if (!toks.length) return scoped;
    const slides = this.state.useSlideText ? this.state.slides : null;
    return scoped.filter(s => {
      const base = (s.t + " " + (s.v ? s.v.t : "") + " " + (s.ch || []).map(c => c[0]).join(" ")).toLowerCase();
      let hay = base;
      if (slides && slides[s.id]) hay += " " + slides[s.id].map(x => x[2]).join(" ").toLowerCase();
      return toks.every(t => hay.indexOf(t) >= 0);
    });
  }

  buildAskHits(st, semById) {
    const search = this.searchHitsFromState(st);
    if (search) {
      if (search.pending) {
        return { hits: this.interimLexicalHits(st, semById), conceptFromSearch: [], pending: true, mode: "lexical" };
      }
      return {
        hits: search.hits,
        conceptFromSearch: search.conceptChunks || [],
        pending: false,
        mode: search.mode
      };
    }

    const toks = this.tokens(st.activeQ);
    const hits = [];
    const ordered = this.scoped().slice().sort((a, b) => (a.d || "").localeCompare(b.d || ""));
    ordered.forEach(s => {
      (s.pt || []).forEach(p => {
        const hay = (p[0] + " " + s.t + " " + (s.v ? s.v.t : "")).toLowerCase();
        const score = toks.filter(t => hay.indexOf(t) >= 0).length;
        if (score > 0) hits.push({ s, p, score });
      });
      if (toks.length && this.state.useSlideText && this.state.slides && this.state.slides[s.id]) {
        const sl = this.state.slides[s.id].filter(x => toks.every(t => (x[1] + " " + x[2]).toLowerCase().indexOf(t) >= 0));
        sl.slice(0, 3).forEach(x => { hits.push({ s, p: [x[1].slice(0, 160), -1, x[0], "general"], score: 1 }); });
      }
    });
    hits.sort((a, b) => (b.score - a.score) || ((b.s.d || "").localeCompare(a.s.d || "")));
    return { hits, conceptFromSearch: [], pending: false, mode: "legacy" };
  }

  setView(v) { this.setState({ view: v }); }
  open(id, start) { this.setState({ detailId: id, detailStart: start || 0 }); }

  commitSearch() {
    const q = (this._draftQ || "").trim();
    this.setState({ activeQ: q, view: q ? "ask" : "sessions", limit: 30, search: null });
    if (q) this.refreshSearch();
  }

  chipStyle(active) {
    return {
      borderRadius: 0, cursor: "pointer", border: active ? "2px solid var(--color-accent)" : "2px solid transparent",
      background: active ? "var(--color-accent-100)" : "var(--color-neutral-200)",
      color: active ? "var(--color-accent-700)" : "var(--color-neutral-800)",
      font: "inherit", fontSize: "12px", padding: "4px 10px", letterSpacing: "0.01em"
    };
  }
  rowStyle(active) {
    return {
      display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "6px 8px",
      border: 0, background: active ? "var(--color-accent-100)" : "transparent",
      color: active ? "var(--color-accent-700)" : "var(--color-text)",
      cursor: "pointer", font: "inherit", fontSize: "13px", textAlign: "left",
      borderLeft: active ? "3px solid var(--color-accent)" : "3px solid transparent"
    };
  }
  receiptStyle(timed) {
    return {
      borderRadius: 0, border: 0, cursor: timed ? "pointer" : "default", font: "inherit", fontSize: "12px",
      padding: "4px 10px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
      background: timed ? "var(--color-accent-100)" : "var(--color-neutral-200)",
      color: timed ? "var(--color-accent-700)" : "var(--color-neutral-700)"
    };
  }
  tabStyle(active) {
    return {
      border: "2px solid " + (active ? "var(--color-text)" : "var(--color-neutral-300)"),
      background: active ? "var(--color-text)" : "transparent",
      color: active ? "var(--color-bg)" : "var(--color-neutral-700)",
      padding: "8px 16px", font: "inherit", fontSize: "12px", letterSpacing: "0.12em",
      textTransform: "uppercase", cursor: "pointer", marginBottom: "-2px", position: "relative"
    };
  }

  renderVals() {
    const st = this.state;
    const data = this.all();
    const ready = !!st.data;
    const toks = this.tokens(st.activeQ);
    const isAsk = st.view === "ask" && !!st.activeQ;

    const stats = { weeks: data.length || "—", videos: 0, chapters: 0, slides: 0, outline: 0 };
    data.forEach(s => {
      if (s.v) stats.videos++;
      stats.slides += s.ns || 0;
      (s.ch || []).forEach(c => { if (c[2] === "y") stats.chapters++; else stats.outline++; });
    });

    // year chips
    const yearSet = {};
    data.forEach(s => { if (s.d) yearSet[s.d.slice(0, 4)] = true; });
    const years = [{ label: "All", key: "all" }].concat(Object.keys(yearSet).sort().reverse().map(y => ({ label: y, key: y })))
      .map(y => ({ label: y.label, style: this.chipStyle(st.year === y.key), onClick: () => { this.setState({ year: y.key, limit: 30 }); this.refreshSearch(); } }));

    // topic counts (chapter mentions)
    const counts = {};
    data.forEach(s => (s.pt || []).forEach(p => { counts[p[3]] = (counts[p[3]] || 0) + 1; }));
    const topics = [{ key: "all", label: "All topics", count: stats.chapters }].concat(
      Object.keys(counts).filter(k => k !== "general").sort((a, b) => counts[b] - counts[a])
        .map(k => ({ key: k, label: TOPIC_LABELS[k] || k, count: counts[k] }))
    ).map(t => ({ label: t.label, count: t.count, style: this.rowStyle(st.topic === t.key), onClick: () => { this.setState({ topic: t.key, limit: 30 }); this.refreshSearch(); } }));

    const matched = this.matchSeminars();
    const scopeBits = [];
    scopeBits.push(matched.length + " of " + (data.length || 0) + " sessions");
    if (st.topic !== "all") scopeBits.push(TOPIC_LABELS[st.topic] || st.topic);
    if (st.year !== "all") scopeBits.push(st.year);

    const tabDefs = [
      { key: "atlas", label: "Atlas", on: true },
      { key: "concepts", label: "Concepts", on: true },
      { key: "ask", label: "Receipts", on: !!st.activeQ },
      { key: "sessions", label: "Sessions", on: true }
    ];
    const tabs = tabDefs.map(t => {
      const s = this.tabStyle(st.view === t.key && (t.key !== "ask" || !!st.activeQ));
      if (!t.on) { s.opacity = 0.45; s.cursor = "default"; }
      return {
      label: t.label,
      style: s,
      onClick: () => { if (t.key === "ask" && !st.activeQ) return; this.setView(t.key); }
    }; });

    // ---- CONCEPT LAYER ----
    const semById = {}; data.forEach(s => { semById[s.id] = s; });
    this._semById = semById;
    const filtersOn = st.year !== "all" || st.topic !== "all";
    let allowed = null;
    if (filtersOn) { allowed = {}; this.scoped().forEach(s => { allowed[s.id] = 1; }); }
    const cAll = this.deriveConcepts(st.concepts || [], allowed, st.year + "|" + st.topic + "|" + ((st.concepts || []).length) + "|" + data.length);
    const monthsAll = [];
    for (let y = 2021; y <= 2026; y++) for (let m = 1; m <= 12; m++) {
      const key = y + "-" + (m < 10 ? "0" + m : m);
      if (key <= "2026-07") monthsAll.push(key);
    }
    const monthIdx = {}; monthsAll.forEach((m, i) => { monthIdx[m] = i; });
    const spark = months => {
      const series = new Array(monthsAll.length).fill(0);
      months.forEach(x => { if (monthIdx[x[0]] != null) series[monthIdx[x[0]]] = x[1]; });
      const mx = Math.max(1, ...series);
      return series.map((v, i) => ((i / (series.length - 1)) * 100).toFixed(1) + "," + (24 - (v / mx) * 22).toFixed(1)).join(" ");
    };
    const statusStyle = s => ({
      borderRadius: 0, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", padding: "3px 7px",
      background: s === "Rising" || s === "New" ? "var(--color-accent-100)" : "var(--color-neutral-200)",
      color: s === "Rising" || s === "New" ? "var(--color-accent-700)" : "var(--color-neutral-700)",
      border: s === "Rising" || s === "New" ? "1px solid var(--color-accent-300)" : "1px solid var(--color-neutral-300)"
    });
    const GROUPS = [
      ["Techniques & practices", ["technique", "protocol", "practice"]],
      ["Labs, models & tools", ["lab", "tool"]],
      ["Infrastructure", ["infra"]],
      ["Modalities", ["modality"]],
      ["Market & ideas", ["market", "idea"]],
      ["People", ["person"]]
    ];
    const openConcept = k => this.setState({ concept: k, view: "concepts", cLimit: 40 });
    const conceptByRecency = (a, b) => (b.last || "").localeCompare(a.last || "") || (b.n || 0) - (a.n || 0);
    const conceptGroups = GROUPS.map(g => ({
      label: g[0],
      items: cAll.filter(c => g[1].indexOf(c.kind) >= 0).sort(conceptByRecency).map(c => ({
        label: c.label, status: c.status,
        statusStyle: statusStyle(c.status),
        n: c.n + " receipts", sem: c.sem + " sessions",
        since: "since " + this.fmtDate(c.first),
        spark: spark(c.months),
        open: () => openConcept(c.k)
      }))
    })).filter(g => g.items.length);

    let dossier = { months: [], years: [], co: [], receipts: [] };
    const cSel = st.concept ? cAll.find(c => c.k === st.concept) : null;
    if (cSel) {
      const mrec = cSel.m.map(x => ({ s: semById[x[0]], sec: x[1], slide: x[2], text: x[3] }))
        .filter(x => x.s)
        .sort((a, b) => (a.s.d || "").localeCompare(b.s.d || ""));
      const mrecNewest = mrec.slice().reverse();
      const rowOf = r => {
        const timed = this.hasTs(r.sec) && !!r.s.v;
        return {
          dateLabel: this.fmtDate(r.s.d),
          seriesLabel: SERIES_LABELS[r.s.se] || r.s.se,
          text: r.text,
          tsLabel: timed ? "▶ " + this.fmtTs(r.sec) : (r.s.v ? "deck outline · no timestamp" : "deck only · no video"),
          tsStyle: this.receiptStyle(timed),
          ytUrl: r.s.v ? "https://www.youtube.com/watch?v=" + r.s.v.id + (timed ? "&t=" + r.sec + "s" : "") : "https://www.youtube.com/@lev-selector",
          deckUrl: r.s.dk ? r.s.dk.u : "https://github.com/lselector/seminar",
          slideLabel: r.slide ? "Slide " + r.slide + " ↗" : "Deck ↗",
          open: () => this.open(r.s.id, timed ? r.sec : 0)
        };
      };
      const byYear = {};
      mrec.forEach(r => { const y = r.s.d.slice(0, 4); (byYear[y] = byYear[y] || []).push(r); });
      const mx = Math.max(1, ...cSel.months.map(x => x[1]));
      const monthMap = {}; cSel.months.forEach(x => { monthMap[x[0]] = x[1]; });
      dossier = {
        label: cSel.label,
        kind: (cSel.kind.charAt(0).toUpperCase() + cSel.kind.slice(1)),
        status: cSel.status,
        statusStyle: statusStyle(cSel.status),
        lead: cSel.n + " receipts across " + cSel.sem + " sessions — first on " + this.fmtDate(cSel.first) +
              ", last on " + this.fmtDate(cSel.last) + ". " +
              (cSel.status === "Rising" ? "Coverage is accelerating: " + cSel.recent + " mentions in the last six months against " + cSel.prior + " in the six before."
               : cSel.status === "Fading" ? "Coverage is cooling: " + cSel.recent + " mentions in the last six months against " + cSel.prior + " in the six before."
               : cSel.status === "Dormant" ? "Nothing in the last six months — this thread has gone quiet."
               : cSel.status === "New" ? "A recent arrival — it enters the corpus only in the last months."
               : "Coverage is steady: " + cSel.recent + " mentions in the last six months against " + cSel.prior + " in the six before."),
        months: monthsAll.map(m => ({
          title: m + " · " + (monthMap[m] || 0),
          style: {
            flex: "1", minWidth: "2px", height: Math.max(2, Math.round(((monthMap[m] || 0) / mx) * 90)) + "px",
            background: monthMap[m] ? "var(--color-accent)" : "var(--color-neutral-300)", alignSelf: "flex-end"
          }
        })),
        firstLabel: this.fmtDate(cSel.first),
        lastLabel: this.fmtDate(cSel.last),
        origin: rowOf(mrec[0]),
        years: Object.keys(byYear).sort().reverse().map(y => {
          const seen = {}, samples = [];
          byYear[y].slice().sort((a, b) => (b.s.d || "").localeCompare(a.s.d || "")).forEach(r => {
            const key = r.text.toLowerCase().slice(0, 24);
            if (seen[key] || samples.length >= 3) return; seen[key] = 1; samples.push(rowOf(r));
          });
          return { year: y, count: byYear[y].length + (byYear[y].length === 1 ? " receipt" : " receipts"), samples: samples };
        }),
        co: cSel.co.map(x => {
          const target = cAll.find(c => c.label === x[0]);
          return { label: x[0], count: x[1] + " shared chapters", open: () => target && openConcept(target.k) };
        }),
        receipts: mrecNewest.slice(0, st.cLimit).map(rowOf),
        hasMore: mrec.length > st.cLimit,
        moreLabel: "Show " + Math.min(60, mrec.length - st.cLimit) + " more receipts",
        more: () => this.setState({ cLimit: st.cLimit + 60 }),
        allLabel: cSel.n + " receipts, newest first",
        back: () => this.setState({ concept: null })
      };
    }

    // ---- ATLAS: every thread on one time grid ----
    let atlas = {
      rows: [], yearTicks: [], sorts: [], hasPins: false, pinNote: "", clearPins: () => {},
      intro: "Loading the corpus — every thread on one 2021–2026 grid.", hoverLabel: "Hover a row to read a month"
    };
    if (st.view === "atlas" && cAll.length) {
      atlas.intro = cAll.length + " threads on one 2021–2026 grid, stacked as they entered the corpus" +
        (filtersOn ? " — counted only within the current filter" : "") +
        ". Darker red is a heavier month. Click a square for that month's receipts, ＋ to pin a thread for comparison, a name for the dossier.";
      atlas.hoverLabel = st.hover ? st.hover.label + " · " + st.hover.month + " · " + st.hover.v + (st.hover.v === 1 ? " receipt" : " receipts") : "Hover a row to read a month";
      const pinned = {}; st.pins.forEach(k => { pinned[k] = 1; });
      const sorted = cAll.slice().sort((a, b) => {
        const pa = pinned[a.k] ? 0 : 1, pb = pinned[b.k] ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return st.atlasSort === "volume" ? b.n - a.n : (a.first || "").localeCompare(b.first || "") || b.n - a.n;
      });
      atlas.hasPins = st.pins.length > 0;
      atlas.pinNote = st.pins.length + (st.pins.length === 1 ? " thread pinned" : " threads pinned") + " — compared at the top";
      atlas.clearPins = () => this.setState({ pins: [] });
      atlas.sorts = [
        { label: "By first appearance", style: this.tabStyle(st.atlasSort !== "volume"), onClick: () => this.setState({ atlasSort: "first" }) },
        { label: "By volume", style: this.tabStyle(st.atlasSort === "volume"), onClick: () => this.setState({ atlasSort: "volume" }) }
      ];
      atlas.yearTicks = ["2021", "2022", "2023", "2024", "2025", "2026"].map(y => {
        const n = monthsAll.filter(m => m.slice(0, 4) === y).length;
        const flex = y === monthsAll[monthsAll.length - 1]?.slice(0, 4) ? n + 1 : n;
        return {
          label: y,
          style: { flex: String(flex || 1), fontSize: "11px", letterSpacing: "0.1em", color: "var(--color-neutral-600)", borderLeft: "1px solid var(--color-neutral-300)", paddingLeft: "4px" }
        };
      });
      const atlasCols = buildAtlasColumns(monthsAll);
      atlas.gridWidth = atlasCols.totalWidth;
      atlas.rows = sorted.map(c => {
        const mm = {}; c.months.forEach(x => { mm[x[0]] = x[1]; });
        const isOpen = st.cell && st.cell.k === c.k && st.cell.month;
        let expanded = null;
        if (isOpen && st.cell.month) {
          const recs = c.m.map(x => ({ s: semById[x[0]], sec: x[1], slide: x[2], text: x[3] }))
            .filter(x => x.s && x.s.d.slice(0, 7) === st.cell.month)
            .sort((a, b) => (a.s.d || "").localeCompare(b.s.d || "") || (b.text.length - a.text.length));
          expanded = {
            key: c.k,
            month: st.cell.month,
            title: c.label + " · " + st.cell.month,
            count: recs.length + (recs.length === 1 ? " receipt" : " receipts") + " that month",
            close: () => this.setState({ cell: null }),
            openThread: () => openConcept(c.k),
            rows: recs.slice(0, 5).map(r => {
              const timed = this.hasTs(r.sec) && !!r.s.v;
              return {
                dateLabel: this.fmtDate(r.s.d), text: r.text,
                tsLabel: timed ? "▶ " + this.fmtTs(r.sec) : (r.s.v ? "deck outline · no timestamp" : "deck only · no video"),
                tsStyle: this.receiptStyle(timed),
                deckUrl: r.s.dk ? r.s.dk.u : "https://github.com/lselector/seminar",
                slideLabel: r.slide ? "Slide " + r.slide + " ↗" : "Deck ↗",
                ytUrl: r.s.v ? "https://www.youtube.com/watch?v=" + r.s.v.id + (timed ? "&t=" + r.sec + "s" : "") : "https://www.youtube.com/@lev-selector",
                open: () => this.open(r.s.id, timed ? r.sec : 0)
              };
            })
          };
        }
        const buckets = [[], [], [], [], []];
        atlasCols.cols.forEach((col, i) => {
          const m = monthsAll[i];
          const v = mm[m] || 0;
          const b = v === 0 ? 0 : v === 1 ? 1 : v === 2 ? 2 : v <= 4 ? 3 : 4;
          buckets[b].push(`M${col.x} 0h${col.w}v10h-${col.w}z`);
        });
        const FILLS = ["var(--color-neutral-200)", "var(--color-accent-200)", "var(--color-accent-300)", "var(--color-accent-400)", "var(--color-accent)"];
        const pickMonth = e => {
          const r = e.currentTarget.getBoundingClientRect();
          const relX = e.clientX != null ? e.clientX - r.left : (e.offsetX ?? 0);
          const frac = Math.max(0, Math.min(1, relX / r.width));
          return monthAtX(frac * atlasCols.totalWidth, atlasCols.cols);
        };
        const selCol = isOpen && st.cell.month ? atlasCols.cols[monthIdx[st.cell.month]] : null;
        const isPinned = !!pinned[c.k];
        const setHover = (next) => {
          const prev = st.hover;
          if (prev?.label === next.label && prev?.month === next.month && prev?.v === next.v) return;
          this.setState({ hover: next });
        };
        return {
          k: c.k,
          label: c.label,
          meta: c.n + " · " + c.status,
          pinned: isPinned,
          pinMark: isPinned ? "●" : "＋",
          pinStyle: {
            flex: "0 0 20px", background: "none", border: 0, padding: 0, cursor: "pointer", fontSize: "11px",
            color: isPinned ? "var(--color-accent)" : "var(--color-neutral-500)", lineHeight: "15px"
          },
          togglePin: () => this.setState(s => ({ pins: s.pins.indexOf(c.k) >= 0 ? s.pins.filter(x => x !== c.k) : s.pins.concat([c.k]) })),
          svgStyle: { flex: "1", height: isPinned ? "20px" : "12px", display: "block", cursor: "pointer" },
          rowStyle2: { display: "flex", alignItems: "center", gap: "0", borderBottom: isPinned ? "1px solid var(--color-divider)" : "none", paddingBottom: isPinned ? "3px" : "0" },
          p0: buckets[0].join(""), p1: buckets[1].join(""), p2: buckets[2].join(""),
          p3: buckets[3].join(""), p4: buckets[4].join(""),
          gridWidth: atlasCols.totalWidth,
          selMarkX: selCol ? selCol.x : -50,
          selMarkW: selCol ? selCol.w : 9,
          onRowClick: e => {
            e.stopPropagation?.();
            const m = pickMonth(e);
            if (!mm[m]) return;
            this.setState({ cell: { k: c.k, month: m }, hover: { label: c.label, month: m, v: mm[m] } });
          },
          onRowHover: e => {
            const m = pickMonth(e);
            setHover({ label: c.label, month: m, v: mm[m] || 0 });
          },
          labelStyle: {
            flex: "0 0 216px", textAlign: "left", background: "none", border: 0, padding: "0 12px 0 0", cursor: "pointer",
            font: "inherit", fontSize: "12px", lineHeight: "15px", minHeight: "15px", color: "var(--color-text)", whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis", fontWeight: isOpen || isPinned ? "700" : "400"
          },
          open: () => openConcept(c.k),
          hasExpanded: !!expanded,
          expanded: expanded || { rows: [] },
        };
      });
    }

    // ---- ASK ----
    let ask = { headline: "", lead: "", findings: [], spark: "", sparkArea: "", first: "", last: "", peakLabel: "", receiptsLabel: "", hasMore: false, moreLabel: "", more: () => {} };
    let conceptFromSearch = [];
    if (isAsk) {
      const semById = this._semById || {};
      const { hits, conceptFromSearch: conceptChunks, pending, mode } = this.buildAskHits(st, semById);
      conceptFromSearch = conceptChunks;

      const perSession = [];
      const ordered = this.scoped().slice().sort((a, b) => (a.d || "").localeCompare(b.d || ""));
      const hitCountBySession = {};
      hits.forEach(h => { hitCountBySession[h.s.id] = (hitCountBySession[h.s.id] || 0) + 1; });
      ordered.forEach(s => perSession.push({ d: s.d, n: hitCountBySession[s.id] || 0 }));

      const weeksWith = perSession.filter(x => x.n > 0);
      const peak = perSession.reduce((m, x) => (x.n > (m ? m.n : 0) ? x : m), null);
      const firstHit = weeksWith[0], lastHit = weeksWith[weeksWith.length - 1];

      const w = 1000, h = 90;
      const max = Math.max(1, perSession.reduce((m, x) => Math.max(m, x.n), 0));
      const pts = perSession.map((x, i) => {
        const px = perSession.length > 1 ? (i / (perSession.length - 1)) * w : 0;
        const py = h - (x.n / max) * (h - 6) - 3;
        return px.toFixed(1) + "," + py.toFixed(1);
      });
      ask.spark = pts.join(" ");
      ask.sparkArea = ("0," + h + " ") + pts.join(" ") + (" " + w + "," + h);
      ask.headline = "\u201c" + st.activeQ + "\u201d";
      const modeLabel = mode === "hybrid"
        ? " Ranked by hybrid BM25 + semantic similarity."
        : (mode === "lexical" ? " Ranked by BM25 over chapters, slides, and threads." : "");
      ask.lead = pending
        ? "Searching corpus… loading semantic model on first query may take a few seconds."
        : hits.length
        ? hits.length + " ranked receipt" + (hits.length === 1 ? "" : "s") + " across " + weeksWith.length + " sessions. First on " + this.fmtDate(firstHit && firstHit.d) +
          ", most recently " + this.fmtDate(lastHit && lastHit.d) + ". Heaviest week: " + this.fmtDate(peak && peak.d) +
          " with " + (peak ? peak.n : 0) + " hits." + modeLabel +
          " Every line below is from Lev's video or deck — nothing paraphrased."
        : (this._searchFailed
          ? "Search index unavailable — try again after refresh."
          : "No matches in the current scope. Try fewer words, clear the topic filter, or different terms.");
      ask.first = this.fmtDate(firstHit && firstHit.d);
      ask.last = this.fmtDate(lastHit && lastHit.d);
      ask.peakLabel = peak && peak.n ? "peak " + peak.n + " · " + this.fmtDate(peak.d) : "";
      ask.receiptsLabel = "Ranked receipts — chapter, timestamp, slide";
      ask.findings = hits.slice(0, st.limit).map(hit => {
        const s = hit.s, p = hit.p;
        return {
          dateLabel: this.fmtDate(s.d),
          seriesLabel: SERIES_LABELS[s.se] || s.se,
          claim: p[0],
          tsLabel: this.hasTs(p[1]) && s.v ? "▶ " + this.fmtTs(p[1]) : (s.v ? "deck outline · no timestamp" : "deck only · no video"),
          tsStyle: this.receiptStyle(this.hasTs(p[1]) && !!s.v),
          ytUrl: s.v ? "https://www.youtube.com/watch?v=" + s.v.id + (this.hasTs(p[1]) ? "&t=" + p[1] + "s" : "") : "https://www.youtube.com/@lev-selector",
          deckUrl: s.dk ? s.dk.u : "https://github.com/lselector/seminar",
          slideLabel: p[2] >= 0 ? "Slide " + p[2] + " ↗" : "Deck ↗",
          topicLabel: TOPIC_LABELS[p[3]] || p[3],
          open: () => this.open(s.id, this.hasTs(p[1]) ? p[1] : 0)
        };
      });
      ask.hasMore = hits.length > st.limit;
      ask.moreLabel = "Show " + Math.min(30, hits.length - st.limit) + " more receipts";
      ask.more = () => this.setState({ limit: st.limit + 30 });
    }

    let conceptHits = [];
    if (isAsk) {
      if (conceptFromSearch.length) {
        conceptFromSearch.slice(0, 4).forEach(chunk => {
          const c = cAll.find(x => x.k === chunk.ck);
          if (!c) return;
          conceptHits.push({
            label: c.label,
            meta: c.n + " thread receipts · " + c.status + " · since " + this.fmtDate(c.first),
            open: () => openConcept(c.k)
          });
        });
      }
      if (!conceptHits.length) {
        conceptHits = cAll.filter(c => {
          const hay = c.label.toLowerCase();
          return toks.some(t => hay.indexOf(t) >= 0);
        }).slice(0, 4).map(c => ({
          label: c.label,
          meta: c.n + " thread receipts · " + c.status + " · since " + this.fmtDate(c.first),
          open: () => openConcept(c.k)
        }));
      }
    }

    // ---- SESSIONS (chronological browse) ----
    const streamSrc = matched.slice().sort((a, b) => (b.d || "").localeCompare(a.d || "")).slice(0, st.view === "sessions" ? st.limit : 0);
    const stream = streamSrc.map(s => {
      const p = (s.d || "").split("-");
      const chapters = (s.ch || []);
      return {
        day: s.d ? MONTHS[parseInt(p[1], 10) - 1] + " " + parseInt(p[2], 10) : "Undated",
        year: s.d ? p[0] : "",
        seriesLabel: SERIES_LABELS[s.se] || s.se,
        title: s.t,
        videoTitle: s.v ? s.v.t : "No matched video — deck only",
        preview: chapters.slice(0, 5).map(c => c[0]).join("  ·  "),
        chapterLabel: chapters.length + " chapters",
        slideLabel: (s.ns || 0) + " slides",
        chips: (s.tp || []).slice(0, 5).map(k => ({
          label: TOPIC_LABELS[k] || k,
          style: this.chipStyle(st.topic === k),
          onClick: () => { this.setState({ topic: k, limit: 30 }); this.refreshSearch(); }
        })),
        thumbStyle: {
          width: "100%", aspectRatio: "16 / 9", border: "2px solid var(--color-divider)", cursor: "pointer",
          padding: 0, display: "block", filter: "grayscale(1) contrast(1.06)",
          background: s.v ? "var(--color-neutral-200) url(https://i.ytimg.com/vi/" + s.v.id + "/mqdefault.jpg) center/cover" : "var(--color-neutral-200)"
        },
        open: () => this.open(s.id, 0)
      };
    });

    // ---- FIELD MAP ----
    const mapRows = [];
    if (st.view === "map" && ready) {
      const byYear = {};
      data.forEach(s => { const y = s.d ? s.d.slice(0, 4) : "Undated"; (byYear[y] = byYear[y] || []).push(s); });
      const matchIds = {}; matched.forEach(s => { matchIds[s.id] = true; });
      const yearKeys = Object.keys(byYear).filter(y => y !== "Undated").sort().reverse();
      if (byYear["Undated"]) yearKeys.push("Undated");
      yearKeys.forEach(y => {
        const cells = byYear[y].slice().sort((a, b) => (a.d || "").localeCompare(b.d || "")).map(s => {
          const n = (s.ch || []).length;
          const hot = matchIds[s.id] && (toks.length || st.topic !== "all");
          const shade = n === 0 ? "var(--color-neutral-200)" : n < 12 ? "var(--color-neutral-300)" : n < 30 ? "var(--color-neutral-500)" : "var(--color-neutral-700)";
          return {
            title: this.fmtDate(s.d) + " — " + s.t + " · " + n + " chapters · " + (s.ns || 0) + " slides",
            style: {
              width: "18px", height: "18px", border: 0, padding: 0, cursor: "pointer",
              background: hot ? "var(--color-accent)" : shade,
              outline: st.detailId === s.id ? "2px solid var(--color-text)" : "none", outlineOffset: "1px"
            },
            open: () => this.open(s.id, 0)
          };
        });
        mapRows.push({ year: y, cells: cells });
      });
    }

    // ---- DETAIL ----
    let detail = { chapters: [], slides: [] };
    const sel = st.detailId ? data.find(s => s.id === st.detailId) : null;
    if (sel) {
      const slideMap = {};
      (sel.pt || []).forEach(p => { if (p[1] >= 0) slideMap[p[1]] = p[2]; });
      detail = {
        dateLabel: this.fmtDate(sel.d),
        seriesLabel: SERIES_LABELS[sel.se] || sel.se,
        title: sel.t,
        hasVideo: !!sel.v,
        noVideo: !sel.v,
        embedUrl: sel.v ? "https://www.youtube-nocookie.com/embed/" + sel.v.id + "?start=" + (st.detailStart || 0) + "&rel=0" : "",
        ytUrl: sel.v ? "https://www.youtube.com/watch?v=" + sel.v.id + "&t=" + (st.detailStart || 0) + "s" : "",
        deckUrl: sel.dk ? sel.dk.u : "https://github.com/lselector/seminar",
        durationLabel: sel.v && sel.v.dur ? this.fmtTs(sel.v.dur) + " runtime" : "",
        chaptersLabel: (sel.ch || []).length + " chapters",
        slidesLabel: (sel.ns || 0) + " slides in the deck",
        chapters: (sel.ch || []).map(c => {
          const timed = this.hasTs(c[1]);
          return {
            ts: timed ? this.fmtTs(c[1]) : "deck",
            title: c[0],
            slide: slideMap[c[1]] ? "slide " + slideMap[c[1]] : (timed ? "" : "outline"),
            style: this.rowStyle(timed && st.detailStart === c[1]),
            play: () => { if (timed) this.setState({ detailStart: c[1] }); }
          };
        }),
        slides: (st.slides && st.slides[sel.id] ? st.slides[sel.id] : []).map(x => ({
          n: x[0], text: (x[2] || x[1] || "").slice(0, 320)
        }))
      };
      if (!st.slides) this.loadSlides();
    }

    return {
      ready: ready, stats: stats, years: years, topics: topics, tabs: tabs,
      scopeLabel: scopeBits.join("  ·  "),
      q: this._draftQ,
      onQuery: e => { this._draftQ = e.target.value; },
      onQueryKey: e => { if (e.key === "Enter") this.commitSearch(); },
      runAsk: () => this.commitSearch(),
      toggleSlideText: () => { if (!st.useSlideText) this.loadSlides(); this.setState({ useSlideText: !st.useSlideText }); },
      slideTextStyle: {
        borderRadius: 0, borderLeft: "2px solid var(--color-divider)", borderRight: "2px solid var(--color-divider)",
        background: st.useSlideText ? "var(--color-accent-100)" : "transparent",
        color: st.useSlideText ? "var(--color-accent-700)" : "var(--color-neutral-700)",
        fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap"
      },
      isAsk: isAsk, isSessions: st.view === "sessions", isMap: st.view === "map",
      isAtlas: st.view === "atlas", atlas: atlas,
      conceptsHeadline: cAll.length + " threads under " + matched.length + (matched.length === 1 ? " session" : " sessions"),
      isConceptIndex: st.view === "concepts" && !cSel, isDossier: st.view === "concepts" && !!cSel,
      conceptGroups: conceptGroups, dossier: dossier,
      conceptHits: conceptHits,
      ask: ask, stream: stream, mapRows: mapRows,
      hasDetail: !!sel, detail: detail, closeDetail: () => this.setState({ detailId: null }),
      sourceRepo: SOURCE_REPO, demoUrl: DEMO_URL, loadError: st.loadError
    };
  }
}