/**
 * DISTANCE-GRADED AERIAL PERSPECTIVE for the world's far forms (M1a round 3, M1.1c: F05's neighbouring silhouette
 * layers 6 L* apart). The shared fog (environment.js) is thin at dusk, so a sea stack at 500 m and a headland at 900 m
 * rimmed at the same L* (43.9 / 44.3). On the materials that draw the far forms (the ground and its far field, the sea
 * stacks, the sister isles) the air thickens past `uAerial.y` metres: the colour goes toward the fog's own in-scatter on
 * that ray (horizon to zenith, the sun's forward glow) by `x * (1 - exp(-(d - y) / z))`, so each layer farther out
 * stands paler than the one before it. One shared uniform; `w` unused.
 *
 *   AERIAL          { value: Vector4(amount, start m, scale m, 0) }
 *   AERIAL_PARS     the uniform's declaration (after fog_pars_fragment)
 *   AERIAL_GLSL     the term, after fog_fragment (needs the environment's patched fog chunk: vFogWorldPos, calFog*)
 */
import * as THREE from 'three';

export const AERIAL = { value: new THREE.Vector4(0.42, 380, 900, 0) };

export const AERIAL_PARS = /* glsl */ `
#include <fog_pars_fragment>
uniform vec4 uAerial;`;

export const AERIAL_GLSL = /* glsl */ `
#include <fog_fragment>
#ifdef USE_FOG
{
  vec3 aDv = vFogWorldPos - cameraPosition;
  float aDl = length(aDv);
  float aK = uAerial.x * (1.0 - exp(-max(aDl - uAerial.y, 0.0) / max(uAerial.z, 1.0)));
  if (aK > 0.001) {
    aDv /= max(aDl, 1e-3);
    float aUp = clamp(aDv.y * 1.55 + 0.10, 0.0, 1.0);
    vec3 aAir = mix(calFogHorizon, calFogZenith, aUp * aUp);
    float aC = dot(aDv, calSunDir);
    aAir += calFogSun * (calHG(calFogG.x, aC) * calFogG.y + calHG(calFogG.z, aC) * calFogG.w) * calFogB.x;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, aAir, aK);
  }
}
#endif`;

/** Patch a material's fragment source (inside onBeforeCompile) with the term. */
export function patchAerial(shader) {
  shader.uniforms.uAerial = AERIAL;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <fog_pars_fragment>', AERIAL_PARS)
    .replace('#include <fog_fragment>', AERIAL_GLSL);
}
