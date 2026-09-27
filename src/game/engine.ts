// @ts-nocheck
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
import { rollBoons, BoonOffer, LOCKOUTS, BOON_CATALOG, supportApplies } from "./boons";
import { INITIAL_WEAPONS, AVAILABLE_PERKS, GAME_LOCATIONS, BOARD_COST, EVOLUTIONS, RUN_EVENTS, GRIT_GROUND_CAP, BOMB_RADIUS, BOMB_DMG, BOMB_MAX_CHARGES, BOMB_REGEN_MS, QUESTS, SHRINE_COUNT, SHRINE_BOSS_DMG_PER, SHOP_POOL, SHOP_OFFER_COUNT, SHOP_REROLL_BASE, WEAPON_FAMILIES, WAVES, windowAt, WEAPON_MAX_TABLE_LEVEL, statsForLevel, KONAMI_SEQUENCE, matchKonami, SECRET_WEAPON, mulberry32, bossFor, evolutionReady, scalingAt, SPECIAL_WEAPON_DEFS } from "./constants";
import { loadMeta, saveMeta, recordRun, topRuns, characterDef, stageDef, selectedCharacterId, selectedStageId } from "./meta";
import * as metaNS from "./meta";
import { soundEngine } from "../audio/soundEngine";
import { renderEnvironment, drawBlobShadow, registerZombieHit, zombieFlashIntensity, applyZombieTint, clearZombieTint, drawZombieHitFlash, render7, renderTelegraphs, drawGlowSprite, drawSparkSprite, drawSmokeSprite } from "./mapRenderer";
import { DynamicLighting } from "./lighting";
import { radioFor } from "./radio";
import { drawSprite, drawWildLabel, loadArt, ZOMBIE_LABELS } from "./art";
import { FlowField } from "./flowfield";

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
	constructor(e, t, n = 0, opts) {
		this.canvas = e, this.ctx = e.getContext(`2d`), this.callbacks = t, this.currentLocation = GAME_LOCATIONS[n] || GAME_LOCATIONS[0], this.pristineLocation = this.currentLocation, this.lighting = new DynamicLighting(), this.placePlayerSafely(), this.camX = this.player.x, this.camY = this.player.y, this.initExplosiveBarrels(), this.initLoreNotes(), this.initBarricades(), this.initHoles(), this.rebuildFlow(true), this.setupListeners(), this.installControlsProbe();
		// Batch 5: daily-challenge seed — seeded RNG for gameplay rolls (cosmetic
		// jitter stays on Math.random). Lane D passes { seed } as the 4th arg.
		this.runSeed = opts?.seed ?? ((Math.random() * 2 ** 32) | 0);
		this.rng = mulberry32(this.runSeed);
		loadArt();
	}
	initBarricades() {
		let e = this.currentLocation.barricades || [];
		this.barricades = e.map((e, t) => ({
			id: `bar_${t}`,
			x: e.x,
			y: e.y,
			width: e.width,
			height: e.height,
			health: e.type === `coal_cart` ? 220 : e.type === `sandbags` ? 160 : 90,
			maxHealth: e.type === `coal_cart` ? 220 : e.type === `sandbags` ? 160 : 90,
			type: e.type
		}));
	}
	placePlayerSafely() {
		let e = this.currentLocation;
		if (this.player.x = e.spawn?.x ?? e.mapWidth / 2, this.player.y = e.spawn?.y ?? e.mapHeight / 2 + 200, this.checkObstacleCollision(this.player.x, this.player.y, this.player.radius)) for (let t = 40; t <= 420; t += 24) for (let n = 0; n < Math.PI * 2; n += Math.PI / 8) {
			let r = this.player.x + Math.cos(n) * t, i = this.player.y + Math.sin(n) * t;
			if (r > this.player.radius && i > this.player.radius && r < e.mapWidth - this.player.radius && i < e.mapHeight - this.player.radius && !this.checkObstacleCollision(r, i, this.player.radius)) {
				this.player.x = r, this.player.y = i;
				return;
			}
		}
	}
	rebuildFlow(force = false) {
		const loc = this.currentLocation;
		const blocks = [
			...(loc.obstacles || []),
			...this.barricades.filter((b) => b.health > 0).map((b) => ({ x: b.x, y: b.y, width: b.width, height: b.height })),
		];
		this.flow.markBlocked(loc.mapWidth, loc.mapHeight, blocks);
		this.flow.rebuild(this.player.x, this.player.y);
		this.flowRebuild = 0.35;
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
	installControlsProbe() {
		window.__controlsTest = {
			getYaw: () => this.player.angle,
			getSpeed: () => this.lastMoveSpeed,
			getX: () => this.player.x,
			getY: () => this.player.y,
			setKeys: (e) => {
				this.keys = {};
				for (let t of e) this.keys[t] = true;
			},
			setAim: (x, y) => {
				this.player.angle = Math.atan2(y, x);
				this.player.flashlightAngle = this.player.angle;
				const cx = this.canvas.width / 2;
				const cy = this.canvas.height / 2;
				this.mousePos.x = cx + x * 220;
				this.mousePos.y = cy + y * 220;
			},
			getFlares: () => this.player.flares,
			throwFlare: () => this.throwFlare(),
			flareCount: () => this.flares.length,
			plant: () => this.plantPost(),
			pipe: () => this.dropPipe(),
			traps: () => this.traps.map((t) => ({ kind: t.kind, x: t.x, y: t.y, live: t.live, left: t.left })),
			kit: () => ({ posts: this.posts, pipes: this.pipes, need: this.xpToNext(), xp: this.xp, level: this.level }),
			give: (posts = 1, pipes = 1) => {
				this.posts += posts;
				this.pipes += pipes;
			},
			postRank: () => this.postRank,
			upgradePost: () => this.upgradePost(),
			weapon: (id) => { const w = this.weapons.find((x) => x.id === id); return w && { reserve: w.reserveAmmo, max: w.maxReserveAmmo }; },
			setWave: (n) => { this.wave = n; },
			setSim: (t) => { this.simTime = t; }, // Batch 6: deterministic simTime for scaling tests.
			spawnType: (t) => this.pushZombie(t, this.player.x + 120, this.player.y),
			ghostLead: (type, mvx, mvy) => { // Group 1 test hook: personality target for a fake zombie, deterministic
				const z = { type, x: this.player.x - 100, y: this.player.y, flank: 1, id: `testhook` };
				const i = this.player.x - z.x, a = this.player.y - z.y, o = Math.hypot(i, a);
				const kvx = this.moveVX, kvy = this.moveVY;
				this.moveVX = mvx; this.moveVY = mvy;
				const pt = this.personalityTarget(z, i, a, o);
				this.moveVX = kvx; this.moveVY = kvy;
				return { tx: pt[0], ty: pt[1], blend: pt[2] };
			},
			lastZombie: () => { const z = this.zombies[this.zombies.length - 1]; return z && { t: z.type, hp: Math.round(z.health) }; },
			barrels: () => this.explosiveBarrels.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y) })),
			spawnPt: () => ({ x: this.currentLocation.spawn.x, y: this.currentLocation.spawn.y }),
			sys: () => ({
				bomb: { charges: this.bombCharges, max: BOMB_MAX_CHARGES },
				grit: { bag: Math.round(this.gritBag), ground: this.grit.length },
				events: { fired: [...this.firedEvents], active: this.activeEvents.map((a) => a.id) },
				dash: { charges: this.dashCharges, max: this.dashMax, cd: +this.dashCd.toFixed(2), timer: +this.dashTimer.toFixed(2) },
				shop: { offers: this.shopOffers.map((o) => o.offerId), reroll: this.shopRerollCost, scrap: this.scrap, waveState: this.waveState },
				shrines: this.shrines.map((s) => ({ x: Math.round(s.x), y: Math.round(s.y), attuned: s.attuned })),
				quests: { done: [...this.meta.questsDone], lifetime: { ...this.meta.lifetime } },
				mods: this.eventMods(),
				evoHints: this.evolutionHints(),
				revolver: (() => { const w = this.weapons.find((x) => x.id === `revolver`); return w ? { name: w.name, dmg: w.damage, fireRate: w.fireRate, pierce: w.pierce } : null; })(),
				zombies: () => this.zombies.map((z) => ({ id: String(z.id).slice(-6), t: z.type, h: Math.round(z.health), d: Math.round(Math.hypot(z.x - this.player.x, z.y - this.player.y)), state: z.ai, tx: Math.round(z.tx), ty: Math.round(z.ty) })),
			}),
			detonate: () => this.detonateBomb(),
			dash: () => this.tryDash(),
			god: () => { this.player.maxHealth = 999999; this.player.health = 999999; },
			buyShop: (i) => this.buyShopOffer(i),
			rerollShop: () => this.rerollShop(),
			lockShop: (i) => this.toggleShopLock(i),
			rollShop: () => this.rollShop(),
			attune: () => this.tryAttuneShrine(),
			teleportToShrine: () => { const s = this.shrines[0]; if (s) { this.player.x = s.x; this.player.y = s.y; } },
			bump: (stat, n = 1) => this.bumpLifetime(stat, n),
			giveScrap: (n) => { this.scrap += n; },
			bossMul: () => this.playerDamageMul({ type: `behemoth` }),
			plainMul: () => this.playerDamageMul({ type: `shambler` }),
			toBreak: () => { this.zombiesToSpawn = 0; this.zombies.length = 0; },
			skipBreak: () => this.skipWaveBreak(),
			draftOpen: () => !!this.draft,
			openDraft: () => this.offerDraft(),
			dismissDraft: () => { if (this.draft) this.takeBoon(this.draft[0].id); },
			// VS-1 probes: Harvest Streak, banish, scorch, impact audio.
			streak: () => ({ streak: this.streak, max: this.maxStreak, timer: +this.streakTimer.toFixed(2), color: this.streakColor() }),
			killOne: (t = `shambler`) => { const z = this.pushZombie(t, this.player.x + 30, this.player.y); this.killZombie(z, this.zombies.indexOf(z)); },
			decayStreak: (dt) => { this.streakTimer -= dt; if (this.streakTimer <= 0) { this.streak = 0; this.streakTimer = 0; } },
			hurtMe: (n = 10) => { this.invuln = 0; this.damagePlayer(n); },
			banish: (id) => this.banishBoon(id),
			banishState: () => ({ charges: this.banishCharges, banished: [...this.banishedBoons], draft: (this.draft || []).map((b) => b.id) }),
			rollPool: (banned) => rollBoons(this.boonStacks, this.player.molotovs, this.player.maxMolotovs, this.posts, this.pipes, new Set(banned)).map((b) => b.id),
			scorchCount: () => this.scorchDecals.length,
			addScorchAt: (n = 1) => { for (let i = 0; i < n; i++) this.addScorch(0, 0, 50); },
			playImpact: () => soundEngine.playImpact(),
			playKillSub: () => soundEngine.playKillSub(),
			playBanishSfx: () => soundEngine.playBanish(),
			// Batch 3 probes: aura, lockouts, falloff, flank, dasher, cull, casings, spawn pop.
			forceDraftTake: (id) => { this.draft = [{ id, name: id, blurb: `` }]; this.takeBoon(id); return { stacks: this.boonStacks[id] || 0, locked: [...this.lockedBoons] }; },
			auraState: () => ({ stacks: this.boon(`aura`), r: 80 + this.boon(`aura`) * 16 }),
			runFlank: () => { this.wave = Math.max(this.wave, 5); this.flankTimer = 0; this.updateFlankDirector(7); return this.zombies.filter((z) => z.flankUntil > this.simTime).length; },
			zDash: (i) => { const z = this.zombies[i]; return z ? { cd: +(z.dashCd ?? -1).toFixed(2), tele: +(z.dashTele || 0).toFixed(2) } : null; },
			runCull: () => { this.cullTimer = 0; this.cullZombies(2.1); return this.zombies.length; },
			zSpawnT: (i) => this.zombies[i] ? +this.zombies[i].spawnT.toFixed(3) : -1,
			zAi: (i) => this.zombies[i] ? this.zombies[i].ai : null,
			realAffix: (type) => { const z = this.pushZombie(type, this.player.x + 120, this.player.y); z.elite = true; z.maxHealth = Math.round(z.maxHealth * 2.2); z.health = z.maxHealth; this.assignAffix(z); return { affix: z.affix, idx: this.zombies.indexOf(z) }; },
			spawnTracked: (t, x, y) => { this._tracked = this.pushZombie(t, x, y); return 1; },
			trackedSpawnT: () => this._tracked ? +this._tracked.spawnT.toFixed(3) : -1,
			settle: () => { if (this.draft) { this.draft = null; this.callbacks.onDraft?.(null); } if (this.levelHold) { this.levelHold = false; this.setPaused(false); } return this.draft === null && !this.isPaused; },
			trackedDash: () => this._tracked ? { cd: +(this._tracked.dashCd ?? -1).toFixed(2), alive: this.zombies.includes(this._tracked) } : null,
			trackedAlive: () => this._tracked ? this.zombies.includes(this._tracked) : false,
			trackedPin: () => { if (this._tracked) this._tracked.health = this._tracked.maxHealth = 1e6; },
			trackedHp: () => this._tracked ? Math.round(this._tracked.health) : -999,
			trackedInfo: () => this._tracked ? { hp: Math.round(this._tracked.health), elite: !!this._tracked.elite, affix: this._tracked.affix || null, wave: this.wave } : null,
			zInfo: (i) => { const z = this.zombies[i]; return z ? { type: z.type, x: Math.round(z.x), y: Math.round(z.y), elite: !!z.elite, affix: z.affix || null, hp: Math.round(z.health) } : null; },
			// Batch 8 (Lane B) probes: attack pulses, idle bob, death stack.
			setA11y: (o) => this.setA11y(o),
			forceDeath: () => { this.lastKiller = `shambler`; this.lastStandUsed = true; this.invuln = 0; this.player.health = 1; this.damagePlayer(99999); return { dead: this.player.health <= 0 }; },
			deathState: () => ({ dead: this.player.health <= 0, running: this.isRunning, hitstop: +this.hitstop.toFixed(3), flash: +this.deathFlash.toFixed(3), particles: this.particles.filter((p) => p.type === `blood`).length, cine: +this.deathCineT.toFixed(3), slowmo: this.deathSlowmoFactor() }),
			atkPulse: () => ({ p: +((this.player.atkT || 0).toFixed(3)), zs: this.zombies.map((z) => +((z.atkT || 0).toFixed(3))) }),
			bashPulse: () => { this.bashCd = 0; this.dodgeTimer = 0; const ok = this.tryBash(); return { ok, atkT: +((this.player.atkT || 0).toFixed(3)) }; },
			bobState: () => ({ player: +(this._lastPlayerBob || 0).toFixed(2), zombie: +(this._lastZombieBob || 0).toFixed(2), ms: this.motionScale(), moving: this.lastMoveSpeed > .35 }),
			stunAll: () => { for (const z of this.zombies) z.stunUntil = this.simTime + 999; return this.zombies.length; },
			pulseFactors: () => {
				const pt = Math.max(0, (this.player.atkT || 0) / .05);
				const z = this.zombies.find((zz) => (zz.atkT || 0) > 0);
				const zt = z ? Math.max(0, z.atkT / .05) : 0;
				return { pSx: +(1 + .22 * pt).toFixed(3), pSy: +(1 - .14 * pt).toFixed(3), zSx: +(1 + .25 * zt).toFixed(3), zSy: +(1 - .14 * zt).toFixed(3) };
			},
			pulseRender: () => ({ p: this._lastPlayerPulse || { sx: 1, sy: 1 }, z: this._lastZombiePulse || { sx: 1, sy: 1 } }),
			lastGameOver: () => this._lastGameOver || null,
			simFrames: () => this._simFrames || 0,
			runState: () => ({ running: this.isRunning, paused: this.isPaused, waveState: this.waveState, draft: !!this.draft }),
			fireOnce: () => { const before = this.particles.length; this.fireCurrentWeapon(); return this.particles.filter((p) => p.type === `casing`).length; },
			bombRadius: () => BOMB_RADIUS,
			// Batch 4 probes: nova, missiles, vacuum, director D(t), swept collision.
			novaState: () => ({ stacks: this.boon(`nova`), cd: +this.novaCd.toFixed(2) }),
			fireNova: () => { this.novaCd = 0; const b = this.bullets.length; this.updateNova(1 / 60); return this.bullets.length - b; },
			novaInfo: () => this.bullets.filter((b) => b.weaponType === `nova`).map((b) => ({ dmg: b.damage, sp: Math.round(Math.hypot(b.vx, b.vy)) })),
			missileState: () => ({ stacks: this.boon(`missiles`), cd: +this.missileCd.toFixed(2) }),
			fireMissiles: () => { this.missileCd = 0; const b = this.bullets.filter((x) => x.isMissile).length; this.updateMissiles(1 / 60); return this.bullets.filter((x) => x.isMissile).length - b; },
			missileAng: () => { const m = this.bullets.find((x) => x.isMissile); return m ? +Math.atan2(m.vy, m.vx).toFixed(3) : null; },
			boomMissile: () => { const m = this.bullets.find((x) => x.isMissile); if (m) { this.detonateMissile(m); const i = this.bullets.indexOf(m); if (i >= 0) this.freeBulletAt(i); } return 1; },
			stepBullets: (n = 1) => { for (let i = 0; i < n; i++) this.updateBullets(1 / 60, Date.now()); return this.bullets.length; },
			vacuumState: () => ({ surge: +this.vacuumSurge.toFixed(2), drops: this.drops.filter((d) => d.type === `dust_devil`).length, grit: this.grit.length, xp: Math.round(this.xp) }),
			dropVacuum: () => { this.dropVacuumAt(this.player.x + 70, this.player.y); return this.drops.filter((d) => d.type === `dust_devil`).length; },
			eatVacuum: () => { const d = this.drops.find((x) => x.type === `dust_devil`); if (d) { d.x = this.player.x; d.y = this.player.y; } this.updateDrops(1 / 60); return +this.vacuumSurge.toFixed(2); },
			stepGrit: (n = 1) => { for (let i = 0; i < n; i++) this.updateGrit(1 / 60); return this.grit.length; },
			directorState: () => ({ timeMul: +this.timeCurve().toFixed(3), marks: this.miniBossMarks.map((m) => ({ at: m, fired: this.miniBossFired.has(m) })) }),
			timeMulAt: (t) => +this.timeCurve(t).toFixed(3),
			fireMark: (i = 0) => { const m = this.miniBossMarks[i]; this.miniBossFired.delete(m); const elites0 = this.zombies.filter((z) => z.elite).length; this.simTime = Math.max(this.simTime, m + .5); this.updateDirector(); return { fired: this.miniBossFired.has(m), elites: this.zombies.filter((z) => z.elite).length - elites0 }; },
			sweepCheck: (x0, y0, x1, y1, br, cx, cy, cr) => this.segmentHitsCircle(x0, y0, x1, y1, br, cx, cy, cr),
			rehash: () => { this.rebuildZombieHash(); return this.zhash.size; },
			sweepProbe: () => {
				this.zombies.length = 0; this.bullets.length = 0;
				const z = this.pushZombie(`shambler`, this.player.x + 200, this.player.y);
				z.health = z.maxHealth = 1e6; z.ai = `wander`; z.spawnT = 0;
				const b = this.allocBullet();
				b.x = this.player.x + 140; b.y = this.player.y; b.vx = 100; b.vy = 0;
				b.damage = 50; b.pierce = 1; b.rangeRemaining = 600; b.weaponType = `revolver`; b.radius = 3; b.color = `#fff`;
				b.lastHit = null; b.lastHitCd = 0;
				this.bullets.push(b);
				this.rebuildZombieHash();
				this.updateBullets(1 / 60, Date.now());
				return { hit: z.health < 1e6, hp: Math.round(z.health) };
			},
			// Batch 5 (Lane A) probes: combat juice.
			killWordState: () => ({ last: this.lastKillWord, count: this.killWordCount }),
			splatState: () => ({ splats: this.bloodSplats.length }),
			splatCount: () => this.bloodSplats.length,
			stepParticles: (n = 30) => { for (let i = 0; i < n; i++) this.updateParticles(1 / 60); return { particles: this.particles.length, splats: this.bloodSplats.length }; },
			ringState: () => { const rs = this.shockwaves.filter((s) => s.b5); const l = rs[rs.length - 1]; return { rings: rs.length, lastMaxR: l ? +l.maxR.toFixed(1) : 0 }; },
			slashState: () => ({ count: this.slashBursts.length, faint: this.slashBursts.filter((s) => s.faint).length }),
			flashState: () => ({ count: this.hitFlashes.length }),
			fireAndRead: () => { this.fireCurrentWeapon(); return { punch: +this.muzzlePunch.toFixed(3), kick: +this.gunKick.toFixed(2), camT: +this.camPunchT.toFixed(3) }; },
			muzzleState: () => ({ punch: +this.muzzlePunch.toFixed(3), kick: +this.gunKick.toFixed(2), camT: +this.camPunchT.toFixed(3) }),
			whiffNow: () => { this.bashCd = 0; this.dodgeTimer = 0; this.zombies.length = 0; const r = this.tryBash(); return { ok: r, slowT: +this.whiffSlowT.toFixed(3), last: this.lastWhiff, slashes: this.slashBursts.length }; },
			whiffState: () => ({ slowT: +this.whiffSlowT.toFixed(3), last: this.lastWhiff, slashes: this.slashBursts.length }),
			bodyReact: (i, dmg = 50) => { const z = this.zombies[i]; if (!z) return null; this.reactHit(z, dmg, 0); return { yOff: +z.yOff.toFixed(2), squashT: +z.squashT.toFixed(3), spinT: +(z.spinT || 0).toFixed(3) }; },
			bodyReactState: (i) => { const z = this.zombies[i]; return z ? { yOff: +((z.yOff || 0).toFixed(2)), squashT: +((z.squashT || 0).toFixed(3)), spinT: +((z.spinT || 0).toFixed(3)) } : null; },
			surgeState: () => { const p = this.activePowerups.find((x) => x.type === `score_surge`); return { active: this.hasPowerup(`score_surge`), remaining: p ? Math.round(p.durationRemaining) : 0, score: this.score }; },
			giveSurge: () => { this.activatePowerup(`score_surge`); return this.hasPowerup(`score_surge`); },
			addScoreProbe: (n) => { const b = this.score; const g = this.addScore(n); return { before: b, after: this.score, gained: g }; },
			powerupPool: () => [...this.powerupPool],
			dropSurge: () => { this.drops.push({ id: `t-surge`, type: `score_surge`, x: this.player.x, y: this.player.y, amount: 1, duration: 3e4 }); this.updateDrops(1 / 60); return this.hasPowerup(`score_surge`); },
			shieldState: (i) => { const z = this.zombies[i]; return z ? { type: z.type, shieldHp: z.shieldHp || 0, shieldMax: z.shieldMax || 0 } : null; },
			shieldHit: (i, dmg) => { const z = this.zombies[i]; if (!z) return null; const before = z.shieldHp || 0; const dealt = this.applyAffixDefense(z, dmg); return { before, after: z.shieldHp || 0, dealt }; },
			// Batch 6 (Lane A) probes: enemy-AI kit.
			b6spec: () => ({ keep: this.b6spitKeep, fire: this.b6spitFire, fuseRange: this.b6fuseRange, fuseTime: this.b6fuseTime, blastR: this.b6blastR, blastDmg: this.b6blastDmg, blastPlayer: this.b6blastPlayer }),
			stepZombies: (n = 1) => { for (let i = 0; i < n; i++) this.updateZombies(1 / 60, Date.now()); return this.zombies.length; },
			zAi: (i) => this.zombies[i] ? this.zombies[i].ai : null,
			zPos: (i) => this.zombies[i] ? { x: Math.round(this.zombies[i].x), y: Math.round(this.zombies[i].y) } : null,
			zDist: (i) => this.zombies[i] ? Math.round(Math.hypot(this.zombies[i].x - this.player.x, this.zombies[i].y - this.player.y)) : -1,
			ghostKite: (dist) => { // deterministic kiting probe: fake spitter at `dist` px east of player
				const z = { type: `bloater_spitter`, x: this.player.x - dist, y: this.player.y, strafeDir: 0 };
				const i = this.player.x - z.x, a = this.player.y - z.y, o = Math.hypot(i, a);
				const pt = this.personalityTarget(z, i, a, o);
				return { tx: Math.round(pt[0]), ty: Math.round(pt[1]), blend: pt[2], band: dist < this.b6spitKeep ? `backoff` : dist > this.b6spitFire ? `advance` : `hold` };
			},
			kiteState: () => { const z = [...this.zombies].reverse().find((z) => z.type === `bloater_spitter`); return z ? { dist: Math.round(Math.hypot(z.x - this.player.x, z.y - this.player.y)), ai: z.ai, spitCd: +z.spitCd.toFixed(2), spits: this.acidSpits.length } : null; },
			fuseState: () => { const z = [...this.zombies].reverse().find((z) => z.type === `bomber`); return z ? { fuseT: +z.fuseT.toFixed(3), beepT: +z.fuseBeepT.toFixed(3), alive: this.zombies.includes(z) } : null; },
			chewState: (i) => { const z = this.zombies[i]; return z ? { type: z.type, ai: z.ai, kind: z.chewKind || null, cx: Math.round(z.chewX), cy: Math.round(z.chewY) } : null; },
			driftState: (i) => { const z = this.zombies[i]; return z ? { ai: z.ai, kind: z.driftKind || null, dx: Math.round(z.driftX), dy: Math.round(z.driftY) } : null; },
			// Batch 9 (Lane 1): the objective list tickDrift seeks (open holes,
			// shrines, workbench) — the deterministic twin of the drift target.
			objectives9: () => [
				...this.holes.filter((h) => !h.boarded).map((h) => ({ kind: `hole`, x: Math.round(h.x), y: Math.round(h.y) })),
				...this.shrines.map((s) => ({ kind: `shrine`, x: Math.round(s.x), y: Math.round(s.y) })),
				...(!this._wbHidden9 && this.currentLocation.workbench ? [{ kind: `workbench`, x: Math.round(this.currentLocation.workbench.x), y: Math.round(this.currentLocation.workbench.y) }] : []),
			],
			boardAll: (v = true) => { for (const h of this.holes) h.boarded = !!v; return this.holes.filter((h) => h.boarded).length; },
			// Batch 9 (Lane 1): test-only stash of objectives for the empty-map
			// center-fallback test. Restores via unstashObjectives9.
			stashObjectives9: () => { this._stashedHoles9 = this.holes; this._stashedShrines9 = this.shrines; this.holes = []; this.shrines = []; this._wbHidden9 = true; return { holes: this._stashedHoles9.length, shrines: this._stashedShrines9.length }; },
			unstashObjectives9: () => { if (this._stashedHoles9) this.holes = this._stashedHoles9; if (this._stashedShrines9) this.shrines = this._stashedShrines9; this._stashedHoles9 = null; this._stashedShrines9 = null; this._wbHidden9 = false; return { holes: this.holes.length, shrines: this.shrines.length }; },
			postHp: () => this.traps.filter((t) => t.kind === `post`).map((t) => ({ live: t.live, hp: Math.round(t.hp ?? 70), x: Math.round(t.x), y: Math.round(t.y) })),
			holeBoards: () => this.holes.filter((h) => h.boarded).map((h) => ({ x: Math.round(h.x), y: Math.round(h.y), hp: Math.round(h.boardHealth) })),
			php: () => Math.round(this.player.health),
			facePlayer: (i) => { const z = this.zombies[i]; if (z) z.angle = Math.atan2(this.player.y - z.y, this.player.x - z.x); return !!z; },
			// Batch 5 integration probes: daily-challenge seed + kill-surge state.
			// (Lane B audio probes live on soundEngine.__test; Lane C probes are node-side.)
			b5Seed: () => this.runSeed,
			b5Beast: () => soundEngine.getSurge(),
			// Batch 9 (Lane 1): kill-surge state + deterministic decay hook.
			killSurge: () => +this.killSurge.toFixed(3),
			decaySurge: (dt) => { this.updateKillSurge(dt); return +this.killSurge.toFixed(3); },
			// Batch 9 (Lane 1): affinity link truth — tagged support boons apply
			// ONLY to weapons sharing at least one tag; untagged boons are universal.
			affLink: (boonId, weaponId) => supportApplies(String(boonId), String(weaponId)),
			// Batch 9 (Lane 1): score-multiplier state. timeLeft is in milliseconds.
			scoreMulState: () => {
				const p = this.activePowerups.find((x) => x.type === `score_surge`);
				return { active: this.hasPowerup(`score_surge`), timeLeft: p ? Math.max(0, Math.round(p.durationRemaining)) : 0, mult: 2 };
			},
			stepPowerups: (n = 1) => { for (let i = 0; i < Math.max(0, n | 0); i++) this.updatePowerups(1 / 60); return this.hasPowerup(`score_surge`); },
			// Batch 9 (Lane 1): deterministic score-multiplier schedule stepping.
			scoreMulSched: () => ({ nextAt: +this.nextScoreMulAt.toFixed(2), drops: this.drops.filter((d) => d.type === `score_surge`).length }),
			tickScoreMul: () => { this.updateScoreMulDrops(); return this.drops.filter((d) => d.type === `score_surge`).length; },
			forceScoreMul: () => { this.nextScoreMulAt = 0; this.updateScoreMulDrops(); return this.drops.filter((d) => d.type === `score_surge`).length; },
			setSneak: (v) => { this.forceSneak = !!v; this.player.isSneaking = !!v; return this.forceSneak; },
			// Batch 9 (Lane 1): roster + stage-rule run state.
			roster9: () => ({
				char: selectedCharacterId(), stage: selectedStageId(),
				dmgMul: +(this.runDamageMul || 1).toFixed(3),
				hsMul: +(this.runHeadshotMul || 1).toFixed(3),
				fireMul: +(this.shopFireRateMul || 1).toFixed(3),
				maxHp: Math.round(this.player.maxHealth),
				speed: +this.player.speed.toFixed(3),
				pickupMul: +(this.pickupRadiusMul || 1).toFixed(3),
				night: +(this.nightLengthMult || 1).toFixed(3),
				trees: (this.currentLocation.obstacles || []).length,
				treesBase: (this.pristineLocation?.obstacles || []).length,
				treeBase: (this.pristineLocation?.obstacles || []).filter((o) => o.type === `tree`).length,
				holes: this.holes.length, holesBase: this._holesBase9 ?? this.holes.length,
				barrels: this.explosiveBarrels.length, barrelsBase: this._barrelsBase9 ?? this.explosiveBarrels.length,
				gritMul: +(this.gritValueMul || 1).toFixed(3),
				zSpdMul: +(this.stageZombieSpeedMul || 1).toFixed(3),
				packMul: +(this.stageSpawnPackMul || 1).toFixed(3),
				eliteMul: +(this.eliteIntervalMul || 1).toFixed(3),
			}),
			// Lane B probes: per-level weapon tables, Konami secret, Hall of Records.
			b4Levels: (id, lv) => statsForLevel(id, lv),
			b4LevelsAll: () => Object.keys(WEAPON_LEVELS).map((id) => ({ id, l1: statsForLevel(id, 1).dmg, l5: statsForLevel(id, 5).dmg })),
			b4Konami: (keys) => matchKonami(keys),
			b4KonamiSeq: () => KONAMI_SEQUENCE,
			b4SecretWeapon: () => ({ ...SECRET_WEAPON }),
			b4DraftHasWompus: () => { for (let i = 0; i < 200; i++) { if (rollBoons({}, 0, 3).some((b) => b.hidden)) return true; } return false; },
			b4RecordRun: (score, kills, time, level) => recordRun({ score, kills, time, level, date: Date.now() }),
			b4TopRuns: () => topRuns(),
			// Lane C probes: adaptive music intensity, bomb echo, achievement arpeggio.
			musicIntensity: (x) => soundEngine.setIntensity(x),
			musicIntensityState: () => soundEngine.getIntensity(),
			bombEcho: () => soundEngine.playBombEcho(),
			achievement: () => soundEngine.playAchievement(),
			// Batch 2 probes: projectile mods, breakpoints, affixes, splitter, boss banner.
			playerPos: () => ({ x: this.player.x, y: this.player.y }),
			spawnAt: (t, x, y) => { const z = this.pushZombie(t, x, y); z.ai = `wander`; return this.zombies.indexOf(z); },
			zHealth: (i) => this.zombies[i] ? Math.round(this.zombies[i].health) : -1,
			zMax: (i) => this.zombies[i] ? Math.round(this.zombies[i].maxHealth) : -1,
			spawnElite2: () => { const z = this.spawnGuaranteedElite(); return { affix: z.affix, type: z.type }; },
			zombieMass: (t) => this.zombieMass(t),
			knockbackFor: (w, z) => +this.knockbackFor(w, z).toFixed(2),
			spawnBulletAt: (x, y, vx, vy, dmg = 50, wt = `revolver`) => { const b = Object.assign(this.allocBullet(), { x, y, vx, vy, damage: dmg, pierce: 1, rangeRemaining: 600, weaponType: wt, radius: 3, color: `#fff` }); this.bullets.push(b); return this.bullets.length; },
			bulletCount: () => this.bullets.length,
			clearBullets: () => { this.bullets.length = 0; },
			takeBoonDirect: (id) => { this.boonStacks[id] = (this.boonStacks[id] || 0) + 1; this.checkBreakpoint(id); return this.boonStacks[id]; },
			bp: () => ({ dmg: this.bpDamageMul, fire: this.bpFireMul, orb: this.bpOrbiters, chains: this.bpChains, blast: this.bpBlastMul }),
			forceAffix: (type, affix) => { const z = this.pushZombie(type, this.player.x + 120, this.player.y); z.elite = true; z.maxHealth = Math.round(z.maxHealth * 2.2); z.health = z.maxHealth; z.affix = affix; if (affix === `shielded`) z.shieldHp = Math.round(z.maxHealth * .3); return this.zombies.indexOf(z); },
			zAffix: (i) => this.zombies[i] ? this.zombies[i].affix : null,
			killAt: (i) => { const z = this.zombies[i]; if (z) this.killZombie(z, i); return this.zombies.length; },
			hurtBy: (i) => { const z = this.zombies[i]; this.invuln = 0; this.damagePlayer(z ? z.damage : 10, z); },
			chillState: () => Date.now() < this.chillUntil,
			bossBanner: () => { this.pushZombie(`behemoth`, this.player.x + 300, this.player.y); return { text: this.bannerText, live: Date.now() < this.bannerUntil }; },
			zCount: () => this.zombies.length,
			// VS-2 probes: evolutions, family affinity, elites, wave windows.
			forceEvo: () => this.checkEvolutions()?.evolvedName || null,
			weap: (id) => { const w = this.weapons.find((x) => x.id === id); return w ? { name: w.name, dmg: w.damage, pellets: w.pellets, pierce: w.pierce, mag: w.magazineSize } : null; },
			unlockW: (id) => { const w = this.weapons.find((x) => x.id === id); if (w) w.unlocked = true; },
			famMul: (wt) => this.playerDamageMul({ type: `shambler` }, wt),
			spawnElite: () => { const z = this.spawnGuaranteedElite(); return { elite: !!z.elite, hp: Math.round(z.maxHealth), type: z.type }; },
			eliteCount: () => this.zombies.filter((z) => z.elite).length,
			windowFor: (w) => this.windowFor(w).name,
			schedule: () => this.waveSchedule(),
			curWindow: () => this.currentWindowId,
			giveBoon: (id, n = 1) => { this.boonStacks[id] = Math.max(0, (this.boonStacks[id] || 0) + n); },
			// VS-3 probes: hit-feel, grit tiers/fusing, powerups, caches.
			feelState: () => ({ on: this.hitFeel, budget: +this.hitstopBudget.toFixed(3) }),
			setFeel: (on) => this.setHitFeel(on),
			resetFeel: () => { this.hitstop = 0; this.hitstopBudget = .3; this.shockwaves = []; this.slowAfter = 0; this.zoomPunch = 0; this.camKickX = 0; this.camKickY = 0; },
			doFeelKill: (big) => { const z = this.pushZombie(big ? `miner_brute` : `shambler`, this.player.x + 40, this.player.y); const hs0 = this.hitstop; this.feelKill(z); return { hs: +this.hitstop.toFixed(3), sw: this.shockwaves.length, slow: +this.slowAfter.toFixed(2), zp: +this.zoomPunch.toFixed(3) }; },
			feelHitTest: () => { const b = { vx: 100, vy: 0 }; const z = this.pushZombie(`shambler`, this.player.x + 40, this.player.y); this.feelHit(b, z); return { kick: +this.camKickX.toFixed(2) }; },
			whiff: () => { this.bashCd = 0; this.dodgeTimer = 0; const r = this.tryBash(); return { ok: r, feel: this.hitFeel }; },
			gritTier: (v) => { this.dropGritOrb(this.player.x + 50, this.player.y, 0, 0, v); return (this.grit[this.grit.length - 1] || {}).tier; },
			gritCount: () => this.grit.length,
			fuseNow: () => { this.fuseTimer = 1; this.updateFuse(1); return this.grit.map((g) => g.tier); },
			powerupState: () => ({ next: +this.nextPowerupAt.toFixed(1), sim: +this.simTime.toFixed(1), drops: this.drops.length }),
			waveInfo: () => ({ wave: this.wave, state: this.waveState, draft: !!this.draft, sim: +this.simTime.toFixed(1) }),
			forcePowerup: () => { this.nextPowerupAt = 0; this.updatePowerupDrops(); return this.drops.length; },
			spinN: (n) => { const out = {}; for (let i = 0; i < n; i++) { const s = this.spinCache().join(`-`); out[s] = (out[s] || 0) + 1; } return out; },
			applyCache: (syms, doubled) => { const r = this.applyCacheResult(syms, !!doubled); return { r, scrap: this.scrap, bomb: this.bombCharges }; },
			gambleF: (syms, win) => this.gambleCache(syms, !!win),
			dropCache: () => { this.dropCacheAt(this.player.x + 40, this.player.y); return this.caches.length; },
			openNearCache: () => { this.checkCachePickup(); return !!this.cacheOpen; },
			weapLevels: () => this.weapons.filter((w) => w.unlocked).map((w) => w.upgradeLevel),
			cacheJackpot: () => { const n = this.maxOutWeapons(); return { n, levels: this.weapons.filter((w) => w.unlocked).map((w) => w.upgradeLevel), max: WEAPON_MAX_TABLE_LEVEL }; },
			toneTest: () => { soundEngine.tone({ f: 440, dur: .05, vol: .01 }); return true; },
			openChest: () => this.openChest(),
			sweepGrit: () => this.sweepGritToBag(),
			spawnGritAt: (x, y, v) => this.dropGritOrb(x, y, 0, 0, v),
			fireEvent: (id) => { const ev = RUN_EVENTS.find((e) => e.id === id); if (ev && !this.firedEvents.includes(id)) this.fireEvent(ev); },
			noise: (x, y, r) => this.emitNoise(x, y, r),
			dynLightCount: () => this.dynLights.length,
			lightingOverlay: () => !!(this.lighting && this.lighting.darknessCanvas),
			hashCells: () => this.zhash.size,
			spawn150: (t = `shambler`) => { for (let i = 0; i < 150; i++) { const z = this.pushZombie(t, this.player.x + 400 + (i % 15) * 60, this.player.y + 400 + ((i / 15) | 0) * 60); z.ai = `wander`; } },
			// Batch 7 (Lane 1) probes: chain lightning, orbiters, behemoth phases,
			// haint clones, telegraphs, darkness, run-stat mods.
			equipB7: (id) => { const w = this.weapons.find((x) => x.id === id); if (w) w.unlocked = true; const i = this.weapons.findIndex((x) => x.id === id); return i >= 0 ? this.selectWeapon(i) : false; },
			b7Weapons: () => this.weapons.map((w) => w.id),
			chainInfo: () => ({ ...this.lastChain }),
			b7cfg: () => ({ chain: this.chainCfg(), orbiter: this.orbiterCfg() }),
			pinAll: () => { for (const z of this.zombies) { z.health = z.maxHealth = 1e6; } return this.zombies.length; },
			orbiterInfo: () => ({ count: this.orbiterBlades.length, radius: Math.round(this.orbiterCfg().orbiterRadius), blades: this.orbiterBlades.map((b) => ({ x: Math.round(b.x), y: Math.round(b.y) })) }),
			orbiterTick: (n = 1) => { this.rebuildZombieHash(); for (let i = 0; i < n; i++) { this.simTime += 1 / 60; this.updateOrbiters(1 / 60); } return this.orbiterBlades.length; },
			setOrbiterAngle: (a) => { this.orbiterAngle = a; return this.orbiterAngle; },
			behemothPhase: () => { const z = this.zombies.find((z) => z.type === `behemoth`); return z ? (z.bossPhase || `fight`) : `none`; },
			behemothInfo: () => { const z = this.zombies.find((z) => z.type === `behemoth`); return z ? { phase: z.bossPhase || `fight`, enraged: !!z.enraged, speed: +z.speed.toFixed(2), summoned: !!z.summoned } : null; },
			bossCharge: () => { const z = this.zombies.find((z) => z.type === `behemoth`); if (z) { z.chargeCd = 0; z.chargeWindupT = 0; } return !!z; },
			hurtZombie: (i, n) => { const z = this.zombies[i]; if (z) z.health -= n; return z ? Math.round(z.health) : -1; },
			haintClones: () => this.zombies.filter((z) => z.isClone).length,
			cloneInfo: () => { const z = this.zombies.find((z) => z.isClone); return z ? { type: z.type, hp: Math.round(z.health), dmg: z.damage } : null; },
			haintTick: () => { const z = this.zombies.find((z) => z.type === `haint` && !z.isClone); if (z) z.cloneCd = 0; return !!z; },
			telegraphs: () => this.telegraphs.length,
			stepB7: (n = 1) => { this.rebuildZombieHash(); for (let i = 0; i < n; i++) { this.simTime += 1 / 60; this.updateTelegraphs(1 / 60); this.updateOrbiters(1 / 60); } return this.telegraphs.length; },
			setDark: (v) => { this.dark = !!v; return this.dark; },
			isDark: () => this.dark,
			canSee: (i) => { const z = this.zombies[i]; return z ? this.zombieSees(z, Math.hypot(z.x - this.player.x, z.y - this.player.y)) : false; },
			telegraphInfo: () => this.telegraphs.map((t) => ({ kind: t.kind, t0: +t.t0.toFixed(3), dur: t.dur })),
			isLitAt: (x, y) => this.isLit(x, y),
			runMods: () => ({ dmg: this.runDamageMul || 1, hp: this.runHpMul || 1, spd: this.runSpeedMul || 1, xp: this.runXpMul || 1 }),
			reapplyRunMods: () => { this.applyRunStatMods(); this.applyRosterMods(); return { mods: { dmg: this.runDamageMul, hp: this.runHpMul, spd: this.runSpeedMul, xp: this.runXpMul }, hp: Math.round(this.player.maxHealth), spd: +this.player.speed.toFixed(4) }; },
			// Batch 8 (Lane A) probes: accel/friction, AI LOD, separation, arrive.
			stepPlayer: (n = 1) => { for (let k = 0; k < n; k++) this.updatePlayer(1 / 60); return { x: +this.player.x.toFixed(1), y: +this.player.y.toFixed(1) }; },
			pvel: () => ({ x: +this.moveVX.toFixed(3), y: +this.moveVY.toFixed(3), sp: +this.lastMoveSpeed.toFixed(3) }),
			dodge: () => this.tryDodge(),
			dodgeState: () => ({ timer: +this.dodgeTimer.toFixed(3), cd: +this.dodgeCd.toFixed(3), stam: Math.round(this.player.stamina) }),
			zSpd: (i) => this.zombies[i] ? +((this.zombies[i].lastSpd || 0).toFixed(3)) : -1,
			zLod: (i) => { const z = this.zombies[i]; return z ? { think: !!z.lodThink, off: z.lodOff ?? -1, ai: z.ai } : null; },
			zVel: (i) => { const z = this.zombies[i]; return z ? { vx: +((z.vx || 0).toFixed(3)), vy: +((z.vy || 0).toFixed(3)) } : null; },
		};
		let e = window.__controlsTest;
		e.teleport = (e, t) => {
			this.player.x = e, this.player.y = t, this.camX = e, this.camY = t;
			this.moveVX = 0;
			this.moveVY = 0;
			this.dodgeTimer = 0;
		}, e.getHoles = () => this.holes.map((e) => ({
			id: e.id,
			x: e.x,
			y: e.y,
			boarded: e.boarded,
			kind: e.kind
		})), e.boardNearest = () => {
			let e = this.nearestHole(9999);
			return e && this.boardHole(e), this.holes.filter((e) => e.boarded).length;
		}, e.getLantern = () => ({
			lit: this.lanternLit,
			wentOut: this.lanternWentOut,
			x: this.currentLocation.lantern?.x ?? 0,
			y: this.currentLocation.lantern?.y ?? 0
		}), e.snuffLantern = () => this.snuffLantern(), e.relightLantern = () => this.relightLantern(), e.emitNoise = (e = 480) => (this.alertZombies(this.player.x, this.player.y, e), this.noisePulses.length), e.getNoiseCount = () => this.noisePulses.length, e.armBell = () => {
			this.bellReady = true, this.bellRung = false;
		}, e.ringBell = () => this.ringBell(), e.getBell = () => ({
			ready: this.bellReady,
			rung: this.bellRung,
			hold: this.bellHold,
			lureUntil: this.bellLureUntil,
			extract: this.extractActive
		}), e.interact = () => this.interactLoreNote(), e.pullHorde = () => {
			this.zombies.forEach((z, i) => {
				const a = i / Math.max(1, this.zombies.length) * Math.PI * 2;
				z.x = this.player.x + Math.cos(a) * 110;
				z.y = this.player.y + Math.sin(a) * 90;
				z.ai = "chase";
			});
			return this.zombies.length;
		}, e.dodge = () => this.tryDodge(), e.bash = () => this.tryBash(), e.getKit = () => ({
			dodgeTimer: this.dodgeTimer,
			dodgeCd: this.dodgeCd,
			invuln: this.invuln,
			bloodRush: this.bloodRush,
			lastStandUsed: this.lastStandUsed,
			worldSlow: this.worldSlow,
			stamina: this.player.stamina,
			x: this.player.x,
			y: this.player.y
		}), e.forceLastStand = () => {
			this.lastStandUsed = false;
			this.invuln = 0;
			this.player.health = 8;
			this.damagePlayer(40);
			return {
				health: this.player.health,
				lastStandUsed: this.lastStandUsed,
				invuln: this.invuln
			};
		}, e.spawn = (type, x, y) => {
			this.pushZombie(type || "shambler", x, y);
			return this.zombies.length;
		}, e.setWeapon = (i) => this.selectWeapon(i), e.getWeapon = () => this.weapons[this.currentWeaponIndex].id, e.fire = () => this.fireCurrentWeapon(), e.holdFire = (on) => {
			this.isMouseDown = !!on;
		}, e.aimWorld = (x, y) => {
			this.player.angle = Math.atan2(y - this.player.y, x - this.player.x);
			this.player.flashlightAngle = this.player.angle;
			const cx = this.canvas.width / 2, cy = this.canvas.height / 2;
			this.mousePos.x = cx + Math.cos(this.player.angle) * 220;
			this.mousePos.y = cy + Math.sin(this.player.angle) * 220;
		}, e.getWorld = () => ({
			alive: this.isRunning && this.player.health > 0,
			paused: this.isPaused,
			health: this.player.health,
			stamina: this.player.stamina,
			x: this.player.x,
			y: this.player.y,
			weapon: this.weapons[this.currentWeaponIndex].id,
			mag: this.weapons[this.currentWeaponIndex].currentMag,
			reserve: this.weapons[this.currentWeaponIndex].reserveAmmo,
			scrap: this.scrap,
			score: this.score,
			wave: this.wave,
			waveState: this.waveState,
			waveWindow: this.windowFor(Math.max(1, this.wave)).name,
			waveSchedule: this.waveSchedule(),
			eliteIn: Math.max(0, Math.ceil(this.eliteIntervalSec() - (this.simTime - this.lastEliteAt))),
			break: this.waveBreakCountdown,
			kills: this.stats.kills,
			hint: this.interactHint,
			lantern: this.lanternLit,
			sneaking: this.player.isSneaking,
			bloodRush: this.bloodRush,
			lastStand: this.lastStandUsed,
			invuln: this.invuln,
			zombies: this.zombies.map((z) => ({ x: z.x, y: z.y, type: z.type, hp: z.health, ai: z.ai })),
			holes: this.holes.map((h) => ({ x: h.x, y: h.y, boarded: h.boarded })),
			map: { w: this.currentLocation.mapWidth, h: this.currentLocation.mapHeight, name: this.currentLocation.name },
		}), e.skipBreak = () => this.skipWaveBreak(), e.clues = () => ({
			armed: this.rigArmed,
			rig: this.rig ? { x: Math.round(this.rig.x), y: Math.round(this.rig.y), name: this.rig.name } : null,
			notes: this.loreNotes.map((n) => ({ id: n.id, x: Math.round(n.x), y: Math.round(n.y), blocked: this.checkObstacleCollision(n.x, n.y, 18, false) }))
		}), e.crank = () => {
			if (!this.rig) return false;
			this.rigArmed = true;
			this.rig.cool = 0;
			this.player.x = this.rig.x;
			this.player.y = this.rig.y + 40;
			return true;
		};
	}
	initLoreNotes() {
		this.loreNotes = [], this.currentLocation.loreNotes && this.currentLocation.loreNotes.length > 0 && (this.loreNotes = this.currentLocation.loreNotes.map((e) => ({
			...e,
			content: [...(e.content || [])],
			collected: false
		})));
		this.placeClues();
	}
	freeSpot(x, y) {
		const clear = (px, py) => {
			if (px < 40 || py < 40 || px > this.currentLocation.mapWidth - 40 || py > this.currentLocation.mapHeight - 40) return false;
			for (const o of this.currentLocation.obstacles || []) {
				if (px + 22 > o.x && px - 22 < o.x + o.width && py + 22 > o.y && py - 22 < o.y + o.height) return false;
			}
			const w = this.currentLocation.workbench;
			if (w && Math.hypot(px - w.x, py - w.y) < 88) return false;
			return true;
		};
		if (clear(x, y)) return { x, y };
		for (let t = 36; t <= 320; t += 18) {
			for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
				const px = x + Math.cos(a) * t, py = y + Math.sin(a) * t;
				if (clear(px, py)) return { x: px, y: py };
			}
		}
		return { x, y };
	}
	placeClues() {
		for (const note of this.loreNotes) {
			const p = this.freeSpot(note.x, note.y);
			note.x = p.x;
			note.y = p.y;
		}
		const names = {
			white_oak_springs: "Spring gun",
			mccords_ford: "Ford gun",
			stendal_backbone: "Highwall gun",
			petersburg_square: "Searchlight gun",
			winslow_still: "Still gun",
			honey_springs: "Store gun"
		};
		const name = names[this.currentLocation.id] || "Mounted gun";
		const anchor = this.loreNotes[0];
		const spot = this.freeSpot(anchor ? anchor.x + 110 : this.player.x + 80, anchor ? anchor.y + 20 : this.player.y);
		this.rig = { x: spot.x, y: spot.y, name, until: 0, cool: 0, shot: 0, angle: 0 };
		this.rigArmed = false;
		if (this.loreNotes[0]) this.loreNotes[0].content.push(`The ${name} is set nearby. Read this, then press E on the gun. It will hold a lane.`);
		if (this.loreNotes[1]) this.loreNotes[1].content.push("Something that still works was folded in the page. It is on the ground.");
		this.initJars();
	}
	initJars() {
		const w = this.currentLocation.mapWidth, h = this.currentLocation.mapHeight;
		const anchors = [[360, 340], [w - 360, 340], [360, h - 340], [w - 360, h - 360], [w * 0.5, 300]];
		this.jars = anchors.map(([x, y]) => {
			const p = this.freeSpot(x, y);
			return { x: p.x, y: p.y };
		});
	}
	initHoles() {
		let e = this.currentLocation.holes || [];
		this.holes = e.map((e, t) => ({
			id: `hole_${t}`,
			x: e.x,
			y: e.y,
			radius: e.kind === `pit` ? 28 : 22,
			boarded: false,
			boardHealth: 90,
			maxBoardHealth: 90,
			kind: e.kind
		}));
	}
	hasPowerup(e) {
		return this.activePowerups.some((t) => t.type === e && t.durationRemaining > 0);
	}
	activatePowerup(e) {
		if (soundEngine.playPowerup(), e === `nuke`) {
			this.detonateNuke();
			return;
		}
		// Batch 5: score_surge runs 15s (everything else 30s); HUD countdown is automatic via activePowerups.
		const dur = e === `score_surge` ? 15000 : 30000;
		let t = this.activePowerups.find((t) => t.type === e);
		t ? (t.durationRemaining = dur, t.totalDuration = dur) : this.activePowerups.push({
			type: e,
			durationRemaining: dur,
			totalDuration: dur
		}), e === `speed_boost` && (this.player.stamina = this.player.maxStamina);
	}
	detonateNuke() {
		soundEngine.playNuke(), this.screenShake = 14;
		for (let e = 0; e < 60; e++) {
			let e = Math.random() * Math.PI * 2, t = Math.random() * 500;
			this.particles.push(Object.assign(this.allocParticle(), {
				x: this.player.x + Math.cos(e) * t,
				y: this.player.y + Math.sin(e) * t,
				vx: (Math.random() - .5) * 12,
				vy: (Math.random() - .5) * 12,
				size: 5 + Math.random() * 8,
				color: Math.random() < .6 ? `#fde047` : `#f97316`,
				alpha: 1,
				life: .8 + Math.random() * .4,
				maxLife: 1.2,
				type: `fire`
			}));
		}
		this.zombies.length;
		for (let e = this.zombies.length - 1; e >= 0; e--) {
			let t = this.zombies[e];
			this.addScore(t.scoreValue), this.scrap += t.scrapValue, this.stats.kills++, this.bumpLifetime(`kills`), this.bloodDecals.push({
				x: t.x,
				y: t.y,
				radius: t.radius * 1.5,
				alpha: .8,
				rotation: Math.random() * Math.PI * 2
			});
		}
		this.zombies = [];
	}
	updatePowerups(e) {
		let t = e * 1e3;
		for (let e = this.activePowerups.length - 1; e >= 0; e--) {
			let n = this.activePowerups[e];
			n.durationRemaining -= t, n.durationRemaining <= 0 && this.activePowerups.splice(e, 1);
		}
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
			const gifts = {
				white_oak_springs: `speed_boost`,
				mccords_ford: `infinite_ammo`,
				stendal_backbone: `insta_kill`,
				petersburg_square: `double_points`,
				winslow_still: `molotov_pickup`,
				honey_springs: `moonshine_med`
			};
			const type = gifts[this.currentLocation.id] || `speed_boost`;
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
	initExplosiveBarrels() {
		this.explosiveBarrels = [], this.currentLocation.barrels && this.currentLocation.barrels.length > 0 && (this.explosiveBarrels = this.currentLocation.barrels.map((e, t) => ({
			id: `barrel_${t}_${Date.now()}`,
			x: e.x,
			y: e.y,
			radius: 18,
			health: 45,
			maxHealth: 45
		})));
	}
	setupListeners() {
		window.addEventListener(`keydown`, this.handleKeyDown), window.addEventListener(`keyup`, this.handleKeyUp), this.canvas.addEventListener(`mousemove`, this.handleMouseMove), this.canvas.addEventListener(`mousedown`, this.handleMouseDown), window.addEventListener(`mouseup`, this.handleMouseUp), this.canvas.addEventListener(`contextmenu`, (e) => e.preventDefault()), this.canvas.addEventListener(`wheel`, this.handleWheel, { passive: true });
	}
	destroy() {
		this.stop(), window.removeEventListener(`keydown`, this.handleKeyDown), window.removeEventListener(`keyup`, this.handleKeyUp), this.canvas.removeEventListener(`mousemove`, this.handleMouseMove), this.canvas.removeEventListener(`mousedown`, this.handleMouseDown), window.removeEventListener(`mouseup`, this.handleMouseUp), this.canvas.removeEventListener(`wheel`, this.handleWheel);
	}
	start(e = 1) {
		this.difficultyMultiplier = e, this.isRunning = true, this.isPaused = false, this.gameStartTime = Date.now(), this.lastTimestamp = performance.now(), this.wave = 0, this.waveState = `break`, this.waveBreakCountdown = 3, this.draftGraceUntil = 0, this.evolutionDone = {}, this.codexSeen = new Set(), this.gritBag = 0, this.bombCharges = 1, this.bombLastRegen = Date.now(), this.postRank = 1, this.firedEvents = [], this.activeEvents = [], this.extractActive = false, this.bellReady = false, this.bellRung = false, this.bellHold = 0, this.bellLureUntil = 0, this.lastBreakTick = Date.now(), this.streak = 0, this.streakTimer = 0, this.killSurge = 0, this.maxStreak = 0, this.lastStreakKill = -99, this.banishedBoons = new Set(), this.banishCharges = 2, this.scorchDecals = [], this.dmgFloaters = 0, this.lastEliteAt = 0, this.currentWindowId = ``, this.hitstopBudget = .3, this.slowAfter = 0, this.zoomPunch = 0, this.camKickX = 0, this.camKickY = 0, this.shockwaves = [], this.bloodSplats = [], this.slashBursts = [], this.hitFlashes = [], this.muzzlePunch = 0, this.gunKick = 0, this.gunKickT = 0, this.camPunchX = 0, this.camPunchY = 0, this.camPunchT = 0, this.whiffSlowT = 0, this.lastWhiff = null, this.lastKillWord = null, this.killWordCount = 0, this.fuseTimer = 0, this.nextPowerupAt = 80, this.nextScoreMulAt = 25, this.caches = [], this.cacheOpen = null, this.nextCacheAt = 150, this.bpDamageMul = 1, this.bpFireMul = 1, this.bpOrbiters = 0, this.bpChains = 0, this.bpBlastMul = 1, this.breakpointsHit = new Set(), this.bannerUntil = 0, this.chillUntil = 0, this.lockedBoons = new Set(), this.novaCd = 0, this.novaFlash = 0, this.missileCd = 0, this.vacuumSurge = 0, this.nextVacuumAt = 55, this.miniBossFired = new Set(), this.flankTimer = 0, this.cullTimer = 0, this.r7camInit = false, this.lastPx = null, this.lastPy = null, this.lanternLit = this.currentLocation.lantern ? !this.lanternWentOut : false, this.initHoles(), this.applyStageTerrain(), this.resetB7State(), this.applyMutators(), this.rebuildFlow(true), soundEngine.init(), soundEngine.startAtmosphericMusic(), this.initRunMeta(), this.applyRosterMods(), this.ensureB7Weapons(), this.lanternWentOut && !this.currentLocation.lantern && this.callbacks.onRadio?.(`Unknown`, `The lantern went out at the springs. They're thicker on the Trace.`), this.holes.length && this.callbacks.onRadio?.(`WJPS`, `Board those cellars or run the Trace. They come up through the floor if you linger.`), this.deathCineT = 0, this.deathFlash = 0, this.player.atkT = 0, this.player.bobPhase = Math.random() * Math.PI * 2, this._lastGameOver = null, this._lastPlayerPulse = { sx: 1, sy: 1 }, this._lastZombiePulse = { sx: 1, sy: 1 }, this.loop(performance.now());
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
	selectWeapon(e) {
		if (!this.weapons[e] || !this.weapons[e].unlocked) return false;
		this.codexSeen?.add(this.weapons[e].id);
		if (this.currentWeaponIndex !== e) {
			this.switchBanner = 1.6;
			this.spawnFloater(this.player.x, this.player.y - 44, this.weapons[e].name, "#d4a017");
			soundEngine.playPickup();
		}
		this.currentWeaponIndex = e;
		this.isReloading = false;
		return true;
	}
	nextWeapon() {
		let e = (this.currentWeaponIndex + 1) % this.weapons.length;
		for (; !this.weapons[e].unlocked && e !== this.currentWeaponIndex;) e = (e + 1) % this.weapons.length;
		this.selectWeapon(e);
	}
	prevWeapon() {
		let e = (this.currentWeaponIndex - 1 + this.weapons.length) % this.weapons.length;
		for (; !this.weapons[e].unlocked && e !== this.currentWeaponIndex;) e = (e - 1 + this.weapons.length) % this.weapons.length;
		this.selectWeapon(e);
	}
	reloadCurrentWeapon() {
		let e = this.weapons[this.currentWeaponIndex];
		if (e.reserveAmmo <= 0 && e.currentMag <= 0) {
			this.autoSwapFromDry();
			return;
		}
		!this.isReloading && e.currentMag < e.magazineSize && e.reserveAmmo > 0 && (this.isReloading = true, this.reloadStartTime = Date.now(), soundEngine.playReload(), e.id === `shotgun` && this.alertZombies(this.player.x, this.player.y, 240));
	}
	autoSwapFromDry() {
		const cur = this.weapons[this.currentWeaponIndex];
		if (cur.currentMag > 0 || cur.reserveAmmo > 0) return false;
		for (let i = 1; i < this.weapons.length; i++) {
			const idx = (this.currentWeaponIndex + i) % this.weapons.length;
			const w = this.weapons[idx];
			if (!w.unlocked) continue;
			if (w.currentMag > 0 || w.reserveAmmo > 0) {
				this.selectWeapon(idx);
				this.spawnFloater(this.player.x, this.player.y - 48, `${cur.name.split(" ").pop()} DRY`, "#e11d2e");
				this.callbacks.onRadio?.("Unknown", `${cur.name} is dry. ${w.name}.`);
				return true;
			}
		}
		this.spawnFloater(this.player.x, this.player.y - 44, "EMPTY", "#e11d2e");
		return false;
	}
	throwMolotov() {
		if (this.player.molotovs <= 0) return;
		this.player.molotovs--;
		let e = {
			id: Math.random().toString(),
			x: this.player.x,
			y: this.player.y,
			vx: Math.cos(this.player.angle) * 11,
			vy: Math.sin(this.player.angle) * 11,
			damage: 150,
			pierce: 1,
			rangeRemaining: 340,
			weaponType: `molotov`,
			isMolotov: true,
			radius: 6,
			color: `#f59e0b`
		};
		this.bullets.push(Object.assign(this.allocBullet(), e)), soundEngine.playGunshot(`molotov`), this.alertZombies(this.player.x, this.player.y, 360);
	}
	throwFlare() {
		if (this.player.flares <= 0 || this.isPaused) return false;
		this.player.flares--;
		this.bullets.push(Object.assign(this.allocBullet(), {
			id: Math.random().toString(),
			x: this.player.x + Math.cos(this.player.angle) * 22,
			y: this.player.y + Math.sin(this.player.angle) * 22,
			vx: Math.cos(this.player.angle) * 9.2,
			vy: Math.sin(this.player.angle) * 9.2,
			damage: 0,
			pierce: 1,
			rangeRemaining: 260,
			weaponType: `revolver`,
			isFlare: true,
			radius: 5,
			color: `#f6c453`
		}));
		soundEngine.playGunshot(`carbine`);
		this.spawnFloater(this.player.x, this.player.y - 36, "FLARE", "#f6c453");
		return true;
	}
	plantFlare(x, y) {
		this.flares.push({ x, y, until: this.simTime + 9, born: this.simTime });
		this.alertZombies(x, y, 560);
		this.spawnFloater(x, y - 18, "THEY HEAR IT", "#f6c453");
		soundEngine.playBottleShatter();
		for (let i = 0; i < 10; i++) {
			const a = Math.random() * Math.PI * 2;
			this.particles.push(Object.assign(this.allocParticle(), {
				x, y,
				vx: Math.cos(a) * (1 + Math.random() * 2),
				vy: Math.sin(a) * (1 + Math.random() * 2) - 1.2,
				size: 2 + Math.random() * 2,
				color: Math.random() < .5 ? `#f6c453` : `#c23b22`,
				alpha: 1,
				life: .45,
				maxLife: .45,
				type: `spark`
			}));
		}
	}
	updateOrbit(dt) {
		this.orbit = (this.orbit || 0) + dt * 2.6;
		const n = 2 + this.boon(`ring`) + this.bpOrbiters;
		const rad = 56;
		this.orbitPts = [];
		const dmg = 11 + this.boon(`ring`) * 4;
		const cell = 64;
		const grid = new Map<string, typeof this.zombies>();
		for (const z of this.zombies) {
			const k = ((z.x / cell) | 0) + `:` + ((z.y / cell) | 0);
			let a = grid.get(k);
			if (!a) { a = []; grid.set(k, a); }
			a.push(z);
		}
		const near = (x: number, y: number, cb: (z: (typeof this.zombies)[number]) => void) => {
			const cx = (x / cell) | 0, cy = (y / cell) | 0;
			for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) {
				const a = grid.get(ix + `:` + iy);
				if (!a) continue;
				for (const z of a) cb(z);
			}
		};
		for (let i = 0; i < n; i++) {
			const a = this.orbit + (Math.PI * 2 * i) / n;
			const x = this.player.x + Math.cos(a) * rad;
			const y = this.player.y + Math.sin(a) * rad;
			this.orbitPts.push({ x, y, a });
			near(x, y, (z) => {
				if (z.orbitHit && z.orbitHit > this.simTime) return;
				if (Math.hypot(z.x - x, z.y - y) > z.radius + 12) return;
				z.orbitHit = this.simTime + 0.5;
				z.health -= dmg;
				z.hitFlash = 0.06;
				this.stats.damageDealt += dmg;
			});
		}
	}
	updateStorm(dt) {
		const stacks = this.boon(`storm`);
		if (!stacks) return;
		this.stormCd -= dt;
		if (this.stormCd > 0) return;
		this.stormCd = Math.max(0.9, 2.2 - stacks * 0.25);
		const dmg = 26 + stacks * 14;
		let from = { x: this.player.x, y: this.player.y };
		let cur = null, best = 1e9;
		for (const z of this.zombies) {
			const d = Math.hypot(z.x - from.x, z.y - from.y);
			if (d < 520 && d < best) { best = d; cur = z; }
		}
		if (!cur) return;
		const hit = new Set();
		const chains = 2 + stacks + this.bpChains;
		for (let c = 0; c < chains && cur; c++) {
			hit.add(cur);
			cur.health -= dmg;
			cur.hitFlash = 0.08;
			this.stats.damageDealt += dmg;
			this.lightning.push({ x1: from.x, y1: from.y, x2: cur.x, y2: cur.y, life: 0.18 });
			from = cur;
			let nxt = null, bd = 1e9;
			for (const z of this.zombies) {
				if (hit.has(z)) continue;
				const d = Math.hypot(z.x - from.x, z.y - from.y);
				if (d < 200 && d < bd) { bd = d; nxt = z; }
			}
			cur = nxt;
		}
	}
	// Batch 3: volatile aura — a burning plasma field around the player.
	updateAura(dt) {
		const stacks = this.boon(`aura`);
		if (stacks <= 0) return;
		const R = 80 + stacks * 16;
		const dps = 14 + stacks * 9;
		for (const z of this.zombies) {
			const d = Math.hypot(z.x - this.player.x, z.y - this.player.y);
			if (d > R + z.radius) continue;
			z.health -= dps * dt;
			this.stats.damageDealt += dps * dt;
			z.hitFlash = Math.max(z.hitFlash, .04);
			z.auraTick = (z.auraTick || 0) + dt;
			if (z.auraTick > .5) {
				z.auraTick = 0;
				this.particles.push(Object.assign(this.allocParticle(), {
					x: z.x + (Math.random() - .5) * z.radius * 2,
					y: z.y + (Math.random() - .5) * z.radius * 2,
					vx: (Math.random() - .5) * 2, vy: -2 - Math.random() * 2,
					size: 3 + Math.random() * 3, color: `#c084fc`, alpha: .9,
					life: .4, maxLife: .4, type: `fire`
				}));
			}
		}
	}
	// Batch 4: time-curve difficulty — a smooth D(t) multiplier layered OVER the
	// wave system (VS-2's named windows are untouched; this multiplies with them).
	timeCurve(t = this.simTime) {
		return 1 + .85 * (1 - Math.exp(-t / 320));
	}
	// Batch 4: fixed mini-boss marks — guaranteed elites at 4:00 / 8:00 / 12:00,
	// drawn from the wave-unlocked pool via spawnGuaranteedElite.
	updateDirector() {
		for (const m of this.miniBossMarks) {
			if (this.simTime >= m && !this.miniBossFired.has(m)) {
				this.miniBossFired.add(m);
				this.spawnGuaranteedElite();
				this.spawnFloater(this.player.x, this.player.y - 64, `MINI-BOSS — THE COUNTY STIRS`, `#c77dff`);
			}
		}
	}
	// Batch 4: Still-Yard Burst — periodic radial nova of amber rounds.
	// Cooldown pattern (scarce-ammo rule doesn't apply); ranks add count.
	updateNova(dt) {
		this.novaFlash = Math.max(0, this.novaFlash - dt);
		const stacks = this.boon(`nova`);
		if (stacks <= 0) return;
		this.novaCd -= dt;
		if (this.novaCd > 0) return;
		this.novaCd = Math.max(1.5, 2.7 - stacks * .22);
		const n = 5 + stacks * 2;
		const dmg = 10 + stacks * 5;
		const sp = 14; // units/frame @60fps, like the gun rounds
		const off = Math.random() * Math.PI * 2;
		for (let i = 0; i < n; i++) {
			const a = off + (Math.PI * 2 * i) / n;
			const b = this.allocBullet();
			b.x = this.player.x; b.y = this.player.y;
			b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
			b.damage = dmg; b.pierce = 1; b.radius = 4;
			b.rangeRemaining = 400; b.weaponType = `nova`; b.color = `#fbbf24`;
			b.lastHit = null; b.lastHitCd = 0;
			this.bullets.push(b);
		}
		this.novaFlash = .25;
		this.stats.shotsFired += n;
		soundEngine.tone({ f: 220, f2: 880, type: `sawtooth`, dur: .18, vol: .15 });
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
	updateMissiles(dt) {
		const stacks = this.boon(`missiles`);
		if (stacks <= 0) return;
		this.missileCd -= dt;
		if (this.missileCd > 0) return;
		this.missileCd = Math.max(4.5, 7 - stacks * .5);
		const salvo = 1 + ((stacks / 2) | 0);
		for (let i = 0; i < salvo; i++) {
			const a = -Math.PI / 2 + (i - (salvo - 1) / 2) * .35;
			const sp = 5; // slow and heavy: ~300 u/s in engine units
			const b = this.allocBullet();
			b.x = this.player.x; b.y = this.player.y - 10;
			b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
			b.damage = 85 + stacks * 35; b.pierce = 1; b.radius = 6;
			b.rangeRemaining = 900; b.weaponType = `missiles`; b.color = `#f87171`;
			b.isMissile = true; b.missileTurn = 2.4; b.missileAoe = 78;
			b.lastHit = null; b.lastHitCd = 0;
			this.bullets.push(b);
		}
		this.stats.shotsFired += salvo;
		soundEngine.tone({ f: 140, f2: 420, type: `sawtooth`, dur: .3, vol: .2 });
	}
	// Batch 4: missile impact — small AoE with edge falloff.
	detonateMissile(n) {
		const R = n.missileAoe || 78;
		for (const z of this.zombies) {
			const d = Math.hypot(z.x - n.x, z.y - n.y);
			if (d > R + z.radius) continue;
			const f = 1 - .5 * (d / (R + z.radius));
			const dmg = Math.round(n.damage * f * this.playerDamageMul(z, n.weaponType));
			z.health -= dmg; z.hitFlash = .12; this.stats.damageDealt += dmg;
			this.createBloodParticles(z.x, z.y, Math.atan2(z.y - n.y, z.x - n.x));
		}
		this.shockwaves.push({ x: n.x, y: n.y, r: 8, maxR: R, life: .35, maxLife: .35, color: `#f87171` });
		this.addScorch(n.x, n.y, 60);
		this.screenShake = Math.max(this.screenShake, 5);
		this.trauma = Math.min(1, this.trauma + .3 * this.tune('shake') * this.motionScale());
		this.emitNoise(n.x, n.y, 420);
		soundEngine.playBarrelExplosion();
	}
	// Batch 4: Dust Devil — a pickup that vacuums every ground grit orb to the
	// player. Distinct from the level-up auto-vacuum: gems physically fly in.
	dropVacuumAt(x, y) {
		this.drops.push({ id: Math.random().toString(), type: `dust_devil`, x, y, amount: 1, duration: 4e4 });
	}
	updateVacuumDrops() {
		if (this.simTime >= this.nextVacuumAt) {
			this.nextVacuumAt = this.simTime + 55 + Math.random() * 25;
			const a = Math.random() * Math.PI * 2, d = 140 + Math.random() * 100;
			this.dropVacuumAt(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d);
			this.spawnFloater(this.player.x, this.player.y - 56, `DUST DEVIL SIGHTED`, `#7dd3fc`);
		}
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
	updateSalt(dt) {
		const stacks = this.boon(`salt`);
		if (!stacks) return;
		const R = 95 + stacks * 18;
		const dps = 9 + stacks * 5;
		for (const z of this.zombies) {
			const d = Math.hypot(z.x - this.player.x, z.y - this.player.y);
			if (d > R + z.radius) continue;
			z.health -= dps * dt;
			this.stats.damageDealt += dps * dt;
			z.saltTick = (z.saltTick || 0) + dt;
			if (z.saltTick > 0.4) { z.saltTick = 0; z.hitFlash = 0.05; }
		}
	}
	updateLightning(dt) {
		for (let i = this.lightning.length - 1; i >= 0; i--) {
			this.lightning[i].life -= dt;
			if (this.lightning[i].life <= 0) this.lightning.splice(i, 1);
		}
	}
	renderLightning(e) {
		if (!this.lightning.length) return;
		e.save();
		e.strokeStyle = `rgba(147, 197, 253, 0.9)`;
		e.lineWidth = 2.5;
		for (const l of this.lightning) {
			e.globalAlpha = Math.max(0, l.life / 0.18);
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
	updateBeacon(dt) {
		if (!this.beacon || this.beacon.done || this.waveState !== `active`) return;
		const d = Math.hypot(this.player.x - this.beacon.x, this.player.y - this.beacon.y);
		if (d < 48) this.beacon.hold += dt;
		else this.beacon.hold = Math.max(0, this.beacon.hold - dt * .5);
		if (this.beacon.hold < 2) return;
		this.beacon.done = true;
		const w = this.weapons[this.currentWeaponIndex];
		w.reserveAmmo += w.id === `shotgun` ? 6 : 10;
		this.player.health = Math.min(this.player.maxHealth, this.player.health + 22);
		this.spawnFloater(this.beacon.x, this.beacon.y - 24, "SUPPLY", "#d4a017");
		soundEngine.playPickup();
	}
	tickBounty(kind) {
		const b = this.bounty;
		if (!b || b.done || b.kind !== kind) return;
		b.have++;
		if (b.have < b.need) return;
		b.done = true;
		this.scrap += 40;
		this.stats.scrapCollected += 40;
		this.player.health = Math.min(this.player.maxHealth, this.player.health + 14);
		this.bountyBoostUntil = this.simTime + 8;
		this.spawnFloater(this.player.x, this.player.y - 32, "BOUNTY", "#d4a017");
		soundEngine.playPowerup();
	}
	updateRig(dt) {
		if (!this.rig || this.simTime > this.rig.until) return;
		this.rig.shot -= dt;
		if (this.rig.shot > 0) return;
		let best = null, bd = 480;
		for (const z of this.zombies) {
			const d = Math.hypot(z.x - this.rig.x, z.y - this.rig.y);
			if (d < bd) {
				bd = d;
				best = z;
			}
		}
		if (!best) return;
		this.rig.shot = 0.46;
		const a = Math.atan2(best.y - this.rig.y, best.x - this.rig.x);
		this.rig.angle = a;
		this.bullets.push(Object.assign(this.allocBullet(), {
			id: Math.random().toString(),
			x: this.rig.x + Math.cos(a) * 18,
			y: this.rig.y + Math.sin(a) * 18,
			vx: Math.cos(a) * 11,
			vy: Math.sin(a) * 11,
			damage: 48,
			pierce: 2,
			rangeRemaining: 460,
			weaponType: `splinter`,
			isSplinter: true,
			radius: 3.4,
			color: `#fde68a`
		}));
	}
	postStats() {
		return this.postRank >= 3
			? { dmg: 85, interval: .42, mag: 24, maxPosts: 3, cost: 0 }
			: this.postRank === 2
			? { dmg: 65, interval: .5, mag: 18, maxPosts: 2, cost: 300 }
			: { dmg: 46, interval: .58, mag: 14, maxPosts: 2, cost: 150 };
	}
	upgradePost() {
		if (this.postRank >= 3) return false;
		const cost = this.postStats().cost;
		if (this.scrap < cost) {
			this.spawnFloater(this.player.x, this.player.y - 36, `NEED ${cost} SCRAP`, `#8a7a64`);
			return false;
		}
		this.scrap -= cost;
		this.postRank++;
		const st = this.postStats();
		this.spawnFloater(this.player.x, this.player.y - 40, `POST MK${this.postRank}`, `#d4a017`);
		soundEngine.playPickup();
		this.callbacks.onRadio?.(`Unknown`, `Post rebuilt to mark ${this.postRank}. ${st.maxPosts > 2 ? `It'll hold a third post now.` : `Heavier tube, faster trigger.`}`);
		return true;
	}
	plantPost() {
		if (this.isPaused || !this.isRunning) return false;
		if (this.posts <= 0) {
			this.spawnFloater(this.player.x, this.player.y - 36, "NO POST", "#8a7a64");
			return false;
		}
		const ps = this.postStats();
		if (this.traps.filter((t) => t.kind === "post").length >= ps.maxPosts) {
			this.spawnFloater(this.player.x, this.player.y - 36, ps.maxPosts > 2 ? "THREE POSTS" : "TWO POSTS", "#8a7a64");
			return false;
		}
		const ang = this.player.angle;
		let x = this.player.x + Math.cos(ang) * 46;
		let y = this.player.y + Math.sin(ang) * 46;
		if (this.checkObstacleCollision(x, y, 16)) {
			x = this.player.x;
			y = this.player.y;
		}
		this.posts--;
		this.traps.push({ kind: "post", x, y, angle: ang, shot: 0.25, left: ps.mag, arm: 0, live: true, blown: false, dmg: ps.dmg, interval: ps.interval, hp: 70 });
		this.spawnFloater(x, y - 30, "POST", "#d4a017");
		soundEngine.playPickup();
		if (!this.toldPost) {
			this.toldPost = true;
			this.callbacks.onRadio?.("Unknown", "Cedar post and a deer rifle. It watches the lane until the tube is empty.");
		}
		return true;
	}
	dropPipe() {
		if (this.isPaused || !this.isRunning) return false;
		if (this.pipes <= 0) {
			this.spawnFloater(this.player.x, this.player.y - 36, "NO PIPE", "#8a7a64");
			return false;
		}
		if (this.traps.filter((t) => t.kind === "pipe").length >= 4) {
			this.spawnFloater(this.player.x, this.player.y - 36, "GROUND'S FULL", "#8a7a64");
			return false;
		}
		const ang = this.player.angle;
		let x = this.player.x + Math.cos(ang) * 32;
		let y = this.player.y + Math.sin(ang) * 32;
		if (this.checkObstacleCollision(x, y, 12)) {
			x = this.player.x - Math.cos(ang) * 24;
			y = this.player.y - Math.sin(ang) * 24;
		}
		this.pipes--;
		this.traps.push({ kind: "pipe", x, y, angle: 0.4, shot: 0, left: 0, arm: 0.8, live: false, blown: false });
		this.spawnFloater(x, y - 24, "PIPE", "#c23b22");
		soundEngine.playPickup();
		if (!this.toldPipe) {
			this.toldPipe = true;
			this.callbacks.onRadio?.("Unknown", "Stovepipe. Black powder and a percussion cap. Walk off it. They won't.");
		}
		return true;
	}
	packBetweenWaves() {
		if (this.pipes < 3) {
			this.pipes++;
			this.spawnFloater(this.player.x, this.player.y - 42, "PACKED A PIPE", "#c23b22");
		}
		if (this.wave > 0 && this.wave % 2 === 0 && this.posts < 2) {
			this.posts++;
			this.spawnFloater(this.player.x, this.player.y - 58, "CEDAR POST", "#d4a017");
		}
	}
	updateTraps(dt) {
		for (let i = this.traps.length - 1; i >= 0; i--) {
			const t = this.traps[i];
			if (t.blown) continue;
			if (t.kind === "pipe") {
				if (!t.live) {
					t.arm -= dt;
					if (t.arm <= 0) t.live = true;
					continue;
				}
				for (const z of this.zombies) {
					if (z.health <= 0) continue;
					if (Math.hypot(z.x - t.x, z.y - t.y) <= 34 + z.radius * 0.25) {
						this.blowPipe(t);
						break;
					}
				}
				continue;
			}
			t.shot -= dt;
			let best = null;
			let bd = 340;
			for (const z of this.zombies) {
				if (z.health <= 0) continue;
				const d = Math.hypot(z.x - t.x, z.y - t.y);
				if (d < bd) {
					bd = d;
					best = z;
				}
			}
			if (!best) continue;
			const want = Math.atan2(best.y - t.y, best.x - t.x);
			let da = want - t.angle;
			while (da > Math.PI) da -= Math.PI * 2;
			while (da < -Math.PI) da += Math.PI * 2;
			t.angle += da * Math.min(1, dt * 7);
			if (t.shot > 0) continue;
			t.shot = t.interval || 0.58;
			t.left--;
			const a = t.angle;
			this.bullets.push(Object.assign(this.allocBullet(), {
				id: Math.random().toString(),
				x: t.x + Math.cos(a) * 22,
				y: t.y + Math.sin(a) * 22,
				vx: Math.cos(a) * 14,
				vy: Math.sin(a) * 14,
				damage: t.dmg || 46,
				pierce: 1,
				rangeRemaining: 360,
				weaponType: `lever_rifle`,
				radius: 3.2,
				color: `#fefce8`
			}));
			soundEngine.playGunshot(`rifle`);
			this.alertZombies(t.x, t.y, 90, true);
			if (t.left <= 0) {
				this.spawnFloater(t.x, t.y - 22, "POST DRY", "#8a7a64");
				t.blown = true;
			}
		}
		if (this.traps.some((t) => t.blown)) this.traps = this.traps.filter((t) => !t.blown);
	}
	blowPipe(t) {
		if (!t || t.blown) return;
		const queue = [t];
		while (queue.length) {
			const bomb = queue.pop();
			if (!bomb || bomb.blown || bomb.kind !== "pipe") continue;
			bomb.blown = true;
			const R = 120;
			for (const z of this.zombies) {
				const d = Math.hypot(z.x - bomb.x, z.y - bomb.y);
				if (d > R + z.radius) continue;
				const fall = 1 - Math.min(1, d / (R + z.radius));
				const hit = 90 + 80 * fall;
				z.health -= hit;
				z.hitFlash = 0.3;
				z.stunUntil = this.simTime + 0.4;
				const n = d || 1;
				const push = fall * 14;
				z.vx += ((z.x - bomb.x) / n) * push;
				z.vy += ((z.y - bomb.y) / n) * push;
				this.stats.damageDealt += hit;
			}
			for (const o of this.traps) {
				if (o.blown || o === bomb || o.kind !== "pipe") continue;
				if (Math.hypot(o.x - bomb.x, o.y - bomb.y) > 70) continue;
				queue.push(o);
			}
			this.screenShake = Math.max(this.screenShake, 9);
			this.hitstop = Math.max(this.hitstop, (0.045) * this.tune('hitstop'));
			this.alertZombies(bomb.x, bomb.y, 260);
			soundEngine.playGunshot(`shotgun`);
			this.spawnFloater(bomb.x, bomb.y - 26, "STOVEPIPE", "#e11d2e");
			for (let k = 0; k < 18; k++) {
				const a = Math.random() * Math.PI * 2;
				const sp = 1.6 + Math.random() * 4.2;
				this.particles.push(Object.assign(this.allocParticle(), {
					x: bomb.x,
					y: bomb.y,
					vx: Math.cos(a) * sp,
					vy: Math.sin(a) * sp - 0.6,
					size: 3 + Math.random() * 4,
					color: Math.random() < 0.45 ? "#fde68a" : Math.random() < 0.5 ? "#c23b22" : "#44403c",
					alpha: 1,
					life: 0.35 + Math.random() * 0.25,
					maxLife: 0.55,
					type: "spark"
				}));
			}
		}
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
	initRunMeta() {
		const done = new Set(this.meta.questsDone);
		this.questDmgMul = 1 + (done.has(`first_blood`) ? .05 : 0) + (done.has(`deadeye`) ? .08 : 0) + (done.has(`exterminator`) ? .10 : 0);
		this.questMoveMul = done.has(`tracebound`) ? 1.05 : 1;
		this.shopDmgMul = 1;
		this.shopFireRateMul = 1;
		this.shopMagnetBonus = 0;
		this.shopBought = new Set();
		this.player.speed *= this.questMoveMul;
		if (done.has(`homesteader`)) this.player.maxHealth += 15;
		this.player.health = this.player.maxHealth;
		if (done.has(`relic_hunter`)) this.scrap += 40;
		this.meta.lifetime.runsPlayed++;
		saveMeta(this.meta);
		this.dashCharges = this.dashMax;
		this.dashTimer = 0;
		this.dashCd = 0;
		this.dashRegenT = 0;
		this.spawnShrines();
		this.rollShop(true);
		// Batch 7: run-stat mods from the meta lane (guarded — defaults hold if absent).
		this.applyRunStatMods();
	}
	// Batch 9 (Lane 1): stage terrain rules — tree density (location clone, never
	// mutates the shared GAME_LOCATIONS row), hole count, barrel count. Runs
	// early in start(), after initHoles() and before rebuildFlow(true) so the
	// flow field sees the extra trees.
	applyStageTerrain() {
		const num = (v, d) => typeof v === `number` && isFinite(v) ? v : d;
		let rules = {};
		try { rules = stageDef(selectedStageId()).rules || {}; } catch (err) { /* defaults hold */ }
		this.nightLengthMult = num(rules.nightLengthMult, 1);
		// NOTE: the sim has no night-duration timer (dark is a static per-map
		// flag), so nightLengthMult is stored on the run for the future night cycle.
		this.gritValueMul = num(rules.gritMult, 1);
		this.stageZombieSpeedMul = num(rules.zombieSpeedMult, 1);
		this.stageSpawnPackMul = num(rules.spawnPackMult, 1);
		this.eliteIntervalMul = num(rules.eliteIntervalMult, 1);
		// Tree density — clone the location; the shared row stays pristine.
		const treeMult = num(rules.treeDensityMult, 1);
		const pristine = this.pristineLocation || this.currentLocation;
		const base = pristine.obstacles || [];
		const trees = base.filter((o) => o.type === `tree`);
		const wantTrees = Math.round(trees.length * treeMult);
		if (wantTrees > trees.length && trees.length > 0) {
			const extra = [];
			for (let k = trees.length; k < wantTrees; k++) {
				const t = trees[k % trees.length];
				extra.push({ ...t, x: Math.round(t.x + (this.rng() * 180 - 90)), y: Math.round(t.y + (this.rng() * 180 - 90)) });
			}
			this.currentLocation = { ...pristine, obstacles: [...base, ...extra] };
		} else {
			this.currentLocation = pristine;
		}
		// Hole count — initHoles() already ran in start(); top up with jittered copies.
		const holeMult = num(rules.holeCountMult, 1);
		this._holesBase9 = this.holes.length;
		const wantHoles = Math.round(this.holes.length * holeMult);
		for (let k = this.holes.length; k < wantHoles; k++) {
			const src = this.holes[(this.rng() * this.holes.length) | 0];
			if (!src) break;
			this.holes.push({ id: `hole_x${k}`, x: Math.round(src.x + (this.rng() * 220 - 110)), y: Math.round(src.y + (this.rng() * 220 - 110)), radius: src.radius, boarded: false, boardHealth: 90, maxBoardHealth: 90, kind: src.kind });
		}
		// Barrels — re-init from the location data first so repeated starts stay idempotent.
		this.initExplosiveBarrels();
		const barrelMult = num(rules.barrelMult, 1);
		const baseBarrels = this.explosiveBarrels.length;
		this._barrelsBase9 = baseBarrels;
		const wantBarrels = Math.round(baseBarrels * barrelMult);
		for (let k = baseBarrels; k < wantBarrels; k++) {
			const src = this.explosiveBarrels[(this.rng() * baseBarrels) | 0];
			if (!src) break;
			this.explosiveBarrels.push({ id: `barrel_x${k}`, x: Math.round(src.x + (this.rng() * 160 - 80)), y: Math.round(src.y + (this.rng() * 160 - 80)), radius: 18, health: 45, maxHealth: 45 });
		}
	}
	// Batch 9 (Lane 1): character passive mods — applied in start() after
	// initRunMeta/applyRunStatMods so the meta-lane math is already settled.
	// Idempotent across repeated starts: the previous run's character slice is
	// divided/subtracted out before the new one lands.
	applyRosterMods() {
		const num = (v, d) => typeof v === `number` && isFinite(v) ? v : d;
		let mods = {};
		try { mods = characterDef(selectedCharacterId()).mods || {}; } catch (err) { /* defaults hold */ }
		this.runDamageMul = (this.runDamageMul || 1) * num(mods.damageMul, 1);
		this.runHeadshotMul = num(mods.headshotMul, 1);
		this.shopFireRateMul = (this.shopFireRateMul || 1) * num(mods.fireRateMul, 1);
		this.pickupRadiusMul = num(mods.pickupRadiusMul, 1);
		// Flat max-HP add: subtract the previous run's slice first.
		this.player.maxHealth = Math.max(1, this.player.maxHealth - this._charMaxHpAdd);
		this._charMaxHpAdd = Math.round(num(mods.maxHpAdd, 0));
		this.player.maxHealth += this._charMaxHpAdd;
		this.player.health = this.player.maxHealth;
		// Speed mul: divide out the previous run's slice first.
		if (this._charSpeedMul !== 1) this.player.speed = this.player.speed / this._charSpeedMul;
		this._charSpeedMul = num(mods.speedMul, 1);
		this.player.speed *= this._charSpeedMul;
	}
	// Batch 9 (Lane 1): stage elite-cadence rule (Honey Springs shortens it).
	eliteIntervalSec() {
		return 45 * (this.eliteIntervalMul || 1);
	}
	bumpLifetime(stat, n = 1) {
		this.meta.lifetime[stat] += n;
		for (const q of QUESTS) {
			if (this.meta.questsDone.includes(q.id)) continue;
			if (this.meta.lifetime[q.stat] >= q.goal) {
				this.meta.questsDone.push(q.id);
				saveMeta(this.meta);
				this.spawnFloater(this.player.x, this.player.y - 52, `COUNTY RECORD: ` + q.name, `#d4a017`);
				this.callbacks.onRadio?.(`WJPS`, `County record set: ${q.name}. ${q.bonus}.`);
				soundEngine.playPowerup();
				soundEngine.playAchievement();
			}
		}
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
		}
			if (z.type === `behemoth` || z.type === `miner_brute` || z.elite) {
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
	tryDash() {
		if (this.dashCd > 0 || this.dashTimer > 0 || this.dashCharges < 1) return false;
		let ix = 0, iy = 0;
		(this.keys.KeyW || this.keys.ArrowUp) && --iy;
		(this.keys.KeyS || this.keys.ArrowDown) && (iy += 1);
		(this.keys.KeyA || this.keys.ArrowLeft) && --ix;
		(this.keys.KeyD || this.keys.ArrowRight) && (ix += 1);
		let dx, dy;
		if (Math.hypot(ix, iy) > .2) {
			dx = ix;
			dy = iy;
		} else if (Math.hypot(this.moveVX, this.moveVY) > .35) {
			dx = this.moveVX;
			dy = this.moveVY;
		} else {
			dx = Math.cos(this.player.angle);
			dy = Math.sin(this.player.angle);
		}
		const m = Math.hypot(dx, dy) || 1;
		this.dashDirX = dx / m;
		this.dashDirY = dy / m;
		this.dashTimer = .34;
		this.dashCd = .9;
		this.invuln = Math.max(this.invuln, .36);
		this.dashCharges--;
		this.dashRegenT = 0;
		this.trauma = Math.min(1, this.trauma + .12 * this.tune('shake') * this.motionScale());
		soundEngine.playDodge();
		return true;
	}
	spawnShrines() {
		this.shrines = [];
		for (let i = 0; i < SHRINE_COUNT; i++) {
			const a = (i / SHRINE_COUNT) * Math.PI * 2 + Math.random() * .8;
			const d = 420 + Math.random() * 260;
			this.shrines.push({ x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d, attuned: false });
		}
	}
	nearShrine() {
		return this.shrines.find((s) => !s.attuned && Math.hypot(this.player.x - s.x, this.player.y - s.y) < 90);
	}
	tryAttuneShrine() {
		for (const s of this.shrines) {
			if (!s.attuned && Math.hypot(this.player.x - s.x, this.player.y - s.y) < 90) {
				s.attuned = true;
				this.bumpLifetime(`shrinesAttuned`);
				this.trauma = Math.min(1, this.trauma + .3 * this.tune('shake') * this.motionScale());
				soundEngine.playPowerup();
				this.spawnFloater(s.x, s.y - 30, `SHRINE ATTUNED`, `#d4a017`);
				this.callbacks.onRadio?.(`Unknown`, `The stones hum against your palm. Your rounds will bite the big ones harder now.`);
				return true;
			}
		}
		return false;
	}
	shopCost(def) {
		return Math.round(def.baseCost * (1 + .15 * Math.max(1, this.wave)));
	}
	rollShop(first = false) {
		const kept = this.shopOffers.filter((o) => o.locked);
		const pool = SHOP_POOL.filter((d) => !kept.some((k) => k.offerId === d.id) && (d.repeatable || !this.shopBought.has(d.id)) && !(d.kind === `unlock` && d.weaponId && this.weapons.some((w) => w.id === d.weaponId && w.unlocked)));
		const offers = kept.slice();
		while (offers.length < SHOP_OFFER_COUNT && pool.length) {
			const i = Math.floor(Math.random() * pool.length);
			offers.push({ offerId: pool.splice(i, 1)[0].id, locked: false });
		}
		this.shopOffers = offers;
		if (!first) this.shopRerollCost = SHOP_REROLL_BASE;
	}
	rerollShop() {
		if (this.waveState !== `break` || this.scrap < this.shopRerollCost) return false;
		this.scrap -= this.shopRerollCost;
		this.shopRerollCost *= 2;
		const kept = this.shopOffers.filter((o) => o.locked);
		const pool = SHOP_POOL.filter((d) => !kept.some((k) => k.offerId === d.id) && (d.repeatable || !this.shopBought.has(d.id)) && !(d.kind === `unlock` && d.weaponId && this.weapons.some((w) => w.id === d.weaponId && w.unlocked)));
		const offers = kept.slice();
		while (offers.length < SHOP_OFFER_COUNT && pool.length) {
			const i = Math.floor(Math.random() * pool.length);
			offers.push({ offerId: pool.splice(i, 1)[0].id, locked: false });
		}
		this.shopOffers = offers;
		soundEngine.playPickup();
		return true;
	}
	toggleShopLock(i) {
		const slot = this.shopOffers[i];
		if (!slot) return false;
		slot.locked = !slot.locked;
		soundEngine.playPickup();
		return true;
	}
	buyShopOffer(i) {
		const slot = this.shopOffers[i];
		if (!slot || this.waveState !== `break`) return false;
		const def = SHOP_POOL.find((d) => d.id === slot.offerId);
		if (!def || this.scrap < this.shopCost(def)) return false;
		if (!this.applyShopOffer(def)) return false;
		this.scrap -= this.shopCost(def);
		if (!def.repeatable) {
			this.shopBought.add(def.id);
			this.shopOffers.splice(i, 1);
		}
		soundEngine.playPickup();
		return true;
	}
	applyShopOffer(def) {
		const p = this.player;
		switch (def.kind) {
			case `heal`:
				if (p.health >= p.maxHealth) return false;
				p.health = Math.min(p.maxHealth, p.health + 50);
				return true;
			case `ammo`:
				let refilled = false;
				for (const w of this.weapons) {
					if (!w.unlocked) continue;
					const max = w.magazineSize * 6;
					if (w.reserveAmmo < max) {
						w.reserveAmmo = max;
						refilled = true;
					}
				}
				return refilled;
			case `maxhp`:
				p.maxHealth += 25;
				p.health = Math.min(p.maxHealth, p.health + 25);
				return true;
			case `molotov`:
				if (p.molotovs >= p.maxMolotovs) return false;
				p.molotovs++;
				return true;
			case `flare`:
				if (p.flares >= p.maxFlares) return false;
				p.flares++;
				return true;
			case `firerate`:
				this.shopFireRateMul *= 1.08;
				return true;
			case `dmg`:
				this.shopDmgMul *= 1.08;
				return true;
			case `speed`:
				p.speed *= 1.06;
				return true;
			case `magnet`:
				this.shopMagnetBonus += .3;
				return true;
			case `unlock`: {
				const w = this.weapons.find((w) => w.id === def.weaponId);
				if (!w || w.unlocked) return false;
				w.unlocked = true;
				this.codexSeen?.add(w.id);
				this.spawnFloater(p.x, p.y - 44, w.name + ` UNLOCKED`, `#d4a017`);
				return true;
			}
			case `bombcharge`:
				if (this.bombCharges >= BOMB_MAX_CHARGES) return false;
				this.bombCharges++;
				return true;
		}
		return false;
	}
	skipWaveBreak() {
		if (this.waveState !== `break` || this.extractActive || this.bellReady || this.draft || this.levelHold) return;
		this.waveBreakCountdown = 0;
		this.startNextWave();
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
		this.trauma = Math.max(0, this.trauma - e * 1.6);
		for (let t = this.floaters.length - 1; t >= 0; t--) {
			let n = this.floaters[t];
			n.y += n.vy * e, n.life -= e, n.life <= 0 && (n.onFree?.(), n.onFree = null, this.floaterPool.push(n), this.floaters.splice(t, 1));
		}
		this._simFrames = (this._simFrames || 0) + 1,
		this.updatePowerups(e), this.updatePlayer(e), this.updateWeapons(t), this.rebuildZombieHash(), this.updateBullets(e, t), this.updateAcidSpits(e), this.updateFirePuddles(t), this.updateFlares(e), this.updateRig(e), this.updateTraps(e), this.updateBeacon(e), this.updateOrbit(e), this.updateTelegraphs(e), this.updateOrbiters(e), this.updateStorm(e), this.updateSalt(e), this.updateAura(e), this.updateNova(e), this.updateMissiles(e), this.updateVacuumDrops(), this.updateDirector(), this.updateLightning(e), this.updateWaveManager(t), this.updateHordeEvents(e), this.updateBomb(), this.updateEvents(), this.updateFlankDirector(e), this.updateZombies(e, t), this.updateDrops(e), this.updateParticles(e), t - this.lastKillTime > 4500 && this.comboMultiplier > 1 && (this.comboMultiplier = 1), this.streakTimer > 0 && (this.streakTimer -= e, this.streakTimer <= 0 && (this.streak = 0, this.streakTimer = 0)), this.screenShake > 0 && (this.screenShake = Math.max(0, this.screenShake - e * 25)), this.muzzleFlashTimer > 0 && (this.muzzleFlashTimer -= e * 10), this.updateDynLights(e), this.updateLantern(), this.updateBellHold(e), this.updateNoisePulses(e), this.updateScorch(e), this.updateFeel(e), this.updatePowerupDrops(), this.updateScoreMulDrops(), this.updateCacheTimer(), this.updateFuse(e), this.updateKillSurge(e), this.updateBeastAudio(e);
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
	updatePlayer(e) {
		this.lastDt = e;
		let t = 0, n = 0;
		(this.keys.KeyW || this.keys.ArrowUp) && --n, (this.keys.KeyS || this.keys.ArrowDown) && (n += 1), (this.keys.KeyA || this.keys.ArrowLeft) && --t, (this.keys.KeyD || this.keys.ArrowRight) && (t += 1), (this.virtualJoystickMove.x !== 0 || this.virtualJoystickMove.y !== 0) && (t = this.virtualJoystickMove.x, n = this.virtualJoystickMove.y);
		let r = Math.hypot(t, n);
		r > 0 && (t /= r, n /= r);
		const sneaking = this.forceSneak || this.keys.ControlLeft || this.keys.ControlRight;
		this.player.isSneaking = !!sneaking;
		if (this.virtualJoystickAim.x !== 0 || this.virtualJoystickAim.y !== 0) this.player.angle = Math.atan2(this.virtualJoystickAim.y, this.virtualJoystickAim.x);
		else if (this.isMouseDown) {
			const wpt = this.screenToWorld(this.mousePos.x, this.mousePos.y);
			this.player.angle = Math.atan2(wpt.y - this.player.y, wpt.x - this.player.x);
		} else if (!sneaking) {
			const z = this.nearestTarget(this.aimReach());
			if (z) this.player.angle = Math.atan2(z.y - this.player.y, z.x - this.player.x);
		}
		this.player.flashlightAngle = this.player.angle;
		const aimX = Math.cos(this.player.angle);
		const aimY = Math.sin(this.player.angle);
		let i = this.hasPowerup(`speed_boost`);
		let a = sneaking;
		let o = (this.keys.ShiftLeft || this.keys.ShiftRight) && r > 0 && !a && this.player.stamina > 4;
		if (o && (this.player.stamina > 5 || i)) {
			this.player.isSprinting = true;
			if (!i) this.player.stamina = Math.max(0, this.player.stamina - e * 26);
		} else {
			this.player.isSprinting = false;
			this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + e * (r > 0 ? 12 : 20));
		}
		const sprintWant = this.player.isSprinting ? 1.55 : 1;
		this.sprintBlend += (sprintWant - this.sprintBlend) * (1 - Math.exp(-(this.player.isSprinting ? 7 : 11) * e));
		let gait = (this.player.isSneaking ? .5 : 1) * this.sprintBlend * (i ? 1.32 : 1);
		if (this.bloodRush > 0) gait *= 1.22;
		if (this.boon(`stride`)) gait *= 1 + this.boon(`stride`) * .06;
		// Batch 2: frosted chill slows the player.
		if (Date.now() < this.chillUntil) gait *= .7;
		if (r > 0) {
			const fwd = t * aimX + n * aimY;
			const side = t * -aimY + n * aimX;
			if (fwd < -.18) gait *= .68;
			else if (Math.abs(side) > Math.abs(fwd) + .12) gait *= .84;
		}
		const c = this.player.speed * gait;
		// Batch 8: acceleration / friction movement — velocity eases toward the
		// target instead of snapping. ~1800 u/s^2 accel toward input, ~2200 u/s^2
		// friction decay with no input. (moveVX is u per 1/60s tick, so the
		// per-second rates are divided by 60.) Roll/dash impulses below still
		// override velocity directly while their timers run.
		const ACCEL = 1800 / 60, FRICTION = 2200 / 60;
		if (r > 0) {
			const dvx = t * c - this.moveVX, dvy = n * c - this.moveVY;
			const dv = Math.hypot(dvx, dvy);
			if (dv > 0) {
				const step = Math.min(dv, ACCEL * e);
				this.moveVX += dvx / dv * step;
				this.moveVY += dvy / dv * step;
			}
		} else {
			const sp = Math.hypot(this.moveVX, this.moveVY);
			if (sp > 0) {
				const step = Math.min(sp, FRICTION * e);
				this.moveVX -= this.moveVX / sp * step;
				this.moveVY -= this.moveVY / sp * step;
				if (Math.hypot(this.moveVX, this.moveVY) < .05) {
					this.moveVX = 0;
					this.moveVY = 0;
				}
			}
		}
		this.lastMoveSpeed = Math.hypot(this.moveVX, this.moveVY);
		if (this.dodgeTimer > 0) {
			this.dodgeTimer = Math.max(0, this.dodgeTimer - e);
			this.moveVX = this.dodgeDirX * 9.6;
			this.moveVY = this.dodgeDirY * 9.6;
			this.lastMoveSpeed = 9.6;
			if (this.simTime * 40 % 1 < .35) this.afterimages.push({
				x: this.player.x,
				y: this.player.y,
				facing: this.bodyFacing,
				life: .18,
				maxLife: .18
			});
		}
		if (this.dashTimer > 0) {
			this.dashTimer = Math.max(0, this.dashTimer - e);
			this.moveVX = this.dashDirX * 13.5;
			this.moveVY = this.dashDirY * 13.5;
			this.lastMoveSpeed = 13.5;
			if (this.simTime * 40 % 1 < .5) this.afterimages.push({
					x: this.player.x,
					y: this.player.y,
					facing: this.bodyFacing,
				life: .22,
				maxLife: .22
			});
		}
		if (this.dashCd > 0) this.dashCd = Math.max(0, this.dashCd - e);
		if (this.dashCharges < this.dashMax) {
			this.dashRegenT += e;
			if (this.dashRegenT >= 5) {
				this.dashRegenT = 0;
				this.dashCharges++;
			}
		}
		if (this.lastMoveSpeed > .7) {
			if (this.moveVX > .55) this.bodyFacing = 1;
			else if (this.moveVX < -.55) this.bodyFacing = -1;
		} else if (aimX < -.38) this.bodyFacing = -1;
		else if (aimX > .38) this.bodyFacing = 1;
		this.bodyFacingSmooth += (this.bodyFacing - this.bodyFacingSmooth) * (1 - Math.exp(-16 * e));
		const stepRate = this.player.isSneaking ? 6.5 : this.player.isSprinting ? 12.5 : 8.6;
		const prevPhase = this.walkPhase;
		if (this.lastMoveSpeed > .4) {
			this.walkPhase += e * stepRate * Math.min(1.35, this.lastMoveSpeed / Math.max(.2, this.player.speed));
			const s0 = Math.sin(prevPhase);
			const s1 = Math.sin(this.walkPhase);
			if (this.footstepArmed && s0 <= 0 && s1 > 0) {
				this.footstepArmed = false;
				this.emitFootstep();
			}
			if (s1 < -.2) this.footstepArmed = true;
		} else {
			this.walkPhase += e * 1.4;
			this.footstepArmed = true;
		}
		this.recoilKick = Math.max(0, this.recoilKick - e * 16);
		const l = e * 60;
		const u = this.player.x + this.moveVX * l;
		const d = this.player.y + this.moveVY * l;
		const rad = this.player.radius;
		const clampX = (x) => Math.max(rad, Math.min(this.currentLocation.mapWidth - rad, x));
		const clampY = (y) => Math.max(rad, Math.min(this.currentLocation.mapHeight - rad, y));
		if (!this.checkObstacleCollision(u, this.player.y, rad)) this.player.x = clampX(u);
		else {
			const step = Math.max(3.2, Math.abs(this.moveVY) * l + 3);
			for (const sy of [this.player.y - step, this.player.y + step, this.player.y - step * 2, this.player.y + step * 2]) {
				if (!this.checkObstacleCollision(this.player.x, sy, rad * .92) && !this.checkObstacleCollision(u, sy, rad * .92)) {
					this.player.y = clampY(sy);
					if (!this.checkObstacleCollision(u, this.player.y, rad)) this.player.x = clampX(u);
					break;
				}
			}
		}
		if (!this.checkObstacleCollision(this.player.x, d, rad)) this.player.y = clampY(d);
		else {
			const step = Math.max(3.2, Math.abs(this.moveVX) * l + 3);
			for (const sx of [this.player.x - step, this.player.x + step, this.player.x - step * 2, this.player.x + step * 2]) {
				if (!this.checkObstacleCollision(sx, this.player.y, rad * .92) && !this.checkObstacleCollision(sx, d, rad * .92)) {
					this.player.x = clampX(sx);
					if (!this.checkObstacleCollision(this.player.x, d, rad)) this.player.y = clampY(d);
					break;
				}
			}
		}
		if (this.player.isSprinting && r > 0 && this.simTime - this.lastSprintNoise > .48) {
			this.lastSprintNoise = this.simTime;
			this.alertZombies(this.player.x, this.player.y, 160);
		}
	}
	emitFootstep() {
		if (!this.player.isSneaking) this.alertZombies(this.player.x, this.player.y, this.player.isSprinting ? 150 : 78, true);
		const dirX = this.lastMoveSpeed > .2 ? this.moveVX / this.lastMoveSpeed : 0;
		const dirY = this.lastMoveSpeed > .2 ? this.moveVY / this.lastMoveSpeed : 0;
		for (let i = 0; i < 3; i++) this.particles.push(Object.assign(this.allocParticle(), {
			x: this.player.x - dirX * 6 + (Math.random() - .5) * 8,
			y: this.player.y + 10 - dirY * 4 + (Math.random() - .5) * 4,
			vx: -dirX * .4 + (Math.random() - .5) * .6,
			vy: -.4 - Math.random() * .5,
			size: 1.6 + Math.random() * 2.2,
			color: "rgba(90, 74, 52, 0.55)",
			alpha: .7,
			life: .28 + Math.random() * .16,
			maxLife: .4,
			type: "dust"
		}));
	}
	tryDodge() {
		if (this.dodgeCd > 0 || this.dodgeTimer > 0 || this.player.stamina < 20) return false;
		let ix = 0, iy = 0;
		(this.keys.KeyW || this.keys.ArrowUp) && --iy;
		(this.keys.KeyS || this.keys.ArrowDown) && (iy += 1);
		(this.keys.KeyA || this.keys.ArrowLeft) && --ix;
		(this.keys.KeyD || this.keys.ArrowRight) && (ix += 1);
		let dx, dy;
		if (Math.hypot(ix, iy) > .2) {
			dx = ix;
			dy = iy;
		} else if (Math.hypot(this.moveVX, this.moveVY) > .35) {
			dx = this.moveVX;
			dy = this.moveVY;
		} else {
			dx = Math.cos(this.player.angle);
			dy = Math.sin(this.player.angle);
		}
		const m = Math.hypot(dx, dy) || 1;
		this.dodgeDirX = dx / m;
		this.dodgeDirY = dy / m;
		this.dodgeTimer = .22;
		this.dodgeCd = .58;
		this.invuln = Math.max(this.invuln, .24);
		this.player.stamina = Math.max(0, this.player.stamina - 22);
		this.alertZombies(this.player.x, this.player.y, 150);
		this.screenShake = Math.max(this.screenShake, 3.2);
		this.bodyFacing = this.dodgeDirX >= 0 ? 1 : -1;
		soundEngine.playDodge();
		this.spawnFloater(this.player.x, this.player.y - 28, "ROLL", "#d4a017");
		return true;
	}
	tryBash() {
		if (this.bashCd > 0 || this.dodgeTimer > 0) return false;
		this.bashCd = .7;
		this.bashSwing = .2;
		this.player.atkT = .05; // Batch 8 (Lane B): bash squash-and-stretch pulse.
		this.recoilKick = Math.max(this.recoilKick, 8);
		this.screenShake = Math.max(this.screenShake, 4);
		this.hitstop = Math.max(this.hitstop, (.045) * this.tune('hitstop'));
		this.alertZombies(this.player.x, this.player.y, 110);
		soundEngine.playBash();
		const ax = Math.cos(this.player.angle);
		const ay = Math.sin(this.player.angle);
		let hits = 0;
		for (const z of this.zombies) {
			const dx = z.x - this.player.x;
			const dy = z.y - this.player.y;
			const dist = Math.hypot(dx, dy) || 1;
			if (dist > 78 + z.radius) continue;
			if (dx * ax + dy * ay < 8) continue;
			if (Math.abs(dx * -ay + dy * ax) > 42) continue;
			const mass = z.type === "behemoth" ? 4.2 : z.type === "miner_brute" ? 2.6 : z.type === "bloater_spitter" ? 1.8 : z.type === "crawler" ? 0.7 : 1;
			const impulse = 13 / mass;
			const nx = dx / dist, ny = dy / dist;
			z.vx += nx * impulse;
			z.vy += ny * impulse;
			// Batch 5: riot shields blunt bashes too.
			const bdmg = this.applyAffixDefense(z, (z.type === "behemoth" ? 12 : 24) * this.playerDamageMul(z));
			z.health -= bdmg;
			z.hitFlash = .25;
			z.stunUntil = this.simTime + (z.type === "behemoth" ? .28 : .55);
			hits++;
			this.stats.damageDealt += 24;
			this.createBloodParticles(z.x, z.y, this.player.angle);
			// Batch 5: hit-track for kill spray + slash streak + body reaction.
			z.lastHitPower = 24; z.lastHitAngle = this.player.angle;
			this.addSlash(z.x, z.y, this.player.angle);
			this.reactHit(z, 24, this.player.angle);
			if (z.health <= 0) this.spawnFloater(z.x, z.y - 16, "BASH", "#e11d2e");
		}
		if (hits === 0) {
			this.spawnFloater(this.player.x + ax * 28, this.player.y + ay * 28, "WHIFF", "#8a7a64");
			// Batch 5: whiff — tiny 0.12x micro-slow + faint slash burst at the swing arc.
			this.whiffSlowT = .12;
			this.lastWhiff = { x: Math.round(this.player.x + ax * 46), y: Math.round(this.player.y + ay * 46), t: Date.now() };
			this.addSlash(this.player.x + ax * 46, this.player.y + ay * 46, this.player.angle, true);
		}
		if (hits === 0 && this.hitFeel) soundEngine.tone({ f: 700, f2: 180, type: `sine`, dur: .18, vol: .12 });
		return true;
	}
	updateHordeEvents(e) {
		if (this.waveState !== "active" || this.extractActive || this.bellReady || this.wave < 2) return;
		this.eventCd -= e;
		if (this.eventCd > 0) return;
		this.eventCd = 16 + Math.random() * 14;
		const roll = Math.random();
		const open = this.holes.filter((h) => !h.boarded);
		if (roll < .34 && open.length) {
			const hole = open[Math.floor(Math.random() * open.length)];
			for (let i = 0; i < 3; i++) {
				const a = Math.random() * Math.PI * 2;
				this.pushZombie("crawler", hole.x + Math.cos(a) * (hole.radius + 10), hole.y + Math.sin(a) * (hole.radius + 10));
			}
			this.callbacks.onRadio?.("WJPS", "They're coming up through the floor.");
			this.spawnFloater(hole.x, hole.y - 30, "HOLE BURST", "#c23b22");
		} else if (roll < .68) {
			for (let i = 0; i < 2; i++) {
				const edge = Math.floor(Math.random() * 4);
				let x = 60, y = 60;
				if (edge === 0) {
					x = 80 + Math.random() * (this.currentLocation.mapWidth - 160);
					y = 70;
				} else if (edge === 1) {
					x = 80 + Math.random() * (this.currentLocation.mapWidth - 160);
					y = this.currentLocation.mapHeight - 70;
				} else if (edge === 2) {
					x = 70;
					y = 80 + Math.random() * (this.currentLocation.mapHeight - 160);
				} else {
					x = this.currentLocation.mapWidth - 70;
					y = 80 + Math.random() * (this.currentLocation.mapHeight - 160);
				}
				this.pushZombie("sprinter", x, y);
			}
			this.callbacks.onRadio?.("WJPS", "Two on the ridge. They're running.");
		} else {
			this.fogUntil = 9;
			this.callbacks.onRadio?.("WJPS", "Fog in the bottoms. Watch your beam.");
		}
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
		let n = this.hasPowerup(`infinite_ammo`), r = n ? 1.4 : 1, i = this.isMouseDown || this.virtualJoystickAim.x !== 0 || this.virtualJoystickAim.y !== 0 || hunting, a = 1e3 / (t.fireRate * (1 + this.getPerkLevel(`quickdraw`) * .18) * (1 + (supportApplies(`trigger`, t.id) ? this.boon(`trigger`) : 0) * .1) * this.shopFireRateMul / this.bpFireMul * (1 + (this.comboMultiplier - 1) * .06) * r); // Batch 9: trigger fire-rate is affinity-gated.
		i && e - this.lastShotTime >= a && (t.currentMag > 0 || n ? (this.fireCurrentWeapon(), this.lastShotTime = e) : t.reserveAmmo > 0 ? this.reloadCurrentWeapon() : this.autoSwapFromDry());
	}
	nearestTarget(range) {
		let best = null, bd = range;
		for (const z of this.zombies) {
			if (z.health <= 0) continue;
			const d = Math.hypot(z.x - this.player.x, z.y - this.player.y);
			if (d < bd) {
				bd = d;
				best = z;
			}
		}
		return best;
	}
	fireCurrentWeapon() {
		let e = this.weapons[this.currentWeaponIndex];
		this.hasPowerup(`infinite_ammo`) || e.currentMag--;
		this.stats.shotsFired++;
		this.muzzleFlashTimer = e.id === `shotgun` ? 1.4 : e.id === `crossbow` ? .35 : 1;
		// Batch 5: on-shoot micro-layer — additive muzzle flash (~50ms),
		// gun kickback 4-6px (40ms yoyo), camera punch 2-4px (60ms).
		this.muzzlePunch = .05;
		this.gunKick = 4 + Math.random() * 2;
		this.gunKickT = .04;
		{
			const pa = this.player.angle, pd = 2 + Math.random() * 2;
			this.camPunchT = .06;
			this.camPunchX = -Math.cos(pa) * pd;
			this.camPunchY = -Math.sin(pa) * pd;
		}
		this.addLight(this.player.x + Math.cos(this.player.angle) * 30, this.player.y + Math.sin(this.player.angle) * 30, 340, .9, .12);
		this.recoilKick = Math.max(this.recoilKick, e.id === `shotgun` ? 12 : e.id === `lever_rifle` ? 9 : e.id === `chainsaw` ? 4 : e.id === `carbine` ? 3.5 : 7);
		if (e.id === `shotgun`) this.pumpAnim = 10;
		// Batch 3: shell casings + heavy self-knockback — guns feel mechanical.
		{
			const ca = this.player.angle + Math.PI / 2 + (Math.random() - .5) * .6;
			this.particles.push(Object.assign(this.allocParticle(), {
				x: this.player.x, y: this.player.y - 8,
				vx: Math.cos(ca) * (2 + Math.random() * 2), vy: Math.sin(ca) * (2 + Math.random() * 2) - 1,
				size: 2.5, color: `#fbbf24`, alpha: 1, life: .7, maxLife: .7, type: `casing`
			}));
			const shove = e.id === `shotgun` ? 11 : e.id === `lever_rifle` ? 7 : e.id === `revolver` ? 4 : 0;
			if (shove > 0) {
				this.moveVX -= Math.cos(this.player.angle) * shove;
				this.moveVY -= Math.sin(this.player.angle) * shove;
			}
		}
		soundEngine.playShotFor(soundEngine.kindForWeapon(e));
		const hear = this.weaponHearRadius(e.id) * (this.player.isSneaking ? 0.28 : 1);
		if (hear > 0) this.alertZombies(this.player.x, this.player.y, hear);
		if (e.id === `shotgun`) this.screenShake = 10 * this.tune('shake') * this.motionScale();
		else if (e.id === `lever_rifle`) this.screenShake = 6 * this.tune('shake') * this.motionScale();
		else if (e.id === `revolver`) this.screenShake = 5.5 * this.tune('shake') * this.motionScale();
		else if (e.id === `carbine`) this.screenShake = 1.6 * this.tune('shake') * this.motionScale();
		else if (e.id === `chainsaw`) this.screenShake = 2 * this.tune('shake') * this.motionScale();
		else this.screenShake = 2.5 * this.tune('shake') * this.motionScale();
		if (e.id === `shotgun` || e.id === `revolver` || e.id === `lever_rifle`) this.hitstop = Math.max(this.hitstop, (e.id === `shotgun` ? .04 : .02) * this.tune('hitstop'));
		const dmgMul = (1 + this.getPerkLevel(`hollowpoint`) * .2) * this.bpDamageMul * (this.evolved === `lincoln` && e.id === `revolver` ? 1.35 : 1) * (this.simTime < this.freshUntil ? 1.45 : 1) * (this.simTime < this.bountyBoostUntil ? 1.18 : 1); // Batch 9: lead lives in playerDamageMul now (affinity-gated).
		const choke = this.getPerkLevel(`choke`);
		if (e.id === `chainsaw`) {
			this.hitstop = Math.max(this.hitstop, (.03) * this.tune('hitstop'));
			const ax = Math.cos(this.player.angle);
			const ay = Math.sin(this.player.angle);
			for (const z of this.zombies) {
				const dx = z.x - this.player.x, dy = z.y - this.player.y;
				if (Math.hypot(dx, dy) > 70 + z.radius) continue;
				if (dx * ax + dy * ay < 6) continue;
				if (Math.abs(dx * -ay + dy * ax) > 38) continue;
				z.health -= e.damage * dmgMul;
				z.hitFlash = .2;
				z.x += ax * 8;
				z.y += ay * 8;
				this.stats.damageDealt += e.damage;
				this.createBloodParticles(z.x, z.y, this.player.angle);
			}
			for (let i = 0; i < 6; i++) this.particles.push(Object.assign(this.allocParticle(), {
				x: this.player.x + ax * 28,
				y: this.player.y + ay * 28,
				vx: ax * 2 + (Math.random() - .5) * 3,
				vy: ay * 2 + (Math.random() - .5) * 3,
				size: 2 + Math.random() * 2,
				color: "#fbbf24",
				alpha: .9,
				life: .2,
				maxLife: .25,
				type: "spark"
			}));
			if (e.currentMag === 0) this.reloadCurrentWeapon();
			return;
		}
		// Batch 7 (Lane 1): special weapon behaviors.
		if (e.id === `chainlightning`) {
			this.fireChainLightning(e, dmgMul);
			if (e.currentMag === 0) this.reloadCurrentWeapon();
			return;
		}
		if (e.id === `orbiter`) {
			this.fireOrbiterPulse(e, dmgMul);
			if (e.currentMag === 0) this.reloadCurrentWeapon();
			return;
		}
		const reach = this.aimReach();
		const longGun = e.id !== `shotgun` && e.id !== `chainsaw`;
		const shotRange = longGun ? Math.max(e.range, reach * 0.9) : e.range;
		const spread = e.id === `shotgun` ? Math.max(.16, .34 - choke * .05) : e.spread;
		const count = e.id === `shotgun` ? e.pellets + choke * 2 : e.pellets;
		const origin = e.id === `shotgun` ? 34 : e.id === `lever_rifle` ? 38 : 24;
		for (let n = 0; n < count; n++) {
			const jitter = (Math.random() - .5) * spread;
			const ang = this.player.angle + jitter;
			const spd = e.bulletSpeed * (.92 + Math.random() * .14);
			this.bullets.push(Object.assign(this.allocBullet(), {
				id: Math.random().toString(),
				x: this.player.x + Math.cos(this.player.angle) * origin,
				y: this.player.y + Math.sin(this.player.angle) * origin,
				vx: Math.cos(ang) * spd,
				vy: Math.sin(ang) * spd,
				damage: e.damage * dmgMul,
				critChance: e.critChance ?? 0,
				pierce: e.id === `revolver` && this.evolved === `lincoln` ? Math.max(e.pierce, 4) : e.pierce,
				rangeRemaining: e.id === `shotgun` ? shotRange * (.55 + Math.random() * .35) : shotRange,
				weaponType: e.id,
				isCrossbowBolt: e.id === `crossbow`,
				radius: e.id === `shotgun` ? 4.4 : e.id === `revolver` ? 4.2 : e.id === `carbine` ? 2.2 : e.id === `crossbow` ? 4 : 3.2,
				color: e.id === `shotgun` ? `#fdba74` : e.id === `revolver` ? `#fbbf24` : e.id === `lever_rifle` ? `#fefce8` : e.id === `carbine` ? `#fde047` : e.id === `crossbow` ? `#e2e8f0` : `#fef08a`
			}));
		}
		if (e.currentMag === 0 && e.id !== `chainsaw` && !this.hasPowerup(`infinite_ammo`)) this.fanTheCylinder();
		if (e.id === `shotgun`) {
			const ax = Math.cos(this.player.angle), ay = Math.sin(this.player.angle);
			for (let i = 0; i < 14; i++) {
				const j = (Math.random() - .5) * .7;
				this.particles.push(Object.assign(this.allocParticle(), {
					x: this.player.x + ax * 30,
					y: this.player.y + ay * 30,
					vx: Math.cos(this.player.angle + j) * (1.2 + Math.random() * 2.4),
					vy: Math.sin(this.player.angle + j) * (1.2 + Math.random() * 2.4),
					size: 3 + Math.random() * 4,
					color: "rgba(180, 140, 80, 0.7)",
					alpha: .7,
					life: .22 + Math.random() * .18,
					maxLife: .4,
					type: "dust"
				}));
			}
		}
		this.particles.push(Object.assign(this.allocParticle(), {
			x: this.player.x,
			y: this.player.y,
			vx: Math.cos(this.player.angle - Math.PI / 2) * (2 + Math.random() * 2),
			vy: Math.sin(this.player.angle - Math.PI / 2) * (2 + Math.random() * 2),
			size: e.id === `shotgun` ? 4 : 2.5,
			color: e.id === `shotgun` ? `#a16207` : `#eab308`,
			alpha: 1,
			life: .6,
			maxLife: .6,
			type: `shell`
		}));
		if (e.currentMag === 0) this.reloadCurrentWeapon();
	}
	updateBullets(e, t) {
		for (let t = this.bullets.length - 1; t >= 0; t--) {
			let n = this.bullets[t], r = e * 60;
			const ox = n.x, oy = n.y;
			// Batch 4: canary missiles — slow, heavy, limited turn rate toward the nearest dead man.
			if (n.isMissile) {
				const tgt = this.nearestZombie(n.x, n.y, 620);
				if (tgt) {
					const want = Math.atan2(tgt.y - n.y, tgt.x - n.x);
					const cur = Math.atan2(n.vy, n.vx);
					const turn = (n.missileTurn || 2.4) * e;
					let d = this.normalizeAngle(want - cur);
					d = Math.max(-turn, Math.min(turn, d));
					const sp = Math.hypot(n.vx, n.vy) || 5;
					n.vx = Math.cos(cur + d) * sp; n.vy = Math.sin(cur + d) * sp;
				}
				if ((this._simFrames & 1) === 0) this.particles.push(Object.assign(this.allocParticle(), {
					x: n.x - n.vx * .02, y: n.y - n.vy * .02,
					vx: (Math.random() - .5) * 1.5, vy: (Math.random() - .5) * 1.5,
					size: 3, color: `#fb923c`, alpha: .8, life: .3, maxLife: .3, type: `smoke`
				}));
			}
			// Batch 2: heatseeker — rounds curve toward the nearest dead man.
			// Batch 9: affinity-gated — only linked weapons' rounds hunt.
			if (this.boon(`seeker`) > 0 && supportApplies(`seeker`, n.weaponType) && !n.isFlare && !n.isMolotov && !n.isSplinter && !n.isMissile) {
				const tgt = this.nearestZombie(n.x, n.y, 300);
				if (tgt) {
					const want = Math.atan2(tgt.y - n.y, tgt.x - n.x);
					const cur = Math.atan2(n.vy, n.vx);
					const turn = 3.2 * e;
					let d = this.normalizeAngle(want - cur);
					d = Math.max(-turn, Math.min(turn, d));
					const sp = Math.hypot(n.vx, n.vy) || 400;
					n.vx = Math.cos(cur + d) * sp; n.vy = Math.sin(cur + d) * sp;
				}
			}
			n.x += n.vx * r;
			n.y += n.vy * r;
			n.rangeRemaining -= Math.hypot(n.vx, n.vy) * r;
			const mx = ox + (n.x - ox) * 0.5, my = oy + (n.y - oy) * 0.5;
			if (this.checkObstacleCollision(n.x, n.y, n.radius, false) || this.checkObstacleCollision(mx, my, n.radius, false)) {
				n.isFlare ? this.plantFlare(n.x, n.y) : this.createHitSparks(n.x, n.y, `#f59e0b`);
				this.freeBulletAt(t);
				continue;
			}
			let i = false;
			for (let e = this.explosiveBarrels.length - 1; e >= 0; e--) {
				let r = this.explosiveBarrels[e];
				// Batch 4: swept barrel test — fast rounds can't skip barrels either.
				if (this.segmentHitsCircle(ox, oy, n.x, n.y, n.radius, r.x, r.y, r.radius)) {
					if (n.isFlare) {
						this.plantFlare(n.x, n.y);
						this.freeBulletAt(t);
						i = true;
						break;
					}
					if (n.isMissile) {
						this.detonateMissile(n);
						this.freeBulletAt(t);
						i = true;
						break;
					}
					r.health -= n.damage, this.createHitSparks(n.x, n.y, `#ef4444`), soundEngine.playZombieHit(false), r.health <= 0 && this.detonateExplosiveBarrel(r, e), this.freeBulletAt(t), i = true;
					break;
				}
			}
			if (!i) {
				if (n.isMolotov && n.rangeRemaining <= 0) {
					this.detonateMolotov(n.x, n.y), this.freeBulletAt(t);
					continue;
				}
				if (n.isFlare && n.rangeRemaining <= 0) {
					this.plantFlare(n.x, n.y), this.freeBulletAt(t);
					continue;
				}
				if (n.rangeRemaining <= 0) {
					if (n.isMissile) this.detonateMissile(n);
					this.freeBulletAt(t);
					continue;
				}
				const bq = this.queryZombies((ox + n.x) / 2, (oy + n.y) / 2, Math.hypot(n.x - ox, n.y - oy) / 2 + this.zhashMaxR + n.radius, []);
				bq.sort((x, y) => y - x);
				if (n.lastHitCd > 0) n.lastHitCd -= e;
			for (const e of bq) {
					let r = this.zombies[e];
					if (!r) continue;
					const zi = e; // Batch 6: damage-path index for Lane B hit-flash.
					if (r === n.lastHit && n.lastHitCd > 0) continue;
					if (!this.segmentHitsCircle(ox, oy, n.x, n.y, n.radius, r.x, r.y, r.radius)) continue;
					{
						if (n.isFlare) {
							this.plantFlare(n.x, n.y);
							this.freeBulletAt(t);
							break;
						}
						if (n.isMissile) {
							this.detonateMissile(n);
							this.freeBulletAt(t);
							break;
						}
						this.stats.shotsHit++;
						let e = this.checkHeadshot(n, r), i = n.damage;
						// Batch 6: per-instance damage flash (Lane B) + per-weapon crit
						// (evolved signature bonus). No crit stacking with headshots.
						registerZombieHit(zi);
						if (!e && (n.critChance || 0) > 0 && Math.random() < n.critChance) {
							i *= 2;
							this.spawnFloater(r.x, r.y - r.radius, `CRIT`, `#fef08a`);
							soundEngine.playZombieHit(true);
						}
						this.hasPowerup(`insta_kill`) ? i = 99999 : e ? r.hasHelmet ? (r.hasHelmet = false, this.createHitSparks(r.x, r.y, `#eab308`), soundEngine.playZombieHit(false), i *= .6) : (i *= 2.4 * (this.runHeadshotMul || 1), this.stats.headshots++, this.bumpLifetime(`headshots`), soundEngine.playZombieHit(true)) : soundEngine.playZombieHit(false), i *= this.playerDamageMul(r, n.weaponType), i = this.applyAffixDefense(r, i), r.health -= i, this.stats.damageDealt += i;
						if (!n.isSplinter && r.health > 0 && r.health <= r.maxHealth * .2 && r.type !== `behemoth` && r.type !== `miner_brute`) r.health = 0;
						if (e) this.tickBounty(`head`);
						if (r.health <= 0 && !n.isSplinter) r.shatter = true;
						if (this.evolved === `lincoln` && n.weaponType === `revolver` && e) this.player.health = Math.min(this.player.maxHealth, this.player.health + 4);
						let a = Math.atan2(n.vy, n.vx), o = this.knockbackFor(n.weaponType, r.type);
						this.spawnForkChildren(n, a);
						// Batch 5: hit-track for the kill spray + slash streak + body reaction.
						r.lastHitPower = i; r.lastHitAngle = a;
						this.addSlash(n.x, n.y, a);
						this.reactHit(r, i, a);
						if (r.x += Math.cos(a) * o, r.y += Math.sin(a) * o, this.createBloodParticles(n.x, n.y, a), r.hitFlash = .08, e ? this.spawnFloater(r.x, r.y - r.radius, `HEAD`, `#ff4d3a`) : this.spawnDamageNumber(r.x, r.y - r.radius, i, `#e8b34b`), soundEngine.playImpact(), this.feelHit(n, r), i > 80 && (this.hitstop = Math.max(this.hitstop, (.04) * this.tune('hitstop'))), n.pierce--, n.pierce <= 0) {
							if (this.tryRicochet(n, r)) break;
							this.freeBulletAt(t);
							break;
						}
					}
				}
			}
		}
	}
	checkHeadshot(e, t) {
		let n = Math.atan2(e.y - t.y, e.x - t.x);
		return Math.abs(this.normalizeAngle(n - t.angle)) < .7;
	}
	normalizeAngle(e) {
		for (; e > Math.PI;) e -= Math.PI * 2;
		for (; e < -Math.PI;) e += Math.PI * 2;
		return e;
	}
	detonateMolotov(e, t) {
		let n = 95 * (1 + this.getPerkLevel(`moonshiner`) * .4), r = 6e3 + this.getPerkLevel(`moonshiner`) * 2500;
		this.firePuddles.push({
			id: Math.random().toString(),
			x: e,
			y: t,
			radius: n,
			duration: r,
			createdTime: Date.now()
		}), this.screenShake = 5 * this.tune('shake') * this.motionScale(), this.trauma = Math.min(1, this.trauma + .25 * this.tune('shake') * this.motionScale()), soundEngine.playBottleShatter(), this.addLight(e, t, 380, .95, .4), this.alertZombies(e, t, 380);
		for (let r of this.zombies) Math.hypot(r.x - e, r.y - t) <= n && (r.health -= 120, r.isBurning = 4e3);
	}
	detonateExplosiveBarrel(e, t) {
		this.emitNoise(e.x, e.y, 500),
		this.addLight(e.x, e.y, 420, 1, .5),
		this.explosiveBarrels.splice(t, 1), this.screenShake = 10 * this.tune('shake') * this.motionScale(), this.trauma = Math.min(1, this.trauma + .55 * this.tune('shake') * this.motionScale()), soundEngine.playBarrelExplosion(), this.addScorch(e.x, e.y, 90), this.alertZombies(e.x, e.y, 700), this.firePuddles.push({
			id: Math.random().toString(),
			x: e.x,
			y: e.y,
			radius: 105,
			duration: 5e3,
			createdTime: Date.now()
		});
		for (let t = 0; t < 35; t++) {
			let t = Math.random() * Math.PI * 2, n = 2 + Math.random() * 6;
			this.particles.push(Object.assign(this.allocParticle(), {
				x: e.x,
				y: e.y,
				vx: Math.cos(t) * n,
				vy: Math.sin(t) * n,
				size: 3 + Math.random() * 5,
				color: Math.random() < .6 ? `#ef4444` : Math.random() < .5 ? `#f97316` : `#78350f`,
				alpha: 1,
				life: .4 + Math.random() * .4,
				maxLife: .8,
				type: `smoke`
			}));
		}
		for (let t = this.zombies.length - 1; t >= 0; t--) {
			let n = this.zombies[t], r = Math.hypot(n.x - e.x, n.y - e.y);
			if (r <= 140) {
				let i = 1 - r / 140, a = 350 * (.4 + i * .6);
				n.health -= a, n.isBurning = 4e3;
				let o = Math.atan2(n.y - e.y, n.x - e.x);
				n.x += 18 * i * Math.cos(o), n.y += 18 * i * Math.sin(o), this.stats.damageDealt += a, this.beastDmgAcc = (this.beastDmgAcc || 0) + a, this.createBloodParticles(n.x, n.y, o), n.lastHitPower = a, n.lastHitAngle = o, n.chewAggroT = this.simTime + 3, n.health <= 0 && this.killZombie(n, t);
			}
		}
		let n = Math.hypot(this.player.x - e.x, this.player.y - e.y);
		if (n <= 140) {
			let e = 1 - n / 140;
			this.damagePlayer(Math.round(45 * e));
		}
		for (let t = this.explosiveBarrels.length - 1; t >= 0; t--) {
			let n = this.explosiveBarrels[t];
			Math.hypot(n.x - e.x, n.y - e.y) <= 140 && (n.health -= 250, n.health <= 0 && setTimeout(() => {
				let e = this.explosiveBarrels.indexOf(n);
				e !== -1 && this.detonateExplosiveBarrel(n, e);
			}, 120));
		}
	}
	updateFirePuddles(e) {
		for (let t = this.firePuddles.length - 1; t >= 0; t--) {
			let n = this.firePuddles[t];
			if (e - n.createdTime >= n.duration) {
				this.firePuddles.splice(t, 1);
				continue;
			}
			for (let e of this.zombies) Math.hypot(e.x - n.x, e.y - n.y) <= n.radius && (e.health -= .9, e.isBurning = 3e3);
			Math.hypot(this.player.x - n.x, this.player.y - n.y) <= n.radius && this.damagePlayer(.3);
		}
	}
	updateAcidSpits(e) {
		for (let t = this.acidSpits.length - 1; t >= 0; t--) {
			let n = this.acidSpits[t], r = e * 60;
			if (n.x += n.vx * r, n.y += n.vy * r, n.remainingDistance -= Math.hypot(n.vx, n.vy) * r, Math.hypot(this.player.x - n.x, this.player.y - n.y) <= this.player.radius + n.radius) {
				this.damagePlayer(n.damage), this.createHitSparks(n.x, n.y, `#84cc16`), this.acidSpits.splice(t, 1);
				continue;
			}
			(n.remainingDistance <= 0 || this.checkObstacleCollision(n.x, n.y, n.radius)) && (this.createHitSparks(n.x, n.y, `#84cc16`), this.acidSpits.splice(t, 1));
		}
	}
	updateWaveManager(e) {
		if (this.waveState === `break`) {
			if (this.extractActive || this.bellReady || this.draft) return;
			e - this.lastBreakTick >= 1e3 && (this.lastBreakTick = e, this.waveBreakCountdown--, this.waveBreakCountdown <= 0 && this.startNextWave());
			return;
		}
		const gap = this.lanternLit ? 480 : this.wave === 1 ? 220 : this.wave === 2 ? 200 : 240;
		if (this.zombiesToSpawn > 0 && e - this.lastZombieSpawnTime > gap) {
			this.spawnRandomZombie();
			this.zombiesToSpawn--;
			if (this.wave >= 2 && this.zombiesToSpawn > 0) {
				this.spawnRandomZombie();
				this.zombiesToSpawn--;
			}
			this.lastZombieSpawnTime = e;
		}
		// VS-2: guaranteed elite cadence — roughly every 45 seconds of run time.
		if (this.simTime - this.lastEliteAt >= this.eliteIntervalSec()) { // Batch 9 (Lane 1): stage elite-cadence rule.
			this.lastEliteAt = this.simTime;
			this.spawnGuaranteedElite();
		}
		if (this.zombiesToSpawn === 0 && this.zombies.length === 0) {
			this.packBetweenWaves(); this.sweepGritToBag();
			if (this.waveState = `break`, this.waveBreakCountdown = 6, this.stats.wavesCompleted++, this.bumpLifetime(`wavesCleared`), this.rollShop(), this.endlessMilestone(), this.scrap += 120 + this.wave * 25, soundEngine.playWaveHorn(), this.callbacks.onWaveComplete(this.wave), this.outbreakWaves > 0 && this.stats.wavesCompleted >= this.outbreakWaves) this.currentLocation.bell && !this.bellRung ? (this.bellReady = true, this.callbacks.onRadio?.(`WJPS Petersburg`, `The square is yours if you can ring it. Get to the tower before they take the steps.`)) : (this.extractActive = true, this.callbacks.onExtractReady?.());
			else {
				let e = radioFor(this.currentLocation.id, this.wave);
				this.callbacks.onRadio?.(e.call, e.body);
			}
		}
	}
	endlessMilestone() {
		if (this.outbreakWaves > 0 || this.wave % 5 !== 0) return;
		this.chests.push({ x: this.player.x + 60, y: this.player.y });
		this.player.health = Math.min(this.player.maxHealth, this.player.health + 30);
		this.spawnFloater(this.player.x, this.player.y - 56, `WAVE ${this.wave} — THE COUNTY PROVIDES`, "#ffd700");
		soundEngine.playPowerup();
	}
	eventMods() {
		const m = { gritMult: 1, enemySpeedMult: 1, enemyHpMult: 1, xpMult: 1 };
		for (const a of this.activeEvents) {
			const def = RUN_EVENTS.find((e) => e.id === a.id);
			if (!def) continue;
			for (const k of Object.keys(def.modifiers)) m[k] *= def.modifiers[k];
		}
		return m;
	}
	fireEvent(ev) {
		this.firedEvents.push(ev.id);
		this.activeEvents.push({ id: ev.id, endsAt: Date.now() + ev.durationSec * 1000 });
		this.spawnFloater(this.player.x, this.player.y - 72, ev.banner, "#ffd700");
		this.callbacks.onRadio?.(`WJPS Petersburg`, ev.radio);
		soundEngine.playWaveHorn();
		this.screenShake = Math.max(this.screenShake, 6);
	}
	updateEvents() {
		for (const ev of RUN_EVENTS) {
			if (this.firedEvents.includes(ev.id)) continue;
			const hit = ev.trigger.type === `wave` ? this.wave >= ev.trigger.wave : this.simTime >= ev.trigger.seconds;
			if (hit) this.fireEvent(ev);
		}
		const now = Date.now();
		for (let i = this.activeEvents.length - 1; i >= 0; i--) {
			if (now >= this.activeEvents[i].endsAt) this.activeEvents.splice(i, 1);
		}
	}
	updateBomb() {
		if (this.bombCharges < BOMB_MAX_CHARGES && Date.now() - this.bombLastRegen >= BOMB_REGEN_MS) {
			this.bombCharges++;
			this.bombLastRegen = Date.now();
			this.spawnFloater(this.player.x, this.player.y - 48, `BOMB READY`, "#fde68a");
			soundEngine.playPickup();
		}
	}
	detonateBomb() {
		if (!this.isRunning || this.isPaused || this.draft) return false;
		if (this.bombCharges <= 0) return false;
		this.bombCharges--;
		for (const z of this.zombies) {
			const dx = z.x - this.player.x, dy = z.y - this.player.y;
			const d = Math.hypot(dx, dy) || 1;
			if (d > BOMB_RADIUS + z.radius) continue;
			const mass = z.type === `behemoth` ? 4.2 : z.type === `miner_brute` ? 2.6 : z.type === `bloater_spitter` ? 1.8 : z.type === `crawler` ? 0.7 : 1;
			const imp = 20 / mass;
			z.vx += (dx / d) * imp;
			z.vy += (dy / d) * imp;
			// Batch 3: B-bomb falloff — full damage at ground zero, 35% at the rim.
			const bfall = BOMB_DMG * (.35 + .65 * (1 - d / (BOMB_RADIUS + z.radius)));
			z.health -= bfall;
			z.hitFlash = .3;
			this.stats.damageDealt += bfall;
			this.createBloodParticles(z.x, z.y, Math.atan2(dy, dx));
		}
		this.emitNoise(this.player.x, this.player.y, 700),
		this.addLight(this.player.x, this.player.y, 520, 1, .6),
		this.addScorch(this.player.x, this.player.y, 130),
		this.screenShake = Math.max(this.screenShake, 12 * this.tune('shake') * this.motionScale()), this.trauma = Math.min(1, this.trauma + .8 * this.tune('shake') * this.motionScale());
		this.hitstop = Math.max(this.hitstop, (.12) * this.tune('hitstop'));
		for (let k = 0; k < 28; k++) {
			const a = (Math.PI * 2 * k) / 28;
			this.particles.push(Object.assign(this.allocParticle(), { x: this.player.x, y: this.player.y, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, size: 5, life: .5, maxLife: .5, alpha: 1, color: `#fde68a` }));
		}
		this.spawnFloater(this.player.x, this.player.y - 64, `BOMB`, "#f97316");
		soundEngine.playNuke();
		return true;
	}
	checkEvolutions() {
		for (const r of EVOLUTIONS) {
			if (this.evolutionDone[r.baseWeapon]) continue;
			const w = this.weapons.find((x) => x.id === r.baseWeapon && x.unlocked);
			if (!evolutionReady(r, w, this.boonStacks)) continue;
			this.evolutionDone[r.baseWeapon] = true;
			this.codexSeen?.add(`evolution_${r.baseWeapon}`);
			w.name = r.evolvedName;
			// Batch 4: stash evolution mults so upgradeWeaponOnce can re-apply them
			// on top of the WEAPON_LEVELS table instead of wiping the bonus.
			w.evoDmgMul = r.dmgMul ?? 1.7; w.evoFireMul = r.fireMul ?? 1.35;
			w.evoPelletsAdd = r.pelletsAdd ?? 0; w.evoRangeMul = r.rangeMul ?? 1;
			w.evoProjSpeedMul = r.projSpeedMul ?? 1;
			w.damage = Math.round(w.damage * w.evoDmgMul);
			w.fireRate = +(w.fireRate * (r.fireMul ?? 1.35)).toFixed(2);
			// Batch 6 (Lane D): signature micro-tweaks — flat damage, per-weapon
			// crit chance (rolled in the bullet damage path), and cooldown.
			if (r.dmgBonus) w.damage = Math.round(w.damage * (1 + r.dmgBonus));
			if (r.critBonus) w.critChance = (w.critChance ?? 0) + r.critBonus;
			if (r.cdBonus) w.fireRate = +(w.fireRate / (1 - r.cdBonus)).toFixed(2);
			w.pierce = Math.max(w.pierce, r.pierceSet ?? 3);
			if (r.magMul) w.magazineSize = Math.round(w.magazineSize * r.magMul);
			if (r.pelletsAdd) w.pellets += r.pelletsAdd;
			if (r.spreadMul) w.spread *= r.spreadMul;
			if (r.projSpeedMul) w.bulletSpeed *= r.projSpeedMul;
			if (r.rangeMul) w.range *= r.rangeMul;
			w.description = r.evolvedDescription;
			this.hitstop = Math.max(this.hitstop, (.35) * this.tune('hitstop'));
			this.screenShake = Math.max(this.screenShake, 8 * this.tune('shake') * this.motionScale());
			this.spawnFloater(this.player.x, this.player.y - 36, `${r.evolvedName.toUpperCase()} EVOLVED`, "#f6c453");
			this.callbacks.onRadio?.(`Unknown`, r.evolvedRadio);
			soundEngine.playPowerup();
			return r;
		}
		return null;
	}
	evolutionHints() {
		const out = [];
		for (const r of EVOLUTIONS) {
			if (this.evolutionDone[r.baseWeapon]) continue;
			const w = this.weapons.find((x) => x.id === r.baseWeapon && x.unlocked);
			if (!w) continue;
			const have = this.boon(r.requiredBoon);
			let bit = `${w.name} + ${r.requiredBoonName} (${have}/${r.requiredStacks}) → ${r.evolvedName}`;
			// Batch 6: show max-level + filler-pick progress alongside the boon count.
			if (r.requiredPicks) {
				const fhave = this.boon(r.requiredPicks.boonId);
				bit += ` · ${r.requiredPicks.boonId} ${fhave}/${r.requiredPicks.count}`;
			}
			bit += ` · Lv ${w.upgradeLevel ?? 0}/${WEAPON_MAX_TABLE_LEVEL}`;
			out.push(bit);
		}
		return out;
	}
	startNextWave() {
		this.wave++, this.waveState = `active`;
		this.checkWindowChange();
		this.eventCd = this.wave === 1 ? 99 : 14 + Math.random() * 8;
		// Batch 4: D(t) time-curve multiplies the wave-system spawn count.
		let e = this.wave === 1 ? Math.floor(18 * this.difficultyMultiplier * this.timeCurve()) : Math.floor((16 + this.wave * 6 + Math.max(0, this.wave - 10) * 4) * this.difficultyMultiplier * this.timeCurve());
		if (this.wave > 1) e += 4;
		e = Math.floor(e * (this.stageSpawnPackMul || 1)); // Batch 9 (Lane 1): stage pack-size rule.
		this.lanternWentOut && (e = Math.floor(e * 1.22)), this.zombiesToSpawn = e, soundEngine.playWaveHorn();
		soundEngine.setHeat(Math.min(1, Math.max(0, this.wave - 1) / 7));
		this.waveCall = this.wave === 1 ? "Shamblers on the trace" : this.wave % 5 === 0 ? "Something big is walking" : this.wave >= 4 ? "Bloaters in the mix" : this.wave >= 3 ? "A miner in the dark" : "Sprinters this time";
		this.bounty = { kind: this.wave % 2 ? "head" : "kill", need: this.wave % 2 ? 4 : 8, have: 0, done: false };
		const spot = this.freeSpot(this.player.x + (this.wave % 2 ? 200 : -180), this.player.y + 120);
		this.beacon = { x: spot.x, y: spot.y, hold: 0, done: false };
		if (this.wave === 1) this.callbacks.onRadio?.("WJPS", "They're on the trace, and they are not walking. Supply drop is painted on the ground.");
		else this.callbacks.onRadio?.("WJPS", this.waveCall + ". Supply drop is out.");
	}
	farEdgeSpawn(minDist = 400) {
		const w = this.currentLocation.mapWidth;
		const h = this.currentLocation.mapHeight;
		const px = this.player.x, py = this.player.y;
		const edges = [
			{ x: 60 + this.rng() * (w - 120), y: 60 },
			{ x: 60 + this.rng() * (w - 120), y: h - 60 },
			{ x: 60, y: 60 + this.rng() * (h - 120) },
			{ x: w - 60, y: 60 + this.rng() * (h - 120) }
		];
		edges.sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py));
		for (const e of edges) {
			if (Math.hypot(e.x - px, e.y - py) >= minDist && !this.checkObstacleCollision(e.x, e.y, 16)) return e;
		}
		return edges[edges.length - 1];
	}
	// VS-2: guaranteed elite — the director never lets the pressure fully drop.
	spawnGuaranteedElite() {
		const pool = this.wave >= 8 ? [`behemoth`, `miner_brute`, `bloater_spitter`] : this.wave >= 5 ? [`miner_brute`, `bloater_spitter`, `riot`, `sprinter`] : [`sprinter`, `riot`, `bloater_spitter`];
		const type = pool[Math.floor(this.rng() * pool.length)];
		const edge = this.farEdgeSpawn(480);
		const z = this.pushZombie(type, edge.x, edge.y);
		if (!z.elite) {
			z.elite = true;
			z.maxHealth = Math.round(z.maxHealth * 2.2);
			z.health = z.maxHealth;
			z.speed = z.speed * 1.15;
			z.scoreValue = z.scoreValue * 3;
			z.scrapValue = Math.round(z.scrapValue * 2);
		}
		z.ai = `chase`;
		z.tx = this.player.x;
		z.ty = this.player.y;
		this.assignAffix(z);
		this.spawnFloater(z.x, z.y - z.radius - 14, `ELITE ${type.replace(`_`, ` `).toUpperCase()}`, `#c77dff`);
		this.callbacks.onRadio?.(`WJPS`, `Something big just walked out of the treeline. Watch yourself.`);
		soundEngine.playWaveHorn();
		return z;
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
	spawnRandomZombie() {
		const open = this.holes.filter((h) => !h.boarded);
		const nearHole = open.some((h) => Math.hypot(this.player.x - h.x, this.player.y - h.y) < 180);
		const holesLive = nearHole || !this.lanternLit || this.wave >= 2;
		let holeChance = 0;
		if (open.length && holesLive) holeChance = nearHole ? .82 : !this.lanternLit ? .7 : .28;
		let n = 0, r = 0, i = null;
		if (open.length && Math.random() < holeChance) {
			i = open[Math.floor(Math.random() * open.length)];
			const a = Math.random() * Math.PI * 2;
			n = i.x + Math.cos(a) * (i.radius + 8);
			r = i.y + Math.sin(a) * (i.radius + 8);
		} else {
			const edge = this.farEdgeSpawn(this.wave === 1 ? 520 : 380);
			n = edge.x;
			r = edge.y;
		}
		if (Math.hypot(n - this.player.x, r - this.player.y) < 360) {
			const edge = this.farEdgeSpawn(480);
			n = edge.x;
			r = edge.y;
			i = null;
		}
		let a = `shambler`, o = this.rng();
		if (this.wave === 1) a = o < .28 ? `sprinter` : `shambler`;
		else if (i) a = i.kind === `pit` && o < .45 ? `miner_brute` : `crawler`;
		else if (this.wave >= 5 && this.wave % 5 == 0 && this.zombiesToSpawn === 1) a = `behemoth`;
		else if (this.lanternWentOut && o < .18) a = `crawler`;
		else if (this.wave >= 4 && o < .2) a = `bloater_spitter`;
		else if (this.wave >= 3 && o < .3) a = `bomber`;
		else if (this.wave >= 4 && o < .4) a = this.rng() < .45 ? `riot_shield` : `riot`;
		else if (this.wave >= 3 && o < .5) a = `miner_brute`;
		else if (this.wave >= 2 && o < .72) a = `sprinter`;
		this.pushZombie(a, n, r);
	}
	pushZombie(e, t, n) {
		let r = 58, i = 2.15, a = 14, o = 17, s = `#475569`, c = false, l = 100, u = 15;
		// Batch 5: Behemoth stats come from the BOSSES table (constants.ts); the
		// engine still adds +wave*250 HP and keeps the legacy wave-5 spawn rule.
		const beh = e === `behemoth` ? bossFor(`behemoth`)?.bossOverrides : null;
		e === `crawler` ? (r = 32, i = 2.4, a = 8, o = 12, s = `#3f2e22`, l = 80, u = 8) : e === `sprinter` ? (r = 45, i = 3.45, a = 12, o = 15, s = `#991b1b`, l = 140, u = 20) : e === `miner_brute` ? (r = 220, i = 1.2, a = 25, o = 23, s = `#1e293b`, c = true, l = 250, u = 40) : e === `bloater_spitter` ? (r = 130, i = 1.05, a = 18, o = 21, s = `#65a30d`, l = 220, u = 35) : e === `bomber` ? (r = 45, i = 2.7, a = 12, o = 15, s = `#b45309`, l = 120, u = 18) : e === `riot` ? (r = 520, i = 0.85, a = 30, o = 24, s = `#3f3f46`, c = true, l = 300, u = 60) : e === `riot_shield` ? (r = 420, i = 0.95, a = 26, o = 23, s = `#52525b`, c = false, l = 350, u = 70) : e === `behemoth` && beh && (r = beh.health + this.wave * 250, i = beh.speed, a = beh.damage, o = beh.radius, s = beh.color, l = beh.scoreValue, u = beh.scrapValue);
		// Batch 7: Haint illusionist — pale drifter that multiplies itself.
		if (e === `haint`) { r = 90; i = 2.6; a = 12; o = 16; s = `#7c8db0`; l = 120; u = 22; }
		const em = this.eventMods();
		// Batch 6: smooth time-based HP scaling replaces the old per-wave HP step.
		// scalingAt(simTime) in constants.ts: hp = 1+gt/120. The speed/damage
		// columns stay available for future tuning passes (not wired yet).
		const sc = scalingAt(this.simTime);
		if (e !== `behemoth`) r = Math.round(r * sc.hp);
		let d = {
			id: Math.random().toString(),
			type: e,
			x: t,
			y: n,
			vx: 0,
			vy: 0,
			angle: 0,
			speed: i * (.9 + Math.random() * .2) * em.enemySpeedMult * (this.stageZombieSpeedMul || 1),
			// Batch 4: D(t) time-curve multiplies with wave scaling + event mods.
			maxHealth: Math.round(r * em.enemyHpMult * this.timeCurve()),
			health: Math.round(r * em.enemyHpMult * this.timeCurve()),
			damage: a,
			attackCooldown: 900,
			lastAttackTime: 0,
			atkT: 0, // Batch 8 (Lane B): lunge squash-and-stretch pulse timer (50ms), decayed in render.
			radius: o,
			color: s,
			hasHelmet: c,
			animationFrame: 0,
			scoreValue: l,
			scrapValue: u,
			spitCooldown: 2500,
			ai: e === `crawler` ? `chase` : `wander`,
			quietT: 6, spottedT: 0, // Batch 9 (Lane 1): stealth — seconds since last stimulus; spotted grace timer.
			flank: Math.random() < .5 ? -1 : 1,
			tx: t,
			ty: n,
			hearX: t,
			hearY: n,
			wanderAngle: Math.random() * Math.PI * 2,
			hitFlash: 0,
			spawnT: .15,
			// Batch 6 (Lane A): enemy-AI state.
			fuseT: 0, fuseBeepT: 0, spitCd: 2.2 + Math.random() * 1.6, strafeDir: 0,
			chewEvalT: 0, chewAtkT: 0, chewKind: ``, chewX: 0, chewY: 0,
			chewAggroT: -99, driftEvalT: 0, driftKind: ``, driftX: 0, driftY: 0
		};
		if (this.wave >= 2 && e !== `behemoth` && Math.random() < Math.min(.25, .08 + this.wave * .015)) {
			d.elite = true;
			d.maxHealth = Math.round(d.maxHealth * 2.2);
			d.health = d.maxHealth;
			d.speed = d.speed * 1.15;
			d.scoreValue = d.scoreValue * 3;
			d.scrapValue = Math.round(d.scrapValue * 2);
			this.assignAffix(d);
		}
		// Batch 5: riot_shield — riot-gear zombie with a shield pool on top of body HP.
		if (e === `riot_shield`) { d.shieldHp = Math.round(d.maxHealth * .35); d.shieldMax = d.shieldHp; }
		this.zombies.push(d), soundEngine.playZombieGroan(e === `crawler` ? `shambler` : e === `bomber` ? `bloater_spitter` : e === `riot` || e === `riot_shield` ? `miner_brute` : e);
		// Batch 2: boss entrance — Behemoth gets a banner and a warning motif.
		if (e === `behemoth`) this.bossEntrance(d);
		return d;
	}
	// Batch 3: flanking director — peels a fraction of the horde wide to punish turtling.
	updateFlankDirector(dt) {
		this.flankTimer -= dt;
		if (this.flankTimer > 0 || this.wave < 4) return;
		this.flankTimer = 6;
		const chasers = this.zombies.filter((z) => !z.elite && (z.ai === `chase` || z.ai === `investigate`) && z.type !== `bloater_spitter`);
		const want = Math.min(6, Math.ceil(chasers.length * .25));
		let assigned = 0;
		for (const z of chasers) {
			if (assigned >= want) break;
			if (z.flankUntil > this.simTime) continue;
			if (Math.random() < .5) continue;
			z.flankUntil = this.simTime + 10;
			z.flankSide = Math.random() < .5 ? -1 : 1;
			assigned++;
		}
	}
	// Batch 3: cull — recycle zombies past 1400u, hard cap 170. Keeps the sim bounded.
	cullZombies(dt) {
		this.cullTimer -= dt;
		if (this.cullTimer > 0) return;
		this.cullTimer = 2;
		const px = this.player.x, py = this.player.y;
		for (let n = this.zombies.length - 1; n >= 0; n--) {
			const z = this.zombies[n];
			if (Math.hypot(z.x - px, z.y - py) > 1400) this.zombies.splice(n, 1);
		}
		if (this.zombies.length > 170) {
			this.zombies.sort((a, b) => (Math.hypot(b.x - px, b.y - py) - Math.hypot(a.x - px, a.y - py)));
			this.zombies.length = 170;
		}
	}
	updateZombies(e, t) {
		this.cullZombies(e);
		// Batch 8: AI LOD tick — far zombies think on staggered 3rd ticks.
		this.zLodTick = (this.zLodTick || 0) + 1;
		for (let n = this.zombies.length - 1; n >= 0; n--) {
			let r = this.zombies[n];
			// Batch 3: spawn pop — nothing appears instantly.
			if (r.spawnT > 0) r.spawnT -= e;
			// Batch 2: affix behaviors — vampiric regen, leaping lunge.
			if (r.affix === `vampiric` && r.health < r.maxHealth) r.health = Math.min(r.maxHealth, r.health + r.maxHealth * .02 * e);
			// Batch 3: dasher archetype — sprinters telegraph a lunge burst.
			if (r.type === `sprinter` && r.affix !== `leaping`) {
				r.dashCd = (r.dashCd ?? 2) - e;
				if (r.dashTele > 0) {
					r.dashTele -= e;
					r.hitFlash = Math.max(r.hitFlash, .06);
					if (r.dashTele <= 0) {
						const da = Math.atan2(this.player.y - r.y, this.player.x - r.x);
						r.vx = (r.vx || 0) + Math.cos(da) * 380; r.vy = (r.vy || 0) + Math.sin(da) * 380;
						soundEngine.tone({ f: 300, f2: 700, type: `sawtooth`, dur: .15, vol: .1 });
					}
				} else if (r.dashCd <= 0 && Math.hypot(this.player.x - r.x, this.player.y - r.y) < 280) {
					r.dashTele = .35; r.dashCd = 3.5;
					// Batch 7: telegraphed lunge — the renderer drains state.telegraphs.
					this.pushTelegraph(`leap`, r.x, r.y, 120, .9);
				}
			}
			if (r.affix === `leaping`) {
				r.leapCd -= e;
				if (r.leapTele > 0) {
					r.leapTele -= e;
					if (r.leapTele <= 0) {
						const a = Math.atan2(this.player.y - r.y, this.player.x - r.x);
						r.vx = (r.vx || 0) + Math.cos(a) * 320; r.vy = (r.vy || 0) + Math.sin(a) * 320;
						this.createBloodParticles(r.x, r.y, a);
						soundEngine.tone({ f: 200, f2: 600, type: `sawtooth`, dur: .2, vol: .15 });
					}
				} else if (r.leapCd <= 0 && Math.hypot(this.player.x - r.x, this.player.y - r.y) < 320) {
					r.leapTele = .45; r.leapCd = 4;
					// Batch 7: telegraphed leap.
					this.pushTelegraph(`leap`, r.x, r.y, 140, .9);
					this.spawnFloater(r.x, r.y - r.radius - 20, `!`, `#ffffff`);
				}
			}
			if (r.isBurning && r.isBurning > 0 && (r.isBurning -= e * 1e3, r.health -= e * 35, Math.random() < .3 && this.particles.push(Object.assign(this.allocParticle(), {
				x: r.x + (Math.random() - .5) * r.radius,
				y: r.y + (Math.random() - .5) * r.radius,
				vx: (Math.random() - .5) * 1.5,
				vy: -1.5 - Math.random() * 2,
				size: 3,
				color: `#f97316`,
				alpha: .9,
				life: .4,
				maxLife: .4,
				type: `fire`
			}))), r.health <= 0) {
				this.killZombie(r, n);
				continue;
			}
			let i = this.player.x - r.x, a = this.player.y - r.y, o = Math.hypot(i, a);
			// Batch 7 (Lane 1): boss phases + haint illusionist tick.
			r.type === `behemoth` && this.tickBehemoth(r, o, e);
			r.type === `haint` && this.tickHaint(r, e);
			// Batch 6 (Lane A): bomber fuse runs before state logic — a lit bomber can't re-chase.
			if (r.type === `bomber` && !this.tickFuse(r, o, e, n)) continue;
			// Batch 6 (Lane A): structure-chewing utility decision (throttled inside).
			if (r.type !== `bomber` && (r.ai === `chase` || r.ai === `investigate` || r.ai === `chew`)) this.tickChew(r, o, e);
			// Batch 8: AI LOD — zombies farther than ~900u from the player run
			// their think (personality targeting, target selection, state changes)
			// every 3rd tick with a per-zombie stagger offset; movement integration
			// below still runs every tick. Timed behaviors (fuse, telegraphs,
			// spitter, chew attacks, boss ticks) are NOT gated.
			if (r.lodOff === undefined) r.lodOff = (((r.id.charCodeAt(0) || 7) * 31 + (r.id.charCodeAt(2) || 13)) % 3 + 3) % 3;
			const think = o <= 900 || (this.zLodTick + r.lodOff) % 3 === 0;
			r.lodThink = think;
			r.hitFlash > 0 && (r.hitFlash -= e);
			// Batch 5: body reactions decay — pop settles, squash yoyo + spin run out.
			r.yOff = (r.yOff || 0) * Math.max(0, 1 - e * 8);
			r.squashT = Math.max(0, (r.squashT || 0) - e);
			r.spinT = Math.max(0, (r.spinT || 0) - e);
			if (think) {
			let s = Math.hypot(r.hearX - r.x, r.hearY - r.y), c = this.simTime < this.bellLureUntil && this.currentLocation.bell;
			const lantern = this.currentLocation.lantern;
			if (this.lanternLit && lantern && r.type === `shambler` && (r.ai === `wander` || r.ai === `idle`)) r.wanderAngle = Math.atan2(lantern.y - r.y, lantern.x - r.x) + (Math.random() - .5) * .7;
			// Batch 9 (Lane 1): stealth — quiet timer. Engaged/spotted zombies are
			// stimulated; wanderers with no stimulus for 6s settle into idle.
			if (r.ai === `chase` || r.ai === `attack` || r.ai === `chew` || r.ai === `spotted`) r.quietT = 6;
			else {
				r.quietT -= e;
				if (r.ai === `wander` && r.quietT <= 0) r.ai = `idle`;
			}
			if (c && this.currentLocation.bell) {
				r.hearX = this.currentLocation.bell.x;
				r.hearY = this.currentLocation.bell.y;
				r.quietT = 6;
				r.ai = o <= r.radius + this.player.radius + 2 ? `attack` : `investigate`;
			} else if (r.ai !== `chew` && r.ai !== `spotted` && this.zombieSees(r, o)) {
				r.hearX = this.player.x;
				r.hearY = this.player.y;
				r.quietT = 6;
				// Batch 9 (Lane 1): a sneaking player seen by an idle/wandering zombie
				// SPOTS it instead of instantly aggroing — the grace resolves below.
				if (o <= r.radius + this.player.radius + 2) r.ai = `attack`;
				else if (this.player.isSneaking && (r.ai === `idle` || r.ai === `wander`)) { r.ai = `spotted`; r.spottedT = 1.6; }
				else r.ai = `chase`;
			} else if (r.ai === `chase` || r.ai === `attack`) r.ai = `investigate`;
			else if ((r.ai === `wander` || r.ai === `idle`) && s > 40 && (r.hearX !== r.x || r.hearY !== r.y)) r.ai = `investigate`;
			// Batch 9 (Lane 1): spotted grace — the player has ~1.6s to break sight
			// (stand the zombie back down to wander); un-sneaking, touching, or the
			// timer expiring commits it to the chase.
			if (r.ai === `spotted`) {
				r.spottedT -= e;
				r.quietT = 6;
				const touch = o <= r.radius + this.player.radius + 2;
				if (touch) r.ai = `attack`;
				else if (!this.player.isSneaking) r.ai = `chase`;
				else if (!this.zombieSees(r, o)) r.ai = `wander`;
				else if (r.spottedT <= 0) r.ai = `chase`;
				if (r.ai === `spotted`) { r.hearX = this.player.x; r.hearY = this.player.y; }
			}
			r.ai === `idle` ? (r.wanderAngle += (Math.random() - .5) * .4 * e, r.angle = r.wanderAngle, !(this.lanternLit && r.type === `shambler`) && this.tickDrift(r, e)) : r.ai === `wander` ? (r.wanderAngle += (Math.random() - .5) * .8 * e, r.angle = r.wanderAngle, !(this.lanternLit && r.type === `shambler`) && this.tickDrift(r, e)) : (r.ai === `investigate` || r.ai === `spotted`) ? (r.angle = Math.atan2(r.hearY - r.y, r.hearX - r.x), r.ai === `investigate` && s < 28 && (r.ai = `wander`)) : r.angle = Math.atan2(a, i),
			(r.ai === `investigate` || r.ai === `spotted` || r.ai === `wander` || r.ai === `idle`) && (r.tx = (r.ai === `investigate` || r.ai === `spotted`) ? r.hearX : r.x, r.ty = (r.ai === `investigate` || r.ai === `spotted`) ? r.hearY : r.y), r.type === `bloater_spitter` && this.tickSpitter(r, i, a, o, e);
			let flare = null, flareDist = 1e9;
			for (const fl of this.flares) {
				const fd = Math.hypot(fl.x - r.x, fl.y - r.y);
				if (fd < flareDist) { flareDist = fd; flare = fl; }
			}
			const melee = o <= r.radius + this.player.radius + 10;
			if (r.ai !== `chew` && flare && !melee && flareDist < 640 && (this.player.isSneaking || flareDist + 36 < o)) {
				r.hearX = flare.x;
				r.hearY = flare.y;
				r.quietT = 6; // Batch 9 (Lane 1): a fresh stimulus resets the quiet timer.
				r.ai = flareDist < 48 ? `wander` : `investigate`;
				r.angle = Math.atan2(flare.y - r.y, flare.x - r.x);
			}
			r.ai === `wander` && Math.random() < e * .1 && this.spawnFloater(r.x, r.y - 18, `...`, `#5b6470`);
			}
			r.type === `bloater_spitter` && this.tickSpitter(r, i, a, o, e);
			let u = r.speed;
			r.type === `behemoth` && r.health < r.maxHealth * .4 && (u *= 1.4), r.type === `behemoth` && r.enraged && (u *= this.behemothPhases.enrageSpeedMul), r.bossPhase === `charge` && (r.chargeWindupT > 0) && (u = 0), r.ai === `wander` && (u *= .35), r.ai === `idle` && (u *= .15), r.ai === `investigate` && (u *= .7), r.ai === `spotted` && (u = 0), r.type === `bloater_spitter` && (r.ai === `chase` || r.ai === `attack`) && o <= 420 && o >= 260 && (u *= .5);
			// Batch 8: arrive steering — damps approach speed within ~60u of the
			// target so the horde eases in instead of pile-driving at full speed.
			const stopD = r.radius + this.player.radius;
			if ((r.ai === `chase` || r.ai === `attack`) && o < stopD + 60) {
				const ak = Math.max(0, Math.min(1, (o - stopD) / 60));
				u *= .25 + .75 * ak;
			}
			r.lastSpd = u;
			if (r.stunUntil && this.simTime < r.stunUntil) u = 0;
			else if (this.worldSlow > 0) u *= .4;
			let d = e * 60, f, p;
			if ((r.ai === `chase` || r.ai === `attack` || r.ai === `chew`) && u > 0) {
				const flow = this.flow.dir(r.x, r.y);
				let dx = flow ? flow.x : Math.cos(r.angle);
				let dy = flow ? flow.y : Math.sin(r.angle);
				// Batch 8: personality targeting is think-gated (AI LOD) — on off
				// ticks the cached target + blend steer the body. Separation is
				// now a capped steering force (below), not a direction blend.
				if (think) {
					const pt = this.personalityTarget(r, i, a, o);
					r.tx = pt[0]; r.ty = pt[1]; r.pb = pt[2];
				}
				const pb = r.pb || 0;
				if (pb > 0) {
					const vx = r.tx - r.x, vy = r.ty - r.y, vl = Math.hypot(vx, vy) || 1;
					dx = dx * (1 - pb) + (vx / vl) * pb;
					dy = dy * (1 - pb) + (vy / vl) * pb;
				}
				if (o < 240 && o > 8 && r.type !== `behemoth` && r.type !== `miner_brute`) {
					const slot = ((r.id.charCodeAt(0) || 1) % 5) - 2;
					const px = -a / o, py = i / o;
					dx += px * slot * 0.2;
					dy += py * slot * 0.2;
				}
				const len = Math.hypot(dx, dy) || 1;
				dx /= len;
				dy /= len;
				r.angle = Math.atan2(dy, dx);
				f = dx * u * d;
				p = dy * u * d;
			} else {
				f = Math.cos(r.angle) * u * d;
				p = Math.sin(r.angle) * u * d;
			}
			let m = r.x + f, h = r.y + p;
			const beforeX = r.x, beforeY = r.y;
			const hitX = this.checkObstacleCollision(m, r.y, r.radius);
			const hitY = this.checkObstacleCollision(r.x, h, r.radius);
			const boardMul = 1 + this.wave * .04;
			if (hitX) {
				this.smashBarricadeAt(m, r.y, r.damage * .08);
				this.smashHoleAt(m, r.y, r.damage * .12 * boardMul);
			} else r.x = m;
			if (hitY) {
				this.smashBarricadeAt(r.x, h, r.damage * .08);
				this.smashHoleAt(r.x, h, r.damage * .12 * boardMul);
			} else r.y = h;
			if (u > 0 && (r.ai === `chase` || r.ai === `investigate` || r.ai === `attack` || r.ai === `chew`)) {
				const moved = Math.hypot(r.x - beforeX, r.y - beforeY);
				if (moved < 0.35) {
					r.stuck = (r.stuck || 0) + e;
					if (r.stuck > 0.45) {
						const side = ((r.id.charCodeAt(2) || 1) + Math.floor(r.stuck * 3)) % 2 === 0 ? 1 : -1;
						const ang = r.angle + side * (Math.PI / 2);
						const sx = r.x + Math.cos(ang) * 16;
						const sy = r.y + Math.sin(ang) * 16;
						if (!this.checkObstacleCollision(sx, r.y, r.radius * .85)) r.x = sx;
						if (!this.checkObstacleCollision(r.x, sy, r.radius * .85)) r.y = sy;
						r.angle = ang;
					}
				} else r.stuck = 0;
			} else r.stuck = 0;
			// Batch 8: separation steering — capped repulsion force from neighbors
			// within ~26u, queried via the 64u spatial hash. Applied as a steering
			// impulse on the knockback velocity channel (the drag below decays it),
			// so horde members drift apart instead of stacking.
			let sepx = 0, sepy = 0, snb = 0;
			const sq = this.queryZombies(r.x, r.y, 26 + (this.zhashMaxR || 0), []);
			for (const k of sq) {
				if (k === n || snb >= 6) continue;
				const oth = this.zombies[k];
				if (!oth || oth === r) continue;
				const ox = r.x - oth.x, oy = r.y - oth.y;
				const od2 = ox * ox + oy * oy;
				if (od2 >= 676 || od2 < 1) continue;
				const od = Math.sqrt(od2);
				const ow = 1 - od / 26;
				sepx += ox / od * ow;
				sepy += oy / od * ow;
				snb++;
			}
			const sepl = Math.hypot(sepx, sepy);
			if (sepl > .001) {
				const sepCap = 1.2, ssc = sepl > sepCap ? sepCap / sepl : 1;
				r.vx = (r.vx || 0) + sepx * ssc * .35;
				r.vy = (r.vy || 0) + sepy * ssc * .35;
			}
			if (r.vx || r.vy) {
				const kx = r.x + r.vx * d;
				const ky = r.y + r.vy * d;
				if (this.checkObstacleCollision(kx, r.y, r.radius * .8)) r.vx *= -0.25;
				else r.x = kx;
				if (this.checkObstacleCollision(r.x, ky, r.radius * .8)) r.vy *= -0.25;
				else r.y = ky;
				const drag = Math.exp(-6.5 * e);
				r.vx *= drag;
				r.vy *= drag;
				if (r.vx * r.vx + r.vy * r.vy < 0.04) {
					r.vx = 0;
					r.vy = 0;
				}
			}
			const sepX = r.x, sepY = r.y;
			for (let e = 0; e < this.zombies.length; e++) {
				if (n === e) continue;
				let t = this.zombies[e];
				const ix = r.x - t.x, iy = r.y - t.y;
				const minR = r.radius + t.radius;
				if (Math.abs(ix) >= minR || Math.abs(iy) >= minR) continue;
				const d2 = ix * ix + iy * iy;
				const min2 = minR * minR;
				if (d2 >= min2 || d2 < 0.01) continue;
				const dist = Math.sqrt(d2);
				const push = (minR - dist) * 0.5;
				const nxn = ix / dist, nyn = iy / dist;
				const approach = (t.vx - r.vx) * nxn + (t.vy - r.vy) * nyn;
				if (approach > 1.2) {
					const share = approach * 0.55;
					r.vx += nxn * share;
					r.vy += nyn * share;
					t.vx -= nxn * share * 0.45;
					t.vy -= nyn * share * 0.45;
				}
				const nx = r.x + nxn * push, ny = r.y + nyn * push;
				if (!this.checkObstacleCollision(nx, ny, r.radius * .8)) {
					r.x = nx;
					r.y = ny;
				}
			}
			if (this.checkObstacleCollision(r.x, r.y, r.radius * .7)) {
				r.x = sepX;
				r.y = sepY;
			}
			// Batch 8 (Lane B): lunge squash-and-stretch pulse (r.atkT).
			o <= r.radius + this.player.radius && t - r.lastAttackTime >= r.attackCooldown && (r.lastAttackTime = t, r.atkT = .05, this.invuln <= 0 && (this.lastKiller = r.type, r.damage > 0 && this.damagePlayer(this.zombieMeleeDmg(r), r)));
		}
	}
	boneBurst(z) {
		const extra = this.boon(`bone`);
		const count = (z.type === `behemoth` ? 6 : 3) + extra;
		const dmg = (z.type === `behemoth` ? 48 : z.type === `miner_brute` || z.type === `bloater_spitter` ? 55 : 70) + extra * 10;
		const near = this.zombies
			.map((o) => ({ o, d: Math.hypot(o.x - z.x, o.y - z.y) }))
			.filter((n) => n.d < 200 * this.bpBlastMul && n.d > 0)
			.sort((a, b) => a.d - b.d)
			.slice(0, count);
		const fire = (a) => this.bullets.push(Object.assign(this.allocBullet(), {
			id: Math.random().toString(),
			x: z.x,
			y: z.y,
			vx: Math.cos(a) * 9,
			vy: Math.sin(a) * 9,
			damage: dmg,
			pierce: 1,
			rangeRemaining: 180 + extra * 20,
			weaponType: `splinter`,
			isSplinter: true,
			radius: 3.6,
			color: `#f6c453`
		}));
		if (!near.length) {
			for (let i = 0; i < count; i++) fire((Math.PI * 2 * i) / count);
			return;
		}
		for (const n of near) fire(Math.atan2(n.o.y - z.y, n.o.x - z.x));
	}
	fanTheCylinder() {
		for (let i = 0; i < 8; i++) {
			const a = (Math.PI * 2 * i) / 8;
			this.bullets.push(Object.assign(this.allocBullet(), {
				id: Math.random().toString(),
				x: this.player.x,
				y: this.player.y,
				vx: Math.cos(a) * 8,
				vy: Math.sin(a) * 8,
				damage: 16,
				pierce: 1,
				rangeRemaining: 150,
				weaponType: `splinter`,
				isSplinter: false,
				radius: 3,
				color: `#fde68a`
			}));
		}
		this.screenShake = Math.max(this.screenShake, 4);
	}
	killZombie(e, t) {
		// Batch 6: codex discovery — first kill of each zombie type.
		this.codexSeen?.add(e.type);
		// Batch 2: volatile affix — the elite pops, and takes the crowd with it.
		if (e.affix === `volatile`) {
			const R = 130, dmg = Math.round(e.maxHealth * .5);
			for (let i = this.zombies.length - 1; i >= 0; i--) {
				const z = this.zombies[i];
				if (z === e || Math.hypot(z.x - e.x, z.y - e.y) > R) continue;
				z.health -= dmg;
				this.createBloodParticles(z.x, z.y, Math.atan2(z.y - e.y, z.x - e.x));
				if (z.health <= 0) this.killZombie(z, i);
			}
			if (Math.hypot(this.player.x - e.x, this.player.y - e.y) < R) this.damagePlayer(15);
			this.shockwaves.push({ x: e.x, y: e.y, r: 10, maxR: R, life: .4, maxLife: .4, color: `#ff6b35` });
			this.trauma = Math.min(1, this.trauma + .3 * this.tune('shake') * this.motionScale());
			soundEngine.tone({ f: 90, f2: 30, type: `sine`, dur: .5, vol: .5 });
			this.spawnFloater(e.x, e.y - 30, `VOLATILE POP`, `#ff6b35`);
		}
		// Batch 2: splitter — bloaters pop into crawlers.
		if (e.type === `bloater_spitter`) {
			for (let k = 0; k < 2; k++) {
				const c = this.pushZombie(`crawler`, e.x + (Math.random() - .5) * 30, e.y + (Math.random() - .5) * 30);
				c.ai = `chase`;
			}
			this.createBloodParticles(e.x, e.y, Math.random() * Math.PI * 2);
		}
		const comboBefore = Math.floor(this.comboMultiplier);
		this.zombies.splice(t, 1), this.stats.kills++, this.bumpLifetime(`kills`), this.lastKillTime = Date.now(), this.comboMultiplier = Math.min(5, this.comboMultiplier + .25);
		// VS-1: Harvest Streak — 3s kill window, bonus capped at 30.
		this.streak = this.simTime - this.lastStreakKill <= 3 ? this.streak + 1 : 1;
		this.lastStreakKill = this.simTime;
		this.streakTimer = 3;
		if (this.streak > this.maxStreak) this.maxStreak = this.streak;
		// Batch 9: kill surge climbs +0.18 per kill, capped at 1.
		this.killSurge = Math.min(1, this.killSurge + .18), this.driveKillSurge();
		const streakBonus = Math.min(this.streak, 30);
		this.addScore(streakBonus);
		if (this.streak >= 10) this.spawnFloater(e.x, e.y - e.radius - 10, `HARVEST x${this.streak}`, this.streakColor());
		soundEngine.playKillSub();
		// Batch 5: combo-pitched kill SFX, kill surge, and beast/growl mix.
		// Batch 9 (Lane 3): combo-pitched kill SFX now routes through the pure
		// killPitchHz(combo) = 300 + min(combo,20)*30 Hz formula.
		soundEngine.killSound(this.streak);
		soundEngine.bumpSurge();
		soundEngine.setBeastMix(Math.min(1, (this.beastDmgAcc || 0) / 600), this.streak);
		this.feelKill(e);
		// Batch 5: kill-word floater (pooled, same 40-cap discipline as damage numbers).
		this.spawnKillWord(e.x, e.y - e.radius - 18);
		// Batch 5: directional blood spray (velocity scales with the killing hit's power).
		this.bloodSpray(e.x, e.y, e.lastHitAngle ?? Math.random() * Math.PI * 2, e.lastHitPower ?? 30);
		// Batch 5: expanding white kill ring (~4.2x the zombie's radius).
		this.shockwaves.push({ x: e.x, y: e.y, r: 8, maxR: e.radius * 4.2, life: .35, maxLife: .35, color: `#ffffff`, b5: true });
		// Batch 5: brief screen-space flash at the kill's position.
		if (this.hitFlashes.length < 16) this.hitFlashes.push({ x: e.x, y: e.y, life: .14, maxLife: .14 });
		const comboAfter = Math.floor(this.comboMultiplier);
		if (comboAfter > comboBefore && comboAfter >= 2) {
			this.spawnFloater(this.player.x, this.player.y - 56, `STREAK x${comboAfter}`, "#ffd700");
			// Balance: halved streak payout (2 orbs, was 4) — early XP economy ran too hot
			for (let i = 0; i < 2; i++) {
				const a = Math.random() * Math.PI * 2;
				const g1 = this.gritPool.pop() || {};
				g1.x = this.player.x; g1.y = this.player.y; g1.vx = Math.cos(a) * 160; g1.vy = Math.sin(a) * 160; g1.value = comboAfter; g1.lucky = false;
				this.grit.push(g1);
			}
			soundEngine.playPowerup();
		}
		this.spawnGrit(e);
		// Batch 4: elites sometimes cough up a Dust Devil.
		if (e.elite && Math.random() < .3) this.dropVacuumAt(e.x, e.y);
		if (e.type === `bomber`) {
			// Batch 6 (Lane A): formal spec — blastRadius / blastDamage with the existing falloff.
			const R = this.b6blastR;
			this.screenShake = Math.max(this.screenShake, 7);
			for (const z of this.zombies) {
				const bd = Math.hypot(z.x - e.x, z.y - e.y);
				// Batch 3: explosion falloff — edge of the blast hurts less.
				if (bd < R) { const bf = 1 - bd / R; z.health -= Math.round(this.b6blastDmg * bf); z.hitFlash = 0.08; }
			}
			for (let k = 0; k < 14; k++) this.particles.push(Object.assign(this.allocParticle(), { x: e.x, y: e.y, vx: (Math.random() - .5) * 6, vy: (Math.random() - .5) * 6, size: 4, life: .5, maxLife: .5, alpha: 1 }));
			const pd = Math.hypot(this.player.x - e.x, this.player.y - e.y);
			if (pd < R * .7) this.player.health -= Math.round(this.b6blastPlayer * (1 - pd / (R * .7)));
			soundEngine.playBarrelExplosion();
			this.addScorch(e.x, e.y, 80);
		}
		if (e.elite && this.chestsThisMap < 3) {
			this.chestsThisMap++;
			this.chests.push({ x: e.x, y: e.y });
			if (Math.random() < .35) this.dropCacheAt(e.x + 30, e.y); // VS-3: elites drop Storm Cellar Caches
			this.spawnFloater(e.x, e.y - e.radius - 14, "ELITE DOWN — CHEST", "#ffd700");
		}
		this.tickBounty(`kill`);
		if (e.shatter) this.boneBurst(e);
		if (!e.elite && (e.type === `behemoth` || e.type === `miner_brute` || e.type === `bloater_spitter`) && this.chestsThisMap < 2) {
			this.chestsThisMap++;
			this.chests.push({ x: e.x, y: e.y });
			this.spawnFloater(e.x, e.y - e.radius - 14, "CHEST", "#f6c453");
		}
		if (this.simTime - this.rushWindow > 5) this.rushKills = 0;
		this.rushWindow = this.simTime;
		this.rushKills++;
		if (this.rushKills >= 4 && this.bloodRush <= 0) {
			this.rushKills = 0;
			this.bloodRush = 2.8;
			this.worldSlow = Math.max(this.worldSlow, 2.2);
			this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + 35);
			this.trauma = Math.min(1, this.trauma + .45 * this.tune('shake') * this.motionScale());
			this.hitstop = Math.max(this.hitstop, (.08) * this.tune('hitstop'));
			this.spawnFloater(this.player.x, this.player.y - 40, "BLOOD RUSH", "#e11d2e");
			this.callbacks.onRadio?.("Unknown", "Don't you stop.");
			soundEngine.playPowerup();
		}
		let n = this.hasPowerup(`double_points`) ? 2 : 1, r = Math.round(e.scoreValue * this.comboMultiplier * n);
		this.addScore(r);
		this.stripTheDead(e);
		let i = this.getPerkLevel(`scavenger`), a = 1 + i * .35 + this.boon(`leavings`) * .15, o = Math.round(e.scrapValue * a * n);
		if (this.scrap += o, this.stats.scrapCollected += o, this.spawnFloater(e.x, e.y - e.radius, `+${r}`, `#d4a017`), this.bloodDecals.push({
			x: e.x,
			y: e.y,
			radius: e.radius * (1.2 + Math.random() * .6),
			alpha: .65 + Math.random() * .25,
			rotation: Math.random() * Math.PI * 2
		}), this.bloodDecals.length > 150 && this.bloodDecals.shift(), Math.random() < .04) {
			let t = [
				`nuke`,
				`double_points`,
				`insta_kill`,
				`infinite_ammo`,
				`speed_boost`
			], n = t[Math.floor(Math.random() * t.length)];
			this.drops.push({
				id: Math.random().toString(),
				type: n,
				x: e.x,
				y: e.y,
				amount: 1,
				duration: 3e4
			});
			return;
		}
		let s = .32 + i * .1;
		if (Math.random() < s) {
			let t = Math.random(), n = `ammo_universal`, r = 15;
			const medC = this.player.health < this.player.maxHealth * .4 ? .55 : .35; // VS-3: rubber-band health orbs when hurt
			t < medC && this.player.health < this.player.maxHealth ? (n = `moonshine_med`, r = 35) : t < .55 ? (n = `molotov_pickup`, r = 1) : t < .75 && (n = `scrap`, r = 25), this.drops.push({
				id: Math.random().toString(),
				type: n,
				x: e.x,
				y: e.y,
				amount: r,
				duration: 25e3
			});
		}
	}
	damagePlayer(e, attacker) {
		if (this.invuln > 0) return;
		this.invuln = .62;
		// Batch 2: frosted affix — the dead leave ice in your veins.
		if (attacker && attacker.affix === `frosted`) { this.chillUntil = Date.now() + 2000; this.spawnFloater(this.player.x, this.player.y - 40, `CHILLED`, `#7dd3fc`); }
		let t = e * (1 - this.getPerkLevel(`grit`) * .08);
		this.player.health -= t, this.stats.damageTaken += t, this.screenShake = 5 * this.tune('shake') * this.motionScale(), this.trauma = Math.min(1, this.trauma + .22 * this.tune('shake') * this.motionScale()), soundEngine.playPlayerHurt();
		// VS-1: getting hurt breaks the Harvest Streak.
		if (this.streak > 0) this.spawnFloater(this.player.x, this.player.y - 40, `STREAK LOST`, `#8a8f98`);
		this.streak = 0; this.streakTimer = 0;
		let sx = 0, sy = -1, best = 1e9;
		for (const z of this.zombies) {
			const dx = this.player.x - z.x, dy = this.player.y - z.y, d = Math.hypot(dx, dy);
			if (d > 0 && d < best) {
				best = d;
				sx = dx / d;
				sy = dy / d;
			}
		}
		if (best < 120) {
			const px = this.player.x + sx * 22, py = this.player.y + sy * 22;
			if (!this.checkObstacleCollision(px, py, this.player.radius)) {
				this.player.x = px;
				this.player.y = py;
			}
			this.moveVX += sx * 5;
			this.moveVY += sy * 5;
			// VS-3: directional hurt feedback — angle from player toward the attacker.
			this.hurtDir = Math.atan2(-sy, -sx);
			this.hurtFlash = .8;
		}
		if (this.player.health <= 0) {
			if (!this.lastStandUsed) {
				this.lastStandUsed = true;
				this.player.health = Math.round(this.player.maxHealth * .5);
				this.invuln = 3.5;
				this.worldSlow = 2.6;
				this.hitstop = .16;
				this.trauma = 1;
				this.player.stamina = this.player.maxStamina;
				for (const z of this.zombies) {
					const dx = z.x - this.player.x, dy = z.y - this.player.y;
					const dist = Math.hypot(dx, dy) || 1;
					if (dist < 200) {
						const push = (200 - dist) / 200 * 70;
						z.x += dx / dist * push;
						z.y += dy / dist * push;
						z.stunUntil = this.simTime + 1.5;
						z.ai = "wander";
					}
				}
				soundEngine.playWaveHorn();
				this.spawnFloater(this.player.x, this.player.y - 36, "LAST STAND", "#e11d2e");
				this.callbacks.onRadio?.("Unknown", "Get up. The county isn't done with you.");
				return;
			}
			this.player.health = 0;
			this.runDeathStack(); // Batch 8 (Lane B): hitstop + flash + blood burst + slow-mo cinematic.
			this.handleGameOver();
		}
	}
	// Batch 8 (Lane B): player-death stack — hitstop beat, full-screen white
	// flash, 24-particle blood burst, and a short slow-motion cinematic window.
	// handleGameOver() still fires immediately; the loop keeps rendering the
	// cinematic without running the normal simulation.
	runDeathStack() {
		this.hitstop = Math.max(this.hitstop, .11 * this.tune('hitstop'));
		this.deathFlash = .22;
		this.deathCineT = .53;
		this.createBloodParticles(this.player.x, this.player.y, Math.random() * Math.PI * 2, 24);
		this._lastGameOver = { stats: { ...this.stats }, score: this.score, killer: this.lastKiller };
	}

	// Batch 8 (Lane B): tick the post-death cinematic — hitstop beat first,
	// then 0.15x slow-motion particles while the flash fades.
	updateDeathCine(e: number) {
		if (this.deathCineT <= 0) return;
		this.deathCineT = Math.max(0, this.deathCineT - e);
		if (this.hitstop > 0) { this.hitstop = Math.max(0, this.hitstop - e); return; }
		this.updateParticles(e * .15);
		this.deathFlash = Math.max(0, this.deathFlash - e);
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
	handleGameOver() {
		this.stats.maxStreak = this.maxStreak;
		this.isRunning = false, this.stats.survivalTime = Math.floor((Date.now() - this.gameStartTime) / 1e3), saveMeta(this.meta), this.callbacks.onGameOver(this.stats, this.score, this.lastKiller);
		// Batch 4: Hall of Records — persist this run for the top-5 list.
		try { recordRun({ score: this.score, kills: this.stats.kills, time: this.stats.survivalTime, level: this.level, date: Date.now() }); } catch { /* meta full/unavailable */ }
	}

	// VS-1: Harvest Streak tier color — cyan <10, gold 10+, pink 20+.
	streakColor() {
		return this.streak >= 20 ? `#ff6ec7` : this.streak >= 10 ? `#ffd700` : `#4cc3ff`;
	}

	// VS-1: capped fading scorch decals left by explosions.
	addScorch(x, y, radius) {
		this.scorchDecals.push({ x, y, radius, alpha: .55, maxAlpha: .55 });
		if (this.scorchDecals.length > 60) this.scorchDecals.shift();
	}
	updateScorch(dt) {
		for (let i = this.scorchDecals.length - 1; i >= 0; i--) {
			const s = this.scorchDecals[i];
			s.alpha -= dt * .06;
			if (s.alpha <= 0) this.scorchDecals.splice(i, 1);
		}
	}

	// VS-1: pooled damage numbers — throttled so bullet storms don't spam floaters.
	spawnDamageNumber(x, y, amount, color) {
		if (this.dmgFloaters >= 12) return;
		this.dmgFloaters++;
		const f = this.floaterPool.pop() || {};
		f.x = x; f.y = y; f.text = `${Math.round(amount)}`; f.color = color; f.life = .5; f.maxLife = .5; f.vy = -34; f.dmg = true;
		f.onFree = () => { this.dmgFloaters = Math.max(0, this.dmgFloaters - 1); };
		this.floaters.push(f);
		if (this.floaters.length > 40) { const old = this.floaters.shift(); old.onFree?.(); this.floaterPool.push(old); }
	}

	// Batch 5: kill-word floaters — SLAIN! / DOWN! / SPLAT! / CRUNCH!, gold/red,
	// pooled through spawnFloater so the 40-floater cap discipline holds.
	spawnKillWord(x, y) {
		if (this.floaters.length >= 40) return;
		const w = this.killWords[(Math.random() * this.killWords.length) | 0];
		const c = Math.random() < .5 ? `#ffd700` : `#e11d2e`;
		this.lastKillWord = { word: w, color: c, x: Math.round(x), y: Math.round(y) };
		this.killWordCount++;
		this.spawnFloater(x, y, w, c);
	}
	// Batch 5: directional blood spray — velocity scales with the hit's power.
	// Spray particles carry splat:true so they leave ground splats on death.
	bloodSpray(x, y, angle, power) {
		for (let i = 0; i < 10; i++) {
			const a = angle + (Math.random() - .5) * .9;
			const sp = 1.5 + power * .02 + Math.random() * 2.5;
			this.particles.push(Object.assign(this.allocParticle(), {
				x, y,
				vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
				size: 2 + Math.random() * 3,
				color: Math.random() < .6 ? `#a31621` : `#6e0f16`,
				alpha: 1, life: .45 + Math.random() * .3, maxLife: .75,
				type: `blood`, splat: true
			}));
		}
	}
	// Batch 5: persistent fading ground splats — capped ~30, oldest recycled.
	addBloodSplat(x, y) {
		this.bloodSplats.push({ x, y, r: 3 + Math.random() * 5, life: 18, maxLife: 18 });
		if (this.bloodSplats.length > 30) this.bloodSplats.shift();
	}
	// Batch 5: oriented slash streaks on hits (faint for whiffs). Cap 24.
	addSlash(x, y, angle, faint = false) {
		this.slashBursts.push({ x, y, angle, faint, life: .18, maxLife: .18 });
		if (this.slashBursts.length > 24) this.slashBursts.shift();
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
	addScore(n) {
		const m = this.hasPowerup(`score_surge`) ? 2 : 1;
		const g = Math.round(n * m);
		this.score += g;
		return g;
	}
	hexA(hex, alpha) {
		const h = String(hex).replace(`#`, ``);
		const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
	}
	// Batch 5: enemy body reactions — vertical pop, 80ms squash-and-stretch yoyo,
	// slight hit spin on heavy hits (80+).
	reactHit(z, dmg, angle) {
		z.yOff = Math.min(14, 4 + dmg * .05);
		z.squashT = .08;
		if (dmg >= 80) { z.hitSpin = (Math.random() < .5 ? -1 : 1) * .35; z.spinT = .25; }
	}

	// VS-1: "Run Out of the County" banish — permanently remove a boon from this run's draft pool.
	banishBoon(id) {
		if (this.banishCharges <= 0 || !this.draft?.some((b) => b.id === id)) return false;
		this.banishedBoons.add(id);
		this.banishCharges--;
		this.draft = this.draft.filter((b) => b.id !== id);
		const rest = rollBoons(this.boonStacks, this.player.molotovs, this.player.maxMolotovs, this.posts, this.pipes, this.draftExclusions()).filter((b) => !this.draft.some((d) => d.id === b.id));
		if (rest.length > 0) this.draft.push(rest[0]);
		this.callbacks.onDraft?.(this.draft);
		this.spawnFloater(this.player.x, this.player.y - 48, `RUN OUT OF THE COUNTY`, `#c77dff`);
		soundEngine.playBanish();
		return true;
	}

	// VS-3: hit-feel module. One master kill switch (this.hitFeel) gates everything.
	// Rationed hit-stop: a 0.3s budget that refills over time — big moments
	// spend more, bullet spam can't drain it.
	spendHitstop(amount) {
		if (!this.hitFeel) return;
		const spend = Math.min(amount, this.hitstopBudget);
		this.hitstopBudget -= spend;
		this.hitstop = Math.max(this.hitstop, (spend) * this.tune('hitstop'));
	}
	feelHit(bullet, zombie) {
		if (!this.hitFeel) return;
		this.spendHitstop(.012);
		const a = Math.atan2(bullet.vy, bullet.vx);
		this.camKickX += Math.cos(a) * 2.5;
		this.camKickY += Math.sin(a) * 2.5;
	}
	feelKill(z) {
		if (!this.hitFeel) return;
		const big = z.elite || z.type === `behemoth` || z.type === `miner_brute`;
		this.spendHitstop(big ? .09 : .035);
		if (big) {
			// Slow-motion aftertaste.
			this.slowAfter = .6;
			this.worldSlow = Math.max(this.worldSlow, 1.4);
			// Shockwave.
			this.shockwaves.push({ x: z.x, y: z.y, r: 10, maxR: z.elite ? 150 : 220, life: .45, maxLife: .45 });
			soundEngine.tone({ f: 90, f2: 34, type: `sine`, dur: .4, vol: .5 });
		}
		// Camera kick away from the kill + zoom punch.
		const a = Math.atan2(z.y - this.player.y, z.x - this.player.x);
		this.camKickX -= Math.cos(a) * (big ? 9 : 4) * this.tune('kick') * this.motionScale();
		this.camKickY -= Math.sin(a) * (big ? 9 : 4);
		this.zoomPunch = Math.min(.09, this.zoomPunch + (big ? .05 : .02) * this.tune('zoom') * this.motionScale());
		// Blood spray burst.
		for (let i = 0; i < (big ? 16 : 8); i++) {
			const pa = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
			this.particles.push(Object.assign(this.allocParticle(), { x: z.x, y: z.y, vx: Math.cos(pa) * sp, vy: Math.sin(pa) * sp, size: 2 + Math.random() * 3, life: .4 + Math.random() * .3, maxLife: .7, color: `#a31621`, alpha: 1 }));
		}
		// Kill words.
		if (z.type === `behemoth`) this.spawnFloater(z.x, z.y - 40, `COUNTY LEGEND`, `#ffd700`);
		else if (z.elite) this.spawnFloater(z.x, z.y - 30, [`DROPPED`, `BIG GAME`, `PUT DOWN`][(Math.random() * 3) | 0], `#c77dff`);
		else if (this.streak >= 20) this.spawnFloater(z.x, z.y - 26, `UNSTOPPABLE`, `#ff6ec7`);
	}
	updateFeel(dt) {
		// Hit-stop budget refills; slow-mo aftertaste and zoom punch decay.
		this.hitstopBudget = Math.min(.3, this.hitstopBudget + dt * .3);
		if (this.slowAfter > 0) {
			this.slowAfter -= dt;
			if (this.slowAfter <= 0) this.worldSlow = 0;
		}
		this.zoomPunch = Math.max(0, this.zoomPunch - dt * .25);
		this.camKickX *= Math.max(0, 1 - dt * 9);
		this.camKickY *= Math.max(0, 1 - dt * 9);
		for (let i = this.shockwaves.length - 1; i >= 0; i--) {
			const s = this.shockwaves[i];
			s.life -= dt;
			s.r += (s.maxR - s.r) * dt * 7;
			if (s.life <= 0) this.shockwaves.splice(i, 1);
		}
		if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.4);
		// Batch 5: slash bursts and screen-space hit flashes decay.
		for (let i = this.slashBursts.length - 1; i >= 0; i--) {
			const s = this.slashBursts[i];
			s.life -= dt;
			if (s.life <= 0) this.slashBursts.splice(i, 1);
		}
		for (let i = this.hitFlashes.length - 1; i >= 0; i--) {
			const f = this.hitFlashes[i];
			f.life -= dt;
			if (f.life <= 0) this.hitFlashes.splice(i, 1);
		}
	}
	setHitFeel(on) { this.hitFeel = !!on; }
	// Batch 2: mass-based knockback — sprinters fly, behemoths barely budge.
	zombieMass(type) {
		return type === `behemoth` ? 4.2 : type === `miner_brute` ? 2.6 : type === `riot_shield` ? 2.8 : type === `bloater_spitter` ? 1.8 : type === `crawler` ? 0.7 : 1;
	}
	knockbackFor(weaponType, zombieType) {
		const force = weaponType === `shotgun` ? 7 : 3;
		return (force / this.zombieMass(zombieType)) * this.tune(`knockback`);
	}
	nearestZombie(x, y, maxD) {
		let best = null, bd = maxD;
		const near = this.queryZombies(x, y, maxD, []);
		for (const i of near) {
			const z = this.zombies[i];
			if (!z || z.health <= 0) continue;
			const d = Math.hypot(z.x - x, z.y - y);
			if (d < bd) { bd = d; best = z; }
		}
		return best;
	}
	// Batch 2: elite affixes — readable, telegraphed, each with a visual tell.
	assignAffix(z) {
		if (!z.elite || z.affix) return;
		const pool = [`volatile`, `vampiric`, `leaping`, `shielded`, `swift`, `frosted`];
		z.affix = pool[(Math.random() * pool.length) | 0];
		if (z.affix === `swift`) z.speed *= 1.35;
		if (z.affix === `shielded`) z.shieldHp = Math.round(z.maxHealth * .3);
		if (z.affix === `leaping`) { z.leapCd = 3; z.leapTele = 0; }
		const label = { volatile: `VOLATILE`, vampiric: `VAMPIRIC`, leaping: `LEAPING`, shielded: `SHIELDED`, swift: `SWIFT`, frosted: `FROSTED` }[z.affix];
		this.spawnFloater(z.x, z.y - z.radius - 26, label, `#ff7b72`);
		// Batch 3: elite alert howl — nearby dead hear it and come running.
		soundEngine.tone({ f: 180, f2: 420, type: `sawtooth`, dur: .7, vol: .25 });
		soundEngine.tone({ f: 420, f2: 180, type: `sawtooth`, dur: .7, vol: .2, delay: .7 });
		for (const o of this.zombies) {
			if (o === z || Math.hypot(o.x - z.x, o.y - z.y) > 600) continue;
			o.ai = `chase`; o.tx = this.player.x; o.ty = this.player.y;
			o.hearX = this.player.x; o.hearY = this.player.y;
		}
	}
	// Batch 9: kill-surge audio drive — Lane 3 owns setKillSurge; the typeof
	// guard keeps this a no-op if the audio lane's method is ever absent.
	driveKillSurge() {
		typeof soundEngine.setKillSurge === `function` && soundEngine.setKillSurge(this.killSurge);
	}
	// Batch 9: kill surge decays ~0.25/s while it sits above 0; kills push it
	// back up in killZombie, so it only falls when the killing stops.
	updateKillSurge(e) {
		if (this.killSurge <= 0) return;
		this.killSurge = Math.max(0, this.killSurge - .25 * e);
		this.driveKillSurge();
	}
	// Batch 5: per-frame audio state — heartbeat follows HP, beast damage accumulator decays.
	updateBeastAudio(e) {
		this.beastDmgAcc = (this.beastDmgAcc || 0) * Math.pow(.5, e);
		if (this.player && this.player.maxHealth > 0) soundEngine.updateHeartbeat(this.player.health / this.player.maxHealth);
	}
	// Batch 6 (Lane E contracts): field-tuning panel + accessibility.
	// TuningKey = "hitstop" | "shake" | "kick" | "zoom" | "knockback" | "particles" | "flash".
	tune(k) { return this.tuning?.[k] ?? 1; }
	motionScale() { return this.a11y?.reduceMotion ? .2 : 1; }
	flashScale() { const t = this.tune(`flash`); return this.a11y?.reducedFlashing ? Math.min(t, .1) : t; }
	setTuning(key, value) { this.tuning = Object.assign(this.tuning || {}, { [key]: value }); }
	setA11y(opts) { this.a11y = Object.assign(this.a11y || {}, opts); }
	testImpact() {
		// Fires one synthetic heavy hit at the player so the tuning panel's
		// TEST IMPACT button can be felt without an active fight.
		const x = this.player?.x ?? 0, y = (this.player?.y ?? 0) - 40;
		this.hitstop = Math.max(this.hitstop, .12 * this.tune(`hitstop`));
		this.trauma = Math.min(1, this.trauma + .5 * this.tune(`shake`) * this.motionScale());
		this.shockwaves.push({ x, y, r: 8, maxR: 160, life: .4, maxLife: .4, color: `#ffffff` });
		this.spawnFloater?.(x, y - 20, `TEST IMPACT`, `#ffd700`);
		soundEngine.killSound(10);
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
	fireChainLightning(w, dmgMul) {
		const cfg = this.chainCfg();
		this.rebuildZombieHash();
		const R = Math.max(0.001, cfg.acquireRadius);
		const q = this.queryZombies(this.player.x, this.player.y, R + (this.zhashMaxR || 0), []);
		let first = null, bd = R + 1;
		for (const k of q) {
			const z = this.zombies[k];
			if (!z || z.health <= 0) continue;
			const d = Math.hypot(z.x - this.player.x, z.y - this.player.y);
			if (d < bd) { bd = d; first = z; }
		}
		this.lastChain = { jumps: 0, hits: 0 };
		if (!first) return;
		const hit = new Set();
		let dmg = cfg.damage * dmgMul;
		let fx = this.player.x, fy = this.player.y;
		let cur = first, jumps = 0;
		for (;;) {
			hit.add(cur);
			const dealt = this.applyAffixDefense(cur, dmg);
			cur.health -= dealt;
			cur.hitFlash = Math.max(cur.hitFlash, .18);
			this.stats.damageDealt += dealt;
			this.createBloodParticles(cur.x, cur.y, Math.atan2(cur.y - fy, cur.x - fx));
			this.arcSegment(fx, fy, cur.x, cur.y);
			if (cur.health <= 0) this.killZombie(cur, this.zombies.indexOf(cur));
			if (jumps >= cfg.chainJumps) break;
			const RJ = Math.max(0.001, cfg.chainRadius);
			const q2 = this.queryZombies(cur.x, cur.y, RJ + (this.zhashMaxR || 0), []);
			let nxt = null, nd = RJ + 1;
			for (const k of q2) {
				const z = this.zombies[k];
				if (!z || z.health <= 0 || hit.has(z)) continue;
				const d = Math.hypot(z.x - cur.x, z.y - cur.y);
				if (d < nd) { nd = d; nxt = z; }
			}
			if (!nxt) break;
			jumps++;
			dmg *= cfg.chainFalloff;
			fx = cur.x; fy = cur.y;
			cur = nxt;
		}
		this.lastChain = { jumps, hits: hit.size };
		soundEngine.tone({ f: 1800, f2: 200, type: `sawtooth`, dur: .18, vol: .12 });
	}
	// Batch 7: jagged polyline through the existing lightning + particle systems.
	arcSegment(x1, y1, x2, y2) {
		const segs = 3;
		let px = x1, py = y1;
		for (let s = 1; s <= segs; s++) {
			const t = s / segs;
			const nx = x1 + (x2 - x1) * t + (s < segs ? (Math.random() - .5) * 26 : 0);
			const ny = y1 + (y2 - y1) * t + (s < segs ? (Math.random() - .5) * 26 : 0);
			this.lightning.push({ x1: px, y1: py, x2: nx, y2: ny, life: 0.18 });
			px = nx; py = ny;
		}
		for (let i = 0; i < 4; i++) this.particles.push(Object.assign(this.allocParticle(), {
			x: x2, y: y2,
			vx: (Math.random() - .5) * 4, vy: (Math.random() - .5) * 4,
			size: 2.5, color: `#93c5fd`, alpha: 1, life: .25, maxLife: .3, type: `spark`
		}));
	}
	// Batch 7: "Still-Yard Blades" firing pulse — the blades themselves do the work passively.
	fireOrbiterPulse(w, dmgMul) {
		const cfg = this.orbiterCfg();
		this.rebuildZombieHash();
		const R = Math.max(0.001, cfg.orbiterRadius * 1.15);
		const q = this.queryZombies(this.player.x, this.player.y, R + (this.zhashMaxR || 0), []);
		const dmg = (cfg.orbiterDps * 0.5 + (w.damage || 0)) * dmgMul;
		for (const k of q) {
			const z = this.zombies[k];
			if (!z || z.health <= 0) continue;
			if (Math.hypot(z.x - this.player.x, z.y - this.player.y) > R + z.radius) continue;
			const dealt = this.applyAffixDefense(z, dmg);
			z.health -= dealt;
			z.hitFlash = Math.max(z.hitFlash, .15);
			this.stats.damageDealt += dealt;
			this.createBloodParticles(z.x, z.y, Math.atan2(z.y - this.player.y, z.x - this.player.x));
			if (z.health <= 0) this.killZombie(z, this.zombies.indexOf(z));
		}
		this.shockwaves.push({ x: this.player.x, y: this.player.y, r: 10, maxR: R, life: .25, maxLife: .25, color: `#7dd3fc` });
	}
	// Batch 7: orbiter blades persist while the weapon is equipped; per-zombie per-blade
	// cooldowns keep contact DPS honest.
	updateOrbiters(dt) {
		const w = this.weapons[this.currentWeaponIndex];
		if (!w || w.id !== `orbiter`) {
			if (this.orbiterBlades.length) this.orbiterBlades = [];
			return;
		}
		const cfg = this.orbiterCfg();
		this.orbiterAngle = (this.orbiterAngle || 0) + dt * cfg.orbiterSpeed;
		const R = Math.max(0.001, cfg.orbiterRadius);
		const blades = [];
		for (let i = 0; i < cfg.orbiterCount; i++) {
			const a = this.orbiterAngle + (Math.PI * 2 * i) / Math.max(1, cfg.orbiterCount);
			blades.push({ x: this.player.x + Math.cos(a) * R, y: this.player.y + Math.sin(a) * R, a });
		}
		this.orbiterBlades = blades;
		const cdS = cfg.fireIntervalMs > 0 ? cfg.fireIntervalMs / 1000 : 0.35;
		const tickDmg = cfg.orbiterDps * cdS;
		for (let bi = 0; bi < blades.length; bi++) {
			const b = blades[bi];
			const q = this.queryZombies(b.x, b.y, 44 + (this.zhashMaxR || 0), []);
			for (const k of q) {
				const z = this.zombies[k];
				if (!z || z.health <= 0) continue;
				if (Math.hypot(z.x - b.x, z.y - b.y) > z.radius + 14) continue;
				z.orbiterCd = z.orbiterCd || {};
				if ((z.orbiterCd[bi] ?? -99) > this.simTime) continue;
				z.orbiterCd[bi] = this.simTime + cdS;
				const dealt = this.applyAffixDefense(z, tickDmg * this.playerDamageMul(z));
				z.health -= dealt;
				z.hitFlash = Math.max(z.hitFlash, .08);
				this.stats.damageDealt += dealt;
			}
		}
	}
	// Batch 7: telegraph emission — the renderer (another lane) drains state.telegraphs.
	pushTelegraph(kind, x, y, r, dur) {
		this.telegraphs.push({ kind, x: Math.round(x), y: Math.round(y), r: Math.max(0.001, r), t0: this.simTime, dur: Math.max(0.05, dur) });
		if (this.telegraphs.length > 24) this.telegraphs.shift();
	}
	updateTelegraphs(e) {
		const now = this.simTime;
		for (let i = this.telegraphs.length - 1; i >= 0; i--) {
			if (now - this.telegraphs[i].t0 >= this.telegraphs[i].dur) this.telegraphs.splice(i, 1);
		}
	}
	// Batch 7: darkness as gameplay — lit if inside the player's light radius or a light source.
	isLit(x, y) {
		const lr = Math.max(0.001, this.player.lightRadius || 420);
		if (Math.hypot(x - this.player.x, y - this.player.y) <= lr) return true;
		for (const f of this.flares) if (Math.hypot(x - f.x, y - f.y) <= 260) return true;
		const lan = this.currentLocation.lantern;
		if (this.lanternLit && lan && Math.hypot(x - lan.x, y - lan.y) <= 420) return true;
		return false;
	}
	// Batch 7: melee damage with enrage bonus; clones (damage 0) never touch the player.
	zombieMeleeDmg(r) {
		const m = r.type === `behemoth` && r.enraged ? this.behemothPhases.enrageDmgMul : 1;
		return Math.round(r.damage * m);
	}
	// Batch 7: phased Behemoth — charge (telegraphed dash) / summon (crawlers, once) /
	// enrage (<30% HP: +35% speed, +25% damage, red tint). Phases are HP/threshold driven.
	tickBehemoth(r, o, dt) {
		const cfg = this.behemothPhases;
		if (r.bossPhase === undefined) { r.bossPhase = `fight`; r.chargeCd = 3; }
		const frac = r.maxHealth > 0 ? r.health / r.maxHealth : 1;
		if (r.enraged || frac < cfg.enrageAt) {
			if (!r.enraged) {
				r.enraged = true;
				this.spawnFloater(r.x, r.y - r.radius - 24, `ENRAGED`, `#ef4444`);
				soundEngine.tone({ f: 140, f2: 60, type: `sawtooth`, dur: .6, vol: .3 });
			}
			r.bossPhase = `enrage`;
			return;
		}
		if (!r.summoned && frac < cfg.summonAt) {
			r.summoned = true;
			r.bossPhase = `summon`;
			for (let k = 0; k < 4; k++) {
				const a = (k / 4) * Math.PI * 2 + Math.random() * .6;
				const c = this.pushZombie(`crawler`, r.x + Math.cos(a) * (r.radius + 40), r.y + Math.sin(a) * (r.radius + 40));
				c.ai = `chase`;
			}
			this.spawnFloater(r.x, r.y - r.radius - 24, `THE GROUND STIRS`, `#a78bfa`);
			soundEngine.tone({ f: 90, f2: 220, type: `sawtooth`, dur: .5, vol: .25 });
			r.bossPhase = `fight`;
			return;
		}
		r.chargeCd -= dt;
		if ((r.chargeWindupT || 0) > 0) {
			r.chargeWindupT -= dt;
			r.bossPhase = `charge`;
			r.hitFlash = Math.max(r.hitFlash, .05);
			if (r.chargeWindupT <= 0) {
				const a = Math.atan2(this.player.y - r.y, this.player.x - r.x);
				r.chargeVx = Math.cos(a) * cfg.chargeDashSpeed;
				r.chargeVy = Math.sin(a) * cfg.chargeDashSpeed;
				r.chargeDashT = 0.55;
				r.bossPhase = `fight`;
				r.chargeCd = cfg.chargeEvery * (0.8 + Math.random() * 0.4);
				this.screenShake = Math.max(this.screenShake, 8 * this.tune(`shake`));
				soundEngine.tone({ f: 200, f2: 900, type: `sawtooth`, dur: .3, vol: .2 });
			}
			return;
		}
		if ((r.chargeDashT || 0) > 0) {
			r.chargeDashT -= dt;
			const nx = r.x + r.chargeVx * dt, ny = r.y + r.chargeVy * dt;
			if (!this.checkObstacleCollision(nx, ny, r.radius * .7)) { r.x = nx; r.y = ny; }
			r.bossPhase = `fight`;
			return;
		}
		if (r.chargeCd <= 0 && o > 120 && o < 800) {
			r.chargeWindupT = cfg.chargeWindup;
			r.bossPhase = `charge`;
			this.pushTelegraph(`charge`, r.x, r.y, cfg.chargeLaneR, cfg.chargeWindup);
			this.spawnFloater(r.x, r.y - r.radius - 24, `!`, `#fbbf24`);
			return;
		}
		r.bossPhase = `fight`;
	}
	// Batch 7: Haint illusionist — every cloneCooldown seconds, if the player is near,
	// up to cloneCount identical 1-HP clones that deal no damage (they eat auto-fire).
	tickHaint(r, dt) {
		if (r.isClone) return;
		r.cloneCd = (r.cloneCd ?? 1.5) - dt;
		if (r.cloneCd > 0) return;
		const o = Math.hypot(this.player.x - r.x, this.player.y - r.y);
		if (o > 700) { r.cloneCd = 1; return; }
		const want = 3;
		let have = 0;
		for (const z of this.zombies) if (z.isClone && z.cloneOf === r.id) have++;
		const n = Math.max(0, Math.min(want, want - have));
		for (let k = 0; k < n; k++) {
			const a = Math.random() * Math.PI * 2;
			const c = this.pushZombie(`haint`, r.x + Math.cos(a) * 44, r.y + Math.sin(a) * 44);
			c.isClone = true;
			c.cloneOf = r.id;
			c.maxHealth = 1;
			c.health = 1;
			c.damage = 0;
			c.ai = `chase`;
		}
		if (n > 0) this.spawnFloater(r.x, r.y - 40, `HAINT MULTIPLIES`, `#a78bfa`);
		r.cloneCd = 6;
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
	bossEntrance(z) {
		// Batch 5: banner copy comes from the BOSSES table; trauma/radio/motif stay engine-side.
		const bdef = bossFor(`behemoth`)?.bossOverrides;
		this.bannerText = bdef?.bannerText ?? `THE BEHEMOTH`;
		this.bannerSub = bdef?.bannerSub ?? `Something old is walking out of the treeline`;
		this.bannerUntil = Date.now() + 2600;
		this.trauma = Math.min(1, this.trauma + .45 * this.tune('shake') * this.motionScale());
		this.callbacks.onRadio?.(`WJPS`, `Folks... we got a big one on the Trace. Get to high ground or get to cover.`);
		// Batch 9 (Lane 3): the boss warning motif (480->360->240Hz square alert)
		// replaces the old descending sawtooth sequence — one alert, not two.
		soundEngine.bossMotif();
	}
	applyAffixDefense(z, dmg) {
		// Batch 5: riot_shield type shares the shield mechanic — shield pool absorbs,
		// damage is reduced 60% while it holds, break is a visible/audio event.
		if ((z.affix === `shielded` || z.type === `riot_shield`) && z.shieldHp > 0) {
			z.shieldHp -= dmg;
			if (z.shieldHp <= 0) {
				z.shieldHp = 0;
				this.spawnFloater(z.x, z.y - z.radius - 10, z.type === `riot_shield` ? `RIOT SHIELD DOWN` : `SHIELD DOWN`, `#4cc3ff`);
				this.createHitSparks(z.x, z.y, `#e8e4da`);
				soundEngine.playZombieHit(false); // clank
				soundEngine.tone({ f: 620, f2: 170, type: `square`, dur: .18, vol: .22 });
			}
			return dmg * .4;
		}
		return dmg;
	}
	// Batch 2: ricochet — bounce to the nearest other zombie, 25% falloff per bounce.
	tryRicochet(n, hitZ) {
		const maxB = this.boon(`ricochet`);
		if (maxB <= 0) return false;
		if (!supportApplies(`ricochet`, n.weaponType)) return false; // Batch 9: affinity-gated.
		n.bouncesLeft = n.bouncesLeft ?? maxB;
		if (n.bouncesLeft <= 0) return false;
		let best = null, bd = 340;
		for (const z of this.zombies) {
			if (z === hitZ || z.health <= 0) continue;
			const d = Math.hypot(z.x - n.x, z.y - n.y);
			if (d < bd) { bd = d; best = z; }
		}
		if (!best) return false;
		const sp = Math.hypot(n.vx, n.vy) || 400;
		const a = Math.atan2(best.y - n.y, best.x - n.x);
		n.vx = Math.cos(a) * sp; n.vy = Math.sin(a) * sp;
		n.damage *= .75;
		n.bouncesLeft--;
		n.lastHit = hitZ; n.lastHitCd = .2;
		this.createHitSparks(n.x, n.y, `#4cc3ff`);
		soundEngine.tone({ f: 900, f2: 1400, type: `sine`, dur: .08, vol: .1 });
		return true;
	}
	// Batch 2: forking rounds — impact splits into spectral projectiles.
	spawnForkChildren(n, a) {
		const ranks = this.boon(`fork`);
		if (ranks <= 0 || n.isForkChild || n.isSplinter || n.isFlare || n.isMolotov) return;
		if (!supportApplies(`fork`, n.weaponType)) return; // Batch 9: affinity-gated.
		for (let k = 0; k < ranks; k++) {
			const fa = a + (k % 2 === 0 ? 1 : -1) * (.38 + .22 * ((k / 2) | 0));
			const sp = Math.hypot(n.vx, n.vy) || 400;
			this.bullets.push(Object.assign(this.allocBullet(), {
				x: n.x, y: n.y,
				vx: Math.cos(fa) * sp, vy: Math.sin(fa) * sp,
				damage: n.damage * .5,
				pierce: 1,
				rangeRemaining: 220,
				weaponType: n.weaponType,
				isForkChild: true,
				radius: 3,
				color: `#7df9ff`
			}));
		}
		soundEngine.tone({ f: 1200, f2: 700, type: `triangle`, dur: .09, vol: .08 });
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
			e.save();
			e.translate(d.x, d.y + bob);
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
	updatePowerupDrops() {
		if (this.draft) return; // drops during the break breather too
		if (this.simTime >= this.nextPowerupAt) {
			this.nextPowerupAt = this.simTime + 75 + this.rng() * 30;
			const pool = this.powerupPool;
			const type = pool[(this.rng() * pool.length) | 0];
			const a = this.rng() * Math.PI * 2, d = 120 + this.rng() * 80;
			this.drops.push({ id: Math.random().toString(), type, x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d, amount: type === `moonshine_med` ? 40 : 1, duration: 3e4 });
			this.spawnFloater(this.player.x, this.player.y - 56, `SUPPLY DROP`, `#4cc3ff`);
			soundEngine.tone({ f: 660, f2: 990, type: `sine`, dur: .25, vol: .2 });
		}
	}
	// Batch 9 (Lane 1): dedicated score-multiplier drops — first pickup around
	// 25s, then every 25–40s. Separate from the generic 80s supply schedule.
	updateScoreMulDrops() {
		if (this.draft) return;
		if (this.simTime >= this.nextScoreMulAt) {
			this.nextScoreMulAt = this.simTime + 25 + this.rng() * 15;
			const a = this.rng() * Math.PI * 2, d = 120 + this.rng() * 80;
			this.drops.push({ id: Math.random().toString(), type: `score_surge`, x: this.player.x + Math.cos(a) * d, y: this.player.y + Math.sin(a) * d, amount: 1, duration: 3e4 });
			this.spawnFloater(this.player.x, this.player.y - 56, `SCORE SURGE`, `#4cc3ff`);
			soundEngine.tone({ f: 880, f2: 1320, type: `sine`, dur: .25, vol: .2 });
		}
	}

	// VS-3: Storm Cellar Caches — elite drops + a timed cellar door.
	updateCacheTimer() {
		if (this.draft) return;
		if (this.simTime >= this.nextCacheAt) {
			this.nextCacheAt = this.simTime + 140 + this.rng() * 40;
			const a = this.rng() * Math.PI * 2;
			this.caches.push({ id: Math.random().toString(), x: this.player.x + Math.cos(a) * 220, y: this.player.y + Math.sin(a) * 220 });
			this.spawnFloater(this.player.x, this.player.y - 64, `STORM CELLAR OPEN`, `#c77dff`);
			this.callbacks.onRadio?.(`Unknown`, `A storm cellar door just creaked open somewhere close. What's down there's yours if you want it.`);
			soundEngine.tone({ f: 220, f2: 110, type: `triangle`, dur: .5, vol: .25 });
		}
	}
	dropCacheAt(x, y) {
		if (this.caches.length >= 3) return;
		this.caches.push({ id: Math.random().toString(), x, y });
	}
	// Slot-machine spin: diamond .55 / star .30 / seven .15.
	spinCache() {
		const syms = [];
		for (let i = 0; i < 3; i++) {
			const r = Math.random();
			syms.push(r < .15 ? `seven` : r < .45 ? `star` : `diamond`);
		}
		return syms;
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
	applyCacheResult(symbols, doubled = false) {
		const mult = doubled ? 2 : 1;
		const sevens = symbols.filter((s) => s === `seven`).length;
		const stars = symbols.filter((s) => s === `star`).length;
		const diamonds = symbols.filter((s) => s === `diamond`).length;
		if (sevens === 3) {
			// 7-7-7 JACKPOT: every owned weapon to max upgrade.
			const n = this.maxOutWeapons();
			this.spawnFloater(this.player.x, this.player.y - 56, `7-7-7 JACKPOT — ${n} UPGRADES`, `#ffd700`);
			this.callbacks.onRadio?.(`Unknown`, `Seven seven seven. The cellar just made you the best-armed soul in Pike County.`);
			soundEngine.tone({ f: 523, type: `square`, dur: .12, vol: .2 });
			soundEngine.tone({ f: 659, type: `square`, dur: .12, vol: .2, delay: .12 });
			soundEngine.tone({ f: 784, type: `square`, dur: .3, vol: .25, delay: .24 });
			this.trauma = Math.min(1, this.trauma + .4 * this.tune('shake') * this.motionScale());
			return `jackpot`;
		}
		const owned = this.weapons.filter((w) => w.unlocked);
		const up = (k) => { for (let i = 0; i < k; i++) { const w = owned[(Math.random() * owned.length) | 0]; this.upgradeWeaponOnce(w); } };
		// Pairs pay double for that symbol: a matching pair pays 4x the single rate.
		const sevenK = (sevens === 2 ? 4 : sevens) * mult, starK = (stars === 2 ? 4 : stars) * mult, diaK = (diamonds === 2 ? 4 : diamonds) * mult;
		if (sevenK > 0 && owned.length) { up(sevenK); this.spawnFloater(this.player.x, this.player.y - 48, `+${sevenK} WEAPON UPGRADE${sevenK > 1 ? `S` : ``}`, `#f6c453`); }
		if (starK > 0) {
			for (let i = 0; i < starK; i++) {
				if (this.bombCharges < BOMB_MAX_CHARGES) this.bombCharges++;
				else this.player.health = Math.min(this.player.maxHealth, this.player.health + 40);
			}
			this.spawnFloater(this.player.x, this.player.y - 40, `STAR CACHÉ x${starK}`, `#4cc3ff`);
		}
		if (diaK > 0) {
			const scrap = 120 * diaK;
			this.scrap += scrap; this.stats.scrapCollected += scrap;
			for (let i = 0; i < 4 * diaK; i++) { const a = Math.random() * Math.PI * 2; this.dropGritOrb(this.player.x, this.player.y, Math.cos(a) * 130, Math.sin(a) * 130, 3); }
			this.spawnFloater(this.player.x, this.player.y - 32, `+${scrap} SCRAP`, `#e8b34b`);
		}
		soundEngine.playPickup();
		return `cache`;
	}
	// Double-or-nothing gamble on a cache result.
	gambleCache(symbols, forceWin) {
		const win = forceWin !== undefined ? forceWin : Math.random() < .5;
		if (win) {
			this.applyCacheResult(symbols, true);
			this.spawnFloater(this.player.x, this.player.y - 64, `DOUBLED IT`, `#ffd700`);
			soundEngine.tone({ f: 880, f2: 1320, type: `square`, dur: .2, vol: .2 });
		} else {
			this.spawnFloater(this.player.x, this.player.y - 64, `LOST IT ALL`, `#8a8f98`);
			soundEngine.tone({ f: 220, f2: 110, type: `sawtooth`, dur: .35, vol: .2 });
		}
		return win;
	}
	openCache(cache) {
		this.caches.splice(this.caches.indexOf(cache), 1);
		const symbols = this.spinCache();
		this.cacheOpen = { symbols, resolved: false };
		this.isPaused = true; // slot machine pauses the county
		this.callbacks.onCache?.(symbols);
		soundEngine.tone({ f: 440, f2: 880, type: `triangle`, dur: .3, vol: .2 });
	}
	resolveCache() {
		if (!this.cacheOpen) return;
		this.applyCacheResult(this.cacheOpen.symbols, false);
		this.closeCache();
	}
	gambleCacheUI() {
		if (!this.cacheOpen) return;
		this.gambleCache(this.cacheOpen.symbols);
		this.closeCache();
	}
	closeCache() {
		this.cacheOpen = null;
		this.isPaused = false;
		this.callbacks.onCache?.(null);
	}
	checkCachePickup() {
		for (let i = this.caches.length - 1; i >= 0; i--) {
			const c = this.caches[i];
			if (Math.hypot(this.player.x - c.x, this.player.y - c.y) > this.player.radius + 26) continue;
			this.openCache(c);
		}
	}

	// VS-3: three-tier fusing XP gems. 3+ same-tier gems near each other fuse up.
	updateFuse(dt) {
		this.fuseTimer += dt;
		if (this.fuseTimer < .6 || this.grit.length < 3) return;
		this.fuseTimer = 0;
		const used = new Set();
		for (let i = 0; i < this.grit.length; i++) {
			const g = this.grit[i];
			if (used.has(g) || g.tier >= 3) continue;
			const near = [g];
			for (let j = 0; j < this.grit.length && near.length < 3; j++) {
				const h = this.grit[j];
				if (h === g || used.has(h) || h.tier !== g.tier) continue;
				if (Math.hypot(h.x - g.x, h.y - g.y) < 110) near.push(h);
			}
			if (near.length < 3) continue;
			near.forEach((h) => used.add(h));
			const cx = near.reduce((a, h) => a + h.x, 0) / 3, cy = near.reduce((a, h) => a + h.y, 0) / 3;
			const value = near.reduce((a, h) => a + h.value, 0);
			for (const h of near) { this.grit.splice(this.grit.indexOf(h), 1); this.gritPool.push(h); }
			this.dropGritOrb(cx, cy, 0, 0, value);
			const fused = this.grit[this.grit.length - 1];
			if (fused) fused.tier = Math.min(3, g.tier + 1);
			this.spawnFloater(cx, cy - 14, `FUSED`, `#ffd700`);
			soundEngine.tone({ f: 520, f2: 780, type: `sine`, dur: .15, vol: .18 });
		}
	}
	updateDrops(dt = 1 / 60) {
		const magnet = (Math.max(280, this.viewSize().w * 0.28) + this.getPerkLevel(`scavenger`) * 36) * (1 + this.shopMagnetBonus);
		for (let e = this.drops.length - 1; e >= 0; e--) {
			let t = this.drops[e];
			const dx = this.player.x - t.x, dy = this.player.y - t.y;
			const dist = Math.hypot(dx, dy);
			const loot = t.type === `ammo_universal` || t.type === `moonshine_med` || t.type === `molotov_pickup` || t.type === `scrap` || t.type === `dust_devil`;
			if (loot && dist < magnet && dist > this.player.radius + 18) {
				const pull = (1 - dist / magnet) * 340 * dt;
				t.x += (dx / dist) * pull;
				t.y += (dy / dist) * pull;
			}
			if (Math.hypot(this.player.x - t.x, this.player.y - t.y) <= this.player.radius + 22) {
				if (soundEngine.playPickup(), t.type === `ammo_universal`) for (let e of this.weapons) e.unlocked && (e.reserveAmmo = Math.min(e.maxReserveAmmo, e.reserveAmmo + Math.floor(e.magazineSize * 1)));
				else t.type === `dust_devil` ? (this.vacuumSurge = 1.6, this.spawnFloater(this.player.x, this.player.y - 48, `DUST DEVIL`, `#7dd3fc`)) : t.type === `moonshine_med` ? (this.player.health = Math.min(this.player.maxHealth, this.player.health + t.amount), this.player.stamina = this.player.maxStamina) : t.type === `molotov_pickup` ? this.player.molotovs = Math.min(this.player.maxMolotovs, this.player.molotovs + 1) : t.type === `scrap` ? (this.scrap += t.amount, this.stats.scrapCollected += t.amount) : (t.type === `nuke` || t.type === `insta_kill` || t.type === `double_points` || t.type === `infinite_ammo` || t.type === `speed_boost` || t.type === `score_surge`) && this.activatePowerup(t.type);
				// Batch 5: score_surge pickup callout.
				t.type === `score_surge` && (this.spawnFloater(this.player.x, this.player.y - 56, `SCORE SURGE — 2X`, `#ffd700`), soundEngine.tone({ f: 880, f2: 1320, type: `triangle`, dur: .2, vol: .2 }));
				this.drops.splice(e, 1);
			}
		}
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
	createBloodParticles(e, t, n, c = 0) {
		// Batch 8 (Lane B): optional exact count (death burst uses 24).
		const count = c > 0 ? c : Math.max(1, Math.round(7 * this.tune(`particles`)));
		for (let r = 0; r < count; r++) {
			let r = n + (Math.random() - .5) * 1.2, i = 2 + Math.random() * 4;
			this.particles.push(Object.assign(this.allocParticle(), {
				x: e,
				y: t,
				vx: Math.cos(r) * i,
				vy: Math.sin(r) * i,
				size: 2.5 + Math.random() * 3.5,
				color: Math.random() < .7 ? `#880808` : `#550000`,
				alpha: 1,
				life: .35 + Math.random() * .25,
				maxLife: .5,
				type: `blood`
			}));
		}
	}
	createHitSparks(e, t, n) {
		for (let r = 0; r < 6; r++) {
			let r = Math.random() * Math.PI * 2, i = 1.5 + Math.random() * 3.5;
			this.particles.push(Object.assign(this.allocParticle(), {
				x: e,
				y: t,
				vx: Math.cos(r) * i,
				vy: Math.sin(r) * i,
				size: 2,
				color: n,
				alpha: 1,
				life: .2 + Math.random() * .15,
				maxLife: .3,
				type: `spark`
			}));
		}
	}
	zombieSees(z, dist) {
		const touch = z.radius + this.player.radius + 34;
		if (dist <= touch) return true;
		// Batch 7: in the dark, nothing acquires the player past the light radius.
		if (this.dark && dist > Math.max(0.001, this.player.lightRadius || 420)) return false;
		const sight = z.type === `sprinter` ? 300 : z.type === `behemoth` ? 380 : z.type === `crawler` ? 150 : z.type === `bloater_spitter` ? 260 : 230;
		const range = this.player.isSneaking ? sight * 0.62 : this.player.isSprinting ? sight * 2 : sight;
		if (dist > range) return false;
		let ang = Math.atan2(this.player.y - z.y, this.player.x - z.x) - z.angle;
		while (ang > Math.PI) ang -= Math.PI * 2;
		while (ang < -Math.PI) ang += Math.PI * 2;
		const cone = (z.ai === `chase` || z.ai === `attack` ? 1.35 : 0.85) * (this.player.isSneaking ? 0.75 : 1);
		if (Math.abs(ang) > cone) return false;
		const steps = 5;
		for (let i = 1; i <= steps; i++) {
			const t = i / (steps + 1);
			const x = z.x + (this.player.x - z.x) * t;
			const y = z.y + (this.player.y - z.y) * t;
			if (this.checkObstacleCollision(x, y, 6, false)) return false;
		}
		return true;
	}
	segmentHitsCircle(x0, y0, x1, y1, br, cx, cy, cr) {
		const rad = br + cr;
		const fx = x0 - cx, fy = y0 - cy;
		if (fx * fx + fy * fy <= rad * rad) return true;
		const dx = x1 - x0, dy = y1 - y0;
		const a = dx * dx + dy * dy;
		if (a < 0.0001) return false;
		const b = 2 * (fx * dx + fy * dy);
		const c = fx * fx + fy * fy - rad * rad;
		const disc = b * b - 4 * a * c;
		if (disc < 0) return false;
		const s = Math.sqrt(disc);
		const t1 = (-b - s) / (2 * a);
		if (t1 >= 0 && t1 <= 1) return true;
		const t2 = (-b + s) / (2 * a);
		return t2 >= 0 && t2 <= 1;
	}
	checkObstacleCollision(e, t, n, r = true) {
		for (let r of this.currentLocation.obstacles) if (e + n > r.x && e - n < r.x + r.width && t + n > r.y && t - n < r.y + r.height) return true;
		for (let r of this.barricades) if (!(r.health <= 0) && e + n > r.x && e - n < r.x + r.width && t + n > r.y && t - n < r.y + r.height) return true;
		if (r) {
			for (let r of this.explosiveBarrels) if (Math.hypot(e - r.x, t - r.y) < n + r.radius) return true;
		}
		return false;
	}
	smashBarricadeAt(e, t, n) {
		for (let r of this.barricades) r.health <= 0 || e > r.x - 8 && e < r.x + r.width + 8 && t > r.y - 8 && t < r.y + r.height + 8 && (r.health -= n, r.health <= 0 && (this.spawnFloater(r.x + r.width / 2, r.y, `SMASH`, `#e8e0d4`), this.createHitSparks(e, t, `#b45309`)));
	}
	smashHoleAt(e, t, n) {
		for (let r of this.holes) r.boarded && Math.hypot(r.x - e, r.y - t) <= r.radius + 18 && (r.boardHealth -= n, r.boardHealth <= 0 && (r.boarded = false, r.boardHealth = r.maxBoardHealth, this.spawnFloater(r.x, r.y, `HOLE OPEN`, `#c23b22`), soundEngine.playBoardBreak()));
	}
	nearestHole(e) {
		let t = null, n = e;
		for (let e of this.holes) {
			let r = Math.hypot(this.player.x - e.x, this.player.y - e.y);
			r < n && (n = r, t = e);
		}
		return t;
	}
	boardHole(e) {
		if (!e.boarded) {
			if (this.scrap < 25) {
				this.spawnFloater(e.x, e.y - 20, `NEED SCRAP`, `#c23b22`);
				return;
			}
			this.scrap -= 25, e.boarded = true, e.boardHealth = e.maxBoardHealth, this.addScore(40), this.spawnFloater(e.x, e.y - 18, `BOARDED`, `#d4a017`), soundEngine.playBoard();
			for (let t = 0; t < 8; t++) {
				let t = Math.random() * Math.PI * 2;
				this.particles.push(Object.assign(this.allocParticle(), {
					x: e.x,
					y: e.y,
					vx: Math.cos(t) * (1 + Math.random() * 2),
					vy: Math.sin(t) * (1 + Math.random() * 2),
					size: 2 + Math.random() * 3,
					color: `#5c4630`,
					alpha: 1,
					life: .4,
					maxLife: .4,
					type: `wood_splinter`
				}));
			}
			this.holes.length > 0 && this.holes.every((e) => e.boarded) && this.callbacks.onRadio?.(`Unknown`, `The holes went quiet. Keep the lantern. They'll try the boards.`);
		}
	}
	relightLantern() {
		this.lanternLit = true, soundEngine.playLantern(), this.spawnFloater(this.currentLocation.lantern.x, this.currentLocation.lantern.y - 24, `LIT`, `#d4a017`), this.callbacks.onRadio?.(`Unknown`, `East window's burning again. Hold it.`);
	}
	snuffLantern() {
		this.lanternLit && (this.lanternLit = false, this.lanternWentOut = true, this.trauma = Math.min(1, this.trauma + .35 * this.tune('shake') * this.motionScale()), soundEngine.playSnuff(), this.spawnFloater(this.currentLocation.lantern.x, this.currentLocation.lantern.y - 24, `LANTERN OUT`, `#c23b22`), this.callbacks.onRadio?.(`Unknown`, `The lantern's gone. Cellar holes are coughing. They know the Trace.`));
	}
	updateLantern() {
		let e = this.currentLocation.lantern;
		if (e && this.lanternLit) {
			for (let t of this.zombies) if (Math.hypot(t.x - e.x, t.y - e.y) < 44) {
				this.snuffLantern();
				return;
			}
		}
	}
	updateBellHold(e) {
		let t = this.currentLocation.bell;
		(this.keys.KeyE || this.holdInteract) && this.bellReady && !this.bellRung && t && Math.hypot(this.player.x - t.x, this.player.y - t.y) < 80 ? (this.bellHold += e, this.bellHold >= 2.2 && this.ringBell()) : this.bellHold = Math.max(0, this.bellHold - e * 1.6);
	}
	ringBell() {
		let e = this.currentLocation.bell;
		if (e && !this.bellRung) {
			this.bellRung = true, this.bellReady = false, this.bellHold = 2.2, this.bellLureUntil = this.simTime + 10, this.extractActive = true, this.trauma = Math.min(1, this.trauma + .7 * this.tune('shake') * this.motionScale()), this.screenShake = 12 * this.tune('shake') * this.motionScale(), soundEngine.playBell(), this.alertZombies(e.x, e.y, 2e3);
			for (let t of this.zombies) t.hearX = e.x, t.hearY = e.y, t.ai = `investigate`;
			this.callbacks.onExtractReady?.(), this.callbacks.onRadio?.(`WJPS Petersburg`, `The bell. Truck's lit. Get off this ground.`);
		}
	}
	weaponHearRadius(e) {
		switch (e) {
			case `crossbow`: return 0;
			case `carbine`: return 380;
			case `revolver`: return 480;
			case `shotgun`: return 580;
			case `lever_rifle`: return 740;
			case `chainsaw`: return 420;
			default: return 420;
		}
	}
	updateNoisePulses(e) {
		for (let t = this.noisePulses.length - 1; t >= 0; t--) {
			let n = this.noisePulses[t];
			n.life -= e, n.radius = n.maxRadius * (1 - n.life / n.maxLife), n.life <= 0 && this.noisePulses.splice(t, 1);
		}
	}
	alertZombies(e, t, n, quiet = false) {
		if (!(n <= 0)) {
			if (!quiet) {
				this.noisePulses.push({
					x: e,
					y: t,
					radius: 8,
					maxRadius: n,
					life: .7,
					maxLife: .7
				}), this.noisePulses.length > 10 && this.noisePulses.shift();
			}
			for (let r of this.zombies) {
				if (Math.hypot(r.x - e, r.y - t) > n) continue;
				r.hearX = e; r.hearY = t; r.quietT = 6; // Batch 9 (Lane 1): noise is a stimulus.
				(r.ai === `wander` || r.ai === `idle` || r.ai === `spotted`) && (r.ai = `investigate`);
			}
		}
	}
	emitNoise(x, y, radius) {
		this.alertZombies(x, y, radius);
	}
	// Group 1: ghost personalities — per-type targeting rule. Returns [tx, ty, blend]
	// where blend 0 = pure flow-field pathing, 1 = direct steering to target.
	nearestObjective(x, y) {
		let bx = 0, by = 0, bd = 1e12, found = false;
		for (const h of this.holes) if (h.boarded) {
			const dx = h.x - x, dy = h.y - y, d = dx * dx + dy * dy;
			if (d < bd) { bd = d; bx = h.x; by = h.y; found = true; }
		}
		for (const t of this.traps) if (t.live !== false) {
			const dx = t.x - x, dy = t.y - y, d = dx * dx + dy * dy;
			if (d < bd) { bd = d; bx = t.x; by = t.y; found = true; }
		}
		return found ? { x: bx, y: by } : null;
	}
	personalityTarget(r, i, a, o) {
		const px = this.player.x, py = this.player.y;
		// Batch 3: flanked zombies swing wide around the player.
		if (r.flankUntil > this.simTime && r.type !== `bloater_spitter`) {
			const fdx = px - r.x, fdy = py - r.y, fd = Math.hypot(fdx, fdy) || 1;
			const fs = r.flankSide || 1;
			return [px + (-fdy / fd) * fs * 220, py + (fdx / fd) * fs * 220, .8];
		}
		// Batch 6 (Lane A): chewing zombies steer at the structure, not the player.
		if (r.ai === `chew`) return [r.chewX, r.chewY, .85];
		switch (r.type) {
			case `sprinter`:
				return [px + this.moveVX * 24, py + this.moveVY * 24, .65];
			case `crawler`: {
				const d = o || 1, s = r.flank || 1;
				return [px + (-a / d) * s * 130, py + (i / d) * s * 130, .65];
			}
			case `miner_brute`: {
				const ob = this.nearestObjective(r.x, r.y);
				return ob ? [ob.x, ob.y, .8] : [px, py, 0];
			}
			case `bomber`: {
				const ob = this.nearestObjective(r.x, r.y);
				let tx = px, ty = py;
				const pd = i * i + a * a;
				if (ob) { const dx = ob.x - r.x, dy = ob.y - r.y; if (dx * dx + dy * dy < pd) { tx = ob.x; ty = ob.y; } }
				// Batch 3: bombers hunt clusters — drift toward the densest nearby pack.
				if (tx === px) {
					const bq = this.queryZombies(r.x, r.y, 420, []);
					let bx = 0, by = 0, bn = 0;
					for (const k of bq) {
						const z = this.zombies[k];
						if (!z || z === r || z.type === `bomber`) continue;
						bx += z.x; by += z.y; bn++;
					}
					if (bn >= 3) { tx = bx / bn; ty = by / bn; }
				}
				return [tx, ty, .8];
			}
			// Batch 6 (Lane A): ranged archetype kiting — keepDistance 260, firingRange 420.
			case `bloater_spitter`: {
				const KD = this.b6spitKeep, FR = this.b6spitFire;
				if (o > FR) return [px, py, .7]; // too far: advance
				if (o < KD) { // too close: back away
					const d = o || 1, back = KD - o + 120;
					return [r.x - (i / d) * back, r.y - (a / d) * back, .8];
				}
				// hold band: strafe sideways while spitting, not aimbot-perfect
				const d = o || 1;
				if (!r.strafeDir) r.strafeDir = Math.random() < .5 ? 1 : -1;
				else if (Math.random() < .002) r.strafeDir = -r.strafeDir;
				const s = r.strafeDir;
				return [r.x + (-a / d) * s * 140, r.y + (i / d) * s * 140, .75];
			}
			case `riot`: {
				const q = this.queryZombies(r.x, r.y, 500, []);
				let ax = 0, ay = 0, ad = 1e12;
				for (const k of q) {
					const z = this.zombies[k];
					if (!z || z === r) continue;
					const dx = z.x - r.x, dy = z.y - r.y, d = dx * dx + dy * dy;
					if (d < ad) { ad = d; ax = z.x; ay = z.y; }
				}
				return ad < 1e12 ? [(px + ax) / 2, (py + ay) / 2, .5] : [px, py, 0];
			}
			default:
				return [px, py, 0];
		}
	}
	// Batch 6 (Lane A): spitter ranged behavior — jittered cooldown, lead + noise aim.
	// Readable, not aimbot-perfect: the spit leads the player a touch, then wanders.
	tickSpitter(r, i, a, o, e) {
		r.spitCd -= e;
		if (r.spitCd > 0 || o > this.b6spitFire) return;
		r.spitCd = 2.6 + Math.random() * 1.4;
		const flight = o / 420; // spit travels ~7px/frame = 420px/s
		const lx = this.player.x + this.moveVX * flight, ly = this.player.y + this.moveVY * flight;
		const aim = Math.atan2(ly - r.y, lx - r.x) + (Math.random() - .5) * .22;
		r.angle = aim;
		this.acidSpits.push({
			id: Math.random().toString(),
			x: r.x,
			y: r.y,
			vx: Math.cos(aim) * 7,
			vy: Math.sin(aim) * 7,
			radius: 7,
			damage: 22,
			remainingDistance: 450
		});
		// Batch 7: spit telegraph — the renderer drains state.telegraphs.
		this.pushTelegraph(`ranged`, r.x, r.y, 90, .6);
		soundEngine.playZombieHit(false);
	}
	// Batch 6 (Lane A): bomber formal spec — fuseRange starts the fuse, fuseTime burns
	// it down with an accelerating beep; expiry detonates via killZombie (blast uses
	// b6blastR / b6blastDmg with the existing falloff). Returns false if the bomber died.
	tickFuse(r, o, e, n) {
		if (o > this.b6fuseRange + r.radius + this.player.radius) { r.fuseT = 0; return true; }
		if (!(r.fuseT > 0)) { r.fuseT = this.b6fuseTime; r.fuseBeepT = 0; }
		r.fuseT -= e;
		const prog = 1 - Math.max(0, r.fuseT) / this.b6fuseTime;
		r.fuseBeepT -= e;
		if (r.fuseBeepT <= 0) {
			r.fuseBeepT = .3 - .24 * prog; // beeps accelerate as the fuse burns down
			soundEngine.tone({ f: Math.round(660 + prog * 660), type: `square`, dur: .05, vol: .09 });
		}
		if (r.fuseT <= 0) { this.killZombie(r, n); return false; }
		return true;
	}
	// Batch 6 (Lane A): structure-chewing as a utility decision. Zombies weigh chewing
	// boards / turrets / barricades against chasing the player: a per-type bias times
	// structure value over distance, versus player proximity (doubled when the zombie
	// was recently shot). Defense becomes a resource, not a coin flip.
	tickChew(r, o, e) {
		r.chewEvalT -= e;
		if (r.chewEvalT <= 0) {
			r.chewEvalT = .3; // 3-4 decisions/sec per zombie; no per-frame structure scan
			const bias = r.type === `miner_brute` ? 2.2 : r.type === `behemoth` ? 2 : r.type === `riot_shield` ? 1.1 : r.type === `riot` ? 1 : r.type === `shambler` ? .8 : r.type === `bloater_spitter` ? .7 : r.type === `crawler` ? .5 : r.type === `sprinter` ? .15 : 0;
			let bk = ``, bx = 0, by = 0, bs = 0;
			if (bias > 0) {
				for (const h of this.holes) {
					if (!h.boarded) continue;
					const d = Math.hypot(h.x - r.x, h.y - r.y);
					const u = bias / (1 + d / 140);
					if (u > bs) { bs = u; bk = `hole`; bx = h.x; by = h.y; }
				}
				for (const b of this.barricades) {
					if (b.health <= 0) continue;
					const d = Math.hypot(b.x + b.width / 2 - r.x, b.y + b.height / 2 - r.y);
					const u = bias * .8 / (1 + d / 140);
					if (u > bs) { bs = u; bk = `barricade`; bx = b.x + b.width / 2; by = b.y + b.height / 2; }
				}
				for (const t of this.traps) {
					if (t.kind !== `post` || !t.live || t.blown) continue;
					const d = Math.hypot(t.x - r.x, t.y - r.y);
					const u = bias * 1.3 / (1 + d / 140);
					if (u > bs) { bs = u; bk = `post`; bx = t.x; by = t.y; }
				}
			}
			let chase = 1 / (1 + o / 260);
			if (this.simTime < r.chewAggroT) chase *= 2; // recently shot: player first
			if (bk && bs > chase * 1.15) {
				r.ai = `chew`; r.chewKind = bk; r.chewX = bx; r.chewY = by;
			} else if (r.ai === `chew`) {
				r.ai = `chase`; r.chewKind = ``;
			}
		}
		// A player right on top of a chewing zombie interrupts the meal.
		if (r.ai === `chew` && o <= r.radius + this.player.radius + 40) { r.ai = `attack`; r.chewKind = ``; return; }
		this.chewAttack(r, e);
	}
	chewAttack(r, e) {
		if (r.ai !== `chew`) return;
		if (Math.hypot(r.chewX - r.x, r.chewY - r.y) > 46) return;
		r.chewAtkT -= e;
		if (r.chewAtkT > 0) return;
		r.chewAtkT = .8;
		const dmg = r.damage * .35 * (1 + this.wave * .04);
		if (r.chewKind === `hole`) this.smashHoleAt(r.chewX, r.chewY, dmg);
		else if (r.chewKind === `barricade`) this.smashBarricadeAt(r.chewX, r.chewY, dmg * .8);
		else if (r.chewKind === `post`) this.damagePostAt(r.chewX, r.chewY, dmg);
		r.angle = Math.atan2(r.chewY - r.y, r.chewX - r.x);
		this.createHitSparks(r.chewX, r.chewY, `#b45309`);
	}
	damagePostAt(x, y, dmg) {
		for (const t of this.traps) {
			if (t.kind !== `post` || !t.live || t.blown) continue;
			if (Math.hypot(t.x - x, t.y - y) > 60) continue;
			t.hp = (t.hp ?? 70) - dmg;
			if (t.hp <= 0) {
				t.live = false; t.blown = true;
				this.spawnFloater(t.x, t.y - 30, `POST DOWN`, `#c23b22`);
				soundEngine.playBoardBreak();
			}
			return;
		}
	}
	// Batch 6 (Lane A): off-screen objectives — zombies with no player stimulus drift
	// toward open holes, shrines, and the workbench so the map edges stay alive.
	tickDrift(r, e) {
		r.driftEvalT -= e;
		if (r.driftEvalT <= 0) {
			r.driftEvalT = 1.2;
			let bk = ``, bx = 0, by = 0, bd = 1e12;
			for (const h of this.holes) {
				if (h.boarded) continue;
				const dx = h.x - r.x, dy = h.y - r.y, d = dx * dx + dy * dy;
				if (d < bd) { bd = d; bk = `hole`; bx = h.x; by = h.y; }
			}
			for (const s of this.shrines) {
				const dx = s.x - r.x, dy = s.y - r.y, d = dx * dx + dy * dy;
				if (d < bd) { bd = d; bk = `shrine`; bx = s.x; by = s.y; }
			}
			const wb = this._wbHidden9 ? null : this.currentLocation.workbench; // Batch 9: stashObjectives9 hides it.
			if (wb) {
				const dx = wb.x - r.x, dy = wb.y - r.y, d = dx * dx + dy * dy;
				if (d < bd) { bd = d; bk = `workbench`; bx = wb.x; by = wb.y; }
			}
			r.driftKind = bk; r.driftX = bx; r.driftY = by;
			// Batch 9 (Lane 1): off-screen objective fallback — with no objectives
			// left on the map, drift toward the map center so the edges stay alive.
			if (!r.driftKind) { r.driftKind = `center`; r.driftX = this.currentLocation.mapWidth / 2; r.driftY = this.currentLocation.mapHeight / 2; }
		}
		if (r.driftKind) {
			const dx = r.driftX - r.x, dy = r.driftY - r.y;
			if (dx * dx + dy * dy > 100 * 100) {
				const want = Math.atan2(dy, dx);
				let da = want - r.wanderAngle;
				while (da > Math.PI) da -= 2 * Math.PI;
				while (da < -Math.PI) da += 2 * Math.PI;
				r.wanderAngle += da * Math.min(1, e * 2);
			}
		}
	}
	// Group 1: spatial hash broadphase for zombie queries
	rebuildZombieHash() {
		const h = this.zhash, c = this.zhashCell;
		h.clear();
		let maxR = 20;
		for (let k = 0; k < this.zombies.length; k++) {
			const z = this.zombies[k];
			if (z.radius > maxR) maxR = z.radius;
			const key = Math.floor(z.x / c) * 4096 + Math.floor(z.y / c);
			let cell = h.get(key);
			if (!cell) h.set(key, cell = []);
			cell.push(k);
		}
		this.zhashMaxR = maxR;
	}
	queryZombies(x, y, radius, out) {
		out.length = 0;
		const c = this.zhashCell;
		const x0 = Math.floor((x - radius) / c), x1 = Math.floor((x + radius) / c);
		const y0 = Math.floor((y - radius) / c), y1 = Math.floor((y + radius) / c);
		for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
			const cell = this.zhash.get(cx * 4096 + cy);
			if (cell) for (let j = 0; j < cell.length; j++) out.push(cell[j]);
		}
		return out;
	}
	// Group 1: dynamic point lights
	addLight(x, y, radius, intensity, ttl) {
		if (this.dynLights.length >= 24) this.dynLights.shift();
		this.dynLights.push({ x, y, radius, intensity, ttl });
	}
	updateDynLights(e) {
		for (let i = this.dynLights.length - 1; i >= 0; i--) {
			const l = this.dynLights[i];
			l.ttl -= e;
			if (l.ttl <= 0) this.dynLights.splice(i, 1);
		}
	}
	// Group 1: object pools
	allocParticle() {
		const p = this.particlePool.pop();
		if (p) { p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.size = 0; p.color = ``; p.alpha = 0; p.life = 0; p.maxLife = 1; p.type = ``; return p; }
		return {};
	}
	allocBullet() {
		const b = this.bulletPool.pop();
		if (b) { b.x = 0; b.y = 0; b.vx = 0; b.vy = 0; b.radius = 0; b.damage = 0; b.pierce = 0; b.rangeRemaining = 0; b.color = ``; b.id = ``; b.weaponType = ``; b.isMolotov = false; b.isFlare = false; b.isSplinter = false; b.isCrossbowBolt = false; b.isForkChild = false; b.isMissile = false; b.missileTurn = 0; b.missileAoe = 0; b.bouncesLeft = undefined; b.lastHit = null; b.lastHitCd = 0; return b; }
		return {};
	}
	freeBulletAt(t) {
		const b = this.bullets[t];
		this.bullets.splice(t, 1);
		if (b) this.bulletPool.push(b);
	}
	spawnFloater(e, t, n, r) {
		const f = this.floaterPool.pop() || {};
		f.x = e; f.y = t; f.text = n; f.color = r; f.life = .7; f.maxLife = .7; f.vy = -28; f.dmg = false; f.onFree = null;
		this.floaters.push(f), this.floaters.length > 40 && this.floaterPool.push(this.floaters.shift());
	}
	boon(id: string) {
		return this.boonStacks[id] || 0;
	}
	offerDraft() {
		this.draft = rollBoons(this.boonStacks, this.player.molotovs, this.player.maxMolotovs, this.posts, this.pipes, this.draftExclusions());
		this.callbacks.onDraft?.(this.draft);
	}
	// Batch 3: draft exclusions — banished + locked-out boons.
	draftExclusions() {
		return new Set([...this.banishedBoons, ...this.lockedBoons]);
	}
	// Batch 2: breakpoint bonuses — the 6th rank of a boon pays out big, once.
	checkBreakpoint(id) {
		if ((this.boonStacks[id] || 0) !== 6 || this.breakpointsHit.has(id)) return;
		this.breakpointsHit.add(id);
		const label = { lead: `WHITE-HOT LEAD`, trigger: `HAIR TRIGGER`, bone: `BONE ORCHARD`, ring: `FULL CIRCLE`, storm: `STORM'S EYE` }[id];
		if (!label) return;
		if (id === `lead`) this.bpDamageMul = 1.3;
		if (id === `trigger`) this.bpFireMul = .85;
		if (id === `bone`) this.bpBlastMul = 1.4;
		if (id === `ring`) this.bpOrbiters = 2;
		if (id === `storm`) this.bpChains = 2;
		this.spawnFloater(this.player.x, this.player.y - 64, `BREAKPOINT — ${label}`, `#ffd700`);
		this.callbacks.onRadio?.(`Unknown`, `Six deep on that trick. The county just blinked.`);
		soundEngine.tone({ f: 660, type: `square`, dur: .1, vol: .2 });
		soundEngine.tone({ f: 990, type: `square`, dur: .2, vol: .2, delay: .1 });
	}
	takeBoon(id: string) {
		if (!this.draft?.some((b) => b.id === id)) return;
		this.boonStacks[id] = (this.boonStacks[id] || 0) + 1;
		if (id === `hide`) {
			this.player.maxHealth += 16;
			this.player.health = Math.min(this.player.maxHealth, this.player.health + 16);
		} else if (id === `shells`) {
			for (const w of this.weapons) {
				if (!w.unlocked || w.id === `chainsaw`) continue;
				const n = w.id === `shotgun` ? 8 : w.id === `crossbow` ? 6 : 12;
				w.reserveAmmo = Math.min(w.maxReserveAmmo, w.reserveAmmo + n);
			}
		} else if (id === `jug`) {
			this.player.molotovs = Math.min(this.player.maxMolotovs, this.player.molotovs + 1);
		} else if (id === `leavings`) {
			this.scrap += 45;
			this.stats.scrapCollected += 45;
		} else if (id === `post`) {
			this.posts = Math.min(3, this.posts + 1);
		} else if (id === `pipe`) {
			this.pipes = Math.min(4, this.pipes + 1);
		}
		this.checkBreakpoint(id);
		// Batch 3: ability forks — this pick locks out its rivals.
		for (const l of LOCKOUTS[id] || []) {
			if (!this.lockedBoons.has(l) && !(this.boonStacks[l] > 0)) {
				this.lockedBoons.add(l);
				const ln = BOON_CATALOG.find((b) => b.id === l)?.name || l;
				this.spawnFloater(this.player.x, this.player.y - 80, `LOCKED OUT: ${ln.toUpperCase()}`, `#8a8f98`);
			}
		}
		const picked = this.draft.find((b) => b.id === id);
		this.draft = null;
		if (this.waveState === `break`) {
			this.waveBreakCountdown = Math.max(this.waveBreakCountdown, 5);
			this.lastBreakTick = Date.now();
		}
		this.callbacks.onDraft?.(null);
		this.spawnFloater(this.player.x, this.player.y - 48, picked?.name ?? "TAKEN", "#d4a017");
		soundEngine.playPowerup();
		if (this.queuedLevels > 0) {
			this.queuedLevels--;
			// Balance: ~3s of live play before the next queued draft opens,
			// instead of chain-pausing back-to-back drafts. No grace needed
			// when nothing remains queued — a stale grace would block drafts.
			if (this.queuedLevels > 0) this.draftGraceUntil = Date.now() + 3000;
		}
		if (this.levelHold) {
			this.levelHold = false;
			this.setPaused(false);
		}
	}
	rerollDraft() {
		if (!this.draft || this.rerolls <= 0) return;
		this.rerolls--;
		this.draft = rollBoons(this.boonStacks, this.player.molotovs, this.player.maxMolotovs, this.posts, this.pipes, this.draftExclusions());
		this.callbacks.onDraft?.(this.draft);
	}
	xpToNext() {
		const early = [22, 32, 44];
		if (this.level <= early.length) return early[this.level - 1];
		return 44 + (this.level - 3) * 14;
	}
	gritValue(type) {
		const m = this.mutators.includes(`rich`) ? 2 : 1;
		const em = this.eventMods().gritMult;
		if (type === `behemoth`) return 8 * m * em;
		if (type === `riot` || type === `riot_shield`) return 4 * m * em;
		if (type === `miner_brute` || type === `bloater_spitter`) return 3 * m * em;
		if (type === `sprinter` || type === `bomber`) return 2 * m * em;
		return 1 * m * em;
	}
	dropGritOrb(x, y, vx, vy, value, lucky = false) {
		if (this.grit.length >= GRIT_GROUND_CAP) {
			const m = this.grit[(Math.random() * this.grit.length) | 0];
			m.value += value;  // merge, don't spawn
			m.tier = m.value >= 12 ? 3 : m.value >= 4 ? 2 : 1;
			return;
		}
		const g0 = this.gritPool.pop() || {};
		g0.x = x; g0.y = y; g0.vx = vx; g0.vy = vy; g0.value = value; g0.lucky = lucky;
		g0.tier = value >= 12 ? 3 : value >= 4 ? 2 : 1;
		this.grit.push(g0);
	}
	spawnGrit(z) {
		let value = this.gritValue(z.type) * (this.gritValueMul || 1); // Batch 9 (Lane 1): stage grit rule.
		if (this.gritBag > 0) { value += 1; this.gritBag--; }  // bag pays out into fresh drops
		const bits = value > 3 ? 4 : value > 1 ? 2 : 1;
		for (let i = 0; i < bits; i++) {
			const a = Math.random() * Math.PI * 2;
			const lucky = Math.random() < 0.06;
			this.dropGritOrb(z.x, z.y, Math.cos(a) * (40 + Math.random() * 50), Math.sin(a) * (40 + Math.random() * 50), (value / bits) * (lucky ? 5 : 1), lucky);
		}
		if (z.elite) {
			for (let i = 0; i < 6; i++) {
				const a = Math.random() * Math.PI * 2;
				this.dropGritOrb(z.x, z.y, Math.cos(a) * 120, Math.sin(a) * 120, 2);
			}
		}
	}
	sweepGritToBag() {
		if (!this.grit.length) return;
		let n = 0;
		for (const g of this.grit) { this.gritBag += g.value; n += g.value; }
		this.grit = [];
		this.spawnFloater(this.player.x, this.player.y - 56, `GRIT BAGGED +${Math.round(n)}`, "#f6c453");
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
	addXp(n) {
		// Batch 7: run-stat XP multiplier (defaults to 1 when the meta lane is absent).
		this.xp += n * this.eventMods().xpMult * (this.runXpMul || 1);
		let gained = 0;
		while (this.xp >= this.xpToNext()) {
			this.xp -= this.xpToNext();
			this.level++;
			this.queuedLevels++;
			gained++;
		}
		// A pending draft grace counts as a draft in flight — the loop opens it when the grace expires.
		if (!gained || this.draft || this.draftGraceUntil > 0) return;
		this.openQueuedDraft();
	}
	updateGrit(dt) {
		if (this.jars) {
			for (let i = this.jars.length - 1; i >= 0; i--) {
				const j = this.jars[i];
				if (Math.hypot(this.player.x - j.x, this.player.y - j.y) < 36) {
					this.jars.splice(i, 1);
					this.addXp(2);
					this.spawnFloater(j.x, j.y - 16, "JAR", "#f6c453");
					soundEngine.playPickup();
				}
			}
		}
		const span = this.viewSize().w;
		const magnet = (Math.max(420, span * 0.46) + this.getPerkLevel(`scavenger`) * 40 + this.gritBonus * 36) * (this.pickupRadiusMul || 1); // Batch 9: character pickup-radius passive.
		// Batch 4: Dust Devil surge — every ground orb flies to the player.
		if (this.vacuumSurge > 0) {
			this.vacuumSurge -= dt;
			for (const g of this.grit) {
				const dx = this.player.x - g.x, dy = this.player.y - g.y, d = Math.hypot(dx, dy) || 1;
				const step = Math.min(1500 * dt, d);
				g.x += (dx / d) * step; g.y += (dy / d) * step;
				g.vx = 0; g.vy = 0;
			}
		}
		for (let i = this.grit.length - 1; i >= 0; i--) {
			const g = this.grit[i];
			const dx = this.player.x - g.x;
			const dy = this.player.y - g.y;
			const d = Math.hypot(dx, dy) || 1;
			if (d < this.player.radius + 18) {
				this.addXp(g.value);
				soundEngine.playGrit();
				this.gritPool.push(g), this.grit.splice(i, 1);
				continue;
			}
			if (d < magnet) {
				const pull = 260 + (1 - d / magnet) * 980;
				g.x += (dx / d) * pull * dt;
				g.y += (dy / d) * pull * dt;
			} else {
				g.x += g.vx * dt;
				g.y += g.vy * dt;
				g.vx *= 0.9;
				g.vy *= 0.9;
			}
		}
		if (this.wantVacuum) {
			this.wantVacuum = false;
			let extra = 0;
			for (const g of this.grit) extra += g.value;
			this.grit = [];
			if (extra > 0) this.addXp(extra);
		}
		for (let i = this.chests.length - 1; i >= 0; i--) {
			const c = this.chests[i];
			if (Math.hypot(this.player.x - c.x, this.player.y - c.y) > this.player.radius + 26) continue;
			this.chests.splice(i, 1);
			this.openChest();
		}
		this.checkCachePickup();
	}
	openChest() {
		this.bumpLifetime(`chestsOpened`);
		if (this.boon(`lead`) >= 1 && this.evolved !== `lincoln`) {
			this.evolved = `lincoln`;
			this.spawnFloater(this.player.x, this.player.y - 36, "LINCOLN'S LOAD", "#f6c453"), this.trauma = Math.min(1, this.trauma + .5 * this.tune('shake') * this.motionScale());
			this.callbacks.onRadio?.(`Unknown`, `The magnum took the hand-load. It punches through, and a headshot puts blood back in you.`);
			soundEngine.playPowerup();
			return;
		}
		if (this.checkEvolutions()) return;  // weapon evolution consumed this chest
		this.scrap += 80;
		this.stats.scrapCollected += 80;
		this.player.health = Math.min(this.player.maxHealth, this.player.health + 25);
		this.rerolls++;
		this.spawnFloater(this.player.x, this.player.y - 36, "CHEST", "#f6c453");
		soundEngine.playPickup();
	}
	getPerkLevel(e) {
		let t = this.perks.find((t) => t.id === e);
		return t ? t.level : 0;
	}
	renderGrit(e) {
		const { camL, camT, camR, camB } = this.viewCull(48);
		const rad = Math.max(6, 12 / this.viewZoom());
		for (const g of this.grit) {
			if (g.x < camL || g.x > camR || g.y < camT || g.y > camB) continue;
			const tier = g.tier || 1;
			if (g.lucky || tier >= 3) {
				e.fillStyle = tier >= 3 ? "rgba(255, 140, 40, 0.3)" : "rgba(255, 215, 0, 0.25)";
				e.beginPath();
				e.arc(g.x, g.y, rad * (tier >= 3 ? 3 : 2.4), 0, Math.PI * 2);
				e.fill();
			}
			e.fillStyle = g.lucky ? "#ffd700" : tier === 3 ? "#ff9a3c" : tier === 2 ? "#ffe066" : "#f6c453";
			e.beginPath();
			e.arc(g.x, g.y, (g.lucky ? rad * 1.6 : rad) * (1 + (tier - 1) * .35), 0, Math.PI * 2);
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
	screenToWorld(sx, sy) {
		const { z } = this.viewSize();
		return {
			x: this.camX + (sx - this.canvas.width / 2) / z,
			y: this.camY + (sy - this.canvas.height / 2) / z
		};
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
		this.renderHoles(e), this.renderLantern(e), this.renderBell(e), this.renderParticles(e);
		this.renderShockwaves(e); // VS-3: kill shockwaves
		// Batch 7: enemy telegraphs (engine stores sim-seconds; renderer takes ms) + celebration particles.
		if (this.telegraphs.length) {
			const nowMs = this.simTime * 1000;
			renderTelegraphs(e, this.telegraphs.map((tg) => ({ kind: tg.kind, x: tg.x, y: tg.y, r: tg.r, t0: tg.t0 * 1000, dur: tg.dur * 1000 })), nowMs, this.player);
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
			this.renderMinimap(e, t, n);
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
			// Batch 6 (Lane B): pooled baked blob shadow.
			drawBlobShadow(e, 2, t.radius * .72, t.radius * 1.05);
			if (t.elite) {
				e.strokeStyle = "#ffd700";
				e.lineWidth = 3;
				e.beginPath();
				e.ellipse(2, t.radius * .72, t.radius * 1.35, t.radius * .55, 0, 0, Math.PI * 2);
				e.stroke();
				// Batch 2: affix tells — color-coded rings so elites read at a glance.
				if (t.affix) {
					const pulse = .6 + .4 * Math.sin(this.simTime * 5);
					const col = { volatile: `rgba(255,107,53,${pulse})`, vampiric: `rgba(190,24,60,${pulse})`, leaping: `rgba(255,255,255,${t.leapTele > 0 ? 1 : pulse * .7})`, shielded: `rgba(76,195,255,${pulse})`, swift: `rgba(230,230,230,${pulse * .8})`, frosted: `rgba(125,211,252,${pulse})` }[t.affix];
					e.strokeStyle = col; e.lineWidth = 2.5;
					e.beginPath();
					e.ellipse(2, t.radius * .72, t.radius * (t.affix === `volatile` ? 1.6 + .25 * pulse : 1.55), t.radius * .68, 0, 0, Math.PI * 2);
					e.stroke();
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
			drawSprite(e, t.type === "riot_shield" ? "riot" : t.type === "haint" ? "shambler" : t.type, tall, t.hitFlash, false);
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
