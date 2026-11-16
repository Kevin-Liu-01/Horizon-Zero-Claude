/**
 * CALIMA — recipe: rung 2, SCOUT · Guild Whites (BIBLE §8.4 the armour ladder: "layered violet-and-linen vest, one-side
 * shoulder guard, patterned leg wraps, long panel skirt, woven palm hat"; BUILD M1.6l). The reward of "Raker's Morning".
 *
 * "Each rung is cut to be fitted over the one below it" (BIBLE §8.4): this file holds ONLY the Scout's own pieces, built
 * over the Starter as the Starter ships (outfit-pan-1.mjs `panBase()` and the same range-of-motion fit), and
 * src/hero/outfit.js binds the Starter's set first and these pieces over it (`r5Outfit.over`). So the Scout is one family
 * with the Starter by construction: the fitted violet top, the crossed harness, the scarf, gloves, bracers, belts, the
 * long embroidered sash panels (the long panel skirt, on the Starter's cloth chains, so the grid solver behind
 * `?cloth=2` takes them on this rung exactly as on rung 1), the trousers and boots. Its pieces, all on the Starter's
 * painted sheet (`sharedAtlas`, no texture of its own):
 *
 *   vest     a fitted linen vest laid over the violet top (cream over violet), open in a deep V at the front so the top
 *            and the harness's cross show, bound in the top's violet; it lies UNDER the harness (2.8 mm over the top;
 *            the straps ride >= 4.5 mm over it), its hem at the girdle's top
 *   guard    a leather shoulder guard on her LEFT shoulder only (the bow arm), three lapped lames from over the point of
 *            the shoulder to above the arm band, in the pouch leather with its stitched border, edged dark
 *   legwrap  the patterned leg wraps: a cream linen strip wound over the Starter's violet shin wraps at twice their
 *            pitch, so each shin reads cream and violet in turn
 *   hat      the woven palm hat, wide brim and a rounded crown with a violet band, the crown fitted to her head wrap
 *            (read off brea.glb's own wrap: the knot and the bunched folds sit inside it, the tail leaves under the
 *            brim). On her head at rest, on her back the moment a weapon is out (loadout.js `update`): three copies,
 *            `_PIECE` 32 on her head, 64 on her back over the stowed bow, 128 on her back close in
 *
 * Budgets: the file <= 0.15 MB (A-armory-budget); with the Starter under it Brea stays inside TECH §9.2 (<= 60 k
 * triangles, <= 6 draws: this rung adds one draw).
 */
import path from 'node:path';
import { panBase, panLayout, PAN_FIT } from '../outfit-pan-1.mjs';
import { outfitDoc, writeOutfit } from './lib/output.mjs';
import { emptyPart, Field, V, mix, sstep, recomputeNormals } from './lib/part.mjs';
import { romFit } from './lib/romfit.mjs';
import { bakeVertexAO } from './lib/vertexao.mjs';
import { rimTubes, faceOut } from './lib/rung1.mjs';
import { openEdges } from './lib/smock.mjs';
import { limbRadius } from './lib/starter.mjs';
import { TAU } from './lib/garment.mjs';
import { ROOT, io, jointPos } from '../lib/human/face.mjs';

export const LANE = 'armory';
export const OUTPUTS = ['public/models/armory/armor-pan-2.glb'];
const RECIPE = 'tools/build/recipes/armor/pan-2.mjs';
export const HAT_ON_HEAD = 32, HAT_ON_BACK = 64, HAT_ON_BACK_LOW = 128;
/** The hat: brim radius, the brim plane's height over her crown, its tilt (front down), the crown's clearance over the wrap. */
export const HAT = { brimR: 0.232, brimY: 1.722, cz: -0.036, tilt: 0.06, clear: 0.01, crownMin: 0.104, topMin: 0.14, sides: 20 };
/** The vest: its offset over the top, the hem, the front opening (|x| of the edge at the neck and at the hem), and how far it stays off the top's armholes and neckline. */
export const VEST = { off: 0.0028, hemY: 1.156, edgeNeck: 0.07, edgeHem: 0.112, rimClear: 0.016 };
/** The shoulder guard's three lames along the left upper arm (t: share of shoulder -> elbow; ph about the arm, 0 = front, PI/2 = up in bind). */
export const GUARD = [
  { t0: -0.24, t1: 0.12, off: 0.024, flare: 0.016, ph0: 0.0, ph1: Math.PI, phIn: 0.7 },
  { t0: 0.05, t1: 0.27, off: 0.02, flare: 0.016, ph0: -0.4, ph1: Math.PI + 0.4, phIn: 0 },
  { t0: 0.2, t1: 0.41, off: 0.015, flare: 0.014, ph0: -0.45, ph1: Math.PI + 0.45, phIn: 0 },
];

