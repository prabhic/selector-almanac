const DATA_BASE = new URL("../data/", import.meta.url).pathname;

let seminars = [];
let topics = {};
let trends = null;
let meta = {};
let activeTopic = null;
let activeYear = null;
let activeView = "timeline";
let searchQuery = "";
let currentDetail = null;
let currentVideoSeconds = 0;

const $ = (sel) => document.querySelector(sel);
const timelineEl = $("#timeline");
const emptyEl = $("#empty");
const topicChipsEl = $("#topic-chips");
const yearChipsEl = $("#year-chips");
const statsEl = $("#stats");
const trendContentEl = $("#trend-content");
const searchResultsEl = $("#search-results");
const searchSummaryEl = $("#search-summary");
const overlayEl = $("#overlay");

async function loadData() {
  const [s, t, m, tr] = await Promise.all([
    fetch(`${DATA_BASE}seminars.json`).then((r) => r.json()),
    fetch(`${DATA_BASE}topics.json`).then((r) => r.json()),
    fetch(`${DATA_BASE}meta.json`).then((r) => r.json()),
    fetch(`${DATA_BASE}trends.json`).then((r) => r.json()).catch(() => null),
  ]);
  seminars = s;
  topics = t;
  meta = m;
  trends = tr;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatMonthDay(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTimestamp(sec) {
  if (sec == null) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function searchTokens(query) {
  return query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
}

function textMatchesTokens(text, tokens) {
  if (!tokens.length) return true;
  const lower = (text ?? "").toLowerCase();
  return tokens.every((t) => lower.includes(t));
}

function highlightHtml(text, tokens) {
  if (!text || !tokens.length) return esc(text);
  let html = esc(text);
  const seen = new Set();
  for (const tok of [...tokens].sort((a, b) => b.length - a.length)) {
    if (seen.has(tok)) continue;
    seen.add(tok);
    const re = new RegExp(`(${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    html = html.replace(re, "<mark>$1</mark>");
  }
  return html;
}

function snippet(text, tokens, radius = 90) {
  if (!text) return "";
  const lower = text.toLowerCase();
  let idx = -1;
  for (const tok of tokens) {
    const i = lower.indexOf(tok);
    if (i >= 0 && (idx < 0 || i < idx)) idx = i;
  }
  if (idx < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function seminarPassesFilters(s) {
  if (activeYear && !(s.date ?? "").startsWith(activeYear)) return false;
  if (activeTopic && !s.topics.includes(activeTopic)) return false;
  return true;
}

function seminarMatchesSearch(s, tokens) {
  if (!tokens.length) return true;
  const blob = [
    s.title,
    s.date,
    s.series,
    ...(s.topics ?? []),
    s.video?.title,
    ...(s.chapters?.map((c) => c.title) ?? []),
    ...(s.points?.map((p) => p.claim) ?? []),
    ...(s.slides?.map((sl) => `${sl.title} ${sl.text}`) ?? []),
  ].join("\n");
  return textMatchesTokens(blob, tokens);
}

function collectSearchHits(s, tokens) {
  const hits = [];

  if (textMatchesTokens(s.title, tokens)) {
    hits.push({ type: "title", score: 20, text: s.title });
  }
  if (textMatchesTokens(s.video?.title, tokens)) {
    hits.push({ type: "video", score: 18, text: s.video.title });
  }

  for (const ch of s.chapters ?? []) {
    if (textMatchesTokens(ch.title, tokens)) {
      hits.push({
        type: "chapter",
        score: 15,
        text: ch.title,
        videoSeconds: ch.startSeconds,
        label: ch.label,
      });
    }
  }

  for (const p of s.points ?? []) {
    if (textMatchesTokens(p.claim, tokens)) {
      hits.push({
        type: "point",
        score: 12,
        text: p.claim,
        videoSeconds: p.videoSeconds,
        slideIndex: p.slideIndex,
      });
    }
  }

  for (const sl of s.slides ?? []) {
    const combined = `${sl.title} ${sl.text}`;
    if (textMatchesTokens(combined, tokens)) {
      hits.push({
        type: "slide",
        score: 8,
        text: snippet(combined, tokens),
        slideIndex: sl.index,
        slideTitle: sl.title,
      });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits;
}

function searchCorpus(query) {
  const tokens = searchTokens(query);
  if (!tokens.length) return [];

  const results = [];
  for (const s of seminars) {
    if (!seminarPassesFilters(s)) continue;
    if (!seminarMatchesSearch(s, tokens)) continue;
    const hits = collectSearchHits(s, tokens);
    if (!hits.length) continue;
    results.push({ seminar: s, hits, topScore: hits[0].score });
  }

  results.sort((a, b) => b.topScore - a.topScore || (b.seminar.date ?? "").localeCompare(a.seminar.date ?? ""));
  return results;
}

function officeEmbedUrl(rawUrl) {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(rawUrl)}`;
}

function youtubeEmbedUrl(videoId, startSeconds = 0) {
  const base = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
  return startSeconds > 0 ? `${base}&start=${startSeconds}` : base;
}

function renderStats() {
  const tokens = searchTokens(searchQuery);
  const filtered = seminars.filter((s) => seminarPassesFilters(s) && seminarMatchesSearch(s, tokens));
  const c = meta.counts ?? {};
  statsEl.innerHTML = `
    <div>${filtered.length} shown / ${seminars.length} seminars</div>
    <div>${c.matched ?? "—"} video-matched</div>
    <div>${c.withChapters ?? "—"} with chapters</div>
    <div>Updated ${meta.generatedAt ? new Date(meta.generatedAt).toLocaleDateString() : "—"}</div>
  `;
}

function renderYearChips() {
  const years = [...new Set(seminars.map((s) => s.date?.slice(0, 4)).filter(Boolean))].sort().reverse();
  yearChipsEl.innerHTML = [
    `<button class="chip${activeYear === null ? " active" : ""}" data-year="">All</button>`,
    ...years.map(
      (y) => `<button class="chip${activeYear === y ? " active" : ""}" data-year="${y}">${y}</button>`,
    ),
  ].join("");

  yearChipsEl.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeYear = btn.dataset.year || null;
      renderYearChips();
      renderCurrentView();
      renderStats();
    });
  });
}

function renderTopicChips() {
  const items = trends?.ranked?.length
    ? trends.ranked.map((slug) => ({
        slug,
        label: trends.topics[slug]?.label ?? slug,
        count: trends.topics[slug]?.totalMentions ?? 0,
      }))
    : Object.values(topics)
        .sort((a, b) => b.seminarCount - a.seminarCount)
        .slice(0, 18)
        .map((t) => ({ slug: t.slug, label: t.label, count: t.seminarCount }));

  topicChipsEl.innerHTML = [
    `<button class="chip${activeTopic === null ? " active" : ""}" data-topic="">All</button>`,
    ...items.map(
      (t) => `<button class="chip${activeTopic === t.slug ? " active" : ""}" data-topic="${t.slug}">${esc(t.label)} <span style="opacity:.6">(${t.count})</span></button>`,
    ),
  ].join("");

  topicChipsEl.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTopic = btn.dataset.topic || null;
      renderTopicChips();
      renderCurrentView();
      renderStats();
      updateHero();
    });
  });
}

