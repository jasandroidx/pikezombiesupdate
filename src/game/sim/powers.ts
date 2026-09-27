import type { SimContext } from "./context";
import { brinePatch } from "../boons";
import { soundEngine } from "../../audio/soundEngine";

// Batch 14 (modularization) lane M3: extracted verbatim from GameEngine.
// State lives on the engine; this module holds `eng: SimContext`.
// Cross-module/engine calls use `(this.eng as any).x()` + CONTEXT-GAP.

export class PowersSim {
	constructor(private eng: SimContext) {}

	updateOrbit(dt: any) {
		this.eng.orbit = (this.eng.orbit || 0) + dt * 2.6;
		const n = 2 + (this.eng as any).boon(`ring`) + this.eng.bpOrbiters; // CONTEXT-GAP: boon
		const rad = 56;
		this.eng.orbitPts = [];
		const dmg = 11 + (this.eng as any).boon(`ring`) * 4; // CONTEXT-GAP: boon
		const cell = 64;
		const grid = new Map<string, typeof this.eng.zombies>();
		for (const z of this.eng.zombies) {
			const k = ((z.x / cell) | 0) + `:` + ((z.y / cell) | 0);
			let a = grid.get(k);
			if (!a) { a = []; grid.set(k, a); }
			a.push(z);
		}
		const near = (x: number, y: number, cb: (z: (typeof this.eng.zombies)[number]) => void) => {
			const cx = (x / cell) | 0, cy = (y / cell) | 0;
			for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) {
				const a = grid.get(ix + `:` + iy);
				if (!a) continue;
				for (const z of a) cb(z);
			}
		};
		for (let i = 0; i < n; i++) {
			const a = this.eng.orbit + (Math.PI * 2 * i) / n;
			const x = this.eng.player.x + Math.cos(a) * rad;
			const y = this.eng.player.y + Math.sin(a) * rad;
			this.eng.orbitPts.push({ x, y, a });
			near(x, y, (z: any) => {
				if (z.orbitHit && z.orbitHit > this.eng.simTime) return;
				if (Math.hypot(z.x - x, z.y - y) > z.radius + 12) return;
				z.orbitHit = this.eng.simTime + 0.5;
				z.health -= dmg;
				z.hitFlash = 0.06;
				this.eng.stats.damageDealt += dmg;
			});
		}
	}

	updateStorm(dt: any) {
		const stacks = (this.eng as any).boon(`storm`); // CONTEXT-GAP: boon
		if (!stacks) return;
		this.eng.stormCd -= dt;
		if (this.eng.stormCd > 0) return;
		this.eng.stormCd = Math.max(0.9, 2.2 - stacks * 0.25);
		const dmg = 26 + stacks * 14;
		let from = { x: this.eng.player.x, y: this.eng.player.y };
		let cur = null, best = 1e9;
		for (const z of this.eng.zombies) {
			const d = Math.hypot(z.x - from.x, z.y - from.y);
			if (d < 520 && d < best) { best = d; cur = z; }
		}
		if (!cur) return;
		const hit = new Set();
		const chains = 2 + stacks + this.eng.bpChains;
		for (let c = 0; c < chains && cur; c++) {
			hit.add(cur);
			cur.health -= dmg;
			cur.hitFlash = 0.08;
			this.eng.stats.damageDealt += dmg;
			this.eng.lightning.push({ x1: from.x, y1: from.y, x2: cur.x, y2: cur.y, life: 0.18 });
			from = cur;
			let nxt = null, bd = 1e9;
			for (const z of this.eng.zombies) {
				if (hit.has(z)) continue;
				const d = Math.hypot(z.x - from.x, z.y - from.y);
				if (d < 200 && d < bd) { bd = d; nxt = z; }
			}
			cur = nxt;
		}
	}

	updateAura(dt: any) {
		const stacks = (this.eng as any).boon(`aura`); // CONTEXT-GAP: boon
		if (stacks <= 0) return;
		const R = 80 + stacks * 16;
		const dps = 14 + stacks * 9;
		for (const z of this.eng.zombies) {
			const d = Math.hypot(z.x - this.eng.player.x, z.y - this.eng.player.y);
			if (d > R + z.radius) continue;
			z.health -= dps * dt;
			this.eng.stats.damageDealt += dps * dt;
			z.hitFlash = Math.max(z.hitFlash, .04);
			z.auraTick = (z.auraTick || 0) + dt;
			if (z.auraTick > .5) {
				z.auraTick = 0;
				this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
					x: z.x + (Math.random() - .5) * z.radius * 2,
					y: z.y + (Math.random() - .5) * z.radius * 2,
					vx: (Math.random() - .5) * 2, vy: -2 - Math.random() * 2,
					size: 3 + Math.random() * 3, color: `#c084fc`, alpha: .9,
					life: .4, maxLife: .4, type: `fire`
				}));
			}
		}
	}

	updateNova(dt: any) {
		this.eng.novaFlash = Math.max(0, this.eng.novaFlash - dt);
		const stacks = (this.eng as any).boon(`nova`); // CONTEXT-GAP: boon
		if (stacks <= 0) return;
		this.eng.novaCd -= dt;
		if (this.eng.novaCd > 0) return;
		this.eng.novaCd = Math.max(1.5, 2.7 - stacks * .22);
		const n = 5 + stacks * 2;
		const dmg = 10 + stacks * 5;
		const sp = 14; // units/frame @60fps, like the gun rounds
		const off = Math.random() * Math.PI * 2;
		for (let i = 0; i < n; i++) {
			const a = off + (Math.PI * 2 * i) / n;
			const b = (this.eng as any).allocBullet(); // CONTEXT-GAP: allocBullet
			b.x = this.eng.player.x; b.y = this.eng.player.y;
			b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
			b.damage = dmg; b.pierce = 1; b.radius = 4;
			b.rangeRemaining = 400; b.weaponType = `nova`; b.color = `#fbbf24`;
			b.lastHit = null; b.lastHitCd = 0;
			this.eng.bullets.push(b);
		}
		this.eng.novaFlash = .25;
		this.eng.stats.shotsFired += n;
		soundEngine.tone({ f: 220, f2: 880, type: `sawtooth`, dur: .18, vol: .15 });
	}

	updateMissiles(dt: any) {
		const stacks = (this.eng as any).boon(`missiles`); // CONTEXT-GAP: boon
		if (stacks <= 0) return;
		this.eng.missileCd -= dt;
		if (this.eng.missileCd > 0) return;
		this.eng.missileCd = Math.max(4.5, 7 - stacks * .5);
		const salvo = 1 + ((stacks / 2) | 0);
		for (let i = 0; i < salvo; i++) {
			const a = -Math.PI / 2 + (i - (salvo - 1) / 2) * .35;
			const sp = 5; // slow and heavy: ~300 u/s in engine units
			const b = (this.eng as any).allocBullet(); // CONTEXT-GAP: allocBullet
			b.x = this.eng.player.x; b.y = this.eng.player.y - 10;
			b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
			b.damage = 85 + stacks * 35; b.pierce = 1; b.radius = 6;
			b.rangeRemaining = 900; b.weaponType = `missiles`; b.color = `#f87171`;
			b.isMissile = true; b.missileTurn = 2.4; b.missileAoe = 78;
			b.lastHit = null; b.lastHitCd = 0;
			this.eng.bullets.push(b);
		}
		this.eng.stats.shotsFired += salvo;
		soundEngine.tone({ f: 140, f2: 420, type: `sawtooth`, dur: .3, vol: .2 });
	}

	detonateMissile(n: any) {
		const R = n.missileAoe || 78;
		for (const z of this.eng.zombies) {
			const d = Math.hypot(z.x - n.x, z.y - n.y);
			if (d > R + z.radius) continue;
			const f = 1 - .5 * (d / (R + z.radius));
			const dmg = Math.round(n.damage * f * (this.eng as any).playerDamageMul(z, n.weaponType)); // CONTEXT-GAP: playerDamageMul
			z.health -= dmg; z.hitFlash = .12; this.eng.stats.damageDealt += dmg;
			(this.eng as any).emitJuice('bloodParticles', { x: z.x, y: z.y, angle: Math.atan2(z.y - n.y, z.x - n.x) });
			(this.eng as any).drainJuiceEvents();
		}
		(this.eng as any).emitJuice('shockwave', { x: n.x, y: n.y, r: 8, maxR: R, life: .35, maxLife: .35, color: `#f87171` });
		(this.eng as any).drainJuiceEvents();
		(this.eng as any).emitJuice('scorch', { x: n.x, y: n.y, radius: 60 });
		(this.eng as any).drainJuiceEvents();
		(this.eng as any).emitJuice('shake', { amount: 5 });
		(this.eng as any).drainJuiceEvents();
		this.eng.trauma = Math.min(1, this.eng.trauma + .3 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
		(this.eng as any).emitNoise(n.x, n.y, 420); // CONTEXT-GAP: emitNoise
		soundEngine.playBarrelExplosion();
		(this.eng as any).drainJuiceEvents();
	}

	dropVacuumAt(x: any, y: any) {
		this.eng.drops.push({ id: Math.random().toString(), type: `dust_devil`, x, y, amount: 1, duration: 4e4 });
	}

	updateVacuumDrops() {
		if (this.eng.simTime >= this.eng.nextVacuumAt) {
			this.eng.nextVacuumAt = this.eng.simTime + 55 + Math.random() * 25;
			const a = Math.random() * Math.PI * 2, d = 140 + Math.random() * 100;
			this.eng.dropVacuumAt(this.eng.player.x + Math.cos(a) * d, this.eng.player.y + Math.sin(a) * d);
			(this.eng as any).emitJuice('floater', { x: this.eng.player.x, y: this.eng.player.y - 56, text: `DUST DEVIL SIGHTED`, color: `#7dd3fc` });
			(this.eng as any).drainJuiceEvents();
		}
		(this.eng as any).drainJuiceEvents();
	}

	updateSalt(dt: any) {
		const stacks = (this.eng as any).boon(`salt`); // CONTEXT-GAP: boon
		if (!stacks) return;
		const R = 95 + stacks * 18;
		const dps = 9 + stacks * 5;
		for (const z of this.eng.zombies) {
			const d = Math.hypot(z.x - this.eng.player.x, z.y - this.eng.player.y);
			if (d > R + z.radius) continue;
			z.health -= dps * dt;
			this.eng.stats.damageDealt += dps * dt;
			z.saltTick = (z.saltTick || 0) + dt;
			if (z.saltTick > 0.4) { z.saltTick = 0; z.hitFlash = 0.05; }
		}
	}

	updateLightning(dt: any) {
		for (let i = this.eng.lightning.length - 1; i >= 0; i--) {
			this.eng.lightning[i].life -= dt;
			if (this.eng.lightning[i].life <= 0) this.eng.lightning.splice(i, 1);
		}
	}

	updateBeacon(dt: any) {
		if (!this.eng.beacon || this.eng.beacon.done || this.eng.waveState !== `active`) return;
		const d = Math.hypot(this.eng.player.x - this.eng.beacon.x, this.eng.player.y - this.eng.beacon.y);
		if (d < 48) this.eng.beacon.hold += dt;
		else this.eng.beacon.hold = Math.max(0, this.eng.beacon.hold - dt * .5);
		if (this.eng.beacon.hold < 2) return;
		this.eng.beacon.done = true;
		const w = this.eng.weapons[this.eng.currentWeaponIndex];
		w.reserveAmmo += w.id === `shotgun` ? 6 : 10;
		this.eng.player.health = Math.min(this.eng.player.maxHealth, this.eng.player.health + 22);
		(this.eng as any).emitJuice('floater', { x: this.eng.beacon.x, y: this.eng.beacon.y - 24, text: "SUPPLY", color: "#d4a017" });
		(this.eng as any).drainJuiceEvents();
		soundEngine.playPickup();
		(this.eng as any).drainJuiceEvents();
	}

	tickBounty(kind: any) {
		const b = this.eng.bounty;
		if (!b || b.done || b.kind !== kind) return;
		b.have++;
		if (b.have < b.need) return;
		b.done = true;
		this.eng.scrap += 40;
		this.eng.stats.scrapCollected += 40;
		this.eng.player.health = Math.min(this.eng.player.maxHealth, this.eng.player.health + 14);
		this.eng.bountyBoostUntil = this.eng.simTime + 8;
		(this.eng as any).emitJuice('floater', { x: this.eng.player.x, y: this.eng.player.y - 32, text: "BOUNTY", color: "#d4a017" });
		(this.eng as any).drainJuiceEvents();
		soundEngine.playPowerup();
		(this.eng as any).drainJuiceEvents();
	}

	updateOrbiters(dt: any) {
		const w = this.eng.weapons[this.eng.currentWeaponIndex];
		if (!w || w.id !== `orbiter`) {
			if (this.eng.orbiterBlades.length) this.eng.orbiterBlades = [];
			return;
		}
		const cfg = (this.eng as any).orbiterCfg(); // CONTEXT-GAP: orbiterCfg
		this.eng.orbiterAngle = (this.eng.orbiterAngle || 0) + dt * cfg.orbiterSpeed;
		const R = Math.max(0.001, cfg.orbiterRadius);
		const blades = [];
		for (let i = 0; i < cfg.orbiterCount; i++) {
			const a = this.eng.orbiterAngle + (Math.PI * 2 * i) / Math.max(1, cfg.orbiterCount);
			blades.push({ x: this.eng.player.x + Math.cos(a) * R, y: this.eng.player.y + Math.sin(a) * R, a });
		}
		this.eng.orbiterBlades = blades;
		const cdS = cfg.fireIntervalMs > 0 ? cfg.fireIntervalMs / 1000 : 0.35;
		const tickDmg = cfg.orbiterDps * cdS;
		for (let bi = 0; bi < blades.length; bi++) {
			const b = blades[bi];
			const q = (this.eng as any).queryZombies(b.x, b.y, 44 + (this.eng.zhashMaxR || 0), []); // CONTEXT-GAP: queryZombies
			for (const k of q) {
				const z = this.eng.zombies[k];
				if (!z || z.health <= 0) continue;
				if (Math.hypot(z.x - b.x, z.y - b.y) > z.radius + 14) continue;
				z.orbiterCd = z.orbiterCd || {};
				if ((z.orbiterCd[bi] ?? -99) > this.eng.simTime) continue;
				z.orbiterCd[bi] = this.eng.simTime + cdS;
				const dealt = (this.eng as any).applyAffixDefense(z, tickDmg * (this.eng as any).playerDamageMul(z)); // CONTEXT-GAP: applyAffixDefense, playerDamageMul
				z.health -= dealt;
				z.hitFlash = Math.max(z.hitFlash, .08);
				this.eng.stats.damageDealt += dealt;
			}
		}
	}

	lobCharge(x: any, y: any, delaySec: any, radius: any, baseDmg: any, label: any) {
		this.eng.lobbedCharges.push({ x, y, t: delaySec, max: delaySec, radius, baseDmg, label });
		(this.eng as any).emitNoise(x, y, 300); // CONTEXT-GAP: emitNoise
		(this.eng as any).emitJuice('floater', { x: x, y: y - 34, text: label + ` INCOMING`, color: `#f97316` });
		(this.eng as any).drainJuiceEvents();
	}

	updateLobbedCharges(dt: any) {
		for (let i = this.eng.lobbedCharges.length - 1; i >= 0; i--) {
			const c = this.eng.lobbedCharges[i];
			c.t -= dt;
			if (c.t <= 0) { this.eng.lobbedCharges.splice(i, 1); this.eng.detonateCharge(c); }
		}
	}

	detonateCharge(c: any) {
		for (const z of this.eng.zombies) {
			const d = Math.hypot(z.x - c.x, z.y - c.y);
			if (d > c.radius + z.radius) continue;
			const f = 1 - .5 * (d / (c.radius + z.radius));
			const dmg = Math.round(c.baseDmg * f * (this.eng as any).explosionDmgMul(z)); // CONTEXT-GAP: explosionDmgMul
			z.health -= dmg; z.hitFlash = .12;
			this.eng.stats.damageDealt += dmg;
			(this.eng as any).emitJuice('bloodParticles', { x: z.x, y: z.y, angle: Math.atan2(z.y - c.y, z.x - c.x) });
			(this.eng as any).drainJuiceEvents();
		}
		for (let i = this.eng.zombies.length - 1; i >= 0; i--) {
			if (this.eng.zombies[i].health <= 0) (this.eng as any).killZombie(this.eng.zombies[i], i); // CONTEXT-GAP: killZombie
		}
		this.eng.spawnBrinePatch(c.x, c.y); // Batch 10 (Lane 4): Mash Bomb leaves a burning brine patch.
		(this.eng as any).emitJuice('shockwave', { x: c.x, y: c.y, r: 8, maxR: c.radius, life: .35, maxLife: .35, color: `#f97316` });
		(this.eng as any).drainJuiceEvents();
		(this.eng as any).emitJuice('scorch', { x: c.x, y: c.y, radius: Math.min(130, c.radius) });
		(this.eng as any).drainJuiceEvents();
		(this.eng as any).emitJuice('shake', { amount: 7 * (this.eng as any).tune('shake') * (this.eng as any).motionScale() }); // CONTEXT-GAP: tune, motionScale
		(this.eng as any).drainJuiceEvents();
		this.eng.trauma = Math.min(1, this.eng.trauma + .4 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
		(this.eng as any).emitJuice('light', { x: c.x, y: c.y, radius: 420, intensity: 1, ttl: .5 });
		(this.eng as any).drainJuiceEvents();
		(this.eng as any).emitNoise(c.x, c.y, 500); // CONTEXT-GAP: emitNoise
		soundEngine.playBarrelExplosion();
		(this.eng as any).emitJuice('floater', { x: c.x, y: c.y - c.radius - 10, text: c.label, color: `#f97316` });
		(this.eng as any).drainJuiceEvents();
	}

	spawnBrinePatch(x: any, y: any) {
		const rank = (this.eng as any).boon(`brinebarrel`); // CONTEXT-GAP: boon
		if (rank <= 0) return;
		const p = brinePatch(rank);
		this.eng.firePuddles.push({
			id: Math.random().toString(),
			x, y,
			radius: p.radius,
			duration: p.durationMs,
			createdTime: Date.now(),
			dps: p.dps,
			isBrine: true,
		});
	}

	updateArcBeams(dt: any) {
		for (let i = this.eng.arcBeams.length - 1; i >= 0; i--) {
			const b = this.eng.arcBeams[i];
			b.tickT += dt;
			if (b.tickT >= .12 && b.ticksLeft > 0) {
				b.tickT = 0; b.ticksLeft--;
				// Sweep-lock: re-acquire the densest cluster every tick.
				const c = (this.eng as any).densestCluster(b.range); // CONTEXT-GAP: densestCluster
				if (c) { b.tx = c.x; b.ty = c.y; }
				this.eng.lanceTick(b);
			}
			if (b.ticksLeft <= 0) this.eng.arcBeams.splice(i, 1);
		}
	}

	lanceTick(b: any) {
		const x1 = this.eng.player.x, y1 = this.eng.player.y, x2 = b.tx, y2 = b.ty;
		const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1;
		let hits = 0;
		for (const z of this.eng.zombies) {
			if (z.health <= 0) continue;
			let t = ((z.x - x1) * dx + (z.y - y1) * dy) / len2;
			t = Math.max(0, Math.min(1, t));
			const px = x1 + dx * t, py = y1 + dy * t;
			if (Math.hypot(z.x - px, z.y - py) > b.halfWidth + z.radius) continue;
			const dealt = (this.eng as any).applyAffixDefense(z, b.tickDmg); // CONTEXT-GAP: applyAffixDefense
			z.health -= dealt;
			z.hitFlash = Math.max(z.hitFlash, .15);
			this.eng.stats.damageDealt += dealt;
			(this.eng as any).emitJuice('bloodParticles', { x: z.x, y: z.y, angle: Math.atan2(z.y - y1, z.x - x1) });
			(this.eng as any).drainJuiceEvents();
			hits++;
			if (z.health <= 0) (this.eng as any).killZombie(z, this.eng.zombies.indexOf(z)); // CONTEXT-GAP: killZombie
		}
		this.eng.lastLance = { beams: this.eng.arcBeams.length, hits, tx: Math.round(b.tx), ty: Math.round(b.ty) };
		// Heat-glow visual: jagged orange beam + light bloom + heat sparks.
		this.eng.heatArc(x1, y1, x2, y2);
		(this.eng as any).emitJuice('light', { x: x2, y: y2, radius: 260, intensity: .9, ttl: .4 });
		(this.eng as any).drainJuiceEvents();
		(this.eng as any).emitJuice('shake', { amount: 3 * (this.eng as any).tune('shake') * (this.eng as any).motionScale() }); // CONTEXT-GAP: tune, motionScale
		(this.eng as any).drainJuiceEvents();
	}

	heatArc(x1: any, y1: any, x2: any, y2: any) {
		const segs = 4;
		let px = x1, py = y1;
		for (let s = 1; s <= segs; s++) {
			const t = s / segs;
			const nx = x1 + (x2 - x1) * t + (s < segs ? (Math.random() - .5) * 34 : 0);
			const ny = y1 + (y2 - y1) * t + (s < segs ? (Math.random() - .5) * 34 : 0);
			this.eng.lightning.push({ x1: px, y1: py, x2: nx, y2: ny, life: 0.18, heat: true });
			px = nx; py = ny;
		}
		for (let i = 0; i < 5; i++) this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
			x: x2 + (Math.random() - .5) * 30, y: y2 + (Math.random() - .5) * 30,
			vx: (Math.random() - .5) * 5, vy: (Math.random() - .5) * 5,
			size: 3, color: `#ff7b1c`, alpha: 1, life: .3, maxLife: .35, type: `spark`
		}));
	}

}
