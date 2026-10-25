/**
 * Old-mine dressing for the entrance tunnel: rails running in from the cave
 * mouth, timber supports, a mine cart full of crystals and a few crates.
 * Built from the island's prop models and merged into two meshes (lit
 * wood/iron with baked glow, and glowing crystals).
 */

import * as THREE from "three";
import { merge } from "../../core/geo";
import { mulberry32 } from "../../core/noise";
import { Colliders } from "../../world/Colliders";
import { crate, mineCart } from "../../world/models/props";
import { Model, PAL, addModel, box, beam, emptyModel, placeAt, rbox, tint } from "../../world/models/shapes";
import { CaveField, cellPos } from "./layout";
import { GlowField, crystalMaterial, rockMaterial } from "./materials";

export function buildMine(field: CaveField, glow: GlowField, colliders: Colliders, time: { value: number }, owned: THREE.Material[]): THREE.Group {
  const rand = mulberry32(51);
  const m = emptyModel();
  const ground = (x: number, z: number) => field.heightAt(x, z);
  const [rx] = cellPos(8, 0);
  const [, zStart] = cellPos(8, 20.2);
  const [, zEnd] = cellPos(8, 15.75);

  // Rails and sleepers from the mouth up to the first gate
  for (let z = zEnd; z < zStart; z += 0.62) {
    m.solid.push(box(1.5, 0.08, 0.26, tint(PAL.woodDark, rand), { pos: [rx, ground(rx, z) + 0.04, z], rot: [0, (rand() - 0.5) * 0.12, 0] }));
  }
  for (const sx of [-0.5, 0.5]) {
    for (let z = zEnd; z < zStart - 0.6; z += 0.6) {
      const a: [number, number, number] = [rx + sx, ground(rx + sx, z) + 0.13, z];
      const b: [number, number, number] = [rx + sx, ground(rx + sx, z + 0.6) + 0.13, z + 0.6];
      m.solid.push(beam(a, b, 0.07, "#6c6f7c", 0.09));
    }
  }

  // Timber supports across the tunnel
  for (const row of [18.45, 16.4]) {
    const [, z] = cellPos(8, row);
    for (const sx of [-1, 1]) {
      m.solid.push(rbox(0.3, 2.4, 0.3, tint("#6d4f36", rand), { pos: [rx + sx * 1.45, 1.2, z] }, 0.04));
    }
    m.solid.push(rbox(3.4, 0.28, 0.32, tint("#6d4f36", rand), { pos: [rx, 2.4, z] }, 0.05));
  }

  // Mine cart full of crystals in the east bulge, crates beside it
  const [cx, cz] = cellPos(10.1, 17);
  addModel(m, mineCart(3), placeAt(cx, ground(cx, cz), cz, 0.3, 1.1));
  colliders.add(cx, cz, 0.9);
  glow.add(new THREE.Vector3(cx, 1.4, cz), "#8fd8ff", 4.5, 1.2);
  const crates: [number, number, number][] = [
    [10.15, 17.55, 0.75],
    [9.75, 17.62, 0.6],
    [6.2, 17.75, 0.7],
  ];
  crates.forEach(([c, r, s], i) => {
    const [x, z] = cellPos(c, r);
    addModel(m, crate(i + 2, s), placeAt(x, ground(x, z), z, rand() * 1.5, 1));
    colliders.add(x, z, s * 0.6);
  });
  // A second crate stacked on the first
  const [sx, sz] = cellPos(10.15, 17.55);
  addModel(m, crate(9, 0.5), placeAt(sx, ground(sx, sz) + 0.75, sz, 0.6, 1));

  return modelMeshes(m, glow, time, owned);
}

/** Merge a Model's solid and pulse parts into meshes with baked glow. */
export function modelMeshes(m: Model, glow: GlowField, time: { value: number }, owned: THREE.Material[]): THREE.Group {
  const group = new THREE.Group();
  if (m.solid.length) {
    const geo = merge(m.solid);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    const data = new Float32Array(pos.count * 3);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      glow.at(p.fromBufferAttribute(pos, i), n.fromBufferAttribute(nrm, i), c);
      data.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("aGlow", new THREE.BufferAttribute(data, 3));
    const mat = rockMaterial({ roughness: 0.8, xray: true });
    owned.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    // Reason: the torch hangs high above Tadeo, so beams and carts would throw hard black bands across the path
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (m.pulse.length) {
    const mat = crystalMaterial(1.2, time);
    owned.push(mat);
    group.add(new THREE.Mesh(merge(m.pulse), mat));
  }
  return group;
}
