import * as THREE from 'three';
import { B } from './npcRig.js';

/**
 * NPC BODY BUILDER — lane `npc`.
 *
 * Generates ONE skinned `BufferGeometry` per NPC — body, face, hair, outfit and
 * carried gear in a single buffer — bound to the CC0 Quaternius Universal
 * Animation Library skeleton (see `npcRig.js`). Every vertex carries up to four
 * bone influences and a vertex colour, so a whole person is one draw call with
 * one shared-shape `MeshStandardMaterial`.
 *
 * WHY GENERATED AND NOT DOWNLOADED. Quaternius ships "Universal Base
 * Characters" on the same rig (CC0), which is what this lane wanted; its only
 * distribution channel is an interactive itch.io download flow, and an agent
 * must not pull binaries through one unattended. The audit's own fallback
 * applies (§ lane npc, deliverable 1): build the bodies here, on the UAL
 * skeleton, and record the tradeoff — `models-staging/npc/MANIFEST.md`.
 * The upside is real and not just a consolation: proportions, outfits, palette
 * and carried gear are parameters, so "more than one guy" is 13 genuinely
 * different silhouettes instead of 13 tints of one mesh, and the whole crowd
 * costs 13 draws.
 *
 * SPACE. Everything is authored in the skeleton's BIND space: +Y up, +Z
 * forward, metres, feet at y ≈ 0, arms out along ±X (T-pose), 1.75 m tall.
 * `bindMatrix` is identity (measured), so geometry in this space skins exactly.
 *
 * RIGID GEAR. A spear, torch or hammer is weighted 1.0 to the hand bone and
 * authored along ±X — the FOREARM axis at bind — so that when the arm hangs it
 * reads vertical in the hand, which is where a carried haft belongs. A bow,
 * quiver or pack is weighted to `DEF-spine.003`; a basket or belt pouch to the
 * pelvis. No extra objects, no per-frame parenting, no extra draws.
 */

const _v = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const _s = new THREE.Vector3();
const _u = new THREE.Vector3();
const _c = new THREE.Color();
const TAU = Math.PI * 2;

/* ========================================================================== */
/*  SKIN BUILDER                                                              */
/* ========================================================================== */

class SkinBuilder {
  /** @param {(name:string)=>number} idx bone name -> skeleton index */
  constructor(idx, rng) {
    this.idxOf = idx;
    this.rng = rng;
    this.pos = [];
    this.col = [];
    this.si = [];
    this.sw = [];
    this.tri = [];
    this._w = new Float32Array(4);
    this._i = new Uint16Array(4);
  }

  /** Resolve `[[boneName, weight], ...]` into a normalized 4-slot influence. */
  _weights(list) {
    const I = this._i, W = this._w;
    I[0] = I[1] = I[2] = I[3] = 0;
    W[0] = W[1] = W[2] = W[3] = 0;
    let n = 0, sum = 0;
    for (let k = 0; k < list.length && n < 4; k++) {
      const w = list[k][1];
      if (!(w > 1e-4)) continue;
      const bi = this.idxOf(list[k][0]);
      if (bi == null) continue;
      I[n] = bi; W[n] = w; sum += w; n++;
    }
    if (sum <= 1e-6) { I[0] = 0; W[0] = 1; sum = 1; }
    for (let k = 0; k < 4; k++) W[k] /= sum;
  }

  /** Push one vertex. `w` is a resolved influence (call `_weights` first). */
  _vert(x, y, z, color, jitter) {
    this.pos.push(x, y, z);
    const j = jitter ? 1 + (this.rng() - 0.5) * jitter : 1;
    this.col.push(color.r * j, color.g * j, color.b * j);
    this.si.push(this._i[0], this._i[1], this._i[2], this._i[3]);
    this.sw.push(this._w[0], this._w[1], this._w[2], this._w[3]);
    return (this.pos.length / 3) - 1;
  }

  quad(a, b, c, d) { this.tri.push(a, b, c, a, c, d); }

  /**
   * Loft a tube through `stations`.
   *
   * station = { p:[x,y,z], w, d, bones:[[name,weight],…], color, roll? }
   *   `w` is the half-extent along the ring's SIDE axis, `d` along its UP axis.
   *   For a vertical part (torso, leg) SIDE ≈ ∓X and UP ≈ +Z, i.e. `w` is
   *   half-width and `d` half-depth, which is what the profiles below assume.
   *
   * opts: { seg, a0, a1, closed, capStart, capEnd, jitter, ref }
   *   `a0`/`a1` cut a partial ring (a hood over the back of the head, a cloak),
   *   in radians, where a = π/2 faces +Z on a vertical part.
   */
  loft(stations, opts = {}) {
    const n = stations.length;
    if (n < 2) return;
    const seg = opts.seg ?? 10;
    const a0 = opts.a0 ?? 0;
    const a1 = opts.a1 ?? TAU;
    const closed = opts.closed ?? (a1 - a0 >= TAU - 1e-6);
    const jitter = opts.jitter ?? 0.05;
    const cols = closed ? seg : seg + 1;

    const P = [];
    for (let i = 0; i < n; i++) P.push(_v.fromArray(stations[i].p).clone());

    const rings = [];
    for (let i = 0; i < n; i++) {
      const pa = P[Math.max(0, i - 1)], pb = P[Math.min(n - 1, i + 1)];
      _t.subVectors(pb, pa);
      if (_t.lengthSq() < 1e-10) _t.set(0, 1, 0);
      _t.normalize();
      if (opts.ref) _u.fromArray(opts.ref);
      else if (Math.abs(_t.y) > 0.9) _u.set(0, 0, 1);
      else _u.set(0, 1, 0);
      _s.crossVectors(_u, _t);
      if (_s.lengthSq() < 1e-8) _s.set(1, 0, 0);
      _s.normalize();
      _b.crossVectors(_t, _s).normalize();

      const st = stations[i];
      const col = _c.set(st.color);
      const per = opts.bonesFor || null;
      if (!per) this._weights(st.bones);
      const ring = [];
      const roll = st.roll || 0;
      for (let j = 0; j < cols; j++) {
        const a = a0 + (a1 - a0) * (j / seg) + roll;
        // `bonesFor(angle, stationT, station)` gives PER-VERTEX influences —
        // a kilt panel has to follow the leg it hangs in front of, and a single
        // station-wide weight cannot say that (see the skirt in outfit()).
        if (per) this._weights(per(a, n > 1 ? i / (n - 1) : 0, st));
        const ca = Math.cos(a) * st.w, sa = Math.sin(a) * st.d;
        ring.push(this._vert(
          P[i].x + _s.x * ca + _b.x * sa,
          P[i].y + _s.y * ca + _b.y * sa,
          P[i].z + _s.z * ca + _b.z * sa,
          col, jitter,
        ));
      }
      rings.push(ring);
    }

    /**
     * WINDING. `(side, up2, t)` is right-handed (side x up2 = t) and the ring
     * advances along +up2, so the quad must run r0[j] -> r0[k] -> r1[k] ->
     * r1[j] for its face normal to come out along +side, i.e. OUTWARD. The
     * first cut wound the other way: every lofted surface in the crowd was
     * inside-out, `computeVertexNormals` dutifully pointed every normal into
     * the body, and with a FrontSide material the camera saw the far interior
     * of each shell — which is why thirteen fully dressed people filmed naked
     * and waxy. Measured before the fix: torso front vertex at z=+0.101 with
     * normal z=-0.97.
     */
    for (let i = 0; i < n - 1; i++) {
      const r0 = rings[i], r1 = rings[i + 1];
      for (let j = 0; j < seg; j++) {
        const k = (j + 1) % r0.length;
        this.quad(r0[j], r0[k], r1[k], r1[j]);
      }
    }

    if (opts.capStart) this._cap(stations[0], P[0], rings[0], true);
    if (opts.capEnd) this._cap(stations[n - 1], P[n - 1], rings[n - 1], false);
  }

