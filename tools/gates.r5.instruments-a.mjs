/**
 * ROUND 5 — lane `instruments-a` (W1): Tiller, Plumb, Peg. Plan §9 "instruments-a
 * (W1)" + the per-kind block x {tiller, plumb, peg} + the ROUND5-LOOK §7 per-kind
 * additions this lane owns at W1 (I-01, I-03, I-04, I-05, I-07) + the carried
 * instruments-core minors this lane fixed in `src/instruments/lamps.js`.
 *
 *   node tools/gates.mjs --port 5258 --lane instruments-a          the W1 block
 *   node tools/gates.mjs --port 5258 --lane instruments-a-film     the judged frames (V rows)
 *
 * Auto-discovered by tools/gates.config.mjs (LANE_FILE_RE). Staging names only
 * this lane's own kinds (plan §9: "a lane may name its own kind") or roles
 * (`ctx.machines.roles`) for other lanes' Instruments; no coordinate, no bone
 * literal (bones through `machine.rig`).
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kindBlock, KIND_PRELUDE, PIX } from './gates.r5.kind-block.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANE = 'instruments-a';
const FILM = 'instruments-a-film';

/** `gait.js` lines changed against main (A-plumb-topple: "0 gait.js lines changed"); read-only git, at load. */
const GAIT_DIFF = (() => {
  try {
    const out = execSync('git diff --numstat main -- src/entities/machines/gait.js', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!out) return 0;
    const [a, d] = out.split(/\s+/);
    return (+a || 0) + (+d || 0);
  } catch (e) { return -1; }
})();

/* ------------------------------------------------------------------ */
/* shared page prelude (after KIND_PRELUDE)                            */
/* ------------------------------------------------------------------ */
const IA = `
  const p = __C.player, T = __C.terrain, E = __C.engine, cam = __C.camera, env = __C.environment, ev = __C.events;
  const LS = __M.lamps;
  const hy = (x, z) => T.getHeight(x, z);
  const heal = () => { p.health = p.maxHealth; };
  function standAt(x, z, fx, fz) {
    p.position.set(x, hy(x, z), z); p._snapToGround?.();
    if (p.velocity?.set) p.velocity.set(0, 0, 0);
    if (fx !== undefined) p.camYaw = Math.atan2(fx - x, fz - z) + Math.PI;
  }
  function lineClear(ax, ay, az, bx, by, bz) {
    for (let k = 1; k < 40; k++) { const t = k / 40, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t; if (hy(x, z) > y - 0.25) return false; }
    return true;
  }
  /** A heading from m along which a point d metres out is open ground in clear sight of eye height ey. */
  function clearHeading(m, d, ey) {
    for (let i = 0; i < 24; i++) {
      const h = i * Math.PI / 12, x = m.position.x + Math.sin(h) * d, z = m.position.z + Math.cos(h) * d;
      if (Math.abs(hy(x, z) - m.position.y) > 1.2) continue;
      if (lineClear(m.position.x, m.position.y + ey, m.position.z, x, hy(x, z) + 1.5, z)) return h;
    }
    return null;
  }
  function poseCam(px, py, pz, tx, ty, tz, fov) {
    p._updateCamera = () => {};
    cam.position.set(px, py, pz); cam.lookAt(tx, ty, tz);
    if (fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }
  const frames = (n) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  function hullOfM(m) { let h = null; m.root.traverse(o => { if (!h && o.isMesh && o.material?.userData?.instrumentHull && !o.userData.casterProxy && !o.userData.instrumentTool && !(o.parent && o.parent.name?.startsWith('part-'))) h = o; }); return h; }
  function quiet() { for (const o of __M.list) if (o.alive && o.kind !== undefined) { o.suspicion = 0; } }
`;

/* ------------------------------------------------------------------ */
/* A-plumb-scale                                                       */
/* ------------------------------------------------------------------ */
const plumbRows = kindBlock({ kind: 'plumb', lane: 'probe', class: 'small' });
const vend = (base) => plumbRows.find((r) => r.id === `${base}:plumb`).assert;
function scaled(assert, S, hidden) {
  const a = assert
    .replace('x.alive && !x._disposed && x.kind === KIND)', `x.alive && !x._disposed && x.kind === KIND && x._scale === ${S} && !!x._hullHidden === ${hidden})`)
    .replace('M.spawn(KIND, p.x + 30, p.z + 30)', `M.spawn(KIND, p.x + 30, p.z + 30, { scale: ${S}, hullHidden: ${hidden} })`);
  if (a === assert || !a.includes(`scale: ${S}`) || !a.includes(`x._scale === ${S}`)) throw new Error('A-plumb-scale: the vendored KB_PRELUDE staging changed; re-point scaled()');
  return a;
}
const A_PLUMB_SCALE = `(async () => {
  const R = {};
  ${[3, 6.5].map((S) => `
  R['s${S}'] = {
    A45c: await ${scaled(vend('A45c-foot-continuity'), S, true)},
    A46: await ${scaled(vend('A46-ground-truth'), S, true)},
    A48: await ${scaled(vend('A48-cadence'), S, false)},
  };`).join('\n')}
  const live = __CTX__.machines.list.filter(m => m.kind === 'plumb' && m._scale !== 1 && m.alive).map(m => ({ scale: m._scale, height: +m.height.toFixed(2), hullHidden: !!m._hullHidden }));
  const rows = Object.values(R).flatMap(r => Object.values(r));
  const pass = rows.every(r => r && r.pass === true);
  return { pass, detail: { bar: 'scale 3 and 6.5, hull hidden: A45c <= 0.12 m/frame, A46 <= 0.08 m, A48 in band (the vendored rows, staged at scale)', scaledLive: live, ...R } };
})()`;

/* ------------------------------------------------------------------ */
/* A-plumb-topple                                                      */
/* ------------------------------------------------------------------ */
const A_PLUMB_TOPPLE = `(async () => {
  ${KIND_PRELUDE({ kind: 'plumb' })}
  if (!KIND) return skipNoKind();
  ${IA}
  const spot = flatSpot(25, 70);
  const m = stageKind(spot.x, spot.z);
  await wait(1600);
  if (!m) return { pass: null, detail: 'SKIP: could not stage a Plumb' };
  park(m, 0);
  standAt(m.position.x + 40, m.position.z - 40, m.position.x, m.position.z);
  await simSleep(1.0, heal);
  const hull = hullOfM(m), V3 = p.position.constructor;
  const vialAt = () => { m._vialWp.obj.updateWorldMatrix(true, false); return m._vialWp.obj.getWorldPosition(new V3()); };
  const hit = () => m.takeDamage({ point: vialAt(), object: hull, impact: 3, tear: 0, element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: -1 }, type: 'arrow' });
  const tilt = () => 2 * Math.acos(Math.min(1, Math.abs(m.body.quaternion.w)));
  hit();
  await simSleep(0.35, heal);
  const afterOne = { toppling: m._toppleT >= 0, hits: m._vialHits };
  const s0 = simNow();
  hit();
  let tFall = null, tUp = null, downEnd = null, maxTilt = 0, ground = null;
  const lay = m._toppleAng;
  while (simNow() - s0 < 6.0) {
    await new Promise(r => requestAnimationFrame(r));
    heal();
    const t = simNow() - s0, a = tilt();
    if (a > maxTilt) maxTilt = a;
    if (tFall === null && a >= 0.9 * lay) tFall = t;
    if (downEnd === null && tFall !== null && m.state !== 'downed') downEnd = t;
    if (tUp === null && downEnd !== null && a < 0.03) tUp = t;
    if (ground === null && t >= 2.5) {
      // grounded while down (A47 bar): the posed hull, CPU-skinned, against the terrain under each vertex
      const v = new V3(); let minGap = 1e9, pen = 0, n = 0;
      const pos = hull.geometry.attributes.position;
      hull.updateMatrixWorld(true); hull.skeleton?.update();
      for (let i = 0; i < pos.count; i += 3) {
        hull.getVertexPosition(i, v); hull.localToWorld(v);
        const g = v.y - hy(v.x, v.z);
        if (g < minGap) minGap = g;
        if (-g > pen) pen = -g;
        n++;
      }
      ground = { minGapM: +minGap.toFixed(3), penetrationM: +pen.toFixed(3), samples: n };
    }
  }
  await simSleep(1.0, heal);
  const standing = { alive: m.alive, state: m.state, tilt: +tilt().toFixed(3), bodyY: +m.body.position.y.toFixed(3) };
  const downS = downEnd;
  const checks = {
    firstHitNoTopple: !afterOne.toppling,
    fallWithin05: tFall !== null && tFall <= 0.5,
    down4s: downS !== null && Math.abs(downS - 4.0) <= 0.3,
    grounded: !!ground && ground.penetrationM <= 0.10 && ground.minGapM <= 0.10,
    standsBackUp: tUp !== null && standing.alive && standing.state !== 'downed' && standing.tilt < 0.03,
    gaitUnchanged: ${GAIT_DIFF} === 0,
  };
  __M.sites.dispose(m);
  return { pass: Object.values(checks).every(Boolean), detail: { checks, afterOne, layRad: +lay.toFixed(3), maxTiltRad: +maxTilt.toFixed(3), tFallS: tFall && +tFall.toFixed(3), downS: downS && +downS.toFixed(3), upS: tUp && +tUp.toFixed(3), ground, standing, gaitLinesChangedVsMain: ${GAIT_DIFF},
    bar: 'two level-vial hits -> topple within 0.5 s, down 4 +-0.3 s, grounded (penetration <= 0.10 m, lowest point <= 0.10 m) while down, stands back up; 0 gait.js lines changed' } };
})()`;

