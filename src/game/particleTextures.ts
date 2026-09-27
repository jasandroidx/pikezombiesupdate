// ---- Batch 14 (Lane A): procedural particle texture atlas (zero-asset) ----
// Every particle kind in the game is baked ONCE at startup to an offscreen
// canvas; per-frame draws are drawImage blits instead of per-frame
// arc/gradient construction. Pixel/grit aesthetic matches the game's
// county-horror look: deterministic seeded noise speckles over every bake,
// so the atlas is identical on every machine and every run.
//
// Catalog (engine particle systems these cover):
//   bloodDrop   flying blood spray particles (engine type `blood`)
//   bloodSplat  persistent ground blood splats / blood decals
//   spark       hit sparks / ricochets (engine type `spark`)
//   smoke       smoke puffs (engine type `smoke`)
//   glow        fire / hot glow (engine type `fire`)
//   ring        shockwave rings (engine renderShockwaves)
//   muzzle      muzzle flash star (player weapons)
//   glint       grit glints / celebration fountain sparks
//   ember       small hot embers
//   flame       fire-puddle gradient (renderEnvironment decals)
//   flash       gold radial celebration flash
//
// Per-(kind, tint) variants are baked lazily via 'source-in' and cached,
// mirroring the Batch 8 sprite system's tint discipline.

export type ParticleTextureKind =
  | 'bloodDrop' | 'bloodSplat' | 'spark' | 'smoke' | 'glow'
  | 'ring' | 'muzzle' | 'glint' | 'ember' | 'flame' | 'flash';

export const PARTICLE_TEXTURE_KINDS: readonly ParticleTextureKind[] = [
  'bloodDrop', 'bloodSplat', 'spark', 'smoke', 'glow',
  'ring', 'muzzle', 'glint', 'ember', 'flame', 'flash',
];

/** Baked canvas edge length per kind. */
export const PARTICLE_TEXTURE_SIZES: Record<ParticleTextureKind, number> = {
  bloodDrop: 16,
  bloodSplat: 64,
  spark: 24,
  smoke: 32,
  glow: 32,
  ring: 64,
  muzzle: 48,
  glint: 16,
  ember: 12,
  flame: 64,
  flash: 128,
};

/** Deterministic RNG so the grit is identical on every run and machine. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(s: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  return [c, c.getContext('2d')];
}

/**
 * Pike County grit: deterministic dark/light pixel speckles over a baked
 * shape. Subtle enough to keep spot-check colors intact.
 */
function grain(g: CanvasRenderingContext2D, s: number, seed: number, n: number): void {
  const rand = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = (rand() * s) | 0;
    const y = (rand() * s) | 0;
    const w = rand() < 0.3 ? 2 : 1;
    g.fillStyle = rand() < 0.62 ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.10)';
    g.fillRect(x, y, w, 1);
  }
}

/** Irregular blob: n overlapping circles around (cx, cy). */
function blob(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number, rand: () => number): void {
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * r * 0.45;
    const rr = r * (0.45 + rand() * 0.45);
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, Math.PI * 2);
    g.fill();
  }
}

function bakeBloodDrop(): HTMLCanvasElement {
  const s = PARTICLE_TEXTURE_SIZES.bloodDrop;
  const [c, g] = makeCanvas(s);
  if (g) {
    const rand = mulberry32(0xb100d);
    g.fillStyle = '#7a1018';
    blob(g, s / 2, s / 2, s * 0.42, 6, rand);
    g.fillStyle = '#a31621';
    blob(g, s / 2 - 1, s / 2 - 1.5, s * 0.32, 5, rand);
    g.fillStyle = 'rgba(255, 130, 130, 0.55)';
    g.beginPath(); g.arc(s * 0.38, s * 0.34, s * 0.09, 0, Math.PI * 2); g.fill();
    grain(g, s, 0xd90d, 14);
  }
  return c;
}

function bakeBloodSplat(): HTMLCanvasElement {
  const s = PARTICLE_TEXTURE_SIZES.bloodSplat;
  const [c, g] = makeCanvas(s);
  if (g) {
    const rand = mulberry32(0x5b100d);
    // main pool — dark county-red, hard alpha (alpha comes from the draw call)
    g.fillStyle = 'rgb(139, 0, 0)';
    blob(g, s / 2, s / 2, s * 0.34, 9, rand);
    // two satellite droplets, like the old per-frame decal arcs
    g.fillStyle = 'rgb(90, 0, 0)';
    blob(g, s * 0.78, s * 0.60, s * 0.085, 3, rand);
    blob(g, s * 0.24, s * 0.72, s * 0.07, 3, rand);
    // cast-off speckles
    g.fillStyle = 'rgb(110, 15, 22)';
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2;
      const d = s * (0.36 + rand() * 0.14);
      g.beginPath();
      g.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, 1 + rand() * 1.6, 0, Math.PI * 2);
      g.fill();
    }
    grain(g, s, 0x52147, 60);
  }
  return c;
}

