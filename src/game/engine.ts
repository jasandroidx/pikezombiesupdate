// @ts-nocheck
import { SimEventBus } from "./sim/context";
import { PlayerSim } from "./sim/player";
import { CombatSim } from "./sim/combat";
import { PowersSim } from "./sim/powers";
import { ZombieSim } from "./sim/zombies";
import { BossSim } from "./sim/bosses";
import { WaveSim } from "./sim/waves";
import { PickupSim } from "./sim/pickups";
import { MapSim } from "./sim/mapfeatures";
import { JuiceSim } from "./sim/juice";
import { installControlsProbe } from "./sim/probes";
import {
  Weapon,
  Zombie,
  Bullet,
  Particle,
  BloodDecal,
  Drop,
  FirePuddle,
  AcidSpit,
  GameLocation,
  PlayerStats,
  Perk,
  ExplosiveBarrel,
  ActivePowerup,
  PowerupType,
  LoreNote,
  Barricade,
  Floater,
  EngineSnapshot,
  CellarHole,
  NoisePulse,
} from "../types/game";
import { rollBoons, BoonOffer, LOCKOUTS, BOON_CATALOG, supportApplies, tracerPierceBonus, tracerSpeedMul, saltCircleDefenseMul, saltCircleApplies, cornLiquorFireRateMul, cornLiquorMoveMul, brineExplosionMul, brinePatch, copperheadMaxStacks, copperheadPoisonDps, copperheadDurationSec, copperheadApplies, whetstoneBashMul, whetstoneChainsawMul, whetstoneApplies, sifterRadiusMul, sifterValueMul, b12BoonSummary } from "./boons";
import { INITIAL_WEAPONS, AVAILABLE_PERKS, GAME_LOCATIONS, BOARD_COST, EVOLUTIONS, RUN_EVENTS, GRIT_GROUND_CAP, BOMB_RADIUS, BOMB_DMG, BOMB_MAX_CHARGES, BOMB_REGEN_MS, QUESTS, SHRINE_COUNT, SHRINE_BOSS_DMG_PER, SHOP_POOL, SHOP_OFFER_COUNT, SHOP_REROLL_BASE, WEAPON_FAMILIES, WAVES, windowAt, WEAPON_MAX_TABLE_LEVEL, statsForLevel, KONAMI_SEQUENCE, matchKonami, SECRET_WEAPON, mulberry32, bossFor, evolutionReady, scalingAt, SPECIAL_WEAPON_DEFS, ILLUSIONIST, MORTAR_TUNING, SIGNATURE_TUNING, SLOT_MACHINE_NAME, SLOT_SPIN_BASE, SLOT_SPIN_STEP, rollSlotSymbol, classifySlotWin, slotPairSymbol, SHOWER_COUNT_MIN, SHOWER_COUNT_MAX, SHOWER_DURATION_SEC, SHOWER_MID_WAVE_SEC, HUNT_PACK_MIN, HUNT_PACK_MAX, HUNT_BONUS_GRIT_ORBS, BURN_STACK_DPS, BURN_MAX_STACKS, BURN_REFRESH_MS, OLD_BEN_TUNING } from "./constants";
import { loadMeta, saveMeta, recordRun, topRuns, characterDef, stageDef, selectedCharacterId, selectedStageId } from "./meta";
import * as metaNS from "./meta";
import { soundEngine } from "../audio/soundEngine";
import { renderEnvironment, drawBlobShadow, registerZombieHit, zombieFlashIntensity, applyZombieTint, clearZombieTint, drawZombieHitFlash, render7, renderTelegraphs, drawGlowSprite, drawSparkSprite, drawSmokeSprite, pickupPopScale } from "./mapRenderer"; // Batch 10 (Lane 1): Lane 2 tweened pickup pop-in helper
import { DynamicLighting } from "./lighting";
import { radioFor } from "./radio";
import { drawSprite, drawWildLabel, loadArt, ZOMBIE_LABELS } from "./art";
import { FlowField } from "./flowfield";
import { buildMapFeatures, buildJarAnchors, sceneBaseCounts, MOUNTED_GUN_NAMES, NOTE_GIFTS } from "./scenes"; // Batch 11 (Lane 3): data-driven scene files

declare global {
  interface Window {
    __controlsTest?: any;
  }
}

export interface GameEngineCallbacks {
  onWaveComplete: (wave: number) => void;
  onDraft?: (offers: BoonOffer[] | null) => void;
  onGameOver: (stats: PlayerStats, score: number, killer: string) => void;
  onLoreNoteFound?: (note: LoreNote) => void;
  onRadio?: (call: string, body: string) => void;
  onExtractReady?: () => void;
  onExtract?: () => void;
  onWorkbenchPrompt?: (near: boolean) => void;
  onStatsUpdate: (stats: any) => void;
  onCache?: (symbols: string[] | null) => void;
}

export class GameEngine {
	// Batch 15: modularization — subsystem instances. All sim STATE stays on
	// the engine (probe compatibility); behavior lives in src/game/sim/*.
	events = new SimEventBus();
	playerSim;
	combat;
	powers;
	zombieSim;
	bossSim;
	waveSim;
	pickupSim;
	mapSim;
	juice;
	initSubsystems() {
		this.playerSim = new PlayerSim(this);
		this.combat = new CombatSim(this);
		this.powers = new PowersSim(this);
		this.zombieSim = new ZombieSim(this);
		this.bossSim = new BossSim(this);
		this.waveSim = new WaveSim(this);
		this.pickupSim = new PickupSim(this);
		this.mapSim = new MapSim(this);
		this.juice = new JuiceSim(this);
	}
	emitEvent(type, data) {
		this.events.emit({ type, at: this.simTime, data });
	}

