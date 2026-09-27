import { chromium } from "playwright-core";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Lane A (ENGINE) — Batch 8: acceleration/friction player movement, AI LOD
// scheduling, separation + arrive steering.
const URL = process.env.PZ_URL || "http://127.0.0.1:8082";
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

console.log("== batch8a setup ==");
await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
const startBtn = page.getByText("Survival · this place");
await startBtn.waitFor({ timeout: 30000 });
for (let i = 0; i < 12 && !(await page.evaluate(() => !!window.__controlsTest)); i++) {
  await startBtn.click();
  await page.waitForTimeout(2500);
}
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 30000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("toBreak()");
await T("settle()");

console.log("== 1. acceleration: velocity ramps, not instant ==");
const acc = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.settle(); c.setKeys([]);
  c.stepPlayer(30); // bleed off any residual velocity
  c.setKeys(["KeyD"]);
  c.stepPlayer(1);
  const v1 = c.pvel().sp; // ~1800 u/s^2 -> 0.5/tick in moveVX units
  c.stepPlayer(5);
  const v6 = c.pvel().sp; // ~3.0 after 6 ticks
  c.stepPlayer(60);
  const vTop = c.pvel().sp; // target walk speed
  c.setKeys([]);
  return { v1, v6, vTop };
});
// Linear-ramp signature (gait-independent ratios): v6/v1 ~ 6, vTop/v1 ~ 12.
// An exponential snap would give ~3x / ~3.5x instead.
ok("first tick matches the 1800 u/s^2 accel step (~0.5)", Math.abs(acc.v1 - 0.5) < 0.06, JSON.stringify(acc));
ok("velocity ramps linearly over frames", acc.v6 > acc.v1 * 4, JSON.stringify(acc));
ok("keeps ramping toward top speed", acc.vTop > acc.v1 * 8, JSON.stringify(acc));

console.log("== 2. friction: velocity decays with no input ==");
const fri = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.setKeys(["KeyD"]);
  c.stepPlayer(60);
  const v0 = c.pvel().sp;
  c.setKeys([]);
  c.stepPlayer(5);
  const v5 = c.pvel().sp;
  c.stepPlayer(60);
  const vEnd = c.pvel().sp;
  return { v0, v5, vEnd };
});
ok("no input: velocity decays", fri.v5 < fri.v0 * 0.75, JSON.stringify(fri));
ok("friction brings the survivor to a stop", fri.vEnd < 0.1, JSON.stringify(fri));

console.log("== 3. dodge-roll still impulses, then friction takes over ==");
const roll = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.settle();
  c.setKeys(["KeyD"]);
  c.stepPlayer(10);
  const okRoll = c.dodge();
  const during = c.stepPlayer(1);
  const vRoll = c.pvel().sp;
  c.setKeys([]);
  c.stepPlayer(40);
  const vAfter = c.pvel().sp;
  const st = c.dodgeState();
  return { okRoll, vRoll, vAfter, stam: st.stam };
});
ok("dodge triggers", roll.okRoll === true, JSON.stringify(roll));
ok("roll sets impulse velocity (~9.6)", Math.abs(roll.vRoll - 9.6) < 0.4, JSON.stringify(roll));
ok("friction takes over after the roll", roll.vAfter < 1.0, JSON.stringify(roll));
ok("roll costs stamina", roll.stam < 100, JSON.stringify(roll));

console.log("== 4. sprint multiplier + stamina drain preserved ==");
const spr = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.settle();
  c.setKeys(["KeyD"]);
  c.stepPlayer(60);
  const vWalk = c.pvel().sp;
  const s0 = c.dodgeState().stam;
  c.setKeys(["KeyD", "ShiftLeft"]);
  c.stepPlayer(60);
  const vSprint = c.pvel().sp;
  const s1 = c.dodgeState().stam;
  c.setKeys([]);
  c.stepPlayer(30);
  return { vWalk, vSprint, s0, s1 };
});
ok("sprint reaches ~1.55x walk speed", spr.vSprint > spr.vWalk * 1.4, JSON.stringify(spr));
ok("sprinting drains stamina", spr.s1 < spr.s0, JSON.stringify(spr));

