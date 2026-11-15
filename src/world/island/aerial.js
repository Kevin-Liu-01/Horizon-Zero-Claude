/**
 * DISTANCE-GRADED AERIAL PERSPECTIVE for the world's far forms (M1a round 3, M1.1c: F05's neighbouring silhouette
 * layers 6 L* apart). The shared fog (environment.js) is thin at dusk, so a sea stack at 500 m and a headland at 900 m
 * rimmed at the same L* (43.9 / 44.3). On the materials that draw the far forms (the ground and its far field, the sea
 * stacks, the sister isles) the air thickens past `uAerial.y` metres: the colour goes toward the fog's own in-scatter on
 * that ray (horizon to zenith, the sun's forward glow) by `x * (1 - exp(-(d - y) / z))`, so each layer farther out
 * stands paler than the one before it, the less the higher the ray runs. One shared uniform; `w` caps the mix.
 *
 *   AERIAL          { value: Vector4(amount, start m, scale m, 0) }
 *   AERIAL_PARS     the uniform's declaration (after fog_pars_fragment)
 *   AERIAL_GLSL     the term, after fog_fragment (needs the environment's patched fog chunk: vFogWorldPos, calFog*)
 */
import * as THREE from 'three';

export const AERIAL = { value: new THREE.Vector4(1.0, 450, 450, 0.9) };
/* M1a round 3 fix (F05's layers 250-600 m and 600-1200 m 2.9 L* apart, the farther rims not paler: the air went toward the
 * fog's horizon colour, which at dusk is far under the dome's own sea line, so more air could not make a layer paler):
 * along a low ray the air is lifted toward the visible dome's horizon band at that bearing (the sky's uHorizon, a live
 * copy from environment.skyKeys.low, with the dome's own 0.86 -> 1 toward the sun), never darkened by it. AERIAL_B.x is
 * the weight; the start moves out to 450 m (the stacks' 250-600 m layer keeps its own value, the farther ones pale) */
export const AERIAL_DOME = { value: new THREE.Color(0.75, 0.8, 0.85) };
export const AERIAL_B = { value: new THREE.Vector4(0.7, 0, 0, 0) };

export const AERIAL_PARS = /* glsl */ `
#include <fog_pars_fragment>
uniform vec4 uAerial;
uniform vec4 uAerialB;
uniform vec3 uAerialDome;`;

export const AERIAL_GLSL = /* glsl */ `
#include <fog_fragment>
#if defined(USE_FOG) && !defined(CAL_P_NOAER)
{
  vec3 aDv = vFogWorldPos - cameraPosition;
  float aDl = length(aDv);
  // thinner with height: the ray's mean height over the sea, e-folding at 220 m (F32's lens is 120 m up)
  float aK = min(uAerial.x * (1.0 - exp(-max(aDl - uAerial.y, 0.0) / max(uAerial.z, 1.0))), uAerial.w)
    * exp(-max(0.5 * (cameraPosition.y + vFogWorldPos.y), 0.0) / 220.0);
  if (aK > 0.001) {
    aDv /= max(aDl, 1e-3);
    float aUp = clamp(aDv.y * 1.55 + 0.10, 0.0, 1.0);
    vec3 aAir = mix(calFogHorizon, calFogZenith, aUp * aUp);
    vec2 aHz = normalize(aDv.xz + vec2(1e-5)), aSz = normalize(calSunDir.xz + vec2(1e-5));
    float aAz = max(dot(aHz, aSz), 0.0);
    aAir = mix(aAir, max(aAir, uAerialDome * mix(0.86, 1.0, aAz * aAz)), uAerialB.x * (1.0 - aUp));
    float aC = dot(aDv, calSunDir);
    aAir += calFogSun * (calHG(calFogG.x, aC) * calFogG.y + calHG(calFogG.z, aC) * calFogG.w) * calFogB.x;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, aAir, aK);
  }
}
#endif`;

/** Patch a material's fragment source (inside onBeforeCompile) with the term. */
export function patchAerial(shader) {
  shader.uniforms.uAerial = AERIAL;
  shader.uniforms.uAerialB = AERIAL_B;
  shader.uniforms.uAerialDome = AERIAL_DOME;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <fog_pars_fragment>', AERIAL_PARS)
    .replace('#include <fog_fragment>', AERIAL_GLSL);
}
