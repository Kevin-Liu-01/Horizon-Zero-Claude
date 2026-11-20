/**
 * C5 (engine lane): WHAT A PEG'S DEATH COSTS, AND WHETHER ITS WRECK RESTS WHERE IT DID. The page half, run by
 *   node tools/frames/film.mjs --port <p> --only F23-peg --no-review --label <l> --probe /tools/perf/corpse-settle-probe-page.mjs
 * after F23-peg is staged and shot (the world frozen). A Peg dies in `takeDamage`, which settles its wreck at once
 * (rig/ground.js `settleCorpseNow`, 37-50 ms of the frame each Peg fell in first-hour leg 1 at 52b0f59). Here Pegs are
 * spawned on flat ground and on a bank near the frame, live 30 frames (calm, blind, standing), and die by one lethal
 * hit, in three modes, each Peg its own:
 *
 *   three   every skinned sample through three's `applyBoneTransform` (the cost before C5: `skinCheck.three`)
 *   fast    the planned skinning (rig/ground.js `skinVertexPlanned`): the cost now
 *   check   the planned skinning, every sample ALSO skinned by three and compared as doubles (`skinCheck.on`):
 *           0 differing samples means the settle saw the same numbers and the wreck rests where it did
 *
 * Per death: the ms `takeDamage` held the main thread, the grounder's settled offset and errors, the body and root
 * positions (each mode's wrecks compared with the `three` wreck of the same spot and seed: Math.random is seeded for
 * the spawn, the 30 frames are stepped by hand with a fixed dt, and the kill).
 * Reads window.__CTX__ only; restores the time freeze, the player, the camera and every machine it made.
 */
