/**
 * Objective beacon — a soft golden light pillar with a spinning star and a
 * pulsing ground ring, so a seven-year-old always sees where to go next.
 */

import * as THREE from "three";

const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BEAM_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    // Reason: fade out towards the top and bottom, with slow rising shimmer bands
    // Reason: clamp the pow base — a slightly negative base gives NaN on Metal, which bloom smears black
    float fade = smoothstep(0.0, 0.08, vUv.y) * pow(max(1.0 - vUv.y, 0.0), 1.6);
    float bands = 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 3.0);
    float edge = 0.55 + 0.45 * sin(vUv.x * 6.2831 * 3.0 + uTime);
    gl_FragColor = vec4(uColor * 1.6, fade * bands * edge * uOpacity);
  }
`;

const RING_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float pulse = fract(uTime * 0.6);
    float ring = smoothstep(0.06, 0.0, abs(r - pulse)) * (1.0 - pulse);
    float rim = smoothstep(0.05, 0.0, abs(r - 0.92)) * 0.7;
    gl_FragColor = vec4(uColor * 1.4, (ring + rim) * uOpacity);
  }
`;

export class Beacon {
  readonly group = new THREE.Group();
  private star: THREE.Mesh;
  private uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color("#ffd75e") },
    uOpacity: { value: 0 },
  };
  private visibleTarget = 0;

  constructor() {
    const common = {
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    };
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.3, 26, 24, 1, true),
      new THREE.ShaderMaterial({ ...common, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG }),
    );
    beam.position.y = 13;
    beam.renderOrder = 5;

    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.ShaderMaterial({ ...common, vertexShader: BEAM_VERT, fragmentShader: RING_FRAG }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    ring.renderOrder = 5;

    // A chunky golden star with an emissive glow (picked up by bloom)
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 === 0 ? 0.75 : 0.34;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const starGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 });
    starGeo.center();
    this.star = new THREE.Mesh(
      starGeo,
      new THREE.MeshStandardMaterial({ color: "#ffd23d", emissive: "#ffb21a", emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.2 }),
    );
    this.star.position.y = 4.2;

    this.group.add(beam, ring, this.star);
    this.group.visible = false;
  }

  /** Move the beacon to a spot (y = ground height), or hide it with null. */
  set(at: THREE.Vector3 | null): void {
    this.visibleTarget = at ? 1 : 0;
    if (at) {
      this.group.position.copy(at);
      this.group.visible = true;
    }
  }

  update(dt: number, time: number, playerDistance: number, camera: THREE.Camera): void {
    this.uniforms.uTime.value = time;
    // Reason: fade the beacon as the player arrives, and fully when the camera is next to it,
    // so it never swallows the view
    const near = THREE.MathUtils.smoothstep(playerDistance, 2.5, 9);
    const dx = camera.position.x - this.group.position.x;
    const dz = camera.position.z - this.group.position.z;
    const camNear = THREE.MathUtils.smoothstep(Math.hypot(dx, dz), 3, 9);
    const target = this.visibleTarget * (0.25 + 0.75 * near) * camNear;
    const o = this.uniforms.uOpacity;
    o.value += (target - o.value) * (1 - Math.exp(-dt * 4));
    if (o.value < 0.01 && this.visibleTarget === 0) this.group.visible = false;
    this.star.rotation.y = time * 1.8;
    this.star.position.y = 4.2 + Math.sin(time * 2.2) * 0.3;
    this.star.scale.setScalar(Math.max(o.value, 0.001));
  }
}
