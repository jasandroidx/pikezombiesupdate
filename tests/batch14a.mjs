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

console.log("== batch14a setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
await page.waitForFunction(() => window.__pzRender7, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("setKeys([])");
await T("setAim(1, 0)");

const EXPECTED_KINDS = ["bloodDrop", "bloodSplat", "spark", "smoke", "glow", "ring", "muzzle", "glint", "ember", "flame", "flash"];

console.log("== 1. atlas baked at startup, init idempotent ==");
const init = await page.evaluate(() => {
  const r7 = window.__pzRender7;
  const glowBefore = r7.particleTexture("glow");
  r7.initParticleTextures(); // second call must be a no-op
  const glowAfter = r7.particleTexture("glow");
  r7.initParticleTextures(); // third, for good measure
  const sizes = {};
  for (const k of r7.PARTICLE_TEXTURE_KINDS) sizes[k] = r7.particleTexture(k).width;
  return {
    ready: r7.hasParticleTextures(),
    readyCT: window.__controlsTest.particleTexturesReady(),
    kinds: [...r7.PARTICLE_TEXTURE_KINDS],
    sizes,
    sizeMap: r7.PARTICLE_TEXTURE_SIZES,
    stable: glowBefore === glowAfter,
    count: r7.particleTextureCount(),
  };
});
ok("hasParticleTextures() true at startup", init.ready === true && init.readyCT === true, JSON.stringify({ ready: init.ready, readyCT: init.readyCT }));
ok("atlas contains all 11 cataloged kinds", JSON.stringify(init.kinds) === JSON.stringify(EXPECTED_KINDS), JSON.stringify(init.kinds));
ok("baked sizes match PARTICLE_TEXTURE_SIZES", EXPECTED_KINDS.every((k) => init.sizes[k] === init.sizeMap[k]), JSON.stringify(init.sizes));
ok("init idempotent: canvas identity stable", init.stable === true);
ok("atlas holds 11+ canvases", init.count >= 11, String(init.count));

console.log("== 2. textures are valid canvases with non-zero pixels ==");
const px = await page.evaluate(() => {
  const r7 = window.__pzRender7;
  const out = {};
  for (const k of r7.PARTICLE_TEXTURE_KINDS) {
    const cv = r7.particleTexture(k);
    const ctx = cv.getContext("2d");
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0, R = 0, G = 0, B = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) { n++; R += d[i]; G += d[i + 1]; B += d[i + 2]; }
    }
    out[k] = {
      isCanvas: cv instanceof HTMLCanvasElement,
      w: cv.width, h: cv.height,
      nz: n,
      dom: n > 0 ? [R / n, G / n, B / n].map((v) => Math.round(v)) : [0, 0, 0],
    };
  }
  return out;
});
let allValid = true, allNz = true;
for (const k of EXPECTED_KINDS) {
  if (!(px[k].isCanvas && px[k].w > 0 && px[k].h > 0)) { allValid = false; console.log(`    bad canvas: ${k}`); }
  if (!(px[k].nz > 0)) { allNz = false; console.log(`    zero pixels: ${k}`); }
}
ok("every kind is a valid non-empty canvas", allValid);
ok("every texture has non-zero pixels", allNz);
const [bR, bG, bB] = px.bloodDrop.dom;
ok("bloodDrop: red dominates", bR > bG + 40 && bR > bB + 40, JSON.stringify(px.bloodDrop.dom));
const [sR, sG, sB] = px.bloodSplat.dom;
ok("bloodSplat: red dominates", sR > sG + 40 && sR > sB + 40, JSON.stringify(px.bloodSplat.dom));
const [gR, gG, gB] = px.glint.dom;
ok("glint: gold (red+green high, blue low)", gR > 150 && gG > 100 && gB < 120, JSON.stringify(px.glint.dom));
const [mR, mG] = px.muzzle.dom;
ok("muzzle: warm flash (red high)", mR > 180 && mG > 120, JSON.stringify(px.muzzle.dom));
const [fR, fG, fB] = px.flame.dom;
ok("flame: orange (red high, green mid, blue low)", fR > 150 && fG > 60 && fB < 110, JSON.stringify(px.flame.dom));
const [rR, rG, rB] = px.ring.dom;
ok("ring: white-ish", rR > 170 && rG > 170 && rB > 170, JSON.stringify(px.ring.dom));
ok("flash: gold with soft alpha", px.flash.nz > 50, JSON.stringify({ nz: px.flash.nz, dom: px.flash.dom }));