  _cap(st, centre, ring, flip) {
    const col = _c.set(st.color);
    this._weights(st.bones);
    const c = this._vert(centre.x, centre.y, centre.z, col, 0.02);
    for (let j = 0; j < ring.length; j++) {
      const k = (j + 1) % ring.length;
      if (flip) this.tri.push(c, ring[k], ring[j]);
      else this.tri.push(c, ring[j], ring[k]);
    }
  }

  /**
   * A closed ellipsoid rigidly weighted to one influence set. `yaw`/`pitch`
   * tilt it; `squash` (0..1) flattens the lower half into a jaw or a heel.
   */
  ellipsoid(centre, radii, bones, color, opts = {}) {
    const su = opts.su ?? 10, sv = opts.sv ?? 7;
    const col = _c.set(color);
    this._weights(bones);
    const jitter = opts.jitter ?? 0.04;
    const yaw = opts.yaw || 0, pitch = opts.pitch || 0;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const grid = [];
    for (let v = 0; v <= sv; v++) {
      const phi = (v / sv) * Math.PI;
      const row = [];
      const rShape = opts.taper ? 1 - opts.taper * Math.max(0, (v / sv) - 0.5) * 2 : 1;
      for (let u = 0; u < su; u++) {
        const th = (u / su) * TAU;
        let x = Math.sin(phi) * Math.cos(th) * radii[0] * rShape;
        let y = Math.cos(phi) * radii[1];
        let z = Math.sin(phi) * Math.sin(th) * radii[2] * rShape;
        // pitch about X then yaw about Y
        let y2 = y * cp - z * sp, z2 = y * sp + z * cp;
        const x2 = x * cy + z2 * sy;
        z2 = -x * sy + z2 * cy;
        x = x2; y = y2; z = z2;
        row.push(this._vert(centre[0] + x, centre[1] + y, centre[2] + z, col, jitter));
      }
      grid.push(row);
    }
    // same outward-winding rule as loft(): v runs +Y -> -Y and u runs +X -> +Z
    for (let v = 0; v < sv; v++) {
      for (let u = 0; u < su; u++) {
        const u2 = (u + 1) % su;
        this.quad(grid[v][u], grid[v][u2], grid[v + 1][u2], grid[v + 1][u]);
      }
    }
  }

  /** An axis-aligned-ish slab, yawed about Y. */
  slab(centre, half, bones, color, yaw = 0) {
    const col = _c.set(color);
    this._weights(bones);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const v = [];
    for (let i = 0; i < 8; i++) {
      const sx = (i & 1) ? half[0] : -half[0];
      const sYy = (i & 2) ? half[1] : -half[1];
      const sz = (i & 4) ? half[2] : -half[2];
      v.push(this._vert(centre[0] + sx * cy + sz * sy, centre[1] + sYy, centre[2] - sx * sy + sz * cy, col, 0.03));
    }
    const F = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
    for (const f of F) this.quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]]);
  }

  /** Tapered tube between two points — the workhorse for hafts and limbs. */
  tube(a, b, r0, r1, bones, color, seg = 7, opts = {}) {
    this.loft([
      { p: a, w: r0, d: r0 * (opts.flat ?? 1), bones, color },
      { p: b, w: r1, d: r1 * (opts.flat ?? 1), bones, color },
    ], { seg, capStart: true, capEnd: true, jitter: opts.jitter ?? 0.04 });
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.tri.length > 65535 ? new THREE.Uint32BufferAttribute(this.tri, 1)
      : new THREE.Uint16BufferAttribute(this.tri, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    // skinned bounds: the bind pose is a T-pose, so the posed silhouette is
    // always narrower than this — a generous radius keeps a walking NPC from
    // being culled by its own bind bounds when it turns side-on to the camera.
    g.boundingSphere.center.set(0, 0.95, 0);
    g.boundingSphere.radius = 1.35;
    return g;
  }
}

/* ========================================================================== */
/*  VARIANTS — four+ distinct builds, each with its own outfit grammar         */
/* ========================================================================== */

/**
 * Body archetypes. `scale` is applied as a uniform group scale at spawn (so the
 * clips keep their proportions); everything else reshapes the mesh itself, so
 * two NPCs of different builds have genuinely different geometry, not the same
 * geometry at a different size — which is what `A95-npc-roster` measures.
 */
export const BODIES = {
  /** wiry hunter — narrow hips, long limbs */
  lean: { scale: 1.02, shoulder: 0.98, chest: 0.93, waist: 0.88, hip: 0.92, armR: 0.92, legR: 0.94, neck: 0.95, head: 0.97, belly: 0.0 },
  /** heavy smith — deep chest, thick arms */
  broad: { scale: 1.06, shoulder: 1.20, chest: 1.16, waist: 1.10, hip: 1.08, armR: 1.22, legR: 1.14, neck: 1.18, head: 1.02, belly: 0.012 },
  /** short and stocky */
  stocky: { scale: 0.93, shoulder: 1.10, chest: 1.10, waist: 1.14, hip: 1.12, armR: 1.10, legR: 1.10, neck: 1.08, head: 1.06, belly: 0.024 },
  /** slight build, narrow shoulders */
  slight: { scale: 0.95, shoulder: 0.86, chest: 0.88, waist: 0.86, hip: 0.98, armR: 0.84, legR: 0.88, neck: 0.90, head: 0.99, belly: 0.0 },
  /** tall and rangy */
  tall: { scale: 1.10, shoulder: 1.02, chest: 0.96, waist: 0.92, hip: 0.94, armR: 0.94, legR: 1.00, neck: 1.00, head: 0.94, belly: 0.0 },
  /** stooped elder — rounded back, thin limbs */
  elder: { scale: 0.96, shoulder: 0.92, chest: 0.94, waist: 1.02, hip: 1.00, armR: 0.86, legR: 0.90, neck: 0.94, head: 1.04, belly: 0.020, stoop: 0.055 },
};

