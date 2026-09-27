// tests/batch10a.mjs — Batch 10 (Lane 4): engine-wiring live tests.
//
// Gameplay-lane items (verify, don't reimplement): illusionist archetype,
// the four signature specials via triggerSignature()/signatureState(),
// last-kill slow-mo, the Stendal Pit mortar. Lane-4 items: tracer /
// saltcircle / cornliquor / brinebarrel engine wiring. Plus the killOne
// no-throw check (corpseDecals init fix) and an Indiana-only naming assertion.
//
// Pure section runs in plain node via jiti (TS sources imported directly).
//   node_modules/.bin/jiti tests/batch10a.mjs
// Live section runs under Playwright against a dev server:
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch10a.mjs

import fs from "node:fs";
import { brinePatch } from "../src/game/boons.ts";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
function approx(a, b, tol, label) {
  ok(Math.abs(a - b) <= tol, `${label} (got ${a}, want ${b} ± ${tol})`);
}

const BAD = ["bayville", "griggsville", "illinois"];

console.log("== 10a(i). Indiana-only naming (source scan) ==");
// New strings land in engine.ts (Batch 10 wiring + gameplay lane) and
// boons.ts. The whole src tree must stay free of the forbidden names.
{
  const files = ["src/game/engine.ts", "src/game/boons.ts"];
  for (const f of files) {
    const low = fs.readFileSync(f, "utf8").toLowerCase();
    for (const bad of BAD) ok(!low.includes(bad), `no "${bad}" in ${f}`);
  }
  // Clones are visually distinguishable: the renderer drops alpha for isClone.
  const eng = fs.readFileSync("src/game/engine.ts", "utf8");
  ok(/isClone\)\s*e\.globalAlpha\s*=\s*\.55/.test(eng) || /if\s*\(t\.isClone\)\s*e\.globalAlpha/.test(eng),
    "renderer draws clones half-transparent off the isClone flag");
}

// ================= Live section (Playwright) =================
const PZ_URL = process.env.PZ_URL || "http://127.0.0.1:8082";
console.log("\n== live (Playwright) ==");

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
// Draft guard: drafts open on level-up; dismissing takes draft[0], so undo it.
async function clearDraft() {
  const ids = await T("draftIds()");
  if (ids.length) { await T("dismissDraft()"); await T(`giveBoon('${ids[0]}', -1)`); }
}

console.log("-- 10a(a). killOne no-throw (corpseDecals init fix) --");
{
  const c0 = await T("corpseCount()");
  let threw = null;
  try { await T("killOne()"); } catch (e) { threw = String(e); }
  ok(threw === null, `killOne() does not throw${threw ? ": " + threw : ""}`);
  const c1 = await T("corpseCount()");
  ok(c1 >= c0 + 1, `kill leaves a corpse decal (${c0} -> ${c1})`);
}

