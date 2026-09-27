import type { SimContext } from "./context";
import { EVOLUTIONS, RUN_EVENTS, WEAPON_MAX_TABLE_LEVEL, evolutionReady, SHOWER_COUNT_MIN, SHOWER_COUNT_MAX, SHOWER_DURATION_SEC, SHOWER_MID_WAVE_SEC, HUNT_PACK_MIN, HUNT_PACK_MAX, HUNT_BONUS_GRIT_ORBS } from "../constants";
import { soundEngine } from "../../audio/soundEngine";
import { radioFor } from "../radio";

// Batch 14 (modularization) lane M3: extracted verbatim from GameEngine.
// State lives on the engine; this module holds `eng: SimContext`.
// Cross-module/engine calls use `(this.eng as any).x()` + CONTEXT-GAP.

export class WaveSim {
	constructor(private eng: SimContext) {}

	timeCurve(t = this.eng.simTime) {
		return 1 + .85 * (1 - Math.exp(-t / 320));
	}

	updateDirector() {
		for (const m of this.eng.miniBossMarks) {
			if (this.eng.simTime >= m && !this.eng.miniBossFired.has(m)) {
				this.eng.miniBossFired.add(m);
				(this.eng as any).spawnGuaranteedElite(); // CONTEXT-GAP: spawnGuaranteedElite
				(this.eng as any).emitJuice('floater', { x: this.eng.player.x, y: this.eng.player.y - 64, text: `MINI-BOSS — THE COUNTY STIRS`, color: `#c77dff` });
				(this.eng as any).drainJuiceEvents();
			}
		}
		(this.eng as any).drainJuiceEvents();
	}

	skipWaveBreak() {
		if (this.eng.waveState !== `break` || this.eng.extractActive || this.eng.bellReady || this.eng.draft || this.eng.levelHold) return;
		this.eng.waveBreakCountdown = 0;
		this.eng.startNextWave();
	}

	updateHordeEvents(e: any) {
		if (this.eng.waveState !== "active" || this.eng.extractActive || this.eng.bellReady || this.eng.wave < 2) return;
		this.eng.eventCd -= e;
		if (this.eng.eventCd > 0) return;
		this.eng.eventCd = 16 + Math.random() * 14;
		const roll = Math.random();
		const open = this.eng.holes.filter((h: any) => !h.boarded);
		if (roll < .34 && open.length) {
			const hole = open[Math.floor(Math.random() * open.length)];
			for (let i = 0; i < 3; i++) {
				const a = Math.random() * Math.PI * 2;
				(this.eng as any).pushZombie("crawler", hole.x + Math.cos(a) * (hole.radius + 10), hole.y + Math.sin(a) * (hole.radius + 10)); // CONTEXT-GAP: pushZombie
			}
			this.eng.callbacks.onRadio?.("WJPS", "They're coming up through the floor.");
			(this.eng as any).emitJuice('floater', { x: hole.x, y: hole.y - 30, text: "HOLE BURST", color: "#c23b22" });
			(this.eng as any).drainJuiceEvents();
		} else if (roll < .68) {
			for (let i = 0; i < 2; i++) {
				const edge = Math.floor(Math.random() * 4);
				let x = 60, y = 60;
				if (edge === 0) {
					x = 80 + Math.random() * (this.eng.currentLocation.mapWidth - 160);
					y = 70;
				} else if (edge === 1) {
					x = 80 + Math.random() * (this.eng.currentLocation.mapWidth - 160);
					y = this.eng.currentLocation.mapHeight - 70;
				} else if (edge === 2) {
					x = 70;
					y = 80 + Math.random() * (this.eng.currentLocation.mapHeight - 160);
				} else {
					x = this.eng.currentLocation.mapWidth - 70;
					y = 80 + Math.random() * (this.eng.currentLocation.mapHeight - 160);
				}
				(this.eng as any).pushZombie("sprinter", x, y); // CONTEXT-GAP: pushZombie
			}
			this.eng.callbacks.onRadio?.("WJPS", "Two on the ridge. They're running.");
		} else {
			this.eng.fogUntil = 9;
			this.eng.callbacks.onRadio?.("WJPS", "Fog in the bottoms. Watch your beam.");
		}
		(this.eng as any).drainJuiceEvents();
	}

