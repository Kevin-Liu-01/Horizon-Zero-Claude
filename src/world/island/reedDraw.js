import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BEDS, REED_KIND, REED_MASK } from './reedmask.js';

/**
 * THE REEDS, DRAWN FROM THE MASK (BUILD M1.6e). Every cane stands where `mask.cover(x, z)` (the base cover less the
 * Peg cuts) says reed stands, the same value the rule reads: the picture and the rule cannot disagree (TECH §5).
 *
 *   carrizo  a clump of 5 pale canes, 2.3-3.4 m (taller than Brea), each tapered on a slight curve, two blade leaves
 *            arching off its top third (folded on the midrib) and a slim nodding plume; 230 triangles. Planted on a
 *            jittered 1.3 m grid, kept where a hash is under the cover (thin at a bed's edge, gone in a cut lane).
 *   junco    a tuft of 14 dark rush stems, 0.7-1.15 m, one tapered sliver each: 14 triangles, on a 0.7 m grid (the
 *            lee hollows by the Glass and the lee ditch on the salt field's outer dyke).
 *
 * TILES (M1b round 2). One InstancedMesh per bed and 64 m tile of the mask, each shown only while the lens is within
 * 66 m of the tile's footprint (the canes are shrunk to their roots from 48 to 64 m): at 2d55d7c the nine bed meshes
 * and all 122,646 triangles were sent whenever the lens stood within 150 m of the Glass, though nothing past 64 m was
 * drawn. A tile's own bounding sphere lets the renderer's frustum cull drop the rest.
 *
 * THE LEAN. Each instance carries its bed (`aBed`); `uLean[bed]` is that bed's gust clock lean (src/game/reeds/gust.js),
 * written once a frame. A cane bends downwind (the trade's SW, vegetation's `uWind`) by its height squared: its tip
 * stands about 0.4 m off true in a lull and about 0.95 m in a full gust (a 2.9 m cane), with a flutter that quickens
 * with the gust. Brea and the nearest Instruments part the canes a little (vegetation's four displacers, at a third
 * of the marram's push: the stems stay in front of her). Drawn to 64 m from the lens (shrunk to the root from 48 m),
 * and shrunk to the root inside 2 m of the lens (round 2: a cane planted at the lens stood across F31's frame).
 *
 * Lit like the island's flora (the same standard material, the land's long shadow from the terrain's skyline
 * texture); casts no shadow (no plant does: A56). Allocation-free per frame.
 */
const CARRIZO_PITCH = 1.3;
const TILE = 64;
const SHOW_M = 66;
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

function geoOf(G) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(G.P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(G.C, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(G.N, 3));
  g.setIndex(G.I);
  g.computeBoundingSphere();
  return g;
}

/**
 * A ribbon along a polyline (closing round, M1b): `pts` its centre line, `half` its half-width at each point, `side` the
 * horizontal unit across it. Two columns, or three with `fold` > 0 (a leaf's midrib raised by fold x the half-width).
 * `round` (the canes): the two edges' normals lean out to either side, so a cane is lit across its width like a stem
 * and not as one flat card (F31 at c455362: flat straight strips).
 */
function ribbon(G, pts, half, side, c0, c1, { fold = 0, round = 0, along = null } = {}) {
  const [sx, sz] = side;
  const base = G.P.length / 3;
  const cols = fold > 0 ? [-1, 0, 1] : [-1, 1], nc = cols.length;
  const n = pts.length;
  for (let s = 0; s < n; s++) {
    const t = s / (n - 1), [x, y, z] = pts[s], ww = half[s];
    for (const k of cols) {
      const lift = k === 0 ? fold * ww : 0;
      G.P.push(x + sx * ww * k, y + lift, z + sz * ww * k);
      const sh = k === 0 ? 1.06 : 1;
      G.C.push((c0.r + (c1.r - c0.r) * t) * sh, (c0.g + (c1.g - c0.g) * t) * sh, (c0.b + (c1.b - c0.b) * t) * sh);
      if (fold > 0) G.N.push(along[0] * 0.25 + sx * 0.55 * k, 0.8, along[1] * 0.25 + sz * 0.55 * k);
      else G.N.push(sx * round * k, 0.85, sz * round * k);
    }
    if (s < n - 1) {
      const a = base + s * nc;
      for (let c = 0; c < nc - 1; c++) G.I.push(a + c, a + c + 1, a + c + 1 + nc, a + c, a + c + 1 + nc, a + c + nc);
    }
  }
}

/**
 * Carrizo: 5 canes, each a tapered cane on a slight curve (4 segments), two blade leaves arching off its top third
 * (4 segments, folded on the midrib, broadest a third of the way out and drawn to a point) and a slim nodding plume
 * (3 segments, pointed at both ends) = 230 triangles. Pale straw with a sage foot, never gold.
 * (Closing round, F31 at c455362: the canes read as flat straight strips with hard kinks across the frame. The kinks were
 * the two-segment leaves, out straight then bent down at one joint, set at mid-height across her; the arrowheads were the
 * one-segment plumes.)
 */
