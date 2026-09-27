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

console.log("== group1 setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");

// fresh zombie slate helper: all spawn+read in one tick where it matters
const fresh = () => page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.skipBreak(); c.setKeys([]); c.setAim(1, 0);
  return { px: c.getX(), py: c.getY() };
});

console.log("== 1. ghost personality targets (deterministic, via probe hook) ==");
await fresh();
// player moving east at 4 units/frame: sprinter must target ~0.4s ahead (4*24=96 units)
const lead = await page.evaluate(() => {
  const c = window.__controlsTest;
  return { px: c.getX(), py: c.getY(), ...c.ghostLead("sprinter", 4, 0) };
});
ok("sprinter tx leads +x while moving east", lead.tx > lead.px + 80 && lead.tx < lead.px + 120, JSON.stringify(lead));
ok("sprinter ty ~ player y (no y movement)", Math.abs(lead.ty - lead.py) < 1, JSON.stringify(lead));
// stationary player: no lead
const still = await page.evaluate(() => window.__controlsTest.ghostLead("sprinter", 0, 0));
ok("sprinter tx == px when player still", Math.abs(still.tx - lead.px) < 1, JSON.stringify(still));
// crawler holds a lateral flank offset, not the player position
const flank = await page.evaluate(() => window.__controlsTest.ghostLead("crawler", 4, 0));
ok("crawler targets a flank offset", Math.abs(flank.ty - lead.py) > 60, JSON.stringify(flank));

console.log("== 2. idle spawn + noise -> investigate ==");
await fresh();
const zrow = await page.evaluate(() => {
  const c = window.__controlsTest;
  const z = c.spawnType("shambler");
  const id = String(z.id).slice(-6);
  z.x = c.getX() + 900; z.y = c.getY(); z.ai = "wander";
  z.hearX = z.x; z.hearY = z.y;
  const row = c.sys().zombies().find((r) => r.id === id);
  return { id, d0: row.d, state: row.state };
});
ok("far zombie spawns idle (wander)", zrow.state === "wander", JSON.stringify(zrow));
await page.waitForTimeout(600);
const zrow2 = await page.evaluate((id) => {
  const c = window.__controlsTest;
  const row = c.sys().zombies().find((r) => r.id === id);
  return { d: row.d, state: row.state };
}, zrow.id);
ok("far zombie does not approach", zrow2.state === "wander" && zrow2.d >= zrow.d0 - 40, JSON.stringify(zrow2));
await page.evaluate(() => {
  const c = window.__controlsTest;
  c.noise(c.getX(), c.getY(), 950);
});
await page.waitForFunction((id) => {
  const c = window.__controlsTest;
  const row = c.sys().zombies().find((r) => r.id === id);
  return row && row.state === "investigate";
}, zrow.id, { timeout: 2000 });
ok("noise flips far zombie to investigate", true);

console.log("== 3. sneaking sight < normal/sprinting sight ==");
// sprinter sight: normal 300, sneak 186, sprint 600 (lantern hijacks shambler facing, so use sprinter)
// sneak: 220 > 186 -> stays wander
await fresh();
const sneakId = await page.evaluate(() => {
  const c = window.__controlsTest;
  const z = c.spawnType("sprinter");
  z.x = c.getX() + 220; z.y = c.getY(); z.ai = "wander";
  z.health = z.maxHealth = 5000;
  const a = Math.atan2(c.getY() - z.y, c.getX() - z.x);
  z.angle = a + Math.PI; z.wanderAngle = a + Math.PI; // face away: must not see, must not close in
  z.hearX = z.x; z.hearY = z.y;
  c.setKeys(["ControlLeft"]);
  return String(z.id).slice(-6);
});
await page.waitForTimeout(700);
{
  const st = await page.evaluate((sneakId) => window.__controlsTest.sys().zombies().find((x) => x.id === sneakId).state, sneakId);
  ok("sneaking: zombie at 220 stays wander", st === "wander", st);
}
// normal: 220 < 300 -> chases
await fresh();
const normId = await page.evaluate(() => {
  const c = window.__controlsTest;
  const z = c.spawnType("sprinter");
  z.x = c.getX() + 220; z.y = c.getY(); z.ai = "wander";
  z.health = z.maxHealth = 5000;
  const a = Math.atan2(c.getY() - z.y, c.getX() - z.x);
  z.angle = a; z.wanderAngle = a;
  z.hearX = z.x; z.hearY = z.y;
  c.setKeys([]);
  return String(z.id).slice(-6);
});
await page.waitForFunction((normId) => window.__controlsTest.sys().zombies().find((x) => x.id === normId).state === "chase", normId, { timeout: 2500 });
ok("normal: zombie at 220 chases", true);
// sprint: 300 < 400 < 600 -> chases only while sprinting
await fresh();
const sprintId = await page.evaluate(() => {
  const c = window.__controlsTest;
  const z = c.spawnType("sprinter");
  z.x = c.getX() + 400; z.y = c.getY(); z.ai = "wander";
  z.health = z.maxHealth = 5000;
  const a = Math.atan2(c.getY() - z.y, c.getX() - z.x);
  z.angle = a; z.wanderAngle = a;
  z.hearX = z.x; z.hearY = z.y;
  c.setKeys(["KeyA", "ShiftLeft"]);
  return String(z.id).slice(-6);
});
await page.waitForFunction((sprintId) => window.__controlsTest.sys().zombies().find((x) => x.id === sprintId).state === "chase", sprintId, { timeout: 2500 });
ok("sprinting: zombie at 400 chases (beyond normal sight)", true);
await T("setKeys([])");

console.log("== 4. lighting overlay + muzzle point light ==");
ok("lighting overlay canvas exists", await T("lightingOverlay()"));
{
  const n = await page.evaluate(() => {
    const c = window.__controlsTest;
    c.setAim(1, 0);
    c.fire();
    return c.dynLightCount();
  });
  ok("firing registers a muzzle point light", n >= 1, `dyn=${n}`);
}

console.log("== 5. 150-zombie crowd smoke test ==");
await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak(); c.skipBreak(); c.god(); c.setKeys([]);
  c.spawn150("shambler");
});
await page.waitForTimeout(2000);
{
  const r = await page.evaluate(() => {
    const c = window.__controlsTest;
    return { n: c.sys().zombies().length, cells: c.hashCells() };
  });
  ok("150-zombie crowd survives frame loop", r.n >= 140, JSON.stringify(r));
  ok("spatial hash is populated", r.cells > 0, JSON.stringify(r));
}

console.log("== 6. page errors ==");
ok("zero page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log(`\ngroup1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
