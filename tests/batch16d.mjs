import { chromium } from "playwright-core";

// Lane 4 (juice-in-renderer event architecture) — Batch 16d: sim emits typed
// juice events, JuiceSim drains them synchronously into the terminal producers.
// Replays the batch5a kill-word assertions through the event path and checks
// queue hygiene (drain is synchronous + idempotent).
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

console.log("== batch16d setup ==");
await page.goto(URL, { waitUntil: "networkidle" });
await page.getByText("Survival · this place").click();
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 20000 });
const T = (expr) => page.evaluate(`window.__controlsTest.${expr}`);
await T("god()");
await T("skipBreak()");
await T("toBreak()");

const WORDS = ["SLAIN!", "DOWN!", "SPLAT!", "CRUNCH!"];

console.log("== 1. kill-word through the event path (synchronous drain) ==");
const kw = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  const before = c.killWordState().count;
  c.killOne("shambler"); // -> zombieSim.killZombie -> emitJuice('killWord') + drain at method end
  const st = c.killWordState(); // must be visible IMMEDIATELY (no frame wait)
  return { before, st };
});
ok("kill spawns a kill-word floater via events", WORDS.includes(kw.st.last.word), JSON.stringify(kw.st.last));
ok("kill-word styled gold or red", kw.st.last.color === "#ffd700" || kw.st.last.color === "#e11d2e", JSON.stringify({ color: kw.st.last.color }));
ok("kill-word counter increments exactly once", kw.st.count === kw.before + 1, JSON.stringify({ before: kw.before, after: kw.st.count }));

console.log("== 2. blood spray + ground splats through events ==");
const sp = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  c.killOne("shambler");
  const stepped = c.stepParticles(40); // spray lives .45-.75s; 40 frames expires it all
  return stepped;
});
ok("blood spray particles leave ground splats", sp.splats >= 1, JSON.stringify(sp));
ok("splat count respects the ~30 cap", sp.splats <= 30, JSON.stringify(sp));

console.log("== 3. shockwave ring + screen flash through events ==");
const ring = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  c.killOne("shambler"); // shambler radius 17 -> ring maxR = 17 * 4.2 = 71.4
  return { ring: c.ringState(), flash: c.flashState() };
});
ok("kill pushes an expanding white ring via events", ring.ring.rings >= 1, JSON.stringify(ring.ring));
ok("ring radius ~4.2x zombie radius", ring.ring.lastMaxR === 71.4, JSON.stringify(ring.ring));
ok("kill triggers a screen-space flash via events", ring.flash.count >= 1, JSON.stringify(ring.flash));

console.log("== 4. drain is idempotent (no double-production) ==");
const dq = await page.evaluate(() => {
  const c = window.__controlsTest;
  c.toBreak();
  const b0 = c.killWordState().count;
  c.killOne("shambler");
  const s1 = c.killWordState();
  c.killOne("shambler");
  const s2 = c.killWordState();
  return { b0, c1: s1.count, c2: s2.count, w1: s1.last.word, w2: s2.last.word };
});
ok("first kill drains synchronously", dq.c1 === dq.b0 + 1 && WORDS.includes(dq.w1), JSON.stringify(dq));
ok("second kill drains once, no duplication", dq.c2 === dq.c1 + 1 && WORDS.includes(dq.w2), JSON.stringify(dq));

console.log(`\nbatch16d: ${pass} passed, ${fail} failed, ${errors.length} page errors`);
if (errors.length) console.log("page errors:", errors.slice(0, 5));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