function updateHero() {
  if (activeTopic && trends?.topics?.[activeTopic]) {
    const t = trends.topics[activeTopic];
    $("#hero-title").textContent = t.label;
    $("#hero-sub").textContent = `${t.totalMentions} chapter mentions across ${t.seminarWeeks} weeks · ${t.blurb}`;
  } else if (activeTopic && topics[activeTopic]) {
    const t = topics[activeTopic];
    $("#hero-title").textContent = t.label;
    $("#hero-sub").textContent = `First seen ${formatDate(t.firstSeen)} · ${t.seminarCount} seminars · ${t.pointCount} indexed points.`;
  } else if (activeView === "trends" && trends) {
    $("#hero-title").textContent = "Topic trends — weekly AI Updates";
    $("#hero-sub").textContent = `What Lev covered, week by week — ${trends.weekCount} sessions, chapter-level tracking across labs, agents, open models, and more.`;
  } else if (searchQuery && activeView === "search") {
    $("#hero-title").textContent = `Search: “${searchQuery}”`;
    $("#hero-sub").textContent = "Matches across slide text, chapters, and titles — open any result to read in context.";
  } else {
    $("#hero-title").textContent = "Lev Selector seminar corpus";
    $("#hero-sub").textContent = `${seminars.length} decks indexed. Search any word, watch embedded video, read slides in-page.`;
  }
}

