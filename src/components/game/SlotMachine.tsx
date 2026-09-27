// Batch 11 (Lane 2): Storm Cellar slot machine.
// The engine lane (Lane 1, concurrent) exposes spinSlots() / gambleCache() /
// slotCost() on window.__controlsTest. This UI is purely defensive: every
// probe call is optional-chained and try/caught, and the SLOTS button +
// double-or-nothing prompt degrade gracefully when the probes are absent.

import { useEffect, useRef, useState } from "react";
import { X, Coins } from "lucide-react";
import { soundEngine } from "@/audio/soundEngine";

const GLYPHS: Record<string, { ch: string; color: string; name: string }> = {
  seven: { ch: "7", color: "#ff4d3a", name: "seven" },
  star: { ch: "★", color: "#ffd700", name: "star" },
  diamond: { ch: "◆", color: "#4cc3ff", name: "diamond" },
};
const ORDER = ["seven", "star", "diamond"];
// Staggered reel stops, matching the CacheSlots cadence (~1s spin).
const STOP_MS = [650, 1050, 1450];
const BASE_COST = 150;

type CTP = { spinSlots?: unknown; slotCost?: unknown; fireJackpot?: unknown };

function controlsTest(): CTP | undefined {
  try {
    return (window as unknown as { __controlsTest?: CTP }).__controlsTest;
  } catch {
    return undefined;
  }
}

function parseSpinResult(r: unknown): string[] | null {
  if (Array.isArray(r) && r.length >= 3) return r.slice(0, 3).map((s) => String(s));
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    if (Array.isArray(o.symbols) && o.symbols.length >= 3)
      return o.symbols.slice(0, 3).map((s) => String(s));
    if (typeof o.symbols === "string") {
      const parts = o.symbols.split(/[,\s|-]+/).filter(Boolean);
      if (parts.length >= 3) return parts.slice(0, 3);
    }
  }
  return null;
}

function describeResult(symbols: string[]): string {
  const n = (s: string) => symbols.filter((x) => x === s).length;
  if (n("seven") === 3) return "7-7-7 JACKPOT — the county pays out big";
  const bits: string[] = [];
  if (n("seven") === 2) bits.push("pair of sevens");
  if (n("star") === 3) bits.push("three stars");
  else if (n("star") === 2) bits.push("pair of stars");
  if (n("diamond") === 3) bits.push("three diamonds");
  return bits.length ? bits.join(" · ") : "No luck — the county keeps your grit";
}

export function slotsProbeAvailable(): boolean {
  return typeof controlsTest()?.spinSlots === "function";
}

export function gambleProbeAvailable(): boolean {
  return typeof (controlsTest() as { gambleCache?: unknown } | undefined)?.gambleCache === "function";
}

export function slotCostProbe(): { cost: number; exact: boolean } {
  const ct = controlsTest();
  if (typeof ct?.slotCost === "function") {
    try {
      const v = Number((ct.slotCost as () => unknown)());
      if (Number.isFinite(v) && v > 0) return { cost: Math.round(v), exact: true };
    } catch {
      /* fall through to base */
    }
  }
  return { cost: BASE_COST, exact: false };
}

/** Compact SLOTS button panel shown during the wave break, next to the wave shop. */
export function SlotsBreakButton({
  grit,
  onOpen,
}: {
  grit: number;
  onOpen: () => void;
}) {
  const available = slotsProbeAvailable();
  const { cost, exact } = slotCostProbe();
  const afford = grit >= cost;
  return (
    <div className="pointer-events-auto" data-testid="slots-break-panel">
      <button
        type="button"
        data-testid="slots-break-btn"
        disabled={!available}
        onClick={onOpen}
        title={
          available
            ? `Storm cellar slots — ${cost} grit${exact ? "" : " + escalation"} a spin`
            : "Slots offline — the engine crew is still wiring the machine"
        }
        className="hud-plate flex w-full items-center justify-between rounded px-3 py-2 font-mono text-xs uppercase tracking-widest text-accent transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <span className="inline-flex items-center gap-1.5">
          <Coins className="h-4 w-4" /> Slots
        </span>
        <span className={afford || !available ? "text-muted" : "text-danger"}>
          {cost}g{exact ? "" : "+"}
        </span>
      </button>
    </div>
  );
}

