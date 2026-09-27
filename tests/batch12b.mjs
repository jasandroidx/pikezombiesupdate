// Batch 12 — Lane 2 (content) tests: three new synergy boons + two evolution rows.
// Pure sections run in plain node via jiti (TS sources imported directly).
//   node_modules/.bin/jiti tests/batch12b.mjs
// Live section runs under Playwright against a dev server (served bundle check).
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch12b.mjs

import {
  EVOLUTIONS, INITIAL_WEAPONS, SPECIAL_WEAPON_DEFS, evolutionReady,
  WEAPON_MAX_TABLE_LEVEL,
} from "../src/game/constants.ts";
import {
  BOON_CATALOG, rollBoons, supportApplies, boonTagsOf,
  copperheadMaxStacks, copperheadPoisonDps, copperheadDurationSec, copperheadApplies,
  whetstoneBashMul, whetstoneChainsawMul, whetstoneApplies,
  sifterRadiusMul, sifterValueMul,
  b12BoonSummary,
} from "../src/game/boons.ts";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
function approx(a, b, label, tol = 1e-9) {
  ok(Math.abs(a - b) <= tol, `${label} (got ${a}, want ${b})`);
}

const NEW = ["copperhead", "whetstone", "sifter"];
const byId = (id) => BOON_CATALOG.find((b) => b.id === id);
const BADNAME = /bayville|griggsville|illinois/i;

console.log("== 12b(a). catalog entries ==");
eq(byId("copperhead")?.name, "Copperhead Rounds", "copperhead name");
eq(byId("copperhead")?.rarity, "uncommon", "copperhead rarity");
eq(byId("whetstone")?.name, "Whetstone", "whetstone name");
eq(byId("whetstone")?.rarity, "uncommon", "whetstone rarity");
eq(byId("sifter")?.name, "White River Sifter", "sifter name");
eq(byId("sifter")?.rarity, "common", "sifter rarity");
for (const id of NEW) {
  ok(!byId(id)?.hidden, `${id} is draftable (not hidden)`);
  ok(byId(id)?.blurb && byId(id).blurb.length > 20, `${id} has a real blurb`);
}
// Id-uniqueness: no collision with any existing boon.
const ids = BOON_CATALOG.map((b) => b.id);
eq(new Set(ids).size, ids.length, "no duplicate boon ids");

console.log("== 12b(b). affinity tags ==");
// copperhead links rapid + precise (trigger-finger builds); whetstone links
// heavy (chainsaw); sifter is an untagged global economy passive.
eq(boonTagsOf("copperhead").sort().join(","), "precise,rapid", "copperhead tags");
eq(boonTagsOf("whetstone").join(","), "heavy", "whetstone tag");
eq(boonTagsOf("sifter").length, 0, "sifter untagged (global passive)");
// copperhead applies to carbine (rapid) and revolver (precise), not to
// shotgun or chainsaw (no shared tag).
ok(copperheadApplies({ copperhead: 1 }, "carbine"), "copperhead applies to carbine");
ok(copperheadApplies({ copperhead: 1 }, "revolver"), "copperhead applies to revolver");
ok(!copperheadApplies({ copperhead: 1 }, "shotgun"), "copperhead does not apply to shotgun");
ok(!copperheadApplies({ copperhead: 1 }, "chainsaw"), "copperhead does not apply to chainsaw");
ok(!copperheadApplies({}, "carbine"), "copperhead not applied at 0 stacks");
// whetstone chainsaw half is tag-gated to heavy weapons.
ok(whetstoneApplies({ whetstone: 1 }, "chainsaw"), "whetstone applies to chainsaw");
ok(whetstoneApplies({ whetstone: 1 }, "mortar"), "whetstone applies to mortar (heavy)");
ok(!whetstoneApplies({ whetstone: 1 }, "revolver"), "whetstone does not apply to revolver");

