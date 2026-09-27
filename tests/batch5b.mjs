// Batch 5 Lane B (audio): combo-pitched kill, low-HP heartbeat, 24ms event
// throttle, kill-surge + growl layer, music/SFX split + clean mute.
// Drives the soundEngine singleton directly via page.evaluate dynamic import
// (Vite dev serves /src/audio/soundEngine.ts as the same module the game imports).
import { chromium } from "playwright-core";

const URL = process.env.PZ_URL || "http://127.0.0.1:8092";
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

console.log("== batch5b setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const SE = `const m = await import("/src/audio/soundEngine.ts"); const se = m.soundEngine;`;

console.log("== 1. combo-pitched kill sound rises with streak ==");
const pitches = await page.evaluate(async () => {
  const m = await import("/src/audio/soundEngine.ts");
  const se = m.soundEngine;
  const out = [];
  se.playKillPitched(0);
  out.push(se.__test.lastKillPitch());
  await new Promise((r) => setTimeout(r, 40));
  se.playKillPitched(10);
  out.push(se.__test.lastKillPitch());
  await new Promise((r) => setTimeout(r, 40));
  se.playKillPitched(20);
  out.push(se.__test.lastKillPitch());
  await new Promise((r) => setTimeout(r, 40));
  se.playKillPitched(99); // capped at combo 20
  out.push(se.__test.lastKillPitch());
  return out;
});
ok("combo 0 -> 300Hz", pitches[0] === 300, JSON.stringify(pitches));
ok("combo 10 -> 600Hz", pitches[1] === 600, JSON.stringify(pitches));
ok("combo 20 -> 900Hz", pitches[2] === 900, JSON.stringify(pitches));
ok("combo 99 capped at 900Hz", pitches[3] === 900, JSON.stringify(pitches));
ok("pitch rises monotonically", pitches[0] < pitches[1] && pitches[1] < pitches[2], JSON.stringify(pitches));

console.log("== 2. low-HP heartbeat starts/stops at 30% threshold ==");
const hb = await page.evaluate(async () => {
  const m = await import("/src/audio/soundEngine.ts");
  const se = m.soundEngine;
  const out = [];
  se.updateHeartbeat(0.2);   // critical -> on
  out.push(se.__test.heartbeatOn());
  se.updateHeartbeat(0.29);  // still critical -> on
  out.push(se.__test.heartbeatOn());
  se.updateHeartbeat(0.3);   // at threshold -> off
  out.push(se.__test.heartbeatOn());
  se.updateHeartbeat(0.95);  // healthy -> off
  out.push(se.__test.heartbeatOn());
  se.setHeartbeat(true);
  const forced = se.__test.heartbeatOn();
  se.setHeartbeat(false);    // cleanup: no orphan timer
  out.push(forced, se.__test.heartbeatOn());
  return out;
});
ok("heartbeat on below 30% HP", hb[0] === true && hb[1] === true, JSON.stringify(hb));
ok("heartbeat off at/above 30% HP", hb[2] === false && hb[3] === false, JSON.stringify(hb));
ok("setHeartbeat(true/false) toggles the timer", hb[4] === true && hb[5] === false, JSON.stringify(hb));

console.log("== 3. 24ms throttle drops rapid duplicates, player-hurt always passes ==");
const thr = await page.evaluate(async () => {
  const m = await import("/src/audio/soundEngine.ts");
  const se = m.soundEngine;
  const base = se.__test.throttleState();
  se.playGunshot("carbine");
  se.playGunshot("carbine"); // stacked inside 24ms -> dropped
  const afterDup = se.__test.throttleState();
  const base2 = se.__test.throttleState();
  se.playPlayerHurt();
  se.playPlayerHurt();       // hurt always passes
  const afterHurt = se.__test.throttleState();
  return {
    firedDup: afterDup.fired - base.fired,
    droppedDup: afterDup.dropped - base.dropped,
    firedHurt: afterHurt.fired - base2.fired,
    droppedHurt: afterHurt.dropped - base2.dropped,
  };
});
ok("rapid duplicate gunshots: 1 fired", thr.firedDup === 1, JSON.stringify(thr));
ok("rapid duplicate gunshots: 1 dropped", thr.droppedDup === 1, JSON.stringify(thr));
ok("player-hurt x2: both fired", thr.firedHurt === 2, JSON.stringify(thr));
ok("player-hurt x2: none dropped", thr.droppedHurt === 0, JSON.stringify(thr));

await page.waitForTimeout(60); // let the 24ms gate window expire
const thr2 = await page.evaluate(async () => {
  const m = await import("/src/audio/soundEngine.ts");
  const se = m.soundEngine;
  const base = se.__test.throttleState();
  se.playGunshot("rifle");
  const after = se.__test.throttleState();
  return { fired: after.fired - base.fired, dropped: after.dropped - base.dropped };
});
ok("gunshot passes after the gate window expires", thr2.fired === 1 && thr2.dropped === 0, JSON.stringify(thr2));

console.log("== 4. kill surge rises +0.18/kill and decays; growl mix scales ==");
const surge = await page.evaluate(async () => {
  const m = await import("/src/audio/soundEngine.ts");
  const se = m.soundEngine;
  se.bumpSurge();
  se.bumpSurge();
  se.bumpSurge();
  const s1 = se.getSurge();
  const mix1 = se.__test.growlMix();
  se.setBeastMix(1, 10); // damage + streak should raise the mix
  const mix2 = se.__test.growlMix();
  return { s1, mix1, mix2 };
});
ok("3 bumps -> surge 0.54", Math.abs(surge.s1 - 0.54) < 0.001, JSON.stringify(surge));
ok("growl mix tracks surge (0.54*0.7=0.378)", Math.abs(surge.mix1 - 0.378) < 0.01, JSON.stringify(surge));
ok("damage+streak raises the growl mix", surge.mix2 - surge.mix1 > 0.2, JSON.stringify(surge));

await page.waitForTimeout(1500); // surge decays 0.15/sec
const decayed = await page.evaluate(async () => {
  const m = await import("/src/audio/soundEngine.ts");
  const se = m.soundEngine;
  return se.getSurge();
});
ok("surge decays over time", decayed < 0.5 && decayed > 0.05, `surge=${decayed}`);

console.log("== 5. music/SFX split + clean mute restores volumes ==");
const mute = await page.evaluate(async () => {
  const m = await import("/src/audio/soundEngine.ts");
  const se = m.soundEngine;
  se.setSfxVolume(0.5);
  se.setMusicVolume(0.6);
  const before = se.__test.gains();
  se.setMuted(true);
  const muted = se.__test.gains();
  se.setMuted(false);
  const restored = se.__test.gains();
  const tm = se.toggleMute(); // compat: toggleMute still flips
  const tmMuted = se.getMuted();
  se.toggleMute();
  // restore defaults for the running game
  se.setSfxVolume(0.9);
  se.setMusicVolume(0.35);
  return { before, muted, restored, tm, tmMuted, tmRestored: !se.getMuted() };
});
ok("split volumes settable", Math.abs(mute.before.sfx - 0.5) < 1e-6 && Math.abs(mute.before.music - 0.6) < 1e-6, JSON.stringify(mute.before));
ok("mute zeroes master only", mute.muted.master === 0 && Math.abs(mute.muted.sfx - 0.5) < 1e-6 && Math.abs(mute.muted.music - 0.6) < 1e-6, JSON.stringify(mute.muted));
ok("unmute restores master + keeps split volumes", Math.abs(mute.restored.master - 0.8) < 1e-6 && Math.abs(mute.restored.sfx - 0.5) < 1e-6 && Math.abs(mute.restored.music - 0.6) < 1e-6, JSON.stringify(mute.restored));
ok("toggleMute compat", mute.tm === true && mute.tmMuted === true && mute.tmRestored === true, JSON.stringify({ tm: mute.tm, tmMuted: mute.tmMuted }));

console.log("== 6. no page errors ==");
ok("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(`\nbatch5b: ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
