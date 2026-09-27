import { useEffect, useRef, useState } from "react";
import { soundEngine } from "@/audio/soundEngine";

const GLYPHS: Record<string, { ch: string; color: string; label: string }> = {
  seven: { ch: "7", color: "#ff4d3a", label: "Seven — weapon upgrades" },
  star: { ch: "★", color: "#ffd700", label: "Star — bomb charge or heal" },
  diamond: { ch: "◆", color: "#4cc3ff", label: "Diamond — scrap + grit" },
};
const ORDER = ["seven", "star", "diamond"];
const STOP_MS = [650, 1050, 1450];

function resultText(symbols: string[]): string {
  const sevens = symbols.filter((s) => s === "seven").length;
  const stars = symbols.filter((s) => s === "star").length;
  const diamonds = 3 - sevens - stars;
  if (sevens === 3) return "7-7-7 JACKPOT — every weapon maxed";
  const bits: string[] = [];
  if (sevens > 0) bits.push(`+${sevens === 2 ? 4 : 1} weapon upgrade${sevens > 1 ? "s" : ""}`);
  if (stars > 0) bits.push(`${stars === 2 ? 4 : 1} star caché`);
  if (diamonds > 0) bits.push(`+${120 * (diamonds === 2 ? 4 : diamonds)} scrap + grit`);
  return bits.join(" · ") || "The cellar was empty";
}

export function CacheSlots({
  symbols,
  canGamble,
  onTake,
  onGambled,
}: {
  symbols: string[];
  /** Batch 11: the double-or-nothing prompt only shows when the engine lane's
      gambleCache() probe is present; absent probes degrade to Take-it-only. */
  canGamble: boolean;
  onTake: () => void;
  /** Called after the gamble result flash, so the parent can close the cache. */
  onGambled: () => void;
}) {
  const [shown, setShown] = useState<string[]>(["diamond", "diamond", "diamond"]);
  const [stopped, setStopped] = useState(0);
  const [gambled, setGambled] = useState(false);
  const [gambleWin, setGambleWin] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setShown(["diamond", "diamond", "diamond"]);
    setStopped(0);
    setGambled(false);
    setGambleWin(false);
    timers.current.forEach(clearInterval);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const spinners = ORDER.map((_, i) => {
      let k = 0;
      return window.setInterval(() => {
        k++;
        setShown((prev) => {
          const next = [...prev];
          next[i] = ORDER[(k + i) % 3];
          return next;
        });
      }, 70);
    });
    timers.current = spinners;
    STOP_MS.forEach((ms, i) => {
      window.setTimeout(() => {
        clearInterval(spinners[i]);
        setShown((prev) => {
          const next = [...prev];
          next[i] = symbols[i];
          return next;
        });
        soundEngine.tone({ f: 300 + i * 200, dur: 0.08, vol: 0.15, type: "square" });
        setStopped((s) => s + 1);
      }, ms);
    });
    return () => {
      spinners.forEach(clearInterval);
      timers.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(",")]);

  const done = stopped >= 3;
  const jackpot = symbols.filter((s) => s === "seven").length === 3;

  // Batch 11: double-or-nothing goes through the engine lane's gambleCache()
  // probe (50/50). The result flash plays here; the parent closes the cache
  // after the player has seen it.
  const handleGamble = () => {
    let probe: ((syms: string[]) => unknown) | undefined;
    try {
      probe = (window as unknown as { __controlsTest?: { gambleCache?: (s: string[]) => unknown } })
        .__controlsTest?.gambleCache;
    } catch {
      probe = undefined;
    }
    if (typeof probe !== "function" || gambled) return;
    setGambled(true);
    let win = false;
    try {
      win = !!probe(symbols);
    } catch {
      win = false;
    }
    setGambleWin(win);
    if (win) {
      soundEngine.tone({ f: 880, f2: 1320, type: "square", dur: 0.2, vol: 0.2 });
    } else {
      soundEngine.tone({ f: 220, f2: 110, type: "sawtooth", dur: 0.35, vol: 0.2 });
    }
    const id = window.setTimeout(() => {
      onGambled();
    }, 1500);
    timers.current.push(id);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center px-3">
      <div className="pointer-events-auto w-full max-w-md rounded-lg bg-bg/90 px-4 py-4 backdrop-blur-sm">
        <div className="mb-1 text-center font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
          Storm Cellar Cache
        </div>
        <div className="mb-3 text-center font-mono text-[11px] text-muted">the county deals you three</div>
        <div className="mb-3 flex items-center justify-center gap-3">
          {shown.map((s, i) => {
            const g = GLYPHS[s];
            const locked = stopped > i;
            return (
              <div
                key={i}
                className={`hud-plate flex h-20 w-20 items-center justify-center rounded text-5xl font-bold ${
                  locked ? "" : "animate-pulse"
                }`}
                style={{ color: g.color, borderColor: locked ? g.color : undefined }}
              >
                {g.ch}
              </div>
            );
          })}
        </div>
        {done && (
          <div className="text-center">
            <div
              className={`mb-1 font-mono text-sm font-bold ${jackpot ? "text-gold" : "text-accent"}`}
              style={jackpot ? { color: "#ffd700" } : undefined}
            >
              {resultText(symbols)}
            </div>
            <div className="mb-3 space-y-1">
              {symbols.map((s, i) => (
                <div key={i} className="font-mono text-[10px] text-muted">
                  {GLYPHS[s].ch} — {GLYPHS[s].label}
                </div>
              ))}
            </div>
            {canGamble && !gambled && (
              <div data-testid="cache-gamble-prompt" className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted">
                Take it or gamble?
              </div>
            )}
            <div className="flex justify-center gap-2">
              <button
                type="button"
                data-testid="cache-take"
                onClick={() => {
                  onTake();
                }}
                className="rounded border border-accent/60 bg-accent/20 px-4 py-2 font-mono text-xs uppercase tracking-widest text-accent hover:bg-accent/30"
              >
                Take it
              </button>
              {canGamble && !gambled && (
                <button
                  type="button"
                  data-testid="cache-gamble"
                  onClick={handleGamble}
                  className="rounded border border-danger/60 bg-danger/20 px-4 py-2 font-mono text-xs uppercase tracking-widest text-danger hover:bg-danger/30"
                >
                  Double or nothing
                </button>
              )}
            </div>
            {gambled && (
              <div
                data-testid="cache-gamble-result"
                data-win={gambleWin ? "true" : "false"}
                className="animate-pickup-pop mt-3 font-mono text-sm font-bold uppercase tracking-widest"
                style={
                  gambleWin
                    ? { color: "#ffd700", textShadow: "0 0 18px rgba(255,215,0,0.7)" }
                    : { color: "#8a8f98" }
                }
              >
                {gambleWin ? "Doubled it" : "Lost it all"}
              </div>
            )}
            {gambled && (
              <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted">
                win — everything doubled · lose — it all stays in the cellar
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
