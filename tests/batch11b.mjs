// tests/batch11b.mjs — Batch 11 (Lane 2): slot machine UI + double-or-nothing.
//
// Live-only Playwright tests against the dev server (served bundle):
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch11b.mjs
//
// The engine lane (Lane 1) works concurrently on spinSlots()/gambleCache().
// These tests MUST NOT depend on the real probes: every probe the UI needs
// is force-installed via page.evaluate, and the graceful-degradation tests
// explicitly delete them first.

import fs from "node:fs";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}

const BAD = ["bayville", "griggsville", "illinois"];

console.log("== 11b(i). Indiana-only naming (Lane-2 files) ==");
{
  const files = [
    "src/components/game/SlotMachine.tsx",
    "src/components/game/CacheSlots.tsx",
    "src/components/game/WaveShop.tsx",
    "src/routes/index.tsx",
    "src/styles.css",
  ];
  for (const f of files) {
    const low = fs.readFileSync(f, "utf8").toLowerCase();
    for (const bad of BAD) ok(!low.includes(bad), `no "${bad}" in ${f}`);
  }
}

// ================= Live section (Playwright) =================
const PZ_URL = process.env.PZ_URL || "http://127.0.0.1:8082";
console.log("\n== live (Playwright): slot machine UI ==");

const { chromium } = await import("playwright-core");
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(PZ_URL, { waitUntil: "networkidle" });
const startBtn = page.getByText("Survival · this place");
await startBtn.waitFor({ state: "visible", timeout: 15000 });
await startBtn.click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 30000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
// Idle player must survive wave 1 while we poke the UI.
await T("god()");

async function toBreak() {
  await T("toBreak()");
  await page.waitForFunction(() => window.__controlsTest.waveInfo().state === "break", null, { timeout: 20000 });
}
const noProbes = () => page.evaluate(() => {
  const ct = window.__controlsTest;
  delete ct.spinSlots;
  delete ct.gambleCache;
  delete ct.slotCost;
  delete ct.fireJackpot;
});
const installProbes = () => page.evaluate(() => {
  const ct = window.__controlsTest;
  window.__forcedSpin = ["seven", "star", "diamond"];
  window.__forcedGamble = true;
  ct.spinSlots = () => window.__forcedSpin;
  ct.gambleCache = () => window.__forcedGamble;
});
const reelSym = (i) => page.getByTestId(`slot-reel-${i}`).getAttribute("data-symbol");

console.log("-- 11b(a). SLOTS button disabled without probe --");
{
  await noProbes();
  await toBreak();
  // Give React a beat to re-render after the probes were deleted.
  await page.waitForTimeout(1200);
  const btn = page.getByTestId("slots-break-btn");
  await btn.waitFor({ state: "visible", timeout: 10000 });
  ok(await btn.isDisabled(), "SLOTS button disabled when spinSlots probe is absent");
  const title = await btn.getAttribute("title");
  ok(!!title && /offline|wiring/i.test(title), `disabled tooltip explains the outage ("${title}")`);
}

console.log("-- 11b(b). modal opens/closes, cost display --");
{
  await installProbes();
  const btn = page.locator('[data-testid="slots-break-btn"]:not([disabled])');
  await btn.waitFor({ state: "visible", timeout: 10000 });
  await btn.click();
  const modal = page.getByTestId("slot-modal");
  await modal.waitFor({ state: "visible", timeout: 5000 });
  ok(true, "slot modal opens from the break-panel SLOTS button");
  const cost = await page.getByTestId("slot-cost").textContent();
  ok(/150 grit \+ escalation/.test(cost || ""), `cost display shows "150 grit + escalation" ("${(cost || "").trim()}")`);
  await page.getByTestId("slot-close").click();
  await modal.waitFor({ state: "detached", timeout: 5000 });
  ok(true, "slot modal closes via the X button");
}

console.log("-- 11b(c). broke-player spin -> graceful message --");
{
  await toBreak().catch(() => {});
  await installProbes();
  const btn = page.locator('[data-testid="slots-break-btn"]:not([disabled])');
  await btn.waitFor({ state: "visible", timeout: 15000 });
  await btn.click();
  await page.getByTestId("slot-modal").waitFor({ state: "visible", timeout: 5000 });
  // Fresh run: grit bag is empty, so the first spin must refuse gracefully.
  await page.getByTestId("slot-spin").click();
  const broke = page.getByTestId("slot-broke");
  await broke.waitFor({ state: "visible", timeout: 5000 });
  ok(/not enough grit/i.test((await broke.textContent()) || ""), "broke spin shows a graceful message, no throw");
}

