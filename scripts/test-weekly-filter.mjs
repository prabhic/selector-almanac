#!/usr/bin/env node
/** Self-check: weekly deck detection survives upstream renames (AI-Updates -> AI-News). */
import assert from "node:assert/strict";
import { isWeeklyDeckPath, isWeekly2025Or2026, isWeeklySeminar } from "./lib/github.mjs";

for (const p of ["2026/2026-09-11-AI-Updates.pptx", "2026/2026-09-18-AI-News.pptx", "2025/2025-01-03-ai-news.pptx"]) {
  assert.ok(isWeeklyDeckPath(p), p);
  assert.ok(isWeekly2025Or2026(p), p);
}
for (const p of ["2026/2026-09-18-Kubernetes.pptx", "2021/data_science/intro.pptx"]) {
  assert.ok(!isWeeklyDeckPath(p), p);
}
assert.ok(!isWeekly2025Or2026("2024/2024-01-05-AI-Updates.pptx"), "out of window");

assert.ok(isWeeklySeminar({ deck: { path: "2026/2026-09-18-AI-News.pptx" }, date: "2026-09-18" }));
assert.ok(!isWeeklySeminar({ deck: { path: "2024/2024-01-05-AI-Updates.pptx" }, date: "2024-01-05" }));
assert.ok(!isWeeklySeminar({ date: "2026-09-18" }), "deck-less session");

console.log("weekly-filter ok");
