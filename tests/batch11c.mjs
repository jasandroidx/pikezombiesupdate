// Batch 11 — Lane 3 (data/content) tests.
// (a) Pure sections run in plain node via jiti (TS sources imported
//     directly, localStorage shimmed).
//   node_modules/.bin/jiti tests/batch11c.mjs
// (b) Live section runs under Playwright against a dev server.
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch11c.mjs

// ---- localStorage shim ----
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
globalThis.sessionStorage = globalThis.localStorage;

import {
  SCENES,
  sceneDef,
  buildMapFeatures,
  buildBarricades,
  buildHoles,
  buildBarrels,
  buildLoreNotes,
  buildJarAnchors,
  sceneBaseCounts,
  validateScenes,
  MOUNTED_GUN_NAMES,
  NOTE_GIFTS,
} from "../src/game/scenes.ts";
import {
  GAME_LOCATIONS,
  EVOLUTIONS,
  evolutionReady,
  WEAPON_MAX_TABLE_LEVEL,
  ENEMY_REGISTRY,
  ENGINE_SPAWNED_TYPES,
  validateEnemyRegistry,
  bossFor,
  ILLUSIONIST,
} from "../src/game/constants.ts";
import { BOON_CATALOG } from "../src/game/boons.ts";
import { stageDef } from "../src/game/roster.ts";

let pass = 0, fail = 0;
const blocked = [];
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
const LOCATION_IDS = GAME_LOCATIONS.map((l) => l.id);
const locRow = (id) => GAME_LOCATIONS.find((l) => l.id === id);

console.log("== 11c(a). scenes.ts covers every GAME_LOCATIONS id ==");
eq(LOCATION_IDS.length, 6, "6 game locations");
for (const id of LOCATION_IDS) {
  ok(!!SCENES[id], `SCENES has ${id}`);
}
{
  const v = validateScenes(LOCATION_IDS);
  eq(v.ok, true, `validateScenes ok ${JSON.stringify({ missing: v.missing, invalid: v.invalid })}`);
  const v2 = validateScenes([...LOCATION_IDS, "bogus_map"]);
  eq(v2.ok, false, "validateScenes rejects unknown id");
  ok(v2.missing.includes("bogus_map"), "unknown id reported missing");
}
// Counts + note ids match the GAME_LOCATIONS rows the engine reads today.
for (const id of LOCATION_IDS) {
  const row = locRow(id);
  const s = SCENES[id];
  eq(s.holes.length, (row.holes || []).length, `${id}: hole count`);
  eq(s.barrels.length, (row.barrels || []).length, `${id}: barrel count`);
  eq(s.barricades.length, (row.barricades || []).length, `${id}: barricade count`);
  eq(s.loreNotes.length, (row.loreNotes || []).length, `${id}: loreNote count`);
  eq(s.loreNotes.map((n) => n.id).join(","), (row.loreNotes || []).map((n) => n.id).join(","), `${id}: loreNote ids`);
  eq(s.props.mapWidth, row.mapWidth, `${id}: mapWidth`);
  eq(s.props.mapHeight, row.mapHeight, `${id}: mapHeight`);
}
// Per-map props data: mounted-gun names + note gifts, all 6 locations.
eq(Object.keys(MOUNTED_GUN_NAMES).length, 6, "6 mounted-gun names");
eq(Object.keys(NOTE_GIFTS).length, 6, "6 note gifts");
for (const id of LOCATION_IDS) {
  ok(typeof MOUNTED_GUN_NAMES[id] === "string" && MOUNTED_GUN_NAMES[id].length > 0, `${id}: gun name`);
  ok(typeof NOTE_GIFTS[id] === "string" && NOTE_GIFTS[id].length > 0, `${id}: note gift`);
  eq(SCENES[id].props.mountedGunName, MOUNTED_GUN_NAMES[id], `${id}: props gun name matches`);
  eq(SCENES[id].props.noteGift, NOTE_GIFTS[id], `${id}: props gift matches`);
}
// Jar anchors follow the engine's initJars formula for every map's dims.
for (const id of LOCATION_IDS) {
  const { mapWidth: w, mapHeight: h } = locRow(id);
  const want = [[360, 340], [w - 360, 340], [360, h - 340], [w - 360, h - 360], [w * 0.5, 300]];
  const got = buildJarAnchors(id).map((p) => [p.x, p.y]);
  eq(JSON.stringify(got), JSON.stringify(want), `${id}: jar anchors`);
}
// Indiana only — never Bayville/Griggsville/Illinois in the new data files.
for (const bad of ["bayville", "griggsville", "illinois"]) {
  ok(!JSON.stringify(SCENES).toLowerCase().includes(bad), `scenes.ts: no "${bad}"`);
}