/* ------------------------------------------------------------------ */
/* A-flagged                                                           */
/* ------------------------------------------------------------------ */
const A_FLAGGED = `(async () => {
  ${KIND_PRELUDE({ role: 'sentry' })}
  if (!KIND) return skipNoKind();
  ${IA}
  const H = __M.perception;
  const spot = flatSpot(30, 80);
  const sentry = stageKind(spot.x, spot.z);
  await wait(1200);
  if (!sentry) return { pass: null, detail: 'SKIP: could not stage the sentry' };
  park(sentry);
  const fh = clearHeading(sentry, 14, 2.9);
  if (fh === null) return { pass: null, detail: 'SKIP: no clear sightline from the sentry' };
  const herX = sentry.position.x + Math.sin(fh) * 14, herZ = sentry.position.z + Math.cos(fh) * 14;
  // recipients: other live Instrument kinds 25-50 m BEHIND the sentry (facing away from her); a control at 80 m
  const roles = ['herd', 'swarm', 'herd'].map(r => __M.roles[r]).filter(Boolean);
  const back = fh + Math.PI;
  const rec = roles.map((k, i) => __M.spawn(k, sentry.position.x + Math.sin(back + (i - 1) * 0.5) * (26 + i * 9), sentry.position.z + Math.cos(back + (i - 1) * 0.5) * (26 + i * 9)));
  const ctl = __M.spawn(roles[0], sentry.position.x + Math.sin(back) * 80, sentry.position.z + Math.cos(back) * 80);
  await wait(1500);
  const set = [...rec, ctl].filter(Boolean);
  for (const o of set) park(o, Math.atan2(o.position.x - herX, o.position.z - herZ));
  let sentryNow = sentry;
  const run = async (dur, fresh) => {
    if (fresh) { const sx = sentryNow.position.x, sz = sentryNow.position.z; __M.sites.dispose(sentryNow); sentryNow = stageKind(sx, sz); await wait(1200); park(sentryNow, fh); }
    const sentry = sentryNow;
    for (const o of [sentry, ...set]) { park(o, o === sentry ? fh : Math.atan2(o.position.x - herX, o.position.z - herZ)); o.flagMark = null; }
    sentry.lampDarkT = 0;
    if (dur !== null) H.flagDuration = dur;
    const r = { raised: null, ended: null, entered: [], ctl: null };
    const onF = () => { r.raised = H.clock; };
    const onE = () => { r.ended = H.clock; };
    ev.on('flagged', onF); ev.on('flag-ended', onE);
    standAt(herX, herZ, sentry.position.x, sentry.position.z);
    const w0 = performance.now();
    while (r.raised === null && performance.now() - w0 < 20000) { await wait(30); heal(); }
    const t0 = H.clock;
    // she leaves at once (a mark, not a sightline): far behind cover
    standAt(sentry.position.x + Math.sin(fh) * 120, sentry.position.z + Math.cos(fh) * 120);
    const seen = rec.map(() => null);
    while (H.clock - t0 < 1.2) {
      await new Promise(rr => requestAnimationFrame(rr)); heal();
      rec.forEach((o, i) => { if (o && seen[i] === null && (o.state === 'search' || o.state === 'alert' || o.state === 'attack') && o.flagMark === H.flag) seen[i] = +(H.clock - t0).toFixed(3); });
    }
    r.entered = seen;
    r.ctl = ctl ? { state: ctl.state, marked: ctl.flagMark === H.flag, distM: +Math.hypot(ctl.position.x - sentry.position.x, ctl.position.z - sentry.position.z).toFixed(1) } : null;
    const w1 = performance.now();
    while (r.ended === null && performance.now() - w1 < 30000) { await wait(40); heal(); }
    ev.off?.('flagged', onF); ev.off?.('flag-ended', onE);
    H.flagDuration = 8;
    return { lastedS: r.raised !== null && r.ended !== null ? +(r.ended - r.raised).toFixed(3) : null, enteredSearchS: r.entered, control: r.ctl, raised: r.raised !== null };
  };
  const base = await run(null);
  await wait(800);
  const whites = await run(3, true);
  for (const o of [sentryNow, ...set]) __M.sites.dispose(o);
  const within = (x) => x.enteredSearchS.length > 0 && x.enteredSearchS.every(s => s !== null && s <= 1.0);
  const checks = {
    raisedBySight: base.raised && whites.raised,
    recipientsSearchWithin1s: within(base) && within(whites),
    controlUntouched: !base.control || (!base.control.marked && base.control.state !== 'search'),
    lasts8s: base.lastedS !== null && Math.abs(base.lastedS - 8) <= 0.1,
    lasts3sGuildWhites: whites.lastedS !== null && Math.abs(whites.lastedS - 3) <= 0.1,
  };
  return { pass: Object.values(checks).every(Boolean), detail: { checks, sentryKind: KIND, recipients: roles, base, guildWhites: whites,
    bar: 'a sentry sees Brea -> every Instrument within 60 m enters search toward the flag <= 1 s; the mark lasts 8 s (3 s with perception.flagDuration = 3, Guild Whites)' } };
})()`;

/* ------------------------------------------------------------------ */
/* A-transect                                                          */
/* ------------------------------------------------------------------ */
const A_TRANSECT = `(async () => {
  ${KIND_PRELUDE({ kind: 'peg' })}
  if (!KIND) return skipNoKind();
  ${IA}
  const R = E.renderer;
  const TS = await import('/src/instruments/kinds/peg-transect.js');
  // a clean slate: the world's own Pegs leave (their pegs with them)
  for (const o of __M.list.slice()) if (o.kind === 'peg') __M.sites.dispose(o);
  await frames(4);
  const meshBefore = !!(__M.transects && __M.transects.mesh);
  const spot = flatSpot(30, 80);
  const V3 = p.position.constructor;
  // a swarm of two on a straight 30 m line (bible: "hammer transect pegs in straight lines")
  const pegs = [];
  for (let i = 0; i < 2; i++) {
    const a = new V3(spot.x - 15, 0, spot.z + i * 3), b = new V3(spot.x + 15, 0, spot.z + i * 3);
    const m = stageKind(a.x, a.z, { route: [a, b] });
    if (m) { m._trav = -1e9; pegs.push(m); }
  }
  // the Plumbs the crossing must raise (near) and must not (far): blind and deaf for the test, so only the line can raise them
  const near = __M.spawn('plumb', spot.x + 6, spot.z + 14), far = __M.spawn('plumb', spot.x - 40, spot.z + 12);
  for (const o of [near, far]) if (o) { o.sightRange = 0.01; o.hearRange = 0.01; }
  standAt(spot.x, spot.z - 45, spot.x, spot.z);
  await wait(1800); await frames(6);
  const geo0 = R.info.memory.geometries;
  for (const m of pegs) m._trav = 0;
  const w0 = performance.now();
  while (performance.now() - w0 < 26000) { await wait(200); heal(); const S = __M.transects; if (S && S.live >= 8) break; }
  const S = __M.transects;
  if (!S || !S.mesh) return { pass: false, detail: { why: 'no transect was laid', pegs: pegs.map(m => ({ state: m.state, drove: m._drove })) } };
  await frames(3);
  // (1) one instanced draw for every peg
  const before = S.audit();
  const objs = []; __CTX__.scene.traverse(o => { if (o.name === 'peg-transects') objs.push(o); });
  const d0 = S.drawTotal, f0 = E.frames; await frames(10);
  const drawsPerFrame = (S.drawTotal - d0) / Math.max(1, E.frames - f0);
  // (2) a crossing within 20 m of a Plumb raises it to wary <= 1 s (and a Plumb 35 m out stays calm)
  let segI = -1;
  for (let i = 0; i < S.mesh.count; i++) if (S.used[i] && S.prev[i] >= 0) { segI = i; break; }
  if (segI < 0) return { pass: false, detail: { why: 'no segment yet', before } };
  const j = S.prev[segI];
  const mx = (S.px[segI] + S.px[j]) / 2, mz = (S.pz[segI] + S.pz[j]) / 2;
  const nx = -(S.pz[segI] - S.pz[j]), nz = S.px[segI] - S.px[j], nl = Math.hypot(nx, nz) || 1;
  // place them now relative to the segment: near 12 m from the crossing, far 35 m
  if (near) { near.position.set(mx + 9, hy(mx + 9, mz + 8), mz + 8); }
  if (far) { far.position.set(mx - 35, hy(mx - 35, mz + 2), mz + 2); }
  for (const o of [near, far]) if (o) park(o, Math.atan2(mx - o.position.x, mz - o.position.z) + Math.PI);
  await frames(4);
  for (const o of pegs) park(o);
  standAt(mx + nx / nl * 2.0, mz + nz / nl * 2.0);
  await frames(3);
  const c0 = S.crossings, t0 = simNow();
  // her steps across the line (3 frames of 1.3 m)
  for (let k = 1; k <= 3; k++) { standAt(mx + nx / nl * (2.0 - 1.3 * k), mz + nz / nl * (2.0 - 1.3 * k)); await frames(1); }
  let tWary = null;
  while (simNow() - t0 < 2.0) {
    await new Promise(r => requestAnimationFrame(r)); heal();
    if (tWary === null && near && LS.stateOf(near) === 'wary') tWary = +(simNow() - t0).toFixed(3);
  }
  const crossed = S.crossings - c0;
  const farState = far ? LS.stateOf(far) : null;
  // (3) the site dispose takes the pegs: the geometry count returns to its baseline
  for (const o of pegs) __M.sites.dispose(o);
  for (const o of [near, far]) if (o) __M.sites.dispose(o);
  await frames(6);
  const geo1 = R.info.memory.geometries;
  const objsAfter = []; __CTX__.scene.traverse(o => { if (o.name === 'peg-transects') objsAfter.push(o); });
  const checks = {
    laidAndLive: before.live >= 4,
    oneInstancedDraw: objs.length === 1 && objs[0].isInstancedMesh && drawsPerFrame === 1,
    crossingRaisesNearPlumbWithin1s: crossed >= 1 && tWary !== null && tWary <= 1.0,
    farPlumbStaysCalm: farState === 'calm',
    disposeRemovesPegs: objsAfter.length === 0 && (!__M.transects || __M.transects.live === 0),
    geometriesBaseline: geo1 <= geo0,
  };
  return { pass: Object.values(checks).every(Boolean), detail: { checks, transect: before, drawsPerFrame, crossed, nearDistM: near ? +Math.hypot(near.position.x - mx, near.position.z - mz).toFixed(1) : null, tWaryS: tWary, farState, geometries: { before: geo0, after: geo1 }, meshBefore, cutCoverContract: typeof T.cutCover === 'function' ? 'live' : 'PENDING world-ground (ctx.terrain.cutCover)',
    bar: 'pegs are 1 instanced draw; crossing within 20 m of a Plumb raises it to wary <= 1 s; site dispose removes the pegs (geometries baseline)' } };
})()`;