/**
 * PALETTE. The first cut of this crowd read as thirteen naked mannequins on
 * film even though every outfit piece was there: skin, cloth and leather were
 * all mid-browns inside a 0.12 luminance band, so at 8 m the garments had no
 * edge to be seen by. Dyed cloth is now saturated and light, leather is dark,
 * fur is pale and skin sits between them — three separated value bands, which
 * is what makes a silhouette read without a texture.
 */
const SKIN = ['#dcb595', '#c69873', '#ab7d57', '#8e6244', '#e6c1a2', '#9a6c4c'];
const HAIR = ['#1d1310', '#3a2718', '#5a3d22', '#8b7048', '#c9c2b4', '#7a3218'];
const CLOTH = ['#4a6b58', '#2f5d6b', '#96502f', '#6b5a8c', '#b58a3a', '#3d4f66', '#7d2f2f', '#5b7a4a', '#a8763c'];
const LEATHER = ['#463020', '#2e2218', '#573d24', '#3a2c1e'];
const FUR = ['#cdbda2', '#9b8c74', '#e2d6bf', '#7e7260'];

/* ========================================================================== */
/*  BODY ASSEMBLY                                                             */
/* ========================================================================== */

/**
 * @param {import('./npcRig.js').NpcRigSource} rig
 * @param {object} V resolved variant (see `resolveVariant`)
 * @param {() => number} rng deterministic per-NPC rng
 */
export function buildNpcBody(rig, V, rng) {
  const idx = (n) => rig.idx(n);
  const S = new SkinBuilder(idx, rng);
  const P = V.p;   // proportions
  const C = V.c;   // colours

  torso(S, P, C, V);
  head(S, P, C, V);
  hair(S, P, C, V);
  for (const side of [1, -1]) {
    arm(S, P, C, V, side);
    leg(S, P, C, V, side);
  }
  outfit(S, P, C, V);
  gear(S, P, C, V);

  return S.build();
}

/* --------------------------------- torso ---------------------------------- */

/** Torso profile stations, reused by the tunic so the cloth follows the body. */
function torsoStations(P, C, V, grow = 0, colour = null) {
  const st = V.stoop || 0;
  const bend = (y) => -st * Math.max(0, (y - 1.0)) * 1.4;     // elder's rounded back
  const S = (y, w, d, z, bones) => ({
    p: [0, y, z + bend(y)], w: w + grow, d: d + grow, bones, color: colour || C.skin,
  });
  return [
    S(0.862, 0.118 * P.hip, 0.100 * P.hip, -0.030, [[B.hips, 1]]),
    S(0.917, 0.137 * P.hip, 0.108 * P.hip, -0.042, [[B.hips, 1]]),
    S(0.995, 0.126 * P.waist, 0.100 * P.waist + P.belly, -0.028, [[B.hips, 0.55], [B.spine1, 0.45]]),
    S(1.051, 0.122 * P.waist, 0.098 * P.waist + P.belly * 1.4, -0.016, [[B.spine1, 1]]),
    S(1.118, 0.130 * P.chest, 0.104 * P.chest + P.belly, -0.008, [[B.spine1, 0.5], [B.spine2, 0.5]]),
    S(1.174, 0.142 * P.chest, 0.111 * P.chest, 0.000, [[B.spine2, 1]]),
    S(1.252, 0.158 * P.chest, 0.117 * P.chest, -0.002, [[B.spine2, 0.45], [B.spine3, 0.55]]),
    S(1.315, 0.178 * P.shoulder, 0.116 * P.chest, -0.005, [[B.spine3, 1]]),
    S(1.400, 0.174 * P.shoulder, 0.106 * P.chest, -0.006, [[B.spine3, 1]]),
    S(1.452, 0.092 * P.neck, 0.080 * P.neck, 0.000, [[B.spine3, 0.7], [B.neck, 0.3]]),
    S(1.500, 0.055 * P.neck, 0.053 * P.neck, -0.006, [[B.neck, 1]]),
    S(1.548, 0.053 * P.neck, 0.051 * P.neck, 0.000, [[B.neck, 0.4], [B.head, 0.6]]),
  ];
}

function torso(S, P, C, V) {
  S.loft(torsoStations(P, C, V), { seg: 14, capStart: true, jitter: 0.05 });
}

/* ---------------------------------- head ----------------------------------- */

const HEAD_RINGS = [
  // y, halfWidth, halfDepth, zOffset
  [1.545, 0.052, 0.052, 0.004],
  [1.578, 0.068, 0.072, 0.012],
  [1.602, 0.078, 0.084, 0.014],
  [1.630, 0.085, 0.092, 0.008],
  [1.660, 0.088, 0.095, 0.002],
  [1.692, 0.085, 0.092, -0.003],
  [1.720, 0.074, 0.080, -0.008],
  [1.742, 0.050, 0.055, -0.010],
  [1.752, 0.016, 0.018, -0.011],
];

function headRing(P, V, i) {
  const r = HEAD_RINGS[i];
  const st = V.stoop || 0;
  return { y: r[0], w: r[1] * P.head, d: r[2] * P.head, z: r[3] - st * 0.9 };
}

function head(S, P, C, V) {
  const sts = HEAD_RINGS.map((r, i) => {
    const h = headRing(P, V, i);
    return { p: [0, h.y, h.z], w: h.w, d: h.d, bones: [[B.head, 1]], color: C.skin };
  });
  S.loft(sts, { seg: 12, capEnd: true, jitter: 0.035 });

  const hs = P.head;
  const zf = (y) => {  // front surface z at a head height, for face placement
    let best = HEAD_RINGS[0];
    for (const r of HEAD_RINGS) if (Math.abs(r[0] - y) < Math.abs(best[0] - y)) best = r;
    return best[2] * hs + best[3] - (V.stoop || 0) * 0.9;
  };

  // brow ridge + eyebrows
  for (const s of [1, -1]) {
    S.ellipsoid([s * 0.032 * hs, 1.690, zf(1.690) - 0.014], [0.026 * hs, 0.008, 0.016],
      [[B.head, 1]], C.hair, { su: 7, sv: 4, jitter: 0.06 });
    // sclera then iris, both proud of the socket so they read at 3 m
    S.ellipsoid([s * 0.033 * hs, 1.672, zf(1.672) - 0.010], [0.014, 0.013, 0.012],
      [[B.head, 1]], '#ddd6c8', { su: 8, sv: 5, jitter: 0.015 });
    S.ellipsoid([s * 0.033 * hs, 1.671, zf(1.672) - 0.002], [0.0075, 0.0075, 0.007],
      [[B.head, 1]], C.eye, { su: 7, sv: 4, jitter: 0.01 });
    // ear
    S.ellipsoid([s * (HEAD_RINGS[4][1] * hs - 0.004), 1.664, -0.006], [0.010, 0.023, 0.016],
      [[B.head, 1]], C.skin, { su: 6, sv: 5, jitter: 0.04 });
  }
  // nose
  S.ellipsoid([0, 1.650, zf(1.650) - 0.004], [0.016, 0.024, 0.021], [[B.head, 1]], C.skin,
    { su: 7, sv: 5, jitter: 0.03 });
  // mouth
  S.slab([0, 1.618, zf(1.618) - 0.004], [0.019, 0.0045, 0.010], [[B.head, 1]], C.mouth);

  if (V.beard) {
    S.ellipsoid([0, 1.601, zf(1.601) - 0.028], [0.060 * hs, 0.050, 0.055 * hs],
      [[B.head, 1]], C.hair, { su: 10, sv: 6, jitter: 0.07, taper: 0.35 });
    S.slab([0, 1.633, zf(1.633) - 0.006], [0.024, 0.006, 0.012], [[B.head, 1]], C.hair);
  }
}

