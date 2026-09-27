import { chromium } from "playwright-core";

// Lane A (engine enemy-AI) — Batch 6: spitter kiting (keepDistance/firingRange),
// bomber fuse spec (fuseRange/fuseTime, accelerating beep, blast telegraph,
// blastRadius/blastDamage falloff), structure-chewing utility decision,
// off-screen objective drift.
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

console.log("== batch6a setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("toBreak()");

console.log("== 1. spitter kiting bands (deterministic) ==");
const k = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  const px = c.playerPos().x, py = c.playerPos().y;
  return { px, py, back: c.ghostKite(150), hold: c.ghostKite(340), adv: c.ghostKite(500) };
});
ok("spec keeps keepDistance=260 firingRange=420", (await T("b6spec()")).keep === 260 && (await T("b6spec()")).fire === 420);
ok("close spitter backs off (target away from player)", k.back.band === "backoff" && k.back.tx < k.px - 150, JSON.stringify(k.back));
ok("far spitter advances on the player", k.adv.band === "advance" && Math.abs(k.adv.tx - k.px) <= 1 && Math.abs(k.adv.ty - k.py) <= 1, JSON.stringify(k.adv));
ok("hold band strafes sideways, strong blend", k.hold.band === "hold" && k.hold.blend === 0.75 && k.hold.tx !== k.px, JSON.stringify(k.hold));

console.log("== 2. live kiting + spitting ==");
const km = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  const px = c.playerPos().x, py = c.playerPos().y;
  const i = c.spawnAt("bloater_spitter", px + 150, py);
  c.facePlayer(i); // spawned zombies face east; turn it toward the player so it sees
  // let it acquire the player (sight cone + line of sight around map geometry)
  let ai = c.zAi(i), guard = 0;
  while (ai !== "chase" && guard++ < 40) { c.stepZombies(10); ai = c.zAi(i); }
  const d0 = c.zDist(i);
  c.stepZombies(200); // 3.3s of kiting
  const d1 = c.zDist(i);
  const st = c.kiteState();
  return { d0, d1, ai: c.zAi(i), spits: st ? st.spits : -1 };
});
ok("live spitter backs away from a close player", km.ai === "chase" && km.d1 > km.d0 + 5, JSON.stringify({ d0: km.d0, d1: km.d1, ai: km.ai }));
ok("spitter stays engaged (chase/attack)", km.ai === "chase" || km.ai === "attack", JSON.stringify({ ai: km.ai }));
ok("spitter fires acid while in range", km.spits >= 1, JSON.stringify({ spits: km.spits }));

console.log("== 3. bomber fuse spec ==");
const f = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  const px = c.playerPos().x, py = c.playerPos().y;
  const bi = c.spawnAt("bomber", px + 80, py);          // inside fuseRange 130
  const ni = c.spawnAt("miner_brute", px + 100, py);    // 20px from bomber: inside blast
  const nHp0 = c.zHealth(ni);
  c.stepZombies(10);
  const fs1 = c.fuseState();
  c.stepZombies(30);
  const fs2 = c.fuseState();
  c.stepZombies(60); // fuseTime 0.9s expires
  const gone = c.fuseState();
  return { fs1, fs2, gone, nHp0, nHp1: c.zHealth(ni), zc: c.zCount() };
});
const spec = await T("b6spec()");
ok("b6spec exposes fuse + blast constants", spec.fuseRange === 130 && spec.fuseTime === 0.9 && spec.blastR === 110 && spec.blastDmg === 140, JSON.stringify(spec));
ok("fuse starts inside fuseRange", !!f.fs1 && f.fs1.fuseT > 0 && f.fs1.fuseT <= 0.9, JSON.stringify(f.fs1));
ok("fuse burns down over time", !!f.fs2 && f.fs2.fuseT < f.fs1.fuseT, JSON.stringify({ t1: f.fs1 && f.fs1.fuseT, t2: f.fs2 && f.fs2.fuseT }));
ok("beep timer cycles under 0.3s", !!f.fs1 && f.fs1.beepT >= 0 && f.fs1.beepT <= 0.3, JSON.stringify(f.fs1));
ok("fuse expiry detonates the bomber", f.gone === null, JSON.stringify({ gone: f.gone, zc: f.zc }));
ok("blast hurts nearby zombies (falloff)", f.nHp1 < f.nHp0, JSON.stringify({ before: f.nHp0, after: f.nHp1 }));

