/**
 * "X-ray" cut-out: objects that stand between the camera and the player are
 * dithered away in a soft circle so Tadeo never disappears behind a tree or roof.
 * Patch a material's shader with `patchXray(shader)` inside onBeforeCompile.
 */

import * as THREE from "three";

/** World position the cut-out keeps visible (usually the player's chest). */
export const xrayUniforms = {
  uXrayTarget: { value: new THREE.Vector3(1e5, 0, 1e5) },
  uXrayRadius: { value: 1.15 },
};

const XRAY_PARS = /* glsl */ `
uniform vec3 uXrayTarget;
uniform float uXrayRadius;
float xrayBayer(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return (m[idx] + 0.5) / 16.0;
}
`;

const XRAY_TEST = /* glsl */ `
{
  // Reason: compare in view space — project the fragment onto the camera→target ray
  vec3 P = (viewMatrix * vec4(uXrayTarget, 1.0)).xyz;
  vec3 F = -vViewPosition;
  float t = dot(F, P) / dot(P, P);
  if (t > 0.0 && t < 0.9) {
    float d = length(F - P * t);
    float keep = smoothstep(uXrayRadius * 0.6, uXrayRadius, d);
    if (xrayBayer(gl_FragCoord.xy) > keep) discard;
  }
}
`;

/** Inject the cut-out into a built-in material's fragment shader. */
export function patchXray(shader: THREE.WebGLProgramParametersWithUniforms): void {
  Object.assign(shader.uniforms, xrayUniforms);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${XRAY_PARS}`)
    .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>\n${XRAY_TEST}`);
}
