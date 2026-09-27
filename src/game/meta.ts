// Persistent county-record meta layer: lifetime stats + completed quests.
// localStorage only; no account, no sync. Versioned key so future schema
// changes can migrate instead of corrupting.

import { hashStringToSeed } from "./constants";
import { loadSave, writeSave } from "./save";
import {
  DEFAULT_CHARACTER_ID,
  DEFAULT_STAGE_ID,
  characterDef,
  characterExists,
  stageDef,
  stageExists,
} from "./roster";

// Re-export the roster contract Lane 1 consumes at run start:
//   selectedCharacterId() / selectedStageId() — persisted picks (pure getters)
//   characterDef(id) / stageDef(id) — roster entries (weaponId + passive mods
//     on characters; rule flags on stages). Never throw on unknown ids.
export { characterDef, stageDef };

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
  // Batch 10 — Lane 3: County Record bloodline tree — branch id ->
  // purchased tier count (0..4). Old saves without `tree` load as {}
  // (see loadMeta below), so existing saves keep working.
  tree: Record<string, number>;
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
  tree: {},
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
      tree: sanitizeTree(parsed.tree),
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
 *
 * Batch 10 — Lane 3: bloodline-tree bonuses fold into the same object, so
 * tree capstones reach run start through the existing run-mods channel
 * (applyRunStatMods in engine.ts) with no engine changes.
 */
export function getRunStatMods(): RunStatMods {
  const t = loadSave().shopTiers ?? {};
  const dmg = t.damage ?? 0;
  const hp = t.hp ?? 0;
  const spd = t.speed ?? 0;
  const xp = t.xp ?? 0;
  const tree = loadMeta().tree ?? {};
  return {
    damageMul: (1 + 0.04 * dmg) * (1 + treeBranchBonus("deadeye", tree.deadeye ?? 0)),
    hpMul: (1 + 0.1 * hp) * (1 + treeBranchBonus("homesteader", tree.homesteader ?? 0)),
    speedMul: 1 + 0.03 * spd,
    xpMul: (1 + 0.05 * xp) * (1 + treeBranchBonus("scrounger", tree.scrounger ?? 0)),
  };
}

// ---------------------------------------------------------------------------
// Batch 9 — Lane 4 (UI/meta): character + stage selection persistence.
//
// Two tiny keys beside pz_meta_v1 so roster picks survive schema migrations.
// Getters validate against the roster and fall back to the defaults
// (revolver-toting deputy / White Oak Springs) — a stale or hand-edited key
// can never break run start.
//
// ENGINE INTEGRATION POINT (Lane 1): at run start, read
//   selectedCharacterId() -> characterDef(id).weaponId + .passiveName/.mods
//   selectedStageId()      -> stageDef(id).rules
// and apply them (starting weapon swap, passive stat mods, stage rule knobs).
// meta.ts re-exports characterDef/stageDef above for that one import.
// ---------------------------------------------------------------------------

const CHARACTER_KEY = "pz_character_v1";
const STAGE_KEY = "pz_stage_v1";

/** Persisted survivor pick. Defaults to the current survivor (the
 *  revolver-toting Petersburg deputy) so existing flows are unchanged. */
export function selectedCharacterId(): string {
  try {
    const v = localStorage.getItem(CHARACTER_KEY);
    if (v && characterExists(v)) return v;
  } catch {
    // Storage blocked: fall through to the default survivor.
  }
  return DEFAULT_CHARACTER_ID;
}

/** Persist a survivor pick. Ignores unknown ids (no throw). */
export function setSelectedCharacterId(id: string): void {
  if (!characterExists(id)) return;
  try {
    localStorage.setItem(CHARACTER_KEY, id);
  } catch {
    // Storage full/blocked: the pick lasts for this session only.
  }
}

/** Persisted stage pick. Defaults to White Oak Springs. */
export function selectedStageId(): string {
  try {
    const v = localStorage.getItem(STAGE_KEY);
    if (v && stageExists(v)) return v;
  } catch {
    // Storage blocked: fall through to the default stage.
  }
  return DEFAULT_STAGE_ID;
}

