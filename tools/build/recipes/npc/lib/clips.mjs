/**
 * CALIMA — the NPC clip pack (settlements; bible §6.2 "UAL2 clips play natively on UBC; UAL1 clips via one
 * baked library per body type"; plan §4.5 "UAL2 trimmed to the ~22 clips used").
 *
 * OUTPUT public/models/npc/npc-clips.glb: a mesh-less skeleton + animations on the UBC joint names.
 *   <name>       a UAL2 clip, native on both bodies (rotations + pelvis translation)
 *   F|<name>     a UAL1 clip baked onto the female body by the kept Retargeter, offline
 *   M|<name>     the same, on the male body
 * extras.r5Clips.gaits['F|Walk_Loop'] = { dur, dist, cum: [...] }: the distance a planted foot carries
 * the body over the loop, at frame steps, in raw body metres. The runtime walks by this table, so
 * the planted foot is the fixed point of the walk (A97) and no bone matrix is read per frame.
 * extras.r5Clips.pelvisScale.M: the factor a native clip's pelvis track takes on the male body.
 *
 * The bake is the kept `src/entities/anim/retargeter.js` (the same arithmetic Brea's clips go through),
 * run here in Node on three's scene graph. Deterministic.
 */
import path from 'node:path';
import * as THREE from 'three';
import { readGltf, cleanDoc, UBC_DIR, srcRoot, io } from './kit/face.mjs';
import { checkProvenance, GENERATOR } from '../../../lib/glb.mjs';
import { Retargeter } from '../../../../../src/entities/anim/retargeter.js';
import { UAL_TO_UBC, UBC_CONTACTS } from '../../../../../src/entities/anim/rigs/ubc.js';
import { AIM_RULES, UAL_HIP } from '../../../../../src/entities/anim/boneMap.js';
import { prune, dedup, resample } from '@gltf-transform/functions';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

/** Baked per body (UAL1). */
export const UAL1_CLIPS = ['Idle_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Idle_Talking_Loop', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Sitting_Enter', 'Sitting_Exit', 'Fixing_Kneeling', 'Push_Loop', 'PickUp_Table', 'Interact'];
/** Native on UBC (UAL2). */
export const UAL2_CLIPS = ['Farm_Harvest', 'Farm_PlantSeed', 'Farm_Watering', 'Consume', 'Idle_FoldArms_Loop', 'Idle_No_Loop', 'Idle_Lantern_Loop', 'Idle_Rail_Call', 'Idle_Rail_Loop', 'Walk_Carry_Loop', 'Yes', 'TreeChopping_Loop', 'Chest_Open'];
const GAITS = ['Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Walk_Carry_Loop'];
/**
 * The pack's walk lifts the swing knee like a march (thigh 45 deg forward on these longer bodies): the kept retargeter's
 * amplitude warp brings a working person's stride down to a walk, as it does for the hero's jog. The stride tables read the warped clip.
 */
const BAKE_AMP = { Walk_Loop: 0.72, Walk_Formal_Loop: 0.8, Jog_Fwd_Loop: 0.55 };

const san = (n) => THREE.PropertyBinding.sanitizeNodeName(n);

/** A three.js scene graph from a glTF document's scene (Bones where the skin says so). */
export function threeTree(doc) {
  const root = doc.getRoot();
  const jointSet = new Set();
  for (const s of root.listSkins()) for (const j of s.listJoints()) jointSet.add(j);
  const map = new Map();
  const make = (n) => {
    const o = jointSet.has(n) ? new THREE.Bone() : new THREE.Object3D();
    o.name = san(n.getName());
    const t = n.getTranslation(), r = n.getRotation(), s = n.getScale();
    o.position.set(t[0], t[1], t[2]); o.quaternion.set(r[0], r[1], r[2], r[3]); o.scale.set(s[0], s[1], s[2]);
    map.set(n, o);
    for (const c of n.listChildren()) { if (c.getMesh()) continue; o.add(make(c)); }
    return o;
  };
  const top = new THREE.Group();
  for (const n of (root.getDefaultScene() || root.listScenes()[0]).listChildren()) { if (n.getMesh()) continue; top.add(make(n)); }
  top.updateMatrixWorld(true);
  return { top, map };
}

/** A three.js AnimationClip from a glTF animation. */
function threeClip(anim) {
  const tracks = [];
  let dur = 0;
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode(), p = ch.getTargetPath(), s = ch.getSampler();
    const times = s.getInput().getArray(), vals = s.getOutput().getArray();
    dur = Math.max(dur, times[times.length - 1]);
    const n = `${san(node.getName())}.${p === 'rotation' ? 'quaternion' : p === 'translation' ? 'position' : 'scale'}`;
    if (p === 'rotation') tracks.push(new THREE.QuaternionKeyframeTrack(n, times, vals));
    else if (p === 'translation') tracks.push(new THREE.VectorKeyframeTrack(n, times, vals));
    else if (p === 'scale') tracks.push(new THREE.VectorKeyframeTrack(n, times, vals));
  }
  return new THREE.AnimationClip(anim.getName(), dur, tracks);
}

