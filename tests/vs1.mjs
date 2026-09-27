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

console.log("== vs1 setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("toBreak()");

console.log("== 1. harvest streak counts and tiers ==");
await page.evaluate(() => { const c = window.__controlsTest; c.killOne(); c.killOne(); c.killOne(); });
let s = await T("streak()");
ok("3 rapid kills -> streak 3", s.streak === 3 && s.max === 3, JSON.stringify(s));
ok("tier color cyan under 10", s.color === "#4cc3ff", s.color);
await page.evaluate(() => { const c = window.__controlsTest; for (let i = 0; i < 9; i++) c.killOne(); });
s = await T("streak()");
ok("12 kills -> streak 12, gold tier", s.streak === 12 && s.color === "#ffd700", JSON.stringify(s));
await page.evaluate(() => { const c = window.__controlsTest; for (let i = 0; i < 10; i++) c.killOne(); });
s = await T("streak()");
ok("22 kills -> pink tier", s.streak === 22 && s.color === "#ff6ec7" && s.max === 22, JSON.stringify(s));

console.log("== 2. streak resets on hurt and on window expiry ==");
await T("hurtMe(10)");
s = await T("streak()");
ok("hurt -> streak 0", s.streak === 0 && s.timer === 0, JSON.stringify(s));
await page.evaluate(() => { const c = window.__controlsTest; c.killOne(); c.killOne(); });
s = await T("streak()");
ok("rebuilds to 2", s.streak === 2, JSON.stringify(s));
await T("decayStreak(3.5)");
s = await T("streak()");
ok("window expiry -> streak 0", s.streak === 0, JSON.stringify(s));

console.log("== 3. rarity-weighted draft offers ==");
const offers = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.openDraft();
  const d = c.banishState().draft;
  return d;
});
ok("draft opens with 3 offers", offers.length === 3, JSON.stringify(offers));
const counts = await page.evaluate(() => {
  const c = window.__controlsTest;
  const cnt = { common: 0, uncommon: 0, rare: 0 };
  for (let i = 0; i < 200; i++) for (const id of c.rollPool([])) {
    const r = { lead: "common", trigger: "common", hide: "common", shells: "common", jug: "common", leavings: "common", beam: "uncommon", stride: "uncommon", bone: "uncommon", ring: "uncommon", pipe: "uncommon", post: "rare", storm: "rare", salt: "rare" }[id];
    cnt[r]++;
  }
  return cnt;
});
const total = counts.common + counts.uncommon + counts.rare;
const pc = counts.common / total, pu = counts.uncommon / total, pr = counts.rare / total;
ok("common lands 45-75%", pc > 0.45 && pc < 0.75, JSON.stringify(counts));
ok("uncommon lands 18-42%", pu > 0.18 && pu < 0.42, JSON.stringify(counts));
ok("rare lands 2-20%", pr > 0.02 && pr < 0.2, JSON.stringify(counts));
ok("ordering common > uncommon > rare", pc > pu && pu > pr, JSON.stringify(counts));

console.log("== 4. banish (run out of the county) ==");
const ban = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.openDraft();
  const id = c.banishState().draft[0];
  const r1 = c.banish(id);
  const after1 = c.banishState();
  const r2 = c.banish(after1.draft[0]);
  const after2 = c.banishState();
  const r3 = c.banish(after2.draft[0]); // no charges left
  // banished id must never come back in weighted rolls
  let seen = 0;
  for (let i = 0; i < 40; i++) if (c.rollPool([id]).includes(id)) seen++;
  return { id, r1, charges1: after1.charges, stillThere: after1.draft.includes(id), r2, charges2: after2.charges, r3, seen };
});
ok("banish consumes a charge", ban.r1 === true && ban.charges1 === 1, JSON.stringify(ban));
ok("banished boon leaves the draft", ban.stillThere === false, JSON.stringify(ban));
ok("second banish works", ban.r2 === true && ban.charges2 === 0, JSON.stringify(ban));
ok("third banish denied at 0 charges", ban.r3 === false, JSON.stringify(ban));
ok("banished boon never returns to the pool", ban.seen === 0, JSON.stringify(ban));

console.log("== 5. scorch decals capped ==");
await T("addScorchAt(70)");
const sc = await T("scorchCount()");
ok("scorch capped at 60", sc === 60, `count=${sc}`);

console.log("== 6. impact audio runs clean ==");
await page.evaluate(() => {
  const c = window.__controlsTest;
  c.playImpact(); c.playImpact(); c.playKillSub(); c.playBanishSfx();
});
ok("no page errors after audio calls", errors.length === 0, errors.join(" | "));

await browser.close();
console.log(`\nvs1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
