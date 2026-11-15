/**
 * CALIMA — armor recipes: the Starter rung's own pieces, built to Kevin's Nov 13 turnaround (armory M1.2d).
 *
 *   gloveShell     fingerless leather gloves: a shell of Brea's own hand skin (her weights, 1.5 mm out), cut at the
 *                  middle of each first finger bone and of the thumb, its openings rolled into a real edge
 *   scarfCowl      the violet neck scarf: a bunched cowl round the throat, low in a soft V on the chest
 *   hangPanel      a long hip-sash panel hanging from under the belt to below the knee, its hem torn ragged
 *   rimTubes       a rolled edge round every open edge of a sheet: no cloth piece ends in a paper edge
 *   slungBelt      the second belt, slung low and slanted across the hips
 *   pouchOn        a soft leather pouch hung off a belt (belly, gusset, flap, loops, a toggle)
 *   latheAt        a profile turned about an axis (plates, studs, rivets, the case), rigid on one skin
 *   squarePlate    the harness's square brass plate at the crossing: bevelled, a raised diamond, a stud, four rivets
 *   caseTube       the survey (kite) case: a leather tube with brass end caps and two straps round it
 *
 * Bind space as the rest of armor/lib: +Y up, +Z her front, +X her left; bearings 0 = +X, PI/2 = +Z.
 * Deterministic, procedural, project-original.
 */
import { V, clamp, mix, sstep, recomputeNormals, Field } from './part.mjs';
import { TAU, orientOut } from './garment.mjs';
import { tubeInto, openEdges, softSheet } from './smock.mjs';
import { noise3 } from '../../lib/human/face.mjs';

const fold01 = (n) => Math.abs(2 * n - 1);
const mirror = (u) => Math.abs(((u % 1) + 1) % 1 * 2 - 1);

/* ------------------------------------------------------------------ gloves */

/**
 * Fingerless gloves on one hand. `body` is Brea's own body part (lib/breabody.mjs: pos, nrm, jnt, wgt, idx), `jp(name)`
 * a joint's bind position. Every body triangle inside the glove is copied 1.5 mm out along its normals with the body's
 * own skin, so the glove can never part from the hand in any pose. uv: around the hand (mirrored, so the seam never
 * smears) x along it from the cuff (v = 0) to the finger openings (v = 1), inside a trim cell.
 */
export function gloveShell(part, body, jp, { side = 'l', off = 0.0015, rect, cuff = 0.03 } = {}) {
  const sgn = side === 'l' ? 1 : -1;
  const hand = jp(`hand_${side}`), arm = jp(`lowerarm_${side}`);
  const X = V.norm(V.sub(hand, arm));
  const Y = [0, 1, 0], Z = V.norm(V.cross(X, Y));
  const t2 = jp(`thumb_02_${side}`), t3 = jp(`thumb_03_${side}`);
  const tD = V.sub(t3, t2), tL = V.len(tD), tX = V.norm(tD);
  // the finger openings: half way along each first finger bone (index and middle at 0.107 m past the wrist joint, the
  // pinky's shorter bone at 0.087), and half way along the thumb's last bone but one
  const lim = (z) => mix(0.087, 0.107, sstep(-0.09, -0.05, z));
  const n = body.pos.length / 3;
  const along = new Float64Array(n), inside = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = [body.pos[i * 3], body.pos[i * 3 + 1], body.pos[i * 3 + 2]];
    if (Math.sign(p[0]) !== sgn || Math.abs(p[0]) < Math.abs(arm[0]) + 0.1) continue;
    const d = V.sub(p, hand), a = V.dot(d, X);
    along[i] = a;
    if (a < -cuff || a > lim(p[2])) continue;
    const dt = V.sub(p, t2), s = V.dot(dt, tX) / tL, perp = V.len(V.sub(dt, V.mul(tX, s * tL)));
    if (s > 0.5 && perp < 0.017) continue;                 // the thumb's end is bare
    inside[i] = 1;
  }
  const map = new Int32Array(n).fill(-1);
  const base = part.pos.length / 3;
  let count = 0;
  for (let t = 0; t < body.idx.length; t += 3) {
    const a = body.idx[t], b = body.idx[t + 1], c = body.idx[t + 2];
    if (!inside[a] || !inside[b] || !inside[c]) continue;
    for (const i of [a, b, c]) {
      if (map[i] >= 0) continue;
      map[i] = base + count++;
      const p = [body.pos[i * 3], body.pos[i * 3 + 1], body.pos[i * 3 + 2]], nn = [body.nrm[i * 3], body.nrm[i * 3 + 1], body.nrm[i * 3 + 2]];
      part.pos.push(p[0] + nn[0] * off, p[1] + nn[1] * off, p[2] + nn[2] * off);
      part.nrm.push(...nn);
      const d = V.sub(p, hand);
      const ang = Math.atan2(V.dot(d, Z), V.dot(d, Y));
      part.uv.push(rect[0] + rect[2] * mirror(ang / TAU * 1.5), rect[1] + rect[3] * clamp((along[i] + cuff) / (cuff + 0.107)));
      for (let k = 0; k < 4; k++) { part.jnt.push(body.jnt[i * 4 + k]); part.wgt.push(body.wgt[i * 4 + k]); }
    }
    part.idx.push(map[a], map[b], map[c]);
  }
  return part;
}

