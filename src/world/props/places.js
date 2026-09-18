import * as THREE from 'three';
import {
  SimplexNoise, mulberry32, composeMat, tint, paintRust, paintConcrete, paintRock,
  rustTube, tube, bake, materials, roughen,
} from './kit.js';

/**
 * ROUND 4 — lane `world-props`, EXPANSION wave.
 *
 * Kevin's directive for this wave was "more environments and interactable areas
 * in the playable radius". Round 4 wave 2 gave the valley landmarks you could
 * SEE (`megastructures.js`, `tallneck.js`, `rockworks.js`); what it did not
 * give it was places you could BE. This module adds six, each built to the same
 * three-part bar:
 *
 *   1. a LANDMARK SILHOUETTE  — something 12 m+ that answers a bearing from
 *      150-300 m out, so `V34-midground` gets stronger rather than merely
 *      staying green;
 *   2. SPACE — colliders and occluders, so the place shapes movement and
 *      machine line-of-sight instead of being a painting you walk through;
 *   3. THINGS TO DO — at least two `ctx.interactables` entries and one
 *      progression hook per place.
 *
 * | id                  | name                 | x, z       | silhouette        |
 * |---------------------|----------------------|------------|-------------------|
 * | `outpost-ridgeback` | Ridgeback Outpost    | -112, 245  | 15.1 m watch-post |
 * | `cauldron-kappa`    | Cauldron KAPPA       | 150, 168   | 19.4 m vent stack |
 * | `hunting-arena`     | Ridge Trial Ground   | 132, -82   | 17.5 m banner mast|
 * | `caves-glowfall`    | Glowfall Caves       | -60, -245  | 21 m rock spire   |
 * | `lakeshore-camp`    | Slackwater Camp      | -93, 50    | 10.4 m drying mast|
 * | `tallneck-wreck`    | The Fallen Watcher   | -172, -78  | 17.6 m disc edge  |
 *
 * Plus, outside the six: four crossings of the dried river channel (three rope
 * bridges — one of them the lakeshore camp's — and a plank walk), twelve ruin
 * clutter spots, and two more wildlife species in `fauna.js` (Ridge Goat,
 * Scrub Hare).
 *
 * ---------------------------------------------------------------- COLLISION
 *
 * This group is added as a CHILD OF `world-props`, not to the scene, and that
 * is deliberate. `collision.seedWorld()` walks `world-props` mesh by mesh and
 * builds a triangle-exact `MeshBVH` for each one (see docs/ROUND4-SPATIAL.md
 * §1), and `Props` is constructed inside `Vegetation`, which runs before
 * `installSpatial` — so every mesh here becomes a blocking, occluding, camera
 * collider for free, with the geometry the player can actually see. Registering
 * them a second time from `Props.registerColliders()` would double-count them
 * and make `A61`'s identity check ambiguous, so this module registers NOTHING
 * with `ctx.collision` itself. The only meshes the seeder skips are the ones
 * that own a `raycast` — the emissive glow shells — which is exactly right: a
 * fungus bloom is not a wall.
 *
 * ------------------------------------------------------------------ LIGHTING
 *
 * An interior needs light and lights are the most expensive thing a lane can
 * add: three.js compiles `NUM_POINT_LIGHTS` into every standard material in the
 * scene, so a per-site `PointLight` is a per-fragment cost paid by the whole
 * valley whether or not you are anywhere near it. So interiors here are lit
 * TWICE and dynamically only once:
 *
 *   - BAKED. `bakeVertexLight()` multiplies the warm/cold falloff of each
 *     emitter into the vertex colours of the geometry around it, at build time,
 *     for zero frames of runtime cost. This is what makes the cauldron chamber
 *     and the caves readable.
 *   - ONE SHARED POINT LIGHT. A single shadow-free `PointLight` follows the
 *     player and snaps to whichever emitter she is nearest, fading in over
 *     0.4 s. Six lit places, one light in the shader.
 *
 * ------------------------------------------------------------------- MEMORY
 *
 * The app has crashed on memory this round, so every object built here has a
 * dispose path: geometry is merged through `kit.bake()` (which disposes its
 * sources), one mesh per place per material family, materials are the shared
 * `kit.materials()` singletons plus three module-owned emissive materials, and
 * `dispose()` tears down meshes, geometries, the module materials, the light,
 * every `ctx.interactables` entry and every event listener. Nothing here
 * allocates after construction: `update()` walks a fixed array of emitters and
 * a fixed array of places with no `new`.
 */

/* -------------------------------------------------------------------------- */
/*                                  PLACE DATA                                 */
/* -------------------------------------------------------------------------- */

/**
 * `kind` is read by `machine-ai` (patrol/avoid weighting) and `progression`
 * (discovery labels). `radius` is the "you are here" radius: entering it once
 * fires `progression.discover()` and the `place-discovered` event.
 */
export const PLACES = [
  {
    id: 'outpost-ridgeback', name: 'Ridgeback Outpost', kind: 'settlement',
    x: -112, z: 245, radius: 26,
    blurb: 'A Nora forward post on the north shelf: palisade, three huts, a watch-post.',
  },
  {
    id: 'cauldron-kappa', name: 'Cauldron KAPPA', kind: 'cauldron',
    x: 150, z: 168, radius: 30,
    blurb: 'A buried machine foundry. The service corridor is still open.',
  },
  {
    id: 'hunting-arena', name: 'Ridge Trial Ground', kind: 'hunting',
    x: 132, z: -82, radius: 28,
    blurb: 'A Nora proving ring: trial board, target dummies, a 17 m banner mast.',
  },
  {
    id: 'caves-glowfall', name: 'Glowfall Caves', kind: 'cave',
    /**
     * (-60, -245), not the first draft's (-44, -214): that put a 40 m rock
     * massif 21 m from the Tank Farm landmark, so the two silhouettes ate each
     * other and the south vista lost the clean read the caves were placed to
     * give it. Measured over eight candidates for tree count, local relief and
     * distance to the nearest existing landmark; this one is 0 trees inside
     * 26 m, 8 m of relief to cut the mouths into, no stealth grass, and 55 m
     * clear of the tanks. Bearing 189 deg / 268 m from the spawn vista — the
     * middle of the south frame, inside V34's 150-300 m band.
     */
    x: -60, z: -245, radius: 24,
    blurb: 'Two mouths in a rock massif, lit blue-green by the fungus inside.',
  },
  {
    id: 'lakeshore-camp', name: 'Slackwater Camp', kind: 'camp',
    x: -93, z: 50, radius: 22,
    blurb: 'A fishing camp on the deep pool, with a rope bridge to the west bank.',
  },
  {
    id: 'tallneck-wreck', name: 'The Fallen Watcher', kind: 'wreck',
    /**
     * (-172, -78): the first draft sat 34 m off the Cooling Stack and the two
     * silhouettes cancelled — a 17 m disc on edge in front of a 34 m tower reads
     * as part of the tower. Moved 56 m clear; bearing 237 deg / 181 m from the
     * spawn vista, which is the inside edge of the west frame and the part of it
     * the mast and the dish do not already answer.
     */
    x: -172, z: -78, radius: 26,
    blurb: 'A Tallneck down on its side. The head shell is open; something inside still runs.',
  },
];

/** Dried-channel crossings. `z` picks the station; the builder finds the banks. */
const CROSSINGS = [
  { id: 'crossing-north', z: 170, kind: 'rope' },
  { id: 'crossing-mid', z: 100, kind: 'rope' },
  { id: 'crossing-south', z: -60, kind: 'plank' },
];

/** Old-World records this wave adds, placed through `focus-items`' store. */
const RECORDS = [
  {
    id: 'dp-cauldron-1', x: 0, z: 0, category: 'machine',
    author: 'FOUNDRY CONTROL · KAPPA, MAINTENANCE BAY',
    title: 'FOUNDRY LOG — KAPPA',
    body: ['Line three is still casting. Nobody signed the order and nobody can '
      + 'stop it. The pour clock says four hundred and eleven days.'],
  },
  {
    id: 'dp-caves-1', x: 0, z: 0, category: 'nora',
    author: 'PAINTED ON THE CAVE WALL IN OCHRE',
    title: 'THE GLOWFALL',
    body: ['The blue light is not fire and it does not burn. Eat none of it. '
      + 'Sleep here when the storm comes and be gone before the herd moves.'],
  },
  {
    id: 'dp-outpost-1', x: 0, z: 0, category: 'nora',
    author: 'NOTCHED TALLY POST · RIDGEBACK',
    title: 'RIDGEBACK TALLY',
    body: ['Nine hunters up, seven down. The shelf is ours while the fire is lit. '
      + 'Whoever holds the post holds the north road.'],
  },
  {
    id: 'dp-wreck-1', x: 0, z: 0, category: 'machine',
    author: 'SALVAGED RELAY SHELL · STILL POWERED',
    title: 'WATCHER DOWN',
    body: ['Survey unit nine went over in the night. No fault code. The disc is '
      + 'still turning under the dirt and the relay is still asking for a route.'],
  },
];

const _v = new THREE.Vector3();
const _c = new THREE.Color();

/* -------------------------------------------------------------------------- */
/*                              SHARED MATERIALS                               */
/* -------------------------------------------------------------------------- */

let _pm = null;
/**
 * The three emissive families this wave draws with. Lazy, shared across all six
 * places (so the renderer sorts them into one state bucket each) and released
 * by `disposePlaceMaterials()` from `Places.dispose()`.
 */
export function placeMaterials() {
  if (_pm) return _pm;
  _pm = {
    /** Fire, embers, brazier coals — warm. */
    ember: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.85, metalness: 0,
      emissive: new THREE.Color('#ff7420'), emissiveIntensity: 1.9,
    }),
    /** Glow-fungus and the cave blooms — cold blue-green. */
    fungus: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.92, metalness: 0,
      emissive: new THREE.Color('#4cffcf'), emissiveIntensity: 1.25,
    }),
    /** Old-World interface glass: terminals, strip lights, the relay core. */
    holo: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.38, metalness: 0.12,
      emissive: new THREE.Color('#87e4ff'), emissiveIntensity: 2.0,
      side: THREE.DoubleSide,
    }),
  };
  return _pm;
}

export function disposePlaceMaterials() {
  if (!_pm) return;
  for (const m of Object.values(_pm)) m.dispose();
  _pm = null;
}

/* -------------------------------------------------------------------------- */
/*                               GEOMETRY HELPERS                              */
/* -------------------------------------------------------------------------- */

/**
 * Bake a static light rig into vertex colours, in WORLD space.
 *
 * Call it on a list of geometries that have already had their matrices applied,
 * just before they go into a merge bucket. `ambient` is the floor the geometry
 * keeps where no emitter reaches (interiors sit below 1 so they read as shade);
 * each emitter adds `strength * range^2 / (d^2 + range^2)`, an inverse-square
 * falloff that never divides by zero.
 *
 * This is the reason the cauldron chamber and the caves are readable without
 * six `PointLight`s in every material in the valley — see the header.
 */
function bakeVertexLight(geos, lights, ambient = 1) {
  for (const g of geos) {
    const p = g.attributes.position;
    const c = g.attributes.color;
    if (!p || !c) continue;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let lr = ambient, lg = ambient, lb = ambient;
      for (let k = 0; k < lights.length; k++) {
        const L = lights[k];
        const dx = x - L.x, dy = y - L.y, dz = z - L.z;
        const f = (L.range * L.range) / (dx * dx + dy * dy + dz * dz + L.range * L.range) * L.strength;
        lr += L.r * f; lg += L.g * f; lb += L.b * f;
      }
      /**
       * Clamped at 1.7, not 2.2. The first bake of the Glowfall chamber ran
       * nine fungus emitters at strength 1.15 into a 0.6 ambient and every
       * surface pinned at the ceiling: the shot came back as a white-green
       * room with no readable rock in it at all. A bake is a GRADIENT, not a
       * fill — it has to leave shade for the emissive blooms to read against.
       */
      c.setXYZ(i,
        Math.min(1.7, c.getX(i) * lr),
        Math.min(1.7, c.getY(i) * lg),
        Math.min(1.7, c.getZ(i) * lb));
    }
    c.needsUpdate = true;
  }
}

/** An emitter record for `bakeVertexLight`, from a hex colour. */
function emitter(x, y, z, color, range, strength) {
  _c.set(color);
  return { x, y, z, r: _c.r, g: _c.g, b: _c.b, range, strength };
}

/** Plain box, tinted, transformed into world space. */
function box(list, x, y, z, w, h, d, color, rng, yaw = 0, jitter = 0.07, segs = null) {
  const sx = segs ? Math.max(1, Math.round(w / segs)) : 1;
  const sz = segs ? Math.max(1, Math.round(d / segs)) : 1;
  const g = new THREE.BoxGeometry(w, h, d, sx, 1, sz);
  tint(g, color, jitter, rng);
  g.applyMatrix4(composeMat(x, y, z, 0, yaw, 0));
  list.push(g);
  return g;
}

/** Rusted old-world plate: same as `box` but painted with the rust painter. */
function plate(list, x, y, z, w, h, d, seed, noise, yaw = 0, pitch = 0, segs = 1.4) {
  const g = new THREE.BoxGeometry(w, h, d,
    Math.max(1, Math.round(w / segs)), 1, Math.max(1, Math.round(d / segs)));
  paintRust(g, seed, noise, 1.4);
  g.applyMatrix4(composeMat(x, y, z, pitch, yaw, 0));
  list.push(g);
  return g;
}

/** Weathered concrete slab. */
function slab(list, x, y, z, w, h, d, seed, noise, yaw = 0, segs = 1.6) {
  const g = new THREE.BoxGeometry(w, h, d,
    Math.max(1, Math.round(w / segs)), 1, Math.max(1, Math.round(d / segs)));
  paintConcrete(g, seed, noise, 0.8);
  g.applyMatrix4(composeMat(x, y, z, 0, yaw, 0));
  list.push(g);
  return g;
}

/** A crate: five planks and two bands, cheap and readable at 20 m. */
function crate(list, bands, x, y, z, s, color, rng, yaw = 0) {
  box(list, x, y + s * 0.5, z, s, s, s * 0.92, color, rng, yaw, 0.1);
  for (const dy of [s * 0.24, s * 0.76]) {
    box(bands, x, y + dy, z, s * 1.04, s * 0.09, s * 0.96, '#3a3026', rng, yaw, 0.12);
  }
}

/** A catenary rope from a to b, sagging by `sag` metres at mid-span. */
function rope(list, a, b, sag, r, color, rng, steps = 8) {
  let px = a[0], py = a[1], pz = a[2];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const s = Math.sin(t * Math.PI);
    const qx = a[0] + (b[0] - a[0]) * t;
    const qy = a[1] + (b[1] - a[1]) * t - sag * s;
    const qz = a[2] + (b[2] - a[2]) * t;
    tube(list, [px, py, pz], [qx, qy, qz], r, r, color, 4, 0.08, rng);
    px = qx; py = qy; pz = qz;
  }
}

/* -------------------------------------------------------------------------- */
/*                                   PLACES                                    */
/* -------------------------------------------------------------------------- */

export class Places {
  /**
   * @param {object} ctx the game context
   * @param {object} props the owning `Props` instance (for terrain + activities)
   */
  constructor(ctx, props) {
    this.ctx = ctx;
    this.props = props;
    this.noise = new SimplexNoise(0x9A11);
    this.group = new THREE.Group();
    this.group.name = 'world-places';

    /** @type {object[]} the published place records (`ctx.props.places`) */
    this.places = PLACES.map((p) => ({
      ...p,
      y: ctx.terrain.getHeight(p.x, p.z),
      position: new THREE.Vector3(p.x, ctx.terrain.getHeight(p.x, p.z), p.z),
      discovered: false,
      interactables: [],
    }));
    this.byId = new Map(this.places.map((p) => [p.id, p]));

    /** @type {object[]} NPC anchor slots the `npc` lane fills (see §NPC). */
    this.npcSlots = [];
    /** @type {object[]} climbable grab edges this module adds to `props.ledges` */
    this.ledges = [];
    /** @type {object[]} one entry per lit emitter; the shared light picks from these */
    this.emitters = [];
    /** @type {object[]} live `ctx.interactables` entries, for `dispose()` */
    this.entries = [];
    /** @type {THREE.Mesh[]} every mesh this module owns */
    this.meshes = [];
    /** @type {object[]} record definitions handed to `focus-items` */
    this.records = RECORDS.map((r) => ({ ...r }));

    this._registered = false;
    this._recordsPlaced = false;
    this._lightT = 0;
    this._lightOn = null;

    this._buildOutpost();
    this._buildCauldron();
    this._buildArena();
    this._buildCaves();
    this._buildLakeshore();
    this._buildWreck();
    this._buildCrossings();
    this._buildClutter();

    /**
     * ONE shadow-free `PointLight` for six lit places — see the header. It is
     * added once, never removed, so `NUM_POINT_LIGHTS` never changes and no
     * material ever recompiles mid-frame.
     */
    this.light = new THREE.PointLight(0xffb066, 0, 34, 2);
    this.light.castShadow = false;
    this.light.name = 'place-light';
    this.group.add(this.light);

    // child of `world-props`, so `collision.seedWorld()` BVHs every mesh here
    (props.group ?? ctx.scene).add(this.group);
  }

