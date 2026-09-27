import { chromium } from "playwright-core";

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

console.log("== vs2 setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("toBreak()");

console.log("== 1. weapon-family affinities ==");
const fam = await page.evaluate(() => {
  const c = window.__controlsTest;
  const before = { rev: c.famMul("revolver"), sg: c.famMul("shotgun"), cb: c.famMul("carbine") };
  c.unlockW("lever_rifle");
  const after = { rev: c.famMul("revolver"), lever: c.famMul("lever_rifle") };
  return { before, after };
});
ok("iron family inactive with only revolver", fam.before.rev === 1, JSON.stringify(fam.before));
ok("scatter family inactive unevolved", fam.before.sg === 1, JSON.stringify(fam.before));
ok("iron affinity +12% with revolver+lever", fam.after.rev === 1.12 && fam.after.lever === 1.12, JSON.stringify(fam.after));

console.log("== 2. evolution table (6 Pike County recipes) ==");
const evo = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.giveBoon("storm");
  const e1 = { name: c.forceEvo(), w: c.weap("revolver") };
  c.giveBoon("bone", 2);
  const e2 = { name: c.forceEvo(), w: c.weap("shotgun") };
  c.unlockW("carbine"); c.giveBoon("trigger", 2);
  const e3 = { name: c.forceEvo(), w: c.weap("carbine") };
  c.unlockW("lever_rifle"); c.giveBoon("salt", 2);
  const e4 = { name: c.forceEvo(), w: c.weap("lever_rifle") };
  c.unlockW("crossbow"); c.giveBoon("hide", 2);
  const e5 = { name: c.forceEvo(), w: c.weap("crossbow") };
  c.unlockW("chainsaw"); c.giveBoon("jug", 2);
  const e6 = { name: c.forceEvo(), w: c.weap("chainsaw") };
  const sgFam = c.famMul("shotgun");
  return { e1, e2, e3, e4, e5, e6, sgFam };
});
ok("revolver + storm -> .357 Deadeye preserved", evo.e1.name === ".357 Deadeye", JSON.stringify(evo.e1));
ok("Deadeye: +70% dmg, pierce 3", evo.e1.w.dmg > 100 && evo.e1.w.pierce === 3, JSON.stringify(evo.e1.w));
ok("shotgun + bone -> Widow's Bell", evo.e2.name === "Widow's Bell", JSON.stringify(evo.e2));
ok("Widow's Bell: +2 pellets", evo.e2.w.pellets === 10, JSON.stringify(evo.e2.w));
ok("carbine + trigger -> Enos Corner Repeater", evo.e3.name === "Enos Corner Repeater", JSON.stringify(evo.e3));
ok("lever_rifle + salt -> White Oak Longrifle", evo.e4.name === "White Oak Longrifle", JSON.stringify(evo.e4));
ok("Longrifle: pierce 5", evo.e4.w.pierce === 5, JSON.stringify(evo.e4.w));
ok("crossbow + hide -> Buffalo Trace Stalker", evo.e5.name === "Buffalo Trace Stalker", JSON.stringify(evo.e5));
ok("chainsaw + jug -> Kindill Ripper", evo.e6.name === "Kindill Ripper", JSON.stringify(evo.e6));
ok("evolved shotgun gains family affinity", evo.sgFam === 1.12, `famMul=${evo.sgFam}`);

console.log("== 3. guaranteed elite spawn ==");
const el = await page.evaluate(() => {
  const c = window.__controlsTest;
  const z = c.spawnElite();
  return { ...z, count: c.eliteCount() };
});
ok("guaranteed elite spawns as elite", el.elite === true && el.count >= 1, JSON.stringify(el));
ok("elite has scaled HP (2.2x base)", el.hp >= 90, JSON.stringify(el));

console.log("== 4. named wave windows ==");
const win = await page.evaluate(() => {
  const c = window.__controlsTest;
  return {
    w1: c.windowFor(1), w3: c.windowFor(3), w4: c.windowFor(4),
    w6: c.windowFor(6), w8: c.windowFor(8), w11: c.windowFor(11), w20: c.windowFor(20),
    sched: c.schedule(),
  };
});
ok("wave 1 = Dusk Settles", win.w1 === "Dusk Settles", win.w1);
ok("wave 3 = Golden Swarm", win.w3 === "Golden Swarm", win.w3);
ok("wave 4 = The Trace Howls", win.w4 === "The Trace Howls", win.w4);
ok("wave 6 = Blood Moon", win.w6 === "Blood Moon", win.w6);
ok("wave 8 = The Hartwell Shift", win.w8 === "The Hartwell Shift", win.w8);
ok("wave 11 = Black Damp", win.w11 === "Black Damp", win.w11);
ok("wave 20 = Old Ben Wakes", win.w20 === "Old Ben Wakes", win.w20);
ok("schedule lists all 7 windows", win.sched.length === 7 && win.sched.every((w) => w.name && w.waves), JSON.stringify(win.sched.map((w) => w.name)));
ok("no page errors", errors.length === 0, errors.join(" | "));

await browser.close();
console.log(`\nvs2: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
