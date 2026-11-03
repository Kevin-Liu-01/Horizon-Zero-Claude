/**
 * CALIMA — recipe: Brea's v0 kit (hero-body W0b; plan §2 "merged stow kit with
 * `pieceId` mask, v0 kit GLBs"; bible §3.6, §5.2, §5.3; R10).
 *
 * OUTPUTS (one shared 512² weapon atlas, swatch cells; one material each)
 *   public/models/hero/kit/stowkit-v0.glb       ALL stowed gear as ONE skinned mesh,
 *        ONE draw, bound by name to Brea's bones; per-vertex `_PIECE` bit
 *        (1 lance, 2 bow, 4 quiver + arrows, 8 bracer, 16 alidade) — the runtime
 *        mask collapses a piece while its held copy is out (still one draw)
 *   public/models/hero/kit/lance-shepherd-v0.glb  Shepherd's Lance, 1.55 m, pine,
 *        22 cm bronze leaf blade, 7 cm bronze BOB-SHAPED butt cap, esparto wraps at
 *        20 % and 55 %, vermilion/white graduations on the upper third
 *   public/models/hero/kit/bow-sabina-v0.glb      Sabina Bow blockout, 1.45 m juniper
 *        self-bow (pale sapwood face, dark heartwood stripe), esparto grip, horn nocks
 *   public/models/hero/kit/quiver-cane-v0.glb     rigid cane tube, palm-weave cap, 12 arrows
 *   public/models/hero/kit/bracer-crescent-v0.glb archer's crescent bracer (leather,
 *        bronze crescent plate)
 * Every held GLB is authored at REAL length (SPEAR_SCALE retired, M9) with socket
 * nodes `grip`, `grip2`, `nock`, `string_top`, `string_bottom`, `tip`, `stow`, `butt`.
 *
 * STOW (R10, bible §3.6), authored from the body + outfit surface in bind space:
 *   lance  `stow_lance` (a socket under spine_02, posed per frame by the carry
 *          solve), 34° from vertical, butt (the bob) low at the LEFT hip, blade
 *          above the RIGHT shoulder; >= 2.5 cm off the back everywhere
 *   bow    spine_02, the opposite diagonal beneath the lance, <= 3 cm off the back
 *   quiver pelvis, right hip, tilted 20° forward (nocks reachable below the shoulder)
 *   bracer lowerarm_l, dorsal side
 *   alidade dyn_alidadeCord_02, at the sternum outside the smock
 */
import sharp from 'sharp';
import path from 'node:path';
import { Document } from '@gltf-transform/core';
import {
  ROOT, srcRoot, UBC_DIR, readGltf, cleanDoc, nodeByName, addChain, jointIndex, jointPos, writeSkinned,
  hex, noise3, v3,
} from '../lib/face.mjs';
import { CHAINS, BODY_HEIGHT } from '../brea.mjs';

export const LANE = 'hero-body';
const DIR = 'public/models/hero/kit';
export const OUTPUTS = [
  `${DIR}/stowkit-v0.glb`, `${DIR}/lance-shepherd-v0.glb`, `${DIR}/bow-sabina-v0.glb`,
  `${DIR}/quiver-cane-v0.glb`, `${DIR}/bracer-crescent-v0.glb`,
];
const RECIPE = 'tools/build/recipes/weapons/kit-v0.mjs';
export const PIECE = { lance: 1, bow: 2, quiver: 4, bracer: 8, alidade: 16 };
/** The lance's carry socket joint (see `addSocket`); src/hero/stowkit.js creates it on the hero. */
export const LANCE_SOCKET = 'stow_lance';

/** A socket joint under `parentName` at the identity: same bind, its own index in the skin. */
function addSocket(doc, name, parentName) {
  const skin = doc.getRoot().listSkins()[0];
  const parent = skin.listJoints().find((j) => j.getName() === parentName);
  if (!parent) throw new Error(`addSocket: no parent joint ${parentName}`);
  const pi = skin.listJoints().indexOf(parent);
  const ibmAcc = skin.getInverseBindMatrices();
  const ibm = Array.from(ibmAcc.getArray());
  const node = doc.createNode(name);
  parent.addChild(node);
  skin.addJoint(node);
  ibm.push(...ibm.slice(pi * 16, pi * 16 + 16));
  ibmAcc.setArray(new Float32Array(ibm));
}

/* ---------------------------------------------------------------- atlas */

