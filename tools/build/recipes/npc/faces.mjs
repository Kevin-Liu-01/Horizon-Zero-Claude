/**
 * CALIMA — "no two faces alike" (people; BUILD M1.5c: pairwise landmark distance above a threshold set from Ansel and Brea).
 *
 *   node tools/build/recipes/npc/faces.mjs [id ...]      the cast's pairwise distances against the threshold, as JSON
 *
 * Read off the shipped GLBs, never off the recipe's inputs: each person's near skin (an NPC's Skin_L0, Brea's Brea_Skin) in its
 * bind frame (density.mjs bindMatrix; a man's head lowered by the pack's 42.5 mm so both sexes share the female landmark
 * windows), its eye centres from the vertices on its eye patch, and the nine landmarks the face field itself uses
 * (lib/human/face.mjs findLandmarks: nose bridge and tip, both cheekbones, both jaw angles, chin, brow, upper lip).
 *
 * A face is those nine points in game millimetres (bind x the person's game scale) about the midpoint of the eyes, so height
 * does not count, proportion does. The distance of two faces is the RMS of their nine point-to-point gaps (mm).
 *
 * The threshold: half the distance between Guild Matron Ansel and Brea, two women of one people whom nobody mistakes for each
 * other (63 and 31). A pair under it is "alike".
 */
import path from 'node:path';
import { io, ROOT, findLandmarks } from '../lib/human/face.mjs';
/** The people's GLBs are read under R5_NPC_ROOT when set (a scratch build root, measured before it ships); Brea always from the repo. */
const NPC_ROOT = process.env.R5_NPC_ROOT || ROOT;
import { bindMatrix } from './density.mjs';

export const KEYS = ['noseBridge', 'noseTip', 'cheekL', 'cheekR', 'jawL', 'jawR', 'chin', 'brow', 'upperLip'];
const apply = (M, p) => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];

/** One person's nine landmarks, game mm about the eyes' midpoint. `id` 'brea' or an NPC id. */
export async function faceOf(id) {
  const hero = id === 'brea';
  const file = hero ? path.join(ROOT, 'public/models/hero/brea.glb') : path.join(NPC_ROOT, `public/models/npc/${id}.glb`);
  const doc = await (await io()).read(file);
  const A = doc.getRoot().getAsset().extras || {};
  const scale = hero ? A.r5Hero.scale : A.r5Npc.scale;
  const dy = !hero && A.r5Npc.sex === 'M' ? 0.0425 : 0;
  const patches = [].concat(A.r5Paint?.layout?.eyePatch || []);
  const inEye = (u) => patches.some((e) => u[0] >= e.x && u[0] <= e.x + e.w && u[1] >= e.y && u[1] <= e.y + e.h);
  const node = doc.getRoot().listNodes().find((n) => n.getMesh() && n.getName() === (hero ? 'Brea_Skin' : 'Skin_L0'));
  const M = bindMatrix(node);
  const head = [], eyeL = [0, 0, 0, 0], eyeR = [0, 0, 0, 0];
  for (const prim of node.getMesh().listPrimitives()) {
    const P = prim.getAttribute('POSITION'), U = prim.getAttribute('TEXCOORD_0'), p = [0, 0, 0], u = [0, 0];
    const info = prim.getMaterial()?.getBaseColorTextureInfo(), X = info?.getExtension?.('KHR_texture_transform');
    for (let i = 0; i < P.getCount(); i++) {
      P.getElement(i, p);
      const q = apply(M, p); q[1] -= dy;
      if (q[1] < 1.45 || Math.abs(q[0]) > 0.11) continue;
      if (U) { U.getElement(i, u); if (X) { const o = X.getOffset(), s = X.getScale(); u[0] = o[0] + u[0] * s[0]; u[1] = o[1] + u[1] * s[1]; } }
      if (U && inEye(u)) { const T = q[0] > 0 ? eyeL : eyeR; T[0] += q[0]; T[1] += q[1]; T[2] += q[2]; T[3]++; continue; }
      head.push(q);
    }
  }
  if (!eyeL[3] || !eyeR[3]) throw new Error(`[faces] ${id}: no eye vertices on the eye patch`);
  const eyes = [eyeL, eyeR].map((c) => [c[0] / c[3], c[1] / c[3], c[2] / c[3]]);
  const L = findLandmarks(head, eyes);
  /* (M1.5c fix round, judge item 7) The sellion window of findLandmarks is 4 mm either side of the eyes' height on the midline,
   * and two men's skins (boat-caulker, salt-porter-2) have no midline vertex on the front of the face inside it: the most forward
   * point it found was the back of the skull, 170 mm behind the eyes, and their distances read 62-71 mm. The bridge is on the
   * front of the face: if the window found nothing forward of the eyes, take the midline vertex forward of the eyes nearest
   * their height (the shared lib/human/face.mjs is hero-art's and unchanged). */
  const eyeZ = (eyes[0][2] + eyes[1][2]) / 2, eyeY = (eyes[0][1] + eyes[1][1]) / 2;
  if (!L.noseBridge || L.noseBridge[2] < eyeZ) {
    let best = null;
    for (const q of head) {
      if (Math.abs(q[0]) >= 0.008 || q[2] < eyeZ || Math.abs(q[1] - eyeY) > 0.012) continue;
      const k = Math.abs(q[1] - eyeY) - 0.25 * (q[2] - eyeZ);
      if (!best || k < best.k) best = { q, k };
    }
    if (best) L.noseBridge = [best.q[0], best.q[1], best.q[2]];
  }
  const o = [(eyes[0][0] + eyes[1][0]) / 2, (eyes[0][1] + eyes[1][1]) / 2, (eyes[0][2] + eyes[1][2]) / 2];
  const pts = {};
  for (const k of KEYS) {
    if (!L[k]) throw new Error(`[faces] ${id}: landmark ${k} not found`);
    pts[k] = L[k].map((v, c) => +((v - o[c]) * scale * 1000).toFixed(2));
  }
  return { id, scale, eyeGapMm: +(Math.hypot(eyes[0][0] - eyes[1][0], eyes[0][1] - eyes[1][1], eyes[0][2] - eyes[1][2]) * scale * 1000).toFixed(2), pts };
}

/** RMS of the nine landmark gaps, mm. */
export const distance = (a, b) => Math.sqrt(KEYS.reduce((s, k) => s + (a.pts[k][0] - b.pts[k][0]) ** 2 + (a.pts[k][1] - b.pts[k][1]) ** 2 + (a.pts[k][2] - b.pts[k][2]) ** 2, 0) / KEYS.length);

/** Every pair of `ids` against the threshold (half of Ansel to Brea). */
export async function pairs(ids) {
  const brea = await faceOf('brea'), ansel = await faceOf('guild-matron');
  const ref = distance(ansel, brea), threshold = ref / 2;
  const faces = [];
  for (const id of ids) faces.push(id === 'guild-matron' ? ansel : id === 'brea' ? brea : await faceOf(id));
  const rows = [];
  for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) rows.push({ a: faces[i].id, b: faces[j].id, mm: +distance(faces[i], faces[j]).toFixed(2) });
  rows.sort((x, y) => x.mm - y.mm);
  return { anselToBreaMm: +ref.toFixed(2), threshold: +threshold.toFixed(2), nearest: rows[0], alike: rows.filter((r) => r.mm <= threshold), rows };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { CAST } = await import('./lib/archetypes.mjs');
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['brea', 'guild-matron', ...CAST];
  console.log(JSON.stringify(await pairs(ids), null, 1));
}