console.log("== 12b(c). effect math ==");
// Copperhead: stacking poison. Max stacks grow with rank; dps per stack per
// second; duration grows with rank.
eq(copperheadMaxStacks(0), 2, "copperhead max stacks r0");
eq(copperheadMaxStacks(1), 3, "copperhead max stacks r1");
eq(copperheadMaxStacks(3), 5, "copperhead max stacks r3");
eq(copperheadPoisonDps(0), 0, "copperhead dps r0");
eq(copperheadPoisonDps(2), 10, "copperhead dps r2 (per stack / sec)");
approx(copperheadDurationSec(1), 3.0, "copperhead duration r1");
approx(copperheadDurationSec(4), 4.5, "copperhead duration r4");
// Whetstone: bash +25%/rank, chainsaw +15%/rank.
approx(whetstoneBashMul(1), 1.25, "whetstone bash r1");
approx(whetstoneBashMul(3), 1.75, "whetstone bash r3");
approx(whetstoneBashMul(5), 2.25, "whetstone bash r5");
approx(whetstoneChainsawMul(1), 1.15, "whetstone chainsaw r1");
approx(whetstoneChainsawMul(4), 1.6, "whetstone chainsaw r4");
// Sifter: pickup radius +20%/rank, grit value +10%/rank.
approx(sifterRadiusMul(1), 1.2, "sifter radius r1");
approx(sifterRadiusMul(3), 1.6, "sifter radius r3");
approx(sifterValueMul(1), 1.1, "sifter value r1");
approx(sifterValueMul(5), 1.5, "sifter value r5");
ok(sifterRadiusMul(0) === 1 && sifterValueMul(0) === 1, "sifter neutral at r0");

// b12BoonSummary: the probe-visibility hook mirrors the helpers exactly.
{
  const s = b12BoonSummary({ copperhead: 2, whetstone: 3, sifter: 1 });
  eq(s.copperhead.rank, 2, "summary copperhead rank");
  eq(s.copperhead.maxStacks, copperheadMaxStacks(2), "summary copperhead maxStacks");
  eq(s.copperhead.dps, copperheadPoisonDps(2), "summary copperhead dps");
  approx(s.copperhead.durationSec, copperheadDurationSec(2), "summary copperhead duration");
  approx(s.whetstone.bashMul, whetstoneBashMul(3), "summary whetstone bashMul");
  approx(s.whetstone.chainsawMul, whetstoneChainsawMul(3), "summary whetstone chainsawMul");
  approx(s.sifter.radiusMul, sifterRadiusMul(1), "summary sifter radiusMul");
  approx(s.sifter.valueMul, sifterValueMul(1), "summary sifter valueMul");
  const zero = b12BoonSummary({});
  eq(zero.copperhead.rank, 0, "summary empty copperhead rank");
  ok(zero.whetstone.bashMul === 1 && zero.sifter.radiusMul === 1, "summary empty is neutral");
}

console.log("== 12b(d). stack caps in rollBoons ==");
// Each new boon caps at 5 stacks and is then excluded from the pool.
for (const id of NEW) {
  const offers = rollBoons({ [id]: 5 }, 0, 5, 0, 0, new Set());
  ok(!offers.some((b) => b.id === id), `${id} excluded at 5 stacks`);
  const open = rollBoons({ [id]: 4 }, 0, 5, 0, 0, new Set());
  ok(open.length === 3, `${id} draft returns 3 picks at 4 stacks`);
}

console.log("== 12b(e). unforced draft appearance (node) ==");
{
  const seen = new Set();
  for (let i = 0; i < 400; i++) for (const b of rollBoons({}, 0, 5, 0, 0)) seen.add(b.id);
  for (const id of NEW) ok(seen.has(id), `${id} appears across unforced drafts`);
}

