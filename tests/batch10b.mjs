// Batch 10 — Lane 2 (render) tests.
// (a) Pure sections run in plain node via jiti (TS sources imported directly).
//   node_modules/.bin/jiti tests/batch10b.mjs
// (b) Live section runs under Playwright against a dev server.
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch10b.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

import {
  RENDER_LAYERS,
  RENDER_LAYER_INDEX,
  ENGINE_LAYER_MAP,
  RenderLayerQueue,
  envLayerFlushOrder,
  PICKUP_POP_MS,
  pickupPopScale,
  maybePrunePickupPop,
  resetPickupPop,
  backEaseOut,
} from "../src/game/mapRenderer.ts";
import {
  MINIMAP_ZOMBIE_COLORS,
  MINIMAP_ZOMBIE_DEFAULT,
  MINIMAP_OBJECTIVE_COLORS,
  zombieDotColor,
  isBossType,
  worldToMinimap,
} from "../src/game/minimap.ts";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
function approx(a, b, eps, label) { ok(Math.abs(a - b) <= eps, `${label} (got ${a}, want ~${b})`); }

console.log("== 10b(a). render-layer registry ==");
eq(JSON.stringify(RENDER_LAYERS), JSON.stringify(["ground", "decals", "entities", "effects", "lighting", "ui"]),
  "RENDER_LAYERS is ground → decals → entities → effects → lighting → ui");
eq(Object.keys(RENDER_LAYER_INDEX).length, 6, "6 layer indices");
ok(RENDER_LAYER_INDEX.ground < RENDER_LAYER_INDEX.decals &&
   RENDER_LAYER_INDEX.decals < RENDER_LAYER_INDEX.entities &&
   RENDER_LAYER_INDEX.entities < RENDER_LAYER_INDEX.effects &&
   RENDER_LAYER_INDEX.effects < RENDER_LAYER_INDEX.lighting &&
   RENDER_LAYER_INDEX.lighting < RENDER_LAYER_INDEX.ui,
  "layer indices strictly increase in canonical order");

// Queue scrambled; flush must execute in canonical order, FIFO within a layer,
// skipping empty layers.
{
  const q = new RenderLayerQueue();
  const seen = [];
  const fakeCtx = {};
  q.queue("ui", () => seen.push("ui1"));
  q.queue("ground", () => seen.push("ground1"));
  q.queue("effects", () => seen.push("effects1"));
  q.queue("ground", () => seen.push("ground2"));
  q.queue("entities", () => seen.push("entities1"));
  q.queue("lighting", () => seen.push("lighting1"));
  q.queue("decals", () => seen.push("decals1"));
  q.flush(fakeCtx);
  eq(JSON.stringify(seen), JSON.stringify(["ground1", "ground2", "decals1", "entities1", "effects1", "lighting1", "ui1"]),
    "flush executes canonical order, FIFO within layer");
  eq(JSON.stringify(q.flushed), JSON.stringify(["ground", "decals", "entities", "effects", "lighting", "ui"]),
    "flushed records non-empty layers in execution order");
  // Buckets drain: a second flush with nothing queued records nothing.
  q.flush(fakeCtx);
  eq(q.flushed.length, 0, "buckets drain after flush");
}

// ENGINE_LAYER_MAP: every value is a real layer; key call sites present.
{
  const layers = new Set(RENDER_LAYERS);
  for (const [k, v] of Object.entries(ENGINE_LAYER_MAP)) {
    ok(layers.has(v), `ENGINE_LAYER_MAP[${k}] = ${v} is a valid layer`);
  }
  for (const k of ["renderEnvironment", "renderZombies", "renderPlayer", "renderGrit",
    "renderParticles", "renderLighting", "renderDarkness", "renderBanner", "paintFloaters",
    "renderCompass", "renderMinimap", "renderHurtDir", "renderEyeshine", "renderDeathFlash"]) {
    ok(k in ENGINE_LAYER_MAP, `ENGINE_LAYER_MAP covers ${k}`);
  }
}

