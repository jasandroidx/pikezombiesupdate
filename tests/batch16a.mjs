import { chromium } from "playwright-core";

// Lane 1 — Batch 16: fixed-timestep simulation + symplectic Euler audit.
const URL = process.env.PZ_URL || "http://127.0.0.1:8082";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

// ---- Part 1: jiti unit test of accumulateSteps ----
console.log("== 1. accumulateSteps unit (jiti) ==");
const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url);
const { accumulateSteps, FIXED_DT, MAX_STEPS } = await jiti.import("/home/hatch/pzrepo/src/game/sim/timestep.ts");
ok("FIXED_DT is 1/60", FIXED_DT === 1 / 60, String(FIXED_DT));
ok("MAX_STEPS is 6", MAX_STEPS === 6, String(MAX_STEPS));

const dts = [1 / 60, 1 / 60, 1 / 30, 0.1, 0.5];
const want = [1, 1, 2, 6, 6];
dts.forEach((dt, i) => {
  const r = accumulateSteps(0, dt);
  ok(`frame dt ${dt.toFixed(4)} -> ${want[i]} step(s)`, r.steps === want[i], `got ${r.steps}`);
  ok(`remainder acc < FIXED_DT for dt ${dt.toFixed(4)}`, r.acc < FIXED_DT, `acc=${r.acc}`);
  // determinism: same input -> same output, twice
  const r2 = accumulateSteps(0, dt);
  ok(`deterministic for dt ${dt.toFixed(4)}`, r.steps === r2.steps && r.acc === r2.acc);
});

// spiral-of-death: huge dt is capped, excess dropped (not queued)
const big = accumulateSteps(0, 0.5);
ok("0.5s frame drops excess beyond the cap", big.steps === 6 && big.acc < FIXED_DT, JSON.stringify(big));
// remainder carries across frames: 0.01 + 1/30 accumulates to 2 steps with correct leftover
{
  let s = accumulateSteps(0, 0.01);
  ok("partial frame steps 0", s.steps === 0, JSON.stringify(s));
  s = accumulateSteps(s.acc, 1 / 30);
  const expect2 = Math.abs((0.01 + 1 / 30) - 2 * FIXED_DT);
  ok("partial remainder carries into next frame (2 steps)", s.steps === 2 && Math.abs(s.acc - expect2) < 1e-9, JSON.stringify(s));
}

// ---- Part 2: browser smoke — the rewritten loop keeps the sim running ----
console.log("== 2. loop-rewrite browser smoke ==");
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
const startBtn = page.getByText("Survival · this place");
await startBtn.waitFor({ timeout: 30000 });
for (let i = 0; i < 12 && !(await page.evaluate(() => !!window.__controlsTest)); i++) {
  await startBtn.click();
  await page.waitForTimeout(2500);
}
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 30000 });
ok("probe harness comes up after loop rewrite", true);
await page.evaluate(() => { window.__controlsTest.god(); window.__controlsTest.toBreak(); window.__controlsTest.skipBreak(); });
const sim0 = await page.evaluate(() => window.__controlsTest.tsInfo().sim);
await page.waitForTimeout(2000); // wall time
const info = await page.evaluate(() => window.__controlsTest.tsInfo());
ok("simTime advances via fixed-step loop (sim > 0 after 2s)", info.sim > sim0 && info.sim > 0, JSON.stringify({ sim0, info }));
ok("tsInfo reports the fixed dt contract", info.fixedDt === 1 / 60, JSON.stringify(info));
ok("accumulator drains to a sub-step remainder", info.acc >= 0 && info.acc < 1 / 60, JSON.stringify(info));
// loop still renders without killing the tab: canvas present, RAF alive
const alive = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  return { canvas: !!c, w: c ? c.width : 0 };
});
ok("canvas renders under the new loop", alive.canvas && alive.w > 0, JSON.stringify(alive));
// fixed-step signature: simTime after 2s wall should be within a step budget of wall time
// (slow-mo can lower it; it must never exceed wall+budget and must be > half the wall).
// fixed-step signature: simTime delta over 2s wall should track wall clock
// (slow-mo can lower it; it must never exceed wall+budget and must advance).
const delta = info.sim - sim0;
ok("sim tracks wall-clock (no step pileup or stall)", delta > 0.5 && delta <= 2.3, `sim0=${sim0} sim=${info.sim} delta=${delta.toFixed(2)}`);
await browser.close();
ok("zero page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(`batch16a: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
