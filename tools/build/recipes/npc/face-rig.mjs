/**
 * CALIMA — the face rig on the shipped skins, in Node (people; BUILD M1.5f). The game builds it at load
 * (src/world/npc/people/face.js installFaceGeometry); this runs the same `buildFaceRig` on the same GLB data:
 *
 *   node tools/build/recipes/npc/face-rig.mjs [id ...]     per skin: eyes, lids, mouth and what each target does, as JSON
 *
 * Read off each near skin (Brea's Brea_Skin, an NPC's Skin_L0) in its bind frame: positions are the quantised ones times
 * the uniform scale the writer folded into the inverse binds (density.mjs bindMatrix), the eye patch is faces.mjs's rule,
 * the Head mask is JOINTS/WEIGHTS on the Head joint (>= 0.5).
 *
 * `measure(rig, P)` applies the targets the way the vertex shader does (position + sum of weight x target) and reports:
 *   blink       the eye's opening seen from the front at its middle column (face.js `opening`, a ray-cast), open, at the half
 *               and three-quarter blink and shut (mm); shut / open
 *   intrusion   lid vertices that end inside the ball or its dome at the half and full blink (count; must be 0)
 *   turn        the cornea pole after a 20 deg yaw and a 15 deg pitch against the exact rotation (mm)
 *   jaw         the lower lip's drop at full AA, EE, OO, FV (mm) and the corners' travel at EE and OO (mm)
 */
import path from 'node:path';
import { io, ROOT } from '../lib/human/face.mjs';
import { bindMatrix } from './density.mjs';
import { buildFaceRig, FACE_TARGETS, eyeTriangles, opening } from '../../../../src/world/npc/people/face.js';

const NPC_ROOT = process.env.R5_NPC_ROOT || ROOT;

export async function skinOf(id) {
  const hero = id === 'brea';
  const file = hero ? path.join(ROOT, 'public/models/hero/brea.glb') : path.join(NPC_ROOT, `public/models/npc/${id}.glb`);
  const doc = await (await io()).read(file);
  const A = doc.getRoot().getAsset().extras || {};
  const node = doc.getRoot().listNodes().find((n) => n.getMesh() && n.getName() === (hero ? 'Brea_Skin' : 'Skin_L0'));
  const M = bindMatrix(node);
  const s = Math.hypot(M[0], M[1], M[2]);
  const prim = node.getMesh().listPrimitives()[0];
  const Pa = prim.getAttribute('POSITION'), U = prim.getAttribute('TEXCOORD_0'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const hi = node.getSkin().listJoints().findIndex((j) => j.getName() === 'Head');
  const info = prim.getMaterial()?.getBaseColorTextureInfo(), X = info?.getExtension?.('KHR_texture_transform');
  const patches = [].concat(A.r5Paint?.layout?.eyePatch || []);
  const n = Pa.getCount();
  const P = new Float32Array(n * 3), eye = new Uint8Array(n), head = new Uint8Array(n);
  const p = [0, 0, 0], u = [0, 0], j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    Pa.getElement(i, p); P[i * 3] = p[0] * s; P[i * 3 + 1] = p[1] * s; P[i * 3 + 2] = p[2] * s;
    J.getElement(i, j); W.getElement(i, w);
    let hw = 0; for (let k = 0; k < 4; k++) if (j[k] === hi) hw += w[k];
    if (hw >= 0.5) head[i] = 1;
    if (!head[i] || !U) continue;
    U.getElement(i, u);
    if (X) { const o = X.getOffset(), sc = X.getScale(); u[0] = o[0] + u[0] * sc[0]; u[1] = o[1] + u[1] * sc[1]; }
    if (patches.some((e) => u[0] >= e.x && u[0] <= e.x + e.w && u[1] >= e.y && u[1] <= e.y + e.h)) eye[i] = 1;
  }
  return { id, P, index: prim.getIndices().getArray(), eye, head, n, scale: hero ? A.r5Hero?.scale : A.r5Npc?.scale };
}

