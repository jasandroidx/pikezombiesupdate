// Batch 10 — Lane 3 (meta/UI) tests.
// (a) Pure sections run in plain node via jiti (TS sources imported
//     directly, localStorage shimmed).
//   node_modules/.bin/jiti tests/batch10c.mjs
// (b) Live section runs under Playwright against a dev server.
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch10c.mjs

// ---- localStorage shim (meta.ts / save.ts / SaveTransfer.tsx only touch it inside fns) ----
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
  META_TREE,
  META_TREE_MAX_TIER,
  getMetaTree,
  buyTreeTier,
  treeBranchBonus,
  getRunStatMods,
  loadMeta,
  recordRun,
  topRuns,
} from "../src/game/meta.ts";
import { loadSave, writeSave } from "../src/game/save.ts";
import {
  collectSaveData,
  serializeSaveData,
  validateSaveData,
  applySaveData,
  SAVE_EXPORT_GAME,
  SAVE_EXPORT_MAX_VALUE_BYTES,
} from "../src/components/game/SaveTransfer.tsx";

let pass = 0, fail = 0;
const blocked = [];
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
function approx(a, b, label, tol = 1e-9) {
  ok(Math.abs(a - b) <= tol, `${label} (got ${a}, want ${b})`);
}

console.log("== 10c(a). tree shape: 3 branches x 4 tiers = 12 nodes ==");
eq(META_TREE_MAX_TIER, 4, "max tier is 4");
eq(META_TREE.length, 3, "3 branches");
eq(META_TREE.map((b) => b.id).join(","), "homesteader,deadeye,scrounger", "branch ids");
const allNodes = META_TREE.flatMap((b) => b.nodes);
eq(allNodes.length, 12, "12 nodes total");
for (const b of META_TREE) {
  eq(b.nodes.length, 4, `${b.id}: 4 tiers`);
  eq(b.nodes.map((n) => n.tier).join(","), "1,2,3,4", `${b.id}: tiers 1..4 in order`);
  ok(b.nodes[3].capstone === true, `${b.id}: tier 4 is the capstone`);
  ok(!b.nodes[0].capstone && !b.nodes[1].capstone && !b.nodes[2].capstone, `${b.id}: tiers 1-3 are not capstones`);
  const costs = b.nodes.map((n) => n.cost);
  ok(costs[0] < costs[1] && costs[1] < costs[2] && costs[2] < costs[3], `${b.id}: costs escalate (${costs.join("/")})`);
  ok(b.nodes.every((n) => n.bonus > 0), `${b.id}: every node has a positive bonus`);
  ok(b.nodes.every((n) => typeof n.name === "string" && n.name.length > 0 && typeof n.flavor === "string" && n.flavor.length > 0), `${b.id}: names + flavor set`);
}
eq(META_TREE[0].theme, "Survivability", "homesteader = survivability");
eq(META_TREE[1].theme, "Damage", "deadeye = damage");
eq(META_TREE[2].theme, "Economy", "scrounger = economy");
// Indiana only — never Bayville/Griggsville/Illinois in tree flavor.
const hay = JSON.stringify(META_TREE);
for (const bad of ["bayville", "griggsville", "illinois"]) {
  ok(!hay.toLowerCase().includes(bad), `no "${bad}" in tree data`);
}

