import { chromium } from "playwright-core";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Lane 1 (ENGINE) — Batch 7: chain lightning, orbiter blades, phased Behemoth,
// Haint illusionist, telegraph emission, darkness-as-gameplay, run-stat mods.
const URL = process.env.PZ_URL || "http://127.0.0.1:8095";
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

console.log("== batch7a setup ==");
await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
const startBtn = page.getByText("Survival · this place");
await startBtn.waitFor({ timeout: 30000 });
// Vite dev can take a while to transform the engine on first load; retry the
// click until the engine (and its probe) is actually up.
for (let i = 0; i < 12 && !(await page.evaluate(() => !!window.__controlsTest)); i++) {
  await startBtn.click();
  await page.waitForTimeout(2500);
}
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 30000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("toBreak()");

console.log("== 0. b7 weapons registered ==");
const wids = await T("b7Weapons()");
ok("chainlightning + orbiter registered", wids.includes("chainlightning") && wids.includes("orbiter"), JSON.stringify(wids));

console.log("== 1. chain lightning: jumps + falloff ==");
const ch = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  c.settle();
  c.equipB7("chainlightning");
  const cfg = c.b7cfg().chain;
  const px = c.playerPos().x, py = c.playerPos().y;
  const idx = [];
  for (let k = 0; k < cfg.chainJumps + 1; k++) idx.push(c.spawnAt("shambler", px, py + 100 + k * 40));
  c.pinAll(); // huge HP: nobody dies mid-chain, damage is measurable
  c.fire();
  const hp = idx.map((i) => c.zHealth(i));
  return { info: c.chainInfo(), hp, cfg };
});
ok("chain hits jumps+1 distinct zombies", ch.info.hits === ch.cfg.chainJumps + 1 && ch.info.jumps === ch.cfg.chainJumps,
  JSON.stringify({ info: ch.info, jumps: ch.cfg.chainJumps }));
const dealt = ch.hp.map((h) => 1e6 - h);
const fo = ch.cfg.chainFalloff;
const r1 = dealt[1] / dealt[0], r2 = dealt[2] / dealt[1], r3 = dealt[3] / dealt[2];
ok("damage falls off per jump", Math.abs(r1 - fo) < 0.05 && Math.abs(r2 - fo) < 0.05 && Math.abs(r3 - fo) < 0.05,
  JSON.stringify({ fo, r1: +r1.toFixed(3), r2: +r2.toFixed(3), r3: +r3.toFixed(3) }));
ok("first hit deals config damage", Math.abs(dealt[0] - ch.cfg.damage) <= 2, JSON.stringify({ d0: dealt[0], cfg: ch.cfg.damage }));

console.log("== 2. orbiter blades: contact damage ==");
const ob = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  c.equipB7("orbiter");
  c.setOrbiterAngle(0);
  c.orbiterTick(3);
  const info0 = c.orbiterInfo();
  const ocfg = c.b7cfg().orbiter;
  const b = info0.blades[0];
  const i = c.spawnAt("shambler", b.x, b.y);
  const h0 = c.zHealth(i);
  c.orbiterTick(3);
  const h1 = c.zHealth(i);
  c.setWeapon(0);
  c.stepB7(2);
  const cleared = c.orbiterInfo().count;
  return { info0, h0, h1, cleared, ocfg };
});
ok("orbiter blades exist while equipped (count + radius match config)",
  ob.info0.count === ob.ocfg.orbiterCount && ob.info0.radius === ob.ocfg.orbiterRadius,
  JSON.stringify({ info: ob.info0, cfg: ob.ocfg }));
ok("blade contact damages the zombie", ob.h1 < ob.h0, JSON.stringify({ h0: ob.h0, h1: ob.h1 }));
ok("blades clear when the weapon is unequipped", ob.cleared === 0, JSON.stringify({ cleared: ob.cleared }));

