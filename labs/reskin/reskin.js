import * as THREE from 'three';

/**
 * SPIKE (approach B): re-skin Aloy's mesh onto the Quaternius Universal
 * Animation Library skeleton (Rigify DEF-* bones, 53 joints) so UAL clips play
 * NATIVELY — no per-frame retargeting.
 *
 * Pipeline (all at load time, character space = the Assets wrapper root:
 * meters, feet at y=0, +Z forward):
 *
 *  1. FIT. For every UAL bone that has an Aloy counterpart, compute a world
 *     rotation delta from a two-vector frame (bone direction + a roll
 *     reference: facing for the torso, across-palm for the arm/fingers, foot
 *     forward for the leg, shin for the foot) between the UAL rest pose and
 *     Aloy's A-pose, and put the bone exactly on Aloy's joint. Because the
 *     delta only re-aims each bone, the UAL local offset DIRECTION of every
 *     child is preserved (children stay on local +Y) — the clip rotations,
 *     which are absolute local quaternions, therefore reproduce the mannequin's
 *     kinematics at Aloy's proportions.
 *  2. RE-BIND. Inverse bind matrices are taken from this A-posed UAL skeleton,
 *     so the mesh is bound in the pose it was modelled in. Aloy's dyn_ hair /
 *     cloth chains are kept as live bones, reparented (world-preserving) under
 *     the fitted bone their old parent mapped to.
 *  3. WEIGHTS. Two modes:
 *       'transfer' (default): fold each of Aloy's 424 joints into its nearest
 *         mapped ancestor (twist bones -> limb, metacarpals -> hand, face ->
 *         head, spine_01/04 -> neighbouring UAL spine, dyn_ -> itself) and sum
 *         the artist's weights. Exact deformation at bind, joint pivots
 *         identical to hers — the shoulder/hip blending is the original rig's.
 *       'capsule': the autorig.js approach made humanoid-aware — per-bone
 *         capsules (bone -> primary child) with per-class radii, quadratic
 *         falloff, top-4 blend. dyn_ weights are kept. Used to document what
 *         a from-scratch runtime skin looks like next to the transfer.
 *  4. CLIPS. UAL clips bake translation + scale tracks for every bone (constant
 *     rest values). Those would snap the refitted bone lengths back to the
 *     mannequin's, so they are dropped; the DEF-hips translation track is
 *     remapped (fitted rest + delta * hip-height ratio) and root-motion
 *     tracks are scaled by the same ratio.
 *  5. SOCKETS. Empty Object3Ds reproducing the OLD bone frames (hand_l_014,
 *     spine_03_08, ...) are hung under the mapped new bones so the existing
 *     bones[name] / getBoneWorld / handAttach contract keeps working.
 */

const sanitize = (n) => THREE.PropertyBinding.sanitizeNodeName(n);

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();

/* ------------------------------------------------------------------ */
/* UAL <-> Aloy bone table                                              */
/* ------------------------------------------------------------------ */