	canvas;
	ctx;
	callbacks;
	isRunning = false;
	isPaused = false;
	currentLocation;
	difficultyMultiplier = 1;
	player = {
		x: 1e3,
		y: 900,
		radius: 18,
		speed: 6.2,
		health: 100,
		maxHealth: 100,
		stamina: 100,
		maxStamina: 100,
		isSprinting: false,
		isSneaking: false,
		angle: 0,
		flashlightRange: 420,
		lightRadius: 420, // Batch 7: darkness gameplay — base sight-light radius.
		flashlightAngle: 0,
		molotovs: 3,
		maxMolotovs: 5,
		flares: 2,
		maxFlares: 4,
		atkT: 0, // Batch 8 (Lane B): bash squash-and-stretch pulse timer (50ms), decayed in render.
		bobPhase: Math.random() * Math.PI * 2 // Batch 8 (Lane B): idle-bob phase, randomized per run.
	};
	weapons = JSON.parse(JSON.stringify(INITIAL_WEAPONS));
	currentWeaponIndex = 0;
	perks = JSON.parse(JSON.stringify(AVAILABLE_PERKS));
	boonStacks: Record<string, number> = {};
	codexSeen: Set<string> = new Set(); // Batch 6: County Codex discovery tracking.
	tuning: Record<string, number> = {}; // Batch 6: field-tuning panel multipliers.
	a11y: { reduceMotion?: boolean; reducedFlashing?: boolean } = {}; // Batch 6: accessibility.
	draft: BoonOffer[] | null = null;
	level = 1;
	xp = 0;
	queuedLevels = 0;
	draftGraceUntil = 0;
	rerolls = 1;
	levelHold = false;
	evolved: string | null = null;
	evolutionDone: Record<string, boolean> = {};
	grit: { x: number; y: number; vx: number; vy: number; value: number }[] = [];
	gritBonus = 0;
	gritBag = 0;
	bombCharges = 1;
	bombLastRegen = 0;
	firedEvents: string[] = [];
	activeEvents: { id: string; endsAt: number }[] = [];
	// Batch 12 (Lane 1): powerup shower + elite hunt run events.
	powerupShower: { left: number; total: number; t: number; interval: number } | null = null;
	huntState: { wave: number; total: number; killed: number; done: boolean } | null = null;
	huntTargets: Zombie[] = [];
	huntBonusReroll = false;
	waveStartSim = 0;
	// Batch 12 (Lane 1): railgun charge state.
	railCharging = false;
	railChargeT = 0;
	railChargeDmg = 0;
	railChargeW: Weapon | null = null;
	lastFlame: { hits: number; stacks: number } | null = null;
	lastRail: { hits: number; len: number } | null = null;
	// Batch 12 (Lane 1): Copperhead Rounds — per-zombie poison stacks.
	poison: Map<Zombie, { stacks: number; t: number }> = new Map();
	posts = 1;
	pipes = 1;
	postRank = 1;
	traps: { kind: string; x: number; y: number; angle: number; shot: number; left: number; arm: number; live: boolean; blown: boolean }[] = [];
	toldPost = false;
	toldPipe = false;
	lastHeat = 0;
	chests: { x: number; y: number }[] = [];
	stormCd = 0;
	lightning: { x1: number; y1: number; x2: number; y2: number; life: number }[] = [];
	mutators: string[] = [];
	chestsThisMap = 0;
	scrap = 150;
	score = 0;
	isMouseDown = false;
	lastShotTime = 0;
	isReloading = false;
	reloadStartTime = 0;
	muzzleFlashTimer = 0;
	screenShake = 0;
	wave = 1;
	waveState = `break`;
	waveBreakCountdown = 3;
	lastBreakTick = 0;
	zombiesToSpawn = 0;
	lastZombieSpawnTime = 0;
	zombies = [];
	bullets = [];
	acidSpits = [];
	firePuddles = [];
	flares = [];
	particles = [];
	bloodDecals = [];
	drops = [];
	explosiveBarrels = [];
	activePowerups = [];
	loreNotes = [];
	barricades = [];
	holes = [];
	// Batch 6 (Lane A): enemy-AI spec constants — spitter kiting + bomber fuse.
	b6spitKeep = 260; b6spitFire = 420; b6fuseRange = 130; b6fuseTime = .9;
	b6blastR = 110; b6blastDmg = 140; b6blastPlayer = 26;
	extractActive = false;
	outbreakWaves = 0;
	lastKiller = `shambler`;
	nearWorkbench = false;
	interactHint = ``;
	lanternLit = false;
	lanternWentOut = false;
	bellReady = false;
	bellRung = false;
	bellHold = 0;
	holdInteract = false;
	forceSneak = false;
	bellLureUntil = 0;
	lastSprintNoise = 0;
	noisePulses = [];
	// Group 1: spatial hash (cell 64) for zombie queries
	zhash = new Map();
	zhashMaxR = 20;
	zhashCell = 64;
	// Group 1: object pools for high-churn short-lived objects
	particlePool = [];
	floaterPool = [];
	gritPool = [];
	bulletPool = [];
	// Group 1: dynamic point lights (world coords, ttl in seconds)
	dynLights = [];
	camX = 0;
	camY = 0;
	trauma = 0;
	// Dash: charge-based long lunge, distinct from the stamina dodge roll.
	dashCharges = 2;
	dashMax = 2;
	dashRegenT = 0;
	dashTimer = 0;
	dashCd = 0;
	dashDirX = 1;
	dashDirY = 0;
	// Brotato-style between-wave shop.
	shopOffers: { offerId: string; locked: boolean }[] = [];
	shopRerollCost = SHOP_REROLL_BASE;
	shopBought = new Set<string>();
	shopDmgMul = 1;
	shopFireRateMul = 1;
	shopMagnetBonus = 0;
	// Quest meta (County Record) + shrines.
	meta = loadMeta();
	questDmgMul = 1;
	questMoveMul = 1;
	shrines: { x: number; y: number; attuned: boolean }[] = [];
	hitstop = 0;
	deathCineT = 0; // Batch 8 (Lane B): post-death cinematic window (seconds), ticked by the loop after death.
	deathFlash = 0; // Batch 8 (Lane B): full-screen white flash alpha, decayed in the cinematic.
	_lastGameOver: { stats: any; score: number; killer: string } | null = null; // Batch 8 (Lane B): last death payload for tests.
	_renderDt = 1 / 60; // Batch 8 (Lane B): last render frame delta, used to decay render-side timers.
	_lastRenderNow = 0; // Batch 8 (Lane B): timestamp of the last render, for _renderDt.
	_lastPlayerPulse = { sx: 1, sy: 1 }; // Batch 8 (Lane B): test probe — peak bash pulse scale latched.
	_lastZombiePulse = { sx: 1, sy: 1 }; // Batch 8 (Lane B): test probe — peak lunge pulse scale latched.
	_lastPlayerBob = 0; // Batch 8 (Lane B): test probe — last applied player idle bob.
	_lastZombieBob = 0; // Batch 8 (Lane B): test probe — last applied zombie idle bob.
	floaters = [];
	simTime = 0;
	// Batch 9 (Lane 1): affinity/stage/roster run state.
	pristineLocation: any = null; // pre-stage-clone location (shared GAME_LOCATIONS row untouched).
	nightLengthMult = 1;
	gritValueMul = 1;
	stageZombieSpeedMul = 1;
	stageSpawnPackMul = 1;
	eliteIntervalMul = 1;
	runHeadshotMul = 1;
	pickupRadiusMul = 1;
	nextScoreMulAt = 25; // Batch 9: dedicated score-multiplier drop schedule.
	_charMaxHpAdd = 0; // Batch 9: current character's flat max-HP slice (divided out on re-run).
	_charSpeedMul = 1; // Batch 9: current character's speed slice (divided out on re-run).
	lastMoveSpeed = 0;
	_lastFireInterval = 0; // Batch 10 (Lane 4): last computed fire interval (ms) — probe surface for corn liquor.
	walkPhase = 0;
	moveVX = 0;
	moveVY = 0;
	bodyFacing = 1;
	bodyFacingSmooth = 1;
	sprintBlend = 1;
	recoilKick = 0;
	lastDt = 1 / 60;
	lastPx: number | null = null; lastPy: number | null = null; r7camInit = false; // Batch 7: camera rig state
	footstepArmed = true;
	dodgeTimer = 0;
	dodgeCd = 0;
	dodgeDirX = 1;
	dodgeDirY = 0;
	bashCd = 0;
	bashSwing = 0;
	invuln = 0;
	bloodRush = 0;
	rushKills = 0;
	rushWindow = 0;
	lastStandUsed = false;
	worldSlow = 0;
	fogUntil = 0;
	eventCd = 14;
	afterimages = [];
	pumpAnim = 0;
	switchBanner = 0;
	flow = new FlowField();
	flowRebuild = 0;
	lighting;
	comboMultiplier = 1;
	lastKillTime = 0;
	// VS-1: Harvest Streak — kill-chain counter with a 3s window.
	streak = 0;
	streakTimer = 0;
	// Batch 9: kill surge 0..1 — +0.18 per kill (in killZombie), decays ~0.25/s.
	// Drives soundEngine.setKillSurge (Lane 3) via driveKillSurge.
	killSurge = 0;
	maxStreak = 0;
	lastStreakKill = -99;
	// VS-1: "Run Out of the County" banish — 2 charges per run.
	banishedBoons = new Set();
	banishCharges = 2;
	// VS-1: capped fading scorch decals from explosions.
	scorchDecals = [];
	// Batch 10 (Lane 1): capped fading corpse decals — last-kill permanence.
	corpseDecals = [];
	lastKillSlowT = 0;
	// Batch 10 (Lane 1): lobbed mortar / Mash Bomb charges awaiting detonation.
	lobbedCharges = [];
	// VS-1: pooled damage-number throttle.
	dmgFloaters = 0;
	// VS-3: directional hurt feedback.
	hurtDir = 0;
	hurtFlash = 0;
	lastHurtFromX = 0;
	lastHurtFromY = 0;
	// VS-2: guaranteed elite cadence (~45s) and named wave windows.
	lastEliteAt = 0;
	currentWindowId = ``;
	// VS-3: hit-feel module — one master kill switch for all of it.
	hitFeel = true;
	hitstopBudget = .3;
	slowAfter = 0;
	zoomPunch = 0;
	camKickX = 0;
	camKickY = 0;
	shockwaves = [];
	// Batch 5 (Lane A): combat juice — kill words, blood splats, slash bursts,
	// screen-space hit flashes, on-shoot micro-layer, whiff slow, body reactions,
	// score surge, riot-shield zombies.
	killWords = [`SLAIN!`, `DOWN!`, `SPLAT!`, `CRUNCH!`];
	lastKillWord = null;
	killWordCount = 0;
	bloodSplats = [];
	slashBursts = [];
	hitFlashes = [];
	muzzlePunch = 0;
	gunKick = 0;
	gunKickT = 0;
	camPunchX = 0;
	camPunchY = 0;
	camPunchT = 0;
	whiffSlowT = 0;
	lastWhiff = null;
	powerupPool = [`nuke`, `double_points`, `insta_kill`, `infinite_ammo`, `speed_boost`, `moonshine_med`, `score_surge`];
	fuseTimer = 0;
	// VS-3: periodic powerups + rubber-banded health orbs.
	nextPowerupAt = 80;
	// VS-3: Storm Cellar Caches.
	caches = [];
	cacheOpen = null;
	nextCacheAt = 150;
	// Batch 11 (Lane 1): Patoka Jackpot slot machine — spins this break, and
	// live arc-lance beams sweeping their targets.
	slotSpinsThisBreak = 0;
	arcBeams = [];
	// Batch 2: breakpoint bonuses (6th rank), boss banner, chill, heartbeat.
	bpDamageMul = 1;
	bpFireMul = 1;
	bpOrbiters = 0;
	bpChains = 0;
	bpBlastMul = 1;
	breakpointsHit = new Set();
	lockedBoons = new Set();
	// Batch 7 (Lane 1): telegraphs, darkness, chain/orbiter weapons, behemoth phases, run mods.
	telegraphs: { kind: string; x: number; y: number; r: number; t0: number; dur: number }[] = [];
	dark = false;
	lastChain = { jumps: 0, hits: 0 };
	orbiterBlades: { x: number; y: number; a: number }[] = [];
	orbiterAngle = 0;
	runDamageMul = 1;
	runHpMul = 1;
	runSpeedMul = 1;
	runXpMul = 1;
	// Batch 7 (Lane 1): Behemoth phase config — local; the BOSSES table in constants.ts is untouched.
	behemothPhases = { chargeEvery: 7, chargeWindup: 0.8, chargeLaneR: 90, chargeDashSpeed: 520, summonAt: 0.6, enrageAt: 0.3, enrageSpeedMul: 1.35, enrageDmgMul: 1.25 };
	// Batch 13 (Lane 1): Old Ben (boss #2) attack tuning — data lives in
	// OLD_BEN_TUNING (constants.ts); the field lets probes read/tweak it.
	oldBenCfg = OLD_BEN_TUNING;
	// Batch 4: nova burst, homing missiles, vacuum drops, time-curve director.
	novaCd = 0;
	novaFlash = 0;
	missileCd = 0;
	vacuumSurge = 0;
	nextVacuumAt = 55;
	miniBossMarks = [240, 480, 720];
	miniBossFired = new Set();
	bannerText = ``;
	bannerSub = ``;
	bannerUntil = 0;
	chillUntil = 0;
	lastHeartbeat = 0;
	flankTimer = 0;
	cullTimer = 0;
	stats = {
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
		maxStreak: 0
	};
	gameStartTime = 0;
	keys = {};
	mousePos = {
		x: 0,
		y: 0
	};
	virtualJoystickMove = {
		x: 0,
		y: 0
	};
	virtualJoystickAim = {
		x: 0,
		y: 0
	};
	animationFrameId = null;
	lastTimestamp = 0;
	constructor(e, t, n = 0, opts) { this.initSubsystems(),
		this.canvas = e, this.ctx = e.getContext(`2d`), this.callbacks = t, this.currentLocation = GAME_LOCATIONS[n] || GAME_LOCATIONS[0], this.pristineLocation = this.currentLocation, this.lighting = new DynamicLighting(), this.placePlayerSafely(), this.camX = this.player.x, this.camY = this.player.y, this.loadMapFeatures(), this.rebuildFlow(true), this.setupListeners(), installControlsProbe(this);
		// Batch 5: daily-challenge seed — seeded RNG for gameplay rolls (cosmetic
		// jitter stays on Math.random). Lane D passes { seed } as the 4th arg.
		this.runSeed = opts?.seed ?? ((Math.random() * 2 ** 32) | 0);
		this.rng = mulberry32(this.runSeed);
		loadArt();
	}
	// Batch 11 (Lane 3): data-driven scene files — builds barricades, holes,
	// barrels and lore notes from src/game/scenes.ts instead of the old
	// init* methods (deleted). Safe in the constructor: with no stage rules,
	// the builders draw no RNG, so this.rng not being assigned yet is fine.
		loadMapFeatures(...args) {
		return this.mapSim.loadMapFeatures(...args);
	}
		placePlayerSafely(...args) {
		return this.mapSim.placePlayerSafely(...args);
	}
		rebuildFlow(...args) {
		return this.mapSim.rebuildFlow(...args);
	}
	exportSnapshot() {
		return {
			weapons: JSON.parse(JSON.stringify(this.weapons)),
			perks: JSON.parse(JSON.stringify(this.perks)),
			scrap: this.scrap,
			score: this.score,
			health: this.player.health,
			maxHealth: this.player.maxHealth,
			molotovs: this.player.molotovs,
			flares: this.player.flares,
			stats: { ...this.stats },
			combo: this.comboMultiplier,
			streak: this.streak,
			streakFrac: this.streak >= 2 ? this.streakTimer / 3 : 0,
			streakColor: this.streakColor(),
			maxStreak: this.maxStreak,
			banishCharges: this.banishCharges,
			lanternWentOut: this.lanternWentOut,
			boons: { ...this.boonStacks },
			level: this.level,
			xp: this.xp,
			evolved: this.evolved,
			rerolls: this.rerolls
		};
	}
	importSnapshot(e) {
		this.weapons = JSON.parse(JSON.stringify(e.weapons)), this.perks = JSON.parse(JSON.stringify(e.perks)), this.scrap = e.scrap, this.score = e.score, this.player.health = e.health, this.player.maxHealth = e.maxHealth, this.player.molotovs = e.molotovs, this.player.flares = e.flares ?? this.player.flares, this.stats = { ...e.stats }, this.comboMultiplier = e.combo, this.lanternWentOut = !!e.lanternWentOut, this.boonStacks = { ...(e.boons ?? {}) }, this.level = e.level ?? 1, this.xp = e.xp ?? 0, this.evolved = e.evolved ?? null, this.rerolls = e.rerolls ?? 1;
	}
		freeSpot(...args) {
		return this.mapSim.freeSpot(...args);
	}
		placeClues(...args) {
		return this.mapSim.placeClues(...args);
	}
		initJars(...args) {
		return this.mapSim.initJars(...args);
	}
		hasPowerup(...args) {
		return this.pickupSim.hasPowerup(...args);
	}
		activatePowerup(...args) {
		return this.pickupSim.activatePowerup(...args);
	}
		detonateNuke(...args) {
		return this.pickupSim.detonateNuke(...args);
	}
		updatePowerups(...args) {
		return this.pickupSim.updatePowerups(...args);
	}
	interactLoreNote() {
		if (this.extractActive) {
			let e = this.currentLocation.extract;
			if (Math.hypot(this.player.x - e.x, this.player.y - e.y) <= e.radius + 12) {
				this.callbacks.onExtract?.();
				return;
			}
		}
		let e = this.currentLocation.lantern;
		if (e && Math.hypot(this.player.x - e.x, this.player.y - e.y) < 78) {
			this.lanternLit || this.relightLantern();
			return;
		}
		let t = this.nearestHole(92);
		if (t && !t.boarded) {
			this.boardHole(t);
			return;
		}
		let n = this.currentLocation.workbench;
		if (this.rig && Math.hypot(this.player.x - this.rig.x, this.player.y - this.rig.y) < 72) {
			if (!this.rigArmed) {
				this.callbacks.onRadio?.(`Unknown`, `You can see the ${this.rig.name}. The note says how to crank it.`);
				return;
			}
			if (this.simTime < this.rig.cool) return;
			this.rig.until = this.simTime + 8;
			this.rig.cool = this.simTime + 26;
			this.rig.shot = 0;
			this.spawnFloater(this.rig.x, this.rig.y - 28, this.rig.name.toUpperCase(), `#d4a017`);
			soundEngine.playPowerup();
			return;
		}
		if (Math.hypot(this.player.x - n.x, this.player.y - n.y) < 70) {
			this.callbacks.onWorkbenchPrompt?.(true);
			return;
		}
		let r = null, i = 65;
		for (let e of this.loreNotes) {
			if (e.collected) continue;
			let t = Math.hypot(this.player.x - e.x, this.player.y - e.y);
			t < i && (i = t, r = e);
		}
		r && (r.collected = true, soundEngine.playLoreNote(), this.addScore(250), this.scrap += 50, this.stats.notesFound += 1, this.callbacks.onLoreNoteFound && this.callbacks.onLoreNoteFound(r));
		if (!r) return;
		const idx = this.loreNotes.indexOf(r);
		if (idx === 0) {
			this.rigArmed = true;
			this.callbacks.onRadio?.(`Unknown`, `${this.rig.name} is cranked in your head. Walk to it and press E.`);
		}
		if (idx === 1) {
			const type = NOTE_GIFTS[this.currentLocation.id] || `speed_boost`;
			this.drops.push({
				id: Math.random().toString(),
				type,
				x: r.x + 18,
				y: r.y + 16,
				amount: type === `moonshine_med` ? 40 : 1,
				duration: 4e4
			});
		}
	}
	setupListeners() {
		window.addEventListener(`keydown`, this.handleKeyDown), window.addEventListener(`keyup`, this.handleKeyUp), this.canvas.addEventListener(`mousemove`, this.handleMouseMove), this.canvas.addEventListener(`mousedown`, this.handleMouseDown), window.addEventListener(`mouseup`, this.handleMouseUp), this.canvas.addEventListener(`contextmenu`, (e) => e.preventDefault()), this.canvas.addEventListener(`wheel`, this.handleWheel, { passive: true });
	}
	destroy() {
		this.stop(), window.removeEventListener(`keydown`, this.handleKeyDown), window.removeEventListener(`keyup`, this.handleKeyUp), this.canvas.removeEventListener(`mousemove`, this.handleMouseMove), this.canvas.removeEventListener(`mousedown`, this.handleMouseDown), window.removeEventListener(`mouseup`, this.handleMouseUp), this.canvas.removeEventListener(`wheel`, this.handleWheel);
	}
	start(e = 1) {
		this.difficultyMultiplier = e, this.isRunning = true, this.isPaused = false, this.gameStartTime = Date.now(), this.lastTimestamp = performance.now(), this.wave = 0, this.waveState = `break`, this.waveBreakCountdown = 3, this.draftGraceUntil = 0, this.evolutionDone = {}, this.codexSeen = new Set(), this.gritBag = 0, this.bombCharges = 1, this.bombLastRegen = Date.now(), this.postRank = 1, this.firedEvents = [], this.activeEvents = [], this.extractActive = false, this.bellReady = false, this.bellRung = false, this.bellHold = 0, this.bellLureUntil = 0, this.lastBreakTick = Date.now(), this.streak = 0, this.streakTimer = 0, this.killSurge = 0, this.maxStreak = 0, this.lastStreakKill = -99, this.banishedBoons = new Set(), this.banishCharges = 2, this.scorchDecals = [], this.dmgFloaters = 0, this.lastEliteAt = 0, this.slotSpinsThisBreak = 0, this.arcBeams = [], this.currentWindowId = ``, this.hitstopBudget = .3, this.slowAfter = 0, this.zoomPunch = 0, this.camKickX = 0, this.camKickY = 0, this.shockwaves = [], this.bloodSplats = [], this.slashBursts = [], this.hitFlashes = [], this.muzzlePunch = 0, this.gunKick = 0, this.gunKickT = 0, this.camPunchX = 0, this.camPunchY = 0, this.camPunchT = 0, this.whiffSlowT = 0, this.lastWhiff = null, this.lastKillWord = null, this.killWordCount = 0, this.fuseTimer = 0, this.nextPowerupAt = 80, this.nextScoreMulAt = 25, this.caches = [], this.cacheOpen = null, this.nextCacheAt = 150, this.bpDamageMul = 1, this.bpFireMul = 1, this.bpOrbiters = 0, this.bpChains = 0, this.bpBlastMul = 1, this.breakpointsHit = new Set(), this.bannerUntil = 0, this.chillUntil = 0, this.lockedBoons = new Set(), this.novaCd = 0, this.novaFlash = 0, this.missileCd = 0, this.vacuumSurge = 0, this.nextVacuumAt = 55, this.miniBossFired = new Set(), this.flankTimer = 0, this.cullTimer = 0, this.r7camInit = false, this.lastPx = null, this.lastPy = null, this.lanternLit = this.currentLocation.lantern ? !this.lanternWentOut : false, this.applyStageTerrain(), this.resetB7State(), this.applyMutators(), this.rebuildFlow(true), soundEngine.init(), soundEngine.startAtmosphericMusic(), this.initRunMeta(), this.applyRosterMods(), this.ensureB7Weapons(), this.lanternWentOut && !this.currentLocation.lantern && this.callbacks.onRadio?.(`Unknown`, `The lantern went out at the springs. They're thicker on the Trace.`), this.holes.length && this.callbacks.onRadio?.(`WJPS`, `Board those cellars or run the Trace. They come up through the floor if you linger.`), this.deathCineT = 0, this.deathFlash = 0, this.player.atkT = 0, this.player.bobPhase = Math.random() * Math.PI * 2, this._lastGameOver = null, this._lastPlayerPulse = { sx: 1, sy: 1 }, this._lastZombiePulse = { sx: 1, sy: 1 }, this.powerupShower = null, this.huntState = null, this.huntTargets = [], this.huntBonusReroll = false, this.waveStartSim = 0, this.railCharging = false, this.railChargeT = 0, this.railChargeW = null, this.lastFlame = null, this.lastRail = null, this.poison.clear(), this.loop(performance.now());
	}
	applyMutators() {
		if (this.mutators.includes(`dry`)) for (const w of this.weapons) w.reserveAmmo = Math.floor(w.reserveAmmo / 2);
		if (this.mutators.includes(`fog`)) this.fogUntil = 99999;
	}
	stop() {
		this.isRunning = false, this.animationFrameId !== null && (cancelAnimationFrame(this.animationFrameId), this.animationFrameId = null), soundEngine.stopAtmosphericMusic();
	}
	setPaused(e) {
		if (!e && this.levelHold) return;
		this.isPaused = e, !e && this.isRunning && (this.lastTimestamp = performance.now(), this.loop(performance.now()));
	}
	handleKeyDown = (e) => {
		// Batch 4: Konami-code secret weapon — works on title / game-over screens too.
		this.konamiBuf = [...(this.konamiBuf ?? []), e.code].slice(-10);
		if (matchKonami(this.konamiBuf) && !this.weapons.some((w) => w.id === `wompus_howler`)) {
			this.weapons.push(JSON.parse(JSON.stringify(SECRET_WEAPON)));
			this.codexSeen?.add(`konami`);
			this.codexSeen?.add(SECRET_WEAPON.id);
			this.konamiBuf = [];
			this.spawnFloater(this.player.x, this.player.y - 56, `WOMPUS HOWLER UNLOCKED`, `#c77dff`);
			this.callbacks.onRadio?.(`Unknown`, `Thirty years the Wompus cat yowled on the ridge. Now it yowls through your barrel.`);
			soundEngine.playAchievement();
		}
		if (e.code === `Space`) e.preventDefault();
		if (this.draft && (e.code === `Digit1` || e.code === `Digit2` || e.code === `Digit3`)) {
			const pick = this.draft[Number(e.code.slice(5)) - 1];
			if (pick) this.takeBoon(pick.id);
			return;
		}
		if (this.keys[e.code] = true, !this.isPaused) {
			if (e.code === `KeyR` && this.reloadCurrentWeapon(), e.code === `KeyE`) {
				let e = this.currentLocation.bell;
				e && this.bellReady && !this.bellRung && Math.hypot(this.player.x - e.x, this.player.y - e.y) < 80 || this.tryAttuneShrine() || this.interactLoreNote();
			}
			e.code === `Digit1` && this.selectWeapon(0), e.code === `Digit2` && this.selectWeapon(1), e.code === `Digit3` && this.selectWeapon(2), e.code === `Digit4` && this.selectWeapon(3), e.code === `Digit5` && this.selectWeapon(4), e.code === `Digit6` && this.selectWeapon(5);
			if (e.code === `KeyQ`) this.throwMolotov();
			if (e.code === `KeyG`) this.throwFlare();
			if (e.code === `KeyC`) this.plantPost();
			if (e.code === `KeyX`) this.dropPipe();
			if (e.code === `KeyB`) this.detonateBomb();
			if (e.code === `Space`) this.tryDodge();
			if (e.code === `ShiftLeft` || e.code === `ShiftRight`) this.tryDash();
			if (e.code === `KeyF` || e.code === `KeyV`) this.tryBash();
		}
	};
	handleKeyUp = (e) => {
		this.keys[e.code] = false;
	};
	handleMouseMove = (e) => {
		let t = this.canvas.getBoundingClientRect();
		this.mousePos.x = e.clientX - t.left, this.mousePos.y = e.clientY - t.top;
	};
	handleMouseDown = (e) => {
		e.button === 0 ? this.isMouseDown = true : e.button === 2 && (e.preventDefault(), this.tryBash());
	};
	handleMouseUp = () => {
		this.isMouseDown = false;
	};
	handleWheel = (e) => {
		e.deltaY > 0 ? this.nextWeapon() : e.deltaY < 0 && this.prevWeapon();
	};
		selectWeapon(...args) {
		return this.combat.selectWeapon(...args);
	}
		nextWeapon(...args) {
		return this.combat.nextWeapon(...args);
	}
		prevWeapon(...args) {
		return this.combat.prevWeapon(...args);
	}
		reloadCurrentWeapon(...args) {
		return this.combat.reloadCurrentWeapon(...args);
	}
		autoSwapFromDry(...args) {
		return this.combat.autoSwapFromDry(...args);
	}
		throwMolotov(...args) {
		return this.combat.throwMolotov(...args);
	}
		throwFlare(...args) {
		return this.combat.throwFlare(...args);
	}
		plantFlare(...args) {
		return this.combat.plantFlare(...args);
	}
		updateOrbit(...args) {
		return this.powers.updateOrbit(...args);
	}
		updateStorm(...args) {
		return this.powers.updateStorm(...args);
	}
	// Batch 3: volatile aura — a burning plasma field around the player.
		updateAura(...args) {
		return this.powers.updateAura(...args);
	}
	// Batch 4: time-curve difficulty — a smooth D(t) multiplier layered OVER the
	// wave system (VS-2's named windows are untouched; this multiplies with them).
		timeCurve(...args) {
		return this.waveSim.timeCurve(...args);
	}
	// Batch 4: fixed mini-boss marks — guaranteed elites at 4:00 / 8:00 / 12:00,
	// drawn from the wave-unlocked pool via spawnGuaranteedElite.
		updateDirector(...args) {
		return this.waveSim.updateDirector(...args);
	}
	// Batch 4: Still-Yard Burst — periodic radial nova of amber rounds.
	// Cooldown pattern (scarce-ammo rule doesn't apply); ranks add count.
		updateNova(...args) {
		return this.powers.updateNova(...args);
	}
	// Batch 4: nova discharge flash.
	renderNova(e) {
		if (this.novaFlash <= 0) return;
		const a = this.novaFlash / .25;
		e.save();
		e.strokeStyle = `rgba(251, 191, 36, ${.75 * a})`;
		e.lineWidth = 5;
		e.beginPath();
		e.arc(this.player.x, this.player.y, 30 + (1 - a) * 60, 0, Math.PI * 2);
		e.stroke();
		e.restore();
	}
	// Batch 4: Canary rockets — slow, heavy homing missiles with limited turn
	// rate and a small AoE pop. Scarce by design: long cooldown, small salvos.
		updateMissiles(...args) {
		return this.powers.updateMissiles(...args);
	}
	// Batch 4: missile impact — small AoE with edge falloff.
		detonateMissile(...args) {
		return this.powers.detonateMissile(...args);
	}
	// Batch 4: Dust Devil — a pickup that vacuums every ground grit orb to the
	// player. Distinct from the level-up auto-vacuum: gems physically fly in.
		dropVacuumAt(...args) {
		return this.powers.dropVacuumAt(...args);
	}
		updateVacuumDrops(...args) {
		return this.powers.updateVacuumDrops(...args);
	}
	// Batch 4: dust-devil icon — drawn here (engine pass) since mapRenderer's
	// drop switch has no case for it and mapRenderer isn't this lane's file.
	renderVacuumDrops(e) {
		for (const d of this.drops) {
			if (d.type !== `dust_devil`) continue;
			e.save();
			e.translate(d.x, d.y);
			const t = this.simTime * 6;
			e.strokeStyle = `rgba(125, 211, 252, .9)`;
			e.lineWidth = 3;
			for (let k = 0; k < 3; k++) {
				e.beginPath();
				e.arc(0, 0, 8 + k * 5, t + k * 2, t + k * 2 + 4.2);
				e.stroke();
			}
			e.restore();
		}
	}
		updateSalt(...args) {
		return this.powers.updateSalt(...args);
	}
		updateLightning(...args) {
		return this.powers.updateLightning(...args);
	}
	renderLightning(e) {
		if (!this.lightning.length) return;
		e.save();
		e.lineWidth = 2.5;
		for (const l of this.lightning) {
			e.globalAlpha = Math.max(0, l.life / 0.18);
			// Batch 11: heat beams (arc lance) render orange-hot; chain blue otherwise.
			e.strokeStyle = l.heat ? `rgba(255, 150, 60, 0.95)` : `rgba(147, 197, 253, 0.9)`;
			e.beginPath();
			e.moveTo(l.x1, l.y1);
			e.lineTo((l.x1 + l.x2) / 2 + (Math.random() - .5) * 30, (l.y1 + l.y2) / 2 + (Math.random() - .5) * 30);
			e.lineTo(l.x2, l.y2);
			e.stroke();
		}
		e.restore();
	}
	renderSalt(e) {
		const stacks = this.boon(`salt`);
		if (!stacks) return;
		e.save();
		e.strokeStyle = `rgba(163, 230, 53, ${0.22 + Math.sin(this.simTime * 4) * 0.08})`;
		e.lineWidth = 3;
		e.beginPath();
		e.arc(this.player.x, this.player.y, 95 + stacks * 18, 0, Math.PI * 2);
		e.stroke();
		e.restore();
	}
	// Batch 3: volatile aura ring render.
	renderAura(e) {
		const stacks = this.boon(`aura`);
		if (stacks <= 0) return;
		const R = 80 + stacks * 16;
		const pulse = 0.5 + 0.5 * Math.sin(this.simTime * 6);
		e.save();
		e.strokeStyle = `rgba(192, 132, 252, ${0.3 + pulse * 0.25})`;
		e.lineWidth = 4 + pulse * 3;
		e.beginPath();
		e.arc(this.player.x, this.player.y, R, 0, Math.PI * 2);
		e.stroke();
		e.strokeStyle = `rgba(240, 171, 252, ${0.15 + pulse * 0.1})`;
		e.lineWidth = 10;
		e.beginPath();
		e.arc(this.player.x, this.player.y, R * 0.92, 0, Math.PI * 2);
		e.stroke();
		e.restore();
	}
		updateBeacon(...args) {
		return this.powers.updateBeacon(...args);
	}
		tickBounty(...args) {
		return this.powers.tickBounty(...args);
	}
		updateRig(...args) {
		return this.mapSim.updateRig(...args);
	}
		postStats(...args) {
		return this.mapSim.postStats(...args);
	}
		upgradePost(...args) {
		return this.mapSim.upgradePost(...args);
	}
		plantPost(...args) {
		return this.mapSim.plantPost(...args);
	}
		dropPipe(...args) {
		return this.mapSim.dropPipe(...args);
	}
		packBetweenWaves(...args) {
		return this.mapSim.packBetweenWaves(...args);
	}
		updateTraps(...args) {
		return this.mapSim.updateTraps(...args);
	}
		blowPipe(...args) {
		return this.mapSim.blowPipe(...args);
	}
	renderTraps(e) {
		const fs = Math.max(1, 1.05 / this.viewZoom());
		for (const t of this.traps) {
			e.save();
			e.translate(t.x, t.y);
			if (t.kind === "pipe") {
				e.rotate(t.angle || 0.4);
				e.fillStyle = "rgba(0,0,0,0.35)";
				e.beginPath();
				e.ellipse(0, 6 * fs, 12 * fs, 4 * fs, 0, 0, Math.PI * 2);
				e.fill();
				e.fillStyle = "#3f3f46";
				e.fillRect(-13 * fs, -3.5 * fs, 26 * fs, 7 * fs);
				e.fillStyle = "#78716c";
				e.fillRect(-13 * fs, -3.5 * fs, 4 * fs, 7 * fs);
				e.fillStyle = "#b45309";
				e.fillRect(9 * fs, -3.5 * fs, 5 * fs, 7 * fs);
				if (!t.live) {
					e.fillStyle = "#f6c453";
					e.beginPath();
					e.arc(15 * fs, -5 * fs, 2 * fs, 0, Math.PI * 2);
					e.fill();
				}
				e.restore();
				e.save();
				e.translate(t.x, t.y);
				e.strokeStyle = t.live ? "rgba(194, 59, 34, 0.7)" : "rgba(212, 160, 23, 0.35)";
				e.lineWidth = 1.6 / this.viewZoom();
				e.beginPath();
				e.arc(0, 0, t.live ? 34 : 18, 0, Math.PI * 2);
				e.stroke();
			} else {
				e.fillStyle = "rgba(0,0,0,0.4)";
				e.beginPath();
				e.ellipse(2, 10 * fs, 8 * fs, 3 * fs, 0, 0, Math.PI * 2);
				e.fill();
				e.fillStyle = "#5c3a1e";
				e.fillRect(-3.5 * fs, -18 * fs, 7 * fs, 30 * fs);
				e.fillStyle = "#3f2a16";
				e.fillRect(-5 * fs, 8 * fs, 10 * fs, 4 * fs);
				e.save();
				e.rotate(t.angle);
				e.fillStyle = "#7c4a1e";
				e.fillRect(-4 * fs, -3 * fs, 10 * fs, 6 * fs);
				e.fillStyle = "#1c1917";
				e.fillRect(4 * fs, -1.6 * fs, 22 * fs, 3.2 * fs);
				e.fillStyle = "#a8a29e";
				e.fillRect(24 * fs, -2.2 * fs, 3 * fs, 4.4 * fs);
				e.restore();
			}
			e.restore();
		}
	}
	updateFlares(dt) {
		for (let i = this.flares.length - 1; i >= 0; i--) {
			if (this.flares[i].until <= this.simTime) this.flares.splice(i, 1);
		}
		void dt;
	}
		initRunMeta(...args) {
		return this.playerSim.initRunMeta(...args);
	}
	// Batch 9 (Lane 1): stage terrain rules — tree density (location clone, never
	// mutates the shared GAME_LOCATIONS row), hole count, barrel count. Runs
	// early in start(), building scene features from scenes.ts before
	// rebuildFlow(true) so the flow field sees the extra trees.
		applyStageTerrain(...args) {
		return this.playerSim.applyStageTerrain(...args);
	}
	// Batch 9 (Lane 1): character passive mods — applied in start() after
	// initRunMeta/applyRunStatMods so the meta-lane math is already settled.
	// Idempotent across repeated starts: the previous run's character slice is
	// divided/subtracted out before the new one lands.
		applyRosterMods(...args) {
		return this.playerSim.applyRosterMods(...args);
	}
	// Batch 9 (Lane 1): stage elite-cadence rule (Honey Springs shortens it).
	eliteIntervalSec() {
		return 45 * (this.eliteIntervalMul || 1);
	}
		bumpLifetime(...args) {
		return this.playerSim.bumpLifetime(...args);
	}
	playerDamageMul(z, weaponType = ``) {
		// Batch 7: run-stat mods multiply base damage (defaults to 1 when the meta lane is absent).
		let m = this.questDmgMul * this.shopDmgMul * (this.runDamageMul || 1);
		if (weaponType) {
			m *= this.familyAffinity(weaponType);
			// Batch 9 (Lane 1): affinity-tag damage wiring — the lead support boon
			// applies ONLY to weapons sharing at least one tag (precise). Universal
			// boons stay universal; see supportApplies in boons.ts.
			if (supportApplies(`lead`, weaponType)) m *= 1 + this.boon(`lead`) * .08;
			// Batch 12 (Lane 1): whetstone — chainsaw support via the heavy tag.
			if (weaponType === `chainsaw` && whetstoneApplies(this.boonStacks, weaponType)) m *= whetstoneChainsawMul(this.boon(`whetstone`));
		}
			if (z.type === `behemoth` || z.type === `old_ben` || z.type === `miner_brute` || z.elite) {
				let attuned = 0;
				for (const s of this.shrines) s.attuned && attuned++;
				m *= 1 + SHRINE_BOSS_DMG_PER * attuned;
			}
			return m;
	}

