import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, fbm, biomesAt } from '../island/recipe.js';
import { malpaisSheet, malpaisCinder } from '../island/bake.js';
import { YARDS_WALK, APRON, apronUV } from './kilnyards-layout.js';
import { HORNITOS, TUBE_SHELTER, RUST_CONE, BENCH_B6 } from './malpais-layout.js';

/**
 * THE MALPAIS' ROCK (Milestone 3 wave 2, area A: the look; BIBLE §3.3; the KEY Malpais strip for form only). Three forms,
 * all built from code on the region's approach (./malpais-region.js), none at boot:
 *
 *   CLINKER    aa's rubble: loose jagged clasts 0.3-1.5 m on the aa (not on a pahoehoe sheet, a cinder band, Rust Cone,
 *              the Yards' bench or the walk grid), denser where the flow front piled them; instanced, one draw per
 *              96 m tile, tiles past CLINKER.far m hidden. No colliders: she walks over rubble (aa is slow ground, MP9)
 *   PINNACLES  the flow's jagged spires and pressure ridges, 2.5-8 m, on the aa: one merged mesh, each a capsule collider
 *   HORNITOS   the hornito field's seven spatter cones (./malpais-layout.js HORNITOS: the data and the colliders stay
 *              there), now lumpy spatter with a cold vent at the top (wave 1 drew truncated cones)
 *
 * Every form is rock: no emissive, no light (MP1). The placements are pure functions of the recipe (Node reads them:
 * tools/world/malpais.test.mjs) and are generated in slices so no frame pays for more than a slice
 * (`clinkerPlan(..., budgetMs)` resumes where it stopped).
 *
 *   clinkerPlan(ground, state?, budgetMs?)  -> { done, list: Float32Array-able [x, y, z, s, sy, yaw, ...], n }
 *   pinnaclePlan(ground)                   -> [{ id, x, z, y, h, r, lean, yaw }]
 *   clastGeometry(), pinnacleGeometry(list), hornitoGeometry(ground)
 */
export const CLINKER = Object.freeze({
  /** the Malpais box the scatter walks (engine x, z), the cell (m), the far distance (m) past which a tile is hidden */
  box: Object.freeze({ x0: 60, x1: 500, z0: -360, z1: 440 }), cell: 1.7, tile: 96, far: 230,
  /** a clast's size band (m), and the share of cells that hold one at the densest */
  size: Object.freeze([0.3, 1.5]), dens: 0.9,
});

const D2R = Math.PI / 180;
const _w = new Float64Array(6);
const _uv = { u: 0, v: 0 };

/** Is (x, z) kept clear of rubble and spires: the Yards' walk grid, the apron and its batter, the tube, the hornitos, B6. */
function clearOf(x, z, pad = 0) {
  const W = YARDS_WALK.box;
  if (x > W.x0 - pad && x < W.x1 + pad && z > W.z0 - pad && z < W.z1 + pad) return true;
  apronUV(x, -z, _uv);
  if (Math.abs(_uv.u) < APRON.halfLen + APRON.batter + 4 + pad && Math.abs(_uv.v) < APRON.halfWid + APRON.batter + 4 + pad) return true;
  if (Math.abs(_uv.u - TUBE_SHELTER.u) < TUBE_SHELTER.half + 5 + pad && _uv.v > TUBE_SHELTER.v0 - 4 && _uv.v < TUBE_SHELTER.v1 + 5) return true;
  for (const h of HORNITOS) if (Math.hypot(x - h.x, z - h.z) < h.r + 2.5 + pad) return true;
  if (Math.hypot(x - BENCH_B6.x, z - BENCH_B6.z) < 4 + pad) return true;
  return false;
}

/** Rust Cone's weight at an engine point: 1 on its cinder flanks, 0 past its skirt (the zone map's A channel too). */
export function coneWeight(x, z) {
  const d = Math.hypot(x - RUST_CONE.x, z - RUST_CONE.z);
  const t = Math.min(1, Math.max(0, (d - 62) / (94 - 62)));
  return 1 - t * t * (3 - 2 * t);
}

/** The aa's share at a point (not a pahoehoe sheet, not a cinder band, not Rust Cone), times the Malpais weight. */
export function aaShare(x, z, h) {
  biomesAt(x, z, _w);
  if (_w[2] < 0.5) return 0;
  const pah = malpaisSheet(x, z);
  const cin = malpaisCinder(x, z, h) * (1 - pah);
  return _w[2] * (1 - pah) * (1 - cin) * (1 - coneWeight(x, z));
}

