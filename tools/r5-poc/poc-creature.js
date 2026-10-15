/**
 * ROUND 5 PIPELINE PROOF — `?poc=creature` (dev only; main.js imports this
 * module only when the flag is present, so the default boot is untouched).
 *
 * Boots the normal game, then: loads the generated Tiller GLB twice (authored
 * weights / autorig capsule weights), registers both kinds, spawns them on a
 * flat stretch of the CURRENT map on a straight patrol, and exposes
 * `window.__R5POC__` for tools/r5-poc/film.mjs to stage shots and measure:
 *   - planted-foot slip and ground error (debugFeet, every rendered frame)
 *   - draw calls / triangles the creature adds (visible vs hidden, same frame)
 *   - mesh / material / bone census
 *   - capsule-vs-authored weight audit
 *   - a spawn -> kill -> dispose memory cycle (renderer.info.memory)
 */
import * as THREE from 'three';
import { Tiller, TillerCapsule, tillerAssetSpec, liftExtras } from './tiller.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function waitFor(fn, ms = 60000) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    try { const v = fn(); if (v) return v; } catch { /* not yet */ }
    await sleep(100);
  }
  throw new Error('r5-poc: timed out waiting');
}

export default async function runCreaturePoc() {
  const ctx = await waitFor(() => window.__READY__ && window.__CTX__);
  await waitFor(() => ctx.machines?.varietyReady, 40000).catch(() => null);
  const game = window.__GAME__;
  const stats = await (await fetch('/tools/r5-poc/out/tiller.stats.json')).json();
  const H = stats.size.y;   // targetHeight = generated height -> scale 1, body space == generator space

  const tLoad = performance.now();
  await ctx.assets.loadExtra({
    'r5-tiller': tillerAssetSpec(H),
    'r5-tiller-capsule': tillerAssetSpec(H),
  }, { onEntry: (e) => liftExtras(e) });
  const loadMs = performance.now() - tLoad;
  ctx.machines.registerKind('r5-tiller', Tiller);
  ctx.machines.registerKind('r5-tiller-capsule', TillerCapsule);

  /* ---------------- pick a flat, open, quiet stretch -------------------- */
  const T = ctx.terrain;
  const P = ctx.player.position;
  let best = null;
  for (let x = -240; x <= 240; x += 12) {
    for (let z = -240; z <= 240; z += 12) {
      if (Math.hypot(x, z) > 270) continue;
      if (Math.hypot(x - P.x, z - P.z) < 70) continue;
      if (T.surfaceAt(x, z) === 'water') continue;
      let near = false;
      for (const m of ctx.machines.list) if (Math.hypot(m.position.x - x, m.position.z - z) < 55) { near = true; break; }
      if (near) continue;
      if ((ctx.props?.keepouts || []).some((k) => Math.hypot(k.x - x, k.z - z) < (k.soft || k.hard || 10) + 12)) continue;
      // 36 m patrol line along +X, plus the camera lane 10 m to the side
      let worst = 0, h0 = T.getHeight(x, z), dh = 0;
      for (let i = -20; i <= 20; i += 4) {
        for (const off of [0, 5, 10]) {
          worst = Math.max(worst, T.slopeFast ? T.slopeFast(x + i, z + off) : 0);
          dh = Math.max(dh, Math.abs(T.getHeight(x + i, z + off) - h0));
        }
      }
      // the film needs the FEET: prefer bare ground, penalise any grass cover
      let grass = 0;
      for (const [ox, oz] of [[0, 0], [-12, 0], [12, 0], [0, 5]]) {
        grass += (ctx.vegetation?.grassDensityAt?.(x + ox, z + oz) ?? 0) + (T.tallGrassDensity?.(x + ox, z + oz) ?? 0);
      }
      const score = worst + dh * 0.05 + grass * 0.5;
      if (!best || score < best.score) best = { x, z, score, slope: worst, dh, grass, surface: T.surfaceAt(x, z) };
    }
  }
  const site = best;
  // nothing else in this stretch: park every other machine's mesh out of sight
  for (const m of ctx.machines.list) {
    if (Math.hypot(m.position.x - site.x, m.position.z - site.z) < 90) m.root.visible = false;
  }

  const route = [new THREE.Vector3(site.x - 18, 0, site.z), new THREE.Vector3(site.x + 18, 0, site.z)];
  const tSpawn = performance.now();
  const m = ctx.machines.spawn('r5-tiller', site.x - 6, site.z, { route, heading: Math.PI / 2 });
  const spawnMs = performance.now() - tSpawn;
  const tSpawn2 = performance.now();
  const cap = ctx.machines.spawn('r5-tiller-capsule', site.x + 30, site.z + 40,
    { route: [new THREE.Vector3(site.x + 30, 0, site.z + 40), new THREE.Vector3(site.x + 31, 0, site.z + 40)] });
  const spawnMs2 = performance.now() - tSpawn2;
  cap.root.visible = false;  // measured, not filmed
  // a calm survey walker: it ignores the (distant) player for the film
  for (const mm of [m, cap]) { mm.sightRange = 0; mm.hearRange = 0; }

  /* ---------------- film staging ----------------------------------------- */
  const p = ctx.player;
  p._updateCamera = () => {};
  if (p.model) p.model.visible = false;
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'none';
  const cam = ctx.camera;
  const rig = { mode: 'side', dist: 7.5, h: 1.5, look: 1.2, side: 1, freeze: false, smooth: new THREE.Vector3() };
  const _fwd = new THREE.Vector3(), _side = new THREE.Vector3(), _tgt = new THREE.Vector3(), _want = new THREE.Vector3();
  const camSystem = {
    update() {
      if (rig.freeze || !m.root) return;
      _fwd.set(Math.sin(m.heading), 0, Math.cos(m.heading));
      _side.set(_fwd.z, 0, -_fwd.x).multiplyScalar(rig.side);
      _tgt.copy(m.position);
      if (rig.mode === 'side') {
        _want.copy(_tgt).addScaledVector(_side, rig.dist).addScaledVector(_fwd, 0.4);
      } else if (rig.mode === '3q') {
        _want.copy(_tgt).addScaledVector(_side, rig.dist * 0.62).addScaledVector(_fwd, rig.dist * 0.78);
      } else if (rig.mode === 'rear3q') {
        _want.copy(_tgt).addScaledVector(_side, rig.dist * 0.7).addScaledVector(_fwd, -rig.dist * 0.7);
      } else if (rig.mode === 'feet') {
        _want.copy(_tgt).addScaledVector(_side, rig.dist).addScaledVector(_fwd, 0.6);
      }
      const gy = T.getHeight(_want.x, _want.z);
      _want.y = Math.max(gy + 0.25, m.position.y + rig.h);
      if (rig.smooth.lengthSq() === 0) rig.smooth.copy(_want); else rig.smooth.lerp(_want, 0.2);
      cam.position.copy(rig.smooth);
      cam.lookAt(_tgt.x, m.position.y + rig.look, _tgt.z);
      cam.fov = rig.fov ?? 40;
      cam.updateProjectionMatrix();
    },
  };
  game.systems.push(camSystem);

  /* ---------------- measurement ------------------------------------------ */
  const census = (mm) => {
    let meshes = 0, skinned = 0, casters = 0, tris = 0, verts = 0;
    const mats = new Set();
    let bones = 0;
    mm.root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      meshes++;
      if (o.isSkinnedMesh) { skinned++; bones = Math.max(bones, o.skeleton?.bones.length || 0); }
      if (o.castShadow) casters++;
      const g = o.geometry;
      verts += g.attributes.position.count;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((mt) => mats.add(mt));
    });
    return { meshes, skinned, casters, materials: mats.size, tris, verts, bones };
  };

  /** For each foot bone, the lowest bind-pose vertex of the DRAWN hull skinned to it (the pad sole). */
  function padProbes() {
    let mesh = null;
    m.root.traverse((o) => {
      if (o.isSkinnedMesh && o.visible && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o;
    });
    if (!mesh) return null;
    const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
    const pos = mesh.geometry.attributes.position;
    const bones = mesh.skeleton.bones;
    const probes = [];
    for (const leg of m.rig.legs) {
      const idx = bones.findIndex((b) => b.name === leg.foot.name);
      let best = -1, by = Infinity;
      for (let i = 0; i < si.count; i++) {
        if (si.getX(i) !== idx || sw.getX(i) < 0.99) continue;
        const y = pos.getY(i);
        if (y < by) { by = y; best = i; }
      }
      probes.push({ id: leg.id, vertex: best });
    }
    return { mesh, probes };
  }

  async function measureFeet(ms = 7000) {
    const pads = padProbes();
    const _pv = new THREE.Vector3();
    const padLast = pads ? pads.probes.map(() => null) : [];
    let padWorstSlip = 0, padSumSlip = 0, padN = 0, padWorstGround = 0, padSumGround = 0, padGN = 0, padMaxLift = 0;
    const feet0 = m.debugFeet();
    const last = feet0.map(() => null);
    let worstSlip = 0, sumSlip = 0, nSlip = 0, worstGround = 0, sumGround = 0, nGround = 0, plants = 0;
    const plantIds = new Set();
    const x0 = m.position.x, z0 = m.position.z;
    let travel = 0, px = x0, pz = z0, frames = 0, planted = 0, footFrames = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      await frame();
      frames++;
      travel += Math.hypot(m.position.x - px, m.position.z - pz);
      px = m.position.x; pz = m.position.z;
      const feet = m.debugFeet();
      for (let i = 0; i < feet.length; i++) {
        const f = feet[i];
        footFrames++;
        if (!f.planted) { last[i] = null; continue; }
        planted++;
        const key = `${i}:${f.plantId}`;
        if (!plantIds.has(key)) { plantIds.add(key); plants++; }
        const g = Math.abs(f.world.y - T.getHeight(f.world.x, f.world.z));
        worstGround = Math.max(worstGround, g); sumGround += g; nGround++;
        const prev = last[i];
        if (prev && prev.plantId === f.plantId) {
          const d = Math.hypot(f.world.x - prev.x, f.world.y - prev.y, f.world.z - prev.z);
          worstSlip = Math.max(worstSlip, d); sumSlip += d; nSlip++;
        }
        last[i] = { x: f.world.x, y: f.world.y, z: f.world.z, plantId: f.plantId };
      }
      // the same test on DRAWN geometry: the skinned pad sole vertex, CPU-skinned
      if (pads) {
        pads.mesh.updateMatrixWorld();
        for (let i = 0; i < pads.probes.length && i < feet.length; i++) {
          const pr = pads.probes[i];
          if (pr.vertex < 0) continue;
          pads.mesh.getVertexPosition(pr.vertex, _pv);
          _pv.applyMatrix4(pads.mesh.matrixWorld);
          const gy = T.getHeight(_pv.x, _pv.z);
          const f = feet[i];
          if (!f.planted) { padMaxLift = Math.max(padMaxLift, _pv.y - gy); padLast[i] = null; continue; }
          const ge = Math.abs(_pv.y - gy);
          padWorstGround = Math.max(padWorstGround, ge); padSumGround += ge; padGN++;
          const prev = padLast[i];
          if (prev && prev.plantId === f.plantId) {
            const d = Math.hypot(_pv.x - prev.x, _pv.y - prev.y, _pv.z - prev.z);
            padWorstSlip = Math.max(padWorstSlip, d); padSumSlip += d; padN++;
          }
          padLast[i] = { x: _pv.x, y: _pv.y, z: _pv.z, plantId: f.plantId };
        }
      }
    }
    const secs = ms / 1000;
    return {
      seconds: secs, frames, fps: +(frames / secs).toFixed(1), travelM: +travel.toFixed(2),
      speedMps: +(travel / secs).toFixed(2), state: m.state,
      plants, plantsPerSec: +(plants / secs).toFixed(2), plantedFraction: +(planted / Math.max(1, footFrames)).toFixed(2),
      slipWorstPerFrameM: +worstSlip.toFixed(4), slipMeanPerFrameM: +(sumSlip / Math.max(1, nSlip)).toFixed(5),
      groundErrWorstM: +worstGround.toFixed(4), groundErrMeanM: +(sumGround / Math.max(1, nGround)).toFixed(4),
      cadenceHz: +(m.gait._cadence ?? 0).toFixed(3), band: [+m.gait.bandLo.toFixed(3), +m.gait.bandHi.toFixed(3)],
      bodyLength: +m.gait.bodyLength.toFixed(2),
      drawnPad: pads ? {
        probes: pads.probes.length,
        slipWorstPerFrameM: +padWorstSlip.toFixed(4), slipMeanPerFrameM: +(padSumSlip / Math.max(1, padN)).toFixed(5),
        groundErrWorstM: +padWorstGround.toFixed(4), groundErrMeanM: +(padSumGround / Math.max(1, padGN)).toFixed(4),
        swingLiftMaxM: +padMaxLift.toFixed(3), samples: padN,
      } : null,
    };
  }

  async function medianInfo(n = 30) {
    const r = ctx.renderer;
    const calls = [], tris = [];
    for (let i = 0; i < n; i++) {
      await frame();
      calls.push(r.info.render.calls);
      tris.push(r.info.render.triangles);
    }
    calls.sort((a, b) => a - b); tris.sort((a, b) => a - b);
    return { calls: calls[n >> 1], tris: tris[n >> 1] };
  }

  async function measureDraws() {
    rig.freeze = true;             // same camera for both halves
    const was = engineTS();
    ctx.engine.requestTimeScale?.('r5-poc', 0);  // same pose for both halves
    await sleep(300);
    const on = await medianInfo();
    m.root.visible = false;
    const off = await medianInfo();
    m.root.visible = true;
    ctx.engine.requestTimeScale?.('r5-poc', null);
    rig.freeze = false;
    return { withCreature: on, without: off, creatureDraws: on.calls - off.calls,
      creatureTris: on.tris - off.tris, cascades: ctx.engine.shadowCascades, timeScaleWas: was };
  }
  function engineTS() { return ctx.engine.timeScale; }

  async function memoryCycle(rounds = 3, per = 4) {
    const r = ctx.renderer;
    const mem = () => ({ geo: r.info.memory.geometries, tex: r.info.memory.textures,
      progs: r.info.programs?.length ?? null,
      objs: (() => { let n = 0; ctx.scene.traverse(() => n++); return n; })(),
      heap: performance.memory?.usedJSHeapSize ?? null });
    await medianInfo(10);
    const before = mem();
    const peaks = [];
    for (let k = 0; k < rounds; k++) {
      const spawned = [];
      for (let i = 0; i < per; i++) {
        const mm = ctx.machines.spawn('r5-tiller', site.x - 20 + i * 8, site.z - 25 - k * 4,
          { route: [new THREE.Vector3(site.x - 20 + i * 8, 0, site.z - 25)] });
        mm.sightRange = 0; mm.hearRange = 0;
        spawned.push(mm);
      }
      await medianInfo(20);
      peaks.push(mem());
      for (const mm of spawned) {
        let mesh = null; mm.root.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
        mm.takeDamage({ point: mm.position.clone(), object: mesh, impact: 99999, tear: 0, element: 'none',
          elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 99999 });
      }
      await sleep(2500);           // death crumple on the wall clock
      for (const mm of spawned) ctx.machines.sites.dispose(mm);
      await medianInfo(10);
    }
    const after = mem();
    return { rounds, perRound: per, before, peaks, after,
      geoGrowth: after.geo - before.geo, texGrowth: after.tex - before.tex, objGrowth: after.objs - before.objs };
  }

  window.__R5POC__ = {
    ctx, site, machine: m, capsule: cap, rig,
    timings: { loadExtraMs: +loadMs.toFixed(1), spawnFirstMs: +spawnMs.toFixed(1), spawnCapsuleMs: +spawnMs2.toFixed(1) },
    census: () => census(m),
    weights: () => ({ authored: m._weightAudit, capsule: cap._weightAudit, seededVerts: m._seeded }),
    measureFeet, measureDraws, memoryCycle,
    async shot(mode, opts = {}) {
      Object.assign(rig, { mode, freeze: false, dist: 7.5, h: 1.5, look: 1.2, side: 1, fov: 40 }, opts);
      rig.smooth.set(0, 0, 0);
      await sleep(opts.settle ?? 900);
      return { pos: m.position.toArray().map((v) => +v.toFixed(2)), state: m.state };
    },
    errors: () => (game.systemErrors || []).map((e) => ({ key: e.key, count: e.count, message: e.message })),
  };
  window.__R5POC_READY__ = true;
  console.log('[r5-poc] creature staged at', site);
}
