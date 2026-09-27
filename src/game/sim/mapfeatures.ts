// Batch 14 (engine modularization): MapSim — mechanically extracted from src/game/engine.ts.
// State stays on GameEngine; inside this module `this.eng` is the engine (SimContext).
// `// CONTEXT-GAP: name` marks a call to a method owned by another module or still on
// the engine; the coordinator resolves these during the update() rewire.
import type { SimContext } from "./context";
import { soundEngine } from "../../audio/soundEngine";
import {
	SHRINE_COUNT, SHOP_OFFER_COUNT, SHOP_POOL, SHOP_REROLL_BASE, BOMB_MAX_CHARGES,
} from "../constants";
import { buildMapFeatures, buildJarAnchors, sceneBaseCounts, MOUNTED_GUN_NAMES } from "../scenes";

export class MapSim {
	constructor(private eng: SimContext) {}

	loadMapFeatures(rules: any = {}) {
		const f = buildMapFeatures(this.eng.currentLocation.id, { rules, rng: () => this.eng.rng() });
		this.eng.barricades = f.barricades;
		this.eng.holes = f.holes;
		this.eng.explosiveBarrels = f.barrels;
		this.eng.loreNotes = f.loreNotes;
		this.eng._holesBase9 = sceneBaseCounts(this.eng.currentLocation.id).holes;
		this.eng._barrelsBase9 = sceneBaseCounts(this.eng.currentLocation.id).barrels;
		this.placeClues();
	}

	placePlayerSafely() {
		let e = this.eng.currentLocation;
		// CONTEXT-GAP: checkObstacleCollision
		if (this.eng.player.x = e.spawn?.x ?? e.mapWidth / 2, this.eng.player.y = e.spawn?.y ?? e.mapHeight / 2 + 200, (this.eng as any).checkObstacleCollision(this.eng.player.x, this.eng.player.y, this.eng.player.radius)) for (let t = 40; t <= 420; t += 24) for (let n = 0; n < Math.PI * 2; n += Math.PI / 8) {
			let r = this.eng.player.x + Math.cos(n) * t, i = this.eng.player.y + Math.sin(n) * t;
			// CONTEXT-GAP: checkObstacleCollision
			if (r > this.eng.player.radius && i > this.eng.player.radius && r < e.mapWidth - this.eng.player.radius && i < e.mapHeight - this.eng.player.radius && !(this.eng as any).checkObstacleCollision(r, i, this.eng.player.radius)) {
				this.eng.player.x = r, this.eng.player.y = i;
				return;
			}
		}
	}

	rebuildFlow(force: any = false) {
		const loc = this.eng.currentLocation;
		const blocks = [
			...(loc.obstacles || []),
			...this.eng.barricades.filter((b: any) => b.health > 0).map((b: any) => ({ x: b.x, y: b.y, width: b.width, height: b.height })),
		];
		this.eng.flow.markBlocked(loc.mapWidth, loc.mapHeight, blocks);
		this.eng.flow.rebuild(this.eng.player.x, this.eng.player.y);
		this.eng.flowRebuild = 0.35;
	}

