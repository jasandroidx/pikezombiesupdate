// Batch 12 — Lane 1 (engine/gameplay) tests:
//  1. Powerup Shower RunEvent: RUN_EVENTS entry (wave 4, mid-wave 20s),
//     cadence, 8-12 drops over ~6s, radio callout.
//  2. Elite Hunt RunEvent: RUN_EVENTS entry (wave 8), 3-5 affixed elites,
//     per-wave hunt state, all-killed bonus (grit shower + free shop reroll).
//  3. Flamethrower: INITIAL_WEAPONS entry, WEAPON_LEVELS row, shop unlock,
//     cone damage + burn stacks + burn-tick DoT.
//  4. Railgun: INITIAL_WEAPONS entry, WEAPON_LEVELS row, shop unlock,
//     charge-then-fire piercing beam damage.
//  5. Indiana-only naming (never Bayville/Griggsville/Illinois).
//
// Pure sections run in plain node via jiti (TS sources imported directly).
//   node_modules/.bin/jiti tests/batch12a.mjs
// Live section runs under Playwright against a dev server (served bundle check).
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch12a.mjs

import {
  INITIAL_WEAPONS, WEAPON_LEVELS, statsForLevel, SHOP_POOL, RUN_EVENTS,
  SHOWER_COUNT_MIN, SHOWER_COUNT_MAX, SHOWER_DURATION_SEC, SHOWER_MID_WAVE_SEC,
  HUNT_PACK_MIN, HUNT_PACK_MAX, HUNT_BONUS_GRIT_ORBS,
  BURN_STACK_DPS, BURN_MAX_STACKS, BURN_REFRESH_MS,
} from "../src/game/constants.ts";
import {
  b12BoonSummary,
  copperheadMaxStacks, copperheadPoisonDps, copperheadDurationSec, copperheadApplies,
  whetstoneBashMul, whetstoneChainsawMul, whetstoneApplies,
  sifterRadiusMul, sifterValueMul,
} from "../src/game/boons.ts";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

console.log("== 12a(a). run-event cadence (pure) ==");
{
  const ids = RUN_EVENTS.map((e) => e.id);
  const shower = RUN_EVENTS.find((e) => e.id === "powerup_shower");
  const hunt = RUN_EVENTS.find((e) => e.id === "elite_hunt");
  ok(!!shower, "powerup_shower in RUN_EVENTS");
  ok(!!hunt, "elite_hunt in RUN_EVENTS");
  eq(shower?.trigger.type, "wave", "shower trigger type = wave");
  eq(shower?.trigger.wave, 4, "shower on wave 4 (not 3/6)");
  eq(shower?.midWaveSec, 20, "shower is mid-wave (20s)");
  eq(hunt?.trigger.type, "wave", "hunt trigger type = wave");
  eq(hunt?.trigger.wave, 8, "hunt on wave 8 (not 3/6)");
  ok(hunt?.midWaveSec === undefined, "hunt fires at wave start (no midWaveSec)");
  eq(shower?.banner, "POWERUP SHOWER", "shower banner");
  eq(hunt?.banner, "ELITE HUNT", "hunt banner");
  ok(typeof shower?.radio === "string" && shower.radio.length > 10, "shower radio callout");
  ok(typeof hunt?.radio === "string" && hunt.radio.length > 10, "hunt radio callout");
  // Cadence: the four wave events sit on distinct waves — 3, 4, 6, 8.
  const waves = RUN_EVENTS.filter((e) => e.trigger.type === "wave").map((e) => e.trigger.wave).sort((a, b) => a - b);
  eq(JSON.stringify(waves), JSON.stringify([3, 4, 6, 8]), `wave cadence 3/4/6/8 (got ${waves})`);
  ok(new Set(ids).size === ids.length, "run-event ids unique");
  // Shower tuning.
  eq(SHOWER_COUNT_MIN, 8, "shower min 8");
  eq(SHOWER_COUNT_MAX, 12, "shower max 12");
  eq(SHOWER_DURATION_SEC, 6, "shower ~6s");
  eq(SHOWER_MID_WAVE_SEC, 20, "mid-wave mark 20s");
  // Hunt tuning.
  eq(HUNT_PACK_MIN, 3, "hunt pack min 3");
  eq(HUNT_PACK_MAX, 5, "hunt pack max 5");
  ok(HUNT_BONUS_GRIT_ORBS >= 8, "hunt bonus grit shower");
  // Burn-stack tuning.
  ok(BURN_STACK_DPS > 0 && BURN_MAX_STACKS > 1 && BURN_REFRESH_MS > 0, "burn tuning sane");
}

