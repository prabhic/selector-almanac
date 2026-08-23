#!/usr/bin/env node
/**
 * Pull CI deck data from origin/main, then match YouTube locally and rebuild indexes.
 * TUI and web both read data/ after this.
 *
 *   npm run ingest:sync
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(msg) {
  process.stderr.write(`ingest:sync: ${msg}\n`);
  process.exit(1);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", env: process.env });
  if (r.error) fail(r.error.message);
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function hasBin(bin) {
  const r = spawnSync("command", ["-v", bin], { shell: true, encoding: "utf8" });
  return r.status === 0;
}

if (!hasBin("yt-dlp")) {
  fail("yt-dlp is required on PATH (brew install yt-dlp)");
}

run("git", ["fetch", "origin", "main"]);
run("git", ["pull", "--ff-only", "origin", "main"]);
run("npm", ["run", "ingest:refresh"]);
