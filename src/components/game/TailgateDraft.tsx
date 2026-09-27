import { BoonOffer } from "@/game/boons";

export function TailgateDraft({
  offers,
  stacks,
  level,
  rerolls,
  evolutionHints = [],
  onTake,
  onReroll,
}: {
  offers: BoonOffer[];
  stacks: Record<string, number>;
  level: number;
  rerolls: number;
  evolutionHints?: string[];
  onTake: (id: string) => void;
  onReroll: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center px-3">
      <div className="pointer-events-auto w-full max-w-3xl rounded-lg bg-bg/80 px-3 py-3 backdrop-blur-sm">
        <div className="mb-2 text-center font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
          Level {level} · the night stops · tap one
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {offers.map((b, i) => {
            const held = stacks[b.id] ?? 0;
            return (
              <button
                key={`${b.id}-${i}`}
                type="button"
                onClick={() => onTake(b.id)}
                className="hud-plate rounded px-3 py-3 text-left hover:border-accent"
              >
                <div className="font-mono text-[10px] uppercase tracking-widest text-accent">{i + 1}</div>
                <div className="font-heading text-lg leading-tight text-fg">{b.name}</div>
                <p className="mt-1 font-mono text-[11px] leading-snug text-muted">
                  {b.blurb}
                  {held > 0 ? ` Already holding ${held}.` : ""}
                </p>
              </button>
            );
          })}
        </div>
        {rerolls > 0 && (
          <button
            type="button"
            onClick={onReroll}
            className="mx-auto mt-2 block rounded border border-accent px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-accent"
          >
            Reroll · {rerolls} left
          </button>
        )}
        {evolutionHints.length > 0 && (
          <div className="mt-2 border-t border-border pt-2 text-center">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.28em] text-muted">Evolution codex</div>
            {evolutionHints.map((h) => (
              <div key={h} className="font-mono text-[11px] leading-snug text-accent">
                {h}
              </div>
            ))}
            <div className="mt-0.5 font-mono text-[9px] text-muted">Evolves on a supply chest</div>
          </div>
        )}
      </div>
    </div>
  );
}