/* ------------------------------------------------------------------ */
/* A-herd-ripple                                                       */
/* ------------------------------------------------------------------ */
const A_HERD_RIPPLE = `(async () => {
  ${KIND_PRELUDE({ role: 'herd' })}
  if (!KIND) return skipNoKind();
  ${IA}
  const V3 = p.position.constructor;
  const spot = flatSpot(40, 90);
  // a herd of three on one bearing (the doctrine's herd object, registered with the squads)
  const herd = { center: new V3(spot.x, 0, spot.z), vector: new V3(0, 0, 1), alarmed: false, rearguard: null, members: [] };
  __M.squads.registerHerd(herd);
  const hd = Math.atan2(1, 0.2);
  const dir = new V3(Math.sin(hd), 0, Math.cos(hd));
  const A = new V3(spot.x - dir.x * 30, 0, spot.z - dir.z * 30), B = new V3(spot.x + dir.x * 30, 0, spot.z + dir.z * 30);
  const ms = [];
  for (let i = 0; i < 3; i++) {
    const m = __M.spawn(KIND, A.x - dir.x * i * 5.2, A.z - dir.z * i * 5.2, { herd, route: [B, A], heading: hd });
    if (!m) continue;
    __M.squads.join(m, herd, 'herd');
    ms.push(m);
  }
  if (ms.length < 3) return { pass: null, detail: 'SKIP: could not stage a herd of three' };
  standAt(spot.x - dir.z * 70, spot.z + dir.x * 70, spot.x, spot.z);
  // calm: the herd walks its bearing in file for 12 s
  await simSleep(12, heal);
  const f = herd.file;
  const lead = f && f.leader;
  // the chime: a sentry 14 m behind the tail goes alert
  const tail = ms[ms.length - 1];
  const sentryKind = __M.roles.sentry;
  const back = new V3(tail.position.x - Math.sin(tail.heading) * 14, 0, tail.position.z - Math.cos(tail.heading) * 14);
  const s = sentryKind ? __M.spawn(sentryKind, back.x, back.z) : null;
  await wait(400);
  const flashes = ms.map(() => null);
  const t0 = simNow();
  if (s) s.forceState('alert'); else __CTX__.events.emit('plumb-chime', { machine: null, x: back.x, z: back.z });
  // lamp flashes (the telegraph record: steady 1.6x, pinhole) and the flight
  const path = [], fpos = ms.map(() => []);
  let alarmT = null;
  const leaderStart = lead ? lead.position.clone() : null;
  while (simNow() - t0 < 16) {
    await new Promise(r => requestAnimationFrame(r)); heal();
    const t = simNow() - t0;
    ms.forEach((m, i) => { const r = m.lamp; if (flashes[i] === null && r && r.teleSince >= t0 - 0.01) flashes[i] = +(r.teleSince - t0).toFixed(3); });
    if (alarmT === null && herd.alarmed) alarmT = +t.toFixed(3);
    if (lead) path.push([lead.position.x, lead.position.z]);
    ms.forEach((m, i) => { if (m !== lead && alarmT !== null) fpos[i].push([m.position.x, m.position.z]); });
  }
  // the leader's first 30 m of flight (from the alarm on), as a polyline including its calm path before it
  let lenAfter = 0, cut = path.length;
  const aIdx = Math.max(0, Math.round(path.length * 0));
  const pre = f ? Array.from({ length: f.count }, (_, k) => { const i = (f.head - (f.count - 1 - k) + f.cx.length) % f.cx.length; return [f.cx[i], f.cz[i]]; }) : [];
  const poly = pre.slice();
  let started = false, last = null;
  for (const q of path) { if (!started) { started = true; } if (last) { lenAfter += Math.hypot(q[0] - last[0], q[1] - last[1]); } last = q; poly.push(q); if (lenAfter >= 30) break; }
  const segD = (x, z) => { let best = 1e9; for (let k = 1; k < poly.length; k++) { const a = poly[k - 1], b = poly[k]; const ex = b[0] - a[0], ez = b[1] - a[1]; const L2 = ex * ex + ez * ez || 1e-9; let u = ((x - a[0]) * ex + (z - a[1]) * ez) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u; const dx = a[0] + ex * u - x, dz = a[1] + ez * u - z; const d = Math.hypot(dx, dz); if (d < best) best = d; } return best; };
  const lateral = ms.map((m, i) => {
    if (m === lead) return null;
    let worst = 0, n = 0;
    for (const q of fpos[i]) { const d = segD(q[0], q[1]); n++; if (d > worst) worst = d; }
    return { worstM: +worst.toFixed(2), samples: n };
  });
  const order = flashes.map((t, i) => ({ i, t })).filter(x => x.t !== null).sort((a, b) => a.t - b.t);
  const span = order.length ? order[order.length - 1].t - order[0].t : null;
  for (const m of ms) __M.sites.dispose(m);
  if (s) __M.sites.dispose(s);
  const checks = {
    chimeHeard: alarmT !== null,
    flashInSequence: order.length === ms.length && span !== null && span <= 1.5 && order.every((x, k) => k === 0 || x.t > order[k - 1].t),
    fleesInFile: lateral.every(x => x === null || (x.samples > 30 && x.worstM <= 2.0)),
    leaderRan30m: lenAfter >= 30,
  };
  const diag = { rippleHook: !!__M._herdRipple, ripples: __M._herdRipple ? __M._herdRipple.ripples : null, file: !!f, fileOrder: f ? f.order.length : 0, sentryState: s ? s.state : null, herds: __M.squads.herds.length, alarmedAtEnd: herd.alarmed };
  return { pass: Object.values(checks).every(Boolean), detail: { checks, diag, flashesS: flashes, flashSpanS: span && +span.toFixed(3), alarmS: alarmT, leaderFlightM: +lenAfter.toFixed(1), lateral, sentry: sentryKind,
    bar: 'a Plumb chimes near a herd -> lamps flash in sequence down the herd within 1.5 s; the herd then flees in file: every member within 2 m lateral of the leader path for the first 30 m' } };
})()`;

/* ------------------------------------------------------------------ */
/* ROUND5-LOOK per-kind rows (I-01, I-03, I-04, I-05, I-07)            */
/* ------------------------------------------------------------------ */
/** Stage one machine of KIND parked on open ground with a clear camera line; returns { m, h, lamp } */
const STAGE = `
  async function stageOne(dist) {
    const spot = flatSpot(30, 80);
    const m = stageKind(spot.x, spot.z);
    await wait(1500);
    if (!m) return null;
    park(m, 0);
    freezeAll([m]);
    const h = clearHeading(m, dist, (m.height || 2) * 0.6) ?? 0;
    park(m, h);
    standAt(m.position.x + Math.sin(h + 2.2) * 60, m.position.z + Math.cos(h + 2.2) * 60);
    if (p.model) p.model.visible = false;
    return { m, h };
  }
  function lampWorld(m) { const a = m._lampAnchor; a.updateWorldMatrix(true, false); const v = new (p.position.constructor)(); return a.getWorldPosition(v); }
`;

