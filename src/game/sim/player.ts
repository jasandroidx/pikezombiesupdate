// Batch 14 (modularization): PlayerSim — player sim, death stack, run meta, tuning/a11y.
// Mechanically extracted from src/game/engine.ts (branch feature/crate-vs, Batch 13).
// State lives on the engine; this module reaches it via `eng: SimContext`.
// Same-module calls stay `this.x()`; engine/other-module calls are
// `(this.eng as any).x()` and marked `// CONTEXT-GAP: x` for the integrator.
import type { SimContext } from "./context";
import { saltCircleDefenseMul, saltCircleApplies, cornLiquorMoveMul, whetstoneBashMul } from "../boons";
import { GAME_LOCATIONS, QUESTS } from "../constants";
import { saveMeta, recordRun, characterDef, stageDef, selectedCharacterId, selectedStageId } from "../meta";
import { soundEngine } from "../../audio/soundEngine";
import { buildMapFeatures, sceneBaseCounts } from "../scenes";

export class PlayerSim {
	constructor(private eng: SimContext) {}

		initRunMeta() {
			const done = new Set(this.eng.meta.questsDone);
			this.eng.questDmgMul = 1 + (done.has(`first_blood`) ? .05 : 0) + (done.has(`deadeye`) ? .08 : 0) + (done.has(`exterminator`) ? .10 : 0);
			this.eng.questMoveMul = done.has(`tracebound`) ? 1.05 : 1;
			this.eng.shopDmgMul = 1;
			this.eng.shopFireRateMul = 1;
			this.eng.shopMagnetBonus = 0;
			this.eng.shopBought = new Set();
			this.eng.player.speed *= this.eng.questMoveMul;
			if (done.has(`homesteader`)) this.eng.player.maxHealth += 15;
			this.eng.player.health = this.eng.player.maxHealth;
			if (done.has(`relic_hunter`)) this.eng.scrap += 40;
			this.eng.meta.lifetime.runsPlayed++;
			saveMeta(this.eng.meta);
			this.eng.dashCharges = this.eng.dashMax;
			this.eng.dashTimer = 0;
			this.eng.dashCd = 0;
			this.eng.dashRegenT = 0;
			(this.eng as any).spawnShrines(); // CONTEXT-GAP: spawnShrines
			(this.eng as any).rollShop(true); // CONTEXT-GAP: rollShop
			// Batch 7: run-stat mods from the meta lane (guarded — defaults hold if absent).
			(this.eng as any).applyRunStatMods(); // CONTEXT-GAP: applyRunStatMods
		}

		// Batch 9 (Lane 1): stage terrain rules — tree density (location clone, never
		// mutates the shared GAME_LOCATIONS row), hole count, barrel count. Runs
		// early in start(), building scene features from scenes.ts before
		// rebuildFlow(true) so the flow field sees the extra trees.
		applyStageTerrain() {
			const num = (v: any, d: any) => typeof v === `number` && isFinite(v) ? v : d;
			let rules: any = {};
			try { rules = stageDef(selectedStageId()).rules || {}; } catch (err) { /* defaults hold */ }
			this.eng.nightLengthMult = num(rules.nightLengthMult, 1);
			// NOTE: the sim has no night-duration timer (dark is a static per-map
			// flag), so nightLengthMult is stored on the run for the future night cycle.
			this.eng.gritValueMul = num(rules.gritMult, 1);
			this.eng.stageZombieSpeedMul = num(rules.zombieSpeedMult, 1);
			this.eng.stageSpawnPackMul = num(rules.spawnPackMult, 1);
			this.eng.eliteIntervalMul = num(rules.eliteIntervalMult, 1);
			// Tree density — clone the location; the shared row stays pristine.
			const treeMult = num(rules.treeDensityMult, 1);
			const pristine = this.eng.pristineLocation || this.eng.currentLocation;
			const base = pristine.obstacles || [];
			const trees = base.filter((o: any) => o.type === `tree`);
			const wantTrees = Math.round(trees.length * treeMult);
			if (wantTrees > trees.length && trees.length > 0) {
				const extra = [];
				for (let k = trees.length; k < wantTrees; k++) {
					const t = trees[k % trees.length];
					extra.push({ ...t, x: Math.round(t.x + (this.eng.rng() * 180 - 90)), y: Math.round(t.y + (this.eng.rng() * 180 - 90)) });
				}
				this.eng.currentLocation = { ...pristine, obstacles: [...base, ...extra] };
			} else {
				this.eng.currentLocation = pristine;
			}
			// Batch 11 (Lane 3): scene builders replicate the hole/barrel top-up exactly
			// (base rebuild + jittered copies, identical RNG draw order: holes then barrels).
			const f = buildMapFeatures(this.eng.currentLocation.id, { rules, rng: () => this.eng.rng() });
			this.eng.holes = f.holes;
			this.eng.explosiveBarrels = f.barrels;
			this.eng._holesBase9 = sceneBaseCounts(this.eng.currentLocation.id).holes;
			this.eng._barrelsBase9 = sceneBaseCounts(this.eng.currentLocation.id).barrels;
		}

