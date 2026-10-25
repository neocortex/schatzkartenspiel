/**
 * Shared GLSL snippets (hashing, value noise, fbm) injected into custom shaders.
 */

/**
 * Replacement for three's <normal_fragment_begin> on double-sided foliage:
 * keeps the authored (upward) normal on back faces instead of flipping it,
 * so thin blades and leaves don't turn black when seen from behind.
 */
export const UNFLIPPED_NORMAL_GLSL = /* glsl */ `
float faceDirection = 1.0;
vec3 normal = normalize(vNormal);
vec3 nonPerturbedNormal = normal;
`;

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm3(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s / 0.875;
}
// Animated caustics pattern in [0, 1] (two layers of warped cellular ridges)
float caustics(vec2 p, float t) {
  vec2 q = p + vec2(sin(t * 0.7 + p.y * 0.8), cos(t * 0.6 + p.x * 0.7)) * 0.35;
  float c = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 g = floor(q);
    vec2 f = fract(q);
    float md = 1.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 h = hash22(g + o);
        h = 0.5 + 0.5 * sin(t * 0.9 + 6.2831 * h);
        md = min(md, length(o + h - f));
      }
    }
    c += pow(md, 2.2);
    q = q * 1.7 + vec2(3.1, 1.7);
  }
  return clamp(c * 0.9, 0.0, 1.0);
}
`;