/* ------------------------------------------------------------------ rolled edges */

/**
 * A rolled hem round every open edge of `sheet` (loops of 4 or more points), into `into` (a trim part): a tube of
 * radius `r` centred on the edge, so the edge reads `2 r` thick. Skin from the sheet itself.
 */
export function rimTubes(into, sheet, { r = 0.0016, rect, sides = 4, minLen = 4, tile = 0.12, skip = null, inset = 0 } = {}) {
  const skin = new Field([sheet], 0.03);
  for (const run of openEdges(sheet)) {
    if (run.length < minLen) continue;
    const pts = run.map((q) => (inset ? V.sub(q.p, V.mul(V.norm(q.n), inset)) : q.p.slice()));
    if (skip && pts.every((p) => skip(p))) continue;
    const closed = V.len(V.sub(run[0].p, run[run.length - 1].p)) < 0.02 && run.length > 6;
    tubeInto(into, pts, r, { sides, closed, rect, skin, tile });
  }
  return into;
}

/* ------------------------------------------------------------------ the scarf */

/**
 * The neck scarf: a cowl wound round the throat, bunched in soft horizontal folds, lying low in a V over the chest in
 * front and high at the nape. `field` the surfaces under it (her body, the top, the harness), `J(name)` joint index.
 * A sheet part (metric uv: u round the neck from the nape, v down from the top edge).
 */
export function scarfCowl(part, field, J, { cols = 44, rows = 14, cz = -0.035, seed = 2, vDrop = 0.046, turns = 2.6, turnAmp = 0.011 } = {}) {
  // (M1.2d fix round 1, the judge: "the scarf is a smooth bib like a half-disc with a hard rim, covering the upper chest"): it sits
  // at the throat, its front only 4.6 cm lower than its sides (7.4 before), wound in 2.6 turns that roll round it on a slant, each a
  // soft bulge 11 mm proud of the valley between them, with vertical gathers, and its lower edge rolled under, not cut off
  const yBot = (th) => 1.486 - vDrop * Math.max(0, Math.sin(th)) ** 2 + 0.006 * Math.max(0, -Math.sin(th));
  const yTop = (th) => 1.542 - 0.02 * Math.max(0, Math.sin(th)) ** 2 + 0.008 * Math.max(0, -Math.sin(th));
  const keep = (q) => Math.abs(q.x) < 0.12;
  const R = [];
  for (let r = 0; r <= rows; r++) {
    const row = [];
    for (let c = 0; c <= cols; c++) {
      const th = -Math.PI / 2 + TAU * (c % cols) / cols;
      const t = r / rows, y = mix(yTop(th), yBot(th), t);
      const rb = field.radial(y, th, 0, cz, 0.008, 0.22, keep) || 0.06;
      // bunched: thicker low (three turns of cloth), horizontal folds round it, a few vertical gathers
      const fz = 0.003 * fold01(noise3(th * 1.8 + seed, y * 62, 3.1)) + 0.003 * fold01(noise3(th * 5.2, y * 12, 7.7 + seed))
        + turnAmp * (0.5 + 0.5 * Math.cos(TAU * (t * turns + 0.12 * Math.sin(th + seed) + 0.05 * noise3(th * 2.4, seed, 1.3))))
        + 0.0035 * Math.max(0, Math.sin(th * 7 + seed + 2.1 * noise3(th, y * 20, 5))) * sstep(0.2, 0.9, t);
      // a cowl lies round the neck: it never spreads out over the shoulders as a collar would (the shoulders' slope is
      // under its lowest turn, not in its radius)
      const rMax = 0.064 + 0.5 * Math.max(0, 1.5 - y) + 0.026 * Math.max(0, Math.sin(th)) ** 2;
      // (and never closer than 11 mm to what it covers: capped tight at the sides, the posed neck and trapezius came
      // through it in F13 and the scarf showed as a thin collar)
      row.push(Math.max(Math.min(rb + mix(0.012, 0.024, sstep(0.15, 0.85, t)), rMax + mix(0.008, 0.016, t)), rb + 0.011) + fz);
    }
    R.push(row);
  }
  // cloth falls: going down a row it never comes back in by more than 2 mm, and the bottom row lies out over what it covers
  for (let r = 1; r <= rows; r++) for (let c = 0; c <= cols; c++) R[r][c] = Math.max(R[r][c], R[r - 1][c] - 0.0032);
  // the lower edge rolls under: the last row tucks 6 mm in under a lip 2.5 mm proud, so the edge reads as a turned roll of cloth
  for (let c = 0; c <= cols; c++) { R[rows - 1][c] += 0.0025; R[rows][c] -= 0.006; }
  // round the neck, low-passed (no shoulder strap prints through)
  for (let r = 0; r <= rows; r++) for (let s = 0; s < 2; s++) {
    const o = R[r].slice();
    for (let c = 0; c <= cols; c++) R[r][c] = (o[(c - 1 + cols) % cols] + 2 * o[c % cols] + o[(c + 1) % cols]) / 4;
  }
  const base = part.pos.length / 3;
  const jN = J('neck_01'), jS = J('spine_03'), jCl = J('clavicle_l'), jCr = J('clavicle_r');
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    const th = -Math.PI / 2 + TAU * c / cols, t = r / rows, y = mix(yTop(th), yBot(th), t);
    const rr = R[r][c];
    const p = [Math.cos(th) * rr, y, cz + Math.sin(th) * rr];
    part.pos.push(...p); part.nrm.push(Math.cos(th), 0, Math.sin(th));
    part.uv.push((c / cols) * TAU * 0.075, yTop(th) - y);
    const wn = sstep(1.47, 1.535, y), cl = (1 - wn) * 0.3 * Math.abs(Math.cos(th));
    part.jnt.push(jN, jS, Math.cos(th) >= 0 ? jCl : jCr, 0); part.wgt.push(wn, 1 - wn - cl, cl, 0);
  }
  const cc = cols + 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = base + r * cc + c, b = a + 1, d = a + cc, e = d + 1;
    part.idx.push(a, b, d, b, e, d);
  }
  recomputeNormals(part);
  part.scarf = { cz, yTop, yBot };
  return part;
}