const D2R = Math.PI / 180;
const at = (P, rig, i, wts) => {
  const o = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  for (const [name, wt] of Object.entries(wts)) { const D = rig.targets[FACE_TARGETS.indexOf(name)]; o[0] += D[i * 3] * wt; o[1] += D[i * 3 + 1] * wt; o[2] += D[i * 3 + 2] * wt; }
  return o;
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mm = (v) => +(v * 1000).toFixed(2);

/** What each target does on this skin (see the header). */
export function measure(rig, P, index, eye) {
  const out = { blink: [], intrusion: { mid: 0, full: 0 }, turn: {}, jaw: {} };
  const tris = eyeTriangles(P, index, eye);
  const deform = (wts) => {
    const Q = Float32Array.from(P);
    for (const [name, wt] of Object.entries(wts)) { const D = rig.targets[FACE_TARGETS.indexOf(name)]; for (let i = 0; i < Q.length; i++) Q[i] += D[i] * wt; }
    return Q;
  };
  const Qh = deform({ blinkMid: 1 }), Qs = deform({ blinkFull: 1 }), Qq = deform({ blinkMid: 0.5, blinkFull: 0.5 });
  rig.eyes.forEach((E, s) => {
    const o = opening(P, tris, E, rig.stats.K), h = opening(Qh, tris, E, rig.stats.K), q = opening(Qq, tris, E, rig.stats.K), c = opening(Qs, tris, E, rig.stats.K);
    const mmOf = (r) => (r.error ? 0 : r.openMm);
    out.blink.push({ side: s ? 'R' : 'L', openMm: mmOf(o), halfMm: mmOf(h), threeQuarterMm: mmOf(q), shutMm: mmOf(c), shutRatio: +(mmOf(c) / Math.max(1e-6, mmOf(o))).toFixed(3) });
  });
  // any lid vertex in front of the ball's centre plane ending inside the ball at half or full
  const n = P.length / 3;
  for (const [key, wts] of [['mid', { blinkMid: 1 }], ['full', { blinkFull: 1 }]]) {
    const D = rig.targets[FACE_TARGETS.indexOf(key === 'mid' ? 'blinkMid' : 'blinkFull')];
    for (let i = 0; i < n; i++) {
      if (!D[i * 3] && !D[i * 3 + 1] && !D[i * 3 + 2]) continue;
      for (const E of rig.eyes) {
        const r0 = dist([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], E.c);
        if (r0 < E.R - 0.0003 || r0 > E.R + 0.012) continue;
        const q = at(P, rig, i, wts);
        if (dist(q, E.c) < E.R - 0.0002 && q[2] > E.c[2]) out.intrusion[key]++;
      }
    }
  }
  // the pole turned by the parts against the true rotation
  for (const [s, E] of rig.eyes.entries()) {
    const i = E.pole, y = 20 * D2R, pt = 15 * D2R;
    const q = at(P, rig, i, { yawS: Math.sin(y), yawC: 1 - Math.cos(y) });
    const x0 = P[i * 3] - E.c[0], z0 = P[i * 3 + 2] - E.c[2];
    const tr = [E.c[0] + x0 * Math.cos(y) + z0 * Math.sin(y), P[i * 3 + 1], E.c[2] - x0 * Math.sin(y) + z0 * Math.cos(y)];
    const q2 = at(P, rig, i, { pitchS: Math.sin(pt), pitchC: 1 - Math.cos(pt) });
    const y0 = P[i * 3 + 1] - E.c[1];
    const tr2 = [P[i * 3], E.c[1] + y0 * Math.cos(pt) + z0 * Math.sin(pt), E.c[2] - y0 * Math.sin(pt) + z0 * Math.cos(pt)];
    out.turn[s ? 'R' : 'L'] = { yaw20ErrMm: mm(dist(q, tr)), pitch15ErrMm: mm(dist(q2, tr2)), poleTravelMm: mm(dist(q, [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]])) };
  }
  const M = rig.mouth;
  for (const k of ['jawAA', 'lipEE', 'lipOO', 'lipFV']) {
    const lo = M.lowerLip, up = M.upperLip;
    const gap0 = dist(at(P, rig, lo, {}), at(P, rig, up, {}));
    const gap = dist(at(P, rig, lo, { [k]: 1 }), at(P, rig, up, { [k]: 1 }));
    const cl = M.corners[0];
    out.jaw[k] = { lipGapMm: mm(gap - gap0), cornerMm: mm(dist(at(P, rig, cl, { [k]: 1 }), at(P, rig, cl, {}))), cornerDxMm: mm(at(P, rig, cl, { [k]: 1 })[0] - P[cl * 3]) };
  }
  // every target finite
  out.finite = rig.targets.every((D) => D.every(Number.isFinite));
  return out;
}

export async function rigOf(id) {
  const S = await skinOf(id);
  const rig = buildFaceRig(S.P, S.index, S.eye, S.head);
  if (rig.error) return { id, error: rig.error };
  return { id, stats: rig.stats, eyes: rig.eyes.map((E) => ({ R: mm(E.R), n: E.n })), lids: rig.lids, mouth: { xcMm: mm(rig.mouth.xc), slitN: rig.mouth.slitN, lowerN: rig.mouth.lowerN }, m: measure(rig, S.P, S.index, S.eye) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { CAST } = await import('./lib/archetypes.mjs');
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['brea', 'guild-matron', ...CAST];
  const rows = [];
  for (const id of ids) rows.push(await rigOf(id));
  console.log(JSON.stringify(rows, null, 1));
}