		// Batch 9 (Lane 1): character passive mods — applied in start() after
		// initRunMeta/applyRunStatMods so the meta-lane math is already settled.
		// Idempotent across repeated starts: the previous run's character slice is
		// divided/subtracted out before the new one lands.
		applyRosterMods() {
			const num = (v: any, d: any) => typeof v === `number` && isFinite(v) ? v : d;
			let mods: any = {};
			try { mods = characterDef(selectedCharacterId()).mods || {}; } catch (err) { /* defaults hold */ }
			this.eng.runDamageMul = (this.eng.runDamageMul || 1) * num(mods.damageMul, 1);
			this.eng.runHeadshotMul = num(mods.headshotMul, 1);
			this.eng.shopFireRateMul = (this.eng.shopFireRateMul || 1) * num(mods.fireRateMul, 1);
			this.eng.pickupRadiusMul = num(mods.pickupRadiusMul, 1);
			// Flat max-HP add: subtract the previous run's slice first.
			this.eng.player.maxHealth = Math.max(1, this.eng.player.maxHealth - this.eng._charMaxHpAdd);
			this.eng._charMaxHpAdd = Math.round(num(mods.maxHpAdd, 0));
			this.eng.player.maxHealth += this.eng._charMaxHpAdd;
			this.eng.player.health = this.eng.player.maxHealth;
			// Speed mul: divide out the previous run's slice first.
			if (this.eng._charSpeedMul !== 1) this.eng.player.speed = this.eng.player.speed / this.eng._charSpeedMul;
			this.eng._charSpeedMul = num(mods.speedMul, 1);
			this.eng.player.speed *= this.eng._charSpeedMul;
		}

		bumpLifetime(stat: any, n = 1) {
			this.eng.meta.lifetime[stat] += n;
			for (const q of QUESTS) {
				if (this.eng.meta.questsDone.includes(q.id)) continue;
				if (this.eng.meta.lifetime[q.stat] >= q.goal) {
					this.eng.meta.questsDone.push(q.id);
					saveMeta(this.eng.meta);
					(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 52, `COUNTY RECORD: ` + q.name, `#d4a017`); // CONTEXT-GAP: spawnFloater
					this.eng.callbacks.onRadio?.(`WJPS`, `County record set: ${q.name}. ${q.bonus}.`);
					soundEngine.playPowerup();
					soundEngine.playAchievement();
				}
			}
		}

		tryDash() {
			if (this.eng.dashCd > 0 || this.eng.dashTimer > 0 || this.eng.dashCharges < 1) return false;
			let ix = 0, iy = 0;
			(this.eng.keys.KeyW || this.eng.keys.ArrowUp) && --iy;
			(this.eng.keys.KeyS || this.eng.keys.ArrowDown) && (iy += 1);
			(this.eng.keys.KeyA || this.eng.keys.ArrowLeft) && --ix;
			(this.eng.keys.KeyD || this.eng.keys.ArrowRight) && (ix += 1);
			let dx, dy;
			if (Math.hypot(ix, iy) > .2) {
				dx = ix;
				dy = iy;
			} else if (Math.hypot(this.eng.moveVX, this.eng.moveVY) > .35) {
				dx = this.eng.moveVX;
				dy = this.eng.moveVY;
			} else {
				dx = Math.cos(this.eng.player.angle);
				dy = Math.sin(this.eng.player.angle);
			}
			const m = Math.hypot(dx, dy) || 1;
			this.eng.dashDirX = dx / m;
			this.eng.dashDirY = dy / m;
			this.eng.dashTimer = .34;
			this.eng.dashCd = .9;
			this.eng.invuln = Math.max(this.eng.invuln, .36);
			this.eng.dashCharges--;
			this.eng.dashRegenT = 0;
			this.eng.trauma = Math.min(1, this.eng.trauma + .12 * this.tune('shake') * this.motionScale());
			soundEngine.playDodge();
			return true;
		}

