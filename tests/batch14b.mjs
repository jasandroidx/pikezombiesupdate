// Batch 14 — Lane 2 (async reference-counted resource map):
//  1. ResourceMap.acquire dedupes concurrent loads (one loader run).
//  2. Refcounting: acquire x2 / release x2, disposer runs once at zero.
//  3. Failed loads don't poison the map: all acquirers get the rejection,
//     a later acquire retries.
//  4. prefetch warms the map (fire-and-forget, one pinned reference).
//  5. stats() reports keys / refcounts / per-key loads / totalLoads.
//  6. Release-before-settle keeps dedupe; sync-throwing loaders don't poison.
//  7. Live: loadArt rewired through the map — all 9 sprite keys ready,
//     non-zero-size canvases, drawSprite renders (draws > 0), 0 page errors.
//
// Pure sections run in plain node via jiti (TS sources imported directly).
//   node_modules/.bin/jiti tests/batch14b.mjs
// Live section runs under Playwright against a dev server (served bundle check).
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch14b.mjs

import { ResourceMap } from "../src/game/resourceMap.ts";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

const tick = () => new Promise((r) => setTimeout(r, 0));
const deferred = () => {
  let resolve, reject;
  const p = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { p, resolve, reject };
};

console.log("== 14b(a). refcounting: acquire x2 / release x2 / dispose once ==");
{
  const disposed = [];
  const m = new ResourceMap((k, v) => { disposed.push([k, v]); });
  let runs = 0;
  const loader = () => { runs++; return Promise.resolve("v1"); };
  const p1 = m.acquire("a", loader);
  const p2 = m.acquire("a", loader); // same tick: dedupes
  eq(runs, 1, "concurrent acquire runs loader once");
  eq(p1 === p2, true, "concurrent acquires share the promise");
  const [v1, v2] = await Promise.all([p1, p2]);
  eq(v1, "v1", "acquirer 1 resolves");
  eq(v2, "v1", "acquirer 2 resolves");
  eq(m.get("a"), "v1", "get() returns ready value");
  let s = m.stats();
  eq(s.refcounts.a, 2, "refcount 2 after two acquires");
  ok(m.release("a"), "first release returns true");
  eq(disposed.length, 0, "no dispose while refcount > 0");
  eq(m.get("a"), "v1", "value still present after one release");
  ok(m.release("a"), "second release returns true");
  eq(disposed.length, 1, "disposer runs once at refcount zero");
  eq(disposed[0][0], "a", "disposer got the key");
  eq(disposed[0][1], "v1", "disposer got the value");
  eq(m.get("a"), undefined, "get() undefined after dispose");
  ok(!m.release("a"), "release of unknown key returns false");
  ok(!m.release("nope"), "release of never-seen key returns false");
}

console.log("== 14b(b). failed load: no poison, all acquirers reject, retry works ==");
{
  let runs = 0;
  const m = new ResourceMap();
  const bad = () => { runs++; return Promise.reject(new Error("boom")); };
  const p1 = m.acquire("x", bad);
  const p2 = m.acquire("x", bad);
  eq(runs, 1, "concurrent failing acquire runs loader once");
  const rs = await Promise.allSettled([p1, p2]);
  ok(rs[0].status === "rejected" && rs[1].status === "rejected", "both acquirers get the rejection");
  eq(rs[0].reason.message, "boom", "rejection reason propagates");
  await tick();
  ok(!m.has("x"), "failed entry evicted from map");
  eq(m.get("x"), undefined, "get() undefined after failure");
  const good = () => { runs++; return Promise.resolve("ok2"); };
  const v = await m.acquire("x", good);
  eq(v, "ok2", "later acquire retries and succeeds");
  eq(runs, 2, "loader ran again on retry");
  eq(m.get("x"), "ok2", "retried value cached");
}

console.log("== 14b(c). prefetch warms the map ==");
{
  const loaded = [];
  const m = new ResourceMap();
  m.prefetch(["p", "q"], (k) => { loaded.push(k); return Promise.resolve(`V:${k}`); });
  eq(loaded.length, 2, "prefetch starts loads immediately (fire-and-forget)");
  const vals = await m.readyAll(["p", "q"]);
  eq(vals.join(","), "V:p,V:q", "readyAll resolves warmed values");
  eq(m.get("p"), "V:p", "prefetched key readable via get()");
  const s = m.stats();
  eq(s.refcounts.p, 1, "prefetch pins one reference");
  eq(s.refcounts.q, 1, "prefetch pins one reference (q)");
  m.release("p"); m.release("q");
  eq(m.stats().keys.length, 0, "releasing prefetch pins clears the map");
}

