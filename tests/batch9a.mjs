// Batch 9 — Lane 1 (engine) tests.
// (a) Pure sections run in plain node via jiti (TS sources imported directly,
//     localStorage shimmed).
//   node_modules/.bin/jiti tests/batch9a.mjs
// (b) Live section runs under Playwright against a dev server.
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch9a.mjs

// ---- localStorage shim (meta.ts only touches it inside fns) ----
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.sessionStorage = globalThis.localStorage;

import { supportApplies, boonTagsOf, weaponTagsOf } from "../src/game/boons.ts";
import { CHARACTERS, STAGES } from "../src/game/roster.ts";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

console.log("== 9a(a). affinity truth table (supportApplies) ==");
const linkCases = [
  // [boon, weapon, expected] — tagged boons link only on a shared tag.
  ["lead", "revolver", true],     // precise ∩ precise
  ["lead", "crossbow", true],     // precise ∩ precise
  ["lead", "lever_rifle", true],  // precise ∩ precise
  ["lead", "shotgun", false],     // precise vs scatter/tube-fed
  ["lead", "chainsaw", false],    // precise vs heavy
  ["trigger", "revolver", true],  // sidearm ∩ sidearm
  ["trigger", "carbine", true],   // rapid ∩ rapid
  ["trigger", "shotgun", false],
  ["trigger", "crossbow", false],
  ["shells", "shotgun", true],    // tube-fed ∩ tube-fed
  ["shells", "lever_rifle", true],// tube-fed ∩ tube-fed
  ["shells", "revolver", false],
  ["fork", "shotgun", true],      // scatter ∩ scatter
  ["fork", "revolver", false],
  ["ricochet", "revolver", true], // precise ∩ precise
  ["ricochet", "shotgun", false],
  ["seeker", "carbine", true],    // precise ∩ precise
  ["seeker", "chainsaw", false],
  // Untagged boons are universal (not tag-gated).
  ["hide", "chainsaw", true],
  ["jug", "revolver", true],
  ["aura", "shotgun", true],
  // Unknown boon ids carry no tags -> universal fallback.
  ["nope", "revolver", true],
];
for (const [b, w, want] of linkCases) {
  eq(supportApplies(b, w), want, `affLink(${b}, ${w})`);
}
eq(boonTagsOf("lead").join(","), "precise", "lead tags");
eq(weaponTagsOf("shotgun").join(","), "scatter,tube-fed", "shotgun tags");

