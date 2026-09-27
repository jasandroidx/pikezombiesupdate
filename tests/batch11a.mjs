// Batch 11 — Lane 1 (engine/gameplay) tests:
//  1. Patoka Jackpot slot machine (second loot ritual): symbols, probabilities,
//     cost escalation, broke/invalid graceful failures, gambleCache 50/50.
//  2. White River Arc Lance: INITIAL_WEAPONS entry, WEAPON_LEVELS row,
//     draftability/shop unlock, damage ticks + heat visuals.
//  3. Thorned + Wailing elite affixes: behavior, visual tell, probe visibility.
//  4. Indiana-only naming (never Bayville/Griggsville/Illinois).
//
// Pure sections run in plain node via jiti (TS sources imported directly).
//   node_modules/.bin/jiti tests/batch11a.mjs
// Live section runs under Playwright against a dev server (served bundle check).
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch11a.mjs

import {
  INITIAL_WEAPONS, WEAPON_LEVELS, statsForLevel, SHOP_POOL,
  SLOT_MACHINE_NAME, SLOT_SYMBOLS, SLOT_SPIN_BASE, SLOT_SPIN_STEP,
  rollSlotSymbol, classifySlotWin, slotPairSymbol, mulberry32,
} from "../src/game/constants.ts";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

console.log("== 11a(a). slot symbols + pure probability plumbing ==");
eq(SLOT_MACHINE_NAME, "Patoka Jackpot", "machine name");
eq(SLOT_SYMBOLS.map((s) => s.id).join(","), "grit_bag,moonshine,horseshoe,cylinder,seven", "symbol ids");
eq(SLOT_SYMBOLS.map((s) => s.name).join(","), "Grit Bag,Moonshine Jug,Horseshoe,Revolver Cylinder,Seven", "symbol names");
{
  const w = SLOT_SYMBOLS.reduce((a, s) => a + s.w, 0);
  ok(Math.abs(w - 1) < 1e-9, `weights sum to 1 (got ${w})`);
  ok(new Set(SLOT_SYMBOLS.map((s) => s.id)).size === 5, "symbol ids unique");
}
// Deterministic reel walk: a fixed rng sweeps the whole [0,1) range.
{
  const seen = new Set();
  const rng = mulberry32(1234);
  for (let i = 0; i < 5000; i++) seen.add(rollSlotSymbol(rng));
  eq(seen.size, 5, "all five symbols roll (seeded)");
  // Boundary checks: rollSlotSymbol must honor the weight cutoffs.
  const at = (r) => rollSlotSymbol(() => r);
  eq(at(0.0), "grit_bag", "r=0 -> grit_bag");
  eq(at(0.31), "grit_bag", "r=0.31 -> grit_bag");
  eq(at(0.33), "moonshine", "r=0.33 -> moonshine");
  eq(at(0.61), "moonshine", "r=0.61 -> moonshine");
  eq(at(0.63), "horseshoe", "r=0.63 -> horseshoe");
  eq(at(0.81), "horseshoe", "r=0.81 -> horseshoe");
  eq(at(0.83), "cylinder", "r=0.83 -> cylinder");
  eq(at(0.94), "cylinder", "r=0.94 -> cylinder");
  eq(at(0.96), "seven", "r=0.96 -> seven");
  eq(at(0.9999), "seven", "r~1 -> seven");
}
// Jackpot rarity: P(7-7-7) = .05^3 = 1/8000. Over 24000 seeded spins the
// empirical jackpot rate must stay well under 1% and sevens must land.
{
  const rng = mulberry32(777);
  let jackpot = 0, sevens = 0;
  const N = 24000;
  for (let i = 0; i < N; i++) {
    const reels = [rollSlotSymbol(rng), rollSlotSymbol(rng), rollSlotSymbol(rng)];
    if (classifySlotWin(reels) === "jackpot") jackpot++;
    for (const r of reels) if (r === "seven") sevens++;
  }
  const rate = jackpot / N;
  ok(rate < 0.01, `jackpot rare: ${jackpot}/${N} (${(rate * 100).toFixed(3)}%)`);
  ok(sevens > 1000 && sevens < 5000, `seven reels land at the .05 weight (${sevens}/72000 reels)`);
}
console.log("== 11a(b). win classification ==");
eq(classifySlotWin(["seven", "seven", "seven"]), "jackpot", "7-7-7 = jackpot");
eq(classifySlotWin(["grit_bag", "grit_bag", "grit_bag"]), "three", "three grit = three");
eq(classifySlotWin(["moonshine", "moonshine", "moonshine"]), "three", "three jugs = three");
eq(classifySlotWin(["horseshoe", "horseshoe", "horseshoe"]), "three", "three shoes = three");
eq(classifySlotWin(["cylinder", "cylinder", "cylinder"]), "three", "three cylinders = three");
eq(classifySlotWin(["seven", "seven", "grit_bag"]), "pair", "pair of sevens = pair");
eq(classifySlotWin(["seven", "grit_bag", "seven"]), "pair", "split pair = pair");
eq(classifySlotWin(["moonshine", "horseshoe", "cylinder"]), "none", "all different = none");
eq(classifySlotWin(["seven", "seven"]), "none", "short input = none");
eq(classifySlotWin(null), "none", "null input = none");
eq(slotPairSymbol(["seven", "seven", "grit_bag"]), "seven", "pair symbol (first two)");
eq(slotPairSymbol(["seven", "grit_bag", "seven"]), "seven", "pair symbol (split)");
eq(slotPairSymbol(["moonshine", "horseshoe", "moonshine"]), "moonshine", "pair symbol (bookends)");
eq(slotPairSymbol(["moonshine", "horseshoe", "cylinder"]), null, "no pair -> null");

