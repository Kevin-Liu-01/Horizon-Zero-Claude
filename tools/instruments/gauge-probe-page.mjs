/**
 * BUILD M1.4e — THE GAUGE PROBE, the page half (lane instruments). Run by
 *   node tools/frames/film.mjs --port <p> --only F23-gauge,F26 --probe /tools/instruments/gauge-probe-page.mjs
 * after F23-gauge is staged and screenshotted (the world frozen). It measures, in this order:
 *
 *   heights   the staged Gauge's posed top above its ground (bar 5.5 +- 0.1), its lantern and lamp, Brea's height, its
 *             visible draws, its lamp state
 *   keeper    the world's one keeper Gauge: at Sluice 3, the static stand-in retired (mesh and colliders gone), the
 *             props' readout answering from it, its clock held at the wrong-tide reading
 *   script    the scripted wrong tide (beat 0:05): Brea at 30 m from Sluice 3 opens nothing in 2 s; at 20 m the sluice
 *             opens within 0.5 s, by 'script', at TIDE 0.4 m; the gate is up and the jet runs 1.5 s later; the card line
 *   clock     one full period of its tide clock, fast-forwarded (the keeper stepped at 20 Hz): it shuts the sluice,
 *             walks to the Glass, wades to the Glass's deepest water, reads, walks back, and opens Sluice 3 again by its
 *             clock at its 0.4 m reading; the deepest water under it, its keel's height over the water
 *   wadeMax   a second Gauge walked from the beach toward 1.5 m+ of sea: where it stops, the depth under each foot
 *             (bar: deepest foot 1.2 m +- 0.1, never over 1.25) and its keel over the water
 *   ramp      the mast seen from Saltrow's ramp (F22's lens point, eye 1.7 m): rays to the staff, lantern and finial,
 *             through the terrain (sampled every 0.25 m) and every visible non-instanced mesh; the mast's height in px
 *             in a 1080-px-tall frame at fov 55
 * Reads window.__CTX__ only; restores the keeper (held, at Sluice 3), the player, the camera and the Gauge it made.
 */
