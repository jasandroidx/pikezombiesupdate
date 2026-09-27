// Batch 10 — Lane 3: save export / import.
//
// Pure localStorage helpers (no React) so the validation logic is unit
// testable in node. The game's own keys all start with `pz_` / `pz-`;
// pcz_save_v2 is the one legacy key we also carry, because it holds the
// stub currency, unlocks, and stat-shop tiers the tree spends.

export const SAVE_EXPORT_GAME = "pike-county-zombies";
export const SAVE_EXPORT_VERSION = 1;

/** Hard cap per key value: a save file should never be near this. */
export const SAVE_EXPORT_MAX_VALUE_BYTES = 1_000_000;

const KEY_RE = /^pz[_-]/;
const EXTRA_KEYS: ReadonlySet<string> = new Set(["pcz_save_v2"]);

export interface SaveExport {
  game: string;
  version: number;
  exportedAt: string;
  keys: Record<string, string>;
}

/** Collect every exportable localStorage key into a portable object. */
export function collectSaveData(): SaveExport {
  const keys: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!KEY_RE.test(k) && !EXTRA_KEYS.has(k)) continue;
      const v = localStorage.getItem(k);
      if (v !== null) keys[k] = v;
    }
  } catch {
    // Storage blocked: export whatever (nothing) we could read.
  }
  return {
    game: SAVE_EXPORT_GAME,
    version: SAVE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    keys,
  };
}

export type ValidateResult =
  | { ok: true; keys: Record<string, string> }
  | { ok: false; reason: string };

/**
 * Validate an imported file's parsed JSON. Rejects anything that isn't one
 * of our export files: wrong game marker, bad keys, non-string values,
 * oversized values. Never throws.
 *
 * Note: values are NOT required to be JSON — pz_character_v1 / pz_stage_v1
 * store raw id strings, and those are legitimate save keys.
 */
export function validateSaveData(raw: unknown): ValidateResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "file is not a JSON object" };
  }
  const o = raw as Record<string, unknown>;
  if (o.game !== SAVE_EXPORT_GAME) {
    return { ok: false, reason: "not a Pike County save file" };
  }
  if (typeof o.version !== "number" || !Number.isFinite(o.version)) {
    return { ok: false, reason: "missing or invalid version" };
  }
  if (!o.keys || typeof o.keys !== "object" || Array.isArray(o.keys)) {
    return { ok: false, reason: "missing save data" };
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.keys as Record<string, unknown>)) {
    if (!KEY_RE.test(k) && !EXTRA_KEYS.has(k)) {
      return { ok: false, reason: `unexpected key "${k}"` };
    }
    if (typeof v !== "string") {
      return { ok: false, reason: `key "${k}" is not a string` };
    }
    if (v.length > SAVE_EXPORT_MAX_VALUE_BYTES) {
      return { ok: false, reason: `key "${k}" is too large` };
    }
    out[k] = v;
  }
  return { ok: true, keys: out };
}

/**
 * Write validated keys into localStorage. Only call with the output of
 * validateSaveData(). Skips keys that fail to write; never throws.
 */
export function applySaveData(keys: Record<string, string>): void {
  for (const [k, v] of Object.entries(keys)) {
    try {
      localStorage.setItem(k, v);
    } catch {
      // Storage full/blocked: keep going with the rest.
    }
  }
}

/** Serialize an export for download. */
export function serializeSaveData(data: SaveExport): string {
  return JSON.stringify(data, null, 2);
}