	updateWaveManager(e: any) {
		if (this.eng.waveState === `break`) {
			if (this.eng.extractActive || this.eng.bellReady || this.eng.draft) return;
			e - this.eng.lastBreakTick >= 1e3 && (this.eng.lastBreakTick = e, this.eng.waveBreakCountdown--, this.eng.waveBreakCountdown <= 0 && this.eng.startNextWave());
			return;
		}
		const gap = this.eng.lanternLit ? 480 : this.eng.wave === 1 ? 220 : this.eng.wave === 2 ? 200 : 240;
		if (this.eng.zombiesToSpawn > 0 && e - this.eng.lastZombieSpawnTime > gap) {
			(this.eng as any).spawnRandomZombie(); // CONTEXT-GAP: spawnRandomZombie
			this.eng.zombiesToSpawn--;
			if (this.eng.wave >= 2 && this.eng.zombiesToSpawn > 0) {
				(this.eng as any).spawnRandomZombie(); // CONTEXT-GAP: spawnRandomZombie
				this.eng.zombiesToSpawn--;
			}
			this.eng.lastZombieSpawnTime = e;
		}
		// VS-2: guaranteed elite cadence — roughly every 45 seconds of run time.
		if (this.eng.simTime - this.eng.lastEliteAt >= (this.eng as any).eliteIntervalSec()) { // Batch 9 (Lane 1): stage elite-cadence rule. // CONTEXT-GAP: eliteIntervalSec
			this.eng.lastEliteAt = this.eng.simTime;
			(this.eng as any).spawnGuaranteedElite(); // CONTEXT-GAP: spawnGuaranteedElite
		}
		if (this.eng.zombiesToSpawn === 0 && this.eng.zombies.length === 0) {
			(this.eng as any).packBetweenWaves(); (this.eng as any).sweepGritToBag(); // CONTEXT-GAP: packBetweenWaves, sweepGritToBag
			if (this.eng.waveState = `break`, this.eng.waveBreakCountdown = 6, this.eng.stats.wavesCompleted++, (this.eng as any).bumpLifetime(`wavesCleared`), this.eng.slotSpinsThisBreak = 0, (this.eng as any).rollShop(), this.eng.endlessMilestone(), this.eng.scrap += 120 + this.eng.wave * 25, soundEngine.playWaveHorn(), this.eng.callbacks.onWaveComplete(this.eng.wave), this.eng.outbreakWaves > 0 && this.eng.stats.wavesCompleted >= this.eng.outbreakWaves) this.eng.currentLocation.bell && !this.eng.bellRung ? (this.eng.bellReady = true, this.eng.callbacks.onRadio?.(`WJPS Petersburg`, `The square is yours if you can ring it. Get to the tower before they take the steps.`)) : (this.eng.extractActive = true, this.eng.callbacks.onExtractReady?.()); // CONTEXT-GAP: bumpLifetime, rollShop
			else {
				let e = radioFor(this.eng.currentLocation.id, this.eng.wave);
				this.eng.callbacks.onRadio?.(e.call, e.body);
			}
		}
	}

	endlessMilestone() {
		if (this.eng.outbreakWaves > 0 || this.eng.wave % 5 !== 0) return;
		this.eng.chests.push({ x: this.eng.player.x + 60, y: this.eng.player.y });
		this.eng.player.health = Math.min(this.eng.player.maxHealth, this.eng.player.health + 30);
		(this.eng as any).emitJuice('floater', { x: this.eng.player.x, y: this.eng.player.y - 56, text: `WAVE ${this.eng.wave} — THE COUNTY PROVIDES`, color: "#ffd700" });
		(this.eng as any).drainJuiceEvents();
		soundEngine.playPowerup();
		(this.eng as any).drainJuiceEvents();
	}