	// VS-2: weapon-family support affinity — 2+ unlocked weapons in a family
	// (an evolved weapon counts as two) gives family weapons +12% damage.
	familyAffinity(weaponType) {
		for (const f of Object.values(WEAPON_FAMILIES)) {
			if (!f.members.includes(weaponType)) continue;
			let count = 0;
			for (const id of f.members) {
				if (this.weapons.some((w) => w.id === id && w.unlocked)) count++;
				if (this.evolutionDone[id]) count++;
			}
			return count >= 2 ? 1.12 : 1;
		}
		return 1;
	}
		tryDash(...args) {
		return this.playerSim.tryDash(...args);
	}
		spawnShrines(...args) {
		return this.mapSim.spawnShrines(...args);
	}
		nearShrine(...args) {
		return this.mapSim.nearShrine(...args);
	}
		tryAttuneShrine(...args) {
		return this.mapSim.tryAttuneShrine(...args);
	}
		shopCost(...args) {
		return this.mapSim.shopCost(...args);
	}
		rollShop(...args) {
		return this.mapSim.rollShop(...args);
	}
		rerollShop(...args) {
		return this.mapSim.rerollShop(...args);
	}
		toggleShopLock(...args) {
		return this.mapSim.toggleShopLock(...args);
	}
		buyShopOffer(...args) {
		return this.mapSim.buyShopOffer(...args);
	}
		applyShopOffer(...args) {
		return this.mapSim.applyShopOffer(...args);
	}
		skipWaveBreak(...args) {
		return this.waveSim.skipWaveBreak(...args);
	}
	loop = (e) => {
		// Batch 8 (Lane B): post-death cinematic — keep rendering (no simulation)
		// until the window ends, then let the loop rest.
		if (!this.isRunning) {
			if (this.deathCineT <= 0) return;
			const d = Math.min((e - this.lastTimestamp) / 1e3, .1);
			this.lastTimestamp = e;
			this.updateDeathCine(d);
			this.render();
			this.animationFrameId = this.deathCineT > 0 ? requestAnimationFrame(this.loop) : null;
			return;
		}
		// Fire a pending queued draft once its grace period of live play has elapsed.
		if (!this.isPaused && !this.draft && this.queuedLevels > 0 && this.draftGraceUntil > 0 && Date.now() >= this.draftGraceUntil) {
			this.openQueuedDraft();
		}
		if (this.isPaused) return;
		let t = Math.min((e - this.lastTimestamp) / 1e3, .1);
		// Batch 7: celebration stack — poll draft/shrine/bomb transitions, scale sim dt during the slow-mo window.
		render7.celebration.poll({ draftOpen: !!this.draft, shrinesAttuned: this.shrines.reduce((n, s) => n + (s.attuned ? 1 : 0), 0), bombCharges: this.bombCharges }, this.player.x, this.player.y);
		t *= render7.celebration.slowmoFactor(performance.now());
		this.lastTimestamp = e, this.update(t), this.render(), this.animationFrameId = requestAnimationFrame(this.loop);
	};
	update(e) {
		let t = Date.now();
		if (this.simTime += e, this.hitstop > 0) {
			this.hitstop -= e, this.render();
			return;
		}
		// Batch 5: whiff micro-slow — the world runs at 0.12x for 0.12s after a missed bash.
		if (this.whiffSlowT > 0) { this.whiffSlowT -= e; e *= .12; }
		// Batch 10 (Lane 1): Still Heart — 0.35x world sim while live (simTime itself stays real-time, so the 5s window is wall-clock). Last-kill — 0.5x for 1s.
		if (this.stillHeartUntil > this.simTime) e *= SIGNATURE_TUNING.eula_stillwell.power;
		if (this.lastKillSlowT > 0) { this.lastKillSlowT -= e; e *= .5; }
		this.trauma = Math.max(0, this.trauma - e * 1.6);
		for (let t = this.floaters.length - 1; t >= 0; t--) {
			let n = this.floaters[t];
			n.y += n.vy * e, n.life -= e, n.life <= 0 && (n.onFree?.(), n.onFree = null, this.floaterPool.push(n), this.floaters.splice(t, 1));
		}
		this._simFrames = (this._simFrames || 0) + 1,
		this.updatePowerups(e), this.updatePlayer(e), this.updateWeapons(t), this.rebuildZombieHash(), this.updateBullets(e, t), this.updateAcidSpits(e), this.updateFirePuddles(t), this.updateFlares(e), this.updateRig(e), this.updateTraps(e), this.updateBeacon(e), this.updateOrbit(e), this.updateTelegraphs(e), this.updateOrbiters(e), this.updateStorm(e), this.updateSalt(e), this.updateAura(e), this.updateNova(e), this.updateMissiles(e), this.updateVacuumDrops(), this.updateDirector(), this.updateLightning(e), this.updateArcBeams(e), this.updateWaveManager(t), this.updateHordeEvents(e), this.updateBomb(), this.updateEvents(), this.updateFlankDirector(e), this.updateZombies(e, t), this.updateDrops(e), this.updateParticles(e), t - this.lastKillTime > 4500 && this.comboMultiplier > 1 && (this.comboMultiplier = 1), this.streakTimer > 0 && (this.streakTimer -= e, this.streakTimer <= 0 && (this.streak = 0, this.streakTimer = 0)), this.screenShake > 0 && (this.screenShake = Math.max(0, this.screenShake - e * 25)), this.muzzleFlashTimer > 0 && (this.muzzleFlashTimer -= e * 10), this.updateDynLights(e), this.updateLantern(), this.updateBellHold(e), this.updateNoisePulses(e), this.updateScorch(e), this.updateCorpseDecals(e), this.updateFeel(e), this.updatePowerupDrops(), this.updatePowerupShower(e), this.updateRailgun(e), this.updateScoreMulDrops(), this.updateCacheTimer(), this.updateFuse(e), this.updateLobbedCharges(e), this.updateKillSurge(e), this.updateBeastAudio(e);
		// Batch 5: on-shoot micro-layer decays — muzzle punch 50ms, gun kick 40ms yoyo, camera punch 60ms.
		this.muzzlePunch = Math.max(0, this.muzzlePunch - e);
		if (this.gunKickT > 0) { this.gunKickT = Math.max(0, this.gunKickT - e); this.gunKick = 5 * Math.sin((1 - this.gunKickT / .04) * Math.PI); } else this.gunKick = 0;
		this.camPunchT = Math.max(0, this.camPunchT - e);
		// Batch 2: low-HP heartbeat — a double-thump when you're almost gone.
		if (this.player.health > 0 && this.player.health < this.player.maxHealth * .3 && Date.now() - this.lastHeartbeat > 1000) {
			this.lastHeartbeat = Date.now();
			soundEngine.tone({ f: 55, type: `sine`, dur: .12, vol: .4 });
			soundEngine.tone({ f: 48, type: `sine`, dur: .15, vol: .35, delay: .18 });
		}
		this.dodgeCd = Math.max(0, this.dodgeCd - e);
		this.bashCd = Math.max(0, this.bashCd - e);
		this.bashSwing = Math.max(0, this.bashSwing - e);
		this.invuln = Math.max(0, this.invuln - e);
		this.bloodRush = Math.max(0, this.bloodRush - e);
		this.worldSlow = Math.max(0, this.worldSlow - e);
		this.fogUntil = Math.max(0, this.fogUntil - e);
		this.pumpAnim = Math.max(0, this.pumpAnim - e * 28);
		if (this.simTime - this.lastHeat > 0.4) {
			this.lastHeat = this.simTime;
			const waveHeat = Math.min(1, Math.max(0, this.wave - 1) / 7);
			const pack = Math.min(1, this.zombies.length / 26);
			soundEngine.setHeat(Math.max(waveHeat, pack * 0.9));
		}
		this.switchBanner = Math.max(0, this.switchBanner - e);
		this.updateGrit(e);
		this.player.flashlightRange = this.fogUntil > 0 ? 240 : 420;
		this.flowRebuild -= e;
		if (this.flowRebuild <= 0) this.rebuildFlow();
		for (let k = this.afterimages.length - 1; k >= 0; k--) {
			this.afterimages[k].life -= e;
			if (this.afterimages[k].life <= 0) this.afterimages.splice(k, 1);
		}
		let n = this.weapons[this.currentWeaponIndex];
		const hands = !this.isMouseDown && this.virtualJoystickAim.x === 0 && this.virtualJoystickAim.y === 0;
		const reloadWindow = n.reloadTime * (hands ? .38 : 1);
		let r = this.isReloading ? Math.min(1, (t - this.reloadStartTime) / reloadWindow) : 0, i = this.currentLocation.workbench;
		this.nearWorkbench = Math.hypot(this.player.x - i.x, this.player.y - i.y) < 70;
		let a = this.loreNotes.find((e) => !e.collected && Math.hypot(this.player.x - e.x, this.player.y - e.y) < 65), o = this.extractActive && Math.hypot(this.player.x - this.currentLocation.extract.x, this.player.y - this.currentLocation.extract.y) <= this.currentLocation.extract.radius + 12, s = this.currentLocation.lantern, c = !!(s && Math.hypot(this.player.x - s.x, this.player.y - s.y) < 78), l = this.nearestHole(92), u = this.currentLocation.bell, d = !!(u && Math.hypot(this.player.x - u.x, this.player.y - u.y) < 80);
		const nearRig = !!(this.rig && Math.hypot(this.player.x - this.rig.x, this.player.y - this.rig.y) < 72);
		const rigHint = !nearRig ? `` : !this.rigArmed ? `Find the note for the ${this.rig.name}` : this.simTime < this.rig.until ? `${this.rig.name} holding the lane` : this.simTime < this.rig.cool ? `${this.rig.name} cooling` : `Press [E] — crank ${this.rig.name}`;
		this.interactHint = this.draft || this.levelHold ? `` : rigHint || (o ? `Hold [E] — extract` : this.bellReady && !this.bellRung && d ? `Hold [E] — ring the bell` : c && !this.lanternLit ? `Press [E] — relight lantern` : l && !l.boarded ? this.scrap < 25 ? `Need 25 scrap to board` : `Press [E] — board hole (25 scrap)` : this.nearShrine() ? `Press [E] \u2014 attune shrine` : a ? `Press [E] to read note` : this.nearWorkbench ? `Press [E] — workbench` : ``), this.callbacks.onStatsUpdate({
			health: this.player.health,
			maxHealth: this.player.maxHealth,
			stamina: this.player.stamina,
			weapon: n,
			molotovs: this.player.molotovs,
			flares: this.player.flares,
			posts: this.posts,
			pipes: this.pipes,
			score: this.score,
			scrap: this.scrap,
			combo: this.comboMultiplier,
			wave: this.waveState === `break` ? Math.max(1, this.wave + 1) : Math.max(1, this.wave),
			waveTimer: this.waveState === `break` ? this.waveBreakCountdown : 0,
			zombiesRemaining: this.zombies.length + this.zombiesToSpawn,
			isReloading: this.isReloading,
			reloadProgress: r,
			activePowerups: this.activePowerups,
			nearWorkbench: this.nearWorkbench,
			extractActive: this.extractActive,
			interactHint: this.interactHint,
			lanternLit: this.lanternLit,
			hasLantern: !!this.currentLocation.lantern,
			sneaking: this.player.isSneaking,
			bellReady: this.bellReady && !this.bellRung,
			bellHold: this.bellHold / 2.2,
			holesOpen: this.holes.filter((e) => !e.boarded).length,
			holesTotal: this.holes.length,
			bloodRush: this.bloodRush > 0,
			lastStandReady: !this.lastStandUsed,
			dodgeReady: this.dodgeCd <= 0 && this.player.stamina >= 20,
			dashCharges: this.dashCharges,
			dashMax: this.dashMax,
			waveState: this.waveState,
			waveWindow: this.windowFor(Math.max(1, this.wave)).name,
			waveSchedule: this.waveSchedule(),
			eliteIn: Math.max(0, Math.ceil(this.eliteIntervalSec() - (this.simTime - this.lastEliteAt))),
			shopOffers: this.shopOffers.map((o) => {
				const d = SHOP_POOL.find((x) => x.id === o.offerId);
				return d ? { id: d.id, name: d.name, desc: d.desc, cost: this.shopCost(d), locked: o.locked, afford: this.scrap >= this.shopCost(d) } : null;
			}).filter(Boolean),
			shopRerollCost: this.shopRerollCost,
			shrines: this.shrines.map((s) => ({ x: s.x, y: s.y, attuned: s.attuned })),
			fog: this.fogUntil > 0,
			waveCall: this.waveCall || "",
			bounty: !this.bounty ? "" : this.bounty.done ? "Bounty paid" : `${this.bounty.kind === "head" ? "Headshots" : "Drops"} ${this.bounty.have}/${this.bounty.need}`,
			fresh: this.simTime < this.freshUntil,
			level: this.level,
			xp: this.xp,
			xpNeed: this.xpToNext(),
			evolved: this.evolved,
			evolutionHints: this.evolutionHints(),
			gritBag: Math.round(this.gritBag),
			bombCharges: this.bombCharges,
			bombMax: BOMB_MAX_CHARGES,
			activeEvents: this.activeEvents.map((a) => a.id),
			rerolls: this.rerolls,
			weaponIndex: this.currentWeaponIndex,
			loadout: this.weapons.map((w) => ({
				id: w.id,
				name: w.name,
				unlocked: w.unlocked,
				mag: w.currentMag,
				reserve: w.reserveAmmo
			})),
			switchBanner: this.switchBanner,
			helpVisible: this.stats.shotsFired === 0 && this.simTime < 12
		});
	}
		updatePlayer(...args) {
		return this.playerSim.updatePlayer(...args);
	}
		emitFootstep(...args) {
		return this.playerSim.emitFootstep(...args);
	}
		tryDodge(...args) {
		return this.playerSim.tryDodge(...args);
	}
		tryBash(...args) {
		return this.playerSim.tryBash(...args);
	}
		updateHordeEvents(...args) {
		return this.waveSim.updateHordeEvents(...args);
	}
	updateWeapons(e) {
		let t = this.weapons[this.currentWeaponIndex];
		if (this.isReloading) {
			let n = this.getPerkLevel(`quickdraw`) * .2 + (supportApplies(`trigger`, t.id) ? this.boon(`trigger`) : 0) * .08; // Batch 9: trigger quickens reload ONLY for linked weapons.
			const hands = !this.isMouseDown && this.virtualJoystickAim.x === 0 && this.virtualJoystickAim.y === 0;
			let r = t.reloadTime * (1 - Math.min(.65, n)) * (hands ? .38 : 1);
			if (e - this.reloadStartTime >= r) {
				let e = t.magazineSize - t.currentMag, n = Math.min(e, t.reserveAmmo);
				t.currentMag += n, t.reserveAmmo -= n, this.isReloading = false, this.freshUntil = this.simTime + 1.45, this.spawnFloater(this.player.x, this.player.y - 40, "FRESH", "#fde68a");
			}
			return;
		}
		const hunting = !this.isMouseDown && !this.player.isSneaking && !!this.nearestTarget(this.aimReach());
		let n = this.hasPowerup(`infinite_ammo`), r = n ? 1.4 : 1, i = this.isMouseDown || this.virtualJoystickAim.x !== 0 || this.virtualJoystickAim.y !== 0 || hunting, a = 1e3 / (t.fireRate * (1 + this.getPerkLevel(`quickdraw`) * .18) * (1 + (supportApplies(`trigger`, t.id) ? this.boon(`trigger`) : 0) * .1) * this.shopFireRateMul / this.bpFireMul * (1 + (this.comboMultiplier - 1) * .06) * r * this.signatureFireRateMul()); // Batch 9: trigger fire-rate is affinity-gated. Batch 10 (Lane 1): Deadeye Draw multiplies on top.
		// Batch 10 (Lane 4): Corn Liquor — +12%/rank fire rate (interval shrinks
		// by 1/cornLiquorFireRateMul). Global passive, untagged.
		a /= cornLiquorFireRateMul(this.boon(`cornliquor`));
		this._lastFireInterval = a;
		i && e - this.lastShotTime >= a && (t.currentMag > 0 || n ? (this.fireCurrentWeapon(), this.lastShotTime = e) : t.reserveAmmo > 0 ? this.reloadCurrentWeapon() : this.autoSwapFromDry());
	}
		nearestTarget(...args) {
		return this.combat.nearestTarget(...args);
	}
		fireCurrentWeapon(...args) {
		return this.combat.fireCurrentWeapon(...args);
	}
		updateBullets(...args) {
		return this.combat.updateBullets(...args);
	}
		checkHeadshot(...args) {
		return this.combat.checkHeadshot(...args);
	}
	normalizeAngle(e) {
		for (; e > Math.PI;) e -= Math.PI * 2;
		for (; e < -Math.PI;) e += Math.PI * 2;
		return e;
	}
		detonateMolotov(...args) {
		return this.combat.detonateMolotov(...args);
	}
		detonateExplosiveBarrel(...args) {
		return this.combat.detonateExplosiveBarrel(...args);
	}
		updateFirePuddles(...args) {
		return this.combat.updateFirePuddles(...args);
	}
		updateAcidSpits(...args) {
		return this.combat.updateAcidSpits(...args);
	}
		updateWaveManager(...args) {
		return this.waveSim.updateWaveManager(...args);
	}
		endlessMilestone(...args) {
		return this.waveSim.endlessMilestone(...args);
	}
		eventMods(...args) {
		return this.waveSim.eventMods(...args);
	}
		fireEvent(...args) {
		return this.waveSim.fireEvent(...args);
	}
		updateEvents(...args) {
		return this.waveSim.updateEvents(...args);
	}
	// Batch 12 (Lane 1): Powerup Shower — mid-wave, rains 8-12 random
	// powerups across the arena over ~6 seconds.
		beginPowerupShower(...args) {
		return this.waveSim.beginPowerupShower(...args);
	}
		updatePowerupShower(...args) {
		return this.waveSim.updatePowerupShower(...args);
	}
	// Batch 12 (Lane 1): Elite Hunt — a pack of 3-5 elites (each with an
	// affix) moves in at once. Track the pack per wave; killing every marked
	// elite inside the wave pays a grit shower plus a free shop reroll.
		beginEliteHunt(...args) {
		return this.waveSim.beginEliteHunt(...args);
	}
		grantHuntBonus(...args) {
		return this.waveSim.grantHuntBonus(...args);
	}
	// Batch 12 (Lane 1): flamethrower config from the weapon row —
	// dmg = direct damage, cnt = burn stacks applied, rad = cone length,
	// spd = cone half-angle (degrees), cd = refire.
		flameCfg(...args) {
		return this.combat.flameCfg(...args);
	}
		fireFlamethrower(...args) {
		return this.combat.fireFlamethrower(...args);
	}
	// Batch 12 (Lane 1): railgun config — dmg = beam damage, rad = beam
	// length, spd = charge seconds, cd = refire.
	railCfg(w) {
		const lv = statsForLevel(`railgun`, w?.upgradeLevel ?? 1);
		return {
			dmg: w?.damage ?? lv?.dmg ?? 420,
			len: Math.max(1, w?.range ?? lv?.rad ?? 900),
			chargeSec: Math.max(.2, w?.bulletSpeed ?? lv?.spd ?? .6),
		};
	}
		fireRailgun(...args) {
		return this.combat.fireRailgun(...args);
	}
	updateRailgun(dt) {
		if (!this.railCharging || this.draft) return;
		this.railChargeT -= dt;
		if (this.railChargeT <= 0) {
			this.railCharging = false;
			this.fireRailShot();
		}
	}
	fireRailShot() {
		const w = this.railChargeW;
		const len = w ? this.railCfg(w).len : 900;
		const dmg = this.railChargeDmg;
		const ax = Math.cos(this.player.angle), ay = Math.sin(this.player.angle);
		const halfW = 26;
		let hits = 0;
		// Snapshot: killZombie splices this.zombies; iterating the live array
		// would skip the zombie after every beam kill.
		for (const z of [...this.zombies]) {
			if (z.health <= 0) continue;
			const dx = z.x - this.player.x, dy = z.y - this.player.y;
			const t = dx * ax + dy * ay;
			if (t < 0 || t > len + z.radius) continue;
			if (Math.abs(dx * -ay + dy * ax) > halfW + z.radius) continue;
			const dealt = this.applyAffixDefense(z, dmg);
			z.health -= dealt;
			z.hitFlash = .3;
			this.stats.damageDealt += dealt;
			this.createBloodParticles(z.x, z.y, Math.atan2(dy, dx));
			this.thornedReflect(z, dmg);
			hits++;
			if (z.health <= 0) this.killZombie(z, this.zombies.indexOf(z));
		}
		// Hitscan-ish piercing beam visual: hot white-violet core.
		this.heatArc(this.player.x, this.player.y, this.player.x + ax * len, this.player.y + ay * len);
		this.addLight(this.player.x + ax * len * .5, this.player.y + ay * len * .5, 420, .9, .5);
		soundEngine.tone({ f: 1800, f2: 200, type: `sawtooth`, dur: .3, vol: .3 });
		this.screenShake = Math.max(this.screenShake, 8 * this.tune('shake') * this.motionScale());
		this.lastRail = { hits, len: Math.round(len) };
		this.alertZombies(this.player.x, this.player.y, 420);
		if (w && w.currentMag === 0) this.reloadCurrentWeapon();
	}
	// Batch 12 (Lane 1): Copperhead Rounds — bullet hits stack a bleeding
	// poison on the zombie (tag-gated to rapid+precise weapons). Each stack
	// ticks copperheadPoisonDps for copperheadDurationSec seconds.
		applyCopperhead(...args) {
		return this.combat.applyCopperhead(...args);
	}
	// Ticks one poisoned zombie. Returns true when the poison killed it.
		tickPoison(...args) {
		return this.combat.tickPoison(...args);
	}
		updateBomb(...args) {
		return this.combat.updateBomb(...args);
	}
		detonateBomb(...args) {
		return this.combat.detonateBomb(...args);
	}
		checkEvolutions(...args) {
		return this.waveSim.checkEvolutions(...args);
	}
		evolutionHints(...args) {
		return this.waveSim.evolutionHints(...args);
	}
		startNextWave(...args) {
		return this.waveSim.startNextWave(...args);
	}
		farEdgeSpawn(...args) {
		return this.zombieSim.farEdgeSpawn(...args);
	}
	// VS-2: guaranteed elite — the director never lets the pressure fully drop.
		spawnGuaranteedElite(...args) {
		return this.zombieSim.spawnGuaranteedElite(...args);
	}
	// VS-2: named wave windows — data-driven schedule (Batch 8 Lane D: WAVES timeline table).
	windowFor(wave) {
		const e = windowAt(wave);
		return { ...e, name: e.label };
	}
	waveSchedule() {
		const cur = Math.max(1, this.wave);
		return WAVES.map((e) => ({ id: e.id, name: e.label, waves: e.to === Infinity ? `${e.from}+` : `${e.from}-${e.to}`, blurb: e.blurb, current: cur >= e.from && cur <= e.to }));
	}
	checkWindowChange() {
		const w = this.windowFor(Math.max(1, this.wave));
		if (w.id !== this.currentWindowId) {
			this.currentWindowId = w.id;
			this.spawnFloater(this.player.x, this.player.y - 64, w.name.toUpperCase(), `#f6c453`);
			this.callbacks.onRadio?.(`WJPS`, `${w.name} — ${w.blurb}`);
		}
	}
		spawnRandomZombie(...args) {
		return this.zombieSim.spawnRandomZombie(...args);
	}
		pushZombie(...args) {
		return this.zombieSim.pushZombie(...args);
	}
	// Batch 3: flanking director — peels a fraction of the horde wide to punish turtling.
		updateFlankDirector(...args) {
		return this.zombieSim.updateFlankDirector(...args);
	}
	// Batch 3: cull — recycle zombies past 1400u, hard cap 170. Keeps the sim bounded.
		cullZombies(...args) {
		return this.zombieSim.cullZombies(...args);
	}
		updateZombies(...args) {
		return this.zombieSim.updateZombies(...args);
	}
		boneBurst(...args) {
		return this.zombieSim.boneBurst(...args);
	}
		fanTheCylinder(...args) {
		return this.zombieSim.fanTheCylinder(...args);
	}
		killZombie(...args) {
		return this.zombieSim.killZombie(...args);
	}
		damagePlayer(...args) {
		return this.playerSim.damagePlayer(...args);
	}
	// Batch 8 (Lane B): player-death stack — hitstop beat, full-screen white
	// flash, 24-particle blood burst, and a short slow-motion cinematic window.
	// handleGameOver() still fires immediately; the loop keeps rendering the
	// cinematic without running the normal simulation.
		runDeathStack(...args) {
		return this.playerSim.runDeathStack(...args);
	}