export async function probe(frame) {
  if (frame?.id !== 'F23-peg') return { skipped: 'measured on F23-peg only' };
  const THREE = await import('/tools/look/three.mjs');
  const G = await import('/src/entities/machines/rig/ground.js');
  const C = window.__CTX__, E = C.engine, M = C.machines, p = C.player, cam = C.camera, T = C.terrain;
  const out = { t0: performance.now() };
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const hy = (x, z) => T.getHeight(x, z);
  const r4 = (v) => (v == null || !Number.isFinite(v) ? v : Math.round(v * 1e4) / 1e4);
  const P0 = p.position.clone(), cam0 = { pos: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
  const upd0 = p._updateCamera, simT0 = E.simTime;
  p._updateCamera = () => {};
  const slopeAt = (x, z) => Math.hypot(hy(x + 2, z) - hy(x - 2, z), hy(x, z + 2) - hy(x, z - 2)) / 4;
  const find = (want) => {
    for (let i = 0; i < 600; i++) {
      const a = (i * 2.399) % (Math.PI * 2), rr = 40 + (i % 9) * 9;
      const x = P0.x + Math.sin(a) * rr, z = P0.z + Math.cos(a) * rr, h = hy(x, z);
      if (C.water?.levelAt && C.water.levelAt(x, z) > h - 0.3) continue;
      const s = slopeAt(x, z);
      if (want(s)) return { x, z, slope: r4(s) };
    }
    return null;
  };
  const spots = { flat: find((s) => s < 0.04), bank: find((s) => s > 0.3 && s < 0.7) };
  out.spots = spots;
  const disposeM = (m) => { try { if (M.sites?.dispose) M.sites.dispose(m); else throw new Error('no sites'); } catch (e) { const L = M.list, i = L.indexOf(m); if (i >= 0) L.splice(i, 1); try { m.dispose?.(); } catch (e2) { /* */ } m.root?.parent?.remove(m.root); } };
  const placeBrea = (x, z) => { p.position.set(x, hy(x, z), z); p._snapToGround?.(); p.velocity?.set?.(0, 0, 0); };
  const seeded = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const R0 = Math.random;
  const g4 = (m) => {
    const g = m._grounder || m.gait?.grounder;
    const J = g?.shape?.joints || [];
    return { applied: g?.applied, offset: g?.offset, chassis: g?.lastChassisErr, posed: g?.lastPosedErr, box: g?.lastBoxErr,
      bodyY: m.body?.position?.y, x: m.position.x, y: m.position.y, z: m.position.z, replayUntil: g?._replayUntil,
      bends: J.map((j) => [j.target.x, j.target.y, j.target.z, j.target.w]) };
  };
  const one = async (spot, seed, mode) => {
    Math.random = seeded(seed);
    let m, rec;
    try {
      m = M.spawn('peg', spot.x, spot.z, { route: [{ x: spot.x, z: spot.z }], heading: 0.4 });
      m.sightRange = 0.01; m.hearRange = 0.01;
      m.route = [new THREE.Vector3(spot.x, 0, spot.z)]; m._wpIndex = 0;
      if (m.sc) m.sc._waitT = 1e6; else m._waitT = 1e6;
      for (let k = 0; k < 30; k++) { m.suspicion = 0; m._unseenT = 99; m.update(1 / 60, simT0 + k / 60); }
      G.skinCheck.three = mode === 'three';
      G.skinCheck.on = mode === 'check';
      G.skinCheck.n = 0; G.skinCheck.diff = 0;
      const t = performance.now();
      m.takeDamage({ impact: 1e6 });
      const ms = performance.now() - t;
      rec = { mode, seed, ms: Math.round(ms * 100) / 100, dead: !m.alive, checked: G.skinCheck.n, differ: G.skinCheck.diff, wreck: g4(m) };
    } finally {
      G.skinCheck.three = false; G.skinCheck.on = false;
      Math.random = R0;
      if (m) disposeM(m);
    }
    return rec;
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // where a fast death's ms go (inclusive, by method): the shape's skin, bend and pose, the measurement, the death pose
  const Gt = await import('/src/entities/machines/gait.js');
  const parts = {};
  const wrap = (proto, name, key) => {
    const f = proto?.[name]; if (typeof f !== 'function') return () => {};
    const P = (parts[key] = { ms: 0, n: 0 });
    proto[name] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { P.ms += performance.now() - t; P.n++; } };
    return () => { proto[name] = f; };
  };
  const runs = [];
  try {
    E.requestTimeScale('studio', 0);
    for (const [name, spot] of Object.entries(spots)) {
      if (!spot) { runs.push({ spot: name, error: 'no spot' }); continue; }
      placeBrea(spot.x + 30, spot.z + 30);
      // warm: one death in each mode first (the module, the program, the wreck's first clone are not the settle's);
      // the page's FIRST death (fast, on the first spot) is recorded apart: in play it is the first Peg at the cross
      for (const mode of ['fast', 'three']) { const w = await one(spot, 99, mode); (out.warm ||= []).push({ spot: name, mode, ms: w.ms }); }
      for (let k = 0; k < 4; k++) {
        const seed = 1000 + k;
        const a = await one(spot, seed, 'three'); await raf();
        const un = [wrap(G.CorpseShape.prototype, 'skin', 'shape.skin'), wrap(G.CorpseShape.prototype, 'bendChains', 'shape.bendChains'),
          wrap(G.CorpseShape.prototype, 'applyPose', 'shape.applyPose'), wrap(G.CorpseShape.prototype, 'build', 'shape.build'),
          wrap(G.CorpseGrounder.prototype, '_measureShape', 'grounder._measureShape'), wrap(G.CorpseGrounder.prototype, 'update', 'grounder.update'),
          wrap(Gt.GaitController?.prototype, 'deathPose', 'gait.deathPose')];
        const b = await one(spot, seed, 'fast'); await raf();
        for (const u of un) u();
        const c = await one(spot, seed, 'check'); await raf();
        runs.push({ spot: name, seed, threeMs: a.ms, fastMs: b.ms, checkMs: c.ms, dead: a.dead && b.dead && c.dead,
          checked: c.checked, differ: c.differ, restsSame: same(a.wreck, b.wreck) && same(a.wreck, c.wreck),
          wreck: { applied: r4(b.wreck.applied), chassis: r4(b.wreck.chassis), posed: r4(b.wreck.posed), box: r4(b.wreck.box), bends: b.wreck.bends.length },
          threeWreck: same(a.wreck, b.wreck) ? undefined : a.wreck, fastWreck: same(a.wreck, b.wreck) ? undefined : b.wreck });
      }
    }
  } finally {
    Math.random = R0;
    G.skinCheck.three = false; G.skinCheck.on = false;
    E.simTime = Math.max(E.simTime, simT0);
    p.position.copy(P0); p._snapToGround?.(); p.velocity?.set?.(0, 0, 0);
    p._updateCamera = upd0;
    cam.position.copy(cam0.pos); cam.quaternion.copy(cam0.q); cam.fov = cam0.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    await raf();
  }
  const ok = runs.filter((r) => !r.error);
  const med = (k) => { const v = ok.map((r) => r[k]).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
  out.runs = runs;
  out.fastParts = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, { msPerDeath: ok.length ? Math.round(v.ms / ok.length * 100) / 100 : null, callsPerDeath: ok.length ? v.n / ok.length : null }]));
  out.summary = { deaths: ok.length, threeMsMedian: med('threeMs'), fastMsMedian: med('fastMs'), threeMsMax: Math.max(...ok.map((r) => r.threeMs)),
    fastMsMax: Math.max(...ok.map((r) => r.fastMs)), samplesChecked: ok.reduce((s, r) => s + r.checked, 0), samplesDiffer: ok.reduce((s, r) => s + r.differ, 0),
    restsSame: ok.filter((r) => r.restsSame).length };
  out.pass = ok.length > 0 && out.summary.samplesDiffer === 0 && out.summary.restsSame === ok.length && out.summary.samplesChecked > 0;
  out.totalS = Math.round((performance.now() - out.t0) / 10) / 100;
  return out;
}
