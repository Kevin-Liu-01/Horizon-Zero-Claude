import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, composeMat, tint } from './props/kit.js';

/**
 * ROUND 4 — `world-15` (no wildlife). Three instanced species that graze the
 * valley, bolt when you get close, and skin for real inventory items.
 *
 * SHAPE OF THE SOLUTION. Wildlife has to be cheap enough to be everywhere and
 * alive enough to be worth hunting, and those pull against each other. The
 * split here:
 *
 *   - ONE `InstancedMesh` per species (3 draws + 3 shadow draws for 34
 *     animals), so a herd costs what one boar costs.
 *   - The GAIT is a vertex-shader layer, not a transform hierarchy: per-vertex
 *     `aAnim` says which limb a vertex belongs to and how far down it sits,
 *     per-instance `aPhase` / `aGait` say where in the stride this animal is
 *     and how hard it is running. So every animal in the herd is on its own
 *     stride out of one mesh, and a stopped animal simply has `aGait = 0`.
 *   - The AI is 34 state machines over plain floats in flat arrays, with no
 *     per-frame allocation and no pathfinding: graze -> alert -> flee -> settle.
 *
 * HUNTING WITHOUT TOUCHING `combat`. `src/combat/**` belongs to another lane
 * and `ctx.hitHulls` only carries the machine roster, so arrows cannot hit an
 * animal through the shipped path. Rather than reach into another lane's file,
 * this module sweeps the live arrows itself: `ctx.combat.arrows.list` is read
 * (never written) and each flying arrow's segment for this frame is tested
 * against the animal capsules. It also listens to `arrow-hit` and `melee-hit`
 * as a backstop. The clean long-term contract is published here for `combat`
 * to call when it wants it:
 *
 *     ctx.fauna.hitscan(ox, oy, oz, dx, dy, dz, far)  -> record | null
 *     ctx.fauna.damageAt(x, y, z, radius, amount, opts) -> animal | null
 *     ctx.fauna.damage(animal, amount, opts)
 *     ctx.fauna.nearest(x, z, maxDist)   ctx.fauna.census()
 *
 * EVENTS: `fauna-alerted` {species, x, z}, `fauna-killed`
 * {species, id, x, y, z, loot}, `fauna-looted` {species, id}.
 */

const DEG = Math.PI / 180;

/* -------------------------------------------------------------------------- */
/*                                  SPECIES                                    */
/* -------------------------------------------------------------------------- */

const SPECIES = {
  boar: {
    name: 'Boar', count: 12, bodyR: 0.46, eye: 0.62,
    grazeSpeed: 0.65, walkSpeed: 1.5, fleeSpeed: 7.2,
    alertR: 20, fleeR: 13, calmT: [5, 9], strideRate: 9.5,
    roam: 16, hp: 34,
    loot: [{ id: 'boar-hide', n: 1 }, { id: 'fatty-meat', n: 2 }, { id: 'bone', n: 1 }],
    homes: [[-64, 96], [118, 58], [44, -92]],
  },
  fox: {
    name: 'Fox', count: 8, bodyR: 0.24, eye: 0.38,
    grazeSpeed: 1.1, walkSpeed: 2.4, fleeSpeed: 9.4,
    alertR: 26, fleeR: 19, calmT: [4, 7], strideRate: 13.5,
    roam: 26, hp: 14,
    loot: [{ id: 'fox-pelt', n: 1 }, { id: 'lean-meat', n: 1 }],
    homes: [[-130, 40], [70, 150], [-40, -140], [160, -30]],
  },
  grouse: {
    name: 'Ridge Grouse', count: 16, bodyR: 0.2, eye: 0.3,
    grazeSpeed: 0.45, walkSpeed: 1.2, fleeSpeed: 6.6,
    alertR: 16, fleeR: 10, calmT: [3, 6], strideRate: 15.0,
    roam: 11, hp: 6,
    loot: [{ id: 'bird-feather', n: 3 }, { id: 'lean-meat', n: 1 }, { id: 'bone', n: 1 }],
    homes: [[-24, -56], [96, 128], [-96, 8]],
  },
  /**
   * ROUND 4 EXPANSION — two more species, sited at the new places.
   *
   * `goat` ranges the Glowfall massif and the Stacks: horns give a herbivore a
   * silhouette a hunter can name at 40 m, which neither the boar nor the grouse
   * has from behind, and a cliff-dweller is the only animal in the roster that
   * makes the new verticality worth looking up at. Slower to spook than a fox
   * and much harder to close on, because it climbs away from you.
   *
   * `hare` fills the opposite hole: 24 small, twitchy animals that break cover
   * at 22 m. They are the reason the meadows read as inhabited between herds,
   * and the cheapest legal target for the arena's practice arrows.
   */
  goat: {
    name: 'Ridge Goat', count: 10, bodyR: 0.34, eye: 0.58,
    grazeSpeed: 0.55, walkSpeed: 1.7, fleeSpeed: 8.2,
    alertR: 24, fleeR: 15, calmT: [5, 9], strideRate: 10.5,
    roam: 18, hp: 26,
    loot: [{ id: 'boar-hide', n: 1 }, { id: 'fatty-meat', n: 1 }, { id: 'bone', n: 2 }],
    homes: [[-40, -196], [92, 132], [186, -112]],
  },
  hare: {
    name: 'Scrub Hare', count: 14, bodyR: 0.15, eye: 0.24,
    grazeSpeed: 0.5, walkSpeed: 1.4, fleeSpeed: 8.8,
    alertR: 22, fleeR: 14, calmT: [2, 5], strideRate: 17.0,
    roam: 13, hp: 5,
    loot: [{ id: 'fox-pelt', n: 1 }, { id: 'lean-meat', n: 1 }],
    homes: [[-100, 238], [132, -70], [-88, 44], [-190, -58]],
  },
};

/* state ids kept as small ints — this loop runs 34x a frame */
const GRAZE = 0, WALK = 1, ALERT = 2, FLEE = 3, DEAD = 4;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();
const _seg = new THREE.Vector3();

/* -------------------------------------------------------------------------- */
/*                            GEOMETRY (procedural)                            */
/* -------------------------------------------------------------------------- */

/**
 * Tag a part with its animation role and merge it in.
 *   limb: -1 | 0 | +1   which diagonal pair swings together (0 = body)
 *   hipY / footY        the span over which the swing ramps from 0 to full
 *   body                1 for the trunk/head (bob + pitch), 0 for legs
 */
