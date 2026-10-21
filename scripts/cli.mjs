#!/usr/bin/env node
/**
 * Global CLI: selector-almanac
 * Default: interactive TUI. Subcommands: serve, open, browse, plus browse-weeks.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TUI = join(ROOT, "scripts/browse-tui.mjs");
const OPEN = join(ROOT, "scripts/open-browse-cmux.mjs");
const WEEKS = join(ROOT, "scripts/browse-weeks.mjs");
const UPDATE = join(ROOT, "scripts/update-data.mjs");
const BRIEF = join(ROOT, "scripts/week-brief.mjs");

const args = process.argv.slice(2);
const cmd = args[0];

function run(script, extra = []) {
  const r = spawnSync(process.execPath, [script, ...extra], {
    cwd: ROOT,
    stdio: "inherit",
  });
  process.exit(r.status ?? 0);
}

function help() {
  process.stdout.write(`selector-almanac — Lev Selector weekly AI seminars

Usage:
  selector-almanac                 Interactive TUI
  selector-almanac browse          Same as default
  selector-almanac open            Open TUI (cmux tab / Terminal.app)
  selector-almanac serve           Web app at http://localhost:3456/app/
  selector-almanac weeks [--json]  List recent weeks (non-interactive)
  selector-almanac update          Pull latest data/ from GitHub (no ONNX)
  selector-almanac brief [--top N] [--print]
                                   Top N (default 10) must-know points from the latest
                                   week with URLs, then chat. Uses ANTHROPIC_API_KEY
                                   if set, else local claude / codex CLI
  selector-almanac help

TUI keys: ↑↓  [ ] weeks  1/2/3 views  Enter open  y YouTube  q quit
`);
}

if (!cmd || cmd === "browse") {
  run(TUI, cmd === "browse" ? args.slice(1) : args);
}

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  help();
  process.exit(0);
}

if (cmd === "serve") {
  process.stdout.write("Serving at http://localhost:3456/app/\n");
  const r = spawnSync(
    "npx",
    ["--yes", "serve", ".", "-p", "3456"],
    { cwd: ROOT, stdio: "inherit", shell: true }
  );
  process.exit(r.status ?? 0);
}

if (cmd === "open" && args.length === 1) {
  run(OPEN);
}

if (cmd === "update") {
  run(UPDATE);
}

if (cmd === "brief") {
  run(BRIEF, args.slice(1));
}

run(WEEKS, args);
