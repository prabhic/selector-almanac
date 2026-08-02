/** Topic rules tuned for Lev Selector weekly AI Updates — tag at chapter/point level. */

export const TREND_LENSES = [
  {
    slug: "agents",
    label: "Agents & orchestration",
    blurb: "Tool use, MCP, OpenClaw, multi-agent systems",
    patterns: [/\bagent(s|ic)?\b/i, /\bmcp\b/i, /\bopenclaw\b/i, /\btool\s*use\b/i, /\bcomputer\s*use\b/i, /\borchestrat/i, /\bmulti[- ]?agent/i, /\bhermes\s+agent/i],
  },
  {
    slug: "coding",
    label: "Coding assistants",
    blurb: "Claude Code, Cursor, Copilot, vibe coding, Codex",
    patterns: [/\bclaude\s*code\b/i, /\bcursor\b/i, /\bcopilot\b/i, /\bvibe[- ]?cod/i, /\bcodex\b/i, /\bopencode\b/i, /\bcoding\s+agent/i, /\bide\b/i],
  },
  {
    slug: "claude",
    label: "Claude / Anthropic",
    blurb: "Anthropic models, Sonnet, Opus, Fable",
    patterns: [/\bclaude\b/i, /\banthropic\b/i, /\bsonnet\b/i, /\bopus\b/i, /\bfable\b/i],
  },
  {
    slug: "openai",
    label: "OpenAI / GPT",
    blurb: "GPT, ChatGPT, Codex, OpenAI agents",
    patterns: [/\bopenai\b/i, /\bchatgpt\b/i, /\bgpt[- ]?\d/i, /\bo\d\b/i, /\bcodex\b/i],
  },
  {
    slug: "google",
    label: "Google / Gemini",
    blurb: "Gemini, Google AI Mode, Flash models",
    patterns: [/\bgemini\b/i, /\bgoogle\s+ai\b/i, /\bgoogle\s+flash\b/i, /\bpalm\b/i, /\bnotebooklm\b/i],
  },
  {
    slug: "open-models",
    label: "Open models & China labs",
    blurb: "Qwen, DeepSeek, Kimi, Mistral, Llama, Hugging Face",
    patterns: [/\bqwen\b/i, /\bdeepseek\b/i, /\bkimi\b/i, /\bmistral\b/i, /\bllama\b/i, /\bhugging\s*face\b/i, /\bopen[- ]?(source|weight)\b/i, /\bollama\b/i, /\bglm\b/i],
  },
  {
    slug: "benchmarks",
    label: "Benchmarks & leaderboards",
    blurb: "LM Arena, evals, intelligence index",
    patterns: [/\barena\b/i, /\bleaderboard\b/i, /\bbenchmark\b/i, /\bintelligence\s+index\b/i, /\beval(s|uation)?\b/i, /\belo\b/i],
  },
  {
    slug: "rag",
    label: "RAG & memory",
    blurb: "Retrieval, embeddings, vector DB, context memory",
    patterns: [/\brag\b/i, /\bretrieval\b/i, /\bembedding(s)?\b/i, /\bvector\s*(db|store|search)?\b/i, /\bcontext\s+window\b/i, /\bmemory\b/i, /\bcognee\b/i],
  },
  {
    slug: "multimodal",
    label: "Multimodal & media",
    blurb: "Image/video/voice generation, diffusion",
    patterns: [/\bmultimodal\b/i, /\bimage\s*gen/i, /\bvideo\s*gen/i, /\bdiffusion\b/i, /\bflux\b/i, /\bvoice\b/i, /\btts\b/i, /\bsuno\b/i],
  },
  {
    slug: "infra",
    label: "Infrastructure & chips",
    blurb: "Nvidia, inference, serving, GPUs, cloud",
    patterns: [/\bnvidia\b/i, /\binference\b/i, /\bserving\b/i, /\bgpu\b/i, /\bchip(s)?\b/i, /\bsglang\b/i, /\bvllm\b/i, /\bfirecracker\b/i],
  },
  {
    slug: "jobs",
    label: "Jobs & labor market",
    blurb: "Hiring, layoffs, demand for AI engineers",
    patterns: [/\bjobs?\b/i, /\blayoff/i, /\bhiring\b/i, /\blabor\b/i, /\bworkforce\b/i, /\bengineers?\b/i],
  },
  {
    slug: "safety",
    label: "Safety & security",
    blurb: "Alignment, hacks, guardrails, red team",
    patterns: [/\bsafety\b/i, /\balignment\b/i, /\bhack(ed)?\b/i, /\bsecurity\b/i, /\bguardrail/i, /\bred\s*team/i],
  },
];

/** Legacy / full-corpus rules (seminars outside weekly AI Updates). */
const LEGACY_RULES = [
  { slug: "fine-tuning", label: "Fine-tuning", patterns: [/\bfine[- ]?tun(e|ing)\b/i, /\blora\b/i, /\bpeft\b/i] },
  { slug: "ml-fundamentals", label: "ML fundamentals", patterns: [/\bneural\s*net/i, /\bregression\b/i, /\bclassification\b/i, /\brandom\s*forest\b/i] },
  { slug: "data-engineering", label: "Data engineering", patterns: [/\bdata\s*(pipeline|lake|warehouse)\b/i, /\betl\b/i, /\bspark\b/i] },
  { slug: "enterprise", label: "Enterprise AI", patterns: [/\benterprise\b/i, /\bcompliance\b/i, /\bgovernance\b/i] },
  { slug: "product", label: "AI product", patterns: [/\bproduct\s*manager\b/i, /\broadmap\b/i] },
];

