import * as THREE from 'three';
import { guardMaterialDisposal } from './lod.js';

/**
 * Bone-space sockets with a bind-pose proxy snap (`machine-rig-02`).
 *
 * Round 3 authored every component, eye and weak point as an offset in BODY
 * space and then reparented it onto the nearest bone. That is right for
 * riding the pose and wrong for sitting on the hull: the authored offset was
 * a guess against a sculpt nobody had measured, so the audit filmed a
 * Thunderjaw tail-tip launcher **1.50 m** off the tail and Longleg concussion
 * sacs **1.51 m** off the chest once the death clip had played.
 *
 * The fix is a proxy, not a table of hand-tuned offsets:
 *
 * - `buildHullProxy()` samples the sculpt's vertices ONCE per machine and
 *   stores each sample in the frame of the bone that dominates its skin
 *   weights. `hullWorld(i)` is then `bone.matrixWorld * pBone` — rigid
 *   skinning by the dominant bone, which is exactly how `autorig.js` weights
 *   a robot (dominant weight 0.85–1.0). It costs one matrix-vector product
 *   per sample and it is correct in EVERY pose, alive or dead.
 * - `snapSockets()` pulls any socket whose gap to that proxy exceeds
 *   `maxGap` straight onto the surface, in the bone's own frame, so the
 *   correction survives the pose.
 * - `socketReport()` is the measurement gate `A44b-socket-vertex-integrity`
 *   reads — the strict vertex form of A44, alive and dead.
 *
 * Cold path: build and snap run once per machine at construction; the report
 * is for gates and the Studio panel.
 */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Sample budget. The measured gap includes the proxy's own sampling density:
 * on a 13 m Thunderjaw tail, 900 samples over the whole hull leave ~0.15 m
 * between neighbours, which is most of the gap the strict socket gate reads
 * at the tail tip. 2400 halves that, and it is a one-off cost at construction
 * (a few hundred microseconds) — `nearestHull` is a cold path.
 */
const DEFAULT_SAMPLES = 2400;

/**
 * Sampling density is a MEASUREMENT ERROR, not slack, so it is sized against
 * the machine instead of being a constant: a 2400-sample proxy leaves ~0.15 m
 * between neighbours on a 13 m Thunderjaw tail and ~0.02 m on a 1.5 m
 * Scrapper. `sampleBudget()` holds the spacing roughly constant by scaling
 * with hull area, and `proxySpacing()` reports what is left so a gate can
 * print the residual as its own named term (Round-4 fix round 1: the strict
 * socket gate used to buy its pass with a blanket 0.12 m radius credit that
 * hid exactly this term).
 */
function sampleBudget(machine, want) {
  if (want) return want;
  const h = machine.height || 2.5;
  const r = Math.max(0.5, machine.bodyRadius || 1);
  // area-like measure normalised to a 2.5 m strider, clamped to sane limits
  const k = (h * r) / (2.5 * 1.0);
  return Math.round(THREE.MathUtils.clamp(DEFAULT_SAMPLES * k, DEFAULT_SAMPLES, 14000));
}

/**
 * Sample the machine's hull into bone-local space.
 * @param {object} machine
 * @param {object} [opts]
 * @param {number} [opts.samples=900]
 */
