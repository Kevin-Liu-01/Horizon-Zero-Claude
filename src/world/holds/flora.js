/**
 * THE HOLDS' PLANTS (area A, M2 wave 2: the look; bible §3.3 "vines, fig, prickly pear with white cochineal flecks,
 * tabaiba, cardón, bougainvillea, the one dragon tree; carrizo in the barrancos"; M2 briefs HG3).
 *
 * Solid vertex-coloured meshes, no alpha; one draw per kind, every instance of the Holds in one static buffer (the
 * flora material of vegetation.js: the trade wind's sway, the land's long shadow, a fade to nothing by distance, so far
 * off the ground shader's own pit-cups carry the read). In their own group, `holds-flora`, beside the Pans' scatter:
 *
 *   holds-vine      a low bush in each green pit near the lens (holds/pits.js: the same pits the ground draws)
 *   holds-tabaiba   grey-green domes on the wild ground between the worked plots and on the rough slopes
 *   holds-tunera    prickly pear: pads in clumps along the plots' edges, white cochineal flecks on them
 *   holds-cardon    candelabras of ribbed green columns on the steep rocky faces
 *   holds-fig       low sprawling fig trees in the lee round Ninewalls
 *   holds-bougain   bougainvillea: crimson-violet masses on the village's open side (never the hostile lamp's magenta)
 *
 * Not here: the one dragon tree (Ninewalls' centre, settlements), the carrizo (the reed system's cover mask, a later
 * change: it is the reed rule's ground). Nothing collides: these are shrubs and a few small trees.
 */
import * as THREE from 'three';
import { rng, biomesAt } from '../island/recipe.js';
import { ISLAND_SCALE as S } from '../island/extent.js';
import { CENTRE as NW, OUTER_R as NW_R } from '../settlements/ninewalls-layout.js';
import { SCAR_LINE, scarFrame } from './blockout.js';
import { holdsCult } from './ground.js';
import { pitsIn, pitAt } from './pits.js';

/** The Holds' box, engine metres (x = E, z = -N), and the cut-offs: fade start, end (m), sway, shadow. */
const BOX = Object.freeze({ x0: -210 * S, x1: 330 * S, z0: 30 * S, z1: 430 * S });
export const HOLDS_FLORA = Object.freeze({
  vine: { name: 'holds-vine', fade: [105, 150], sway: 0.12, cast: false },
  tabaiba: { name: 'holds-tabaiba', fade: [150, 200], sway: 0.04, cast: false },
  tunera: { name: 'holds-tunera', fade: [150, 200], sway: 0.02, cast: true },
  cardon: { name: 'holds-cardon', fade: [260, 340], sway: 0, cast: true },
  fig: { name: 'holds-fig', fade: [300, 380], sway: 0.05, cast: true },
  bougain: { name: 'holds-bougain', fade: [300, 380], sway: 0.06, cast: false },
});