console.log("== 4. bomber blast hurts the player inside R*0.7 ==");
const fp = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  const px = c.playerPos().x, py = c.playerPos().y;
  c.spawnAt("bomber", px + 50, py); // pd=50 < 77: player takes blast damage
  const h0 = c.php();
  c.stepZombies(80);
  return { h0, h1: c.php(), gone: c.fuseState() };
});
ok("player inside blast takes damage", fp.h1 < fp.h0 && fp.gone === null, JSON.stringify(fp));

console.log("== 5. structure-chewing utility ==");
const ch = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  c.giveScrap(200);
  const h0 = c.getHoles()[0];
  c.teleport(h0.x + 40, h0.y);
  c.boardNearest(); // boards the hole nearest the player
  const bh = c.holeBoards()[0]; // the hole that actually got boarded
  c.teleport(bh.x + 220, bh.y); // player 220 east of the boards
  const hp0 = bh.hp;
  const bi = c.spawnAt("miner_brute", bh.x + 100, bh.y); // 100 from boards, 120 from player
  const si = c.spawnAt("sprinter", bh.x + 100, bh.y + 60);
  c.facePlayer(bi); c.facePlayer(si);
  c.stepZombies(20);
  const brute = c.chewState(bi);
  const spr = c.chewState(si);
  c.stepZombies(200); // brute walks to the boards and chews
  const hp1 = (c.holeBoards()[0] || {}).hp;
  return { hp0, brute, spr, hp1 };
});
ok("miner brute commits to chewing boards", ch.brute.ai === "chew" && ch.brute.kind === "hole", JSON.stringify(ch.brute));
ok("sprinter almost never stops to chew", ch.spr.ai !== "chew", JSON.stringify(ch.spr));
ok("chewing damages the boards", typeof ch.hp1 === "number" && ch.hp1 < ch.hp0, JSON.stringify({ hp0: ch.hp0, hp1: ch.hp1 }));

console.log("== 6. chewing a turret post ==");
const cp = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  const px = c.playerPos().x, py = c.playerPos().y;
  c.give(2, 2);
  c.setAim(-1, 0);
  c.plant(); // post at player.x - 46
  const post = c.postHp()[0];
  c.teleport(post.x + 150, post.y); // player stands off: 150 from the turret
  const hp0 = post.hp;
  const bi = c.spawnAt("miner_brute", post.x + 40, post.y); // 40 from post, 110 from player
  c.facePlayer(bi);
  c.stepZombies(20);
  const st = c.chewState(bi);
  c.stepZombies(250);
  const hp1 = (c.postHp()[0] || {}).hp;
  return { hp0, st, hp1 };
});
ok("brute commits to chewing the turret", cp.st.ai === "chew" && cp.st.kind === "post", JSON.stringify(cp.st));
ok("chewing damages the post", typeof cp.hp1 === "number" && cp.hp1 < cp.hp0, JSON.stringify({ hp0: cp.hp0, hp1: cp.hp1 }));

console.log("== 7. off-screen objective drift ==");
const dr = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  const px = c.playerPos().x, py = c.playerPos().y;
  const i = c.spawnAt("sprinter", px + 900, py); // far, no stimulus
  c.stepZombies(5);
  const ds = c.driftState(i);
  const p0 = c.zPos(i);
  const d0 = ds.kind ? Math.hypot(p0.x - ds.dx, p0.y - ds.dy) : -1;
  c.stepZombies(240);
  const p1 = c.zPos(i);
  const d1 = ds.kind ? Math.hypot(p1.x - ds.dx, p1.y - ds.dy) : -1;
  return { kind: ds.kind, d0: Math.round(d0), d1: Math.round(d1) };
});
ok("unstimulated zombie picks a map objective", !!dr.kind, JSON.stringify({ kind: dr.kind }));
ok("drifter closes on (or holds near) the objective", dr.d0 > 200 ? dr.d1 < dr.d0 - 20 : dr.d1 < dr.d0 + 80, JSON.stringify({ d0: dr.d0, d1: dr.d1 }));

console.log(`\nbatch6a: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
if (errors.length) console.log("page errors:", errors.slice(0, 5));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
