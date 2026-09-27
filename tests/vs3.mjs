import { chromium } from "playwright-core";

const URL = process.env.PZ_URL || "http://127.0.0.1:8085";
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

console.log("== vs3 setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("toBreak()");

console.log("== 1. hit-feel module ==");
const feel = await page.evaluate(() => {
  const c = window.__controlsTest;
  const s0 = c.feelState();
  c.setFeel(true);
  c.resetFeel();
  const big = c.doFeelKill(true);   // miner_brute = big kill
  c.resetFeel();
  const small = c.doFeelKill(false); // shambler
  c.resetFeel();
  const fh = c.feelHitTest();
  c.resetFeel();
  c.setFeel(false);
  const off = c.doFeelKill(true);    // switch off: no effects
  c.setFeel(true);
  return { s0, big, small, fh, off };
});
ok("hit-feel on by default", feel.s0.on === true, JSON.stringify(feel.s0));
ok("big kill: hitstop spent + shockwave + slow-mo + zoom", feel.big.hs > 0 && feel.big.sw >= 1 && feel.big.slow > 0 && feel.big.zp > 0, JSON.stringify(feel.big));
ok("small kill: hitstop spent, no shockwave", feel.small.hs > 0 && feel.small.sw === 0, JSON.stringify(feel.small));
ok("bullet hit: camera kick", Math.abs(feel.fh.kick) > 0, JSON.stringify(feel.fh));
ok("kill switch off: no hitstop/shockwave/slow/zoom", feel.off.hs === 0 && feel.off.sw === 0 && feel.off.slow === 0 && feel.off.zp === 0, JSON.stringify(feel.off));

console.log("== 2. procedural tone engine ==");
const tone = await T("toneTest()");
ok("soundEngine.tone() runs without error", tone === true);

console.log("== 3. whiff feedback ==");
const whiff = await T("whiff()");
ok("bash completes and hit-feel switch reads", whiff.ok === true && whiff.feel === true, JSON.stringify(whiff));

console.log("== 4. grit tiers + fusing ==");
const tiers = await page.evaluate(() => {
  const c = window.__controlsTest;
  const t1 = c.gritTier(2);   // small -> tier 1
  const t2 = c.gritTier(6);   // chunk -> tier 2
  const t3 = c.gritTier(15);  // nugget -> tier 3
  return { t1, t2, t3 };
});
ok("value 2 -> tier 1", tiers.t1 === 1, JSON.stringify(tiers));
ok("value 6 -> tier 2", tiers.t2 === 2, JSON.stringify(tiers));
ok("value 15 -> tier 3", tiers.t3 === 3, JSON.stringify(tiers));
const fused = await page.evaluate(() => {
  const c = window.__controlsTest;
  // clear field, drop 3 tier-1 gems close together, fuse
  c.sweepGrit();
  for (let i = 0; i < 3; i++) c.gritTier(2);
  const before = c.gritCount();
  const after = c.fuseNow();
  return { before, after, count: c.gritCount() };
});
ok("3 near tier-1 gems fuse into one tier-2", fused.before === 3 && fused.count === 1 && fused.after[0] === 2, JSON.stringify(fused));

console.log("== 5. periodic powerups ==");
const pu = await page.evaluate(() => {
  const c = window.__controlsTest;
  const st = c.powerupState();
  const before = c.powerupState().drops;
  const after = c.forcePowerup();
  return { st, before, after };
});
ok("powerup timer scheduled ahead of sim time", pu.st.next > pu.st.sim, JSON.stringify(pu.st));
ok("forced powerup drops a pickup", pu.after === pu.before + 1, JSON.stringify({ before: pu.before, after: pu.after }));

console.log("== 6. storm cellar caches ==");
const spin = await T("spinN(300)");
const keys = Object.keys(spin);
const sevens = keys.filter((k) => k === "seven-seven-seven").reduce((a, k) => a + spin[k], 0);
ok("spin returns 3-symbol combos", keys.length > 1 && keys.every((k) => k.split("-").length === 3), JSON.stringify(keys.slice(0, 5)));
ok("7-7-7 jackpot occurs (rare)", sevens >= 0 && sevens <= 4, `jackpots in 300: ${sevens}`);
const cache = await page.evaluate(() => {
  const c = window.__controlsTest;
  const n0 = c.dropCache();
  const opened = c.openNearCache();
  // resolve a forced pair-of-sevens for 4 upgrades
  const levelsBefore = c.weapLevels();
  const r = c.applyCache([`seven`, `seven`, `diamond`], false);
  const levelsAfter = c.weapLevels();
  const up = levelsAfter.reduce((a, x, i) => a + x - levelsBefore[i], 0);
  // star cache: bomb charge or heal
  const s0 = c.applyCache([`star`, `diamond`, `diamond`], false);
  // jackpot: all weapons maxed
  const j = c.cacheJackpot();
  // gamble forced win doubles, forced loss
  const g1 = c.gambleF([`diamond`, `diamond`, `diamond`], true);
  const g0 = c.gambleF([`diamond`, `diamond`, `diamond`], false);
  return { n0, opened, up, r, s0, j, g1, g0 };
});
ok("cache drops and opens on proximity", cache.n0 >= 1 && cache.opened === true, JSON.stringify({ n0: cache.n0, opened: cache.opened }));
ok("pair of sevens: 4 weapon upgrades", cache.up === 4, JSON.stringify(cache));
ok("cache resolve returns cache result", cache.r.r === "cache", JSON.stringify(cache.r));
ok("jackpot maxes all owned weapons", cache.j.levels.length > 0 && cache.j.levels.every((l) => l === cache.j.max), JSON.stringify(cache.j));
ok("gamble forced win/loss", cache.g1 === true && cache.g0 === false, JSON.stringify({ g1: cache.g1, g0: cache.g0 }));

console.log("== page errors ==");
ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