/**
 * The clinker's placements, resumable: walks the box's cells row by row and returns when `budgetMs` is spent (Infinity:
 * all of it). `ground(x, z)` the drawn terrain. Each clast: x, y (sunk a third into the ground), z, s (m), sy (its height
 * as a share of s), yaw.
 */
export function clinkerPlan(ground, st = null, budgetMs = Infinity) {
  const B = CLINKER.box, c = CLINKER.cell;
  const s = st || { row: 0, list: [], done: false, n: 0 };
  const rows = Math.ceil((B.z1 - B.z0) / c), cols = Math.ceil((B.x1 - B.x0) / c);
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  while (s.row < rows) {
    const j = s.row++;
    const R = rng(0x3a11 + j * 7919);
    for (let i = 0; i < cols; i++) {
      const x = B.x0 + (i + R()) * c, z = B.z0 + (j + R()) * c;
      const keep = R(), size = R(), sy = R(), yaw = R();
      // piles: the flow fronts' rubble in bands 20-40 m apart, sparse between
      const pile = fbm(x * 0.045 + 11, z * 0.045 - 3, 2);
      const d = CLINKER.dens * (0.25 + 0.75 * Math.min(1, Math.max(0, (pile - 0.38) / 0.3)));
      if (keep > d) continue;
      const h = ground(x, z);
      if (h < 1.5) continue;
      const aa = aaShare(x, z, h);
      if (aa < 0.45) continue;
      if (clearOf(x, z)) continue;
      const gx = ground(x + 1, z) - ground(x - 1, z), gz = ground(x, z + 1) - ground(x, z - 1);
      if (Math.hypot(gx, gz) / 2 > 0.9) continue;      // no rubble on a face steeper than 42 deg
      const sc = CLINKER.size[0] + (CLINKER.size[1] - CLINKER.size[0]) * Math.pow(size, 2.2) * (0.6 + 0.4 * pile);
      s.list.push(x, h - sc * 0.22, z, sc, 0.45 + 0.35 * sy, yaw * Math.PI * 2);
      s.n++;
    }
    if (now() - t0 > budgetMs) return s;
  }
  s.done = true;
  return s;
}

/**
 * The pinnacles: spires and pressure ridges on the aa, 2.5-8 m, kept 6 m apart, more toward the sea front of the flow (the
 * KEY strip's field of spires, for form only). Deterministic; ~50.
 */
export function pinnaclePlan(ground) {
  const R = rng(0x91a7), out = [];
  const B = CLINKER.box;
  for (let k = 0; k < 2600 && out.length < 56; k++) {
    const x = B.x0 + R() * (B.x1 - B.x0), z = B.z0 + R() * (B.z1 - B.z0), hR = R(), rR = R(), lR = R(), yR = R();
    const h0 = ground(x, z);
    if (h0 < 4) continue;
    if (aaShare(x, z, h0) < 0.75) continue;
    if (clearOf(x, z, 8)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 6)) continue;
    const gx = ground(x + 2, z) - ground(x - 2, z), gz = ground(x, z + 2) - ground(x, z - 2);
    if (Math.hypot(gx, gz) / 4 > 0.6) continue;
    const h = 2.5 + 5.5 * Math.pow(hR, 1.7);
    out.push({ id: `pinnacle-${out.length + 1}`, x: +x.toFixed(2), z: +z.toFixed(2), y: +h0.toFixed(2), h: +h.toFixed(2), r: +(0.6 + h * 0.16 + rR * 0.5).toFixed(2), lean: (lR - 0.5) * 0.3, yaw: yR * Math.PI * 2 });
  }
  return out;
}

/* ------------------------------------------------------------------ geometry */

/** One jagged clast (an icosahedron pulled by a hashed field into flat broken faces), about unit size, 80 triangles. */
export function clastGeometry() {
  const g0 = new THREE.IcosahedronGeometry(0.5, 1), g = g0.index ? g0.toNonIndexed() : g0;
  const p = g.attributes.position;
  const R = rng(0x5eed);
  // five cutting planes: a vertex past a plane is pulled back onto it, so faces come out flat and the edges sharp
  const planes = [];
  for (let k = 0; k < 6; k++) { const a = R() * Math.PI * 2, b = (R() - 0.3) * 1.2; planes.push([Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b), 0.28 + R() * 0.14]); }
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    for (const [nx, ny, nz, d] of planes) { const e = v.x * nx + v.y * ny + v.z * nz - d; if (e > 0) v.set(v.x - nx * e, v.y - ny * e, v.z - nz * e); }
    v.multiplyScalar(0.85 + 0.3 * fbm(v.x * 3 + 5, v.z * 3 + v.y * 2, 2));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();   // non-indexed: flat faces
  g.computeBoundingSphere();
  return g;
}

