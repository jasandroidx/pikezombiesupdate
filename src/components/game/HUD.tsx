import { useEffect, useState } from "react";
import { Weapon, ActivePowerup } from "@/types/game";
import { Volume2, VolumeX, Zap, Skull, Infinity, Radio, Bell } from "lucide-react";
import { Minimap } from "./Minimap";

/** Score-multiplier powerup state (Lane 1 probe shape: {active, timeLeft, mult}).
 *  timeLeft is in ms, matching the existing ActivePowerup durationRemaining. */
export interface ScoreMulState {
  active: boolean;
  timeLeft: number;
  mult: number;
}

/** Batch 10 — Lane 3: survivor special-ability state.
 *  Engine-lane probe shape on window.__controlsTest:
 *    signatureState() -> { ready: boolean; timeLeft: number; name: string }
 *  Probe absent -> the button hides (no errors). */
export interface SignatureState {
  ready: boolean;
  timeLeft: number;
  name: string;
}

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
  /** Batch 9 — Lane 4: Lane 1's score-multiplier powerup. Null/absent = hidden. */
  scoreMul?: ScoreMulState | null;
  /** Batch 10 — Lane 3: engine lane's survivor special probe. Null/absent = hidden. */
  signature?: SignatureState | null;
  /** Batch 10 — Lane 3: fires engine.triggerSignature() (guarded, no-op until the engine lane lands it). */
  onTriggerSignature?: () => void;
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
  waveWindow?: string;
  waveSchedule?: { id: string; name: string; waves: string; blurb: string; current: boolean }[];
  eliteIn?: number;
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
  scoreMul = null,
  signature = null,
  onTriggerSignature,
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
  waveWindow = "",
  waveSchedule = [],
  eliteIn = 45,
}: HUDProps) {
  const hpPercent = Math.max(0, Math.min(100, (health / maxHealth) * 100));
  const isCritical = hpPercent < 25;
  const gritPct = Math.max(0, Math.min(100, (xp / Math.max(1, xpNeed)) * 100));

  // Batch 9 — Lane 4: score-multiplier countdown. Capture the peak timeLeft
  // when the powerup activates so the bar drains against a fixed full scale.
  // Probe absent / inactive -> badge hidden.
  const [scoreMulMax, setScoreMulMax] = useState(0);
  useEffect(() => {
    if (scoreMul && scoreMul.active) {
      if (scoreMul.timeLeft > scoreMulMax) setScoreMulMax(scoreMul.timeLeft);
    } else if (scoreMulMax !== 0) {
      setScoreMulMax(0);
    }
  }, [scoreMul, scoreMulMax]);
  const scoreMulPct =
    scoreMul && scoreMul.active && scoreMulMax > 0
      ? Math.max(0, Math.min(100, (scoreMul.timeLeft / scoreMulMax) * 100))
      : 0;

  // Batch 10 — Lane 3: survivor special cooldown. Capture the peak timeLeft
  // when the cooldown starts so the sweep fills against a fixed full scale.
  // Probe absent -> the button stays hidden entirely.
  const [sigMax, setSigMax] = useState(0);
  useEffect(() => {
    if (signature && !signature.ready) {
      if (signature.timeLeft > sigMax) setSigMax(signature.timeLeft);
    } else if (sigMax !== 0) {
      setSigMax(0);
    }
  }, [signature, sigMax]);
  // Fill = recharged fraction of the sweep. Ready -> full ring + pulse.
  const sigFill =
    signature && sigMax > 0 && !signature.ready
      ? Math.max(0, Math.min(100, 100 * (1 - signature.timeLeft / sigMax)))
      : signature?.ready
        ? 100
        : 0;

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
            {(waveWindow || (waveSchedule && waveSchedule.length > 0)) && (
              <div className="mt-1 border-t border-border/60 pt-1" title={waveSchedule?.find((w) => w.current)?.blurb ?? ""}>
                <div className="flex items-baseline justify-between font-mono text-[9px] uppercase tracking-widest">
                  <span className="text-accent">{waveWindow}</span>
                  <span className="text-muted">elite {eliteIn ?? 45}s</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5">
                  {waveSchedule?.map((w) => (
                    <span
                      key={w.id}
                      className={`font-mono text-[8px] uppercase tracking-wider ${w.current ? "text-accent" : "text-muted/50"}`}
                    >
                      {w.name} {w.waves}
                    </span>
                  ))}
                </div>
              </div>
            )}
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
                {activeEvents.map((id) => (id === "blood_moon" ? "Blood moon" : id === "golden_swarm" ? "Golden swarm" : id === "powerup_shower" ? "Powerup shower" : id === "elite_hunt" ? "Elite hunt" : id)).join(" · ")}
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
              className="animate-pickup-pop flex items-center gap-1 rounded border border-accent/50 bg-surface px-2 py-1 font-mono text-[10px] uppercase text-accent"
            >
              {p.type === "nuke" && <Skull className="h-3 w-3" />}
              {p.type === "infinite_ammo" && <Infinity className="h-3 w-3" />}
              {p.type === "insta_kill" && <Zap className="h-3 w-3" />}
              {p.type.replace("_", " ")} {Math.ceil(p.durationRemaining / 1000)}s
            </div>
          ))}
        </div>
      )}

      {scoreMul && scoreMul.active && (
        <div className="mt-2 flex justify-center">
          <div
            data-testid="score-mul-badge"
            className="animate-pickup-pop flex items-center gap-2 rounded border border-accent bg-surface px-3 py-1.5"
          >
            <Zap className="h-3.5 w-3.5 text-accent" />
            <span className="font-heading text-sm font-bold tracking-wider text-accent">
              {scoreMul.mult}× SCORE
            </span>
            <span data-testid="score-mul-seconds" className="font-mono text-xs text-fg">
              {Math.ceil(scoreMul.timeLeft / 1000)}s
            </span>
            <div
              className="h-2 w-24 overflow-hidden rounded bg-surface-2"
              role="progressbar"
              aria-label="Score multiplier time left"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(scoreMulPct)}
            >
              <div
                data-testid="score-mul-bar"
                className="h-full bg-accent transition-[width] duration-150"
                style={{ width: `${scoreMulPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex w-full items-end justify-between">
        <div className="flex flex-col items-start gap-2">
          {/* Batch 10 (Lane 2): corner minimap — second orthographic camera,
              probe-fed, ~10Hz, DPR-aware. Bottom-left keeps it clear of the
              wave-shop panel (top-right) and the engine's own canvas minimap. */}
          <Minimap />
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

        {/* Batch 10 — Lane 3: survivor special. Probe absent -> hidden, no errors. */}
        {signature && (
          <button
            type="button"
            data-testid="signature-button"
            onClick={onTriggerSignature}
            disabled={!signature.ready}
            title={signature.ready ? `${signature.name} — press Q` : `${signature.name} — recharging`}
            aria-label={signature.ready ? `Use special: ${signature.name}` : `Special recharging: ${signature.name}`}
            className={`pointer-events-auto relative flex h-16 w-16 shrink-0 flex-col items-center justify-center overflow-hidden rounded-full border-2 md:h-[4.5rem] md:w-[4.5rem] ${
              signature.ready
                ? "animate-pulse border-accent bg-accent/15"
                : "border-border bg-surface/80"
            }`}
          >
            <span
              data-testid="signature-sweep"
              aria-hidden
              className="absolute inset-0"
              style={{
                background: `conic-gradient(from -90deg, rgba(212,160,23,0.45) ${sigFill * 3.6}deg, transparent 0deg)`,
              }}
            />
            <span className="relative max-w-[3.5rem] truncate px-1 font-heading text-[10px] font-bold leading-tight tracking-wide text-fg">
              {signature.name}
            </span>
            <span
              data-testid="signature-key"
              className={`relative mt-0.5 rounded border px-1 font-mono text-[9px] uppercase tracking-widest ${
                signature.ready ? "border-accent text-accent" : "border-border text-muted"
              }`}
            >
              Q
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
