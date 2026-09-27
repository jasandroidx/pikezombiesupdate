import { FirePuddle } from '../types/game';

interface LightSource {
  x: number;
  y: number;
  radius: number;
  intensity: number;
  color?: string;
}

// ---- Batch 6: per-map / per-event ambient lighting ----
// Each map defines its own ambient level and a subtle color cast; events
// override both. tint is a full-screen overlay drawn after the darkness pass.
export interface AmbientSpec { level: number; tint: string | null; }

export const MAP_AMBIENT: Record<string, AmbientSpec> = {
  white_oak_springs: { level: 0.22, tint: 'rgba(30, 46, 30, 0.10)' },
  mccords_ford: { level: 0.14, tint: 'rgba(24, 32, 36, 0.12)' },
  stendal_backbone: { level: 0.12, tint: 'rgba(20, 32, 24, 0.12)' },
  petersburg_square: { level: 0.20, tint: 'rgba(44, 36, 24, 0.08)' },
  winslow_still: { level: 0.18, tint: 'rgba(36, 30, 22, 0.10)' },
  honey_springs: { level: 0.20, tint: 'rgba(44, 40, 22, 0.09)' },
};

export const EVENT_AMBIENT: Record<string, AmbientSpec> = {
  blood_moon: { level: 0.10, tint: 'rgba(148, 20, 26, 0.18)' },
  golden_swarm: { level: 0.28, tint: 'rgba(168, 124, 32, 0.10)' },
};

const DEFAULT_AMBIENT: AmbientSpec = { level: 0.2, tint: null };

export class DynamicLighting {
  public darknessCanvas: HTMLCanvasElement;
  private darknessCtx: CanvasRenderingContext2D;
  private fogSprite: HTMLCanvasElement;
  private fogParticles: { x: number; y: number; vx: number; vy: number; radius: number; alpha: number }[] = [];
  // Batch 6: ambient override set via setAmbient(mapId, eventId?). The engine
  // already passes the blood_moon flag as the 9th render arg, so the red tint
  // works even before the coordinator wires setAmbient on map switches.
  private ambientMap: AmbientSpec | null = null;
  private ambientEvent: AmbientSpec | null = null;

  /** Per-map / per-event ambient. eventId overrides the map (e.g. 'blood_moon'). */
  public setAmbient(mapId: string, eventId?: string) {
    this.ambientMap = MAP_AMBIENT[mapId] ?? DEFAULT_AMBIENT;
    this.ambientEvent = eventId ? EVENT_AMBIENT[eventId] ?? null : null;
  }

  public ambientState() {
    return { map: this.ambientMap, event: this.ambientEvent };
  }

  constructor() {
    this.darknessCanvas = document.createElement('canvas');
    this.darknessCtx = this.darknessCanvas.getContext('2d')!;

    this.fogSprite = document.createElement('canvas');
    this.fogSprite.width = 128;
    this.fogSprite.height = 128;
    const fog = this.fogSprite.getContext('2d')!;
    const blob = fog.createRadialGradient(64, 64, 0, 64, 64, 64);
    blob.addColorStop(0, 'rgba(186, 190, 160, 0.55)');
    blob.addColorStop(0.5, 'rgba(120, 132, 108, 0.22)');
    blob.addColorStop(1, 'rgba(90, 100, 80, 0)');
    fog.fillStyle = blob;
    fog.fillRect(0, 0, 128, 128);

    for (let i = 0; i < 14; i++) {
      this.fogParticles.push({
        x: Math.random() * 1600,
        y: Math.random() * 900,
        vx: 0.18 + Math.random() * 0.28,
        vy: 0.04 + Math.random() * 0.1,
        radius: 90 + Math.random() * 110,
        alpha: 0.22 + Math.random() * 0.18,
      });
    }
  }

