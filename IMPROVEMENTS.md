# PikeZombies — Improvements #4–#10

Target repo: `jasandroidx/pikezombiesupdate`, branch `main`.
Apply **FUSION.md first**, then this file. All search blocks are tab-indented as in source.

## What changed vs the earlier list
- #2 "endless mode": **survival is already endless** (`outbreakWaves = 0` loops waves forever). Reframed as **endless incentives**: milestone rewards every 5 waves + spawn pressure ramp past wave 10.
- #3 "evolution recipe": one-line constants change (revolver description carries the rumor) — zero logic risk, visible in the workbench where players already read.

---

## PATCH A — `src/game/art.ts` (sprites + labels for new types)

New zombie types reuse existing sprite art so nothing renders invisible (`drawSprite` silently skips unknown ids).

Search:
```
  behemoth: "/sprites/cast/behemoth.jpg",
  crawler: "/sprites/cast/crawler.jpg",
};
```

Replace:
```
  behemoth: "/sprites/cast/behemoth.jpg",
  crawler: "/sprites/cast/crawler.jpg",
  bomber: "/sprites/cast/sprinter.jpg",
  riot: "/sprites/cast/miner_brute.jpg",
};
```

Search:
```
  behemoth: "BEHEMOTH",
  crawler: "CRAWLER",
};
```

Replace:
```
  behemoth: "BEHEMOTH",
  crawler: "CRAWLER",
  bomber: "BOMBER",
  riot: "RIOT",
};
```

---

## PATCH B — `src/game/boons.ts` (storm + salt boons)

Search:
```
export type BoonId = "lead" | "trigger" | "hide" | "shells" | "beam" | "jug" | "leavings" | "stride" | "bone" | "ring" | "post" | "pipe";
```

Replace:
```
export type BoonId = "lead" | "trigger" | "hide" | "shells" | "beam" | "jug" | "leavings" | "stride" | "bone" | "ring" | "post" | "pipe" | "storm" | "salt";
```

Search:
```
  { id: "pipe", name: "Stovepipe", blurb: "Capped pipe, black powder, a percussion cap. Lay it down. They step on it." },
];
```

Replace:
```
  { id: "pipe", name: "Stovepipe", blurb: "Capped pipe, black powder, a percussion cap. Lay it down. They step on it." },
  { id: "storm", name: "Storm jar", blurb: "Lightning hunts the dead on its own. Chains farther. Stacks." },
  { id: "salt", name: "Salt line", blurb: "A burning ring around your boots. Wider and hotter. Stacks." },
];
```

Search:
```
    if ((stacks[b.id] ?? 0) >= (b.id === "hide" ? 8 : 99)) return false;
```

Replace:
```
    if ((stacks[b.id] ?? 0) >= (b.id === "hide" ? 8 : b.id === "storm" || b.id === "salt" ? 6 : 99)) return false;
```

---

## PATCH C — `src/game/engine.ts`

### C1 — new fields (place after the `chests` field declaration)

Search:
```
	chests: { x: number; y: number }[] = [];
```

Replace:
```
	chests: { x: number; y: number }[] = [];
	stormCd = 0;
	lightning: { x1: number; y1: number; x2: number; y2: number; life: number }[] = [];
	mutators: string[] = [];
```

### C2 — update chain (add storm/salt/lightning)

Search:
```
this.updateOrbit(e), this.updateWaveManager(t),
```

Replace:
```
this.updateOrbit(e), this.updateStorm(e), this.updateSalt(e), this.updateLightning(e), this.updateWaveManager(t),
```
### C3 — render chain (add lightning/salt)

Search:
```
this.renderZombies(e), this.renderProjectiles(e), this.renderGrit(e), this.renderTraps(e), this.renderPlayer(e), this.renderRig(e),
```

Replace:
```
this.renderZombies(e), this.renderProjectiles(e), this.renderGrit(e), this.renderTraps(e), this.renderPlayer(e), this.renderLightning(e), this.renderSalt(e), this.renderRig(e),
```

### C4 — replace `updateOrbit` with spatial-hash version + new systems

