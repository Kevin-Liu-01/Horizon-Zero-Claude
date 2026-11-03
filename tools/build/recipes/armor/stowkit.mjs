/**
 * CALIMA — recipe: the merged stow kit, art pass (armory W1; bible §3.6; plan §4.1
 * "stow kit ≤ 9 k, 1 draw, weapon atlas 1024²"; the v0 kit stays hero-body's until
 * its findings close: tools/build/recipes/weapons/kit-v0.mjs).
 *
 * OUTPUT public/models/armory/stowkit.glb — ALL stowed gear as ONE skinned mesh, ONE
 * draw, bound by name to Brea's bones. It carries the shared WEAPON ATLAS (the held
 * bow and lance read its maps at runtime). `_PIECE` bits as v0: 1 lance, 2 bow,
 * 4 quiver + arrows, 8 bracer, 16 alidade + cord. Same placement contract as v0:
 *   lance  on the `stow_lance` socket the carry solve poses, 34° from vertical, the
 *          bob low at her left hip, the blade above her right shoulder
 *   bow    spine_02, the opposite diagonal beneath the lance, <= 3 cm off the back
 *   quiver pelvis, right hip, tilted 20° forward
 *   bracer lowerarm_l, dorsal
 *   alidade dyn_alidadeCord_02, on its neck cord at the sternum
 * The surface it clears is the current Pan I outfit (armor/lib + outfit-pan-1).
 */
import path from 'node:path';
import {
  ROOT, srcRoot, UBC_DIR, readGltf, cleanDoc, nodeByName, addChain, jointIndex, jointPos, writeSkinned, v3,
} from '../lib/face.mjs';
import { CHAINS, BODY_HEIGHT } from '../brea.mjs';
import { panBase } from '../outfit-pan-1.mjs';
import { G, LANCE, basisY, bowGeo, lanceGeo, lathe, merge, place, stringGeo } from './lib/weapongeo.mjs';
import { paintWeaponAtlas } from './lib/weaponatlas.mjs';

export const LANE = 'armory';
export const OUTPUTS = ['public/models/armory/stowkit.glb'];
const RECIPE = 'tools/build/recipes/armor/stowkit.mjs';
export const PIECE = { lance: 1, bow: 2, quiver: 4, bracer: 8, alidade: 16 };
export const LANCE_SOCKET = 'stow_lance';
export const QUIVER = { length: 0.60, r: 0.040, arrows: 12, arrowOut: 0.11 };

function addSocket(doc, name, parentName) {
  const skin = doc.getRoot().listSkins()[0];
  const parent = skin.listJoints().find((j) => j.getName() === parentName);
  const pi = skin.listJoints().indexOf(parent);
  const ibmAcc = skin.getInverseBindMatrices();
  const ibm = Array.from(ibmAcc.getArray());
  const node = doc.createNode(name);
  parent.addChild(node);
  skin.addJoint(node);
  ibm.push(...ibm.slice(pi * 16, pi * 16 + 16));
  ibmAcc.setArray(new Float32Array(ibm));
}

