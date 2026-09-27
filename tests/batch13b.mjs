// Batch 13 — Lane 2 (UI/audio: Old Ben boss presentation) tests:
//  1. Old Ben motif: OLD_BEN_BELL / OLD_BEN_ARP specs contrast the
//     Behemoth's BOSS_MOTIF; oldBenMotif() plays without errors.
//  2. Intro ceremony: forced via __pzLane2.fireBossIntro("old_ben") —
//     letterboxed "OLD BEN WAKES" banner appears, then auto-dismisses.
//  3. Generalized boss HP bar: forced Behemoth and Old Ben states render
//     with the right names; hidden with no boss.
//  4. Attack callouts: forced names appear, expire, absent-without.
//  5. Indiana-only naming (never Bayville/Griggsville/Illinois).
//
// Pure sections run in plain node via jiti (TS/TSX sources imported
// directly; audio methods needing AudioContext are only spec-checked).
//   node_modules/.bin/jiti tests/batch13b.mjs
// Live section runs under Playwright against a dev server.
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch13b.mjs

import {
  BOSS_MOTIF, OLD_BEN_BELL, OLD_BEN_ARP, soundEngine,
} from "../src/audio/soundEngine.ts";
import {
  bossTitleFor, bossSubFor, bossNameFor, bossIntroMatch, attackNameFromRadio,
  OLD_BEN_ATTACKS, BOSS_ZOMBIE_TYPES,
} from "../src/components/game/bossIntroData.ts";

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

const BANNED = ["Bayville", "Griggsville", "Illinois"];

// ================= Item 1: Old Ben motif specs =================
console.log("== 13b(a). Old Ben motif specs (pure) ==");
eq(OLD_BEN_BELL.freqs.length, 3, "bell has 3 strikes");
eq(OLD_BEN_BELL.freqs[0], 98, "bell opens G2 98Hz");
eq(OLD_BEN_BELL.freqs[2], 55, "bell lands A1 55Hz");
ok(OLD_BEN_BELL.freqs[0] > OLD_BEN_BELL.freqs[1] && OLD_BEN_BELL.freqs[1] > OLD_BEN_BELL.freqs[2], "bell descends");
eq(OLD_BEN_BELL.wave, "sine", "bell is sine (dread), not square");
eq(OLD_BEN_BELL.noteMs, 260, "bell 260ms per strike (slow)");
eq(OLD_BEN_BELL.bus, "beast", "bell on beast bus");
eq(OLD_BEN_ARP.freqs.length, 4, "arp figure has 4 notes");
eq(OLD_BEN_ARP.freqs[0], 220, "arp A3");
eq(OLD_BEN_ARP.freqs[1], 261.63, "arp C4");
eq(OLD_BEN_ARP.freqs[2], 329.63, "arp E4");
eq(OLD_BEN_ARP.freqs[3], 440, "arp A4 (A minor figure)");
eq(OLD_BEN_ARP.wave, "triangle", "arp is triangle");
ok(typeof soundEngine.oldBenMotif === "function", "oldBenMotif is a public method");

console.log("== 13b(b). motif contrasts the Behemoth's ==");
{
  const shared = BOSS_MOTIF.freqs.filter((f) => OLD_BEN_BELL.freqs.includes(f) || OLD_BEN_ARP.freqs.includes(f));
  eq(shared.length, 0, "no shared pitches with the Behemoth motif");
  ok(OLD_BEN_BELL.wave !== BOSS_MOTIF.wave, "different waveform (sine vs square)");
  ok(OLD_BEN_BELL.freqs[0] < BOSS_MOTIF.freqs[BOSS_MOTIF.freqs.length - 1], "bell sits below the Behemoth's lowest note");
  ok(OLD_BEN_BELL.noteMs > BOSS_MOTIF.noteMs, "slower pacing than the alert");
}

// ================= Item 2: boss matchers (pure) =================
console.log("== 13b(c). radio matchers (pure) ==");
eq(bossIntroMatch("WJPS", "Folks... we got a big one on the Trace. Get to high ground or get to cover."), "behemoth", "Behemoth intro body matches");
eq(bossIntroMatch("WJPS", "Old Ben don't sleep no more."), "old_ben", "Old Ben name in body matches");
eq(bossIntroMatch("WJPS", "They're on the trace, and they are not walking."), null, "ordinary wave radio does not match");
eq(bossIntroMatch("Unknown", "Six deep on that trick."), null, "flavor radio does not match");
eq(attackNameFromRadio("TREMOR SLAM incoming"), "TREMOR SLAM", "tremor slam matched");
eq(attackNameFromRadio("the briar call begins"), "BRIAR CALL", "briar call matched case-insensitively");
eq(attackNameFromRadio("BULL CHARGE"), "BULL CHARGE", "bull charge matched");
eq(attackNameFromRadio("County record set: something."), null, "unrelated radio has no attack");
eq(OLD_BEN_ATTACKS.length, 3, "three named patterns");

console.log("== 13b(d). boss titles/names (pure) ==");
eq(bossTitleFor("old_ben"), "OLD BEN WAKES", "Old Ben intro title");
eq(bossTitleFor("behemoth"), "THE BEHEMOTH", "Behemoth intro title");
eq(bossNameFor("old_ben"), "OLD BEN", "Old Ben bar name");
eq(bossNameFor("behemoth"), "THE BEHEMOTH", "Behemoth bar name");
ok(BOSS_ZOMBIE_TYPES.has("behemoth") && BOSS_ZOMBIE_TYPES.has("old_ben"), "both bosses in the bar set");

