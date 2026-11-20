import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, fbm, biomesAt } from '../island/recipe.js';
import { malpaisSheet, malpaisCinder } from '../island/bake.js';
import { YARDS_WALK, APRON, apronUV } from './kilnyards-layout.js';
import { HORNITOS, TUBE_SHELTER, RUST_CONE, BENCH_B6, VENTS, tubeSL, tubeEN } from './malpais-layout.js';
import { ISLAND_SCALE as S } from '../island/extent.js';

/**
 * THE MALPAIS' ROCK (Milestone 3 wave 2, area A: the look; BIBLE §3.3; the KEY Malpais strip for form only). Three forms,
 * all built from code on the region's approach (./malpais-region.js), none at boot:
 *
 *   CLINKER    aa's rubble: loose jagged clasts 0.3-1.5 m on the aa (not on a pahoehoe sheet, a cinder band, Rust Cone,
 *              the Yards' bench or the walk grid), denser where the flow front piled them; instanced, one draw per
 *              96 m tile, tiles past CLINKER.far m hidden. No colliders: she walks over rubble (aa is slow ground, MP9)
 *   PINNACLES  the flow's jagged spires, 3-15 m (fix round 1: were 2.5-8 m and read as small cones past 60 m), on the aa,
 *              some in clusters of two or three: one merged mesh, each a capsule collider
 *   RIDGES     (fix round 1: the plain read flat past 90 m) the flow's pressure ridges and tumuli, whalebacks 9-28 m long and
 *              2-5 m high with a cleft along the crest, on the aa and the sheets: one merged mesh, each a capsule collider
 *   HORNITOS   the hornito field's seven spatter chimneys (./malpais-layout.js HORNITOS: the data and the colliders stay
 *              there): steep, taller than wide, rolls of spatter stacked up the flanks, a ragged rim round a cold vent (fix
 *              round 1: wave 2's first look drew them as rounded rubble heaps)
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
const _uv = { u: 0, v: 0 }, _sl = { s: 0, l: 0 };

/** Is (x, z) kept clear of rubble and spires: the Yards' walk grid, the apron and its batter, the tube, the hornitos, B6. */
function clearOf(x, z, pad = 0) {
  const W = YARDS_WALK.box;
  if (x > W.x0 - pad && x < W.x1 + pad && z > W.z0 - pad && z < W.z1 + pad) return true;
  apronUV(x, -z, _uv);
  if (Math.abs(_uv.u) < APRON.halfLen + APRON.batter + 4 + pad && Math.abs(_uv.v) < APRON.halfWid + APRON.batter + 4 + pad) return true;
  // (R9) the tube shelter on the hornito field: its foot and 2 m round it, and 6 m in front of its mouth
  tubeSL(x, z, _sl);
  if (_sl.s > -6 - pad && _sl.s < TUBE_SHELTER.len + 3 + pad && Math.abs(_sl.l) < TUBE_SHELTER.foot + 2 + pad) return true;
  for (const v of VENTS) if (Math.hypot(x - v.x, z - v.z) < 3 + pad) return true;
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
 * The pinnacles: the flow's spires, 4-15 m, kept 5 m apart, a third of them with one or two smaller beside them (the KEY
 * strip's field of spires, for form only). Deterministic; ~90.
 */
export const PINNACLES = Object.freeze({ max: 90, minGap: 5, h: Object.freeze([4, 15]) });
export function pinnaclePlan(ground) {
  const R = rng(0x91a7), out = [];
  const B = CLINKER.box;
  const tryAt = (x, z, hR, rR, lR, yR, hMax) => {
    const h0 = ground(x, z);
    if (h0 < 4) return false;
    if (aaShare(x, z, h0) < 0.75) return false;
    if (clearOf(x, z, 8)) return false;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < PINNACLES.minGap)) return false;
    const gx = ground(x + 2, z) - ground(x - 2, z), gz = ground(x, z + 2) - ground(x, z - 2);
    if (Math.hypot(gx, gz) / 4 > 0.6) return false;
    const h = Math.min(hMax, PINNACLES.h[0] + (PINNACLES.h[1] - PINNACLES.h[0]) * Math.pow(hR, 1.5));
    out.push({ id: `pinnacle-${out.length + 1}`, x: +x.toFixed(2), z: +z.toFixed(2), y: +h0.toFixed(2), h: +h.toFixed(2), r: +(0.7 + h * 0.13 + rR * 0.5).toFixed(2), lean: (lR - 0.5) * 0.24, yaw: yR * Math.PI * 2 });
    return true;
  };
  for (let k = 0; k < 4000 && out.length < PINNACLES.max; k++) {
    const x = B.x0 + R() * (B.x1 - B.x0), z = B.z0 + R() * (B.z1 - B.z0), hR = R(), rR = R(), lR = R(), yR = R(), cR = R(), aR = R();
    if (!tryAt(x, z, hR, rR, lR, yR, Infinity)) continue;
    // a cluster: one or two smaller spires 5-9 m off the first
    if (cR < 0.35) for (let j = 0; j < 1 + (cR < 0.15 ? 1 : 0) && out.length < PINNACLES.max; j++) {
      const a = aR * Math.PI * 2 + j * 2.4, d = 5.2 + 3.5 * R();
      tryAt(x + Math.cos(a) * d, z + Math.sin(a) * d, R() * 0.6, R(), R(), R(), out[out.length - 1].h * 0.8);
    }
  }
  // (M3 wave 2b, MP7: "a field of spires", the KEY strip's for form only) two fields where the spires stand close, below
  // F56's lens on Rust Cone's south-west foot and past the hornito field toward the sea front: slimmer spires 4.5 m apart
  for (const F of SPIRE_FIELDS) {
    const RF = rng(F.seed);
    let made = 0;
    for (let k = 0; k < 900 && made < F.n; k++) {
      const a = RF() * Math.PI * 2, d = F.r * Math.sqrt(RF()), hR = RF(), rR = RF(), lR = RF(), yR = RF();
      const x = F.x + Math.cos(a) * d, z = F.z + Math.sin(a) * d, h0 = ground(x, z);
      if (h0 < 4 || aaShare(x, z, h0) < 0.6 || clearOf(x, z, 4)) continue;
      if (out.some((p) => Math.hypot(p.x - x, p.z - z) < F.gap)) continue;
      const gx = ground(x + 2, z) - ground(x - 2, z), gz = ground(x, z + 2) - ground(x, z - 2);
      if (Math.hypot(gx, gz) / 4 > 0.65) continue;
      const h = F.h[0] + (F.h[1] - F.h[0]) * Math.pow(hR, 1.2);
      out.push({ id: `pinnacle-${out.length + 1}`, x: +x.toFixed(2), z: +z.toFixed(2), y: +h0.toFixed(2), h: +h.toFixed(2), r: +(0.45 + h * 0.085 + rR * 0.35).toFixed(2), lean: (lR - 0.5) * 0.2, yaw: yR * Math.PI * 2, field: F.id });
      made++;
    }
  }
  return out;
}
/** The spire fields (engine x, z; r the field's radius, n spires at most, gap between them, h their heights). */
export const SPIRE_FIELDS = Object.freeze([
  Object.freeze({ id: 'cone-foot', x: 238.7, z: 194, r: 24, n: 26, gap: 4.5, h: Object.freeze([5, 15]), seed: 0x51f1 }),
  Object.freeze({ id: 'sea-front', x: 312.5, z: 238.3, r: 26, n: 26, gap: 4.5, h: Object.freeze([5, 14]), seed: 0x51f2 }),
]);

