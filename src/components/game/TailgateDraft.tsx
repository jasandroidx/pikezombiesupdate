import { BoonOffer } from "@/game/boons";

export function TailgateDraft({
  offers,
  stacks,
  level,
  rerolls,
  onTake,
  onReroll,
}: {
  offers: BoonOffer[];
  stacks: Record<string, number>;
  level: number;
  rerolls: number;
  onTake: (id: string) => void;
  onReroll: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-3">
      <div className="pointer-events-auto w-full max-w-3xl rounded-lg bg-bg/80 px-3 py-3 backdrop-blur-sm">
        <div className="mb-2 text-center font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
          Level {level} · the night stops · take one · 1 2 3
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
      </div>
    </div>
  );
}