function renderTimeline() {
  const tokens = searchTokens(searchQuery);
  const filtered = seminars.filter((s) => seminarPassesFilters(s) && seminarMatchesSearch(s, tokens));
  emptyEl.hidden = filtered.length > 0;
  timelineEl.innerHTML = "";

  let lastYear = null;
  for (const s of filtered) {
    const year = s.date?.slice(0, 4);
    if (year && year !== lastYear) {
      lastYear = year;
      const div = document.createElement("div");
      div.className = "year-divider";
      div.textContent = year;
      timelineEl.appendChild(div);
    }

    const card = document.createElement("article");
    card.className = "card";
    const matchHits = tokens.length ? collectSearchHits(s, tokens).slice(0, 2) : [];

    card.innerHTML = `
      <div class="card-date">
        <strong>${formatMonthDay(s.date)}</strong>
        ${s.series === "ai-weekly" ? "AI Weekly" : (s.series?.replace(/-/g, " ") ?? "")}
      </div>
      <div class="card-body">
        <h3>${highlightHtml(s.title, tokens)}</h3>
        <div class="card-meta">${s.video ? highlightHtml(s.video.title, tokens) : "No matched video"}</div>
        ${matchHits.length ? `<div class="card-snippet">${matchHits.map((h) => `<span class="hit-tag">${h.type}</span> ${highlightHtml(h.text, tokens)}`).join("<br>")}</div>` : ""}
        <div class="card-topics">${(s.topics ?? []).slice(0, 5).map((t) => `<span>${esc(topics[t]?.label ?? t)}</span>`).join("")}</div>
      </div>
      <div class="card-badges">
        ${s.video?.thumbnail ? `<img class="card-thumb" src="${s.video.thumbnail}" alt="" loading="lazy" />` : ""}
        ${s.video ? '<span class="badge match">▶ video</span>' : '<span class="badge deck-only">deck only</span>'}
        ${s.chapters?.length ? `<span class="badge chapters">${s.chapters.length} ch</span>` : ""}
        ${s.slides?.length ? `<span class="badge slides">${s.slides.length} slides</span>` : ""}
      </div>
    `;

    card.addEventListener("click", () => openDetail(s.id));
    timelineEl.appendChild(card);
  }
}

function renderSearchResults() {
  const tokens = searchTokens(searchQuery);
  if (!tokens.length) {
    searchSummaryEl.innerHTML = "";
    searchResultsEl.innerHTML = `<div class="empty"><p>Type a word or phrase in the sidebar to search slide content, chapters, and titles.</p></div>`;
    return;
  }

  const results = searchCorpus(searchQuery);
  searchSummaryEl.innerHTML = `<strong>${results.length}</strong> seminar${results.length === 1 ? "" : "s"} · <strong>${results.reduce((n, r) => n + r.hits.length, 0)}</strong> matches for <em>${esc(searchQuery)}</em>`;

  if (!results.length) {
    searchResultsEl.innerHTML = `<div class="empty"><p>No matches. Try fewer words or a different year filter.</p></div>`;
    return;
  }

  searchResultsEl.innerHTML = results.map(({ seminar: s, hits }) => `
    <article class="search-result" data-id="${s.id}">
      <header class="search-result-head">
        <div>
          <time>${formatDate(s.date)}</time>
          <h3>${highlightHtml(s.title, tokens)}</h3>
          <p class="search-result-meta">${s.video ? highlightHtml(s.video.title, tokens) : "Deck only"}</p>
        </div>
        <button class="btn-open" data-open="${s.id}">Open</button>
      </header>
      <ul class="search-hits">
        ${hits.slice(0, 8).map((h) => `
          <li>
            <span class="hit-tag">${h.type}</span>
            <button class="hit-link" data-id="${s.id}" data-slide="${h.slideIndex ?? ""}" data-seconds="${h.videoSeconds ?? ""}" data-tab="${h.type === "slide" ? "slides" : h.videoSeconds != null ? "watch" : "index"}">
              ${highlightHtml(h.text, tokens)}
              ${h.label ? `<span class="hit-time">${esc(h.label)}</span>` : ""}
              ${h.slideIndex ? `<span class="hit-time">slide ${h.slideIndex}</span>` : ""}
            </button>
          </li>
        `).join("")}
      </ul>
    </article>
  `).join("");

  searchResultsEl.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => openDetail(btn.dataset.open));
  });

  searchResultsEl.querySelectorAll(".hit-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      openDetail(btn.dataset.id, {
        tab: btn.dataset.tab,
        slideIndex: btn.dataset.slide ? +btn.dataset.slide : null,
        videoSeconds: btn.dataset.seconds ? +btn.dataset.seconds : null,
      });
    });
  });
}