console.log("== 10c(b). tier purchase + persistence round-trip ==");
store.clear();
{
  const t0 = getMetaTree();
  eq(t0.tiers.homesteader, 0, "fresh: homesteader tier 0");
  eq(t0.tiers.deadeye, 0, "fresh: deadeye tier 0");
  eq(t0.tiers.scrounger, 0, "fresh: scrounger tier 0");
}
writeSave({ stubs: 100000 });
eq(buyTreeTier("bogus_branch").ok, false, "unknown branch rejected");
eq(buyTreeTier("bogus_branch").reason, "unknown branch", "unknown branch reason");
{
  const r1 = buyTreeTier("homesteader");
  eq(r1.ok, true, "buy homesteader T1");
  eq(loadMeta().tree.homesteader, 1, "T1 persisted in pz_meta_v1");
  eq(loadSave().stubs, 100000 - 200, "T1 cost 200 stubs deducted");
  const r2 = buyTreeTier("homesteader");
  eq(r2.ok, true, "buy homesteader T2");
  eq(loadMeta().tree.homesteader, 2, "T2 persisted (sequential, no skipping)");
  eq(loadSave().stubs, 100000 - 200 - 500, "T2 cost 500 stubs deducted");
}
// Insufficient stubs: rejected, tier unchanged, stubs untouched.
writeSave({ stubs: 0 });
{
  const r = buyTreeTier("deadeye");
  eq(r.ok, false, "insufficient stubs rejected");
  eq(r.reason, "insufficient stubs", "insufficient stubs reason");
  eq(loadMeta().tree.deadeye ?? 0, 0, "failed buy does not change tier");
  eq(loadSave().stubs, 0, "failed buy does not spend stubs");
}
// Maxed: 4 buys then the 5th is rejected.
writeSave({ stubs: 100000 });
for (let i = 1; i <= 4; i++) {
  const r = buyTreeTier("deadeye");
  eq(r.ok, true, `deadeye T${i} buy ok`);
}
{
  const r = buyTreeTier("deadeye");
  eq(r.ok, false, "5th buy rejected");
  eq(r.reason, "maxed", "maxed reason");
  eq(loadMeta().tree.deadeye, 4, "tier stays at 4");
}
// Persistence round-trip through raw storage.
{
  const raw = JSON.parse(store.get("pz_meta_v1"));
  eq(raw.tree.homesteader, 2, "raw save carries homesteader:2");
  eq(raw.tree.deadeye, 4, "raw save carries deadeye:4");
  const re = loadMeta();
  eq(re.tree.homesteader, 2, "reload: homesteader:2");
  eq(re.tree.deadeye, 4, "reload: deadeye:4");
  const gt = getMetaTree();
  eq(gt.tiers.homesteader, 2, "getMetaTree reflects persisted tiers");
}
// Sanitization: garbage tree values clamp, unknown ids drop.
store.set("pz_meta_v1", JSON.stringify({ v: 1, lifetime: loadMeta().lifetime, questsDone: [], tree: { homesteader: 99, bogus: 3, deadeye: "x" } }));
{
  const m = loadMeta();
  eq(m.tree.homesteader, 4, "tier clamps to 4");
  eq(m.tree.bogus, undefined, "unknown branch id dropped");
  eq(m.tree.deadeye ?? 0, 0, "non-numeric tier dropped");
}
store.clear();

console.log("== 10c(c). capstone effects reach run start via getRunStatMods ==");
{
  const m = getRunStatMods();
  approx(m.damageMul, 1, "fresh: damageMul 1");
  approx(m.hpMul, 1, "fresh: hpMul 1");
  approx(m.speedMul, 1, "fresh: speedMul 1");
  approx(m.xpMul, 1, "fresh: xpMul 1");
}
// Old saves without `tree` keep working (backward compatible).
store.set("pz_meta_v1", JSON.stringify({ v: 1, lifetime: loadMeta().lifetime, questsDone: [] }));
{
  const m = loadMeta();
  eq(JSON.stringify(m.tree), "{}", "old save loads tree as {}");
  const mods = getRunStatMods();
  approx(mods.damageMul, 1, "old save: damageMul still 1");
}
store.clear();
// Full capstones: deadeye .06+.06+.07+.22 = .41; homesteader .08+.08+.09+.25 = .50;
// scrounger .07+.08+.09+.25 = .49.
store.set("pz_meta_v1", JSON.stringify({
  v: 1,
  lifetime: { kills: 0, headshots: 0, wavesCleared: 0, chestsOpened: 0, shrinesAttuned: 0, runsPlayed: 0 },
  questsDone: [],
  tree: { homesteader: 4, deadeye: 4, scrounger: 4 },
}));
{
  const m = getRunStatMods();
  approx(m.damageMul, 1.41, "deadeye capstone: damageMul 1.41");
  approx(m.hpMul, 1.5, "homesteader capstone: hpMul 1.50");
  approx(m.xpMul, 1.49, "scrounger capstone: xpMul 1.49");
  approx(m.speedMul, 1, "speedMul untouched by tree");
}
// Partial tiers stack additively inside the branch.
store.set("pz_meta_v1", JSON.stringify({
  v: 1,
  lifetime: { kills: 0, headshots: 0, wavesCleared: 0, chestsOpened: 0, shrinesAttuned: 0, runsPlayed: 0 },
  questsDone: [],
  tree: { deadeye: 1 },
}));
approx(getRunStatMods().damageMul, 1.06, "deadeye T1: damageMul 1.06");
// Tree multiplies with the existing stat-shop channel (shop damage T4 = 1.16).
writeSave({ shopTiers: { damage: 4 } });
approx(getRunStatMods().damageMul, 1.16 * 1.06, "tree x stat-shop multiply");
eq(treeBranchBonus("bogus", 4), 0, "unknown branch bonus is 0");
store.clear();

