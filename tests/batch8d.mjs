// Batch 8 — Lane D (data/meta) tests.
// Pure-helper sections run in plain node via jiti (TS sources imported
// directly); the live-engine section runs under Playwright when PZ_URL is set.
//   node_modules/.bin/jiti tests/batch8d.mjs                  # pure sections
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch8d.mjs   # + engine

import { INITIAL_WEAPONS, WEAPON_FAMILIES, WAVE_WINDOWS, WAVES, AFFINITY_TAGS,
  tagsMatch, windowAt, spawnMultAt } from "../src/game/constants.ts";
import { BOON_CATALOG, supportApplies, applicableSupportBoons, weaponTagsOf, boonTagsOf } from "../src/game/boons.ts";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// ================= Item 9: affinity tag matching =================
console.log("== 9a. tagsMatch matrix ==");
eq(tagsMatch(["a", "b"], ["b", "c"]), true, "shared tag links");
eq(tagsMatch(["a"], ["b"]), false, "disjoint tags do not link");
eq(tagsMatch([], ["a"]), false, "empty weapon tags do not link");
eq(tagsMatch(["a"], []), false, "empty boon tags do not link");
eq(tagsMatch(undefined, ["a"]), false, "undefined weapon tags do not link");
eq(tagsMatch(["a"], undefined), false, "undefined boon tags do not link");
eq(tagsMatch([], []), false, "both empty do not link");

console.log("== 9b. tag data on defs ==");
const tagSet = new Set(AFFINITY_TAGS);
for (const w of INITIAL_WEAPONS) {
  ok(Array.isArray(w.tags) && w.tags.length > 0, `weapon ${w.id} carries tags`);
  for (const t of w.tags ?? []) ok(tagSet.has(t), `weapon ${w.id} tag "${t}" is in AFFINITY_TAGS`);
}
// Every family member is a tagged weapon (families and tags cover the same roster).
for (const f of Object.values(WEAPON_FAMILIES)) {
  for (const id of f.members) {
    ok((weaponTagsOf(id) ?? []).length > 0, `family member ${id} has tags`);
  }
}
// Support boons carry tags; every boon tag is in the vocabulary.
const taggedBoons = BOON_CATALOG.filter((b) => (b.tags ?? []).length > 0);
ok(taggedBoons.length > 0, `some boons are tagged support boons (got ${taggedBoons.length})`);
for (const b of BOON_CATALOG) for (const t of b.tags ?? []) ok(tagSet.has(t), `boon ${b.id} tag "${t}" is in AFFINITY_TAGS`);
for (const id of ["lead", "trigger", "shells", "fork", "ricochet", "seeker"]) {
  ok(boonTagsOf(id).length > 0, `support boon ${id} is tagged`);
}

console.log("== 9c. supportApplies matrix ==");
// lead [precise]: revolver/lever/carbine/crossbow yes; shotgun/chainsaw no.
eq(supportApplies("lead", "revolver"), true, "lead -> revolver");
eq(supportApplies("lead", "lever_rifle"), true, "lead -> lever_rifle");
eq(supportApplies("lead", "carbine"), true, "lead -> carbine");
eq(supportApplies("lead", "crossbow"), true, "lead -> crossbow");
eq(supportApplies("lead", "shotgun"), false, "lead -/-> shotgun");
eq(supportApplies("lead", "chainsaw"), false, "lead -/-> chainsaw");
// fork [scatter]: shotgun only.
eq(supportApplies("fork", "shotgun"), true, "fork -> shotgun");
eq(supportApplies("fork", "revolver"), false, "fork -/-> revolver");
eq(supportApplies("fork", "chainsaw"), false, "fork -/-> chainsaw");
// shells [tube-fed]: shotgun + lever_rifle.
eq(supportApplies("shells", "shotgun"), true, "shells -> shotgun");
eq(supportApplies("shells", "lever_rifle"), true, "shells -> lever_rifle");
eq(supportApplies("shells", "carbine"), false, "shells -/-> carbine");
// trigger [rapid, sidearm]: carbine + revolver.
eq(supportApplies("trigger", "carbine"), true, "trigger -> carbine");
eq(supportApplies("trigger", "revolver"), true, "trigger -> revolver");
eq(supportApplies("trigger", "chainsaw"), false, "trigger -/-> chainsaw");
// ricochet/seeker [precise].
eq(supportApplies("ricochet", "crossbow"), true, "ricochet -> crossbow");
eq(supportApplies("seeker", "crossbow"), true, "seeker -> crossbow");
eq(supportApplies("seeker", "shotgun"), false, "seeker -/-> shotgun");
// Untagged boons are not tag-gated: they apply as today.
for (const id of ["hide", "storm", "aura", "bone", "jug", "nova", "chainlightning"]) {
  eq(supportApplies(id, "shotgun"), true, `untagged boon ${id} still applies (shotgun)`);
  eq(supportApplies(id, "chainsaw"), true, `untagged boon ${id} still applies (chainsaw)`);
}
// Unknown ids degrade gracefully.
eq(supportApplies("nope", "revolver"), true, "unknown boon (untagged) applies");
eq(supportApplies("lead", "nope"), false, "tagged boon vs unknown weapon does not link");

