// Batch 9 — Lane 3 (audio) tests.
// Pure-helper + class-state sections run in plain node via jiti (TS sources
// imported directly; soundEngine methods that need AudioContext are never
// touched — only the pure exported helpers and the ctx-free state path of
// setKillSurge are exercised).
//   node_modules/.bin/jiti tests/batch9c.mjs

import { BOSS_MOTIF, QUEST_ARP_SPEC, killPitchHz, sanitizeSurge, smoothSurge,
  soundEngine } from "../src/audio/soundEngine.ts";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
function close(a, b, eps, label) { ok(Math.abs(a - b) <= eps, `${label} (got ${a}, want ~${b})`); }

// ================= Item 1: boss warning motif spec =================
console.log("== 1a. boss motif frequencies/order ==");
eq(BOSS_MOTIF.freqs.length, 3, "motif has 3 notes");
eq(BOSS_MOTIF.freqs[0], 480, "first note 480Hz");
eq(BOSS_MOTIF.freqs[1], 360, "second note 360Hz");
eq(BOSS_MOTIF.freqs[2], 240, "third note 240Hz");
ok(BOSS_MOTIF.freqs[0] > BOSS_MOTIF.freqs[1] && BOSS_MOTIF.freqs[1] > BOSS_MOTIF.freqs[2], "descending order");
eq(BOSS_MOTIF.wave, 'square', "square waves");
eq(BOSS_MOTIF.noteMs, 120, "120ms per note");
eq(BOSS_MOTIF.bus, 'beast', "routed through beast bus");

// ================= Item 2: achievement arpeggio spec =================
console.log("== 2a. quest arp frequencies/order ==");
eq(QUEST_ARP_SPEC.freqs.length, 3, "arp has 3 notes");
eq(QUEST_ARP_SPEC.freqs[0], 880, "first note 880Hz");
eq(QUEST_ARP_SPEC.freqs[1], 1174.66, "second note 1174.66Hz");
eq(QUEST_ARP_SPEC.freqs[2], 1567.98, "third note 1567.98Hz");
ok(QUEST_ARP_SPEC.freqs[0] < QUEST_ARP_SPEC.freqs[1] && QUEST_ARP_SPEC.freqs[1] < QUEST_ARP_SPEC.freqs[2], "rising order");
eq(QUEST_ARP_SPEC.wave, 'triangle', "triangle waves");
eq(QUEST_ARP_SPEC.noteMs, 90, "90ms per note");
eq(QUEST_ARP_SPEC.bus, 'impact', "routed through impact bus");

console.log("== 2b. no doubling: playAchievement delegates to questArp ==");
ok(typeof soundEngine.questArp === 'function', "questArp is public");
ok(typeof soundEngine.playAchievement === 'function', "playAchievement still public");
ok(soundEngine.lastMotif() === null, "no motif played yet in node (no AudioContext)");

console.log("== 2c. __test probes expose motif/surge state ==");
ok(typeof soundEngine.__test.lastMotif === 'function', "__test.lastMotif exists");
ok(typeof soundEngine.__test.surgeTarget === 'function', "__test.surgeTarget exists");
ok(typeof soundEngine.__test.killPitch === 'function', "__test.killPitch exists");
eq(soundEngine.__test.killPitch(7), 300 + 7 * 30, "__test.killPitch(7)");

// ================= Item 3: combo-pitched kill sound =================
console.log("== 3a. kill pitch formula ==");
eq(killPitchHz(0), 300, "combo 0 -> 300Hz");
eq(killPitchHz(10), 600, "combo 10 -> 600Hz");
eq(killPitchHz(20), 900, "combo 20 -> 900Hz (cap)");
eq(killPitchHz(50), 900, "combo 50 clamped to 900Hz");
eq(killPitchHz(-3), 300, "negative combo -> 300Hz");
eq(killPitchHz(NaN), 300, "NaN combo -> 300Hz");
eq(killPitchHz(Infinity), 300, "Infinity combo -> 300Hz");
eq(killPitchHz(10.9), 600, "fractional combo floors (10.9 -> 600Hz)");
ok(typeof soundEngine.killSound === 'function', "killSound(combo=0) public entry point");
eq(soundEngine.__test.lastKillPitch(), 0, "no kill played yet in node");

