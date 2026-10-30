/**
 * The canvas side of the old cave art: every picture is drawn with hand-dabbed strokes
 * on smoothed ochre rock and worn away a little, so it looks rubbed on by people long ago.
 */

import * as THREE from "three";
import { mulberry32 } from "../../core/noise";

const CHARCOAL = "#1d110b";
const OCHRE = "#b8682a";
const LAVA = "#d9321a";
const FIRE_YELLOW = "#eeb02e";
const SNOW = "#ece6d8";
const SLATE = "#46506f";
const EARTH = "#6a3820";
export const WIDTH = 512;
export const HEIGHT = 300;

export type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

// ── Drawing with a shaky hand ─────────────────────────────────

/** A line dabbed on with a thick brush: a few passes that never quite agree. */
function brush(ctx: Ctx, pts: Pt[], width: number, color: string, rand: () => number, close = false): void {
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let pass = 0; pass < 3; pass++) {
    ctx.globalAlpha = pass === 0 ? 1 : 0.55;
    ctx.lineWidth = width * (1 - pass * 0.14);
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const jx = x + (rand() - 0.5) * width * 0.34;
      const jy = y + (rand() - 0.5) * width * 0.34;
      if (i === 0) ctx.moveTo(jx, jy);
      else ctx.lineTo(jx, jy);
    });
    if (close) ctx.closePath();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** A filled shape with a thick charcoal outline. */
function shape(ctx: Ctx, pts: Pt[], fill: string, rand: () => number, outline = 8): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
  if (outline > 0) brush(ctx, pts, outline, CHARCOAL, rand, true);
}

