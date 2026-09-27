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

console.log("== batch7d setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
await page.waitForFunction(() => window.__pzRender7, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("setKeys([])");
await T("setAim(1, 0)");

console.log("== 1. dynamic zoom vs horde density ==");
const zt = await page.evaluate(() => {
  const r7 = window.__pzRender7;
  const base = 0.5;
  return {
    t0: r7.zoomTargetForDensity(0, base, 1),
    t1: r7.zoomTargetForDensity(1, base, 1),
    t2: r7.zoomTargetForDensity(2.5, base, 1),
    rm: r7.zoomTargetForDensity(2.5, base, 0.2),
    clamped: r7.zoomTargetForDensity(99, base, 1),
    floor: r7.zoomTargetForDensity(99, 0.36, 1),
  };
});
ok("zoom target falls as density rises", zt.t0 > zt.t1 && zt.t1 > zt.t2 && zt.t2 < 0.5, JSON.stringify(zt));
ok("reduce-motion scales the pullback down", (0.5 - zt.rm) < (0.5 - zt.t2) * 0.5, JSON.stringify(zt));
ok("density clamped at minZoom", zt.clamped >= 0.38 - 1e-9 && zt.floor >= 0.3 - 1e-9, JSON.stringify(zt));

const zs = await page.evaluate(() => {
  const r7 = window.__pzRender7;
  const horde = [];
  for (let i = 0; i < 40; i++) horde.push({ x: (i % 8) * 50, y: ((i / 8) | 0) * 50 });
  const rig = new r7.DynamicZoomRig();
  const z1 = rig.update(horde, 0, 0, 1 / 60, 0.5, 1);
  const d1 = rig.state().density;
  for (let i = 0; i < 600; i++) rig.update(horde, 0, 0, 1 / 60, 0.5, 1);
  const st = rig.state();
  return { z1, d1, z2: st.current, target: st.target };
});
ok("density = zombies within 600u / 40", Math.abs(zs.d1 - 1) < 1e-9, JSON.stringify(zs));
ok("zoom smooths toward target (lerp, no snap)", zs.z1 > zs.z2 && Math.abs(zs.z2 - zs.target) < 0.002, JSON.stringify(zs));

const live = await page.evaluate(() => {
  const c = window.__controlsTest, r7 = window.__pzRender7;
  c.toBreak(); c.skipBreak(); c.setKeys([]);
  for (let i = 0; i < 80; i++) c.spawnType("shambler");
  const rows = c.sys().zombies();
  const near = rows.filter((r) => r.d < 600).length;
  return { total: rows.length, near, target: r7.zoomTargetForDensity(near / 40, 0.5, 1) };
});
ok("spawned horde raises density, zoom target drops below base", live.near >= 40 && live.target < 0.5, JSON.stringify(live));

console.log("== 2. camera deadzone + lookahead ==");
const cam = await page.evaluate(() => {
  const Rig = window.__pzRender7.CameraRig;
  const rig = new Rig(1000, 1000);
  for (let i = 0; i < 20; i++) rig.update(1000, 1000, 0, 0, 1, 0);
  const still = { x: rig.x, y: rig.y };
  rig.update(1010, 1000, 0, 0, 1, 0);
  const micro = { x: rig.x, y: rig.y };
  rig.update(1400, 1000, 0, 0, 1, 0);
  const big = { x: rig.x, y: rig.y };
  const rig2 = new Rig(0, 0);
  rig2.update(300, 0, 400, 0, 1, 0);
  const lead = { x: rig2.x, y: rig2.y };
  return { still, micro, big, lead };
});
ok("deadzone: no movement when player stationary", cam.still.x === 1000 && cam.still.y === 1000, JSON.stringify(cam.still));
ok("deadzone: micro-move (<24px) ignored", cam.micro.x === 1000 && cam.micro.y === 1000, JSON.stringify(cam.micro));
ok("follow: big move lerps camera toward target", cam.big.x > 1000 && cam.big.x < 1440, JSON.stringify(cam.big));
ok("lookahead: velocity + aim lead the camera", cam.lead.x > 44 && cam.lead.x < 480, JSON.stringify(cam.lead));

console.log("== 3. celebration stack ==");
// real draft open through the engine, then poll the render-lane celebration
await T("openDraft()");
const draftOpened = await T("draftOpen()");
const cel = await page.evaluate(() => {
  const r7 = window.__pzRender7;
  const c = window.__controlsTest;
  // Integration: the engine polls the shared celebration every frame, so the
  // real draft-open above legitimately fired it — assert that, then run the
  // deterministic unit checks on a fresh instance the game loop can't touch.
  const nowShared = Date.now();
  const shared = { active: r7.celebration.active(nowShared), kind: r7.celebration.activeKind() };
  const cel = new r7.CelebrationFx();
  const now = Date.now();
  cel.poll({ draftOpen: false, shrinesAttuned: 0, bombCharges: 1 }, 0, 0, now);
  const idle = { active: cel.active(now), kind: cel.activeKind() };
  cel.poll({ draftOpen: !!c.draftOpen(), shrinesAttuned: 0, bombCharges: 1 }, 500, 500, now + 10);
  const t0 = cel.t0;
  const up = {
    active: cel.active(now + 20), kind: cel.activeKind(), text: cel.celebrationText(),
    slow: cel.slowmoFactor(now + 100), slowLate: cel.slowmoFactor(now + 500),
    parts: cel.particleCount(), banner: cel.bannerScale(t0 + 100),
  };
  cel.poll({ draftOpen: !!c.draftOpen(), shrinesAttuned: 0, bombCharges: 1 }, 500, 500, now + 20);
  const dup = cel.t0 === t0;
  cel.poll({ draftOpen: false, shrinesAttuned: 1, bombCharges: 1 }, 500, 500, now + 30);
  const shrine = { kind: cel.activeKind(), text: cel.celebrationText() };
  cel.poll({ draftOpen: false, shrinesAttuned: 1, bombCharges: 0 }, 500, 500, now + 40);
  const bomb = { kind: cel.activeKind(), text: cel.celebrationText() };
  const cv = document.createElement("canvas"); cv.width = cv.height = 400;
  const ctx = cv.getContext("2d");
  cel.renderWorld(ctx, now + 50);
  cel.renderScreen(ctx, 400, 400, now + 50);
  return { idle, shared, up, dup, shrine, bomb, draftOpened: !!c.draftOpen() };
});
await T("dismissDraft()");
ok("engine draft really opened", draftOpened === true && cel.draftOpened === true);
ok("idle: no celebration before events", !cel.idle.active && cel.idle.kind === null);
ok("engine poll fires celebration on real draft open", cel.shared.active && cel.shared.kind === "levelup", JSON.stringify(cel.shared));
ok("draft open fires LEVEL UP", cel.up.active && cel.up.kind === "levelup" && cel.up.text === "LEVEL UP!", JSON.stringify(cel.up));
ok("slow-mo 0.4x inside 300ms, 1x after", cel.up.slow === 0.4 && cel.up.slowLate === 1, JSON.stringify({ slow: cel.up.slow, slowLate: cel.up.slowLate }));
ok("40-particle fountain armed", cel.up.parts === 40, String(cel.up.parts));
ok("banner scale-pop (200ms Back.easeOut)", cel.up.banner > 0.5 && cel.up.banner <= 1.15, String(cel.up.banner));
ok("no retrigger on steady flags", cel.dup === true);
ok("shrine attune fires ATTUNED", cel.shrine.kind === "shrine" && cel.shrine.text === "ATTUNED", JSON.stringify(cel.shrine));
ok("bomb fires STORM'S COMING", cel.bomb.kind === "bomb" && cel.bomb.text === "STORM'S COMING", JSON.stringify(cel.bomb));

console.log("== 4. telegraphs ==");
const tel = await page.evaluate(() => {
  const r7 = window.__pzRender7;
  r7.resetTelegraphCount();
  const cv = document.createElement("canvas"); cv.width = cv.height = 400;
  const ctx = cv.getContext("2d");
  const now = Date.now();
  const bad = r7.renderTelegraphs(ctx, [
    { kind: "leap" }, null, undefined, 42,
    { kind: "bogus", x: 10, y: 10, r: 30, t0: now, dur: 500 },
    { kind: "leap", x: NaN, y: 10, r: 30, t0: now, dur: 500 },
    { kind: "leap", x: 50, y: 50, r: 40, t0: now - 900, dur: 500 },
  ], now, { x: 0, y: 0 });
  const arcsAfterBad = r7.drawnTelegraphs();
  const neg = r7.renderTelegraphs(ctx, [{ kind: "leap", x: 200, y: 200, r: -60, t0: now, dur: 500 }], now, null);
  const arcsAfterNeg = r7.drawnTelegraphs();
  // forced dasher windup: leap telegraph at the dasher's position
  const n = r7.renderTelegraphs(ctx, [{ kind: "leap", x: 200, y: 200, r: 60, t0: now - 100, dur: 600 }], now, { x: 200, y: 400 });
  const arcsAfterLeap = r7.drawnTelegraphs();
  const nr = r7.renderTelegraphs(ctx, [{ kind: "ranged", x: 100, y: 100, r: 50, t0: now - 50, dur: 600 }], now, null);
  const nc = r7.renderTelegraphs(ctx, [{ kind: "charge", x: 0, y: 0, r: 40, t0: now - 50, dur: 600 }], now, { x: 300, y: 0 });
  const arcsFinal = r7.drawnTelegraphs();
  return { bad, arcsAfterBad, neg, arcsAfterNeg, n, arcsAfterLeap, nr, nc, arcsFinal };
});
ok("malformed/expired telegraphs never crash, draw nothing", tel.bad === 0 && tel.arcsAfterBad === 0, JSON.stringify(tel));
ok("negative radius clamped, still draws (no arc crash)", tel.neg === 1 && tel.arcsAfterNeg === 2, JSON.stringify(tel));
ok("dasher windup (leap) draws 2 rings", tel.n === 1 && tel.arcsAfterLeap === 4, JSON.stringify(tel));
ok("ranged draws rings, charge draws lane", tel.nr === 1 && tel.nc === 1 && tel.arcsFinal === 6, JSON.stringify(tel));

const attach = await page.evaluate(() => ({
  has: typeof window.__controlsTest.drawnTelegraphs === "function",
  hasCull: typeof window.__controlsTest.culledCount === "function",
  val: typeof window.__controlsTest.drawnTelegraphs === "function" ? window.__controlsTest.drawnTelegraphs() : -1,
}));
ok("drawnTelegraphs probe attached to __controlsTest", attach.has && attach.val === tel.arcsFinal, JSON.stringify(attach));
ok("culledCount probe attached to __controlsTest", attach.hasCull === true);

console.log("== 5. off-screen culling ==");
const cu = await page.evaluate(() => {
  const r7 = window.__pzRender7;
  r7.resetCulledCount();
  const vp = { x: 0, y: 0, width: 1280, height: 800 };
  const far = [];
  for (let i = 0; i < 100; i++) far.push({ x: 5000 + i * 10, y: 5000 });
  const vis = r7.cullEntities(far, vp, 24, 96);
  const c1 = r7.culledCount();
  const near = [{ x: 640, y: 400 }, { x: -50, y: 400 }, { x: 640, y: -90 }];
  const vis2 = r7.cullEntities(near, vp, 24, 96);
  const c2 = r7.culledCount();
  return { vis: vis.length, c1, vis2: vis2.length, c2 };
});
ok("100 far entities culled, none visible", cu.vis === 0 && cu.c1 === 100, JSON.stringify(cu));
ok("near + 96px-margin entities kept", cu.vis2 === 3 && cu.c2 === 100, JSON.stringify(cu));

console.log("== 6. darkness lighting ==");
const dk = await page.evaluate(() => {
  const { DynamicLighting } = window.__pzLightingTest;
  const L = new DynamicLighting();
  const cv = document.createElement("canvas"); cv.width = 400; cv.height = 400;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, 400, 400);
  const off = L.renderDarkness(ctx, 400, 400, 200, 200, 150, false, 1000);
  const px0 = Array.from(ctx.getImageData(200, 200, 1, 1).data);
  const on = L.renderDarkness(ctx, 400, 400, 200, 200, 150, true, 1000);
  const center = Array.from(ctx.getImageData(200, 200, 1, 1).data);
  const corner = Array.from(ctx.getImageData(10, 10, 1, 1).data);
  ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, 400, 400);
  L.renderDarkness(ctx, 400, 400, 200, 200, 300, true, 1000);
  const wider = Array.from(ctx.getImageData(200, 120, 1, 1).data);
  return { off, px0, on, center, corner, wider };
});
ok("dark=false is a no-op returning false", dk.off === false && dk.px0[0] === 128, JSON.stringify(dk.px0));
ok("dark=true darkens outside lightRadius", dk.on === true && dk.corner[0] < 30, JSON.stringify(dk.corner));
ok("safe circle stays lit at center", dk.center[0] > 100, JSON.stringify(dk.center));
ok("wider lightRadius widens the safe circle", dk.wider[0] > dk.corner[0] + 40, JSON.stringify({ wider: dk.wider, corner: dk.corner }));

console.log("== 7. naming + page errors ==");
const naming = await page.evaluate(() => {
  const texts = Object.values(window.__pzRender7.CELEBRATION_TEXT).join(" ");
  return /bayville|griggsville|illinois/i.test(texts + " " + document.title + " " + document.body.innerText.slice(0, 4000));
});
ok("no Bayville/Griggsville/Illinois in render-lane text", !naming);
ok("0 page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

console.log(`\nbatch7d: ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
