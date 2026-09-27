// Batch 14 (engine modularization): JuiceSim — mechanically extracted from src/game/engine.ts.
// State stays on GameEngine; inside this module `this.eng` is the engine (SimContext).
// `// CONTEXT-GAP: name` marks a call to a method owned by another module or still on
// the engine; the coordinator resolves these during the update() rewire.
import type { SimContext } from "./context";
import { soundEngine } from "../../audio/soundEngine";

export class JuiceSim {
	constructor(private eng: SimContext) {}

	// ---- Juice event bus (Lane 4: juice-in-renderer event architecture).
	// Sim logic emits typed juice events; JuiceSim drains the queue into the
	// terminal producers below. The engine's SimEventBus is subscriber-only
	// (no queue), so JuiceSim keeps its own pending queue; emitJuice ALSO
	// notifies bus subscribers for future renderer hookup. Drain is
	// synchronous (probes read juice state in the same tick), idempotent,
	// and reentrancy-safe — producers must never emit.
	//
	// Juice event kinds (payload shapes):
	//   'floater'        { x, y, text, color }
	//   'damageNumber'   { x, y, amount, color }
	//   'killWord'       { x, y }
	//   'bloodSpray'     { x, y, angle, power }
	//   'bloodParticles' { x, y, angle }
	//   'scorch'         { x, y, radius }
	//   'telegraph'      { kind, x, y, r, dur }
	//   'light'          { x, y, radius, intensity, ttl }
	//   'corpse'         { x, y, radius }
	//   'slash'          { x, y, angle, faint }
	//   'hitSparks'      { x, y, color }
	//   'bloodSplat'     { x, y }
	//   'shockwave'      { x, y, r, maxR, life, maxLife, color, b5? }
	//   'hitFlash'       { x, y, life, maxLife }
	//   'shake'          { amount }  (strongest-wins)
	//   'shakeSet'       { amount }  (assign)
	//   'camKick'        { dx, dy }  (additive camera kick)
	private juiceQueue: { kind: string, data: any }[] = [];
	private drainingJuice = false;

	emitJuice(kind: string, data: any = {}) {
		const d = data || {};
		this.eng.events.emit({ type: `custom`, at: this.eng.simTime, data: { juice: kind, ...d } });
		this.juiceQueue.push({ kind, data: d });
	}

	drainEvents() {
		if (this.drainingJuice) return;
		this.drainingJuice = true;
		try {
			let ev: { kind: string, data: any } | undefined;
			while ((ev = this.juiceQueue.shift())) this.produceJuice(ev.kind, ev.data);
		} finally {
			this.drainingJuice = false;
		}
	}

	private produceJuice(kind: string, d: any) {
		switch (kind) {
			case `floater`: this.spawnFloater(d.x, d.y, d.text, d.color); break;
			case `damageNumber`: this.spawnDamageNumber(d.x, d.y, d.amount, d.color); break;
			case `killWord`: this.spawnKillWord(d.x, d.y); break;
			case `bloodSpray`: this.bloodSpray(d.x, d.y, d.angle, d.power); break;
			case `bloodParticles`: this.createBloodParticles(d.x, d.y, d.angle); break;
			case `scorch`: this.addScorch(d.x, d.y, d.radius); break;
			case `telegraph`: this.pushTelegraph(d.kind, d.x, d.y, d.r, d.dur); break;
			case `light`: this.addLight(d.x, d.y, d.radius, d.intensity, d.ttl); break;
			case `corpse`: this.addCorpse({ x: d.x, y: d.y, radius: d.radius }); break;
			case `slash`: this.addSlash(d.x, d.y, d.angle, d.faint); break;
			case `hitSparks`: this.createHitSparks(d.x, d.y, d.color); break;
			case `bloodSplat`: this.addBloodSplat(d.x, d.y); break;
			case `shockwave`: this.pushShockwave(d); break;
			case `hitFlash`: this.pushHitFlash(d); break;
			case `shake`: this.bumpShake(d.amount); break;
			case `shakeSet`: this.setShake(d.amount); break;
			case `camKick`: this.pushCamKick(d.dx, d.dy); break;
			default: break; // unknown kinds ignored (forward-compat with other lanes)
		}
	}

