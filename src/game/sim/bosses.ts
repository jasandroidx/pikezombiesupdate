// BossSim — Batch 14 (modularization), lane M2.
// Boss sim: Behemoth, Old Ben (+ben*/tickBen* state machines), Haint, Illusionist, signature specials.
// Mechanical extraction from src/game/engine.ts: method bodies copied verbatim,
// `this.` -> `this.eng.` for engine state; own-module calls keep `this.`;
// cross-module/engine calls use `(this.eng as any).x()` with CONTEXT-GAP markers.
// engine.ts is untouched by this lane; the integrator wires the subsystems.
import type { SimContext } from "./context";
import { soundEngine } from "../../audio/soundEngine";
import { characterDef, selectedCharacterId } from "../meta";
import { OLD_BEN_TUNING, bossFor, SIGNATURE_TUNING, ILLUSIONIST, MORTAR_TUNING } from "../constants";

export class BossSim {
	constructor(private eng: SimContext) {}

	// Batch 7: phased Behemoth — charge (telegraphed dash) / summon (crawlers, once) /
	// enrage (<30% HP: +35% speed, +25% damage, red tint). Phases are HP/threshold driven.
	tickBehemoth(r: any,  o: any,  dt: any) {
		const cfg = this.eng.behemothPhases;
		if (r.bossPhase === undefined) { r.bossPhase = `fight`; r.chargeCd = 3; }
		const frac = r.maxHealth > 0 ? r.health / r.maxHealth : 1;
		if (r.enraged || frac < cfg.enrageAt) {
			if (!r.enraged) {
				r.enraged = true;
				(this.eng as any).spawnFloater(r.x, r.y - r.radius - 24, `ENRAGED`, `#ef4444`); // CONTEXT-GAP: spawnFloater
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
				// Batch 13 (Lane 1): the Behemoth's call stirs up Old Ben's
				// brood too — splinters and a mound alongside the crawlers.
				const type = k === 1 ? `splinter` : k === 3 ? `mound` : `crawler`;
				const c = (this.eng as any).pushZombie(type, r.x + Math.cos(a) * (r.radius + 40), r.y + Math.sin(a) * (r.radius + 40)); // CONTEXT-GAP: pushZombie
				c.ai = `chase`;
			}
			(this.eng as any).spawnFloater(r.x, r.y - r.radius - 24, `THE GROUND STIRS`, `#a78bfa`); // CONTEXT-GAP: spawnFloater
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
				const a = Math.atan2(this.eng.player.y - r.y, this.eng.player.x - r.x);
				r.chargeVx = Math.cos(a) * cfg.chargeDashSpeed;
				r.chargeVy = Math.sin(a) * cfg.chargeDashSpeed;
				r.chargeDashT = 0.55;
				r.bossPhase = `fight`;
				r.chargeCd = cfg.chargeEvery * (0.8 + Math.random() * 0.4);
				this.eng.screenShake = Math.max(this.eng.screenShake, 8 * (this.eng as any).tune(`shake`)); // CONTEXT-GAP: tune
				soundEngine.tone({ f: 200, f2: 900, type: `sawtooth`, dur: .3, vol: .2 });
			}
			return;
		}
		if ((r.chargeDashT || 0) > 0) {
			r.chargeDashT -= dt;
			const nx = r.x + r.chargeVx * dt, ny = r.y + r.chargeVy * dt;
			if (!(this.eng as any).checkObstacleCollision(nx, ny, r.radius * .7)) { r.x = nx; r.y = ny; } // CONTEXT-GAP: checkObstacleCollision
			r.bossPhase = `fight`;
			return;
		}
		if (r.chargeCd <= 0 && o > 120 && o < 800) {
			r.chargeWindupT = cfg.chargeWindup;
			r.bossPhase = `charge`;
			(this.eng as any).pushTelegraph(`charge`, r.x, r.y, cfg.chargeLaneR, cfg.chargeWindup); // CONTEXT-GAP: pushTelegraph
			(this.eng as any).spawnFloater(r.x, r.y - r.radius - 24, `!`, `#fbbf24`); // CONTEXT-GAP: spawnFloater
			return;
		}
		r.bossPhase = `fight`;
	}

	// Batch 13 (Lane 1): Boss #2 — Old Ben. Three telegraphed attack patterns
	// (Tremor Slam / Briar Call / Bull Charge) plus a fury escalation below
	// 50% HP (shorter cooldowns, Tremor Slam gains a staggered second ring) —
	// the same phase pattern the Behemoth uses via bossPhase.
	tickOldBen(r: any,  o: any,  dt: any) {
		const cfg = this.eng.oldBenCfg;
		if (!r.benInit) {
			r.benInit = true; r.bossPhase = `fight`; r.benAtk = null;
			r.slamCd = 3; r.callCd = 5; r.chargeCd = 4;
			r.fury = false;
		}
		const frac = r.maxHealth > 0 ? r.health / r.maxHealth : 1;
		if (!r.fury && frac < cfg.furyAt) {
			r.fury = true;
			(this.eng as any).spawnFloater(r.x, r.y - r.radius - 24, `OLD BEN IS FURIOUS`, `#ef4444`); // CONTEXT-GAP: spawnFloater
			soundEngine.tone({ f: 120, f2: 55, type: `sawtooth`, dur: .6, vol: .3 });
		}
		// Mid-attack state machines.
		if (r.benAtk === `slam`) { this.tickBenSlam(r, dt); return; }
		if (r.benAtk === `call`) { this.tickBenCall(r, dt); return; }
		if (r.benAtk === `charge`) { this.tickBenCharge(r, dt); return; }
		r.bossPhase = `fight`;
		// Staggered second slam ring (fury escalation) ticks between attacks.
		if ((r.slamRing2T || 0) > 0) {
			r.slamRing2T -= dt;
			if (r.slamRing2T <= 0) this.benSlamStrike(r, cfg.slamR2, true);
		}
		r.slamCd -= dt; r.callCd -= dt; r.chargeCd -= dt;
		// Probe-forced attack (oldBenAttack) takes priority over the cadence.
		const forced = r.forceAtk; r.forceAtk = null;
		if (forced === `slam` || forced === `call` || forced === `charge`) { this.benStart(forced, r); return; }
		if (r.slamCd <= 0 && o < 700) { this.benStart(`slam`, r); return; }
		if (r.callCd <= 0) { this.benStart(`call`, r); return; }
		if (r.chargeCd <= 0 && o > 150 && o < 900) { this.benStart(`charge`, r); return; }
	}

	benStart(atk: any,  r: any) {
		const cfg = this.eng.oldBenCfg;
		const cdMul = r.fury ? cfg.furyCdMul : 1;
		r.benAtk = atk;
		if (atk === `slam`) {
			// Tremor Slam: leaps to the player's current spot and slams — a
			// growing red ring marks the blast zone (renderer `ranged` kind).
			r.benWindupT = cfg.slamWindup;
			r.slamX = this.eng.player.x; r.slamY = this.eng.player.y;
			r.bossPhase = `slam`;
			(this.eng as any).pushTelegraph(`ranged`, r.slamX, r.slamY, cfg.slamR, cfg.slamWindup); // CONTEXT-GAP: pushTelegraph
			(this.eng as any).spawnFloater(r.x, r.y - r.radius - 24, `TREMOR SLAM`, `#fbbf24`); // CONTEXT-GAP: spawnFloater
			soundEngine.tone({ f: 70, f2: 40, type: `sine`, dur: .8, vol: .3 });
			r.slamCd = cfg.slamCd * (0.8 + Math.random() * 0.4) * cdMul;
		} else if (atk === `call`) {
			// Briar Call: channel tell — red rings on the nearest cellar
			// holes — then 4-6 boss-fight adds pour out of the ground.
			r.benWindupT = cfg.callWindup;
			r.bossPhase = `call`;
			const open = this.eng.holes.filter((h) => !h.boarded);
			for (const h of open.slice(0, 3)) (this.eng as any).pushTelegraph(`ranged`, h.x, h.y, 90, cfg.callWindup); // CONTEXT-GAP: pushTelegraph
			(this.eng as any).spawnFloater(r.x, r.y - r.radius - 24, `THE BRIAR CALLS`, `#a3e635`); // CONTEXT-GAP: spawnFloater
			soundEngine.tone({ f: 200, f2: 420, type: `triangle`, dur: .9, vol: .22 });
			r.callCd = cfg.callCd * (0.8 + Math.random() * 0.4) * cdMul;
		} else {
			// Bull Charge: the renderer draws the `charge` telegraph as a
			// direction lane from the boss toward the player — the charge path.
			r.benWindupT = cfg.chargeWindup;
			r.bossPhase = `charge`;
			const a = Math.atan2(this.eng.player.y - r.y, this.eng.player.x - r.x);
			r.chargeVx = Math.cos(a); r.chargeVy = Math.sin(a);
			(this.eng as any).pushTelegraph(`charge`, r.x, r.y, cfg.chargeLaneR, cfg.chargeWindup); // CONTEXT-GAP: pushTelegraph
			(this.eng as any).spawnFloater(r.x, r.y - r.radius - 24, `!`, `#fbbf24`); // CONTEXT-GAP: spawnFloater
			soundEngine.tone({ f: 150, f2: 600, type: `sawtooth`, dur: .5, vol: .2 });
			r.chargeCd = cfg.chargeCd * (0.8 + Math.random() * 0.4) * cdMul;
		}
	}

	tickBenSlam(r: any,  dt: any) {
		const cfg = this.eng.oldBenCfg;
		r.benWindupT -= dt;
		r.bossPhase = `slam`;
		if (r.benWindupT > 0) return;
		// Strike: leap to the locked target, then slam.
		r.x = r.slamX; r.y = r.slamY;
		this.benSlamStrike(r, cfg.slamR, false);
		if (r.fury) {
			// Furious second ring: staggered strike + its own visible telegraph.
			r.slamRing2T = 0.45;
			(this.eng as any).pushTelegraph(`ranged`, r.slamX, r.slamY, cfg.slamR2, 0.45); // CONTEXT-GAP: pushTelegraph
		}
		r.benAtk = null; r.bossPhase = `fight`;
	}

	benSlamStrike(r: any,  radius: any,  isSecond: any) {
		const cfg = this.eng.oldBenCfg;
		const dmg = Math.round(cfg.slamDmg * (r.fury ? 1.2 : 1));
		if (Math.hypot(this.eng.player.x - r.slamX, this.eng.player.y - r.slamY) <= radius + this.eng.player.radius) (this.eng as any).damagePlayer(dmg, r); // CONTEXT-GAP: damagePlayer
		// Knock the horde out of the crater (never the boss itself).
		for (const z of this.eng.zombies) {
			if (z === r || z.health <= 0) continue;
			const zd = Math.hypot(z.x - r.slamX, z.y - r.slamY);
			if (zd > radius + z.radius) continue;
			const a = Math.atan2(z.y - r.slamY, z.x - r.slamX) || 0;
			const kb = 160 * (1 - zd / (radius + z.radius + 1));
			const nx = z.x + Math.cos(a) * kb, ny = z.y + Math.sin(a) * kb;
			if (!(this.eng as any).checkObstacleCollision(nx, ny, z.radius)) { z.x = nx; z.y = ny; } // CONTEXT-GAP: checkObstacleCollision
		}
		this.eng.shockwaves.push({ x: r.slamX, y: r.slamY, r: 10, maxR: radius, life: .5, maxLife: .5, color: `#b45309` });
		this.eng.screenShake = Math.max(this.eng.screenShake, 10 * (this.eng as any).tune('shake')); // CONTEXT-GAP: tune
		this.eng.trauma = Math.min(1, this.eng.trauma + .35 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
		soundEngine.tone({ f: 60, f2: 28, type: `sine`, dur: .5, vol: .5 });
		if (isSecond) (this.eng as any).spawnFloater(r.slamX, r.slamY - 60, `SECOND RING`, `#ef4444`); // CONTEXT-GAP: spawnFloater
	}

	tickBenCall(r: any,  dt: any) {
		const cfg = this.eng.oldBenCfg;
		r.benWindupT -= dt;
		r.bossPhase = `call`;
		if (r.benWindupT > 0) return;
		const open = this.eng.holes.filter((h) => !h.boarded);
		// Strictly 4-6 adds even when furious (no fury bonus to the count).
		const n = cfg.callMin + Math.floor(Math.random() * (cfg.callMax - cfg.callMin + 1));
		for (let k = 0; k < n; k++) {
			const type = k % 3 === 2 ? `mound` : `splinter`;
			const h = open.length ? open[(Math.random() * open.length) | 0] : null;
			const a = Math.random() * Math.PI * 2, rr = h ? (h.radius || 30) + 8 : r.radius + 30;
			const hx = (h ? h.x : r.x) + Math.cos(a) * rr, hy = (h ? h.y : r.y) + Math.sin(a) * rr;
			const z = (this.eng as any).pushZombie(type, hx, hy); // CONTEXT-GAP: pushZombie
			z.ai = `chase`;
		}
		(this.eng as any).spawnFloater(r.x, r.y - r.radius - 24, `THE BRIAR RISES`, `#a3e635`); // CONTEXT-GAP: spawnFloater
		soundEngine.tone({ f: 90, f2: 300, type: `sawtooth`, dur: .4, vol: .25 });
		r.benAtk = null; r.bossPhase = `fight`;
	}

	tickBenCharge(r: any,  dt: any) {
		const cfg = this.eng.oldBenCfg;
		if ((r.chargeDashT || 0) > 0) {
			// Dashing: straight line. Generic movement is frozen by benDashing.
			const nx = r.x + r.chargeVx * cfg.chargeDashSpeed * dt;
			const ny = r.y + r.chargeVy * cfg.chargeDashSpeed * dt;
			const w = this.eng.currentLocation.mapWidth, h = this.eng.currentLocation.mapHeight;
			const blocked = nx < r.radius || nx > w - r.radius || ny < r.radius || ny > h - r.radius
				|| (this.eng as any).checkObstacleCollision(nx, ny, r.radius * .7); // CONTEXT-GAP: checkObstacleCollision
			if (blocked) {
				r.chargeDashT = 0;
				this.benWallImpact(r);
			} else {
				r.x = nx; r.y = ny;
				r.chargeDashT -= dt;
				this.benTrample(r);
				// Dash ran its full course without hitting a wall: the endpoint
				// still erupts in the impact shockwave (never a quiet fizzle).
				if (r.chargeDashT <= 0) this.benWallImpact(r);
			}
			return;
		}
		r.benWindupT -= dt;
		r.bossPhase = `charge`;
		if (r.benWindupT > 0) return;
		// Launch along the locked windup direction.
		r.chargeDashT = cfg.chargeDashT;
		r.benDashing = true; r.chargeHitPlayer = false;
		r.trampled = new Set();
		this.eng.screenShake = Math.max(this.eng.screenShake, 6 * (this.eng as any).tune('shake')); // CONTEXT-GAP: tune
		soundEngine.tone({ f: 200, f2: 900, type: `sawtooth`, dur: .3, vol: .2 });
	}

	benTrample(r: any) {
		// Trample the horde in the charge path; one player hit per charge.
		for (const z of this.eng.zombies) {
			if (z === r || z.health <= 0 || r.trampled.has(z)) continue;
			if (Math.hypot(z.x - r.x, z.y - r.y) > r.radius + z.radius + 24) continue;
			r.trampled.add(z);
			z.health -= 150;
			const a = Math.atan2(z.y - r.y, z.x - r.x) || 0;
			const nx = z.x + Math.cos(a) * 120, ny = z.y + Math.sin(a) * 120;
			if (!(this.eng as any).checkObstacleCollision(nx, ny, z.radius)) { z.x = nx; z.y = ny; } // CONTEXT-GAP: checkObstacleCollision
			(this.eng as any).createBloodParticles(z.x, z.y, a); // CONTEXT-GAP: createBloodParticles
			if (z.health <= 0) (this.eng as any).killZombie(z, this.eng.zombies.indexOf(z)); // CONTEXT-GAP: killZombie
		}
		if (!r.chargeHitPlayer && Math.hypot(this.eng.player.x - r.x, this.eng.player.y - r.y) <= r.radius + this.eng.player.radius + 10) {
			r.chargeHitPlayer = true;
			(this.eng as any).damagePlayer(45, r); // CONTEXT-GAP: damagePlayer
		}
	}

	benWallImpact(r: any) {
		// Bull Charge ended in a wall: shockwave around the impact point.
		const cfg = this.eng.oldBenCfg;
		if (Math.hypot(this.eng.player.x - r.x, this.eng.player.y - r.y) <= cfg.wallShockR + this.eng.player.radius) (this.eng as any).damagePlayer(cfg.wallShockDmg, r); // CONTEXT-GAP: damagePlayer
		for (const z of this.eng.zombies) {
			if (z === r || z.health <= 0) continue;
			const zd = Math.hypot(z.x - r.x, z.y - r.y);
			if (zd > cfg.wallShockR) continue;
			z.health -= 60;
			if (z.health <= 0) (this.eng as any).killZombie(z, this.eng.zombies.indexOf(z)); // CONTEXT-GAP: killZombie
		}
		this.eng.shockwaves.push({ x: r.x, y: r.y, r: 10, maxR: cfg.wallShockR, life: .55, maxLife: .55, color: `#b45309` });
		this.eng.screenShake = Math.max(this.eng.screenShake, 12 * (this.eng as any).tune('shake')); // CONTEXT-GAP: tune
		this.eng.trauma = Math.min(1, this.eng.trauma + .4 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
		(this.eng as any).spawnFloater(r.x, r.y - r.radius - 24, `THE WALL REMEMBERS`, `#fbbf24`); // CONTEXT-GAP: spawnFloater
		soundEngine.tone({ f: 55, f2: 25, type: `sine`, dur: .6, vol: .5 });
		r.benDashing = false; r.benAtk = null; r.bossPhase = `fight`;
	}

	// Batch 13 (Lane 1): Old Ben death — big grit shower, guaranteed boon
	// draft, boss codex entry, WJPS callout. Called from killZombie.
	oldBenDeath(e: any) {
		for (let i = 0; i < 24; i++) {
			const an = Math.random() * Math.PI * 2;
			(this.eng as any).dropGritOrb(e.x, e.y, Math.cos(an) * 160, Math.sin(an) * 160, 3 + (i % 3)); // CONTEXT-GAP: dropGritOrb
		}
		(this.eng as any).spawnFloater(e.x, e.y - 64, `OLD BEN FELLED`, `#ffd700`); // CONTEXT-GAP: spawnFloater
		this.eng.codexSeen?.add(`boss_old_ben`);
		this.eng.callbacks.onRadio?.(`WJPS`, `Old Ben's down! The briars are settling — somebody get a crew out to the company store and make sure he stays down.`);
		if (!this.eng.draft) (this.eng as any).offerDraft(); // CONTEXT-GAP: offerDraft
	}

	// Batch 13 (Lane 1): mound shield aura — the boss-fight tank add shields
	// nearby non-boss adds (damage reduced by OLD_BEN_TUNING.moundShieldMul).
	moundShielding(z: any) {
		for (const m of this.eng.zombies) {
			if (m.type !== `mound` || m.health <= 0 || m === z) continue;
			if (Math.hypot(m.x - z.x, m.y - z.y) <= this.eng.oldBenCfg.moundShieldR) return true;
		}
		return false;
	}

	// up to cloneCount identical 1-HP clones that deal no damage (they eat auto-fire).
	tickHaint(r: any,  dt: any) {
		if (r.isClone) return;
		r.cloneCd = (r.cloneCd ?? 1.5) - dt;
		if (r.cloneCd > 0) return;
		const o = Math.hypot(this.eng.player.x - r.x, this.eng.player.y - r.y);
		if (o > 700) { r.cloneCd = 1; return; }
		const want = 3;
		let have = 0;
		for (const z of this.eng.zombies) if (z.isClone && z.cloneOf === r.id) have++;
		const n = Math.max(0, Math.min(want, want - have));
		for (let k = 0; k < n; k++) {
			const a = Math.random() * Math.PI * 2;
			const c = (this.eng as any).pushZombie(`haint`, r.x + Math.cos(a) * 44, r.y + Math.sin(a) * 44); // CONTEXT-GAP: pushZombie
			c.isClone = true;
			c.cloneOf = r.id;
			c.maxHealth = 1;
			c.health = 1;
			c.damage = 0;
			c.ai = `chase`;
		}
		if (n > 0) (this.eng as any).spawnFloater(r.x, r.y - 40, `HAINT MULTIPLIES`, `#a78bfa`); // CONTEXT-GAP: spawnFloater
		r.cloneCd = 6;
	}

	// Batch 10 (Lane 1): Illusionist archetype (backlog). Every cloneCooldown
	// seconds, if the player is near, the REAL illusionist spawns 2-3 clones.
	// Clones are smoke: 1 HP, zero damage, drawn half-transparent — they exist
	// to waste auto-fire. Clone counts come from the ILLUSIONIST data table.
	tickIllusionist(r: any,  dt: any) {
		if (r.isClone) return;
		const cfg = ILLUSIONIST;
		r.cloneCd = (r.cloneCd ?? cfg.cloneCooldown * .5) - dt;
		if (r.cloneCd > 0) return;
		const o = Math.hypot(this.eng.player.x - r.x, this.eng.player.y - r.y);
		if (o > 700) { r.cloneCd = 1; return; }
		let have = 0;
		for (const z of this.eng.zombies) if (z.isClone && z.cloneOf === r.id) have++;
		const want = Math.min(cfg.cloneCount, 2 + (Math.random() < .5 ? 1 : 0));
		const n = Math.max(0, Math.min(want, cfg.cloneCount - have));
		for (let k = 0; k < n; k++) {
			const a = Math.random() * Math.PI * 2;
			const c = (this.eng as any).pushZombie(`illusionist`, r.x + Math.cos(a) * 44, r.y + Math.sin(a) * 44); // CONTEXT-GAP: pushZombie
			c.isClone = true;
			c.cloneOf = r.id;
			c.maxHealth = 1;
			c.health = 1;
			c.damage = 0;
			c.scoreValue = 0;
			c.scrapValue = 0;
			c.ai = `chase`;
		}
		if (n > 0) (this.eng as any).spawnFloater(r.x, r.y - 40, `SLEIGHT OF HAND`, `#a78bfa`); // CONTEXT-GAP: spawnFloater
		r.cloneCd = cfg.cloneCooldown;
	}

	// Batch 10 (Lane 1): character signature specials. The name/desc/cooldown
	// live on each CHARACTERS row (roster.ts); the engine dispatches the
	// effect by character id. The UI lane binds triggerSignature() to the HUD
	// button + key — the contract below must stay exact.
	signatureState() {
		let def = { special: { name: ``, cooldownSec: 20 } };
		try { def = characterDef(selectedCharacterId()); } catch (err) { /* defaults hold */ }
		const left = Math.max(0, (this.eng.signatureCdUntil || 0) - this.eng.simTime);
		return { ready: left <= 0, timeLeft: +left.toFixed(2), name: def.special?.name ?? `` };
	}

	triggerSignature() {
		if (!this.eng.isRunning || this.eng.isPaused || this.eng.draft) return false;
		let cid = `otis_hale`, cd = 20;
		try { cid = selectedCharacterId(); cd = characterDef(cid).special?.cooldownSec ?? 20; } catch (err) { /* defaults hold */ }
		if (!this.signatureState().ready) return false;
		this.eng.signatureCdUntil = this.eng.simTime + cd;
		if (cid === `otis_hale`) this.sigDeadeye();
		else if (cid === `eula_stillwell`) this.sigStillHeart();
		else if (cid === `silas_mccord`) this.sigMashBomb();
		else if (cid === `thea_kettler`) this.sigDraglineSweep();
		(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 56, (this.signatureState().name || `SPECIAL`).toUpperCase(), `#f6c453`); // CONTEXT-GAP: spawnFloater
		soundEngine.playPowerup();
		return true;
	}

	// Batch 10 (Lane 1): Otis's Deadeye Draw — 2s of +150% fire rate.
	signatureFireRateMul() {
		return this.eng.deadeyeUntil > this.eng.simTime ? SIGNATURE_TUNING.otis_hale.power : 1;
	}

	sigDeadeye() {
		this.eng.deadeyeUntil = this.eng.simTime + SIGNATURE_TUNING.otis_hale.durSec;
		this.eng.hitstop = Math.max(this.eng.hitstop, .05 * (this.eng as any).tune('hitstop')); // CONTEXT-GAP: tune
	}

	// Batch 10 (Lane 1): Eula's Still Heart — 5s of 0.35x slow-mo (applied in
	// update()) plus guaranteed crits (critChance: 1 stamped in fireCurrentWeapon).
	sigStillHeart() {
		this.eng.stillHeartUntil = this.eng.simTime + SIGNATURE_TUNING.eula_stillwell.durSec;
		(this.eng as any).addLight(this.eng.player.x, this.eng.player.y, 380, .8, .3); // CONTEXT-GAP: addLight
	}

	// Batch 10 (Lane 1): Silas's Mash Bomb — lob a still-charge at the densest
	// nearby cluster. Detonates after a delay with AoE + scorch.
	sigMashBomb() {
		const tun = SIGNATURE_TUNING.silas_mccord;
		const c = this.densestCluster(600);
		const tx = c ? c.x : this.eng.player.x + Math.cos(this.eng.player.angle) * 300;
		const ty = c ? c.y : this.eng.player.y + Math.sin(this.eng.player.angle) * 300;
		(this.eng as any).lobCharge(tx, ty, tun.durSec, tun.radius || 120, tun.power, `MASH BOMB`); // CONTEXT-GAP: lobCharge
	}

	// Batch 10 (Lane 1): Thea's Dragline Sweep — instant 360° chainsaw sweep,
	// hitting every zombie in radius for double the current chainsaw damage.
	sigDraglineSweep() {
		const tun = SIGNATURE_TUNING.thea_kettler;
		const R = tun.radius || 160;
		const saw = this.eng.weapons.find((w) => w.id === `chainsaw`);
		const base = ((saw?.damage ?? 35) * tun.power);
		const a = this.eng.player.angle;
		for (let i = this.eng.zombies.length - 1; i >= 0; i--) {
			const z = this.eng.zombies[i];
			const dx = z.x - this.eng.player.x, dy = z.y - this.eng.player.y;
			if (Math.hypot(dx, dy) > R + z.radius) continue;
			const dmg = Math.round(base * (this.eng as any).playerDamageMul(z, `chainsaw`)); // CONTEXT-GAP: playerDamageMul
			z.health -= dmg; z.hitFlash = .25;
			// Batch 11 (Lane 1): thorned elites bite back against the sweep.
			(this.eng as any).thornedReflect(z, dmg); // CONTEXT-GAP: thornedReflect
			this.eng.stats.damageDealt += dmg;
			(this.eng as any).createBloodParticles(z.x, z.y, a + Math.PI); // CONTEXT-GAP: createBloodParticles
			if (z.health <= 0) (this.eng as any).killZombie(z, i); // CONTEXT-GAP: killZombie
		}
		this.eng.shockwaves.push({ x: this.eng.player.x, y: this.eng.player.y, r: 12, maxR: R, life: .3, maxLife: .3, color: `#fbbf24` });
		this.eng.screenShake = Math.max(this.eng.screenShake, 8 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
		this.eng.trauma = Math.min(1, this.eng.trauma + .35 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
		soundEngine.playShotFor(soundEngine.kindForWeapon({ soundType: `chainsaw` }), { power: 1.4 });
	}

	// Batch 10 (Lane 1): densest-cluster targeting, shared by the Mortar and
	// Silas's Mash Bomb. Counts zombies within clusterRadius of each candidate.
	densestCluster(maxRange: any) {
		const CR = MORTAR_TUNING.clusterRadius;
		let best = null, bestN = 0;
		for (const z of this.eng.zombies) {
			if (Math.hypot(z.x - this.eng.player.x, z.y - this.eng.player.y) > maxRange) continue;
			let n = 0;
			for (const o of this.eng.zombies) if (Math.hypot(o.x - z.x, o.y - z.y) < CR) n++;
			if (n > bestN) { bestN = n; best = z; }
		}
		return best ? { x: best.x, y: best.y, count: bestN } : null;
	}

	bossEntrance(z: any) {
		// Batch 5: banner copy comes from the BOSSES table; trauma/radio/motif stay engine-side.
		const bdef = bossFor(`behemoth`)?.bossOverrides;
		this.eng.bannerText = bdef?.bannerText ?? `THE BEHEMOTH`;
		this.eng.bannerSub = bdef?.bannerSub ?? `Something old is walking out of the treeline`;
		this.eng.bannerUntil = Date.now() + 2600;
		this.eng.trauma = Math.min(1, this.eng.trauma + .45 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
		this.eng.callbacks.onRadio?.(`WJPS`, `Folks... we got a big one on the Trace. Get to high ground or get to cover.`);
		// Batch 9 (Lane 3): the boss warning motif (480->360->240Hz square alert)
		// replaces the old descending sawtooth sequence — one alert, not two.
		soundEngine.bossMotif();
	}

	oldBenEntrance(z: any) {
		// Batch 13 (Lane 1): boss #2 entrance — banner copy from the BOSSES
		// table; trauma/radio/motif stay engine-side like the Behemoth's.
		const bdef = bossFor(`old_ben`)?.bossOverrides;
		this.eng.bannerText = bdef?.bannerText ?? `OLD BEN`;
		this.eng.bannerSub = bdef?.bannerSub ?? `Old Ben don't sleep no more`;
		this.eng.bannerUntil = Date.now() + 2600;
		this.eng.trauma = Math.min(1, this.eng.trauma + .45 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
		this.eng.callbacks.onRadio?.(`WJPS`, `Folks... Old Ben just woke up out on the Trace. The briars are moving — keep to high ground or keep moving.`);
		soundEngine.bossMotif();
	}
}
