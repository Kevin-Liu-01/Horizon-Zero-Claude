import * as THREE from 'three';
import * as ENGINE from '../../core/engine.js';
import { invalidateShadowCasters } from '../../entities/machines/rig/lod.js';
import { HOT } from './hot.js';

/**
 * THE INSTRUMENT HULL LOOK — the shared core-glow chunk (instruments-a W1, by the
 * §1.2 grant on `src/instruments/lib/**`; ROUND5-LOOK I-01, I-03, I-04, P-04 d).
 *
 * Every generated Instrument (`tools/build/instruments/parts/kit.mjs`) ships a
 * hull material flagged `userData.instrumentHull` and a `_lampprox` vertex field
 * (1 at a lamp's rim -> 0 at 0.8 m). This module, run once per machine after its
 * fold, adds three terms to that material's shader and nothing else:
 *
 *   SPILL   emissive += prox^2 x lampColour x gain x 0.35 (I-01): the lamp lights
 *           the plates round it in its own state colour. `lampColour x gain` is
 *           written once per frame by `machines.lamps` into `machine.lamp.coreU`
 *           (a per-material uniform: no allocation, no point light).
 *   RIM     calRim at kRim 0.35 (I-03): a fresnel edge lit by the sun, stronger
 *           against the light (backlit hulls separate from a golden field). The
 *           sun direction and radiance are the lamp system's own per-frame
 *           uniforms, shared by reference.
 *   FLASH   `machine.flashPart(part, k)` (P-04 d): +0.35 k toward warm white
 *           #FFE6C2 for 70 ms of real time, lamps excluded (the lamp is its own
 *           draw). The timer is read in the hull's onBeforeRender: no per-frame
 *           machine code, nothing allocated.
 *
 * One program for every Instrument hull (`customProgramCacheKey`); the uniforms
 * are per material (each machine owns its material clone).
 *
 * THE LOD1 CASTER PROXY (I-04). A medium or large kind's GLB carries a `*-lod1`
 * mesh (`extras.casterProxy`) at <= 40 % of the hull's triangles. `prepareEntry`
 * gives it its own runtime material once per kind (in the GLB it shares the hull
 * material: two materials per Instrument, bible §4.1) and marks it `noMerge`, so
 * the fold never folds it into the hull. `installHull` then decides per machine:
 *   - the engine publishes `CAL_LAYER` and its shadow pass honours it
 *     (look-post's per-cascade masks, `renderer.shadowMap._calLayers`): the proxy
 *     goes to layer CASTER_ONLY and is the machine's ONLY caster; the hull and
 *     the sensor stop casting;
 *   - otherwise (this tree before look-post merges): the proxy is hidden and the
 *     hull casts as before. Nothing else changes.
 *
 * Published:
 *   prepareEntry(entry, kind)          the kind's `onEntry` (after `liftExtras`)
 *   installHull(machine) -> { hull, proxy, casterMode }
 *   hullOf(machine) -> Mesh | null
 *   flashHull(machine, k)              (machine.flashPart routes here)
 *   HULL_LOOK                          the constants (gates read them)
 */
export const HULL_LOOK = Object.freeze({
  spillK: 0.35,
  rimK: 0.35,
  rimPow: 2.0,
  flashK: 0.35,
  flashMs: 70,
  flashTint: Object.freeze([1.0, 0.788, 0.565]),   // #FFE6C2 (linear)
});

const CACHE_KEY = 'cal-instrument-hull-v1';

function patchShader(shader, mat) {
  const u = mat.userData.hullU;
  shader.uniforms.uCoreCol = u.uCoreCol;
  shader.uniforms.uFlash = u.uFlash;
  shader.uniforms.uSunDirW = u.uSunDirW;
  shader.uniforms.uSunRad = u.uSunRad;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float _lampprox;\nvarying float vLampProx;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLampProx = _lampprox;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
uniform vec3 uCoreCol;
uniform float uFlash;
uniform vec3 uSunDirW;
uniform vec3 uSunRad;
varying float vLampProx;`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // I-01 spill: the lamp lights the plates round it, in its state colour
  totalEmissiveRadiance += vLampProx * vLampProx * uCoreCol * ${HULL_LOOK.spillK.toFixed(3)};
  // I-03 calRim: a fresnel edge lit by the sun, stronger against the light
  vec3 cV = normalize(vViewPosition);
  vec3 sV = normalize((viewMatrix * vec4(uSunDirW, 0.0)).xyz);
  float fr = pow(1.0 - saturate(dot(normal, cV)), ${HULL_LOOK.rimPow.toFixed(1)});
  float back = 0.35 + 0.65 * saturate(-dot(sV, cV));
  totalEmissiveRadiance += fr * back * ${(HULL_LOOK.rimK * Math.PI).toFixed(4)} * uSunRad * diffuseColor.rgb;
  // P-04 d hull flash: toward warm white
  totalEmissiveRadiance += uFlash * vec3(${HULL_LOOK.flashTint.map((x) => x.toFixed(3)).join(', ')});
}`);
}