Search (entire method):
```
	updateOrbit(dt) {
		this.orbit = (this.orbit || 0) + dt * 2.6;
		const n = 2 + this.boon(`ring`);
		const rad = 56;
		this.orbitPts = [];
		const dmg = 11 + this.boon(`ring`) * 4;
		for (let i = 0; i < n; i++) {
			const a = this.orbit + (Math.PI * 2 * i) / n;
			const x = this.player.x + Math.cos(a) * rad;
			const y = this.player.y + Math.sin(a) * rad;
			this.orbitPts.push({ x, y, a });
			for (const z of this.zombies) {
				if (z.orbitHit && z.orbitHit > this.simTime) continue;
				if (Math.hypot(z.x - x, z.y - y) > z.radius + 12) continue;
				z.orbitHit = this.simTime + 0.5;
				z.health -= dmg;
				z.hitFlash = 0.06;
				this.stats.damageDealt += dmg;
			}
		}
	}
```

Replace:
```
	updateOrbit(dt) {
		this.orbit = (this.orbit || 0) + dt * 2.6;
		const n = 2 + this.boon(`ring`);
		const rad = 56;
		this.orbitPts = [];
		const dmg = 11 + this.boon(`ring`) * 4;
		const cell = 64;
		const grid = new Map<string, typeof this.zombies>();
		for (const z of this.zombies) {
			const k = ((z.x / cell) | 0) + `:` + ((z.y / cell) | 0);
			let a = grid.get(k);
			if (!a) { a = []; grid.set(k, a); }
			a.push(z);
		}
		const near = (x: number, y: number, cb: (z: (typeof this.zombies)[number]) => void) => {
			const cx = (x / cell) | 0, cy = (y / cell) | 0;
			for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) {
				const a = grid.get(ix + `:` + iy);
				if (!a) continue;
				for (const z of a) cb(z);
			}
		};
		for (let i = 0; i < n; i++) {
			const a = this.orbit + (Math.PI * 2 * i) / n;
			const x = this.player.x + Math.cos(a) * rad;
			const y = this.player.y + Math.sin(a) * rad;
			this.orbitPts.push({ x, y, a });
			near(x, y, (z) => {
				if (z.orbitHit && z.orbitHit > this.simTime) return;
				if (Math.hypot(z.x - x, z.y - y) > z.radius + 12) return;
				z.orbitHit = this.simTime + 0.5;
				z.health -= dmg;
				z.hitFlash = 0.06;
				this.stats.damageDealt += dmg;
			});
		}
	}
	updateStorm(dt) {
		const stacks = this.boon(`storm`);
		if (!stacks) return;
		this.stormCd -= dt;
		if (this.stormCd > 0) return;
		this.stormCd = Math.max(0.9, 2.2 - stacks * 0.25);
		const dmg = 26 + stacks * 14;
		let from = { x: this.player.x, y: this.player.y };
		let cur = null, best = 1e9;
		for (const z of this.zombies) {
			const d = Math.hypot(z.x - from.x, z.y - from.y);
			if (d < 520 && d < best) { best = d; cur = z; }
		}
		if (!cur) return;
		const hit = new Set();
		const chains = 2 + stacks;
		for (let c = 0; c < chains && cur; c++) {
			hit.add(cur);
			cur.health -= dmg;
			cur.hitFlash = 0.08;
			this.stats.damageDealt += dmg;
			this.lightning.push({ x1: from.x, y1: from.y, x2: cur.x, y2: cur.y, life: 0.18 });
			from = cur;
			let nxt = null, bd = 1e9;
			for (const z of this.zombies) {
				if (hit.has(z)) continue;
				const d = Math.hypot(z.x - from.x, z.y - from.y);
				if (d < 200 && d < bd) { bd = d; nxt = z; }
			}
			cur = nxt;
		}
	}
	updateSalt(dt) {
		const stacks = this.boon(`salt`);
		if (!stacks) return;
		const R = 95 + stacks * 18;
		const dps = 9 + stacks * 5;
		for (const z of this.zombies) {
			const d = Math.hypot(z.x - this.player.x, z.y - this.player.y);
			if (d > R + z.radius) continue;
			z.health -= dps * dt;
			this.stats.damageDealt += dps * dt;
			z.saltTick = (z.saltTick || 0) + dt;
			if (z.saltTick > 0.4) { z.saltTick = 0; z.hitFlash = 0.05; }
		}
	}
	updateLightning(dt) {
		for (let i = this.lightning.length - 1; i >= 0; i--) {
			this.lightning[i].life -= dt;
			if (this.lightning[i].life <= 0) this.lightning.splice(i, 1);
		}
	}
	renderLightning(e) {
		if (!this.lightning.length) return;
		e.save();
		e.strokeStyle = `rgba(147, 197, 253, 0.9)`;
		e.lineWidth = 2.5;
		for (const l of this.lightning) {
			e.globalAlpha = Math.max(0, l.life / 0.18);
			e.beginPath();
			e.moveTo(l.x1, l.y1);
			e.lineTo((l.x1 + l.x2) / 2 + (Math.random() - .5) * 30, (l.y1 + l.y2) / 2 + (Math.random() - .5) * 30);
			e.lineTo(l.x2, l.y2);
			e.stroke();
		}
		e.restore();
	}
	renderSalt(e) {
		const stacks = this.boon(`salt`);
		if (!stacks) return;
		e.save();
		e.strokeStyle = `rgba(163, 230, 53, ${0.22 + Math.sin(this.simTime * 4) * 0.08})`;
		e.lineWidth = 3;
		e.beginPath();
		e.arc(this.player.x, this.player.y, 95 + stacks * 18, 0, Math.PI * 2);
		e.stroke();
		e.restore();
	}
```

