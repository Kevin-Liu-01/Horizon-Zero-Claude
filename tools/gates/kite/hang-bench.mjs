// M3 area B, wave 1: the chest-bar hang (the M1.3f blockout, src/entities/anim/hangPose.js) under the grey kite
// (src/entities/anim/kite/greyKite.js), graded in Node on Brea dressed, her real animator stepped at 60 Hz (the hero
// sweep's bench, tools/gates/hero-sweep/bench.mjs). No browser.
//   node tools/gates/kite/hang-bench.mjs [--json <file>]
// The bars (BIBLE §12, KF1, F52; the owner's: never an arm or hand behind the head):
//   both wrists in front of the head's frontal plane and at or below head height (the head bone, the skull's base);
//   both elbows below their shoulder joints; the bar between the sternum and the chin, 0.30-0.40 m in front of the
//   chest; the kite clear of her head. Also: the kite's triangles (<= 6 k*) and draws (1).
import { writeFileSync } from 'node:fs';
import { makeBench, step } from '../hero-sweep/bench.mjs';
import { buildSweep } from '../hero-sweep/measure.mjs';
import { THREE } from '../hero-sweep/load.mjs';
import { buildGreyKite, placeAtBar, KITE_DIMS } from '../../../src/entities/anim/kite/greyKite.js';

const args = process.argv.slice(2);
const out = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const r3 = (v) => +v.toFixed(3);

const R = await makeBench();
const M = buildSweep(R, THREE);
const an = R.an, b = an.b;
an.setHangPose(true);
let worstFront = Infinity, worstBelow = Infinity, worstElbow = -Infinity, steps = 0;
const per = [];
const V = () => new THREE.Vector3();
const sample = () => {
  const h = M.hangCheck();
  const e = {};
  for (const s of ['L', 'R']) {
    const sh = an._charOf(b[`upArm${s}`].bone, V()), el = an._charOf(b[`loArm${s}`].bone, V()), wr = an._charOf(b[`hand${s}`].bone, V());
    e[s] = { elbowOverShoulderM: r3(el.y - sh.y), wristY: r3(wr.y), shoulderY: r3(sh.y) };
  }
  worstFront = Math.min(worstFront, h.l.front, h.r.front);
  worstBelow = Math.min(worstBelow, h.l.belowHeadBoneM, h.r.belowHeadBoneM);
  worstElbow = Math.max(worstElbow, e.L.elbowOverShoulderM, e.R.elbowOverShoulderM);
  steps++;
  return { h, e };
};
for (let i = 0; i < 90; i++) { step(R); if (i >= 30) per.push(sample()); }
const last = per[per.length - 1];
const info = an.hangPoseInfo();
const s5 = an._charOf(b.spine5.bone, V());
const torsoR = M.caps.filter((c) => /^torso/.test(c.name)).reduce((m, c) => Math.max(m, c.r), 0);
const barFromSpine = info.bar[2] - s5.z, barFromChest = barFromSpine - torsoR;
const barK = (info.bar[1] - info.sternY) / (info.chinY - info.sternY);

// the kite on the bar, in the model's space: its lowest point over her crown
const K = buildGreyKite();
const root = an.space?.root || R.model;
root.add(K.group);
placeAtBar(K.group, root, info.bar);
K.group.updateMatrixWorld(true);
// the cells' bottom over her crown (the head bone is the skull's base; the crown is about 0.20 m over it on this rig:
// measure.mjs reads 0.29 m from the bar's wrists to the crown and 0.09 m to the head bone), and the bridle's nearest
// approach to her head's centre (the bridle runs from the bar's ends up to the cells)
const headW = V();
b.head.bone.getWorldPosition(headW);
const crownY = headW.y + (last.h.l.belowCrownM - last.h.l.belowHeadBoneM);
const cellsBottomY = K.group.localToWorld(V().set(0, KITE_DIMS.rise, 0)).y;
const kiteClearM = cellsBottomY - crownY;
const headC = headW.clone().add(V().set(0, 0.1, 0));
let bridleMin = Infinity;
{
  const D = KITE_DIMS, hs = D.span / 2, len = D.cellChord * 2 + D.gap, zc = -D.back, zf = zc + len / 2, za = zc - len / 2;
  for (const sx of [-1, 1]) for (const z of [zf - D.cellChord * 0.5, za + D.cellChord * 0.5]) {
    const a = K.group.localToWorld(V().set(sx * D.barLen / 2, 0, 0)), c = K.group.localToWorld(V().set(sx * hs * 0.55, D.rise, z));
    const seg = new THREE.Line3(a, c), q = V();
    seg.closestPointToPoint(headC, true, q);
    bridleMin = Math.min(bridleMin, q.distanceTo(headC));
  }
}
root.remove(K.group);

const rows = {
  wristsInFront: { min_m: r3(worstFront), pass: worstFront > 0 },
  wristsAtOrBelowHead: { min_belowHeadBone_m: r3(worstBelow), pass: worstBelow >= 0 },
  elbowsBelowShoulders: { max_elbowOverShoulder_m: r3(worstElbow), pass: worstElbow < 0 },
  barSternumToChin: { k: r3(barK), barY: info.bar[1], sternY: info.sternY, chinY: info.chinY, pass: barK >= 0 && barK <= 1 },
  barInFrontOfChest: { fromSpine05_m: r3(barFromSpine), fromChestSurface_m: r3(barFromChest), torsoCapR: r3(torsoR), passFromSpine: barFromSpine >= 0.3 && barFromSpine <= 0.4, passFromSurface: barFromChest >= 0.3 && barFromChest <= 0.4 },
  kiteClearOfHead: { cellsOverCrown_m: r3(kiteClearM), bridleFromHeadCentre_m: r3(bridleMin), pass: kiteClearM > 0 && bridleMin > 0.15 },
  kiteBudget: { triangles: K.triangles, draws: K.draws, pass: K.triangles <= 6000 && K.draws === 1 },
};
const res = { steps, rows, last, bar: info };
console.log(JSON.stringify(res, null, 1));
if (out) writeFileSync(out, JSON.stringify(res, null, 1));
