import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameEngine } from "@/game/engine";
import { AVAILABLE_PERKS, GAME_LOCATIONS, INITIAL_WEAPONS, OUTBREAK_FINAL_WAVES, OUTBREAK_ORDER, OUTBREAK_WAVES_PER_MAP, RUN_EVENTS, locationIndexById } from "@/game/constants";
import { soundEngine } from "@/audio/soundEngine";
import { loadArt } from "@/game/art";
import { dprCap } from "@/game/mapRenderer";
import { loadSave } from "@/game/save";
import { characterDef, markDailyPlayed, selectedCharacterId } from "@/game/meta";
import { HUD } from "@/components/game/HUD";
import type { SignatureState } from "@/components/game/HUD";
import { StartScreen } from "@/components/game/StartScreen";
import { UpgradeShopModal } from "@/components/game/UpgradeShopModal";
import { GameOverModal } from "@/components/game/GameOverModal";
import { LoreNoteModal } from "@/components/game/LoreNoteModal";
import { MobileControls } from "@/components/game/MobileControls";
import { WaveShop } from "@/components/game/WaveShop";
import { PauseMenu } from "@/components/game/PauseMenu";
import { ControlsModal } from "@/components/game/ControlsModal";
import { TailgateDraft } from "@/components/game/TailgateDraft";
import { CacheSlots } from "@/components/game/CacheSlots";
import { SlotMachine, SlotsBreakButton, gambleProbeAvailable, slotCostProbe } from "@/components/game/SlotMachine";
import { TuningPanel, applyStoredTuning } from "@/components/game/TuningPanel";
import { AccessibilityPanel, applyStoredA11y } from "@/components/game/AccessibilityPanel";
import { CodexPanel } from "@/components/game/CodexPanel";
import { EventBanners } from "@/components/game/EventBanners";
import { KNOWN_EVENT_META } from "@/components/game/eventMeta";
import { MutatorChips } from "@/components/game/MutatorChips";
import type { BoonOffer } from "@/game/boons";
import type { ActivePowerup, EngineSnapshot, GameMode, LoreNote, Perk, PlayerStats, Weapon } from "@/types/game";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <GameApp />;
}