console.log("== 9d. applicableSupportBoons ==");
eq(JSON.stringify(applicableSupportBoons({ lead: 2, fork: 1, hide: 3 }, "shotgun")),
  JSON.stringify(["fork", "hide"]), "shotgun links fork+hide, not lead");
eq(JSON.stringify(applicableSupportBoons({ lead: 1, seeker: 1, trigger: 1 }, "crossbow")),
  JSON.stringify(["lead", "seeker"]), "crossbow links lead+seeker, not trigger");
eq(JSON.stringify(applicableSupportBoons({ lead: 0, fork: 2 }, "shotgun")),
  JSON.stringify(["fork"]), "zero-stack boons are excluded");
eq(JSON.stringify(applicableSupportBoons({}, "revolver")),
  JSON.stringify([]), "empty stacks -> empty");

// ================= Item 10: WAVES timeline table =================
console.log("== 10a. WAVES mirrors WAVE_WINDOWS (no drift) ==");
eq(WAVES.length, WAVE_WINDOWS.length, "same window count");
eq(WAVES.length, 7, "7 named windows, none invented");
WAVES.forEach((e, i) => {
  const w = WAVE_WINDOWS[i];
  eq(e.id, w.id, `WAVES[${i}].id`);
  eq(e.label, w.name, `WAVES[${i}].label === name`);
  eq(e.blurb, w.blurb, `WAVES[${i}].blurb`);
  eq(e.from, w.waveStart, `WAVES[${i}].from === waveStart`);
  eq(e.to === Infinity, w.waveEnd >= 999, `WAVES[${i}].endless flag`);
  if (w.waveEnd < 999) eq(e.to, w.waveEnd, `WAVES[${i}].to === waveEnd`);
  ok(Array.isArray(e.pool) && e.pool.length > 0, `WAVES[${i}].pool non-empty`);
  eq(e.spawnMult, 1, `WAVES[${i}].spawnMult === 1 (no per-window tuning today)`);
});

console.log("== 10b. window pools ==");
const poolOf = (id) => WAVES.find((e) => e.id === id).pool;
ok(poolOf("dusk").includes("shambler") && poolOf("dusk").includes("sprinter"), "dusk: shamblers + sprinters");
ok(!poolOf("dusk").includes("behemoth"), "dusk: no behemoth");
ok(poolOf("golden").includes("bomber") && poolOf("golden").includes("miner_brute"), "golden: bombers + miners");
ok(poolOf("howl").includes("bloater_spitter") && poolOf("howl").includes("riot_shield"), "howl: bloaters + riot_shield");
ok(poolOf("howl").includes("behemoth"), "howl: wave-5 behemoth");
ok(!poolOf("blood").includes("behemoth"), "blood: no behemoth (wave 6)");
ok(poolOf("damp").includes("behemoth"), "damp: wave-10 behemoth");
ok(poolOf("ben").includes("behemoth"), "ben: behemoth on 5th waves");
ok(!poolOf("ben").includes("haint"), "ben: haint is a boss-phase spawn, not a window spawn");
// Exact pools per window (extracted from spawnRandomZombie's conditionals).
const exact = {
  dusk: ["shambler", "sprinter", "crawler"],
  golden: ["shambler", "sprinter", "crawler", "bomber", "miner_brute"],
  howl: ["shambler", "sprinter", "crawler", "bomber", "miner_brute", "bloater_spitter", "riot", "riot_shield", "behemoth"],
  blood: ["shambler", "sprinter", "crawler", "bomber", "miner_brute", "bloater_spitter", "riot", "riot_shield"],
  hartwell: ["shambler", "sprinter", "crawler", "bomber", "miner_brute", "bloater_spitter", "riot", "riot_shield"],
  damp: ["shambler", "sprinter", "crawler", "bomber", "miner_brute", "bloater_spitter", "riot", "riot_shield", "behemoth"],
  ben: ["shambler", "sprinter", "crawler", "bomber", "miner_brute", "bloater_spitter", "riot", "riot_shield", "behemoth"],
};
for (const [id, want] of Object.entries(exact)) {
  eq(JSON.stringify(poolOf(id)), JSON.stringify(want), `${id} pool exact`);
}

