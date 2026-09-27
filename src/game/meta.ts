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
}

const KEY = "pz_meta_v1";

const EMPTY: MetaSave = {
  v: 1,
  lifetime: { kills: 0, headshots: 0, wavesCleared: 0, chestsOpened: 0, shrinesAttuned: 0, runsPlayed: 0 },
  questsDone: [],
};

export function loadMeta(): MetaSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const parsed = JSON.parse(raw) as Partial<MetaSave>;
    if (parsed.v !== 1 || !parsed.lifetime || !Array.isArray(parsed.questsDone)) return structuredClone(EMPTY);
    return { v: 1, lifetime: { ...EMPTY.lifetime, ...parsed.lifetime }, questsDone: [...parsed.questsDone] };
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