function A_CORE_GLOW(kind) {
  return `(async () => {
  ${KIND_PRELUDE({ kind })}
  if (!KIND) return skipNoKind();
  ${IA}
  ${STAGE}
  ${PIX}
  const s = await stageOne(4);
  if (!s) return { pass: null, detail: 'SKIP: could not stage' };
  const { m, h } = s;
  const hull = hullOfM(m);
  const lw = lampWorld(m);
  m.forceState('alert'); m.update = (dt, t) => { if (!m._disposed) m._updateEyes(dt, t); }; await frames(10);
  // (a) the active core over the live bloom threshold
  const thr = E.bloom ? E.bloom.threshold : 1.0;
  const core = { wary: LS.coreHdr ? LS.coreHdr('wary') : null, hostile: LS.coreHdr ? LS.coreHdr('hostile') : null };
  const lumOf = (c) => c ? (c.lum ?? (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b)) : 0;
  const coreA = { thr, wary: +(lumOf(core.wary) / thr).toFixed(2), hostile: +(lumOf(core.hostile) / thr).toFixed(2) };
  // (c) DUSK 20:30: the hull near the lamp brighter with the spill than without; far hull unchanged
  env.setWeather?.('clear', 0.05); env.setTime?.(20.5);
  // the paired read needs a steady lamp: calm (the wary pulse and hostile flicker move the bloom between the two frames)
  park(m, h); freezeOne(m);
  m.update = (dt, t) => { if (!m._disposed) m._updateEyes(dt, t); };
  const ax = Math.sin(h), az = Math.cos(h);
  poseCam(lw.x + ax * 3.2 + az * 1.4, lw.y + 0.5, lw.z + az * 3.2 - ax * 1.4, lw.x, lw.y - 0.2, lw.z, 40);
  await frames(20);
  // sample hull points: prox >= 0.45 (near, within ~0.6 m of the rim) and prox == 0 beyond 1.2 m (far)
  const pos = hull.geometry.attributes.position, prox = hull.geometry.attributes._lampprox;
  const V3 = p.position.constructor, v = new V3();
  const nearPts = [], farPts = [];
  hull.updateMatrixWorld(true);
  for (let i = 0; i < pos.count && (nearPts.length < 40 || farPts.length < 40); i += 7) {
    const q = prox ? prox.getX(i) : 0;
    hull.getVertexPosition(i, v); hull.localToWorld(v);
    const d = v.distanceTo(lw);
    const nv = v.clone().project(cam);
    if (Math.abs(nv.x) > 0.95 || Math.abs(nv.y) > 0.95 || nv.z > 1) continue;
    if (q >= 0.45 && d > 0.15 && nearPts.length < 40) nearPts.push(nv);
    else if (q === 0 && d > 1.2 && farPts.length < 40) farPts.push(nv);
  }
  const lumAt = async (pts) => {
    const out = [];
    for (const nv of pts) {
      const g = await PIX.grab((W) => (nv.x * 0.5 + 0.5) * W, (H) => (nv.y * 0.5 + 0.5) * H, 1);
      out.push(0.2126 * g.px[0] + 0.7152 * g.px[1] + 0.0722 * g.px[2]);
    }
    return out;
  };
  const on = { near: await lumAt(nearPts), far: await lumAt(farPts) };
  const keepU = m.lamp.coreU; m.lamp.coreU = null; hull.material.userData.hullU.uCoreCol.value.set(0, 0, 0);
  await frames(6);
  const off = { near: await lumAt(nearPts), far: await lumAt(farPts) };
  m.lamp.coreU = keepU;
  PIX.stop();
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const nearGain = mean(off.near) > 0 ? mean(on.near) / mean(off.near) - 1 : null;
  const farChange = mean(off.far) > 0 ? Math.abs(mean(on.far) / mean(off.far) - 1) : null;
  // (e) one hull + one sensor material; no light added
  const mats = new Set(); let lights = 0;
  m.root.traverse(o => { if (o.isMesh && o.visible && !o.userData.casterProxy) mats.add(o.material.name); if (o.isLight) lights++; });
  const checks = {
    a_coreOverBloom: coreA.wary >= 1.25 && coreA.hostile >= 1.25,
    c_spillNear15: nearGain !== null && nearGain >= 0.15,
    c_farUnder3: farChange !== null && farChange <= 0.03,
    e_twoMaterialsNoLights: lights === 0 && [...mats].filter(n => /hull/.test(n)).length === 1,
  };
  return { pass: Object.values(checks).every(Boolean), detail: { checks, coreOverThreshold: coreA, nearGainPct: nearGain !== null ? +(100 * nearGain).toFixed(1) : null, farChangePct: farChange !== null ? +(100 * farChange).toFixed(2) : null,
    samples: { near: nearPts.length, far: farPts.length }, materials: [...mats], lights,
    d_parallax: 'graded in A-core-parallax:' + KIND, b_colour: 'A-lamp-states + A-lamp-canon-distance' } };
})()`;
}

function A_CORE_PARALLAX(kind) {
  return `(async () => {
  ${KIND_PRELUDE({ kind })}
  if (!KIND) return skipNoKind();
  ${IA}
  ${STAGE}
  ${PIX}
  const s = await stageOne(6);
  if (!s) return { pass: null, detail: 'SKIP: could not stage' };
  const { m, h } = s;
  env.setWeather?.('clear', 0.05); env.setTime?.(20.5);
  park(m, h); m.update = (dt, t) => { if (!m._disposed) m._updateEyes(dt, t); };
  const lw = lampWorld(m);
  const a = m._lampAnchor; const e = a.matrixWorld.elements; const ax = new (p.position.constructor)(e[8], e[9], e[10]).normalize();
  const R0 = m.lamp.radius;
  const shoot = async (deg) => {
    const r = deg * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
    const dx = ax.x * c + ax.z * sn, dz = -ax.x * sn + ax.z * c;
    poseCam(lw.x + dx * 6, lw.y + ax.y * 6, lw.z + dz * 6, lw.x, lw.y, lw.z, 10);
    await frames(10);
    // the lamp disc on screen (its centre and radius in px), then: the core = centroid of the hottest pixels, the
    // rim = centroid of the whole lit glass
    const W = E.renderer.getContext().drawingBufferWidth, H = E.renderer.getContext().drawingBufferHeight;
    const pc = lw.clone().project(cam), cx = (pc.x * 0.5 + 0.5) * W, cy = (pc.y * 0.5 + 0.5) * H;
    const rpx = R0 * H / (2 * 6 * Math.tan(5 * Math.PI / 180));
    const n = Math.min(400, Math.ceil(rpx * 2.4));
    const g = await PIX.grab(() => cx, () => cy, n);
    let mx = 0;
    const lum = (o) => 0.2126 * g.px[o] + 0.7152 * g.px[o + 1] + 0.0722 * g.px[o + 2];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const dd = Math.hypot(x - n / 2, y - n / 2); if (dd < rpx) mx = Math.max(mx, lum((y * n + x) * 4)); }
    let hx = 0, hy2 = 0, hn = 0, lx = 0, ly = 0, ln = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (Math.hypot(x - n / 2, y - n / 2) > rpx) continue;
      const l = lum((y * n + x) * 4);
      if (l >= 0.97 * mx) { hx += x; hy2 += y; hn++; }
      if (l >= 60) { lx += x; ly += y; ln++; }
    }
    return { core: hn ? [hx / hn, hy2 / hn] : null, ring: ln ? [lx / ln, ly / ln] : null, discPx: +rpx.toFixed(1), hot: hn, lit: ln };
  };
  const f0 = await shoot(0), f30 = await shoot(30);
  PIX.stop();
  const off = (f) => f.ring && f.core ? [f.core[0] - f.ring[0], f.core[1] - f.ring[1]] : null;
  const o0 = off(f0), o30 = off(f30);
  const moved = o0 && o30 ? Math.hypot(o30[0] - o0[0], o30[1] - o0[1]) : null;
  // a 10 deg view at 6 m: scaled to the 55 deg game view for the record
  const toGame = Math.tan(5 * Math.PI / 180) / Math.tan(27.5 * Math.PI / 180);
  return { pass: moved !== null && moved * toGame >= 2, detail: { movedPxAt10deg: moved && +moved.toFixed(1), movedPxAtGameView: moved && +(moved * toGame).toFixed(2), f0, f30,
    bar: 'I-01 (d): a 30 deg orbit at 6 m moves the inner glow >= 2 px relative to the rim (the 55 deg game view, 1600 x 900)' } };
})()`;
}

