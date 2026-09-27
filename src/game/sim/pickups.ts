import type { SimContext } from "./context";
import { rollBoons, LOCKOUTS, BOON_CATALOG, sifterRadiusMul, sifterValueMul } from "../boons";
import { GRIT_GROUND_CAP, BOMB_MAX_CHARGES, SLOT_MACHINE_NAME, rollSlotSymbol, classifySlotWin, slotPairSymbol } from "../constants";
import { soundEngine } from "../../audio/soundEngine";

// Batch 14 (modularization) lane M3: extracted verbatim from GameEngine.
// State lives on the engine; this module holds `eng: SimContext`.
// Cross-module/engine calls use `(this.eng as any).x()` + CONTEXT-GAP.

export class PickupSim {
	constructor(private eng: SimContext) {}

	hasPowerup(e: any) {
		return this.eng.activePowerups.some((t: any) => t.type === e && t.durationRemaining > 0);
	}

	activatePowerup(e: any) {
		if (soundEngine.playPowerup(), e === `nuke`) {
			this.eng.detonateNuke();
			return;
		}
		// Batch 5: score_surge runs 15s (everything else 30s); HUD countdown is automatic via activePowerups.
		const dur = e === `score_surge` ? 15000 : 30000;
		let t = this.eng.activePowerups.find((t: any) => t.type === e);
		t ? (t.durationRemaining = dur, t.totalDuration = dur) : this.eng.activePowerups.push({
			type: e,
			durationRemaining: dur,
			totalDuration: dur
		}), e === `speed_boost` && (this.eng.player.stamina = this.eng.player.maxStamina);
	}

	detonateNuke() {
		soundEngine.playNuke(), this.eng.screenShake = 14;
		for (let e = 0; e < 60; e++) {
			let e = Math.random() * Math.PI * 2, t = Math.random() * 500;
			this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
				x: this.eng.player.x + Math.cos(e) * t,
				y: this.eng.player.y + Math.sin(e) * t,
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
		this.eng.zombies.length;
		for (let e = this.eng.zombies.length - 1; e >= 0; e--) {
			let t = this.eng.zombies[e];
			(this.eng as any).addScore(t.scoreValue), this.eng.scrap += t.scrapValue, this.eng.stats.kills++, (this.eng as any).bumpLifetime(`kills`), this.eng.bloodDecals.push({ // CONTEXT-GAP: addScore, bumpLifetime
				x: t.x,
				y: t.y,
				radius: t.radius * 1.5,
				alpha: .8,
				rotation: Math.random() * Math.PI * 2
			});
		}
		this.eng.zombies = [];
	}

	updatePowerups(e: any) {
		let t = e * 1e3;
		for (let e = this.eng.activePowerups.length - 1; e >= 0; e--) {
			let n = this.eng.activePowerups[e];
			n.durationRemaining -= t, n.durationRemaining <= 0 && this.eng.activePowerups.splice(e, 1);
		}
	}

	banishBoon(id: any) {
		if (this.eng.banishCharges <= 0 || !this.eng.draft?.some((b: any) => b.id === id)) return false;
		this.eng.banishedBoons.add(id);
		this.eng.banishCharges--;
		this.eng.draft = this.eng.draft.filter((b: any) => b.id !== id);
		const rest = rollBoons(this.eng.boonStacks, this.eng.player.molotovs, this.eng.player.maxMolotovs, this.eng.posts, this.eng.pipes, this.eng.draftExclusions()).filter((b: any) => !this.eng.draft.some((d: any) => d.id === b.id));
		if (rest.length > 0) this.eng.draft.push(rest[0]);
		this.eng.callbacks.onDraft?.(this.eng.draft);
		(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 48, `RUN OUT OF THE COUNTY`, `#c77dff`); // CONTEXT-GAP: spawnFloater
		soundEngine.playBanish();
		return true;
	}

	updatePowerupDrops() {
		if (this.eng.draft) return; // drops during the break breather too
		if (this.eng.simTime >= this.eng.nextPowerupAt) {
			this.eng.nextPowerupAt = this.eng.simTime + 75 + this.eng.rng() * 30;
			const pool = this.eng.powerupPool;
			const type = pool[(this.eng.rng() * pool.length) | 0];
			const a = this.eng.rng() * Math.PI * 2, d = 120 + this.eng.rng() * 80;
			this.eng.drops.push({ id: Math.random().toString(), type, x: this.eng.player.x + Math.cos(a) * d, y: this.eng.player.y + Math.sin(a) * d, amount: type === `moonshine_med` ? 40 : 1, duration: 3e4 });
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 56, `SUPPLY DROP`, `#4cc3ff`); // CONTEXT-GAP: spawnFloater
			soundEngine.tone({ f: 660, f2: 990, type: `sine`, dur: .25, vol: .2 });
		}
	}