const CELLS = [
  ['pine', '#3A2A1E', 0.62, 0], ['bronze', '#B08A45', 0.42, 1], ['bronzeDark', '#8C6A30', 0.5, 1], ['esparto', '#B59A62', 0.85, 0],
  ['vermilion', '#D8432B', 0.6, 0], ['white', '#EDEAE2', 0.6, 0], ['sapwood', '#D8C49A', 0.55, 0], ['heartwood', '#6E3F2A', 0.55, 0],
  ['horn', '#2E2622', 0.4, 0], ['cane', '#C9B27A', 0.5, 0], ['caneNode', '#8E7748', 0.55, 0], ['palm', '#A88F5A', 0.85, 0],
  ['leather', '#4A3020', 0.7, 0], ['string', '#E8E0CC', 0.8, 0], ['fletchW', '#F2EEE6', 0.8, 0], ['fletchB', '#1C1B1E', 0.8, 0],
  ['brass', '#C29A52', 0.35, 1], ['lapilli', '#1C1B1E', 0.8, 0],
];
const CELL = 64, GRID = 8, AW = CELL * GRID;
const cellIdx = Object.fromEntries(CELLS.map((c, i) => [c[0], i]));
/** UV rect [u0, v0, du, dv] of a swatch (4 px inset). */
export function cell(name) {
  const i = cellIdx[name];
  const x = (i % GRID) * CELL + 4, y = Math.floor(i / GRID) * CELL + 4;
  return [x / AW, y / AW, (CELL - 8) / AW, (CELL - 8) / AW];
}
async function atlasImages() {
  const base = Buffer.alloc(AW * AW * 3, 0);
  const orm = Buffer.alloc(AW * AW * 3, 0);
  CELLS.forEach(([name, h, rough, metal], i) => {
    const c = hex(h);
    const cx = (i % GRID) * CELL, cy = Math.floor(i / GRID) * CELL;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const gx = cx + x, gy = cy + y;
      let k = 0.94 + 0.08 * (noise3(gx * 0.12, gy * 0.12, i) - 0.5);
      if (name === 'pine' || name === 'sapwood' || name === 'heartwood') k *= 0.92 + 0.1 * Math.sin(gx * 0.9 + 6 * noise3(gx * 0.05, gy * 0.4, i));

      if (name === 'esparto' || name === 'palm') k *= 0.86 + 0.16 * Math.abs(Math.sin((gx + gy) * 0.55)) * Math.abs(Math.sin((gx - gy) * 0.55));
      if (name === 'cane') k *= 0.95 + 0.05 * Math.sin(gx * 2.4);
      const o = (gy * AW + gx) * 3;
      // juniper: pale sapwood face, the dark heartwood stripe down its middle
      const cc = name === 'heartwood' && Math.abs(x - 32) >= 7 ? hex('#D8C49A') : c;
      for (let j = 0; j < 3; j++) base[o + j] = Math.max(0, Math.min(255, Math.round(cc[j] * k)));
      orm[o] = 255; orm[o + 1] = Math.round(rough * 255); orm[o + 2] = metal ? 255 : 0;
    }
  });
  return {
    base: await sharp(base, { raw: { width: AW, height: AW, channels: 3 } }).webp({ quality: 90, effort: 4 }).toBuffer(),
    orm: await sharp(orm, { raw: { width: AW, height: AW, channels: 3 } }).webp({ quality: 90, effort: 4 }).toBuffer(),
  };
}

/* ------------------------------------------------------------- geometry */

/** Geometry buffer: flat arrays + optional per-vertex piece id. */
const G = () => ({ pos: [], nrm: [], uv: [], idx: [] });
function merge(a, b) { const o = a.pos.length / 3; a.pos.push(...b.pos); a.nrm.push(...b.nrm); a.uv.push(...b.uv); for (const i of b.idx) a.idx.push(i + o); return a; }

/** Lathe around +Y: profile [[r, y], ...], `sides`, UV rect (u around, v along). */
function lathe(profile, { sides = 8, rect, open = false, phase = 0 }) {
  const g = G();
  const n = profile.length;
  let len = 0; const acc = [0];
  for (let i = 1; i < n; i++) { len += Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]); acc.push(len); }
  for (let i = 0; i < n; i++) {
    const [r, y] = profile[i];
    const pr = profile[Math.max(0, i - 1)], nx = profile[Math.min(n - 1, i + 1)];
    const dr = nx[0] - pr[0], dy = nx[1] - pr[1];
    const nl = Math.hypot(dr, dy) || 1;
    for (let k = 0; k <= sides; k++) {
      const th = (k / sides) * Math.PI * 2 + phase;
      const c = Math.cos(th), s = Math.sin(th);
      g.pos.push(r * c, y, r * s);
      g.nrm.push((dy / nl) * c, -dr / nl, (dy / nl) * s);
      g.uv.push(rect[0] + (k / sides) * rect[2], rect[1] + (len ? acc[i] / len : 0) * rect[3]);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    const a = i * (sides + 1) + k, b = a + 1, c = a + sides + 1, d = c + 1;
    g.idx.push(a, c, b, b, c, d);
  }
  if (!open) {
    for (const [end, sign] of [[0, -1], [n - 1, 1]]) {
      if (profile[end][0] < 1e-4) continue;
      const ci = g.pos.length / 3;
      g.pos.push(0, profile[end][1], 0); g.nrm.push(0, sign, 0); g.uv.push(rect[0] + rect[2] / 2, rect[1] + rect[3] / 2);
      for (let k = 0; k < sides; k++) {
        const a = end * (sides + 1) + k;
        if (sign > 0) g.idx.push(a, a + 1, ci); else g.idx.push(a + 1, a, ci);
      }
    }
  }
  return g;
}
/** Box centred at c with half-sizes h. */
function box(c, h, rect) {
  const g = G();
  const F = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [0, 0, -1], [1, 0, 0]], [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
  for (const [n, u, v] of F) {
    const o = g.pos.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.pos.push(c[0] + h[0] * (n[0] + u[0] * a + v[0] * b), c[1] + h[1] * (n[1] + u[1] * a + v[1] * b), c[2] + h[2] * (n[2] + u[2] * a + v[2] * b));
      g.nrm.push(...n);
      g.uv.push(rect[0] + (a + 1) / 2 * rect[2], rect[1] + (b + 1) / 2 * rect[3]);
    }
    g.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  return g;
}
/** Apply a 3x3 basis (columns X, Y, Z) + translation to a geometry, in place. */
function place(g, X, Y, Z, T) {
  for (let i = 0; i < g.pos.length; i += 3) {
    const [x, y, z] = [g.pos[i], g.pos[i + 1], g.pos[i + 2]];
    g.pos[i] = X[0] * x + Y[0] * y + Z[0] * z + T[0];
    g.pos[i + 1] = X[1] * x + Y[1] * y + Z[1] * z + T[1];
    g.pos[i + 2] = X[2] * x + Y[2] * y + Z[2] * z + T[2];
    const [a, b, c] = [g.nrm[i], g.nrm[i + 1], g.nrm[i + 2]];
    g.nrm[i] = X[0] * a + Y[0] * b + Z[0] * c;
    g.nrm[i + 1] = X[1] * a + Y[1] * b + Z[1] * c;
    g.nrm[i + 2] = X[2] * a + Y[2] * b + Z[2] * c;
  }
  return g;
}
/** Orthonormal basis with Y along `dir` and Z as close as possible to `zHint`. */
function basisY(dir, zHint = [0, 0, 1]) {
  const Y = v3.norm(dir);
  let X = v3.norm(v3.cross(Y, zHint));
  if (!Number.isFinite(X[0])) X = [1, 0, 0];
  const Z = v3.cross(X, Y);
  return [X, Y, Z];
}