	eventMods() {
		const m = { gritMult: 1, enemySpeedMult: 1, enemyHpMult: 1, xpMult: 1 };
		for (const a of this.eng.activeEvents) {
			const def = RUN_EVENTS.find((e: any) => e.id === a.id);
			if (!def) continue;
			for (const k of Object.keys(def.modifiers)) (m as any)[k] *= (def.modifiers as any)[k];
		}
		return m;
	}

	fireEvent(ev: any) {
		this.eng.firedEvents.push(ev.id);
		this.eng.activeEvents.push({ id: ev.id, endsAt: Date.now() + ev.durationSec * 1000 });
		(this.eng as any).emitJuice('floater', { x: this.eng.player.x, y: this.eng.player.y - 72, text: ev.banner, color: "#ffd700" });
		(this.eng as any).drainJuiceEvents();
		this.eng.callbacks.onRadio?.(`WJPS Petersburg`, ev.radio);
		soundEngine.playWaveHorn();
		(this.eng as any).emitJuice('shake', { amount: 6 });
		(this.eng as any).drainJuiceEvents();
		// Batch 12 (Lane 1): event-specific payloads.
		if (ev.id === `powerup_shower`) this.eng.beginPowerupShower();
		else if (ev.id === `elite_hunt`) this.eng.beginEliteHunt();
		(this.eng as any).drainJuiceEvents();
	}

	updateEvents() {
		for (const ev of RUN_EVENTS) {
			if (this.eng.firedEvents.includes(ev.id)) continue;
			// Batch 12 (Lane 1): mid-wave events fire on their own cadence.
			if (ev.midWaveSec) continue;
			const hit = ev.trigger.type === `wave` ? this.eng.wave >= ev.trigger.wave : this.eng.simTime >= ev.trigger.seconds;
			if (hit) this.eng.fireEvent(ev);
		}
		const now = Date.now();
		for (let i = this.eng.activeEvents.length - 1; i >= 0; i--) {
			if (now >= this.eng.activeEvents[i].endsAt) this.eng.activeEvents.splice(i, 1);
		}
	}

	beginPowerupShower() {
		const n = SHOWER_COUNT_MIN + Math.floor(this.eng.rng() * (SHOWER_COUNT_MAX - SHOWER_COUNT_MIN + 1));
		this.eng.powerupShower = { left: n, total: n, t: 0, interval: SHOWER_DURATION_SEC / n };
	}

	updatePowerupShower(dt: any) {
		// Mid-wave cadence: the shower fires SHOWER_MID_WAVE_SEC seconds into
		// its trigger wave instead of at wave start.
		for (const ev of RUN_EVENTS) {
			if (ev.id !== `powerup_shower` || this.eng.firedEvents.includes(ev.id)) continue;
			if (ev.trigger.type !== `wave` || this.eng.wave < ev.trigger.wave || this.eng.waveState !== `active`) continue;
			if (this.eng.simTime - this.eng.waveStartSim >= (ev.midWaveSec ?? SHOWER_MID_WAVE_SEC)) this.eng.fireEvent(ev);
		}
		const sh = this.eng.powerupShower;
		if (!sh) return;
		sh.t += dt;
		const w = this.eng.currentLocation.mapWidth, h = this.eng.currentLocation.mapHeight;
		while (sh.left > 0 && sh.t >= sh.interval) {
			sh.t -= sh.interval; sh.left--;
			const pool = this.eng.powerupPool;
			const type = pool[Math.floor(this.eng.rng() * pool.length)];
			const a = this.eng.rng() * Math.PI * 2, d = 160 + this.eng.rng() * 380;
			const x = Math.max(40, Math.min(w - 40, this.eng.player.x + Math.cos(a) * d));
			const y = Math.max(40, Math.min(h - 40, this.eng.player.y + Math.sin(a) * d));
			this.eng.drops.push({ id: Math.random().toString(), type, x, y, amount: type === `moonshine_med` ? 40 : 1, duration: 3e4 });
			soundEngine.tone({ f: 660, f2: 990, type: `sine`, dur: .25, vol: .15 });
		}
		if (sh.left <= 0) this.eng.powerupShower = null;
	}

