/**
 * Spike C (hybrid) — offline baker.
 *
 *   node tools/spike-hybrid-bake.mjs [--src <gltf>] [--out public/anims-hybrid/aloy-ual.json] [--fps 24]
 *
 * Loads the Quaternius UAL clip pack and aloy.glb, maps UAL bones onto Aloy's
 * (labs/hybrid/boneMap.js), samples each clip at `fps`, and bakes per
 * Aloy bone CHAR-SPACE rotation tracks in exactly the convention
 * playerAnimator.js uses (L(R) = W^-1 R W, applied on top of bind):
 *
 *   D     = Qsrc(t) * Qsrc_rest^-1          char-space delta of the source bone
 *   C     = align(dirAloyBind -> dirSrcRest) rest-pose correction (limbs only)
 *   Rtot  = D * C                            absolute char-space rotation to
 *                                            apply to Aloy's bind orientation
 *   R     = Rtot(parentMapped)^-1 * Rtot     what gets stored (composes down
 *                                            the chain like _rotQ calls do)
 *
 * With C, Aloy's limb bones point exactly where the source bones point
 * (T-pose source vs A-pose Aloy is absorbed); axial bones keep Aloy's own
 * bind posture and receive only the source delta. Pelvis translation is
 * stored in source meters relative to the rest hips (scale by hip height at
 * runtime). A numeric self-check re-simulates Aloy's skeleton with the baked
 * locals and asserts the limb directions match the source per sample.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { BONE_MAP, CLIPS, PELVIS, SRC_HIPS, SYNC_SRC, SYNC_TIP, SRC_FEET, CONTACT_EPS } from '../labs/hybrid/boneMap.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const args = process.argv.slice(2);
const flag = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const SRC = resolve(repo, flag('--src', 'models-staging/anims-hybrid/quaternius-ual/AnimationLibrary_Godot_Standard.gltf'));
const ALOY = resolve(repo, flag('--aloy', 'public/models/aloy.glb'));
const OUT = resolve(repo, flag('--out', 'public/anims-hybrid/aloy-ual.json'));
const FPS = parseFloat(flag('--fps', '24'));

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

/* ----------------------------- rig loading ------------------------------ */

async function loadRig(file) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const byName = new Map();
  const parent = new Map();
  for (const n of nodes) {
    byName.set(n.getName(), n);
    for (const c of n.listChildren()) parent.set(c, n);
  }
  // per-node local TRS (mutable copies so clips can override)
  const local = new Map();
  for (const n of nodes) {
    local.set(n, {
      t: new THREE.Vector3(...n.getTranslation()),
      r: new THREE.Quaternion(...n.getRotation()),
      s: new THREE.Vector3(...n.getScale()),
    });
  }
  const rest = new Map();
  for (const [n, l] of local) rest.set(n, { t: l.t.clone(), r: l.r.clone(), s: l.s.clone() });
  const worldCache = new Map();
  const world = (n) => {
    let w = worldCache.get(n);
    if (w) return w;
    const l = local.get(n);
    const m = new THREE.Matrix4().compose(l.t, l.r, l.s);
    const p = parent.get(n);
    w = p ? world(p).clone().multiply(m) : m;
    worldCache.set(n, w);
    return w;
  };
  const invalidate = () => worldCache.clear();
  const resetToRest = () => { for (const [n, l] of local) { const r = rest.get(n); l.t.copy(r.t); l.r.copy(r.r); l.s.copy(r.s); } invalidate(); };
  return { doc, root, nodes, byName, parent, local, rest, world, invalidate, resetToRest };
}

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const worldQuat = (rig, n, out = new THREE.Quaternion()) => { rig.world(n).decompose(_p, out, _s); return out; };
const worldPos = (rig, n, out = new THREE.Vector3()) => out.setFromMatrixPosition(rig.world(n));
const dirBetween = (rig, a, b) => worldPos(rig, b).sub(worldPos(rig, a)).normalize();

/* ---------------------------- clip sampling ----------------------------- */

function clipChannels(anim) {
  const chans = [];
  for (const c of anim.listChannels()) {
    const s = c.getSampler();
    chans.push({
      node: c.getTargetNode(), path: c.getTargetPath(),
      times: Array.from(s.getInput().getArray()), values: Array.from(s.getOutput().getArray()),
      interp: s.getInterpolation(),
    });
  }
  return chans;
}

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
function applyClipAt(rig, chans, t) {
  for (const ch of chans) {
    const { times, values, path, interp } = ch;
    const l = rig.local.get(ch.node);
    const n = times.length;
    let i = 0;
    while (i < n - 1 && times[i + 1] <= t) i++;
    const i2 = Math.min(i + 1, n - 1);
    const span = times[i2] - times[i];
    let a = span > 1e-9 ? (t - times[i]) / span : 0;
    a = Math.max(0, Math.min(1, a));
    if (interp === 'STEP') a = 0;
    if (path === 'rotation') {
      _qa.fromArray(values, i * 4); _qb.fromArray(values, i2 * 4);
      l.r.copy(_qa).slerp(_qb, a);
    } else if (path === 'translation') {
      l.t.set(values[i * 3] + (values[i2 * 3] - values[i * 3]) * a,
        values[i * 3 + 1] + (values[i2 * 3 + 1] - values[i * 3 + 1]) * a,
        values[i * 3 + 2] + (values[i2 * 3 + 2] - values[i * 3 + 2]) * a);
    } else if (path === 'scale') {
      l.s.set(values[i * 3] + (values[i2 * 3] - values[i * 3]) * a,
        values[i * 3 + 1] + (values[i2 * 3 + 1] - values[i * 3 + 1]) * a,
        values[i * 3 + 2] + (values[i2 * 3 + 2] - values[i * 3 + 2]) * a);
    }
  }
  rig.invalidate();
}

