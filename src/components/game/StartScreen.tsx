import { useState } from "react";
import { GAME_LOCATIONS, OUTBREAK_ORDER } from "@/game/constants";
import { buyRank, loadSave, rankCost } from "@/game/save";
import { Play, Volume2, VolumeX, HelpCircle, BookOpen, Skull, Bell, Zap, Shield, Wind } from "lucide-react";
import { loadMeta } from "@/game/meta";
import { QUESTS } from "@/game/constants";

interface StartScreenProps {
  onStartGame: (locationIndex: number, difficulty: number, mode: "survival" | "outbreak", mutators?: string[]) => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export function StartScreen({ onStartGame, isMuted, onToggleMute }: StartScreenProps) {
  const meta = loadMeta();
  const [selectedLocation, setSelectedLocation] = useState(0);
  const [difficulty, setDifficulty] = useState(1);
  const [mutators, setMutators] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [save, setSave] = useState(() => loadSave());

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto">
      <img
        src="/title-night.jpg"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/20" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/15 to-black/50" />
      <div className="vignette-overlay absolute inset-0" />

      <div className="relative z-10 flex min-h-full flex-col justify-between p-5 md:p-8">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
            Pike County, Indiana · Quarantine 1983
          </span>
        </div>
        <div className="flex items-center gap-2">
          {save.highScore > 0 && (
            <div className="rounded border border-border bg-surface px-3 py-1 font-mono text-xs text-accent">
              Record {save.highScore.toLocaleString()} · Wave {save.bestWave}
            </div>
          )}
          <button type="button" className="rounded border border-border bg-surface p-2" onClick={() => setShowJournal((v) => !v)}>
            <BookOpen className="h-4 w-4 text-accent" />
          </button>
          <button type="button" className="rounded border border-border bg-surface p-2" onClick={() => setShowHelp((v) => !v)}>
            <HelpCircle className="h-4 w-4 text-fg" />
          </button>
          <button type="button" className="rounded border border-border bg-surface p-2" onClick={onToggleMute}>
            {isMuted ? <VolumeX className="h-4 w-4 text-primary" /> : <Volume2 className="h-4 w-4 text-accent" />}
          </button>
        </div>
      </div>

      <div className="relative z-10 mx-auto my-4 w-full max-w-6xl md:my-2">
        <img
          src="/winslow-eskimos-patch.png"
          alt="Winslow Eskimos"
          title="Winslow Eskimos — county champs, 1983"
          className="pointer-events-none absolute -top-4 right-2 hidden w-28 rotate-6 rounded-full opacity-90 drop-shadow-[0_6px_20px_rgba(0,0,0,0.8)] md:block md:w-36"
        />
        <p className="font-mono text-xs uppercase tracking-[0.35em] text-accent drop-shadow">Patoka River · Yellow Banks Trace</p>
        <h1 className="mt-2 font-display text-5xl font-bold tracking-[0.14em] text-fg drop-shadow-[0_4px_18px_rgba(0,0,0,0.85)] md:text-7xl">PIKE COUNTY</h1>
        <div className="wild-title mt-1 mb-3 w-fit font-drip text-5xl md:text-8xl">Zombies</div>
        <p className="max-w-md font-lore text-sm leading-relaxed text-fg/80 md:text-base">
          The mines exhaled. The springs went to iron. Fog on the Patoka, and the dead walking the traces Lincoln used.
        </p>
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded border border-[#6b5428]/80 bg-black/55 p-4 backdrop-blur-[2px]">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-accent">County map</div>
          <CountyMap selected={GAME_LOCATIONS[selectedLocation]?.id} cleared={save.mapsCleared} onPick={(id) => {
            const i = GAME_LOCATIONS.findIndex((l) => l.id === id);
            if (i >= 0) setSelectedLocation(i);
          }} />
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded border border-[#6b5428]/80 bg-black/55 p-4 text-left backdrop-blur-[2px]">
            <div className="font-heading text-xl text-fg">{GAME_LOCATIONS[selectedLocation].name}</div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-accent">
              {GAME_LOCATIONS[selectedLocation].township}
            </div>
            <p className="mt-2 font-lore text-sm leading-relaxed text-muted">
              {GAME_LOCATIONS[selectedLocation].description}
            </p>
          </div>

          <div className="flex gap-2">
            {[
              { n: 0.85, label: "Ridge" },
              { n: 1, label: "County" },
              { n: 1.35, label: "Highwall" },
            ].map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => setDifficulty(d.n)}
                className={`flex-1 rounded border px-2 py-2 font-mono text-[11px] uppercase tracking-widest ${
                  difficulty === d.n ? "border-accent bg-surface-2 text-accent" : "border-border bg-surface text-muted"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {[
              { id: "rich", label: "Rich ground", detail: "Double grit" },
              { id: "dry", label: "Dry county", detail: "Half ammo" },
              { id: "fog", label: "Bottom fog", detail: "Fog all night" },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                title={m.detail}
                onClick={() => setMutators((s) => (s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id]))}
                className={`flex-1 rounded border px-2 py-2 font-mono text-[11px] uppercase tracking-widest ${
                  mutators.includes(m.id) ? "border-accent bg-surface-2 text-accent" : "border-border bg-surface text-muted"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="rounded border border-[#6b5428]/80 bg-black/55 p-3 text-left backdrop-blur-[2px]">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">Pay stubs</span>
              <span className="font-heading text-lg text-fg">{save.stubs}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <RankRow
                label="Boots"
                detail="Start a step quicker"
                rank={save.ranks.boots}
                stubs={save.stubs}
                onBuy={() => setSave(buyRank("boots"))}
              />
              <RankRow
                label="Hide"
                detail="Start with more blood"
                rank={save.ranks.hide}
                stubs={save.stubs}
                onBuy={() => setSave(buyRank("hide"))}
              />
              <RankRow
                label="Magnet"
                detail="Grit pulls from farther"
                rank={save.ranks.magnet}
                stubs={save.stubs}
                onBuy={() => setSave(buyRank("magnet"))}
              />
            </div>
          </div>

          <button
            id="start-outbreak"
            type="button"
            onClick={() => onStartGame(0, difficulty, "outbreak", mutators)}
            className="flex items-center justify-center gap-2 rounded border border-primary bg-primary px-4 py-3 font-heading text-lg font-bold uppercase tracking-widest text-fg"
          >
            <Skull className="h-5 w-5" />
            Outbreak night
          </button>
          <button
            id="start-survival"
            type="button"
            onClick={() => onStartGame(selectedLocation, difficulty, "survival", mutators)}
            className="flex items-center justify-center gap-2 rounded border border-accent bg-surface-2 px-4 py-3 font-heading text-lg font-bold uppercase tracking-widest text-accent"
          >
            <Play className="h-5 w-5" />
            Survival · this place
          </button>
          {save.outbreakBeaten && (
            <p className="font-mono text-[11px] text-accent">Dawn has already come once. Hold it again.</p>
          )}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              { icon: Zap, title: "Roll", body: "Space. I-frames. Costs wind." },
              { icon: Wind, title: "Dash", body: "Shift. Long lunge. 2 charges." },
              { icon: Shield, title: "Bash", body: "F or right-click. Stun them." },
              { icon: Skull, title: "Stovepipe", body: "X. A pipe bomb. They step on it." },
              { icon: Bell, title: "Cedar post", body: "C. A deer rifle on a fence post." },
            ].map((item) => (
              <div key={item.title} className="rounded border border-border bg-surface px-2 py-2 text-left">
                <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-accent">
                  <item.icon className="h-3 w-3" />
                  {item.title}
                </div>
                <p className="mt-1 font-lore text-[11px] leading-snug text-muted">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded border border-border bg-surface px-3 py-2">
            <div className="font-heading text-sm font-bold tracking-wider text-accent">COUNTY RECORD</div>
            <p className="font-mono text-[10px] text-muted">Lifetime deeds. Completed records grant permanent bonuses.</p>
            <div className="mt-2 grid grid-cols-1 gap-1.5 md:grid-cols-2">
              {QUESTS.map((q) => {
                const done = meta.questsDone.includes(q.id);
                const have = Math.min(meta.lifetime[q.stat], q.goal);
                return (
                  <div key={q.id} className="flex items-center justify-between gap-2 rounded bg-surface-2 px-2 py-1.5">
                    <div className="min-w-0">
                      <div className={"truncate font-mono text-[11px] font-bold " + (done ? "text-accent" : "text-fg")}>
                        {done ? "\u2713 " : ""}{q.name}
                      </div>
                      <div className="truncate font-mono text-[9px] text-muted">{q.desc} — {q.bonus}</div>
                    </div>
                    <div className="shrink-0 font-mono text-[10px] text-muted">{have}/{q.goal}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {showHelp && (
        <div className="relative z-20 mx-auto mt-4 max-w-xl rounded border border-border bg-surface p-4 font-mono text-xs leading-relaxed text-muted">
          WASD move. The gun aims and fires by itself. Hold the mouse button when you want to point it. C plants a cedar-post rifle. X lays a stovepipe — black powder in a capped pipe, and they are the ones who step on it. Ctrl makes the walk quiet. 1 magnum · 2 pump · Q mash · G road flare · E for notes, the bench, the bell · Tab workbench · Esc pause.
          The dead drop grit. The bar fills slower now. One card after a real piece of the night, not after two shamblers.
        </div>
      )}

      {showJournal && (
        <div className="relative z-20 mx-auto mt-4 max-w-xl rounded border border-border bg-surface p-4">
          <div className="font-heading text-lg text-fg">County journal</div>
          {save.journal.length === 0 ? (
            <p className="mt-2 font-lore text-sm text-muted">No notes recovered. Walk the traces.</p>
          ) : (
            <ul className="mt-2 space-y-1 font-mono text-xs text-accent">
              {save.journal.map((id) => (
                <li key={id}>{id.replace(/_/g, " ")}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function CountyMap({
  selected,
  cleared,
  onPick,
}: {
  selected: string;
  cleared: string[];
  onPick: (id: string) => void;
}) {
  const nodes: { id: string; x: number; y: number; label: string }[] = [
    { id: "white_oak_springs", x: 52, y: 28, label: "White Oak" },
    { id: "petersburg_square", x: 48, y: 48, label: "Petersburg" },
    { id: "mccords_ford", x: 28, y: 62, label: "McCord's Ford" },
    { id: "winslow_still", x: 32, y: 78, label: "Winslow" },
    { id: "stendal_backbone", x: 62, y: 80, label: "Stendal" },
    { id: "honey_springs", x: 78, y: 58, label: "Spurgeon" },
  ];
  return (
    <svg viewBox="0 0 100 100" className="h-44 w-full md:h-80">
      <rect width="100" height="100" fill="#100e0c" />
      <path d="M8 40 C 22 48, 40 55, 70 58 C 82 60, 90 72, 94 88" fill="none" stroke="#6b5428" strokeWidth="1.4" />
      <path d="M8 40 C 22 48, 40 55, 70 58 C 82 60, 90 72, 94 88" fill="none" stroke="#1e3a5f" strokeWidth="3.2" opacity="0.45" />
      <text x="70" y="54" fill="#8a8175" fontSize="3.2" fontFamily="IBM Plex Mono">
        Patoka
      </text>
      {nodes.map((n, i) => {
        const prev = nodes[Math.max(0, i - 1)];
        const inOrder = OUTBREAK_ORDER.indexOf(n.id as (typeof OUTBREAK_ORDER)[number]);
        return (
          <g key={n.id}>
            {inOrder > 0 && (
              <line
                x1={nodes.find((x) => x.id === OUTBREAK_ORDER[inOrder - 1])?.x}
                y1={nodes.find((x) => x.id === OUTBREAK_ORDER[inOrder - 1])?.y}
                x2={n.x}
                y2={n.y}
                stroke="#3a3228"
                strokeWidth="0.6"
                strokeDasharray="1.5 1"
              />
            )}
            <circle
              cx={n.x}
              cy={n.y}
              r={selected === n.id ? 3.6 : 2.4}
              fill={cleared.includes(n.id) ? "#d4a017" : selected === n.id ? "#c23b22" : "#8a8175"}
              className="cursor-pointer"
              onClick={() => onPick(n.id)}
            />
            <text
              x={n.x + 4}
              y={n.y + 1.2}
              fill={selected === n.id ? "#e8e0d4" : "#8a8175"}
              fontSize="3.4"
              fontFamily="Oswald"
              className="cursor-pointer"
              onClick={() => onPick(n.id)}
            >
              {n.label}
            </text>
            <title>{prev.label}</title>
          </g>
        );
      })}
    </svg>
  );
}

function RankRow({
  label,
  detail,
  rank,
  stubs,
  onBuy,
}: {
  label: string;
  detail: string;
  rank: number;
  stubs: number;
  onBuy: () => void;
}) {
  const maxed = rank >= 3;
  const cost = rankCost(rank);
  const afford = !maxed && stubs >= cost;
  return (
    <button
      type="button"
      disabled={!afford}
      onClick={onBuy}
      className={`flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-left ${
        afford ? "border-accent/70 bg-surface-2" : "border-border bg-surface"
      }`}
    >
      <span>
        <span className="font-mono text-[11px] uppercase tracking-widest text-fg">{label}</span>
        <span className="mt-0.5 block font-lore text-[11px] text-muted">{detail}</span>
      </span>
      <span className="font-mono text-[10px] uppercase text-accent">
        {maxed ? "Full" : `${cost} · ${"●".repeat(rank)}${"○".repeat(3 - rank)}`}
      </span>
    </button>
  );
}