		updatePlayer(e: any) {
			this.eng.lastDt = e;
			let t = 0, n = 0;
			(this.eng.keys.KeyW || this.eng.keys.ArrowUp) && --n, (this.eng.keys.KeyS || this.eng.keys.ArrowDown) && (n += 1), (this.eng.keys.KeyA || this.eng.keys.ArrowLeft) && --t, (this.eng.keys.KeyD || this.eng.keys.ArrowRight) && (t += 1), (this.eng.virtualJoystickMove.x !== 0 || this.eng.virtualJoystickMove.y !== 0) && (t = this.eng.virtualJoystickMove.x, n = this.eng.virtualJoystickMove.y);
			let r = Math.hypot(t, n);
			r > 0 && (t /= r, n /= r);
			const sneaking = this.eng.forceSneak || this.eng.keys.ControlLeft || this.eng.keys.ControlRight;
			this.eng.player.isSneaking = !!sneaking;
			if (this.eng.virtualJoystickAim.x !== 0 || this.eng.virtualJoystickAim.y !== 0) this.eng.player.angle = Math.atan2(this.eng.virtualJoystickAim.y, this.eng.virtualJoystickAim.x);
			else if (this.eng.isMouseDown) {
				const wpt = this.screenToWorld(this.eng.mousePos.x, this.eng.mousePos.y);
				this.eng.player.angle = Math.atan2(wpt.y - this.eng.player.y, wpt.x - this.eng.player.x);
			} else if (!sneaking) {
				const z = (this.eng as any).nearestTarget((this.eng as any).aimReach()); // CONTEXT-GAP: nearestTarget, aimReach
				if (z) this.eng.player.angle = Math.atan2(z.y - this.eng.player.y, z.x - this.eng.player.x);
			}
			this.eng.player.flashlightAngle = this.eng.player.angle;
			const aimX = Math.cos(this.eng.player.angle);
			const aimY = Math.sin(this.eng.player.angle);
			let i = (this.eng as any).hasPowerup(`speed_boost`); // CONTEXT-GAP: hasPowerup
			let a = sneaking;
			let o = (this.eng.keys.ShiftLeft || this.eng.keys.ShiftRight) && r > 0 && !a && this.eng.player.stamina > 4;
			if (o && (this.eng.player.stamina > 5 || i)) {
				this.eng.player.isSprinting = true;
				if (!i) this.eng.player.stamina = Math.max(0, this.eng.player.stamina - e * 26);
			} else {
				this.eng.player.isSprinting = false;
				this.eng.player.stamina = Math.min(this.eng.player.maxStamina, this.eng.player.stamina + e * (r > 0 ? 12 : 20));
			}
			const sprintWant = this.eng.player.isSprinting ? 1.55 : 1;
			this.eng.sprintBlend += (sprintWant - this.eng.sprintBlend) * (1 - Math.exp(-(this.eng.player.isSprinting ? 7 : 11) * e));
			let gait = (this.eng.player.isSneaking ? .5 : 1) * this.eng.sprintBlend * (i ? 1.32 : 1);
			if (this.eng.bloodRush > 0) gait *= 1.22;
			if ((this.eng as any).boon(`stride`)) gait *= 1 + (this.eng as any).boon(`stride`) * .06; // CONTEXT-GAP: boon
			// Batch 10 (Lane 4): Corn Liquor — the tradeoff: −6%/rank move speed
			// (floored at 0.5 in the helper). Global passive, untagged.
			gait *= cornLiquorMoveMul((this.eng as any).boon(`cornliquor`)); // CONTEXT-GAP: boon
			// Batch 2: frosted chill slows the player.
			if (Date.now() < this.eng.chillUntil) gait *= .7;
			if (r > 0) {
				const fwd = t * aimX + n * aimY;
				const side = t * -aimY + n * aimX;
				if (fwd < -.18) gait *= .68;
				else if (Math.abs(side) > Math.abs(fwd) + .12) gait *= .84;
			}
			const c = this.eng.player.speed * gait;
			// Batch 8: acceleration / friction movement — velocity eases toward the
			// target instead of snapping. ~1800 u/s^2 accel toward input, ~2200 u/s^2
			// friction decay with no input. (moveVX is u per 1/60s tick, so the
			// per-second rates are divided by 60.) Roll/dash impulses below still
			// override velocity directly while their timers run.
			const ACCEL = 1800 / 60, FRICTION = 2200 / 60;
			if (r > 0) {
				const dvx = t * c - this.eng.moveVX, dvy = n * c - this.eng.moveVY;
				const dv = Math.hypot(dvx, dvy);
				if (dv > 0) {
					const step = Math.min(dv, ACCEL * e);
					this.eng.moveVX += dvx / dv * step;
					this.eng.moveVY += dvy / dv * step;
				}
			} else {
				const sp = Math.hypot(this.eng.moveVX, this.eng.moveVY);
				if (sp > 0) {
					const step = Math.min(sp, FRICTION * e);
					this.eng.moveVX -= this.eng.moveVX / sp * step;
					this.eng.moveVY -= this.eng.moveVY / sp * step;
					if (Math.hypot(this.eng.moveVX, this.eng.moveVY) < .05) {
						this.eng.moveVX = 0;
						this.eng.moveVY = 0;
					}
				}
			}
			this.eng.lastMoveSpeed = Math.hypot(this.eng.moveVX, this.eng.moveVY);
			if (this.eng.dodgeTimer > 0) {
				this.eng.dodgeTimer = Math.max(0, this.eng.dodgeTimer - e);
				this.eng.moveVX = this.eng.dodgeDirX * 9.6;
				this.eng.moveVY = this.eng.dodgeDirY * 9.6;
				this.eng.lastMoveSpeed = 9.6;
				if (this.eng.simTime * 40 % 1 < .35) this.eng.afterimages.push({
					x: this.eng.player.x,
					y: this.eng.player.y,
					facing: this.eng.bodyFacing,
					life: .18,
					maxLife: .18
				});
			}
			if (this.eng.dashTimer > 0) {
				this.eng.dashTimer = Math.max(0, this.eng.dashTimer - e);
				this.eng.moveVX = this.eng.dashDirX * 13.5;
				this.eng.moveVY = this.eng.dashDirY * 13.5;
				this.eng.lastMoveSpeed = 13.5;
				if (this.eng.simTime * 40 % 1 < .5) this.eng.afterimages.push({
						x: this.eng.player.x,
						y: this.eng.player.y,
						facing: this.eng.bodyFacing,
					life: .22,
					maxLife: .22
				});
			}
			if (this.eng.dashCd > 0) this.eng.dashCd = Math.max(0, this.eng.dashCd - e);
			if (this.eng.dashCharges < this.eng.dashMax) {
				this.eng.dashRegenT += e;
				if (this.eng.dashRegenT >= 5) {
					this.eng.dashRegenT = 0;
					this.eng.dashCharges++;
				}
			}
			if (this.eng.lastMoveSpeed > .7) {
				if (this.eng.moveVX > .55) this.eng.bodyFacing = 1;
				else if (this.eng.moveVX < -.55) this.eng.bodyFacing = -1;
			} else if (aimX < -.38) this.eng.bodyFacing = -1;
			else if (aimX > .38) this.eng.bodyFacing = 1;
			this.eng.bodyFacingSmooth += (this.eng.bodyFacing - this.eng.bodyFacingSmooth) * (1 - Math.exp(-16 * e));
			const stepRate = this.eng.player.isSneaking ? 6.5 : this.eng.player.isSprinting ? 12.5 : 8.6;
			const prevPhase = this.eng.walkPhase;
			if (this.eng.lastMoveSpeed > .4) {
				this.eng.walkPhase += e * stepRate * Math.min(1.35, this.eng.lastMoveSpeed / Math.max(.2, this.eng.player.speed));
				const s0 = Math.sin(prevPhase);
				const s1 = Math.sin(this.eng.walkPhase);
				if (this.eng.footstepArmed && s0 <= 0 && s1 > 0) {
					this.eng.footstepArmed = false;
					this.emitFootstep();
				}
				if (s1 < -.2) this.eng.footstepArmed = true;
			} else {
				this.eng.walkPhase += e * 1.4;
				this.eng.footstepArmed = true;
			}
			this.eng.recoilKick = Math.max(0, this.eng.recoilKick - e * 16);
			const l = e * 60;
			const u = this.eng.player.x + this.eng.moveVX * l;
			const d = this.eng.player.y + this.eng.moveVY * l;
			const rad = this.eng.player.radius;
			const clampX = (x: any) => Math.max(rad, Math.min(this.eng.currentLocation.mapWidth - rad, x));
			const clampY = (y: any) => Math.max(rad, Math.min(this.eng.currentLocation.mapHeight - rad, y));
			if (!(this.eng as any).checkObstacleCollision(u, this.eng.player.y, rad)) this.eng.player.x = clampX(u); // CONTEXT-GAP: checkObstacleCollision
			else {
				const step = Math.max(3.2, Math.abs(this.eng.moveVY) * l + 3);
				for (const sy of [this.eng.player.y - step, this.eng.player.y + step, this.eng.player.y - step * 2, this.eng.player.y + step * 2]) {
					if (!(this.eng as any).checkObstacleCollision(this.eng.player.x, sy, rad * .92) && !(this.eng as any).checkObstacleCollision(u, sy, rad * .92)) { // CONTEXT-GAP: checkObstacleCollision
						this.eng.player.y = clampY(sy);
						if (!(this.eng as any).checkObstacleCollision(u, this.eng.player.y, rad)) this.eng.player.x = clampX(u); // CONTEXT-GAP: checkObstacleCollision
						break;
					}
				}
			}
			if (!(this.eng as any).checkObstacleCollision(this.eng.player.x, d, rad)) this.eng.player.y = clampY(d); // CONTEXT-GAP: checkObstacleCollision
			else {
				const step = Math.max(3.2, Math.abs(this.eng.moveVX) * l + 3);
				for (const sx of [this.eng.player.x - step, this.eng.player.x + step, this.eng.player.x - step * 2, this.eng.player.x + step * 2]) {
					if (!(this.eng as any).checkObstacleCollision(sx, this.eng.player.y, rad * .92) && !(this.eng as any).checkObstacleCollision(sx, d, rad * .92)) { // CONTEXT-GAP: checkObstacleCollision
						this.eng.player.x = clampX(sx);
						if (!(this.eng as any).checkObstacleCollision(this.eng.player.x, d, rad)) this.eng.player.y = clampY(d); // CONTEXT-GAP: checkObstacleCollision
						break;
					}
				}
			}
			if (this.eng.player.isSprinting && r > 0 && this.eng.simTime - this.eng.lastSprintNoise > .48) {
				this.eng.lastSprintNoise = this.eng.simTime;
				(this.eng as any).alertZombies(this.eng.player.x, this.eng.player.y, 160); // CONTEXT-GAP: alertZombies
			}
		}

