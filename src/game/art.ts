export const ZOMBIE_LABELS: Record<string, string> = {
  shambler: "WILD",
  sprinter: "FERAL",
  miner_brute: "MINER",
  bloater_spitter: "BLOATER",
  behemoth: "BEHEMOTH",
  crawler: "CRAWLER",
};

const PATHS: Record<string, string> = {
  player: "/sprites/cast/player.jpg",
  shambler: "/sprites/cast/shambler.jpg",
  sprinter: "/sprites/cast/sprinter.jpg",
  miner_brute: "/sprites/cast/miner_brute.jpg",
  bloater_spitter: "/sprites/cast/bloater_spitter.jpg",
  behemoth: "/sprites/cast/behemoth.jpg",
  crawler: "/sprites/cast/crawler.jpg",
};

const cache = new Map<string, HTMLCanvasElement>();
let loaded = false;

export function isArtReady() {
  return loaded;
}

export function getSprite(id: string): HTMLCanvasElement | null {
  return cache.get(id) ?? null;
}

function keyGreen(img: HTMLImageElement) {
  const src = document.createElement("canvas");
  src.width = img.naturalWidth;
  src.height = img.naturalHeight;
  const g = src.getContext("2d");
  if (!g) return src;
  g.drawImage(img, 0, 0);
  const frame = g.getImageData(0, 0, src.width, src.height);
  const d = frame.data;
  let minX = src.width, minY = src.height, maxX = 0, maxY = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gr = d[i + 1], b = d[i + 2];
    const spill = gr - Math.max(r, b);
    if (gr > 150 && spill > 70) {
      d[i + 3] = 0;
    } else {
      if (spill > 18 && gr > r) d[i + 1] = Math.max(r, b);
      const p = i / 4;
      const x = p % src.width;
      const y = (p / src.width) | 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  g.putImageData(frame, 0, 0);
  if (maxX <= minX || maxY <= minY) return src;
  const pad = 4;
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sw = Math.min(src.width - sx, maxX - minX + pad * 2);
  const sh = Math.min(src.height - sy, maxY - minY + pad * 2);
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  out.getContext("2d")?.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

export async function loadArt() {
  if (typeof document !== "undefined" && "fonts" in document) {
    await Promise.all([
      document.fonts.load("24px Creepster"),
      document.fonts.load("64px Nosifer"),
    ]).catch(() => undefined);
  }
  await Promise.all(
    Object.entries(PATHS).map(
      ([key, src]) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = "async";
          img.onload = () => {
            cache.set(key, keyGreen(img));
            resolve();
          };
          img.onerror = () => resolve();
          img.src = src;
        }),
    ),
  );
  loaded = true;
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  id: string,
  size: number,
  hitFlash = 0,
  flipX = false,
) {
  const img = getSprite(id);
  if (!img) return false;
  const aspect = img.width / Math.max(1, img.height);
  const h = size;
  const w = size * aspect;
  ctx.save();
  if (flipX) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h + size * 0.28, w, h);
  if (hitFlash > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(0.55, hitFlash);
    ctx.drawImage(img, -w / 2, -h + size * 0.28, w, h);
  }
  ctx.restore();
  return true;
}

export function drawWildLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  time: number,
) {
  const jx = Math.sin(time * 18 + x * 0.05) * 1.4;
  const jy = Math.cos(time * 14 + y * 0.04) * 0.8;
  ctx.save();
  ctx.translate(x + jx, y + jy);
  ctx.rotate(Math.sin(time * 3 + x) * 0.04);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${size}px Creepster, Nosifer, Impact, cursive`;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(3, size * 0.16);
  ctx.strokeStyle = "#1a0404";
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = "#e11d2e";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}