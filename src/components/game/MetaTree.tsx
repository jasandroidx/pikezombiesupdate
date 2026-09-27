import { useState } from "react";
import { Sprout, Crosshair, HandCoins, Coins } from "lucide-react";
import {
  getMetaTree,
  buyTreeTier,
  META_TREE_MAX_TIER,
  type MetaTreeBranchId,
} from "@/game/meta";

/**
 * Batch 10 — Lane 3: County Record bloodline tree panel.
 *
 * Renders inside the County Record Office modal (StatShopModal) as the
 * "Bloodlines" tab. Fully self-contained: reads state from getMetaTree()
 * and persists purchases through buyTreeTier() (meta.ts -> save.ts stubs).
 */

const BRANCH_ICON: Record<MetaTreeBranchId, typeof Sprout> = {
  homesteader: Sprout,
  deadeye: Crosshair,
  scrounger: HandCoins,
};

export function MetaTreePanel() {
  // Bump to re-read getMetaTree() after each purchase.
  const [tick, setTick] = useState(0);
  void tick;

  const { branches, tiers, stubs } = getMetaTree();

  const handleBuy = (id: MetaTreeBranchId) => {
    const res = buyTreeTier(id);
    if (res.ok) setTick((t) => t + 1);
  };

  return (
    <div data-testid="meta-tree" className="flex-1 space-y-3 overflow-y-auto p-4">
      <div className="flex items-center justify-between rounded border border-border bg-bg px-3 py-2">
        <p className="font-lore text-xs text-muted">
          Twelve honors, three bloodlines. Tiers are bought in order — the fourth is a capstone.
        </p>
        <div className="flex items-center gap-1.5">
          <Coins className="h-4 w-4 text-accent" />
          <span className="text-sm font-bold text-fg">{stubs}</span>
          <span className="text-xs text-muted">stubs</span>
        </div>
      </div>

      {branches.map((branch) => {
        const Icon = BRANCH_ICON[branch.id];
        const cur = tiers[branch.id] ?? 0;
        const maxed = cur >= META_TREE_MAX_TIER;
        const next = maxed ? null : branch.nodes[cur];
        const affordable = next !== null && stubs >= next.cost;
        return (
          <div
            key={branch.id}
            data-testid={`meta-tree-branch-${branch.id}`}
            className="rounded border border-border bg-surface-2 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded border border-accent/40 bg-bg p-2">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <div className="font-bold text-fg">{branch.name}</div>
                  <div className="text-xs text-accent">{branch.theme}</div>
                  <p className="mt-1 text-xs text-muted">{branch.flavor}</p>
                </div>
              </div>
              <button
                type="button"
                data-testid={`meta-tree-buy-${branch.id}`}
                aria-label={`Buy next ${branch.name} tier`}
                onClick={() => handleBuy(branch.id)}
                disabled={maxed || !affordable}
                className={`shrink-0 rounded border px-3 py-2 text-sm font-bold ${
                  maxed
                    ? "border-border bg-bg text-muted"
                    : affordable
                      ? "border-accent/60 bg-accent/20 text-fg hover:bg-accent/30"
                      : "border-border bg-bg text-muted opacity-60"
                }`}
              >
                {maxed ? "MAXED" : `Buy · ${next?.cost}`}
              </button>
            </div>

            <div className="mt-3 space-y-1.5">
              {branch.nodes.map((node, i) => {
                const owned = i < cur;
                const isNext = i === cur;
                return (
                  <div
                    key={node.tier}
                    data-testid={`meta-tree-tier-${branch.id}-${node.tier}`}
                    data-owned={owned}
                    className={`rounded border px-2.5 py-1.5 ${
                      owned
                        ? "border-accent/50 bg-bg"
                        : isNext
                          ? "border-border bg-bg/60"
                          : "border-border/50 bg-bg/30 opacity-60"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`font-mono text-[11px] font-bold ${owned ? "text-accent" : "text-fg"}`}>
                        {owned ? "✓ " : ""}T{node.tier} · {node.name}
                        {node.capstone && <span className="ml-1 text-primary">CAPSTONE</span>}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-accent">{node.effect}</span>
                    </div>
                    <p className="mt-0.5 font-lore text-[11px] leading-snug text-muted">{node.flavor}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-1.5">
              {branch.nodes.map((node, i) => (
                <div
                  key={node.tier}
                  title={`Tier ${node.tier}: ${node.cost} stubs`}
                  className={`h-2 flex-1 rounded ${
                    i < cur ? "bg-accent" : i === cur ? "bg-border" : "bg-bg"
                  }`}
                />
              ))}
              <span className="ml-2 text-xs text-muted">
                Tier {cur}/{META_TREE_MAX_TIER}
              </span>
            </div>
          </div>
        );
      })}

      <p className="text-center text-xs text-muted">
        Bloodline honors apply to every run at player init, through the same channel as the Record Office.
      </p>
    </div>
  );
}
