import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, composeMat, tint, tube, bake, materials } from './kit.js';

/**
 * ROUND 4 — `world-12`: the camp's people. Six Nora, each in a different idle.
 *
 * WHY NOT `anim-core`. `anim-core` poses SKELETONS, and `public/models/npc.glb`
 * has none: measured on port 5211 it reports `bones: 0`, `skinnedMeshes: 0`,
 * `animations: []` — it is a static mannequin frozen in a spread-arm A-pose.
 * There is no second humanoid asset in the repo and D3 forbids new
 * non-commercial ones, so a clip layer has nothing to write to. The idle is
 * therefore delivered in the two places it CAN be:
 *
 *   1. POSE — a small joint rig applied to the vertices at build time. Each
 *      NPC gets its own arm targets, head and spine, so the six read as six
 *      different silhouettes from across the camp (gate `V35-settlement`
 *      measures this: the hand/head landmarks of every pair must differ).
 *   2. MOTION — a GPU idle layer. Per-vertex `aIdle` (the NPC's own foot pivot
 *      plus a phase) and `aIdleW` (how much this vertex belongs to the upper
 *      body / to which arm) let one shared `uNpcTime` uniform sway, breathe and
 *      swing all six independently, out of one merged mesh.
 *
 * DRAW BUDGET. That second point is the reason for the whole design: six
 * characters that each moved on their own transform would be six times seven
 * meshes (~84 draws with the shadow pass) against a < 350 budget that is
 * already at 277. Merging every NPC into ONE mesh per material and doing the
 * motion in the vertex shader makes six people cost exactly what the single
 * Round-2 mannequin cost — six meshes, and they still all move differently.
 *
 * The per-NPC clothing tint rides the same trick: `vertexColors` on the cloned
 * materials, white on skin and eyes, so nobody wears the same dyed hide.
 */

/** Rest arm axis in npc-root space, from the shoulder toward the hand. */
const ARM_REST = [0.285, -0.53, 0.05];
const SHOULDER_Y = 1.40, SHOULDER_X = 0.205, SHOULDER_Z = 0.01;
const HEAD_PIVOT = [0, 1.52, 0.02];
const SPINE_PIVOT = [0, 1.00, 0.0];

/** Meshes that actually contain arm geometry — hip gear must not deform. */
const ARM_MESHES = /^(Body_low|Clothes_1[1-7]_low|Accessories_(1[6-9]|2[01])_low)/;

/**
 * The six idles. `armR` / `armL` are the world-space directions the arm axis
 * is rotated ONTO (npc-root space, +Z is the way the NPC faces); `head` and
 * `spine` are Euler triples applied at their pivots.
 */
export const POSES = {
  /** by the fire, right palm out to the flames, head tipped down — Round 2 */
  warm: { armR: [0.16, -0.24, 0.55], armL: [-0.095, -0.57, -0.05], head: [0.30, 0.10, 0], spine: [0.05, 0, 0] },
  /** arms folded across the chest, weight on one hip */
  cross: { armR: [0.34, -0.22, 0.50], armL: [-0.34, -0.22, 0.50], head: [0.04, -0.20, 0], spine: [0.03, 0, -0.05] },
  /** leaning on an upright spear, off hand hanging */
  spear: { armR: [0.10, 0.66, 0.20], armL: [-0.12, -0.60, 0.02], head: [-0.05, 0.24, 0], spine: [-0.02, 0, 0.03] },
  /**
   * At ease at the gate: arms down, elbows a touch out, chin up.
   * The first cut aimed the arms at [+-0.66, -0.40, 0.18], which is FLATTER
   * than the source mannequin's own [+-0.285, -0.53, 0.05] rest axis — so the
   * "posed" marshal stood in a wider A-pose than the unposed model.
   */
  hips: { armR: [0.30, -0.94, 0.12], armL: [-0.30, -0.94, 0.12], head: [-0.06, 0.30, 0], spine: [-0.06, 0, 0] },
  /** mid-sentence: one hand raised, head turned to the listener */
  talk: { armR: [0.26, 0.20, 0.72], armL: [-0.22, -0.46, 0.26], head: [0.04, -0.46, 0], spine: [0.02, 0.06, 0] },
  /** bent over a frame, both hands down and forward */
  work: { armR: [0.20, -0.50, 0.66], armL: [-0.20, -0.50, 0.66], head: [0.42, 0.06, 0], spine: [0.44, 0, 0] },
};

/**
 * The camp roster. `id` is stable for progression / dialogue; `talk` marks the
 * one `progression` already registers a TALK interactable on (Varl).
 */
