import * as THREE from 'three';

/**
 * ROUND 4 — lane `world-props`, EXPANSION wave. GROUND CLEARING.
 *
 * ---------------------------------------------------------------- THE DEFECT
 *
 * The expansion wave built six places and every one of its gates went green,
 * and four of the six could not be SEEN. `V43-outpost` filmed Ridgeback Outpost
 * from 30 m on its own gate bearing and came back with a frame that was
 * 46 % pine canopy and 9 % outpost — a wall of leaves that the gate scored as
 * "PASS, 99 rays on outpost geometry". The trial ground was worse: 69 trees
 * inside its 28 m radius, 24 of them inside 15 m, a proving ring with a forest
 * growing through it. That is the exact failure the memo warns about — a
 * measurement that is true and a criterion ("reads as a lived-in settlement")
 * that is false — so the fix is BOTH halves: clear the ground, and make the
 * gate unable to pass a hedge again.
 *
 * Re-siting was tried first and it does not exist as an option. A valley-wide
 * scan for buildable ground (no tree within 28 m, < 7 m of relief across a 22 m
 * footprint, ≥ 45 m clear of an existing site) returns 90 candidates, ALL of
 * them inside the spawn camp's own hard-coded exclusion — and ZERO anywhere
 * north of z = 150, which is where the brief puts the outpost. The valley is a
 * forest with exactly one clearing in it, and that clearing is the one
 * `vegetation.js` was told to leave.
 *
 * ---------------------------------------------------------- THE CROSS-LANE CUT
 *
 * `vegetation.js` already knows how to do this. Its scatter rejects any
 * candidate inside `CAMP` (r 17) or inside `KEEPOUT`, a four-entry literal
 * whose own comment reads "ruin clusters + watchtower (see props.js) — keep
 * trees/bushes from spawning through the structures". So the intended contract
 * is exactly the one this wave needs; it is simply hard-coded on the far side
 * of a lane boundary, and it predates these six places.
 *
 * `world-ground` owns that file and this lane may not edit it, so the contract
 * gets published from THIS side:
 *
 *     ctx.props.keepouts   // [{ id, x, z, hard, soft }]
 *
 * and `world-ground` retires this module by consuming it — three lines, one per
 * scatter pass:
 *
 *     const KEEP = ctx.props?.keepouts;        // built before the grass stream
 *     ...
 *     if (inPropKeepout(x, z)) continue;       // beside the existing inKeepout
 *
 * Until that lands, `applyClearings()` performs the same cull from this side,
 * after the scatter rather than during it. It is a SHIM and it is written like
 * one: every field it touches on the vegetation instance is feature-detected,
 * any shape it does not recognise makes it a no-op rather than a crash, and the
 * report it returns names what it actually found so a gate can assert on it.
 * Delete this file the day `vegetation.js` reads `ctx.props.keepouts`.
 *
 * ----------------------------------------------------------------- THE TIMING
 *
 * This runs on the FIRST UPDATE, not in the constructor, and that is forced
 * rather than chosen. `Places` is built from inside `Vegetation`'s constructor
 * (`this.props = new Props(ctx)`, second to last line), so at that moment
 * `main.js` has not yet executed `ctx.vegetation = new Vegetation(ctx)` and
 * there is no published handle to the very instance that is constructing us.
 * The first cut of this file ran there and reported `skipped: ['no-vegetation']`
 * — green, silent, and a complete no-op, which is exactly the class of bug this
 * whole wave is about.
 *
 * Running a frame later costs three things, and each one is paid explicitly:
 *
 *   - COLLISION is already seeded (`installSpatial()` runs from `Player`'s
 *     constructor), so a felled pine would otherwise leave a ghost wall you
 *     bounce off in an empty clearing. Every tree and canopy collider inside a
 *     clearing is handed back through the published `collision.unregister()`,
 *     which coalesces the nav rebuild into one pass for the whole set.
 *   - GRASS has already streamed, so the density decoration is followed by the
 *     published `vegetation.invalidate()` — a budgeted per-frame refill, which
 *     is what world-ground's own route-cover pass uses for the same reason,
 *     rather than a 120 ms `forceStream` hitch.
 *   - ONE FRAME of trees is drawn before the cull. That frame is behind the
 *     warm-up compile and the loading bar.
 *
 * It is a one-shot: `Props.update()` calls it once and then never again.
 *
 * -------------------------------------------------------------------- MEMORY
 *
 * The app has crashed on memory this round, so note what this module does NOT
 * do: it allocates no geometry, no material and no mesh, and it disposes
 * nothing. Culling is compaction — the surviving instances are packed down to
 * the front of buffers that already exist and `count` comes down — so vertex
 * memory is unchanged, draw calls can only fall, and there is nothing here to
 * tear down. `dispose()` restores the grass decoration and is idempotent; the
 * culled instances stay culled, which is correct, because the module that owns
 * those buffers disposes them itself.
 *
 * No per-frame cost either: every pass below runs exactly once, at build.
 */

