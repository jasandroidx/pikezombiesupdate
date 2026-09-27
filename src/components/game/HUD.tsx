import { Weapon, ActivePowerup } from "@/types/game";
import { Volume2, VolumeX, Zap, Skull, Infinity, Radio, Bell } from "lucide-react";

interface HUDProps {
  health: number;
  maxHealth: number;
  stamina: number;
  weapon: Weapon;
  molotovs: number;
  flares: number;
  posts?: number;
  pipes?: number;
  score: number;
  scrap: number;
  combo: number;
  wave: number;
  waveTimer: number;
  zombiesRemaining: number;
  isReloading: boolean;
  reloadProgress: number;
  isMuted: boolean;
  activePowerups?: ActivePowerup[];
  onToggleMute: () => void;
  onOpenWorkbench: () => void;
  onSkipWaveTimer: () => void;
  locationName: string;
  township: string;
  radioCall?: string;
  radioBody?: string;
  extractActive?: boolean;
  interactHint?: string;
  modeLabel: string;
  lanternLit?: boolean;
  hasLantern?: boolean;
  sneaking?: boolean;
  bellReady?: boolean;
  bellHold?: number;
  holesOpen?: number;
  holesTotal?: number;
  bloodRush?: boolean;
  lastStandReady?: boolean;
  dodgeReady?: boolean;
  fog?: boolean;
  level?: number;
  xp?: number;
  xpNeed?: number;
  evolved?: string | null;
  waveCall?: string;
  bounty?: string;
  fresh?: boolean;
  weaponIndex?: number;
  loadout?: { id: string; name: string; unlocked: boolean; mag: number; reserve: number }[];
  switchBanner?: number;
  helpVisible?: boolean;
  onSelectWeapon?: (index: number) => void;
  bombCharges?: number;
  bombMax?: number;
  dashCharges?: number;
  dashMax?: number;
  gritBag?: number;
  activeEvents?: string[];
}