console.log("== 5. AI LOD: near thinks every tick, far thinks staggered 1/3 ==");
const lod = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.settle();
  const p = c.playerPos();
  const near = c.spawnAt("shambler", p.x + 100, p.y);
  const farIdx = [];
  for (let k = 0; k < 8; k++) farIdx.push(c.spawnAt("shambler", p.x + 1200 + k * 5, p.y + k * 7));
  let nearThink = 0;
  const farThink = farIdx.map(() => 0);
  let staggerSeen = false;
  for (let t = 0; t < 6; t++) {
    c.stepZombies(1);
    if (c.zLod(near).think) nearThink++;
    let thisTick = 0;
    for (let k = 0; k < farIdx.length; k++) if (c.zLod(farIdx[k]).think) { farThink[k]++; thisTick++; }
    if (thisTick > 0 && thisTick < farIdx.length) staggerSeen = true;
  }
  const offs = new Set(farIdx.map((i) => c.zLod(i).off));
  return { nearThink, farThink, staggerSeen, offs: [...offs], count: c.zCount() };
});
ok("at least our 9 zombies survived the LOD ticks", lod.count >= 9, JSON.stringify({ count: lod.count }));
ok("near zombie thinks every tick (6/6)", lod.nearThink === 6, JSON.stringify({ nearThink: lod.nearThink }));
ok("each far zombie thinks 2 of 6 ticks", lod.farThink.every((x) => x === 2), JSON.stringify(lod.farThink));
ok("far zombies are staggered across ticks", lod.staggerSeen && lod.offs.length >= 2, JSON.stringify({ stagger: lod.staggerSeen, offs: lod.offs }));

console.log("== 6. separation: overlapping zombies push apart ==");
const sep = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.settle();
  const p = c.playerPos();
  const a = c.spawnAt("shambler", p.x + 300, p.y);
  const b = c.spawnAt("shambler", p.x + 308, p.y);
  c.rehash(); // stepZombies alone does not rebuild the spatial hash
  const d0 = Math.hypot(c.zPos(a).x - c.zPos(b).x, c.zPos(a).y - c.zPos(b).y);
  c.stepZombies(1);
  const va = c.zVel(a), vb = c.zVel(b);
  c.stepZombies(30);
  const d1 = Math.hypot(c.zPos(a).x - c.zPos(b).x, c.zPos(a).y - c.zPos(b).y);
  return { d0, d1, va, vb };
});
ok("overlapping pair separates over ticks", sep.d1 > sep.d0 + 5, JSON.stringify({ d0: sep.d0, d1: +sep.d1.toFixed(1) }));
// The higher index is processed first each tick (loop runs downward), so the
// second-spawned zombie feels the pristine 8u overlap before its partner moves.
ok("separation force shows on the velocity channel", sep.vb.vx > 0.05 && sep.vb.vx < 1.0, JSON.stringify({ va: sep.va, vb: sep.vb }));

