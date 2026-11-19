/**
 * CALIMA — recipe: the Boat Gaff, held (Milestone 2 area D, wave 2; bible §8.1 "Boat Gaff (Oro, 0:35): fast combo;
 * hook-rip pulls a component off small and medium Instruments"; §5.2 carry: the gaff at the left rear hip).
 *
 * OUTPUT public/models/armory/gaff-boat.glb — ONE mesh at its real 0.625 m, no textures (the shared weapon atlas at
 * runtime, src/hero/weaponAtlas.js `adoptWeaponAtlas`): a cast bronze butt knob, an esparto grip over the lower
 * 0.15 m, three turns of carmine lashing, a resin-dark pine haft, a cast bronze socket with a short square beak and the
 * hook curling back toward the hand, its bight honed; a cord wrist loop through the knob.
 * Geometry: ./lib/orokit-geo.mjs `gaffGeo` (the stowed copy in kit-oro.glb is the same cut at lod 1).
 * Sockets (nodes): butt, grip, grip2, head, hookTip, tip, stow.
 */
import path from 'node:path';
import { Document } from '@gltf-transform/core';
import { ROOT, writeSkinned } from '../lib/human/face.mjs';
import { weaponTrim } from '../armor/lib/weaponatlas.mjs';
import { GAFF, gaffGeo } from './lib/orokit-geo.mjs';

export const LANE = 'armory';
export const OUTPUTS = ['public/models/armory/gaff-boat.glb'];
const RECIPE = 'tools/build/recipes/weapons/gaff-boat.mjs';

export async function build({ out = ROOT } = {}) {
  const T = weaponTrim();
  const { g, sockets } = gaffGeo((n) => T.rect(n));
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
  const node = doc.createNode('gaff-boat').setMesh(doc.createMesh('gaff-boat').addPrimitive(prim));
  for (const [s, p] of Object.entries(sockets)) node.addChild(doc.createNode(s).setTranslation(p.map((v) => +v.toFixed(5))));
  doc.createScene('scene').addChild(node);
  return writeSkinned(doc, path.join(out, OUTPUTS[0]), {
    compress: false,
    provenance: { recipe: RECIPE, sources: ['armory-generated'], licence: 'project-original' },
    extras: { r5Weapon: { id: 'boat', class: 'gaff', name: 'Boat Gaff', length: GAFF.length, sockets: Object.keys(sockets), atlas: 'weapon' } },
  });
}