function part(list, geo, { limb = 0, hipY = 0, footY = 0, body = 0 } = {}) {
  const p = geo.attributes.position;
  const arr = new Float32Array(p.count * 3);
  const span = Math.max(1e-3, hipY - footY);
  for (let i = 0; i < p.count; i++) {
    const depth = limb ? THREE.MathUtils.clamp((hipY - p.getY(i)) / span, 0, 1) : 0;
    arr[i * 3] = limb;
    arr[i * 3 + 1] = depth * depth;      // squared: the hoof travels, the hip does not
    arr[i * 3 + 2] = body;
  }
  geo.setAttribute('aAnim', new THREE.BufferAttribute(arr, 3));
  list.push(geo.index ? geo.toNonIndexed() : geo);
  return geo;
}

/** Four legs at the given (x, z) stations, alternating diagonals. */
function legs(list, stations, hipY, footY, r0, r1, color, rng) {
  for (let i = 0; i < stations.length; i++) {
    const [lx, lz, sign] = stations[i];
    const g = new THREE.CylinderGeometry(r1, r0, hipY - footY, 5);
    tint(g, color, 0.08, rng);
    g.applyMatrix4(composeMat(lx, (hipY + footY) / 2, lz));
    part(list, g, { limb: sign, hipY, footY });
    // hoof / paw
    const h = new THREE.SphereGeometry(r1 * 1.25, 6, 4);
    tint(h, '#2b241d', 0.1, rng);
    h.applyMatrix4(composeMat(lx, footY + r1 * 0.5, lz, 0, 0, 0, 1, 0.7, 1.3));
    part(list, h, { limb: sign, hipY, footY });
  }
}

function boarGeometry() {
  const rng = mulberry32(0xB0A2);
  const L = [];
  /**
   * `PALE` was `'#9a8straight'` — a mangled literal, not a colour. Three.js
   * cannot parse it, warns once to the console and leaves the Color at its
   * constructed WHITE, so the boar's belly, its saddle and the whole snout
   * rendered pure white: a bright blob in a valley of ochre that read as a
   * lighting bug rather than an animal. Nothing failed loudly, which is why it
   * survived — a warning is not an error and no gate samples an animal's pixels.
   */
  const HIDE = '#6d5a44', DARK = '#463829', TUSK = '#e0d7b8', PALE = '#a08b6f';
  /**
   * THE BODY IS A WEDGE THAT PEAKS AT THE SHOULDER, NOT A BARREL.
   *
   * The first pass scaled the sphere by 0.78→1.02 in x and 0.82→1.02 in y from
   * rear to front — a 24 % taper, which at 5 m reads as no taper at all. Worse,
   * it left the body 0.65 m long forward of centre while the head sat at
   * z = 0.66 with a 0.22 m radius, so the entire head, snout and tusks were
   * INSIDE the trunk. Shot from four metres with the player hidden, a boar was
   * a smooth brown balloon with four stubs and some black spikes: no head, no
   * profile, nothing an eye could name as an animal.
   *
   * Now the width peaks at f = 0.72 (the shoulder) and falls away on both
   * sides, so the trunk necks down into a head that is actually outside it.
   */
  const body = new THREE.SphereGeometry(0.40, 13, 10);
  const bp = body.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    const f = (z + 0.40) / 0.80;                          // 0 rear .. 1 front
    const wf = f < 0.72 ? 0.60 + f * 0.72 : 1.118 - (f - 0.72) * 1.45;
    const hf = f < 0.70 ? 0.68 + f * 0.52 : 1.044 - (f - 0.70) * 0.85;
    bp.setXYZ(i, x * wf, y * hf, z * 1.42);
  }
  // coarse hide: displace so it is not a balloon, and run a pale saddle down
  // the flanks so the wedge silhouette reads against grass at 30 m
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    const d = Math.sin(x * 9.1 + z * 7.3) * Math.cos(y * 8.2 - z * 5.1);
    bp.setXYZ(i, x + d * 0.02, y + d * 0.015, z + d * 0.02);
  }
  body.computeVertexNormals();
  {
    const arr = new Float32Array(bp.count * 3);
    const cH = new THREE.Color(HIDE), cD = new THREE.Color(DARK), cP = new THREE.Color(PALE);
    const c = new THREE.Color();
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i), z = bp.getZ(i);
      c.copy(cH).lerp(cD, THREE.MathUtils.clamp(y * 2.4 - 0.45, 0, 0.85));  // dark along the spine
      c.lerp(cP, THREE.MathUtils.clamp(-y * 2.1 - 0.15, 0, 0.6));          // pale belly
      c.lerp(cD, THREE.MathUtils.clamp(z * 1.1 - 0.05, 0, 0.4));           // dark shoulders
      const j = 0.92 + rng() * 0.16;
      arr[i * 3] = c.r * j; arr[i * 3 + 1] = c.g * j; arr[i * 3 + 2] = c.b * j;
    }
    body.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  body.applyMatrix4(composeMat(0, 0.55, 0.0));
  part(L, body, { body: 1 });
  // shoulder hump: the boar's one unmistakable line, forward and high
  const hump = new THREE.SphereGeometry(0.25, 10, 7);
  tint(hump, DARK, 0.1, rng);
  hump.applyMatrix4(composeMat(0, 0.80, 0.22, 0, 0, 0, 0.94, 0.66, 1.8));
  part(L, hump, { body: 1 });
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const b = new THREE.ConeGeometry(0.022, 0.17 + 0.09 * Math.sin(t * Math.PI), 4);
    tint(b, '#20190f', 0.15, rng);
    b.applyMatrix4(composeMat(0, 0.92 - t * 0.10, 0.44 - t * 0.92, -0.3 - t * 0.25, 0, 0));
    part(L, b, { body: 1 });
  }
  /**
   * Head, and the geometry that makes it visible. The trunk's front vertex now
   * sits at z = 0.40 * 1.42 = 0.568 with only 0.71 of its width, so a head
   * centred at 0.72 and stretched 1.45x along z spans 0.39-1.05: it OVERLAPS
   * the neck by 0.18 m and stands 0.48 m proud of it. The snout carries it on
   * to 1.33, which with the rump at -0.57 makes a 1.9 m boar — an adult sow.
   */
  const head = new THREE.SphereGeometry(0.23, 10, 8);
  tint(head, DARK, 0.08, rng);
  head.applyMatrix4(composeMat(0, 0.50, 0.72, 0.10, 0, 0, 0.86, 0.90, 1.45));
  part(L, head, { body: 1 });
  // the jowl that ties head to shoulder
  const jowl = new THREE.SphereGeometry(0.19, 8, 6);
  tint(jowl, HIDE, 0.09, rng);
  jowl.applyMatrix4(composeMat(0, 0.47, 0.50, 0, 0, 0, 1.02, 0.86, 1.0));
  part(L, jowl, { body: 1 });
  const snout = new THREE.CylinderGeometry(0.105, 0.145, 0.36, 9);
  snout.rotateX(Math.PI / 2);
  tint(snout, PALE, 0.07, rng);
  snout.applyMatrix4(composeMat(0, 0.435, 1.15, 0.07, 0, 0));
  part(L, snout, { body: 1 });
  const disc = new THREE.CylinderGeometry(0.108, 0.108, 0.035, 9);
  disc.rotateX(Math.PI / 2);
  tint(disc, '#2a2119', 0.06, rng);
  disc.applyMatrix4(composeMat(0, 0.425, 1.33, 0.07, 0, 0));
  part(L, disc, { body: 1 });
  for (const s2 of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.03, 6, 5);
    tint(eye, '#150f0a', 0.04, rng);
    eye.applyMatrix4(composeMat(s2 * 0.145, 0.585, 0.83));
    part(L, eye, { body: 1 });
  }
  for (const s of [-1, 1]) {
    const tusk = new THREE.ConeGeometry(0.032, 0.26, 5);
    tint(tusk, TUSK, 0.05, rng);
    tusk.applyMatrix4(composeMat(s * 0.105, 0.40, 1.22, -1.25, 0, -s * 0.5));
    part(L, tusk, { body: 1 });
    const ear = new THREE.ConeGeometry(0.08, 0.22, 5);
    tint(ear, DARK, 0.1, rng);
    ear.applyMatrix4(composeMat(s * 0.155, 0.70, 0.60, -0.24, 0, s * 0.66));
    part(L, ear, { body: 1 });
  }
  // tail
  const tail = new THREE.CylinderGeometry(0.018, 0.03, 0.24, 5);
  tint(tail, DARK, 0.1, rng);
  tail.applyMatrix4(composeMat(0, 0.62, -0.56, -0.55, 0, 0));
  part(L, tail, { body: 1 });
  legs(L, [[0.185, 0.32, 1], [-0.185, 0.32, -1], [0.165, -0.30, -1], [-0.165, -0.30, 1]],
    0.56, 0.0, 0.095, 0.062, '#4d3d2c', rng);
  return mergeGeometries(L, false);
}

