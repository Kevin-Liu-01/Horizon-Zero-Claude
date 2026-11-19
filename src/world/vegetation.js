import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WORLD_SIZE } from './island/extent.js';
import { GROUND } from './island/sites.js';
import { rng } from './island/recipe.js';
import { STRIDE, TILE, TILE_N, fieldReader, marramTile, marramDensity } from './island/scatter.js';
import {
  ROCK_VERT_PARS, ROCK_VERT_WORLD, GROUND_FRAG_PARS, ROCK_COLOR, GROUND_ROUGH, GROUND_NORMAL,
} from './island/groundShader.js';
import { GROUND_AO } from './terrain.js';
import { Props } from './props.js';
import { Meadow } from './island/meadow.js';
import { HoldsFlora } from './holds/flora.js';

/**
 * THE PANS' FLORA AND LOOSE STONE (world-ground W1; bible §8.3, §9.6, plan §4.1).
 *
 * Solid vertex-coloured meshes, no alpha, one draw per kind (`A-scatter-draws`, ≤ 8 kinds):
 *
 *   marram-near  96 tris   dune colonies, the Pans' stalking cover
 *   (the golden meadow, M1.1b: island/meadow.js, three rings of blades, clumps and cards; cerrillo retired)
 *   glasswort    36 tris   red-tipped succulents on pan margins and hollows
 *   lavender     60 tris   violet sea-lavender on the saline flats
 *   rocks-basalt 180 tris  reef in the surf, the Shelf's foot, strays (collided, casts)
 *   rocks-columns 36 tris  broken column stubs on the Shelf's edge (collided, casts)
 *   pan-dykes    120 tris  the stone runs of the salt field (casts: the low sun draws the grid)
 *   salt-rakes   24 tris   raked salt: heaps and windrows
 *
 * Everything leans and sways SW, away from the trade wind's bearing 045 (bible §2.3).
 * Streamed kinds re-fill one instance buffer around the camera (one kind per frame, no
 * allocation). `grassDensityAt`, `countGrassNear`, `windAt`, `forceStream`, `invalidate`,
 * `invalidateAround`, `grassStats`, `treeStats`, `dispose` are the published surface.
 *
 * Biomes 2-6 get their own flora after `V-biome-vista-pans` passes (plan §3.1).
 */

const HALF = WORLD_SIZE / 2;

/** Streamed draw settings: radius (m), buffer capacity, fade band, source kind, stride thinning. */
/* GPU (A-gpu-tier at the Pans vista): flora was 4.6 of the frame's 18 ms, nearly all of it
 * sub-pixel triangles. The near tufts hand over to the 18-tri far tufts at 44 m (it was 52),
 * the small kinds stop where they fall under two pixels; the cover the lurker reads is the
 * field, not the draw, so A59b / A60 are untouched. */
const STREAM = {
  /* M1a fix round (F02 at 11 ms with the look off: marram-near was the frame's largest single draw, 200 k triangles over 2,083
   * tufts, 0.7 ms paired at 889bce2): within 16 m the tuft is 16 straps of 3 quads; past it the same 16 straps (same seed,
   * same outline and colours) of 2 quads, 64 tris, filled in the same frame as the near ring so no shell of tufts drops
   * or doubles at the hand-over */
  marramNear: { src: 'marram', name: 'marram-near', r: 16, cap: 9000, fade: [34, 44], every: 1, sway: 1.0, keep: 2, pair: 'marramMid' },
  marramMid: { src: 'marram', name: 'marram-mid', r: 44, inner: 16, cap: 8000, fade: [34, 44], every: 1, sway: 1.0, keep: 2, follows: true },
  /* marram-far is retired (LOOK W-01 item 3): past the near ring the colonies are the ground's
   * own tone. M1.1b: the cerrillo tufts are retired too; the golden meadow is island/meadow.js (three rings of
   * blades, clumps and cards to the written budget) */
  glasswort: { src: 'glasswort', name: 'glasswort', r: 60, cap: 5600, fade: [46, 60], every: 1, sway: 0.15 },
  lavender: { src: 'lavender', name: 'lavender', r: 104, cap: 4000, fade: [82, 104], every: 1, sway: 0.5 },
};

/** M1.1a: the dyke runs are drawn within DYKE_R of the camera and cast within DYKE_SHADOW_R (see _buildDykes):
 * past them the ground shader's dyke strip (full by 110 m) and its shadow band (from 70 m) carry the field. */
const DYKE_R = 120;
const DYKE_SHADOW_R = 80;
/** M1a round 2: within DYKE_NEAR the runs are the faceted stones ('pan-dykes'); past it the same stones indexed
 * ('pan-dykes-far', wallGeos), in the main view and the cascades. */
const DYKE_NEAR = 26;
/** M1a fix round: past DYKE_MID a run is one 16-triangle block ('pan-dykes-block', wallBlockGeo) in the view and the cascades. */
const DYKE_MID = 48;
/** M1a round 2: past 30 m a flora tile or a dyke run more than 84 deg off the lens's heading is not drawn (was 115 deg:
 * about a third of what was submitted stood outside the frame's sides). The stream re-fills on a 24 deg turn, so the
 * margin past the widest lens (half of 92 deg) still covers a turn and a tile's own width. */
const SIDE_COS = 0.1;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/* ------------------------------------------------------------- geometries ---- */
function blade(P, C, N, ox, oz, dirX, dirZ, h, w, segs, c0, c1, curve) {
  // a tapered, curving strap; solid colour ramp, normals biased up so it shades as a tuft
  let px = ox, pz = oz, py = 0;
  for (let s = 0; s < segs; s++) {
    const t0 = s / segs, t1 = (s + 1) / segs;
    const nx = ox + dirX * curve * h * t1 * t1, nz = oz + dirZ * curve * h * t1 * t1, ny = h * t1;
    const w0 = w * (1 - t0 * 0.82), w1 = w * (1 - t1 * 0.82);
    const sx = -dirZ, sz = dirX;
    const v = [[px - sx * w0, py, pz - sz * w0], [px + sx * w0, py, pz + sz * w0], [nx + sx * w1, ny, nz + sz * w1], [nx - sx * w1, ny, nz - sz * w1]];
    const tris = s === segs - 1 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2, 0, 2, 3];
    for (const k of tris) {
      P.push(v[k][0], v[k][1], v[k][2]);
      const t = k < 2 ? t0 : t1;
      C.push(c0.r + (c1.r - c0.r) * t, c0.g + (c1.g - c0.g) * t, c0.b + (c1.b - c0.b) * t);
      N.push(dirX * 0.34, 0.9, dirZ * 0.34);
    }
    px = nx; pz = nz; py = ny;
  }
}

function geoFrom(P, C, N) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.computeBoundingSphere();
  return g;
}

function marramGeo(blades, segs, seed, widthK = 1) {
  const R = rng(seed), P = [], C = [], N = [];
  /* M1a fix round (F31's written target, pale carrizo, never gold grass): the straw tips were #cdbf8b / #9aa35c and read
   * hue 32 deg at saturation 0.62 in the 17:00 light, the meadow's own gold. Now a pale grey straw and a grey-green, about a
   * third of the chroma, so the golden light warms them and they still read pale against the meadow */
  const base = new THREE.Color('#5c6243'), tip = new THREE.Color('#cfccb6'), tip2 = new THREE.Color('#a7ae92');
  const c0 = new THREE.Color(), c1 = new THREE.Color();
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * 6.2832 + R() * 0.9;
    const dx = Math.cos(a), dz = Math.sin(a), r0 = 0.02 + R() * 0.09;
    c0.copy(base).multiplyScalar(0.8 + R() * 0.3);
    c1.copy(tip).lerp(tip2, R() * 0.55).multiplyScalar(0.82 + R() * 0.3);
    blade(P, C, N, dx * r0, dz * r0, dx, dz, 0.62 + R() * 0.5, (0.011 + R() * 0.01) * widthK, segs, c0, c1, 0.5 + R() * 0.45);
  }
  return geoFrom(P, C, N);
}

