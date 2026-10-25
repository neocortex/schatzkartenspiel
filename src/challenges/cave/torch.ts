/**
 * Tadeo's torch: a wooden stick with a flickering flame held in his right
 * hand, a warm shadow-casting point light that follows the flame, soft glow
 * halos and a stream of embers. The light's flicker is layered sine noise so
 * shadows breathe gently instead of strobing.
 */

import * as THREE from "three";
import { mat, toonMesh } from "../../characters/parts";
import { Humanoid } from "../../characters/Humanoid";
import { flameGeometry } from "../../world/models/effects";
import { Bursts } from "../shared/bursts";

const BASE_INTENSITY = 7;

export class Torch {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;
  /** Extra brightness multiplier (the altar scene dims the torch). */
  boost = 1;
  private flame: THREE.Mesh;
  private halo: THREE.Sprite;
  private core: THREE.Sprite;
  private emberTimer = 0;
  private tip = new THREE.Vector3();
  private smoothTip = new THREE.Vector3();
  private first = true;
  private emberAt = new THREE.Vector3();
  private up = new THREE.Vector3(0, 0.25, 0);

  constructor(
    private avatar: Humanoid,
    glowTex: THREE.Texture,
    private embers: Bursts,
    owned: THREE.Material[],
  ) {
    const stick = toonMesh(new THREE.CylinderGeometry(0.035, 0.045, 0.62, 7), mat("#7a4a2a", 0.8));
    stick.position.y = 0.2;
    const wrap = toonMesh(new THREE.CylinderGeometry(0.075, 0.06, 0.16, 8), mat("#4a2e1c", 0.9));
    wrap.position.y = 0.52;
    for (const m of [stick, wrap]) m.castShadow = false;
    this.group.add(stick, wrap);

    const flameMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(0.55, 0.55, 0.55), toneMapped: false });
    this.flame = new THREE.Mesh(flameGeometry(), flameMat);
    this.flame.position.y = 0.56;
    this.group.add(this.flame);

    const spriteMat = (color: THREE.Color, opacity: number) =>
      new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const coreMat = spriteMat(new THREE.Color(2.0, 1.1, 0.4), 0.55);
    const haloMat = spriteMat(new THREE.Color(1.0, 0.45, 0.12), 0.25);
    owned.push(flameMat, coreMat, haloMat);
    this.core = new THREE.Sprite(coreMat);
    this.core.scale.setScalar(0.45);
    this.core.position.y = 0.66;
    this.halo = new THREE.Sprite(haloMat);
    this.halo.scale.setScalar(1.8);
    this.halo.position.y = 0.66;
    this.group.add(this.core, this.halo);

    // Reason: the torch is held in front of the body, tilted back up so it stands upright
    this.group.rotation.set(0.95, 0, -0.2);
    avatar.handR.add(this.group);
    // Reason: Tadeo stands right under the light; his own shadow would swallow the scene (the blob shadow grounds him)
    avatar.root.traverse((o) => (o.castShadow = false));

    // Reason: hung well above the flame with a linear falloff, the light pools on the floor around Tadeo
    // without blowing out his hair, which is much closer to the flame than the floor is
    this.light = new THREE.PointLight("#ff9a45", BASE_INTENSITY, 16, 1);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(512, 512);
    this.light.shadow.camera.near = 0.15;
    this.light.shadow.camera.far = 16;
    this.light.shadow.bias = -0.003;
    this.light.shadow.normalBias = 0.06;
  }

  /** Hold the torch up in front (call after the avatar's own animation). */
  pose(holding: boolean): void {
    this.group.visible = holding;
    if (!holding) return;
    const a = this.avatar;
    a.armR.rotation.x = -0.95 + Math.sin(performance.now() * 0.004) * 0.03;
    a.armR.rotation.z = 0.28;
  }

  update(dt: number, time: number): void {
    const flick =
      Math.sin(time * 9.7) * 0.06 + Math.sin(time * 15.3 + 1.3) * 0.05 + Math.sin(time * 23.1 + 0.4) * 0.03 + (Math.random() - 0.5) * 0.04;
    this.flame.scale.set(0.42 - flick * 0.2, 0.46 + flick * 0.7, 0.42 - flick * 0.2);
    this.core.scale.setScalar(0.45 + flick * 0.4);
    this.light.intensity = BASE_INTENSITY * (1 + flick) * this.boost;

    this.flame.getWorldPosition(this.tip);
    this.tip.y = this.avatar.root.position.y + 3.6;
    // Reason: smooth the light position a little so walking bobs don't jitter every shadow
    if (this.first) this.smoothTip.copy(this.tip);
    this.first = false;
    this.smoothTip.lerp(this.tip, 1 - Math.exp(-dt * 18));
    this.light.position.copy(this.smoothTip);

    this.emberTimer -= dt;
    if (this.emberTimer <= 0 && this.group.visible) {
      this.emberTimer = 0.07 + Math.random() * 0.08;
      this.embers.emit(this.flame.getWorldPosition(this.emberAt).add(this.up), {
        count: 1,
        color: new THREE.Color(3.5, 1.4, 0.35),
        speed: [0.1, 0.4],
        up: 1.1,
        life: [0.6, 1.1],
        size: [0.05, 0.09],
        grow: 0.3,
        gravity: -0.4,
        drag: 0.8,
        spread: 0.1,
      });
    }
  }
}
