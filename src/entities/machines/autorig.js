import * as THREE from 'three';
import { BoneSpace, RestPose } from '../anim/index.js';
import { buildHullProxy } from './rig/sockets.js';
import { skinnedBounds } from './rig/lod.js';
import { EXPANSION_RIGS } from './rig/rigs-expansion.js';

/**
 * Runtime auto-rig: converts a static machine sculpt into a SkinnedMesh with
 * a procedurally-built skeleton at load time.
 *
 * The big three sculpts (sawtooth / behemoth / thunderjaw) shipped as merged
 * static meshes with no bones — they slid across the ground as statues. This
 * module builds a THREE.Bone hierarchy from a per-species RIG SPEC (leg/spine
 * joint positions measured off the actual vertex data in body space), computes
 * per-vertex skin weights by capsule distance to bone segments, and rebinds
 * every mesh as a SkinnedMesh so the gait controller (gait.js) can walk them.
 *
 * Space conventions:
 * - All spec coordinates are BODY space: +Z = muzzle/forward, +Y up, meters,
 *   y=0 at the feet (machine.body frame — after the per-model yawFix).
 * - Bones are created with IDENTITY local rotation (bone axes ≡ body axes in
 *   the bind pose) and position-only offsets. Procedural animation can then
 *   reason in body axes for every joint of every species.
 * - The bind pose is the sculpt's pose. Some sculpts are frozen mid-stride
 *   (thunderjaw's right leg is swung way out) — restFoot targets let the rig
 *   settle into a corrected neutral stance at build time via one IK pass.
 *
 * Weights: robots read best with near-rigid plate assignment. Each vertex
 * takes its top-2 bone influences by capsule score, sharpened so the dominant
 * bone sits ~0.85-1.0. Leg bones only capture vertices below `legGateY` AND
 * inside that leg's capture radius — belly/torso plates can never inherit leg
 * weights (no smearing when a leg lifts).
 */

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m1 = new THREE.Matrix4();

/* ------------------------------------------------------------------ */
/* per-species rig specs (fitted to the sculpt vertex data)            */
/* ------------------------------------------------------------------ */

