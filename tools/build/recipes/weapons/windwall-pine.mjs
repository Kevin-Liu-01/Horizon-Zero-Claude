/**
 * CALIMA — recipe: the Pine Windwall, held (Milestone 2 area D, wave 2; bible §8.1 "Windwall (crescent fan-shield,
 * nine slats): Pine (Oro, 0:35): guard, parry, bash, and plant as 0.9 m of cover that blocks line of sight"; §3.1 "the
 * closed Windwall takes that [the left bracer's] socket").
 *
 * OUTPUT public/models/armory/windwall-pine.glb — ONE mesh, no textures (the shared weapon atlas at runtime), authored
 * CLOSED: nine resin-dark pine slats on a cast brass rivet, a woven palm leaf between each two, two lacings of cord,
 * two leather cuffs round her forearm's line under the first slat. The vertex attribute `_SLAT` (the slat index,
 * fractional on the leaf and the lacing) lets the runtime fan it open by one uniform: slat s turns about the face's
 * normal by s / 8 of 150 deg (geometry: ./lib/orokit-geo.mjs `windwallGeo`, `slatAngle`). Open, the slats' tips stand
 * 0.47 m from the rivet: a crescent fan 0.9 m tall across its chord.
 * Sockets (nodes): pivot, cuffWrist, cuffElbow (her forearm's line), tip (the first slat's).
 */
import path from 'node:path';
import { Document } from '@gltf-transform/core';
import { ROOT, writeSkinned } from '../lib/human/face.mjs';
import { weaponTrim } from '../armor/lib/weaponatlas.mjs';
import { WINDWALL, windwallGeo } from './lib/orokit-geo.mjs';

export const LANE = 'armory';
export const OUTPUTS = ['public/models/armory/windwall-pine.glb'];
const RECIPE = 'tools/build/recipes/weapons/windwall-pine.mjs';

export async function build({ out = ROOT } = {}) {
  const T = weaponTrim();
  const { g, sockets } = windwallGeo((n) => T.rect(n));
  const doc = new Document();
  const buf = doc.createBuffer();
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const nrm = new Float32Array(g.nrm);
  for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
  const slat = new Float32Array(g.bw.length / 2);
  for (let i = 0; i < slat.length; i++) slat[i] = g.bw[i * 2];
  const mat = doc.createMaterial('MI_Armory_Atlas').setMetallicFactor(1).setRoughnessFactor(1).setDoubleSided(true);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(g.pos)))
    .setAttribute('NORMAL', acc('VEC3', nrm))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(g.uv)))
    .setAttribute('_SLAT', acc('SCALAR', slat))
    .setIndices(acc('SCALAR', new Uint32Array(g.idx)))
    .setMaterial(mat);
  const node = doc.createNode('windwall-pine').setMesh(doc.createMesh('windwall-pine').addPrimitive(prim));
  for (const [s, p] of Object.entries(sockets)) node.addChild(doc.createNode(s).setTranslation(p.map((v) => +v.toFixed(5))));
  doc.createScene('scene').addChild(node);
  return writeSkinned(doc, path.join(out, OUTPUTS[0]), {
    compress: false,
    provenance: { recipe: RECIPE, sources: ['armory-generated'], licence: 'project-original' },
    extras: { r5Weapon: { id: 'pine', class: 'windwall', name: 'Pine Windwall', slats: WINDWALL.slats, spreadDeg: WINDWALL.spread, slatLength: WINDWALL.len, sockets: Object.keys(sockets), atlas: 'weapon', vertexFan: '_SLAT' } },
  });
}
