import * as THREE from 'three';
import { patchAerial, patchDeck } from '../island/aerial.js';

/**
 * THE MALPAIS' STEAM (Milestone 3 wave 2b, area A; M3 briefs MP4: ">= 3 steam sources in F56 and >= 3 in F58; each is
 * fumarole white, 0 emissive, and costs <= 0.15 ms* GPU in frame"; BIBLE §3.3 "fumarole steam", the hornito field
 * "steaming"). The sources are data (./malpais-layout.js STEAM: the steaming hornitos, the vents in the flow, two of the
 * Yards' flue stacks); each is a plume of soft puffs that rise, slow, swell and thin out, carried downwind by the wind
 * seam (environment.windAt at the plume's foot, eased) so every plume leans the way the wind blows.
 *
 * Cheap by construction: one quad per puff, every puff of a group in ONE instanced draw (a group's plumes share their
 * place: the hornito field and the flow's vents, the Yards), the motion entirely in the vertex shader from one time
 * uniform (no per-frame upload), no shadow cast, no depth write. Lit like everything else (Lambert, its normal the
 * world's up, so a plume takes the sky and the low sun as a cloud does) and never emissive: fumarole white is its albedo.
 * The time is the environment's own clock in seconds (its game hours x the day's real length): a frozen clock (a staged
 * frame, a pause) freezes the steam where it is, so a film repeats.
 *
 *   const st = buildSteam(STEAM, ground)   st.group (one mesh a group) · st.materials · st.update(env) · st.dispose()
 *   st.counts                              { sources, puffs, draws, triangles }
 */
/** Fumarole white (sRGB), and the plume's look: the most a puff covers, its life (s) by kind, how far the wind carries it. */
export const STEAM_LOOK = Object.freeze({ color: 0xe4e8e8, opacity: 0.42, life: Object.freeze({ hornito: 9, vent: 7, stack: 8 }), carry: 0.32 });

const VERT_PARS = /* glsl */ `
#include <common>
attribute vec4 iSrc;   // the plume's foot (engine x, y, z) and this puff's phase in its life
attribute vec4 iPar;   // the plume's rise (m), a puff's starting radius (m), a seed, its life (s)
uniform float uSteamT;
uniform vec2 uSteamWind;   // the wind at the plumes, m/s (x, z)
varying vec2 vSt;
varying float vStA;
varying float vStSeed;
`;
/* the puff's place and size (replaces project_vertex; vViewPosition and the fog read this mvPosition) */
const VERT_PROJECT = /* glsl */ `
  float stLife = iPar.w;
  float stCyc = iSrc.w + uSteamT / stLife;
  float age = fract(stCyc);
  float sd = iPar.z;
  float rise = iPar.x * (1.0 - (1.0 - age) * (1.0 - age));
  vec2 drift = uSteamWind * age * age * stLife * ${STEAM_LOOK.carry.toFixed(3)};
  vec2 wob = vec2(sin(age * 6.0 + sd * 13.0), cos(age * 5.0 + sd * 7.0)) * (0.2 + age * 1.1);
  vec3 stWorld = vec3(iSrc.x + drift.x + wob.x, iSrc.y + rise, iSrc.z + drift.y + wob.y);
  float stSize = iPar.y * (1.0 + age * 3.0);
  vec4 mvPosition = viewMatrix * vec4(stWorld, 1.0);
  float ang = sd * 6.2832 + age * 0.7;
  vec2 q = vec2(position.x * cos(ang) - position.y * sin(ang), position.x * sin(ang) + position.y * cos(ang));
  mvPosition.xy += q * stSize * 2.0;
  gl_Position = projectionMatrix * mvPosition;
  vSt = position.xy;
  vStA = smoothstep(0.0, 0.14, age) * pow(1.0 - age, 1.3);
  vStSeed = sd * 17.0 + floor(stCyc) * 0.618;
`;
const FRAG_PARS = /* glsl */ `
#include <common>
uniform vec4 uSteamK;   // x the most a puff covers
varying vec2 vSt;
varying float vStA;
varying float vStSeed;
float stH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float stN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(stH(i), stH(i + vec2(1.0, 0.0)), f.x), mix(stH(i + vec2(0.0, 1.0)), stH(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
{
  float r = length(vSt) * 2.0;
  vec2 o = vec2(vStSeed, vStSeed * 1.7);
  float n = 0.65 * stN(vSt * 3.1 + o) + 0.35 * stN(vSt * 7.3 + o * 2.3);
  float a = smoothstep(1.0, 0.2, r + (n - 0.5) * 0.7) * vStA * uSteamK.x;
  // a puff's underside a little in its own shade
  diffuseColor.rgb *= 0.82 + 0.18 * clamp(vSt.y + 0.5, 0.0, 1.0);
  diffuseColor.a *= a;
  if (diffuseColor.a < 0.003) discard;
}
`;