console.log("== 12a(b). flamethrower + railgun data (pure) ==");
for (const [id, name, cost] of [["flamethrower", "Dugger Torch", 650], ["railgun", "Merom Railgun", 750]]) {
  const w = INITIAL_WEAPONS.find((x) => x.id === id);
  ok(!!w, `${id} in INITIAL_WEAPONS`);
  eq(w?.name, name, `${id} name`);
  eq(w?.unlocked, false, `${id} locked by default (shop unlock)`);
  eq(w?.cost, cost, `${id} unlock cost`);
  const row = WEAPON_LEVELS[id];
  ok(!!row, `${id} WEAPON_LEVELS row exists`);
  for (const k of ["dmg", "cnt", "rad", "spd", "cd"]) eq(row[k].length, 5, `${id} row.${k} has 5 levels`);
  eq(row.dmg[0], w.damage, `${id} row dmg[0] = base damage`);
  eq(row.cnt[0], w.pellets, `${id} row cnt[0] = base pellets`);
  eq(row.rad[0], w.range, `${id} row rad[0] = base range`);
  eq(row.spd[0], w.bulletSpeed, `${id} row spd[0] = base bulletSpeed`);
  ok(Math.abs(1 / row.cd[0] - w.fireRate) < 0.02, `${id} row cd[0] ~ 1/fireRate`);
  const l1 = statsForLevel(id, 1), l5 = statsForLevel(id, 5);
  ok(l1 && l5 && l5.dmg > l1.dmg && l5.cd < l1.cd, `${id} row scales up with level`);
  const offer = SHOP_POOL.find((o) => o.weaponId === id);
  ok(!!offer, `SHOP_POOL has a ${id} unlock offer`);
  eq(offer?.kind, "unlock", `${id} offer kind = unlock`);
  eq(offer?.repeatable, false, `${id} unlock not repeatable`);
}
{
  // No flamethrower/railgun existed before this batch: exactly one entry each.
  eq(INITIAL_WEAPONS.filter((x) => x.id === "flamethrower").length, 1, "single flamethrower entry");
  eq(INITIAL_WEAPONS.filter((x) => x.id === "railgun").length, 1, "single railgun entry");
  const others = INITIAL_WEAPONS.filter((x) => !["flamethrower", "railgun"].includes(x.id) && /flame|torch|rail/.test(x.id));
  eq(others.length, 0, "no other flame/rail weapon ids");
  ok(new Set(INITIAL_WEAPONS.map((x) => x.id)).size === INITIAL_WEAPONS.length, "weapon ids unique");
  ok(new Set(SHOP_POOL.map((o) => o.id)).size === SHOP_POOL.length, "shop offer ids unique");
}

console.log("== 12a(c). Indiana-only naming (pure) ==");
// Pike County flavor only — never Bayville/Griggsville/Illinois. The one
// allowed hit is the code comment that names the ban itself.
{
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  const hay = (
    readFileSync(join(here, "../src/game/constants.ts"), "utf8") +
    readFileSync(join(here, "../src/game/engine.ts"), "utf8") +
    readFileSync(join(here, "../src/types/game.ts"), "utf8")
  );
  const badLines = hay.split("\n").filter((l) => /bayville|griggsville|illinois/i.test(l));
  ok(badLines.length > 0, "ban comment exists");
  ok(badLines.every((l) => /never bayville\/griggsville\/illinois/i.test(l)),
    `only the ban comment mentions them (${badLines.length} line(s))`);
}