console.log("== 11c(b). buildMapFeatures shapes == init*() output ==");
for (const id of LOCATION_IDS) {
  const f = buildMapFeatures(id); // no rules, default rng unused for base
  // barricades: initBarricades shape — id bar_${i}, health by type.
  f.barricades.forEach((b, i) => {
    eq(b.id, `bar_${i}`, `${id}: barricade ${i} id`);
    const wantHp = b.type === "coal_cart" ? 220 : b.type === "sandbags" ? 160 : 90;
    eq(b.health, wantHp, `${id}: barricade ${i} health (${b.type})`);
    eq(b.maxHealth, wantHp, `${id}: barricade ${i} maxHealth`);
  });
  // holes: initHoles shape — id hole_${i}, pit 28 else 22, unboarded.
  f.holes.forEach((hh, i) => {
    eq(hh.id, `hole_${i}`, `${id}: hole ${i} id`);
    eq(hh.radius, hh.kind === "pit" ? 28 : 22, `${id}: hole ${i} radius (${hh.kind})`);
    eq(hh.boarded, false, `${id}: hole ${i} unboarded`);
    eq(hh.boardHealth, 90, `${id}: hole ${i} boardHealth`);
    eq(hh.maxBoardHealth, 90, `${id}: hole ${i} maxBoardHealth`);
  });
  // barrels: initExplosiveBarrels shape — id barrel_${i}_${Date.now()}, r18/hp45.
  f.barrels.forEach((bb, i) => {
    ok(/^barrel_\d+_\d+$/.test(bb.id), `${id}: barrel ${i} id shape (${bb.id})`);
    eq(bb.radius, 18, `${id}: barrel ${i} radius`);
    eq(bb.health, 45, `${id}: barrel ${i} health`);
    eq(bb.maxHealth, 45, `${id}: barrel ${i} maxHealth`);
  });
  // loreNotes: initLoreNotes shape — collected false.
  f.loreNotes.forEach((n, i) => {
    eq(n.collected, false, `${id}: note ${i} uncollected`);
    eq(n.locationId, id, `${id}: note ${i} locationId`);
  });
  // sceneBaseCounts feeds the probe bookkeeping.
  const bc = sceneBaseCounts(id);
  eq(bc.holes, f.holes.length, `${id}: baseCounts.holes`);
  eq(bc.barrels, f.barrels.length, `${id}: baseCounts.barrels`);
  eq(bc.barricades, f.barricades.length, `${id}: baseCounts.barricades`);
  eq(bc.loreNotes, f.loreNotes.length, `${id}: baseCounts.loreNotes`);
}
// Lore-note content is deep-copied: mutating a build never touches SCENES
// (placeClues appends lines to the built copies today).
{
  const a = buildLoreNotes("white_oak_springs");
  a[0].content.push("INJECTED");
  const b = buildLoreNotes("white_oak_springs");
  ok(!b[0].content.includes("INJECTED"), "note content deep-copied per build");
  ok(!SCENES.white_oak_springs.loreNotes[0].content.includes("INJECTED"), "SCENES data untouched");
}
// sceneDef throws on unknown ids (fail fast, not silent undefined).
{
  let threw = false;
  try { sceneDef("bogus_map"); } catch { threw = true; }
  ok(threw, "sceneDef throws on unknown location");
}

