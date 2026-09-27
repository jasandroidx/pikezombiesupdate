import { BoonOffer, RARITY_COLOR } from "@/game/boons";

const RARITY_LABEL: Record<string, string> = { common: "County stock", uncommon: "Hard to find", rare: "One of a kind" };

export function TailgateDraft({
  offers,
  stacks,
  level,
  rerolls,
  banishCharges,
  evolutionHints = [],
  onTake,
  onReroll,
  onBanish,
}: {
  offers: BoonOffer[];
  stacks: Record<string, number>;
  level: number;
  rerolls: number;
  banishCharges: number;
  evolutionHints?: string[];
  onTake: (id: string) => void;
  onReroll: () => void;
  onBanish: (id: string) => void;
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
              <div key={`${b.id}-${i}`} className="hud-plate rounded px-3 py-3 text-left">
                <button type="button" onClick={() => onTake(b.id)} className="block w-full text-left">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-accent">{i + 1}</div>
                    <div
                      className="font-mono text-[9px] uppercase tracking-widest"
                      style={{ color: RARITY_COLOR[b.rarity] }}
                    >
                      {RARITY_LABEL[b.rarity]}
                    </div>
                  </div>
                  <div className="font-heading text-lg leading-tight text-fg">{b.name}</div>
                  <p className="mt-1 font-mono text-[11px] leading-snug text-muted">
                    {b.blurb}
                    {held > 0 ? ` Already holding ${held}.` : ""}
                  </p>
                </button>
                {banishCharges > 0 && (
                  <button
                    type="button"
                    onClick={() => onBanish(b.id)}
                    className="mt-2 w-full rounded border border-purple-400/40 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-purple-300 hover:border-purple-300"
                  >
                    Run it out of the county · {banishCharges} left
                  </button>
                )}
              </div>
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