		emitFootstep() {
			if (!this.eng.player.isSneaking) (this.eng as any).alertZombies(this.eng.player.x, this.eng.player.y, this.eng.player.isSprinting ? 150 : 78, true); // CONTEXT-GAP: alertZombies
			const dirX = this.eng.lastMoveSpeed > .2 ? this.eng.moveVX / this.eng.lastMoveSpeed : 0;
			const dirY = this.eng.lastMoveSpeed > .2 ? this.eng.moveVY / this.eng.lastMoveSpeed : 0;
			for (let i = 0; i < 3; i++) this.eng.particles.push(Object.assign((this.eng as any).allocParticle(), { // CONTEXT-GAP: allocParticle
				x: this.eng.player.x - dirX * 6 + (Math.random() - .5) * 8,
				y: this.eng.player.y + 10 - dirY * 4 + (Math.random() - .5) * 4,
				vx: -dirX * .4 + (Math.random() - .5) * .6,
				vy: -.4 - Math.random() * .5,
				size: 1.6 + Math.random() * 2.2,
				color: "rgba(90, 74, 52, 0.55)",
				alpha: .7,
				life: .28 + Math.random() * .16,
				maxLife: .4,
				type: "dust"
			}));
		}

		tryDodge() {
			if (this.eng.dodgeCd > 0 || this.eng.dodgeTimer > 0 || this.eng.player.stamina < 20) return false;
			let ix = 0, iy = 0;
			(this.eng.keys.KeyW || this.eng.keys.ArrowUp) && --iy;
			(this.eng.keys.KeyS || this.eng.keys.ArrowDown) && (iy += 1);
			(this.eng.keys.KeyA || this.eng.keys.ArrowLeft) && --ix;
			(this.eng.keys.KeyD || this.eng.keys.ArrowRight) && (ix += 1);
			let dx, dy;
			if (Math.hypot(ix, iy) > .2) {
				dx = ix;
				dy = iy;
			} else if (Math.hypot(this.eng.moveVX, this.eng.moveVY) > .35) {
				dx = this.eng.moveVX;
				dy = this.eng.moveVY;
			} else {
				dx = Math.cos(this.eng.player.angle);
				dy = Math.sin(this.eng.player.angle);
			}
			const m = Math.hypot(dx, dy) || 1;
			this.eng.dodgeDirX = dx / m;
			this.eng.dodgeDirY = dy / m;
			this.eng.dodgeTimer = .22;
			this.eng.dodgeCd = .58;
			this.eng.invuln = Math.max(this.eng.invuln, .24);
			this.eng.player.stamina = Math.max(0, this.eng.player.stamina - 22);
			(this.eng as any).alertZombies(this.eng.player.x, this.eng.player.y, 150); // CONTEXT-GAP: alertZombies
			this.eng.screenShake = Math.max(this.eng.screenShake, 3.2);
			this.eng.bodyFacing = this.eng.dodgeDirX >= 0 ? 1 : -1;
			soundEngine.playDodge();
			(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 28, "ROLL", "#d4a017"); // CONTEXT-GAP: spawnFloater
			return true;
		}