function sparklineSvg(series, weeks, width = 220, height = 44) {
  const byDate = Object.fromEntries((series ?? []).map((p) => [p.date, p.count]));
  const values = weeks.map((w) => byDate[w] ?? 0);
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * width;
    const y = height - 4 - (v / max) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `${pts.join(" ")} ${width},${height} 0,${height}`;
  return `<svg viewBox="0 0 ${width} ${height}" class="sparkline" preserveAspectRatio="none"><polygon points="${area}" class="spark-fill"/><polyline points="${pts.join(" ")}" class="spark-line"/></svg>`;
}

function monthlyBars(series) {
  const byMonth = {};
  for (const pt of series ?? []) {
    const m = pt.date?.slice(0, 7);
    if (!m) continue;
    byMonth[m] = (byMonth[m] ?? 0) + pt.count;
  }
  const months = Object.keys(byMonth).sort();
  const max = Math.max(...Object.values(byMonth), 1);
  return months.map((m) => ({
    month: m,
    label: new Date(m + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    count: byMonth[m],
    pct: Math.round((byMonth[m] / max) * 100),
  }));
}

function shareLineSvg(shareOfVoice, slug, weeks, width = 900, height = 56, color = "var(--accent-2)") {
  const values = weeks.map((w) => {
    const row = shareOfVoice.find((r) => r.date === w);
    return row?.shares?.[slug] ?? 0;
  });
  const max = Math.max(...values, 0.15);
  const pts = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * width;
    const y = height - 4 - (v / max) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg viewBox="0 0 ${width} ${height}" class="share-line" style="color:${color}"><polyline points="${pts.join(" ")}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}

function labRaceStrip(labRace, weeks) {
  const colors = { claude: "#b5451b", openai: "#1f5c4a", google: "#4a6fa5", "open-models": "#8b6914", none: "#ccc" };
  return weeks.map((w) => {
    const row = labRace.find((r) => r.date === w);
    const leader = row?.leader ?? "none";
    const title = row ? `${row.leaderLabel} ${Math.round((row.leaderShare ?? 0) * 100)}%` : "";
    return `<span class="race-cell" style="background:${colors[leader] ?? colors.none}" title="${esc(w)}: ${esc(title)}"></span>`;
  }).join("");
}

function renderInsightsSection(ins) {
  if (!ins) return "";

  const briefs = (ins.recentBriefs ?? []).slice().reverse().slice(0, 4);
  const newEnt = ins.newEntities ?? [];
  const bursts = ins.bursts ?? [];
  const rising = ins.risingShare ?? [];
  const falling = ins.fallingShare ?? [];

  return `
    <section class="insights-panel">
      <h3 class="insights-title">Deeper insights</h3>
      <p class="insights-method">${esc(ins.methodology)}</p>

      <div class="insight-block">
        <h4>Who led each week? <span class="hint">share of chapter airtime among labs</span></h4>
        <div class="lab-race-strip">${labRaceStrip(ins.labRace ?? [], trends.weeks)}</div>
        <div class="lab-legend">
          <span><i style="background:#b5451b"></i> Claude</span>
          <span><i style="background:#1f5c4a"></i> OpenAI</span>
          <span><i style="background:#4a6fa5"></i> Google</span>
          <span><i style="background:#8b6914"></i> Open models</span>
        </div>
      </div>

      <div class="insight-block">
        <h4>Share of voice over time <span class="hint">% of chapters, not raw counts</span></h4>
        <div class="share-lines">
          ${["claude", "openai", "google", "agents"].map((slug) => {
            const colors = { claude: "#b5451b", openai: "#1f5c4a", google: "#4a6fa5", agents: "#7a4a9e" };
            const label = trends.topics[slug]?.label ?? slug;
            return `<div class="share-row"><span class="share-label">${esc(label)}</span>${shareLineSvg(ins.shareOfVoice, slug, trends.weeks, 900, 48, colors[slug])}</div>`;
          }).join("")}
        </div>
      </div>

      <div class="insight-grid-2">
        <div class="insight-block">
          <h4>Gaining airtime <span class="hint">recent vs prior half</span></h4>
          <ul class="insight-list">${rising.length ? rising.map((m) => `
            <li><strong>${esc(m.label)}</strong> ${Math.round(m.priorShare * 100)}% → ${Math.round(m.recentShare * 100)}% <span class="up">+${Math.round(m.delta * 100)}pp</span></li>
          `).join("") : "<li>No strong gainers</li>"}</ul>
        </div>
        <div class="insight-block">
          <h4>Losing airtime</h4>
          <ul class="insight-list">${falling.length ? falling.map((m) => `
            <li><strong>${esc(m.label)}</strong> ${Math.round(m.priorShare * 100)}% → ${Math.round(m.recentShare * 100)}% <span class="down">${Math.round(m.delta * 100)}pp</span></li>
          `).join("") : "<li>No strong decliners</li>"}</ul>
        </div>
      </div>

      ${newEnt.length ? `
      <div class="insight-block">
        <h4>New named entities <span class="hint">first appeared in last 8 weeks</span></h4>
        <div class="entity-chips">${newEnt.map((e) => `
          <span class="entity-chip" title="First ${formatDate(e.firstSeen)}">${esc(e.label)} <small>${formatDate(e.firstSeen)}</small></span>
        `).join("")}</div>
      </div>` : ""}

      ${bursts.length ? `
      <div class="insight-block">
        <h4>Spike weeks <span class="hint">topic share ≥1.8× its 8-week baseline</span></h4>
        <ul class="insight-list">${bursts.slice(0, 6).map((b) => `
          <li><button class="trend-pick linkish" data-topic="${b.slug}"><strong>${esc(b.label)}</strong></button> · ${formatDate(b.date)} · ${Math.round(b.share * 100)}% <span class="up">${b.burstRatio}× baseline</span></li>
        `).join("")}</ul>
      </div>` : ""}

      <div class="insight-block">
        <h4>Weekly briefs <span class="hint">auto-generated from share + novelty</span></h4>
        <div class="brief-cards">
          ${briefs.map((b) => `
            <article class="brief-card">
              <header>
                <time>${formatDate(b.date)}</time>
                <button class="link-btn open-brief" data-seminar="${b.seminarId}">Open week →</button>
              </header>
              <h5>${esc(b.headline)}</h5>
              <ul>${(b.bullets ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
            </article>
          `).join("")}
        </div>
      </div>

      <div class="insight-block">
        <h4>What's new each week <span class="hint">chapter topics not seen in prior 8 weeks</span></h4>
        <div class="novelty-feed">
          ${(ins.weeklyNovelty ?? []).slice().reverse().slice(0, 6).map((w) => `
            <div class="novelty-week">
              <div class="novelty-head">
                <time>${formatDate(w.date)}</time>
                <span>${w.novelCount} new / ${w.totalChapters} chapters (${Math.round(w.novelRatio * 100)}%)</span>
                <button class="link-btn open-brief" data-seminar="${w.seminarId}">Open</button>
              </div>
              ${w.highlights?.length ? `<ul>${w.highlights.slice(0, 4).map((h) => `
                <li><button class="hit-link linkish jump-trend-inline" data-seminar="${h.seminarId}" data-seconds="${h.videoSeconds ?? 0}">${esc(h.claim)}</button></li>
              `).join("")}</ul>` : ""}
            </div>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function bindInsightEvents(root) {
  root.querySelectorAll(".open-brief").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); openDetail(btn.dataset.seminar); });
  });
  root.querySelectorAll(".jump-trend-inline").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openDetail(btn.dataset.seminar, { tab: "watch", videoSeconds: +btn.dataset.seconds });
    });
  });
}