export const RIGS = {
  sawtooth: {
    // H 2.75, half-width 0.66, z in [-2.32, 2.32]. Sculpt frozen mid-prowl.
    spine: [
      { name: 'pelvis', pos: [0, 1.45, -1.15], r: 1.55 },
      { name: 'spine', pos: [0, 1.58, -0.35], r: 1.05 },
      { name: 'chest', pos: [0, 1.58, 0.55], r: 1.0 },
      { name: 'neck', pos: [0, 1.4, 1.35], r: 0.85 },
      { name: 'head', pos: [0, 1.0, 1.95], r: 0.9, tip: [0, 0.8, 2.4] },
    ],
    tail: [],
    legGateY: 1.32,
    legs: [
      { id: 'LF', parent: 'chest', hinge: -1, hip: [-0.44, 1.45, 0.62], knee: [-0.48, 0.78, 0.1], ankle: [-0.48, 0.34, 0.1], toe: [-0.48, 0.03, 0.48], r: 0.42, restFoot: [-0.46, 0.78] },
      { id: 'RF', parent: 'chest', hinge: -1, hip: [0.42, 1.45, 0.85], knee: [0.46, 0.78, 0.95], ankle: [0.48, 0.36, 1.1], toe: [0.48, 0.03, 1.5], r: 0.42, restFoot: [0.46, 0.78] },
      { id: 'LH', parent: 'pelvis', hinge: 1, hip: [-0.34, 1.42, -1.2], knee: [-0.33, 0.8, -1.45], ankle: [-0.32, 0.4, -1.65], toe: [-0.32, 0.03, -1.5], r: 0.44, restFoot: [-0.34, -1.1] },
      { id: 'RH', parent: 'pelvis', hinge: 1, hip: [0.34, 1.42, -1.05], knee: [0.33, 0.8, -0.85], ankle: [0.32, 0.36, -0.72], toe: [0.32, 0.03, -0.55], r: 0.44, restFoot: [0.34, -1.1] },
    ],
  },

  behemoth: {
    // H 4.5, half-width 1.78, z in [-5.51, 5.51]. Near-symmetric stance;
    // low grinder jaw reaches ~ground at z≈5; big side skirts hang at
    // (±1.36, -0.34) and MUST stay on the torso (leg capture r excludes them).
    spine: [
      { name: 'pelvis', pos: [0, 2.75, -2.3], r: 2.6 },
      { name: 'spine', pos: [0, 3.0, -0.8], r: 2.6 },
      { name: 'chest', pos: [0, 3.0, 0.7], r: 2.5 },
      { name: 'neck', pos: [0, 2.5, 2.7], r: 2.1 },
      { name: 'head', pos: [0, 1.7, 4.1], r: 2.0, tip: [0, 1.0, 5.3] },
    ],
    tail: [
      { name: 'tail1', pos: [0, 3.1, -3.7], r: 1.7 },
      { name: 'tail2', pos: [0, 3.3, -5.1], r: 1.5 },
    ],
    legGateY: 2.35,
    legs: [
      { id: 'LF', parent: 'chest', hinge: -1, hip: [-0.73, 2.45, 1.05], knee: [-0.72, 1.35, 1.0], ankle: [-0.72, 0.55, 1.08], toe: [-0.72, 0.05, 1.25], r: 0.6, restFoot: [-0.73, 1.1] },
      { id: 'RF', parent: 'chest', hinge: -1, hip: [0.73, 2.45, 1.05], knee: [0.72, 1.35, 1.0], ankle: [0.72, 0.55, 1.08], toe: [0.72, 0.05, 1.25], r: 0.6, restFoot: [0.73, 1.1] },
      { id: 'LH', parent: 'pelvis', hinge: 1, hip: [-0.92, 2.45, -1.62], knee: [-1.0, 1.35, -1.75], ankle: [-1.05, 0.55, -1.72], toe: [-1.05, 0.06, -1.58], r: 0.62, restFoot: [-1.0, -1.62] },
      { id: 'RH', parent: 'pelvis', hinge: 1, hip: [0.92, 2.45, -1.62], knee: [1.0, 1.35, -1.75], ankle: [1.05, 0.55, -1.72], toe: [1.05, 0.06, -1.58], r: 0.62, restFoot: [1.0, -1.62] },
    ],
  },

  thunderjaw: {
    // H 9.4, half-width 3.14, z in [-6.47, 6.47]. Bipedal T-rex: low wide
    // head forward, giant upswept tail crest rear. Sculpt frozen mid-stride —
    // left foot planted under the body, right leg swung far out to
    // (2.55, 0.76); restFoot pulls both feet into a mirrored neutral stance.
    spine: [
      { name: 'pelvis', pos: [0, 4.6, 0.0], r: 3.4 },
      { name: 'chest', pos: [0, 4.1, 2.0], r: 2.9 },
      { name: 'neck', pos: [0, 3.4, 3.4], r: 2.3 },
      { name: 'head', pos: [0, 2.5, 4.7], r: 3.3, tip: [0, 2.0, 6.3] },
    ],
    tail: [
      { name: 'tail1', pos: [0, 5.3, -1.5], r: 3.9 },
      { name: 'tail2', pos: [0, 5.7, -3.1], r: 3.4 },
      { name: 'tail3', pos: [0, 5.9, -4.6], r: 2.9 },
      { name: 'tail4', pos: [0, 6.0, -6.1], r: 2.6 },
    ],
    legGateY: 4.05,
    legs: [
      { id: 'L', parent: 'pelvis', hinge: 1, hip: [-1.0, 4.2, -0.55], knee: [-1.15, 2.35, -1.3], ankle: [-1.12, 0.95, -1.6], toe: [-1.15, 0.1, -1.0], r: 1.12, restFoot: [-1.2, -0.55] },
      { id: 'R', parent: 'pelvis', hinge: 1, hip: [1.1, 4.0, 0.1], knee: [2.4, 2.3, 0.5], ankle: [2.55, 0.85, 0.8], toe: [2.6, 0.1, 1.15], r: 1.12, restFoot: [1.2, -0.55] },
    ],
  },

  /**
   * ROUND 4 — the expansion species (`rig/rigs-expansion.js`). Merged in here
   * rather than declared here so the big three above stay readable, and so a
   * caller only ever needs `RIGS[kind]`.
   */
  ...EXPANSION_RIGS,
};