### C5 — spawn mix: bomber + riot

Search:
```
		else if (this.wave >= 4 && o < .2) a = `bloater_spitter`;
		else if (this.wave >= 3 && o < .45) a = `miner_brute`;
		else if (this.wave >= 2 && o < .7) a = `sprinter`;
```

Replace:
```
		else if (this.wave >= 4 && o < .2) a = `bloater_spitter`;
		else if (this.wave >= 4 && o < .3) a = `bomber`;
		else if (this.wave >= 5 && o < .4) a = `riot`;
		else if (this.wave >= 3 && o < .5) a = `miner_brute`;
		else if (this.wave >= 2 && o < .72) a = `sprinter`;
```

### C6 — pushZombie stats for new types

Search:
```
: e === `behemoth` && (r = 1400 + this.wave * 250, i = 1.55, a = 45, o = 38, s = `#581c87`, l = 1500, u = 250);
```

Replace:
```
: e === `bomber` ? (r = 45, i = 2.7, a = 12, o = 15, s = `#b45309`, l = 120, u = 18) : e === `riot` ? (r = 520, i = 0.85, a = 30, o = 24, s = `#3f3f46`, c = true, l = 300, u = 60) : e === `behemoth` && (r = 1400 + this.wave * 250, i = 1.55, a = 45, o = 38, s = `#581c87`, l = 1500, u = 250);
```

Search:
```
		this.zombies.push(d), soundEngine.playZombieGroan(e === `crawler` ? `shambler` : e);
```

Replace:
```
		this.zombies.push(d), soundEngine.playZombieGroan(e === `crawler` ? `shambler` : e === `bomber` ? `bloater_spitter` : e === `riot` ? `miner_brute` : e);
