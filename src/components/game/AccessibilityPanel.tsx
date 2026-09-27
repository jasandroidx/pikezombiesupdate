import { useEffect, useState } from "react";
import { Accessibility, X } from "lucide-react";
import type { RefObject } from "react";
import type { GameEngine } from "@/game/engine";
import { soundEngine } from "@/audio/soundEngine";

/* =====================================================================
 * ENGINE API CONTRACT — for the coordinator (NOT yet in engine.ts)
 * ---------------------------------------------------------------------
 * This panel calls one hook that doesn't exist yet on GameEngine. It is
 * duck-typed and optional-chained, so the panel is runtime-safe today and
 * starts working the moment the coordinator lands the engine side.
 *
 *   setA11y(opts: { reduceMotion: boolean; reducedFlashing: boolean }): void
 *     reduceMotion:   true -> dampen or zero screen shake, camera kick and
 *                     zoom punch; disable idle camera sway and non-essential
 *                     particle drift. Juice scales toward stillness.
 *     reducedFlashing:true -> cap every screen flash at <= ~10% alpha and
 *                     kill strobe-style flicker; treat the tuning panel's
 *                     `flash` scale as 0 while set.
 *
 * Master/Music/SFX volumes call soundEngine directly (setSfxVolume,
 * setMusicVolume, getSfxVolume, getMusicVolume). There is no master bus in
 * soundEngine, so Master is implemented here as a multiplier:
 *   effective sfx   = sfx   * master
 *   effective music = music * master
 * ===================================================================== */

interface A11ySettings {
  master: number;
  music: number;
  sfx: number;
  reduceMotion: boolean;
  reducedFlashing: boolean;
  highContrast: boolean;
  fontScale: number;
}

/** Duck-typed view of GameEngine for the hook the coordinator has not landed. */
interface A11yEngineApi {
  setA11y?: (opts: { reduceMotion: boolean; reducedFlashing: boolean }) => void;
}

const STORAGE_KEY = "pz-a11y-v1";

const DEFAULTS: A11ySettings = {
  master: 1,
  music: 0.8,
  sfx: 1,
  reduceMotion: false,
  reducedFlashing: false,
  highContrast: false,
  fontScale: 1,
};

function loadStored(): A11ySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<A11ySettings>;
      return {
        master: clamp01(parsed.master ?? DEFAULTS.master),
        music: clamp01(parsed.music ?? DEFAULTS.music),
        sfx: clamp01(parsed.sfx ?? DEFAULTS.sfx),
        reduceMotion: !!parsed.reduceMotion,
        reducedFlashing: !!parsed.reducedFlashing,
        highContrast: !!parsed.highContrast,
        fontScale: typeof parsed.fontScale === "number" && Number.isFinite(parsed.fontScale)
          ? Math.min(1.3, Math.max(0.85, parsed.fontScale))
          : DEFAULTS.fontScale,
      };
    }
  } catch {
    /* corrupted storage -> defaults */
  }
  return { ...DEFAULTS };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function saveStored(s: A11ySettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage full / blocked -> settings still apply for this session */
  }
}

/** Apply persisted accessibility settings outside the panel (engine + DOM). */
function applyToWorld(s: A11ySettings, engine: GameEngine | null) {
  soundEngine.setSfxVolume(s.sfx * s.master);
  soundEngine.setMusicVolume(s.music * s.master);
  const api = engine as unknown as A11yEngineApi | null;
  api?.setA11y?.({ reduceMotion: s.reduceMotion, reducedFlashing: s.reducedFlashing });
  // High contrast + font scale are DOM-level (no CSS file edits needed):
  document.body.style.filter = s.highContrast ? "contrast(1.35) saturate(1.15)" : "";
  document.documentElement.style.fontSize = s.fontScale === 1 ? "" : `${16 * s.fontScale}px`;
}

/**
 * Push the persisted accessibility settings into a (possibly fresh) engine
 * and the DOM. Called from index.tsx right after bootEngine so a new run
 * adopts the player's saved settings.
 */
export function applyStoredA11y(engine: GameEngine | null) {
  applyToWorld(loadStored(), engine);
}

function VolumeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">{label}</span>
        <span className="font-mono text-[11px] text-accent">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(clamp01(parseFloat(e.target.value)))}
        className="w-full accent-accent"
        aria-label={label}
      />
    </label>
  );
}

function Toggle({
  label,
  detail,
  on,
  onChange,
}: {
  label: string;
  detail: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`flex w-full items-center justify-between gap-2 rounded border px-3 py-2 text-left ${
        on ? "border-accent/70 bg-surface-2" : "border-border bg-bg"
      }`}
    >
      <span>
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg">{label}</span>
        <span className="mt-0.5 block font-lore text-[11px] leading-snug text-muted">{detail}</span>
      </span>
      <span
        className={`shrink-0 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${
          on ? "border-accent text-accent" : "border-border text-muted"
        }`}
      >
        {on ? "On" : "Off"}
      </span>
    </button>
  );
}

export function AccessibilityPanel({
  engineRef,
  onClose,
}: {
  engineRef: RefObject<GameEngine | null>;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<A11ySettings>(loadStored);

  // Apply whatever is stored the moment the panel mounts (covers "open it
  // just to check" without touching anything).
  useEffect(() => {
    applyToWorld(loadStored(), engineRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (patch: Partial<A11ySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveStored(next);
      applyToWorld(next, engineRef.current);
      return next;
    });
  };

  return (
    <div
      data-testid="a11y-panel"
      className="absolute inset-0 z-[60] flex items-center justify-center bg-bg/80 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded border border-border bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Accessibility className="h-5 w-5 text-accent" />
            <h2 className="font-display text-2xl tracking-widest text-fg">SETTINGS</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border bg-bg p-1.5 text-muted hover:text-fg"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 font-lore text-sm text-muted">
          Pike County, kept comfortable. Everything here is saved to this browser.
        </p>

        <div className="space-y-4">
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-accent">Audio</div>
            <div className="flex flex-col gap-2">
              <VolumeSlider label="Master" value={settings.master} onChange={(v) => update({ master: v })} />
              <VolumeSlider label="Music" value={settings.music} onChange={(v) => update({ music: v })} />
              <VolumeSlider label="SFX" value={settings.sfx} onChange={(v) => update({ sfx: v })} />
            </div>
          </div>

          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-accent">Motion &amp; sight</div>
            <div className="flex flex-col gap-2">
              <Toggle
                label="Reduce motion"
                detail="Dampens screen shake, camera kick and zoom punch."
                on={settings.reduceMotion}
                onChange={(v) => update({ reduceMotion: v })}
              />
              <Toggle
                label="Reduced flashing"
                detail="Caps screen flashes near zero; kills strobes."
                on={settings.reducedFlashing}
                onChange={(v) => update({ reducedFlashing: v })}
              />
              <Toggle
                label="High contrast"
                detail="Boosts contrast and saturation of the picture."
                on={settings.highContrast}
                onChange={(v) => update({ highContrast: v })}
              />
              <label className="block">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Font scale</span>
                  <span className="font-mono text-[11px] text-accent">{Math.round(settings.fontScale * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.85}
                  max={1.3}
                  step={0.05}
                  value={settings.fontScale}
                  onChange={(e) => update({ fontScale: parseFloat(e.target.value) })}
                  className="w-full accent-accent"
                  aria-label="Font scale"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