console.log("== 3. behemoth phases: fight / charge / summon / enrage ==");
const bh = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  const px = c.playerPos().x, py = c.playerPos().y;
  const i = c.spawnAt("behemoth", px, py + 300);
  c.stepZombies(5);
  const p0 = c.behemothPhase();
  // charge: force the cooldown, then step into the 0.8s windup
  c.bossCharge();
  c.stepZombies(3);
  const pCharge = c.behemothPhase();
  const tgCharge = c.telegraphs();
  // summon: drop to 50% HP (below 0.6 summon threshold, above 0.3 enrage)
  const max = c.zMax(i);
  const z0 = c.zCount();
  c.hurtZombie(i, Math.round(max * 0.5));
  c.stepZombies(3);
  const z1 = c.zCount();
  const kinds = [];
  for (let k = 0; k < c.zCount(); k++) { const zi = c.zInfo(k); if (zi) kinds.push(zi.type); }
  c.stepZombies(300);
  const z2 = c.zCount();
  // enrage: drop to 25% HP (below the 0.3 enrage threshold)
  c.hurtZombie(i, Math.round(max * 0.25));
  c.stepZombies(5);
  const pEnrage = c.behemothPhase();
  const info = c.behemothInfo();
  return { p0, pCharge, tgCharge, z0, z1, z2, kinds: kinds.slice(-4), pEnrage, info };
});
ok("behemoth starts in fight phase", bh.p0 === "fight", JSON.stringify(bh.p0));
ok("behemoth enters charge windup", bh.pCharge === "charge", JSON.stringify({ pCharge: bh.pCharge }));
ok("charge windup pushes a telegraph", bh.tgCharge >= 1, JSON.stringify({ tg: bh.tgCharge }));
ok("summon spawns exactly 4 crawlers", bh.z1 === bh.z0 + 4 && bh.kinds.every((t) => t === "crawler"), JSON.stringify({ z0: bh.z0, z1: bh.z1, kinds: bh.kinds }));
ok("summon fires once (no more on later steps)", bh.z2 === bh.z1, JSON.stringify({ z1: bh.z1, z2: bh.z2 }));
ok("behemoth enrages below 30% HP", bh.pEnrage === "enrage" && bh.info && bh.info.enraged === true, JSON.stringify({ pEnrage: bh.pEnrage, info: bh.info }));

console.log("== 4. haint illusionist ==");
const ha = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  const px = c.playerPos().x, py = c.playerPos().y;
  const i = c.spawnAt("haint", px, py + 200);
  c.haintTick(); // cloneCd -> 0
  c.stepZombies(3);
  const n1 = c.haintClones();
  const clone = c.cloneInfo();
  c.stepZombies(300); // 5s more: cap must hold
  const n2 = c.haintClones();
  return { n1, n2, clone, parent: c.zInfo(i).t };
});
ok("haint spawns up to cloneCount clones", ha.n1 === 3, JSON.stringify({ n1: ha.n1 }));
ok("clones are 1 HP, harmless, identical type", !!ha.clone && ha.clone.hp === 1 && ha.clone.dmg === 0 && ha.clone.type === "haint", JSON.stringify(ha.clone));
ok("clone cap holds over time", ha.n2 === 3, JSON.stringify({ n2: ha.n2 }));

console.log("== 5. telegraphs: dasher windup + decay ==");
const tg = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  c.pinAll();
  const px = c.playerPos().x, py = c.playerPos().y;
  const i = c.spawnAt("sprinter", px, py + 200);
  c.facePlayer(i);
  let tele = 0, guard = 0;
  while (tele <= 0 && guard++ < 80) { c.stepZombies(10); tele = c.zDash(i).tele; }
  const n = c.telegraphs();
  const before = c.telegraphInfo().map((t) => t.t0);
  c.stepB7(120); // 2s: past the 0.9s leap duration (stepB7 runs no zombie AI, so no new telegraphs)
  const after = c.telegraphInfo().map((t) => t.t0);
  const survivors = before.filter((t) => after.includes(t)).length;
  return { n, survivors, guard };
});
ok("dasher windup pushes a leap telegraph", tg.n >= 1, JSON.stringify(tg));
ok("telegraphs decay after their duration", tg.survivors === 0, JSON.stringify(tg));

console.log("== 6. darkness as gameplay ==");
const dk = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  c.setDark(true);
  const px = c.playerPos().x, py = c.playerPos().y;
  // NB: spawn NORTH — the wood_fence barricades at y+900 block sight lines to the south.
  const far = c.spawnAt("shambler", px, py - 500);
  const near = c.spawnAt("shambler", px, py - 150);
  c.facePlayer(far); c.facePlayer(near);
  const seeFarDark = c.canSee(far);
  const seeNearDark = c.canSee(near);
  c.stepZombies(30);
  const aiFar = c.zAi(far);
  // NB: isLit points are offset from the zombie spots — the map lantern at the
  // springs lights a 420u disc of its own, so the far point goes SOUTH (clear
  // of both the player light and the lantern light).
  const litFar = c.isLitAt(px, py + 500);
  const litNear = c.isLitAt(px, py - 150);
  c.setDark(false);
  return { seeFarDark, seeNearDark, aiFar, litFar, litNear, dark: c.isDark() };
});
ok("dark: zombie beyond lightRadius cannot acquire the player", dk.seeFarDark === false, JSON.stringify(dk));
ok("dark: zombie inside lightRadius still acquires", dk.seeNearDark === true, JSON.stringify(dk));
ok("dark: blind zombie keeps wandering", dk.aiFar === "wander", JSON.stringify(dk));
ok("isLit matches the light radius", dk.litFar === false && dk.litNear === true, JSON.stringify({ litFar: dk.litFar, litNear: dk.litNear }));
ok("setDark toggles back off", dk.dark === false, JSON.stringify({ dark: dk.dark }));