	// Batch 8 (Lane B): tick the post-death cinematic — hitstop beat first,
	// then 0.15x slow-motion particles while the flash fades.
		updateDeathCine(...args) {
		return this.playerSim.updateDeathCine(...args);
	}

	// Batch 8 (Lane B): slow-mo factor during the post-death cinematic.
	deathSlowmoFactor() {
		return !this.isRunning && this.deathCineT > 0 && this.hitstop <= 0 ? .15 : 1;
	}

	// Batch 8 (Lane B): full-screen white flash overlay, drawn last in render().
	renderDeathFlash(e: CanvasRenderingContext2D) {
		if (this.deathFlash <= 0) return;
		e.save();
		e.globalAlpha = Math.min(1, this.deathFlash * 3);
		e.fillStyle = `#ffffff`;
		e.fillRect(0, 0, this.canvas.width, this.canvas.height);
		e.restore();
	}
		handleGameOver(...args) {
		return this.playerSim.handleGameOver(...args);
	}

	// VS-1: Harvest Streak tier color — cyan <10, gold 10+, pink 20+.
	streakColor() {
		return this.streak >= 20 ? `#ff6ec7` : this.streak >= 10 ? `#ffd700` : `#4cc3ff`;
	}

	// VS-1: capped fading scorch decals left by explosions.
		addScorch(...args) {
		return this.juice.addScorch(...args);
	}
		updateScorch(...args) {
		return this.juice.updateScorch(...args);
	}

	// VS-1: pooled damage numbers — throttled so bullet storms don't spam floaters.
		spawnDamageNumber(...args) {
		return this.juice.spawnDamageNumber(...args);
	}

	// Batch 5: kill-word floaters — SLAIN! / DOWN! / SPLAT! / CRUNCH!, gold/red,
	// pooled through spawnFloater so the 40-floater cap discipline holds.
		spawnKillWord(...args) {
		return this.juice.spawnKillWord(...args);
	}
	// Batch 5: directional blood spray — velocity scales with the hit's power.
	// Spray particles carry splat:true so they leave ground splats on death.
		bloodSpray(...args) {
		return this.juice.bloodSpray(...args);
	}
	// Batch 5: persistent fading ground splats — capped ~30, oldest recycled.
		addBloodSplat(...args) {
		return this.juice.addBloodSplat(...args);
	}
	// Batch 5: oriented slash streaks on hits (faint for whiffs). Cap 24.
		addSlash(...args) {
		return this.juice.addSlash(...args);
	}
	renderSlashBursts(e) {
		for (const s of this.slashBursts) {
			const a = Math.max(0, s.life / s.maxLife) * (s.faint ? .35 : .8);
			e.save();
			e.translate(s.x, s.y);
			e.rotate(s.angle);
			e.strokeStyle = `rgba(240, 240, 235, ${a.toFixed(3)})`;
			e.lineWidth = 3;
			for (const off of [-7, 0, 7]) {
				const len = off === 0 ? 28 : 18;
				e.beginPath();
				e.moveTo(-len / 2, off);
				e.lineTo(len / 2, off);
				e.stroke();
			}
			e.restore();
		}
	}
	// Batch 5: score gains funnel through here so score_surge (2x, 15s) applies everywhere.
		addScore(...args) {
		return this.juice.addScore(...args);
	}
	hexA(hex, alpha) {
		const h = String(hex).replace(`#`, ``);
		const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
	}
	// Batch 5: enemy body reactions — vertical pop, 80ms squash-and-stretch yoyo,
	// slight hit spin on heavy hits (80+).
		reactHit(...args) {
		return this.juice.reactHit(...args);
	}

	// VS-1: "Run Out of the County" banish — permanently remove a boon from this run's draft pool.
		banishBoon(...args) {
		return this.pickupSim.banishBoon(...args);
	}