	beginEliteHunt() {
		const n = HUNT_PACK_MIN + Math.floor(this.eng.rng() * (HUNT_PACK_MAX - HUNT_PACK_MIN + 1));
		this.eng.huntTargets = [];
		const pool = this.eng.wave >= 8 ? [`behemoth`, `miner_brute`, `bloater_spitter`] : this.eng.wave >= 5 ? [`miner_brute`, `bloater_spitter`, `riot`, `sprinter`] : [`sprinter`, `riot`, `bloater_spitter`];
		for (let i = 0; i < n; i++) {
			const type = pool[Math.floor(this.eng.rng() * pool.length)];
			const edge = (this.eng as any).farEdgeSpawn(480); // CONTEXT-GAP: farEdgeSpawn
			const z = (this.eng as any).pushZombie(type, edge.x, edge.y); // CONTEXT-GAP: pushZombie
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
			(this.eng as any).assignAffix(z); // CONTEXT-GAP: assignAffix
			this.eng.huntTargets.push(z);
			(this.eng as any).emitJuice('floater', { x: z.x, y: z.y - z.radius - 14, text: `MARKED ${type.replace(`_`, ` `).toUpperCase()}`, color: `#c77dff` });
			(this.eng as any).drainJuiceEvents();
		}
		this.eng.huntState = { wave: this.eng.wave, total: n, killed: 0, done: false };
		(this.eng as any).drainJuiceEvents();
	}

	grantHuntBonus() {
		// Grit shower around the player.
		for (let i = 0; i < HUNT_BONUS_GRIT_ORBS; i++) {
			const an = this.eng.rng() * Math.PI * 2;
			(this.eng as any).dropGritOrb(this.eng.player.x, this.eng.player.y, Math.cos(an) * 140, Math.sin(an) * 140, 3); // CONTEXT-GAP: dropGritOrb
		}
		this.eng.huntBonusReroll = true;
		(this.eng as any).emitJuice('floater', { x: this.eng.player.x, y: this.eng.player.y - 72, text: `HUNT COMPLETE — FREE REROLL`, color: `#ffd700` });
		(this.eng as any).drainJuiceEvents();
		this.eng.callbacks.onRadio?.(`WJPS Petersburg`, `Clean sweep on those marked ones. The county's grateful — next shop reroll's on the house.`);
		soundEngine.playPowerup();
		(this.eng as any).drainJuiceEvents();
	}

	checkEvolutions() {
		for (const r of EVOLUTIONS) {
			if (this.eng.evolutionDone[r.baseWeapon]) continue;
			const w = this.eng.weapons.find((x: any) => x.id === r.baseWeapon && x.unlocked);
			if (!evolutionReady(r, w, this.eng.boonStacks)) continue;
			this.eng.evolutionDone[r.baseWeapon] = true;
			this.eng.codexSeen?.add(`evolution_${r.baseWeapon}`);
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
			this.eng.hitstop = Math.max(this.eng.hitstop, (.35) * (this.eng as any).tune('hitstop')); // CONTEXT-GAP: tune
			(this.eng as any).emitJuice('shake', { amount: 8 * (this.eng as any).tune('shake') * (this.eng as any).motionScale() }); // CONTEXT-GAP: tune, motionScale
			(this.eng as any).drainJuiceEvents();
			(this.eng as any).emitJuice('floater', { x: this.eng.player.x, y: this.eng.player.y - 36, text: `${r.evolvedName.toUpperCase()} EVOLVED`, color: "#f6c453" });
			(this.eng as any).drainJuiceEvents();
			this.eng.callbacks.onRadio?.(`Unknown`, r.evolvedRadio);
			soundEngine.playPowerup();
			return r;
		}
		return null;
	}

