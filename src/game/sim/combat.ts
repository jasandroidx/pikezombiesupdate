// Batch 14 (modularization): CombatSim — weapons, firing, projectiles, detonations, poison/ricochet.
// Mechanically extracted from src/game/engine.ts (branch feature/crate-vs, Batch 13).
// State lives on the engine; this module reaches it via `eng: SimContext`.
// Same-module calls stay `this.x()`; engine/other-module calls are
// `(this.eng as any).x()` and marked `// CONTEXT-GAP: x` for the integrator.
import type { SimContext } from "./context";
import { supportApplies, tracerPierceBonus, tracerSpeedMul, brineExplosionMul, copperheadMaxStacks, copperheadPoisonDps, copperheadDurationSec, copperheadApplies } from "../boons";
import { BOMB_RADIUS, BOMB_DMG, BOMB_MAX_CHARGES, BOMB_REGEN_MS, statsForLevel, MORTAR_TUNING, BURN_MAX_STACKS, BURN_REFRESH_MS } from "../constants";
import { soundEngine } from "../../audio/soundEngine";
import { registerZombieHit } from "../mapRenderer";

export class CombatSim {
	constructor(private eng: SimContext) {}

		selectWeapon(e: any) {
			if (!this.eng.weapons[e] || !this.eng.weapons[e].unlocked) return false;
			this.eng.codexSeen?.add(this.eng.weapons[e].id);
			if (this.eng.currentWeaponIndex !== e) {
				this.eng.switchBanner = 1.6;
				(this.eng as any).emitJuice(`floater`, { x: this.eng.player.x, y: this.eng.player.y - 44, text: this.eng.weapons[e].name, color: `#d4a017` }); // Batch 16 (Lane 2): juice event
				soundEngine.playPickup();
			}
			this.eng.currentWeaponIndex = e;
			this.eng.isReloading = false;
			return true;
		}

		nextWeapon() {
			let e = (this.eng.currentWeaponIndex + 1) % this.eng.weapons.length;
			for (; !this.eng.weapons[e].unlocked && e !== this.eng.currentWeaponIndex;) e = (e + 1) % this.eng.weapons.length;
			this.selectWeapon(e);
		}

		prevWeapon() {
			let e = (this.eng.currentWeaponIndex - 1 + this.eng.weapons.length) % this.eng.weapons.length;
			for (; !this.eng.weapons[e].unlocked && e !== this.eng.currentWeaponIndex;) e = (e - 1 + this.eng.weapons.length) % this.eng.weapons.length;
			this.selectWeapon(e);
		}

		reloadCurrentWeapon() {
			let e = this.eng.weapons[this.eng.currentWeaponIndex];
			if (e.reserveAmmo <= 0 && e.currentMag <= 0) {
				this.autoSwapFromDry();
				return;
			}
			!this.eng.isReloading && e.currentMag < e.magazineSize && e.reserveAmmo > 0 && (this.eng.isReloading = true, this.eng.reloadStartTime = Date.now(), soundEngine.playReload(), e.id === `shotgun` && (this.eng as any).alertZombies(this.eng.player.x, this.eng.player.y, 240)); // CONTEXT-GAP: alertZombies
		}

		autoSwapFromDry() {
			const cur = this.eng.weapons[this.eng.currentWeaponIndex];
			if (cur.currentMag > 0 || cur.reserveAmmo > 0) return false;
			for (let i = 1; i < this.eng.weapons.length; i++) {
				const idx = (this.eng.currentWeaponIndex + i) % this.eng.weapons.length;
				const w = this.eng.weapons[idx];
				if (!w.unlocked) continue;
				if (w.currentMag > 0 || w.reserveAmmo > 0) {
					this.selectWeapon(idx);
					(this.eng as any).emitJuice(`floater`, { x: this.eng.player.x, y: this.eng.player.y - 48, text: `${cur.name.split(" ").pop()} DRY`, color: `#e11d2e` }); // Batch 16 (Lane 2): juice event
					this.eng.callbacks.onRadio?.("Unknown", `${cur.name} is dry. ${w.name}.`);
					return true;
				}
			}
			(this.eng as any).emitJuice(`floater`, { x: this.eng.player.x, y: this.eng.player.y - 44, text: `EMPTY`, color: `#e11d2e` }); // Batch 16 (Lane 2): juice event
			return false;
		}

		throwMolotov() {
			if (this.eng.player.molotovs <= 0) return;
			this.eng.player.molotovs--;
			let e = {
				id: Math.random().toString(),
				x: this.eng.player.x,
				y: this.eng.player.y,
				vx: Math.cos(this.eng.player.angle) * 11,
				vy: Math.sin(this.eng.player.angle) * 11,
				damage: 150,
				pierce: 1,
				rangeRemaining: 340,
				weaponType: `molotov`,
				isMolotov: true,
				radius: 6,
				color: `#f59e0b`
			};
			this.eng.bullets.push(Object.assign((this.eng as any).allocBullet(), e)), soundEngine.playGunshot(`molotov`), (this.eng as any).alertZombies(this.eng.player.x, this.eng.player.y, 360); // CONTEXT-GAP: allocBullet, alertZombies
		}

		throwFlare() {
			if (this.eng.player.flares <= 0 || this.eng.isPaused) return false;
			this.eng.player.flares--;
			this.eng.bullets.push(Object.assign((this.eng as any).allocBullet(), { // CONTEXT-GAP: allocBullet
				id: Math.random().toString(),
				x: this.eng.player.x + Math.cos(this.eng.player.angle) * 22,
				y: this.eng.player.y + Math.sin(this.eng.player.angle) * 22,
				vx: Math.cos(this.eng.player.angle) * 9.2,
				vy: Math.sin(this.eng.player.angle) * 9.2,
				damage: 0,
				pierce: 1,
				rangeRemaining: 260,
				weaponType: `revolver`,
				isFlare: true,
				radius: 5,
				color: `#f6c453`
			}));
			soundEngine.playGunshot(`carbine`);
			(this.eng as any).emitJuice(`floater`, { x: this.eng.player.x, y: this.eng.player.y - 36, text: `FLARE`, color: `#f6c453` }); // Batch 16 (Lane 2): juice event
			return true;
		}

