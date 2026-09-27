import { GameLocation, BloodDecal, Drop, FirePuddle, MapObstacle, ExplosiveBarrel, LoreNote, Barricade } from '../types/game';

const plates = new Map<string, HTMLCanvasElement>();

function hashId(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintPlate(ctx: CanvasRenderingContext2D, location: GameLocation) {
  const w = location.mapWidth;
  const h = location.mapHeight;
  const rand = mulberry32(hashId(location.id));
  // Batch 6: tiled procedural ground — each map gets its own baked 256px tile,
  // pattern-filled once at bake time so the frame cost stays at one drawImage.
  const tile = tileFor(location.id, location.ground || '#1c1f19');
  const pattern = ctx.createPattern(tile, 'repeat');
  ctx.fillStyle = pattern || location.ground || '#1c1f19';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = location.trail || '#26211a';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.5, w * 0.26, h * 0.2, 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(28, 24, 16, 0.9)';
  ctx.lineWidth = 52;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const from = location.spawn ?? location.workbench;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(location.workbench.x, location.workbench.y);
  if (location.extract) ctx.lineTo(location.extract.x, location.extract.y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(232, 224, 212, 0.045)';
  ctx.lineWidth = 10;
  ctx.stroke();

  ctx.fillStyle = 'rgba(8, 7, 5, 0.5)';
  ctx.fillRect(0, 0, w, 40);
  ctx.fillRect(0, h - 40, w, 40);
  ctx.fillRect(0, 0, 40, h);
  ctx.fillRect(w - 40, 0, 40, h);

  for (let i = 0; i < 90; i++) {
    const x = rand() * w;
    const y = rand() * h;
    ctx.strokeStyle = rand() > 0.5 ? "rgba(28, 36, 22, 0.55)" : "rgba(90, 74, 48, 0.35)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 2 + rand() * 4, y - 5 - rand() * 6);
    ctx.stroke();
  }
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = "rgba(40, 36, 30, 0.55)";
    ctx.beginPath();
    ctx.ellipse(rand() * w, rand() * h, 3 + rand() * 5, 2 + rand() * 2, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const obs of location.obstacles) renderObstacle(ctx, obs);
}

// ---- Batch 6: tiled ground textures (procedural tile baker, zero image assets) ----
type GroundFeature = 'grass' | 'gravel' | 'forest' | 'plaza' | 'concrete' | 'meadow';
interface GroundTheme { feature: GroundFeature; speckles: string[]; }
const GROUND_THEMES: Record<string, GroundTheme> = {
  white_oak_springs: { feature: 'grass', speckles: ['rgba(84, 110, 60, 0.5)', 'rgba(60, 78, 44, 0.6)', 'rgba(112, 96, 64, 0.45)'] },
  mccords_ford: { feature: 'gravel', speckles: ['rgba(150, 142, 124, 0.5)', 'rgba(110, 104, 92, 0.6)', 'rgba(70, 74, 66, 0.55)'] },
  stendal_backbone: { feature: 'forest', speckles: ['rgba(96, 74, 46, 0.55)', 'rgba(52, 66, 40, 0.6)', 'rgba(30, 34, 26, 0.6)'] },
  petersburg_square: { feature: 'plaza', speckles: ['rgba(120, 104, 84, 0.4)', 'rgba(88, 76, 62, 0.5)'] },
  winslow_still: { feature: 'concrete', speckles: ['rgba(140, 134, 120, 0.35)', 'rgba(90, 84, 72, 0.5)'] },
  honey_springs: { feature: 'meadow', speckles: ['rgba(150, 130, 70, 0.5)', 'rgba(110, 100, 52, 0.55)', 'rgba(70, 84, 44, 0.5)'] },
};
const DEFAULT_THEME: GroundTheme = { feature: 'grass', speckles: ['rgba(84, 110, 60, 0.5)'] };

const tiles = new Map<string, HTMLCanvasElement>();
const TILE = 256;

/** Baked-once 256px ground tile for a map id. Same id+base returns the same canvas. */
export function tileFor(mapId: string, base: string): HTMLCanvasElement {
  const key = mapId + ':' + base;
  const cached = tiles.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  if (ctx) bakeTile(ctx, mapId, base);
  tiles.set(key, canvas);
  return canvas;
}

function bakeTile(ctx: CanvasRenderingContext2D, mapId: string, base: string) {
  const theme = GROUND_THEMES[mapId] ?? DEFAULT_THEME;
  const rand = mulberry32(hashId('tile:' + mapId));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TILE, TILE);
  const F = theme.feature;
  if (F === 'grass' || F === 'meadow') {
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = `rgba(74, 58, 36, ${(0.08 + rand() * 0.1).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(rand() * TILE, rand() * TILE, 6 + rand() * 20, 4 + rand() * 12, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (F === 'meadow') {
      // golden sun-cured patches — Honey Springs reads warm against the county
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = `rgba(150, 128, 60, ${(0.08 + rand() * 0.1).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(rand() * TILE, rand() * TILE, 10 + rand() * 26, 6 + rand() * 14, rand() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const blade = F === 'grass' ? 'rgba(96, 124, 66, 0.6)' : 'rgba(190, 164, 84, 0.65)';
    const blades = F === 'grass' ? 170 : 260;
    for (let i = 0; i < blades; i++) {
      const x = rand() * TILE;
      const y = rand() * TILE;
      ctx.strokeStyle = rand() > 0.5 ? blade : 'rgba(60, 78, 44, 0.55)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 5, y - 3 - rand() * 6);
      ctx.stroke();
    }
  } else if (F === 'gravel') {
    for (let i = 0; i < 260; i++) {
      const g = 100 + rand() * 70;
      ctx.fillStyle = `rgba(${g | 0}, ${(g * 0.95) | 0}, ${(g * 0.82) | 0}, ${(0.35 + rand() * 0.3).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(rand() * TILE, rand() * TILE, 0.8 + rand() * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = `rgba(28, 32, 30, ${(0.12 + rand() * 0.1).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(rand() * TILE, rand() * TILE, 20 + rand() * 30, 5 + rand() * 8, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (F === 'forest') {
    for (let i = 0; i < 130; i++) {
      const x = rand() * TILE;
      const y = rand() * TILE;
      const a = rand() * Math.PI;
      ctx.strokeStyle = rand() > 0.4 ? 'rgba(110, 84, 52, 0.5)' : 'rgba(70, 54, 34, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * (5 + rand() * 8), y + Math.sin(a) * (5 + rand() * 8));
      ctx.stroke();
    }
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(16, 18, 14, ${(0.15 + rand() * 0.15).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(rand() * TILE, rand() * TILE, 8 + rand() * 22, 6 + rand() * 14, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (F === 'plaza') {
    const cell = 64;
    for (let gy = 0; gy < TILE; gy += cell) {
      for (let gx = 0; gx < TILE; gx += cell) {
        const v = (rand() - 0.5) * 14;
        ctx.fillStyle = `rgba(${(120 + v) | 0}, ${(104 + v) | 0}, ${(84 + v) | 0}, 0.16)`;
        ctx.fillRect(gx + 1, gy + 1, cell - 2, cell - 2);
      }
    }
    ctx.strokeStyle = 'rgba(20, 16, 12, 0.55)';
    ctx.lineWidth = 2;
    for (let p = 0; p <= TILE; p += cell) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, TILE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(TILE, p); ctx.stroke();
    }
  } else if (F === 'concrete') {
    ctx.strokeStyle = 'rgba(24, 22, 18, 0.6)';
    ctx.lineWidth = 2;
    for (let p = 0; p <= TILE; p += 128) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, TILE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(TILE, p); ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const x = rand() * TILE;
      const y = rand() * TILE;
      const r = 8 + rand() * 22;
      const squash = 0.55 + rand() * 0.4;
      ctx.fillStyle = `rgba(6, 6, 7, ${(0.4 + rand() * 0.25).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * squash, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120, 110, 90, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.08, r * squash * 1.08, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = theme.speckles[(rand() * theme.speckles.length) | 0];
    ctx.fillRect(rand() * TILE, rand() * TILE, 1.4, 1.4);
  }
}

// ---- Batch 6: parallax ground layers (baked once, scroll slower than the ground) ----
interface ParallaxLayers { far: HTMLCanvasElement; near: HTMLCanvasElement; }
const parallaxCache = new Map<string, ParallaxLayers>();

/** Two baked translucent layers per map: far treeline band + near haze/canopy. */
export function parallaxFor(mapId: string): ParallaxLayers {
  const cached = parallaxCache.get(mapId);
  if (cached) return cached;
  const rand = mulberry32(hashId('px:' + mapId));
  const far = document.createElement('canvas');
  far.width = 512;
  far.height = 144;
  const fctx = far.getContext('2d');
  if (fctx) {
    const g = fctx.createLinearGradient(0, 0, 0, 144);
    g.addColorStop(0, 'rgba(70, 84, 66, 0)');
    g.addColorStop(1, 'rgba(70, 84, 66, 0.10)');
    fctx.fillStyle = g;
    fctx.fillRect(0, 0, 512, 144);
    for (let i = 0; i < 16; i++) {
      const x = rand() * 512;
      const w = 30 + rand() * 70;
      const h = 40 + rand() * 70;
      fctx.fillStyle = `rgba(6, 10, 7, ${(0.5 + rand() * 0.3).toFixed(3)})`;
      fctx.beginPath();
      fctx.ellipse(x, 144, w, h, 0, Math.PI, 0);
      fctx.fill();
    }
  }
  const near = document.createElement('canvas');
  near.width = 512;
  near.height = 256;
  const nctx = near.getContext('2d');
  if (nctx) {
    for (let i = 0; i < 10; i++) {
      nctx.fillStyle = `rgba(150, 160, 140, ${(0.03 + rand() * 0.04).toFixed(3)})`;
      nctx.beginPath();
      nctx.ellipse(rand() * 512, rand() * 256, 60 + rand() * 90, 10 + rand() * 18, (rand() - 0.5) * 0.6, 0, Math.PI * 2);
      nctx.fill();
    }
    for (let i = 0; i < 9; i++) {
      nctx.fillStyle = `rgba(4, 6, 4, ${(0.08 + rand() * 0.08).toFixed(3)})`;
      nctx.beginPath();
      nctx.ellipse(rand() * 512, rand() * 256, 40 + rand() * 60, 26 + rand() * 34, rand() * 3, 0, Math.PI * 2);
      nctx.fill();
    }
  }
  const layers = { far, near };
  parallaxCache.set(mapId, layers);
  return layers;
}

interface Viewport { x: number; y: number; width: number; height: number; }

function drawParallaxTile(
  ctx: CanvasRenderingContext2D,
  tile: HTMLCanvasElement,
  v: Viewport,
  f: number,
  fy: number,
  fullHeight: boolean,
) {
  const tileW = tile.width;
  const tileH = tile.height;
  ctx.save();
  // Offset the layer by v*(1-f) so its screen position advances at fraction f of the camera.
  ctx.translate(v.x * (1 - f), v.y * (1 - fy));
  const sx = Math.floor((v.x * f) / tileW) * tileW;
  const sy = Math.floor((v.y * fy) / tileH) * tileH;
  const endX = v.x * f + v.width + tileW;
  const endY = fullHeight ? v.y * fy + v.height + tileH : sy + tileH;
  for (let x = sx; x < endX; x += tileW) {
    for (let y = sy; y < endY; y += tileH) {
      ctx.drawImage(tile, x, y);
    }
  }
  ctx.restore();
}

/** Drawn inside renderEnvironment after the ground plate: far band at 0.86, near haze at 0.94. */
export function renderParallax(ctx: CanvasRenderingContext2D, location: GameLocation, viewport: Viewport) {
  const layers = parallaxFor(location.id);
  ctx.save();
  ctx.globalAlpha = 0.55;
  drawParallaxTile(ctx, layers.far, viewport, 0.86, 0.45, false);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.42;
  drawParallaxTile(ctx, layers.near, viewport, 0.94, 0.55, true);
  ctx.restore();
}

// ---- Batch 6: blob shadows (one baked sprite, cheap grounding) ----
let blobSprite: HTMLCanvasElement | null = null;
function shadowSprite(): HTMLCanvasElement {
  if (blobSprite) return blobSprite;
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(48, 48, 4, 48, 48, 48);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.45)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 96, 96);
  }
  blobSprite = c;
  return c;
}

/** Soft dark ellipse under a body/pickup. Engine wire-in point: renderZombies/renderPlayer. */
export function drawBlobShadow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha = 0.4) {
  if (radius <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(shadowSprite(), x - radius, y - radius * 0.55, radius * 2, radius * 1.1);
  ctx.restore();
}

// ---- Batch 6: per-instance damage flash + hue jitter ----
export const HIT_FLASH_MS = 80;
const hitFlashAt = new Map<number, number>();

/** Engine damage path should call this when a zombie takes a hit. */
export function registerZombieHit(instanceId: number, now = Date.now()) {
  hitFlashAt.set(instanceId, now);
}

/** 0..1 white-flash envelope: 1 at hit, 0 after HIT_FLASH_MS. */
export function zombieFlashIntensity(instanceId: number, now = Date.now()): number {
  const t = hitFlashAt.get(instanceId);
  if (t === undefined) return 0;
  const el = now - t;
  if (el < 0 || el >= HIT_FLASH_MS) {
    if (el >= HIT_FLASH_MS) hitFlashAt.delete(instanceId);
    return 0;
  }
  return 1 - el / HIT_FLASH_MS;
}

/** Slight deterministic per-instance variation so horde members don't look cloned. */
export function hueJitterFor(seed: number): { hue: number; sat: number } {
  const h = hashId('zj:' + seed);
  return { hue: (h % 29) - 14, sat: 0.94 + ((h >>> 9) % 15) / 100 };
}

/** Apply before drawing a zombie body, clearZombieTint after. */
export function applyZombieTint(ctx: CanvasRenderingContext2D, seed: number) {
  const j = hueJitterFor(seed);
  ctx.filter = `hue-rotate(${j.hue}deg) saturate(${j.sat.toFixed(2)})`;
}

export function clearZombieTint(ctx: CanvasRenderingContext2D) {
  ctx.filter = 'none';
}

/** White bloom over a just-hit body; intensity from zombieFlashIntensity. */
export function drawZombieHitFlash(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, intensity: number) {
  if (intensity <= 0 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255, 255, 255, ${(0.85 * intensity).toFixed(3)})`);
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function plateFor(location: GameLocation) {
  const cached = plates.get(location.id + ':3');
  if (cached && cached.width === location.mapWidth && cached.height === location.mapHeight) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = location.mapWidth;
  canvas.height = location.mapHeight;
  const g = canvas.getContext('2d');
  if (g) paintPlate(g, location);
  plates.set(location.id + ':3', canvas);
  return canvas;
}

function sees(viewport: { x: number; y: number; width: number; height: number }, x: number, y: number, pad: number) {
  return x + pad >= viewport.x && x - pad <= viewport.x + viewport.width && y + pad >= viewport.y && y - pad <= viewport.y + viewport.height;
}

export function renderEnvironment(
  ctx: CanvasRenderingContext2D,
  location: GameLocation,
  viewport: { x: number; y: number; width: number; height: number },
  bloodDecals: BloodDecal[],
  firePuddles: FirePuddle[],
  drops: Drop[],
  barrels: ExplosiveBarrel[] = [],
  loreNotes: LoreNote[] = [],
  barricades: Barricade[] = [],
  extractActive = false,
  zoom = 1,
) {
  attachRender7Probes();
  ctx.fillStyle = location.ground || '#1c1f19';
  ctx.fillRect(viewport.x, viewport.y, viewport.width, viewport.height);

  const plate = plateFor(location);
  let sx = viewport.x;
  let sy = viewport.y;
  let sw = viewport.width;
  let sh = viewport.height;
  if (sx < 0) { sw += sx; sx = 0; }
  if (sy < 0) { sh += sy; sy = 0; }
  if (sx + sw > plate.width) sw = plate.width - sx;
  if (sy + sh > plate.height) sh = plate.height - sy;
  if (sw > 1 && sh > 1) ctx.drawImage(plate, sx, sy, sw, sh, sx, sy, sw, sh);

  // Batch 6: parallax ground layers — scroll slower than the ground for depth.
  renderParallax(ctx, location, { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height });

  for (const decal of bloodDecals) {
    if (!sees(viewport, decal.x, decal.y, decal.radius)) continue;

    ctx.save();
    ctx.translate(decal.x, decal.y);
    ctx.rotate(decal.rotation);
    ctx.fillStyle = `rgba(139, 0, 0, ${decal.alpha})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, decal.radius, decal.radius * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(90, 0, 0, ${decal.alpha * 0.8})`;
    const dist = decal.radius * 0.9;
    ctx.beginPath();
    ctx.arc(Math.cos(decal.rotation) * dist, Math.sin(decal.rotation) * dist, decal.radius * 0.2, 0, Math.PI * 2);
    ctx.arc(Math.cos(decal.rotation + 2.2) * dist, Math.sin(decal.rotation + 2.2) * dist, decal.radius * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const now = Date.now();
  for (const puddle of firePuddles) {
    if (!sees(viewport, puddle.x, puddle.y, puddle.radius)) continue;
    const elapsed = now - puddle.createdTime;
    const progress = elapsed / puddle.duration;
    if (progress >= 1) continue;

    const flicker = 0.85 + Math.sin(now * 0.02 + puddle.x) * 0.15;
    const currentRadius = puddle.radius * flicker;

    ctx.fillStyle = 'rgba(20, 10, 5, 0.7)';
    ctx.beginPath();
    ctx.arc(puddle.x, puddle.y, currentRadius * 1.1, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createRadialGradient(puddle.x, puddle.y, 0, puddle.x, puddle.y, currentRadius);
    grad.addColorStop(0, 'rgba(255, 230, 120, 0.9)');
    grad.addColorStop(0.3, 'rgba(255, 120, 20, 0.7)');
    grad.addColorStop(0.7, 'rgba(220, 50, 10, 0.4)');
    grad.addColorStop(1, 'rgba(180, 20, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(puddle.x, puddle.y, currentRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const bar of barricades) {
    if (!sees(viewport, bar.x + bar.width / 2, bar.y + bar.height / 2, Math.max(bar.width, bar.height))) continue;
    renderBarricade(ctx, bar);
  }

  if (extractActive) {
    renderExtract(ctx, location.extract);
  }

  for (const barrel of barrels) {
    if (!sees(viewport, barrel.x, barrel.y, barrel.radius + 12)) continue;
    renderExplosiveBarrel(ctx, barrel, now);
  }

  const pickup = Math.max(1, 1.15 / Math.max(0.2, zoom));

  for (const drop of drops) {
    // Batch 7: 96px-margin culling for pickups (counted; ground decals exempt).
    if (!visibleInViewport(drop.x, drop.y, 20, viewport, 96)) { culledEntities++; continue; }
    // Batch 6: blob shadow stays on the ground while the pickup bobs.
    drawBlobShadow(ctx, drop.x, drop.y + 5, 11 * pickup, 0.38);
    ctx.save();
    ctx.translate(drop.x, drop.y);
    ctx.scale(pickup, pickup);
    ctx.translate(-drop.x, -drop.y);
    renderDrop(ctx, drop, now);
    ctx.restore();
  }

  for (const note of loreNotes) {
    if (note.collected) continue;
    if (!visibleInViewport(note.x, note.y, 24, viewport, 96)) { culledEntities++; continue; }
    ctx.save();
    ctx.translate(note.x, note.y);
    ctx.scale(pickup, pickup);
    ctx.translate(-note.x, -note.y);
    renderLoreNote(ctx, note, now);
    ctx.restore();
  }
}

function renderLoreNote(ctx: CanvasRenderingContext2D, note: LoreNote, now: number) {
  ctx.save();
  ctx.translate(note.x, note.y);

  // Mysterious yellowish-amber paper glow
  const pulse = Math.sin(now * 0.003) * 0.2 + 0.8;
  ctx.fillStyle = `rgba(253, 230, 138, ${0.2 * pulse})`;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();

  // Subtle floating elevation animation
  const bob = Math.sin(now * 0.004) * 3;
  ctx.translate(0, bob);

  // Aged parchment paper drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(-8, -10 + 4, 16, 20);

  // Parchment base
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(-8, -10, 16, 20);

  // Folded corner
  ctx.fillStyle = '#d97706';
  ctx.beginPath();
  ctx.moveTo(3, -10);
  ctx.lineTo(8, -5);
  ctx.lineTo(3, -5);
  ctx.closePath();
  ctx.fill();

  // Ink scribbles / text lines
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 1.2;
  for (let y = -5; y <= 6; y += 3) {
    ctx.beginPath();
    ctx.moveTo(-5, y);
    ctx.lineTo(5, y);
    ctx.stroke();
  }

  // Interact prompt badge
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.roundRect(-16, -26, 32, 14, 3);
  ctx.fill();
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#fef08a';
  ctx.font = 'bold 9px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('[E] NOTE', 0, -16);

  ctx.restore();
}

function renderExplosiveBarrel(ctx: CanvasRenderingContext2D, barrel: ExplosiveBarrel, now: number) {
  ctx.save();
  ctx.translate(barrel.x, barrel.y);

  // Damaged warning pulsation
  const isDamaged = barrel.health < barrel.maxHealth;
  if (isDamaged) {
    const pulse = Math.sin(now * 0.02) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(239, 68, 68, ${0.25 * pulse})`;
    ctx.beginPath();
    ctx.arc(0, 0, barrel.radius + 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Barrel shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(0, barrel.radius * 0.4, barrel.radius * 1.05, barrel.radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Steel red fuel drum body
  ctx.fillStyle = isDamaged ? '#b91c1c' : '#dc2626';
  ctx.beginPath();
  ctx.arc(0, 0, barrel.radius, 0, Math.PI * 2);
  ctx.fill();

  // Steel rim borders
  ctx.strokeStyle = '#7f1d1d';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Inner ring
  ctx.strokeStyle = '#450a0a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, barrel.radius * 0.65, 0, Math.PI * 2);
  ctx.stroke();

  // Hazard symbol (Yellow flame or biohazard triangle)
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.moveTo(0, -barrel.radius * 0.45);
  ctx.lineTo(barrel.radius * 0.4, barrel.radius * 0.28);
  ctx.lineTo(-barrel.radius * 0.4, barrel.radius * 0.28);
  ctx.closePath();
  ctx.fill();

  // Flame inner icon
  ctx.fillStyle = '#b91c1c';
  ctx.beginPath();
  ctx.arc(0, 1, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Health bar if hit
  if (isDamaged) {
    const barW = barrel.radius * 2;
    const barH = 3;
    const pct = Math.max(0, barrel.health / barrel.maxHealth);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(-barW / 2, -barrel.radius - 8, barW, barH);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-barW / 2, -barrel.radius - 8, barW * pct, barH);
  }

  ctx.restore();
}

function renderObstacle(ctx: CanvasRenderingContext2D, obs: MapObstacle) {
  ctx.save();

  switch (obs.type) {
    case 'cabin': {
      // Wood cabin foundation and roof
      ctx.fillStyle = '#22150c';
      ctx.fillRect(obs.x - 4, obs.y - 4, obs.width + 8, obs.height + 8);

      // Wooden planks
      ctx.fillStyle = obs.color || '#3d2817';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

      // Cabin roof slats
      ctx.strokeStyle = '#1e140d';
      ctx.lineWidth = 2;
      for (let y = obs.y + 16; y < obs.y + obs.height; y += 18) {
        ctx.beginPath();
        ctx.moveTo(obs.x, y);
        ctx.lineTo(obs.x + obs.width, y);
        ctx.stroke();
      }

      // Porch / steps
      ctx.fillStyle = '#4a3321';
      ctx.fillRect(obs.x + obs.width * 0.35, obs.y + obs.height - 12, obs.width * 0.3, 14);

      // Window glowing warm light
      ctx.fillStyle = 'rgba(255, 190, 80, 0.85)';
      ctx.fillRect(obs.x + 25, obs.y + 20, 24, 20);
      ctx.fillRect(obs.x + obs.width - 49, obs.y + 20, 24, 20);

      // Window frames
      ctx.strokeStyle = '#22150c';
      ctx.lineWidth = 2;
      ctx.strokeRect(obs.x + 25, obs.y + 20, 24, 20);
      ctx.strokeRect(obs.x + obs.width - 49, obs.y + 20, 24, 20);

      // Label
      ctx.fillStyle = '#a68a68';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.fillText(obs.label || 'CABIN', obs.x + 12, obs.y - 8);
      break;
    }

    case 'pickup_truck': {
      // Rusted Appalachian pickup truck
      ctx.fillStyle = '#121212'; // shadow
      ctx.fillRect(obs.x - 3, obs.y - 3, obs.width + 6, obs.height + 6);

      // Body
      ctx.fillStyle = obs.color || '#682d24';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

      // Cab vs Bed
      ctx.fillStyle = '#181a1b';
      ctx.fillRect(obs.x + obs.width * 0.45, obs.y + 6, obs.width * 0.5, obs.height - 12); // bed

      // Windshield
      ctx.fillStyle = 'rgba(80, 110, 130, 0.7)';
      ctx.fillRect(obs.x + obs.width * 0.15, obs.y + 10, obs.width * 0.25, obs.height - 20);

      // Tires
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(obs.x + 10, obs.y - 6, 22, 7);
      ctx.fillRect(obs.x + obs.width - 32, obs.y - 6, 22, 7);
      ctx.fillRect(obs.x + 10, obs.y + obs.height - 1, 22, 7);
      ctx.fillRect(obs.x + obs.width - 32, obs.y + obs.height - 1, 22, 7);

      // Headlights
      ctx.fillStyle = 'rgba(255, 230, 150, 0.7)';
      ctx.fillRect(obs.x - 2, obs.y + 8, 4, 8);
      ctx.fillRect(obs.x - 2, obs.y + obs.height - 16, 4, 8);
      break;
    }

    case 'mine_entrance': {
      // Dark mine shaft entrance with heavy timber bracing
      ctx.fillStyle = '#090a0a';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

      // Wood bracing frame
      ctx.fillStyle = '#3a2717';
      ctx.fillRect(obs.x, obs.y, 25, obs.height);
      ctx.fillRect(obs.x + obs.width - 25, obs.y, 25, obs.height);
      ctx.fillRect(obs.x, obs.y, obs.width, 25);

      // Warning sign
      ctx.fillStyle = '#eab308';
      ctx.fillRect(obs.x + obs.width / 2 - 40, obs.y + 8, 80, 14);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(obs.label || 'MINE SHAFT', obs.x + obs.width / 2 - 34, obs.y + 19);

      // Coal tracks leading out
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(obs.x + obs.width * 0.35, obs.y + obs.height);
      ctx.lineTo(obs.x + obs.width * 0.35, obs.y + obs.height + 60);
      ctx.moveTo(obs.x + obs.width * 0.65, obs.y + obs.height);
      ctx.lineTo(obs.x + obs.width * 0.65, obs.y + obs.height + 60);
      ctx.stroke();
      break;
    }

    case 'tree': {
      // Appalachian Pine / Hemlock
      const radius = obs.width / 2;
      const cx = obs.x + radius;
      const cy = obs.y + radius;

      // Outer foliage shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.arc(cx + 4, cy + 6, radius + 2, 0, Math.PI * 2);
      ctx.fill();

      // Outer dark green pine
      ctx.fillStyle = '#142817';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Inner foliage layer
      ctx.fillStyle = '#1c3d22';
      ctx.beginPath();
      ctx.arc(cx - 2, cy - 2, radius * 0.72, 0, Math.PI * 2);
      ctx.fill();

      // Tree trunk center
      ctx.fillStyle = '#3c2718';
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'rock': {
      // Rugged mountain boulder
      ctx.fillStyle = '#2d3330';
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.width / 2, obs.y + obs.height / 2, obs.width / 2, obs.height / 2, 0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#47504c';
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.width / 2 - 3, obs.y + obs.height / 2 - 3, obs.width / 2.6, obs.height / 2.6, 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'crate': {
      ctx.fillStyle = obs.color || '#3e2a1b';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

      ctx.strokeStyle = '#1d120a';
      ctx.lineWidth = 2;
      ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
      ctx.beginPath();
      ctx.moveTo(obs.x, obs.y);
      ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
      ctx.moveTo(obs.x + obs.width, obs.y);
      ctx.lineTo(obs.x, obs.y + obs.height);
      ctx.stroke();
      break;
    }

    case 'courthouse': {
      ctx.fillStyle = '#1a1612';
      ctx.fillRect(obs.x - 6, obs.y - 6, obs.width + 12, obs.height + 12);
      ctx.fillStyle = obs.color || '#3d3428';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.fillStyle = '#2a231c';
      ctx.fillRect(obs.x + 20, obs.y + 16, obs.width - 40, obs.height - 36);
      // columns
      ctx.fillStyle = '#cfc3ae';
      const colW = 14;
      const gap = (obs.width - 48) / 4;
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(obs.x + 24 + i * gap, obs.y + 28, colW, obs.height - 56);
      }
      ctx.fillStyle = '#8a1f14';
      ctx.fillRect(obs.x + obs.width * 0.35, obs.y + obs.height - 28, obs.width * 0.3, 28);
      ctx.fillStyle = 'rgba(255, 190, 80, 0.75)';
      ctx.fillRect(obs.x + 36, obs.y + 40, 22, 18);
      ctx.fillRect(obs.x + obs.width - 58, obs.y + 40, 22, 18);
      ctx.fillStyle = '#d4a017';
      ctx.font = 'bold 11px "IBM Plex Mono", monospace';
      ctx.fillText(obs.label || 'COURTHOUSE', obs.x + 16, obs.y - 8);
      break;
    }

    case 'highwall': {
      ctx.fillStyle = '#1c1f1c';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.fillStyle = '#2c332c';
      for (let x = obs.x; x < obs.x + obs.width; x += 28) {
        ctx.fillRect(x, obs.y, 22, obs.height);
      }
      ctx.fillStyle = '#0d0f0d';
      ctx.fillRect(obs.x, obs.y + obs.height - 18, obs.width, 18);
      ctx.fillStyle = '#d4a017';
      ctx.font = 'bold 10px "IBM Plex Mono", monospace';
      ctx.fillText(obs.label || 'HIGHWALL', obs.x + 12, obs.y - 8);
      break;
    }

    case 'still': {
      ctx.fillStyle = '#1a120c';
      ctx.fillRect(obs.x - 4, obs.y - 4, obs.width + 8, obs.height + 8);
      ctx.fillStyle = '#3a2818';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      // copper pot
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.width * 0.35, obs.y + obs.height * 0.55, 36, 42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#92400e';
      ctx.fillRect(obs.x + obs.width * 0.35 + 20, obs.y + 18, 70, 10);
      ctx.fillStyle = 'rgba(255, 140, 40, 0.85)';
      ctx.beginPath();
      ctx.arc(obs.x + 28, obs.y + obs.height - 22, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d4a017';
      ctx.font = 'bold 10px "IBM Plex Mono", monospace';
      ctx.fillText(obs.label || 'STILL', obs.x + 8, obs.y - 8);
      break;
    }

    case 'barn': {
      ctx.fillStyle = '#2a120e';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.fillStyle = obs.color || '#7f1d1d';
      ctx.fillRect(obs.x + 4, obs.y + 8, obs.width - 8, obs.height - 12);
      ctx.fillStyle = '#1a0a08';
      ctx.beginPath();
      ctx.moveTo(obs.x, obs.y + 18);
      ctx.lineTo(obs.x + obs.width / 2, obs.y - 16);
      ctx.lineTo(obs.x + obs.width, obs.y + 18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3a1814';
      ctx.fillRect(obs.x + obs.width * 0.4, obs.y + obs.height - 36, obs.width * 0.2, 36);
      ctx.fillStyle = '#c23b22';
      ctx.font = 'bold 10px "IBM Plex Mono", monospace';
      ctx.fillText(obs.label || 'BARN', obs.x + 8, obs.y - 20);
      break;
    }

    case 'cruiser': {
      ctx.fillStyle = '#0b0d10';
      ctx.fillRect(obs.x - 3, obs.y - 3, obs.width + 6, obs.height + 6);
      ctx.fillStyle = obs.color || '#1e3a5f';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.fillStyle = 'rgba(80, 110, 140, 0.7)';
      ctx.fillRect(obs.x + obs.width * 0.12, obs.y + 10, obs.width * 0.28, obs.height - 20);
      ctx.fillStyle = '#111';
      ctx.fillRect(obs.x + obs.width * 0.5, obs.y + 8, obs.width * 0.42, obs.height - 16);
      ctx.fillStyle = '#c23b22';
      ctx.fillRect(obs.x + obs.width * 0.42, obs.y + 4, 16, 8);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(obs.x + obs.width * 0.42 + 16, obs.y + 4, 16, 8);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(obs.x + 10, obs.y - 6, 22, 7);
      ctx.fillRect(obs.x + obs.width - 32, obs.y - 6, 22, 7);
      break;
    }

    case 'workbench': {
      ctx.fillStyle = '#1a140e';
      ctx.fillRect(obs.x - 2, obs.y - 2, obs.width + 4, obs.height + 4);
      ctx.fillStyle = '#5b4632';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.fillStyle = '#d4a017';
      ctx.fillRect(obs.x + 6, obs.y + 8, obs.width - 12, 6);
      ctx.font = 'bold 9px "IBM Plex Mono", monospace';
      ctx.fillText(obs.label || 'SHED', obs.x - 4, obs.y - 8);
      break;
    }

    case 'spring': {
      const cx = obs.x + obs.width / 2;
      const cy = obs.y + obs.height / 2;
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, obs.width / 2);
      g.addColorStop(0, 'rgba(120, 160, 150, 0.85)');
      g.addColorStop(1, 'rgba(30, 50, 44, 0.2)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, obs.width / 2, obs.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d4a017';
      ctx.font = 'bold 9px "IBM Plex Mono", monospace';
      ctx.fillText(obs.label || 'SPRING', obs.x, obs.y - 8);
      break;
    }

    case 'ford': {
      ctx.fillStyle = '#1a2420';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
      ctx.fillStyle = 'rgba(70, 110, 100, 0.55)';
      ctx.fillRect(obs.x + 8, obs.y + 10, obs.width - 16, obs.height - 20);
      ctx.strokeStyle = 'rgba(180, 200, 190, 0.25)';
      ctx.lineWidth = 2;
      for (let x = obs.x + 20; x < obs.x + obs.width; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, obs.y);
        ctx.lineTo(x - 12, obs.y + obs.height);
        ctx.stroke();
      }
      ctx.fillStyle = '#d4a017';
      ctx.font = 'bold 10px "IBM Plex Mono", monospace';
      ctx.fillText(obs.label || 'FORD', obs.x + 8, obs.y - 8);
      break;
    }
  }

  ctx.restore();
}

function renderDrop(ctx: CanvasRenderingContext2D, drop: Drop, now: number) {
  const bob = Math.sin(now * 0.006 + drop.x) * 3;
  const pulse = 0.85 + Math.sin(now * 0.01 + drop.y) * 0.15;

  ctx.save();
  ctx.translate(drop.x, drop.y + bob);

  switch (drop.type) {
    case 'ammo_universal': {
      // Military / hunting green ammo crate with glowing brass bullets
      ctx.fillStyle = 'rgba(74, 222, 128, 0.2)';
      ctx.beginPath();
      ctx.arc(0, 0, 18 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#273e20';
      ctx.fillRect(-10, -7, 20, 14);
      ctx.strokeStyle = '#142111';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-10, -7, 20, 14);

      // Brass bullet tips
      ctx.fillStyle = '#eab308';
      ctx.fillRect(-6, -4, 4, 8);
      ctx.fillRect(-1, -4, 4, 8);
      ctx.fillRect(4, -4, 4, 8);
      break;
    }

    case 'moonshine_med': {
      // Mason Jar with glowing amber moonshine (heals + adrenaline rush)
      ctx.fillStyle = 'rgba(234, 179, 8, 0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, 18 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Glass jar body
      ctx.fillStyle = 'rgba(240, 248, 255, 0.7)';
      ctx.fillRect(-6, -8, 12, 16);

      // Amber whiskey/moonshine liquid
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-5, -3, 10, 10);

      // Silver metal lid
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-7, -10, 14, 3);
      break;
    }

    case 'scrap': {
      // Metal scrap / gears (currency)
      ctx.fillStyle = 'rgba(203, 213, 225, 0.2)';
      ctx.beginPath();
      ctx.arc(0, 0, 14 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'molotov_pickup': {
      // Bottle with rag
      ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, 18 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#78350f';
      ctx.fillRect(-4, -6, 8, 14);
      // Flame wick
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, -9, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'nuke': {
      // Glowing nuclear warhead icon / radiation orb
      ctx.fillStyle = 'rgba(234, 179, 8, 0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, 22 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Golden nuclear bomb icon
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Radiation blades
      ctx.fillStyle = '#1e1e1e';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      for (let a = 0; a < Math.PI * 2; a += (Math.PI * 2) / 3) {
        ctx.beginPath();
        ctx.arc(0, 0, 9, a - 0.4, a + 0.4);
        ctx.lineTo(0, 0);
        ctx.fill();
      }
      break;
    }

    case 'insta_kill': {
      // Crimson Skull Powerup
      ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.beginPath();
      ctx.arc(0, 0, 22 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Glowing crimson disk
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Skull silhouette
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -2, 6, 0, Math.PI * 2);
      ctx.fillRect(-4, 0, 8, 6);
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(-3, -3, 2, 2.5);
      ctx.fillRect(1, -3, 2, 2.5);
      break;
    }

    case 'double_points': {
      // 2X Emerald Badge
      ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, 22 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#064e3b';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('2X', 0, 0);
      break;
    }

    case 'infinite_ammo': {
      // Infinite Ammo Infinity icon
      ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, 22 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1e3a8a';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('∞', 0, -1);
      break;
    }

    case 'speed_boost': {
      // Adrenaline Lightning Bolt
      ctx.fillStyle = 'rgba(168, 85, 247, 0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, 22 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#581c87';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Lightning bolt
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(1, -7);
      ctx.lineTo(-4, 0);
      ctx.lineTo(0, 0);
      ctx.lineTo(-2, 7);
      ctx.lineTo(5, -1);
      ctx.lineTo(1, -1);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

function renderBarricade(ctx: CanvasRenderingContext2D, b: Barricade) {
  const pct = Math.max(0, b.health / b.maxHealth);
  ctx.save();
  if (b.type === "sandbags") {
    ctx.fillStyle = pct > 0.35 ? "#6b5a3e" : "#3f3426";
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.strokeStyle = "#2a2218";
    ctx.strokeRect(b.x, b.y, b.width, b.height);
  } else if (b.type === "coal_cart") {
    ctx.fillStyle = "#2a2e2c";
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.fillStyle = "#111";
    ctx.fillRect(b.x + 4, b.y + 4, b.width - 8, b.height - 8);
  } else {
    ctx.fillStyle = pct > 0.35 ? "#5b3d22" : "#3a2616";
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.strokeStyle = "#2a1a10";
    ctx.lineWidth = 2;
    for (let x = b.x + 8; x < b.x + b.width; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, b.y);
      ctx.lineTo(x, b.y + b.height);
      ctx.stroke();
    }
  }
  if (pct < 1) {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(b.x, b.y - 6, b.width, 3);
    ctx.fillStyle = pct < 0.35 ? "#c23b22" : "#d4a017";
    ctx.fillRect(b.x, b.y - 6, b.width * pct, 3);
  }
  ctx.restore();
}

function renderExtract(ctx: CanvasRenderingContext2D, extract: { x: number; y: number; radius: number }) {
  const now = Date.now();
  const pulse = 0.55 + Math.sin(now * 0.006) * 0.25;
  ctx.save();
  ctx.strokeStyle = `rgba(212, 160, 23, ${0.7 * pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(extract.x, extract.y, extract.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(212, 160, 23, ${0.12 * pulse})`;
  ctx.fill();
  ctx.fillStyle = "#d4a017";
  ctx.font = 'bold 12px "IBM Plex Mono", monospace';
  ctx.textAlign = "center";
  ctx.fillText("GET TO THE TRUCK  [E]", extract.x, extract.y - extract.radius - 10);
  ctx.restore();
}

// ---- Batch 7 (Lane 4 / RENDER): camera, celebration, telegraphs, culling ----
// Engine-wire contract (engine lane / integrator): each frame, in world space,
//   renderTelegraphs(ctx, this.telegraphs, nowMs, this.player)
//   render7.celebration.poll({ draftOpen: !!this.draft, shrinesAttuned: n, bombCharges: this.bombCharges }, px, py)
//   render7.celebration.renderWorld(ctx, nowMs)   // world pass
//   render7.celebration.renderScreen(ctx, w, h, nowMs) // screen pass; slow-mo via slowmoFactor(nowMs)
// Zoom: base = this.viewZoom(); z = render7.zoom.update(this.zombies, px, py, dt, base, this.motionScale())
// Camera: render7.camera.update(px, py, vx, vy, aimX, aimY); use render7.camera.x/y (trauma shake stays engine-side, applied after)
// Culling: cullEntities(list, viewport, radius) for zombies/pickups/particles (NOT ground decals)
// Darkness: this.lighting.renderDarkness(ctx, w, h, pxy.x, pxy.y, this.player.lightRadius ?? 220, !!this.dark, nowMs)

/** Clamp helper: the intermittent negative-arc-radius page error dies here. */
function safeR(r: number): number {
  return r >= 0.001 ? r : 0.001;
}

// ---- 1. Dynamic zoom: pull back as horde density rises ----
export const ZOOM_DENSITY_RADIUS = 600;
export const ZOOM_DENSITY_DIV = 40;
export const ZOOM_PULL_K = 0.03;

/** Pure target: zoom = clamp(base - density*k, minZoom, base). motionScale 0.2 = reduce-motion. */
export function zoomTargetForDensity(density: number, baseZoom: number, motionScale = 1): number {
  const d = Math.min(4, Math.max(0, density || 0));
  const minZoom = Math.max(0.3, baseZoom - 0.12);
  const t = baseZoom - d * ZOOM_PULL_K * motionScale;
  return t < minZoom ? minZoom : t > baseZoom ? baseZoom : t;
}

export class DynamicZoomRig {
  public current = 0;
  public target = 0;
  public density = 0;
  /**
   * zombies: Array<{x,y}> (read-only). Density = zombies within 600u of player / 40.
   * motionScale: 1 normally, 0.2 when a11y reduce-motion is on (scales the pullback).
   */
  update(
    zombies: Array<{ x: number; y: number }> | undefined | null,
    px: number, py: number, dt: number, baseZoom: number, motionScale = 1,
  ): number {
    let near = 0;
    if (Array.isArray(zombies)) {
      for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i];
        if (!z) continue;
        const dx = z.x - px, dy = z.y - py;
        if (dx * dx + dy * dy <= ZOOM_DENSITY_RADIUS * ZOOM_DENSITY_RADIUS) near++;
      }
    }
    this.density = near / ZOOM_DENSITY_DIV;
    this.target = zoomTargetForDensity(this.density, baseZoom, motionScale);
    if (this.current <= 0) this.current = baseZoom;
    const k = 1 - Math.exp(-3 * Math.max(0, dt)); // smoothed lerp toward target
    this.current += (this.target - this.current) * k;
    return this.current;
  }
  state() { return { current: this.current, target: this.target, density: this.density }; }
}

// ---- 2. Smooth camera follow + deadzone + lookahead ----
export class CameraRig {
  public x = 0;
  public y = 0;
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  snap(x: number, y: number) { this.x = x; this.y = y; }
  /**
   * vx,vy = player velocity (u/s); aimX,aimY = normalized aim dir.
   * Deadzone 24px on the player delta (no jitter when stationary); when moving,
   * target = player + vel*0.35 + aim*40, lerped at 0.10. Trauma shake is
   * engine-side and stays applied after this.
   */
  update(px: number, py: number, vx: number, vy: number, aimX: number, aimY: number): void {
    const dx = px - this.x, dy = py - this.y;
    if (dx * dx + dy * dy < 576) return; // 24px deadzone
    const tx = px + vx * 0.35 + aimX * 40;
    const ty = py + vy * 0.35 + aimY * 40;
    this.x += (tx - this.x) * 0.10;
    this.y += (ty - this.y) * 0.10;
  }
}

// ---- 3. Celebration stack ----
export type CelebrationKind = 'levelup' | 'shrine' | 'bomb';
export const CELEBRATION_TEXT: Record<CelebrationKind, string> = {
  levelup: 'LEVEL UP!',
  shrine: 'ATTUNED',
  bomb: `STORM'S COMING`,
};

/** Back.easeOut for the 200ms banner scale-pop. */
export function backEaseOut(t: number): number {
  const c1 = 1.70158, c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

interface CelebParticle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; hue: number; active: boolean; }

export class CelebrationFx {
  public kind: CelebrationKind | null = null;
  public t0 = 0;
  public x = 0;
  public y = 0;
  private slowmoUntil = 0;
  private lastNow = 0;
  private lastDraftOpen = false;
  private lastShrines = 0;
  private lastBombs = -1;
  private parts: CelebParticle[] = []; // preallocated 40-particle fountain pool

  constructor() {
    for (let i = 0; i < 40; i++) {
      this.parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, hue: 45, active: false });
    }
  }

  trigger(kind: CelebrationKind, x: number, y: number, now = Date.now()) {
    this.kind = kind;
    this.t0 = now;
    this.lastNow = now;
    this.x = x; this.y = y;
    this.slowmoUntil = now + 300; // 0.4x slow-mo for 300ms
    // Batch 8 (Lane C): arm only qualityFactor() of the 40-particle pool —
    // cosmetic particle budget scales down on narrow/mobile screens.
    const budget = Math.max(8, Math.round(this.parts.length * qualityFactor()));
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (i >= budget) { p.active = false; continue; }
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
      const sp = 120 + Math.random() * 260;
      p.x = x + (Math.random() - 0.5) * 24;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.maxLife = 0.7 + Math.random() * 0.6;
      p.life = p.maxLife;
      p.size = 2 + Math.random() * 3.5;
      p.hue = 38 + Math.random() * 14;
      p.active = true;
    }
  }

  /**
   * Engine calls each frame with read-only flags; transitions fire celebrations.
   * draftOpen: level-up draft opened · shrinesAttuned: count rose · bombCharges: count fell.
   */
  poll(flags: { draftOpen: boolean; shrinesAttuned: number; bombCharges: number }, x: number, y: number, now = Date.now()) {
    if (flags.draftOpen && !this.lastDraftOpen) this.trigger('levelup', x, y, now);
    if ((flags.shrinesAttuned | 0) > this.lastShrines) this.trigger('shrine', x, y, now);
    if (this.lastBombs >= 0 && (flags.bombCharges | 0) < this.lastBombs) this.trigger('bomb', x, y, now);
    this.lastDraftOpen = !!flags.draftOpen;
    this.lastShrines = flags.shrinesAttuned | 0;
    this.lastBombs = flags.bombCharges | 0;
  }

  active(now = Date.now()) { return this.kind !== null && now - this.t0 < 1200; }
  activeKind() { return this.kind; }
  celebrationText() { return this.kind ? CELEBRATION_TEXT[this.kind] : ''; }
  particleCount() { let n = 0; for (const p of this.parts) if (p.active) n++; return n; }
  /** 0.4 while inside the 300ms window, else 1 — engine multiplies its dt by this. */
  slowmoFactor(now = Date.now()) { return now < this.slowmoUntil ? 0.4 : 1; }
  /** Banner scale-pop: 200ms Back.easeOut. */
  bannerScale(now = Date.now()) {
    if (!this.kind) return 0;
    const t = (now - this.t0) / 200;
    if (t <= 0) return 0;
    return backEaseOut(Math.min(1, t));
  }

  /** World-space pass: gold radial flash + 40-particle upward fountain + floating text. */
  renderWorld(ctx: CanvasRenderingContext2D, now = Date.now()) {
    if (!this.kind) return;
    const el = now - this.t0;
    if (el < 0 || el > 1200) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;

    // Gold radial flash
    const flashA = Math.max(0, 1 - el / 450);
    if (flashA > 0) {
      const fr = safeR(260);
      const g = ctx.createRadialGradient(this.x, this.y, 0.001, this.x, this.y, fr);
      g.addColorStop(0, `rgba(255, 205, 95, ${(0.55 * flashA).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255, 205, 95, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(this.x, this.y, fr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Upward fountain (pooled particles, no per-frame allocation)
    for (const p of this.parts) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = p.life / p.maxLife;
      ctx.fillStyle = `hsla(${p.hue | 0}, 95%, ${55 + a * 20}%, ${(a * 0.95).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, safeR(p.size * a), 0, Math.PI * 2);
      ctx.fill();
    }

    // Floating text
    const rise = el * 0.06;
    const textA = el < 600 ? 1 : Math.max(0, 1 - (el - 600) / 400);
    if (textA > 0) {
      ctx.save();
      ctx.globalAlpha = textA;
      ctx.font = 'bold 30px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#1a0d02';
      ctx.strokeText(CELEBRATION_TEXT[this.kind], this.x, this.y - 70 - rise);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(CELEBRATION_TEXT[this.kind], this.x, this.y - 70 - rise);
      ctx.restore();
    }
  }

  /** Screen-space pass: banner scale-pop (200ms Back.easeOut). */
  renderScreen(ctx: CanvasRenderingContext2D, w: number, h: number, now = Date.now()) {
    if (!this.kind) return;
    const el = now - this.t0;
    if (el < 0 || el > 1200) return;
    const s = this.bannerScale(now);
    if (s <= 0) return;
    const a = el < 800 ? 1 : Math.max(0, 1 - (el - 800) / 400);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(w / 2, h * 0.3);
    ctx.scale(s, s);
    const label = CELEBRATION_TEXT[this.kind];
    ctx.font = 'bold 54px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(10, 8, 4, 0.72)';
    ctx.fillRect(-tw / 2 - 26, -44, tw + 52, 88);
    ctx.strokeStyle = '#d4a017';
    ctx.lineWidth = 2;
    ctx.strokeRect(-tw / 2 - 26, -44, tw + 52, 88);
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#1a0d02';
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = '#ffd166';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

// ---- 4. Telegraph drawing: expanding/pulsing rings, drained each frame ----
export interface Telegraph { kind: 'leap' | 'ranged' | 'charge'; x: number; y: number; r: number; t0: number; dur: number; }

let telegraphArcs = 0;
/** Probe: canvas arc calls made by renderTelegraphs since the last reset. */
export function drawnTelegraphs() { return telegraphArcs; }
export function resetTelegraphCount() { telegraphArcs = 0; }

/**
 * Draw telegraphs (world space — call inside the engine's world transform).
 * list is read-only (engine owns lifecycle); nowMs/t0/dur share one ms clock.
 * Never throws on malformed entries. Returns telegraphs drawn.
 */
export function renderTelegraphs(
  ctx: CanvasRenderingContext2D,
  list: Telegraph[] | undefined | null,
  nowMs: number,
  player: { x: number; y: number } | undefined | null,
): number {
  if (!Array.isArray(list) || list.length === 0) return 0;
  let drawn = 0;
  for (let i = 0; i < list.length; i++) {
    const t = list[i] as Partial<Telegraph>;
    if (!t || typeof t.x !== 'number' || typeof t.y !== 'number' || !isFinite(t.x) || !isFinite(t.y)) continue;
    const dur = typeof t.dur === 'number' && t.dur > 0 && isFinite(t.dur) ? t.dur : 600;
    const t0 = typeof t.t0 === 'number' && isFinite(t.t0) ? t.t0 : nowMs;
    const fade = (t0 + dur - nowMs) / dur;
    if (!(fade > 0) || fade > 1.25) continue; // expired, malformed, or from the future
    const alpha = Math.min(1, fade);
    const r = safeR(typeof t.r === 'number' && t.r > 0 && isFinite(t.r) ? t.r : 24);
    const prog = 1 - alpha; // 0 at spawn → 1 at strike
    if (t.kind === 'charge') {
      if (!player || !isFinite(player.x) || !isFinite(player.y)) continue;
      const dx = player.x - t.x, dy = player.y - t.y;
      const len = Math.hypot(dx, dy);
      if (!(len > 1)) continue;
      const wHalf = r * 0.7;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(Math.atan2(dy, dx));
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, `rgba(220, 40, 30, ${(0.5 * alpha).toFixed(3)})`);
      g.addColorStop(1, `rgba(220, 40, 30, ${(0.08 * alpha).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, -wHalf, len, wHalf * 2);
      ctx.strokeStyle = `rgba(255, 90, 60, ${(0.85 * alpha).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(0, -wHalf, len, wHalf * 2);
      // chevrons marching toward the player
      ctx.strokeStyle = `rgba(255, 200, 150, ${(0.7 * alpha).toFixed(3)})`;
      ctx.lineWidth = 3;
      const step = 46;
      const off = (nowMs * 0.12) % step;
      ctx.beginPath();
      for (let cx = step - off; cx < len; cx += step) {
        ctx.moveTo(cx - 12, -wHalf * 0.7);
        ctx.lineTo(cx, 0);
        ctx.lineTo(cx - 12, wHalf * 0.7);
      }
      ctx.stroke();
      ctx.restore();
      drawn++;
    } else if (t.kind === 'leap' || t.kind === 'ranged') {
      const col = t.kind === 'leap' ? '250, 200, 60' : '230, 50, 40';
      ctx.save();
      // expanding outer ring — closes in as the strike nears
      ctx.strokeStyle = `rgba(${col}, ${(0.85 * alpha).toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(t.x, t.y, safeR(r * (0.25 + 0.75 * prog)), 0, Math.PI * 2);
      ctx.stroke();
      telegraphArcs++;
      // pulsing inner ring at full radius
      ctx.strokeStyle = `rgba(${col}, ${(0.45 * alpha).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(t.x, t.y, safeR(r * (0.92 + 0.08 * Math.sin(nowMs * 0.02))), 0, Math.PI * 2);
      ctx.stroke();
      telegraphArcs++;
      ctx.restore();
      drawn++;
    }
    // unknown kinds are ignored — never crash
  }
  return drawn;
}

// ---- 5. Off-screen render culling (viewport + 96px margin) ----
// Applies to zombies / pickups / particles. Ground decals keep their existing
// behavior — the new 96px rule is intentionally NOT applied to them.
export interface CViewport { x: number; y: number; width: number; height: number; }

let culledEntities = 0;
/** Probe: entities culled by the 96px-margin rule since the last reset. */
export function culledCount() { return culledEntities; }
export function resetCulledCount() { culledEntities = 0; }

export function visibleInViewport(x: number, y: number, r: number, vp: CViewport, margin = 96): boolean {
  return x + r + margin >= vp.x && x - r - margin <= vp.x + vp.width
    && y + r + margin >= vp.y && y - r - margin <= vp.y + vp.height;
}

/** Partition a list into the visible subset; bumps the culled counter. Engine should reuse the returned array. */
export function cullEntities<T extends { x: number; y: number }>(list: T[], vp: CViewport, radius: number, margin = 96): T[] {
  const out: T[] = [];
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (visibleInViewport(e.x, e.y, radius, vp, margin)) out.push(e);
    else culledEntities++;
  }
  return out;
}

// ---- Batch 8 (Lane C): procedural particle sprites (zero-asset) ----
// Baked once at startup to offscreen canvases: hot white-yellow glow,
// orange spark streak, soft gray smoke puff. Per-(kind, tint) variants are
// baked lazily via 'source-in' and cached, so particle colors are preserved.
export type ParticleSpriteKind = 'glow' | 'spark' | 'smoke';
export const PARTICLE_SPRITE_SIZES: Record<ParticleSpriteKind, number> = { glow: 32, spark: 24, smoke: 32 };

const spriteCache = new Map<string, HTMLCanvasElement>();

function bakeGlowBase(): HTMLCanvasElement {
  const s = PARTICLE_SPRITE_SIZES.glow;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.3, 'rgba(255, 244, 200, 0.9)');
    grad.addColorStop(0.65, 'rgba(255, 190, 80, 0.28)');
    grad.addColorStop(1, 'rgba(255, 170, 60, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  return c;
}

function bakeSparkBase(): HTMLCanvasElement {
  const s = PARTICLE_SPRITE_SIZES.spark;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const g = c.getContext('2d');
  if (g) {
    // Streak: squashed vertical axis so the radial reads as an orange dash.
    g.translate(s / 2, s / 2);
    g.scale(1, 0.36);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, s / 2);
    grad.addColorStop(0, 'rgba(255, 252, 240, 1)');
    grad.addColorStop(0.35, 'rgba(255, 176, 66, 0.9)');
    grad.addColorStop(1, 'rgba(255, 120, 20, 0)');
    g.fillStyle = grad;
    g.fillRect(-s / 2, -s, s, s * 2); // covers the gradient's full extent
  }
  return c;
}

function bakeSmokeBase(): HTMLCanvasElement {
  const s = PARTICLE_SPRITE_SIZES.smoke;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const puff = (cx: number, cy: number, r: number, a: number) => {
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(205, 205, 205, ${a.toFixed(3)})`);
      grad.addColorStop(0.7, `rgba(170, 170, 170, ${(a * 0.5).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(150, 150, 150, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    };
    puff(s / 2, s / 2, s / 2, 0.5);
    puff(s * 0.38, s * 0.42, s * 0.28, 0.35);
    puff(s * 0.62, s * 0.58, s * 0.3, 0.35);
  }
  return c;
}

function baseSprite(kind: ParticleSpriteKind): HTMLCanvasElement {
  const key = 'base:' + kind;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const c = kind === 'glow' ? bakeGlowBase() : kind === 'spark' ? bakeSparkBase() : bakeSmokeBase();
  spriteCache.set(key, c);
  return c;
}

/** Backing sprite for a kind; optional tint bakes a cached color variant. */
export function particleSprite(kind: ParticleSpriteKind, tint?: string): HTMLCanvasElement {
  const base = baseSprite(kind);
  if (typeof tint !== 'string' || tint.length === 0) return base;
  const key = kind + ':' + tint;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = base.width; c.height = base.height;
  const g = c.getContext('2d');
  if (g) {
    g.drawImage(base, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = tint;
    g.fillRect(0, 0, c.width, c.height);
  }
  spriteCache.set(key, c);
  return c;
}

let particleSpriteDraws = 0;
/** Probe: sprite draw calls since the last reset. */
export function drawnParticleSprites() { return particleSpriteDraws; }
export function resetParticleSpriteCount() { particleSpriteDraws = 0; }

function drawParticleSprite(
  ctx: CanvasRenderingContext2D,
  kind: ParticleSpriteKind,
  x: number, y: number, size: number, alpha: number, tint?: string,
) {
  // Negative-arc-radius hardening, sprite edition: drawImage throws on
  // non-positive w/h, so clamp and bail on garbage instead of crashing.
  if (!(alpha > 0) || !(size > 0) || !isFinite(x + y)) return;
  const s = size < 0.001 ? 0.001 : size;
  ctx.save();
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.drawImage(particleSprite(kind, tint), x - s / 2, y - s / 2, s, s);
  ctx.restore();
  particleSpriteDraws++;
}

/** Hot white-yellow radial glow. size = full sprite width in px. */
export function drawGlowSprite(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number, tint?: string) {
  drawParticleSprite(ctx, 'glow', x, y, size, alpha, tint);
}
/** Orange spark streak. size = full sprite width in px. */
export function drawSparkSprite(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number, tint?: string) {
  drawParticleSprite(ctx, 'spark', x, y, size, alpha, tint);
}
/** Soft gray smoke puff. size = full sprite width in px. */
export function drawSmokeSprite(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number, tint?: string) {
  drawParticleSprite(ctx, 'smoke', x, y, size, alpha, tint);
}

/** Bake all three base sprites now — called once at startup. */
export function ensureParticleSprites(): void {
  baseSprite('glow');
  baseSprite('spark');
  baseSprite('smoke');
}

/** Probe: true once the three base sprites are baked. */
export function spriteCacheReady(): boolean {
  return spriteCache.has('base:glow') && spriteCache.has('base:spark') && spriteCache.has('base:smoke');
}
/** Probe: total baked sprites in the cache (base + tint variants). */
export function spriteCount(): number { return spriteCache.size; }

// ---- Batch 8 (Lane C): DPR cap + quality scaling ----
// The engine renders in CSS-pixel space (viewZoom/viewSize/screenToWorld all
// read canvas.width directly), so the backing store stays at 1x CSS — always
// within the cap. dprCap() is the enforced policy (min(raw DPR, cap)) and the
// value a DPR-aware render loop would size the backing store with;
// qualityFactor() scales cosmetic particle budgets (1.0 desktop, 0.6 mobile).
export const DPR_CAP_DESKTOP = 1.5;
export const DPR_CAP_MOBILE = 1.0;
export const NARROW_VIEWPORT_PX = 640;
export const QUALITY_MOBILE = 0.6;

function viewportWidth(w?: number): number {
  if (typeof w === 'number' && isFinite(w)) return w;
  return typeof window !== 'undefined' ? window.innerWidth : 1024;
}

export function isNarrowViewport(w?: number): boolean {
  return viewportWidth(w) < NARROW_VIEWPORT_PX;
}

/** Effective DPR allowed for the canvas backing store: min(raw, 1.5 desktop / 1.0 narrow). */
export function dprCap(w?: number): number {
  const raw = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  return Math.min(raw, isNarrowViewport(w) ? DPR_CAP_MOBILE : DPR_CAP_DESKTOP);
}

/** 1.0 on desktop viewports, 0.6 on narrow/mobile — multiply cosmetic particle counts by this. */
export function qualityFactor(w?: number): number {
  return isNarrowViewport(w) ? QUALITY_MOBILE : 1.0;
}

// ---- Batch 7 probe wiring ----
export const render7 = {
  zoom: new DynamicZoomRig(),
  camera: new CameraRig(),
  celebration: new CelebrationFx(),
  renderTelegraphs,
  drawnTelegraphs,
  resetTelegraphCount,
  visibleInViewport,
  cullEntities,
  culledCount,
  resetCulledCount,
  zoomTargetForDensity,
  backEaseOut,
  // Batch 8 (Lane C): procedural particle sprites + DPR cap / quality scaling
  particleSprite,
  ensureParticleSprites,
  drawGlowSprite,
  drawSparkSprite,
  drawSmokeSprite,
  spriteCacheReady,
  spriteCount,
  drawnParticleSprites,
  resetParticleSpriteCount,
  dprCap,
  qualityFactor,
  isNarrowViewport,
  DPR_CAP_DESKTOP,
  DPR_CAP_MOBILE,
  NARROW_VIEWPORT_PX,
  QUALITY_MOBILE,
  PARTICLE_SPRITE_SIZES,
  DynamicZoomRig,
  CameraRig,
  CelebrationFx,
  CELEBRATION_TEXT,
  ZOOM_DENSITY_RADIUS,
  ZOOM_DENSITY_DIV,
  ZOOM_PULL_K,
};

/** Attach render-lane counters onto the engine's __controlsTest handle (engine owns that object; we only add). */
function attachRender7Probes() {
  const w = window as unknown as Record<string, unknown>;
  const ct = w.__controlsTest as Record<string, unknown> | undefined;
  if (!ct) return;
  if (typeof ct.drawnTelegraphs !== 'function') ct.drawnTelegraphs = () => telegraphArcs;
  if (typeof ct.culledCount !== 'function') ct.culledCount = () => culledEntities;
  // Batch 8 (Lane C): DPR/quality + sprite probes on the engine's handle.
  if (typeof ct.dprCap !== 'function') ct.dprCap = (w?: number) => dprCap(w);
  if (typeof ct.qualityFactor !== 'function') ct.qualityFactor = (w?: number) => qualityFactor(w);
  if (typeof ct.spriteCacheReady !== 'function') ct.spriteCacheReady = () => spriteCacheReady();
  if (typeof ct.spriteCount !== 'function') ct.spriteCount = () => spriteCount();
  if (typeof ct.drawnParticleSprites !== 'function') ct.drawnParticleSprites = () => particleSpriteDraws;
  if (typeof ct.resetParticleSpriteCount !== 'function') ct.resetParticleSpriteCount = () => { particleSpriteDraws = 0; };
  if (!ct.render7) ct.render7 = (window as unknown as Record<string, unknown>).__pzRender7;
}

// Batch 6: test/render probe surface. Engine integration (renderZombies,
// renderPlayer, setAmbient on map switch) is the coordinator's lane.
if (typeof window !== 'undefined') {
  // Batch 8 (Lane C): bake particle sprites once at startup (zero-asset).
  ensureParticleSprites();
  (window as any).__pzRender7 = render7;
  (window as any).__pzVisual = {
    tileFor,
    plateFor,
    parallaxFor,
    renderParallax,
    renderEnvironment,
    drawBlobShadow,
    registerZombieHit,
    zombieFlashIntensity,
    hueJitterFor,
    applyZombieTint,
    clearZombieTint,
    drawZombieHitFlash,
    HIT_FLASH_MS,
    // Batch 7 (Lane 4 / RENDER)
    render7,
    renderTelegraphs,
    drawnTelegraphs,
    resetTelegraphCount,
    visibleInViewport,
    cullEntities,
    culledCount,
    resetCulledCount,
    zoomTargetForDensity,
    backEaseOut,
    DynamicZoomRig,
    CameraRig,
    CelebrationFx,
    CELEBRATION_TEXT,
    // Batch 8 (Lane C): procedural particle sprites + DPR cap / quality scaling
    particleSprite,
    ensureParticleSprites,
    drawGlowSprite,
    drawSparkSprite,
    drawSmokeSprite,
    spriteCacheReady,
    spriteCount,
    drawnParticleSprites,
    resetParticleSpriteCount,
    dprCap,
    qualityFactor,
    isNarrowViewport,
    DPR_CAP_DESKTOP,
    DPR_CAP_MOBILE,
    NARROW_VIEWPORT_PX,
    QUALITY_MOBILE,
    PARTICLE_SPRITE_SIZES,
  };
}

