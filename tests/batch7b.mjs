// Batch 7 — Lane B (data/meta) tests.
//   - chainlightning / orbiter weapon defs + WEAPON_LEVELS rows
//   - draftable boon entries for both
//   - County Record Office stat shop: buyStat validation/order, persistence,
//     getRunStatMods, getStatShop
//   - negative: no Bayville / Griggsville / Illinois anywhere in the new data
//
// Run:  PZ_URL=http://127.0.0.1:8094 node tests/batch7b.mjs
// (imports /src TS modules via the Vite dev server, like batch6c.mjs)
import { chromium } from "playwright-core";

const URL = process.env.PZ_URL || "http://127.0.0.1:8094";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

console.log("== batch7b setup ==");
// NOTE: no game-init wait — the engine lane is editing engine.ts concurrently,
// so __controlsTest is flaky. All lane-B modules are imported directly from
// the Vite dev server, which works whether or not the game boots.
await page.goto(URL, { waitUntil: "networkidle" });

console.log("== 1. chainlightning def (exact fields) ==");
const cl = await page.evaluate(async () => {
  const m = await import("/src/game/constants.ts");
  return m.SPECIAL_WEAPON_DEFS.chainlightning;
});
ok("chainlightning id", cl.id === "chainlightning", JSON.stringify(cl));
ok("chainlightning name", cl.name === "Patoka Arc", JSON.stringify(cl.name));
ok("chainlightning fireIntervalMs", cl.fireIntervalMs === 1500, JSON.stringify(cl.fireIntervalMs));
ok("chainlightning projectileCount", cl.projectileCount === 1, JSON.stringify(cl.projectileCount));
ok("chainlightning chainJumps", cl.chainJumps === 4, JSON.stringify(cl.chainJumps));
ok("chainlightning chainFalloff", cl.chainFalloff === 0.75, JSON.stringify(cl.chainFalloff));
ok("chainlightning chainRadius", cl.chainRadius === 260, JSON.stringify(cl.chainRadius));
ok("chainlightning has numeric damage", typeof cl.damage === "number", JSON.stringify(cl.damage));

console.log("== 2. orbiter def (exact fields) ==");
const ob = await page.evaluate(async () => {
  const m = await import("/src/game/constants.ts");
  return m.SPECIAL_WEAPON_DEFS.orbiter;
});
ok("orbiter id", ob.id === "orbiter", JSON.stringify(ob));
ok("orbiter name", ob.name === "Still-Yard Blades", JSON.stringify(ob.name));
ok("orbiter damage is 0", ob.damage === 0, JSON.stringify(ob.damage));
ok("orbiter fireIntervalMs", ob.fireIntervalMs === 1000, JSON.stringify(ob.fireIntervalMs));
ok("orbiter orbiterCount", ob.orbiterCount === 3, JSON.stringify(ob.orbiterCount));
ok("orbiter orbiterRadius", ob.orbiterRadius === 110, JSON.stringify(ob.orbiterRadius));
ok("orbiter orbiterDps", ob.orbiterDps === 14, JSON.stringify(ob.orbiterDps));
ok("orbiter orbiterSpeed", ob.orbiterSpeed === 2.6, JSON.stringify(ob.orbiterSpeed));

console.log("== 3. WEAPON_LEVELS rows (5 levels each) ==");
const lv = await page.evaluate(async () => {
  const m = await import("/src/game/constants.ts");
  const rows = {};
  for (const id of ["chainlightning", "orbiter"]) {
    const row = m.WEAPON_LEVELS[id];
    rows[id] = row ? { len: [row.dmg.length, row.cnt.length, row.rad.length, row.spd.length, row.cd.length],
      l1: m.statsForLevel(id, 1), l5: m.statsForLevel(id, 5) } : null;
  }
  return rows;
});
for (const id of ["chainlightning", "orbiter"]) {
  ok(`${id} WEAPON_LEVELS row exists`, lv[id] !== null, id);
  ok(`${id} all arrays have 5 entries`, lv[id] && lv[id].len.every((n) => n === 5), JSON.stringify(lv[id]));
  ok(`${id} statsForLevel(1/5) resolves`, !!(lv[id] && lv[id].l1 && lv[id].l5), JSON.stringify(lv[id] && lv[id].l1));
}
ok("chainlightning l1 dmg matches def damage", lv.chainlightning.l1.dmg === cl.damage, JSON.stringify(lv.chainlightning.l1));
ok("orbiter l1 dps matches def orbiterDps", lv.orbiter.l1.dmg === ob.orbiterDps, JSON.stringify(lv.orbiter.l1));