function A_PLAY_TELEGRAPH(kind) {
  return `(async () => {
  ${KIND_PRELUDE({ kind })}
  if (!KIND) return skipNoKind();
  ${IA}
  const Lm = await import('/src/instruments/lamps.js');
  const Col = await import('/src/instruments/lib/color.js');
  const spot = flatSpot(25, 70);
  const m = stageKind(spot.x, spot.z);
  await wait(1500);
  if (!m) return { pass: null, detail: 'SKIP: could not stage' };
  standAt(m.position.x + 3.5, m.position.z + 3.5, m.position.x, m.position.z);
  const attacks = new Map();   // attack object -> { kind, windup start, strike start, tele start }
  const phases = [];
  const onP = (e) => { if (e.machine === m) phases.push({ kind: e.kind, phase: e.phase, t: simNow() }); };
  ev.on('machine-attack-phase', onP);
  const teles = [];
  let lastSince = m.lamp ? m.lamp.teleSince : -1;
  m.forceState('attack');
  const s0 = simNow();
  E.requestTimeScale?.('ia-tele', 1);
  let holdGain = null, flickerMean = null;
  const L = m.lamp;
  while (simNow() - s0 < 40) {
    await new Promise(r => requestAnimationFrame(r));
    heal();
    if (m.state !== 'attack' && m.state !== 'stagger' && m.alive) m.forceState('attack');
    const r = m.lamp;
    if (r && r.teleSince !== lastSince && r.teleSince > s0) { teles.push({ t: r.teleSince, until: r.teleUntil, glint: !!r.glint }); lastSince = r.teleSince; }
    // the lamp's emitted ring HDR (the instance attribute) while held vs while flickering hostile
    if (r && r.slot >= 0) {
      const A = LS._aLamp.array, o = r.slot * 4, g = A[o] + A[o + 1] + A[o + 2];
      const now = simNow();
      if (now >= r.teleSince && now < r.teleUntil) holdGain = Math.max(holdGain ?? 0, g);
      else if (r.state === 'hostile') flickerMean = flickerMean === null ? g : flickerMean * 0.98 + g * 0.02;
    }
  }
  ev.off?.('machine-attack-phase', onP);
  E.requestTimeScale?.('ia-tele', null);
  // pair each windup with its strike and the telegraph that started on that windup's frame
  const rows = [];
  for (let i = 0; i < phases.length; i++) {
    const w = phases[i];
    if (w.phase !== 'windup') continue;
    const st = phases.slice(i + 1).find(x => x.kind === w.kind && x.phase === 'strike');
    const tl = teles.find(x => Math.abs(x.t - w.t) <= 0.05);
    rows.push({ kind: w.kind, lead: st && tl ? +(st.t - tl.t).toFixed(3) : null, telegraphed: !!tl, glint: tl ? tl.glint : false });
  }
  const orphan = teles.filter(x => !phases.some(p => p.phase === 'windup' && Math.abs(p.t - x.t) <= 1.0)).length;
  // (4) the held colour on screen: the solved hostile ring x 1.6 through the live output transform
  const P = LS._P;
  const hdr = LS.lampHdr('hostile');
  const outRgb = Lm.outputForward([hdr.r * Lm.TELEGRAPH.gain, hdr.g * Lm.TELEGRAPH.gain, hdr.b * Lm.TELEGRAPH.gain], P);
  const dHue = Col.deltaE(outRgb.map(x => Math.min(1, Math.max(0, x))), Col.hexToRgb('#FF2D8C'));
  const kinds = [...new Set(rows.map(r => r.kind))];
  const tableKinds = (__M.instrumentKinds[KIND].tables.attacks || []).map(a => a.id);
  const leadBand = (r) => r.lead !== null && r.lead >= 0.45 && r.lead <= 0.9;
  const checks = {
    twoOrMoreAttackKinds: kinds.length >= 2,
    c1_everyAttackTelegraphed: rows.length > 0 && rows.every(r => r.telegraphed),
    c1_leadInBand: rows.every(leadBand),
    c2_heldOver15xFlicker: holdGain !== null && flickerMean !== null && holdGain >= 1.5 * flickerMean,
    c3_glintOnStrikingEnd: rows.every(r => r.glint),
    c4_holdHueWithin6: dHue <= 6,
    c5_noOrphanTelegraphs: orphan === 0,
  };
  const leads = rows.map(r => r.lead).filter(x => x !== null);
  __M.sites.dispose(m);
  return { pass: Object.values(checks).every(Boolean), detail: { checks, attacks: rows.length, kinds, leadMinS: leads.length ? Math.min(...leads) : null, leadMaxS: leads.length ? Math.max(...leads) : null,
    holdOverFlicker: holdGain && flickerMean ? +(holdGain / flickerMean).toFixed(2) : null, heldHueDE: +dHue.toFixed(2), orphanTelegraphs: orphan,
    glint: { radiusM: 'kind file', hdr: Lm.TELEGRAPH.glintHdr },
    note: 'clauses 2-4 read the emitted lamp values through the live output transform; the rendered 25 m backlit read is filmed by V-play-telegraph',
    bar: 'every attack telegraphs 0.45-0.9 s before its strike; held lamp >= 1.5x its flicker mean; a warm glint on the striking end; hold hue within 6 of #FF2D8C; 0 telegraphs without an attack within 1 s' } };
})()`;
}

function A_IP_EMISSIVE(kind) {
  return `(async () => {
  ${KIND_PRELUDE({ kind })}
  if (!KIND) return skipNoKind();
  ${IA}
  ${STAGE}
  const Col = await import('/src/instruments/lib/color.js');
  const THREE = (await import('/src/core/collision.js')).THREE;
  const s = await stageOne(15);
  if (!s) return { pass: null, detail: 'SKIP: could not stage' };
  const { m, h } = s;
  const R = E.renderer, scene = __CTX__.scene;
  const FIVE = ['#ff2413', '#38c6ff', '#ffb31f', '#19ffd0', '#9B6BFF'].map(x => Col.rgbToLab(Col.hexToRgb(x)));
  const rt = new THREE.WebGLRenderTarget(1600, 900);
  const buf = new Uint8Array(1600 * 900 * 4);
  const own = new Set(); m.root.traverse(o => own.add(o));
  const lampGroup = LS.group;
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 }), white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const shoot = async (mode, dist) => {
    const lw = lampWorld(m);
    poseCam(lw.x + Math.sin(h) * dist, lw.y + 0.3, lw.z + Math.cos(h) * dist, lw.x, lw.y - (m.height || 2) * 0.25, lw.z, 55);
    await frames(4);
    const keep = [], mats = [];
    scene.traverse(o => { if (!o.isMesh && !o.isSprite && !o.isPoints && !o.isLine) return; const mine = own.has(o) || o === LS.lampMesh || o === LS.beamMesh; if (!mine && o.visible) { keep.push(o); o.visible = false; } });
    if (mode === 'mask') { LS.lampMesh.visible = false; LS.beamMesh.visible = false; }
    m.root.traverse(o => { if (!o.isMesh) return; mats.push([o, o.material]);
      if (mode === 'mask') o.material = white;
      else if (o.userData.ipExempt === 'fire') o.visible = false;
      else { const em = o.material.emissive; const glows = em && (em.r + em.g + em.b) > 0.01; o.material = glows ? new THREE.MeshBasicMaterial({ color: em.clone().multiplyScalar(o.material.emissiveIntensity ?? 1) }) : black; } });
    const fog = scene.fog, bg = scene.background, tm = R.toneMapping;
    scene.fog = null; scene.background = new THREE.Color(0, 0, 0); R.toneMapping = THREE.NoToneMapping;
    R.setRenderTarget(rt); R.clear(); R.render(scene, cam); R.readRenderTargetPixels(rt, 0, 0, 1600, 900, buf); R.setRenderTarget(null);
    scene.fog = fog; scene.background = bg; R.toneMapping = tm;
    for (const [o, mt] of mats) { if (o.material !== mt && o.material !== white && o.material !== black) o.material.dispose(); o.material = mt; }
    for (const o of keep) o.visible = true;
    if (mode === 'mask') { LS.lampMesh.visible = true; }
    let lit = 0, near = 0;
    for (let i = 0; i < buf.length; i += 4) {
      const r = buf[i] / 255, g = buf[i + 1] / 255, b = buf[i + 2] / 255;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (l < 0.05) continue;
      lit++;
      if (mode === 'mask') continue;
      const mx = Math.max(r, g, b) || 1;
      const lab = Col.rgbToLab([r / mx, g / mx, b / mx]);
      if (FIVE.some(f => Col.deltaE2000(lab, f) < 20)) near++;
    }
    return { lit, near };
  };
  const rows = {};
  for (const st of ['calm', 'wary', 'hostile']) {
    m.forceState(st === 'calm' ? 'patrol' : st === 'wary' ? 'suspicious' : 'alert');
    m.update = (dt, t) => { if (!m._disposed) m._updateEyes(dt, t); };
    await frames(12);
    for (const d of [15, 40]) {
      const e = await shoot('emissive', d);
      rows[st + '@' + d] = { emissivePx: e.lit, nearFivePct: e.lit ? +(100 * e.near / e.lit).toFixed(3) : 0 };
    }
  }
  m.forceState('alert'); await frames(8);
  const sil = await shoot('mask', 15), em15 = await shoot('emissive', 15);
  rt.dispose(); black.dispose(); white.dispose();
  const hostilePct = sil.lit ? 100 * em15.lit / sil.lit : null;
  const checks = {
    c1_nearFiveUnder05pct: Object.values(rows).every(r => r.nearFivePct <= 0.5),
    c2_hostileEmissiveUnder15pctOfSilhouette: hostilePct !== null && hostilePct <= 1.5,
  };
  return { pass: Object.values(checks).every(Boolean), detail: { checks, rows, hostile15: { silhouettePx: sil.lit, emissivePx: em15.lit, pct: hostilePct && +hostilePct.toFixed(3) },
    bar: 'emissive-only render (no tone map, no fog/lights/post), each emissive pixel normalised by its max channel: <= 0.5 % within dE2000 20 of the five; hostile at 15 m: emissive <= 1.5 % of the silhouette' } };
})()`;
}