export const ROSTER = [
  { id: 'varl', name: 'VARL', x: 23.0, z: 31.9, pose: 'warm', scale: 1.03, tint: '#c9b79a', face: [22, 30] },
  { id: 'sona', name: 'SONA', x: 18.6, z: 22.0, pose: 'hips', scale: 1.05, tint: '#8ea0a6', face: [13.1, 11] },
  { id: 'teb', name: 'TEB', x: 13.4, z: 34.4, pose: 'work', scale: 0.97, tint: '#b98f5e', face: [12.2, 35.2] },
  { id: 'bast', name: 'BAST', x: 26.9, z: 28.3, pose: 'spear', scale: 1.01, tint: '#a0705a', face: [22, 30], gear: 'spear' },
  { id: 'vala', name: 'VALA', x: 18.4, z: 34.2, pose: 'talk', scale: 0.95, tint: '#9d7fa0', face: [20.0, 35.4] },
  { id: 'karst', name: 'KARST', x: 20.2, z: 35.7, pose: 'cross', scale: 1.0, tint: '#7f8a6a', face: [18.4, 34.2] },
];

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** meshopt models quantise attributes; expand to plain Float32 to bake safely. */
function toFloat(attr) {
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) {
    for (let k = 0; k < attr.itemSize; k++) out[i * attr.itemSize + k] = attr.getComponent(i, k);
  }
  return new THREE.BufferAttribute(out, attr.itemSize);
}

class Joint {
  constructor(pivot, euler) {
    this.pivot = new THREE.Vector3(...pivot);
    this.q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...euler));
  }
}

/** One arm: rest axis, length, and the rotation onto the pose target. */
function armOf(side, target) {
  const pivot = new THREE.Vector3(side * SHOULDER_X, SHOULDER_Y, SHOULDER_Z);
  const dir = new THREE.Vector3(side * ARM_REST[0], ARM_REST[1], ARM_REST[2]);
  const len = dir.length();
  dir.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(
    dir, new THREE.Vector3(...target).normalize());
  return { pivot, dir, len, q, side };
}

/**
 * Build the whole crowd into `group`. Returns
 * `{ anchors, meshes, gear, time, byId, landmarks }`.
 * `anchors` are empty `Object3D`s at each NPC's feet (what `progression` reads
 * through `ctx.camp.npc.position`), `landmarks` are the pose probes gate V35
 * compares (`{ id, headX..., handRX..., handLX... }`).
 */
