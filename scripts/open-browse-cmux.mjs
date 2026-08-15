#!/usr/bin/env node
/**
 * Open Lev Selector Browse TUI.
 * - cmux: new tab in current workspace
 * - interactive terminal: run TUI here
 * - macOS headless/agent shell: open Terminal.app tab
 */
import { spawnSync, execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CMUX = process.env.CMUX_CLI_PATH || "cmux";
const TAB_TITLE = "Lev Browse";
const TUI = join(ROOT, "scripts/browse-tui.mjs");

function fail(msg) {
  process.stderr.write(`browse:open: ${msg}\n`);
  process.exit(1);
}

function cmuxAvailable() {
  const which = spawnSync("command", ["-v", CMUX], { shell: true, encoding: "utf8" });
  if (which.status !== 0) return false;
  const ping = spawnSync(CMUX, ["ping"], { encoding: "utf8" });
  return ping.status === 0;
}

function cmux(args) {
  const r = spawnSync(CMUX, args, { encoding: "utf8", cwd: ROOT });
  if (r.error) fail(r.error.message);
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (r.status !== 0) fail(out || `cmux ${args[0]} failed`);
  return out;
}

function workspaceArg() {
  if (process.env.CMUX_WORKSPACE_ID) return ["--workspace", process.env.CMUX_WORKSPACE_ID];
  try {
    const raw = cmux(["identify"]);
    const data = JSON.parse(raw);
    const ref = data?.focused?.workspace_ref ?? data?.caller?.workspace_ref;
    if (ref) return ["--workspace", ref];
  } catch {
    /* use cmux default */
  }
  return [];
}

function parseSurfaceRef(text) {
  const m = text.match(/surface:\d+/);
  return m ? m[0] : null;
}

function openViaCmux() {
  const ws = workspaceArg();
  const created = cmux([
    "new-surface",
    "--type",
    "terminal",
    "--working-directory",
    ROOT,
    "--focus",
    "true",
    ...ws,
  ]);
  const surface = parseSurfaceRef(created);
  if (!surface) fail(`could not parse new tab id from: ${created}`);
  cmux(["send", "--surface", surface, "npm run browse\n"]);
  cmux(["tab-action", "--action", "rename", "--surface", surface, "--title", TAB_TITLE]);
  process.stdout.write(`OK cmux ${surface} — ${TAB_TITLE}\n`);
}

function openInCurrentTerminal() {
  process.stdout.write(`Starting browse TUI in this terminal (no cmux).\n`);
  const r = spawnSync(process.execPath, [TUI], { cwd: ROOT, stdio: "inherit" });
  process.exit(r.status ?? 0);
}

function openMacTerminal() {
  const cmd = `cd ${JSON.stringify(ROOT)} && npm run browse`;
  execSync(
    `osascript -e 'tell application "Terminal" to do script ${JSON.stringify(cmd)}'`,
    { stdio: "ignore" }
  );
  process.stdout.write(`OK Terminal.app — ${TAB_TITLE}\n`);
}

function main() {
  if (cmuxAvailable()) {
    openViaCmux();
    return;
  }

  if (process.stdout.isTTY && process.stdin.isTTY) {
    openInCurrentTerminal();
    return;
  }

  if (process.platform === "darwin") {
    openMacTerminal();
    return;
  }

  fail("no cmux and not an interactive terminal — run: npm run browse");
}

main();