/** The cane quiver, local +Y up the tube from its foot; 12 arrows. */
function quiverGeo(cell) {
  const g = G();
  const Q = QUIVER;
  // the tube: real swelling at each node, the cut mouth slightly bevelled
  const prof = [];
  for (let n = 0; n < 4; n++) {
    const y0 = n * 0.15;
    prof.push([Q.r, y0 + 0.006], [Q.r + 0.0045, y0 + 0.012], [Q.r + 0.0055, y0 + 0.018], [Q.r + 0.001, y0 + 0.026], [Q.r - 0.0004, y0 + 0.08]);
  }
  prof.push([Q.r, Q.length - 0.004], [Q.r - 0.003, Q.length]);
  merge(g, lathe(prof, { sides: 12, rect: cell('cane'), uAlong: true }));
  merge(g, lathe([[Q.r + 0.0005, 0.0], [Q.r, 0.006]], { sides: 12, rect: cell('cane'), cap0: true }));
  // inner wall, dark, so the open mouth reads
  merge(g, lathe([[Q.r - 0.003, Q.length], [Q.r - 0.004, Q.length - 0.08]], { sides: 12, rect: cell('leatherDark') }));
  // palm-weave cap over the back half of the mouth (the nocks show at the front)
  const cap = lathe([[Q.r + 0.006, 0.0], [Q.r + 0.0075, 0.03], [Q.r + 0.006, 0.058], [Q.r * 0.72, 0.082], [Q.r * 0.3, 0.094], [0.0, 0.098]], { sides: 12, rect: cell('palm'), uAlong: false });
  const keep = [];
  for (let t = 0; t < cap.idx.length; t += 3) {
    const zc = (cap.pos[cap.idx[t] * 3 + 2] + cap.pos[cap.idx[t + 1] * 3 + 2] + cap.pos[cap.idx[t + 2] * 3 + 2]) / 3;
    if (zc < 0.006) keep.push(cap.idx[t], cap.idx[t + 1], cap.idx[t + 2]);
  }
  cap.idx = keep;
  for (let i = 1; i < cap.pos.length; i += 3) cap.pos[i] += Q.length - 0.024;
  merge(g, cap);
  // two leather bands and their hanger loop
  for (const y of [0.17, 0.47]) {
    merge(g, lathe([[Q.r + 0.0012, y - 0.016], [Q.r + 0.0042, y - 0.013], [Q.r + 0.0042, y + 0.013], [Q.r + 0.0012, y + 0.016]], { sides: 12, rect: cell('leatherDark'), uAlong: true, vRange: [0.1, 0.9] }));
  }
  // arrows: reed shafts with gull fletching, nocks above the mouth, the front half
  for (let a = 0; a < Q.arrows; a++) {
    const ang = (a / Q.arrows) * Math.PI * 2 + 0.3;
    const rr = (a % 2 ? 0.55 : 0.28) * Q.r;
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr + 0.008;
    const y0 = Q.length - 0.25, y1 = Q.length + Q.arrowOut - (a % 3) * 0.007;
    merge(g, place(lathe([[0.0034, 0], [0.0034, y1 - y0]], { sides: 4, rect: cell('shaft') }), [1, 0, 0], [0, 1, 0], [0, 0, 1], [x, y0, z]));
    merge(g, place(lathe([[0.0036, 0], [0.0042, 0.006], [0.0024, 0.011]], { sides: 4, rect: cell('horn') }), [1, 0, 0], [0, 1, 0], [0, 0, 1], [x, y1, z]));
    for (let f = 0; f < 3; f++) {
      const fa = ang + (f / 3) * Math.PI * 2;
      const fx = Math.cos(fa), fz = Math.sin(fa);
      const rect = cell(f === 0 ? 'fletchB' : 'fletchW');
      const v = G();
      const pts = [[0, 0.0], [0.05, 0.009], [0.08, 0.009], [0.098, 0.003]];
      pts.forEach(([l, h]) => {
        const yy = y1 - 0.01 - l;
        v.pos.push(x + fx * 0.0034, yy, z + fz * 0.0034, x + fx * (0.0034 + h), yy + 0.006 * (h / 0.009), z + fz * (0.0034 + h));
        v.nrm.push(-fz, 0, fx, -fz, 0, fx);
        const u = l / 0.098;
        v.uv.push(rect[0] + u * rect[2], rect[1], rect[0] + u * rect[2], rect[1] + rect[3]);
      });
      for (let k = 0; k < pts.length - 1; k++) { const p = k * 2; v.idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3, p, p + 1, p + 2, p + 1, p + 3, p + 2); }
      merge(g, v);
    }
  }
  return g;
}

/**
 * The archer's crescent bracer, local +X along the forearm (elbow -> wrist), dorsal
 * +Y. Stiff leather, three laces under the arm, and a true bronze crescent standing
 * on the dorsal ridge: outer and inner arcs (it was a fin in v0, it read as a wing).
 */