/* --------------------------------------------------------------------- shapes */
const _c = new THREE.Color();
const sst = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** A lumpy blob: an icosahedron, squashed and pushed about, with outward normals (a soft shrub). */
function blob(P, C, N, cx, cy, cz, rx, ry, rz, col, R, jag = 0.18, shade = 0.75) {
  const ico = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
  const p = ico.attributes.position;
  const push = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    if (!push.has(k)) push.set(k, 1 + (R() - 0.5) * 2 * jag);
    const f = push.get(k), lx = x * f, ly = y * f, lz = z * f;
    P.push(cx + lx * rx, cy + Math.max(ly, -0.35) * ry, cz + lz * rz);
    const nl = Math.hypot(x, y * 0.8 + 0.25, z);
    N.push(x / nl, (y * 0.8 + 0.25) / nl, z / nl);
    const t = shade + (1 - shade) * (0.5 + 0.5 * y);
    C.push(col.r * t, col.g * t, col.b * t);
  }
  ico.dispose();
}
/** An upright prism (n sides), base (x, y, z), radius r, height h, ribbed: every other face darker. */
function column(P, C, N, x, y, z, r, h, n, col, tipK = 0.8) {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    const k = i % 2 ? 0.78 : 1.0;
    const q = [[Math.cos(a0) * r, 0, Math.sin(a0) * r], [Math.cos(a1) * r, 0, Math.sin(a1) * r], [Math.cos(a1) * r * tipK, h, Math.sin(a1) * r * tipK], [Math.cos(a0) * r * tipK, h, Math.sin(a0) * r * tipK]];
    for (const j of [0, 1, 2, 0, 2, 3]) {
      P.push(x + q[j][0], y + q[j][1], z + q[j][2]);
      N.push(Math.cos(am), 0.15, Math.sin(am));
      const t = k * (0.75 + 0.25 * (q[j][1] / h));
      C.push(col.r * t, col.g * t, col.b * t);
    }
  }
  // a rounded cap: a fan to a point a little above the top
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const q = [[Math.cos(a0) * r * tipK, h, Math.sin(a0) * r * tipK], [Math.cos(a1) * r * tipK, h, Math.sin(a1) * r * tipK], [0, h + r * 0.9, 0]];
    for (const v of q) { P.push(x + v[0], y + v[1], z + v[2]); N.push(v[0] * 0.5, 0.85, v[2] * 0.5); C.push(col.r * 1.05, col.g * 1.05, col.b * 1.05); }
  }
}
/** A flat pad (an octagon), centre c, its face normal nrm and its long axis u: two-sided by the material. */
function pad(P, C, N, c, u, v, nrm, a, b, col, fleck, R) {
  const ring = [];
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2, ca = Math.cos(t) * a, sb = Math.sin(t) * b;
    ring.push([c[0] + u[0] * ca + v[0] * sb, c[1] + u[1] * ca + v[1] * sb, c[2] + u[2] * ca + v[2] * sb]);
  }
  const fl = Math.floor(R() * 8);
  for (let i = 0; i < 8; i++) {
    const p0 = c, p1 = ring[i], p2 = ring[(i + 1) % 8];
    for (const [pp, edge] of [[p0, 0], [p1, 1], [p2, 1]]) {
      P.push(pp[0], pp[1], pp[2]); N.push(nrm[0], nrm[1], nrm[2]);
      // the cochineal's white wool sits in flecks near a pad's rim
      const w = fleck && edge && (i === fl || i === (fl + 3) % 8) ? 1 : 0;
      const t = edge ? 0.86 : 1.06;
      C.push(w ? 0.78 : col.r * t, w ? 0.75 : col.g * t, w ? 0.7 : col.b * t);
    }
  }
}
function geo(P, C, N) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.computeBoundingSphere();
  return g;
}

