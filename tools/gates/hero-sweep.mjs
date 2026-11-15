/**
 * M1.2e / M1.2f / M1.3c / M1.3f (hero-anim) — THE SWEEP'S ROWS, in the page: one row per named clip, every step graded
 * by `hero-sweep/measure.mjs` (the function the Node bench grades with, sent to the page as source). Run them in one
 * Chrome session with `tools/gates/hero-sweep/session.mjs`, or one at a time with the runner's `--extra`:
 *
 *   node tools/gates.mjs --port <p> --extra tools/gates/hero-sweep.mjs --only A-sweep-run
 *
 * Per row (`detail`): `behind` steps with a hand or forearm behind the head (the aim rig's test: behind the skull,
 * over the crown, hands at the nape), `plane` steps with a hand or forearm above its own shoulder AND behind the head's
 * frontal plane (M1.2f's "hand behind the head plane"), `overShoulder` the highest wrist over its shoulder; for the
 * cloth rows `clipFrames` (a tail or panel vertex inside the body's inner radius, the stowed quiver or the draw arm),
 * `clipBy`, `clipDeepest`, `panelHangMin` (the panels' root-to-hem length over bind; M1.2e lets crouch and sit shorten
 * it 15 %); for the run rows `wristMid` (A-run-arms' >= 0.10 m off the torso midline) and `foreCase` (the forearms'
 * clearance of the survey case, m).
 * PASS: 0 behind and 0 plane (arms rows); and 0 clipping frames (cloth rows); and wrists >= 0.10, case > 0 (run rows);
 * the hang row: both wrists in front of the head plane and at or below the head.
 * Staged on open ground through the real input path (keys and mouse bits, `player.dodge`, `player.ride`, melee's own
 * drawLance / holsterLance); the Instruments frozen.
 */
import { placed } from '../gate-places.mjs';
/* (M1.3f fix 1: + the page's mantle, climb and slide, and ten blend-pair rows `A-sweep-blend*`) */
import { buildSweep } from './hero-sweep/measure.mjs';

const HB = `
      const C = __CTX__, p = C.player, an = p.animator, cmb = C.combat, E = C.engine;
      const THREE = { Vector3: p.position.constructor, Quaternion: p.model.quaternion.constructor };
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const simWait = async (sec, capMs = 20000) => { const s0 = E.simTime, w0 = performance.now(); while (E.simTime - s0 < sec && performance.now() - w0 < capMs) await frame(); return E.simTime - s0; };
      for (const m of (C.machines?.list || [])) m.update = () => {};
      const keys = C.input.keys;
      const release = () => { keys.clear(); C.input.mouse.buttons = 0; };
      const buildSweep = ${String(buildSweep)};
      // (M1.3f fix 1: the traversal staging, as A-climb-1m and A-slide stage it)
      const K = C.collision, TR = C.terrain, made = [];
      const ledge = async (rise, dist = 3.5) => {
        const o = PLACE('openGround'), x = o.x, z = o.z + 6, gy = TR.getHeight(x, z);
        made.push(K.register({ kind: 'prop', shape: { type: 'box', c: [x, gy - 0.5 + (rise + 0.5) / 2, z + dist], half: [1.5, (rise + 0.5) / 2, 1.0] } }));
        p.position.set(x, 0, z); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI; p.heading = 0;
        await simWait(0.3, 3000);
      };
      const climbUp = async () => {
        keys.add('KeyW'); let up = false; const w0 = E.simTime;
        while (E.simTime - w0 < 4) { await frame(); if (!p.mantling && !up && p.grounded) { C.input._press?.('Space', { code: 'Space' }); keys.delete('Space'); } if (p.mantling) up = true; if (up && !p.mantling) break; }
        keys.clear(); await simWait(0.5, 3000);
        for (const id of made.splice(0)) K.unregister(id);
        S.mantled = up;
      };
      const slideFace = (deg, tol) => {
        const n = new THREE.Vector3(), sl = (x, z) => { TR.getNormal(x, z, n); return Math.acos(Math.max(-1, Math.min(1, n.y))) * 180 / Math.PI; };
        const pools = C.environment?.water?.pools || [];
        const dry = (x, z) => !pools.some((q) => ((x - q.x) / q.rx) ** 2 + ((z - q.z) / q.rz) ** 2 < 1.5);
        let best = null;
        for (let x = -320; x <= 320; x += 2.5) for (let z = -320; z <= 320; z += 2.5) {
          if (Math.hypot(x, z) > 318) continue;
          const a = sl(x, z); if (Math.abs(a - deg) > tol) continue;
          TR.getNormal(x, z, n); const l = Math.hypot(n.x, n.z); if (l < 1e-3) continue;
          const dx = n.x / l, dz = n.z / l; let lo = 99, hi = 0;
          for (let s = -1.0; s <= 3.0; s += 0.5) { const sd = sl(x + dx * s, z + dz * s); lo = Math.min(lo, sd); hi = Math.max(hi, sd); }
          if (lo < deg - tol || hi > deg + tol || !dry(x, z)) continue;
          const spread = hi - lo + Math.abs(a - deg) * 0.5;
          if (!best || spread < best.spread) best = { x, z, dx, dz, spread };
        }
        return best;
      };`;