export function buildHullProxy(machine, opts = {}) {
  const model = machine.model;
  if (!model) return null;
  const scan = machine.root || model;
  scan.updateWorldMatrix(true, true);

  const meshes = [];
  let total = 0;
  scan.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    if (o.userData.noHull) return;
    // A part is not HULL (a socket may not snap to the thing hanging off it)
    // but it IS geometry the ground solve has to see, so it is sampled and
    // tagged instead of skipped.
    meshes.push(o);
    total += o.geometry.attributes.position.count;
  });
  if (!meshes.length) return null;

  const want = Math.min(sampleBudget(machine, opts.samples), total);
  const stride = Math.max(1, Math.floor(total / want));
  const pos = new Float32Array(want * 3);       // sample in bone0's frame
  const pos1 = new Float32Array(want * 3);      // same sample in bone1's frame
  const boneOf = new Int32Array(want);
  const bone1Of = new Int32Array(want);
  const w0 = new Float32Array(want);
  const partOf = new Uint8Array(want);   // 1 = component, not hull
  const bones = [];
  const boneIndex = new Map();
  let n = 0;

  const idxOf = (bone) => {
    let idx = boneIndex.get(bone);
    if (idx === undefined) { idx = bones.length; bones.push(bone); boneIndex.set(bone, idx); }
    return idx;
  };

  for (const mesh of meshes) {
    const g = mesh.geometry;
    const P = g.attributes.position;
    const SI = g.attributes.skinIndex;
    const SW = g.attributes.skinWeight;
    const skel = mesh.isSkinnedMesh ? mesh.skeleton : null;
    const isPart = isPartMesh(mesh) ? 1 : 0;
    // A STATIC mesh parented under a bone (every kitbash shell piece on a
    // GLB-rigged species, and every component socket) rides that bone. Round 4
    // stored it in the MODEL frame, so the proxy said a Longleg wing was still
    // beside the ribs while the bone had swung it out — which is how a corpse
    // solve measured against the proxy could read a metre high. It is stored
    // in the bone's frame, exactly like a skinned sample.
    const rigid = skel ? null : boneAncestor(mesh);
    // THE BIND FRAME, not the live one. three skins as
    //   world = bone.matrixWorld * boneInverse * bindMatrix * v
    // (in AttachedBindMode `bindMatrixInverse` cancels `mesh.matrixWorld`
    // every frame), so a sample taken through `mesh.matrixWorld` is only
    // correct for a rig bound in place — which the auto-rigged sculpts are
    // and the `SkeletonUtils.clone()` species are NOT. That mismatch is why
    // the strict socket gate read 2.03 m on a dead Longleg while the same
    // machine read 0.07 m alive.
    const bind = skel ? mesh.bindMatrix : mesh.matrixWorld;
    for (let i = 0; i < P.count && n < want; i += stride) {
      _v.fromBufferAttribute(P, i).applyMatrix4(bind);
      let b0 = -1, b1 = -1, weight0 = 1;
      if (skel && SI && SW) {
        // top TWO influences: a single dominant bone is exact on a plate and
        // wrong by a joint radius across a hinge, which is where sockets sit
        let i0 = -1, x0 = -1, i1 = -1, x1 = -1;
        for (let k = 0; k < 4; k++) {
          const w = SW.getComponent(i, k);
          const b = SI.getComponent(i, k);
          if (w > x0) { i1 = i0; x1 = x0; i0 = b; x0 = w; }
          else if (w > x1) { i1 = b; x1 = w; }
        }
        const bone0 = skel.bones[i0];
        const bone1 = x1 > 0.02 ? skel.bones[i1] : null;
        if (bone0 && x0 > 0) {
          b0 = idxOf(bone0);
          weight0 = bone1 ? x0 / (x0 + x1) : 1;
          _v2.copy(_v).applyMatrix4(skel.boneInverses[i0]);
          pos[n * 3] = _v2.x; pos[n * 3 + 1] = _v2.y; pos[n * 3 + 2] = _v2.z;
          if (bone1) {
            b1 = idxOf(bone1);
            _v2.copy(_v).applyMatrix4(skel.boneInverses[i1]);
            pos1[n * 3] = _v2.x; pos1[n * 3 + 1] = _v2.y; pos1[n * 3 + 2] = _v2.z;
          }
        }
      }
      if (b0 < 0) {
        if (rigid) {
          b0 = idxOf(rigid);
          _m.copy(rigid.matrixWorld).invert();
          _v.applyMatrix4(_m);
        } else {
          // free static mesh: keep the point in the model's own frame
          _m.copy(model.matrixWorld).invert();
          _v.applyMatrix4(_m);
        }
        pos[n * 3] = _v.x; pos[n * 3 + 1] = _v.y; pos[n * 3 + 2] = _v.z;
      }
      boneOf[n] = b0;
      bone1Of[n] = b1;
      w0[n] = weight0;
      partOf[n] = isPart;
      n++;
    }
    if (n >= want) break;
  }

  // FACE CENTROIDS. Once the donor sculpt is retired (`hideSculpt`) the hull
  // IS the kitbash shell, and a shell is a few thousand vertices spread over a
  // 15 m machine: the Thunderjaw's proxy measured a 0.114 m median spacing,
  // which is the whole socket budget. A vertex cloud has no samples in the
  // MIDDLE of a plate, and the middle of a plate is exactly where a component
  // sits, so every face contributes its centroid as well. Same bone, same
  // frame, no extra bookkeeping.
  for (const mesh of meshes) {
    if (n >= want) break;
    const g = mesh.geometry;
    const P = g.attributes.position;
    const idx = g.index;
    const faces = (idx ? idx.count : P.count) / 3;
    if (faces < 1) continue;
    const skel = mesh.isSkinnedMesh ? mesh.skeleton : null;
    const SI = g.attributes.skinIndex;
    const SW = g.attributes.skinWeight;
    const bind = skel ? mesh.bindMatrix : mesh.matrixWorld;
    const rigid = skel ? null : boneAncestor(mesh);
    const isPart = isPartMesh(mesh) ? 1 : 0;
    const fstride = Math.max(1, Math.floor(faces / Math.max(1, (want - n) / meshes.length)));
    for (let f = 0; f < faces && n < want; f += fstride) {
      let cx = 0, cy = 0, cz = 0, i0 = 0;
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx.getX(f * 3 + k) : f * 3 + k;
        if (k === 0) i0 = vi;
        _v.fromBufferAttribute(P, vi);
        cx += _v.x; cy += _v.y; cz += _v.z;
      }
      _v.set(cx / 3, cy / 3, cz / 3).applyMatrix4(bind);
      let b0 = -1;
      if (skel && SI && SW) {
        // the dominant bone of the face's first corner: a face never spans a
        // joint in a plate kitbash
        let bi = -1, bw = -1;
        for (let k = 0; k < 4; k++) {
          const w = SW.getComponent(i0, k);
          if (w > bw) { bw = w; bi = SI.getComponent(i0, k); }
        }
        const bone0 = skel.bones[bi];
        if (bone0 && bw > 0) {
          b0 = idxOf(bone0);
          _v.applyMatrix4(skel.boneInverses[bi]);
        }
      }
      if (b0 < 0) {
        if (rigid) { b0 = idxOf(rigid); _m.copy(rigid.matrixWorld).invert(); _v.applyMatrix4(_m); }
        else { _m.copy(model.matrixWorld).invert(); _v.applyMatrix4(_m); }
      }
      pos[n * 3] = _v.x; pos[n * 3 + 1] = _v.y; pos[n * 3 + 2] = _v.z;
      boneOf[n] = b0; bone1Of[n] = -1; w0[n] = 1; partOf[n] = isPart;
      n++;
    }
  }

  const proxy = { pos, pos1, boneOf, bone1Of, w0, partOf, bones, count: n, model };
  proxy.spacing = proxySpacing(proxy);
  machine.hullProxy = proxy;
  return proxy;
}