/* ---------------------------------- hair ----------------------------------- */

function hair(S, P, C, V) {
  const hs = P.head;
  const style = V.hairStyle;
  if (style === 'bald') {
    if (V.headband) {
      const rings = [4, 5].map((i) => {
        const h = headRing(P, V, i);
        return { p: [0, h.y, h.z], w: h.w + 0.010, d: h.d + 0.010, bones: [[B.head, 1]], color: C.cloth2 };
      });
      S.loft(rings, { seg: 12, jitter: 0.03 });
    }
    return;
  }

  // the cap: a shell over the crown, pushed back so a forehead is visible
  const capFrom = style === 'short' ? 4 : 3;
  const thick = style === 'short' ? 0.009 : 0.016;
  const capSts = [];
  for (let i = capFrom; i < HEAD_RINGS.length; i++) {
    const h = headRing(P, V, i);
    const shave = style === 'topknot' ? 0.6 : 1;
    capSts.push({
      p: [0, h.y, h.z - 0.012],
      w: h.w * shave + thick, d: h.d + thick,
      bones: [[B.head, 1]], color: C.hair,
    });
  }
  S.loft(capSts, { seg: 12, capEnd: true, jitter: 0.07 });

  if (style === 'long') {
    S.loft([
      { p: [0, 1.712, -0.070], w: 0.070 * hs, d: 0.050, bones: [[B.head, 1]], color: C.hair },
      { p: [0, 1.630, -0.088], w: 0.078 * hs, d: 0.055, bones: [[B.head, 1]], color: C.hair },
      { p: [0, 1.530, -0.092], w: 0.072 * hs, d: 0.050, bones: [[B.head, 1]], color: C.hair },
      { p: [0, 1.440, -0.084], w: 0.058 * hs, d: 0.040, bones: [[B.head, 1]], color: C.hair },
      { p: [0, 1.386, -0.074], w: 0.030 * hs, d: 0.022, bones: [[B.head, 1]], color: C.hair },
    ], { seg: 9, a0: Math.PI * 0.55, a1: Math.PI * 1.45, capStart: false, jitter: 0.09 });
  } else if (style === 'braid') {
    const pts = [[0, 1.700, -0.078], [0.012, 1.610, -0.100], [-0.010, 1.520, -0.106],
      [0.010, 1.432, -0.098], [0, 1.360, -0.082]];
    for (let i = 0; i < pts.length - 1; i++) {
      S.tube(pts[i], pts[i + 1], 0.030 - i * 0.004, 0.028 - i * 0.004,
        [[B.head, 1]], C.hair, 7, { jitter: 0.09 });
    }
  } else if (style === 'bun') {
    S.ellipsoid([0, 1.716, -0.094], [0.048, 0.044, 0.044], [[B.head, 1]], C.hair,
      { su: 9, sv: 6, jitter: 0.1 });
  } else if (style === 'topknot') {
    S.tube([0, 1.744, -0.014], [0.004, 1.812, -0.052], 0.024, 0.018, [[B.head, 1]], C.hair, 7, { jitter: 0.1 });
    S.ellipsoid([0.006, 1.826, -0.060], [0.028, 0.030, 0.026], [[B.head, 1]], C.hair, { su: 8, sv: 5, jitter: 0.1 });
  }

  if (V.feather) {
    S.slab([0.052 * hs, 1.782, -0.056], [0.006, 0.048, 0.016], [[B.head, 1]], C.accent, 0.35);
  }
}

/* ----------------------------------- arm ----------------------------------- */

function armStations(P, side, bones0, grow, color, from = 0) {
  const s = side;
  const r = (v) => v * P.armR + grow;
  const A = [
    { x: 0.118, y: 1.446, z: -0.050, w: 0.066, bones: bones0.shoulderMix },
    { x: 0.205, y: 1.442, z: -0.062, w: 0.060, bones: bones0.upper },
    { x: 0.330, y: 1.441, z: -0.066, w: 0.052, bones: bones0.upper },
    { x: 0.435, y: 1.441, z: -0.068, w: 0.046, bones: bones0.upperFore },
    { x: 0.466, y: 1.441, z: -0.070, w: 0.047, bones: bones0.elbow },
    { x: 0.520, y: 1.441, z: -0.070, w: 0.048, bones: bones0.foreUpper },
    { x: 0.620, y: 1.441, z: -0.068, w: 0.042, bones: bones0.fore },
    { x: 0.712, y: 1.441, z: -0.066, w: 0.033, bones: bones0.foreHand },
    /**
     * THE WRIST STATION (fix round 1).
     *
     * The arm loft used to END at x = 0.712 with radius 0.034*armR and no end
     * cap, while the hand ellipsoid started at x = 0.730 — an unbridged,
     * uncapped 18 mm hole at every wrist, on every build, in every pose, which
     * filmed as a pale hand floating clear of the bracer with daylight through
     * the gap (measured 12.7-25.9 mm across six NPCs and six clips). This
     * station carries the tube INTO the hand mass — it is forearm-dominant at
     * x = 0.742, past the hand ellipsoid's own back pole on every build — so
     * the two surfaces interpenetrate instead of facing each other across a
     * gap, and the loft is capped as well so no opening can survive a weight
     * change. `V41-npc-closeup` measures both terms.
     */
    { x: 0.742, y: 1.440, z: -0.064, w: 0.029, bones: bones0.wrist },
  ];
  return A.slice(from).map((a) => ({
    p: [s * a.x, a.y, a.z], w: r(a.w), d: r(a.w) * 0.93, bones: a.bones, color,
  }));
}