	// Terminal producers for the ring/flash/shake kinds (drain-only entry points).
	pushShockwave(s: any) { this.eng.shockwaves.push(s); }
	pushHitFlash(f: any) { this.eng.hitFlashes.push(f); }
	pushCamKick(dx: any, dy: any) { this.eng.camKickX += dx; this.eng.camKickY += dy; }
	bumpShake(amount: any) { this.eng.screenShake = Math.max(this.eng.screenShake, amount); }
	setShake(amount: any) { this.eng.screenShake = amount; }

	addScorch(x: any, y: any, radius: any) {
		this.eng.scorchDecals.push({ x, y, radius, alpha: .55, maxAlpha: .55 });
		if (this.eng.scorchDecals.length > 60) this.eng.scorchDecals.shift();
	}

	updateScorch(dt: any) {
		for (let i = this.eng.scorchDecals.length - 1; i >= 0; i--) {
			const s = this.eng.scorchDecals[i];
			s.alpha -= dt * .06;
			if (s.alpha <= 0) this.eng.scorchDecals.splice(i, 1);
		}
	}

	// VS-1: pooled damage numbers — throttled so bullet storms don't spam floaters.

	// NOTE: SimContext declares dmgFloaters as any[] but the engine owns it as a number
	// (engine.ts:291 `dmgFloaters = 0`). Cast via `as any` until context.ts is corrected.
	spawnDamageNumber(x: any, y: any, amount: any, color: any) {
		if (this.eng.dmgFloaters >= 12) return;
		this.eng.dmgFloaters++;
		const f = this.eng.floaterPool.pop() || {};
		f.x = x; f.y = y; f.text = `${Math.round(amount)}`; f.color = color; f.life = .5; f.maxLife = .5; f.vy = -34; f.dmg = true;
		f.onFree = () => { this.eng.dmgFloaters = Math.max(0, this.eng.dmgFloaters - 1); };
		this.eng.floaters.push(f);
		if (this.eng.floaters.length > 40) { const old = this.eng.floaters.shift(); old.onFree?.(); this.eng.floaterPool.push(old); }
	}

	// Batch 5: kill-word floaters — SLAIN! / DOWN! / SPLAT! / CRUNCH!, gold/red,
	// pooled through spawnFloater so the 40-floater cap discipline holds.

	spawnKillWord(x: any, y: any) {
		if (this.eng.floaters.length >= 40) return;
		const w = this.eng.killWords[(Math.random() * this.eng.killWords.length) | 0];
		const c = Math.random() < .5 ? `#ffd700` : `#e11d2e`;
		this.eng.lastKillWord = { word: w, color: c, x: Math.round(x), y: Math.round(y) };
		this.eng.killWordCount++;
		this.spawnFloater(x, y, w, c);
	}
	// Batch 5: directional blood spray — velocity scales with the hit's power.
	// Spray particles carry splat:true so they leave ground splats on death.

