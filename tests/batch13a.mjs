// Batch 13 — Lane 1 (engine/gameplay) tests: Boss #2 — Old Ben.
//
//  1. BOSSES data row for "old_ben": table-driven stats via bossFor("old_ben")
//     (health 2000 + wave*250 from the engine, speed 1.35, damage 55, radius 42,
//     banner "OLD BEN", wave % 5 == 3 schedule on waves 13/18/23/...).
//  2. Scheduling: Old Ben lands on 13/18/23/... and the Behemoth's every-5th-wave
//     cadence is unaffected; splinter/mound NEVER spawn from the wave director
//     or cellar holes (boss summons only).
//  3. Attacks: Tremor Slam (circular tell -> ring damage), Briar Call
//     (4-6 adds at cellar holes with tells; splinter fast-dasher / mound tank),
//     Bull Charge (directional tell -> dash -> wall-impact shockwave).
//  4. Fury: below 50% HP — cooldowns shorten (x0.65) and Tremor Slam strikes
//     a second, larger ring.
//  5. Death: large grit shower + guaranteed boon draft + boss_old_ben codex
//     entry (+ old_ben killZombie entry).
//  6. Mound shield: damage to nearby adds reduced 40%.
//  7. Indiana-only naming (never Bayville/Griggsville/Illinois).
//
// Pure sections run in plain node via jiti (TS sources imported directly).
//   node_modules/.bin/jiti tests/batch13a.mjs
// Live section runs under Playwright against a dev server (served bundle check).
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch13a.mjs

import {
  BOSSES, bossFor, ENEMY_REGISTRY, ENGINE_SPAWNED_TYPES, OLD_BEN_TUNING,
} from "../src/game/constants.ts";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

console.log("== 13a(a). Old Ben BOSSES data row (pure) ==");
{
  const ben = bossFor("old_ben");
  ok(!!ben, "bossFor('old_ben') returns a row");
  eq(ben.type, "old_ben", "old_ben row type");
  eq(ben.name, "Old Ben", "old_ben row name");
  eq(ben.bossOverrides.health, 2000, "Old Ben base HP 2000 (engine adds +wave*250)");
  eq(ben.bossOverrides.speed, 1.35, "Old Ben speed 1.35");
  eq(ben.bossOverrides.damage, 55, "Old Ben contact damage 55");
  eq(ben.bossOverrides.radius, 42, "Old Ben radius 42");
  eq(ben.bossOverrides.bannerText, "OLD BEN", "Old Ben banner text");
  eq(ben.bossOverrides.scoreValue, 2500, "Old Ben score value 2500");
  eq(ben.bossOverrides.scrapValue, 400, "Old Ben scrap value 400");
  ok(/wave % 5 == 3/.test(ben.spawnRule) && /13/.test(ben.spawnRule),
    `old_ben spawnRule documents the 13/18/23 cadence (${ben.spawnRule})`);
  // Behemoth row untouched (batch 5 baseline).
  const beh = bossFor("behemoth");
  eq(beh.bossOverrides.health, 1400, "Behemoth base HP still 1400");
  eq(beh.bossOverrides.speed, 1.55, "Behemoth speed still 1.55");
  ok(/wave % 5 == 0/.test(beh.spawnRule), "Behemoth still on the every-5th-wave rule");
}

console.log("== 13a(b). OLD_BEN_TUNING + adds registry (pure) ==");
{
  const t = OLD_BEN_TUNING;
  eq(t.furyAt, 0.5, "fury below 50% HP");
  ok(t.furyCdMul < 1, `fury shortens cooldowns (x${t.furyCdMul})`);
  ok(t.slamR2 > t.slamR, `furious slam second ring is larger (${t.slamR2} > ${t.slamR})`);
  ok(t.slamCd > 0 && t.slamWindup > 0 && t.slamDmg > 0, "slam has positive cd/windup/damage");
  ok(t.callCd > 0 && t.callWindup > 0, "call has positive cd/windup");
  ok(t.callMin >= 4 && t.callMax <= 6, `Briar Call summons 4-6 adds (min ${t.callMin}, max ${t.callMax})`);
  ok(t.chargeCd > 0 && t.chargeWindup > 0 && t.chargeDashSpeed > 0 && t.chargeDashT > 0,
    "charge has positive cd/windup/speed/dash time");
  ok(t.chargeLaneR > 0 && t.wallShockR > 0 && t.wallShockDmg > 0, "charge lane + wall shockwave tuned");
  ok(t.moundShieldR > 0 && t.moundShieldMul < 1, "mound shield aura tuned (multiplier < 1)");
  const reg = ENEMY_REGISTRY;
  ok(!!reg.old_ben && !!reg.splinter && !!reg.mound, "ENEMY_REGISTRY rows exist for all three new types");
  eq(reg.old_ben.hp, 2000, "registry: Old Ben hp 2000");
  ok(reg.splinter.hp < reg.mound.hp / 5 && reg.splinter.speed > reg.mound.speed * 3,
    "registry: splinter is the fast weak dasher, mound the slow tank");
  for (const k of ["old_ben", "splinter", "mound"]) {
    ok(reg[k].affixEligible === false, `registry: ${k} never rolls elite affixes`);
  }
  for (const k of ["old_ben", "splinter", "mound"]) {
    ok(ENGINE_SPAWNED_TYPES.includes(k), `ENGINE_SPAWNED_TYPES includes ${k}`);
  }
}

