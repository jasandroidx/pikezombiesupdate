// Persistent county-record meta layer: lifetime stats + completed quests.
// localStorage only; no account, no sync. Versioned key so future schema
// changes can migrate instead of corrupting.

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