	bloodSpray(x: any, y: any, angle: any, power: any) {
		for (let i = 0; i < 10; i++) {
			const a = angle + (Math.random() - .5) * .9;
			const sp = 1.5 + power * .02 + Math.random() * 2.5;
			this.eng.particles.push(Object.assign(this.allocParticle(), {
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

	addBloodSplat(x: any, y: any) {
		this.eng.bloodSplats.push({ x, y, r: 3 + Math.random() * 5, life: 18, maxLife: 18 });
		if (this.eng.bloodSplats.length > 30) this.eng.bloodSplats.shift();
	}
	// Batch 5: oriented slash streaks on hits (faint for whiffs). Cap 24.

	addSlash(x: any, y: any, angle: any, faint: any = false) {
		this.eng.slashBursts.push({ x, y, angle, faint, life: .18, maxLife: .18 });
		if (this.eng.slashBursts.length > 24) this.eng.slashBursts.shift();
	}

	addScore(n: any) {
		// CONTEXT-GAP: hasPowerup
		const m = (this.eng as any).hasPowerup(`score_surge`) ? 2 : 1;
		const g = Math.round(n * m);
		this.eng.score += g;
		return g;
	}

	reactHit(z: any, dmg: any, angle: any) {
		z.yOff = Math.min(14, 4 + dmg * .05);
		z.squashT = .08;
		if (dmg >= 80) { z.hitSpin = (Math.random() < .5 ? -1 : 1) * .35; z.spinT = .25; }
	}

	// VS-1: "Run Out of the County" banish — permanently remove a boon from this run's draft pool.

	spendHitstop(amount: any) {
		if (!this.eng.hitFeel) return;
		const spend = Math.min(amount, this.eng.hitstopBudget);
		this.eng.hitstopBudget -= spend;
		// CONTEXT-GAP: tune
		this.eng.hitstop = Math.max(this.eng.hitstop, (spend) * (this.eng as any).tune('hitstop'));
	}

	feelHit(bullet: any, zombie: any) {
		if (!this.eng.hitFeel) return;
		this.spendHitstop(.012);
		const a = Math.atan2(bullet.vy, bullet.vx);
		// Camera kick (evented — drained synchronously so probes read it this tick).
		this.emitJuice(`camKick`, { dx: Math.cos(a) * 2.5, dy: Math.sin(a) * 2.5 });
		this.drainEvents();
	}

	feelKill(z: any) {
		if (!this.eng.hitFeel) return;
		const big = z.elite || z.type === `behemoth` || z.type === `old_ben` || z.type === `miner_brute`;
		this.spendHitstop(big ? .09 : .035);
		if (big) {
			// Slow-motion aftertaste.
			this.eng.slowAfter = .6;
			this.eng.worldSlow = Math.max(this.eng.worldSlow, 1.4);
			// Shockwave (evented — drained at the end of feelKill).
			this.emitJuice(`shockwave`, { x: z.x, y: z.y, r: 10, maxR: z.elite ? 150 : 220, life: .45, maxLife: .45 });
			soundEngine.tone({ f: 90, f2: 34, type: `sine`, dur: .4, vol: .5 });
		}
		// Camera kick away from the kill + zoom punch.
		const a = Math.atan2(z.y - this.eng.player.y, z.x - this.eng.player.x);
		// CONTEXT-GAP: tune, motionScale
		this.eng.camKickX -= Math.cos(a) * (big ? 9 : 4) * (this.eng as any).tune('kick') * (this.eng as any).motionScale();
		this.eng.camKickY -= Math.sin(a) * (big ? 9 : 4);
		// CONTEXT-GAP: tune, motionScale
		this.eng.zoomPunch = Math.min(.09, this.eng.zoomPunch + (big ? .05 : .02) * (this.eng as any).tune('zoom') * (this.eng as any).motionScale());
		// Blood spray burst.
		for (let i = 0; i < (big ? 16 : 8); i++) {
			const pa = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
			this.eng.particles.push(Object.assign(this.allocParticle(), { x: z.x, y: z.y, vx: Math.cos(pa) * sp, vy: Math.sin(pa) * sp, size: 2 + Math.random() * 3, life: .4 + Math.random() * .3, maxLife: .7, color: `#a31621`, alpha: 1 }));
		}
		// Kill words (evented — drained at the end of feelKill so emission
		// order matches the old direct-call order).
		if (z.type === `behemoth`) this.emitJuice(`floater`, { x: z.x, y: z.y - 40, text: `COUNTY LEGEND`, color: `#ffd700` });
		else if (z.elite) this.emitJuice(`floater`, { x: z.x, y: z.y - 30, text: [`DROPPED`, `BIG GAME`, `PUT DOWN`][(Math.random() * 3) | 0], color: `#c77dff` });
		else if (this.eng.streak >= 20) this.emitJuice(`floater`, { x: z.x, y: z.y - 26, text: `UNSTOPPABLE`, color: `#ff6ec7` });
		this.drainEvents();
	}

	updateFeel(dt: any) {
		// Hit-stop budget refills; slow-mo aftertaste and zoom punch decay.
		this.eng.hitstopBudget = Math.min(.3, this.eng.hitstopBudget + dt * .3);
		if (this.eng.slowAfter > 0) {
			this.eng.slowAfter -= dt;
			if (this.eng.slowAfter <= 0) this.eng.worldSlow = 0;
		}
		this.eng.zoomPunch = Math.max(0, this.eng.zoomPunch - dt * .25);
		this.eng.camKickX *= Math.max(0, 1 - dt * 9);
		this.eng.camKickY *= Math.max(0, 1 - dt * 9);
		for (let i = this.eng.shockwaves.length - 1; i >= 0; i--) {
			const s = this.eng.shockwaves[i];
			s.life -= dt;
			s.r += (s.maxR - s.r) * dt * 7;
			if (s.life <= 0) this.eng.shockwaves.splice(i, 1);
		}
		if (this.eng.hurtFlash > 0) this.eng.hurtFlash = Math.max(0, this.eng.hurtFlash - dt * 1.4);
		// Batch 5: slash bursts and screen-space hit flashes decay.
		for (let i = this.eng.slashBursts.length - 1; i >= 0; i--) {
			const s = this.eng.slashBursts[i];
			s.life -= dt;
			if (s.life <= 0) this.eng.slashBursts.splice(i, 1);
		}
		for (let i = this.eng.hitFlashes.length - 1; i >= 0; i--) {
			const f = this.eng.hitFlashes[i];
			f.life -= dt;
			if (f.life <= 0) this.eng.hitFlashes.splice(i, 1);
		}
	}

	setHitFeel(on: any) { this.eng.hitFeel = !!on; }
	// Batch 2: mass-based knockback — sprinters fly, behemoths barely budge.

	testImpact() {
		// Fires one synthetic heavy hit at the player so the tuning panel's
		// TEST IMPACT button can be felt without an active fight.
		const x = this.eng.player?.x ?? 0, y = (this.eng.player?.y ?? 0) - 40;
		// CONTEXT-GAP: tune
		this.eng.hitstop = Math.max(this.eng.hitstop, .12 * (this.eng as any).tune(`hitstop`));
		// CONTEXT-GAP: tune, motionScale
		this.eng.trauma = Math.min(1, this.eng.trauma + .5 * (this.eng as any).tune(`shake`) * (this.eng as any).motionScale());
		this.eng.shockwaves.push({ x, y, r: 8, maxR: 160, life: .4, maxLife: .4, color: `#ffffff` });
		this.spawnFloater?.(x, y - 20, `TEST IMPACT`, `#ffd700`);
		soundEngine.killSound(10);
	}
	// Batch 7 (Lane 1): weapon defs live here because the constants.ts entries are
	// owned by another lane — entry fields win, local defaults fill the gaps.

	pushTelegraph(kind: any, x: any, y: any, r: any, dur: any) {
		this.eng.telegraphs.push({ kind, x: Math.round(x), y: Math.round(y), r: Math.max(0.001, r), t0: this.eng.simTime, dur: Math.max(0.05, dur) });
		if (this.eng.telegraphs.length > 24) this.eng.telegraphs.shift();
	}

	updateTelegraphs(e: any) {
		const now = this.eng.simTime;
		for (let i = this.eng.telegraphs.length - 1; i >= 0; i--) {
			if (now - this.eng.telegraphs[i].t0 >= this.eng.telegraphs[i].dur) this.eng.telegraphs.splice(i, 1);
		}
	}
	// Batch 7: darkness as gameplay — lit if inside the player's light radius or a light source.

	isLit(x: any, y: any) {
		const lr = Math.max(0.001, this.eng.player.lightRadius || 420);
		if (Math.hypot(x - this.eng.player.x, y - this.eng.player.y) <= lr) return true;
		for (const f of this.eng.flares) if (Math.hypot(x - f.x, y - f.y) <= 260) return true;
		const lan = this.eng.currentLocation.lantern;
		if (this.eng.lanternLit && lan && Math.hypot(x - lan.x, y - lan.y) <= 420) return true;
		return false;
	}
	// Batch 7: melee damage with enrage bonus; clones (damage 0) never touch the player.

	addCorpse(z: any) {
		this.eng.corpseDecals.push({ x: z.x, y: z.y, radius: Math.max(10, z.radius * .9), alpha: .5, maxAlpha: .5, life: 2 + Math.random() * 3 });
		if (this.eng.corpseDecals.length > 30) this.eng.corpseDecals.shift();
	}

	updateCorpseDecals(dt: any) {
		for (let i = this.eng.corpseDecals.length - 1; i >= 0; i--) {
			const c = this.eng.corpseDecals[i];
			c.life -= dt;
			c.alpha = Math.max(0, .5 * (c.life / 5));
			if (c.life <= 0) this.eng.corpseDecals.splice(i, 1);
		}
	}
	// Batch 7: per-run state reset (run-stat muls are set by applyRunStatMods in initRunMeta).

	createBloodParticles(e: any, t: any, n: any, c: any = 0) {
		// Batch 8 (Lane B): optional exact count (death burst uses 24).
		// CONTEXT-GAP: tune
		const count = c > 0 ? c : Math.max(1, Math.round(7 * (this.eng as any).tune(`particles`)));
		for (let r = 0; r < count; r++) {
			let r = n + (Math.random() - .5) * 1.2, i = 2 + Math.random() * 4;
			this.eng.particles.push(Object.assign(this.allocParticle(), {
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

	createHitSparks(e: any, t: any, n: any) {
		for (let r = 0; r < 6; r++) {
			let r = Math.random() * Math.PI * 2, i = 1.5 + Math.random() * 3.5;
			this.eng.particles.push(Object.assign(this.allocParticle(), {
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

	addLight(x: any, y: any, radius: any, intensity: any, ttl: any) {
		if (this.eng.dynLights.length >= 24) this.eng.dynLights.shift();
		this.eng.dynLights.push({ x, y, radius, intensity, ttl });
	}

	updateDynLights(e: any) {
		for (let i = this.eng.dynLights.length - 1; i >= 0; i--) {
			const l = this.eng.dynLights[i];
			l.ttl -= e;
			if (l.ttl <= 0) this.eng.dynLights.splice(i, 1);
		}
	}
	// Group 1: object pools

	allocParticle() {
		const p = this.eng.particlePool.pop();
		if (p) { p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.size = 0; p.color = ``; p.alpha = 0; p.life = 0; p.maxLife = 1; p.type = ``; return p; }
		return {};
	}

	allocBullet() {
		const b = this.eng.bulletPool.pop();
		if (b) { b.x = 0; b.y = 0; b.vx = 0; b.vy = 0; b.radius = 0; b.damage = 0; b.pierce = 0; b.rangeRemaining = 0; b.color = ``; b.id = ``; b.weaponType = ``; b.isMolotov = false; b.isFlare = false; b.isSplinter = false; b.isCrossbowBolt = false; b.isForkChild = false; b.isMissile = false; b.missileTurn = 0; b.missileAoe = 0; b.isMortar = false; b.mortarFuse = 0; b.mortarDmg = 0; b.mortarR = 0; b.bouncesLeft = undefined; b.lastHit = null; b.lastHitCd = 0; return b; }
		return {};
	}

	freeBulletAt(t: any) {
		const b = this.eng.bullets[t];
		this.eng.bullets.splice(t, 1);
		if (b) this.eng.bulletPool.push(b);
	}

	spawnFloater(e: any, t: any, n: any, r: any) {
		const f = this.eng.floaterPool.pop() || {};
		f.x = e; f.y = t; f.text = n; f.color = r; f.life = .7; f.maxLife = .7; f.vy = -28; f.dmg = false; f.onFree = null;
		this.eng.floaters.push(f), this.eng.floaters.length > 40 && this.eng.floaterPool.push(this.eng.floaters.shift());
	}
}