console.log("== 12b(f). evolution rows ==");
const thunder = EVOLUTIONS.find((r) => r.baseWeapon === "arc_lance");
const grind = EVOLUTIONS.find((r) => r.baseWeapon === "orbiter");
ok(!!thunder, "arc_lance evolution row exists");
ok(!!grind, "orbiter evolution row exists");
for (const [row, label] of [[thunder, "arc_lance"], [grind, "orbiter"]]) {
  const weaponExists = INITIAL_WEAPONS.some((w) => w.id === row.baseWeapon) ||
    Object.prototype.hasOwnProperty.call(SPECIAL_WEAPON_DEFS, row.baseWeapon);
  ok(weaponExists, `${label}: baseWeapon exists`);
  ok(!!byId(row.requiredBoon), `${label}: requiredBoon ${row.requiredBoon} in catalog`);
  ok(!!byId(row.requiredPicks.boonId), `${label}: requiredPicks boon ${row.requiredPicks.boonId} in catalog`);
  ok(row.requiredStacks >= 1 && row.requiredPicks.count >= 1, `${label}: positive stack/pick counts`);
  ok(row.evolvedName.length > 3 && row.evolvedDescription.length > 20 && row.evolvedRadio.length > 10, `${label}: flavor fields populated`);
  // evolutionReady gate: accepts a complete setup, rejects incomplete ones.
  const complete = { [row.requiredBoon]: row.requiredStacks, [row.requiredPicks.boonId]: row.requiredPicks.count };
  ok(evolutionReady(row, { upgradeLevel: WEAPON_MAX_TABLE_LEVEL }, complete), `${label}: gate accepts complete setup`);
  ok(!evolutionReady(row, { upgradeLevel: WEAPON_MAX_TABLE_LEVEL }, { [row.requiredBoon]: row.requiredStacks - 1, [row.requiredPicks.boonId]: row.requiredPicks.count }), `${label}: gate rejects missing required stacks`);
  ok(!evolutionReady(row, { upgradeLevel: WEAPON_MAX_TABLE_LEVEL }, { [row.requiredBoon]: row.requiredStacks, [row.requiredPicks.boonId]: row.requiredPicks.count - 1 }), `${label}: gate rejects missing filler picks`);
  ok(!evolutionReady(row, { upgradeLevel: WEAPON_MAX_TABLE_LEVEL - 1 }, complete), `${label}: gate rejects non-max weapon level`);
  ok(!evolutionReady(row, null, complete), `${label}: gate rejects missing weapon`);
  // Balance line: mults in the same band as the existing rows.
  ok((row.dmgMul ?? 0) >= 1.2 && (row.dmgMul ?? 0) <= 2.0, `${label}: dmgMul in band`);
  ok((row.fireMul ?? 0) >= 1.1 && (row.fireMul ?? 0) <= 2.0, `${label}: fireMul in band`);
}
eq(thunder.evolvedName, "White River Thunderhead", "thunderhead name");
eq(grind.evolvedName, "Silas's Grindwheel", "grindwheel name");
eq(thunder.requiredBoon, "copperhead", "thunderhead requires copperhead");
eq(grind.requiredBoon, "whetstone", "grindwheel requires whetstone");

console.log("== 12b(g). Indiana-only naming ==");
{
  const strings = [];
  for (const id of NEW) {
    const b = byId(id);
    strings.push([id, b.name], [id, b.blurb]);
  }
  for (const row of [thunder, grind]) {
    strings.push([row.baseWeapon, row.evolvedName], [row.baseWeapon, row.evolvedDescription], [row.baseWeapon, row.evolvedRadio]);
  }
  for (const [src, s] of strings) ok(!BADNAME.test(s), `${src}: Indiana-only naming (${JSON.stringify(s.slice(0, 40))}…)`);
}