  gy(x, z) { return this.ctx.terrain.getHeight(x, z); }

  /**
   * Push a baked mesh into the group, remember it for `dispose()`, and give it
   * a DRAW DISTANCE.
   *
   * `showDist` is the metres beyond which this mesh stops being submitted at
   * all. It exists because of a measurement: with every mesh always drawn, this
   * lane put `A9-perf-budget` one call over its 350 budget (351) at the spawn
   * vista — six places, four crossings and twelve clutter spots are a lot of
   * merged meshes and most of them are 150-280 m away, where a 3 m hut is four
   * pixels. The mesh that carries each place's LANDMARK keeps `Infinity`,
   * because `V34-midground` needs those silhouettes at 150-300 m; everything
   * else fades out of the submission list and comes back as you approach.
   *
   * `noSizeCull` is set so `engine._cullPass` leaves `visible` alone — the
   * engine's screen-space cull writes the same flag, and two owners of one
   * boolean is a flicker waiting to happen.
   */
  _mesh(geos, mat, name, opts = {}) {
    const { showDist = Infinity, ...rest } = opts;
    const m = bake(geos, mat, { name, ...rest });
    if (!m) return null;
    m.userData.noSizeCull = true;
    const bs = m.geometry.boundingSphere;
    m.userData.showDist = showDist;
    m.userData.cx = bs ? bs.center.x : 0;
    m.userData.cy = bs ? bs.center.y : 0;
    m.userData.cz = bs ? bs.center.z : 0;
    m.userData.br = bs ? bs.radius : 0;
    this.group.add(m);
    this.meshes.push(m);
    return m;
  }

  /**
   * Bake a place's five buckets into at most five meshes.
   * `glow` meshes own a `raycast` so neither `collision.seedWorld()` nor
   * `A61`'s identity check treats a light bloom as a wall.
   */
  /**
   * Bake a place into at most THREE solid meshes and three emissive ones.
   *
   * Timber and hide share the `matte` mesh. They used to be two — `matte` and
   * `hide` — and the only difference between those two kit materials is 0.04 of
   * roughness and a `side` flag that `matte` now also carries (see the
   * DoubleSide note in kit.js). Two meshes per place for that is one main draw
   * and up to three shadow draws each, and this lane was one call over
   * `A9-perf-budget`. One family, one mesh, no visible difference.
   *
   * `landmark` names the family carrying the silhouette `V34-midground` needs
   * at 150-300 m; that one mesh is never distance-gated.
   */
  _bakePlace(id, B, { castShadow = true, landmark = null, near = 145, glowNear = 95 } = {}) {
    const M = materials();
    const P = placeMaterials();
    const dist = (fam) => (fam === landmark ? Infinity : near);
    this._mesh([...B.wood, ...B.hide], M.matte, `places-${id}-timber`,
      { castShadow, showDist: dist('matte') });
    this._mesh(B.stone, M.rock, `places-${id}-stone`,
      { castShadow, showDist: dist('stone') });
    this._mesh(B.metal, M.metal, `places-${id}-metal`,
      { castShadow, showDist: dist('metal') });
    for (const [key, mat] of [['ember', P.ember], ['fungus', P.fungus], ['holo', P.holo]]) {
      const g = this._mesh(B[key], mat, `places-${id}-${key}`,
        { castShadow: false, showDist: glowNear });
      if (g) g.raycast = () => {};
    }
  }

  /** A fresh bucket set. */
  static buckets() {
    return { wood: [], stone: [], metal: [], hide: [], ember: [], fungus: [], holo: [] };
  }

  /* ====================================================================== */
  /*  1. RIDGEBACK OUTPOST — the second settlement on the north shelf       */
  /* ====================================================================== */

  /**
   * `world-12` asked for a settlement; the audit's expansion asks for a SECOND
   * one, so this is deliberately not a copy of the hunter camp. The camp is a
   * bowl village behind a full ring; this is a forward post on a shelf: a
   * three-quarter palisade with its open side against the drop, three huts, a
   * brazier that is the only fire for 200 m, and a 15 m watch-post that is the
   * landmark answering the north bearing from the spawn vista at 243 m.
   */
  _buildOutpost() {
    const P = this.byId.get('outpost-ridgeback');
    const X = P.x, Z = P.z, g0 = P.y;
    const rng = mulberry32(0x0475);
    const N = this.noise;
    const B = Places.buckets();
    const WOOD = '#6a5338', DARK = '#493825', HIDE = '#897355', ROPE = '#7d6c4b';

    /**
     * PALISADE. A palisade is a WALL, not a fence, and the first pass here
     * proved it on film: 74 posts on a 16 m ring is 1.36 m of air between every
     * pair of 0.32 m logs, and shot from inside it read as grey scaffolding
     * with a view straight through to the mountains. `settlement.js` already
     * solved this for the hunter camp and the fix is the same: step by ARC
     * LENGTH (0.235 m) rather than by angle, 0.175 m logs on SIX radial
     * segments (five leaves an inradius of 0.81r and a visible slot between
     * every pair), a sharpened last 30 cm rather than a tapered whole shaft,
     * and the warm five-tone wood palette that camp is built from — measured
     * against that camp, this one was a full step cooler and read as steel.
     */
    const R = 16;
    const GAP_A = -2.36, GAP_W = 0.30;          // the gate, facing the camp
    const WOODS = ['#796041', '#6a5338', '#856a47', '#71583c', '#7f6443'];
    const STEP = 0.235, R_POST = 0.175;
    /**
     * Angular distance from the gate bearing, wrapped into (-pi, pi].
     *
     * The first version of this line was copied from the hunter camp's
     * `radiusAt`/`gateAt` pair and read `|((a - GAP_A + 3pi) mod 2pi) - pi| >
     * pi - GAP_W`, which is the test for being OPPOSITE the gate. The wall
     * therefore sealed the gate and opened a hole on the far side, and the
     * V43 probe found timber dead centre in the opening at 15.8 m. One sign,
     * measured rather than argued: `probe(GAP_A)` now passes a swept capsule
     * and every other bearing stops one.
     */
    const inGate = (a) => {
      const d = ((a - GAP_A + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      return Math.abs(d) < GAP_W;
    };
    let posts = 0;
    for (let a = 0, i = 0; a < Math.PI * 2; i++) {
      if (!inGate(a)) {
        const rr = R + (rng() - 0.5) * 0.1;
        const px = X + Math.cos(a) * rr, pz = Z + Math.sin(a) * rr;
        const py = this.gy(px, pz);
        // height wanders in slow courses, not per post: a crew built this
        const h = 2.7 + 0.28 * Math.sin(a * 3.1) + 0.16 * Math.sin(a * 11.7) + rng() * 0.16;
        const lean = (rng() - 0.5) * 0.07;
        const rp = R_POST + rng() * 0.022;
        const col = WOODS[i % WOODS.length];
        const tipY = h - 0.3;
        tube(B.wood, [px, py - 0.6, pz],
          [px + Math.cos(a) * lean * 0.7, py + tipY, pz + Math.sin(a) * lean * 0.7],
          rp, rp * 0.95, col, 6, 0.1, rng);
        tube(B.wood, [px + Math.cos(a) * lean * 0.7, py + tipY, pz + Math.sin(a) * lean * 0.7],
          [px + Math.cos(a) * lean, py + h, pz + Math.sin(a) * lean],
          rp * 0.95, 0.035, col, 6, 0.1, rng);
        posts++;
      }
      a += STEP / R;
    }
    this.palisadePosts = posts;
    // one inner bind rail + a fighting step on the two bearings that face out
    for (let a = 0, i = 0; a < Math.PI * 2; i++, a += 1.6 / R) {
      const a2 = a + 1.6 / R;
      if (inGate(a) || inGate(a2)) continue;
      const ax = X + Math.cos(a) * (R - 0.24), az = Z + Math.sin(a) * (R - 0.24);
      const bx = X + Math.cos(a2) * (R - 0.24), bz = Z + Math.sin(a2) * (R - 0.24);
      tube(B.wood, [ax, this.gy(ax, az) + 1.85, az], [bx, this.gy(bx, bz) + 1.85, bz],
        0.075, 0.075, '#5a452e', 5, 0.09, rng);
      if (i % 3 === 0) {
        tube(B.wood, [ax, this.gy(ax, az) - 0.2, az], [ax, this.gy(ax, az) + 1.9, az],
          0.07, 0.06, '#4f3c28', 5, 0.08, rng);
      }
    }
    // gate posts: two heavy trunks and a lintel, so the opening reads as a gate
    {
      const ga = GAP_A;
      for (const s of [-1, 1]) {
        const a = ga + s * GAP_W * 1.02;
        const px = X + Math.cos(a) * R, pz = Z + Math.sin(a) * R;
        const py = this.gy(px, pz);
        tube(B.wood, [px, py - 0.4, pz], [px, py + 4.1, pz], 0.3, 0.24, DARK, 7, 0.07, rng);
        const skull = new THREE.IcosahedronGeometry(0.3, 0);
        tint(skull, '#cec2a5', 0.08, rng);
        skull.applyMatrix4(composeMat(px, py + 4.3, pz, 0.2, rng() * 6, 0, 1, 1.25, 1.1));
        B.wood.push(skull);
      }
      const ax = X + Math.cos(ga - GAP_W * 0.92) * R, az = Z + Math.sin(ga - GAP_W * 0.92) * R;
      const bx = X + Math.cos(ga + GAP_W * 0.92) * R, bz = Z + Math.sin(ga + GAP_W * 0.92) * R;
      const ly = Math.max(this.gy(ax, az), this.gy(bx, bz)) + 3.9;
      tube(B.wood, [ax, ly, az], [bx, ly, bz], 0.17, 0.17, WOOD, 5, 0.07, rng);
      // hanging hide banners on the lintel
      for (let i = 0; i < 3; i++) {
        const t = 0.25 + i * 0.25;
        const hx = ax + (bx - ax) * t, hz = az + (bz - az) * t;
        const ban = new THREE.PlaneGeometry(0.7, 1.5, 2, 3);
        const p = ban.attributes.position;
        for (let v = 0; v < p.count; v++) p.setZ(v, Math.sin(p.getX(v) * 3 + i) * 0.07);
        ban.computeVertexNormals();
        tint(ban, i === 1 ? '#8a3a2a' : '#3e5c6a', 0.12, rng);
        ban.applyMatrix4(composeMat(hx, ly - 0.85, hz, 0, Math.atan2(bz - az, bx - ax), 0));
        B.hide.push(ban);
      }
    }

    /* ---------------------------- three huts ---------------------------- */
    const huts = [
      { a: 0.75, r: 8.5, kind: 'round' },
      { a: 1.95, r: 9.2, kind: 'aframe' },
      { a: 3.45, r: 8.0, kind: 'lean' },
    ];
    this.outpostHuts = [];
    for (let i = 0; i < huts.length; i++) {
      const H = huts[i];
      const hx = X + Math.cos(H.a) * H.r, hz = Z + Math.sin(H.a) * H.r;
      const hy = this.gy(hx, hz);
      const yaw = Math.atan2(Z - hz, X - hx);     // doors face the fire
      this.outpostHuts.push({ id: `ridgeback-hut-${i}`, x: hx, z: hz, baseY: hy, kind: H.kind });
      if (H.kind === 'round') {
        // ring of posts + a thatch cone
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const px = hx + Math.cos(a) * 2.3, pz = hz + Math.sin(a) * 2.3;
          tube(B.wood, [px, this.gy(px, pz) - 0.2, pz], [px, hy + 2.0, pz], 0.1, 0.08, WOOD, 4, 0.1, rng);
        }
        const cone = new THREE.ConeGeometry(2.95, 2.2, 12, 3);
        tint(cone, HIDE, 0.11, rng);
        cone.applyMatrix4(composeMat(hx, hy + 3.05, hz, 0, rng(), 0));
        B.hide.push(cone);
        // roof binding
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          tube(B.wood, [hx + Math.cos(a) * 2.9, hy + 2.0, hz + Math.sin(a) * 2.9],
            [hx, hy + 4.1, hz], 0.05, 0.03, DARK, 4, 0.1, rng);
        }
      } else if (H.kind === 'aframe') {
        const L = 5.0, W = 3.4, Hh = 3.1;
        for (const s of [-1, 1]) {
          const panel = new THREE.PlaneGeometry(L, Math.hypot(W / 2, Hh), 4, 3);
          tint(panel, HIDE, 0.1, rng);
          panel.applyMatrix4(composeMat(
            hx + Math.cos(yaw + Math.PI / 2) * s * W * 0.25,
            hy + Hh * 0.5,
            hz + Math.sin(yaw + Math.PI / 2) * s * W * 0.25,
            0, yaw, 0));
          const m2 = composeMat(hx, hy, hz).invert();
          panel.applyMatrix4(m2);
          panel.applyMatrix4(composeMat(0, 0, 0, 0, 0, s * 0.82));
          panel.applyMatrix4(composeMat(hx, hy, hz));
          B.hide.push(panel);
        }
        // ridge pole + end posts
        const rx = Math.cos(yaw), rz = Math.sin(yaw);
        tube(B.wood, [hx - rx * L / 2, hy + Hh, hz - rz * L / 2],
          [hx + rx * L / 2, hy + Hh, hz + rz * L / 2], 0.1, 0.1, DARK, 5, 0.07, rng);
        for (const s of [-1, 1]) {
          tube(B.wood, [hx + rx * s * L / 2, hy - 0.2, hz + rz * s * L / 2],
            [hx + rx * s * L / 2, hy + Hh, hz + rz * s * L / 2], 0.11, 0.09, WOOD, 5, 0.08, rng);
        }
      } else {
        // lean-to: a sloped hide roof on four posts, open downhill
        const W = 3.6, D = 3.0;
        const cx = Math.cos(yaw), cz = Math.sin(yaw);
        const px = -cz, pz2 = cx;
        for (const [su, sv, ph] of [[-1, -1, 2.6], [1, -1, 2.6], [-1, 1, 1.5], [1, 1, 1.5]]) {
          const ox = hx + px * su * W / 2 + cx * sv * D / 2;
          const oz = hz + pz2 * su * W / 2 + cz * sv * D / 2;
          tube(B.wood, [ox, this.gy(ox, oz) - 0.2, oz], [ox, hy + ph, oz], 0.1, 0.08, WOOD, 5, 0.08, rng);
        }
        const roof = new THREE.PlaneGeometry(W + 0.5, D + 0.6, 4, 3);
        const rp = roof.attributes.position;
        for (let v = 0; v < rp.count; v++) rp.setZ(v, rp.getZ(v) + Math.sin(rp.getX(v) * 2.2) * 0.06);
        roof.computeVertexNormals();
        tint(roof, '#8a7957', 0.11, rng);
        roof.applyMatrix4(composeMat(hx, hy + 2.05, hz, -Math.PI / 2 + 0.36, yaw, 0));
        B.hide.push(roof);
      }
    }

    /* --------------------- brazier: the outpost's fire ------------------- */
    const bx = X + 1.2, bz = Z - 1.4, by = this.gy(bx, bz);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      tube(B.wood, [bx + Math.cos(a) * 0.8, by - 0.15, bz + Math.sin(a) * 0.8],
        [bx, by + 1.05, bz], 0.09, 0.06, DARK, 5, 0.09, rng);
    }
    {
      const bowl = new THREE.CylinderGeometry(0.78, 0.5, 0.52, 12, 1, true);
      paintRust(bowl, 9100, N, 0.6);
      bowl.applyMatrix4(composeMat(bx, by + 1.3, bz));
      B.metal.push(bowl);
      const coals = new THREE.SphereGeometry(0.62, 10, 5, 0, 6.283, 0, 1.1);
      tint(coals, '#ff9a3c', 0.16, rng);
      coals.applyMatrix4(composeMat(bx, by + 1.34, bz, 0, 0, 0, 1, 0.55, 1));
      B.ember.push(coals);
    }
    this.emitters.push({
      id: 'outpost-brazier', x: bx, y: by + 1.6, z: bz,
      color: 0xffa24a, intensity: 5.2, distance: 26, flicker: 0.5,
    });