/**
 * The pressure ridges and tumuli: { id, x, z, y, len, wid, h, yaw } (engine; yaw turns the long axis), on Malpais ground
 * off Rust Cone and kept off the walk grid, the apron, the tube and the hornitos (clearOf, 10 m), 14 m from a spire and
 * 6 m from each other. Ridges (long and narrow) where the aa is, tumuli (shorter, wider) on the sheets. Deterministic; ~60.
 */
export const RIDGES = Object.freeze({ max: 60, h: Object.freeze([2, 5]) });
export function ridgePlan(ground, pins = null) {
  const R = rng(0x7d11), out = [];
  const B = CLINKER.box;
  pins ||= pinnaclePlan(ground);
  for (let k = 0; k < 12000 && out.length < RIDGES.max; k++) {
    const x = B.x0 + R() * (B.x1 - B.x0), z = B.z0 + R() * (B.z1 - B.z0), hR = R(), lR = R(), wR = R(), yR = R();
    biomesAt(x, z, _w);
    if (_w[2] < 0.6) continue;
    const h0 = ground(x, z);
    if (h0 < 5) continue;
    if (coneWeight(x, z) > 0.05) continue;
    if (clearOf(x, z, 10)) continue;
    const gx = ground(x + 4, z) - ground(x - 4, z), gz = ground(x, z + 4) - ground(x, z - 4);
    if (Math.hypot(gx, gz) / 8 > 0.5) continue;       // on the flow's flats and slopes to 27 deg, not its fronts
    const tumulus = malpaisSheet(x, z) > 0.5;
    const len = tumulus ? 9 + 8 * lR : 14 + 14 * lR, wid = tumulus ? 6 + 4 * wR : 5 + 3 * wR;
    const h = RIDGES.h[0] + (RIDGES.h[1] - RIDGES.h[0]) * Math.pow(hR, 1.3) * (tumulus ? 0.8 : 1);
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < (p.len + len) * 0.5 + 6)) continue;
    if (pins.some((p) => Math.hypot(p.x - x, p.z - z) < len * 0.5 + 4)) continue;
    // a ridge lies across the flow (the ground's fall turned 90 deg), a tumulus any way
    const yaw = tumulus ? yR * Math.PI : Math.atan2(gz, gx) + Math.PI / 2 + (yR - 0.5) * 0.6;
    out.push({ id: `ridge-${out.length + 1}`, x: +x.toFixed(2), z: +z.toFixed(2), y: +h0.toFixed(2), len: +len.toFixed(2), wid: +wid.toFixed(2), h: +h.toFixed(2), yaw: +yaw.toFixed(3), tumulus });
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

