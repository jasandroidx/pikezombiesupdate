// Batch 5 — Lane C (data/meta) pure-helper tests.
// Plain node script; imports the TS sources directly. Run with:
//   node_modules/.bin/jiti tests/batch5c.mjs
// (jiti is used because plain node cannot elide TS type-only imports.)

import { BOSSES, bossFor, mulberry32, hashStringToSeed } from "../src/game/constants.ts";
import { loadMeta, saveMeta, dailyDateStr, getDailySeed, markDailyPlayed, dailyPlayed } from "../src/game/meta.ts";
import { renderShareCard, SHARE_CARD_W, SHARE_CARD_H } from "../src/game/shareCard.ts";

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

// ================= Item 1: BOSSES table =================
// Batch 15: counts are data-driven — later batches legitimately add bosses.
ok(BOSSES.length >= 3, `BOSSES has at least 3 rows (got ${BOSSES.length})`);
eq(new Set(BOSSES.map((b) => b.id)).size, BOSSES.length, "boss ids unique");
const knownTypes = new Set(["shambler", "sprinter", "miner_brute", "bloater_spitter", "behemoth", "crawler", "riot_shield", "tipple_brute", "wompus_stalker", "illusionist", "old_ben", "splinter", "mound"]);
for (const b of BOSSES) {
  for (const k of ["id", "type", "name", "spawnAt", "signatureAbility", "spawnRule", "bossOverrides"]) {
    ok(k in b, `row ${b.id} has ${k}`);
  }
  ok(knownTypes.has(b.type), `row ${b.id} type is a ZombieType member`);
  ok(typeof b.spawnAt === "number" && b.spawnAt >= 0, `row ${b.id} spawnAt is seconds >= 0`);
  ok(b.signatureAbility.length > 0, `row ${b.id} has signatureAbility`);
  const o = b.bossOverrides;
  for (const k of ["health", "speed", "damage", "radius", "color", "scoreValue", "scrapValue", "bannerText", "bannerSub"]) {
    ok(k in o, `row ${b.id} overrides has ${k}`);
  }
  ok(!/bayville|griggsville/i.test(b.name + b.bannerSub + b.spawnRule), `row ${b.id} flavor has no Bayville/Griggsville`);
}

// Behemoth baseline row matches the hardcoded engine behavior.
{
  const b = bossFor("behemoth");
  ok(!!b, "bossFor('behemoth') found");
  eq(b.type, "behemoth", "behemoth row type");
  eq(b.bossOverrides.health, 1400, "behemoth base health (engine adds wave*250)");
  eq(b.bossOverrides.speed, 1.55, "behemoth speed");
  eq(b.bossOverrides.damage, 45, "behemoth damage");
  eq(b.bossOverrides.radius, 38, "behemoth radius");
  eq(b.bossOverrides.color, "#581c87", "behemoth color");
  eq(b.bossOverrides.scoreValue, 1500, "behemoth scoreValue");
  eq(b.bossOverrides.scrapValue, 250, "behemoth scrapValue");
  eq(b.bossOverrides.bannerText, "THE BEHEMOTH", "behemoth banner text");
  ok(b.bossOverrides.bannerSub.includes("treeline"), "behemoth banner sub mentions treeline");
  eq(b.spawnAt, 0, "behemoth spawnAt 0 = legacy wave rule, not timer");
  ok(/wave/.test(b.spawnRule), "behemoth spawnRule documents the wave rule");
}

// Future bosses: Indiana flavor, timer-gated, distinct abilities/types.
{
  const tipple = bossFor("tipple");
  ok(!!tipple, "bossFor('tipple') found");
  eq(tipple.type, "tipple_brute", "tipple type");
  ok(tipple.spawnAt > 0, "tipple timer-gated");
  ok(!!tipple.signatureAbility && tipple.signatureAbility !== bossFor("behemoth").signatureAbility, "tipple has own signatureAbility");
  const wompus = bossFor("wompus");
  ok(!!wompus, "bossFor('wompus') found");
  eq(wompus.type, "wompus_stalker", "wompus type");
  ok(wompus.spawnAt > tipple.spawnAt, "wompus spawns later than tipple");
  ok(new Set(BOSSES.map((b) => b.signatureAbility)).size === BOSSES.length, "signature abilities distinct");
}
eq(bossFor("nope"), undefined, "bossFor unknown id -> undefined");

// ================= Item 2: seeded RNG + daily =================
{
  const r1 = mulberry32(12345), r2 = mulberry32(12345);
  const a = Array.from({ length: 50 }, () => r1());
  const b = Array.from({ length: 50 }, () => r2());
  ok(a.every((v, i) => v === b[i]), "mulberry32 same seed -> identical sequence");
  ok(a.every((v) => v >= 0 && v < 1), "mulberry32 values in [0,1)");
  const r3 = mulberry32(12346);
  const c = Array.from({ length: 50 }, () => r3());
  ok(a.some((v, i) => v !== c[i]), "mulberry32 different seeds -> different sequence");
}
eq(hashStringToSeed("pcz-daily:2026-09-27"), hashStringToSeed("pcz-daily:2026-09-27"), "hashStringToSeed deterministic");
ok(hashStringToSeed("pcz-daily:2026-09-27") !== hashStringToSeed("pcz-daily:2026-09-28"), "hashStringToSeed differs across dates");