/** The clips (page code): each awaits its lead-in with `S.on = false`, then grades with `S.on = true`. */
const CLIPS = {
  stand: { cloth: true, js: `S.on = true; await simWait(2.0);` },
  run: { cloth: true, run: true, js: `keys.add('KeyW'); await simWait(0.8); S.on = true; await simWait(3.0);` },
  sprint: { cloth: true, run: true, js: `keys.add('KeyW'); keys.add('ShiftLeft'); await simWait(1.0); S.on = true; await simWait(3.0);` },
  crouch: { cloth: true, js: `p.setCrouch(true); await simWait(0.6); S.on = true; await simWait(1.5); keys.add('KeyW'); await simWait(1.5); keys.delete('KeyW'); p.setCrouch(false);` },
  roll: { cloth: true, js: `keys.add('KeyW'); await simWait(0.6); S.on = true; p.dodge(); await simWait(1.2);` },
  /* (M1a debt fix round 1, M1.3h "stowed gear clears the ground ... by >= 2 cm when seated": `gear`, the lowest stowed-gear
   *  vertex over the terrain under it on every graded step of the seat; the cistern lip is the real Brazier's and is not
   *  staged here) */
  sit: { cloth: true, gear: true, js: `const q = p.position; const h = p.ride([{ x: q.x, y: q.y + 0.45, z: q.z }, { x: q.x + 0.001, y: q.y + 0.45, z: q.z }], { speed: 0.0001 }); await simWait(0.8); S.on = true; await simWait(2.0); S.on = false; h.cancel();` },
  unstowLance: { js: `S.on = true; cmb.melee.drawLance(30); await simWait(1.3);` },
  stowLance: { js: `cmb.melee.drawLance(30); await simWait(1.4); S.on = true; cmb.melee.holsterLance(); await simWait(1.3);` },
  unstowLanceJog: { js: `keys.add('KeyW'); await simWait(0.8); S.on = true; cmb.melee.drawLance(30); await simWait(1.3);` },
  stowLanceAim: { js: `cmb.melee.drawLance(30); await simWait(1.4); S.on = true; C.input.mouse.buttons |= 4; await simWait(1.2);` },
  unstowBow: { js: `S.on = true; C.input.mouse.buttons |= 4; await simWait(1.2);` },
  stowBow: { js: `C.input.mouse.buttons |= 4; await simWait(1.0); C.input.mouse.buttons &= ~4; S.on = true; const t0 = E.simTime; while (cmb.weaponDrawn && E.simTime - t0 < 8) await frame(); await simWait(1.0);` },
  // M1.3f fix 1: the traversal clips in the page (the bench had them only): a 0.6 m and a 1.0 m ledge (a collision box
  // ahead, as A-climb-1m stages it) mantled from a jog, and a slide down a cinder patch on a 30 deg face (A-slide's
  // search, on this terrain), all graded from the first step of the approach
  // (M1.2e round 2: the mantle on a 1.4 m ledge. player.js _mantle probes for the wall at chest height, 0.9 m over her
  // feet, so the 0.6 m ledge of fix 1 was never mantled in the page (every run since: "the ledge was not mantled");
  // 1.4 m is a mantle (MANTLE_T), above the climb's 0.82-1.22 m band)
  mantle: { cloth: true, js: `await ledge(1.4); S.on = true; await climbUp();` },
  climb: { cloth: true, js: `await ledge(1.0); S.on = true; await climbUp();` },
  slide: { cloth: true, js: `const f = slideFace(30, 3); if (!f) { S.skip = 'no 30 deg face'; return; } const pid = p.surfaces.add({ x: f.x + f.dx * 1.2, z: f.z + f.dz * 1.2, r: 4.5, surface: 'cinder' }); try { p.position.set(f.x - f.dx * 0.8, 0, f.z - f.dz * 0.8); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.atan2(f.dx, f.dz) + Math.PI; await simWait(0.3); S.on = true; keys.add('KeyW'); const t0 = E.simTime; let slid = 0; while (E.simTime - t0 < 3.0) { await frame(); if (p.sliding) slid++; } S.slid = slid; } finally { p.surfaces.remove(pid); }` },
  /* M1.3f fix 1: THE BLEND PAIRS, by name (BUILD M1.3f "every blend pair among them"): each pair is the second clip
   * pressed while the first is under way, graded through both and the hand-over between them (arms only) */
  blendRunRoll: { js: `keys.add('KeyW'); await simWait(0.6); S.on = true; p.dodge(); await simWait(1.2);` },
  blendAimRoll: { js: `C.input.mouse.buttons |= 4; await simWait(0.6); C.input.mouse.buttons |= 1; await simWait(0.5); S.on = true; keys.add('KeyD'); p.dodge(); await simWait(1.0); await simWait(0.6);` },
  blendRollAim: { js: `keys.add('KeyW'); await simWait(0.4); S.on = true; p.dodge(); await simWait(0.35); C.input.mouse.buttons |= 4; await simWait(0.5); C.input.mouse.buttons |= 1; await simWait(0.9);` },
  blendUnstowLanceRoll: { js: `S.on = true; cmb.melee.drawLance(30); await simWait(0.25); p.dodge(); await simWait(1.3);` },
  blendRollUnstowLance: { js: `keys.add('KeyW'); await simWait(0.4); S.on = true; p.dodge(); await simWait(0.4); cmb.melee.drawLance(30); await simWait(1.3);` },
  blendUnstowBowAim: { js: `S.on = true; C.input.mouse.buttons |= 4; await simWait(0.3); C.input.mouse.buttons |= 1; await simWait(1.2);` },
  blendAimStowBow: { js: `C.input.mouse.buttons |= 4; await simWait(0.6); C.input.mouse.buttons |= 1; await simWait(0.8); S.on = true; C.input.mouse.buttons = 0; const t0 = E.simTime; while (cmb.weaponDrawn && E.simTime - t0 < 8) await frame(); await simWait(0.6);` },
  blendLanceToBow: { js: `cmb.melee.drawLance(30); await simWait(1.4); S.on = true; cmb.melee.holsterLance(); await simWait(0.3); C.input.mouse.buttons |= 4; await simWait(1.4);` },
  // (M1a r3 fix: the 1.4 m ledge the mantle row stands, its face 3.6 m ahead: the 0.6 m one of fix 1 is under
  //  player.js's 0.9 m wall probe and was never mantled; the roll's 3.4 m ends at the face and the mantle takes the
  //  buffered Space on the first legal step after it)
  blendRollMantle: { js: `await ledge(1.4, 4.6); S.on = true; keys.add('KeyW'); await simWait(0.15); p.dodge(); await climbUp();` },
  blendSlideRoll: { js: `const f = slideFace(30, 3); if (!f) { S.skip = 'no 30 deg face'; return; } const pid = p.surfaces.add({ x: f.x + f.dx * 1.2, z: f.z + f.dz * 1.2, r: 4.5, surface: 'cinder' }); try { p.position.set(f.x - f.dx * 0.8, 0, f.z - f.dz * 0.8); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.atan2(f.dx, f.dz) + Math.PI; await simWait(0.3); S.on = true; keys.add('KeyW'); const t0 = E.simTime; while (!p.sliding && E.simTime - t0 < 2) await frame(); await simWait(0.5); p.dodge(); await simWait(1.2); } finally { p.surfaces.remove(pid); }` },
  hang: { cloth: true, hang: true, js: `an.setHangPose(true); await simWait(0.5); S.on = true; await simWait(1.0); S.hang = M.hangCheck(); S.bar = an.hangPoseInfo(); S.on = false; an.setHangPose(false);` },
  /* M1a debt: blendUnstowLanceRoll's twin on a pressed-and-held roll from a jog (the page's smooth step mode splits
   * long frames into half steps; the e3d549b behind-head step came on one) */
  blendUnstowLanceRollJog: { js: `keys.add('KeyW'); await simWait(0.6); S.on = true; cmb.melee.drawLance(30); await simWait(0.25); p.dodge(); await simWait(1.3);` },
  /* M1.3h, THE CLIP AUDIT FOR THE SLICE'S OTHER VERBS: the Alidade raise (Sighting's own toggle, the animator's E5
   * overlay): 0 behind and 0 plane steps, and the right wrist in front of the head's frontal plane on every step of
   * the hold (`aliFrontMin`, the raise's weight over 0.9). Sit is the sit row above. */
  alidade: { ali: true, js: `C.sighting?.toggle?.(true); S.on = true; await simWait(2.2); C.sighting?.toggle?.(false); await simWait(0.5);` },
};
/** M1.3h: the slice's verbs with no clip in the tree yet: a row each that SKIPs, by name, until the clip lands. */
const VERB_STUBS = { saltRake: 'the salt rake (both hands on the rake)', kindle: 'kindle at the Brazier', caneCut: 'the cane cut' };

