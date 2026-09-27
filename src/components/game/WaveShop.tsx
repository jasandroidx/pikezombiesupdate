import { useState } from "react";
import { ShoppingCart, RefreshCw, Lock, LockOpen, ChevronDown } from "lucide-react";

export interface ShopOfferView {
  id: string;
  name: string;
  desc: string;
  cost: number;
  locked: boolean;
  afford: boolean;
}

interface WaveShopProps {
  offers: ShopOfferView[];
  rerollCost: number;
  scrap: number;
  waveTimer: number;
  onBuy: (index: number) => void;
  onReroll: () => void;
  onLock: (index: number) => void;
}

export function WaveShop({ offers, rerollCost, scrap, waveTimer, onBuy, onReroll, onLock }: WaveShopProps) {
  const [collapsed, setCollapsed] = useState(false);
  if (offers.length === 0) return null;

  return (
    <div className="pointer-events-auto absolute right-2 top-20 z-30 w-64 md:right-4 md:w-72">
      <div className="hud-plate overflow-hidden rounded">
        <button
          className="flex w-full items-center justify-between px-3 py-2 font-heading text-sm font-bold tracking-wider text-accent"
          onClick={() => setCollapsed((c) => !c)}
        >
          <span className="inline-flex items-center gap-1.5">
            <ShoppingCart className="h-4 w-4" /> TRACE TRADER
          </span>
          <span className="inline-flex items-center gap-2 font-mono text-[10px] text-muted">
            {waveTimer > 0 ? `${waveTimer}s` : ""}
            {collapsed ? <ChevronDown className="h-3 w-3 rotate-180" /> : <ChevronDown className="h-3 w-3" />}
          </span>
        </button>
        {!collapsed && (
          <div className="flex flex-col gap-1.5 px-2 pb-2">
            {offers.map((o, i) => (
              <div key={o.id} className="flex items-center gap-2 rounded bg-surface-2 px-2 py-1.5">
                <button
                  className={o.locked ? "text-accent" : "text-muted/50 hover:text-fg"}
                  onClick={() => onLock(i)}
                  title={o.locked ? "Locked for next wave" : "Lock for next wave"}
                >
                  {o.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[11px] font-bold text-fg">{o.name}</div>
                  <div className="truncate font-mono text-[9px] text-muted">{o.desc}</div>
                </div>
                <button
                  disabled={!o.afford}
                  onClick={() => onBuy(i)}
                  className="shrink-0 rounded border border-accent/40 px-1.5 py-1 font-mono text-[10px] text-accent disabled:opacity-30"
                >
                  {o.cost}g
                </button>
              </div>
            ))}
            <button
              disabled={scrap < rerollCost}
              onClick={onReroll}
              className="mt-0.5 inline-flex items-center justify-center gap-1.5 rounded border border-primary/40 px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-primary disabled:opacity-30"
            >
              <RefreshCw className="h-3 w-3" /> Reroll {rerollCost}g
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