console.log("== 13a(c). Indiana-only naming (pure) ==");
{
  const bad = /bayville|griggsville|illinois/i;
  for (const b of BOSSES) {
    const text = `${b.name} ${b.bossOverrides.bannerText} ${b.bossOverrides.bannerSub || ""} ${b.spawnRule}`;
    ok(!bad.test(text), `BOSSES row "${b.id}" is Pike County flavor only`);
  }
  for (const k of ["old_ben", "splinter", "mound"]) {
    const e = ENEMY_REGISTRY[k];
    ok(!bad.test(`${e.name} ${e.description}`), `ENEMY_REGISTRY "${k}" is Pike County flavor only`);
  }
}

// ---------------------------------------------------------------------------
// Live section (Playwright). Parent/coordinator runs this against :8082.
// ---------------------------------------------------------------------------
const { chromium } = await import("playwright-core");
const PZ_URL = process.env.PZ_URL || "http://127.0.0.1:8082";
console.log("\n== live (Playwright) ==");
const errors = [];
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => errors.push(String(e && e.message || e)));
await page.goto(PZ_URL, { waitUntil: "networkidle", timeout: 60000 });
const startBtn = page.getByText("Survival · this place");
await startBtn.waitFor({ timeout: 30000 });
for (let i = 0; i < 12 && !(await page.evaluate(() => !!window.__controlsTest)); i++) {
  await startBtn.click();
  await page.waitForTimeout(2500);
}
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 30000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
const inBreak = () => page.waitForFunction(
  () => window.__controlsTest && window.__controlsTest.waveInfo().state === "break",
  null, { timeout: 30000 });
await T("god()");
await T("toBreak()");
await T("settle()");
await inBreak();

console.log("== 13a(d). scheduling: Old Ben 13/18/23, Behemoth every 5th (live) ==");
{
  // deterministic picker: no cellar holes, so the hole branch never preempts bosses
  const r = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak(); c.settle(); c.god(); c.stashObjectives9();
    const picks = {};
    for (const w of [5, 10, 12, 13, 14, 15, 18, 23]) picks[w] = c.oldBenSched(w);
    c.unstashObjectives9();
    return picks;
  });
  eq(r[13], "old_ben", "wave 13 spawns Old Ben");
  eq(r[18], "old_ben", "wave 18 spawns Old Ben");
  eq(r[23], "old_ben", "wave 23 spawns Old Ben");
  eq(r[5], "behemoth", "wave 5 still spawns the Behemoth");
  eq(r[10], "behemoth", "wave 10 still spawns the Behemoth");
  eq(r[15], "behemoth", "wave 15 still spawns the Behemoth");
  ok(r[12] !== "old_ben" && r[12] !== "behemoth", `wave 12 spawns a regular zombie (got ${r[12]})`);
  ok(r[14] !== "old_ben" && r[14] !== "behemoth", `wave 14 spawns a regular zombie (got ${r[14]})`);
}

console.log("== 13a(e). Old Ben stats: wave-scaled boss HP (live) ==");
{
  // HP = (2000 + wave*250) x enemyHpMult x timeCurve(); the multipliers are
  // identical for two spawns in one evaluate, so the wave*250 scaling must
  // hold proportionally between wave 13 and wave 18.
  const r = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak(); c.settle(); c.god();
    c.stashObjectives9();
    const t13 = c.oldBenSched(13);
    const hp13 = c.boss2Info().maxHp;
    c.toBreak();
    const t18 = c.oldBenSched(18);
    const hp18 = c.boss2Info().maxHp;
    c.unstashObjectives9();
    return { t13, t18, hp13, hp18 };
  });
  eq(r.t13, "old_ben", "scheduled Old Ben is the boss (wave 13)");
  eq(r.t18, "old_ben", "scheduled Old Ben is the boss (wave 18)");
  ok(r.hp13 > 5000, `Old Ben wave-13 HP is boss-tier (${r.hp13})`);
  ok(Math.abs(r.hp13 / 5250 - r.hp18 / 6500) < 0.005,
    `HP scales +250/wave under the multipliers (w13:${r.hp13} w18:${r.hp18})`);
}