/** A spire: an irregular tapering column of 8 sides in 8 rings, ragged, notched and leaning, its top broken into one or two
 * teeth, as one merged mesh for the list. */
export function pinnacleGeometry(list) {
  const parts = [];
  for (const P of list) {
    const R = rng(Math.floor(P.x * 131 + P.z * 7));
    const sides = 8, rings = 8, pos = [];
    const ring = [];
    // a notch: one ring pulled in hard (a joint where a slab broke off), and a bulge below it
    const notch = 2 + Math.floor(R() * 4), lumpS = R() * sides;
    for (let r = 0; r <= rings; r++) {
      const t = r / rings, y = t * P.h;
      let rad = P.r * (1 - 0.8 * Math.pow(t, 0.7)) * (r === rings ? 0.3 : 1);
      if (r === notch) rad *= 0.7; else if (r === notch - 1) rad *= 1.12;
      const off = [Math.sin(P.yaw) * P.lean * y, Math.cos(P.yaw) * P.lean * y];
      const row = [];
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2 + P.yaw + (R() - 0.5) * 0.55;
        // slabby faces: a side or two flattened, one buttress out
        const slab = Math.abs(((s - lumpS + sides) % sides) - 1) < 0.6 ? 1.3 : 1;
        const k = rad * (0.55 + 0.6 * R()) * slab;
        row.push([Math.cos(a) * k + off[0], y + (r ? (R() - 0.5) * 0.5 : -0.9), Math.sin(a) * k + off[1]]);
      }
      ring.push(row);
    }
    const tri = (a, b, c) => pos.push(...a, ...b, ...c);
    for (let r = 0; r < rings; r++) for (let s = 0; s < sides; s++) {
      const a = ring[r][s], b = ring[r][(s + 1) % sides], c = ring[r + 1][s], d = ring[r + 1][(s + 1) % sides];
      tri(a, c, b); tri(b, c, d);
    }
    // the broken top: one tooth on a side of the top ring, and a second lower one opposite on two spires in three
    const top = ring[rings], cx = top.reduce((s, q) => s + q[0], 0) / sides, cz = top.reduce((s, q) => s + q[2], 0) / sides;
    const s0 = Math.floor(R() * sides), q0 = top[s0];
    const tip = [cx * 0.4 + q0[0] * 0.6, P.h + 0.6 + R() * P.h * 0.08, cz * 0.4 + q0[2] * 0.6];
    const q1 = top[(s0 + 4) % sides], tip2 = R() < 0.66 ? [cx * 0.35 + q1[0] * 0.65, P.h + 0.15 + R() * 0.4, cz * 0.35 + q1[2] * 0.65] : null;
    for (let s = 0; s < sides; s++) {
      const other = tip2 && ((s - s0 + sides) % sides) >= 2 && ((s - s0 + sides) % sides) <= 6;
      tri(top[s], other ? tip2 : tip, top[(s + 1) % sides]);
    }
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

/** The ridges and tumuli: a whaleback grid of 14 x 7 over an ellipse, its crest split by a cleft (a ridge's crest cracked
 * as the crust was pushed up), lumpy, its foot sunk 0.8 m. One merged mesh for the list. */
export function ridgeGeometry(list, ground) {
  const parts = [];
  for (const P of list) {
    const R = rng(Math.floor(P.x * 97 + P.z * 13));
    const NU = 14, NV = 7, c = Math.cos(P.yaw), s = Math.sin(P.yaw), pos = [];
    const lump = [R() * 6, R() * 6, R() * 6];
    const pt = (i, j) => {
      const u = -1 + 2 * i / NU, v = -1 + 2 * j / NV;
      const e = Math.min(1, u * u + v * v);
      // the profile: steep flanks, a broad crest, the cleft along u at v ~ 0 on the crest's middle 70 %
      let h = P.h * Math.pow(1 - e, 0.55);
      h *= 1 + 0.12 * Math.sin(u * 5 + lump[0]) + 0.08 * Math.sin(v * 7 + lump[1]) + (R() - 0.5) * 0.12;
      h -= P.h * 0.32 * Math.exp(-(v * v) / 0.02) * (1 - Math.min(1, Math.abs(u) / 0.7));
      const lu = u * P.len * 0.5 * (1 + (R() - 0.5) * 0.06), lv = v * P.wid * 0.5 * (1 + 0.08 * Math.sin(u * 4 + lump[2]));
      const x = P.x + lu * c - lv * s, z = P.z + lu * s + lv * c;
      return [x, ground(x, z) - 0.8 + Math.max(0, h) + (e >= 1 ? 0 : 0.8 * Math.min(1, (1 - e) * 6)), z];
    };
    const grid = [];
    for (let j = 0; j <= NV; j++) { const row = []; for (let i = 0; i <= NU; i++) row.push(pt(i, j)); grid.push(row); }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = grid[j][i], b = grid[j][i + 1], d = grid[j + 1][i], e = grid[j + 1][i + 1];
      pos.push(...a, ...d, ...b, ...b, ...d, ...e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    parts.push(g);
  }
  const g = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
  for (const q of parts) q.dispose();
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** The ridges' colliders: a capsule along each one's long axis at a third of its height (the crest she cannot walk). */
export function ridgeColliders(list, ground) {
  return list.map((P) => {
    const c = Math.cos(P.yaw), s = Math.sin(P.yaw), L = Math.max(0.5, P.len * 0.5 - P.wid * 0.4), r = Math.max(0.6, Math.min(P.wid * 0.4, P.h * 0.7));
    const ax = P.x - c * L, az = P.z - s * L, bx = P.x + c * L, bz = P.z + s * L;
    return { kind: 'landmark', id: P.id, shape: { type: 'capsule', a: [ax, ground(ax, az) + P.h * 0.35, az], b: [bx, ground(bx, bz) + P.h * 0.35, bz], radius: r } };
  });
}

/**
 * The hornitos as spatter chimneys (fix round 1): a short flared skirt, then a steep column taller than it is wide, built of
 * rolls of spatter (each ring bulged and set off a little from the one below), a ragged rim round a vent whose throat drops
 * a metre and a half inside. 16 sides in 12 rings, each one its own. `ground(x, z)` the drawn terrain.
 */
export function hornitoGeometry(ground) {
  const parts = [];
  HORNITOS.forEach((H, hi) => {
    const R = rng(0x40a1 + hi * 977);
    const sides = 16, rings = 12, g0 = ground(H.x, H.z);
    const rings3 = [];
    let ox = 0, oz = 0;
    for (let r = 0; r <= rings; r++) {
      const t = r / rings;
      const throat = r === rings;
      // the skirt flares over the lowest sixth; the column tapers from 0.62 of the foot to 0.42 at the rim
      const prof = t < 0.17 ? 1 - (t / 0.17) * 0.38 : 0.62 - (t - 0.17) / 0.83 * 0.2;
      const roll = r > 1 && !throat ? 1 + 0.1 * Math.sin(r * 2.1 + hi) : 1;
      const rad = throat ? H.r * 0.2 : H.r * prof * roll;
      const y = throat ? H.h - 1.5 : -0.6 + (H.h + 0.6) * t;
      if (r > 2 && !throat) { ox += (R() - 0.5) * 0.12 * H.r; oz += (R() - 0.5) * 0.12 * H.r; }
      const row = [];
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const lump = 1 + (R() - 0.5) * 0.3 + Math.sin(a * 3 + hi) * 0.07;
        const rim = r === rings - 1 ? (R() - 0.3) * 0.7 : 0;
        row.push([H.x + ox + Math.cos(a) * rad * lump, g0 + y + rim + (r && !throat ? (R() - 0.5) * 0.2 : 0), H.z + oz + Math.sin(a) * rad * lump]);
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

/**
 * The tube shelter (M3 wave 2b, R9; ./malpais-layout.js TUBE_SHELTER): a pahoehoe tube lying on the hornito field's floor
 * under its own proud crust, broken open at its upslope end (the mouth) and closed at the back, where the crust rounds
 * down into the flow. Built as rings along its axis: the outer crust (a flattened arch over a skirt sunk into the ground)
 * and the inner vault (the headroom over the floor, its walls sunk below it), joined at the mouth by the crust's lip and
 * at the back by the vault's end.
 * (M3 wave 3, MP6: wave 2b's tube read as a faceted blockout arch: one flat normal a triangle, a ring a metre, each rim
 * vertex pushed by its own random step) Each surface is one welded grid (shared vertices: smooth normals), a ring every
 * 0.55 m and 25 points an arch. The crust is a low, round-shouldered hump (an ellipse over a skirt 5.5 m out, not wave
 * 2b's upright super-ellipse), lumped by the recipe's own noise at the vertex's place (first film at 55126d7: lumps
 * from sines of (s, angle) hung in folds like a draped cloth). At the mouth the
 * roof runs out past the opening as a lip, up to LIP m over the floor's edge and thinning to a drooped, rounded edge, as
 * a tube's crust breaks back where its roof fell in; the walls under it are cut back. `ground(x, z)` the drawn terrain
 * (engine frame). About 3,000 triangles.
 */
export const TUBE_LIP = 1.4;
export function tubeGeometry(ground) {
  const T = TUBE_SHELTER, R = rng(0x7b0e);
  const K = 25, p = 2.5, ds = 0.55;
  const arch = (W, H, th) => { const c = Math.cos(th), sn = Math.sin(th); return [W * Math.sign(c) * Math.pow(Math.abs(c), 2 / p), H * Math.pow(Math.abs(sn), 2 / p)]; };
  const floorAt = (sv) => { const q = tubeEN(Math.max(-2, Math.min(T.len, sv)), 0); return ground(q.e * S, -q.n * S); };
  const P = (sv, l, y) => { const q = tubeEN(sv, l); return [q.e * S, y, -q.n * S]; };
  const N = Math.round(T.len / ds);
  const lump = [R() * 6, R() * 6, R() * 6, R() * 6, R() * 6, R() * 6];
  // the crust's lumps: the recipe's noise at the point (blobs of 2-4 m and a little of 1 m), smooth, no folds
  const crust = (sv, th, l, y) => { const q = tubeEN(sv, l); return 1 + 0.16 * (fbm(q.e * 0.31 + y * 0.23 + lump[2], q.n * 0.31 - y * 0.17, 3) - 0.5) + 0.05 * (fbm(q.e * 1.1 + 7.1, q.n * 1.1 + y * 0.9, 2) - 0.5); };
  // the lip: how far the roof runs out past the mouth at an arch angle (0 at the feet, LIP over the crown, ragged)
  const lipAt = (th) => TUBE_LIP * Math.pow(Math.sin(th), 1.6) * (0.75 + 0.25 * Math.sin(th * 3.7 + lump[5]));
  const sway = (sv) => 0.6 * Math.sin(sv * 0.23 + lump[0]);
  const hkAt = (sv) => 1 + 0.08 * Math.sin(sv * 0.41 + lump[1]);
  const pos = [], idx = [];
  const grid = (rings, flip) => {
    const base = pos.length / 3, M = rings[0].length;
    for (const r of rings) for (const v of r) pos.push(v[0], v[1], v[2]);
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < M - 1; k++) {
      const a = base + i * M + k, b = a + 1, c = a + M, d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    return base;
  };
  // the outer crust: ring 0 is the lip's edge, out past the mouth; then the arch every ds m; then the tail into the ground
  const outer = [];
  const outerRing = (sv, tail, lipK) => {
    const f = floorAt(sv), w = sway(sv), hk = hkAt(sv);
    const Wo = (T.half + T.wall + 0.7) * (tail < 1 ? 0.6 + 0.4 * tail : 1), Ho = (T.height + T.crust) * hk * tail, Wf = T.foot + 0.6;
    const r = [P(sv, w + Wf * (tail < 1 ? 0.75 : 1), f - 1.0)];
    for (let k = 0; k < K; k++) {
      const th = (k / (K - 1)) * Math.PI, c = Math.cos(th), sn = Math.sin(th);
      // a round-shouldered hump: an ellipse (p 2), its shoulders a little fuller than a circle's
      const l = Wo * c, y = Ho * Math.pow(sn, 0.8), n = crust(sv, th, l, y);
      const out = lipK * lipAt(th);
      r.push(P(sv - out, w + l * n, f + Math.max(-0.4, y * n) - lipK * 0.12 * sn));
    }
    r.push(P(sv, w - Wf * (tail < 1 ? 0.75 : 1), f - 1.0));
    return r;
  };
  outer.push(outerRing(0, 1, 1));
  for (let i = 1; i <= N; i++) outer.push(outerRing(i * ds, 1, 0));
  for (const [ext, tail] of [[0.9, 0.8], [1.8, 0.55], [2.7, 0.3], [3.4, 0.12]]) outer.push(outerRing(T.len + ext, tail, 0));
  // the vault: from the left floor up and over to the right floor (wound to face in), its feet 0.4 m under the floor
  const inner = [];
  const innerRing = (sv, lipK) => {
    const f = floorAt(sv), w = sway(sv), hk = hkAt(sv), r = [];
    for (let k = K - 1; k >= 0; k--) {
      const th = (k / (K - 1)) * Math.PI;
      const [l, y] = arch(T.half, T.height * hk, th);
      const n = 1 + 0.035 * Math.sin(th * 6.1 + sv * 0.83 + lump[3]) + 0.02 * Math.sin(sv * 2.3 + th * 3.1);
      const out = lipK * lipAt(th) * 0.92;
      r.push(P(sv - out, w + l * n, f + (k === 0 || k === K - 1 ? -0.4 : y * n) - lipK * 0.05 * Math.sin(th)));
    }
    return r;
  };
  inner.push(innerRing(0, 1));
  for (let i = 1; i <= N; i++) inner.push(innerRing(i * ds, 0));
  grid(outer, false);
  grid(inner, false);
  // the lip's edge: from the outer crust's first ring (its arch only) over a rounded, drooped edge to the vault's first
  // ring (reversed to run the same way): its own vertices, so the edge reads crisp against the crust's smooth top
  {
    const o = outer[0].slice(1, K + 1), v = inner[0].slice().reverse(), e = [];
    for (let k = 0; k < K; k++) {
      const th = (k / (K - 1)) * Math.PI, a = o[k], b = v[k];
      const q = tubeEN(-0.22 * Math.sin(th), 0), qa = tubeEN(0, 0);
      const dx = (q.e - qa.e) * S, dz = -(q.n - qa.n) * S;
      e.push([(a[0] + b[0]) / 2 + dx, (a[1] + b[1]) / 2 - 0.18 * Math.sin(th), (a[2] + b[2]) / 2 + dz]);
    }
    grid([o, e, v], true);
  }
  // the back: the vault's last ring closed on a point in the rock, a little past it and at mid-height
  {
    const v = inner[N], f = floorAt(T.len), c = P(T.len + 0.9, sway(T.len), f + T.height * 0.42), cb = pos.length / 3;
    for (const q of v) pos.push(q[0], q[1], q[2]);
    pos.push(c[0], c[1], c[2]);
    for (let k = 0; k < v.length - 1; k++) idx.push(cb + k, cb + v.length, cb + k + 1);
  }
  // the crust's last ring closed on a point in the ground
  {
    const o = outer[outer.length - 1], c = P(T.len + 4.2, 0, floorAt(T.len) - 0.6), cb = pos.length / 3;
    for (const q of o) pos.push(q[0], q[1], q[2]);
    pos.push(c[0], c[1], c[2]);
    for (let k = 0; k < o.length - 1; k++) idx.push(cb + k, cb + o.length, cb + k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** The pinnacles' colliders (vertical capsules, the lower two thirds), in collision.register's shape. */
export function pinnacleColliders(list) {
  return list.map((P) => ({ kind: 'landmark', id: P.id, shape: { type: 'capsule', a: [P.x, P.y - 0.5, P.z], b: [P.x, P.y + P.h * 0.66, P.z], radius: Math.max(0.4, P.r * 0.7) } }));
}

export { D2R };