/* ------------------------------------------------------------------ the sash panels */

/**
 * One long panel of the hip sash, hanging from `yTop` (under the belt) to `yHem`, centred on bearing `thC`, `halfW`
 * metres either side at its top, narrowing by `narrow` at the hem. Below `floorY` it hangs straight down (the radius it
 * had there, plus `flare`), never following the leg in. The hem is torn: every column ends at its own height, `rag`
 * deep. Skin: the pelvis at the top, the thigh it hangs over taking `thighW` of it at the hem (`side`: 'l', 'r', or
 * 'c' shared by x). A sheet part: u across in metres, v down from its top.
 */
export function hangPanel(part, field, J, { thC, halfW = 0.09, narrow = 0.15, yTop = 1.075, yHem = 0.42, floorY = 0.82, off = 0.012, flare = 0.05, rows = 12, cols = 8, rag = 0.04, seed = 0, side = 'c', thighW = 0.6, rRef = 0.17, chain = null } = {}) {
  const cz = -0.02;
  const jP = J('pelvis'), jL = J('thigh_l'), jR = J('thigh_r');
  const hem = (c) => {
    const u = c / cols;
    // torn: a long tooth here and there, a short one beside it; the outer corners worn shorter
    const n1 = noise3(c * 1.37 + seed * 5.1, 0.7, 2.3), n2 = noise3(c * 0.41 + seed, 4.1, 8.8);
    const tooth = (c % 2 ? -0.55 : 0.25) * rag + (n1 - 0.5) * 1.3 * rag + (n2 > 0.66 ? -0.9 * rag : 0);
    return yHem + tooth + 0.6 * rag * (2 * Math.abs(u - 0.5)) ** 3;
  };
  const prev = new Float64Array(cols + 1);
  const rowsR = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const row = [];
    for (let c = 0; c <= cols; c++) {
      const y = r === rows ? hem(c) : mix(yTop, yHem, t);
      const w = halfW * (1 - narrow * t);
      const th = thC + ((c / cols) * 2 - 1) * w / rRef;
      let rad = (field.radial(Math.max(y, floorY), th, 0, cz, 0.02, 0.1) || rRef) + off;
      if (r > 0) rad = Math.max(rad, prev[c] + flare * (yTop - yHem) / rows);
      // modelled folds, hanging straight; outward only, deeper low down
      rad += 0.007 * fold01(noise3(((c / cols) * 2 - 1) * w * 9 + seed * 3.3, y * 1.6, 4.4 + seed)) * sstep(0.05, 0.6, t);
      prev[c] = rad;
      row.push({ th, y, rad });
    }
    rowsR.push(row);
  }
  const base = part.pos.length / 3;
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    const { th, y, rad } = rowsR[r][c];
    const p = [Math.cos(th) * rad, y, cz + Math.sin(th) * rad];
    part.pos.push(...p); part.nrm.push(Math.cos(th), 0, Math.sin(th));
    part.uv.push((c / cols) * 2 * halfW, yTop - y);
    const k = thighW * sstep(0.97, yHem + 0.05, y);
    if (chain) {
      // M1.2e (hero-anim): the panel hangs on its own cloth chain (brea.mjs CHAINS.panel*): each span between two of
      // the chain's joints rides the upper one, blended over a quarter span either side of each joint; the belt row
      // stays on the pelvis. The legs push the chain (the animator's thigh and shin colliders), not the skin
      const [j4, w4] = chainSkin(chain, y, jP);
      part.jnt.push(...j4); part.wgt.push(...w4);
    } else if (side === 'c') {
      const s = sstep(-0.04, 0.04, p[0]);
      part.jnt.push(jP, jL, jR, 0); part.wgt.push(1 - k, k * s, k * (1 - s), 0);
    } else {
      part.jnt.push(jP, side === 'l' ? jL : jR, 0, 0); part.wgt.push(1 - k, k, 0, 0);
    }
  }
  // (rows run down, columns round her: (a, b, d) faces out. Wound per panel, never by orientOut over the whole part,
  // which flipped a panel that was right when the next two were added; the game draws front faces only)
  const cc = cols + 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = base + r * cc + c, b = a + 1, d = a + cc, e = d + 1;
    part.idx.push(a, b, d, b, e, d);
  }
  (part.panels ||= []).push({ thC, rRef, yTop, yHem, halfW, seed });
  return part;
}

