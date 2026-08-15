/**
 * Incremental concept-thread mentions from weekly chapters/slides.
 * Catalog (labels/kinds) stays curated; delta ingest appends new receipts.
 */
import { isNoiseChapter } from "./topics.mjs";

const DAY = 864e5;

/** Extra matchers beyond the concept label itself. Keyed by exact concepts.json label. */
const EXTRA_PATTERNS = {
  OpenAI: [/\bopenai\b/i, /\bchatgpt\b/i, /\bgpt[- ]?\d/i],
  "Open weights & China labs": [
    /\bopen[- ]?(source|weight)/i, /\bqwen\b/i, /\bdeepseek\b/i, /\bkimi\b/i,
    /\bglm\b/i, /\bmistral\b/i, /\bllama\b/i, /\bollama\b/i,
  ],
  "Google / Gemini": [/\bgemini\b/i, /\bgoogle\s+ai\b/i, /\bnotebooklm\b/i, /\bpalm\b/i],
  "Anthropic / Claude": [/\banthropic\b/i, /\bclaude\b/i, /\bsonnet\b/i, /\bopus\b/i],
  "Agents & orchestration": [/\bagent(s|ic)?\b/i, /\borchestrat/i, /\bmulti[- ]?agent/i, /\bopenclaw\b/i],
  "Coding assistants": [/\bclaude\s*code\b/i, /\bcursor\b/i, /\bcopilot\b/i, /\bcodex\b/i, /\bvibe[- ]?cod/i],
  "Evals & leaderboards": [/\barena\b/i, /\bleaderboard\b/i, /\bbenchmark\b/i, /\beval(s|uation)?\b/i, /\belo\b/i],
  Microsoft: [/\bmicrosoft\b/i, /\bazure\b/i, /\bcopilot\b/i],
  "GPUs & chips": [/\bgpu\b/i, /\bchip(s)?\b/i, /\bnvidia\b/i, /\btpu\b/i],
  "Jobs & layoffs": [/\blayoff/i, /\bhiring\b/i, /\bjobs?\b/i, /\bworkforce\b/i],
  "Meta / Llama": [/\bmeta\b/i, /\bllama\b/i, /\bzuck/i],
  Nvidia: [/\bnvidia\b/i, /\bnemotron\b/i, /\bcuda\b/i],
  "Funding & valuations": [/\bfunding\b/i, /\bvaluation\b/i, /\braised\b/i, /\bbillion\b/i],
  "RAG & retrieval": [/\brag\b/i, /\bretrieval\b/i],
  "Python & Rust tooling": [/\bpython\b/i, /\brust\b/i, /\buv\b/i, /\bpypi\b/i],
  "Hugging Face": [/\bhugging\s*face\b/i, /\bhuggingface\b/i, /\bhf\s+hub\b/i],
  "Robotics & embodied AI": [/\brobot/i, /\bembodied\b/i],
  Mistral: [/\bmistral\b/i],
  "Transformers & architecture": [/\btransformer/i, /\battention\b/i, /\bmamba\b/i, /\bmoe\b/i],
  "Prompt engineering": [/\bprompt/i],
  "Local & on-device models": [/\blocal\b/i, /\bon[- ]device\b/i, /\bollama\b/i, /\bmlx\b/i],
  "Image generation": [/\bimage\s*gen/i, /\bflux\b/i, /\bmidjourney\b/i, /\bstable\s*diffusion\b/i],
  "Amazon / AWS": [/\bamazon\b/i, /\baws\b/i, /\bbedrock\b/i],
  DeepSeek: [/\bdeepseek\b/i],
  Embeddings: [/\bembedding/i],
  "Alibaba / Qwen": [/\bqwen\b/i, /\balibaba\b/i],
  "xAI / Grok": [/\bxai\b/i, /\bgrok\b/i],
  "Fine-tuning": [/\bfine[- ]?tun/i],
  "Data engineering": [/\bdata\s*(pipeline|lake|warehouse|engineering)\b/i, /\bspark\b/i, /\betl\b/i],
  Apple: [/\bapple\b/i, /\bmlx\b/i],
  "Video generation": [/\bvideo\s*gen/i, /\bsora\b/i, /\bseedance\b/i, /\bveo\b/i],
  "Andrej Karpathy": [/\bkarpathy\b/i],
  Perplexity: [/\bperplexity\b/i],
  "LangChain & frameworks": [/\blangchain\b/i, /\blanggraph\b/i, /\bllamaindex\b/i],
  "Diffusion models": [/\bdiffusion\b/i],
  MCP: [/\bmcp\b/i, /\bmodel\s+context\s+protocol\b/i],
  "Vector databases": [/\bvector\s*(db|database|store|search)\b/i],
  "Cost & pricing": [/\bcost\b/i, /\bpric(e|ing)\b/i, /\btoken\s+cost\b/i],
  "Elon Musk": [/\belon\b/i, /\bmusk\b/i],
  Quantization: [/\bquantiz/i, /\bgguf\b/i, /\bint8\b/i, /\bnvfp4\b/i],
  Hallucination: [/\bhallucin/i],
  "Speech & voice": [/\bvoice\b/i, /\btts\b/i, /\bwhisper\b/i, /\bspeech\b/i],
  "Reasoning & test-time compute": [/\breasoning\b/i, /\btest[- ]time\b/i, /\bo1\b/i, /\bo3\b/i],
  "Safety, jailbreaks & red-teaming": [/\bjailbreak/i, /\bred\s*team/i, /\bguardrail/i, /\bsafety\b/i],
  "AGI & superintelligence": [/\bagi\b/i, /\bsuperintelligence\b/i],
  "Browsers & computer use": [/\bcomputer\s+use\b/i, /\bbrowser[- ]use\b/i, /\boperator\b/i],
  "Moonshot / Kimi": [/\bmoonshot\b/i, /\bkimi\b/i],
  Multimodal: [/\bmultimodal\b/i],
  "Inference serving": [/\binference\b/i, /\bvllm\b/i, /\bsglang\b/i],
  "Enterprise adoption": [/\benterprise\b/i],
  "Yann LeCun": [/\blecun\b/i],
  "Mixture of experts": [/\bmixture\s+of\s+experts\b/i, /\bmoe\b/i],
  "Context window": [/\bcontext\s+window\b/i, /\bcontext\s+length\b/i],
  "Sam Altman": [/\bsam\s+altman\b/i, /\baltman\b/i],
  "Jensen Huang": [/\bjensen\b/i],
  "Observability & LLMOps": [/\bllmops\b/i, /\bobservability\b/i],
  "Andrew Ng": [/\bandrew\s+ng\b/i],
  "Agent memory": [/\bagent\s+memory\b/i, /\bmemory\b/i],
  "LoRA & PEFT": [/\blora\b/i, /\bpeft\b/i],
  "Ilya Sutskever": [/\bilya\b/i, /\bsutskever\b/i],
  "Tool & function calling": [/\btool\s*(use|calling)\b/i, /\bfunction\s+call/i],
  "Vibe coding": [/\bvibe[- ]?cod/i],
  "Regulation & policy": [/\bregulat/i, /\bpolicy\b/i],
  "RLHF & alignment": [/\brlhf\b/i, /\balignment\b/i],
  Distillation: [/\bdistill/i],
  "Demis Hassabis": [/\bhassabis\b/i, /\bdemis\b/i],
  "Knowledge graphs": [/\bknowledge\s+graph/i],
  "Synthetic data": [/\bsynthetic\s+data\b/i],
  "Spec-driven development": [/\bspec[- ]driven\b/i],
};