/** A spire: an irregular tapering column of 7 sides in 6 rings, ragged and leaning, as one merged mesh for the list. */
export function pinnacleGeometry(list) {
  const parts = [];
  for (const P of list) {
    const R = rng(Math.floor(P.x * 131 + P.z * 7));
    const sides = 7, rings = 6, pos = [];
    const ring = [];
    for (let r = 0; r <= rings; r++) {
      const t = r / rings, y = t * P.h;
      const rad = P.r * (1 - 0.82 * Math.pow(t, 0.8)) * (r === rings ? 0.35 : 1);
      const off = [Math.sin(P.yaw) * P.lean * y, Math.cos(P.yaw) * P.lean * y];
      const row = [];
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2 + P.yaw + (R() - 0.5) * 0.5;
        const k = rad * (0.62 + 0.6 * R());
        row.push([Math.cos(a) * k + off[0], y + (r ? (R() - 0.5) * 0.35 : -0.8), Math.sin(a) * k + off[1]]);
      }
      ring.push(row);
    }
    const tri = (a, b, c) => pos.push(...a, ...b, ...c);
    for (let r = 0; r < rings; r++) for (let s = 0; s < sides; s++) {
      const a = ring[r][s], b = ring[r][(s + 1) % sides], c = ring[r + 1][s], d = ring[r + 1][(s + 1) % sides];
      tri(a, c, b); tri(b, c, d);
    }
    const top = ring[rings], cx = top.reduce((s, q) => s + q[0], 0) / sides, cz = top.reduce((s, q) => s + q[2], 0) / sides;
    const tip = [cx + (R() - 0.5) * 0.2, P.h + 0.25 + R() * 0.4, cz];
    for (let s = 0; s < sides; s++) tri(top[s], tip, top[(s + 1) % sides]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.translate(P.x, P.y, P.z);
    parts.push(g);
  }
  const g = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
  for (const q of parts) q.dispose();
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * The hornitos as spatter cones: a lumpy lathe from the foot to a ragged rim around a cold vent (the vent's throat drops
 * a metre inside), 18 sides in 9 rings, each lump its own. `ground(x, z)` the drawn terrain.
 */
export function hornitoGeometry(ground) {
  const parts = [];
  HORNITOS.forEach((H, hi) => {
    const R = rng(0x40a1 + hi * 977);
    const sides = 18, rings = 9, g0 = ground(H.x, H.z);
    const rings3 = [];
    for (let r = 0; r <= rings; r++) {
      const t = r / rings;
      // a spatter cone: concave flanks steepening to the rim, then the vent's throat inside it
      const throat = r === rings;
      const rad = throat ? H.r * 0.16 : H.r * (1 - 0.74 * Math.pow(t, 0.75));
      const y = throat ? H.h - 1.0 : -0.6 + (H.h + 0.6) * t;
      const row = [];
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const lump = 1 + (R() - 0.5) * 0.28 + Math.sin(a * 3 + hi) * 0.06;
        const rim = r === rings - 1 ? (R() - 0.5) * 0.5 : 0;
        row.push([H.x + Math.cos(a) * rad * lump, g0 + y + rim + (r && !throat ? (R() - 0.5) * 0.18 : 0), H.z + Math.sin(a) * rad * lump]);
      }
      rings3.push(row);
    }
    const pos = [];
    const tri = (a, b, c) => pos.push(...a, ...b, ...c);
    for (let r = 0; r < rings; r++) for (let s = 0; s < sides; s++) {
      const a = rings3[r][s], b = rings3[r][(s + 1) % sides], c = rings3[r + 1][s], d = rings3[r + 1][(s + 1) % sides];
      tri(a, c, b); tri(b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    parts.push(g);
  });
  const g = mergeGeometries(parts);
  for (const q of parts) q.dispose();
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** The pinnacles' colliders (vertical capsules, the lower two thirds), in collision.register's shape. */
export function pinnacleColliders(list) {
  return list.map((P) => ({ kind: 'landmark', id: P.id, shape: { type: 'capsule', a: [P.x, P.y - 0.5, P.z], b: [P.x, P.y + P.h * 0.66, P.z], radius: Math.max(0.4, P.r * 0.7) } }));
}

export { D2R };