function A_HULL_VALUE(kind) {
  return `(async () => {
  ${KIND_PRELUDE({ kind })}
  if (!KIND) return skipNoKind();
  ${IA}
  ${STAGE}
  const THREE = (await import('/src/core/collision.js')).THREE;
  const s = await stageOne(8);
  if (!s) return { pass: null, detail: 'SKIP: could not stage' };
  const { m, h } = s;
  const hull = hullOfM(m);
  const R = E.renderer, scene = __CTX__.scene, gl = R.getContext();
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const read = async () => { await frames(2); const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight; const px = new Uint8Array(W * H * 4); await new Promise(r => { const hook = () => { gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); E.onAfterRender.splice(E.onAfterRender.indexOf(hook), 1); r(); }; E.onAfterRender.push(hook); }); return { W, H, px }; };
  const measure = async (hour, backlit) => {
    env.setWeather?.('clear', 0.05); env.setTime?.(hour);
    await frames(10);
    // the sun's bearing: backlit puts the camera on the sun-facing side looking at the hull against the light
    const sd = env.sunDir || { x: 0, z: 1 };
    let cb = Math.atan2(sd.x, sd.z);
    const look = backlit ? cb : cb + Math.PI * 0.5;
    const c = m.position, H0 = (m.height || 2) * 0.5;
    poseCam(c.x + Math.sin(look) * 8, c.y + H0 + 0.4, c.z + Math.cos(look) * 8, c.x, c.y + H0, c.z, 45);
    m.update = (dt, t) => { if (!m._disposed) m._updateEyes(dt, t); };
    const frame = await read();
    // the hull mask: only the hull, flat white, everything else hidden
    const hidden = []; scene.traverse(o => { if ((o.isMesh || o.isSprite || o.isPoints || o.isLine) && o.visible && o !== hull) { hidden.push(o); o.visible = false; } });
    const mat = hull.material; hull.material = white;
    const bg = scene.background, fog = scene.fog; scene.background = new THREE.Color(0, 0, 0); scene.fog = null;
    const pp = E.postEnabled;
    const mask = await read();
    scene.background = bg; scene.fog = fog; hull.material = mat; for (const o of hidden) o.visible = true;
    const { W, H, px } = frame, mk = mask.px;
    const inM = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mk[(y * W + x) * 4] > 128;
    const lum = [], foot = [], upper = [], edge = [], inner = [];
    let ymin = H, ymax = 0, hot = 0, verd = 0, metal = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inM(x, y)) { if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!inM(x, y)) continue;
      const o = (y * W + x) * 4, r = px[o] / 255, g = px[o + 1] / 255, b = px[o + 2] / 255;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lum.push(l);
      if (l >= 0.97) hot++;
      const fy = (y - ymin) / Math.max(1, ymax - ymin);       // 0 at the bottom (WebGL rows)
      if (fy <= 0.15) foot.push(l); else if (fy >= 0.5) upper.push(l);
      const isEdge = !inM(x - 2, y) || !inM(x + 2, y) || !inM(x, y - 2) || !inM(x, y + 2);
      (isEdge ? edge : inner).push(l);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx > 0 ? (mx - mn) / mx : 0;
      if (sat > 0.12 && mx > 0.08) {
        let hue = 0; const dd = mx - mn || 1;
        if (mx === r) hue = 60 * (((g - b) / dd) % 6); else if (mx === g) hue = 60 * ((b - r) / dd + 2); else hue = 60 * ((r - g) / dd + 4);
        if (hue < 0) hue += 360;
        if ((hue >= 20 && hue <= 60) || (hue >= 150 && hue <= 175)) metal++;
        if (hue >= 150 && hue <= 175) verd++;
      }
    }
    lum.sort((a, b) => a - b);
    const q = (f) => lum.length ? lum[Math.min(lum.length - 1, Math.floor(f * lum.length))] : 0;
    const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    return { px: lum.length, p5: +q(0.05).toFixed(3), p95: +q(0.95).toFixed(3), spread: +(q(0.95) - q(0.05)).toFixed(3), hotPct: +(100 * hot / Math.max(1, lum.length)).toFixed(2),
      footOverUpper: +(mean(foot) / Math.max(1e-4, mean(upper))).toFixed(3), verdigrisPctOfMetal: +(100 * verd / Math.max(1, metal)).toFixed(2), edgeOverInner: +(mean(edge) / Math.max(1e-4, mean(inner))).toFixed(3) };
  };
  const noon = await measure(13, false);
  const dusk = await measure(18.75, true);
  white.dispose();
  const checks = {
    a_spread030: noon.spread >= 0.30 && dusk.spread >= 0.30,
    b_hotUnder2pct: noon.hotPct <= 2 && dusk.hotPct <= 2,
    c_footBandDark: noon.footOverUpper <= 0.80 && dusk.footOverUpper <= 0.80,
    d_verdigris3pct: noon.verdigrisPctOfMetal >= 3,
    e_backlitEdge15x: dusk.edgeOverInner >= 1.5,
  };
  return { pass: Object.values(checks).every(Boolean), detail: { checks, noon, dusk1845: dusk,
    bar: 'I-03 at 13:00 and 18:45: hull P5-P95 luminance >= 0.30; <= 2 % hull px >= 0.97; foot band (lowest 15 %) <= 0.80 x upper half; >= 3 % of bronze px verdigris (hue 150-175); backlit edge band >= 1.5 x interior' } };
})()`;
}

const A_INSTR_SHADOW_LOD = `(async () => {
  ${KIND_PRELUDE({ kind: 'tiller' })}
  if (!KIND) return skipNoKind();
  ${IA}
  ${STAGE}
  const THREE = (await import('/src/core/collision.js')).THREE;
  const d = __M.instrumentKinds[KIND];
  const buf = new Uint8Array(await (await fetch(d.spec.url)).arrayBuffer());
  const dv = new DataView(buf.buffer), jl = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jl)));
  const tris = {};
  for (const mesh of json.meshes) { let t = 0; for (const pr of mesh.primitives) t += json.accessors[pr.indices].count / 3; tris[mesh.name] = t; }
  const lod0 = Object.entries(tris).filter(([n]) => /-hull$|-sensor$/.test(n)).reduce((a, [, t]) => a + t, 0);
  const lod1 = Object.entries(tris).filter(([n]) => /-lod1$/.test(n)).reduce((a, [, t]) => a + t, 0);
  const s = await stageOne(12);
  if (!s) return { pass: null, detail: 'SKIP: could not stage' };
  const { m, h } = s;
  const proxy = m._casterProxy, hull = hullOfM(m);
  // (d) the shadow silhouettes along the sun, LOD0 vs LOD1, at 12 m: ortho masks of the two meshes on the same frame
  env.setWeather?.('clear', 0.05); env.setTime?.(15);
  await frames(6);
  const sd = (env.sunDir ? env.sunDir.clone() : new THREE.Vector3(0.4, 0.8, 0.3)).normalize();
  const c = m.position.clone(); c.y += (m.height || 2) * 0.5;
  const oc = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 60);
  oc.position.copy(c).addScaledVector(sd, 20); oc.lookAt(c); oc.updateMatrixWorld();
  const R = E.renderer, scene = __CTX__.scene;
  const rt = new THREE.WebGLRenderTarget(256, 256), px = new Uint8Array(256 * 256 * 4);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const maskOf = (mesh) => {
    const hidden = []; scene.traverse(o => { if ((o.isMesh || o.isSprite || o.isPoints || o.isLine) && o.visible && o !== mesh) { hidden.push(o); o.visible = false; } });
    const was = { vis: mesh.visible, mat: mesh.material, layers: mesh.layers.mask };
    mesh.visible = true; mesh.material = white; mesh.layers.set(0);
    const bg = scene.background, fog = scene.fog; scene.background = new THREE.Color(0, 0, 0); scene.fog = null;
    R.setRenderTarget(rt); R.clear(); R.render(scene, oc); R.readRenderTargetPixels(rt, 0, 0, 256, 256, px); R.setRenderTarget(null);
    scene.background = bg; scene.fog = fog; mesh.visible = was.vis; mesh.material = was.mat; mesh.layers.mask = was.layers;
    for (const o of hidden) o.visible = true;
    const out = new Uint8Array(256 * 256); for (let i = 0; i < out.length; i++) out[i] = px[i * 4] > 128 ? 1 : 0; return out;
  };
  let iou = null;
  if (proxy && hull) {
    const a = maskOf(hull), b = maskOf(proxy);
    let I = 0, U = 0; for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) I++; if (a[i] || b[i]) U++; }
    iou = U ? I / U : null;
  }
  rt.dispose(); white.dispose();
  const casterMode = !!m._casterMode;
  const checks = {
    a_lod1Under40pct: lod1 > 0 && lod1 <= 0.40 * lod0,
    d_shadowIoU090: iou !== null && iou >= 0.90,
  };
  return { pass: Object.values(checks).every(Boolean) ? (casterMode ? true : null) : false, detail: { checks, tris, lod0, lod1, ratio: +(lod1 / lod0).toFixed(3), shadowMaskIoU: iou && +iou.toFixed(3),
    casterMode: casterMode ? 'LIVE: the proxy is the only caster (CAL_LAYER.CASTER_ONLY)' : 'PENDING look-post: engine CAL_LAYER / shadowMap._calLayers not in this tree (the proxy is hidden; the hull casts as before)',
    b_shadowTrisUnder45pct: casterMode ? 'graded on main after look-post merges' : 'PENDING look-post', c_herdGpu: 'PENDING-quiet-box (R45): the W1-exit global run',
    bar: 'I-04: LOD1 <= 40 % of LOD0 tris; the shadow pass draws LOD1 only (herd-frame Instrument shadow tris <= 45 %); herd median GPU -0.3 ms; shadow-mask IoU LOD0:LOD1 >= 0.90 at 12 m' } };
})()`;