/** Nearest bone ancestor of a static mesh (null when it hangs off the model). */
function boneAncestor(o) {
  let p = o.parent;
  while (p) { if (p.isBone) return p; p = p.parent; }
  return null;
}

/** Is this mesh a bolted-on component rather than the machine's own hull? */
function isPartMesh(o) {
  let p = o;
  while (p) { if (p.userData?.part) return true; p = p.parent; }
  return false;
}

/**
 * Median nearest-neighbour spacing of the proxy, in BIND space — the honest
 * resolution limit of every distance this module reports. Sampled over 160
 * points against 400 candidates so it costs microseconds at build time.
 */
function proxySpacing(proxy) {
  const n = proxy.count;
  if (n < 8) return 0;
  const probes = Math.min(160, n);
  const cand = Math.min(400, n);
  const ds = [];
  for (let a = 0; a < probes; a++) {
    const i = Math.floor((a / probes) * n);
    const o3 = i * 3;
    let best = Infinity;
    for (let b = 0; b < cand; b++) {
      const j = Math.floor((b / cand) * n);
      if (j === i) continue;
      const p3 = j * 3;
      const dx = proxy.pos[o3] - proxy.pos[p3];
      const dy = proxy.pos[o3 + 1] - proxy.pos[p3 + 1];
      const dz = proxy.pos[o3 + 2] - proxy.pos[p3 + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) best = d;
    }
    if (Number.isFinite(best)) ds.push(Math.sqrt(best));
  }
  if (!ds.length) return 0;
  ds.sort((x, y) => x - y);
  return +ds[Math.floor(ds.length / 2)].toFixed(4);
}

