/**
 * CALIMA — recipe: the Sabina Bow, final (armory W1; bible §5.2; plan §4.1 "bow
 * ≤ 3 k", "≤ 0.15 MB", plan §9 A-weapon-sockets).
 *
 * OUTPUT public/models/armory/bow-sabina.glb — ONE mesh, no textures: at runtime it
 * renders with the shared weapon atlas (src/hero/weaponAtlas.js). 1.45 m self-bow
 * of wind-twisted juniper, D-section, pale sapwood back and the dark heart stripe
 * down the belly, esparto cord grip, carmine bindings, grooved horn nocks; the
 * string and the nocked arrow are in the same mesh, tagged `_BW` [kind, s], and the
 * vertex program in src/combat/bow.js flexes the limbs, draws the string and
 * carries the arrow: the whole bow is ONE draw (A-gear-draws, R38).
 * Sockets: grip, nock, string_top, string_bottom, stow, tip (arrow, at full draw).
 */
import path from 'node:path';
import { Document } from '@gltf-transform/core';
import { ROOT, writeSkinned } from '../lib/face.mjs';
import { weaponTrim } from '../armor/lib/weaponatlas.mjs';
import { BOW, BOW_TIP, G, arrowGeo, bowGeo, merge, stave, stringGeo } from '../armor/lib/weapongeo.mjs';

export const LANE = 'armory';
export const OUTPUTS = ['public/models/armory/bow-sabina.glb'];
const RECIPE = 'tools/build/recipes/weapons/bow-sabina.mjs';
/** Arrow on the string: bible §5.2 "arrow = pull + 0.20" with the solve's pull 0.582. */
export const ARROW_LEN = 0.782;

export async function build({ out = ROOT } = {}) {
  const T = weaponTrim();
  const cell = (n) => T.rect(n);
  const g = merge(merge(merge(G(), bowGeo(cell)), stringGeo(cell)), arrowGeo(cell, ARROW_LEN));
  const doc = new Document();
  const buf = doc.createBuffer();
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const nrm = new Float32Array(g.nrm);
  for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
  const mat = doc.createMaterial('MI_Armory_Atlas').setMetallicFactor(1).setRoughnessFactor(1);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(g.pos)))
    .setAttribute('NORMAL', acc('VEC3', nrm))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(g.uv)))
    .setAttribute('_BW', acc('VEC2', new Float32Array(g.bw)))
    .setIndices(acc('SCALAR', new Uint32Array(g.idx)))
    .setMaterial(mat);
  const node = doc.createNode('bow-sabina').setMesh(doc.createMesh('bow-sabina').addPrimitive(prim));
  const top = stave(1), bot = stave(-1);
  const sockets = { grip: [0, 0, 0], nock: [0, 0, top[2]], string_top: top, string_bottom: bot, stow: [0, 0, 0], tip: [0, 0, top[2] + ARROW_LEN] };
  for (const [s, p] of Object.entries(sockets)) node.addChild(doc.createNode(s).setTranslation(p.map((v) => +v.toFixed(5))));
  doc.createScene('scene').addChild(node);
  return writeSkinned(doc, path.join(out, OUTPUTS[0]), {
    compress: false,
    provenance: { recipe: RECIPE, sources: ['armory-generated'], licence: 'project-original' },
    extras: { r5Weapon: { id: 'sabina', class: 'bow', name: 'Sabina Bow', length: BOW.length, braceZ: +top[2].toFixed(4), arrowLen: ARROW_LEN, tipY: +BOW_TIP.y.toFixed(4), tipK: BOW.tipK, tipC: BOW.tipC, sockets: Object.keys(sockets), atlas: 'weapon' } },
  });
}