function armBones(side) {
  const L = side > 0;
  const sh = L ? B.shoulderL : B.shoulderR;
  const up = L ? B.upperArmL : B.upperArmR;
  const fo = L ? B.forearmL : B.forearmR;
  const ha = L ? B.handL : B.handR;
  return {
    sh, up, fo, ha,
    shoulderMix: [[sh, 0.45], [up, 0.55]],
    upper: [[up, 1]],
    upperFore: [[up, 0.8], [fo, 0.2]],
    elbow: [[up, 0.5], [fo, 0.5]],
    foreUpper: [[fo, 0.85], [up, 0.15]],
    fore: [[fo, 1]],
    foreHand: [[fo, 0.6], [ha, 0.4]],
    // still forearm-DOMINANT, so this ring counts as forearm surface in the
    // wrist-continuity measurement while deforming almost entirely with the hand
    wrist: [[fo, 0.52], [ha, 0.48]],
    hand: [[ha, 1]],
  };
}

function arm(S, P, C, V, side) {
  const bn = armBones(side);
  S.loft(armStations(P, side, bn, 0, C.skin), { seg: 9, capStart: true, capEnd: true, jitter: 0.045 });
  // deltoid: a flattened cap that MEETS the trapezius, not a ball beside it —
  // the first cut sat 4 cm proud of a narrow chest and filmed as a pauldron
  S.ellipsoid([side * 0.172, 1.436, -0.038], [0.066 * P.armR, 0.050 * P.shoulder, 0.074 * P.armR],
    [[bn.sh, 0.45], [bn.up, 0.55]], C.skin, { su: 9, sv: 6, jitter: 0.04, pitch: -0.10 });
  /**
   * HAND + THUMB. The radii were bare literals while every other limb station
   * scales with `P.armR` (0.84 on the slight build, 1.22 on the broad), so the
   * wrist mismatch grew with the build — a 1.22 forearm met a 1.00 hand. They
   * scale now, and the hand is slightly longer so its back pole sits at
   * 0.778 - 0.058*armR = 0.707..0.729, i.e. always INSIDE the 0.742 wrist ring.
   */
  const hr = P.armR;
  S.ellipsoid([side * 0.778, 1.439, -0.062], [0.058 * hr, 0.030 * hr, 0.046 * hr],
    [[bn.ha, 1]], C.skin, { su: 8, sv: 5, jitter: 0.04 });
  S.ellipsoid([side * 0.768, 1.424, -0.030], [0.024 * hr, 0.018 * hr, 0.018 * hr],
    [[bn.ha, 1]], C.skin, { su: 6, sv: 4, jitter: 0.04 });
}

/* ----------------------------------- leg ----------------------------------- */

function legBones(side) {
  const L = side > 0;
  const th = L ? B.thighL : B.thighR;
  const sh = L ? B.shinL : B.shinR;
  const fo = L ? B.footL : B.footR;
  const to = L ? B.toeL : B.toeR;
  return { th, sh, fo, to };
}

function legStations(P, side, bn, grow, color, yMax = 1e9) {
  const x = side * 0.089;
  const r = (v) => v * P.legR + grow;
  const A = [
    { y: 0.948, z: 0.000, w: 0.078, bones: [[B.hips, 0.45], [bn.th, 0.55]] },
    { y: 0.860, z: 0.002, w: 0.082, bones: [[bn.th, 1]] },
    { y: 0.720, z: 0.004, w: 0.077, bones: [[bn.th, 1]] },
    { y: 0.600, z: 0.002, w: 0.066, bones: [[bn.th, 0.8], [bn.sh, 0.2]] },
    { y: 0.532, z: -0.001, w: 0.060, bones: [[bn.th, 0.5], [bn.sh, 0.5]] },
    { y: 0.470, z: -0.005, w: 0.062, bones: [[bn.sh, 0.85], [bn.th, 0.15]] },
    { y: 0.320, z: -0.016, w: 0.055, bones: [[bn.sh, 1]] },
    { y: 0.190, z: -0.029, w: 0.042, bones: [[bn.sh, 1]] },
    { y: 0.118, z: -0.034, w: 0.038, bones: [[bn.sh, 0.6], [bn.fo, 0.4]] },
  ];
  return A.filter((a) => a.y <= yMax).map((a) => ({
    p: [x, a.y, a.z], w: r(a.w), d: r(a.w) * 0.94, bones: a.bones, color,
  }));
}

function leg(S, P, C, V, side) {
  const bn = legBones(side);
  S.loft(legStations(P, side, bn, 0, C.skin), { seg: 9, capStart: true, jitter: 0.045 });
  foot(S, P, C, V, side, bn, 0, C.skin);
}

function foot(S, P, C, V, side, bn, grow, color) {
  const x = side * 0.089;
  S.loft([
    { p: [x, 0.100, -0.056], w: 0.046 + grow, d: 0.044 + grow, bones: [[bn.fo, 1]], color },
    { p: [x, 0.060, 0.004], w: 0.054 + grow, d: 0.050 + grow, bones: [[bn.fo, 1]], color },
    { p: [x, 0.038, 0.076], w: 0.054 + grow, d: 0.038 + grow, bones: [[bn.fo, 0.55], [bn.to, 0.45]], color },
    { p: [x, 0.024, 0.134], w: 0.042 + grow, d: 0.026 + grow, bones: [[bn.to, 1]], color },
  ], { seg: 8, capStart: true, capEnd: true, jitter: 0.04 });
  S.ellipsoid([x, 0.056, -0.058], [0.044 + grow, 0.050 + grow, 0.046 + grow],
    [[bn.fo, 1]], color, { su: 8, sv: 5, jitter: 0.04 });
}

/* ---------------------------------- outfit --------------------------------- */

