// Batch 10 (Lane 2): corner minimap — a second orthographic camera.
//
// Renders the whole scene top-down into a small corner canvas: player dot,
// zombie dots color-coded by type, objective/hole markers, boss icon.
// Entity positions come from the engine via the existing window.__controlsTest
// probe pattern (getWorld + objectives9) — no sim code, no engine changes.
// Cheap by design: fillRect dots, ~10Hz refresh, DPR-aware, capped dot count.

export interface MinimapZombie {
  x: number;
  y: number;
  type: string;
}

export interface MinimapObjective {
  kind: string; // 'hole' | 'shrine' | 'workbench'
  x: number;
  y: number;
}

export interface MinimapWorld {
  mapW: number;
  mapH: number;
  player: { x: number; y: number; alive: boolean } | null;
  zombies: MinimapZombie[];
  objectives: MinimapObjective[];
}

export type MinimapSource = () => MinimapWorld | null;

/** Zombie type → minimap dot color. */
export const MINIMAP_ZOMBIE_COLORS: Record<string, string> = {
  shambler: '#e5484d',
  sprinter: '#f76b15',
  crawler: '#e5a13c',
  bloater: '#8ec255',
  bomber: '#ff6369',
  riot: '#9e8cff',
  miner_brute: '#d4a017',
  behemoth: '#ff2e4d',
  haint: '#b8b8ff',
  illusionist: '#e879f9',
};
export const MINIMAP_ZOMBIE_DEFAULT = '#e5484d';

export function zombieDotColor(type: string): string {
  return MINIMAP_ZOMBIE_COLORS[type] ?? MINIMAP_ZOMBIE_DEFAULT;
}

/** Types that render as a boss icon instead of a plain dot. */
const MINIMAP_BOSS_TYPES = new Set(['behemoth']);

export function isBossType(type: string): boolean {
  return MINIMAP_BOSS_TYPES.has(type);
}

export const MINIMAP_OBJECTIVE_COLORS: Record<string, string> = {
  hole: '#ffd23f',
  shrine: '#d4a017',
  workbench: '#4cc3ff',
};

/**
 * Pure world → minimap mapping. The map is aspect-fit into a `size`×`size`
 * square and centered; returns CSS-pixel coordinates within the square.
 */
export function worldToMinimap(
  x: number,
  y: number,
  mapW: number,
  mapH: number,
  size: number,
): { x: number; y: number } {
  const s = size / Math.max(1, Math.max(mapW, mapH));
  const ox = (size - mapW * s) / 2;
  const oy = (size - mapH * s) / 2;
  return { x: ox + x * s, y: oy + y * s };
}

/**
 * Default state source: reads the live engine through the existing
 * window.__controlsTest probe (getWorld for player/zombies/map, objectives9
 * for open holes / shrines / workbench). Null when the probe is absent, so the
 * minimap idles instead of crashing on menus.
 */
export function probeWorldSource(): MinimapWorld | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  const ct = w.__controlsTest as {
    getWorld?: () => {
      alive: boolean; x: number; y: number;
      zombies: { x: number; y: number; type: string }[];
      map: { w: number; h: number };
    };
    objectives9?: () => { kind: string; x: number; y: number }[];
  } | undefined;
  if (!ct || typeof ct.getWorld !== 'function') return null;
  let g: ReturnType<NonNullable<typeof ct.getWorld>>;
  try {
    g = ct.getWorld();
  } catch {
    return null;
  }
  if (!g || !g.map) return null;
  let objectives: MinimapObjective[] = [];
  if (typeof ct.objectives9 === 'function') {
    try {
      objectives = (ct.objectives9() || []).map((o) => ({ kind: o.kind, x: o.x, y: o.y }));
    } catch {
      objectives = [];
    }
  }
  return {
    mapW: g.map.w,
    mapH: g.map.h,
    player: { x: g.x, y: g.y, alive: g.alive },
    zombies: (g.zombies || []).map((z) => ({ x: z.x, y: z.y, type: z.type })),
    objectives,
  };
}

