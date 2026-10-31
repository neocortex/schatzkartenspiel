/**
 * The glowing starfish of the safe trail: a chubby five-armed starfish with pale
 * knobs on its back, floating half out of the water, and a soft glow in the water
 * around it. Each one is an instance of two instanced meshes, so the
 * whole trail costs two draw calls. An instance's colour sets how bright it
 * shines, which is how the course makes the light pulse along the trail.
 */

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { merge, part } from "../../core/geo";
import { glowTexture } from "../../world/ambient/textures";
import { Bin } from "../ogre/kit";

const CORAL = new THREE.Color("#ff4a24");
const TIP = new THREE.Color("#ff8a3c");
const KNOB = new THREE.Color("#ffe3b0");

const ARMS = 5;
/** How far the notches between the arms reach in, as a share of the arm's length. */
const WAIST = 0.34;

/** Distance of the outline from the middle at angle `a` (an arm points straight up at a = π/2). */
function outlineRadius(a: number): number {
  const arm = Math.max(0, 0.5 + 0.5 * Math.cos(ARMS * (a - Math.PI / 2)));
  return WAIST + (1 - WAIST) * Math.pow(arm, 1.5);
}

/** One starfish, about 2 units across, lying in the x-y plane with its back towards +z. */
function starfishGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const steps = 50;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = outlineRadius(a);
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const extruded = new THREE.ExtrudeGeometry(shape, { depth: 0.1, curveSegments: 1, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 2 });
  extruded.deleteAttribute("uv");
  extruded.deleteAttribute("normal");
  // Reason: without welding, every bevel step shades as a hard band; a starfish should look soft and chubby
  const body = mergeVertices(extruded, 1e-4);
  body.computeVertexNormals();
  body.center();
  const c = new THREE.Color();
  const parts = [part(body, (p) => c.copy(CORAL).lerp(TIP, THREE.MathUtils.smoothstep(Math.hypot(p.x, p.y), 0.25, 1)))];
  // Pale knobs down each arm and a small ring of them in the middle
  const knob = new THREE.SphereGeometry(1, 6, 5);
  const add = (a: number, r: number, size: number) => parts.push(part(knob.clone(), KNOB, { pos: [Math.cos(a) * r, Math.sin(a) * r, 0.13], scale: [size, size, size * 0.6] }));
  for (let i = 0; i < ARMS; i++) {
    const a = Math.PI / 2 + (i / ARMS) * Math.PI * 2;
    add(a, 0.28, 0.1);
    add(a, 0.5, 0.085);
    add(a, 0.72, 0.065);
  }
  return merge(parts);
}

export interface StarfishTrail {
  fish: THREE.InstancedMesh;
  glow: THREE.InstancedMesh;
}

/** The two instanced meshes of a trail with `count` starfish (positioned by the course each frame). */
export function createStarfishTrail(count: number, bin: Bin): StarfishTrail {
  const material = bin.material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, emissive: "#ffffff", emissiveIntensity: 0.5 }));
  material.onBeforeCompile = (shader) => {
    // Reason: emissive light normally ignores vertex and instance colours; multiplying them in lets the painted body glow and pulse
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;");
  };
  const fish = new THREE.InstancedMesh(starfishGeometry(), material, count);
  fish.name = "starfish";

  const glowMaterial = bin.material(
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: "#ffa050", transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
  );
  const glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glowMaterial, count);
  glow.name = "starfishGlow";
  // Reason: above the sea (order 1) so it reads as light in the water, under the giant waves (order 3) that roll over it
  glow.renderOrder = 2;

  const white = new THREE.Color(1, 1, 1);
  for (const mesh of [fish, glow]) {
    mesh.frustumCulled = false;
    // Reason: the shader only reads instance colours if they exist before its first compile
    for (let i = 0; i < count; i++) mesh.setColorAt(i, white);
  }
  return { fish, glow };
}