const row = (name) => {
  const c = CLIPS[name];
  return {
    id: `A-sweep-${name}`, kind: 'action', lane: 'hero-anim', timeout: 90000,
    title: `M1.2e/M1.2f/M1.3c/M1.3f sweep, ${name}: 0 steps with a hand or forearm behind the head (skull, crown, nape) and 0 above its shoulder behind the head's frontal plane${c.cloth ? '; 0 frames of tail or panel cloth inside the body, the quiver or the draw arm' : ''}${c.run ? '; wrists >= 0.10 m off the midline, forearms clear of the survey case' : ''}${c.hang ? '; the hang pose: both wrists in front of the head plane, at or below the head' : ''}`,
    setup: `__CTX__.input.enabled = true;`, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}
      if (!an?.update) return { pass: false, detail: 'no animator' };
      release(); p.setCrouch?.(false); standAt(p, 'openGround'); p.velocity?.set(0, 0, 0); await simWait(0.6, 6000);
      p.model.updateMatrixWorld(true);
      const M = buildSweep({ an, model: p.model }, THREE);
      const S = { on: false, hang: null, bar: null, skip: null, mantled: null, slid: null };
      let T0 = null;
      ${c.gear ? `const gearMeshes = []; { const roots = []; p.model.traverse((o) => { if (/stowkit/.test(o.userData?.heroPart || '')) roots.push(o); }); if (cmb.bow?.group) roots.push(cmb.bow.group); if (an.melee?.lance) roots.push(an.melee.lance); for (const r of roots) r.traverse((o) => { if (o.isMesh && o.visible !== false && !gearMeshes.includes(o)) gearMeshes.push(o); }); }
      const gv = new THREE.Vector3();
      const gearClear = () => { let m = 9; for (const o of gearMeshes) { const P = o.geometry?.attributes?.position; if (!P) continue; o.updateWorldMatrix(true, false); const st = Math.max(1, Math.floor(P.count / 400)); for (let i = 0; i < P.count; i += st) { if (o.isSkinnedMesh) o.getVertexPosition(i, gv); else gv.fromBufferAttribute(P, i); gv.applyMatrix4(o.matrixWorld); const h = gv.y - TR.getHeight(gv.x, gv.z); if (h < m) m = h; } } return m; };` : ''}
      M.begin(${JSON.stringify(name)});
      const updC = cmb.update.bind(cmb);
      cmb.update = function (dt, ...rest) {
        const r = updC(dt, ...rest);
        if (S.on && dt > 0) { if (T0 == null) T0 = E.simTime; p.model.updateMatrixWorld(true); M.sample({ T: +(E.simTime - T0).toFixed(3), cloth: ${!!c.cloth}, run: ${!!c.run}, aiming: !!p.aiming });
          ${c.gear ? `S.gearMin = Math.min(S.gearMin ?? 9, gearClear());` : ''}
          ${c.ali ? `if ((an._ali?.w ?? 0) > 0.9) { const h = M.hangCheck(); S.aliN = (S.aliN || 0) + 1; S.aliMin = Math.min(S.aliMin ?? 9, h.r.front); }` : ''} }
        return r;
      };
      try { ${c.js} } finally { S.on = false; cmb.update = updC; release(); p.setCrouch?.(false); for (const id of made.splice(0)) K.unregister(id); if (cmb.melee && cmb.melee.stance !== 'holstered') cmb.melee.holsterLance?.(); }
      await simWait(0.8, 6000);
      const r = M.end();
      if (S.skip) return { pass: null, detail: { verdict: 'SKIP-R18 (place): ' + S.skip, ...r } };
      const fails = [];
      if (S.mantled === false) fails.push('the ledge was not mantled');
      if (S.slid === 0) fails.push('no slide');
      if (r.frames < 20) fails.push('only ' + r.frames + ' steps graded');
      if (r.behind) fails.push(r.behind + ' behind-head steps');
      if (r.plane) fails.push(r.plane + ' steps above the shoulder behind the head plane');
      ${c.cloth ? `if (r.clipFrames) fails.push(r.clipFrames + ' clipping frames');` : ''}
      ${c.run ? `if (r.wristMid == null || r.wristMid < 0.10) fails.push('wrist ' + r.wristMid + ' m off the midline'); if (r.foreCase == null || r.foreCase <= 0) fails.push('forearm ' + r.foreCase + ' m off the survey case');` : ''}
      ${c.ali ? `if (!(S.aliN >= 20)) fails.push('the alidade was raised for only ' + (S.aliN || 0) + ' steps'); else if (!(S.aliMin > 0)) fails.push('the right wrist ' + S.aliMin + ' m behind the head plane during the hold');` : ''}
      ${c.gear ? `if (!(S.gearMin >= 0.02)) fails.push('stowed gear ' + (S.gearMin == null ? 'unmeasured' : S.gearMin.toFixed(3) + ' m') + ' over the ground while seated (bar 0.02)');` : ''}
      ${c.hang ? `const H = S.hang; if (!H || !(H.l.front > 0 && H.r.front > 0 && H.l.belowHeadBoneM >= 0 && H.r.belowHeadBoneM >= 0)) fails.push('hang: ' + JSON.stringify(H));` : ''}
      return { pass: fails.length === 0, detail: { fails, ...r, hang: S.hang, bar: S.bar, aliFrontMin: S.aliMin ?? null, aliSteps: S.aliN ?? null, gearMinAboveGroundM: S.gearMin == null ? null : +S.gearMin.toFixed(4), counts: M.counts, caps: M.caps, wrap: an.clothWrapInfo?.() || null } };
    })()`),
  };
};

/**
 * M1.2e round 2 — THE TRADE WIND IN THE PAGE (`A-sweep-wind`): standing where F02 and F15 stand (Frame Set v2: their
 * bible (E, N), bearing and hour, the trade weather), the tips of the wrap tail and the three sash panels over 3 s in
 * the world's own wind (environment.windAt, read by the animator each step) against 3 s with that wind held at 0
 * (windAt stubbed to still air), 1.5 s to settle before each. Per tip: the bearing its mean moves toward, how far
 * (m), and its sway (the tip's standard deviation, m) in the wind and in still air. The world's downwind bearing
 * is read off the wind the animator was handed.
 * PASS, at both places: every tip streams within 45 deg of SW (225) and within 45 deg of the world's downwind; the
 * left panel's tip moves >= 0.05 m and sways more in the wind than in still air.
 */
const WIND_AT = [
  { id: 'F02', en: [-228, -338], bearing: 258, hour: 18.25 },
  { id: 'F15', en: [-309.9, -271.9], bearing: 315, hour: 13.0 },
];
const windRow = {
  id: 'A-sweep-wind', kind: 'action', lane: 'hero-anim', timeout: 90000,
  title: 'M1.2e wind: at F02 and F15 the wrap tail and the three sash panels stream SW in the trade wind (each tip within 45 deg of 225 and of the world downwind); the left panel moves >= 0.05 m and sways more than in still air; the front panels read as cloth, not pennants (chord lift p95 <= 45 deg, median bend along the chain >= 5 deg)',
  setup: `__CTX__.input.enabled = true;`, settle: 400,
  assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, E = C.engine, env = C.environment;
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const simWait = async (sec, capMs = 20000) => { const s0 = E.simTime, w0 = performance.now(); while (E.simTime - s0 < sec && performance.now() - w0 < capMs) await frame(); return E.simTime - s0; };
      for (const m of (C.machines?.list || [])) m.update = () => {};
      C.input.keys.clear(); C.input.mouse.buttons = 0; p.setCrouch?.(false);
      let SC = 1; try { SC = (await import('/src/world/island/extent.js')).ISLAND_SCALE ?? 1; } catch (e) { /* 1 */ }
      const tips = () => an._chains.filter((c) => /^dyn_(wrapSash|panel[LRB])_01$/.test(c.links[0].name)).map((c) => ({ name: c.links[0].name.replace(/^dyn_|_01$/g, ''), c }));
      const sample = async (sec) => {
        const acc = {}, sq = {}, rt = {}, shp = {}; let n = 0, wx = 0, wz = 0;
        const s0 = E.simTime, w0 = performance.now();
        while (E.simTime - s0 < sec && performance.now() - w0 < 20000) {
          await frame(); n++; wx += an.wind.x; wz += an.wind.z;
          for (const t of tips()) { const k = t.c.N * 3; const q = [t.c.pos[k], t.c.pos[k + 1], t.c.pos[k + 2]]; (acc[t.name] ||= [0, 0, 0]); (sq[t.name] ||= [0, 0, 0]); (rt[t.name] ||= [0, 0, 0]); for (let a = 0; a < 3; a++) { acc[t.name][a] += q[a]; sq[t.name][a] += q[a] * q[a]; rt[t.name][a] += t.c.pos[a]; } }
          for (const t of tips()) { if (!/^panel/.test(t.name)) continue; const s = shapeOf(t.c); const r = (shp[t.name] ||= { lift: [], bend: [] }); r.lift.push(s.lift); r.bend.push(s.bend); }
        }
        const out = {};
        for (const k in acc) { const m = acc[k].map((v) => v / n); out[k] = { m, root: rt[k].map((v) => v / n), sd: Math.sqrt(Math.max(0, sq[k].reduce((s, v, a) => s + v / n - m[a] * m[a], 0))) }; }
        const pct = (a, q) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };
        const shape = {};
        for (const k in shp) shape[k] = { liftP50: +pct(shp[k].lift, 0.5).toFixed(1), liftP95: +pct(shp[k].lift, 0.95).toFixed(1), liftMax: +Math.max(...shp[k].lift).toFixed(1), bendP50: +pct(shp[k].bend, 0.5).toFixed(1) };
        return { tips: out, n, wind: [wx / n, wz / n], shape };
      };
      /* (M1a regressions, M1.2e "a panel reads as cloth, bending along its chain", never a stiff pennant: per step, the
       *  panel's chord from its root to its tip, its lift off the plumb line (deg), and its bend: the lowest segment's lift
       *  less the top segment's (deg; a board lifted whole bends 0)) */
      const shapeOf = (c) => {
        const P = c.pos, N = c.N, ang = (i0, i1) => { const dx = P[i1] - P[i0], dy = P[i1 + 1] - P[i0 + 1], dz = P[i1 + 2] - P[i0 + 2]; return Math.acos(Math.max(-1, Math.min(1, -dy / (Math.hypot(dx, dy, dz) || 1)))) * 180 / Math.PI; };
        return { lift: ang(0, N * 3), bend: ang((N - 1) * 3, N * 3) - ang(0, 3) };
      };
      const brg = (dx, dz) => { let b = Math.atan2(dx, -dz) * 180 / Math.PI; return b < 0 ? b + 360 : b; };
      const off = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
      const places = ${JSON.stringify(WIND_AT)};
      const res = [], fails = [];
      const windAt0 = env.windAt, frozen0 = env.timeFrozen;
      try {
        env.timeFrozen = true;
        for (const P of places) {
          env.setWeather?.('trade', 0); env.setTime?.(P.hour);
          const H = Math.PI - P.bearing * Math.PI / 180;
          p.position.set(P.en[0] * SC, 0, -P.en[1] * SC); p.velocity?.set?.(0, 0, 0); p._snapToGround?.();
          p.heading = H; p.camYaw = -P.bearing * Math.PI / 180;
          env.windAt = windAt0;
          await simWait(1.5);
          const on = await sample(3.0);
          env.windAt = function (x, z, out) { out.x = 0; out.z = 0; return out; };
          await simWait(1.5);
          const still = await sample(3.0);
          env.windAt = windAt0;
          const down = brg(on.wind[0], on.wind[1]), speed = Math.hypot(on.wind[0], on.wind[1]);
          const r = { at: P.id, worldDownwind: +down.toFixed(1), windMs: +speed.toFixed(2), tips: {} };
          for (const k in on.tips) {
            const a = on.tips[k], b = still.tips[k];
            const dx = a.m[0] - b.m[0], dz = a.m[2] - b.m[2], B = brg(dx, dz), mv = Math.hypot(dx, dz);
            /* (M1a r3 fix, recorded only, not graded: how far the chain's ROOT moved between the two windows, and the
             *  tip's bearing off its own root: the idle's weight shift between the windows moves the hip the panels hang
             *  from, which the graded bearing above counts as wind) */
            const rdx = a.root[0] - b.root[0], rdz = a.root[2] - b.root[2];
            const Br = brg(dx - rdx, dz - rdz);
            r.tips[k] = { bearing: +B.toFixed(1), moveM: +mv.toFixed(3), swayWind: +a.sd.toFixed(4), swayStill: +b.sd.toFixed(4), rootMoveM: +Math.hypot(rdx, rdz).toFixed(3), bearingOffRoot: +Br.toFixed(1), moveOffRootM: +Math.hypot(dx - rdx, dz - rdz).toFixed(3) };
            if (off(B, 225) > 45) fails.push(P.id + ' ' + k + ' streams to ' + B.toFixed(0));
            if (off(B, down) > 45) fails.push(P.id + ' ' + k + ' ' + B.toFixed(0) + ' vs downwind ' + down.toFixed(0));
            if (k === 'panelL' && mv < 0.05) fails.push(P.id + ' panelL moves ' + mv.toFixed(3) + ' m');
            if (k === 'panelL' && !(a.sd > b.sd)) fails.push(P.id + ' panelL sways ' + a.sd.toFixed(4) + ' in wind, ' + b.sd.toFixed(4) + ' still');
          }
          if (!r.tips.panelL) fails.push(P.id + ': no panelL chain');
          r.shapeWind = on.shape; r.shapeStill = still.shape;
          for (const k of ['panelL', 'panelR']) {
            const sh = on.shape[k];
            if (!sh) continue;
            if (sh.liftP95 > 45) fails.push(P.id + ' ' + k + ' lifts ' + sh.liftP95 + ' deg off the plumb (p95; bar 45): a pennant');
            if (sh.bendP50 < 5) fails.push(P.id + ' ' + k + ' bends ' + sh.bendP50 + ' deg along its chain (median; bar 5): a board');
          }
          res.push(r);
        }
      } finally { env.windAt = windAt0; env.timeFrozen = frozen0; }
      return { pass: fails.length === 0, detail: { fails, places: res } };
    })()`,
};