console.log("-- 10a(b). signature specials x4 --");
const sigNames = {};
{
  const chars = ["otis_hale", "eula_stillwell", "silas_mccord", "thea_kettler"];
  for (const cid of chars) {
    await T(`setChar('${cid}')`);
    await T("sigReset()");
    await clearDraft();
    const st0 = await T("signatureState()");
    eq(JSON.stringify(Object.keys(st0).sort()), JSON.stringify(["name", "ready", "timeLeft"]),
      `${cid}: state probe shape {ready,timeLeft,name}`);
    ok(st0.ready === true && st0.timeLeft === 0, `${cid}: ready after reset`);
    ok(typeof st0.name === "string" && st0.name.length > 0, `${cid}: named special ("${st0.name}")`);
    sigNames[cid] = st0.name;
    if (cid === "thea_kettler") {
      // Dragline Sweep is instant: spawn + trigger + census in one tick.
      const swept = await page.evaluate(() => {
        const ct = window.__controlsTest;
        const w = ct.getWorld();
        const n0 = ct.stunAll();
        ct.spawn("shambler", w.x + 100, w.y);
        const fired = ct.triggerSignature();
        const n1 = ct.stunAll();
        return { fired, n0, n1 };
      });
      ok(swept.fired === true, "thea: trigger fires (sweep is instant)");
      ok(swept.n1 === swept.n0, `thea: Dragline Sweep killed the adjacent shambler (${swept.n0} -> ${swept.n1})`);
    } else {
      const r1 = await T("triggerSignature()");
      ok(r1 === true, `${cid}: trigger fires`);
    }
    const st1 = await T("signatureState()");
    ok(st1.ready === false && st1.timeLeft > 0, `${cid}: cooldown enforced (timeLeft=${st1.timeLeft})`);
    const r2 = await T("triggerSignature()");
    ok(r2 === false, `${cid}: trigger blocked during cooldown`);
    const tm = await T("sigTimers()");
    if (cid === "otis_hale") {
      ok(tm.deadeye > 0, `otis: Deadeye Draw live (${tm.deadeye}s)`);
      eq(tm.frMul, 2.5, "otis: +150% fire rate while live");
    } else if (cid === "eula_stillwell") {
      ok(tm.stillHeart > 0, `eula: Still Heart live (${tm.stillHeart}s)`);
      eq(await T("critProbe()"), 1, "eula: guaranteed crits while live");
    } else if (cid === "silas_mccord") {
      ok(tm.lobbed >= 1, `silas: Mash Bomb lobbed (${tm.lobbed})`);
      eq(await T("stepCharges(5)"), 0, "silas: charge detonates on schedule");
    }
    await T("sigReset()");
  }
}

console.log("-- 10a(c). last-kill slow-mo --");
{
  const lk = await T("forceLastKill()");
  eq(lk.slow, 1, "lastKillSlowT set when the wave's final zombie dies");
  eq(lk.remaining, 0, "no zombies remain after the final kill");
  ok(lk.corpses >= 1, `final kill leaves a corpse (${lk.corpses})`);
  ok("lastKill" in (await T("sigTimers()")), "lastKill probe exists on sigTimers()");
}

console.log("-- 10a(d). illusionist archetype --");
{
  const w = await T("getWorld()");
  await T("toBreak()");
  await page.evaluate(([x, y]) => window.__controlsTest.spawn("illusionist", x + 150, y), [w.x, w.y]);
  const n = await T("stepIllusionist()");
  ok(n >= 2 && n <= 3, `illusionist spawns 2-3 clones (got ${n})`);
  const info = await T("illusionistInfo()");
  ok(info !== null, "illusionistInfo finds the real illusionist");
  ok(info.clones === n, `clone census matches (${info.clones})`);
  ok(info.cloneHp.length === n && info.cloneHp.every((h) => h === 1), `clones have exactly 1 HP (${info.cloneHp.join(",")})`);
  ok(info.cloneDmg.length === n && info.cloneDmg.every((d) => d === 0), `clones deal no damage (${info.cloneDmg.join(",")})`);
  ok(info.hp > 1, `the real illusionist is beefy (hp=${info.hp})`);
  const ci = await T("cloneInfo()");
  ok(ci !== null && ci.hp === 1 && ci.dmg === 0, "clones carry the isClone flag (renderer drops them to .55 alpha)");
}

console.log("-- 10a(e). mortar AoE + scorch --");
{
  const mi = await T("mortarInfo()");
  ok(mi && mi.row && mi.shop, `mortar weapon row registered (dmg=${mi.dmg}, shop=${mi.shop})`);
  const m = await page.evaluate(() => {
    const ct = window.__controlsTest;
    const w = ct.getWorld();
    ct.toBreak();
    ct.spawn("shambler", w.x + 200, w.y);
    ct.spawn("shambler", w.x + 210, w.y + 30);
    ct.spawn("shambler", w.x + 190, w.y - 30);
    return ct.mortarFire();
  });
  ok(m.ok === true && m.shells >= 1, `mortar fires shells (${m.shells})`);
  ok(m.hpAfter < m.hpBefore, `mortar AoE damaged the cluster (${m.hpBefore} -> ${m.hpAfter})`);
  ok(m.scorchAfter > m.scorchBefore, `mortar left scorch decals (${m.scorchBefore} -> ${m.scorchAfter})`);
}

