/**
 * Canvas-painted sprite textures for the village ceremony: music notes that
 * float up from the drums, arrow-key caps hovering over them, and the big
 * glowing numbers carved into the answer stones. Painted with the game font
 * and repainted once it has finished loading.
 */

import * as THREE from "three";

const FONT = "Fredoka, 'Trebuchet MS', sans-serif";

function canvasTexture(size: number, paint: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    g.clearRect(0, 0, size, size);
    paint(g, size);
    tex.needsUpdate = true;
  };
  draw();
  // Reason: the Fredoka web font may still be loading; redraw once it is ready
  document.fonts?.load(`600 64px Fredoka`).then(draw, () => undefined);
  return tex;
}

/** White music note glyphs (♪ / ♫) with a dark rim, tinted per instance. */
export function noteTexture(): THREE.CanvasTexture {
  return canvasTexture(128, (g, s) => {
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `600 ${s * 0.78}px ${FONT}`;
    g.lineJoin = "round";
    g.lineWidth = s * 0.07;
    g.strokeStyle = "rgba(40, 20, 10, 0.55)";
    g.strokeText("♪", s / 2, s * 0.52);
    g.fillStyle = "#ffffff";
    g.fillText("♪", s / 2, s * 0.52);
  });
}

/** A chunky keyboard key cap with an arrow, bordered in the drum's colour. */
export function keycapTexture(glyph: string, color: string): THREE.CanvasTexture {
  return canvasTexture(128, (g, s) => {
    const r = s * 0.2;
    const box = (x: number, y: number, w: number, h: number) => {
      g.beginPath();
      g.roundRect(x, y, w, h, r);
    };
    g.fillStyle = "rgba(0,0,0,0.35)";
    box(s * 0.1, s * 0.16, s * 0.8, s * 0.8);
    g.fill();
    g.fillStyle = color;
    box(s * 0.08, s * 0.06, s * 0.84, s * 0.84);
    g.fill();
    g.fillStyle = "#fffaf0";
    box(s * 0.16, s * 0.12, s * 0.68, s * 0.66);
    g.fill();
    g.fillStyle = color;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `600 ${s * 0.6}px ${FONT}`;
    g.fillText(glyph, s / 2, s * 0.47);
  });
}

/** A number carved in light: white core, soft halo (multiplied by the material colour for bloom). */
export function numberTexture(n: number): THREE.CanvasTexture {
  return canvasTexture(256, (g, s) => {
    g.textAlign = "center";
    g.textBaseline = "middle";
    const size = n >= 10 ? s * 0.62 : s * 0.78;
    g.font = `600 ${size}px ${FONT}`;
    g.shadowColor = "rgba(255, 255, 255, 0.9)";
    g.shadowBlur = s * 0.08;
    g.lineJoin = "round";
    g.lineWidth = s * 0.05;
    g.strokeStyle = "rgba(255,255,255,0.6)";
    g.strokeText(String(n), s / 2, s * 0.54);
    g.fillStyle = "#ffffff";
    g.fillText(String(n), s / 2, s * 0.54);
  });
}

/** A fat downward arrow marking the selected answer stone. */
export function pointerTexture(): THREE.CanvasTexture {
  return canvasTexture(128, (g, s) => {
    g.beginPath();
    g.moveTo(s * 0.3, s * 0.1);
    g.lineTo(s * 0.7, s * 0.1);
    g.lineTo(s * 0.7, s * 0.45);
    g.lineTo(s * 0.9, s * 0.45);
    g.lineTo(s * 0.5, s * 0.9);
    g.lineTo(s * 0.1, s * 0.45);
    g.lineTo(s * 0.3, s * 0.45);
    g.closePath();
    g.lineJoin = "round";
    g.lineWidth = s * 0.08;
    g.strokeStyle = "#5e3a1f";
    g.stroke();
    g.fillStyle = "#ffc83d";
    g.fill();
  });
}