/** Persist a stage pick. Ignores unknown ids (no throw). */
export function setSelectedStageId(id: string): void {
  if (!stageExists(id)) return;
  try {
    localStorage.setItem(STAGE_KEY, id);
  } catch {
    // Storage full/blocked: the pick lasts for this session only.
  }
}

// ---------------------------------------------------------------------------
// Batch 10 — Lane 3 (meta/UI): County Record bloodline tree.
//
// The lifetime quests above grow into a spendable permanent-stat tree:
// 3 branches x 4 tiers (12 nodes), bought with stubs — the same permanent
// coin the County Record Office stat shop spends (save.ts). Tiers in a
// branch are bought in order; tier 4 is a capstone with a large wired bonus.
//
// Every node maps into the four channels the engine ALREADY applies at run
// start through getRunStatMods() (damageMul / hpMul / speedMul / xpMul —
// see applyRunStatMods in engine.ts). The tree needs no engine changes: the
// engine merges whatever getRunStatMods() returns, so capstone effects reach
// run start through the existing run-mods channel.
//
//   homesteader: survivability — adds to hpMul
//   deadeye:     damage       — adds to damageMul
//   scrounger:   economy      — adds to xpMul (grit/XP pickup economy)
//
// ENGINE INTEGRATION POINT (already landed, no coordinator work needed):
//   applyRunStatMods() in engine.ts calls getRunStatMods() at player init.
//   This module folds tree bonuses into that same object.
// ---------------------------------------------------------------------------

export type MetaTreeBranchId = "homesteader" | "deadeye" | "scrounger";

export interface MetaTreeNode {
  /** 1..4. Tier 4 is the capstone. */
  tier: 1 | 2 | 3 | 4;
  name: string;
  /** Plain-words effect, e.g. "+8% max HP". */
  effect: string;
  flavor: string;
  /** Stub cost of this tier. */
  cost: number;
  /** True on the tier-4 capstone. */
  capstone: boolean;
  /** Additive bonus this node contributes to its branch multiplier. */
  bonus: number;
}

export interface MetaTreeBranch {
  id: MetaTreeBranchId;
  name: string;
  /** One-word theme: what the branch buys. */
  theme: string;
  flavor: string;
  nodes: [MetaTreeNode, MetaTreeNode, MetaTreeNode, MetaTreeNode];
}

export const META_TREE: MetaTreeBranch[] = [
  {
    id: "homesteader",
    name: "Homesteader",
    theme: "Survivability",
    flavor: "Generations that stayed. The county keeps the ones who dig in.",
    nodes: [
      {
        tier: 1,
        name: "Stone Foundation",
        effect: "+8% max HP",
        flavor: "Footings set in Petersburg limestone. The house — and you — stands.",
        cost: 200,
        capstone: false,
        bonus: 0.08,
      },
      {
        tier: 2,
        name: "Storm Cellar",
        effect: "+8% max HP",
        flavor: "Every farm on the trace keeps a cellar door. You've learned to live behind yours.",
        cost: 500,
        capstone: false,
        bonus: 0.08,
      },
      {
        tier: 3,
        name: "Backbone Shoulders",
        effect: "+9% max HP",
        flavor: "Hauled coal up the Stendal backbone till your shoulders forgot how to quit.",
        cost: 1200,
        capstone: false,
        bonus: 0.09,
      },
      {
        tier: 4,
        name: "Dug In Deep",
        effect: "+25% max HP",
        flavor: "Capstone. The county record lists your name under one word: unmoved.",
        cost: 2500,
        capstone: true,
        bonus: 0.25,
      },
    ],
  },
  {
    id: "deadeye",
    name: "Deadeye",
    theme: "Damage",
    flavor: "The Washington Township line breeds patience and punishes a miss.",
    nodes: [
      {
        tier: 1,
        name: "Trigger Discipline",
        effect: "+6% damage",
        flavor: "Breathe out, squeeze, don't jerk it. Eula's rule, everybody's rule.",
        cost: 200,
        capstone: false,
        bonus: 0.06,
      },
      {
        tier: 2,
        name: "Cold Barrel",
        effect: "+6% damage",
        flavor: "First shot of a frost morning flies truest. You keep that cold in you.",
        cost: 500,
        capstone: false,
        bonus: 0.06,
      },
      {
        tier: 3,
        name: "Patoka Marksman",
        effect: "+7% damage",
        flavor: "Shot squirrels off the far bank of the Patoka at two hundred yards. The dead are bigger.",
        cost: 1200,
        capstone: false,
        bonus: 0.07,
      },
      {
        tier: 4,
        name: "Ledger of the Dead",
        effect: "+22% damage",
        flavor: "Capstone. Every name you ever put down, tallied in one column. The column pays out.",
        cost: 2500,
        capstone: true,
        bonus: 0.22,
      },
    ],
  },
  {
    id: "scrounger",
    name: "Scrounger",
    theme: "Economy",
    flavor: "Nothing wasted on the trace. You pick the county clean and it thanks you.",
    nodes: [
      {
        tier: 1,
        name: "Pocket Ledger",
        effect: "+7% XP gain",
        flavor: "Counted every pocket at the Old Ben company store. Grit's no different.",
        cost: 200,
        capstone: false,
        bonus: 0.07,
      },
      {
        tier: 2,
        name: "Gleaner's Eye",
        effect: "+8% XP gain",
        flavor: "Walk a picked field behind the harvest and find dinner. Walk a dead wave and find grit.",
        cost: 500,
        capstone: false,
        bonus: 0.08,
      },
      {
        tier: 3,
        name: "Trace Walker",
        effect: "+9% XP gain",
        flavor: "You walked the Buffalo Trace end to end and brought back everything that wasn't nailed down.",
        cost: 1200,
        capstone: false,
        bonus: 0.09,
      },
      {
        tier: 4,
        name: "Company Store",
        effect: "+25% XP gain",
        flavor: "Capstone. The whole county's leavings flow through your hands, and your hands keep count.",
        cost: 2500,
        capstone: true,
        bonus: 0.25,
      },
    ],
  },
];