		plantFlare(x: any, y: any) {
			this.eng.flares.push({ x, y, until: this.eng.simTime + 9, born: this.eng.simTime });
			(this.eng as any).alertZombies(x, y, 560); // CONTEXT-GAP: alertZombies
			(this.eng as any).emitJuice(`floater`, { x, y: y - 18, text: `THEY HEAR IT`, color: `#f6c453` }); // Batch 16 (Lane 2): juice event
			soundEngine.playBottleShatter();
			for (let i = 0; i < 10; i++) {
				const a = Math.random() * Math.PI * 2;
				this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
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

		nearestTarget(range: any) {
			let best = null, bd = range;
			for (const z of this.eng.zombies) {
				if (z.health <= 0) continue;
				const d = Math.hypot(z.x - this.eng.player.x, z.y - this.eng.player.y);
				if (d < bd) {
					bd = d;
					best = z;
				}
			}
			return best;
		}

		fireCurrentWeapon() {
			try {
			let e = this.eng.weapons[this.eng.currentWeaponIndex];
			(this.eng as any).hasPowerup(`infinite_ammo`) || e.currentMag--; // CONTEXT-GAP: hasPowerup
			this.eng.stats.shotsFired++;
			this.eng.muzzleFlashTimer = e.id === `shotgun` ? 1.4 : e.id === `crossbow` ? .35 : 1;
			// Batch 5: on-shoot micro-layer — additive muzzle flash (~50ms),
			// gun kickback 4-6px (40ms yoyo), camera punch 2-4px (60ms).
			this.eng.muzzlePunch = .05;
			this.eng.gunKick = 4 + Math.random() * 2;
			this.eng.gunKickT = .04;
			{
				const pa = this.eng.player.angle, pd = 2 + Math.random() * 2;
				this.eng.camPunchT = .06;
				this.eng.camPunchX = -Math.cos(pa) * pd;
				this.eng.camPunchY = -Math.sin(pa) * pd;
			}
			(this.eng as any).addLight(this.eng.player.x + Math.cos(this.eng.player.angle) * 30, this.eng.player.y + Math.sin(this.eng.player.angle) * 30, 340, .9, .12); // CONTEXT-GAP: addLight
			this.eng.recoilKick = Math.max(this.eng.recoilKick, e.id === `shotgun` ? 12 : e.id === `lever_rifle` ? 9 : e.id === `chainsaw` ? 4 : e.id === `carbine` ? 3.5 : 7);
			if (e.id === `shotgun`) this.eng.pumpAnim = 10;
			// Batch 3: shell casings + heavy self-knockback — guns feel mechanical.
			{
				const ca = this.eng.player.angle + Math.PI / 2 + (Math.random() - .5) * .6;
				this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
					x: this.eng.player.x, y: this.eng.player.y - 8,
					vx: Math.cos(ca) * (2 + Math.random() * 2), vy: Math.sin(ca) * (2 + Math.random() * 2) - 1,
					size: 2.5, color: `#fbbf24`, alpha: 1, life: .7, maxLife: .7, type: `casing`
				}));
				const shove = e.id === `shotgun` ? 11 : e.id === `lever_rifle` ? 7 : e.id === `revolver` ? 4 : 0;
				if (shove > 0) {
					this.eng.moveVX -= Math.cos(this.eng.player.angle) * shove;
					this.eng.moveVY -= Math.sin(this.eng.player.angle) * shove;
				}
			}
			soundEngine.playShotFor(soundEngine.kindForWeapon(e));
			const hear = (this.eng as any).weaponHearRadius(e.id) * (this.eng.player.isSneaking ? 0.28 : 1); // CONTEXT-GAP: weaponHearRadius
			if (hear > 0) (this.eng as any).alertZombies(this.eng.player.x, this.eng.player.y, hear); // CONTEXT-GAP: alertZombies
			if (e.id === `shotgun`) this.eng.screenShake = 10 * (this.eng as any).tune('shake') * (this.eng as any).motionScale(); // CONTEXT-GAP: tune, motionScale
			else if (e.id === `lever_rifle`) this.eng.screenShake = 6 * (this.eng as any).tune('shake') * (this.eng as any).motionScale(); // CONTEXT-GAP: tune, motionScale
			else if (e.id === `revolver`) this.eng.screenShake = 5.5 * (this.eng as any).tune('shake') * (this.eng as any).motionScale(); // CONTEXT-GAP: tune, motionScale
			else if (e.id === `carbine`) this.eng.screenShake = 1.6 * (this.eng as any).tune('shake') * (this.eng as any).motionScale(); // CONTEXT-GAP: tune, motionScale
			else if (e.id === `chainsaw`) this.eng.screenShake = 2 * (this.eng as any).tune('shake') * (this.eng as any).motionScale(); // CONTEXT-GAP: tune, motionScale
			else this.eng.screenShake = 2.5 * (this.eng as any).tune('shake') * (this.eng as any).motionScale(); // CONTEXT-GAP: tune, motionScale
			if (e.id === `shotgun` || e.id === `revolver` || e.id === `lever_rifle`) this.eng.hitstop = Math.max(this.eng.hitstop, (e.id === `shotgun` ? .04 : .02) * (this.eng as any).tune('hitstop')); // CONTEXT-GAP: tune
			const dmgMul = (1 + (this.eng as any).getPerkLevel(`hollowpoint`) * .2) * this.eng.bpDamageMul * (this.eng.evolved === `lincoln` && e.id === `revolver` ? 1.35 : 1) * (this.eng.simTime < this.eng.freshUntil ? 1.45 : 1) * (this.eng.simTime < this.eng.bountyBoostUntil ? 1.18 : 1); // Batch 9: lead lives in playerDamageMul now (affinity-gated). // CONTEXT-GAP: getPerkLevel
			const choke = (this.eng as any).getPerkLevel(`choke`); // CONTEXT-GAP: getPerkLevel
			if (e.id === `chainsaw`) {
				this.eng.hitstop = Math.max(this.eng.hitstop, (.03) * (this.eng as any).tune('hitstop')); // CONTEXT-GAP: tune
				const ax = Math.cos(this.eng.player.angle);
				const ay = Math.sin(this.eng.player.angle);
				for (const z of this.eng.zombies) {
					const dx = z.x - this.eng.player.x, dy = z.y - this.eng.player.y;
					if (Math.hypot(dx, dy) > 70 + z.radius) continue;
					if (dx * ax + dy * ay < 6) continue;
					if (Math.abs(dx * -ay + dy * ax) > 38) continue;
					z.health -= e.damage * dmgMul;
					// Batch 11 (Lane 1): thorned elites bite back against the saw.
					(this.eng as any).thornedReflect(z, e.damage * dmgMul); // CONTEXT-GAP: thornedReflect
					z.hitFlash = .2;
					z.x += ax * 8;
					z.y += ay * 8;
					this.eng.stats.damageDealt += e.damage;
					(this.eng as any).emitJuice(`bloodParticles`, { x: z.x, y: z.y, angle: this.eng.player.angle }); // Batch 16 (Lane 2): juice event
				}
				for (let i = 0; i < 6; i++) this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
					x: this.eng.player.x + ax * 28,
					y: this.eng.player.y + ay * 28,
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
			// Batch 10 (Lane 1): Stendal Pit Mortar — lobbed shells at the densest
			// nearby cluster, not aimed shots. Shells detonate 0.8s after launch.
			if (e.id === `mortar`) {
				this.fireMortar(e, dmgMul);
				if (e.currentMag === 0) this.reloadCurrentWeapon();
				return;
			}
			// Batch 11 (Lane 1): White River Arc Lance — locks the densest nearby
			// cluster and sweeps it with heat ticks; the beam re-acquires every tick.
			if (e.id === `arc_lance`) {
				this.fireArcLance(e, dmgMul);
				if (e.currentMag === 0) this.reloadCurrentWeapon();
				return;
			}
			// Batch 12 (Lane 1): Dugger Torch — short cone, direct damage plus
			// burn stacks.
			if (e.id === `flamethrower`) {
				this.fireFlamethrower(e, dmgMul);
				if (e.currentMag === 0) this.reloadCurrentWeapon();
				return;
			}
			// Batch 12 (Lane 1): Merom Railgun — trigger starts the charge; the
			// beam fires when the wind-up completes.
			if (e.id === `railgun`) {
				this.fireRailgun(e, dmgMul);
				if (e.currentMag === 0) this.reloadCurrentWeapon();
				return;
			}
			const reach = (this.eng as any).aimReach(); // CONTEXT-GAP: aimReach
			const longGun = e.id !== `shotgun` && e.id !== `chainsaw`;
			const shotRange = longGun ? Math.max(e.range, reach * 0.9) : e.range;
			const spread = e.id === `shotgun` ? Math.max(.16, .34 - choke * .05) : e.spread;
			const count = e.id === `shotgun` ? e.pellets + choke * 2 : e.pellets;
			const origin = e.id === `shotgun` ? 34 : e.id === `lever_rifle` ? 38 : 24;
			for (let n = 0; n < count; n++) {
				const jitter = (Math.random() - .5) * spread;
				const ang = this.eng.player.angle + jitter;
				// Batch 10 (Lane 4): Tracer Rounds — affinity-gated weapon mod:
				// +1 pierce/rank and +15% travel speed/rank on linked weapons.
				const tracerRank = ((this.eng as any).boon(`tracer`) > 0 && supportApplies(`tracer`, e.id)) ? (this.eng as any).boon(`tracer`) : 0; // CONTEXT-GAP: boon
				const spd = e.bulletSpeed * (.92 + Math.random() * .14) * tracerSpeedMul(tracerRank);
				this.eng.bullets.push(Object.assign((this.eng as any).allocBullet(), { // CONTEXT-GAP: allocBullet
					id: Math.random().toString(),
					x: this.eng.player.x + Math.cos(this.eng.player.angle) * origin,
					y: this.eng.player.y + Math.sin(this.eng.player.angle) * origin,
					vx: Math.cos(ang) * spd,
					vy: Math.sin(ang) * spd,
					damage: e.damage * dmgMul,
					critChance: this.eng.stillHeartUntil > this.eng.simTime ? 1 : (e.critChance ?? 0), // Batch 10 (Lane 1): Still Heart — guaranteed crits.
					pierce: (e.id === `revolver` && this.eng.evolved === `lincoln` ? Math.max(e.pierce, 4) : e.pierce) + tracerPierceBonus(tracerRank),
					rangeRemaining: e.id === `shotgun` ? shotRange * (.55 + Math.random() * .35) : shotRange,
					weaponType: e.id,
					isCrossbowBolt: e.id === `crossbow`,
					radius: e.id === `shotgun` ? 4.4 : e.id === `revolver` ? 4.2 : e.id === `carbine` ? 2.2 : e.id === `crossbow` ? 4 : 3.2,
					color: e.id === `shotgun` ? `#fdba74` : e.id === `revolver` ? `#fbbf24` : e.id === `lever_rifle` ? `#fefce8` : e.id === `carbine` ? `#fde047` : e.id === `crossbow` ? `#e2e8f0` : `#fef08a`
				}));
			}
			if (e.currentMag === 0 && e.id !== `chainsaw` && !(this.eng as any).hasPowerup(`infinite_ammo`)) (this.eng as any).fanTheCylinder(); // CONTEXT-GAP: hasPowerup, fanTheCylinder
			if (e.id === `shotgun`) {
				const ax = Math.cos(this.eng.player.angle), ay = Math.sin(this.eng.player.angle);
				for (let i = 0; i < 14; i++) {
					const j = (Math.random() - .5) * .7;
					this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
						x: this.eng.player.x + ax * 30,
						y: this.eng.player.y + ay * 30,
						vx: Math.cos(this.eng.player.angle + j) * (1.2 + Math.random() * 2.4),
						vy: Math.sin(this.eng.player.angle + j) * (1.2 + Math.random() * 2.4),
						size: 3 + Math.random() * 4,
						color: "rgba(180, 140, 80, 0.7)",
						alpha: .7,
						life: .22 + Math.random() * .18,
						maxLife: .4,
						type: "dust"
					}));
				}
			}
			this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
				x: this.eng.player.x,
				y: this.eng.player.y,
				vx: Math.cos(this.eng.player.angle - Math.PI / 2) * (2 + Math.random() * 2),
				vy: Math.sin(this.eng.player.angle - Math.PI / 2) * (2 + Math.random() * 2),
				size: e.id === `shotgun` ? 4 : 2.5,
				color: e.id === `shotgun` ? `#a16207` : `#eab308`,
				alpha: 1,
				life: .6,
				maxLife: .6,
				type: `shell`
			}));
			if (e.currentMag === 0) this.reloadCurrentWeapon();
			} finally { (this.eng as any).drainJuiceEvents(); } // Batch 16 (Lane 2): drain juice queue — idempotent; keeps probe paths synchronous
		}

		updateBullets(e: any, t: any) {
			// Batch 16 (Lane 2): structured collision — collect contacts first,
			// resolve once, in a defined order. Phase 1 moves every projectile
			// and handles non-zombie contacts (obstacles, barrels, expiry);
			// Phase 2 gathers swept-segment contact pairs without mutation;
			// Phase 3 resolves them by projectile array order, then t ascending.
			const segs: any[] = [];
			for (let t = this.eng.bullets.length - 1; t >= 0; t--) {
				let n = this.eng.bullets[t], r = e * 60;
				const ox = n.x, oy = n.y;
				// Batch 4: canary missiles — slow, heavy, limited turn rate toward the nearest dead man.
				if (n.isMissile) {
					const tgt = this.nearestZombie(n.x, n.y, 620);
					if (tgt) {
						const want = Math.atan2(tgt.y - n.y, tgt.x - n.x);
						const cur = Math.atan2(n.vy, n.vx);
						const turn = (n.missileTurn || 2.4) * e;
						let d = (this.eng as any).normalizeAngle(want - cur); // CONTEXT-GAP: normalizeAngle
						d = Math.max(-turn, Math.min(turn, d));
						const sp = Math.hypot(n.vx, n.vy) || 5;
						n.vx = Math.cos(cur + d) * sp; n.vy = Math.sin(cur + d) * sp;
					}
					if ((this.eng._simFrames & 1) === 0) this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
						x: n.x - n.vx * .02, y: n.y - n.vy * .02,
						vx: (Math.random() - .5) * 1.5, vy: (Math.random() - .5) * 1.5,
						size: 3, color: `#fb923c`, alpha: .8, life: .3, maxLife: .3, type: `smoke`
					}));
				}
				// Batch 10 (Lane 1): mortar shells arc over the fight — the fuse ticks,
				// then the shell blooms where it lands. No collisions on the way up.
				if (n.isMortar) {
					n.mortarFuse -= e;
					n.x += n.vx * r; n.y += n.vy * r;
					if ((this.eng._simFrames & 1) === 0) this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
						x: n.x, y: n.y, vx: (Math.random() - .5) * 1.2, vy: (Math.random() - .5) * 1.2,
						size: 3, color: `#9ca3af`, alpha: .7, life: .35, maxLife: .35, type: `smoke`
					}));
					if (n.mortarFuse <= 0) { this.detonateMortarShell(n); (this.eng as any).freeBulletAt(t); } // CONTEXT-GAP: freeBulletAt
					continue;
				}
				// Batch 2: heatseeker — rounds curve toward the nearest dead man.
				// Batch 9: affinity-gated — only linked weapons' rounds hunt.
				if ((this.eng as any).boon(`seeker`) > 0 && supportApplies(`seeker`, n.weaponType) && !n.isFlare && !n.isMolotov && !n.isSplinter && !n.isMissile) { // CONTEXT-GAP: boon
					const tgt = this.nearestZombie(n.x, n.y, 300);
					if (tgt) {
						const want = Math.atan2(tgt.y - n.y, tgt.x - n.x);
						const cur = Math.atan2(n.vy, n.vx);
						const turn = 3.2 * e;
						let d = (this.eng as any).normalizeAngle(want - cur); // CONTEXT-GAP: normalizeAngle
						d = Math.max(-turn, Math.min(turn, d));
						const sp = Math.hypot(n.vx, n.vy) || 400;
						n.vx = Math.cos(cur + d) * sp; n.vy = Math.sin(cur + d) * sp;
					}
				}
				n.x += n.vx * r;
				n.y += n.vy * r;
				n.rangeRemaining -= Math.hypot(n.vx, n.vy) * r;
				const mx = ox + (n.x - ox) * 0.5, my = oy + (n.y - oy) * 0.5;
				if ((this.eng as any).checkObstacleCollision(n.x, n.y, n.radius, false) || (this.eng as any).checkObstacleCollision(mx, my, n.radius, false)) { // CONTEXT-GAP: checkObstacleCollision
					n.isFlare ? this.plantFlare(n.x, n.y) : (this.eng as any).createHitSparks(n.x, n.y, `#f59e0b`); // CONTEXT-GAP: createHitSparks
					(this.eng as any).freeBulletAt(t); // CONTEXT-GAP: freeBulletAt
					continue;
				}
				let i = false;
				for (let e = this.eng.explosiveBarrels.length - 1; e >= 0; e--) {
					let r = this.eng.explosiveBarrels[e];
					// Batch 4: swept barrel test — fast rounds can't skip barrels either.
					if ((this.eng as any).segmentHitsCircle(ox, oy, n.x, n.y, n.radius, r.x, r.y, r.radius)) { // CONTEXT-GAP: segmentHitsCircle
						if (n.isFlare) {
							this.plantFlare(n.x, n.y);
							(this.eng as any).freeBulletAt(t); // CONTEXT-GAP: freeBulletAt
							i = true;
							break;
						}
						if (n.isMissile) {
							(this.eng as any).detonateMissile(n); // CONTEXT-GAP: detonateMissile
							(this.eng as any).freeBulletAt(t); // CONTEXT-GAP: freeBulletAt
							i = true;
							break;
						}
						r.health -= n.damage, (this.eng as any).createHitSparks(n.x, n.y, `#ef4444`), soundEngine.playZombieHit(false), r.health <= 0 && this.detonateExplosiveBarrel(r, e), (this.eng as any).freeBulletAt(t), i = true; // CONTEXT-GAP: createHitSparks, freeBulletAt
						break;
					}
				}
				if (!i) {
					if (n.isMolotov && n.rangeRemaining <= 0) {
						this.detonateMolotov(n.x, n.y), (this.eng as any).freeBulletAt(t); // CONTEXT-GAP: freeBulletAt
						continue;
					}
					if (n.isFlare && n.rangeRemaining <= 0) {
						this.plantFlare(n.x, n.y), (this.eng as any).freeBulletAt(t); // CONTEXT-GAP: freeBulletAt
						continue;
					}
					if (n.rangeRemaining <= 0) {
						if (n.isMissile) (this.eng as any).detonateMissile(n); // CONTEXT-GAP: detonateMissile
						(this.eng as any).freeBulletAt(t); // CONTEXT-GAP: freeBulletAt
						continue;
					}
					if (n.lastHitCd > 0) n.lastHitCd -= e;
					segs.push({ n, ox, oy });
				}
			}
			// Phase 2 — collect contacts. No game-state mutation here.
			segs.reverse(); // restore projectile creation (array) order
			const contacts: any[] = [];
			for (let s = 0; s < segs.length; s++) {
				const sg = segs[s], n = sg.n, ox = sg.ox, oy = sg.oy;
				const bq = (this.eng as any).queryZombies((ox + n.x) / 2, (oy + n.y) / 2, Math.hypot(n.x - ox, n.y - oy) / 2 + this.eng.zhashMaxR + n.radius, []); // CONTEXT-GAP: queryZombies
				for (const qi of bq) {
					const z = this.eng.zombies[qi];
					if (!z) continue;
					if (z === n.lastHit && n.lastHitCd > 0) continue;
					if (!(this.eng as any).segmentHitsCircle(ox, oy, n.x, n.y, n.radius, z.x, z.y, z.radius)) continue; // CONTEXT-GAP: segmentHitsCircle
					contacts.push({ n, z, t: this.segT(ox, oy, n.x, n.y, z.x, z.y), order: s });
				}
			}
			contacts.sort((a: any, b: any) => a.order - b.order || a.t - b.t);
			// Phase 3 — resolve pairs in the defined deterministic order.
			const spent = new Set<any>(), done = new Set<any>();
			for (const c of contacts) {
				const n = c.n, z = c.z;
				if (spent.has(n) || done.has(n)) continue;
				if (!this.eng.zombies.includes(z) || z.health <= 0) continue;
				if (z === n.lastHit && n.lastHitCd > 0) continue;
				if (n.isFlare) {
					this.plantFlare(n.x, n.y);
					spent.add(n); done.add(n);
					continue;
				}
				if (n.isMissile) {
					(this.eng as any).detonateMissile(n); // CONTEXT-GAP: detonateMissile
					spent.add(n); done.add(n);
					continue;
				}
				this.resolveBulletHit(n, z);
				n.pierce--;
				if (n.pierce <= 0) {
					done.add(n);
					if (!this.tryRicochet(n, z)) spent.add(n);
				}
			}
			for (let t = this.eng.bullets.length - 1; t >= 0; t--) {
				if (spent.has(this.eng.bullets[t])) (this.eng as any).freeBulletAt(t); // CONTEXT-GAP: freeBulletAt
			}
			(this.eng as any).drainJuiceEvents(); // Batch 16 (Lane 2): drain juice queue
		}

		// Batch 16 (Lane 2): along-segment parameter of the closest approach
		// to (zx, zy), clamped to [0,1]. Orders collected contacts only —
		// the swept hit test itself is unchanged.
		segT(ox: any, oy: any, nx: any, ny: any, zx: any, zy: any) {
			const dx = nx - ox, dy = ny - oy;
			const len2 = dx * dx + dy * dy;
			if (len2 <= 0) return 0;
			const t = ((zx - ox) * dx + (zy - oy) * dy) / len2;
			return t < 0 ? 0 : t > 1 ? 1 : t;
		}

		// Batch 16 (Lane 2): resolve one collected projectile-vs-zombie
		// contact. Applies EXACTLY the legacy on-hit effects — damage math,
		// falloff, affinities, crit, knockback and juice are untouched.
		resolveBulletHit(n: any, z: any) {
			this.eng.stats.shotsHit++;
			const head = this.checkHeadshot(n, z);
			let dmg = n.damage;
			// Batch 6: per-instance damage flash (Lane B) + per-weapon crit
			// (evolved signature bonus). No crit stacking with headshots.
			registerZombieHit(this.eng.zombies.indexOf(z));
			if (!head && (n.critChance || 0) > 0 && Math.random() < n.critChance) {
				dmg *= 2;
				(this.eng as any).emitJuice(`floater`, { x: z.x, y: z.y - z.radius, text: `CRIT`, color: `#fef08a` }); // Batch 16 (Lane 2): juice event
				soundEngine.playZombieHit(true);
			}
			if ((this.eng as any).hasPowerup(`insta_kill`)) { // CONTEXT-GAP: hasPowerup
				dmg = 99999;
			} else if (head) {
				if (z.hasHelmet) {
					z.hasHelmet = false;
					(this.eng as any).createHitSparks(z.x, z.y, `#eab308`); // CONTEXT-GAP: createHitSparks
					soundEngine.playZombieHit(false);
					dmg *= .6;
				} else {
					dmg *= 2.4 * (this.eng.runHeadshotMul || 1);
					this.eng.stats.headshots++;
					(this.eng as any).bumpLifetime(`headshots`); // CONTEXT-GAP: bumpLifetime
					soundEngine.playZombieHit(true);
				}
			} else {
				soundEngine.playZombieHit(false);
			}
			dmg *= (this.eng as any).playerDamageMul(z, n.weaponType); // CONTEXT-GAP: playerDamageMul
			dmg = (this.eng as any).applyAffixDefense(z, dmg); // CONTEXT-GAP: applyAffixDefense
			z.health -= dmg;
			this.eng.stats.damageDealt += dmg;
			this.applyCopperhead(z, n.weaponType);
			if (!n.isSplinter && z.health > 0 && z.health <= z.maxHealth * .2 && z.type !== `behemoth` && z.type !== `old_ben` && z.type !== `miner_brute`) z.health = 0;
			if (head) (this.eng as any).tickBounty(`head`); // CONTEXT-GAP: tickBounty
			if (z.health <= 0 && !n.isSplinter) z.shatter = true;
			if (this.eng.evolved === `lincoln` && n.weaponType === `revolver` && head) this.eng.player.health = Math.min(this.eng.player.maxHealth, this.eng.player.health + 4);
			const a = Math.atan2(n.vy, n.vx), o = (this.eng as any).knockbackFor(n.weaponType, z.type); // CONTEXT-GAP: knockbackFor
			this.spawnForkChildren(n, a);
			// Batch 5: hit-track for the kill spray + slash streak + body reaction.
			z.lastHitPower = dmg; z.lastHitAngle = a;
			(this.eng as any).addSlash(n.x, n.y, a); // CONTEXT-GAP: addSlash
			(this.eng as any).reactHit(z, dmg, a); // CONTEXT-GAP: reactHit
			z.x += Math.cos(a) * o;
			z.y += Math.sin(a) * o;
			(this.eng as any).emitJuice(`bloodParticles`, { x: n.x, y: n.y, angle: a }); // Batch 16 (Lane 2): juice event
			z.hitFlash = .08;
			if (head) (this.eng as any).emitJuice(`floater`, { x: z.x, y: z.y - z.radius, text: `HEAD`, color: `#ff4d3a` }); // Batch 16 (Lane 2): juice event
			else (this.eng as any).emitJuice(`damageNumber`, { x: z.x, y: z.y - z.radius, amount: dmg, color: `#e8b34b` }); // Batch 16 (Lane 2): juice event
			soundEngine.playImpact();
			(this.eng as any).feelHit(n, z); // CONTEXT-GAP: feelHit
			if (dmg > 80) this.eng.hitstop = Math.max(this.eng.hitstop, (.04) * (this.eng as any).tune('hitstop')); // CONTEXT-GAP: tune
		}

		checkHeadshot(e: any, t: any) {
			let n = Math.atan2(e.y - t.y, e.x - t.x);
			return Math.abs((this.eng as any).normalizeAngle(n - t.angle)) < .7; // CONTEXT-GAP: normalizeAngle
		}

		detonateMolotov(e: any, t: any) {
			let n = 95 * (1 + (this.eng as any).getPerkLevel(`moonshiner`) * .4), r = 6e3 + (this.eng as any).getPerkLevel(`moonshiner`) * 2500; // CONTEXT-GAP: getPerkLevel
			this.eng.firePuddles.push({
				id: Math.random().toString(),
				x: e,
				y: t,
				radius: n,
				duration: r,
				createdTime: Date.now()
			}), this.eng.screenShake = 5 * (this.eng as any).tune('shake') * (this.eng as any).motionScale(), this.eng.trauma = Math.min(1, this.eng.trauma + .25 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()), soundEngine.playBottleShatter(), (this.eng as any).addLight(e, t, 380, .95, .4), (this.eng as any).alertZombies(e, t, 380); // CONTEXT-GAP: tune, motionScale, addLight, alertZombies
			for (let r of this.eng.zombies) Math.hypot(r.x - e, r.y - t) <= n && (r.health -= 120, r.isBurning = 4e3);
		}

		detonateExplosiveBarrel(e: any, t: any) {
			(this.eng as any).emitNoise(e.x, e.y, 500), // CONTEXT-GAP: emitNoise
			(this.eng as any).addLight(e.x, e.y, 420, 1, .5), // CONTEXT-GAP: addLight
			this.eng.explosiveBarrels.splice(t, 1), this.eng.screenShake = 10 * (this.eng as any).tune('shake') * (this.eng as any).motionScale(), this.eng.trauma = Math.min(1, this.eng.trauma + .55 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()), soundEngine.playBarrelExplosion(), (this.eng as any).emitJuice(`scorch`, { x: e.x, y: e.y, radius: 90 }), (this.eng as any).alertZombies(e.x, e.y, 700), this.eng.firePuddles.push({ // CONTEXT-GAP: tune, motionScale, addScorch, alertZombies
				id: Math.random().toString(),
				x: e.x,
				y: e.y,
				radius: 105,
				duration: 5e3,
				createdTime: Date.now()
			});
			for (let t = 0; t < 35; t++) {
				let t = Math.random() * Math.PI * 2, n = 2 + Math.random() * 6;
				this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
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
			for (let t = this.eng.zombies.length - 1; t >= 0; t--) {
				let n = this.eng.zombies[t], r = Math.hypot(n.x - e.x, n.y - e.y);
				if (r <= 140) {
					let i = 1 - r / 140, a = 350 * (.4 + i * .6) * brineExplosionMul((this.eng as any).boon(`brinebarrel`)); // Batch 10 (Lane 4): brine boosts barrel blasts. // CONTEXT-GAP: boon
					n.health -= a, n.isBurning = 4e3;
					let o = Math.atan2(n.y - e.y, n.x - e.x);
					n.x += 18 * i * Math.cos(o), n.y += 18 * i * Math.sin(o), this.eng.stats.damageDealt += a, this.eng.beastDmgAcc = (this.eng.beastDmgAcc || 0) + a, (this.eng as any).emitJuice(`bloodParticles`, { x: n.x, y: n.y, angle: o }), n.lastHitPower = a, n.lastHitAngle = o, n.chewAggroT = this.eng.simTime + 3, n.health <= 0 && (this.eng as any).killZombie(n, t); // CONTEXT-GAP: createBloodParticles, killZombie
				}
			}
			(this.eng as any).spawnBrinePatch(e.x, e.y); // Batch 10 (Lane 4): brine leaves a burning patch at the blast center. // CONTEXT-GAP: spawnBrinePatch
			let n = Math.hypot(this.eng.player.x - e.x, this.eng.player.y - e.y);
			if (n <= 140) {
				let e = 1 - n / 140;
				(this.eng as any).damagePlayer(Math.round(45 * e)); // CONTEXT-GAP: damagePlayer
			}
			for (let t = this.eng.explosiveBarrels.length - 1; t >= 0; t--) {
				let n = this.eng.explosiveBarrels[t];
				Math.hypot(n.x - e.x, n.y - e.y) <= 140 && (n.health -= 250, n.health <= 0 && setTimeout(() => {
					let e = this.eng.explosiveBarrels.indexOf(n);
					e !== -1 && this.detonateExplosiveBarrel(n, e);
				}, 120));
			}
		}

		updateFirePuddles(e: any) {
			for (let t = this.eng.firePuddles.length - 1; t >= 0; t--) {
				let n = this.eng.firePuddles[t];
				if (e - n.createdTime >= n.duration) {
					this.eng.firePuddles.splice(t, 1);
					continue;
				}
				// Batch 10 (Lane 4): brine patches burn at their dps rate (per 1/60 tick); classic puddles keep the flat tick.
				for (let e of this.eng.zombies) Math.hypot(e.x - n.x, e.y - n.y) <= n.radius && (e.health -= n.dps ? n.dps / 60 : .9, e.isBurning = 3e3);
				// Batch 10 (Lane 4): brine is the player's own brew — it never burns the player.
				!n.isBrine && Math.hypot(this.eng.player.x - n.x, this.eng.player.y - n.y) <= n.radius && (this.eng as any).damagePlayer(.3); // CONTEXT-GAP: damagePlayer
			}
		}

		updateAcidSpits(e: any) {
			for (let t = this.eng.acidSpits.length - 1; t >= 0; t--) {
				let n = this.eng.acidSpits[t], r = e * 60;
				if (n.x += n.vx * r, n.y += n.vy * r, n.remainingDistance -= Math.hypot(n.vx, n.vy) * r, Math.hypot(this.eng.player.x - n.x, this.eng.player.y - n.y) <= this.eng.player.radius + n.radius) {
					(this.eng as any).damagePlayer(n.damage), (this.eng as any).createHitSparks(n.x, n.y, `#84cc16`), this.eng.acidSpits.splice(t, 1); // CONTEXT-GAP: damagePlayer, createHitSparks
					continue;
				}
				(n.remainingDistance <= 0 || (this.eng as any).checkObstacleCollision(n.x, n.y, n.radius)) && ((this.eng as any).createHitSparks(n.x, n.y, `#84cc16`), this.eng.acidSpits.splice(t, 1)); // CONTEXT-GAP: checkObstacleCollision, createHitSparks
			}
		}

		// Batch 12 (Lane 1): flamethrower config from the weapon row —
		// dmg = direct damage, cnt = burn stacks applied, rad = cone length,
		// spd = cone half-angle (degrees), cd = refire.
		flameCfg(w: any) {
			const lv = statsForLevel(`flamethrower`, w?.upgradeLevel ?? 1);
			return {
				dmg: w?.damage ?? lv?.dmg ?? 18,
				stacks: Math.max(1, Math.round(w?.pellets ?? lv?.cnt ?? 1)),
				range: Math.max(1, w?.range ?? lv?.rad ?? 260),
				halfRad: ((w?.bulletSpeed ?? lv?.spd ?? 28) * Math.PI) / 180,
			};
		}

		fireFlamethrower(w: any, dmgMul: any) {
			const cfg = this.flameCfg(w);
			const ax = Math.cos(this.eng.player.angle), ay = Math.sin(this.eng.player.angle);
			let hits = 0;
			for (const z of this.eng.zombies) {
				if (z.health <= 0) continue;
				const dx = z.x - this.eng.player.x, dy = z.y - this.eng.player.y;
				const d = Math.hypot(dx, dy);
				if (d > cfg.range + z.radius) continue;
				const along = dx * ax + dy * ay;
				if (along < 0) continue;
				if (Math.abs(dx * -ay + dy * ax) > Math.tan(cfg.halfRad) * along + z.radius) continue;
				const dealt = (this.eng as any).applyAffixDefense(z, cfg.dmg * dmgMul); // CONTEXT-GAP: applyAffixDefense
				z.health -= dealt;
				z.hitFlash = Math.max(z.hitFlash, .15);
				z.burnTick = Math.min(BURN_MAX_STACKS, (z.burnTick || 0) + cfg.stacks);
				z.isBurning = BURN_REFRESH_MS;
				(this.eng as any).thornedReflect(z, cfg.dmg * dmgMul); // CONTEXT-GAP: thornedReflect
				this.eng.stats.damageDealt += dealt;
				(this.eng as any).emitJuice(`bloodParticles`, { x: z.x, y: z.y, angle: this.eng.player.angle }); // Batch 16 (Lane 2): juice event
				hits++;
				if (z.health <= 0) (this.eng as any).killZombie(z, this.eng.zombies.indexOf(z)); // CONTEXT-GAP: killZombie
			}
			// Flame wash: short-lived orange tongues down the cone.
			for (let i = 0; i < 10; i++) {
				const ja = (Math.random() - .5) * cfg.halfRad * 2;
				const sp = 4 + Math.random() * 9;
				this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
					x: this.eng.player.x + Math.cos(this.eng.player.angle) * 26,
					y: this.eng.player.y + Math.sin(this.eng.player.angle) * 26,
					vx: Math.cos(this.eng.player.angle + ja) * sp,
					vy: Math.sin(this.eng.player.angle + ja) * sp,
					size: 5 + Math.random() * 6,
					color: Math.random() < .5 ? `#fb923c` : `#f97316`,
					alpha: .85,
					life: .22 + Math.random() * .14,
					maxLife: .36,
					type: `flame`
				}));
			}
			(this.eng as any).addLight(this.eng.player.x + ax * 120, this.eng.player.y + ay * 120, 300, .85, .35); // CONTEXT-GAP: addLight
			this.eng.stats.shotsFired++;
			this.eng.lastFlame = { hits, stacks: cfg.stacks };
			soundEngine.tone({ f: 220, f2: 90, type: `sawtooth`, dur: .18, vol: .16 });
			(this.eng as any).alertZombies(this.eng.player.x, this.eng.player.y, 260); // CONTEXT-GAP: alertZombies
		}

		fireRailgun(w: any, dmgMul: any) {
			// Pulling the trigger while a charge is already winding wastes the
			// round fireCurrentWeapon just decremented — refund it.
			if (this.eng.railCharging) { w.currentMag++; this.eng.stats.shotsFired--; return; }
			const cfg = (this.eng as any).railCfg(w); // CONTEXT-GAP: railCfg
			this.eng.railCharging = true;
			this.eng.railChargeT = cfg.chargeSec;
			this.eng.railChargeDmg = w.damage * dmgMul;
			this.eng.railChargeW = w;
			(this.eng as any).emitJuice(`floater`, { x: this.eng.player.x, y: this.eng.player.y - 56, text: `RAILGUN CHARGING`, color: `#7dd3fc` }); // Batch 16 (Lane 2): juice event
			soundEngine.tone({ f: 120, f2: 900, type: `sawtooth`, dur: cfg.chargeSec, vol: .2 });
		}

		// Batch 12 (Lane 1): Copperhead Rounds — bullet hits stack a bleeding
		// poison on the zombie (tag-gated to rapid+precise weapons). Each stack
		// ticks copperheadPoisonDps for copperheadDurationSec seconds.
		applyCopperhead(z: any, weaponId: any) {
			const rank = (this.eng as any).boon(`copperhead`); // CONTEXT-GAP: boon
			if (rank <= 0 || !copperheadApplies(this.eng.boonStacks, weaponId || ``)) return;
			const cur = this.eng.poison.get(z);
			const stacks = Math.min(copperheadMaxStacks(rank), (cur ? cur.stacks : 0) + 1);
			this.eng.poison.set(z, { stacks, t: copperheadDurationSec(rank) });
		}

		// Ticks one poisoned zombie. Returns true when the poison killed it.
		tickPoison(z: any, dt: any) {
			const ps = this.eng.poison.get(z);
			if (!ps) return false;
			if (!this.eng.zombies.includes(z)) { this.eng.poison.delete(z); return false; }
			ps.t -= dt;
			const pdps = copperheadPoisonDps((this.eng as any).boon(`copperhead`)) * ps.stacks; // CONTEXT-GAP: boon
			z.health -= pdps * dt;
			this.eng.stats.damageDealt += pdps * dt;
			z.hitFlash = Math.max(z.hitFlash, .08);
			if (ps.t <= 0) this.eng.poison.delete(z);
			return z.health <= 0;
		}

		updateBomb() {
			if (this.eng.bombCharges < BOMB_MAX_CHARGES && Date.now() - this.eng.bombLastRegen >= BOMB_REGEN_MS) {
				this.eng.bombCharges++;
				this.eng.bombLastRegen = Date.now();
				(this.eng as any).emitJuice(`floater`, { x: this.eng.player.x, y: this.eng.player.y - 48, text: `BOMB READY`, color: `#fde68a` }); // Batch 16 (Lane 2): juice event
				soundEngine.playPickup();
			}
		}

		detonateBomb() {
			if (!this.eng.isRunning || this.eng.isPaused || this.eng.draft) return false;
			if (this.eng.bombCharges <= 0) return false;
			this.eng.bombCharges--;
			for (const z of this.eng.zombies) {
				const dx = z.x - this.eng.player.x, dy = z.y - this.eng.player.y;
				const d = Math.hypot(dx, dy) || 1;
				if (d > BOMB_RADIUS + z.radius) continue;
				const mass = z.type === `behemoth` ? 4.2 : z.type === `old_ben` ? 4.0 : z.type === `miner_brute` ? 2.6 : z.type === `bloater_spitter` ? 1.8 : z.type === `crawler` ? 0.7 : 1;
				const imp = 20 / mass;
				z.vx += (dx / d) * imp;
				z.vy += (dy / d) * imp;
				// Batch 3: B-bomb falloff — full damage at ground zero, 35% at the rim.
				// Batch 10 (Lane 4): brine boosts the blast.
				const bfall = BOMB_DMG * (.35 + .65 * (1 - d / (BOMB_RADIUS + z.radius))) * brineExplosionMul((this.eng as any).boon(`brinebarrel`)); // CONTEXT-GAP: boon
				z.health -= bfall;
				z.hitFlash = .3;
				this.eng.stats.damageDealt += bfall;
				(this.eng as any).emitJuice(`bloodParticles`, { x: z.x, y: z.y, angle: Math.atan2(dy, dx) }); // Batch 16 (Lane 2): juice event
			}
			(this.eng as any).spawnBrinePatch(this.eng.player.x, this.eng.player.y); // Batch 10 (Lane 4): brine patch at ground zero. // CONTEXT-GAP: spawnBrinePatch
			(this.eng as any).emitNoise(this.eng.player.x, this.eng.player.y, 700), // CONTEXT-GAP: emitNoise
			(this.eng as any).addLight(this.eng.player.x, this.eng.player.y, 520, 1, .6), // CONTEXT-GAP: addLight
			(this.eng as any).emitJuice(`scorch`, { x: this.eng.player.x, y: this.eng.player.y, radius: 130 }), // Batch 16 (Lane 2): juice event
			this.eng.screenShake = Math.max(this.eng.screenShake, 12 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()), this.eng.trauma = Math.min(1, this.eng.trauma + .8 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
			this.eng.hitstop = Math.max(this.eng.hitstop, (.12) * (this.eng as any).tune('hitstop')); // CONTEXT-GAP: tune
			for (let k = 0; k < 28; k++) {
				const a = (Math.PI * 2 * k) / 28;
				this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { x: this.eng.player.x, y: this.eng.player.y, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, size: 5, life: .5, maxLife: .5, alpha: 1, color: `#fde68a` })); // CONTEXT-GAP: allocParticle
			}
			(this.eng as any).emitJuice(`floater`, { x: this.eng.player.x, y: this.eng.player.y - 64, text: `BOMB`, color: `#f97316` }); // Batch 16 (Lane 2): juice event
			soundEngine.playNuke();
			return true;
		}

		nearestZombie(x: any, y: any, maxD: any) {
			let best = null, bd = maxD;
			const near = (this.eng as any).queryZombies(x, y, maxD, []); // CONTEXT-GAP: queryZombies
			for (const i of near) {
				const z = this.eng.zombies[i];
				if (!z || z.health <= 0) continue;
				const d = Math.hypot(z.x - x, z.y - y);
				if (d < bd) { bd = d; best = z; }
			}
			return best;
		}

		// Batch 7 (Lane 1): "Patoka Arc" chain lightning — nearest zombie in range,
		// then arcs to the nearest unhit zombie within chainRadius, damage x falloff per jump.
		fireChainLightning(w: any, dmgMul: any) {
			const cfg = (this.eng as any).chainCfg(); // CONTEXT-GAP: chainCfg
			(this.eng as any).rebuildZombieHash(); // CONTEXT-GAP: rebuildZombieHash
			const R = Math.max(0.001, cfg.acquireRadius);
			const q = (this.eng as any).queryZombies(this.eng.player.x, this.eng.player.y, R + (this.eng.zhashMaxR || 0), []); // CONTEXT-GAP: queryZombies
			let first = null, bd = R + 1;
			for (const k of q) {
				const z = this.eng.zombies[k];
				if (!z || z.health <= 0) continue;
				const d = Math.hypot(z.x - this.eng.player.x, z.y - this.eng.player.y);
				if (d < bd) { bd = d; first = z; }
			}
			this.eng.lastChain = { jumps: 0, hits: 0 };
			if (!first) return;
			const hit = new Set();
			let dmg = cfg.damage * dmgMul;
			let fx = this.eng.player.x, fy = this.eng.player.y;
			let cur = first, jumps = 0;
			for (;;) {
				hit.add(cur);
				const dealt = (this.eng as any).applyAffixDefense(cur, dmg); // CONTEXT-GAP: applyAffixDefense
				cur.health -= dealt;
				cur.hitFlash = Math.max(cur.hitFlash, .18);
				this.eng.stats.damageDealt += dealt;
				(this.eng as any).emitJuice(`bloodParticles`, { x: cur.x, y: cur.y, angle: Math.atan2(cur.y - fy, cur.x - fx) }); // Batch 16 (Lane 2): juice event
				this.arcSegment(fx, fy, cur.x, cur.y);
				if (cur.health <= 0) (this.eng as any).killZombie(cur, this.eng.zombies.indexOf(cur)); // CONTEXT-GAP: killZombie
				if (jumps >= cfg.chainJumps) break;
				const RJ = Math.max(0.001, cfg.chainRadius);
				const q2 = (this.eng as any).queryZombies(cur.x, cur.y, RJ + (this.eng.zhashMaxR || 0), []); // CONTEXT-GAP: queryZombies
				let nxt = null, nd = RJ + 1;
				for (const k of q2) {
					const z = this.eng.zombies[k];
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
			this.eng.lastChain = { jumps, hits: hit.size };
			soundEngine.tone({ f: 1800, f2: 200, type: `sawtooth`, dur: .18, vol: .12 });
		}

		// Batch 7: jagged polyline through the existing lightning + particle systems.
		arcSegment(x1: any, y1: any, x2: any, y2: any) {
			const segs = 3;
			let px = x1, py = y1;
			for (let s = 1; s <= segs; s++) {
				const t = s / segs;
				const nx = x1 + (x2 - x1) * t + (s < segs ? (Math.random() - .5) * 26 : 0);
				const ny = y1 + (y2 - y1) * t + (s < segs ? (Math.random() - .5) * 26 : 0);
				this.eng.lightning.push({ x1: px, y1: py, x2: nx, y2: ny, life: 0.18 });
				px = nx; py = ny;
			}
			for (let i = 0; i < 4; i++) this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
				x: x2, y: y2,
				vx: (Math.random() - .5) * 4, vy: (Math.random() - .5) * 4,
				size: 2.5, color: `#93c5fd`, alpha: 1, life: .25, maxLife: .3, type: `spark`
			}));
		}

		// Batch 7: "Still-Yard Blades" firing pulse — the blades themselves do the work passively.
		fireOrbiterPulse(w: any, dmgMul: any) {
			const cfg = (this.eng as any).orbiterCfg(); // CONTEXT-GAP: orbiterCfg
			(this.eng as any).rebuildZombieHash(); // CONTEXT-GAP: rebuildZombieHash
			const R = Math.max(0.001, cfg.orbiterRadius * 1.15);
			const q = (this.eng as any).queryZombies(this.eng.player.x, this.eng.player.y, R + (this.eng.zhashMaxR || 0), []); // CONTEXT-GAP: queryZombies
			const dmg = (cfg.orbiterDps * 0.5 + (w.damage || 0)) * dmgMul;
			for (const k of q) {
				const z = this.eng.zombies[k];
				if (!z || z.health <= 0) continue;
				if (Math.hypot(z.x - this.eng.player.x, z.y - this.eng.player.y) > R + z.radius) continue;
				const dealt = (this.eng as any).applyAffixDefense(z, dmg); // CONTEXT-GAP: applyAffixDefense
				z.health -= dealt;
				// Batch 11 (Lane 1): thorned elites bite back against contact blades.
				(this.eng as any).thornedReflect(z, dealt); // CONTEXT-GAP: thornedReflect
				z.hitFlash = Math.max(z.hitFlash, .15);
				this.eng.stats.damageDealt += dealt;
				(this.eng as any).emitJuice(`bloodParticles`, { x: z.x, y: z.y, angle: Math.atan2(z.y - this.eng.player.y, z.x - this.eng.player.x) }); // Batch 16 (Lane 2): juice event
				if (z.health <= 0) (this.eng as any).killZombie(z, this.eng.zombies.indexOf(z)); // CONTEXT-GAP: killZombie
			}
			this.eng.shockwaves.push({ x: this.eng.player.x, y: this.eng.player.y, r: 10, maxR: R, life: .25, maxLife: .25, color: `#7dd3fc` });
		}

		// Batch 10 (Lane 1): Stendal Pit Mortar — fire `cnt` shells (WEAPON_LEVELS)
		// at the densest nearby cluster. Each shell lands fuseSec later and blooms.
		fireMortar(w: any, dmgMul: any) {
			const tun = MORTAR_TUNING;
			const lvl = statsForLevel(`mortar`, w.upgradeLevel);
			const shells = lvl ? lvl.cnt : 1;
			const c = (this.eng as any).densestCluster(tun.clusterSearch); // CONTEXT-GAP: densestCluster
			let tx = c ? c.x : this.eng.player.x + Math.cos(this.eng.player.angle) * 300;
			let ty = c ? c.y : this.eng.player.y + Math.sin(this.eng.player.angle) * 300;
			for (let k = 0; k < shells; k++) {
				const ox = this.eng.player.x + (Math.random() - .5) * 20, oy = this.eng.player.y - 10 + (Math.random() - .5) * 20;
				const jx = tx + (Math.random() - .5) * 40, jy = ty + (Math.random() - .5) * 40;
				const b = (this.eng as any).allocBullet(); // CONTEXT-GAP: allocBullet
				b.x = ox; b.y = oy;
				b.vx = (jx - ox) / (tun.fuseSec * 60);
				b.vy = (jy - oy) / (tun.fuseSec * 60);
				b.damage = w.damage * dmgMul;
				b.radius = 6;
				b.rangeRemaining = 1200;
				b.weaponType = `mortar`;
				b.color = `#d6a05c`;
				b.isMortar = true;
				b.mortarFuse = tun.fuseSec;
				b.mortarDmg = b.damage;
				b.mortarR = tun.aoeRadius;
				this.eng.bullets.push(b);
			}
			this.eng.stats.shotsFired += shells;
			this.eng.screenShake = Math.max(this.eng.screenShake, 6 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
			soundEngine.playShotFor(soundEngine.kindForWeapon(w));
		}

		// Batch 10 (Lane 1): mortar shell impact — AoE with edge falloff + scorch decal.
		// Batch 11 (Lane 1): White River Arc Lance — a sweeping beam that locks
		// onto the densest nearby cluster and deals damage ticks with a heat-glow
		// visual. The beam re-acquires the densest cluster every tick, so it
		// visibly sweeps as the horde shifts. dmg = per-tick damage, cnt = ticks
		// per trigger pull, rad = lock-on range, spd = beam half-width.
		lanceCfg(w: any) {
			const lv = statsForLevel(`arc_lance`, w?.upgradeLevel ?? 1);
			return {
				tickDmg: w?.damage ?? lv?.dmg ?? 34,
				ticks: Math.max(1, Math.round(w?.pellets ?? lv?.cnt ?? 3)),
				range: Math.max(1, w?.range ?? lv?.rad ?? 560),
				halfWidth: Math.max(20, w?.bulletSpeed ?? lv?.spd ?? 90),
				tickSec: .12,
			};
		}

		fireArcLance(w: any, dmgMul: any) {
			const cfg = this.lanceCfg(w);
			const c = (this.eng as any).densestCluster(cfg.range); // CONTEXT-GAP: densestCluster
			const tx = c ? c.x : this.eng.player.x + Math.cos(this.eng.player.angle) * cfg.range * .6;
			const ty = c ? c.y : this.eng.player.y + Math.sin(this.eng.player.angle) * cfg.range * .6;
			this.eng.arcBeams.push({ tx, ty, tickT: cfg.tickSec, ticksLeft: cfg.ticks, tickDmg: cfg.tickDmg * dmgMul, halfWidth: cfg.halfWidth, range: cfg.range });
			this.eng.stats.shotsFired++;
			this.eng.lastLance = { beams: this.eng.arcBeams.length, hits: 0, locked: !!c };
			soundEngine.tone({ f: 1400, f2: 300, type: `sawtooth`, dur: .25, vol: .15 });
			(this.eng as any).alertZombies(this.eng.player.x, this.eng.player.y, 220); // CONTEXT-GAP: alertZombies
		}

		detonateMortarShell(n: any) {
			const R = n.mortarR || MORTAR_TUNING.aoeRadius;
			for (const z of this.eng.zombies) {
				const d = Math.hypot(z.x - n.x, z.y - n.y);
				if (d > R + z.radius) continue;
				const f = 1 - .5 * (d / (R + z.radius));
				const dmg = Math.round((n.mortarDmg || n.damage) * f * (this.eng as any).explosionDmgMul(z)); // CONTEXT-GAP: explosionDmgMul
				z.health -= dmg; z.hitFlash = .12;
				this.eng.stats.damageDealt += dmg;
				(this.eng as any).emitJuice(`bloodParticles`, { x: z.x, y: z.y, angle: Math.atan2(z.y - n.y, z.x - n.x) }); // Batch 16 (Lane 2): juice event
			}
			for (let i = this.eng.zombies.length - 1; i >= 0; i--) {
				if (this.eng.zombies[i].health <= 0) (this.eng as any).killZombie(this.eng.zombies[i], i); // CONTEXT-GAP: killZombie
			}
			this.eng.shockwaves.push({ x: n.x, y: n.y, r: 8, maxR: R, life: .35, maxLife: .35, color: `#d6a05c` });
			(this.eng as any).emitJuice(`scorch`, { x: n.x, y: n.y, radius: Math.min(130, R) }); // Batch 16 (Lane 2): juice event
			this.eng.screenShake = Math.max(this.eng.screenShake, 6 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
			this.eng.trauma = Math.min(1, this.eng.trauma + .35 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
			(this.eng as any).addLight(n.x, n.y, 420, 1, .5); // CONTEXT-GAP: addLight
			(this.eng as any).emitNoise(n.x, n.y, 500); // CONTEXT-GAP: emitNoise
			soundEngine.playBarrelExplosion();
		}

		// Batch 2: ricochet — bounce to the nearest other zombie, 25% falloff per bounce.
		tryRicochet(n: any, hitZ: any) {
			const maxB = (this.eng as any).boon(`ricochet`); // CONTEXT-GAP: boon
			if (maxB <= 0) return false;
			if (!supportApplies(`ricochet`, n.weaponType)) return false; // Batch 9: affinity-gated.
			n.bouncesLeft = n.bouncesLeft ?? maxB;
			if (n.bouncesLeft <= 0) return false;
			let best = null, bd = 340;
			for (const z of this.eng.zombies) {
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
			(this.eng as any).createHitSparks(n.x, n.y, `#4cc3ff`); // CONTEXT-GAP: createHitSparks
			soundEngine.tone({ f: 900, f2: 1400, type: `sine`, dur: .08, vol: .1 });
			return true;
		}

		// Batch 2: forking rounds — impact splits into spectral projectiles.
		spawnForkChildren(n: any, a: any) {
			const ranks = (this.eng as any).boon(`fork`); // CONTEXT-GAP: boon
			if (ranks <= 0 || n.isForkChild || n.isSplinter || n.isFlare || n.isMolotov) return;
			if (!supportApplies(`fork`, n.weaponType)) return; // Batch 9: affinity-gated.
			for (let k = 0; k < ranks; k++) {
				const fa = a + (k % 2 === 0 ? 1 : -1) * (.38 + .22 * ((k / 2) | 0));
				const sp = Math.hypot(n.vx, n.vy) || 400;
				this.eng.bullets.push(Object.assign((this.eng as any).allocBullet(), { // CONTEXT-GAP: allocBullet
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
}