// aloy: name prefix of the Aloy bone giving this UAL bone's joint position.
// primary: Aloy bone prefix (or 'up') the bone must point at; the UAL side is
//   the UAL bone mapped to that same Aloy bone, or the rest +Y for leaves.
// sec: roll reference class (see secondaryRef).
// radius: capsule radius for 'capsule' weight mode (meters).
function sideEntries(S, s) {
  const palm = `palm${S}`, foot = `foot${S}`, shin = `shin${S}`;
  const out = [
    { ual: `DEF-shoulder.${S}`, aloy: `clavicle_${s}_`, primary: `upperarm_${s}_`, sec: 'fwd', radius: 0.09 },
    { ual: `DEF-upper_arm.${S}`, aloy: `upperarm_${s}_`, primary: `lowerarm_${s}_`, sec: palm, radius: 0.075 },
    { ual: `DEF-forearm.${S}`, aloy: `lowerarm_${s}_`, primary: `hand_${s}_`, sec: palm, radius: 0.065 },
    { ual: `DEF-hand.${S}`, aloy: `hand_${s}_`, primary: `middle_01_${s}_`, sec: palm, radius: 0.05 },
    { ual: `DEF-thigh.${S}`, aloy: `thigh_${s}_`, primary: `calf_${s}_`, sec: foot, radius: 0.13 },
    { ual: `DEF-shin.${S}`, aloy: `calf_${s}_`, primary: `foot_${s}_`, sec: foot, radius: 0.09 },
    // feet bind at the mannequin's REST orientation (restOrient): Aloy's
    // ankle->ball slopes 19 deg, the mannequin's foot 31 deg. Aiming her foot
    // bone at her ball would make every clip pitch her toes 12 deg further
    // down (3.5 cm into the ground in Idle). With an identity delta, her
    // flat-foot A-pose corresponds to the mannequin's flat-foot rest.
    { ual: `DEF-foot.${S}`, aloy: `foot_${s}_`, primary: `ball_${s}_`, sec: shin, radius: 0.07, restOrient: true },
    { ual: `DEF-toe.${S}`, aloy: `ball_${s}_`, primary: `ball_${s}_end`, sec: 'up', radius: 0.05, restOrient: true },
  ];
  for (const f of ['index', 'middle', 'ring', 'pinky']) {
    out.push(
      { ual: `DEF-f_${f}.01.${S}`, aloy: `${f}_01_${s}_`, primary: `${f}_02_${s}_`, sec: palm, radius: 0.014 },
      { ual: `DEF-f_${f}.02.${S}`, aloy: `${f}_02_${s}_`, primary: `${f}_03_${s}_`, sec: palm, radius: 0.012 },
      { ual: `DEF-f_${f}.03.${S}`, aloy: `${f}_03_${s}_`, primary: `${f}_03_${s}_end`, sec: palm, radius: 0.011 },
    );
  }
  out.push(
    { ual: `DEF-thumb.01.${S}`, aloy: `thumb_01_${s}_`, primary: `thumb_02_${s}_`, sec: palm, radius: 0.016 },
    { ual: `DEF-thumb.02.${S}`, aloy: `thumb_02_${s}_`, primary: `thumb_03_${s}_`, sec: palm, radius: 0.013 },
    { ual: `DEF-thumb.03.${S}`, aloy: `thumb_03_${s}_`, primary: `thumb_03_${s}_end`, sec: palm, radius: 0.012 },
  );
  return out;
}

export const MAP = [
  { ual: 'DEF-hips', aloy: 'pelvis_05', primary: 'spine_02_07', sec: 'fwd', radius: 0.19 },
  { ual: 'DEF-spine.001', aloy: 'spine_02_07', primary: 'spine_03_08', sec: 'fwd', radius: 0.17 },
  { ual: 'DEF-spine.002', aloy: 'spine_03_08', primary: 'spine_05_010', sec: 'fwd', radius: 0.17 },
  { ual: 'DEF-spine.003', aloy: 'spine_05_010', primary: 'neck_01_0102', sec: 'fwd', radius: 0.18 },
  { ual: 'DEF-neck', aloy: 'neck_01_0102', primary: 'head_0104', sec: 'fwd', radius: 0.08 },
  { ual: 'DEF-head', aloy: 'head_0104', primary: 'up', sec: 'fwd', radius: 0.16 },
  ...sideEntries('L', 'l'),
  ...sideEntries('R', 'r'),
];

// old Aloy bone names the game code touches (animator KEY table + combat)
export const SOCKET_NAMES = [
  'pelvis_05', 'spine_01_06', 'spine_02_07', 'spine_03_08', 'spine_04_09', 'spine_05_010',
  'neck_01_0102', 'neck_02_0103', 'head_0104',
  'clavicle_l_011', 'clavicle_r_042', 'upperarm_l_012', 'upperarm_r_043',
  'lowerarm_l_013', 'lowerarm_r_044', 'hand_l_014', 'hand_r_045',
  'thigh_l_0185', 'thigh_r_0211', 'calf_l_0186', 'calf_r_0212',
  'foot_l_0189', 'foot_r_0215', 'ball_l_0190', 'ball_r_0216',
];

export const CLIP_ALIASES = {
  idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop', jog: 'Jog_Fwd_Loop',
  sprint: 'Sprint_Loop', 'crouch-walk': 'Crouch_Fwd_Loop', 'crouch-idle': 'Crouch_Idle_Loop',
  crouch: 'Crouch_Idle_Loop', tpose: 'A_TPose', roll: 'Roll', death: 'Death01',
  jump: 'Jump_Loop', land: 'Jump_Land', hit: 'Hit_Chest', interact: 'Interact',
};

