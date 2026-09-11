/**
 * Round 4 gates — lane `world-props` (docs/ROUND4-AUDIT.md §4).
 *
 * Same contract as tools/gates.config.mjs: gates run JS in page context with
 * `__CTX__` / `__GAME__` available and resolve `{ pass, detail }`.
 *
 * All three are ACTION gates on purpose. The audit words V34 and V35 as shots,
 * and a shot is still taken — the runner screenshots every gate and each of
 * these paints its own labelled contact sheet over the page first — but the
 * verdict is a measurement, not an opinion:
 *
 *   A61  every candidate mesh and every tree/rock instance in the scene is
 *        matched against the live collider registry BY IDENTITY, and the
 *        palisade is then proved to stop a swept capsule on every non-gate
 *        bearing while both gate openings let one through.
 *   V34  a 119-ray fan is fired through each of the four vista frames; the
 *        NEAREST thing each ray meets must be landmark geometry in the
 *        150-300 m band, so a tree or the palisade cannot pass the gate on a
 *        megastructure's behalf.
 *   V35  the settlement is counted, the braziers are proved lit by rendering
 *        the same dusk frame twice — once with them extinguished — and diffing
 *        real pixels, the six idle poses are proved pairwise different, and the
 *        idle layer is proved to move pixels between two values of its clock.
 */

/** Shared page-context kit: deterministic render, pixel probes, contact sheet. */
const KIT = `
  const ctx = __CTX__;
  const engine = ctx.engine;
  const renderer = ctx.renderer;
  const cam = ctx.camera;
  const V = ctx.player.position.constructor;
  const gl = renderer.getContext();
  const W = renderer.domElement.width, H = renderer.domElement.height;

  const draw = (n = 3) => {
    for (let i = 0; i < n; i++) { engine._shadowCullClock = 0; engine.render(0.05); }
  };
  const grab = () => {
    const buf = new Uint8ClampedArray(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  };
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  /** Median RGB (0-255) of an 11x11 patch of a captured buffer at a world point. */
  const patchAt = (buf, x, y, z) => {
    const v = new V(x, y, z).project(cam);
    if (!(v.z < 1)) return null;
    const px = Math.round((v.x * 0.5 + 0.5) * W);
    const py = Math.round((v.y * 0.5 + 0.5) * H);
    if (px < 6 || py < 6 || px > W - 7 || py > H - 7) return null;
    const r = [], g = [], b = [];
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const i = ((py + dy) * W + (px + dx)) * 4;
      r.push(buf[i]); g.push(buf[i + 1]); b.push(buf[i + 2]);
    }
    const med = (a) => { a.sort((p, q) => p - q); return a[60]; };
    return { r: med(r), g: med(g), b: med(b), px, py };
  };
  /** Mean absolute per-channel difference of an NxN patch between two buffers. */
  const patchDiff = (a, b, px, py, N = 21) => {
    let sum = 0, n = 0;
    const h = N >> 1;
    for (let dy = -h; dy <= h; dy++) for (let dx = -h; dx <= h; dx++) {
      const i = ((py + dy) * W + (px + dx)) * 4;
      sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      n += 3;
    }
    return sum / n;
  };
  const sheet = (frames, labels, cols = 2) => {
    const rows = Math.ceil(frames.length / cols);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const t = document.createElement('canvas'); t.width = W; t.height = H;
    const tg = t.getContext('2d');
    for (let i = 0; i < frames.length; i++) {
      tg.putImageData(new ImageData(frames[i], W, H), 0, 0);
      g.save();
      g.translate((i % cols) * W / cols, Math.floor(i / cols) * H / rows);
      g.scale(1 / cols, -1 / rows);
      g.drawImage(t, 0, -H);
      g.restore();
      g.fillStyle = '#000'; g.globalAlpha = 0.62;
      g.fillRect((i % cols) * W / cols, Math.floor(i / cols) * H / rows, 470, 22);
      g.globalAlpha = 1; g.fillStyle = '#ffe3b0';
      g.font = '13px ui-monospace, monospace';
      g.fillText(labels[i], (i % cols) * W / cols + 8, Math.floor(i / cols) * H / rows + 16);
    }
    const img = new Image();
    img.src = c.toDataURL('image/png');
    img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647';
    document.body.appendChild(img);
  };
  const hideHud = () => { const h = document.getElementById('hud'); if (h) h.style.display = 'none'; };
`;