console.log("== 14d(d). stats() accuracy ==");
{
  const m = new ResourceMap();
  const d1 = deferred();
  const pA = m.acquire("a", () => d1.p);
  m.acquire("a", () => { throw new Error("must not run"); }); // joins in-flight
  const vB = await m.acquire("b", () => Promise.resolve(7));
  eq(vB, 7, "key b resolves");
  let s = m.stats();
  eq(s.inFlight, 1, "one key in flight");
  eq(s.totalLoads, 2, "totalLoads counts loader runs");
  eq(s.loads.a, 1, "loads.a == 1");
  eq(s.loads.b, 1, "loads.b == 1");
  eq(s.refcounts.a, 2, "refcounts.a == 2 (two acquires, one in flight)");
  ok(s.keys.includes("a") && s.keys.includes("b"), "keys lists both entries");
  ok(m.whenReady("a") === pA, "whenReady returns the in-flight promise");
  eq(m.get("a"), undefined, "get() undefined while loading");
  d1.resolve("A!");
  eq(await pA, "A!", "in-flight acquire resolves");
  s = m.stats();
  eq(s.inFlight, 0, "no keys in flight after settle");
  eq(m.get("a"), "A!", "get() returns value after settle");
}

console.log("== 14b(e). release before settle keeps dedupe; sync throw safe ==");
{
  const disposed = [];
  const m = new ResourceMap((k) => { disposed.push(k); });
  const d = deferred();
  let runs = 0;
  const p1 = m.acquire("r", () => { runs++; return d.p; });
  ok(m.release("r"), "release while loading returns true");
  const p2 = m.acquire("r", () => { runs++; return d.p; });
  eq(runs, 1, "re-acquire during in-flight load does not start a second load");
  eq(p1 === p2, true, "re-acquire joins the same promise");
  eq(m.stats().refcounts.r, 1, "refcount back to 1 after re-acquire");
  d.resolve("R");
  eq(await p2, "R", "joined load resolves");
  eq(m.get("r"), "R", "value held (refcount > 0 at settle)");
  m.release("r");
  eq(disposed.join(","), "r", "dispose after final release");

  const m2 = new ResourceMap();
  const q1 = m2.acquire("s", () => { throw new Error("sync boom"); });
  const st = await q1.then(() => "resolved", (e) => e.message);
  eq(st, "sync boom", "sync-throwing loader rejects the acquirer");
  ok(!m2.has("s"), "sync-throwing loader does not poison the map");
  eq(await m2.acquire("s", () => "retry-ok"), "retry-ok", "retry after sync throw works");
}

// ================= Live section (Playwright) =================
const PZ_URL = process.env.PZ_URL || "http://127.0.0.1:8082";
console.log("\n== live (Playwright) ==");
const { chromium } = await import("playwright-core");
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

console.log("-- setup --");
await page.goto(PZ_URL, { waitUntil: "networkidle", timeout: 60000 });
const startBtn = page.getByText("Survival · this place");
await startBtn.waitFor({ timeout: 30000 });
for (let i = 0; i < 12 && !(await page.evaluate(() => !!window.__controlsTest)); i++) {
  await startBtn.click();
  await page.waitForTimeout(2500);
}
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 30000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");

console.log("== 14b(f). art via resource map: sprites ready, non-zero, rendering ==");
{
  // Let loadArt's prefetch pass finish and a few frames draw.
  await page.waitForFunction(() => window.__pzArt && window.__pzArt.stats().ready, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const art = await page.evaluate(() => window.__pzArt.stats());
  ok(art.ready === true, "isArtReady (loaded flag) true after prefetch pass");
  const ids = Object.keys(art.sprites);
  eq(ids.length, 9, `9 sprite keys through the map (got ${ids.length})`);
  const missing = ids.filter((id) => !art.sprites[id]);
  ok(missing.length === 0, `every sprite key resolved a canvas${missing.length ? ": " + missing.join(",") : ""}`);
  const flat = ids.filter((id) => {
    const d = art.dims[id];
    return !d || d[0] <= 0 || d[1] <= 0;
  });
  ok(flat.length === 0, `every sprite canvas has non-zero dimensions${flat.length ? ": " + flat.join(",") : ""}`);
  ok(art.draws > 0, `drawSprite rendered ${art.draws} sprites since boot`);
  const mapStats = art.map;
  eq(mapStats.refcounts.player >= 1, true, `player sprite pinned (refcount ${mapStats.refcounts.player} >= 1; loadArt runs per mount)`);
  ok(mapStats.totalLoads >= 9, `>= 9 loader runs recorded (got ${mapStats.totalLoads})`);
  ok(mapStats.inFlight === 0, "no sprite loads in flight after settle");
}

console.log("-- page errors --");
ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ").slice(0, 400) : ""}`);
await browser.close();

console.log(`\nbatch14b: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