function foxGeometry() {
  const rng = mulberry32(0xF0C5);
  const L = [];
  const COAT = '#bd5f2c', PALE = '#e6dac4', DARK = '#2b1f16';
  const body = new THREE.SphereGeometry(0.17, 11, 8);
  const bp = body.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    bp.setXYZ(i, x * 0.92, y * 0.92, z * 1.85);
  }
  body.computeVertexNormals();
  tint(body, COAT, 0.09, rng);
  body.applyMatrix4(composeMat(0, 0.36, 0));
  part(L, body, { body: 1 });
  const belly = new THREE.SphereGeometry(0.13, 9, 6);
  tint(belly, PALE, 0.08, rng);
  belly.applyMatrix4(composeMat(0, 0.28, 0.02, 0, 0, 0, 0.85, 0.55, 1.9));
  part(L, belly, { body: 1 });
  const head = new THREE.SphereGeometry(0.115, 9, 7);
  tint(head, COAT, 0.07, rng);
  head.applyMatrix4(composeMat(0, 0.44, 0.34, 0, 0, 0, 1, 0.95, 1.05));
  part(L, head, { body: 1 });
  const muzzle = new THREE.ConeGeometry(0.065, 0.2, 7);
  muzzle.rotateX(Math.PI / 2);
  tint(muzzle, PALE, 0.07, rng);
  muzzle.applyMatrix4(composeMat(0, 0.41, 0.47));
  part(L, muzzle, { body: 1 });
  const nose = new THREE.SphereGeometry(0.026, 6, 5);
  tint(nose, DARK, 0.05, rng);
  nose.applyMatrix4(composeMat(0, 0.41, 0.56));
  part(L, nose, { body: 1 });
  for (const s of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.062, 0.17, 5);
    tint(ear, DARK, 0.1, rng);
    ear.applyMatrix4(composeMat(s * 0.065, 0.58, 0.31, -0.08, 0, s * 0.22));
    part(L, ear, { body: 1 });
  }
  // brush tail — the fox's whole silhouette
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const seg = new THREE.SphereGeometry(0.085 - t * 0.018, 8, 6);
    tint(seg, i === 3 ? PALE : COAT, 0.09, rng);
    seg.applyMatrix4(composeMat(0, 0.34 - t * 0.05, -0.26 - t * 0.15, 0, 0, 0, 1, 1, 1.3));
    part(L, seg, { body: 1 });
  }
  // a bib of pale fur under the jaw — the fox's other reading cue at distance
  const bib = new THREE.SphereGeometry(0.075, 7, 5);
  tint(bib, PALE, 0.06, rng);
  bib.applyMatrix4(composeMat(0, 0.35, 0.26, 0, 0, 0, 1, 0.85, 0.7));
  part(L, bib, { body: 1 });
  legs(L, [[0.075, 0.15, 1], [-0.075, 0.15, -1], [0.07, -0.14, -1], [-0.07, -0.14, 1]],
    0.34, 0.0, 0.034, 0.024, '#7a4324', rng);
  return mergeGeometries(L, false);
}