		tryBash() {
			if (this.eng.bashCd > 0 || this.eng.dodgeTimer > 0) return false;
			this.eng.bashCd = .7;
			this.eng.bashSwing = .2;
			this.eng.player.atkT = .05; // Batch 8 (Lane B): bash squash-and-stretch pulse.
			this.eng.recoilKick = Math.max(this.eng.recoilKick, 8);
			this.eng.screenShake = Math.max(this.eng.screenShake, 4);
			this.eng.hitstop = Math.max(this.eng.hitstop, (.045) * this.tune('hitstop'));
			(this.eng as any).alertZombies(this.eng.player.x, this.eng.player.y, 110); // CONTEXT-GAP: alertZombies
			soundEngine.playBash();
			const ax = Math.cos(this.eng.player.angle);
			const ay = Math.sin(this.eng.player.angle);
			let hits = 0;
			for (const z of this.eng.zombies) {
				const dx = z.x - this.eng.player.x;
				const dy = z.y - this.eng.player.y;
				const dist = Math.hypot(dx, dy) || 1;
				if (dist > 78 + z.radius) continue;
				if (dx * ax + dy * ay < 8) continue;
				if (Math.abs(dx * -ay + dy * ax) > 42) continue;
				const mass = z.type === "behemoth" ? 4.2 : z.type === "miner_brute" ? 2.6 : z.type === "bloater_spitter" ? 1.8 : z.type === "crawler" ? 0.7 : 1;
				const impulse = 13 / mass;
				const nx = dx / dist, ny = dy / dist;
				z.vx += nx * impulse;
				z.vy += ny * impulse;
				// Batch 5: riot shields blunt bashes too.
				// Batch 12 (Lane 1): whetstone — bash is a global passive, × bash mul.
				const bdmg = (this.eng as any).applyAffixDefense(z, (z.type === "behemoth" ? 12 : 24) * (this.eng as any).playerDamageMul(z) * whetstoneBashMul((this.eng as any).boon(`whetstone`))); // CONTEXT-GAP: applyAffixDefense, playerDamageMul, boon
				z.health -= bdmg;
				// Batch 11 (Lane 1): thorned elites bite back when bashed.
				(this.eng as any).thornedReflect(z, bdmg); // CONTEXT-GAP: thornedReflect
				z.hitFlash = .25;
				z.stunUntil = this.eng.simTime + (z.type === "behemoth" ? .28 : .55);
				hits++;
				this.eng.stats.damageDealt += 24;
				(this.eng as any).createBloodParticles(z.x, z.y, this.eng.player.angle); // CONTEXT-GAP: createBloodParticles
				// Batch 5: hit-track for kill spray + slash streak + body reaction.
				z.lastHitPower = 24; z.lastHitAngle = this.eng.player.angle;
				(this.eng as any).addSlash(z.x, z.y, this.eng.player.angle); // CONTEXT-GAP: addSlash
				(this.eng as any).reactHit(z, 24, this.eng.player.angle); // CONTEXT-GAP: reactHit
				if (z.health <= 0) (this.eng as any).spawnFloater(z.x, z.y - 16, "BASH", "#e11d2e"); // CONTEXT-GAP: spawnFloater
			}
			if (hits === 0) {
				(this.eng as any).spawnFloater(this.eng.player.x + ax * 28, this.eng.player.y + ay * 28, "WHIFF", "#8a7a64"); // CONTEXT-GAP: spawnFloater
				// Batch 5: whiff — tiny 0.12x micro-slow + faint slash burst at the swing arc.
				this.eng.whiffSlowT = .12;
				this.eng.lastWhiff = { x: Math.round(this.eng.player.x + ax * 46), y: Math.round(this.eng.player.y + ay * 46), t: Date.now() };
				(this.eng as any).addSlash(this.eng.player.x + ax * 46, this.eng.player.y + ay * 46, this.eng.player.angle, true); // CONTEXT-GAP: addSlash
			}
			if (hits === 0 && this.eng.hitFeel) soundEngine.tone({ f: 700, f2: 180, type: `sine`, dur: .18, vol: .12 });
			return true;
		}