/* ------------------------------ main bake ------------------------------- */

const ual = await loadRig(SRC);
const aloy = await loadRig(ALOY);

const need = (rig, name, what) => {
  const n = rig.byName.get(name);
  if (!n) throw new Error(`${what} bone missing: ${name}`);
  return n;
};

// Aloy: nearest mapped ancestor lookup + bind data
const aloyMapped = new Set();
for (const m of BONE_MAP) for (const [d] of m.dst) aloyMapped.add(d);
const nearestMapped = (name) => {
  let n = aloy.parent.get(need(aloy, name, 'aloy'));
  while (n) { if (aloyMapped.has(n.getName())) return n.getName(); n = aloy.parent.get(n); }
  return null;
};

// Per-map-entry static data
const entries = BONE_MAP.map((m) => {
  const srcNode = need(ual, m.src, 'source');
  const srcRestQ = worldQuat(ual, srcNode);
  const srcRestInv = srcRestQ.clone().invert();
  let C = new THREE.Quaternion();
  let dAloy = null, dSrcRest = null;
  if (m.tip) {
    dSrcRest = dirBetween(ual, srcNode, need(ual, m.tip[0], 'source tip'));
    dAloy = dirBetween(aloy, need(aloy, m.dst[0][0], 'aloy'), need(aloy, m.tip[1], 'aloy tip'));
    C = new THREE.Quaternion().setFromUnitVectors(dAloy, dSrcRest);
  }
  return {
    ...m, srcNode, srcRestInv, C, dAloy, dSrcRest,
    parentTarget: nearestMapped(m.dst[0][0]),
  };
});

// Aloy bind world quats (for the self-check simulation) and bind locals
const aloyBind = new Map();
for (const name of aloyMapped) {
  const n = need(aloy, name, 'aloy');
  aloyBind.set(name, { node: n, W: worldQuat(aloy, n), bindQ: aloy.local.get(n).r.clone() });
}

const hipsNode = need(ual, SRC_HIPS, 'source');
const hipsRest = worldPos(ual, hipsNode);
const syncSrc = need(ual, SYNC_SRC, 'source'), syncTip = need(ual, SYNC_TIP, 'source');
// foot-contact reference heights (source rest: feet flat on the floor)
const feet = {};
for (const side of ['L', 'R']) {
  const [ankle, toe] = SRC_FEET[side].map((n) => need(ual, n, 'source foot'));
  feet[side] = { ankle, toe, ankleY: worldPos(ual, ankle).y, toeY: worldPos(ual, toe).y };
}
const contactBits = () => {
  let bits = 0;
  for (const [side, f] of Object.entries(feet)) {
    const planted = worldPos(ual, f.toe).y < f.toeY + CONTACT_EPS || worldPos(ual, f.ankle).y < f.ankleY + CONTACT_EPS;
    if (planted) bits |= side === 'L' ? 1 : 2;
  }
  return bits;
};

const anims = ual.root.listAnimations();
const out = {
  version: 1,
  source: 'Quaternius Universal Animation Library (Godot Standard rig), CC0 1.0',
  sourceUrl: 'https://quaternius.com/packs/universalanimationlibrary.html',
  fps: FPS,
  hipsRestY: +hipsRest.y.toFixed(4),
  convention: 'bone.quaternion = bindQ * invW * R * W ; pelvis.position = bindP + M3 * (delta * hipScale)',
  clips: {},
};

const round = (v) => Math.round(v * 1e4) / 1e4;
const _r = new THREE.Quaternion(), _rt = new THREE.Quaternion(), _pr = new THREE.Quaternion();
const _id = new THREE.Quaternion();
let worstErr = 0;