console.log("== 11c(c). stage rules (holeCountMult/barrelMult) replicate applyStageTerrain ==");
const zeroRng = () => 0; // deterministic: always picks index 0, jitter at -range/2
{
  // white_oak_springs: 3 holes, holeCountMult 1.6 -> want round(3*1.6)=5.
  const holes = buildHoles("white_oak_springs", { holeCountMult: 1.6 }, zeroRng);
  eq(holes.length, 5, "holes: 3 * 1.6 -> 5");
  eq(holes[3].id, "hole_x3", "extra hole id hole_x3");
  eq(holes[4].id, "hole_x4", "extra hole id hole_x4");
  // rng()=0: src = holes[(0*len)|0] = holes[0] (840,1140); jitter = 0*220-110 = -110.
  eq(holes[3].x, 730, "hole_x3.x = 840 - 110");
  eq(holes[3].y, 1030, "hole_x3.y = 1140 - 110");
  eq(holes[3].radius, 22, "hole_x3 inherits cellar radius");
  eq(holes[3].boarded, false, "hole_x3 unboarded");
  // mccords_ford has no holes: 0 * 1.6 = 0, src undefined -> break, no crash.
  eq(buildHoles("mccords_ford", { holeCountMult: 1.6 }, zeroRng).length, 0, "holes: empty base stays empty");
  // honey_springs: 2 holes (cellar + pit), no rules -> base only.
  eq(buildHoles("honey_springs", undefined, zeroRng).length, 2, "holes: no rules -> base 2");
}
{
  // white_oak_springs: 1 barrel, barrelMult 2.0 -> want 2; src index over BASE only.
  const barrels = buildBarrels("white_oak_springs", { barrelMult: 2.0 }, zeroRng);
  eq(barrels.length, 2, "barrels: 1 * 2.0 -> 2");
  eq(barrels[1].id, "barrel_x1", "extra barrel id barrel_x1");
  // jitter = 0*160-80 = -80 -> (730-80, 980-80).
  eq(barrels[1].x, 650, "barrel_x1.x = 730 - 80");
  eq(barrels[1].y, 900, "barrel_x1.y = 980 - 80");
  eq(barrels[1].radius, 18, "barrel_x1 radius 18");
  eq(barrels[1].health, 45, "barrel_x1 health 45");
  // mccords_ford: 4 barrels, no rules -> 4.
  eq(buildBarrels("mccords_ford", undefined, zeroRng).length, 4, "barrels: no rules -> base 4");
  // winslow_still: 4 barrels * 2.0 = 8; with zeroRng every extra copies base[0] (860,800).
  const w = buildBarrels("winslow_still", { barrelMult: 2.0 }, zeroRng);
  eq(w.length, 8, "barrels: 4 * 2.0 -> 8");
  eq(w[7].id, "barrel_x7", "last extra id barrel_x7");
  eq(w[7].x, 780, "barrel_x7 copies base[0] (860-80)");
}
{
  // The num() guard: NaN / non-number mults fall back to 1 (engine behavior).
  eq(buildHoles("white_oak_springs", { holeCountMult: NaN }, zeroRng).length, 3, "NaN holeCountMult -> base");
  eq(buildBarrels("white_oak_springs", { barrelMult: "x" }, zeroRng).length, 1, "string barrelMult -> base");
  eq(buildHoles("white_oak_springs", { holeCountMult: 0 }, zeroRng).length, 3, "holeCountMult 0 -> want 0 < base, loop never runs, base kept");
}

