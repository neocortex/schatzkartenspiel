/**
 * Sign lettering. All sign texts are drawn into one canvas atlas so every
 * label on the island renders with a single material; each label gets its own
 * cell (shelf-packed) and signs reference it through UVs on a small quad.
 */

import * as THREE from "three";

const ATLAS_W = 2048;
const ATLAS_H = 1024;
const ROW = 128;
const FONT = "Fredoka, 'Trebuchet MS', sans-serif";

interface Cell {
  label: string;
  x: number;
  y: number;
  w: number;
  ink: string;
}

export class SignAtlas {
  readonly canvas = document.createElement("canvas");
  readonly texture: THREE.CanvasTexture;
  readonly material: THREE.MeshStandardMaterial;
  private cells = new Map<string, Cell>();
  private cursorX = 0;
  private cursorY = 0;

  constructor() {
    this.canvas.width = ATLAS_W;
    this.canvas.height = ATLAS_H;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = new THREE.MeshStandardMaterial({ map: this.texture, alphaTest: 0.45, roughness: 0.85 });
    // Reason: the game font loads asynchronously; redraw once it is available
    document.fonts?.load(`600 80px Fredoka`).then(() => this.draw(), () => undefined);
  }

  /**
   * A quad (centred at the origin, facing +z) showing `label` at w × h world
   * units. Labels with the same text and colour share one atlas cell.
   */
  quad(label: string, w: number, h: number, ink = "#3b2313"): THREE.BufferGeometry {
    const cell = this.cell(label, w / h, ink);
    const u0 = cell.x / ATLAS_W;
    const u1 = (cell.x + cell.w) / ATLAS_W;
    // Reason: CanvasTexture is flipped, so canvas row y maps to v = 1 - y / size
    const v1 = 1 - cell.y / ATLAS_H;
    const v0 = 1 - (cell.y + ROW) / ATLAS_H;
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    return g.toNonIndexed();
  }

  private cell(label: string, aspect: number, ink: string): Cell {
    const key = `${label}|${ink}`;
    let cell = this.cells.get(key);
    if (cell) return cell;
    const w = Math.min(ATLAS_W, Math.round(ROW * aspect));
    if (this.cursorX + w > ATLAS_W) {
      this.cursorX = 0;
      this.cursorY += ROW;
    }
    if (this.cursorY + ROW > ATLAS_H) throw new Error(`SignAtlas full, cannot add "${label}"`);
    cell = { label, x: this.cursorX, y: this.cursorY, w, ink };
    this.cursorX += w;
    this.cells.set(key, cell);
    return cell;
  }

  /** Paint every registered label into its cell (call after all signs are built). */
  draw(): void {
    const ctx = this.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const c of this.cells.values()) {
      let size = ROW * 0.72;
      ctx.font = `600 ${size}px ${FONT}`;
      const width = ctx.measureText(c.label).width;
      // Reason: shrink long labels so they fit their cell with a small margin
      if (width > c.w * 0.9) size *= (c.w * 0.9) / width;
      ctx.font = `600 ${size}px ${FONT}`;
      ctx.lineJoin = "round";
      ctx.lineWidth = size * 0.12;
      ctx.strokeStyle = "rgba(255, 244, 220, 0.9)";
      ctx.fillStyle = c.ink;
      const cx = c.x + c.w / 2;
      const cy = c.y + ROW / 2 + size * 0.04;
      if (c.ink !== "#ffffff") ctx.strokeText(c.label, cx, cy);
      ctx.fillText(c.label, cx, cy);
    }
    this.texture.needsUpdate = true;
  }
}