console.log("== 4. boon catalog (draftable) ==");
const boons = await page.evaluate(async () => {
  const m = await import("/src/game/boons.ts");
  const cl = m.BOON_CATALOG.find((b) => b.id === "chainlightning");
  const ob = m.BOON_CATALOG.find((b) => b.id === "orbiter");
  // Draftability through the real rollBoons path: banish everything else so
  // the pool is exactly {chainlightning, orbiter, lead} and confirm both new
  // boons can be dealt (proves they pass the hidden/banish/cap filter).
  const all = m.BOON_CATALOG.map((b) => b.id);
  const banish = new Set(all.filter((id) => id !== "chainlightning" && id !== "orbiter" && id !== "lead"));
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    for (const b of m.rollBoons({}, 0, 5, 0, 0, banish)) seen.add(b.id);
  }
  return { cl, ob, seenCl: seen.has("chainlightning"), seenOb: seen.has("orbiter") };
});
ok("chainlightning boon in catalog, not hidden", boons.cl && boons.cl.hidden !== true, JSON.stringify(boons.cl));
ok("orbiter boon in catalog, not hidden", boons.ob && boons.ob.hidden !== true, JSON.stringify(boons.ob));
ok("chainlightning boon is draftable", boons.seenCl === true);
ok("orbiter boon is draftable", boons.seenOb === true);

console.log("== 5. County Record Office: buyStat validation & order ==");
const shop1 = await page.evaluate(async () => {
  const meta = await import("/src/game/meta.ts");
  const save = await import("/src/game/save.ts");
  save.writeSave({ stubs: 2000, shopTiers: {} });
  const t0 = meta.getStatShop();
  const b1 = meta.buyStat("damage");   // tier1: 100
  const after1 = meta.getStatShop();
  const b2 = meta.buyStat("damage");   // tier2: 250
  const after2 = meta.getStatShop();
  const bogus = meta.buyStat("bogus");
  return { t0, b1, after1, b2, after2, bogus };
});
ok("getStatShop returns 4 tracks", shop1.t0.tracks.length === 4, JSON.stringify(shop1.t0.tracks.map((t) => t.id)));
ok("track ids are damage/hp/speed/xp", ["damage", "hp", "speed", "xp"].every((id) => shop1.t0.tracks.some((t) => t.id === id)));
ok("each track has 4 tier costs", shop1.t0.tracks.every((t) => t.costs.length === 4));
ok("buy tier1 ok, deducts 100", shop1.b1.ok === true && shop1.after1.tiers.damage === 1 && shop1.after1.stubs === 1900, JSON.stringify(shop1.after1));
ok("buy tier2 ok, deducts 250 (order enforced)", shop1.b2.ok === true && shop1.after2.tiers.damage === 2 && shop1.after2.stubs === 1650, JSON.stringify(shop1.after2));
ok("unknown track rejected", shop1.bogus.ok === false && shop1.bogus.reason === "unknown track", JSON.stringify(shop1.bogus));

const shop2 = await page.evaluate(async () => {
  const meta = await import("/src/game/meta.ts");
  const save = await import("/src/game/save.ts");
  save.writeSave({ stubs: 50, shopTiers: {} });
  const poor = meta.buyStat("damage"); // tier1 costs 100 > 50
  const mods0 = meta.getRunStatMods();
  save.writeSave({ stubs: 99999, shopTiers: { damage: 4 } });
  const maxed = meta.buyStat("damage");
  save.writeSave({ stubs: 0, shopTiers: { damage: 2, hp: 1, speed: 3, xp: 4 } });
  const mods = meta.getRunStatMods();
  return { poor, mods0, maxed, mods };
});
ok("insufficient stubs rejected, no tier granted", shop2.poor.ok === false && shop2.poor.reason === "insufficient stubs", JSON.stringify(shop2.poor));
ok("zero tiers -> identity mods", JSON.stringify(shop2.mods0) === JSON.stringify({ damageMul: 1, hpMul: 1, speedMul: 1, xpMul: 1 }), JSON.stringify(shop2.mods0));
ok("maxed track rejected", shop2.maxed.ok === false && shop2.maxed.reason === "maxed", JSON.stringify(shop2.maxed));
ok("getRunStatMods reflects tiers (dmg 2, hp 1, spd 3, xp 4)",
  Math.abs(shop2.mods.damageMul - 1.08) < 1e-9 && Math.abs(shop2.mods.hpMul - 1.1) < 1e-9 &&
  Math.abs(shop2.mods.speedMul - 1.09) < 1e-9 && Math.abs(shop2.mods.xpMul - 1.2) < 1e-9,
  JSON.stringify(shop2.mods));

