/**
 * machine-rig lane gates (Round 4, audit §4 + fix round 1).
 *
 * The lane's other four action gates — `A44-socket-integrity`,
 * `A45-no-skate-per-species`, `A47-corpse-grounded` and `A48-cadence` — were
 * already registered for this lane in `tools/gates.config.mjs` by
 * `core-platform` (finding `machine-rig-18`), so they are NOT redefined here.
 * This file adds the three that had no implementation anywhere:
 *
 *   A46-ground-truth              §4's per-foot ground error, per species
 *   A44b-socket-vertex-integrity  the STRICT form of A44: distance to the
 *                                 nearest hull VERTEX in the live pose rather
 *                                 than to a mesh AABB, alive and dead
 *   A47b-corpse-posed             the STRICT form of A47: the LOWEST POSED
 *                                 VERTEX vs terrain, which is the quantity the
 *                                 audit names — A47's bind-pose AABB belongs
 *                                 to the mesh node and does not follow the
 *                                 bones, so it read +0.03 m for a watcher
 *                                 wreck hovering 1.36 m in the air
 *   A49-fx-pool-clean             the pooled eye/accent glows must go away
 *                                 with the machine that owns them
 *   A76b-footfall-species         `machine-footfall` really fires for every
 *                                 species that has feet (A76 in the audio lane
 *                                 synthesises the event; this one walks them)
 *   V26-silhouette / V27-attack-pose
 *
 * `A44b` exists because the registered `A44` measures against per-mesh
 * axis-aligned boxes, and a box that spans a whole sculpt reports gap 0 for a
 * socket floating in mid-air inside it. The audit's number — "TJ tail tip
 * 1.50 m" — is only visible to a vertex test, and this lane's fix must be
 * graded against the thing it fixed: `machine.hullProxy` samples the sculpt
 * into each vertex's DOMINANT BONE frame at build time, so the same proxy is
 * exact in any pose, including two seconds into a death.
 */

/** Page-context helper: block until the variety machines have spawned. */
const WAIT_VARIETY = `
  const _t0 = performance.now();
  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {
    await new Promise(r => setTimeout(r, 150));
  }`;

/** One living machine per species, nearest first. */
const SPECIES = `
  const species = new Map();
  for (const _m of (__CTX__.machines?.list || [])) {
    if (!_m.alive) continue;
    if (!species.has(_m.kind)) species.set(_m.kind, _m);
  }`;

/** Get a species moving: drop the player 14 m away and let it be noticed. */
const PROVOKE = `
  {
    const _p = __CTX__.player;
    _p.position.set(m.position.x + 14, 0, m.position.z + 14);
    _p._snapToGround?.();
    _p.camYaw = Math.atan2(m.position.x - _p.position.x, m.position.z - _p.position.z) + Math.PI;
    await new Promise(r => setTimeout(r, 2200));
  }`;

/**
 * Silhouette / pose staging (see the block comment inside).
 */
