// M3 area B, wave 3: THE HANG'S LOOK in numbers (Node, Brea dressed, her real animator at 60 Hz; no browser). The
// review of wave 2b on the page: "in the held glide her head bows over a chin-high bar, and her legs stand as if on the
// ground". Read here in the glide (airborne, the law driving the clips), each in her character frame:
//   head pitch      the head bone's bind forward against the horizontal (deg, + down: a bow)
//   the bar         its height against her chin and sternum (k: 0 the sternum, 1 the chin) and against her eyes
//   the legs        each thigh's angle from vertical (+ forward), each knee's bend, each foot's point (deg from its
//                   standing angle, + toes down), and the feet's height under the pelvis
// and the same reads standing in her idle (the ground pose the hang must not look like).
//   node tools/gates/kite/hang-look.mjs [--json <file>]
import { writeFileSync } from 'node:fs';
import { makeBench, step, reset } from '../hero-sweep/bench.mjs';
import { THREE } from '../hero-sweep/load.mjs';
import { createFlightBody, openAt, stepFlight } from '../../../src/game/kite/flight.js';
import { flatWorld } from './world.mjs';

const args = process.argv.slice(2);
const out = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const R = await makeBench();
const an = R.an, b = an.b, p = R.player;
const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
const r1 = (v) => +v.toFixed(1), r3 = (v) => +v.toFixed(3);
const D = 180 / Math.PI;
/** a bone's bind-forward pitch in her char frame (deg, + down), the aimRig's read */
const pitchOf = (e, ax = [0, 0, 1]) => { const q = Q(); an._liveW(e.bone, q); q.multiply(e.invW); const f = V().fromArray(ax).applyQuaternion(q); return Math.atan2(-f.y, f.z) * D; };
function read() {
  R.model.updateMatrixWorld(true);
  const c = (k) => an._charOf(b[k].bone, V());
  const head = c('head'), nk = c(b.neck1 ? 'neck1' : 'spine5');
  const I = an.hangPoseInfo?.();
  const bar = I ? V().fromArray(I.bar) : null;
  const legs = {};
  for (const s of ['L', 'R']) {
    const th = c(`thigh${s}`), kn = c(`calf${s}`), ft = c(`foot${s}`);
    const toe = b[`ball${s}`] ? c(`ball${s}`) : null;
    const thighFwd = Math.atan2(kn.z - th.z, th.y - kn.y) * D, shinFwd = Math.atan2(ft.z - kn.z, kn.y - ft.y) * D;
    legs[s] = { thighFromVerticalDeg: r1(thighFwd), kneeBendDeg: r1(thighFwd - shinFwd), footPitchDeg: r1(pitchOf(b[`foot${s}`])), toeUnderAnkleM: toe ? r3(ft.y - toe.y) : null, footUnderPelvisM: r3(c('pelvis').y - ft.y) };
  }
  return { headPitchDeg: r1(pitchOf(b.head)), neckPitchDeg: b.neck1 ? r1(pitchOf(b.neck1)) : null,
    bar: bar && I ? { k: r3((bar.y - I.sternY) / (I.chinY - I.sternY)), underChinM: r3(I.chinY - bar.y), underHeadBoneM: r3(head.y - bar.y), inFrontOfHeadM: r3(bar.z - head.z) } : null, legs };
}
// standing (her idle)
reset(R); for (let i = 0; i < 60; i++) step(R);
const stand = read();
// the glide, airborne: the law opens it at 30 m and glides 3 s
reset(R);
p.grounded = false;
for (let i = 0; i < 21; i++) { p.grounded = false; step(R); }
const f = createFlightBody(), world = flatWorld({});
let s = openAt(f, { x: 0, y: 30, z: 0, headingDeg: 0, groundY: 0 });
const glide = [];
for (let i = 0; i < 60 * 4; i++) {
  an.setKiteFlight(s, f.t, { bank: 0 }); p.grounded = false; step(R);
  if (s === 'gliding' && f.t > 1) glide.push(read());
  s = stepFlight(s, f, {}, world, 1 / 60);
}
const last = glide[glide.length - 1];
const res = { stand, glide: last, glideSteps: glide.length, headPitchRangeDeg: [Math.min(...glide.map((g) => g.headPitchDeg)), Math.max(...glide.map((g) => g.headPitchDeg))] };
console.log(JSON.stringify(res, null, 1));
if (out) writeFileSync(out, JSON.stringify(res, null, 1));
