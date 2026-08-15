#!/usr/bin/env node
/**
 * Verify derived data works for TUI (seminars.json) and web Atlas (index.json, slides.json, search).
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllSessions } from "./lib/sessions.mjs";
import { loadWeekly } from "./lib/browse.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function seminarShape(s, label) {
  if (!s.id) fail(`${label}: missing id`);
  if (!s.date) warn(`${label}: missing date`);
  if (!s.deck?.githubUrl) warn(`${label}: missing deck.githubUrl`);
}

async function main() {
  const sessions = await loadAllSessions();
  const seminarsOnDisk = JSON.parse(await readFile(join(DATA, "seminars.json"), "utf8"));

  if (sessions.length !== seminarsOnDisk.length) {
    fail(`session count mismatch: sessions=${sessions.length} seminars.json=${seminarsOnDisk.length}`);
  }

  let drift = 0;
  const byId = Object.fromEntries(seminarsOnDisk.map((s) => [s.id, s]));
  for (const s of sessions) {
    seminarShape(s, s.id);
    const compiled = byId[s.id];
    if (!compiled) fail(`seminars.json missing session ${s.id}`);
    else if (JSON.stringify(s) !== JSON.stringify(compiled)) drift++;
  }
  if (drift) fail(`${drift} session(s) out of sync with seminars.json — run: npm run compile`);

  const index = JSON.parse(await readFile(join(DATA, "index.json"), "utf8"));
  const slides = JSON.parse(await readFile(join(DATA, "slides.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(DATA, "search/manifest.json"), "utf8"));

  const indexIds = new Set(index.map((r) => r.id));
  for (const s of sessions) {
    if (!indexIds.has(s.id)) fail(`index.json missing ${s.id}`);
    if ((s.slides ?? []).length && !slides[s.id]) fail(`slides.json missing ${s.id}`);
  }

  if (!manifest.chunks || manifest.chunks < 100) {
    fail(`search manifest looks empty (chunks=${manifest.chunks ?? 0})`);
  }

  const weekly = await loadWeekly(ROOT);
  if (weekly.length < 5) fail(`TUI: expected ≥5 ai-weekly seminars, got ${weekly.length}`);

  const mustHaveVideo = [
    "2026-07-31-2026-07-31-ai-updates",
    "2026-07-24-2026-07-24-ai-updates",
    "2026-07-17-2026-07-17-ai-updates",
    "2026-07-10-2026-07-10-ai-updates",
  ];
  for (const id of mustHaveVideo) {
    const s = byId[id];
    if (!s?.video?.id) fail(`${id}: missing restored video`);
    if (!(s.chapters ?? []).length) fail(`${id}: missing chapters`);
    const row = index.find((r) => r.id === id);
    if (!row?.v?.id) fail(`index.json ${id}: missing video`);
    if (!(row?.ch ?? []).length) fail(`index.json ${id}: missing chapters`);
  }

  const deckOnly = ["2026-08-07-2026-08-07-ai-updates", "2026-08-14-2026-08-14-ai-updates"];
  for (const id of deckOnly) {
    const s = byId[id];
    if (!s) fail(`${id}: missing new week`);
    if (!(s.slides ?? []).length) fail(`${id}: missing slides`);
    if (!slides[id]?.length) fail(`slides.json ${id}: empty`);
  }

  const latest = weekly.slice(0, 6).map((s) => ({
    date: s.date,
    video: !!s.video?.id,
    chapters: s.chapters?.length ?? 0,
    slides: s.slides?.length ?? 0,
  }));

  if (errors.length) {
    process.stderr.write("validate-data: FAILED\n");
    for (const e of errors) process.stderr.write(`  ✗ ${e}\n`);
    process.exit(1);
  }

  process.stderr.write("validate-data: OK\n");
  process.stderr.write(`  ${sessions.length} sessions · ${weekly.length} ai-weekly · ${manifest.chunks} search chunks\n`);
  process.stderr.write("  Latest weeks (TUI + web):\n");
  for (const w of latest) {
    process.stderr.write(
      `    ${w.date}  video=${w.video ? "yes" : "deck-only"}  ch=${w.chapters}  slides=${w.slides}\n`,
    );
  }
  for (const w of warnings) process.stderr.write(`  ! ${w}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