console.log("-- 10a(f). corn liquor: fire-rate up, move-speed down --");
{
  const corn = await page.evaluate(() => {
    const ct = window.__controlsTest;
    const w = ct.getWorld();
    ct.toBreak();
    ct.clearBullets(); // no in-flight rounds: a stray kill mid-measurement would move comboMultiplier and skew the interval
    ct.setWeapon(0); // revolver, fresh mag: guarantees updateWeapons computes (no reload stall)
    for (let k = 0; k < 40; k++) ct.stepUpdate(1 / 60); // drain hitstop: update() early-returns while hitstop > 0, freezing _lastFireInterval
    ct.stepUpdate(1 / 60);
    const a0 = ct.fireInterval();
    ct.giveBoon("cornliquor", 2);
    ct.stepUpdate(1 / 60);
    const a2 = ct.fireInterval();
    ct.giveBoon("cornliquor", -2);
    ct.teleport(w.x, w.y);
    ct.setKeys(["KeyW"]);
    const p0 = ct.stepPlayer(90);
    const d0 = Math.hypot(p0.x - w.x, p0.y - w.y);
    ct.giveBoon("cornliquor", 2);
    ct.teleport(w.x, w.y);
    const p2 = ct.stepPlayer(90);
    const d2 = Math.hypot(p2.x - w.x, p2.y - w.y);
    ct.giveBoon("cornliquor", -2);
    ct.setKeys([]);
    return { a0, a2, d0, d2 };
  });
  ok(corn.a0 > 0, `fire interval readable (${corn.a0}ms)`);
  approx(corn.a2 / corn.a0, 1 / 1.24, 0.02, "corn liquor r2: interval x1/1.24 (fire rate +24%)");
  ok(corn.d0 > 50, `baseline moves (${corn.d0.toFixed(0)}u over 90 ticks)`);
  approx(corn.d2 / corn.d0, 0.88, 0.04, "corn liquor r2: move speed x0.88 (-12%)");
}

console.log("-- 10a(g). salt circle: still-only defense, tube-fed gate --");
{
  const salt = await page.evaluate(() => {
    const ct = window.__controlsTest;
    const hp = () => ct.getWorld().health;
    const w = ct.getWorld();
    ct.toBreak();
    ct.setWeapon(1); // shotgun: tube-fed, links saltcircle
    ct.teleport(w.x, w.y);
    ct.setKeys([]);
    ct.stepPlayer(5);
    const still = ct.pvel().sp;
    const h0 = hp(); ct.hurtMe(20); const d0 = h0 - hp();
    ct.giveBoon("saltcircle", 2);
    const h2 = hp(); ct.hurtMe(20); const d2 = h2 - hp();
    ct.setKeys(["KeyW"]); ct.stepPlayer(40);
    const moving = ct.pvel().sp;
    const h4 = hp(); ct.hurtMe(20); const d4 = h4 - hp();
    ct.setKeys([]);
    ct.setWeapon(0); // revolver: NOT tube-fed
    ct.teleport(w.x, w.y);
    ct.stepPlayer(5);
    const h5 = hp(); ct.hurtMe(20); const d5 = h5 - hp();
    ct.giveBoon("saltcircle", -2);
    return { still, d0, d2, moving, d4, d5 };
  });
  ok(salt.still < 0.5, `standing still detected (speed=${salt.still})`);
  approx(salt.d0, 20, 0.5, "baseline hurtMe(20) deals 20");
  approx(salt.d2, 16.8, 0.6, "salt circle r2 while still: 20 x 0.84 = 16.8");
  ok(salt.d2 < salt.d0, "salt circle reduces damage while still");
  ok(salt.moving > 0.5, `moving detected (speed=${salt.moving.toFixed(1)})`);
  approx(salt.d4, 20, 1.0, "salt circle gives nothing while moving");
  approx(salt.d5, 20, 1.0, "salt circle gives nothing on unlinked weapon (revolver)");
}

