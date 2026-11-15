/**
 * BUILD M1.4d — THE PEG PROBE, the page half (lane instruments). Run by
 *   node tools/frames/film.mjs --port <p> --only F23-peg --probe /tools/instruments/peg-probe-page.mjs
 * after F23-peg is staged and screenshotted (the world frozen). It measures, in this order:
 *
 *   heights    the staged Peg's posed body (without the pole) and pole top above its ground, its lamp's height, Brea's
 *   swarm      a swarm of 3 and a swarm of 6 spawned by `peg-swarm.js spawnSwarm` on lines 70-118 m from the frame:
 *              each one swarm, its members on their slots (abreast, 3 m apart); the 3 go at once
 *   lay        the 6 (blind and deaf) walk their lines for up to 25 s and drive pegs: pegs, segments, draws per frame
 *   lane       the lane each member's line cut in the cover mask (the stub mask while the terrain has no cutCover):
 *              at the quarter points of every segment, the cut integrated across the line and its contiguous width
 *              (cut >= half); bar 1.0 m +- 0.2
 *   rule       the TRANSECT RULE, 10 trials at 19.5 m and 10 at 25 m: a Plumb (blind and deaf, so only the line can
 *              raise it) stands that far from a live segment's middle, on a bearing that turns 36 deg a trial; Brea walks
 *              across the segment at 1.5 m/s; seconds from the frame her step crosses the line to the Plumb's lamp
 *              reading wary (bar <= 2 s at 19.5 m in 10/10; not wary in the 2.5 s after the crossing at 25 m in 10/10)
 *   lamp       10 Reed arrows at full draw (the game's ArrowPool and its own integrator) from 12 m at bearings -60..+60 deg
 *              round a fresh Peg's lamp, each at the lamp's centre: weak-point hit, dead, lamp dark (one hit, 10/10);
 *              a control arrow into the canister's flank (alive after); and one swarm member shot through its lamp:
 *              its pegs go dark and a crossing of its line 10 m from a Plumb raises nothing
 * Reads window.__CTX__ only; restores the time freeze, the player, the camera and every machine it made.
 */