const _vb = new THREE.Vector3();

/** World position of hull sample `i` in the CURRENT pose (2-bone blend). */
export function hullWorld(proxy, i, out = _v2) {
  const o3 = i * 3;
  out.set(proxy.pos[o3], proxy.pos[o3 + 1], proxy.pos[o3 + 2]);
  const bi = proxy.boneOf[i];
  if (bi < 0) return out.applyMatrix4(proxy.model.matrixWorld);
  out.applyMatrix4(proxy.bones[bi].matrixWorld);
  const bj = proxy.bone1Of[i];
  if (bj >= 0) {
    _vb.set(proxy.pos1[o3], proxy.pos1[o3 + 1], proxy.pos1[o3 + 2])
      .applyMatrix4(proxy.bones[bj].matrixWorld);
    out.lerp(_vb, 1 - proxy.w0[i]);
  }
  return out;
}

/**
 * Nearest hull sample to a world point. Returns { dist, index }.
 *
 * `rigidOnly` restricts the search to samples a SINGLE bone owns outright
 * (dominant weight >= 0.97). That matters for the snap and not for the
 * measurement: a socket rides one bone rigidly, so if the sample it was
 * snapped against is blended between two bones, the two drift apart the
 * moment the joint bends — which on a Thunderjaw's whipping tail is worth
 * ~0.09 m of the 0.10 m budget all by itself. Snap against rigid geometry
 * and the gap is invariant in every pose.
 */
export function nearestHull(proxy, worldPoint, rigidOnly = false) {
  let best = Infinity, idx = -1;
  for (let i = 0; i < proxy.count; i++) {
    if (proxy.partOf && proxy.partOf[i]) continue;      // a part is not hull
    if (rigidOnly && proxy.boneOf[i] >= 0 && proxy.w0[i] < 0.97) continue;
    hullWorld(proxy, i, _v2);
    const d = _v2.distanceToSquared(worldPoint);
    if (d < best) { best = d; idx = i; }
  }
  return { dist: Math.sqrt(best), index: idx };
}

const _t0 = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _e0 = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _tri = /* @__PURE__ */ new THREE.Triangle();
const _cp = new THREE.Vector3();

/**
 * Distance from a world point to the SAMPLED SURFACE, not to the nearest
 * sample.
 *
 * A point cloud always over-reports: a socket sitting exactly on a plate reads
 * half the sample spacing away simply because no sample landed under it. The
 * three nearest samples span a patch of that plate, so projecting onto their
 * triangle removes most of the discretisation bias — and what it cannot remove
 * is reported separately as `proxy.spacing` instead of being paid for with a
 * blanket radius credit.
 *
 * @returns {{dist:number, sample:number, index:number}}
 *   `dist` is to the surface patch, `sample` to the nearest sample alone.
 */
export function surfaceDistance(proxy, worldPoint) {
  let d0 = Infinity, d1 = Infinity, d2 = Infinity;
  let i0 = -1, i1 = -1, i2 = -1;
  for (let i = 0; i < proxy.count; i++) {
    if (proxy.partOf && proxy.partOf[i]) continue;
    hullWorld(proxy, i, _v2);
    const d = _v2.distanceToSquared(worldPoint);
    if (d < d0) { d2 = d1; i2 = i1; d1 = d0; i1 = i0; d0 = d; i0 = i; }
    else if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; }
    else if (d < d2) { d2 = d; i2 = i; }
  }
  if (i0 < 0) return { dist: Infinity, sample: Infinity, index: -1 };
  const sample = Math.sqrt(d0);
  if (i2 < 0) return { dist: sample, sample, index: i0 };
  hullWorld(proxy, i0, _t0);
  hullWorld(proxy, i1, _t1);
  hullWorld(proxy, i2, _t2);
  // degenerate patch (three near-collinear samples): the projection would be
  // meaningless, so fall back to the honest point distance
  _e0.subVectors(_t1, _t0); _e1.subVectors(_t2, _t0);
  if (_e0.cross(_e1).lengthSq() < 1e-10) return { dist: sample, sample, index: i0 };
  _tri.set(_t0, _t1, _t2);
  _tri.closestPointToPoint(worldPoint, _cp);
  const dist = Math.min(sample, _cp.distanceTo(worldPoint));
  return { dist, sample, index: i0 };
}