export function SlotMachine({
  grit,
  cost,
  costExact,
  onClose,
}: {
  grit: number;
  cost: number;
  costExact: boolean;
  onClose: () => void;
}) {
  const [shown, setShown] = useState<string[]>(["diamond", "diamond", "diamond"]);
  const [spinning, setSpinning] = useState(false);
  const [stopped, setStopped] = useState(0);
  const [result, setResult] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jackpot, setJackpot] = useState(false);
  const timers = useRef<number[]>([]);
  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach(clearInterval);
      t.forEach(clearTimeout);
    };
  }, []);

  const clearTimers = () => {
    timers.current.forEach(clearInterval);
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const spin = () => {
    if (spinning) return;
    const ct = controlsTest();
    if (typeof ct?.spinSlots !== "function") {
      setError("The machine's not wired yet — give the engine crew a minute.");
      return;
    }
    if (grit < cost) {
      setError("Not enough grit — the county don't play on credit.");
      return;
    }
    setError(null);
    setResult(null);
    setJackpot(false);
    setStopped(0);
    setSpinning(true);

    let final: string[] | null = null;
    try {
      final = parseSpinResult((ct.spinSlots as () => unknown)());
    } catch {
      final = null;
    }
    if (!final) {
      setSpinning(false);
      setError("The machine ate your grit. County rules — no refunds.");
      return;
    }

    const land = () => {
      setShown(final as string[]);
      setStopped(3);
      setSpinning(false);
      setResult(final as string[]);
      const isJackpot = final!.every((s) => s === "seven");
      setJackpot(isJackpot);
      if (isJackpot) {
        // Try the engine's celebration stack first (engine lane may expose it);
        // the modal-side gold flash + banner below always plays regardless.
        try {
          (ct as { fireJackpot?: unknown }).fireJackpot &&
            ((ct as { fireJackpot: () => void }).fireJackpot)();
        } catch {
          /* modal celebration is the fallback */
        }
        soundEngine.tone({ f: 660, f2: 1320, type: "square", dur: 0.4, vol: 0.22 });
        window.setTimeout(() => soundEngine.tone({ f: 880, f2: 1760, type: "square", dur: 0.4, vol: 0.22 }), 180);
      } else {
        soundEngine.tone({ f: 330, f2: 220, type: "triangle", dur: 0.25, vol: 0.15 });
      }
    };

    if (reduceMotion) {
      land();
      return;
    }

    // Reel shuffle with staggered stops.
    const spinners = ORDER.map((_, i) => {
      let k = 0;
      return window.setInterval(() => {
        k++;
        setShown((prev) => {
          const next = [...prev];
          next[i] = ORDER[(k + i) % ORDER.length];
          return next;
        });
      }, 70);
    });
    timers.current = spinners;
    STOP_MS.forEach((ms, i) => {
      const id = window.setTimeout(() => {
        window.clearInterval(spinners[i]);
        setShown((prev) => {
          const next = [...prev];
          next[i] = (final as string[])[i];
          return next;
        });
        soundEngine.tone({ f: 300 + i * 200, dur: 0.08, vol: 0.15, type: "square" });
        setStopped((s) => s + 1);
        if (i === STOP_MS.length - 1) {
          window.setTimeout(() => {
            clearTimers();
            land();
          }, 120);
        }
      }, ms);
      timers.current.push(id);
    });
  };

  const done = !spinning && result !== null;

  return (
    <div
      data-testid="slot-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="animate-pickup-pop hud-plate w-full max-w-md rounded-lg px-4 py-4">
        <div className="mb-1 flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
            Storm Cellar Slots
          </div>
          <button
            type="button"
            data-testid="slot-close"
            onClick={onClose}
            aria-label="Close slots"
            className="rounded p-1 text-muted hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-3 text-center font-mono text-[11px] text-muted">
          three sevens and the county pays out big
        </div>

        <div className="relative">
          <div className="mb-3 flex items-center justify-center gap-3">
            {shown.map((s, i) => {
              const g = GLYPHS[s] ?? GLYPHS.diamond;
              const locked = stopped > i || done;
              return (
                <div
                  key={i}
                  data-testid={`slot-reel-${i}`}
                  data-symbol={s}
                  className={`hud-plate flex h-20 w-20 items-center justify-center rounded text-5xl font-bold ${
                    spinning && !locked ? "animate-pulse" : ""
                  }`}
                  style={{ color: g.color, borderColor: locked ? g.color : undefined }}
                >
                  {g.ch}
                </div>
              );
            })}
          </div>

          {jackpot && (
            <>
              <div
                data-testid="slot-jackpot-flash"
                className="animate-gold-flash pointer-events-none absolute inset-0 rounded"
              />
              <div
                data-testid="slot-jackpot"
                className="animate-pickup-pop pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-3xl font-bold uppercase tracking-widest"
                style={{ color: "#ffd700", textShadow: "0 2px 0 #2a1a02, 0 0 24px rgba(255,215,0,0.8)" }}
              >
                Jackpot!
              </div>
            </>
          )}
        </div>

        <div className="mb-3 flex items-center justify-center gap-2 font-mono text-[11px] text-muted">
          <Coins className="h-3.5 w-3.5 text-accent" />
          <span data-testid="slot-cost">
            {cost} grit{costExact ? "" : " + escalation"} a spin · bag: {Math.round(grit)}
          </span>
        </div>

        {done && result && (
          <div
            data-testid="slot-result"
            className={`mb-3 text-center font-mono text-sm font-bold ${jackpot ? "" : "text-accent"}`}
            style={jackpot ? { color: "#ffd700" } : undefined}
          >
            {describeResult(result)}
          </div>
        )}

        {error && (
          <div data-testid="slot-broke" className="mb-3 text-center font-mono text-xs text-danger">
            {error}
          </div>
        )}

        <div className="flex justify-center gap-2">
          <button
            type="button"
            data-testid="slot-spin"
            onClick={spin}
            disabled={spinning}
            className="rounded border border-accent/60 bg-accent/20 px-6 py-2 font-mono text-xs uppercase tracking-widest text-accent hover:bg-accent/30 disabled:opacity-40"
          >
            {spinning ? "Spinning…" : result ? "Spin again" : "Spin"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-4 py-2 font-mono text-xs uppercase tracking-widest text-muted hover:text-fg"
          >
            Walk away
          </button>
        </div>
      </div>
    </div>
  );
}