function grouseGeometry() {
  const rng = mulberry32(0x6807);
  const L = [];
  const PLUME = '#8a6f42', DARK = '#4a3a22', RED = '#a8422c';
  const body = new THREE.SphereGeometry(0.16, 10, 8);
  const bp = body.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    bp.setXYZ(i, bp.getX(i) * 0.88, bp.getY(i) * 0.95, bp.getZ(i) * 1.25);
  }
  body.computeVertexNormals();
  {
    // barred plumage: light/dark courses across the back, pale breast
    const arr = new Float32Array(bp.count * 3);
    const cP = new THREE.Color(PLUME), cD = new THREE.Color(DARK);
    const cB = new THREE.Color('#c6b58c');
    const c = new THREE.Color();
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i), z = bp.getZ(i);
      const bar = Math.sin(z * 22 + y * 9) > 0 ? 1 : 0;
      c.copy(cP).lerp(cD, bar * 0.55);
      c.lerp(cB, THREE.MathUtils.clamp(-y * 3.2 - 0.1, 0, 0.7));
      const j = 0.92 + rng() * 0.16;
      arr[i * 3] = c.r * j; arr[i * 3 + 1] = c.g * j; arr[i * 3 + 2] = c.b * j;
    }
    body.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  body.applyMatrix4(composeMat(0, 0.24, 0));
  part(L, body, { body: 1 });
  // folded wings
  for (const s of [-1, 1]) {
    const w = new THREE.SphereGeometry(0.1, 7, 5);
    tint(w, DARK, 0.12, rng);
    w.applyMatrix4(composeMat(s * 0.12, 0.25, -0.02, 0, 0, s * 0.2, 0.42, 0.85, 1.5));
    part(L, w, { body: 1 });
  }
  const neck = new THREE.CylinderGeometry(0.045, 0.06, 0.14, 6);
  tint(neck, PLUME, 0.1, rng);
  neck.applyMatrix4(composeMat(0, 0.36, 0.11, -0.35, 0, 0));
  part(L, neck, { body: 1 });
  const head = new THREE.SphereGeometry(0.058, 7, 6);
  tint(head, DARK, 0.09, rng);
  head.applyMatrix4(composeMat(0, 0.43, 0.16));
  part(L, head, { body: 1 });
  const beak = new THREE.ConeGeometry(0.02, 0.06, 5);
  beak.rotateX(Math.PI / 2);
  tint(beak, '#c8b183', 0.06, rng);
  beak.applyMatrix4(composeMat(0, 0.42, 0.22));
  part(L, beak, { body: 1 });
  const comb = new THREE.SphereGeometry(0.022, 5, 4);
  tint(comb, RED, 0.1, rng);
  comb.applyMatrix4(composeMat(0.03, 0.47, 0.15, 0, 0, 0, 1, 0.7, 0.6));
  part(L, comb, { body: 1 });
  // fan tail
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.2;
    const f = new THREE.BoxGeometry(0.035, 0.012, 0.22);
    tint(f, i % 2 ? DARK : '#7d6440', 0.12, rng);
    f.applyMatrix4(composeMat(Math.sin(a) * 0.06, 0.27 + Math.abs(a) * 0.02, -0.18, -0.42, a, 0));
    part(L, f, { body: 1 });
  }
  legs(L, [[0.05, 0.01, 1], [-0.05, 0.01, -1]], 0.2, 0.0, 0.02, 0.015, '#b08a4c', rng);
  for (const s of [-1, 1]) {
    const foot = new THREE.BoxGeometry(0.05, 0.012, 0.07);
    tint(foot, '#8a6a3c', 0.1, rng);
    foot.applyMatrix4(composeMat(s * 0.05, 0.008, 0.03));
    part(L, foot, { limb: s, hipY: 0.2, footY: 0 });
  }
  return mergeGeometries(L, false);
}

/**
 * RIDGE GOAT. A short barrel on straight legs with a deep chest, a wedge head
 * and two swept horns. The horns are the whole point: a goat seen side-on at
 * 40 m is otherwise a pale boar, and this roster already has a pale boar.
 */
function goatGeometry() {
  const rng = mulberry32(0x60A7);
  const L = [];
  const COAT = '#b9ab90', DARK = '#4e4334', HORN = '#6a5b45', PALE = '#d8cfba';
  // barrel: widest at the chest, flat along the back
  const body = new THREE.SphereGeometry(0.30, 12, 9);
  const bp = body.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    const f = (z + 0.30) / 0.60;
    const wf = f < 0.66 ? 0.72 + f * 0.52 : 1.063 - (f - 0.66) * 0.72;
    bp.setXYZ(i, x * wf, y * (0.92 + (y > 0 ? -0.1 : 0.06)), z * 1.5);
  }
  body.computeVertexNormals();
  {
    const arr = new Float32Array(bp.count * 3);
    const cC = new THREE.Color(COAT), cD = new THREE.Color(DARK), cP = new THREE.Color(PALE);
    const c = new THREE.Color();
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i), z = bp.getZ(i);
      c.copy(cC).lerp(cD, THREE.MathUtils.clamp(y * 2.6 - 0.4, 0, 0.7));
      c.lerp(cP, THREE.MathUtils.clamp(-y * 2.4 - 0.1, 0, 0.55));
      c.lerp(cD, THREE.MathUtils.clamp(-z * 1.4 - 0.1, 0, 0.45));  // dark haunch
      const j = 0.93 + rng() * 0.14;
      arr[i * 3] = c.r * j; arr[i * 3 + 1] = c.g * j; arr[i * 3 + 2] = c.b * j;
    }
    body.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  body.applyMatrix4(composeMat(0, 0.66, 0));
  part(L, body, { body: 1 });
  // neck + wedge head, carried high
  const neck = new THREE.CylinderGeometry(0.11, 0.16, 0.3, 8);
  tint(neck, COAT, 0.08, rng);
  neck.applyMatrix4(composeMat(0, 0.86, 0.34, 0.75, 0, 0));
  part(L, neck, { body: 1 });
  const head = new THREE.SphereGeometry(0.135, 9, 7);
  tint(head, COAT, 0.07, rng);
  head.applyMatrix4(composeMat(0, 1.00, 0.49, 0, 0, 0, 0.9, 0.95, 1.35));
  part(L, head, { body: 1 });
  const muz = new THREE.ConeGeometry(0.072, 0.2, 7);
  muz.rotateX(Math.PI / 2);
  tint(muz, PALE, 0.07, rng);
  muz.applyMatrix4(composeMat(0, 0.96, 0.66));
  part(L, muz, { body: 1 });
  // horns: two swept arcs, five segments each
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const seg = new THREE.CylinderGeometry(0.038 - t * 0.024, 0.045 - t * 0.024, 0.13, 5);
      tint(seg, HORN, 0.1, rng);
      seg.applyMatrix4(composeMat(
        s * (0.055 + t * 0.055), 1.12 + t * 0.20, 0.40 - t * 0.24,
        -0.55 - t * 0.5, 0, s * (0.2 + t * 0.3)));
      part(L, seg, { body: 1 });
    }
    const ear = new THREE.ConeGeometry(0.05, 0.16, 5);
    tint(ear, DARK, 0.1, rng);
    ear.applyMatrix4(composeMat(s * 0.13, 1.03, 0.40, 0.1, 0, s * 1.2));
    part(L, ear, { body: 1 });
  }
  // beard + stub tail
  const beard = new THREE.ConeGeometry(0.05, 0.19, 6);
  tint(beard, DARK, 0.1, rng);
  beard.applyMatrix4(composeMat(0, 0.86, 0.56, Math.PI - 0.25, 0, 0));
  part(L, beard, { body: 1 });
  const tail = new THREE.ConeGeometry(0.05, 0.14, 5);
  tint(tail, PALE, 0.1, rng);
  tail.applyMatrix4(composeMat(0, 0.78, -0.42, -0.9, 0, 0));
  part(L, tail, { body: 1 });
  legs(L, [[0.135, 0.26, 1], [-0.135, 0.26, -1], [0.125, -0.24, -1], [-0.125, -0.24, 1]],
    0.62, 0.0, 0.05, 0.035, '#5d5140', rng);
  return mergeGeometries(L, false);
}

