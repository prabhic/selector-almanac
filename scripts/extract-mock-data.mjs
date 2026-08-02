#!/usr/bin/env node
/** Extract index.json, concepts.json, slides.json from mock/Selector Almanac mock.html */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MOCK = join(ROOT, "mock/Selector Almanac mock.html");
const DATA = join(ROOT, "data");

const UUIDS = {
  "index.json": "4f22003f-2474-4b07-9550-e34de19d7ac6",
  "concepts.json": "7e06b09e-aa61-43e8-ba98-96fbd022fdb3",
  "slides.json": "7c23d086-b986-4586-80b3-459c8e0e0675",
};

function loadBlob(html, uuid) {
  const re = new RegExp(`"${uuid}":\\{"mime":"application/json","compressed":true,"data":"([^"]+)"\\}`);
  const m = html.match(re);
  if (!m) throw new Error(`blob not found: ${uuid}`);
  return JSON.parse(gunzipSync(Buffer.from(m[1], "base64")).toString("utf8"));
}

async function main() {
  const html = await readFile(MOCK, "utf8");
  for (const [name, uuid] of Object.entries(UUIDS)) {
    const data = loadBlob(html, uuid);
    const out = join(DATA, name);
    await writeFile(out, JSON.stringify(data));
    const n = Array.isArray(data) ? data.length : Object.keys(data).length;
    console.log(`Wrote ${name} (${n} records)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