/* ------------------------------------------------------------------ */
/* carried instruments-core minors (lamps.js)                          */
/* ------------------------------------------------------------------ */
const NIGHT_LOCK = `
  async function nightLock(distM) {
    const spot = flatSpot(40, 90);
    const m = stageKind(spot.x, spot.z);
    await wait(1500);
    if (!m) return null;
    park(m, 0);
    env.setWeather?.('clear', 0.05); env.setTime?.(23);
    const h = clearHeading(m, distM, 2.2) ?? 0;
    park(m, h);
    standAt(m.position.x + Math.sin(h) * distM, m.position.z + Math.cos(h) * distM, m.position.x, m.position.z);
    m.forceState('alert');
    m.update = (dt, t) => { if (!m._disposed) { m._updateEyes(dt, t); m.sc.heading = h; } };
    freezeAll([m]);
    await frames(20);
    return { m, h };
  }
`;
const A_LOCK_POP = `(async () => {
  ${KIND_PRELUDE({ role: 'herd' })}
  if (!KIND) return skipNoKind();
  ${IA}
  ${NIGHT_LOCK}
  const Lm = await import('/src/instruments/lamps.js');
  const s = await nightLock(23.5);
  if (!s) return { pass: null, detail: 'SKIP: could not stage' };
  const { m, h } = s;
  const B = Lm.BEAM;
  const r = m.lamp;
  // the shader's lock light at 50 % of the cone, from the instance data _writeMatrices wrote this frame (lamps.js BEAM_FRAG)
  const lightAt = (len, tgt, f) => {
    const d = f * len, dT = Math.min(tgt, 1) * len;
    const pastH = Math.pow(2, -Math.max(d - dT, 0) / B.pastTargetHalfM);
    const tw = tgt < 1 ? Math.max(Math.min(len - dT, B.lockTailM), 0.05) : len;
    let tail = Math.min(1, Math.max(0, (len - d) / tw)); tail *= tail;
    const lockA = Math.pow(1 - B.lockFadeToTarget * Math.min(d / Math.max(dT, 0.001), 1), 2) / Math.pow(1 + d / Math.max(B.lockFalloffM, B.lockFalloffFrac * dT), 2) * pastH * tail;
    return lockA;
  };
  const rows = [];
  const base = m._lampAnchor;
  for (let k = 0; k <= 50; k++) {
    const dist = 23.5 + k * 0.02;
    standAt(m.position.x + Math.sin(h) * dist, m.position.z + Math.cos(h) * dist);
    await frames(2);
    if (r.bslot < 0) { rows.push(null); continue; }
    const bm = LS.beamMesh.instanceMatrix.array, o = r.bslot * 16;
    const radX = Math.hypot(bm[o], bm[o + 1], bm[o + 2]), len = Math.hypot(bm[o + 8], bm[o + 9], bm[o + 10]);
    const tgt = LS._aBeam.array[r.bslot * 4 + 3];
    rows.push({ dist: +dist.toFixed(2), len: +len.toFixed(2), radiusM: +radX.toFixed(4), tgt: +tgt.toFixed(4), light50: lightAt(len, tgt, 0.5) });
  }
  const ok = rows.filter(Boolean);
  let worstLight = 0, worstRadius = 0, crossed = false;
  for (let i = 1; i < ok.length; i++) {
    const a = ok[i - 1], b = ok[i];
    if (a.dist < a.len && b.dist >= b.len) crossed = true;
    worstLight = Math.max(worstLight, Math.abs(b.light50 - a.light50) / Math.max(1e-6, a.light50));
    worstRadius = Math.max(worstRadius, Math.abs(b.radiusM - a.radiusM) / Math.max(1e-6, a.radiusM));
  }
  __M.sites.dispose(m);
  return { pass: ok.length > 40 && worstLight <= 0.20 && worstRadius <= 0.20, detail: { steps: ok.length, coneLenM: ok[0]?.len, crossedConeEnd: crossed, worstLightChangePerStep: +worstLight.toFixed(4), worstRadiusChangePerStep: +worstRadius.toFixed(4), first: ok[0], last: ok[ok.length - 1],
    bar: 'carried minor 3: her chest stepping 23.5 -> 24.5 m from a night lock (across the cone end), the light at 50 % of the cone and the radius at her change <= 20 % per step' } };
})()`;

function A_CHASE_CENSUS(weather) {
  return `(async () => {
  ${KIND_PRELUDE({ role: 'herd' })}
  if (!KIND) return skipNoKind();
  ${IA}
  ${PIX}
  const spot = flatSpot(40, 90);
  const m = stageKind(spot.x, spot.z);
  await wait(1500);
  if (!m) return { pass: null, detail: 'SKIP: could not stage' };
  park(m, 0);
  ${weather === 'fog' ? "env.setWeather?.('overcast', 0.05); env.setTime?.(13);" : "env.setWeather?.('clear', 0.05); env.setTime?.(23);"}
  const h = clearHeading(m, 18, 2.2) ?? 0;
  park(m, h);
  standAt(m.position.x + Math.sin(h) * 18, m.position.z + Math.cos(h) * 18, m.position.x, m.position.z);
  m.forceState('alert');
  m.update = (dt, t) => { if (!m._disposed) { m._updateEyes(dt, t); m.sc.heading = h; } };
  freezeAll([m]);
  await frames(30);
  const full = async () => PIX.grab((W) => W / 2, (H) => H / 2, Math.min(E.renderer.getContext().drawingBufferHeight, 880));
  const on = await full();
  LS.hideBeams = true; await frames(3);
  const off = await full();
  LS.hideBeams = false;
  PIX.stop();
  let added = 0, n = 0;
  for (let i = 0; i < on.px.length; i += 4) {
    n++;
    const dR = on.px[i] - off.px[i], dG = on.px[i + 1] - off.px[i + 1], dB = on.px[i + 2] - off.px[i + 2];
    const d = Math.max(dR, dG, dB);
    if (d >= 24 && Math.min(dR - dG, dB - dG) >= 6) added++;
  }
  const pct = 100 * added / Math.max(1, n);
  __M.sites.dispose(m);
  return { pass: pct < 2.0, detail: { weather: '${weather}', magentaAddedPct: +pct.toFixed(3), pixels: n, beamOn: LS.beamsOn(),
    bar: 'carried minor 2: from her chase camera at 18 m from a locked hostile lamp, the magenta the beam adds covers < 2 % of the frame' } };
})()`;
}

/* ------------------------------------------------------------------ */
/* the films (read by the lane; judged by the R29 judge)               */
/* ------------------------------------------------------------------ */
function FILM_SETUP(kind, o = {}) {
  return `(async () => {
  ${KIND_PRELUDE({ kind })}
  ${IA}
  ${STAGE}
  E.setDynamicResolution?.(false);
  const s = await stageOne(o_dist());
  function o_dist() { return ${o.dist ?? 7}; }
  if (!s) return;
  const { m, h } = s;
  env.setWeather?.('${o.weather || 'clear'}', 0.05); env.setTime?.(${o.hour ?? 17.5});
  ${o.state ? `m.forceState('${o.state}');` : ''}
  m.update = (dt, t) => { if (!m._disposed) m._updateEyes(dt, t); };
  const c = m.position, Hh = (m.height || 2);
  const az = h + ${o.yaw ?? 0.7};
  poseCam(c.x + Math.sin(az) * ${o.dist ?? 7}, c.y + Hh * ${o.camH ?? 0.55}, c.z + Math.cos(az) * ${o.dist ?? 7}, c.x, c.y + Hh * ${o.lookH ?? 0.45}, c.z, ${o.fov ?? 40});
  await frames(30);
})()`;
}

