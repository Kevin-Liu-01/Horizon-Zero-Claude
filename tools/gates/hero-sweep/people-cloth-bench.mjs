/**
 * (cloth round 6) The people's cloth in Node: every shipped person's dyn_ chains on the shared solver (cloth/strands.js,
 * through src/world/npc/people/chains.js PersonChains, as the game builds them), the person's skeleton in its bind pose,
 * stepped at 60 Hz of sim time for 10 s while it walks at 1.3 m/s with its thighs swinging +-25 deg at 0.9 Hz and the
 * trade wind (5.5 m/s from 045) on it. Per person: which chains are on the solver and as what, the particles, and the
 * cloth's own ring timing (mean, p95) after the first second. Bar (brief 4.2 C10): a near person <= 0.02 ms mean.
 * `--repeat N` (default 3) runs each person N times on fresh chains and grades the lowest mean (the box's load only adds
 * to a timing; every repeat's mean is reported beside it).
 *
 *   node tools/gates/hero-sweep/people-cloth-bench.mjs [--only oro,pit-farmer] [--repeat 3] [--json out.json]
 * Nothing here writes inside the repo except with --json to a path you name.
 */
import path from 'node:path';
import { readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { io } from '../../build/recipes/lib/human/face.mjs';
import { PersonChains } from '../../../src/world/npc/people/chains.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const hr = () => Number(process.hrtime.bigint()) / 1e6;
globalThis.__clothClock = hr;
const DIR = path.join(ROOT, 'public/models/npc');
const ids = flag('--only') ? flag('--only').split(',') : readdirSync(DIR).filter((f) => f.endsWith('.glb') && !/^(atlas-|npc-clips)/.test(f)).map((f) => f.slice(0, -4));
const WIND = { x: -3.9, z: -3.9 };

async function rig(id) {
  const doc = await (await io()).read(path.join(DIR, `${id}.glb`));
  const ex = doc.getRoot().getAsset().extras.r5Npc;
  const joints = doc.getRoot().listSkins()[0].listJoints();
  const parentOf = new Map();
  for (const n of doc.getRoot().listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
  const map = new Map(), bones = {};
  for (const j of joints) {
    const b = new THREE.Bone(); b.name = j.getName();
    b.position.fromArray(j.getTranslation()); b.quaternion.fromArray(j.getRotation()); b.scale.fromArray(j.getScale());
    map.set(j, b); bones[b.name] = b;
  }
  const root = new THREE.Group();
  for (const j of joints) { const p = parentOf.get(j); (p && map.has(p) ? map.get(p) : root).add(map.get(j)); }
  root.scale.setScalar(ex.scale);
  return { root, bones, ex };
}

const out = {};
for (const id of ids) {
  let R;
  try { R = await rig(id); } catch (e) { out[id] = { error: String(e.message || e).slice(0, 200) }; continue; }
  const { root, bones, ex } = R;
  if (!ex?.chains) { out[id] = { chains: 0 }; continue; }
  const reps = [];
  let ch = null, st = null;
  for (let rep = 0; rep < Math.max(1, +flag('--repeat', 3)); rep++) {
  root.position.set(0, 0, 0); root.updateMatrixWorld(true);
  ch = new PersonChains(bones, ex.chains, { worldScale: ex.scale });
  st = ch.strands;
  const th = ['thigh_l', 'thigh_r'].map((n) => bones[n]), th0 = th.map((b) => b?.quaternion.clone());
  const ax = new THREE.Vector3(1, 0, 0), q = new THREE.Quaternion();
  for (let f = 0; f < 600; f++) {
    const t = f / 60;
    root.position.z = 1.3 * t;
    th.forEach((b, k) => { if (!b) return; q.setFromAxisAngle(ax, Math.sin(t * 2 * Math.PI * 0.9 + k * Math.PI) * 25 * Math.PI / 180); b.quaternion.copy(th0[k]).multiply(q); });
    root.updateMatrixWorld(true);
    if (f === 60 && st) { st.sys.ringN = 0; st.sys.ringI = 0; }
    ch.dt = 1 / 60; ch.update(WIND);
  }
  reps.push(st ? st.info().timing : null);
  th.forEach((b, k) => b && b.quaternion.copy(th0[k]));
  }
  const info = st ? st.info() : null;
  const best = reps.filter(Boolean).sort((a, b) => a.mean - b.mean)[0] || null;
  out[id] = { onSolver: info ? info.pieces.map((p) => `${p.name} ${p.C}x${p.R} ${p.mat}`) : [], particles: info?.particles ?? 0, timing: best, repeatMeans: reps.map((r) => r && +r.mean.toFixed(4)) };
}
const worst = Math.max(0, ...Object.values(out).map((r) => r.timing?.mean || 0));
for (const [id, r] of Object.entries(out)) console.log(id.padEnd(20), r.error ? `ERROR ${r.error}` : `${String(r.particles).padStart(3)} particles  mean ${r.timing?.mean?.toFixed(4) ?? '-'} ms  p95 ${r.timing?.p95?.toFixed(4) ?? '-'} ms  (means ${r.repeatMeans.join(' ')})  ${r.onSolver.join(', ')}`);
console.log('worst person mean', worst.toFixed(4), 'ms (bar 0.02)', worst <= 0.02 ? 'PASS' : 'FAIL');
if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify({ rows: out, worst }, null, 1));
