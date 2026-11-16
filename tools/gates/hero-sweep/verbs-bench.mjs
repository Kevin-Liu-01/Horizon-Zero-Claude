/**
 * M1.3h (hero-anim verbs) — THE CLIP AUDIT FOR THE SLICE'S OTHER VERBS, in Node: Brea dressed (`load.mjs`), her real
 * animator with `anim/sliceVerbs.js`, the game's HeroRig, stepped at 60 Hz, graded by `measure.mjs` (the sweep's own
 * test, the function the page rows send). One row per verb:
 *   saltRake  0 behind-head and 0 head-plane steps; BOTH HANDS ON THE RAKE: each palm's centre (wrist to middle knuckle,
 *             half way) within 0.03 m of the haft's axis on every step at full weight; the head within 0.05 m of the
 *             ground on every step of the pull
 *   alidade   0 behind / 0 plane; the right wrist in front of the head's frontal plane on every step of the hold
 *   sit       0 behind / 0 plane; STOWED GEAR CLEARS THE GROUND AND THE CISTERN LIP BY >= 0.02 m: she is seated as
 *             `player.ride` seats her at the home Brazier (her pelvis on the seat block's top, SEAT.height over the ground,
 *             facing the bowl), and every stowed-gear vertex (the stow kit) is graded against the ground and against the
 *             cistern (its lathe: outer radius CISTERN.r, lip 0.55 m, where brazier-spots puts it from the seat)
 *   kindle    0 behind / 0 plane (the clip runs whole, from standing to standing)
 *   caneCut   0 behind / 0 plane (the same)
 * The clips are the people's pack's (public/models/npc/npc-clips.glb), as the game plays them.
 *
 *   node tools/gates/hero-sweep/verbs-bench.mjs [--only saltRake,kindle] [--json out.json]
 */
import { makeBench, step, reset, CLIPS } from './bench.mjs';
import { buildSweep } from './measure.mjs';
import { THREE } from './load.mjs';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const { SEAT, CISTERN, offsetOn } = await import(path.join(ROOT, 'src/world/settlements/brazier-spots.js'));
const { RAKE } = await import(path.join(ROOT, 'src/entities/anim/sliceVerbs.js'));
const CISTERN_LIP = 0.55;

async function npcClips() {
  await MeshoptDecoder.ready;
  const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
  const b = readFileSync(path.join(ROOT, 'public/models/npc/npc-clips.glb'));
  const g = await new Promise((r, j) => L.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), '', r, j));
  const out = {};
  for (const c of g.animations) out[c.name] = c;
  return out;
}

/** Distance from a point to the haft's axis (the line through two points), metres. */
function lineDist(P, A, B) {
  const ax = B[0] - A[0], ay = B[1] - A[1], az = B[2] - A[2], L = Math.hypot(ax, ay, az) || 1;
  const px = P[0] - A[0], py = P[1] - A[1], pz = P[2] - A[2];
  const t = (px * ax + py * ay + pz * az) / L;
  return Math.hypot(px - ax / L * t, py - ay / L * t, pz - az / L * t);
}

/** The stowed gear's vertices (char space) on this step: every stow-kit mesh, sampled at up to 600 vertices each. */
function gearPoints(R, out = []) {
  out.length = 0;
  const v = new THREE.Vector3();
  R.model.updateMatrixWorld(true);
  R.model.traverse((o) => {
    if (!o.isMesh || !/stowkit/.test(o.userData?.heroPart || '')) return;
    const P = o.geometry?.attributes?.position;
    if (!P) return;
    const st = Math.max(1, Math.floor(P.count / 600));
    for (let i = 0; i < P.count; i += st) {
      if (o.isSkinnedMesh) o.getVertexPosition(i, v); else v.fromBufferAttribute(P, i);
      v.applyMatrix4(o.matrixWorld);
      R.model.worldToLocal(v);
      out.push(v.x, v.y, v.z);
    }
  });
  return out;
}