console.log("== 10b(b). engine render() call sites respect layer order (static) ==");
{
  const src = fs.readFileSync(path.join(here, "../src/game/engine.ts"), "utf8");
  const start = src.indexOf("\n\trender() {");
  ok(start >= 0, "engine render() found");
  const after = src.slice(start + 1);
  const endM = after.match(/\n\t[A-Za-z_$][\w$]*\(/);
  ok(!!endM, "render() method end found");
  const body = endM ? after.slice(0, endM.index) : after;
  ok(body.includes("interactHint") && body.includes("renderBanner"), "render() body looks complete");

  const callRe = /\b(this\.lighting\.(?:renderLighting|renderDarkness)|render7\.celebration\.render(?:World|Screen)|this\.(render[A-Za-z]+|paintFloaters)|renderEnvironment|renderTelegraphs)\s*\(/g;
  const sites = [];
  let m;
  while ((m = callRe.exec(body)) !== null) {
    const raw = m[1];
    const key = raw.startsWith("this.lighting.") ? raw.slice("this.lighting.".length)
      : raw.startsWith("render7.celebration.") ? "celebration." + raw.slice("render7.celebration.".length)
      : raw.startsWith("this.") ? raw.slice("this.".length)
      : raw;
    sites.push({ key, index: m.index });
  }
  ok(sites.length > 20, `found ${sites.length} render call sites in render()`);
  const unmapped = sites.filter((s) => !(s.key in ENGINE_LAYER_MAP)).map((s) => s.key);
  eq(JSON.stringify([...new Set(unmapped)]), JSON.stringify([]),
    `every render() call site is mapped to a layer${unmapped.length ? ": " + unmapped.join(",") : ""}`);

  const first = (k) => sites.find((s) => s.key === k)?.index ?? -1;
  const last = (k) => { const r = sites.filter((s) => s.key === k).pop(); return r ? r.index : -1; };
  const before = (a, b, label) => {
    const ai = typeof a === "string" ? first(a) : a, bi = typeof b === "string" ? first(b) : b;
    ok(ai >= 0 && bi >= 0 && ai < bi, label);
  };
  // Ground/environment draws before everything else.
  ok(sites[0].key === "renderEnvironment", `renderEnvironment is the first draw call (got ${sites[0]?.key})`);
  // Pass-1 effects complete before the screen-space lighting pass.
  for (const fx of ["renderParticles", "renderShockwaves", "renderTelegraphs", "renderSlashBursts", "celebration.renderWorld"]) {
    ok(last(fx) < first("renderLighting"), `${fx} (pass 1) draws before renderLighting`);
  }
  // Lighting pass completes before entity pass 2.
  for (const l of ["renderLighting", "renderDarkness", "celebration.renderScreen"]) {
    ok(last(l) < first("renderZombies"), `${l} draws before renderZombies (pass 2)`);
  }
  // Entity pass 2: zombies under player, labels + banner on top, floaters last.
  before("renderZombies", "renderPlayer", "renderZombies before renderPlayer");
  before("renderGrit", "renderPlayer", "renderGrit before renderPlayer");
  ok(last("renderPlayer") < last("renderZombieLabels"), "renderPlayer before renderZombieLabels");
  ok(last("renderZombieLabels") < last("renderBanner"), "renderZombieLabels before renderBanner");
  ok(last("renderBanner") < last("paintFloaters"), "renderBanner before final paintFloaters");
  ok(last("renderVacuumDrops") < last("renderZombieLabels"), "renderVacuumDrops before renderZombieLabels");
  // Screen-space tail: world pass 2, then compass/minimap overlays, hurt
  // feedback, eyeshine, and the death flash topmost.
  ok(last("renderBanner") < first("renderCompass"), "world pass 2 before screen-space compass");
  before("renderHurtDir", "renderDeathFlash", "renderHurtDir before renderDeathFlash");
  ok(last("renderEyeshine") < first("renderDeathFlash"), "renderEyeshine before renderDeathFlash");
}

console.log("== 10b(c). pickup spawn-pop tween ==");
eq(PICKUP_POP_MS, 150, "PICKUP_POP_MS is 150ms");
approx(backEaseOut(0), 0, 1e-9, "backEaseOut(0) = 0");
approx(backEaseOut(1), 1, 1e-9, "backEaseOut(1) = 1");
{
  resetPickupPop();
  const t0 = 100000;
  approx(pickupPopScale("pz-a", t0), 0.1, 1e-9, "scale starts at 0.1 on birth");
  const mid = pickupPopScale("pz-a", t0 + 75);
  ok(mid > 0.1 && mid < 1.2, `mid-tween scale ${mid.toFixed(3)} is between birth and peak`);
  ok(mid > pickupPopScale("pz-a", t0 + 10), "tween increases over frames (not instant)");
  // Not instant: 10ms in is still far from done.
  ok(pickupPopScale("pz-b", t0 + 10) < 1, "10ms after birth the scale is still < 1");
  approx(pickupPopScale("pz-a", t0 + 150), 1, 1e-9, "scale reaches 1 at 150ms");
  eq(pickupPopScale("pz-a", t0 + 5000), 1, "scale stays 1 long after");
  // Monotonic ramp to the back-ease overshoot peak (~87ms), then it settles to 1.
  let prev = 0.1, bad = 0, peak = 0;
  for (let t = 0; t <= 80; t += 10) {
    const s = pickupPopScale("pz-c", t0 + t);
    if (s < prev - 1e-9) bad++;
    prev = s;
    peak = Math.max(peak, s);
  }
  eq(bad, 0, "scale ramps monotonically up to the overshoot peak");
  ok(peak > 1, `back-ease overshoots above 1 (peak ${peak.toFixed(3)})`);
  // Reset restarts the tween for a reused id.
  resetPickupPop();
  approx(pickupPopScale("pz-a", t0 + 99999), 0.1, 1e-9, "resetPickupPop restarts the tween");
  // Prune forgets dead ids (first call runs; throttle the second).
  resetPickupPop();
  pickupPopScale("live-1", t0);
  pickupPopScale("dead-1", t0);
  maybePrunePickupPop([{ id: "live-1" }]);
  approx(pickupPopScale("dead-1", t0 + 1), 0.1, 1e-9, "pruned id restarts (was forgotten)");
  ok(pickupPopScale("live-1", t0 + 1) > 0.1, "live id keeps its birth time");
}

console.log("== 10b(d). minimap pure helpers ==");
{
  const c = worldToMinimap(1000, 1000, 2000, 2000, 100);
  approx(c.x, 50, 1e-9, "square map center → minimap center x");
  approx(c.y, 50, 1e-9, "square map center → minimap center y");
  const tl = worldToMinimap(0, 0, 2000, 2000, 100);
  approx(tl.x, 0, 1e-9, "origin maps to origin");
  // Wide map: aspect-fit, vertically centered.
  const w = worldToMinimap(2000, 1000, 2000, 1000, 100);
  approx(w.x, 100, 1e-9, "wide map right edge → size");
  approx(w.y, 75, 1e-9, "wide map bottom edge → centered (75)");
  eq(zombieDotColor("sprinter"), "#f76b15", "sprinter dot color");
  eq(zombieDotColor("behemoth"), "#ff2e4d", "behemoth dot color");
  eq(zombieDotColor("mystery_type"), MINIMAP_ZOMBIE_DEFAULT, "unknown type → default dot color");
  ok(isBossType("behemoth"), "behemoth is a boss type");
  ok(!isBossType("shambler"), "shambler is not a boss type");
  ok(Object.keys(MINIMAP_ZOMBIE_COLORS).length >= 8, "color table covers the roster");
  ok(MINIMAP_OBJECTIVE_COLORS.hole && MINIMAP_OBJECTIVE_COLORS.shrine && MINIMAP_OBJECTIVE_COLORS.workbench,
    "objective colors for hole/shrine/workbench");
}

console.log("== 10b(e). naming audit (Pike County, Indiana only) ==");
{
  const files = [
    "../src/game/minimap.ts",
    "../src/components/game/Minimap.tsx",
    "../src/components/game/HUD.tsx",
    "../src/game/mapRenderer.ts",
    "../src/styles.css",
  ];
  const bad = /bayville|griggsville|illinois/i;
  for (const f of files) {
    const text = fs.readFileSync(path.join(here, f), "utf8");
    ok(!bad.test(text), `${f} has no Bayville/Griggsville/Illinois strings`);
  }
}

// ---- live (Playwright) ----
const PZ_URL = process.env.PZ_URL || "http://127.0.0.1:8082";
console.log("\n== live (Playwright) ==");
{
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: "/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(PZ_URL, { waitUntil: "networkidle" });

  const startBtn = page.getByText("Survival · this place");
  await startBtn.waitFor({ state: "visible", timeout: 15000 });
  await startBtn.click();
  await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 30000 });
  const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);

  // 1. Minimap canvas is mounted in the HUD corner.
  const mm = page.getByTestId("minimap-canvas");
  await mm.waitFor({ state: "visible", timeout: 5000 });
  ok(true, "minimap canvas visible in HUD");
  const box = await mm.boundingBox();
  ok(!!box && box.width >= 120 && box.x < 40 && box.y > 400,
    `minimap sits bottom-left (x=${Math.round(box?.x ?? -1)}, y=${Math.round(box?.y ?? -1)}, w=${Math.round(box?.width ?? -1)})`);

  // 2. Player dot: engine-state → minimap mapping + bright pixel at the dot.
  const frame1 = await page.evaluate(() => window.__minimapTest.frame());
  ok(!!frame1.player, "minimap frame has a player dot");
  ok(frame1.player.x >= 0 && frame1.player.x <= frame1.size &&
     frame1.player.y >= 0 && frame1.player.y <= frame1.size, "player dot inside minimap bounds");
  const px = await T("getX()"), py = await T("getY()");
  const world = await page.evaluate(() => window.__controlsTest.getWorld());
  const size = frame1.size;
  const s = size / Math.max(world.map.w, world.map.h);
  const ex = (size - world.map.w * s) / 2 + world.x * s;
  const ey = (size - world.map.h * s) / 2 + world.y * s;
  ok(Math.abs(frame1.player.x - ex) < 2 && Math.abs(frame1.player.y - ey) < 2,
    `player dot matches probe position (dot ${frame1.player.x.toFixed(1)},${frame1.player.y.toFixed(1)} vs expected ${ex.toFixed(1)},${ey.toFixed(1)})`);
  const bright = await page.evaluate(({ x, y }) => {
    const c = document.querySelector('[data-testid="minimap-canvas"]');
    const g = c.getContext("2d");
    const d = g.getImageData(Math.max(0, x - 8), Math.max(0, y - 8), 16, 16).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) n++;
    return n;
  }, { x: frame1.player.x, y: frame1.player.y });
  ok(bright > 0, `player dot paints bright pixels (${bright})`);

  // 3. Zombie dots: spawn 3 shamblers, dots appear color-coded by type.
  // NOTE: the live game auto-fires, so force a minimap render in the same
  // tick as the spawn — waiting lets the player kill them (timing flake).
  await page.evaluate(([x, y]) => {
    const ct = window.__controlsTest;
    ct.spawn("shambler", x + 150, y);
    ct.spawn("sprinter", x - 150, y + 60);
    ct.spawn("shambler", x, y - 150);
    window.__minimapTest.render();
  }, [px, py]);
  const frame2 = await page.evaluate(() => window.__minimapTest.frame());
  ok(frame2.zombies >= 3, `minimap shows ${frame2.zombies} zombie dots (>= 3 spawned)`);
  const reds = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="minimap-canvas"]');
    const g = c.getContext("2d");
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 130 && d[i + 2] < 130) n++;
    return n;
  });
  ok(reds > 0, `zombie dots paint red pixels (${reds})`);

  // 4. Objective / hole markers.
  const objs = await page.evaluate(() => window.__controlsTest.objectives9());
  ok(objs.length > 0, `objectives9 reports ${objs.length} objectives`);
  const frame3 = await page.evaluate(() => window.__minimapTest.frame());
  ok(frame3.objectives > 0, `minimap draws ${frame3.objectives} objective markers`);

  // 5. Boss icon.
  await page.evaluate(([x, y]) => { window.__controlsTest.spawn("behemoth", x + 220, y + 40); }, [px, py]);
  await page.waitForTimeout(600);
  const frame4 = await page.evaluate(() => window.__minimapTest.frame());
  ok(frame4.bosses >= 1, "minimap draws a boss icon for the behemoth");
  // (No killOne cleanup: Lane 1's in-progress addCorpse breaks that probe.)

  // 6. Layer queue: environment flushes ground → decals → entities.
  const order = await T("envLayerOrder()");
  eq(JSON.stringify(order), JSON.stringify(["ground", "decals", "entities"]),
    `renderEnvironment flushes layers in order (got ${JSON.stringify(order)})`);

  // 7. Tween probe on the live bundle: 0.1 → 1 over 150ms, not instant.
  const tw = await page.evaluate(() => {
    const ct = window.__controlsTest;
    ct.pickupPopReset();
    const a = ct.pickupPopScale("b10live", 9000);
    const b = ct.pickupPopScale("b10live", 9075);
    const c = ct.pickupPopScale("b10live", 9100);
    const d = ct.pickupPopScale("b10live", 9200);
    return { a, b, c, d };
  });
  approx(tw.a, 0.1, 1e-9, "live tween starts at 0.1");
  ok(tw.b > 0.1 && tw.b < 1.2, `live tween mid-scale ${tw.b.toFixed(3)} animates (not instant)`);
  ok(tw.c > 1, `live tween overshoots past 1 mid-flight (back-ease, got ${tw.c.toFixed(3)})`);
  approx(tw.d, 1, 1e-9, "live tween settles at 1");

  // 8. HUD pickup pop-in keyframes exist.
  const hasPop = await page.evaluate(() => {
    for (const sh of document.styleSheets) {
      try {
        for (const r of sh.cssRules) {
          if (r.type === CSSRule.KEYFRAMES_RULE && r.name === "pickup-pop") return true;
        }
      } catch { /* cross-origin sheet */ }
    }
    return false;
  });
  ok(hasPop, "pickup-pop keyframes present for HUD badges");

  // Lane 1's in-progress corpseDecals work throws on start (cross-lane, not
  // this lane's files); everything else must be error-free.
  const crossLane = errors.filter((e) => e.includes("corpseDecals"));
  const myErrors = errors.filter((e) => !e.includes("corpseDecals"));
  ok(myErrors.length === 0, `no page errors from this lane${myErrors.length ? ": " + myErrors.join(" | ") : ""}`);
  console.log(`  (note: ${crossLane.length} cross-lane 'corpseDecals' page error(s) ignored)`);
  await browser.close();
}

console.log(`\nbatch10b: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
