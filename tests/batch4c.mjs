// Batch 4 Lane C (audio): adaptive music intensity + bomb echo + achievement arpeggio.
// Drives the soundEngine singleton directly via page.evaluate dynamic import
// (Vite dev serves /src/audio/soundEngine.ts as the same module the game imports).
import { chromium } from "playwright-core";

const URL = process.env.PZ_URL || "http://127.0.0.1:8093";
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

console.log("== batch4c setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const MOD = () => page.evaluate(async () => {
  const m = await import("/src/audio/soundEngine.ts");
  return m.soundEngine;
});

console.log("== 1. setIntensity clamps + returns state ==");
const inten = await page.evaluate(async () => {
  const m = await import("/src/audio/soundEngine.ts");
  const se = m.soundEngine;
  const out = [];
  se.setIntensity(0.8);
  out.push(se.getIntensity());
  se.setIntensity(-5);
  out.push(se.getIntensity());
  se.setIntensity(2.5);
  out.push(se.getIntensity());
  se.setIntensity(0);
  out.push(se.getIntensity());
  return out;
});
ok("setIntensity(0.8) -> 0.8", inten[0] === 0.8, JSON.stringify(inten));
ok("setIntensity(-5) clamps to 0", inten[1] === 0, JSON.stringify(inten));
ok("setIntensity(2.5) clamps to 1", inten[2] === 1, JSON.stringify(inten));
ok("setIntensity(0) -> 0", inten[3] === 0, JSON.stringify(inten));

console.log("== 2. heat drives intensity (engine-facing update) ==");
const heatTrack = await page.evaluate(async () => {
  const m = await import("/src/audio/soundEngine.ts");
  const se = m.soundEngine;
  se.setHeat(0.5);
  const a = se.getIntensity();
  se.setHeat(0.9);
  const b = se.getIntensity();
  se.setHeat(0); // restore
  const c = se.getIntensity();
  return { a, b, c };
});
ok("setHeat(0.5) pushes intensity", Math.abs(heatTrack.a - 0.5) < 0.03, JSON.stringify(heatTrack));
ok("setHeat(0.9) pushes intensity higher", Math.abs(heatTrack.b - 0.9) < 0.03, JSON.stringify(heatTrack));
ok("setHeat(0) restores low intensity", heatTrack.c < 0.03, JSON.stringify(heatTrack));

console.log("== 3. playBombEcho + playAchievement run clean ==");
const sfx = await page.evaluate(async () => {
  const m = await import("/src/audio/soundEngine.ts");
  const se = m.soundEngine;
  let bombOk = false, achOk = false, err = null;
  try {
    se.setIntensity(0.9);
    se.playBombEcho();
    bombOk = true;
    se.playAchievement();
    achOk = true;
    se.setIntensity(0);
  } catch (e) { err = String(e); }
  return { bombOk, achOk, err };
});
ok("playBombEcho runs without exceptions", sfx.bombOk && !sfx.err, JSON.stringify(sfx));
ok("playAchievement runs without exceptions", sfx.achOk && !sfx.err, JSON.stringify(sfx));

console.log("== 4. mute path still silences new sounds ==");
const mute = await page.evaluate(async () => {
  const m = await import("/src/audio/soundEngine.ts");
  const se = m.soundEngine;
  const before = se.getMuted();
  se.toggleMute(); // mute
  const wasMuted = se.getMuted();
  let err = null;
  try {
    se.playBombEcho();
    se.playAchievement();
    se.setIntensity(0.7);
  } catch (e) { err = String(e); }
  se.toggleMute(); // restore
  return { before, wasMuted, restored: !se.getMuted(), err };
});
ok("toggleMute flips state", !mute.before && mute.wasMuted && mute.restored, JSON.stringify(mute));
ok("new sounds are silent-safe while muted", mute.err === null, JSON.stringify(mute));

console.log("== 5. no page errors ==");
ok("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(`\nbatch4c: ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
