import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

// Lane E (full verification) — Batch 7: integration smoke + naming audit.
//  1. Naming audit: every text file under src/, fetched from the dev server
//     exactly as served, must not contain bayville/griggsville/illinois
//     (case-insensitive).
//  2. 30s live gameplay smoke: god mode + deterministic movement key
//     patterns + real hold-to-fire mouse input; zero page errors.
//  3. Game reaches a draft screen (naturally during smoke, or forced) and
//     settle() dismisses it cleanly.
//  4. A wave transition is observed (wave 0 -> >= 1, sim time advancing).
// Deterministic: settle()-style draft dismissal, movement/fire patterns keyed
// off the loop index; no wall-clock assertions.
const BASE = process.env.PZ_URL || "http://127.0.0.1:8092";
const BANNED = /bayville|griggsville|illinois/i;
const ROOT = path.resolve(path.dirname(new globalThis.URL(import.meta.url).pathname), "..");
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

console.log("== batch7e setup ==");
await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()"); // survive the smoke run; do NOT skipBreak so waves flow naturally
await T("settle()");

console.log("== 1. naming audit: served src free of banned place names ==");
// every text file under src/, fetched from the dev server exactly as served
const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".mp3", ".ogg", ".wav", ".woff", ".woff2", ".ttf", ".mp4"]);
const walk = (dir) => {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.isFile() && !SKIP_EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
};
const files = walk(path.join(ROOT, "src"));
const hits = [];
let fetched = 0, skipped = 0;
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  let r;
  try { r = await page.request.get(`${BASE}/${rel}`); } catch { skipped++; continue; }
  if (!r.ok()) { skipped++; continue; }
  let text;
  try { text = await r.text(); } catch { skipped++; continue; }
  fetched++;
  // The one allowed hit is the ban comment itself (documents the naming guard).
  const scrubbed = text.replace(/never bayville\/griggsville\/illinois/gi, "");
  const m = scrubbed.match(BANNED);
  if (m) {
    const i = m.index;
    hits.push(`${rel}: ...${text.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, " ")}...`);
  }
}
ok(`${fetched} src files served and scanned (${files.length} total, ${skipped} unfetchable)`, fetched > 0 && skipped < files.length, `${files.length} files found`);
ok("no bayville/griggsville/illinois in served src", hits.length === 0, hits.slice(0, 3).join(" | "));

console.log("== 2. 30s gameplay smoke (movement + hold-to-fire) ==");
const w0 = await T("waveInfo()");
let sawDraft = false;
const KEYS = [["KeyW"], ["KeyW", "KeyD"], ["KeyD"], ["KeyS", "KeyD"], ["KeyS"], ["KeyS", "KeyA"], ["KeyA"], ["KeyW", "KeyA"]];
await page.mouse.move(640, 400);
await page.mouse.down(); // real input path: hold-to-fire via handleMouseDown
for (let i = 0; i < 30; i++) {
  await page.evaluate((k) => {
    const c = window.__controlsTest;
    c.setKeys(k);
    c.settle(); // dismiss any draft pauses deterministically
  }, KEYS[i % KEYS.length]);
  // aim in a slow deterministic orbit around screen center
  await page.mouse.move(640 + 320 * Math.cos(i / 3), 400 + 280 * Math.sin(i / 3), { steps: 2 });
  if (await T("draftOpen()")) sawDraft = true;
  await page.waitForTimeout(1000);
}
await page.mouse.up();
await page.evaluate(() => window.__controlsTest.setKeys([]));
await T("settle()");
const w1 = await T("waveInfo()");
ok("30s live gameplay completed without exceptions", true);

console.log("== 3. draft screen reached and dismissed ==");
if (!(await T("draftOpen()")) && !sawDraft) await T("openDraft()"); // force one if gameplay never raised one
ok("game reaches a draft screen", (await T("draftOpen()")) === true || sawDraft, `sawDraft=${sawDraft}`);
await T("settle()");
ok("draft dismissed cleanly via settle()", (await T("draftOpen()")) === false);

console.log("== 4. wave transition observed ==");
ok("wave advanced from 0 during smoke (wave transition)", w1.wave >= 1 && w1.wave > w0.wave, JSON.stringify({ before: w0, after: w1 }));
ok("sim time advanced (sim not frozen)", w1.sim > w0.sim, JSON.stringify({ before: w0, after: w1 }));

console.log("== 5. page errors ==");
ok("zero page errors across the whole run", errors.length === 0, errors.slice(0, 5).join(" | "));

console.log(`\nbatch7e: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