function bakeSpark(): HTMLCanvasElement {
  const s = PARTICLE_TEXTURE_SIZES.spark;
  const [c, g] = makeCanvas(s);
  if (g) {
    g.translate(s / 2, s / 2);
    g.scale(1, 0.36);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, s / 2);
    grad.addColorStop(0, 'rgba(255, 252, 240, 1)');
    grad.addColorStop(0.35, 'rgba(255, 176, 66, 0.9)');
    grad.addColorStop(1, 'rgba(255, 120, 20, 0)');
    g.fillStyle = grad;
    g.fillRect(-s / 2, -s, s, s * 2);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // white-hot core pixels
    g.fillStyle = 'rgba(255, 255, 255, 0.95)';
    g.fillRect(s / 2 - 3, s / 2 - 1, 6, 2);
    grain(g, s, 0x5a12, 18);
  }
  return c;
}

function bakeSmoke(): HTMLCanvasElement {
  const s = PARTICLE_TEXTURE_SIZES.smoke;
  const [c, g] = makeCanvas(s);
  if (g) {
    const puff = (cx: number, cy: number, r: number, a: number) => {
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(205, 205, 205, ${a.toFixed(3)})`);
      grad.addColorStop(0.7, `rgba(170, 170, 170, ${(a * 0.5).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(150, 150, 150, 0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    };
    puff(s / 2, s / 2, s / 2, 0.5);
    puff(s * 0.38, s * 0.42, s * 0.28, 0.35);
    puff(s * 0.62, s * 0.58, s * 0.3, 0.35);
    grain(g, s, 0x5a0e, 22);
  }
  return c;
}

function bakeGlow(): HTMLCanvasElement {
  const s = PARTICLE_TEXTURE_SIZES.glow;
  const [c, g] = makeCanvas(s);
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.3, 'rgba(255, 244, 200, 0.9)');
    grad.addColorStop(0.65, 'rgba(255, 190, 80, 0.28)');
    grad.addColorStop(1, 'rgba(255, 170, 60, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    grain(g, s, 0x9b10, 12);
  }
  return c;
}

function bakeRing(): HTMLCanvasElement {
  const s = PARTICLE_TEXTURE_SIZES.ring;
  const [c, g] = makeCanvas(s);
  if (g) {
    const r = s * 0.375;
    g.lineCap = 'round';
    // soft outer halo, hot core line, crisp inner line — reads as a shockwave
    g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    g.lineWidth = s * 0.16;
    g.beginPath(); g.arc(s / 2, s / 2, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    g.lineWidth = s * 0.08;
    g.beginPath(); g.arc(s / 2, s / 2, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#ffffff';
    g.lineWidth = Math.max(1.5, s * 0.03);
    g.beginPath(); g.arc(s / 2, s / 2, r, 0, Math.PI * 2); g.stroke();
    grain(g, s, 0x21c9, 26);
  }
  return c;
}

function bakeMuzzle(): HTMLCanvasElement {
  const s = PARTICLE_TEXTURE_SIZES.muzzle;
  const [c, g] = makeCanvas(s);
  if (g) {
    const rand = mulberry32(0xa2e1e);
    // symmetric star flash (caller rotates toward aim); warm county-gun colors
    g.fillStyle = 'rgba(255, 240, 180, 0.95)';
    g.beginPath();
    const spikes = 8;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const rr = (i % 2 === 0 ? s * 0.44 : s * 0.16) * (0.9 + rand() * 0.2);
      const px = s / 2 + Math.cos(a) * rr;
      const py = s / 2 + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.fill();
    const core = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.2);
    core.addColorStop(0, 'rgba(255, 255, 255, 1)');
    core.addColorStop(1, 'rgba(255, 240, 180, 0)');
    g.fillStyle = core;
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.2, 0, Math.PI * 2); g.fill();
    grain(g, s, 0x2e21, 20);
  }
  return c;
}

function bakeGlint(): HTMLCanvasElement {
  const s = PARTICLE_TEXTURE_SIZES.glint;
  const [c, g] = makeCanvas(s);
  if (g) {
    // 4-point star glint, gold — grit pickups and celebration sparks
    g.fillStyle = '#ffd166';
    g.beginPath();
    g.moveTo(s / 2, 0);
    g.lineTo(s * 0.62, s * 0.38); g.lineTo(s, s / 2);
    g.lineTo(s * 0.62, s * 0.62); g.lineTo(s / 2, s);
    g.lineTo(s * 0.38, s * 0.62); g.lineTo(0, s / 2);
    g.lineTo(s * 0.38, s * 0.38);
    g.closePath(); g.fill();
    g.fillStyle = '#fff6d8';
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.14, 0, Math.PI * 2); g.fill();
    grain(g, s, 0x91177, 8);
  }
  return c;
}

function bakeEmber(): HTMLCanvasElement {
  const s = PARTICLE_TEXTURE_SIZES.ember;
  const [c, g] = makeCanvas(s);
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255, 235, 200, 1)');
    grad.addColorStop(0.45, 'rgba(255, 122, 42, 0.95)');
    grad.addColorStop(1, 'rgba(194, 65, 12, 0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); g.fill();
    grain(g, s, 0xea18, 8);
  }
  return c;
}