export function buildNpcCrowd(ctx, group, roster = ROSTER) {
  const src = ctx.assets?.models?.npc?.root;
  if (!src) return null;
  const rng = mulberry32(0x4E9C);
  const smooth = THREE.MathUtils.smoothstep;

  const time = { value: 0 };
  const byMat = new Map();      // material name -> { material, geos }
  const anchors = [];
  const landmarks = [];
  const gearGeos = [];

  for (let n = 0; n < roster.length; n++) {
    const spec = roster[n];
    const pose = POSES[spec.pose] ?? POSES.warm;
    const arms = [armOf(1, pose.armR), armOf(-1, pose.armL)];
    const head = new Joint(HEAD_PIVOT, pose.head);
    const spine = new Joint(SPINE_PIVOT, pose.spine);
    const yaw = Math.atan2((spec.face?.[0] ?? 22) - spec.x, (spec.face?.[1] ?? 30) - spec.z);
    const gy = ctx.terrain.getHeight(spec.x, spec.z) - 0.03;
    const place = composeMat(spec.x, gy, spec.z, 0, yaw, 0, spec.scale);
    const phase = n * 1.97 + rng() * 0.6;
    const tintC = new THREE.Color(spec.tint);

    const model = src.clone();
    model.updateMatrixWorld(true);

    model.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.material || Array.isArray(o.material)) return;
      // The cornea shell ships KHR_materials_transmission; one transmissive
      // material re-renders the WHOLE scene into a transmission target every
      // frame. The opaque inner eye underneath carries the iris — drop it.
      if (o.material.name === 'Outereye') return;

      const key = o.material.name || o.material.uuid;
      let bucket = byMat.get(key);
      if (!bucket) {
        bucket = { material: cloneNpcMaterial(o.material, time), geos: [] };
        byMat.set(key, bucket);
      }

      const flatSrc = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
      const g = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const a = flatSrc.getAttribute(name);
        if (a) g.setAttribute(name, toFloat(a));
      }
      if (flatSrc !== o.geometry) flatSrc.dispose();
      g.applyMatrix4(o.matrixWorld);                 // -> npc-root space

      const armOk = ARM_MESHES.test(o.name || '');
      const posA = g.attributes.position;
      const nrmA = g.attributes.normal;
      const count = posA.count;
      const idle = new Float32Array(count * 4);
      const idleW = new Float32Array(count * 2);
      const col = new Float32Array(count * 3);
      const skin = key === 'Body' || key === 'Innereye' || key === 'Outereye';

      for (let i = 0; i < count; i++) {
        _v.fromBufferAttribute(posA, i);
        const localY = _v.y;

        /* ---- 1. arms ---- */
        let armW = 0;
        if (armOk && Math.abs(_v.x) > 0.14) {
          const a = arms[_v.x > 0 ? 0 : 1];
          _d.copy(_v).sub(a.pivot);
          const s = _d.dot(a.dir);
          if (s > -0.08 && s < a.len + 0.28) {
            const radial = _d.addScaledVector(a.dir, -s).length();
            const w = (1 - smooth(radial, 0.10, 0.16)) * smooth(s, 0.03, 0.27);
            if (w > 0) {
              _q.identity().slerp(a.q, w);
              _v.sub(a.pivot).applyQuaternion(_q).add(a.pivot);
              if (nrmA) { _n.fromBufferAttribute(nrmA, i).applyQuaternion(_q); nrmA.setXYZ(i, _n.x, _n.y, _n.z); }
              armW = w * a.side;
            }
          }
        }

        /* ---- 2. head ---- */
        const hw = smooth(_v.y, 1.44, 1.52);
        if (hw > 0) {
          _q.identity().slerp(head.q, hw);
          _v.sub(head.pivot).applyQuaternion(_q).add(head.pivot);
          if (nrmA) { _n.fromBufferAttribute(nrmA, i).applyQuaternion(_q); nrmA.setXYZ(i, _n.x, _n.y, _n.z); }
        }

        /* ---- 3. spine: carries the torso, the arms and the head ---- */
        const sw = smooth(_v.y, 0.92, 1.30);
        if (sw > 0) {
          _q.identity().slerp(spine.q, sw);
          _v.sub(spine.pivot).applyQuaternion(_q).add(spine.pivot);
          if (nrmA) { _n.fromBufferAttribute(nrmA, i).applyQuaternion(_q); nrmA.setXYZ(i, _n.x, _n.y, _n.z); }
        }

        posA.setXYZ(i, _v.x, _v.y, _v.z);
        // idle weights are taken in NPC space, before placement
        idleW[i * 2] = smooth(localY, 0.15, 1.35);
        idleW[i * 2 + 1] = armW;
        idle[i * 4] = spec.x; idle[i * 4 + 1] = gy; idle[i * 4 + 2] = spec.z; idle[i * 4 + 3] = phase;
        if (skin) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 1; }
        else {
          const j = 0.9 + rng() * 0.2;
          col[i * 3] = tintC.r * j; col[i * 3 + 1] = tintC.g * j; col[i * 3 + 2] = tintC.b * j;
        }
      }
      if (nrmA) nrmA.needsUpdate = true;

      g.applyMatrix4(place);                         // -> world space
      g.setAttribute('aIdle', new THREE.BufferAttribute(idle, 4));
      g.setAttribute('aIdleW', new THREE.BufferAttribute(idleW, 2));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      bucket.geos.push(g);
    });

    /* anchors + pose landmarks (the numbers gate V35 compares) */
    const anchor = new THREE.Object3D();
    anchor.name = `camp-npc-${spec.id}`;
    anchor.position.set(spec.x, gy, spec.z);
    anchor.rotation.y = yaw;
    anchor.userData.npc = spec;
    group.add(anchor);
    anchors.push(anchor);

    const probe = (p) => {
      _v.set(p[0], p[1], p[2]).applyMatrix4(place);
      return [+_v.x.toFixed(3), +_v.y.toFixed(3), +_v.z.toFixed(3)];
    };
    const handOf = (a) => {
      const v = new THREE.Vector3().copy(a.dir).multiplyScalar(a.len).applyQuaternion(a.q).add(a.pivot);
      return [v.x, v.y, v.z];
    };
    landmarks.push({
      id: spec.id, pose: spec.pose,
      head: probe([HEAD_PIVOT[0], HEAD_PIVOT[1] + 0.12, HEAD_PIVOT[2]]),
      handR: probe(handOf(arms[0])),
      handL: probe(handOf(arms[1])),
      // the pose in NPC space too, so distinctness is not just "they stand apart"
      localR: handOf(arms[0]).map((v) => +v.toFixed(3)),
      localL: handOf(arms[1]).map((v) => +v.toFixed(3)),
      localHead: [+pose.head[0].toFixed(3), +pose.head[1].toFixed(3), +pose.spine[0].toFixed(3)],
    });

    if (spec.gear === 'spear') {
      // an upright spear under the raised hand
      const h = handOf(arms[0]);
      _v.set(h[0], h[1], h[2]).applyMatrix4(place);
      const bx = _v.x + Math.sin(yaw) * 0.05, bz = _v.z + Math.cos(yaw) * 0.05;
      const gyb = ctx.terrain.getHeight(bx, bz);
      tube(gearGeos, [bx, gyb - 0.05, bz], [bx + 0.02, gyb + 2.25, bz - 0.02], 0.028, 0.02, '#5b4630', 5, 0.07, rng);
      const head2 = new THREE.ConeGeometry(0.05, 0.3, 5);
      tint(head2, '#8d949a', 0.08, rng);
      head2.applyMatrix4(composeMat(bx + 0.02, gyb + 2.4, bz - 0.02));
      gearGeos.push(head2.toNonIndexed());
    }
  }

  /* ---- merge: one mesh per material for the WHOLE crowd ---- */
  const meshes = [];
  for (const [name, { material, geos }] of byMat) {
    if (!geos.length) continue;
    let names = null;
    for (const g of geos) {
      const ks = Object.keys(g.attributes);
      names = names ? names.filter((k) => ks.includes(k)) : ks;
    }
    for (const g of geos) {
      for (const k of Object.keys(g.attributes)) if (!names.includes(k)) g.deleteAttribute(k);
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `camp-npc-${name}`;
    mesh.castShadow = name !== 'Innereye';
    mesh.receiveShadow = true;
    // people are not level geometry: keep them out of the static collider seed
    // and out of aim/interact raycasts (spatial seeds `hunter-camp` per mesh).
    mesh.raycast = () => {};
    group.add(mesh);
    meshes.push(mesh);
  }

  const gear = bake(gearGeos, materials().hide, { name: 'camp-npc-gear', castShadow: false });
  if (gear) group.add(gear);

  const byId = {};
  for (const a of anchors) byId[a.userData.npc.id] = a;
  return { anchors, meshes, gear, time, byId, landmarks };
}