function onBeforeCompile(shader) { patchShader(shader, this); }
function cacheKey() { return CACHE_KEY; }

/** The kind's `onEntry` addition: the LOD1 proxy gets its own material, once per kind. */
export function prepareEntry(entry, kind) {
  if (!entry?.root || entry.hullPrepared) return;
  entry.hullPrepared = true;
  entry.root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData?.casterProxy || /-lod1$/.test(o.name || '')) {
      o.userData.casterProxy = true;
      o.userData.noMerge = true;
      o.material = new THREE.MeshBasicMaterial({ name: `${kind}-lod1`, color: 0x3a3a3a });
      o.material.userData.casterProxy = true;
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
}

/** The hull mesh of a machine (its material carries `userData.instrumentHull`). */
export function hullOf(machine) {
  if (machine?._hull !== undefined) return machine._hull;
  let hull = null;
  machine?.root?.traverse((o) => {
    if (!hull && o.isMesh && o.material && !Array.isArray(o.material) && o.material.userData?.instrumentHull) hull = o;
  });
  if (machine) machine._hull = hull;
  return hull;
}

const _zero = new THREE.Vector3(0, 1, 0);
const _sun0 = new THREE.Vector3(0, 0, 0);

/**
 * Per machine, after `foldMachineMeshes`: patch the hull, wire the lamp's spill
 * uniform, choose the caster. Idempotent. Returns what it found.
 */
export function installHull(machine) {
  const hull = hullOf(machine);
  let proxy = null;
  machine.root.traverse((o) => { if (!proxy && o.isMesh && o.userData?.casterProxy) proxy = o; });
  if (hull && !hull.material.userData.hullU) {
    const mat = hull.material;
    const L = machine.manager?.lamps?._uLight;
    const u = {
      uCoreCol: { value: new THREE.Vector3(0, 0, 0) },
      uFlash: { value: 0 },
      uSunDirW: L ? L.uSunDir : { value: _zero },
      uSunRad: L ? L.uSunRad : { value: _sun0 },
    };
    mat.userData.hullU = u;
    mat.onBeforeCompile = onBeforeCompile;
    mat.customProgramCacheKey = cacheKey;
    mat.needsUpdate = true;
    if (machine.lamp) machine.lamp.coreU = u.uCoreCol.value;
    const fx = { until: 0, k: 0 };
    machine._hullFlash = fx;
    hull.onBeforeRender = function hullFlashTick() {
      const now = performance.now();
      u.uFlash.value = now < fx.until ? fx.k * HULL_LOOK.flashK * (fx.until - now) / HULL_LOOK.flashMs : 0;
    };
  }
  // the caster
  const CAL = ENGINE.CAL_LAYER;
  const sm = (HOT.engine || machine.ctx?.engine)?.renderer?.shadowMap;
  const casterMode = !!(proxy && CAL && sm && sm._calLayers);
  if (proxy) {
    if (casterMode) {
      proxy.layers.set(CAL.CASTER_ONLY);
      proxy.visible = true;
      proxy.userData.noShadow = false;
      proxy.castShadow = true;
      if (hull) hull.userData.noShadow = true;
      machine.root.traverse((o) => { if (o.isMesh && o !== proxy) { o.userData.noShadow = true; o.castShadow = false; } });
    } else {
      proxy.visible = false;
      proxy.userData.noShadow = true;
      proxy.castShadow = false;
    }
    invalidateShadowCasters(machine);
  }
  machine._casterProxy = proxy;
  machine._casterMode = casterMode;
  return { hull, proxy, casterMode };
}

/** P-04 (d): flash the hull toward warm white for 70 ms of real time. */
export function flashHull(machine, k = 1) {
  const fx = machine?._hullFlash;
  if (!fx) return false;
  fx.until = performance.now() + HULL_LOOK.flashMs;
  fx.k = k > 0 ? k : 0;
  return true;
}