/* ------------------------------------------------------------------ Brea's head wrap (the hat's fit) */

const mul4 = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
/** The bind positions of brea.glb's hair-and-wrap mesh (its own skin at rest), and which are the tail's (a dyn_ chain). */
async function wrapPoints() {
  const d = await (await io()).read(path.join(ROOT, 'public/models/hero/brea.glb'));
  const node = d.getRoot().listNodes().find((n) => n.getName() === 'Brea_HairWrap');
  if (!node) throw new Error('[pan-2] brea.glb has no Brea_HairWrap: the hat cannot be fitted');
  const skin = node.getSkin(), joints = skin.listJoints(), ibm = skin.getInverseBindMatrices().getArray();
  const M = joints.map((j, k) => mul4(j.getWorldMatrix(), Array.from(ibm.slice(k * 16, k * 16 + 16))));
  const prim = node.getMesh().listPrimitives()[0];
  const P = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const p = [0, 0, 0], j4 = [0, 0, 0, 0], w4 = [0, 0, 0, 0], out = [];
  for (let i = 0; i < P.getCount(); i++) {
    P.getElement(i, p); J.getElement(i, j4); W.getElement(i, w4);
    let x = 0, y = 0, z = 0, s = 0, top = 0, wTop = -1;
    for (let k = 0; k < 4; k++) {
      const w = w4[k];
      if (w <= 0) continue;
      const m = M[j4[k]];
      s += w;
      x += w * (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]);
      y += w * (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]);
      z += w * (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]);
      if (w > wTop) { wTop = w; top = j4[k]; }
    }
    out.push({ p: [x / s, y / s, z / s], tail: /^dyn_/.test(joints[top].getName()) });
  }
  return out;
}

/* ------------------------------------------------------------------ the hat */

/** The head copy's frame: brim plane through T, crown along Y (tipped forward by `tilt`), Z to her front. */
function headFrame() {
  const t = HAT.tilt;
  return { X: [1, 0, 0], Y: [0, Math.cos(t), Math.sin(t)], Z: [0, -Math.sin(t), Math.cos(t)], T: [0, HAT.brimY, HAT.cz] };
}
const toLocal = (F, q) => { const d = V.sub(q, F.T); return [V.dot(d, F.X), V.dot(d, F.Y), V.dot(d, F.Z)]; };

/**
 * The crown's radius at each of `sides` bearings and its height, from the wrap in the head copy's frame: every wrap point
 * over the brim plane, the largest radius within a bearing's sector plus the clearance; the top over the highest point.
 * Also the least room between the brim's underside and any wrap point under it (the tail leaves there).
 */