/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */

/** shortest bone name starting with prefix; _end bones only when asked for */
function findByPrefix(names, prefix) {
  if (names.has(prefix)) return prefix;
  const wantEnd = prefix.includes('_end');
  let best = null;
  for (const n of names.keys()) {
    if (!n.startsWith(prefix)) continue;
    if (!wantEnd && n.includes('_end')) continue;
    if (!best || n.length < best.length) best = n;
  }
  return best;
}

/** orthonormal frame quaternion: +Y = primary, secondary projected into +Z */
function frameQuat(primary, secondary, out) {
  const y = _v1.copy(primary).normalize();
  const z = _v2.copy(secondary).addScaledVector(y, -secondary.dot(y));
  if (z.lengthSq() < 1e-8) {
    z.set(1, 0, 0).addScaledVector(y, -y.x);
    if (z.lengthSq() < 1e-8) z.set(0, 0, 1).addScaledVector(y, -y.z);
  }
  z.normalize();
  const x = _v3.crossVectors(y, z).normalize();
  _m1.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m1);
}

function segDist(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 1e-10 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/* ------------------------------------------------------------------ */
/* main entry                                                           */
/* ------------------------------------------------------------------ */

/**
 * @param {THREE.Object3D} charRoot  Aloy wrapper root from Assets (char space)
 * @param {object} ualGltf           GLTFLoader result of the UAL library
 * @param {object} [opts]            { weights: 'transfer'|'capsule', log }
 * @returns rig { root, skeleton, bones, ualBones, sockets, clips, fitReport,
 *                handAttach(side), getBoneWorld(name, out) }
 */
export function reskinToUAL(charRoot, ualGltf, opts = {}) {
  const weightsMode = opts.weights ?? 'transfer';
  const log = opts.log ?? (() => {});
  charRoot.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(charRoot.matrixWorld).invert();
  // Vertex space of a glTF skinned mesh is NOT the mesh node's local space:
  // the spec ignores the node transform, and aloy.glb is KHR_mesh_quantization
  // (int16 positions per mesh) with the dequantization folded into each skin's
  // inverse bind matrices by glTF-Transform. The only robust "raw vertex ->
  // world at bind" matrix is therefore  oldBone_j.matrixWorld * oldIBM_j  for
  // any joint j, evaluated while the old skeleton still sits in its bind pose.
  // Probe only joints that carry weights: unweighted helper joints
  // (_rootJoint, root_04) ship with IBMs unrelated to their rest transform.
  const bindMatrixOf = (mesh) => {
    const sk = mesh.skeleton;
    const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
    const probes = [];
    const seen = new Set();
    const step = Math.max(1, Math.floor(si.count / 64));
    for (let i = 0; i < si.count && probes.length < 6; i += step) {
      for (let k = 0; k < 4; k++) {
        const j = si.getComponent(i, k);
        if (sw.getComponent(i, k) > 0.5 && !seen.has(j)) { seen.add(j); probes.push(j); }
      }
    }
    const ms = probes.map((j) => new THREE.Matrix4().multiplyMatrices(sk.bones[j].matrixWorld, sk.boneInverses[j]));
    let dev = 0;
    for (const m of ms) for (let e = 0; e < 16; e++) dev = Math.max(dev, Math.abs(m.elements[e] - ms[0].elements[e]));
    if (opts.debug) {
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      const rows = [];
      for (const nm of ['_rootJoint', 'root_04', 'pelvis_05', 'spine_03_08', 'head_0104', 'hand_l_014', 'thigh_l_0185', 'dyn_hairBackMain_01_0145', 'dyn_skirtBack_01_0243']) {
        const j = sk.bones.findIndex((b) => b.name === nm);
        if (j < 0) continue;
        const m = new THREE.Matrix4().multiplyMatrices(sk.bones[j].matrixWorld, sk.boneInverses[j]);
        m.decompose(p, q, s);
        rows.push(`${nm}: t=${p.toArray().map((v) => v.toFixed(3))} s=${s.toArray().map((v) => v.toFixed(4))} q=${q.toArray().map((v) => v.toFixed(3))}`);
      }
      log(`reskin: bind probes ${mesh.name}\n  ` + rows.join('\n  '));
    }
    return { m: ms[0], dev };
  };

  /* ---- Aloy: bones, meshes, char-space joint positions ---- */
  const aloyBones = new Map();
  const aloyMeshes = [];
  let oldRootJoint = null;
  charRoot.traverse((o) => {
    if (o.isBone) aloyBones.set(o.name, o);
    if (o.isSkinnedMesh) aloyMeshes.push(o);
    if (o.name === '_rootJoint') oldRootJoint = o;
  });
  const aloyName = (prefix) => {
    const n = findByPrefix(aloyBones, prefix);
    if (!n) throw new Error(`reskin: Aloy bone not found for prefix "${prefix}"`);
    return n;
  };
  const aloyPos = (prefix) => aloyBones.get(aloyName(prefix)).getWorldPosition(new THREE.Vector3()).applyMatrix4(rootInv);

  /* ---- UAL: rest skeleton (world = rest since Rig is identity) ---- */
  const ualScene = ualGltf.scene;
  ualScene.updateMatrixWorld(true);
  const ualBones = new Map();
  ualScene.traverse((o) => { if (o.isBone) ualBones.set(o.name, o); });
  const ualBone = (name) => {
    const b = ualBones.get(sanitize(name));
    if (!b) throw new Error(`reskin: UAL bone "${name}" (${sanitize(name)}) missing`);
    return b;
  };
  const ualRoot = ualBone('root');
  const rest = new Map(); // bone -> { p: world pos, q: world quat }
  for (const b of ualBones.values()) {
    rest.set(b, { p: b.getWorldPosition(new THREE.Vector3()), q: b.getWorldQuaternion(new THREE.Quaternion()) });
  }
  const ualPosOf = (name) => rest.get(ualBone(name)).p;
  const entryByAloy = new Map(MAP.map((e) => [e.aloy, e]));

  /* ---- secondary (roll) reference vectors, per rig ---- */
  const secondaryRef = (kind, side /* 'ual'|'aloy' */) => {
    if (kind === 'fwd') return new THREE.Vector3(0, 0, 1);
    if (kind === 'up') return new THREE.Vector3(0, 1, 0);
    const S = kind.slice(-1), s = S.toLowerCase();
    if (kind.startsWith('palm')) {
      return side === 'ual'
        ? ualPosOf(`DEF-f_pinky.01.${S}`).clone().sub(ualPosOf(`DEF-f_index.01.${S}`))
        : aloyPos(`pinky_01_${s}_`).sub(aloyPos(`index_01_${s}_`));
    }
    if (kind.startsWith('foot')) {
      return side === 'ual'
        ? ualPosOf(`DEF-toe.${S}`).clone().sub(ualPosOf(`DEF-foot.${S}`))
        : aloyPos(`ball_${s}_`).sub(aloyPos(`foot_${s}_`));
    }
    if (kind.startsWith('shin')) {
      return side === 'ual'
        ? ualPosOf(`DEF-shin.${S}`).clone().sub(ualPosOf(`DEF-foot.${S}`))
        : aloyPos(`calf_${s}_`).sub(aloyPos(`foot_${s}_`));
    }
    throw new Error(`reskin: unknown secondary ref ${kind}`);
  };

  /* ---- 1. FIT (parents before children: walk the UAL tree) ---- */
  const fit = new Map(); // ual bone -> { p, q } fitted world (char space)
  fit.set(ualRoot, { p: new THREE.Vector3(0, 0, 0), q: rest.get(ualRoot).q.clone() });
  const order = [];
  ualRoot.traverse((o) => { if (o.isBone && o !== ualRoot) order.push(o); });
  const entryByUal = new Map(MAP.map((e) => [sanitize(e.ual), e]));
  const fitReport = [];
  for (const b of order) {
    const e = entryByUal.get(b.name);
    if (!e) throw new Error(`reskin: UAL bone ${b.name} has no mapping`);
    const A = aloyPos(e.aloy);
    const r = rest.get(b);
    // primary directions
    const childEntry = entryByAloy.get(e.primary);
    const pU = childEntry
      ? ualPosOf(childEntry.ual).clone().sub(r.p)
      : new THREE.Vector3(0, 1, 0).applyQuaternion(r.q);
    const pA = e.primary === 'up' ? new THREE.Vector3(0, 1, 0) : aloyPos(e.primary).sub(A);
    const qU = frameQuat(pU, secondaryRef(e.sec, 'ual'), new THREE.Quaternion());
    const qA = frameQuat(pA, secondaryRef(e.sec, 'aloy'), new THREE.Quaternion());
    // world rotation UAL-rest -> Aloy (identity for restOrient bones)
    const delta = e.restOrient ? new THREE.Quaternion() : qA.multiply(qU.invert());
    const Wq = delta.multiply(r.q);
    const P = fit.get(b.parent);
    if (!P) throw new Error(`reskin: parent of ${b.name} not fitted`);
    _q1.copy(P.q).invert();
    b.position.copy(A).sub(P.p).applyQuaternion(_q1);
    b.quaternion.copy(_q1).multiply(Wq);
    b.scale.set(1, 1, 1);
    fit.set(b, { p: A.clone(), q: Wq });
    fitReport.push({ bone: b.name, aloy: aloyName(e.aloy), pos: A.toArray().map((v) => +v.toFixed(3)), len: +b.position.length().toFixed(3) });
  }
  ualRoot.position.set(0, 0, 0);
  ualRoot.quaternion.copy(rest.get(ualRoot).q);
  ualRoot.scale.set(1, 1, 1);

  const rigRoot = new THREE.Group();
  rigRoot.name = 'reskin-rig';
  ualRoot.removeFromParent();
  rigRoot.add(ualRoot);
  charRoot.add(rigRoot);
  charRoot.updateMatrixWorld(true);

  /* ---- Aloy bone -> new bone (nearest mapped ancestor-or-self) ---- */
  const ualBoneForAloyName = new Map();
  for (const e of MAP) ualBoneForAloyName.set(aloyName(e.aloy), ualBone(e.ual));
  const newBoneForAloy = (bone) => {
    let n = bone;
    while (n) {
      const hit = ualBoneForAloyName.get(n.name);
      if (hit) return hit;
      if (n.isBone && entryByUal.has(n.name)) return n; // already a UAL bone
      n = n.parent;
    }
    return ualBone('DEF-hips');
  };

  /* ---- 2. dyn_ chains ride the fitted skeleton (world-preserving) ---- */
  const dynRoots = [];
  for (const b of aloyBones.values()) {
    if (b.name.startsWith('dyn_') && !(b.parent && b.parent.name.startsWith('dyn_'))) dynRoots.push(b);
  }
  const dynBones = [];
  for (const d of dynRoots) {
    const target = newBoneForAloy(d.parent);
    target.attach(d); // keeps world transform (scale included)
    d.traverse((o) => { if (o.isBone) dynBones.push(o); });
  }
  charRoot.updateMatrixWorld(true);

  const boneList = [];
  ualRoot.traverse((o) => { if (o.isBone && !o.name.startsWith('dyn_')) boneList.push(o); });
  const ualCount = boneList.length;
  for (const d of dynBones) boneList.push(d);
  const boneIndex = new Map(boneList.map((b, i) => [b, i]));

  /* ---- 5. sockets: old bone frames under the new bones (before the old
     skeleton is dropped, while its world matrices are still the bind ones) */
  const sockets = {};
  for (const name of SOCKET_NAMES) {
    const old = aloyBones.get(name);
    if (!old) continue;
    const host = newBoneForAloy(old);
    const sock = new THREE.Object3D();
    sock.name = name;
    _m1.copy(host.matrixWorld).invert().multiply(old.matrixWorld);
    _m1.decompose(sock.position, sock.quaternion, sock.scale);
    host.add(sock);
    sockets[name] = sock;
  }

  /* ---- 3. weights + rebind ---- */
  charRoot.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneList); // inverses from the A-posed fit

  // capsule segments (char space) for 'capsule' mode
  let segs = null;
  if (weightsMode === 'capsule') {
    segs = [];
    for (const e of MAP) {
      const b = ualBone(e.ual);
      const a = fit.get(b).p;
      const childEntry = entryByAloy.get(e.primary);
      let end;
      if (childEntry) end = fit.get(ualBone(childEntry.ual)).p;
      else if (e.primary === 'up') end = a.clone().add(new THREE.Vector3(0, 0.12, 0));
      else end = aloyPos(e.primary);
      segs.push({ a, b: end, r: e.radius, idx: boneIndex.get(b) });
    }
  }

  let totalVerts = 0;
  const stats = { maxInfluences: 0, droppedWeight: 0 };
  const bindCheck = [];
  const worldBox = (mesh) => {
    mesh.computeBoundingBox();
    const b = mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    return [b.min.toArray().map((v) => +v.toFixed(3)), b.max.toArray().map((v) => +v.toFixed(3))];
  };
  for (const mesh of aloyMeshes) {
    const geo = mesh.geometry;
    const oldBox = worldBox(mesh);
    const pos = geo.attributes.position;
    const si = geo.attributes.skinIndex;
    const sw = geo.attributes.skinWeight;
    const n = pos.count;
    totalVerts += n;
    const remap = mesh.skeleton.bones.map((b) => {
      if (b.name.startsWith('dyn_')) return boneIndex.get(b) ?? boneIndex.get(newBoneForAloy(b));
      return boneIndex.get(newBoneForAloy(b));
    });
    const outI = new Uint16Array(n * 4);
    const outW = new Float32Array(n * 4);
    const acc = new Map();
    const { m: bindMatrix, dev: bindDev } = bindMatrixOf(mesh);
    if (bindDev > 1e-3) log(`reskin: WARNING ${mesh.name} rest pose != skin bind pose (dev ${bindDev.toExponential(2)})`);
    const toChar = new THREE.Matrix4().multiplyMatrices(rootInv, bindMatrix); // raw vertex -> char space
    for (let i = 0; i < n; i++) {
      acc.clear();
      let dynW = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (w <= 0) continue;
        const j = remap[si.getComponent(i, k)];
        if (j === undefined) continue;
        if (j >= ualCount) dynW += w;
        if (weightsMode === 'transfer' || j >= ualCount) acc.set(j, (acc.get(j) ?? 0) + w);
      }
      if (weightsMode === 'capsule') {
        // remaining (non-dyn) share is recomputed from capsule distance
        const share = 1 - dynW;
        if (share > 1e-4) {
          _v1.fromBufferAttribute(pos, i).applyMatrix4(toChar);
          let best = null, bestD = 1e9, sum = 0;
          const cand = [];
          for (const s of segs) {
            const d = segDist(_v1, s.a, s.b);
            if (d < bestD) { bestD = d; best = s; }
            if (d < s.r) { const w = (1 - d / s.r) ** 2; cand.push([s.idx, w]); sum += w; }
          }
          if (!cand.length) { cand.push([best.idx, 1]); sum = 1; }
          for (const [idx, w] of cand) acc.set(idx, (acc.get(idx) ?? 0) + (w / sum) * share);
        }
      }
      const arr = [...acc.entries()].sort((a, b) => b[1] - a[1]);
      stats.maxInfluences = Math.max(stats.maxInfluences, arr.length);
      let sum = 0;
      for (let k = 0; k < Math.min(4, arr.length); k++) sum += arr[k][1];
      for (let k = 4; k < arr.length; k++) stats.droppedWeight += arr[k][1];
      const o4 = i * 4;
      for (let k = 0; k < 4; k++) {
        if (k < arr.length && sum > 0) { outI[o4 + k] = arr[k][0]; outW[o4 + k] = arr[k][1] / sum; }
      }
    }
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(outI, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(outW, 4));
    mesh.updateWorldMatrix(true, false);
    mesh.bind(skeleton, bindMatrix); // NOT mesh.matrixWorld — see bindMatrixOf
    mesh.frustumCulled = false; // clip poses leave the bind-pose bounds
    mesh.updateMatrixWorld(true); // (updateWorldMatrix would NOT refresh bindMatrixInverse)
    bindCheck.push({ mesh: mesh.name, bindDev: +bindDev.toExponential(2), oldBox, newBox: worldBox(mesh) });
  }

  // drop the old skeleton (dyn chains have already been moved out)
  if (oldRootJoint) oldRootJoint.removeFromParent();

  /* ---- 4. clips: strip baked translation/scale, remap hips ---- */
  // Hips translation is remapped in WORLD terms about the ankle, scaled by the
  // hip->ankle LEG ratio (not hip height): Aloy's ankle joint sits 2.7 cm off
  // the ground vs the mannequin's 10.4 cm, so hip-height scaling would sink
  // her feet by ~4 cm at deep knee bends. y' = ankleA + (y - ankleU) * legRatio
  // keeps the feet grounded for any knee angle; x/z sway scales the same way.
  const hips = ualBone('DEF-hips');
  const rootQ = rest.get(ualRoot).q.clone();
  const rootQi = rootQ.clone().invert();
  const restHipsW = rest.get(hips).p, fitHipsW = fit.get(hips).p;
  const footU = ualBone('DEF-foot.L');
  const restAnkleY = rest.get(footU).p.y, fitAnkleY = fit.get(footU).p.y;
  const ratio = (fitHipsW.y - fitAnkleY) / Math.max(restHipsW.y - restAnkleY, 1e-4);
  const clips = {};
  const w = new THREE.Vector3();
  for (const clip of ualGltf.animations) {
    const tracks = [];
    for (const tr of clip.tracks) {
      const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(tr.name);
      if (propertyName === 'scale') continue;
      if (propertyName === 'position') {
        if (nodeName === hips.name) {
          const v = tr.values.slice();
          for (let i = 0; i < v.length; i += 3) {
            w.set(v[i], v[i + 1], v[i + 2]).applyQuaternion(rootQ); // root-local -> world (root at origin)
            w.x = fitHipsW.x + (w.x - restHipsW.x) * ratio;
            w.y = fitAnkleY + (w.y - restAnkleY) * ratio;
            w.z = fitHipsW.z + (w.z - restHipsW.z) * ratio;
            w.applyQuaternion(rootQi);
            v[i] = w.x; v[i + 1] = w.y; v[i + 2] = w.z;
          }
          tracks.push(new THREE.VectorKeyframeTrack(tr.name, tr.times.slice(), v, tr.getInterpolation()));
        } else if (nodeName === ualRoot.name) {
          const v = tr.values.slice();
          for (let i = 0; i < v.length; i++) v[i] *= ratio; // root motion (_RM clips)
          tracks.push(new THREE.VectorKeyframeTrack(tr.name, tr.times.slice(), v, tr.getInterpolation()));
        }
        continue;
      }
      tracks.push(tr);
    }
    clips[clip.name] = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  }

  const bones = {};
  for (const b of boneList) bones[b.name] = b;
  for (const [name, s] of Object.entries(sockets)) bones[name] = s;

  log(`reskin: ${ualCount} UAL bones + ${dynBones.length} dyn bones, ${aloyMeshes.length} meshes / ${totalVerts} verts, mode=${weightsMode}, legRatio=${ratio.toFixed(3)}, maxInfl=${stats.maxInfluences}, dropped=${stats.droppedWeight.toFixed(2)}`);

  const rig = {
    root: rigRoot, skeleton, bones, sockets, clips, fitReport, ratio, bindCheck,
    ualBones: Object.fromEntries([...ualBones].map(([k, v]) => [k, v])),
    dynBones, meshes: aloyMeshes, stats, weightsMode,
    handAttach(side) {
      const s = String(side || 'r').toLowerCase()[0];
      return s === 'l' ? sockets.hand_l_014 : sockets.hand_r_045;
    },
    getBoneWorld(name, out) {
      const b = bones[name] ?? bones[sanitize(name)] ?? null;
      if (!b || !out) return null;
      b.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(b.matrixWorld);
    },
  };
  return rig;
}

export function resolveClip(clips, name) {
  if (clips[name]) return clips[name];
  const alias = CLIP_ALIASES[name?.toLowerCase?.()];
  if (alias && clips[alias]) return clips[alias];
  const key = Object.keys(clips).find((k) => k.toLowerCase() === String(name).toLowerCase());
  return key ? clips[key] : null;
}