/**
 * Clone a GLTF material and weave in the idle layer. Cloned because the source
 * materials belong to `assets.models.npc` and are shared with anything else
 * that ever instantiates that model.
 *
 * The patch is installed BEFORE `environment._registerScene()` first runs, so
 * `environment.registerMaterial` picks it up as the `prev` in its chain and the
 * fog / CSM / cloud-shadow injections stack on top of it rather than replacing
 * it (src/world/environment.js `registerMaterial`).
 */
function cloneNpcMaterial(src, time) {
  const m = src.clone();
  m.vertexColors = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNpcTime = time;
    shader.vertexShader = `
      attribute vec4 aIdle;
      attribute vec2 aIdleW;
      uniform float uNpcTime;
    ` + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      {
        float ph = aIdle.w;
        float t  = uNpcTime;
        float bw = aIdleW.x;
        float aw = aIdleW.y;
        // weight shift + breath: slow, two incommensurate rates so no two
        // NPCs ever line up, and no NPC ever looks metronomic
        float sway  = (sin(t * 0.62 + ph) * 0.046 + sin(t * 0.271 + ph * 1.7) * 0.024) * bw;
        float roll  = sin(t * 0.41 + ph * 0.8) * 0.022 * bw;
        float breath = sin(t * 1.05 + ph) * 0.014 * bw;
        vec3 rel = transformed - aIdle.xyz;
        float cs = cos(sway), sn = sin(sway);
        rel = vec3(cs * rel.x + sn * rel.z, rel.y, -sn * rel.x + cs * rel.z);
        float cr = cos(roll), sr = sin(roll);
        rel = vec3(cr * rel.x - sr * rel.y, sr * rel.x + cr * rel.y, rel.z);
        rel.y += breath;
        rel.x += sin(t * 0.53 + ph * 2.3) * 0.038 * aw;
        rel.z += cos(t * 0.47 + ph * 1.9) * 0.030 * aw;
        transformed = aIdle.xyz + rel;
      }
    `);
  };
  m.needsUpdate = true;
  return m;
}