console.log("== 13b(e). Indiana-only naming (pure) ==");
for (const s of [bossTitleFor("old_ben"), bossSubFor("old_ben"), bossNameFor("old_ben"),
                 bossTitleFor("behemoth"), bossSubFor("behemoth"), bossNameFor("behemoth")]) {
  for (const bad of BANNED) ok(!s.includes(bad), `no "${bad}" in boss copy: ${s}`);
}

// ================= Live section (Playwright) =================
const PZ_URL = process.env.PZ_URL || "http://127.0.0.1:8082";
console.log("\n== live (Playwright) ==");
const { chromium } = await import("playwright-core");
const browser = await chromium.launch({
  executablePath: "/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

console.log("-- setup --");
await page.goto(PZ_URL, { waitUntil: "networkidle", timeout: 60000 });
// Start a real run (batch12a pattern): the boss HP bar and attack callouts
// live in the playing HUD, so the forced-hook assertions need the game
// screen up. God mode keeps the run alive for the duration of the test.
const startBtn = page.getByText("Survival · this place");
await startBtn.waitFor({ timeout: 30000 });
for (let i = 0; i < 12 && !(await page.evaluate(() => !!window.__controlsTest)); i++) {
  await startBtn.click();
  await page.waitForTimeout(2500);
}
await page.waitForFunction(() => window.__controlsTest && window.__controlsTest.sys, null, { timeout: 30000 });
await page.evaluate(() => { window.__controlsTest.god(); });
// The engine lane edits concurrently, so a Vite HMR reload can drop the
// hook mid-run; re-assert it before every block.
const ensureL2 = async () => {
  await page.waitForFunction(() => !!window.__pzLane2, null, { timeout: 30000 });
};
await ensureL2();
const L2 = (expr) => page.evaluate(`window.__pzLane2.${expr}`);

console.log("== 13b(f). intro banner appears via forced callback ==");
{
  await ensureL2();
  await L2(`fireBossIntro("old_ben")`);
  const intro = page.getByTestId("boss-intro");
  await intro.waitFor({ state: "visible", timeout: 5000 });
  ok(await intro.isVisible(), "boss intro visible");
  eq(await intro.getAttribute("data-boss-id"), "old_ben", "intro keyed to old_ben");
  ok((await intro.textContent())?.includes("OLD BEN WAKES") ?? false, "banner reads OLD BEN WAKES");
  ok(await page.getByTestId("boss-intro-letterbox").count() >= 1, "letterbox bars present");
  // Indiana-only naming on the rendered ceremony.
  const html = await intro.innerHTML();
  for (const bad of BANNED) ok(!html.includes(bad), `no "${bad}" in rendered intro`);
}

console.log("== 13b(g). intro auto-dismisses into the fight ==");
{
  await page.getByTestId("boss-intro").waitFor({ state: "hidden", timeout: 12000 });
  ok(true, "intro dismissed");
}

console.log("== 13b(h). motif plays without errors ==");
{
  await ensureL2();
  const res = await page.evaluate(() => {
    try {
      window.__pzLane2.sound.oldBenMotif();
      return { ok: true, name: window.__pzLane2.sound.lastMotifDesc?.name ?? null };
    } catch (e) { return { ok: false, err: String(e) }; }
  });
  ok(res.ok, `oldBenMotif() threw nothing${res.err ? ` (${res.err})` : ""}`);
  eq(res.name, "oldBenMotif", "last motif recorded as oldBenMotif");
}

console.log("== 13b(i). generalized boss HP bar ==");
{
  await ensureL2();
  const bar = page.getByTestId("boss-hp-bar");
  ok((await bar.count()) === 0, "no boss bar with no boss (hidden)");
  await L2(`setBossBar({ id: "behemoth", name: "THE BEHEMOTH", frac: 0.75 })`);
  await bar.waitFor({ state: "visible", timeout: 5000 });
  ok((await bar.textContent())?.includes("THE BEHEMOTH") ?? false, "Behemoth name renders");
  eq(await bar.getAttribute("data-boss-id"), "behemoth", "bar keyed to behemoth");
  await L2(`setBossBar({ id: "old_ben", name: "OLD BEN", frac: 0.5 })`);
  await page.waitForTimeout(300);
  ok((await bar.textContent())?.includes("OLD BEN") ?? false, "Old Ben name renders");
  eq(await bar.getAttribute("data-boss-id"), "old_ben", "bar keyed to old_ben");
  await L2(`clearBossBar()`);
  await page.waitForTimeout(300);
  ok((await bar.count()) === 0, "bar hides after clear (no boss)");
}

console.log("== 13b(j). attack callouts ==");
{
  await ensureL2();
  const callout = page.getByTestId("attack-callout");
  ok((await callout.count()) === 0, "no callouts without data");
  await L2(`fireAttack("TREMOR SLAM")`);
  await callout.first().waitFor({ state: "visible", timeout: 5000 });
  ok(((await callout.first().textContent()) ?? "").includes("TREMOR SLAM"), "TREMOR SLAM callout appears");
  await L2(`fireAttack("briar call")`);
  await page.waitForTimeout(300);
  const names = await callout.evaluateAll((els) => els.map((e) => e.getAttribute("data-attack-name")));
  ok(names.includes("BRIAR CALL"), `lowercase forced name uppercased (got ${names})`);
  await L2(`fireAttack("BULL CHARGE")`);
  await page.waitForTimeout(300);
  ok((await callout.count()) >= 1, "BULL CHARGE callout appears");
  // Callouts self-expire.
  await page.waitForTimeout(3000);
  ok((await callout.count()) === 0, "callouts expire on their own");
}

console.log("== 13b(k). page errors ==");
eq(errors.length, 0, `0 page errors (got ${errors.length}${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""})`);

await browser.close();
console.log(`\nbatch13b: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