	evolutionHints() {
		const out = [];
		for (const r of EVOLUTIONS) {
			if (this.eng.evolutionDone[r.baseWeapon]) continue;
			const w = this.eng.weapons.find((x: any) => x.id === r.baseWeapon && x.unlocked);
			if (!w) continue;
			const have = (this.eng as any).boon(r.requiredBoon); // CONTEXT-GAP: boon
			let bit = `${w.name} + ${r.requiredBoonName} (${have}/${r.requiredStacks}) → ${r.evolvedName}`;
			// Batch 6: show max-level + filler-pick progress alongside the boon count.
			if (r.requiredPicks) {
				const fhave = (this.eng as any).boon(r.requiredPicks.boonId); // CONTEXT-GAP: boon
				bit += ` · ${r.requiredPicks.boonId} ${fhave}/${r.requiredPicks.count}`;
			}
			bit += ` · Lv ${w.upgradeLevel ?? 0}/${WEAPON_MAX_TABLE_LEVEL}`;
			out.push(bit);
		}
		return out;
	}

	startNextWave() {
		this.eng.wave++, this.eng.waveState = `active`;
		this.eng.waveStartSim = this.eng.simTime; // Batch 12 (Lane 1): mid-wave event cadence anchor.
		this.eng.huntTargets = []; this.eng.huntState = null; // Batch 12: hunt state is per-wave.
		(this.eng as any).checkWindowChange(); // CONTEXT-GAP: checkWindowChange
		this.eng.eventCd = this.eng.wave === 1 ? 99 : 14 + Math.random() * 8;
		// Batch 4: D(t) time-curve multiplies the wave-system spawn count.
		let e = this.eng.wave === 1 ? Math.floor(18 * this.eng.difficultyMultiplier * this.eng.timeCurve()) : Math.floor((16 + this.eng.wave * 6 + Math.max(0, this.eng.wave - 10) * 4) * this.eng.difficultyMultiplier * this.eng.timeCurve());
		if (this.eng.wave > 1) e += 4;
		e = Math.floor(e * (this.eng.stageSpawnPackMul || 1)); // Batch 9 (Lane 1): stage pack-size rule.
		this.eng.lanternWentOut && (e = Math.floor(e * 1.22)), this.eng.zombiesToSpawn = e, soundEngine.playWaveHorn();
		soundEngine.setHeat(Math.min(1, Math.max(0, this.eng.wave - 1) / 7));
		this.eng.waveCall = this.eng.wave === 1 ? "Shamblers on the trace" : this.eng.wave % 5 === 0 ? "Something big is walking" : this.eng.wave >= 4 ? "Bloaters in the mix" : this.eng.wave >= 3 ? "A miner in the dark" : "Sprinters this time";
		this.eng.bounty = { kind: this.eng.wave % 2 ? "head" : "kill", need: this.eng.wave % 2 ? 4 : 8, have: 0, done: false };
		const spot = (this.eng as any).freeSpot(this.eng.player.x + (this.eng.wave % 2 ? 200 : -180), this.eng.player.y + 120); // CONTEXT-GAP: freeSpot
		this.eng.beacon = { x: spot.x, y: spot.y, hold: 0, done: false };
		if (this.eng.wave === 1) this.eng.callbacks.onRadio?.("WJPS", "They're on the trace, and they are not walking. Supply drop is painted on the ground.");
		else this.eng.callbacks.onRadio?.("WJPS", this.eng.waveCall + ". Supply drop is out.");
	}

}