export function carrizoGeo(seed = 0xca77) {
  const R = rand(seed), G = { P: [], C: [], N: [], I: [] };
  const cane0 = new THREE.Color('#87896a'), cane1 = new THREE.Color('#ddd4b8');
  const leaf0 = new THREE.Color('#a3aa8a'), leaf1 = new THREE.Color('#d6d0b6');
  const plume0 = new THREE.Color('#d9cfb6'), plume1 = new THREE.Color('#efe7d6');
  const c0 = new THREE.Color(), c1 = new THREE.Color();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + R() * 0.8, r0 = 0.05 + R() * 0.35;
    const ox = Math.cos(a) * r0, oz = Math.sin(a) * r0;
    const H = 2.3 + R() * 1.1, tilt = 0.03 + R() * 0.06;
    // the curve: the cane bows out from its clump, more toward the tip (a quadratic, 3-8 % of its height at the tip)
    const bow = 0.03 + R() * 0.05, ba = a + (R() - 0.5) * 0.8;
    const tx = Math.cos(a) * tilt, tz = Math.sin(a) * tilt, bx = Math.cos(ba) * bow, bz = Math.sin(ba) * bow;
    const at = (t) => [ox + (tx * t + bx * t * t) * H, H * t, oz + (tz * t + bz * t * t) * H];
    const sideA = a + Math.PI / 2 + (R() - 0.5) * 0.6;
    const side = [Math.cos(sideA), Math.sin(sideA)];
    c0.copy(cane0).multiplyScalar(0.88 + R() * 0.2); c1.copy(cane1).multiplyScalar(0.9 + R() * 0.12);
    // the cane: 4 segments, 0.040 m across at the foot drawn down to 0.008 m at the tip
    const CS = 4, cp = [], ch = [];
    for (let s = 0; s <= CS; s++) { const t = s / CS; cp.push(at(t)); ch.push(0.020 * (1 - 0.8 * t)); }
    ribbon(G, cp, ch, side, c0, c1, { round: 0.55 });
    // two blade leaves off the top third, on opposite sides, arching up and out then over (a smooth parabola, no joint)
    for (let l = 0; l < 2; l++) {
      const t0 = 0.66 + l * 0.14 + R() * 0.06, la = a + (l ? Math.PI : 0) + (R() - 0.5) * 1.4;
      const o = at(t0), L = 0.55 + R() * 0.3, dx = Math.cos(la), dz = Math.sin(la);
      const rise = 0.55 + R() * 0.25, fall = 0.85 + R() * 0.3, W = 0.020 + R() * 0.006;
      const LS = 4, lp = [], lh = [];
      for (let s = 0; s <= LS; s++) {
        const u = s / LS, r = L * u * (0.95 - 0.15 * u);
        lp.push([o[0] + dx * r, o[1] + L * (rise * u - fall * u * u), o[2] + dz * r]);
        // lanceolate: clasping at the cane, broadest a third out, to a point
        lh.push(W * (u < 0.34 ? 0.55 + 1.32 * u : 1.0 - (u - 0.34) / 0.66 * 0.94));
      }
      c0.copy(leaf0).multiplyScalar(0.9 + R() * 0.15); c1.copy(leaf1).multiplyScalar(0.92 + R() * 0.12);
      ribbon(G, lp, lh, [-dz, dx], c0, c1, { fold: 0.45, along: [dx, dz] });
    }
    // the plume: slim, nodding over to one side, pointed at both ends
    const top = at(1), pa = a + (R() - 0.5) * 1.2, px = Math.cos(pa), pz = Math.sin(pa), PL = 0.38 + R() * 0.14;
    const pp = [], ph = [];
    for (let s = 0; s <= 3; s++) { const u = s / 3; pp.push([top[0] + px * PL * 0.45 * u * u, top[1] - 0.02 + PL * (0.9 * u - 0.3 * u * u), top[2] + pz * PL * 0.45 * u * u]); ph.push(0.024 * Math.sin(Math.PI * (0.12 + 0.8 * u))); }
    c0.copy(plume0); c1.copy(plume1);
    ribbon(G, pp, ph, [-pz, px], c0, c1, { round: 0.3 });
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
  // drawn to 64 m: shrunk to its root between 48 and 64 m from the lens (the belt is not a vista element; the accepted
  // salt-cell frames F14-F19 stand 65 m from the nearest reed, F05 and F20 further)
  float fade = (1.0 - smoothstep(48.0, 64.0, distance(o, cameraPosition))) * smoothstep(1.0, 2.0, distance(o.xz, cameraPosition.xz));
  iw.xyz = o + (iw.xyz - o) * fade;
  float sy = length(instanceMatrix[1].xyz);
  float yl = max(iw.y - o.y, 0.0);
  float hh = clamp(yl / (uHeight * sy), 0.0, 1.25);
  float h2 = hh * hh;
  float lean = uLean[int(aBed + 0.5)];
  float ph = dot(o.xz, vec2(0.37, 0.61)) + uTime * (1.4 + 1.8 * lean);
  float flut = sin(ph) * 0.05 + sin(ph * 2.7 + o.x) * 0.025;
  // the bend at the tip, metres: a standing lean SW, the gust clock's lean, the flutter
  // (round 2: the standing lean 0.09 -> 0.16 of the height: a 2.9 m cane's tip 0.6 m off true in a lull, 1.2 m in a
  // gust, so the canes read as leaning SW even from a lens that faces into the trade, as F31's does)
  float bend = (0.16 + 0.24 * lean + flut * (0.35 + lean)) * uHeight * sy;
  vec2 off = uWind * bend * h2;
  // she and the nearest Instruments part the canes (vegetation's displacers)
  for (int a = 0; a < 4; a++) {
    vec2 dv = iw.xz - uActors[a].xy;
    float dl = length(dv) + 1e-3;
    float pu = (1.0 - smoothstep(0.0, uActors[a].z * 1.15, dl)) * uActors[a].w;
    off += (dv / dl) * pu * 0.3 * hh;
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
    const geoC = carrizoGeo(), geoJ = juncoGeo();
    this._own.geo.push(geoC, geoJ);
    this.matC = this._material(this.uHeightC, 'cal-reeds-c');
    this.matJ = this._material(this.uHeightJ, 'cal-reeds-j');
    // the plantings, once: [x, z, yaw, scale, bed, keep-hash] per kind, then kept or dropped by the cover
    this.sites = { c: this._sites(REED_KIND.CARRIZO, CARRIZO_PITCH, 11), j: this._sites(REED_KIND.JUNCO, JUNCO_PITCH, 23) };
    // one mesh per bed and 64 m tile (see TILES)
    for (const [kind, list, geo, mat] of [['carrizo', this.sites.c, geoC, this.matC], ['junco', this.sites.j, geoJ, this.matJ]]) {
      const by = new Map();
      for (const st of list) {
        const key = `${st[4]}-${Math.floor((st[0] - mask.x0) / TILE)}-${Math.floor((st[1] - mask.z0) / TILE)}`;
        let g = by.get(key);
        if (!g) by.set(key, (g = []));
        g.push(st);
      }
      for (const key of [...by.keys()].sort()) this._mesh(`reeds-${kind}-${key}`, geo, mat, by.get(key).length, () => true, by.get(key));
    }
    this.shown = 0;
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
    // the tile's footprint (its sites, plus a cane's reach), for the distance cull
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const st of sites) { x0 = Math.min(x0, st[0]); z0 = Math.min(z0, st[1]); x1 = Math.max(x1, st[0]); z1 = Math.max(z1, st[1]); }
    this.meshes.push({ mesh, pick, sites, aBed, box: [x0 - 1.5, z0 - 1.5, x1 + 1.5, z1 + 1.5], n: 0 });
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
      D.n = n;
      mesh.visible = n > 0 && this._near(D);
      total += n;
    }
    this.version = M.version;
    this.planted = total;
    return total;
  }

  /** The lens is within SHOW_M of this tile's footprint (plan distance). */
  _near(D) {
    const cam = this.ctx.camera?.position;
    if (!cam) return true;
    const b = D.box;
    const dx = Math.max(b[0] - cam.x, 0, cam.x - b[2]), dz = Math.max(b[1] - cam.z, 0, cam.z - b[3]);
    return dx * dx + dz * dz < SHOW_M * SHOW_M;
  }

  /** Per frame: re-plant after a cut (at most twice a second); show the tiles within SHOW_M of the lens. */
  update(dt) {
    this._replantT = (this._replantT || 0) + dt;
    if (this.mask.version !== this.version && this._replantT > 0.5) { this._replantT = 0; this.plant(); }
    let shown = 0;
    for (let i = 0; i < this.meshes.length; i++) {
      const D = this.meshes[i], on = D.n > 0 && this._near(D);
      if (D.mesh.visible !== on) D.mesh.visible = on;
      if (on) shown++;
    }
    this.shown = shown;
  }

  /** Per tile: instances, triangles each; and what the lens is sent now (tiles shown, their instances and triangles). */
  stats() {
    const out = { tiles: {}, shown: { meshes: 0, instances: 0, tris: 0 }, all: { meshes: 0, instances: 0, tris: 0 } };
    for (const D of this.meshes) {
      const { mesh } = D;
      const tris = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
      out.tiles[mesh.name] = { instances: mesh.count, trisEach: tris, shown: mesh.visible };
      if (D.n > 0) { out.all.meshes++; out.all.instances += mesh.count; out.all.tris += mesh.count * tris; }
      if (mesh.visible) { out.shown.meshes++; out.shown.instances += mesh.count; out.shown.tris += mesh.count * tris; }
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
