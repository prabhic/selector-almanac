#!/usr/bin/env node
/**
 * Replace local data/ with the latest committed corpus from GitHub main.
 * No yt-dlp, no ONNX — for people who only installed the CLI.
 *
 *   selector-almanac update
 */
import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const ARCHIVE =
  "https://codeload.github.com/prabhic/selector-almanac/tar.gz/refs/heads/main";

function fail(msg) {
  process.stderr.write(`selector-almanac update: ${msg}\n`);
  process.exit(1);
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readMeta(dir) {
  try {
    return JSON.parse(await readFile(join(dir, "meta.json"), "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  process.stdout.write("Fetching latest data/ from GitHub (main)…\n");
  const tmp = await mkdtemp(join(tmpdir(), "selector-almanac-"));
  const tgz = join(tmp, "main.tar.gz");

  try {
    const res = await fetch(ARCHIVE, { redirect: "follow" });
    if (!res.ok) fail(`GitHub archive ${res.status} ${res.statusText}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tgz));

    const tar = spawnSync("tar", ["-xzf", tgz, "-C", tmp], { encoding: "utf8" });
    if (tar.status !== 0) fail(tar.stderr?.trim() || "tar extract failed");

    const src = join(tmp, "selector-almanac-main", "data");
    if (!(await exists(src))) fail("archive has no data/ folder");

    const raw = join(DATA, "raw");
    const rawBackup = join(tmp, "raw-keep");
    if (await exists(raw)) await cp(raw, rawBackup, { recursive: true });

    await rm(DATA, { recursive: true, force: true });
    await cp(src, DATA, { recursive: true });
    if (await exists(rawBackup)) await cp(rawBackup, raw, { recursive: true });

    const meta = await readMeta(DATA);
    const when = meta?.generatedAt ?? meta?.lastRefresh?.at ?? "unknown";
    const n = meta?.counts?.seminars ?? "?";
    process.stdout.write(`Updated data/ (${n} seminars, generated ${when})\n`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => fail(err.message));