function bakeFlame(): HTMLCanvasElement {
  const s = PARTICLE_TEXTURE_SIZES.flame;
  const [c, g] = makeCanvas(s);
  if (g) {
    const rand = mulberry32(0xf1a3);
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255, 230, 120, 0.9)');
    grad.addColorStop(0.3, 'rgba(255, 120, 20, 0.7)');
    grad.addColorStop(0.7, 'rgba(220, 50, 10, 0.4)');
    grad.addColorStop(1, 'rgba(180, 20, 0, 0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); g.fill();
    // lumpy flame tongues
    g.fillStyle = 'rgba(255, 150, 40, 0.5)';
    blob(g, s / 2, s / 2, s * 0.28, 6, rand);
    grain(g, s, 0xf14e, 30);
  }
  return c;
}

function bakeFlash(): HTMLCanvasElement {
  const s = PARTICLE_TEXTURE_SIZES.flash;
  const [c, g] = makeCanvas(s);
  if (g) {
    // gold celebration flash — baked max core alpha 0.55, matching the old
    // per-frame gradient (0.55 * flashA) when blitted with alpha = flashA.
    const grad = g.createRadialGradient(s / 2, s / 2, 0.001, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255, 205, 95, 0.55)');
    grad.addColorStop(1, 'rgba(255, 205, 95, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  return c;
}

const bakers: Record<ParticleTextureKind, () => HTMLCanvasElement> = {
  bloodDrop: bakeBloodDrop,
  bloodSplat: bakeBloodSplat,
  spark: bakeSpark,
  smoke: bakeSmoke,
  glow: bakeGlow,
  ring: bakeRing,
  muzzle: bakeMuzzle,
  glint: bakeGlint,
  ember: bakeEmber,
  flame: bakeFlame,
  flash: bakeFlash,
};

const atlas = new Map<string, HTMLCanvasElement>();
let initialized = false;

/**
 * Bake every kind to its offscreen canvas. Idempotent: a second call reuses
 * the existing atlas (same canvas objects), so startup is safe to repeat.
 */
export function initParticleTextures(): void {
  if (initialized) return;
  for (const kind of PARTICLE_TEXTURE_KINDS) {
    if (!atlas.has(kind)) atlas.set(kind, bakers[kind]());
  }
  initialized = true;
}

/** Probe: true once the atlas is baked. */
export function hasParticleTextures(): boolean {
  return initialized && PARTICLE_TEXTURE_KINDS.every((k) => atlas.has(k));
}

/** Probe: baked canvases in the atlas (base + tint variants). */
export function particleTextureCount(): number {
  return atlas.size;
}

/**
 * Backing texture for a kind; optional tint bakes a cached color variant
 * (same 'source-in' discipline as the Batch 8 sprite system).
 * Lazily initializes the atlas on first use. Returns null for unknown kinds.
 */
export function particleTexture(kind: string, tint?: string): HTMLCanvasElement | null {
  if (!initialized) initParticleTextures();
  const base = atlas.get(kind);
  if (!base) return null;
  if (typeof tint !== 'string' || tint.length === 0) return base;
  const key = kind + '|' + tint;
  const hit = atlas.get(key);
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
  atlas.set(key, c);
  return c;
}

let particleTextureDraws = 0;
/** Probe: texture blits since the last reset. */
export function drawnParticleTextures(): number { return particleTextureDraws; }
/** Probe: reset the blit counter. */
export function resetParticleTextureCount(): void { particleTextureDraws = 0; }

let unknownKindDraws = 0;
/** Probe: draw calls with an unknown kind (all no-ops, never crash). */
export function unknownParticleKinds(): number { return unknownKindDraws; }

/**
 * Blit a pre-baked particle texture. size = full width in px, centered on
 * (x, y); alpha clamps to 1. Unknown kinds are counted and skipped — never
 * crash. Lazily initializes the atlas on first use, so callers that never
 * ran startup still get textured draws instead of the old raw shapes.
 */
export function drawParticle(
  ctx: CanvasRenderingContext2D,
  kind: string,
  x: number, y: number, size: number, alpha: number, tint?: string,
): void {
  // Hardening mirrors the old sprite draw: drawImage throws on non-positive
  // w/h, so clamp and bail on garbage instead of crashing.
  if (!(alpha > 0) || !(size > 0) || !isFinite(x + y)) return;
  const tex = particleTexture(kind, tint);
  if (!tex) { unknownKindDraws++; return; }
  const s = size < 0.001 ? 0.001 : size;
  ctx.save();
  ctx.globalAlpha = alpha > 1 ? 1 : alpha;
  ctx.drawImage(tex, x - s / 2, y - s / 2, s, s);
  ctx.restore();
  particleTextureDraws++;
}
