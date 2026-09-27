// Batch 14 (engine modularization): probes — the entire window.__controlsTest
// installation, moved verbatim from GameEngine.installControlsProbe
// (src/game/engine.ts). Probe KEYS are unchanged and in the original order,
// with one deliberate exception: `zAi` was defined twice with byte-identical
// bodies (Batch 3 and Batch 6 blocks) — the first definition was removed since
// last-wins made it dead code. Only the receiver changed: `this` (the
// engine) is now the `eng: SimContext` parameter. Method calls are re-keyed to
// the owning subsystem (`eng.<sub>!.method()`); calls to methods still on the
// engine use `(eng as any).method()` and are marked `// CONTEXT-GAP: name` for
// the coordinator to resolve during the update() rewire.
import type { SimContext } from "./context";
import { soundEngine } from "../../audio/soundEngine";
import {
	rollBoons, supportApplies, b12BoonSummary,
	copperheadMaxStacks, copperheadPoisonDps,
	whetstoneBashMul, whetstoneChainsawMul,
	sifterRadiusMul, sifterValueMul,
} from "../boons";
import {
	INITIAL_WEAPONS, RUN_EVENTS, BOMB_RADIUS, BOMB_MAX_CHARGES, SHOP_POOL,
	WEAPON_LEVELS, WEAPON_MAX_TABLE_LEVEL, SLOT_MACHINE_NAME,
	KONAMI_SEQUENCE, SECRET_WEAPON, statsForLevel, matchKonami,
} from "../constants";
import { recordRun, topRuns, selectedCharacterId, selectedStageId } from "../meta";

declare global {
	interface Window {
		__controlsTest?: any;
	}
}