		damagePlayer(e: any, attacker: any) {
			if (this.eng.invuln > 0) return;
			this.eng.invuln = .62;
			// Batch 2: frosted affix — the dead leave ice in your veins.
			if (attacker && attacker.affix === `frosted`) { this.eng.chillUntil = Date.now() + 2000; (this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 40, `CHILLED`, `#7dd3fc`); } // CONTEXT-GAP: spawnFloater
			let t = e * (1 - (this.eng as any).getPerkLevel(`grit`) * .08); // CONTEXT-GAP: getPerkLevel
			// Batch 10 (Lane 4): Salt Circle — −8%/rank damage taken, but ONLY
			// while standing still (no movement input / velocity ~0) and holding
			// a linked tube-fed iron (affinity gate via saltCircleApplies).
			if (saltCircleApplies(this.eng.boonStacks, this.eng.weapons[this.eng.currentWeaponIndex]?.id ?? ``) && this.eng.lastMoveSpeed < .5) {
				t *= saltCircleDefenseMul((this.eng as any).boon(`saltcircle`)); // CONTEXT-GAP: boon
			}
			this.eng.player.health -= t, this.eng.stats.damageTaken += t, this.eng.screenShake = 5 * this.tune('shake') * this.motionScale(), this.eng.trauma = Math.min(1, this.eng.trauma + .22 * this.tune('shake') * this.motionScale()), soundEngine.playPlayerHurt();
			// VS-1: getting hurt breaks the Harvest Streak.
			if (this.eng.streak > 0) (this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 40, `STREAK LOST`, `#8a8f98`); // CONTEXT-GAP: spawnFloater
			this.eng.streak = 0; this.eng.streakTimer = 0;
			let sx = 0, sy = -1, best = 1e9;
			for (const z of this.eng.zombies) {
				const dx = this.eng.player.x - z.x, dy = this.eng.player.y - z.y, d = Math.hypot(dx, dy);
				if (d > 0 && d < best) {
					best = d;
					sx = dx / d;
					sy = dy / d;
				}
			}
			if (best < 120) {
				const px = this.eng.player.x + sx * 22, py = this.eng.player.y + sy * 22;
				if (!(this.eng as any).checkObstacleCollision(px, py, this.eng.player.radius)) { // CONTEXT-GAP: checkObstacleCollision
					this.eng.player.x = px;
					this.eng.player.y = py;
				}
				this.eng.moveVX += sx * 5;
				this.eng.moveVY += sy * 5;
				// VS-3: directional hurt feedback — angle from player toward the attacker.
				this.eng.hurtDir = Math.atan2(-sy, -sx);
				this.eng.hurtFlash = .8;
			}
			if (this.eng.player.health <= 0) {
				if (!this.eng.lastStandUsed) {
					this.eng.lastStandUsed = true;
					this.eng.player.health = Math.round(this.eng.player.maxHealth * .5);
					this.eng.invuln = 3.5;
					this.eng.worldSlow = 2.6;
					this.eng.hitstop = .16;
					this.eng.trauma = 1;
					this.eng.player.stamina = this.eng.player.maxStamina;
					for (const z of this.eng.zombies) {
						const dx = z.x - this.eng.player.x, dy = z.y - this.eng.player.y;
						const dist = Math.hypot(dx, dy) || 1;
						if (dist < 200) {
							const push = (200 - dist) / 200 * 70;
							z.x += dx / dist * push;
							z.y += dy / dist * push;
							z.stunUntil = this.eng.simTime + 1.5;
							z.ai = "wander";
						}
					}
					soundEngine.playWaveHorn();
					(this.eng as any).spawnFloater(this.eng.player.x, this.eng.player.y - 36, "LAST STAND", "#e11d2e"); // CONTEXT-GAP: spawnFloater
					this.eng.callbacks.onRadio?.("Unknown", "Get up. The county isn't done with you.");
					return;
				}
				this.eng.player.health = 0;
				this.runDeathStack(); // Batch 8 (Lane B): hitstop + flash + blood burst + slow-mo cinematic.
				this.handleGameOver();
			}
		}