console.log("== 11a(c). spin cost escalation ==");
eq(SLOT_SPIN_BASE, 150, "base cost 150");
eq(SLOT_SPIN_STEP, 50, "+50 per spin");
for (const [spins, want] of [[0, 150], [1, 200], [2, 250], [3, 300], [10, 650]]) {
  eq(SLOT_SPIN_BASE + SLOT_SPIN_STEP * spins, want, `cost after ${spins} spins = ${want}`);
}

console.log("== 11a(d). arc lance data ==");
{
  const w = INITIAL_WEAPONS.find((x) => x.id === "arc_lance");
  ok(!!w, "arc_lance in INITIAL_WEAPONS");
  eq(w?.name, "White River Arc Lance", "lance name");
  eq(w?.unlocked, false, "lance locked by default (shop unlock)");
  eq(w?.cost, 600, "lance unlock cost");
  const row = WEAPON_LEVELS["arc_lance"];
  ok(!!row, "arc_lance WEAPON_LEVELS row exists");
  for (const k of ["dmg", "cnt", "rad", "spd", "cd"]) eq(row[k].length, 5, `row.${k} has 5 levels`);
  // Level 1 of the row matches the INITIAL_WEAPONS base stats.
  eq(row.dmg[0], w.damage, "row dmg[0] = base damage");
  eq(row.cnt[0], w.pellets, "row cnt[0] = base pellets (ticks)");
  eq(row.rad[0], w.range, "row rad[0] = base range");
  eq(row.spd[0], w.bulletSpeed, "row spd[0] = base bulletSpeed (beam width)");
  ok(Math.abs(1 / row.cd[0] - w.fireRate) < 0.02, "row cd[0] ~ 1/fireRate");
  const l1 = statsForLevel("arc_lance", 1), l5 = statsForLevel("arc_lance", 5);
  ok(l1 && l5 && l5.dmg > l1.dmg && l5.cnt >= l1.cnt && l5.cd < l1.cd, "row scales up with level");
  // No beam/lance existed in INITIAL_WEAPONS before this batch.
  const others = INITIAL_WEAPONS.filter((x) => x.id !== "arc_lance" && /lance|beam/.test(x.id));
  eq(others.length, 0, "no other beam/lance weapon ids");
  ok(new Set(INITIAL_WEAPONS.map((x) => x.id)).size === INITIAL_WEAPONS.length, "weapon ids unique");
}
console.log("== 11a(e). lance shop-unlockable ==");
{
  const offer = SHOP_POOL.find((o) => o.weaponId === "arc_lance");
  ok(!!offer, "SHOP_POOL has an arc_lance unlock offer");
  eq(offer?.kind, "unlock", "offer kind = unlock");
  eq(offer?.repeatable, false, "unlock not repeatable");
  ok(new Set(SHOP_POOL.map((o) => o.id)).size === SHOP_POOL.length, "shop offer ids unique");
}

