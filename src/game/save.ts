const KEY = "pcz_save_v2";
const SAVE_VERSION = 3;

export interface CountyRanks {
  boots: number;
  hide: number;
  magnet: number;
}

export interface GameSave {
  version: number;
  highScore: number;
  bestWave: number;
  unlockedWeapons: string[];
  journal: string[];
  mapsCleared: string[];
  outbreakBeaten: boolean;
  lastRadio: string;
  stubs: number;
  ranks: CountyRanks;
  lastPaid: string;
}

const defaults: GameSave = {
  version: SAVE_VERSION,
  highScore: 0,
  bestWave: 0,
  unlockedWeapons: ["revolver", "shotgun"],
  journal: [],
  mapsCleared: [],
  outbreakBeaten: false,
  lastRadio: "",
  stubs: 0,
  ranks: { boots: 0, hide: 0, magnet: 0 },
  lastPaid: "",
};

const RANK_COST = [6, 12, 20];

function migrate(raw: Partial<GameSave> & { version?: number }): GameSave {
  const s: GameSave = { ...defaults, ...raw, version: raw.version ?? 1, ranks: { ...defaults.ranks, ...(raw.ranks ?? {}) } };
  if (!s.unlockedWeapons?.length) s.unlockedWeapons = defaults.unlockedWeapons;
  if (typeof s.stubs !== "number") s.stubs = 0;
  s.version = SAVE_VERSION;
  return s;
}

export function loadSave(): GameSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const legacy = parseInt(localStorage.getItem("pike_county_high_score") || "0", 10);
      if (legacy > 0) return migrate({ highScore: legacy, version: 1 });
      return { ...defaults };
    }
    return migrate(JSON.parse(raw) as Partial<GameSave>);
  } catch {
    return { ...defaults };
  }
}

export function writeSave(patch: Partial<GameSave>) {
  try {
    const next = { ...loadSave(), ...patch, version: SAVE_VERSION };
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadSave();
  }
}

export function stubsEarned(kills: number, wave: number, won: boolean) {
  return Math.max(1, Math.round(kills * 0.35 + wave * 1.5 + (won ? 8 : 0)));
}

export function payForRun(key: string, kills: number, wave: number, won: boolean) {
  const cur = loadSave();
  if (cur.lastPaid === key) return cur;
  const paid = stubsEarned(kills, wave, won);
  return writeSave({ stubs: cur.stubs + paid, lastPaid: key });
}

export function rankCost(rank: number) {
  return RANK_COST[rank] ?? 0;
}

export function buyRank(id: keyof CountyRanks) {
  const cur = loadSave();
  const rank = cur.ranks[id] ?? 0;
  if (rank >= 3) return cur;
  const cost = RANK_COST[rank];
  if (cur.stubs < cost) return cur;
  return writeSave({
    stubs: cur.stubs - cost,
    ranks: { ...cur.ranks, [id]: rank + 1 },
  });
}

export function recordRun(opts: {
  score: number;
  wave: number;
  unlocked: string[];
  notes: string[];
  mapId?: string;
  outbreakWon?: boolean;
}) {
  const cur = loadSave();
  writeSave({
    highScore: Math.max(cur.highScore, opts.score),
    bestWave: Math.max(cur.bestWave, opts.wave),
    unlockedWeapons: Array.from(new Set([...cur.unlockedWeapons, ...opts.unlocked])),
    journal: Array.from(new Set([...cur.journal, ...opts.notes])),
    mapsCleared: opts.mapId ? Array.from(new Set([...cur.mapsCleared, opts.mapId])) : cur.mapsCleared,
    outbreakBeaten: cur.outbreakBeaten || Boolean(opts.outbreakWon),
  });
}
