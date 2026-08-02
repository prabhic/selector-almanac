/** DOM renderer for AtlasApp — maps renderVals() output to HTML. */

let atlasRegistry = null;

export function setAtlasRegistry(reg) {
  atlasRegistry = reg;
}

function regAtlas(key, fn) {
  atlasRegistry?.register(key, fn);
}

const handlers = new Map();
let autoId = 0;

/** Register a click/input handler. Pass a stable string key when possible. */
export function bind(key, fn) {
  if (typeof key === "function") {
    fn = key;
    key = `_${++autoId}`;
  }
  handlers.set(key, fn);
  return key;
}

export function clearHandlers() {
  handlers.clear();
}

export function handleClick(e) {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  handlers.get(el.dataset.act)?.(e);
}

export function handleInput(e) {
  const el = e.target.closest("[data-inp]");
  if (!el) return;
  handlers.get(el.dataset.inp)?.(e);
}

export function handleKeydown(e) {
  const el = e.target.closest("[data-key]");
  if (!el) return;
  handlers.get(el.dataset.key)?.(e);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sty(o) {
  if (!o) return "";
  return Object.entries(o)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`)
    .join(";");
}

function btn(act, label, style = "", cls = "", key = "", raw = false) {
  const id = key ? bind(key, act) : bind(act);
  const content = raw ? label : esc(label);
  return `<button type="button" class="${cls}" data-act="${id}" style="${sty(style)}">${content}</button>`;
}

function tagLink(href, label, cls = "tag tag-outline") {
  return `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener" style="border-radius:0">${esc(label)}</a>`;
}

function renderSidebar(v) {
  const years = v.years.map((y) => btn(y.onClick, y.label, y.style, "tag")).join("");
  const topics = v.topics
    .map((t) => `<button type="button" data-act="${bind(t.onClick)}" style="${sty(t.style)}"><span style="flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.label)}</span><span style="font-variant-numeric:tabular-nums;color:var(--color-neutral-600);font-size:11px">${esc(t.count)}</span></button>`)
    .join("");

  return `
    <aside style="flex:0 0 272px;border-right:2px solid var(--color-divider);padding:24px 20px;display:flex;flex-direction:column;gap:18px;overflow-y:auto">
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="font-family:var(--font-heading);font-weight:800;font-size:22px;line-height:1.05;letter-spacing:-0.02em">Lev Selector<br>Almanac</div>
        <div style="font-size:13px;line-height:1.45;color:var(--color-neutral-700)">Lev Selector's weekly AI seminars — every thread traced to a timestamp and slide.</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-variant-numeric:tabular-nums">
        <div><div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-neutral-600)">Sessions</div><div style="font-family:var(--font-heading);font-weight:700;font-size:22px">${esc(v.stats.weeks)}</div></div>
        <div><div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-neutral-600)">Videos</div><div style="font-family:var(--font-heading);font-weight:700;font-size:22px">${esc(v.stats.videos)}</div></div>
        <div><div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-neutral-600)">Timed receipts</div><div style="font-family:var(--font-heading);font-weight:700;font-size:22px">${esc(v.stats.chapters)}</div></div>
        <div><div style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-neutral-600)">Slides</div><div style="font-family:var(--font-heading);font-weight:700;font-size:22px">${esc(v.stats.slides)}</div></div>
      </div>
      <div style="font-size:11px;color:var(--color-neutral-600)">${esc(v.stats.outline)} deck-outline chapters (no timestamp)</div>
      <div style="border-top:2px solid var(--color-divider);padding-top:16px;display:flex;flex-direction:column;gap:10px">
        <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-neutral-600)">Year</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${years}</div>
      </div>
      <div style="border-top:2px solid var(--color-divider);padding-top:16px;display:flex;flex-direction:column;gap:10px">
        <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-neutral-600)">Topics — chapter mentions</div>
        <div style="display:flex;flex-direction:column;gap:2px">${topics}</div>
      </div>
      <div style="border-top:2px solid var(--color-divider);padding-top:14px;font-size:12px;line-height:1.5;color:var(--color-neutral-700)">
        All content © <a href="https://www.youtube.com/@lev-selector" target="_blank" rel="noopener">Lev Selector</a>. Slides from <a href="https://github.com/lselector/seminar" target="_blank" rel="noopener">lselector/seminar</a>. This is a derived index — every view links back to the originals.
      </div>
    </aside>`;
}

function renderHeader(v) {
  const tabs = v.tabs.map((t) => btn(t.onClick, t.label, t.style)).join("");
  return `
    <header style="border-bottom:2px solid var(--color-divider);padding:22px 32px 0;display:flex;flex-direction:column;gap:16px;flex:0 0 auto">
      <div style="display:flex;align-items:stretch;gap:0;border:2px solid var(--color-text)">
        <input class="input" id="search-input" data-search-input data-inp="${bind("search-input", v.onQuery)}" data-key="${bind("search-key", v.onQueryKey)}" value="${esc(v.q)}" placeholder="Ask the corpus — press Enter — “when did MCP first come up?”, “agents”, “DeepSeek”" style="flex:1;border:0;background:var(--color-surface);font-size:17px;padding:14px 16px;outline:none;font-family:var(--font-body)">
        ${btn(v.toggleSlideText, "Slide text", v.slideTextStyle, "btn btn-ghost", "toggle-slide-text")}
        ${btn(v.runAsk, "Ask", { borderRadius: 0, paddingLeft: "22px", paddingRight: "22px" }, "btn btn-primary", "run-ask")}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        ${tabs}
        <div style="flex:1"></div>
        <div style="font-size:12px;color:var(--color-neutral-600);letter-spacing:0.06em;text-transform:uppercase">${esc(v.scopeLabel)}</div>
      </div>
      <div style="height:0"></div>
    </header>`;
}

function renderReceipt(r) {
  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${btn(r.open, r.tsLabel, r.tsStyle)}
      ${tagLink(r.deckUrl, r.slideLabel)}
      ${r.ytUrl ? tagLink(r.ytUrl, "YouTube ↗", "tag tag-neutral") : ""}
    </div>`;
}

function renderConcepts(v) {
  if (!v.isConceptIndex) return "";
  const groups = v.conceptGroups.map((g) => {
    const items = g.items.map((c) => `
      <button type="button" data-act="${bind(c.open)}" style="display:flex;flex-direction:column;gap:10px;align-items:stretch;text-align:left;padding:16px 18px 16px 0;margin-right:18px;background:none;border:0;border-bottom:1px solid var(--color-neutral-300);cursor:pointer;font:inherit;color:var(--color-text)">
        <div style="display:flex;align-items:flex-start;gap:10px;justify-content:space-between">
          <span style="font-family:var(--font-heading);font-weight:700;font-size:17px;line-height:1.2;letter-spacing:-0.01em">${esc(c.label)}</span>
          <span style="${sty(c.statusStyle)}">${esc(c.status)}</span>
        </div>
        <svg viewBox="0 0 100 24" preserveAspectRatio="none" style="width:100%;height:26px;display:block"><polyline points="${c.spark}" fill="none" stroke="var(--color-accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"></polyline></svg>
        <div style="display:flex;gap:12px;font-size:11px;color:var(--color-neutral-600);font-variant-numeric:tabular-nums"><span>${esc(c.n)}</span><span>${esc(c.sem)}</span><span>${esc(c.since)}</span></div>
      </button>`).join("");
    return `<div><div style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:var(--color-neutral-600);border-bottom:2px solid var(--color-divider);padding-bottom:8px">${esc(g.label)}</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(268px,1fr));gap:0">${items}</div></div>`;
  }).join("");

  return `<div style="padding:30px 32px 80px;display:flex;flex-direction:column;gap:34px">
    <div style="display:flex;align-items:baseline;gap:16px;flex-wrap:wrap">
      <div style="font-family:var(--font-heading);font-weight:700;font-size:26px;line-height:1.05;letter-spacing:-0.02em">${esc(v.conceptsHeadline)}</div>
      <div style="font-size:13px;line-height:1.45;color:var(--color-neutral-700);flex:1 1 400px;min-width:300px">Each thread traced through every chapter and slide where Lev touched it — when it entered, how the framing moved, what it travelled with. Open one for its arc, with a timestamp and a slide behind every line.</div>
    </div>${groups}</div>`;
}

function renderDossier(v) {
  if (!v.isDossier) return "";
  const d = v.dossier;
  const months = d.months.map((m) => `<div title="${esc(m.title)}" style="${sty(m.style)}"></div>`).join("");
  const years = d.years.map((y) => {
    const samples = y.samples.map((r) => `
      <div style="display:flex;flex-direction:column;gap:5px">
        <div style="font-size:16px;line-height:1.4">${esc(r.text)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span style="font-size:12px;color:var(--color-neutral-600);font-variant-numeric:tabular-nums">${esc(r.dateLabel)}</span>
          ${btn(r.open, r.tsLabel, r.tsStyle)}
          ${tagLink(r.deckUrl, r.slideLabel)}
        </div>
      </div>`).join("");
    return `<div style="display:grid;grid-template-columns:108px minmax(0,1fr);gap:24px;border-bottom:1px solid var(--color-neutral-300);padding:18px 0">
      <div><div style="font-family:var(--font-heading);font-weight:700;font-size:26px;letter-spacing:-0.02em;font-variant-numeric:tabular-nums">${esc(y.year)}</div><div style="font-size:11px;color:var(--color-neutral-600)">${esc(y.count)}</div></div>
      <div style="display:flex;flex-direction:column;gap:12px">${samples}</div></div>`;
  }).join("");
  const co = d.co.map((c) => btn(c.open, `<span style="font-size:14px;font-weight:600">${esc(c.label)}</span><span style="font-size:11px;color:var(--color-neutral-600)">${esc(c.count)}</span>`, { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", border: "2px solid var(--color-neutral-300)", background: "none", padding: "8px 12px", cursor: "pointer", font: "inherit", color: "var(--color-text)" }, "", "", true)).join("");
  const receipts = d.receipts.map((r) => `
    <div style="display:grid;grid-template-columns:116px minmax(0,1fr);gap:6px 20px;border-bottom:1px solid var(--color-neutral-300);padding:12px 0;align-items:baseline">
      <div style="font-size:13px;color:var(--color-neutral-700);font-variant-numeric:tabular-nums">${esc(r.dateLabel)}</div>
      <div style="font-size:14px;line-height:1.4">${esc(r.text)}</div>
      <div style="grid-column:2">${renderReceipt(r)}</div>
    </div>`).join("");

  return `<div style="padding:26px 32px 90px;display:flex;flex-direction:column;gap:30px;max-width:1080px">
    ${btn(d.back, "← All concepts", { borderRadius: 0, alignSelf: "flex-start", paddingLeft: 0, whiteSpace: "nowrap" }, "btn btn-ghost")}
    <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap">
      <div style="font-family:var(--font-heading);font-weight:700;font-size:46px;line-height:1.02;letter-spacing:-0.03em">${esc(d.label)}</div>
      <span style="${sty(d.statusStyle)}">${esc(d.status)}</span>
      <span style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-neutral-600)">${esc(d.kind)}</span>
    </div>
    <div style="font-size:17px;line-height:1.55;color:var(--color-neutral-800);max-width:820px">${esc(d.lead)}</div>
    <div style="display:flex;flex-direction:column;gap:8px;border-top:2px solid var(--color-divider);padding-top:16px">
      <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-neutral-600)">Coverage by month</div>
      <div style="display:flex;align-items:flex-end;gap:2px;height:96px">${months}</div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--color-neutral-600)"><span>${esc(d.firstLabel)}</span><span>${esc(d.lastLabel)}</span></div>
    </div>
    <div style="border:2px solid var(--color-accent);padding:20px 22px;display:flex;flex-direction:column;gap:10px">
      <div style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:var(--color-accent-700)">Origin — first appearance in the corpus</div>
      <div style="font-family:var(--font-heading);font-weight:700;font-size:22px;line-height:1.25;letter-spacing:-0.015em">${esc(d.origin.text)}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <span style="font-size:13px;color:var(--color-neutral-700)">${esc(d.origin.dateLabel)} · ${esc(d.origin.seriesLabel)}</span>
        ${btn(d.origin.open, d.origin.tsLabel, d.origin.tsStyle)}
        ${tagLink(d.origin.deckUrl, d.origin.slideLabel)}
        ${tagLink(d.origin.ytUrl, "YouTube ↗", "tag tag-neutral")}
      </div>
    </div>
    <div><div style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:var(--color-neutral-600);border-bottom:2px solid var(--color-divider);padding-bottom:8px">How the framing moved, year by year</div>${years}</div>
    <div><div style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:var(--color-neutral-600)">Travelled with — threads sharing the same chapter</div><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">${co}</div></div>
    <div><div style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:var(--color-neutral-600);border-bottom:2px solid var(--color-divider);padding-bottom:8px">${esc(d.allLabel)}</div>${receipts}${d.hasMore ? btn(d.more, d.moreLabel, { marginTop: "18px", alignSelf: "flex-start", borderRadius: 0 }, "btn btn-secondary") : ""}</div>
  </div>`;
}

function renderAsk(v) {
  if (!v.isAsk) return "";
  const a = v.ask;
  const hits = v.conceptHits.map((c) => btn(c.open, `<span style="font-size:14px;font-weight:700">Open the “${esc(c.label)}” thread →</span><span style="font-size:11px;color:var(--color-neutral-700)">${esc(c.meta)}</span>`, { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", border: "2px solid var(--color-accent)", background: "var(--color-accent-100)", padding: "10px 14px", cursor: "pointer", font: "inherit", color: "var(--color-accent-700)" }, "", "", true)).join("");
  const findings = a.findings.map((f) => `
    <article style="display:grid;grid-template-columns:132px minmax(0,1fr);gap:24px;border-bottom:1px solid var(--color-neutral-300);padding:18px 0">
      <div>
        ${btn(f.open, f.dateLabel, { fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "16px", letterSpacing: "-0.01em", background: "none", border: 0, padding: 0, textAlign: "left", color: "var(--color-text)", cursor: "pointer", fontVariantNumeric: "tabular-nums" })}
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-neutral-600)">${esc(f.seriesLabel)}</div>
      </div>
      <div>
        <div style="font-size:17px;line-height:1.4">${esc(f.claim)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px">
          ${btn(f.open, f.tsLabel, f.tsStyle)}
          ${tagLink(f.deckUrl, f.slideLabel)}
          ${tagLink(f.ytUrl, "YouTube ↗", "tag tag-neutral")}
          <span style="font-size:12px;color:var(--color-neutral-600)">${esc(f.topicLabel)}</span>
        </div>
      </div>
    </article>`).join("");

  return `<div style="padding:32px 32px 80px">
    <div style="font-family:var(--font-heading);font-weight:700;font-size:40px;line-height:1.05;letter-spacing:-0.02em;max-width:900px">${esc(a.headline)}</div>
    <div style="font-size:17px;line-height:1.55;color:var(--color-neutral-800);max-width:820px;margin-top:14px">${esc(a.lead)}</div>
    <div style="margin-top:24px;border:2px solid var(--color-divider);background:var(--color-surface);padding:18px 20px">
      <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-neutral-600)">Mentions per session, oldest to newest</div>
      <svg viewBox="0 0 1000 90" preserveAspectRatio="none" style="width:100%;height:90px;display:block">
        <polyline points="${a.sparkArea}" fill="var(--color-accent-100)" stroke="none"></polyline>
        <polyline points="${a.spark}" fill="none" stroke="var(--color-accent)" stroke-width="2" vector-effect="non-scaling-stroke"></polyline>
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--color-neutral-600);font-variant-numeric:tabular-nums"><span>${esc(a.first)}</span><span>${esc(a.peakLabel)}</span><span>${esc(a.last)}</span></div>
    </div>
    <div style="margin-top:28px;display:flex;flex-wrap:wrap;gap:8px">${hits}</div>
    <div style="margin-top:34px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-neutral-600);border-bottom:2px solid var(--color-divider);padding-bottom:10px">${esc(a.receiptsLabel)}</div>
    ${findings}
    ${a.hasMore ? btn(a.more, a.moreLabel, { marginTop: "20px", alignSelf: "flex-start" }, "btn btn-secondary") : ""}
  </div>`;
}

function renderSessions(v) {
  if (!v.isSessions) return "";
  return `<div style="padding:0 32px 80px">${v.stream.map((s) => `
    <article style="display:flex;flex-wrap:wrap;gap:20px 28px;border-bottom:2px solid var(--color-divider);padding:26px 0;align-items:start">
      <div style="flex:0 0 148px">
        <div style="font-family:var(--font-heading);font-weight:700;font-size:24px;line-height:1;letter-spacing:-0.02em;font-variant-numeric:tabular-nums">${esc(s.day)}</div>
        <div style="font-size:13px;color:var(--color-neutral-700);font-variant-numeric:tabular-nums">${esc(s.year)}</div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-neutral-600);margin-top:6px">${esc(s.seriesLabel)}</div>
      </div>
      <div style="flex:1 1 300px;min-width:280px">
        ${btn(s.open, s.title, { fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "21px", lineHeight: 1.2, letterSpacing: "-0.01em", textAlign: "left", background: "none", border: 0, padding: 0, color: "var(--color-text)", cursor: "pointer" })}
        <div style="font-size:14px;color:var(--color-neutral-700);line-height:1.45;margin-top:10px">${esc(s.videoTitle)}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${s.chips.map((c) => btn(c.onClick, c.label, c.style, "tag tag-neutral")).join("")}</div>
        <div style="font-size:13px;color:var(--color-neutral-700);line-height:1.5;margin-top:8px">${esc(s.preview)}</div>
      </div>
      <div style="flex:0 1 210px;min-width:160px">
        ${btn(s.open, "", s.thumbStyle)}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          <span class="tag tag-outline" style="border-radius:0;font-variant-numeric:tabular-nums">${esc(s.chapterLabel)}</span>
          <span class="tag tag-outline" style="border-radius:0;font-variant-numeric:tabular-nums">${esc(s.slideLabel)}</span>
        </div>
      </div>
    </article>`).join("")}</div>`;
}

function renderAtlas(v) {
  if (!v.isAtlas) return "";
  const a = v.atlas;
  const sorts = a.sorts.map((s) => btn(s.onClick, s.label, s.style)).join("");
  const ticks = a.yearTicks.map((t) => `<div style="${sty(t.style)}">${esc(t.label)}</div>`).join("");
  const rows = a.rows.map((row) => {
    regAtlas(`cell-${row.k}`, row.onRowClick);
    regAtlas(`hover-${row.k}`, row.onRowHover);
    const exp = row.hasExpanded ? `
      <div style="border:2px solid var(--color-text);margin:8px 0 14px;padding:16px 18px;background:var(--color-surface)">
        <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap">
          <div style="font-family:var(--font-heading);font-weight:700;font-size:18px;letter-spacing:-0.01em">${esc(row.expanded.title)}</div>
          <div style="font-size:12px;color:var(--color-neutral-600)">${esc(row.expanded.count)}</div>
          <div style="flex:1"></div>
          ${btn(row.expanded.openThread, "Full thread →", { borderRadius: 0, whiteSpace: "nowrap" }, "btn btn-ghost", `atlas-thread-${row.k}`)}
          ${btn(row.expanded.close, "Close", { borderRadius: 0 }, "btn btn-ghost", `atlas-close-${row.k}-${row.expanded.month}`)}
        </div>
        ${row.expanded.rows.map((r) => `
          <div style="display:grid;grid-template-columns:116px minmax(0,1fr);gap:6px 20px;border-top:1px solid var(--color-neutral-300);padding-top:10px;align-items:baseline;margin-top:10px">
            <div style="font-size:12px;color:var(--color-neutral-700);font-variant-numeric:tabular-nums">${esc(r.dateLabel)}</div>
            <div style="font-size:14px;line-height:1.4">${esc(r.text)}</div>
            <div style="grid-column:2">${renderReceipt(r)}</div>
          </div>`).join("")}
      </div>` : "";
    return `<div>
      <div style="${sty(row.rowStyle2)}">
        ${btn(row.togglePin, row.pinMark, row.pinStyle, "", `atlas-pin-${row.k}`)}
        ${btn(row.open, row.label, row.labelStyle, "", `atlas-open-${row.k}`)}
        <svg viewBox="0 0 ${row.gridWidth} 10" preserveAspectRatio="none" data-atlas-cell="cell-${row.k}" data-atlas-hover="hover-${row.k}" style="${sty(row.svgStyle)}">
          <path d="${row.p0}" fill="var(--color-neutral-200)"></path>
          <path d="${row.p1}" fill="var(--color-accent-200)"></path>
          <path d="${row.p2}" fill="var(--color-accent-300)"></path>
          <path d="${row.p3}" fill="var(--color-accent-400)"></path>
          <path d="${row.p4}" fill="var(--color-accent)"></path>
          <rect x="${row.selMarkX}" y="0" width="${row.selMarkW}" height="10" fill="none" stroke="var(--color-text)" stroke-width="2"></rect>
        </svg>
      </div>${exp}</div>`;
  }).join("");

  return `<div style="padding:18px 32px 90px;display:flex;flex-direction:column;gap:14px">
    <div style="display:flex;align-items:baseline;gap:16px;flex-wrap:wrap">
      <div style="font-family:var(--font-heading);font-weight:700;font-size:24px;line-height:1.05;letter-spacing:-0.02em">Every thread, every month</div>
      <div style="font-size:13px;line-height:1.4;color:var(--color-neutral-700);flex:1 1 380px;min-width:300px">${esc(a.intro)}</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${sorts}</div>
    <div style="display:flex;align-items:stretch;gap:0;border-bottom:2px solid var(--color-divider);padding-bottom:6px">
      <div style="flex:0 0 216px"></div><div style="flex:1;display:flex">${ticks}</div>
    </div>
    <div style="display:flex;align-items:center;gap:14px;min-height:18px">
      <div style="font-size:12px;color:var(--color-neutral-700);font-variant-numeric:tabular-nums">${esc(a.hoverLabel)}</div>
      ${a.hasPins ? `<span style="font-size:12px;color:var(--color-accent-700)">${esc(a.pinNote)}</span>${btn(a.clearPins, "Clear pins", { borderRadius: 0, whiteSpace: "nowrap", padding: "2px 8px", fontSize: "11px" }, "btn btn-ghost")}` : ""}
    </div>
    <div style="display:flex;flex-direction:column;gap:1px">${rows}</div>
  </div>`;
}

function renderDetail(v) {
  if (!v.hasDetail) return "";
  const d = v.detail;
  const video = d.hasVideo ? `
    <div style="aspect-ratio:16/9;background:var(--color-neutral-200);border:2px solid var(--color-divider)">
      <iframe src="${esc(d.embedUrl)}" style="width:100%;height:100%;border:0;display:block" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px">
      ${tagLink(d.ytUrl, "Open on YouTube ↗", "btn btn-secondary")}
      ${tagLink(d.deckUrl, "Slide deck ↗", "btn btn-secondary")}
      <span style="font-size:12px;color:var(--color-neutral-600)">${esc(d.durationLabel)}</span>
    </div>` : `
    <div style="border:2px solid var(--color-divider);padding:16px">
      <div style="font-size:14px;color:var(--color-neutral-700)">No video matched to this deck in the index — slides only.</div>
      ${tagLink(d.deckUrl, "Slide deck ↗", "btn btn-secondary")}
    </div>`;
  const chapters = d.chapters.map((c) => btn(c.play, `<span style="font-variant-numeric:tabular-nums;color:var(--color-accent-700);font-size:13px;width:52px;flex:0 0 52px;text-align:left">${esc(c.ts)}</span><span style="flex:1;text-align:left;font-size:14px;line-height:1.35">${esc(c.title)}</span><span style="font-size:11px;color:var(--color-neutral-600);white-space:nowrap">${esc(c.slide)}</span>`, c.style, "", "", true)).join("");
  const slides = d.slides.map((s) => `<div style="border-bottom:1px solid var(--color-neutral-300);padding:10px 0"><div style="font-size:11px;color:var(--color-neutral-600)">Slide ${esc(s.n)}</div><div style="font-size:13px;line-height:1.45">${esc(s.text)}</div></div>`).join("");

  return `
    <div data-act="${bind(v.closeDetail)}" style="position:fixed;inset:0;background:rgba(32,30,29,0.28);z-index:19"></div>
    <aside style="position:fixed;top:0;right:0;bottom:0;width:min(620px,92vw);border-left:2px solid var(--color-divider);background:var(--color-surface);z-index:20;display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:18px 24px;border-bottom:2px solid var(--color-divider);display:flex;align-items:flex-start;gap:12px">
        <div style="flex:1">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:var(--color-neutral-600)">${esc(d.seriesLabel)} · ${esc(d.dateLabel)}</div>
          <div style="font-family:var(--font-heading);font-weight:700;font-size:22px;line-height:1.2;letter-spacing:-0.015em;margin-top:4px">${esc(d.title)}</div>
          <div style="font-size:12px;color:var(--color-neutral-600);margin-top:6px">${esc(d.chaptersLabel)} · ${esc(d.slidesLabel)}</div>
        </div>
        ${btn(v.closeDetail, "Close", { borderRadius: 0 }, "btn btn-ghost")}
      </div>
      <div style="padding:20px 24px 60px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:22px">
        ${video}
        <div><div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-neutral-600);border-bottom:2px solid var(--color-divider);padding-bottom:8px">${esc(d.chaptersLabel)}</div>${chapters}</div>
        ${d.slides.length ? `<div><div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--color-neutral-600);border-bottom:2px solid var(--color-divider);padding-bottom:8px">Slide text</div>${slides}</div>` : ""}
      </div>
    </aside>`;
}

export function renderApp(v) {
  const main = [renderConcepts(v), renderDossier(v), renderAsk(v), renderSessions(v), renderAtlas(v)].join("");
  const loading = !v.ready ? `<div style="padding:40px 32px;color:var(--color-neutral-700)">Loading corpus…</div>` : main;
  return `
    <div style="display:flex;min-height:100vh;background:var(--color-bg);color:var(--color-text);font-family:var(--font-body)">
      ${renderSidebar(v)}
      <main style="flex:1;min-width:560px;display:flex;flex-direction:column;overflow:hidden">
        ${renderHeader(v)}
        <section style="flex:1;min-height:0;overflow-y:auto">${loading}</section>
      </main>
      ${renderDetail(v)}
    </div>`;
}

export function handleMouseMove(e) {
  const el = e.target.closest("[data-hover]");
  if (!el) return;
  handlers.get(el.dataset.hover)?.(e);
}