function labelPatterns(label) {
  const extra = EXTRA_PATTERNS[label] ?? [];
  const bits = label
    .split(/\s*[/,&]+\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3);
  const fromLabel = bits.map((bit) => {
    const esc = bit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`\\b${esc}\\b`, "i");
  });
  return [...fromLabel, ...extra];
}

const patternCache = new Map();

function patternsFor(concept) {
  if (!patternCache.has(concept.k)) patternCache.set(concept.k, labelPatterns(concept.label));
  return patternCache.get(concept.k);
}

function matchesConcept(concept, text) {
  if (!text) return false;
  return patternsFor(concept).some((re) => re.test(text));
}

function guessSlide(chapters, chapterIndex, slides) {
  if (!slides?.length) return null;
  if (chapterIndex === 0) return slides[0];
  const ratio = chapterIndex / Math.max(chapters.length - 1, 1);
  const idx = Math.min(slides.length - 1, Math.round(ratio * (slides.length - 1)));
  return slides[idx];
}

function harvestSnippets(seminar) {
  const rows = [];
  const chapters = seminar.chapters ?? [];
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    if (isNoiseChapter(ch.title)) continue;
    const timed = ch.startSeconds != null && ch.startSeconds >= 0;
    const slide = guessSlide(chapters, i, seminar.slides);
    rows.push({
      text: ch.title,
      sec: timed ? ch.startSeconds : -1,
      slide: slide?.index ?? -1,
      flag: timed ? "y" : "o",
    });
  }
  for (const sl of seminar.slides ?? []) {
    const text = (sl.title || sl.text || "").trim().slice(0, 90);
    if (!text || isNoiseChapter(text)) continue;
    rows.push({ text, sec: -1, slide: sl.index ?? -1, flag: "o" });
  }

  return rows.slice(0, 80);
}