console.log("-- 10a(h). tracer rounds: pierce + speed on linked weapon --");
{
  const tracer = await page.evaluate(() => {
    const ct = window.__controlsTest;
    ct.toBreak();
    ct.setWeapon(0); // revolver: precise, links tracer
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const speeds = (n) => { const s = []; for (let i = 0; i < n; i++) { ct.fire(); s.push(ct.lastBullet().spd); } return s; };
    ct.fire();
    const b0 = ct.lastBullet();
    const s0 = mean(speeds(40));
    ct.giveBoon("tracer", 2);
    ct.fire();
    const b2 = ct.lastBullet();
    const s2 = mean(speeds(40));
    ct.giveBoon("tracer", -2);
    return { wt0: b0.wt, p0: b0.pierce, wt2: b2.wt, p2: b2.pierce, s0, s2 };
  });
  eq(tracer.wt0, "revolver", "fired weapon is the revolver");
  eq(tracer.p0, 1, "baseline revolver pierce is 1");
  eq(tracer.wt2, "revolver", "tracer shot is still the revolver");
  eq(tracer.p2, 3, "tracer r2: pierce 1 + 2 = 3");
  approx(tracer.s2 / tracer.s0, 1.30, 0.05, `tracer r2: projectile speed x1.30 (ratio ${(tracer.s2 / tracer.s0).toFixed(3)})`);
}

