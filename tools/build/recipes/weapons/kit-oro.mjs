/**
 * CALIMA — recipe: Oro's kit as she carries it (Milestone 2 area D, wave 2; bible §5.2 "gaff at the left rear hip;
 * three pots ... at the lumbar"; "the closed Windwall takes that [the left bracer's] socket from 0:35").
 *
 * OUTPUT public/models/armory/kit-oro.glb — every stowed piece of the Tube Smith's hand-over as ONE skinned mesh, ONE
 * draw, bound by name to Brea's bones (src/hero/orokit.js), with no textures of its own (the shared weapon atlas at
 * runtime, as the held weapons). `_PIECE` bits (the runtime's mask collapses a piece while its held copy is out, or
 * until it is owned):
 *   1 the Boat Gaff, on its hanger `stow_gaff` (a joint under `pelvis` at the identity, swung by src/hero/orokit.js
 *     so the gaff hangs instead of standing out behind her when she leans), from the back of the belt just right of her
 *     spine, the butt up at the belt (where the right hand takes it, as a hatchet from the small of the back) and the beak
 *     end down behind her right thigh, the hook turned out, away from her legs. KT0 moved it there along the belt from the
 *     bible's left rear hip: at the left rear hip no mount lets either hand reach the grip without the gaff standing in the
 *     bow's or the lance's left-hand take (the brief's rule: the mount moves along the belt, the bars do not)
 * The authored points are the bind space of the UBC source (as kit-v0.mjs authors in); `MOUNT` was found by KT0
 * (tools/gates/hero-sweep/kt0-gaff-mount.mjs: among the mounts whose grip the right hand reaches from her idle, the one
 * with the most clearance from the hands' takes, her arms, her legs, her hips and the stowed lance) and carried into
 * bind space through the fitted bind-to-idle map of the pelvis (KT0 `--built` then grades the built mesh).
 */
import path from 'node:path';
import { ROOT, srcRoot, UBC_DIR, readGltf, cleanDoc, nodeByName, jointIndex, writeSkinned } from '../lib/human/face.mjs';
import { weaponTrim } from '../armor/lib/weaponatlas.mjs';
import { G, merge, place, lathe } from '../armor/lib/weapongeo.mjs';
import { GAFF, gaffGeo } from './lib/orokit-geo.mjs';

export const LANE = 'armory';
export const OUTPUTS = ['public/models/armory/kit-oro.glb'];
const RECIPE = 'tools/build/recipes/weapons/kit-oro.mjs';
export const ORO_PIECE = { gaff: 1, windwall: 2, potBrine1: 4, potBrine2: 8, potCinder: 16 };
/** The gaff's hanger joint (src/hero/orokit.js creates the same Bone on the hero): a child of `pelvis` at the identity. */
export const GAFF_SOCKET = 'stow_gaff';
/** Game metres per bind unit (the armory stow kit's `rawToGame`, the normalisation of her rows to 1.72 m). */
const RAW_TO_GAME = 0.969;

/** A joint under `parentName` at the identity: its bind is the parent's, its own index in the skin (kit-v0.mjs). */
function addSocket(doc, name, parentName) {
  const skin = doc.getRoot().listSkins()[0];
  const parent = skin.listJoints().find((j) => j.getName() === parentName);
  if (!parent) throw new Error(`addSocket: no parent joint ${parentName}`);
  const pi = skin.listJoints().indexOf(parent);
  const ibmAcc = skin.getInverseBindMatrices();
  const ibm = Array.from(ibmAcc.getArray());
  const node = doc.createNode(name);
  parent.addChild(node);
  skin.addJoint(node);
  ibm.push(...ibm.slice(pi * 16, pi * 16 + 16));
  ibmAcc.setArray(new Float32Array(ibm));
}

/**
 * The gaff's mount in bind space: the butt end (up), the beak end (down), and the side the hook faces (out of her
 * body). Carried from KT0's character-space mount at her idle by `kt0-gaff-mount.mjs --bind`.
 */