/** One vine: a low bush about 1.1 m across and 0.5 m tall, four leaf clusters on short canes. */
function vineGeo() {
  const R = rng(0x71e5), P = [], C = [], N = [];
  for (let k = 0; k < 4; k++) {
    const a = k * 1.62 + R() * 0.6, d = 0.18 + R() * 0.22;
    _c.set(R() > 0.5 ? '#536f2a' : '#668432').multiplyScalar(0.85 + R() * 0.3);
    blob(P, C, N, Math.cos(a) * d, 0.18 + R() * 0.12, Math.sin(a) * d, 0.32 + R() * 0.1, 0.2 + R() * 0.08, 0.3 + R() * 0.1, _c, R, 0.22, 0.6);
  }
  _c.set('#4a3826');
  column(P, C, N, 0, 0, 0, 0.05, 0.22, 4, _c, 0.6);
  return geo(P, C, N);
}
/** Tabaiba: one grey-green dome, a little lumpy, 0.8 m across at scale 1. */
function tabaibaGeo() {
  const R = rng(0x7ab1), P = [], C = [], N = [];
  _c.set('#6d7752');
  blob(P, C, N, 0, 0.28, 0, 0.42, 0.34, 0.42, _c, R, 0.14, 0.62);
  _c.set('#7f8a5c');
  blob(P, C, N, 0.16, 0.42, -0.08, 0.24, 0.2, 0.24, _c, R, 0.12, 0.7);
  return geo(P, C, N);
}
/** Prickly pear: about nine pads branching from a short trunk, 1.4 m tall at scale 1, flecked. */
function tuneraGeo() {
  const R = rng(0x7a9e), P = [], C = [], N = [];
  const green = new THREE.Color('#5f7d3c'), old = new THREE.Color('#6f7a46');
  const pads = [[0, 0.32, 0, 0]];
  for (let i = 0; i < 9; i++) {
    const par = pads[Math.floor(R() * pads.length)];
    const ang = R() * Math.PI * 2, up = 0.24 + R() * 0.12;
    pads.push([par[0] + Math.cos(ang) * 0.18, par[1] + up, par[2] + Math.sin(ang) * 0.18, ang]);
  }
  for (const [x, y, z, ang] of pads) {
    const yaw = ang + R() * 1.2, tilt = (R() - 0.5) * 0.6;
    const nrm = [Math.cos(yaw), tilt, Math.sin(yaw)], nl = Math.hypot(...nrm);
    const n = nrm.map((q) => q / nl), u = [0, 1, 0], v = [-Math.sin(yaw), 0, Math.cos(yaw)];
    pad(P, C, N, [x, y, z], u, v, n, 0.2 + R() * 0.05, 0.14 + R() * 0.04, y < 0.4 ? old : green, R() > 0.35, R);
  }
  return geo(P, C, N);
}
/** Cardón: a candelabra of about nine ribbed columns, 2.4 m at scale 1. */
function cardonGeo() {
  const R = rng(0xca7d), P = [], C = [], N = [];
  _c.set('#4f6a37');
  for (let i = 0; i < 9; i++) {
    const a = R() * Math.PI * 2, d = i === 0 ? 0 : 0.12 + R() * 0.32;
    const h = (i === 0 ? 2.2 : 1.2 + R() * 1.2);
    column(P, C, N, Math.cos(a) * d, 0, Math.sin(a) * d, 0.1 + R() * 0.03, h, 6, _c, 0.9);
  }
  return geo(P, C, N);
}
/** A fig: three short splayed grey stems and a low, broad, flat-topped canopy of six dark lobes, 4 m across, 2.3 m tall. */
function figGeo() {
  const R = rng(0xf19), P = [], C = [], N = [];
  _c.set('#77705f');
  for (let k = 0; k < 3; k++) { const a = k * 2.1 + R(); column(P, C, N, Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25, 0.11, 1.0 + R() * 0.3, 5, _c, 0.7); }
  for (let k = 0; k < 6; k++) {
    const a = k * 1.05 + R() * 0.4, d = k === 0 ? 0 : 0.9 + R() * 0.5;
    _c.set(R() > 0.5 ? '#33461e' : '#3d5423').multiplyScalar(0.85 + R() * 0.2);
    blob(P, C, N, Math.cos(a) * d, 1.45 + R() * 0.3, Math.sin(a) * d, 0.95 + R() * 0.3, 0.42 + R() * 0.12, 0.95 + R() * 0.3, _c, R, 0.22, 0.5);
  }
  return geo(P, C, N);
}
/** Bougainvillea: a mound of crimson-violet bracts over dark leaves, 2.2 m across, 1.6 m tall at scale 1. */
function bougainGeo() {
  const R = rng(0xb06a), P = [], C = [], N = [];
  _c.set('#3e5426');
  blob(P, C, N, 0, 0.6, 0, 1.0, 0.65, 0.9, _c, R, 0.18, 0.6);
  for (let k = 0; k < 5; k++) {
    const a = k * 1.3 + R(), d = 0.35 + R() * 0.45;
    _c.set(R() > 0.5 ? '#8c2a62' : '#a23a74').multiplyScalar(0.85 + R() * 0.25);
    blob(P, C, N, Math.cos(a) * d, 0.75 + R() * 0.55, Math.sin(a) * d, 0.45 + R() * 0.15, 0.35 + R() * 0.12, 0.45 + R() * 0.15, _c, R, 0.24, 0.7);
  }
  return geo(P, C, N);
}

