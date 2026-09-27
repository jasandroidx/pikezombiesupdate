import { chromium } from "playwright-core";

// Lane A (combat/weapons/director) — Batch 4: nova burst, homing missiles,
// vacuum pickup, D(t) director, swept bullet collision.
const URL = process.env.PZ_URL || "http://127.0.0.1:8091";
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

console.log("== batch4a setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("toBreak()");

console.log("== 1. nova burst (Still-Yard Burst) ==");
const nova = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.clearBullets();
  c.giveBoon("nova", 2);
  const st = c.novaState();
  const n = c.fireNova();          // exact delta: only this call's rounds
  const info = c.novaInfo();
  return { st, n, info };
});
ok("nova stacks register", nova.st.stacks === 2, JSON.stringify(nova.st));
ok("nova fires 5+2*rank radial rounds", nova.n === 9, JSON.stringify({ n: nova.n }));
ok("nova rounds carry rank damage and speed", nova.info.length === 9 && nova.info.every((b) => b.dmg === 20 && b.sp === 14), JSON.stringify(nova.info.slice(0, 2)));

console.log("== 2. homing missiles (Canary rockets) ==");
const mis = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.clearBullets();
  c.giveBoon("missiles", 1);
  const st = c.missileState();
  const px = c.playerPos().x, py = c.playerPos().y;
  c.spawnTracked("shambler", px, py + 250); // due south; missile launches due north
  c.trackedPin();                          // pin: steering assertion must not measure ambient combat
  c.rehash();                              // game loop rebuilds the hash each frame; sync test must do it too
  const launched = c.fireMissiles();
  c.stepBullets(30);                       // 0.5s at 2.4 rad/s turn rate
  const ang = c.missileAng();
  return { st, launched, ang };
});
ok("missile boon stacks", mis.st.stacks === 1, JSON.stringify(mis.st));
ok("rank-1 salvo launches one missile", mis.launched === 1, JSON.stringify({ launched: mis.launched }));
ok("missile steers toward the zombie", mis.ang !== null && mis.ang > -0.6, JSON.stringify({ ang: mis.ang }));

console.log("== 3. missile AoE ==");
const aoe = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.clearBullets();
  const px = c.playerPos().x, py = c.playerPos().y;
  const far = c.spawnAt("shambler", px + 500, py);  // spawn far first: indices stay stable
  const near = c.spawnAt("shambler", px + 40, py);
  const fMax = c.zMax(far), nMax = c.zMax(near);
  c.fireMissiles();   // missile sits at the player; synchronous, no rAF interleave
  c.boomMissile();
  return { fH: c.zHealth(far), fMax, nH: c.zHealth(near), nMax };
});
ok("missile blast hurts the close zombie", aoe.nH < aoe.nMax, JSON.stringify(aoe));
ok("missile blast spares the far zombie", aoe.fH === aoe.fMax, JSON.stringify(aoe));

console.log("== 4. vacuum pickup (Dust Devil) ==");
const vac = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.clearBullets();
  const px = c.playerPos().x, py = c.playerPos().y;
  for (let i = 0; i < 4; i++) c.spawnGritAt(px + 200 + i * 30, py, 1);
  const before = c.vacuumState();
  c.dropVacuum();
  const surge = c.eatVacuum();
  const left = c.stepGrit(120);
  const after = c.vacuumState();
  return { before, surge, left, after };
});
ok("grit sits on the ground before pickup", vac.before.grit === 4, JSON.stringify(vac.before));
ok("eating the dust devil starts the surge", vac.surge > 1, JSON.stringify({ surge: vac.surge }));
ok("surge vacuums every orb to the player", vac.left === 0 && vac.after.xp === vac.before.xp + 4, JSON.stringify({ left: vac.left, xp0: vac.before.xp, xp1: vac.after.xp }));

console.log("== 5. D(t) director + fixed mini-boss marks ==");
const dir = await page.evaluate(() => {
  const c = window.__controlsTest;
  const st = c.directorState();
  const m0 = c.timeMulAt(0), m240 = c.timeMulAt(240), m720 = c.timeMulAt(720);
  const win7 = c.windowFor(7);
  const mark = c.fireMark(0);
  return { st, m0, m240, m720, win7, mark };
});
ok("D(t) starts at 1.0 and rises smoothly, capped", dir.m0 === 1 && dir.m240 > 1 && dir.m720 > dir.m240 && dir.m720 < 1.86, JSON.stringify({ m0: dir.m0, m240: dir.m240, m720: dir.m720 }));
ok("VS-2 named windows are untouched", dir.win7 === "The Hartwell Shift", JSON.stringify({ win7: dir.win7 }));
ok("marks are 4:00/8:00/12:00, none fired early", dir.st.marks.length === 3 && dir.st.marks[0].at === 240 && dir.st.marks.every((m) => !m.fired), JSON.stringify(dir.st.marks));
ok("fixed mark fires a guaranteed mini-boss elite", dir.mark.fired && dir.mark.elites >= 1, JSON.stringify(dir.mark));

console.log("== 6. swept bullet collision ==");
const sw = await page.evaluate(() => {
  const c = window.__controlsTest;
  const through = c.sweepCheck(0, 0, 100, 0, 3, 50, 0, 17);  // segment crosses the circle
  const wide = c.sweepCheck(0, 0, 100, 0, 3, 50, 60, 17);    // passes wide
  const short = c.sweepCheck(0, 0, 10, 0, 3, 50, 0, 17);     // never reaches
  const e2e = c.sweepProbe();                                 // 6000 u/s round, one frame skips a shambler
  return { through, wide, short, e2e };
});
ok("segment crossing a zombie hits", sw.through === true, JSON.stringify({ through: sw.through }));
ok("segment passing wide misses", sw.wide === false, JSON.stringify({ wide: sw.wide }));
ok("short segment misses", sw.short === false, JSON.stringify({ short: sw.short }));
ok("fast round cannot tunnel the zombie", sw.e2e.hit === true, JSON.stringify(sw.e2e));

console.log(`\nbatch4a: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
if (errors.length) console.log("page errors:", errors.slice(0, 5));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