/**
 * SCRUB HARE. Small, so it is built to read as a SHAPE rather than a creature:
 * a crouched hump, a raised rump, two long ears and a white scut. Those four
 * silhouette cues are what make a 45 cm animal visible in ankle grass at 20 m.
 */
function hareGeometry() {
  const rng = mulberry32(0x4A8E);
  const L = [];
  const COAT = '#9c8560', DARK = '#4b3c28', PALE = '#e8e0cf';
  const body = new THREE.SphereGeometry(0.115, 10, 7);
  const bp = body.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    // rump high, shoulders low — the crouch that reads as "about to bolt"
    bp.setXYZ(i, x * 0.92, y * (1.0 - z * 0.9), z * 1.5);
  }
  body.computeVertexNormals();
  tint(body, COAT, 0.1, rng);
  body.applyMatrix4(composeMat(0, 0.19, 0));
  part(L, body, { body: 1 });
  const belly = new THREE.SphereGeometry(0.085, 8, 6);
  tint(belly, PALE, 0.08, rng);
  belly.applyMatrix4(composeMat(0, 0.145, 0.01, 0, 0, 0, 0.9, 0.5, 1.5));
  part(L, belly, { body: 1 });
  const head = new THREE.SphereGeometry(0.072, 8, 6);
  tint(head, COAT, 0.07, rng);
  head.applyMatrix4(composeMat(0, 0.24, 0.17, 0, 0, 0, 0.92, 0.95, 1.2));
  part(L, head, { body: 1 });
  const nose = new THREE.SphereGeometry(0.02, 5, 4);
  tint(nose, DARK, 0.06, rng);
  nose.applyMatrix4(composeMat(0, 0.225, 0.26));
  part(L, nose, { body: 1 });
  // the ears: 12 cm, laid back along the spine, black-tipped
  for (const s of [-1, 1]) {
    const ear = new THREE.CylinderGeometry(0.014, 0.026, 0.13, 5);
    tint(ear, COAT, 0.09, rng);
    ear.applyMatrix4(composeMat(s * 0.032, 0.315, 0.10, -0.5, 0, s * 0.16));
    part(L, ear, { body: 1 });
    const tip = new THREE.SphereGeometry(0.018, 5, 4);
    tint(tip, DARK, 0.08, rng);
    tip.applyMatrix4(composeMat(s * 0.042, 0.372, 0.135, 0, 0, 0, 1, 1.3, 0.8));
    part(L, tip, { body: 1 });
  }
  // white scut: the only part of a fleeing hare anyone ever sees
  const scut = new THREE.SphereGeometry(0.042, 6, 5);
  tint(scut, PALE, 0.05, rng);
  scut.applyMatrix4(composeMat(0, 0.215, -0.17, 0, 0, 0, 1, 1, 0.8));
  part(L, scut, { body: 1 });
  // long hind legs, short fore legs
  legs(L, [[0.055, -0.07, -1], [-0.055, -0.07, 1]], 0.20, 0.0, 0.032, 0.022, '#6c5a3c', rng);
  legs(L, [[0.045, 0.11, 1], [-0.045, 0.11, -1]], 0.145, 0.0, 0.022, 0.016, '#6c5a3c', rng);
  return mergeGeometries(L, false);
}

const BUILDERS = {
  boar: boarGeometry, fox: foxGeometry, grouse: grouseGeometry,
  goat: goatGeometry, hare: hareGeometry,
};

/* -------------------------------------------------------------------------- */
/*                                   FAUNA                                     */
/* -------------------------------------------------------------------------- */

export class Fauna {
  constructor(ctx) {
    this.ctx = ctx;
    this.rng = mulberry32(0xFA07);
    this.time = { value: 0 };
    this.group = new THREE.Group();
    this.group.name = 'world-fauna';
    /** @type {object[]} every animal, live and dead */
    this.animals = [];
    this.byId = new Map();
    this.pools = {};
    this._entries = [];
    this._arrowLast = new WeakMap();
    this._machineClock = 0;
    this.kills = 0;

    for (const key of Object.keys(SPECIES)) this._buildSpecies(key);
    ctx.scene.add(this.group);

    ctx.fauna = this;

    // Backstops for damage sources this module cannot sweep itself.
    ctx.events?.on?.('arrow-hit', (e) => {
      if (e?.machine || !e?.point) return;
      this.damageAt(e.point.x, e.point.y, e.point.z, 1.15, 999, { source: 'arrow' });
    });
    ctx.events?.on?.('melee-hit', (e) => {
      if (e?.machine || !e?.point) return;
      this.damageAt(e.point.x, e.point.y, e.point.z, 1.4, 999, { source: 'melee' });
    });
  }

  /* ------------------------------ construction -------------------------- */

