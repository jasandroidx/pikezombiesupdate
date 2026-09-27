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
import { rollBoons, BoonOffer } from "./boons";
import { INITIAL_WEAPONS, AVAILABLE_PERKS, GAME_LOCATIONS, BOARD_COST, EVOLUTIONS, RUN_EVENTS, GRIT_GROUND_CAP, BOMB_RADIUS, BOMB_DMG, BOMB_MAX_CHARGES, BOMB_REGEN_MS } from "./constants";
import { soundEngine } from "../audio/soundEngine";
import { renderEnvironment } from "./mapRenderer";
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
		flashlightAngle: 0,
		molotovs: 3,
		maxMolotovs: 5,
		flares: 2,
		maxFlares: 4
	};
	weapons = JSON.parse(JSON.stringify(INITIAL_WEAPONS));
	currentWeaponIndex = 0;
	perks = JSON.parse(JSON.stringify(AVAILABLE_PERKS));
	boonStacks: Record<string, number> = {};
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
	camX = 0;
	camY = 0;
	trauma = 0;
	hitstop = 0;
	floaters = [];
	simTime = 0;
	lastMoveSpeed = 0;
	walkPhase = 0;
	moveVX = 0;
	moveVY = 0;
	bodyFacing = 1;
	bodyFacingSmooth = 1;
	sprintBlend = 1;
	recoilKick = 0;
	lastDt = 1 / 60;
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
		notesFound: 0
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
	constructor(e, t, n = 0) {
		this.canvas = e, this.ctx = e.getContext(`2d`), this.callbacks = t, this.currentLocation = GAME_LOCATIONS[n] || GAME_LOCATIONS[0], this.lighting = new DynamicLighting(), this.placePlayerSafely(), this.camX = this.player.x, this.camY = this.player.y, this.initExplosiveBarrels(), this.initLoreNotes(), this.initBarricades(), this.initHoles(), this.rebuildFlow(true), this.setupListeners(), this.installControlsProbe();
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
			sys: () => ({
				bomb: { charges: this.bombCharges, max: BOMB_MAX_CHARGES },
				grit: { bag: Math.round(this.gritBag), ground: this.grit.length },
				events: { fired: [...this.firedEvents], active: this.activeEvents.map((a) => a.id) },
				mods: this.eventMods(),
				evoHints: this.evolutionHints(),
				revolver: (() => { const w = this.weapons.find((x) => x.id === `revolver`); return w ? { name: w.name, dmg: w.damage, fireRate: w.fireRate, pierce: w.pierce } : null; })(),
				zombies: () => this.zombies.slice(0, 8).map((z) => ({ id: String(z.id).slice(-6), t: z.type, h: Math.round(z.health), d: Math.round(Math.hypot(z.x - this.player.x, z.y - this.player.y)) })),
			}),
			detonate: () => this.detonateBomb(),
			giveBoon: (id, n = 1) => { this.boonStacks[id] = (this.boonStacks[id] || 0) + n; },
			openChest: () => this.openChest(),
			sweepGrit: () => this.sweepGritToBag(),
			spawnGritAt: (x, y, v) => this.dropGritOrb(x, y, 0, 0, v),
			fireEvent: (id) => { const ev = RUN_EVENTS.find((e) => e.id === id); if (ev && !this.firedEvents.includes(id)) this.fireEvent(ev); },
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
		let t = this.activePowerups.find((t) => t.type === e);
		t ? (t.durationRemaining = 3e4, t.totalDuration = 3e4) : this.activePowerups.push({
			type: e,
			durationRemaining: 3e4,
			totalDuration: 3e4
		}), e === `speed_boost` && (this.player.stamina = this.player.maxStamina);
	}
	detonateNuke() {
		soundEngine.playNuke(), this.screenShake = 14;
		for (let e = 0; e < 60; e++) {
			let e = Math.random() * Math.PI * 2, t = Math.random() * 500;
			this.particles.push({
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
			});
		}
		this.zombies.length;
		for (let e = this.zombies.length - 1; e >= 0; e--) {
			let t = this.zombies[e];
			this.score += t.scoreValue, this.scrap += t.scrapValue, this.stats.kills++, this.bloodDecals.push({
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
		r && (r.collected = true, soundEngine.playLoreNote(), this.score += 250, this.scrap += 50, this.stats.notesFound += 1, this.callbacks.onLoreNoteFound && this.callbacks.onLoreNoteFound(r));
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
		this.difficultyMultiplier = e, this.isRunning = true, this.isPaused = false, this.gameStartTime = Date.now(), this.lastTimestamp = performance.now(), this.wave = 0, this.waveState = `break`, this.waveBreakCountdown = 3, this.draftGraceUntil = 0, this.evolutionDone = {}, this.gritBag = 0, this.bombCharges = 1, this.bombLastRegen = Date.now(), this.firedEvents = [], this.activeEvents = [], this.extractActive = false, this.bellReady = false, this.bellRung = false, this.bellHold = 0, this.bellLureUntil = 0, this.lastBreakTick = Date.now(), this.lanternLit = this.currentLocation.lantern ? !this.lanternWentOut : false, this.initHoles(), this.applyMutators(), this.rebuildFlow(true), soundEngine.init(), soundEngine.startAtmosphericMusic(), this.lanternWentOut && !this.currentLocation.lantern && this.callbacks.onRadio?.(`Unknown`, `The lantern went out at the springs. They're thicker on the Trace.`), this.holes.length && this.callbacks.onRadio?.(`WJPS`, `Board those cellars or run the Trace. They come up through the floor if you linger.`), this.loop(performance.now());
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
		if (e.code === `Space`) e.preventDefault();
		if (this.draft && (e.code === `Digit1` || e.code === `Digit2` || e.code === `Digit3`)) {
			const pick = this.draft[Number(e.code.slice(5)) - 1];
			if (pick) this.takeBoon(pick.id);
			return;
		}
		if (this.keys[e.code] = true, !this.isPaused) {
			if (e.code === `KeyR` && this.reloadCurrentWeapon(), e.code === `KeyE`) {
				let e = this.currentLocation.bell;
				e && this.bellReady && !this.bellRung && Math.hypot(this.player.x - e.x, this.player.y - e.y) < 80 || this.interactLoreNote();
			}
			e.code === `Digit1` && this.selectWeapon(0), e.code === `Digit2` && this.selectWeapon(1), e.code === `Digit3` && this.selectWeapon(2), e.code === `Digit4` && this.selectWeapon(3), e.code === `Digit5` && this.selectWeapon(4), e.code === `Digit6` && this.selectWeapon(5);
			if (e.code === `KeyQ`) this.throwMolotov();
			if (e.code === `KeyG`) this.throwFlare();
			if (e.code === `KeyC`) this.plantPost();
			if (e.code === `KeyX`) this.dropPipe();
			if (e.code === `KeyB`) this.detonateBomb();
			if (e.code === `Space`) this.tryDodge();
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
		this.bullets.push(e), soundEngine.playGunshot(`molotov`), this.alertZombies(this.player.x, this.player.y, 360);
	}
	throwFlare() {
		if (this.player.flares <= 0 || this.isPaused) return false;
		this.player.flares--;
		this.bullets.push({
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
		});
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
			this.particles.push({
				x, y,
				vx: Math.cos(a) * (1 + Math.random() * 2),
				vy: Math.sin(a) * (1 + Math.random() * 2) - 1.2,
				size: 2 + Math.random() * 2,
				color: Math.random() < .5 ? `#f6c453` : `#c23b22`,
				alpha: 1,
				life: .45,
				maxLife: .45,
				type: `spark`
			});
		}
	}
	updateOrbit(dt) {
		this.orbit = (this.orbit || 0) + dt * 2.6;
		const n = 2 + this.boon(`ring`);
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
		const chains = 2 + stacks;
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
	updateBeacon(dt) {
		if (!this.beacon || this.beacon.done || this.waveState !== `active`) return;
		const d = Math.hypot(this.player.x - this.beacon.x, this.player.y - this.beacon.y);
		if (d < 48) this.beacon.hold += dt;
		else this.beacon.hold = Math.max(0, this.beacon.hold - dt * .5);
		if (this.beacon.hold < 2) return;
		this.beacon.done = true;
		const w = this.weapons[this.currentWeaponIndex];
		w.reserveAmmo += w.id === `shotgun` ? 8 : 16;
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
		this.bullets.push({
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
		});
	}
	plantPost() {
		if (this.isPaused || !this.isRunning) return false;
		if (this.posts <= 0) {
			this.spawnFloater(this.player.x, this.player.y - 36, "NO POST", "#8a7a64");
			return false;
		}
		if (this.traps.filter((t) => t.kind === "post").length >= 2) {
			this.spawnFloater(this.player.x, this.player.y - 36, "TWO POSTS", "#8a7a64");
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
		this.traps.push({ kind: "post", x, y, angle: ang, shot: 0.25, left: 14, arm: 0, live: true, blown: false });
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
			t.shot = 0.58;
			t.left--;
			const a = t.angle;
			this.bullets.push({
				id: Math.random().toString(),
				x: t.x + Math.cos(a) * 22,
				y: t.y + Math.sin(a) * 22,
				vx: Math.cos(a) * 14,
				vy: Math.sin(a) * 14,
				damage: 46,
				pierce: 1,
				rangeRemaining: 360,
				weaponType: `lever_rifle`,
				radius: 3.2,
				color: `#fefce8`
			});
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
			this.hitstop = Math.max(this.hitstop, 0.045);
			this.alertZombies(bomb.x, bomb.y, 260);
			soundEngine.playGunshot(`shotgun`);
			this.spawnFloater(bomb.x, bomb.y - 26, "STOVEPIPE", "#e11d2e");
			for (let k = 0; k < 18; k++) {
				const a = Math.random() * Math.PI * 2;
				const sp = 1.6 + Math.random() * 4.2;
				this.particles.push({
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
				});
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
	skipWaveBreak() {
		if (this.waveState !== `break` || this.extractActive || this.bellReady || this.draft || this.levelHold) return;
		this.waveBreakCountdown = 0;
		this.startNextWave();
	}
	loop = (e) => {
		if (!this.isRunning) return;
		// Fire a pending queued draft once its grace period of live play has elapsed.
		if (!this.isPaused && !this.draft && this.queuedLevels > 0 && this.draftGraceUntil > 0 && Date.now() >= this.draftGraceUntil) {
			this.openQueuedDraft();
		}
		if (this.isPaused) return;
		let t = Math.min((e - this.lastTimestamp) / 1e3, .1);
		this.lastTimestamp = e, this.update(t), this.render(), this.animationFrameId = requestAnimationFrame(this.loop);
	};
	update(e) {
		let t = Date.now();
		if (this.simTime += e, this.hitstop > 0) {
			this.hitstop -= e, this.render();
			return;
		}
		this.trauma = Math.max(0, this.trauma - e * 1.6);
		for (let t = this.floaters.length - 1; t >= 0; t--) {
			let n = this.floaters[t];
			n.y += n.vy * e, n.life -= e, n.life <= 0 && this.floaters.splice(t, 1);
		}
		this.updatePowerups(e), this.updatePlayer(e), this.updateWeapons(t), this.updateBullets(e, t), this.updateAcidSpits(e), this.updateFirePuddles(t), this.updateFlares(e), this.updateRig(e), this.updateTraps(e), this.updateBeacon(e), this.updateOrbit(e), this.updateStorm(e), this.updateSalt(e), this.updateLightning(e), this.updateWaveManager(t), this.updateHordeEvents(e), this.updateBomb(), this.updateEvents(), this.updateZombies(e, t), this.updateDrops(e), this.updateParticles(e), t - this.lastKillTime > 4500 && this.comboMultiplier > 1 && (this.comboMultiplier = 1), this.screenShake > 0 && (this.screenShake = Math.max(0, this.screenShake - e * 25)), this.muzzleFlashTimer > 0 && (this.muzzleFlashTimer -= e * 10), this.updateLantern(), this.updateBellHold(e), this.updateNoisePulses(e);
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
		this.interactHint = this.draft || this.levelHold ? `` : rigHint || (o ? `Hold [E] — extract` : this.bellReady && !this.bellRung && d ? `Hold [E] — ring the bell` : c && !this.lanternLit ? `Press [E] — relight lantern` : l && !l.boarded ? this.scrap < 25 ? `Need 25 scrap to board` : `Press [E] — board hole (25 scrap)` : a ? `Press [E] to read note` : this.nearWorkbench ? `Press [E] — workbench` : ``), this.callbacks.onStatsUpdate({
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
		if (r > 0) {
			const fwd = t * aimX + n * aimY;
			const side = t * -aimY + n * aimX;
			if (fwd < -.18) gait *= .68;
			else if (Math.abs(side) > Math.abs(fwd) + .12) gait *= .84;
		}
		const c = this.player.speed * gait;
		const accel = this.player.isSneaking ? 9 : r > 0 ? 20 : 10;
		if (r > 0) {
			this.moveVX += (t * c - this.moveVX) * (1 - Math.exp(-accel * e));
			this.moveVY += (n * c - this.moveVY) * (1 - Math.exp(-accel * e));
		} else {
			this.moveVX += (0 - this.moveVX) * (1 - Math.exp(-12 * e));
			this.moveVY += (0 - this.moveVY) * (1 - Math.exp(-12 * e));
			if (Math.hypot(this.moveVX, this.moveVY) < .12) {
				this.moveVX = 0;
				this.moveVY = 0;
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
		for (let i = 0; i < 3; i++) this.particles.push({
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
		});
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
		this.recoilKick = Math.max(this.recoilKick, 8);
		this.screenShake = Math.max(this.screenShake, 4);
		this.hitstop = Math.max(this.hitstop, .045);
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
			z.health -= z.type === "behemoth" ? 12 : 24;
			z.hitFlash = .25;
			z.stunUntil = this.simTime + (z.type === "behemoth" ? .28 : .55);
			hits++;
			this.stats.damageDealt += 24;
			this.createBloodParticles(z.x, z.y, this.player.angle);
			if (z.health <= 0) this.spawnFloater(z.x, z.y - 16, "BASH", "#e11d2e");
		}
		if (hits === 0) this.spawnFloater(this.player.x + ax * 28, this.player.y + ay * 28, "WHIFF", "#8a7a64");
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
			let n = this.getPerkLevel(`quickdraw`) * .2 + this.boon(`trigger`) * .08;
			const hands = !this.isMouseDown && this.virtualJoystickAim.x === 0 && this.virtualJoystickAim.y === 0;
			let r = t.reloadTime * (1 - Math.min(.65, n)) * (hands ? .38 : 1);
			if (e - this.reloadStartTime >= r) {
				let e = t.magazineSize - t.currentMag, n = Math.min(e, t.reserveAmmo);
				t.currentMag += n, t.reserveAmmo -= n, this.isReloading = false, this.freshUntil = this.simTime + 1.45, this.spawnFloater(this.player.x, this.player.y - 40, "FRESH", "#fde68a");
			}
			return;
		}
		const hunting = !this.isMouseDown && !this.player.isSneaking && !!this.nearestTarget(this.aimReach());
		let n = this.hasPowerup(`infinite_ammo`), r = n ? 1.4 : 1, i = this.isMouseDown || this.virtualJoystickAim.x !== 0 || this.virtualJoystickAim.y !== 0 || hunting, a = 1e3 / (t.fireRate * (1 + this.getPerkLevel(`quickdraw`) * .18) * (1 + this.boon(`trigger`) * .1) * (1 + (this.comboMultiplier - 1) * .06) * r);
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
		this.recoilKick = Math.max(this.recoilKick, e.id === `shotgun` ? 12 : e.id === `lever_rifle` ? 9 : e.id === `chainsaw` ? 4 : e.id === `carbine` ? 3.5 : 7);
		if (e.id === `shotgun`) this.pumpAnim = 10;
		soundEngine.playGunshot(e.soundType);
		const hear = this.weaponHearRadius(e.id) * (this.player.isSneaking ? 0.28 : 1);
		if (hear > 0) this.alertZombies(this.player.x, this.player.y, hear);
		if (e.id === `shotgun`) this.screenShake = 10;
		else if (e.id === `lever_rifle`) this.screenShake = 6;
		else if (e.id === `revolver`) this.screenShake = 5.5;
		else if (e.id === `carbine`) this.screenShake = 1.6;
		else if (e.id === `chainsaw`) this.screenShake = 2;
		else this.screenShake = 2.5;
		if (e.id === `shotgun` || e.id === `revolver` || e.id === `lever_rifle`) this.hitstop = Math.max(this.hitstop, e.id === `shotgun` ? .04 : .02);
		const dmgMul = (1 + this.getPerkLevel(`hollowpoint`) * .2) * (1 + this.boon(`lead`) * .08) * (this.evolved === `lincoln` && e.id === `revolver` ? 1.35 : 1) * (this.simTime < this.freshUntil ? 1.45 : 1) * (this.simTime < this.bountyBoostUntil ? 1.18 : 1);
		const choke = this.getPerkLevel(`choke`);
		if (e.id === `chainsaw`) {
			this.hitstop = Math.max(this.hitstop, .03);
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
			for (let i = 0; i < 6; i++) this.particles.push({
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
			});
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
			this.bullets.push({
				id: Math.random().toString(),
				x: this.player.x + Math.cos(this.player.angle) * origin,
				y: this.player.y + Math.sin(this.player.angle) * origin,
				vx: Math.cos(ang) * spd,
				vy: Math.sin(ang) * spd,
				damage: e.damage * dmgMul,
				pierce: e.id === `revolver` && this.evolved === `lincoln` ? Math.max(e.pierce, 4) : e.pierce,
				rangeRemaining: e.id === `shotgun` ? shotRange * (.55 + Math.random() * .35) : shotRange,
				weaponType: e.id,
				isCrossbowBolt: e.id === `crossbow`,
				radius: e.id === `shotgun` ? 4.4 : e.id === `revolver` ? 4.2 : e.id === `carbine` ? 2.2 : e.id === `crossbow` ? 4 : 3.2,
				color: e.id === `shotgun` ? `#fdba74` : e.id === `revolver` ? `#fbbf24` : e.id === `lever_rifle` ? `#fefce8` : e.id === `carbine` ? `#fde047` : e.id === `crossbow` ? `#e2e8f0` : `#fef08a`
			});
		}
		if (e.currentMag === 0 && e.id !== `chainsaw` && !this.hasPowerup(`infinite_ammo`)) this.fanTheCylinder();
		if (e.id === `shotgun`) {
			const ax = Math.cos(this.player.angle), ay = Math.sin(this.player.angle);
			for (let i = 0; i < 14; i++) {
				const j = (Math.random() - .5) * .7;
				this.particles.push({
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
				});
			}
		}
		this.particles.push({
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
		});
		if (e.currentMag === 0) this.reloadCurrentWeapon();
	}
	updateBullets(e, t) {
		for (let t = this.bullets.length - 1; t >= 0; t--) {
			let n = this.bullets[t], r = e * 60;
			const ox = n.x, oy = n.y;
			n.x += n.vx * r;
			n.y += n.vy * r;
			n.rangeRemaining -= Math.hypot(n.vx, n.vy) * r;
			const mx = ox + (n.x - ox) * 0.5, my = oy + (n.y - oy) * 0.5;
			if (this.checkObstacleCollision(n.x, n.y, n.radius, false) || this.checkObstacleCollision(mx, my, n.radius, false)) {
				n.isFlare ? this.plantFlare(n.x, n.y) : this.createHitSparks(n.x, n.y, `#f59e0b`);
				this.bullets.splice(t, 1);
				continue;
			}
			let i = false;
			for (let e = this.explosiveBarrels.length - 1; e >= 0; e--) {
				let r = this.explosiveBarrels[e];
				if (Math.hypot(r.x - n.x, r.y - n.y) <= r.radius + n.radius) {
					if (n.isFlare) {
						this.plantFlare(n.x, n.y);
						this.bullets.splice(t, 1);
						i = true;
						break;
					}
					r.health -= n.damage, this.createHitSparks(n.x, n.y, `#ef4444`), soundEngine.playZombieHit(false), r.health <= 0 && this.detonateExplosiveBarrel(r, e), this.bullets.splice(t, 1), i = true;
					break;
				}
			}
			if (!i) {
				if (n.isMolotov && n.rangeRemaining <= 0) {
					this.detonateMolotov(n.x, n.y), this.bullets.splice(t, 1);
					continue;
				}
				if (n.isFlare && n.rangeRemaining <= 0) {
					this.plantFlare(n.x, n.y), this.bullets.splice(t, 1);
					continue;
				}
				if (n.rangeRemaining <= 0) {
					this.bullets.splice(t, 1);
					continue;
				}
				for (let e = this.zombies.length - 1; e >= 0; e--) {
					let r = this.zombies[e];
					if (!this.segmentHitsCircle(ox, oy, n.x, n.y, n.radius, r.x, r.y, r.radius)) continue;
					{
						if (n.isFlare) {
							this.plantFlare(n.x, n.y);
							this.bullets.splice(t, 1);
							break;
						}
						this.stats.shotsHit++;
						let e = this.checkHeadshot(n, r), i = n.damage;
						this.hasPowerup(`insta_kill`) ? i = 99999 : e ? r.hasHelmet ? (r.hasHelmet = false, this.createHitSparks(r.x, r.y, `#eab308`), soundEngine.playZombieHit(false), i *= .6) : (i *= 2.4, this.stats.headshots++, soundEngine.playZombieHit(true)) : soundEngine.playZombieHit(false), r.health -= i, this.stats.damageDealt += i;
						if (!n.isSplinter && r.health > 0 && r.health <= r.maxHealth * .2 && r.type !== `behemoth` && r.type !== `miner_brute`) r.health = 0;
						if (e) this.tickBounty(`head`);
						if (r.health <= 0 && !n.isSplinter) r.shatter = true;
						if (this.evolved === `lincoln` && n.weaponType === `revolver` && e) this.player.health = Math.min(this.player.maxHealth, this.player.health + 4);
						let a = Math.atan2(n.vy, n.vx), o = n.weaponType === `shotgun` ? 7 : 3;
						if (r.x += Math.cos(a) * o, r.y += Math.sin(a) * o, this.createBloodParticles(n.x, n.y, a), r.hitFlash = .08, this.spawnFloater(r.x, r.y - r.radius, e ? `HEAD` : `${Math.round(i)}`, e ? `#ff4d3a` : `#e11d2e`), i > 80 && (this.hitstop = Math.max(this.hitstop, .04)), n.pierce--, n.pierce <= 0) {
							this.bullets.splice(t, 1);
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
		}), this.screenShake = 5, this.trauma = Math.min(1, this.trauma + .25), soundEngine.playBottleShatter(), this.alertZombies(e, t, 380);
		for (let r of this.zombies) Math.hypot(r.x - e, r.y - t) <= n && (r.health -= 120, r.isBurning = 4e3);
	}
	detonateExplosiveBarrel(e, t) {
		this.explosiveBarrels.splice(t, 1), this.screenShake = 10, this.trauma = Math.min(1, this.trauma + .55), soundEngine.playBarrelExplosion(), this.alertZombies(e.x, e.y, 700), this.firePuddles.push({
			id: Math.random().toString(),
			x: e.x,
			y: e.y,
			radius: 105,
			duration: 5e3,
			createdTime: Date.now()
		});
		for (let t = 0; t < 35; t++) {
			let t = Math.random() * Math.PI * 2, n = 2 + Math.random() * 6;
			this.particles.push({
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
			});
		}
		for (let t = this.zombies.length - 1; t >= 0; t--) {
			let n = this.zombies[t], r = Math.hypot(n.x - e.x, n.y - e.y);
			if (r <= 140) {
				let i = 1 - r / 140, a = 350 * (.4 + i * .6);
				n.health -= a, n.isBurning = 4e3;
				let o = Math.atan2(n.y - e.y, n.x - e.x);
				n.x += 18 * i * Math.cos(o), n.y += 18 * i * Math.sin(o), this.stats.damageDealt += a, this.createBloodParticles(n.x, n.y, o), n.health <= 0 && this.killZombie(n, t);
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
		if (this.zombiesToSpawn === 0 && this.zombies.length === 0) {
			this.packBetweenWaves(); this.sweepGritToBag();
			if (this.waveState = `break`, this.waveBreakCountdown = 6, this.stats.wavesCompleted++, this.endlessMilestone(), this.scrap += 120 + this.wave * 25, soundEngine.playWaveHorn(), this.callbacks.onWaveComplete(this.wave), this.outbreakWaves > 0 && this.stats.wavesCompleted >= this.outbreakWaves) this.currentLocation.bell && !this.bellRung ? (this.bellReady = true, this.callbacks.onRadio?.(`WJPS Petersburg`, `The square is yours if you can ring it. Get to the tower before they take the steps.`)) : (this.extractActive = true, this.callbacks.onExtractReady?.());
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
			z.health -= BOMB_DMG;
			z.hitFlash = .3;
			this.stats.damageDealt += BOMB_DMG;
			this.createBloodParticles(z.x, z.y, Math.atan2(dy, dx));
		}
		this.screenShake = Math.max(this.screenShake, 12);
		this.hitstop = Math.max(this.hitstop, .12);
		for (let k = 0; k < 28; k++) {
			const a = (Math.PI * 2 * k) / 28;
			this.particles.push({ x: this.player.x, y: this.player.y, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, size: 5, life: .5, maxLife: .5, alpha: 1, color: `#fde68a` });
		}
		this.spawnFloater(this.player.x, this.player.y - 64, `BOMB`, "#f97316");
		soundEngine.playNuke();
		return true;
	}
	checkEvolutions() {
		for (const r of EVOLUTIONS) {
			if (this.evolutionDone[r.baseWeapon]) continue;
			const w = this.weapons.find((x) => x.id === r.baseWeapon && x.unlocked);
			if (!w || this.boon(r.requiredBoon) < r.requiredStacks) continue;
			this.evolutionDone[r.baseWeapon] = true;
			w.name = r.evolvedName;
			w.damage = Math.round(w.damage * 1.7);
			w.fireRate = +(w.fireRate * 1.35).toFixed(2);
			w.pierce = Math.max(w.pierce, 3);
			w.description = r.evolvedDescription;
			this.hitstop = Math.max(this.hitstop, .35);
			this.screenShake = Math.max(this.screenShake, 8);
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
			out.push(`${w.name} + ${r.requiredBoonName} (${have}/${r.requiredStacks}) → ${r.evolvedName}`);
		}
		return out;
	}
	startNextWave() {
		this.wave++, this.waveState = `active`;
		this.eventCd = this.wave === 1 ? 99 : 14 + Math.random() * 8;
		let e = this.wave === 1 ? Math.floor(18 * this.difficultyMultiplier) : Math.floor((16 + this.wave * 6 + Math.max(0, this.wave - 10) * 4) * this.difficultyMultiplier);
		if (this.wave > 1) e += 4;
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
			{ x: 60 + Math.random() * (w - 120), y: 60 },
			{ x: 60 + Math.random() * (w - 120), y: h - 60 },
			{ x: 60, y: 60 + Math.random() * (h - 120) },
			{ x: w - 60, y: 60 + Math.random() * (h - 120) }
		];
		edges.sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py));
		for (const e of edges) {
			if (Math.hypot(e.x - px, e.y - py) >= minDist && !this.checkObstacleCollision(e.x, e.y, 16)) return e;
		}
		return edges[edges.length - 1];
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
		let a = `shambler`, o = Math.random();
		if (this.wave === 1) a = o < .28 ? `sprinter` : `shambler`;
		else if (i) a = i.kind === `pit` && o < .45 ? `miner_brute` : `crawler`;
		else if (this.wave >= 5 && this.wave % 5 == 0 && this.zombiesToSpawn === 1) a = `behemoth`;
		else if (this.lanternWentOut && o < .18) a = `crawler`;
		else if (this.wave >= 4 && o < .2) a = `bloater_spitter`;
		else if (this.wave >= 4 && o < .3) a = `bomber`;
		else if (this.wave >= 5 && o < .4) a = `riot`;
		else if (this.wave >= 3 && o < .5) a = `miner_brute`;
		else if (this.wave >= 2 && o < .72) a = `sprinter`;
		this.pushZombie(a, n, r);
	}
	pushZombie(e, t, n) {
		let r = 58, i = 2.15, a = 14, o = 17, s = `#475569`, c = false, l = 100, u = 15;
		e === `crawler` ? (r = 32, i = 2.4, a = 8, o = 12, s = `#3f2e22`, l = 80, u = 8) : e === `sprinter` ? (r = 45, i = 3.45, a = 12, o = 15, s = `#991b1b`, l = 140, u = 20) : e === `miner_brute` ? (r = 220, i = 1.2, a = 25, o = 23, s = `#1e293b`, c = true, l = 250, u = 40) : e === `bloater_spitter` ? (r = 130, i = 1.05, a = 18, o = 21, s = `#65a30d`, l = 220, u = 35) : e === `bomber` ? (r = 45, i = 2.7, a = 12, o = 15, s = `#b45309`, l = 120, u = 18) : e === `riot` ? (r = 520, i = 0.85, a = 30, o = 24, s = `#3f3f46`, c = true, l = 300, u = 60) : e === `behemoth` && (r = 1400 + this.wave * 250, i = 1.55, a = 45, o = 38, s = `#581c87`, l = 1500, u = 250);
		const em = this.eventMods();
		let d = {
			id: Math.random().toString(),
			type: e,
			x: t,
			y: n,
			vx: 0,
			vy: 0,
			angle: 0,
			speed: i * (.9 + Math.random() * .2) * em.enemySpeedMult,
			maxHealth: Math.round(r * em.enemyHpMult),
			health: Math.round(r * em.enemyHpMult),
			damage: a,
			attackCooldown: 900,
			lastAttackTime: 0,
			radius: o,
			color: s,
			hasHelmet: c,
			animationFrame: 0,
			scoreValue: l,
			scrapValue: u,
			spitCooldown: 2500,
			ai: e === `crawler` ? `chase` : `wander`,
			hearX: t,
			hearY: n,
			wanderAngle: Math.random() * Math.PI * 2,
			hitFlash: 0
		};
		if (this.wave >= 2 && e !== `behemoth` && Math.random() < 0.12) {
			d.elite = true;
			d.maxHealth = Math.round(d.maxHealth * 2.2);
			d.health = d.maxHealth;
			d.speed = d.speed * 1.15;
			d.scoreValue = d.scoreValue * 3;
			d.scrapValue = Math.round(d.scrapValue * 2);
		}
		this.zombies.push(d), soundEngine.playZombieGroan(e === `crawler` ? `shambler` : e === `bomber` ? `bloater_spitter` : e === `riot` ? `miner_brute` : e);
	}
	updateZombies(e, t) {
		for (let n = this.zombies.length - 1; n >= 0; n--) {
			let r = this.zombies[n];
			if (r.isBurning && r.isBurning > 0 && (r.isBurning -= e * 1e3, r.health -= e * 35, Math.random() < .3 && this.particles.push({
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
			})), r.health <= 0) {
				this.killZombie(r, n);
				continue;
			}
			let i = this.player.x - r.x, a = this.player.y - r.y, o = Math.hypot(i, a);
			r.hitFlash > 0 && (r.hitFlash -= e);
			let s = Math.hypot(r.hearX - r.x, r.hearY - r.y), c = this.simTime < this.bellLureUntil && this.currentLocation.bell;
			const lantern = this.currentLocation.lantern;
			if (this.lanternLit && lantern && r.type === `shambler` && r.ai === `wander`) r.wanderAngle = Math.atan2(lantern.y - r.y, lantern.x - r.x) + (Math.random() - .5) * .7;
			if (c && this.currentLocation.bell) {
				r.hearX = this.currentLocation.bell.x;
				r.hearY = this.currentLocation.bell.y;
				r.ai = o <= r.radius + this.player.radius + 2 ? `attack` : `investigate`;
			} else if (this.zombieSees(r, o)) {
				r.hearX = this.player.x;
				r.hearY = this.player.y;
				r.ai = o <= r.radius + this.player.radius + 2 ? `attack` : `chase`;
			} else if (r.ai === `chase` || r.ai === `attack`) r.ai = `investigate`;
			else if (r.ai === `wander` && s > 40 && (r.hearX !== r.x || r.hearY !== r.y)) r.ai = `investigate`;
			r.ai === `wander` ? (r.wanderAngle += (Math.random() - .5) * .8 * e, r.angle = r.wanderAngle) : r.ai === `investigate` ? (r.angle = Math.atan2(r.hearY - r.y, r.hearX - r.x), s < 28 && (r.ai = `wander`)) : r.angle = Math.atan2(a, i), r.type === `bloater_spitter` && (r.spitCooldown ||= 2500, r.spitCooldown -= e * 1e3, r.spitCooldown <= 0 && o < 450) && (r.spitCooldown = 3200, this.acidSpits.push({
				id: Math.random().toString(),
				x: r.x,
				y: r.y,
				vx: Math.cos(r.angle) * 7,
				vy: Math.sin(r.angle) * 7,
				radius: 7,
				damage: 22,
				remainingDistance: 450
			}), soundEngine.playZombieHit(false));
			let flare = null, flareDist = 1e9;
			for (const fl of this.flares) {
				const fd = Math.hypot(fl.x - r.x, fl.y - r.y);
				if (fd < flareDist) { flareDist = fd; flare = fl; }
			}
			const melee = o <= r.radius + this.player.radius + 10;
			if (flare && !melee && flareDist < 640 && (this.player.isSneaking || flareDist + 36 < o)) {
				r.hearX = flare.x;
				r.hearY = flare.y;
				r.ai = flareDist < 48 ? `wander` : `investigate`;
				r.angle = Math.atan2(flare.y - r.y, flare.x - r.x);
			}
			let u = r.speed;
			r.type === `behemoth` && r.health < r.maxHealth * .4 && (u *= 1.4), r.ai === `wander` && (u *= .35), r.ai === `investigate` && (u *= .7);
			if ((r.ai === `chase` || r.ai === `attack`) && o < r.radius + this.player.radius + 26) u *= .42;
			if (r.stunUntil && this.simTime < r.stunUntil) u = 0;
			else if (this.worldSlow > 0) u *= .4;
			let d = e * 60, f, p;
			if ((r.ai === `chase` || r.ai === `attack`) && u > 0) {
				const flow = this.flow.dir(r.x, r.y);
				let dx = flow ? flow.x : Math.cos(r.angle);
				let dy = flow ? flow.y : Math.sin(r.angle);
				let sx = 0, sy = 0, sn = 0;
				const reach = r.radius + 28;
				const reach2 = reach * reach;
				for (let k = 0; k < this.zombies.length && sn < 5; k++) {
					if (k === n) continue;
					const oth = this.zombies[k];
					const ix = r.x - oth.x, iy = r.y - oth.y;
					const d2 = ix * ix + iy * iy;
					if (d2 >= reach2 || d2 < 1) continue;
					const d = Math.sqrt(d2);
					sx += ix / d;
					sy += iy / d;
					sn++;
				}
				if (sn) {
					const sl = Math.hypot(sx, sy) || 1;
					dx = dx * 0.58 + (sx / sl) * 0.42;
					dy = dy * 0.58 + (sy / sl) * 0.42;
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
			if (hitX) {
				this.smashBarricadeAt(m, r.y, r.damage * .08);
				this.smashHoleAt(m, r.y, r.damage * .12);
			} else r.x = m;
			if (hitY) {
				this.smashBarricadeAt(r.x, h, r.damage * .08);
				this.smashHoleAt(r.x, h, r.damage * .12);
			} else r.y = h;
			if (u > 0 && (r.ai === `chase` || r.ai === `investigate` || r.ai === `attack`)) {
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
			o <= r.radius + this.player.radius && t - r.lastAttackTime >= r.attackCooldown && (r.lastAttackTime = t, this.invuln <= 0 && (this.lastKiller = r.type, this.damagePlayer(r.damage)));
		}
	}
	boneBurst(z) {
		const extra = this.boon(`bone`);
		const count = (z.type === `behemoth` ? 6 : 3) + extra;
		const dmg = (z.type === `behemoth` ? 48 : z.type === `miner_brute` || z.type === `bloater_spitter` ? 55 : 70) + extra * 10;
		const near = this.zombies
			.map((o) => ({ o, d: Math.hypot(o.x - z.x, o.y - z.y) }))
			.filter((n) => n.d < 200 && n.d > 0)
			.sort((a, b) => a.d - b.d)
			.slice(0, count);
		const fire = (a) => this.bullets.push({
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
		});
		if (!near.length) {
			for (let i = 0; i < count; i++) fire((Math.PI * 2 * i) / count);
			return;
		}
		for (const n of near) fire(Math.atan2(n.o.y - z.y, n.o.x - z.x));
	}
	fanTheCylinder() {
		for (let i = 0; i < 8; i++) {
			const a = (Math.PI * 2 * i) / 8;
			this.bullets.push({
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
			});
		}
		this.screenShake = Math.max(this.screenShake, 4);
	}
	killZombie(e, t) {
		const comboBefore = Math.floor(this.comboMultiplier);
		this.zombies.splice(t, 1), this.stats.kills++, this.lastKillTime = Date.now(), this.comboMultiplier = Math.min(5, this.comboMultiplier + .25);
		const comboAfter = Math.floor(this.comboMultiplier);
		if (comboAfter > comboBefore && comboAfter >= 2) {
			this.spawnFloater(this.player.x, this.player.y - 56, `STREAK x${comboAfter}`, "#ffd700");
			// Balance: halved streak payout (2 orbs, was 4) — early XP economy ran too hot
			for (let i = 0; i < 2; i++) {
				const a = Math.random() * Math.PI * 2;
				this.grit.push({ x: this.player.x, y: this.player.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, value: comboAfter });
			}
			soundEngine.playPowerup();
		}
		this.spawnGrit(e);
		if (e.type === `bomber`) {
			const R = 110;
			this.screenShake = Math.max(this.screenShake, 7);
			for (const z of this.zombies) {
				if (Math.hypot(z.x - e.x, z.y - e.y) < R) { z.health -= 90; z.hitFlash = 0.08; }
			}
			for (let k = 0; k < 14; k++) this.particles.push({ x: e.x, y: e.y, vx: (Math.random() - .5) * 6, vy: (Math.random() - .5) * 6, size: 4, life: .5, maxLife: .5, alpha: 1 });
			if (Math.hypot(this.player.x - e.x, this.player.y - e.y) < R * .7) this.player.health -= 18;
			soundEngine.playBarrelExplosion();
		}
		if (e.elite && this.chestsThisMap < 3) {
			this.chestsThisMap++;
			this.chests.push({ x: e.x, y: e.y });
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
			this.trauma = Math.min(1, this.trauma + .45);
			this.hitstop = Math.max(this.hitstop, .08);
			this.spawnFloater(this.player.x, this.player.y - 40, "BLOOD RUSH", "#e11d2e");
			this.callbacks.onRadio?.("Unknown", "Don't you stop.");
			soundEngine.playPowerup();
		}
		let n = this.hasPowerup(`double_points`) ? 2 : 1, r = Math.round(e.scoreValue * this.comboMultiplier * n);
		this.score += r;
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
			t < .35 && this.player.health < this.player.maxHealth ? (n = `moonshine_med`, r = 35) : t < .55 ? (n = `molotov_pickup`, r = 1) : t < .75 && (n = `scrap`, r = 25), this.drops.push({
				id: Math.random().toString(),
				type: n,
				x: e.x,
				y: e.y,
				amount: r,
				duration: 25e3
			});
		}
	}
	damagePlayer(e) {
		if (this.invuln > 0) return;
		this.invuln = .62;
		let t = e * (1 - this.getPerkLevel(`grit`) * .08);
		this.player.health -= t, this.stats.damageTaken += t, this.screenShake = 5, this.trauma = Math.min(1, this.trauma + .22), soundEngine.playPlayerHurt();
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
			this.handleGameOver();
		}
	}
	handleGameOver() {
		this.isRunning = false, this.stats.survivalTime = Math.floor((Date.now() - this.gameStartTime) / 1e3), this.callbacks.onGameOver(this.stats, this.score, this.lastKiller);
	}
	updateDrops(dt = 1 / 60) {
		const magnet = Math.max(280, this.viewSize().w * 0.28) + this.getPerkLevel(`scavenger`) * 36;
		for (let e = this.drops.length - 1; e >= 0; e--) {
			let t = this.drops[e];
			const dx = this.player.x - t.x, dy = this.player.y - t.y;
			const dist = Math.hypot(dx, dy);
			const loot = t.type === `ammo_universal` || t.type === `moonshine_med` || t.type === `molotov_pickup` || t.type === `scrap`;
			if (loot && dist < magnet && dist > this.player.radius + 18) {
				const pull = (1 - dist / magnet) * 340 * dt;
				t.x += (dx / dist) * pull;
				t.y += (dy / dist) * pull;
			}
			if (Math.hypot(this.player.x - t.x, this.player.y - t.y) <= this.player.radius + 22) {
				if (soundEngine.playPickup(), t.type === `ammo_universal`) for (let e of this.weapons) e.unlocked && (e.reserveAmmo = Math.min(e.maxReserveAmmo, e.reserveAmmo + Math.floor(e.magazineSize * 1.5)));
				else t.type === `moonshine_med` ? (this.player.health = Math.min(this.player.maxHealth, this.player.health + t.amount), this.player.stamina = this.player.maxStamina) : t.type === `molotov_pickup` ? this.player.molotovs = Math.min(this.player.maxMolotovs, this.player.molotovs + 1) : t.type === `scrap` ? (this.scrap += t.amount, this.stats.scrapCollected += t.amount) : (t.type === `nuke` || t.type === `insta_kill` || t.type === `double_points` || t.type === `infinite_ammo` || t.type === `speed_boost`) && this.activatePowerup(t.type);
				this.drops.splice(e, 1);
			}
		}
	}
	updateParticles(e) {
		for (let t = this.particles.length - 1; t >= 0; t--) {
			let n = this.particles[t];
			n.x += n.vx * e * 60, n.y += n.vy * e * 60, n.life -= e, n.alpha = Math.max(0, n.life / n.maxLife), n.life <= 0 && this.particles.splice(t, 1);
		}
		if (this.particles.length > 180) this.particles.splice(0, this.particles.length - 180);
	}
	createBloodParticles(e, t, n) {
		for (let r = 0; r < 7; r++) {
			let r = n + (Math.random() - .5) * 1.2, i = 2 + Math.random() * 4;
			this.particles.push({
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
			});
		}
	}
	createHitSparks(e, t, n) {
		for (let r = 0; r < 6; r++) {
			let r = Math.random() * Math.PI * 2, i = 1.5 + Math.random() * 3.5;
			this.particles.push({
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
			});
		}
	}
	zombieSees(z, dist) {
		const touch = z.radius + this.player.radius + 34;
		if (dist <= touch) return true;
		const sight = z.type === `sprinter` ? 300 : z.type === `behemoth` ? 380 : z.type === `crawler` ? 150 : z.type === `bloater_spitter` ? 260 : 230;
		const range = this.player.isSneaking ? sight * 0.62 : sight;
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
			this.scrap -= 25, e.boarded = true, e.boardHealth = e.maxBoardHealth, this.score += 40, this.spawnFloater(e.x, e.y - 18, `BOARDED`, `#d4a017`), soundEngine.playBoard();
			for (let t = 0; t < 8; t++) {
				let t = Math.random() * Math.PI * 2;
				this.particles.push({
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
				});
			}
			this.holes.length > 0 && this.holes.every((e) => e.boarded) && this.callbacks.onRadio?.(`Unknown`, `The holes went quiet. Keep the lantern. They'll try the boards.`);
		}
	}
	relightLantern() {
		this.lanternLit = true, soundEngine.playLantern(), this.spawnFloater(this.currentLocation.lantern.x, this.currentLocation.lantern.y - 24, `LIT`, `#d4a017`), this.callbacks.onRadio?.(`Unknown`, `East window's burning again. Hold it.`);
	}
	snuffLantern() {
		this.lanternLit && (this.lanternLit = false, this.lanternWentOut = true, this.trauma = Math.min(1, this.trauma + .35), soundEngine.playSnuff(), this.spawnFloater(this.currentLocation.lantern.x, this.currentLocation.lantern.y - 24, `LANTERN OUT`, `#c23b22`), this.callbacks.onRadio?.(`Unknown`, `The lantern's gone. Cellar holes are coughing. They know the Trace.`));
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
			this.bellRung = true, this.bellReady = false, this.bellHold = 2.2, this.bellLureUntil = this.simTime + 10, this.extractActive = true, this.trauma = Math.min(1, this.trauma + .7), this.screenShake = 12, soundEngine.playBell(), this.alertZombies(e.x, e.y, 2e3);
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
			case `chainsaw`: return 300;
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
			for (let r of this.zombies) Math.hypot(r.x - e, r.y - t) <= n && (r.hearX = e, r.hearY = t, r.ai === `wander` && (r.ai = `investigate`));
		}
	}
	spawnFloater(e, t, n, r) {
		this.floaters.push({
			x: e,
			y: t,
			text: n,
			color: r,
			life: .7,
			maxLife: .7,
			vy: -28
		}), this.floaters.length > 40 && this.floaters.shift();
	}
	boon(id: string) {
		return this.boonStacks[id] || 0;
	}
	offerDraft() {
		this.draft = rollBoons(this.boonStacks, this.player.molotovs, this.player.maxMolotovs, this.posts, this.pipes);
		this.callbacks.onDraft?.(this.draft);
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
		this.draft = rollBoons(this.boonStacks, this.player.molotovs, this.player.maxMolotovs, this.posts, this.pipes);
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
		if (type === `riot`) return 4 * m * em;
		if (type === `miner_brute` || type === `bloater_spitter`) return 3 * m * em;
		if (type === `sprinter` || type === `bomber`) return 2 * m * em;
		return 1 * m * em;
	}
	dropGritOrb(x, y, vx, vy, value, lucky = false) {
		if (this.grit.length >= GRIT_GROUND_CAP) {
			this.grit[(Math.random() * this.grit.length) | 0].value += value;  // merge, don't spawn
			return;
		}
		this.grit.push({ x, y, vx, vy, value, lucky });
	}
	spawnGrit(z) {
		let value = this.gritValue(z.type);
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
		this.xp += n * this.eventMods().xpMult;
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
		const magnet = Math.max(420, span * 0.46) + this.getPerkLevel(`scavenger`) * 40 + this.gritBonus * 36;
		for (let i = this.grit.length - 1; i >= 0; i--) {
			const g = this.grit[i];
			const dx = this.player.x - g.x;
			const dy = this.player.y - g.y;
			const d = Math.hypot(dx, dy) || 1;
			if (d < this.player.radius + 18) {
				this.addXp(g.value);
				soundEngine.playGrit();
				this.grit.splice(i, 1);
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
	}
	openChest() {
		if (this.boon(`lead`) >= 1 && this.evolved !== `lincoln`) {
			this.evolved = `lincoln`;
			this.spawnFloater(this.player.x, this.player.y - 36, "LINCOLN'S LOAD", "#f6c453");
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
			if (g.lucky) {
				e.fillStyle = "rgba(255, 215, 0, 0.25)";
				e.beginPath();
				e.arc(g.x, g.y, rad * 2.4, 0, Math.PI * 2);
				e.fill();
			}
			e.fillStyle = g.lucky ? "#ffd700" : "#f6c453";
			e.beginPath();
			e.arc(g.x, g.y, g.lucky ? rad * 1.6 : rad, 0, Math.PI * 2);
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
		const zoom = this.viewZoom();
		const viewW = t / zoom, viewH = n / zoom;
		const mapW = this.currentLocation.mapWidth, mapH = this.currentLocation.mapHeight;
		let targetX = this.player.x, targetY = this.player.y;
		if (viewW >= mapW) targetX = mapW / 2;
		else targetX = Math.max(viewW / 2, Math.min(mapW - viewW / 2, this.player.x));
		if (viewH >= mapH) targetY = mapH / 2;
		else targetY = Math.max(viewH / 2, Math.min(mapH - viewH / 2, this.player.y));
		const follow = 1 - Math.exp(-10 * (this.lastDt || 1 / 60));
		this.camX += (targetX - this.camX) * follow;
		this.camY += (targetY - this.camY) * follow;
		if (Math.abs(this.camX - targetX) < .35) this.camX = targetX;
		if (Math.abs(this.camY - targetY) < .35) this.camY = targetY;
		e.save(), e.clearRect(0, 0, t, n);
		e.fillStyle = `#070806`;
		e.fillRect(0, 0, t, n);
		let shake = this.trauma * this.trauma * 10 + this.screenShake * .55, sx = (Math.random() - .5) * shake, sy = (Math.random() - .5) * shake;
		e.translate(sx, sy);
		const beginWorld = () => {
			e.save();
			e.translate(t / 2, n / 2);
			e.scale(zoom, zoom);
			e.translate(-this.camX, -this.camY);
		};
		let l = this.camX - viewW / 2, u = this.camY - viewH / 2;
		let d = { x: l, y: u, width: viewW, height: viewH };
		beginWorld();
		renderEnvironment(e, this.currentLocation, d, this.bloodDecals, this.firePuddles, this.drops, this.explosiveBarrels, this.loreNotes, this.barricades, this.extractActive, zoom);
		this.renderHoles(e), this.renderLantern(e), this.renderBell(e), this.renderParticles(e);
		this.paintFloaters(e, zoom);
		e.restore();
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
		this.lighting.renderLighting(e, t, n, f, this.muzzleFlashTimer, this.currentLocation.ambientLight, p, m);
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
		this.renderZombies(e), this.renderProjectiles(e), this.renderGrit(e), this.renderTraps(e), this.renderPlayer(e), this.renderLightning(e), this.renderSalt(e), this.renderRig(e), this.renderNoisePulses(e), this.renderFlares(e), this.renderHoleMarkers(e), this.renderLantern(e), this.renderBell(e), this.renderZombieLabels(e);
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
		this.renderEyeshine(e, l, u);
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
	}
	renderPlayer(e) {
		const facing = this.bodyFacingSmooth >= 0 ? 1 : -1;
		const moving = this.lastMoveSpeed > .35;
		const phase = this.walkPhase;
		const fs = this.figureScale();
		const body = this.player.radius * 5.6 * fs;
		const bob = moving ? Math.abs(Math.sin(phase)) * 3.4 * fs : Math.sin(this.simTime * 2.05) * 1.05 * fs;
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
		e.fillStyle = "rgba(0, 0, 0, 0.45)";
		e.beginPath();
		e.ellipse(stride * .25, 16, 14 + this.lastMoveSpeed * .3, 5, 0, 0, Math.PI * 2);
		e.fill();
		e.save();
		e.translate(stride * .35, -bob);
		e.rotate(lean);
		e.scale(facing, 1);
		drawSprite(e, "player", body, 0, false);
		e.restore();
		e.save();
		e.translate(facing * 10, -bob * .2 + 6);
		e.rotate(this.player.angle);
		e.scale(1.7 * fs, 1.7 * fs);
		this.drawHeldWeapon(e);
		e.restore();
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
		for (const t of this.zombies) {
			if (t.x < camL || t.x > camR || t.y < camT || t.y > camB) continue;
			const facingLeft = Math.cos(t.angle) < 0;
			const limp = Math.abs(Math.sin(this.simTime * (t.type === "sprinter" ? 10 : 6) + t.x * .08)) * (t.type === "crawler" ? 1.6 : 3.2);
			e.save();
			e.translate(t.x, t.y);
			e.fillStyle = "rgba(0, 0, 0, 0.5)";
			e.beginPath();
			e.ellipse(2, t.radius * .72, t.radius * 1.05, t.radius * .38, 0, 0, Math.PI * 2);
			e.fill();
			if (t.elite) {
				e.strokeStyle = "#ffd700";
				e.lineWidth = 3;
				e.beginPath();
				e.ellipse(2, t.radius * .72, t.radius * 1.35, t.radius * .55, 0, 0, Math.PI * 2);
				e.stroke();
			}
			e.save();
			e.translate(0, -limp);
			e.scale(facingLeft ? -1 : 1, 1);
			const tall = t.radius * (t.type === "crawler" ? 4.2 : t.type === "behemoth" ? 4.6 : 5.1) * fs;
			drawSprite(e, t.type, tall, t.hitFlash, false);
			if (t.isBurning && t.isBurning > 0) {
				e.fillStyle = "rgba(249, 115, 22, 0.35)";
				e.beginPath();
				e.arc(0, 0, t.radius * 1.25, 0, Math.PI * 2);
				e.fill();
			}
			e.restore();
			if (t.health < t.maxHealth || t.type === "miner_brute" || t.type === "behemoth") {
				const n = t.radius * 2.4;
				const r = Math.max(0, t.health / t.maxHealth);
				e.fillStyle = "rgba(0, 0, 0, 0.75)";
				e.fillRect(-n / 2, -t.radius - 8 - limp, n, barH);
				e.fillStyle = "#e11d2e";
				e.fillRect(-n / 2, -t.radius - 8 - limp, n * r, barH);
			}
			e.restore();
		}
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
			} else {
				const n = Math.atan2(t.vy, t.vx);
				e.rotate(n);
				e.fillStyle = t.color;
				e.fillRect(-8, -t.radius / 2, 16, t.radius);
				e.globalAlpha = .4;
				e.fillRect(-14, -1, 10, 2);
			}
			e.restore();
		}
		for (let t of this.acidSpits) e.fillStyle = `#84cc16`, e.beginPath(), e.arc(t.x, t.y, t.radius, 0, Math.PI * 2), e.fill();
	}
	renderParticles(e) {
		const { camL, camT, camR, camB } = this.viewCull(40);
		for (const t of this.particles) {
			if (t.x < camL || t.x > camR || t.y < camT || t.y > camB) continue;
			e.globalAlpha = t.alpha;
			e.fillStyle = t.color;
			e.beginPath();
			e.arc(t.x, t.y, t.size, 0, Math.PI * 2);
			e.fill();
		}
		e.globalAlpha = 1;
	}
}
