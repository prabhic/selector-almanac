/**
 * Deeper trend insights beyond keyword counts.
 * Lev's weekly format covers almost every theme each week — raw counts lie.
 * These metrics focus on relative share, novelty, entities, and shifts.
 */

import { TREND_LENSES, tagAllTopics, isNoiseChapter } from "./topics.mjs";

const LAB_SLUGS = ["claude", "openai", "google", "open-models"];

/** Named products/models/tools worth tracking individually. */
export const ENTITY_WATCHLIST = [
  { slug: "claude-fable", label: "Claude Fable", patterns: [/\bfable\b/i] },
  { slug: "claude-opus", label: "Claude Opus", patterns: [/\bopus\b/i] },
  { slug: "claude-sonnet", label: "Claude Sonnet", patterns: [/\bsonnet\b/i] },
  { slug: "claude-code", label: "Claude Code", patterns: [/\bclaude\s*code\b/i] },
  { slug: "chatgpt", label: "ChatGPT", patterns: [/\bchatgpt\b/i] },
  { slug: "gpt-5", label: "GPT-5 family", patterns: [/\bgpt[- ]?5/i, /\bgpt-5/i] },
  { slug: "codex", label: "Codex", patterns: [/\bcodex\b/i] },
  { slug: "gemini", label: "Gemini", patterns: [/\bgemini\b/i] },
  { slug: "qwen", label: "Qwen", patterns: [/\bqwen\b/i] },
  { slug: "deepseek", label: "DeepSeek", patterns: [/\bdeepseek\b/i] },
  { slug: "kimi", label: "Kimi", patterns: [/\bkimi\b/i] },
  { slug: "openclaw", label: "OpenClaw", patterns: [/\bopenclaw\b/i] },
  { slug: "mcp", label: "MCP", patterns: [/\bmcp\b/i] },
  { slug: "lm-arena", label: "LM Arena", patterns: [/\barena\b/i, /\blm\s*arena\b/i] },
  { slug: "cursor", label: "Cursor", patterns: [/\bcursor\b/i] },
  { slug: "ollama", label: "Ollama", patterns: [/\bollama\b/i] },
  { slug: "nvidia", label: "Nvidia", patterns: [/\bnvidia\b/i] },
  { slug: "rag", label: "RAG", patterns: [/\brag\b/i] },
  { slug: "suno", label: "Suno", patterns: [/\bsuno\b/i] },
  { slug: "flux", label: "FLUX / image gen", patterns: [/\bflux\b/i] },
];