function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const carryRef = useRef<EngineSnapshot | null>(null);
  const outbreakStepRef = useRef(0);
  const modeRef = useRef<GameMode>("survival");
  // Batch 5 (Lane D): seed of the current daily run, if any. Preserved across
  // "Run it back" restarts so the daily challenge replays the same seed.
  const seedRef = useRef<number | undefined>(undefined);

  const [screen, setScreen] = useState<"title" | "playing" | "game_over">("title");
  const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(false);
  const [activeLoreNote, setActiveLoreNote] = useState<LoreNote | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [mode, setMode] = useState<GameMode>("survival");
  const [outbreakStep, setOutbreakStep] = useState(0);
  const [won, setWon] = useState(false);
  const [killer, setKiller] = useState("shambler");
  const [radio, setRadio] = useState<{ call: string; body: string } | null>(null);
  const [foundNotes, setFoundNotes] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [draft, setDraft] = useState<BoonOffer[] | null>(null);
  const [cacheSymbols, setCacheSymbols] = useState<string[] | null>(null);
  // Batch 11 (Lane 2): slot machine modal (wave break).
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [hitFeel, setHitFeel] = useState(true);
  // Batch 6 (Lane E): hidden tuning panel (backtick), settings/a11y, codex.
  const [showTuning, setShowTuning] = useState(false);
  const [showA11y, setShowA11y] = useState(false);
  const [showCodex, setShowCodex] = useState(false);
  // Batch 6 (coordinator): unlocks tracked in engine.codexSeen; synced here
  // whenever the codex opens. Daily entry is marked on daily-run start.
  const [codexUnlocked, setCodexUnlocked] = useState<string[]>([]);
  const [boonStacks, setBoonStacks] = useState<Record<string, number>>({});
  const [rerolls, setRerolls] = useState(1);
  const [banishCharges, setBanishCharges] = useState(2);
  // Batch 12 (Lane 3): run-event React banners + tracker. The engine fires
  // events through the existing onRadio callback (fireEvent ->
  // onRadio("WJPS Petersburg", ev.radio)); we match the radio body against
  // RUN_EVENTS so new engine events banner without changes on this side.
  const [eventBanner, setEventBanner] = useState<{ id: string; title: string; body: string; key: number } | null>(null);
  const [eventTracker, setEventTracker] = useState<{ id: string; total: number; remaining: number } | null>(null);
  // Batch 12 (Lane 3): mutators chosen on the title screen (same list the
  // daily run threads through), rendered as in-run HUD chips.
  const [runMutators, setRunMutators] = useState<string[]>([]);
  const trackedEventRef = useRef<string | null>(null);

  const [selectedLocationIdx, setSelectedLocationIdx] = useState(0);
  const [weapons, setWeapons] = useState<Weapon[]>(INITIAL_WEAPONS);
  const [perks, setPerks] = useState<Perk[]>(AVAILABLE_PERKS);

  const [hudStats, setHudStats] = useState({
    health: 100,
    maxHealth: 100,
    stamina: 100,
    weapon: INITIAL_WEAPONS[0],
    molotovs: 3,
    flares: 2,
    posts: 1,
    pipes: 1,
    score: 0,
    scrap: 150,
    combo: 1,
    wave: 1,
    waveTimer: 0,
    zombiesRemaining: 0,
    isReloading: false,
    reloadProgress: 0,
    activePowerups: [] as ActivePowerup[],
    // Batch 9 — Lane 4: Lane 1's score-multiplier powerup state, polled from
    // window.__controlsTest.scoreMulState() in onStatsUpdate. Null = hidden.
    scoreMul: null as { active: boolean; timeLeft: number; mult: number } | null,
    // Batch 10 — Lane 3: engine lane's survivor special probe
    // (window.__controlsTest.signatureState). Null = the HUD button hides.
    signature: null as SignatureState | null,
    nearWorkbench: false,
    extractActive: false,
    interactHint: "",
    lanternLit: false,
    hasLantern: false,
    sneaking: false,
    bellReady: false,
    bellHold: 0,
    holesOpen: 0,
    holesTotal: 0,
    bloodRush: false,
    lastStandReady: true,
    dodgeReady: true,
    fog: false,
    level: 1,
    xp: 0,
    xpNeed: 22,
    evolved: null as string | null,
    evolutionHints: [] as string[],
    gritBag: 0,
    bombCharges: 1,
    bombMax: 2,
    dashCharges: 2,
    dashMax: 2,
    waveState: "break",
    waveWindow: "Dusk Settles",
    waveSchedule: [] as { id: string; name: string; waves: string; blurb: string; current: boolean }[],
    eliteIn: 45,
    shopOffers: [] as { id: string; name: string; desc: string; cost: number; locked: boolean; afford: boolean }[],
    shopRerollCost: 15,
    activeEvents: [] as string[],
    waveCall: "",
    bounty: "",
    fresh: false,
    weaponIndex: 0,
    loadout: [] as { id: string; name: string; unlocked: boolean; mag: number; reserve: number }[],
    switchBanner: 0,
    helpVisible: true,
  });

  const [gameOverData, setGameOverData] = useState<{ stats: PlayerStats; score: number; wave: number; level: number }>({
    stats: {
      kills: 0,
      headshots: 0,
      shotsFired: 0,
      shotsHit: 0,
      damageDealt: 0,
      damageTaken: 0,
      scrapCollected: 0,
      wavesCompleted: 0,
      survivalTime: 0,
      notesFound: 0,
      maxStreak: 0,
    },
    score: 0,
    wave: 1,
    level: 1,
  });

  const updateCanvasDimensions = useCallback(() => {
    if (!canvasRef.current) return;
    // Batch 8 (Lane C): DPR cap — the engine renders in CSS-pixel space
    // (viewZoom/viewSize/screenToWorld read canvas.width directly), so the
    // backing store stays at 1x CSS: always within the 1.5x desktop / 1.0x
    // narrow-mobile cap. The capped value is recorded for a DPR-aware render
    // loop (engine lane); qualityFactor() drives cosmetic particle budgets.
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    canvasRef.current.width = cssW;
    canvasRef.current.height = cssH;
    canvasRef.current.style.width = `${cssW}px`;
    canvasRef.current.style.height = `${cssH}px`;
    canvasRef.current.dataset.pzDpr = String(dprCap());
  }, []);

  useEffect(() => {
    void loadArt();
    updateCanvasDimensions();
    window.addEventListener("resize", updateCanvasDimensions);
    const onVis = () => {
      if (document.visibilityState === "visible") soundEngine.resume();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("resize", updateCanvasDimensions);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [updateCanvasDimensions]);

  useEffect(() => {
    if (!radio) return;
    const t = window.setTimeout(() => setRadio(null), 7200);
    return () => window.clearTimeout(t);
  }, [radio]);

  const applySaveUnlocks = (engine: GameEngine) => {
    const save = loadSave();
    for (const w of engine.weapons) {
      if (save.unlockedWeapons.includes(w.id)) w.unlocked = true;
    }
    const hide = save.ranks?.hide ?? 0;
    const boots = save.ranks?.boots ?? 0;
    const magnet = save.ranks?.magnet ?? 0;
    engine.player.maxHealth += hide * 14;
    engine.player.health = engine.player.maxHealth;
    engine.player.speed *= 1 + boots * 0.05;
    engine.gritBonus = magnet;
  };

  // Batch 12 (Lane 3): shared banner entry point. Called from the onRadio
  // event path below and from the __pzLane3 test hook. Resolves RUN_EVENTS
  // first, falling back to KNOWN_EVENT_META so the banners work even if
  // the engine lane has not landed its RUN_EVENTS entries yet. The new
  // event stingers ride along here; the engine's playWaveHorn still fires
  // from engine.ts fireEvent for the old events.
  const fireEventBanner = useCallback((id: string) => {
    const run = RUN_EVENTS.find((e) => e.id === id);
    const title = run ? run.banner : KNOWN_EVENT_META[id]?.title;
    const body = run ? run.radio : KNOWN_EVENT_META[id]?.body;
    if (!title || !body) return;
    trackedEventRef.current = id;
    setEventBanner({ id, title, body, key: Date.now() });
    setEventTracker(null);
    try {
      if (id === "powerup_shower") soundEngine.playPowerupShower();
      else if (id === "elite_hunt") soundEngine.playEliteHunt();
    } catch {
      // Audio must never break the banner path.
    }
  }, []);

  const handleStartGame = (locationIndex: number, difficultyMultiplier: number, nextMode: GameMode = "survival", mutators: string[] = [], seed?: number) => {
    soundEngine.init();
    modeRef.current = nextMode;
    outbreakStepRef.current = 0;
    // Batch 5 (Lane D): daily-run seed. markDailyPlayed() records "attempted
    // today"; the seed is forwarded to bootEngine (see integration note there).
    seedRef.current = seed;
    if (seed !== undefined) { markDailyPlayed(); setCodexUnlocked((u) => u.includes("daily_challenge") ? u : [...u, "daily_challenge"]); }
    setMode(nextMode);
    setWon(false);
    setRadio(null);
    // Batch 12 (Lane 3): stash the title screen's mutator picks for the
    // in-run HUD chips; clear any stale event banner/tracker state.
    setRunMutators(mutators);
    setEventBanner(null);
    setEventTracker(null);
    trackedEventRef.current = null;
    setFoundNotes([]);
    carryRef.current = null;
    const idx = nextMode === "outbreak" ? locationIndexById(OUTBREAK_ORDER[0]) : locationIndex;
    setOutbreakStep(0);
    setSelectedLocationIdx(idx);
    bootEngine(idx, difficultyMultiplier, nextMode, 0, null, mutators, seed);
  };

  const bootEngine = (
    locationIndex: number,
    difficultyMultiplier: number,
    nextMode: GameMode,
    step: number,
    carry: EngineSnapshot | null,
    mutators: string[] = [],
    seed?: number,
  ) => {
    if (!canvasRef.current) return;
    updateCanvasDimensions();
    engineRef.current?.destroy();

    // Batch 5: daily-challenge seed — the 4th constructor arg `{ seed }` is
    // accepted by engine.ts (ctor ~line 328), which builds this.rng from it
    // and uses it for gameplay rolls (spawn composition, elites, powerup/cache
    // timers, spawn positions). Cosmetic jitter stays on Math.random.
    const engine = new GameEngine(
      canvasRef.current,
      {
        onWaveComplete: () => {
          if (engineRef.current) {
            setWeapons([...engineRef.current.weapons]);
            setPerks([...engineRef.current.perks]);
          }
        },
        onDraft: (offers: BoonOffer[] | null) => {
          setDraft(offers);
          setBoonStacks({ ...(engineRef.current?.boonStacks ?? {}) });
          setRerolls(engineRef.current?.rerolls ?? 0);
          setBanishCharges(engineRef.current?.banishCharges ?? 0);
        },
        onGameOver: (stats: PlayerStats, finalScore: number, deathKiller: string) => {
          setKiller(deathKiller);
          setWon(false);
          setGameOverData({
            stats,
            score: finalScore,
            wave: engineRef.current ? engineRef.current.wave : 1,
            level: engineRef.current ? engineRef.current.level : 1,
          });
          setScreen("game_over");
        },
        onStatsUpdate: (stats: typeof hudStats) => {
          // Batch 9 — Lane 4: poll Lane 1's score-multiplier probe on the same
          // tick the HUD already reads engine state. Probe absent (Lane 1 not
          // landed yet) or errored -> null -> the 2x badge stays hidden.
          let scoreMul: typeof hudStats.scoreMul = null;
          try {
            const probe = window.__controlsTest?.scoreMulState;
            if (typeof probe === "function") {
              const s = probe();
              if (s && s.active === true) {
                scoreMul = {
                  active: true,
                  timeLeft: typeof s.timeLeft === "number" ? s.timeLeft : 0,
                  mult: typeof s.mult === "number" ? s.mult : 2,
                };
              }
            }
          } catch {
            scoreMul = null;
          }
          // Batch 10 — Lane 3: poll the engine lane's survivor-special probe
          // on the same tick. Shape: { ready: boolean; timeLeft: number; name: string }.
          // Probe absent (engine lane still working) or errored -> null ->
          // the special-ability HUD button hides gracefully.
          let signature: typeof hudStats.signature = null;
          try {
            const sigProbe = window.__controlsTest?.signatureState;
            if (typeof sigProbe === "function") {
              const s = sigProbe();
              if (s && typeof s === "object") {
                signature = {
                  ready: s.ready === true,
                  timeLeft: typeof s.timeLeft === "number" && s.timeLeft > 0 ? s.timeLeft : 0,
                  name: typeof s.name === "string" && s.name.length > 0 ? s.name : "Special",
                };
              }
            }
          } catch {
            signature = null;
          }
          // Batch 12 (Lane 3): poll the engine lane's event-tracker probe
          // for the bannered event, on the same tick the HUD already reads
          // engine state. Probe absent (engine lane still working) or
          // errored -> null -> the tracker chip hides gracefully. The
          // contract: window.__controlsTest.eventState(id) returns
          // { total, remaining } while the event is active.
          let tracker: { id: string; total: number; remaining: number } | null = null;
          try {
            const tid = trackedEventRef.current;
            const probe = window.__controlsTest?.eventState;
            if (tid && typeof probe === "function") {
              const t = probe(tid);
              if (t && typeof t === "object" && Number.isFinite(t.total) && Number.isFinite(t.remaining)) {
                const total = Math.max(0, Math.floor(t.total));
                const remaining = Math.max(0, Math.floor(t.remaining));
                if (total > 0 && remaining > 0) {
                  tracker = { id: tid, total, remaining };
                } else {
                  trackedEventRef.current = null; // event over -> stop polling
                }
              }
            }
          } catch {
            tracker = null;
          }
          setEventTracker(tracker);
          setHudStats({ ...stats, scoreMul, signature });
        },
        onLoreNoteFound: (note: LoreNote) => {
          setActiveLoreNote(note);
          setFoundNotes((n) => Array.from(new Set([...n, note.id])));
          engineRef.current?.setPaused(true);
        },
        onRadio: (call: string, body: string) => {
          setRadio({ call, body });
          // Batch 12 (Lane 3): run-event banners ride the engine's existing
          // onRadio callback. Match the radio body against RUN_EVENTS (the
          // engine's fireEvent sends ev.radio verbatim); non-event radio
          // (Unknown, WJPS, extract) matches nothing and stays bannerless.
          const def = RUN_EVENTS.find((e) => e.radio === body);
          if (def) fireEventBanner(def.id);
        },
        onCache: (symbols: string[] | null) => setCacheSymbols(symbols),
        onExtractReady: () => {
          setRadio({ call: "WJPS Petersburg", body: "Truck's lit. Get off this ground before the next horn." });
        },
        onExtract: () => advanceOutbreak(),
        onWorkbenchPrompt: () => {
          setIsWorkbenchOpen(true);
          engineRef.current?.setPaused(true);
        },
      },
      locationIndex,
      // Batch 5: daily-challenge seed — engine.ts ctor accepts { seed } as the 4th param.
      { seed },
    );

    applySaveUnlocks(engine);
    engine.mutators = mutators;
    // Batch 9 — Lane 4: apply the selected survivor's starting weapon.
    // Lane 1 applies the passive mods + stage rule flags at run start by
    // reading meta.ts (characterDef / stageDef) — this lane never touches
    // engine internals. Idempotent: selecting the same index twice is a no-op.
    try {
      const def = characterDef(selectedCharacterId());
      const wi = engine.weapons.findIndex((w: { id: string }) => w.id === def.weaponId);
      if (wi >= 0) {
        engine.weapons[wi].unlocked = true;
        engine.selectWeapon(wi);
      }
    } catch {
      // Default survivor (revolver) stays equipped.
    }
    if (carry) engine.importSnapshot(carry);
    if (nextMode === "outbreak") {
      const last = step >= OUTBREAK_ORDER.length - 1;
      engine.outbreakWaves = last ? OUTBREAK_FINAL_WAVES : OUTBREAK_WAVES_PER_MAP;
    } else {
      engine.outbreakWaves = 0;
    }

    engineRef.current = engine;
    setWeapons([...engine.weapons]);
    setPerks([...engine.perks]);
    setScreen("playing");
    setPaused(false);
    setDraft(null);
    setIsWorkbenchOpen(false);
    setPostRank(1);
    engine.start(difficultyMultiplier);
    // Batch 6 (Lane E): re-adopt persisted tuning + a11y settings on every boot.
    // Both are no-ops against hooks the engine doesn't have yet.
    applyStoredTuning(engine);
    applyStoredA11y(engine);
  };

  const advanceOutbreak = () => {
    const engine = engineRef.current;
    if (!engine || modeRef.current !== "outbreak") return;
    const snap = engine.exportSnapshot();
    carryRef.current = snap;
    const next = outbreakStepRef.current + 1;
    outbreakStepRef.current = next;
    setOutbreakStep(next);
    if (next >= OUTBREAK_ORDER.length) {
      setWon(true);
      setGameOverData({ stats: snap.stats, score: snap.score, wave: engine.wave, level: engine.level });
      setScreen("game_over");
      engine.destroy();
      engineRef.current = null;
      return;
    }
    const idx = locationIndexById(OUTBREAK_ORDER[next]);
    setSelectedLocationIdx(idx);
    bootEngine(idx, engine.difficultyMultiplier, "outbreak", next, snap);
  };

  const handleToggleMute = () => setIsMuted(soundEngine.toggleMute());

  // Batch 10 — Lane 3: survivor special trigger. The engine lane owns
  // engine.triggerSignature(); until it lands, this is a guarded no-op and
  // the HUD button stays hidden (the signatureState probe is absent).
  const handleTriggerSignature = useCallback(() => {
    try {
      const eng = engineRef.current as unknown as { triggerSignature?: () => void } | null;
      if (eng && typeof eng.triggerSignature === "function") {
        eng.triggerSignature();
        return;
      }
      const probe = (window as unknown as { __controlsTest?: Record<string, unknown> }).__controlsTest
        ?.triggerSignature;
      if (typeof probe === "function") (probe as () => void)();
    } catch {
      // Probe absent: nothing to trigger.
    }
  }, []);

  const handleToggleWorkbench = () => {
    if (screen !== "playing") return;
    setPaused(false);
    setIsWorkbenchOpen((prev) => {
      const next = !prev;
      engineRef.current?.setPaused(next);
      return next;
    });
  };

  const handleToggleControls = () => {
    if (screen !== "playing") return;
    setPaused(false);
    setIsWorkbenchOpen(false);
    setShowControls((prev) => {
      const next = !prev;
      engineRef.current?.setPaused(next);
      return next;
    });
  };

  const handleCloseLoreNote = () => {
    setActiveLoreNote(null);
    if (engineRef.current && !isWorkbenchOpen) engineRef.current.setPaused(false);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Batch 6 (Lane E): backtick toggles the hidden field-tuning panel,
      // from any screen.
      if (e.key === "`" && !e.repeat) {
        e.preventDefault();
        setShowTuning((v) => !v);
        return;
      }
      // Escape closes Lane E panels before anything else.
      if (e.code === "Escape") {
        if (showA11y) {
          setShowA11y(false);
          return;
        }
        if (showCodex) {
          setShowCodex(false);
          return;
        }
        if (showTuning) {
          setShowTuning(false);
          return;
        }
      }
      if (activeLoreNote) {
        if (e.code === "Escape" || e.code === "Space" || e.code === "KeyE") {
          e.preventDefault();
          handleCloseLoreNote();
        }
        return;
      }
      if (draft) return;
      if (showControls) {
        if (e.code === "KeyH" || e.code === "Escape") {
          e.preventDefault();
          handleToggleControls();
        }
        return;
      }
      if (e.code === "KeyH") {
        e.preventDefault();
        handleToggleControls();
      } else if (e.code === "Tab") {
        e.preventDefault();
        handleToggleWorkbench();
      } else if (e.code === "KeyM") {
        handleToggleMute();
      } else if (e.code === "KeyQ" && !e.repeat) {
        // Batch 10 — Lane 3: survivor special key binding. The engine lane
        // owns the actual trigger (engine.triggerSignature); this calls the
        // same guarded path as the HUD button and no-ops until it lands.
        if (screen === "playing" && !isWorkbenchOpen && !draft && !activeLoreNote) {
          e.preventDefault();
          handleTriggerSignature();
        }
      } else if (e.code === "Escape") {
        e.preventDefault();
        if (isWorkbenchOpen) handleToggleWorkbench();
        else if (screen === "playing") {
          setPaused((prev) => {
            const next = !prev;
            engineRef.current?.setPaused(next);
            return next;
          });
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [screen, isWorkbenchOpen, activeLoreNote, draft, showControls, showA11y, showCodex, showTuning, handleTriggerSignature]);

  // Batch 12 (Lane 3): the big event banner dismisses after 6s; the small
  // tracker chip lives on via the probe poll above until the event ends.
  useEffect(() => {
    if (!eventBanner) return;
    const t = setTimeout(() => setEventBanner(null), 6000);
    return () => clearTimeout(t);
  }, [eventBanner]);

  // Batch 12 (Lane 3): test hook so Playwright can force an event banner
  // through the same fireEventBanner path the engine's onRadio callback
  // uses, without depending on the engine lane's event timing. Exposes
  // soundEngine too, so stingers can be called directly in tests.
  useEffect(() => {
    (window as unknown as { __pzLane3?: unknown }).__pzLane3 = { fireEventBanner, sound: soundEngine };
    return () => {
      delete (window as unknown as { __pzLane3?: unknown }).__pzLane3;
    };
  }, [fireEventBanner]);

  const handleUnlockWeapon = (index: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const wep = engine.weapons[index];
    if (engine.scrap >= wep.cost && !wep.unlocked) {
      engine.scrap -= wep.cost;
      wep.unlocked = true;
      engine.selectWeapon(index);
      setWeapons([...engine.weapons]);
    }
  };

  const handleEquipWeapon = (index: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.selectWeapon(index);
    setWeapons([...engine.weapons]);
  };

  const handleUpgradeWeapon = (index: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const wep = engine.weapons[index];
    const cost = Math.round(wep.damage * 4.5 * wep.upgradeLevel);
    if (engine.scrap >= cost) {
      engine.scrap -= cost;
      wep.upgradeLevel++;
      wep.damage = Math.round(wep.damage * 1.2);
      wep.magazineSize = Math.round(wep.magazineSize * 1.15);
      wep.currentMag = wep.magazineSize;
      engine.selectWeapon(index);
      setWeapons([...engine.weapons]);
    }
  };

  const handleUpgradePerk = (perkId: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    const perk = engine.perks.find((p: Perk) => p.id === perkId);
    if (!perk) return;
    const cost = perk.cost * (perk.level + 1);
    if (engine.scrap >= cost && perk.level < perk.maxLevel) {
      engine.scrap -= cost;
      perk.level++;
      if (perk.id === "grit") {
        engine.player.maxHealth += 25;
        engine.player.health = Math.min(engine.player.maxHealth, engine.player.health + 25);
      }
      setPerks([...engine.perks]);
    }
  };

  const syncCarry = () => {
    const engine = engineRef.current;
    if (!engine) return;
    setHudStats((s) => ({
      ...s,
      scrap: engine.scrap,
      molotovs: engine.player.molotovs,
      flares: engine.player.flares,
    }));
  };

  const [postRank, setPostRank] = useState(1);
  const handleUpgradePost = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.upgradePost()) setPostRank(engine.postRank);
  };

  const handleBuyAmmoRefill = () => {
    const engine = engineRef.current;
    if (!engine || engine.scrap < 80) return;
    engine.scrap -= 80;
    for (const w of engine.weapons) {
      if (w.unlocked) {
        w.reserveAmmo = w.maxReserveAmmo;
        w.currentMag = w.magazineSize;
      }
    }
    setWeapons([...engine.weapons]);
    syncCarry();
  };

  const handleBuyMolotov = () => {
    const engine = engineRef.current;
    if (!engine || engine.scrap < 60) return;
    if (engine.player.molotovs < engine.player.maxMolotovs) {
      engine.scrap -= 60;
      engine.player.molotovs++;
      syncCarry();
    }
  };

  const handleBuyFlare = () => {
    const engine = engineRef.current;
    if (!engine || engine.scrap < 40) return;
    if (engine.player.flares < engine.player.maxFlares) {
      engine.scrap -= 40;
      engine.player.flares++;
      syncCarry();
    }
  };

  const loc = GAME_LOCATIONS[selectedLocationIdx];

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-bg select-none">
      <canvas id="game-canvas" ref={canvasRef} className="block h-full w-full cursor-crosshair" />

      {screen === "title" && (
        <StartScreen
          onStartGame={handleStartGame}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onOpenSettings={() => setShowA11y(true)}
          onOpenCodex={() => { const eng = engineRef.current; if (eng?.codexSeen) setCodexUnlocked((u) => { const next = new Set(u); for (const id of eng.codexSeen) next.add(id); return [...next]; }); setShowCodex(true); }}
        />
      )}

      {screen === "playing" && (
        <>
          <div className="vignette-overlay absolute inset-0" />
          {/* Batch 12 (Lane 3): in-run mutator chips + run-event banners /
              tracker. pointer-events-none so game input is untouched. */}
          <div className="pointer-events-none absolute left-1/2 top-2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
            <MutatorChips mutators={runMutators} testId="run-mutator-chips" />
            <EventBanners banner={eventBanner} tracker={eventTracker} />
          </div>
          <HUD
            health={hudStats.health}
            maxHealth={hudStats.maxHealth}
            stamina={hudStats.stamina}
            weapon={hudStats.weapon}
            molotovs={hudStats.molotovs}
            flares={hudStats.flares}
            posts={hudStats.posts}
            pipes={hudStats.pipes}
            score={hudStats.score}
            scrap={hudStats.scrap}
            combo={hudStats.combo}
            wave={hudStats.wave}
            waveTimer={hudStats.waveTimer}
            waveWindow={hudStats.waveWindow}
            waveSchedule={hudStats.waveSchedule}
            eliteIn={hudStats.eliteIn}
            zombiesRemaining={hudStats.zombiesRemaining}
            isReloading={hudStats.isReloading}
            reloadProgress={hudStats.reloadProgress}
            isMuted={isMuted}
            activePowerups={hudStats.activePowerups}
            scoreMul={hudStats.scoreMul}
            signature={hudStats.signature}
            onTriggerSignature={handleTriggerSignature}
            onToggleMute={handleToggleMute}
            onOpenWorkbench={handleToggleWorkbench}
            onSkipWaveTimer={() => engineRef.current?.skipWaveBreak()}
            locationName={loc?.name || "Pike County"}
            township={loc?.township || ""}
            radioCall={radio?.call}
            radioBody={radio?.body}
            extractActive={hudStats.extractActive}
            interactHint={hudStats.interactHint}
            lanternLit={hudStats.lanternLit}
            hasLantern={hudStats.hasLantern}
            sneaking={hudStats.sneaking}
            bellReady={hudStats.bellReady}
            bellHold={hudStats.bellHold}
            holesOpen={hudStats.holesOpen}
            holesTotal={hudStats.holesTotal}
            bloodRush={hudStats.bloodRush}
            lastStandReady={hudStats.lastStandReady}
            dodgeReady={hudStats.dodgeReady}
            fog={hudStats.fog}
            level={hudStats.level}
            xp={hudStats.xp}
            xpNeed={hudStats.xpNeed}
            evolved={hudStats.evolved}
            waveCall={hudStats.waveCall}
            bounty={hudStats.bounty}
            fresh={hudStats.fresh}
            weaponIndex={hudStats.weaponIndex}
            loadout={hudStats.loadout}
            switchBanner={hudStats.switchBanner}
            helpVisible={hudStats.helpVisible !== false}
            onSelectWeapon={(i) => engineRef.current?.selectWeapon(i)}
            bombCharges={hudStats.bombCharges}
            bombMax={hudStats.bombMax}
            dashCharges={hudStats.dashCharges}
            dashMax={hudStats.dashMax}
            gritBag={hudStats.gritBag}
            activeEvents={hudStats.activeEvents}
            modeLabel={mode === "outbreak" ? `Outbreak ${outbreakStep + 1}/${OUTBREAK_ORDER.length}` : "Survival"}
          />
          {/* Batch 11 (Lane 2): wave-break panel — SLOTS button stacked next to
              the wave shop. The button degrades to disabled when the engine
              lane's spinSlots() probe is absent. */}
          {hudStats.waveState === "break" && !slotsOpen && (
            <div className="pointer-events-none absolute right-2 top-20 z-30 flex w-64 flex-col gap-2 md:right-4 md:w-72">
              <SlotsBreakButton grit={hudStats.gritBag} onOpen={() => setSlotsOpen(true)} />
              {hudStats.shopOffers && hudStats.shopOffers.length > 0 && (
                <WaveShop
                  bare
                  offers={hudStats.shopOffers}
                  rerollCost={hudStats.shopRerollCost}
                  scrap={hudStats.scrap}
                  waveTimer={hudStats.waveTimer}
                  onBuy={(i) => engineRef.current?.buyShopOffer(i)}
                  onReroll={() => engineRef.current?.rerollShop()}
                  onLock={(i) => engineRef.current?.toggleShopLock(i)}
                />
              )}
            </div>
          )}
          {slotsOpen && (() => {
            const { cost, exact } = slotCostProbe();
            return (
              <SlotMachine
                grit={hudStats.gritBag}
                cost={cost}
                costExact={exact}
                onClose={() => setSlotsOpen(false)}
              />
            );
          })()}
          {draft && draft.length > 0 && (
            <TailgateDraft
              offers={draft}
              stacks={boonStacks}
              level={hudStats.level ?? 1}
              rerolls={rerolls}
              banishCharges={banishCharges}
              evolutionHints={hudStats.evolutionHints}
              onTake={(id) => engineRef.current?.takeBoon(id)}
              onReroll={() => engineRef.current?.rerollDraft()}
              onBanish={(id) => {
                engineRef.current?.banishBoon(id);
                setBanishCharges(engineRef.current?.banishCharges ?? 0);
              }}
            />
          )}
          {cacheSymbols && cacheSymbols.length > 0 && (
            <CacheSlots
              symbols={cacheSymbols}
              canGamble={gambleProbeAvailable()}
              onTake={() => engineRef.current?.resolveCache()}
              onGambled={() => engineRef.current?.closeCache()}
            />
          )}
          <MobileControls
            onMoveChange={(vec) => {
              if (engineRef.current) engineRef.current.virtualJoystickMove = vec;
            }}
            onAimChange={(vec) => {
              if (engineRef.current) engineRef.current.virtualJoystickAim = vec;
            }}
            onReload={() => engineRef.current?.reloadCurrentWeapon()}
            onThrowMolotov={() => engineRef.current?.throwMolotov()}
            onThrowFlare={() => engineRef.current?.throwFlare()}
            onPrevWeapon={() => engineRef.current?.prevWeapon()}
            onNextWeapon={() => engineRef.current?.nextWeapon()}
            onInteract={() => engineRef.current?.interactLoreNote()}
            onInteractHold={(held) => {
              if (engineRef.current) engineRef.current.holdInteract = held;
            }}
            onSneakToggle={(on) => {
              if (engineRef.current) engineRef.current.forceSneak = on;
            }}
            onDodge={() => engineRef.current?.tryDodge()}
            onDash={() => engineRef.current?.tryDash()}
            onBash={() => engineRef.current?.tryBash()}
            onPlantPost={() => engineRef.current?.plantPost()}
            onDropPipe={() => engineRef.current?.dropPipe()}
            molotovs={hudStats.molotovs}
            flares={hudStats.flares}
            posts={hudStats.posts}
            pipes={hudStats.pipes}
            bombCharges={hudStats.bombCharges}
            onDetonateBomb={() => engineRef.current?.detonateBomb()}
          />
        </>
      )}

      {paused && screen === "playing" && !isWorkbenchOpen && !activeLoreNote && (
        <PauseMenu
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          hitFeel={hitFeel}
          onToggleHitFeel={() => {
            const next = !hitFeel;
            setHitFeel(next);
            engineRef.current?.setHitFeel(next);
          }}
          onResume={() => {
            setPaused(false);
            engineRef.current?.setPaused(false);
          }}
          onWorkbench={() => {
            setPaused(false);
            setIsWorkbenchOpen(true);
            engineRef.current?.setPaused(true);
          }}
          onControls={() => {
            setPaused(false);
            handleToggleControls();
          }}
          onHome={() => {
            engineRef.current?.destroy();
            engineRef.current = null;
            setPaused(false);
            setDraft(null);
            setScreen("title");
          }}
          onSettings={() => setShowA11y(true)}
          onCodex={() => { const eng = engineRef.current; if (eng?.codexSeen) setCodexUnlocked((u) => { const next = new Set(u); for (const id of eng.codexSeen) next.add(id); return [...next]; }); setShowCodex(true); }}
        />
      )}

      {showControls && screen === "playing" && <ControlsModal onClose={handleToggleControls} />}

      {/* Batch 6 (Lane E): hidden tuning panel, settings, codex. Overlays only —
          none of these touch title / playing / game_over flow. */}
      {showTuning && <TuningPanel engineRef={engineRef} onClose={() => setShowTuning(false)} />}
      {showA11y && <AccessibilityPanel engineRef={engineRef} onClose={() => setShowA11y(false)} />}
      {showCodex && <CodexPanel unlockedIds={codexUnlocked} onClose={() => setShowCodex(false)} />}

      {isWorkbenchOpen && screen === "playing" && (
        <UpgradeShopModal
          weapons={weapons}
          perks={perks}
          scrap={hudStats.scrap}
          molotovs={hudStats.molotovs}
          flares={hudStats.flares}
          maxFlares={4}
          maxMolotovs={5}
          onClose={handleToggleWorkbench}
          onUnlockWeapon={handleUnlockWeapon}
          onUpgradeWeapon={handleUpgradeWeapon}
          onEquipWeapon={handleEquipWeapon}
          equippedId={hudStats.weapon?.id}
          onUpgradePerk={handleUpgradePerk}
          onBuyAmmoRefill={handleBuyAmmoRefill}
          onBuyMolotov={handleBuyMolotov}
          onBuyFlare={handleBuyFlare}
          postRank={postRank}
          onUpgradePost={handleUpgradePost}
        />
      )}

      {activeLoreNote && screen === "playing" && <LoreNoteModal note={activeLoreNote} onClose={handleCloseLoreNote} />}

      {screen === "game_over" && (
        <GameOverModal
          stats={gameOverData.stats}
          score={gameOverData.score}
          wave={gameOverData.wave}
          level={gameOverData.level}
          locationName={loc?.name || "Pike County"}
          killer={killer}
          mode={mode}
          won={won}
          unlocked={weapons.filter((w) => w.unlocked).map((w) => w.id)}
          notes={foundNotes}
          mapId={loc?.id || ""}
          onRestart={() => handleStartGame(selectedLocationIdx, engineRef.current?.difficultyMultiplier ?? 1, mode, undefined, seedRef.current)}
          onHome={() => {
            engineRef.current?.destroy();
            engineRef.current = null;
            setDraft(null);
            setScreen("title");
          }}
        />
      )}
    </main>
  );
}
