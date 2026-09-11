import * as THREE from 'three';
import {
  SimplexNoise, mulberry32, composeMat, tint, tube, bake, materials, roughen,
} from './kit.js';

/**
 * ROUND 4 — `world-12` (2-tent camp, 1 static NPC) and gate `V35-settlement`.
 *
 * The settlement build-out for the hunter camp at (22, 30): a palisade that
 * follows the shoulder of the knoll, a gate with a walkway over it, six new
 * structures on top of the two Round-2 tents, four braziers, and the working
 * dressing (drying racks, a tanning frame, a trough, a totem, spear stands)
 * that is the difference between "props near a fire" and "a place people live".
 *
 * WHY THIS FILE AND NOT `camp.js`. `camp.js` is this lane's file too, but it is
 * already 975 lines of Round-2 firepit/tent/particle work that is CORRECT and
 * must not be churned. Everything here appends: it builds into its own buckets
 * and bakes into its own named meshes, so nothing above it in `camp.js` shifts
 * by a vertex and the Round-2 camp screenshots stay reproducible.
 *
 * DRAW BUDGET (`A9-perf-budget`, calls < 350). Six merged meshes, all parked
 * under the `hunter-camp` group:
 *
 *   camp-palisade      timber ring + gate frame          casts
 *   camp-structures    hut frames, posts, decks, racks    casts
 *   camp-thatch        roofs, hides, banners              casts
 *   camp-dressing      clutter: pelts, bundles, tools      no shadow
 *   camp-brazier       the four iron bowls + tripods       casts
 *   camp-brazier-glow  coals + flame cones (emissive)      no shadow
 *
 * COLLISION (`A61`). They all live under `hunter-camp`, which
 * `collision.seedWorld()` walks per mesh into triangle-exact `MeshBVH`
 * colliders — so the palisade actually stops the player and actually breaks a
 * machine's line of sight, with no registration call from here and no shape
 * approximation. The two gate openings are real holes in that geometry.
 *
 * LIGHT. Two of the four braziers carry a shadow-free `PointLight` (range 13).
 * Adding point lights recompiles every lit material in the scene, so the count
 * is deliberately small; the other two braziers read at dusk on emissive coals
 * and flame cones alone, which cost nothing.
 */

const FIRE_X = 22, FIRE_Z = 30;

/**
 * Palisade gates, as (bearing in radians, half-width in radians).
 *
 * The MAIN gate is 11 m wide, and that number is not a style choice. `nav`
 * blocks a stamped triangle's XZ bounding box padded by the 1.2 m agent radius
 * and then rounded OUT to whole 2 m cells, so a jamb post eats ~3.4 m of
 * opening on each side. At the 6.6 m the first cut used, the grid corridor
 * through the gate was 0 m wide and `nav.path(camp -> anywhere)` returned null
 * (gate A25b) even though the player walked through it fine. 11 m leaves two
 * clear cells. The NE postern stays narrow on purpose — one navigable gate is
 * what a settlement needs, and a postern you have to squeeze through is right.
 */
const GATES = [
  { a: Math.PI * 1.14, half: 0.30, main: true },   // SSW — toward the meadow
  { a: Math.PI * 0.22, half: 0.13, main: false },  // NE  — toward the lookout
];

/** Structures. `kind` picks the roof; every one settles onto its own ground. */
/**
 * Structures, sited off the MAIN STREET. The avenue runs from the fire to the
 * main gate on bearing 205 deg; everything here is at least 8 m off that
 * centreline, because nav's stamp reaches ~3.4 m past a prop's own footprint
 * and a village whose street is stamped shut is a village machines and quests
 * cannot path out of.
 */
const HUTS = [
  { id: 'hut-north', kind: 'round', x: 16.2, z: 35.8, r: 2.55, wall: 1.72 },
  { id: 'hut-east', kind: 'round', x: 28.8, z: 34.6, r: 2.15, wall: 1.62 },
  { id: 'longhouse', kind: 'long', x: 9.8, z: 31.5, w: 7.4, d: 4.4, wall: 2.0, yaw: 0.30 },
  { id: 'hut-south', kind: 'aframe', x: 29.8, z: 25.9, r: 2.3, wall: 1.5 },
  { id: 'store', kind: 'stilt', x: 25.2, z: 37.6, r: 1.55, wall: 1.35 },
  { id: 'hut-west', kind: 'round', x: 8.0, z: 24.0, r: 1.95, wall: 1.55 },
];

const BRAZIERS = [
  { x: 19.2, z: 34.2, light: true },
  { x: 27.6, z: 26.2, light: true },
  { x: 13.5, z: 31.5, light: false },   // the west side, clear of the avenue
  { x: 27.0, z: 33.6, light: false },
];

/**
 * Build the whole settlement into `camp.group`. Returns the handles `camp.js`
 * needs to animate and to publish (`brazierLights`, `glowMat`, `gate`).
 */
export function buildSettlement(ctx, group, opts = {}) {
  const B = new Settlement(ctx, group, opts);
  return B.result;
}

class Settlement {
  constructor(ctx, group, opts) {
    this.ctx = ctx;
    this.group = group;
    this.rng = mulberry32(0xCA37);
    this.noise = new SimplexNoise(2211);
    this.fy = opts.fireY ?? ctx.terrain.getHeight(FIRE_X, FIRE_Z);

    /** geometry buckets — one merged mesh each */
    this.palisade = [];
    this.timber = [];
    this.thatch = [];
    this.dressing = [];
    this.banners = [];
    this.brazier = [];
    this.glow = [];

    this.lights = [];
    this.huts = [];

    this._ring();
    this._palisade();
    this._huts();
    this._leanTos();
    this._braziers();
    this._dressing();
    this._bake();

    this.result = {
      brazierLights: this.lights,
      glowMat: this.glowMat,
      gate: this.gate,
      huts: this.huts,
      palisadeRadius: (a) => this.radiusAt(a),
      gateAt: (a) => this.gateAt(a),
      structures: this.huts.length,
      posts: this.postCount,
    };
  }

  gy(x, z) { return this.ctx.terrain.getHeight(x, z); }

  /* ===================================================================== */
  /*  THE RING — the palisade follows the shoulder of the knoll             */
  /* ===================================================================== */

