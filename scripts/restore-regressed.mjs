#!/usr/bin/env node
/**
 * Restore seminar sessions from a pre-Actions backup and rebuild aggregates.
 *
 * Usage:
 *   node scripts/restore-regressed.mjs
 *   node scripts/restore-regressed.mjs --backup .backups/data-pre-actions-...
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DATA,
  ensureSessions,
  saveSession,
  compileSeminarsJson,
} from "./lib/sessions.mjs";
import { writeAggregates } from "./lib/aggregate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const RESTORE_IDS = [
  "2026-07-31-2026-07-31-ai-updates",
  "2026-07-24-2026-07-24-ai-updates",
  "2026-07-17-2026-07-17-ai-updates",
  "2026-07-10-2026-07-10-ai-updates",
];

const args = process.argv.slice(2);
const backupIdx = args.indexOf("--backup");
const backupDir =
  backupIdx >= 0
    ? args[backupIdx + 1]
    : join(ROOT, ".backups/data-pre-actions-20260815-192905-d8c3037");

function log(msg) {
  process.stderr.write(`${msg}\n`);
}

async function main() {
  const backupSeminars = JSON.parse(await readFile(join(backupDir, "seminars.json"), "utf8"));
  const backupById = Object.fromEntries(backupSeminars.map((s) => [s.id, s]));

  let sessions = await ensureSessions({ log });
  const sessionById = Object.fromEntries(sessions.map((s) => [s.id, s]));

  for (const id of RESTORE_IDS) {
    const restored = backupById[id];
    if (!restored) {
      throw new Error(`Backup missing session: ${id}`);
    }
    const current = sessionById[id];
    if (!current) {
      throw new Error(`Current corpus missing session: ${id}`);
    }
    if (!restored.video?.id) {
      throw new Error(`Backup session has no video to restore: ${id}`);
    }
    await saveSession(restored);
    sessionById[id] = restored;
    log(`Restored ${id} (video ${restored.video.id}, ${restored.chapters?.length ?? 0} chapters)`);
  }

  sessions = Object.values(sessionById).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  await compileSeminarsJson(sessions);

  const meta = JSON.parse(await readFile(join(DATA, "meta.json"), "utf8"));
  const backupMeta = JSON.parse(await readFile(join(backupDir, "meta.json"), "utf8"));
  await writeAggregates(sessions, {
    refreshedIds: RESTORE_IDS,
    weeks: meta.lastRefresh?.weeks ?? 6,
    videoCount: backupMeta.counts?.videos || meta.counts?.videos || null,
    pendingRefresh: meta.pendingRefresh ?? [],
    lastDeltaIngest: meta.lastDeltaIngest,
  });

  log(`\nRestored ${RESTORE_IDS.length} session(s). Run: npm run build`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
