/**
 * Building blocks for chibi characters: cached toon-ish materials, a cartoon
 * outline (inverted hull), and builders for faces and hair styles.
 */

import * as THREE from "three";

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

/** Shared soft material per colour (keeps shader programs and draw state cheap). */
export function mat(color: THREE.ColorRepresentation, roughness = 0.62, emissive = 0): THREE.MeshStandardMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${roughness}|${emissive}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    // Reason: a faint self-glow keeps characters bright and readable even in tree shade
    m.emissive = new THREE.Color(color);
    m.emissiveIntensity = emissive > 0 ? emissive : 0.16;
    materialCache.set(key, m);
  }
  return m;
}

const outlineMaterial = new THREE.MeshBasicMaterial({ color: "#2a1b12", side: THREE.BackSide });
outlineMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    // Reason: push the back-faces outwards along the normal → a dark rim around the silhouette
    "vec3 transformed = position + normal * 0.022;",
  );
};

/** A mesh with a cartoon outline child that shares its geometry. */
export function toonMesh(geo: THREE.BufferGeometry, material: THREE.Material, outline = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline) {
    const o = new THREE.Mesh(geo, outlineMaterial);
    o.castShadow = false;
    o.raycast = () => {};
    m.add(o);
  }
  return m;
}

export interface Face {
  group: THREE.Group;
  /** Eye groups — scale their y to blink. */
  eyes: THREE.Group[];
  mouth: THREE.Mesh;
}

/** Big glossy cartoon eyes, eyebrows, nose, smile and rosy cheeks on a head of radius r. */
export function buildFace(r: number, opts: { brow: THREE.ColorRepresentation; skin: THREE.ColorRepresentation; eyeColor?: THREE.ColorRepresentation; grumpy?: boolean }): Face {
  const group = new THREE.Group();
  const onHead = (x: number, y: number, inset = 0) => {
    const z = Math.sqrt(Math.max(r * r - x * x - y * y, 0)) - inset;
    return new THREE.Vector3(x, y, z);
  };
  const eyes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r * 0.17, 16, 12), mat(opts.eyeColor ?? "#1d1410", 0.25));
    ball.scale.set(0.82, 1.2, 0.55);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(r * 0.055, 8, 6), mat("#ffffff", 0.2, 0.6));
    shine.position.set(-r * 0.035, r * 0.07, r * 0.07);
    const shine2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.025, 6, 4), mat("#ffffff", 0.2, 0.6));
    shine2.position.set(r * 0.04, -r * 0.06, r * 0.07);
    eye.add(ball, shine, shine2);
    eye.position.copy(onHead(side * r * 0.36, r * 0.02, r * 0.03));
    eye.lookAt(eye.position.clone().multiplyScalar(2));
    group.add(eye);
    eyes.push(eye);

    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.035, r * 0.16, 3, 6), mat(opts.brow, 0.8));
    brow.position.copy(onHead(side * r * 0.36, r * 0.3, -r * 0.01));
    brow.rotation.z = Math.PI / 2 + side * (opts.grumpy ? 0.45 : -0.12);
    group.add(brow);

    const cheek = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 10, 8), mat("#ff8f8f", 0.7));
    cheek.scale.set(1, 0.6, 0.3);
    cheek.position.copy(onHead(side * r * 0.56, -r * 0.2, r * 0.03));
    cheek.lookAt(cheek.position.clone().multiplyScalar(2));
    group.add(cheek);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 10, 8), mat(opts.skin, 0.6));
  nose.position.copy(onHead(0, -r * 0.12, -r * 0.03));
  group.add(nose);

  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(r * 0.15, r * 0.028, 6, 16, Math.PI * 0.75),
    mat("#7a2a24", 0.6),
  );
  mouth.position.copy(onHead(0, -r * 0.33, r * 0.02));
  mouth.rotation.z = opts.grumpy ? Math.PI * 0.125 : Math.PI + Math.PI * 0.125;
  mouth.rotation.x = -0.35;
  group.add(mouth);
  return { group, eyes, mouth };
}

/** Hair styles built from spikes, buns and caps around a head of radius r. */
export function buildHair(style: "spiky" | "bun" | "short" | "bald" | "long", r: number, color: THREE.ColorRepresentation): THREE.Group {
  const g = new THREE.Group();
  if (style === "bald") return g;
  const hairMat = mat(color, 0.55);
  const cap = toonMesh(new THREE.SphereGeometry(r * 1.06, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52), hairMat);
  cap.rotation.x = -0.32;
  cap.position.y = r * 0.04;
  g.add(cap);

  if (style === "spiky") {
    const spike = new THREE.ConeGeometry(r * 0.24, r * 0.75, 7);
    spike.translate(0, r * 0.3, 0);
    const dirs: [number, number][] = [];
    // Crown and back spikes
    for (let i = 0; i < 9; i++) dirs.push([(i / 9) * Math.PI * 2, 0.55]);
    for (let i = 0; i < 5; i++) dirs.push([(i / 5) * Math.PI * 2 + 0.4, 0.18]);
    dirs.push([0, 0]);
    for (const [az, el] of dirs) {
      const dir = new THREE.Vector3(Math.sin(az) * Math.sin(el + 0.35), Math.cos(el + 0.35), Math.cos(az) * Math.sin(el + 0.35));
      if (dir.z > 0.55) continue; // keep the face free
      const m = toonMesh(spike, hairMat);
      m.position.copy(dir).multiplyScalar(r * 0.92);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().add(new THREE.Vector3(0, 0.35, -0.15)).normalize());
      g.add(m);
    }
    // Fringe: three tufts sweeping over the forehead
    for (let i = -1; i <= 1; i++) {
      const tuft = toonMesh(new THREE.ConeGeometry(r * 0.2, r * 0.6, 6), hairMat);
      tuft.position.set(i * r * 0.34, r * 0.62, r * 0.66);
      tuft.rotation.set(Math.PI * 0.62, 0, -i * 0.5 + 0.25);
      g.add(tuft);
    }
  } else if (style === "bun") {
    const bun = toonMesh(new THREE.SphereGeometry(r * 0.42, 14, 10), hairMat);
    bun.position.set(0, r * 0.95, -r * 0.45);
    g.add(bun);
    for (const side of [-1, 1]) {
      const lock = toonMesh(new THREE.CapsuleGeometry(r * 0.18, r * 0.5, 4, 8), hairMat);
      lock.position.set(side * r * 0.85, -r * 0.15, -r * 0.05);
      g.add(lock);
    }
  } else if (style === "long") {
    const back = toonMesh(new THREE.CapsuleGeometry(r * 0.75, r * 0.9, 6, 14), hairMat);
    back.scale.set(1.15, 1, 0.6);
    back.position.set(0, -r * 0.35, -r * 0.45);
    g.add(back);
  } else {
    cap.scale.set(1.02, 0.9, 1.02);
  }
  return g;
}