export const MOUNT = {
  // KT0 mount 'rearRight' (character space at her idle: butt (-0.04, 1.04, -0.20), beak end (-0.15, 0.46, -0.17)); `hook`
  // is her -z (behind her) in bind space
  gaff: { butt: [-0.1354, 1.1342, -0.2649], tip: [-0.2114, 0.5291, -0.2506], hook: [-0.2333, 0.0574, -0.9707] },
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrmz = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The local +Y along `butt -> tip`, local +Z as near `hook` as square to it: [X, Y, Z]. */
function frame(butt, tip, hook) {
  const Y = nrmz(sub(tip, butt));
  const h = nrmz(hook);
  const d = h[0] * Y[0] + h[1] * Y[1] + h[2] * Y[2];
  const Z = nrmz([h[0] - Y[0] * d, h[1] - Y[1] * d, h[2] - Y[2] * d]);
  const X = cross(Y, Z);
  return [X, Y, Z];
}

/** `compress: false` keeps the authored positions as written (KT0's `--bind` reads them back to check the mount). */
export async function build({ out = ROOT, compress = true } = {}) {
  const T = weaponTrim();
  const cell = (n) => T.rect(n);
  const SRC = srcRoot();
  const doc = await readGltf(path.join(UBC_DIR(SRC), 'Superhero_Female_FullBody.gltf'));
  cleanDoc(doc);
  for (const n of doc.getRoot().listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.dispose(); }
  addSocket(doc, GAFF_SOCKET, 'pelvis');
  const pieces = [];
  const stow = {};
  // ---- the gaff: the stowed copy is the held one's cut at lod 1; its own +Y runs butt -> beak, so the butt is the
  // origin at the mount's upper end
  {
    const M = MOUNT.gaff;
    const len = Math.hypot(...sub(M.tip, M.butt));
    const k = GAFF.length / len;   // (the mount's two points are the gaff's own length apart: k = 1 within a millimetre)
    const [X, Y, Z] = frame(M.butt, M.tip, M.hook);
    const { g, sockets } = gaffGeo(cell, { lod: 1 });
    // bind space is the source's raw units, 0.969 of a game metre (the kit's rawToGame): the stowed gaff is cut 1/0.969
    // larger so it is the held one's real 0.625 m on her (no change of size at the hand-over)
    // the frog: a leather loop round the haft under the lashing, its tab up to the slung belt
    const fy = sockets.stow[1];
    merge(g, lathe([[GAFF.rHead + 0.0045, fy - 0.022], [GAFF.r + 0.0062, fy - 0.018], [GAFF.r + 0.0062, fy + 0.018], [GAFF.r + 0.0045, fy + 0.022]], { sides: 8, rect: cell('leatherDark'), uAlong: true }));
    merge(g, place(lathe([[0.0, 0], [0.006, 0.0005], [0.0062, fy - 0.03], [0.0, fy - 0.0295]], { sides: 4, phase: Math.PI / 4, rect: cell('leatherDark'), ry: () => 0.35 }),
      [1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0.015, -(GAFF.r + 0.009)]));
    for (let i = 0; i < g.pos.length; i++) g.pos[i] /= RAW_TO_GAME;
    pieces.push({ g: place(g, X, Y, Z, M.butt), joint: GAFF_SOCKET, bit: ORO_PIECE.gaff });
    stow.gaff = { butt: M.butt, tip: M.tip, hook: Z, joint: GAFF_SOCKET, parent: 'pelvis', frog: fy, lengthK: +k.toFixed(4) };
  }
  const all = G();
  const jnt = [], wgt = [], pid = [];
  for (const p of pieces) {
    merge(all, p.g);
    const j = jointIndex(doc, p.joint);
    for (let i = 0; i < p.g.pos.length / 3; i++) { jnt.push(j, 0, 0, 0); wgt.push(1, 0, 0, 0); pid.push(p.bit); }
  }
  const buf = doc.getRoot().listBuffers()[0];
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const nrm = new Float32Array(all.nrm);
  for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
  for (const m of doc.getRoot().listMaterials()) m.dispose();
  for (const t of doc.getRoot().listTextures()) t.dispose();
  const mat = doc.createMaterial('MI_Armory_Atlas').setMetallicFactor(1).setRoughnessFactor(1);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(all.pos)))
    .setAttribute('NORMAL', acc('VEC3', nrm))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(all.uv)))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array(jnt)))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(wgt)))
    .setAttribute('_PIECE', acc('SCALAR', new Uint8Array(pid)))
    .setIndices(acc('SCALAR', new Uint32Array(all.idx)))
    .setMaterial(mat);
  const node = doc.createNode('KitOro').setMesh(doc.createMesh('KitOro').addPrimitive(prim)).setSkin(doc.getRoot().listSkins()[0]);
  nodeByName(doc, 'Armature').addChild(node);
  return writeSkinned(doc, path.join(out, OUTPUTS[0]), {
    compress,
    provenance: { recipe: RECIPE, sources: ['ubc-standard', 'armory-generated'], licence: 'project-original' },
    extras: { r5OroKit: { pieces: ORO_PIECE, stow, atlas: 'weapon' } },
  });
}