  public renderLighting(
    targetCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: { x: number; y: number; angle: number; flashlightAngle: number; flashlightRange: number },
    muzzleFlashTimer: number,
    ambientLight: number,
    firePuddles: FirePuddle[],
    staticLights: LightSource[],
    bloodMoon: boolean = false,
  ) {
    if (this.darknessCanvas.width !== width || this.darknessCanvas.height !== height) {
      this.darknessCanvas.width = width;
      this.darknessCanvas.height = height;
    }

    // Batch 6: event overrides map, map overrides the passed-in level.
    const evSpec = this.ambientEvent ?? (bloodMoon ? EVENT_AMBIENT['blood_moon'] : null);
    const level = evSpec?.level ?? this.ambientMap?.level ?? ambientLight;
    const tint = evSpec?.tint ?? this.ambientMap?.tint ?? null;

    const dCtx = this.darknessCtx;
    dCtx.clearRect(0, 0, width, height);

    // Fill with dirty-olive darkness — never a black sheet
    const darknessAlpha = Math.max(0.04, 0.12 - level * 0.25 - (muzzleFlashTimer > 0 ? 0.04 : 0));
    dCtx.fillStyle = `rgba(16, 20, 14, ${darknessAlpha})`;
    dCtx.fillRect(0, 0, width, height);

    // Carve out light using 'destination-out'
    dCtx.globalCompositeOperation = 'destination-out';

    // 1. Belt lantern — always-on disc so the hunter never vanishes
    const auraGrad = dCtx.createRadialGradient(player.x, player.y, 10, player.x, player.y, 210);
    auraGrad.addColorStop(0, "rgba(0, 0, 0, 1.0)");
    auraGrad.addColorStop(0.45, "rgba(0, 0, 0, 0.82)");
    auraGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    dCtx.fillStyle = auraGrad;
    dCtx.beginPath();
    dCtx.arc(player.x, player.y, 210, 0, Math.PI * 2);
    dCtx.fill();

    // 2. High-Beam Flashlight Cone (subtle flicker for texture)
    const nowMs = Date.now();
    const fRange = player.flashlightRange;
    const fAngle = player.flashlightAngle;
    const fSpread = 0.55; // cone angle span in radians

    dCtx.save();
    dCtx.translate(player.x, player.y);
    dCtx.rotate(fAngle);

    const coneGrad = dCtx.createRadialGradient(0, 0, 20, 0, 0, fRange);
    const coneFlick = 1 + Math.sin(nowMs * 0.021) * 0.035 + Math.sin(nowMs * 0.0073) * 0.02;
    coneGrad.addColorStop(0, `rgba(0, 0, 0, ${Math.min(1, coneFlick).toFixed(3)})`);
    coneGrad.addColorStop(0.65, `rgba(0, 0, 0, ${(0.85 * coneFlick).toFixed(3)})`);
    coneGrad.addColorStop(0.9, `rgba(0, 0, 0, ${(0.45 * coneFlick).toFixed(3)})`);
    coneGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    dCtx.fillStyle = coneGrad;
    dCtx.beginPath();
    dCtx.moveTo(0, 0);
    dCtx.arc(0, 0, fRange, -fSpread, fSpread);
    dCtx.closePath();
    dCtx.fill();

    dCtx.restore();

    // 3. Muzzle Flash (illuminates surroundings on gunshot)
    if (muzzleFlashTimer > 0) {
      const flashGrad = dCtx.createRadialGradient(
        player.x + Math.cos(player.angle) * 30,
        player.y + Math.sin(player.angle) * 30,
        15,
        player.x,
        player.y,
        340
      );
      flashGrad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
      flashGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.5)');
      flashGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      dCtx.fillStyle = flashGrad;
      dCtx.beginPath();
      dCtx.arc(player.x, player.y, 340, 0, Math.PI * 2);
      dCtx.fill();
    }