const stubRow = (name) => ({
  id: `A-sweep-${name}`, kind: 'action', lane: 'hero-anim', timeout: 10000,
  title: `M1.3h clip audit, ${VERB_STUBS[name]}: 0 steps with a hand or forearm behind the head (a stub: no clip in the tree yet)`,
  assert: `({ pass: null, detail: { verdict: 'SKIP (no clip): ${VERB_STUBS[name]} has no clip in the tree; this row grades it with the sweep when it lands' } })`,
});

/**
 * M1a debt (V13, "the feet point opposite ways in the strafe step"), as a NUMBER: V13's own staging (the gate place,
 * the bow up on RMB, A held 2.4 s, then V13's locked lens at +Z 3.3 m and 0.9 s more), both feet's headings by their
 * lateral axes (`_footHdg`, char space) and the travel's (`_latMove`) on every step from 0.6 s. PASS: the feet within
 * 20 deg of each other on every step with the strafe on (`_latK` > 0.5), and each within 45 deg of the travel.
 */
const strafeFeetRow = {
  id: 'A-sweep-strafeFeet', kind: 'action', lane: 'hero-anim', timeout: 60000,
  title: 'V13 as a number: in the aim side-step both feet point within 20 deg of each other and within 45 deg of the travel on every step',
  setup: `__CTX__.input.enabled = true;`, settle: 400,
  assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, E = C.engine;
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      for (const m of (C.machines?.list || [])) m.update = () => {};
      if (!an?._footHdg) return { pass: null, detail: 'SKIP: no _footHdg' };
      const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
      const deg = (r) => +(r * 180 / Math.PI).toFixed(1);
      C.input.keys.clear(); C.input.mouse.buttons = 0; p.setCrouch?.(false);
      standAt(p, 'openGround'); p.camPitch = 0; p.velocity?.set(0, 0, 0);
      const t0w = performance.now(); while (performance.now() - t0w < 300) await frame();
      C.input.mouse.buttons |= 4; C.input.keys.add('KeyA');
      let frozenAt = null;
      const s0 = E.simTime; let worst = 0, worstAt = null, over = 0, n = 0, trav = 0, lensSet = false; const ucam = p._updateCamera;
      const V3 = p.position.constructor, inv = p.model.matrixWorld.clone(), wa = new V3(), wb = new V3(), wt = new V3();
      const tipOf = (e) => (e?.bone?.children || []).find((o) => o.isBone) || null;
      const toes = [tipOf(an.b.ballL), tipOf(an.b.ballR)];
      let bootWorst = 0, bootAt = null, bootOver = 0, bootN = 0;
      const charOf = (o, out) => out.setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv);
      const bootHdg = (sd) => {
        p.model.updateMatrixWorld(true); inv.copy(p.model.matrixWorld).invert();
        charOf((sd ? an.b.footR : an.b.footL).bone, wa); charOf((sd ? an.b.ballR : an.b.ballL).bone, wb);
        const dx = wb.x - wa.x, dz = wb.z - wa.z, L = wa.distanceTo(wb);
        if (!(L > 1e-4) || Math.hypot(dx, dz) < 0.4 * L) return null;
        return Math.atan2(dx, dz);
      };
      try {
        while (E.simTime - s0 < 3.3) {
          await frame();
          const t = E.simTime - s0;
          if (!lensSet && t >= 2.4) { lensSet = true; p._updateCamera = function () { const cam = this.ctx.camera; cam.position.set(this.position.x, this.position.y + 1.0, this.position.z + 3.3); cam.lookAt(this.position.x, this.position.y + 0.82, this.position.z); }; }
          if (t < 0.6 || !((an._latK ?? 0) > 0.5)) continue;
          const hL = an._footHdg(0), hR = an._footHdg(1), mv = an._latMove ?? 0;
          const d = Math.abs(wrap(hL - hR)); n++;
          if (d > 20 * Math.PI / 180) over++;
          trav = Math.max(trav, Math.abs(wrap(hL - mv)), Math.abs(wrap(hR - mv)));
          /* (M1a debt fix round 1: the film and this row disagreed at 88b1605. The BOOT's own heading too: ankle -> ball,
           *  horizontal, char space, on every step the foot is not near vertical (its horizontal part >= 0.4 of it)) */
          for (const sd of [0, 1]) { const bh = bootHdg(sd); if (bh == null) continue; const o = Math.abs(wrap(bh - mv)); bootN++; if (o > bootWorst) { bootWorst = o; bootAt = { t: +t.toFixed(2), side: sd ? 'R' : 'L', boot: deg(bh), lat: deg(sd ? hR : hL), travel: deg(mv), stance: +((sd ? an.loco?.stanceR : an.loco?.stanceL) ?? 0).toFixed(2) }; } if (o > Math.PI / 4) bootOver++; }
          if (d > worst) { worst = d; worstAt = { t: +t.toFixed(2), hL: deg(hL), hR: deg(hR), travel: deg(mv), stanceL: +(an.loco?.stanceL ?? 0).toFixed(2), stanceR: +(an.loco?.stanceR ?? 0).toFixed(2), heading: deg(p.heading), aiming: !!p.aiming }; }
        }
        /* ...and V13's own frozen frame: the world frozen as V13 freezes it, each foot's ankle -> toe tip and the travel
         * projected through the lens that films it; + = toward screen right (V13: she travels to screen right) */
        E.timeScale = 0; await frame(); await frame();
        const cam = C.camera; cam.updateMatrixWorld(); p.model.updateMatrixWorld(true);
        const scr = (v) => { const q = v.clone().project(cam); return [q.x, q.y]; };
        const fz = {};
        for (const sd of [0, 1]) {
          (sd ? an.b.footR : an.b.footL).bone.getWorldPosition(wa); toes[sd]?.getWorldPosition(wt);
          const A = scr(wa), T2 = scr(wt);
          fz[sd ? 'R' : 'L'] = { toeScreenDx: +(T2[0] - A[0]).toFixed(4), toeScreenDy: +(T2[1] - A[1]).toFixed(4), stance: +((sd ? an.loco?.stanceR : an.loco?.stanceL) ?? 0).toFixed(2), lat: deg(an._footHdg(sd)), boot: (() => { const h = bootHdg(sd); return h == null ? null : deg(h); })() };
        }
        { const mvw = an._latMove ?? 0; wa.copy(p.position); wb.set(Math.sin(mvw + p.heading), 0, Math.cos(mvw + p.heading)).multiplyScalar(0.5).add(p.position); const A = scr(wa), Bq = scr(wb); fz.travelScreenDx = +(Bq[0] - A[0]).toFixed(4); }
        frozenAt = fz;
        E.timeScale = 1;
      } finally { p._updateCamera = ucam; C.input.keys.clear(); C.input.mouse.buttons = 0; if (!(E.timeScale > 0)) E.timeScale = 1; }
      const fails = [];
      if (n < 30) fails.push('only ' + n + ' strafe steps (aiming ' + !!p.aiming + ')');
      if (bootOver) fails.push(bootOver + ' of ' + bootN + ' foot-steps with the boot (ankle -> ball) over 45 deg off the travel (worst ' + deg(bootWorst) + ')');
      if (frozenAt) for (const k of ['L', 'R']) { const f = frozenAt[k]; if (Math.abs(f.toeScreenDx) > 0.004 && Math.sign(f.toeScreenDx) !== Math.sign(frozenAt.travelScreenDx)) fails.push('V13 frame: the ' + k + ' toe points away from the travel on screen'); }
      if (over) fails.push(over + ' of ' + n + ' steps with the feet over 20 deg apart (worst ' + deg(worst) + ')');
      if (trav > Math.PI / 4) fails.push('a foot ' + deg(trav) + ' deg off the travel');
      return { pass: fails.length === 0, detail: { fails, steps: n, worstFeetDeg: deg(worst), over20: over, worstVsTravelDeg: deg(trav), worstAt, bootWorstDeg: deg(bootWorst), bootOver, bootN, bootAt, frozenAt } };
    })()`),
};

export const SWEEP_CLIPS = Object.keys(CLIPS);
export const GATES = [...SWEEP_CLIPS.map(row), ...Object.keys(VERB_STUBS).map(stubRow), strafeFeetRow, windRow];