/**
 * M1.2e (hero-anim): a hanging sheet's skin at height `y` on a cloth chain `{ joints, ys }` (joint indices root first,
 * and the joints' heights with the terminator's last): the span below joint i rides joint i, blended linearly with
 * the joint above over a quarter span either side of each joint; above the root the pelvis takes over within 3 cm.
 */
export function chainSkin({ joints, ys }, y, jP) {
  const n = joints.length;
  if (y >= ys[0]) return [[jP, joints[0], 0, 0], [1, 0, 0, 0]];
  if (y > ys[0] - 0.03) { const f = (ys[0] - y) / 0.03; return [[jP, joints[0], 0, 0], [1 - f, f, 0, 0]]; }
  let i = 0;
  while (i < n - 1 && y < ys[i + 1]) i++;
  const span = ys[i] - ys[i + 1], f = (ys[i] - y) / span;
  if (f < 0.25 && i > 0) { const b = 0.5 + 2 * f; return [[joints[i], joints[i - 1], 0, 0], [b, 1 - b, 0, 0]]; }
  if (f > 0.75 && i < n - 1) { const b = 0.5 + 2 * (1 - f); return [[joints[i], joints[i + 1], 0, 0], [b, 1 - b, 0, 0]]; }
  return [[joints[i], 0, 0, 0], [1, 0, 0, 0]];
}

/**
 * The other face of a free-hanging sheet (the game draws front faces only): every vertex again, `inset` behind the
 * sheet along its normal, the normal turned round, the triangles wound the other way, into `into` (a trim part, so the
 * sheet's packing is not doubled). `into.uv` is filled from the sheet's packed uvs by `backUVs` once the sheet is laid
 * out; until then it carries the sheet's own.
 */
export function backFaces(into, sheet, { inset = 0.0011 } = {}) {
  const base = into.pos.length / 3, n = sheet.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const nn = [sheet.nrm[i * 3], sheet.nrm[i * 3 + 1], sheet.nrm[i * 3 + 2]];
    into.pos.push(sheet.pos[i * 3] - nn[0] * inset, sheet.pos[i * 3 + 1] - nn[1] * inset, sheet.pos[i * 3 + 2] - nn[2] * inset);
    into.nrm.push(-nn[0], -nn[1], -nn[2]);
    into.uv.push(sheet.uv[i * 2], sheet.uv[i * 2 + 1]);
    for (let k = 0; k < 4; k++) { into.jnt.push(sheet.jnt[i * 4 + k]); into.wgt.push(sheet.wgt[i * 4 + k]); }
  }
  for (let t = 0; t < sheet.idx.length; t += 3) into.idx.push(base + sheet.idx[t], base + sheet.idx[t + 2], base + sheet.idx[t + 1]);
  (sheet.backs ||= []).push({ part: into, base, n });
  return into;
}

/** After packing: every back face takes its sheet's packed uvs. */
export function backUVs(sheets) {
  for (const s of sheets) for (const b of s.backs || []) for (let i = 0; i < b.n * 2; i++) b.part.uv[b.base * 2 + i] = s.uvNew[i];
}