/* -------------------------------------------------------------- pieces */

/** Shepherd's Lance, local +Y from the butt (y 0) to the tip (y 1.55). */
export const LANCE = { length: 1.55, blade: 0.22, cap: 0.11, grip: 0.20, grip2: 0.55, r: 0.0145 };
function lanceGeo() {
  const g = G();
  const L = LANCE, r = L.r;
  // bob-shaped bronze butt cap: a plumb bob, point down. Fix round 1
  // (V-brea-one-glance cue 4): Ø 9 cm x 11 cm (was Ø 5.4 x 7 cm, under one
  // pixel at 64 px) so the bob reads as a weight at the lance's low end
  merge(g, lathe([[0, 0], [0.018, 0.016], [0.036, 0.040], [0.045, 0.062], [0.040, 0.082], [0.026, 0.096], [r + 0.002, 0.104], [r + 0.002, L.cap]], { sides: 12, rect: cell('bronze') }));
  // haft in segments: pine, esparto wraps at 20 % and 55 %, graduations on the upper third
  const segs = [
    [L.cap, L.grip * L.length - 0.06, 'pine'], [L.grip * L.length - 0.06, L.grip * L.length + 0.06, 'esparto', 0.0025],
    [L.grip * L.length + 0.06, L.grip2 * L.length - 0.06, 'pine'], [L.grip2 * L.length - 0.06, L.grip2 * L.length + 0.06, 'esparto', 0.0025],
    [L.grip2 * L.length + 0.06, 1.03, 'pine'], [1.03, 1.13, 'vermilion'], [1.13, 1.23, 'white'], [1.23, 1.31, 'vermilion'],
  ];
  for (const [a, b, mat, fat = 0] of segs) merge(g, lathe([[r + fat, a], [r + fat, b]], { sides: 8, rect: cell(mat), open: true }));
  // bronze socket + leaf blade (diamond section)
  merge(g, lathe([[r + 0.001, 1.31], [r + 0.003, 1.315], [r + 0.002, 1.345], [0.010, 1.355]], { sides: 8, rect: cell('bronze'), open: true }));
  const bl = G();
  const yb = 1.355, ln = L.blade - 0.005;
  const prof = [[0, 0], [0.026, 0.05], [0.024, 0.11], [0.014, 0.17], [0, ln]];
  const th = 0.0042;
  // two faces x two halves: vertices along the profile, ridge at x=0
  for (const s of [1, -1]) for (const f of [1, -1]) {
    const o = bl.pos.length / 3;
    for (let i = 0; i < prof.length; i++) {
      const [w, y] = prof[i];
      bl.pos.push(0, yb + y, f * th, s * w, yb + y, 0);
      const n = v3.norm([s * th, 0, f * Math.max(w, 0.004)]);
      bl.nrm.push(...n, ...n);
      const c = cell('bronze');
      bl.uv.push(c[0] + c[2] * 0.5, c[1] + (y / ln) * c[3], c[0] + c[2] * (0.5 + s * 0.45), c[1] + (y / ln) * c[3]);
    }
    for (let i = 0; i < prof.length - 1; i++) {
      const a = o + i * 2, b = a + 1, c = a + 2, d = a + 3;
      if (s * f > 0) bl.idx.push(a, c, b, b, c, d); else bl.idx.push(a, b, c, b, d, c);
    }
  }
  merge(g, bl);
  return g;
}
/** Sabina Bow blockout, local: +Y along the stave, grip at the origin, the belly (string side) toward -Z. */
export const BOW = { length: 1.45, brace: 0.16 };
function bowGeo() {
  const g = G();
  const half = BOW.length / 2;
  const N = 14;
  // stave: the braced curve bends the limbs back toward the archer (-Z)
  // a braced self-bow: the limbs bend back toward the archer, the tips recurve a touch
  const stave = (t) => { const a = Math.abs(t); const y = t * half * (1 - 0.06 * a * a); const z = -0.16 * a * a + 0.03 * Math.pow(a, 6); return [0, y, z]; };
  const w = (t) => 0.017 * (1 - 0.55 * Math.abs(t)) + 0.006;
  for (const sgn of [1, -1]) {
    for (let i = 0; i < N; i++) {
      const t0 = sgn * (i / N), t1 = sgn * ((i + 1) / N);
      const p0 = stave(t0), p1 = stave(t1);
      const dir = v3.sub(p1, p0); const len = Math.hypot(...dir);
      const [X, Y, Z] = basisY(dir, [0, 0, 1]);
      // pale sapwood face with the dark heartwood stripe down it (one swatch), esparto grip
      const mat = Math.abs(t0) < 0.08 ? 'esparto' : 'heartwood';
      const seg = lathe([[w(t0), 0], [w(t1), len]], { sides: 6, rect: cell(mat), open: true, phase: Math.PI / 6 });
      // flatten the section: limbs are wider than thick
      for (let k = 0; k < seg.pos.length; k += 3) seg.pos[k] *= 1.6;
      place(seg, X, Y, Z, p0);
      merge(g, seg);
    }
    // horn nock
    const tip = stave(sgn);
    merge(g, place(lathe([[0.009, 0], [0.007, 0.03], [0, 0.04]], { sides: 6, rect: cell('horn') }), [1, 0, 0], [0, sgn, 0], [0, 0, sgn], tip));
  }
  // the string, tip to tip, straight at brace
  const top = stave(1), bot = stave(-1);
  const dir = v3.sub(top, bot);
  const [X, Y, Z] = basisY(dir, [0, 0, 1]);
  merge(g, place(lathe([[0.0016, 0], [0.0016, Math.hypot(...dir)]], { sides: 4, rect: cell('string'), open: true }), X, Y, Z, bot));
  return { g, top, bot, nock: [0, 0, bot[2]] };
}
/** Cane quiver with 12 arrows, local +Y up the tube from its foot (y 0). */
export const QUIVER = { length: 0.60, r: 0.040, arrows: 12, arrowOut: 0.11 };
function quiverGeo() {
  const g = G();
  const Q = QUIVER;
  const prof = [[0.0, 0], [Q.r * 0.9, 0.0]];
  for (let y = 0.0; y <= Q.length + 1e-6; y += 0.15) prof.push([Q.r, y + 0.004], [Q.r + 0.004, y + 0.012], [Q.r, y + 0.02]);
  merge(g, lathe(prof.slice(1), { sides: 12, rect: cell('cane'), open: true }));
  merge(g, lathe([[0, 0], [Q.r * 0.96, 0.0]], { sides: 12, rect: cell('caneNode') }));
  // palm-weave cap over the BACK half of the mouth (the nocks show at the front)
  const cap = lathe([[Q.r + 0.005, 0], [Q.r + 0.006, 0.05], [Q.r * 0.6, 0.075], [0.0, 0.082]], { sides: 12, rect: cell('palm'), open: true });
  // keep only the back half (z < 0)
  const keepTri = [];
  for (let t = 0; t < cap.idx.length; t += 3) {
    const zc = (cap.pos[cap.idx[t] * 3 + 2] + cap.pos[cap.idx[t + 1] * 3 + 2] + cap.pos[cap.idx[t + 2] * 3 + 2]) / 3;
    if (zc < 0.004) keepTri.push(cap.idx[t], cap.idx[t + 1], cap.idx[t + 2]);
  }
  cap.idx = keepTri;
  for (let i = 1; i < cap.pos.length; i += 3) cap.pos[i] += Q.length - 0.02;
  merge(g, cap);
  // arrows: cane shafts with gull fletching, nocks above the mouth, front half
  for (let a = 0; a < Q.arrows; a++) {
    const ang = (a / Q.arrows) * Math.PI * 2;
    const rr = (a % 2 ? 0.55 : 0.28) * Q.r;
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr + 0.006;
    const y0 = Q.length - 0.25, y1 = Q.length + Q.arrowOut;
    merge(g, place(lathe([[0.0035, 0], [0.0035, y1 - y0]], { sides: 4, rect: cell('cane'), open: true }), [1, 0, 0], [0, 1, 0], [0, 0, 1], [x, y0, z]));
    for (let f = 0; f < 3; f++) {
      const fa = ang + (f / 3) * Math.PI * 2;
      const fx = Math.cos(fa), fz = Math.sin(fa);
      const fl = box([x + fx * 0.008, y1 - 0.045, z + fz * 0.008], [0.0005, 0.03, 0.0005], cell(f === 0 ? 'fletchB' : 'fletchW'));
      // turn the slab into a vane facing out
      for (let k = 0; k < fl.pos.length; k += 3) {
        const dx = fl.pos[k] - (x + fx * 0.008), dz = fl.pos[k + 2] - (z + fz * 0.008);
        const wv = 0.0075 * Math.sign(dx + dz || 1);
        fl.pos[k] = x + fx * (0.008 + wv); fl.pos[k + 2] = z + fz * (0.008 + wv);
      }
      merge(g, fl);
    }
  }
  return g;
}
/** The crescent fin's height factor over the fix-round-1 cut (V-brea-one-glance cue 3; fix round 3). */
export const CRESCENT_K = 1.5;
/** Archer's crescent bracer, local +X along the forearm (elbow -> wrist), dorsal +Y. */
function bracerGeo(r = 0.036, len = 0.17) {
  const g = G();
  const SEG = 10, ROWS = 6;
  const rect = cell('leather');
  for (let i = 0; i <= ROWS; i++) {
    const x = (i / ROWS) * len;
    const flare = 1 + 0.12 * Math.pow(Math.abs(i / ROWS - 0.15), 1.4);
    for (let k = 0; k <= SEG; k++) {
      const th = -0.15 * Math.PI + (k / SEG) * 1.3 * Math.PI;   // the dorsal 234°
      const y = Math.sin(th), z = Math.cos(th);
      g.pos.push(x, y * r * flare, z * r * flare);
      g.nrm.push(0, y, z);
      g.uv.push(rect[0] + (k / SEG) * rect[2], rect[1] + (i / ROWS) * rect[3]);
    }
  }
  for (let i = 0; i < ROWS; i++) for (let k = 0; k < SEG; k++) {
    const a = i * (SEG + 1) + k, b = a + 1, c = a + SEG + 1, d = c + 1;
    g.idx.push(a, b, c, b, d, c);
  }
  // the bronze CRESCENT standing on the dorsal ridge (fix round 1,
  // V-brea-one-glance cue 3): a crescent moon on its back, 4 mm thick, its two
  // horns 7.2 cm proud of the leather at the ends of a 13.6 cm span and its
  // belly 2.4 cm proud in the middle. The first two cuts (a plate lying flat on
  // the leather, 0.6 then 2.2 cm proud) read at 64 px only as a thicker
  // forearm; a fin this tall breaks the forearm's outline by 2 px with the arm
  // hanging (the dorsal side faces out), and the horns make it a crescent
  // close up. Dorsal = away from the bowstring's path (bible §3.6).
  const cr = cell('bronze');
  const N = 16, t = 0.002, base = r * 1.04;
  const x0 = len * 0.10, x1 = len * 0.90;
  // fix round 3 (judge: "a 1-2 px nub on the front view only"): the fin is
  // `CRESCENT_K` taller above its base row — horns 10.8 cm, belly 3.8 cm proud
  // (fix round 4: the shipped GLBs are rebuilt from this recipe; the in-place
  // patch script fix round 3 used while the sources were away is retired)
  const top = (a) => base - 0.004 + CRESCENT_K * (0.028 + 0.048 * a * a);
  for (const f of [1, -1]) {                              // the two faces, normals +-Z
    const o = g.pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const a = -1 + 2 * (i / N), x = x0 + (x1 - x0) * (i / N);
      g.pos.push(x, base - 0.004, f * t, x, top(a), f * t * (1 - 0.6 * a * a));
      g.nrm.push(0, 0, f, 0, 0, f);
      g.uv.push(cr[0] + (i / N) * cr[2], cr[1] + cr[3], cr[0] + (i / N) * cr[2], cr[1]);
    }
    for (let i = 0; i < N; i++) {
      const a = o + i * 2;
      if (f > 0) g.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else g.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  {                                                        // the top edge
    const o = g.pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const a = -1 + 2 * (i / N), x = x0 + (x1 - x0) * (i / N), y = top(a), tt = t * (1 - 0.6 * a * a);
      const ny = 1, nx = -0.072 * a * (x1 - x0) / 2;        // the slope's normal in x-y
      const l = Math.hypot(nx, ny);
      g.pos.push(x, y, tt, x, y, -tt);
      g.nrm.push(nx / l, ny / l, 0, nx / l, ny / l, 0);
      g.uv.push(cr[0] + (i / N) * cr[2], cr[1], cr[0] + (i / N) * cr[2], cr[1] + 0.2 * cr[3]);
    }
    for (let i = 0; i < N; i++) { const a = o + i * 2; g.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  return g;
}
/** Fix round 4: the alidade's neck cord radius (m). */
const CORD_R = 0.0022;
/**
 * Fix round 4: a thin cord tube along the bind-space polyline `P`, each point
 * carrying its skin [[jointName, weight], ...]; rings are blended linearly
 * between the points. Returns { g, skin } (skin: one entry per vertex).
 */
function cordGeo(P, skins, r, closed, per = 1, ring = 4) {
  const g = G(), skin = [];
  const rect = cell('string');
  const pts = [], sk = [];
  for (let i = 0; i < P.length - 1; i++) {
    for (let k = 0; k < per; k++) {
      const f = k / per, a = P[i], b = P[i + 1];
      pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
      // blend the two points' skins
      const m = new Map();
      for (const [n, w] of skins[i]) m.set(n, (m.get(n) || 0) + w * (1 - f));
      for (const [n, w] of skins[i + 1]) m.set(n, (m.get(n) || 0) + w * f);
      sk.push([...m.entries()].filter(([, w]) => w > 1e-4).sort((x, y) => y[1] - x[1]).slice(0, 4));
    }
  }
  pts.push(P[P.length - 1]); sk.push(skins[skins.length - 1]);
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const t = v3.norm(v3.sub(b, a));
    const ref = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const sd = v3.norm(v3.cross(t, ref)), up = v3.cross(sd, t);
    for (let k = 0; k <= ring; k++) {
      const th = (k / ring) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const nr = [sd[0] * c + up[0] * s, sd[1] * c + up[1] * s, sd[2] * c + up[2] * s];
      g.pos.push(pts[i][0] + nr[0] * r, pts[i][1] + nr[1] * r, pts[i][2] + nr[2] * r);
      g.nrm.push(...nr);
      g.uv.push(rect[0] + (k / ring) * rect[2], rect[1] + (i / (n - 1)) * rect[3]);
      skin.push(sk[i]);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < ring; k++) {
    const i0 = i * (ring + 1) + k, i1 = i0 + 1, i2 = i0 + ring + 1, i3 = i2 + 1;
    g.idx.push(i0, i2, i1, i1, i2, i3);
  }
  void closed;
  return { g, skin };
}
/** The alidade: 6 cm brass sighting tube, local +X along the tube. */
function alidadeGeo() {
  // (fix round 4: 8 sides, was 10 — the tris go to the neck cord)
  const tube = lathe([[0.0085, -0.03], [0.0095, -0.028], [0.0080, -0.026], [0.0080, 0.026], [0.0095, 0.028], [0.0085, 0.03]], { sides: 8, rect: cell('brass') });
  return place(tube, [0, -1, 0], [1, 0, 0], [0, 0, 1], [0, 0, 0]);
}

/* ------------------------------------------------------------- output */

function toPrim(doc, buf, g, mat, extra = {}) {
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const n = new Float32Array(g.nrm);
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  const p = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(g.pos)))
    .setAttribute('NORMAL', acc('VEC3', n))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(g.uv)))
    .setIndices(acc('SCALAR', new Uint32Array(g.idx)));
  for (const [k, [type, arr]] of Object.entries(extra)) p.setAttribute(k, acc(type, arr));
  p.setMaterial(mat);
  return p;
}
function kitMaterial(doc, atlas) {
  const base = doc.createTexture('kit-v0-base').setImage(atlas.base).setMimeType('image/webp').setURI('kit-v0-base.webp');
  const orm = doc.createTexture('kit-v0-orm').setImage(atlas.orm).setMimeType('image/webp').setURI('kit-v0-orm.webp');
  return doc.createMaterial('MI_Kit_v0').setBaseColorTexture(base).setMetallicRoughnessTexture(orm)
    .setMetallicFactor(1).setRoughnessFactor(1).setDoubleSided(false);
}

