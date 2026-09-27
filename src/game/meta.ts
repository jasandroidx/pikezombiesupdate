// Persistent county-record meta layer: lifetime stats + completed quests.
// localStorage only; no account, no sync. Versioned key so future schema
// changes can migrate instead of corrupting.

import { hashStringToSeed } from "./constants";
import { loadSave, writeSave } from "./save";

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

// ---------------------------------------------------------------------------
// Batch 7 — Lane B (data/meta): County Record Office permanent stat shop.
//
// 4 tracks x 4 tiers, bought with stubs (save.ts permanent currency — meta.ts
// tracks lifetime stats/quests but no currency of its own, so the shop spends
// the game's existing permanent coin). Tiers must be bought in order.
//
//   damage: Hartwell Grit   +4% damage/tier
//   hp:     Highwall Hide   +10% max HP/tier
//   speed:  Trace Stride    +3% move speed/tier
//   xp:     Enos Ledger     +5% XP gain/tier
//
// ENGINE INTEGRATION POINT (coordinator): at player init, read getRunStatMods()
// and multiply it into the player's base stats:
//   damage *= mods.damageMul; maxHp *= mods.hpMul; speed *= mods.speedMul;
// XP gain applies to whatever awards XP (grit-to-XP / xpMult in the sim).
// ---------------------------------------------------------------------------

export type StatShopTrackId = "damage" | "hp" | "speed" | "xp";

export interface StatShopTrack {
  id: StatShopTrackId;
  /** County-flavored display name. */
  name: string;
  /** What each tier does, in plain words. */
  perTier: string;
  flavor: string;
  /** Stub cost of tier 1..4 in order. */
  costs: [number, number, number, number];
}

export const STAT_SHOP: StatShopTrack[] = [
  {
    id: "damage",
    name: "Hartwell Grit",
    perTier: "+4% damage",
    flavor: "Coal-camp toughness, mined at the old Wulfman slope. You hit meaner because you've dug deeper.",
    costs: [100, 250, 500, 1000],
  },
  {
    id: "hp",
    name: "Highwall Hide",
    perTier: "+10% max HP",
    flavor: "Sandstone dust and scar tissue. The Stendal highwall breathes on you and you stand anyway.",
    costs: [100, 250, 500, 1000],
  },
  {
    id: "speed",
    name: "Trace Stride",
    perTier: "+3% move speed",
    flavor: "You walked the Buffalo Trace end to end and it walked back through your legs.",
    costs: [100, 250, 500, 1000],
  },
  {
    id: "xp",
    name: "Enos Ledger",
    perTier: "+5% XP gain",
    flavor: "Every pocket counted at the Old Ben company store. Nobody's leavings go uncounted on your watch.",
    costs: [100, 250, 500, 1000],
  },
];

export const STAT_SHOP_MAX_TIER = 4;

/** Current state for the shop UI: defs + purchased tiers + stub balance. */
export function getStatShop(): {
  tracks: StatShopTrack[];
  tiers: Record<string, number>;
  stubs: number;
} {
  const save = loadSave();
  return { tracks: STAT_SHOP, tiers: { ...(save.shopTiers ?? {}) }, stubs: save.stubs };
}

/**
 * Buy the next tier of a track. Validates track id, tier order (sequential),
 * max tier, and stub balance. Persists via save.ts. Does NOT throw.
 */
export function buyStat(trackId: string): { ok: boolean; reason?: string } {
  const track = STAT_SHOP.find((t) => t.id === trackId);
  if (!track) return { ok: false, reason: "unknown track" };
  const save = loadSave();
  const tiers = { ...(save.shopTiers ?? {}) };
  const cur = tiers[trackId] ?? 0;
  if (cur >= STAT_SHOP_MAX_TIER) return { ok: false, reason: "maxed" };
  const cost = track.costs[cur];
  if (save.stubs < cost) return { ok: false, reason: "insufficient stubs" };
  writeSave({ stubs: save.stubs - cost, shopTiers: { ...tiers, [trackId]: cur + 1 } });
  return { ok: true };
}

export interface RunStatMods {
  damageMul: number;
  hpMul: number;
  speedMul: number;
  xpMul: number;
}

/**
 * Permanent run modifiers from County Record Office purchases.
 * The engine calls this at player init and multiplies them into base stats.
 */
export function getRunStatMods(): RunStatMods {
  const t = loadSave().shopTiers ?? {};
  const dmg = t.damage ?? 0;
  const hp = t.hp ?? 0;
  const spd = t.speed ?? 0;
  const xp = t.xp ?? 0;
  return {
    damageMul: 1 + 0.04 * dmg,
    hpMul: 1 + 0.1 * hp,
    speedMul: 1 + 0.03 * spd,
    xpMul: 1 + 0.05 * xp,
  };
}
