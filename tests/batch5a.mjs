import { chromium } from "playwright-core";

// Lane A (engine/combat-juice) — Batch 5: kill-word floaters, blood spray +
// ground splats, shockwave rings + slash bursts + screen flash, on-shoot
// micro-layer, whiff on missed bash, enemy body reactions, score_surge
// powerup, riot_shield archetype.
const URL = process.env.PZ_URL || "http://127.0.0.1:8091";
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

console.log("== batch5a setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("toBreak()");

const WORDS = ["SLAIN!", "DOWN!", "SPLAT!", "CRUNCH!"];

console.log("== 1. kill-word floaters ==");
const kw = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  const before = c.killWordState().count;
  c.killOne("shambler");
  const st = c.killWordState();
  return { before, st };
});
ok("kill spawns a kill-word floater", WORDS.includes(kw.st.last.word), JSON.stringify(kw.st.last));
ok("kill-word styled gold or red", kw.st.last.color === "#ffd700" || kw.st.last.color === "#e11d2e", JSON.stringify({ color: kw.st.last.color }));
ok("kill-word counter increments", kw.st.count === kw.before + 1, JSON.stringify({ before: kw.before, after: kw.st.count }));

console.log("== 2. blood spray + ground splats ==");
const sp = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  c.killOne("shambler");
  const stepped = c.stepParticles(40); // spray lives .45-.75s; 40 frames expires it all
  return stepped;
});
ok("blood spray particles leave ground splats", sp.splats >= 1, JSON.stringify(sp));
ok("splat count respects the ~30 cap", sp.splats <= 30, JSON.stringify(sp));

console.log("== 3. shockwave rings + screen flash ==");
const ring = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  c.killOne("shambler"); // shambler radius 17 -> ring maxR = 17 * 4.2 = 71.4
  return { ring: c.ringState(), flash: c.flashState() };
});
ok("kill pushes an expanding white ring", ring.ring.rings >= 1, JSON.stringify(ring.ring));
ok("ring radius ~4.2x zombie radius", ring.ring.lastMaxR === 71.4, JSON.stringify(ring.ring));
ok("kill triggers a screen-space flash", ring.flash.count >= 1, JSON.stringify(ring.flash));

console.log("== 4. on-shoot micro-layer ==");
const mz = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.clearBullets();
  return c.fireAndRead(); // fire + read in one tick: no rAF decay between
});
ok("additive muzzle flash ~50ms", mz.punch === 0.05, JSON.stringify(mz));
ok("gun kickback 4-6px", mz.kick >= 4 && mz.kick <= 6, JSON.stringify(mz));
ok("camera punch armed for 60ms", mz.camT === 0.06, JSON.stringify(mz));

console.log("== 5. slash bursts on bullet hits ==");
const sl = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.clearBullets();
  const px = c.playerPos().x, py = c.playerPos().y;
  const zi = c.spawnAt("shambler", px + 100, py);
  c.rehash();
  c.spawnBulletAt(px + 80, py, 400, 0, 50); // 50 dmg < 58 hp: hits, doesn't kill
  c.stepBullets(10);
  return { slashes: c.slashState(), alive: c.zCount() };
});
ok("bullet hit spawns an oriented slash burst", sl.slashes.count >= 1, JSON.stringify(sl.slashes));

console.log("== 6. whiff on missed bash ==");
const wh = await page.evaluate(() => {
  const c = window.__controlsTest;
  return c.whiffNow(); // no zombies: guaranteed miss
});
ok("whiffed bash still registers", wh.ok === true, JSON.stringify(wh));
ok("whiff applies tiny 0.12x micro-slow", wh.slowT === 0.12, JSON.stringify({ slowT: wh.slowT }));
ok("whiff records the swing arc position", !!wh.last && typeof wh.last.x === "number", JSON.stringify(wh.last));
ok("whiff spawns a faint slash burst", wh.slashes >= 1, JSON.stringify({ slashes: wh.slashes }));

console.log("== 7. enemy body reactions ==");
const br = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  const zi = c.spawnAt("shambler", c.playerPos().x + 100, c.playerPos().y);
  const light = c.bodyReact(zi, 50);
  const heavy = c.bodyReact(zi, 100);
  return { light, heavy };
});
ok("hit pops the body upward", br.light.yOff === 6.5, JSON.stringify(br.light));
ok("hit triggers 80ms squash-and-stretch", br.light.squashT === 0.08, JSON.stringify(br.light));
ok("light hit does not spin", br.light.spinT === 0, JSON.stringify(br.light));
ok("heavy hit (80+) adds hit spin", br.heavy.spinT === 0.25, JSON.stringify(br.heavy));

console.log("== 8. score_surge powerup ==");
const su = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  const pool = c.powerupPool();
  const plain = c.addScoreProbe(100);          // no surge yet
  const picked = c.dropSurge();                // drop a surge at the player, pick it up
  const st = c.surgeState();
  const doubled = c.addScoreProbe(100);        // surge active
  return { pool, plain, picked, st, doubled };
});
ok("score_surge is in the VS-3 powerup rotation", su.pool.includes("score_surge"), JSON.stringify(su.pool));
ok("score adds normally without surge", su.plain.gained === 100, JSON.stringify(su.plain));
ok("surge drop is picked up", su.picked === true && su.st.active === true, JSON.stringify({ picked: su.picked, st: su.st }));
ok("surge lasts 15s", su.st.remaining > 14000 && su.st.remaining <= 15000, JSON.stringify({ remaining: su.st.remaining }));
ok("surge doubles score gains", su.doubled.gained === 200, JSON.stringify(su.doubled));

console.log("== 9. riot_shield archetype ==");
const sh = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  const px = c.playerPos().x, py = c.playerPos().y;
  const zi = c.spawnAt("riot_shield", px + 120, py);
  const init = c.shieldState(zi);
  const absorb = c.shieldHit(zi, 100);   // shield holds: 100 in, 40 through
  const broke = c.shieldHit(zi, 10000);  // shield breaks
  const after = c.shieldHit(zi, 100);    // no shield left: full damage
  return { init, absorb, broke, after };
});
ok("riot_shield spawns with a shield pool", sh.init.type === "riot_shield" && sh.init.shieldHp > 0 && sh.init.shieldMax === sh.init.shieldHp, JSON.stringify(sh.init));
ok("shield reduces damage 60% while it holds", sh.absorb.dealt === 40 && sh.absorb.after === sh.absorb.before - 100, JSON.stringify(sh.absorb));
ok("overwhelming hit breaks the shield", sh.broke.after === 0, JSON.stringify(sh.broke));
ok("broken shield passes full damage", sh.after.dealt === 100, JSON.stringify(sh.after));

console.log(`\nbatch5a: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
if (errors.length) console.log("page errors:", errors.slice(0, 5));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
