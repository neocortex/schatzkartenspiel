/**
 * Procedural sprite textures for the ambient effects, painted once on 2D
 * canvases and cached: a soft glow dot, a fluffy smoke puff and an atlas of
 * butterfly wings (one species per column).
 */

import * as THREE from "three";
import { mulberry32 } from "../../core/noise";

const TAU = Math.PI * 2;
const cache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d")!);
  const tex = new THREE.CanvasTexture(canvas);
  cache.set(key, tex);
  return tex;
}

/** Soft round glow: bright core fading smoothly to transparent (use with additive blending). */
export function glowTexture(): THREE.Texture {
  return canvasTexture("glow", 64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.18, "rgba(255,255,255,0.75)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.18)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

/**
 * Cauliflower-shaped cartoon smoke puff: overlapping round lobes, each lit
 * from the upper left (RGB = baked lighting, A = soft-edged shape).
 */
export function puffTexture(): THREE.Texture {
  return canvasTexture("puff", 128, 128, (g) => {
    const rand = mulberry32(5);
    const lobes: [number, number, number][] = [[64, 72, 34]];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + rand() * 0.4;
      const d = 22 + rand() * 6;
      // Reason: squash the ring vertically and lift it so the puff has a billowing top and a flatter base
      lobes.push([64 + Math.cos(a) * d, 66 + Math.sin(a) * d * 0.8, 17 + rand() * 8]);
    }
    // Lower lobes first so the upper ones overlap them, like a cumulus
    lobes.sort((p, q) => q[1] - p[1]);
    g.filter = "blur(1.5px)";
    for (const [x, y, r] of lobes) {
      const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.65, "#d9dbe1");
      grad.addColorStop(1, "#a3a7b2");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
  });
}

type WingPainter = (g: CanvasRenderingContext2D, fore: Path2D, hind: Path2D) => void;

/** Forewing and hindwing outlines of a right wing in a 128×128 cell (x: body → tip, y: front → back). */
function wingPaths(): { fore: Path2D; hind: Path2D } {
  const fore = new Path2D();
  fore.moveTo(4, 30);
  fore.bezierCurveTo(30, 4, 90, 2, 124, 14);
  fore.bezierCurveTo(127, 36, 110, 60, 84, 67);
  fore.bezierCurveTo(60, 72, 30, 67, 5, 62);
  fore.closePath();
  const hind = new Path2D();
  hind.moveTo(5, 56);
  hind.bezierCurveTo(40, 52, 90, 64, 94, 88);
  hind.bezierCurveTo(96, 110, 70, 125, 46, 123);
  hind.bezierCurveTo(22, 121, 7, 100, 4, 78);
  hind.closePath();
  return { fore, hind };
}

function radial(g: CanvasRenderingContext2D, inner: string, outer: string): CanvasGradient {
  const grad = g.createRadialGradient(0, 60, 4, 0, 60, 125);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  return grad;
}

function veins(g: CanvasRenderingContext2D, color: string, width: number): void {
  g.strokeStyle = color;
  g.lineWidth = width;
  const ends: [number, number][] = [[120, 16], [112, 40], [92, 62], [64, 68], [90, 90], [70, 118], [40, 120]];
  for (const [x, y] of ends) {
    g.beginPath();
    g.moveTo(4, 58);
    g.quadraticCurveTo(x * 0.5, y * 0.5 + 26, x, y);
    g.stroke();
  }
}

/** Orange monarch, sky-blue, lemon brimstone and cabbage white. */
const SPECIES: WingPainter[] = [
  (g, fore, hind) => {
    g.fillStyle = radial(g, "#ffb347", "#f06a0a");
    g.fill(fore);
    g.fill(hind);
    g.save();
    g.clip(fore);
    veins(g, "#1b1208", 2.2);
    g.restore();
    g.save();
    g.clip(hind);
    veins(g, "#1b1208", 2.2);
    g.restore();
    g.lineWidth = 9;
    g.strokeStyle = "#1b1208";
    g.stroke(fore);
    g.stroke(hind);
    g.fillStyle = "#ffffff";
    for (const [x, y] of [[112, 22], [104, 50], [86, 62], [90, 92], [76, 114], [54, 120], [118, 32]]) {
      g.beginPath();
      g.arc(x, y, 2.4, 0, TAU);
      g.fill();
    }
  },
  (g, fore, hind) => {
    g.fillStyle = radial(g, "#1d3fe0", "#5fd6ff");
    g.fill(fore);
    g.fill(hind);
    g.lineWidth = 6;
    g.strokeStyle = "#101a3a";
    g.stroke(fore);
    g.stroke(hind);
    g.lineWidth = 1.5;
    g.strokeStyle = "#ffffff";
    g.stroke(fore);
    g.stroke(hind);
  },
  (g, fore, hind) => {
    g.fillStyle = radial(g, "#ffd21c", "#fff27a");
    g.fill(fore);
    g.fill(hind);
    g.fillStyle = "#ff8a00";
    for (const [x, y, r] of [[58, 40, 5], [52, 92, 4]]) {
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    g.lineWidth = 3;
    g.strokeStyle = "#c79a00";
    g.stroke(fore);
    g.stroke(hind);
  },
  (g, fore, hind) => {
    g.fillStyle = radial(g, "#f2f2e6", "#ffffff");
    g.fill(fore);
    g.fill(hind);
    g.save();
    g.clip(fore);
    g.fillStyle = "#26262a";
    g.beginPath();
    g.arc(128, 6, 34, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(70, 42, 6, 0, TAU);
    g.fill();
    g.restore();
    g.lineWidth = 2;
    g.strokeStyle = "#9a9a90";
    g.stroke(fore);
    g.stroke(hind);
  },
];

/** Number of butterfly species (columns) in the wing atlas. */
export const WING_SPECIES = SPECIES.length;

/** Butterfly wing atlas: one right wing per column, shape in alpha (mirror for the left wing). */
export function wingAtlas(): THREE.Texture {
  const tex = canvasTexture("wings", 128 * SPECIES.length, 128, (g) => {
    const { fore, hind } = wingPaths();
    SPECIES.forEach((paint, i) => {
      g.save();
      g.translate(i * 128, 0);
      g.beginPath();
      g.rect(0, 0, 128, 128);
      g.clip();
      paint(g, fore, hind);
      g.restore();
    });
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