	updateScoreMulDrops() {
		if (this.eng.draft) return;
		if (this.eng.simTime >= this.eng.nextScoreMulAt) {
			this.eng.nextScoreMulAt = this.eng.simTime + 25 + this.eng.rng() * 15;
			const a = this.eng.rng() * Math.PI * 2, d = 120 + this.eng.rng() * 80;
			this.eng.drops.push({ id: Math.random().toString(), type: `score_surge`, x: this.eng.player.x + Math.cos(a) * d, y: this.eng.player.y + Math.sin(a) * d, amount: 1, duration: 3e4 });
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 56, `SCORE SURGE`, `#4cc3ff`); // CONTEXT-GAP: spawnFloater
			soundEngine.tone({ f: 880, f2: 1320, type: `sine`, dur: .25, vol: .2 });
		}
	}

	updateCacheTimer() {
		if (this.eng.draft) return;
		if (this.eng.simTime >= this.eng.nextCacheAt) {
			this.eng.nextCacheAt = this.eng.simTime + 140 + this.eng.rng() * 40;
			const a = this.eng.rng() * Math.PI * 2;
			this.eng.caches.push({ id: Math.random().toString(), x: this.eng.player.x + Math.cos(a) * 220, y: this.eng.player.y + Math.sin(a) * 220 });
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 64, `STORM CELLAR OPEN`, `#c77dff`); // CONTEXT-GAP: spawnFloater
			this.eng.callbacks.onRadio?.(`Unknown`, `A storm cellar door just creaked open somewhere close. What's down there's yours if you want it.`);
			soundEngine.tone({ f: 220, f2: 110, type: `triangle`, dur: .5, vol: .25 });
		}
	}

	dropCacheAt(x: any, y: any) {
		if (this.eng.caches.length >= 3) return;
		this.eng.caches.push({ id: Math.random().toString(), x, y });
	}

	spinCache() {
		const syms = [];
		for (let i = 0; i < 3; i++) {
			const r = Math.random();
			syms.push(r < .15 ? `seven` : r < .45 ? `star` : `diamond`);
		}
		return syms;
	}

	spinSlots(forcedReels: any) {
		if (!this.eng.player || !this.eng.weapons) return { ok: false, reason: `invalid` };
		if (this.eng.waveState !== `break`) return { ok: false, reason: `not-break` };
		const cost = (this.eng as any).slotSpinCost(); // CONTEXT-GAP: slotSpinCost
		if (this.eng.gritBag < cost) return { ok: false, reason: `broke`, cost, grit: Math.round(this.eng.gritBag) };
		this.eng.gritBag = Math.max(0, this.eng.gritBag - cost);
		this.eng.slotSpinsThisBreak++;
		const reels = forcedReels || [rollSlotSymbol(), rollSlotSymbol(), rollSlotSymbol()];
		const res = this.eng.resolveSlotPrize(reels);
		soundEngine.tone({ f: 660, f2: 990, type: `triangle`, dur: .15, vol: .15 });
		return { ok: true, reels, jackpot: res.jackpot, prize: res.prize, prizeDetail: res.detail, cost, grit: Math.round(this.eng.gritBag), spins: this.eng.slotSpinsThisBreak };
	}

	resolveSlotPrize(reels: any) {
		if (!Array.isArray(reels) || reels.length !== 3) return { jackpot: false, prize: `INVALID`, detail: {} };
		const kind = classifySlotWin(reels);
		const [a] = reels;
		const px = this.eng.player.x, py = this.eng.player.y;
		if (kind === `jackpot`) {
			// 7-7-7 JACKPOT: instantly max a random unlocked weapon's table
			// level, then the evolution check runs after.
			const owned = this.eng.weapons.filter((w: any) => w.unlocked);
			const w = owned.length ? owned[(Math.random() * owned.length) | 0] : null;
			let n = 0;
			if (w) while ((this.eng as any).upgradeWeaponOnce(w)) n++; // CONTEXT-GAP: upgradeWeaponOnce
			const evo = (this.eng as any).checkEvolutions(); // CONTEXT-GAP: checkEvolutions
			(this.eng as any).spawnFloater(px, py - 64, `7-7-7 JACKPOT`, `#ffd700`); // CONTEXT-GAP: spawnFloater
			(this.eng as any).spawnFloater(px, py - 44, w ? `${w.name.toUpperCase()} MAXED` : `NO GUN TO MAX`, `#f6c453`); // CONTEXT-GAP: spawnFloater
			this.eng.callbacks.onRadio?.(`Unknown`, `Seven seven seven on the ${SLOT_MACHINE_NAME}. Somebody in Pike County just got very loud.`);
			soundEngine.tone({ f: 523, type: `square`, dur: .12, vol: .2 });
			soundEngine.tone({ f: 659, type: `square`, dur: .12, vol: .2, delay: .12 });
			soundEngine.tone({ f: 784, type: `square`, dur: .3, vol: .25, delay: .24 });
			this.eng.trauma = Math.min(1, this.eng.trauma + .4 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
			return { jackpot: true, prize: `JACKPOT`, detail: { weapon: w ? w.id : null, upgrades: n, evolved: evo ? evo.evolvedName : null } };
		}
		if (kind === `three`) {
			if (a === `grit_bag`) {
				this.eng.gritBag += 400;
				for (let i = 0; i < 10; i++) { const an = Math.random() * Math.PI * 2; this.eng.dropGritOrb(px, py, Math.cos(an) * 140, Math.sin(an) * 140, 3); }
				(this.eng as any).spawnFloater(px, py - 48, `GRIT SHOWER +400`, `#e8b34b`); // CONTEXT-GAP: spawnFloater
				this.eng.callbacks.onRadio?.(`Unknown`, `Three grit bags on the machine. The Patoka just paid out.`);
				return { jackpot: false, prize: `GRIT SHOWER`, detail: { grit: 400 } };
			}
			if (a === `moonshine`) {
				this.eng.player.health = Math.min(this.eng.player.maxHealth, this.eng.player.health + 80);
				if (this.eng.player.molotovs < (this.eng.player.maxMolotovs || 3)) this.eng.player.molotovs++;
				(this.eng as any).spawnFloater(px, py - 48, `MOONSHINE RUN +80 HP`, `#4cc3ff`); // CONTEXT-GAP: spawnFloater
				return { jackpot: false, prize: `MOONSHINE RUN`, detail: { heal: 80, molotov: true } };
			}
			if (a === `horseshoe`) {
				if (this.eng.bombCharges < BOMB_MAX_CHARGES) this.eng.bombCharges += 2;
				else this.eng.player.health = Math.min(this.eng.player.maxHealth, this.eng.player.health + 60);
				(this.eng as any).spawnFloater(px, py - 48, `LUCKY SHOE +2 POWDER`, `#ffd700`); // CONTEXT-GAP: spawnFloater
				return { jackpot: false, prize: `LUCKY SHOE`, detail: { bombCharges: 2 } };
			}
			// three cylinders: full cylinder — 3 random weapon upgrades.
			const owned = this.eng.weapons.filter((w: any) => w.unlocked);
			let n = 0;
			for (let i = 0; i < 3 && owned.length; i++) if ((this.eng as any).upgradeWeaponOnce(owned[(Math.random() * owned.length) | 0])) n++; // CONTEXT-GAP: upgradeWeaponOnce
			(this.eng as any).spawnFloater(px, py - 48, `FULL CYLINDER +${n} UPGRADES`, `#f6c453`); // CONTEXT-GAP: spawnFloater
			return { jackpot: false, prize: `FULL CYLINDER`, detail: { upgrades: n } };
		}
		if (kind === `pair`) {
			const s = slotPairSymbol(reels);
			if (s === `moonshine`) {
				this.eng.player.health = Math.min(this.eng.player.maxHealth, this.eng.player.health + 40);
				(this.eng as any).spawnFloater(px, py - 40, `PAIR OF JUGS +40 HP`, `#4cc3ff`); // CONTEXT-GAP: spawnFloater
				return { jackpot: false, prize: `PAIR OF JUGS`, detail: { heal: 40 } };
			}
			if (s === `horseshoe`) {
				if (this.eng.bombCharges < BOMB_MAX_CHARGES) { this.eng.bombCharges++; (this.eng as any).spawnFloater(px, py - 40, `PAIR OF SHOES +1 POWDER`, `#ffd700`); return { jackpot: false, prize: `PAIR OF SHOES`, detail: { bombCharges: 1 } }; } // CONTEXT-GAP: spawnFloater
				this.eng.player.health = Math.min(this.eng.player.maxHealth, this.eng.player.health + 25);
				(this.eng as any).spawnFloater(px, py - 40, `PAIR OF SHOES +25 HP`, `#ffd700`); // CONTEXT-GAP: spawnFloater
				return { jackpot: false, prize: `PAIR OF SHOES`, detail: { heal: 25 } };
			}
			if (s === `cylinder`) {
				const owned = this.eng.weapons.filter((w: any) => w.unlocked);
				const w = owned.length ? owned[(Math.random() * owned.length) | 0] : null;
				const okUp = w ? (this.eng as any).upgradeWeaponOnce(w) : false; // CONTEXT-GAP: upgradeWeaponOnce
				(this.eng as any).spawnFloater(px, py - 40, okUp ? `PAIR — ${w.name.toUpperCase()} +1` : `PAIR — NO UPGRADE`, `#f6c453`); // CONTEXT-GAP: spawnFloater
				return { jackpot: false, prize: `PAIR`, detail: { weapon: w ? w.id : null, upgraded: !!okUp } };
			}
			if (s === `seven`) {
				this.eng.gritBag += 250;
				(this.eng as any).spawnFloater(px, py - 40, `LUCKY SEVENS +250 GRIT`, `#e8b34b`); // CONTEXT-GAP: spawnFloater
				return { jackpot: false, prize: `LUCKY SEVENS`, detail: { grit: 250 } };
			}
			// pair of grit bags: grit shower.
			this.eng.gritBag += 150;
			(this.eng as any).spawnFloater(px, py - 40, `GRIT SHOWER +150`, `#e8b34b`); // CONTEXT-GAP: spawnFloater
			return { jackpot: false, prize: `GRIT SHOWER`, detail: { grit: 150 } };
		}
		// Loser spin: the machine clanks, tosses back a consolation handful.
		this.eng.gritBag += 25;
		return { jackpot: false, prize: `CLANK`, detail: { grit: 25 } };
	}

	applyCacheResult(symbols: any, doubled = false) {
		const mult = doubled ? 2 : 1;
		const sevens = symbols.filter((s: any) => s === `seven`).length;
		const stars = symbols.filter((s: any) => s === `star`).length;
		const diamonds = symbols.filter((s: any) => s === `diamond`).length;
		if (sevens === 3) {
			// 7-7-7 JACKPOT: every owned weapon to max upgrade.
			const n = (this.eng as any).maxOutWeapons(); // CONTEXT-GAP: maxOutWeapons
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 56, `7-7-7 JACKPOT — ${n} UPGRADES`, `#ffd700`); // CONTEXT-GAP: spawnFloater
			this.eng.callbacks.onRadio?.(`Unknown`, `Seven seven seven. The cellar just made you the best-armed soul in Pike County.`);
			soundEngine.tone({ f: 523, type: `square`, dur: .12, vol: .2 });
			soundEngine.tone({ f: 659, type: `square`, dur: .12, vol: .2, delay: .12 });
			soundEngine.tone({ f: 784, type: `square`, dur: .3, vol: .25, delay: .24 });
			this.eng.trauma = Math.min(1, this.eng.trauma + .4 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: tune, motionScale
			return `jackpot`;
		}
		const owned = this.eng.weapons.filter((w: any) => w.unlocked);
		const up = (k: any) => { for (let i = 0; i < k; i++) { const w = owned[(Math.random() * owned.length) | 0]; (this.eng as any).upgradeWeaponOnce(w); } }; // CONTEXT-GAP: upgradeWeaponOnce
		// Pairs pay double for that symbol: a matching pair pays 4x the single rate.
		const sevenK = (sevens === 2 ? 4 : sevens) * mult, starK = (stars === 2 ? 4 : stars) * mult, diaK = (diamonds === 2 ? 4 : diamonds) * mult;
		if (sevenK > 0 && owned.length) { up(sevenK); (this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 48, `+${sevenK} WEAPON UPGRADE${sevenK > 1 ? `S` : ``}`, `#f6c453`); } // CONTEXT-GAP: spawnFloater
		if (starK > 0) {
			for (let i = 0; i < starK; i++) {
				if (this.eng.bombCharges < BOMB_MAX_CHARGES) this.eng.bombCharges++;
				else this.eng.player.health = Math.min(this.eng.player.maxHealth, this.eng.player.health + 40);
			}
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 40, `STAR CACHÉ x${starK}`, `#4cc3ff`); // CONTEXT-GAP: spawnFloater
		}
		if (diaK > 0) {
			const scrap = 120 * diaK;
			this.eng.scrap += scrap; this.eng.stats.scrapCollected += scrap;
			for (let i = 0; i < 4 * diaK; i++) { const a = Math.random() * Math.PI * 2; this.eng.dropGritOrb(this.eng.player.x, this.eng.player.y, Math.cos(a) * 130, Math.sin(a) * 130, 3); }
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 32, `+${scrap} SCRAP`, `#e8b34b`); // CONTEXT-GAP: spawnFloater
		}
		soundEngine.playPickup();
		return `cache`;
	}

	gambleCache(symbols: any, forceWin: any) {
		if (!Array.isArray(symbols) || symbols.length !== 3) return false;
		const win = (this.eng as any).gambleWinRoll(forceWin); // CONTEXT-GAP: gambleWinRoll
		if (win) {
			this.eng.applyCacheResult(symbols, true);
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 64, `DOUBLED IT`, `#ffd700`); // CONTEXT-GAP: spawnFloater
			soundEngine.tone({ f: 880, f2: 1320, type: `square`, dur: .2, vol: .2 });
		} else {
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 64, `LOST IT ALL`, `#8a8f98`); // CONTEXT-GAP: spawnFloater
			soundEngine.tone({ f: 220, f2: 110, type: `sawtooth`, dur: .35, vol: .2 });
		}
		return win;
	}

	openCache(cache: any) {
		this.eng.caches.splice(this.eng.caches.indexOf(cache), 1);
		const symbols = this.eng.spinCache();
		this.eng.cacheOpen = { symbols, resolved: false };
		this.eng.isPaused = true; // slot machine pauses the county
		this.eng.callbacks.onCache?.(symbols);
		soundEngine.tone({ f: 440, f2: 880, type: `triangle`, dur: .3, vol: .2 });
	}

	resolveCache() {
		if (!this.eng.cacheOpen) return;
		this.eng.applyCacheResult(this.eng.cacheOpen.symbols, false);
		this.eng.closeCache();
	}

	gambleCacheUI() {
		if (!this.eng.cacheOpen) return;
		this.eng.gambleCache(this.eng.cacheOpen.symbols);
		this.eng.closeCache();
	}

	closeCache() {
		this.eng.cacheOpen = null;
		this.eng.isPaused = false;
		this.eng.callbacks.onCache?.(null);
	}

	checkCachePickup() {
		for (let i = this.eng.caches.length - 1; i >= 0; i--) {
			const c = this.eng.caches[i];
			if (Math.hypot(this.eng.player.x - c.x, this.eng.player.y - c.y) > this.eng.player.radius + 26) continue;
			this.eng.openCache(c);
		}
	}

	updateFuse(dt: any) {
		this.eng.fuseTimer += dt;
		if (this.eng.fuseTimer < .6 || this.eng.grit.length < 3) return;
		this.eng.fuseTimer = 0;
		const used = new Set();
		for (let i = 0; i < this.eng.grit.length; i++) {
			const g = this.eng.grit[i];
			if (used.has(g) || g.tier >= 3) continue;
			const near = [g];
			for (let j = 0; j < this.eng.grit.length && near.length < 3; j++) {
				const h = this.eng.grit[j];
				if (h === g || used.has(h) || h.tier !== g.tier) continue;
				if (Math.hypot(h.x - g.x, h.y - g.y) < 110) near.push(h);
			}
			if (near.length < 3) continue;
			near.forEach((h: any) => used.add(h));
			const cx = near.reduce((a: any, h: any) => a + h.x, 0) / 3, cy = near.reduce((a: any, h: any) => a + h.y, 0) / 3;
			const value = near.reduce((a: any, h: any) => a + h.value, 0);
			for (const h of near) { this.eng.grit.splice(this.eng.grit.indexOf(h), 1); this.eng.gritPool.push(h); }
			this.eng.dropGritOrb(cx, cy, 0, 0, value);
			const fused = this.eng.grit[this.eng.grit.length - 1];
			if (fused) fused.tier = Math.min(3, g.tier + 1);
			(this.eng as any).spawnFloater(cx, cy - 14, `FUSED`, `#ffd700`); // CONTEXT-GAP: spawnFloater
			soundEngine.tone({ f: 520, f2: 780, type: `sine`, dur: .15, vol: .18 });
		}
	}

	updateDrops(dt = 1 / 60) {
		const magnet = (Math.max(280, (this.eng as any).viewSize().w * 0.28) + (this.eng as any).getPerkLevel(`scavenger`) * 36) * (1 + this.eng.shopMagnetBonus); // CONTEXT-GAP: viewSize, getPerkLevel
		for (let e = this.eng.drops.length - 1; e >= 0; e--) {
			let t = this.eng.drops[e];
			const dx = this.eng.player.x - t.x, dy = this.eng.player.y - t.y;
			const dist = Math.hypot(dx, dy);
			const loot = t.type === `ammo_universal` || t.type === `moonshine_med` || t.type === `molotov_pickup` || t.type === `scrap` || t.type === `dust_devil`;
			if (loot && dist < magnet && dist > this.eng.player.radius + 18) {
				const pull = (1 - dist / magnet) * 340 * dt;
				t.x += (dx / dist) * pull;
				t.y += (dy / dist) * pull;
			}
			if (Math.hypot(this.eng.player.x - t.x, this.eng.player.y - t.y) <= this.eng.player.radius + 22) {
				if (soundEngine.playPickup(), t.type === `ammo_universal`) for (let e of this.eng.weapons) e.unlocked && (e.reserveAmmo = Math.min(e.maxReserveAmmo, e.reserveAmmo + Math.floor(e.magazineSize * 1)));
				else t.type === `dust_devil` ? (this.eng.vacuumSurge = 1.6, (this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 48, `DUST DEVIL`, `#7dd3fc`)) : t.type === `moonshine_med` ? (this.eng.player.health = Math.min(this.eng.player.maxHealth, this.eng.player.health + t.amount), this.eng.player.stamina = this.eng.player.maxStamina) : t.type === `molotov_pickup` ? this.eng.player.molotovs = Math.min(this.eng.player.maxMolotovs, this.eng.player.molotovs + 1) : t.type === `scrap` ? (this.eng.scrap += t.amount, this.eng.stats.scrapCollected += t.amount) : (t.type === `nuke` || t.type === `insta_kill` || t.type === `double_points` || t.type === `infinite_ammo` || t.type === `speed_boost` || t.type === `score_surge`) && this.eng.activatePowerup(t.type); // CONTEXT-GAP: spawnFloater
				// Batch 5: score_surge pickup callout.
				t.type === `score_surge` && ((this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 56, `SCORE SURGE — 2X`, `#ffd700`), soundEngine.tone({ f: 880, f2: 1320, type: `triangle`, dur: .2, vol: .2 })); // CONTEXT-GAP: spawnFloater
				this.eng.drops.splice(e, 1);
			}
		}
	}

	boon(id: string) {
		return this.eng.boonStacks[id] || 0;
	}

	offerDraft() {
		this.eng.draft = rollBoons(this.eng.boonStacks, this.eng.player.molotovs, this.eng.player.maxMolotovs, this.eng.posts, this.eng.pipes, this.eng.draftExclusions());
		this.eng.callbacks.onDraft?.(this.eng.draft);
	}

	draftExclusions() {
		return new Set([...this.eng.banishedBoons, ...this.eng.lockedBoons]);
	}

	checkBreakpoint(id: any) {
		if ((this.eng.boonStacks[id] || 0) !== 6 || this.eng.breakpointsHit.has(id)) return;
		this.eng.breakpointsHit.add(id);
		const label = ({ lead: `WHITE-HOT LEAD`, trigger: `HAIR TRIGGER`, bone: `BONE ORCHARD`, ring: `FULL CIRCLE`, storm: `STORM'S EYE` } as any)[id];
		if (!label) return;
		if (id === `lead`) this.eng.bpDamageMul = 1.3;
		if (id === `trigger`) this.eng.bpFireMul = .85;
		if (id === `bone`) this.eng.bpBlastMul = 1.4;
		if (id === `ring`) this.eng.bpOrbiters = 2;
		if (id === `storm`) this.eng.bpChains = 2;
		(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 64, `BREAKPOINT — ${label}`, `#ffd700`); // CONTEXT-GAP: spawnFloater
		this.eng.callbacks.onRadio?.(`Unknown`, `Six deep on that trick. The county just blinked.`);
		soundEngine.tone({ f: 660, type: `square`, dur: .1, vol: .2 });
		soundEngine.tone({ f: 990, type: `square`, dur: .2, vol: .2, delay: .1 });
	}

	takeBoon(id: string) {
		if (!this.eng.draft?.some((b: any) => b.id === id)) return;
		this.eng.boonStacks[id] = (this.eng.boonStacks[id] || 0) + 1;
		if (id === `hide`) {
			this.eng.player.maxHealth += 16;
			this.eng.player.health = Math.min(this.eng.player.maxHealth, this.eng.player.health + 16);
		} else if (id === `shells`) {
			for (const w of this.eng.weapons) {
				if (!w.unlocked || w.id === `chainsaw`) continue;
				const n = w.id === `shotgun` ? 8 : w.id === `crossbow` ? 6 : 12;
				w.reserveAmmo = Math.min(w.maxReserveAmmo, w.reserveAmmo + n);
			}
		} else if (id === `jug`) {
			this.eng.player.molotovs = Math.min(this.eng.player.maxMolotovs, this.eng.player.molotovs + 1);
		} else if (id === `leavings`) {
			this.eng.scrap += 45;
			this.eng.stats.scrapCollected += 45;
		} else if (id === `post`) {
			this.eng.posts = Math.min(3, this.eng.posts + 1);
		} else if (id === `pipe`) {
			this.eng.pipes = Math.min(4, this.eng.pipes + 1);
		}
		this.eng.checkBreakpoint(id);
		// Batch 3: ability forks — this pick locks out its rivals.
		for (const l of LOCKOUTS[id] || []) {
			if (!this.eng.lockedBoons.has(l) && !(this.eng.boonStacks[l] > 0)) {
				this.eng.lockedBoons.add(l);
				const ln = BOON_CATALOG.find((b: any) => b.id === l)?.name || l;
				(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 80, `LOCKED OUT: ${ln.toUpperCase()}`, `#8a8f98`); // CONTEXT-GAP: spawnFloater
			}
		}
		const picked = this.eng.draft.find((b: any) => b.id === id);
		this.eng.draft = null;
		if (this.eng.waveState === `break`) {
			this.eng.waveBreakCountdown = Math.max(this.eng.waveBreakCountdown, 5);
			this.eng.lastBreakTick = Date.now();
		}
		this.eng.callbacks.onDraft?.(null);
		(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 48, picked?.name ?? "TAKEN", "#d4a017"); // CONTEXT-GAP: spawnFloater
		soundEngine.playPowerup();
		if (this.eng.queuedLevels > 0) {
			this.eng.queuedLevels--;
			// Balance: ~3s of live play before the next queued draft opens,
			// instead of chain-pausing back-to-back drafts. No grace needed
			// when nothing remains queued — a stale grace would block drafts.
			if (this.eng.queuedLevels > 0) this.eng.draftGraceUntil = Date.now() + 3000;
		}
		if (this.eng.levelHold) {
			this.eng.levelHold = false;
			(this.eng as any).setPaused(false); // CONTEXT-GAP: setPaused
		}
	}

	rerollDraft() {
		if (!this.eng.draft || this.eng.rerolls <= 0) return;
		this.eng.rerolls--;
		this.eng.draft = rollBoons(this.eng.boonStacks, this.eng.player.molotovs, this.eng.player.maxMolotovs, this.eng.posts, this.eng.pipes, this.eng.draftExclusions());
		this.eng.callbacks.onDraft?.(this.eng.draft);
	}

	xpToNext() {
		const early = [22, 32, 44];
		if (this.eng.level <= early.length) return early[this.eng.level - 1];
		return 44 + (this.eng.level - 3) * 14;
	}

	gritValue(type: any) {
		const m = this.eng.mutators.includes(`rich`) ? 2 : 1;
		const em = (this.eng as any).eventMods().gritMult; // CONTEXT-GAP: eventMods
		if (type === `behemoth`) return 8 * m * em;
		if (type === `old_ben`) return 10 * m * em;
		if (type === `riot` || type === `riot_shield`) return 4 * m * em;
		if (type === `miner_brute` || type === `bloater_spitter`) return 3 * m * em;
		if (type === `sprinter` || type === `bomber`) return 2 * m * em;
		return 1 * m * em;
	}

	dropGritOrb(x: any, y: any, vx: any, vy: any, value: any, lucky = false) {
		if (this.eng.grit.length >= GRIT_GROUND_CAP) {
			const m = this.eng.grit[(Math.random() * this.eng.grit.length) | 0];
			m.value += value;  // merge, don't spawn
			m.tier = m.value >= 12 ? 3 : m.value >= 4 ? 2 : 1;
			return;
		}
		const g0 = this.eng.gritPool.pop() || {};
		g0.id = `grit-${(this.eng._gritSeq = (this.eng._gritSeq || 0) + 1)}`; // Batch 10 (Lane 1): stable id for the Lane 2 pickup pop-in tween
		g0.x = x; g0.y = y; g0.vx = vx; g0.vy = vy; g0.value = value; g0.lucky = lucky;
		g0.tier = value >= 12 ? 3 : value >= 4 ? 2 : 1;
		this.eng.grit.push(g0);
	}

	spawnGrit(z: any) {
		let value = this.eng.gritValue(z.type) * (this.eng.gritValueMul || 1) * sifterValueMul(this.eng.boon(`sifter`)); // Batch 9 (Lane 1): stage grit rule. Batch 12 (Lane 1): sifter pays better.
		if (this.eng.gritBag > 0) { value += 1; this.eng.gritBag--; }  // bag pays out into fresh drops
		const bits = value > 3 ? 4 : value > 1 ? 2 : 1;
		for (let i = 0; i < bits; i++) {
			const a = Math.random() * Math.PI * 2;
			const lucky = Math.random() < 0.06;
			this.eng.dropGritOrb(z.x, z.y, Math.cos(a) * (40 + Math.random() * 50), Math.sin(a) * (40 + Math.random() * 50), (value / bits) * (lucky ? 5 : 1), lucky);
		}
		if (z.elite) {
			for (let i = 0; i < 6; i++) {
				const a = Math.random() * Math.PI * 2;
				this.eng.dropGritOrb(z.x, z.y, Math.cos(a) * 120, Math.sin(a) * 120, 2);
			}
		}
	}

	sweepGritToBag() {
		if (!this.eng.grit.length) return;
		let n = 0;
		for (const g of this.eng.grit) { this.eng.gritBag += g.value; n += g.value; }
		this.eng.grit = [];
		(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 56, `GRIT BAGGED +${Math.round(n)}`, "#f6c453"); // CONTEXT-GAP: spawnFloater
	}

	addXp(n: any) {
		// Batch 7: run-stat XP multiplier (defaults to 1 when the meta lane is absent).
		this.eng.xp += n * (this.eng as any).eventMods().xpMult * (this.eng.runXpMul || 1); // CONTEXT-GAP: eventMods
		let gained = 0;
		while (this.eng.xp >= this.eng.xpToNext()) {
			this.eng.xp -= this.eng.xpToNext();
			this.eng.level++;
			this.eng.queuedLevels++;
			gained++;
		}
		// A pending draft grace counts as a draft in flight — the loop opens it when the grace expires.
		if (!gained || this.eng.draft || this.eng.draftGraceUntil > 0) return;
		(this.eng as any).openQueuedDraft(); // CONTEXT-GAP: openQueuedDraft
	}

	updateGrit(dt: any) {
		if (this.eng.jars) {
			for (let i = this.eng.jars.length - 1; i >= 0; i--) {
				const j = this.eng.jars[i];
				if (Math.hypot(this.eng.player.x - j.x, this.eng.player.y - j.y) < 36) {
					this.eng.jars.splice(i, 1);
					this.eng.addXp(2);
					(this.eng as any).spawnFloater(j.x, j.y - 16, "JAR", "#f6c453"); // CONTEXT-GAP: spawnFloater
					soundEngine.playPickup();
				}
			}
		}
		const span = (this.eng as any).viewSize().w; // CONTEXT-GAP: viewSize
		const magnet = (Math.max(420, span * 0.46) + (this.eng as any).getPerkLevel(`scavenger`) * 40 + this.eng.gritBonus * 36) * (this.eng.pickupRadiusMul || 1) * sifterRadiusMul(this.eng.boon(`sifter`)); // Batch 9: character pickup-radius passive. Batch 12 (Lane 1): sifter drifts farther. // CONTEXT-GAP: getPerkLevel
		// Batch 4: Dust Devil surge — every ground orb flies to the player.
		if (this.eng.vacuumSurge > 0) {
			this.eng.vacuumSurge -= dt;
			for (const g of this.eng.grit) {
				const dx = this.eng.player.x - g.x, dy = this.eng.player.y - g.y, d = Math.hypot(dx, dy) || 1;
				const step = Math.min(1500 * dt, d);
				g.x += (dx / d) * step; g.y += (dy / d) * step;
				g.vx = 0; g.vy = 0;
			}
		}
		for (let i = this.eng.grit.length - 1; i >= 0; i--) {
			const g = this.eng.grit[i];
			const dx = this.eng.player.x - g.x;
			const dy = this.eng.player.y - g.y;
			const d = Math.hypot(dx, dy) || 1;
			if (d < this.eng.player.radius + 18) {
				this.eng.addXp(g.value);
				soundEngine.playGrit();
				this.eng.gritPool.push(g), this.eng.grit.splice(i, 1);
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
		if (this.eng.wantVacuum) {
			this.eng.wantVacuum = false;
			let extra = 0;
			for (const g of this.eng.grit) extra += g.value;
			this.eng.grit = [];
			if (extra > 0) this.eng.addXp(extra);
		}
		for (let i = this.eng.chests.length - 1; i >= 0; i--) {
			const c = this.eng.chests[i];
			if (Math.hypot(this.eng.player.x - c.x, this.eng.player.y - c.y) > this.eng.player.radius + 26) continue;
			this.eng.chests.splice(i, 1);
			this.eng.openChest();
		}
		this.eng.checkCachePickup();
	}

	openChest() {
		(this.eng as any).bumpLifetime(`chestsOpened`); // CONTEXT-GAP: bumpLifetime
		if (this.eng.boon(`lead`) >= 1 && this.eng.evolved !== `lincoln`) {
			this.eng.evolved = `lincoln`;
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 36, "LINCOLN'S LOAD", "#f6c453"), this.eng.trauma = Math.min(1, this.eng.trauma + .5 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()); // CONTEXT-GAP: spawnFloater, tune, motionScale
			this.eng.callbacks.onRadio?.(`Unknown`, `The magnum took the hand-load. It punches through, and a headshot puts blood back in you.`);
			soundEngine.playPowerup();
			return;
		}
		if ((this.eng as any).checkEvolutions()) return;  // weapon evolution consumed this chest // CONTEXT-GAP: checkEvolutions
		this.eng.scrap += 80;
		this.eng.stats.scrapCollected += 80;
		this.eng.player.health = Math.min(this.eng.player.maxHealth, this.eng.player.health + 25);
		this.eng.rerolls++;
		(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 36, "CHEST", "#f6c453"); // CONTEXT-GAP: spawnFloater
		soundEngine.playPickup();
	}

}