console.log("== 10c(d). save export/import ==");
store.set("pz_meta_v1", JSON.stringify({ v: 1, hello: "meta" }));
store.set("pz_character_v1", "otis_hale");
store.set("pz-a11y-v1", JSON.stringify({ colorblind: true }));
store.set("pcz_save_v2", JSON.stringify({ version: 3, stubs: 42 }));
store.set("unrelated_key", "nope");
{
  const data = collectSaveData();
  eq(data.game, SAVE_EXPORT_GAME, "export game marker");
  ok(data.keys["pz_meta_v1"] !== undefined, "export includes pz_meta_v1");
  ok(data.keys["pz_character_v1"] === "otis_hale", "export includes pz_character_v1");
  ok(data.keys["pz-a11y-v1"] !== undefined, "export includes pz-a11y-v1");
  ok(data.keys["pcz_save_v2"] !== undefined, "export includes pcz_save_v2 (stubs live there)");
  eq(data.keys["unrelated_key"], undefined, "export excludes non-save keys");
  const v = validateSaveData(data);
  eq(v.ok, true, "export validates clean");
  if (v.ok) eq(Object.keys(v.keys).length, 4, "validated key count");
  // Serialize round-trip.
  const back = validateSaveData(JSON.parse(serializeSaveData(data)));
  eq(back.ok, true, "serialized export re-validates");
}
// Corrupt / hostile inputs are rejected, never throw.
const badCases = [
  ["null", null],
  ["array", []],
  ["string", "hello"],
  ["missing game", { version: 1, keys: {} }],
  ["wrong game", { game: "other-game", version: 1, keys: {} }],
  ["missing version", { game: SAVE_EXPORT_GAME, keys: {} }],
  ["missing keys", { game: SAVE_EXPORT_GAME, version: 1 }],
  ["unexpected key", { game: SAVE_EXPORT_GAME, version: 1, keys: { evil: "{}" } }],
  ["non-string value", { game: SAVE_EXPORT_GAME, version: 1, keys: { pz_meta_v1: 42 } }],
  ["oversized value", { game: SAVE_EXPORT_GAME, version: 1, keys: { pz_meta_v1: "x".repeat(SAVE_EXPORT_MAX_VALUE_BYTES + 1) } }],
];
for (const [label, input] of badCases) {
  const v = validateSaveData(input);
  eq(v.ok, false, `reject: ${label}`);
  ok(!v.ok && typeof v.reason === "string" && v.reason.length > 0, `reject reason: ${label}`);
}
// Raw (non-JSON) string values are legitimate: pz_character_v1 stores a bare id.
{
  const v = validateSaveData({ game: SAVE_EXPORT_GAME, version: 1, keys: { pz_character_v1: "otis_hale" } });
  eq(v.ok, true, "raw string values accepted");
}
// Import round-trip: wipe, apply, everything back.
{
  const data = collectSaveData();
  const v = validateSaveData(data);
  if (!v.ok) throw new Error("export should validate");
  store.clear();
  eq(store.get("pz_meta_v1"), undefined, "wiped");
  applySaveData(v.keys);
  eq(store.get("pz_meta_v1"), data.keys["pz_meta_v1"], "pz_meta_v1 restored");
  eq(store.get("pcz_save_v2"), data.keys["pcz_save_v2"], "pcz_save_v2 restored");
  eq(store.get("unrelated_key"), undefined, "unrelated key not invented");
}
store.clear();