  _buildSpecies(key) {
    const def = SPECIES[key];
    const geo = BUILDERS[key]();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.88, metalness: 0,
    });
    const time = this.time;
    const rate = def.strideRate;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFaunaT = time;
      shader.vertexShader = `
        attribute vec3 aAnim;
        attribute vec2 aInst;
        uniform float uFaunaT;
      ` + shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        {
          // aInst.x = stride phase, aInst.y = gait amplitude (0 = standing/dead)
          float sw = sin(uFaunaT * ${rate.toFixed(2)} * (0.55 + aInst.y) + aInst.x);
          float amp = aInst.y;
          // legs swing fore/aft about the hip, lifting on the forward half
          transformed.z += aAnim.x * aAnim.y * amp * 0.42 * sw;
          transformed.y += aAnim.y * amp * 0.13 * max(0.0, aAnim.x * sw);
          // trunk bobs at twice stride and pitches into the run
          transformed.y += aAnim.z * amp * 0.045 * sin(uFaunaT * ${(rate * 2).toFixed(2)} + aInst.x);
          transformed.y -= aAnim.z * transformed.z * amp * 0.12;
        }
      `);
    };

    const im = new THREE.InstancedMesh(geo, mat, def.count);
    im.name = `fauna-${key}`;
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;   // the herd spans the valley; one bound is useless
    // people and animals are not level geometry: keep them out of the static
    // collider seed and out of aim raycasts (fauna has its own hitscan)
    im.raycast = () => {};
    const inst = new Float32Array(def.count * 2);
    const attr = new THREE.InstancedBufferAttribute(inst, 2);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aInst', attr);
    this.group.add(im);
    this.pools[key] = { def, mesh: im, attr, inst };

    for (let i = 0; i < def.count; i++) this._spawn(key, i);
  }

  /** Place animal `i` of `key` at a fresh, valid home spot. */
  _spawn(key, i) {
    const def = SPECIES[key];
    const rng = this.rng;
    const home = def.homes[i % def.homes.length];
    let x = 0, z = 0, ok = false;
    // 18 tries that insist on open ground, then 14 that will take anything
    // standable — a home range that happens to sit under a stealth band still
    // gets its animals rather than stacking them all on the home point.
    for (let tries = 0; tries < 32 && !ok; tries++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * def.roam;
      x = home[0] + Math.cos(a) * d;
      z = home[1] + Math.sin(a) * d;
      ok = this._standable(x, z, tries < 18);
    }
    if (!ok) { x = home[0]; z = home[1]; }
    let an = this.animals.find((m) => m.key === key && m.slot === i);
    if (!an) {
      an = {
        id: `${key}-${i}`, key, slot: i, def,
        x, z, y: 0, heading: rng() * Math.PI * 2,
        hx: home[0], hz: home[1],
        state: GRAZE, timer: 1 + rng() * 3, speed: 0, gait: 0,
        hp: def.hp, alive: true, looted: false, respawn: 0,
        phase: rng() * Math.PI * 2, headBob: rng() * 6.28, entry: null, deadT: 0,
      };
      this.animals.push(an);
      this.byId.set(an.id, an);
    } else {
      an.x = x; an.z = z; an.hp = def.hp; an.alive = true; an.looted = false;
      an.state = GRAZE; an.timer = 1 + rng() * 3; an.speed = 0; an.gait = 0;
      an.deadT = 0; an.entry = null;
    }
    an.y = this.ctx.terrain.getHeight(x, z);
    this._writeInstance(an);
    return an;
  }

  /**
   * Flat enough, above water, inside the valley, and not inside the camp.
   *
   * `openOnly` additionally rejects the stealth-grass bands. It exists because
   * of what the animals looked like rather than how they behaved: measured on
   * port 5211, a boar stands 0.9 m at the bristle ridge and `world-ground`'s
   * tall grass is taller than that, so a herd grazing in a stealth band is a
   * herd nobody can see, hunt or loot — 36 animals rendering every frame for
   * no one. Grazers crop short sward in the open anyway, so the truthful
   * placement and the legible one are the same placement.
   */
  _standable(x, z, openOnly = false) {
    const T = this.ctx.terrain;
    if (x * x + z * z > 300 * 300) return false;
    const h = T.getHeight(x, z);
    const dh = Math.max(
      Math.abs(T.getHeight(x + 1.2, z) - h),
      Math.abs(T.getHeight(x, z + 1.2) - h));
    if (dh > 0.9) return false;
    const w = this.ctx.water?.levelAt?.(x, z);
    if (w !== null && w !== undefined && h < w + 0.15) return false;
    if (Math.hypot(x - 22, z - 30) < 26) return false;      // the settlement
    if (openOnly && T.tallGrassDensity && T.tallGrassDensity(x, z) > 0.3) return false;
    return true;
  }

  /* ------------------------------ published ----------------------------- */

  census() {
    const out = {};
    for (const a of this.animals) {
      const k = a.alive ? a.key : `${a.key}-dead`;
      out[k] = (out[k] ?? 0) + 1;
    }
    out.total = this.animals.length;
    out.kills = this.kills;
    return out;
  }

  /** Nearest LIVE animal to a point, or null. Allocation-free. */
  nearest(x, z, maxDist = 40) {
    let best = null, bd = maxDist * maxDist;
    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      if (!a.alive) continue;
      const d = (a.x - x) * (a.x - x) + (a.z - z) * (a.z - z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  /**
   * Segment/ray test against the live animals. `far` is the segment length.
   * Returns a SHARED record — copy anything you keep.
   */
  hitscan(ox, oy, oz, dx, dy, dz, far = 60) {
    const rec = this._hit ?? (this._hit = { hit: false, animal: null, distance: 0, x: 0, y: 0, z: 0 });
    rec.hit = false; rec.animal = null; rec.distance = Infinity;
    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      if (!a.alive) continue;
      const cx = a.x, cy = a.y + a.def.eye * 0.75, cz = a.z;
      const r = a.def.bodyR * 1.4;
      // closest approach of the segment to the body sphere
      const px = cx - ox, py = cy - oy, pz = cz - oz;
      let t = px * dx + py * dy + pz * dz;
      if (t < 0) t = 0; else if (t > far) t = far;
      const qx = ox + dx * t - cx, qy = oy + dy * t - cy, qz = oz + dz * t - cz;
      const d2 = qx * qx + qy * qy + qz * qz;
      if (d2 <= r * r && t < rec.distance) {
        rec.hit = true; rec.animal = a; rec.distance = t;
        rec.x = ox + dx * t; rec.y = oy + dy * t; rec.z = oz + dz * t;
      }
    }
    return rec.hit ? rec : null;
  }

  /** Damage whatever live animal is inside `radius` of the point. */
  damageAt(x, y, z, radius, amount, opts = {}) {
    let best = null, bd = radius * radius;
    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      if (!a.alive) continue;
      const cy = a.y + a.def.eye * 0.75;
      const d = (a.x - x) * (a.x - x) + (cy - y) * (cy - y) + (a.z - z) * (a.z - z);
      if (d < bd) { bd = d; best = a; }
    }
    if (!best) return null;
    this.damage(best, amount, opts);
    return best;
  }

  /** Apply damage. Anything that survives bolts; anything that dies drops loot. */
  damage(a, amount, opts = {}) {
    if (!a || !a.alive) return false;
    a.hp -= amount;
    if (a.hp > 0) {
      this._panic(a, opts.fromX ?? this.ctx.player?.position?.x ?? a.x,
        opts.fromZ ?? this.ctx.player?.position?.z ?? a.z);
      // the whole herd within 25 m breaks with it
      this._spookNear(a.x, a.z, 25, a.x, a.z);
      return false;
    }
    this._kill(a, opts);
    return true;
  }

  /* -------------------------------- death -------------------------------- */

  _kill(a, opts = {}) {
    a.alive = false;
    a.state = DEAD;
    a.gait = 0;
    a.speed = 0;
    a.deadT = 0;
    a.hp = 0;
    this.kills++;
    this._writeInstance(a);
    const ctx = this.ctx;
    const loot = a.def.loot.map((l) => ({ ...l }));
    ctx.events?.emit?.('fauna-killed', {
      species: a.key, name: a.def.name, id: a.id, x: a.x, y: a.y, z: a.z, loot, source: opts.source,
    });
    ctx.progression?.award?.({ xp: a.key === 'boar' || a.key === 'goat' ? 20 : 12, reason: 'hunt', id: a.key });
    // `audio` owns the bank; playAt() returns false for a set it does not have,
    // so this is a request for `fauna/<species>/death`, not a dependency on it.
    ctx.audio?.playAt?.(`fauna/${a.key}/death`, { x: a.x, y: a.y + 0.4, z: a.z },
      { volume: 0.55, category: 'sfx' });

    const I = ctx.interactables;
    if (I?.register) {
      a.entry = I.register({
        position: new THREE.Vector3(a.x, a.y + 0.4, a.z),
        radius: 2.2, hold: 0.5, label: 'SKIN', once: true,
        site: 'carcass', species: a.key, loot,
        onInteract: () => {
          a.looted = true;
          a.entry = null;
          ctx.events?.emit?.('fauna-looted', { species: a.key, id: a.id });
        },
      });
    }
    // spook the neighbours: a shot in the herd empties the meadow
    this._spookNear(a.x, a.z, 32, opts.fromX ?? a.x, opts.fromZ ?? a.z);
  }

  _spookNear(x, z, radius, fromX, fromZ) {
    const r2 = radius * radius;
    for (let i = 0; i < this.animals.length; i++) {
      const o = this.animals[i];
      if (!o.alive) continue;
      if ((o.x - x) * (o.x - x) + (o.z - z) * (o.z - z) > r2) continue;
      this._panic(o, fromX, fromZ);
    }
  }

  _panic(a, fromX, fromZ) {
    a.state = FLEE;
    a.timer = 3.2 + this.rng() * 3.0;
    const dx = a.x - fromX, dz = a.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    a.heading = Math.atan2(dx / len, dz / len);
  }

  /* -------------------------------- frame -------------------------------- */

  update(dt, t) {
    this.time.value = t;
    const ctx = this.ctx;
    const p = ctx.player?.position;
    if (!p) return;
    this._sweepArrows(dt);

    this._machineClock -= dt;
    let machines = null;
    if (this._machineClock <= 0) {
      this._machineClock = 0.4;
      machines = ctx.machines?.list ?? null;
    }

    const rng = this.rng;
    const terr = ctx.terrain;
    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      const def = a.def;

      if (!a.alive) {
        a.deadT += dt;
        // a skinned carcass fades out; the species restocks a minute later
        if (a.looted && a.deadT > 12) { a.respawn = (a.respawn || 0) + dt; }
        if (a.deadT > 150 || (a.looted && a.deadT > 26)) {
          if (a.entry) { ctx.interactables?.unregister?.(a.entry); a.entry = null; }
          this._spawn(a.key, a.slot);
          continue;
        }
        this._writeInstance(a);
        continue;
      }

      /* ---- threat scan ---- */
      const pdx = a.x - p.x, pdz = a.z - p.z;
      const pd = Math.hypot(pdx, pdz);
      let threatX = p.x, threatZ = p.z, threatD = pd;
      if (machines) {
        for (let k = 0; k < machines.length; k++) {
          const m = machines[k];
          if (!m || m.alive === false) continue;
          const d = Math.hypot(a.x - m.position.x, a.z - m.position.z);
          if (d < threatD) { threatD = d; threatX = m.position.x; threatZ = m.position.z; }
        }
        a.threatD = threatD; a.threatX = threatX; a.threatZ = threatZ;
      } else if (a.threatD !== undefined && a.threatD < pd) {
        threatD = a.threatD; threatX = a.threatX; threatZ = a.threatZ;
      }
      // crouching in tall grass halves the distance at which she is noticed
      const stealth = ctx.player?.crouching ? 0.55 : 1;

      a.timer -= dt;
      switch (a.state) {
        case GRAZE:
          a.speed += (0 - a.speed) * Math.min(1, dt * 4);
          if (threatD < def.alertR * stealth) { a.state = ALERT; a.timer = 0.7 + rng() * 0.8; }
          else if (a.timer <= 0) { a.state = WALK; a.timer = 2 + rng() * 3; a.heading = this._roamHeading(a); }
          break;
        case WALK:
          a.speed += (def.grazeSpeed - a.speed) * Math.min(1, dt * 3);
          if (threatD < def.alertR * stealth) { a.state = ALERT; a.timer = 0.6 + rng() * 0.7; }
          else if (a.timer <= 0) { a.state = GRAZE; a.timer = 3 + rng() * 5; }
          break;
        case ALERT: {
          a.speed += (0 - a.speed) * Math.min(1, dt * 8);
          // turn to face the threat: prey looks at what might eat it
          const want = Math.atan2(threatX - a.x, threatZ - a.z);
          a.heading = angleTo(a.heading, want, dt * 3.5);
          if (threatD < def.fleeR * stealth) {
            this._panic(a, threatX, threatZ);
            ctx.events?.emit?.('fauna-alerted', { species: a.key, id: a.id, x: a.x, z: a.z });
          } else if (a.timer <= 0 && threatD > def.alertR * stealth * 1.25) {
            a.state = GRAZE; a.timer = 3 + rng() * 4;
          }
          break;
        }
        case FLEE: {
          a.speed += (def.fleeSpeed - a.speed) * Math.min(1, dt * 5);
          // keep running away, but curve back toward home once clear
          const away = Math.atan2(a.x - threatX, a.z - threatZ);
          const home = Math.atan2(a.hx - a.x, a.hz - a.z);
          const far = Math.hypot(a.x - a.hx, a.z - a.hz);
          const want = far > def.roam * 3 ? home : away;
          a.heading = angleTo(a.heading, want, dt * 2.6);
          if (a.timer <= 0 && threatD > def.fleeR * 1.6) {
            a.state = WALK; a.timer = 2 + rng() * 2;
          }
          break;
        }
        default: break;
      }

      /* ---- move ---- */
      if (a.speed > 0.01) {
        const step = a.speed * dt;
        let nx = a.x + Math.sin(a.heading) * step;
        let nz = a.z + Math.cos(a.heading) * step;
        if (!this._standable(nx, nz)) {
          // bounce off the obstacle and try again next frame
          a.heading += (rng() - 0.5) * 1.6 + Math.PI * 0.35;
          nx = a.x; nz = a.z;
        }
        a.x = nx; a.z = nz;
      }
      a.y = terr.getHeight(a.x, a.z);
      // gait amplitude tracks speed so a standing animal's legs are still
      const target = a.speed / def.fleeSpeed;
      a.gait += (target - a.gait) * Math.min(1, dt * 6);
      this._writeInstance(a);
    }

    for (const key of Object.keys(this.pools)) {
      const pool = this.pools[key];
      pool.mesh.instanceMatrix.needsUpdate = true;
      pool.attr.needsUpdate = true;
    }
  }

  /**
   * A wander heading that prefers to stay inside the home range — and, inside
   * it, prefers open sward to the stealth-grass bands (see `_standable`).
   *
   * Three candidates are sampled and the one whose 7 m lookahead sits in the
   * least tall grass wins. This runs once per animal every 2-5 s when a graze
   * turns into a walk, never per frame, and allocates nothing.
   */
  _roamHeading(a) {
    const far = Math.hypot(a.x - a.hx, a.z - a.hz);
    if (far > a.def.roam) return Math.atan2(a.hx - a.x, a.hz - a.z) + (this.rng() - 0.5) * 0.8;
    const T = this.ctx.terrain;
    let best = a.heading + (this.rng() - 0.5) * 2.4;
    if (!T.tallGrassDensity) return best;
    let bestD = Infinity;
    for (let i = 0; i < 3; i++) {
      const h = a.heading + (this.rng() - 0.5) * 2.4;
      const d = T.tallGrassDensity(a.x + Math.sin(h) * 7, a.z + Math.cos(h) * 7);
      if (d < bestD) { bestD = d; best = h; }
    }
    return best;
  }

  /**
   * Read `ctx.combat.arrows.list` (never write it) and test each flying arrow's
   * segment for this frame against the live animals.
   */
  _sweepArrows(dt) {
    const list = this.ctx.combat?.arrows?.list;
    if (!list || !list.length) return;
    for (let i = 0; i < list.length; i++) {
      const ar = list[i];
      if (!ar || ar.mode !== 'fly' || !ar.pos || !ar.vel) continue;
      const sp = ar.vel.length();
      if (!(sp > 0.5)) continue;
      const len = Math.min(sp * dt * 1.35 + 0.6, 40);
      _seg.copy(ar.vel).multiplyScalar(1 / sp);
      const ox = ar.pos.x - _seg.x * len, oy = ar.pos.y - _seg.y * len, oz = ar.pos.z - _seg.z * len;
      const h = this.hitscan(ox, oy, oz, _seg.x, _seg.y, _seg.z, len);
      if (!h) continue;
      const a = h.animal;
      if (this._arrowLast.get(ar) === a) continue;   // one arrow, one animal
      this._arrowLast.set(ar, a);
      const px = this.ctx.player?.position;
      this.damage(a, 999, { source: 'arrow', fromX: px?.x ?? ox, fromZ: px?.z ?? oz });
    }
  }

  /* --------------------------- instance transform ------------------------ */

  /**
   * MEMORY RULE. One `InstancedMesh` + one geometry + one material per species,
   * plus whatever carcass interactables are live. All five species come back.
   */
  dispose() {
    const I = this.ctx.interactables;
    for (const a of this.animals) {
      if (a.entry) { I?.unregister?.(a.entry); a.entry = null; }
    }
    for (const key of Object.keys(this.pools)) {
      const pool = this.pools[key];
      if (!pool) continue;
      pool.mesh.geometry?.dispose?.();
      pool.mesh.material?.dispose?.();
      pool.mesh.dispose();
      this.group.remove(pool.mesh);
      delete this.pools[key];
    }
    if (this.group.parent) this.group.parent.remove(this.group);
    this.group.clear();
    this.animals.length = 0;
    this.byId.clear();
    if (this.ctx.fauna === this) this.ctx.fauna = null;
  }

  _writeInstance(a) {
    const pool = this.pools[a.key];
    if (!pool) return;
    if (a.alive) {
      _p.set(a.x, a.y, a.z);
      _e.set(0, a.heading, 0);
      _q.setFromEuler(_e);
      _s.set(1, 1, 1);
    } else {
      // rolled onto its side, settling into the grass over the first second
      const k = Math.min(1, a.deadT / 0.9);
      _p.set(a.x, a.y - 0.06 * k, a.z);
      _e.set(0, a.heading, (90 * DEG) * k);
      _q.setFromEuler(_e);
      const fade = a.looted ? Math.max(0, 1 - Math.max(0, a.deadT - 12) / 14) : 1;
      _s.set(fade, fade, fade);
    }
    _m.compose(_p, _q, _s);
    pool.mesh.setMatrixAt(a.slot, _m);
    pool.inst[a.slot * 2] = a.phase;
    pool.inst[a.slot * 2 + 1] = a.alive ? a.gait : 0;
  }
}

/** Rotate `from` toward `to` by at most `max` radians, wrapping correctly. */
function angleTo(from, to, max) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (d > max) d = max; else if (d < -max) d = -max;
  return from + d;
}

export { SPECIES };
