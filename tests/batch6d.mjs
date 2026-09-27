// Batch 6 — Lane D (data/meta) pure-helper tests.
// Plain node script; imports the TS sources directly. Run with:
//   node_modules/.bin/jiti tests/batch6d.mjs
// (jiti is used because plain node cannot elide TS type-only imports.)

import {
  EVOLUTIONS, evolutionReady, WEAPON_MAX_TABLE_LEVEL,
  INITIAL_WEAPONS, SECRET_WEAPON,
  CODEX, codexEntry,
  SCALING, scalingAt,
  BOSSES,
} from "../src/game/constants.ts";
import { BOON_CATALOG } from "../src/game/boons.ts";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
function close(a, b, label) { ok(Math.abs(a - b) < 1e-9, `${label} (got ${a}, want ${b})`); }

// ================= Item 1: evolved-form signature bonuses =================
// Batch 15: later batches legitimately add evolutions; the guard is "don't break old rows".
ok(EVOLUTIONS.length >= 6, `EVOLUTIONS has at least 6 rows (got ${EVOLUTIONS.length})`);
eq(WEAPON_MAX_TABLE_LEVEL, 5, "weapon table max level is 5 (evolution gate target)");
const boonIds = new Set(BOON_CATALOG.map((b) => b.id));
for (const r of EVOLUTIONS) {
  // backward compat: every old field still present
  for (const k of ["baseWeapon", "requiredBoon", "requiredBoonName", "requiredStacks", "evolvedName", "evolvedDescription", "evolvedRadio"]) {
    ok(k in r, `row ${r.baseWeapon} keeps ${k}`);
  }
  // S6: at least one signature bonus, all fractions
  const sig = ["critBonus", "dmgBonus", "cdBonus"].filter((k) => k in r);
  ok(sig.length >= 1, `row ${r.baseWeapon} has >=1 signature bonus`);
  for (const k of sig) {
    ok(typeof r[k] === "number" && r[k] > 0 && r[k] < 1, `row ${r.baseWeapon} ${k} is a fraction (got ${r[k]})`);
  }
  // S16: paired filler picks
  ok(!!r.requiredPicks, `row ${r.baseWeapon} has requiredPicks`);
  ok(boonIds.has(r.requiredPicks.boonId), `row ${r.baseWeapon} requiredPicks.boonId is a real boon (${r.requiredPicks.boonId})`);
  ok(r.requiredPicks.boonId !== r.requiredBoon, `row ${r.baseWeapon} filler differs from the evolution boon`);
  eq(r.requiredPicks.count, 3, `row ${r.baseWeapon} requiredPicks.count is 3`);
  ok(!/bayville|griggsville/i.test(r.evolvedName + r.evolvedDescription + r.evolvedRadio), `row ${r.baseWeapon} flavor clean`);
}
// every requiredPicks boon is draftable (not hidden)
{
  const hidden = new Set(BOON_CATALOG.filter((b) => b.hidden).map((b) => b.id));
  for (const r of EVOLUTIONS) ok(!hidden.has(r.requiredPicks.boonId), `row ${r.baseWeapon} filler ${r.requiredPicks.boonId} is draftable`);
}

// ================= Item 2: evolutionReady =================
{
  const deadeye = EVOLUTIONS.find((r) => r.baseWeapon === "revolver");
  const ready = { storm: 1, lead: 3 };
  ok(evolutionReady(deadeye, { upgradeLevel: 5 }, ready), "ready: max level + boon + filler");
  ok(!evolutionReady(deadeye, undefined, ready), "not ready: no weapon");
  ok(!evolutionReady(deadeye, null, ready), "not ready: null weapon");
  ok(!evolutionReady(deadeye, { upgradeLevel: 4 }, ready), "not ready: level 4 < max");
  ok(!evolutionReady(deadeye, { upgradeLevel: 5 }, { lead: 3 }), "not ready: missing required boon");
  ok(!evolutionReady(deadeye, { upgradeLevel: 5 }, { storm: 1, lead: 2 }), "not ready: filler 2/3");
  ok(!evolutionReady(deadeye, { upgradeLevel: 5 }, { storm: 1 }), "not ready: filler 0/3");
  ok(!evolutionReady(deadeye, { upgradeLevel: 5 }, {}), "not ready: no boons at all");
  // backward compat: a legacy row object without the new optional fields still works
  const legacy = { baseWeapon: "revolver", requiredBoon: "storm", requiredStacks: 1 };
  ok(evolutionReady(legacy, { upgradeLevel: 5 }, { storm: 1 }), "legacy row (no requiredPicks): ready when boon met");
  ok(!evolutionReady(legacy, { upgradeLevel: 5 }, {}), "legacy row: still gated on required boon");
  // extra stacks beyond the requirement also pass
  ok(evolutionReady(deadeye, { upgradeLevel: 5 }, { storm: 4, lead: 9 }), "ready: stacks above requirement");
}