export interface MinimapDebug {
  player: { x: number; y: number } | null;
  zombies: number;
  bosses: number;
  objectives: number;
  size: number;
}

export interface MinimapOptions {
  /** CSS-pixel square size. */
  size?: number;
  /** State source; defaults to the engine probe. */
  source?: MinimapSource;
  /** Refresh rate; ~10Hz keeps it cheap. */
  hz?: number;
  /** Max zombie dots per frame. */
  maxDots?: number;
}

/**
 * Owns a <canvas> and repaints the minimap on a ~10Hz timer. DPR-aware:
 * backing store is size × devicePixelRatio, drawing happens in CSS pixels.
 * No per-frame allocations in the dot loops (inline math, no temp objects).
 */
export class MinimapController {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private source: MinimapSource;
  private size: number;
  private hz: number;
  private maxDots: number;
  private timer = 0;
  private last: MinimapDebug = { player: null, zombies: 0, bosses: 0, objectives: 0, size: 0 };

  constructor(canvas: HTMLCanvasElement, opts: MinimapOptions = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.source = opts.source ?? probeWorldSource;
    this.size = opts.size ?? 148;
    this.hz = opts.hz ?? 10;
    this.maxDots = opts.maxDots ?? 800;
  }

  start(): void {
    this.stop();
    this.render();
    if (typeof window === 'undefined') return;
    this.timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      this.render();
    }, Math.max(50, 1000 / this.hz));
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  }

  /** Last rendered frame summary (test probe). */
  debugInfo(): MinimapDebug {
    return { ...this.last, player: this.last.player ? { ...this.last.player } : null };
  }

  render(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const size = this.size;
    const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const px = Math.max(1, Math.round(size * dpr));
    if (this.canvas.width !== px || this.canvas.height !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const world = this.source();

    // Frame background + border.
    ctx.fillStyle = 'rgba(8, 10, 8, 0.85)';
    ctx.fillRect(0, 0, size, size);

    if (!world || world.mapW <= 0 || world.mapH <= 0) {
      this.last = { player: null, zombies: 0, bosses: 0, objectives: 0, size };
      return;
    }

    const s = size / Math.max(world.mapW, world.mapH);
    const ox = (size - world.mapW * s) / 2;
    const oy = (size - world.mapH * s) / 2;

    // Objective / hole markers (under entities).
    let objectives = 0;
    for (let i = 0; i < world.objectives.length; i++) {
      const o = world.objectives[i];
      const color = MINIMAP_OBJECTIVE_COLORS[o.kind] ?? '#ffffff';
      const x = ox + o.x * s;
      const y = oy + o.y * s;
      ctx.fillStyle = color;
      if (o.kind === 'shrine') {
        // Diamond.
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 4, y);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 4, y);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(x - 3, y - 3, 6, 6);
      }
      objectives++;
    }

    // Zombie dots, color-coded by type; bosses get a bigger diamond + ring.
    let zombies = 0;
    let bosses = 0;
    const n = Math.min(world.zombies.length, this.maxDots);
    for (let i = 0; i < n; i++) {
      const z = world.zombies[i];
      const x = ox + z.x * s;
      const y = oy + z.y * s;
      if (x < -6 || y < -6 || x > size + 6 || y > size + 6) continue;
      if (isBossType(z.type)) {
        bosses++;
        ctx.fillStyle = '#ff2e4d';
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + 6, y);
        ctx.lineTo(x, y + 6);
        ctx.lineTo(x - 6, y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 46, 77, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = zombieDotColor(z.type);
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
      zombies++;
    }

    // Player dot on top: white core, green ring.
    let player: { x: number; y: number } | null = null;
    if (world.player) {
      const x = ox + world.player.x * s;
      const y = oy + world.player.y * s;
      player = { x, y };
      ctx.fillStyle = world.player.alive ? '#ffffff' : '#6b7280';
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (world.player.alive) {
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = 'rgba(212, 160, 23, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

    this.last = { player, zombies, bosses, objectives, size };
  }
}