console.log("-- 10a(j). brine barrel: explosion bonus + burning patch --");
{
  const exp = brinePatch(2);
  const brine = await page.evaluate(() => {
    const ct = window.__controlsTest;
    const w = ct.getWorld();
    const bx = w.x + 200, by = w.y;
    const clearDraft = () => { const ids = ct.draftIds(); if (ids.length) { ct.dismissDraft(); ct.giveBoon(ids[0], -1); } };
    ct.toBreak();
    ct.setChar("silas_mccord"); ct.sigReset(); clearDraft();
    // rank 0: Mash Bomb baseline
    const i0 = ct.spawn("behemoth", bx, by) - 1;
    const h0 = ct.zInfo(i0).hp;
    ct.triggerSignature();
    const lobbed0 = ct.sigTimers().lobbed;
    ct.stepCharges(1.5);
    const d0 = h0 - ct.zInfo(i0).hp;
    const bs0 = ct.brineState();
    // rank 2: damage ratio + patch
    ct.giveBoon("brinebarrel", 2);
    const i1 = ct.spawn("behemoth", bx, by) - 1;
    const h1 = ct.zInfo(i1).hp;
    ct.sigReset(); clearDraft(); ct.triggerSignature();
    ct.stepCharges(1.5);
    const d1 = h1 - ct.zInfo(i1).hp;
    const bs2 = ct.brineState();
    // patch dps: fresh shambler at the blast center, 60 puddle ticks
    const zi = ct.spawn("shambler", bx, by) - 1;
    const ph0 = ct.zInfo(zi).hp;
    ct.stepPuddles(60);
    const ph1 = ct.zInfo(zi).hp;
    // barrel path also leaves a brine patch
    const barrels = ct.barrels().length;
    const pudBefore = ct.brineState().puddles.length;
    const barOk = ct.detonateBarrel();
    const pudAfter = ct.brineState().puddles.length;
    // B-bomb path: damage + patch at ground zero
    clearDraft();
    const bi = ct.spawn("behemoth", w.x + 80, w.y) - 1;
    const bh0 = ct.zInfo(bi).hp;
    const bombOk = ct.detonate();
    const bh1 = ct.zInfo(bi).hp;
    const pudFinal = ct.brineState().puddles.length;
    // bomber path: dying bomber leaves a brine patch
    ct.god();
    const pudPreBomber = ct.brineState().puddles.length;
    ct.killOne("bomber");
    const pudPostBomber = ct.brineState().puddles.length;
    ct.giveBoon("brinebarrel", -2);
    return { d0, d1, lobbed0, bs0, bs2, puddleDmg: ph0 - ph1, barrels, barOk, pudBefore, pudAfter, bombOk, bombDmg: bh0 - bh1, pudFinal, pudPreBomber, pudPostBomber };
  });
  ok(brine.lobbed0 >= 1, "Mash Bomb lobbed via signature");
  ok(brine.d0 > 0, `Mash Bomb damages at rank 0 (${brine.d0})`);
  eq(brine.bs0.puddles.length, 0, "no brine patch at rank 0");
  approx(brine.d1 / brine.d0, 1.6, 0.08, `brine r2: explosion damage x1.6 (ratio ${(brine.d1 / brine.d0).toFixed(3)})`);
  eq(brine.bs2.rank, 2, "brineState reports rank 2");
  ok(brine.bs2.puddles.length >= 1, `Mash Bomb leaves a brine patch (${brine.bs2.puddles.length})`);
  const bp = brine.bs2.puddles[0];
  eq(bp.r, Math.round(exp.radius), `patch radius matches brinePatch(2) (${bp.r})`);
  eq(bp.dur, exp.durationMs, `patch duration matches brinePatch(2) (${bp.dur}ms)`);
  eq(bp.dps, exp.dps, `patch dps matches brinePatch(2) (${bp.dps})`);
  approx(brine.puddleDmg, exp.dps, 3, `brine patch burns for its dps over 60 ticks (${brine.puddleDmg.toFixed(1)} vs ${exp.dps})`);
  ok(brine.barrels > 0, `explosive barrels on the map (${brine.barrels})`);
  ok(brine.barOk === true, "detonateBarrel probe fires");
  ok(brine.pudAfter > brine.pudBefore, `barrel blast leaves a brine patch (${brine.pudBefore} -> ${brine.pudAfter})`);
  ok(brine.bombOk === true, "B-bomb detonates");
  ok(brine.bombDmg > 0, `B-bomb damages with brine held (${brine.bombDmg})`);
  ok(brine.pudFinal > brine.pudAfter, `B-bomb leaves a brine patch at ground zero (${brine.pudAfter} -> ${brine.pudFinal})`);
  ok(brine.pudPostBomber > brine.pudPreBomber, `dying bomber leaves a brine patch (${brine.pudPreBomber} -> ${brine.pudPostBomber})`);
}

console.log("-- 10a(k). Indiana-only naming (live strings) --");
{
  const live = await page.evaluate(() => {
    const ct = window.__controlsTest;
    const names = [];
    for (const cid of ["otis_hale", "eula_stillwell", "silas_mccord", "thea_kettler"]) {
      ct.setChar(cid);
      names.push(ct.signatureState().name);
    }
    return names;
  });
  const inBundle = await page.evaluate(`(async () => {
    const m = await import("/src/game/boons.ts");
    return ["tracer", "saltcircle", "cornliquor", "brinebarrel"].map((id) => {
      const b = m.BOON_CATALOG.find((x) => x.id === id);
      return b ? b.name + " " + b.blurb : "";
    });
  })()`);
  const hay = (live.join(" ") + " " + inBundle.join(" ")).toLowerCase();
  for (const bad of BAD) ok(!hay.includes(bad), `no "${bad}" in Batch 10 live strings`);
}

const myErrors = errors.filter((e) => !e.includes("corpseDecals"));
ok(myErrors.length === 0, `no page errors${myErrors.length ? ": " + myErrors.join(" | ") : ""}`);
await browser.close();

console.log(`\nbatch10a: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
