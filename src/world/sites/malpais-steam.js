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
 * uniform (no per-frame upload), no shadow cast, no depth write. Lit like everything else (its normal the
 * world's up, so a plume takes the sky and the low sun as a cloud does) and never emissive: fumarole white is its albedo.
 * The time is the environment's own clock in seconds (its game hours x the day's real length): a frozen clock (a staged
 * frame, a pause) freezes the steam where it is, so a film repeats.
 *
 * (M3 wave 3: the Yards' stack plumes did not show over F57's dusk sky.) A standard material now (roughness 1, no
 * metal), so the sky's IBL lights a puff as it lights the ground and the rock (three's Lambert takes scene.environment only
 * as a reflection, not as light), and the stacks' plumes are denser than the flow's (STEAM_LOOK.opacity by group; one
 * material a group, one program). What each part did is measured on the page (tools/world/malpais-probe-page.mjs
 * steamVisibility: the frame with and without the steam, with Lambert and wave 2b's cover in its place).
 *
 *   const st = buildSteam(STEAM, ground)   st.group (one mesh a group) · st.materials · st.update(env) · st.dispose()
 *   st.counts                              { sources, puffs, draws, triangles }
 *   st.solo(id)                            (MP4's cost per source) a mesh of that one source's plume, in the same
 *                                          material, for a paired toggle against none (malpais-region.js perfSwitches)
 */
/** Fumarole white (sRGB), and the plume's look: the most a puff covers, its life (s) by kind, how far the wind carries it. */
export const STEAM_LOOK = Object.freeze({ color: 0xe4e8e8, opacity: Object.freeze({ flow: 0.3, yards: 0.85 }), life: Object.freeze({ hornito: 9, vent: 7, stack: 8 }), carry: 0.32, grow: Object.freeze({ hornito: 4.0, vent: 2.6, stack: 4.0 }), puffs: 2.0 });
/* (M3 wave 3, MP4's cost per source: the vents nearest F56's lens, 34-42 m, carried most of the steam's 1.45 ms) a vent's
 * plume swells less (2.6 times its first radius, was 4) and has fewer puffs (./malpais-layout.js STEAM): a crack's breath,
 * not a chimney's */

const VERT_PARS = /* glsl */ `
#include <common>
attribute vec4 iSrc;   // the plume's foot (engine x, y, z) and this puff's phase in its life
attribute vec4 iPar;   // the plume's rise (m), a puff's starting radius (m), a seed, its life (s)
attribute float iGrow; // how many times its first radius a puff swells to at the end of its life
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
  float stSize = iPar.y * (1.0 + age * iGrow);
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
  // (wave 2b, after the film at d6d482e: the puffs read as round cotton balls) a soft core and a torn edge: the cover
  // falls off from the centre all the way out, and two octaves of noise eat into it, so neighbours merge into a plume
  float r = length(vSt) * 2.0;
  vec2 o = vec2(vStSeed, vStSeed * 1.7);
  float n = 0.6 * stN(vSt * 2.3 + o) + 0.4 * stN(vSt * 5.9 + o * 2.3);
  float core = 1.0 - smoothstep(0.0, 1.0, r);
  float a = core * core * smoothstep(0.15, 0.75, n + 0.35 * core) * vStA * uSteamK.x;
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
  const U = { uSteamT: { value: 0 }, uSteamWind: { value: new THREE.Vector2(0, 0) } };
  const mats = new Map();
  const matFor = (k) => {
    if (mats.has(k)) return mats.get(k);
    const K = { value: new THREE.Vector4(STEAM_LOOK.opacity[k] ?? STEAM_LOOK.opacity.flow, 0, 0, 0) };
    const mat = new THREE.MeshStandardMaterial({ color: STEAM_LOOK.color, roughness: 1, metalness: 0, transparent: true, depthWrite: false, emissive: 0x000000 });
    mat.name = `malpais-steam-${k}`;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U, { uSteamK: K });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', VERT_PARS)
        .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );')
        .replace('#include <project_vertex>', VERT_PROJECT)
        .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4( stWorld, 1.0 );');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', FRAG_PARS).replace('#include <color_fragment>', FRAG_COLOR);
      patchAerial(shader); patchDeck(shader);
    };
    // one program for every group (the cover is a uniform)
    mat.customProgramCacheKey = () => 'cal-malpais-steam-std';
    mat.userData.cover = K;
    mats.set(k, mat);
    return mat;
  };
  const groupOf = (s) => (s.kind === 'stack' ? 'yards' : 'flow');

  /** one instanced mesh of a list of plumes */
  const meshOf = (list, k, name) => {
    const n = list.reduce((a, s) => a + Math.round(s.n * STEAM_LOOK.puffs), 0);
    const src = new Float32Array(n * 4), par = new Float32Array(n * 4), grw = new Float32Array(n);
    let i = 0;
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const s of list) {
      const R = seq(Math.floor(s.x * 73 + s.z * 31));
      const y0 = ground(s.x, s.z) + s.base, life = STEAM_LOOK.life[s.kind] || 8;
      const ns = Math.round(s.n * STEAM_LOOK.puffs);
      for (let j = 0; j < ns; j++, i++) {
        src.set([s.x, y0, s.z, (j + R() * 0.6) / ns], i * 4);
        par.set([s.h * (0.85 + 0.3 * R()), s.r * (0.8 + 0.4 * R()), R(), life * (0.85 + 0.3 * R())], i * 4);
        grw[i] = STEAM_LOOK.grow[s.kind] ?? 4.0;
      }
      lo.min(new THREE.Vector3(s.x - 30, y0 - 2, s.z - 30)); hi.max(new THREE.Vector3(s.x + 30, y0 + s.h + 6, s.z + 30));
    }
    const g = quad();
    g.setAttribute('iSrc', new THREE.InstancedBufferAttribute(src, 4));
    g.setAttribute('iPar', new THREE.InstancedBufferAttribute(par, 4));
    g.setAttribute('iGrow', new THREE.InstancedBufferAttribute(grw, 1));
    g.instanceCount = n;
    // the puffs are placed in the shader: the bounds are the plumes' reach (30 m downwind of any foot), not the quad's
    g.boundingBox = new THREE.Box3(lo, hi);
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    const m = new THREE.Mesh(g, matFor(k));
    m.name = name;
    m.castShadow = false; m.receiveShadow = false;
    // its origin is not where it stands (the puffs are placed in the shader): the engine's small-mesh cull reads the origin
    m.userData.noSizeCull = true;
    // after the sky dome (environment.js draws it last of the opaque, renderOrder 1000), as every transparent is
    m.renderOrder = 1001;
    return { mesh: m, geo: g, n };
  };

  // one draw a group: the Yards' stacks, and everything else (the hornito field and the vents in the flow)
  const groups = new Map();
  for (const s of sources) { const k = groupOf(s); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
  const group = new THREE.Group();
  group.name = 'malpais-steam';
  const geos = [];
  let puffs = 0;
  for (const [k, list] of groups) {
    const { mesh, geo, n } = meshOf(list, k, `malpais-steam-${k}`);
    group.add(mesh);
    geos.push(geo);
    puffs += n;
  }
  const feet = sources.map((s) => ({ x: s.x, z: s.z }));
  const cx = feet.reduce((a, f) => a + f.x, 0) / Math.max(1, feet.length), cz = feet.reduce((a, f) => a + f.z, 0) / Math.max(1, feet.length);
  const w = { x: 0, z: 0 };
  let primed = false;
  const solos = new Map();
  return {
    group,
    get materials() { return [...mats.values()]; },
    uniforms: U,
    counts: { sources: sources.length, puffs, draws: geos.length, triangles: puffs * 2 },
    /** (MP4) one source's plume alone, built on first ask and kept; a child of the steam's group, hidden until asked */
    solo(id) {
      if (solos.has(id)) return solos.get(id);
      const s = sources.find((q) => q.id === id);
      if (!s) return null;
      const { mesh, geo } = meshOf([s], groupOf(s), `malpais-steam-solo-${id}`);
      mesh.visible = false;
      group.add(mesh);
      geos.push(geo);
      solos.set(id, mesh);
      return mesh;
    },
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
    dispose() { for (const g of geos) g.dispose(); for (const m of mats.values()) m.dispose(); group.parent?.remove(group); },
  };
}