function bracerGeo(cell, r = 0.036, len = 0.17) {
  const g = G();
  const SEG = 12, ROWS = 8;
  const rect = cell('leather');
  const shell = G();
  for (let i = 0; i <= ROWS; i++) {
    const f = i / ROWS, x = f * len;
    const flare = 1 + 0.16 * Math.pow(Math.abs(f - 0.12), 1.5) - 0.03 * Math.sin(f * Math.PI);
    for (let k = 0; k <= SEG; k++) {
      const th = -0.2 * Math.PI + (k / SEG) * 1.4 * Math.PI;
      const y = Math.sin(th), z = Math.cos(th);
      const lip = i === 0 || i === ROWS ? 1.012 : 1;
      shell.pos.push(x, y * r * flare * lip, z * r * flare * lip);
      shell.nrm.push(0, y, z);
      shell.uv.push(rect[0] + f * rect[2], rect[1] + (k / SEG) * rect[3]);
    }
  }
  for (let i = 0; i < ROWS; i++) for (let k = 0; k < SEG; k++) {
    const a = i * (SEG + 1) + k, b = a + 1, c = a + SEG + 1, d = c + 1;
    shell.idx.push(a, b, c, b, d, c);
  }
  merge(g, shell);
  // laces across the open underside
  const cord = cell('cord');
  for (const f of [0.22, 0.5, 0.78]) {
    const a0 = -0.2 * Math.PI, a1 = 1.2 * Math.PI;
    const P0 = [f * len, Math.sin(a0) * r * 1.02, Math.cos(a0) * r * 1.02], P1 = [f * len, Math.sin(a1) * r * 1.02, Math.cos(a1) * r * 1.02];
    const dir = v3.sub(P1, P0);
    const [X, Y, Z] = basisY(dir, [1, 0, 0]);
    merge(g, place(lathe([[0.0016, 0], [0.0016, Math.hypot(...dir)]], { sides: 3, rect: cord }), X, Y, Z, P0));
  }
  // the crescent: outer arc from horn to horn round the belly, inner arc the moon's bite
  const br = cell('bronzeCast');
  const N = 22, t = 0.0024, base = r * 1.0;
  const x0 = len * 0.08, x1 = len * 0.92, midX = (x0 + x1) / 2, half = (x1 - x0) / 2;
  const hornH = 0.108, bellyH = 0.03;                     // horns 10.8 cm proud, the belly's bite 3 cm (the 64 px cue, §3.2)
  const outerY = (a) => base - 0.006;                     // the outer arc lies on the leather
  const innerY = (a) => base + bellyH + (hornH - bellyH) * Math.pow(Math.abs(a), 1.9);
  void outerY;
  const taper = (a) => 1 - 0.8 * Math.pow(Math.abs(a), 4);
  const faces = (f) => {
    const q = G();
    for (let i = 0; i <= N; i++) {
      const a = -1 + 2 * (i / N), x = midX + a * half * Math.cos(a * 0.25);
      const yIn = innerY(a);
      // the crescent narrows to a point at each horn: its lower edge rises to meet the top
      const yLo = base - 0.006 + (yIn - base + 0.006) * Math.pow(Math.abs(a), 3.2) * 0.86;
      const tk = t * taper(a);
      q.pos.push(x, yLo, f * tk, x, yIn, f * tk * 0.6);
      q.nrm.push(0, 0, f, 0, 0, f);
      const u = i / N;
      q.uv.push(br[0] + u * br[2], br[1] + br[3], br[0] + u * br[2], br[1]);
    }
    for (let i = 0; i < N; i++) { const p = i * 2; if (f > 0) q.idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); else q.idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
    return q;
  };
  merge(g, faces(1)); merge(g, faces(-1));
  // its bright top edge
  const e = G();
  for (let i = 0; i <= N; i++) {
    const a = -1 + 2 * (i / N), x = midX + a * half * Math.cos(a * 0.25), y = innerY(a), tk = t * taper(a) * 0.6;
    e.pos.push(x, y, tk, x, y, -tk);
    const nx = -Math.sign(a) * 0.6 * Math.pow(Math.abs(a), 0.9);
    const l = Math.hypot(nx, 1);
    e.nrm.push(nx / l, 1 / l, 0, nx / l, 1 / l, 0);
    e.uv.push(br[0] + (i / N) * br[2], br[1], br[0] + (i / N) * br[2], br[1] + 0.15 * br[3]);
  }
  for (let i = 0; i < N; i++) { const p = i * 2; e.idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
  merge(g, e);
  // two rivets where the crescent meets the leather
  for (const a of [-0.34, 0.34]) {
    const x = midX + a * half, y = base + 0.003;
    merge(g, place(lathe([[0.0001, 0.0038], [0.0035, 0.0028], [0.0042, 0]], { sides: 6, rect: cell('brass') }), [1, 0, 0], [0, 0, 1], [0, -1, 0], [x, y, t * 0.9]));
    merge(g, place(lathe([[0.0001, 0.0038], [0.0035, 0.0028], [0.0042, 0]], { sides: 6, rect: cell('brass') }), [1, 0, 0], [0, 0, -1], [0, 1, 0], [x, y, -t * 0.9]));
  }
  return g;
}

const CORD_R = 0.0022;
function cordGeo(P, skins, r, cell, per = 1, ring = 4) {
  const g = G(), skin = [];
  const rect = cell('cord');
  const pts = [], sk = [];
  for (let i = 0; i < P.length - 1; i++) {
    for (let k = 0; k < per; k++) {
      const f = k / per, a = P[i], b = P[i + 1];
      pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
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
  return { g, skin };
}
/** The alidade: a 6 cm brass sighting tube with collars, local +X along it. */
function alidadeGeo(cell) {
  const tube = lathe([[0.0085, -0.03], [0.0098, -0.028], [0.0098, -0.024], [0.0080, -0.022], [0.0080, 0.022], [0.0098, 0.024], [0.0098, 0.028], [0.0085, 0.03]], { sides: 8, rect: cell('brass'), cap0: true, cap1: true });
  return place(tube, [0, -1, 0], [1, 0, 0], [0, 0, 1], [0, 0, 0]);
}

function forearmFrame(doc, bodyPrim) {
  const a = jointPos(doc, 'lowerarm_l'), b = jointPos(doc, 'hand_l');
  const X = v3.norm(v3.sub(b, a));
  const Z = v3.norm(v3.cross(X, [0, 1, 0]));
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

export async function build({ out = ROOT } = {}) {
  const { tex, T } = await paintWeaponAtlas();
  const cell = (n) => T.rect(n);
  const SRC = srcRoot();
  const doc = await readGltf(path.join(UBC_DIR(SRC), 'Superhero_Female_FullBody.gltf'));
  cleanDoc(doc);
  const bodyPrim = nodeByName(doc, 'Superhero_Female').getMesh().listPrimitives()[0];
  const forearm = forearmFrame(doc, bodyPrim);
  const yR = [1e9, -1e9];
  { const P = bodyPrim.getAttribute('POSITION'), p = [0, 0, 0]; for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p); yR[0] = Math.min(yR[0], p[1]); yR[1] = Math.max(yR[1], p[1]); } }
  for (const n of doc.getRoot().listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.dispose(); }
  // the surface everything stowed clears: this body, in this outfit
  const base = await panBase();
  const surf = [];
  for (const part of [base.bodyPart, ...base.parts]) for (let i = 0; i < part.pos.length; i += 3) surf.push([part.pos[i], part.pos[i + 1], part.pos[i + 2]]);
  addChain(doc, CHAINS.alidadeCord.names, CHAINS.alidadeCord.points, CHAINS.alidadeCord.parent);
  addSocket(doc, LANCE_SOCKET, 'spine_02');
  const backZ = (x, y) => { let z = 0; for (const q of surf) if (Math.abs(q[0] - x) < 0.03 && Math.abs(q[1] - y) < 0.03 && q[2] < z) z = q[2]; return z; };

  const pieces = [];
  const stowInfo = {};
  // ---- lance: 34° from vertical, the bob low at her left hip (+x), rising to her right
  {
    const ang = 34 * Math.PI / 180;
    const d = [-Math.sin(ang), Math.cos(ang), 0];
    const butt = [0.262, 0.64, 0];
    const L = LANCE.length;
    const need = [];
    for (let t = 0.05; t <= 0.85; t += 0.05) need.push([t, backZ(butt[0] + d[0] * L * t, butt[1] + d[1] * L * t) - 0.025 - LANCE.r - 0.004]);
    let best = null;
    for (let i = 0; i < need.length; i++) for (let j = i + 1; j < need.length; j++) {
      const [ta, za] = need[i], [tb, zb] = need[j];
      const b = (zb - za) / (tb - ta), a = za - b * ta;
      if (need.every(([t, z]) => a + b * t <= z + 1e-6)) {
        const gap = need.reduce((s, [t, z]) => s + (z - (a + b * t)), 0);
        if (!best || gap < best.gap) best = { a, b, gap };
      }
    }
    const start = [butt[0], butt[1], best.a];
    const end = [butt[0] + d[0] * L, butt[1] + d[1] * L, best.a + best.b];
    const [X, Y, Z] = basisY(v3.sub(end, start), [0, 0, -1]);
    pieces.push({ g: place(lanceGeo(cell, { lod: 1 }), X, Y, Z, start), joint: LANCE_SOCKET, bit: PIECE.lance });
    stowInfo.lance = { butt: start, tip: end, degFromVertical: 34, joint: LANCE_SOCKET, parent: 'spine_02' };
  }
  // ---- bow: the opposite diagonal beneath the lance, belly to her back, strung
  {
    const ang = 28 * Math.PI / 180;
    const d = [Math.sin(ang), Math.cos(ang), 0];
    const ctr = [-0.03, 1.40, 0];
    const half = 1.45 / 2;
    let z = 0;
    for (let t = -0.85; t <= 0.85; t += 0.1) z = Math.min(z, backZ(ctr[0] + d[0] * half * t, ctr[1] + d[1] * half * t));
    const c = [ctr[0], ctr[1], z - 0.016];
    const [X, Y, Z] = basisY(d, [0, 0, 1]);
    const g = merge(bowGeo(cell, { lod: 1 }), stringGeo(cell, { lod: 1, live: false }));
    pieces.push({ g: place(g, X, Y, Z, c), joint: 'spine_02', bit: PIECE.bow });
    stowInfo.bow = { centre: c, degFromVertical: 28, joint: 'spine_02' };
  }
  // ---- quiver: right hip, tilted 20° forward, out past the skirt
  {
    const ang = 20 * Math.PI / 180;
    const d = [0, Math.cos(ang), Math.sin(ang)];
    const ctr = [-0.276, 0.885, -0.060];
    const foot = v3.sub(ctr, v3.mul(d, QUIVER.length / 2));
    const [X, Y, Z] = basisY(d, [0, 0, 1]);
    pieces.push({ g: place(quiverGeo(cell), X, Y, Z, foot), joint: 'pelvis', bit: PIECE.quiver });
    const mouth = v3.add(foot, v3.mul(d, QUIVER.length + QUIVER.arrowOut * 0.6));
    stowInfo.quiver = { foot, mouth, nocks: mouth, joint: 'pelvis' };
  }
  // ---- bracer: left forearm, dorsal
  {
    const g = place(bracerGeo(cell, forearm.r + 0.005, 0.17), forearm.X, forearm.Y, forearm.Z, forearm.at);
    pieces.push({ g, joint: 'lowerarm_l', bit: PIECE.bracer });
    stowInfo.bracer = { at: forearm.at, r: forearm.r, joint: 'lowerarm_l' };
  }
  // ---- alidade: at the cord's end, across the sternum, on its neck cord
  {
    const at = CHAINS.alidadeCord.points[2];
    pieces.push({ g: place(alidadeGeo(cell), [1, 0, 0], [0, 1, 0], [0, 0, 1], [at[0], at[1] - 0.006, at[2] + 0.004]), joint: 'dyn_alidadeCord_02', bit: PIECE.alidade });
    stowInfo.alidade = { at, joint: 'dyn_alidadeCord_02' };
    const R = CHAINS.alidadeCord.points[0], M = CHAINS.alidadeCord.points[1];
    const top = [at[0], at[1] - 0.006 + 0.0095, at[2] + 0.004];
    const loop = [[0, 1.517, -0.121], [0.060, 1.512, -0.098], [0.080, 1.503, -0.042], [0.062, 1.490, 0.012], [0.030, 1.470, 0.052], R,
      [-0.030, 1.470, 0.052], [-0.062, 1.490, 0.012], [-0.080, 1.503, -0.042], [-0.060, 1.512, -0.098], [0, 1.517, -0.121]];
    const loopSkin = loop.map((q) => { const w = Math.max(0, Math.min(1, (1.500 - q[1]) / 0.045)); return [['neck_01', 1 - w], ['spine_03', w]]; });
    pieces.push({ ...cordGeo(loop, loopSkin, CORD_R, cell, 1, 4), bit: PIECE.alidade });
    const hang = [R, M, top];
    const hangSkin = [[['dyn_alidadeCord_01', 1]], [['dyn_alidadeCord_01', 0.5], ['dyn_alidadeCord_02', 0.5]], [['dyn_alidadeCord_02', 1]]];
    pieces.push({ ...cordGeo(hang, hangSkin, CORD_R, cell, 2, 4), bit: PIECE.alidade });
    stowInfo.alidadeCord = { loop: loop.length, hang: hang.length, r: CORD_R };
  }
  const all = G();
  const jnt = [], wgt = [], pid = [];
  for (const p of pieces) {
    merge(all, { ...p.g, bw: [] });
    if (p.skin) {
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
  const root = doc.getRoot();
  const buf = root.listBuffers()[0];
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const nrm = new Float32Array(all.nrm);
  for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();
  const TX = (s, data) => doc.createTexture(`weapon-${s}`).setImage(data).setMimeType('image/webp').setURI(`weapon-${s}.webp`);
  const mat = doc.createMaterial('MI_Armory_Atlas').setMetallicFactor(1).setRoughnessFactor(1).setDoubleSided(true)
    .setBaseColorTexture(TX('base', tex.base)).setNormalTexture(TX('normal', tex.normal)).setMetallicRoughnessTexture(TX('orm', tex.orm));
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(all.pos)))
    .setAttribute('NORMAL', acc('VEC3', nrm))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(all.uv)))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array(jnt)))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(wgt)))
    .setAttribute('_PIECE', acc('SCALAR', new Uint8Array(pid)))
    .setIndices(acc('SCALAR', new Uint32Array(all.idx)))
    .setMaterial(mat);
  const node = doc.createNode('StowKit').setMesh(doc.createMesh('StowKit').addPrimitive(prim)).setSkin(root.listSkins()[0]);
  nodeByName(doc, 'Armature').addChild(node);
  const S = BODY_HEIGHT / (yR[1] - yR[0]);
  return writeSkinned(doc, path.join(out, OUTPUTS[0]), {
    provenance: { recipe: RECIPE, sources: ['armory-generated', 'ubc-standard'], licence: 'project-original' },
    extras: { r5StowKit: { pieces: PIECE, stow: stowInfo, rawToGame: +S.toFixed(6), quiverNocksGame: stowInfo.quiver.nocks.map((v) => +(v * S).toFixed(4)), atlas: 'weapon' } },
  });
}