for (const cdef of CLIPS) {
  const anim = anims.find((a) => a.getName() === cdef.src);
  if (!anim) { console.warn(`clip missing in source: ${cdef.src}`); continue; }
  const chans = clipChannels(anim);
  let dur = 0;
  for (const ch of chans) dur = Math.max(dur, ch.times[ch.times.length - 1]);
  // loops: n samples over [0,dur) (wrap back to 0); one-shots: include the end
  const nSeg = Math.max(1, Math.round(dur * FPS));
  const n = cdef.loop ? nSeg : nSeg + 1;
  const tracks = {};
  for (const name of aloyMapped) tracks[name] = [];
  const pelvis = [];
  const contact = [];
  const thighZ = [];
  const prevQ = new Map();
  let clipErr = 0;

  for (let k = 0; k < n; k++) {
    const t = Math.min(dur, k / FPS);
    ual.resetToRest();
    applyClipAt(ual, chans, t);

    const Rtot = new Map(); // aloy bone -> absolute char-space rotation
    const check = [];
    for (const e of entries) {
      const Qs = worldQuat(ual, e.srcNode);
      const D = Qs.multiply(e.srcRestInv);           // D = Q(t) * Qrest^-1
      const abs = D.clone().multiply(e.C);            // Rtot = D * C
      const parentR = e.parentTarget ? Rtot.get(e.parentTarget) : _id;
      const Dlocal = _pr.copy(parentR).invert().multiply(abs).clone();
      let prev = parentR.clone();
      for (const [dst, frac] of e.dst) {
        const Rk = _id.clone().slerp(Dlocal, frac);
        prev = prev.multiply(Rk);
        Rtot.set(dst, prev.clone());
        // sign continuity for compact, well-behaved tracks
        const pq = prevQ.get(dst);
        if (pq && pq.dot(Rk) < 0) Rk.set(-Rk.x, -Rk.y, -Rk.z, -Rk.w);
        prevQ.set(dst, Rk.clone());
        tracks[dst].push(round(Rk.x), round(Rk.y), round(Rk.z), round(Rk.w));
      }
      if (e.tip) check.push({ e, want: dirBetween(ual, e.srcNode, ual.byName.get(e.tip[0])) });
    }

    // pelvis translation (source meters, char space, relative to rest hips)
    const hp = worldPos(ual, hipsNode).sub(hipsRest);
    pelvis.push(round(hp.x), round(hp.y), round(hp.z));
    contact.push(contactBits());
    // gait sync: forward component of the left thigh direction
    thighZ.push(dirBetween(ual, syncSrc, syncTip).z);

    /* ---- self-check: re-simulate Aloy with the baked locals -------------
       bone.quaternion = bindQ * invW * R * W, walk the hierarchy, compare the
       corrected limb directions with the source directions at this sample. */
    for (const [name, b] of aloyBind) {
      const R = Rtot.get(name);
      const l = aloy.local.get(b.node);
      _r.copy(b.W).invert();
      const last = tracks[name];
      _rt.set(last[last.length - 4], last[last.length - 3], last[last.length - 2], last[last.length - 1]);
      l.r.copy(b.bindQ).multiply(_r).multiply(_rt).multiply(b.W);
      void R;
    }
    aloy.invalidate();
    for (const { e, want } of check) {
      const got = dirBetween(aloy, aloy.byName.get(e.dst[e.dst.length - 1][0]), aloy.byName.get(e.tip[1]));
      const err = Math.acos(Math.max(-1, Math.min(1, got.dot(want)))) * 180 / Math.PI;
      clipErr = Math.max(clipErr, err);
    }
    aloy.resetToRest();
  }
  worstErr = Math.max(worstErr, clipErr);

  // sync phase: sample where the left thigh swings furthest forward
  let syncPhase = 0;
  if (cdef.gait) {
    let best = -Infinity, bi = 0;
    for (let k = 0; k < thighZ.length; k++) if (thighZ[k] > best) { best = thighZ[k]; bi = k; }
    syncPhase = bi / n;
  }

  const flight = contact.filter((c) => c === 0).length;
  out.clips[cdef.name] = {
    src: cdef.src, loop: !!cdef.loop, conform: cdef.conform !== false, duration: round(dur), n,
    syncPhase: round(syncPhase), pelvis, contact, bones: tracks,
  };
  console.log(`${cdef.name.padEnd(11)} <- ${cdef.src.padEnd(18)} dur=${dur.toFixed(3)}s n=${n} loop=${!!cdef.loop} sync=${syncPhase.toFixed(3)} flight=${flight}/${n} maxDirErr=${clipErr.toFixed(3)}deg`);
}

out.boneMap = BONE_MAP.map((m) => ({ src: m.src, dst: m.dst, corrected: !!m.tip }));
out.restCorrection = Object.fromEntries(entries.filter((e) => e.tip).map((e) => [e.dst[0][0], {
  aloyBindDir: e.dAloy.toArray().map(round), srcRestDir: e.dSrcRest.toArray().map(round),
  C: e.C.toArray().map(round), angleDeg: round(2 * Math.acos(Math.min(1, Math.abs(e.C.w))) * 180 / Math.PI),
}]));

mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify(out);
writeFileSync(OUT, json);
console.log(`\nwrote ${OUT} (${(json.length / 1024).toFixed(0)} KB, ${Object.keys(out.clips).length} clips, ${aloyMapped.size} bones)`);
console.log(`self-check: worst limb direction error ${worstErr.toFixed(4)} deg (should be ~0)`);
console.log('rest corrections (deg):', Object.entries(out.restCorrection).map(([k, v]) => `${k}=${v.angleDeg}`).join(' '));
if (worstErr > 0.5) { console.error('SELF-CHECK FAILED'); process.exitCode = 2; }