function renderTrendsOverview() {
  if (!trends?.topics) {
    trendContentEl.innerHTML = `<div class="empty"><p>Run <code>node scripts/build-trends.mjs</code> to generate trends.</p></div>`;
    return;
  }

  const ins = trends.insights;

  trendContentEl.innerHTML = `
    <div class="trends-intro">
      <p>Lev covers almost <em>everything</em> every week — raw keyword counts are misleading. Below: <strong>share of voice</strong>, <strong>lab dominance</strong>, <strong>novelty</strong>, and <strong>named entities</strong> that reveal what actually shifted.</p>
    </div>

    ${renderInsightsSection(ins)}

    <h3 class="insights-title secondary">Topic volume (raw chapter counts)</h3>
    <p class="insights-method">Useful for drill-down, but most topics appear every week. Prefer insights above for narrative shifts.</p>

    <div class="trend-grid">
      ${trends.ranked.map((slug) => {
        const t = trends.topics[slug];
        if (!t) return "";
        const mom = ins?.shareMomentum?.find((m) => m.slug === slug);
        const shareNote = mom ? `${Math.round(mom.recentShare * 100)}% recent share` : "";
        return `
          <article class="trend-card" data-topic="${slug}">
            <div class="trend-card-head">
              <h3>${esc(t.label)}</h3>
              <span class="trend-count">${shareNote || `${t.totalMentions} ch`}</span>
            </div>
            <p class="trend-blurb">${esc(t.blurb)}</p>
            ${sparklineSvg(t.series, trends.weeks)}
            <div class="trend-card-foot">
              <span>Since ${formatDate(t.firstSeen)}</span>
              <button class="link-btn trend-pick" data-topic="${slug}">Explore →</button>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;

  bindInsightEvents(trendContentEl);

  trendContentEl.querySelectorAll(".trend-pick, .trend-card").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".open-brief, .jump-trend-inline, .link-btn")) return;
      const slug = el.dataset.topic;
      if (!slug) return;
      activeTopic = slug;
      renderTopicChips();
      renderTrendDetail(slug);
      renderTimeline();
      renderStats();
      updateHero();
    });
  });
}