console.log("== 10c. windowAt agrees with the legacy lookup ==");
// Replicate the OLD windowFor semantics against the OLD table, wave by wave.
const legacy = (wave) =>
  WAVE_WINDOWS.find((w) => wave >= w.waveStart && wave <= w.waveEnd) || WAVE_WINDOWS[WAVE_WINDOWS.length - 1];
for (let wv = 0; wv <= 40; wv++) {
  eq(windowAt(wv).id, legacy(wv).id, `windowAt(${wv}) === legacy`);
}
for (const wv of [999, 1000, 5000]) {
  eq(windowAt(wv).id, legacy(wv).id, `windowAt(${wv}) === legacy (endless)`);
}
// Boundary waves -> expected windows.
const expected = [[1, "dusk"], [2, "dusk"], [3, "golden"], [4, "howl"], [5, "howl"],
  [6, "blood"], [7, "hartwell"], [9, "hartwell"], [10, "damp"], [12, "damp"],
  [13, "ben"], [14, "ben"], [100, "ben"]];
for (const [wv, id] of expected) eq(windowAt(wv).id, id, `windowAt(${wv}) is ${id}`);
eq(windowAt(0).id, legacy(0).id, "windowAt(0) matches legacy fallback");

console.log("== 10d. spawnMultAt ==");
for (const wv of [1, 3, 5, 6, 10, 13, 50]) eq(spawnMultAt(wv), 1, `spawnMultAt(${wv}) === 1`);

// ================= Naming audit (new data) =================
console.log("== naming audit ==");
const hay = [
  ...WAVES.flatMap((e) => [e.id, e.label, e.blurb, ...e.pool]),
  ...AFFINITY_TAGS,
  ...INITIAL_WEAPONS.flatMap((w) => w.tags ?? []),
  ...BOON_CATALOG.flatMap((b) => [b.id, b.name, b.blurb, ...(b.tags ?? [])]),
].join("\n");
for (const bad of ["bayville", "griggsville", "illinois"]) {
  ok(!hay.toLowerCase().includes(bad), `no "${bad}" in new data`);
}

// ================= Live-engine section (Playwright, PZ_URL only) =================
const PZ_URL = process.env.PZ_URL;
if (!PZ_URL) {
  console.log("\nSKIP live-engine section (PZ_URL not set)");
} else {
  console.log("\n== live engine ==");
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: "/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(PZ_URL, { waitUntil: "networkidle" });
  await page.getByText("Survival · this place").click();
  await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
  const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);

  // 10e: director window lookup through the engine — same labels at the same waves.
  const names = await page.evaluate(() => {
    const c = window.__controlsTest;
    const out = {};
    for (const wv of [1, 2, 3, 4, 5, 6, 7, 9, 10, 12, 13, 20]) out[wv] = c.windowFor(wv);
    return out;
  });
  const wantNames = { 1: "Dusk Settles", 2: "Dusk Settles", 3: "Golden Swarm", 4: "The Trace Howls",
    5: "The Trace Howls", 6: "Blood Moon", 7: "The Hartwell Shift", 9: "The Hartwell Shift",
    10: "Black Damp", 12: "Black Damp", 13: "Old Ben Wakes", 20: "Old Ben Wakes" };
  for (const [wv, name] of Object.entries(wantNames)) eq(names[wv], name, `engine windowFor(${wv})`);
  // 10f: waveSchedule shape — same ids, names, wave ranges, current flag.
  const sched = await T("schedule()");
  eq(sched.length, 7, "schedule has 7 rows");
  eq(sched.map((r) => r.id).join(","), "dusk,golden,howl,blood,hartwell,damp,ben", "schedule ids");
  eq(sched.map((r) => r.waves).join(","), "1-2,3-3,4-5,6-6,7-9,10-12,13+", "schedule wave ranges (legacy X-Y format)");
  eq(sched[0].current, true, "dusk current at run start");
  eq(sched[0].name, "Dusk Settles", "schedule row name");
  // 10g: checkWindowChange still fires — dusk banner id at run start.
  await T("god()"); await T("skipBreak()"); await T("toBreak()");
  eq(await T("curWindow()"), "dusk", "curWindow is dusk after first break");
  // 9e: family-affinity behavior unchanged through the live damage path.
  const fam = await page.evaluate(() => {
    const c = window.__controlsTest;
    const before = c.famMul("revolver");
    c.unlockW("lever_rifle");
    return { before, after: c.famMul("revolver") };
  });
  eq(fam.before, 1, "iron family inactive with only revolver");
  eq(fam.after, 1.12, "iron affinity +12% with revolver+lever_rifle");
  ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await browser.close();
}

console.log(`\nbatch8d: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