export async function probe(frame) {
  if (frame?.id !== 'F23-gauge') return { skipped: 'measured on F23-gauge only' };
  const THREE = await import('/tools/look/three.mjs');
  const C = window.__CTX__, E = C.engine, M = C.machines, p = C.player, cam = C.camera, T = C.terrain;
  const W = C.environment?.water ?? C.water;
  const GK = await import('/src/instruments/kinds/gauge.js');
  const TIPS = await import('/src/ui/tips.js');
  const out = { t0: performance.now() };
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const hy = (x, z) => T.getHeight(x, z);
  const r3 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);
  const guard = async (k, fn) => { const t = performance.now(); try { out[k] = await fn(); } catch (e) { out[k] = { error: String(e?.stack || e).slice(0, 600) }; } (out.seconds ||= {})[k] = r3((performance.now() - t) / 1000); };
  const V3 = THREE.Vector3;
  const P0 = p.position.clone();
  const placeBrea = (x, z) => { p.position.set(x, hy(x, z), z); p._snapToGround?.(); p.velocity?.set?.(0, 0, 0); };
  const step = (m, dt, t) => { m.lowLOD = false; GK.Gauge.prototype.update.call(m, dt, t); };
  const feet = (m) => (m.rig?.legs || []).map((L) => { const w = (L.foot || L.ankle || L.bones?.[2])?.getWorldPosition?.(new V3()); return w ? { x: w.x, z: w.z } : null; }).filter(Boolean);

  /* ---- the staged Gauge ---- */
  const staged = M.list.filter((m) => m.kind === 'gauge' && m.alive && m.root?.visible).sort((a, b) => a.position.distanceTo(p.position) - b.position.distanceTo(p.position));
  const g0 = staged[0];
  await guard('heights', async () => {
    if (!g0) throw new Error('no Gauge staged');
    g0.root.updateMatrixWorld(true);
    const S = g0._S;
    const box = new THREE.Box3();
    let draws = 0;
    g0.root.traverse((o) => {
      if (!o.isMesh || o.userData?.casterProxy || o.isInstancedMesh) return;
      let vis = true; for (let q = o; q; q = q.parent) if (!q.visible) { vis = false; break; }
      if (vis) draws++;
      if (!vis || o.name === 'gauge-jet') return;
      if (o.isSkinnedMesh && o.computeBoundingBox) { o.computeBoundingBox(); if (o.boundingBox) { box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); return; } }
      o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    });
    const g = hy(g0.position.x, g0.position.z);
    const lan = g0.body.localToWorld(new V3(...S.lantern));
    const lampW = g0.lamp?.anchor ? g0.lamp.anchor.getWorldPosition(new V3()) : null;
    let brea = null;
    if (p.model) { const bb = new THREE.Box3().setFromObject(p.model); brea = r3(bb.max.y - hy(p.position.x, p.position.z)); }
    const top = box.max.y - g;
    return { top: r3(top), footprint: { x: r3(box.max.x - box.min.x), z: r3(box.max.z - box.min.z) }, lanternAboveGround: r3(lan.y - g), lampAboveGround: lampW ? r3(lampW.y - g) : null,
      brea, ratio: brea ? r3(top / brea) : null, draws, lampState: M.lamps?.stateOf(g0) ?? null, keeper: !!g0.keeper,
      bar: '5.5 m +- 0.1', pass: Math.abs(top - 5.5) <= 0.1 };
  });

  const K = M._gaugeKeeper;
  const sg = C.props?.gauge;
  await guard('keeper', async () => {
    if (!K) throw new Error('no keeper Gauge in the world');
    const st = K.station;
    const left = sg && sg.body && C.collision?.colliders ? C.collision.colliders.filter((c) => c.ref === sg.body).length : null;
    return { at: { x: r3(K.position.x), z: r3(K.position.z) }, offStationM: r3(Math.hypot(K.position.x - st.x, K.position.z - st.z)), held: K._held, job: K._job,
      reading: r3(K._reading), staticRetired: !!sg && sg._living === K && !sg.root, staticCollidersLeft: left,
      propsReadout: sg?.readout?.()?.text ?? null, keepers: M.list.filter((m) => m.kind === 'gauge' && m.keeper).length,
      pass: !!sg && sg._living === K && !sg.root && left === 0 && K._held && Math.hypot(K.position.x - st.x, K.position.z - st.z) < 1 };
  });
  if (!K) { out.totalS = r3((performance.now() - out.t0) / 1000); return out; }

  const st = K.station;
  const events = [];
  const onEv = (e) => events.push({ ...e, t: r3(tS) });
  let tS = 0;
  C.events?.on?.('gauge-sluice', onEv);
  let tester = null;
  try {
    /* ---- the scripted wrong tide ---- */
    await guard('script', async () => {
      K._resetKeeper();
      const b = 220 * Math.PI / 180, dx = Math.sin(b), dz = -Math.cos(b);
      placeBrea(st.x + dx * 30, st.z + dz * 30);
      tS = 0;
      for (let i = 0; i < 40; i++) { tS += 0.05; step(K, 0.05, tS); }
      const at30 = K.sluiceOpen;
      placeBrea(st.x + dx * 20, st.z + dz * 20);
      const t20 = tS; let openedAfter = null;
      for (let i = 0; i < 10; i++) { tS += 0.05; step(K, 0.05, tS); if (K.sluiceOpen && openedAfter === null) openedAfter = r3(tS - t20); }
      for (let i = 0; i < 30; i++) { tS += 0.05; step(K, 0.05, tS); }
      K.root.updateMatrixWorld(true);
      const ev = events.find((e) => e.open && e.by === 'script');
      const line = TIPS.cardLine(K);
      return { openAt30m: at30, openedAfterS: openedAfter, event: ev || null, gateK: r3(K._gateK), jetOn: !!K._jet?.visible, readout: K.readout().text, cardLine: line,
        bar: 'none at 30 m; opens within 0.5 s at 20 m, by script, at 0.4 m; card GAUGE · SLUICE 3 · TIDE 0.4 m',
        pass: !at30 && openedAfter !== null && openedAfter <= 0.5 && !!ev && ev.tide === 0.4 && line === 'GAUGE · SLUICE 3 · TIDE 0.4 m' && K._gateK >= 0.999 && !!K._jet?.visible };
    });

    /* ---- one period of the clock ---- */
    await guard('clock', async () => {
      if (K._held) throw new Error('the script did not release the clock');
      placeBrea(st.x + 60, st.z + 60);
      const spot = K.wadeSpot();
      const S = K._S;
      const N = Math.ceil((GK.CLOCK.period * 1.02) / 0.05);
      let maxDepth = 0, minKeel = 1e9, minKneeDry = 1e9, wadeArrive = null, nearSpot = 1e9;
      const track = [];
      const w0 = performance.now();
      for (let i = 0; i < N; i++) {
        tS += 0.05; step(K, 0.05, tS);
        const x = K.position.x, z = K.position.z;
        const d = W ? W.depthAt(x, z) : 0;
        if (d > maxDepth) maxDepth = d;
        if (d > 0) {
          const lvl = W.levelAt(x, z);
          minKeel = Math.min(minKeel, K.position.y + S.drumBottom - lvl);
          minKneeDry = Math.min(minKneeDry, K.position.y + Math.min(...S.knees.map((k) => k[1])) - 0.06 - lvl);
        }
        if (spot) { const ds = Math.hypot(x - spot.x, z - spot.z); if (ds < nearSpot) nearSpot = ds; if (K._job === 'wade' && wadeArrive === null) wadeArrive = r3(tS); }
        if (i % 400 === 0) track.push([r3(x), r3(z), K._job, r3(K._reading)]);
      }
      const log = K._log.slice();
      const reopen = log.filter((e) => e.ev === 'open' && e.by === 'clock');
      const back = Math.hypot(K.position.x - st.x, K.position.z - st.z);
      return { simS: r3(N * 0.05), wallS: r3((performance.now() - w0) / 1000), log, wadeSpot: spot ? { x: r3(spot.x), z: r3(spot.z), depth: r3(spot.depth) } : null,
        nearestToSpotM: r3(nearSpot), wadeArriveS: wadeArrive, maxDepthUnderIt: r3(maxDepth), keelOverWaterMin: minKeel < 1e8 ? r3(minKeel) : null, kneeSealsOverWaterMin: minKneeDry < 1e8 ? r3(minKneeDry) : null,
        backAtStationM: r3(back), reopenReading: reopen.length ? reopen[0].reading : null, track,
        bar: 'shuts, walks to the Glass, wades to its deepest water (within 1 m of the spot), dry keel and seals, back at Sluice 3 (< 1.5 m) and opens by its clock at 0.40 +- 0.01',
        pass: log.some((e) => e.ev === 'close') && log.some((e) => e.ev === 'wade') && nearSpot <= 1.0 && minKeel > 0 && minKneeDry > 0 && back < 1.5 && reopen.length >= 1 && Math.abs(reopen[0].reading - 0.4) <= 0.01 };
    });

    /* ---- the wade limit, on the sea ---- */
    await guard('wadeMax', async () => {
      if (!W) throw new Error('no water');
      // the bearing from Sluice 3 that reaches 1.5 m of sea soonest
      let best = null;
      for (let b = 0; b < 360; b += 5) {
        const sx = Math.sin(b * Math.PI / 180), sz = -Math.cos(b * Math.PI / 180);
        let shore = null;
        for (let d = 0; d < 200; d += 0.5) {
          const dd = W.depthAt(st.x + sx * d, st.z + sz * d);
          if (shore === null && dd > 0.02) shore = d;
          if (dd >= 1.6) { if (!best || d < best.d) best = { b, d, shore, sx, sz }; break; }
        }
      }
      if (!best) throw new Error('no sea 1.6 m deep within 200 m');
      const s0 = Math.max(0, best.shore - 12);
      const x0 = st.x + best.sx * s0, z0 = st.z + best.sz * s0;
      tester = M.spawn('gauge', x0, z0, { route: [{ x: x0, z: z0 }], heading: Math.atan2(best.sx, best.sz) });
      if (!tester) throw new Error('no test Gauge');
      tester.update = function () {};
      tester.heading = Math.atan2(best.sx, best.sz); tester.sc.heading = tester.heading;
      tester.goto(st.x + best.sx * (best.d + 25), st.z + best.sz * (best.d + 25), 'idle');
      let t = 0, blockedAt = null;
      for (let i = 0; i < 2400 && blockedAt === null; i++) { t += 0.05; step(tester, 0.05, tS + t); if (tester._wadeStop) blockedAt = r3(t); }
      for (let i = 0; i < 40; i++) { t += 0.05; step(tester, 0.05, tS + t); }
      tester.root.updateMatrixWorld(true);
      const fd = feet(tester).map((f) => r3(W.depthAt(f.x, f.z)));
      const deepest = fd.length ? Math.max(...fd) : null;
      const lvl = W.levelAt(tester.position.x, tester.position.z) ?? 0;
      return { bearing: best.b, shoreM: best.shore, startM: s0, stoppedAfterS: blockedAt, stop: tester._wadeStop, feetDepths: fd, deepestFoot: deepest,
        centreDepth: r3(W.depthAt(tester.position.x, tester.position.z)), keelOverWater: r3(tester.position.y + tester._S.drumBottom - lvl),
        bar: 'stops with its deepest foot at 1.2 m +- 0.1 (never over 1.25); keel dry',
        pass: blockedAt !== null && deepest !== null && Math.abs(deepest - 1.2) <= 0.1 && deepest <= 1.25 && tester.position.y + tester._S.drumBottom - lvl > 0 };
    });

    /* ---- the mast from Saltrow's ramp ---- */
    await guard('ramp', async () => {
      K._resetKeeper();
      K.root.updateMatrixWorld(true);
      const S = K._S;
      const ex = -290, ez = 252, ey = hy(ex, ez) + 1.7;          // F22's lens point (bible E -290, N -252): the ramp has no coordinate yet
      const eye = new V3(ex, ey, ez);
      const pts = { staffFoot: [0, S.mastFoot[1] + 0.2, 0], floatRing: S.floatRest, lantern: S.lantern, finial: [0, S.top[1] - 0.15, 0] };
      const meshes = [];
      C.scene.traverseVisible((o) => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.material?.transparent) return;
        for (let q = o; q; q = q.parent) if (q === K.root || q === g0?.root || q === tester?.root) return;
        if (o.geometry?.attributes?.position?.count > 400000) return;   // the terrain (sampled analytically below)
        meshes.push(o);
      });
      const rc = new THREE.Raycaster();
      const res = {};
      for (const [k, b] of Object.entries(pts)) {
        const w = K.body.localToWorld(new V3(b[0], b[1], b[2]));
        const d = w.clone().sub(eye), L = d.length(); d.normalize();
        let terrain = null;
        for (let s = 0.5; s < L - 0.5; s += 0.25) { const q = eye.clone().addScaledVector(d, s); if (hy(q.x, q.z) > q.y) { terrain = r3(s); break; } }
        rc.set(eye, d); rc.far = L - 0.6; rc.near = 0.3;
        const hit = rc.intersectObjects(meshes, false)[0];
        res[k] = { distM: r3(L), aboveGround: r3(w.y - hy(w.x, w.z)), terrainBlockedAtM: terrain, meshBlockedBy: hit ? `${hit.object.name || hit.object.type} @ ${r3(hit.distance)} m` : null };
      }
      const L = res.lantern.distM;
      const px = (h) => r3((h / L) / (2 * Math.tan((55 / 2) * Math.PI / 180)) * 1080);
      const mastH = S.top[1] - S.mastFoot[1];
      const clear = Object.values(res).filter((r) => r.terrainBlockedAtM === null && r.meshBlockedBy === null).length;
      return { eye: { x: ex, z: ez, y: r3(ey) }, meshesTested: meshes.length, rays: res, mastPx1080: px(mastH), lanternPx1080: px(0.54),
        bar: 'the lantern and finial unblocked from the ramp point; the mast >= 20 px tall in a 1080-px frame at fov 55',
        pass: res.lantern.terrainBlockedAtM === null && !res.lantern.meshBlockedBy && res.finial.terrainBlockedAtM === null && !res.finial.meshBlockedBy && px(mastH) >= 20, clearRays: clear };
    });
  } finally {
    C.events?.off?.('gauge-sluice', onEv);
    out.events = events;
    if (tester) { try { if (M.sites?.dispose) M.sites.dispose(tester); else throw new Error('no sites'); } catch (e) { const L = M.list, i = L.indexOf(tester); if (i >= 0) L.splice(i, 1); try { tester.dispose?.(); } catch (e2) { /* */ } tester.root?.parent?.remove(tester.root); } }
    try { K._resetKeeper(); K.root.updateMatrixWorld(true); } catch (e) { /* */ }
    p.position.copy(P0); p._snapToGround?.(); p.velocity?.set?.(0, 0, 0);
    await raf();
  }
  out.totalS = r3((performance.now() - out.t0) / 1000);
  return out;
}