/** The distance a planted foot carries the body: frame steps, cumulative, in raw metres. */
function gaitTable(rig, clip, { fps = 30 } = {}) {
  const bones = {};
  rig.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const mixer = new THREE.AnimationMixer(rig);
  const action = mixer.clipAction(clip);
  action.play();
  const dur = clip.duration, n = Math.max(2, Math.round(dur * fps));
  // per frame: heel and ball of each foot, world y + z
  const F = ['foot_l', 'ball_l', 'foot_r', 'ball_r'].map((k) => ({ b: bones[k], y: new Float64Array(n + 1), z: new Float64Array(n + 1) }));
  const v = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    mixer.setTime(Math.min(dur - 1e-4, i / n * dur));
    rig.updateMatrixWorld(true);
    for (const f of F) { f.b.getWorldPosition(v); f.y[i] = v.y; f.z[i] = v.z; }
  }
  mixer.stopAllAction(); mixer.uncacheRoot(rig);
  // heel and ball sit at different heights above the sole: relative to their own lows
  const low = F.map((f) => Math.min(...f.y));
  const rel = (k, i) => F[k].y[i] - low[k];
  const cum = [0];
  let total = 0, lastV = 0, sup = rel(0, 0) < rel(2, 0) ? 0 : 1;
  for (let i = 0; i < n; i++) {
    const ml = Math.min(rel(0, i), rel(1, i)), mr = Math.min(rel(2, i), rel(3, i));
    // hysteresis: the support foot changes when the other is clearly the lower one
    if (sup === 0 && mr < ml - 0.006) sup = 1; else if (sup === 1 && ml < mr - 0.006) sup = 0;
    const a = sup === 0 ? 0 : 2;
    // the bone that is down: the heel at strike, the ball at push-off
    const k = rel(a, i) < rel(a + 1, i) ? a : a + 1;
    let step = -(F[k].z[i + 1] - F[k].z[i]);
    // both feet in the air (a jog's flight): the body keeps the last stance's speed
    if (Math.min(ml, mr) > 0.05) step = lastV; else lastV = step;
    step = Math.max(0, step);
    total += step;
    cum.push(+total.toFixed(5));
  }
  return { dur: +dur.toFixed(5), dist: +total.toFixed(4), frames: n, cum };
}