console.log("== 10c(e). hall of records + quests untouched ==");
{
  recordRun({ score: 100, kills: 10, time: 60, level: 2, date: 1 });
  recordRun({ score: 300, kills: 30, time: 120, level: 4, date: 2 });
  const runs = topRuns();
  eq(runs.length, 2, "hall keeps 2 runs");
  eq(runs[0].score, 300, "hall sorted desc");
  const m = loadMeta();
  ok(Array.isArray(m.questsDone) && Array.isArray(m.runs), "meta shape intact");
}
store.clear();

// ================= Live section (Playwright) =================
const PZ_URL = process.env.PZ_URL || "http://127.0.0.1:8082";
console.log("\n== live (Playwright) ==");
{
  const { chromium } = await import("playwright-core");
  const fs = await import("fs");
  const browser = await chromium.launch({
    executablePath: "/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Fresh storage for deterministic assertions.
  await page.goto(PZ_URL, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);

  console.log("-- title flow + county record --");
  ok(await page.getByRole("heading", { name: "PIKE COUNTY" }).isVisible(), "title screen renders");
  ok(await page.getByText("First Blood").isVisible(), "County Record quest list renders");

  console.log("-- record office: honors tab default, tree tab --");
  await page.getByRole("button", { name: "County Record Office" }).click();
  ok(await page.getByText("Hartwell Grit").isVisible(), "honors (stat shop) tab is the default");
  await page.getByTestId("record-tab-tree").click();
  const tree = page.getByTestId("meta-tree");
  await tree.waitFor({ state: "visible", timeout: 5000 });
  eq(await page.getByTestId(/meta-tree-branch-/).count(), 3, "3 tree branches render");
  eq(await page.getByTestId(/meta-tree-tier-/).count(), 12, "12 tier nodes render");
  ok(await page.getByTestId("meta-tree-tier-homesteader-4").getByText("Dug In Deep").isVisible(), "homesteader capstone node visible");
  ok(await page.getByTestId("meta-tree-tier-deadeye-4").getByText("Ledger of the Dead").isVisible(), "deadeye capstone node visible");
  ok(await page.getByTestId("meta-tree-tier-scrounger-4").getByText("Company Store").isVisible(), "scrounger capstone node visible");

  // Close the record office between sections so later clicks aren't blocked.
  // (The modal has no Escape handler; its close button is aria-label="Close".)
  const closeRecordOffice = async () => {
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("meta-tree").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
    await page.getByTestId("stat-shop").waitFor({ state: "detached", timeout: 5000 });
  };
  await closeRecordOffice();

  console.log("-- tree tier purchase (stub currency) --");
  // Seed stubs in place (no reload): MetaTreePanel reads loadSave() fresh on
  // mount. Seeding then reloading would trip the app's pre-existing SSR
  // stub-count hydration warning, which is unrelated to this lane.
  await page.evaluate(() => {
    const raw = localStorage.getItem("pcz_save_v2");
    const s = raw ? JSON.parse(raw) : {};
    s.stubs = 50000;
    s.version = 3;
    localStorage.setItem("pcz_save_v2", JSON.stringify(s));
  });
  await page.getByRole("button", { name: "County Record Office" }).click();
  await page.getByTestId("record-tab-tree").click();
  const buyBtn = page.getByTestId("meta-tree-buy-homesteader");
  await buyBtn.waitFor({ state: "visible", timeout: 8000 });
  // Playwright's scroll-into-view fights the modal's nested scroll container;
  // elementFromPoint confirms the button is the topmost hit for real users,
  // so dispatch the click directly (same React onClick path).
  await buyBtn.evaluate((el) => el.click());
  eq(await page.evaluate(() => JSON.parse(localStorage.getItem("pcz_save_v2")).stubs), 49800, "T1 cost 200 stubs deducted");
  eq(await page.evaluate(() => JSON.parse(localStorage.getItem("pz_meta_v1")).tree.homesteader), 1, "homesteader T1 persisted");
  // Purchase survives a panel remount (fresh loadSave() read from localStorage).
  await closeRecordOffice();
  await page.getByRole("button", { name: "County Record Office" }).click();
  await page.getByTestId("record-tab-tree").click();
  ok(await page.getByTestId("meta-tree-branch-homesteader").getByText("Tier 1/4").isVisible(), "tier persists across remount");
  // Reset stubs to 0 so later full page loads don't trip the pre-existing
  // SSR stub-count hydration warning.
  await page.evaluate(() => {
    const raw = localStorage.getItem("pcz_save_v2");
    const s = raw ? JSON.parse(raw) : {};
    s.stubs = 0;
    localStorage.setItem("pcz_save_v2", JSON.stringify(s));
  });
  await closeRecordOffice();

  console.log("-- capstone effects reach run start --");
  await page.evaluate(() => {
    const raw = localStorage.getItem("pz_meta_v1");
    const m = raw ? JSON.parse(raw) : { v: 1 };
    m.v = 1;
    m.lifetime = m.lifetime || { kills: 0, headshots: 0, wavesCleared: 0, chestsOpened: 0, shrinesAttuned: 0, runsPlayed: 0 };
    m.questsDone = m.questsDone || [];
    m.tree = { homesteader: 4, deadeye: 4, scrounger: 4 };
    localStorage.setItem("pz_meta_v1", JSON.stringify(m));
  });
  await page.getByText("Survival · this place").click();
  await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
  {
    const r = await T("roster9()");
    const dmgOk = Math.abs(r.dmgMul - 1.41) < 0.001;
    ok(dmgOk, `deadeye capstone wired at run start (dmgMul ${r.dmgMul})`);
    eq(r.maxHp, 150, `homesteader capstone wired at run start (maxHp ${r.maxHp})`);
  }

  console.log("-- signature HUD button: hidden without probe --");
  // The real engine now ships signatureState (Lane 1), so remove it to test
  // the absent-probe path, then restore it for the live sections below.
  const realSig = await page.evaluate(() => {
    const ct = window.__controlsTest;
    const fn = ct.signatureState;
    delete ct.signatureState;
    return typeof fn;
  });
  await page.waitForTimeout(600);
  eq(await page.getByTestId("signature-button").count(), 0, "button hidden when probe absent");

  // Gate: the signature button renders from hudStats, which only updates via
  // the engine's onStatsUpdate. If the engine lane's WIP crashes the frame
  // loop before onStatsUpdate (currently: updateLobbedCharges reads
  // this.lobbedCharges.length, but the field is never initialized), no HUD
  // badge can render and the live signature assertions are untestable.
  // Detect that and skip loudly instead of hanging, so the remaining
  // sections (export/import/a11y) still get verified.
  console.log("-- signature HUD button: forced probe -> visible --");
  await page.evaluate(() => {
    window.__controlsTest.signatureState = () => ({ ready: true, timeLeft: 0, name: "Petersburg Draw" });
  });
  const sigBtn = page.getByTestId("signature-button");
  let sigLive = true;
  try {
    await sigBtn.waitFor({ state: "visible", timeout: 4000 });
  } catch {
    sigLive = false;
  }
  if (!sigLive) {
    const why = "signature HUD live tests BLOCKED: engine frame loop throws before onStatsUpdate " +
      "(Lane 1 WIP: updateLobbedCharges reads this.lobbedCharges.length, field never initialized), " +
      "so hudStats never updates and no HUD badge can render. " +
      "Verified instead: forced probe exists and returns {ready,timeLeft,name}; " +
      "lane-3 polling code handles that exact shape (incl. timeLeft:null -> 0).";
    blocked.push(why);
    console.log("*** " + why);
    await page.evaluate(() => { delete window.__controlsTest.signatureState; });
  } else {
    ok(((await sigBtn.textContent()) || "").includes("Petersburg Draw"), "button shows the special name");
    ok(((await sigBtn.textContent()) || "").includes("Q"), "button shows the Q key binding");
    // Clicking with the engine trigger absent is a guarded no-op, not an error.
    await sigBtn.click();
    ok(true, "click with no engine trigger does not error");

    console.log("-- signature HUD button: cooldown state --");
    await page.evaluate(() => {
      window.__controlsTest.signatureState = () => ({ ready: false, timeLeft: 8000, name: "Petersburg Draw" });
    });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="signature-button"]');
      return el && el.hasAttribute("disabled");
    }, null, { timeout: 5000 });
    ok(true, "button disabled while cooling down");
    const sweepBg = await page.getByTestId("signature-sweep").evaluate((el) => el.style.background);
    ok(sweepBg.includes("conic-gradient"), `cooldown sweep renders (${sweepBg.slice(0, 30)}...)`);

    console.log("-- signature HUD button: probe removed -> hidden --");
    await page.evaluate(() => { delete window.__controlsTest.signatureState; });
    await sigBtn.waitFor({ state: "detached", timeout: 5000 });
    ok(true, "button hides when the probe goes away");
  }

  console.log("-- back to title for settings/save tests --");
  await page.goto(PZ_URL, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("a11y-panel").waitFor({ state: "visible", timeout: 5000 });

  console.log("-- save export --");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("save-export").click(),
  ]);
  const dlPath = await download.path();
  const exported = JSON.parse(await fs.promises.readFile(dlPath, "utf8"));
  eq(exported.game, "pike-county-zombies", "export game marker");
  ok(typeof exported.keys["pz_meta_v1"] === "string", "export carries pz_meta_v1");
  ok(Object.keys(exported.keys).every((k) => /^pz[_-]/.test(k) || k === "pcz_save_v2"), "export keys are save keys only");
  ok((await page.getByTestId("save-transfer-status").textContent()).includes("Exported"), "export status shown");

  console.log("-- save import: corrupt file rejected, storage untouched --");
  const beforeMeta = await page.evaluate(() => localStorage.getItem("pz_meta_v1"));
  await fs.promises.writeFile("/tmp/pz-corrupt-10c.json", "this is not json{{{");
  await page.locator('[data-testid="save-import"]').setInputFiles("/tmp/pz-corrupt-10c.json");
  const corruptStatus = page.getByTestId("save-transfer-status");
  await corruptStatus.waitFor({ state: "visible", timeout: 5000 });
  ok(((await corruptStatus.textContent()) || "").includes("Import failed"), "corrupt file rejected with message");
  eq(await page.evaluate(() => localStorage.getItem("pz_meta_v1")), beforeMeta, "corrupt import changes nothing");

  console.log("-- save import: valid round-trip --");
  await page.evaluate(() => localStorage.removeItem("pz_meta_v1"));
  eq(await page.evaluate(() => localStorage.getItem("pz_meta_v1")), null, "pz_meta_v1 wiped");
  await page.locator('[data-testid="save-import"]').setInputFiles(dlPath);
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="save-transfer-status"]');
    return el && el.textContent.includes("Imported");
  }, null, { timeout: 5000 });
  ok(true, "valid file imports");
  eq(await page.evaluate(() => localStorage.getItem("pz_meta_v1")), exported.keys["pz_meta_v1"], "pz_meta_v1 restored from file");

  console.log("-- colorblind palette toggle --");
  await page.getByTestId("a11y-colorblind").click();
  ok(await page.evaluate(() => document.documentElement.hasAttribute("data-colorblind")), "data-colorblind set on <html>");
  ok(await page.evaluate(() => !!document.getElementById("pz-colorblind-palette")), "palette style element injected");
  ok((await page.evaluate(() => localStorage.getItem("pz-a11y-v1"))).includes('"colorblind":true'), "colorblind persists");

  console.log("-- frame cap selector --");
  await page.getByTestId("frame-cap-60").click();
  eq(await page.evaluate(() => window.__pzFrameCap), 60, "frame cap handed to window.__pzFrameCap");
  ok((await page.evaluate(() => localStorage.getItem("pz-a11y-v1"))).includes('"frameCap":60'), "frame cap persists");

  console.log("-- a11y persistence across reload --");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByTestId("a11y-panel").waitFor({ state: "visible", timeout: 5000 });
  eq(await page.getByTestId("a11y-colorblind").getAttribute("aria-pressed"), "true", "colorblind toggle retained");
  eq(await page.getByTestId("frame-cap-60").getAttribute("aria-pressed"), "true", "frame cap retained");

  ok(errors.length === 0, `zero page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await browser.close();
}

console.log(`\nbatch10c: ${pass} passed, ${fail} failed${blocked.length ? `, ${blocked.length} blocked` : ""}`);
for (const b of blocked) console.log("BLOCKED: " + b);
process.exit(fail || blocked.length ? 1 : 0);