const GATES = [
  ...kindBlock({ kind: 'tiller', lane: LANE, class: 'medium' }),
  ...kindBlock({ kind: 'plumb', lane: LANE, class: 'small' }),
  ...kindBlock({ kind: 'peg', lane: LANE, class: 'small' }),
  { id: 'A-plumb-scale', kind: 'action', lane: LANE, timeout: 420000, settle: 400,
    title: 'Plumb generator at scale 3 and 6.5, hull hidden: A45c <= 0.12 m/frame, A46 <= 0.08 m, A48 in band at both scales', assert: A_PLUMB_SCALE },
  { id: 'A-plumb-topple', kind: 'action', lane: LANE, timeout: 120000, settle: 400,
    title: 'Two level-vial hits: topple within 0.5 s, down 4 s +-0.3, grounded (A47 bar) while down, stands back up; 0 gait.js lines changed', assert: A_PLUMB_TOPPLE },
  { id: 'A-flagged', kind: 'action', lane: LANE, timeout: 180000, settle: 400,
    title: 'A sentry sees Brea: every Instrument within 60 m enters search toward the flag <= 1 s; the mark lasts 8 s (3 s in Guild Whites via perception.flagDuration)', assert: A_FLAGGED },
  { id: 'A-transect', kind: 'action', lane: LANE, timeout: 150000, settle: 400,
    title: 'A Peg swarm lays a line: pegs are 1 instanced draw; crossing within 20 m of a Plumb raises it to wary <= 1 s; site dispose removes the pegs (geometries baseline)', assert: A_TRANSECT },
  { id: 'A-herd-ripple', kind: 'action', lane: LANE, timeout: 150000, settle: 400,
    title: 'A Plumb chimes near a herd: lamps flash in sequence down the herd within 1.5 s; the herd flees in file, every member within 2 m lateral of the leader path for the first 30 m', assert: A_HERD_RIPPLE },
  { id: 'A-instr-shadow-lod', kind: 'action', lane: LANE, timeout: 120000, settle: 400,
    title: 'I-04 (Tiller): LOD1 <= 40 % of LOD0; the shadow pass draws LOD1 only; shadow-mask IoU LOD0:LOD1 >= 0.90 at 12 m', assert: A_INSTR_SHADOW_LOD },
  { id: 'A-lock-pop', kind: 'action', lane: LANE, timeout: 150000, settle: 400,
    title: 'Carried minor 3: a night lock as she steps 23.5 -> 24.5 m (the cone end): light at 50 % and radius change <= 20 % per step', assert: A_LOCK_POP },
  { id: 'A-chase-beam-census-night', kind: 'action', lane: LANE, timeout: 120000, settle: 400,
    title: 'Carried minor 2: chase camera at 18 m from a hostile lock at night: magenta added < 2 % of the frame', assert: A_CHASE_CENSUS('night') },
  { id: 'A-chase-beam-census-fog', kind: 'action', lane: LANE, timeout: 120000, settle: 400,
    title: 'Carried minor 2: chase camera at 18 m from a hostile lock in fog: magenta added < 2 % of the frame', assert: A_CHASE_CENSUS('fog') },
];
for (const [kind] of [['tiller'], ['plumb'], ['peg']]) {
  GATES.push(
    { id: `A-core-glow:${kind}`, kind: 'action', lane: LANE, timeout: 120000, settle: 400,
      title: `[kind ${kind}] I-01 A-core-glow: core over the bloom threshold; dusk 20:30 hull near the core >= 15 % brighter with it lit, beyond 1.2 m <= 3 %; one hull + one sensor material, no lights`, assert: A_CORE_GLOW(kind) },
    { id: `A-core-parallax:${kind}`, kind: 'action', lane: LANE, timeout: 120000, settle: 400,
      title: `[kind ${kind}] I-01 (d): a 30 deg orbit at 6 m moves the inner glow >= 2 px relative to the rim`, assert: A_CORE_PARALLAX(kind) },
    { id: `A-play-telegraph:${kind}`, kind: 'action', lane: LANE, timeout: 150000, settle: 400,
      title: `[kind ${kind}] I-05 A-play-telegraph: every attack telegraphs 0.45-0.9 s before its strike; held lamp >= 1.5x flicker mean; glint on the striking end; hue within 6 of #FF2D8C; no orphan telegraphs`, assert: A_PLAY_TELEGRAPH(kind) },
    { id: `A-ip-emissive:${kind}`, kind: 'action', lane: LANE, timeout: 150000, settle: 400,
      title: `[kind ${kind}] I-07 A-ip-emissive: calm/wary/hostile at 15 and 40 m, emissive-only: <= 0.5 % within dE 20 of the five; hostile 15 m emissive <= 1.5 % of the silhouette`, assert: A_IP_EMISSIVE(kind) },
    { id: `A-hull-value:${kind}`, kind: 'action', lane: LANE, timeout: 150000, settle: 400,
      title: `[kind ${kind}] I-03 A-hull-value: 13:00 and 18:45 hull value range, hot pixels, dark foot band, verdigris, backlit edge`, assert: A_HULL_VALUE(kind) },
  );
}

/* the lane's own films (read against reference before the judge; V rows of the block are judged too) */
const FILMS = [
  ['V-ia-closeup-tiller-golden', 'tiller', { hour: 18.2, dist: 7.5, yaw: 0.8, camH: 0.45, fov: 42 }, 'The Tiller at golden hour, three-quarter front at 7.5 m: glazed bone hull with crazing highlights, oxblood bands, bronze gimbals with verdigris in the crevices, dark graphite joints, the vernier ring on the drum and the "06" serial readable, dust on the stilts; the drum lamp a lit lamp glass in a dark bezel lighting the drum face. FAIL if it reads as flat-shaded plastic or a toy.'],
  ['V-ia-closeup-plumb-golden', 'plumb', { hour: 18.2, dist: 7.5, yaw: 0.6, camH: 0.5, lookH: 0.55, fov: 42 }, 'The Plumb at golden hour at 7.5 m: three levelling-staff legs (vermilion/white E pattern, black ticks), bronze tripod head and tribrach screws, the celadon lamp drum with the telescope on its standards and the glowing level vial on top, the bronze bob hanging on its cable. Reads at once as a walking theodolite. FAIL if it reads as an animal or a camera tripod toy.'],
  ['V-ia-closeup-peg-golden', 'peg', { hour: 18.2, dist: 3.2, yaw: 0.9, camH: 0.6, lookH: 0.45, fov: 40 }, 'The Peg at golden hour at 3.2 m: a glazed churn on four short bronze legs, the mallet arm on its back, peg racks on the flanks, the lamp under its visor at the front. Reads as a small field tool, designed, not primitive. FAIL if it reads as a creature (head, face, eye) or as untextured primitives.'],
  ['V-ia-plumb-noon-hostile', 'plumb', { hour: 13, dist: 9, yaw: 0.3, state: 'alert', camH: 0.4, fov: 45 }, 'The Plumb hostile at noon: magenta pinhole in the drum lamp lighting the drum face, the vial glowing, the hull lit by the sun; no glow ball. FAIL on a red eye or a face read.'],
];
for (const [id, kind, o, crit] of FILMS) {
  GATES.push({ id, kind: 'visual', lane: FILM, timeout: 150000, settle: 1600, setup: FILM_SETUP(kind, o),
    title: `${kind} film: ${id}`, criteria: `${crit} IP-clause: FAIL if the frame shows any element of the image IP list (ROUND5-LOOK §8); this clause outranks every likeness clause.` });
}

/* diagnosis only (lane ia-probe): what a Peg does after its rack is torn (A-linked-attack staging) */
const PROBE_LINKED = `(async () => {
  ${KIND_PRELUDE({ kind: 'peg' })}
  ${IA}
  const p0 = p.position;
  let m = __M.list.filter(x => x.alive && !x._disposed && x.kind === 'peg').sort((a, b) => a.position.distanceToSquared(p0) - b.position.distanceToSquared(p0))[0];
  const picked = m ? +Math.sqrt(m.position.distanceToSquared(p0)).toFixed(1) : null;
  const part = m.parts.find(q => q.attached && q.tearable && q.linkedAttack);
  part.mesh.updateWorldMatrix(true, false);
  const e = part.mesh.matrixWorld.elements;
  m.takeDamage({ point: { x: e[12], y: e[13], z: e[14] }, object: part.mesh, impact: 1, tear: 99999, element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'tear' });
  const log = [];
  let phases = 0; const on = (ev2) => { if (ev2.machine === m) phases++; };
  ev.on('machine-attack-phase', on);
  m.forceState('attack');
  for (let i = 0; i < 20; i++) {
    heal(); if (m.alive && m.state !== 'attack' && m.state !== 'stagger') m.forceState('attack');
    await wait(1000);
    log.push({ t: i, state: m.state, dist: +Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z).toFixed(1), atk: m._attack ? m._attack.kind : null, cd: +m.sc._attackCd.toFixed(2), unseen: +m.sc._unseenT.toFixed(1), leash: m.ai?.engage?.leashed?.() ?? null, mode: m.ai?.engage?.mode ?? null, phases });
  }
  ev.off?.('machine-attack-phase', on);
  return { pass: null, detail: { picked, torn: !part.attached, log } };
})()`;
GATES.push({ id: 'P-linked-peg', kind: 'action', lane: 'ia-probe', timeout: 60000, settle: 400, title: 'diagnosis: Peg after its rack is torn', assert: PROBE_LINKED });

export { GATES };
