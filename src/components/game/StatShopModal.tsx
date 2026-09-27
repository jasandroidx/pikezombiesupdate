import { useState } from "react";
import { X, Zap, Shield, Wind, BookOpen, Coins, Landmark } from "lucide-react";
import { getStatShop, buyStat, STAT_SHOP_MAX_TIER, type StatShopTrackId } from "@/game/meta";
import { MetaTreePanel } from "./MetaTree";

/**
 * County Record Office — permanent stat shop.
 *
 * INTEGRATION POINT (integrator): StartScreen.tsx is owned by another lane.
 * To wire this modal in, add an entry button on the start screen:
 *
 *   import { StatShopModal } from "@/components/game/StatShopModal";
 *   const [recordOpen, setRecordOpen] = useState(false);
 *   <button onClick={() => setRecordOpen(true)}>County Record Office</button>
 *   {recordOpen && <StatShopModal open={recordOpen} onClose={() => setRecordOpen(false)} />}
 *
 * The modal is fully self-contained otherwise: it reads state from
 * getStatShop() and persists purchases through buyStat() (meta.ts -> save.ts).
 */

interface StatShopModalProps {
  open: boolean;
  onClose: () => void;
}

const TRACK_ICON: Record<StatShopTrackId, typeof Zap> = {
  damage: Zap,
  hp: Shield,
  speed: Wind,
  xp: BookOpen,
};

export function StatShopModal({ open, onClose }: StatShopModalProps) {
  // Bump to re-read getStatShop() after each purchase.
  const [tick, setTick] = useState(0);
  void tick;
  // Batch 10 — Lane 3: Bloodlines tab hosts the County Record meta tree.
  // Honors (the original stat shop) stays the default tab so existing flows
  // and tests keep working unchanged.
  const [tab, setTab] = useState<"honors" | "tree">("honors");

  if (!open) return null;

  const { tracks, tiers, stubs } = getStatShop();

  const handleBuy = (id: StatShopTrackId) => {
    const res = buyStat(id);
    if (res.ok) setTick((t) => t + 1);
  };

  const tabBtn = (id: "honors" | "tree", label: string) => (
    <button
      key={id}
      type="button"
      data-testid={`record-tab-${id}`}
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      className={`rounded border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest ${
        tab === id ? "border-accent/60 bg-accent/20 text-accent" : "border-border bg-bg text-muted hover:text-fg"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div data-testid="stat-shop" className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-bg p-4">
          <div className="flex items-center gap-3">
            <div className="rounded border border-accent/40 bg-surface-2 p-2">
              <Landmark className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-fg">County Record Office</h2>
              <p className="text-xs text-muted">Permanent county honors. Every run, forever.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {tabBtn("honors", "Honors")}
              {tabBtn("tree", "Bloodlines")}
            </div>
            {tab === "honors" && (
              <div className="flex items-center gap-1.5 rounded border border-border bg-surface-2 px-2.5 py-1.5">
                <Coins className="h-4 w-4 text-accent" />
                <span className="text-sm font-bold text-fg">{stubs}</span>
                <span className="text-xs text-muted">stubs</span>
              </div>
            )}
            <button onClick={onClose} className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {tab === "honors" ? (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {tracks.map((track) => {
            const Icon = TRACK_ICON[track.id];
            const cur = tiers[track.id] ?? 0;
            const maxed = cur >= STAT_SHOP_MAX_TIER;
            const nextCost = maxed ? null : track.costs[cur];
            const affordable = nextCost !== null && stubs >= nextCost;
            return (
              <div key={track.id} className="rounded border border-border bg-surface-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded border border-accent/40 bg-bg p-2">
                      <Icon className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <div className="font-bold text-fg">{track.name}</div>
                      <div className="text-xs text-accent">{track.perTier} per tier</div>
                      <p className="mt-1 text-xs text-muted">{track.flavor}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleBuy(track.id)}
                    disabled={maxed || !affordable}
                    className={`shrink-0 rounded border px-3 py-2 text-sm font-bold ${
                      maxed
                        ? "border-border bg-bg text-muted"
                        : affordable
                          ? "border-accent/60 bg-accent/20 text-fg hover:bg-accent/30"
                          : "border-border bg-bg text-muted opacity-60"
                    }`}
                  >
                    {maxed ? "MAXED" : `Buy · ${nextCost}`}
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  {track.costs.map((cost, i) => (
                    <div
                      key={i}
                      title={`Tier ${i + 1}: ${cost} stubs`}
                      className={`h-2 flex-1 rounded ${
                        i < cur ? "bg-accent" : i === cur ? "bg-border" : "bg-bg"
                      }`}
                    />
                  ))}
                  <span className="ml-2 text-xs text-muted">
                    Tier {cur}/{STAT_SHOP_MAX_TIER}
                  </span>
                </div>
              </div>
            );
          })}
            </div>

            <div className="border-t border-border bg-bg p-3">
              <p className="text-center text-xs text-muted">
                Purchased honors apply to every run at player init. Earn stubs by finishing runs.
              </p>
            </div>
          </>
        ) : (
          <MetaTreePanel />
        )}
      </div>
    </div>
  );
}