console.log("== 9a(b). Indiana flavor only ==");
// New strings must be Pike County, Indiana only — never Bayville/Griggsville/Illinois.
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
  const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);

  async function startRun(charId, stageId) {
    await page.goto(PZ_URL, { waitUntil: "networkidle" });
    await page.evaluate(([c, s]) => {
      localStorage.setItem("pz_character_v1", c);
      localStorage.setItem("pz_stage_v1", s);
    }, [charId, stageId]);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("Survival · this place").click();
    await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
  }

  // ---- Run 1: Thea + Stendal (roster, affinity, surge, stealth, drift, kill surge) ----
  await startRun("thea_kettler", "stendal_backbone");

  console.log("-- 9a(1). score-multiplier drop schedule (25s, then 25-40s) --");
  const sched = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.setSim(0);
    const s0 = c.scoreMulSched();
    c.setSim(24); c.tickScoreMul();
    const s24 = c.scoreMulSched();
    c.setSim(25); c.tickScoreMul();
    const s25 = c.scoreMulSched();
    c.setSim(s25.nextAt + 0.01); c.tickScoreMul(); // float-safe: probe rounds nextAt to 2dp
    const s2 = c.scoreMulSched();
    return { s0, s24, s25, s2 };
  });
  eq(sched.s0.nextAt, 25, "first score-multiplier drop scheduled at 25s");
  eq(sched.s24.drops, 0, "no drop before 25s");
  ok(sched.s25.drops >= 1, `drop lands at 25s (drops=${sched.s25.drops})`);
  ok(sched.s25.nextAt >= 50 && sched.s25.nextAt <= 65, `second drop 25-40s out (nextAt=${sched.s25.nextAt})`);
  const gap = sched.s2.nextAt - sched.s25.nextAt;
  ok(sched.s2.drops >= sched.s25.drops + 1 && gap >= 25 && gap <= 40.5,
    `third drop 25-40s after second (gap=${gap.toFixed(1)}s)`);

  console.log("-- 9a(2). roster9: character passive + stage rules --");
  const r9 = await T("roster9()");
  eq(r9.char, "thea_kettler", "roster9 char");
  eq(r9.stage, "stendal_backbone", "roster9 stage");
  eq(r9.maxHp, 125, "Thea +25 max HP (100 base)");
  eq(r9.dmgMul, 1, "Thea has no damage mul");
  eq(r9.hsMul, 1, "Thea has no headshot mul");
  eq(r9.fireMul, 1, "Thea has no fire-rate mul");
  eq(r9.gritMul, 1.25, "Stendal gritMult 1.25");
  eq(r9.zSpdMul, 1.06, "Stendal zombieSpeedMult 1.06");
  eq(r9.night, 1, "Stendal has no night mult");
  eq(r9.eliteMul, 1, "Stendal has no elite-cadence mult");

  console.log("-- 9a(3). affLink probe + damage-path wiring --");
  const aff = await page.evaluate(() => {
    const c = window.__controlsTest;
    return {
      a: c.affLink("lead", "revolver"),
      b: c.affLink("lead", "shotgun"),
      c: c.affLink("trigger", "carbine"),
      d: c.affLink("fork", "revolver"),
      e: c.affLink("hide", "chainsaw"),
    };
  });
  eq(aff.a, true, "engine affLink(lead, revolver)");
  eq(aff.b, false, "engine affLink(lead, shotgun)");
  eq(aff.c, true, "engine affLink(trigger, carbine)");
  eq(aff.d, false, "engine affLink(fork, revolver)");
  eq(aff.e, true, "engine affLink(hide, chainsaw) — untagged universal");
  const ratio = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.giveBoon("lead", 1);
    const r = c.famMul("revolver") / c.famMul("shotgun");
    c.giveBoon("lead", -1);
    return r;
  });
  ok(Math.abs(ratio - 1.08) < 1e-9, `lead damage links to revolver only (ratio=${ratio})`);
  // Affinity gating at the projectile sites: fork fires on shotgun [scatter]
  // but not on revolver, even though the boon is held. Slow probe bullets
  // (fast ones jump stendal's trees: the obstacle check runs before the
  // zombie check) + deterministic stepBullets so the short-lived children
  // are counted before they expire.
  const forkGate = await page.evaluate(() => {
    const c = window.__controlsTest;
    const px = c.playerPos().x, py = c.playerPos().y;
    c.toBreak();
    c.giveBoon("fork", 2);
    const trial = (wt) => {
      c.toBreak();
      const zi = c.spawnAt("miner_brute", px + 90, py);
      const max = c.zMax(zi);
      c.rehash();
      c.clearBullets();
      c.spawnBulletAt(px, py, 60, 0, 40, wt);
      c.stepBullets(3); // impact lands; children (if any) are alive this tick
      const hit = c.zHealth(zi) < max;
      const kids = c.bulletCount();
      return { hit, kids };
    };
    const rev = trial("revolver");
    const sg = trial("shotgun");
    c.giveBoon("fork", -2);
    return { rev, sg };
  });
  ok(forkGate.rev.hit, "revolver trial struck the target");
  ok(forkGate.sg.hit, "shotgun trial struck the target");
  eq(forkGate.rev.kids, 0, "fork does not fire on unlinked revolver rounds");
  ok(forkGate.sg.kids >= 1, `fork fires on linked shotgun rounds (children=${forkGate.sg.kids})`);

  console.log("-- 9a(4). scoreMulState lifecycle (ms timeLeft) --");
  const surge = await page.evaluate(() => {
    const c = window.__controlsTest;
    const s0 = c.scoreMulState();
    c.giveSurge();
    const s1 = c.scoreMulState();
    c.stepPowerups(450); // 7.5s
    const s2 = c.scoreMulState();
    c.stepPowerups(460); // +7.67s -> expired
    const s3 = c.scoreMulState();
    return { s0, s1, s2, s3 };
  });
  eq(surge.s0.active, false, "surge inactive at rest");
  eq(surge.s0.timeLeft, 0, "surge timeLeft 0 at rest");
  eq(surge.s0.mult, 2, "surge mult 2");
  eq(surge.s1.active, true, "giveSurge activates");
  ok(surge.s1.timeLeft > 14000 && surge.s1.timeLeft <= 15000, `timeLeft in ms (~15000, got ${surge.s1.timeLeft})`);
  eq(surge.s2.active, true, "still active after 7.5s");
  ok(surge.s2.timeLeft > 6000 && surge.s2.timeLeft < 8000, `timeLeft decayed (~7500, got ${surge.s2.timeLeft})`);
  eq(surge.s3.active, false, "expired after 15s+");
  eq(surge.s3.timeLeft, 0, "timeLeft 0 after expiry");
  // Pickup path: a dropped score_surge at the player's feet is picked up.
  const pickup = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.dropSurge();
    return c.scoreMulState();
  });
  eq(pickup.active, true, "dropped score_surge picked up");
  ok(pickup.timeLeft > 14000 && pickup.timeLeft <= 15000, `picked-up surge timeLeft in ms (${pickup.timeLeft})`);

  console.log("-- 9a(5). stealth: sneak detection -> spotted -> chase --");
  const sneak = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak();
    c.setSneak(true);
    const px = c.playerPos().x, py = c.playerPos().y;
    const spots = [[120,0],[0,120],[-120,0],[0,-120],[90,90],[-90,90],[90,-90],[-90,-90]];
    let i = -1, seen = false;
    for (const [dx, dy] of spots) {
      if (i >= 0) c.killAt(i);
      i = c.spawnAt("shambler", px + dx, py + dy);
      c.facePlayer(i);
      if (c.canSee(i)) { seen = true; break; }
    }
    c.stepZombies(5);
    const ai1 = c.zAi(i);
    const dist = (j) => Math.hypot(c.zPos(j).x - px, c.zPos(j).y - py);
    const d1 = dist(i);
    c.stepZombies(100); // ~1.67s: past the 1.6s spotted grace, barely into the chase
    const ai2 = c.zAi(i);
    const d2 = dist(i);
    c.setSneak(false);
    return { seen, ai1, ai2, d1: Math.round(d1), d2: Math.round(d2) };
  });
  ok(sneak.seen, "sneak test had clear line of sight");
  eq(sneak.ai1, "spotted", "sneaking player spots (not instantly aggroes) the zombie");
  eq(sneak.ai2, "chase", `spotted grace expires into the chase (got "${sneak.ai2}")`);
  ok(sneak.d2 > sneak.d1 - 25, `zombie holds position during spotted grace (d ${sneak.d1} -> ${sneak.d2})`);

  console.log("-- 9a(6). stealth: quiet zombies settle into idle --");
  const idle = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak();
    const px = c.playerPos().x, py = c.playerPos().y;
    const i = c.spawnAt("shambler", px + 600, py);
    c.stepZombies(30);
    const aiEarly = c.zAi(i);
    c.stepZombies(400); // 6.67s of no stimulus
    return { aiEarly, aiLate: c.zAi(i) };
  });
  ok(idle.aiEarly === "wander" || idle.aiEarly === "idle", `no stimulus at 600px (ai=${idle.aiEarly})`);
  eq(idle.aiLate, "idle", "long-quiet wanderer settles into idle");

  console.log("-- 9a(7). off-screen objective drift (deterministic) --");
  const drift = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak();
    const px = c.playerPos().x, py = c.playerPos().y;
    const w = c.getWorld();
    const obs = c.objectives9();
    let sx = 0, sy = 0, exp = null;
    const cand = [[260,0],[0,260],[-260,0],[0,-260],[200,200],[-200,200],[-200,-200],[200,-200]];
    outer:
    for (const o of obs) {
      if (o.kind !== "hole") continue;
      for (const [dx, dy] of cand) {
        const x = Math.min(Math.max(o.x + dx, 60), w.map.w - 60);
        const y = Math.min(Math.max(o.y + dy, 60), w.map.h - 60);
        if (Math.hypot(x - px, y - py) < 420) continue;
        let best = null, bestD = 1e18, second = 1e18;
        for (const q of obs) {
          const d = (q.x - x) ** 2 + (q.y - y) ** 2;
          if (d < bestD) { second = bestD; bestD = d; best = q; }
          else if (d < second) second = d;
        }
        if (Math.sqrt(second) - Math.sqrt(bestD) > 12) { sx = x; sy = y; exp = best; break outer; }
      }
    }
    if (!exp) return { skipped: true };
    const i = c.spawnAt("shambler", sx, sy);
    const aiEarly = c.zAi(i);
    c.stepZombies(80); // > 1.2s drift eval
    const ds = c.driftState(i);
    return { aiEarly, kind: ds.kind, dx: ds.dx, dy: ds.dy, expKind: exp.kind, expX: exp.x, expY: exp.y };
  });
  ok(!drift.skipped, "drift test found a valid spawn");
  eq(drift.aiEarly, "wander", "drifter starts unstimulated");
  eq(drift.kind, drift.expKind, `drift target kind matches nearest objective (${drift.kind})`);
  eq(drift.dx, drift.expX, "drift target x matches nearest objective");
  eq(drift.dy, drift.expY, "drift target y matches nearest objective");

  console.log("-- 9a(8). objective fallback: empty map -> map center --");
  const center = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak();
    const st = c.stashObjectives9();
    const w = c.getWorld();
    const px = c.playerPos().x, py = c.playerPos().y;
    const i = c.spawnAt("shambler", px + 400, py);
    c.stepZombies(80);
    const ds = c.driftState(i);
    const un = c.unstashObjectives9();
    return { st, kind: ds.kind, dx: ds.dx, dy: ds.dy, cx: Math.round(w.map.w / 2), cy: Math.round(w.map.h / 2), un };
  });
  ok(center.st.holes > 0 && center.st.shrines > 0, `stash cleared objectives (${JSON.stringify(center.st)})`);
  eq(center.kind, "center", "empty map falls back to map center");
  eq(center.dx, center.cx, "center fallback x = map center");
  eq(center.dy, center.cy, "center fallback y = map center");
  ok(center.un.holes > 0 && center.un.shrines > 0, "objectives restored");

  console.log("-- 9a(9). kill surge --");
  const ks = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak();
    const k0 = c.killSurge();
    const px = c.playerPos().x, py = c.playerPos().y;
    c.spawnAt("shambler", px + 100, py);
    c.killAt(0);
    const k1 = c.killSurge();
    const d1 = c.decaySurge(1);
    const d2 = c.decaySurge(10);
    return { k0, k1, d1, d2 };
  });
  eq(ks.k0, 0, "kill surge starts at 0");
  ok(ks.k1 > 0, `kill raises surge (${ks.k1})`);
  ok(ks.d1 < ks.k1 && ks.d1 >= 0, `surge decays (${ks.k1} -> ${ks.d1})`);
  eq(ks.d2, 0, "surge decays to 0");

  // ---- Runs 2-6: one stage each (Otis, neutral passives) ----
  const stageCases = [
    ["white_oak_springs", (r) => {
      eq(r.night, 1.3, "White Oak nightLengthMult 1.3");
      // treeDensityMult multiplies tree-type obstacles only (treesBase counts all obstacles).
      eq(r.trees, (r.treesBase - r.treeBase) + Math.round(r.treeBase * 1.5),
        `White Oak trees x1.5 (${r.treeBase} trees of ${r.treesBase} obstacles -> ${r.trees})`);
    }],
    ["mccords_ford", (r) => {
      eq(r.holes, Math.round(r.holesBase * 1.6), `McCord holes x1.6 (${r.holesBase} -> ${r.holes})`);
    }],
    ["petersburg_square", (r) => {
      eq(r.packMul, 1.3, "Petersburg spawnPackMult 1.3");
    }],
    ["winslow_still", (r) => {
      eq(r.barrels, Math.round(r.barrelsBase * 2), `Winslow barrels x2 (${r.barrelsBase} -> ${r.barrels})`);
    }],
    ["honey_springs", (r) => {
      eq(r.eliteMul, 0.7, "Honey Springs eliteIntervalMult 0.7");
    }],
  ];
  for (const [stageId, check] of stageCases) {
    console.log(`-- 9a(10). stage rules: ${stageId} --`);
    await startRun("otis_hale", stageId);
    const r = await T("roster9()");
    eq(r.stage, stageId, "stage applied");
    check(r);
  }

  // ---- Runs 7-9: one character each (Honey Springs, no char-relevant stage rules) ----
  const charCases = [
    ["otis_hale", (r) => eq(r.fireMul, 1.12, "Otis fireRateMul 1.12")],
    ["eula_stillwell", (r) => eq(r.hsMul, 1.25, "Eula headshotMul 1.25")],
    ["silas_mccord", (r) => eq(r.dmgMul, 1.1, "Silas damageMul 1.1")],
  ];
  for (const [charId, check] of charCases) {
    console.log(`-- 9a(11). character passives: ${charId} --`);
    await startRun(charId, "honey_springs");
    const r = await T("roster9()");
    eq(r.char, charId, "character applied");
    check(r);
    eq(r.maxHp, charId === "thea_kettler" ? 125 : 100, "maxHp only Thea changes");
  }

  // ---- 9a(12). run-mod reapplication is idempotent (no multiply-accumulate) ----
  // Silas (damageMul) exercises the multiply path; Thea (maxHpAdd) the HP slice path.
  for (const charId of ["silas_mccord", "thea_kettler"]) {
    console.log(`-- 9a(12). reapply idempotence: ${charId} --`);
    await startRun(charId, "honey_springs");
    const m1 = await T("reapplyRunMods()");
    const m2 = await T("reapplyRunMods()");
    eq(m2.mods.dmg, m1.mods.dmg, "damage mul stable across reapply");
    eq(m2.hp, m1.hp, "max HP stable across reapply");
    eq(m2.spd, m1.spd, "speed stable across reapply");
    if (charId === "silas_mccord") eq(m1.mods.dmg, 1.1, "Silas damageMul composed once");
    if (charId === "thea_kettler") eq(m1.hp, 125, "Thea maxHpAdd applied once");
  }

  // Each page.reload() emits one pre-existing React hydration warning (verified on a
  // fresh load: 0 errors without reload, exactly 1 per reload; unrelated to engine
  // changes, which touch no React components). Only non-hydration errors fail.
  const real = errors.filter((e) => !String(e).includes("Hydration failed"));
  ok(real.length === 0, `no non-hydration page errors (${real.length})`);
  if (real.length) console.error(real.slice(0, 5));

  await browser.close();
}

console.log(`\nbatch9a: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