console.log("-- 11b(d). forced spin: staggered stops + result text --");
{
  await installProbes(); // re-install: never trust the engine lane's real probe
  await page.evaluate(() => { window.__forcedSpin = ["seven", "star", "diamond"]; });
  // Fund the bag through real probes (spawn + sweep), then let React re-render.
  await page.evaluate(() => {
    const ct = window.__controlsTest;
    ct.spawnGritAt(ct.getX(), ct.getY(), 200);
    ct.sweepGrit();
  });
  await page.waitForFunction(() => window.__controlsTest.sys().grit.bag >= 150, null, { timeout: 10000 });
  await page.waitForTimeout(600);
  await page.getByTestId("slot-spin").click();
  // Mid-spin: reel 0 has landed (650ms), reel 2 still shuffling (lands 1450ms).
  await page.waitForTimeout(800);
  eq(await reelSym(0), "seven", "reel 0 stops first with the forced symbol");
  ok((await page.getByTestId("slot-result").count()) === 0, "no result text while reels are still spinning");
  const result = page.getByTestId("slot-result");
  await result.waitFor({ state: "visible", timeout: 8000 });
  const syms = [await reelSym(0), await reelSym(1), await reelSym(2)];
  eq(syms.join(","), "seven,star,diamond", `all reels land on the forced outcome (${syms.join(",")})`);
  ok(((await result.textContent()) || "").length > 0, `result text shown ("${((await result.textContent()) || "").trim()}")`);
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

console.log("-- 11b(e). forced 7-7-7 -> jackpot celebration --");
{
  await installProbes();
  await page.evaluate(() => { window.__forcedSpin = ["seven", "seven", "seven"]; });
  await page.getByTestId("slot-spin").click(); // "Spin again" after the first spin
  const banner = page.getByTestId("slot-jackpot");
  await banner.waitFor({ state: "visible", timeout: 8000 });
  ok(/jackpot/i.test((await banner.textContent()) || ""), "7-7-7 shows the JACKPOT banner");
  ok((await page.getByTestId("slot-jackpot-flash").count()) === 1, "jackpot gold flash plays");
  ok((await page.getByTestId("slot-result").textContent() || "").includes("JACKPOT"), "result text calls out the jackpot");
  await page.getByTestId("slot-close").click();
  await page.getByTestId("slot-modal").waitFor({ state: "detached", timeout: 5000 });
  ok(true, "modal closes after jackpot");
}

console.log("-- 11b(f). double-or-nothing win path --");
{
  await installProbes();
  await page.evaluate(() => { window.__forcedGamble = true; });
  await T("settle()");
  const opened = await page.evaluate(() => {
    const ct = window.__controlsTest;
    const n = ct.dropCache();
    return { n, opened: ct.openNearCache() };
  });
  ok(opened.n >= 1 && opened.opened === true, "cache drops and opens on proximity");
  const prompt = page.getByTestId("cache-gamble-prompt");
  await prompt.waitFor({ state: "visible", timeout: 8000 });
  ok(/take it or gamble/i.test((await prompt.textContent()) || ""), `"Take it or gamble?" prompt shown`);
  ok((await page.getByTestId("cache-gamble").count()) === 1, "Double-or-nothing button present with probe");
  await page.getByTestId("cache-gamble").click();
  const res = page.getByTestId("cache-gamble-result");
  await res.waitFor({ state: "visible", timeout: 5000 });
  eq(await res.getAttribute("data-win"), "true", "forced win reports a win");
  ok(/doubled it/i.test((await res.textContent()) || ""), `"Doubled it" juice shown`);
  // The panel closes itself after the result flash (parent closeCache).
  await prompt.waitFor({ state: "detached", timeout: 8000 });
  ok(true, "cache panel closes after the gamble result");
}

console.log("-- 11b(g). double-or-nothing lose path --");
{
  await installProbes();
  await page.evaluate(() => { window.__forcedGamble = false; });
  await T("settle()");
  await page.evaluate(() => {
    const ct = window.__controlsTest;
    ct.dropCache();
    ct.openNearCache();
  });
  await page.getByTestId("cache-gamble-prompt").waitFor({ state: "visible", timeout: 8000 });
  await page.getByTestId("cache-gamble").click();
  const res = page.getByTestId("cache-gamble-result");
  await res.waitFor({ state: "visible", timeout: 5000 });
  eq(await res.getAttribute("data-win"), "false", "forced loss reports a loss");
  ok(/lost it all/i.test((await res.textContent()) || ""), `"Lost it all" juice shown`);
  await page.getByTestId("cache-gamble-prompt").waitFor({ state: "detached", timeout: 8000 });
  ok(true, "cache panel closes after the loss");
}

console.log("-- 11b(h). no gamble probe -> no double-or-nothing prompt --");
{
  await page.evaluate(() => { delete window.__controlsTest.gambleCache; });
  await T("settle()");
  await page.evaluate(() => {
    const ct = window.__controlsTest;
    ct.dropCache();
    ct.openNearCache();
  });
  // Reels finish, then Take-it-only (no prompt, no gamble button).
  await page.getByTestId("cache-take").waitFor({ state: "visible", timeout: 8000 });
  await page.waitForTimeout(1800);
  ok((await page.getByTestId("cache-gamble-prompt").count()) === 0, "no 'Take it or gamble?' prompt without the probe");
  ok((await page.getByTestId("cache-gamble").count()) === 0, "no Double-or-nothing button without the probe");
  await page.getByTestId("cache-take").click();
  await page.getByTestId("cache-take").waitFor({ state: "detached", timeout: 8000 });
  ok(true, "Take it still resolves and closes the cache");
}

console.log("-- 11b(z). zero page errors --");
ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);

await browser.close();
console.log(`\nbatch11b: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