// ---------------------------------------------------------------------------
// Live section: Playwright against the dev server.
const PZ_URL = process.env.PZ_URL || "http://127.0.0.1:8082";
console.log("\n== live (Playwright): served bundle carries the Batch 12 content ==");
{
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: "/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(PZ_URL, { waitUntil: "networkidle" });
  await page.locator("[data-character-id]").first().waitFor({ timeout: 15000 });
  // String body: jiti must not rewrite the dynamic import inside evaluate.
  const inBundle = await page.evaluate(`(async () => {
    const m = await import("/src/game/boons.ts");
    const c = await import("/src/game/constants.ts");
    const ids = ["copperhead", "whetstone", "sifter"];
    const found = {};
    for (const id of ids) found[id] = !!m.BOON_CATALOG.find((b) => b.id === id);
    // Forced offer: banish everything else, all three must be dealable.
    const all = m.BOON_CATALOG.map((b) => b.id);
    const keep = new Set([...ids, "lead"]);
    const banish = new Set(all.filter((x) => !keep.has(x)));
    const forced = new Set();
    for (let i = 0; i < 40; i++) for (const b of m.rollBoons({}, 0, 5, 0, 0, banish)) forced.add(b.id);
    // Unforced drafts: all three must appear across natural offers.
    const natural = new Set();
    for (let i = 0; i < 60; i++) for (const b of m.rollBoons({}, 0, 5, 0, 0)) natural.add(b.id);
    // Mechanical effects: module helpers + the probe-visibility summary.
    const mech = {
      poisonDps: m.copperheadPoisonDps(2),
      maxStacks: m.copperheadMaxStacks(2),
      duration: m.copperheadDurationSec(2),
      bashMul: m.whetstoneBashMul(3),
      chainsawMul: m.whetstoneChainsawMul(3),
      radiusMul: m.sifterRadiusMul(2),
      valueMul: m.sifterValueMul(2),
      appliesCh: m.copperheadApplies({ copperhead: 1 }, "carbine"),
      appliesWh: m.whetstoneApplies({ whetstone: 1 }, "chainsaw"),
      summary: m.b12BoonSummary({ copperhead: 2, whetstone: 3, sifter: 2 }),
    };
    // Evolution rows present in the served constants module.
    const evos = {};
    for (const row of c.EVOLUTIONS) evos[row.baseWeapon] = row.evolvedName;
    const gate = c.evolutionReady(
      c.EVOLUTIONS.find((r) => r.baseWeapon === "arc_lance"),
      { upgradeLevel: c.WEAPON_MAX_TABLE_LEVEL },
      { copperhead: 2, storm: 3 }
    );
    return { found, dealt: ids.map((id) => forced.has(id)), natural: ids.map((id) => natural.has(id)), mech, evos, gate };
  })()`);
  for (const id of NEW) ok(inBundle.found[id] === true, `served bundle has ${id}`);
  ok(inBundle.dealt.every(Boolean), "served rollBoons deals all three (forced offer)");
  ok(inBundle.natural.every(Boolean), "served rollBoons deals all three (unforced drafts)");
  // Mechanical effects live in the served bundle.
  ok(inBundle.mech.poisonDps === 10, `served copperhead dps r2 = ${inBundle.mech.poisonDps}`);
  ok(inBundle.mech.maxStacks === 4, `served copperhead maxStacks r2 = ${inBundle.mech.maxStacks}`);
  ok(Math.abs(inBundle.mech.duration - 3.5) < 1e-9, `served copperhead duration r2 = ${inBundle.mech.duration}`);
  ok(Math.abs(inBundle.mech.bashMul - 1.75) < 1e-9, `served whetstone bashMul r3 = ${inBundle.mech.bashMul}`);
  ok(Math.abs(inBundle.mech.chainsawMul - 1.45) < 1e-9, `served whetstone chainsawMul r3 = ${inBundle.mech.chainsawMul}`);
  ok(Math.abs(inBundle.mech.radiusMul - 1.4) < 1e-9, `served sifter radiusMul r2 = ${inBundle.mech.radiusMul}`);
  ok(Math.abs(inBundle.mech.valueMul - 1.2) < 1e-9, `served sifter valueMul r2 = ${inBundle.mech.valueMul}`);
  ok(inBundle.mech.appliesCh === true && inBundle.mech.appliesWh === true, "served tag gating works (carbine, chainsaw)");
  eq(inBundle.mech.summary.copperhead.maxStacks, 4, "served b12BoonSummary copperhead");
  ok(Math.abs(inBundle.mech.summary.whetstone.bashMul - 1.75) < 1e-9, "served b12BoonSummary whetstone");
  ok(Math.abs(inBundle.mech.summary.sifter.valueMul - 1.2) < 1e-9, "served b12BoonSummary sifter");
  // Evolution rows served, and the gate accepts a complete arc_lance setup.
  eq(inBundle.evos["arc_lance"], "White River Thunderhead", "served arc_lance evolution");
  eq(inBundle.evos["orbiter"], "Silas's Grindwheel", "served orbiter evolution");
  ok(inBundle.gate === true, "served evolutionReady accepts complete arc_lance setup");

  // Probe path: start a run, grant boons through the engine's takeBoonDirect
  // probe, and verify the summary (the probe-visibility hook) reflects the
  // granted ranks.
  const startBtn = page.getByText("Survival · this place");
  await startBtn.waitFor({ state: "visible", timeout: 15000 });
  await startBtn.click();
  await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 30000 });
  await page.evaluate(`window.__controlsTest.god()`);
  const probe = await page.evaluate(`(() => {
    const t = window.__controlsTest;
    if (!t || !t.takeBoonDirect) return null;
    const ch = t.takeBoonDirect("copperhead");
    const ch2 = t.takeBoonDirect("copperhead");
    const wh = t.takeBoonDirect("whetstone");
    const si = t.takeBoonDirect("sifter");
    return { ch, ch2, wh, si };
  })()`);
  ok(probe && probe.ch === 1 && probe.ch2 === 2, `takeBoonDirect grants copperhead (got ${JSON.stringify(probe)})`);
  ok(probe && probe.wh === 1 && probe.si === 1, "takeBoonDirect grants whetstone + sifter");
  const probeMech = await page.evaluate(`(async () => {
    const m = await import("/src/game/boons.ts");
    return m.b12BoonSummary({ copperhead: 2, whetstone: 1, sifter: 1 });
  })()`);
  eq(probeMech.copperhead.dps, 10, "probe summary copperhead dps at 2 stacks");
  ok(Math.abs(probeMech.whetstone.bashMul - 1.25) < 1e-9, "probe summary whetstone bashMul at 1 stack");
  ok(Math.abs(probeMech.sifter.radiusMul - 1.2) < 1e-9, "probe summary sifter radiusMul at 1 stack");

  ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await browser.close();
}

console.log(`\nbatch12b: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
