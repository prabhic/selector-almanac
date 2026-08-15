/**
 * Per-session JSON files under data/sessions/ — source of truth for seminar records.
 * seminars.json is compiled from these for the app and legacy scripts.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
export const DATA = join(ROOT, "data");
export const SESSIONS_DIR = join(DATA, "sessions");

export function sessionPath(id) {
  return join(SESSIONS_DIR, `${id}.json`);
}

export async function ensureSessionsDir() {
  await mkdir(SESSIONS_DIR, { recursive: true });
}

export async function sessionCount() {
  try {
    const files = await readdir(SESSIONS_DIR);
    return files.filter((f) => f.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

export async function loadSession(id) {
  const raw = await readFile(sessionPath(id), "utf8");
  return JSON.parse(raw);
}

export async function saveSession(seminar) {
  await ensureSessionsDir();
  await writeFile(sessionPath(seminar.id), JSON.stringify(seminar, null, 2));
}

export async function loadAllSessions() {
  await ensureSessionsDir();
  const files = (await readdir(SESSIONS_DIR)).filter((f) => f.endsWith(".json"));
  const sessions = [];
  for (const file of files) {
    sessions.push(JSON.parse(await readFile(join(SESSIONS_DIR, file), "utf8")));
  }
  sessions.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return sessions;
}

/** One-time migration: split seminars.json into data/sessions/*.json */
export async function migrateFromSeminarsJson({ log = () => {} } = {}) {
  const seminars = JSON.parse(await readFile(join(DATA, "seminars.json"), "utf8"));
  for (const seminar of seminars) {
    await saveSession(seminar);
  }
  log(`Migrated ${seminars.length} session(s) → data/sessions/`);
  return seminars;
}

/**
 * Load sessions from data/sessions/, or migrate from seminars.json if empty.
 */
export async function ensureSessions({ log = () => {} } = {}) {
  const count = await sessionCount();
  if (count > 0) return loadAllSessions();
  log("data/sessions/ empty — migrating from seminars.json…");
  return migrateFromSeminarsJson({ log });
}

export async function compileSeminarsJson(sessions) {
  const sorted = [...sessions].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  await writeFile(join(DATA, "seminars.json"), JSON.stringify(sorted, null, 2));
  return sorted;
}

export async function replaceSession(seminar) {
  await saveSession(seminar);
  const sessions = await loadAllSessions();
  return compileSeminarsJson(sessions);
}