export const META_TREE_MAX_TIER = 4;

/** Keep only known branch ids with sane 0..4 integer tiers. */
function sanitizeTree(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const b of META_TREE) {
      const v = (raw as Record<string, unknown>)[b.id];
      if (typeof v === "number" && Number.isFinite(v)) {
        out[b.id] = Math.max(0, Math.min(META_TREE_MAX_TIER, Math.floor(v)));
      }
    }
  }
  return out;
}

/** Current state for the tree UI: defs + purchased tiers + stub balance. */
export function getMetaTree(): {
  branches: MetaTreeBranch[];
  tiers: Record<MetaTreeBranchId, number>;
  stubs: number;
} {
  const tree = loadMeta().tree;
  const tiers = {} as Record<MetaTreeBranchId, number>;
  for (const b of META_TREE) tiers[b.id] = tree[b.id] ?? 0;
  return { branches: META_TREE, tiers, stubs: loadSave().stubs };
}

/**
 * Total additive bonus a branch contributes at a given tier count
 * (sum of node bonuses for tiers 1..n). Used by getRunStatMods().
 */
export function treeBranchBonus(branchId: string, tiers: number): number {
  const branch = META_TREE.find((b) => b.id === branchId);
  if (!branch) return 0;
  let sum = 0;
  const n = Math.max(0, Math.min(META_TREE_MAX_TIER, Math.floor(tiers)));
  for (let i = 0; i < n; i++) sum += branch.nodes[i].bonus;
  return sum;
}

/**
 * Buy the next tier of a branch. Validates branch id, tier order
 * (sequential), max tier, and stub balance. Persists tiers via meta.ts
 * (pz_meta_v1) and spends stubs via save.ts. Does NOT throw.
 */
export function buyTreeTier(branchId: string): { ok: boolean; reason?: string } {
  const branch = META_TREE.find((b) => b.id === branchId);
  if (!branch) return { ok: false, reason: "unknown branch" };
  const meta = loadMeta();
  const cur = meta.tree[branch.id] ?? 0;
  if (cur >= META_TREE_MAX_TIER) return { ok: false, reason: "maxed" };
  const node = branch.nodes[cur];
  const save = loadSave();
  if (save.stubs < node.cost) return { ok: false, reason: "insufficient stubs" };
  meta.tree = { ...meta.tree, [branch.id]: cur + 1 };
  saveMeta(meta);
  writeSave({ stubs: save.stubs - node.cost });
  return { ok: true };
}