console.log("== 6. persistence across reload ==");
await page.evaluate(async () => {
  const save = await import("/src/game/save.ts");
  save.writeSave({ stubs: 1750, shopTiers: { damage: 2, xp: 1 } });
});
// NOTE: no __controlsTest wait here — the engine lane is editing engine.ts
// concurrently, so game init is flaky. Module imports via Vite work regardless.
await page.reload({ waitUntil: "networkidle" });
const persisted = await page.evaluate(async () => {
  const meta = await import("/src/game/meta.ts");
  return { shop: meta.getStatShop(), mods: meta.getRunStatMods() };
});
ok("shopTiers survive reload", persisted.shop.tiers.damage === 2 && persisted.shop.tiers.xp === 1, JSON.stringify(persisted.shop.tiers));
ok("stubs survive reload", persisted.shop.stubs === 1750, JSON.stringify(persisted.shop.stubs));
ok("mods reflect persisted tiers after reload", Math.abs(persisted.mods.damageMul - 1.08) < 1e-9 && Math.abs(persisted.mods.xpMul - 1.05) < 1e-9, JSON.stringify(persisted.mods));

console.log("== 7. negative naming assertions (Pike County, Indiana only) ==");
const neg = await page.evaluate(async () => {
  const c = await import("/src/game/constants.ts");
  const b = await import("/src/game/boons.ts");
  const m = await import("/src/game/meta.ts");
  const blob = JSON.stringify([
    c.SPECIAL_WEAPON_DEFS,
    c.WEAPON_LEVELS.chainlightning,
    c.WEAPON_LEVELS.orbiter,
    b.BOON_CATALOG.filter((x) => x.id === "chainlightning" || x.id === "orbiter"),
    m.STAT_SHOP,
  ]);
  return { blob, bad: blob.match(/bayville|griggsville|illinois/gi) };
});
ok("no Bayville/Griggsville/Illinois in new data", neg.bad === null, JSON.stringify(neg.bad));

console.log("== 8. StatShopModal module loads ==");
const modal = await page.evaluate(async () => {
  const m = await import("/src/components/game/StatShopModal.tsx");
  return { exported: typeof m.StatShopModal === "function" };
});
ok("StatShopModal exports a component", modal.exported === true, JSON.stringify(modal));

console.log("== 9. StatShopModal renders and buys ==");
const modalUI = await page.evaluate(async () => {
  const React = (await import("/node_modules/.vite/deps/react.js")).default;
  const RD = (await import("/node_modules/.vite/deps/react-dom_client.js")).default;
  const m = await import("/src/components/game/StatShopModal.tsx");
  const save = await import("/src/game/save.ts");
  save.writeSave({ stubs: 600, shopTiers: { damage: 1 } });
  const div = document.createElement("div");
  document.body.appendChild(div);
  const root = RD.createRoot(div);
  root.render(React.createElement(m.StatShopModal, { open: true, onClose: () => {} }));
  await new Promise((r) => setTimeout(r, 600));
  const html = div.innerHTML;
  const btns = [...div.querySelectorAll("button")].filter((b) => !b.disabled && b.textContent.includes("Buy"));
  const firstBuy = btns[0] ? btns[0].textContent : null;
  if (btns[0]) btns[0].click(); // damage tier 2 costs 250
  await new Promise((r) => setTimeout(r, 600));
  const meta = await import("/src/game/meta.ts");
  const after = meta.getStatShop();
  const html2 = div.innerHTML;
  root.unmount(); div.remove();
  return {
    tracks: ["Hartwell Grit", "Highwall Hide", "Trace Stride", "Enos Ledger"].map((t) => html.includes(t)),
    title: html.includes("County Record Office"),
    firstBuy, after,
    pip: html2.includes("Tier 2/4"),
  };
});
ok("modal renders all 4 county-flavored tracks", modalUI.tracks.every(Boolean) && modalUI.title === true, JSON.stringify(modalUI.tracks));
ok("modal buy button deducts via buyStat (600->350, tier 1->2)",
  modalUI.firstBuy === "Buy · 250" && modalUI.after.stubs === 350 && modalUI.after.tiers.damage === 2 && modalUI.pip === true,
  JSON.stringify({ firstBuy: modalUI.firstBuy, stubs: modalUI.after.stubs, tiers: modalUI.after.tiers }));

console.log("== page errors ==");
// The engine lane is concurrently editing engine.ts (uncommitted), which
// throws its own init errors mid-edit. Only fail on errors pointing at
// THIS lane's modules; log everything else for the report.
const mine = errors.filter((e) => /StatShopModal|game\/(meta|save|constants|boons)/i.test(e));
const other = errors.filter((e) => !/StatShopModal|game\/(meta|save|constants|boons)/i.test(e));
if (other.length) console.log(`  (info) ${other.length} page error(s) from other lanes' WIP: ${other.slice(0, 2).join(" | ")}`);
ok("no page errors in lane-B modules", mine.length === 0, mine.slice(0, 3).join(" | "));

await browser.close();
console.log(`\nbatch7b: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