function renderTrendDetail(slug) {
  const t = trends?.topics?.[slug];
  if (!t) return renderTrendsOverview();

  const tokens = searchTokens(searchQuery);
  const months = monthlyBars(t.series);

  trendContentEl.innerHTML = `
    <button class="link-btn trend-back" id="trend-back">← All trends</button>
    <div class="trend-header">
      <h3>${esc(t.label)}</h3>
      <p class="trend-blurb">${esc(t.blurb)}</p>
      <div class="trend-stats">
        <span>${t.totalMentions} chapter mentions</span>
        <span>${t.seminarWeeks} weeks with coverage</span>
        <span>First seen ${formatDate(t.firstSeen)}</span>
        ${t.momentum ? `<span class="${t.momentum.delta >= 0 ? "up" : "down"}">Momentum: ${t.momentum.delta >= 0 ? "+" : ""}${t.momentum.delta} (recent vs prior half)</span>` : ""}
      </div>
    </div>

    <div class="monthly-chart">
      <h4>Monthly chapter mentions</h4>
      <div class="bars">
        ${months.map((m) => `
          <div class="bar-col" title="${m.label}: ${m.count}">
            <div class="bar" style="height:${Math.max(m.pct, 4)}%"></div>
            <span>${m.label}</span>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="weekly-spark-wrap">
      <h4>Weekly cadence</h4>
      ${sparklineSvg(t.series, trends.weeks, 900, 80)}
    </div>

    <h4 class="timeline-heading">Every mention — linked to video moment</h4>
    <div class="trend-timeline">
      ${t.timeline.slice().reverse().slice(0, 100).map((item) => `
        <div class="trend-item">
          <time>${formatDate(item.date)}</time>
          <p>${highlightHtml(item.claim, tokens)}</p>
          <div class="trend-links">
            ${item.videoUrl ? `<button class="link-btn jump-trend" data-seminar="${item.seminarId}" data-seconds="${item.videoSeconds ?? 0}">▶ ${item.label ?? "Watch"}</button>` : ""}
            <button class="link-btn jump-trend" data-seminar="${item.seminarId}" data-tab="slides">Open deck</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  $("#trend-back")?.addEventListener("click", () => {
    activeTopic = null;
    renderTopicChips();
    renderTrendsOverview();
    updateHero();
  });

  trendContentEl.querySelectorAll(".jump-trend").forEach((btn) => {
    btn.addEventListener("click", () => {
      openDetail(btn.dataset.seminar, {
        tab: btn.dataset.tab ?? "watch",
        videoSeconds: btn.dataset.seconds ? +btn.dataset.seconds : null,
      });
    });
  });
}

function renderTrends() {
  if (!trends) {
    trendContentEl.innerHTML = `<div class="empty"><p>Trends data not loaded.</p></div>`;
    return;
  }
  if (activeTopic && trends.topics[activeTopic]) {
    renderTrendDetail(activeTopic);
  } else {
    renderTrendsOverview();
  }
}

function setDetailTab(tab) {
  document.querySelectorAll(".detail-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.detailTab === tab);
  });
  document.querySelectorAll(".detail-pane").forEach((p) => {
    const id = `pane-${tab}`;
    p.hidden = p.id !== id;
    p.classList.toggle("active", p.id === id);
  });
}

function renderVideo(s, startSeconds = 0) {
  const videoEl = $("#detail-video");
  currentVideoSeconds = startSeconds;

  if (!s.video) {
    videoEl.innerHTML = `<p class="pane-empty">No matched video. <a href="${s.deck?.githubUrl ?? "#"}" target="_blank" rel="noopener">View slides on GitHub ↗</a></p>`;
    $("#detail-youtube-link").style.display = "none";
    return;
  }

  $("#detail-youtube-link").href = startSeconds
    ? `https://www.youtube.com/watch?v=${s.video.id}&t=${startSeconds}s`
    : s.video.url;
  $("#detail-youtube-link").style.display = "";

  videoEl.innerHTML = `<div class="video-wrap"><iframe id="yt-player" src="${youtubeEmbedUrl(s.video.id, startSeconds)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
}

function renderSlides(s, focusSlideIndex = null) {
  const tokens = searchTokens(searchQuery);
  const container = $("#detail-slides");

  if (!s.slides?.length) {
    container.innerHTML = `<p class="pane-empty">Slide text not indexed. <a href="${s.deck?.rawUrl ?? "#"}" target="_blank" rel="noopener">Download PPTX ↗</a></p>`;
    return;
  }

  const slides = focusSlideIndex
    ? [...s.slides].sort((a, b) => (a.index === focusSlideIndex ? -1 : b.index === focusSlideIndex ? 1 : a.index - b.index))
    : s.slides;

  container.innerHTML = slides.map((sl) => `
    <article class="slide-card${sl.index === focusSlideIndex ? " focused" : ""}${textMatchesTokens(`${sl.title} ${sl.text}`, tokens) ? " matched" : ""}" id="slide-${sl.index}" data-slide="${sl.index}">
      <header class="slide-card-head">
        <span class="slide-num">Slide ${sl.index}</span>
        ${s.video ? `<button class="link-btn slide-jump" data-seconds="0">▶ Video</button>` : ""}
      </header>
      <h4>${highlightHtml(sl.title, tokens)}</h4>
      <p class="slide-text">${highlightHtml(sl.text, tokens)}</p>
    </article>
  `).join("");

  container.querySelectorAll(".slide-jump").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setDetailTab("watch");
      renderVideo(s, 0);
    });
  });

  if (focusSlideIndex) {
    requestAnimationFrame(() => {
      document.getElementById(`slide-${focusSlideIndex}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function renderDeckEmbed(s) {
  const container = $("#detail-deck-embed");
  if (!s.deck?.rawUrl) {
    container.innerHTML = `<p class="pane-empty">No deck URL available.</p>`;
    return;
  }

  const embedUrl = officeEmbedUrl(s.deck.rawUrl);
  container.innerHTML = `
    <div class="deck-embed-wrap">
      <iframe src="${embedUrl}" title="Slide deck preview" loading="lazy" allowfullscreen></iframe>
    </div>
    <div class="embed-fallback">
      <p>Embed not loading? The original is always available:</p>
      <a href="${s.deck.githubUrl}" target="_blank" rel="noopener">View on GitHub</a>
      <a href="${s.deck.rawUrl}" target="_blank" rel="noopener">Download PPTX</a>
    </div>
  `;
}

function renderPoints(s) {
  const tokens = searchTokens(searchQuery);
  const pointsEl = $("#detail-points");
  const points = s.points?.length ? s.points : (s.chapters ?? []).map((ch) => ({
    claim: ch.title,
    videoSeconds: ch.startSeconds,
    slideIndex: null,
    source: ch.source ?? "chapter",
    label: ch.label,
  }));

  pointsEl.innerHTML = points.length
    ? points.map((p, i) => `
        <li class="point-item${textMatchesTokens(p.claim, tokens) ? " matched" : ""}">
          <p class="point-claim">${highlightHtml(p.claim, tokens)}</p>
          <div class="point-links">
            ${p.videoSeconds != null ? `<button class="link-btn jump-video" data-seconds="${p.videoSeconds}">▶ ${p.label ?? formatTimestamp(p.videoSeconds)}</button>` : ""}
            ${p.slideIndex ? `<button class="link-btn jump-slide" data-slide="${p.slideIndex}">Slide ${p.slideIndex}</button>` : ""}
            <span class="point-source">${esc(p.source ?? "")}</span>
          </div>
        </li>
      `).join("")
    : `<li class="pane-empty">No chapters indexed for this talk.</li>`;

  pointsEl.querySelectorAll(".jump-video").forEach((btn) => {
    btn.addEventListener("click", () => {
      setDetailTab("watch");
      renderVideo(s, +btn.dataset.seconds);
    });
  });

  pointsEl.querySelectorAll(".jump-slide").forEach((btn) => {
    btn.addEventListener("click", () => {
      setDetailTab("slides");
      renderSlides(s, +btn.dataset.slide);
    });
  });
}

function openDetail(id, opts = {}) {
  const s = seminars.find((x) => x.id === id);
  if (!s) return;

  currentDetail = s;
  const { tab = "watch", slideIndex = null, videoSeconds = null } = opts;

  $("#detail-title").textContent = s.title;
  $("#detail-meta").textContent = [
    formatDate(s.date),
    s.video?.title,
    s.chapters?.length ? `${s.chapters.length} chapters` : null,
    s.slides?.length ? `${s.slides.length} slides` : null,
  ].filter(Boolean).join(" · ");

  $("#detail-sources").innerHTML = [
    s.video ? `<a href="${s.video.url}" target="_blank" rel="noopener">YouTube ↗</a>` : "",
    s.deck?.githubUrl ? `<a href="${s.deck.githubUrl}" target="_blank" rel="noopener">GitHub ↗</a>` : "",
    s.deck?.rawUrl ? `<a href="${s.deck.rawUrl}" target="_blank" rel="noopener">PPTX ↗</a>` : "",
  ].filter(Boolean).join("");

  renderVideo(s, videoSeconds ?? 0);
  renderSlides(s, slideIndex);
  renderDeckEmbed(s);
  renderPoints(s);

  const initialTab = tab || (slideIndex ? "slides" : videoSeconds != null ? "watch" : "watch");
  setDetailTab(initialTab);

  overlayEl.classList.add("open");
  overlayEl.setAttribute("aria-hidden", "false");
  history.replaceState(null, "", `#${id}`);
}

function closeDetail() {
  overlayEl.classList.remove("open");
  overlayEl.setAttribute("aria-hidden", "true");
  $("#detail-video").innerHTML = "";
  currentDetail = null;
  history.replaceState(null, "", location.pathname + location.search);
}

function setView(view) {
  activeView = view;
  document.querySelectorAll(".view-tabs .tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.view === view);
  });
  $("#timeline-view").hidden = view !== "timeline";
  $("#search-view").hidden = view !== "search";
  $("#trends-view").hidden = view !== "trends";
  renderCurrentView();
  updateHero();
}

function renderCurrentView() {
  if (activeView === "timeline") renderTimeline();
  else if (activeView === "search") renderSearchResults();
  else if (activeView === "trends") renderTrends();
  renderStats();
}

async function init() {
  await loadData();
  renderYearChips();
  renderTopicChips();
  renderCurrentView();
  updateHero();

  let searchTimer;
  $("#search").addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (searchQuery && activeView !== "search") setView("search");
      renderCurrentView();
      updateHero();
    }, 200);
  });

  document.querySelectorAll(".view-tabs .tab").forEach((t) => {
    t.addEventListener("click", () => setView(t.dataset.view));
  });

  document.querySelectorAll(".detail-tab").forEach((t) => {
    t.addEventListener("click", () => setDetailTab(t.dataset.detailTab));
  });

  $("#detail-close").addEventListener("click", closeDetail);
  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl) closeDetail();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });

  const hash = location.hash.slice(1);
  if (hash) openDetail(hash);
}

init().catch((err) => {
  timelineEl.innerHTML = `<div class="empty"><p>Failed to load data. Run <code>npm run ingest</code> first.</p><p style="font-size:0.85rem;margin-top:8px">${esc(err.message)}</p></div>`;
});