export function installControlsProbe(eng: SimContext) {
	window.__controlsTest = {
		getYaw: () => eng.player.angle,
		getSpeed: () => eng.lastMoveSpeed,
		getX: () => eng.player.x,
		getY: () => eng.player.y,
		setKeys: (e: any) => {
			eng.keys = {};
			for (let t of e) eng.keys[t] = true;
		},
		setAim: (x: any, y: any) => {
			eng.player.angle = Math.atan2(y, x);
			eng.player.flashlightAngle = eng.player.angle;
			const cx = eng.canvas.width / 2;
			const cy = eng.canvas.height / 2;
			eng.mousePos.x = cx + x * 220;
			eng.mousePos.y = cy + y * 220;
		},
		getFlares: () => eng.player.flares,
		throwFlare: () => eng.combat!.throwFlare(),
		flareCount: () => eng.flares.length,
		plant: () => eng.mapSim!.plantPost(),
		pipe: () => eng.mapSim!.dropPipe(),
		traps: () => eng.traps.map((t: any) => ({ kind: t.kind, x: t.x, y: t.y, live: t.live, left: t.left })),
		kit: () => ({ posts: eng.posts, pipes: eng.pipes, need: eng.pickupSim!.xpToNext(), xp: eng.xp, level: eng.level }),
		give: (posts: any = 1, pipes: any = 1) => {
			eng.posts += posts;
			eng.pipes += pipes;
		},
		postRank: () => eng.postRank,
		upgradePost: () => eng.mapSim!.upgradePost(),
		weapon: (id: any) => { const w = eng.weapons.find((x: any) => x.id === id); return w && { reserve: w.reserveAmmo, max: w.maxReserveAmmo }; },
		setWave: (n: any) => { eng.wave = n; },
		setSim: (t: any) => { eng.simTime = t; }, // Batch 6: deterministic simTime for scaling tests.
		spawnType: (t: any) => eng.zombieSim!.pushZombie(t, eng.player.x + 120, eng.player.y),
		ghostLead: (type: any, mvx: any, mvy: any) => { // Group 1 test hook: personality target for a fake zombie, deterministic
			const z = { type, x: eng.player.x - 100, y: eng.player.y, flank: 1, id: `testhook` };
			const i = eng.player.x - z.x, a = eng.player.y - z.y, o = Math.hypot(i, a);
			const kvx = eng.moveVX, kvy = eng.moveVY;
			eng.moveVX = mvx; eng.moveVY = mvy;
			const pt = eng.zombieSim!.personalityTarget(z, i, a, o);
			eng.moveVX = kvx; eng.moveVY = kvy;
			return { tx: pt[0], ty: pt[1], blend: pt[2] };
		},
		lastZombie: () => { const z = eng.zombies[eng.zombies.length - 1]; return z && { t: z.type, hp: Math.round(z.health) }; },
		barrels: () => eng.explosiveBarrels.map((b: any) => ({ x: Math.round(b.x), y: Math.round(b.y) })),
		spawnPt: () => ({ x: eng.currentLocation.spawn.x, y: eng.currentLocation.spawn.y }),
		sys: () => ({
			bomb: { charges: eng.bombCharges, max: BOMB_MAX_CHARGES },
			grit: { bag: Math.round(eng.gritBag), ground: eng.grit.length },
			events: { fired: [...eng.firedEvents], active: eng.activeEvents.map((a: any) => a.id) },
			dash: { charges: eng.dashCharges, max: eng.dashMax, cd: +eng.dashCd.toFixed(2), timer: +eng.dashTimer.toFixed(2) },
			shop: { offers: eng.shopOffers.map((o: any) => o.offerId), reroll: eng.shopRerollCost, scrap: eng.scrap, waveState: eng.waveState },
			shrines: eng.shrines.map((s: any) => ({ x: Math.round(s.x), y: Math.round(s.y), attuned: s.attuned })),
			quests: { done: [...eng.meta.questsDone], lifetime: { ...eng.meta.lifetime } },
			mods: eng.waveSim!.eventMods(),
			evoHints: eng.waveSim!.evolutionHints(),
			revolver: (() => { const w = eng.weapons.find((x: any) => x.id === `revolver`); return w ? { name: w.name, dmg: w.damage, fireRate: w.fireRate, pierce: w.pierce } : null; })(),
			zombies: () => eng.zombies.map((z: any) => ({ id: String(z.id).slice(-6), t: z.type, h: Math.round(z.health), d: Math.round(Math.hypot(z.x - eng.player.x, z.y - eng.player.y)), state: z.ai, tx: Math.round(z.tx), ty: Math.round(z.ty) })),
		}),
		detonate: () => eng.combat!.detonateBomb(),
		dash: () => eng.playerSim!.tryDash(),
		god: () => { eng.player.maxHealth = 999999; eng.player.health = 999999; },
		buyShop: (i: any) => eng.mapSim!.buyShopOffer(i),
		rerollShop: () => eng.mapSim!.rerollShop(),
		lockShop: (i: any) => eng.mapSim!.toggleShopLock(i),
		rollShop: () => eng.mapSim!.rollShop(),
		attune: () => eng.mapSim!.tryAttuneShrine(),
		teleportToShrine: () => { const s = eng.shrines[0]; if (s) { eng.player.x = s.x; eng.player.y = s.y; } },
		bump: (stat: any, n: any = 1) => eng.playerSim!.bumpLifetime(stat, n),
		giveScrap: (n: any) => { eng.scrap += n; },
		bossMul: () => (eng as any).playerDamageMul({ type: `behemoth` }),
		plainMul: () => (eng as any).playerDamageMul({ type: `shambler` }),
		toBreak: () => { eng.zombiesToSpawn = 0; eng.zombies.length = 0; },
		skipBreak: () => eng.waveSim!.skipWaveBreak(),
		draftOpen: () => !!eng.draft,
		openDraft: () => eng.pickupSim!.offerDraft(),
		dismissDraft: () => { if (eng.draft) eng.pickupSim!.takeBoon(eng.draft[0].id); },
		// VS-1 probes: Harvest Streak, banish, scorch, impact audio.
		streak: () => ({ streak: eng.streak, max: eng.maxStreak, timer: +eng.streakTimer.toFixed(2), color: (eng as any).streakColor() }),
		killOne: (t: any = `shambler`) => { const z = eng.zombieSim!.pushZombie(t, eng.player.x + 30, eng.player.y); eng.zombieSim!.killZombie(z, eng.zombies.indexOf(z)); },
		decayStreak: (dt: any) => { eng.streakTimer -= dt; if (eng.streakTimer <= 0) { eng.streak = 0; eng.streakTimer = 0; } },
		hurtMe: (n: any = 10) => { eng.invuln = 0; eng.playerSim!.damagePlayer(n); },
		banish: (id: any) => eng.pickupSim!.banishBoon(id),
		banishState: () => ({ charges: eng.banishCharges, banished: [...eng.banishedBoons], draft: (eng.draft || []).map((b: any) => b.id) }),
		rollPool: (banned: any) => rollBoons(eng.boonStacks, eng.player.molotovs, eng.player.maxMolotovs, eng.posts, eng.pipes, new Set(banned)).map((b: any) => b.id),
		scorchCount: () => eng.scorchDecals.length,
		addScorchAt: (n: any = 1) => { for (let i = 0; i < n; i++) eng.juice!.addScorch(0, 0, 50); },
		playImpact: () => soundEngine.playImpact(),
		playKillSub: () => soundEngine.playKillSub(),
		playBanishSfx: () => soundEngine.playBanish(),
		// Batch 3 probes: aura, lockouts, falloff, flank, dasher, cull, casings, spawn pop.
		forceDraftTake: (id: any) => { eng.draft = [{ id, name: id, blurb: `` }]; eng.pickupSim!.takeBoon(id); return { stacks: eng.boonStacks[id] || 0, locked: [...eng.lockedBoons] }; },
		auraState: () => ({ stacks: eng.pickupSim!.boon(`aura`), r: 80 + eng.pickupSim!.boon(`aura`) * 16 }),
		runFlank: () => { eng.wave = Math.max(eng.wave, 5); eng.flankTimer = 0; eng.zombieSim!.updateFlankDirector(7); return eng.zombies.filter((z: any) => z.flankUntil > eng.simTime).length; },
		zDash: (i: any) => { const z = eng.zombies[i]; return z ? { cd: +(z.dashCd ?? -1).toFixed(2), tele: +(z.dashTele || 0).toFixed(2) } : null; },
		runCull: () => { eng.cullTimer = 0; eng.zombieSim!.cullZombies(2.1); return eng.zombies.length; },
		zSpawnT: (i: any) => eng.zombies[i] ? +eng.zombies[i].spawnT.toFixed(3) : -1,
		realAffix: (type: any) => { const z = eng.zombieSim!.pushZombie(type, eng.player.x + 120, eng.player.y); z.elite = true; z.maxHealth = Math.round(z.maxHealth * 2.2); z.health = z.maxHealth; eng.zombieSim!.assignAffix(z); return { affix: z.affix, idx: eng.zombies.indexOf(z) }; },
		spawnTracked: (t: any, x: any, y: any) => { eng._tracked = eng.zombieSim!.pushZombie(t, x, y); return 1; },
		trackedSpawnT: () => eng._tracked ? +eng._tracked.spawnT.toFixed(3) : -1,
		// CONTEXT-GAP: setPaused
		settle: () => { if (eng.draft) { eng.draft = null; eng.callbacks.onDraft?.(null); } if (eng.levelHold) { eng.levelHold = false; (eng as any).setPaused(false); } return eng.draft === null && !eng.isPaused; },
		trackedDash: () => eng._tracked ? { cd: +(eng._tracked.dashCd ?? -1).toFixed(2), alive: eng.zombies.includes(eng._tracked) } : null,
		trackedAlive: () => eng._tracked ? eng.zombies.includes(eng._tracked) : false,
		trackedPin: () => { if (eng._tracked) eng._tracked.health = eng._tracked.maxHealth = 1e6; },
		trackedHp: () => eng._tracked ? Math.round(eng._tracked.health) : -999,
		trackedInfo: () => eng._tracked ? { hp: Math.round(eng._tracked.health), elite: !!eng._tracked.elite, affix: eng._tracked.affix || null, wave: eng.wave } : null,
		zInfo: (i: any) => { const z = eng.zombies[i]; return z ? { type: z.type, x: Math.round(z.x), y: Math.round(z.y), elite: !!z.elite, affix: z.affix || null, hp: Math.round(z.health) } : null; },
		// Batch 8 (Lane B) probes: attack pulses, idle bob, death stack.
		setA11y: (o: any) => eng.playerSim!.setA11y(o),
		forceDeath: () => { eng.lastKiller = `shambler`; eng.lastStandUsed = true; eng.invuln = 0; eng.player.health = 1; eng.playerSim!.damagePlayer(99999); return { dead: eng.player.health <= 0 }; },
		deathState: () => ({ dead: eng.player.health <= 0, running: eng.isRunning, hitstop: +eng.hitstop.toFixed(3), flash: +eng.deathFlash.toFixed(3), particles: eng.particles.filter((p: any) => p.type === `blood`).length, cine: +eng.deathCineT.toFixed(3), slowmo: (eng as any).deathSlowmoFactor() }),
		atkPulse: () => ({ p: +((eng.player.atkT || 0).toFixed(3)), zs: eng.zombies.map((z: any) => +((z.atkT || 0).toFixed(3))) }),
		bashPulse: () => { eng.bashCd = 0; eng.dodgeTimer = 0; const ok = eng.playerSim!.tryBash(); return { ok, atkT: +((eng.player.atkT || 0).toFixed(3)) }; },
		bobState: () => ({ player: +(eng._lastPlayerBob || 0).toFixed(2), zombie: +(eng._lastZombieBob || 0).toFixed(2), ms: eng.playerSim!.motionScale(), moving: eng.lastMoveSpeed > .35 }),
		stunAll: () => { for (const z of eng.zombies) z.stunUntil = eng.simTime + 999; return eng.zombies.length; },
		pulseFactors: () => {
			const pt = Math.max(0, (eng.player.atkT || 0) / .05);
			const z = eng.zombies.find((zz: any) => (zz.atkT || 0) > 0);
			const zt = z ? Math.max(0, z.atkT / .05) : 0;
			return { pSx: +(1 + .22 * pt).toFixed(3), pSy: +(1 - .14 * pt).toFixed(3), zSx: +(1 + .25 * zt).toFixed(3), zSy: +(1 - .14 * zt).toFixed(3) };
		},
		pulseRender: () => ({ p: eng._lastPlayerPulse || { sx: 1, sy: 1 }, z: eng._lastZombiePulse || { sx: 1, sy: 1 } }),
		lastGameOver: () => eng._lastGameOver || null,
		simFrames: () => eng._simFrames || 0,
		runState: () => ({ running: eng.isRunning, paused: eng.isPaused, waveState: eng.waveState, draft: !!eng.draft }),
		fireOnce: () => { const before = eng.particles.length; eng.combat!.fireCurrentWeapon(); return eng.particles.filter((p: any) => p.type === `casing`).length; },
		bombRadius: () => BOMB_RADIUS,
		// Batch 4 probes: nova, missiles, vacuum, director D(t), swept collision.
		novaState: () => ({ stacks: eng.pickupSim!.boon(`nova`), cd: +eng.novaCd.toFixed(2) }),
		fireNova: () => { eng.novaCd = 0; const b = eng.bullets.length; eng.powers!.updateNova(1 / 60); return eng.bullets.length - b; },
		novaInfo: () => eng.bullets.filter((b: any) => b.weaponType === `nova`).map((b: any) => ({ dmg: b.damage, sp: Math.round(Math.hypot(b.vx, b.vy)) })),
		missileState: () => ({ stacks: eng.pickupSim!.boon(`missiles`), cd: +eng.missileCd.toFixed(2) }),
		fireMissiles: () => { eng.missileCd = 0; const b = eng.bullets.filter((x: any) => x.isMissile).length; eng.powers!.updateMissiles(1 / 60); return eng.bullets.filter((x: any) => x.isMissile).length - b; },
		missileAng: () => { const m = eng.bullets.find((x: any) => x.isMissile); return m ? +Math.atan2(m.vy, m.vx).toFixed(3) : null; },
		boomMissile: () => { const m = eng.bullets.find((x: any) => x.isMissile); if (m) { eng.powers!.detonateMissile(m); const i = eng.bullets.indexOf(m); if (i >= 0) eng.juice!.freeBulletAt(i); } return 1; },
		stepBullets: (n: any = 1) => { for (let i = 0; i < n; i++) eng.combat!.updateBullets(1 / 60, Date.now()); return eng.bullets.length; },
		vacuumState: () => ({ surge: +eng.vacuumSurge.toFixed(2), drops: eng.drops.filter((d: any) => d.type === `dust_devil`).length, grit: eng.grit.length, xp: Math.round(eng.xp) }),
		dropVacuum: () => { eng.powers!.dropVacuumAt(eng.player.x + 70, eng.player.y); return eng.drops.filter((d: any) => d.type === `dust_devil`).length; },
		eatVacuum: () => { const d = eng.drops.find((x: any) => x.type === `dust_devil`); if (d) { d.x = eng.player.x; d.y = eng.player.y; } eng.pickupSim!.updateDrops(1 / 60); return +eng.vacuumSurge.toFixed(2); },
		stepGrit: (n: any = 1) => { for (let i = 0; i < n; i++) eng.pickupSim!.updateGrit(1 / 60); return eng.grit.length; },
		directorState: () => ({ timeMul: +eng.waveSim!.timeCurve().toFixed(3), marks: eng.miniBossMarks.map((m: any) => ({ at: m, fired: eng.miniBossFired.has(m) })) }),
		timeMulAt: (t: any) => +eng.waveSim!.timeCurve(t).toFixed(3),
		fireMark: (i: any = 0) => { const m = eng.miniBossMarks[i]; eng.miniBossFired.delete(m); const elites0 = eng.zombies.filter((z: any) => z.elite).length; eng.simTime = Math.max(eng.simTime, m + .5); eng.waveSim!.updateDirector(); return { fired: eng.miniBossFired.has(m), elites: eng.zombies.filter((z: any) => z.elite).length - elites0 }; },
		sweepCheck: (x0: any, y0: any, x1: any, y1: any, br: any, cx: any, cy: any, cr: any) => eng.zombieSim!.segmentHitsCircle(x0, y0, x1, y1, br, cx, cy, cr),
		rehash: () => { eng.zombieSim!.rebuildZombieHash(); return eng.zhash.size; },
		sweepProbe: () => {
			eng.zombies.length = 0; eng.bullets.length = 0;
			const z = eng.zombieSim!.pushZombie(`shambler`, eng.player.x + 200, eng.player.y);
			z.health = z.maxHealth = 1e6; z.ai = `wander`; z.spawnT = 0;
			const b = eng.juice!.allocBullet();
			b.x = eng.player.x + 140; b.y = eng.player.y; b.vx = 100; b.vy = 0;
			b.damage = 50; b.pierce = 1; b.rangeRemaining = 600; b.weaponType = `revolver`; b.radius = 3; b.color = `#fff`;
			b.lastHit = null; b.lastHitCd = 0;
			eng.bullets.push(b);
			eng.zombieSim!.rebuildZombieHash();
			eng.combat!.updateBullets(1 / 60, Date.now());
			return { hit: z.health < 1e6, hp: Math.round(z.health) };
		},
		// Batch 5 (Lane A) probes: combat juice.
		killWordState: () => ({ last: eng.lastKillWord, count: eng.killWordCount }),
		splatState: () => ({ splats: eng.bloodSplats.length }),
		splatCount: () => eng.bloodSplats.length,
		// CONTEXT-GAP: updateParticles
		stepParticles: (n: any = 30) => { for (let i = 0; i < n; i++) (eng as any).updateParticles(1 / 60); return { particles: eng.particles.length, splats: eng.bloodSplats.length }; },
		ringState: () => { const rs = eng.shockwaves.filter((s: any) => s.b5); const l = rs[rs.length - 1]; return { rings: rs.length, lastMaxR: l ? +l.maxR.toFixed(1) : 0 }; },
		slashState: () => ({ count: eng.slashBursts.length, faint: eng.slashBursts.filter((s: any) => s.faint).length }),
		flashState: () => ({ count: eng.hitFlashes.length }),
		fireAndRead: () => { eng.combat!.fireCurrentWeapon(); return { punch: +eng.muzzlePunch.toFixed(3), kick: +eng.gunKick.toFixed(2), camT: +eng.camPunchT.toFixed(3) }; },
		muzzleState: () => ({ punch: +eng.muzzlePunch.toFixed(3), kick: +eng.gunKick.toFixed(2), camT: +eng.camPunchT.toFixed(3) }),
		whiffNow: () => { eng.bashCd = 0; eng.dodgeTimer = 0; eng.zombies.length = 0; const r = eng.playerSim!.tryBash(); return { ok: r, slowT: +eng.whiffSlowT.toFixed(3), last: eng.lastWhiff, slashes: eng.slashBursts.length }; },
		whiffState: () => ({ slowT: +eng.whiffSlowT.toFixed(3), last: eng.lastWhiff, slashes: eng.slashBursts.length }),
		bodyReact: (i: any, dmg: any = 50) => { const z = eng.zombies[i]; if (!z) return null; eng.juice!.reactHit(z, dmg, 0); return { yOff: +z.yOff.toFixed(2), squashT: +z.squashT.toFixed(3), spinT: +(z.spinT || 0).toFixed(3) }; },
		bodyReactState: (i: any) => { const z = eng.zombies[i]; return z ? { yOff: +((z.yOff || 0).toFixed(2)), squashT: +((z.squashT || 0).toFixed(3)), spinT: +((z.spinT || 0).toFixed(3)) } : null; },
		surgeState: () => { const p = eng.activePowerups.find((x: any) => x.type === `score_surge`); return { active: eng.pickupSim!.hasPowerup(`score_surge`), remaining: p ? Math.round(p.durationRemaining) : 0, score: eng.score }; },
		giveSurge: () => { eng.pickupSim!.activatePowerup(`score_surge`); return eng.pickupSim!.hasPowerup(`score_surge`); },
		addScoreProbe: (n: any) => { const b = eng.score; const g = eng.juice!.addScore(n); return { before: b, after: eng.score, gained: g }; },
		powerupPool: () => [...eng.powerupPool],
		dropSurge: () => { eng.drops.push({ id: `t-surge`, type: `score_surge`, x: eng.player.x, y: eng.player.y, amount: 1, duration: 3e4 }); eng.pickupSim!.updateDrops(1 / 60); return eng.pickupSim!.hasPowerup(`score_surge`); },
		shieldState: (i: any) => { const z = eng.zombies[i]; return z ? { type: z.type, shieldHp: z.shieldHp || 0, shieldMax: z.shieldMax || 0 } : null; },
		shieldHit: (i: any, dmg: any) => { const z = eng.zombies[i]; if (!z) return null; const before = z.shieldHp || 0; const dealt = eng.zombieSim!.applyAffixDefense(z, dmg); return { before, after: z.shieldHp || 0, dealt }; },
		// Batch 6 (Lane A) probes: enemy-AI kit.
		b6spec: () => ({ keep: eng.b6spitKeep, fire: eng.b6spitFire, fuseRange: eng.b6fuseRange, fuseTime: eng.b6fuseTime, blastR: eng.b6blastR, blastDmg: eng.b6blastDmg, blastPlayer: eng.b6blastPlayer }),
		stepZombies: (n: any = 1) => { for (let i = 0; i < n; i++) eng.zombieSim!.updateZombies(1 / 60, Date.now()); return eng.zombies.length; },
		zAi: (i: any) => eng.zombies[i] ? eng.zombies[i].ai : null,
		zPos: (i: any) => eng.zombies[i] ? { x: Math.round(eng.zombies[i].x), y: Math.round(eng.zombies[i].y) } : null,
		zDist: (i: any) => eng.zombies[i] ? Math.round(Math.hypot(eng.zombies[i].x - eng.player.x, eng.zombies[i].y - eng.player.y)) : -1,
		ghostKite: (dist: any) => { // deterministic kiting probe: fake spitter at `dist` px east of player
			const z = { type: `bloater_spitter`, x: eng.player.x - dist, y: eng.player.y, strafeDir: 0 };
			const i = eng.player.x - z.x, a = eng.player.y - z.y, o = Math.hypot(i, a);
			const pt = eng.zombieSim!.personalityTarget(z, i, a, o);
			return { tx: Math.round(pt[0]), ty: Math.round(pt[1]), blend: pt[2], band: dist < eng.b6spitKeep ? `backoff` : dist > eng.b6spitFire ? `advance` : `hold` };
		},
		kiteState: () => { const z = [...eng.zombies].reverse().find((z: any) => z.type === `bloater_spitter`); return z ? { dist: Math.round(Math.hypot(z.x - eng.player.x, z.y - eng.player.y)), ai: z.ai, spitCd: +z.spitCd.toFixed(2), spits: eng.acidSpits.length } : null; },
		fuseState: () => { const z = [...eng.zombies].reverse().find((z: any) => z.type === `bomber`); return z ? { fuseT: +z.fuseT.toFixed(3), beepT: +z.fuseBeepT.toFixed(3), alive: eng.zombies.includes(z) } : null; },
		chewState: (i: any) => { const z = eng.zombies[i]; return z ? { type: z.type, ai: z.ai, kind: z.chewKind || null, cx: Math.round(z.chewX), cy: Math.round(z.chewY) } : null; },
		driftState: (i: any) => { const z = eng.zombies[i]; return z ? { ai: z.ai, kind: z.driftKind || null, dx: Math.round(z.driftX), dy: Math.round(z.driftY) } : null; },
		// Batch 9 (Lane 1): the objective list tickDrift seeks (open holes,
		// shrines, workbench) — the deterministic twin of the drift target.
		objectives9: () => [
			...eng.holes.filter((h: any) => !h.boarded).map((h: any) => ({ kind: `hole`, x: Math.round(h.x), y: Math.round(h.y) })),
			...eng.shrines.map((s: any) => ({ kind: `shrine`, x: Math.round(s.x), y: Math.round(s.y) })),
			...(!eng._wbHidden9 && eng.currentLocation.workbench ? [{ kind: `workbench`, x: Math.round(eng.currentLocation.workbench.x), y: Math.round(eng.currentLocation.workbench.y) }] : []),
		],
		boardAll: (v: any = true) => { for (const h of eng.holes) h.boarded = !!v; return eng.holes.filter((h: any) => h.boarded).length; },
		// Batch 9 (Lane 1): test-only stash of objectives for the empty-map
		// center-fallback test. Restores via unstashObjectives9.
		stashObjectives9: () => { eng._stashedHoles9 = eng.holes; eng._stashedShrines9 = eng.shrines; eng.holes = []; eng.shrines = []; eng._wbHidden9 = true; return { holes: eng._stashedHoles9.length, shrines: eng._stashedShrines9.length }; },
		unstashObjectives9: () => { if (eng._stashedHoles9) eng.holes = eng._stashedHoles9; if (eng._stashedShrines9) eng.shrines = eng._stashedShrines9; eng._stashedHoles9 = null; eng._stashedShrines9 = null; eng._wbHidden9 = false; return { holes: eng.holes.length, shrines: eng.shrines.length }; },
		postHp: () => eng.traps.filter((t: any) => t.kind === `post`).map((t: any) => ({ live: t.live, hp: Math.round(t.hp ?? 70), x: Math.round(t.x), y: Math.round(t.y) })),
		holeBoards: () => eng.holes.filter((h: any) => h.boarded).map((h: any) => ({ x: Math.round(h.x), y: Math.round(h.y), hp: Math.round(h.boardHealth) })),
		php: () => Math.round(eng.player.health),
		// Batch 11 (Lane 1) probes: player pos, spawn-at-offset, bash-a-zombie.
		ppos: () => ({ x: Math.round(eng.player.x), y: Math.round(eng.player.y) }),
		pushZ: (t: any, dx: any, dy: any) => { const z = eng.zombieSim!.pushZombie(t, eng.player.x + dx, eng.player.y + dy); return eng.zombies.indexOf(z); },
		bashAt: (i: any) => { const z = eng.zombies[i]; if (!z) return null; eng.invuln = 0; const hp0 = eng.player.health; z.x = eng.player.x + 40; z.y = eng.player.y; eng.player.angle = 0; eng.bashCd = 0; eng.dodgeTimer = 0; eng.playerSim!.tryBash(); return { hp0: Math.round(hp0), hp1: Math.round(eng.player.health) }; },
		facePlayer: (i: any) => { const z = eng.zombies[i]; if (z) z.angle = Math.atan2(eng.player.y - z.y, eng.player.x - z.x); return !!z; },
		// Batch 5 integration probes: daily-challenge seed + kill-surge state.
		// (Lane B audio probes live on soundEngine.__test; Lane C probes are node-side.)
		b5Seed: () => eng.runSeed,
		b5Beast: () => soundEngine.getSurge(),
		// Batch 9 (Lane 1): kill-surge state + deterministic decay hook.
		killSurge: () => +eng.killSurge.toFixed(3),
		decaySurge: (dt: any) => { eng.zombieSim!.updateKillSurge(dt); return +eng.killSurge.toFixed(3); },
		// Batch 9 (Lane 1): affinity link truth — tagged support boons apply
		// ONLY to weapons sharing at least one tag; untagged boons are universal.
		affLink: (boonId: any, weaponId: any) => supportApplies(String(boonId), String(weaponId)),
		// Batch 9 (Lane 1): score-multiplier state. timeLeft is in milliseconds.
		scoreMulState: () => {
			const p = eng.activePowerups.find((x: any) => x.type === `score_surge`);
			return { active: eng.pickupSim!.hasPowerup(`score_surge`), timeLeft: p ? Math.max(0, Math.round(p.durationRemaining)) : 0, mult: 2 };
		},
		stepPowerups: (n: any = 1) => { for (let i = 0; i < Math.max(0, n | 0); i++) eng.pickupSim!.updatePowerups(1 / 60); return eng.pickupSim!.hasPowerup(`score_surge`); },
		// Batch 9 (Lane 1): deterministic score-multiplier schedule stepping.
		scoreMulSched: () => ({ nextAt: +eng.nextScoreMulAt.toFixed(2), drops: eng.drops.filter((d: any) => d.type === `score_surge`).length }),
		tickScoreMul: () => { eng.pickupSim!.updateScoreMulDrops(); return eng.drops.filter((d: any) => d.type === `score_surge`).length; },
		forceScoreMul: () => { eng.nextScoreMulAt = 0; eng.pickupSim!.updateScoreMulDrops(); return eng.drops.filter((d: any) => d.type === `score_surge`).length; },
		setSneak: (v: any) => { eng.forceSneak = !!v; eng.player.isSneaking = !!v; return eng.forceSneak; },
		// Batch 9 (Lane 1): roster + stage-rule run state.
		roster9: () => ({
			char: selectedCharacterId(), stage: selectedStageId(),
			dmgMul: +(eng.runDamageMul || 1).toFixed(3),
			hsMul: +(eng.runHeadshotMul || 1).toFixed(3),
			fireMul: +(eng.shopFireRateMul || 1).toFixed(3),
			maxHp: Math.round(eng.player.maxHealth),
			speed: +eng.player.speed.toFixed(3),
			pickupMul: +(eng.pickupRadiusMul || 1).toFixed(3),
			night: +(eng.nightLengthMult || 1).toFixed(3),
			trees: (eng.currentLocation.obstacles || []).length,
			treesBase: (eng.pristineLocation?.obstacles || []).length,
			treeBase: (eng.pristineLocation?.obstacles || []).filter((o: any) => o.type === `tree`).length,
			holes: eng.holes.length, holesBase: eng._holesBase9 ?? eng.holes.length,
			barrels: eng.explosiveBarrels.length, barrelsBase: eng._barrelsBase9 ?? eng.explosiveBarrels.length,
			gritMul: +(eng.gritValueMul || 1).toFixed(3),
			zSpdMul: +(eng.stageZombieSpeedMul || 1).toFixed(3),
			packMul: +(eng.stageSpawnPackMul || 1).toFixed(3),
			eliteMul: +(eng.eliteIntervalMul || 1).toFixed(3),
		}),
		// Lane B probes: per-level weapon tables, Konami secret, Hall of Records.
		b4Levels: (id: any, lv: any) => statsForLevel(id, lv),
		b4LevelsAll: () => Object.keys(WEAPON_LEVELS).map((id: any) => ({ id, l1: statsForLevel(id, 1)!.dmg, l5: statsForLevel(id, 5)!.dmg })),
		b4Konami: (keys: any) => matchKonami(keys),
		b4KonamiSeq: () => KONAMI_SEQUENCE,
		b4SecretWeapon: () => ({ ...SECRET_WEAPON }),
		b4DraftHasWompus: () => { for (let i = 0; i < 200; i++) { if (rollBoons({}, 0, 3).some((b: any) => b.hidden)) return true; } return false; },
		b4RecordRun: (score: any, kills: any, time: any, level: any) => recordRun({ score, kills, time, level, date: Date.now() }),
		b4TopRuns: () => topRuns(),
		// Lane C probes: adaptive music intensity, bomb echo, achievement arpeggio.
		musicIntensity: (x: any) => soundEngine.setIntensity(x),
		musicIntensityState: () => soundEngine.getIntensity(),
		bombEcho: () => soundEngine.playBombEcho(),
		achievement: () => soundEngine.playAchievement(),
		// Batch 2 probes: projectile mods, breakpoints, affixes, splitter, boss banner.
		playerPos: () => ({ x: eng.player.x, y: eng.player.y }),
		spawnAt: (t: any, x: any, y: any) => { const z = eng.zombieSim!.pushZombie(t, x, y); z.ai = `wander`; return eng.zombies.indexOf(z); },
		zHealth: (i: any) => eng.zombies[i] ? Math.round(eng.zombies[i].health) : -1,
		zMax: (i: any) => eng.zombies[i] ? Math.round(eng.zombies[i].maxHealth) : -1,
		spawnElite2: () => { const z = eng.zombieSim!.spawnGuaranteedElite(); return { affix: z.affix, type: z.type }; },
		zombieMass: (t: any) => eng.zombieSim!.zombieMass(t),
		knockbackFor: (w: any, z: any) => +eng.zombieSim!.knockbackFor(w, z).toFixed(2),
		spawnBulletAt: (x: any, y: any, vx: any, vy: any, dmg: any = 50, wt: any = `revolver`) => { const b = Object.assign(eng.juice!.allocBullet(), { x, y, vx, vy, damage: dmg, pierce: 1, rangeRemaining: 600, weaponType: wt, radius: 3, color: `#fff` }); eng.bullets.push(b); return eng.bullets.length; },
		bulletCount: () => eng.bullets.length,
		clearBullets: () => { eng.bullets.length = 0; },
		takeBoonDirect: (id: any) => { eng.boonStacks[id] = (eng.boonStacks[id] || 0) + 1; eng.pickupSim!.checkBreakpoint(id); return eng.boonStacks[id]; },
		bp: () => ({ dmg: eng.bpDamageMul, fire: eng.bpFireMul, orb: eng.bpOrbiters, chains: eng.bpChains, blast: eng.bpBlastMul }),
		forceAffix: (type: any, affix: any) => { const z = eng.zombieSim!.pushZombie(type, eng.player.x + 120, eng.player.y); z.elite = true; z.maxHealth = Math.round(z.maxHealth * 2.2); z.health = z.maxHealth; z.affix = affix; if (affix === `shielded`) z.shieldHp = Math.round(z.maxHealth * .3); if (affix === `wailing`) z.wailCd = 2 + Math.random() * 2; return eng.zombies.indexOf(z); },
		zAffix: (i: any) => eng.zombies[i] ? eng.zombies[i].affix : null,
		killAt: (i: any) => { const z = eng.zombies[i]; if (z) eng.zombieSim!.killZombie(z, i); return eng.zombies.length; },
		hurtBy: (i: any) => { const z = eng.zombies[i]; eng.invuln = 0; eng.playerSim!.damagePlayer(z ? z.damage : 10, z); },
		chillState: () => Date.now() < eng.chillUntil,
		bossBanner: () => { eng.zombieSim!.pushZombie(`behemoth`, eng.player.x + 300, eng.player.y); return { text: eng.bannerText, live: Date.now() < eng.bannerUntil }; },
		zCount: () => eng.zombies.length,
		// VS-2 probes: evolutions, family affinity, elites, wave windows.
		forceEvo: () => eng.waveSim!.checkEvolutions()?.evolvedName || null,
		weap: (id: any) => { const w = eng.weapons.find((x: any) => x.id === id); return w ? { name: w.name, dmg: w.damage, pellets: w.pellets, pierce: w.pierce, mag: w.magazineSize } : null; },
		weapLvl: (id: any) => { const w = eng.weapons.find((x: any) => x.id === id); return w ? w.upgradeLevel : null; },
		unlockW: (id: any) => { const w = eng.weapons.find((x: any) => x.id === id); if (w) w.unlocked = true; },
		famMul: (wt: any) => (eng as any).playerDamageMul({ type: `shambler` }, wt),
		spawnElite: () => { const z = eng.zombieSim!.spawnGuaranteedElite(); return { elite: !!z.elite, hp: Math.round(z.maxHealth), type: z.type }; },
		eliteCount: () => eng.zombies.filter((z: any) => z.elite).length,
		windowFor: (w: any) => (eng as any).windowFor(w).name,
		schedule: () => (eng as any).waveSchedule(),
		curWindow: () => eng.currentWindowId,
		giveBoon: (id: any, n: any = 1) => { eng.boonStacks[id] = Math.max(0, (eng.boonStacks[id] || 0) + n); },
		// VS-3 probes: hit-feel, grit tiers/fusing, powerups, caches.
		feelState: () => ({ on: eng.hitFeel, budget: +eng.hitstopBudget.toFixed(3) }),
		setFeel: (on: any) => eng.juice!.setHitFeel(on),
		resetFeel: () => { eng.hitstop = 0; eng.hitstopBudget = .3; eng.shockwaves = []; eng.slowAfter = 0; eng.zoomPunch = 0; eng.camKickX = 0; eng.camKickY = 0; },
		doFeelKill: (big: any) => { const z = eng.zombieSim!.pushZombie(big ? `miner_brute` : `shambler`, eng.player.x + 40, eng.player.y); const hs0 = eng.hitstop; eng.juice!.feelKill(z); return { hs: +eng.hitstop.toFixed(3), sw: eng.shockwaves.length, slow: +eng.slowAfter.toFixed(2), zp: +eng.zoomPunch.toFixed(3) }; },
		feelHitTest: () => { const b = { vx: 100, vy: 0 }; const z = eng.zombieSim!.pushZombie(`shambler`, eng.player.x + 40, eng.player.y); eng.juice!.feelHit(b, z); return { kick: +eng.camKickX.toFixed(2) }; },
		whiff: () => { eng.bashCd = 0; eng.dodgeTimer = 0; const r = eng.playerSim!.tryBash(); return { ok: r, feel: eng.hitFeel }; },
		gritTier: (v: any) => { eng.pickupSim!.dropGritOrb(eng.player.x + 50, eng.player.y, 0, 0, v); return (eng.grit[eng.grit.length - 1] || {}).tier; },
		gritCount: () => eng.grit.length,
		fuseNow: () => { eng.fuseTimer = 1; eng.pickupSim!.updateFuse(1); return eng.grit.map((g: any) => g.tier); },
		powerupState: () => ({ next: +eng.nextPowerupAt.toFixed(1), sim: +eng.simTime.toFixed(1), drops: eng.drops.length }),
		waveInfo: () => ({ wave: eng.wave, state: eng.waveState, draft: !!eng.draft, sim: +eng.simTime.toFixed(1) }),
		forcePowerup: () => { eng.nextPowerupAt = 0; eng.pickupSim!.updatePowerupDrops(); return eng.drops.length; },
		spinN: (n: any) => { const out: any = {}; for (let i = 0; i < n; i++) { const s = eng.pickupSim!.spinCache().join(`-`); out[s] = (out[s] || 0) + 1; } return out; },
		applyCache: (syms: any, doubled: any) => { const r = eng.pickupSim!.applyCacheResult(syms, !!doubled); return { r, scrap: eng.scrap, bomb: eng.bombCharges }; },
		gambleF: (syms: any, win: any) => eng.pickupSim!.gambleCache(syms, !!win),
		dropCache: () => { eng.pickupSim!.dropCacheAt(eng.player.x + 40, eng.player.y); return eng.caches.length; },
		openNearCache: () => { eng.pickupSim!.checkCachePickup(); return !!eng.cacheOpen; },
		weapLevels: () => eng.weapons.filter((w: any) => w.unlocked).map((w: any) => w.upgradeLevel),
		cacheJackpot: () => { const n = (eng as any).maxOutWeapons(); return { n, levels: eng.weapons.filter((w: any) => w.unlocked).map((w: any) => w.upgradeLevel), max: WEAPON_MAX_TABLE_LEVEL }; },
		toneTest: () => { soundEngine.tone({ f: 440, dur: .05, vol: .01 }); return true; },
		openChest: () => eng.pickupSim!.openChest(),
		sweepGrit: () => eng.pickupSim!.sweepGritToBag(),
		spawnGritAt: (x: any, y: any, v: any) => eng.pickupSim!.dropGritOrb(x, y, 0, 0, v),
		fireEvent: (id: any) => { const ev = RUN_EVENTS.find((e: any) => e.id === id); if (ev && !eng.firedEvents.includes(id)) eng.waveSim!.fireEvent(ev); },
		noise: (x: any, y: any, r: any) => eng.mapSim!.emitNoise(x, y, r),
		dynLightCount: () => eng.dynLights.length,
		lightingOverlay: () => !!(eng.lighting && eng.lighting.darknessCanvas),
		hashCells: () => eng.zhash.size,
		spawn150: (t: any = `shambler`) => { for (let i = 0; i < 150; i++) { const z = eng.zombieSim!.pushZombie(t, eng.player.x + 400 + (i % 15) * 60, eng.player.y + 400 + ((i / 15) | 0) * 60); z.ai = `wander`; } },
		// Batch 7 (Lane 1) probes: chain lightning, orbiters, behemoth phases,
		// haint clones, telegraphs, darkness, run-stat mods.
		equipB7: (id: any) => { const w = eng.weapons.find((x: any) => x.id === id); if (w) w.unlocked = true; const i = eng.weapons.findIndex((x: any) => x.id === id); return i >= 0 ? eng.combat!.selectWeapon(i) : false; },
		b7Weapons: () => eng.weapons.map((w: any) => w.id),
		chainInfo: () => ({ ...eng.lastChain }),
		b7cfg: () => ({ chain: (eng as any).chainCfg(), orbiter: (eng as any).orbiterCfg() }),
		pinAll: () => { for (const z of eng.zombies) { z.health = z.maxHealth = 1e6; } return eng.zombies.length; },
		orbiterInfo: () => ({ count: eng.orbiterBlades.length, radius: Math.round((eng as any).orbiterCfg().orbiterRadius), blades: eng.orbiterBlades.map((b: any) => ({ x: Math.round(b.x), y: Math.round(b.y) })) }),
		orbiterTick: (n: any = 1) => { eng.zombieSim!.rebuildZombieHash(); for (let i = 0; i < n; i++) { eng.simTime += 1 / 60; eng.powers!.updateOrbiters(1 / 60); } return eng.orbiterBlades.length; },
		setOrbiterAngle: (a: any) => { eng.orbiterAngle = a; return eng.orbiterAngle; },
		behemothPhase: () => { const z = eng.zombies.find((z: any) => z.type === `behemoth`); return z ? (z.bossPhase || `fight`) : `none`; },
		behemothInfo: () => { const z = eng.zombies.find((z: any) => z.type === `behemoth`); return z ? { phase: z.bossPhase || `fight`, enraged: !!z.enraged, speed: +z.speed.toFixed(2), summoned: !!z.summoned } : null; },
		bossCharge: () => { const z = eng.zombies.find((z: any) => z.type === `behemoth`); if (z) { z.chargeCd = 0; z.chargeWindupT = 0; } return !!z; },
		// Batch 13 (Lane 1) probes: Old Ben (boss #2), boss-fight adds, mound shield.
		boss2Info: () => {
			const z = eng.zombies.find((z: any) => z.type === `old_ben`);
			return z ? {
				x: Math.round(z.x), y: Math.round(z.y),
				hp: Math.round(z.health), maxHp: z.maxHealth,
				frac: +(z.health / Math.max(1, z.maxHealth)).toFixed(3),
				fury: !!z.fury, phase: z.bossPhase || `fight`, atk: z.benAtk || null,
				cds: { slam: +(z.slamCd || 0).toFixed(2), call: +(z.callCd || 0).toFixed(2), charge: +(z.chargeCd || 0).toFixed(2) },
			} : null;
		},
		forceOldBen: () => {
			const z = eng.zombieSim!.pushZombie(`old_ben`, eng.player.x + 300, eng.player.y);
			z.slamCd = 9999; z.callCd = 9999; z.chargeCd = 9999; // attacks only fire when forced
			return eng.zombies.indexOf(z);
		},
		oldBenAttack: (name: any) => { const z = eng.zombies.find((z: any) => z.type === `old_ben`); if (z && !z.benAtk) z.forceAtk = name; return !!z; },
		oldBenSched: (wave: any) => {
			const w0 = eng.wave; eng.wave = wave; eng.zombiesToSpawn = 1;
			eng.zombieSim!.spawnRandomZombie(); eng.wave = w0;
			const z = eng.zombies[eng.zombies.length - 1];
			return z ? z.type : null;
		},
		setPlayerPos: (x: any, y: any) => { eng.player.x = x; eng.player.y = y; return { x: eng.player.x, y: eng.player.y }; },
		playerHp: () => Math.round(eng.player.health),
		clearInvuln: () => { eng.invuln = 0; return true; },
		codexHas: (id: any) => !!eng.codexSeen?.has(id),
		mapSize: () => ({ w: eng.currentLocation.mapWidth, h: eng.currentLocation.mapHeight }),
		hitZombie: (i: any, dmg: any) => {
			const z = eng.zombies[i]; if (!z) return null;
			const dealt = eng.zombieSim!.applyAffixDefense(z, dmg); z.health -= dealt;
			return { dealt: +dealt.toFixed(2), hp: Math.round(z.health) };
		},
		shockCount: () => eng.shockwaves.length,
		gritOrbs: () => eng.grit.length,
		hurtZombie: (i: any, n: any) => { const z = eng.zombies[i]; if (z) z.health -= n; return z ? Math.round(z.health) : -1; },
		haintClones: () => eng.zombies.filter((z: any) => z.isClone).length,
		cloneInfo: () => { const z = eng.zombies.find((z: any) => z.isClone); return z ? { type: z.type, hp: Math.round(z.health), dmg: z.damage } : null; },
		haintTick: () => { const z = eng.zombies.find((z: any) => z.type === `haint` && !z.isClone); if (z) z.cloneCd = 0; return !!z; },
		// Batch 10 (Lane 1): signature specials, illusionist, corpses, mortar.
		triggerSignature: () => eng.bossSim!.triggerSignature(),
		signatureState: () => eng.bossSim!.signatureState(),
		sigTimers: () => ({
			deadeye: +Math.max(0, eng.deadeyeUntil - eng.simTime).toFixed(2),
			stillHeart: +Math.max(0, eng.stillHeartUntil - eng.simTime).toFixed(2),
			lastKill: +eng.lastKillSlowT.toFixed(2),
			lobbed: eng.lobbedCharges.length,
			frMul: eng.bossSim!.signatureFireRateMul(),
		}),
		sigReset: () => { eng.signatureCdUntil = 0; eng.deadeyeUntil = 0; eng.stillHeartUntil = 0; eng.lastKillSlowT = 0; return true; },
		// Batch 10 (Lane 1): deterministic subsystem steppers — no wall-clock waits in tests.
		// CONTEXT-GAP: update
		stepUpdate: (dt: any) => { const b = eng.simTime; (eng as any).update(dt); return +(eng.simTime - b).toFixed(4); },
		stepIllusionist: () => {
			const z = eng.zombies.find((x: any) => x.type === `illusionist` && !x.isClone);
			if (!z) return -1;
			z.cloneCd = 0;
			eng.bossSim!.tickIllusionist(z, 0.1);
			return eng.zombies.filter((x: any) => x.isClone && x.cloneOf === z.id).length;
		},
		stepCharges: (dt: any) => { eng.powers!.updateLobbedCharges(dt); return eng.lobbedCharges.length; },
		lobbedT: () => eng.lobbedCharges.length ? +eng.lobbedCharges[0].t.toFixed(3) : -1,
		stepCorpse: (dt: any) => { eng.juice!.updateCorpseDecals(dt); return eng.corpseDecals.length; },
		critProbe: () => { eng.combat!.fireCurrentWeapon(); const b = eng.bullets[eng.bullets.length - 1]; return b ? b.critChance : -1; },
		forceLastKill: () => {
			eng.waveState = `active`;
			eng.zombiesToSpawn = 0;
			eng.zombies.length = 0;
			const z = eng.zombieSim!.pushZombie(`shambler`, eng.player.x + 200, eng.player.y);
			eng.zombieSim!.killZombie(z, eng.zombies.indexOf(z));
			return { slow: +eng.lastKillSlowT.toFixed(2), remaining: eng.zombies.length, corpses: eng.corpseDecals.length };
		},
		setChar: (id: any) => { try { localStorage.setItem(`pz_character_v1`, id); } catch { } return selectedCharacterId(); },
		illusionistTick: () => { const z = eng.zombies.find((z: any) => z.type === `illusionist` && !z.isClone); if (z) z.cloneCd = 0; return !!z; },
		illusionistInfo: () => {
			const z = eng.zombies.find((z: any) => z.type === `illusionist` && !z.isClone);
			if (!z) return null;
			const clones = eng.zombies.filter((x: any) => x.isClone && x.cloneOf === z.id);
			return { hp: Math.round(z.health), clones: clones.length, cloneHp: clones.map((c: any) => Math.round(c.health)), cloneDmg: clones.map((c: any) => c.damage) };
		},
		corpseCount: () => eng.corpseDecals.length,
		mortarInfo: () => { const w = eng.weapons.find((x: any) => x.id === `mortar`); return w ? { unlocked: !!w.unlocked, dmg: w.damage, fireRate: w.fireRate, row: statsForLevel(`mortar`, 1) !== null, shop: SHOP_POOL.some((o: any) => o.weaponId === `mortar`) } : null; },
		// Batch 11 (Lane 1) probes: Patoka Jackpot slot machine.
		slotState: () => ({ cost: (eng as any).slotSpinCost(), spins: eng.slotSpinsThisBreak, grit: Math.round(eng.gritBag), state: eng.waveState, machine: SLOT_MACHINE_NAME }),
		setGrit: (n: any) => { eng.gritBag = n; return Math.round(eng.gritBag); },
		setScrap: (n: any) => { eng.scrap = n; return Math.round(eng.scrap); }, // Batch 12 (Lane 1): hunt free-reroll probe.
		// Batch 12 (Lane 1 + Lane 2): the three new synergy boons.
		// b12BoonSummary is exposed verbatim per the content lane's contract.
		b12BoonSummary: () => b12BoonSummary(eng.boonStacks),
		copperheadTest: () => {
			eng.boonStacks[`copperhead`] = 2;
			const z = eng.zombieSim!.pushZombie(`shambler`, eng.player.x + 60, eng.player.y);
			for (let k = 0; k < 6; k++) eng.combat!.applyCopperhead(z, `carbine`);
			const ps = eng.poison.get(z);
			// shotgun lacks rapid+precise tags → copperheadApplies gates it out.
			const bad = eng.zombieSim!.pushZombie(`shambler`, eng.player.x + 60, eng.player.y + 40);
			eng.combat!.applyCopperhead(bad, `shotgun`);
			const out = { stacks: ps ? ps.stacks : 0, maxStacks: copperheadMaxStacks(2), gated: !eng.poison.has(bad), summary: b12BoonSummary(eng.boonStacks).copperhead };
			eng.boonStacks[`copperhead`] = 0; eng.poison.clear();
			return out;
		},
		copperheadDot: () => {
			eng.boonStacks[`copperhead`] = 2;
			const z = eng.zombieSim!.pushZombie(`shambler`, eng.player.x + 200, eng.player.y);
			z.health = z.maxHealth = 1e4;
			eng.combat!.applyCopperhead(z, `carbine`);
			const hp0 = z.health;
			for (let k = 0; k < 60; k++) eng.combat!.tickPoison(z, 1 / 60);
			const out = { stacks: (eng.poison.get(z) || { stacks: 0 }).stacks, dps: copperheadPoisonDps(2), dot: Math.round(hp0 - z.health) };
			eng.boonStacks[`copperhead`] = 0; eng.poison.delete(z);
			return out;
		},
		whetstoneTest: () => {
			const z = eng.zombieSim!.pushZombie(`shambler`, eng.player.x + 60, eng.player.y);
			eng.boonStacks[`whetstone`] = 0;
			const k0 = (eng as any).playerDamageMul(z, `chainsaw`), c0 = (eng as any).playerDamageMul(z, `carbine`);
			eng.boonStacks[`whetstone`] = 2;
			const k2 = (eng as any).playerDamageMul(z, `chainsaw`), c2 = (eng as any).playerDamageMul(z, `carbine`);
			eng.boonStacks[`whetstone`] = 0;
			return { chainsawRatio: +(k2 / k0).toFixed(3), carbineRatio: +(c2 / c0).toFixed(3), expected: whetstoneChainsawMul(2), bashMul: whetstoneBashMul(2) };
		},
		bashTest: () => {
			const mk = () => { const z = eng.zombieSim!.pushZombie(`shambler`, eng.player.x + 40, eng.player.y); z.health = z.maxHealth = 500; return z; };
			eng.player.angle = 0;
			eng.boonStacks[`whetstone`] = 0;
			const z0 = mk(); eng.bashCd = 0; eng.dodgeTimer = 0; const h0 = z0.health; eng.playerSim!.tryBash(); const d0 = h0 - z0.health;
			eng.boonStacks[`whetstone`] = 2;
			const z2 = mk(); eng.bashCd = 0; eng.dodgeTimer = 0; const h2 = z2.health; eng.playerSim!.tryBash(); const d2 = h2 - z2.health;
			eng.boonStacks[`whetstone`] = 0;
			return { d0: Math.round(d0), d2: Math.round(d2), ratio: +(d2 / Math.max(1e-6, d0)).toFixed(3), expected: whetstoneBashMul(2) };
		},
		sifterTest: () => {
			// Statistical: each spawn rolls a 6% lucky x5 orb, so compare means.
			const z = eng.zombieSim!.pushZombie(`shambler`, eng.player.x + 100, eng.player.y);
			const mean = (rank: any) => {
				eng.boonStacks[`sifter`] = rank;
				let sum = 0;
				for (let k = 0; k < 24; k++) {
					const g0 = eng.grit.length; eng.pickupSim!.spawnGrit(z);
					sum += eng.grit.slice(g0).reduce((a: any, g: any) => a + g.value, 0);
					eng.grit.length = g0;
				}
				return sum / 24;
			};
			const v0 = mean(0), v2 = mean(2);
			eng.boonStacks[`sifter`] = 0;
			return { v0: +v0.toFixed(2), v2: +v2.toFixed(2), ratio: +(v2 / Math.max(1e-6, v0)).toFixed(3), expected: sifterValueMul(2), radiusMul: sifterRadiusMul(2) };
		},
		slotSpin: () => eng.pickupSim!.spinSlots(),
		// Coordinator integration aliases: the UI lane's SlotMachine/CacheSlots
		// components call spinSlots/slotCost/fireJackpot/gambleCache by these names.
		spinSlots: () => { const r = eng.pickupSim!.spinSlots(); return r && r.ok ? { symbols: r.reels, jackpot: r.jackpot, prize: r.prize, prizeDetail: r.prizeDetail, cost: r.cost, grit: r.grit, spins: r.spins } : { ok: false, reason: r && r.reason }; },
		slotCost: () => (eng as any).slotSpinCost(),
		fireJackpot: () => true, // engine's resolveSlotPrize already plays the jackpot celebration; UI has its own modal fallback.
		gambleCache: (s: any) => eng.pickupSim!.gambleCache(s),
		slotRigSpin: (reels: any) => eng.pickupSim!.spinSlots(reels),
		slotRig: (reels: any) => eng.pickupSim!.resolveSlotPrize(reels),
		slotReset: () => { eng.slotSpinsThisBreak = 0; return true; },
		gambleDist: (n: any = 1000) => { let wins = 0; for (let i = 0; i < n; i++) if ((eng as any).gambleWinRoll()) wins++; return { n, wins }; },
		gambleBad: () => ({ nullIn: eng.pickupSim!.gambleCache(null), strIn: eng.pickupSim!.gambleCache(`nope`), shortIn: eng.pickupSim!.gambleCache([`a`, `b`]) }),
		// Batch 11 (Lane 1) probes: White River Arc Lance.
		lanceInfo: () => { const w = eng.weapons.find((x: any) => x.id === `arc_lance`); return w ? { id: w.id, name: w.name, dmg: w.damage, fireRate: w.fireRate, row: statsForLevel(`arc_lance`, 1) !== null, shop: SHOP_POOL.some((o: any) => o.weaponId === `arc_lance`), ids: INITIAL_WEAPONS.map((x: any) => x.id) } : null; },
		lanceFire: () => {
			const w = eng.weapons.find((x: any) => x.id === `arc_lance`);
			if (!w) return { ok: false };
			w.unlocked = true;
			eng.combat!.selectWeapon(eng.weapons.indexOf(w));
			const hpBefore = eng.zombies.reduce((a: any, z: any) => a + z.health, 0);
			eng.combat!.fireCurrentWeapon();
			const beams = eng.arcBeams.length;
			for (let k = 0; k < 40; k++) eng.powers!.updateArcBeams(1 / 60);
			const hpAfter = eng.zombies.reduce((a: any, z: any) => a + z.health, 0);
			const heatSegs = eng.lightning.filter((l: any) => l.heat).length;
			return { ok: true, beams, hpBefore: Math.round(hpBefore), hpAfter: Math.round(hpAfter), heatSegs, info: eng.lastLance };
		},
		// Batch 12 (Lane 1): powerup shower + elite hunt + flamethrower + railgun.
		b12Info: () => {
			const evs: any = {};
			for (const id of [`powerup_shower`, `elite_hunt`]) {
				const ev = RUN_EVENTS.find((e: any) => e.id === id);
				evs[id] = ev ? { wave: ev.trigger.type === `wave` ? ev.trigger.wave : -1, mid: ev.midWaveSec ?? null, banner: ev.banner, radio: !!ev.radio } : null;
			}
			const weapons = [`flamethrower`, `railgun`].map((id: any) => {
				const w = eng.weapons.find((x: any) => x.id === id);
				return w ? { id: w.id, name: w.name, dmg: w.damage, fireRate: w.fireRate, row: statsForLevel(id, 1) !== null, shop: SHOP_POOL.some((o: any) => o.weaponId === id), ids: INITIAL_WEAPONS.some((x: any) => x.id === id) } : null;
			});
			return { evs, weapons, fired: [...eng.firedEvents] };
		},
		forceShower: () => {
			const before = eng.drops.length;
			eng.waveSim!.fireEvent(RUN_EVENTS.find((e: any) => e.id === `powerup_shower`));
			const sh = eng.powerupShower;
			for (let k = 0; k < 500 && eng.powerupShower; k++) eng.waveSim!.updatePowerupShower(1 / 60);
			const added = eng.drops.slice(before);
			return { ok: !!sh, total: sh ? sh.total : 0, added: added.length, kinds: [...new Set(added.map((d: any) => d.type))].length, showerDone: !eng.powerupShower };
		},
		showerFired: () => eng.firedEvents.includes(`powerup_shower`),
		showerMidWave: () => {
			// Deterministic cadence check: shower must NOT fire before its
			// mid-wave mark, and MUST fire once the mark passes.
			eng.firedEvents = eng.firedEvents.filter((id: any) => id !== `powerup_shower`);
			eng.wave = 4; eng.waveState = `active`;
			eng.waveStartSim = eng.simTime - 10;
			eng.waveSim!.updatePowerupShower(0);
			const early = eng.firedEvents.includes(`powerup_shower`);
			eng.waveStartSim = eng.simTime - 25;
			eng.waveSim!.updatePowerupShower(0);
			const late = eng.firedEvents.includes(`powerup_shower`);
			return { early, late };
		},
		forceHunt: () => {
			// Deterministic: the hunt is a wave-8 event; pin the wave.
			eng.wave = 8; eng.waveState = `active`;
			eng.firedEvents = eng.firedEvents.filter((id: any) => id !== `elite_hunt`);
			eng.waveSim!.fireEvent(RUN_EVENTS.find((e: any) => e.id === `elite_hunt`));
			return {
				total: eng.huntState ? eng.huntState.total : 0,
				targets: eng.huntTargets.length,
				affixed: eng.huntTargets.filter((z: any) => z.affix).length,
				elites: eng.huntTargets.filter((z: any) => z.elite).length,
			};
		},
		huntState: () => eng.huntState ? { ...eng.huntState } : null,
		// Batch 12 (Lane 1 + UI/audio lane): Elite Hunt tracker hook.
		// eventState("elite_hunt") -> { total, remaining } while a hunt is
		// live; null when no hunt is active (idle, finished, or wrong id).
		eventState: (eventId: any) => {
			if (eventId !== `elite_hunt` || !eng.huntState || eng.huntState.done) return null;
			return { total: eng.huntState.total, remaining: Math.max(0, eng.huntState.total - eng.huntState.killed) };
		},
		// Batch 12 (Lane 1 + Lane 2): boon-wiring probes.
		// Atomic sifter radius check: everything runs synchronously in one
		// probe so live-loop frames (or a dust-devil surge) can't move the
		// orb between setup and measurement.
		gritRadiusTest: () => {
			eng.vacuumSurge = 0;
			// CONTEXT-GAP: viewSize
			const magnet = () => (Math.max(420, (eng as any).viewSize().w * 0.46) + (eng as any).getPerkLevel(`scavenger`) * 40 + eng.gritBonus * 36) * (eng.pickupRadiusMul || 1) * sifterRadiusMul(eng.pickupSim!.boon(`sifter`));
			eng.boonStacks[`sifter`] = 0;
			const mag0 = magnet();
			eng.boonStacks[`sifter`] = 2;
			const mag2 = magnet();
			const mid = Math.floor((mag0 + mag2) / 2);
			const place = () => { eng.grit.length = 0; eng.pickupSim!.dropGritOrb(eng.player.x + mid, eng.player.y, 0, 0, 1); };
			const dist = () => eng.grit.length ? Math.hypot(eng.player.x - eng.grit[0].x, eng.player.y - eng.grit[0].y) : -1;
			eng.boonStacks[`sifter`] = 0;
			place(); eng.pickupSim!.updateGrit(0.5);
			const d0 = dist();
			eng.boonStacks[`sifter`] = 2;
			place(); eng.pickupSim!.updateGrit(0.5);
			const d2 = dist();
			eng.boonStacks[`sifter`] = 0;
			eng.grit.length = 0;
			return { mag0, mag2, mid, d0: Math.round(d0), d2: Math.round(d2), radiusMul: sifterRadiusMul(2) };
		},
		// Deterministic spawnGrit check: a fixed RNG seed makes lucky-orb
		// rolls identical across ranks, so the value ratio must equal
		// sifterValueMul. Tries seeds until one rolls no 6%-lucky orbs.
		sifterSpawnTest: () => {
			const z = eng.zombieSim!.pushZombie(`shambler`, eng.player.x + 100, eng.player.y);
			z.elite = false; // wave-8 elite rolls would add flat +12 bonus orbs.
			const savedGrit = eng.grit, savedBag = eng.gritBag;
			eng.grit = []; eng.gritBag = 0; // dodge the ground-cap merge path.
			const vals = (rank: any, seed: any) => {
				eng.boonStacks[`sifter`] = rank;
				const saved = Math.random;
				let s = seed;
				Math.random = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
				try {
					eng.pickupSim!.spawnGrit(z);
					const orbs = eng.grit.splice(0);
					return { v: orbs.reduce((a: any, g: any) => a + g.value, 0), lucky: orbs.some((g: any) => g.lucky) };
				} finally { Math.random = saved; }
			};
			let out = { ratio: -1, expected: sifterValueMul(2), radiusMul: sifterRadiusMul(2), seed: -1 };
			for (let seed = 1234567; seed < 1234767; seed++) {
				const a = vals(0, seed), b = vals(2, seed);
				if (!a.lucky && !b.lucky) {
					out = { ratio: b.v / Math.max(1e-6, a.v), expected: sifterValueMul(2), radiusMul: sifterRadiusMul(2), seed };
					break;
				}
			}
			eng.boonStacks[`sifter`] = 0;
			eng.grit = savedGrit; eng.gritBag = savedBag;
			return out;
		},
		killHunt: () => {
			const targets = [...eng.huntTargets];
			for (const z of targets) {
				const i = eng.zombies.indexOf(z);
				if (i >= 0) { z.health = 1; eng.zombieSim!.killZombie(z, i); }
			}
			return { done: !!(eng.huntState && eng.huntState.done), reroll: eng.huntBonusReroll, grit: eng.grit.length, targets: eng.huntTargets.length };
		},
		freeReroll: () => {
			const s0 = eng.scrap, c0 = eng.shopRerollCost;
			const ok = eng.mapSim!.rerollShop();
			return { ok, scrap: eng.scrap, s0, cost: eng.shopRerollCost, c0, flag: eng.huntBonusReroll };
		},
		flameFire: () => {
			const w = eng.weapons.find((x: any) => x.id === `flamethrower`);
			if (!w) return { ok: false };
			w.unlocked = true;
			eng.combat!.selectWeapon(eng.weapons.indexOf(w));
			eng.player.angle = 0;
			for (let i = 0; i < 6; i++) eng.zombieSim!.pushZombie(`shambler`, eng.player.x + 110 + i * 28, eng.player.y + (i % 2 ? 12 : -12));
			const hpBefore = eng.zombies.reduce((a: any, z: any) => a + z.health, 0);
			eng.combat!.fireCurrentWeapon();
			const info = eng.lastFlame;
			const stacks = eng.zombies.slice(-6).map((z: any) => z.burnTick || 0);
			for (let k = 0; k < 120; k++) eng.zombieSim!.updateZombies(1 / 60, Date.now());
			const hpAfter = eng.zombies.reduce((a: any, z: any) => a + z.health, 0);
			return { ok: true, hits: info ? info.hits : -1, stacks, hpBefore: Math.round(hpBefore), hpAfter: Math.round(hpAfter) };
		},
		railFire: () => {
			const w = eng.weapons.find((x: any) => x.id === `railgun`);
			if (!w) return { ok: false };
			w.unlocked = true;
			eng.combat!.selectWeapon(eng.weapons.indexOf(w));
			eng.player.angle = 0;
			const zs = [];
			for (let i = 0; i < 5; i++) zs.push(eng.zombieSim!.pushZombie(`shambler`, eng.player.x + 200 + i * 120, eng.player.y));
			const hpBefore = zs.reduce((a: any, z: any) => a + z.health, 0);
			eng.combat!.fireCurrentWeapon();
			const charging = eng.railCharging;
			for (let k = 0; k < 80 && eng.railCharging; k++) (eng as any).updateRailgun(1 / 60);
			const hpAfter = zs.reduce((a: any, z: any) => a + Math.max(0, z.health), 0);
			return { ok: true, charging, fired: !eng.railCharging, hits: eng.lastRail ? eng.lastRail.hits : -1, hpBefore: Math.round(hpBefore), hpAfter: Math.round(hpAfter) };
		},
		// Batch 11 (Lane 1) probes: thorned + wailing affixes.
		affixInfo: (i: any) => { const z = eng.zombies[i]; return z ? { affix: z.affix, wailCd: z.wailCd === undefined ? null : +z.wailCd.toFixed(2), frenzy: (z.frenzyUntil || 0) > eng.simTime } : null; },
		thornTest: (i: any) => {
			const z = eng.zombies[i];
			if (!z) return null;
			eng.invuln = 0;
			const hp0 = eng.player.health;
			const dealt = eng.zombieSim!.applyAffixDefense(z, 30);
			z.health -= dealt;
			const back = eng.zombieSim!.thornedReflect(z, dealt);
			return { back, hp0: Math.round(hp0), hp1: Math.round(eng.player.health), affix: z.affix };
		},
		wailTick: (i: any, n: any = 1) => {
			const z = eng.zombies[i];
			if (!z) return null;
			z.wailCd = 0.01;
			for (let k = 0; k < n; k++) eng.zombieSim!.updateZombies(1 / 60, Date.now());
			const near = eng.zombies.map((o: any, j: any) => ({ j, frenzy: (o.frenzyUntil || 0) > eng.simTime }));
			return { fired: (z.wailCd || 0) > 1, frenzied: near.filter((o: any) => o.frenzy).length };
		},
		mortarFire: () => {
			const w = eng.weapons.find((x: any) => x.id === `mortar`);
			if (!w) return { ok: false };
			w.unlocked = true;
			eng.combat!.selectWeapon(eng.weapons.indexOf(w));
			const scorchBefore = eng.scorchDecals.length;
			const hpBefore = eng.zombies.reduce((a: any, z: any) => a + z.health, 0);
			const nBefore = eng.zombies.length;
			eng.combat!.fireCurrentWeapon();
			const shells = eng.bullets.filter((b: any) => b.isMortar).length;
			eng.combat!.updateBullets(0.85, Date.now());
			const hpAfter = eng.zombies.reduce((a: any, z: any) => a + z.health, 0);
			return { ok: true, shells, nBefore, hpBefore: Math.round(hpBefore), hpAfter: Math.round(hpAfter), scorchBefore, scorchAfter: eng.scorchDecals.length };
		},
		// Batch 10 (Lane 4): boon-wiring probes.
		lastBullet: () => { const b = eng.bullets[eng.bullets.length - 1]; return b ? { pierce: b.pierce, spd: +Math.hypot(b.vx, b.vy).toFixed(2), wt: b.weaponType } : null; },
		fireInterval: () => +((eng._lastFireInterval || 0).toFixed(2)),
		brineState: () => ({ rank: eng.pickupSim!.boon(`brinebarrel`), puddles: eng.firePuddles.filter((p: any) => p.isBrine).map((p: any) => ({ r: Math.round(p.radius), dur: p.duration, dps: p.dps || 0 })) }),
		stepPuddles: (n: any = 1) => { for (let k = 0; k < n; k++) eng.combat!.updateFirePuddles(Date.now()); return eng.firePuddles.length; },
		detonateBarrel: () => { const b = eng.explosiveBarrels[0]; if (!b) return false; eng.combat!.detonateExplosiveBarrel(b, 0); return true; },
		draftIds: () => (eng.draft || []).map((d: any) => d.id),
		telegraphs: () => eng.telegraphs.length,
		stepB7: (n: any = 1) => { eng.zombieSim!.rebuildZombieHash(); for (let i = 0; i < n; i++) { eng.simTime += 1 / 60; eng.juice!.updateTelegraphs(1 / 60); eng.powers!.updateOrbiters(1 / 60); } return eng.telegraphs.length; },
		setDark: (v: any) => { eng.dark = !!v; return eng.dark; },
		isDark: () => eng.dark,
		canSee: (i: any) => { const z = eng.zombies[i]; return z ? eng.zombieSim!.zombieSees(z, Math.hypot(z.x - eng.player.x, z.y - eng.player.y)) : false; },
		telegraphInfo: () => eng.telegraphs.map((t: any) => ({ kind: t.kind, t0: +t.t0.toFixed(3), dur: t.dur })),
		isLitAt: (x: any, y: any) => eng.juice!.isLit(x, y),
		runMods: () => ({ dmg: eng.runDamageMul || 1, hp: eng.runHpMul || 1, spd: eng.runSpeedMul || 1, xp: eng.runXpMul || 1 }),
		reapplyRunMods: () => { (eng as any).applyRunStatMods(); eng.playerSim!.applyRosterMods(); return { mods: { dmg: eng.runDamageMul, hp: eng.runHpMul, spd: eng.runSpeedMul, xp: eng.runXpMul }, hp: Math.round(eng.player.maxHealth), spd: +eng.player.speed.toFixed(4) }; },
		// Batch 8 (Lane A) probes: accel/friction, AI LOD, separation, arrive.
		stepPlayer: (n: any = 1) => { for (let k = 0; k < n; k++) eng.playerSim!.updatePlayer!(1 / 60); return { x: +eng.player.x.toFixed(1), y: +eng.player.y.toFixed(1) }; },
		pvel: () => ({ x: +eng.moveVX.toFixed(3), y: +eng.moveVY.toFixed(3), sp: +eng.lastMoveSpeed.toFixed(3) }),
		dodge: () => eng.playerSim!.tryDodge(),
		dodgeState: () => ({ timer: +eng.dodgeTimer.toFixed(3), cd: +eng.dodgeCd.toFixed(3), stam: Math.round(eng.player.stamina) }),
		zSpd: (i: any) => eng.zombies[i] ? +((eng.zombies[i].lastSpd || 0).toFixed(3)) : -1,
		zLod: (i: any) => { const z = eng.zombies[i]; return z ? { think: !!z.lodThink, off: z.lodOff ?? -1, ai: z.ai } : null; },
		zVel: (i: any) => { const z = eng.zombies[i]; return z ? { vx: +((z.vx || 0).toFixed(3)), vy: +((z.vy || 0).toFixed(3)) } : null; },
	};
	let e = window.__controlsTest;
	e.teleport = (e: any, t: any) => {
		eng.player.x = e, eng.player.y = t, eng.camX = e, eng.camY = t;
		eng.moveVX = 0;
		eng.moveVY = 0;
		eng.dodgeTimer = 0;
	}, e.getHoles = () => eng.holes.map((e: any) => ({
		id: e.id,
		x: e.x,
		y: e.y,
		boarded: e.boarded,
		kind: e.kind
	})), e.boardNearest = () => {
		let e = eng.zombieSim!.nearestHole(9999);
		return e && eng.zombieSim!.boardHole(e), eng.holes.filter((e: any) => e.boarded).length;
	}, e.getLantern = () => ({
		lit: eng.lanternLit,
		wentOut: eng.lanternWentOut,
		x: eng.currentLocation.lantern?.x ?? 0,
		y: eng.currentLocation.lantern?.y ?? 0
	// CONTEXT-GAP: snuffLantern
	}), e.snuffLantern = () => (eng as any).snuffLantern(), e.relightLantern = () => eng.mapSim!.relightLantern(), e.emitNoise = (e: any = 480) => (eng.mapSim!.alertZombies(eng.player.x, eng.player.y, e), eng.noisePulses.length), e.getNoiseCount = () => eng.noisePulses.length, e.armBell = () => {
		eng.bellReady = true, eng.bellRung = false;
	}, e.ringBell = () => eng.mapSim!.ringBell(), e.getBell = () => ({
		ready: eng.bellReady,
		rung: eng.bellRung,
		hold: eng.bellHold,
		lureUntil: eng.bellLureUntil,
		extract: eng.extractActive
	}), e.interact = () => (eng as any).interactLoreNote(), e.pullHorde = () => {
		eng.zombies.forEach((z: any, i: any) => {
			const a = i / Math.max(1, eng.zombies.length) * Math.PI * 2;
			z.x = eng.player.x + Math.cos(a) * 110;
			z.y = eng.player.y + Math.sin(a) * 90;
			z.ai = "chase";
		});
		return eng.zombies.length;
	}, e.dodge = () => eng.playerSim!.tryDodge(), e.bash = () => eng.playerSim!.tryBash(), e.getKit = () => ({
		dodgeTimer: eng.dodgeTimer,
		dodgeCd: eng.dodgeCd,
		invuln: eng.invuln,
		bloodRush: eng.bloodRush,
		lastStandUsed: eng.lastStandUsed,
		worldSlow: eng.worldSlow,
		stamina: eng.player.stamina,
		x: eng.player.x,
		y: eng.player.y
	}), e.forceLastStand = () => {
		eng.lastStandUsed = false;
		eng.invuln = 0;
		eng.player.health = 8;
		eng.playerSim!.damagePlayer(40);
		return {
			health: eng.player.health,
			lastStandUsed: eng.lastStandUsed,
			invuln: eng.invuln
		};
	}, e.spawn = (type: any, x: any, y: any) => {
		eng.zombieSim!.pushZombie(type || "shambler", x, y);
		return eng.zombies.length;
	}, e.setWeapon = (i: any) => eng.combat!.selectWeapon(i), e.getWeapon = () => eng.weapons[eng.currentWeaponIndex].id, e.fire = () => eng.combat!.fireCurrentWeapon(), e.holdFire = (on: any) => {
		eng.isMouseDown = !!on;
	}, e.aimWorld = (x: any, y: any) => {
		eng.player.angle = Math.atan2(y - eng.player.y, x - eng.player.x);
		eng.player.flashlightAngle = eng.player.angle;
		const cx = eng.canvas.width / 2, cy = eng.canvas.height / 2;
		eng.mousePos.x = cx + Math.cos(eng.player.angle) * 220;
		eng.mousePos.y = cy + Math.sin(eng.player.angle) * 220;
	}, e.getWorld = () => ({
		alive: eng.isRunning && eng.player.health > 0,
		paused: eng.isPaused,
		health: eng.player.health,
		stamina: eng.player.stamina,
		x: eng.player.x,
		y: eng.player.y,
		weapon: eng.weapons[eng.currentWeaponIndex].id,
		mag: eng.weapons[eng.currentWeaponIndex].currentMag,
		reserve: eng.weapons[eng.currentWeaponIndex].reserveAmmo,
		scrap: eng.scrap,
		score: eng.score,
		wave: eng.wave,
		waveState: eng.waveState,
		waveWindow: (eng as any).windowFor(Math.max(1, eng.wave)).name,
		waveSchedule: (eng as any).waveSchedule(),
		eliteIn: Math.max(0, Math.ceil((eng as any).eliteIntervalSec() - (eng.simTime - eng.lastEliteAt))),
		break: eng.waveBreakCountdown,
		kills: eng.stats.kills,
		hint: eng.interactHint,
		lantern: eng.lanternLit,
		sneaking: eng.player.isSneaking,
		bloodRush: eng.bloodRush,
		lastStand: eng.lastStandUsed,
		invuln: eng.invuln,
		zombies: eng.zombies.map((z: any) => ({ x: z.x, y: z.y, type: z.type, hp: z.health, ai: z.ai })),
		holes: eng.holes.map((h: any) => ({ x: h.x, y: h.y, boarded: h.boarded })),
		map: { w: eng.currentLocation.mapWidth, h: eng.currentLocation.mapHeight, name: eng.currentLocation.name },
	}), e.skipBreak = () => eng.waveSim!.skipWaveBreak(), e.clues = () => ({
		armed: eng.rigArmed,
		rig: eng.rig ? { x: Math.round(eng.rig.x), y: Math.round(eng.rig.y), name: eng.rig.name } : null,
		notes: eng.loreNotes.map((n: any) => ({ id: n.id, x: Math.round(n.x), y: Math.round(n.y), blocked: eng.zombieSim!.checkObstacleCollision(n.x, n.y, 18, false) }))
	}), e.crank = () => {
		if (!eng.rig) return false;
		eng.rigArmed = true;
		eng.rig.cool = 0;
		eng.player.x = eng.rig.x;
		eng.player.y = eng.rig.y + 40;
		return true;
	};
}
