/**
 * CALIMA — recipe: the Shepherd's Lance, final (armory W1; bible §5.3; plan §4.1
 * "lance ≤ 1.5 k", plan §9 A-weapon-sockets).
 *
 * OUTPUT public/models/armory/lance-shepherd.glb — ONE mesh at its REAL 1.55 m
 * (SPEAR_SCALE retired, M9), no textures (shared weapon atlas at runtime): resin-dark
 * pine, 22 cm hammered bronze leaf with midrib and ground bevel, a cast bob-shaped
 * butt cap, esparto cord wraps at both hand positions (20 %, 55 %), vermilion / white
 * graduations on the upper third, carmine lashing at the socket.
 * Sockets: butt, grip, grip2, stow, tip.
 */
import path from 'node:path';
import { Document } from '@gltf-transform/core';
import { ROOT, writeSkinned } from '../lib/face.mjs';
import { weaponTrim } from '../armor/lib/weaponatlas.mjs';
import { LANCE, lanceGeo } from '../armor/lib/weapongeo.mjs';

export const LANE = 'armory';
export const OUTPUTS = ['public/models/armory/lance-shepherd.glb'];
const RECIPE = 'tools/build/recipes/weapons/lance-shepherd.mjs';

export async function build({ out = ROOT } = {}) {
  const T = weaponTrim();
  const g = lanceGeo((n) => T.rect(n));
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
    .setIndices(acc('SCALAR', new Uint32Array(g.idx)))
    .setMaterial(mat);
  const node = doc.createNode('lance-shepherd').setMesh(doc.createMesh('lance-shepherd').addPrimitive(prim));
  const L = LANCE;
  const sockets = { butt: [0, 0, 0], grip: [0, L.grip * L.length, 0], grip2: [0, L.grip2 * L.length, 0], stow: [0, L.length / 2, 0], tip: [0, L.length, 0] };
  for (const [s, p] of Object.entries(sockets)) node.addChild(doc.createNode(s).setTranslation(p));
  doc.createScene('scene').addChild(node);
  return writeSkinned(doc, path.join(out, OUTPUTS[0]), {
    compress: false,
    provenance: { recipe: RECIPE, sources: ['armory-generated'], licence: 'project-original' },
    extras: { r5Weapon: { id: 'shepherd', class: 'lance', name: "Shepherd's Lance", length: L.length, blade: L.blade, buttCap: 'bob', gripFrac: [L.grip, L.grip2], sockets: Object.keys(sockets), atlas: 'weapon' } },
  });
}
