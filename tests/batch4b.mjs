// Batch 4 — Lane B (content/data/meta) pure-helper tests.
// Plain node script; imports the TS sources directly. Run with:
//   node_modules/.bin/jiti tests/batch4b.mjs
// (jiti is used because plain node cannot elide TS type-only imports.)

import { INITIAL_WEAPONS, WEAPON_LEVELS, WEAPON_MAX_TABLE_LEVEL, statsForLevel,
  KONAMI_SEQUENCE, matchKonami, SECRET_WEAPON } from "../src/game/constants.ts";
import { BOON_CATALOG, RARITY_WEIGHT, rollBoons } from "../src/game/boons.ts";
import { loadMeta, saveMeta, recordRun, topRuns, HALL_MAX } from "../src/game/meta.ts";

// --- in-memory localStorage shim (meta.ts only touches it inside functions)
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// ================= Item 1: WEAPON_LEVELS / statsForLevel =================
const baseIds = INITIAL_WEAPONS.map((w) => w.id);
for (const id of [...baseIds, "wompus_howler"]) {
  const row = WEAPON_LEVELS[id];
  ok(!!row, `WEAPON_LEVELS has row for ${id}`);
  for (const k of ["dmg", "cnt", "rad", "spd", "cd"]) {
    ok(Array.isArray(row?.[k]) && row[k].length === 5, `${id}.${k} is a 5-element array`);
  }
}
// Level 1 must match INITIAL_WEAPONS base stats exactly.
for (const w of INITIAL_WEAPONS) {
  const s = statsForLevel(w.id, 1);
  eq(s.dmg, w.damage, `${w.id} L1 dmg matches base`);
  eq(s.cnt, w.pellets, `${w.id} L1 cnt matches base pellets`);
  eq(s.rad, w.range, `${w.id} L1 rad matches base range`);
  eq(s.spd, w.bulletSpeed, `${w.id} L1 spd matches base bulletSpeed`);
  ok(Math.abs(s.cd - 1 / w.fireRate) < 0.011, `${w.id} L1 cd ≈ 1/fireRate`);
}
// Level 5 of secret weapon matches its def too.
{
  const s = statsForLevel("wompus_howler", 1);
  eq(s.dmg, SECRET_WEAPON.damage, "wompus_howler L1 dmg matches SECRET_WEAPON");
  eq(SECRET_WEAPON.id, "wompus_howler", "SECRET_WEAPON id");
}
// Monotonic curves: dmg non-decreasing, cd non-increasing, 1..5.
for (const id of Object.keys(WEAPON_LEVELS)) {
  const ds = [1, 2, 3, 4, 5].map((l) => statsForLevel(id, l).dmg);
  const cs = [1, 2, 3, 4, 5].map((l) => statsForLevel(id, l).cd);
  ok(ds.every((d, i) => i === 0 || d >= ds[i - 1]), `${id} dmg monotonic`);
  ok(cs.every((c, i) => i === 0 || c <= cs[i - 1]), `${id} cd monotonic`);
  ok(statsForLevel(id, 5).dmg > statsForLevel(id, 1).dmg, `${id} L5 dmg > L1 dmg`);
}
// Edge behavior.
eq(statsForLevel("nope", 3), null, "unknown weapon id -> null");
eq(statsForLevel("revolver", 0).dmg, statsForLevel("revolver", 1).dmg, "level 0 clamps to 1");
eq(statsForLevel("revolver", 99).dmg, statsForLevel("revolver", 5).dmg, "level 99 clamps to 5");
eq(WEAPON_MAX_TABLE_LEVEL, 5, "WEAPON_MAX_TABLE_LEVEL is 5");

// ================= Item 2: Konami + hidden catalog =================
eq(KONAMI_SEQUENCE.length, 10, "KONAMI_SEQUENCE has 10 codes");
eq(KONAMI_SEQUENCE.join(","), "ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,KeyB,KeyA", "Konami code order");
ok(matchKonami([...KONAMI_SEQUENCE]), "exact sequence matches");
ok(matchKonami(["KeyW", "KeyA", ...KONAMI_SEQUENCE]), "prefix keys still match (tail compare)");
ok(!matchKonami(KONAMI_SEQUENCE.slice(0, 9)), "9 of 10 does not match");
ok(!matchKonami([...KONAMI_SEQUENCE.slice(0, 9), "KeyX"]), "wrong final key does not match");
ok(!matchKonami([...KONAMI_SEQUENCE].reverse()), "reversed does not match");
ok(!matchKonami([]), "empty buffer does not match");