export async function probe(frame) {
  if (frame?.id !== 'F23-peg') return { skipped: 'measured on F23-peg only' };
  const THREE = await import('/tools/look/three.mjs');
  const C = window.__CTX__, E = C.engine, M = C.machines, p = C.player, cam = C.camera, T = C.terrain;
  const LS = M.lamps;
  const out = { t0: performance.now() };
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const hy = (x, z) => T.getHeight(x, z);
  const r3 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);
  const guard = async (k, fn) => { const t = performance.now(); try { out[k] = await fn(); } catch (e) { out[k] = { error: String(e?.stack || e).slice(0, 600) }; } (out.seconds ||= {})[k] = r3((performance.now() - t) / 1000); };
  const SW = await import('/src/instruments/kinds/peg-swarm.js');
  const TSm = await import('/src/instruments/kinds/peg-transect.js');

  /* ---- the staged Peg ---- */
  const staged = M.list.filter((m) => m.kind === 'peg' && m.alive).sort((a, b) => a.position.distanceTo(p.position) - b.position.distanceTo(p.position));
  const m0 = staged[0];
  await guard('heights', async () => {
    if (!m0) throw new Error('no Peg staged');
    m0.root.updateMatrixWorld(true);
    const S = m0.ctx.assets.models.peg.r5Sockets;
    const box = new THREE.Box3();
    m0.root.traverse((o) => { if (!o.isMesh || !o.visible || o.userData?.casterProxy || o.isInstancedMesh) return; if (o.isSkinnedMesh && o.computeBoundingBox) { o.computeBoundingBox(); if (o.boundingBox) { box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); return; } } o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); });
    const g = hy(m0.position.x, m0.position.z);
    const lampW = m0.lamp?.anchor ? m0.lamp.anchor.getWorldPosition(new THREE.Vector3()) : null;
    let brea = null;
    if (p.model) { const bb = new THREE.Box3().setFromObject(p.model); brea = r3(bb.max.y - hy(p.position.x, p.position.z)); }
    return { poleTop: r3(box.max.y - g), bodyTopModel: S.bodyTop, lampAboveGround: lampW ? r3(lampW.y - g) : null, brea, lampState: LS?.stateOf(m0) ?? null,
      bar: 'pole to about 1.9 m; body about 0.9 m', pass: Math.abs(box.max.y - g - 1.9) <= 0.12 };
  });

  /* ================= dynamic tests away from the frame ================= */
  const P0 = p.position.clone(), cam0 = { pos: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
  const upd0 = p._updateCamera, simT0 = E.simTime;
  p._updateCamera = () => {};
  const flat = (() => {
    for (let i = 0; i < 400; i++) {
      const a = (i * 2.399) % (Math.PI * 2), rr = 70 + (i % 7) * 8;
      const x = P0.x + Math.sin(a) * rr, z = P0.z + Math.cos(a) * rr, h = hy(x, z);
      let ok = true;
      for (let k = 0; k < 12 && ok; k++) { const b = k / 12 * Math.PI * 2; for (const d of [10, 20, 30]) if (Math.abs(hy(x + Math.sin(b) * d, z + Math.cos(b) * d) - h) > 1.2) ok = false; }
      if (ok && (!C.water?.levelAt || C.water.levelAt(x, z) < h - 0.3)) return { x, z };
    }
    return null;
  })();
  if (!flat) { p._updateCamera = upd0; out.dynamic = { error: 'no flat open spot 70-118 m from the frame' }; return out; }
  out.spot = { x: r3(flat.x), z: r3(flat.z) };
  const made = [];
  const disposeM = (m) => { try { if (M.sites?.dispose) M.sites.dispose(m); else throw new Error('no sites'); } catch (e) { const L = M.list, i = L.indexOf(m); if (i >= 0) L.splice(i, 1); try { m.dispose?.(); } catch (e2) { /* */ } m.root?.parent?.remove(m.root); } };
  const blind = (m) => { m.sightRange = 0.01; m.hearRange = 0.01; };
  const calm = (m) => { m.suspicion = 0; m._unseenT = 99; if (m.state !== 'patrol' && m.alive) m.setState?.('patrol'); };
  const placeBrea = (x, z) => { p.position.set(x, hy(x, z), z); p._snapToGround?.(); p.velocity?.set?.(0, 0, 0); };
  const look = (x, z, h = 9, back = 10) => { cam.position.set(x - back * 0.6, hy(x, z) + h, z - back * 0.8); cam.lookAt(x, hy(x, z) + 0.5, z); cam.fov = 50; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); };
  const still = (m, x, z, heading = 0) => {
    m.route = [new THREE.Vector3(x, 0, z)]; m._wpIndex = 0;
    if (m.sc) m.sc._waitT = 1e6; else m._waitT = 1e6;
    m.position.set(x, hy(x, z), z); m.heading = heading; if (m.sc) m.sc.heading = heading; if (m.root) m.root.rotation.y = heading;
    m.seatFeet?.();
  };
  const simNow = () => E.simTime;

  try {
    E.requestTimeScale('studio', null);
    placeBrea(flat.x + 45, flat.z + 45);
    look(flat.x, flat.z, 14, 18);

    /* ---- swarms ---- */
    const BEAR = 0.35, LEN = 20;
    let six = [];
    await guard('swarm', async () => {
      const three = SW.spawnSwarm(M, flat.x + 30, flat.z - 30, 3, { bearing: BEAR, length: LEN });
      await raf();
      const s3 = new Set(three.map((m) => m.swarm)), slots3 = three.map((m) => m.swarmSlot);
      for (const m of three) disposeM(m);
      six = SW.spawnSwarm(M, flat.x, flat.z, 6, { bearing: BEAR, length: LEN });
      made.push(...six);
      for (const m of six) blind(m);
      await raf();
      const s6 = new Set(six.map((m) => m.swarm));
      // abreast: each member's route offset from the line by its slot x gap
      const L0 = six[0].route, ex = L0[1].x - L0[0].x, ez = L0[1].z - L0[0].z, l = Math.hypot(ex, ez), nx = -ez / l, nz = ex / l;
      const offs = six.map((m) => r3((m.route[0].x - L0[0].x) * nx + (m.route[0].z - L0[0].z) * nz));
      return { three: { n: three.length, swarms: s3.size, slots: slots3 }, six: { n: six.length, swarms: s6.size, slots: six.map((m) => m.swarmSlot), offsetsM: offs },
        doctrineN: (await import('/src/instruments/kinds/peg.js')).default.doctrine.spawn.map((r) => r.n),
        bar: 'swarms of 3-6 form one swarm each, abreast', pass: three.length === 3 && s3.size === 1 && six.length === 6 && s6.size === 1 };
    });

    /* ---- lay ---- */
    const S = TSm.transectsOf(M);
    await guard('lay', async () => {
      // Brea 14 m to the side of the row (the AI runs near her), the lens over the lines
      const nx = -Math.cos(BEAR), nz = Math.sin(BEAR);
      placeBrea(flat.x - nx * 14, flat.z - nz * 14);
      look(flat.x, flat.z, 14, 18);
      const t0 = simNow(), w0 = performance.now();
      while (simNow() - t0 < 25 && performance.now() - w0 < 40000) {
        await wait(250);
        for (const m of six) blind(m);
        if (six.every((m) => (m._drove || 0) >= 6)) break;
      }
      const d0 = S.drawTotal; let f = 0; for (let k = 0; k < 10; k++) { await raf(); f++; }
      const segs = []; for (let i = 0; i < (S.mesh ? S.mesh.count : 0); i++) if (S.used[i] && S.prev[i] >= 0 && six.includes(S.owner[i])) segs.push(i);
      return { simS: r3(simNow() - t0), drove: six.map((m) => m._drove || 0), segments: segs.length, audit: S.audit(), drawsPerFrame: r3((S.drawTotal - d0) / f) };
    });

    /* ---- the lane in the cover mask ---- */
    await guard('lane', async () => {
      const live = typeof T.cutCover === 'function';
      const cov = S.cover;
      if (live) return { mask: 'terrain.cutCover is live: the world mask is not readable here', pass: null };
      if (!cov) throw new Error('no stub cover mask (no segment was cut)');
      const runs = [], ints = [];
      for (let i = 0; i < S.mesh.count; i++) {
        if (!S.used[i] || S.prev[i] < 0 || !six.includes(S.owner[i])) continue;
        const j = S.prev[i], ax = S.px[j], az = S.pz[j], bx = S.px[i], bz = S.pz[i];
        const l = Math.hypot(bx - ax, bz - az); if (l < 0.5) continue;
        const nx = -(bz - az) / l, nz = (bx - ax) / l;
        for (const t of [0.25, 0.5, 0.75]) { const q = cov.laneAt(ax + (bx - ax) * t, az + (bz - az) * t, nx, nz, 1.4); runs.push(q.run); ints.push(q.integral); }
      }
      const st = (a) => { const b = a.slice().sort((x, y) => x - y); return { n: b.length, min: r3(b[0]), median: r3(b[b.length >> 1]), max: r3(b[b.length - 1]) }; };
      const inBar = runs.filter((w) => Math.abs(w - 1.0) <= 0.2).length;
      return { mask: 'stub (src/instruments/lib/cover-stub.js: 64 m tiles of 256 x 256 at 0.25 m on the world grid; no reed cover is built)', run: st(runs), integral: st(ints), inBar, of: runs.length, outsideCuts: cov.outside,
        bar: 'every sampled cross-section 1.0 m +- 0.2', pass: runs.length > 0 && inBar === runs.length };
    });

    /* ---- the transect rule ---- */
    let pl = null;
    await guard('rule', async () => {
      const segs = []; for (let i = 0; i < S.mesh.count; i++) if (S.used[i] && S.prev[i] >= 0 && six.includes(S.owner[i]) && S.owner[i].alive) segs.push(i);
      if (!segs.length) throw new Error('no live segment');
      pl = M.spawn('plumb', flat.x + 40, flat.z, { route: [{ x: flat.x + 40, z: flat.z }], heading: 0 });
      made.push(pl);
      blind(pl);
      const trial = async (k, D) => {
        const i = segs[(k * 3) % segs.length], j = S.prev[i];
        const ax = S.px[j], az = S.pz[j], bx = S.px[i], bz = S.pz[i], l = Math.hypot(bx - ax, bz - az);
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, nx = -(bz - az) / l, nz = (bx - ax) / l;
        const ang = k * (Math.PI * 2 / 10) + 0.2;
        const px = mx + Math.sin(ang) * D, pz = mz + Math.cos(ang) * D;
        still(pl, px, pz, Math.atan2(mx - px, mz - pz) + Math.PI);
        blind(pl);
        const s0 = mx - nx * 1.2, z0 = mz - nz * 1.2;
        placeBrea(s0, z0); look(mx, mz, 8, 12);
        for (let q = 0; q < 12; q++) { calm(pl); placeBrea(s0, z0); await raf(); }
        const c0 = S.crossings, t0 = simNow();
        let tCross = null, tWary = null, side0 = null, crossAt = null;
        while (simNow() - t0 < 1.6 + 2.7) {
          const u = Math.min(1, (simNow() - t0) / 1.6);
          const bxp = s0 + nx * 2.4 * u, bzp = z0 + nz * 2.4 * u;
          placeBrea(bxp, bzp);
          await raf();
          const side = (p.position.x - ax) * nx + (p.position.z - az) * nz;
          if (side0 === null) side0 = Math.sign(side);
          if (tCross === null && Math.sign(side) !== side0 && side0 !== 0) { tCross = simNow(); crossAt = [p.position.x, p.position.z]; }
          if (tWary === null && LS.stateOf(pl) === 'wary') tWary = simNow();
          if (tCross !== null && (tWary !== null ? simNow() - tWary > 0.1 : simNow() - tCross > 2.5)) break;
        }
        const dist = crossAt ? Math.hypot(pl.position.x - crossAt[0], pl.position.z - crossAt[1]) : null;
        return { D, distM: r3(dist), crossed: S.crossings - c0, tWaryS: tWary !== null && tCross !== null ? r3(tWary - tCross) : null, waryBeforeCross: tWary !== null && (tCross === null || tWary < tCross), state: pl.state, lamp: LS.stateOf(pl) };
      };
      const near = [], far = [];
      for (let k = 0; k < 10; k++) near.push(await trial(k, 19.5));
      for (let k = 0; k < 10; k++) far.push(await trial(k, 25));
      const nearPass = near.filter((t) => t.crossed >= 1 && t.tWaryS !== null && t.tWaryS >= 0 && t.tWaryS <= 2 && !t.waryBeforeCross).length;
      const farPass = far.filter((t) => t.crossed >= 1 && t.tWaryS === null).length;
      return { near, far, nearPass, farPass, segments: segs.length,
        bar: 'crossing a live transect within 20 m of a Plumb raises it to wary within 2 s in 10/10 (19.5 m); at 25 m it does not in 10/10 (2.5 s watched)',
        pass: nearPass === 10 && farPass === 10 };
    });

    /* ---- one lamp hit darkens and kills ---- */
    await guard('lamp', async () => {
      const A = C.combat?.arrows;
      if (!A) throw new Error('no ctx.combat.arrows');
      const def = (await import('/src/combat/weapons.js')).AMMO.hunter;
      const speed = def.speed, g = A.gravity, drag = A.drag;
      const ALEN = (await import('/src/combat/arrows.js')).ARROW_LEN, STEP = 1 / 60;
      const solve = (o, t) => {
        const flatD = Math.hypot(t.x - o.x, t.z - o.z), hx = (t.x - o.x) / flatD, hz = (t.z - o.z) / flatD;
        const yAt = (el) => {
          let x = 0, y = o.y, vx = Math.cos(el) * speed, vy = Math.sin(el) * speed;
          const tip = () => { const l = Math.hypot(vx, vy) || 1; return [x + vx / l * ALEN, y + vy / l * ALEN]; };
          let [tx0, ty0] = tip();
          for (let k = 0; k < 600; k++) {
            vy -= g * STEP; const dk = 1 - drag * STEP; vx *= dk; vy *= dk; x += vx * STEP; y += vy * STEP;
            const [tx1, ty1] = tip();
            if (tx1 >= flatD) { const f = (flatD - tx0) / ((tx1 - tx0) || 1e-9); return ty0 + (ty1 - ty0) * f; }
            tx0 = tx1; ty0 = ty1;
          }
          return -1e9;
        };
        let lo = -0.3, hi = 0.5;
        for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (yAt(mid) < t.y) lo = mid; else hi = mid; }
        const el = (lo + hi) / 2;
        return new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
      };
      const lampOf = (m) => (m.lamp?.anchor ? m.lamp.anchor.getWorldPosition(new THREE.Vector3()) : m._lampWp.obj.getWorldPosition(new THREE.Vector3()));
      const shoot = async (m, from, aim) => {
        let rec = null;
        const td0 = m.takeDamage;
        m.takeDamage = function (hit) {
          const lw = m._lampWp?.obj?.getWorldPosition(new THREE.Vector3());
          rec = { point: hit?.point ? [r3(hit.point.x), r3(hit.point.y), r3(hit.point.z)] : null, dLamp: hit?.point && lw ? r3(hit.point.distanceTo(lw)) : null };
          return td0.call(this, hit);
        };
        const o = new THREE.Vector3(from.x, hy(from.x, from.z) + 1.45, from.z);
        const dir = solve(o, aim);
        const hp0 = new Map(M.list.map((x) => [x, x.health]));
        A.fire(o.clone().addScaledVector(dir, -ALEN), dir, speed, 'hunter', 1);
        const t0 = simNow();
        while (simNow() - t0 < 1.0 && !rec) await raf();
        const tHit = simNow();
        let dark = null;
        while (simNow() - tHit < 0.5) { await raf(); if (dark === null && LS.stateOf(m) === 'dark') dark = r3(simNow() - tHit); }
        m.takeDamage = td0;
        // whatever else the arrow struck (fix round 1: at 6358b62 the member's shot hit nothing on the member)
        const struck = M.list.filter((x) => x !== m && hp0.has(x) && x.health < hp0.get(x)).map((x) => ({ kind: x.kind, dFromTarget: r3(x.position.distanceTo(m.position)) }));
        return { ...rec, hit: !!rec, dead: !m.alive, darkAfterS: dark, health: r3(m.health), struck };
      };
      const shots = [];
      const LX = flat.x - 35, LZ = flat.z - 10;
      for (let k = 0; k < 10; k++) {
        const m = M.spawn('peg', LX, LZ, { route: [{ x: LX, z: LZ }], heading: 0 });
        made.push(m); blind(m); still(m, LX, LZ, 0);
        for (let q = 0; q < 20; q++) { calm(m); await raf(); }
        const bear = (-60 + k * (120 / 9)) * Math.PI / 180;
        const la = lampOf(m);
        const from = { x: la.x + Math.sin(bear) * 12, z: la.z + Math.cos(bear) * 12 };
        placeBrea(from.x, from.z); look(LX, LZ, 3, 7);
        const r = await shoot(m, from, la);
        shots.push({ bearingDeg: r3(bear * 180 / Math.PI), ...r });
        disposeM(m); made.splice(made.indexOf(m), 1);
      }
      // the control: one arrow into the canister's flank (not the lamp)
      let control = null;
      {
        const m = M.spawn('peg', LX, LZ, { route: [{ x: LX, z: LZ }], heading: 0 });
        made.push(m); blind(m); still(m, LX, LZ, 0);
        for (let q = 0; q < 20; q++) { calm(m); await raf(); }
        const aim = new THREE.Vector3(m.position.x + 0.0, hy(LX, LZ) + 0.5, m.position.z - 0.1);
        const from = { x: LX + 12, z: LZ - 0.1 };
        placeBrea(from.x, from.z);
        control = await shoot(m, from, aim);
        disposeM(m); made.splice(made.indexOf(m), 1);
      }
      // a swarm member: its pegs go dark and its line raises nobody
      let member = null;
      {
        const live = six.filter((m) => m.alive && S.rings.get(m)?.n >= 2);
        const m = live[0];
        if (m) {
          const ring = S.rings.get(m);
          still(m, m.position.x, m.position.z, m.heading);
          calm(m);
          const la = lampOf(m);
          // fix round 1: at 6358b62 the shot from 12 m straight ahead of the member's heading never reached it (hit:false,
          // health untouched). Each candidate bearing is swept first with the game's own hull query (ctx.hitHulls, the
          // ray the arrow sweep uses) along the solved launch line; what stands in the way of the frontal one is recorded,
          // and the member is shot from the first bearing whose line reaches its lamp first. A blocked line is a
          // staging fact (another swarm member abreast, the Plumb), not a lamp miss.
          const H = C.hitHulls;
          const lineOf = (bear) => {
            const from = { x: la.x + Math.sin(bear) * 12, z: la.z + Math.cos(bear) * 12 };
            const o = new THREE.Vector3(from.x, hy(from.x, from.z) + 1.45, from.z);
            const dir = solve(o, la), dist = o.distanceTo(la);
            let first = null;
            if (H?.raycast) {
              const h = H.raycast({ origin: o, direction: dir }, { far: dist + 0.3, exact: true });
              if (h?.hit) first = { kind: h.machine?.kind ?? null, self: h.machine === m, d: r3(h.distance), dLamp: r3(dist - h.distance) };
            }
            let ground = false;
            for (let s = 0.5; s < dist - 0.3; s += 0.5) { const q = o.clone().addScaledVector(dir, s); if (q.y < hy(q.x, q.z)) { ground = true; break; } }
            return { from, first, ground, clear: !ground && (!first || first.self) };
          };
          const offs = [0, 30, -30, 60, -60, 90, -90, 135, -135, 180];
          const lines = offs.map((o) => ({ off: o, ...lineOf(m.heading + o * Math.PI / 180) }));
          const pick = lines.find((l) => l.clear) || lines[0];
          const from = pick.from;
          placeBrea(from.x, from.z); look(m.position.x, m.position.z, 3, 7);
          const r = await shoot(m, from, la);
          r.bearingOffDeg = pick.off;
          r.frontal = { first: lines[0].first, ground: lines[0].ground, clear: lines[0].clear };
          r.linesClear = lines.filter((l) => l.clear).length;
          let lit = 0, n = 0;
          for (const i of ring.ring) if (i >= 0 && S.used[i]) { n++; if (S.liveAttr.array[i] > 0) lit++; }
          // cross its line 10 m from the Plumb
          let seg = -1; for (const i of ring.ring) if (i >= 0 && S.used[i] && S.prev[i] >= 0) { seg = i; break; }
          let crossTest = null;
          if (seg >= 0 && pl) {
            const j = S.prev[seg], ax = S.px[j], az = S.pz[j], bx = S.px[seg], bz = S.pz[seg], l = Math.hypot(bx - ax, bz - az);
            const mx = (ax + bx) / 2, mz = (az + bz) / 2, nx = -(bz - az) / l, nz = (bx - ax) / l;
            still(pl, mx + nx * 10, mz + nz * 10, 0); blind(pl);
            for (let q = 0; q < 20; q++) { calm(pl); placeBrea(mx - nx * 1.2, mz - nz * 1.2); await raf(); }
            const c0 = S.crossings, t0 = simNow();
            let wary = false;
            while (simNow() - t0 < 3.0) { const u = Math.min(1, (simNow() - t0) / 1.6); placeBrea(mx - nx * 1.2 + nx * 2.4 * u, mz - nz * 1.2 + nz * 2.4 * u); await raf(); if (LS.stateOf(pl) === 'wary') wary = true; }
            crossTest = { crossingsCounted: S.crossings - c0, plumbWary: wary };
          }
          member = { ...r, pegs: n, pegsLit: lit, crossTest };
        }
      }
      const killed = shots.filter((s) => s.hit && s.dead && s.darkAfterS !== null).length;
      return { shots, killed, control, member,
        bar: 'one Reed arrow on the lamp: dead and dark, 10/10; a flank arrow does not kill; a dead Peg\'s line is dark and raises nobody',
        pass: killed === 10 && !!control && !control.dead && !!member && member.dead && member.pegsLit === 0 && member.crossTest && !member.crossTest.plumbWary };
    });
  } finally {
    for (const m of made.slice()) disposeM(m);
    E.requestTimeScale('studio', 0);
    E.simTime = Math.max(E.simTime, simT0);
    p.position.copy(P0); p._snapToGround?.(); p.velocity?.set?.(0, 0, 0);
    p._updateCamera = upd0;
    cam.position.copy(cam0.pos); cam.quaternion.copy(cam0.q); cam.fov = cam0.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    await raf();
  }
  out.totalS = r3((performance.now() - out.t0) / 1000);
  return out;
}
