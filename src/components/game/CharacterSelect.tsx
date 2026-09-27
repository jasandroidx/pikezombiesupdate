// Batch 9 — Lane 4: survivor select cards for the title screen.
import { INITIAL_WEAPONS } from "@/game/constants";
import { CHARACTERS } from "@/game/roster";
import { Crosshair, Zap } from "lucide-react";

const weaponName = (id: string) => INITIAL_WEAPONS.find((w) => w.id === id)?.name ?? id;

export function CharacterSelect({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded border border-[#6b5428]/80 bg-black/55 p-4 backdrop-blur-[2px]">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
        Survivor
      </div>
      <p className="mb-3 font-lore text-xs leading-relaxed text-muted">
        Pick who walks the traces tonight. Each survivor brings their own gun and one old habit.
      </p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {CHARACTERS.map((c) => {
          const active = c.id === selectedId;
          return (
            <button
              key={c.id}
              type="button"
              data-character-id={c.id}
              onClick={() => onSelect(c.id)}
              className={`rounded border p-3 text-left transition-colors ${
                active
                  ? "border-accent bg-surface-2"
                  : "border-border bg-surface hover:border-accent/50"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-heading text-base font-bold text-fg">{c.name}</span>
                {active && (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                    Ready
                  </span>
                )}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-accent">
                {c.title}
              </div>
              <p className="mt-1.5 font-lore text-xs leading-relaxed text-muted">{c.blurb}</p>
              <div className="mt-2 flex flex-col gap-1 border-t border-border/60 pt-2">
                <span className="flex items-center gap-1.5 font-mono text-[11px] text-fg">
                  <Crosshair className="h-3 w-3 text-accent" />
                  {weaponName(c.weaponId)}
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[11px] text-fg">
                  <Zap className="h-3 w-3 text-accent" />
                  {c.passiveName}
                  <span className="text-muted">— {c.passiveDesc}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
