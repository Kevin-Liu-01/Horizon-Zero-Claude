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
/** The quiver's hanger joint, a child of `pelvis` at the identity: src/hero/stowkit.js lets it hang from its upper band. */
export const QUIVER_SOCKET = 'stow_quiver';
export const QUIVER = { length: 0.52, r: 0.040, arrows: 12, arrowOut: 0.11 };

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
    const y0 = n * 0.13;
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
  for (const y of [0.15, 0.41]) {
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
function bracerGeo(cell, r = 0.036, len = 0.17, skinR = null) {
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
      const lip = i === 0 || i === ROWS ? 1.0015 : 0;
      // a stiff cuff, but it stands off the forearm under it everywhere: the skin never comes through
      // (W1 exit: 7.5 mm off her skin: it is laced over the outfit's wound forearm wrap, C-06)
      const rr = skinR ? Math.max(skinR(f, th) + 0.0075, r * 0.8) * (1 + 0.04 * Math.pow(Math.abs(f - 0.12), 1.5)) + lip * 0.002 : r * flare * (lip ? 1.012 : 1);
      shell.pos.push(x, y * rr, z * rr);
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
  // the crescent (W1 exit, judges: "the crescent bracer plate stands off her left forearm as a large black curved spike
  // ... like a claw blade"): a cast bronze plate LYING ON the bracer's back, low and close to the arm. Its two horns
  // point along the forearm, to the wrist and to the elbow; its belly bulges round the dorsal ridge; it stands 3.5 mm
  // proud of the leather with a bevelled edge, so it reads as a bronze plate on the cuff (the 64 px cue, bible §3.2,
  // by its bright bronze against the dark leather, not by a fin)
  const mix = (a, b, t) => a + (b - a) * t;
  const br = cell('bronzeCast');
  const NU = 16, x0 = len * 0.1, x1 = len * 0.9, half = (x1 - x0) / 2, midX = (x0 + x1) / 2;
  const A = 1.05, phi0 = -0.42;                          // the arc reach round the arm (rad) and where it starts
  const radAt = (f, th) => (skinR ? Math.max(skinR(f, th) + 0.0075, r * 0.8) * (1 + 0.04 * Math.pow(Math.abs(f - 0.12), 1.5)) : r);
  const pt = (x, ph, lift) => { const th = Math.PI / 2 + ph, rr = radAt(x / len, th) + lift; return [x, Math.sin(th) * rr, Math.cos(th) * rr]; };
  const plate = G();
  const rowsP = [[0, 0.0012], [0.12, 0.0035], [0.88, 0.0035], [1, 0.0012]];      // across: bevel, face, face, bevel
  for (let i = 0; i <= NU; i++) {
    const u = -1 + 2 * (i / NU), x = midX + u * half;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const outer = phi0 + A * s, inner = phi0 + A * 0.5 * Math.pow(s, 1.25);
    for (const [f, lift] of rowsP) {
      const ph = mix(inner, outer, f);
      const q = pt(x, ph, lift);
      plate.pos.push(...q);
      plate.nrm.push(0, Math.sin(Math.PI / 2 + ph), Math.cos(Math.PI / 2 + ph));
      plate.uv.push(br[0] + br[2] * (i / NU), br[1] + br[3] * f);
    }
  }
  for (let i = 0; i < NU; i++) for (let k = 0; k < rowsP.length - 1; k++) {
    const a = i * rowsP.length + k, b = a + 1, c = a + rowsP.length, d = c + 1;
    plate.idx.push(a, c, b, b, c, d);
  }
  merge(g, plate);
  // two bronze rivets through it into the leather
  for (const u of [-0.42, 0.42]) {
    const x = midX + u * half, s = Math.sqrt(1 - u * u), ph = phi0 + A * 0.75 * s;
    const c0 = pt(x, ph, 0.0035), n = v3.norm([0, Math.sin(Math.PI / 2 + ph), Math.cos(Math.PI / 2 + ph)]);
    const [X, , Z] = basisY(n, [1, 0, 0]);
    merge(g, place(lathe([[0.0001, 0.0018], [0.0028, 0.0012], [0.0032, 0]], { sides: 6, rect: cell('brass') }), X, n, Z, c0));
  }
  return g;
}

const CORD_R = 0.0022;
/**
 * A cord through the points P (armory W1: the alidade's neck cord read a tier below the new wrap; it was a square
 * tube on a polygon). The path is a Catmull-Rom curve through P (`per` samples a span), the section a hexagon, and
 * the texture runs along it every 9 mm (mirrored), so the three plies' twist reads on the trim cell.
 */
function cordGeo(P, skins, r, cell, per = 1, ring = 6) {
  const g = G(), skin = [];
  const rect = cell('cord');
  const pts = [], sk = [];
  const cr = (i) => P[Math.max(0, Math.min(P.length - 1, i))];
  for (let i = 0; i < P.length - 1; i++) {
    for (let k = 0; k < per; k++) {
      const f = k / per, p0 = cr(i - 1), a = P[i], b = P[i + 1], p3 = cr(i + 2);
      const f2 = f * f, f3 = f2 * f;
      pts.push([0, 1, 2].map((c) => 0.5 * (2 * a[c] + (-p0[c] + b[c]) * f + (2 * p0[c] - 5 * a[c] + 4 * b[c] - p3[c]) * f2 + (-p0[c] + 3 * a[c] - 3 * b[c] + p3[c]) * f3)));
      const m = new Map();
      for (const [n, w] of skins[i]) m.set(n, (m.get(n) || 0) + w * (1 - f));
      for (const [n, w] of skins[i + 1]) m.set(n, (m.get(n) || 0) + w * f);
      sk.push([...m.entries()].filter(([, w]) => w > 1e-4).sort((x, y) => y[1] - x[1]).slice(0, 4));
    }
  }
  pts.push(P[P.length - 1]); sk.push(skins[skins.length - 1]);
  const n = pts.length;
  let arc = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) arc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    const vv = Math.abs(((arc / 0.009) % 2) - 1);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const t = v3.norm(v3.sub(b, a));
    const ref = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const sd = v3.norm(v3.cross(t, ref)), up = v3.cross(sd, t);
    for (let k = 0; k <= ring; k++) {
      const th = (k / ring) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const nr = [sd[0] * c + up[0] * s, sd[1] * c + up[1] * s, sd[2] * c + up[2] * s];
      g.pos.push(pts[i][0] + nr[0] * r, pts[i][1] + nr[1] * r, pts[i][2] + nr[2] * r);
      g.nrm.push(...nr);
      g.uv.push(rect[0] + (k / ring) * rect[2], rect[1] + vv * rect[3]);
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
  const tube = lathe([[0.0085, -0.03], [0.0098, -0.028], [0.0098, -0.024], [0.0080, -0.022], [0.0080, 0.022], [0.0098, 0.024], [0.0098, 0.028], [0.0085, 0.03]], { sides: 12, rect: cell('brass'), cap0: true, cap1: true });
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
  addSocket(doc, QUIVER_SOCKET, 'pelvis');
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
    for (let t = 0.05; t <= 0.85; t += 0.05) need.push([t, backZ(butt[0] + d[0] * L * t, butt[1] + d[1] * L * t) - 0.04 - LANCE.r - 0.004]);
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
    // low and flatter than the lance: only the limb's thin upper end reaches head height, so the
    // chase camera (A-stow-clearance) and the wrap tail (A-tail-legible) have the head clear of the stave
    const ang = 36 * Math.PI / 180;
    const d = [Math.sin(ang), Math.cos(ang), 0];
    const ctr = [-0.02, 1.24, 0];
    const half = 1.45 / 2;
    let z = 0;
    for (let t = -0.85; t <= 0.85; t += 0.1) z = Math.min(z, backZ(ctr[0] + d[0] * half * t, ctr[1] + d[1] * half * t));
    const c = [ctr[0], ctr[1], z - 0.016];
    const [X, Y, Z] = basisY(d, [0, 0, 1]);
    const g = merge(bowGeo(cell, { lod: 1 }), stringGeo(cell, { lod: 1, live: false }));
    pieces.push({ g: place(g, X, Y, Z, c), joint: 'spine_02', bit: PIECE.bow });
    stowInfo.bow = { centre: c, degFromVertical: 36, joint: 'spine_02' };
  }
  // ---- quiver: right hip, tilted 20° forward, out past the skirt
  {
    const ang = 20 * Math.PI / 180;
    const d = [0, Math.cos(ang), Math.sin(ang)];
    const ctr = [-0.315, 0.925, -0.135];
    const foot = v3.sub(ctr, v3.mul(d, QUIVER.length / 2));
    const [X, Y, Z] = basisY(d, [0, 0, 1]);
    pieces.push({ g: place(quiverGeo(cell), X, Y, Z, foot), joint: QUIVER_SOCKET, bit: PIECE.quiver });
    const mouth = v3.add(foot, v3.mul(d, QUIVER.length + QUIVER.arrowOut * 0.6));
    // it hangs from the upper band (0.47 up the tube): the mouth barely moves, so the nock reach holds
    const hang = v3.add(foot, v3.mul(d, 0.41));
    stowInfo.quiver = { foot, mouth, nocks: mouth, hang, hangK: +(0.41 / (QUIVER.length + QUIVER.arrowOut)).toFixed(4), joint: QUIVER_SOCKET, parent: 'pelvis' };
  }
  // ---- bracer: left forearm, dorsal
  {
    // the forearm's radius per (along, around), low-passed: what the stiff cuff has to clear
    const NF = 9, NT = 13;
    const tab = new Float64Array(NF * NT);
    {
      const bp = base.bodyPart.pos;
      for (let i = 0; i < bp.length; i += 3) {
        const rel = v3.sub([bp[i], bp[i + 1], bp[i + 2]], forearm.at);
        const t = v3.dot(rel, forearm.X) / 0.17;
        if (t < -0.15 || t > 1.15) continue;
        const y = v3.dot(rel, forearm.Y), z = v3.dot(rel, forearm.Z), rr = Math.hypot(y, z);
        if (rr > 0.08) continue;
        const ph = Math.atan2(y, z);
        for (let a = 0; a < NF; a++) for (let b = 0; b < NT; b++) {
          const f = a / (NF - 1), th = -0.2 * Math.PI + (b / (NT - 1)) * 1.4 * Math.PI;
          let dA = Math.abs(ph - th); dA = Math.min(dA % (2 * Math.PI), 2 * Math.PI - (dA % (2 * Math.PI)));
          if (Math.abs(t - f) < 0.16 && dA < 0.5 && rr > tab[a * NT + b]) tab[a * NT + b] = rr;
        }
      }
    }
    const skinR = (f, th) => {
      const a = Math.min(NF - 1, Math.max(0, Math.round(f * (NF - 1))));
      const b = Math.min(NT - 1, Math.max(0, Math.round(((th + 0.2 * Math.PI) / (1.4 * Math.PI)) * (NT - 1))));
      return tab[a * NT + b] || forearm.r;
    };
    const g = place(bracerGeo(cell, forearm.r + 0.005, 0.17, skinR), forearm.X, forearm.Y, forearm.Z, forearm.at);
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
    pieces.push({ ...cordGeo(loop, loopSkin, CORD_R, cell, 4, 6), bit: PIECE.alidade });
    const hang = [R, M, top];
    const hangSkin = [[['dyn_alidadeCord_01', 1]], [['dyn_alidadeCord_01', 0.5], ['dyn_alidadeCord_02', 0.5]], [['dyn_alidadeCord_02', 1]]];
    pieces.push({ ...cordGeo(hang, hangSkin, CORD_R, cell, 4, 6), bit: PIECE.alidade });
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
