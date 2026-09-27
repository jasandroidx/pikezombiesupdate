import { mutatorLabelsFor } from "./eventMeta";

// Batch 12 (Lane 3): mutator chips. Rendered on the title screen's
// daily-run panel and as in-run HUD chips, from the same mutator source
// the title screen already uses (see eventMeta.ts). Empty -> null.

export function MutatorChips({
  mutators,
  testId = "mutator-chips",
  className = "",
}: {
  mutators?: readonly unknown[] | null;
  testId?: string;
  className?: string;
}) {
  const labels = mutatorLabelsFor(mutators);
  if (labels.length === 0) return null;
  return (
    <div data-testid={testId} className={`flex flex-wrap items-center justify-center gap-1.5 ${className}`}>
      {labels.map((l) => (
        <span
          key={l}
          className="rounded border border-accent/50 bg-black/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-accent"
        >
          {l}
        </span>
      ))}
    </div>
  );
}
