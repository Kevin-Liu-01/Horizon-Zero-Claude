/**
 * ROUND 5 PIPELINE PROOF — the Tiller species class (browser module).
 *
 * A generated GLB (tools/r5-poc/gen-creature.mjs) enters the game through
 * the SAME seam every Round-4 species used (docs/ROUND5-INVENTORY.md §2.2):
 * `assets.loadExtra` -> `machines.registerKind` -> `Machine` subclass ->
 * `attachRigRuntime` -> autorig `buildRig` -> `GaitController` ->
 * `foldMachineMeshes` -> `snapSockets`. Nothing in src/ is modified.
 *
 * The only new idea is where the skin weights come from. The generator knows
 * which bone owns every vertex (`_BONE`), and autorig already caches weights
 * per geometry (`geo.userData.rigKind === machine.kind` skips the capsule
 * capture), so seeding that cache from `_BONE` gives exact rigid plates with
 * zero changes to autorig. `TillerCapsule` leaves the cache empty and lets
 * autorig's capsule capture run — the measured baseline.
 */
import * as THREE from 'three';
import { rollLoot } from '/src/entities/machines/machine.js';
import { buildRig } from '/src/entities/machines/autorig.js';
import { GaitController } from '/src/entities/machines/gait.js';
import { attachRigRuntime, updateRigLOD, foldMachineMeshes } from '/src/entities/machines/rig/lod.js';
import { snapSockets } from '/src/entities/machines/rig/sockets.js';
import { ExpansionMachine } from '/src/entities/machines/rig/expansion-base.js';

export const TILLER_URL = '/models/r5-poc/tiller.glb';

/** loadExtra spec + onEntry that lifts the generator's extras onto the entry. */
export function tillerAssetSpec(height) {
  return { url: TILLER_URL, targetHeight: height, yaw: 0 };
}
export function liftExtras(entry) {
  const ex = entry.gltf?.parser?.json?.asset?.extras || {};
  entry.r5Rig = ex.r5Rig;
  entry.r5BoneOrder = ex.r5BoneOrder;
  entry.r5Sockets = ex.r5Sockets;
  // keep the generator's labels before any merge pass can drop the attribute
  entry.root.traverse((o) => {
    if (!o.isMesh) return;
    // getX, not .array: meshopt streams arrive INTERLEAVED (stride 4), so the
    // backing array of a 1-byte attribute is 4x its vertex count
    const a = o.geometry?.attributes?._bone;
    if (a && !o.geometry.userData.r5Labels) {
      const labels = new Uint8Array(a.count);
      for (let i = 0; i < a.count; i++) labels[i] = a.getX(i);
      o.geometry.userData.r5Labels = labels;
    }
    // DEQUANTISE ONCE PER KIND. The GLB ships KHR_mesh_quantization +
    // EXT_meshopt_compression (16-bit normalised positions, interleaved
    // streams): 5x smaller on the wire. But `rig/lod.js` unifySkin re-bakes
    // a second mesh into the canonical bind frame with setXYZ, and on a
    // NORMALISED Int16 position that clamps every vertex beyond the node's
    // [-1, 1] box — measured: the sensor mesh's lenses smeared 4.4 m down the
    // body. Plain float streams make every downstream pass safe.
    for (const name of Object.keys(o.geometry.attributes)) {
      const a = o.geometry.attributes[name];
      if (name === '_bone' || name.startsWith('skin')) continue;
      if (!a.normalized && !a.isInterleavedBufferAttribute && a.array instanceof Float32Array) continue;
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) {
        for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
      }
      o.geometry.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
    }
    // the lens/lamp mesh is tiny glass: it must not hold a shadow caster slot
    const mat = o.material;
    if (mat && /sensor/i.test(mat.name || '')) { o.castShadow = false; o.userData.noShadow = true; }
  });
}

/** Seed autorig's per-geometry weight cache with the generator's exact ownership. */
function seedAuthoredWeights(machine) {
  let seeded = 0;
  machine.model.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry;
    const labels = geo.userData.r5Labels;
    if (!labels || geo.userData.rigKind === machine.kind) return;
    const n = geo.attributes.position.count;
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { skinIndex[i * 4] = labels[i]; skinWeight[i * 4] = 1; }
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    geo.userData.rigKind = machine.kind;            // autorig: "already captured"
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    if (!geo.userData.boundsPadded) { geo.boundingSphere.radius *= 1.6; geo.userData.boundsPadded = 1.6; }
    seeded += n;
  });
  return seeded;
}

const HEX_WALK = { stride: 0.95, duty: 0.6, lift: 0.15,
  offsets: { LF: 0, RM: 0, LH: 0, RF: 0.5, LM: 0.5, RH: 0.5 } };       // alternating tripod