console.log("== 7. run-stat mods (meta lane absent -> defaults) ==");
const rm = await page.evaluate(() => {
  const c = window.__controlsTest;
  return { mods: c.runMods(), plain: c.plainMul(), maxHp: c.php() };
});
ok("run mods default to 1 without the meta export",
  rm.mods.dmg === 1 && rm.mods.hp === 1 && rm.mods.spd === 1 && rm.mods.xp === 1, JSON.stringify(rm.mods));
ok("damage multiplier folds run mods", rm.plain === 1, JSON.stringify({ plain: rm.plain }));

console.log("== 7b. run-stat mods from the meta lane (County Record tiers) ==");
// Seed the save with shop tiers, reload into a fresh run, and verify the
// engine picks up the meta lane's getRunStatMods().
await page.evaluate(() => {
  localStorage.setItem("pcz_save_v2", JSON.stringify({ shopTiers: { damage: 5, hp: 2, speed: 4, xp: 3 } }));
});
await page.reload({ waitUntil: "networkidle", timeout: 60000 });
{
  const btn = page.getByText("Survival · this place");
  await btn.waitFor({ timeout: 30000 });
  for (let i = 0; i < 12 && !(await page.evaluate(() => !!window.__controlsTest)); i++) {
    await btn.click();
    await page.waitForTimeout(2500);
  }
  await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 30000 });
}
const rm2 = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.god(); c.skipBreak(); c.toBreak();
  return { mods: c.runMods(), plain: c.plainMul() };
});
// getRunStatMods: dmg 1+0.04/tier, hp 1+0.10/tier, spd 1+0.03/tier, xp 1+0.05/tier
ok("damage tier 5 -> 1.2x run mod", Math.abs(rm2.mods.dmg - 1.2) < 1e-9, JSON.stringify(rm2.mods));
ok("hp tier 2 -> 1.2x run mod", Math.abs(rm2.mods.hp - 1.2) < 1e-9, JSON.stringify(rm2.mods));
ok("speed tier 4 -> 1.12x run mod", Math.abs(rm2.mods.spd - 1.12) < 1e-9, JSON.stringify(rm2.mods));
ok("xp tier 3 -> 1.15x run mod", Math.abs(rm2.mods.xp - 1.15) < 1e-9, JSON.stringify(rm2.mods));
ok("damage multiplier folds the 1.2x run mod", Math.abs(rm2.plain - 1.2) < 1e-9, JSON.stringify({ plain: rm2.plain }));
// Idempotency: reapplying the run mods must not compound them.
const idem1 = await page.evaluate(() => window.__controlsTest.reapplyRunMods());
const idem2 = await page.evaluate(() => window.__controlsTest.reapplyRunMods());
ok("run mods do not compound across applications",
  JSON.stringify(idem1) === JSON.stringify(idem2) && Math.abs(idem1.mods.hp - 1.2) < 1e-9,
  JSON.stringify({ idem1, idem2 }));
// Clean up: clear the seeded save so later runs start from defaults.
await page.evaluate(() => { localStorage.removeItem("pcz_save_v2"); });

console.log("== 8. naming audit ==");
const walk = (dir) => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
};
let badHits = [];
for (const f of walk("src")) {
  const low = readFileSync(f, "utf8").toLowerCase();
  for (const bad of ["bayville", "griggsville", "illinois"]) {
    if (low.includes(bad)) badHits.push(`${f}: ${bad}`);
  }
}
ok("no bayville/griggsville/illinois strings in src", badHits.length === 0, badHits.slice(0, 5).join("; "));

console.log(`\nbatch7a: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
if (errors.length) console.log("page errors:", errors.slice(0, 5));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