/* --------------------------------------------------------------------- where */
/** Instance records for every kind: [x, y, z, yaw, scale, tint] each (engine metres). Pure given a height function. */
export function holdsFloraRecords(hAt) {
  const out = { vine: [], tabaiba: [], tunera: [], cardon: [], fig: [], bougain: [] };
  const slopeAt = (x, z) => Math.hypot(hAt(x + 1.5, z) - hAt(x - 1.5, z), hAt(x, z + 1.5) - hAt(x, z - 1.5)) / 3;
  const f = { u: 0, v: 0 };
  const scarKeep = (x, z, pad) => {
    scarFrame(x / S, -z / S, f);
    return f.u > -20 && f.u < SCAR_LINE.len + 20 && Math.abs(f.v) < SCAR_LINE.half + SCAR_LINE.BERM_IN + SCAR_LINE.BERM_OUT + pad;
  };
  const nwD = (x, z) => Math.hypot(x - NW.x, z - NW.z);
  const w6 = new Float64Array(6), holdAt = (x, z) => (biomesAt(x, z, w6), w6[1]);
  const R = rng(0x401d5);
  /* vines: one in each green pit whose ground the shader digs (worked, under slope 0.5) */
  for (const p of pitsIn(BOX.x0, BOX.x1, BOX.z0, BOX.z1)) {
    if (!p.green) continue;
    const cult = holdsCult(p.x / S, -p.z / S, holdAt(p.x, p.z));
    if (cult < 0.5) continue;
    const sl = slopeAt(p.x, p.z);
    if (cult * (1 - sst(0.42, 0.6, sl)) < 0.5) continue;
    const y = hAt(p.x, p.z);
    if (!(y > 1)) continue;
    out.vine.push(p.x, y - 0.05, p.z, R() * 6.2832, (0.8 + R() * 0.45) * p.r / 2.25, 0.85 + R() * 0.3);
  }
  /* the wild plants: rejection sampling over the box; each kind its own ground */
  for (let t = 0; t < 90000; t++) {
    const x = BOX.x0 + R() * (BOX.x1 - BOX.x0), z = BOX.z0 + R() * (BOX.z1 - BOX.z0);
    const a = R(), b = R(), c = R();
    const y = hAt(x, z);
    if (!(y > 2)) continue;
    const hold = holdAt(x, z);
    if (hold < 0.8) continue;
    const cult = holdsCult(x / S, -z / S, hold);
    const sl = slopeAt(x, z), dN = nwD(x, z);
    if (scarKeep(x, z, 4)) continue;
    if (dN < NW_R + 2) continue;
    // worked: where the shader digs pits (worked ground under slope 0.42-0.6); wild: the rest, and never in a pit
    const worked = cult * (1 - sst(0.42, 0.6, sl)), pit = pitAt(x, z), inPit = pit && pit.d < pit.r + 1.2 && worked > 0.2;
    if (inPit) continue;
    if (a < 0.022 && sl < 1.1 && worked < 0.45) {                       // tabaiba on the wild ground
      out.tabaiba.push(x, y - 0.06, z, c * 6.2832, 0.7 + b * 0.9, 0.85 + c * 0.3);
    } else if (a > 0.9965 && sl < 0.7) {                                  // prickly pear in clumps, plots and wild alike
      for (let k = 0; k < 1 + Math.floor(b * 3); k++) {
        const xx = x + (R() - 0.5) * 3, zz = z + (R() - 0.5) * 3, pp = pitAt(xx, zz);
        if (pp && pp.d < pp.r + 1.2) continue;
        out.tunera.push(xx, hAt(xx, zz) - 0.05, zz, R() * 6.2832, 0.75 + R() * 0.6, 0.85 + R() * 0.3);
      }
    } else if (a > 0.5 && a < 0.5016 && sl > 0.5 && sl < 1.7) {            // cardón on the steep faces
      out.cardon.push(x, y - 0.1, z, c * 6.2832, 0.7 + b * 0.7, 0.9 + c * 0.2);
    }
  }
  /* figs and bougainvillea round Ninewalls (its open south-west side: bearings 160-300 from the tree) */
  for (let t = 0; t < 400 && (out.fig.length < 14 * 6 || out.bougain.length < 10 * 6); t++) {
    const brg = (150 + R() * 160) * Math.PI / 180, isFig = R() < 0.55, r = NW_R + (isFig ? 5 + R() * 45 : 1.5 + R() * 7);
    const x = NW.x + Math.sin(brg) * r, z = NW.z - Math.cos(brg) * r;
    const y = hAt(x, z);
    if (!(y > 2) || slopeAt(x, z) > 0.7 || scarKeep(x, z, 3) || holdAt(x, z) < 0.6) continue;
    const list = isFig ? out.fig : out.bougain;
    if (list.length >= (isFig ? 14 : 10) * 6) continue;
    list.push(x, y - 0.08, z, R() * 6.2832, 0.8 + R() * 0.5, 0.9 + R() * 0.2);
  }
  return out;
}