		// Batch 8 (Lane B): player-death stack — hitstop beat, full-screen white
		// flash, 24-particle blood burst, and a short slow-motion cinematic window.
		// handleGameOver() still fires immediately; the loop keeps rendering the
		// cinematic without running the normal simulation.
		runDeathStack() {
			this.eng.hitstop = Math.max(this.eng.hitstop, .11 * this.tune('hitstop'));
			this.eng.deathFlash = .22;
			this.eng.deathCineT = .53;
			(this.eng as any).createBloodParticles(this.eng.player.x, this.eng.player.y, Math.random() * Math.PI * 2, 24); // CONTEXT-GAP: createBloodParticles
			this.eng._lastGameOver = { stats: { ...this.eng.stats }, score: this.eng.score, killer: this.eng.lastKiller };
		}

		// Batch 8 (Lane B): tick the post-death cinematic — hitstop beat first,
		// then 0.15x slow-motion particles while the flash fades.
		updateDeathCine(e: number) {
			if (this.eng.deathCineT <= 0) return;
			this.eng.deathCineT = Math.max(0, this.eng.deathCineT - e);
			if (this.eng.hitstop > 0) { this.eng.hitstop = Math.max(0, this.eng.hitstop - e); return; }
			(this.eng as any).updateParticles(e * .15); // CONTEXT-GAP: updateParticles
			this.eng.deathFlash = Math.max(0, this.eng.deathFlash - e);
		}