/* ------------------------------------------------------------------ the slung belt */

/**
 * A stiff belt ring whose height runs round her: `y0 + amp * cos(th - phi)` (lowest where `th = phi + PI` for amp > 0).
 * As garment.mjs beltRing, read from the surface under it at its own height in every column.
 */
export function slungBelt(part, surf, skin, { y0 = 1.04, amp = 0.03, phi = 0, h = 0.042, off = 0.016, cols = 48, rect, lip = 0.003, thick = 0.004, skinIn = 0.02 } = {}) {
  const cz = -0.02;
  const prof = [[-0.5, -lip * 0.5], [-0.5, thick * 0.7], [-0.38, thick], [0.38, thick], [0.5, thick * 0.7], [0.5, -lip * 0.5]];
  const yc = (th) => y0 + amp * Math.cos(th - phi);
  const thAt = (c) => -Math.PI / 2 + TAU * (c % cols) / cols;
  const rT = [], rB = [];
  for (let c = 0; c <= cols; c++) {
    const th = thAt(c);
    rT.push(surf.radial(yc(th) + h / 2, th, 0, cz, 0.012, 0.16) || 0.16);
    rB.push(surf.radial(yc(th) - h / 2, th, 0, cz, 0.012, 0.16) || 0.16);
  }
  for (const R of [rT, rB]) for (let s = 0; s < 3; s++) {
    const o = R.slice();
    for (let c = 0; c < cols; c++) R[c] = (o[(c - 1 + cols) % cols] + 2 * o[c] + o[(c + 1) % cols]) / 4;
    R[cols] = R[0];
  }
  const base = part.pos.length / 3;
  for (let r = 0; r < prof.length; r++) for (let c = 0; c <= cols; c++) {
    const th = thAt(c), [f, o] = prof[r];
    const rad = Math.max(rT[c], rB[c]) * 0.6 + mix(rB[c], rT[c], f + 0.5) * 0.4 + off + o;
    const y = yc(th) + f * h;
    const p = [Math.cos(th) * rad, y, cz + Math.sin(th) * rad];
    part.pos.push(...p); part.nrm.push(Math.cos(th), 0, Math.sin(th));
    part.uv.push(rect[0] + rect[2] * (c / cols), rect[1] + rect[3] * clamp(0.5 - f));
    const rs = (rT[c] + rB[c]) / 2 + off - skinIn;
    const s = skin.skin(Math.cos(th) * rs, yc(th), cz + Math.sin(th) * rs, 4);
    part.jnt.push(...s.j); part.wgt.push(...s.w);
  }
  const cc = cols + 1;
  for (let r = 0; r < prof.length - 1; r++) for (let c = 0; c < cols; c++) {
    const a = base + r * cc + c, b = a + 1, d = a + cc, e = d + 1;
    part.idx.push(a, b, d, b, e, d);
  }
  orientOut(part);
  return { yc, rAt: (th) => { const c = Math.round(((th + Math.PI / 2) / TAU) * cols); const k = ((c % cols) + cols) % cols; return Math.max(rT[k], rB[k]) + off + thick; } };
}

/* ------------------------------------------------------------------ pouches */

/**
 * A soft leather pouch hung off a belt: centre `pc`, its frame [X along her side, up, Z out]; belly and gusset, a flap
 * over the top, two belt loops up over the belt, a brass toggle. Rigid on `joint` then re-skinned from `skinField`.
 */
