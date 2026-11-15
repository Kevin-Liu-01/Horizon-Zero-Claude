import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BEDS, REED_KIND, REED_MASK } from '../../world/island/reedmask.js';

/**
 * THE REEDS, DRAWN FROM THE MASK (BUILD M1.6e). Every cane stands where `mask.cover(x, z)` (the base cover less the
 * Peg cuts) says reed stands, the same value the rule reads: the picture and the rule cannot disagree (TECH §5).
 *
 *   carrizo  a clump of 5 pale canes, 2.3-3.4 m (taller than Brea), two arching leaves each and a buff plume;
 *            80 triangles. Planted on a jittered 1.3 m grid, kept where a hash is under the cover (thin at a bed's
 *            edge, gone in a cut lane). One InstancedMesh per bed (eight), so a bed outside the lens is culled whole.
 *   junco    a tuft of 14 dark rush stems, 0.7-1.15 m, one tapered sliver each: 14 triangles, on a 0.7 m grid; one
 *            InstancedMesh for the four lee beds.
 *
 * THE LEAN. Each instance carries its bed (`aBed`); `uLean[bed]` is that bed's gust clock lean (src/game/reeds/gust.js),
 * written once a frame. A cane bends downwind (the trade's SW, vegetation's `uWind`) by its height squared: its tip
 * stands about 0.35 m off true in a lull and about 0.95 m in a full gust (a 2.9 m cane), with a flutter that quickens
 * with the gust. Brea and the nearest Instruments part the canes (vegetation's four displacers).
 *
 * Lit like the island's flora (the same standard material, the land's long shadow from the terrain's skyline
 * texture); casts no shadow (no plant does: A56). Allocation-free per frame.
 */
const CARRIZO_PITCH = 1.3;
const JUNCO_PITCH = 0.7;
const MAX_BEDS = 16;

function hash2(ix, iz, s) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A tapered strap from (ox, oy, oz) along a curve: segs quads, indexed; colour ramp c0 -> c1; normals up-biased. */
function strap(G, o, dir, len, w, segs, c0, c1, droop = 0, rise = 1, taper = 0.75, side = null) {
  const [dx, dy, dz] = dir;
  const sx = side ? side[0] : -dz, sz = side ? side[1] : dx;
  const sl = Math.hypot(sx, sz) || 1;
  const base = G.P.length / 3;
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    // the path: out along dir, rising by `rise`, drooping by droop * t^2 at the end
    const x = o[0] + dx * len * t, z = o[2] + dz * len * t;
    const y = o[1] + dy * len * t * rise - droop * t * t;
    const ww = w * (1 - t * taper) / sl;
    for (const k of [-1, 1]) {
      G.P.push(x + sx * ww * k, y, z + sz * ww * k);
      G.C.push(c0.r + (c1.r - c0.r) * t, c0.g + (c1.g - c0.g) * t, c0.b + (c1.b - c0.b) * t);
      G.N.push(dx * 0.3 + sz * 0.2 * k, 0.9, dz * 0.3 - sx * 0.2 * k);
    }
    if (s < segs) {
      const a = base + s * 2;
      G.I.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
}

function geoOf(G) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(G.P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(G.C, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(G.N, 3));
  g.setIndex(G.I);
  g.computeBoundingSphere();
  return g;
}

/** Carrizo: 5 canes x (3-segment cane + 2 two-segment leaves + a plume) = 80 triangles. Pale straw, never gold. */
export function carrizoGeo(seed = 0xca77) {
  const R = rand(seed), G = { P: [], C: [], N: [], I: [] };
  const cane0 = new THREE.Color('#8d8a68'), cane1 = new THREE.Color('#ddd4b8');
  const leaf0 = new THREE.Color('#a5aa8c'), leaf1 = new THREE.Color('#d6d0b6');
  const plume0 = new THREE.Color('#d9cfb6'), plume1 = new THREE.Color('#efe7d6');
  const c0 = new THREE.Color(), c1 = new THREE.Color();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + R() * 0.8, r0 = 0.05 + R() * 0.35;
    const ox = Math.cos(a) * r0, oz = Math.sin(a) * r0;
    const H = 2.3 + R() * 1.1, tilt = 0.04 + R() * 0.07;
    const dir = [Math.cos(a) * tilt, 1, Math.sin(a) * tilt];
    const sideA = a + Math.PI / 2 + (R() - 0.5) * 0.6;
    const side = [Math.cos(sideA), Math.sin(sideA)];
    c0.copy(cane0).multiplyScalar(0.88 + R() * 0.2); c1.copy(cane1).multiplyScalar(0.9 + R() * 0.12);
    strap(G, [ox, 0, oz], dir, H, 0.024, 3, c0, c1, 0, 1, 0.55, side);
    for (let l = 0; l < 2; l++) {
      const t = 0.42 + l * 0.24 + R() * 0.08, la = a + (l ? Math.PI : 0) + (R() - 0.5) * 1.6;
      const at = [ox + dir[0] * H * t, H * t, oz + dir[2] * H * t];
      const L = 0.55 + R() * 0.35;
      c0.copy(leaf0).multiplyScalar(0.9 + R() * 0.15); c1.copy(leaf1).multiplyScalar(0.92 + R() * 0.12);
      strap(G, at, [Math.cos(la), 0.55, Math.sin(la)], L, 0.042, 2, c0, c1, 0.32 + R() * 0.2, 1, 0.85);
    }
    const top = [ox + dir[0] * H, H - 0.02, oz + dir[2] * H];
    c0.copy(plume0); c1.copy(plume1);
    strap(G, top, [dir[0] + 0.12, 1, dir[2]], 0.34, 0.06, 1, c0, c1, 0.05, 1, 0.6, side);
  }
  return geoOf(G);
}