function glasswortGeo(seed) {
  const R = rng(seed), P = [], C = [], N = [];
  const c0 = new THREE.Color(), c1 = new THREE.Color();
  for (let b = 0; b < 9; b++) {
    const a = (b / 9) * 6.2832 + R();
    const dx = Math.cos(a), dz = Math.sin(a), r0 = 0.015 + R() * 0.1;
    const red = R() > 0.42;
    c0.set('#4a6a2e').multiplyScalar(0.75 + R() * 0.4);
    c1.set(red ? '#a8352c' : '#7f9a3e').multiplyScalar(0.8 + R() * 0.35);
    blade(P, C, N, dx * r0, dz * r0, dx, dz, 0.1 + R() * 0.14, 0.022 + R() * 0.012, 2, c0, c1, 0.5);
  }
  // 9 straps x 2 quads = 36 triangles
  return geoFrom(P, C, N);
}

function lavenderGeo(seed) {
  /* Sea-lavender: a low grey-green rosette, wiry stems, a violet spray at each tip. 60 tris. */
  const R = rng(seed), P = [], C = [], N = [];
  const c0 = new THREE.Color(), c1 = new THREE.Color();
  for (let b = 0; b < 6; b++) {            // 6 leaves x 2 tris
    const a = (b / 6) * 6.2832 + R();
    c0.set('#56684c'); c1.set('#7a8c64');
    blade(P, C, N, Math.cos(a) * 0.02, Math.sin(a) * 0.02, Math.cos(a), Math.sin(a), 0.06 + R() * 0.04, 0.034, 1, c0, c1, 2.4);
  }
  for (let b = 0; b < 6; b++) {            // 6 stems x 2 tris + a spray of 6 tris
    const a = (b / 6) * 6.2832 + R();
    const dx = Math.cos(a), dz = Math.sin(a), r0 = 0.02 + R() * 0.05;
    const h = 0.26 + R() * 0.2, lean = 0.32;
    c0.set('#6a7656'); c1.set('#8a8a68');
    blade(P, C, N, dx * r0, dz * r0, dx, dz, h, 0.007, 1, c0, c1, lean);
    const tx = dx * r0 + dx * lean * h, tz = dz * r0 + dz * lean * h;
    c1.set(R() > 0.3 ? '#8a68a8' : '#a48cc0').multiplyScalar(0.92 + R() * 0.26);
    for (let k = 0; k < 3; k++) {          // a spray of three tiny flower heads: 2 tris each
      const ka = a + (k - 1) * 0.8;
      c0.copy(c1).multiplyScalar(0.78);
      blade(P, C, N, tx, tz, Math.cos(ka), Math.sin(ka), 0.05 + k * 0.012, 0.011, 1, c0, c1, 1.2);
      for (let i = P.length - 18; i < P.length; i += 3) P[i + 1] += h - 0.015;
    }
  }
  return geoFrom(P, C, N);
}

function displaced(geo, seed, amp, flat = true) {
  const p = geo.attributes.position, R = rng(seed);
  // a coherent lump: nearby vertices move together, so the shape is a stone and not spikes
  const k = [R() * 9, R() * 9, R() * 9];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 2.3 + k[0]) * Math.cos(y * 2.9 + k[1]) + Math.sin(z * 3.1 + k[2]) * 0.6 + Math.sin((x + z) * 5.3 + k[1]) * 0.3;
    const s = 1 + n * amp;
    p.setXYZ(i, x * s, y * s, z * s);
  }
  geo.computeVertexNormals();
  return flat ? geo : geo;
}

/** An icosahedron with its seams welded: smooth normals, a stone and not a cut gem. */
function weldedIco(detail) {
  const raw = new THREE.IcosahedronGeometry(1, detail);
  raw.deleteAttribute('uv');
  raw.deleteAttribute('normal');
  const g = mergeVertices(raw, 1e-4);
  raw.dispose();
  return g;
}

