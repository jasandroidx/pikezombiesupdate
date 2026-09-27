// Batch 8 (Lane B) — engine render/juice verification.
// Covers: attack squash-and-stretch pulses (player bash + zombie lunge),
// idle bob motion (+ reduce-motion scaling), and the player-death stack
// (hitstop, white flash, 24-particle blood burst, slow-mo cinematic).
// Run: PZ_URL=http://127.0.0.1:8082 node tests/batch8b.mjs
import { chromium } from "playwright-core";

const URL = process.env.PZ_URL || "http://127.0.0.1:8082";
const EXE = "/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra === undefined ? "" : " " + JSON.stringify(extra)}`); }
};

const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

console.log("== batch8b setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").waitFor({ timeout: 60000 });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 60000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("toBreak()");
await T("setKeys([])");

// ---- 1. player bash squash-and-stretch ----
console.log("== 1. bash squash-stretch pulse ==");
{
  const bp = await T("bashPulse()");
  ok("bash attack sets a 50ms pulse timer", bp.ok && bp.atkT === .05, bp);
  // the render applies the pulse on the next frame — fire the bash and capture
  // the peak in one in-page pass (evaluate round-trips are too slow to catch
  // a 50ms pulse at its apex)
  const peak = await page.evaluate(async () => {
    const c = window.__controlsTest;
    c.bashPulse();
    let pk = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 3000) {
      const pr = c.pulseRender();
      if (pr.p.sx > pk) pk = pr.p.sx;
      if (pk > 1.01 && c.atkPulse().p === 0) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    return pk;
  });
  ok("bash renders a 1.15-1.3x stretch pulse", peak >= 1.15 && peak <= 1.3, { peak: +peak.toFixed(3) });
  const ap = await T("atkPulse()");
  ok("player pulse decays to 0 after the beat", ap.p === 0, ap);
}

// ---- 2. zombie lunge stretch ----
console.log("== 2. zombie lunge stretch pulse ==");
{
  // sneak: weapons hold fire so the specimen survives to attack
  await T("setKeys(['ControlLeft'])");
  await page.evaluate(() => {
    const c = window.__controlsTest;
    const g = c.getKit();
    c.spawnTracked("shambler", g.x + 30, g.y);
    c.trackedPin(); // unkillable — melee knockback still applies, death does not
  });
  // the zombie attacks on the first tick (in range, cooldown ready); the
  // render applies the pulse on the next frame — capture the peak in-page
  const peak = await page.evaluate(async () => {
    const c = window.__controlsTest;
    let pk = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 8000) {
      const pr = c.pulseRender();
      if (pr.z.sx > pk) pk = pr.z.sx;
      if (pk > 1.01) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    return pk;
  });
  await T("setKeys([])");
  ok("zombie lunge attack fires a visible pulse", peak > 1.01, { peak: +peak.toFixed(3) });
  ok("zombie peak stretch in the 1.15-1.35x band", peak >= 1.15 && peak <= 1.35, { peak: +peak.toFixed(3) });
}

// ---- 3. idle motion ----
console.log("== 3. idle motion ==");
{
  // helper: sample the idle bob only while the player is stationary;
  // the wave is live so a stray zombie knockback can set the walk bob
  const sampleIdle = async (n) => {
    await T("toBreak()");
    await T("stunAll()");
    await T("setKeys([])");
    await page.waitForFunction(() => !window.__controlsTest.bobState().moving, null, { timeout: 15000 });
    const ss = [];
    for (let i = 0; i < n; i++) {
      const b = await T("bobState()");
      if (!b.moving) ss.push(b.player);
      await page.waitForTimeout(100);
    }
    return ss;
  };
  const ss = await sampleIdle(25);
  const amp = Math.max(...ss) - Math.min(...ss);
  ok("player idle bob oscillates ~2.5px when stationary", ss.length >= 15 && amp > 2.5 && amp < 9, { amp: +amp.toFixed(2), n: ss.length });

  await T("setA11y({ reduceMotion: true })");
  await page.waitForTimeout(400);
  const ms = (await T("bobState()")).ms;
  ok("motionScale reports 0.2 under reduce-motion", ms === .2, { ms });
  const rs = await sampleIdle(25);
  const ampRM = Math.max(...rs) - Math.min(...rs);
  ok("reduce-motion scales the bob down (~20%)", rs.length >= 15 && ampRM > amp * .05 && ampRM < amp * .45,
    { ampRM: +ampRM.toFixed(2), amp: +amp.toFixed(2), n: rs.length });
  await T("setA11y({ reduceMotion: false })");
}
{
  // zombie idle bob: pinned + stunned specimen, weapons held
  await page.evaluate(() => {
    const c = window.__controlsTest;
    const g = c.getKit();
    c.spawnTracked("shambler", g.x + 200, g.y);
    c.trackedPin();
  });
  await T("stunAll()");
  await T("setKeys(['ControlLeft'])");
  await page.waitForTimeout(500);
  const zs = [];
  for (let i = 0; i < 25; i++) { zs.push((await T("bobState()")).zombie); await page.waitForTimeout(100); }
  const zamp = Math.max(...zs) - Math.min(...zs);
  ok("stationary zombie bobs ~2.5px (phase-offset, not dead-still)", zamp > 2 && zamp < 10,
    { zamp: +zamp.toFixed(2) });
  await T("setKeys([])");
}

