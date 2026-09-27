import { useCallback, useEffect, useState } from "react";
import { SlidersHorizontal, X, RotateCcw, Zap } from "lucide-react";
import type { RefObject } from "react";
import type { GameEngine } from "@/game/engine";

/* =====================================================================
 * ENGINE API CONTRACT — for the coordinator (NOT yet in engine.ts)
 * ---------------------------------------------------------------------
 * This panel calls two hooks that don't exist yet on GameEngine. Both are
 * duck-typed and optional-chained, so the panel is runtime-safe today and
 * starts working the moment the coordinator lands the engine side.
 *
 *   setTuning(key: TuningKey, value: number): void
 *     key:   "hitstop" | "shake" | "kick" | "zoom" | "knockback"
 *            | "particles" | "flash"
 *     value: number multiplier. 1 = the engine's built-in default.
 *            Ranges the panel sends (clamped in the sliders below):
 *              hitstop:    0 .. 2   (freeze-frame duration scale; 0 = none)
 *              shake:      0 .. 2   (screen-shake magnitude scale)
 *              kick:       0 .. 2   (camera kick impulse scale)
 *              zoom:       0 .. 2   (zoom-punch scale)
 *              knockback:  0 .. 2   (zombie knockback distance scale)
 *              particles:  0 .. 2   (particle spawn-count scale; 0 = none)
 *              flash:      0 .. 1   (screen-flash alpha cap; 0 = fully off)
 *
 *   testImpact(): void
 *     Fire one synthetic heavy hit at the current reticle / screen center so
 *     the tuner can feel the current settings without starting a fight.
 *     Takes no arguments.
 * ===================================================================== */

export type TuningKey = "hitstop" | "shake" | "kick" | "zoom" | "knockback" | "particles" | "flash";

/** Duck-typed view of GameEngine for hooks the coordinator has not landed. */
interface TuningEngineApi {
  setTuning?: (key: TuningKey, value: number) => void;
  testImpact?: () => void;
}

const STORAGE_KEY = "pz-tuning-v1";

const SLIDERS: { key: TuningKey; label: string; min: number; max: number; step: number }[] = [
  { key: "hitstop", label: "Hitstop", min: 0, max: 2, step: 0.05 },
  { key: "shake", label: "Screen shake", min: 0, max: 2, step: 0.05 },
  { key: "kick", label: "Camera kick", min: 0, max: 2, step: 0.05 },
  { key: "zoom", label: "Zoom punch", min: 0, max: 2, step: 0.05 },
  { key: "knockback", label: "Knockback", min: 0, max: 2, step: 0.05 },
  { key: "particles", label: "Particles", min: 0, max: 2, step: 0.05 },
  { key: "flash", label: "Screen flash", min: 0, max: 1, step: 0.05 },
];

const DEFAULTS: Record<TuningKey, number> = {
  hitstop: 1,
  shake: 1,
  kick: 1,
  zoom: 1,
  knockback: 1,
  particles: 1,
  flash: 1,
};

function loadStored(): Record<TuningKey, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<TuningKey, number>>;
      const out = { ...DEFAULTS };
      for (const s of SLIDERS) {
        const v = parsed[s.key];
        if (typeof v === "number" && Number.isFinite(v)) out[s.key] = Math.min(s.max, Math.max(s.min, v));
      }
      return out;
    }
  } catch {
    /* corrupted storage -> defaults */
  }
  return { ...DEFAULTS };
}

function saveStored(values: Record<TuningKey, number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    /* storage full / blocked -> tuning still works for this session */
  }
}

/**
 * Push the persisted tuning values into a (possibly fresh) engine.
 * Called from index.tsx right after bootEngine so a new run adopts the
 * tuner's saved settings. Runtime-safe until setTuning exists.
 */
export function applyStoredTuning(engine: GameEngine | null) {
  const api = engine as unknown as TuningEngineApi | null;
  const values = loadStored();
  for (const s of SLIDERS) api?.setTuning?.(s.key, values[s.key]);
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">{label}</span>
        <span className="font-mono text-[11px] text-accent">{value.toFixed(2)}&times;</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-accent"
        aria-label={label}
      />
    </label>
  );
}

export function TuningPanel({
  engineRef,
  onClose,
}: {
  engineRef: RefObject<GameEngine | null>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<TuningKey, number>>(loadStored);

  const push = useCallback(
    (key: TuningKey, value: number) => {
      const api = engineRef.current as unknown as TuningEngineApi | null;
      api?.setTuning?.(key, value);
    },
    [engineRef],
  );

  // When the panel opens, push the current (persisted) values so the live
  // engine adopts them — e.g. after returning to the title and starting
  // a fresh run.
  useEffect(() => {
    const api = engineRef.current as unknown as TuningEngineApi | null;
    const stored = loadStored();
    setValues(stored);
    for (const s of SLIDERS) api?.setTuning?.(s.key, stored[s.key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (key: TuningKey, value: number) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      saveStored(next);
      return next;
    });
    push(key, value);
  };

  const handleReset = () => {
    setValues({ ...DEFAULTS });
    saveStored({ ...DEFAULTS });
    for (const s of SLIDERS) push(s.key, DEFAULTS[s.key]);
  };

  const handleTestImpact = () => {
    const api = engineRef.current as unknown as TuningEngineApi | null;
    api?.testImpact?.();
  };

  return (
    <div
      data-testid="tuning-panel"
      className="absolute top-3 right-3 z-[60] max-h-[calc(100vh-1.5rem)] w-72 overflow-y-auto rounded border border-accent/60 bg-surface p-4 shadow-2xl"
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-accent" />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">Field tuning</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border bg-bg p-1.5 text-muted hover:text-fg"
          aria-label="Close tuning panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-3 font-lore text-[11px] leading-snug text-muted">
        Hidden panel — press backtick to toggle. Saved to this browser.
      </p>

      <div className="flex flex-col gap-2">
        {SLIDERS.map((s) => (
          <Slider
            key={s.key}
            label={s.label}
            value={values[s.key]}
            min={s.min}
            max={s.max}
            step={s.step}
            onChange={(v) => handleChange(s.key, v)}
          />
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={handleTestImpact}
          className="flex flex-1 items-center justify-center gap-2 rounded border border-accent bg-surface-2 px-3 py-2 font-heading text-sm uppercase tracking-widest text-accent"
        >
          <Zap className="h-4 w-4" />
          Test impact
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="flex flex-1 items-center justify-center gap-2 rounded border border-border bg-bg px-3 py-2 font-heading text-sm uppercase tracking-widest text-muted hover:text-fg"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
      </div>
      <p className="mt-2 font-mono text-[9px] uppercase tracking-widest text-muted">
        Test impact needs a live run
      </p>
    </div>
  );
}