const NOISE_CHAPTER = /^(introduction|about this channel|contents|agenda)$/i;

export const RULES = [...TREND_LENSES, ...LEGACY_RULES];

export function tagAllTopics(text) {
  if (!text?.trim()) return [];
  const found = [];
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) found.push(rule.slug);
  }
  return found;
}

export function extractTopics(...texts) {
  const tags = new Set();
  for (const text of texts) {
    if (!text || NOISE_CHAPTER.test(text.trim())) continue;
    for (const slug of tagAllTopics(text)) tags.add(slug);
  }
  return tags.size ? [...tags] : ["general"];
}

export function topicLabel(slug) {
  const rule = RULES.find((r) => r.slug === slug);
  return rule?.label ?? slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function topicBlurb(slug) {
  const rule = TREND_LENSES.find((r) => r.slug === slug);
  return rule?.blurb ?? "";
}

export function isNoiseChapter(title) {
  return NOISE_CHAPTER.test((title ?? "").trim());
}

export function buildTrends(seminars, { weeklyOnly = true } = {}) {
  const pool = weeklyOnly
    ? seminars.filter((s) => /AI-Updates/i.test(s.deck?.path ?? "") && /^(2025|2026)-/.test(s.date ?? ""))
    : seminars;

  const weeks = [...new Set(pool.map((s) => s.date).filter(Boolean))].sort();
  const byTopic = {};
  const weeklyTotals = {};

  for (const lens of TREND_LENSES) {
    byTopic[lens.slug] = {
      slug: lens.slug,
      label: lens.label,
      blurb: lens.blurb,
      firstSeen: null,
      totalMentions: 0,
      seminarWeeks: new Set(),
      series: [],
      timeline: [],
    };
  }

  for (const seminar of pool) {
    if (!seminar.date) continue;
    const weekTags = {};

    for (const ch of seminar.chapters ?? []) {
      if (isNoiseChapter(ch.title)) continue;
      const tags = tagAllTopics(ch.title);
      for (const slug of tags) {
        if (!byTopic[slug]) continue;
        const t = byTopic[slug];
        t.totalMentions++;
        t.seminarWeeks.add(seminar.date);
        weekTags[slug] = (weekTags[slug] ?? 0) + 1;
        if (!t.firstSeen || seminar.date < t.firstSeen) t.firstSeen = seminar.date;
        t.timeline.push({
          date: seminar.date,
          seminarId: seminar.id,
          claim: ch.title,
          videoUrl: seminar.video
            ? `https://www.youtube.com/watch?v=${seminar.video.id}&t=${ch.startSeconds ?? 0}s`
            : null,
          videoSeconds: ch.startSeconds ?? null,
          label: ch.label,
        });
      }
    }

    weeklyTotals[seminar.date] = (weeklyTotals[seminar.date] ?? 0) + (seminar.chapters?.length ?? 0);
    for (const [slug, count] of Object.entries(weekTags)) {
      byTopic[slug].series.push({ date: seminar.date, count, seminarId: seminar.id });
    }
  }

  const midpoint = Math.floor(weeks.length / 2);
  const priorWeeks = new Set(weeks.slice(0, midpoint));
  const recentWeeks = new Set(weeks.slice(midpoint));

  const topics = {};
  for (const [slug, t] of Object.entries(byTopic)) {
    let recent = 0;
    let prior = 0;
    for (const pt of t.series) {
      if (recentWeeks.has(pt.date)) recent += pt.count;
      if (priorWeeks.has(pt.date)) prior += pt.count;
    }
    topics[slug] = {
      slug,
      label: t.label,
      blurb: t.blurb,
      firstSeen: t.firstSeen,
      totalMentions: t.totalMentions,
      seminarWeeks: t.seminarWeeks.size,
      series: t.series.sort((a, b) => a.date.localeCompare(b.date)),
      timeline: t.timeline.sort((a, b) => a.date.localeCompare(b.date)),
      momentum: { recent, prior, delta: recent - prior },
    };
  }

  const ranked = Object.values(topics)
    .filter((t) => t.totalMentions > 0)
    .sort((a, b) => b.totalMentions - a.totalMentions);

  const rising = [...ranked]
    .filter((t) => t.momentum.delta > 0 && t.momentum.recent >= 3)
    .sort((a, b) => b.momentum.delta - a.momentum.delta)
    .slice(0, 5);

  const cooling = [...ranked]
    .filter((t) => t.momentum.delta < 0 && t.momentum.prior >= 3)
    .sort((a, b) => a.momentum.delta - b.momentum.delta)
    .slice(0, 5);

  return {
    scope: weeklyOnly ? "weekly-ai-updates-2025-2026" : "full-corpus",
    weekCount: weeks.length,
    weeks,
    weeklyTotals,
    topics,
    ranked: ranked.map((t) => t.slug),
    rising: rising.map((t) => ({ slug: t.slug, label: t.label, delta: t.momentum.delta, recent: t.momentum.recent })),
    cooling: cooling.map((t) => ({ slug: t.slug, label: t.label, delta: t.momentum.delta, prior: t.momentum.prior })),
    lenses: TREND_LENSES.map((l) => ({ slug: l.slug, label: l.label, blurb: l.blurb })),
  };
}