function quad() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** A deterministic 0..1 sequence (no Math.random: a film repeats). */
function seq(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * @param {ReadonlyArray<{id, kind, x, z, base, h, r, n}>} sources   engine frame (./malpais-layout.js STEAM)
 * @param {(x: number, z: number) => number} ground                  the drawn terrain
 */
export function buildSteam(sources, ground) {
  const U = { uSteamT: { value: 0 }, uSteamWind: { value: new THREE.Vector2(0, 0) }, uSteamK: { value: new THREE.Vector4(STEAM_LOOK.opacity, 0, 0, 0) } };
  const mat = new THREE.MeshLambertMaterial({ color: STEAM_LOOK.color, transparent: true, depthWrite: false, emissive: 0x000000 });
  mat.name = 'malpais-steam';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERT_PARS)
      .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );')
      .replace('#include <project_vertex>', VERT_PROJECT)
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4( stWorld, 1.0 );');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', FRAG_PARS).replace('#include <color_fragment>', FRAG_COLOR);
    patchAerial(shader); patchDeck(shader);
  };
  mat.customProgramCacheKey = () => 'cal-malpais-steam';

  // one draw a group: the Yards' stacks, and everything else (the hornito field and the vents in the flow)
  const groups = new Map();
  for (const s of sources) { const k = s.kind === 'stack' ? 'yards' : 'flow'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
  const group = new THREE.Group();
  group.name = 'malpais-steam';
  const geos = [], feet = [];
  let puffs = 0;
  for (const [k, list] of groups) {
    const n = list.reduce((a, s) => a + s.n, 0);
    const src = new Float32Array(n * 4), par = new Float32Array(n * 4);
    let i = 0;
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const s of list) {
      const R = seq(Math.floor(s.x * 73 + s.z * 31));
      const y0 = ground(s.x, s.z) + s.base, life = STEAM_LOOK.life[s.kind] || 8;
      feet.push({ x: s.x, z: s.z });
      for (let j = 0; j < s.n; j++, i++) {
        src.set([s.x, y0, s.z, (j + R() * 0.6) / s.n], i * 4);
        par.set([s.h * (0.85 + 0.3 * R()), s.r * (0.8 + 0.4 * R()), R(), life * (0.85 + 0.3 * R())], i * 4);
      }
      lo.min(new THREE.Vector3(s.x - 30, y0 - 2, s.z - 30)); hi.max(new THREE.Vector3(s.x + 30, y0 + s.h + 6, s.z + 30));
    }
    const g = quad();
    g.setAttribute('iSrc', new THREE.InstancedBufferAttribute(src, 4));
    g.setAttribute('iPar', new THREE.InstancedBufferAttribute(par, 4));
    g.instanceCount = n;
    // the puffs are placed in the shader: the bounds are the plumes' reach (30 m downwind of any foot), not the quad's
    g.boundingBox = new THREE.Box3(lo, hi);
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    const m = new THREE.Mesh(g, mat);
    m.name = `malpais-steam-${k}`;
    m.castShadow = false; m.receiveShadow = false;
    m.renderOrder = 2;
    group.add(m);
    geos.push(g);
    puffs += n;
  }
  const cx = feet.reduce((a, f) => a + f.x, 0) / Math.max(1, feet.length), cz = feet.reduce((a, f) => a + f.z, 0) / Math.max(1, feet.length);
  const w = { x: 0, z: 0 };
  let primed = false;
  return {
    group,
    materials: [mat],
    uniforms: U,
    counts: { sources: sources.length, puffs, draws: geos.length, triangles: puffs * 2 },
    /** Each frame: the clock and the wind (eased over about a second of frames). */
    update(env) {
      if (!env) return;
      const day = env.dayLengthSeconds || 1800, t = (Number(env.time) || 0) * (day / 24);
      U.uSteamT.value = t;
      if (typeof env.windAt === 'function') {
        env.windAt(cx, cz, w);
        const k = primed ? 0.04 : 1;
        U.uSteamWind.value.x += ((w.x || 0) - U.uSteamWind.value.x) * k;
        U.uSteamWind.value.y += ((w.z || 0) - U.uSteamWind.value.y) * k;
        primed = true;
      }
    },
    dispose() { for (const g of geos) g.dispose(); mat.dispose(); group.parent?.remove(group); },
  };
}
