// Batch 12 — Lane 3 (UI/audio) tests.
// (a) Pure sections run in plain node via jiti (TS/TSX sources imported
//     directly).
//   node_modules/.bin/jiti tests/batch12c.mjs
// (b) Live section runs under Playwright against a dev server.
//   PZ_URL=http://127.0.0.1:8082 node_modules/.bin/jiti tests/batch12c.mjs

import {
  KNOWN_EVENT_META,
  MUTATOR_LABELS,
  eventLabelFor,
  mutatorLabel,
  mutatorLabelsFor,
  trackerText,
} from "../src/components/game/eventMeta.ts";

let pass = 0, fail = 0;
const blocked = [];
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", label); }
}
function eq(a, b, label) { ok(a === b, `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

console.log("== 12c(a). mutator labels (pure) ==");
eq(mutatorLabel("rich"), "Rich ground", "rich -> Rich ground");
eq(mutatorLabel("dry"), "Dry county", "dry -> Dry county");
eq(mutatorLabel("fog"), "Bottom fog", "fog -> Bottom fog");
eq(mutatorLabel("nope"), null, "unknown id -> null (dropped)");
eq(mutatorLabel(""), null, "empty id -> null");
eq(mutatorLabel(null), null, "null id -> null");
eq(mutatorLabel(undefined), null, "undefined id -> null");
eq(mutatorLabel(42), null, "non-string id -> null");
ok(Object.keys(MUTATOR_LABELS).length === 3, "exactly 3 known mutators");
eq(mutatorLabelsFor(["rich", "dry", "nope", "rich"]).join(","), "Rich ground,Dry county", "labelsFor: unknowns dropped, dupes collapsed");
eq(mutatorLabelsFor([]).length, 0, "labelsFor: empty -> []");
eq(mutatorLabelsFor(null).length, 0, "labelsFor: null -> []");

console.log("== 12c(b). event labels + tracker text (pure) ==");
eq(eventLabelFor("powerup_shower"), "Powerup Shower", "shower label");
eq(eventLabelFor("elite_hunt"), "Elite Hunt", "hunt label");
eq(eventLabelFor("golden_swarm"), "golden swarm", "unknown event id humanized");
eq(eventLabelFor(null), "Event", "null id -> generic Event");
eq(eventLabelFor(""), "Event", "empty id -> generic Event");
eq(trackerText({ id: "elite_hunt", total: 5, remaining: 3 }), "Elite Hunt: 3/5 remaining", "hunt tracker text");
eq(trackerText({ id: "powerup_shower", total: 12, remaining: 7 }), "Powerup Shower: 7/12 remaining", "shower tracker text");
for (const id of ["powerup_shower", "elite_hunt"]) {
  const m = KNOWN_EVENT_META[id];
  ok(m && typeof m.title === "string" && m.title.length > 0, `${id}: fallback title set`);
  ok(m && typeof m.body === "string" && m.body.length > 0, `${id}: fallback body set`);
}

console.log("== 12c(c). Indiana-only naming (lane 3 files) ==");
{
  const fs = await import("fs");
  // Note: this test file is excluded from the scan because it necessarily
  // contains the banned-word list itself.
  const scanFiles = [
    "src/components/game/eventMeta.ts",
    "src/components/game/EventBanners.tsx",
    "src/components/game/MutatorChips.tsx",
    "src/components/game/StartScreen.tsx",
    "src/routes/index.tsx",
    "src/audio/soundEngine.ts",
  ];
  for (const f of scanFiles) {
    const src = fs.readFileSync(f, "utf8").toLowerCase();
    for (const bad of ["bayville", "griggsville", "illinois"]) {
      ok(!src.includes(bad), `${f}: no "${bad}"`);
    }
  }
}

console.log("== 12c(d). RUN_EVENTS contract (engine lane; skipped if not landed) ==");
{
  const { RUN_EVENTS } = await import("../src/game/constants.ts");
  const ids = RUN_EVENTS.map((e) => e.id);
  for (const id of ["powerup_shower", "elite_hunt"]) {
    if (!ids.includes(id)) {
      blocked.push(`RUN_EVENTS missing ${id} (engine lane not landed in this checkout)`);
      continue;
    }
    const def = RUN_EVENTS.find((e) => e.id === id);
    ok(typeof def.banner === "string" && def.banner.length > 0, `${id}: banner text set`);
    ok(typeof def.radio === "string" && def.radio.length > 0, `${id}: radio text set`);
    const hay = `${def.banner} ${def.radio}`.toLowerCase();
    for (const bad of ["bayville", "griggsville", "illinois"]) {
      ok(!hay.includes(bad), `${id}: no "${bad}" in banner/radio`);
    }
  }
}

// ================= Live section (Playwright) =================
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
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  console.log("-- title: daily mutator chips --");
  ok(await page.getByRole("heading", { name: "PIKE COUNTY" }).isVisible(), "title screen renders");
  const dailyChips = page.getByTestId("daily-mutator-chips");
  eq(await dailyChips.count(), 0, "daily chips hidden when no mutators picked");
  await page.getByRole("button", { name: "Rich ground" }).click();
  await dailyChips.waitFor({ state: "visible", timeout: 5000 });
  ok((await dailyChips.textContent())?.includes("Rich ground"), "daily chips show picked mutator");
  await page.getByRole("button", { name: "Rich ground" }).click();
  await dailyChips.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  eq(await dailyChips.count(), 0, "daily chips hidden again after unpick");

  console.log("-- in-run: HUD mutator chips --");
  await page.getByRole("button", { name: "Dry county" }).click();
  await page.locator("#start-survival").click();
  const runChips = page.getByTestId("run-mutator-chips");
  await runChips.waitFor({ state: "visible", timeout: 8000 });
  ok((await runChips.textContent())?.includes("Dry county"), "in-run HUD chips show active mutator");
  await page.waitForFunction(() => !!window.__controlsTest?.fireEvent, null, { timeout: 10000 });
  ok(await page.evaluate(() => typeof window.__pzLane3?.fireEventBanner === "function"), "__pzLane3 test hook present");

  console.log("-- banners: real engine callback path --");
  const banner = page.getByTestId("event-banner");
  await page.evaluate(() => window.__controlsTest.fireEvent("golden_swarm"));
  await banner.waitFor({ state: "visible", timeout: 5000 });
  eq(await banner.getAttribute("data-event-id"), "golden_swarm", "golden_swarm banner via engine onRadio");
  ok(((await banner.textContent()) || "").includes("GOLDEN SWARM"), "golden_swarm banner title");

  console.log("-- banners: new events via forced callback --");
  await page.evaluate(() => window.__pzLane3.fireEventBanner("powerup_shower"));
  await banner.waitFor({ state: "visible", timeout: 5000 });
  eq(await banner.getAttribute("data-event-id"), "powerup_shower", "powerup_shower banner fires");
  ok(((await banner.textContent()) || "").includes("POWERUP SHOWER"), "powerup_shower title text");
  await page.evaluate(() => window.__pzLane3.fireEventBanner("elite_hunt"));
  await banner.waitFor({ state: "visible", timeout: 5000 });
  eq(await banner.getAttribute("data-event-id"), "elite_hunt", "elite_hunt banner fires");
  ok(((await banner.textContent()) || "").includes("ELITE HUNT"), "elite_hunt title text");
  await page.evaluate(() => window.__pzLane3.fireEventBanner("not_a_real_event"));
  await page.waitForTimeout(400);
  eq(await banner.getAttribute("data-event-id"), "elite_hunt", "unknown event id does not banner");

  console.log("-- tracker: counts down via forced probe --");
  const tracker = page.getByTestId("event-tracker");
  await page.evaluate(() => {
    window.__huntN = 3;
    window.__controlsTest.eventState = (id) =>
      id === "elite_hunt" ? { total: 5, remaining: window.__huntN } : null;
  });
  await page.evaluate(() => window.__pzLane3.fireEventBanner("elite_hunt"));
  await page.waitForFunction(
    () => (document.querySelector('[data-testid="event-tracker"]')?.textContent || "").includes("Elite Hunt: 3/5 remaining"),
    null,
    { timeout: 8000 },
  );
  ok(true, "tracker shows 3/5");
  await page.evaluate(() => { window.__huntN = 2; });
  await page.waitForFunction(
    () => (document.querySelector('[data-testid="event-tracker"]')?.textContent || "").includes("Elite Hunt: 2/5 remaining"),
    null,
    { timeout: 8000 },
  );
  ok(true, "tracker counts down to 2/5");
  await page.evaluate(() => { delete window.__controlsTest.eventState; });
  await tracker.waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  eq(await tracker.count(), 0, "tracker hides when probe is absent");

  console.log("-- stingers: direct calls, no errors --");
  const stung = await page.evaluate(() => {
    const s = window.__pzLane3.sound;
    s.playPowerupShower();
    s.playEliteHunt();
    s.playFlamethrowerWhoosh();
    s.playRailgunCharge();
    s.playRailgunZap();
    return true;
  });
  ok(stung === true, "all 5 stinger methods called without throwing");

  ok(errors.length === 0, `zero page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await browser.close();
}

console.log(`\nbatch12c: ${pass} passed, ${fail} failed${blocked.length ? `, blocked: ${blocked.join("; ")}` : ""}`);
if (fail > 0) process.exit(1);