		handleGameOver() {
			this.eng.stats.maxStreak = this.eng.maxStreak;
			this.eng.isRunning = false, this.eng.stats.survivalTime = Math.floor((Date.now() - this.eng.gameStartTime) / 1e3), saveMeta(this.eng.meta), this.eng.callbacks.onGameOver(this.eng.stats, this.eng.score, this.eng.lastKiller);
			// Batch 4: Hall of Records — persist this run for the top-5 list.
			try { recordRun({ score: this.eng.score, kills: this.eng.stats.kills, time: this.eng.stats.survivalTime, level: this.eng.level, date: Date.now() }); } catch { /* meta full/unavailable */ }
		}

		// Batch 6 (Lane E contracts): field-tuning panel + accessibility.
		// TuningKey = "hitstop" | "shake" | "kick" | "zoom" | "knockback" | "particles" | "flash".
		tune(k: any) { return this.eng.tuning?.[k] ?? 1; }

		motionScale() { return this.eng.a11y?.reduceMotion ? .2 : 1; }

		flashScale() { const t = this.tune(`flash`); return this.eng.a11y?.reducedFlashing ? Math.min(t, .1) : t; }

		setTuning(key: any, value: any) { this.eng.tuning = Object.assign(this.eng.tuning || {}, { [key]: value }); }

		setA11y(opts: any) { this.eng.a11y = Object.assign(this.eng.a11y || {}, opts); }

		screenToWorld(sx: any, sy: any) {
			const { z } = (this.eng as any).viewSize(); // CONTEXT-GAP: viewSize
			return {
				x: this.eng.camX + (sx - this.eng.canvas.width / 2) / z,
				y: this.eng.camY + (sy - this.eng.canvas.height / 2) / z
			};
		}
}