console.log("== 11a(f). Indiana-only naming (pure) ==");
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
// Fresh-break guarantee: inBreak() can catch a stale break's tail (the break
// is only ~6s). Cycle once so the slot checks below run inside a new break.
await T("skipBreak()");
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.waveInfo().state === "active", null, { timeout: 30000 });
await T("toBreak()");
await inBreak();

console.log("== 11a(g). slot machine: costs, escalation, graceful failures ==");
{
  const s0 = await T("slotState()");
  eq(s0.cost, 150, "first spin costs 150");
  eq(s0.spins, 0, "zero spins this break");
  eq(s0.state, "break", "spinning during the wave break");
  eq(s0.machine, "Patoka Jackpot", "machine name probe");
  // Broke: graceful { ok:false }, no throw, grit untouched.
  await T("setGrit(0)");
  const broke = await T("slotSpin()");
  eq(broke.ok, false, "broke spin rejected");
  eq(broke.reason, "broke", "broke reason");
  eq(broke.cost, 150, "broke reports the cost");
  // Mid-wave: not allowed.
  await T("skipBreak()");
  await page.waitForFunction(
    () => window.__controlsTest && window.__controlsTest.waveInfo().state === "active",
    null, { timeout: 30000 });
  const mid = await T("slotSpin()");
  eq(mid.ok, false, "mid-wave spin rejected");
  eq(mid.reason, "not-break", "not-break reason");
  await T("toBreak()");
  await inBreak();
  // Escalation: 150 -> 200 -> 250, grit drains by the exact cost.
  // Deterministic reels (loser spin = +25 consolation) so the drain is exact.
  await T("slotReset()");
  await T("setGrit(1000000)");
  const q1 = await T(`slotRigSpin(["grit_bag","moonshine","horseshoe"])`);
  eq(q1.ok, true, "rigged spin ok");
  eq(q1.cost, 150, "spin 1 cost 150");
  eq(q1.grit, 1000000 - 150 + 25, "spin 1 drains exactly 150 minus the +25 consolation");
  const q2 = await T(`slotRigSpin(["grit_bag","moonshine","horseshoe"])`);
  eq(q2.cost, 200, "spin 2 cost 200 (+50)");
  eq(q2.grit, 1000000 - 150 + 25 - 200 + 25, "spin 2 drains exactly 200");
  eq(q2.spins, 2, "spin counter at 2");
  // The live machine (random reels) keeps the contract shape.
  const r1 = await T("slotSpin()");
  const r2 = await T("slotSpin()");
  eq(r1.ok && r2.ok, true, "live spins ok");
  eq(r1.cost, 250, "live spin cost follows escalation");
  for (const r of [q1, q2, r1, r2]) {
    ok(Array.isArray(r.reels) && r.reels.length === 3, "reels shape [s0,s1,s2]");
    ok(typeof r.jackpot === "boolean" && typeof r.prize === "string" && typeof r.prizeDetail === "object", "result shape");
  }
  const st = await T("slotState()");
  eq(st.cost, 350, "next spin costs 350 (4 spins this break)");
}
console.log("== 11a(h). slot probabilities sane over many spins ==");
{
  const dist = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.settle(); c.slotReset(); c.setGrit(200000000);
    const kinds = { jackpot: 0, three: 0, pair: 0, none: 0 };
    const THREE = new Set(["GRIT SHOWER", "MOONSHINE RUN", "LUCKY SHOE", "FULL CYLINDER"]);
    const PAIR = new Set(["PAIR", "PAIR OF JUGS", "PAIR OF SHOES", "LUCKY SEVENS"]);
    let sevens = 0, okCount = 0;
    // Total cost over N spins = 150N + 50*N(N-1)/2; N=1500 -> ~56.4M, so 2e8
    // grit never goes broke.
    const N = 1500;
    for (let i = 0; i < N; i++) {
      const r = c.slotSpin();
      if (!r.ok) continue;
      okCount++;
      if (r.jackpot) kinds.jackpot++;
      else if (r.prize === "CLANK") kinds.none++;
      else if (THREE.has(r.prize)) kinds.three++;
      else if (PAIR.has(r.prize)) kinds.pair++;
      else kinds.none++;
      for (const s of r.reels) if (s === "seven") sevens++;
    }
    return { N, okCount, kinds, sevens, spins: c.slotState().spins };
  });
  eq(dist.okCount, dist.N, "all 1500 spins ok (never broke with 2e8 grit)");
  ok(dist.kinds.jackpot / dist.N < 0.01, `jackpot rare live: ${dist.kinds.jackpot}/${dist.N}`);
  ok(dist.kinds.pair > dist.N * 0.1, `pairs land (${dist.kinds.pair})`);
  ok(dist.sevens > 100 && dist.sevens < 400, `seven reels near .05 weight (${dist.sevens}/4500)`);
  ok(dist.kinds.three + dist.kinds.pair + dist.kinds.jackpot > 0, "wins happen");
  eq(dist.spins, dist.N, "spin counter tracks every spin");
}
console.log("== 11a(i). slot jackpot: maxes a weapon, then the evolution check ==");
{
  // Unlock a fresh level-1 weapon so the jackpot has a climb to make.
  const j = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.settle();
    c.unlockW("lever_rifle");
    const ids = ["revolver", "shotgun", "lever_rifle"];
    const before = {};
    for (const id of ids) before[id] = c.weapLvl(id);
    const r = c.slotRig(["seven", "seven", "seven"]);
    const after = {};
    for (const id of ids) after[id] = c.weapLvl(id);
    return { r, before, after };
  });
  eq(j.r.jackpot, true, "rigged 7-7-7 is a jackpot");
  eq(j.r.prize, "JACKPOT", "jackpot prize label");
  ok(j.r.detail && typeof j.r.detail.weapon === "string", "jackpot names the maxed weapon");
  const picked = j.r.detail.weapon;
  eq(j.after[picked], 5, `picked weapon (${picked}) maxed to table level 5`);
  eq(j.r.detail.upgrades, 5 - j.before[picked], "upgrade count matches the climb");
  ok(j.after[picked] >= j.before[picked], "jackpot never downgrades");
  ok(Object.values(j.after).every((lv) => lv <= 5), "no weapon exceeds max table level");
  ok(j.r.detail.evolved === null || typeof j.r.detail.evolved === "string", "evolution check ran");
  // Other three-of-a-kinds and pairs grant without throwing.
  const p = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.settle();
    const g0 = c.slotState().grit;
    const three = c.slotRig(["grit_bag", "grit_bag", "grit_bag"]);
    const pair = c.slotRig(["moonshine", "moonshine", "horseshoe"]);
    const none = c.slotRig(["grit_bag", "moonshine", "horseshoe"]);
    const bad = c.slotRig(["nope"]);
    const g1 = c.slotState().grit;
    return { three, pair, none, bad, g0, g1 };
  });
  eq(p.three.jackpot, false, "three grit is not a jackpot");
  eq(p.three.prize, "GRIT SHOWER", "three grit = grit shower");
  ok(p.g1 > p.g0, "grit shower actually grants grit");
  eq(p.pair.prize, "PAIR OF JUGS", "pair of jugs prize");
  eq(p.none.prize, "CLANK", "loser spin clanks");
  eq(p.bad.prize, "INVALID", "rigged garbage is graceful");
}
console.log("== 11a(j). spins reset each wave ==");
{
  const r = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.settle(); c.slotReset(); c.setGrit(1000000);
    c.slotSpin(); c.slotSpin();
    const before = c.slotState().spins;
    return { before };
  });
  eq(r.before, 2, "two spins recorded");
  await T("skipBreak()"); // next wave starts
  await T("toBreak()");   // clear it -> wave completes -> break, reset fires
  await inBreak();
  const after = await T("slotState()");
  eq(after.spins, 0, "spins reset on the new break");
  eq(after.cost, 150, "cost back to base");
}

