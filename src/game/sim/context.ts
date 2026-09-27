// Batch 14 (modularization): SimContext + SimEvent bus + GameObject contract.
//
// The engine is one big state bag (~350 fields on GameEngine). The refactor
// keeps ALL state on GameEngine (probes read 100+ raw fields; moving them
// would be the riskiest cut for zero benefit) and gives each subsystem a
// module class holding an `eng: SimContext` reference. Modules import this
// file — never engine.ts — which breaks the import cycle. GameEngine
// satisfies SimContext structurally (no `implements` needed).
//
// Typing note: state fields are intentionally `any` here. This is a
// mechanical refactor batch (no behavior change); a strict-typing pass over
// the sim is a separate follow-up. Cross-module method calls that are not
// yet declared on the interface use `(eng as any).method()` with a
// `CONTEXT-GAP` comment; the coordinator resolves them after extraction.

/** Camera view passed to GameObject.draw(). */
export interface SimCamera {
	x: number;
	y: number;
	zoom: number;
	width: number;
	height: number;
}

/** The GameObject contract (backlog item): every sim entity implements
 *  update(dt) for simulation and draw(camera) for rendering. The contract
 *  is introduced here so the renderer can later treat entities uniformly;
 *  adoption per entity type is a follow-up batch. */
export interface GameObject {
	update(dt: number): void;
	draw(camera: SimCamera): void;
}

/** Typed sim events. The sim emits these; the renderer drains the queue
 *  (juice-in-renderer architecture — wired in a follow-up batch). */
export type SimEventType =
	| `zombie_died`
	| `player_hit`
	| `weapon_fired`
	| `explosion`
	| `pickup_spawned`
	| `pickup_taken`
	| `wave_started`
	| `wave_ended`
	| `boss_spawned`
	| `boss_died`
	| `event_fired`
	| `telegraph`
	| `custom`;

export interface SimEvent {
	type: SimEventType;
	at: number;
	data?: Record<string, unknown>;
}

export type SimEventHandler = (ev: SimEvent) => void;

/** Minimal typed event bus. The engine owns one; modules emit, the view
 *  layer (and later the renderer) subscribes. */
export class SimEventBus {
	private handlers = new Map<string, Set<SimEventHandler>>();
	on(type: SimEventType | string, h: SimEventHandler): () => void {
		let s = this.handlers.get(type);
		if (!s) { s = new Set(); this.handlers.set(type, s); }
		s.add(h);
		return () => { s.delete(h); };
	}
	emit(ev: SimEvent): void {
		const s = this.handlers.get(ev.type);
		if (s) for (const h of [...s]) { try { h(ev); } catch { /* subscriber error must not break the sim */ } }
	}
	clear(): void { this.handlers.clear(); }
}

/**
 * Structural interface for the engine as seen by sim modules.
 * GameEngine satisfies this implicitly. State fields are `any` by design
 * (see typing note above); lanes add precise types only where they help.
 */
export interface SimContext {
	// --- event bus (engine-owned) ---
	events: SimEventBus;
	emitEvent(type: SimEventType, data?: Record<string, unknown>): void;

	// --- core sim state (all engine-owned) ---
	player: any;
	zombies: any[];
	bullets: any[];
	particles: any[];
	grit: any[];
	drops: any[];
	floaters: any[];
	telegraphs: any[];
	lights: any[];
	holes: any[];
	explosiveBarrels: any[];
	barricades: any[];
	loreNotes: any[];
	caches: any[];
	jars: any[];
	shrines: any[];
	obstacles: any[];
	weapons: any[];
	activePowerups: any[];
	shockwaves: any[];
	bloodSplats: any[];
	scorchDecals: any[];
	corpseDecals: any[];
	dmgFloaters: any[];

	// --- run/wave state ---
	wave: number;
	waveState: string;
	simTime: number;
	gameStartTime: number;
	isRunning: boolean;
	isPaused: boolean;
	difficultyMultiplier: number;
	gritBag: number;
	scrap: number;
	score: number;
	stats: any;
	callbacks: any;
	currentLocation: any;
	pristineLocation: any;
	rng: () => number;

	// --- subsystems (wired by the engine constructor) ---
	playerSim?: PlayerSimLike;
	combat?: CombatSimLike;
	powers?: PowersSimLike;
	zombieSim?: ZombieSimLike;
	bossSim?: BossSimLike;
	waveSim?: WaveSimLike;
	pickupSim?: PickupSimLike;
	mapSim?: MapSimLike;
	juice?: JuiceSimLike;

	// --- cross-module helpers (declared as used; gaps use `as any`) ---
	[key: string]: any;
}

// Minimal structural types so modules can reference sibling subsystems
// without importing them (avoids cycles). Lanes extend these as needed.
export interface PlayerSimLike { updatePlayer?(dt: number): void; [k: string]: any }
export interface CombatSimLike { [k: string]: any }
export interface PowersSimLike { [k: string]: any }
export interface ZombieSimLike { [k: string]: any }
export interface BossSimLike { [k: string]: any }
export interface WaveSimLike { [k: string]: any }
export interface PickupSimLike { [k: string]: any }
export interface MapSimLike { [k: string]: any }
export interface JuiceSimLike { [k: string]: any }