function outfit(S, P, C, V) {
  const O = V.outfit;

  if (O.tunic) {
    // The shirt follows the torso profile, grown outward: cloth over a body,
    // not a second cylinder beside it. 3.4 cm, not 2 — at 2 cm the garment had
    // no readable edge at gameplay distance and the whole crowd filmed naked.
    const sts = torsoStations(P, C, V, 0.034, C.cloth1)
      .filter((q) => q.p[1] >= 0.96 && q.p[1] <= 1.430);
    // a flared hem and a shoulder yoke: both ends of a garment need a lip or it
    // reads as paint on the body
    sts.unshift({ ...sts[0], p: [0, sts[0].p[1] - 0.040, sts[0].p[2]], w: sts[0].w * 1.04, d: sts[0].d * 1.04 });
    const top = sts[sts.length - 1];
    sts[sts.length - 1] = { ...top, w: top.w * 1.05, d: top.d * 1.05, color: C.cloth2 };
    S.loft(sts, { seg: 14, capStart: false, jitter: 0.07 });
    // collar / neckline in the second dye
    S.loft([
      { p: [0, 1.418, -0.006], w: 0.116 * P.shoulder, d: 0.096 * P.chest, bones: [[B.spine3, 1]], color: C.cloth2 },
      { p: [0, 1.462, -0.002], w: 0.092 * P.neck, d: 0.084 * P.neck, bones: [[B.spine3, 0.7], [B.neck, 0.3]], color: C.cloth2 },
    ], { seg: 13, jitter: 0.05 });
  }

  if (O.skirt) {
    const hipW = 0.152 * P.hip + 0.078;
    const hem = O.skirtLong ? 0.480 : 0.615;
    /**
     * A KILT IS TWO PANELS, NOT A BARREL. Weighted rigidly to the pelvis the
     * skirt cannot move with the legs, so a stance with the feet apart — never
     * mind a walk cycle — drives a thigh straight out through the side of it
     * (filmed: a clean vertical strip of bare leg down the whole right panel).
     * Each vertex is blended toward the leg it hangs in FRONT of, by how far
     * down the skirt it is and how far off the centre line, so the cloth swings
     * with the stride and closes over the gap.
     */
    const bonesFor = (a, t) => {
      const xs = -Math.cos(a);                 // >0 on the character's left
      const k = Math.min(1, Math.abs(xs)) * t * t * 0.42;
      const leg = xs >= 0 ? B.thighL : B.thighR;
      return [[B.hips, 1 - k], [leg, k]];
    };
    S.loft([
      { p: [0, 0.988, -0.038], w: hipW * 0.98, d: hipW * 0.84, bones: [[B.hips, 1]], color: C.leather },
      { p: [0, 0.900, -0.030], w: hipW * 1.06, d: hipW * 0.92, bones: [[B.hips, 1]], color: C.leather },
      { p: [0, 0.780, -0.020], w: hipW * 1.18, d: hipW * 1.02, bones: [[B.hips, 1]], color: C.leather },
      { p: [0, hem + 0.055, -0.012], w: hipW * 1.26, d: hipW * 1.10, bones: [[B.hips, 1]], color: C.leather },
      { p: [0, hem, -0.010], w: hipW * 1.30, d: hipW * 1.14, bones: [[B.hips, 1]], color: C.leather2 },
    ], { seg: 16, jitter: 0.08, bonesFor, capStart: true });
  }

  if (O.legWraps) {
    // hide-and-cord wraps from below the knee to the boot: the lower leg is the
    // part a crowd shot sees most and a bare shin reads as a stick
    for (const s of [1, -1]) {
      const bn = legBones(s);
      const legs = legStations(P, s, bn, 0.013, C.leather)
        .filter((q) => q.p[1] <= 0.500 && q.p[1] >= 0.110);
      if (legs.length > 1) S.loft(legs, { seg: 9, jitter: 0.08 });
      const x = s * 0.089;
      for (const y of [0.470, 0.330, 0.200]) {
        S.loft([
          { p: [x, y - 0.012, -0.010], w: 0.070, d: 0.066, bones: [[bn.sh, 1]], color: C.accent },
          { p: [x, y + 0.012, -0.010], w: 0.070, d: 0.066, bones: [[bn.sh, 1]], color: C.accent },
        ], { seg: 9, jitter: 0.05 });
      }
    }
  }

  if (O.belt) {
    const bw = 0.140 * P.waist + 0.032;
    S.loft([
      { p: [0, 0.972, -0.034], w: bw, d: bw * 0.80, bones: [[B.hips, 1]], color: C.leather2 },
      { p: [0, 1.012, -0.028], w: bw, d: bw * 0.80, bones: [[B.hips, 0.6], [B.spine1, 0.4]], color: C.leather2 },
    ], { seg: 14, jitter: 0.04 });
    // bronze, and small: a light-grey slab at 0.028 half-width filmed as a
    // white card pasted on the torso from 8 m out
    S.slab([0, 0.992, 0.086 * P.waist + 0.036], [0.020, 0.018, 0.010], [[B.hips, 1]], C.buckle);
    // belt pouch
    S.ellipsoid([-0.108 * P.hip, 0.948, 0.012], [0.038, 0.046, 0.030], [[B.hips, 1]], C.leather,
      { su: 8, sv: 5, jitter: 0.05 });
  }

  if (O.harness) {
    // a leather chest wrap over the tunic: one more hard value edge across the
    // torso, which is what stops a lit body from reading as one soft cylinder
    const w = 0.142 * P.chest + 0.046;
    S.loft([
      { p: [0, 1.146, -0.004], w, d: w * 0.80, bones: [[B.spine1, 0.4], [B.spine2, 0.6]], color: C.leather2 },
      { p: [0, 1.232, -0.004], w: w * 1.03, d: w * 0.82, bones: [[B.spine2, 1]], color: C.leather2 },
      { p: [0, 1.248, -0.004], w: w * 0.99, d: w * 0.79, bones: [[B.spine2, 1]], color: C.leather },
    ], { seg: 14, jitter: 0.05 });
  }

  if (O.ruff) {   // fur collar
    S.loft([
      { p: [0, 1.400, -0.008], w: 0.150 * P.shoulder, d: 0.110 * P.chest, bones: [[B.spine3, 1]], color: C.fur },
      { p: [0, 1.452, -0.004], w: 0.128 * P.shoulder, d: 0.104 * P.chest, bones: [[B.spine3, 1]], color: C.fur },
      { p: [0, 1.492, 0.000], w: 0.098 * P.neck, d: 0.090 * P.neck, bones: [[B.spine3, 0.6], [B.neck, 0.4]], color: C.fur },
    ], { seg: 13, jitter: 0.14 });
  }

  if (O.hood) {
    const sts = [];
    for (let i = 2; i < HEAD_RINGS.length - 1; i++) {
      const h = headRing(P, V, i);
      sts.push({ p: [0, h.y, h.z - 0.016], w: h.w + 0.032, d: h.d + 0.032, bones: [[B.head, 1]], color: C.cloth2 });
    }
    sts.unshift({ p: [0, 1.500, -0.020], w: 0.098 * P.neck, d: 0.094 * P.neck, bones: [[B.head, 0.5], [B.neck, 0.5]], color: C.cloth2 });
    // open over the face: the ring runs from 130 deg round the back to 410 deg
    S.loft(sts, { seg: 11, a0: Math.PI * 0.72, a1: Math.PI * 2.28, jitter: 0.06 });
  }

  if (O.cloak) {
    const sts = [
      { p: [0, 1.430, -0.012], w: 0.172 * P.shoulder, d: 0.124 * P.chest, bones: [[B.spine3, 1]], color: C.cloth2 },
      { p: [0, 1.280, -0.018], w: 0.190 * P.shoulder, d: 0.140 * P.chest, bones: [[B.spine3, 1]], color: C.cloth2 },
      { p: [0, 1.100, -0.026], w: 0.206 * P.shoulder, d: 0.156 * P.chest, bones: [[B.spine3, 1]], color: C.cloth2 },
      { p: [0, 0.900, -0.034], w: 0.214 * P.shoulder, d: 0.166 * P.chest, bones: [[B.spine3, 1]], color: C.cloth2 },
      { p: [0, 0.720, -0.040], w: 0.212 * P.shoulder, d: 0.164 * P.chest, bones: [[B.spine3, 1]], color: C.cloth2 },
    ];
    S.loft(sts, { seg: 11, a0: Math.PI * 0.86, a1: Math.PI * 2.14, jitter: 0.07 });
  }

  if (O.pauldron) {
    const s = O.pauldron === 'left' ? 1 : -1;
    const bn = armBones(s);
    S.ellipsoid([s * 0.156, 1.470, -0.028], [0.080 * P.armR, 0.052, 0.086 * P.armR],
      [[bn.sh, 0.4], [bn.up, 0.6]], C.leather, { su: 9, sv: 5, jitter: 0.06 });
    S.ellipsoid([s * 0.196, 1.438, -0.030], [0.058 * P.armR, 0.034, 0.070 * P.armR],
      [[bn.up, 1]], C.leather2, { su: 8, sv: 4, jitter: 0.06 });
  }

  if (O.sleeves) {
    for (const s of [1, -1]) {
      const bn = armBones(s);
      const sl = armStations(P, s, bn, 0.017, C.cloth1).slice(0, O.sleevesLong ? 5 : 3);
      const last = sl[sl.length - 1];
      sl.push({ ...last, p: [last.p[0] + s * 0.012, last.p[1], last.p[2]], w: last.w * 1.12, d: last.d * 1.12, color: C.cloth2 });
      S.loft(sl, { seg: 9, jitter: 0.07 });
    }
  }

  if (O.wraps) {
    for (const s of [1, -1]) {
      const bn = armBones(s);
      // slice off the wrist station: a bracer belongs on the forearm, and
      // growing it over the new ring would sleeve the hand
      S.loft(armStations(P, s, bn, 0.011, C.leather, 5).slice(0, -1), { seg: 9, jitter: 0.06 });
      // a cord at the cuff
      const a = armStations(P, s, bn, 0.015, C.accent, 7)[0];
      S.loft([
        { ...a, p: [a.p[0] - s * 0.012, a.p[1], a.p[2]] },
        { ...a, p: [a.p[0] + s * 0.012, a.p[1], a.p[2]] },
      ], { seg: 9, jitter: 0.05 });
    }
  }

  if (O.boots) {
    for (const s of [1, -1]) {
      const bn = legBones(s);
      foot(S, P, C, V, s, bn, 0.011, C.leather);
      const legs = legStations(P, s, bn, 0.011, C.leather).filter((q) => q.p[1] <= (O.bootsHigh ? 0.50 : 0.26));
      if (legs.length > 1) S.loft(legs, { seg: 9, jitter: 0.06 });
    }
  }

  if (O.sash) {
    /**
     * A BANDOLIER, NOT A PLANK. The first cut lofted a wide ellipse along a
     * diagonal line through the chest; the loft frame put that ellipse's major
     * axis in the body plane, so the "sash" came out as a 24 cm flat board
     * sticking out of the ribs. A strap has to follow the SURFACE, so this one
     * is a narrow arc of the torso's own profile whose angular offset (`roll`)
     * walks across the chest as it descends — the band is on the body at every
     * station by construction.
     */
    const dir = O.sash === 'left' ? 1 : -1;
    const band = torsoStations(P, C, V, 0.050, C.accent)
      .filter((q) => q.p[1] >= 0.97 && q.p[1] <= 1.412);
    const n = band.length - 1;
    const sts = band.map((q, i) => ({ ...q, roll: dir * (0.62 - (i / Math.max(1, n)) * 1.24) }));
    S.loft(sts, { seg: 4, a0: Math.PI * 0.5 - 0.20, a1: Math.PI * 0.5 + 0.20, jitter: 0.06 });
  }

  if (O.apron) {
    S.loft([
      { p: [0, 1.150, 0.020], w: 0.106 * P.chest, d: 0.118 * P.chest, bones: [[B.spine2, 1]], color: C.leather },
      { p: [0, 0.980, 0.014], w: 0.126 * P.waist, d: 0.126 * P.waist, bones: [[B.hips, 0.7], [B.spine1, 0.3]], color: C.leather },
      { p: [0, 0.780, 0.006], w: 0.140 * P.hip, d: 0.140 * P.hip, bones: [[B.hips, 1]], color: C.leather },
      { p: [0, 0.640, 0.000], w: 0.136 * P.hip, d: 0.136 * P.hip, bones: [[B.hips, 1]], color: C.leather },
    ], { seg: 8, a0: Math.PI * 0.20, a1: Math.PI * 0.80, jitter: 0.05 });
  }
}