```

### C7 — bomber explosion in killZombie (apply AFTER FUSION.md patch 5)

Search:
```
		this.spawnGrit(e);
		if (e.elite && this.chestsThisMap < 3) {
```

Replace:
```
		this.spawnGrit(e);
		if (e.type === `bomber`) {
			const R = 110;
			this.screenShake = Math.max(this.screenShake, 7);
			for (const z of this.zombies) {
				if (Math.hypot(z.x - e.x, z.y - e.y) < R) { z.health -= 90; z.hitFlash = 0.08; }
			}
			for (let k = 0; k < 14; k++) this.particles.push({ x: e.x, y: e.y, vx: (Math.random() - .5) * 6, vy: (Math.random() - .5) * 6, size: 4, life: .5, maxLife: .5, alpha: 1 });
			if (Math.hypot(this.player.x - e.x, this.player.y - e.y) < R * .7) this.player.health -= 18;
			soundEngine.playBarrelExplosion();
		}
		if (e.elite && this.chestsThisMap < 3) {
```

### C8 — gritValue: new types + rich mutator

Search:
```
	gritValue(type) {
		if (type === `behemoth`) return 8;
		if (type === `miner_brute` || type === `bloater_spitter`) return 3;
		if (type === `sprinter`) return 2;
		return 1;
	}
```

Replace:
```
	gritValue(type) {
		const m = this.mutators.includes(`rich`) ? 2 : 1;
		if (type === `behemoth`) return 8 * m;
		if (type === `riot`) return 4 * m;
		if (type === `miner_brute` || type === `bloater_spitter`) return 3 * m;
		if (type === `sprinter` || type === `bomber`) return 2 * m;
		return 1 * m;
	}
```

### C9 — wave 1–2 pacing

Search:
```
		const gap = this.lanternLit ? 480 : this.wave <= 1 ? 340 : 240;
```

Replace:
```
		const gap = this.lanternLit ? 480 : this.wave === 1 ? 220 : this.wave === 2 ? 200 : 240;
```

### C10 — combo feeds fire rate

Search:
```
let n = this.hasPowerup(`infinite_ammo`), r = n ? 1.4 : 1, i = this.isMouseDown || this.virtualJoystickAim.x !== 0 || this.virtualJoystickAim.y !== 0 || hunting, a = 1e3 / (t.fireRate * (1 + this.getPerkLevel(`quickdraw`) * .18) * (1 + this.boon(`trigger`) * .1) * r);
```

Replace:
```
let n = this.hasPowerup(`infinite_ammo`), r = n ? 1.4 : 1, i = this.isMouseDown || this.virtualJoystickAim.x !== 0 || this.virtualJoystickAim.y !== 0 || hunting, a = 1e3 / (t.fireRate * (1 + this.getPerkLevel(`quickdraw`) * .18) * (1 + this.boon(`trigger`) * .1) * (1 + (this.comboMultiplier - 1) * .06) * r);
```

### C11 — low-HP vignette (screen space, after fog block)

Search:
```
		if (this.fogUntil > 0) {
			e.save();
			e.fillStyle = `rgba(28, 32, 30, ${.08 + Math.sin(this.simTime) * .02})`;
			e.fillRect(0, 0, t, n);
			e.restore();
		}
```

Replace:
```
		if (this.fogUntil > 0) {
			e.save();
			e.fillStyle = `rgba(28, 32, 30, ${.08 + Math.sin(this.simTime) * .02})`;
			e.fillRect(0, 0, t, n);
			e.restore();
		}
		if (this.player.health < this.player.maxHealth * .3 && this.player.health > 0) {
			e.save();
			const pulse = .12 + Math.sin(this.simTime * 6) * .05;
			const vg = e.createRadialGradient(t / 2, n / 2, Math.min(t, n) * .32, t / 2, n / 2, Math.max(t, n) * .72);
			vg.addColorStop(0, "rgba(140,18,24,0)");
			vg.addColorStop(1, `rgba(140,18,24,${pulse.toFixed(3)})`);
			e.fillStyle = vg;
			e.fillRect(0, 0, t, n);
			e.restore();
		}
```

### C12 — endless milestones + spawn ramp

Search:
```
		let e = this.wave === 1 ? Math.floor(18 * this.difficultyMultiplier) : Math.floor((16 + this.wave * 6) * this.difficultyMultiplier);
```

Replace:
```
		let e = this.wave === 1 ? Math.floor(18 * this.difficultyMultiplier) : Math.floor((16 + this.wave * 6 + Math.max(0, this.wave - 10) * 4) * this.difficultyMultiplier);
```

Search:
```
this.stats.wavesCompleted++, this.scrap += 120 + this.wave * 25,
```

Replace:
```
this.stats.wavesCompleted++, this.endlessMilestone(), this.scrap += 120 + this.wave * 25,
```

Add method (place right before `startNextWave() {`):

Search:
```
	startNextWave() {
```

Replace:
```
	endlessMilestone() {
		if (this.outbreakWaves > 0 || this.wave % 5 !== 0) return;
		this.chests.push({ x: this.player.x + 60, y: this.player.y });
		this.player.health = Math.min(this.player.maxHealth, this.player.health + 30);
		this.spawnFloater(this.player.x, this.player.y - 56, `WAVE ${this.wave} — THE COUNTY PROVIDES`, "#ffd700");
		soundEngine.playPowerup();
	}
	startNextWave() {
```

### C13 — mutators hook in start()

Search:
```
this.initHoles(), this.rebuildFlow(true), soundEngine.init(),
```

Replace:
```
this.initHoles(), this.applyMutators(), this.rebuildFlow(true), soundEngine.init(),
```

Add method (place right before `stop() {`):

Search:
```
	stop() {
```

Replace:
```
	applyMutators() {
		if (this.mutators.includes(`dry`)) for (const w of this.weapons) w.reserveAmmo = Math.floor(w.reserveAmmo / 2);
		if (this.mutators.includes(`fog`)) this.fogUntil = 99999;
	}
	stop() {
```

---

## PATCH D — `src/game/constants.ts` (evolution recipe rumor)

Search:
```
    description: "Heavy Pike County revolver. One-handed thunder that still stops a shambler cold.",
```

Replace:
```
    description: "Heavy Pike County revolver. One-handed thunder that still stops a shambler cold. Rumor: hand-loaded lead and a supply chest wake something up in it.",
```

---

## PATCH E — `src/components/game/StartScreen.tsx` (mutator chips)

Search:
```
  const [difficulty, setDifficulty] = useState(1);
```

Replace:
```
  const [difficulty, setDifficulty] = useState(1);
  const [mutators, setMutators] = useState<string[]>([]);
```

Search:
```
  onStartGame: (locationIndex: number, difficulty: number, mode: "survival" | "outbreak") => void;
```

Replace:
```
  onStartGame: (locationIndex: number, difficulty: number, mode: "survival" | "outbreak", mutators?: string[]) => void;
```

Search:
```
            onClick={() => onStartGame(0, difficulty, "outbreak")}
```

Replace:
```
            onClick={() => onStartGame(0, difficulty, "outbreak", mutators)}
```

Search:
```
            onClick={() => onStartGame(selectedLocation, difficulty, "survival")}
```

Replace:
```
            onClick={() => onStartGame(selectedLocation, difficulty, "survival", mutators)}
```

Search (insert mutator row before the Pay stubs panel):
```
          <div className="rounded border border-[#6b5428]/80 bg-black/55 p-3 text-left backdrop-blur-[2px]">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">Pay stubs</span>
```

Replace:
```
          <div className="flex gap-2">
            {[
              { id: "rich", label: "Rich ground", detail: "Double grit" },
              { id: "dry", label: "Dry county", detail: "Half ammo" },
              { id: "fog", label: "Bottom fog", detail: "Fog all night" },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                title={m.detail}
                onClick={() => setMutators((s) => (s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id]))}
                className={`flex-1 rounded border px-2 py-2 font-mono text-[11px] uppercase tracking-widest ${
                  mutators.includes(m.id) ? "border-accent bg-surface-2 text-accent" : "border-border bg-surface text-muted"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="rounded border border-[#6b5428]/80 bg-black/55 p-3 text-left backdrop-blur-[2px]">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">Pay stubs</span>
```

---

## PATCH F — `src/routes/index.tsx` (thread mutators into engine)

Search:
```
  const handleStartGame = (locationIndex: number, difficultyMultiplier: number, nextMode: GameMode = "survival") => {
```

Replace:
```
  const handleStartGame = (locationIndex: number, difficultyMultiplier: number, nextMode: GameMode = "survival", mutators: string[] = []) => {
```

Search:
```
    bootEngine(idx, difficultyMultiplier, nextMode, 0, null);
  };
```

Replace:
```
    bootEngine(idx, difficultyMultiplier, nextMode, 0, null, mutators);
  };
```

Search:
```
  const bootEngine = (
    locationIndex: number,
    difficultyMultiplier: number,
    nextMode: GameMode,
    step: number,
    carry: EngineSnapshot | null,
  ) => {
```

Replace:
```
  const bootEngine = (
    locationIndex: number,
    difficultyMultiplier: number,
    nextMode: GameMode,
    step: number,
    carry: EngineSnapshot | null,
    mutators: string[] = [],
  ) => {
```

Search:
```
    applySaveUnlocks(engine);
    if (carry) engine.importSnapshot(carry);
```

Replace:
```
    applySaveUnlocks(engine);
    engine.mutators = mutators;
    if (carry) engine.importSnapshot(carry);
```

---

## Balance notes
- **Bomber**: 45 HP dies to 1–2 revolver hits; 90 AoE hurts zombies more than you (18). Chain reactions are the fun — don't nerf radius first, nerf damage to 70 if waves melt.
- **Riot**: 520 HP at 0.85 speed is a wall, not a threat. It's a positioning tax. Helmet visual reuses miner_brute art.
- **Storm**: 26+14/stack every ~2s chaining 2+stacks — roughly a free revolver that never misses. Cap 6 stacks.
- **Salt**: 9+5 dps in 95+18 radius — vs orbit's 11/hit it trades burst for zone control.
- **Combo rate**: +6%/tier → +24% at x5. Noticeable without replacing quickdraw.
- **Wave 1 gap 220ms**: 16 zombies land in ~4s instead of ~6s. Still a teaching wave.
- **Endless ramp**: +4/wave past 10 keeps pressure linear-ish; milestone chest every 5 waves funds the answer.
