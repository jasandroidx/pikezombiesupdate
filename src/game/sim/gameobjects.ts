// Batch 16 (Lane 3): GameObject contract adoption — per-kind operation registry.
//
// The GameObject interface (src/game/sim/context.ts) declares the contract:
// update(dt) for simulation, draw(camera) for rendering. This registry maps a
// string entity kind -> { update, draw } ops so dispatch sites stay uniform
// while adoption proceeds one entity type at a time. `pickup` is the first
// real adoption (src/game/sim/pickups.ts registers it at PickupSim
// construction); the remaining kinds below are documented throwing stubs whose
// real loops still live in their owning modules — a future lane converts each
// stub deliberately instead of inheriting a silent no-op.

import type { SimCamera } from "./context";

/** The camera passed to GameObject draw ops: the SimCamera view plus the
 *  world-space 2D context the renderer supplies at dispatch time. */
export interface DrawCamera extends SimCamera {
	/** Canvas 2D context, already in world coordinates. */
	ctx: any;
}

/** Per-kind operations for the GameObject contract. */
export interface GameObjectOps {
	/** Per-object sim step. May return true when the caller should drop the
	 *  object from its list (e.g. a collected pickup). */
	update?: (obj: any, dt: number) => boolean | void;
	/** Per-object render. */
	draw?: (obj: any, camera: DrawCamera) => void;
}

export class GameObjectRegistry {
	private ops = new Map<string, GameObjectOps>();

	register(kind: string, ops: GameObjectOps): void {
		this.ops.set(kind, ops);
	}

	/** True once any entry (real or adoption stub) is registered for `kind`. */
	isRegistered(kind: string): boolean {
		return this.ops.has(kind);
	}

	/** Dispatch one sim step for every object in `list`. */
	updateKind(kind: string, list: any[], dt: number): void {
		const o = this.ops.get(kind);
		if (!o?.update) return;
		for (const obj of list) o.update(obj, dt);
	}

	/** Dispatch one sim step for a single object; returns true when the op
	 *  reports the object as consumed (caller removes it from its list). */
	updateOne(kind: string, obj: any, dt: number): boolean {
		const o = this.ops.get(kind);
		if (!o?.update) return false;
		return o.update(obj, dt) === true;
	}

	/** Dispatch one render for every object in `list`. */
	drawKind(kind: string, list: any[], camera: DrawCamera): void {
		const o = this.ops.get(kind);
		if (!o?.draw) return;
		for (const obj of list) o.draw(obj, camera);
	}
}

/** Process-wide registry. Sim modules register their kinds at construction;
 *  engine update/render passes dispatch through it. */
export const gameObjectRegistry = new GameObjectRegistry();

// --- Adoption path for the remaining entity kinds -------------------------------
// Each entry documents where the real loop lives today and throws loudly when
// dispatched, so the lane that adopts it does so on purpose. The owning module
// and the current engine render pass are named in the error.

function adoptionStub(kind: string, ownerModule: string, currentLoop: string): GameObjectOps {
	const msg = `GameObject '${kind}' not adopted yet — real loop lives in ${ownerModule} (${currentLoop}).`;
	return {
		update: () => { throw new Error(msg); },
		draw: () => { throw new Error(msg); },
	};
}

// `zombie`: zombies.ts owns updateZombies; engine render pass is renderZombies.
gameObjectRegistry.register(`zombie`, adoptionStub(`zombie`, `src/game/sim/zombies.ts`, `renderZombies`));
// `bullet`: combat.ts owns updateBullets and the bullets array; render pass is renderProjectiles.
gameObjectRegistry.register(`bullet`, adoptionStub(`bullet`, `src/game/sim/combat.ts`, `renderProjectiles`));
// `particle`: juice.ts owns the pooled particles array; engine passes are updateParticles / the particle paint pass.
gameObjectRegistry.register(`particle`, adoptionStub(`particle`, `src/game/sim/juice.ts`, `updateParticles`));
// `floater`: juice.ts owns the pooled floaters array (floaterPool, 40-cap discipline); render pass is paintFloaters.
gameObjectRegistry.register(`floater`, adoptionStub(`floater`, `src/game/sim/juice.ts`, `paintFloaters`));

// Test bridge: batch tests reach the singleton without importing the module.
if (typeof window !== `undefined`) {
	(window as any).__pzRegistry = gameObjectRegistry;
}
