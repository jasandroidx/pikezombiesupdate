// Batch 13 (Lane 2): boss presentation UI components — Old Ben intro
// ceremony, generalized boss HP bar, attack-name callouts. Data + matchers
// live in bossIntroData.ts (node-importable for pure tests).

import {
  type AttackCallout as AttackCalloutData,
  type BossIntroData,
} from "./bossIntroData";

// Full-screen letterboxed boss intro ceremony. Auto-dismissed by the parent
// (routes/index.tsx clears it on a timer); pointer-events-none so the fight
// underneath stays playable. Rendered only when intro != null.
export function BossIntro({ intro }: { intro: BossIntroData | null }) {
  if (!intro) return null;
  return (
    <div
      key={intro.key}
      data-testid="boss-intro"
      data-boss-id={intro.id}
      className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/55"
    >
      {/* Letterbox bars */}
      <div data-testid="boss-intro-letterbox" className="absolute inset-x-0 top-0 h-[13vh] bg-black" />
      <div className="absolute inset-x-0 bottom-0 h-[13vh] bg-black" />
      {/* Ceremony copy */}
      <div className="relative flex flex-col items-center px-6 text-center">
        {intro.call && (
          <div className="mb-3 font-mono text-xs uppercase tracking-[0.35em] text-red-300/80">
            {intro.call}
          </div>
        )}
        <div className="font-display text-5xl font-black tracking-[0.18em] text-red-100 drop-shadow-[0_0_28px_rgba(220,38,38,0.55)] md:text-7xl">
          {intro.title}
        </div>
        <div className="mt-4 max-w-xl font-mono text-sm uppercase tracking-[0.2em] text-stone-300">
          {intro.sub}
        </div>
        {intro.body && (
          <div className="mt-3 max-w-xl text-sm italic text-stone-400">
            &ldquo;{intro.body}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}

// Generalized boss HP bar: name + hp fraction for ANY active boss.
// boss == null (no boss alive / no data) -> hidden. Same styling for every
// boss id; the engine lane's boss just needs to appear in the bar data.
export function BossHpBar({ boss }: { boss: { id: string; name: string; frac: number } | null }) {
  if (!boss) return null;
  const pct = Math.max(0, Math.min(1, Number.isFinite(boss.frac) ? boss.frac : 0)) * 100;
  return (
    <div
      data-testid="boss-hp-bar"
      data-boss-id={boss.id}
      data-frac={pct.toFixed(3)}
      className="pointer-events-none flex w-72 flex-col items-center gap-1 md:w-96"
    >
      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-red-200 drop-shadow-[0_0_10px_rgba(220,38,38,0.5)]">
        {boss.name}
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-sm border border-red-900/80 bg-black/70">
        <div
          className="h-full bg-gradient-to-r from-red-800 via-red-600 to-red-500 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export type { AttackCalloutData as AttackCallout };

// Small floating attack-name labels. Parent expires items on a timer;
// an empty list renders nothing. Defensive: unknown names are uppercased
// and shown as-is, never thrown on.
export function AttackCallouts({ items }: { items: AttackCalloutData[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="pointer-events-none flex flex-col items-center gap-1">
      {items.map((c) => (
        <div
          key={c.id}
          data-testid="attack-callout"
          data-attack-name={c.name}
          className="animate-pulse font-display text-xl font-bold tracking-[0.25em] text-amber-300 drop-shadow-[0_0_16px_rgba(251,191,36,0.6)]"
        >
          {String(c.name).toUpperCase()}
        </div>
      ))}
    </div>
  );
}