	// VS-3: hit-feel module. One master kill switch (this.hitFeel) gates everything.
	// Rationed hit-stop: a 0.3s budget that refills over time — big moments
	// spend more, bullet spam can't drain it.
		spendHitstop(...args) {
		return this.juice.spendHitstop(...args);
	}
		feelHit(...args) {
		return this.juice.feelHit(...args);
	}
		feelKill(...args) {
		return this.juice.feelKill(...args);
	}
		updateFeel(...args) {
		return this.juice.updateFeel(...args);
	}
		setHitFeel(...args) {
		return this.juice.setHitFeel(...args);
	}
	// Batch 2: mass-based knockback — sprinters fly, behemoths barely budge.
		zombieMass(...args) {
		return this.zombieSim.zombieMass(...args);
	}
		knockbackFor(...args) {
		return this.zombieSim.knockbackFor(...args);
	}
		nearestZombie(...args) {
		return this.zombieSim.nearestZombie(...args);
	}
	// Batch 2: elite affixes — readable, telegraphed, each with a visual tell.
	// Batch 11 (Lane 1): +thorned (reflects melee/bash damage back at the
	// player — keep clear, shoot it) and +wailing (periodically wails, driving
	// nearby zombies into a faster frenzy — kill it first).
		assignAffix(...args) {
		return this.zombieSim.assignAffix(...args);
	}
	// Batch 11 (Lane 1): the wail — nearby zombies get 4s of +35% speed frenzy.
		wailBlast(...args) {
		return this.zombieSim.wailBlast(...args);
	}
	// Batch 11 (Lane 1): thorns — a thorned elite reflects 35% of melee/bash
	// damage back at the player. Counterplay: keep clear of it, shoot it.
		thornedReflect(...args) {
		return this.zombieSim.thornedReflect(...args);
	}
	// Batch 9: kill-surge audio drive — Lane 3 owns setKillSurge; the typeof
	// guard keeps this a no-op if the audio lane's method is ever absent.
		driveKillSurge(...args) {
		return this.zombieSim.driveKillSurge(...args);
	}
	// Batch 9: kill surge decays ~0.25/s while it sits above 0; kills push it
	// back up in killZombie, so it only falls when the killing stops.
		updateKillSurge(...args) {
		return this.zombieSim.updateKillSurge(...args);
	}
	// Batch 5: per-frame audio state — heartbeat follows HP, beast damage accumulator decays.
		updateBeastAudio(...args) {
		return this.zombieSim.updateBeastAudio(...args);
	}
	// Batch 6 (Lane E contracts): field-tuning panel + accessibility.
	// TuningKey = "hitstop" | "shake" | "kick" | "zoom" | "knockback" | "particles" | "flash".
		tune(...args) {
		return this.playerSim.tune(...args);
	}
		motionScale(...args) {
		return this.playerSim.motionScale(...args);
	}
		flashScale(...args) {
		return this.playerSim.flashScale(...args);
	}
		setTuning(...args) {
		return this.playerSim.setTuning(...args);
	}
		setA11y(...args) {
		return this.playerSim.setA11y(...args);
	}
		testImpact(...args) {
		return this.juice.testImpact(...args);
	}
	// Batch 7 (Lane 1): weapon defs live here because the constants.ts entries are
	// owned by another lane — entry fields win, local defaults fill the gaps.
	chainCfgDefaults() {
		return { damage: 55, fireIntervalMs: 900, chainJumps: 4, chainFalloff: 0.7, chainRadius: 260, acquireRadius: 260 };
	}
	// Batch 7 (Lane 1): chain config. Base numbers come from the data lane's
	// SPECIAL_WEAPON_DEFS when present (Patoka Arc: 45dmg / 1500ms / 4 jumps /
	// 0.75 falloff / 260u jump radius); the WEAPON_LEVELS row (via
	// upgradeWeaponOnce) drives damage, fire rate, and first-target acquisition
	// range. NOTE: the level row's cnt stays 1 for chainlightning — jumps come
	// from the def ("Four jumps deep"), not the row.
	chainCfg() {
		const d = this.chainCfgDefaults();
		const def = SPECIAL_WEAPON_DEFS?.[`chainlightning`];
		const w = this.weapons.find((x) => x.id === `chainlightning`);
		const lv = statsForLevel(`chainlightning`, w?.upgradeLevel ?? 1);
		const intervalMs = Math.round((lv?.cd ?? ((def?.fireIntervalMs ?? d.fireIntervalMs) / 1000)) * 1000);
		return {
			damage: w?.damage ?? lv?.dmg ?? def?.damage ?? d.damage,
			fireIntervalMs: intervalMs,
			chainJumps: (w as any)?.chainJumps ?? def?.chainJumps ?? d.chainJumps,
			chainFalloff: (w as any)?.chainFalloff ?? def?.chainFalloff ?? d.chainFalloff,
			chainRadius: Math.max(0.001, (w as any)?.chainRadius ?? def?.chainRadius ?? d.chainRadius),
			acquireRadius: Math.max(0.001, w?.range ?? lv?.rad ?? def?.chainRadius ?? d.acquireRadius),
		};
	}
	orbiterCfgDefaults() {
		return { orbiterCount: 3, orbiterRadius: 95, orbiterDps: 42, orbiterSpeed: 2.8, fireIntervalMs: 0 };
	}
	// Batch 7 (Lane 1): orbiter config. The data lane's WEAPON_LEVELS row maps
	// onto the generic weapon fields (dmg->dps, cnt->blade count, rad->radius,
	// spd->speed, cd->contact interval) via upgradeWeaponOnce, so the row is
	// the live source; SPECIAL_WEAPON_DEFS is the fallback.
	orbiterCfg() {
		const d = this.orbiterCfgDefaults();
		const def = SPECIAL_WEAPON_DEFS?.[`orbiter`];
		const w = this.weapons.find((x) => x.id === `orbiter`);
		const lv = statsForLevel(`orbiter`, w?.upgradeLevel ?? 1);
		return {
			orbiterCount: Math.max(1, Math.round(w?.pellets ?? lv?.cnt ?? def?.orbiterCount ?? d.orbiterCount)),
			orbiterRadius: Math.max(0.001, w?.range ?? lv?.rad ?? def?.orbiterRadius ?? d.orbiterRadius),
			orbiterDps: Math.max(0, w?.damage ?? lv?.dmg ?? def?.orbiterDps ?? d.orbiterDps),
			orbiterSpeed: w?.bulletSpeed ?? lv?.spd ?? def?.orbiterSpeed ?? d.orbiterSpeed,
			fireIntervalMs: Math.round(((lv?.cd ?? ((def?.fireIntervalMs ?? d.fireIntervalMs) / 1000))) * 1000),
		};
	}
	// Batch 7 (Lane 1): "Patoka Arc" chain lightning — nearest zombie in range,
	// then arcs to the nearest unhit zombie within chainRadius, damage x falloff per jump.
		fireChainLightning(...args) {
		return this.combat.fireChainLightning(...args);
	}
	// Batch 7: jagged polyline through the existing lightning + particle systems.
		arcSegment(...args) {
		return this.combat.arcSegment(...args);
	}
	// Batch 7: "Still-Yard Blades" firing pulse — the blades themselves do the work passively.
		fireOrbiterPulse(...args) {
		return this.combat.fireOrbiterPulse(...args);
	}
	// Batch 7: orbiter blades persist while the weapon is equipped; per-zombie per-blade
	// cooldowns keep contact DPS honest.
		updateOrbiters(...args) {
		return this.powers.updateOrbiters(...args);
	}
	// Batch 7: telegraph emission — the renderer (another lane) drains state.telegraphs.
		pushTelegraph(...args) {
		return this.juice.pushTelegraph(...args);
	}
		updateTelegraphs(...args) {
		return this.juice.updateTelegraphs(...args);
	}
	// Batch 7: darkness as gameplay — lit if inside the player's light radius or a light source.
		isLit(...args) {
		return this.juice.isLit(...args);
	}
	// Batch 7: melee damage with enrage bonus; clones (damage 0) never touch the player.
		zombieMeleeDmg(...args) {
		return this.zombieSim.zombieMeleeDmg(...args);
	}
	// Batch 7: phased Behemoth — charge (telegraphed dash) / summon (crawlers, once) /
	// enrage (<30% HP: +35% speed, +25% damage, red tint). Phases are HP/threshold driven.
		tickBehemoth(...args) {
		return this.bossSim.tickBehemoth(...args);
	}
	// Batch 13 (Lane 1): Boss #2 — Old Ben. Three telegraphed attack patterns
	// (Tremor Slam / Briar Call / Bull Charge) plus a fury escalation below
	// 50% HP (shorter cooldowns, Tremor Slam gains a staggered second ring) —
	// the same phase pattern the Behemoth uses via bossPhase.
		tickOldBen(...args) {
		return this.bossSim.tickOldBen(...args);
	}
		benStart(...args) {
		return this.bossSim.benStart(...args);
	}
		tickBenSlam(...args) {
		return this.bossSim.tickBenSlam(...args);
	}
		benSlamStrike(...args) {
		return this.bossSim.benSlamStrike(...args);
	}
		tickBenCall(...args) {
		return this.bossSim.tickBenCall(...args);
	}
		tickBenCharge(...args) {
		return this.bossSim.tickBenCharge(...args);
	}
		benTrample(...args) {
		return this.bossSim.benTrample(...args);
	}
		benWallImpact(...args) {
		return this.bossSim.benWallImpact(...args);
	}
	// Batch 13 (Lane 1): Old Ben death — big grit shower, guaranteed boon
	// draft, boss codex entry, WJPS callout. Called from killZombie.
		oldBenDeath(...args) {
		return this.bossSim.oldBenDeath(...args);
	}
	// Batch 13 (Lane 1): mound shield aura — the boss-fight tank add shields
	// nearby non-boss adds (damage reduced by OLD_BEN_TUNING.moundShieldMul).
		moundShielding(...args) {
		return this.bossSim.moundShielding(...args);
	}
	// up to cloneCount identical 1-HP clones that deal no damage (they eat auto-fire).
		tickHaint(...args) {
		return this.bossSim.tickHaint(...args);
	}
	// Batch 10 (Lane 1): Illusionist archetype (backlog). Every cloneCooldown
	// seconds, if the player is near, the REAL illusionist spawns 2-3 clones.
	// Clones are smoke: 1 HP, zero damage, drawn half-transparent — they exist
	// to waste auto-fire. Clone counts come from the ILLUSIONIST data table.
		tickIllusionist(...args) {
		return this.bossSim.tickIllusionist(...args);
	}
	// Batch 10 (Lane 1): character signature specials. The name/desc/cooldown
	// live on each CHARACTERS row (roster.ts); the engine dispatches the
	// effect by character id. The UI lane binds triggerSignature() to the HUD
	// button + key — the contract below must stay exact.
		signatureState(...args) {
		return this.bossSim.signatureState(...args);
	}
		triggerSignature(...args) {
		return this.bossSim.triggerSignature(...args);
	}
	// Batch 10 (Lane 1): Otis's Deadeye Draw — 2s of +150% fire rate.
		signatureFireRateMul(...args) {
		return this.bossSim.signatureFireRateMul(...args);
	}
		sigDeadeye(...args) {
		return this.bossSim.sigDeadeye(...args);
	}
	// Batch 10 (Lane 1): Eula's Still Heart — 5s of 0.35x slow-mo (applied in
	// update()) plus guaranteed crits (critChance: 1 stamped in fireCurrentWeapon).
		sigStillHeart(...args) {
		return this.bossSim.sigStillHeart(...args);
	}
	// Batch 10 (Lane 1): Silas's Mash Bomb — lob a still-charge at the densest
	// nearby cluster. Detonates after a delay with AoE + scorch.
		sigMashBomb(...args) {
		return this.bossSim.sigMashBomb(...args);
	}
	// Batch 10 (Lane 1): Thea's Dragline Sweep — instant 360° chainsaw sweep,
	// hitting every zombie in radius for double the current chainsaw damage.
		sigDraglineSweep(...args) {
		return this.bossSim.sigDraglineSweep(...args);
	}
	// Batch 10 (Lane 1): densest-cluster targeting, shared by the Mortar and
	// Silas's Mash Bomb. Counts zombies within clusterRadius of each candidate.
		densestCluster(...args) {
		return this.bossSim.densestCluster(...args);
	}
	// Batch 10 (Lane 1): lobbed charges — telegraphed delayed AoE. The Mash
	// Bomb uses these; the Mortar uses its own shells (same delay pattern).
		lobCharge(...args) {
		return this.powers.lobCharge(...args);
	}
		updateLobbedCharges(...args) {
		return this.powers.updateLobbedCharges(...args);
	}
	// Batch 10 (Lane 1): shared AoE detonation for lobbed charges.
		detonateCharge(...args) {
		return this.powers.detonateCharge(...args);
	}
	// Batch 10 (Lane 1): explosion damage multiplier — brinebarrel boon
	// (Lane 4: +30%/rank) stacks on the standard per-zombie damage pipeline.
	explosionDmgMul(z) {
		return this.playerDamageMul(z, `mortar`) * brineExplosionMul(this.boon(`brinebarrel`));
	}
	// Batch 10 (Lane 4): Brine Barrel — explosions leave a burning brine patch
	// at the blast center. Reuses the fire-puddle system; brine patches carry a
	// dps field and only burn the dead (the player's own brew — no self burn).
		spawnBrinePatch(...args) {
		return this.powers.spawnBrinePatch(...args);
	}
	// Batch 10 (Lane 1): Stendal Pit Mortar — fire `cnt` shells (WEAPON_LEVELS)
	// at the densest nearby cluster. Each shell lands fuseSec later and blooms.
		fireMortar(...args) {
		return this.combat.fireMortar(...args);
	}
	// Batch 10 (Lane 1): mortar shell impact — AoE with edge falloff + scorch decal.
	// Batch 11 (Lane 1): White River Arc Lance — a sweeping beam that locks
	// onto the densest nearby cluster and deals damage ticks with a heat-glow
	// visual. The beam re-acquires the densest cluster every tick, so it
	// visibly sweeps as the horde shifts. dmg = per-tick damage, cnt = ticks
	// per trigger pull, rad = lock-on range, spd = beam half-width.
		lanceCfg(...args) {
		return this.combat.lanceCfg(...args);
	}
		fireArcLance(...args) {
		return this.combat.fireArcLance(...args);
	}
		updateArcBeams(...args) {
		return this.powers.updateArcBeams(...args);
	}
		lanceTick(...args) {
		return this.powers.lanceTick(...args);
	}
	// Batch 11: jagged heat beam — like arcSegment but orange and flagged
	// `heat` so renderLightning draws it hot instead of chain-blue.
		heatArc(...args) {
		return this.powers.heatArc(...args);
	}
		detonateMortarShell(...args) {
		return this.combat.detonateMortarShell(...args);
	}
	// Batch 10 (Lane 1): corpse permanence — fading body decals, cap ~30,
	// built on the VS-1 scorch-decal pattern (fading radial marks).
		addCorpse(...args) {
		return this.juice.addCorpse(...args);
	}
		updateCorpseDecals(...args) {
		return this.juice.updateCorpseDecals(...args);
	}
	// Batch 7: per-run state reset (run-stat muls are set by applyRunStatMods in initRunMeta).
	resetB7State() {
		this.telegraphs = [];
		this.dark = this.currentLocation.weather === `night_clear`;
		this.lastChain = { jumps: 0, hits: 0 };
		this.orbiterBlades = [];
		this.orbiterAngle = 0;
		// NOTE: run-stat multipliers are NOT reset here — applyRunStatMods()
		// divides out the previous run's multipliers before applying the new
		// ones, keeping repeated starts idempotent.
	}
	// Batch 7: run-stat mods from the meta lane; guarded so the run works without it.
	applyRunStatMods() {
		let mods = { damageMul: 1, hpMul: 1, speedMul: 1, xpMul: 1 };
		try {
			const f = (metaNS as any).getRunStatMods;
			if (typeof f === `function`) {
				const m = f();
				if (m && typeof m === `object`) mods = Object.assign(mods, m);
			}
		} catch (err) { /* defaults hold */ }
		// Idempotent across repeated starts: first divide out the previous
		// run's multipliers (the player object persists between runs), then
		// apply the current ones.
		if ((this.runHpMul || 1) !== 1) this.player.maxHealth = Math.max(1, Math.round(this.player.maxHealth / (this.runHpMul || 1)));
		if ((this.runSpeedMul || 1) !== 1) this.player.speed = this.player.speed / (this.runSpeedMul || 1);
		this.runDamageMul = mods.damageMul || 1;
		this.runHpMul = mods.hpMul || 1;
		this.runSpeedMul = mods.speedMul || 1;
		this.runXpMul = mods.xpMul || 1;
		this.player.maxHealth = Math.round(this.player.maxHealth * this.runHpMul);
		this.player.health = this.player.maxHealth;
		this.player.speed *= this.runSpeedMul;
	}
	// Batch 7: engine-owned weapon entries (constants.ts entries are another lane's).
	ensureB7Weapons() {
		const mk = (id, name, category, description, extra) => Object.assign({
			id, name, category, description,
			damage: 55, fireRate: 1.2, pellets: 1, spread: 0.02, range: 300,
			bulletSpeed: 14, magazineSize: 30, currentMag: 30,
			reserveAmmo: 90, maxReserveAmmo: 120, reloadTime: 1400, pierce: 1,
			soundType: `carbine`, unlocked: false, cost: 0, upgradeLevel: 1,
		}, extra);
		if (!this.weapons.some((w) => w.id === `chainlightning`)) {
			const c = this.chainCfg(); // def-aware; no weapon row exists yet at this point
			const def = SPECIAL_WEAPON_DEFS?.[`chainlightning`];
			this.weapons.push(mk(`chainlightning`, def?.name ?? `Patoka Arc`, `Wonder`, def?.description ?? `Lightning rod wired to a Patoka still. The arc hunts on its own.`, {
				damage: c.damage, fireRate: +(1000 / Math.max(1, c.fireIntervalMs)).toFixed(2), range: c.acquireRadius,
				magazineSize: 24, currentMag: 24, reserveAmmo: 72, maxReserveAmmo: 96,
				chainJumps: c.chainJumps, chainFalloff: c.chainFalloff, chainRadius: c.chainRadius,
			}));
		}
		if (!this.weapons.some((w) => w.id === `orbiter`)) {
			const c = this.orbiterCfg();
			const def = SPECIAL_WEAPON_DEFS?.[`orbiter`];
			this.weapons.push(mk(`orbiter`, def?.name ?? `Still-Yard Blades`, `Wonder`, def?.description ?? `Saw blades from the Winslow still-yard. They circle while carried.`, {
				damage: c.orbiterDps, fireRate: 1, range: c.orbiterRadius,
				bulletSpeed: c.orbiterSpeed, pellets: c.orbiterCount,
				magazineSize: 40, currentMag: 40, reserveAmmo: 120, maxReserveAmmo: 160,
			}));
		}
	}
		bossEntrance(...args) {
		return this.bossSim.bossEntrance(...args);
	}
		oldBenEntrance(...args) {
		return this.bossSim.oldBenEntrance(...args);
	}
		applyAffixDefense(...args) {
		return this.zombieSim.applyAffixDefense(...args);
	}
	// Batch 2: ricochet — bounce to the nearest other zombie, 25% falloff per bounce.
		tryRicochet(...args) {
		return this.combat.tryRicochet(...args);
	}
	// Batch 2: forking rounds — impact splits into spectral projectiles.
		spawnForkChildren(...args) {
		return this.combat.spawnForkChildren(...args);
	}
	renderShockwaves(e) {
		for (const s of this.shockwaves) {
			const a = Math.max(0, s.life / s.maxLife) * .55;
			e.strokeStyle = this.hexA(s.color || `#ffd666`, a);
			e.lineWidth = 5 * (s.life / s.maxLife) + 1;
			e.beginPath();
			e.arc(s.x, s.y, s.r, 0, Math.PI * 2);
			e.stroke();
			e.strokeStyle = `rgba(255, 255, 255, ${a * .5})`;
			e.lineWidth = 2;
			e.beginPath();
			e.arc(s.x, s.y, s.r * .8, 0, Math.PI * 2);
			e.stroke();
		}
	}
	// Batch 5: score_surge drop art, drawn engine-side (world space) since the
	// drop renderer has no case for the new type.
	renderSurgeDrops(e) {
		const now = Date.now();
		for (const d of this.drops) {
			if (d.type !== `score_surge`) continue;
			const bob = Math.sin(now * .006 + d.x) * 3;
			const pulse = .85 + Math.sin(now * .01 + d.y) * .15;
			// Batch 10 (Lane 1): Lane 2's tweened pickup pop-in — scale 0.1 -> 1 over 150ms.
			const pop = pickupPopScale(d.id, now);
			e.save();
			e.translate(d.x, d.y + bob);
			e.scale(pop, pop);
			e.fillStyle = `rgba(255, 215, 0, 0.35)`;
			e.beginPath();
			e.arc(0, 0, 22 * pulse, 0, Math.PI * 2);
			e.fill();
			e.fillStyle = `#d4a017`;
			e.beginPath();
			e.arc(0, 0, 12, 0, Math.PI * 2);
			e.fill();
			e.strokeStyle = `#7c5a00`;
			e.lineWidth = 2;
			e.stroke();
			e.fillStyle = `#ffffff`;
			e.font = `bold 11px monospace`;
			e.textAlign = `center`;
			e.textBaseline = `middle`;
			e.fillText(`2X`, 0, 0);
			e.restore();
		}
	}
	renderHurtDir(e, w, h) {		if (this.hurtFlash <= 0) return;
		const a = this.hurtDir, alpha = Math.min(.6, this.hurtFlash * .7);
		const cx = w / 2, cy = h / 2, r = Math.min(w, h) * .38;
		e.save();
			e.strokeStyle = `rgba(225, 29, 46, ${alpha})`;
			e.lineWidth = 14;
			e.beginPath();
			e.arc(cx + Math.cos(a) * r * .4, cy + Math.sin(a) * r * .4, r, a - .5, a + .5);
			e.stroke();
			e.restore();
	}

	// VS-3: periodic powerup drops — the county provides, on a timer.
		updatePowerupDrops(...args) {
		return this.pickupSim.updatePowerupDrops(...args);
	}
	// Batch 9 (Lane 1): dedicated score-multiplier drops — first pickup around
	// 25s, then every 25–40s. Separate from the generic 80s supply schedule.
		updateScoreMulDrops(...args) {
		return this.pickupSim.updateScoreMulDrops(...args);
	}

	// VS-3: Storm Cellar Caches — elite drops + a timed cellar door.
		updateCacheTimer(...args) {
		return this.pickupSim.updateCacheTimer(...args);
	}
		dropCacheAt(...args) {
		return this.pickupSim.dropCacheAt(...args);
	}
	// Slot-machine spin: diamond .55 / star .30 / seven .15.
		spinCache(...args) {
		return this.pickupSim.spinCache(...args);
	}
	// Batch 11 (Lane 1): the Patoka Jackpot — the second loot ritual. During
	// wave breaks the player spends grit at the machine: 150 per spin,
	// escalating +50 per spin each break (resets every wave). Graceful when
	// broke, mid-wave, or otherwise invalid — { ok: false }, never a throw.
	// `forcedReels` is a test seam; the live machine always rolls its own.
	slotSpinCost() {
		return SLOT_SPIN_BASE + SLOT_SPIN_STEP * (this.slotSpinsThisBreak || 0);
	}
		spinSlots(...args) {
		return this.pickupSim.spinSlots(...args);
	}
		resolveSlotPrize(...args) {
		return this.pickupSim.resolveSlotPrize(...args);
	}
	upgradeWeaponOnce(w) {
		if (!w || w.upgradeLevel >= WEAPON_MAX_TABLE_LEVEL) return false;
		w.upgradeLevel++;
		// Batch 4: level curves are data now — dmg/cnt/rad/spd/cd from WEAPON_LEVELS.
		const s = statsForLevel(w.id, w.upgradeLevel);
		if (s) {
			w.damage = Math.round(s.dmg * (w.evoDmgMul ?? 1));
			w.pellets = s.cnt + (w.evoPelletsAdd ?? 0);
			w.range = s.rad * (w.evoRangeMul ?? 1);
			w.bulletSpeed = s.spd * (w.evoProjSpeedMul ?? 1);
			w.fireRate = +(1 / s.cd * (w.evoFireMul ?? 1)).toFixed(2);
		} else {
			w.damage = Math.round(w.damage * 1.2);
		}
		w.magazineSize = Math.round(w.magazineSize * 1.15);
		w.currentMag = w.magazineSize;
		return true;
	}
	maxOutWeapons() {
		let n = 0;
		for (const w of this.weapons) if (w.unlocked) while (this.upgradeWeaponOnce(w)) n++;
		return n;
	}
	// Storm Cellar Cache rewards. symbols: three of seven/star/diamond.
		applyCacheResult(...args) {
		return this.pickupSim.applyCacheResult(...args);
	}
	// Double-or-nothing gamble on a cache result. Graceful on invalid input:
	// no throw, just a lost gamble (false) so the UI lane can call it freely.
	gambleWinRoll(forceWin) {
		return forceWin !== undefined ? !!forceWin : Math.random() < .5;
	}
		gambleCache(...args) {
		return this.pickupSim.gambleCache(...args);
	}
		openCache(...args) {
		return this.pickupSim.openCache(...args);
	}
		resolveCache(...args) {
		return this.pickupSim.resolveCache(...args);
	}
		gambleCacheUI(...args) {
		return this.pickupSim.gambleCacheUI(...args);
	}
		closeCache(...args) {
		return this.pickupSim.closeCache(...args);
	}
		checkCachePickup(...args) {
		return this.pickupSim.checkCachePickup(...args);
	}