function mentionKey(m) {
  return `${m[0]}|${m[1]}|${m[2]}|${String(m[3]).slice(0, 48)}`;
}

function recomputeStats(concept, dateById) {
  const dates = (concept.m ?? [])
    .map((row) => dateById.get(row[0]))
    .filter(Boolean)
    .sort();
  const mm = {};
  for (const d of dates) {
    const k = d.slice(0, 7);
    mm[k] = (mm[k] || 0) + 1;
  }
  const maxT = Date.now();
  const recent = dates.filter((d) => maxT - new Date(d).getTime() < 180 * DAY).length;
  const prior = dates.filter((d) => {
    const t = maxT - new Date(d).getTime();
    return t >= 180 * DAY && t < 360 * DAY;
  }).length;
  let status = "Steady";
  if (dates[0] && maxT - new Date(dates[0]).getTime() < 200 * DAY) status = "New";
  else if (recent === 0) status = "Dormant";
  else if (recent > prior * 1.4 + 2) status = "Rising";
  else if (prior > recent * 1.4 + 2) status = "Fading";

  const sems = new Set((concept.m ?? []).map((row) => row[0]));
  concept.n = concept.m.length;
  concept.sem = sems.size;
  concept.first = dates[0] ?? concept.first;
  concept.last = dates[dates.length - 1] ?? concept.last;
  concept.recent = recent;
  concept.prior = prior;
  concept.status = status;
  concept.months = Object.keys(mm).sort().map((k) => [k, mm[k]]);
}

function recomputeCo(concepts) {
  const bySession = new Map();
  for (const c of concepts) {
    for (const row of c.m ?? []) {
      const sid = row[0];
      if (!bySession.has(sid)) bySession.set(sid, new Set());
      bySession.get(sid).add(c.label);
    }
  }
  const counts = new Map();
  for (const labels of bySession.values()) {
    const arr = [...labels];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        const bump = (from, to) => {
          if (!counts.has(from)) counts.set(from, new Map());
          const m = counts.get(from);
          m.set(to, (m.get(to) || 0) + 1);
        };
        bump(a, b);
        bump(b, a);
      }
    }
  }
  for (const c of concepts) {
    const m = counts.get(c.label);
    c.co = m
      ? [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, n]) => [label, n])
      : [];
  }
}

/**
 * Append mentions from seminars on/after `since` (ISO date).
 * Existing curated receipts are kept; only new session ids are scanned.
 */
export function refreshConceptMentions(concepts, seminars, { since = null, log = () => {} } = {}) {
  const dateById = new Map(seminars.filter((s) => s.id && s.date).map((s) => [s.id, s.date]));
  const cutoff = since ?? [...concepts.map((c) => c.last).filter(Boolean)].sort().at(-1) ?? "1970-01-01";
  const targets = seminars.filter((s) => s.date && s.date >= cutoff && s.id);
  log(`  scanning ${targets.length} session(s) since ${cutoff} against ${concepts.length} threads`);

  let added = 0;
  for (const seminar of targets) {
    const snippets = harvestSnippets(seminar);
    for (const concept of concepts) {
      if (!concept.m) concept.m = [];
      const have = new Set(concept.m.map(mentionKey));
      let nThis = 0;
      for (const snip of snippets) {
        if (nThis >= 8) break;
        if (!matchesConcept(concept, snip.text)) continue;
        const row = [seminar.id, snip.sec, snip.slide, snip.text.slice(0, 80), snip.flag];
        const key = mentionKey(row);
        if (have.has(key)) continue;
        have.add(key);
        concept.m.push(row);
        nThis++;
        added++;
      }
    }
  }

  for (const concept of concepts) recomputeStats(concept, dateById);
  recomputeCo(concepts);
  log(`  appended ${added} concept mention(s)`);
  return { added, since: cutoff, scanned: targets.length };
}