/* -------------------------------------------------------------------------- */

/**
 * Per-place clearings.
 *
 * `hard` is felled to the stump; `soft` is the fringe, thinned on a ramp so the
 * edge reads as a forest opening rather than as a circle cut with a compass.
 * `grass` is the trampled radius — deliberately much tighter than `hard`,
 * because tall grass INSIDE a palisade is a look (the camp has it) while a pine
 * inside a hut is a bug, and because `A59-grass-coverage` and
 * `A60-stealth-lanes` measure the same field this decoration writes into.
 *
 * Radii are the built footprint plus the approach the place is read from, not
 * round numbers: the outpost's palisade is r 16 and `V43` films from 30 m on
 * the gate bearing, so 30 m of felling is what puts the lens in the open.
 */
export const CLEARINGS = [
  { id: 'outpost-ridgeback', x: -112, z: 245, hard: 31, soft: 45, grass: 17 },
  { id: 'cauldron-kappa', x: 150, z: 168, hard: 27, soft: 39, grass: 15 },
  { id: 'hunting-arena', x: 132, z: -82, hard: 33, soft: 47, grass: 21 },
  { id: 'caves-glowfall', x: -60, z: -245, hard: 21, soft: 31, grass: 10 },
  { id: 'lakeshore-camp', x: -93, z: 50, hard: 21, soft: 31, grass: 11 },
  { id: 'tallneck-wreck', x: -172, z: -78, hard: 29, soft: 41, grass: 14 },
];

/* scratch — module-scope, so no pass allocates */
const _m4 = new THREE.Matrix4();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _eul = new THREE.Euler();
const _scl = new THREE.Vector3();
const _col = new THREE.Color();

/**
 * Stable 0..1 hash of a ground position.
 *
 * The fringe has to be thinned RANDOMLY — a hard edge at `hard` and nothing
 * beyond it draws a visible circle — but it must not be thinned with an `rng()`
 * stream. Vegetation's whole scatter is a stochastic dart throw whose seeds are
 * pinned byte-for-byte on purpose (world-ground's own note: one extra `rng()`
 * roll at the top re-rolls every tree in the valley), and a shared random
 * source is how that kind of determinism dies. Hashing the position instead
 * means the same tree is culled on every boot, every gate run and every
 * machine, and no other system's sequence moves by one.
 */