/* --------------------------------------------------------------------- the draws */
export class HoldsFlora {
  /** `veg` is the Vegetation (its flora material); `ctx.terrain` gives the drawn ground's height. */
  constructor(veg) {
    const ctx = veg.ctx, T = ctx.terrain;
    this.group = new THREE.Group();
    this.group.name = 'holds-flora';
    ctx.scene.add(this.group);
    this._owned = [];
    const t0 = performance.now();
    const rec = holdsFloraRecords((x, z) => T.getHeight(x, z));
    const geos = { vine: vineGeo(), tabaiba: tabaibaGeo(), tunera: tuneraGeo(), cardon: cardonGeo(), fig: figGeo(), bougain: bougainGeo() };
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    this.meshes = {};
    for (const [key, cfg] of Object.entries(HOLDS_FLORA)) {
      const data = rec[key], n = data.length / 6, g = geos[key];
      this._owned.push(g);
      if (!n) continue;
      const mat = veg._floraMaterial({ fade: cfg.fade, sway: cfg.sway });
      const mesh = new THREE.InstancedMesh(g, mat, n);
      for (let i = 0; i < n; i++) {
        const o = i * 6;
        p.set(data[o], data[o + 1], data[o + 2]); q.setFromAxisAngle(up, data[o + 3]); s.setScalar(data[o + 4]);
        m.compose(p, q, s); mesh.setMatrixAt(i, m);
        col.setScalar(data[o + 5]); mesh.setColorAt(i, col);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.name = cfg.name;
      mesh.castShadow = cfg.cast;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.meshes[key] = mesh;
    }
    this.buildMs = +(performance.now() - t0).toFixed(1);
  }

  /** Instances and triangles per kind (for the rows: HG3, HG10). */
  stats() {
    const out = {};
    for (const [k, mesh] of Object.entries(this.meshes)) {
      const tris = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
      out[k] = { name: mesh.name, instances: mesh.count, trisEach: tris, tris: tris * mesh.count, castShadow: mesh.castShadow };
    }
    return out;
  }

  dispose() {
    for (const c of this.group.children) c.dispose?.();
    for (const g of this._owned) g.dispose();
    this.group.parent?.remove(this.group);
    this.group.clear();
  }
}