function fitCrown(wrap, F) {
  const S = HAT.sides, need = new Float64Array(S).fill(HAT.crownMin);
  let top = HAT.topMin, brimRoom = Infinity, inside = 0;
  const L = wrap.map((w) => ({ l: toLocal(F, w.p), tail: w.tail }));
  for (const { l } of L) {
    if (l[1] < -0.02) continue;
    const r = Math.hypot(l[0], l[2]);
    const th = Math.atan2(l[2], l[0]);
    for (let k = 0; k < S; k++) {
      let d = Math.abs(th - (k / S) * TAU); d = Math.min(d, TAU - d);
      if (d < (TAU / S) * 0.9) need[k] = Math.max(need[k], r + HAT.clear);
    }
    if (r < HAT.crownMin + 0.04) top = Math.max(top, l[1] + HAT.clear);
  }
  // round the bearings (two passes), never in under what a sector needs
  for (let pass = 0; pass < 2; pass++) {
    const o = need.slice();
    for (let k = 0; k < S; k++) need[k] = Math.max(o[k], (o[(k + S - 1) % S] + 2 * o[k] + o[(k + 1) % S]) / 4);
  }
  for (const { l } of L) {
    const r = Math.hypot(l[0], l[2]);
    if (r > HAT.brimR || l[1] >= -0.02) continue;
    const th = Math.atan2(l[2], l[0]), k = ((Math.round((th / TAU) * S) % S) + S) % S;
    if (r < need[k] - HAT.clear) { inside++; continue; }     // under the crown: the head itself
    brimRoom = Math.min(brimRoom, brimY(r) - l[1]);
  }
  return { need, top, brimRoom, inside };
}
/** The brim's underside height at radius r (local): flat to the crown, drooping 1.4 cm at its rolled edge. */
const brimY = (r) => -0.016 * sstep(HAT.brimR - 0.07, HAT.brimR, r) - 0.002;

/** The hat's profile rings, local: [radius scale (1 = the crown's fitted radius) or absolute radius, y, which]. */
function hatRings(top) {
  const R = HAT.brimR;
  // (the mid-brim ring stays outside the crown's flare wherever the wrap pushes the crown out)
  return [
    { r: R, y: -0.017, abs: true }, { r: R - 0.004, y: -0.008, abs: true }, { r: R - 0.035, y: -0.0015, abs: true, minScale: 1.16 },
    { r: 1.1, y: 0.003 }, { r: 1.025, y: 0.006 },
    { r: 1.0, y: 0.014 }, { r: 0.995, y: 0.032 }, { r: 0.965, y: top * 0.42 }, { r: 0.89, y: top * 0.66 },
    { r: 0.73, y: top * 0.85 }, { r: 0.46, y: top * 0.96 }, { r: 0.002, y: top },
  ];
}
/** One copy of the hat into `part`, in frame F, rigid on `joint`: the woven palm, and its violet band (into `band`). */
function hatInto(part, band, F, fit, rects, joint, bit) {
  const S = HAT.sides, rings = hatRings(fit.top);
  const at = (rr, k, y) => {
    const th = (k / S) * TAU;
    const lx = Math.cos(th) * rr, lz = Math.sin(th) * rr;
    return [F.T[0] + F.X[0] * lx + F.Y[0] * y + F.Z[0] * lz, F.T[1] + F.X[1] * lx + F.Y[1] * y + F.Z[1] * lz, F.T[2] + F.X[2] * lx + F.Y[2] * y + F.Z[2] * lz];
  };
  const radius = (g, k) => (g.abs ? Math.max(g.r * (1 + 0.012 * Math.sin((k / S) * TAU * 3 + 0.7)), (g.minScale || 0) * fit.need[k % S]) : g.r * fit.need[k % S]);
  const base = part.pos.length / 3;
  const palm = rects.palm;
  for (let r = 0; r < rings.length; r++) for (let k = 0; k <= S; k++) {
    part.pos.push(...at(radius(rings[r], k), k, rings[r].y));
    part.nrm.push(...F.Y);
    // the weave repeats round the hat and from ring to ring (mirrored, so it never smears)
    part.uv.push(palm[0] + palm[2] * Math.abs(((k / S) * 8) % 2 - 1), palm[1] + palm[3] * (r % 2));
    part.jnt.push(joint, 0, 0, 0); part.wgt.push(1, 0, 0, 0);
  }
  const cc = S + 1;
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < S; k++) {
    const a = base + r * cc + k, b = a + 1, d = a + cc, e = d + 1;
    part.idx.push(a, b, d, b, e, d);
  }
  part.pieceBit = bit;
  // the band: a violet ribbon round the crown's foot, standing 2.5 mm proud of the weave, 2.2 cm tall
  const bb = band.pos.length / 3, wv = rects.band;
  const bandRows = [[0.012, 0.0008], [0.014, 0.0026], [0.032, 0.0026], [0.034, 0.0008]];
  for (let r = 0; r < bandRows.length; r++) for (let k = 0; k <= S; k++) {
    const [y, lift] = bandRows[r];
    band.pos.push(...at(fit.need[k % S] * mix(1.0, 0.995, (y - 0.012) / 0.022) + lift, k, y));
    band.nrm.push(...F.Y);
    band.uv.push(wv[0] + wv[2] * Math.abs(((k / S) * 6) % 2 - 1), wv[1] + wv[3] * (r / (bandRows.length - 1)));
    band.jnt.push(joint, 0, 0, 0); band.wgt.push(1, 0, 0, 0);
  }
  for (let r = 0; r < bandRows.length - 1; r++) for (let k = 0; k < S; k++) {
    const a = bb + r * cc + k, b = a + 1, d = a + cc, e = d + 1;
    band.idx.push(a, b, d, b, e, d);
  }
  band.pieceBit = bit;
}