/** Junco: 14 rush stems, one tapered sliver each (14 triangles): dark green to an olive-brown tip. */
export function juncoGeo(seed = 0x7c0) {
  const R = rand(seed), P = [], C = [], N = [];
  const s0 = new THREE.Color('#4f5a33'), s1 = new THREE.Color('#8a8455');
  const c0 = new THREE.Color(), c1 = new THREE.Color();
  for (let k = 0; k < 14; k++) {
    const a = R() * Math.PI * 2, r0 = R() * 0.14, ox = Math.cos(a) * r0, oz = Math.sin(a) * r0;
    const H = 0.7 + R() * 0.45, tilt = 0.05 + R() * 0.22, w = 0.012;
    const sa = R() * Math.PI, sx = Math.cos(sa) * w, sz = Math.sin(sa) * w;
    const tx = ox + Math.cos(a) * tilt * H, tz = oz + Math.sin(a) * tilt * H;
    c0.copy(s0).multiplyScalar(0.85 + R() * 0.3); c1.copy(s1).multiplyScalar(0.85 + R() * 0.3);
    P.push(ox - sx, 0, oz - sz, ox + sx, 0, oz + sz, tx, H, tz);
    C.push(c0.r, c0.g, c0.b, c0.r, c0.g, c0.b, c1.r, c1.g, c1.b);
    for (let q = 0; q < 3; q++) N.push(Math.cos(a) * 0.3, 0.9, Math.sin(a) * 0.3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  const m = mergeVertices(g);
  g.dispose();
  m.computeBoundingSphere();
  return m;
}

const REED_VERT = /* glsl */ `
attribute float aBed;
uniform float uLean[${MAX_BEDS}];
uniform float uTime;
uniform vec2 uWind;
uniform vec4 uActors[4];
uniform float uHeight;
varying vec2 vFloraXZ;
`;
const REED_PROJECT = /* glsl */ `
vec4 iw = instanceMatrix * vec4(transformed, 1.0);
{
  vec3 o = instanceMatrix[3].xyz;
  float sy = length(instanceMatrix[1].xyz);
  float yl = max(iw.y - o.y, 0.0);
  float hh = clamp(yl / (uHeight * sy), 0.0, 1.25);
  float h2 = hh * hh;
  float lean = uLean[int(aBed + 0.5)];
  float ph = dot(o.xz, vec2(0.37, 0.61)) + uTime * (1.4 + 1.8 * lean);
  float flut = sin(ph) * 0.05 + sin(ph * 2.7 + o.x) * 0.025;
  // the bend at the tip, metres: a standing lean SW, the gust clock's lean, the flutter
  float bend = (0.06 + 0.26 * lean + flut * (0.35 + lean)) * uHeight * sy;
  vec2 off = uWind * bend * h2;
  // she and the nearest Instruments part the canes (vegetation's displacers)
  for (int a = 0; a < 4; a++) {
    vec2 dv = iw.xz - uActors[a].xy;
    float dl = length(dv) + 1e-3;
    float pu = (1.0 - smoothstep(0.0, uActors[a].z * 1.15, dl)) * uActors[a].w;
    off += (dv / dl) * pu * 0.9 * hh;
  }
  iw.xz += off;
  iw.y -= dot(off, off) / max(2.0 * yl, 0.3);
}
vFloraXZ = iw.xz;
vec4 mvPosition = modelViewMatrix * iw;
gl_Position = projectionMatrix * mvPosition;
`;
const REED_WORLD = /* glsl */ `
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
  vec4 worldPosition = modelMatrix * iw;
#endif
`;
const REED_FRAG_PARS = /* glsl */ `
varying vec2 vFloraXZ;
uniform highp sampler2DArray tField;
uniform vec4 uHzW0;
uniform vec4 uHzW1;
uniform float uSunTan;
uniform float uHzWorldInv;
uniform float uHzK;
`;
/** The land's long shadow on the reeds (the island flora's own chunk, vegetation.js FLORA_AO). */
const REED_AO = /* glsl */ `
#include <aomap_fragment>
{
  vec2 hzUv = clamp(vFloraXZ * uHzWorldInv + 0.5, vec2(0.5 / 512.0), vec2(1.0 - 0.5 / 512.0));
  float hzA = dot(texture(tField, vec3(hzUv, 1.0)), uHzW0) + dot(texture(tField, vec3(hzUv, 2.0)), uHzW1);
  hzA = hzA * hzA * 0.9;
  float hzV = mix(1.0, smoothstep(hzA - 0.016, hzA + 0.034, uSunTan), uHzK);
  reflectedLight.directDiffuse *= hzV;
  reflectedLight.directSpecular *= hzV;
  reflectedLight.indirectDiffuse *= 1.6;
}
`;

export class ReedDraw {
  constructor(ctx, mask, lean) {
    this.ctx = ctx;
    this.mask = mask;
    this.group = new THREE.Group();
    this.group.name = 'reeds';
    ctx.scene.add(this.group);
    this.uLean = { value: lean };
    this.uHeightC = { value: 2.9 };
    this.uHeightJ = { value: 0.95 };
    this._own = { geo: [], mat: [] };
    this.meshes = [];
    this.version = -1;
    this._cx = REED_MASK.size / 2 + mask.x0;
    this._cz = REED_MASK.size / 2 + mask.z0;
    const geoC = carrizoGeo(), geoJ = juncoGeo();
    this._own.geo.push(geoC, geoJ);
    this.matC = this._material(this.uHeightC, 'cal-reeds-c');
    this.matJ = this._material(this.uHeightJ, 'cal-reeds-j');
    // the plantings, once: [x, z, yaw, scale, bed, keep-hash] per kind, then kept or dropped by the cover
    this.sites = { c: this._sites(REED_KIND.CARRIZO, CARRIZO_PITCH, 11), j: this._sites(REED_KIND.JUNCO, JUNCO_PITCH, 23) };
    // one mesh per carrizo bed, one for all junco
    const byBed = new Map();
    for (const s of this.sites.c) { const b = s[4]; byBed.set(b, (byBed.get(b) || 0) + 1); }
    for (const [bed, n] of [...byBed.entries()].sort((a, b) => a[0] - b[0])) this._mesh(`reeds-carrizo-${bed}`, geoC, this.matC, n, (s) => s[4] === bed, this.sites.c);
    if (this.sites.j.length) this._mesh('reeds-junco', geoJ, this.matJ, this.sites.j.length, () => true, this.sites.j);
    this.plant();
  }

  _material(uHeight, key) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, side: THREE.DoubleSide });
    const V = this.ctx.vegetation;
    const uTime = V?._uTime || { value: 0 }, uWind = V?._uWind || { value: new THREE.Vector2(-0.7071, 0.7071) };
    const uActors = V?._uActors || { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uLean = this.uLean;
      shader.uniforms.uTime = uTime;
      shader.uniforms.uWind = uWind;
      shader.uniforms.uActors = uActors;
      shader.uniforms.uHeight = uHeight;
      const U = this.ctx.terrain?.groundUniforms;
      const lit = !!(U && U.tField);
      if (lit) {
        shader.uniforms.tField = U.tField;
        shader.uniforms.uHzW0 = U.uHzW0; shader.uniforms.uHzW1 = U.uHzW1;
        shader.uniforms.uSunTan = U.uSunTan; shader.uniforms.uHzWorldInv = U.uHzWorldInv; shader.uniforms.uHzK = U.uHzK;
      }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${REED_VERT}`)
        .replace('#include <project_vertex>', REED_PROJECT)
        .replace('#include <worldpos_vertex>', REED_WORLD);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${lit ? REED_FRAG_PARS : 'varying vec2 vFloraXZ;'}`)
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
        .replace('#include <aomap_fragment>', lit ? REED_AO : '#include <aomap_fragment>');
    };
    mat.customProgramCacheKey = () => key;
    this._own.mat.push(mat);
    return mat;
  }

  /** Every grid site of a kind with any base cover: [x, z, yaw, scale, bed, hash]. */
  _sites(kind, pitch, salt) {
    const M = this.mask, out = [];
    const n = Math.floor(REED_MASK.size / pitch);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = M.x0 + (i + 0.15 + hash2(i, j, salt) * 0.7) * pitch;
        const z = M.z0 + (j + 0.15 + hash2(i, j, salt + 1) * 0.7) * pitch;
        const b = M.baseAt(x, z);
        if (b < 0.06) continue;
        const bed = M.bedAt(x, z);
        if (!bed || bed.kind !== kind) continue;
        out.push([x, z, hash2(i, j, salt + 2) * Math.PI * 2, 0.8 + hash2(i, j, salt + 3) * 0.3, bed.id, hash2(i, j, salt + 4)]);
      }
    }
    return out;
  }

  _mesh(name, geo, mat, cap, pick, sites) {
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.count = 0;
    const aBed = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    // the bed index lives on the mesh's own geometry copy (a geometry shares attributes, not instanced ones)
    mesh.geometry = geo.clone();
    mesh.geometry.setAttribute('aBed', aBed);
    this._own.geo.push(mesh.geometry);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.group.add(mesh);
    this.meshes.push({ mesh, pick, sites, aBed });
  }

  /** Plant (or re-plant after a cut) every mesh from the mask's cover. Cold: boot and at most twice a second. */
  plant() {
    const M = this.mask, T = this.ctx.terrain;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    let total = 0;
    for (const D of this.meshes) {
      const { mesh, pick, sites, aBed } = D;
      let n = 0;
      for (const st of sites) {
        if (!pick(st)) continue;
        const c = M.cover(st[0], st[1]);
        // kept where the hash is under the cover: thin at a bed's edge, none in a cut lane
        if (c < 0.08 || st[5] > Math.min(1, c * 1.25)) continue;
        const h = T ? T.getHeight(st[0], st[1]) : 0;
        p.set(st[0], h - 0.04, st[1]);
        q.setFromAxisAngle(up, st[2]);
        const k = st[3] * (0.82 + 0.18 * Math.min(1, c * 1.3));
        s.set(k, k, k);
        m4.compose(p, q, s);
        mesh.setMatrixAt(n, m4);
        const v = 0.9 + st[5] * 0.16;
        col.setRGB(v, v, v * 0.98);
        mesh.setColorAt(n, col);
        aBed.array[n] = st[4];
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      aBed.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.visible = n > 0;
      total += n;
    }
    this.version = M.version;
    this.planted = total;
    return total;
  }

  /** Per frame: re-plant after a cut (at most twice a second), hide the whole belt when the lens is far. */
  update(dt) {
    this._replantT = (this._replantT || 0) + dt;
    if (this.mask.version !== this.version && this._replantT > 0.5) { this._replantT = 0; this.plant(); }
    const cam = this.ctx.camera?.position;
    if (cam) {
      const dx = cam.x - this._cx, dz = cam.z - this._cz;
      const near = dx * dx + dz * dz < 420 * 420;
      if (this.group.visible !== near) this.group.visible = near;
    }
  }

  stats() {
    const out = {};
    for (const { mesh } of this.meshes) {
      const tris = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
      out[mesh.name] = { instances: mesh.count, trisEach: tris };
    }
    return out;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    for (const g of this._own.geo) g.dispose();
    for (const m of this._own.mat) m.dispose();
  }
}

export { BEDS, MAX_BEDS };