export const GATES = [
  /* ------------------------------------------------------------------ A61 */
  {
    id: 'A61-colliders-registered', kind: 'action', lane: 'world-props',
    title: 'Every tree/rock/ruin/tent/tower instance is a live collider; the palisade seals and its gates open',
    settle: 2200, timeout: 60000,
    assert: `(() => {
      const ctx = __CTX__;
      const C = ctx.collision;
      if (!C) return { pass: false, detail: { reason: 'ctx.collision missing — spatial not installed' } };
      const V = ctx.player.position.constructor;

      /* ---- 1. identity match: every candidate mesh must own a collider ---- */
      const registered = new Set();
      for (const c of C.colliders) {
        if (c.node) registered.add(c.node);
        if (c.ref) registered.add(c.ref);
      }
      const groups = ['world-props', 'hunter-camp', 'world-rockworks', 'tallneck-landmark', 'world-activities'];
      const missing = [];
      const byGroup = {};
      let candidates = 0;
      for (const name of groups) {
        const g = ctx.scene.getObjectByName(name);
        if (!g) { missing.push('GROUP-ABSENT:' + name); continue; }
        g.updateWorldMatrix(true, true);
        // a group registered WHOLE (the Tallneck's legs/body are explicit
        // capsule+box primitives with ref = the group) is covered by that ref
        if (registered.has(g)) { byGroup[name] = 'whole-group'; continue; }
        let n = 0, miss = 0;
        g.traverse((o) => {
          if (!o.isMesh || o.isInstancedMesh) return;
          // exactly the exclusions collision.seedWorld() applies, restated here
          // so this gate is not merely asking the seeder to agree with itself
          if (Object.prototype.hasOwnProperty.call(o, 'raycast')) return;   // decals, people, fauna
          const geo = o.geometry;
          if (!geo || !geo.attributes.position) return;
          if (!geo.boundingBox) geo.computeBoundingBox();
          const bb = geo.boundingBox;
          const sy = Math.abs(o.matrixWorld.elements[5]) || 1;
          if ((bb.max.y - bb.min.y) * sy < 0.3) return;
          const mat = Array.isArray(o.material) ? o.material[0] : o.material;
          if (mat && mat.depthWrite === false) return;
          candidates++; n++;
          if (!registered.has(o)) { miss++; missing.push(name + '/' + (o.name || o.uuid.slice(0, 6))); }
        });
        byGroup[name] = n + ' meshes, ' + miss + ' unregistered';
      }

      /* ---- 2. instance counts: no tree or rock may be a ghost ---- */
      let trees = 0, rocks = 0;
      const veg = ctx.vegetation && ctx.vegetation.group;
      if (veg) for (const c of veg.children) {
        if (!c.isInstancedMesh) continue;
        if (/^pines-/.test(c.name)) trees += c.count;
        else if (/^rocks-/.test(c.name)) rocks += c.count;
      }
      const census = C.census();
      const total = C.count();

      /* ---- 3. the palisade stops a capsule, and its two gates do not ---- */
      const camp = ctx.camp;
      const S = camp.settlement;
      const fire = camp.firePosition;
      const probe = (a) => {
        const r = S ? S.palisadeRadius(a) : 20;
        const sx = Math.sin(a), sz = Math.cos(a);
        // the cast follows the GROUND at the wall line: a fixed height taken
        // from the fire sails over the wall on the bearings where the knoll
        // falls away, and would have called an open flank sealed
        const gy = ctx.terrain.getHeight(fire.x + sx * r, fire.z + sz * r);
        const from = new V(fire.x + sx * (r - 3.2), gy + 0.05, fire.z + sz * (r - 3.2));
        const to = new V(fire.x + sx * (r + 3.2), gy + 0.05, fire.z + sz * (r + 3.2));
        const hit = C.capsuleCast(from, to, 0.4, 1.7,
          { filter: (c) => c.kind === 'tent' || c.kind === 'tower' });
        return hit && hit.hit ? +hit.distance.toFixed(2) : null;
      };
      let walled = 0, wallProbes = 0, openGates = 0;
      const leaks = [];
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        if (S && S.gateAt(a)) continue;
        wallProbes++;
        if (probe(a) !== null) walled++;
        else leaks.push(+(a * 180 / Math.PI).toFixed(0));
      }
      const gates = [];
      if (S) {
        for (const ga of [Math.PI * 1.14, Math.PI * 0.22]) {
          const d = probe(ga);
          gates.push(d === null ? 'open' : ('blocked@' + d));
          if (d === null) openGates++;
        }
      }

      const detail = {
        total, census, candidates, byGroup,
        missingCount: missing.length, missing: missing.slice(0, 12),
        treeInstances: trees, treeColliders: census.tree ?? 0,
        rockInstances: rocks, rockColliders: census.rock ?? 0,
        lanePrimitives: ctx.props ? ctx.props.colliderCount : 0,
        palisadeSealed: walled + '/' + wallProbes, leakBearings: leaks.slice(0, 8),
        palisadePosts: camp.palisadePosts ?? 0, gates,
      };
      const pass = total >= 800
        && missing.length === 0
        && trees > 0 && (census.tree ?? 0) >= trees
        && rocks > 0 && (census.rock ?? 0) >= rocks
        && (census.ruin ?? 0) > 0 && (census.tent ?? 0) > 0 && (census.tower ?? 0) > 0
        && (census.landmark ?? 0) > 0 && (census.cliff ?? 0) > 0
        && (census.arch ?? 0) > 0 && (census.cave ?? 0) > 0
        && wallProbes > 0 && walled === wallProbes
        && gates.length === 2 && openGates === 2;
      return { pass, detail };
    })()`,
  },

  /* ------------------------------------------------------------------ V34 */
  {
    id: 'V34-midground', kind: 'action', lane: 'world-props',
    title: 'Every bearing out of the spawn vista has a landmark silhouette in the 150-300 m band',
    params: 'px=-20&pz=20&pitch=0.06',
    settle: 2400, timeout: 90000,
    assert: `(() => {
      ${KIT}
      hideHud();
      const env = ctx.environment;
      env.setWeather('clear', 0);
      env.setTime(10.0);
      if (ctx.settings) ctx.settings.cameraSmoothing = 0;
      /**
       * THE VISTA POINT, and why it is not (0, 0).
       *
       * Three standing points were measured on port 5211 before this was
       * fixed. Inside the camp the palisade eats 1100 of 1775 rays, which is
       * what a palisade is for. At the map origin the lens sits at y = -2.6 in
       * a bowl, with a berm 20-60 m west that hides anything under 27 m at
       * 200 m, and the shot came back as a wall of tall-grass cards 40 cm from
       * the lens — the rays passed (grass is not a collider) while the picture
       * showed nothing, which is a gate lying to itself.
       *
       * (-20, 20) is the low rise north-west of the camp: 4.3 m of local
       * relief, tallGrassDensity 0.1, and open on all four bearings. The
       * camera is a plain eye-height camera, not the chase boom, because a
       * vista is what the PLAYER sees, not the back of her head.
       */
      const VX = -20, VZ = 20;
      const eyeY = ctx.terrain.getHeight(VX, VZ) + 1.75;
      const p = ctx.player;
      p.position.set(VX, 0, VZ); p._snapToGround?.();

      /**
       * The silhouette set: exactly what this lane calls a landmark. Named
       * explicitly, and the ray test below takes the NEAREST hit of ALL
       * colliders — so a tree, a rock or the camp palisade standing in front of
       * a megastructure makes the ray miss, which is what "silhouette" means.
       */
      const landmarks = new Set();
      const add = (o) => { if (o) o.traverse((m) => { if (m.isMesh || m.isGroup) landmarks.add(m); }); };
      for (const m of (ctx.props?.megaMeshes ?? [])) landmarks.add(m);
      add(ctx.props?.tallneck?.group);
      if (ctx.props?.tallneck?.group) landmarks.add(ctx.props.tallneck.group);
      add(ctx.props?.rockworks?.group);
      const wp = ctx.scene.getObjectByName('world-props');
      if (wp) wp.traverse((m) => { if (m.isMesh && /lookout|watchtower|ruin|mega/i.test(m.name || '')) landmarks.add(m); });

      const yaws = [0, 1, 2, 3].map((i) => i * Math.PI / 2);
      const frames = [], labels = [], perYaw = [];
      /**
       * 71 x 25. The first cut used 17 x 7 and the west bearing scored ONE ray:
       * a lattice relay mast is ~4 m across at 250 m, which is 0.9 deg, and a
       * 5.3 deg grid steps straight over it. A gate that cannot see a real
       * silhouette is measuring its own sampling rate, not the world.
       */
      const COLS = 71, ROWS = 25;

      for (let k = 0; k < yaws.length; k++) {
        cam.position.set(VX, eyeY, VZ);
        cam.lookAt(new V(VX + Math.sin(yaws[k]) * 20, eyeY + 2.2, VZ + Math.cos(yaws[k]) * 20));
        cam.updateMatrixWorld(true);
        draw(3);
        const fwd = new V(); cam.getWorldDirection(fwd);
        const bearing = ((Math.round(Math.atan2(fwd.x, fwd.z) * 180 / Math.PI) % 360) + 360) % 360;

        let hits = 0, near = Infinity, far = 0, what = null, blocked = 0, terrainHid = 0;
        const dir = new V();
        for (let cx = 0; cx < COLS; cx++) {
          for (let cy = 0; cy < ROWS; cy++) {
            const ndcX = (cx / (COLS - 1)) * 2 - 1;
            const ndcY = 0.70 - (cy / (ROWS - 1)) * 0.98;
            dir.set(ndcX, ndcY, 0.5).unproject(cam).sub(cam.position).normalize();
            const h = ctx.collision.raycast(cam.position.x, cam.position.y, cam.position.z,
              dir.x, dir.y, dir.z, 320);
            if (!h || !h.hit) continue;
            const node = h.collider && (h.collider.node || h.collider.ref);
            const isLandmark = !!node && landmarks.has(node);
            if (!isLandmark) { blocked++; continue; }
            if (h.distance < 150 || h.distance > 300) continue;
            /**
             * The heightfield is not a collider, so a collider raycast happily
             * threads a ridge. Without this march the gate passed on four
             * bearings whose shots showed nothing but a hillside — it was
             * measuring geometry that exists, not a silhouette you can SEE.
             */
            let occluded = false;
            for (let t = 6; t < h.distance; t += 2.5) {
              if (cam.position.y + dir.y * t
                  < ctx.terrain.getHeight(cam.position.x + dir.x * t, cam.position.z + dir.z * t)) {
                occluded = true; break;
              }
            }
            if (occluded) { terrainHid++; continue; }
            hits++;
            if (h.distance < near) { near = h.distance; what = (node.name || h.collider.kind || '?'); }
            if (h.distance > far) far = h.distance;
          }
        }
        perYaw.push({
          bearing, rays: hits,
          nearest: hits ? +near.toFixed(0) : null, farthest: hits ? +far.toFixed(0) : null,
          landmark: what, occludedByProps: blocked, occludedByTerrain: terrainHid,
        });
        frames.push(grab());
        labels.push('yaw ' + (k * 90) + '\\u00b0  bearing ' + bearing + '\\u00b0  landmark rays 150-300 m: ' + hits
          + (hits ? ('  ' + near.toFixed(0) + '-' + far.toFixed(0) + ' m  ' + what) : '  NONE'));
      }
      sheet(frames, labels, 2);

      const worst = Math.min(...perYaw.map((y) => y.rays));
      return {
        pass: perYaw.length === 4 && worst >= 20,
        detail: { perYaw, worstYawRays: worst, bar: '>=20 landmark rays per yaw in 150-300 m',
          landmarkMeshes: landmarks.size, grid: COLS + 'x' + ROWS },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ V35 */
  {
    id: 'V35-settlement', kind: 'action', lane: 'world-props',
    title: 'Camp at dusk: palisade, >=5 structures, braziers measurably lit, >=4 NPCs in distinct idles that move',
    params: 'px=22&pz=30&pitch=0.06',
    settle: 2600, timeout: 90000,
    assert: `(() => {
      ${KIT}
      hideHud();
      const env = ctx.environment;
      const camp = ctx.camp;
      env.setWeather('clear', 0);
      env.setTime(19.4);                       // dusk: the braziers have to earn it
      if (ctx.settings) ctx.settings.cameraSmoothing = 0;
      const p = ctx.player;
      p.position.set(22, 0, 30); p._snapToGround?.();

      /* ---- 1. structures ---- */
      const huts = camp.huts ?? [];
      const roofed = huts.filter((h) => (h.roofY ?? 0) - (h.baseY ?? 0) > 1.8);
      const structures = (camp.structures ?? []).length;

      /* ---- 2. palisade ---- */
      const posts = camp.palisadePosts ?? 0;
      const gateOk = !!(camp.gate && Number.isFinite(camp.gate.topY));

      /* ---- 3. the idles are DIFFERENT idles ---- */
      const lm = camp.npcLandmarks ?? [];
      let minPoseDelta = Infinity, worstPair = null;
      for (let i = 0; i < lm.length; i++) {
        for (let j = i + 1; j < lm.length; j++) {
          const a = lm[i], b = lm[j];
          let d = 0;
          for (const key of ['localR', 'localL', 'localHead']) {
            for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(a[key][k] - b[key][k]));
          }
          if (d < minPoseDelta) { minPoseDelta = d; worstPair = a.id + '/' + b.id; }
        }
      }

      /* ---- frame the camp: plaza, huts, gate and four NPCs in one shot ---- */
      // Back far enough off the plaza that the palisade line, the gate, four
      // huts and four of the six NPCs are all inside one frame — the first
      // framing sat 6 m from a hut wall and the judge saw a roof.
      const fy = camp.firePosition.y;
      cam.position.set(5.2, fy + 8.4, 12.6);
      cam.lookAt(new V(21.4, fy + 1.1, 30.6));
      cam.updateMatrixWorld(true);
      draw(4);
      const on = grab();

      /* ---- 4. are the braziers LIT? Extinguish them and diff real pixels ---- */
      const lights = camp.brazierLights ?? [];
      const glow = camp.brazierGlow;
      const probes = [];
      for (const b of lights) {
        const bowl = { x: b.light.position.x, y: b.light.position.y + 0.1, z: b.light.position.z };
        // the pool of light on the ground 2.4 m out, on the camera side
        const dx = cam.position.x - bowl.x, dz = cam.position.z - bowl.z;
        const L = Math.hypot(dx, dz) || 1;
        const gx = bowl.x + (dx / L) * 2.4, gz = bowl.z + (dz / L) * 2.4;
        probes.push({ bowl, pool: { x: gx, y: ctx.terrain.getHeight(gx, gz) + 0.05, z: gz } });
      }
      const savedI = lights.map((b) => b.light.intensity);
      const savedE = glow ? glow.emissiveIntensity : 0;
      for (const b of lights) b.light.intensity = 0;
      if (glow) glow.emissiveIntensity = 0;
      draw(4);
      const off = grab();
      for (let i = 0; i < lights.length; i++) lights[i].light.intensity = savedI[i];
      if (glow) glow.emissiveIntensity = savedE;
      draw(4);

      const braziers = [];
      for (const pr of probes) {
        const bOn = patchAt(on, pr.bowl.x, pr.bowl.y, pr.bowl.z);
        const bOff = patchAt(off, pr.bowl.x, pr.bowl.y, pr.bowl.z);
        const pOn = patchAt(on, pr.pool.x, pr.pool.y, pr.pool.z);
        const pOff = patchAt(off, pr.pool.x, pr.pool.y, pr.pool.z);
        if (!bOn || !bOff) continue;
        braziers.push({
          bowlGain: +(lum(bOn) - lum(bOff)).toFixed(1),
          warmGain: +(((bOn.r - bOn.b) - (bOff.r - bOff.b))).toFixed(1),
          poolGain: pOn && pOff ? +(lum(pOn) - lum(pOff)).toFixed(1) : null,
          bowlOn: [bOn.r, bOn.g, bOn.b], bowlOff: [bOff.r, bOff.g, bOff.b],
        });
      }
      /**
       * The per-brazier probes are reported, but the VERDICT is taken over the
       * whole frame. A world-point probe can land on a hut that happens to be
       * between the lens and one bowl, and a gate that fails on framing is
       * measuring the camera, not the light. Counting every pixel the braziers
       * brighten cannot be fooled that way, and it is the same question: at
       * dusk, do these things light the camp?
       */
      let brightened = 0, peakGain = 0, sumGain = 0;
      for (let i = 0; i < on.length; i += 4) {
        const d = (0.2126 * (on[i] - off[i]) + 0.7152 * (on[i + 1] - off[i + 1])
          + 0.0722 * (on[i + 2] - off[i + 2]));
        if (d > 12) brightened++;
        if (d > peakGain) peakGain = d;
        if (d > 0) sumGain += d;
      }
      peakGain = +peakGain.toFixed(1);
      const litOk = lights.length >= 2 && brightened >= 1500 && peakGain >= 60
        && braziers.filter((b) => b.bowlGain > 15 && b.warmGain > 6).length >= 1;

      /* ---- 5. the idle layer moves pixels ---- */
      let moved = 0, movedAt = null;
      const clock = camp._npcTime;
      if (clock) {
        let bestA = null, bestD = Infinity;
        for (const a of (camp.npcs ?? [])) {
          const d = a.position.distanceTo(cam.position);
          if (d > 3 && d < bestD) { bestD = d; bestA = a; }
        }
        if (bestA) {
          const t0 = clock.value;
          // Sample four clock values, not two: the idle is two incommensurate
          // sines, and one pair of instants can land on the same pose by
          // coincidence — which is what a 0.21 px-delta on a moving NPC was.
          clock.value = 0.0; draw(2); const fA = grab();
          const pt = patchAt(fA, bestA.position.x, bestA.position.y + 1.42, bestA.position.z);
          if (pt) {
            for (const tv of [1.9, 3.7, 5.6]) {
              clock.value = tv; draw(2);
              const d = patchDiff(fA, grab(), pt.px, pt.py, 31);
              if (d > moved) moved = d;
            }
            moved = +moved.toFixed(2);
            movedAt = bestA.name;
          }
          clock.value = t0;
          draw(3);
        }
      }

      const final = grab();
      sheet([final], ['camp 19:24  posts ' + posts + '  structures ' + structures
        + '  NPCs ' + lm.length + '  brazier-lit px ' + brightened
        + ' (peak +' + peakGain + ')  idle px-delta ' + moved], 1);

      const detail = {
        structures, huts: huts.length, roofedHuts: roofed.length,
        palisadePosts: posts, gate: gateOk,
        npcs: lm.length, poses: lm.map((l) => l.pose),
        minPoseDelta: +minPoseDelta.toFixed(3), worstPair,
        braziers, brazierPixelsBrightened: brightened, brazierPeakGain: peakGain,
        idlePixelDelta: moved, idleOn: movedAt,
      };
      const pass = structures >= 5 && roofed.length >= 4 && posts >= 300 && gateOk
        && lm.length >= 4 && minPoseDelta >= 0.12
        && litOk && moved >= 1.0;
      return { pass, detail };
    })()`,
  },

  /* ----------------------------------------------------------------- A61b */
  /**
   * FIX ROUND 1. `camp-rest` was published in this lane's contract and never
   * emitted in the shipped build: `progression` registers the REST & SAVE entry
   * first and its `onInteract` only OPENS the campfire panel, so the emit that
   * sat inside `camp.restAtFire()` was unreachable — and a first fix that added
   * a second emit to the same method was still unreachable. Nothing caught it
   * because no gate drove the button a player actually presses.
   *
   * This one does: it finds the live REST entry at the fire, interacts with it,
   * clicks the real REST UNTIL DAWN control in the DOM, and then asserts the
   * clock moved, health came back, and EXACTLY ONE `camp-rest` was raised.
   * A direct `camp.restAtFire()` is then driven as a control, so a future fix
   * cannot pass by double-emitting. localStorage is snapshotted and restored,
   * because resting writes a real save and this gate must not hand a save to
   * whatever runs next.
   */
  {
    id: 'A61b-camp-rest-event', kind: 'action', lane: 'world-props',
    title: 'Resting at the campfire through the shipped UI raises exactly one camp-rest, moves the clock and heals',
    settle: 2400, timeout: 150000,
    assert: `(async () => {
      const ctx = __CTX__;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      /**
       * Wait on the CONDITION, never on a stopwatch. \`environment.rest\` fades
       * over ~2 s of wall clock and this box runs the suite 15 lanes deep: a
       * fixed 2.8 s sleep read the clock mid-fade under load, scored the rest
       * as "no event", then started the control rest on top of the one still
       * in flight and counted its late event twice. Same code, two verdicts —
       * which is a broken gate, not a broken build.
       */
      const waitFor = async (pred, ms) => {
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          if (pred()) return true;
          await sleep(80);
        }
        return !!pred();
      };
      const lsBefore = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i); lsBefore[k] = localStorage.getItem(k);
      }
      const restoreLS = () => {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
        for (const k of keys) if (!(k in lsBefore)) localStorage.removeItem(k);
        for (const k of Object.keys(lsBefore)) localStorage.setItem(k, lsBefore[k]);
      };
      const note = (lines) => {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;'
          + 'background:rgba(0,0,0,.74);color:#ffe3b0;padding:10px 14px;'
          + 'font:13px ui-monospace,monospace;white-space:pre';
        d.textContent = lines.join(String.fromCharCode(10));
        document.body.appendChild(d);
      };

      const fire = ctx.camp && ctx.camp.firePosition;
      if (!fire) { restoreLS(); return { pass: false, detail: { reason: 'ctx.camp.firePosition missing' } }; }
      const near = ctx.interactables.list.filter((e) => e && e.position
        && /REST/i.test(e.label || '')
        && Math.hypot(e.position.x - fire.x, e.position.z - fire.z) < 4.5);

      const ev = ctx.events;
      const emitted = [];
      const origEmit = ev.emit.bind(ev);
      ev.emit = (t, p) => { if (t === 'camp-rest') emitted.push(p); return origEmit(t, p); };

      const p = ctx.player;
      const maxHp = (p && p.maxHealth) || 100;
      if (p) p.health = Math.round(maxHp * 0.4);
      if (ctx.environment && ctx.environment.setTime) ctx.environment.setTime(21.5);
      const hourBefore = ctx.environment ? ctx.environment.time : null;
      const hpBefore = p ? p.health : null;

      /* ---- the path a player takes: the entry opens the panel, the panel
             button does the resting ---- */
      let clicked = false, buttonText = null;
      if (near[0] && near[0].onInteract) {
        try { await near[0].onInteract(); } catch (err) { /* panel refused */ }
      }
      await sleep(450);
      const btn = [...document.querySelectorAll('button')].find((b) => {
        const t = (b.textContent || '').toUpperCase();
        return t.indexOf('REST') >= 0 && b.offsetParent !== null;
      });
      if (btn) { buttonText = (btn.textContent || '').trim().slice(0, 32); btn.click(); clicked = true; }
      // the fade owns the wall clock: wait for the event, then a beat longer to
      // catch a SECOND one, which is the failure this gate also has to see
      const sawUi = await waitFor(() => emitted.length > 0, 30000);
      await sleep(900);

      const uiEvents = emitted.length;
      const hourAfter = ctx.environment ? ctx.environment.time : null;
      const hpAfter = p ? p.health : null;

      /* ---- control: the published method must ALSO emit exactly once ---- */
      emitted.length = 0;
      if (p) p.health = Math.round(maxHp * 0.5);
      if (ctx.environment && ctx.environment.setTime) ctx.environment.setTime(22.0);
      try { await ctx.camp.restAtFire(6.2); } catch (err) { /* reported below */ }
      await waitFor(() => emitted.length > 0, 30000);
      await sleep(900);
      const directEvents = emitted.length;
      const directHour = ctx.environment ? ctx.environment.time : null;

      ev.emit = origEmit;
      restoreLS();

      const hourMoved = hourAfter !== null && hourAfter > 4.5 && hourAfter < 8.5
        && Math.abs(hourAfter - hourBefore) > 3;
      const healed = hpAfter === null || hpAfter >= maxHp - 0.01;
      const detail = {
        restEntries: near.length,
        adoptedProgressionEntry: near[0] === (ctx.progression && ctx.progression._campEntry),
        buttonText, clicked,
        hourBefore: hourBefore === null ? null : +hourBefore.toFixed(2),
        hourAfter: hourAfter === null ? null : +hourAfter.toFixed(2),
        hpBefore, hpAfter, maxHp,
        campRestFromUI: uiEvents, sawUiEventBeforeDeadline: sawUi,
        campRestFromRestAtFire: directEvents,
        directHour: directHour === null ? null : +directHour.toFixed(2),
      };
      const pass = near.length === 1 && clicked && uiEvents === 1
        && directEvents === 1 && hourMoved && healed;
      note([
        'A61b camp-rest  ' + (pass ? 'PASS' : 'FAIL'),
        'REST entries at the fire: ' + near.length + '   button: ' + buttonText,
        'hour ' + detail.hourBefore + ' -> ' + detail.hourAfter
          + '   hp ' + hpBefore + ' -> ' + hpAfter + '/' + maxHp,
        'camp-rest from the UI button: ' + uiEvents + '   from restAtFire(): ' + directEvents,
      ]);
      return { pass, detail };
    })()`,
  },

  /* ----------------------------------------------------------------- A61c */
  /**
   * FIX ROUND 1. This lane shipped a second, parallel datapoint system beside
   * the one `focus-items` publishes — 24 pickups labelled DATAPOINT, of which
   * only 12 could ever reach the Notebook. The fix routes this lane's twelve
   * through `ctx.items.datapoints.place()`; this gate holds that line.
   *
   * It proves ONE system owns every DATAPOINT in the world (each pickup is a
   * store record by identity, no local `site:'datapoint'` entry survives, no
   * two pickups share a square metre), that all twelve of this lane's ids are
   * in the store, that the duplicate mote mesh is gone from the frame, and
   * that collecting one of THIS lane's records fills the Notebook and raises
   * both `datapoint-collected` and `datapoint-found`.
   */
  {
    id: 'A61c-datapoints-unified', kind: 'action', lane: 'world-props',
    title: 'Every DATAPOINT in the world belongs to one system and reaches the Notebook',
    settle: 2200, timeout: 60000,
    assert: `(async () => {
      const ctx = __CTX__;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const note = (lines) => {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;'
          + 'background:rgba(0,0,0,.74);color:#ffe3b0;padding:10px 14px;'
          + 'font:13px ui-monospace,monospace;white-space:pre';
        d.textContent = lines.join(String.fromCharCode(10));
        document.body.appendChild(d);
      };
      const store = ctx.items && ctx.items.datapoints;
      const acts = ctx.props && ctx.props.activities;
      if (!store || !acts) {
        return { pass: false, detail: { reason: 'ctx.items.datapoints or ctx.props.activities missing' } };
      }

      const entries = ctx.interactables.list.filter((e) => /DATAPOINT/i.test((e && e.label) || ''));
      // identity, not label: every pickup must BE one of the store's records
      const recSet = new Set(store.list.map((r) => r.id));
      const strays = entries.filter((e) => !(e.datapoint && recSet.has(e.datapoint.id)));
      const localSite = entries.filter((e) => e.site === 'datapoint').length;

      // no two pickups on the same spot (the duplicate system put a second
      // DATAPOINT within a metre of a record at several sites)
      let minPairDist = Infinity;
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = entries[i].position, b = entries[j].position;
          const d = Math.hypot(a.x - b.x, a.z - b.z);
          if (d < minPairDist) minPairDist = d;
        }
      }

      const mineIds = acts.datapoints.map((d) => d.id);
      const missing = mineIds.filter((id) => !store.record(id));
      const motesHidden = !acts.motes || acts.motes.visible === false;

      /* ---- collect one of THIS lane's records and watch the Notebook ---- */
      const pick = mineIds.find((id) => store.record(id) && !store.collected.has(id));
      const ev = ctx.events;
      const seen = [];
      const origEmit = ev.emit.bind(ev);
      ev.emit = (t, p) => { if (t === 'datapoint-collected' || t === 'datapoint-found') seen.push(t); return origEmit(t, p); };
      const before = store.count;
      const entry = entries.find((e) => e.datapoint && e.datapoint.id === pick);
      if (entry && entry.onInteract) { try { await entry.onInteract(); } catch (err) { /* below */ } }
      await sleep(300);
      const after = store.count;
      ev.emit = origEmit;

      const detail = {
        datapointPickups: entries.length, storeRecords: store.total,
        strays: strays.length, localFallbackEntries: localSite,
        minPairDistance: +minPairDist.toFixed(2),
        laneRecordsInStore: mineIds.length - missing.length, missing,
        duplicateMoteMeshHidden: motesHidden,
        collected: pick, notebook: before + ' -> ' + after + '/' + store.total,
        events: seen,
      };
      const pass = entries.length === store.total && strays.length === 0
        && localSite === 0 && missing.length === 0 && motesHidden
        && minPairDist > 1.5
        && after === before + 1
        && seen.indexOf('datapoint-collected') >= 0
        && seen.indexOf('datapoint-found') >= 0;
      note([
        'A61c datapoints  ' + (pass ? 'PASS' : 'FAIL'),
        'DATAPOINT pickups in the world: ' + entries.length
          + '   store records: ' + store.total + '   strays: ' + strays.length,
        'this lane in the store: ' + detail.laneRecordsInStore + '/' + mineIds.length
          + '   duplicate mote mesh hidden: ' + motesHidden,
        'closest two pickups: ' + detail.minPairDistance + ' m',
        'collected ' + pick + '  notebook ' + detail.notebook
          + '  events ' + seen.join(','),
      ]);
      return { pass, detail };
    })()`,
  },
];