/* ------------------------------------------------------------------ the vest */

/**
 * The vest: the top's own surface (the smock), welded, laid `VEST.off` out along its normal, kept where the vest is
 * (over the hem, outside the front V, clear of the armholes and the neckline), its cut edge faired, then bound in
 * violet. Skin: the top's own, so the two never part.
 */
function vestInto(vest, smock, trim) {
  const n = smock.pos.length / 3;
  // weld the top's uv seams: one vertex per place, its normal the average
  const id = new Map(), rep = [], nrm = [], of = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(smock.pos[i * 3] * 1e4)},${Math.round(smock.pos[i * 3 + 1] * 1e4)},${Math.round(smock.pos[i * 3 + 2] * 1e4)}`;
    if (!id.has(k)) { id.set(k, rep.length); rep.push(i); nrm.push([0, 0, 0]); }
    of[i] = id.get(k);
    const m = nrm[of[i]];
    m[0] += smock.nrm[i * 3]; m[1] += smock.nrm[i * 3 + 1]; m[2] += smock.nrm[i * 3 + 2];
  }
  // the top's own open edges over the waist: the armholes and the neckline the vest keeps clear of
  const rim = [];
  for (const run of openEdges(smock)) for (const q of run) if (q.p[1] > 1.25) rim.push(q.p);
  const rimF = new Field([{ pos: rim.flat(), nrm: rim.map(() => [0, 1, 0]).flat(), jnt: null, wgt: null }], 0.03);
  const edgeX = (y) => mix(VEST.edgeHem, VEST.edgeNeck, sstep(1.2, 1.47, y));
  const inside = (p) => {
    const [x, y, z] = p;
    if (y < VEST.hemY) return false;
    if (z > -0.01 && Math.abs(x) < edgeX(y)) return false;
    const near = rimF.nearest(x, y, z, 1)[0];
    return !near || near.d > VEST.rimClear;
  };
  const W = rep.length, ok = new Uint8Array(W);
  for (let w = 0; w < W; w++) { const i = rep[w]; ok[w] = inside([smock.pos[i * 3], smock.pos[i * 3 + 1], smock.pos[i * 3 + 2]]) ? 1 : 0; }
  const map = new Int32Array(W).fill(-1), tris = [];
  for (let t = 0; t < smock.idx.length; t += 3) {
    const a = of[smock.idx[t]], b = of[smock.idx[t + 1]], c = of[smock.idx[t + 2]];
    if (!ok[a] || !ok[b] || !ok[c] || a === b || b === c || a === c) continue;
    tris.push(a, b, c);
  }
  const P = [], N = [], S = [];
  for (const w of tris) {
    if (map[w] >= 0) continue;
    map[w] = P.length;
    const i = rep[w];
    P.push([smock.pos[i * 3], smock.pos[i * 3 + 1], smock.pos[i * 3 + 2]]);
    N.push(V.norm(nrm[w]));
    S.push({ j: smock.jnt.slice(i * 4, i * 4 + 4), w: smock.wgt.slice(i * 4, i * 4 + 4) });
  }
  let idx = tris.map((w) => map[w]);
  // drop the small islands the armhole clearance leaves (a few triangles cut off from the vest): keep pieces of >= 40
  {
    const par = P.map((_, k) => k), find = (k) => { while (par[k] !== k) { par[k] = par[par[k]]; k = par[k]; } return k; };
    for (let t = 0; t < idx.length; t += 3) { const a = find(idx[t]), b = find(idx[t + 1]), c = find(idx[t + 2]); par[b] = a; par[find(c)] = a; }
    const size = new Map();
    for (let t = 0; t < idx.length; t += 3) { const r = find(idx[t]); size.set(r, (size.get(r) || 0) + 1); }
    const keep = [];
    for (let t = 0; t < idx.length; t += 3) if (size.get(find(idx[t])) >= 40) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    idx = keep;
  }
  // fair the cut edge: each open-edge point moves toward its two neighbours along the edge (five passes), then back onto
  // the top along its normal, so the vest's edge runs as a cut line, not as the top's triangles
  const sheet = { pos: P.flat(), nrm: N.flat(), idx };
  const top = new Field([{ pos: P.flat(), nrm: N.flat(), jnt: null, wgt: null }], 0.03);
  const runs = openEdges(sheet);
  for (let pass = 0; pass < 8; pass++) {
    for (const run of runs) {
      const L = run.length;
      if (L < 4) continue;
      const closed = V.len(V.sub(run[0].p, run[L - 1].p)) < 0.03;
      const nu = run.map((q, k) => {
        if (!closed && (k === 0 || k === L - 1)) return q.p;
        const a = run[(k - 1 + L) % L].p, b = run[(k + 1) % L].p;
        return V.lerp(q.p, V.mul(V.add(a, b), 0.5), 0.5);
      });
      run.forEach((q, k) => { q.p = nu[k]; });
    }
  }
  // the two cut lines the vest is drafted on, exactly: the hem level, the front edges on their line
  for (const run of runs) for (const q of run) {
    const [x, y, z] = q.p;
    if (y < VEST.hemY + 0.07 && !(z > -0.01 && Math.abs(Math.abs(x) - edgeX(y)) < 0.012)) q.p = [x, VEST.hemY, z];
    else if (z > -0.01 && Math.abs(Math.abs(x) - edgeX(y)) < 0.025) q.p = [Math.sign(x) * edgeX(y), y, z];
  }
  for (const run of runs) for (const q of run) {
    const near = top.nearest(q.p[0], q.p[1], q.p[2], 4);
    let nx = 0, ny = 0, nz = 0, h = 0, f = 0;
    for (const { p: s, d } of near) { const w = 1 / (d * d + 1e-5); nx += s.nx * w; ny += s.ny * w; nz += s.nz * w; h += ((q.p[0] - s.x) * s.nx + (q.p[1] - s.y) * s.ny + (q.p[2] - s.z) * s.nz) * w; f += w; }
    const nn = V.norm([nx, ny, nz]);
    P[q.i] = V.sub(q.p, V.mul(nn, h / f));
  }
  // out along the top's normal, uv in the linen cell (u round her, v up, mirrored at 0.18 m so it never smears)
  const lin = trim.rect('linen'), tile = 0.18;
  const tri = (s) => Math.abs(((s / tile) % 2 + 2) % 2 - 1);
  const base = vest.pos.length / 3;
  P.forEach((p, k) => {
    const q = V.add(p, V.mul(N[k], VEST.off));
    vest.pos.push(...q); vest.nrm.push(...N[k]);
    const th = Math.atan2(q[2] + 0.02, q[0]);
    vest.uv.push(lin[0] + lin[2] * tri(th * 0.15 + 0.5), lin[1] + lin[3] * tri(q[1] - 1.1));
    vest.jnt.push(...S[k].j); vest.wgt.push(...S[k].w);
  });
  for (const v of idx) vest.idx.push(base + v);
  recomputeNormals(vest);
  return vest;
}

/* ------------------------------------------------------------------ the shoulder guard */

/** Three lapped lames over her left upper arm, rigid on it (the top one eased onto the clavicle over the joint). */
function guardInto(guard, doc, fitBody, J, trim) {
  const a = jointPos(doc, 'upperarm_l'), b = jointPos(doc, 'lowerarm_l');
  const onArm = (i) => fitBody.pos[i * 3] > a[0] - 0.09;
  const R = limbRadius(fitBody, a, b, { pick: onArm, t0: -0.35, t1: 0.7, maxR: 0.13 });
  const { X, Y, Z } = R.F, Lm = R.F.len;
  const jU = J('upperarm_l'), jC = J('clavicle_l');
  const leather = trim.rect('pouch');
  const COLS = 14, ROWS = 5;
  for (const g of GUARD) {
    const base = guard.pos.length / 3;
    for (let r = 0; r <= ROWS; r++) {
      const s = r / ROWS, t = mix(g.t0, g.t1, s);
      // over the joint the plate narrows to the top of the shoulder (phIn radians off each end at its inner edge)
      const narrow = g.phIn * (1 - sstep(0, 0.6, s));
      for (let c = 0; c <= COLS; c++) {
        const u = c / COLS;
        const ph = mix(g.ph0 + narrow, g.ph1 - narrow, u);
        // the plate's arc: the arm's own radius there (the widest over its rows, so it never dips into the deltoid), the
        // lower edge flared out so each lame laps the next, and its two ends curled in a little round the arm
        let rr = 0;
        for (const tt of [t - 0.04, t, t + 0.04]) rr = Math.max(rr, R.at(tt, ph));
        const curl = -0.004 * (1 - Math.sin(Math.PI * u));
        const rad = rr + g.off + g.flare * s * s + curl;
        const q = V.add(V.add(a, V.mul(X, t * Lm)), V.add(V.mul(Y, Math.sin(ph) * rad), V.mul(Z, Math.cos(ph) * rad)));
        guard.pos.push(...q);
        guard.nrm.push(...V.norm(V.add(V.mul(Y, Math.sin(ph)), V.mul(Z, Math.cos(ph)))));
        guard.uv.push(leather[0] + leather[2] * u, leather[1] + leather[3] * s);
        const wc = 0.55 * sstep(0.1, -0.15, t);
        guard.jnt.push(jU, jC, 0, 0); guard.wgt.push(1 - wc, wc, 0, 0);
      }
    }
    const cc = COLS + 1;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i0 = base + r * cc + c, i1 = i0 + 1, i2 = i0 + cc, i3 = i2 + 1;
      guard.idx.push(i0, i1, i2, i1, i3, i2);
    }
  }
  recomputeNormals(guard);
  faceOut(guard, new Field([fitBody], 0.03));
  return guard;
}

/* ------------------------------------------------------------------ the leg wraps */

/**
 * The patterned leg wraps: a cream linen strip wound over the Starter's violet shin wraps at twice their pitch, so each
 * leg reads cream and violet in turn from the boot top to under the knee. Each turn laps the one below (its upper edge
 * proud, its lower edge tucked); the radius is the boot shaft's own (her shin wraps as built), skin from the boot.
 */
/** The farthest hit of the ray c + t d (t > 0) on the triangles `tris` (flat [ax, ay, az, bx, ...]), or 0. */
function farHit(tris, c, d) {
  let best = 0;
  for (let k = 0; k < tris.length; k += 9) {
    const e1 = [tris[k + 3] - tris[k], tris[k + 4] - tris[k + 1], tris[k + 5] - tris[k + 2]];
    const e2 = [tris[k + 6] - tris[k], tris[k + 7] - tris[k + 1], tris[k + 8] - tris[k + 2]];
    const pv = V.cross(d, e2), det = V.dot(e1, pv);
    if (Math.abs(det) < 1e-12) continue;
    const tv = [c[0] - tris[k], c[1] - tris[k + 1], c[2] - tris[k + 2]];
    const u = V.dot(tv, pv) / det;
    if (u < 0 || u > 1) continue;
    const qv = V.cross(tv, e1), v = V.dot(d, qv) / det;
    if (v < 0 || u + v > 1) continue;
    const t = V.dot(e2, qv) / det;
    if (t > best) best = t;
  }
  return best;
}

function legWrapsInto(part, boots, trim, { y0 = 0.3, y1 = 0.43, pitch = 0.062, width = 0.029, lift = 0.005, perRev = 22 } = {}) {
  const lin = trim.rect('linen');
  const skin = new Field([boots], 0.03);
  for (const side of [1, -1]) {
    // the shaft's axis: the boots painter's own (x = side x 0.111, z = -0.042); the radius is read by a ray out from it to the
    // outermost face of the boot and its wound shin wrap
    const cx = side * 0.111, cz = -0.042;
    const tris = [];
    for (let t = 0; t < boots.idx.length; t += 3) {
      const v = [boots.idx[t], boots.idx[t + 1], boots.idx[t + 2]];
      const ys = v.map((q) => boots.pos[q * 3 + 1]), xs = v.map((q) => boots.pos[q * 3]);
      if (Math.max(...ys) < y0 - 0.04 || Math.min(...ys) > y1 + 0.04 || xs.some((x) => Math.sign(x) !== side)) continue;
      for (const q of v) tris.push(boots.pos[q * 3], boots.pos[q * 3 + 1], boots.pos[q * 3 + 2]);
    }
    const revs = (y1 - y0 - width) / pitch;
    const N = Math.ceil(revs * perRev);
    const base = part.pos.length / 3;
    const ACROSS = [-0.5, -0.32, 0.38, 0.5];
    const rows = [];
    for (let s = 0; s <= N; s++) {
      const f = s / N, ph0 = f * revs * TAU;
      // the turns run down the leg as the bearing turns one way on the left leg and the other on the right
      const th = side > 0 ? ph0 : -ph0;
      const yc = y1 - width / 2 - f * revs * pitch;
      rows.push(ACROSS.map((v) => {
        const y = yc + v * width;
        const d = [Math.cos(th), 0, Math.sin(th)];
        return { y, th, d, r: farHit(tris, [cx, y, cz], d) };
      }));
    }
    // a strip lies over the turns: a missed ray takes its neighbours' radius, then three passes along the strip smooth it
    // (never in under its own hit, so it never sinks into the turn it lies on)
    let R = rows.map((row, s) => row.map((q, k) => {
      if (q.r) return q.r;
      let n = 0, a = 0;
      for (let ds = -2; ds <= 2; ds++) for (let dk = -1; dk <= 1; dk++) { const o = rows[s + ds]?.[k + dk]; if (o?.r) { a += o.r; n++; } }
      return n ? a / n : 0.06;
    }));
    for (let pass = 0; pass < 3; pass++) {
      R = R.map((row, s) => row.map((r, k) => Math.max(rows[s][k].r, ((R[s - 1]?.[k] ?? r) + 2 * r + (R[s + 1]?.[k] ?? r)) / 4)));
    }
    rows.forEach((row, s) => row.forEach((q, k) => {
      const lap = k === 0 ? -0.0012 : k === ACROSS.length - 1 ? 0.0006 : 0.0012;
      const rr = R[s][k] + lift + lap;
      const p = [cx + q.d[0] * rr, q.y, cz + q.d[2] * rr];
      part.pos.push(...p); part.nrm.push(...q.d);
      const tri = Math.abs((((s / N) * revs * 3) % 2) - 1);
      part.uv.push(lin[0] + lin[2] * tri, lin[1] + lin[3] * (k / (ACROSS.length - 1)));
      const sk = skin.skin(p[0], p[1], p[2], 4);
      part.jnt.push(...sk.j); part.wgt.push(...sk.w);
    }));
    const cc = ACROSS.length;
    for (let s = 0; s < N; s++) for (let k = 0; k < cc - 1; k++) {
      const a0 = base + s * cc + k, b0 = a0 + 1, d = a0 + cc, e = d + 1;
      part.idx.push(a0, b0, d, b0, e, d);
    }
  }
  recomputeNormals(part);
  faceOut(part, new Field([boots], 0.03));
  return part;
}

/* ------------------------------------------------------------------ the build */

/**
 * The Scout's own pieces, built over the Starter as the Starter ships (its parts through the same range-of-motion fit,
 * so the vest lies over the top where the top really is), and the fitted Starter they lie on (for the AO and the
 * offline checks). The Starter's file is not touched: this rung's GLB holds only its pieces, bound over the Starter's
 * at equip (src/hero/outfit.js `r5Outfit.over`).
 */
export async function scoutParts() {
  const base = await panBase();                 // the Starter's cut
  const { trim, J, fitBody, doc } = base;
  const layout = await panLayout(base.sheetParts, trim, base.W, base.H);
  romFit(base.parts, base, PAN_FIT);
  const under = base.parts;
  const smock = under.find((p) => p.slot === 'smock'), boots = under.find((p) => p.slot === 'boots');
  const vest = vestInto(emptyPart('vest', { trim: true }), smock, trim);
  const vestRim = emptyPart('vestrim', { trim: true });
  rimTubes(vestRim, vest, { r: 0.0013, sides: 3, rect: trim.rect('bind'), tile: 0.1 });
  const guard = guardInto(emptyPart('guard', { trim: true }), doc, fitBody, J, trim);
  const guardRim = emptyPart('guardrim', { trim: true });
  rimTubes(guardRim, guard, { r: 0.0017, sides: 4, rect: trim.rect('strapB'), tile: 0.1 });
  const legs = legWrapsInto(emptyPart('legwrap', { trim: true }), boots, trim);
  // the hat, fitted to the wrap, and its two copies on her back (Pan II's W1 frames: over the stowed bow with the lance
  // out, close in with the bow in her hand, both clear of the stowed weapons)
  const wrap = await wrapPoints();
  const F = headFrame();
  const fit = fitCrown(wrap, F);
  const rects = { palm: trim.rect('palm'), band: trim.rect('wrapV') };
  const hats = [];
  const backF = (T) => ({ X: [1, 0, 0], Y: V.norm([0, -0.12, -1]), Z: V.norm([0, 1, -0.12]), T });
  for (const [Fr, joint, bit] of [[F, J('Head'), HAT_ON_HEAD], [backF([0.15, 1.31, -0.396]), J('spine_02'), HAT_ON_BACK], [backF([0.15, 1.31, -0.305]), J('spine_03'), HAT_ON_BACK_LOW]]) {
    const h = emptyPart('hat', { trim: true }), b = emptyPart('hatband', { trim: true });
    hatInto(h, b, Fr, fit, rects, joint, bit);
    recomputeNormals(h); recomputeNormals(b);
    hats.push(h, b);
  }
  const added = [vest, vestRim, guard, guardRim, legs, ...hats];
  return { base, under, added, layout, fit };
}

export async function build({ out = ROOT } = {}) {
  const { base, under, added, layout, fit } = await scoutParts();
  // the contact shadow: the Starter under it occludes, only the Scout's own vertices are kept
  const nAdded = added.reduce((n, p) => n + p.pos.length / 3, 0);
  const ao = bakeVertexAO([...added, ...under], { body: base.bodyPart }).slice(0, nAdded);
  outfitDoc(base.doc, added, { name: 'Outfit_pan_2', matName: 'MI_pan-2', tex: null, pieces: true, extra: { _AO: ['SCALAR', ao] } });
  for (const m of base.doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()) pr.getAttribute('_AO')?.setNormalized(true);
  const r = await writeOutfit(base.doc, path.join(out, OUTPUTS[0]), {
    lean: true, recipe: RECIPE, sources: ['mco-fantasy-standard', 'ubc-standard', 'brea-generated'], licence: 'CC0-1.0',
    r5Outfit: {
      set: 'pan', variant: 'pan-2', name: 'Pan Whites II — Guild Whites', rung: 2, tier: 'scout',
      // fitted over rung 1 (BIBLE §8.4): src/hero/outfit.js binds the Starter's set first and these pieces over it
      over: 'heroOutfitPan1', sharedAtlas: 'heroOutfitPan1',
      density: +layout.D.toFixed(1), detailRep: +((base.W / layout.D) / 0.026).toFixed(1),
      pieces: ['vest', 'guard', 'legwrap', 'hat'], hasPieces: true, hasSalt: false, hasAo: true, cut: 'starter',
      hat: { brimR: HAT.brimR, crownTop: +fit.top.toFixed(4), brimRoom: +fit.brimRoom.toFixed(4) },
    },
  });
  const per = {};
  for (const p of added) per[p.slot] = (per[p.slot] || 0) + p.idx.length / 3;
  return { ...r, perSlot: per, hatBrimRoom: +fit.brimRoom.toFixed(4), hatTop: +fit.top.toFixed(4) };
}