/* ----------------------------------- gear ---------------------------------- */

/**
 * Carried props, each weighted 1.0 to the bone that should carry it.
 *
 * A haft in a hand is authored along ±X — the FOREARM axis in the bind T-pose
 * — because the hand bone inherits the arm's rotation, so an X-aligned shaft
 * hangs vertically once the arm comes down to the side, which is how a spear is
 * actually carried. Authoring it along Y (the "obvious" choice) would leave it
 * sticking out horizontally in every pose.
 */
function gear(S, P, C, V) {
  const has = (n) => V.gear.includes(n);
  const hand = (side) => (side > 0 ? B.handL : B.handR);
  const hx = (side) => side * 0.778;

  if (has('spear')) {
    const s = -1;                         // right hand
    const bn = [[hand(s), 1]];
    S.tube([hx(s) - s * 0.42, 1.437, -0.062], [hx(s) + s * 0.96, 1.437, -0.062],
      0.017, 0.015, bn, C.haft, 7, { jitter: 0.05 });
    // knapped head
    S.loft([
      { p: [hx(s) + s * 0.94, 1.437, -0.062], w: 0.021, d: 0.010, bones: bn, color: C.metal },
      { p: [hx(s) + s * 1.05, 1.437, -0.062], w: 0.034, d: 0.013, bones: bn, color: C.metal },
      { p: [hx(s) + s * 1.24, 1.437, -0.062], w: 0.004, d: 0.003, bones: bn, color: C.metal },
    ], { seg: 6, capStart: true, jitter: 0.03 });
    S.loft([
      { p: [hx(s) + s * 0.90, 1.437, -0.062], w: 0.021, d: 0.021, bones: bn, color: C.accent },
      { p: [hx(s) + s * 0.96, 1.437, -0.062], w: 0.021, d: 0.021, bones: bn, color: C.accent },
    ], { seg: 6, jitter: 0.05 });
  }

  if (has('torch')) {
    const s = -1;
    const bn = [[hand(s), 1]];
    S.tube([hx(s) - s * 0.10, 1.437, -0.062], [hx(s) + s * 0.44, 1.437, -0.062],
      0.016, 0.014, bn, C.haft, 6, { jitter: 0.06 });
    S.ellipsoid([hx(s) + s * 0.50, 1.437, -0.062], [0.040, 0.034, 0.034], bn, '#3a2a20',
      { su: 7, sv: 4, jitter: 0.08 });
  }

  if (has('hammer')) {
    const s = -1;
    const bn = [[hand(s), 1]];
    S.tube([hx(s) - s * 0.06, 1.437, -0.062], [hx(s) + s * 0.30, 1.437, -0.062],
      0.017, 0.015, bn, C.haft, 6, { jitter: 0.05 });
    S.slab([hx(s) + s * 0.34, 1.437, -0.062], [0.036, 0.040, 0.040], bn, C.metal);
  }

  if (has('staff')) {
    const s = -1;
    const bn = [[hand(s), 1]];
    S.tube([hx(s) - s * 0.62, 1.437, -0.062], [hx(s) + s * 0.72, 1.437, -0.062],
      0.016, 0.013, bn, C.haft, 6, { jitter: 0.08 });
    S.ellipsoid([hx(s) + s * 0.76, 1.437, -0.062], [0.030, 0.026, 0.026], bn, C.accent,
      { su: 7, sv: 4, jitter: 0.08 });
  }

  if (has('basket')) {
    // carried at the waist in both arms: rides the pelvis, never clips a hand
    const bn = [[B.spine1, 1]];
    S.loft([
      { p: [0, 1.000, 0.190], w: 0.118, d: 0.098, bones: bn, color: C.basket },
      { p: [0, 1.070, 0.196], w: 0.132, d: 0.110, bones: bn, color: C.basket },
      { p: [0, 1.118, 0.198], w: 0.128, d: 0.106, bones: bn, color: C.basket },
    ], { seg: 11, capStart: true, jitter: 0.10 });
  }

  if (has('bow')) {
    const bn = [[B.spine3, 1]];
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const y = 1.480 - t * 0.520;
      const x = 0.070 - Math.sin(t * Math.PI) * 0.090;
      pts.push([x, y, -0.148 - Math.sin(t * Math.PI) * 0.030]);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      S.tube(pts[i], pts[i + 1], 0.013, 0.013, bn, C.haft, 5, { jitter: 0.05 });
    }
    S.tube(pts[0], pts[pts.length - 1], 0.004, 0.004, bn, '#d8cdb4', 4, { jitter: 0.02 });
  }

  if (has('quiver')) {
    const bn = [[B.spine3, 1]];
    S.loft([
      { p: [-0.090, 1.180, -0.150], w: 0.046, d: 0.046, bones: bn, color: C.leather },
      { p: [-0.062, 1.430, -0.170], w: 0.050, d: 0.050, bones: bn, color: C.leather },
    ], { seg: 8, capStart: true, jitter: 0.05 });
    for (let i = 0; i < 4; i++) {
      const o = (i - 1.5) * 0.020;
      S.tube([-0.062 + o, 1.430, -0.170], [-0.050 + o, 1.560, -0.182], 0.005, 0.005, bn, '#c9b48a', 4);
      S.slab([-0.048 + o, 1.574, -0.184], [0.004, 0.024, 0.012], bn, C.accent);
    }
  }

  if (has('pack')) {
    const bn = [[B.spine3, 1]];
    S.ellipsoid([0, 1.200, -0.190], [0.130, 0.140, 0.086], bn, C.leather, { su: 9, sv: 6, jitter: 0.07 });
    S.loft([
      { p: [0, 1.400, -0.060], w: 0.150, d: 0.110, bones: bn, color: C.leather2 },
      { p: [0, 1.300, -0.070], w: 0.152, d: 0.116, bones: bn, color: C.leather2 },
    ], { seg: 10, a0: Math.PI * 0.10, a1: Math.PI * 0.90, jitter: 0.04 });
  }

  if (has('tools')) {   // smith's tongs and rod hanging at the hip
    const bn = [[B.hips, 1]];
    S.tube([0.126, 0.960, 0.010], [0.150, 0.790, 0.030], 0.010, 0.008, bn, C.metal, 5);
    S.tube([0.104, 0.958, -0.020], [0.126, 0.800, -0.030], 0.009, 0.007, bn, C.metal, 5);
  }
}