console.log("== 11c(d). three new evolution rows ==");
const NEW_EVOS = ["mortar", "wompus_howler", "chainlightning"];
for (const bw of NEW_EVOS) {
  const rows = EVOLUTIONS.filter((r) => r.baseWeapon === bw);
  eq(rows.length, 1, `${bw}: exactly one evolution row`);
}
{
  const seen = new Set();
  for (const r of EVOLUTIONS) {
    ok(!seen.has(r.baseWeapon), `no duplicate evolution for ${r.baseWeapon}`);
    seen.add(r.baseWeapon);
  }
  eq(EVOLUTIONS.length, 9, "9 evolution rows total (6 old + 3 new)");
}
const BOON_IDS = new Set(BOON_CATALOG.map((b) => b.id));
const boonName = (id) => BOON_CATALOG.find((b) => b.id === id)?.name;
const sane = (v, lo, hi) => v === undefined || (typeof v === "number" && v >= lo && v <= hi);
for (const bw of NEW_EVOS) {
  const r = EVOLUTIONS.find((x) => x.baseWeapon === bw);
  ok(BOON_IDS.has(r.requiredBoon), `${bw}: requiredBoon "${r.requiredBoon}" is a real boon`);
  eq(r.requiredBoonName, boonName(r.requiredBoon), `${bw}: requiredBoonName matches catalog`);
  ok(r.requiredStacks >= 1, `${bw}: requiredStacks >= 1`);
  ok(BOON_IDS.has(r.requiredPicks.boonId), `${bw}: requiredPicks boon "${r.requiredPicks.boonId}" is real`);
  ok(r.requiredPicks.count >= 1, `${bw}: requiredPicks count >= 1`);
  ok(r.requiredBoon !== r.requiredPicks.boonId, `${bw}: requiredBoon != filler boon`);
  for (const f of ["evolvedName", "evolvedDescription", "evolvedRadio"]) {
    ok(typeof r[f] === "string" && r[f].length > 0, `${bw}: ${f} set`);
  }
  ok(sane(r.dmgMul, 1, 2.5), `${bw}: dmgMul sane (${r.dmgMul})`);
  ok(sane(r.fireMul, 1, 2.5), `${bw}: fireMul sane (${r.fireMul})`);
  ok(sane(r.pierceSet, 1, 8), `${bw}: pierceSet sane (${r.pierceSet})`);
  ok(sane(r.magMul, 1, 3), `${bw}: magMul sane (${r.magMul})`);
  ok(sane(r.pelletsAdd, 0, 6), `${bw}: pelletsAdd sane (${r.pelletsAdd})`);
  ok(sane(r.spreadMul, 0.5, 2), `${bw}: spreadMul sane (${r.spreadMul})`);
  ok(sane(r.projSpeedMul, 0.5, 2), `${bw}: projSpeedMul sane (${r.projSpeedMul})`);
  ok(sane(r.rangeMul, 1, 3), `${bw}: rangeMul sane (${r.rangeMul})`);
  ok(sane(r.critBonus, 0, 0.5), `${bw}: critBonus sane (${r.critBonus})`);
  ok(sane(r.dmgBonus, 0, 0.5), `${bw}: dmgBonus sane (${r.dmgBonus})`);
  ok(sane(r.cdBonus, 0, 0.5), `${bw}: cdBonus sane (${r.cdBonus})`);
}
// evolutionReady gate logic against the new rows.
{
  const r = EVOLUTIONS.find((x) => x.baseWeapon === "mortar");
  const stacks = { brinebarrel: 2, missiles: 3 };
  eq(evolutionReady(r, { upgradeLevel: WEAPON_MAX_TABLE_LEVEL }, stacks), true, "mortar evo ready at max level + stacks");
  eq(evolutionReady(r, { upgradeLevel: WEAPON_MAX_TABLE_LEVEL - 1 }, stacks), false, "not ready below max level");
  eq(evolutionReady(r, null, stacks), false, "not ready without the weapon");
  eq(evolutionReady(r, { upgradeLevel: WEAPON_MAX_TABLE_LEVEL }, { brinebarrel: 1, missiles: 3 }), false, "not ready missing boon stacks");
  eq(evolutionReady(r, { upgradeLevel: WEAPON_MAX_TABLE_LEVEL }, { brinebarrel: 2, missiles: 2 }), false, "not ready missing filler picks");
}
// Indiana only in the new evolution copy.
{
  const hay = JSON.stringify(EVOLUTIONS.filter((r) => NEW_EVOS.includes(r.baseWeapon)));
  for (const bad of ["bayville", "griggsville", "illinois"]) {
    ok(!hay.toLowerCase().includes(bad), `evolutions: no "${bad}"`);
  }
}

console.log("== 11c(e). enemy registry ==");
{
  const v = validateEnemyRegistry();
  eq(v.ok, true, `validateEnemyRegistry ok ${JSON.stringify({ missing: v.missing, invalid: v.invalid })}`);
  for (const id of ENGINE_SPAWNED_TYPES) {
    ok(!!ENEMY_REGISTRY[id], `registry covers spawned type ${id}`);
  }
  eq(ENGINE_SPAWNED_TYPES.length, 11, "11 engine-spawned types");
  // Spot-check base stats against pushZombie() literals.
  const z = ENEMY_REGISTRY;
  eq([z.shambler.hp, z.shambler.speed, z.shambler.damage].join(","), "58,2.15,14", "shambler stats");
  eq([z.sprinter.hp, z.sprinter.speed, z.sprinter.damage].join(","), "45,3.45,12", "sprinter stats");
  eq([z.crawler.hp, z.crawler.speed, z.crawler.damage].join(","), "32,2.4,8", "crawler stats");
  eq([z.miner_brute.hp, z.miner_brute.speed, z.miner_brute.damage].join(","), "220,1.2,25", "miner_brute stats");
  eq([z.bloater_spitter.hp, z.bloater_spitter.speed, z.bloater_spitter.damage].join(","), "130,1.05,18", "bloater_spitter stats");
  eq([z.bomber.hp, z.bomber.speed, z.bomber.damage].join(","), "45,2.7,12", "bomber stats");
  eq([z.riot.hp, z.riot.speed, z.riot.damage].join(","), "520,0.85,30", "riot stats");
  eq([z.riot_shield.hp, z.riot_shield.speed, z.riot_shield.damage].join(","), "420,0.95,26", "riot_shield stats");
  eq(z.behemoth.hp, bossFor("behemoth").bossOverrides.health, "behemoth hp matches BOSSES table");
  eq([z.behemoth.speed, z.behemoth.damage].join(","), "1.55,45", "behemoth speed/damage");
  eq([z.haint.hp, z.haint.speed, z.haint.damage].join(","), "90,2.6,12", "haint stats");
  eq(z.illusionist.hp, ILLUSIONIST.hp, "illusionist hp matches ILLUSIONIST table");
  eq([z.illusionist.speed, z.illusionist.damage].join(","), "2.2,10", "illusionist speed/damage");
  // Future bosses documented, not affix-eligible (never spawned).
  ok(!!ENEMY_REGISTRY.tipple_brute && !!ENEMY_REGISTRY.wompus_stalker, "future bosses documented");
  eq(ENEMY_REGISTRY.tipple_brute.affixEligible, false, "tipple_brute not affix-eligible");
  eq(ENEMY_REGISTRY.wompus_stalker.affixEligible, false, "wompus_stalker not affix-eligible");
  eq(z.tipple_brute.hp, bossFor("tipple").bossOverrides.health, "tipple_brute hp matches BOSSES");
  eq(z.wompus_stalker.hp, bossFor("wompus").bossOverrides.health, "wompus_stalker hp matches BOSSES");
  // Indiana only in registry copy.
  const hay = JSON.stringify(ENEMY_REGISTRY);
  for (const bad of ["bayville", "griggsville", "illinois"]) {
    ok(!hay.toLowerCase().includes(bad), `registry: no "${bad}"`);
  }
}