    // 4. Fire Puddles / Molotovs (flickering warm glow)
    const now = Date.now();
    for (const fire of firePuddles) {
      const flicker = 1.0 + Math.sin(now * 0.015 + fire.x) * 0.12;
      const fireRadius = fire.radius * 2.2 * flicker;
      const fireGrad = dCtx.createRadialGradient(fire.x, fire.y, 10, fire.x, fire.y, fireRadius);
      fireGrad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
      fireGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.6)');
      fireGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      dCtx.fillStyle = fireGrad;
      dCtx.beginPath();
      dCtx.arc(fire.x, fire.y, fireRadius, 0, Math.PI * 2);
      dCtx.fill();
    }

    // 5. Static environmental lights (cabin windows, lanterns)
    for (const light of staticLights) {
      if (light.x < -light.radius || light.y < -light.radius || light.x > width + light.radius || light.y > height + light.radius) continue;
      const lGrad = dCtx.createRadialGradient(light.x, light.y, 5, light.x, light.y, light.radius);
      lGrad.addColorStop(0, `rgba(0, 0, 0, ${light.intensity})`);
      lGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      dCtx.fillStyle = lGrad;
      dCtx.beginPath();
      dCtx.arc(light.x, light.y, light.radius, 0, Math.PI * 2);
      dCtx.fill();
    }

    dCtx.globalCompositeOperation = 'source-over';
    targetCtx.drawImage(this.darknessCanvas, 0, 0);

    // Batch 6: per-map / per-event color cast on top of the darkness pass.
    if (tint) {
      targetCtx.save();
      targetCtx.fillStyle = tint;
      targetCtx.fillRect(0, 0, width, height);
      targetCtx.restore();
    }

    targetCtx.save();
    targetCtx.globalCompositeOperation = 'lighter';
    targetCtx.translate(player.x, player.y);
    const belt = targetCtx.createRadialGradient(0, 0, 8, 0, 0, 96);
    belt.addColorStop(0, 'rgba(255, 214, 150, 0.16)');
    belt.addColorStop(1, 'rgba(255, 214, 150, 0)');
    targetCtx.fillStyle = belt;
    targetCtx.beginPath();
    targetCtx.arc(0, 0, 96, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.rotate(player.flashlightAngle);
    const warm = targetCtx.createRadialGradient(0, 0, 16, 0, 0, player.flashlightRange);
    warm.addColorStop(0, 'rgba(255, 220, 150, 0.28)');
    warm.addColorStop(0.4, 'rgba(212, 160, 23, 0.1)');
    warm.addColorStop(1, 'rgba(212, 160, 23, 0)');
    targetCtx.fillStyle = warm;
    targetCtx.beginPath();
    targetCtx.moveTo(0, 0);
    targetCtx.arc(0, 0, player.flashlightRange, -0.55, 0.55);
    targetCtx.closePath();
    targetCtx.fill();
    targetCtx.restore();

    this.renderFog(targetCtx, width, height);
  }

  /**
   * Batch 7: darkness-mode overlay. When dark, everything outside
   * player.lightRadius is swallowed by a radial gradient; wider lightRadius
   * widens the safe circle. The edge flickers subtly. px,py are screen-space.
   * Engine-wire: call after renderLighting with (this.player.lightRadius, this.dark).
   * No-op (returns false) when dark is falsy.
   */
  public renderDarkness(
    targetCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    px: number,
    py: number,
    lightRadius: number,
    dark: boolean,
    nowMs = Date.now(),
  ): boolean {
    if (!dark) return false;
    const flicker = 1 + Math.sin(nowMs * 0.011) * 0.02 + Math.sin(nowMs * 0.0043) * 0.012;
    const r = Math.max(0.001, (lightRadius > 0 ? lightRadius : 220) * flicker);
    const g = targetCtx.createRadialGradient(
      px, py, Math.max(0.001, r * 0.5),
      px, py, Math.max(0.001, r * 1.25),
    );
    g.addColorStop(0, 'rgba(4, 6, 4, 0)');
    g.addColorStop(0.55, 'rgba(4, 6, 4, 0.45)');
    g.addColorStop(1, 'rgba(3, 5, 3, 0.94)');
    targetCtx.save();
    targetCtx.fillStyle = g;
    targetCtx.fillRect(0, 0, width, height);
    targetCtx.restore();
    return true;
  }

  private renderFog(ctx: CanvasRenderingContext2D, width: number, height: number) {    for (const p of this.fogParticles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x > width + p.radius) p.x = -p.radius;
      if (p.y > height + p.radius) p.y = -p.radius;
      ctx.globalAlpha = p.alpha * 0.28;
      ctx.drawImage(this.fogSprite, p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
    }
    ctx.globalAlpha = 1;
  }
}

// Batch 6: test/render probe surface for the ambient API.
if (typeof window !== 'undefined') {
  (window as any).__pzLightingTest = { DynamicLighting, MAP_AMBIENT, EVENT_AMBIENT };
}