// ---- 4. player-death stack ----
console.log("== 4. player-death stack ==");
{
  const d0 = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.forceDeath();
    return c.deathState();
  });
  ok("forceDeath kills the player and stops the run", d0.dead && !d0.running, d0);
  ok("hitstop 100-120ms applied at death", d0.hitstop >= .1 && d0.hitstop <= .12, { hitstop: d0.hitstop });
  ok("full-screen white flash armed", d0.flash > .2 && d0.flash <= .25, { flash: d0.flash });
  ok("24-particle blood burst spawned at the player", d0.particles === 24, { particles: d0.particles });
  ok("death cinematic window armed (~0.5s)", d0.cine > .4 && d0.cine <= .6, { cine: d0.cine });

  // wait for the slow-mo beat: hitstop fully decayed, cinematic still running
  await page.waitForFunction(() => {
    const d = window.__controlsTest.deathState();
    return d.hitstop === 0 && d.cine > 0;
  }, null, { timeout: 15000 });
  const d1 = await T("deathState()");
  ok("slow-mo 0.15x during the beat", d1.slowmo === .15, d1);
  // the flash must fade after the hitstop beat (poll — frame rate varies)
  if (d1.flash > 0) {
    await page.waitForFunction((f1) => window.__controlsTest.deathState().flash < f1, d1.flash, { timeout: 15000 });
  }
  const d1b = await T("deathState()");
  ok("flash fades across the beat", d1b.flash < d1.flash, { before: d1.flash, after: d1b.flash });
  // cinematic winds down on its own
  await page.waitForFunction(() => {
    const d = window.__controlsTest.deathState();
    return d.cine === 0 && d.flash === 0;
  }, null, { timeout: 15000 });
  ok("cinematic winds down cleanly", true);

  // React death screen still fires immediately with the right payload
  await page.getByRole("heading", { name: "OVERRUN" }).waitFor({ timeout: 15000 });
  const bodyText = await page.evaluate(() => document.body.innerText);
  ok("death screen fires (React side)", bodyText.includes("OVERRUN") && bodyText.includes("FINAL SCORE"));
  // the shambler death line is the default template ("Overrun at ...") — the
  // killer type itself isn't rendered verbatim, but the line must be present
  ok("death line rendered for the killer", /overrun at/i.test(bodyText));
  const payload = await T("lastGameOver()");
  ok("death payload intact (stats, score, killer)", !!payload && payload.killer === "shambler" && typeof payload.score === "number",
    payload && { killer: payload.killer, score: payload.score });
}

// ---- 5. naming + page errors ----
console.log("== 5. naming + page errors ==");
{
  const bodyText = await page.evaluate(() => document.body.innerText);
  const src = await page.evaluate(() => document.documentElement.innerHTML.slice(0, 200000));
  const hay = bodyText + "\n" + src;
  // forbidden out-of-county place names must not appear anywhere (built
  // without literals so the test itself stays clean)
  const forbidden = [["Bayv", "ille"], ["Griggsv", "ille"], ["Illin", "ois"]].map((p) => p.join(""));
  const hits = forbidden.filter((w) => hay.includes(w));
  ok("no forbidden out-of-county place names in UI text", hits.length === 0, hits);
  ok("0 page errors", pageErrors.length === 0, pageErrors.slice(0, 3));
}

console.log(`\nbatch8b: ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