/**
 * Lowest world Y of the machine's hull IN THE CURRENT POSE, over every sample
 * including components. This is the quantity the audit's corpse test measures
 * ("lowest posed vertex vs terrain") and the one a bind-pose AABB cannot see:
 * a SkinnedMesh's box is fixed to the mesh NODE and does not follow the bones,
 * so a collapsed corpse is invisible to it (measured Round 4: a Thunderjaw
 * wreck read -0.49 m by box and -2.49 m by posed vertex).
 * @returns {{y:number, cx:number, cz:number}|null}
 */
export function posedLowest(machine) {
  const proxy = machine.hullProxy;
  if (!proxy || !proxy.count) return null;
  let y = Infinity, cx = 0, cz = 0, n = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < proxy.count; i++) {
    hullWorld(proxy, i, _v2);
    if (_v2.y < y) y = _v2.y;
    if (_v2.x < minX) minX = _v2.x;
    if (_v2.x > maxX) maxX = _v2.x;
    if (_v2.z < minZ) minZ = _v2.z;
    if (_v2.z > maxZ) maxZ = _v2.z;
    n++;
  }
  if (!n || !Number.isFinite(y)) return null;
  cx = (minX + maxX) * 0.5; cz = (minZ + maxZ) * 0.5;
  return { y, cx, cz };
}

/**
 * Deliberate PROUD offsets — the only radius credit a non-weak-point socket
 * gets, named one by one.
 *
 * `combat-blaze-canister-unreachable-frontal` asks for the canister to stand
 * clear of the hull so a frontal shot can reach it; that is a design decision
 * with a number, not measurement slack, so it is declared here and reported by
 * name in `socketReport()`. Everything else measures at zero credit — Round 4
 * shipped a blanket `radius: 0.12` on every part and eye, which quietly hid
 * true gaps of 0.15-0.165 m under a 0.10 m budget.
 */
const PROUD = {
  'blaze-canister': 0.10,
  'blaze canister': 0.10,
  'canister': 0.10,
};

function proudOf(name) {
  const k = String(name || '').toLowerCase();
  for (const key in PROUD) if (k.includes(key)) return PROUD[key];
  return 0;
}

/** Every socket on a machine: parts, eyes and weak points. */
export function sockets(machine) {
  const out = [];
  for (const p of machine.parts || []) {
    if (p.attached && p.mesh) {
      out.push({ kind: 'part', name: p.name, obj: p.mesh, radius: proudOf(p.name), proud: proudOf(p.name) });
    }
  }
  for (const wp of machine.weakPoints || []) {
    // a weak point's radius is a PHYSICAL hit radius the combat lane aims at,
    // so it is a real body, not a credit
    if (wp.obj) out.push({ kind: 'weak', name: wp.name, obj: wp.obj, radius: wp.radius || 0 });
  }
  // eye halos: `addEye` sprites live under body/model and carry no part tag
  let n = 0;
  machine.body?.traverse((o) => {
    if (!o.isSprite || o.userData.part) return;
    out.push({ kind: 'eye', name: o.name || `glow-${n++}`, obj: o, radius: 0 });
  });
  for (const s of machine._sockets || []) out.push(s);
  return out;
}

/**
 * Pull every socket onto the hull in its OWN bone's frame.
 * @param {object} machine
 * @param {object} [opts]
 * @param {number} [opts.maxGap=0.08]  gap that triggers a correction
 * @param {number} [opts.target=0.035] gap left after the correction
 */