	// VS-3: three-tier fusing XP gems. 3+ same-tier gems near each other fuse up.
		updateFuse(...args) {
		return this.pickupSim.updateFuse(...args);
	}
		updateDrops(...args) {
		return this.pickupSim.updateDrops(...args);
	}
	updateParticles(e) {
		for (let t = this.particles.length - 1; t >= 0; t--) {
			let n = this.particles[t];
			n.x += n.vx * e * 60, n.y += n.vy * e * 60, n.life -= e, n.alpha = Math.max(0, n.life / n.maxLife);
			if (n.life <= 0) {
				// Batch 5: blood spray particles leave persistent fading ground splats.
				if (n.type === `blood` && n.splat) this.addBloodSplat(n.x, n.y);
				this.particlePool.push(n), this.particles.splice(t, 1);
			}
		}
		if (this.particles.length > 180) for (let t = 0; t < this.particles.length - 180; t++) this.particlePool.push(this.particles[t]);
		if (this.particles.length > 180) this.particles.splice(0, this.particles.length - 180);
		// Batch 5: ground splats fade out over ~18s.
		for (let t = this.bloodSplats.length - 1; t >= 0; t--) {
			const s = this.bloodSplats[t];
			s.life -= e;
			if (s.life <= 0) this.bloodSplats.splice(t, 1);
		}
	}
		createBloodParticles(...args) {
		return this.juice.createBloodParticles(...args);
	}
		createHitSparks(...args) {
		return this.juice.createHitSparks(...args);
	}
		zombieSees(...args) {
		return this.zombieSim.zombieSees(...args);
	}
		segmentHitsCircle(...args) {
		return this.zombieSim.segmentHitsCircle(...args);
	}
		checkObstacleCollision(...args) {
		return this.zombieSim.checkObstacleCollision(...args);
	}
		smashBarricadeAt(...args) {
		return this.zombieSim.smashBarricadeAt(...args);
	}
		smashHoleAt(...args) {
		return this.zombieSim.smashHoleAt(...args);
	}
		nearestHole(...args) {
		return this.zombieSim.nearestHole(...args);
	}
		boardHole(...args) {
		return this.zombieSim.boardHole(...args);
	}
		relightLantern(...args) {
		return this.mapSim.relightLantern(...args);
	}
	snuffLantern() {
		this.lanternLit && (this.lanternLit = false, this.lanternWentOut = true, this.trauma = Math.min(1, this.trauma + .35 * this.tune('shake') * this.motionScale()), soundEngine.playSnuff(), this.spawnFloater(this.currentLocation.lantern.x, this.currentLocation.lantern.y - 24, `LANTERN OUT`, `#c23b22`), this.callbacks.onRadio?.(`Unknown`, `The lantern's gone. Cellar holes are coughing. They know the Trace.`));
	}
		updateLantern(...args) {
		return this.mapSim.updateLantern(...args);
	}
		updateBellHold(...args) {
		return this.mapSim.updateBellHold(...args);
	}
		ringBell(...args) {
		return this.mapSim.ringBell(...args);
	}
		weaponHearRadius(...args) {
		return this.mapSim.weaponHearRadius(...args);
	}
		updateNoisePulses(...args) {
		return this.mapSim.updateNoisePulses(...args);
	}
		alertZombies(...args) {
		return this.mapSim.alertZombies(...args);
	}
		emitNoise(...args) {
		return this.mapSim.emitNoise(...args);
	}
	// Group 1: ghost personalities — per-type targeting rule. Returns [tx, ty, blend]
	// where blend 0 = pure flow-field pathing, 1 = direct steering to target.
		nearestObjective(...args) {
		return this.mapSim.nearestObjective(...args);
	}
		personalityTarget(...args) {
		return this.zombieSim.personalityTarget(...args);
	}
	// Batch 6 (Lane A): spitter ranged behavior — jittered cooldown, lead + noise aim.
	// Readable, not aimbot-perfect: the spit leads the player a touch, then wanders.
		tickSpitter(...args) {
		return this.zombieSim.tickSpitter(...args);
	}
	// Batch 6 (Lane A): bomber formal spec — fuseRange starts the fuse, fuseTime burns
	// it down with an accelerating beep; expiry detonates via killZombie (blast uses
	// b6blastR / b6blastDmg with the existing falloff). Returns false if the bomber died.
		tickFuse(...args) {
		return this.zombieSim.tickFuse(...args);
	}
	// Batch 6 (Lane A): structure-chewing as a utility decision. Zombies weigh chewing
	// boards / turrets / barricades against chasing the player: a per-type bias times
	// structure value over distance, versus player proximity (doubled when the zombie
	// was recently shot). Defense becomes a resource, not a coin flip.
		tickChew(...args) {
		return this.zombieSim.tickChew(...args);
	}
		chewAttack(...args) {
		return this.zombieSim.chewAttack(...args);
	}
		damagePostAt(...args) {
		return this.zombieSim.damagePostAt(...args);
	}
	// Batch 6 (Lane A): off-screen objectives — zombies with no player stimulus drift
	// toward open holes, shrines, and the workbench so the map edges stay alive.
		tickDrift(...args) {
		return this.zombieSim.tickDrift(...args);
	}
	// Group 1: spatial hash broadphase for zombie queries
		rebuildZombieHash(...args) {
		return this.zombieSim.rebuildZombieHash(...args);
	}
		queryZombies(...args) {
		return this.zombieSim.queryZombies(...args);
	}
	// Group 1: dynamic point lights
		addLight(...args) {
		return this.juice.addLight(...args);
	}
		updateDynLights(...args) {
		return this.juice.updateDynLights(...args);
	}
	// Group 1: object pools
		allocParticle(...args) {
		return this.juice.allocParticle(...args);
	}
		allocBullet(...args) {
		return this.juice.allocBullet(...args);
	}
		freeBulletAt(...args) {
		return this.juice.freeBulletAt(...args);
	}
		spawnFloater(...args) {
		return this.juice.spawnFloater(...args);
	}
		boon(...args) {
		return this.pickupSim.boon(...args);
	}
		offerDraft(...args) {
		return this.pickupSim.offerDraft(...args);
	}
	// Batch 3: draft exclusions — banished + locked-out boons.
		draftExclusions(...args) {
		return this.pickupSim.draftExclusions(...args);
	}
	// Batch 2: breakpoint bonuses — the 6th rank of a boon pays out big, once.
		checkBreakpoint(...args) {
		return this.pickupSim.checkBreakpoint(...args);
	}
		takeBoon(...args) {
		return this.pickupSim.takeBoon(...args);
	}
		rerollDraft(...args) {
		return this.pickupSim.rerollDraft(...args);
	}
		xpToNext(...args) {
		return this.pickupSim.xpToNext(...args);
	}
		gritValue(...args) {
		return this.pickupSim.gritValue(...args);
	}
		dropGritOrb(...args) {
		return this.pickupSim.dropGritOrb(...args);
	}
		spawnGrit(...args) {
		return this.pickupSim.spawnGrit(...args);
	}
		sweepGritToBag(...args) {
		return this.pickupSim.sweepGritToBag(...args);
	}
	openQueuedDraft() {
		if (this.grit.length) this.wantVacuum = true;
		this.queuedLevels--;
		this.draftGraceUntil = 0;
		this.levelHold = true;
		this.isPaused = true;
		soundEngine.playLevel();
		this.spawnFloater(this.player.x, this.player.y - 56, `LEVEL ${this.level}`, "#f6c453");
		this.offerDraft();
	}
		addXp(...args) {
		return this.pickupSim.addXp(...args);
	}
		updateGrit(...args) {
		return this.pickupSim.updateGrit(...args);
	}
		openChest(...args) {
		return this.pickupSim.openChest(...args);
	}
	getPerkLevel(e) {
		let t = this.perks.find((t) => t.id === e);
		return t ? t.level : 0;
	}
	renderGrit(e) {
		const { camL, camT, camR, camB } = this.viewCull(48);
		const rad = Math.max(6, 12 / this.viewZoom());
		const nowMs = Date.now();
		for (const g of this.grit) {
			if (g.x < camL || g.x > camR || g.y < camT || g.y > camB) continue;
			const tier = g.tier || 1;
			// Batch 10 (Lane 1): Lane 2's tweened pickup pop-in — scale 0.1 -> 1 over 150ms.
			const pop = pickupPopScale(g.id, nowMs);
			if (g.lucky || tier >= 3) {
				e.fillStyle = tier >= 3 ? "rgba(255, 140, 40, 0.3)" : "rgba(255, 215, 0, 0.25)";
				e.beginPath();
				e.arc(g.x, g.y, rad * (tier >= 3 ? 3 : 2.4) * pop, 0, Math.PI * 2);
				e.fill();
			}
			e.fillStyle = g.lucky ? "#ffd700" : tier === 3 ? "#ff9a3c" : tier === 2 ? "#ffe066" : "#f6c453";
			e.beginPath();
			e.arc(g.x, g.y, (g.lucky ? rad * 1.6 : rad) * (1 + (tier - 1) * .35) * pop, 0, Math.PI * 2);
			e.fill();
		}
		for (const c of this.chests) {
			e.save();
			e.translate(c.x, c.y);
			e.fillStyle = "#6b5428";
			e.fillRect(-12, -9, 24, 18);
			e.fillStyle = "#d4a017";
			e.fillRect(-12, -2, 24, 4);
			e.restore();
		}
		// VS-3: Storm Cellar Caches — purple-hazed cellar doors.
		for (const c of this.caches) {
			const pulse = .5 + .5 * Math.sin(this.simTime * 4);
			e.save();
			e.translate(c.x, c.y);
			e.fillStyle = `rgba(199, 125, 255, ${.18 + pulse * .12})`;
			e.beginPath();
			e.arc(0, 0, 26, 0, Math.PI * 2);
			e.fill();
			e.fillStyle = "#3d2a55";
			e.fillRect(-13, -10, 26, 20);
			e.strokeStyle = "#c77dff";
			e.lineWidth = 2;
			e.strokeRect(-13, -10, 26, 20);
			e.fillStyle = "#c77dff";
			e.font = `bold 10px "IBM Plex Mono", monospace`;
			e.textAlign = "center";
			e.textBaseline = "middle";
			e.fillText("7", 0, 1);
			e.restore();
		}
		for (const s of this.shrines) {
			e.save();
			e.translate(s.x, s.y);
			const pulse = s.attuned ? 0 : .5 + .5 * Math.sin(this.simTime * 3);
			e.strokeStyle = s.attuned ? "#d4a017" : `rgba(212, 160, 23, ${.35 + .3 * pulse})`;
			e.lineWidth = 2;
			e.beginPath();
			e.arc(0, 0, 16, 0, Math.PI * 2);
			e.stroke();
			e.fillStyle = s.attuned ? "#d4a017" : "#4a4238";
				e.beginPath();
				e.moveTo(0, -10);
			e.lineTo(7, 6);
			e.lineTo(-7, 6);
			e.closePath();
			e.fill();
			e.restore();
		}
	}
	renderHoles(e) {
		for (let t of this.holes) e.save(), e.translate(t.x, t.y), e.fillStyle = `rgba(8, 6, 4, 0.92)`, e.beginPath(), e.ellipse(0, 0, t.radius, t.radius * .72, 0, 0, Math.PI * 2), e.fill(), e.strokeStyle = t.kind === `pit` ? `#3a3228` : `#2a2118`, e.lineWidth = 3, e.stroke(), t.boarded ? (e.fillStyle = `#5c4630`, e.fillRect(-t.radius * .7, -6, t.radius * 1.4, 12), e.strokeStyle = `#3a3228`, e.lineWidth = 1, e.beginPath(), e.moveTo(-t.radius * .5, -6), e.lineTo(-t.radius * .5, 6), e.moveTo(0, -6), e.lineTo(0, 6), e.moveTo(t.radius * .5, -6), e.lineTo(t.radius * .5, 6), e.stroke()) : (e.fillStyle = `rgba(194, 59, 34, 0.55)`, e.beginPath(), e.ellipse(0, 2, t.radius * .55, t.radius * .34, 0, 0, Math.PI * 2), e.fill()), e.restore();
	}
	renderLantern(e) {
		let t = this.currentLocation.lantern;
		t && (e.save(), e.translate(t.x, t.y), e.fillStyle = `#2a2118`, e.fillRect(-6, -4, 12, 16), e.fillStyle = this.lanternLit ? `#d4a017` : `#3a3228`, e.beginPath(), e.arc(0, -8, 7, 0, Math.PI * 2), e.fill(), this.lanternLit && (e.globalAlpha = .35 + Math.sin(this.simTime * 6) * .08, e.fillStyle = `#fde68a`, e.beginPath(), e.arc(0, -8, 22, 0, Math.PI * 2), e.fill()), e.restore());
	}
	renderBell(e) {
		let t = this.currentLocation.bell;
		t && (e.save(), e.translate(t.x, t.y), e.fillStyle = this.bellReady ? `#d4a017` : `#5c5346`, e.beginPath(), e.moveTo(-12, -8), e.lineTo(12, -8), e.lineTo(9, 10), e.lineTo(-9, 10), e.closePath(), e.fill(), e.fillStyle = `#2a2118`, e.fillRect(-3, 10, 6, 8), e.beginPath(), e.arc(0, 18, 3, 0, Math.PI * 2), e.fill(), this.bellReady && !this.bellRung && (e.globalAlpha = .35 + Math.sin(this.simTime * 4) * .15, e.strokeStyle = `#d4a017`, e.lineWidth = 2, e.beginPath(), e.arc(0, 0, 28, 0, Math.PI * 2), e.stroke()), e.restore());
	}
	renderNoisePulses(e) {
		for (let t of this.noisePulses) {
			let n = Math.max(0, t.life / t.maxLife);
			e.save(), e.globalAlpha = n * .72, e.strokeStyle = `#d4a017`, e.lineWidth = 2.4, e.beginPath(), e.arc(t.x, t.y, Math.max(4, t.radius), 0, Math.PI * 2), e.stroke(), e.globalAlpha = n * .28, e.lineWidth = 6, e.beginPath(), e.arc(t.x, t.y, Math.max(4, t.radius * .86), 0, Math.PI * 2), e.stroke(), e.restore();
		}
	}
	renderHoleMarkers(e) {
		for (let t of this.holes) {
			let n = Math.hypot(this.player.x - t.x, this.player.y - t.y);
			e.save(), e.translate(t.x, t.y), t.boarded ? n < 200 && (e.globalAlpha = .85, e.fillStyle = `#d4a017`, e.font = `bold 10px "IBM Plex Mono", monospace`, e.textAlign = `center`, e.fillText(`BOARDED`, 0, -t.radius - 8)) : (e.globalAlpha = .45 + Math.sin(this.simTime * 5) * .18, e.strokeStyle = `#c23b22`, e.lineWidth = 2, e.beginPath(), e.ellipse(0, 0, t.radius + 8, t.radius * .72 + 6, 0, 0, Math.PI * 2), e.stroke(), n < 260 && (e.globalAlpha = .95, e.fillStyle = `#c23b22`, e.font = `bold 11px "IBM Plex Mono", monospace`, e.textAlign = `center`, e.fillText(t.kind === `pit` ? `PIT` : `CELLAR`, 0, -t.radius - 10))), e.restore();
		}
	}
	viewZoom() {
		const pad = 80;
		const zx = this.canvas.width / (this.currentLocation.mapWidth + pad);
		const zy = this.canvas.height / (this.currentLocation.mapHeight + pad);
		return Math.min(0.58, Math.max(0.36, Math.min(zx, zy)));
	}
	viewSize() {
		const z = this.viewZoom();
		return { z, w: this.canvas.width / z, h: this.canvas.height / z };
	}
		screenToWorld(...args) {
		return this.playerSim.screenToWorld(...args);
	}
	worldToScreen(wx, wy) {
		const { z } = this.viewSize();
		return {
			x: this.canvas.width / 2 + (wx - this.camX) * z,
			y: this.canvas.height / 2 + (wy - this.camY) * z
		};
	}
	figureScale() {
		return Math.min(1.85, Math.max(1, 0.62 / this.viewZoom()));
	}
	aimReach() {
		const { w, h } = this.viewSize();
		return Math.max(720, Math.hypot(w, h) * 0.62);
	}
	viewCull(pad) {
		const { w, h } = this.viewSize();
		const camL = this.camX - w / 2 - pad;
		const camT = this.camY - h / 2 - pad;
		return { camL, camT, camR: camL + w + pad * 2, camB: camT + h + pad * 2 };
	}
	mapInView() {
		const { w, h } = this.viewSize();
		return w >= this.currentLocation.mapWidth * 0.9 && h >= this.currentLocation.mapHeight * 0.9;
	}
	render() {
		let e = this.ctx, t = this.canvas.width, n = this.canvas.height;
		this._renderDt = Math.min(.1, Math.max(1 / 1000, (performance.now() - (this._lastRenderNow || performance.now())) / 1000)); // Batch 8 (Lane B): render-frame delta for render-side timers.
		this._lastRenderNow = performance.now();
		const zoom = render7.zoom.update(this.zombies, this.player.x, this.player.y, this.lastDt || 1 / 60, this.viewZoom(), this.motionScale()) * (1 + this.zoomPunch); // Batch 7: dynamic zoom by horde density; VS-3: kill zoom punch
		const viewW = t / zoom, viewH = n / zoom;
		const mapW = this.currentLocation.mapWidth, mapH = this.currentLocation.mapHeight;
		// Batch 7: camera rig — 24px deadzone, velocity/aim lookahead, 0.10 lerp; map-bounds clamp preserved.
		const rdt = Math.max(1 / 240, this.lastDt || 1 / 60);
		let pvx = (this.player.x - (this.lastPx ?? this.player.x)) / rdt, pvy = (this.player.y - (this.lastPy ?? this.player.y)) / rdt;
		const pspd = Math.hypot(pvx, pvy);
		if (pspd > 1200) { pvx *= 1200 / pspd; pvy *= 1200 / pspd; }
		this.lastPx = this.player.x; this.lastPy = this.player.y;
		if (!this.r7camInit) { render7.camera.snap(this.camX, this.camY); this.r7camInit = true; }
		render7.camera.update(this.player.x, this.player.y, pvx, pvy, Math.cos(this.player.angle), Math.sin(this.player.angle));
		if (viewW >= mapW) this.camX = mapW / 2;
		else this.camX = Math.max(viewW / 2, Math.min(mapW - viewW / 2, render7.camera.x));
		if (viewH >= mapH) this.camY = mapH / 2;
		else this.camY = Math.max(viewH / 2, Math.min(mapH - viewH / 2, render7.camera.y));
		e.save(), e.clearRect(0, 0, t, n);
		e.fillStyle = `#070806`;
		e.fillRect(0, 0, t, n);
		let shake = this.trauma * this.trauma * 10 + this.screenShake * .55, sx = (Math.random() - .5) * shake, sy = (Math.random() - .5) * shake;
		e.translate(sx, sy);
		const beginWorld = () => {
			e.save();
			e.translate(t / 2, n / 2);
			e.scale(zoom, zoom);
			// Batch 5: camera punch decays over its 60ms window.
			const pf = this.camPunchT > 0 ? this.camPunchT / .06 : 0;
			e.translate(-this.camX + this.camKickX + this.camPunchX * pf, -this.camY + this.camKickY + this.camPunchY * pf); // VS-3: camera kick
		};
		let l = this.camX - viewW / 2, u = this.camY - viewH / 2;
		let d = { x: l, y: u, width: viewW, height: viewH };
		beginWorld();
		renderEnvironment(e, this.currentLocation, d, this.bloodDecals, this.firePuddles, this.drops, this.explosiveBarrels, this.loreNotes, this.barricades, this.extractActive, zoom);
		this.renderSurgeDrops(e); // Batch 5: score_surge drop art (world space)
		// VS-1: scorch decals — dark radial burns that fade.
		for (const s of this.scorchDecals) {
			const g = e.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.radius);
			g.addColorStop(0, `rgba(12, 8, 6, ${s.alpha})`);
			g.addColorStop(1, `rgba(12, 8, 6, 0)`);
			e.fillStyle = g;
			e.beginPath();
			e.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
			e.fill();
		}
		// Batch 10 (Lane 1): corpse permanence — dark fading body marks, same fade discipline as scorch.
		for (const c of this.corpseDecals) {
			const g = e.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.radius);
			g.addColorStop(0, `rgba(60, 12, 14, ${c.alpha})`);
			g.addColorStop(1, `rgba(60, 12, 14, 0)`);
			e.fillStyle = g;
			e.beginPath();
			e.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
			e.fill();
		}
		this.renderHoles(e), this.renderLantern(e), this.renderBell(e), this.renderParticles(e);
		this.renderShockwaves(e); // VS-3: kill shockwaves
		// Batch 7: enemy telegraphs (engine stores sim-seconds; renderer takes ms) + celebration particles.
		if (this.telegraphs.length) {
			const nowMs = this.simTime * 1000;
			renderTelegraphs(e, this.telegraphs.map((tg) => ({ kind: tg.kind, x: tg.x, y: tg.y, r: tg.r, t0: tg.t0 * 1000, dur: tg.dur * 1000 })), nowMs, this.player);
		}
		// Batch 10 (Lane 1): lobbed charges (Mash Bomb) — pulsing target ring that tightens as the fuse burns.
		for (const c of this.lobbedCharges) {
			const prog = 1 - Math.max(0, c.t) / Math.max(.001, c.max);
			const pulse = .5 + .5 * Math.sin(this.simTime * 14);
			e.strokeStyle = `rgba(249, 115, 22, ${(.4 + .5 * prog * pulse).toFixed(2)})`;
			e.lineWidth = 3;
			e.beginPath();
			e.arc(c.x, c.y, Math.max(6, c.radius * (1 - prog * .35)), 0, Math.PI * 2);
			e.stroke();
			e.fillStyle = `rgba(249, 115, 22, ${(.25 * pulse).toFixed(2)})`;
			e.beginPath();
			e.arc(c.x, c.y, 8, 0, Math.PI * 2);
			e.fill();
		}
		render7.celebration.renderWorld(e, performance.now());
		this.renderSlashBursts(e); // Batch 5: oriented slash streaks
		this.paintFloaters(e, zoom);
		e.restore();
		// Batch 5: screen-space hit flashes — brief radial white blooms at kill positions.
		for (const f of this.hitFlashes) {
			const s = this.worldToScreen(f.x, f.y);
			const fa = Math.max(0, f.life / f.maxLife) * .45 * this.flashScale();
			const g = e.createRadialGradient(s.x, s.y, 0, s.x, s.y, 130);
			g.addColorStop(0, `rgba(255, 255, 255, ${fa.toFixed(3)})`);
			g.addColorStop(1, `rgba(255, 255, 255, 0)`);
			e.fillStyle = g;
			e.fillRect(s.x - 130, s.y - 130, 260, 260);
		}
		const beam = this.player.flashlightRange * (1 + this.getPerkLevel(`highbeam`) * .25 + this.boon(`beam`) * .12);
		const pxy = this.worldToScreen(this.player.x, this.player.y);
		let f = {
			x: pxy.x,
			y: pxy.y,
			angle: this.player.angle,
			flashlightAngle: this.player.flashlightAngle,
			flashlightRange: Math.max(140, beam * zoom)
		};
		let p = this.firePuddles.map((fire) => {
			const xy = this.worldToScreen(fire.x, fire.y);
			return { ...fire, x: xy.x, y: xy.y, radius: fire.radius * zoom };
		});
		let m = (this.currentLocation.lights || []).filter((light) => {
			let lantern = this.currentLocation.lantern;
			return lantern && Math.hypot(light.x - lantern.x, light.y - lantern.y) < 90 ? this.lanternLit : true;
		}).map((light) => {
			const xy = this.worldToScreen(light.x, light.y);
			return { x: xy.x, y: xy.y, radius: light.radius * zoom, intensity: light.intensity };
		});
		if (this.currentLocation.lantern && this.lanternLit) {
			const xy = this.worldToScreen(this.currentLocation.lantern.x, this.currentLocation.lantern.y);
			m.push({ x: xy.x, y: xy.y, radius: 170 * zoom, intensity: .95 });
		}
		for (let hole of this.holes) if (!hole.boarded) {
			const xy = this.worldToScreen(hole.x, hole.y);
			m.push({ x: xy.x, y: xy.y, radius: (hole.kind === `pit` ? 70 : 58) * zoom, intensity: .42 });
		}
		for (const fl of this.flares) {
			const xy = this.worldToScreen(fl.x, fl.y);
			m.push({ x: xy.x, y: xy.y, radius: 210 * zoom, intensity: .9 });
		}
		for (const dl of this.dynLights) {
			const xy = this.worldToScreen(dl.x, dl.y);
			if (xy.x < -dl.radius || xy.y < -dl.radius || xy.x > t + dl.radius || xy.y > n + dl.radius) continue;
			m.push({ x: xy.x, y: xy.y, radius: dl.radius * zoom, intensity: dl.intensity });
		}
		const bloodMoon = this.activeEvents.some((a) => a.id === `blood_moon`);
		// Batch 6 (Lane B): per-map + per-event ambient; event overrides map.
		this.lighting.setAmbient(this.currentLocation.id, bloodMoon ? `blood_moon` : this.activeEvents.some((a) => a.id === `golden_swarm`) ? `golden_swarm` : undefined);
		this.lighting.renderLighting(e, t, n, f, this.muzzleFlashTimer, this.currentLocation.ambientLight, p, m, bloodMoon);
		// Batch 7: darkness radial overlay tied to player light radius; celebration gold flash + banner pop.
		this.lighting.renderDarkness(e, t, n, pxy.x, pxy.y, this.player.lightRadius ?? 220, !!this.dark, performance.now());
		render7.celebration.renderScreen(e, t, n, performance.now());
		if (this.bloodRush > 0 || this.invuln > 1.2 && this.lastStandUsed) {
			e.save();
			e.fillStyle = this.bloodRush > 0 ? "rgba(140, 18, 24, 0.12)" : "rgba(194, 59, 34, 0.14)";
			e.fillRect(0, 0, t, n);
			e.restore();
		}
		if (this.fogUntil > 0) {
			e.save();
			e.fillStyle = `rgba(28, 32, 30, ${.08 + Math.sin(this.simTime) * .02})`;
			e.fillRect(0, 0, t, n);
			e.restore();
		}
		if (this.player.health < this.player.maxHealth * .3 && this.player.health > 0) {
			e.save();
			const pulse = .12 + Math.sin(this.simTime * 6) * .05;
			const vg = e.createRadialGradient(t / 2, n / 2, Math.min(t, n) * .32, t / 2, n / 2, Math.max(t, n) * .72);
			vg.addColorStop(0, "rgba(140,18,24,0)");
			vg.addColorStop(1, `rgba(140,18,24,${pulse.toFixed(3)})`);
			e.fillStyle = vg;
			e.fillRect(0, 0, t, n);
			e.restore();
		}
		beginWorld();
		this.renderZombies(e), this.renderProjectiles(e), this.renderGrit(e), this.renderTraps(e), this.renderPlayer(e), this.renderLightning(e), this.renderSalt(e), this.renderAura(e), this.renderNova(e), this.renderVacuumDrops(e), this.renderRig(e), this.renderNoisePulses(e), this.renderFlares(e), this.renderHoleMarkers(e), this.renderLantern(e), this.renderBell(e), this.renderZombieLabels(e), this.renderBanner(e);
		this.paintFloaters(e, zoom);
		e.restore();
		if (this.interactHint) {
			e.save();
			const hint = this.worldToScreen(this.player.x, this.player.y);
			let r = hint.x, i = hint.y - 54;
			e.fillStyle = `rgba(12, 11, 9, 0.88)`, e.strokeStyle = `#d4a017`, e.lineWidth = 1.5;
			let a = Math.min(320, 24 + this.interactHint.length * 7.2), boxH = this.bellHold > 0 && this.bellReady ? 42 : 32;
			e.beginPath(), e.roundRect(r - a / 2, i - boxH / 2, a, boxH, 6), e.fill(), e.stroke(), e.fillStyle = `#d4a017`, e.font = `bold 12px "IBM Plex Mono", monospace`, e.textAlign = `center`, e.textBaseline = `middle`, e.fillText(this.interactHint, r, this.bellHold > 0 && this.bellReady ? i - 6 : i), this.bellHold > 0 && this.bellReady && (e.fillStyle = `#3a3228`, e.fillRect(r - 70, i + 8, 140, 4), e.fillStyle = `#d4a017`, e.fillRect(r - 70, i + 8, 140 * Math.min(1, this.bellHold / 2.2), 4)), e.restore();
		}
		if (t >= 820 && n >= 520 && !this.mapInView()) {
			this.renderCompass(e, t, n);
			// Batch 10 (Lane 2): engine-drawn minimap retired — the React
			// <Minimap/> corner component (HUD) is the minimap now.
		}
		this.renderHurtDir(e, t, n); // VS-3: directional hurt feedback
		this.renderEyeshine(e, l, u);
		this.renderDeathFlash(e); // Batch 8 (Lane B): death white flash, topmost.
		e.restore();
	}
	paintFloaters(e, zoom) {
		const px = (n) => Math.max(12, Math.round(n / zoom));
		for (let t of this.floaters) {
			e.save();
			e.globalAlpha = Math.max(0, t.life / t.maxLife);
			const wild = t.color === "#e11d2e" || t.text === "HEAD" || /^\d+$/.test(t.text);
			e.font = wild ? t.text === "HEAD" ? `${px(22)}px Creepster, Nosifer, Impact, cursive` : `${px(16)}px Creepster, Nosifer, Impact, cursive` : `bold ${px(14)}px "IBM Plex Mono", monospace`;
			e.textAlign = "center";
			if (wild) {
				e.strokeStyle = "#1a0404";
				e.lineWidth = Math.max(3, px(14) * 0.18);
				e.strokeText(t.text, t.x, t.y);
			}
			e.fillStyle = t.color;
			e.fillText(t.text, t.x, t.y);
			e.restore();
		}
	}
	renderRig(e) {
		if (!this.rig) return;
		const live = this.simTime < this.rig.until;
		e.save();
		e.translate(this.rig.x, this.rig.y);
		e.fillStyle = "rgba(0,0,0,0.45)";
		e.beginPath();
		e.ellipse(0, 8, 16, 6, 0, 0, Math.PI * 2);
		e.fill();
		e.strokeStyle = this.rigArmed ? "#6b5428" : "#3a3228";
		e.lineWidth = 3;
		e.beginPath();
		e.moveTo(-10, 6);
		e.lineTo(0, -2);
		e.lineTo(10, 6);
		e.stroke();
		e.save();
		e.rotate(this.rig.angle || 0);
		e.fillStyle = live ? "#d4a017" : this.rigArmed ? "#78716c" : "#44403c";
		e.fillRect(0, -3, 22, 6);
		if (live) {
			e.fillStyle = "#fde68a";
			e.beginPath();
			e.arc(24, 0, 4, 0, Math.PI * 2);
			e.fill();
		}
		e.restore();
		e.fillStyle = this.rigArmed ? "#d4a017" : "#8a8175";
		e.font = `bold 10px "IBM Plex Mono", monospace`;
		e.textAlign = "center";
		e.fillText(this.rig.name.toUpperCase(), 0, -18);
		e.restore();
		if (this.beacon && !this.beacon.done) {
		e.save();
		e.translate(this.beacon.x, this.beacon.y);
		e.strokeStyle = "#d4a017";
		e.lineWidth = 2;
		e.beginPath();
		e.arc(0, 0, 28, 0, Math.PI * 2);
		e.stroke();
		e.beginPath();
		e.arc(0, 0, 28, -Math.PI / 2, -Math.PI / 2 + Math.min(1, this.beacon.hold / 2) * Math.PI * 2);
		e.strokeStyle = "#fde68a";
		e.lineWidth = 4;
		e.stroke();
		e.fillStyle = "#d4a017";
		e.font = `bold 10px "IBM Plex Mono", monospace`;
		e.textAlign = "center";
		e.fillText("SUPPLY", 0, -36);
		e.restore();
		}
		if (this.jars) {
			for (const j of this.jars) {
				e.save();
				e.translate(j.x, j.y);
				e.fillStyle = "#b45309";
				e.fillRect(-5, -8, 10, 14);
				e.fillStyle = "#fde68a";
				e.fillRect(-4, -12, 8, 4);
				e.restore();
			}
		}
		if (this.orbitPts) {
			for (const p of this.orbitPts) {
				e.save();
				e.translate(p.x, p.y);
				e.rotate(p.a);
				e.fillStyle = "#f6c453";
				e.fillRect(-7, -2, 14, 4);
				e.restore();
			}
		}
		// Batch 7 (Lane 1): Still-Yard Blades render while the weapon is equipped.
		if (this.orbiterBlades && this.orbiterBlades.length) {
			for (const b of this.orbiterBlades) {
				e.save();
				e.translate(b.x, b.y);
				e.rotate(b.a);
				e.fillStyle = "#7dd3fc";
				e.fillRect(-9, -3, 18, 6);
				e.fillStyle = "#e0f2fe";
				e.fillRect(-9, -1, 18, 2);
				e.restore();
			}
		}
	}
	renderPlayer(e) {
		const facing = this.bodyFacingSmooth >= 0 ? 1 : -1;
		const moving = this.lastMoveSpeed > .35;
		const phase = this.walkPhase;
		const fs = this.figureScale();
		const body = this.player.radius * 5.6 * fs;
		const bob = moving ? Math.abs(Math.sin(phase)) * 3.4 * fs : Math.sin(this.simTime * 2.05 + this.player.bobPhase) * 2.5 * fs * this.motionScale(); // Batch 8 (Lane B): idle bob ~2.5px, reduce-motion aware.
		this._lastPlayerBob = bob; // Batch 8 (Lane B): test probe.
		const stride = moving ? Math.sin(phase) * 3.2 * facing : 0;
		const lean = moving ? Math.sin(phase) * .07 + this.moveVX * .012 : 0;
		for (const g of this.afterimages) {
			e.save();
			e.globalAlpha = Math.max(0, g.life / g.maxLife) * .38;
			e.translate(g.x, g.y);
			e.scale(g.facing >= 0 ? 1 : -1, 1);
			drawSprite(e, "player", body, 0, false);
			e.restore();
		}
		e.save();
		e.translate(this.player.x, this.player.y);
		e.strokeStyle = "rgba(246, 196, 83, 0.95)";
		e.lineWidth = 2.6 / this.viewZoom();
		e.beginPath();
		e.arc(0, 10, this.player.radius * 1.15 * fs, 0, Math.PI * 2);
		e.stroke();
		// Batch 6 (Lane B): pooled baked blob shadow.
		drawBlobShadow(e, stride * .25, 16, 14 + this.lastMoveSpeed * .3);
		e.save();
		e.translate(stride * .35, -bob);
		e.rotate(lean);
		// Batch 8 (Lane B): bash squash-and-stretch — 50ms pulse set in tryBash, decayed here in render.
		let psx = 1, psy = 1;
		if (this.player.atkT > 0) {
			const ap = Math.max(0, this.player.atkT / .05); // 1 → 0
			psx = 1 + .22 * ap; psy = 1 - .14 * ap; // peak ~1.22x stretch along facing
			this.player.atkT = Math.max(0, this.player.atkT - this._renderDt);
		}
		// Batch 8 (Lane B): latch the peak — a 50ms beat can fall between test polls.
		if (psx > this._lastPlayerPulse.sx) this._lastPlayerPulse = { sx: psx, sy: psy };
		e.scale(facing * psx, psy);
		drawSprite(e, "player", body, 0, false);
		e.restore();
		e.save();
		e.translate(facing * 10, -bob * .2 + 6);
		e.rotate(this.player.angle);
		e.scale(1.7 * fs, 1.7 * fs);
		e.translate(-this.gunKick, 0); // Batch 5: gun kickback 4-6px, 40ms yoyo
		this.drawHeldWeapon(e);
		e.restore();
		// Batch 5: additive muzzle flash ~50ms, drawn 'lighter' at the muzzle.
		if (this.muzzlePunch > 0) {
			e.save();
			e.translate(facing * 10, -bob * .2 + 6);
			e.rotate(this.player.angle);
			e.scale(1.7 * fs, 1.7 * fs);
			e.globalCompositeOperation = `lighter`;
			const mp = this.muzzlePunch / .05;
			e.fillStyle = `rgba(255, 240, 180, ${(0.9 * mp).toFixed(3)})`;
			const mx = 44;
			e.beginPath();
			e.moveTo(mx - 4, 0);
			e.lineTo(mx + 14, -9);
			e.lineTo(mx + 8, 0);
			e.lineTo(mx + 14, 9);
			e.closePath();
			e.fill();
			e.restore();
		}
		if (this.bashSwing > 0) {
			e.save();
			e.rotate(this.player.angle);
			e.strokeStyle = `rgba(212, 160, 23, ${this.bashSwing / .2})`;
			e.lineWidth = 5;
			e.beginPath();
			e.arc(4, 0, 50, -.85, .85);
			e.stroke();
			e.restore();
		}
		e.restore();
	}
	drawHeldWeapon(e) {
		const id = this.weapons[this.currentWeaponIndex].id;
		const rec = this.recoilKick;
		e.translate(-rec * .55, 0);
		if (id === "revolver") {
			e.fillStyle = "#6b3a18";
			e.beginPath();
			e.moveTo(2, -3);
			e.lineTo(12, -4);
			e.lineTo(12, 8);
			e.lineTo(0, 10);
			e.closePath();
			e.fill();
			e.fillStyle = "#b45309";
			e.beginPath();
			e.arc(14, 0, 6, 0, Math.PI * 2);
			e.fill();
			e.fillStyle = "#292524";
			e.fillRect(18, -2.4, 20, 4.8);
			e.fillStyle = "#78716c";
			e.fillRect(36, -3, 4, 6);
		} else if (id === "shotgun") {
			e.fillStyle = "#5c3a1e";
			e.fillRect(2, -6, 18, 12);
			e.fillStyle = "#44403c";
			e.fillRect(16 + this.pumpAnim * .6, -7, 14, 14);
			e.fillStyle = "#1c1917";
			e.fillRect(22, -4.5, 38, 9);
			e.fillStyle = "#78716c";
			e.fillRect(58, -5.5, 6, 11);
			e.fillStyle = "#a8a29e";
			e.fillRect(22, -6.5, 28, 2);
		} else if (id === "lever_rifle") {
			e.fillStyle = "#7c4a1e";
			e.fillRect(0, -4, 16, 10);
			e.fillStyle = "#1c1917";
			e.fillRect(14, -2.2, 44, 4.4);
			e.strokeStyle = "#a8a29e";
			e.lineWidth = 2;
			e.beginPath();
			e.ellipse(18, 8, 8, 5, 0, 0, Math.PI);
			e.stroke();
			e.fillStyle = "#78716c";
			e.fillRect(56, -3, 5, 6);
		} else if (id === "carbine") {
			e.fillStyle = "#3f3f46";
			e.fillRect(2, -4, 14, 10);
			e.fillStyle = "#18181b";
			e.fillRect(14, -2, 34, 4);
			e.fillStyle = "#27272a";
			e.fillRect(16, 2, 8, 10);
			e.fillStyle = "#52525b";
			e.fillRect(46, -3, 4, 6);
		} else if (id === "crossbow") {
			e.fillStyle = "#5c3a1e";
			e.fillRect(4, -3, 22, 6);
			e.strokeStyle = "#d6d3d1";
			e.lineWidth = 3;
			e.beginPath();
			e.moveTo(20, -16);
			e.quadraticCurveTo(8, 0, 20, 16);
			e.stroke();
			e.strokeStyle = "#e7e5e4";
			e.lineWidth = 1.2;
			e.beginPath();
			e.moveTo(20, -16);
			e.lineTo(26, 0);
			e.lineTo(20, 16);
			e.stroke();
			e.fillStyle = "#e2e8f0";
			e.fillRect(22, -1.5, 18, 3);
		} else if (id === "chainsaw") {
			e.fillStyle = "#eab308";
			e.fillRect(4, -7, 20, 14);
			e.fillStyle = "#3f3f46";
			e.fillRect(22, -4, 32, 8);
			e.strokeStyle = "#a8a29e";
			e.lineWidth = 1.4;
			for (let i = 0; i < 6; i++) {
				const ox = 26 + i * 5 + this.simTime * 40 % 5;
				e.beginPath();
				e.moveTo(ox, -4);
				e.lineTo(ox + 2, 0);
				e.lineTo(ox, 4);
				e.stroke();
			}
		}
		if (this.muzzleFlashTimer > .25 && id !== "crossbow") {
			const flashX = id === "shotgun" ? 64 : id === "lever_rifle" ? 60 : id === "carbine" ? 50 : id === "chainsaw" ? 52 : 40;
			e.fillStyle = id === "shotgun" ? "rgba(253, 186, 116, 0.95)" : "rgba(254, 240, 138, 0.92)";
			e.beginPath();
			if (id === "shotgun") {
				e.moveTo(flashX - 4, 0);
				e.lineTo(flashX + 18, -14);
				e.lineTo(flashX + 10, 0);
				e.lineTo(flashX + 18, 14);
				e.closePath();
			} else e.arc(flashX, 0, 5 + this.muzzleFlashTimer * (id === "revolver" ? 7 : 5), 0, Math.PI * 2);
			e.fill();
		}
	}
	renderZombies(e) {
		const { camL, camT, camR, camB } = this.viewCull(90);
		const fs = this.figureScale();
		const barH = Math.max(4, 3.2 / this.viewZoom());
		for (let zi = 0; zi < this.zombies.length; zi++) {
			const t = this.zombies[zi];
			if (!t || t.x < camL || t.x > camR || t.y < camT || t.y > camB) continue;
			// Batch 6 (Lane A): bomber fuse telegraph — visible growing blast ring.
			if (t.fuseT > 0) {
				const prog = 1 - Math.max(0, t.fuseT) / this.b6fuseTime;
				e.strokeStyle = `rgba(255, 90, 30, ${(.35 + .55 * prog).toFixed(2)})`;
				e.lineWidth = 2 + 3 * prog;
				e.beginPath();
				e.arc(t.x, t.y, Math.max(6, prog * this.b6blastR), 0, Math.PI * 2);
				e.stroke();
			}
			const facingLeft = Math.cos(t.angle) < 0;
			const limp = Math.abs(Math.sin(this.simTime * (t.type === "sprinter" ? 10 : 6) + t.x * .08)) * (t.type === "crawler" ? 1.6 : 3.2);
			// Batch 8 (Lane B): idle bob — stationary zombies sway ~2.5px, phase-offset by entity hash, reduce-motion aware.
			if (t.hseed === undefined) { let hs = 0; for (const c of t.id) hs = (hs * 31 + c.charCodeAt(0)) | 0; t.hseed = hs; }
			const lastRX = t._lastRX ?? t.x, lastRY = t._lastRY ?? t.y;
			const zMoving = Math.hypot(t.x - lastRX, t.y - lastRY) > .35;
			t._lastRX = t.x; t._lastRY = t.y;
			const idleBob = zMoving ? 0 : Math.sin(this.simTime * 2.05 + (t.hseed % 6.283)) * 2.5 * this.motionScale();
			if (!this._tracked || t === this._tracked) this._lastZombieBob = idleBob; // Batch 8 (Lane B): test probe.
			e.save();
			e.translate(t.x, t.y);
			// Batch 10 (Lane 1): illusion clones read as ghosts — half-transparent.
			if (t.isClone) e.globalAlpha = .55;
			// Batch 6 (Lane B): pooled baked blob shadow.
			drawBlobShadow(e, 2, t.radius * .72, t.radius * 1.05);
			if (t.elite) {
				e.strokeStyle = "#ffd700";
				e.lineWidth = 3;
				e.beginPath();
				e.ellipse(2, t.radius * .72, t.radius * 1.35, t.radius * .55, 0, 0, Math.PI * 2);
				e.stroke();
				// Batch 2: affix tells — color-coded rings so elites read at a glance.
				// Batch 11 (Lane 1): thorned = spiky green ring; wailing = big
				// expanding purple ring. Each affix keeps a distinct tell.
				if (t.affix) {
					const pulse = .6 + .4 * Math.sin(this.simTime * 5);
					const col = { volatile: `rgba(255,107,53,${pulse})`, vampiric: `rgba(190,24,60,${pulse})`, leaping: `rgba(255,255,255,${t.leapTele > 0 ? 1 : pulse * .7})`, shielded: `rgba(76,195,255,${pulse})`, swift: `rgba(230,230,230,${pulse * .8})`, frosted: `rgba(125,211,252,${pulse})`, thorned: `rgba(74,222,128,${pulse})`, wailing: `rgba(192,132,252,${pulse})` }[t.affix];
					e.strokeStyle = col; e.lineWidth = 2.5;
					e.beginPath();
					e.ellipse(2, t.radius * .72, t.radius * (t.affix === `volatile` ? 1.6 + .25 * pulse : t.affix === `wailing` ? 1.9 + .3 * pulse : 1.55), t.radius * .68, 0, 0, Math.PI * 2);
					e.stroke();
					if (t.affix === `thorned`) {
						// Thorn spikes around the ring — 8 barbs.
						e.beginPath();
						for (let k = 0; k < 8; k++) {
							const an = (k / 8) * Math.PI * 2 + this.simTime * .8;
							const r0 = t.radius * 1.55, r1 = t.radius * 1.85;
							e.moveTo(2 + Math.cos(an) * r0, t.radius * .72 + Math.sin(an) * t.radius * .68);
							e.lineTo(2 + Math.cos(an) * r1, t.radius * .72 + Math.sin(an) * t.radius * .95);
						}
						e.stroke();
					}
				}
			}
			e.save();
			e.translate(0, -limp - (t.yOff || 0) - idleBob);
			// Batch 3: spawn pop scale.
			const popS = t.spawnT > 0 ? Math.max(.1, 1 - t.spawnT / .15) : 1;
			// Batch 5: squash-and-stretch yoyo (80ms) + heavy-hit spin.
			let rsx = 1, rsy = 1;
			if (t.squashT > 0) {
				const sp = 1 - t.squashT / .08;
				const sk = Math.sin(sp * Math.PI * 2);
				rsx = 1 + .3 * sk; rsy = 1 - .3 * sk;
			}
			// Batch 8 (Lane B): lunge squash-and-stretch — 50ms pulse set in updateZombies, decayed here in render.
			let asx = 1, asy = 1;
			if (t.atkT > 0) {
				const ap = Math.max(0, t.atkT / .05); // 1 → 0
				asx = 1 + .25 * ap; asy = 1 - .14 * ap; // peak 1.25x stretch along facing
				t.atkT = Math.max(0, t.atkT - this._renderDt);
			}
			// Batch 8 (Lane B): latch the peak — a 50ms beat can fall between test polls.
			if ((!this._tracked || t === this._tracked) && asx > this._lastZombiePulse.sx) this._lastZombiePulse = { sx: asx, sy: asy };
			e.scale((facingLeft ? -1 : 1) * popS * rsx * asx, popS * rsy * asy);
			if (t.spinT > 0) e.rotate(t.hitSpin * (t.spinT / .25));
			const tall = t.radius * (t.type === "crawler" ? 4.2 : t.type === "behemoth" ? 4.6 : 5.1) * fs;
			// Batch 6 (Lane B): per-instance hue jitter + damage-flash bloom (hseed set above).
			applyZombieTint(e, t.hseed);
			drawSprite(e, t.type === "riot_shield" ? "riot" : t.type === "haint" || t.type === "illusionist" ? "shambler" : t.type, tall, t.hitFlash, false); // Batch 10 (Lane 1): illusionist reuses the shambler sprite; clones are alpha-flagged above.
			clearZombieTint(e);
			if (t.isBurning && t.isBurning > 0) {
				e.fillStyle = "rgba(249, 115, 22, 0.35)";
				e.beginPath();
				e.arc(0, 0, Math.max(1, t.radius * 1.25), 0, Math.PI * 2);
				e.fill();
			}
			// Batch 7 (Lane 1): enraged Behemoth reads red.
			if (t.enraged) {
				e.fillStyle = "rgba(239, 68, 68, 0.35)";
				e.beginPath();
				e.arc(0, 0, Math.max(1, t.radius * 1.3), 0, Math.PI * 2);
				e.fill();
			}
			e.restore();
			// Batch 6 (Lane B): white damage-flash bloom over just-hit bodies.
			const fi = zombieFlashIntensity(zi) * this.flashScale();
			if (fi > 0) drawZombieHitFlash(e, 0, 0, t.radius * 1.6, fi);
			if (t.health < t.maxHealth || t.type === "miner_brute" || t.type === "behemoth") {
				const n = t.radius * 2.4;
				const r = Math.max(0, t.health / t.maxHealth);
				e.fillStyle = "rgba(0, 0, 0, 0.75)";
				e.fillRect(-n / 2, -t.radius - 8 - limp, n, barH);
				e.fillStyle = "#e11d2e";
				e.fillRect(-n / 2, -t.radius - 8 - limp, n * r, barH);
			}
			// Batch 5: riot_shield visual tell — drawn shield arc facing the player + shield HP bar.
			if (t.type === "riot_shield") {
				if (t.shieldHp > 0) {
					const sa = Math.atan2(this.player.y - t.y, this.player.x - t.x);
					e.strokeStyle = "#9aa5b1";
					e.lineWidth = 5;
					e.beginPath();
					e.arc(0, 0, t.radius * 1.35, sa - .8, sa + .8);
					e.stroke();
					e.strokeStyle = "rgba(226, 232, 240, .55)";
					e.lineWidth = 2;
					e.beginPath();
					e.arc(0, 0, t.radius * 1.35, sa - .8, sa + .8);
					e.stroke();
				}
				if (t.shieldHp > 0 && t.shieldMax > 0) {
					const n = t.radius * 2.4;
					e.fillStyle = "rgba(0, 0, 0, 0.75)";
					e.fillRect(-n / 2, -t.radius - 12 - limp, n, barH);
					e.fillStyle = "#7dd3fc";
					e.fillRect(-n / 2, -t.radius - 12 - limp, n * Math.max(0, t.shieldHp / t.shieldMax), barH);
				}
			}
			e.restore();
		}
	}
	renderBanner(e) {
		if (Date.now() > this.bannerUntil || !this.bannerText) return;
		const w = this.canvas.width / (window.devicePixelRatio || 1);
		const h = this.canvas.height / (window.devicePixelRatio || 1);
		const age = 1 - (this.bannerUntil - Date.now()) / 2600;
		const alpha = age < .12 ? age / .12 : age > .8 ? (1 - age) / .2 : 1;
		e.save();
		e.globalAlpha = Math.max(0, Math.min(1, alpha));
		e.textAlign = `center`;
		e.font = `900 44px system-ui, sans-serif`;
		e.fillStyle = `#7f1d1d`;
		e.fillText(this.bannerText, w / 2, h * .3);
		e.strokeStyle = `#fca5a5`; e.lineWidth = 1.5;
		e.strokeText(this.bannerText, w / 2, h * .3);
		e.font = `400 18px system-ui, sans-serif`;
		e.fillStyle = `#e5e7eb`;
		e.fillText(this.bannerSub, w / 2, h * .3 + 32);
		e.restore();
	}
	renderZombieLabels(e) {
		const { camL, camT, camR, camB } = this.viewCull(90);
		const elites = this.zombies.filter((t) => t.x >= camL && t.x <= camR && t.y >= camT && t.y <= camB && (t.type === "sprinter" || t.type === "miner_brute" || t.type === "bloater_spitter" || t.type === "behemoth"));
		if (!elites.length) return;
		elites.sort((a, b) => Math.hypot(a.x - this.player.x, a.y - this.player.y) - Math.hypot(b.x - this.player.x, b.y - this.player.y));
		const t = elites[0];
		const label = ZOMBIE_LABELS[t.type] || "WILD";
		const labelSize = (t.type === "behemoth" ? 26 : 18) / this.viewZoom();
		drawWildLabel(e, label, t.x, t.y - t.radius - 20, labelSize, this.simTime);
	}
	renderEyeshine(e, camL, camT) {
		const range = this.player.flashlightRange * 1.55;
		const cone = 0.62;
		for (const z of this.zombies) {
			const dx = z.x - this.player.x, dy = z.y - this.player.y;
			const dist = Math.hypot(dx, dy);
			if (dist < 40 || dist > range) continue;
			const ang = Math.atan2(dy, dx);
			let da = ang - this.player.flashlightAngle;
			while (da > Math.PI) da -= Math.PI * 2;
			while (da < -Math.PI) da += Math.PI * 2;
			const inCone = Math.abs(da) < cone && dist < this.player.flashlightRange;
			if (inCone && dist < 220) continue;
			const s = this.worldToScreen(z.x, z.y);
			const sx = s.x, sy = s.y - 10;
			const glow = 3.4 + Math.sin(this.simTime * 8 + z.x) * 1.2;
			e.save();
			e.fillStyle = "rgba(255, 228, 196, 0.9)";
			e.beginPath();
			e.arc(sx - 5, sy - 6, glow * 0.55, 0, Math.PI * 2);
			e.arc(sx + 5, sy - 6, glow * 0.55, 0, Math.PI * 2);
			e.fill();
			e.fillStyle = "rgba(225, 29, 46, 0.95)";
			e.beginPath();
			e.arc(sx - 5, sy - 6, glow * 0.28, 0, Math.PI * 2);
			e.arc(sx + 5, sy - 6, glow * 0.28, 0, Math.PI * 2);
			e.fill();
			e.restore();
		}
	}
	renderFlares(e) {
		for (const fl of this.flares) {
			const life = Math.max(0, (fl.until - this.simTime) / 9);
			e.save();
			e.translate(fl.x, fl.y);
			e.globalAlpha = 0.35 + Math.sin(this.simTime * 10) * 0.08;
			e.fillStyle = "#f6c453";
			e.beginPath();
			e.arc(0, 0, 10 + (1 - life) * 4, 0, Math.PI * 2);
			e.fill();
			e.globalAlpha = 0.9;
			e.fillStyle = "#c23b22";
			e.fillRect(-2, -14, 4, 18);
			e.fillStyle = "#e8e0d4";
			e.font = `bold 10px "IBM Plex Mono", monospace`;
			e.textAlign = "center";
			e.fillText("FLARE", 0, -22);
			e.restore();
		}
	}
	renderMinimap(e, w, h) {
		const loc = this.currentLocation;
		const mw = 156, mh = 118;
		const x = 16, y = Math.max(168, h * 0.22);
		e.save();
		e.globalAlpha = 0.92;
		e.fillStyle = "rgba(12, 11, 9, 0.82)";
		e.strokeStyle = "#6b5428";
		e.lineWidth = 2;
		e.beginPath();
		e.roundRect(x, y, mw, mh, 6);
		e.fill();
		e.stroke();
		e.strokeStyle = "#2a2118";
		e.lineWidth = 1;
		e.strokeRect(x + 3, y + 3, mw - 6, mh - 6);
		e.fillStyle = "#8a8175";
		e.font = `9px "IBM Plex Mono", monospace`;
		e.textAlign = "left";
		e.fillText("COUNTY", x + 8, y + 14);
		const sx = (wx) => x + 8 + (wx / loc.mapWidth) * (mw - 16);
		const sy = (wy) => y + 16 + (wy / loc.mapHeight) * (mh - 26);
		e.strokeStyle = "#2a241c";
		e.strokeRect(x + 8, y + 8, mw - 16, mh - 16);
		const wb = loc.workbench;
		e.fillStyle = "#d4a017";
		e.fillRect(sx(wb.x) - 2, sy(wb.y) - 2, 4, 4);
		if (this.extractActive) {
			e.fillStyle = "#e8e0d4";
			e.beginPath();
			e.arc(sx(loc.extract.x), sy(loc.extract.y), 3.5, 0, Math.PI * 2);
			e.fill();
		}
		if (loc.lantern) {
			e.fillStyle = this.lanternLit ? "#f6c453" : "#3a3228";
			e.fillRect(sx(loc.lantern.x) - 2, sy(loc.lantern.y) - 2, 4, 4);
		}
		for (const hole of this.holes) {
			e.fillStyle = hole.boarded ? "#8a8175" : "#c23b22";
			e.beginPath();
			e.arc(sx(hole.x), sy(hole.y), 2.4, 0, Math.PI * 2);
			e.fill();
		}
		for (const fl of this.flares) {
			e.fillStyle = "#f6c453";
			e.beginPath();
			e.arc(sx(fl.x), sy(fl.y), 3, 0, Math.PI * 2);
			e.fill();
		}
		for (const z of this.zombies) {
			e.fillStyle = z.type === "behemoth" ? "#c23b22" : "#6b3a32";
			e.fillRect(sx(z.x) - 1, sy(z.y) - 1, 2, 2);
		}
		e.fillStyle = "#e8e0d4";
		e.beginPath();
		e.arc(sx(this.player.x), sy(this.player.y), 3.2, 0, Math.PI * 2);
		e.fill();
		e.strokeStyle = "#d4a017";
		e.beginPath();
		e.moveTo(sx(this.player.x), sy(this.player.y));
		e.lineTo(sx(this.player.x) + Math.cos(this.player.angle) * 8, sy(this.player.y) + Math.sin(this.player.angle) * 8);
		e.stroke();
		e.restore();
	}
	renderCompass(e, w, h) {
		const cx = w / 2, cy = 26;
		e.save();
		e.globalAlpha = 0.9;
		e.fillStyle = "rgba(12, 11, 9, 0.72)";
		e.beginPath();
		e.arc(cx, cy, 18, 0, Math.PI * 2);
		e.fill();
		e.strokeStyle = "#6b5428";
		e.lineWidth = 1.6;
		e.stroke();
		e.fillStyle = "#d4a017";
		e.font = `bold 9px "IBM Plex Mono", monospace`;
		e.textAlign = "center";
		e.textBaseline = "middle";
		e.fillText("N", cx, cy - 11);
		const ticks = [];
		const loc = this.currentLocation;
		if (loc.lantern) ticks.push({ x: loc.lantern.x, y: loc.lantern.y, color: "#d4a017" });
		if (loc.extract) ticks.push({ x: loc.extract.x, y: loc.extract.y, color: "#d4a017" });
		if (loc.bell && this.bellReady) ticks.push({ x: loc.bell.x, y: loc.bell.y, color: "#d4a017" });
		let nearest = null, nd = 1e9;
		for (const z of this.zombies) {
			const d = Math.hypot(z.x - this.player.x, z.y - this.player.y);
			if (d < nd) { nd = d; nearest = z; }
		}
		if (nearest) ticks.push({ x: nearest.x, y: nearest.y, color: "#c23b22" });
		for (const t of ticks) {
			const ang = Math.atan2(t.y - this.player.y, t.x - this.player.x);
			e.fillStyle = t.color;
			e.beginPath();
			e.arc(cx + Math.cos(ang) * 18, cy + Math.sin(ang) * 18, 3.1, 0, Math.PI * 2);
			e.fill();
		}
		e.restore();
		// VS-1: Harvest Streak timer bar under the compass.
		if (this.streak >= 2) {
			const bw = 130, bx = w / 2 - bw / 2, by = 52, frac = Math.max(0, this.streakTimer / 3);
			e.save();
			e.globalAlpha = .92;
			e.fillStyle = `rgba(12, 11, 9, 0.72)`;
			e.beginPath();
			if (e.roundRect) e.roundRect(bx - 6, by - 4, bw + 12, 26, 6); else e.rect(bx - 6, by - 4, bw + 12, 26);
			e.fill();
			e.fillStyle = this.streakColor();
			e.font = `bold 10px "IBM Plex Mono", monospace`;
			e.textAlign = `center`;
			e.textBaseline = `middle`;
			e.fillText(`HARVEST x${this.streak}`, w / 2, by + 4);
			e.fillStyle = `rgba(255,255,255,0.18)`;
			e.fillRect(bx, by + 12, bw, 3);
			e.fillStyle = this.streakColor();
			e.fillRect(bx, by + 12, bw * frac, 3);
			e.restore();
		}
	}
	stripTheDead(z) {
		const mag = this.weapons.find((w) => w.id === "revolver");
		const pump = this.weapons.find((w) => w.id === "shotgun");
		if (z.type === "crawler" && pump && Math.random() < 0.62) {
			const n = 4 + Math.floor(Math.random() * 4);
			pump.reserveAmmo = Math.min(pump.maxReserveAmmo, pump.reserveAmmo + n);
			this.spawnFloater(z.x, z.y - z.radius - 10, `+${n} SHELLS`, "#d4a017");
		} else if ((z.type === "shambler" || z.type === "sprinter") && mag && Math.random() < 0.5) {
			const n = 3 + Math.floor(Math.random() * 4);
			mag.reserveAmmo = Math.min(mag.maxReserveAmmo, mag.reserveAmmo + n);
			this.spawnFloater(z.x, z.y - z.radius - 10, `+${n} .357`, "#d4a017");
		} else if (z.type === "miner_brute") {
			this.scrap += 18;
			this.stats.scrapCollected += 18;
			this.spawnFloater(z.x, z.y - z.radius - 10, "+SCRAP", "#d4a017");
		}
	}
	renderProjectiles(e) {
		for (let t of this.bullets) {
			e.save();
			e.translate(t.x, t.y);
			const boost = Math.max(1, (4.8 / this.viewZoom()) / Math.max(2, t.radius));
			e.scale(boost, boost);
			if (t.isMolotov) {
				e.fillStyle = `#f59e0b`;
				e.fillRect(-3, -6, 6, 12);
				e.fillStyle = `#ef4444`;
				e.beginPath();
				e.arc(0, -8, 3, 0, Math.PI * 2);
				e.fill();
			} else if (t.isCrossbowBolt || t.weaponType === "crossbow") {
				const n = Math.atan2(t.vy, t.vx);
				e.rotate(n);
				e.fillStyle = `#cbd5e1`;
				e.fillRect(-10, -1.6, 20, 3.2);
				e.fillStyle = `#f8fafc`;
				e.beginPath();
				e.moveTo(10, 0);
				e.lineTo(4, -4);
				e.lineTo(4, 4);
				e.closePath();
				e.fill();
				e.fillStyle = `#7c2d12`;
				e.fillRect(-10, -3.5, 4, 7);
			} else if (t.weaponType === "shotgun") {
				e.fillStyle = t.color;
				e.beginPath();
				e.arc(0, 0, t.radius, 0, Math.PI * 2);
				e.fill();
				e.globalAlpha = .35;
				e.beginPath();
				e.arc(0, 0, t.radius * 1.8, 0, Math.PI * 2);
				e.fill();
			} else if (t.weaponType === "lever_rifle") {
				const n = Math.atan2(t.vy, t.vx);
				e.rotate(n);
				e.strokeStyle = "rgba(254, 252, 232, 0.85)";
				e.lineWidth = 2;
				e.beginPath();
				e.moveTo(-16, 0);
				e.lineTo(10, 0);
				e.stroke();
				e.fillStyle = t.color;
				e.fillRect(-4, -1.4, 14, 2.8);
			} else if (t.weaponType === "carbine") {
				const n = Math.atan2(t.vy, t.vx);
				e.rotate(n);
				e.fillStyle = t.color;
				e.fillRect(-5, -1, 10, 2);
			} else if (t.isMortar) {
				// Batch 10 (Lane 1): lobbed shell — dark iron, arcing shadow below, fuse spark.
				const n = Math.atan2(t.vy, t.vx);
				e.globalAlpha = .35;
				e.fillStyle = `#000`;
				e.beginPath();
				e.ellipse(t.x + 8, t.y + 14, 10, 4, 0, 0, Math.PI * 2);
				e.fill();
				e.globalAlpha = 1;
				e.rotate(n);
				e.fillStyle = `#3f3f46`;
				e.fillRect(-8, -3, 16, 6);
				e.fillStyle = `#d6a05c`;
				e.beginPath();
				e.arc(-8, 0, 2.5 + Math.random() * 1.5, 0, Math.PI * 2);
				e.fill();
				e.globalAlpha = 1;
			} else if (t.isMissile) {
				// Batch 4: canary rocket — red body, pale nose, orange exhaust flicker.
				const n = Math.atan2(t.vy, t.vx);
				e.rotate(n);
				e.fillStyle = `#f87171`;
				e.fillRect(-10, -3, 20, 6);
				e.fillStyle = `#fecaca`;
				e.beginPath();
				e.moveTo(10, 0);
				e.lineTo(4, -4);
				e.lineTo(4, 4);
				e.closePath();
				e.fill();
				e.globalAlpha = .5 + Math.random() * .5;
				e.fillStyle = `#fb923c`;
				e.beginPath();
				e.moveTo(-10, -2.5);
				e.lineTo(-16 - Math.random() * 4, 0);
				e.lineTo(-10, 2.5);
				e.closePath();
				e.fill();
				e.globalAlpha = 1;
			} else {
				const n = Math.atan2(t.vy, t.vx);
				e.rotate(n);
				e.fillStyle = t.color;
				// Batch 5: bullets drawn 1.75x stretched along travel direction.
				e.fillRect(-14, -t.radius / 2, 28, t.radius);
				e.globalAlpha = .4;
				e.fillRect(-24, -1, 12, 2);
			}
			e.restore();
		}
		for (let t of this.acidSpits) e.fillStyle = `#84cc16`, e.beginPath(), e.arc(t.x, t.y, t.radius, 0, Math.PI * 2), e.fill();
	}
	renderParticles(e) {
		const { camL, camT, camR, camB } = this.viewCull(40);
		// Batch 5: persistent fading ground splats, drawn under live particles.
		for (const s of this.bloodSplats) {
			if (s.x < camL || s.x > camR || s.y < camT || s.y > camB) continue;
			e.globalAlpha = .55 * Math.max(0, s.life / s.maxLife);
			e.fillStyle = `#5c0a0a`;
			e.beginPath();
			e.ellipse(s.x, s.y, s.r * 1.4, s.r * .8, s.r, 0, Math.PI * 2);
			e.fill();
		}
		for (const t of this.particles) {
			if (t.x < camL || t.x > camR || t.y < camT || t.y > camB) continue;
			// Batch 8 (Lane C): hot particle kinds rasterize from baked sprites
			// instead of per-frame arcs; size clamped so drawImage never gets
			// a non-positive dimension. Blood tints the glow with its color.
			const sz = !(t.size > 0) ? 0.001 : t.size;
			if (t.type === `fire`) drawGlowSprite(e, t.x, t.y, sz * 2, t.alpha);
			else if (t.type === `spark`) drawSparkSprite(e, t.x, t.y, sz * 2, t.alpha);
			else if (t.type === `smoke`) drawSmokeSprite(e, t.x, t.y, sz * 2, t.alpha);
			else if (t.type === `blood`) drawGlowSprite(e, t.x, t.y, sz * 2, t.alpha, t.color);
			else {
				e.globalAlpha = t.alpha;
				e.fillStyle = t.color;
				e.beginPath();
				e.arc(t.x, t.y, sz, 0, Math.PI * 2);
				e.fill();
			}
		}
		e.globalAlpha = 1;
	}
}
