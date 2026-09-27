import { chromium } from "playwright-core";

// Lane B (visual/render) — Batch 6: tiled ground textures, parallax ground
// layers, blob shadows, per-map/per-event ambient lighting, per-instance
// damage flash + hue jitter.
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

console.log("== batch6b setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
await page.waitForFunction(() => window.__pzVisual && window.__pzLightingTest, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("toBreak()");

const MAPS = ["white_oak_springs", "mccords_ford", "stendal_backbone", "petersburg_square", "winslow_still", "honey_springs"];
// production ground colors (what renderEnvironment passes into tileFor)
const GROUNDS = {
  white_oak_springs: "#1a1d16", mccords_ford: "#161914", stendal_backbone: "#141816",
  petersburg_square: "#1a1816", winslow_still: "#1b1812", honey_springs: "#17160f",
};

console.log("== 1. tiled ground textures ==");
const tl = await page.evaluate(([MAPS, GROUNDS]) => {
  const V = window.__pzVisual;
  const out = {};
  for (const id of MAPS) {
    const c = V.tileFor(id, GROUNDS[id]);
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let r = 0, g = 0, b = 0, dark = 0;
    const n = d.length / 4, step = 4 * 4;
    for (let i = 0; i < d.length; i += step) {
      r += d[i]; g += d[i + 1]; b += d[i + 2];
      if (d[i] + d[i + 1] + d[i + 2] < 40) dark++;
    }
    const m = d.length / step;
    out[id] = { w: c.width, h: c.height, r: r / m, g: g / m, b: b / m, nearBlack: dark / m };
  }
  // cache identity
  const a = V.tileFor("white_oak_springs", GROUNDS.white_oak_springs);
  const b2 = V.tileFor("white_oak_springs", GROUNDS.white_oak_springs);
  // plate picks up the tile pattern
  const loc = { id: "test_map_b6", mapWidth: 400, mapHeight: 400, ground: "#1a1d16", trail: "#2a241c", spawn: { x: 0, y: 0 }, workbench: { x: 0, y: 0 }, obstacles: [] };
  const plate = V.plateFor(loc);
  const tile = V.tileFor("test_map_b6", "#1a1d16");
  const pd = plate.getContext("2d").getImageData(300, 300, 40, 40).data;
  const td = tile.getContext("2d").getImageData(0, 0, 256, 256).data;
  let pr = 0, pg = 0, pb = 0, tr = 0, tg = 0, tb = 0;
  for (let i = 0; i < pd.length; i += 16) { pr += pd[i]; pg += pd[i + 1]; pb += pd[i + 2]; }
  for (let i = 0; i < td.length; i += 64) { tr += td[i]; tg += td[i + 1]; tb += td[i + 2]; }
  const pm = pd.length / 16, tm = td.length / 64;
  return {
    out, cached: a === b2,
    plateMatch: Math.abs(pr / pm - tr / tm) + Math.abs(pg / pm - tg / tm) + Math.abs(pb / pm - tb / tm),
  };
}, [MAPS, GROUNDS]);
const avgs = MAPS.map((id) => [tl.out[id].r, tl.out[id].g, tl.out[id].b]);
let distinct = true;
for (let i = 0; i < avgs.length; i++) for (let j = i + 1; j < avgs.length; j++) {
  const d = Math.hypot(avgs[i][0] - avgs[j][0], avgs[i][1] - avgs[j][1], avgs[i][2] - avgs[j][2]);
  if (d < 3) distinct = false;
}
ok("all 6 maps bake distinct ground tiles", distinct, JSON.stringify(MAPS.map((id) => ({ id, r: +tl.out[id].r.toFixed(1), g: +tl.out[id].g.toFixed(1), b: +tl.out[id].b.toFixed(1) }))));
ok("tiles are 256x256", MAPS.every((id) => tl.out[id].w === 256 && tl.out[id].h === 256));
ok("tile baker caches per map id", tl.cached === true);
ok("Still-Yard concrete carries more near-black oil than Springs grass", tl.out.winslow_still.nearBlack > tl.out.white_oak_springs.nearBlack,
  JSON.stringify({ still: +tl.out.winslow_still.nearBlack.toFixed(4), springs: +tl.out.white_oak_springs.nearBlack.toFixed(4) }));
ok("map plate reuses the baked tile pattern", tl.plateMatch < 30, `drift=${tl.plateMatch.toFixed(1)}`);

console.log("== 2. parallax ground layers ==");
const px = await page.evaluate(() => {
  const V = window.__pzVisual;
  const layers = V.parallaxFor("white_oak_springs");
  const fd = layers.far.getContext("2d").getImageData(0, 0, layers.far.width, layers.far.height).data;
  let minA = 255, maxA = 0;
  for (let i = 3; i < fd.length; i += 64) { const a = fd[i]; if (a < minA) minA = a; if (a > maxA) maxA = a; }
  // structural rate check: record where each tile lands for a known viewport,
  // and the translate offsets that produce the parallax lag.
  const c = document.createElement("canvas");
  c.width = 640; c.height = 360;
  const g = c.getContext("2d");
  const calls = [];
  const translates = [];
  const orig = g.drawImage.bind(g);
  const origT = g.translate.bind(g);
  g.drawImage = (...args) => { calls.push({ w: args[0].width, h: args[0].height, x: args[1], y: args[2] }); return orig(...args); };
  g.translate = (x, y) => { translates.push([x, y]); return origT(x, y); };
  V.renderParallax(g, { id: "white_oak_springs" }, { x: 100, y: 50, width: 640, height: 360 });
  const farCalls = calls.filter((k) => k.h === 144);
  const nearCalls = calls.filter((k) => k.h === 256);
  const farX = [...new Set(farCalls.map((k) => k.x))].sort((a, b) => a - b);
  return {
    alphaSpread: maxA - minA,
    farCount: farCalls.length, nearCount: nearCalls.length,
    translates,
    farX0: farX[0], farX1: farX[1],
  };
});
ok("parallax layers bake with real content", px.alphaSpread > 40, `alphaSpread=${px.alphaSpread}`);
ok("far treeline band drawn", px.farCount >= 2, `far=${px.farCount}`);
ok("near haze layer drawn", px.nearCount >= 4, `near=${px.nearCount}`);
ok("far band lags the camera (0.86 rate)", px.translates.length >= 1 && Math.abs(px.translates[0][0] - 14) < 0.01 && Math.abs(px.translates[0][1] - 27.5) < 0.01,
  `t=${JSON.stringify(px.translates[0])}`);
ok("near layer scrolls at its own rate (0.94)", px.translates.length >= 2 && Math.abs(px.translates[1][0] - 6) < 0.01 && Math.abs(px.translates[1][1] - 22.5) < 0.01,
  `t=${JSON.stringify(px.translates[1])}`);
ok("far band tiles seamlessly on 512px grid", px.farX0 === 0 && px.farX1 === 512, `xs=${px.farX0},${px.farX1}`);

console.log("== 3. blob shadows ==");
const sh = await page.evaluate(() => {
  const V = window.__pzVisual;
  const c = document.createElement("canvas");
  c.width = 120; c.height = 120;
  const g = c.getContext("2d");
  g.fillStyle = "#1a1d16"; g.fillRect(0, 0, 120, 120);
  const before = g.getImageData(60, 60, 1, 1).data;
  V.drawBlobShadow(g, 60, 60, 30, 0.4);
  const center = g.getImageData(60, 60, 1, 1).data;
  const edge = g.getImageData(60 + 26, 60, 1, 1).data;
  const corner = g.getImageData(8, 8, 1, 1).data;
  const sum = (p) => p[0] + p[1] + p[2];
  // integration: renderEnvironment draws the 96x96 blob sprite under drops (pickups)
  const realNow = Date.now;
  Date.now = () => 1000000;
  let shadowCalls = [];
  try {
    const loc = { id: "test_map_b6c", mapWidth: 400, mapHeight: 400, ground: "#1a1d16", trail: "#2a241c", spawn: { x: 0, y: 0 }, workbench: { x: 0, y: 0 }, obstacles: [] };
    const vp = { x: 0, y: 0, width: 400, height: 400 };
    const cv = document.createElement("canvas");
    cv.width = 400; cv.height = 400;
    const g2 = cv.getContext("2d");
    const origD = g2.drawImage.bind(g2);
    g2.drawImage = (...args) => {
      const src = args[0];
      if (src && src.width === 96 && src.height === 96) shadowCalls.push({ dx: args[1], dy: args[2], dw: args[3], dh: args[4] });
      return origD(...args);
    };
    V.renderEnvironment(g2, loc, vp, [], [], [{ x: 200, y: 200, type: "scrap" }], [], [], [], false, 1);
  } finally { Date.now = realNow; }
  return { b: sum(before), c: sum(center), e: sum(edge), k: sum(corner), shadowCalls };
});
ok("blob shadow darkens the center", sh.c < sh.b - 20, `before=${sh.b} after=${sh.c}`);
ok("blob shadow falls off toward the edge", sh.e > sh.c && sh.e <= sh.b, `edge=${sh.e}`);
ok("blob shadow leaves distant pixels alone", Math.abs(sh.k - sh.b) < 2, `corner=${sh.k}`);
ok("renderEnvironment grounds pickups with a shadow", sh.shadowCalls.length === 1 &&
  Math.abs(sh.shadowCalls[0].dx - 187.35) < 0.1 && Math.abs(sh.shadowCalls[0].dy - 198.04) < 0.1,
  JSON.stringify(sh.shadowCalls));

console.log("== 4. per-map / per-event ambient lighting ==");
const am = await page.evaluate(() => {
  const { DynamicLighting, MAP_AMBIENT, EVENT_AMBIENT } = window.__pzLightingTest;
  const render = (L, bloodMoon) => {
    const c = document.createElement("canvas");
    c.width = 320; c.height = 200;
    const g = c.getContext("2d");
    g.fillStyle = "#2a2d22"; g.fillRect(0, 0, 320, 200);
    L.renderLighting(g, 320, 200,
      { x: 160, y: 100, angle: 0, flashlightAngle: 0, flashlightRange: 200 },
      0, 0.2, [], [], bloodMoon);
    const d = g.getImageData(0, 0, 320, 200).data;
    let r = 0, gg = 0, b = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    return { r: r / n, g: gg / n, b: b / n };
  };
  const L = new DynamicLighting();
  const base = render(L, false);
  L.setAmbient("winslow_still", "blood_moon");
  const viaSet = render(L, false);
  const st = L.ambientState();
  const L2 = new DynamicLighting();
  const argMoon = render(L2, true);
  const L3 = new DynamicLighting();
  L3.setAmbient("white_oak_springs");
  const mapOnly = render(L3, false);
  const st3 = L3.ambientState();
  let threw = false;
  try { new DynamicLighting().setAmbient("no_such_map"); } catch (e) { threw = true; }
  return {
    base, viaSet, argMoon, mapOnly, st, st3, threw,
    maps: Object.keys(MAP_AMBIENT), events: Object.keys(EVENT_AMBIENT),
  };
});
ok("ambient registry covers all 6 Pike County maps", MAPS.every((m) => am.maps.includes(m)), JSON.stringify(am.maps));
ok("blood_moon event registered", am.events.includes("blood_moon"));
ok("setAmbient(map, blood_moon) reddens the scene", am.viaSet.r - am.base.r > 8,
  JSON.stringify({ r: +am.base.r.toFixed(1), moonR: +am.viaSet.r.toFixed(1) }));
ok("blood_moon does not lift green", am.viaSet.g - am.base.g < 4, `gΔ=${(am.viaSet.g - am.base.g).toFixed(1)}`);
ok("bloodMoon render arg matches setAmbient path", Math.abs(am.argMoon.r - am.viaSet.r) < 8,
  `arg=${am.argMoon.r.toFixed(1)} set=${am.viaSet.r.toFixed(1)}`);
ok("setAmbient stores map + event state", am.st.map.level === 0.18 && am.st.event.tint === "rgba(148, 20, 26, 0.18)",
  JSON.stringify(am.st));
ok("map-only ambient applies its tint", am.st3.event === null && am.st3.map.level === 0.22);
ok("unknown map id falls back without throwing", am.threw === false);

console.log("== 5. damage flash + hue jitter ==");
const hz = await page.evaluate(() => {
  const V = window.__pzVisual;
  const c = window.__controlsTest;
  c.toBreak();
  const px = c.playerPos().x, py = c.playerPos().y;
  const zi = c.spawnAt("shambler", px + 100, py);
  c.rehash();
  const hpBefore = c.sys().zombies()[zi].h;
  c.spawnBulletAt(px + 80, py, 400, 0, 50);
  c.stepBullets(10);
  const hpAfter = c.sys().zombies()[zi].h;

  const t0 = Date.now();
  V.registerZombieHit(zi, t0);
  const iHit = V.zombieFlashIntensity(zi, t0 + 10);

  // pixel test: flashed body vs plain body (capture BEFORE the expiry probe
  // below deletes the registry entry)
  const body = (intensity) => {
    const cv = document.createElement("canvas");
    cv.width = 120; cv.height = 120;
    const g = cv.getContext("2d");
    g.fillStyle = "#20241c"; g.fillRect(0, 0, 120, 120);
    g.fillStyle = "#4a4438";
    g.beginPath(); g.arc(60, 60, 17, 0, Math.PI * 2); g.fill();
    if (intensity > 0) V.drawZombieHitFlash(g, 60, 60, 20, intensity);
    const p = g.getImageData(60, 60, 1, 1).data;
    return p[0] + p[1] + p[2];
  };
  const flashed = body(iHit);
  const plain = body(0);
  const iGone = V.zombieFlashIntensity(zi, t0 + 200);
  const iNever = V.zombieFlashIntensity(zi + 9999, t0 + 10);

  // tint filter
  const tg = document.createElement("canvas").getContext("2d");
  V.applyZombieTint(tg, 5);
  const filt = tg.filter;
  V.clearZombieTint(tg);
  const cleared = tg.filter;

  const j1 = V.hueJitterFor(7), j1b = V.hueJitterFor(7), j2 = V.hueJitterFor(8);
  return {
    hpBefore, hpAfter, iHit, iGone, iNever, flashed, plain, filt, cleared,
    j1, j1b, j2, ms: V.HIT_FLASH_MS,
  };
});
ok("bullet hit damaged the zombie (engine, read-only)", hz.hpAfter < hz.hpBefore, JSON.stringify({ hpBefore: hz.hpBefore, hpAfter: hz.hpAfter }));
ok("flash window is ~80ms", hz.ms === 80, `ms=${hz.ms}`);
ok("flash intensity ~1 right after hit", hz.iHit > 0.8, `i=${hz.iHit.toFixed(3)}`);
ok("flash fully gone after 200ms", hz.iGone === 0, `i=${hz.iGone}`);
ok("no flash without a registered hit", hz.iNever === 0);
ok("flash visibly brightens body pixels", hz.flashed - hz.plain > 100, `plain=${hz.plain} flashed=${hz.flashed}`);
ok("hue jitter sets a canvas filter", typeof hz.filt === "string" && hz.filt.includes("hue-rotate"), hz.filt);
ok("tint filter clears after draw", hz.cleared === "none", hz.cleared);
ok("hue jitter deterministic per instance", hz.j1.hue === hz.j1b.hue && hz.j1.sat === hz.j1b.sat, JSON.stringify(hz.j1));
ok("hue jitter differs between instances", hz.j1.hue !== hz.j2.hue || hz.j1.sat !== hz.j2.sat, JSON.stringify({ j1: hz.j1, j2: hz.j2 }));
ok("hue jitter stays subtle", Math.abs(hz.j1.hue) <= 14 && hz.j1.sat >= 0.94 && hz.j1.sat <= 1.08, JSON.stringify(hz.j1));

console.log(`\nbatch6b: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
if (errors.length) console.log("page errors:", errors.slice(0, 5));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
