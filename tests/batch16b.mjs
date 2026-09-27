import { chromium } from "playwright-core";

// Lane 2 — Batch 16b: structured collision (collect contacts first, resolve
// once in a defined order) + juice-event contract (emitJuice/drainJuiceEvents).
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

console.log("== batch16b setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("toBreak()");

console.log("== 1. hit-order determinism (pierce-3 lever rifle, near to far) ==");
const orderRuns = [];
for (let run = 0; run < 3; run++) {
  const r = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.toBreak(); c.clearBullets();
    const p = c.playerPos();
    c.aimWorld(p.x + 400, p.y);
    const idx = [
      c.spawnAt("shambler", p.x + 150, p.y),
      c.spawnAt("shambler", p.x + 230, p.y),
      c.spawnAt("shambler", p.x + 310, p.y),
    ];
    // No pinAll: the lever one-shots shamblers, so each zombie dies on its
    // first hit and later hits skip the corpse — order is near to far.
    c.rehash(); // game loop rebuilds the hash each frame; sync test must do it too
    c.equipB7("lever_rifle"); // pierce 3
    c.fireAndRead();
    const hp0 = idx.map((i) => c.zHealth(i));
    const firstHitStep = [-1, -1, -1];
    for (let s = 0; s < 30; s++) {
      c.stepBullets(1);
      idx.forEach((zi, k) => {
        if (firstHitStep[k] === -1 && c.zHealth(zi) < hp0[k]) firstHitStep[k] = s;
      });
      if (firstHitStep.every((v) => v !== -1)) break;
    }
    return { firstHitStep };
  });
  orderRuns.push(r.firstHitStep);
}
for (let run = 0; run < 3; run++) {
  const o = orderRuns[run];
  ok(`run ${run + 1}: all three zombies hit`, o.every((v) => v >= 0), JSON.stringify(o));
  ok(`run ${run + 1}: near-to-far order`, o[0] < o[1] && o[1] < o[2], JSON.stringify(o));
}
const rankOf = (o) => o.map((_, i) => i).sort((a, b) => o[a] - o[b]).join(",");
ok("hit order identical across 3 runs", rankOf(orderRuns[0]) === rankOf(orderRuns[1]) && rankOf(orderRuns[1]) === rankOf(orderRuns[2]), JSON.stringify(orderRuns));

console.log("== 2. dense-pile order independence (insertion order varies) ==");
const spawnOrders = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [7, 6, 5, 4, 3, 2, 1, 0],
  [3, 0, 5, 1, 6, 2, 7, 4],
];
const pileRuns = [];
for (let run = 0; run < 3; run++) {
  const r = await page.evaluate((spawnOrder) => {
    const c = window.__controlsTest;
    c.toBreak(); c.clearBullets();
    const p = c.playerPos();
    // 8 zombies in a tight pile; zombie-array insertion order varies per run
    const pos = [];
    for (let k = 0; k < 8; k++) pos.push([p.x + 200 + (k % 4) * 14, p.y + (Math.floor(k / 4) - 0.5) * 14]);
    const idxByK = [];
    for (const k of spawnOrder) idxByK[k] = c.spawnAt("shambler", pos[k][0], pos[k][1]);
    const hp0 = idxByK.map((i) => c.zHealth(i));
    c.rehash();
    for (let b = 0; b < 4; b++) c.spawnBulletAt(p.x, p.y, 200, 0, 1000000, "revolver"); // pierce 1, overkill
    c.stepBullets(3);
    const hp1 = idxByK.map((i) => c.zHealth(i));
    const dead = idxByK.map((i, k) => (c.zHealth(i) <= 0 ? k : -1)).filter((v) => v >= 0);
    const totalDmg = hp0.reduce((s, h, k) => s + Math.max(0, h - hp1[k]), 0);
    return { dead: dead.join(","), totalDmg, bulletsLeft: c.bulletCount() };
  }, spawnOrders[run]);
  pileRuns.push(r);
}
ok("4 kills from 4 pierce-1 bullets", pileRuns[0].dead.split(",").filter(Boolean).length === 4, JSON.stringify(pileRuns[0]));
ok("all bullets consumed", pileRuns.every((r) => r.bulletsLeft === 0), JSON.stringify(pileRuns.map((r) => r.bulletsLeft)));
ok("dead set identical across insertion orders", pileRuns.every((r) => r.dead === pileRuns[0].dead), JSON.stringify(pileRuns.map((r) => r.dead)));
ok("total damage identical across insertion orders", pileRuns.every((r) => r.totalDmg === pileRuns[0].totalDmg), JSON.stringify(pileRuns.map((r) => r.totalDmg)));

console.log("== 3. pierce exhaustion (pierce-1 into 2 lined zombies) ==");
const ex = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.clearBullets();
  const p = c.playerPos();
  const i0 = c.spawnAt("shambler", p.x + 120, p.y);
  const i1 = c.spawnAt("shambler", p.x + 240, p.y);
  const h0 = c.zHealth(i0), h1 = c.zHealth(i1);
  c.rehash();
  c.spawnBulletAt(p.x, p.y, 200, 0, 50, "revolver"); // pierce 1
  c.stepBullets(3);
  return { h0, h1, a0: c.zHealth(i0), a1: c.zHealth(i1), bullets: c.bulletCount() };
});
ok("nearer zombie takes damage", ex.a0 < ex.h0, JSON.stringify({ h0: ex.h0, a0: ex.a0 }));
ok("farther zombie untouched", ex.a1 === ex.h1, JSON.stringify({ h1: ex.h1, a1: ex.a1 }));
ok("spent bullet removed", ex.bullets === 0, JSON.stringify({ bullets: ex.bullets }));

console.log("== page errors ==");
ok("zero page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log(`batch16b: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