/* ------------------------------------------------------------------ */
/* skeleton construction                                               */
/* ------------------------------------------------------------------ */

function makeBone(name, pos, parent, parentPos) {
  const b = new THREE.Bone();
  b.name = `rig_${name}`;
  b.position.set(pos[0] - parentPos[0], pos[1] - parentPos[1], pos[2] - parentPos[2]);
  parent.add(b);
  return b;
}

/** distance from point p to segment ab (all Vector3-ish arrays) */
function segDist(px, py, pz, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = px - a[0], apy = py - a[1], apz = pz - a[2];
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 1e-8 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Build the rig for `machine` from `spec`. Call at the END of the subclass
 * constructor (after parts/eyes/weak points are authored in body space):
 * converts model meshes to SkinnedMeshes, reparents body-space attachments
 * (parts, eyes, weak points, anchors) onto the nearest bone, and applies the
 * neutral-stance rest correction.
 *
 * Returns { root, bones, spine, tail, legs, skeleton } where each legs[i] =
 * { id, thigh, shin, foot, l1, l2, bindThigh, bindShin, bindFoot, footTipLen,
 *   hingePole, rest* } ready for the gait controller's IK.
 */
export function buildRig(machine, spec) {
  const body = machine.body;

  // --- bones (identity local rotations; body-space joint positions)
  const rigRoot = new THREE.Group();
  rigRoot.name = 'rig-root';
  body.add(rigRoot);

  const bones = {};
  const spineBones = [];
  let prev = null;
  let prevPos = [0, 0, 0];
  for (const s of spec.spine) {
    const b = makeBone(s.name, s.pos, prev ?? rigRoot, prev ? prevPos : [0, 0, 0]);
    b.userData.bodyPos = s.pos;
    bones[s.name] = b;
    spineBones.push(b);
    prev = b;
    prevPos = s.pos;
  }
  const pelvis = spineBones[0];

  const tailBones = [];
  prev = pelvis;
  prevPos = spec.spine[0].pos;
  for (const s of spec.tail) {
    const b = makeBone(s.name, s.pos, prev, prevPos);
    b.userData.bodyPos = s.pos;
    bones[s.name] = b;
    tailBones.push(b);
    prev = b;
    prevPos = s.pos;
  }

  const legs = [];
  for (const L of spec.legs) {
    const parent = bones[L.parent];
    const thigh = makeBone(`${L.id}_thigh`, L.hip, parent, parent.userData.bodyPos);
    const shin = makeBone(`${L.id}_shin`, L.knee, thigh, L.hip);
    const foot = makeBone(`${L.id}_foot`, L.ankle, shin, L.knee);
    thigh.userData.bodyPos = L.hip;
    shin.userData.bodyPos = L.knee;
    foot.userData.bodyPos = L.ankle;
    bones[`${L.id}_thigh`] = thigh;
    bones[`${L.id}_shin`] = shin;
    bones[`${L.id}_foot`] = foot;

    const bindThigh = new THREE.Vector3(
      L.knee[0] - L.hip[0], L.knee[1] - L.hip[1], L.knee[2] - L.hip[2]);
    const bindShin = new THREE.Vector3(
      L.ankle[0] - L.knee[0], L.ankle[1] - L.knee[1], L.ankle[2] - L.knee[2]);
    const bindFoot = new THREE.Vector3(
      L.toe[0] - L.ankle[0], L.toe[1] - L.ankle[1], L.toe[2] - L.ankle[2]);
    const l1 = bindThigh.length();
    const l2 = bindShin.length();
    // hinge pole: which way the knee apex points in bind (auto-detected):
    // apex offset of the knee from the hip→ankle chord, in the sagittal plane
    const mid = _v1.set(
      (L.hip[0] + L.ankle[0]) / 2, (L.hip[1] + L.ankle[1]) / 2, (L.hip[2] + L.ankle[2]) / 2);
    const apexZ = L.knee[2] - mid.z;
    const hinge = L.hinge ?? (apexZ >= 0 ? 1 : -1);
    legs.push({
      id: L.id,
      thigh, shin, foot,
      l1, l2,
      ankleH: L.ankle[1], // ankle pivot height above the ground plane (bind)
      footTip: bindFoot.clone(),
      bindThigh: bindThigh.normalize(),
      bindShin: bindShin.normalize(),
      hingeZ: hinge,
      hip: L.hip.slice(),
      restFoot: L.restFoot.slice(),
      r: L.r,
      chain: [L.hip, L.knee, L.ankle, L.toe],
    });
  }

  // --- per-vertex skin weights (cached on the geometry for shared sculpts)
  machine.root.updateWorldMatrix(true, true);
  const boneList = [...spineBones, ...tailBones];
  for (const leg of legs) boneList.push(leg.thigh, leg.shin, leg.foot);
  const boneIndex = new Map(boneList.map((b, i) => [b, i]));

  // capsule segments per bone: [aPos, bPos, radius, legIdx|-1, boneListIdx]
  const segs = [];
  for (let i = 0; i < spec.spine.length; i++) {
    const s = spec.spine[i];
    const next = spec.spine[i + 1];
    const end = next ? next.pos : (s.tip ?? s.pos);
    segs.push([s.pos, end, s.r, -1, boneIndex.get(spineBones[i])]);
  }
  const tailChain = [spec.spine[0], ...spec.tail];
  for (let i = 1; i < tailChain.length; i++) {
    const s = tailChain[i];
    const nxt = tailChain[i + 1];
    segs.push([s.pos, nxt ? nxt.pos : s.pos, s.r, -1, boneIndex.get(tailBones[i - 1])]);
  }
  for (let li = 0; li < legs.length; li++) {
    const L = spec.legs[li];
    segs.push([L.hip, L.knee, L.r, li, boneIndex.get(legs[li].thigh)]);
    segs.push([L.knee, L.ankle, L.r, li, boneIndex.get(legs[li].shin)]);
    segs.push([L.ankle, L.toe, L.r * 1.1, li, boneIndex.get(legs[li].foot)]);
  }
  /**
   * THE INBOARD RULE (opt-in: `spec.legInboard`, in metres; absent = off).
   *
   * `legGateY` is a horizontal cut, and it is enough for a machine whose
   * trunk rides clear above its hips. It is not enough for the soft
   * underbelly, which by construction hangs BELOW the hips and yet is body,
   * not leg: on the Scrapper the belly muscle dips to y 0.78 under a 0.80
   * gate, lands 0.03 m from a thigh capsule axis, wins the capsule's 1.6x
   * boost outright and is then torn off the machine the first time the gait
   * swings that thigh.
   *
   * A leg's own geometry is always OUTBOARD: a plate drawn on a leg straddles
   * the hip's x, so its innermost vertices are half a plate inboard of the
   * joint and no more. Anything further toward the sagittal plane than that
   * is trunk. `legInboard` is that half-plate, per species, and it costs one
   * subtraction per vertex per leg segment.
   *
   * `min` per leg, so a leg whose ankle tucks under the body (a digitigrade
   * hind leg) is judged on its widest joint rather than its narrowest.
   */
  const inboardLimit = [];
  if (spec.legInboard > 0) {
    for (const L of spec.legs) {
      const widest = Math.max(Math.abs(L.hip[0]), Math.abs(L.knee[0]),
                              Math.abs(L.ankle[0]), Math.abs(L.toe[0]));
      inboardLimit.push(Math.max(0, widest - spec.legInboard));
    }
  }

  const toBody = _m1;
  const meshes = [];
  machine.model.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o); });

  body.updateWorldMatrix(true, true);
  const bodyInv = new THREE.Matrix4().copy(body.matrixWorld).invert();

  for (const mesh of meshes) {
    const geo = mesh.geometry;
    if (geo.userData.rigKind !== machine.kind) {
      toBody.multiplyMatrices(bodyInv, mesh.matrixWorld);
      const pos = geo.attributes.position;
      const n = pos.count;
      const skinIndex = new Uint16Array(n * 4);
      const skinWeight = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        _v1.fromBufferAttribute(pos, i).applyMatrix4(toBody);
        const px = _v1.x, py = _v1.y, pz = _v1.z;
        // best two influences
        let i0 = -1, w0 = 0, i1 = -1, w1 = 0;
        for (const [a, b, r, legIdx, bi] of segs) {
          if (legIdx >= 0 && py > spec.legGateY) continue; // legs never grab high verts
          // ...nor anything further inboard than a leg plate reaches (above)
          if (legIdx >= 0 && inboardLimit.length
              && Math.abs(px) < inboardLimit[legIdx]) continue;
          const d = segDist(px, py, pz, a, b);
          if (d >= r) continue;
          let w = 1 - d / r;
          w *= w;
          if (legIdx >= 0) w *= 1.6; // inside a leg capsule, the leg owns the plate
          if (w > w0) { i1 = i0; w1 = w0; i0 = bi; w0 = w; }
          else if (w > w1 && bi !== i0) { i1 = bi; w1 = w; }
        }
        if (i0 < 0) {
          // outside every capsule: nearest spine/tail segment wins outright
          let best = 1e9;
          for (const [a, b, , legIdx, bi] of segs) {
            if (legIdx >= 0) continue;
            const d = segDist(px, py, pz, a, b);
            if (d < best) { best = d; i0 = bi; }
          }
          w0 = 1;
          i1 = -1;
        }
        // sharpen toward rigid plates (robots): dominant ~0.85-1.0
        if (i1 >= 0 && w1 > 0) {
          w0 = Math.pow(w0, 2.2);
          w1 = Math.pow(w1, 2.2);
          const sum = w0 + w1;
          w0 /= sum;
          w1 /= sum;
          if (w0 > 0.92) { w0 = 1; i1 = -1; w1 = 0; }
        } else {
          w0 = 1;
          w1 = 0;
        }
        const o4 = i * 4;
        skinIndex[o4] = i0;
        skinWeight[o4] = w0;
        if (i1 >= 0) { skinIndex[o4 + 1] = i1; skinWeight[o4 + 1] = w1; }
      }
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
      geo.userData.rigKind = machine.kind;
      // posed legs can exceed the bind-pose bounds — keep culling honest
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      if (!geo.userData.boundsPadded) {
        geo.boundingSphere.radius *= 1.6;
        geo.userData.boundsPadded = 1.6;
      }
    }
  }

  // --- bind: one skeleton per machine, every mesh becomes a SkinnedMesh
  machine.root.updateWorldMatrix(true, true);
  const skeleton = new THREE.Skeleton(boneList); // inverses from current pose
  for (const mesh of meshes) {
    const sk = new THREE.SkinnedMesh(mesh.geometry, mesh.material);
    sk.name = mesh.name;
    sk.position.copy(mesh.position);
    sk.quaternion.copy(mesh.quaternion);
    sk.scale.copy(mesh.scale);
    sk.castShadow = mesh.castShadow;
    sk.receiveShadow = mesh.receiveShadow;
    // ROUND 4 (perf-tech-04): culling stays ON. A posed skeleton pushes
    // vertices outside the bind box, so the bind sphere is padded (x1.6 above,
    // x2.2 in `skinnedBounds`) instead of the cull being switched off — a
    // machine behind the camera used to cost its full mesh count every frame.
    sk.frustumCulled = true;
    sk.userData = mesh.userData; // keeps userData.machine tagging (raycasts)
    const parent = mesh.parent;
    const idx = parent.children.indexOf(mesh);
    parent.children[idx] = sk;
    sk.parent = parent;
    mesh.parent = null;
    sk.updateWorldMatrix(true, false);
    sk.bind(skeleton, sk.matrixWorld);
  }

  // --- reparent body-space attachments (parts, eyes, weak points, anchors)
  // onto the nearest bone so they ride the pose. Sweep direct children of
  // body that aren't the model holder or the rig itself.
  const keep = new Set([machine.holder, rigRoot]);
  const attach = [];
  for (const child of body.children) {
    if (!keep.has(child)) attach.push(child);
  }
  for (const child of attach) {
    _v2.copy(child.position); // body space (children of body)
    let bestBone = spineBones[spineBones.length - 1];
    let best = 1e9;
    for (const [a, b, r, legIdx, bi] of segs) {
      const d = segDist(_v2.x, _v2.y, _v2.z, a, b) / Math.max(r, 0.001);
      if (legIdx >= 0 && _v2.y > spec.legGateY) continue;
      if (d < best) { best = d; bestBone = boneList[bi]; }
    }
    bestBone.attach(child);
  }

  const rig = {
    root: rigRoot, bones, skeleton,
    pelvis, spine: spineBones, tail: tailBones, legs,
    head: bones.head ?? spineBones[spineBones.length - 1],
    neck: bones.neck ?? null,
    chest: bones.chest ?? spineBones[Math.min(2, spineBones.length - 1)],
  };

  // rest-pose snapshot BEFORE stance correction (gait resets to rest, then
  // the correction is re-applied as part of the per-frame IK ground targets).
  //
  // ROUND 4 (perf-tech-11): this is anim-core's `RestPose` over one
  // `BoneSpace`, not a private `Map<Bone, Quaternion>`. The Map is kept as a
  // VIEW (`toMap()`) so the anim registry's `machineLocal` probe and any
  // Round-3 call site still read the same bind truth.
  rig.space = new BoneSpace(rigRoot, { all: true });
  rig.restPose = new RestPose({ space: rig.space });
  rig.rest = rig.restPose.toMap();
  rig.restPelvisY = pelvis.position.y;
  /**
   * HEAD REACH, measured once at build (`machines-expansion`, fix round 1).
   *
   * `GaitController.deathPose` lays a wreck's neck down, and how far it MAY be
   * laid down is a property of the species, not a constant: the same 0.55 rad
   * that brings a Grazer's antler rotors to belly height drives a Snapmaw's
   * snout 1.10 m and a Corruptor's head capsule 3.07 m THROUGH the terrain,
   * and `CorpseGrounder` then lifts the whole wreck by exactly that much to
   * put its lowest vertex back on the soil — measured as dead-median ratios of
   * 2.7x and 4.4x on gate `A47c`. So the reach is published here (neck -> head
   * -> the spec's own head TIP, in body metres) and the death pose derives an
   * angle whose vertical drop cannot exceed the height the head starts at.
   */
  const _headSpec = spec.spine[spec.spine.length - 1];
  const _neckSpec = spec.spine.length > 1 ? spec.spine[spec.spine.length - 2] : _headSpec;
  const _d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  rig.headReach = _d(_neckSpec.pos, _headSpec.pos)
    + (_headSpec.tip ? _d(_headSpec.pos, _headSpec.tip) : 0.3);
  rig.headRestY = _headSpec.pos[1];
  /**
   * TAIL REST HEIGHT — the same clamp, for the other free chain (fix round 2).
   * A Corruptor's tail is authored ARCHED to y 2.90 over a hull whose deck is
   * at 1.32, so it carries a real share of the corpse metric's mass and the
   * death pose has to be able to bring it down without putting the tip through
   * the soil. `GaitController._chainBudget` reads this as the chain root's rest
   * height and measures the radius itself.
   */
  rig.tailRestY = spec.tail?.[0]?.pos?.[1] ?? rig.headRestY;

  // registry probe surface: `_rot` is a literal forward to BoneSpace, so
  // `__CTX__.anim.audit()` measures 0 divergence rather than guessing.
  machine._rest = rig.rest;
  machine._rot = (bone, axis, angle) => rig.space.rotLocal(bone, axis, angle);

  machine.rig = rig;
  skinnedBounds(machine.model, 2.2);
  // bone-space socket proxy (machine-rig-02): sampled AFTER the skeleton
  // exists so every sample lands in its dominant bone's frame
  buildHullProxy(machine);
  return rig;
}