function rockGeo() {
  /* A broken boulder: a lump with planes sawn off it, soft where the planes meet. 180 tris. */
  const g = displaced(weldedIco(2), 77, 0.16);
  const p = g.attributes.position, R = rng(211);
  for (let c = 0; c < 7; c++) {
    const z = R() * 2 - 1, a = R() * 6.2832, xy = Math.sqrt(1 - z * z);
    const nx = xy * Math.cos(a), ny = z, nz = xy * Math.sin(a), d = 0.5 + R() * 0.3;
    for (let i = 0; i < p.count; i++) {
      const v = p.getX(i) * nx + p.getY(i) * ny + p.getZ(i) * nz - d;
      if (v > 0) p.setXYZ(i, p.getX(i) - nx * v, p.getY(i) - ny * v, p.getZ(i) - nz * v);
    }
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function columnGeo() {
  // a hex prism with a broken bevelled top, y 0..1, radius 1 (non-uniform scale in the instance)
  const P = [], R = rng(9), rB = 1, rT = 0.9;
  const ang = (i) => (i / 6) * 6.2832;
  const top = [];
  for (let i = 0; i < 6; i++) top.push(0.94 + R() * 0.06);
  for (let i = 0; i < 6; i++) {
    const a0 = ang(i), a1 = ang(i + 1), j = (i + 1) % 6;
    const x0 = Math.cos(a0), z0 = Math.sin(a0), x1 = Math.cos(a1), z1 = Math.sin(a1);
    P.push(x0 * rB, 0, z0 * rB, x1 * rB, top[j], z1 * rB, x1 * rB, 0, z1 * rB);
    P.push(x0 * rB, 0, z0 * rB, x0 * rB, top[i], z0 * rB, x1 * rB, top[j], z1 * rB);
    P.push(x0 * rB, top[i], z0 * rB, x0 * rT, 1, z0 * rT, x1 * rB, top[j], z1 * rB);
    P.push(x1 * rB, top[j], z1 * rB, x0 * rT, 1, z0 * rT, x1 * rT, 1, z1 * rT);
    P.push(0, 1, 0, x1 * rT, 1, z1 * rT, x0 * rT, 1, z0 * rT);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * The run's stones twice (M1a round 2): `full`, the faceted non-indexed 120 triangles (360 vertices) of V32, and
 * `lod`, the same six stones from the same random draws, indexed (72 vertices) with each stone's ellipsoid normal: the
 * same outline and the same depth in a cascade, a fifth of the vertex work. Past DYKE_NEAR the facets are under a pixel.
 */
function wallGeos() {
  const lods = [];
  const full = wallGeo(lods);
  const lod = mergeGeometries(lods, false);
  for (const g of lods) g.dispose();
  lod.computeBoundingSphere();
  return { full, lod };
}

/**
 * M1a fix round (F02 at 11 ms with the look off: the far dyke runs were 114 k triangles in the main view and 66 k in each
 * cascade at 120 a run): past DYKE_MID a run is one rough block, 16 triangles. Two segments along the run with an uneven
 * crown, battered sides (0.62 m at the foot, about 0.4 at the top, 0.33-0.43 m tall) and end caps where a wall stops;
 * the ends overlap the next run as the stones do. At 50 m a 1.1 m run is about 20 px wide and its stones under 4 px each,
 * so the outline, the lit and shaded side and the cast shadow are what show, and those it keeps.
 */
function wallBlockGeo() {
  const zs = [-0.64, 0.05, 0.74], crown = [0.37, 0.42, 0.34], tilt = [0.02, -0.03, 0.025];
  const ring = (k) => {
    const z = zs[k], h = crown[k], t = tilt[k];
    return [[-0.31, 0, z], [-0.19 + t, h - 0.04, z], [0.2 + t, h, z], [0.31, 0, z]];
  };
  const R = [ring(0), ring(1), ring(2)], P = [];
  const tri = (a, b, c) => P.push(...a, ...b, ...c);
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  for (let k = 0; k < 2; k++) {
    const A = R[k], B = R[k + 1];
    for (let s = 0; s < 3; s++) quad(A[s], A[s + 1], B[s + 1], B[s]);
  }
  for (const [E, flip] of [[R[0], false], [R[2], true]]) {
    if (!flip) { quad(E[3], E[2], E[1], E[0]); } else { quad(E[0], E[1], E[2], E[3]); }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  // the faces' own normals turned outward if the winding came out inward (the block is convex about its axis)
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 - 0.15;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3 - 0.05;
    const d = n.getX(i) * cx + n.getY(i) * cy + n.getZ(i) * cz;
    if (d < 0) {
      for (let k = 0; k < 3; k++) n.setXYZ(i + k, -n.getX(i + k), -n.getY(i + k), -n.getZ(i + k));
      const x1 = p.getX(i + 1), y1 = p.getY(i + 1), z1 = p.getZ(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x1, y1, z1);
    }
  }
  g = mergeVertices(g, 1e-4);
  g.computeBoundingSphere();
  return g;
}

function wallGeo(lodParts = null) {
  /* One 1.1 m run of a dry-stone dyke, 120 triangles: six angular lava stones in two courses
   * (three footings, three capstones breaking joint), overlapping the next run at both ends so
   * the runs butt into one unbroken low wall ≈ 0.6 m wide and 0.3-0.45 m tall. Faceted, not
   * smooth: welded normals turned flat slabs into pillows at 1.5 m (V32). From the rim a dyke
   * is a thin dark line; up close it is stacked stone. x across, y up, z along the run. */
  const R = rng(31), parts = [];
  const lay = [
    [-0.06, 0.1, -0.4, 0.3, 0.13, 0.27], [0.07, 0.1, 0.02, 0.29, 0.14, 0.25], [-0.04, 0.11, 0.42, 0.31, 0.13, 0.26],
    [0.03, 0.27, -0.2, 0.22, 0.11, 0.23], [-0.05, 0.28, 0.2, 0.21, 0.12, 0.24], [0.04, 0.26, 0.58, 0.2, 0.1, 0.17],
  ];
  for (const [x, y, z, sx, sy, sz] of lay) {
    const g = displaced(weldedIco(0), (R() * 1e6) | 0, 0.3);
    // a broken slab: flatten the top and bottom, then saw one corner off at a random plane
    const p = g.attributes.position;
    const cz = R() * 2 - 1, ca = R() * 6.2832, cxy = Math.sqrt(1 - cz * cz);
    const nx = cxy * Math.cos(ca), ny = cz * 0.4, nz = cxy * Math.sin(ca), d = 0.55 + R() * 0.2;
    for (let i = 0; i < p.count; i++) {
      let X = p.getX(i), Y = p.getY(i), Z = p.getZ(i);
      Y = Math.sign(Y) * Math.min(Math.abs(Y), 0.6 + R() * 0.15);
      const v = X * nx + Y * ny + Z * nz - d;
      if (v > 0) { X -= nx * v; Y -= ny * v; Z -= nz * v; }
      p.setXYZ(i, X, Y, Z);
    }
    g.scale(sx, sy, sz);
    g.rotateY((R() - 0.5) * 0.5);
    g.rotateZ((R() - 0.5) * 0.22);
    g.translate(x, y, z);
    const f = g.toNonIndexed();
    if (lodParts) {
      const P0 = g.attributes.position, N0 = new Float32Array(P0.count * 3), Q0 = new THREE.Vector3();
      for (let k = 0; k < P0.count; k++) {
        Q0.fromBufferAttribute(P0, k);
        Q0.set((Q0.x - x) / (sx * sx), (Q0.y - y) / (sy * sy), (Q0.z - z) / (sz * sz)).normalize();
        N0[k * 3] = Q0.x; N0[k * 3 + 1] = Q0.y; N0[k * 3 + 2] = Q0.z;
      }
      g.setAttribute('normal', new THREE.BufferAttribute(N0, 3));
      lodParts.push(g);
    } else g.dispose();
    /* Weathered, not cut: each vertex's normal leans 62 % toward the stone's own ellipsoid
     * normal and keeps 38 % of its face's, so the stone reads rounded with soft arrises at 1.5 m
     * (V32: flat facets read as crystal shards), while the 20 faces still give a broken outline.
     * The grain, vesicles and edge wear are the basalt layer's triplanar albedo and normal. */
    const P = f.attributes.position, Nn = new Float32Array(P.count * 3);
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), F = new THREE.Vector3(), Q = new THREE.Vector3();
    for (let t = 0; t < P.count; t += 3) {
      A.fromBufferAttribute(P, t); B.fromBufferAttribute(P, t + 1); C.fromBufferAttribute(P, t + 2);
      F.subVectors(C, B).cross(Q.subVectors(A, B)).normalize();
      for (let k = 0; k < 3; k++) {
        Q.fromBufferAttribute(P, t + k);
        Q.set((Q.x - x) / (sx * sx), (Q.y - y) / (sy * sy), (Q.z - z) / (sz * sz)).normalize();
        Q.multiplyScalar(0.62).addScaledVector(F, 0.38).normalize();
        Nn[(t + k) * 3] = Q.x; Nn[(t + k) * 3 + 1] = Q.y; Nn[(t + k) * 3 + 2] = Q.z;
      }
    }
    f.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
    parts.push(f);
  }
  const m = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  m.computeBoundingSphere();
  return m;
}

function saltGeo() {
  /* A raked heap: a soft cone welded all the way round, 80 triangles: 16 sides, a tip and three
   * rings. Loose salt slumps: the profile bellies out near the foot. Stretched in the instance
   * it is a windrow. y 0..1, radius 1 at the foot. */
  const NR = 16, RINGS = [0, 0.34, 0.68], P = [], idx = [];
  for (const y of RINGS) {
    for (let i = 0; i < NR; i++) {
      const a = (i / NR) * Math.PI * 2;
      const k = 1 + 0.06 * Math.sin(a * 3 + 1.1) + 0.04 * Math.sin(a * 5 + 2.3);
      const r = Math.pow(1 - y, 0.84) * k;
      P.push(Math.cos(a) * r, y * (0.97 + 0.03 * k), Math.sin(a) * r);
    }
  }
  const tip = P.length / 3;
  P.push(0, 1, 0);
  for (let j = 0; j < RINGS.length - 1; j++) {
    for (let i = 0; i < NR; i++) {
      const a = j * NR + i, b = j * NR + (i + 1) % NR, c = a + NR, d = b + NR;
      idx.push(a, c, b, b, c, d);
    }
  }
  const last = (RINGS.length - 1) * NR;
  for (let i = 0; i < NR; i++) idx.push(last + i, tip, last + (i + 1) % NR);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* -------------------------------------------------------------------- flora ---- */
const FLORA_VERT = /* glsl */ `
varying vec2 vFloraXZ;
uniform float uTime;
uniform vec2 uWind;
uniform vec3 uFade;      // fade start, fade end, sway
uniform vec4 uActors[4];
`;
const FLORA_FRAG_PARS = /* glsl */ `
varying vec2 vFloraXZ;
uniform highp sampler2DArray tField;   // terrain.js: layer 0 noise, 1-2 the skyline (M1.1a)
uniform vec4 uHzW0;
uniform vec4 uHzW1;
uniform float uSunTan;
uniform float uHzWorldInv;
uniform float uHzK;
`;
/** The land's long shadow falls on the plants too (groundShader.js gSkylineVis). */
const FLORA_AO = /* glsl */ `
#include <aomap_fragment>
{
  vec2 hzUv = clamp(vFloraXZ * uHzWorldInv + 0.5, vec2(0.5 / 512.0), vec2(1.0 - 0.5 / 512.0));
  float hzA = dot(texture(tField, vec3(hzUv, 1.0)), uHzW0) + dot(texture(tField, vec3(hzUv, 2.0)), uHzW1);
  hzA = hzA * hzA * 0.9;
  float hzV = mix(1.0, smoothstep(hzA - 0.016, hzA + 0.034, uSunTan), uHzK);
  reflectedLight.directDiffuse *= hzV;
  reflectedLight.directSpecular *= hzV;
  reflectedLight.indirectDiffuse *= 1.7;   // the same open sky the ground sees
}
`;
const FLORA_PROJECT = /* glsl */ `
vec4 iw = instanceMatrix * vec4(transformed, 1.0);
vFloraXZ = iw.xz;
{
  vec3 o = instanceMatrix[3].xyz;
  float d = distance(o, cameraPosition);
  float fade = 1.0 - smoothstep(uFade.x, uFade.y, d);
  iw.xyz = o + (iw.xyz - o) * fade;
  float hh = clamp((iw.y - o.y) / max(length(instanceMatrix[1].xyz), 0.05), 0.0, 1.4);
  hh *= hh;
  float ph = dot(o.xz, uWind) * 0.09 - uTime * 1.5 + o.x * 0.21;
  float gust = 0.55 + 0.45 * sin(dot(o.xz, uWind) * 0.021 - uTime * 0.46);
  float sway = (sin(ph) * 0.05 + sin(ph * 2.3 + o.z) * 0.02) * uFade.z * (0.4 + gust);
  iw.xz += uWind * (sway + 0.03 * gust * uFade.z) * hh;
  // she parts the marram as she walks
  for (int a = 0; a < 4; a++) {
    vec2 dv = iw.xz - uActors[a].xy;
    float dl = length(dv) + 1e-3;
    float pu = (1.0 - smoothstep(0.0, uActors[a].z, dl)) * uActors[a].w;
    iw.xz += (dv / dl) * pu * 0.7 * hh;
    iw.y -= pu * 0.25 * hh;
  }
}
vec4 mvPosition = modelViewMatrix * iw;
gl_Position = projectionMatrix * mvPosition;
`;
const FLORA_WORLD = /* glsl */ `
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
  vec4 worldPosition = modelMatrix * iw;
#endif
`;

export class Vegetation {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    ctx.scene.add(this.group);

    /** Trade wind blows FROM bearing 045: everything leans and sways toward the SW. */
    this.windDir = new THREE.Vector2(-0.7071, 0.7071);
    this._uTime = { value: 0 };
    this._uWind = { value: this.windDir };
    this.gustLevel = 0;
    this._gustTick = 0;
    this._uActors = { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] };
    this.displacers = [];
    for (let i = 0; i < 4; i++) this.displacers.push({ x: 0, z: 0, r: 1.3, s: 0, live: false });
    this._near3 = [null, null, null];

    const T = ctx.terrain;
    this._bake = T.scatterBake;
    this._R = fieldReader(T.scatterFields);
    /** Tile → replacement records, after a runtime cover stamp re-bakes it. */
    this._over = new Map();
    this._owned = { geo: [], mat: [] };
    this._draws = {};
    this._streamKeys = Object.keys(STREAM);
    this._sideCos = SIDE_COS;
    this._streamI = 0;
    this._camX = 1e9; this._camZ = 1e9; this._camYaw = 1e9;
    this._dirty = true;
    this._v = new THREE.Vector3();

    const t0 = performance.now();
    this._buildFlora();
    this._buildStatic();
    /* M2 wave 2 (area A): the Holds' plants, their own group and draws (holds/flora.js) */
    this.holdsFlora = new HoldsFlora(this);
    if (ctx.environment && !ctx.environment.water) ctx.environment.water = ctx.water;
    /* The world's props (world-props). Built after the scatter: their keepouts thin it. */
    this.props = new Props(ctx);
    this._retireRound4Props();
    /* The place table the gates stage by name, until world-props publishes its own. */
    if (!this.props.gatePlaces) this.props.gatePlaces = { ...GROUND, __fallback: true };
    this._applyKeepouts();
    const st = ctx.props || this.props;
    /* M1.1b: the golden meadow, after the keepouts are known (it zeroes its density under them) */
    this.meadow = new Meadow(ctx, { uTime: this._uTime, uWind: this._uWind, uActors: this._uActors,
      keepouts: ctx.props?.keepouts || this.props?.keepouts });
    this.group.add(this.meadow.group);
    this.forceStream(st?.spawnX ?? -284, st?.spawnZ ?? 247);
    this.buildMs = performance.now() - t0;
  }

  /**
   * THE ROUND-4 VALLEY'S PROPS MUST NOT STAND ON THE ISLAND (plan §6: world-props deletes them
   * at its W1 exit). Until that merge their art, colliders and ledges are retired here, once,
   * so nothing from the old map is seen from the Pans or walked into: `seedWorld` finds the
   * group by name, `registerColliders` is what hands over the rest. The check is the old
   * class's own signature, so world-props' rewrite makes this a no-op; then this method goes.
   */
  _retireRound4Props() {
    const P = this.props;
    if (!P?.megaMeshes) return;
    P.group.visible = false;
    P.group.name = 'world-props-retired';
    for (const part of Object.values(P)) if (part && part !== P.fauna && part.group?.isObject3D) part.group.visible = false;
    P.registerColliders = () => 0;
    if (P.rockworks?.ledges) P.rockworks.ledges.length = 0;
    if (P.placeSystem?.ledges) P.placeSystem.ledges.length = 0;
    this.round4PropsRetired = true;
  }

  /* ---------------------------------- flora ---------------------------------- */
  _floraMaterial(cfg) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
    const fade = new THREE.Vector3(cfg.fade[0], cfg.fade[1], cfg.sway);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this._uTime;
      shader.uniforms.uWind = this._uWind;
      shader.uniforms.uFade = { value: fade };
      shader.uniforms.uActors = this._uActors;
      const U = this.ctx.terrain.groundUniforms;
      shader.uniforms.tField = U.tField;
      shader.uniforms.uHzW0 = U.uHzW0; shader.uniforms.uHzW1 = U.uHzW1;
      shader.uniforms.uSunTan = U.uSunTan; shader.uniforms.uHzWorldInv = U.uHzWorldInv; shader.uniforms.uHzK = U.uHzK;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${FLORA_VERT}`)
        .replace('#include <project_vertex>', FLORA_PROJECT)
        .replace('#include <worldpos_vertex>', FLORA_WORLD);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FLORA_FRAG_PARS}`)
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
        .replace('#include <aomap_fragment>', FLORA_AO);
    };
    mat.customProgramCacheKey = () => 'cal-flora';
    this._owned.mat.push(mat);
    return mat;
  }

  _buildFlora() {
    const geos = {
      marramNear: marramGeo(16, 3, 101),                // 16 straps x 3 quads = 96 tris
      marramMid: marramGeo(16, 2, 101),                 // the same straps x 2 quads = 64 tris (M1a fix round)
      glasswort: glasswortGeo(303),
      lavender: lavenderGeo(404),
    };
    for (const key of this._streamKeys) {
      const cfg = STREAM[key];
      /* M1.1a: welded and indexed. blade() writes each strap corner once per triangle that uses it (12
       * vertices a two-quad strap where 6 are distinct), and every vertex ran the flora vertex shader (instance
       * matrix, wind, four displacers, three cascade coordinates). Same positions, colours and normals: the
       * same pixels, half the vertex work. */
      const geoFlat = geos[key];
      const geo = mergeVertices(geoFlat);
      geo.computeBoundingSphere();
      this._owned.geo.push(geo, geoFlat);
      const mat = this._floraMaterial(cfg);
      const mesh = new THREE.InstancedMesh(geo, mat, cfg.cap);
      mesh.name = cfg.name;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cfg.cap * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this._draws[key] = { mesh, cfg, count: 0, geoIndexed: geo, geoFlat };
    }
  }

  /** Re-fill one streamed kind around (cx, cz). Inline matrix writes: no allocation. */
  _fill(key, cx, cz, fwdX, fwdZ) {
    const D = this._draws[key], cfg = D.cfg, S = this._bake.kinds[cfg.src];
    const M = D.mesh.instanceMatrix.array, Col = D.mesh.instanceColor.array;
    const rec = S.rec, start = S.start;
    const r = cfg.r, r2 = r * r, inner = cfg.inner ? cfg.inner * cfg.inner : 0;
    const cap = cfg.cap, every = cfg.every;
    const tx0 = Math.max(0, Math.floor((cx - r + HALF) / TILE)), tx1 = Math.min(TILE_N - 1, Math.floor((cx + r + HALF) / TILE));
    const tz0 = Math.max(0, Math.floor((cz - r + HALF) / TILE)), tz1 = Math.min(TILE_N - 1, Math.floor((cz + r + HALF) / TILE));
    const over = cfg.src === 'marram' ? this._over : null;
    const keep = cfg.keep || 0;     // W-06 rings: past 12 m keep `keep` in 5 records
    let n = 0;
    for (let tz = tz0; tz <= tz1 && n < cap; tz++) {
      const czT = -HALF + (tz + 0.5) * TILE - cz;
      for (let tx = tx0; tx <= tx1 && n < cap; tx++) {
        const cxT = -HALF + (tx + 0.5) * TILE - cx;
        const dT = cxT * cxT + czT * czT;
        if (dT > (r + 12) * (r + 12)) continue;
        // behind the camera, beyond arm's length: skip the tile (a turn re-fills within a frame or two)
        if (dT > 900 && (fwdX || fwdZ) && cxT * fwdX + czT * fwdZ < this._sideCos * Math.sqrt(dT)) continue;
        const ti = tz * TILE_N + tx;
        let a = rec, i0 = start[ti], i1 = start[ti + 1];
        if (over) {
          const o = over.get(ti);
          if (o) { a = o; i0 = 0; i1 = o.length; }
        }
        if (i0 === i1) continue;
        for (let i = i0; i < i1 && n < cap; i += STRIDE * every) {
          const x = a[i], z = a[i + 2], sx = a[i + 4];
          if (sx <= 0) continue;
          const dx = x - cx, dz = z - cz, dd = dx * dx + dz * dz;
          if (dd > r2 || dd < inner) continue;
          // W-06 rings: the full 6/m² within 12 m, two in five beyond (2.4/m²), by record (stable)
          if (dd > 144 && keep && ((i / STRIDE) % 5) >= keep) continue;
          const yaw = a[i + 3], c = Math.cos(yaw), s = Math.sin(yaw);
          const sy = a[i + 5], sz = a[i + 6], lean = a[i + 7];
          const o = n * 16;
          M[o] = c * sx; M[o + 1] = 0; M[o + 2] = -s * sx; M[o + 3] = 0;
          M[o + 4] = -0.7071 * lean * sy; M[o + 5] = sy; M[o + 6] = 0.7071 * lean * sy; M[o + 7] = 0;
          M[o + 8] = s * sz; M[o + 9] = 0; M[o + 10] = c * sz; M[o + 11] = 0;
          M[o + 12] = x; M[o + 13] = a[i + 1]; M[o + 14] = z; M[o + 15] = 1;
          const t = a[i + 8], q = n * 3;
          Col[q] = t; Col[q + 1] = t; Col[q + 2] = t * (0.94 + (t - 1) * 0.3);
          n++;
        }
      }
    }
    D.count = n;
    D.mesh.count = n;
    D.mesh.instanceMatrix.needsUpdate = true;
    D.mesh.instanceColor.needsUpdate = true;
    if (cfg.pair && this._draws[cfg.pair]) this._fill(cfg.pair, cx, cz, fwdX, fwdZ);
  }

  /** Fill every streamed tier around (x, z) now. */
  forceStream(x, z) {
    this._camX = x; this._camZ = z;
    for (const key of this._streamKeys) this._fill(key, x, z, 0, 0);
    this._fillDykes(x, z, 0, 0);
    this._dirty = false;
  }

  /** Everything re-streams on the next frames. */
  invalidate() { this._dirty = true; this._camX = 1e9; }

  /** A runtime cover stamp raised the field here: re-plant the marram tiles it touched. */
  invalidateAround(x, z, r) {
    const tx0 = Math.max(0, Math.floor((x - r + HALF) / TILE)), tx1 = Math.min(TILE_N - 1, Math.floor((x + r + HALF) / TILE));
    const tz0 = Math.max(0, Math.floor((z - r + HALF) / TILE)), tz1 = Math.min(TILE_N - 1, Math.floor((z + r + HALF) / TILE));
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) this._over.set(tz * TILE_N + tx, marramTile(tx, tz, this._R));
    }
    this._dirty = true;
    this._camX = 1e9;
  }

  /* --------------------------------- static kinds --------------------------------- */
  _rockMaterial(key, rime, saltLayer, scale = 1.7, lift = 1) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    const U = this.ctx.terrain.groundUniforms;
    const uRime = { value: rime }, uRockScale = { value: scale }, uRockLift = { value: lift };
    const color = saltLayer ? ROCK_COLOR.replace(/gA\(2,/g, 'gA(1,').replace(/gNm\(2,/g, 'gNm(1,')
      .replace('float wetK = 1.0 - smoothstep(0.1, 1.1, vWPos.y);', 'float wetK = 0.0;') : ROCK_COLOR;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.uniforms.uRime = uRime;
      shader.uniforms.uRockScale = uRockScale;
      shader.uniforms.uRockLift = uRockLift;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', ROCK_VERT_PARS)
        .replace('#include <worldpos_vertex>', ROCK_VERT_WORLD);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `${GROUND_FRAG_PARS}\nuniform float uRime;\nuniform float uRockScale;\nuniform float uRockLift;`)
        .replace('#include <color_fragment>', color)
        .replace('#include <roughnessmap_fragment>', GROUND_ROUGH)
        .replace('#include <normal_fragment_begin>', GROUND_NORMAL)
        .replace('#include <aomap_fragment>', GROUND_AO);
    };
    mat.customProgramCacheKey = () => `cal-rock-${key}`;
    this._owned.mat.push(mat);
    return mat;
  }

  /**
   * One static kind. The mesh stands at its instances' centre, so engine.js's caster cull
   * (distance from the mesh's position minus the geometry's radius) sees where they are.
   * `_castRadius` is what that cull should read; it goes on the geometry once
   * collision.seedWorld has read the true radius (first update, `_armCasterRadii`).
   */
  _staticMesh(name, geo, mat, data, cast) {
    const n = data.length / STRIDE;
    if (!n) { geo.dispose(); return null; }
    let cx = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += data[i * STRIDE]; cz += data[i * STRIDE + 2]; }
    cx /= n; cz /= n;
    let rad = 0;
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const isWall = name === 'pan-dykes';
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      _p.set(data[o] - cx, data[o + 1], data[o + 2] - cz);
      rad = Math.max(rad, Math.hypot(_p.x, _p.z));
      const lean = isWall ? 0 : data[o + 7];
      // no two dyke runs alike: half are turned end for end, each its own height and girth
      const hz = isWall ? ((Math.imul(i + 1, 2654435761) >>> 0) / 4294967296) : 0;
      _e.set(lean, data[o + 3] + (hz > 0.5 ? Math.PI : 0), lean * 0.7);
      _q.setFromEuler(_e);
      _s.set(data[o + 4] * (isWall ? 0.92 + 0.16 * ((hz * 7.31) % 1) : 1), data[o + 5] * (isWall ? 0.86 + 0.28 * ((hz * 13.7) % 1) : 1), data[o + 6]);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      const t = data[o + 8];
      _c.setRGB(t, t, t);
      mesh.setColorAt(i, _c);
    }
    mesh.position.set(cx, 0, cz);
    mesh.updateMatrixWorld(true);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.name = name;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.__castRadius = rad + 8;
    this.group.add(mesh);
    this._owned.geo.push(geo);
    return mesh;
  }

  /** After the collider seed: the caster cull reads the whole kind's radius, not one stone's. */
  _armCasterRadii() {
    if (this._radiiArmed || !this.ctx.collision) return;
    this._radiiArmed = true;
    for (const m of [this.rocks, this.columns, this.rakes]) {
      if (m) m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), m.userData.__castRadius);
    }
  }

  _buildStatic() {
    const S = this._bake.static;
    this.rocks = this._staticMesh('rocks-basalt', rockGeo(), this._rockMaterial('rock', 0.3, false, 2.2, 1.5), S.rocks, true);
    this.columns = this._staticMesh('rocks-columns', columnGeo(), this._rockMaterial('col', 0.2, false), S.columns, true);
    this.dykes = this._buildDykes(S.walls);
    this.rakes = this._staticMesh('salt-rakes', saltGeo(), this._rockMaterial('salt', 0, true), S.heaps, true);
    this._columnData = S.columns;
  }

  /**
   * THE DYKES, STREAMED (M1.1a). 2,997 stone runs were one static draw with frustum culling off: every run
   * drawn in the main view and in each shadow cascade wherever the camera stood (1.08 M triangles a frame at
   * the Pans). Now each run's matrix is composed once (the same compose `_staticMesh` used: no two runs
   * alike), and the runs within DYKE_R of the camera, not behind it, are copied into one instance buffer when
   * the camera has moved (with the flora's re-stream). Past DYKE_R the ground shader's dyke strip carries the
   * field (groundShader.js: darkened and widened with distance from 45 m, its shadow band from 70 m).
   */
  _buildDykes(data) {
    const n = data.length / STRIDE;
    if (!n) return null;
    const W = new Float32Array(n * 16), XZ = new Float32Array(n * 2), tone = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      const hz = (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296;
      _p.set(data[o], data[o + 1], data[o + 2]);
      _e.set(0, data[o + 3] + (hz > 0.5 ? Math.PI : 0), 0);
      _q.setFromEuler(_e);
      _s.set(data[o + 4] * (0.92 + 0.16 * ((hz * 7.31) % 1)), data[o + 5] * (0.86 + 0.28 * ((hz * 13.7) % 1)), data[o + 6]);
      _m.compose(_p, _q, _s).toArray(W, i * 16);
      XZ[i * 2] = data[o]; XZ[i * 2 + 1] = data[o + 2];
      tone[i] = data[o + 8];
    }
    const { full: geo, lod: geoLod } = wallGeos();
    this._owned.geo.push(geo, geoLod);
    // M1a round 3 (F04: the dyke's stones read pale grey-white, salt over basalt): less rime, darker stone
    const wallMat = this._rockMaterial('wall', 0.16, false, 4.1, 0.62);
    const mesh = new THREE.InstancedMesh(geo, wallMat, n);
    mesh.name = 'pan-dykes';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    // the engine's caster cull reads distance from the mesh's position minus this radius: the runs follow the camera
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), WORLD_SIZE);
    // shadow-caster mask: the runs are filled nearest band first, and the shadow passes draw only that band
    mesh.onBeforeShadow = () => { const D = this._dyke; if (D.streamed) mesh.count = D.casters; };
    mesh.onAfterShadow = () => { mesh.count = this._dyke.count; };
    this.group.add(mesh);
    // the far runs: the same stones indexed, filled nearest band first (its casters are a prefix too)
    const far = new THREE.InstancedMesh(geoLod, wallMat, n);
    far.name = 'pan-dykes-far';
    far.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    far.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    far.instanceColor.setUsage(THREE.DynamicDrawUsage);
    far.count = 0;
    far.castShadow = true;
    far.receiveShadow = true;
    far.frustumCulled = false;
    geoLod.boundingSphere = new THREE.Sphere(new THREE.Vector3(), WORLD_SIZE);
    far.onBeforeShadow = () => { far.count = this._dyke.farCasters; };
    far.onAfterShadow = () => { far.count = this._dyke.farCount; };
    this.group.add(far);
    this.dykesFar = far;
    // M1a fix round: past DYKE_MID one rough block a run (wallBlockGeo, 16 triangles), its casters a prefix too
    const geoBlock = wallBlockGeo();
    this._owned.geo.push(geoBlock);
    const xfar = new THREE.InstancedMesh(geoBlock, wallMat, n);
    xfar.name = 'pan-dykes-block';
    xfar.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    xfar.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    xfar.instanceColor.setUsage(THREE.DynamicDrawUsage);
    xfar.count = 0;
    xfar.castShadow = true;
    xfar.receiveShadow = true;
    xfar.frustumCulled = false;
    geoBlock.boundingSphere = new THREE.Sphere(new THREE.Vector3(), WORLD_SIZE);
    xfar.onBeforeShadow = () => { xfar.count = this._dyke.blockCasters; };
    xfar.onAfterShadow = () => { xfar.count = this._dyke.blockCount; };
    this.group.add(xfar);
    this.dykesBlock = xfar;
    this._dyke = { W, XZ, tone, skip: new Uint8Array(n), n, r: DYKE_R, rShadow: DYKE_SHADOW_R, rNear: DYKE_NEAR, rMid: DYKE_MID, streamed: true,
      count: 0, casters: 0, farCount: 0, farCasters: 0, blockCount: 0, blockCasters: 0 };
    return mesh;
  }

  /** Copy the runs near (cx, cz), not behind the camera, into the dyke draw. No allocation. */
  _fillDykes(cx, cz, fwdX = 0, fwdZ = 0) {
    const D = this._dyke, mesh = this.dykes, far = this.dykesFar, blk = this.dykesBlock;
    if (!D || !mesh) return;
    const { W, XZ, tone, skip } = D;
    /* M1.1j fix round 1: from height the field walls outside the pan (no ground-shader strip there) vanished past
     * DYKE_R in plan (F32, 120 m up). The drawn radius grows with the lens's height over the ground (to +330 m);
     * the casters' band does not */
    const cam = this.ctx.camera, T = this.ctx.terrain;
    const hAG = cam ? Math.max(0, cam.position.y - (T?.getHeight?.(cx, cz) ?? 0)) : 0;
    D.hAG = hAG;
    const rDraw = D.r + Math.min(330, Math.max(0, hAG - 8) * 2.8);
    const r2 = D.streamed ? rDraw * rDraw : Infinity, s2 = D.streamed ? D.rShadow * D.rShadow : Infinity;
    /* M1a round 2: two meshes, each filled casters first so its shadow passes draw a prefix. Near (within rNear, and
     * every run when not streamed): the faceted stones ('pan-dykes'). Past it the same stones indexed ('pan-dykes-far') */
    const n2 = D.streamed ? D.rNear * D.rNear : Infinity;
    // M1a fix round: past rMid the block (each tier filled casters first, so its shadow passes draw a prefix)
    const m2 = D.streamed ? D.rMid * D.rMid : Infinity;
    const put = (m, k, i) => {
      const M = m.instanceMatrix.array, Col = m.instanceColor.array;
      for (let j = 0; j < 16; j++) M[k * 16 + j] = W[i * 16 + j];
      const t = tone[i];
      Col[k * 3] = t; Col[k * 3 + 1] = t; Col[k * 3 + 2] = t;
    };
    let kn = 0, kf = 0, kb = 0;
    for (let band = 0; band < 6; band++) {
      for (let i = 0; i < D.n; i++) {
        if (skip[i]) continue;
        const dx = XZ[i * 2] - cx, dz = XZ[i * 2 + 1] - cz, dd = dx * dx + dz * dz;
        if (dd > r2) continue;
        const b = (dd <= n2 ? 0 : dd <= m2 ? 2 : 4) + (dd <= s2 ? 0 : 1);
        if (b !== band) continue;
        if (D.streamed && dd > 900 && (fwdX || fwdZ) && dx * fwdX + dz * fwdZ < this._sideCos * Math.sqrt(dd)) continue;
        if (band < 2) put(mesh, kn++, i); else if (band < 4) put(far, kf++, i); else put(blk, kb++, i);
      }
      if (band === 0) D.casters = kn;
      if (band === 2) D.farCasters = kf;
      if (band === 4) D.blockCasters = kb;
    }
    D.count = kn;
    D.farCount = kf;
    D.blockCount = kb;
    mesh.count = kn;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    far.count = kf; far.instanceMatrix.needsUpdate = true; far.instanceColor.needsUpdate = true;
    blk.count = kb; blk.instanceMatrix.needsUpdate = true; blk.instanceColor.needsUpdate = true;
  }

  /**
   * M1a round 2: every dyke run for the far field's one-off wall bake (terrain.js `_bakeFarWalls`): the run's
   * indexed geometry and all n matrices (not the streamed subset), or null before the scatter has built them.
   */
  wallBakeSource() {
    const D = this._dyke, g = this.dykesFar?.geometry ?? this.dykes?.geometry;
    return D && g && D.n ? { geometry: g, W: D.W, count: D.n } : null;
  }

  /**
   * Runtime switches for the M1.1a A/B (tools/perf/census.mjs), each { id, on(), off() }: 'flora-indexed'
   * (the four flora kinds drawn from welded, indexed geometry; off = the non-indexed originals, the same
   * pixels) and 'dykes-streamed' (off = every run, as before).
   */
  perfSwitches() {
    const cam = this.ctx.camera;
    const fwd = () => { const v = cam.getWorldDirection(this._v); return [v.x, v.z]; };
    const floraGeo = (indexed) => { for (const key of this._streamKeys) { const D = this._draws[key]; D.mesh.geometry = indexed ? D.geoIndexed : D.geoFlat; } };
    const dykes = (on) => { if (!this._dyke) return; this._dyke.streamed = on; const [fx, fz] = fwd(); this._fillDykes(cam.position.x, cam.position.z, fx, fz); };
    const marramLod = (on) => {
      const N = this._draws.marramNear, Mi = this._draws.marramMid;
      if (!N || !Mi) return;
      N.cfg.r = on ? STREAM.marramMid.inner : STREAM.marramMid.r;
      N.cfg.pair = on ? 'marramMid' : null;
      if (on) { Mi.mesh.visible = true; } else { Mi.mesh.visible = false; Mi.mesh.count = 0; }
      const [fx, fz] = fwd();
      this._fill('marramNear', cam.position.x, cam.position.z, fx, fz);
    };
    const sideCull = (c) => {
      this._sideCos = c;
      const [fx, fz] = fwd(), x = cam.position.x, z = cam.position.z;
      for (const key of this._streamKeys) this._fill(key, x, z, fx, fz);
      this._fillDykes(x, z, fx, fz);
    };
    /* M1a round 2: each static kind's whole draw (main view and cascades) and its casting alone; the streamed flora
     * kinds; and the meadow's own switches (island/meadow.js) */
    const vis = (m) => (on) => { if (m) m.visible = on; };
    const cast = (m) => (on) => { if (m) { m.castShadow = on; m.userData.__shadowBase = on; m.userData.__shadowCulled = false; } };
    const kinds = [['rocks', this.rocks], ['columns', this.columns], ['dykes', this.dykes], ['dykes-far', this.dykesFar], ['dykes-block', this.dykesBlock], ['rakes', this.rakes]];
    const out = [
      { id: 'flora-indexed', on: () => floraGeo(true), off: () => floraGeo(false) },
      { id: 'dykes-streamed', on: () => dykes(true), off: () => dykes(false) },
      // M1a round 2: off = round 1's side cull (115 deg), on = 84 deg (SIDE_COS)
      { id: 'flora-side-cull', on: () => sideCull(SIDE_COS), off: () => sideCull(-0.42) },
      // M1a round 2: off = every drawn run as the faceted stones (round 1), on = the far runs indexed (wallGeos)
      { id: 'dykes-lod', on: () => { if (this._dyke) { this._dyke.rNear = DYKE_NEAR; dykes(true); } }, off: () => { if (this._dyke) { this._dyke.rNear = 1e5; dykes(true); } } },
      // M1a fix round: off = the far runs indexed to DYKE_R (aea853c..73a80b7), on = the 16-triangle block past DYKE_MID
      // M1a fix round: off = one marram ring of 96-tri tufts to 44 m (aea853c..73a80b7), on = 96 within 16 m and 64 past it
      { id: 'marram-lod', on: () => marramLod(true), off: () => marramLod(false) },
      { id: 'dykes-block', on: () => { if (this._dyke) { this._dyke.rMid = DYKE_MID; dykes(true); } }, off: () => { if (this._dyke) { this._dyke.rMid = 1e5; dykes(true); } } },
    ];
    for (const [k, m] of kinds) {
      if (!m) continue;
      const v = vis(m), c = cast(m), c0 = m.castShadow;
      out.push({ id: `${k}-draw`, on: () => v(true), off: () => v(false) });
      if (c0) out.push({ id: `${k}-cast`, on: () => c(true), off: () => c(false) });
    }
    for (const key of this._streamKeys || []) {
      const D = this._draws[key];
      if (D?.mesh) out.push({ id: `flora-${key}`, on: () => { D.mesh.visible = true; }, off: () => { D.mesh.visible = false; } });
    }
    if (this.meadow?.perfSwitches) out.push(...this.meadow.perfSwitches());
    return out;
  }

  /**
   * The ground a column's sides are shaded with, against the analytic normal of its own
   * transformed face (`A-columns-normals`): the worst angle across every instance.
   */
  columnNormalAudit() {
    const mesh = this.columns;
    if (!mesh) return { columns: 0, worstDeg: 0 };
    const m = new THREE.Matrix4(), N = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    const p = mesh.geometry.attributes.position, nrm = mesh.geometry.attributes.normal;
    let worst = 0;
    for (let i = 0; i < mesh.count; i += 3) {
      mesh.getMatrixAt(i, m);
      const e = m.elements;
      const d0 = e[0] * e[0] + e[1] * e[1] + e[2] * e[2], d1 = e[4] * e[4] + e[5] * e[5] + e[6] * e[6], d2 = e[8] * e[8] + e[9] * e[9] + e[10] * e[10];
      for (let t = 0; t + 2 < p.count; t += 15) {           // one side tri per hex face
        A.fromBufferAttribute(p, t).applyMatrix4(m);
        B.fromBufferAttribute(p, t + 1).applyMatrix4(m);
        C.fromBufferAttribute(p, t + 2).applyMatrix4(m);
        const ana = B.sub(A).cross(C.sub(A)).normalize();
        // exactly the vertex shader's formula (groundShader.js ROCK_VERT_WORLD)
        const nx = nrm.getX(t) / d0, ny = nrm.getY(t) / d1, nz = nrm.getZ(t) / d2;
        N.set(e[0] * nx + e[4] * ny + e[8] * nz, e[1] * nx + e[5] * ny + e[9] * nz, e[2] * nx + e[6] * ny + e[10] * nz).normalize();
        const deg = Math.acos(Math.min(1, Math.abs(N.dot(ana)))) * 57.2958;
        if (deg > worst) worst = deg;
      }
    }
    return { columns: mesh.count, worstDeg: +worst.toFixed(3) };
  }

  /** Thin the flora out of whatever world-props keeps clear (`ctx.props.keepouts`). */
  _applyKeepouts() {
    const K = this.ctx.props?.keepouts || this.props?.keepouts;
    if (!Array.isArray(K) || !K.length) return;
    // the streamed dykes honour the keepouts themselves (props.js _clearScatter zeroed them in the static draw)
    const D = this._dyke;
    if (D) for (const z of K) {
      const hard = z.hard ?? z.r ?? 0;
      if (!(hard > 0)) continue;
      for (let i = 0; i < D.n; i++) { const dx = D.XZ[i * 2] - z.x, dz = D.XZ[i * 2 + 1] - z.z; if (dx * dx + dz * dz < hard * hard) D.skip[i] = 1; }
    }
    for (const kind of Object.values(this._bake.kinds)) {
      const a = kind.rec;
      for (const z of K) {
        const hard = z.hard ?? z.r ?? 0;
        if (!(hard > 0)) continue;
        const r2 = hard * hard;
        const tx0 = Math.max(0, Math.floor((z.x - hard + HALF) / TILE)), tx1 = Math.min(TILE_N - 1, Math.floor((z.x + hard + HALF) / TILE));
        const tz0 = Math.max(0, Math.floor((z.z - hard + HALF) / TILE)), tz1 = Math.min(TILE_N - 1, Math.floor((z.z + hard + HALF) / TILE));
        for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
          const ti = tz * TILE_N + tx;
          for (let i = kind.start[ti]; i < kind.start[ti + 1]; i += STRIDE) {
            const dx = a[i] - z.x, dz = a[i + 2] - z.z;
            if (dx * dx + dz * dz < r2) a[i + 4] = 0;
          }
        }
      }
    }
  }

  /* -------------------------------- the published surface -------------------------------- */
  /** Marram per m² at a point: the rule the scatter plants by (`A59b`). */
  grassDensityAt(x, z) { return marramDensity(this._R.at(x, z)); }

  /** Marram instances actually standing within r of (x, z). */
  countGrassNear(x, z, r) {
    const S = this._bake.kinds.marram, rec = S.rec, start = S.start, r2 = r * r;
    const tx0 = Math.max(0, Math.floor((x - r + HALF) / TILE)), tx1 = Math.min(TILE_N - 1, Math.floor((x + r + HALF) / TILE));
    const tz0 = Math.max(0, Math.floor((z - r + HALF) / TILE)), tz1 = Math.min(TILE_N - 1, Math.floor((z + r + HALF) / TILE));
    let n = 0;
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
      const ti = tz * TILE_N + tx;
      const o = this._over.get(ti);
      const a = o || rec, i0 = o ? 0 : start[ti], i1 = o ? o.length : start[ti + 1];
      for (let i = i0; i < i1; i += STRIDE) {
        const dx = a[i] - x, dz = a[i + 2] - z;
        if (a[i + 4] > 0 && dx * dx + dz * dz <= r2) n++;
      }
    }
    return n;
  }

  grassStats() {
    const out = { total: 0, byKind: {} };
    for (const key of this._streamKeys) { out.byKind[key] = this._draws[key].count; out.total += this._draws[key].count; }
    out.chunks = this._streamKeys.length;
    return out;
  }

  /** Round-4 name; no trees stand on the Pans. Biomes 2-6 fill this after the Pans pass. */
  treeStats() { return { total: 0, byKind: {} }; }

  /** Published stats of the scatter draws (`A-scatter-draws`). */
  scatterStats() {
    const out = {};
    for (const c of this.group.children) {
      if (!c.isInstancedMesh) continue;
      const tris = (c.geometry.index ? c.geometry.index.count : c.geometry.attributes.position.count) / 3;
      out[c.name] = { instances: c.count, trisEach: tris, castShadow: c.castShadow };
    }
    return out;
  }

  windAt(x, z, t = this._uTime.value) {
    const w = this.windDir;
    const g = Math.sin((x * w.x + z * w.y) * 0.06 - t * 1.65)
      + 0.55 * Math.sin((x * -w.y + z * w.x) * 0.021 + t * 0.53)
      + 0.30 * Math.sin(t * 0.95 + x * 0.013);
    return THREE.MathUtils.clamp(g * 0.5 + 0.5, 0, 1);
  }

  /** Four displacer slots: the player owns 0, the three nearest Instruments take 1-3. */
  _updateActors(dt) {
    const slots = this.displacers;
    for (let i = 0; i < 4; i++) slots[i].live = false;
    const p = this.ctx.player;
    if (p && p.position) {
      const s = slots[0];
      s.live = true; s.x = p.position.x; s.z = p.position.z;
      s.r = (p.crouching || p.crouched) ? 1.05 : 1.35;
    }
    const list = this.ctx.machines?.list;
    if (list && list.length) {
      const cam = this.ctx.camera.position;
      let m0 = null, m1 = null, m2 = null, d0 = Infinity, d1 = Infinity, d2 = Infinity;
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (!m || m.alive === false || !m.position) continue;
        const ex = m.position.x - cam.x, ez = m.position.z - cam.z, dd = ex * ex + ez * ez;
        if (dd > 3600) continue;
        if (dd < d0) { m2 = m1; d2 = d1; m1 = m0; d1 = d0; m0 = m; d0 = dd; }
        else if (dd < d1) { m2 = m1; d2 = d1; m1 = m; d1 = dd; }
        else if (dd < d2) { m2 = m; d2 = dd; }
      }
      const near3 = this._near3;
      near3[0] = m0; near3[1] = m1; near3[2] = m2;
      for (let k = 0; k < 3; k++) {
        const m = near3[k];
        if (!m) continue;
        const s = slots[k + 1];
        s.live = true; s.x = m.position.x; s.z = m.position.z;
        s.r = THREE.MathUtils.clamp((m.bodyRadius || 1.2) * 1.7, 1.6, 5.5);
      }
    }
    const u = this._uActors.value;
    for (let i = 0; i < 4; i++) {
      const s = slots[i];
      const rate = s.live ? 8.0 : 1.7;
      s.s += ((s.live ? 1 : 0) - s.s) * Math.min(1, rate * dt);
      if (s.s < 0.004) s.s = 0;
      u[i].set(s.x, s.z, s.r, s.s * 0.62);
    }
  }

  update(dt, t) {
    this._uTime.value = t;
    this._armCasterRadii();
    /* the gust at the player, a few times a second: windAt's double return is a heap number
     * when it is not inlined (R48 c, 4 KB/s per function) and nothing needs it every step */
    if (++this._gustTick >= 8) {
      this._gustTick = 0;
      const p = this.ctx.player;
      if (p) this.gustLevel = this.windAt(p.position.x, p.position.z, t);
    }
  }

  /** Once per rendered frame: follow the camera, one streamed kind per frame. */
  interpolate(_alpha, realDt) {
    this._updateActors(Math.min(realDt || 0.016, 0.1));
    const cam = this.ctx.camera;
    if (!cam) return;
    const x = cam.position.x, z = cam.position.z;
    const v = cam.getWorldDirection(this._v);
    const yaw = Math.atan2(v.x, v.z);
    const dx = x - this._camX, dz = z - this._camZ;
    let dy = yaw - this._camYaw;
    if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2;
    const dh = this._dyke ? Math.abs(cam.position.y - (this.ctx.terrain?.getHeight?.(x, z) ?? 0) - (this._dyke.hAG ?? 0)) : 0;
    if (this._dirty || dx * dx + dz * dz > 36 || Math.abs(dy) > 0.42 || dh > 6) {
      this._pending = this._streamKeys.length;
      this._camX = x; this._camZ = z; this._camYaw = yaw;
      this._dirty = false;
      this._fillDykes(x, z, v.x, v.z);
    }
    if (this._pending > 0) {
      // a kind that follows another (marram-mid) is filled with it, never on its own turn
      while (STREAM[this._streamKeys[this._streamI]].follows) this._streamI = (this._streamI + 1) % this._streamKeys.length;
      this._fill(this._streamKeys[this._streamI], x, z, v.x, v.z);
      this._streamI = (this._streamI + 1) % this._streamKeys.length;
      this._pending--;
    }
    this.meadow?.update(cam);
  }

  dispose() {
    this.holdsFlora?.dispose();
    this.holdsFlora = null;
    this.meadow?.dispose();
    this.meadow = null;
    this.props?.dispose?.();
    for (const c of this.group.children) c.dispose?.();
    for (const g of this._owned.geo) g.dispose();
    for (const m of this._owned.mat) m.dispose();
    this._owned = { geo: [], mat: [] };
    this._over.clear();
    this.group.parent?.remove(this.group);
    this.group.clear();
    this._draws = {};
  }
}
