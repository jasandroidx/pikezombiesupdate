import { chromium } from "playwright-core";

const URL = process.env.PZ_URL || "http://127.0.0.1:8085";
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

console.log("== batch3 setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("toBreak()");

console.log("== 1. volatile aura ==");
const aura = await page.evaluate(async () => {
  const c = window.__controlsTest;
  c.giveBoon("aura", 2);
  const st = c.auraState();
  const px = c.playerPos().x, py = c.playerPos().y;
  const zi = c.spawnAt("shambler", px, py + 60); // inside R=112
  const max = c.zMax(zi);
  await new Promise((r) => setTimeout(r, 1200));
  return { st, h: c.zHealth(zi), max };
});
ok("aura radius scales with rank", aura.st.stacks === 2 && aura.st.r === 112, JSON.stringify(aura.st));
ok("aura burns zombies inside the field", aura.h < aura.max, JSON.stringify(aura));

console.log("== 2. ability lockout ==");
const lock = await page.evaluate(() => {
  const c = window.__controlsTest;
  const r1 = c.forceDraftTake("aura");
  return { locked: r1.locked, stacks: r1.stacks };
});
ok("taking aura locks out ring", lock.locked.includes("ring"), JSON.stringify(lock));

console.log("== 3. bomber explosion falloff ==");
const bfall = await page.evaluate(() => {
  const c = window.__controlsTest;
  const px = c.playerPos().x, py = c.playerPos().y;
  const ni = c.spawnAt("miner_brute", px, py + 175); // 25 from bomber
  const fi = c.spawnAt("miner_brute", px, py + 245); // 95 from bomber
  const bi = c.spawnAt("bomber", px, py + 150); // spawn last: removal won't shift indices
  const nMax = c.zMax(ni), fMax = c.zMax(fi);
  c.killAt(bi);
  return { nDmg: nMax - c.zHealth(ni), fDmg: fMax - c.zHealth(fi) };
});
ok("bomber blast hurts center more than edge", bfall.nDmg > bfall.fDmg && bfall.fDmg >= 0, JSON.stringify(bfall));

console.log("== 4. B-bomb falloff ==");
const bbfall = await page.evaluate(() => {
  const c = window.__controlsTest;
  const px = c.playerPos().x, py = c.playerPos().y;
  const R = c.bombRadius();
  const ni = c.spawnAt("miner_brute", px, py + 60);
  const fi = c.spawnAt("miner_brute", px, py + R - 20);
  const nMax = c.zMax(ni), fMax = c.zMax(fi);
  c.detonate();
  return { nDmg: nMax - c.zHealth(ni), fDmg: fMax - c.zHealth(fi), R };
});
ok("B-bomb deals falloff damage", bbfall.nDmg > bbfall.fDmg && bbfall.fDmg > 0, JSON.stringify(bbfall));

console.log("== 5. flanking director ==");
const flank = await page.evaluate(async () => {
  const c = window.__controlsTest;
  const px = c.playerPos().x, py = c.playerPos().y;
  const ids = [];
  for (let k = 0; k < 8; k++) ids.push(c.spawnAt("shambler", px + (k % 2) * 40, py + 120 + k * 15));
  await new Promise((r) => setTimeout(r, 1200)); // let AI engage to chase
  const flanked = c.runFlank();
  return { flanked };
});
ok("director peels flankers off the horde", flank.flanked >= 1 && flank.flanked <= 6, JSON.stringify(flank));

console.log("== 6. dasher sprinters ==");
const dash = await page.evaluate(async () => {
  const c = window.__controlsTest;
  c.giveBoon("aura", -10); // fully strip aura (clamped at 0): the specimen must not die mid-test
  c.settle();
  const px = c.playerPos().x, py = c.playerPos().y;
  c.spawnTracked("sprinter", px, py + 200);
  c.trackedPin(); // pin health: dash assertion must measure dashing, not ambient combat
  await new Promise((r) => setTimeout(r, 2600));
  const d = c.trackedDash();
  return { d };
});
ok("sprinter dashes when in range", dash.d && dash.d.alive && dash.d.cd < 3.5, JSON.stringify(dash));

console.log("== 7. elite howl alerts ==");
const howl = await page.evaluate(async () => {
  const c = window.__controlsTest;
  const px = c.playerPos().x, py = c.playerPos().y;
  const wi = c.spawnAt("shambler", px, py + 400); // wandering, far
  const aiBefore = c.zAi(wi);
  c.realAffix("sprinter"); // assignAffix howls and alerts
  await new Promise((r) => setTimeout(r, 300));
  return { aiBefore, aiAfter: c.zAi(wi) };
});
ok("elite howl snaps nearby zombies to chase", howl.aiAfter === "chase" || howl.aiAfter === "investigate", JSON.stringify(howl));

console.log("== 8. enemy cull ==");
const cull = await page.evaluate(() => {
  const c = window.__controlsTest;
  const px = c.playerPos().x, py = c.playerPos().y;
  // deterministic: track the far zombie itself and assert IT was recycled,
  // instead of comparing global counts (ambient combat made that flaky).
  c.spawnTracked("shambler", px + 2000, py); // past 1400u cull radius
  const aliveBefore = c.trackedAlive();
  c.runCull();
  return { aliveBefore, aliveAfter: c.trackedAlive() };
});
ok("far zombies get recycled", cull.aliveBefore && !cull.aliveAfter, JSON.stringify(cull));

console.log("== 9. shell casings ==");
const cas = await T("fireOnce()");
ok("firing ejects a casing particle", cas >= 1, `casings=${cas}`);

console.log("== 10. spawn pop ==");
const pop = await page.evaluate(async () => {
  const c = window.__controlsTest;
  c.giveBoon("aura", -10); // ensure no aura remnant burns wanderers into XP drafts
  c.settle();
  const px = c.playerPos().x, py = c.playerPos().y;
  c.spawnTracked("shambler", px, py + 300);
  c.trackedPin(); // pin the specimen's health: the pop assertion must measure pop, not ambient combat
  const t0 = c.trackedSpawnT();
  // robust: drive settle() until no draft/pause remains AND the pop timer drains.
  // Queued drafts re-pause ~3s apart, so keep settling; bounded so a real
  // regression fails loudly instead of hanging.
  let t1 = t0, guard = 0, st = c.runState();
  while ((t1 > 0 || st.draft || st.paused) && guard++ < 60) {
    c.settle();
    await new Promise((r) => setTimeout(r, 200));
    t1 = c.trackedSpawnT();
    st = c.runState();
  }
  return { t0, t1, alive: c.trackedAlive(), guard, paused: st.paused, draft: st.draft };
});
ok("zombies pop in instead of appearing", pop.alive && pop.t0 > 0 && pop.t1 <= 0, JSON.stringify(pop));

console.log(`\nbatch3: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
if (errors.length) console.log("page errors:", errors.slice(0, 3));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
