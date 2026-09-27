import { chromium } from "playwright-core";

// Batch 16 — Lane 3 (GameObject contract adoption for pickups).
// Drop lifecycle, registry dispatch, and dust-devil vacuum behavior.
// Run with: PZ_URL=http://127.0.0.1:8082 node tests/batch16c.mjs
const URL = process.env.PZ_URL || "http://127.0.0.1:8082";
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

console.log("== batch16c setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
await page.evaluate(() => { const c = window.__controlsTest; c.god(); c.toBreak(); });

console.log("== 1. drop lifecycle: magnet, collect, far drop persists ==");
const life = await page.evaluate(() => {
  const c = window.__controlsTest;
  const pz = window.__pzPickups;
  c.toBreak();
  const px = c.playerPos().x, py = c.playerPos().y;
  const drops = pz.drops();
  const scrapBefore = c.sys().shop.scrap;
  // Nearby scrap drop: magnet pulls it in, collection pays +25 scrap and
  // removes it from the same array. (eng.drops has no grit-paying type;
  // grit orbs live in eng.grit under updateGrit — a different lane.)
  const near = { id: `t16c-near`, type: `scrap`, x: px + 150, y: py, amount: 25, duration: 3e4 };
  drops.push(near);
  const x0 = near.x;
  pz.updateDrops(1 / 60);
  const x1 = near.x;
  for (let i = 0; i < 200 && drops.includes(near); i++) pz.updateDrops(1 / 60);
  pz.updateDrops(); // default dt path (1/60), signature unchanged
  const scrapAfter = c.sys().shop.scrap;
  // Far drop: beyond magnet range. Drops have no lifetime/expiry in this
  // build — they persist until collected. Assert it sits untouched.
  const far = { id: `t16c-far`, type: `scrap`, x: px + 3000, y: py, amount: 25, duration: 3e4 };
  drops.push(far);
  const fx0 = far.x;
  for (let i = 0; i < 120; i++) pz.updateDrops(1 / 60);
  const farStill = drops.includes(far);
  const fx1 = far.x;
  if (farStill) drops.splice(drops.indexOf(far), 1); // cleanup
  return { x0, x1, collected: !drops.includes(near), scrapDelta: scrapAfter - scrapBefore, farStill, fx0, fx1 };
});
ok("magnet pulls a nearby scrap drop toward the player", life.x1 < life.x0, JSON.stringify({ x0: life.x0, x1: life.x1 }));
ok("nearby drop is collected and removed from eng.drops", life.collected === true, JSON.stringify({ collected: life.collected }));
ok("collection pays out +25 scrap", life.scrapDelta === 25, JSON.stringify({ scrapDelta: life.scrapDelta }));
ok("far drop is untouched by the magnet and does not expire", life.farStill === true && life.fx1 === life.fx0, JSON.stringify({ farStill: life.farStill, fx0: life.fx0, fx1: life.fx1 }));

console.log("== 2. registry dispatch over the live drops array ==");
const reg = await page.evaluate(() => {
  const c = window.__controlsTest;
  const reg = window.__pzRegistry;
  const pz = window.__pzPickups;
  const drops = pz.drops();
  const px = c.playerPos().x, py = c.playerPos().y;
  // Seed engine-drawn types far away so collection can't fire during dispatch.
  const dd = { id: `t16c-dd`, type: `dust_devil`, x: px + 3000, y: py + 100, amount: 1, duration: 3e4 };
  const ss = { id: `t16c-ss`, type: `score_surge`, x: px + 3000, y: py + 200, amount: 1, duration: 3e4 };
  drops.push(dd, ss);
  let updateThrew = null, drawThrew = null;
  try { reg.updateKind(`pickup`, drops, 1 / 60); } catch (e) { updateThrew = String(e && e.message || e); }
  const cv = document.createElement(`canvas`);
  const cam = { x: px, y: py, zoom: 1, width: 1280, height: 800, ctx: cv.getContext(`2d`) };
  try { reg.drawKind(`pickup`, drops, cam); } catch (e) { drawThrew = String(e && e.message || e); }
  const sameArray = pz.drops() === drops;
  const lenOk = drops.includes(dd) && drops.includes(ss); // dispatch never removes
  drops.splice(drops.indexOf(dd), 1);
  drops.splice(drops.indexOf(ss), 1);
  // Adoption stubs throw loudly and name the owning module.
  let zombieMsg = null, bulletMsg = null, particleMsg = null, floaterMsg = null;
  try { reg.updateOne(`zombie`, {}, 1 / 60); } catch (e) { zombieMsg = String(e && e.message || e); }
  try { reg.drawKind(`bullet`, [{}], cam); } catch (e) { bulletMsg = String(e && e.message || e); }
  try { reg.updateKind(`particle`, [{}], 1 / 60); } catch (e) { particleMsg = String(e && e.message || e); }
  try { reg.drawKind(`floater`, [{}], cam); } catch (e) { floaterMsg = String(e && e.message || e); }
  return { registered: reg.isRegistered(`pickup`), updateThrew, drawThrew, sameArray, lenOk, zombieMsg, bulletMsg, particleMsg, floaterMsg };
});
ok("pickup kind is registered", reg.registered === true);
ok("updateKind over live drops does not throw", !reg.updateThrew, reg.updateThrew || "");
ok("drawKind over live drops does not throw", !reg.drawThrew, reg.drawThrew || "");
ok("drops array identity intact after dispatch", reg.sameArray === true && reg.lenOk === true, JSON.stringify({ sameArray: reg.sameArray, lenOk: reg.lenOk }));
ok("zombie stub throws naming zombies.ts", /zombies\.ts/.test(reg.zombieMsg || ""), reg.zombieMsg || "");
ok("bullet stub throws naming combat.ts", /combat\.ts/.test(reg.bulletMsg || ""), reg.bulletMsg || "");
ok("particle stub throws naming juice.ts", /juice\.ts/.test(reg.particleMsg || ""), reg.particleMsg || "");
ok("floater stub throws naming juice.ts", /juice\.ts/.test(reg.floaterMsg || ""), reg.floaterMsg || "");

console.log("== 3. dust-devil vacuum behavior unchanged ==");
const vac = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  const n = c.dropVacuum();
  const surge = c.eatVacuum();
  const st = c.vacuumState();
  return { n, surge, st };
});
ok("dropVacuum spawns a dust devil", vac.n === 1, JSON.stringify({ n: vac.n }));
ok("eating the dust devil starts the 1.6s surge", vac.surge === 1.6, JSON.stringify({ surge: vac.surge }));
ok("dust devil drop is consumed from eng.drops", vac.st.drops === 0, JSON.stringify(vac.st));

console.log(`\nbatch16c: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
if (errors.length) console.log("page errors:", errors.slice(0, 5));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