console.log("== 3. drawParticle hardening: unknown kinds + garbage args ==");
const hard = await page.evaluate(() => {
  const r7 = window.__pzRender7;
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const ctx = cv.getContext("2d");
  let threw = "";
  const unk0 = r7.unknownParticleKinds();
  const draws0 = r7.drawnParticleTextures();
  try {
    r7.drawParticle(ctx, "nope", 32, 32, 24, 1);          // unknown kind
    r7.drawParticle(ctx, "", 32, 32, 24, 1);              // empty kind
    r7.drawParticle(ctx, "glow", 32, 32, -5, 1);          // negative size
    r7.drawParticle(ctx, "glow", 32, 32, 0, 1);           // zero size
    r7.drawParticle(ctx, "glow", 32, 32, 12, 0);          // zero alpha
    r7.drawParticle(ctx, "glow", 32, 32, 12, -2);         // negative alpha
    r7.drawParticle(ctx, "glow", NaN, 32, 12, 1);         // NaN coords
    r7.drawParticle(ctx, "spark", 32, 32, 24, 1, "#ff0000"); // tint variant
    r7.drawParticle(ctx, "bloodDrop", 32, 32, 24, 0.7);    // normal draw
  } catch (e) { threw = String((e && e.message) || e); }
  const img = Array.from(ctx.getImageData(32, 32, 1, 1).data);
  return {
    threw,
    unkDelta: r7.unknownParticleKinds() - unk0,
    drawsDelta: r7.drawnParticleTextures() - draws0,
    countAfter: r7.particleTextureCount(),
    tintCount: r7.particleTextureCount(),
    img,
  };
});
ok("unknown/garbage drawParticle args never throw", hard.threw === "", hard.threw);
ok("unknown kinds counted as no-ops (2)", hard.unkDelta === 2, String(hard.unkDelta));
ok("only valid draws counted (2: tinted spark + bloodDrop)", hard.drawsDelta === 2, String(hard.drawsDelta));
ok("tint variant baked and cached (count grew)", hard.countAfter > init.count, `${init.count} -> ${hard.countAfter}`);

console.log("== 4. rewire: celebration renderWorld blits textures ==");
const rew = await page.evaluate(() => {
  const r7 = window.__pzRender7;
  r7.resetParticleTextureCount();
  const cel = new r7.CelebrationFx();
  cel.trigger("levelup", 200, 200);
  const cv = document.createElement("canvas"); cv.width = cv.height = 400;
  const ctx = cv.getContext("2d");
  const now = Date.now();
  cel.renderWorld(ctx, now + 50);
  cel.renderScreen(ctx, 400, 400, now + 50);
  const d = ctx.getImageData(0, 0, 400, 400).data;
  let nz = 0, gold = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 8) { nz++; if (d[i] > 150 && d[i + 1] > 100 && d[i + 2] < 150) gold++; }
  }
  return {
    draws: r7.drawnParticleTextures(),
    nz, gold,
    parts: cel.particleCount(),
  };
});
ok("celebration fountain arms 40 particles", rew.parts === 40, String(rew.parts));
ok("renderWorld blits texture particles (>0 draws)", rew.draws > 0, String(rew.draws));
ok("celebration paints gold pixels (flash + glints)", rew.nz > 200 && rew.gold > 50, JSON.stringify({ nz: rew.nz, gold: rew.gold }));

// live path: shared celebration on the real game canvas blits textures too
const live = await page.evaluate(async () => {
  const r7 = window.__pzRender7;
  r7.resetParticleTextureCount();
  const before = r7.drawnParticleTextures();
  // engine drives celebration on the performance.now() clock (not Date.now())
  r7.celebration.trigger("levelup", 600, 400, performance.now());
  await new Promise((r) => setTimeout(r, 700));
  return { before, after: r7.drawnParticleTextures() };
});
ok("live celebration on game canvas blits textures", live.after > live.before, JSON.stringify(live));

console.log("== 5. live combat: no page errors, particles render ==");
const combat = await page.evaluate(async () => {
  const c = window.__controlsTest;
  const r7 = window.__pzRender7;
  c.resetParticleSpriteCount();
  r7.resetParticleTextureCount();
  for (let i = 0; i < 3; i++) c.spawnType("shambler");
  c.setAim(1, 0);
  for (let i = 0; i < 6; i++) { c.fireOnce(); await new Promise((r) => setTimeout(r, 120)); }
  await new Promise((r) => setTimeout(r, 1500));
  return {
    sprites: c.drawnParticleSprites(),
    textures: r7.drawnParticleTextures(),
    kills: c.sys().kills ?? -1,
  };
});
ok("combat renders particles via baked sprites", combat.sprites > 0, JSON.stringify(combat));
await page.screenshot({ path: "/tmp/batch14a-combat.png" });
ok("no page errors during combat + celebration", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(`\nbatch14a: ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
