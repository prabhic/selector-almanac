#!/usr/bin/env node
/**
 * Latest-week brief: top N "don't miss" points with URLs, then chat about that week.
 * Context is only the latest AI-weekly session; the previous few weeks' chapter titles
 * are included solely so the model can tell what is new this week.
 * With ANTHROPIC_API_KEY: calls the Claude API directly (standalone).
 * Without it: opens a locally installed agent (claude, else codex) on its own login.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chapterVideoUrl, linksForSlideRecord, loadWeekly } from "./lib/browse.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRIOR_WEEKS = 4;

const args = process.argv.slice(2);
const topIdx = args.indexOf("--top");
const top = topIdx >= 0 ? Math.max(1, +args[topIdx + 1] || 10) : 10;
const printOnly = args.includes("--print") || args.includes("-p");

const [latest, ...older] = await loadWeekly(ROOT);
if (!latest) {
  process.stderr.write("brief: no weekly sessions in data/ — run `selector-almanac update`\n");
  process.exit(1);
}

function weekContext(s) {
  const lines = [`# ${s.title} (${s.date})`];
  if (s.video) lines.push(`Video: ${s.video.url}`);
  lines.push("", "## Video chapters (title — timestamped URL)");
  for (const ch of s.chapters ?? []) lines.push(`- [${ch.label}] ${ch.title} — ${chapterVideoUrl(s, ch) ?? ""}`);
  lines.push("", "## Slides (text + source links)");
  for (const sl of s.slides ?? []) {
    const links = linksForSlideRecord(sl).map((l) => l.url);
    lines.push(`### Slide ${sl.index}: ${sl.title ?? ""}`, sl.text ?? "");
    if (links.length) lines.push(`Links: ${links.join(" ")}`);
  }
  return lines.join("\n");
}

const prior = older
  .slice(0, PRIOR_WEEKS)
  .map((s) => `- ${s.date}: ${(s.chapters ?? []).map((c) => c.title).join("; ")}`)
  .join("\n");

const system = `You are briefing a busy engineer on Lev Selector's latest weekly AI seminar.
Use ONLY the latest-week data below. Never invent URLs — cite only URLs present in the data.
The "previous weeks" list exists only to judge what is NEW this week; do not report items from it.

<latest_week>
${weekContext(latest)}
</latest_week>

<previous_weeks_chapter_titles>
${prior}
</previous_weeks_chapter_titles>`;

const ask = `Give me the top ${top} "do not miss" points from the ${latest.date} session, ranked by importance.
Favour what is genuinely new or special this week versus the previous weeks (new models, big releases, shifts), not recurring filler.
For each: a bold one-line headline, 1–2 sentences on why it matters, then the video timestamp URL and the most relevant source URL(s).
End with one line: "What changed this week" in a sentence.`;

if (process.env.ANTHROPIC_API_KEY) await chatViaApi();
else chatViaLocalAgent();

/** Standalone: Claude API with the user's key; streams the brief, then a follow-up loop. */
async function chatViaApi() {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { createInterface } = await import("node:readline/promises");
  const client = new Anthropic();
  const messages = [{ role: "user", content: ask }];
  const rl = printOnly ? null : createInterface({ input: process.stdin, output: process.stdout });

  while (true) {
    const stream = client.beta.messages.stream({
      model: "claude-opus-5",
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system,
      messages,
    });
    stream.on("text", (t) => process.stdout.write(t));
    const reply = await stream.finalMessage();
    process.stdout.write("\n");
    if (reply.stop_reason === "refusal") process.stderr.write("brief: the model declined this request\n");
    if (!rl) return;

    messages.push({ role: "assistant", content: reply.content });
    const q = (await rl.question("\n› ")).trim();
    if (!q || q === "exit" || q === "quit") return rl.close();
    messages.push({ role: "user", content: q });
  }
}

/** No key: hand the week to a locally installed agent (claude, then codex) — its own login/plan pays. */
function chatViaLocalAgent() {
  const agents = [
    ["claude", ["--append-system-prompt", system, ...(printOnly ? ["-p"] : []), ask]],
    // codex has no system-prompt flag, so the week goes inline with the ask.
    ["codex", [...(printOnly ? ["exec", "--skip-git-repo-check"] : []), `${system}\n\n${ask}`]],
  ];
  for (const [bin, argv] of agents) {
    const r = spawnSync(bin, argv, { cwd: ROOT, stdio: "inherit" });
    if (r.error?.code === "ENOENT") continue;
    process.exit(r.status ?? 1);
  }
  process.stderr.write(
    "brief: set ANTHROPIC_API_KEY, or install Claude Code (https://claude.com/claude-code) or Codex CLI\n",
  );
  process.exit(1);
}
