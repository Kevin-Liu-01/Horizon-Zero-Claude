#!/usr/bin/env node
/**
 * CALIMA — the SCREED generator (instruments; BIBLE §7.4 #9; M2 wave 2 "the look"). Original work: no third-party
 * asset is read. Built from the shared hull kit (`parts/kit.mjs`) and the plated shell (`parts/shell.mjs`).
 *
 *   node tools/build/instruments/gen-screed.mjs [--out <dir>]
 *     -> public/models/instruments/screed.glb   (hull, the cab vial's glass, LOD1 caster)
 *
 * THE SCREED (large, 6.5 x 3.6 x 3.8 m; role `heavy` from its behaviour wave). A walking road-grader in the shared
 * language (owner question Q3's default: only its cab mast has a drawing, the board's survey-tripod mast with a disc
 * platform; the body is drawn fresh), on the grey silhouette of wave 1:
 *   - a WIDE PLATED HULL lofted on boxy rounded sections (2.7 m wide, 0.9-2.2 m): white enamel plates over gunmetal
 *     seams, brass rivets and hoops, the serial "09" in brass numerals; a riveted enamel SPOIL HOPPER on its back;
 *   - SIX SHORT HEAVY LEGS (gunmetal thighs under enamel greaves, brass knee hubs, enamel shins, broad disc feet);
 *   - in front the 3.6 m MOLDBOARD: a curved bronze face on a gunmetal ribbed back with riveted enamel end plates and
 *     a satin steel cutting edge, carried on a gunmetal push frame and TWO HYDRAULIC RAMS (gunmetal barrels, satin
 *     rods); the RAM SEALS are dark rubber collars between brass rings near each ram's root (the weak points);
 *   - behind, the RIPPER: a gunmetal beam with three tines tipped in brass;
 *   - the CAB MAST: an enamel column with brass bands and four gunmetal stays, ONE LAMP (a kit lamp drum on the
 *     column's face, the iris drawn by the lamp system), the DISC PLATFORM (an enamel disc with a graduated brass limb
 *     ring, a pale-ice level vial across it), two faded orchil BANNERS from its rim, and a spike finial to 3.80 m.
 * No head, no neck, no eye, no animal part: the fight panel's red single eye and its animal body are never built.
 *
 * Bones (rig-ready for the behaviour wave): pelvis (rear hull, hopper), chest (fore hull, mast, lamp), neck (the push
 * frame and the rams' roots), head (the moldboard: its wind-up raises it to 2.6 m), tail1 (the ripper) + 6 legs x 3.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V, strut, ball, rbox, plate, lathe, basis, at, cable } from '../lib/hs.mjs';
import {
  THREE, C, KBucket, mergeLabelled, finish, writeInstrument, solveKnee, lod1From, numeralUV,
  resetKitStats, rivet, rivetRing, lampDrum, antenna, levelVial, limbRing, banner, gyroRing,
} from './parts/kit.mjs';
import { loftShell, surveyLeg, skirtPlate } from './parts/shell.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const LANE = 'instruments';
export const RECIPE = 'tools/build/instruments/gen-screed.mjs';
export const OUTPUTS = ['public/models/instruments/screed.glb'];

const BANNER_PALE = 0xa392ab;
const ENAMEL_LOW = 0xd8cdb8;

export const SCREED = Object.freeze({
  sections: [
    { z: -2.75, w: 1.0, yb: 1.12, ym: 1.55, yt: 1.95, n: 3.4 },
    { z: -2.45, w: 1.3, yb: 0.96, ym: 1.55, yt: 2.13, n: 4 },
    { z: -0.6, w: 1.36, yb: 0.92, ym: 1.55, yt: 2.22, n: 4.2 },
    { z: 1.2, w: 1.3, yb: 0.96, ym: 1.55, yt: 2.14, n: 4 },
    { z: 1.5, w: 1.04, yb: 1.12, ym: 1.55, yt: 1.95, n: 3.4 },
  ],
  split: -0.55,
  hopper: { z: -1.35, w: 1.9, l: 1.8, h: 0.5 },
  blade: { z: 2.95, w: 3.48, y0: 0.3, y1: 1.4, curve: 0.2, t: 0.08 },
  ramX: 0.95, ramRoot: [1.35, 1.42], ramEnd: [2.76, 1.0], ramR: 0.12, sealAt: 0.18,
  ripper: { z: -2.93, y: 1.05, tines: [-0.55, 0, 0.55] },
  mastZ: 0.55, mastR: 0.14, mast0: 2.15, disc: 3.5, discR: 0.58, lampY: 3.18, lampR: 0.17, lampDepth: 0.2,
  hipX: 1.26, hipY: 1.08, footX: 1.5, footY: 0.16, rows: [1.0, -0.7, -2.4], thigh: 0.6, shin: 0.78, pad: 0.24,
  top: 3.80,
});

export async function build({ out = ROOT, file = null, preview = false } = {}) {
  resetKitStats();
  const S = SCREED;
  const P = (r, h, surf, tone) => ({ r, h, surf, tone });
  const hull = new Map(), glass = new Map();
  const H = (b) => { if (!hull.has(b)) hull.set(b, new KBucket(`hull:${b}`)); return hull.get(b); };
  const GL = (b) => { if (!glass.has(b)) glass.set(b, new KBucket(`glass:${b}`)); return glass.get(b); };

  /* ------------------------------- the hull ------------------------------------ */
  const so = {
    seamsU: [0.07, 0.19, 0.31, 0.42, 0.58, 0.69, 0.81, 0.93], seamsZ: [-1.9, S.split, 0.5], rivetEvery: 0.3, uSteps: 48, zStep: 0.2,
    plateTone: (u0, u1) => ((u0 >= 0.31 && u1 <= 0.69) ? ENAMEL_LOW : C.ENAMEL),
  };
  const skin = loftShell(H('pelvis'), S.sections, { ...so, zMax: S.split, caps: [true, false] });
  loftShell(H('chest'), S.sections, { ...so, zMin: S.split, caps: [false, true] });
  // brass hoops over the cross seams, and a brass strake along each flank
  for (const [z, bone] of [[-1.9, 'pelvis'], [0.5, 'chest']]) {
    const pts = [];
    for (let k = 0; k <= 18; k++) { const u = 0.27 + (0.46 * k) / 18, q = skin.at((u + 0.5) % 1, z); pts.push(q.p.clone().addScaledVector(q.n, 0.014)); }
    cable(H(bone), pts, 0.028, { surf: 'bronze', tone: C.BRASS, segs: 36, radial: 6, wear: 0.6 });
  }
  for (const s of [1, -1]) for (const [bone, za, zb] of [['pelvis', -2.6, S.split - 0.03], ['chest', S.split + 0.03, 1.38]]) {
    const pts = [];
    for (let k = 0; k <= 12; k++) { const z = za + (zb - za) * k / 12, q = skin.at(s > 0 ? 0.25 : 0.75, z); pts.push(q.p.clone().addScaledVector(q.n, 0.014)); }
    cable(H(bone), pts, 0.03, { surf: 'bronze', tone: C.BRASS, segs: 24, radial: 6, wear: 0.6 });
  }
  rbox(H('pelvis'), V(0, 0.9, -1.6), [0.5, 0.08, 2.0], 0.02, { surf: 'graphite', tone: C.GUNMETAL, wear: 0.2 });
  rbox(H('chest'), V(0, 0.9, 0.45), [0.5, 0.08, 1.8], 0.02, { surf: 'graphite', tone: C.GUNMETAL, wear: 0.2 });
  // the serial "09" on each fore flank
  for (const s of [1, -1]) {
    const q = skin.at(s > 0 ? 0.2 : 0.8, 0.9), n = q.n.clone().setY(0).normalize();
    for (const [j, dgt] of [[0, 0], [1, 9]]) {
      const c = q.p.clone().addScaledVector(n, 0.008).add(V(0, 0, (j - 0.5) * 0.13 * s));
      const Mp = basis(V(0, 0, s), V(0, 1, 0), n.clone(), c);
      const mk = H('chest').mark();
      plate(H('chest'), [[-0.055, -0.078], [0.055, -0.078], [0.055, 0.078], [-0.055, 0.078]], 0.008, 0, Mp, { surf: 'bronze', tone: C.STAFF, wear: 0.1 });
      H('chest').decalSince(mk, { frame: Mp, fn: (p) => numeralUV(dgt, (p.x + 0.055) / 0.11, 1 - (p.y + 0.078) / 0.156) });
    }
  }

  /* ------------------------------- the spoil hopper ---------------------------- */
  {
    const hp = S.hopper, top = skin.at(0, hp.z).p.y - 0.06;
    const c = V(0, top + hp.h / 2, hp.z);
    // four sloping enamel walls (wider at the top), a brass rim, rivets
    for (const [ax, sgn] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
      const half = ax === 'x' ? hp.l / 2 : hp.w / 2, off = ax === 'x' ? hp.w / 2 : hp.l / 2;
      const nrm = ax === 'x' ? V(sgn, 0.22, 0).normalize() : V(0, 0.22, sgn).normalize();
      const right = ax === 'x' ? V(0, 0, -sgn) : V(sgn, 0, 0);
      const up = new THREE.Vector3().crossVectors(nrm, right).normalize().negate();
      const M = basis(right, up, nrm, c.clone().add(ax === 'x' ? V(sgn * (off - 0.03), 0, 0) : V(0, 0, sgn * (off - 0.03))));
      skirtPlate(H('pelvis'), [[-half + 0.06, -hp.h / 2], [half - 0.06, -hp.h / 2], [half, hp.h / 2], [-half, hp.h / 2]], M, { d: 0.035, foot: false, every: 0.3, rows: 1, tone: C.ENAMEL });
    }
    const y1 = top + hp.h + 0.005;
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
      strut(H('pelvis'), V(a[0] * (hp.w / 2 + 0.06), y1, hp.z + a[1] * (hp.l / 2 + 0.06)), V(b[0] * (hp.w / 2 + 0.06), y1, hp.z + b[1] * (hp.l / 2 + 0.06)), 0.03, 0.03, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.6 });
    }
    // the spoil inside (dark crushed rock)
    rbox(H('pelvis'), V(0, top + hp.h * 0.72, hp.z), [hp.w - 0.1, 0.06, hp.l - 0.1], 0.03, { surf: 'bisque', tone: 0x3b3533, wear: 0.8 });
  }

  /* ------------------------------- the push frame, rams and moldboard ----------- */
  const B = S.blade;
  // the push frame (neck): an A-frame from the belly to the blade's back
  const PF0 = V(0, 0.98, 0.9), PF1 = V(0, 0.75, B.z - 0.18);
  for (const s of [1, -1]) strut(H('neck'), V(s * 0.55, 0.98, 1.05), V(s * 0.25, 0.75, B.z - 0.2), 0.07, 0.065, { surf: 'graphite', tone: C.GUNMETAL, sides: 10 });
  strut(H('neck'), PF0, PF1, 0.08, 0.075, { surf: 'graphite', tone: C.GUNMETAL, sides: 10 });
  ball(H('neck'), PF0, 0.12, { surf: 'bronze', tone: C.BRASS, w: 14, h: 10, wear: 0.6 });
  const SEALS = [];
  for (const s of [1, -1]) {
    const a = V(s * S.ramX, S.ramRoot[1], S.ramRoot[0]), e = V(s * S.ramX * 0.92, S.ramEnd[1], S.ramEnd[0]);
    // the barrel (neck, at the root) and the rod (head, into the blade)
    const mid = a.clone().lerp(e, 0.55);
    strut(H('neck'), a, mid, S.ramR, S.ramR, { surf: 'graphite', tone: C.GUNMETAL, sides: 14 });
    strut(H('head'), mid.clone().lerp(a, 0.05), e, S.ramR * 0.45, S.ramR * 0.45, { surf: 'chrome', tone: C.CHROME, sides: 10 });
    // its root clevis on the hull front
    rbox(H('chest'), a.clone().add(V(0, 0, -0.1)), [0.3, 0.3, 0.2], 0.03, { surf: 'bronze', tone: C.BRASS, wear: 0.6 });
    // the SEAL: a dark rubber collar between two brass rings, near the barrel's root
    const dz = e.clone().sub(a).normalize(), sc = a.clone().lerp(mid, S.sealAt + 0.25);
    strut(H('neck'), sc.clone().addScaledVector(dz, -0.06), sc.clone().addScaledVector(dz, 0.06), S.ramR * 1.38, S.ramR * 1.38, { surf: 'rubber', tone: 0x2a2120, sides: 16 });
    for (const f of [-0.075, 0.075]) strut(H('neck'), sc.clone().addScaledVector(dz, f - 0.015), sc.clone().addScaledVector(dz, f + 0.015), S.ramR * 1.5, S.ramR * 1.5, { surf: 'bronze', tone: C.BRASS, sides: 16, wear: 0.6 });
    rivetRing(H('neck'), sc.clone().addScaledVector(dz, 0.09), dz, S.ramR * 1.5, 8, 0.01, { radial: true });
    // the barrel's gland at its mouth
    strut(H('neck'), mid.clone().addScaledVector(dz, -0.05), mid, S.ramR * 1.12, S.ramR * 1.12, { surf: 'bronze', tone: C.BRASS, sides: 14, wear: 0.6 });
    SEALS.push(sc);
  }
  // the moldboard (head): a curved sheet, concave forward, top rolled toward the front
  {
    const nx = 22, ny = 8, pos = [], nor = [];
    const pt = (u, v) => {   // u 0..1 across, v 0..1 up the face
      const x = (u - 0.5) * B.w, y = B.y0 + (B.y1 - B.y0) * v;
      const z = B.z + B.curve * (Math.sin(v * Math.PI * 0.5) ** 2) * 1.2 - B.curve * 0.35 * (1 - v);
      return V(x, y, z);
    };
    const nrm = (u, v) => {
      const a = pt(u + 1e-3, v).sub(pt(u - 1e-3, v)), b = pt(u, v + 1e-3).sub(pt(u, v - 1e-3));
      return new THREE.Vector3().crossVectors(a, b).normalize();   // toward +z (forward)
    };
    const face = (sign, off, surf, tone, v0 = 0, v1 = 1, u0 = 0, u1 = 1) => {
      const ps = [], ns = [];
      const nyy = Math.max(1, Math.round(ny * (v1 - v0))), nxx = Math.max(1, Math.round(nx * (u1 - u0)));
      for (let j = 0; j < nyy; j++) for (let i = 0; i < nxx; i++) {
        const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => { const u = u0 + (u1 - u0) * a / nxx, v = v0 + (v1 - v0) * b / nyy, n = nrm(u, v); return { p: pt(u, v).addScaledVector(n, off), n: n.clone().multiplyScalar(sign) }; });
        const tri = sign > 0 ? [q[0], q[1], q[2], q[0], q[2], q[3]] : [q[0], q[2], q[1], q[0], q[3], q[2]];
        for (const t of tri) { ps.push(t.p.x, t.p.y, t.p.z); ns.push(t.n.x, t.n.y, t.n.z); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(ns, 3));
      H('head').add(g, { surf, tone, wear: 0.6 });
      g.dispose();
    };
    // the face: three riveted white-enamel plates (gunmetal seams between them) over a worn bronze wear strip
    face(1, -0.004, 'graphite', C.GUNMETAL, 0.27, 1);
    for (const [u0, u1, t] of [[0, 0.327, C.ENAMEL], [0.337, 0.663, ENAMEL_LOW], [0.673, 1, C.ENAMEL]]) face(1, 0.006, 'glaze', t, 0.27, 1, u0, u1);
    face(1, 0.004, 'bronze', 0xa98448, 0, 0.27);
    face(-1, -B.t, 'graphite', C.GUNMETAL);      // the back
    // the ribs on the back, the top roll, the cutting edge, the enamel end plates
    for (let k = 0; k <= 6; k++) {
      const u = k / 6, pts = [];
      for (let j = 0; j <= 8; j++) pts.push(pt(u, j / 8).add(V(0, 0, -B.t - 0.06)));
      cable(H('head'), pts, 0.045, { surf: 'graphite', tone: C.GUNMETAL, segs: 10, radial: 5 });
    }
    const topPts = [], edgePts = [];
    for (let i = 0; i <= nx; i++) { topPts.push(pt(i / nx, 1).add(V(0, 0.02, -0.02))); edgePts.push(pt(i / nx, 0).add(V(0, 0.03, 0.02))); }
    cable(H('head'), topPts, 0.055, { surf: 'bronze', tone: C.BRASS, segs: 30, radial: 8, wear: 0.6 });
    cable(H('head'), edgePts, 0.04, { surf: 'chrome', tone: C.CHROME, segs: 30, radial: 6 });
    for (const s of [1, -1]) {
      const c = pt(s > 0 ? 1 : 0, 0.5).add(V(s * 0.02, 0, -B.t / 2));
      const M = basis(V(0, 0, -s), V(0, 1, 0), V(s, 0, 0), c);
      skirtPlate(H('head'), [[-0.34, -0.55], [0.2, -0.55], [0.3, 0.3], [0.1, 0.58], [-0.34, 0.58]], M, { d: 0.04, foot: false, every: 0.18, rows: 2 });
    }
    // rivets in rows across the face (the bolts that hold the wear plates)
    for (const v of [0.22, 0.78]) for (let k = 1; k < 12; k++) { const u = k / 12, n = nrm(u, v); rivet(H('head'), pt(u, v).addScaledVector(n, 0.004), n, 0.012); }
  }

  /* ------------------------------- the ripper ----------------------------------- */
  {
    const R = S.ripper, back = skin.at(0.5, -2.7).p;
    const beam0 = V(-0.85, R.y, R.z), beam1 = V(0.85, R.y, R.z);
    strut(H('tail1'), beam0, beam1, 0.1, 0.1, { surf: 'graphite', tone: C.GUNMETAL, sides: 10 });
    for (const s of [1, -1]) strut(H('tail1'), V(s * 0.6, R.y, R.z), V(s * 0.7, 1.25, -2.62), 0.07, 0.065, { surf: 'graphite', tone: C.GUNMETAL, sides: 10 });
    for (const x of R.tines) {
      const t0 = V(x, R.y, R.z), t1 = V(x, 0.5, R.z - 0.22), t2 = V(x, 0.24, R.z - 0.1);
      cable(H('tail1'), [t0, t0.clone().lerp(t1, 0.5).add(V(0, 0, -0.04)), t1, t2], 0.055, { surf: 'graphite', tone: C.GUNMETAL, segs: 10, radial: 8 });
      strut(H('tail1'), t2.clone().add(V(0, 0.08, -0.03)), V(x, 0.12, R.z - 0.02), 0.05, 0.01, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.7 });
      rbox(H('tail1'), V(x, R.y, R.z), [0.16, 0.24, 0.24], 0.02, { surf: 'bronze', tone: C.BRASS, wear: 0.6 });
    }
    void back;
  }

  /* ------------------------------- the cab mast, lamp, disc ---------------------- */
  const MZ = S.mastZ, M0 = V(0, S.mast0, MZ), M1 = V(0, S.disc - 0.03, MZ);
  lathe(H('chest'), [P(0, 0, 'bronze', C.BRASS), P(0.32, 0, 'bronze', C.BRASS), P(0.3, 0.06, 'bronze', C.BRASS), P(0.2, 0.12, 'bronze', C.BRASS), P(S.mastR * 1.15, 0.2, 'bronze', C.BRASS)], at(M0.x, M0.y - 0.05, M0.z), { segs: 24, wear: 0.6 });
  rivetRing(H('chest'), M0.clone().add(V(0, 0.0, 0)), V(0, 1, 0), 0.27, 10, 0.011, { radial: true });
  strut(H('chest'), M0, M1, S.mastR, S.mastR * 0.9, { surf: 'glaze', tone: C.ENAMEL, sides: 16, wear: 0.35 });
  for (const f of [0.18, 0.55, 0.9]) {
    const c = M0.clone().lerp(M1, f);
    strut(H('chest'), c.clone().add(V(0, -0.02, 0)), c.clone().add(V(0, 0.02, 0)), S.mastR * 1.12, S.mastR * 1.12, { surf: 'bronze', tone: C.BRASS, sides: 16, wear: 0.6 });
  }
  // four stays from the crown to the column
  for (const [x, z] of [[0.75, MZ + 0.7], [-0.75, MZ + 0.7], [0.75, MZ - 0.7], [-0.75, MZ - 0.7]]) {
    const foot = skin.at(Math.atan2(x, 0.6) / (Math.PI * 2) + (x < 0 ? 1 : 0), z).p;
    strut(H('chest'), foot.clone().add(V(0, 0.01, 0)), V(Math.sign(x) * S.mastR * 0.9, 2.95, MZ + Math.sign(z - MZ) * S.mastR * 0.9), 0.022, 0.018, { surf: 'graphite', tone: C.GUNMETAL, sides: 6 });
    ball(H('chest'), foot, 0.04, { surf: 'bronze', tone: C.BRASS, w: 8, h: 6 });
  }
  // the ONE lamp: a kit lamp drum on the column's face, on a brass saddle
  const LB = V(0, S.lampY, MZ + S.mastR * 0.75);
  rbox(H('chest'), V(0, S.lampY, MZ + S.mastR * 0.6), [0.3, 0.36, 0.16], 0.02, { surf: 'bronze', tone: C.BRASS, wear: 0.6 });
  const dr = lampDrum(H('chest'), LB, V(0, 0, 1), { r: S.lampR, depth: S.lampDepth, ticks: 16 });
  plate(H('chest'), [[-0.2, 0], [0.2, 0], [0.15, 0.09], [-0.15, 0.09]], 0.014, 0.004,
    basis(V(-1, 0, 0), V(0, 0.25, 1).normalize(), V(0, 1, -0.25).normalize(), V(0, S.lampY + S.lampR * 1.04, LB.z + S.lampDepth - 0.07)), { surf: 'glaze', tone: C.ENAMEL, wear: 0.4 });
  // the disc platform: an enamel disc with a brass rim, a graduated limb ring on it, a vial across it
  const DY = S.disc;
  lathe(H('chest'), [P(0, -0.04, 'graphite', C.GUNMETAL), P(S.discR * 0.92, -0.04, 'graphite', C.GUNMETAL), P(S.discR, -0.02, 'bronze', C.BRASS), P(S.discR, 0.02, 'bronze', C.BRASS),
    P(S.discR * 0.97, 0.03, 'glaze', C.ENAMEL), P(0, 0.035, 'glaze', C.ENAMEL)], at(0, DY, MZ), { segs: 40, wear: 0.4, crease: 30 });
  rivetRing(H('chest'), V(0, DY, MZ), V(0, 1, 0), S.discR + 0.002, 20, 0.011, { radial: true });
  limbRing(H('chest'), at(0, DY + 0.045, MZ), S.discR * 0.5, S.discR * 0.82, 0.02, { ticks: 24, faceSurf: 'bronze', faceTone: C.BRASS });
  // the disc's under-brackets
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    strut(H('chest'), V(Math.sin(a) * S.mastR, DY - 0.3, MZ + Math.cos(a) * S.mastR), V(Math.sin(a) * S.discR * 0.85, DY - 0.04, MZ + Math.cos(a) * S.discR * 0.85), 0.018, 0.016, { surf: 'graphite', tone: C.GUNMETAL, sides: 6 });
  }
  const VC = V(0, DY + 0.12, MZ);
  const vial = levelVial(H('chest'), GL('chest'), VC, V(1, 0, 0), { len: 0.4, r: 0.055 });
  for (const s of [1, -1]) strut(H('chest'), V(s * 0.14, DY + 0.035, MZ), V(s * 0.1, VC.y - 0.04, MZ), 0.016, 0.014, { surf: 'bronze', tone: C.BRASS, sides: 6 });
  gyroRing(H('chest'), VC.clone().add(V(0, 0.03, 0)), V(0, Math.cos(0.4), Math.sin(0.4)), 0.24, 0.014, { pivot: V(1, 0, 0), radial: 40 });
  // the finial to 3.80 m, the two banners from the rim
  antenna(H('chest'), V(0, DY + 0.035, MZ - 0.32), V(0, S.top, MZ - 0.32), { r: 0.016, finial: 0.12, cross: 0.07 });
  for (const s of [1, -1]) banner(H('chest'), V(s * S.discR * 0.98, DY - 0.03, MZ - 0.1), V(0, 0, -1), { w: 0.3, h: 0.62, out: V(s, 0, 0), tone: BANNER_PALE, hem: C.STAFF });

  /* ------------------------------- the legs -------------------------------------- */
  const LEGS = [];
  for (const [row, z, hinge, parent] of [['F', S.rows[0], 1, 'chest'], ['M', S.rows[1], -1, 'pelvis'], ['H', S.rows[2], -1, 'pelvis']]) {
    for (const s of [1, -1]) {
      const id = (s > 0 ? 'R' : 'L') + row;
      const hip = V(s * S.hipX, S.hipY, z), ankle = V(s * S.footX, S.footY, z + (row === 'F' ? 0.2 : row === 'H' ? -0.2 : 0));
      const knee = solveKnee(hip, ankle, hinge, S.thigh, S.shin);
      const toe = ankle.clone().add(V(s * 0.03, -0.14, 0.14));
      LEGS.push({ id, parent, hinge, hip, knee, ankle, toe, s, zs: Math.sign(z) || 1 });
    }
  }
  for (const Lg of LEGS) surveyLeg(H, Lg, { thighR: 0.13, shinR: 0.1, shin: 'enamel', pad: S.pad, boss: Lg.parent, padSegs: 20 });

  /* ------------------------------- recentre, rig, write -------------------------- */
  const all = [...hull.values(), ...glass.values()];
  const box = new THREE.Box3();
  for (const b of all) b.bounds(box);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, y0 = box.min.y;
  for (const b of all) b.translate(-cx, -y0, -cz);
  const shf = (v) => [+(v.x - cx).toFixed(4), +(v.y - y0).toFixed(4), +(v.z - cz).toFixed(4)];
  const size = box.getSize(new THREE.Vector3());
  const rigSpec = {
    spine: [
      { name: 'pelvis', pos: shf(V(0, 1.55, -1.6)), r: 1.4 },
      { name: 'chest', pos: shf(V(0, 1.55, S.split)), r: 1.4 },
      { name: 'neck', pos: shf(PF0), r: 0.5 },
      { name: 'head', pos: shf(V(0, 0.85, B.z)), r: 0.6, tip: shf(V(0, 0.85, B.z + 0.4)) },
    ],
    tail: [{ name: 'tail1', pos: shf(V(0, S.ripper.y, -2.75)), r: 0.5 }],
    legGateY: +(S.hipY + 0.4 - y0).toFixed(4),
    legInboard: 0.6,
    legs: LEGS.map((Lg) => ({ id: Lg.id, parent: Lg.parent, hinge: Lg.hinge, hip: shf(Lg.hip), knee: shf(Lg.knee), ankle: shf(Lg.ankle), toe: shf(Lg.toe), r: 0.34, restFoot: [shf(Lg.ankle)[0], shf(Lg.ankle)[2]] })),
  };
  const BONE_ORDER = [...rigSpec.spine.map((s) => s.name), ...rigSpec.tail.map((s) => s.name), ...rigSpec.legs.flatMap((l) => [`${l.id}_thigh`, `${l.id}_shin`, `${l.id}_foot`])];
  const sockets = {
    lamp: shf(dr.face), lampR: +dr.radius.toFixed(4),
    seals: SEALS.map(shf), sealR: +(S.ramR * 1.5).toFixed(4),
    blade: shf(V(0, (B.y0 + B.y1) / 2, B.z)), bladeW: B.w, bladeTop: +(B.y1 - y0).toFixed(4),
    disc: shf(V(0, DY, MZ)), vial: shf(VC), vialLen: vial.len, vialR: vial.r,
    top: +size.y.toFixed(4),
    shift: [+(-cx).toFixed(4), +(-y0).toFixed(4), +(-cz).toFixed(4)],
  };
  const hullAll = mergeLabelled(hull, BONE_ORDER, 'screed-hull');
  const glassAll = mergeLabelled(glass, BONE_ORDER, 'screed-vial');
  const fin = finish(hullAll, { occluders: [glassAll], rays: 28, dist: 0.5, footBand: 0.6, lamps: [], verdigris: 0.3 });
  const lod1 = await lod1From(hullAll, 0.28, 'screed-lod1');
  const ICE = new THREE.Color(C.ICE);
  const target = file || path.join(out, OUTPUTS[0]);
  const stats = await writeInstrument([
    { bucket: hullAll, role: 'hull', material: { name: 'r5-screed-hull' } },
    { bucket: glassAll, role: 'sensor', material: { name: 'r5-screed-vial-glass', emissive: [ICE.r, ICE.g, ICE.b], baseColor: [0.07, 0.11, 0.12, 1] } },
    { bucket: lod1, role: 'lod1', material: { name: 'r5-screed-hull' } },
  ], {
    file: target,
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Rig: rigSpec, r5BoneOrder: BONE_ORDER,
      r5Size: [+size.x.toFixed(4), +size.y.toFixed(4), +size.z.toFixed(4)],
      r5Sockets: sockets,
      r5Generator: { name: RECIPE, design: 'screed', kit: 'M1.4a', licence: 'original work (generated), no third-party assets' },
    },
  });
  const res = {
    kind: 'screed', file: path.relative(out, target), bytes: stats.bytes, tris: stats.tris, meshTris: stats.meshTris, verts: stats.verts,
    materials: stats.materials, textures: stats.textures, bones: BONE_ORDER.length, legs: LEGS.length, aoMean: +fin.aoMean.toFixed(3),
    size: { x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3) },
  };
  if (preview) res._buckets = { hull: [hullAll], glass: [glassAll], lamps: [{ at: sockets.lamp, r: dr.radius }], size };
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  console.log(JSON.stringify(await build({ out: i >= 0 ? path.resolve(process.argv[i + 1]) : ROOT })));
}