const wompusOffer = BOON_CATALOG.find((b) => b.id === "wompus");
ok(!!wompusOffer, "BOON_CATALOG has wompus entry");
eq(wompusOffer.hidden, true, "wompus entry flagged hidden");
// Hidden entries must never appear in drafts, across many rolls and even on
// the exhausted-pool fallback path.
{
  let seen = false;
  for (let i = 0; i < 300; i++) {
    const picks = rollBoons({}, 0, 3);
    if (picks.some((p) => p.hidden || p.id === "wompus")) { seen = true; break; }
  }
  ok(!seen, "rollBoons never offers hidden entries (300 drafts)");
  const maxed = { lead: 99, trigger: 99, hide: 8, shells: 99, beam: 99, jug: 99, leavings: 99, stride: 99, bone: 99, ring: 99, post: 99, pipe: 99, storm: 6, salt: 6, fork: 3, ricochet: 4, seeker: 2, aura: 6 };
  const picks = rollBoons(maxed, 3, 3, 3, 4);
  ok(picks.every((p) => !p.hidden), "exhausted-pool fallback still excludes hidden");
}

// ================= Item 3: Hall of Records =================
localStorage.clear();
eq(topRuns().length, 0, "fresh save -> empty hall");
{
  const runs = [
    { score: 100, kills: 10, time: 120, level: 2, date: 1000 },
    { score: 300, kills: 30, time: 300, level: 4, date: 2000 },
    { score: 200, kills: 20, time: 200, level: 3, date: 3000 },
    { score: 500, kills: 50, time: 500, level: 6, date: 4000 },
    { score: 400, kills: 40, time: 400, level: 5, date: 5000 },
    { score: 50,  kills: 5,  time: 60,  level: 1, date: 6000 },
  ];
  let meta;
  for (const r of runs) meta = recordRun(r);
  eq(meta.runs.length, HALL_MAX, "hall capped at 5");
  const top = topRuns();
  eq(top.length, 5, "topRuns returns 5");
  eq(top.map((r) => r.score).join(","), "500,400,300,200,100", "sorted desc, lowest evicted");
  eq(top[0].kills, 50, "winner fields intact");
  eq(top[0].date, 4000, "winner date intact");
}
// Backward compat: a v1 save written before Hall of Records (no `runs` key)
// must load with an empty hall and keep its lifetime/quests.
{
  localStorage.clear();
  store["pz_meta_v1"] = JSON.stringify({
    v: 1,
    lifetime: { kills: 42, headshots: 1, wavesCleared: 2, chestsOpened: 0, shrinesAttuned: 0, runsPlayed: 3 },
    questsDone: ["first_blood"],
  });
  const m = loadMeta();
  ok(Array.isArray(m.runs) && m.runs.length === 0, "legacy save loads with empty runs");
  eq(m.lifetime.kills, 42, "legacy lifetime preserved");
  eq(m.questsDone.length, 1, "legacy quests preserved");
  // Record into a legacy-shaped save: it gains runs without losing the rest.
  recordRun({ score: 10, kills: 1, time: 10, level: 1, date: 1 });
  const m2 = loadMeta();
  eq(m2.runs.length, 1, "recordRun extends legacy save");
  eq(m2.lifetime.kills, 42, "lifetime still preserved after recordRun");
}
// Junk in runs is filtered, valid entries kept.
{
  localStorage.clear();
  store["pz_meta_v1"] = JSON.stringify({
    v: 1,
    lifetime: { kills: 0, headshots: 0, wavesCleared: 0, chestsOpened: 0, shrinesAttuned: 0, runsPlayed: 0 },
    questsDone: [],
    runs: [{ score: "oops" }, null, { score: 7, kills: 1, time: 5, level: 1, date: 9 }],
  });
  const m = loadMeta();
  eq(m.runs.length, 1, "junk run records filtered");
  eq(m.runs[0].score, 7, "valid run record kept");
}

console.log(`\nbatch4b: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