  /**
   * A circle would sink into the south gully and climb the west rise. Instead,
   * walk outward on every bearing and stop where the ground leaves the camp's
   * own shelf — the line a people who actually had to carry the logs would
   * pick. Smoothed so the wall reads as one build, not a per-post scatter.
   */
  _ring() {
    const N = 144;
    const raw = new Float32Array(N);
    const fy = this.fy;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const sx = Math.sin(a), sz = Math.cos(a);
      let r = 14.0;
      for (let d = 14.0; d <= 20.5; d += 0.5) {
        const h = this.gy(FIRE_X + sx * d, FIRE_Z + sz * d);
        if (h < fy - 3.0 || h > fy + 3.8) break;
        r = d;
      }
      raw[i] = r;
    }
    // 9-tap circular box filter, twice: the wall must not wobble per post
    this.ringR = new Float32Array(N);
    let src = raw, dst = this.ringR;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < N; i++) {
        let s = 0;
        for (let k = -4; k <= 4; k++) s += src[(i + k + N) % N];
        dst[i] = s / 9;
      }
      const t = src; src = dst; dst = t;
    }
    if (src !== this.ringR) this.ringR.set(src);
    this.ringN = N;
  }

  /** Smoothed palisade radius at bearing `a` (radians), with a slow wander. */
  radiusAt(a) {
    const N = this.ringN;
    const f = ((a / (Math.PI * 2)) % 1 + 1) % 1 * N;
    const i0 = Math.floor(f) % N, i1 = (i0 + 1) % N, t = f - Math.floor(f);
    const r = this.ringR[i0] * (1 - t) + this.ringR[i1] * t;
    return r + this.noise.noise2D(Math.cos(a) * 1.3, Math.sin(a) * 1.3) * 0.55;
  }

  /** Is bearing `a` inside a gate opening? Returns the gate or null. */
  gateAt(a) {
    for (const g of GATES) {
      let d = a - g.a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < g.half) return g;
    }
    return null;
  }

  /* ===================================================================== */
  /*  PALISADE                                                             */
  /* ===================================================================== */

  _palisade() {
    const rng = this.rng;
    const P = this.palisade;
    const wood = ['#7b6142', '#6a5438', '#856a48', '#725a3c', '#7f6544'];
    /**
     * A palisade is a WALL: 26 cm logs standing shoulder to shoulder, not a
     * fence. The step is therefore an ARC LENGTH (0.255 m) converted to an
     * angle at the local radius each time round, so the spacing stays constant
     * as the ring bulges from 15 m to 23 m — a fixed angular step left 0.9 m
     * gaps on the wide bearings and you could walk straight through them.
     */
    const STEP = 0.235, R_POST = 0.175;
    let posts = 0;
    const rail = [];
    for (let a = 0, i = 0; a < Math.PI * 2; i++) {
      const r = this.radiusAt(a);
      const inGate = !!this.gateAt(a);
      if (!inGate) {
        const rr = r + (rng() - 0.5) * 0.09;
        const x = FIRE_X + Math.sin(a) * rr, z = FIRE_Z + Math.cos(a) * rr;
        const g = this.gy(x, z);
        // height wanders in slow courses, not per post: a crew built this
        const h = 2.85 + 0.3 * Math.sin(a * 3.1) + 0.18 * Math.sin(a * 11.7) + rng() * 0.18;
        const lean = (rng() - 0.5) * 0.07;
        const rr2 = R_POST + rng() * 0.022;
        const col = wood[i % wood.length];
        // A log, then a sharpened tip. One tapered cylinder from base to point
        // leaves the top two thirds of the wall thin enough to see (and shoot)
        // through — a palisade is a solid shaft with a sharpened last 30 cm.
        const tipY = h - 0.32;
        // 6 radial segments, not 5: with 5 the inradius is 0.81r, so a wall
        // stepped at 0.255 m opened a visible slot between every pair of logs.
        tube(P, [x, g - 0.6, z], [x + Math.sin(a) * lean * 0.7, g + tipY, z + Math.cos(a) * lean * 0.7],
          rr2, rr2 * 0.95, col, 6, 0.1, rng);
        tube(P, [x + Math.sin(a) * lean * 0.7, g + tipY, z + Math.cos(a) * lean * 0.7],
          [x + Math.sin(a) * lean, g + h, z + Math.cos(a) * lean],
          rr2 * 0.95, 0.035, col, 6, 0.1, rng);
        if (i % 7 === 0) rail.push({ x, z, g, h, a });
        posts++;
      } else if (rail.length && rail[rail.length - 1]) rail.push(null);
      a += STEP / Math.max(6, r);
    }

    // two lashing rails on the INSIDE face, spanning every 7th post so they
    // follow the ground; broken wherever a gate opening is
    for (const frac of [0.40, 0.76]) {
      for (let i = 0; i < rail.length; i++) {
        const A = rail[i], Bp = rail[(i + 1) % rail.length];
        if (!A || !Bp) continue;
        const ins = 0.19;
        tube(P,
          [A.x - Math.sin(A.a) * ins, A.g + A.h * frac, A.z - Math.cos(A.a) * ins],
          [Bp.x - Math.sin(Bp.a) * ins, Bp.g + Bp.h * frac, Bp.z - Math.cos(Bp.a) * ins],
          0.06, 0.06, '#6f5a3c', 4, 0.08, rng);
      }
    }

    // buttress props every other rail station, leaning in — reads as engineered
    for (let i = 0; i < rail.length; i += 2) {
      const A = rail[i];
      if (!A) continue;
      const ix = A.x - Math.sin(A.a) * 1.6, iz = A.z - Math.cos(A.a) * 1.6;
      tube(P, [ix, this.gy(ix, iz) - 0.25, iz], [A.x - Math.sin(A.a) * 0.2, A.g + A.h * 0.62, A.z - Math.cos(A.a) * 0.2],
        0.085, 0.06, '#4f3d29', 5, 0.08, rng);
    }
    this.postCount = posts;

    for (const g of GATES) this._gate(g);
  }

  /**
   * A gate: four heavy jamb posts, banners on the jambs, and — on the main
   * gate — a wall-walk BESIDE the opening rather than a bridge across it.
   *
   * WHY NOTHING SPANS THE OPENING. `nav` stamps every static blocking collider
   * into the 2 m grid wherever its surface stands 0.6 m or more clear of the
   * ground (docs/ROUND4-SPATIAL.md §2). A lintel at 2.6 m and a plank walkway
   * over the gate are both "clear of the ground", so the first cut stamped
   * both openings shut: gate `A25b-nav-and-occlusion` came back with
   * `path(camp -> -205,-55) === null` and the open fraction of the grid down
   * from 71.7 % to 65.5 %. The capsule walked through fine — this was a hole
   * only the navgrid could see. A wall-walk running along the palisade from
   * the jamb is the same silhouette, the same ladder, and leaves the gate
   * mouth open sky-to-ground.
   */
  _gate(g) {
    const rng = this.rng;
    const P = this.palisade;
    const T = this.timber;
    const r = this.radiusAt(g.a);
    const jamb = [];
    for (const s of [-1, 1]) {
      const a = g.a + s * g.half;
      for (const dr of [-0.55, 0.55]) {
        const x = FIRE_X + Math.sin(a) * (r + dr), z = FIRE_Z + Math.cos(a) * (r + dr);
        const gy = this.gy(x, z);
        const h = g.main ? 4.35 : 3.5;
        tube(P, [x, gy - 0.7, z], [x, gy + h, z], 0.2, 0.15, '#4a3826', 7, 0.07, rng);
        // a lashed cap on each jamb, so the post reads as finished
        const cap = new THREE.CylinderGeometry(0.26, 0.24, 0.16, 8);
        tint(cap, '#5b4630', 0.08, rng);
        cap.applyMatrix4(composeMat(x, gy + h + 0.05, z));
        P.push(cap.toNonIndexed());
        jamb.push({ x, z, gy, h, s, dr, a });
      }
    }
    const topY = Math.min(...jamb.map((j) => j.gy + j.h)) - 0.35;

    if (g.main) {
      /* ---- wall-walk along the palisade, starting at the +half jamb ---- */
      const wa0 = g.a + g.half + 0.035;
      const wa1 = wa0 + 0.34;                       // ~6.5 m of deck at r ~ 19
      const deckOf = (a) => this.gy(FIRE_X + Math.sin(a) * r, FIRE_Z + Math.cos(a) * r) + 2.05;
      const span = 12;
      for (let i = 0; i <= span; i++) {
        const a = wa0 + (wa1 - wa0) * (i / span);
        const cx = FIRE_X + Math.sin(a) * (r - 0.42), cz = FIRE_Z + Math.cos(a) * (r - 0.42);
        const plank = new THREE.BoxGeometry(1.25, 0.07, 0.46);
        tint(plank, i % 2 ? '#6a5138' : '#5f4931', 0.09, rng);
        plank.applyMatrix4(composeMat(cx, deckOf(a), cz, 0, -a, 0));
        T.push(plank);
        // joist brackets off the wall every third plank
        if (i % 3 === 0) {
          const bx = FIRE_X + Math.sin(a) * (r - 0.95), bz = FIRE_Z + Math.cos(a) * (r - 0.95);
          tube(T, [bx, this.gy(bx, bz) - 0.2, bz], [bx, deckOf(a) - 0.06, bz], 0.075, 0.06, '#5b4630', 5, 0.08, rng);
          tube(T, [bx, deckOf(a) - 0.08, bz],
            [FIRE_X + Math.sin(a) * (r - 0.2), deckOf(a) - 1.0, FIRE_Z + Math.cos(a) * (r - 0.2)],
            0.05, 0.045, '#4f3d29', 4, 0.08, rng);
        }
      }
      // inner rail (the wall itself is the outer parapet)
      for (const rh of [0.5, 0.98]) {
        tube(T,
          [FIRE_X + Math.sin(wa0) * (r - 0.92), deckOf(wa0) + rh, FIRE_Z + Math.cos(wa0) * (r - 0.92)],
          [FIRE_X + Math.sin(wa1) * (r - 0.92), deckOf(wa1) + rh, FIRE_Z + Math.cos(wa1) * (r - 0.92)],
          0.04, 0.04, '#4f3d29', 4, 0.07, rng);
      }
      for (let i = 0; i <= 3; i++) {
        const a = wa0 + (wa1 - wa0) * (i / 3);
        const px = FIRE_X + Math.sin(a) * (r - 0.92), pz = FIRE_Z + Math.cos(a) * (r - 0.92);
        tube(T, [px, deckOf(a), pz], [px, deckOf(a) + 1.05, pz], 0.05, 0.04, '#5b4630', 5, 0.07, rng);
      }
      // the ladder, at the far end of the walk so it is clear of the mouth
      const la = wa1 - 0.02;
      const lx = FIRE_X + Math.sin(la) * (r - 1.3), lz = FIRE_Z + Math.cos(la) * (r - 1.3);
      const lg = this.gy(lx, lz);
      const deckY = deckOf(la);
      for (const s of [-0.3, 0.3]) {
        const ox = Math.cos(la) * s, oz = -Math.sin(la) * s;
        tube(T, [lx + ox, lg - 0.2, lz + oz],
          [lx + ox + Math.sin(la) * 0.5, deckY + 0.4, lz + oz + Math.cos(la) * 0.5],
          0.05, 0.045, '#5b4630', 5, 0.07, rng);
      }
      const rungs = Math.max(5, Math.round((deckY - lg) / 0.36));
      for (let i = 0; i < rungs; i++) {
        const f = (i + 0.5) / rungs;
        const y = lg - 0.2 + (deckY + 0.6 - lg) * f;
        const cx = lx + Math.sin(la) * 0.5 * f, cz = lz + Math.cos(la) * 0.5 * f;
        tube(T, [cx + Math.cos(la) * 0.3, y, cz - Math.sin(la) * 0.3],
          [cx - Math.cos(la) * 0.3, y, cz + Math.sin(la) * 0.3], 0.028, 0.028, '#463322', 4, 0.06, rng);
      }
      this.gate = { x: FIRE_X + Math.sin(g.a) * r, z: FIRE_Z + Math.cos(g.a) * r, a: g.a, r, topY,
        walk: { a0: wa0, a1: wa1, y: deckOf((wa0 + wa1) / 2) } };
    }

    /**
     * Hide banners on the jambs, in `camp-banners`, which owns its own
     * `raycast` so neither the collider seed nor an arrow treats hanging cloth
     * as a wall. An earlier cut hung one across the middle of each opening and
     * the palisade probe correctly reported both gates blocked: a doorway
     * curtain you cannot walk through is a sealed gate.
     */
    for (const side of [-1, 1]) {
      const ba = g.a + side * g.half * 0.92;
      const flag = new THREE.PlaneGeometry(1.05, 1.7, 3, 5);
      const p = flag.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) / 1.05 + 0.5, v = p.getY(i) / 1.7 + 0.5;
        p.setZ(i, Math.sin(u * 4.1 + side) * 0.08 * (1 - v));
      }
      flag.computeVertexNormals();
      tint(flag, g.main ? (side > 0 ? '#8f3a2a' : '#7a3324') : '#3f5d6b', 0.11, rng);
      flag.applyMatrix4(composeMat(
        FIRE_X + Math.sin(ba) * (r - 0.62), topY - 1.05, FIRE_Z + Math.cos(ba) * (r - 0.62),
        0, -ba, 0));
      this.banners.push(flag);
    }
  }

  /* ===================================================================== */
  /*  STRUCTURES                                                           */
  /* ===================================================================== */

  _huts() {
    for (const h of HUTS) {
      const yaw = h.yaw ?? Math.atan2(FIRE_X - h.x, FIRE_Z - h.z);
      const rec = { ...h, yaw };
      if (h.kind === 'round') this._roundHut(rec);
      else if (h.kind === 'long') this._longhouse(rec);
      else if (h.kind === 'aframe') this._aframeHut(rec);
      else if (h.kind === 'stilt') this._stiltStore(rec);
      this.huts.push(rec);
    }
  }


  /**
   * A roof/wall panel from four world-space corners, subdivided and sagging.
   *
   * Roof panels used to be `PlaneGeometry` placed with a composed Euler, and
   * the X-then-Y order put the longhouse's two slopes at the wrong pitch and
   * off their rafters — visible as a flat slab floating beside the frame. Four
   * corners cannot be got wrong: the ridge line and the eave line are computed
   * from the frame that already exists, and the quad is filled between them.
   * Subdividing also keeps each triangle small, which nav's per-triangle stamp
   * cares about (see props/kit.js heightSegs).
   */
  _panel(list, p00, p10, p11, p01, cols, rows, palette, sag, rng) {
    const pos = [], col = [], idx = [], uv = [];
    const c = new THREE.Color();
    const pal = palette.map((h) => new THREE.Color(h));
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const u = i / cols, v = j / rows;
        const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w11 = u * v, w01 = (1 - u) * v;
        const x = w00 * p00[0] + w10 * p10[0] + w11 * p11[0] + w01 * p01[0];
        const y = w00 * p00[1] + w10 * p10[1] + w11 * p11[1] + w01 * p01[1];
        const z = w00 * p00[2] + w10 * p10[2] + w11 * p11[2] + w01 * p01[2];
        const dip = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * sag
          + Math.sin(u * Math.PI * 3.5) * sag * 0.22 * Math.sin(v * Math.PI);
        pos.push(x, y - dip, z);
        uv.push(u, v);
        c.copy(pal[(Math.floor(u * pal.length * 1.7) + j) % pal.length])
          .multiplyScalar(0.84 + rng() * 0.28);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = j * (cols + 1) + i, b = a + 1, d = a + cols + 1, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    list.push(g.toNonIndexed());
  }

  /** Lowest ground under a footprint of radius `r` — huts do not float. */
  _seat(x, z, r) {
    let lo = Infinity;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      lo = Math.min(lo, this.gy(x + Math.cos(a) * r, z + Math.sin(a) * r));
    }
    return Math.min(lo, this.gy(x, z));
  }

  /**
   * Conical thatch. A plain cone reads as a party hat, so three things happen
   * to it: the radius wobbles with bearing (bundles are not laid to a
   * tolerance), the surface is stepped into ~7 COURSES so the shingling
   * catches a shadow line, and the colour runs from bleached at the apex to
   * damp and mossy at the eave. Then a rope binding ring, a straw apex cap and
   * a fringe of loose ends hanging past the wall.
   */
  _thatchCone(x, y, z, r, h, seed) {
    const rng = mulberry32(seed);
    const N = this.noise;
    const spin = rng() * 6.28;
    const COURSES = 7;
    const cone = new THREE.ConeGeometry(r, h, 22, 14);
    const p = cone.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      const f = THREE.MathUtils.clamp((py + h / 2) / h, 0, 1);   // 0 eave .. 1 apex
      const a = Math.atan2(pz, px);
      // per-bearing bundle wobble + fbm roughness
      const wob = 1 + 0.055 * Math.sin(a * 3 + seed) + 0.032 * Math.sin(a * 7.3 - seed)
        + N.fbm(px * 1.5 + seed, pz * 1.5, 2) * 0.05;
      // course stepping: each course overhangs the one above it
      const cf = f * COURSES;
      const step = 0.055 * (1 - (cf - Math.floor(cf))) * (1 - f * 0.5);
      const k = wob + step / Math.max(0.25, r * (1 - f));
      p.setXYZ(i, px * k, py + N.noise2D(px * 2.1, pz * 2.1) * 0.035, pz * k);
    }
    cone.computeVertexNormals();
    const n = p.count;
    const arr = new Float32Array(n * 3);
    const c = new THREE.Color();
    const cApex = new THREE.Color('#b6a06a');
    const cMid = new THREE.Color('#8d7442');
    const cEave = new THREE.Color('#5f512c');
    const cMoss = new THREE.Color('#5b6a34');
    for (let i = 0; i < n; i++) {
      const f = THREE.MathUtils.clamp((p.getY(i) + h / 2) / h, 0, 1);
      c.copy(cEave).lerp(cMid, THREE.MathUtils.smoothstep(f, 0.0, 0.55))
        .lerp(cApex, THREE.MathUtils.smoothstep(f, 0.55, 1.0));
      const cf = f * COURSES;
      c.multiplyScalar(0.86 + 0.24 * (cf - Math.floor(cf)));      // course shading
      const moss = Math.max(0, N.fbm(p.getX(i) * 1.1, p.getZ(i) * 1.1, 2)) * (1 - f);
      c.lerp(cMoss, moss * 0.32);
      const j = 0.95 + rng() * 0.11;
      arr[i * 3] = c.r * j; arr[i * 3 + 1] = c.g * j; arr[i * 3 + 2] = c.b * j;
    }
    cone.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    cone.applyMatrix4(composeMat(x, y + h / 2, z, 0, spin, 0));
    this.thatch.push(cone.toNonIndexed());

    // rope binding ring two thirds up, and a straw cap over the apex
    {
      const ry = y + h * 0.66, rr = r * 0.36;
      const ring = new THREE.TorusGeometry(rr, 0.035, 5, 16);
      ring.rotateX(Math.PI / 2);
      tint(ring, '#c7b48c', 0.12, rng);
      ring.applyMatrix4(composeMat(x, ry, z));
      this.thatch.push(ring.toNonIndexed());
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + spin;
        tube(this.thatch, [x + Math.cos(a) * r * 0.12, y + h * 0.96, z + Math.sin(a) * r * 0.12],
          [x + Math.cos(a) * rr * 1.5, ry - 0.1, z + Math.sin(a) * rr * 1.5],
          0.05, 0.03, '#a08a52', 4, 0.14, rng);
      }
    }
    // eave fringe: loose straw ends hanging past the wall line
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rng() * 0.22;
      const ex = x + Math.cos(a) * r * 1.0, ez = z + Math.sin(a) * r * 1.0;
      tube(this.thatch, [ex, y + 0.1, ez],
        [ex + Math.cos(a) * 0.19, y - 0.24 - rng() * 0.2, ez + Math.sin(a) * 0.19],
        0.05, 0.018, i % 3 === 0 ? '#6b5a30' : i % 3 === 1 ? '#8d743e' : '#7a6231', 4, 0.16, rng);
    }
  }

  /**
   * Lean-tos, woodpiles and torches ranged around the INSIDE of the palisade.
   * Without them the wall encloses a ring of empty grass and the settlement
   * reads as a fence with huts in the middle instead of a place people use all
   * the way to its edge.
   */
  _leanTos() {
    const rng = this.rng;
    const T = this.timber;
    const bearings = [0.62, 1.72, 2.62, 4.35, 5.24, 5.86];
    for (let k = 0; k < bearings.length; k++) {
      const a = bearings[k];
      if (this.gateAt(a)) continue;
      const r = this.radiusAt(a) - 1.9;
      const x = FIRE_X + Math.sin(a) * r, z = FIRE_Z + Math.cos(a) * r;
      const g = this.gy(x, z);
      const inward = a + Math.PI;                        // faces the fire
      const ix = Math.sin(inward), iz = Math.cos(inward);
      const px = -iz, pz = ix;                           // along the wall

      if (k % 3 === 2) {
        // stacked firewood against the wall
        for (let row = 0; row < 4; row++) {
          for (let i = 0; i < 5; i++) {
            const ox = px * ((i - 2) * 0.19), oz = pz * ((i - 2) * 0.19);
            const y = g + 0.12 + row * 0.2;
            tube(T, [x + ox - ix * 0.6, y, z + oz - iz * 0.6], [x + ox + ix * 0.6, y + 0.02, z + oz + iz * 0.6],
              0.09, 0.08, (i + row) % 2 ? '#6a5138' : '#5b4630', 5, 0.13, rng);
          }
        }
        continue;
      }

      // lean-to: two tall posts at the wall, two short at the front, hide roof
      const W = 2.4, D = 1.7, HB = 2.05, HF = 1.15;
      const corner = (s, front) => [
        x + px * (W / 2) * s + ix * (front ? D : 0),
        z + pz * (W / 2) * s + iz * (front ? D : 0),
      ];
      for (const s of [-1, 1]) {
        const [bx, bz] = corner(s, false);
        tube(T, [bx, this.gy(bx, bz) - 0.25, bz], [bx, g + HB, bz], 0.075, 0.06, '#5b4630', 5, 0.08, rng);
        const [fx, fz] = corner(s, true);
        tube(T, [fx, this.gy(fx, fz) - 0.25, fz], [fx, g + HF, fz], 0.07, 0.055, '#4f3d29', 5, 0.08, rng);
        tube(T, [bx, g + HB, bz], [fx, g + HF, fz], 0.05, 0.045, '#66513a', 4, 0.08, rng);
      }
      {
        const HW = W / 2 + 0.18, DD = D + 0.22;
        const bA = [x + px * -HW, g + HB + 0.08, z + pz * -HW];
        const bB = [x + px * HW, g + HB + 0.08, z + pz * HW];
        const fB = [x + px * HW + ix * DD, g + HF + 0.04, z + pz * HW + iz * DD];
        const fA = [x + px * -HW + ix * DD, g + HF + 0.04, z + pz * -HW + iz * DD];
        this._panel(this.thatch, bA, bB, fB, fA, 5, 3,
          k % 2 ? ['#7c4a2b', '#8a5433'] : ['#8e5c34', '#96613c'], 0.07, rng);
      }
      // a bedroll and a basket under it
      const roll = new THREE.CapsuleGeometry(0.17, 1.0, 3, 7);
      tint(roll, '#7d6a4a', 0.1, rng);
      roll.applyMatrix4(composeMat(x + ix * 0.5 - px * 0.4, g + 0.19, z + iz * 0.5 - pz * 0.4,
        0, Math.atan2(px, pz), Math.PI / 2, 1, 1, 0.75));
      this.dressing.push(roll.toNonIndexed());
      const basket = new THREE.CylinderGeometry(0.24, 0.19, 0.32, 9, 1);
      tint(basket, '#8a7148', 0.12, rng);
      basket.applyMatrix4(composeMat(x + ix * 0.45 + px * 0.75, g + 0.17, z + iz * 0.45 + pz * 0.75));
      this.dressing.push(basket.toNonIndexed());
    }
  }

  /** Round Nora hut: log ring, daub band, conical thatch, low door frame. */
  _roundHut(h) {
    const rng = this.rng;
    const T = this.timber;
    const base = this._seat(h.x, h.z, h.r) - 0.12;
    const posts = Math.max(12, Math.round(h.r * 6));
    const doorA = h.yaw;
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * Math.PI * 2;
      let d = a - doorA;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < 0.42) continue;              // doorway
      const px = h.x + Math.sin(a) * h.r, pz = h.z + Math.cos(a) * h.r;
      tube(T, [px, base - 0.35, pz], [px + Math.sin(a) * 0.05, base + h.wall + rng() * 0.08, pz + Math.cos(a) * 0.05],
        0.085, 0.07, i % 3 ? '#5b4630' : '#4f3d29', 5, 0.09, rng);
    }
    // daub infill: a slightly smaller open cylinder, warm clay
    {
      const wall = new THREE.CylinderGeometry(h.r - 0.055, h.r - 0.02, h.wall * 0.9, 20, 2, true);
      roughen(wall, this.noise, 0.045, 1.4, h.x);
      tint(wall, '#8a7458', 0.09, rng);
      wall.applyMatrix4(composeMat(h.x, base + h.wall * 0.45, h.z));
      this.timber.push(wall.toNonIndexed());
    }
    // door frame + hanging hide
    {
      const dx = h.x + Math.sin(doorA) * h.r, dz = h.z + Math.cos(doorA) * h.r;
      const ox = Math.cos(doorA) * 0.46, oz = -Math.sin(doorA) * 0.46;
      for (const s of [-1, 1]) {
        tube(T, [dx + ox * s, base - 0.2, dz + oz * s], [dx + ox * s, base + h.wall * 0.92, dz + oz * s],
          0.075, 0.065, '#463322', 5, 0.07, rng);
      }
      tube(T, [dx + ox, base + h.wall * 0.9, dz + oz], [dx - ox, base + h.wall * 0.9, dz - oz],
        0.06, 0.06, '#463322', 5, 0.07, rng);
      const hide = new THREE.PlaneGeometry(0.84, h.wall * 0.86, 3, 4);
      const p = hide.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 5) * 0.05);
      hide.computeVertexNormals();
      tint(hide, '#7c4a2b', 0.12, rng);
      hide.applyMatrix4(composeMat(dx - Math.sin(doorA) * 0.06, base + h.wall * 0.45, dz - Math.cos(doorA) * 0.06, 0, doorA, 0));
      this.banners.push(hide);              // a door curtain is not a door
    }
    this._thatchCone(h.x, base + h.wall, h.z, h.r + 0.42, h.r * 0.95 + 0.5, (h.x * 37) | 0);
    h.roofY = base + h.wall + h.r * 0.95 + 0.5;
    h.baseY = base;
  }

  /** The longhouse: the biggest roof in the camp, ridge + hide skin. */
  _longhouse(h) {
    const rng = this.rng;
    const T = this.timber;
    const yaw = h.yaw;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const at = (u, v) => [h.x + cs * u - sn * v, h.z + sn * u + cs * v];
    const base = this._seat(h.x, h.z, Math.max(h.w, h.d) * 0.5) - 0.14;
    const RIDGE = base + h.wall + 1.55;

    // wall posts down both long sides
    const nPost = 7;
    for (let i = 0; i <= nPost; i++) {
      const u = (i / nPost - 0.5) * h.w;
      for (const s of [-1, 1]) {
        const [px, pz] = at(u, s * h.d / 2);
        tube(T, [px, base - 0.35, pz], [px, base + h.wall, pz], 0.11, 0.09, i % 2 ? '#5b4630' : '#4f3d29', 6, 0.08, rng);
      }
    }
    // gable posts + ridge beam
    for (const s of [-1, 1]) {
      const [px, pz] = at(s * h.w / 2, 0);
      tube(T, [px, base - 0.35, pz], [px, RIDGE, pz], 0.13, 0.1, '#4a3826', 6, 0.08, rng);
    }
    {
      const [ax, az] = at(-h.w / 2 - 0.4, 0), [bx, bz] = at(h.w / 2 + 0.4, 0);
      tube(T, [ax, RIDGE, az], [bx, RIDGE, bz], 0.12, 0.12, '#66513a', 6, 0.07, rng);
    }
    // rafters
    for (let i = 0; i <= nPost; i++) {
      const u = (i / nPost - 0.5) * h.w;
      const [rx, rz] = at(u, 0);
      for (const s of [-1, 1]) {
        const [ex, ez] = at(u, s * (h.d / 2 + 0.28));
        tube(T, [rx, RIDGE, rz], [ex, base + h.wall - 0.12, ez], 0.055, 0.045, '#5b4630', 4, 0.08, rng);
      }
    }
    // daub walls
    for (const s of [-1, 1]) {
      const [wx, wz] = at(0, s * h.d / 2);
      const wall = new THREE.BoxGeometry(h.w - 0.1, h.wall * 0.92, 0.16, 8, 3, 1);
      roughen(wall, this.noise, 0.04, 1.6, s * 9);
      tint(wall, '#8a7458', 0.09, rng);
      wall.applyMatrix4(composeMat(wx, base + h.wall * 0.46, wz, 0, yaw, 0));
      this.timber.push(wall.toNonIndexed());
    }
    // gable ends
    for (const s of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-h.d / 2, 0); shape.lineTo(0, 1.55); shape.lineTo(h.d / 2, 0); shape.closePath();
      const g = new THREE.ShapeGeometry(shape);
      tint(g, '#6a5138', 0.1, rng);
      const [gx, gz] = at(s * h.w / 2, 0);
      g.applyMatrix4(composeMat(gx, base + h.wall, gz, 0, yaw + Math.PI / 2, 0));
      this.timber.push(g.toNonIndexed());
    }
    // hide roof: two sloped panels laid ridge-to-eave on the real frame
    {
      const EW = h.w / 2 + 0.42, ED = h.d / 2 + 0.3;
      const eaveY = base + h.wall - 0.12;
      const [rax, raz] = at(-EW, 0), [rbx, rbz] = at(EW, 0);
      const pal = ['#8e5c34', '#6e4123', '#a06a3c', '#7c4a2b'];
      for (const s of [-1, 1]) {
        const [eax, eaz] = at(-EW, s * ED), [ebx, ebz] = at(EW, s * ED);
        this._panel(this.thatch,
          [rax, RIDGE, raz], [rbx, RIDGE, rbz], [ebx, eaveY, ebz], [eax, eaveY, eaz],
          10, 4, pal, 0.09, rng);
      }
    }
    // smoke hole cap on the ridge
    {
      const [cx, cz] = at(h.w * 0.12, 0);
      const cap = new THREE.ConeGeometry(0.7, 0.5, 8, 1);
      tint(cap, '#7a6231', 0.1, rng);
      cap.applyMatrix4(composeMat(cx, RIDGE + 0.42, cz, 0, yaw, 0));
      this.thatch.push(cap.toNonIndexed());
    }
    h.roofY = RIDGE;
    h.baseY = base;
  }

  /** A-frame hide shelter, bigger and better built than the Round-2 tents. */
  _aframeHut(h) {
    const rng = this.rng;
    const T = this.timber;
    const yaw = h.yaw;
    const base = this._seat(h.x, h.z, h.r) - 0.1;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const at = (u, v) => [h.x + cs * u - sn * v, h.z + sn * u + cs * v];
    const D = h.r * 2.1, W = h.r * 1.9, H = h.wall + 1.05;
    for (const u of [-D / 2, 0, D / 2]) {
      for (const s of [-1, 1]) {
        const [ax, az] = at(u, s * W / 2);
        const [bx, bz] = at(u + 0.12 * s, 0);
        tube(T, [ax, base - 0.25, az], [bx, base + H + 0.24, bz], 0.075, 0.05, '#5b4630', 5, 0.08, rng);
      }
    }
    {
      const [ax, az] = at(-D / 2 - 0.3, 0), [bx, bz] = at(D / 2 + 0.3, 0);
      tube(T, [ax, base + H + 0.08, az], [bx, base + H + 0.08, bz], 0.055, 0.05, '#66513a', 5, 0.07, rng);
    }
    {
      const EU = D / 2 + 0.2, EW = W / 2 + 0.1;
      const [rax, raz] = at(-EU, 0), [rbx, rbz] = at(EU, 0);
      for (const s of [-1, 1]) {
        const [eax, eaz] = at(-EU, s * EW), [ebx, ebz] = at(EU, s * EW);
        this._panel(this.thatch,
          [rax, base + H + 0.14, raz], [rbx, base + H + 0.14, rbz],
          [ebx, base - 0.08, ebz], [eax, base - 0.08, eaz],
          7, 4, s > 0 ? ['#96613c', '#8a5433'] : ['#7c4a2b', '#8e5c34'], 0.1, rng);
      }
    }
    h.roofY = base + H + 0.24;
    h.baseY = base;
  }

  /** Stilted store hut — the meat cache, up off the ground and away from rats. */
  _stiltStore(h) {
    const rng = this.rng;
    const T = this.timber;
    const base = this._seat(h.x, h.z, h.r) - 0.1;
    const DECK = base + 1.35;
    const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [lx, lz] of legs) {
      const px = h.x + lx * h.r * 0.8, pz = h.z + lz * h.r * 0.8;
      tube(T, [px, this.gy(px, pz) - 0.4, pz], [px, DECK, pz], 0.1, 0.085, '#4f3d29', 6, 0.08, rng);
      // rat guard: a flat disc on each leg
      const disc = new THREE.CylinderGeometry(0.26, 0.26, 0.05, 10);
      tint(disc, '#6f6a60', 0.09, rng);
      disc.applyMatrix4(composeMat(px, DECK - 0.24, pz));
      this.timber.push(disc.toNonIndexed());
    }
    for (let i = 0; i < 9; i++) {
      const off = (i - 4) * (h.r * 1.7 / 9);
      const plank = new THREE.BoxGeometry(h.r * 1.75, 0.07, h.r * 1.7 / 9 - 0.02);
      tint(plank, i % 2 ? '#6a5138' : '#5f4931', 0.09, rng);
      plank.applyMatrix4(composeMat(h.x, DECK, h.z + off, 0, h.yaw * 0.1, 0));
      this.timber.push(plank);
    }
    // walls: woven withy screen (a lattice of thin tubes)
    for (const [lx, lz] of legs) {
      const px = h.x + lx * h.r * 0.82, pz = h.z + lz * h.r * 0.82;
      tube(T, [px, DECK, pz], [px, DECK + h.wall, pz], 0.055, 0.045, '#5b4630', 5, 0.08, rng);
    }
    for (let i = 0; i < 4; i++) {
      const y = DECK + 0.18 + i * (h.wall / 4.4);
      for (let k = 0; k < 4; k++) {
        const [ax, az] = legs[k], [bx, bz] = legs[(k + 1) % 4];
        tube(T, [h.x + ax * h.r * 0.82, y, h.z + az * h.r * 0.82],
          [h.x + bx * h.r * 0.82, y, h.z + bz * h.r * 0.82], 0.03, 0.03, '#6f5a3c', 4, 0.09, rng);
      }
    }
    this._thatchCone(h.x, DECK + h.wall, h.z, h.r * 1.35, h.r * 1.1 + 0.35, 991);
    // the ladder
    const la = h.yaw;
    const lx = h.x + Math.sin(la) * (h.r * 0.95), lz = h.z + Math.cos(la) * (h.r * 0.95);
    for (const s of [-0.22, 0.22]) {
      tube(T, [lx + Math.cos(la) * s + Math.sin(la) * 0.5, this.gy(lx, lz) - 0.15, lz - Math.sin(la) * s + Math.cos(la) * 0.5],
        [lx + Math.cos(la) * s, DECK + 0.15, lz - Math.sin(la) * s], 0.04, 0.035, '#5b4630', 4, 0.07, rng);
    }
    h.roofY = DECK + h.wall + h.r * 1.1 + 0.35;
    h.baseY = base;
  }

  /* ===================================================================== */
  /*  BRAZIERS                                                             */
  /* ===================================================================== */

  _braziers() {
    const rng = this.rng;
    this.glowMat = new THREE.MeshStandardMaterial({
      vertexColors: true, emissive: 0xff7a24, emissiveIntensity: 2.1,
      roughness: 0.55, metalness: 0, toneMapped: false,
    });
    for (let i = 0; i < BRAZIERS.length; i++) {
      const b = BRAZIERS[i];
      const g = this.gy(b.x, b.z);
      const H = 1.44 + rng() * 0.14;
      // three splayed iron legs
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + i;
        tube(this.brazier,
          [b.x + Math.cos(a) * 0.42, g - 0.12, b.z + Math.sin(a) * 0.42],
          [b.x + Math.cos(a) * 0.1, g + H, b.z + Math.sin(a) * 0.1],
          0.045, 0.035, '#3a332c', 5, 0.09, rng);
      }
      // the bowl: an open cylinder with a rolled rim
      const bowl = new THREE.CylinderGeometry(0.6, 0.34, 0.48, 16, 2, true);
      tint(bowl, '#4a4038', 0.1, rng);
      bowl.applyMatrix4(composeMat(b.x, g + H + 0.2, b.z));
      this.brazier.push(bowl.toNonIndexed());
      const rim = new THREE.TorusGeometry(0.6, 0.055, 6, 20);
      rim.rotateX(Math.PI / 2);
      tint(rim, '#55493d', 0.1, rng);
      rim.applyMatrix4(composeMat(b.x, g + H + 0.44, b.z));
      this.brazier.push(rim.toNonIndexed());
      // coals
      const coals = new THREE.CylinderGeometry(0.5, 0.38, 0.13, 14, 1);
      tint(coals, '#ff8a2e', 0.16, rng);
      coals.applyMatrix4(composeMat(b.x, g + H + 0.2, b.z));
      this.glow.push(coals.toNonIndexed());
      // three flame tongues, different heights so the cluster flickers unevenly
      for (let k = 0; k < 3; k++) {
        const a = rng() * 6.28;
        const fh = 0.42 + rng() * 0.34;
        const flame = new THREE.ConeGeometry(0.13 + rng() * 0.05, fh, 6, 2);
        const p = flame.attributes.position;
        for (let v = 0; v < p.count; v++) {
          const f = (p.getY(v) + fh / 2) / fh;
          p.setX(v, p.getX(v) + Math.sin(f * 4 + k) * 0.05 * f);
          p.setZ(v, p.getZ(v) + Math.cos(f * 3.4 + k) * 0.05 * f);
        }
        flame.computeVertexNormals();
        tint(flame, k === 1 ? '#ffd07a' : '#ff9a34', 0.1, rng);
        flame.applyMatrix4(composeMat(
          b.x + Math.cos(a) * 0.16, g + H + 0.3 + fh / 2, b.z + Math.sin(a) * 0.16,
          0, 0, 0));
        this.glow.push(flame.toNonIndexed());
      }
      if (b.light) {
        const l = new THREE.PointLight('#ff8b3c', 9.5, 13, 2);
        l.castShadow = false;
        l.position.set(b.x, g + H + 0.45, b.z);
        this.group.add(l);
        this.lights.push({ light: l, base: 9.5, y: g + H + 0.45, phase: i * 2.1 });
      }
    }
  }

  /* ===================================================================== */
  /*  DRESSING — the working camp                                          */
  /* ===================================================================== */

  _dressing() {
    const rng = this.rng;
    const D = this.dressing;
    const T = this.timber;

    /* drying racks: two frames hung with strips of meat and hide */
    for (const R of [{ x: 20.6, z: 36.6, yaw: 0.5 }, { x: 27.6, z: 30.9, yaw: -0.9 }]) {
      const g = this.gy(R.x, R.z);
      const cs = Math.cos(R.yaw), sn = Math.sin(R.yaw);
      const L = 2.5;
      for (const s of [-1, 1]) {
        const px = R.x + cs * s * L / 2, pz = R.z + sn * s * L / 2;
        tube(T, [px, this.gy(px, pz) - 0.25, pz], [px, g + 1.85, pz], 0.07, 0.055, '#5b4630', 5, 0.08, rng);
        // splayed foot
        tube(T, [px, g + 1.2, pz], [px - sn * 0.45 * s, this.gy(px, pz) - 0.15, pz + cs * 0.45 * s],
          0.045, 0.035, '#4f3d29', 4, 0.08, rng);
      }
      for (const bh of [1.78, 1.42]) {
        tube(T, [R.x - cs * L / 2, g + bh, R.z - sn * L / 2], [R.x + cs * L / 2, g + bh, R.z + sn * L / 2],
          0.035, 0.035, '#66513a', 4, 0.07, rng);
      }
      for (let i = 0; i < 9; i++) {
        const f = (i + 0.5) / 9 - 0.5;
        const sx = R.x + cs * f * L, sz = R.z + sn * f * L;
        const w = 0.14 + rng() * 0.1, hgt = 0.34 + rng() * 0.3;
        const strip = new THREE.PlaneGeometry(w, hgt, 1, 2);
        const p = strip.attributes.position;
        for (let v = 0; v < p.count; v++) p.setZ(v, Math.sin(p.getY(v) * 6 + i) * 0.02);
        strip.computeVertexNormals();
        tint(strip, i % 3 === 0 ? '#6d3128' : i % 3 === 1 ? '#8b4a33' : '#5d4230', 0.14, rng);
        strip.applyMatrix4(composeMat(sx, g + 1.78 - hgt / 2 - 0.03, sz, 0, R.yaw + Math.PI / 2, 0));
        D.push(strip);
      }
    }

    /* tanning frame: a stretched hide on a square of lashed poles */
    {
      const X = 12.2, Z = 35.2, yaw = -0.35;
      const g = this.gy(X, Z);
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const W = 1.75, H = 1.7;
      for (const s of [-1, 1]) {
        const px = X + cs * s * W / 2, pz = Z + sn * s * W / 2;
        tube(T, [px, this.gy(px, pz) - 0.3, pz], [px, g + H, pz], 0.06, 0.05, '#5b4630', 5, 0.08, rng);
      }
      for (const bh of [0.32, H]) {
        tube(T, [X - cs * W / 2, g + bh, Z - sn * W / 2], [X + cs * W / 2, g + bh, Z + sn * W / 2],
          0.04, 0.04, '#66513a', 4, 0.07, rng);
      }
      const hide = new THREE.PlaneGeometry(W * 0.82, H * 0.74, 6, 6);
      const p = hide.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) / (W * 0.82), v = p.getY(i) / (H * 0.74);
        // pull the corners toward the frame, belly the middle
        p.setZ(i, -Math.cos(u * Math.PI) * Math.cos(v * Math.PI) * 0.09);
      }
      hide.computeVertexNormals();
      tint(hide, '#b09068', 0.1, rng);
      hide.applyMatrix4(composeMat(X, g + H * 0.56, Z, 0, yaw + Math.PI / 2, 0));
      this.thatch.push(hide);
      // lashing cords from hide edge to frame
      for (let i = 0; i < 8; i++) {
        const f = (i + 0.5) / 8 - 0.5;
        const s = i % 2 ? 1 : -1;
        tube(D, [X + cs * f * W * 0.82, g + H * 0.56 + s * H * 0.28, Z + sn * f * W * 0.82],
          [X + cs * f * W, g + (s > 0 ? H : 0.32), Z + sn * f * W], 0.012, 0.012, '#c7b48c', 3, 0.1, rng);
      }
    }

    /* water trough: a hollowed log on two stones */
    {
      const X = 24.4, Z = 35.4, yaw = 1.1;
      const g = this.gy(X, Z);
      const log = new THREE.CylinderGeometry(0.3, 0.3, 2.1, 10, 1, false, 0, Math.PI);
      log.rotateZ(Math.PI / 2);
      log.rotateY(yaw);
      tint(log, '#4c3a26', 0.1, rng);
      log.applyMatrix4(composeMat(X, g + 0.42, Z));
      T.push(log.toNonIndexed());
      const water = new THREE.PlaneGeometry(1.75, 0.42).rotateX(-Math.PI / 2);
      tint(water, '#3c5a63', 0.05, rng);
      water.applyMatrix4(composeMat(X, g + 0.5, Z, 0, yaw, 0));
      D.push(water);
      for (const s of [-1, 1]) {
        const st = new THREE.DodecahedronGeometry(0.26, 0);
        tint(st, '#6f6a60', 0.11, rng);
        st.applyMatrix4(composeMat(X + Math.cos(yaw) * s * 0.75, g + 0.1, Z - Math.sin(yaw) * s * 0.75, rng(), rng() * 6.28, rng()));
        D.push(st.toNonIndexed());
      }
    }

    /* the totem: a carved standing post with machine trophies and cord */
    {
      const X = 18.6, Z = 37.2;
      const g = this.gy(X, Z);
      tube(T, [X, g - 0.6, Z], [X + 0.06, g + 2.72, Z - 0.04], 0.145, 0.11, '#4a3826', 8, 0.07, rng);
      for (let i = 0; i < 5; i++) {
        const y = g + 0.5 + i * 0.44;
        const a = i * 1.35;
        const band = new THREE.TorusGeometry(0.155 - i * 0.006, 0.026, 5, 12);
        band.rotateX(Math.PI / 2);
        tint(band, i % 2 ? '#7a4a34' : '#93805c', 0.12, rng);
        band.applyMatrix4(composeMat(X, y, Z));
        D.push(band.toNonIndexed());
        if (i % 2 === 0) {
          const tro = new THREE.BoxGeometry(0.26, 0.17, 0.09, 2, 2, 1);
          tint(tro, '#7e8a92', 0.12, rng);
          tro.applyMatrix4(composeMat(X + Math.cos(a) * 0.26, y - 0.14, Z + Math.sin(a) * 0.26, rng() * 0.3, a, 0.2));
          D.push(tro.toNonIndexed());
        }
      }
      // a cap of antler-like forks
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        tube(D, [X, g + 2.62, Z], [X + Math.cos(a) * 0.4, g + 3.1 + rng() * 0.2, Z + Math.sin(a) * 0.4],
          0.05, 0.028, '#c7b48c', 4, 0.1, rng);
      }
    }

    /* spear stands, herb bundles hanging from a line, and a grinding stone */
    for (const S of [{ x: 18.9, z: 32.6 }, { x: 25.9, z: 31.6 }]) {
      const g = this.gy(S.x, S.z);
      for (const s of [-1, 1]) {
        tube(T, [S.x + s * 0.42, g - 0.2, S.z], [S.x + s * 0.42, g + 1.05, S.z], 0.045, 0.04, '#5b4630', 4, 0.08, rng);
      }
      tube(T, [S.x - 0.5, g + 1.0, S.z], [S.x + 0.5, g + 1.0, S.z], 0.03, 0.03, '#66513a', 4, 0.07, rng);
      for (let i = 0; i < 4; i++) {
        const ox = -0.36 + i * 0.24;
        tube(D, [S.x + ox, g - 0.05, S.z + 0.12], [S.x + ox * 0.72, g + 1.75, S.z - 0.18], 0.022, 0.014, '#6a5138', 4, 0.08, rng);
        const head = new THREE.ConeGeometry(0.045, 0.26, 4);
        tint(head, '#8d949a', 0.1, rng);
        head.applyMatrix4(composeMat(S.x + ox * 0.72, g + 1.87, S.z - 0.19, -0.12, 0, 0.02));
        D.push(head.toNonIndexed());
      }
    }
    {
      // herb line between two hut posts
      const ax = 17.4, az = 33.4, bx = 20.0, bz = 34.8;
      const ay = this.gy(ax, az) + 2.0, by = this.gy(bx, bz) + 1.9;
      tube(D, [ax, ay, az], [bx, by, bz], 0.012, 0.012, '#c7b48c', 3, 0.1, rng);
      for (let i = 0; i < 6; i++) {
        const f = (i + 0.6) / 7;
        const hx = ax + (bx - ax) * f, hz = az + (bz - az) * f;
        const hy = ay + (by - ay) * f - Math.sin(f * Math.PI) * 0.12;
        const bundle = new THREE.ConeGeometry(0.08, 0.34, 5);
        tint(bundle, i % 2 ? '#5f7a3a' : '#7b8a45', 0.14, rng);
        bundle.applyMatrix4(composeMat(hx, hy - 0.2, hz, Math.PI, rng() * 6.28, 0));
        D.push(bundle.toNonIndexed());
      }
    }
    {
      const X = 23.6, Z = 26.9;
      const g = this.gy(X, Z);
      const stone = new THREE.CylinderGeometry(0.46, 0.5, 0.22, 14, 1);
      roughen(stone, this.noise, 0.03, 2.2, 4);
      tint(stone, '#736d62', 0.1, rng);
      stone.applyMatrix4(composeMat(X, g + 0.12, Z));
      D.push(stone.toNonIndexed());
      const muller = new THREE.SphereGeometry(0.14, 8, 6);
      tint(muller, '#5f5a51', 0.1, rng);
      muller.applyMatrix4(composeMat(X + 0.14, g + 0.26, Z - 0.08, 0, 0, 0, 1, 0.7, 1));
      D.push(muller.toNonIndexed());
    }

    /* trampled ground: a merged decal that ties the huts to the fire */
    this._paths();
  }

  /** Worn dirt lanes fire -> gate and fire -> each hut, conforming to ground. */
  _paths() {
    const rng = this.rng;
    const geos = [];
    const ends = [];
    if (this.gate) ends.push({ x: this.gate.x, z: this.gate.z, w: 1.5 });
    for (const h of this.huts) ends.push({ x: h.x, z: h.z, w: 1.0 });
    for (const e of ends) {
      const dx = e.x - FIRE_X, dz = e.z - FIRE_Z;
      const len = Math.hypot(dx, dz);
      if (len < 2) continue;
      const ux = dx / len, uz = dz / len;
      const segs = Math.max(4, Math.round(len / 1.4));
      const pos = [], col = [], idx = [];
      const c = new THREE.Color('#5b4a34');
      for (let i = 0; i <= segs; i++) {
        const f = i / segs;
        const cx = FIRE_X + ux * (2.4 + (len - 3.2) * f);
        const cz = FIRE_Z + uz * (2.4 + (len - 3.2) * f);
        const wob = this.noise.noise2D(cx * 0.16, cz * 0.16) * 0.55;
        const w = (e.w + wob * 0.3) * (1 - 0.35 * Math.abs(f - 0.5) * 2);
        for (const s of [-1, 1]) {
          const px = cx - uz * (w * s) + uz * wob * 0.4;
          const pz = cz + ux * (w * s) + ux * wob * 0.4;
          pos.push(px, this.gy(px, pz) + 0.045, pz);
          const k = 0.85 + rng() * 0.3;
          col.push(c.r * k, c.g * k, c.b * k);
        }
      }
      for (let i = 0; i < segs; i++) {
        const a = i * 2, b = a + 1, cq = a + 2, d = a + 3;
        idx.push(a, cq, b, b, cq, d);
      }
      const g = new THREE.BufferGeometry();
      g.setIndex(idx);
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      g.computeVertexNormals();
      geos.push(g.toNonIndexed());
    }
    if (!geos.length) return;
    const mesh = bake(geos, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }), { name: 'camp-paths', castShadow: false });
    if (mesh) {
      // a ground decal must never become a collider or an occluder
      mesh.raycast = () => {};
      this.group.add(mesh);
    }
  }

  /* ===================================================================== */

  _bake() {
    const mats = materials();
    const timberMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.93, metalness: 0,
    });
    const thatchMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.94, metalness: 0, side: THREE.DoubleSide,
      emissive: '#3d2010', emissiveIntensity: 0.4,
    });
    // palisade + frames share one material, so they share one mesh: a second
    // mesh would cost a main draw and three shadow draws for nothing.
    const timberAll = this.palisade.concat(this.timber);
    const out = [
      ['camp-palisade', timberAll, timberMat, true],
      ['camp-thatch', this.thatch, thatchMat, true],
      ['camp-dressing', this.dressing, mats.hide, false],
      ['camp-banners', this.banners, thatchMat, false],
      ['camp-brazier', this.brazier, mats.metal, false],
      ['camp-brazier-glow', this.glow, this.glowMat, false],
    ];
    this.meshes = [];
    for (const [name, geos, mat, cast] of out) {
      const m = bake(geos, mat, { name, castShadow: cast });
      if (!m) continue;
      // hanging cloth: shadows yes, collision no (the seeder skips any mesh
      // that owns its own `raycast`, which is the signal we want here)
      if (name === 'camp-banners') m.raycast = () => {};
      this.group.add(m);
      this.meshes.push(m);
    }
    this.palisade = this.timber = this.thatch = this.dressing = this.banners = this.brazier = this.glow = null;
  }
}