	freeSpot(x: any, y: any) {
		const clear = (px: any, py: any) => {
			if (px < 40 || py < 40 || px > this.eng.currentLocation.mapWidth - 40 || py > this.eng.currentLocation.mapHeight - 40) return false;
			for (const o of this.eng.currentLocation.obstacles || []) {
				if (px + 22 > o.x && px - 22 < o.x + o.width && py + 22 > o.y && py - 22 < o.y + o.height) return false;
			}
			const w = this.eng.currentLocation.workbench;
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
		for (const note of this.eng.loreNotes) {
			const p = this.freeSpot(note.x, note.y);
			note.x = p.x;
			note.y = p.y;
		}
		const name = MOUNTED_GUN_NAMES[this.eng.currentLocation.id] || "Mounted gun";
		const anchor = this.eng.loreNotes[0];
		const spot = this.freeSpot(anchor ? anchor.x + 110 : this.eng.player.x + 80, anchor ? anchor.y + 20 : this.eng.player.y);
		this.eng.rig = { x: spot.x, y: spot.y, name, until: 0, cool: 0, shot: 0, angle: 0 };
		this.eng.rigArmed = false;
		if (this.eng.loreNotes[0]) this.eng.loreNotes[0].content.push(`The ${name} is set nearby. Read this, then press E on the gun. It will hold a lane.`);
		if (this.eng.loreNotes[1]) this.eng.loreNotes[1].content.push("Something that still works was folded in the page. It is on the ground.");
		this.initJars();
	}

	initJars() {
		// Batch 11 (Lane 3): anchors from scene data (map dims); freeSpot stays engine-side.
		const anchors = buildJarAnchors(this.eng.currentLocation.id).map((p: any) => [p.x, p.y]);
		this.eng.jars = anchors.map(([x, y]) => {
			const p = this.freeSpot(x, y);
			return { x: p.x, y: p.y };
		});
	}

	updateRig(dt: any) {
		if (!this.eng.rig || this.eng.simTime > this.eng.rig.until) return;
		this.eng.rig.shot -= dt;
		if (this.eng.rig.shot > 0) return;
		let best = null, bd = 480;
		for (const z of this.eng.zombies) {
			const d = Math.hypot(z.x - this.eng.rig.x, z.y - this.eng.rig.y);
			if (d < bd) {
				bd = d;
				best = z;
			}
		}
		if (!best) return;
		this.eng.rig.shot = 0.46;
		const a = Math.atan2(best.y - this.eng.rig.y, best.x - this.eng.rig.x);
		this.eng.rig.angle = a;
		// CONTEXT-GAP: allocBullet
		this.eng.bullets.push(Object.assign((this.eng as any).allocBullet(), {
			id: Math.random().toString(),
			x: this.eng.rig.x + Math.cos(a) * 18,
			y: this.eng.rig.y + Math.sin(a) * 18,
			vx: Math.cos(a) * 11,
			vy: Math.sin(a) * 11,
			damage: 48,
			pierce: 2,
			rangeRemaining: 460,
			weaponType: `splinter`,
			isSplinter: true,
			radius: 3.4,
			color: `#fde68a`
		}));
	}

	postStats() {
		return this.eng.postRank >= 3
			? { dmg: 85, interval: .42, mag: 24, maxPosts: 3, cost: 0 }
			: this.eng.postRank === 2
			? { dmg: 65, interval: .5, mag: 18, maxPosts: 2, cost: 300 }
			: { dmg: 46, interval: .58, mag: 14, maxPosts: 2, cost: 150 };
	}

	upgradePost() {
		if (this.eng.postRank >= 3) return false;
		const cost = this.postStats().cost;
		if (this.eng.scrap < cost) {
			// CONTEXT-GAP: spawnFloater
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 36, `NEED ${cost} SCRAP`, `#8a7a64`);
			return false;
		}
		this.eng.scrap -= cost;
		this.eng.postRank++;
		const st = this.postStats();
		// CONTEXT-GAP: spawnFloater
		(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 40, `POST MK${this.eng.postRank}`, `#d4a017`);
		soundEngine.playPickup();
		this.eng.callbacks.onRadio?.(`Unknown`, `Post rebuilt to mark ${this.eng.postRank}. ${st.maxPosts > 2 ? `It'll hold a third post now.` : `Heavier tube, faster trigger.`}`);
		return true;
	}

	plantPost() {
		if (this.eng.isPaused || !this.eng.isRunning) return false;
		if (this.eng.posts <= 0) {
			// CONTEXT-GAP: spawnFloater
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 36, "NO POST", "#8a7a64");
			return false;
		}
		const ps = this.postStats();
		if (this.eng.traps.filter((t: any) => t.kind === "post").length >= ps.maxPosts) {
			// CONTEXT-GAP: spawnFloater
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 36, ps.maxPosts > 2 ? "THREE POSTS" : "TWO POSTS", "#8a7a64");
			return false;
		}
		const ang = this.eng.player.angle;
		let x = this.eng.player.x + Math.cos(ang) * 46;
		let y = this.eng.player.y + Math.sin(ang) * 46;
		// CONTEXT-GAP: checkObstacleCollision
		if ((this.eng as any).checkObstacleCollision(x, y, 16)) {
			x = this.eng.player.x;
			y = this.eng.player.y;
		}
		this.eng.posts--;
		this.eng.traps.push({ kind: "post", x, y, angle: ang, shot: 0.25, left: ps.mag, arm: 0, live: true, blown: false, dmg: ps.dmg, interval: ps.interval, hp: 70 });
		// CONTEXT-GAP: spawnFloater
		(this.eng as any).spawnFloater(x, y - 30, "POST", "#d4a017");
		soundEngine.playPickup();
		if (!this.eng.toldPost) {
			this.eng.toldPost = true;
			this.eng.callbacks.onRadio?.("Unknown", "Cedar post and a deer rifle. It watches the lane until the tube is empty.");
		}
		return true;
	}

	dropPipe() {
		if (this.eng.isPaused || !this.eng.isRunning) return false;
		if (this.eng.pipes <= 0) {
			// CONTEXT-GAP: spawnFloater
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 36, "NO PIPE", "#8a7a64");
			return false;
		}
		if (this.eng.traps.filter((t: any) => t.kind === "pipe").length >= 4) {
			// CONTEXT-GAP: spawnFloater
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 36, "GROUND'S FULL", "#8a7a64");
			return false;
		}
		const ang = this.eng.player.angle;
		let x = this.eng.player.x + Math.cos(ang) * 32;
		let y = this.eng.player.y + Math.sin(ang) * 32;
		// CONTEXT-GAP: checkObstacleCollision
		if ((this.eng as any).checkObstacleCollision(x, y, 12)) {
			x = this.eng.player.x - Math.cos(ang) * 24;
			y = this.eng.player.y - Math.sin(ang) * 24;
		}
		this.eng.pipes--;
		this.eng.traps.push({ kind: "pipe", x, y, angle: 0.4, shot: 0, left: 0, arm: 0.8, live: false, blown: false });
		// CONTEXT-GAP: spawnFloater
		(this.eng as any).spawnFloater(x, y - 24, "PIPE", "#c23b22");
		soundEngine.playPickup();
		if (!this.eng.toldPipe) {
			this.eng.toldPipe = true;
			this.eng.callbacks.onRadio?.("Unknown", "Stovepipe. Black powder and a percussion cap. Walk off it. They won't.");
		}
		return true;
	}

	packBetweenWaves() {
		if (this.eng.pipes < 3) {
			this.eng.pipes++;
			// CONTEXT-GAP: spawnFloater
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 42, "PACKED A PIPE", "#c23b22");
		}
		if (this.eng.wave > 0 && this.eng.wave % 2 === 0 && this.eng.posts < 2) {
			this.eng.posts++;
			// CONTEXT-GAP: spawnFloater
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 58, "CEDAR POST", "#d4a017");
		}
	}

	updateTraps(dt: any) {
		for (let i = this.eng.traps.length - 1; i >= 0; i--) {
			const t = this.eng.traps[i];
			if (t.blown) continue;
			if (t.kind === "pipe") {
				if (!t.live) {
					t.arm -= dt;
					if (t.arm <= 0) t.live = true;
					continue;
				}
				for (const z of this.eng.zombies) {
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
			for (const z of this.eng.zombies) {
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
			t.shot = t.interval || 0.58;
			t.left--;
			const a = t.angle;
			// CONTEXT-GAP: allocBullet
			this.eng.bullets.push(Object.assign((this.eng as any).allocBullet(), {
				id: Math.random().toString(),
				x: t.x + Math.cos(a) * 22,
				y: t.y + Math.sin(a) * 22,
				vx: Math.cos(a) * 14,
				vy: Math.sin(a) * 14,
				damage: t.dmg || 46,
				pierce: 1,
				rangeRemaining: 360,
				weaponType: `lever_rifle`,
				radius: 3.2,
				color: `#fefce8`
			}));
			soundEngine.playGunshot(`rifle`);
			this.alertZombies(t.x, t.y, 90, true);
			if (t.left <= 0) {
				// CONTEXT-GAP: spawnFloater
				(this.eng as any).spawnFloater(t.x, t.y - 22, "POST DRY", "#8a7a64");
				t.blown = true;
			}
		}
		if (this.eng.traps.some((t: any) => t.blown)) this.eng.traps = this.eng.traps.filter((t: any) => !t.blown);
	}

	blowPipe(t: any) {
		if (!t || t.blown) return;
		const queue = [t];
		while (queue.length) {
			const bomb = queue.pop();
			if (!bomb || bomb.blown || bomb.kind !== "pipe") continue;
			bomb.blown = true;
			const R = 120;
			for (const z of this.eng.zombies) {
				const d = Math.hypot(z.x - bomb.x, z.y - bomb.y);
				if (d > R + z.radius) continue;
				const fall = 1 - Math.min(1, d / (R + z.radius));
				const hit = 90 + 80 * fall;
				z.health -= hit;
				z.hitFlash = 0.3;
				z.stunUntil = this.eng.simTime + 0.4;
				const n = d || 1;
				const push = fall * 14;
				z.vx += ((z.x - bomb.x) / n) * push;
				z.vy += ((z.y - bomb.y) / n) * push;
				this.eng.stats.damageDealt += hit;
			}
			for (const o of this.eng.traps) {
				if (o.blown || o === bomb || o.kind !== "pipe") continue;
				if (Math.hypot(o.x - bomb.x, o.y - bomb.y) > 70) continue;
				queue.push(o);
			}
			this.eng.screenShake = Math.max(this.eng.screenShake, 9);
			// CONTEXT-GAP: tune
			this.eng.hitstop = Math.max(this.eng.hitstop, (0.045) * (this.eng as any).tune('hitstop'));
			this.alertZombies(bomb.x, bomb.y, 260);
			soundEngine.playGunshot(`shotgun`);
			// CONTEXT-GAP: spawnFloater
			(this.eng as any).spawnFloater(bomb.x, bomb.y - 26, "STOVEPIPE", "#e11d2e");
			for (let k = 0; k < 18; k++) {
				const a = Math.random() * Math.PI * 2;
				const sp = 1.6 + Math.random() * 4.2;
				// CONTEXT-GAP: allocParticle
				this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), {
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
				}));
			}
		}
	}

	spawnShrines() {
		this.eng.shrines = [];
		for (let i = 0; i < SHRINE_COUNT; i++) {
			const a = (i / SHRINE_COUNT) * Math.PI * 2 + Math.random() * .8;
			const d = 420 + Math.random() * 260;
			this.eng.shrines.push({ x: this.eng.player.x + Math.cos(a) * d, y: this.eng.player.y + Math.sin(a) * d, attuned: false });
		}
	}

	nearShrine() {
		return this.eng.shrines.find((s: any) => !s.attuned && Math.hypot(this.eng.player.x - s.x, this.eng.player.y - s.y) < 90);
	}

	tryAttuneShrine() {
		for (const s of this.eng.shrines) {
			if (!s.attuned && Math.hypot(this.eng.player.x - s.x, this.eng.player.y - s.y) < 90) {
				s.attuned = true;
				// CONTEXT-GAP: bumpLifetime
				(this.eng as any).bumpLifetime(`shrinesAttuned`);
				// CONTEXT-GAP: tune, motionScale
				this.eng.trauma = Math.min(1, this.eng.trauma + .3 * (this.eng as any).tune('shake') * (this.eng as any).motionScale());
				soundEngine.playPowerup();
				// CONTEXT-GAP: spawnFloater
				(this.eng as any).spawnFloater(s.x, s.y - 30, `SHRINE ATTUNED`, `#d4a017`);
				this.eng.callbacks.onRadio?.(`Unknown`, `The stones hum against your palm. Your rounds will bite the big ones harder now.`);
				return true;
			}
		}
		return false;
	}

	shopCost(def: any) {
		return Math.round(def.baseCost * (1 + .15 * Math.max(1, this.eng.wave)));
	}

	rollShop(first: any = false) {
		const kept = this.eng.shopOffers.filter((o: any) => o.locked);
		const pool = SHOP_POOL.filter((d: any) => !kept.some((k: any) => k.offerId === d.id) && (d.repeatable || !this.eng.shopBought.has(d.id)) && !(d.kind === `unlock` && d.weaponId && this.eng.weapons.some((w: any) => w.id === d.weaponId && w.unlocked)));
		const offers = kept.slice();
		while (offers.length < SHOP_OFFER_COUNT && pool.length) {
			const i = Math.floor(Math.random() * pool.length);
			offers.push({ offerId: pool.splice(i, 1)[0].id, locked: false });
		}
		this.eng.shopOffers = offers;
		if (!first) this.eng.shopRerollCost = SHOP_REROLL_BASE;
	}

	rerollShop() {
		if (this.eng.waveState !== `break`) return false;
		// Batch 12 (Lane 1): elite-hunt bonus — one free reroll, on the house.
		const free = this.eng.huntBonusReroll;
		if (!free && this.eng.scrap < this.eng.shopRerollCost) return false;
		if (!free) {
			this.eng.scrap -= this.eng.shopRerollCost;
			this.eng.shopRerollCost *= 2;
		}
		this.eng.huntBonusReroll = false;
		const kept = this.eng.shopOffers.filter((o: any) => o.locked);
		const pool = SHOP_POOL.filter((d: any) => !kept.some((k: any) => k.offerId === d.id) && (d.repeatable || !this.eng.shopBought.has(d.id)) && !(d.kind === `unlock` && d.weaponId && this.eng.weapons.some((w: any) => w.id === d.weaponId && w.unlocked)));
		const offers = kept.slice();
		while (offers.length < SHOP_OFFER_COUNT && pool.length) {
			const i = Math.floor(Math.random() * pool.length);
			offers.push({ offerId: pool.splice(i, 1)[0].id, locked: false });
		}
		this.eng.shopOffers = offers;
		soundEngine.playPickup();
		return true;
	}

	toggleShopLock(i: any) {
		const slot = this.eng.shopOffers[i];
		if (!slot) return false;
		slot.locked = !slot.locked;
		soundEngine.playPickup();
		return true;
	}

	buyShopOffer(i: any) {
		const slot = this.eng.shopOffers[i];
		if (!slot || this.eng.waveState !== `break`) return false;
		const def = SHOP_POOL.find((d: any) => d.id === slot.offerId);
		if (!def || this.eng.scrap < this.shopCost(def)) return false;
		if (!this.applyShopOffer(def)) return false;
		this.eng.scrap -= this.shopCost(def);
		if (!def.repeatable) {
			this.eng.shopBought.add(def.id);
			this.eng.shopOffers.splice(i, 1);
		}
		soundEngine.playPickup();
		return true;
	}

	applyShopOffer(def: any) {
		const p = this.eng.player;
		switch (def.kind) {
			case `heal`:
				if (p.health >= p.maxHealth) return false;
				p.health = Math.min(p.maxHealth, p.health + 50);
				return true;
			case `ammo`:
				let refilled = false;
				for (const w of this.eng.weapons) {
					if (!w.unlocked) continue;
					const max = w.magazineSize * 6;
					if (w.reserveAmmo < max) {
						w.reserveAmmo = max;
						refilled = true;
					}
				}
				return refilled;
			case `maxhp`:
				p.maxHealth += 25;
				p.health = Math.min(p.maxHealth, p.health + 25);
				return true;
			case `molotov`:
				if (p.molotovs >= p.maxMolotovs) return false;
				p.molotovs++;
				return true;
			case `flare`:
				if (p.flares >= p.maxFlares) return false;
				p.flares++;
				return true;
			case `firerate`:
				this.eng.shopFireRateMul *= 1.08;
				return true;
			case `dmg`:
				this.eng.shopDmgMul *= 1.08;
				return true;
			case `speed`:
				p.speed *= 1.06;
				return true;
			case `magnet`:
				this.eng.shopMagnetBonus += .3;
				return true;
			case `unlock`: {
				const w = this.eng.weapons.find((w: any) => w.id === def.weaponId);
				if (!w || w.unlocked) return false;
				w.unlocked = true;
				this.eng.codexSeen?.add(w.id);
				// CONTEXT-GAP: spawnFloater
				(this.eng as any).spawnFloater(p.x, p.y - 44, w.name + ` UNLOCKED`, `#d4a017`);
				return true;
			}
			case `bombcharge`:
				if (this.eng.bombCharges >= BOMB_MAX_CHARGES) return false;
				this.eng.bombCharges++;
				return true;
		}
		return false;
	}

	relightLantern() {
		// CONTEXT-GAP: spawnFloater
		this.eng.lanternLit = true, soundEngine.playLantern(), (this.eng as any).spawnFloater(this.eng.currentLocation.lantern.x, this.eng.currentLocation.lantern.y - 24, `LIT`, `#d4a017`), this.eng.callbacks.onRadio?.(`Unknown`, `East window's burning again. Hold it.`);
	}

	updateLantern() {
		let e = this.eng.currentLocation.lantern;
		if (e && this.eng.lanternLit) {
			for (let t of this.eng.zombies) if (Math.hypot(t.x - e.x, t.y - e.y) < 44) {
				// CONTEXT-GAP: snuffLantern
				(this.eng as any).snuffLantern();
				return;
			}
		}
	}

	ringBell() {
		let e = this.eng.currentLocation.bell;
		if (e && !this.eng.bellRung) {
			// CONTEXT-GAP: tune, motionScale
			this.eng.bellRung = true, this.eng.bellReady = false, this.eng.bellHold = 2.2, this.eng.bellLureUntil = this.eng.simTime + 10, this.eng.extractActive = true, this.eng.trauma = Math.min(1, this.eng.trauma + .7 * (this.eng as any).tune('shake') * (this.eng as any).motionScale()), this.eng.screenShake = 12 * (this.eng as any).tune('shake') * (this.eng as any).motionScale(), soundEngine.playBell(), this.alertZombies(e.x, e.y, 2e3);
			for (let t of this.eng.zombies) t.hearX = e.x, t.hearY = e.y, t.ai = `investigate`;
			this.eng.callbacks.onExtractReady?.(), this.eng.callbacks.onRadio?.(`WJPS Petersburg`, `The bell. Truck's lit. Get off this ground.`);
		}
	}

	updateBellHold(e: any) {
		let t = this.eng.currentLocation.bell;
		(this.eng.keys.KeyE || this.eng.holdInteract) && this.eng.bellReady && !this.eng.bellRung && t && Math.hypot(this.eng.player.x - t.x, this.eng.player.y - t.y) < 80 ? (this.eng.bellHold += e, this.eng.bellHold >= 2.2 && this.ringBell()) : this.eng.bellHold = Math.max(0, this.eng.bellHold - e * 1.6);
	}

	weaponHearRadius(e: any) {
		switch (e) {
			case `crossbow`: return 0;
			case `carbine`: return 380;
			case `revolver`: return 480;
			case `shotgun`: return 580;
			case `lever_rifle`: return 740;
			case `chainsaw`: return 420;
			default: return 420;
		}
	}

	updateNoisePulses(e: any) {
		for (let t = this.eng.noisePulses.length - 1; t >= 0; t--) {
			let n = this.eng.noisePulses[t];
			n.life -= e, n.radius = n.maxRadius * (1 - n.life / n.maxLife), n.life <= 0 && this.eng.noisePulses.splice(t, 1);
		}
	}

	alertZombies(e: any, t: any, n: any, quiet: any = false) {
		if (!(n <= 0)) {
			if (!quiet) {
				this.eng.noisePulses.push({
					x: e,
					y: t,
					radius: 8,
					maxRadius: n,
					life: .7,
					maxLife: .7
				}), this.eng.noisePulses.length > 10 && this.eng.noisePulses.shift();
			}
			for (let r of this.eng.zombies) {
				if (Math.hypot(r.x - e, r.y - t) > n) continue;
				r.hearX = e; r.hearY = t; r.quietT = 6; // Batch 9 (Lane 1): noise is a stimulus.
				(r.ai === `wander` || r.ai === `idle` || r.ai === `spotted`) && (r.ai = `investigate`);
			}
		}
	}

	emitNoise(x: any, y: any, radius: any) {
		this.alertZombies(x, y, radius);
	}
	// Group 1: ghost personalities — per-type targeting rule. Returns [tx, ty, blend]
	// where blend 0 = pure flow-field pathing, 1 = direct steering to target.

	nearestObjective(x: any, y: any) {
		let bx = 0, by = 0, bd = 1e12, found = false;
		for (const h of this.eng.holes) if (h.boarded) {
			const dx = h.x - x, dy = h.y - y, d = dx * dx + dy * dy;
			if (d < bd) { bd = d; bx = h.x; by = h.y; found = true; }
		}
		for (const t of this.eng.traps) if (t.live !== false) {
			const dx = t.x - x, dy = t.y - y, d = dx * dx + dy * dy;
			if (d < bd) { bd = d; bx = t.x; by = t.y; found = true; }
		}
		return found ? { x: bx, y: by } : null;
	}
}