console.log("== 12a(k). batch-12 boons: pure math (pure) ==");
// The content lane's data-only boons (boons.ts): per-rank math + tag gating.
// The engine lane wires these; this section pins the math the wiring uses.
{
  const s = b12BoonSummary({ copperhead: 2, whetstone: 1, sifter: 3 });
  eq(s.copperhead.rank, 2, "summary copperhead rank");
  eq(s.copperhead.maxStacks, 4, "summary copperhead maxStacks = 2+rank");
  eq(s.copperhead.dps, 10, "summary copperhead dps = 5/rank");
  eq(s.copperhead.durationSec, 3.5, "summary copperhead duration = 2.5+0.5/rank");
  eq(s.whetstone.bashMul, 1.25, "summary whetstone bashMul = 1+0.25/rank");
  eq(s.whetstone.chainsawMul, 1.15, "summary whetstone chainsawMul = 1+0.15/rank");
  eq(s.sifter.radiusMul, 1.6, "summary sifter radiusMul = 1+0.20/rank");
  eq(s.sifter.valueMul, 1.3, "summary sifter valueMul = 1+0.10/rank");
  const z = b12BoonSummary({});
  eq(z.copperhead.rank, 0, "summary defaults rank 0");
  eq(z.whetstone.bashMul, 1, "summary defaults bashMul 1");
  eq(z.sifter.valueMul, 1, "summary defaults valueMul 1");
  // Tag gating (rapid+precise for copperhead, heavy for whetstone).
  eq(copperheadApplies({ copperhead: 1 }, "carbine"), true, "copperhead applies to carbine (rapid+precise)");
  eq(copperheadApplies({ copperhead: 1 }, "shotgun"), false, "copperhead gated off shotgun");
  eq(copperheadApplies({}, "carbine"), false, "copperhead needs the boon");
  eq(whetstoneApplies({ whetstone: 1 }, "chainsaw"), true, "whetstone applies to chainsaw (heavy)");
  eq(whetstoneApplies({ whetstone: 1 }, "carbine"), false, "whetstone gated off carbine");
  eq(copperheadMaxStacks(0), 2, "copperhead maxStacks rank 0");
  eq(copperheadPoisonDps(0), 0, "copperhead dps rank 0");
  eq(copperheadDurationSec(0), 2.5, "copperhead duration rank 0");
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

console.log("-- setup --");
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
// toBreak() is a no-op during the initial wave-0 break; wait for wave 1 to be
// actively spawning so the clear actually ends a live wave.
await page.waitForFunction(
  () => window.__controlsTest && window.__controlsTest.waveInfo().wave >= 1 && window.__controlsTest.waveInfo().state === "active",
  null, { timeout: 30000 });
await T("toBreak()");
await T("settle()");
await inBreak();

console.log("== 12a(d). b12Info: events + weapons wired ==");
{
  const info = await T("b12Info()");
  ok(!!info.evs.powerup_shower, "shower event visible to engine");
  ok(!!info.evs.elite_hunt, "hunt event visible to engine");
  eq(info.evs.powerup_shower.wave, 4, "shower wave 4");
  eq(info.evs.powerup_shower.mid, 20, "shower mid-wave 20s");
  eq(info.evs.elite_hunt.wave, 8, "hunt wave 8");
  ok(info.evs.elite_hunt.mid === null, "hunt not mid-wave");
  for (const w of info.weapons) {
    ok(!!w, "weapon probe resolved");
    ok(w.row, `${w.id} WEAPON_LEVELS row wired`);
    ok(w.shop, `${w.id} shop unlock offer present`);
    ok(w.ids, `${w.id} in INITIAL_WEAPONS`);
  }
}

console.log("== 12a(e). powerup shower: 8-12 drops over ~6s ==");
{
  const s = await T("forceShower()");
  eq(s.ok, true, "shower begins");
  ok(s.total >= 8 && s.total <= 12, `shower drops 8-12 powerups (total=${s.total})`);
  eq(s.added, s.total, "every scheduled drop landed");
  ok(s.kinds >= 2, `drops are random types (${s.kinds} kinds)`);
  eq(s.showerDone, true, "shower drains to completion");
  const fired = await T("showerFired()");
  eq(fired, true, "shower marked fired in firedEvents");
}

console.log("== 12a(f). shower mid-wave cadence (deterministic) ==");
{
  const c = await T("showerMidWave()");
  eq(c.early, false, "shower does NOT fire before the 20s mid-wave mark");
  eq(c.late, true, "shower fires once the mid-wave mark passes");
}

console.log("== 12a(g). elite hunt: 3-5 affixed elites ==");
{
  const h = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.settle(); c.god();
    return c.forceHunt();
  });
  ok(h.total >= 3 && h.total <= 5, `hunt pack is 3-5 elites (total=${h.total})`);
  eq(h.targets, h.total, "all pack members tracked");
  eq(h.elites, h.total, "all pack members are elites");
  eq(h.affixed, h.total, "all pack members carry affixes");
  const st = await T("huntState()");
  eq(st.wave, 8, "hunt tracked per wave");
  eq(st.killed, 0, "no kills yet");
  eq(st.done, false, "not done yet");
}

console.log("== 12a(h). hunt all-killed bonus: grit shower + free reroll ==");
{
  const k = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.settle(); c.god();
    return c.killHunt();
  });
  eq(k.done, true, "all hunt elites killed -> hunt done");
  eq(k.reroll, true, "free shop reroll granted");
  eq(k.targets, 0, "hunt targets cleared");
  ok(k.grit >= 10, `grit shower dropped (${k.grit} orbs)`);
  // The free reroll must not touch scrap. Force a fresh break so the
  // reroll checks below don't race a stale break's tail.
  await T("toBreak()");
  await inBreak();
  await T("skipBreak()");
  await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.waveInfo().state === "active", null, { timeout: 30000 });
  await T("toBreak()");
  await inBreak();
  await T("setScrap(0)");
  const r = await T("freeReroll()");
  eq(r.ok, true, "reroll works with 0 scrap when the hunt bonus is banked");
  eq(r.scrap, 0, "free reroll costs nothing");
  eq(r.cost, r.c0, "free reroll does not escalate the cost");
  eq(r.flag, false, "bonus consumed after one use");
}