// Daily seed stability + cross-day change.
eq(getDailySeed("2026-09-27"), getDailySeed("2026-09-27"), "getDailySeed stable within a day");
ok(getDailySeed("2026-09-27") !== getDailySeed("2026-09-28"), "getDailySeed changes across days");
ok(/^\d{4}-\d{2}-\d{2}$/.test(dailyDateStr()), "dailyDateStr is YYYY-MM-DD");
eq(getDailySeed(), getDailySeed(dailyDateStr()), "getDailySeed() defaults to today");

// markDailyPlayed / dailyPlayed round-trip.
localStorage.clear();
eq(dailyPlayed("2026-09-27"), false, "dailyPlayed false before marking");
markDailyPlayed("2026-09-27");
eq(dailyPlayed("2026-09-27"), true, "dailyPlayed true after marking");
eq(dailyPlayed("2026-09-28"), false, "other day still unplayed");
markDailyPlayed("2026-09-27"); // idempotent
eq(dailyPlayed("2026-09-27"), true, "markDailyPlayed idempotent");
// Survives a storage round-trip.
const reloaded = loadMeta();
eq(reloaded.daily["2026-09-27"], true, "daily persisted in pz_meta_v1");

// Backward compat: old-shape save (no `daily`) loads fine and gains the field.
localStorage.clear();
localStorage.setItem("pz_meta_v1", JSON.stringify({
  v: 1,
  lifetime: { kills: 5, headshots: 1, wavesCleared: 2, chestsOpened: 0, shrinesAttuned: 0, runsPlayed: 1 },
  questsDone: [],
  runs: [],
}));
{
  const m = loadMeta();
  eq(m.lifetime.kills, 5, "old save lifetime preserved");
  ok(typeof m.daily === "object" && Object.keys(m.daily).length === 0, "old save gets empty daily map");
  eq(dailyPlayed("2026-09-27"), false, "old save: dailyPlayed false");
  markDailyPlayed("2026-09-27");
  eq(dailyPlayed("2026-09-27"), true, "old save: markDailyPlayed works");
}

// ================= Item 3: shareCard =================
// Mock canvas: records every 2d-context call; must not rely on return values
// (the module only uses void methods + property sets).
function mockCanvas() {
  const calls = [];
  const ctx = new Proxy({}, {
    get(t, p) {
      if (p === "calls") return calls;
      return (...args) => { calls.push([p, ...args]); return undefined; };
    },
    set(t, p, v) { calls.push(["set", p, v]); return true; },
  });
  const c = { width: 0, height: 0, getContext: () => ctx, __ctx: ctx };
  return c;
}
const textOf = (calls) => calls.filter((c) => c[0] === "fillText").map((c) => c[1]);

{
  const stats = {
    score: 12345, kills: 678, time: 754, level: 12, wave: 9,
    title: "DEAD MAN'S RUN", locationName: "Winslow", dateStr: "2026-09-27",
  };
  const card = renderShareCard(stats, mockCanvas);
  eq(card.width, 1200, "card width 1200");
  eq(card.height, 630, "card height 630");
  eq(SHARE_CARD_W, 1200, "SHARE_CARD_W");
  eq(SHARE_CARD_H, 630, "SHARE_CARD_H");
  const texts = textOf(card.__ctx.calls);
  ok(texts.some((t) => t.includes("DEAD MAN'S RUN")), "title drawn");
  ok(texts.some((t) => t.includes("12,345")), "score drawn (formatted)");
  ok(texts.some((t) => t.includes("678")), "kills drawn");
  ok(texts.some((t) => t.includes("12:34")), "time drawn as 12:34");
  ok(texts.some((t) => t.includes("9")), "wave drawn");
  ok(texts.some((t) => t.includes("Winslow")), "location drawn");
  ok(texts.some((t) => t.includes("2026-09-27")), "date drawn");
  const arcs = card.__ctx.calls.filter((c) => c[0] === "arc");
  ok(arcs.length >= 3, "skull drawn with arc primitives");
  const rects = card.__ctx.calls.filter((c) => c[0] === "fillRect");
  ok(rects.length >= 3, "background + rules drawn");
}
{
  // empty title falls back to a default
  const card = renderShareCard({ score: 0, kills: 0, time: 0, level: 1, wave: 1, title: "", locationName: "X", dateStr: "2026-09-27" }, mockCanvas);
  ok(textOf(card.__ctx.calls).some((t) => t.includes("SURVIVED THE COUNTY")), "empty title falls back");
}

// ================= summary =================
console.log(`\nbatch5c: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
