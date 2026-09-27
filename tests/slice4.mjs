import { chromium } from "playwright-core";

const URL = process.env.PZ_URL || "http://127.0.0.1:8080";
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

console.log("== title screen controls window ==");
await page.goto(URL, { waitUntil: "networkidle" });
const helpBtn = page.locator("button").filter({ has: page.locator("svg.lucide-circle-help, svg.lucide-help-circle") }).first();
await helpBtn.waitFor({ timeout: 15000 });
await helpBtn.click();
await page.getByText("CONTROLS", { exact: true }).waitFor();
ok("modal opens on title", true);
for (const key of ["Dodge roll", "Sprint", "Cedar-post rifle", "Stovepipe mine", "Board holes"]) {
  ok(`lists "${key}"`, await page.getByText(key).first().isVisible());
}
await page.locator('button[aria-label="Close controls"]').click();
ok("modal closes", await page.getByText("CONTROLS", { exact: true }).isHidden());

console.log("== in-game: H key, barrels, ammo, turrets, wave scaling ==");
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);

await page.keyboard.press("KeyH");
await page.getByText("CONTROLS", { exact: true }).waitFor();
ok("H opens controls in game", true);
await page.keyboard.press("KeyH");
ok("H closes controls in game", await page.getByText("CONTROLS", { exact: true }).isHidden());

const { barrels, spawn } = await page.evaluate(() => ({
  barrels: window.__controlsTest.barrels(),
  spawn: window.__controlsTest.spawnPt(),
}));
ok("barrels still exist elsewhere", barrels.length > 0, `n=${barrels.length}`);
ok("no barrels within 350 of spawn", barrels.every((b) => Math.hypot(b.x - spawn.x, b.y - spawn.y) >= 350));

const carb = await T(`weapon("carbine")`);
ok("carbine scarce", carb.reserve === 80 && carb.max === 160, JSON.stringify(carb));
const sg = await T(`weapon("shotgun")`);
ok("shotgun scarce", sg.reserve === 40 && sg.max === 60, JSON.stringify(sg));
const xb = await T(`weapon("crossbow")`);
ok("crossbow scarce", xb.reserve === 18 && xb.max === 30, JSON.stringify(xb));

ok("post rank starts at 1", (await T("postRank()")) === 1);
await T("giveScrap(1000)");
ok("upgrade to mk2", (await T("upgradePost()")) === true && (await T("postRank()")) === 2);
await T("give(2, 0)");
await T("plant()");
const traps = await T("traps()");
const post = traps.find((x) => x.kind === "post");
ok("mk2 post has 18-round mag", post && post.left === 18, JSON.stringify(post));
ok("upgrade to mk3", (await T("upgradePost()")) === true && (await T("postRank()")) === 3);
ok("mk3 is max", (await T("upgradePost()")) === false);

await T("setWave(6)");
// spawn+read in a single tick so no frame can damage the zombie before we read it;
// take the min over several spawns to dodge elite rolls (elites only raise HP)
const hpReads = [];
for (let i = 0; i < 8; i++) {
  hpReads.push(await page.evaluate(() => {
    const c = window.__controlsTest;
    c.spawnType("shambler");
    return { hp: c.lastZombie().hp, mult: c.sys().mods.enemyHpMult };
  }));
}
const minHp = Math.min(...hpReads.map((r) => r.hp));
const hpMult = hpReads[0].mult;
const expected = Math.round(Math.round(58 * 1.28) * hpMult);
ok("wave 6 shambler has scaled HP", minHp === expected, `min=${minHp} expected=${expected} mult=${hpMult}`);

ok("zero page errors", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