console.log("== 11a(k). gambleCache: 50/50 + prize granting + graceful ==");
{
  const d = await T("gambleDist(2000)");
  const rate = d.wins / d.n;
  ok(rate > 0.4 && rate < 0.6, `gamble ~50/50 (${d.wins}/${d.n} = ${rate.toFixed(3)})`);
  const bad = await T("gambleBad()");
  eq(bad.nullIn, false, "gamble(null) -> false, no throw");
  eq(bad.strIn, false, "gamble('nope') -> false, no throw");
  eq(bad.shortIn, false, "gamble(2-sym) -> false, no throw");
  const g = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.settle();
    const s0 = c.applyCache(["diamond", "diamond", "diamond"], false).scrap;
    const win = c.gambleF(["diamond", "diamond", "diamond"], true);
    const s1 = c.applyCache(["diamond", "diamond", "diamond"], false).scrap;
    const lose = c.gambleF(["diamond", "diamond", "diamond"], false);
    return { s0, win, s1, lose };
  });
  eq(g.win, true, "forced win returns true");
  ok(g.s1 > g.s0, "forced win grants the cache prize (scrap up)");
  eq(g.lose, false, "forced loss returns false");
}

console.log("== 11a(l). arc lance: damage ticks + heat visuals ==");
{
  const info = await T("lanceInfo()");
  eq(info.id, "arc_lance", "lance probe sees the weapon");
  eq(info.row, true, "WEAPON_LEVELS row wired");
  eq(info.shop, true, "shop unlock offer present");
  ok(info.ids.includes("arc_lance"), "arc_lance among weapon ids");
  // Cluster the horde, then fire the lance through the real fire path.
  const f = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.settle(); c.god();
    for (let i = 0; i < 12; i++) c.pushZ("shambler", 300 + (i % 4) * 40, ((i / 4) | 0) * 40);
    c.pinAll();
    const r = c.lanceFire();
    return r;
  });
  eq(f.ok, true, "lance fires");
  ok(f.beams >= 1, `beam created (beams=${f.beams})`);
  ok(f.hpAfter < f.hpBefore, `damage ticks landed (${f.hpBefore} -> ${f.hpAfter})`);
  ok(f.info && f.info.hits > 0, `beam hit zombies (hits=${f.info && f.info.hits})`);
  ok(f.heatSegs > 0, `heat-glow beam segments rendered (${f.heatSegs})`);
}
console.log("== 11a(m). thorned affix: reflect + tell + probe ==");
{
  const t = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.settle(); c.god();
    const i = c.forceAffix("shambler", "thorned");
    const affix = c.zAffix(i);
    const info = c.affixInfo(i);
    const r = c.thornTest(i);
    return { i, affix, info, r };
  });
  eq(t.affix, "thorned", "zAffix exposes thorned");
  eq(t.info.affix, "thorned", "affixInfo exposes thorned");
  ok(t.r.back > 0, `thorns reflect damage (back=${t.r.back})`);
  ok(t.r.hp1 < t.r.hp0, `player takes the reflected hit (${t.r.hp0} -> ${t.r.hp1})`);
  // Bash path also reflects (tryBash hook).
  const b = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.settle(); c.god();
    const i = c.forceAffix("shambler", "thorned");
    return c.bashAt(i);
  });
  ok(b.hp1 < b.hp0, `bash on thorned elite reflects (${b.hp0} -> ${b.hp1})`);
}
console.log("== 11a(n). wailing affix: frenzy + tell + probe ==");
{
  const w = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.settle(); c.god();
    // a little pack around the wailer
    for (let i = 0; i < 6; i++) c.pushZ("shambler", 200 + i * 30, 0);
    const i = c.forceAffix("shambler", "wailing");
    const info = c.affixInfo(i);
    const r = c.wailTick(i, 10);
    const after = c.affixInfo(i);
    return { info, r, after };
  });
  eq(w.info.affix, "wailing", "zAffix exposes wailing");
  ok(w.info.wailCd > 0, `wailer spawns with a wail timer (${w.info.wailCd})`);
  ok(w.r.fired, "wail went off");
  ok(w.r.frenzied >= 2, `nearby zombies frenzied (${w.r.frenzied})`);
  ok(w.after.wailCd > 1, "wail timer reset after firing");
}
console.log("== 11a(o). assignAffix deals the new affixes ==");
{
  const a = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.settle(); c.god();
    const seen = new Set();
    for (let i = 0; i < 120; i++) seen.add(c.spawnElite2().affix);
    return [...seen].sort();
  });
  ok(a.includes("thorned"), `thorned assigned (${a.join(",")})`);
  ok(a.includes("wailing"), `wailing assigned (${a.join(",")})`);
  ok(a.includes("volatile") && a.includes("frosted"), "old affixes still assigned");
}

console.log("-- page errors --");
ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ").slice(0, 400) : ""}`);
await browser.close();

console.log(`\nbatch11a: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