export function pouchOn(part, pc, [pX, pY, pZ], { hw = 0.036, hh = 0.042, d = 0.011, rect, loopRect, brass, joint, skinField = null }) {
  const v0 = part.pos.length / 3;
  softSheet(part, pc, [pX, pY, pZ], { hw, hh, belly: d * 0.9, edge: d * 0.35, nu: 4, nv: 4, rect, joint, round: 0.62 });
  const Nr = 12, rim = [];
  for (let k = 0; k < Nr; k++) {
    const a = (k / Nr) * TAU, u = Math.cos(a), v = Math.sin(a);
    const m = Math.max(Math.abs(u), Math.abs(v)); const uu = u / m, vv = v / m;
    rim.push([uu * mix(1, Math.sqrt(1 - 0.5 * vv * vv), 0.62) * hw, vv * mix(1, Math.sqrt(1 - 0.5 * uu * uu), 0.62) * hh]);
  }
  const b0 = part.pos.length / 3;
  for (const [sx, sy] of rim) for (const dz of [d * 0.35, -d * 0.6]) {
    const q = V.add(V.add(V.add(pc, V.mul(pX, sx)), V.mul(pY, sy)), V.mul(pZ, dz));
    part.pos.push(...q); part.nrm.push(...V.norm(V.add(V.mul(pX, sx), V.mul(pY, sy))));
    part.uv.push(rect[0] + rect[2] * 0.02, rect[1] + rect[3] * (0.5 + 0.48 * Math.sign(dz)));
    part.jnt.push(joint, 0, 0, 0); part.wgt.push(1, 0, 0, 0);
  }
  for (let k = 0; k < Nr; k++) { const a = b0 + k * 2, b = a + 1, c = b0 + ((k + 1) % Nr) * 2, e = c + 1; part.idx.push(a, b, c, b, e, c); }
  const flapC = V.add(V.add(pc, V.mul(pY, hh * 0.42)), V.mul(pZ, d * 0.35 + 0.012));
  const fZ = V.norm(V.add(pZ, V.mul(pY, 0.16)));
  softSheet(part, flapC, [pX, V.norm(V.cross(fZ, pX)), fZ], { hw: hw * 1.06, hh: hh * 0.6, belly: 0.004, nu: 4, nv: 2, rect, joint, round: 0.28, bottomRound: 0.9 });
  for (const s of [-1, 1]) {
    const lp = V.add(V.add(pc, V.mul(pX, s * hw * 0.6)), V.add(V.mul(pY, hh + 0.017), V.mul(pZ, -0.003)));
    const q = V.add(lp, [0, 0, 0]);
    // a belt loop: a flat strap, 7 mm wide, up over the belt
    softSheet(part, q, [pX, pY, pZ], { hw: 0.0072, hh: 0.022, belly: 0.0012, nu: 1, nv: 2, rect: loopRect, joint, round: 0.1 });
  }
  const tg = V.add(V.add(pc, V.mul(pY, -hh * 0.14)), V.mul(pZ, d * 0.35 + 0.015));
  tubeInto(part, [V.add(tg, V.mul(pX, -0.008)), tg, V.add(tg, V.mul(pX, 0.008))], 0.0038, { sides: 6, rect: brass, joint, radiusAt: (u) => 0.74 + 0.5 * Math.sin(u * Math.PI) });
  if (skinField) {
    const sk = skinField.skin(pc[0], pc[1], pc[2], 4);
    for (let i = v0 * 4; i < part.jnt.length; i += 4) for (let k = 0; k < 4; k++) { part.jnt[i + k] = sk.j[k]; part.wgt[i + k] = sk.w[k]; }
  }
  return part;
}

/* ------------------------------------------------------------------ turned pieces */

/**
 * A profile `prof` = [[radius, height], ...] turned about axis `n` through `c` with `sides` faces (4 = square,
 * `phase` turns it), rigid on skin `sk` ({ j, w }). uv: u round, v along the profile, inside `rect`.
 */
export function latheAt(part, c, n, up, prof, { sides = 8, phase = 0, rect, sk, flatShade = false } = {}) {
  const N = V.norm(n);
  const A = V.norm(V.sub(up, V.mul(N, V.dot(up, N)))), B = V.cross(N, A);
  const base = part.pos.length / 3;
  const ring = (k) => phase + (k / sides) * TAU;
  if (!flatShade) {
    for (let r = 0; r < prof.length; r++) for (let k = 0; k <= sides; k++) {
      const a = ring(k), [rr, h] = prof[r];
      const dir = V.add(V.mul(A, Math.cos(a)), V.mul(B, Math.sin(a)));
      part.pos.push(...V.add(V.add(c, V.mul(dir, rr)), V.mul(N, h)));
      const r0 = prof[Math.max(0, r - 1)], r1 = prof[Math.min(prof.length - 1, r + 1)];
      const dr = r1[0] - r0[0], dh = r1[1] - r0[1];
      part.nrm.push(...V.norm(V.add(V.mul(dir, dh), V.mul(N, -dr))));
      part.uv.push(rect[0] + rect[2] * (k / sides), rect[1] + rect[3] * (r / Math.max(1, prof.length - 1)));
      part.jnt.push(...sk.j); part.wgt.push(...sk.w);
    }
    const cc = sides + 1;
    for (let r = 0; r < prof.length - 1; r++) for (let k = 0; k < sides; k++) {
      const a = base + r * cc + k, b = a + 1, d = a + cc, e = d + 1;
      part.idx.push(a, b, d, b, e, d);
    }
    return part;
  }
  // flat faces: each side its own quad strip (a square plate's sides stay flat)
  for (let k = 0; k < sides; k++) {
    const a0 = ring(k), a1 = ring(k + 1), am = (a0 + a1) / 2;
    const d0 = V.add(V.mul(A, Math.cos(a0)), V.mul(B, Math.sin(a0))), d1 = V.add(V.mul(A, Math.cos(a1)), V.mul(B, Math.sin(a1)));
    const dm = V.add(V.mul(A, Math.cos(am)), V.mul(B, Math.sin(am)));
    const b0 = part.pos.length / 3;
    for (let r = 0; r < prof.length; r++) {
      const [rr, h] = prof[r];
      const r0 = prof[Math.max(0, r - 1)], r1 = prof[Math.min(prof.length - 1, r + 1)];
      const nr = V.norm(V.add(V.mul(dm, r1[1] - r0[1]), V.mul(N, -(r1[0] - r0[0]))));
      for (const [d, u] of [[d0, 0], [d1, 1]]) {
        part.pos.push(...V.add(V.add(c, V.mul(d, rr)), V.mul(N, h)));
        part.nrm.push(...nr);
        part.uv.push(rect[0] + rect[2] * u, rect[1] + rect[3] * (r / Math.max(1, prof.length - 1)));
        part.jnt.push(...sk.j); part.wgt.push(...sk.w);
      }
    }
    for (let r = 0; r < prof.length - 1; r++) {
      const a = b0 + r * 2, b = a + 1, d = a + 2, e = d + 1;
      part.idx.push(a, b, d, b, e, d);
    }
  }
  return part;
}