async function writeHeld(out, name, g, sockets, extras, atlas) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const mat = kitMaterial(doc, atlas);
  const scene = doc.createScene('scene');
  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(toPrim(doc, buf, g, mat)));
  for (const [s, p] of Object.entries(sockets)) node.addChild(doc.createNode(s).setTranslation(p.map((v) => +v.toFixed(5))));
  scene.addChild(node);
  const file = path.join(out, `${DIR}/${name}.glb`);
  return writeSkinned(doc, file, {
    provenance: { recipe: RECIPE, sources: ['brea-generated'], licence: 'project-original' },
    extras: { r5Kit: { name, ...extras, sockets: Object.keys(sockets) } },
  });
}

export async function build({ out = ROOT } = {}) {
  const atlas = await atlasImages();
  const res = {};
  // ---- held / standalone GLBs (local frames)
  const lance = lanceGeo();
  res.lance = await writeHeld(out, 'lance-shepherd-v0', lance, {
    butt: [0, 0, 0], grip: [0, LANCE.grip * LANCE.length, 0], grip2: [0, LANCE.grip2 * LANCE.length, 0],
    stow: [0, LANCE.length / 2, 0], tip: [0, LANCE.length, 0],
  }, { length: LANCE.length, blade: LANCE.blade, buttCap: 'bob', gripFrac: [LANCE.grip, LANCE.grip2] }, atlas);
  const bow = bowGeo();
  res.bow = await writeHeld(out, 'bow-sabina-v0', bow.g, {
    grip: [0, 0, 0], nock: bow.nock, string_top: bow.top, string_bottom: bow.bot, stow: [0, 0, 0],
  }, { length: BOW.length, braceZ: +bow.nock[2].toFixed(4), pullFrom: 'rigProfile.bow (Lmax solve on Brea)', note: 'blockout' }, atlas);
  const quiver = quiverGeo();
  res.quiver = await writeHeld(out, 'quiver-cane-v0', quiver, {
    stow: [0, 0, 0], mouth: [0, QUIVER.length, 0.0],
  }, { length: QUIVER.length, arrows: QUIVER.arrows, tilt: '20° forward' }, atlas);
  const bracer = bracerGeo();
  res.bracer = await writeHeld(out, 'bracer-crescent-v0', bracer, { stow: [0, 0, 0] }, { socket: 'lowerarm_l', side: 'dorsal' }, atlas);

  // ---- the merged stow kit, skinned to Brea's bones
  const SRC = srcRoot();
  const doc = await readGltf(path.join(UBC_DIR(SRC), 'Superhero_Female_FullBody.gltf'));
  cleanDoc(doc);
  // body surface for clearance (bind), before the meshes go
  const bodyPrim = nodeByName(doc, 'Superhero_Female').getMesh().listPrimitives()[0];
  const surf = [];
  { const P = bodyPrim.getAttribute('POSITION'), p = [0, 0, 0]; for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p); surf.push([p[0], p[1], p[2]]); } }
  const forearm = forearmFrame(doc, bodyPrim);
  for (const n of doc.getRoot().listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.dispose(); }
  const { panBindTriangles } = await import('../outfit-pan-1.mjs');
  const tri = await panBindTriangles();
  for (let i = 0; i < tri.length; i += 3) surf.push([tri[i], tri[i + 1], tri[i + 2]]);
  addChain(doc, CHAINS.alidadeCord.names, CHAINS.alidadeCord.points, CHAINS.alidadeCord.parent);
  // the lance's carry socket (fix round 1, R10 in motion): `stow_lance`, a joint
  // under spine_02 at the identity (its bind = spine_02's bind), that the
  // runtime carry solve (src/hero/stowkit.js `solveLance`) poses every frame
  // so the lance rides the TRUNK LINE in the R10 band instead of spine_03's
  // curl and twist; with no solve it simply follows spine_02
  addSocket(doc, LANCE_SOCKET, 'spine_02');

  const backZ = (x, y) => { let z = 0; for (const q of surf) if (Math.abs(q[0] - x) < 0.03 && Math.abs(q[1] - y) < 0.03 && q[2] < z) z = q[2]; return z; };
  const pieces = [];
  const stowInfo = {};
  // lance: 34° from vertical, butt low at the left hip (+x), rising to the right
  {
    const ang = 34 * Math.PI / 180;
    const d = [-Math.sin(ang), Math.cos(ang), 0];
    // fix round 1: the bob 10 cm lower (below the hanging left hand, so the
    // 64 px silhouette shows it as its own knob at the end of the diagonal)
    const butt = [0.262, 0.64, 0];
    const L = LANCE.length;
    // the haft's z: a straight line >= 2.5 cm behind the back at every sample
    let z0 = 0, z1 = 0;
    const need = [];
    for (let t = 0.05; t <= 0.85; t += 0.05) {
      const x = butt[0] + d[0] * L * t, y = butt[1] + d[1] * L * t;
      need.push([t, backZ(x, y) - 0.025 - LANCE.r - 0.004]);
    }
    // lower envelope line through the two most constraining samples
    let best = null;
    for (let i = 0; i < need.length; i++) for (let j = i + 1; j < need.length; j++) {
      const [ta, za] = need[i], [tb, zb] = need[j];
      const b = (zb - za) / (tb - ta), a = za - b * ta;
      if (need.every(([t, z]) => a + b * t <= z + 1e-6)) {
        const gap = need.reduce((s, [t, z]) => s + (z - (a + b * t)), 0);
        if (!best || gap < best.gap) best = { a, b, gap };
      }
    }
    z0 = best.a; z1 = best.b;
    const start = [butt[0], butt[1], z0];
    const end = [butt[0] + d[0] * L, butt[1] + d[1] * L, z0 + z1];
    const dir = v3.sub(end, start);
    const [X, Y, Z] = basisY(dir, [0, 0, -1]);
    const g = place(lanceGeo(), X, Y, Z, start);
    pieces.push({ g, joint: LANCE_SOCKET, bit: PIECE.lance });
    stowInfo.lance = { butt: start, tip: end, degFromVertical: 34, joint: LANCE_SOCKET, parent: 'spine_02' };
  }
  // bow: the opposite diagonal beneath the lance (right hip -> left shoulder), belly to the back
  {
    const ang = 28 * Math.PI / 180;
    const d = [Math.sin(ang), Math.cos(ang), 0];
    const ctr = [-0.03, 1.40, 0];
    const half = BOW.length / 2;
    let z = 0;
    for (let t = -0.85; t <= 0.85; t += 0.1) z = Math.min(z, backZ(ctr[0] + d[0] * half * t, ctr[1] + d[1] * half * t));
    const c = [ctr[0], ctr[1], z - 0.016];
    const [X, Y, Z] = basisY(d, [0, 0, 1]);
    const g = place(bowGeo().g, X, Y, Z, c);
    pieces.push({ g, joint: 'spine_02', bit: PIECE.bow });
    stowInfo.bow = { centre: c, degFromVertical: 28, joint: 'spine_02' };
  }
  // quiver: right hip, tilted 20° forward
  {
    const ang = 20 * Math.PI / 180;
    const d = [0, Math.cos(ang), Math.sin(ang)];
    const ctr = [-0.262, 0.885, -0.060];
    const foot = v3.sub(ctr, v3.mul(d, QUIVER.length / 2));
    const [X, Y, Z] = basisY(d, [0, 0, 1]);
    const g = place(quiverGeo(), X, Y, Z, foot);
    pieces.push({ g, joint: 'pelvis', bit: PIECE.quiver });
    const mouth = v3.add(foot, v3.mul(d, QUIVER.length + QUIVER.arrowOut * 0.6));
    stowInfo.quiver = { foot, mouth, nocks: mouth, joint: 'pelvis' };
  }
  // bracer: left forearm, dorsal
  {
    const g = place(bracerGeo(forearm.r + 0.005, 0.17), forearm.X, forearm.Y, forearm.Z, forearm.at);
    pieces.push({ g, joint: 'lowerarm_l', bit: PIECE.bracer });
    stowInfo.bracer = { at: forearm.at, r: forearm.r, joint: 'lowerarm_l' };
  }
  // alidade: at the cord's end, across the sternum
  {
    const at = CHAINS.alidadeCord.points[2];
    const g = place(alidadeGeo(), [1, 0, 0], [0, 1, 0], [0, 0, 1], [at[0], at[1] - 0.006, at[2] + 0.004]);
    pieces.push({ g, joint: 'dyn_alidadeCord_02', bit: PIECE.alidade });
    stowInfo.alidade = { at, joint: 'dyn_alidadeCord_02' };
    /* fix round 4 (judge r1, V23 "no cord is visible"): THE NECK CORD itself,
     * a 4.4 mm cream cord (the `string` swatch, against the orchil smock): a
     * loop round the neck — behind it at the nape, round both sides, down
     * the front over the collarbones to the sternal notch (the cord chain's
     * root) — skinned to neck_01 / spine_03, and the hanging strand from the
     * notch down to the top of the tube, blended dyn_alidadeCord_01 ->
     * dyn_alidadeCord_02 along its length (so the raise, which carries the
     * tube's bone to her eye, draws the strand taut from the notch instead of
     * tearing it). Points in bind space, each >= 8 mm off the measured neck /
     * smock surface (neck front z 0.002-0.013 at y 1.49, back -0.109 at 1.51,
     * half-width ~0.07; smock front 0.046-0.058 at y 1.42-1.45). */
    const R = CHAINS.alidadeCord.points[0], M = CHAINS.alidadeCord.points[1];
    const top = [at[0], at[1] - 0.006 + 0.0095, at[2] + 0.004];
    const loop = [[0, 1.517, -0.121], [0.060, 1.512, -0.098], [0.080, 1.503, -0.042], [0.062, 1.490, 0.012], [0.030, 1.470, 0.052], R,
      [-0.030, 1.470, 0.052], [-0.062, 1.490, 0.012], [-0.080, 1.503, -0.042], [-0.060, 1.512, -0.098], [0, 1.517, -0.121]];
    // the loop: neck_01 round the back and sides, easing to spine_03 at the notch
    const loopSkin = loop.map((q) => { const w = Math.max(0, Math.min(1, (1.500 - q[1]) / 0.045)); return [['neck_01', 1 - w], ['spine_03', w]]; });
    // (4-sided, one ring per point: 112 tris for the whole cord — A-hero-draws' 20 k cap, R38)
    pieces.push({ ...cordGeo(loop, loopSkin, CORD_R, true, 1, 4), bit: PIECE.alidade });
    const hang = [R, M, top];
    const hangSkin = [[['dyn_alidadeCord_01', 1]], [['dyn_alidadeCord_01', 0.5], ['dyn_alidadeCord_02', 0.5]], [['dyn_alidadeCord_02', 1]]];
    pieces.push({ ...cordGeo(hang, hangSkin, CORD_R, false, 2, 4), bit: PIECE.alidade });
    stowInfo.alidadeCord = { loop: loop.length, hang: hang.length, r: CORD_R };
  }
  const all = G();
  const jnt = [], wgt = [], pid = [];
  for (const p of pieces) {
    merge(all, p.g);
    if (p.skin) {
      // fix round 4: a blended piece (the neck cord): up to two joints per vertex
      for (const sk of p.skin) {
        const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
        sk.forEach(([name, wt], k) => { j[k] = jointIndex(doc, name); w[k] = wt; });
        const sum = w[0] + w[1] + w[2] + w[3] || 1;
        jnt.push(...j); wgt.push(w[0] / sum, w[1] / sum, w[2] / sum, w[3] / sum); pid.push(p.bit);
      }
      continue;
    }
    const j = jointIndex(doc, p.joint);
    for (let i = 0; i < p.g.pos.length / 3; i++) { jnt.push(j, 0, 0, 0); wgt.push(1, 0, 0, 0); pid.push(p.bit); }
  }
  const buf = doc.getRoot().listBuffers()[0];
  const mat = kitMaterial(doc, atlas);
  const prim = toPrim(doc, buf, all, mat, {
    JOINTS_0: ['VEC4', new Uint16Array(jnt)], WEIGHTS_0: ['VEC4', new Float32Array(wgt)], _PIECE: ['SCALAR', new Uint8Array(pid)],
  });
  const node = doc.createNode('StowKit_v0').setMesh(doc.createMesh('StowKit_v0').addPrimitive(prim)).setSkin(doc.getRoot().listSkins()[0]);
  nodeByName(doc, 'Armature').addChild(node);
  for (const m of doc.getRoot().listMaterials()) if (m !== mat) m.dispose();
  for (const t of doc.getRoot().listTextures()) if (!t.listParents().some((p) => p.propertyType === 'Material')) t.dispose();
  let yMin = 1e9, yMax = -1e9;
  for (const q of surf.slice(0, bodyPrim.getAttribute('POSITION').getCount())) { yMin = Math.min(yMin, q[1]); yMax = Math.max(yMax, q[1]); }
  const S = BODY_HEIGHT / (yMax - yMin);   // raw -> game metres, as brea.mjs (body soles to crown)
  res.stowkit = await writeSkinned(doc, path.join(out, `${DIR}/stowkit-v0.glb`), {
    provenance: { recipe: RECIPE, sources: ['ubc-standard', 'brea-generated'], licence: 'project-original' },
    extras: { r5StowKit: { pieces: PIECE, stow: stowInfo, rawToGame: +S.toFixed(6), quiverNocksGame: stowInfo.quiver.nocks.map((v) => +(v * S).toFixed(4)) } },
  });
  void jointPos;
  return res;
}

/** The left forearm in bind space: frame (X elbow->wrist, Y dorsal), start point and radius. */
function forearmFrame(doc, bodyPrim) {
  const a = jointPos(doc, 'lowerarm_l'), b = jointPos(doc, 'hand_l');
  const X = v3.norm(v3.sub(b, a));
  const Y0 = [0, 1, 0];
  const Z = v3.norm(v3.cross(X, Y0));
  const Y = v3.cross(Z, X);
  const P = bodyPrim.getAttribute('POSITION'), p = [0, 0, 0];
  let r = 0, n = 0;
  for (let i = 0; i < P.getCount(); i++) {
    P.getElement(i, p);
    const rel = v3.sub(p, a);
    const t = v3.dot(rel, X);
    if (t < 0.06 || t > 0.20) continue;
    const perp = v3.sub(rel, v3.mul(X, t));
    const d = Math.hypot(...perp);
    if (d < 0.08) { r += d; n++; }
  }
  r = n ? r / n : 0.035;
  return { X, Y, Z, at: v3.add(a, v3.mul(X, 0.045)), r: +r.toFixed(4) };
}
