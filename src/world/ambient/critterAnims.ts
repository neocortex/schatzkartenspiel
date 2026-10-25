/**
 * Per-species vertex animations for `CritterMesh` (GLSL statement blocks).
 * In scope: `inout vec3 p`, `inout vec3 n` (object space), `float part` (the
 * vertex's animation group from `critterModels.ts`) and `float a` (the
 * per-instance animation parameter written by the CPU each frame).
 */

/** Rotate a vertex (and its normal) about the body axis: wing tip up for positive `a`. */
const HINGE_GLSL = (hingeY: string) => /* glsl */ `
  if (part > 0.5) {
    float th = sign(p.x) * a;
    float c = cos(th), s = sin(th);
    float y = p.y - ${hingeY};
    p.xy = vec2(p.x * c - y * s, p.x * s + y * c + ${hingeY});
    n.xy = vec2(n.x * c - n.y * s, n.x * s + n.y * c);
  }
`;

/** Butterflies and songbirds: `a` = wing angle (radians, 0 = flat, ~1.5 = closed upright). */
export const FLAP_ANIM = HINGE_GLSL("0.04");

/** Gulls: `a` = shoulder angle; the outer wing bends further at the wrist (joint at |x| = 0.42). */
export const GULL_ANIM = /* glsl */ `
  if (part > 0.5) {
    float s = sign(p.x);
    float r = abs(p.x);
    float a2 = a * 1.6 - 0.12;
    float r1 = min(r, 0.42);
    float r2 = max(r - 0.42, 0.0);
    p.x = s * (cos(a) * r1 + cos(a2) * r2);
    p.y += sin(a) * r1 + sin(a2) * r2;
    n = vec3(-s * sin(a), cos(a), 0.0);
  }
`;

/** Dragonflies: `a` = flutter phase; front and rear wing pairs beat out of phase. */
export const DRAGONFLY_ANIM = /* glsl */ `
  if (part > 0.5) {
    float ph = p.z > 0.085 ? a : a + 2.4;
    float th = sign(p.x) * sin(ph) * 0.5;
    float c = cos(th), s = sin(th);
    float y = p.y - 0.02;
    p.xy = vec2(p.x * c - y * s, p.x * s + y * c + 0.02);
  }
`;

/** Crabs: `a` = walk phase; leg groups 1/2 lift alternately, claws (3) wave a little. */
export const CRAB_ANIM = /* glsl */ `
  if (part > 0.5 && part < 2.5) {
    float ph = a + (part > 1.5 ? 3.14159 : 0.0);
    p.y += max(sin(ph), 0.0) * 0.045 * smoothstep(0.12, 0.32, abs(p.x));
  } else if (part > 2.5) {
    p.y += (sin(a * 0.5) * 0.5 + 0.5) * 0.04;
  }
`;

/** Chickens: `a` = peck angle; head and neck (part 1) pivot forward/down around the neck base. */
export const CHICKEN_ANIM = /* glsl */ `
  if (part > 0.5) {
    vec3 pivot = vec3(0.0, 0.34, 0.06);
    vec3 q = p - pivot;
    float c = cos(a), s = sin(a);
    p = pivot + vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
    n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
  }
`;

/** Rabbits: `a` = ear twitch angle; ears (part 1) tip backwards around their base. */
export const RABBIT_ANIM = /* glsl */ `
  if (part > 0.5) {
    vec3 pivot = vec3(0.0, 0.36, 0.12);
    vec3 q = p - pivot;
    float c = cos(-a), s = sin(-a);
    p = pivot + vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
  }
`;

/** Fish: `a` = swim phase; the rear of the body and the tail swing sideways. */
export const FISH_ANIM = /* glsl */ `
  p.x += sin(a) * max(-p.z - 0.04, 0.0) * 0.7;
`;

/** Sleeping cat: `a` = breathing phase; the curled body (part 1) swells gently. */
export const CAT_ANIM = /* glsl */ `
  if (part > 0.5) {
    float b = 1.0 + sin(a) * 0.05;
    p.y = 0.02 + (p.y - 0.02) * b;
    p.xz *= 1.0 + sin(a) * 0.02;
  }
`;