function hash2(x, z) {
  let h = Math.imul((Math.round(x * 8) | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ ((Math.round(z * 8) | 0) + 0x165667b1), 0xc2b2ae35);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * Build the culling predicate for one radius field.
 *
 * `hardKey`/`softKey` pick which radii a pass uses, so the scatters run against
 * `hard` + the `soft` fringe while rocks pass `null` for the fringe and are
 * felled on `hard` alone. Returns an allocation-free `(x, z) => boolean`.
 */
function cullerFor(zones, hardKey, softKey) {
  return (x, z) => {
    for (let i = 0; i < zones.length; i++) {
      const c = zones[i];
      const dx = x - c.x, dz = z - c.z;
      const d2 = dx * dx + dz * dz;
      const hard = c[hardKey];
      if (d2 < hard * hard) return true;
      const soft = softKey ? c[softKey] : 0;
      if (soft > hard && d2 < soft * soft) {
        // 1 at the stump line, 0 at the fringe: thick near the clearing, whole
        // forest by the time you are out of it
        const t = 1 - (Math.sqrt(d2) - hard) / (soft - hard);
        if (hash2(x, z) < t * t) return true;
      }
    }
    return false;
  };
}

/**
 * Pack the surviving instances of an `InstancedMesh` down to the front and drop
 * `count`. Colours and per-instance attributes ride along. Returns how many
 * were removed.
 *
 * Safe in place: the write cursor never runs ahead of the read cursor, so an
 * instance is always copied before anything can overwrite it.
 *
 * `exclusiveGeo` says this mesh is the only instanced user of its geometry. The
 * scatters carry per-instance data on the GEOMETRY, not on the mesh —
 * `meadow-flower-*` hangs an `aInfo` (sway phase, head size) there — and that
 * buffer is indexed by instance, so leaving it alone would hand instance `i`
 * the data of whichever bloom used to be at `i`. Today those values are random
 * and the shuffle is invisible; the day a scatter encodes something
 * POSITIONAL there, silence would be a corruption no gate is watching for. So
 * it is carried. And only when the geometry is exclusive: two meshes over one
 * geometry culled to different counts cannot share one compaction, so that case
 * is left untouched rather than half-done.
 */
function compact(mesh, cull, exclusiveGeo) {
  if (!mesh || !mesh.isInstancedMesh || !mesh.count) return 0;
  const n = mesh.count;
  const hasColor = !!mesh.instanceColor;
  const attrs = [];
  if (exclusiveGeo && mesh.geometry) {
    for (const key of Object.keys(mesh.geometry.attributes)) {
      const a = mesh.geometry.attributes[key];
      if (a && a.isInstancedBufferAttribute && a.count >= n) attrs.push(a);
    }
  }
  let w = 0;
  for (let i = 0; i < n; i++) {
    mesh.getMatrixAt(i, _m4);
    if (cull(_m4.elements[12], _m4.elements[14])) continue;
    if (w !== i) {
      mesh.setMatrixAt(w, _m4);
      if (hasColor) { mesh.getColorAt(i, _col); mesh.setColorAt(w, _col); }
      for (let k = 0; k < attrs.length; k++) {
        const a = attrs[k], s = a.itemSize;
        for (let c = 0; c < s; c++) a.array[w * s + c] = a.array[i * s + c];
      }
    }
    w++;
  }
  if (w === n) return 0;
  mesh.count = w;
  mesh.instanceMatrix.needsUpdate = true;
  if (hasColor) mesh.instanceColor.needsUpdate = true;
  for (let k = 0; k < attrs.length; k++) attrs[k].needsUpdate = true;
  return n - w;
}

/**
 * Fell the six clearings.
 *
 * @param {object} ctx  the game context (needs `ctx.vegetation`)
 * @param {object[]} zones  `CLEARINGS`, or a subset
 * @returns {object} a report: what was found, what was culled, what was skipped
 */
export function applyClearings(ctx, zones = CLEARINGS) {
  const report = {
    zones: zones.length, trees: 0, bushes: 0, flowers: 0, litter: 0,
    rocks: 0, mist: 0, colliders: 0, grassDecorated: false, skipped: [],
  };
  const veg = ctx && ctx.vegetation;
  if (!veg || !veg.group) { report.skipped.push('no-vegetation'); return report; }

  const cullTree = cullerFor(zones, 'hard', 'soft');

  /* ------------------------------------------------------------ 1. trees ---
   * Trees are the only scatter with a live source of truth behind the meshes:
   * `_resortTrees()` rewrites every LOD buffer from `group.trees` whenever the
   * camera has moved 10 m, so compacting the LOD meshes would be undone on the
   * next step the player takes. The list is what has to shrink. The hidden
   * `pines-*` proxy is rebuilt from the survivors because that — not the LOD
   * meshes — is what `collision.seedWorld()` reads to build tree colliders.
   */
  const groups = Array.isArray(veg._treeGroups) ? veg._treeGroups : null;
  if (!groups) {
    report.skipped.push('no-_treeGroups (world-ground changed shape — shim is a no-op)');
  } else {
    let felled = 0;
    for (const g of groups) {
      if (!Array.isArray(g.trees) || !g.proxy || !g.proxy.isInstancedMesh) {
        report.skipped.push(`tree-group:${g && g.name}`);
        continue;
      }
      const before = g.trees.length;
      const kept = [];
      for (let i = 0; i < before; i++) {
        const t = g.trees[i];
        if (!cullTree(t.x, t.z)) kept.push(t);
      }
      if (kept.length === before) continue;
      g.trees = kept;
      felled += before - kept.length;
      for (let i = 0; i < kept.length; i++) {
        const t = kept[i];
        _v3.set(t.x, t.y, t.z);
        _eul.set(0, t.yaw, 0);
        _q.setFromEuler(_eul);
        _scl.set(t.sx, t.sy, t.sx);
        _m4.compose(_v3, _q, _scl);
        g.proxy.setMatrixAt(i, _m4);
      }
      g.proxy.count = kept.length;
      g.proxy.instanceMatrix.needsUpdate = true;
    }
    report.trees = felled;
    if (felled) {
      // force the LOD buckets to be rebuilt from the shortened lists, at the
      // position the constructor last sorted from, so nothing is drawn from a
      // stale buffer before the first camera move
      const sx = Number.isFinite(veg._treeSortX) ? veg._treeSortX : 0;
      const sz = Number.isFinite(veg._treeSortZ) ? veg._treeSortZ : 0;
      veg._treeSortX = 1e9; veg._treeSortZ = 1e9;
      if (typeof veg._resortTrees === 'function') veg._resortTrees(sx, sz);
      if (typeof veg.treeCount === 'number') veg.treeCount -= felled;
    }
  }

  /* --------------------------------------------- 2. the static scatters ---
   * Bushes, blooms, pebbles, twigs and mist pockets are write-once instanced
   * meshes with no source list behind them, so compaction IS the removal. They
   * are found by name off `vegetation.group` rather than off a private field,
   * which is the one part of this shim that is reaching for a published
   * surface: a scene graph.
   *
   * Rocks get `hard` with NO fringe. A boulder at the edge of a clearing is
   * scenery a settlement would be built around; a boulder through a hut floor
   * is the bug — and rocks are the one scatter here that is also cover, so
   * thinning a 45 m fringe of them would quietly change machine sight lines.
   */
  const cullRock = cullerFor(zones, 'hard', null);
  const bucket = (o) => (
    o.name.startsWith('bushes-') ? 'bushes'
      : o.name.startsWith('meadow-flower') ? 'flowers'
        : o.name.startsWith('litter-') ? 'litter'
          : o.name.startsWith('rocks-') ? 'rocks'
            : o.name === 'forest-mist' ? 'mist' : null);
  // how many instanced meshes share each geometry, so `compact()` knows whether
  // it may touch that geometry's per-instance attributes
  const geoUsers = new Map();
  veg.group.traverse((o) => {
    if (!o.isInstancedMesh || !o.geometry) return;
    geoUsers.set(o.geometry, (geoUsers.get(o.geometry) ?? 0) + 1);
  });
  veg.group.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const b = bucket(o);
    if (!b) return;
    report[b] += compact(o, b === 'rocks' ? cullRock : cullTree,
      geoUsers.get(o.geometry) === 1);
  });

  /* ------------------------------------------------- 2b. the ghost walls ---
   * `collision.seedWorld()` ran a frame ago, so every felled pine still owns a
   * blocking capsule, an occluder and a camera volume — an invisible trunk in
   * the middle of a clearing. Hand them back through the published
   * `unregister()`, which takes the whole array and coalesces the navgrid
   * recost into a single rebuild instead of one per instance.
   *
   * Matched by POSITION against the same predicate the cull used, not by a
   * remembered id list: the seeder owns those ids and this module never sees
   * them. Trunk capsules carry their ground point in `ax/az`, canopy spheres
   * in `cx/cz`, and both are the tree's own x/z — so `A61`'s identity check
   * (`pines-*` instance count === tree collider count) stays exact on both
   * sides of the cull.
   */
  const C = ctx.collision;
  if (C && Array.isArray(C.colliders)) {
    const doomed = [];
    for (let i = 0; i < C.colliders.length; i++) {
      const c = C.colliders[i];
      // each kind must be matched with the predicate that culled its instance:
      // rocks were felled on `hard` alone, so testing them against the tree
      // fringe would unregister boulders that are still standing
      const cull = (c.kind === 'tree' || c.kind === 'canopy') ? cullTree
        : c.kind === 'rock' ? cullRock : null;
      if (!cull) continue;
      /**
       * Four collider shapes, four homes for the same x/z. Trunks are capsules
       * (`ax/az`), canopies are spheres (`cx/cz`), and an instanced rock is a
       * `mesh` collider whose per-instance world matrix carries its position in
       * the translation column. Reading the bounds midpoint instead would be
       * wrong for a rock the seeder gave an off-centre BVH.
       */
      const x = c.type === 'capsule' ? c.ax
        : c.type === 'mesh' ? (c.mat ? c.mat.elements[12] : (c.minx + c.maxx) / 2)
          : c.cx;
      const z = c.type === 'capsule' ? c.az
        : c.type === 'mesh' ? (c.mat ? c.mat.elements[14] : (c.minz + c.maxz) / 2)
          : c.cz;
      if (cull(x, z)) doomed.push(c.id);
    }
    if (doomed.length) { C.unregister(doomed); report.colliders = doomed.length; }
  }

  /* ------------------------------------------------------------ 3. grass ---
   * `grassDensityAt(x, z)` is world-ground's published density field and the
   * only input the pooled scatter has, so a decoration on it is a trample mark
   * that every tier — near, mid, far, and every later refill — honours for
   * free. It is called ~470k times per full stream, so the wrapper does the
   * cheapest thing that can work: a squared-distance test against at most six
   * circles, no allocation, no `Math.sqrt` unless a circle is actually hit.
   *
   * The radii are the tight `grass` ones and the falloff runs all the way out
   * to 1.9x, because this field is also what `A59-grass-coverage` and
   * `A60-stealth-lanes` measure: a hard-edged bald disc inside a machine route
   * would take cover away from that route in one step, and a long ramp gives it
   * back over 20 m.
   */
  if (typeof veg.grassDensityAt === 'function' && !veg.__placeTrample) {
    const base = veg.grassDensityAt.bind(veg);
    const ramp = zones.map((c) => ({ x: c.x, z: c.z, r0: c.grass, r1: c.grass * 1.9 }));
    const decorated = (x, z) => {
      let k = 1;
      for (let i = 0; i < ramp.length; i++) {
        const c = ramp[i];
        const dx = x - c.x, dz = z - c.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= c.r1 * c.r1) continue;
        if (d2 <= c.r0 * c.r0) return 0;
        const t = (Math.sqrt(d2) - c.r0) / (c.r1 - c.r0);
        if (t < k) k = t;
      }
      return k === 1 ? base(x, z) : base(x, z) * k;
    };
    veg.__placeTrample = { base: veg.grassDensityAt, decorated };
    veg.grassDensityAt = decorated;
    report.grassDecorated = true;
    // the pooled tiers were filled by `forceStream()` at build, before this
    // decoration existed — mark them stale so the trample mark is honoured on
    // the normal budgeted refill (world-ground's own route-cover pass does
    // exactly this, and for exactly this reason)
    if (typeof veg.invalidate === 'function') veg.invalidate();
  }

  return report;
}

/**
 * Put `grassDensityAt` back. Idempotent, and deliberately does NOT replant:
 * the buffers the cull compacted belong to `Vegetation`, which disposes them
 * itself, and a teardown that tried to restore them would be writing into
 * meshes that may already be gone.
 */
export function releaseClearings(ctx) {
  const veg = ctx && ctx.vegetation;
  if (!veg || !veg.__placeTrample) return;
  // only hand it back if nobody has decorated on top of ours
  if (veg.grassDensityAt === veg.__placeTrample.decorated) {
    veg.grassDensityAt = veg.__placeTrample.base;
  }
  veg.__placeTrample = null;
}