export function snapSockets(machine, opts = {}) {
  // published for gate A44b and the Studio panel
  if (!machine.socketReport) machine.socketReport = () => socketReport(machine);
  // Last call in every species constructor: catch the materials that were
  // created after `attachRigRuntime` ran (see `guardMaterialDisposal`).
  try { guardMaterialDisposal(machine); } catch (e) { /* renderer not up yet */ }
  // ALWAYS (re)build: this is the one call site that runs after the kitbash
  // shell is attached, and a proxy built before the shell cannot see it
  const proxy = buildHullProxy(machine, opts) || machine.hullProxy;
  if (!proxy || !proxy.count) return { moved: 0, worstBefore: 0, worstAfter: 0 };
  // Snap TIGHT. The gate measures in every pose, and a socket rides ONE bone
  // rigidly while the hull under it is blended between two — on a whipping
  // Thunderjaw tail that divergence is worth ~0.09 m by itself. Landing the
  // socket ON the hull in bind (rather than 0.035 m proud of it) leaves the
  // whole 0.10 m budget as headroom for the pose instead of two thirds of it.
  const maxGap = opts.maxGap ?? 0.02;
  const target = opts.target ?? 0.003;
  machine.root.updateWorldMatrix(true, true);

  let moved = 0, worstBefore = 0, worstAfter = 0, reparented = 0;
  for (const s of sockets(machine)) {
    const obj = s.obj;
    if (!obj || obj.userData.noSnap) continue;
    obj.getWorldPosition(_v);
    // snap against RIGID hull (see nearestHull); fall back to the blended
    // nearest only when this socket has no rigid geometry anywhere near it
    let near = nearestHull(proxy, _v, true);
    if (near.index < 0 || near.dist > 1.5) near = nearestHull(proxy, _v);
    const gap = Math.max(0, near.dist - (s.radius || 0));
    if (near.index < 0) continue;
    worstBefore = Math.max(worstBefore, gap);
    // BONE-SPACE SOCKET: ride the bone that owns the hull under the socket,
    // not whichever capsule the auto-rig's nearest-segment sweep picked. A
    // Thunderjaw eye glow attached to the neck while the plate under it is
    // skinned to the head drifts 0.16 m the moment the skull drops in a death
    // pose; attached here, the gap is invariant in every pose.
    const owner = proxy.bones[proxy.boneOf[near.index]];
    if (owner && owner.isBone && obj.parent !== owner && !obj.userData.noReparent) {
      owner.attach(obj);
      reparented++;
    }
    if (gap <= maxGap) { worstAfter = Math.max(worstAfter, gap); continue; }
    // move the minimum distance along the line to the nearest surface sample
    hullWorld(proxy, near.index, _v2);
    const t = 1 - (target + (s.radius || 0)) / Math.max(near.dist, 1e-5);
    _v.lerp(_v2, THREE.MathUtils.clamp(t, 0, 1));
    obj.parent.worldToLocal(_v);
    obj.position.copy(_v);
    obj.updateWorldMatrix(true, false);
    moved++;
    worstAfter = Math.max(worstAfter, target);
  }
  machine._socketSnap = {
    moved, reparented,
    worstBefore: +worstBefore.toFixed(3), worstAfter: +worstAfter.toFixed(3),
  };
  return machine._socketSnap;
}

/**
 * Strict per-socket hull gap in the CURRENT pose — the payload gate
 * `A44b-socket-vertex-integrity` reads (alive and 2 s after death).
 */
export function socketReport(machine) {
  const proxy = machine.hullProxy;
  if (!proxy || !proxy.count) return null;
  machine.root.updateWorldMatrix(true, true);
  const out = {};
  const proud = {};
  let worst = 0, worstName = null, worstSample = 0;
  for (const s of sockets(machine)) {
    if (!s.obj) continue;
    s.obj.getWorldPosition(_v);
    const near = surfaceDistance(proxy, _v);
    if (!Number.isFinite(near.dist)) continue;
    const credit = s.radius || 0;
    if (s.proud) proud[`${s.kind}:${s.name}`] = s.proud;
    const gap = Math.max(0, near.dist - credit);
    out[`${s.kind}:${s.name}`] = +gap.toFixed(3);
    if (gap > worst) { worst = gap; worstName = `${s.kind}:${s.name}`; worstSample = near.sample; }
  }
  return {
    kind: machine.kind,
    worstGapM: +worst.toFixed(3),
    worstSocket: worstName,
    // named measurement term, NOT slack: how far apart the proxy samples are.
    // A gap below this is inside the noise floor of the measurement.
    samplingSpacingM: proxy.spacing ?? 0,
    worstNearestSampleM: +worstSample.toFixed(3),
    samples: proxy.count,
    // declared proud offsets (design decisions with a number), by socket
    proudOffsetsM: proud,
    sockets: out,
  };
}
