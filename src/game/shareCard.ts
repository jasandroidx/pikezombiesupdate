// ---------------------------------------------------------------------------
// Share card (Batch 5, S16): pure 1200x630 run-summary card, drawn with
// canvas primitives only — no external assets, no fonts to load (uses system
// serif/sans stacks). Pike County styling: near-black ground, amber/gold
// accents, skull motif.
//
// Pure module: the only DOM touch is the default canvas factory, which the
// caller can override (tests pass a mock). No engine/UI edits needed — the
// coordinator adds the share/download button and calls renderShareCard with
// the run's final stats.
//
// Usage (browser):
//   const card = renderShareCard({ score, kills, time, level, wave, title,
//     locationName, dateStr });
//   card.toBlob((b) => navigator.clipboard.write([new ClipboardItem({ "image/png": b })]));
//   // or: const a = document.createElement("a"); a.href = card.toDataURL(); a.download = "pcz-run.png"; a.click();
// ---------------------------------------------------------------------------

export interface ShareCardStats {
  score: number;
  kills: number;
  time: number; // survival seconds
  level: number;
  wave: number;
  title: string; // earned run title, e.g. "DEAD MAN'S RUN"
  locationName: string;
  dateStr: string; // display date, e.g. "2026-09-27"
}

export const SHARE_CARD_W = 1200;
export const SHARE_CARD_H = 630;

/** Injectable canvas factory — override in tests; defaults to document. */
export type CanvasFactory = () => HTMLCanvasElement;

function defaultFactory(): HTMLCanvasElement {
  return document.createElement("canvas");
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

/** Amber skull: cranium circle + jaw block + sockets + nose, all primitives. */
function drawSkull(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.strokeStyle = "#f5b942";
  ctx.fillStyle = "#f5b942";
  ctx.lineWidth = 7;
  // cranium
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // jaw block
  const jw = r * 1.05;
  const jh = r * 0.72;
  ctx.strokeRect(cx - jw / 2, cy + r * 0.42, jw, jh);
  // teeth slits
  ctx.lineWidth = 3;
  for (let i = -2; i <= 2; i++) {
    const tx = cx + (i * jw) / 5.4;
    ctx.beginPath();
    ctx.moveTo(tx, cy + r * 0.42);
    ctx.lineTo(tx, cy + r * 0.42 + jh * 0.7);
    ctx.stroke();
  }
  // eye sockets (dark punches)
  ctx.fillStyle = "#161310";
  const ey = cy - r * 0.12;
  const er = r * 0.26;
  ctx.beginPath();
  ctx.arc(cx - r * 0.38, ey, er, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.38, ey, er, 0, Math.PI * 2);
  ctx.fill();
  // nose triangle
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.18);
  ctx.lineTo(cx - r * 0.13, cy + r * 0.44);
  ctx.lineTo(cx + r * 0.13, cy + r * 0.44);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function renderShareCard(
  stats: ShareCardStats,
  makeCanvas: CanvasFactory = defaultFactory,
): HTMLCanvasElement {
  const canvas = makeCanvas();
  canvas.width = SHARE_CARD_W;
  canvas.height = SHARE_CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("shareCard: 2d context unavailable");

  const W = SHARE_CARD_W;
  const H = SHARE_CARD_H;
  const gold = "#ffd700";
  const amber = "#f5b942";
  const cream = "#f5ead6";
  const dim = "#a89f8d";

  // ground
  ctx.fillStyle = "#161310";
  ctx.fillRect(0, 0, W, H);
  // faint diagonal hazard stripes along the bottom edge (low alpha)
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = amber;
  for (let x = -H; x < W + H; x += 56) {
    ctx.beginPath();
    ctx.moveTo(x, H - 46);
    ctx.lineTo(x + 28, H - 46);
    ctx.lineTo(x + 28 - 46, H);
    ctx.lineTo(x - 46, H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // top + bottom amber rules
  ctx.fillStyle = amber;
  ctx.fillRect(0, 0, W, 10);
  ctx.fillRect(0, H - 10, W, 10);

  // masthead
  ctx.textAlign = "center";
  ctx.fillStyle = amber;
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillText("P I K E   C O U N T Y   Z O M B I E S", W / 2, 74);

  ctx.fillStyle = cream;
  ctx.font = "800 64px Georgia, 'Times New Roman', serif";
  ctx.fillText(stats.title || "SURVIVED THE COUNTY", W / 2, 142);

  ctx.fillStyle = dim;
  ctx.font = "500 24px system-ui, sans-serif";
  ctx.fillText(`${stats.locationName}  •  ${stats.dateStr}`, W / 2, 184);

  // skull between masthead and stats
  drawSkull(ctx, W / 2, 300, 74);

  // stat grid: 4 columns
  const cells: Array<[string, string]> = [
    ["SCORE", fmtNum(stats.score)],
    ["KILLS", fmtNum(stats.kills)],
    ["TIME", fmtTime(stats.time)],
    ["WAVE", String(stats.wave)],
  ];
  const gy = 470;
  const colW = W / 4;
  ctx.textAlign = "center";
  cells.forEach(([label, value], i) => {
    const x = colW * (i + 0.5);
    ctx.fillStyle = dim;
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.fillText(label, x, gy);
    ctx.fillStyle = gold;
    ctx.font = "800 52px system-ui, sans-serif";
    ctx.fillText(value, x, gy + 62);
  });

  // footer
  ctx.fillStyle = dim;
  ctx.font = "500 22px system-ui, sans-serif";
  ctx.fillText(`LEVEL ${stats.level}  •  PIKE COUNTY, INDIANA`, W / 2, H - 34);

  return canvas;
}
