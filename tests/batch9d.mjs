// Batch 9 — Lane 4 (UI/meta) tests.
// (a) Pure sections run in plain node via jiti (TS sources imported
//     directly, localStorage shimmed).
//   node_modules/.bin/jiti tests/batch9d.mjs
// (b) Live section runs under Playwright against a dev server.
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch9d.mjs

// ---- localStorage shim (meta.ts / save.ts only touch it inside fns) ----
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.sessionStorage = globalThis.localStorage;

import {
  CHARACTERS,
  STAGES,
  DEFAULT_CHARACTER_ID,
  DEFAULT_STAGE_ID,
  characterDef,
  stageDef,
  characterExists,
  stageExists,
  rosterWeaponsValid,
  rosterStagesValid,
} from "../src/game/roster.ts";
import {
  selectedCharacterId,
  setSelectedCharacterId,
  selectedStageId,
  setSelectedStageId,
  characterDef as metaCharacterDef,
  stageDef as metaStageDef,
} from "../src/game/meta.ts";
import { INITIAL_WEAPONS, GAME_LOCATIONS } from "../src/game/constants.ts";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

console.log("== 9d(a). interface contract signatures ==");
eq(typeof selectedCharacterId, "function", "selectedCharacterId is a function");
eq(selectedCharacterId.length, 0, "selectedCharacterId() takes no args");
eq(typeof setSelectedCharacterId, "function", "setSelectedCharacterId is a function");
eq(setSelectedCharacterId.length, 1, "setSelectedCharacterId(id) takes one arg");
eq(typeof selectedStageId, "function", "selectedStageId is a function");
eq(selectedStageId.length, 0, "selectedStageId() takes no args");
eq(typeof setSelectedStageId, "function", "setSelectedStageId is a function");
eq(setSelectedStageId.length, 1, "setSelectedStageId(id) takes one arg");
eq(typeof characterDef, "function", "characterDef is a function");
eq(characterDef.length, 1, "characterDef(id) takes one arg");
eq(typeof stageDef, "function", "stageDef is a function");
eq(stageDef.length, 1, "stageDef(id) takes one arg");
// The contract is also re-exported through meta.ts for Lane 1's single import.
eq(metaCharacterDef, characterDef, "meta.ts re-exports characterDef");
eq(metaStageDef, stageDef, "meta.ts re-exports stageDef");

console.log("== 9d(b). defaults (fresh storage) ==");
store.clear();
eq(selectedCharacterId(), DEFAULT_CHARACTER_ID, "default character id");
eq(DEFAULT_CHARACTER_ID, "otis_hale", "default survivor is the revolver deputy");
eq(selectedStageId(), DEFAULT_STAGE_ID, "default stage id");
eq(DEFAULT_STAGE_ID, "white_oak_springs", "default stage is White Oak Springs");
// Garbage in storage falls back to defaults, never throws.
store.set("pz_character_v1", "not_a_survivor");
store.set("pz_stage_v1", "not_a_stage");
eq(selectedCharacterId(), DEFAULT_CHARACTER_ID, "garbage character key -> default");
eq(selectedStageId(), DEFAULT_STAGE_ID, "garbage stage key -> default");
store.clear();

console.log("== 9d(c). roster shape ==");
eq(CHARACTERS.length, 4, "4 playable survivors");
eq(STAGES.length, GAME_LOCATIONS.length, "one stage per GAME_LOCATIONS entry");
const weaponIds = new Set(INITIAL_WEAPONS.map((w) => w.id));
const locationIds = new Set(GAME_LOCATIONS.map((l) => l.id));
for (const c of CHARACTERS) {
  ok(typeof c.id === "string" && c.id.length > 0, `character has id`);
  ok(typeof c.name === "string" && c.name.length > 0, `${c.id}: name set`);
  ok(typeof c.title === "string" && c.title.length > 0, `${c.id}: title set`);
  ok(typeof c.blurb === "string" && c.blurb.length > 0, `${c.id}: blurb set`);
  ok(weaponIds.has(c.weaponId), `${c.id}: weaponId "${c.weaponId}" is a real INITIAL_WEAPONS id`);
  ok(typeof c.passiveName === "string" && c.passiveName.length > 0, `${c.id}: passiveName set`);
  ok(typeof c.passiveDesc === "string" && c.passiveDesc.length > 0, `${c.id}: passiveDesc set`);
  ok(c.mods && typeof c.mods === "object", `${c.id}: passive mods object present`);
}
ok(rosterWeaponsValid(), "rosterWeaponsValid()");
for (const s of STAGES) {
  ok(locationIds.has(s.id), `stage "${s.id}" maps to a real GAME_LOCATIONS id`);
  ok(typeof s.twist === "string" && s.twist.length > 0, `${s.id}: twist label set`);
  ok(typeof s.twistDesc === "string" && s.twistDesc.length > 0, `${s.id}: twist desc set`);
  ok(s.rules && typeof s.rules === "object" && Object.keys(s.rules).length > 0, `${s.id}: rules non-empty`);
}
ok(rosterStagesValid(), "rosterStagesValid()");