const LINEUP = `
  /**
   * Scale-normalised silhouette line-up.
   *
   * ROUND-4 FIX ROUND 1. The Round-4 helper put the cast on a 9.6-degree arc
   * inside the game's own 55-degree camera and clamped the near distance at
   * 6 m, which threw the Scrapper into the bottom-left corner at point-blank
   * range — "an overexposed, unreadable jumble", and not a fair read of any
   * of the five. This stages the shot instead of the world:
   *
   *   - the pose is allowed to settle, then every machine is FROZEN, so the
   *     rig is not fighting the composition;
   *   - each root is uniformly scaled to one apparent size (a silhouette test
   *     grades shape, not scale) and re-centred on its own bounding box;
   *   - one depth, one narrow lens, so nothing is distorted by being at the
   *     edge of a wide frame;
   *   - flat backdrop, no HUD, no marker billboards.
   */
  const stageCast = async (kinds, opts) => {
    const O = opts || {};
    const _t0 = performance.now();
    while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {
      await new Promise(r => setTimeout(r, 150));
    }
    const list = (__CTX__.machines?.list || []).filter(m => m.alive);
    const cast = [];
    const missing = [];
    for (const k of kinds) {
      const m = list.find(x => x.kind === k && !cast.includes(x));
      if (m) cast.push(m); else missing.push(k);
    }
    // NON-SILENT STAGING (judge finding on V27: "Longleg is missing from the
    // captured frame entirely"). A species that cannot be staged used to just
    // not be in the picture, and the shot was then judged as if the criteria
    // had listed one machine fewer. console.warn is deliberate: a console
    // ERROR is an automatic gate FAIL, and a staging shortfall is a fact about
    // the run, not a defect in the frame.
    if (missing.length) console.warn('[stageCast] species not staged: ' + missing.join(', '));
    // AND INTO THE GATE RESULT. A console.warn does not reach report.json (the
    // runner only captures console ERRORS), so a visual gate that silently
    // dropped a machine read to the next judge as a pass — the exact finding
    // this block exists to close. Every shortfall is accumulated here and the
    // gate's detail reports it (__stageCastReport, read below).
    const notes = { requested: kinds.slice(), missing: missing.slice(), notDrawn: [], clipped: [], staged: [] };
    __CTX__.__stageCastReport = notes;
    if (!cast.length) return { cast: [], notes };
    const p = __CTX__.player;
    p._updateCamera = () => {};
    if (p.model) p.model.visible = false;
    const cam = __CTX__.camera;
    const T = __CTX__.terrain;
    const hud = document.getElementById('hud');
    if (hud) hud.style.display = 'none';
    const V3 = p.position.constructor;

    let ColorCtor = null;
    cast[0].root.traverse((o) => {
      if (ColorCtor || !o.isMesh) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (mat && mat.color) ColorCtor = mat.color.constructor;
    });
    for (const c of __CTX__.scene.children) {
      if (c.isLight) continue;
      if (cast.some(m => m.root === c)) continue;
      c.visible = false;
    }
    // Push the fog out of the way, do NOT null it: world-light's Environment
    // system writes to scene.fog every frame and threw 189 times a shot when
    // the object went away (console errors are an automatic gate FAIL).
    const fog = __CTX__.scene.fog;
    if (fog) {
      if (fog.density !== undefined) fog.density = 0;
      if (fog.far !== undefined) { fog.near = 1e5; fog.far = 1e6; }
    }
    if (ColorCtor) __CTX__.scene.background = new ColorCtor(O.bg ?? 0x8fb3d1);

    const n = cast.length;
    const fov = O.fov ?? 26;
    const D = O.depth ?? 60;
    const BX = 0, BZ = 120;
    const ground = T.getHeight(BX, BZ);
    const eyeY = ground + (O.eyeY ?? 6);

    // 1. park the cast side-on at one depth and let the rigs settle
    cast.forEach((m, i) => {
      // NEGATIVE X is screen RIGHT for a camera looking down +Z, so index 0
      // (the first name the criteria lists) has to go to POSITIVE X
      const x = BX + ((n - 1) / 2 - i) * (O.spread ?? 8);
      const z = BZ + D;
      m.position.set(x, T.getHeight(x, z), z);
      m.heading = O.front ? Math.PI : Math.PI / 2;
      m.root.rotation.y = m.heading;
      m._speed = 0;
      m._lodTier = -1;
      m.lowLOD = false;
      try { m.state = O.state || 'patrol'; m.suspicion = O.state ? 1 : 0; } catch (e) { /* */ }
      m.root.traverse((o) => {
        if (o.isSprite) o.visible = false;
        // A staged still is composed at one depth for readability, not for
        // budget. The engine's screen-space small-mesh cull measures WORLD
        // size, so a machine parked 60 m out loses the detail the shot exists
        // to grade — measured on the Longleg, which arrived at its mark with
        // one plate of itself still being drawn.
        if (o.isMesh) o.userData.noSizeCull = true;
      });
      // A FLYER banks and pitches its body node in cruise, which is what put
      // the Glinthawk at an oblique 3/4 in the fix-round-1 still and made its
      // spanned-wing requirement ungradeable. A silhouette test reads a
      // machine level and side-on; the body pitch is levelled with the pose.
      try { m.body.rotation.set(0, 0, 0); } catch (e) { /* */ }
    });
    await new Promise(r => setTimeout(r, O.settle ?? 1400));
    if (O.beforeFreeze) await O.beforeFreeze(cast);

    // 2. FREEZE the rigs: the pose in the shot is the pose that was solved,
    //    and nothing re-solves against the staged transforms. Shadowing
    //    m.update() is not enough — the manager keeps steering the machine
    //    through its AI, and the heading drifted ~0.3 rad between staging and
    //    the shutter — so the cast leaves the update list outright. The roots
    //    stay in the scene, so they still render.
    //
    //    O.live keeps the RIG running and freezes only the transform. A pose
    //    gate (V27) has to show a rig that is still solving — the attack's
    //    pose channels are consumed inside gait.update()/animate(), so a
    //    machine with its update stubbed holds whatever pose it happened to be
    //    in, which is why fix round 1's wind-up frames were its idle frames.
    for (const m of cast) {
      // DISTANCE LOD IS LIFTED, NOT JUST INVALIDATED (judge finding, fix
      // round 2: "the lane's own V26/V27 stills are unfaithful ... the freeze
      // path then splices the machine out of the update list and stubs
      // m.update, so updateRigLOD never re-runs and the trim is never
      // lifted"). Setting _lodTier = -1 only says "recompute next tick", and
      // for a frozen machine there is no next tick — the Longleg went into
      // V26 with 22 of its 30 meshes still retired and read as two
      // disconnected clumps. machine._lodPin = 0 (rig/lod.js) holds tier 0
      // even for the LIVE path, where the real update() would otherwise
      // re-trim at the 60 m staging depth on the very next frame.
      m.lowLOD = false;
      m._lodPin = 0;
      m._lodTier = 0;
      m.model.traverse((o) => {
        if (o.isMesh && o.userData.lodHidden) { o.visible = true; o.userData.lodHidden = false; }
      });
      for (const pt of m.parts || []) {
        if (!pt.attached || !pt.mesh) continue;
        pt.mesh.visible = true;
        pt.mesh.traverse((o) => { if (o.isMesh) o.userData.lodHidden = false; });
      }
      if (O.live) continue;
      const i = __CTX__.machines.list.indexOf(m);
      if (i >= 0) __CTX__.machines.list.splice(i, 1);
      m.update = () => {};
      if (m.gait) { m.gait.update = () => {}; m.gait.updateCheap = () => {}; }
      if (m.animate) m.animate = () => {};
      if (m.footLock) m.footLock.update = () => {};
      if (m.mixer) m.mixer.timeScale = 0;
    }

    // 3. LOCK THE FACING FIRST. _conform() composes the root quaternion from
    //    the heading AND the terrain normal, so overwriting rotation.y
    //    afterwards re-orients the machine — and the size normalisation below
    //    would then be measuring an orientation the shot never sees.
    const yaw = O.front ? Math.PI : Math.PI / 2;
    for (const m of cast) { m.root.rotation.set(0, yaw, 0); m.root.updateMatrixWorld(true); }

    // 4. normalise apparent size and centre each machine in its own slot
    const aspect = cam.aspect || (16 / 9);
    const hFov = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * aspect);
    const frameW = 2 * D * Math.tan(hFov / 2);
    const slotW = frameW / n;
    const target = slotW * (O.fill ?? 0.80);
    /**
     * Posed world box of everything DRAWN, or ok:false when nothing was.
     *
     * The ok flag is load-bearing (judge finding on V27: "Longleg is missing
     * from the captured frame entirely"). This used to return the EMPTY
     * sentinel — min +1e9, max -1e9 — whose centre is a perfectly finite
     * (0,0,0), and the caller then "re-centred" the machine by translating it
     * by the whole slot offset from wherever it already was. A longleg staged
     * 60 m out, with its components retired by distance LOD and the rest of it
     * under the engine's screen-space cull, measured empty and was pushed to
     * x = -30 m in a frame 24 m wide. It was never posed wrong; it was pushed
     * out of the shot, silently, by its own framing code.
     */
    const box = (m) => {
      m.root.updateMatrixWorld(true);
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], any = false;
      const q = new V3();
      m.root.traverse((o) => {
        if (!o.isMesh || !o.visible || !o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox; if (!bb) return;
        for (let i = 0; i < 8; i++) {
          q.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)
            .applyMatrix4(o.matrixWorld);
          mn = [Math.min(mn[0], q.x), Math.min(mn[1], q.y), Math.min(mn[2], q.z)];
          mx = [Math.max(mx[0], q.x), Math.max(mx[1], q.y), Math.max(mx[2], q.z)];
          any = true;
        }
      });
      return { mn, mx, ok: any, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] };
    };
    // THE CAMERA IS SOLVED FIRST. The fit below measures where each machine
    // lands ON SCREEN, so it has to measure through the projection the shutter
    // will use. (The game's FOV system writes camera.fov every frame BEFORE
    // the render — gate A22b — and an onAfterRender pin runs too late to
    // matter: the shot was being taken at 55 degrees while the layout was
    // solved for 26, which is why every silhouette landed at 40 % of its slot.
    // Nail the property.)
    try {
      Object.defineProperty(cam, 'fov', { get: () => fov, set: () => {}, configurable: true });
    } catch (e) { /* */ }
    cam.position.set(BX, eyeY, BZ);
    cam.lookAt(BX, eyeY, BZ + 10);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();

    /**
     * Where a machine actually lands in the frame, in NDC (-1..1, +x = screen
     * RIGHT, +y = screen UP).
     *
     * ROUND-4 FIX ROUND 2, judge finding on V26: "the Glinthawk's outboard
     * wing is clipped by the right frame edge in both runs". The world box is
     * not the frame. The cast is turned side-on — body +Z to world +X — so a
     * WINGSPAN runs in world Z, which is DEPTH: the Glinthawk's outboard wing
     * tip sits ~2.6 m nearer the lens than its body, and 12 m off axis that
     * projects a further half-metre outboard than the world box says. The fit
     * declared it inside its slot and the lens put it through the edge.
     */
    const M4 = cam.projectionMatrix.constructor;
    const _vp = new M4();
    const screenBox = (m) => {
      m.root.updateMatrixWorld(true);
      _vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false;
      const q = new V3();
      m.root.traverse((o) => {
        if (!o.isMesh || !o.visible || !o.geometry) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox; if (!bb) return;
        for (let i = 0; i < 8; i++) {
          q.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)
            .applyMatrix4(o.matrixWorld).applyMatrix4(_vp);
          x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x);
          y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
          any = true;
        }
      });
      return { ok: any, x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
    };
    // NDC per world metre at the staging depth, on each screen axis. World +X
    // is screen LEFT (the camera looks down +Z), hence the sign.
    const ndcPerMx = -1 / (D * Math.tan(hFov / 2));
    const ndcPerMy = 1 / (D * Math.tan(fov * Math.PI / 360));
    const slotNdc = 2 / n;
    const MARGIN = 0.04;                       // NDC keep-out at the frame edge

    const framing = [];
    cast.forEach((m, i) => {
      const b0 = box(m);
      if (!b0.ok) {
        console.warn('[stageCast] nothing drawn for ' + m.kind + ' — left on its mark');
        notes.notDrawn.push(m.kind);
        return;
      }
      // 4a. coarse world-space fit — scale is a world quantity, and the world
      //     box is the cheap way to get within a few per cent of the answer
      const w = b0.mx[0] - b0.mn[0];
      const h = b0.mx[1] - b0.mn[1];
      m.root.scale.setScalar(target / Math.max(w, h * 1.15, 0.5));
      m.root.updateMatrixWorld(true);
      const b1 = box(m);
      m.position.x += BX + ((n - 1) / 2 - i) * slotW - b1.c[0];
      m.position.y += eyeY - b1.c[1];
      m.position.z += (BZ + D) - b1.c[2];

      // 4b. screen-space correction: shrink until the machine fits its slot
      //     AND the frame, then put its SCREEN centre on the slot's centre
      const wantCx = -1 + slotNdc * (i + 0.5);
      const budget = Math.min(slotNdc * (O.fill ?? 0.80),
                              2 * (1 - MARGIN) - 2 * Math.abs(wantCx));
      for (let pass = 0; pass < 4; pass++) {
        const s = screenBox(m);
        if (!s.ok) break;
        const shrink = Math.min(budget / Math.max(s.w, 1e-4),
                                (2 - 2 * MARGIN) / Math.max(s.h, 1e-4));
        if (shrink < 0.998) {
          m.root.scale.multiplyScalar(shrink);
          m.root.updateMatrixWorld(true);
        }
        const s2 = screenBox(m);
        if (!s2.ok) break;
        m.position.x += (wantCx - s2.cx) / ndcPerMx;
        m.position.y += (0 - s2.cy) / ndcPerMy;
        m.root.updateMatrixWorld(true);
        if (shrink >= 0.998 && Math.abs(wantCx - s2.cx) < 0.004) break;
      }
      const f = screenBox(m);
      framing.push(m.kind + ' ndcX[' + f.x0.toFixed(2) + ',' + f.x1.toFixed(2) + ']'
                 + ' ndcY[' + f.y0.toFixed(2) + ',' + f.y1.toFixed(2) + ']');
      if (f.x0 < -1 || f.x1 > 1 || f.y0 < -1 || f.y1 > 1) {
        console.warn('[stageCast] ' + m.kind + ' is clipped by the frame: ' + framing[framing.length - 1]);
        notes.clipped.push(m.kind);
      }
      notes.staged.push(m.kind + ' ndcX[' + f.x0.toFixed(2) + ',' + f.x1.toFixed(2) + ']');
    });
    // Facing is graded by the criteria, so it is stated in the log the run
    // keeps: body +Z is world +X under yaw = pi/2, and world +X is SCREEN
    // LEFT for a camera looking down +Z.
    console.log('[stageCast] yaw=' + yaw.toFixed(3) + ' (body +Z -> world +X -> screen LEFT); '
              + framing.join(' | '));

    const frozen = cast.map(m => ({ m, x: m.position.x, y: m.position.y, z: m.position.z, k: m.root.scale.x }));
    if (O.live) {
      // wrap update: run the real one (so the rig solves the attack pose),
      // then put the machine back on its mark and hold the wind-up open
      for (const f of frozen) {
        const m = f.m;
        const real = m.update.bind(m);
        m.update = (dt, t) => {
          m.lowLOD = false;
          m._lodPin = 0;           // hold tier 0: the cast is staged at 60 m
          real(dt, t);
          m.model.traverse((o) => {
            if (o.isMesh && o.userData.lodHidden) { o.visible = true; o.userData.lodHidden = false; }
          });
          for (const pt of m.parts || []) {
            if (pt.attached && pt.mesh) pt.mesh.visible = true;
          }
          const a = m._attack;
          if (a && O.holdWindup !== false) {
            a.t = a.windup * (O.windupAt ?? 0.78);
            a.phase = 'windup';
            a.phaseT = O.windupAt ?? 0.78;
            a.struck = false;
          }
          m._speed = 0;
          m.position.set(f.x, f.y, f.z);
          m.heading = yaw;
          m.root.rotation.set(0, yaw, 0);
          m.root.scale.setScalar(f.k);
          try { m.body.rotation.y = 0; } catch (e) { /* */ }
        };
      }
    }
    const pin = () => {
      for (const f of frozen) {
        f.m.position.set(f.x, f.y, f.z);
        f.m.root.rotation.y = yaw;
        f.m.root.scale.setScalar(f.k);
      }
      cam.position.set(BX, eyeY, BZ);
      cam.lookAt(BX, eyeY, BZ + 10);
      cam.updateMatrixWorld();
      p.position.set(BX, eyeY, BZ);
    };
    __CTX__.engine.onAfterRender.push(pin);
    pin();
    // A SHORTFALL HAS TO REACH THE JUDGE, and the judge reads the PNG. The
    // runner records no detail for a visual gate, so a species that was
    // never staged is stated IN THE FRAME rather than in a console.warn nobody
    // captures. It is only drawn when something is actually wrong, so a clean
    // line-up is still a clean line-up.
    const bad = notes.missing.concat(notes.notDrawn, notes.clipped);
    if (bad.length) {
      const el = document.createElement('div');
      el.id = 'stagecast-note';
      el.textContent = 'STAGING SHORTFALL — missing: [' + notes.missing.join(', ')
        + '] not drawn: [' + notes.notDrawn.join(', ') + '] clipped: [' + notes.clipped.join(', ') + ']';
      el.setAttribute('style', 'position:fixed;left:0;right:0;top:0;z-index:99999;'
        + 'background:#a00;color:#fff;font:bold 20px monospace;padding:8px;text-align:center');
      document.body.appendChild(el);
    }
    return { cast, notes };
  };`;
