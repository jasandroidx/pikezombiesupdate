import { ScrollText, X, Lock, BookOpenText } from "lucide-react";
import * as GameConstants from "@/game/constants";

/* =====================================================================
 * LANE D CONTRACT — discovery-log table (NOT landed on this branch yet)
 * ---------------------------------------------------------------------
 * Lane D owns the CODEX table. When it lands, this collapses to the plain
 * named import:
 *     import { CODEX } from "@/game/constants";
 * Entries are `{ id, name, blurb, hint }`:
 *     id    — stable string key, used for unlock tracking
 *     name  — display title once discovered
 *     blurb — the discovered lore text
 *     hint  — shown while the entry is still locked
 *
 * Until Lane D lands the table, we resolve it defensively through the
 * module namespace so an absent table renders an empty state instead of
 * crashing. Coordinator: unlock tracking (the `unlockedIds` prop) is still
 * unwired — it defaults to [] until you thread real discovery events in.
 * ===================================================================== */

interface CodexEntry {
  id: string;
  name: string;
  blurb: string;
  hint: string;
}

const CODEX: CodexEntry[] = ((GameConstants as unknown as { CODEX?: CodexEntry[] }).CODEX ?? []);

export function CodexPanel({
  unlockedIds = [],
  onClose,
}: {
  /** IDs the player has discovered. Coordinator wires real tracking later. */
  unlockedIds?: string[];
  onClose: () => void;
}) {
  const unlocked = new Set(unlockedIds);
  const found = CODEX.filter((e) => unlocked.has(e.id));

  return (
    <div
      data-testid="codex-panel"
      className="absolute inset-0 z-[60] flex items-center justify-center bg-bg/80 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded border border-border bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-accent" />
            <h2 className="font-display text-2xl tracking-widest text-fg">COUNTY CODEX</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border bg-bg p-1.5 text-muted hover:text-fg"
            aria-label="Close county codex"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-1 font-lore text-sm text-muted">
          What the county remembers. Discover entries out on the ground.
        </p>
        <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          {found.length} / {CODEX.length} discovered
        </p>

        {CODEX.length === 0 ? (
          <div className="rounded border border-border bg-bg p-4">
            <p className="font-lore text-sm text-muted">
              The pages are still blank. Walk the traces — the discovery log will fill in.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {CODEX.map((entry) => {
              const isUnlocked = unlocked.has(entry.id);
              return (
                <div
                  key={entry.id}
                  className={`rounded border px-3 py-2.5 ${
                    isUnlocked ? "border-accent/60 bg-surface-2" : "border-border bg-bg"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isUnlocked ? (
                      <BookOpenText className="h-4 w-4 shrink-0 text-accent" />
                    ) : (
                      <Lock className="h-4 w-4 shrink-0 text-muted" />
                    )}
                    <span className={`font-heading text-base tracking-wide ${isUnlocked ? "text-fg" : "text-muted"}`}>
                      {isUnlocked ? entry.name : "???"}
                    </span>
                  </div>
                  {isUnlocked ? (
                    <p className="mt-1 font-lore text-sm leading-relaxed text-fg/85">{entry.blurb}</p>
                  ) : (
                    <p className="mt-1 font-lore text-sm italic leading-relaxed text-muted">{entry.hint}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