/* ========================================================================== */
/*  VARIANT RESOLUTION                                                        */
/* ========================================================================== */

function pick(arr, rng) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

/**
 * Turn a roster row into the full parameter set `buildNpcBody` consumes.
 * Everything not stated in the row is drawn from the NPC's own seeded rng, so
 * the crowd is deterministic between runs (screenshots and gates reproduce).
 */
export function resolveVariant(row, rng) {
  const body = BODIES[row.body] || BODIES.lean;
  const p = {
    shoulder: body.shoulder, chest: body.chest, waist: body.waist, hip: body.hip,
    armR: body.armR, legR: body.legR, neck: body.neck, head: body.head, belly: body.belly,
  };
  const skin = row.skin || pick(SKIN, rng);
  const hairCol = row.hair || pick(HAIR, rng);
  const cloth1 = row.cloth1 || pick(CLOTH, rng);
  let cloth2 = row.cloth2 || pick(CLOTH, rng);
  if (cloth2 === cloth1) cloth2 = CLOTH[(CLOTH.indexOf(cloth1) + 3) % CLOTH.length];
  const leather = row.leather || pick(LEATHER, rng);
  return {
    id: row.id,
    body: row.body,
    scale: (row.scale ?? 1) * body.scale,
    stoop: body.stoop || 0,
    p,
    c: {
      skin,
      hair: hairCol,
      eye: '#2c2118',
      mouth: '#6b433a',
      cloth1,
      cloth2,
      leather,
      leather2: LEATHER[(LEATHER.indexOf(leather) + 2) % LEATHER.length],
      fur: row.fur || pick(FUR, rng),
      metal: '#9aa2a6',
      buckle: '#8a6a3c',
      haft: '#6d5233',
      accent: row.accent || '#b4442e',
      basket: '#b79a63',
    },
    hairStyle: row.hairStyle || 'short',
    beard: !!row.beard,
    headband: !!row.headband,
    feather: !!row.feather,
    outfit: {
      tunic: true, belt: true, boots: true,
      skirt: row.outfit?.skirt ?? true,
      skirtLong: !!row.outfit?.skirtLong,
      bootsHigh: !!row.outfit?.bootsHigh,
      legWraps: row.outfit?.legWraps ?? true,
      hood: !!row.outfit?.hood,
      cloak: !!row.outfit?.cloak,
      ruff: !!row.outfit?.ruff,
      pauldron: row.outfit?.pauldron || null,
      wraps: row.outfit?.wraps ?? true,
      sleeves: row.outfit?.sleeves ?? true,
      sleevesLong: !!row.outfit?.sleevesLong,
      harness: row.outfit?.harness ?? true,
      sash: row.outfit?.sash || (rng() < 0.55 ? 'left' : 'right'),
      apron: !!row.outfit?.apron,
    },
    gear: row.gear || [],
  };
}

/** One material per NPC: shared shape, per-variant surface. */
export function makeNpcMaterial(V) {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86 - (V.p.armR - 1) * 0.06,
    metalness: 0.0,
    flatShading: false,
    name: `npc-${V.id}`,
  });
}

export { SKIN, HAIR, CLOTH, LEATHER, FUR };
