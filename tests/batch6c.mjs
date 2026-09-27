// Batch 6 Lane C (audio): deterministic LCG noise buffer, weapon-kind-aware
// shots, minor-arp step sequencer. Drives the soundEngine singleton directly
// via page.evaluate dynamic import (Vite dev serves /src/audio/soundEngine.ts
// as the same module the game imports).
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

console.log("== batch6c setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const SE = `const m = await import("/src/audio/soundEngine.ts"); const se = m.soundEngine;`;

console.log("== 1. noise buffer is cached (same object), seeded 7777, ~0.4s ==");
const nz = await page.evaluate(async () => {
  const m = await import("/src/audio/soundEngine.ts");
  const se = m.soundEngine;
  se.init();
  const b = se.__test.noiseBuffer();
  const same = b === se.__test.noiseBuffer();
  const r = se.__test.regenNoise();
  const n = 512;
  let maxDiff = 0;
  const bd = b.getChannelData(0), rd = r.getChannelData(0);
  for (let i = 0; i < n; i++) maxDiff = Math.max(maxDiff, Math.abs(bd[i] - rd[i]));
  return {
    same,
    maxDiff,
    len: b.length,
    lenR: r.length,
    dur: b.duration,
    seed: se.__test.noiseSeed(),
    expectLen: Math.floor(se.__test.sampleRate() * 0.4),
  };
});
ok("noise buffer cached: same object across calls", nz.same === true, JSON.stringify(nz.same));
ok("seed is 7777", nz.seed === 7777, `seed=${nz.seed}`);
ok("buffer is ~0.4s", Math.abs(nz.dur - 0.4) < 0.01 && nz.len === nz.expectLen, JSON.stringify({ dur: nz.dur, len: nz.len, expectLen: nz.expectLen }));
ok("regenNoise() rebuilds an identical buffer (deterministic LCG)", nz.maxDiff === 0 && nz.len === nz.lenR, `maxDiff=${nz.maxDiff} len=${nz.len} lenR=${nz.lenR}`);

console.log("== 2. shot layers differ by kind; kind detection works ==");
const shots = await page.evaluate(async () => {
  const m = await import("/src/audio/soundEngine.ts");
  const se = m.soundEngine;
  // Retry past the 24ms shared SFX gate so each kind registers exactly once.
  const fire = async (kind, opts) => {
    for (let i = 0; i < 10; i++) {
      se.playShotFor(kind, opts);
      const ls = se.__test.lastShot();
      if (ls.kind === kind) return ls.layers.join("+");
      await new Promise((r) => setTimeout(r, 35));
    }
    return se.__test.lastShot().layers.join("+");
  };
  const kinds = ["blunt", "axe", "thrust", "heavy-blade", "firearm", "chain"];
  const recipes = {};
  for (const k of kinds) recipes[k] = await fire(k, k === "firearm" ? { soundType: "rifle" } : undefined);
  return {
    recipes,
    detect: {
      chainsaw: se.__test.shotKind("chainsaw"),
      crossbow: se.__test.shotKind("crossbow"),
      magnum: se.__test.shotKind("magnum"),
      rifle: se.__test.shotKind("rifle"),
      axeName: se.__test.shotKindForName("Fire Axe"),
      bluntName: se.__test.shotKindForName("Crowbar"),
      bladeName: se.__test.shotKindForName("Machete"),
      chainName: se.__test.shotKindForName("Chainsaw Mill"),
      unknown: se.__test.shotKind(""),
    },
  };
});
const recipeVals = Object.values(shots.recipes);
ok("all 6 kinds have distinct layer recipes", new Set(recipeVals).size === 6, JSON.stringify(shots.recipes));
ok("chain recipe is rip+rattle (not crossbow twang)", shots.recipes.chain.includes("chain:rip") && shots.recipes.chain.includes("chain:rattle"), shots.recipes.chain);
ok("thrust recipe is twang+whoosh", shots.recipes.thrust.includes("thrust:twang") && shots.recipes.thrust.includes("thrust:whoosh"), shots.recipes.thrust);
ok("firearm recipe routes through the rifle recipe", shots.recipes.firearm === "firearm+rifle", shots.recipes.firearm);
ok("soundType detection: chainsaw->chain, crossbow->thrust, magnum/rifle->firearm",
  shots.detect.chainsaw === "chain" && shots.detect.crossbow === "thrust" &&
  shots.detect.magnum === "firearm" && shots.detect.rifle === "firearm", JSON.stringify(shots.detect));
ok("name detection: axe/blunt/heavy-blade/chain",
  shots.detect.axeName === "axe" && shots.detect.bluntName === "blunt" &&
  shots.detect.bladeName === "heavy-blade" && shots.detect.chainName === "chain", JSON.stringify(shots.detect));
ok("unknown weapon falls back to firearm", shots.detect.unknown === "firearm", shots.detect.unknown);

console.log("== 3. sequencer advances, bass pedal every 4 steps, intensity responds ==");
const seq = await page.evaluate(async () => {
  const m = await import("/src/audio/soundEngine.ts");
  const se = m.soundEngine;
  const out = {};
  se.startSequencer();
  out.runningAfterStart = se.__test.seqState().running;
  await new Promise((r) => setTimeout(r, 500)); // ~2-3 steps at 180ms
  const s1 = se.__test.seqState();
  out.stepAdvanced = s1.step >= 2;
  out.chordMath = s1.chord === Math.floor(s1.step / 12) % 4;
  out.stepMs = s1.stepMs;
  // Deterministic manual advance with the timer stopped.
  se.stopSequencer();
  out.stopped = se.__test.seqState().running === false;
  const before = se.__test.seqState().step;
  se.__test.seqAdvance();
  se.__test.seqAdvance();
  const after = se.__test.seqState().step;
  out.manualAdvance = after === before + 2;
  // Bass pedal: advance 5 more steps, bass notes land on steps divisible by 4.
  const n0 = se.__test.seqNotes().length;
  const step0 = se.__test.seqState().step;
  for (let i = 0; i < 5; i++) se.__test.seqAdvance();
  const fresh = se.__test.seqNotes().slice(n0);
  const bass = fresh.filter((n) => n.kind === "bass");
  out.bassEvery4 = bass.length >= 1 && bass.every((n) => n.step % 4 === 0);
  out.bassFreqs = bass.map((n) => Math.round(n.freq * 100) / 100);
  // Arp freqs follow the i–VI–III–VII roots (Am: A2=110 at step 0 of chord 0).
  const arp = fresh.filter((n) => n.kind === "arp");
  out.arpNotes = arp.length > 0;
  // Intensity response: dense flag + gain path.
  se.setIntensity(0.9);
  out.denseAtHigh = se.__test.seqState().dense === true;
  se.setIntensity(0.2);
  out.sparseAtLow = se.__test.seqState().dense === false;
  se.setIntensity(0); // restore
  se.stopSequencer();
  return out;
});
ok("sequencer starts and advances steps on its timer", seq.runningAfterStart === true && seq.stepAdvanced === true, JSON.stringify({ running: seq.runningAfterStart, advanced: seq.stepAdvanced }));
ok("step interval is ~180ms", seq.stepMs === 180, `stepMs=${seq.stepMs}`);
ok("chord follows floor(step/12)%4 (i-VI-III-VII cycle)", seq.chordMath === true, `chordMath=${seq.chordMath}`);
ok("manual seqAdvance() steps deterministically with timer stopped", seq.manualAdvance === true && seq.stopped === true, JSON.stringify({ manual: seq.manualAdvance, stopped: seq.stopped }));
ok("bass pedal lands every 4 steps", seq.bassEvery4 === true, JSON.stringify(seq.bassFreqs));
ok("bass freqs are chord roots an octave down", seq.bassFreqs.every((f) => [55, 43.66, 65.41, 49].some((r) => Math.abs(f - r) < 0.05)), JSON.stringify(seq.bassFreqs));
ok("arp notes are emitted", seq.arpNotes === true, `arpNotes=${seq.arpNotes}`);
ok("intensity drives density: dense at 0.9, sparse at 0.2", seq.denseAtHigh === true && seq.sparseAtLow === true, JSON.stringify({ denseAtHigh: seq.denseAtHigh, sparseAtLow: seq.sparseAtLow }));

console.log("== 4. no page errors ==");
ok("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(`\nbatch6c: ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
