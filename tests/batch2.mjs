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

console.log("== batch2 setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("toBreak()");

console.log("== 1. mass-based knockback ==");
const kb = await page.evaluate(() => {
  const c = window.__controlsTest;
  return {
    behemoth: c.knockbackFor("shotgun", "behemoth"),
    crawler: c.knockbackFor("shotgun", "crawler"),
    brute: c.knockbackFor("shotgun", "miner_brute"),
    shambler: c.knockbackFor("revolver", "shambler"),
    massB: c.zombieMass("behemoth"),
    massC: c.zombieMass("crawler"),
  };
});
ok("behemoth barely budges", kb.behemoth < 2, JSON.stringify(kb));
ok("crawler flies", kb.crawler > 8, JSON.stringify(kb));
ok("mass orders knockback", kb.crawler > kb.shambler && kb.shambler > kb.behemoth);
ok("mass table sane", kb.massB === 4.2 && kb.massC === 0.7);

console.log("== 2. forking rounds ==");
const fork = await page.evaluate(async () => {
  const c = window.__controlsTest;
  c.clearBullets();
  c.giveBoon("fork", 2);
  const px = c.playerPos().x, py = c.playerPos().y;
  const zi = c.spawnAt("miner_brute", px + 130, py); // tough: survives the hit
  const max = c.zMax(zi);
  c.spawnBulletAt(px, py, 420, 0, 40, "shotgun"); // straight at the zombie; shotgun links fork [scatter]
  await new Promise((r) => setTimeout(r, 450)); // hit lands ~0.3s; children live ~0.5s
  return { bullets: c.bulletCount(), h: c.zHealth(zi), max };
});
ok("fork hits the target", fork.h < fork.max, JSON.stringify(fork));
ok("fork spawns spectral children", fork.bullets >= 1, JSON.stringify(fork));

console.log("== 3. ricochet ==");
const rico = await page.evaluate(async () => {
  const c = window.__controlsTest;
  c.clearBullets();
  c.giveBoon("fork", -2); // undo fork so it doesn't muddy the test
  c.giveBoon("ricochet", 2);
  const px = c.playerPos().x, py = c.playerPos().y;
  const z1 = c.spawnAt("shambler", px + 90, py);
  const z2 = c.spawnAt("shambler", px + 200, py);
  const h1 = c.zMax(z1), h2 = c.zMax(z2);
  c.spawnBulletAt(px, py, 420, 0, 60); // pierce 1, aimed at z1
  await new Promise((r) => setTimeout(r, 900));
  return { h1: c.zHealth(z1), h1max: h1, h2: c.zHealth(z2), h2max: h2 };
});
ok("ricochet damages first target", rico.h1 < rico.h1max, JSON.stringify(rico));
ok("ricochet bounces to second target", rico.h2 < rico.h2max, JSON.stringify(rico));

console.log("== 4. heatseeker ==");
const seek = await page.evaluate(async () => {
  const c = window.__controlsTest;
  c.clearBullets();
  c.giveBoon("ricochet", -2);
  c.giveBoon("seeker", 1);
  const px = c.playerPos().x, py = c.playerPos().y;
  const zi = c.spawnAt("shambler", px + 160, py);
  const max = c.zMax(zi);
  // aim 0.2 rad high — would miss a dumb round
  c.spawnBulletAt(px, py, 420 * Math.cos(0.2), 420 * Math.sin(0.2), 60);
  await new Promise((r) => setTimeout(r, 900));
  return { h: c.zHealth(zi), max };
});
ok("heatseeker curves into the target", seek.h < seek.max, JSON.stringify(seek));

console.log("== 5. breakpoint bonuses ==");
const bp = await page.evaluate(() => {
  const c = window.__controlsTest;
  for (let i = 0; i < 6; i++) c.takeBoonDirect("lead");
  for (let i = 0; i < 6; i++) c.takeBoonDirect("trigger");
  for (let i = 0; i < 6; i++) c.takeBoonDirect("ring");
  for (let i = 0; i < 6; i++) c.takeBoonDirect("bone");
  for (let i = 0; i < 6; i++) c.takeBoonDirect("storm");
  const b = c.bp();
  c.takeBoonDirect("lead"); // 7th rank: must not double-apply
  const b2 = c.bp();
  return { b, b2 };
});
ok("lead breakpoint +30% damage", bp.b.dmg === 1.3, JSON.stringify(bp));
ok("trigger breakpoint faster fire", bp.b.fire === 0.85, JSON.stringify(bp));
ok("ring breakpoint +2 orbiters", bp.b.orb === 2, JSON.stringify(bp));
ok("bone breakpoint +40% blast", bp.b.blast === 1.4, JSON.stringify(bp));
ok("storm breakpoint +2 chains", bp.b.chains === 2, JSON.stringify(bp));
ok("breakpoint applies once", bp.b2.dmg === 1.3);

console.log("== 6. elite affixes ==");
const aff = await page.evaluate(async () => {
  const c = window.__controlsTest;
  const px = c.playerPos().x, py = c.playerPos().y;
  // volatile: pops and hurts neighbors
  const vi = c.forceAffix("sprinter", "volatile");
  const n1 = c.spawnAt("shambler", px + 160, py);
  const n2 = c.spawnAt("shambler", px + 200, py + 20);
  const m1 = c.zMax(n1), m2 = c.zMax(n2);
  c.killAt(vi);
  await new Promise((r) => setTimeout(r, 200));
  const splash = c.zHealth(n1) < m1 || c.zHealth(n2) < m2;
  // shielded: has a shield pool
  const si = c.forceAffix("shambler", "shielded");
  const shielded = c.zAffix(si) === "shielded";
  // frosted: chills the player on hit
  const fi = c.forceAffix("shambler", "frosted");
  c.hurtBy(fi);
  const chilled = c.chillState();
  // swift / vampiric / leaping assign cleanly
  const swi = c.forceAffix("shambler", "swift");
  const vi2 = c.forceAffix("shambler", "vampiric");
  const li = c.forceAffix("shambler", "leaping");
  // guaranteed elite gets a random legal affix
  const g = c.spawnElite2();
  const legal = ["volatile", "vampiric", "leaping", "shielded", "swift", "frosted"].includes(g.affix);
  return { splash, shielded, chilled, sw: c.zAffix(swi), va: c.zAffix(vi2), le: c.zAffix(li), legal, gAffix: g.affix };
});
ok("volatile pops and splashes neighbors", aff.splash, JSON.stringify(aff));
ok("shielded affix assigned", aff.shielded);
ok("frosted chills the player", aff.chilled);
ok("swift/vampiric/leaping assign", aff.sw === "swift" && aff.va === "vampiric" && aff.le === "leaping");
ok("guaranteed elite rolls a legal affix", aff.legal, aff.gAffix);

console.log("== 7. splitter bloaters ==");
const split = await page.evaluate(() => {
  const c = window.__controlsTest;
  const px = c.playerPos().x, py = c.playerPos().y;
  const before = c.zCount();
  const bi = c.spawnAt("bloater_spitter", px + 150, py);
  c.killAt(bi);
  const after = c.zCount();
  return { before, after };
});
ok("bloater pops into 2 crawlers", split.after === split.before + 2, JSON.stringify(split));

console.log("== 8. boss banner ==");
const boss = await T("bossBanner()");
ok("behemoth triggers THE BEHEMOTH banner", boss.text === "THE BEHEMOTH" && boss.live, JSON.stringify(boss));

console.log("== 9. kill pitch + heartbeat paths ==");
const paths = await page.evaluate(async () => {
  const c = window.__controlsTest;
  c.killOne("shambler"); // exercises pitched kill layer
  c.hurtMe(9999);        // drop player low
  await new Promise((r) => setTimeout(r, 1300)); // heartbeat window
  return { alive: c.playerPos() !== null };
});
ok("kill pitch + low-HP heartbeat run clean", paths.alive);

console.log(`\nbatch2: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
if (errors.length) console.log("page errors:", errors.slice(0, 3));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