export async function buildClipPack(file, { provenance }) {
  const SRC = srcRoot();
  const cand = [path.join(SRC, 'ual2/UAL2_Standard.glb'), path.join(SRC, 'UAL2_Standard.glb')];
  const ual2File = cand.find((f) => existsSync(f));
  if (!ual2File) throw new Error('[npc clips] UAL2_Standard.glb not found under the sources (ual2/)');
  const doc = await (await io()).read(ual2File);
  const root = doc.getRoot();

  // the bodies, as three trees in their pack frame; the source rig
  const ual1 = await readGltf(path.join(SRC, 'ual1/AnimationLibrary_Godot_Standard.gltf'));
  const bodies = {};
  for (const [k, f] of [['F', 'Superhero_Female_FullBody.gltf'], ['M', 'Superhero_Male_FullBody.gltf']]) {
    const d = await readGltf(path.join(UBC_DIR(SRC), f));
    cleanDoc(d);
    bodies[k] = threeTree(d);
  }
  const source = threeTree(ual1);
  const sourceClips = new Map(ual1.getRoot().listAnimations().map((a) => [a.getName(), threeClip(a)]));

  // the native clips: the rest goes, rotations + the pelvis translation stay
  const keepNative = new Set(UAL2_CLIPS);
  for (const a of root.listAnimations()) {
    if (!keepNative.has(a.getName())) { for (const s of a.listSamplers()) s.dispose(); for (const c of a.listChannels()) c.dispose(); a.dispose(); continue; }
    for (const ch of a.listChannels()) {
      const pn = ch.getTargetPath(), nn = ch.getTargetNode()?.getName();
      if (!(pn === 'rotation' || (pn === 'translation' && nn === 'pelvis'))) { const s = ch.getSampler(); ch.dispose(); if (s) s.dispose(); }
    }
  }
  for (const n of root.listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.setMesh(null); n.setSkin(null); }
  for (const s of root.listSkins()) s.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();

  const nodeOf = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const buf = root.listBuffers()[0];
  const nativeThree = new Map();
  for (const a of root.listAnimations()) nativeThree.set(a.getName(), threeClip(a));

  // the baked clips
  const gaits = {};
  for (const sex of ['F', 'M']) {
    const tgt = bodies[sex].top;
    tgt.updateMatrixWorld(true);
    const rt = new Retargeter({ targetRoot: tgt, sourceRoot: source.top, map: UAL_TO_UBC, hip: UAL_HIP, aim: AIM_RULES, contacts: UBC_CONTACTS, correct: 'all', rootMotion: 'strip' });
    for (const name of UAL1_CLIPS) {
      const c = sourceClips.get(name);
      if (!c) throw new Error(`[npc clips] ${name} not in UAL1`);
      const { clip: baked } = rt.bake(c, { fps: 30, amp: BAKE_AMP[name] ?? 1 });
      const anim = doc.createAnimation(`${sex}|${name}`);
      for (const tr of baked.tracks) {
        const [bone, prop] = tr.name.split('.');
        const node = nodeOf.get(bone);
        if (!node) continue;
        const input = doc.createAccessor().setType('SCALAR').setArray(Float32Array.from(tr.times)).setBuffer(buf);
        const output = doc.createAccessor().setType(prop === 'quaternion' ? 'VEC4' : 'VEC3').setArray(Float32Array.from(tr.values)).setBuffer(buf);
        const smp = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
        anim.addSampler(smp);
        anim.addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(prop === 'quaternion' ? 'rotation' : 'translation').setSampler(smp));
      }
      if (GAITS.includes(name)) gaits[`${sex}|${name}`] = gaitTable(tgt, baked);
    }
    rt.restoreBind();
  }
  // a native gait on each body; the pelvis scale is the ratio of pelvis rest heights (the clip's own frame is the female body's)
  const bonesOf = (t) => { const o = {}; t.traverse((q) => { if (q.isBone) o[q.name] = q; }); return o; };
  const pF = bonesOf(bodies.F.top).pelvis, pM = bonesOf(bodies.M.top).pelvis;
  const pelvisScale = { F: 1, M: +(pM.position.length() / pF.position.length()).toFixed(4) };
  for (const sex of ['F', 'M']) {
    for (const name of GAITS) {
      if (!nativeThree.has(name)) continue;
      const clip = nativeThree.get(name);
      const c2 = clip.clone();
      for (const tr of c2.tracks) if (tr.name === 'pelvis.position') for (let i = 0; i < tr.values.length; i++) tr.values[i] *= pelvisScale[sex];
      gaits[`${sex}|${name}`] = gaitTable(bodies[sex].top, c2);
    }
  }

  await doc.transform(resample({ tolerance: 2e-4 }), dedup(), prune({ keepLeaves: true }));
  const asset = root.getAsset();
  asset.generator = GENERATOR;
  asset.extras = { provenance: checkProvenance(provenance), r5Clips: { native: UAL2_CLIPS, baked: UAL1_CLIPS, gaits, pelvisScale } };
  const bytes = await (await io()).writeBinary(doc);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  return { bytes: bytes.byteLength, clips: root.listAnimations().length, gaits: Object.fromEntries(Object.entries(gaits).map(([k, g]) => [k, { dur: g.dur, dist: g.dist, speed: +(g.dist / g.dur).toFixed(3) }])) };
}

/**
 * A built clip pack, back as three's clips (name -> AnimationClip; native clips copied per body with the pelvis scaled, as the
 * runtime bank does). The tiers' simplification reads the person's own clips through this (lib/human.mjs, `posedOf`).
 */
export async function readClipPack(file) {
  const doc = await (await io()).read(file);
  const ex = doc.getRoot().getAsset().extras?.r5Clips || {};
  const byName = new Map();
  for (const a of doc.getRoot().listAnimations()) byName.set(a.getName(), threeClip(a));
  const pelvis = ex.pelvisScale || { F: 1, M: 1 };
  return (sex, name) => {
    const key = `${sex}|${name}`;
    if (byName.has(key)) return byName.get(key);
    const base = byName.get(name);
    if (!base) return null;
    const c = base.clone();
    c.name = key;
    for (const tr of c.tracks) if (tr.name === 'pelvis.position') for (let i = 0; i < tr.values.length; i++) tr.values[i] *= pelvis[sex] || 1;
    byName.set(key, c);
    return c;
  };
}