/** Smoothed patch of ochre-rubbed rock the people painted on, its edge fading into the raw stone. */
function primer(ctx: Ctx, w: number, h: number, rand: () => number): void {
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand());
    const x = w / 2 + Math.cos(a) * d * w * 0.4;
    const y = h / 2 + Math.sin(a) * d * h * 0.38;
    const r = 34 + rand() * 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(156, 114, 74, 0.42)");
    g.addColorStop(1, "rgba(156, 114, 74, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Time eats the paint: grainy pigment, faded blotches, small flakes and a few long scratches where the bare rock shows through. */
function wear(ctx: Ctx, w: number, h: number, rand: () => number): void {
  // Reason: rock-coloured grain only on the paint itself makes the fills look rubbed in by hand, not printed
  ctx.globalCompositeOperation = "source-atop";
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = rand() < 0.6 ? "rgba(58, 36, 24, 0.3)" : "rgba(214, 178, 132, 0.16)";
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, 0.7 + rand() * 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 70; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 8 + rand() * 22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0, 0, 0, ${0.08 + rand() * 0.16})`);
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 420; i++) {
    ctx.globalAlpha = 0.14 + rand() * 0.4;
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, 0.8 + rand() * 2.8, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
  }
  ctx.strokeStyle = "#000";
  for (let i = 0; i < 5; i++) {
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1.5 + rand() * 2;
    const x = rand() * w;
    const y = rand() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 120, y + (rand() - 0.5) * 60);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/** Under each test picture: its number as big dots, then a diamond in its crystal's colour. */
export function marks(ctx: Ctx, count: number, crystal: string, rand: () => number): void {
  const y = 264;
  const left = 256 - (count * 34 + 60) / 2;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = CHARCOAL;
    ctx.beginPath();
    ctx.arc(left + 13 + i * 34, y + (rand() - 0.5) * 3, 13, 0, Math.PI * 2);
    ctx.fill();
  }
  const cx = left + count * 34 + 34;
  shape(ctx, [[cx, y - 25], [cx + 21, y], [cx, y + 25], [cx - 21, y]], crystal, rand, 6);
}

// ── The pictures ──────────────────────────────────────────────

export function drawVolcano(ctx: Ctx, rand: () => number): void {
  // Smoke curling out of the top
  brush(ctx, [[256, 62], [228, 44], [246, 26], [276, 30], [282, 16]], 9, "#4e3d3a", rand);
  shape(ctx, [[46, 232], [186, 86], [228, 100], [256, 88], [288, 102], [326, 86], [466, 232]], EARTH, rand, 9);
  // Lava runs down the sides, bright and thick so the colour carries across the hall
  shape(ctx, [[226, 92], [290, 94], [302, 134], [278, 124], [288, 188], [256, 142], [236, 228], [226, 142], [196, 170], [214, 118]], LAVA, rand, 0);
  brush(ctx, [[246, 104], [252, 140], [242, 190]], 9, FIRE_YELLOW, rand);
  brush(ctx, [[272, 104], [278, 136]], 8, FIRE_YELLOW, rand);
  // Fire thrown up from the crater
  shape(ctx, [[214, 94], [224, 50], [240, 76], [256, 26], [274, 74], [290, 48], [298, 94]], LAVA, rand, 6);
  shape(ctx, [[238, 92], [246, 66], [256, 54], [266, 66], [274, 92]], FIRE_YELLOW, rand, 0);
  for (const [x, y, r] of [[176, 54, 9], [336, 50, 10], [146, 92, 7], [368, 88, 7], [200, 26, 6], [318, 22, 6]]) {
    ctx.fillStyle = LAVA;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawPeak(ctx: Ctx, rand: () => number): void {
  // A smaller peak behind, so the great one looks tall
  shape(ctx, [[286, 232], [392, 92], [492, 232]], "#5e6786", rand, 8);
  shape(ctx, [[370, 120], [392, 92], [416, 124], [398, 116], [386, 134]], SNOW, rand, 0);
  shape(ctx, [[24, 232], [214, 22], [402, 232]], SLATE, rand, 9);
  // The great snow cap, reaching far down and cut in sharp teeth
  shape(ctx, [[214, 22], [320, 138], [288, 120], [272, 164], [244, 124], [214, 176], [186, 122], [160, 160], [142, 118], [108, 138]], SNOW, rand, 7);
  // Soft blue shade down one side of the snow
  brush(ctx, [[232, 58], [272, 112]], 8, "#a9bfdc", rand);
}

export function drawForest(ctx: Ctx, rand: () => number): void {
  const tree = (x: number, base: number, h: number, w: number, green: string) => {
    brush(ctx, [[x, base], [x, base - h * 0.2]], 13, "#5b3518", rand);
    const levels = 3;
    for (let i = 0; i < levels; i++) {
      const y0 = base - h * (0.14 + i * 0.27);
      const half = (w / 2) * (1 - i * 0.24);
      const y1 = y0 - h * 0.44;
      shape(ctx, [[x - half, y0], [x, y1], [x + half, y0]], green, rand, 6);
    }
  };
  tree(78, 232, 150, 112, "#2c8c3a");
  tree(434, 232, 158, 116, "#2c8c3a");
  tree(170, 234, 196, 136, "#237f33");
  tree(342, 234, 186, 132, "#237f33");
  tree(256, 236, 226, 150, "#37a646");
}

export function drawHeart(ctx: Ctx, rand: () => number): void {
  // The heart glows in its hollow at the foot of the volcano
  shape(ctx, [[40, 268], [176, 170], [214, 182], [256, 170], [296, 182], [336, 170], [472, 268]], EARTH, rand, 8);
  for (let i = 0; i < 11; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    brush(ctx, [[256 + Math.cos(a) * 104, 118 + Math.sin(a) * 104], [256 + Math.cos(a) * 138, 118 + Math.sin(a) * 138]], 8, OCHRE, rand);
  }
  const heart: Pt[] = [[256, 216], [176, 136], [168, 92], [198, 64], [232, 70], [256, 100], [280, 70], [314, 64], [344, 92], [336, 136]];
  shape(ctx, heart, LAVA, rand, 9);
  brush(ctx, [[200, 92], [216, 82]], 9, FIRE_YELLOW, rand);
}

export function drawThorns(ctx: Ctx, rand: () => number): void {
  const vine = (pts: Pt[], color: string) => {
    brush(ctx, pts, 13, color, rand);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x, y] = pts[i];
      const [nx, ny] = pts[i + 1];
      const mx = (x + nx) / 2;
      const my = (y + ny) / 2;
      const sign = i % 2 ? 1 : -1;
      shape(ctx, [[mx - 12, my], [mx + sign * 8, my + sign * 34], [mx + 12, my]], CHARCOAL, rand, 0);
    }
  };
  vine([[20, 200], [110, 130], [190, 208], [280, 132], [368, 206], [490, 128]], "#3f5a26");
  vine([[20, 100], [120, 44], [220, 112], [320, 40], [420, 104], [490, 60]], "#54401f");
  // The blue sword that passes through them
  shape(ctx, [[244, 280], [244, 92], [256, 60], [268, 92], [268, 280]], "#7cc4e6", rand, 7);
  shape(ctx, [[204, 218], [308, 218], [308, 238], [204, 238]], FIRE_YELLOW, rand, 6);
}

export function drawHammer(ctx: Ctx, rand: () => number): void {
  shape(ctx, [[40, 272], [172, 150], [214, 188], [302, 94], [472, 272]], SLATE, rand, 8);
  shape(ctx, [[302, 94], [362, 158], [338, 148], [318, 182], [296, 150], [270, 176], [256, 142]], SNOW, rand, 6);
  // The golden hammer above the summit, its handle pale against the mountain
  brush(ctx, [[112, 232], [196, 98]], 28, CHARCOAL, rand);
  brush(ctx, [[112, 232], [196, 98]], 16, "#c08a4a", rand);
  shape(ctx, [[148, 56], [258, 106], [234, 150], [122, 96]], FIRE_YELLOW, rand, 9);
}

export function paintingTexture(draw: (ctx: Ctx, rand: () => number) => void, seed: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const rand = mulberry32(seed);
  primer(ctx, WIDTH, HEIGHT, rand);
  draw(ctx, rand);
  wear(ctx, WIDTH, HEIGHT, rand);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function arrowTexture(seed: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  const rand = mulberry32(seed);
  brush(ctx, [[14, 48], [96, 48]], 14, OCHRE, rand);
  shape(ctx, [[72, 16], [118, 48], [72, 80]], OCHRE, rand, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
