import { useEffect, useMemo, useState } from "react";
import { PlayerStats } from "@/types/game";
import { deathLine } from "@/game/radio";
import { loadSave, payForRun, recordRun, stubsEarned } from "@/game/save";
import { dailyDateStr, topRuns } from "@/game/meta";
import { Skull, RotateCcw, Home, Share2 } from "lucide-react";

interface GameOverModalProps {
  stats: PlayerStats;
  score: number;
  wave: number;
  level: number;
  locationName: string;
  killer: string;
  mode: "survival" | "outbreak";
  won?: boolean;
  unlocked: string[];
  notes: string[];
  mapId: string;
  onRestart: () => void;
  onHome: () => void;
}

export function GameOverModal({
  stats,
  score,
  wave,
  level,
  locationName,
  killer,
  mode,
  won,
  unlocked,
  notes,
  mapId,
  onRestart,
  onHome,
}: GameOverModalProps) {
  const earned = stubsEarned(stats.kills, wave, Boolean(won));
  const payKey = `${mapId}:${score}:${wave}:${stats.kills}:${stats.survivalTime}:${won ? 1 : 0}`;

  useEffect(() => {
    recordRun({
      score,
      wave,
      unlocked,
      notes,
      mapId,
      outbreakWon: Boolean(won && mode === "outbreak"),
    });
    payForRun(payKey, stats.kills, wave, Boolean(won));
  }, [score, wave, unlocked, notes, mapId, won, mode, payKey, stats.kills, stats.survivalTime]);

  const save = loadSave();
  const isRecord = score >= save.highScore;
  const line = useMemo(() => (won ? "The bell rang at dawn. Pike County still has a name." : deathLine(locationName, killer)), [won, locationName, killer]);
  const accuracy = stats.shotsFired > 0 ? Math.round((stats.shotsHit / stats.shotsFired) * 100) : 0;
  const minutes = Math.floor(stats.survivalTime / 60);
  const seconds = stats.survivalTime % 60;

  const title = won
    ? "Dawn over the Patoka"
    : wave >= 12
      ? "Folk legend"
      : wave >= 8
        ? "Ridge warden"
        : wave >= 4
          ? "Hollow defender"
          : "Coal-dust martyr";

  // Batch 5 (Lane D): Share-run card. Resilient by design: the button only
  // renders when 2D canvas is available, and a failed shareCard import (or a
  // failed render) hides the button instead of crashing the modal.
  const [canShare, setCanShare] = useState(true);
  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      if (!c.getContext || !c.getContext("2d")) setCanShare(false);
    } catch {
      setCanShare(false);
    }
  }, []);

  const handleShareRun = async () => {
    try {
      const { renderShareCard } = await import("@/game/shareCard");
      const card = renderShareCard({
        score,
        kills: stats.kills,
        time: Math.floor(stats.survivalTime),
        level,
        wave,
        title,
        locationName,
        dateStr: dailyDateStr(),
      });
      const a = document.createElement("a");
      a.href = card.toDataURL("image/png");
      a.download = "pike-county-run.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setCanShare(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-4">
      <div className="flex w-full max-w-xl flex-col overflow-hidden rounded border border-border bg-surface shadow-2xl">
        <div className="border-b border-border bg-danger/30 p-6 text-center">
          <div className="mb-3 inline-flex rounded-full border border-primary/60 bg-danger/40 p-3">
            <Skull className="h-10 w-10 text-primary" />
          </div>
          <h2 className="font-drip wild-title text-4xl md:text-6xl">
            {won ? "HELD" : "OVERRUN"}
          </h2>
          <p className="mt-1 font-heading uppercase tracking-widest text-accent">{title}</p>
          <p className="mt-3 font-lore text-sm leading-relaxed text-muted">{line}</p>
        </div>

        <div className="border-b border-border bg-bg p-6 text-center">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">Final score</div>
          <div className="font-heading text-5xl font-bold text-fg">{score.toLocaleString()}</div>
          {isRecord && <div className="mt-1 font-mono text-xs uppercase text-accent">County record</div>}
          <div className="mt-2 font-mono text-sm text-accent">This night paid {earned} stubs</div>
          <div className="mt-1 font-mono text-xs text-muted">
            {locationName} · Wave {wave} · {mode}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-border text-center font-mono text-xs">
          <Stat label="Kills" value={stats.kills} />
          <Stat label="Headshots" value={stats.headshots} />
          <Stat label="Accuracy" value={`${accuracy}%`} />
          <Stat label="Time" value={`${minutes}:${seconds.toString().padStart(2, "0")}`} />
          <Stat label="Notes" value={stats.notesFound} />
          <Stat label="Scrap" value={stats.scrapCollected} />
          <Stat label="Level" value={level} />
          <Stat label="Best harvest streak" value={`x${stats.maxStreak ?? 0}`} />
        </div>

        <HallOfRecords />

        <div className="flex gap-2 p-4">
          <button
            id="restart-run"
            type="button"
            onClick={onRestart}
            className="flex flex-1 items-center justify-center gap-2 rounded border border-accent bg-surface-2 py-3 font-heading uppercase tracking-widest text-accent"
          >
            <RotateCcw className="h-4 w-4" />
            Run it back
          </button>
          {canShare && (
            <button
              id="share-run"
              type="button"
              onClick={handleShareRun}
              className="flex flex-1 items-center justify-center gap-2 rounded border border-border bg-surface py-3 font-heading uppercase tracking-widest text-fg"
            >
              <Share2 className="h-4 w-4" />
              Share run
            </button>
          )}
          <button
            id="home-btn"
            type="button"
            onClick={onHome}
            className="flex flex-1 items-center justify-center gap-2 rounded border border-border bg-surface py-3 font-heading uppercase tracking-widest text-fg"
          >
            <Home className="h-4 w-4" />
            County map
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface px-3 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className="text-lg text-fg">{value}</div>
    </div>
  );
}

// Batch 4: Hall of Records — local top-5 runs, kept in the meta save.
function HallOfRecords() {
  const runs = topRuns();
  if (runs.length === 0) return null;
  return (
    <div className="border-b border-border bg-bg p-4">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-accent">
        Hall of Records
      </div>
      <ol className="space-y-1 font-mono text-xs text-muted">
        {runs.map((r, i) => (
          <li key={i} className="flex items-baseline justify-between gap-2">
            <span className="truncate">
              <span className="mr-2 text-fg">#{i + 1}</span>
              {r.score.toLocaleString()} pts · {r.kills} kills · Lvl {r.level}
            </span>
            <span className="shrink-0 text-[10px]">
              {Math.floor(r.time / 60)}:{(r.time % 60).toString().padStart(2, "0")}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