// ================= Item 3: CODEX =================
{
  const ids = CODEX.map((e) => e.id);
  eq(new Set(ids).size, ids.length, "CODEX ids unique");
  for (const e of CODEX) {
    const keys = Object.keys(e).sort().join(",");
    eq(keys, "blurb,hint,id,name", `entry ${e.id} shape is exactly { id, name, blurb, hint }`);
    ok(typeof e.name === "string" && e.name.length > 0, `entry ${e.id} has a name`);
    ok(typeof e.blurb === "string" && e.blurb.length > 0, `entry ${e.id} has a blurb`);
    ok(typeof e.hint === "string" && e.hint.length > 0, `entry ${e.id} has a hint`);
    ok(!/bayville|griggsville/i.test(e.id + e.name + e.blurb + e.hint), `entry ${e.id} flavor clean`);
  }
  eq(codexEntry("nope"), undefined, "codexEntry unknown id -> undefined");
  const found = codexEntry("revolver");
  ok(!!found && found.name === ".357 Trail Magnum", "codexEntry('revolver') found");
  ok(codexEntry("konami").hint.includes("Konami") || codexEntry("konami").name.includes("Konami"), "konami secret entry");
  ok(!!codexEntry("daily_challenge"), "daily_challenge secret entry");
  ok(!!codexEntry("evolution_revolver"), "evolution entry for revolver");
  ok(codexEntry("evolution_chainsaw").name === "Kindill Ripper", "evolution entry for chainsaw");
}
// coverage: every weapon id / zombie type / boss id has an entry
{
  const weaponIds = [...INITIAL_WEAPONS.map((w) => w.id), SECRET_WEAPON.id];
  for (const id of weaponIds) ok(!!codexEntry(id), `codex covers weapon ${id}`);
  const zombieTypes = ["shambler", "sprinter", "miner_brute", "bloater_spitter", "behemoth", "crawler", "riot_shield", "tipple_brute", "wompus_stalker"];
  for (const t of zombieTypes) ok(!!codexEntry(t), `codex covers zombie type ${t}`);
  for (const b of BOSSES) ok(!!codexEntry(b.id), `codex covers boss ${b.id}`);
}

// ================= Item 4: SCALING =================
{
  const keys = Object.keys(SCALING).sort().join(",");
  eq(keys, "damage,hp,speed", "SCALING has exactly hp/speed/damage formula strings");
  for (const k of ["hp", "speed", "damage"]) ok(typeof SCALING[k] === "string" && /gt/.test(SCALING[k]), `SCALING.${k} is a formula over gt`);
  // operator precedence: "1+gt/120" at 120 is 2, not (1+gt)/120
  const m0 = scalingAt(0);
  close(m0.hp, 1, "scalingAt(0).hp"); close(m0.speed, 1, "scalingAt(0).speed"); close(m0.damage, 1, "scalingAt(0).damage");
  const m120 = scalingAt(120);
  close(m120.hp, 2, "scalingAt(120).hp"); close(m120.speed, 1.48, "scalingAt(120).speed"); close(m120.damage, 1.4, "scalingAt(120).damage");
  const m300 = scalingAt(300);
  close(m300.hp, 3.5, "scalingAt(300).hp"); close(m300.speed, 2.2, "scalingAt(300).speed"); close(m300.damage, 2, "scalingAt(300).damage");
  // monotonic in time
  const m600 = scalingAt(600);
  ok(m600.hp > m300.hp && m600.speed > m300.speed && m600.damage > m300.damage, "scalingAt monotonic in gt");
  // no mutation of the table through the helper
  eq(SCALING.hp, "1+gt/120", "SCALING table untouched after calls");
}

// ================= summary =================
console.log(`\nbatch6d: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