console.log("== 9d(d). persistence round-trip ==");
store.clear();
for (const c of CHARACTERS) {
  setSelectedCharacterId(c.id);
  eq(selectedCharacterId(), c.id, `character round-trip ${c.id}`);
}
eq(store.get("pz_character_v1"), CHARACTERS[CHARACTERS.length - 1].id, "character key written to storage");
for (const s of STAGES) {
  setSelectedStageId(s.id);
  eq(selectedStageId(), s.id, `stage round-trip ${s.id}`);
}
eq(store.get("pz_stage_v1"), STAGES[STAGES.length - 1].id, "stage key written to storage");
// Unknown ids are ignored, never persisted, never throw.
setSelectedCharacterId("bogus_survivor");
eq(selectedCharacterId(), STAGES.length ? CHARACTERS[CHARACTERS.length - 1].id : "", "bogus character id ignored");
setSelectedStageId("bogus_stage");
eq(selectedStageId(), STAGES[STAGES.length - 1].id, "bogus stage id ignored");
// characterDef / stageDef never throw on unknown ids.
eq(characterDef("bogus").id, DEFAULT_CHARACTER_ID, "characterDef(bogus) -> default survivor");
eq(stageDef("bogus").id, DEFAULT_STAGE_ID, "stageDef(bogus) -> default stage");
ok(characterExists(DEFAULT_CHARACTER_ID) && !characterExists("bogus"), "characterExists guard");
ok(stageExists(DEFAULT_STAGE_ID) && !stageExists("bogus"), "stageExists guard");
// Defs carry what Lane 1 consumes at run start.
const eula = characterDef("eula_stillwell");
eq(eula.weaponId, "lever_rifle", "Eula starts with the lever rifle");
ok(eula.mods.headshotMul === 1.25, "Eula passive mod present");
const stendal = stageDef("stendal_backbone");
ok(stendal.rules.gritMult === 1.25 && stendal.rules.zombieSpeedMult === 1.06, "Stendal rule flags present");

console.log("== 9d(e). Indiana flavor only ==");
// Scan the shipped roster data (names, titles, blurbs, twists, descs) —
// the flavor strings players actually see. Never Bayville/Griggsville/Illinois.
const hay = JSON.stringify({ CHARACTERS, STAGES });
for (const bad of ["bayville", "griggsville", "illinois"]) {
  ok(!hay.toLowerCase().includes(bad), `no "${bad}" in roster data`);
}

// ================= Live section (Playwright) =================
const PZ_URL = process.env.PZ_URL || "http://127.0.0.1:8082";
console.log("\n== live (Playwright) ==");
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

  // 1. Character select renders 4 survivors on the title screen.
  const cards = page.locator("[data-character-id]");
  eq(await cards.count(), 4, "4 survivor cards on title");
  ok(await page.getByText("Otis Hale").isVisible(), "default survivor card visible");

  // 2. Pick Eula (lever rifle) — persists to pz_character_v1.
  await page.locator('[data-character-id="eula_stillwell"]').click();
  eq(await page.evaluate(() => localStorage.getItem("pz_character_v1")), "eula_stillwell", "character pick persists");

  // 3. Default stage twist card shows for White Oak Springs.
  ok(await page.getByText("Deep Woods, Long Night").isVisible(), "default stage twist card visible");

  // 4. Pick Stendal on the county map (node x:62 y:80) — persists, twist card swaps.
  // SVG circles have no .click(); dispatch a bubbled click for React's onClick.
  await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="county-map"]');
    const circles = [...(svg?.querySelectorAll("circle") ?? [])];
    const el = circles.find((c) => c.getAttribute("cx") === "62" && c.getAttribute("cy") === "80");
    if (!el) throw new Error("stendal node not found");
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  eq(await page.evaluate(() => localStorage.getItem("pz_stage_v1")), "stendal_backbone", "stage pick persists");
  ok(await page.getByText("Rich Seam, Hard Shift").isVisible(), "Stendal twist card visible");

  // 5. Start survival — character starting weapon + stage map both take effect.
  await page.getByText("Survival · this place").click();
  await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
  const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
  eq(await T("getWeapon()"), "lever_rifle", "run starts with the selected survivor's weapon");
  const px = await T("getX()"), py = await T("getY()");
  ok(Math.abs(px - 1040) < 2 && Math.abs(py - 1320) < 2,
    `run starts on the selected stage map (spawn 1040,1320; got ${Math.round(px)},${Math.round(py)})`);

  // 6. Score-multiplier HUD badge: hidden while the Lane 1 probe is absent.
  eq(await page.getByTestId("score-mul-badge").count(), 0, "badge hidden without probe");

  // 7. Force the probe active — badge appears with 2x label, seconds, countdown bar.
  await page.evaluate(() => {
    window.__controlsTest.scoreMulState = () => ({ active: true, timeLeft: 12000, mult: 2 });
  });
  const badge = page.getByTestId("score-mul-badge");
  await badge.waitFor({ state: "visible", timeout: 5000 });
  ok((await badge.textContent()).includes("2× SCORE"), "badge shows 2x label");
  const secs = await page.getByTestId("score-mul-seconds").textContent();
  ok(/^\d+s$/.test(secs ?? "") && parseInt(secs ?? "0", 10) <= 12, `badge countdown reads "${secs}"`);
  const barW = await page.getByTestId("score-mul-bar").evaluate((el) => el.style.width);
  const pct = parseFloat(barW);
  ok(!Number.isNaN(pct) && pct > 0 && pct <= 100, `countdown bar width "${barW}" in (0,100]`);

  // 8. Probe inactive again — badge hides.
  await page.evaluate(() => {
    window.__controlsTest.scoreMulState = () => ({ active: false, timeLeft: 0, mult: 2 });
  });
  await badge.waitFor({ state: "detached", timeout: 5000 });
  ok(true, "badge hides when probe reports inactive");

  ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await browser.close();
}

console.log(`\nbatch9d: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