/** A rivet: a low dome `r` across, `h` proud, on the surface at `c` facing `n`. */
export function rivetAt(part, c, n, { r = 0.0032, h = 0.0018, rect, sk }) {
  return latheAt(part, c, n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], [[r, -0.0004], [r * 0.92, h * 0.55], [r * 0.55, h * 0.95], [0, h]], { sides: 5, rect, sk });
}

/**
 * The harness's square brass plate where the straps cross (the turnaround's buckle detail): `S` half its side, a
 * bevelled edge, a raised diamond inside it, a domed stud in the middle and a rivet in each corner. `c` its centre on
 * the straps, `n` out of her chest, `up` toward her head.
 */
export function squarePlate(part, c, n, up, { S = 0.027, thick = 0.0042, rect, rectBright = null, sk }) {
  const R = S * Math.SQRT2;
  const N = V.norm(n);
  // the plate: 4 flat sides, its edges square to `up`
  latheAt(part, c, N, up, [[R * 0.995, -0.0006], [R, thick * 0.45], [R * 0.9, thick], [R * 0.6, thick + 0.0004], [0.0001, thick + 0.0006]], { sides: 4, phase: Math.PI / 4, rect, sk, flatShade: true });
  // the raised diamond: a ridge round a square turned 45 degrees
  const D = S * 0.66;
  latheAt(part, c, N, up, [[D - 0.0026, thick + 0.0002], [D - 0.0012, thick + 0.0018], [D + 0.0012, thick + 0.0018], [D + 0.0026, thick + 0.0002]], { sides: 4, phase: 0, rect: rectBright || rect, sk, flatShade: true });
  // the stud
  latheAt(part, V.add(c, V.mul(N, thick)), N, up, [[0.0062, 0.0003], [0.0056, 0.0018], [0.0036, 0.0032], [0.0001, 0.0037]], { sides: 8, rect: rectBright || rect, sk });
  // four corner rivets
  const A = V.norm(V.sub(up, V.mul(N, V.dot(up, N)))), B = V.cross(N, A);
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const q = V.add(V.add(V.add(c, V.mul(A, a * S * 0.74)), V.mul(B, b * S * 0.74)), V.mul(N, thick * 0.92));
    rivetAt(part, q, N, { r: 0.0026, h: 0.0016, rect: rectBright || rect, sk });
  }
  return part;
}

/**
 * The survey case: a leather tube from `a` to `b` (radius `r`), brass caps at both ends, two straps round it.
 * `rects` = { leather, brass, strap }. Rigid on `sk`.
 */