const HEX_RUN = { stride: 1.9, duty: 0.46, lift: 0.26,
  offsets: { LF: 0, RM: 0.05, LH: 0.1, RF: 0.5, LM: 0.55, RH: 0.6 } };   // tripod, slight wave

export class Tiller extends ExpansionMachine {
  constructor(ctx, manager, opts = {}) {
    super(ctx, manager, {
      kind: 'r5-tiller',
      displayName: 'Tiller',
      rigged: false,
      yawFix: 0,                 // generated facing +Z: no correction
      maxHealth: 320, armor: 0.1, level: 6,
      walkSpeed: 1.5, runSpeed: 6.0, turnRate: 1.5,
      sightRange: 34, hearRange: 24, eyeHeight: 1.7,
      attackRange: 3.2, bodyRadius: 1.15,
      eyeCalm: '#ffcf8a',        // lantern amber, not the canon blue
      ...opts,
    });
    const entry = ctx.assets.models[this.modelKind];
    const spec = entry.r5Rig;
    const S = entry.r5Sockets;
    this._seeded = opts.authoredWeights === false ? 0 : seedAuthoredWeights(this);

    this.addEye(this.body, S.lens[0], S.lens[1], S.lens[2] + 0.02, 0.26, 0.05, 0.5);
    this.addWeakPoint('lantern', this.body, S.lantern[0], S.lantern[1], S.lantern[2], 0.28, 2.2);
    this.lootTable = rollLoot([{ id: 'metal-shards', min: 8, max: 14 }, { id: 'wire', min: 1, max: 2 }]);

    attachRigRuntime(this, { quantise: false });   // keep the generated palette
    buildRig(this, spec);
    this._weightAudit = weightAudit(this);          // labels vs the weights the rig binds
    this.gait = new GaitController(this, this.rig, {
      walk: HEX_WALK, run: HEX_RUN, runRef: 6.0,
      rollAmp: 0.018, impactAmp: 0.025, breatheRate: 0.8, stepDustSpeed: 4.0,
      turnRadius: 1.4, lookClampYaw: 1.2, stanceFlex: 0.08,
      fidgets: [
        { name: 'survey-sweep', head: 0.18, dur: 2.4 },
        { name: 'probe', head: -0.3, spine: 0.06, tail: 0.25, dur: 2.0 },
      ],
    });
    this.gait.update(0.016, 0);
    foldMachineMeshes(this);
    snapSockets(this);
    this._deathRoll = 0.3;
    this._deathSink = 0.03;
  }

  onDeathPose(k, deathT) { this.gait.deathPose(k, deathT, 'quad'); }

  animate(dt, t) {
    if (this.state === 'dead') return;
    this._snapDoctrineSockets();
    if (updateRigLOD(this) >= 3) { this.gait.updateCheap(dt, t); return; }
    this.gait.update(dt, t);
  }
}

/** Stock autorig capsule capture over the same mesh (the measured baseline). */
export class TillerCapsule extends Tiller {
  constructor(ctx, manager, opts = {}) {
    super(ctx, manager, { kind: 'r5-tiller-capsule', authoredWeights: false, ...opts });
  }
}

/**
 * Capsule-vs-authored audit: how many vertices does autorig's capsule capture
 * give to a different dominant bone than the generator says owns them, and how
 * many of those cross the leg/body boundary (the visible defect: a plate torn
 * off the body when the leg swings).
 */
export function weightAudit(machine) {
  const order = machine.ctx.assets.models[machine.modelKind].r5BoneOrder;
  const isLeg = (i) => /_(thigh|shin|foot)$/.test(order[i] || '');
  let n = 0, wrong = 0, cross = 0, blended = 0;
  const byBone = {};
  const seen = new Set();
  machine.model.traverse((o) => {
    const g = o.geometry;
    if (!o.isMesh || !g || seen.has(g)) return;
    seen.add(g);
    const labels = g.userData.r5Labels;
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    if (!labels || !si || labels.length !== si.count) return;
    for (let i = 0; i < si.count; i++) {
      n++;
      const dom = si.getX(i);
      if (sw.getY(i) > 0.08) blended++;
      if (dom !== labels[i]) {
        wrong++;
        if (isLeg(dom) !== isLeg(labels[i])) cross++;
        const k = `${order[labels[i]]}->${order[dom]}`;
        byBone[k] = (byBone[k] || 0) + 1;
      }
    }
  });
  const top = Object.entries(byBone).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return { verts: n, wrongDominant: wrong, wrongPct: n ? +(100 * wrong / n).toFixed(1) : 0,
    legBodyCross: cross, blendedVerts: blended, topMisassignments: top };
}
