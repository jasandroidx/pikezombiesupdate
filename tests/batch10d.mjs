// Batch 10 — Lane 4 (boons/content) tests: the four new synergy boons.
// Pure sections run in plain node via jiti (TS sources imported directly).
//   node_modules/.bin/jiti tests/batch10d.mjs
// Live section runs under Playwright against a dev server (served bundle check).
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch10d.mjs

import { AFFINITY_TAGS } from "../src/game/constants.ts";
import {
  BOON_CATALOG, RARITY_WEIGHT, rollBoons, supportApplies, boonTagsOf,
  tracerPierceBonus, tracerSpeedMul,
  saltCircleDefenseMul, saltCircleApplies,
  cornLiquorFireRateMul, cornLiquorMoveMul,
  brineExplosionMul, brinePatch,
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

const NEW = ["tracer", "saltcircle", "cornliquor", "brinebarrel"];
const byId = (id) => BOON_CATALOG.find((b) => b.id === id);

console.log("== 10d(a). catalog entries ==");
eq(byId("tracer")?.name, "Tracer Rounds", "tracer name");
eq(byId("tracer")?.rarity, "uncommon", "tracer rarity");
eq(byId("saltcircle")?.name, "Salt Circle", "saltcircle name");
eq(byId("saltcircle")?.rarity, "common", "saltcircle rarity");
eq(byId("cornliquor")?.name, "Corn Liquor", "cornliquor name");
eq(byId("cornliquor")?.rarity, "common", "cornliquor rarity");
eq(byId("brinebarrel")?.name, "Brine Barrel", "brinebarrel name");
eq(byId("brinebarrel")?.rarity, "rare", "brinebarrel rarity");
for (const id of NEW) {
  ok(!!byId(id), `${id} in BOON_CATALOG`);
  eq(byId(id)?.hidden, undefined, `${id} is not hidden`);
  ok(typeof byId(id)?.blurb === "string" && byId(id).blurb.length > 0, `${id} has a blurb`);
  ok(byId(id)?.rarity in RARITY_WEIGHT, `${id} rarity is a real RARITY_WEIGHT tier`);
}
eq(new Set(BOON_CATALOG.map((b) => b.id)).size, BOON_CATALOG.length, "boon ids are unique");

console.log("== 10d(b). affinity tags ==");
// tracer links precise + scatter (ricochet/fork geometry families);
// saltcircle is the tagged defensive support (tube-fed only).
eq(boonTagsOf("tracer").sort().join(","), "precise,scatter", "tracer tags");
eq(boonTagsOf("saltcircle").join(","), "tube-fed", "saltcircle tag");
eq(boonTagsOf("cornliquor").length, 0, "cornliquor untagged (global passive)");
eq(boonTagsOf("brinebarrel").length, 0, "brinebarrel untagged (explosions are not weapons)");
const vocab = new Set(AFFINITY_TAGS);
for (const id of NEW) for (const t of boonTagsOf(id)) ok(vocab.has(t), `${id} tag "${t}" in AFFINITY_TAGS`);
// Untagged boons are not tag-gated (Batch 8/9 convention).
for (const id of ["cornliquor", "brinebarrel"]) {
  eq(supportApplies(id, "shotgun"), true, `untagged ${id} applies (shotgun)`);
  eq(supportApplies(id, "chainsaw"), true, `untagged ${id} applies (chainsaw)`);
}

console.log("== 10d(c). rank scaling math ==");
// Tracer: +1 pierce / +15% speed per rank.
eq(tracerPierceBonus(1), 1, "tracer pierce r1");
eq(tracerPierceBonus(3), 3, "tracer pierce r3");
eq(tracerPierceBonus(5), 5, "tracer pierce r5 (cap)");
approx(tracerSpeedMul(1), 1.15, "tracer speed r1");
approx(tracerSpeedMul(2), 1.30, "tracer speed r2");
approx(tracerSpeedMul(5), 1.75, "tracer speed r5 (cap)");
// Salt Circle: −8% damage taken per rank.
approx(saltCircleDefenseMul(0), 1, "saltcircle defense r0");
approx(saltCircleDefenseMul(1), 0.92, "saltcircle defense r1");
approx(saltCircleDefenseMul(2), 0.84, "saltcircle defense r2");
approx(saltCircleDefenseMul(6), 0.52, "saltcircle defense r6 (cap)");
ok(saltCircleDefenseMul(99) >= 0, "saltcircle defense never negative");
// Corn Liquor: +12% fire rate, −6% move speed per rank.
approx(cornLiquorFireRateMul(1), 1.12, "cornliquor fire rate r1");
approx(cornLiquorFireRateMul(3), 1.36, "cornliquor fire rate r3");
approx(cornLiquorMoveMul(1), 0.94, "cornliquor move r1");
approx(cornLiquorMoveMul(3), 0.82, "cornliquor move r3");
approx(cornLiquorMoveMul(5), 0.70, "cornliquor move r5 (cap)");
ok(cornLiquorMoveMul(99) > 0, "cornliquor move never zeroes out");
// Brine Barrel: +30% explosion damage per rank + burn patch.
approx(brineExplosionMul(1), 1.30, "brine explosion r1");
approx(brineExplosionMul(2), 1.60, "brine explosion r2");
const p1 = brinePatch(1), p3 = brinePatch(3);
eq(p1.durationMs, 2000, "brine patch r1 duration 2000ms");
eq(p1.dps, 10, "brine patch r1 dps 10");
ok(p1.radius > 0, "brine patch r1 has radius");
eq(p3.durationMs, 3000, "brine patch r3 duration scales");
eq(p3.dps, 30, "brine patch r3 dps scales");
ok(p3.radius > p1.radius, "brine patch radius scales with rank");

console.log("== 10d(d). Salt Circle affLink behavior (tagged-only) ==");
// Links only to the tube-fed family: shotgun + lever_rifle.
eq(supportApplies("saltcircle", "shotgun"), true, "saltcircle -> shotgun (tube-fed)");
eq(supportApplies("saltcircle", "lever_rifle"), true, "saltcircle -> lever_rifle (tube-fed)");
eq(supportApplies("saltcircle", "revolver"), false, "saltcircle -/-> revolver");
eq(supportApplies("saltcircle", "carbine"), false, "saltcircle -/-> carbine");
eq(supportApplies("saltcircle", "chainsaw"), false, "saltcircle -/-> chainsaw");
eq(supportApplies("saltcircle", "crossbow"), false, "saltcircle -/-> crossbow");
// saltCircleApplies: needs a held stack AND a linked weapon.
eq(saltCircleApplies({}, "shotgun"), false, "no stack -> no saltcircle");
eq(saltCircleApplies({ saltcircle: 0 }, "shotgun"), false, "zero stack -> no saltcircle");
eq(saltCircleApplies({ saltcircle: 2 }, "shotgun"), true, "stack + linked weapon -> saltcircle");
eq(saltCircleApplies({ saltcircle: 2 }, "revolver"), false, "stack + unlinked weapon -> no saltcircle");
// Tracer links both geometry families (fork's scatter, ricochet's precise).
eq(supportApplies("tracer", "shotgun"), true, "tracer -> shotgun (scatter)");
eq(supportApplies("tracer", "revolver"), true, "tracer -> revolver (precise)");
eq(supportApplies("tracer", "crossbow"), true, "tracer -> crossbow (precise)");
eq(supportApplies("tracer", "chainsaw"), false, "tracer -/-> chainsaw");

console.log("== 10d(e). draftability (forced offer) ==");
// Banish everything but the four new boons + lead so the pool is exactly those
// five; confirm all four new boons can be dealt (proves they pass the
// hidden/banish/cap filter and are registered in the draft pool).
{
  const all = BOON_CATALOG.map((b) => b.id);
  const keep = new Set([...NEW, "lead"]);
  const banish = new Set(all.filter((id) => !keep.has(id)));
  const seen = new Set();
  for (let i = 0; i < 80; i++) for (const b of rollBoons({}, 0, 5, 0, 0, banish)) seen.add(b.id);
  for (const id of NEW) ok(seen.has(id), `${id} is draftable through rollBoons`);
  ok(!seen.has("wompus"), "hidden boon stays out of the forced pool");
}

console.log("== 10d(e2). real-draft reachability (no forced pool) ==");
// Regression for the pre-existing within-tier first-pick starvation: with a
// uniform within-tier pick, every non-hidden boon must be reachable in real
// drafts. Before the Batch 10 picker fix, only the first ~3 entries of each
// tier ever appeared (verified: shells/fork/ricochet/orbiter/tracer/etc = 0 in
// 3000 drafts).
{
  const seen = new Set();
  for (let i = 0; i < 1500; i++) for (const b of rollBoons({}, 0, 5, 0, 0)) seen.add(b.id);
  const missing = BOON_CATALOG.filter((b) => !b.hidden && !seen.has(b.id)).map((b) => b.id);
  ok(missing.length === 0, `all non-hidden boons reachable in real drafts${missing.length ? " (missing: " + missing.join(",") + ")" : ""}`);
  for (const id of NEW) ok(seen.has(id), `${id} appears in real (unforced) offers`);
  ok(!seen.has("wompus"), "hidden boon still never offered");
}

console.log("== 10d(f). rank caps ==");
// At max stacks a boon leaves the pool: tracer/cornliquor/brinebarrel cap 5,
// saltcircle caps 6. Banish everything except the capped boon + two fillers so
// the fallback bag never kicks in (pool >= 3 from fillers).
{
  const CAPS = { tracer: 5, saltcircle: 6, cornliquor: 5, brinebarrel: 5 };
  const all = BOON_CATALOG.map((b) => b.id);
  for (const id of NEW) {
    // Three uncapped fillers so the pool stays >= 3 and the fallback bag
    // (which ignores caps) never kicks in.
    const keep = new Set([id, "lead", "leavings", "hide"]);
    const banish = new Set(all.filter((x) => !keep.has(x)));
    const seen = new Set();
    for (let i = 0; i < 80; i++) for (const b of rollBoons({ [id]: CAPS[id] }, 0, 5, 0, 0, banish)) seen.add(b.id);
    ok(!seen.has(id), `${id} at cap ${CAPS[id]} leaves the draft pool`);
    ok(seen.has("lead") && seen.has("leavings"), `fillers still draftable while ${id} capped`);
    // One below cap: still offered.
    const seen2 = new Set();
    for (let i = 0; i < 80; i++) for (const b of rollBoons({ [id]: CAPS[id] - 1 }, 0, 5, 0, 0, banish)) seen2.add(b.id);
    ok(seen2.has(id), `${id} below cap still draftable`);
  }
}

console.log("== 10d(g). banish removes them ==");
{
  const all = BOON_CATALOG.map((b) => b.id);
  const banished = new Set(NEW);
  const seen = new Set();
  for (let i = 0; i < 200; i++) for (const b of rollBoons({}, 0, 5, 0, 0, banished)) seen.add(b.id);
  for (const id of NEW) ok(!seen.has(id), `banished ${id} never offered (200 drafts)`);
  ok(seen.size > 0, "non-banished boons still draftable");
  // Banishing one leaves the other three in the pool.
  const ban1 = new Set(["tracer"]);
  const seen1 = new Set();
  for (let i = 0; i < 250; i++) for (const b of rollBoons({}, 0, 5, 0, 0, ban1)) seen1.add(b.id);
  ok(!seen1.has("tracer") && seen1.has("saltcircle") && seen1.has("cornliquor") && seen1.has("brinebarrel"),
    "single banish only removes that boon");
}

console.log("== 10d(h). Indiana flavor only ==");
// Flavor strings players see on the four new cards: never Bayville/Griggsville/Illinois.
{
  const hay = JSON.stringify(NEW.map(byId)).toLowerCase();
  for (const bad of ["bayville", "griggsville", "illinois"]) {
    ok(!hay.includes(bad), `no "${bad}" in Batch 10 boon strings`);
  }
}

// ================= Live section (Playwright) =================
const PZ_URL = process.env.PZ_URL || "http://127.0.0.1:8082";
console.log("\n== live (Playwright): served bundle carries the four boons ==");
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
    const ids = ["tracer", "saltcircle", "cornliquor", "brinebarrel"];
    const found = {};
    for (const id of ids) found[id] = !!m.BOON_CATALOG.find((b) => b.id === id);
    // Forced offer through the served rollBoons: all four must be dealable.
    const all = m.BOON_CATALOG.map((b) => b.id);
    const keep = new Set([...ids, "lead"]);
    const banish = new Set(all.filter((x) => !keep.has(x)));
    const seen = new Set();
    for (let i = 0; i < 40; i++) for (const b of m.rollBoons({}, 0, 5, 0, 0, banish)) seen.add(b.id);
    return { found, dealt: ids.map((id) => seen.has(id)) };
  })()`);
  for (const id of NEW) ok(inBundle.found[id] === true, `served bundle has ${id}`);
  ok(inBundle.dealt.every(Boolean), "served rollBoons deals all four (forced offer)");
  ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await browser.close();
}

console.log(`\nbatch10d: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
