import { chromium } from "playwright-core";
import { readFileSync } from "fs";

// Lane 3 (AUDIO) — Batch 7: 4-bus + compressor master.
// - audioGraph() reports 4 buses + compressor + separate music bus
// - firing a weapon routes through the weapon bus without errors
// - mute/unmute preserves sfx/music volumes (clean mute: master zeroed only)
// - no page errors during 20s of combat audio across all 4 buses
// - negative Bayville/Griggsville/Illinois assertions on src/audio/soundEngine.ts
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

console.log("== batch7c setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("toBreak()");

const mouseDown = (button = 0) => page.evaluate((b) => {
  const c = document.querySelector("canvas");
  const r = c.getBoundingClientRect();
  c.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: r.width / 2, clientY: r.height / 2, button: b }));
}, button);
const mouseUp = () => page.evaluate(() => window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 })));

console.log("== 1. audioGraph() topology ==");
const ag = await T("audioGraph()");
ok("audioGraph reports exactly 4 buses", JSON.stringify(ag.buses) === JSON.stringify(["effort", "weapon", "impact", "beast"]), JSON.stringify(ag));
ok("audioGraph reports compressor built", ag.compressor === true, JSON.stringify(ag));
ok("audioGraph reports music bus separate from SFX buses", ag.musicSeparate === true, JSON.stringify(ag));

console.log("== 2. firing a weapon routes through the weapon bus ==");
await mouseDown(0);
await page.waitForTimeout(1500);
await mouseUp();
const last = await T("audioLastShot()");
ok("firing produced a shot through playShotFor", !!last && last.kind !== "", JSON.stringify(last));
ok("shot kind is a known ShotKind", ["blunt", "axe", "thrust", "heavy-blade", "firearm", "chain"].includes(last.kind), JSON.stringify(last));
ok("shot recorded its layers", Array.isArray(last.layers) && last.layers.length > 0, JSON.stringify(last));
ok("no page errors while firing", errors.length === 0, errors.join(" | ").slice(0, 300));

console.log("== 3. mute/unmute preserves volumes (clean mute) ==");
const g0 = await T("audioGains()");
const near = (a, b) => Math.abs(a - b) < 1e-6;
ok("gains readable pre-mute (all positive)", g0.master > 0 && g0.sfx > 0 && g0.music > 0, JSON.stringify(g0));
await T("audioMute(true)");
const gm = await T("audioGains()");
ok("mute reports muted", (await T("audioMuted()")) === true);
ok("mute zeroes master only", gm.master === 0 && near(gm.sfx, g0.sfx) && near(gm.music, g0.music), JSON.stringify(gm));
await T("audioMute(false)");
const g2 = await T("audioGains()");
ok("unmute reports unmuted", (await T("audioMuted()")) === false);
ok("unmute restores volumes exactly", near(g2.master, g0.master) && near(g2.sfx, g0.sfx) && near(g2.music, g0.music), JSON.stringify(g2));

console.log("== 4. 20s of combat audio across all 4 buses ==");
// weapon: bursts of fire; impact: impacts/kills/bomb/achievement/tone;
// effort: hurt + right-click bash; beast: zombie groans on spawn + kill-surge growl.
const t0 = Date.now();
let bursts = 0;
while (Date.now() - t0 < 20000) {
  await page.evaluate(() => {
    const c = window.__controlsTest;
    c.spawnType("shambler");           // beast: groan on spawn
    c.killOne("shambler");             // impact: kill sounds + beast: surge growl
    c.hurtMe(5);                       // effort: player hurt
    c.playImpact(); c.playKillSub(); c.playBanishSfx(); // impact probes
    c.bombEcho();                      // impact: bomb + echo bus
    c.achievement();                   // impact
    c.toneTest();                      // impact: generic tone
  });
  await mouseDown(0);                  // weapon bus: hold fire
  await page.waitForTimeout(900);
  await mouseUp();
  await mouseDown(2);                  // effort: bash
  await page.waitForTimeout(150);
  await mouseUp();
  bursts++;
}
ok("combat audio ran 20s without page errors", errors.length === 0, errors.join(" | ").slice(0, 500));
ok("multiple combat bursts completed", bursts >= 8, `bursts=${bursts}`);

console.log("== 5. negative place-name assertions on src ==");
const src = readFileSync(new globalThis.URL("../src/audio/soundEngine.ts", import.meta.url), "utf8");
ok("no Bayville in soundEngine.ts", !/bayville/i.test(src));
ok("no Griggsville in soundEngine.ts", !/griggsville/i.test(src));
ok("no Illinois in soundEngine.ts", !/illinois/i.test(src));

await browser.close();
console.log(`\nbatch7c: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