console.log("== 13a(f). Tremor Slam: circular tell -> ring damage (live) ==");
{
  const r = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak(); c.settle(); c.god(); c.clearInvuln();
    const i = c.forceOldBen(); // cds pinned to 9999; attacks fire only when forced
    const b = c.boss2Info();
    c.setPlayerPos(b.x - 120, b.y); // inside the slam ring, outside melee
    c.oldBenAttack("slam");
    c.stepZombies(3);
    const mid = { atk: c.boss2Info().atk, tells: c.telegraphInfo().filter((t) => t.kind === "ranged").length };
    const hp0 = c.playerHp();
    c.stepZombies(90); // past the 1.2s windup
    return { mid, hp0, hp1: c.playerHp(), atk: c.boss2Info().atk };
  });
  eq(r.mid.atk, "slam", "slam attack is running");
  ok(r.mid.tells >= 1, "circular telegraph appears before the slam");
  ok(r.hp1 < r.hp0, `player takes ring damage after the tell (hp ${r.hp0} -> ${r.hp1})`);
}

console.log("== 13a(g). Briar Call: 4-6 adds at cellar holes (live) ==");
{
  const r = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak(); c.settle(); c.god();
    const i = c.forceOldBen();
    const types = {};
    for (let k = 0; k < c.zCount(); k++) { const t = c.zInfo(k).type; types[t] = (types[t] || 0) + 1; }
    const before = c.zCount();
    c.oldBenAttack("call");
    c.stepZombies(3);
    const mid = { atk: c.boss2Info().atk, tells: c.telegraphInfo().filter((t) => t.kind === "ranged").length };
    c.stepZombies(120); // past the 1.5s windup
    const adds = {};
    for (let k = 0; k < c.zCount(); k++) { const t = c.zInfo(k).type; adds[t] = (adds[t] || 0) + 1; }
    const n = (adds.splinter || 0) + (adds.mound || 0);
    return { mid, n, splinters: adds.splinter || 0, mounds: adds.mound || 0, atk: c.boss2Info().atk };
  });
  eq(r.mid.atk, "call", "call attack is running");
  ok(r.mid.tells >= 1, "channel telegraphs appear at the holes");
  ok(r.n >= 4 && r.n <= 6, `Briar Call summons 4-6 adds (got ${r.n}: ${r.splinters} splinter, ${r.mounds} mound)`);
  ok(r.mounds >= 1, "at least one mound tank in the mix");
  eq(r.atk, null, "call attack ends after the summon");
}

console.log("== 13a(h). Bull Charge: lane tell -> dash damage (live) ==");
{
  const r = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak(); c.settle(); c.god(); c.clearInvuln();
    const i = c.forceOldBen();
    const b = c.boss2Info();
    c.setPlayerPos(b.x - 300, b.y); // directly in the charge lane
    c.oldBenAttack("charge");
    c.stepZombies(3);
    const mid = { atk: c.boss2Info().atk, tells: c.telegraphInfo().filter((t) => t.kind === "charge").length };
    const hp0 = c.playerHp();
    c.stepZombies(120); // windup 1.0s + dash 0.7s
    return { mid, hp0, hp1: c.playerHp(), atk: c.boss2Info().atk };
  });
  eq(r.mid.atk, "charge", "charge attack is running");
  ok(r.mid.tells >= 1, "directional lane telegraph appears before the charge");
  ok(r.hp1 < r.hp0, `player takes trample damage in the lane (hp ${r.hp0} -> ${r.hp1})`);
}

console.log("== 13a(i). Bull Charge ends in a wall-impact shockwave (live) ==");
{
  const r = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak(); c.settle(); c.god(); c.clearInvuln();
    const ms = c.mapSize();
    const i = c.spawnAt("old_ben", 400, ms.h / 2); // natural cds (3/5/4s) can't elapse in ~2s of steps
    c.setPlayerPos(150, ms.h / 2); // on the lane, 250u from the boss
    const sh0 = c.shockCount();
    const hp0 = c.playerHp();
    c.oldBenAttack("charge");
    c.stepZombies(120);
    const b = c.boss2Info();
    return { shDelta: c.shockCount() - sh0, atk: b ? b.atk : "gone", x: b ? b.x : -1, hp0, hp1: c.playerHp() };
  });
  ok(r.shDelta >= 1, `wall impact spawns a shockwave (shockwaves +${r.shDelta})`);
  eq(r.atk, null, "dash ends at the wall");
  ok(r.x > 20, `boss stopped at the wall instead of crossing it (x=${r.x})`);
  ok(r.hp1 < r.hp0, `player took damage along the charge lane (hp ${r.hp0} -> ${r.hp1})`);
}

