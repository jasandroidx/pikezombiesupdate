// Persistent county-record meta layer: lifetime stats + completed quests.
// localStorage only; no account, no sync. Versioned key so future schema
// changes can migrate instead of corrupting.

import { hashStringToSeed } from "./constants";

export interface LifetimeStats {
  kills: number;
  headshots: number;
  wavesCleared: number;
  chestsOpened: number;
  shrinesAttuned: number;
  runsPlayed: number;
}

export interface MetaSave {
  v: number;
  lifetime: LifetimeStats;
  questsDone: string[];
  // Batch 4: Hall of Records — top-5 runs by score. Old saves without
  // `runs` load as [] (see loadMeta below), so existing saves keep working.
  runs: RunRecord[];
  // Batch 5: daily-challenge participation — map of "YYYY-MM-DD" -> true.
  // Old saves without `daily` load as {} (see loadMeta below), so existing
  // saves keep working.
  daily: Record<string, true>;
}

export interface RunRecord {
  score: number;
  kills: number;
  time: number; // survival seconds
  level: number;
  date: number; // Date.now() at run end
}

export const HALL_MAX = 5;

const KEY = "pz_meta_v1";

const EMPTY: MetaSave = {
  v: 1,
  lifetime: { kills: 0, headshots: 0, wavesCleared: 0, chestsOpened: 0, shrinesAttuned: 0, runsPlayed: 0 },
  questsDone: [],
  runs: [],
  daily: {},
};

function validRun(r: any): r is RunRecord {
  return r && typeof r.score === "number" && typeof r.kills === "number" &&
    typeof r.time === "number" && typeof r.level === "number" && typeof r.date === "number";
}

export function loadMeta(): MetaSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const parsed = JSON.parse(raw) as Partial<MetaSave>;
    if (parsed.v !== 1 || !parsed.lifetime || !Array.isArray(parsed.questsDone)) return structuredClone(EMPTY);
    return {
      v: 1,
      lifetime: { ...EMPTY.lifetime, ...parsed.lifetime },
      questsDone: [...parsed.questsDone],
      runs: Array.isArray(parsed.runs) ? parsed.runs.filter(validRun).slice(0, HALL_MAX) : [],
      daily: parsed.daily && typeof parsed.daily === "object" ? { ...(parsed.daily as Record<string, true>) } : {},
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

export function saveMeta(meta: MetaSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    // Storage full/blocked: meta just doesn't persist this session.
  }
}

// ---------------------------------------------------------------------------
// Hall of Records: local top-5 runs. Persisted inside the existing pz_meta_v1
// save shape — old saves without `runs` keep working (load as []).
//
// ENGINE INTEGRATION POINT (coordinator): death flows through
//   handleGameOver() in src/game/engine.ts (~line 3240), which fires
//   this.callbacks.onGameOver(this.stats, this.score, this.lastKiller).
// The React death screen renders in src/routes/index.tsx:
//   - the `onGameOver` callback (line ~217) sets gameOverData + setScreen("game_over")
//   - the overlay itself renders at `{screen === "game_over" && (...)}` (~line 666)
// Call recordRun({ score, kills: stats.kills, time: stats.survivalTime,
// level: this.level, date: Date.now() }) inside handleGameOver (next to the
// existing saveMeta(this.meta)), and render topRuns() in the game_over overlay.
// ---------------------------------------------------------------------------

export function recordRun(entry: { score: number; kills: number; time: number; level: number; date: number }): MetaSave {
  const meta = loadMeta();
  meta.runs = [...meta.runs, { ...entry }].sort((a, b) => b.score - a.score).slice(0, HALL_MAX);
  saveMeta(meta);
  return meta;
}

export function topRuns(): RunRecord[] {
  return loadMeta().runs;
}

// ---------------------------------------------------------------------------
// Daily challenge deterministic seed (Batch 5, VS/S16). Same date -> same
// seed for every player, derived purely from the calendar date.
//
// INTEGRATION (coordinator):
//   - Call getDailySeed() when the title screen's "Daily Run" button is
//     pressed and pass the seed into the engine (see mulberry32 docs in
//     constants.ts for the Math.random replacement points).
//   - Call markDailyPlayed() when a daily run starts (or ends — pick one;
//     starting is simpler: it marks "attempted today"). dailyPlayed() drives
//     the "Played ✓" badge on the title button.
//   - dateStr format is "YYYY-MM-DD" LOCAL time (not UTC), so the seed rolls
//     over at local midnight for everyone in their own timezone.
// ---------------------------------------------------------------------------

/** Local "YYYY-MM-DD" for now (or a supplied date). */
export function dailyDateStr(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Deterministic daily seed: same date string -> same uint32 for everyone. */
export function getDailySeed(dateStr: string = dailyDateStr()): number {
  return hashStringToSeed(`pcz-daily:${dateStr}`);
}

/** Has today's (or the given date's) daily been played? */
export function dailyPlayed(dateStr: string = dailyDateStr()): boolean {
  return loadMeta().daily[dateStr] === true;
}

/** Mark today's (or the given date's) daily as played. Returns updated meta. */
export function markDailyPlayed(dateStr: string = dailyDateStr()): MetaSave {
  const meta = loadMeta();
  meta.daily[dateStr] = true;
  saveMeta(meta);
  return meta;
}
