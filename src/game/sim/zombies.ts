// ZombieSim — Batch 14 (modularization), lane M2.
// Zombie sim: spawn pipeline, AI personalities, affixes, mass/knockback, spatial hash, kill-surge.
// Mechanical extraction from src/game/engine.ts: method bodies copied verbatim,
// `this.` -> `this.eng.` for engine state; own-module calls keep `this.`;
// cross-module/engine calls use `(this.eng as any).x()` with CONTEXT-GAP markers.
// engine.ts is untouched by this lane; the integrator wires the subsystems.
import type { SimContext } from "./context";
import { soundEngine } from "../../audio/soundEngine";
import { brineExplosionMul } from "../boons";
import { bossFor, scalingAt, ILLUSIONIST, BURN_STACK_DPS, WAVES } from "../constants";

export class ZombieSim {
	constructor(private eng: SimContext) {}

	farEdgeSpawn(minDist : any = 400) {
		const w = this.eng.currentLocation.mapWidth;
		const h = this.eng.currentLocation.mapHeight;
		const px = this.eng.player.x, py = this.eng.player.y;
		const edges = [
			{ x: 60 + this.eng.rng() * (w - 120), y: 60 },
			{ x: 60 + this.eng.rng() * (w - 120), y: h - 60 },
			{ x: 60, y: 60 + this.eng.rng() * (h - 120) },
			{ x: w - 60, y: 60 + this.eng.rng() * (h - 120) }
		];
		edges.sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py));
		for (const e of edges) {
			if (Math.hypot(e.x - px, e.y - py) >= minDist && !this.checkObstacleCollision(e.x, e.y, 16)) return e;
		}
		return edges[edges.length - 1];
	}

	// VS-2: guaranteed elite — the director never lets the pressure fully drop.
	spawnGuaranteedElite() {
		const pool = this.eng.wave >= 8 ? [`behemoth`, `miner_brute`, `bloater_spitter`] : this.eng.wave >= 5 ? [`miner_brute`, `bloater_spitter`, `riot`, `sprinter`] : [`sprinter`, `riot`, `bloater_spitter`];
		const type = pool[Math.floor(this.eng.rng() * pool.length)];
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
		z.tx = this.eng.player.x;
		z.ty = this.eng.player.y;
		this.assignAffix(z);
		(this.eng as any).emitJuice('floater', { x: z.x, y: z.y - z.radius - 14, text: `ELITE ${type.replace(`_`, ` `).toUpperCase()}`, color: `#c77dff` });
		(this.eng as any).drainJuiceEvents();
		this.eng.callbacks.onRadio?.(`WJPS`, `Something big just walked out of the treeline. Watch yourself.`);
		soundEngine.playWaveHorn();
		return z;
	}

	spawnRandomZombie() {
		const open = this.eng.holes.filter((h) => !h.boarded);
		const nearHole = open.some((h) => Math.hypot(this.eng.player.x - h.x, this.eng.player.y - h.y) < 180);
		const holesLive = nearHole || !this.eng.lanternLit || this.eng.wave >= 2;
		let holeChance = 0;
		if (open.length && holesLive) holeChance = nearHole ? .82 : !this.eng.lanternLit ? .7 : .28;
		let n = 0, r = 0, i = null;
		if (open.length && Math.random() < holeChance) {
			i = open[Math.floor(Math.random() * open.length)];
			const a = Math.random() * Math.PI * 2;
			n = i.x + Math.cos(a) * (i.radius + 8);
			r = i.y + Math.sin(a) * (i.radius + 8);
		} else {
			const edge = this.farEdgeSpawn(this.eng.wave === 1 ? 520 : 380);
			n = edge.x;
			r = edge.y;
		}
		if (Math.hypot(n - this.eng.player.x, r - this.eng.player.y) < 360) {
			const edge = this.farEdgeSpawn(480);
			n = edge.x;
			r = edge.y;
			i = null;
		}
		let a = `shambler`, o = this.eng.rng();
		if (this.eng.wave === 1) a = o < .28 ? `sprinter` : `shambler`;
		else if (i) a = i.kind === `pit` && o < .45 ? `miner_brute` : `crawler`;
		else if (this.eng.wave >= 5 && this.eng.wave % 5 == 0 && this.eng.zombiesToSpawn === 1) a = `behemoth`;
		// Batch 13 (Lane 1): Old Ben (boss #2) — waves 13/18/23/...; never
		// collides with the Behemoth's wave-%5==0 cadence.
		else if (this.eng.wave >= 13 && this.eng.wave % 5 == 3 && this.eng.zombiesToSpawn === 1) a = `old_ben`;
		else if (this.eng.lanternWentOut && o < .18) a = `crawler`;
		else if (this.eng.wave >= 4 && o < .2) a = `bloater_spitter`;
		else if (this.eng.wave >= 3 && o < .3) a = `bomber`;
		else if (this.eng.wave >= 4 && o < .4) a = this.eng.rng() < .45 ? `riot_shield` : `riot`;
		else if (this.eng.wave >= 5 && o < .45) a = `illusionist`;
		else if (this.eng.wave >= 3 && o < .5) a = `miner_brute`;
		else if (this.eng.wave >= 2 && o < .72) a = `sprinter`;
		this.pushZombie(a, n, r);
	}

	pushZombie(e: any,  t: any,  n: any): any {
		let r = 58, i = 2.15, a = 14, o = 17, s = `#475569`, c = false, l = 100, u = 15;
		// Batch 5: Behemoth stats come from the BOSSES table (constants.ts); the
		// engine still adds +wave*250 HP and keeps the legacy wave-5 spawn rule.
		const beh = e === `behemoth` ? bossFor(`behemoth`)?.bossOverrides : null;
		// Batch 13 (Lane 1): Old Ben stats come from the same BOSSES table;
		// the engine adds +wave*250 HP and keeps the wave-%5==3 spawn rule.
		const ob = e === `old_ben` ? bossFor(`old_ben`)?.bossOverrides : null;
		e === `crawler` ? (r = 32, i = 2.4, a = 8, o = 12, s = `#3f2e22`, l = 80, u = 8) : e === `sprinter` ? (r = 45, i = 3.45, a = 12, o = 15, s = `#991b1b`, l = 140, u = 20) : e === `miner_brute` ? (r = 220, i = 1.2, a = 25, o = 23, s = `#1e293b`, c = true, l = 250, u = 40) : e === `bloater_spitter` ? (r = 130, i = 1.05, a = 18, o = 21, s = `#65a30d`, l = 220, u = 35) : e === `bomber` ? (r = 45, i = 2.7, a = 12, o = 15, s = `#b45309`, l = 120, u = 18) : e === `riot` ? (r = 520, i = 0.85, a = 30, o = 24, s = `#3f3f46`, c = true, l = 300, u = 60) : e === `riot_shield` ? (r = 420, i = 0.95, a = 26, o = 23, s = `#52525b`, c = false, l = 350, u = 70) : e === `behemoth` && beh ? (r = beh.health + this.eng.wave * 250, i = beh.speed, a = beh.damage, o = beh.radius, s = beh.color, l = beh.scoreValue, u = beh.scrapValue) : e === `old_ben` && ob ? (r = ob.health + this.eng.wave * 250, i = ob.speed, a = ob.damage, o = ob.radius, s = ob.color, l = ob.scoreValue, u = ob.scrapValue) : 0;
		// Batch 7: Haint illusionist — pale drifter that multiplies itself.
		if (e === `haint`) { r = 90; i = 2.6; a = 12; o = 16; s = `#7c8db0`; l = 120; u = 22; }
		// Batch 10 (Lane 1): Illusionist — trickster archetype; base stats from the ILLUSIONIST data table.
		if (e === `illusionist`) { r = ILLUSIONIST.hp; i = ILLUSIONIST.speed; a = ILLUSIONIST.damage; o = ILLUSIONIST.radius; s = ILLUSIONIST.color; l = ILLUSIONIST.scoreValue; u = ILLUSIONIST.scrapValue; }
		// Batch 13 (Lane 1): boss-fight adds — summoned by the Briar Call,
		// never by the wave director (no pool references these types).
		if (e === `splinter`) { r = 40; i = 3.6; a = 10; o = 14; s = `#8a7a3a`; l = 60; u = 12; }
		if (e === `mound`) { r = 700; i = 0.7; a = 28; o = 28; s = `#5b4a2f`; l = 200; u = 45; }
		const em = (this.eng as any).eventMods(); // CONTEXT-GAP: eventMods
		// Batch 6: smooth time-based HP scaling replaces the old per-wave HP step.
		// scalingAt(simTime) in constants.ts: hp = 1+gt/120. The speed/damage
		// columns stay available for future tuning passes (not wired yet).
		const sc = scalingAt(this.eng.simTime);
		if (e !== `behemoth` && e !== `old_ben`) r = Math.round(r * sc.hp);
		let d: any = {
			id: Math.random().toString(),
			type: e,
			x: t,
			y: n,
			vx: 0,
			vy: 0,
			angle: 0,
			speed: i * (.9 + Math.random() * .2) * em.enemySpeedMult * (this.eng.stageZombieSpeedMul || 1),
			// Batch 4: D(t) time-curve multiplies with wave scaling + event mods.
			maxHealth: Math.round(r * em.enemyHpMult * (this.eng as any).timeCurve()), // CONTEXT-GAP: timeCurve
			health: Math.round(r * em.enemyHpMult * (this.eng as any).timeCurve()), // CONTEXT-GAP: timeCurve
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
		if (this.eng.wave >= 2 && e !== `behemoth` && e !== `old_ben` && e !== `splinter` && e !== `mound` && Math.random() < Math.min(.25, .08 + this.eng.wave * .015)) {
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
		this.eng.zombies.push(d), soundEngine.playZombieGroan(e === `crawler` ? `shambler` : e === `bomber` ? `bloater_spitter` : e === `riot` || e === `riot_shield` ? `miner_brute` : e);
		// Batch 2: boss entrance — Behemoth gets a banner and a warning motif.
		if (e === `behemoth`) (this.eng as any).bossEntrance(d); // CONTEXT-GAP: bossEntrance
		// Batch 13 (Lane 1): Old Ben gets its own entrance ceremony.
		if (e === `old_ben`) (this.eng as any).oldBenEntrance(d); // CONTEXT-GAP: oldBenEntrance
		return d;
	}

	// Batch 3: flanking director — peels a fraction of the horde wide to punish turtling.
	updateFlankDirector(dt: any) {
		this.eng.flankTimer -= dt;
		if (this.eng.flankTimer > 0 || this.eng.wave < 4) return;
		this.eng.flankTimer = 6;
		const chasers = this.eng.zombies.filter((z) => !z.elite && (z.ai === `chase` || z.ai === `investigate`) && z.type !== `bloater_spitter`);
		const want = Math.min(6, Math.ceil(chasers.length * .25));
		let assigned = 0;
		for (const z of chasers) {
			if (assigned >= want) break;
			if (z.flankUntil > this.eng.simTime) continue;
			if (Math.random() < .5) continue;
			z.flankUntil = this.eng.simTime + 10;
			z.flankSide = Math.random() < .5 ? -1 : 1;
			assigned++;
		}
	}

	// Batch 3: cull — recycle zombies past 1400u, hard cap 170. Keeps the sim bounded.
	cullZombies(dt: any) {
		this.eng.cullTimer -= dt;
		if (this.eng.cullTimer > 0) return;
		this.eng.cullTimer = 2;
		const px = this.eng.player.x, py = this.eng.player.y;
		for (let n = this.eng.zombies.length - 1; n >= 0; n--) {
			const z = this.eng.zombies[n];
			if (Math.hypot(z.x - px, z.y - py) > 1400) this.eng.zombies.splice(n, 1);
		}
		if (this.eng.zombies.length > 170) {
			this.eng.zombies.sort((a, b) => (Math.hypot(b.x - px, b.y - py) - Math.hypot(a.x - px, a.y - py)));
			this.eng.zombies.length = 170;
		}
	}

	updateZombies(e: any,  t: any) {
		this.cullZombies(e);
		// Batch 8: AI LOD tick — far zombies think on staggered 3rd ticks.
		this.eng.zLodTick = (this.eng.zLodTick || 0) + 1;
		for (let n = this.eng.zombies.length - 1; n >= 0; n--) {
			let r = this.eng.zombies[n];
			// Batch 3: spawn pop — nothing appears instantly.
			if (r.spawnT > 0) r.spawnT -= e;
			// Batch 2: affix behaviors — vampiric regen, leaping lunge.
			if (r.affix === `vampiric` && r.health < r.maxHealth) r.health = Math.min(r.maxHealth, r.health + r.maxHealth * .02 * e);
			// Batch 11 (Lane 1): wailing — periodically wails, driving nearby
			// zombies into a speed frenzy. Kill the wailer first.
			if (r.affix === `wailing`) {
				r.wailCd = (r.wailCd ?? 3) - e;
				if (r.wailCd <= 0) { r.wailCd = 5 + Math.random() * 2; this.wailBlast(r); }
			}
			// Batch 3: dasher archetype — sprinters telegraph a lunge burst.
			if (r.type === `sprinter` && r.affix !== `leaping`) {
				r.dashCd = (r.dashCd ?? 2) - e;
				if (r.dashTele > 0) {
					r.dashTele -= e;
					r.hitFlash = Math.max(r.hitFlash, .06);
					if (r.dashTele <= 0) {
						const da = Math.atan2(this.eng.player.y - r.y, this.eng.player.x - r.x);
						r.vx = (r.vx || 0) + Math.cos(da) * 380; r.vy = (r.vy || 0) + Math.sin(da) * 380;
						soundEngine.tone({ f: 300, f2: 700, type: `sawtooth`, dur: .15, vol: .1 });
					}
				} else if (r.dashCd <= 0 && Math.hypot(this.eng.player.x - r.x, this.eng.player.y - r.y) < 280) {
					r.dashTele = .35; r.dashCd = 3.5;
					// Batch 7: telegraphed lunge — the renderer drains state.telegraphs.
					(this.eng as any).emitJuice('telegraph', { kind: `leap`, x: r.x, y: r.y, r: 120, dur: .9 });
					(this.eng as any).drainJuiceEvents();
				}
			}
			if (r.affix === `leaping`) {
				r.leapCd -= e;
				if (r.leapTele > 0) {
					r.leapTele -= e;
					if (r.leapTele <= 0) {
						const a = Math.atan2(this.eng.player.y - r.y, this.eng.player.x - r.x);
						r.vx = (r.vx || 0) + Math.cos(a) * 320; r.vy = (r.vy || 0) + Math.sin(a) * 320;
						(this.eng as any).emitJuice('bloodParticles', { x: r.x, y: r.y, angle: a });
						(this.eng as any).drainJuiceEvents();
						soundEngine.tone({ f: 200, f2: 600, type: `sawtooth`, dur: .2, vol: .15 });
					}
				} else if (r.leapCd <= 0 && Math.hypot(this.eng.player.x - r.x, this.eng.player.y - r.y) < 320) {
					r.leapTele = .45; r.leapCd = 4;
					// Batch 7: telegraphed leap.
					(this.eng as any).emitJuice('telegraph', { kind: `leap`, x: r.x, y: r.y, r: 140, dur: .9 });
					(this.eng as any).drainJuiceEvents();
					(this.eng as any).emitJuice('floater', { x: r.x, y: r.y - r.radius - 20, text: `!`, color: `#ffffff` });
					(this.eng as any).drainJuiceEvents();
				}
			}
			if (r.isBurning && r.isBurning > 0 && (r.isBurning -= e * 1e3, r.health -= e * (35 + (r.burnTick || 0) * BURN_STACK_DPS), r.isBurning <= 0 && (r.burnTick = 0), Math.random() < .3 && this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
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
			// Batch 12 (Lane 1): Copperhead Rounds — poison stacks tick down.
			if ((this.eng as any).tickPoison(r, e)) { // CONTEXT-GAP: tickPoison
				this.killZombie(r, n);
				continue;
			}
			let i = this.eng.player.x - r.x, a = this.eng.player.y - r.y, o = Math.hypot(i, a);
			// Batch 7 (Lane 1): boss phases + haint illusionist tick.
			r.type === `behemoth` && (this.eng as any).tickBehemoth(r, o, e); // CONTEXT-GAP: tickBehemoth
			// Batch 13 (Lane 1): Old Ben (boss #2) attack tick.
			r.type === `old_ben` && (this.eng as any).tickOldBen(r, o, e); // CONTEXT-GAP: tickOldBen
			r.type === `haint` && (this.eng as any).tickHaint(r, e); // CONTEXT-GAP: tickHaint
			r.type === `illusionist` && (this.eng as any).tickIllusionist(r, e); // CONTEXT-GAP: tickIllusionist
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
			const think = o <= 900 || (this.eng.zLodTick + r.lodOff) % 3 === 0;
			r.lodThink = think;
			r.hitFlash > 0 && (r.hitFlash -= e);
			// Batch 5: body reactions decay — pop settles, squash yoyo + spin run out.
			r.yOff = (r.yOff || 0) * Math.max(0, 1 - e * 8);
			r.squashT = Math.max(0, (r.squashT || 0) - e);
			r.spinT = Math.max(0, (r.spinT || 0) - e);
			if (think) {
			let s = Math.hypot(r.hearX - r.x, r.hearY - r.y), c = this.eng.simTime < this.eng.bellLureUntil && this.eng.currentLocation.bell;
			const lantern = this.eng.currentLocation.lantern;
			if (this.eng.lanternLit && lantern && r.type === `shambler` && (r.ai === `wander` || r.ai === `idle`)) r.wanderAngle = Math.atan2(lantern.y - r.y, lantern.x - r.x) + (Math.random() - .5) * .7;
			// Batch 9 (Lane 1): stealth — quiet timer. Engaged/spotted zombies are
			// stimulated; wanderers with no stimulus for 6s settle into idle.
			if (r.ai === `chase` || r.ai === `attack` || r.ai === `chew` || r.ai === `spotted`) r.quietT = 6;
			else {
				r.quietT -= e;
				if (r.ai === `wander` && r.quietT <= 0) r.ai = `idle`;
			}
			if (c && this.eng.currentLocation.bell) {
				r.hearX = this.eng.currentLocation.bell.x;
				r.hearY = this.eng.currentLocation.bell.y;
				r.quietT = 6;
				r.ai = o <= r.radius + this.eng.player.radius + 2 ? `attack` : `investigate`;
			} else if (r.ai !== `chew` && r.ai !== `spotted` && this.zombieSees(r, o)) {
				r.hearX = this.eng.player.x;
				r.hearY = this.eng.player.y;
				r.quietT = 6;
				// Batch 9 (Lane 1): a sneaking player seen by an idle/wandering zombie
				// SPOTS it instead of instantly aggroing — the grace resolves below.
				if (o <= r.radius + this.eng.player.radius + 2) r.ai = `attack`;
				else if (this.eng.player.isSneaking && (r.ai === `idle` || r.ai === `wander`)) { r.ai = `spotted`; r.spottedT = 1.6; }
				else r.ai = `chase`;
			} else if (r.ai === `chase` || r.ai === `attack`) r.ai = `investigate`;
			else if ((r.ai === `wander` || r.ai === `idle`) && s > 40 && (r.hearX !== r.x || r.hearY !== r.y)) r.ai = `investigate`;
			// Batch 9 (Lane 1): spotted grace — the player has ~1.6s to break sight
			// (stand the zombie back down to wander); un-sneaking, touching, or the
			// timer expiring commits it to the chase.
			if (r.ai === `spotted`) {
				r.spottedT -= e;
				r.quietT = 6;
				const touch = o <= r.radius + this.eng.player.radius + 2;
				if (touch) r.ai = `attack`;
				else if (!this.eng.player.isSneaking) r.ai = `chase`;
				else if (!this.zombieSees(r, o)) r.ai = `wander`;
				else if (r.spottedT <= 0) r.ai = `chase`;
				if (r.ai === `spotted`) { r.hearX = this.eng.player.x; r.hearY = this.eng.player.y; }
			}
			r.ai === `idle` ? (r.wanderAngle += (Math.random() - .5) * .4 * e, r.angle = r.wanderAngle, !(this.eng.lanternLit && r.type === `shambler`) && this.tickDrift(r, e)) : r.ai === `wander` ? (r.wanderAngle += (Math.random() - .5) * .8 * e, r.angle = r.wanderAngle, !(this.eng.lanternLit && r.type === `shambler`) && this.tickDrift(r, e)) : (r.ai === `investigate` || r.ai === `spotted`) ? (r.angle = Math.atan2(r.hearY - r.y, r.hearX - r.x), r.ai === `investigate` && s < 28 && (r.ai = `wander`)) : r.angle = Math.atan2(a, i),
			(r.ai === `investigate` || r.ai === `spotted` || r.ai === `wander` || r.ai === `idle`) && (r.tx = (r.ai === `investigate` || r.ai === `spotted`) ? r.hearX : r.x, r.ty = (r.ai === `investigate` || r.ai === `spotted`) ? r.hearY : r.y), r.type === `bloater_spitter` && this.tickSpitter(r, i, a, o, e);
			let flare = null, flareDist = 1e9;
			for (const fl of this.eng.flares) {
				const fd = Math.hypot(fl.x - r.x, fl.y - r.y);
				if (fd < flareDist) { flareDist = fd; flare = fl; }
			}
			const melee = o <= r.radius + this.eng.player.radius + 10;
			if (r.ai !== `chew` && flare && !melee && flareDist < 640 && (this.eng.player.isSneaking || flareDist + 36 < o)) {
				r.hearX = flare.x;
				r.hearY = flare.y;
				r.quietT = 6; // Batch 9 (Lane 1): a fresh stimulus resets the quiet timer.
				r.ai = flareDist < 48 ? `wander` : `investigate`;
				r.angle = Math.atan2(flare.y - r.y, flare.x - r.x);
			}
			r.ai === `wander` && Math.random() < e * .1 && ((this.eng as any).emitJuice('floater', { x: r.x, y: r.y - 18, text: `...`, color: `#5b6470` }), (this.eng as any).drainJuiceEvents());
			}
			r.type === `bloater_spitter` && this.tickSpitter(r, i, a, o, e);
			let u = r.speed;
			r.type === `behemoth` && r.health < r.maxHealth * .4 && (u *= 1.4), r.type === `behemoth` && r.enraged && (u *= this.eng.behemothPhases.enrageSpeedMul), r.bossPhase === `charge` && (r.chargeWindupT > 0) && (u = 0), r.type === `old_ben` && ((r.benWindupT || 0) > 0 || r.benDashing) && (u = 0), r.ai === `wander` && (u *= .35), r.ai === `idle` && (u *= .15), r.ai === `investigate` && (u *= .7), r.ai === `spotted` && (u = 0), r.type === `bloater_spitter` && (r.ai === `chase` || r.ai === `attack`) && o <= 420 && o >= 260 && (u *= .5), (r.frenzyUntil || 0) > this.eng.simTime && (u *= 1.35);
			// Batch 8: arrive steering — damps approach speed within ~60u of the
			// target so the horde eases in instead of pile-driving at full speed.
			const stopD = r.radius + this.eng.player.radius;
			if ((r.ai === `chase` || r.ai === `attack`) && o < stopD + 60) {
				const ak = Math.max(0, Math.min(1, (o - stopD) / 60));
				u *= .25 + .75 * ak;
			}
			r.lastSpd = u;
			if (r.stunUntil && this.eng.simTime < r.stunUntil) u = 0;
			else if (this.eng.worldSlow > 0) u *= .4;
			let d = e * 60, f, p;
			if ((r.ai === `chase` || r.ai === `attack` || r.ai === `chew`) && u > 0) {
				const flow = this.eng.flow.dir(r.x, r.y);
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
				if (o < 240 && o > 8 && r.type !== `behemoth` && r.type !== `old_ben` && r.type !== `miner_brute`) {
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
			const boardMul = 1 + this.eng.wave * .04;
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
			const sq = this.queryZombies(r.x, r.y, 26 + (this.eng.zhashMaxR || 0), []);
			for (const k of sq) {
				if (k === n || snb >= 6) continue;
				const oth = this.eng.zombies[k];
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
			for (let e = 0; e < this.eng.zombies.length; e++) {
				if (n === e) continue;
				let t = this.eng.zombies[e];
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
			o <= r.radius + this.eng.player.radius && t - r.lastAttackTime >= r.attackCooldown && (r.lastAttackTime = t, r.atkT = .05, this.eng.invuln <= 0 && (this.eng.lastKiller = r.type, r.damage > 0 && (this.eng as any).damagePlayer(this.zombieMeleeDmg(r), r))); // CONTEXT-GAP: damagePlayer
		}
		(this.eng as any).drainJuiceEvents();
	}

	boneBurst(z: any) {
		const extra = (this.eng as any).boon(`bone`); // CONTEXT-GAP: boon
		const count = (z.type === `behemoth` ? 6 : 3) + extra;
		const dmg = (z.type === `behemoth` ? 48 : z.type === `miner_brute` || z.type === `bloater_spitter` ? 55 : 70) + extra * 10;
		const near = this.eng.zombies
			.map((o) => ({ o, d: Math.hypot(o.x - z.x, o.y - z.y) }))
			.filter((n) => n.d < 200 * this.eng.bpBlastMul && n.d > 0)
			.sort((a, b) => a.d - b.d)
			.slice(0, count);
		const fire = (a: any) => this.eng.bullets.push(Object.assign((this.eng as any).allocBullet(), { // CONTEXT-GAP: allocBullet
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
			this.eng.bullets.push(Object.assign((this.eng as any).allocBullet(), { // CONTEXT-GAP: allocBullet
				id: Math.random().toString(),
				x: this.eng.player.x,
				y: this.eng.player.y,
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
		(this.eng as any).emitJuice('shake', { amount: 4 });
		(this.eng as any).drainJuiceEvents();
	}

	killZombie(e: any,  t: any) {
		// Batch 6: codex discovery — first kill of each zombie type.
		this.eng.codexSeen?.add(e.type);
		// Batch 12 (Lane 1): drop copperhead poison state with the corpse.
		this.eng.poison.delete(e);
		// Batch 2: volatile affix — the elite pops, and takes the crowd with it.
		if (e.affix === `volatile`) {
			const R = 130, dmg = Math.round(e.maxHealth * .5);
			for (let i = this.eng.zombies.length - 1; i >= 0; i--) {
				const z = this.eng.zombies[i];
				if (z === e || Math.hypot(z.x - e.x, z.y - e.y) > R) continue;
				z.health -= dmg;
				(this.eng as any).emitJuice('bloodParticles', { x: z.x, y: z.y, angle: Math.atan2(z.y - e.y, z.x - e.x) });
				(this.eng as any).drainJuiceEvents();
				if (z.health <= 0) this.killZombie(z, i);
			}
			if (Math.hypot(this.eng.player.x - e.x, this.eng.player.y - e.y) < R) (this.eng as any).damagePlayer(15); // CONTEXT-GAP: damagePlayer
			(this.eng as any).emitJuice('shockwave', { x: e.x, y: e.y, r: 10, maxR: R, life: .4, maxLife: .4, color: `#ff6b35` });
			(this.eng as any).drainJuiceEvents();
			this.eng.trauma = Math.min(1, this.eng.trauma + .3 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
			soundEngine.tone({ f: 90, f2: 30, type: `sine`, dur: .5, vol: .5 });
			(this.eng as any).emitJuice('floater', { x: e.x, y: e.y - 30, text: `VOLATILE POP`, color: `#ff6b35` });
			(this.eng as any).drainJuiceEvents();
		}
		// Batch 2: splitter — bloaters pop into crawlers.
		if (e.type === `bloater_spitter`) {
			for (let k = 0; k < 2; k++) {
				const c = this.pushZombie(`crawler`, e.x + (Math.random() - .5) * 30, e.y + (Math.random() - .5) * 30);
				c.ai = `chase`;
			}
			(this.eng as any).emitJuice('bloodParticles', { x: e.x, y: e.y, angle: Math.random() * Math.PI * 2 });
			(this.eng as any).drainJuiceEvents();
		}
		const comboBefore = Math.floor(this.eng.comboMultiplier);
		this.eng.zombies.splice(t, 1), this.eng.stats.kills++, (this.eng as any).bumpLifetime(`kills`), this.eng.lastKillTime = Date.now(), this.eng.comboMultiplier = Math.min(5, this.eng.comboMultiplier + .25); // CONTEXT-GAP: bumpLifetime
		// Batch 12 (Lane 1): elite hunt — track marked kills per wave. Dropping
		// the whole pack inside the wave pays the hunt bonus.
		if (this.eng.huntTargets.includes(e)) {
			this.eng.huntTargets = this.eng.huntTargets.filter((z: any) => z !== e);
			const hs = this.eng.huntState;
			if (hs && hs.wave === this.eng.wave && !hs.done) {
				hs.killed++;
				if (hs.killed >= hs.total) { hs.done = true; (this.eng as any).grantHuntBonus(); } // CONTEXT-GAP: grantHuntBonus
			}
		}
		// Batch 10 (Lane 1): corpse permanence — fading body decal, capped.
		(this.eng as any).emitJuice('corpse', { x: e.x, y: e.y, radius: e.radius });
		(this.eng as any).drainJuiceEvents();
		// Batch 10 (Lane 1): last-kill slow-mo — the final zombie of the wave
		// buys 1s at 0.5x. Only when the wave is truly spent.
		if (this.eng.waveState === `active` && this.eng.zombiesToSpawn === 0 && this.eng.zombies.length === 0) {
			this.eng.lastKillSlowT = 1;
			(this.eng as any).emitJuice('floater', { x: e.x, y: e.y - 40, text: `WAVE CLEAR`, color: `#d4a017` });
			(this.eng as any).drainJuiceEvents();
		}
		// VS-1: Harvest Streak — 3s kill window, bonus capped at 30.
		this.eng.streak = this.eng.simTime - this.eng.lastStreakKill <= 3 ? this.eng.streak + 1 : 1;
		this.eng.lastStreakKill = this.eng.simTime;
		this.eng.streakTimer = 3;
		if (this.eng.streak > this.eng.maxStreak) this.eng.maxStreak = this.eng.streak;
		// Batch 9: kill surge climbs +0.18 per kill, capped at 1.
		this.eng.killSurge = Math.min(1, this.eng.killSurge + .18), this.driveKillSurge();
		const streakBonus = Math.min(this.eng.streak, 30);
		(this.eng as any).addScore(streakBonus); // CONTEXT-GAP: addScore
		if (this.eng.streak >= 10) (this.eng as any).emitJuice('floater', { x: e.x, y: e.y - e.radius - 10, text: `HARVEST x${this.eng.streak}`, color: (this.eng as any).streakColor() }); (this.eng as any).drainJuiceEvents(); // CONTEXT-GAP: streakColor
		soundEngine.playKillSub();
		// Batch 5: combo-pitched kill SFX, kill surge, and beast/growl mix.
		// Batch 9 (Lane 3): combo-pitched kill SFX now routes through the pure
		// killPitchHz(combo) = 300 + min(combo,20)*30 Hz formula.
		soundEngine.killSound(this.eng.streak);
		soundEngine.bumpSurge();
		soundEngine.setBeastMix(Math.min(1, (this.eng.beastDmgAcc || 0) / 600), this.eng.streak);
		(this.eng as any).feelKill(e); // CONTEXT-GAP: feelKill
		// Batch 5: kill-word floater (pooled, same 40-cap discipline as damage numbers).
		(this.eng as any).emitJuice('killWord', { x: e.x, y: e.y - e.radius - 18 });
		(this.eng as any).drainJuiceEvents();
		// Batch 5: directional blood spray (velocity scales with the killing hit's power).
		(this.eng as any).emitJuice('bloodSpray', { x: e.x, y: e.y, angle: e.lastHitAngle ?? Math.random() * Math.PI * 2, power: e.lastHitPower ?? 30 });
		(this.eng as any).drainJuiceEvents();
		// Batch 5: expanding white kill ring (~4.2x the zombie's radius).
		(this.eng as any).emitJuice('shockwave', { x: e.x, y: e.y, r: 8, maxR: e.radius * 4.2, life: .35, maxLife: .35, color: `#ffffff`, b5: true });
		(this.eng as any).drainJuiceEvents();
		// Batch 5: brief screen-space flash at the kill's position.
		if (this.eng.hitFlashes.length < 16) (this.eng as any).emitJuice('hitFlash', { x: e.x, y: e.y, life: .14, maxLife: .14 }); (this.eng as any).drainJuiceEvents();
		const comboAfter = Math.floor(this.eng.comboMultiplier);
		if (comboAfter > comboBefore && comboAfter >= 2) {
			(this.eng as any).emitJuice('floater', { x: this.eng.player.x, y: this.eng.player.y - 56, text: `STREAK x${comboAfter}`, color: "#ffd700" });
			(this.eng as any).drainJuiceEvents();
			// Balance: halved streak payout (2 orbs, was 4) — early XP economy ran too hot
			for (let i = 0; i < 2; i++) {
				const a = Math.random() * Math.PI * 2;
				const g1 = this.eng.gritPool.pop() || {};
				g1.id = `grit-${(this.eng._gritSeq = (this.eng._gritSeq || 0) + 1)}`; // Batch 10 (Lane 1): stable id for the Lane 2 pickup pop-in tween
				g1.x = this.eng.player.x; g1.y = this.eng.player.y; g1.vx = Math.cos(a) * 160; g1.vy = Math.sin(a) * 160; g1.value = comboAfter; g1.lucky = false;
				this.eng.grit.push(g1);
			}
			soundEngine.playPowerup();
		}
		(this.eng as any).spawnGrit(e); // CONTEXT-GAP: spawnGrit
		// Batch 13 (Lane 1): Old Ben death — grit shower, guaranteed boon
		// draft, boss codex entry, WJPS callout.
		if (e.type === `old_ben`) (this.eng as any).oldBenDeath(e); // CONTEXT-GAP: oldBenDeath
		// Batch 4: elites sometimes cough up a Dust Devil.
		if (e.elite && Math.random() < .3) (this.eng as any).dropVacuumAt(e.x, e.y); // CONTEXT-GAP: dropVacuumAt
		if (e.type === `bomber`) {
			// Batch 6 (Lane A): formal spec — blastRadius / blastDamage with the existing falloff.
			// Batch 10 (Lane 4): brine boosts bomber blasts and leaves a burning patch.
			const R = this.eng.b6blastR;
			(this.eng as any).emitJuice('shake', { amount: 7 });
			(this.eng as any).drainJuiceEvents();
			for (const z of this.eng.zombies) {
				const bd = Math.hypot(z.x - e.x, z.y - e.y);
				// Batch 3: explosion falloff — edge of the blast hurts less.
				if (bd < R) { const bf = 1 - bd / R; z.health -= Math.round(this.eng.b6blastDmg * bf * brineExplosionMul((this.eng as any).boon(`brinebarrel`))); z.hitFlash = 0.08; } // CONTEXT-GAP: boon
			}
			(this.eng as any).spawnBrinePatch(e.x, e.y); // CONTEXT-GAP: spawnBrinePatch
			for (let k = 0; k < 14; k++) this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { x: e.x, y: e.y, vx: (Math.random() - .5) * 6, vy: (Math.random() - .5) * 6, size: 4, life: .5, maxLife: .5, alpha: 1 })); // CONTEXT-GAP: allocParticle
			const pd = Math.hypot(this.eng.player.x - e.x, this.eng.player.y - e.y);
			if (pd < R * .7) this.eng.player.health -= Math.round(this.eng.b6blastPlayer * (1 - pd / (R * .7)));
			soundEngine.playBarrelExplosion();
			(this.eng as any).emitJuice('scorch', { x: e.x, y: e.y, radius: 80 });
			(this.eng as any).drainJuiceEvents();
		}
		if (e.elite && this.eng.chestsThisMap < 3) {
			this.eng.chestsThisMap++;
			this.eng.chests.push({ x: e.x, y: e.y });
			if (Math.random() < .35) (this.eng as any).dropCacheAt(e.x + 30, e.y); // VS-3: elites drop Storm Cellar Caches // CONTEXT-GAP: dropCacheAt
			(this.eng as any).emitJuice('floater', { x: e.x, y: e.y - e.radius - 14, text: "ELITE DOWN — CHEST", color: "#ffd700" });
			(this.eng as any).drainJuiceEvents();
		}
		(this.eng as any).tickBounty(`kill`); // CONTEXT-GAP: tickBounty
		if (e.shatter) this.boneBurst(e);
		if (!e.elite && (e.type === `behemoth` || e.type === `miner_brute` || e.type === `bloater_spitter`) && this.eng.chestsThisMap < 2) {
			this.eng.chestsThisMap++;
			this.eng.chests.push({ x: e.x, y: e.y });
			(this.eng as any).emitJuice('floater', { x: e.x, y: e.y - e.radius - 14, text: "CHEST", color: "#f6c453" });
			(this.eng as any).drainJuiceEvents();
		}
		if (this.eng.simTime - this.eng.rushWindow > 5) this.eng.rushKills = 0;
		this.eng.rushWindow = this.eng.simTime;
		this.eng.rushKills++;
		if (this.eng.rushKills >= 4 && this.eng.bloodRush <= 0) {
			this.eng.rushKills = 0;
			this.eng.bloodRush = 2.8;
			this.eng.worldSlow = Math.max(this.eng.worldSlow, 2.2);
			this.eng.player.stamina = Math.min(this.eng.player.maxStamina, this.eng.player.stamina + 35);
			this.eng.trauma = Math.min(1, this.eng.trauma + .45 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
			this.eng.hitstop = Math.max(this.eng.hitstop, (.08) * (this.eng as any).tune('hitstop')); // CONTEXT-GAP: tune
			(this.eng as any).emitJuice('floater', { x: this.eng.player.x, y: this.eng.player.y - 40, text: "BLOOD RUSH", color: "#e11d2e" });
			(this.eng as any).drainJuiceEvents();
			this.eng.callbacks.onRadio?.("Unknown", "Don't you stop.");
			soundEngine.playPowerup();
		}
		let n = (this.eng as any).hasPowerup(`double_points`) ? 2 : 1, r = Math.round(e.scoreValue * this.eng.comboMultiplier * n); // CONTEXT-GAP: hasPowerup
		(this.eng as any).addScore(r); // CONTEXT-GAP: addScore
		(this.eng as any).stripTheDead(e); // CONTEXT-GAP: stripTheDead
		let i = (this.eng as any).getPerkLevel(`scavenger`), a = 1 + i * .35 + (this.eng as any).boon(`leavings`) * .15, o = Math.round(e.scrapValue * a * n); // CONTEXT-GAP: getPerkLevel, boon
		if (this.eng.scrap += o, this.eng.stats.scrapCollected += o, (this.eng as any).emitJuice('floater', { x: e.x, y: e.y - e.radius, text: `+${r}`, color: `#d4a017` }), this.eng.bloodDecals.push({
			x: e.x,
			y: e.y,
			radius: e.radius * (1.2 + Math.random() * .6),
			alpha: .65 + Math.random() * .25,
			rotation: Math.random() * Math.PI * 2
		}), this.eng.bloodDecals.length > 150 && this.eng.bloodDecals.shift(), Math.random() < .04) {
			let t = [
				`nuke`,
				`double_points`,
				`insta_kill`,
				`infinite_ammo`,
				`speed_boost`
			], n = t[Math.floor(Math.random() * t.length)];
			this.eng.drops.push({
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
			const medC = this.eng.player.health < this.eng.player.maxHealth * .4 ? .55 : .35; // VS-3: rubber-band health orbs when hurt
			t < medC && this.eng.player.health < this.eng.player.maxHealth ? (n = `moonshine_med`, r = 35) : t < .55 ? (n = `molotov_pickup`, r = 1) : t < .75 && (n = `scrap`, r = 25), this.eng.drops.push({
				id: Math.random().toString(),
				type: n,
				x: e.x,
				y: e.y,
				amount: r,
				duration: 25e3
			});
		}
		(this.eng as any).drainJuiceEvents();
	}

	zombieMass(type: any) {
		return type === `behemoth` ? 4.2 : type === `old_ben` ? 4.0 : type === `mound` ? 3.0 : type === `miner_brute` ? 2.6 : type === `riot_shield` ? 2.8 : type === `bloater_spitter` ? 1.8 : type === `crawler` ? 0.7 : type === `splinter` ? 0.6 : 1;
	}

	knockbackFor(weaponType: any,  zombieType: any) {
		const force = weaponType === `shotgun` ? 7 : 3;
		return (force / this.zombieMass(zombieType)) * (this.eng as any).tune(`knockback`); // CONTEXT-GAP: tune
	}

	nearestZombie(x: any,  y: any,  maxD: any) {
		let best = null, bd = maxD;
		const near = this.queryZombies(x, y, maxD, []);
		for (const i of near) {
			const z = this.eng.zombies[i];
			if (!z || z.health <= 0) continue;
			const d = Math.hypot(z.x - x, z.y - y);
			if (d < bd) { bd = d; best = z; }
		}
		return best;
	}

	// Batch 2: elite affixes — readable, telegraphed, each with a visual tell.
	// Batch 11 (Lane 1): +thorned (reflects melee/bash damage back at the
	// player — keep clear, shoot it) and +wailing (periodically wails, driving
	// nearby zombies into a faster frenzy — kill it first).
	assignAffix(z: any) {
		if (!z.elite || z.affix) return;
		const pool = [`volatile`, `vampiric`, `leaping`, `shielded`, `swift`, `frosted`, `thorned`, `wailing`];
		z.affix = pool[(Math.random() * pool.length) | 0];
		if (z.affix === `swift`) z.speed *= 1.35;
		if (z.affix === `shielded`) z.shieldHp = Math.round(z.maxHealth * .3);
		if (z.affix === `leaping`) { z.leapCd = 3; z.leapTele = 0; }
		if (z.affix === `wailing`) { z.wailCd = 2 + Math.random() * 2; }
		const label: any = { volatile: `VOLATILE`, vampiric: `VAMPIRIC`, leaping: `LEAPING`, shielded: `SHIELDED`, swift: `SWIFT`, frosted: `FROSTED`, thorned: `THORNED`, wailing: `WAILING` }[z.affix as string];
		(this.eng as any).emitJuice('floater', { x: z.x, y: z.y - z.radius - 26, text: label, color: `#ff7b72` });
		(this.eng as any).drainJuiceEvents();
		// Batch 3: elite alert howl — nearby dead hear it and come running.
		soundEngine.tone({ f: 180, f2: 420, type: `sawtooth`, dur: .7, vol: .25 });
		soundEngine.tone({ f: 420, f2: 180, type: `sawtooth`, dur: .7, vol: .2, delay: .7 });
		for (const o of this.eng.zombies) {
			if (o === z || Math.hypot(o.x - z.x, o.y - z.y) > 600) continue;
			o.ai = `chase`; o.tx = this.eng.player.x; o.ty = this.eng.player.y;
			o.hearX = this.eng.player.x; o.hearY = this.eng.player.y;
		}
		(this.eng as any).drainJuiceEvents();
	}

	// Batch 11 (Lane 1): the wail — nearby zombies get 4s of +35% speed frenzy.
	wailBlast(r: any) {
		const R = 360;
		for (const o of this.eng.zombies) {
			if (o.health <= 0) continue;
			if (Math.hypot(o.x - r.x, o.y - r.y) > R) continue;
			o.frenzyUntil = this.eng.simTime + 4;
			o.hitFlash = Math.max(o.hitFlash, .1);
		}
		(this.eng as any).emitJuice('shockwave', { x: r.x, y: r.y, r: 24, maxR: R, life: .5, maxLife: .5, color: `#c084fc` });
		(this.eng as any).drainJuiceEvents();
		(this.eng as any).emitJuice('floater', { x: r.x, y: r.y - r.radius - 24, text: `WAIL!`, color: `#c084fc` });
		(this.eng as any).drainJuiceEvents();
		this.eng.callbacks.onRadio?.(`Unknown`, `That one's wailing. The whole pack just got quicker — drop it first.`);
		soundEngine.tone({ f: 900, f2: 280, type: `sawtooth`, dur: .6, vol: .18 });
		(this.eng as any).drainJuiceEvents();
	}

	// Batch 11 (Lane 1): thorns — a thorned elite reflects 35% of melee/bash
	// damage back at the player. Counterplay: keep clear of it, shoot it.
	thornedReflect(z: any,  dealt: any) {
		if (!z || z.affix !== `thorned` || z.health <= 0 || dealt <= 0) return 0;
		const back = Math.max(1, Math.round(dealt * .35));
		this.eng.invuln = 0;
		(this.eng as any).damagePlayer(back); // CONTEXT-GAP: damagePlayer
		(this.eng as any).emitJuice('floater', { x: this.eng.player.x, y: this.eng.player.y - 44, text: `THORNS ${back}`, color: `#4ade80` });
		(this.eng as any).drainJuiceEvents();
		(this.eng as any).emitJuice('bloodParticles', { x: this.eng.player.x, y: this.eng.player.y, angle: 0 });
		(this.eng as any).drainJuiceEvents();
		soundEngine.tone({ f: 160, f2: 90, type: `square`, dur: .12, vol: .12 });
		return back;
	}

	// Batch 9: kill-surge audio drive — Lane 3 owns setKillSurge; the typeof
	// guard keeps this a no-op if the audio lane's method is ever absent.
	driveKillSurge() {
		typeof soundEngine.setKillSurge === `function` && soundEngine.setKillSurge(this.eng.killSurge);
	}

	// Batch 9: kill surge decays ~0.25/s while it sits above 0; kills push it
	// back up in killZombie, so it only falls when the killing stops.
	updateKillSurge(e: any) {
		if (this.eng.killSurge <= 0) return;
		this.eng.killSurge = Math.max(0, this.eng.killSurge - .25 * e);
		this.driveKillSurge();
	}

	// Batch 5: per-frame audio state — heartbeat follows HP, beast damage accumulator decays.
	updateBeastAudio(e: any) {
		this.eng.beastDmgAcc = (this.eng.beastDmgAcc || 0) * Math.pow(.5, e);
		if (this.eng.player && this.eng.player.maxHealth > 0) soundEngine.updateHeartbeat(this.eng.player.health / this.eng.player.maxHealth);
	}

	zombieMeleeDmg(r: any) {
		const m = r.type === `behemoth` && r.enraged ? this.eng.behemothPhases.enrageDmgMul : 1;
		return Math.round(r.damage * m);
	}

	zombieSees(z: any,  dist: any) {
		const touch = z.radius + this.eng.player.radius + 34;
		if (dist <= touch) return true;
		// Batch 7: in the dark, nothing acquires the player past the light radius.
		if (this.eng.dark && dist > Math.max(0.001, this.eng.player.lightRadius || 420)) return false;
		const sight = z.type === `sprinter` ? 300 : z.type === `behemoth` ? 380 : z.type === `crawler` ? 150 : z.type === `bloater_spitter` ? 260 : 230;
		const range = this.eng.player.isSneaking ? sight * 0.62 : this.eng.player.isSprinting ? sight * 2 : sight;
		if (dist > range) return false;
		let ang = Math.atan2(this.eng.player.y - z.y, this.eng.player.x - z.x) - z.angle;
		while (ang > Math.PI) ang -= Math.PI * 2;
		while (ang < -Math.PI) ang += Math.PI * 2;
		const cone = (z.ai === `chase` || z.ai === `attack` ? 1.35 : 0.85) * (this.eng.player.isSneaking ? 0.75 : 1);
		if (Math.abs(ang) > cone) return false;
		const steps = 5;
		for (let i = 1; i <= steps; i++) {
			const t = i / (steps + 1);
			const x = z.x + (this.eng.player.x - z.x) * t;
			const y = z.y + (this.eng.player.y - z.y) * t;
			if (this.checkObstacleCollision(x, y, 6, false)) return false;
		}
		return true;
	}

	segmentHitsCircle(x0: any,  y0: any,  x1: any,  y1: any,  br: any,  cx: any,  cy: any,  cr: any) {
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

	checkObstacleCollision(e: any,  t: any,  n: any,  r : any = true) {
		for (let r of this.eng.currentLocation.obstacles) if (e + n > r.x && e - n < r.x + r.width && t + n > r.y && t - n < r.y + r.height) return true;
		for (let r of this.eng.barricades) if (!(r.health <= 0) && e + n > r.x && e - n < r.x + r.width && t + n > r.y && t - n < r.y + r.height) return true;
		if (r) {
			for (let r of this.eng.explosiveBarrels) if (Math.hypot(e - r.x, t - r.y) < n + r.radius) return true;
		}
		return false;
	}

	smashBarricadeAt(e: any,  t: any,  n: any) {
		for (let r of this.eng.barricades) r.health <= 0 || e > r.x - 8 && e < r.x + r.width + 8 && t > r.y - 8 && t < r.y + r.height + 8 && (r.health -= n, r.health <= 0 && ((this.eng as any).emitJuice('floater', { x: r.x + r.width / 2, y: r.y, text: `SMASH`, color: `#e8e0d4` }), (this.eng as any).emitJuice('hitSparks', { x: e, y: t, color: `#b45309` })));
		(this.eng as any).drainJuiceEvents();
	}

	smashHoleAt(e: any,  t: any,  n: any) {
		for (let r of this.eng.holes) r.boarded && Math.hypot(r.x - e, r.y - t) <= r.radius + 18 && (r.boardHealth -= n, r.boardHealth <= 0 && (r.boarded = false, r.boardHealth = r.maxBoardHealth, (this.eng as any).emitJuice('floater', { x: r.x, y: r.y, text: `HOLE OPEN`, color: `#c23b22` }), soundEngine.playBoardBreak()));
		(this.eng as any).drainJuiceEvents();
	}

	nearestHole(e: any) {
		let t = null, n = e;
		for (let e of this.eng.holes) {
			let r = Math.hypot(this.eng.player.x - e.x, this.eng.player.y - e.y);
			r < n && (n = r, t = e);
		}
		return t;
	}

	boardHole(e: any) {
		if (!e.boarded) {
			if (this.eng.scrap < 25) {
				(this.eng as any).emitJuice('floater', { x: e.x, y: e.y - 20, text: `NEED SCRAP`, color: `#c23b22` });
				(this.eng as any).drainJuiceEvents();
				return;
			}
			this.eng.scrap -= 25, e.boarded = true, e.boardHealth = e.maxBoardHealth, (this.eng as any).addScore(40), (this.eng as any).emitJuice('floater', { x: e.x, y: e.y - 18, text: `BOARDED`, color: `#d4a017` }), (this.eng as any).drainJuiceEvents(), soundEngine.playBoard(); // CONTEXT-GAP: addScore
			for (let t = 0; t < 8; t++) {
				let t = Math.random() * Math.PI * 2;
				this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
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
			this.eng.holes.length > 0 && this.eng.holes.every((e) => e.boarded) && this.eng.callbacks.onRadio?.(`Unknown`, `The holes went quiet. Keep the lantern. They'll try the boards.`);
		}
		(this.eng as any).drainJuiceEvents();
	}

	personalityTarget(r: any,  i: any,  a: any,  o: any) {
		const px = this.eng.player.x, py = this.eng.player.y;
		// Batch 3: flanked zombies swing wide around the player.
		if (r.flankUntil > this.eng.simTime && r.type !== `bloater_spitter`) {
			const fdx = px - r.x, fdy = py - r.y, fd = Math.hypot(fdx, fdy) || 1;
			const fs = r.flankSide || 1;
			return [px + (-fdy / fd) * fs * 220, py + (fdx / fd) * fs * 220, .8];
		}
		// Batch 6 (Lane A): chewing zombies steer at the structure, not the player.
		if (r.ai === `chew`) return [r.chewX, r.chewY, .85];
		switch (r.type) {
			case `sprinter`:
				return [px + this.eng.moveVX * 24, py + this.eng.moveVY * 24, .65];
			case `crawler`: {
				const d = o || 1, s = r.flank || 1;
				return [px + (-a / d) * s * 130, py + (i / d) * s * 130, .65];
			}
			case `miner_brute`: {
				const ob = (this.eng as any).nearestObjective(r.x, r.y); // CONTEXT-GAP: nearestObjective
				return ob ? [ob.x, ob.y, .8] : [px, py, 0];
			}
			case `bomber`: {
				const ob = (this.eng as any).nearestObjective(r.x, r.y); // CONTEXT-GAP: nearestObjective
				let tx = px, ty = py;
				const pd = i * i + a * a;
				if (ob) { const dx = ob.x - r.x, dy = ob.y - r.y; if (dx * dx + dy * dy < pd) { tx = ob.x; ty = ob.y; } }
				// Batch 3: bombers hunt clusters — drift toward the densest nearby pack.
				if (tx === px) {
					const bq = this.queryZombies(r.x, r.y, 420, []);
					let bx = 0, by = 0, bn = 0;
					for (const k of bq) {
						const z = this.eng.zombies[k];
						if (!z || z === r || z.type === `bomber`) continue;
						bx += z.x; by += z.y; bn++;
					}
					if (bn >= 3) { tx = bx / bn; ty = by / bn; }
				}
				return [tx, ty, .8];
			}
			// Batch 6 (Lane A): ranged archetype kiting — keepDistance 260, firingRange 420.
			case `bloater_spitter`: {
				const KD = this.eng.b6spitKeep, FR = this.eng.b6spitFire;
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
					const z = this.eng.zombies[k];
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
	tickSpitter(r: any,  i: any,  a: any,  o: any,  e: any) {
		r.spitCd -= e;
		if (r.spitCd > 0 || o > this.eng.b6spitFire) return;
		r.spitCd = 2.6 + Math.random() * 1.4;
		const flight = o / 420; // spit travels ~7px/frame = 420px/s
		const lx = this.eng.player.x + this.eng.moveVX * flight, ly = this.eng.player.y + this.eng.moveVY * flight;
		const aim = Math.atan2(ly - r.y, lx - r.x) + (Math.random() - .5) * .22;
		r.angle = aim;
		this.eng.acidSpits.push({
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
		(this.eng as any).emitJuice('telegraph', { kind: `ranged`, x: r.x, y: r.y, r: 90, dur: .6 });
		(this.eng as any).drainJuiceEvents();
		soundEngine.playZombieHit(false);
		(this.eng as any).drainJuiceEvents();
	}

	// Batch 6 (Lane A): bomber formal spec — fuseRange starts the fuse, fuseTime burns
	// it down with an accelerating beep; expiry detonates via killZombie (blast uses
	// b6blastR / b6blastDmg with the existing falloff). Returns false if the bomber died.
	tickFuse(r: any,  o: any,  e: any,  n: any) {
		if (o > this.eng.b6fuseRange + r.radius + this.eng.player.radius) { r.fuseT = 0; return true; }
		if (!(r.fuseT > 0)) { r.fuseT = this.eng.b6fuseTime; r.fuseBeepT = 0; }
		r.fuseT -= e;
		const prog = 1 - Math.max(0, r.fuseT) / this.eng.b6fuseTime;
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
	tickChew(r: any,  o: any,  e: any) {
		r.chewEvalT -= e;
		if (r.chewEvalT <= 0) {
			r.chewEvalT = .3; // 3-4 decisions/sec per zombie; no per-frame structure scan
			const bias = r.type === `miner_brute` ? 2.2 : r.type === `behemoth` ? 2 : r.type === `riot_shield` ? 1.1 : r.type === `riot` ? 1 : r.type === `shambler` ? .8 : r.type === `bloater_spitter` ? .7 : r.type === `crawler` ? .5 : r.type === `sprinter` ? .15 : 0;
			let bk = ``, bx = 0, by = 0, bs = 0;
			if (bias > 0) {
				for (const h of this.eng.holes) {
					if (!h.boarded) continue;
					const d = Math.hypot(h.x - r.x, h.y - r.y);
					const u = bias / (1 + d / 140);
					if (u > bs) { bs = u; bk = `hole`; bx = h.x; by = h.y; }
				}
				for (const b of this.eng.barricades) {
					if (b.health <= 0) continue;
					const d = Math.hypot(b.x + b.width / 2 - r.x, b.y + b.height / 2 - r.y);
					const u = bias * .8 / (1 + d / 140);
					if (u > bs) { bs = u; bk = `barricade`; bx = b.x + b.width / 2; by = b.y + b.height / 2; }
				}
				for (const t of this.eng.traps) {
					if (t.kind !== `post` || !t.live || t.blown) continue;
					const d = Math.hypot(t.x - r.x, t.y - r.y);
					const u = bias * 1.3 / (1 + d / 140);
					if (u > bs) { bs = u; bk = `post`; bx = t.x; by = t.y; }
				}
			}
			let chase = 1 / (1 + o / 260);
			if (this.eng.simTime < r.chewAggroT) chase *= 2; // recently shot: player first
			if (bk && bs > chase * 1.15) {
				r.ai = `chew`; r.chewKind = bk; r.chewX = bx; r.chewY = by;
			} else if (r.ai === `chew`) {
				r.ai = `chase`; r.chewKind = ``;
			}
		}
		// A player right on top of a chewing zombie interrupts the meal.
		if (r.ai === `chew` && o <= r.radius + this.eng.player.radius + 40) { r.ai = `attack`; r.chewKind = ``; return; }
		this.chewAttack(r, e);
	}

	chewAttack(r: any,  e: any) {
		if (r.ai !== `chew`) return;
		if (Math.hypot(r.chewX - r.x, r.chewY - r.y) > 46) return;
		r.chewAtkT -= e;
		if (r.chewAtkT > 0) return;
		r.chewAtkT = .8;
		const dmg = r.damage * .35 * (1 + this.eng.wave * .04);
		if (r.chewKind === `hole`) this.smashHoleAt(r.chewX, r.chewY, dmg);
		else if (r.chewKind === `barricade`) this.smashBarricadeAt(r.chewX, r.chewY, dmg * .8);
		else if (r.chewKind === `post`) this.damagePostAt(r.chewX, r.chewY, dmg);
		r.angle = Math.atan2(r.chewY - r.y, r.chewX - r.x);
		(this.eng as any).emitJuice('hitSparks', { x: r.chewX, y: r.chewY, color: `#b45309` });
		(this.eng as any).drainJuiceEvents();
	}

	damagePostAt(x: any,  y: any,  dmg: any) {
		for (const t of this.eng.traps) {
			if (t.kind !== `post` || !t.live || t.blown) continue;
			if (Math.hypot(t.x - x, t.y - y) > 60) continue;
			t.hp = (t.hp ?? 70) - dmg;
			if (t.hp <= 0) {
				t.live = false; t.blown = true;
				(this.eng as any).emitJuice('floater', { x: t.x, y: t.y - 30, text: `POST DOWN`, color: `#c23b22` });
				(this.eng as any).drainJuiceEvents();
				soundEngine.playBoardBreak();
			}
			return;
		}
		(this.eng as any).drainJuiceEvents();
	}

	// Batch 6 (Lane A): off-screen objectives — zombies with no player stimulus drift
	// toward open holes, shrines, and the workbench so the map edges stay alive.
	tickDrift(r: any,  e: any) {
		r.driftEvalT -= e;
		if (r.driftEvalT <= 0) {
			r.driftEvalT = 1.2;
			let bk = ``, bx = 0, by = 0, bd = 1e12;
			for (const h of this.eng.holes) {
				if (h.boarded) continue;
				const dx = h.x - r.x, dy = h.y - r.y, d = dx * dx + dy * dy;
				if (d < bd) { bd = d; bk = `hole`; bx = h.x; by = h.y; }
			}
			for (const s of this.eng.shrines) {
				const dx = s.x - r.x, dy = s.y - r.y, d = dx * dx + dy * dy;
				if (d < bd) { bd = d; bk = `shrine`; bx = s.x; by = s.y; }
			}
			const wb = this.eng._wbHidden9 ? null : this.eng.currentLocation.workbench; // Batch 9: stashObjectives9 hides it.
			if (wb) {
				const dx = wb.x - r.x, dy = wb.y - r.y, d = dx * dx + dy * dy;
				if (d < bd) { bd = d; bk = `workbench`; bx = wb.x; by = wb.y; }
			}
			r.driftKind = bk; r.driftX = bx; r.driftY = by;
			// Batch 9 (Lane 1): off-screen objective fallback — with no objectives
			// left on the map, drift toward the map center so the edges stay alive.
			if (!r.driftKind) { r.driftKind = `center`; r.driftX = this.eng.currentLocation.mapWidth / 2; r.driftY = this.eng.currentLocation.mapHeight / 2; }
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
		const h = this.eng.zhash, c = this.eng.zhashCell;
		h.clear();
		let maxR = 20;
		for (let k = 0; k < this.eng.zombies.length; k++) {
			const z = this.eng.zombies[k];
			if (z.radius > maxR) maxR = z.radius;
			const key = Math.floor(z.x / c) * 4096 + Math.floor(z.y / c);
			let cell = h.get(key);
			if (!cell) h.set(key, cell = []);
			cell.push(k);
		}
		this.eng.zhashMaxR = maxR;
	}

	queryZombies(x: any,  y: any,  radius: any,  out: any) {
		out.length = 0;
		const c = this.eng.zhashCell;
		const x0 = Math.floor((x - radius) / c), x1 = Math.floor((x + radius) / c);
		const y0 = Math.floor((y - radius) / c), y1 = Math.floor((y + radius) / c);
		for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
			const cell = this.eng.zhash.get(cx * 4096 + cy);
			if (cell) for (let j = 0; j < cell.length; j++) out.push(cell[j]);
		}
		return out;
	}

	applyAffixDefense(z: any,  dmg: any) {
		// Batch 13 (Lane 1): mound shield aura — boss-fight tank adds shield
		// nearby non-boss adds. Old Ben and the Behemoth are never shielded.
		if (z.type !== `old_ben` && z.type !== `behemoth` && z.type !== `mound` && (this.eng as any).moundShielding(z)) dmg *= this.eng.oldBenCfg.moundShieldMul; // CONTEXT-GAP: moundShielding
		// Batch 5: riot_shield type shares the shield mechanic — shield pool absorbs,
		// damage is reduced 60% while it holds, break is a visible/audio event.
		if ((z.affix === `shielded` || z.type === `riot_shield`) && z.shieldHp > 0) {
			z.shieldHp -= dmg;
			if (z.shieldHp <= 0) {
				z.shieldHp = 0;
				(this.eng as any).emitJuice('floater', { x: z.x, y: z.y - z.radius - 10, text: z.type === `riot_shield` ? `RIOT SHIELD DOWN` : `SHIELD DOWN`, color: `#4cc3ff` });
				(this.eng as any).drainJuiceEvents();
				(this.eng as any).emitJuice('hitSparks', { x: z.x, y: z.y, color: `#e8e4da` });
				(this.eng as any).drainJuiceEvents();
				soundEngine.playZombieHit(false); // clank
				soundEngine.tone({ f: 620, f2: 170, type: `square`, dur: .18, vol: .22 });
			}
			return dmg * .4;
		}
		return dmg;
	}
}