console.log("== 13a(j). Fury below 50%: shorter cooldowns + second slam ring (live) ==");
{
  const r = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak(); c.settle(); c.god(); c.clearInvuln();
    const i = c.forceOldBen();
    const px = c.playerPos().x, py = c.playerPos().y;
    // control: non-fury slam cooldown
    const b0 = c.boss2Info();
    c.setPlayerPos(b0.x - 120, b0.y);
    c.oldBenAttack("slam"); c.stepZombies(2);
    const cdControl = c.boss2Info().cds.slam;
    const shC0 = c.shockCount(); c.stepZombies(100);
    const shControl = c.shockCount() - shC0;
    // fury: drop to 40% HP
    const info = c.boss2Info();
    c.hurtZombie(i, Math.round(info.maxHp * 0.6));
    c.stepZombies(3);
    const fury = c.boss2Info().fury;
    const b1 = c.boss2Info();
    c.setPlayerPos(b1.x - 120, b1.y);
    c.oldBenAttack("slam"); c.stepZombies(2);
    const cdFury = c.boss2Info().cds.slam;
    const shF0 = c.shockCount(); c.stepZombies(100);
    const shFury = c.shockCount() - shF0;
    return { cdControl, cdFury, fury, shControl, shFury };
  });
  eq(r.fury, true, "Old Ben is furious below 50% HP");
  ok(r.cdControl > 4.7, `non-fury slam cooldown is full length (cd=${r.cdControl})`);
  ok(r.cdFury < 4.7, `fury shortens the slam cooldown (cd=${r.cdFury} < ${r.cdControl})`);
  eq(r.shControl, 1, "non-fury slam emits one shockwave ring");
  ok(r.shFury >= 2, `furious slam strikes a second ring (shockwaves +${r.shFury})`);
}

console.log("== 13a(k). death: grit shower + guaranteed boon draft + codex (live) ==");
{
  const r = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak(); c.settle(); c.god();
    const g0 = c.gritOrbs();
    const i = c.forceOldBen();
    c.killAt(i);
    return {
      grit: c.gritOrbs() - g0,
      draft: c.draftOpen(),
      codexBoss: c.codexHas("boss_old_ben"),
      codexType: c.codexHas("old_ben"),
    };
  });
  ok(r.grit >= 24, `death drops a large grit shower (+${r.grit} orbs)`);
  eq(r.draft, true, "death guarantees a boon draft");
  eq(r.codexBoss, true, "boss_old_ben codex entry recorded");
  eq(r.codexType, true, "old_ben killZombie codex entry recorded");
}

console.log("== 13a(l). mound shield: nearby adds take 40% less (live) ==");
{
  const r = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak(); c.settle(); c.god();
    const px = c.playerPos().x, py = c.playerPos().y;
    const mi = c.spawnAt("mound", px + 100, py);
    const near = c.spawnAt("splinter", px + 120, py); // 20u from the mound
    const far = c.spawnAt("splinter", px + 600, py);  // 500u from the mound
    return {
      near: c.hitZombie(near, 100).dealt,
      far: c.hitZombie(far, 100).dealt,
      mound: c.hitZombie(mi, 100).dealt,
    };
  });
  eq(r.near, 60, `add near the mound takes 40% reduced damage (got ${r.near})`);
  eq(r.far, 100, `add far from the mound takes full damage (got ${r.far})`);
  eq(r.mound, 100, "the mound itself is not shielded");
}

console.log("== 13a(m). splinter/mound never come from the director or holes (live) ==");
{
  const seen = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak(); c.settle(); c.god();
    const s = new Set();
    c.stashObjectives9(); // holes = [] -> fully deterministic picker
    for (let w = 1; w <= 12; w++) for (let k = 0; k < 10; k++) s.add(c.oldBenSched(w));
    c.unstashObjectives9();
    for (let k = 0; k < 40; k++) s.add(c.oldBenSched(6)); // random run, holes live
    c.toBreak();
    return [...s];
  });
  ok(!seen.includes("splinter") && !seen.includes("mound"),
    `160 director/hole picks never yield the boss adds (saw: ${seen.join(",")})`);
}

console.log("-- page errors --");
ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ").slice(0, 400) : ""}`);
await browser.close();

console.log(`\nbatch13a: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