const VERB_ROWS = {
  saltRake: async (R, M) => {
    const an = R.an, len = an.playVerb('rake');
    if (!len) return { skip: 'the rake did not start' };
    let palmMax = 0, palmAt = null, headMax = 0, full = 0, n = 0;
    for (let i = 0; i < Math.round((len + 0.6) * 60); i++) {
      step(R);
      M.sample({ T: i / 60 });
      const I = an.verbInfo();
      if (I?.rake && I.w >= 0.999) {
        full++;
        const dR = lineDist(I.rake.palmR, I.rake.head, I.rake.gripR), dL = lineDist(I.rake.palmL, I.rake.head, I.rake.gripR);
        if (Math.max(dR, dL) > palmMax) { palmMax = Math.max(dR, dL); palmAt = { T: +(i / 60).toFixed(3), r: +dR.toFixed(4), l: +dL.toFixed(4) }; }
        const u = an._vb.u ?? 0;
        if (u >= RAKE.outK + 0.02) { n++; headMax = Math.max(headMax, I.rake.head[1] - I.rake.ground); }
      }
    }
    const fails = [];
    if (full < 60) fails.push(`only ${full} steps at full weight`);
    if (!(palmMax <= 0.03)) fails.push(`a palm ${palmMax.toFixed(4)} m off the haft (bar 0.03) ${JSON.stringify(palmAt)}`);
    if (!(headMax <= 0.05)) fails.push(`the head ${headMax.toFixed(4)} m over the ground in the pull (bar 0.05)`);
    return { fails, palmOffHaftMaxM: +palmMax.toFixed(4), palmAt, headOverGroundMaxM: +headMax.toFixed(4), fullSteps: full, pullSteps: n, lenS: len };
  },
  alidade: async (R, M) => {
    let S = 0;
    CLIPS.alidade.run(R, () => { M.sample({ T: S++ / 60 }); });
    const fails = [];
    if (!(R.aliFrontMin > 0)) fails.push(`the right wrist ${R.aliFrontMin} m behind the head plane in the hold`);
    return { fails, aliFrontMin: +R.aliFrontMin.toFixed(4) };
  },
  sit: async (R, M) => {
    const p = R.player, an = R.an;
    p.riding = {}; p.grounded = false;
    for (let i = 0; i < 60; i++) step(R);
    // seated as player.ride seats her: the pelvis on the seat's top, the ground SEAT.height under it (char space: the
    // ground is at pelvisY - SEAT.height); she faces the bowl, and the cistern stands where brazier-spots puts it
    const seatW = offsetOn(SEAT.bearing, SEAT.dist), cisW = offsetOn(CISTERN.bearing, CISTERN.dist);
    // char frame: +z from the seat toward the bowl (world: bowl at 0, seat at seatW); +x her left
    const fz = { x: -seatW.x, z: -seatW.z }, fl = Math.hypot(fz.x, fz.z); fz.x /= fl; fz.z /= fl;
    const left = { x: fz.z, z: -fz.x };   // engine axes: x east, z south; her left is forward turned +90 about +y
    const rel = { x: cisW.x - seatW.x, z: cisW.z - seatW.z };
    const cis = { x: rel.x * left.x + rel.z * left.z, z: rel.x * fz.x + rel.z * fz.z };
    let groundMin = 9, lipMin = 9, worst = null;
    const pts = [];
    const pel = new THREE.Vector3();
    for (let i = 0; i < 120; i++) {
      step(R);
      M.sample({ T: i / 60, cloth: true });
      an._charOf(an.b.pelvis.bone, pel);
      const ground = pel.y - SEAT.height;
      gearPoints(R, pts);
      for (let k = 0; k < pts.length; k += 3) {
        const x = pts[k], y = pts[k + 1], z = pts[k + 2];
        const g = y - ground;
        if (g < groundMin) { groundMin = g; worst = { T: +(i / 60).toFixed(3), at: [+x.toFixed(3), +y.toFixed(3), +z.toFixed(3)], ground: +ground.toFixed(3) }; }
        // the cistern as a solid: radius CISTERN.r, from the ground to the lip
        const rd = Math.hypot(x - cis.x, z - cis.z) - CISTERN.r, yd = y - (ground + CISTERN_LIP);
        const d = rd > 0 && yd > 0 ? Math.hypot(rd, yd) : rd > 0 ? rd : yd > 0 ? yd : -Math.min(-rd, -yd);
        if (d < lipMin) lipMin = d;
      }
    }
    p.riding = null; p.grounded = true;
    const fails = [];
    if (!pts.length) fails.push('no stowed gear found');
    if (!(groundMin >= 0.02)) fails.push(`stowed gear ${groundMin.toFixed(4)} m over the ground seated (bar 0.02) ${JSON.stringify(worst)}`);
    if (!(lipMin >= 0.02)) fails.push(`stowed gear ${lipMin.toFixed(4)} m from the cistern (bar 0.02)`);
    return { fails, gearOverGroundMinM: +groundMin.toFixed(4), gearToCisternMinM: +lipMin.toFixed(4), cisternChar: [+cis.x.toFixed(3), +cis.z.toFixed(3)], worst, gearPts: pts.length / 3 };
  },
  kindle: async (R, M) => {
    const len = R.an.playVerb('kindle');
    if (!len) return { skip: 'the kindle did not start' };
    for (let i = 0; i < Math.round((len + 0.6) * 60); i++) { step(R); M.sample({ T: i / 60 }); }
    return { fails: [], lenS: len };
  },
  caneCut: async (R, M) => {
    const len = R.an.playVerb('caneCut');
    if (!len) return { skip: 'the cane cut did not start' };
    for (let i = 0; i < Math.round((len + 0.6) * 60); i++) { step(R); M.sample({ T: i / 60 }); }
    return { fails: [], lenS: len };
  },
};

export async function runVerbs(only = null) {
  const R = await makeBench({ melee: true });
  R.ctx.verbClips = await npcClips();
  const M = buildSweep(R, THREE);
  R.M = M;
  const out = {};
  for (const name of only || Object.keys(VERB_ROWS)) {
    if (!VERB_ROWS[name]) continue;
    reset(R);
    M.begin(name);
    const extra = await VERB_ROWS[name](R, M);
    const r = M.end();
    const fails = [...(extra.fails || [])];
    if (extra.skip) fails.push(extra.skip);
    if (r.frames < 20) fails.push(`only ${r.frames} steps graded`);
    if (r.behind) fails.push(`${r.behind} behind-head steps`);
    if (r.plane) fails.push(`${r.plane} steps above the shoulder behind the head plane`);
    out[name] = { pass: fails.length === 0, fails, frames: r.frames, behind: r.behind, plane: r.plane, overShoulder: r.overShoulder, behindAt: r.behindAt || null, planeAt: r.planeAt || null, ...extra };
    delete out[name].fails; out[name].fails = fails;
    // let the verb's fade end before the next row
    for (let i = 0; i < 40; i++) step(R);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const quiet = console.warn; console.warn = () => {};
  const out = await runVerbs(flag('--only') ? flag('--only').split(',') : null);
  console.warn = quiet;
  for (const [k, r] of Object.entries(out)) console.log(k.padEnd(9), r.pass ? 'PASS' : 'FAIL', JSON.stringify({ ...r, pass: undefined }));
  if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(out, null, 1));
}