// ================= Live section (Playwright) =================
// For each map: start a Survival run and compare the engine's live hole/barrel
// counts (roster9 probe) against the scenes.ts data + stage rules.
const PZ_URL = process.env.PZ_URL || "http://127.0.0.1:8082";
console.log("\n== live (Playwright): scenes data vs live engine ==");
{
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: "/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);

  const MAPS = [
    { id: "white_oak_springs", label: "White Oak" },
    { id: "mccords_ford", label: "McCord's Ford" },
    { id: "stendal_backbone", label: "Stendal" },
    { id: "petersburg_square", label: "Petersburg" },
    { id: "winslow_still", label: "Winslow" },
    { id: "honey_springs", label: "Spurgeon" },
  ];
  for (const m of MAPS) {
    console.log(`  live: ${m.id} ...`);
    // Clear storage BEFORE navigation while the page is still same-origin from
    // the previous iteration: the server always renders the county map with
    // the default stage selected, so the client must hydrate with empty
    // storage too — otherwise the selected-circle styling mismatches and
    // React logs a hydration page error. (about:blank on the first iteration
    // has no usable storage; the try/catch covers that.)
    await page.evaluate(() => { try { localStorage.clear(); } catch { /* noop */ } });
    await page.goto(PZ_URL, { waitUntil: "networkidle" });
    // Pick the map on the county map SVG: target the <text> label elements
    // (the <title> tooltips also carry the label text, so plain getByText is ambiguous).
    await page.locator('[data-testid="county-map"] text', { hasText: new RegExp(`^${m.label}$`) }).click();
    await page.getByRole("button", { name: "Survival · this place" }).click();
    await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
    const r = await T("roster9()");
    // stageDef(stageId).rules is what applyStageTerrain read; stage id === location id.
    const rules = stageDef(r.stage).rules || {};
    const base = sceneBaseCounts(m.id);
    const wantHoles = Math.round(base.holes * num(rules.holeCountMult, 1));
    const wantBarrels = Math.round(base.barrels * num(rules.barrelMult, 1));
    eq(r.stage, m.id, `${m.id}: stage id === location id`);
    eq(r.holesBase, base.holes, `${m.id}: live holesBase == scenes base (${base.holes})`);
    eq(r.holes, wantHoles, `${m.id}: live holes == round(base*holeCountMult) (${wantHoles})`);
    eq(r.barrelsBase, base.barrels, `${m.id}: live barrelsBase == scenes base (${base.barrels})`);
    eq(r.barrels, wantBarrels, `${m.id}: live barrels == round(base*barrelMult) (${wantBarrels})`);
  }

  ok(errors.length === 0, `zero page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await browser.close();
}

console.log(`\nbatch11c: ${pass} passed, ${fail} failed${blocked.length ? `, ${blocked.length} blocked` : ""}`);
for (const b of blocked) console.log("BLOCKED: " + b);
process.exit(fail || blocked.length ? 1 : 0);
