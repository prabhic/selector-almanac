#!/usr/bin/env node
/** Compile data/sessions/*.json → data/seminars.json (used by TUI + web timeline). */
import { ensureSessions, compileSeminarsJson } from "./lib/sessions.mjs";

function log(msg) {
  process.stderr.write(`${msg}\n`);
}

const sessions = await ensureSessions({ log });
await compileSeminarsJson(sessions);
log(`Compiled seminars.json (${sessions.length} sessions)`);