console.log("== 12a(i). flamethrower: cone damage + burn stacks ==");
{
  const f = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.settle(); c.god();
    return c.flameFire();
  });
  eq(f.ok, true, "flamethrower fires");
  ok(f.hits >= 4, `cone caught the pack (hits=${f.hits})`);
  ok(f.stacks.every((s) => s >= 1), `burn stacks applied (${f.stacks.join(",")})`);
  ok(f.hpAfter < f.hpBefore, `direct + burn DoT damage landed (${f.hpBefore} -> ${f.hpAfter})`);
}

console.log("== 12a(j). railgun: charge then piercing beam ==");
{
  const r = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.settle(); c.god();
    return c.railFire();
  });
  eq(r.ok, true, "railgun trigger works");
  eq(r.charging, true, "trigger starts the charge (no instant beam)");
  eq(r.fired, true, "beam fires when the charge completes");
  ok(r.hits >= 4, `piercing beam hit the line (hits=${r.hits})`);
  ok(r.hpAfter < r.hpBefore, `high beam damage landed (${r.hpBefore} -> ${r.hpAfter})`);
}

console.log("== 12a(l). batch-12 boons: wired effects (live) ==");
{
  await T("settle()"); await T("god()");
  // b12BoonSummary exposed verbatim as a probe.
  const sum = await T("b12BoonSummary()");
  eq(sum.copperhead.rank, 0, "summary probe: default copperhead rank 0");
  eq(sum.whetstone.bashMul, 1, "summary probe: default whetstone bashMul 1");
  eq(sum.sifter.radiusMul, 1, "summary probe: default sifter radiusMul 1");
  // Copperhead: stacking on bullet-hit hook, tag gate, DoT.
  const ch = await T("copperheadTest()");
  eq(ch.stacks, 4, "poison stacks accumulate on bullet hits (rank-2 cap 4)");
  eq(ch.maxStacks, 4, "copperheadMaxStacks(2) = 4");
  eq(ch.gated, true, "shotgun (no rapid/precise tag) gets no poison");
  eq(ch.summary.rank, 2, "summary reflects copperhead rank 2");
  const dot = await T("copperheadDot()");
  ok(dot.dot >= 8 && dot.dot <= 12, `poison DoT ticks ~10/s for 1s (got ${dot.dot})`);
  // Whetstone: chainsaw support in playerDamageMul + global bash passive.
  const wh = await T("whetstoneTest()");
  ok(Math.abs(wh.chainsawRatio - wh.expected) < 1e-9, `chainsaw damage x ${wh.expected} (got ${wh.chainsawRatio})`);
  eq(wh.carbineRatio, 1, "whetstone does not touch non-heavy weapons");
  const ba = await T("bashTest()");
  ok(Math.abs(ba.ratio - ba.expected) < 1e-9, `bash damage x ${ba.expected} (got ${ba.ratio})`);
  // Sifter: grit value multiplier in spawnGrit (deterministic via fixed RNG).
  const si = await T("sifterSpawnTest()");
  ok(si.seed >= 0, "sifter spawn probe found a lucky-free seed");
  ok(Math.abs(si.ratio - si.expected) < 1e-9, `grit value x ${si.expected} (got ${si.ratio})`);
  // Sifter: pickup radius multiplier on the updateGrit magnet line —
  // atomic probe (no live-loop interleaving), plus behavioral pull check.
  const gr = await T("gritRadiusTest()");
  ok(Math.abs(gr.mag2 / gr.mag0 - gr.radiusMul) < 1e-9, `pickup magnet x ${gr.radiusMul} (got ${gr.mag2 / gr.mag0})`);
  ok(Math.abs(gr.d0 - gr.mid) < 1, `base magnet ignores orb at ${gr.mid} (d=${gr.d0})`);
  ok(gr.d2 < gr.mid - 50, `sifter magnet pulls orb at ${gr.mid} (d=${gr.d2})`);
}

console.log("== 12a(m). eventState probe (UI/audio lane) ==");
{
  const idle = await T("eventState('elite_hunt')");
  eq(idle, null, "eventState null when no hunt is active");
  const h = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.settle(); c.god();
    return c.forceHunt();
  });
  const st = await T("eventState('elite_hunt')");
  eq(st.total, h.total, "eventState total = hunt pack size");
  eq(st.remaining, h.total, "eventState remaining = pack size before kills");
  await T("killHunt()");
  const done = await T("eventState('elite_hunt')");
  eq(done, null, "eventState null once the hunt is complete (no longer active)");
  const bogus = await T("eventState('powerup_shower')");
  eq(bogus, null, "eventState null for non-hunt events");
}

console.log("-- page errors --");
ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ").slice(0, 400) : ""}`);
await browser.close();

console.log(`\nbatch12a: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