export const GATES = [
  /* ----------------------------- action ----------------------------- */
  {
    /**
     * THE GATE THE OLD THREE COULD NOT FAIL.
     *
     * Judge finding, fix round 2: "Longleg stanceLatch teleports the foot up
     * to 1.07 m in one frame and leaves it visibly detached from the leg —
     * A45/A46/A48 pass by construction and cannot see it". They could not, and
     * the reason is structural: the Longleg's foot bones are IK HANDLES, so a
     * plant is held by WRITING the toe onto the lock. Every existing foot gate
     * then reads a quantity the write makes true by definition — A45's stance
     * drift is zero because the lock's XZ never moves, A46's ground error is
     * zero because the toe was put on the ground, A48's cadence is clean
     * because the plant flags toggle. All three were measuring the write.
     *
     * This measures what the write cannot fake: the toe's own world motion
     * between two RENDERED frames, and specifically its motion while the rig
     * claims the foot is PLANTED. A planted foot is standing on the ground; if
     * it moves, the plant is a lie. It is a RATE (m/s), not metres per frame,
     * so it means the same thing on a 60 fps host and a 12 fps one — the
     * lesson A45 was corrected for.
     *
     * The swing is deliberately not graded: a machine stepping at its own
     * cadence sweeps a foot at several metres a second, and that is what a
     * step looks like. What is graded is (a) a foot that is planted while
     * moving, and (b) the LOCK's own contribution, corrM x hold, whose rate
     * FootLock.holdRate bounds by construction — so this is a direct check
     * that the ramp is doing its job.
     */
    id: 'A45c-foot-continuity', kind: 'action', lane: 'machine-rig',
    title: 'A PLANTED foot does not move: <= 1.5 m/s AND <= 0.12 m in any rendered frame; lock ramp <= 9 m/s',
    settle: 500, timeout: 180000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      const out = {}; const offenders = []; let measured = 0;
      for (const [kind, m] of species) {
        if (typeof m.footContinuity !== 'function') continue;
        const first = m.footContinuity();
        if (!first || first.length < 2) { out[kind] = 'no handle feet'; continue; }
        ${PROVOKE}
        let prev = m.footContinuity();
        let prevT = performance.now();
        let worstPlanted = 0, worstRamp = 0, samples = 0, plantedSamples = 0;
        let worstPlantedFrameM = 0, moved = 0;
        let sx = m.position.x, sz = m.position.z;
        const t0 = performance.now();
        while (performance.now() - t0 < 5000) {
          await new Promise(r => requestAnimationFrame(r));
          const now = performance.now();
          const dt = Math.max((now - prevT) / 1000, 1e-4);
          prevT = now;
          moved += Math.hypot(m.position.x - sx, m.position.z - sz);
          sx = m.position.x; sz = m.position.z;
          const cur = m.footContinuity();
          if (!cur || cur.length !== prev.length) { prev = cur; continue; }
          for (let i = 0; i < cur.length; i++) {
            const a = prev[i], b = cur[i];
            const d = Math.hypot(b.toe.x - a.toe.x, b.toe.y - a.toe.y, b.toe.z - a.toe.z);
            // THE RAMP'S OWN CONTRIBUTION, not the applied displacement.
            // While a plant is fully held the displacement grows at the CLIP's
            // foot rate (the toe stands still and the animation walks away from
            // it, which is what a foot lock IS) — that is not the rig moving
            // anything. What moves the toe is the change in the blend weight,
            // and rampPeakMps is that term measured inside the rig on the
            // SIM substep it happens on, peak-and-reset, so polling once per
            // rendered frame cannot miss a spike or over-read a stance.
            const ramp = b.rampPeakMps ?? 0;
            if (ramp > worstRamp) worstRamp = ramp;
            if (a.planted && b.planted) {
              plantedSamples++;
              if (d / dt > worstPlanted) worstPlanted = d / dt;
              if (d > worstPlantedFrameM) worstPlantedFrameM = d;
            }
          }
          prev = cur;
          samples++;
        }
        // TWO BOUNDS, because one alone is gameable by frame rate. The RATE
        // (1.5 m/s = 2.5 cm at 60 fps) is what a stationary foot with IK
        // convergence noise and the lock's own terrain damp actually costs;
        // the per-FRAME distance is the judge's own number ("~0.12 m at
        // 60 fps"), and it is what stops a slow host from hiding a jump
        // inside a long frame. The defect this gate exists for measured
        // 1.065 m in one frame — 50x the frame bound, 500x the rate bound.
        const ok = plantedSamples < 8 ? null
          : (worstPlanted <= 1.5 && worstPlantedFrameM <= 0.12 && worstRamp <= 9);
        out[kind] = {
          plantedToeRateMps: +worstPlanted.toFixed(3),
          worstPlantedFrameM: +worstPlantedFrameM.toFixed(3),
          lockRampMps: +worstRamp.toFixed(2),
          plantedSamples, samples, movedM: +moved.toFixed(2),
          status: ok === null ? 'never planted long enough' : ok ? 'ok' : 'DISCONTINUOUS',
        };
        if (ok === false) offenders.push(kind);
        if (ok !== null) measured++;
      }
      if (!measured) return { pass: null, detail: { note: 'SKIP: no species reported a handle-rig plant', out } };
      return { pass: offenders.length === 0,
               detail: { budget: 'planted toe <= 1.5 m/s and <= 0.12 m/frame, lock ramp <= 9 m/s',
                         offenders, speciesMeasured: measured, out } };
    })()`,
  },
  {
    /**
     * The staging helper V26 / V27 are judged through, asserted rather than
     * eyeballed (fix round 2, judge finding: "a visual gate that silently
     * drops a machine reads as a pass to the next judge"). The runner keeps no
     * `detail` for a visual gate, so this is where the line-up's shortfalls
     * become a recorded PASS/FAIL: every requested species has to be found,
     * drawn, and inside the frame.
     */
    id: 'A44c-lineup-staged', kind: 'action', lane: 'machine-rig',
    title: 'STAGING: every species V26/V27 ask for is found, drawn and inside the frame',
    settle: 600, timeout: 150000,
    assert: `(async () => {
      ${LINEUP}
      const want = ['sawtooth', 'thunderjaw', 'scrapper', 'longleg', 'glinthawk'];
      const r = await stageCast(want);
      await new Promise(res => setTimeout(res, 400));
      const n = (__CTX__.__stageCastReport) || (r && r.notes) || null;
      if (!n) return { pass: false, detail: { note: 'stageCast returned no report' } };
      const drawnOk = n.staged.length === want.length;
      return {
        pass: n.missing.length === 0 && n.notDrawn.length === 0 && n.clipped.length === 0 && drawnOk,
        detail: { requested: n.requested, staged: n.staged, missing: n.missing,
                  notDrawn: n.notDrawn, clipped: n.clipped },
      };
    })()`,
  },
  {
    id: 'A46-ground-truth', kind: 'action', lane: 'machine-rig',
    title: 'PER SPECIES: a planted foot sits ON the terrain it is standing on (audit A46: |footY - ground| <= 0.08 m)',
    settle: 500, timeout: 180000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      const T = __CTX__.terrain;
      const out = {};
      let worstAll = 0, measured = 0;
      for (const [kind, m] of species) {
        if (!m.debugFeet || m.debugFeet().length < 2) { out[kind] = 'no feet'; continue; }
        ${PROVOKE}
        let worst = 0, samples = 0, moved = 0;
        let sx = m.position.x, sz = m.position.z;
        const perFoot = {};
        const t0 = performance.now();
        while (performance.now() - t0 < 4000) {
          moved += Math.hypot(m.position.x - sx, m.position.z - sz);
          sx = m.position.x; sz = m.position.z;
          for (const f of m.debugFeet()) {
            if (!f.planted) continue;
            const err = Math.abs(f.world.y - T.getHeight(f.world.x, f.world.z));
            perFoot[f.name] = Math.max(perFoot[f.name] ?? 0, +err.toFixed(3));
            worst = Math.max(worst, err);
            samples++;
          }
          await new Promise(r => requestAnimationFrame(r));
        }
        if (!samples) { out[kind] = { skipped: 'no planted samples', movedM: +moved.toFixed(2) }; continue; }
        out[kind] = { maxGroundErrM: +worst.toFixed(3), samples, movedM: +moved.toFixed(2), perFoot };
        worstAll = Math.max(worstAll, worst);
        measured++;
      }
      if (measured < 2) return { pass: null, detail: { note: 'SKIP: fewer than 2 species reported a planted foot', out } };
      return { pass: worstAll <= 0.08,
               detail: { budgetM: 0.08, worstM: +worstAll.toFixed(3), speciesMeasured: measured, out } };
    })()`,
  },

  {
    id: 'A44b-socket-vertex-integrity', kind: 'action', lane: 'machine-rig',
    title: 'STRICT A44: every part / eye / weak point sits within 0.10 m of a hull VERTEX, alive AND 2 s dead',
    settle: 600, timeout: 150000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      const rows = {};
      let worst = 0, checked = 0, missing = 0;
      const scan = (m, phase) => {
        const r = m.socketReport ? m.socketReport() : null;
        if (!r) { missing++; return; }
        rows[m.kind] = rows[m.kind] || {};
        rows[m.kind][phase] = { worstGapM: r.worstGapM, sockets: r.sockets };
        worst = Math.max(worst, r.worstGapM);
        checked += Object.keys(r.sockets).length;
      };
      for (const [, m] of species) scan(m, 'alive');
      for (const [, m] of species) {
        try { m.takeDamage({ impact: 99999, dir: new (__CTX__.player.position.constructor)(0, 0, 1), point: m.position.clone() }); } catch (e) { /* */ }
        if (m.alive) { try { m._die(); } catch (e) { /* */ } }
      }
      await new Promise(r => setTimeout(r, 2600));
      for (const [, m] of species) scan(m, 'dead');
      if (!checked) return { pass: null, detail: { note: 'SKIP: no machine exposes socketReport()', missing } };
      return { pass: worst <= 0.10,
               detail: { budgetM: 0.10, worstGapM: +worst.toFixed(3), socketsChecked: checked,
                         speciesWithoutProxy: missing, rows } };
    })()`,
  },


  {
    id: 'A47b-corpse-posed', kind: 'action', lane: 'machine-rig',
    title: 'STRICT A47: the LOWEST POSED VERTEX of a corpse sits on the terrain (penetration <= 0.10 m, float <= 0.40 m)',
    settle: 600, timeout: 150000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      const V = __CTX__.player.position.constructor;
      const T = __CTX__.terrain;
      // THE AUDIT'S QUANTITY, measured the audit's way: every visible mesh,
      // every vertex pushed through its own bone transform. A SkinnedMesh's
      // geometry.boundingBox belongs to the mesh NODE and does not follow the
      // skeleton, so the registered A47 cannot see a collapsed corpse at all.
      const posedLow = (m) => {
        m.root.updateMatrixWorld(true);
        const p = new V();
        let minY = Infinity, cx = 0, cz = 0, n = 0, worstMesh = null;
        let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
        m.root.traverse((o) => {
          if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position) return;
          const P = o.geometry.attributes.position;
          const step = Math.max(1, Math.floor(P.count / 4000));
          let low = Infinity;
          for (let i = 0; i < P.count; i += step) {
            p.fromBufferAttribute(P, i);
            if (o.isSkinnedMesh) o.applyBoneTransform(i, p);
            p.applyMatrix4(o.matrixWorld);
            if (p.y < low) low = p.y;
            if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x;
            if (p.z < mnz) mnz = p.z; if (p.z > mxz) mxz = p.z;
            n++;
          }
          if (low < minY) { minY = low; worstMesh = o.name || '(unnamed)'; }
        });
        if (!n) return null;
        cx = (mnx + mxx) / 2; cz = (mnz + mxz) / 2;
        return { minY, ground: T.getHeight(cx, cz), samples: n, worstMesh };
      };
      for (const [, m] of species) {
        try { m.takeDamage({ impact: 99999, dir: new V(0, 0, 1), point: m.position.clone() }); } catch (e) { /* */ }
        if (m.alive) { try { m._die(); } catch (e) { /* */ } }
      }
      await new Promise(r => setTimeout(r, 5200));
      const out = {}; const offenders = []; let checked = 0;
      for (const [kind, m] of species) {
        const r = posedLow(m);
        if (!r) { out[kind] = 'no geometry'; continue; }
        const off = r.minY - r.ground;
        out[kind] = { lowestPosedMinusGroundM: +off.toFixed(3), lowestMesh: r.worstMesh, verticesTested: r.samples };
        if (off < -0.10 || off > 0.40) offenders.push(kind);
        checked++;
      }
      if (!checked) return { pass: null, detail: { note: 'SKIP: no corpse geometry', out } };
      return { pass: offenders.length === 0,
               detail: { budget: 'penetration <= 0.10 m, float <= 0.40 m', offenders, speciesChecked: checked, out } };
    })()`,
  },

  {
    id: 'A47c-corpse-mass', kind: 'action', lane: 'machine-rig',
    title: 'A wreck LANDS: its median posed vertex drops to <= 0.75x its standing height above the terrain',
    settle: 600, timeout: 150000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      const V = __CTX__.player.position.constructor;
      const T = __CTX__.terrain;
      // The quantity a judge measured by hand on fix round 1: where the MASS
      // of the machine is, not where its lowest single vertex is. A47/A47b
      // grade one point against a window, which a splayed limb or an antenna
      // satisfies while the body floats — six of eight species sat HIGHER dead
      // than alive and passed both.
      const stats = (m) => {
        m.root.updateMatrixWorld(true);
        const p = new V();
        const ys = [];
        let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
        m.root.traverse((o) => {
          if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position) return;
          if (o.userData.noHull) return;
          const P = o.geometry.attributes.position;
          const step = Math.max(1, Math.floor(P.count / 900));
          for (let i = 0; i < P.count; i += step) {
            p.fromBufferAttribute(P, i);
            if (o.isSkinnedMesh) o.applyBoneTransform(i, p);
            p.applyMatrix4(o.matrixWorld);
            ys.push(p.y);
            if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x;
            if (p.z < mnz) mnz = p.z; if (p.z > mxz) mxz = p.z;
          }
        });
        if (!ys.length) return null;
        const gy = T.getHeight((mnx + mxx) / 2, (mnz + mxz) / 2);
        ys.sort((a, b) => a - b);
        const at = (f) => ys[Math.min(ys.length - 1, Math.floor(ys.length * f))] - gy;
        return { median: +at(0.5).toFixed(3), p90: +at(0.9).toFixed(3), low: +(ys[0] - gy).toFixed(3), n: ys.length };
      };
      const alive = {};
      for (const [kind, m] of species) alive[kind] = stats(m);
      for (const [, m] of species) {
        try { m.takeDamage({ impact: 99999, dir: new V(0, 0, 1), point: m.position.clone() }); } catch (e) { /* */ }
        if (m.alive) { try { m._die(); } catch (e) { /* */ } }
      }
      await new Promise(r => setTimeout(r, 6500));
      const out = {}; const offenders = []; let checked = 0;
      for (const [kind, m] of species) {
        const a = alive[kind]; const d = stats(m);
        if (!a || !d) { out[kind] = 'no geometry'; continue; }
        const ratio = a.median > 0.05 ? d.median / a.median : 1;
        out[kind] = { aliveMedianM: a.median, deadMedianM: d.median, ratio: +ratio.toFixed(2),
                      aliveP90M: a.p90, deadP90M: d.p90 };
        if (ratio > 0.75) offenders.push(kind);
        checked++;
      }
      if (!checked) return { pass: null, detail: { note: 'SKIP: no corpse geometry', out } };
      return { pass: offenders.length === 0,
               detail: { budget: 'deadMedian <= 0.75 x aliveMedian (height above terrain)',
                         offenders, speciesChecked: checked, out } };
    })()`,
  },

  {
    id: 'A50-hulls-visible', kind: 'action', lane: 'machine-rig',
    title: 'Every hit hull is built from geometry that is actually DRAWN (no aiming at a retired sculpt)',
    settle: 500, timeout: 90000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      const HH = __CTX__.hitHulls;
      if (!HH?.build) return { pass: null, detail: 'SKIP: ctx.hitHulls not published' };
      const out = {}; let bad = 0, total = 0;
      for (const [kind, m] of species) {
        const set = HH.build(m);
        if (!set) { out[kind] = 'no hull set'; continue; }
        let k = 0, hidden = 0, retired = 0, lod = 0;
        const otherHidden = {};
        for (const h of set.hulls) {
          k++;
          const o = h.object;
          if (!o) continue;
          const isRetired = !!(o.userData?.noHull || o.userData?.hiddenSculpt);
          if (isRetired) retired++;
          if (o.visible === false) {
            hidden++;
            // A COMPONENT retired by distance LOD is still a thing you can
            // shoot, so its hull is meant to be there. Anything else that is
            // invisible is named below rather than swept into a count.
            if (o.userData?.lodHidden && !isRetired) lod++;
            else if (!isRetired) {
              const key = (o.name || '(unnamed)') + ' under ' + (o.parent?.name || '?');
              otherHidden[key] = (otherHidden[key] || 0) + 1;
            }
          }
        }
        out[kind] = { hulls: k, fromInvisibleMesh: hidden, ofWhichLodHiddenParts: lod,
                      fromRetiredGeometry: retired, otherInvisibleSources: otherHidden };
        total += k; bad += retired;
      }
      if (!total) return { pass: null, detail: { note: 'SKIP: no hulls built', out } };
      return { pass: bad === 0,
               detail: { hullsChecked: total, hullsFromRetiredGeometry: bad,
                         asserted: 'zero hulls whose source mesh carries userData.noHull or userData.hiddenSculpt — the retired donor sculpts. Every OTHER invisible source is listed per species (not asserted): a component hidden by distance LOD keeps its hull deliberately, and the handful of pooled eye/accent objects the FX pool hides are drawn by the pool, not gone.',
                         note: 'ctx.hitHulls is the arrow raycast, component attribution and the Focus part labels; a hull on a RETIRED sculpt is aim geometry pointing at a ghost. A component hidden by distance LOD keeps its hull on purpose (you can still shoot it) and is counted separately.',
                         out } };
    })()`,
  },

  {
    id: 'A49-fx-pool-clean', kind: 'action', lane: 'machine-rig',
    title: 'Pooled eye/accent glows die with their machine — the FX pool does not leak records',
    settle: 400, timeout: 90000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      /**
       * Resolve the pool the way a CONSUMER does, not the way a debug handle
       * does. rig/fx.js publishes it as ctx.machineFx on the context the
       * machines were constructed with, and in this build window.__CTX__ is
       * no longer that same object (measured on 5207: m.ctx === __CTX__ is
       * false, m.ctx.machineFx is set, __CTX__.machineFx is undefined).
       * Reading only the window handle made this gate SKIP - reported as
       * PENDING - on a build where the pool was working perfectly.
       */
      const fx = __CTX__.machineFx
        || (__CTX__.machines?.list || []).map(m => m.ctx?.machineFx).find(Boolean)
        || (__CTX__.machines?.list || []).map(m => m._fxPool).find(Boolean)
        || null;
      if (!fx) return { pass: null, detail: 'SKIP: ctx.machineFx not published' };
      const sites = __CTX__.machines?.sites || __CTX__.machines;
      const list = (__CTX__.machines?.list || []).filter(m => m.alive);
      const victim = list.find(m => m.kind === 'thunderjaw') || list.find(m => m.kind === 'sawtooth') || list[0];
      if (!victim || !sites?.dispose) return { pass: null, detail: 'SKIP: no disposable machine' };
      const before = fx.glowCount;
      const mine = [];
      victim.root.traverse((o) => { if (o.userData.pooledGlow) mine.push(o.userData.pooledGlow); });
      sites.dispose(victim);
      // one frame of the pool's own write pass is all the prune needs
      for (let i = 0; i < 8; i++) await new Promise(r => requestAnimationFrame(r));
      const after = fx.glowCount;
      const stillWriting = mine.filter(g => fx.hot?.glows?.includes(g)).length;
      const orphans = mine.filter((g) => {
        let n = g.obj; while (n) { if (n === __CTX__.scene) return false; n = n.parent; } return true;
      }).length;
      return {
        pass: stillWriting === 0 && after <= before - mine.length + 1,
        detail: {
          kind: victim.kind, glowsBefore: before, glowsAfter: after,
          glowsOwnedByVictim: mine.length, stillWriting, orphansNotInScene: orphans,
          machineRootInScene: !!victim.root.parent,
        },
      };
    })()`,
  },

  {
    id: 'A76b-footfall-species', kind: 'action', lane: 'machine-rig',
    title: 'machine-footfall really fires for EVERY species with feet (both locomotion paths)',
    settle: 400, timeout: 200000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      const counts = {};
      const onFall = (e) => { const k = e?.kind || e?.machine?.kind || '?'; counts[k] = (counts[k] || 0) + 1; };
      __CTX__.events.on('machine-footfall', onFall);
      const walkers = [];
      for (const [kind, m] of species) {
        if (kind === 'glinthawk') continue;              // a flyer has no feet
        walkers.push(kind);
        ${PROVOKE}
        await new Promise(r => setTimeout(r, 3200));
      }
      __CTX__.events.off?.('machine-footfall', onFall);
      const silent = walkers.filter(k => !counts[k]);
      return { pass: silent.length === 0,
               detail: { walkersProvoked: walkers, silent, counts,
                         note: 'glinthawk is excluded: it flies, it has no feet' } };
    })()`,
  },

  /* ----------------------------- visual ----------------------------- */
  {
    id: 'V26-silhouette', kind: 'visual', lane: 'machine-rig',
    title: 'Every species reads as its HZD machine in side profile against plain sky',
    settle: 2600, timeout: 120000,
    setup: `(async () => {
      ${LINEUP}
      await stageCast(['sawtooth', 'thunderjaw', 'scrapper', 'longleg', 'glinthawk']);
    })()`,
    criteria: 'Five machines side-on against a flat sky, scale-normalised, left to right: Sawtooth, Thunderjaw, '
      + 'Scrapper, Longleg, Glinthawk. Each faces SCREEN LEFT. '
      + 'PASS requires all five silhouettes the audit calls out (docs/research/roster-v2.md §3/§4): '
      + 'the SAWTOOTH has visible fangs at the muzzle and a front-heavy chest block over four legs; '
      + 'the THUNDERJAW has a boxy slab skull with a square jaw and a long HORIZONTAL tail off the hips (not an upswept crest); '
      + 'the SCRAPPER stands on FOUR legs with a low forward snout, not upright on two; '
      + 'the LONGLEG carries stub wings folded against its ribs on two tall legs; '
      + 'the GLINTHAWK has wings at all — a spanned wing on each side, not a bare armature. '
      + 'Plate/muscle materials: white-grey armour over dark underbody with lit edges. '
      + 'FAIL if any of the five reads as the wrong animal.',
  },
  {
    id: 'V27-attack-pose', kind: 'visual', lane: 'machine-rig',
    title: 'Mid-windup, the LIMBS are doing the work — not just the body transform',
    settle: 2600, timeout: 120000,
    setup: `(async () => {
      ${LINEUP}
      await stageCast(['sawtooth', 'thunderjaw', 'scrapper', 'longleg'], {
        state: 'attack',
        settle: 900,
        live: true,          // the rig keeps solving; only the transform is pinned
        windupAt: 0.8,
        // ROUND-4 FIX ROUND 2. Fix round 1 asked machine-ai for an attack by
        // setting lastKnown and forcing the state, from 60 m away — so
        // chooseAttack(dist) returned the LONG-RANGE move (or none), whose
        // wind-up is a body transform, and then the rig was frozen anyway so
        // no pose was ever solved. The close-range moves are the ones with
        // authored limb keyframes (machine-rig-08), so they are started
        // directly, at the distance that selects them, and held open.
        beforeFreeze: async (cast) => {
          for (const m of cast) {
            try {
              m._attackCd = 0;
              for (const k of Object.keys(m)) if (/^_cd[A-Z]/.test(k)) m[k] = 0;
              m.lastKnown = (m.lastKnown && m.lastKnown.copy)
                ? m.lastKnown.copy(__CTX__.player.position) : __CTX__.player.position.clone();
              let a = null;
              for (const d of [3.0, 5.0, 8.0, 10.5, 12.5]) {
                a = m.chooseAttack?.(d);
                if (a) break;
              }
              if (a) { a.plant = true; a.track = false; m._startAttack(a); }
            } catch (e) { /* machine-ai owns these */ }
          }
          await new Promise(r => setTimeout(r, 700));
        },
      });
    })()`,
    criteria: 'Four machines frozen mid-attack-windup against a flat sky, scale-normalised, left to right: '
      + 'Sawtooth, Thunderjaw, Scrapper, Longleg. '
      + 'PASS requires visible LIMB work in at least three of them — a raised/cocked front paw, a head dropped and thrust '
      + 'forward, a coiled crouch with the hind legs gathered under the body, or an elevated launcher/cannon — '
      + 'so the pose reads as a wind-up rather than the idle stance rotated. '
      + 'FAIL if the machines are in their neutral standing pose with only the body yawed or tilted.',
  },
  /**
   * WAVE-2 FOLLOW-UP, judge finding "hideSculpt() leaves the retired donor
   * mesh as the machine's AIM geometry — up to 80 % of hits land on invisible
   * geometry".
   *
   * `A50-hulls-visible` grades the hull SET (no capsule may be sourced from a
   * retired sculpt). That is the structural half. This is the behavioural
   * half, and it is the orchestrator's own acceptance criterion: fire 50
   * arrows at each species' silhouette; at least 95 % must register on
   * geometry that is actually drawn, and none on the retired donor.
   *
   * GROUND TRUTH, not a guess. Each ray is aimed at a real posed vertex of a
   * DRAWN mesh and then confirmed with `ctx.hitHulls.referenceRaycast()` —
   * spatial's published full-triangle path, kept for exactly this purpose —
   * so a ray only counts once the triangles agree there is a machine there.
   * The arrow's own path (`ctx.hitHulls.raycast`) is then asked the same
   * question and its answer is attributed to the mesh the winning capsule was
   * built from:
   *
   *   drawn      the source mesh is visible: a hit on the machine you see
   *   pooled     the source is an eye/accent object the FX pool draws for it
   *              (`ctx.machineFx.attachGlow` hides the mesh and draws the
   *              halo) — still a hit on something on screen
   *   RETIRED    the source carries `noHull` / `hiddenSculpt`: the donor
   *              sculpt under the kitbash shell. This is the ghost. Zero.
   */
  {
    id: 'A50b-aim-on-drawn-geometry', kind: 'action', lane: 'machine-rig',
    title: '50 arrows per species: >=95% register on geometry that is DRAWN, 0 on the retired donor sculpt',
    settle: 500, timeout: 200000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      const HH = __CTX__.hitHulls;
      if (!HH?.raycast || !HH?.referenceRaycast) return { pass: null, detail: 'SKIP: ctx.hitHulls not published' };
      const list = (__CTX__.machines?.list || []).filter(m => m.alive);
      const V = __CTX__.player.position.constructor;
      const _v = new V();
      const drawn = (o) => { let n = o; while (n) { if (n.visible === false) return false; n = n.parent; } return true; };
      const out = {}; const offenders = []; let ghosts = 0, speciesDone = 0;
      const kinds = [...new Set(list.map(m => m.kind))];
      for (const kind of kinds) {
        const m = list.find(x => x.kind === kind);
        const p = __CTX__.player;
        // inside the near LOD ring, so nothing is hidden by distance
        const D = Math.max(8, m.height * 2.2);
        p.position.set(m.position.x + D, 0, m.position.z);
        p._snapToGround?.();
        p.camYaw = Math.atan2(m.position.x - p.position.x, m.position.z - p.position.z) + Math.PI;
        for (let i = 0; i < 20; i++) await new Promise(r => requestAnimationFrame(r));
        m.root.updateMatrixWorld(true);
        // aim points: posed vertices of the DRAWN meshes = the silhouette
        const pts = [];
        m.root.traverse((o) => {
          if (!o.isMesh || !o.geometry?.attributes?.position || !drawn(o)) return;
          const P = o.geometry.attributes.position;
          const step = Math.max(1, Math.floor(P.count / 40));
          for (let i = 0; i < P.count; i += step) {
            _v.fromBufferAttribute(P, i);
            if (o.isSkinnedMesh) { o.applyBoneTransform(i, _v); _v.applyMatrix4(o.matrixWorld); }
            else _v.applyMatrix4(o.matrixWorld);
            pts.push([_v.x, _v.y, _v.z]);
          }
        });
        if (pts.length < 60) { out[kind] = 'no drawn geometry'; continue; }
        const cam = __CTX__.camera.position;
        const org = new V(cam.x, cam.y, cam.z);
        const dir = new V();
        const ray = { origin: org, direction: dir };
        const N = 50;
        let fired = 0, registered = 0, onDrawn = 0, onPooled = 0, onRetired = 0, onOther = 0;
        const ghostNames = {}, holes = {};
        const stride = Math.max(1, Math.floor(pts.length / (N * 1.7)));
        for (let k = 0; k < pts.length && fired < N; k += stride) {
          const q = pts[k];
          dir.set(q[0] - org.x, q[1] - org.y, q[2] - org.z).normalize();
          const truth = HH.referenceRaycast(m, ray, 300);
          if (!truth || !drawn(truth.object)) continue;   // no drawn triangle: not an arrow at the machine
          fired++;
          const hit = HH.raycast(ray, { machines: [m], far: 300 });
          if (!hit) {
            const key = truth.object.name || '(unnamed)';
            holes[key] = (holes[key] || 0) + 1;
            continue;
          }
          registered++;
          const o = hit.hull?.object;
          const retired = !!(o?.userData?.noHull || o?.userData?.hiddenSculpt);
          if (retired) {
            onRetired++;
            const key = (o?.name || '(unnamed)') + ' under ' + (o?.parent?.name || '?');
            ghostNames[key] = (ghostNames[key] || 0) + 1;
          } else if (drawn(o)) onDrawn++;
          else if (o?.userData?.pooledGlow) onPooled++;
          else { onOther++; ghostNames[(o?.name || '(unnamed)') + ' [invisible]'] = (ghostNames[(o?.name || '(unnamed)') + ' [invisible]'] || 0) + 1; }
        }
        if (fired < 20) { out[kind] = { note: 'SKIP: only ' + fired + ' confirmed arrows', fired }; continue; }
        const pct = +(100 * (onDrawn + onPooled) / fired).toFixed(1);
        out[kind] = { arrows: fired, registered, onDrawn, onPooled, onRetiredSculpt: onRetired,
                      onOtherInvisible: onOther, pctOnDrawn: pct, missedHoles: holes, ghosts: ghostNames };
        ghosts += onRetired + onOther;
        if (pct < 95) offenders.push(kind);
        speciesDone++;
      }
      if (speciesDone < 4) return { pass: null, detail: { note: 'SKIP: fewer than 4 species measured', out } };
      return { pass: offenders.length === 0 && ghosts === 0,
               detail: { budget: '>=95% of confirmed arrows register on DRAWN geometry; 0 on a retired/invisible source',
                         speciesMeasured: speciesDone, belowBudget: offenders, hitsOnGhostGeometry: ghosts, out } };
    })()`,
  },

  /**
   * WAVE-2 FOLLOW-UP, judge finding "A45 fails under full-suite load while
   * passing standalone".
   *
   * `A45` samples `debugFeet()` once per rendered frame and treats a run of
   * `planted === true` as ONE stance. That is only a valid inference if the
   * rig guarantees a consumer sees the release between two plants — and under
   * load it did not, because several exits from stance cleared the flag
   * without recording the release, so substep 1 of a frame could drop a plant
   * and substep 2 open a new one. Two plants, one reported stance, and the
   * distance between them measured as "drift": 0.422 m against a 0.06 m
   * budget on a rig that skates by 0.008 m.
   *
   * This gate grades the guarantee itself, and it does it the way the failure
   * happened: it samples DELIBERATELY SLOWLY (every third rendered frame, the
   * sampling rate of a consumer on a contended box) and checks the plant
   * IDENTITY the rig now publishes — `debugFeet()[i].plantId` — against the
   * boolean. A merged report is a run of `planted` whose `plantId` changes
   * underneath it. Zero merges is the assertion; the per-window drift is
   * measured with the same 0.06 m budget as `A45` so the slow sampler cannot
   * pass by seeing nothing.
   */
  {
    id: 'A45b-stance-report-integrity', kind: 'action', lane: 'machine-rig',
    title: 'A slow consumer never sees two plants as one stance (plantId integrity at 1/3 frame rate)',
    settle: 500, timeout: 200000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      const T = __CTX__.terrain, out = {};
      let merges = 0, worstAll = 0, measured = 0;
      for (const [kind, m] of species) {
        const feet0 = m.debugFeet ? m.debugFeet() : [];
        if (feet0.length < 2) { out[kind] = 'no feet'; continue; }
        if (feet0[0].plantId === undefined) { out[kind] = 'no plantId'; continue; }
        ${PROVOKE}
        const open = {}; const done = []; let merged = 0;
        const t0 = performance.now();
        let moved = 0, sx = m.position.x, sz = m.position.z, frames = 0;
        while (performance.now() - t0 < 6000) {
          await new Promise(r => requestAnimationFrame(r));
          frames++;
          if (frames % 3) continue;                 // a consumer at 1/3 frame rate
          moved += Math.hypot(m.position.x - sx, m.position.z - sz);
          sx = m.position.x; sz = m.position.z;
          for (const f of m.debugFeet()) {
            const on = f.planted && Math.abs(f.world.y - T.getHeight(f.world.x, f.world.z)) <= 0.25;
            const w = open[f.name];
            if (on) {
              if (!w) {
                open[f.name] = { id: f.plantId, x0: f.world.x, x1: f.world.x, z0: f.world.z, z1: f.world.z, n: 1 };
              } else {
                if (f.plantId !== w.id) { merged++; w.id = f.plantId; }   // TWO plants inside one reported stance
                w.x0 = Math.min(w.x0, f.world.x); w.x1 = Math.max(w.x1, f.world.x);
                w.z0 = Math.min(w.z0, f.world.z); w.z1 = Math.max(w.z1, f.world.z); w.n++;
              }
            } else if (w) {
              if (w.n >= 3) done.push(+Math.hypot(w.x1 - w.x0, w.z1 - w.z0).toFixed(3));
              open[f.name] = null;
            }
          }
        }
        if (moved < 0.4 || done.length < 2) {
          out[kind] = { skipped: 'idle', movedM: +moved.toFixed(2), windows: done.length, mergedReports: merged };
          continue;
        }
        const worst = Math.max(...done);
        out[kind] = { maxStanceDriftM: worst, windows: done.length, movedM: +moved.toFixed(2),
                      mergedReports: merged, sampledFrames: Math.floor(frames / 3), renderedFrames: frames };
        worstAll = Math.max(worstAll, worst);
        merges += merged;
        measured++;
      }
      if (measured < 2) return { pass: null, detail: { note: 'SKIP: fewer than 2 species walked far enough', out } };
      return { pass: merges === 0 && worstAll <= 0.06,
               detail: { budget: '0 merged stance reports at 1/3 frame rate, and drift <= 0.06 m',
                         mergedReports: merges, worstM: worstAll, speciesMeasured: measured, out } };
    })()`,
  },
];