export function HUD({
  health,
  maxHealth,
  stamina,
  weapon,
  molotovs,
  flares,
  posts = 0,
  pipes = 0,
  score,
  scrap,
  combo,
  wave,
  waveTimer,
  zombiesRemaining,
  isReloading,
  reloadProgress,
  isMuted,
  activePowerups = [],
  onToggleMute,
  onOpenWorkbench,
  onSkipWaveTimer,
  locationName,
  township,
  radioCall,
  radioBody,
  extractActive,
  interactHint: _interactHint,
  modeLabel,
  lanternLit,
  hasLantern,
  sneaking,
  bellReady,
  bellHold = 0,
  holesOpen = 0,
  holesTotal = 0,
  bloodRush = false,
  lastStandReady = true,
  dodgeReady = true,
  fog = false,
  level = 1,
  xp = 0,
  xpNeed = 4,
  evolved = null,
  waveCall = "",
  bounty = "",
  fresh = false,
  weaponIndex = 0,
  loadout = [],
  switchBanner = 0,
  helpVisible = true,
  onSelectWeapon,
  bombCharges = 1,
  bombMax = 2,
  dashCharges = 2,
  dashMax = 2,
  gritBag = 0,
  activeEvents = [],
}: HUDProps) {
  const hpPercent = Math.max(0, Math.min(100, (health / maxHealth) * 100));
  const isCritical = hpPercent < 25;
  const gritPct = Math.max(0, Math.min(100, (xp / Math.max(1, xpNeed)) * 100));

  return (
    <div className="hud-shell pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3 pb-32 md:p-4 md:pb-5 select-none">
      {isCritical && (
        <div className="pointer-events-none absolute inset-0 border-4 border-primary/50" />
      )}

      <div className="flex w-full items-start justify-between gap-2">
        <div className="flex max-w-[70%] flex-col gap-1.5">
          <div className="hud-plate rounded px-2.5 py-1.5">
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-lg font-bold tracking-wider text-fg md:text-2xl">
                WAVE {wave || 1}
              </span>
              {extractActive ? (
                <span className="animate-pulse font-mono text-[10px] text-accent">EXTRACT</span>
              ) : bellReady ? (
                <span className="inline-flex animate-pulse items-center gap-1 font-mono text-[10px] text-accent">
                  <Bell className="h-3 w-3" /> BELL
                </span>
              ) : waveTimer > 0 ? (
                <span className="font-mono text-xs text-accent">{waveTimer}s</span>
              ) : (
                <span className="infected-count font-wild text-base tracking-wide md:text-xl">
                  {zombiesRemaining}
                </span>
              )}
            </div>
            <div className="mt-1">
              <div className="mb-0.5 flex justify-between font-mono text-[9px] uppercase tracking-widest text-accent">
                <span>Grit {level}</span>
                <span>{Math.floor(xp)}/{xpNeed}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded bg-surface-2 md:h-3">
                <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${gritPct}%` }} />
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-widest">
              <span className="text-accent">
                Bomb{" "}
                {Array.from({ length: bombMax }).map((_, i) => (
                  <span key={i} className={i < bombCharges ? "text-accent" : "text-muted/40"}>
                    ●
                  </span>
                ))}{" "}
                <span className="text-muted">[B]</span>
              </span>
              <span className="text-accent">
                Dash{" "}
                {Array.from({ length: dashMax }).map((_, i) => (
                  <span key={i} className={i < dashCharges ? "text-accent" : "text-muted/40"}>
                    ●
                  </span>
                ))}{" "}
                <span className="text-muted">[Shift]</span>
              </span>
              {gritBag > 0 && <span className="text-accent">Bag +{gritBag}</span>}
            </div>
            {activeEvents.length > 0 && (
              <div className="mt-1 animate-pulse font-mono text-[10px] uppercase tracking-widest text-primary">
                {activeEvents.map((id) => (id === "blood_moon" ? "Blood moon" : id === "golden_swarm" ? "Golden swarm" : id)).join(" · ")}
              </div>
            )}
            {bellReady && (
              <div className="mt-1 h-1 overflow-hidden rounded bg-surface-2">
                <div className="h-full bg-accent" style={{ width: `${Math.min(100, bellHold * 100)}%` }} />
              </div>
            )}
            {bloodRush && (
              <div className="mt-1 animate-pulse font-mono text-[10px] uppercase tracking-widest text-primary">Blood rush</div>
            )}
          </div>

          {waveTimer > 0 && !extractActive && !bellReady && (
            <button
              type="button"
              className="pointer-events-auto w-fit rounded border border-border bg-surface-2 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-fg"
              onClick={onSkipWaveTimer}
            >
              Skip break
            </button>
          )}

          {radioBody && (
            <div className="max-w-sm truncate rounded bg-black/45 px-2 py-1 font-lore text-xs text-fg/90">
              <Radio className="mr-1 inline h-3 w-3 text-accent" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">{radioCall || "WJPS"} </span>
              {radioBody}
            </div>
          )}
        </div>

        <div className="flex items-start gap-2">
          <button
            type="button"
            className="pointer-events-auto rounded border border-border bg-surface p-2 text-fg"
            onClick={onToggleMute}
            title="Mute"
          >
            {isMuted ? <VolumeX className="h-4 w-4 text-primary" /> : <Volume2 className="h-4 w-4 text-accent" />}
          </button>
        </div>
      </div>

      {activePowerups.length > 0 && (
        <div className="mt-2 flex justify-center gap-2">
          {activePowerups.map((p) => (
            <div
              key={p.type}
              className="flex items-center gap-1 rounded border border-accent/50 bg-surface px-2 py-1 font-mono text-[10px] uppercase text-accent"
            >
              {p.type === "nuke" && <Skull className="h-3 w-3" />}
              {p.type === "infinite_ammo" && <Infinity className="h-3 w-3" />}
              {p.type === "insta_kill" && <Zap className="h-3 w-3" />}
              {p.type.replace("_", " ")} {Math.ceil(p.durationRemaining / 1000)}s
            </div>
          ))}
        </div>
      )}

      <div className="flex w-full items-end justify-between">
        <div className="hud-plate w-32 rounded px-2 py-1.5 md:w-40">
          <div className="h-2.5 overflow-hidden rounded bg-surface-2">
            <div className={`h-full ${isCritical ? "bg-primary" : "bg-accent"}`} style={{ width: `${hpPercent}%` }} />
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded bg-surface-2">
            <div className="h-full bg-fg/55" style={{ width: `${stamina}%` }} />
          </div>
          {sneaking && (
            <div className="mt-1 font-mono text-[9px] uppercase tracking-widest text-accent">Quiet</div>
          )}
        </div>

        <div className="hud-plate rounded px-3 py-1.5 text-center">
          <div className="font-mono text-lg leading-none text-accent">
            {weapon.currentMag}
            <span className="text-sm text-muted"> / {weapon.reserveAmmo}</span>
          </div>
          {isReloading && (
            <div className="mt-1.5 h-1 overflow-hidden rounded bg-surface-2">
              <div className="h-full bg-accent" style={{ width: `${reloadProgress * 100}%` }} />
            </div>
          )}
          <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
            Post {posts} · Pipe {pipes}
          </div>
        </div>
      </div>
    </div>
  );
}