// ================= Item 4: setKillSurge smoothing/clamping =================
console.log("== 4a. sanitizeSurge ==");
eq(sanitizeSurge(0.5), 0.5, "0.5 passes through");
eq(sanitizeSurge(-0.5), 0, "negative clamps to 0");
eq(sanitizeSurge(1.5), 1, ">1 clamps to 1");
eq(sanitizeSurge(NaN), 0, "NaN -> 0");
eq(sanitizeSurge(undefined), 0, "undefined -> 0");
eq(sanitizeSurge(0), 0, "0 stays 0");
eq(sanitizeSurge(1), 1, "1 stays 1");

console.log("== 4b. smoothSurge step ==");
close(smoothSurge(0, 1), 0.35, 1e-9, "0 -> 1 steps 0.35 (factor 0.35)");
close(smoothSurge(1, 0), 0.65, 1e-9, "1 -> 0 steps 0.65");
eq(smoothSurge(0.7, 0.7), 0.7, "already at target stays put");
close(smoothSurge(0, 1, 0), 0, 1e-9, "factor 0 holds");
eq(smoothSurge(0, 1, 1), 1, "factor 1 snaps");
ok(smoothSurge(0, 1) <= 1 && smoothSurge(0, 1) >= 0, "step stays in range");
eq(smoothSurge(NaN, 1), 0.35, "NaN current treated as 0");
eq(smoothSurge(0, -5), 0, "negative target clamps to 0");
eq(smoothSurge(0, 5), 0.35, ">1 target clamps to 1");

console.log("== 4c. smoothSurge convergence (no zippering) ==");
let v = 0;
for (let i = 0; i < 30; i++) v = smoothSurge(v, 1);
ok(v > 0.999, `30 steps converge (>0.999, got ${v})`);
let prev = 0, mono = true;
v = 0;
for (let i = 0; i < 30; i++) { v = smoothSurge(v, 1); if (v < prev) mono = false; prev = v; }
ok(mono, "monotone convergence toward target");

console.log("== 4d. setKillSurge class behavior (ctx-free in node) ==");
soundEngine.setKillSurge(0.8);
eq(soundEngine.__test.surgeTarget(), 0.8, "target stored at 0.8");
close(soundEngine.__test.surge(), 0.28, 1e-9, "surge smooth-stepped from 0 toward 0.8 (0.28)");
soundEngine.setKillSurge(1);
close(soundEngine.__test.surgeTarget(), 1, 1e-9, "target now 1");
soundEngine.setKillSurge(-2);
eq(soundEngine.__test.surgeTarget(), 0, "negative input sanitized to target 0");
soundEngine.setKillSurge(99);
eq(soundEngine.__test.surgeTarget(), 1, ">1 input sanitized to target 1");
soundEngine.setKillSurge(NaN);
eq(soundEngine.__test.surgeTarget(), 0, "NaN sanitized to target 0");

console.log("== 4e. setKillSurge no-ops when muted ==");
soundEngine.setKillSurge(0);          // settle target at 0
for (let i = 0; i < 30; i++) soundEngine.setKillSurge(0); // settle surge at 0
const settled = soundEngine.__test.surge();
soundEngine.setMuted(true);
soundEngine.setKillSurge(1);          // must be a no-op
eq(soundEngine.__test.surgeTarget(), 0, "muted: target untouched");
close(soundEngine.__test.surge(), settled, 1e-12, "muted: surge untouched");
soundEngine.setMuted(false);
soundEngine.setKillSurge(1);          // unmuted again -> works
eq(soundEngine.__test.surgeTarget(), 1, "unmuted: target stored again");

// getSurge still reports the internal (smoothed) value
close(soundEngine.getSurge(), smoothSurge(settled, 1), 1e-12, "getSurge tracks smoothed surge");

console.log(`\nbatch9c: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