function chapterKey(title) {
  return (title ?? "")
    .toLowerCase()
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, "")
    .replace(/\b20\d{2}\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagEntities(text) {
  const found = [];
  for (const ent of ENTITY_WATCHLIST) {
    if (ent.patterns.some((p) => p.test(text))) found.push(ent.slug);
  }
  return found;
}

function pct(n, total) {
  return total > 0 ? Math.round((n / total) * 1000) / 1000 : 0;
}

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function labelForSlug(slug) {
  return TREND_LENSES.find((l) => l.slug === slug)?.label
    ?? ENTITY_WATCHLIST.find((e) => e.slug === slug)?.label
    ?? slug;
}

export function buildInsights(pool) {
  const seminars = [...pool].filter((s) => s.date).sort((a, b) => a.date.localeCompare(b.date));
  const weeks = seminars.map((s) => s.date);

  const shareOfVoice = [];
  const labRace = [];
  const weeklyNovelty = [];
  const chapterHistory = new Set();
  const lookback = 8;

  for (const seminar of seminars) {
    const chapters = (seminar.chapters ?? []).filter((c) => !isNoiseChapter(c.title));
    const total = chapters.length;
    const topicCounts = Object.fromEntries(TREND_LENSES.map((l) => [l.slug, 0]));

    for (const ch of chapters) {
      for (const slug of tagAllTopics(ch.title)) {
        if (topicCounts[slug] != null) topicCounts[slug]++;
      }
    }

    const shares = {};
    for (const [slug, count] of Object.entries(topicCounts)) {
      shares[slug] = pct(count, total);
    }

    shareOfVoice.push({ date: seminar.date, seminarId: seminar.id, totalChapters: total, counts: topicCounts, shares });

    const labRanking = LAB_SLUGS
      .map((slug) => [slug, shares[slug] ?? 0])
      .sort((a, b) => b[1] - a[1]);
    const [leader, leaderShare] = labRanking[0] ?? ["none", 0];

    labRace.push({
      date: seminar.date,
      seminarId: seminar.id,
      leader,
      leaderLabel: labelForSlug(leader),
      leaderShare,
      ranking: labRanking.map(([slug, share]) => ({ slug, label: labelForSlug(slug), share })),
    });

    const priorKeys = new Set();
    const idx = seminars.indexOf(seminar);
    for (const p of seminars.slice(Math.max(0, idx - lookback), idx)) {
      for (const ch of p.chapters ?? []) {
        if (!isNoiseChapter(ch.title)) priorKeys.add(chapterKey(ch.title));
      }
    }

    const novel = [];
    for (const ch of chapters) {
      const key = chapterKey(ch.title);
      if (!key || key.length < 8) continue;
      if (!priorKeys.has(key) && !chapterHistory.has(key)) {
        novel.push({
          claim: ch.title,
          seminarId: seminar.id,
          videoUrl: seminar.video
            ? `https://www.youtube.com/watch?v=${seminar.video.id}&t=${ch.startSeconds ?? 0}s`
            : null,
          videoSeconds: ch.startSeconds ?? null,
          label: ch.label,
        });
      }
      chapterHistory.add(key);
    }

    weeklyNovelty.push({
      date: seminar.date,
      seminarId: seminar.id,
      novelCount: novel.length,
      totalChapters: total,
      novelRatio: pct(novel.length, total),
      highlights: novel.slice(0, 12),
    });
  }

  // Share momentum: avg share last N weeks vs prior N
  const half = Math.floor(shareOfVoice.length / 2) || 1;
  const recentWeeks = shareOfVoice.slice(-half);
  const priorWeeks = shareOfVoice.slice(0, half);

  const shareMomentum = TREND_LENSES.map((lens) => {
    const recentShare = avg(recentWeeks.map((w) => w.shares[lens.slug] ?? 0));
    const priorShare = avg(priorWeeks.map((w) => w.shares[lens.slug] ?? 0));
    return {
      slug: lens.slug,
      label: lens.label,
      recentShare,
      priorShare,
      delta: Math.round((recentShare - priorShare) * 1000) / 1000,
      direction: recentShare > priorShare + 0.01 ? "up" : recentShare < priorShare - 0.01 ? "down" : "flat",
    };
  }).sort((a, b) => b.delta - a.delta);

  // Entity tracker
  const entityMap = {};
  for (const ent of ENTITY_WATCHLIST) {
    entityMap[ent.slug] = {
      slug: ent.slug,
      label: ent.label,
      firstSeen: null,
      lastSeen: null,
      weeksMentioned: 0,
      totalMentions: 0,
      series: [],
    };
  }

  for (const seminar of seminars) {
    const weekEntities = {};
    for (const ch of seminar.chapters ?? []) {
      if (isNoiseChapter(ch.title)) continue;
      for (const slug of tagEntities(ch.title)) {
        weekEntities[slug] = (weekEntities[slug] ?? 0) + 1;
      }
    }
    for (const [slug, count] of Object.entries(weekEntities)) {
      const e = entityMap[slug];
      if (!e) continue;
      e.totalMentions += count;
      e.weeksMentioned++;
      if (!e.firstSeen) e.firstSeen = seminar.date;
      e.lastSeen = seminar.date;
      e.series.push({ date: seminar.date, count, seminarId: seminar.id });
    }
  }

  const entities = Object.values(entityMap).filter((e) => e.totalMentions > 0);
  const cutoff = weeks[Math.max(0, weeks.length - 8)] ?? "";
  const newEntities = entities
    .filter((e) => e.firstSeen >= cutoff)
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));

  // Bursts: weeks where topic share > 2x rolling 8-week baseline
  const bursts = [];
  for (const lens of TREND_LENSES) {
    for (let i = 8; i < shareOfVoice.length; i++) {
      const window = shareOfVoice.slice(i - 8, i);
      const baseline = avg(window.map((w) => w.shares[lens.slug] ?? 0));
      const current = shareOfVoice[i].shares[lens.slug] ?? 0;
      if (baseline > 0.02 && current >= baseline * 1.8 && current >= 0.08) {
        bursts.push({
          slug: lens.slug,
          label: lens.label,
          date: shareOfVoice[i].date,
          seminarId: shareOfVoice[i].seminarId,
          share: current,
          baseline: Math.round(baseline * 1000) / 1000,
          burstRatio: Math.round((current / baseline) * 10) / 10,
        });
      }
    }
  }
  bursts.sort((a, b) => b.burstRatio - a.burstRatio);

  // Auto briefs for last 6 weeks
  const recentBriefs = shareOfVoice.slice(-6).map((week) => {
    const race = labRace.find((r) => r.date === week.date);
    const novelty = weeklyNovelty.find((n) => n.date === week.date);
    const topTopics = Object.entries(week.shares)
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const rising = shareMomentum.filter((m) => m.direction === "up").slice(0, 2);
    const falling = [...shareMomentum].filter((m) => m.direction === "down").sort((a, b) => a.delta - b.delta).slice(0, 2);

    const bullets = [];
    if (race?.leader) {
      bullets.push(`${race.leaderLabel} led the narrative (${Math.round(race.leaderShare * 100)}% of tagged chapters)`);
    }
    if (novelty?.novelCount) {
      bullets.push(`${novelty.novelCount} chapter topics not seen in the prior ${lookback} weeks (${Math.round(novelty.novelRatio * 100)}% novelty)`);
    }
    if (topTopics.length) {
      bullets.push(`Top airtime: ${topTopics.map(([s, sh]) => `${labelForSlug(s)} ${Math.round(sh * 100)}%`).join(", ")}`);
    }
    if (novelty?.highlights?.length) {
      bullets.push(`New angles: ${novelty.highlights.slice(0, 3).map((h) => h.claim).join(" · ")}`);
    }

    return {
      date: week.date,
      seminarId: week.seminarId,
      headline: race
        ? `${race.leaderLabel}-led week · ${novelty?.novelCount ?? 0} novel topics`
        : `Week of ${week.date}`,
      bullets,
      leader: race?.leader,
      leaderShare: race?.leaderShare,
      noveltyRatio: novelty?.novelRatio ?? 0,
    };
  });

  return {
    methodology: "Share-of-voice (% of chapters), not raw counts. Novelty = chapter titles unseen in prior 8 weeks. Entities = named products/models. Bursts = 1.8× rolling baseline.",
    lookbackWeeks: lookback,
    shareOfVoice,
    labRace,
    shareMomentum,
    entities: entities.sort((a, b) => b.totalMentions - a.totalMentions),
    newEntities,
    weeklyNovelty,
    bursts: bursts.slice(0, 20),
    recentBriefs,
    risingShare: shareMomentum.filter((m) => m.direction === "up" && m.delta >= 0.01).slice(0, 5),
    fallingShare: shareMomentum.filter((m) => m.direction === "down" && m.delta <= -0.01).slice(0, 5),
  };
}