export function caseTube(part, a, b, r, { rects, sk, sides = 12 }) {
  const ax = V.sub(b, a), L = V.len(ax), N = V.norm(ax);
  const up = Math.abs(N[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const cap = 0.034;
  // the caps: a domed brass end, a rolled lip where it slides over the leather
  latheAt(part, a, N, up, [[0.0001, -0.007], [r * 0.6, -0.0062], [r * 0.95, -0.0035], [r + 0.0022, 0], [r + 0.0025, cap - 0.004], [r + 0.0034, cap - 0.0025], [r + 0.0034, cap - 0.0008], [r + 0.0004, cap]], { sides, rect: rects.brass, sk });
  latheAt(part, b, V.mul(N, -1), up, [[0.0001, -0.007], [r * 0.6, -0.0062], [r * 0.95, -0.0035], [r + 0.0022, 0], [r + 0.0025, cap - 0.004], [r + 0.0034, cap - 0.0025], [r + 0.0034, cap - 0.0008], [r + 0.0004, cap]], { sides, rect: rects.brass, sk });
  // the leather body between them, a little slack (it bellies between the straps)
  const prof = [];
  for (let k = 0; k <= 8; k++) { const f = k / 8; prof.push([r + 0.0012 * Math.sin(f * Math.PI * 3) ** 2, cap - 0.001 + f * (L - 2 * cap + 0.002)]); }
  latheAt(part, a, N, up, prof, { sides, rect: rects.leather, sk });
  // two straps round it, a third and two thirds down
  for (const f of [0.3, 0.72]) {
    const h0 = cap + f * (L - 2 * cap);
    latheAt(part, a, N, up, [[r + 0.0006, h0 - 0.011], [r + 0.0034, h0 - 0.0095], [r + 0.0034, h0 + 0.0095], [r + 0.0006, h0 + 0.011]], { sides, rect: rects.strap, sk });
  }
  return part;
}

/**
 * Turn every triangle of `part` to face out of the body under it (`field`, a part.mjs Field over the body): a triangle
 * whose own normal points into the body's nearest normal is rewound. Returns the count turned.
 */
export function faceOut(part, field) {
  let n = 0;
  const P = part.pos, I = part.idx;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const f = V.cross(e1, e2);
    if (V.len(f) < 1e-12) continue;
    const q = field.nearest((P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3, 3);
    let nx = 0, ny = 0, nz = 0;
    for (const { p } of q) { nx += p.nx; ny += p.ny; nz += p.nz; }
    if (f[0] * nx + f[1] * ny + f[2] * nz < 0) { const s = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = s; n++; }
  }
  part.turned = (part.turned || 0) + n;
  if (n) recomputeNormals(part);
  return n;
}

/**
 * Close the holes in `part` (open loops of at most `maxN` points and `maxPerim` metres round, e.g. torn by collapsing
 * short edges) with patches in `into`, a trim part: a fan from the loop's centre, uv inside `rectAt(centre)` (a planar
 * map, 1 cell per 6 cm), skin from the loop. Never in `part` itself: a fan joining two of its uv islands would merge
 * them in the atlas packing. Wind with `faceOut` after.
 */
export function fillHoles(into, part, { maxN = 14, maxPerim = 0.09, minPerim = 0, where = null, rectAt, grow = 1.45, inset = 0.0025 } = {}) {
  let filled = 0;
  for (const run of openEdges(part)) {
    if (run.length < 3 || run.length > maxN) continue;
    let per = 0;
    for (let k = 0; k < run.length; k++) per += V.len(V.sub(run[k].p, run[(k + 1) % run.length].p));
    if (per > maxPerim || per <= minPerim) continue;
    const c = [0, 0, 0], nn = [0, 0, 0];
    for (const q of run) for (let k = 0; k < 3; k++) { c[k] += q.p[k] / run.length; nn[k] += q.n[k]; }
    if (where && !where(c)) continue;
    const rect = rectAt(c), N = V.norm(nn);
    const A = V.norm(V.cross(N, Math.abs(N[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), B = V.cross(N, A);
    const uvOf = (p) => { const d = V.sub(p, c); return [rect[0] + rect[2] * (0.5 + 0.5 * clamp(V.dot(d, A) / 0.06, -1, 1)), rect[1] + rect[3] * (0.5 + 0.5 * clamp(V.dot(d, B) / 0.06, -1, 1))]; };
    // (a little larger than the hole and a little behind it: the fit eases the boot out after this, and a patch cut to
    // the hole's own edge showed a thin rim of backdrop round it in F08)
    const b0 = into.pos.length / 3;
    for (const p0 of [c, ...run.map((q) => q.p)]) {
      const p = V.sub(V.add(c, V.mul(V.sub(p0, c), grow)), V.mul(N, inset));
      into.pos.push(...p); into.nrm.push(...N); into.uv.push(...uvOf(p));
    }
    const i0 = run[0].i;
    for (let k = 0; k <= run.length; k++) {
      const src = k === 0 ? i0 : run[k - 1].i;
      for (let m = 0; m < 4; m++) { into.jnt.push(part.jnt[src * 4 + m]); into.wgt.push(part.wgt[src * 4 + m]); }
    }
    for (let k = 0; k < run.length; k++) into.idx.push(b0 + 1 + k, b0 + 1 + ((k + 1) % run.length), b0);
    filled++;
  }
  into.filled = (into.filled || 0) + filled;
  return filled;
}

/** Recompute normals of the parts that are smooth sheets (helper for the recipe). */
export const smoothParts = (...ps) => { for (const p of ps) if (p && p.idx.length) recomputeNormals(p); };