    /* ------------------------ the watch-post (15 m) ---------------------- */
    const TX = X - 5.5, TZ = Z + 8.5, TY = this.gy(TX, TZ);
    const legR = 2.5, PLAT = 11.2;
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
      const lx = TX + Math.cos(a) * legR, lz = TZ + Math.sin(a) * legR;
      // 0.34 m butts. The first pass used 0.24 -> 0.16 and the tower read as a
      // steel derrick at 40 m: thin members catch sky light on every facet and
      // ACES pulls them to white. A Nora watch-post is four whole trunks.
      tube(B.wood, [lx, this.gy(lx, lz) - 0.6, lz], [TX + Math.cos(a) * 1.35, TY + PLAT, TZ + Math.sin(a) * 1.35],
        0.34, 0.24, WOODS[i % WOODS.length], 7, 0.08, rng);
    }
    // cross bracing every 2.8 m
    for (let lvl = 1; lvl <= 3; lvl++) {
      const y0 = TY + lvl * 2.8, y1 = TY + (lvl + 1) * 2.8;
      const f0 = 1 - (lvl * 2.8) / PLAT * 0.46, f1 = 1 - ((lvl + 1) * 2.8) / PLAT * 0.46;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
        const a2 = Math.PI / 4 + ((i + 1) / 4) * Math.PI * 2;
        tube(B.wood, [TX + Math.cos(a) * legR * f0, y0, TZ + Math.sin(a) * legR * f0],
          [TX + Math.cos(a2) * legR * f1, y1, TZ + Math.sin(a2) * legR * f1],
          0.11, 0.11, '#4f3c28', 5, 0.09, rng);
        tube(B.wood, [TX + Math.cos(a) * legR * f0, y0, TZ + Math.sin(a) * legR * f0],
          [TX + Math.cos(a2) * legR * f0, y0, TZ + Math.sin(a2) * legR * f0],
          0.1, 0.1, '#5a452e', 5, 0.09, rng);
      }
    }
    // platform, rail and a conical roof: the silhouette
    {
      const deck = new THREE.CylinderGeometry(2.3, 2.3, 0.28, 10);
      tint(deck, '#5a452e', 0.08, rng);
      deck.applyMatrix4(composeMat(TX, TY + PLAT, TZ));
      B.wood.push(deck);
      // plank courses across it, so the deck is boards and not a drum lid
      for (let k = -4; k <= 4; k++) {
        const w = Math.sqrt(Math.max(0, 2.3 * 2.3 - (k * 0.5) * (k * 0.5))) * 2;
        if (w < 0.4) continue;
        box(B.wood, TX, TY + PLAT + 0.17, TZ + k * 0.5, w, 0.08, 0.44,
          k % 2 ? '#6a5138' : '#5e4730', rng, 0, 0.12);
      }
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        tube(B.wood, [TX + Math.cos(a) * 2.15, TY + PLAT, TZ + Math.sin(a) * 2.15],
          [TX + Math.cos(a) * 2.15, TY + PLAT + 1.05, TZ + Math.sin(a) * 2.15],
          0.06, 0.05, DARK, 4, 0.09, rng);
      }
      const roof = new THREE.ConeGeometry(3.0, 2.3, 10, 2);
      tint(roof, '#7d6a49', 0.1, rng);
      roof.applyMatrix4(composeMat(TX, TY + PLAT + 2.3, TZ, 0, 0.3, 0));
      B.hide.push(roof);
      // the mast that takes it to 15.1 m, with a signal banner
      tube(B.wood, [TX, TY + PLAT + 1.4, TZ], [TX, TY + PLAT + 3.9, TZ], 0.1, 0.06, DARK, 5, 0.07, rng);
      const flag = new THREE.PlaneGeometry(1.5, 0.9, 4, 2);
      const fp = flag.attributes.position;
      for (let v = 0; v < fp.count; v++) fp.setZ(v, Math.sin(fp.getX(v) * 3.4) * 0.12);
      flag.computeVertexNormals();
      tint(flag, '#8a3a2a', 0.13, rng);
      flag.applyMatrix4(composeMat(TX + 0.78, TY + PLAT + 3.4, TZ, 0, 0.5, 0));
      B.hide.push(flag);
      this.outpostLookout = { x: TX, y: TY + PLAT, z: TZ, height: PLAT + 3.9 };
    }
    // ladder up the trail-facing leg
    for (const s of [-1, 1]) {
      tube(B.wood, [TX + s * 0.3, TY - 0.2, TZ - 2.6], [TX + s * 0.26, TY + PLAT + 0.1, TZ - 1.3],
        0.045, 0.04, DARK, 4, 0.08, rng);
    }
    for (let i = 0; i < 14; i++) {
      const f = (i + 0.5) / 14;
      const ry = TY - 0.2 + (PLAT + 0.3) * f, rz = TZ - 2.6 + 1.3 * f;
      tube(B.wood, [TX - 0.3, ry, rz], [TX + 0.3, ry, rz], 0.028, 0.028, WOOD, 4, 0.1, rng);
    }

    /* ------------------------ dressing + interactables ------------------- */
    // supply crates by the gate
    for (let i = 0; i < 4; i++) {
      const a = GAP_A + 0.5 + i * 0.28;
      const cx = X + Math.cos(a) * (R - 3.2), cz = Z + Math.sin(a) * (R - 3.2);
      crate(B.wood, B.wood, cx, this.gy(cx, cz), cz, 0.72 + rng() * 0.25, '#796441', rng, rng() * 3);
    }
    // a drying rack of hides beside the round hut
    {
      const dx = X - 6.4, dz = Z - 5.8, dy = this.gy(dx, dz);
      for (const s of [-1, 1]) {
        tube(B.wood, [dx + s * 1.8, dy - 0.2, dz], [dx + s * 1.8, dy + 2.2, dz], 0.09, 0.07, WOOD, 5, 0.08, rng);
      }
      tube(B.wood, [dx - 1.8, dy + 2.15, dz], [dx + 1.8, dy + 2.15, dz], 0.06, 0.06, DARK, 4, 0.08, rng);
      for (let i = 0; i < 3; i++) {
        const h = new THREE.PlaneGeometry(0.85, 1.35, 2, 3);
        tint(h, i === 1 ? '#7d6a4b' : '#6a583f', 0.12, rng);
        h.applyMatrix4(composeMat(dx - 1.1 + i * 1.1, dy + 1.45, dz, 0, 0.12 * (i - 1), 0));
        B.hide.push(h);
      }
      this.outpostRack = { x: dx, y: dy, z: dz };
    }
    // the tally post that carries this place's record
    {
      const tx = X + 3.6, tz = Z + 3.2, ty = this.gy(tx, tz);
      tube(B.wood, [tx, ty - 0.3, tz], [tx, ty + 1.9, tz], 0.14, 0.12, DARK, 6, 0.07, rng);
      for (let i = 0; i < 9; i++) {
        box(B.wood, tx, ty + 0.5 + i * 0.14, tz + 0.13, 0.22, 0.04, 0.05, '#282117', rng, 0, 0.1);
      }
      this._recordAt('dp-outpost-1', tx + 0.9, tz + 0.6);
    }

    /* --------------------------- three NPC slots ------------------------- */
    // The `npc` lane fills these; this lane only says where a person stands,
    // which way they face and what they should be doing.
    const slots = [
      { id: 'ridgeback-watch', pose: 'guard', a: GAP_A + 0.34, r: R - 2.6 },
      { id: 'ridgeback-smith', pose: 'work', a: 0.9, r: 6.4 },
      { id: 'ridgeback-cook', pose: 'sit', a: 2.4, r: 4.2 },
    ];
    for (const s of slots) {
      const sx = X + Math.cos(s.a) * s.r, sz = Z + Math.sin(s.a) * s.r;
      this.npcSlots.push({
        id: s.id, site: 'outpost-ridgeback', pose: s.pose,
        x: sx, y: this.gy(sx, sz), z: sz,
        yaw: Math.atan2(X - sx, Z - sz),
      });
    }

    this._bakePlace('outpost', B, { landmark: 'matte' });
    P.landmark = { name: 'watch-post', height: PLAT + 3.9, x: TX, z: TZ };
  }

  /* ====================================================================== */
  /*  2. CAULDRON KAPPA — an interior you walk into                         */
  /* ====================================================================== */

  /**
   * The audit asks for "a Cauldron-style ruin INTERIOR you can walk into
   * (corridor + chamber, machine-parts crates, an override node terminal)".
   *
   * TWO THINGS MAKE AN INTERIOR REAL IN THIS BUILD AND BOTH ARE EASY TO GET
   * WRONG:
   *
   * 1. AN EXCAVATED STRUCTURE HAS ONE FLOOR. The first pass laid every plate at
   *    the heightfield under it, which is exactly what `terrain.getHeight`
   *    invites you to do — and the hill falls 7.7 m across this chamber, so the
   *    terrain erupted through the middle of the foundry floor. Everything now
   *    rides a single `deckY` (see below), with a skirt down to the hillside;
   *    `player-control`'s `_sampleGround` already stands the player on a
   *    collider above the terrain, so a flat deck is walkable the moment
   *    `collision.seedWorld()` BVHs it.
   * 2. THE MOUTH MUST BE A HOLE. `collision.seedWorld()` builds a triangle-exact
   *    BVH per mesh, so a portal drawn as one slab with a dark rectangle
   *    painted on it is a wall you cannot enter. The mouth is built as a
   *    SURROUND — two jambs, a lintel and a sill — with nothing across the
   *    opening.
   *
   * The silhouette is the vent stack: 19 m, and the only built thing between
   * the Core and the north rim on that bearing.
   */
  _buildCauldron() {
    const P = this.byId.get('cauldron-kappa');
    const X = P.x, Z = P.z;
    const N = this.noise;
    const rng = mulberry32(0xCA41);
    const B = Places.buckets();

    // the axis: the mouth faces the hunter camp, the chamber is up the hill
    const YAW = Math.atan2(22 - X, 30 - Z);           // toward the camp
    const fx = Math.sin(YAW), fz = Math.cos(YAW);     // unit, mouth-ward
    /** local (u = lateral, v = along the axis, +v toward the mouth) -> world */
    const at = (u, v) => [X + fx * v - fz * u, Z + fz * v + fx * u];

    const CHAMBER_R = 10.5, CORR_HALF = 2.2, CORR_H = 4.8;
    const MOUTH_V = 26;                                // metres from the centre

    /* ------------------------- interior geometry ------------------------- */
    /**
     * ONE DECK HEIGHT FOR THE WHOLE INTERIOR, and this is the single most
     * important number in the module.
     *
     * The first pass laid every floor plate at the heightfield under it. That
     * looks right on paper and is wrong on film: the hill here falls 7.7 m
     * across the chamber, a 3.3 m plate is flat, and the terrain therefore
     * erupted through the middle of the foundry floor — the shot from inside
     * was a speckled hillside with some rusted plate around it. An excavated
     * structure has ONE floor. `deckY` is the highest ground anywhere under the
     * chamber or the corridor, plus 15 cm, so the heightfield is under the deck
     * everywhere and never pokes through it; `player-control`'s `_sampleGround`
     * already stands the player on a collider above the terrain (ruin slab,
     * tent roof, tower deck), so a flat deck is walkable the moment
     * `collision.seedWorld()` BVHs it.
     *
     * Interior geometry is collected separately so `bakeVertexLight` can burn
     * the pit and the terminal into its vertex colours before it is merged.
     */
    const inner = { stone: [], metal: [], wood: [] };
    let deckY = -Infinity;
    for (let iu = -3; iu <= 3; iu++) {
      for (let iv = -3; iv <= 3; iv++) {
        const u = iu * 3.4, v = iv * 3.4;
        if (Math.hypot(u, v) > CHAMBER_R) continue;
        const [px, pz] = at(u, v);
        deckY = Math.max(deckY, this.gy(px, pz));
      }
    }
    for (let i = 0; i <= 14; i++) {
      const v = CHAMBER_R - 1 + ((MOUTH_V - CHAMBER_R + 1) * i) / 14;
      for (const u of [-CORR_HALF, 0, CORR_HALF]) {
        const [px, pz] = at(u, v);
        deckY = Math.max(deckY, this.gy(px, pz));
      }
    }
    deckY += 0.15;
    this.cauldronDeckY = deckY;
    const CEIL = deckY + CORR_H;

    // -- chamber floor: ONE disc, no seams for the hill to come through
    {
      const fl = new THREE.CylinderGeometry(CHAMBER_R - 0.2, CHAMBER_R - 0.2, 0.5, 20, 1);
      paintConcrete(fl, 9200, N, 0.4);
      fl.applyMatrix4(composeMat(X, deckY - 0.25, Z));
      inner.stone.push(fl.toNonIndexed());
      // a skirt that hides the step from the deck down to the hillside
      const skirt = new THREE.CylinderGeometry(CHAMBER_R - 0.2, CHAMBER_R + 1.6, 9.0, 20, 1, true);
      paintConcrete(skirt, 9210, N, 0.4);
      skirt.applyMatrix4(composeMat(X, deckY - 4.6, Z));
      inner.stone.push(skirt.toNonIndexed());
    }
    // -- chamber wall: a 16-sided ring of plates, 12 m tall so it always laps
    //    the dome rim however the hill falls away behind it
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const u = Math.cos(a) * CHAMBER_R, v = Math.sin(a) * CHAMBER_R;
      // leave the corridor mouth open on the +v side
      if (v > CHAMBER_R * 0.72 && Math.abs(u) < CORR_HALF + 0.9) continue;
      const [px, pz] = at(u, v);
      const w = (Math.PI * 2 * CHAMBER_R) / 16 + 0.6;
      plate(inner.metal, px, deckY + 3.6, pz, w, 12.0, 0.55, 9300 + i * 11, N, YAW + a + Math.PI / 2, 0, 1.6);
      if (i % 2 === 0) {
        rustTube(inner.metal, [px, deckY - 0.3, pz], [px, deckY + 9.2, pz], 0.34, 0.26, 9400 + i, N, 6);
      }
    }
    /**
     * ROOF: ONE CLOSED DOME, NOT SIXTEEN WEDGES.
     *
     * The first pass laid two rings of box wedges across the top and, shot from
     * the chamber floor, you could see SKY between every pair of them — the
     * wedge width was computed at the ring's mid-radius, so it was short at the
     * outer edge by exactly the amount that opens a slot. `V42` asks for
     * ENCLOSED and an enclosure with sixteen slits in it is a colander. One
     * hemisphere, squashed to a 4 m rise, drawn on the DoubleSide metal
     * material so it reads from inside and out, closes it with one geometry and
     * no seam to get wrong.
     */
    {
      const dome = new THREE.SphereGeometry(CHAMBER_R + 0.6, 22, 9, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.scale(1, 0.40, 1);
      paintRust(dome, 9500, N, 1.2, 1.35);
      dome.applyMatrix4(composeMat(X, deckY + 8.2, Z, 0, YAW, 0));
      inner.metal.push(dome.toNonIndexed());
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI;
        const rib = new THREE.TorusGeometry(CHAMBER_R + 0.75, 0.22, 5, 18, Math.PI);
        rib.scale(1, 0.40, 1);
        paintRust(rib, 9520 + i, N, 1.2, 1.1);
        rib.applyMatrix4(composeMat(X, deckY + 8.2, Z, 0, YAW + a, 0));
        inner.metal.push(rib.toNonIndexed());
      }
      const collar = new THREE.CylinderGeometry(2.1, 2.6, 1.4, 14, 1, true);
      paintRust(collar, 9540, N, 1.2, 1.2);
      collar.applyMatrix4(composeMat(X, deckY + 12.2, Z));
      inner.metal.push(collar.toNonIndexed());
    }
    // -- the smelt pit: a sunk ring of coals at the chamber centre
    {
      const ring = new THREE.CylinderGeometry(3.4, 3.0, 0.9, 14, 1, true);
      paintRust(ring, 9600, N, 0.5);
      ring.applyMatrix4(composeMat(X, deckY + 0.35, Z));
      inner.metal.push(ring.toNonIndexed());
      const pool = new THREE.CircleGeometry(3.0, 14);
      tint(pool, '#ff8a2c', 0.18, rng);
      pool.applyMatrix4(composeMat(X, deckY + 0.1, Z, -Math.PI / 2, 0, 0));
      B.ember.push(pool);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        rustTube(inner.metal, [X + Math.cos(a) * 5.4, deckY + 6.6, Z + Math.sin(a) * 5.4],
          [X + Math.cos(a) * 3.1, deckY + 3.4, Z + Math.sin(a) * 3.1], 0.42, 0.3, 9700 + i, N, 7);
      }
    }
    this.emitters.push({
      id: 'cauldron-pit', x: X, y: deckY + 1.6, z: Z,
      color: 0xff7a2a, intensity: 8.0, distance: 30, flicker: 0.42,
    });

    // -- catwalk ring at 5 m: vertical readability
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, a2 = ((i + 1) / 16) * Math.PI * 2;
      const [ax, az] = at(Math.cos(a) * (CHAMBER_R - 1.5), Math.sin(a) * (CHAMBER_R - 1.5));
      const [bx2, bz2] = at(Math.cos(a2) * (CHAMBER_R - 1.5), Math.sin(a2) * (CHAMBER_R - 1.5));
      rustTube(inner.metal, [ax, deckY + 5.0, az], [bx2, deckY + 5.0, bz2], 0.1, 0.1, 9800 + i, N, 4);
      rustTube(inner.metal, [ax, deckY + 5.9, az], [bx2, deckY + 5.9, bz2], 0.06, 0.06, 9820 + i, N, 4);
      rustTube(inner.metal, [ax, deckY + 5.0, az], [ax, deckY + 5.9, az], 0.05, 0.05, 9840 + i, N, 4);
    }

    // -- the OVERRIDE TERMINAL, on the back wall of the chamber
    {
      const [tx, tz] = at(0, -CHAMBER_R + 2.4);
      const ty = deckY;
      plate(inner.metal, tx, ty + 1.0, tz, 2.6, 2.0, 0.9, 9900, N, YAW, 0, 1.3);
      const head = new THREE.BoxGeometry(2.3, 1.5, 0.5, 2, 2, 1);
      paintRust(head, 9910, N, 0.4);
      head.applyMatrix4(composeMat(tx - fx * 0.3, ty + 2.5, tz - fz * 0.3, -0.28, YAW, 0));
      inner.metal.push(head.toNonIndexed());
      const face = new THREE.PlaneGeometry(1.9, 1.15, 2, 2);
      tint(face, '#9ff0ff', 0.04, rng);
      face.applyMatrix4(composeMat(tx + fx * 0.02, ty + 2.52, tz + fz * 0.02, -0.28, YAW, 0));
      B.holo.push(face);
      this.cauldronTerminal = { x: tx, y: ty, z: tz };
      this.emitters.push({
        id: 'cauldron-terminal', x: tx, y: ty + 2.6, z: tz,
        color: 0x7fd8ff, intensity: 3.4, distance: 18, flicker: 0.12,
      });
    }

    // -- machine-parts crates on the deck
    this.cauldronCrates = [];
    for (let i = 0; i < 3; i++) {
      const a = 1.2 + i * 1.9;
      const [cx, cz] = at(Math.cos(a) * (CHAMBER_R - 3.4), Math.sin(a) * (CHAMBER_R - 3.4));
      const s2 = 0.95;
      plate(inner.metal, cx, deckY + s2 * 0.5, cz, s2, s2, s2 * 0.9, 9950 + i * 5, N, rng() * 3, 0, 1);
      rustTube(inner.metal, [cx - 0.5, deckY + s2, cz - 0.3], [cx + 0.8, deckY + s2 + 0.9, cz + 0.4], 0.14, 0.09, 9960 + i, N, 5);
      this.cauldronCrates.push({ id: `kappa-parts-${i}`, x: cx, y: deckY, z: cz });
    }
    {
      const [rx, rz] = at(3.4, -5.2);
      this._recordAt('dp-cauldron-1', rx, rz, deckY + 0.05);
    }

    /* ----------------------------- corridor ------------------------------ */
    // 12 ring sections from the chamber lip to the mouth, all on the deck
    const SECTIONS = 12;
    const V0 = CHAMBER_R - 0.4, V1 = MOUTH_V;
    for (let i = 0; i < SECTIONS; i++) {
      const v = V0 + ((V1 - V0) * (i + 0.5)) / SECTIONS;
      const len = (V1 - V0) / SECTIONS + 0.3;
      const [cx, cz] = at(0, v);
      // floor + a skirt down to the hill, so the corridor is not on stilts
      slab(inner.stone, cx, deckY - 0.25, cz, CORR_HALF * 2 + 1.2, 0.5, len, 10000 + i * 3, N, YAW, 1.5);
      slab(B.stone, cx, deckY - 4.6, cz, CORR_HALF * 2 + 1.8, 8.5, len, 10050 + i * 3, N, YAW, 1.8);
      for (const s2 of [-1, 1]) {
        const [wx, wz] = at(s2 * (CORR_HALF + 0.3), v);
        plate(inner.metal, wx, deckY + CORR_H * 0.5, wz, 0.5, CORR_H, len, 10100 + i * 5 + s2, N, YAW, 0, 1.5);
      }
      plate(inner.metal, cx, CEIL, cz, CORR_HALF * 2 + 1.1, 0.5, len, 10200 + i * 7, N, YAW, 0, 1.5);
      if (i % 3 === 1) {
        const strip = new THREE.BoxGeometry(0.9, 0.12, 0.3);
        tint(strip, '#cdefff', 0.06, rng);
        strip.applyMatrix4(composeMat(cx, CEIL - 0.4, cz, 0, YAW, 0));
        B.holo.push(strip);
        this.emitters.push({
          id: `kappa-strip-${i}`, x: cx, y: CEIL - 0.7, z: cz,
          color: 0x9fe6ff, intensity: 2.2, distance: 13, flicker: 0.06,
        });
      }
    }

    /* ------------------------------- mouth ------------------------------- */
    {
      const [mx, mz] = at(0, MOUTH_V);
      this.cauldronMouth = new THREE.Vector3(mx, deckY, mz);
      for (const s2 of [-1, 1]) {
        const [jx, jz] = at(s2 * (CORR_HALF + 1.0), MOUTH_V);
        slab(B.stone, jx, deckY + 2.8, jz, 1.6, 6.4, 2.6, 10300 + s2, N, YAW, 1.6);
      }
      slab(B.stone, mx, deckY + 5.6, mz, CORR_HALF * 2 + 3.4, 1.6, 2.6, 10310, N, YAW, 1.6);
      const glyph = new THREE.PlaneGeometry(2.2, 0.5, 3, 1);
      tint(glyph, '#7fd8ff', 0.05, rng);
      glyph.applyMatrix4(composeMat(mx + fx * 1.35, deckY + 5.6, mz + fz * 1.35, 0, YAW, 0));
      B.holo.push(glyph);
      /**
       * Apron steps from the deck down to whatever the hillside is doing
       * outside. Six treads, each the average of the deck and the ground under
       * it, so the drop is walkable at any slope instead of a ledge you have to
       * jump off the first time you leave.
       */
      for (let i = 0; i < 6; i++) {
        const [sx, sz] = at(0, MOUTH_V + 0.9 + i * 1.25);
        const gy2 = this.gy(sx, sz);
        const top = deckY + (gy2 - deckY) * ((i + 1) / 6);
        slab(B.stone, sx, top - 0.5, sz, CORR_HALF * 2 + 3.0 + i * 0.5, 1.0, 1.35, 10320 + i, N, YAW, 1.6);
      }
    }

    /* --------------------- exterior: the buried shell -------------------- */
    // a ring of buttresses around the chamber, so from outside it is a
    // structure in the hillside rather than a roof floating on the grass
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const u = Math.cos(a) * (CHAMBER_R + 2.6), v = Math.sin(a) * (CHAMBER_R + 2.6);
      const [px, pz] = at(u, v);
      const py = this.gy(px, pz);
      slab(B.stone, px, py + 2.2, pz, 2.6, 5.0, 3.4, 10400 + i * 3, N, YAW + a, 1.8);
    }
    // spoil heaps: the hill "swallowing" the shell
    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI * 2, d = CHAMBER_R + 3.0 + rng() * 6;
      const [px, pz] = at(Math.cos(a) * d, Math.sin(a) * d);
      if (Math.hypot(px - this.cauldronMouth.x, pz - this.cauldronMouth.z) < 7) continue;
      const s = 1.1 + rng() * rng() * 2.8;
      const lump = new THREE.DodecahedronGeometry(s, 0);
      roughen(lump, N, s * 0.2, 0.5, i * 13);
      paintRock(lump, 10500 + i, N);
      lump.applyMatrix4(composeMat(px, this.gy(px, pz) + s * 0.34, pz, rng(), rng() * 6.28, rng(), 1, 0.65, 1));
      B.stone.push(lump);
    }
    /* ---- THE SILHOUETTE: three vent stacks, the tallest 19.4 m ---- */
    const stacks = [[0, -3.5, 19.4, 1.9], [7.4, 4.2, 13.2, 1.4], [-6.8, 5.6, 10.4, 1.15]];
    for (let i = 0; i < stacks.length; i++) {
      const [u, v, h, r] = stacks[i];
      const [px, pz] = at(u, v);
      const py = this.gy(px, pz) + (i === 0 ? 9.6 : 5.0);
      const shell = new THREE.CylinderGeometry(r * 0.82, r, h, 12, Math.max(2, Math.round(h / 3)), true);
      paintRust(shell, 10600 + i * 17, N, 2.2);
      shell.applyMatrix4(composeMat(px, py + h * 0.5, pz, 0.02 * (i + 1), rng(), 0));
      B.metal.push(shell);
      // cap ring + exhaust glow
      const cap = new THREE.TorusGeometry(r * 0.88, 0.16, 5, 12);
      paintRust(cap, 10620 + i, N, 0.4);
      cap.applyMatrix4(composeMat(px, py + h, pz, Math.PI / 2, 0, 0));
      B.metal.push(cap);
      if (i === 0) {
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2;
          rustTube(B.metal, [px + Math.cos(a) * r * 1.1, py + h * 0.35, pz + Math.sin(a) * r * 1.1],
            [px + Math.cos(a) * (r + 5.0), py - 1.0, pz + Math.sin(a) * (r + 5.0)], 0.17, 0.12, 10640 + k, N, 5);
        }
      }
    }
    P.landmark = { name: 'vent stack', height: 19.4, x: at(0, -3.5)[0], z: at(0, -3.5)[1] };

    /* --------- burn the interior lighting into the vertex colours -------- */
    const lights = [
      emitter(X, deckY + 1.4, Z, '#ff7a28', 9.5, 1.5),
      emitter(this.cauldronTerminal.x, this.cauldronTerminal.y + 2.5, this.cauldronTerminal.z, '#6fd0ff', 5.5, 1.1),
    ];
    for (let i = 1; i < SECTIONS; i += 3) {
      const v = V0 + ((V1 - V0) * (i + 0.5)) / SECTIONS;
      const [cx, cz] = at(0, v);
      lights.push(emitter(cx, CEIL - 0.6, cz, '#9fe6ff', 4.4, 1.25));
    }
    // daylight spilling in at the mouth, so the corridor reads as a throat
    lights.push(emitter(this.cauldronMouth.x, this.cauldronMouth.y + 2.2, this.cauldronMouth.z,
      '#cfe6ff', 7.0, 1.35));
    for (const key of ['stone', 'metal', 'wood']) {
      bakeVertexLight(inner[key], lights, 0.62);
      B[key].push(...inner[key]);
    }

    this._bakePlace('cauldron', B, { landmark: 'metal' });
    this.cauldronInterior = {
      x: X, y: deckY, z: Z, r: CHAMBER_R,
      mouth: this.cauldronMouth, ceiling: deckY + 11.4, deckY,
    };
  }

  /* ====================================================================== */
  /*  3. RIDGE TRIAL GROUND — the Hunting Ground arena                      */
  /* ====================================================================== */

  /**
   * `activities.js` already puts a HUNTING GROUND totem and three trial records
   * at (128, -78); what it never had was a PLACE to run them in. This is the
   * arena around it: a 21 m stone-and-timber ring with one entry, five target
   * dummies on a firing line, a trial board you can read, a weapon rack you can
   * loot, and a 13 m banner mast that answers the east-south-east bearing.
   *
   * It is offset to (132, -82) so its ring does not swallow the existing totem —
   * the totem stands just inside the entry, which is where a trial-giver should.
   */
  _buildArena() {
    const P = this.byId.get('hunting-arena');
    const X = P.x, Z = P.z, g0 = P.y;
    const N = this.noise;
    const rng = mulberry32(0x7B11);
    const B = Places.buckets();
    const WOOD = '#6e5838', DARK = '#3c3223';

    /* ------------------------- the ring wall ---------------------------- */
    const R = 21;
    const ENTRY_A = Math.atan2(22 - X, 30 - Z);   // facing the camp
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2;
      const da = Math.abs(((a - (Math.PI / 2 - ENTRY_A) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da > Math.PI - 0.3) continue;
      const px = X + Math.cos(a) * R, pz = Z + Math.sin(a) * R;
      const py = this.gy(px, pz);
      // alternating drystone piers and timber panels
      if (i % 3 === 0) {
        const pier = new THREE.CylinderGeometry(0.62, 0.78, 1.7 + rng() * 0.5, 7, 2);
        roughen(pier, N, 0.1, 1.2, i);
        paintRock(pier, 11000 + i, N);
        pier.applyMatrix4(composeMat(px, py + 0.75, pz, 0, rng() * 3, 0));
        B.stone.push(pier);
      } else {
        const a2 = ((i + 1) / 46) * Math.PI * 2;
        const qx = X + Math.cos(a2) * R, qz = Z + Math.sin(a2) * R;
        for (const h of [0.55, 1.15]) {
          tube(B.wood, [px, py + h, pz], [qx, this.gy(qx, qz) + h, qz], 0.09, 0.09, WOOD, 4, 0.09, rng);
        }
        tube(B.wood, [px, py - 0.25, pz], [px, py + 1.45, pz], 0.11, 0.09, DARK, 5, 0.08, rng);
      }
    }
    // entry gate posts with hanging trophies
    for (const s of [-1, 1]) {
      const a = (Math.PI / 2 - ENTRY_A) + s * 0.34;
      const px = X + Math.cos(a) * R, pz = Z + Math.sin(a) * R;
      const py = this.gy(px, pz);
      tube(B.wood, [px, py - 0.4, pz], [px, py + 4.6, pz], 0.3, 0.2, DARK, 7, 0.07, rng);
      // machine plate trophies, nailed on
      for (let k = 0; k < 3; k++) {
        plate(B.metal, px + (rng() - 0.5) * 0.3, py + 1.6 + k * 0.9, pz + (rng() - 0.5) * 0.3,
          0.7, 0.55, 0.08, 11100 + k + s * 3, N, rng() * 3, 0, 1);
      }
    }

    /* ---------------- THE SILHOUETTE: a 13 m banner mast ---------------- */
    {
      const mx = X, mz = Z, my = g0;
      /**
       * 16.8 m, not 13.2. The trial ground stands in a pine grove — 87 trunks
       * inside 26 m, measured — and the canopy tops out near 13 m, so the first
       * mast was a landmark you could only see from inside the ring it marks.
       */
      tube(B.wood, [mx, my - 0.6, mz], [mx, my + 16.8, mz], 0.46, 0.2, DARK, 8, 0.06, rng);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        tube(B.wood, [mx + Math.cos(a) * 2.4, this.gy(mx + Math.cos(a) * 2.4, mz + Math.sin(a) * 2.4) - 0.2, mz + Math.sin(a) * 2.4],
          [mx, my + 4.6, mz], 0.14, 0.09, WOOD, 5, 0.08, rng);
      }
      // three long banners, the readable part of the silhouette
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        const ban = new THREE.PlaneGeometry(1.5, 6.2, 3, 8);
        const p = ban.attributes.position;
        for (let v = 0; v < p.count; v++) {
          p.setZ(v, Math.sin(p.getY(v) * 1.1 + i * 2) * 0.16 * (0.4 + (p.getY(v) + 3.1) / 6.2));
        }
        ban.computeVertexNormals();
        tint(ban, ['#8a3a2a', '#3e5c6a', '#796a2c'][i], 0.13, rng);
        ban.applyMatrix4(composeMat(mx + Math.cos(a) * 0.55, my + 12.6, mz + Math.sin(a) * 0.55, 0, -a, 0));
        B.hide.push(ban);
      }
      // a crown of machine horns
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        rustTube(B.metal, [mx, my + 16.2, mz],
          [mx + Math.cos(a) * 1.1, my + 17.5, mz + Math.sin(a) * 1.1], 0.09, 0.03, 11200 + i, N, 4);
      }
      P.landmark = { name: 'banner mast', height: 17.5, x: mx, z: mz };
    }

    /* ------------------------ five target dummies ----------------------- */
    this.dummies = [];
    for (let i = 0; i < 5; i++) {
      const a = -1.15 + i * 0.44;
      const dx = X + Math.cos(a) * 13.5, dz = Z + Math.sin(a) * 13.5;
      const dy = this.gy(dx, dz);
      const yaw = Math.atan2(X - dx, Z - dz);
      // post
      tube(B.wood, [dx, dy - 0.4, dz], [dx, dy + 1.35, dz], 0.13, 0.11, DARK, 5, 0.08, rng);
      // a wicker machine torso on a crossbar — a Watcher, roughly
      box(B.hide, dx, dy + 2.0, dz, 0.95, 1.15, 0.6, '#9a8555', rng, yaw, 0.13);
      tube(B.wood, [dx - Math.cos(yaw) * 0.9, dy + 2.25, dz + Math.sin(yaw) * 0.9],
        [dx + Math.cos(yaw) * 0.9, dy + 2.25, dz - Math.sin(yaw) * 0.9], 0.055, 0.055, WOOD, 4, 0.09, rng);
      // head with a painted eye: the thing you actually aim at
      box(B.hide, dx + Math.sin(yaw) * 0.18, dy + 2.9, dz + Math.cos(yaw) * 0.18, 0.5, 0.42, 0.44, '#897347', rng, yaw, 0.1);
      const eye = new THREE.CircleGeometry(0.15, 8);
      tint(eye, '#ff5a3a', 0.06, rng);
      eye.applyMatrix4(composeMat(dx + Math.sin(yaw) * 0.42, dy + 2.9, dz + Math.cos(yaw) * 0.42, 0, yaw, 0));
      B.ember.push(eye);
      // spent arrows stuck in it
      for (let k = 0; k < 2 + (rng() * 3 | 0); k++) {
        tube(B.wood, [dx + (rng() - 0.5) * 0.7, dy + 1.6 + rng() * 1.0, dz + (rng() - 0.5) * 0.7],
          [dx + Math.sin(yaw) * 0.85 + (rng() - 0.5) * 0.3, dy + 1.7 + rng() * 1.0, dz + Math.cos(yaw) * 0.85 + (rng() - 0.5) * 0.3],
          0.016, 0.014, '#cab789', 4, 0.1, rng);
      }
      this.dummies.push({ id: `trial-dummy-${i}`, x: dx, y: dy, z: dz, struck: false });
    }

    /* --------------------------- the trial board ------------------------ */
    {
      const a = (Math.PI / 2 - ENTRY_A) + 1.15;
      const bx = X + Math.cos(a) * 10.5, bz = Z + Math.sin(a) * 10.5;
      const by = this.gy(bx, bz);
      const yaw = Math.atan2(X - bx, Z - bz);
      for (const s of [-1, 1]) {
        tube(B.wood, [bx + Math.cos(yaw) * s * 1.45, by - 0.35, bz - Math.sin(yaw) * s * 1.45],
          [bx + Math.cos(yaw) * s * 1.45, by + 2.5, bz - Math.sin(yaw) * s * 1.45], 0.12, 0.1, DARK, 5, 0.08, rng);
      }
      box(B.wood, bx, by + 1.85, bz, 3.1, 1.5, 0.16, '#9a794d', rng, yaw, 0.09);
      // three chalked trial plaques
      for (let i = 0; i < 3; i++) {
        const pl = new THREE.PlaneGeometry(0.82, 1.0, 1, 1);
        tint(pl, ['#c8b98e', '#bead81', '#d0c098'][i], 0.07, rng);
        pl.applyMatrix4(composeMat(
          bx + Math.sin(yaw) * 0.1 + Math.cos(yaw) * (i - 1) * 0.95,
          by + 1.85, bz + Math.cos(yaw) * 0.1 - Math.sin(yaw) * (i - 1) * 0.95, 0, yaw, 0));
        B.hide.push(pl);
        for (let k = 0; k < 4; k++) {
          box(B.wood,
            bx + Math.sin(yaw) * 0.12 + Math.cos(yaw) * ((i - 1) * 0.95 - 0.26),
            by + 2.15 - k * 0.19,
            bz + Math.cos(yaw) * 0.12 - Math.sin(yaw) * ((i - 1) * 0.95 - 0.26),
            0.42, 0.035, 0.02, '#3a2a1b', rng, yaw, 0.12);
        }
      }
      this.trialBoard = { x: bx, y: by, z: bz };
    }

    /* --------------------------- weapon rack ---------------------------- */
    {
      const a = (Math.PI / 2 - ENTRY_A) - 1.15;
      const wx = X + Math.cos(a) * 10.0, wz = Z + Math.sin(a) * 10.0;
      const wy = this.gy(wx, wz);
      const yaw = Math.atan2(X - wx, Z - wz);
      for (const s of [-1, 1]) {
        tube(B.wood, [wx + Math.cos(yaw) * s * 1.2, wy - 0.3, wz - Math.sin(yaw) * s * 1.2],
          [wx + Math.cos(yaw) * s * 1.2, wy + 1.5, wz - Math.sin(yaw) * s * 1.2], 0.1, 0.08, DARK, 5, 0.08, rng);
      }
      tube(B.wood, [wx - Math.cos(yaw) * 1.2, wy + 1.4, wz + Math.sin(yaw) * 1.2],
        [wx + Math.cos(yaw) * 1.2, wy + 1.4, wz - Math.sin(yaw) * 1.2], 0.07, 0.07, WOOD, 4, 0.08, rng);
      for (let i = 0; i < 5; i++) {
        const t = (i - 2) * 0.42;
        tube(B.wood, [wx + Math.cos(yaw) * t + (rng() - 0.5) * 0.1, wy - 0.2, wz - Math.sin(yaw) * t],
          [wx + Math.cos(yaw) * t, wy + 2.0, wz - Math.sin(yaw) * t], 0.028, 0.02, '#af9c71', 4, 0.09, rng);
      }
      // a quiver bundle at the foot
      crate(B.wood, B.wood, wx + Math.sin(yaw) * 0.9, wy, wz + Math.cos(yaw) * 0.9, 0.62, '#796441', rng, yaw);
      this.arenaRack = { x: wx, y: wy, z: wz };
    }

    /* ----------------- scuffed ground ring + seating stones ------------- */
    for (let i = 0; i < 22; i++) {
      const a = rng() * Math.PI * 2, d = 15 + rng() * 5;
      const sx = X + Math.cos(a) * d, sz = Z + Math.sin(a) * d;
      const s = 0.5 + rng() * 0.9;
      const st = new THREE.DodecahedronGeometry(s, 0);
      paintRock(st, 11300 + i, N);
      st.applyMatrix4(composeMat(sx, this.gy(sx, sz) + s * 0.3, sz, rng() * 0.4, rng() * 6.28, rng() * 0.4, 1, 0.62, 1));
      B.stone.push(st);
    }

    this._bakePlace('arena', B, { landmark: 'matte' });
  }

  /* ====================================================================== */
  /*  4. GLOWFALL CAVES                                                     */
  /* ====================================================================== */

  /**
   * A rock massif with two mouths and a chamber between them, lit blue-green by
   * fungus. Like `rockworks.js`'s Hollow this exists because the heightfield
   * cannot express an overhang, but where the Hollow is one shallow mouth this
   * is a THROUGH ROUTE: you enter at the low mouth, the chamber opens up, and a
   * climbable shelf takes you out of the high mouth onto the massif's back.
   *
   * The silhouette is a 21 m spire off the massif's shoulder, and it answers
   * the SOUTH bearing from the spawn vista at 235 m, where the Tank Farm is the
   * only other built thing.
   */
  _buildCaves() {
    const P = this.byId.get('caves-glowfall');
    const X = P.x, Z = P.z, g0 = P.y;
    const N = this.noise;
    const rng = mulberry32(0x61A0);
    const B = Places.buckets();
    const YAW = 0.55;
    const cs = Math.cos(YAW), sn = Math.sin(YAW);
    const at = (u, v) => [X + cs * u - sn * v, Z + sn * u + cs * v];

    /* ------------------------- the massif ------------------------------- */
    const lumps = [
      [0, 6, 13.5, 15.0], [-13, 9, 9.5, 11.0], [13.5, 8, 10.5, 12.5],
      [-22, 13, 7.0, 8.0], [22, 12, 7.5, 9.0],
    ];
    /**
     * ICOSAHEDRA, NOT SPHERES. The first massif was five 14x10 UV spheres with
     * a gentle displacement, and shot from 40 m it read as five sand dunes:
     * a sphere's silhouette is a circle however you paint it, and `paintRock`'s
     * strata cannot rescue a round edge. A subdivided icosahedron displaced
     * three times harder gives the flat faces and hard arrises that make the
     * flat-shaded `rock` material look like rock.
     */
    for (let i = 0; i < lumps.length; i++) {
      const [u, v, r, h] = lumps[i];
      const [lx, lz] = at(u, v);
      const g = new THREE.IcosahedronGeometry(r, 2);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const y = p.getY(k);
        p.setY(k, y * (h / (2 * r)) * (y > 0 ? 1 : 0.45));
      }
      roughen(g, N, r * 0.26, 0.2, i * 37);
      g.computeVertexNormals();
      paintRock(g, 12000 + i * 13, N);
      g.applyMatrix4(composeMat(lx, this.gy(lx, lz) + h * 0.24, lz, 0, rng() * 3, 0));
      B.stone.push(g.toNonIndexed());
    }
    /* ---------------- THE SILHOUETTE: a 21 m fang of rock --------------- */
    /**
     * Five stacked blocks, each smaller and turned a few degrees off the one
     * below, rather than one cone with its vertices mangled — the mangled cone
     * read as a shard of broken glass at 40 m. A stack has horizontal breaks,
     * which is what a weathered rock tower has and what says SCALE against the
     * sky at 268 m.
     */
    {
      const [sx, sz] = at(-7.5, 12.5);
      const sy = this.gy(sx, sz);
      let y = sy - 1.2;
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const w = 7.6 - t * 5.4;
        const hh = 5.4 - t * 0.55;
        const blk = new THREE.CylinderGeometry(w * 0.72, w, hh, 7, 2);
        roughen(blk, N, w * 0.14, 0.24, 77 + i * 13);
        blk.computeVertexNormals();
        paintRock(blk, 12100 + i * 7, N);
        blk.applyMatrix4(composeMat(sx + Math.sin(i * 1.7) * 0.7, y + hh * 0.5, sz + Math.cos(i * 1.3) * 0.6,
          0.04 * Math.sin(i), i * 0.5, 0.03 * Math.cos(i)));
        B.stone.push(blk.toNonIndexed());
        y += hh * 0.94;
      }
      P.landmark = { name: 'rock spire', height: y - sy, x: sx, z: sz };
    }

    /* ----------------------- the low mouth (entry) ---------------------- */
    const MW = 3.0, MH = 4.0;
    const [mx, mz] = at(-2.0, -7.6);
    const my = this.gy(mx, mz);
    this.caveMouth = new THREE.Vector3(mx, my, mz);
    for (let i = 0; i < 11; i++) {
      const a = (i / 10) * Math.PI;
      const u = -2.0 + Math.cos(a) * (MW + 1.4), y = Math.sin(a) * (MH + 1.1);
      const [bx, bz] = at(u, -7.6);
      const blk = new THREE.BoxGeometry(2.3, 2.3, 3.2, 2, 2, 2);
      roughen(blk, N, 0.42, 0.42, i * 9);
      paintRock(blk, 12200 + i * 5, N);
      blk.applyMatrix4(composeMat(bx, my + y + 0.4, bz, 0, YAW, a - Math.PI / 2));
      B.stone.push(blk.toNonIndexed());
    }

    /* -------------------- interior: tunnel + chamber -------------------- */
    const inner = [];
    /**
     * The chamber anchor and its DECK HEIGHT are computed first, because the
     * tunnel ramps up to the deck and the dressing sits on it. Same lesson the
     * cauldron learned: one floor for the room, at the highest ground under it,
     * or the hillside erupts through the middle of the cave.
     */
    const [chx, chz] = at(1.5, 6.5);
    const chy = this.gy(chx, chz);
    this.caveChamber = new THREE.Vector3(chx, chy, chz);
    {
      let f = -Infinity;
      for (let iu = -3; iu <= 3; iu++) {
        for (let iv = -3; iv <= 3; iv++) {
          const px = chx + iu * 2.8, pz = chz + iv * 2.8;
          if (Math.hypot(iu * 2.8, iv * 2.8) > 8.6) continue;
          f = Math.max(f, this.gy(px, pz));
        }
      }
      this.caveFloorY = f + 0.12;
    }

    // the tunnel: 5 inward-facing ring sections from the mouth to the chamber
    for (let i = 0; i < 5; i++) {
      const v = -6.4 + i * 2.4;
      const [cx, cz] = at(-2.0 + i * 0.35, v);
      // the throat ramps from the mouth's ground up to the chamber deck
      const t2 = i / 4;
      const cy = this.gy(mx, mz) * (1 - t2) + this.caveFloorY * t2;
      const shell = new THREE.CylinderGeometry(3.1, 3.3, 2.6, 10, 1, true);
      shell.scale(-1, 1, 1);                        // face inward
      roughen(shell, N, 0.28, 0.5, i * 21 + 3);
      paintRock(shell, 12300 + i * 7, N);
      shell.applyMatrix4(composeMat(cx, cy + 1.9, cz, Math.PI / 2, YAW, 0));
      inner.push(shell.toNonIndexed());
    }
    // the chamber: an inward cylinder with a domed cap and a flat floor
    {
      const floorY = this.caveFloorY;
      const shell = new THREE.CylinderGeometry(8.0, 8.6, 7.2, 14, 3, true);
      shell.scale(-1, 1, 1);
      roughen(shell, N, 0.55, 0.28, 51);
      paintRock(shell, 12400, N);
      shell.applyMatrix4(composeMat(chx, floorY + 3.3, chz, 0, YAW, 0));
      inner.push(shell.toNonIndexed());
      const cap = new THREE.SphereGeometry(8.2, 14, 6, 0, 6.283, 0, Math.PI / 2);
      cap.scale(-1, 0.52, 1);
      roughen(cap, N, 0.5, 0.3, 61);
      paintRock(cap, 12410, N);
      cap.applyMatrix4(composeMat(chx, floorY + 6.7, chz));
      inner.push(cap.toNonIndexed());
      const fl = new THREE.CylinderGeometry(8.4, 8.4, 0.5, 18, 1);
      roughen(fl, N, 0.1, 0.5, 31);
      fl.computeVertexNormals();
      paintRock(fl, 12420, N);
      fl.applyMatrix4(composeMat(chx, floorY - 0.25, chz));
      inner.push(fl.toNonIndexed());
      // a skirt down to the hillside so the floor is not a hovering disc
      const skirt = new THREE.CylinderGeometry(8.4, 9.6, 8.0, 18, 1, true);
      paintRock(skirt, 12430, N);
      skirt.applyMatrix4(composeMat(chx, floorY - 4.2, chz));
      inner.push(skirt.toNonIndexed());
    }
    // the high mouth, out of the chamber's back shoulder, with a climb shelf
    {
      const [hx, hz] = at(9.0, 12.0);
      const hy = this.gy(hx, hz);
      for (let i = 0; i < 9; i++) {
        const a = (i / 8) * Math.PI;
        const blk = new THREE.BoxGeometry(2.0, 2.0, 2.8, 2, 2, 2);
        roughen(blk, N, 0.4, 0.45, i * 11 + 4);
        paintRock(blk, 12500 + i * 3, N);
        const [bx, bz] = at(9.0 + Math.cos(a) * 3.4, 12.0);
        blk.applyMatrix4(composeMat(bx, hy + Math.sin(a) * 3.4 + 0.3, bz, 0, YAW, a - Math.PI / 2));
        B.stone.push(blk.toNonIndexed());
      }
      // stepped shelf up to it from the chamber floor
      for (let i = 0; i < 4; i++) {
        const [tx, tz] = at(4.5 + i * 1.6, 8.5 + i * 1.0);
        const st = new THREE.BoxGeometry(3.4, 0.9, 2.6, 2, 1, 2);
        roughen(st, N, 0.16, 0.7, i * 17);
        paintRock(st, 12550 + i, N);
        st.applyMatrix4(composeMat(tx, this.caveFloorY + 0.4 + i * 0.85, tz, 0, YAW, 0));
        inner.push(st.toNonIndexed());
      }
      const [lx, lz] = at(9.0, 10.6);
      this.ledges.push({
        id: 'glowfall-shelf', x: lx, y: hy + 3.2, z: lz,
        nx: -sn, nz: cs, width: 4.2, topY: hy + 3.4,
        from: { x: lx - cs * 2.1, y: hy + 3.2, z: lz - sn * 2.1 },
        to: { x: lx + cs * 2.1, y: hy + 3.2, z: lz + sn * 2.1 },
      });
    }

    /* ---------------------------- glow fungus --------------------------- */
    // Clusters on the chamber wall and along the tunnel. Emissive shells that
    // own a `raycast`, so they light the cave without becoming geometry you
    // bump into.
    const fungusLights = [];
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2;
      const wall = rng() < 0.72;
      const rr = wall ? 7.4 : 2.0 + rng() * 4.5;
      const px = chx + Math.cos(a) * rr, pz = chz + Math.sin(a) * rr;
      const py = this.caveFloorY + (wall ? 0.5 + rng() * 4.4 : 0.08);
      const n = 2 + (rng() * 4 | 0);
      for (let k = 0; k < n; k++) {
        const s = 0.14 + rng() * 0.3;
        const cap = new THREE.SphereGeometry(s, 7, 5, 0, 6.283, 0, 1.9);
        tint(cap, k % 2 ? '#7effe0' : '#46e8ff', 0.16, rng);
        cap.applyMatrix4(composeMat(
          px + (rng() - 0.5) * 0.8, py + (rng() - 0.5) * 0.7, pz + (rng() - 0.5) * 0.8,
          rng() * 0.6, rng() * 6.28, rng() * 0.6, 1, 0.7, 1));
        B.fungus.push(cap);
      }
      // THREE emitters, tight and strong, not nine wide and weak: nine
      // overlapping 5 m pools add to >1 everywhere and the room goes flat
      // white-green. Contrast is what makes a bioluminescent cave read.
      if (i % 9 === 0) fungusLights.push(emitter(px, py, pz, '#7dffdd', 3.8, 0.95));
    }
    // fungus in the tunnel too, so the way in is legible
    for (let i = 0; i < 5; i++) {
      const [px, pz] = at(-2.0 + i * 0.35 + (i % 2 ? 2.4 : -2.4), -6.0 + i * 2.4);
      const py = this.gy(px, pz) + 1.1 + rng();
      for (let k = 0; k < 3; k++) {
        const s = 0.15 + rng() * 0.22;
        const cap = new THREE.SphereGeometry(s, 6, 4, 0, 6.283, 0, 1.9);
        tint(cap, '#5cf0e0', 0.15, rng);
        cap.applyMatrix4(composeMat(px + (rng() - 0.5) * 0.6, py + (rng() - 0.5) * 0.5, pz + (rng() - 0.5) * 0.6,
          rng() * 0.5, rng() * 6.28, rng() * 0.5, 1, 0.7, 1));
        B.fungus.push(cap);
      }
      if (i % 2 === 0) fungusLights.push(emitter(px, py, pz, '#7dffdd', 3.4, 0.8));
    }
    this.emitters.push({
      id: 'glowfall-bloom', x: chx, y: this.caveFloorY + 2.2, z: chz,
      color: 0x49e8c0, intensity: 4.4, distance: 22, flicker: 0.1,
    });

    /* ---------------- shelter dressing: a Nora cold camp ---------------- */
    {
      const fx2 = chx - 3.0, fz2 = chz + 2.4, fy = this.caveFloorY;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const st = new THREE.DodecahedronGeometry(0.22 + rng() * 0.12, 0);
        paintRock(st, 12700 + i, N);
        st.applyMatrix4(composeMat(fx2 + Math.cos(a) * 0.85, fy + 0.1, fz2 + Math.sin(a) * 0.85, rng(), rng() * 6, rng()));
        inner.push(st.toNonIndexed());
      }
      const ash = new THREE.CircleGeometry(0.72, 9);
      tint(ash, '#ff7a2c', 0.2, rng);
      ash.applyMatrix4(composeMat(fx2, fy + 0.07, fz2, -Math.PI / 2, 0, 0));
      B.ember.push(ash);
      fungusLights.push(emitter(fx2, fy + 0.5, fz2, '#ff8a3a', 4.0, 0.6));
      this.caveFire = { x: fx2, y: fy, z: fz2 };
      this.emitters.push({
        id: 'glowfall-coals', x: fx2, y: fy + 0.7, z: fz2,
        color: 0xff8a3a, intensity: 3.0, distance: 14, flicker: 0.55,
      });
      // a supply bundle and a crate
      crate(inner, inner, chx + 3.4, this.gy(chx + 3.4, chz - 1.2), chz - 1.2, 0.8, '#6e5a3c', rng, 0.6);
      this.caveCrate = { x: chx + 3.4, y: this.gy(chx + 3.4, chz - 1.2), z: chz - 1.2 };
    }
    this._recordAt('dp-caves-1', chx - 4.6, chz - 3.6, this.caveFloorY + 0.05);

    // daylight at each mouth, so the throat reads
    fungusLights.push(emitter(mx, my + 2.0, mz, '#cfe6ff', 6.5, 0.7));

    bakeVertexLight(inner, fungusLights, 0.62);
    B.stone.push(...inner);
    this._bakePlace('caves', B, { landmark: 'stone' });
  }

  /* ====================================================================== */
  /*  5. SLACKWATER CAMP — the lakeshore camp on the deep pool              */
  /* ====================================================================== */

  /**
   * The audit asks for "a lakeshore camp by the largest pool with a fishing rack
   * and a rope bridge". `water.js`'s deepest slack reach is at (-107, 54) —
   * measured, not guessed: `RiverWater._findPools()` sorts its stations by
   * `level - bed` and that one is the widest at rx 8.8 / rz 16.8. The camp sits
   * on the east bank above it; the rope bridge crosses the channel just
   * downstream so the west meadow stops being a place you wade to.
   */
  _buildLakeshore() {
    const P = this.byId.get('lakeshore-camp');
    const X = P.x, Z = P.z, g0 = P.y;
    const N = this.noise;
    const rng = mulberry32(0x5A4E);
    const B = Places.buckets();
    const WOOD = '#6a5538', DARK = '#3e3223';

    const POOL_X = -107.3, POOL_Z = 54;
    const toWater = Math.atan2(POOL_X - X, POOL_Z - Z);
    const wx0 = Math.sin(toWater), wz0 = Math.cos(toWater);

    /* --------------------------- the jetty ------------------------------ */
    {
      const J = 9.5;
      for (let i = 0; i < 7; i++) {
        const t = (i + 0.5) / 7;
        const px = X + wx0 * (3.0 + J * t), pz = Z + wz0 * (3.0 + J * t);
        const py = this.gy(px, pz);
        const deckY = g0 + 0.55;
        for (const s of [-1, 1]) {
          const ox = px - wz0 * s * 0.85, oz = pz + wx0 * s * 0.85;
          tube(B.wood, [ox, py - 1.2, oz], [ox, deckY, oz], 0.11, 0.09, DARK, 5, 0.08, rng);
        }
        box(B.wood, px, deckY + 0.06, pz, 2.0, 0.12, (J / 7) + 0.1, WOOD, rng, toWater, 0.1, 1.0);
      }
      this.jetty = { x: X + wx0 * 11, y: g0 + 0.6, z: Z + wz0 * 11 };
      // nets and floats at the end
      for (let i = 0; i < 5; i++) {
        const fl = new THREE.SphereGeometry(0.18 + rng() * 0.1, 6, 4);
        tint(fl, i % 2 ? '#a7753c' : '#7d5c3a', 0.12, rng);
        fl.applyMatrix4(composeMat(this.jetty.x + (rng() - 0.5) * 2, g0 + 0.7 + rng() * 0.2, this.jetty.z + (rng() - 0.5) * 2));
        B.wood.push(fl);
      }
    }

    /* ------------ THE SILHOUETTE: the drying mast + fish rack ----------- */
    {
      const rx = X - wx0 * 2.2 + wz0 * 3.4, rz = Z - wz0 * 2.2 - wx0 * 3.4;
      const ry = this.gy(rx, rz);
      // two heavy uprights, a 10.4 m mast, cross-stays
      tube(B.wood, [rx, ry - 0.6, rz], [rx, ry + 10.4, rz], 0.3, 0.12, DARK, 7, 0.07, rng);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.3;
        tube(B.wood, [rx + Math.cos(a) * 2.2, this.gy(rx + Math.cos(a) * 2.2, rz + Math.sin(a) * 2.2) - 0.2, rz + Math.sin(a) * 2.2],
          [rx, ry + 5.2, rz], 0.11, 0.07, WOOD, 5, 0.08, rng);
      }
      // four cross-arms hung with split fish — the readable part at distance
      for (let lvl = 0; lvl < 4; lvl++) {
        const y = ry + 3.4 + lvl * 1.7;
        const a = lvl * 0.5;
        tube(B.wood, [rx - Math.cos(a) * 2.1, y, rz - Math.sin(a) * 2.1],
          [rx + Math.cos(a) * 2.1, y, rz + Math.sin(a) * 2.1], 0.05, 0.05, WOOD, 4, 0.09, rng);
        for (let k = 0; k < 6; k++) {
          const t = (k - 2.5) * 0.68;
          const fish = new THREE.PlaneGeometry(0.22, 0.6, 1, 2);
          tint(fish, k % 2 ? '#b58a5c' : '#9c7951', 0.14, rng);
          fish.applyMatrix4(composeMat(rx + Math.cos(a) * t, y - 0.42, rz + Math.sin(a) * t, 0, a + 0.2, 0));
          B.hide.push(fish);
        }
      }
      this.fishRack = { x: rx, y: ry, z: rz };
      P.landmark = { name: 'drying mast', height: 10.4, x: rx, z: rz };
    }

    /* --------------------------- two lean-tos --------------------------- */
    for (let i = 0; i < 2; i++) {
      const a = toWater + Math.PI + (i === 0 ? -0.85 : 0.85);
      const hx = X + Math.sin(a) * 6.5, hz = Z + Math.cos(a) * 6.5;
      const hy = this.gy(hx, hz);
      const yaw = Math.atan2(X - hx, Z - hz);
      const cx = Math.sin(yaw), cz = Math.cos(yaw);
      for (const [su, sv, ph] of [[-1, -1, 2.5], [1, -1, 2.5], [-1, 1, 1.4], [1, 1, 1.4]]) {
        const ox = hx - cz * su * 1.8 + cx * sv * 1.5;
        const oz = hz + cx * su * 1.8 + cz * sv * 1.5;
        tube(B.wood, [ox, this.gy(ox, oz) - 0.2, oz], [ox, hy + ph, oz], 0.09, 0.07, WOOD, 5, 0.08, rng);
      }
      const roof = new THREE.PlaneGeometry(4.0, 3.5, 4, 3);
      const rp = roof.attributes.position;
      for (let v = 0; v < rp.count; v++) rp.setZ(v, rp.getZ(v) + Math.sin(rp.getX(v) * 2.4 + i) * 0.07);
      roof.computeVertexNormals();
      tint(roof, i ? '#8a7957' : '#7d6c4d', 0.11, rng);
      roof.applyMatrix4(composeMat(hx, hy + 1.95, hz, -Math.PI / 2 + 0.38, yaw, 0));
      B.hide.push(roof);
      // a bedroll
      box(B.hide, hx + cx * 0.3, hy + 0.14, hz + cz * 0.3, 0.75, 0.26, 1.85, '#5c4d38', rng, yaw, 0.1);
    }

    /* ---------------------------- cook fire ----------------------------- */
    {
      const fx2 = X - wx0 * 0.6, fz2 = Z - wz0 * 0.6, fy = this.gy(fx2, fz2);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const st = new THREE.DodecahedronGeometry(0.24 + rng() * 0.12, 0);
        paintRock(st, 13000 + i, N);
        st.applyMatrix4(composeMat(fx2 + Math.cos(a) * 0.95, fy + 0.12, fz2 + Math.sin(a) * 0.95, rng(), rng() * 6, rng()));
        B.stone.push(st.toNonIndexed());
      }
      const coals = new THREE.CircleGeometry(0.78, 10);
      tint(coals, '#ff8a2c', 0.2, rng);
      coals.applyMatrix4(composeMat(fx2, fy + 0.09, fz2, -Math.PI / 2, 0, 0));
      B.ember.push(coals);
      // tripod + pot
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.7;
        tube(B.wood, [fx2 + Math.cos(a) * 0.8, fy, fz2 + Math.sin(a) * 0.8], [fx2, fy + 1.5, fz2], 0.05, 0.035, DARK, 4, 0.09, rng);
      }
      const pot = new THREE.SphereGeometry(0.3, 8, 6, 0, 6.283, 0, 2.2);
      paintRust(pot, 13010, N, 0.2);
      pot.applyMatrix4(composeMat(fx2, fy + 0.85, fz2, Math.PI, 0, 0));
      B.metal.push(pot);
      this.lakeFire = { x: fx2, y: fy, z: fz2 };
      this.emitters.push({
        id: 'lakeshore-fire', x: fx2, y: fy + 0.8, z: fz2,
        color: 0xffa050, intensity: 4.2, distance: 20, flicker: 0.6,
      });
    }

    /* ------------------- the rope bridge over the channel ---------------- */
    this._ropeBridge(B, 54, rng, 'lakeshore');

    // coracle hauled up the bank
    {
      const bx2 = X + wx0 * 2.0 - wz0 * 4.5, bz2 = Z + wz0 * 2.0 + wx0 * 4.5;
      const by = this.gy(bx2, bz2);
      const hull = new THREE.SphereGeometry(1.15, 10, 6, 0, 6.283, 0, 1.55);
      hull.scale(1, 0.55, 1.5);
      tint(hull, '#6c583e', 0.1, rng);
      hull.applyMatrix4(composeMat(bx2, by + 0.45, bz2, Math.PI, rng() * 3, 0.16));
      B.wood.push(hull);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        tube(B.wood, [bx2 + Math.cos(a) * 1.05, by + 0.2, bz2 + Math.sin(a) * 1.6],
          [bx2 + Math.cos(a) * 0.9, by + 0.62, bz2 + Math.sin(a) * 1.35], 0.035, 0.03, DARK, 4, 0.1, rng);
      }
    }

    this._bakePlace('lakeshore', B, { landmark: 'matte' });
  }

  /* ====================================================================== */
  /*  6. THE FALLEN WATCHER — a downed Tallneck you climb into              */
  /* ====================================================================== */

  /**
   * A Tallneck on its side: the 26 m disc half-buried on edge, the neck laid
   * out across the grass, the head shell split open so you can walk in. HZD's
   * best environmental storytelling is a machine that has become terrain, and
   * this is the one shape in the valley that says the Tallneck at (-25, 220) is
   * not a fixture — it is a survivor.
   *
   * The interior is short on purpose (a head shell, not a dungeon): six metres
   * of ribbed cavity with a salvage crate and a relay node still drawing power.
   * The disc edge carries the silhouette at 17.4 m on the west bearing, where
   * the Cooling Stack and the Ground Station have the frame to themselves.
   */
  _buildWreck() {
    const P = this.byId.get('tallneck-wreck');
    const X = P.x, Z = P.z, g0 = P.y;
    const N = this.noise;
    const rng = mulberry32(0x7A11);
    const B = Places.buckets();
    const YAW = -0.7;
    const cs = Math.cos(YAW), sn = Math.sin(YAW);
    const at = (u, v) => [X + cs * u - sn * v, Z + sn * u + cs * v];

    /* ------------------- the disc, on edge, half-buried ------------------ */
    /**
     * BUILT FLAT, THEN STOOD UP. The first pass placed every rim, ring and
     * spoke directly in world space with its own trigonometry, and the spokes
     * came out as a bird's nest — shot from 40 m it read as a tangle of pipe,
     * not as a wheel. A disc is a disc in ONE plane: build it in local XY with
     * the axis down local Z, then apply a single matrix that yaws it and tips
     * it onto its edge. Every part then agrees by construction.
     */
    {
      const [dx, dz] = at(0, 13.0);
      const dy = this.gy(dx, dz);
      const R = 11.5;
      const parts = [];
      // rim band
      const rim = new THREE.CylinderGeometry(R, R, 2.5, 24, 1, true);
      rim.rotateX(Math.PI / 2);
      paintRust(rim, 14000, N, 6.0, 1.3);
      parts.push(rim.toNonIndexed());
      // hub
      const hub = new THREE.CylinderGeometry(1.7, 1.7, 3.1, 12);
      hub.rotateX(Math.PI / 2);
      paintRust(hub, 14005, N, 6.0, 1.0);
      parts.push(hub.toNonIndexed());
      // two faces: three concentric rings and eight radial spokes each
      for (const sz of [-1.25, 1.25]) {
        for (let ring = 0; ring < 3; ring++) {
          const rr = R * (0.38 + ring * 0.29);
          const tor = new THREE.TorusGeometry(rr, 0.2 + ring * 0.05, 5, 22);
          paintRust(tor, 14010 + ring * 3 + (sz > 0 ? 1 : 0), N, 6.0, 1.1);
          tor.translate(0, 0, sz);
          parts.push(tor.toNonIndexed());
        }
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const sp = new THREE.BoxGeometry(0.4, R * 0.92, 0.26, 1, 6, 1);
          paintRust(sp, 14050 + k + (sz > 0 ? 9 : 0), N, 6.0, 1.1);
          sp.translate(0, R * 0.46, sz);
          sp.rotateZ(a);
          parts.push(sp.toNonIndexed());
        }
      }
      // the sensor blades that make it a Tallneck disc and not a cartwheel
      for (let k = 0; k < 5; k++) {
        const a = -0.9 + k * 0.45;
        const bl = new THREE.BoxGeometry(0.9, 3.6, 0.5, 1, 3, 1);
        paintRust(bl, 14080 + k, N, 6.0, 1.2);
        bl.translate(0, R * 0.86, 0);
        bl.rotateZ(a);
        parts.push(bl.toNonIndexed());
      }
      const M = composeMat(dx, dy + 6.0, dz, 0, YAW, 0.2);
      for (const g of parts) { g.applyMatrix4(M); B.metal.push(g); }
      // a talus skirt where it bit into the ground
      for (let i = 0; i < 16; i++) {
        const a = Math.PI + (rng() - 0.5) * 2.2;
        const px = dx + Math.cos(a) * (3 + rng() * 9), pz = dz + Math.sin(a) * (1.5 + rng() * 3.5);
        const s2 = 0.5 + rng() * rng() * 2.1;
        const lump = new THREE.DodecahedronGeometry(s2, 0);
        paintRock(lump, 14100 + i, N);
        lump.applyMatrix4(composeMat(px, this.gy(px, pz) + s2 * 0.3, pz, rng(), rng() * 6.28, rng(), 1, 0.66, 1));
        B.stone.push(lump);
      }
      this.wreckDisc = { x: dx, y: dy, z: dz, height: 17.6 };
      P.landmark = { name: 'disc edge', height: 17.6, x: dx, z: dz };
    }

    /* ------------------------ the neck, laid out ------------------------ */
    for (let i = 0; i < 9; i++) {
      const v = 9.5 - i * 2.4;
      const [px, pz] = at(i * 0.28, v);
      const py = this.gy(px, pz);
      const r = 1.85 - i * 0.075;
      const seg = new THREE.CylinderGeometry(r, r * 0.97, 2.35, 12, 1, true);
      paintRust(seg, 14200 + i * 7, N, 1.6, 1.2);
      seg.applyMatrix4(composeMat(px, py + r * 0.72, pz, Math.PI / 2 + 0.06, YAW + i * 0.02, 0));
      B.metal.push(seg);
      // vertebra collar
      const col = new THREE.TorusGeometry(r * 1.06, 0.2, 5, 12);
      paintRust(col, 14220 + i, N, 1.6, 1.0);
      col.applyMatrix4(composeMat(px, py + r * 0.72, pz, 0.06, YAW + i * 0.02, Math.PI / 2));
      B.metal.push(col);
      // a rib arch springing off it, every third segment
      if (i % 3 === 1) {
        for (const s of [-1, 1]) {
          rustTube(B.metal, [px, py + r * 0.72, pz],
            [px - sn * s * (r + 2.2), py + 0.2, pz + cs * s * (r + 2.2)], 0.2, 0.12, 14240 + i * 3 + s, N, 5);
        }
      }
    }

    /* ---------------- the head shell: the interior you climb in --------- */
    const [hx, hz] = at(1.6, -13.5);
    const hy = this.gy(hx, hz);
    this.wreckHead = new THREE.Vector3(hx, hy, hz);
    const inner = [];
    {
      // an open-ended shell: upper half only, so there IS a way in
      const shell = new THREE.CylinderGeometry(3.3, 3.0, 8.6, 14, 3, true, -0.15, Math.PI * 1.5);
      paintRust(shell, 14300, N, 2.6, 1.25);
      shell.applyMatrix4(composeMat(hx, hy + 2.1, hz, Math.PI / 2, YAW + 0.25, 0));
      inner.push(shell.toNonIndexed());
      // floor plate inside, terrain-conformed
      for (let i = -2; i <= 2; i++) {
        const [px, pz] = at(1.6 + i * 1.8 * sn * 0 + 0, -13.5 + i * 1.8);
        plate(inner, px, this.gy(px, pz) - 0.10, pz, 4.2, 0.28, 1.9, 14310 + i, N, YAW, 0, 1.3);
      }
      // a cracked-open brow plate you step over
      plate(B.metal, ...(() => { const [ax, az] = at(1.6, -18.2); return [ax, this.gy(ax, az) + 0.5, az]; })(),
        5.2, 0.5, 3.4, 14320, N, YAW, -0.34, 1.6);
      // ribs inside
      for (let i = 0; i < 5; i++) {
        const [px, pz] = at(1.6, -16.0 + i * 1.7);
        const rib = new THREE.TorusGeometry(3.05, 0.17, 5, 14, Math.PI * 1.35);
        paintRust(rib, 14330 + i, N, 2.4, 1.1);
        rib.applyMatrix4(composeMat(px, this.gy(px, pz) + 0.2, pz, 0, YAW + 0.25, -0.1));
        inner.push(rib.toNonIndexed());
      }
      // the relay core: still powered, the reason to come in
      {
        const [tx, tz] = at(1.6, -10.4);
        const ty = this.gy(tx, tz);
        plate(inner, tx, ty + 0.9, tz, 1.8, 1.8, 1.2, 14400, N, YAW, 0, 1.2);
        const core = new THREE.IcosahedronGeometry(0.62, 1);
        tint(core, '#9ff0ff', 0.05, rng);
        core.applyMatrix4(composeMat(tx, ty + 2.1, tz));
        B.holo.push(core);
        const halo = new THREE.TorusGeometry(1.0, 0.06, 5, 16);
        tint(halo, '#7fd8ff', 0.06, rng);
        halo.applyMatrix4(composeMat(tx, ty + 2.1, tz, Math.PI / 2 + 0.4, 0, 0));
        B.holo.push(halo);
        this.wreckRelay = { x: tx, y: ty, z: tz };
        this.emitters.push({
          id: 'wreck-relay', x: tx, y: ty + 2.2, z: tz,
          color: 0x7fd8ff, intensity: 3.6, distance: 17, flicker: 0.15,
        });
      }
      // salvage crates wedged against the ribs
      this.wreckCrates = [];
      for (let i = 0; i < 2; i++) {
        const [cx2, cz2] = at(1.6 + (i ? 1.7 : -1.7), -13.0 - i * 1.6);
        const cy = this.gy(cx2, cz2);
        plate(inner, cx2, cy + 0.45, cz2, 0.9, 0.9, 0.85, 14420 + i, N, rng() * 3, 0, 1);
        this.wreckCrates.push({ id: `wreck-salvage-${i}`, x: cx2, y: cy, z: cz2 });
      }
      this._recordAt('dp-wreck-1', ...at(-1.6, -11.8));

      // a grab edge on the brow plate — this is how you get up onto the neck
      {
        const [lx, lz] = at(1.6, -17.0);
        this.ledges.push({
          id: 'wreck-brow', x: lx, y: hy + 1.15, z: lz,
          nx: sn, nz: -cs, width: 4.4, topY: hy + 1.3,
          from: { x: lx - cs * 2.2, y: hy + 1.15, z: lz - sn * 2.2 },
          to: { x: lx + cs * 2.2, y: hy + 1.15, z: lz + sn * 2.2 },
        });
      }
    }
    bakeVertexLight(inner, [
      emitter(this.wreckRelay.x, this.wreckRelay.y + 2.1, this.wreckRelay.z, '#7fd8ff', 5.0, 1.5),
      emitter(hx, hy + 2.0, hz, '#cfe6ff', 8.0, 1.0),
    ], 0.68);
    B.metal.push(...inner);

    /* ------------------- scavenger camp on the flank -------------------- */
    {
      const [sx, sz] = at(-9.5, -6.0);
      const sy = this.gy(sx, sz);
      for (const s of [-1, 1]) {
        tube(B.wood, [sx + s * 1.7, sy - 0.2, sz], [sx, sy + 2.2, sz + 0.4], 0.09, 0.06, '#5e4b32', 5, 0.09, rng);
      }
      const tarp = new THREE.PlaneGeometry(3.6, 2.8, 4, 3);
      tint(tarp, '#6c5a41', 0.12, rng);
      tarp.applyMatrix4(composeMat(sx, sy + 1.5, sz + 0.3, -1.1, 0.3, 0));
      B.hide.push(tarp);
      for (let i = 0; i < 5; i++) {
        crate(B.wood, B.wood, sx + (rng() - 0.5) * 4, this.gy(sx + (rng() - 0.5) * 4, sz + (rng() - 0.5) * 4) , sz + (rng() - 0.5) * 4,
          0.55 + rng() * 0.3, '#735e3e', rng, rng() * 3);
      }
      this.wreckCamp = { x: sx, y: sy, z: sz };
    }

    this._bakePlace('wreck', B, { landmark: 'metal' });
  }

  /* ====================================================================== */
  /*  CROSSINGS AND CLUTTER                                                 */
  /* ====================================================================== */

  /**
   * Rope bridge over the dried channel at station `z`. Two towers, a catenary
   * deck of planks and four hand lines. Built into the caller's buckets so it
   * bakes with its owning place; the free-standing ones get their own.
   */
  _ropeBridge(B, z, rng, tag) {
    const N = this.noise;
    const cx = -125 + 38 * Math.sin(z * 0.008) + 14 * Math.sin(z * 0.023 + 1.7);
    const hw = 13 + 3 * Math.sin(z * 0.021 + 0.5);
    const ax = cx - hw * 1.28, bx = cx + hw * 1.28;
    const ay = this.gy(ax, z), by = this.gy(bx, z);
    const deckA = Math.max(ay, by) + 1.9;
    const deckB = deckA;
    const WOOD = '#6a5538', DARK = '#3c3223', ROPE = '#9a8966';

    // towers
    for (const [tx, ty] of [[ax, ay], [bx, by]]) {
      for (const s of [-1, 1]) {
        tube(B.wood, [tx, ty - 0.6, z + s * 1.25], [tx, deckA + 2.3, z + s * 1.05], 0.22, 0.15, DARK, 6, 0.07, rng);
      }
      tube(B.wood, [tx, deckA + 2.2, z - 1.05], [tx, deckA + 2.2, z + 1.05], 0.11, 0.11, WOOD, 5, 0.08, rng);
      // approach ramp so you can step on
      box(B.wood, tx + (tx < cx ? -1.4 : 1.4), (ty + deckA) * 0.5, z, 3.0, 0.16, 2.0, WOOD, rng,
        0, 0.1, 1.0);
    }
    // deck planks along a catenary
    const SPAN = bx - ax, SAG = 1.35;
    const STEPS = Math.max(10, Math.round(SPAN / 1.35));
    for (let i = 0; i < STEPS; i++) {
      const t = (i + 0.5) / STEPS;
      const px = ax + SPAN * t;
      const py = deckA + (deckB - deckA) * t - Math.sin(t * Math.PI) * SAG;
      box(B.wood, px, py, z, SPAN / STEPS + 0.08, 0.09, 1.7, i % 3 === 0 ? DARK : WOOD, rng, 0, 0.12);
    }
    // four lines: two under the deck, two at hand height
    for (const s of [-1, 1]) {
      rope(B.wood, [ax, deckA - 0.1, z + s * 0.9], [bx, deckB - 0.1, z + s * 0.9], SAG, 0.055, ROPE, rng, 9);
      rope(B.wood, [ax, deckA + 2.1, z + s * 1.0], [bx, deckB + 2.1, z + s * 1.0], SAG * 0.72, 0.045, ROPE, rng, 9);
      // hangers
      for (let i = 1; i < 8; i++) {
        const t = i / 8;
        const px = ax + SPAN * t;
        const y0 = deckA + 2.1 - Math.sin(t * Math.PI) * SAG * 0.72;
        const y1 = deckA - 0.1 - Math.sin(t * Math.PI) * SAG;
        tube(B.wood, [px, y0, z + s * 1.0], [px, y1, z + s * 0.9], 0.02, 0.02, ROPE, 4, 0.1, rng);
      }
    }
    (this.crossings ??= []).push({
      id: `bridge-${tag}`, z, x: cx, westY: ay, eastY: by, deckY: deckA, kind: 'rope',
    });
  }

  /** A plank walk: three braced spans on trestles, for the shallow south bend. */
  _plankWalk(B, z, rng, tag = 'plank') {
    const cx = -125 + 38 * Math.sin(z * 0.008) + 14 * Math.sin(z * 0.023 + 1.7);
    const hw = 13 + 3 * Math.sin(z * 0.021 + 0.5);
    const ax = cx - hw * 1.2, bx = cx + hw * 1.2;
    const WOOD = '#6a5538', DARK = '#3c3223';
    const SPAN = bx - ax;
    const TRESTLES = 5;
    for (let i = 0; i <= TRESTLES; i++) {
      const px = ax + (SPAN * i) / TRESTLES;
      const pg = this.gy(px, z);
      const top = Math.max(this.gy(ax, z), this.gy(bx, z)) + 0.55;
      for (const s of [-1, 1]) {
        tube(B.wood, [px, pg - 0.5, z + s * 1.0], [px, top, z + s * 0.75], 0.13, 0.1, DARK, 5, 0.08, rng);
      }
      tube(B.wood, [px, top - 0.08, z - 0.8], [px, top - 0.08, z + 0.8], 0.08, 0.08, WOOD, 4, 0.08, rng);
      // hand rail posts on alternate trestles
      if (i % 2 === 0) {
        tube(B.wood, [px, top, z + 0.8], [px, top + 1.0, z + 0.8], 0.06, 0.05, DARK, 4, 0.09, rng);
      }
    }
    const top = Math.max(this.gy(ax, z), this.gy(bx, z)) + 0.55;
    const STEPS = Math.max(12, Math.round(SPAN / 1.2));
    for (let i = 0; i < STEPS; i++) {
      const px = ax + ((i + 0.5) * SPAN) / STEPS;
      box(B.wood, px, top + 0.06, z, SPAN / STEPS + 0.06, 0.1, 1.6, i % 4 === 0 ? DARK : WOOD, rng, 0, 0.12);
    }
    tube(B.wood, [ax, top + 1.0, z + 0.8], [bx, top + 1.0, z + 0.8], 0.045, 0.045, '#9a8966', 4, 0.09, rng);
    (this.crossings ??= []).push({ id: `bridge-${tag}`, z, x: cx, deckY: top, kind: 'plank' });
  }

  /**
   * The three free-standing crossings (the lakeshore one bakes with its camp).
   *
   * ONE BAKE PER CROSSING, and that is a perf decision with a measurement
   * behind it. The first pass merged all three into one mesh whose bounding
   * sphere was 122 m — and `engine._cullPass` ranks shadow casters by
   * `distance - radius`, which clamps to ZERO for a sphere that big. A single
   * merged bridge therefore won the shadow budget from the camp on every
   * bearing, drew in every frustum, and cost 6 draws that a bridge 130 m away
   * has no business costing. Split, each one is r ~ 20 m and culls.
   */
  _buildCrossings() {
    const rng = mulberry32(0xB21D);
    for (const C of CROSSINGS) {
      const B = Places.buckets();
      if (C.kind === 'rope') this._ropeBridge(B, C.z, rng, C.id);
      else this._plankWalk(B, C.z, rng, C.id);
      this._bakePlace(C.id, B, { near: 130, glowNear: 90 });
    }
  }

  /**
   * Ruin clutter along the channel and the old road line. Deliberately small
   * and scattered — this is the connective tissue between the six places, not a
   * seventh one, so nothing here gets an interactable or a site record.
   */
  _buildClutter() {
    const N = this.noise;
    const rng = mulberry32(0xC1E7);
    const SPOTS = [
      [-138, -104], [-118, 6], [-96, 122], [-84, 186], [-150, -152],
      [58, -156], [176, -46], [208, 62], [-26, 176], [92, 196],
      [-168, 176], [136, 118],
    ];
    for (let s = 0; s < SPOTS.length; s++) {
      const B = Places.buckets();
      const [sx, sz] = SPOTS[s];
      const sy = this.gy(sx, sz);
      const kind = s % 3;
      if (kind === 0) {
        // a toppled slab pile with rebar
        for (let i = 0; i < 4; i++) {
          const a = rng() * 6.28, d = rng() * 3.4;
          slab(B.stone, sx + Math.cos(a) * d, sy + 0.3 + i * 0.22, sz + Math.sin(a) * d,
            2.4 + rng() * 2.2, 0.42, 1.8 + rng(), 15000 + s * 11 + i, N, rng() * 3, 1.7);
        }
        for (let i = 0; i < 5; i++) {
          const a = rng() * 6.28;
          rustTube(B.metal, [sx + Math.cos(a) * 1.4, sy + 0.4, sz + Math.sin(a) * 1.4],
            [sx + Math.cos(a) * 2.2, sy + 1.6 + rng(), sz + Math.sin(a) * 2.2], 0.05, 0.035, 15100 + s * 7 + i, N, 4);
        }
      } else if (kind === 1) {
        // a stripped vehicle hulk
        plate(B.metal, sx, sy + 0.75, sz, 2.3, 1.1, 5.0, 15200 + s, N, rng() * 3, 0.04, 1.5);
        for (let i = 0; i < 4; i++) {
          const ox = sx + (i < 2 ? -0.95 : 0.95), oz = sz + (i % 2 ? -1.8 : 1.8);
          const hub = new THREE.CylinderGeometry(0.52, 0.52, 0.34, 8);
          paintRust(hub, 15220 + s + i, N, 0.4);
          hub.applyMatrix4(composeMat(ox, this.gy(ox, oz) + 0.4, oz, 0, 0, Math.PI / 2));
          B.metal.push(hub);
        }
        plate(B.metal, sx, sy + 1.5, sz - 1.1, 2.0, 0.5, 1.6, 15240 + s, N, 0, -0.5, 1.2);
      } else {
        // a pipe run half out of the silt
        for (let i = 0; i < 3; i++) {
          const a = 0.4 + i * 0.5 + rng() * 0.3;
          rustTube(B.metal,
            [sx - Math.cos(a) * 4.5, sy + 0.35 + i * 0.3, sz - Math.sin(a) * 4.5],
            [sx + Math.cos(a) * 4.5, sy + 0.25 + i * 0.3, sz + Math.sin(a) * 4.5],
            0.42 - i * 0.08, 0.42 - i * 0.08, 15300 + s * 5 + i, N, 7);
        }
        for (let i = 0; i < 3; i++) {
          const a = rng() * 6.28, d = 2 + rng() * 3;
          const lump = new THREE.DodecahedronGeometry(0.5 + rng() * 0.6, 0);
          paintRock(lump, 15330 + s * 3 + i, N);
          lump.applyMatrix4(composeMat(sx + Math.cos(a) * d, this.gy(sx + Math.cos(a) * d, sz + Math.sin(a) * d) + 0.3,
            sz + Math.sin(a) * d, rng(), rng() * 6.28, rng()));
          B.stone.push(lump);
        }
      }
      /**
       * ONE BAKE PER SPOT, AND NO SHADOWS. Merged into one mesh these twelve
       * spanned the valley (bounding sphere 247 m), so they were in every
       * frustum and — because the caster ranking is `distance - radius` — they
       * took the top of the shadow budget away from the camp itself. Split and
       * shadow-free, ground debris costs one culled draw instead of six
       * guaranteed ones. A half-buried slab's own shadow is a centimetre wide;
       * this is the cheapest honest saving in the lane.
       */
      this._bakePlace(`clutter-${s}`, B, { castShadow: false, near: 95, glowNear: 80 });
    }
  }

  /* ====================================================================== */
  /*  RECORDS, INTERACTABLES, PROGRESSION                                   */
  /* ====================================================================== */

  /** Stash a record's final world position; `_placeRecords` hands it over. */
  _recordAt(id, x, z, y = null) {
    const r = this.records.find((k) => k.id === id);
    if (r) { r.x = x; r.z = z; r.y = y ?? this.gy(x, z) + 0.05; }
  }

  /**
   * The four new Old-World records go through `focus-items`' store, exactly the
   * way `activities.js`' twelve do — there must be ONE datapoint system in the
   * world (`A61c-datapoints-unified` asserts pickups === store records, by
   * identity), so this lane never registers a `DATAPOINT` entry of its own. The
   * store reserves `DATAPOINTS.length + 8` instances and returns `null` rather
   * than growing, so widen it first with the helper `activities.js` already
   * owns for this exact problem.
   */
  _placeRecords() {
    if (this._recordsPlaced) return;
    const store = this.ctx.items?.datapoints;
    if (!store || typeof store.place !== 'function') return;
    this._recordsPlaced = true;
    this.props.activities?._ensureStoreCapacity?.(store, this.records.length);
    for (const r of this.records) {
      const rec = store.place({
        id: r.id, title: r.title, category: r.category, author: r.author,
        body: r.body, x: r.x, z: r.z, y: r.y,
      });
      r.placed = !!rec;
    }
  }

  /**
   * `ctx.interactables` is built after `Props`, so registration is deferred to
   * the first frame that finds it. Runs its work exactly once.
   */
  ensureRegistered() {
    if (this._registered || !this.ctx.interactables) return false;
    this._registered = true;
    this._register();
    this._placeRecords();
    return true;
  }

  /** Register one entry and file it under its place. */
  _reg(placeId, spec) {
    const I = this.ctx.interactables;
    const P = this.byId.get(placeId);
    const entry = I.register({ ...spec, place: placeId });
    this.entries.push(entry);
    if (P) P.interactables.push(entry);
    return entry;
  }

  _register() {
    const ctx = this.ctx;
    const ev = ctx.events;

    /* ---------------------------- outpost -------------------------------- */
    {
      const b = this.emitters.find((e) => e.id === 'outpost-brazier');
      this._reg('outpost-ridgeback', {
        position: { x: b.x, y: b.y - 0.4, z: b.z }, radius: 2.8, hold: 0.6,
        label: 'TEND BRAZIER', site: 'outpost-brazier',
        onInteract: () => {
          this.brazierTended = true;
          ctx.progression?.award?.({ xp: 20, reason: 'outpost-brazier', id: 'outpost-ridgeback' });
          ev.emit('outpost-brazier', { id: 'outpost-ridgeback', x: b.x, z: b.z });
        },
      });
      const r = this.outpostRack;
      this._reg('outpost-ridgeback', {
        position: { x: r.x, y: r.y + 1.2, z: r.z }, radius: 2.6, hold: 0.55,
        label: 'HIDE RACK', once: true, site: 'outpost-rack',
        loot: [{ id: 'boar-hide', n: 2 }, { id: 'ridge-wood', n: 4 }],
        sourceName: 'RIDGEBACK HIDE RACK',
        onInteract: () => ev.emit('outpost-supply', { id: 'ridgeback-rack' }),
      });
      const L = this.outpostLookout;
      this._reg('outpost-ridgeback', {
        position: { x: L.x, y: L.y - 9.4, z: L.z }, radius: 3.4, hold: 0.9,
        label: 'SURVEY FROM THE POST', site: 'outpost-survey',
        onInteract: () => {
          this.surveyed = true;
          ctx.progression?.award?.({ xp: 40, reason: 'outpost-survey', id: 'outpost-ridgeback' });
          ev.emit('outpost-survey', {
            id: 'outpost-ridgeback',
            reveals: this.places.map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, kind: p.kind })),
          });
        },
      });
    }

    /* ---------------------------- cauldron ------------------------------- */
    {
      for (const c of this.cauldronCrates) {
        this._reg('cauldron-kappa', {
          position: { x: c.x, y: c.y + 0.9, z: c.z }, radius: 2.2, hold: 0.55,
          label: 'MACHINE PARTS', once: true, site: 'cauldron-parts',
          sourceName: 'KAPPA PARTS CRATE',
          loot: [{ id: 'metal-shards', n: 26 }, { id: 'wire', n: 2 }, { id: 'sparker', n: 2 }],
          onInteract: () => ev.emit('cauldron-parts', { id: c.id, site: 'cauldron-kappa' }),
        });
      }
      const t = this.cauldronTerminal;
      this._reg('cauldron-kappa', {
        position: { x: t.x, y: t.y + 1.7, z: t.z }, radius: 2.8, hold: 1.2,
        label: 'OVERRIDE TERMINAL', once: true, site: 'cauldron-override',
        onInteract: () => {
          this.cauldronOverridden = true;
          ctx.progression?.award?.({ xp: 200, reason: 'cauldron-override', id: 'cauldron-kappa' });
          ctx.progression?.discover?.('cauldron-kappa', { label: 'Cauldron KAPPA' });
          ev.emit('cauldron-override', {
            id: 'cauldron-kappa', x: t.x, z: t.z,
            reveals: this.props.activities?.revealList?.() ?? [],
          });
          ctx.audio?.play2D?.('machine/alarm', { category: 'ui', volume: 0.32 });
        },
      });
    }

    /* ----------------------------- arena --------------------------------- */
    {
      const b = this.trialBoard;
      this._reg('hunting-arena', {
        position: { x: b.x, y: b.y + 1.7, z: b.z }, radius: 2.8, hold: 0.6,
        label: 'TRIAL BOARD', site: 'arena-board',
        onInteract: () => {
          this.boardRead = true;
          ctx.progression?.discover?.('hunting-arena', { label: 'Ridge Trial Ground' });
          ev.emit('trial-board', {
            id: 'hunting-arena',
            trials: this.props.trials ?? [],
            dummies: this.dummies.length,
          });
        },
      });
      const r = this.arenaRack;
      this._reg('hunting-arena', {
        position: { x: r.x, y: r.y + 1.1, z: r.z }, radius: 2.4, hold: 0.5,
        label: 'PRACTICE ARROWS', once: true, site: 'arena-rack',
        sourceName: 'TRIAL WEAPON RACK',
        loot: [{ id: 'ridge-wood', n: 6 }, { id: 'metal-shards', n: 12 }],
        onInteract: () => ev.emit('arena-rack', { id: 'hunting-arena' }),
      });
      for (const d of this.dummies) {
        this._reg('hunting-arena', {
          position: { x: d.x, y: d.y + 2.0, z: d.z }, radius: 2.0, hold: 0.4,
          label: 'RESET DUMMY', site: 'arena-dummy',
          onInteract: () => {
            if (!d.struck) {
              d.struck = true;
              ctx.progression?.award?.({ xp: 8, reason: 'arena-dummy', id: d.id });
            }
            ev.emit('arena-dummy', { id: d.id, reset: true });
          },
        });
      }
    }

    /* ----------------------------- caves --------------------------------- */
    {
      const c = this.caveCrate;
      this._reg('caves-glowfall', {
        position: { x: c.x, y: c.y + 0.9, z: c.z }, radius: 2.2, hold: 0.55,
        label: 'SHELTER CACHE', once: true, site: 'cave-cache',
        sourceName: 'GLOWFALL SHELTER CACHE',
        loot: [{ id: 'medicinal-herb', n: 5 }, { id: 'lean-meat', n: 3 }, { id: 'echo-shell', n: 1 }],
        onInteract: () => ev.emit('cave-cache', { id: 'glowfall-cache' }),
      });
      const f = this.caveFire;
      this._reg('caves-glowfall', {
        position: { x: f.x, y: f.y + 0.6, z: f.z }, radius: 2.6, hold: 0.7,
        label: 'BANK THE COALS', site: 'cave-fire',
        onInteract: () => {
          ctx.progression?.award?.({ xp: 15, reason: 'cave-fire', id: 'caves-glowfall' });
          ev.emit('cave-fire', { id: 'caves-glowfall' });
        },
      });
      // the fungus itself: a gather, so the cave pays you for finding it
      this._reg('caves-glowfall', {
        position: { x: this.caveChamber.x + 5.2, y: this.caveChamber.y + 0.8, z: this.caveChamber.z + 3.0 },
        radius: 2.4, hold: 0.5, label: 'GLOW-FUNGUS', once: true, site: 'cave-fungus',
        sourceName: 'GLOWFALL BLOOM',
        loot: [{ id: 'medicinal-herb', n: 3 }],
        onInteract: () => ev.emit('cave-fungus', { id: 'glowfall-bloom' }),
      });
    }

    /* --------------------------- lakeshore ------------------------------- */
    {
      const r = this.fishRack;
      this._reg('lakeshore-camp', {
        position: { x: r.x, y: r.y + 1.4, z: r.z }, radius: 2.8, hold: 0.55,
        label: 'FISHING RACK', once: true, site: 'lake-rack',
        sourceName: 'SLACKWATER DRYING RACK',
        loot: [{ id: 'lean-meat', n: 4 }, { id: 'bone', n: 2 }],
        onInteract: () => ev.emit('lakeshore-rack', { id: 'lakeshore-camp' }),
      });
      const f = this.lakeFire;
      this._reg('lakeshore-camp', {
        position: { x: f.x, y: f.y + 0.6, z: f.z }, radius: 2.6, hold: 0.7,
        label: 'COOK FIRE', site: 'lake-fire',
        onInteract: () => {
          ctx.progression?.award?.({ xp: 15, reason: 'lake-fire', id: 'lakeshore-camp' });
          ev.emit('lakeshore-fire', { id: 'lakeshore-camp' });
        },
      });
      const j = this.jetty;
      this._reg('lakeshore-camp', {
        position: { x: j.x, y: j.y + 0.5, z: j.z }, radius: 2.6, hold: 0.6,
        label: 'HAUL THE NETS', once: true, site: 'lake-nets',
        sourceName: 'SLACKWATER NETS',
        loot: [{ id: 'lean-meat', n: 3 }, { id: 'fatty-meat', n: 1 }],
        onInteract: () => ev.emit('lakeshore-nets', { id: 'lakeshore-camp' }),
      });
    }

    /* ----------------------------- wreck --------------------------------- */
    {
      for (const c of this.wreckCrates) {
        this._reg('tallneck-wreck', {
          position: { x: c.x, y: c.y + 0.9, z: c.z }, radius: 2.2, hold: 0.55,
          label: 'SALVAGE', once: true, site: 'wreck-salvage',
          sourceName: 'FALLEN WATCHER SALVAGE',
          loot: [{ id: 'metal-shards', n: 30 }, { id: 'metal-vessel', n: 1 }, { id: 'wire', n: 3 }],
          onInteract: () => ev.emit('wreck-salvage', { id: c.id }),
        });
      }
      const r = this.wreckRelay;
      this._reg('tallneck-wreck', {
        position: { x: r.x, y: r.y + 1.6, z: r.z }, radius: 2.6, hold: 1.1,
        label: 'RELAY NODE', once: true, site: 'wreck-relay',
        onInteract: () => {
          this.relayTapped = true;
          ctx.progression?.award?.({ xp: 120, reason: 'wreck-relay', id: 'tallneck-wreck' });
          ctx.progression?.discover?.('tallneck-wreck', { label: 'The Fallen Watcher' });
          ev.emit('wreck-relay', {
            id: 'tallneck-wreck', x: r.x, z: r.z,
            reveals: this.places.map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, kind: p.kind })),
          });
        },
      });
    }
  }

  /* ====================================================================== */
  /*  PUBLISHED API                                                         */
  /* ====================================================================== */

  /**
   * Every new place, in the shape `machine-ai` and `progression` asked for:
   * `{ id, name, kind, position, radius, x, z, discovered, interactables }`.
   */
  sites() {
    return this.places.map((p) => ({
      kind: p.kind, id: p.id, x: p.x, z: p.z, y: p.y,
      name: p.name, position: p.position, radius: p.radius,
      done: p.discovered, place: true, blurb: p.blurb,
    }));
  }

  /**
   * Recompute which meshes are close enough to the CAMERA to be submitted.
   *
   * Called every frame from `update()` — 45 distance tests with no allocation
   * is nothing — and PUBLISHED because any path that moves the camera without
   * running a sim frame has to call it: photo mode, a cutscene, a gate that
   * teleports the lens and calls `engine.render()` directly. The first version
   * ticked on a 0.28 s timer instead, and `V42-interior` caught the hole
   * immediately: it puts the lens inside the cauldron and renders on the spot,
   * so the chamber's own glow meshes were still hidden from when the player was
   * 190 m away and the frame came back with an unlit pit.
   */
  refreshVisibility() {
    const cam = this.ctx.camera.position;
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i];
      const u = m.userData;
      if (u.showDist === Infinity) continue;
      const dx = u.cx - cam.x, dy = u.cy - cam.y, dz = u.cz - cam.z;
      const lim = u.showDist + u.br;
      m.visible = dx * dx + dy * dy + dz * dz <= lim * lim;
    }
  }

  /** The nearest place whose radius contains (x, z), or null. Alloc-free. */
  placeAt(x, z) {
    let best = null, bestD = Infinity;
    for (let i = 0; i < this.places.length; i++) {
      const p = this.places[i];
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < p.radius * p.radius && d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  /* ====================================================================== */
  /*  UPDATE                                                                */
  /* ====================================================================== */

  /**
   * Two jobs, both allocation-free: fire the discovery hook the first time the
   * player walks into a place, and steer the single shared `PointLight` to
   * whichever emitter she is nearest.
   */
  update(dt, t) {
    this.ensureRegistered();
    const p = this.ctx.player?.position;
    if (!p) return;

    /* ---- discovery ---- */
    for (let i = 0; i < this.places.length; i++) {
      const P = this.places[i];
      if (P.discovered) continue;
      const dx = P.x - p.x, dz = P.z - p.z;
      if (dx * dx + dz * dz > P.radius * P.radius) continue;
      P.discovered = true;
      this.ctx.progression?.discover?.(P.id, { label: P.name, xp: 50 });
      this.ctx.events.emit('place-discovered', {
        id: P.id, name: P.name, kind: P.kind, x: P.x, z: P.z, radius: P.radius,
      });
    }

    /* ---- draw distance ---- */
    this.refreshVisibility();

    /* ---- the shared light ---- */
    let near = null, nearD = 70 * 70;
    for (let i = 0; i < this.emitters.length; i++) {
      const E = this.emitters[i];
      const dx = E.x - p.x, dy = E.y - p.y, dz = E.z - p.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < nearD) { nearD = d; near = E; }
    }
    const L = this.light;
    if (near !== this._lightOn) {
      // hand over only once the old one is dark, so nothing pops across 40 m
      if (L.intensity > 0.05) {
        L.intensity = Math.max(0, L.intensity - dt * 22);
      } else {
        this._lightOn = near;
        if (near) {
          L.position.set(near.x, near.y, near.z);
          L.color.setHex(near.color);
          L.distance = near.distance;
        }
      }
    } else if (near) {
      const want = near.intensity * (1 - Math.min(1, Math.sqrt(nearD) / 46));
      const flick = near.flicker
        ? 1 + near.flicker * 0.18 * (Math.sin(t * 9.3 + near.x) + 0.6 * Math.sin(t * 21.7 + near.z))
        : 1;
      L.intensity += (want * flick - L.intensity) * Math.min(1, dt * 5.5);
    } else if (L.intensity > 0) {
      L.intensity = Math.max(0, L.intensity - dt * 12);
    }
  }

  /* ====================================================================== */
  /*  DISPOSE                                                               */
  /* ====================================================================== */

  /**
   * MEMORY RULE. Everything this module builds has to come back: the app
   * crashed on memory this round, so a place that can be created and never
   * released is a bug even if nothing releases it today.
   */
  dispose() {
    const I = this.ctx.interactables;
    for (const e of this.entries) I?.unregister?.(e);
    this.entries.length = 0;
    for (const p of this.places) p.interactables.length = 0;

    for (const m of this.meshes) {
      m.geometry?.dispose?.();
      if (m.parent) m.parent.remove(m);
    }
    this.meshes.length = 0;

    if (this.light) {
      this.light.dispose?.();
      if (this.light.parent) this.light.parent.remove(this.light);
      this.light = null;
    }
    if (this.group.parent) this.group.parent.remove(this.group);
    this.group.clear();

    disposePlaceMaterials();
    this.emitters.length = 0;
    this.ledges.length = 0;
    this.npcSlots.length = 0;
    this.places.length = 0;
    this.byId.clear();
  }
}