console.log("== 7. arrive: approach speed damps near the target ==");
const arr = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.settle();
  const p = c.playerPos();
  // The player walked during the movement tests, so find a clear ray first:
  // a compass direction with line of sight at 150u. The near zombie then uses
  // the same ray at 55u (a subset of the clear path).
  let ray = null;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [dx, dy] of dirs) {
    const m = Math.hypot(dx, dy);
    const i = c.spawnAt("shambler", p.x + dx / m * 150, p.y + dy / m * 150);
    c.facePlayer(i);
    if (c.canSee(i)) { ray = [dx / m, dy / m]; }
    c.killAt(i);
    if (ray) break;
  }
  if (!ray) return { ray: null };
  const fi = c.spawnAt("shambler", p.x + ray[0] * 150, p.y + ray[1] * 150);
  c.facePlayer(fi); c.rehash();
  c.stepZombies(5);
  const farSpd = c.zSpd(fi), farAi = c.zAi(fi), farDist = c.zDist(fi);
  const ni = c.spawnAt("shambler", p.x + ray[0] * 55, p.y + ray[1] * 55);
  c.facePlayer(ni); c.rehash();
  c.stepZombies(5);
  const nearSpd = c.zSpd(ni), nearAi = c.zAi(ni), nearDist = c.zDist(ni);
  return { ray: true, farSpd, farAi, farDist, nearSpd, nearAi, nearDist };
});
ok("found a clear line-of-sight ray", !!arr.ray, JSON.stringify({ ray: arr.ray }));
ok("far zombie chases at full speed", arr.farAi === "chase" && arr.farSpd > 1.5, JSON.stringify(arr));
ok("near zombie still chases", arr.nearAi === "chase", JSON.stringify(arr));
ok("arrive damps speed within 60u of target", arr.nearSpd < arr.farSpd * 0.65 && arr.nearSpd > 0.05, JSON.stringify(arr));

console.log("== 8. Group 1 ghost personalities preserved ==");
const per = await page.evaluate(() => {
  const c = window.__controlsTest;
  const px = c.playerPos().x, py = c.playerPos().y;
  const lead = c.ghostLead("sprinter", 4, 0);
  const still = c.ghostLead("sprinter", 0, 0);
  const flank = c.ghostLead("crawler", 4, 0);
  return { px, py, lead, still, flank };
});
ok("sprinter leads the player's velocity", per.lead.tx > per.px + 80 && per.lead.tx < per.px + 120 && Math.abs(per.lead.ty - per.py) < 1, JSON.stringify(per.lead));
ok("sprinter has no lead when the player is still", Math.abs(per.still.tx - per.px) < 1, JSON.stringify(per.still));
ok("crawler holds a lateral flank offset", Math.abs(per.flank.ty - per.py) > 60, JSON.stringify(per.flank));

console.log("== 9. Batch 6 kit preserved: spitter bands + bomber fuse ==");
const b6 = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.settle();
  const spec = c.b6spec();
  const backoff = c.ghostKite(200).band;
  const hold = c.ghostKite(340).band;
  const advance = c.ghostKite(500).band;
  const p = c.playerPos();
  const bi = c.spawnAt("bomber", p.x + 60, p.y);
  c.facePlayer(bi);
  c.stepZombies(30);
  const fuse = c.fuseState();
  const chew = c.chewState(bi);
  return { spec, backoff, hold, advance, fuse, chew, zc: c.zCount() };
});
ok("spitter keep-distance bands intact", b6.backoff === "backoff" && b6.hold === "hold" && b6.advance === "advance",
  JSON.stringify({ backoff: b6.backoff, hold: b6.hold, advance: b6.advance }));
ok("bomber fuse lights and burns down on schedule",
  b6.fuse && b6.fuse.alive && b6.fuse.fuseT > 0 && b6.fuse.fuseT <= b6.spec.fuseTime, JSON.stringify({ fuse: b6.fuse, t: b6.spec.fuseTime }));
ok("chew state path still runs", !!b6.chew && typeof b6.chew.ai === "string", JSON.stringify(b6.chew));

console.log("== 10. naming audit ==");
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
// The one allowed hit is the ban comment itself (documents the naming guard).
const banRe = /never bayville\/griggsville\/illinois/i;
for (const f of walk("src")) {
  const lines = readFileSync(f, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    if (banRe.test(lines[i])) continue;
    for (const bad of ["bayville", "griggsville", "illinois"]) {
      if (low.includes(bad)) badHits.push(`${f}:${i + 1}: ${bad}`);
    }
  }
}
ok("no bayville/griggsville/illinois strings in src", badHits.length === 0, badHits.slice(0, 5).join("; "));

console.log(`\nbatch8a: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
if (errors.length) console.log("page errors:", errors.slice(0, 5));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
