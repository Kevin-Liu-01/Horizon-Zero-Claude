/**
 * M1a cloth step 1 (cloth lane): the cloth rows of the brief (C2-C11), in Node, on Brea dressed (`bench.mjs`), at
 * 60 Hz of sim time, graded on the RENDERED cloth: every panel's and the tail's vertices CPU-skinned
 * (`SkinnedMesh.getVertexPosition`, three's own skinning), so today's chains (`--mode 0`, the C0 baseline) and the grid
 * solver (`--mode 2`, `?cloth=2`) are read the same way. Particle rows (stretch, tongues, sleep, digests, the ring
 * buffer's timing) exist only on the grid solver and are reported as n/a on mode 0.
 *
 *   node tools/gates/hero-sweep/cloth-bench.mjs --mode 0|2 [--rows C2,C3,C4,C5,C6,C7,C8,C9,C10,C11|all] [--json out.json]
 *
 * Definitions (the brief's 4.2, as this file reads them):
 *  - a panel's CHORD runs from its belt row (bind vertices within 3 cm of its top) to its hem (bind vertices within
 *    6 cm of its lowest point), centroids; the tail's from below its wrung root (its vertices within 4 cm of the
 *    chain's fourth point) to its tip (its lowest 12 % by bind height, both tongues);
 *  - PLUMB is world down; LIFT in wind is the chord's angle from plumb less the same panel's in still air, standing;
 *  - her frame: forward f = (sin h, 0, cos h) for heading h, the knee plane through the forward-most knee joint;
 *  - wind bearings are relative to her heading: 0 = from her front.
 * Nothing here writes inside the repo except with --json to a path you name.
 */
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MODE = Number(flag('--mode', 2));
globalThis.__CALIMA_CLOTH = MODE;
const { makeBench, step, reset, SPEEDS } = await import('./bench.mjs');
const THREE = await import('three');
const { writeFileSync } = await import('fs');
const { peekClothRig } = await import('../../../src/entities/anim/cloth/rig.js');

const hr = () => Number(process.hrtime.bigint()) / 1e6;
globalThis.__clothClock = hr;
const ROWS = (flag('--rows', 'all') === 'all' ? 'C2,C3,C4,C5,C6,C7,C8,C9,C10,C11' : flag('--rows')).split(',');
const deg = (r) => r * 180 / Math.PI;

/* ------------------------------------------------------------------ the rendered cloth's vertex sets (at bind) */
export function clothProbe(R) {
  const { model } = R;
  let outfit = null, wrap = null;
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (/outfit/.test(o.userData?.heroPart || '') && o.name !== 'Caster' && o.material?.name !== 'hero-caster') outfit = outfit || o;
    if (/HairWrap/.test(o.name)) wrap = o;
  });
  const sets = {};
  const byWeight = (mesh, stem, min) => {
    const bn = mesh.skeleton.bones.map((b) => b.name), si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
    const pos = mesh.geometry.attributes.position, out = [];
    for (let i = 0; i < pos.count; i++) {
      let w = 0; for (let k = 0; k < 4; k++) if ((bn[si.getComponent(i, k)] || '').startsWith(stem)) w += sw.getComponent(i, k);
      if (w >= min) out.push({ i, g: new THREE.Vector3().fromBufferAttribute(pos, i) });
    }
    return out;
  };
  for (const stem of ['dyn_panelL', 'dyn_panelR', 'dyn_panelB']) {
    const V = byWeight(outfit, stem, 0.3);
    let y0 = -9, y1 = 9; for (const v of V) { y0 = Math.max(y0, v.g.y); y1 = Math.min(y1, v.g.y); }
    const th = (g) => Math.atan2(g.z + 0.02, g.x);
    let t0 = 9, t1 = -9; for (const v of V) { t0 = Math.min(t0, th(v.g)); t1 = Math.max(t1, th(v.g)); }
    const top = V.filter((v) => v.g.y >= y0 - 0.03).map((v) => v.i);
    const hemV = V.filter((v) => v.g.y <= y1 + 0.06);
    const hem = hemV.map((v) => v.i);
    // the hem's corners (its outer thirds) and three columns (thirds by bearing)
    const sOf = (v) => (th(v.g) - t0) / (t1 - t0);
    const hemL = hemV.filter((v) => sOf(v) < 0.33).map((v) => v.i), hemR = hemV.filter((v) => sOf(v) > 0.67).map((v) => v.i);
    // rows: 6 bands down the panel, each band's vertices (for the row's non-planarity)
    const rows = [];
    for (let k = 1; k <= 5; k++) { const y = y0 + (y1 - y0) * k / 6; rows.push(V.filter((v) => Math.abs(v.g.y - y) < 0.02).map((v) => v.i)); }
    // a column's path: the centre third's vertices sorted by height, in 8 bands
    const colBands = [];
    for (let k = 0; k <= 8; k++) { const y = y0 + (y1 - y0) * k / 8; const b = V.filter((v) => Math.abs(v.g.y - y) < 0.025 && sOf(v) > 0.35 && sOf(v) < 0.65).map((v) => v.i); if (b.length) colBands.push(b); }
    sets[stem.slice(4)] = { mesh: outfit, top, hem, hemL, hemR, rows, colBands, all: V.map((v) => v.i), front: stem !== 'dyn_panelB' };
  }
  {
    const V = byWeight(wrap, 'dyn_wrapSash', 0.3);
    const bones = wrap.skeleton.bones, inv = wrap.skeleton.boneInverses;
    // (the chord is read below the wrung root, as C2 asks: from the chain's fourth point, dyn_wrapSash_04)
    const k0 = bones.findIndex((b) => b.name === 'dyn_wrapSash_04');
    const knot = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(inv[k0]).invert());
    let y1 = 9, y0 = -9; for (const v of V) { y1 = Math.min(y1, v.g.y); y0 = Math.max(y0, v.g.y); }
    const top = V.filter((v) => v.g.distanceTo(knot) < 0.05).map((v) => v.i);
    const hem = V.filter((v) => v.g.y <= y1 + 0.12 * (y0 - y1)).map((v) => v.i);
    sets.wrapSash = { mesh: wrap, top, hem, all: V.map((v) => v.i), tail: true };
  }
  const v = new THREE.Vector3();
  const cen = (mesh, idx, out) => { out.set(0, 0, 0); for (const i of idx) { mesh.getVertexPosition(i, v); mesh.localToWorld(v); out.add(v); } return out.divideScalar(Math.max(1, idx.length)); };
  return { sets, cen, v };
}

/* ------------------------------------------------------------------ per-frame reads */
function frameRead(R, PR) {
  const p = R.player, h = p.heading, f = new THREE.Vector3(Math.sin(h), 0, Math.cos(h)), r = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h));
  const out = { t: R.t, f, r, pos: p.position.clone(), pieces: {} };
  R.model.updateMatrixWorld(true);
  const T = new THREE.Vector3(), H = new THREE.Vector3();
  for (const [k, S] of Object.entries(PR.sets)) {
    PR.cen(S.mesh, S.top, T); PR.cen(S.mesh, S.hem, H);
    const c = H.clone().sub(T), len = c.length();
    const ang = Math.acos(Math.max(-1, Math.min(1, -c.y / len)));
    out.pieces[k] = { T: T.clone(), H: H.clone(), ang, fwd: Math.atan2(c.dot(f), -c.y), lat: Math.atan2(c.dot(r), -c.y), len };
  }
  const kn = (b) => b.getWorldPosition(new THREE.Vector3());
  out.kneeF = Math.max(kn(R.an.b.calfL.bone).sub(p.position).dot(f), kn(R.an.b.calfR.bone).sub(p.position).dot(f));
  out.pelvis = kn(R.an.b.pelvis.bone);
  return out;
}
const fwdOf = (R) => { const h = R.player.heading; return new THREE.Vector3(Math.sin(h), 0, Math.cos(h)); };
/* her travel as player.js runs it: the velocity damped toward the wish at 5.5 /s (THREE.MathUtils.damp), so a stop
 * from a sprint takes ~0.2 s to halve, not one frame */
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const go = (R, speed) => { const p = R.player; p.velocity.x = damp(p.velocity.x, Math.sin(p.heading) * speed, 5.5, 1 / 60); p.velocity.z = damp(p.velocity.z, Math.cos(p.heading) * speed, 5.5, 1 / 60); p.moveSpeed = Math.hypot(p.velocity.x, p.velocity.z); };
const still = (R) => go(R, 0);
const setWindRel = (R, relDeg, speed) => {
  // wind blowing FROM `relDeg` relative to her facing (0 = from her front), toward her
  const h = R.player.heading + relDeg * Math.PI / 180;
  R.an.wind.x = -Math.sin(h) * speed; R.an.wind.z = -Math.cos(h) * speed;
};
const SOLVER = flag('--solver') ? JSON.parse(flag('--solver')) : null;
const rig = (R) => { const c = peekClothRig(R.an); if (c && SOLVER && !c._tuned) { Object.assign(c.sys, SOLVER); c._tuned = true; } return c; };
const clothReset = (R) => { R.model.updateMatrixWorld(true); if (MODE === 2) { rig(R); R.an.clothReset(R.t); } };

function staged(R, { crouch = false, sit = false, heading = 0, wind = [0, 0] } = {}) {
  reset(R);
  const p = R.player; p.heading = heading; p.crouching = crouch; if (sit) { p.riding = {}; p.grounded = false; }
  setWindRel(R, wind[0], wind[1]);
  for (let i = 0; i < 45; i++) step(R);
  clothReset(R);
}
function unstage(R) { const p = R.player; p.crouching = false; p.riding = null; p.grounded = true; R.an.setWind(45 * Math.PI / 180, 5.5); }

/* ------------------------------------------------------------------ particle reads (grid solver only) */
function stretch(R) {
  const C = rig(R); if (!C) return null;
  let edge = 0, path = 0;
  for (const P of C.pieces) {
    for (let c = 0; c < P.nc; c++) {
      if (P.ca[c] !== 0 || P.ck[c] !== 0) continue;
      const i = P.ci[c * 2], j = P.ci[c * 2 + 1];
      const d = Math.hypot(P.x[i * 3] - P.x[j * 3], P.x[i * 3 + 1] - P.x[j * 3 + 1], P.x[i * 3 + 2] - P.x[j * 3 + 2]);
      edge = Math.max(edge, d / P.cr[c]);
    }
    for (let col = 0; col < P.C; col++) {
      let L = 0, L0 = 0;
      for (let r = 1; r < P.R; r++) {
        const a = col + (r - 1) * P.C, b = col + r * P.C;
        L += Math.hypot(P.x[a * 3] - P.x[b * 3], P.x[a * 3 + 1] - P.x[b * 3 + 1], P.x[a * 3 + 2] - P.x[b * 3 + 2]);
        for (let c = 0; c < P.nc; c++) if ((P.ci[c * 2] === a && P.ci[c * 2 + 1] === b) || (P.ci[c * 2] === b && P.ci[c * 2 + 1] === a)) { L0 += P.cr[c]; break; }
      }
      if (L0 > 0) path = Math.max(path, L / L0);
    }
  }
  let scale = 0;
  for (const b of C.bones) scale = Math.max(scale, Math.abs(b.getWorldScale(new THREE.Vector3()).x / R.an.b.pelvis.bone.getWorldScale(new THREE.Vector3()).x - 1));
  return { edge, path, boneScaleDev: scale };
}
function tonguesCrossed(R) {
  const C = rig(R); if (!C) return null;
  const P = C.pieces.find((q) => q.kind === 'tail');
  // the tongues' lateral order: each split row's pair (column 1 minus column 0) against the last wrung row's pair, signed
  // as it was at bind (the root's frame); crossed = the order flipped
  const side = (X, r) => { const a = r * 2 * 3, b = a + 3, w = 3 * 2 * 3; return [(X[b] - X[a]) * (X[w + 3] - X[w]) + (X[b + 1] - X[a + 1]) * (X[w + 4] - X[w + 1]) + (X[b + 2] - X[a + 2]) * (X[w + 5] - X[w + 2])]; };
  P._bindSide ||= Array.from({ length: P.R }, (_, r) => Math.sign(side(P.q0, r)[0]));
  let crossed = 0;
  for (let r = 4; r < P.R; r++) if (Math.sign(side(P.x, r)[0]) !== P._bindSide[r]) crossed++;
  return crossed;
}
function maxSpeed(R) {
  const C = rig(R); if (!C) return null;
  let m = 0;
  for (const P of C.pieces) for (let i = 0; i < P.n; i++) if (P.w[i] !== 0) m = Math.max(m, Math.hypot(P.v[i * 3], P.v[i * 3 + 1], P.v[i * 3 + 2]));
  return m;
}

/* ------------------------------------------------------------------ the rows */
const out = { mode: MODE, rows: {} };
// (tuning: --mat '{"lined":{"kd":6}}' merges into the materials before the rig is built; --solver '{"iters":3}' into the
//  system after it is)
if (flag('--mat')) { const { MATERIALS } = await import('../../../src/entities/anim/cloth/materials.js'); for (const [k, v] of Object.entries(JSON.parse(flag('--mat')))) { const sh = v.share; Object.assign(MATERIALS[k], v); if (sh) MATERIALS[k].share = { ...MATERIALS[k].share, ...sh }; } }
const R = await makeBench();

const PR = clothProbe(R);
R.an.setWind(45 * Math.PI / 180, 5.5);
const rnd = (x, n = 3) => (x == null || !Number.isFinite(x) ? x : +x.toFixed(n));
const pieceNames = ['panelL', 'panelR', 'panelB', 'wrapSash'];

// C2: rest in still air, stand / crouch / sit. HELD: the body still (her pose frozen at the staging, the cloth alone
// stepped: what the row asks, "2 s after reset" in still air); IDLE: the idle running (her breath and weight shift move
// the pelvis 0.02-0.05 m/s: reported, the hem cannot be under 0.005 m/s in the world while the body under it moves)
if (ROWS.includes('C2')) {
  const res = {};
  for (const held of MODE === 2 ? [true, false] : [false]) for (const st of ['stand', 'crouch', 'sit']) {
    staged(R, { crouch: st === 'crouch', sit: st === 'sit' });
    const C = rig(R);
    const tr = []; let asleepAt = null, ms15 = 0;
    for (let i = 1; i <= 120; i++) {
      if (held) { R.t += 1 / 60; R.model.updateMatrixWorld(true); C.update(1 / 60, R.t, R.an.wind); }
      else step(R);
      tr.push(frameRead(R, PR));
      if (C && asleepAt == null && C.pieces.every((p) => p.asleep)) asleepAt = i / 60;
      if (i > 90 && C) ms15 = Math.max(ms15, maxSpeed(R));
    }
    const L = tr[tr.length - 1], Lp = tr[tr.length - 2];
    const r = {};
    for (const k of pieceNames) {
      // (the hem's speed relative to her root: the hem's place minus the belt row's, frame to frame)
      const rel = L.pieces[k].H.clone().sub(L.pieces[k].T).distanceTo(Lp.pieces[k].H.clone().sub(Lp.pieces[k].T)) * 60;
      r[k] = { angDeg: rnd(deg(L.pieces[k].ang), 1), fwdDeg: rnd(deg(L.pieces[k].fwd), 1), latDeg: rnd(deg(L.pieces[k].lat), 1), hemSpeed: rnd(L.pieces[k].H.distanceTo(Lp.pieces[k].H) * 60, 4), hemSpeedRel: rnd(rel, 4) };
    }
    r.asleepAt = asleepAt; r.maxSpeedAfter1p5 = C ? rnd(ms15, 4) : null;
    if (C) r.asleep = C.pieces.map((p) => p.asleep);
    res[(held ? 'held_' : 'idle_') + st] = r;
    unstage(R);
  }
  // sleep and wake: a piece put to sleep and woken moves no particle more than 1 mm
  if (MODE === 2) {
    staged(R, {});
    const C = rig(R);
    for (let i = 0; i < 150; i++) { R.t += 1 / 60; R.model.updateMatrixWorld(true); C.update(1 / 60, R.t, R.an.wind); }
    const snap = C.pieces.map((p) => Float64Array.from(p.x)), asleep = C.pieces.map((p) => p.asleep);
    R.an.wind.x = 0.5; R.t += 1 / 60; C.update(1 / 60, R.t, R.an.wind); R.an.wind.x = 0;
    let mv = 0; C.pieces.forEach((p, k) => { for (let i = 0; i < p.n * 3; i++) mv = Math.max(mv, Math.abs(p.x[i] - snap[k][i])); });
    res.sleepWake = { asleepBefore: asleep, wokeAll: C.pieces.every((p) => !p.asleep), moveM: rnd(mv, 5) };
    unstage(R);
  }
  out.rows.C2 = res;
}

// C4: run-stop (sprint, release)
if (ROWS.includes('C4')) {
  staged(R, {});
  R.an.setWind(0, 0);
  R.player.sprinting = true;
  for (let i = 0; i < 150; i++) { go(R, SPEEDS.sprint); step(R); }
  R.player.sprinting = false;
  const tr = [];
  for (let i = 0; i < 150; i++) { still(R); step(R); tr.push(frameRead(R, PR)); }
  const res = {};
  // the pelvis under 0.3 m/s
  let tStop = null;
  for (let i = 1; i < tr.length; i++) { const v = tr[i].pelvis.distanceTo(tr[i - 1].pelvis) * 60; if (tStop == null && v < 0.3) tStop = tr[i].t; }
  for (const k of pieceNames) {
    // the hem in her frame (forward, m) relative to its last value
    const f = tr.map((F) => F.pieces[k].H.clone().sub(F.pos).dot(F.f));
    const fin = f[f.length - 1];
    let peak = 0, peakT = null;
    for (let i = 0; i < f.length; i++) if (f[i] - fin > peak) { peak = f[i] - fin; peakT = tr[i].t; }
    let settle = null;
    for (let i = f.length - 1; i > 0; i--) { const d = Math.abs(f[i] - fin), v = Math.abs(f[i] - f[i - 1]) * 60; if (d > 0.01 || v > 0.02) { settle = tr[i].t - tr[0].t + 1 / 60; break; } }
    let cross = 0; for (let i = 1; i < f.length; i++) if ((f[i] - fin) * (f[i - 1] - fin) < 0 && Math.abs(f[i] - fin) + Math.abs(f[i - 1] - fin) > 0.01) cross++;
    res[k] = { overshootM: rnd(peak), peakAfterStopS: peakT != null && tStop != null ? rnd(peakT - tStop) : null, settleS: rnd(settle), crossings: cross };
  }
  res.stopS = tStop != null ? rnd(tStop - tr[0].t) : null;
  out.rows.C4 = res;
  unstage(R);
}

// C5: turn on the spot (180 deg in 0.5 s) and the 1.2 m landing
if (ROWS.includes('C5')) {
  const res = {};
  staged(R, {}); R.an.setWind(0, 0);
  for (let i = 0; i < 30; i++) step(R);
  const F0 = frameRead(R, PR);
  const bear0 = {};
  for (const k of pieceNames) { const d = F0.pieces[k].H.clone().sub(F0.pelvis); bear0[k] = Math.atan2(d.x, d.z) - R.player.heading; }
  const h0 = R.player.heading, tr = [];
  for (let i = 1; i <= 120; i++) {
    if (i <= 30) R.player.heading = h0 + Math.PI * (i / 30);
    step(R); tr.push(frameRead(R, PR));
  }
  for (const k of pieceNames) {
    let peak = 0, settle = null;
    const lag = tr.map((F) => { const d = F.pieces[k].H.clone().sub(F.pelvis); let a = (R.player.heading - (h0 + Math.PI * Math.min(1, (F.t - tr[0].t + 1 / 60) * 2))) ; let b = Math.atan2(d.x, d.z) - bear0[k] - (h0 + Math.PI * Math.min(1, (F.t - tr[0].t + 1 / 60) * 2)); b = Math.atan2(Math.sin(b), Math.cos(b)); return deg(b); });
    for (const l of lag) if (Math.abs(l) > Math.abs(peak)) peak = l;
    for (let i = lag.length - 1; i >= 30; i--) if (Math.abs(lag[i]) > 2) { settle = (i + 1 - 30) / 60; break; }
    res['turn_' + k] = { peakLagDeg: rnd(peak, 1), settleAfterTurnS: settle ?? 0 };
  }
  unstage(R);
  // landing: a fall from 1.2 m (free fall, 0.49 s), then the landing
  staged(R, {}); R.an.setWind(0, 0);
  const p = R.player, ev = R.ctx.events;
  const base = frameRead(R, PR);
  p.position.y = 1.2; R.model.position.y = 1.2; for (let i = 0; i < 2; i++) step(R);
  clothReset(R);
  for (let i = 0; i < 30; i++) step(R);
  const pre = frameRead(R, PR);
  ev?.emit?.('player-jump', { v0: 0 }); p.grounded = false;
  const trl = []; let vy = 0;
  for (let i = 0; i < 200; i++) {
    if (!p.grounded) { vy -= 9.81 / 60; p.velocity.set(0, vy, 0); if (p.position.y + vy / 60 <= 0) { p.velocity.set(0, 0, 0); p.position.y = 0; p.grounded = true; ev?.emit?.('player-land', { fall: 1.2 }); trl.landI = i; } }
    else p.velocity.set(0, 0, 0);
    step(R); trl.push(frameRead(R, PR));
  }
  for (const k of pieceNames) {
    const a0 = deg(pre.pieces[k].ang);
    let rise = 0; for (let i = 0; i < trl.landI; i++) rise = Math.max(rise, deg(trl[i].pieces[k].ang) - a0);
    const yRel = trl.map((F) => F.pieces[k].H.y - F.pos.y);
    const fin = yRel[yRel.length - 1];
    let under = 0; for (let i = trl.landI; i < yRel.length; i++) under = Math.min(under, yRel[i] - fin);
    let settle = null; for (let i = yRel.length - 1; i > trl.landI; i--) if (Math.abs(yRel[i] - fin) > 0.01 || Math.abs(yRel[i] - yRel[i - 1]) * 60 > 0.02) { settle = (i - trl.landI) / 60; break; }
    res['land_' + k] = { riseInFallDeg: rnd(rise, 1), overshootDownM: rnd(under), settleS: settle ?? 0 };
  }
  out.rows.C5 = res;
  unstage(R);
}

// C6: the wind table, standing
if (ROWS.includes('C6')) {
  const res = {};
  const meanRun = (wrel, speed) => {
    staged(R, { wind: [wrel, speed] });
    for (let i = 0; i < 60; i++) step(R);
    const acc = {}; const N = 180; let maxA = {};
    for (let i = 0; i < N; i++) {
      step(R); const F = frameRead(R, PR);
      for (const k of pieceNames) { const q = F.pieces[k]; (acc[k] ||= { H: new THREE.Vector3(), ang: 0 }); acc[k].H.add(q.H.clone().sub(F.pos)); acc[k].ang += q.ang; maxA[k] = Math.max(maxA[k] || 0, q.ang); }
    }
    for (const k in acc) { acc[k].H.divideScalar(N); acc[k].ang /= N; acc[k].max = maxA[k]; }
    unstage(R);
    return acc;
  };
  const calm = meanRun(0, 0);
  for (const wrel of [0, 90, 180, 270]) for (const sp of [2.5, 5.5, 9]) {
    const m = meanRun(wrel, sp);
    // downwind in the world: the wind blows from wrel toward her
    const h = R.player.heading + wrel * Math.PI / 180, dw = new THREE.Vector3(-Math.sin(h), 0, -Math.cos(h));
    const row = {};
    for (const k of pieceNames) {
      const d = m[k].H.clone().sub(calm[k].H); d.y = 0;
      const moved = d.length();
      const off = moved > 1e-6 ? deg(Math.acos(Math.max(-1, Math.min(1, d.dot(dw) / moved)))) : null;
      row[k] = { liftDeg: rnd(deg(m[k].ang - calm[k].ang), 1), maxAngDeg: rnd(deg(m[k].max), 1), hemMoveM: rnd(moved), offDownwindDeg: off == null ? null : rnd(off, 0) };
    }
    res[`from${wrel}_${sp}`] = row;
  }
  res.calm = Object.fromEntries(pieceNames.map((k) => [k, rnd(deg(calm[k].ang), 1)]));
  out.rows.C6 = res;
}

// C8: run and sprint; C7's chord/path in motion; C9 tongues; C3 stretch
const motion = {};
if (ROWS.includes('C8') || ROWS.includes('C3') || ROWS.includes('C9') || ROWS.includes('C7')) {
  for (const [name, speed, sprint] of [['run', SPEEDS.jog, false], ['sprint', SPEEDS.sprint, true]]) {
    staged(R, {});
    R.player.sprinting = sprint;
    for (let i = 0; i < 90; i++) { go(R, speed); step(R); }
    const tr = []; let st = { edge: 0, path: 0, boneScaleDev: 0 }, crossed = 0;
    for (let i = 0; i < 240; i++) {
      go(R, speed); step(R); const F = frameRead(R, PR); tr.push(F);
      const s = stretch(R); if (s) { st.edge = Math.max(st.edge, s.edge); st.path = Math.max(st.path, s.path); st.boneScaleDev = Math.max(st.boneScaleDev, s.boneScaleDev); }
      const c = tonguesCrossed(R); if (c) crossed++;
    }
    R.player.sprinting = false;
    const r = { stretch: MODE === 2 ? { edge: rnd(st.edge, 4), path: rnd(st.path, 4), boneScaleDev: rnd(st.boneScaleDev, 5) } : null, tonguesCrossedFrames: MODE === 2 ? crossed : null };
    // front hems against the knee plane (every hem vertex), and the chords
    for (const k of pieceNames) {
      const S = PR.sets[k];
      let ahead = 0, maxAhead = -9;
      if (S.front) for (const F of tr) {
        // (the hem's centroid, forward of the knee plane)
        const m = F.pieces[k].H.clone().sub(F.pos).dot(F.f) - F.kneeF;
        if (m > 0.05) ahead++; maxAhead = Math.max(maxAhead, m);
      }
      const fwd = tr.map((F) => deg(F.pieces[k].fwd)), ang = tr.map((F) => deg(F.pieces[k].ang));
      // flutter: the hem's place in her frame (pelvis-relative), detrended, RMS and its peak frequency
      const xs = tr.map((F) => { const d = F.pieces[k].H.clone().sub(F.pelvis); return [d.dot(F.f), d.y, d.dot(F.r)]; });
      const mean = [0, 0, 0]; for (const x of xs) for (let a = 0; a < 3; a++) mean[a] += x[a] / xs.length;
      let rms = 0; for (const x of xs) rms += (x[0] - mean[0]) ** 2 + (x[1] - mean[1]) ** 2 + (x[2] - mean[2]) ** 2; rms = Math.sqrt(rms / xs.length);
      let best = 0, bestF = 0;
      for (let fq = 0.5; fq <= 10; fq += 0.25) { let re = 0, im = 0; for (let i = 0; i < xs.length; i++) { const s = xs[i][0] - mean[0] + xs[i][1] - mean[1]; re += s * Math.cos(2 * Math.PI * fq * i / 60); im += s * Math.sin(2 * Math.PI * fq * i / 60); } const p = re * re + im * im; if (p > best) { best = p; bestF = fq; } }
      // consecutive strides: the stride period as the hem signal's own autocorrelation peak in 0.4-1.2 s
      let bestLag = 0, bestC = -9;
      for (let L = 24; L <= 72; L++) { let c = 0; for (let i = 0; i + L < xs.length; i++) c += (xs[i][1] - mean[1]) * (xs[i + L][1] - mean[1]) + (xs[i][0] - mean[0]) * (xs[i + L][0] - mean[0]); if (c > bestC) { bestC = c; bestLag = L; } }
      let sr = 0, sn = 0; for (let i = 0; i + bestLag < xs.length; i++) { sr += (xs[i][0] - xs[i + bestLag][0]) ** 2 + (xs[i][1] - xs[i + bestLag][1]) ** 2 + (xs[i][2] - xs[i + bestLag][2]) ** 2; sn++; }
      r[k] = {
        fwdLiftMaxDeg: rnd(Math.max(...fwd), 1), angMeanDeg: rnd(ang.reduce((a, b) => a + b, 0) / ang.length, 1), angMaxDeg: rnd(Math.max(...ang), 1),
        aheadOfKneeFrac: S.front ? rnd(ahead / tr.length, 3) : null, aheadOfKneeMaxM: S.front ? rnd(maxAhead) : null,
        flutterRmsM: rnd(rms, 4), flutterPeakHz: bestF, strideS: rnd(bestLag / 60), strideRepeatRmsM: rnd(Math.sqrt(sr / Math.max(1, sn)), 4),
      };
    }
    motion[name] = r;
    unstage(R);
  }
  out.rows.C8 = motion;
}

// C7: not a board (crouch, sit, 5.5 m/s wind): rows' non-planarity on the rendered vertices, hem twist, chord / path
if (ROWS.includes('C7')) {
  const res = {};
  const v = new THREE.Vector3();
  const rowRms = (mesh, idx) => {
    if (idx.length < 3) return null;
    const P = idx.map((i) => { mesh.getVertexPosition(i, v); mesh.localToWorld(v); return v.clone(); });
    const c = P.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(P.length);
    // best line: the principal axis (power iteration)
    let e = new THREE.Vector3(1, 0, 0);
    for (let it = 0; it < 30; it++) { const n = new THREE.Vector3(); for (const q of P) { const d = q.clone().sub(c); n.addScaledVector(d, d.dot(e)); } if (n.lengthSq() < 1e-14) break; e = n.normalize(); }
    let s = 0; for (const q of P) { const d = q.clone().sub(c); d.addScaledVector(e, -d.dot(e)); s += d.lengthSq(); }
    return Math.sqrt(s / P.length);
  };
  for (const [name, opt] of [['crouch', { crouch: true }], ['sit', { sit: true }], ['wind5.5', { wind: [180, 5.5] }], ['wind5.5side', { wind: [90, 5.5] }]]) {
    staged(R, opt);
    if (opt.wind) setWindRel(R, opt.wind[0], opt.wind[1]);
    const r = {};
    const tw = {}, rr = {}, cp = {};
    for (let i = 0; i < 120; i++) {
      step(R);
      if (i < 60) continue;
      R.model.updateMatrixWorld(true);
      for (const k of ['panelL', 'panelR', 'panelB']) {
        const S = PR.sets[k];
        let m = 0; for (const row of S.rows) { const q = rowRms(S.mesh, row); if (q != null) m = Math.max(m, q); }
        (rr[k] ||= []).push(m);
        // twist: the hem's across (left corner -> right corner) against the belt row's, about the vertical
        const a = PR.cen(S.mesh, S.hemL, new THREE.Vector3()), b = PR.cen(S.mesh, S.hemR, new THREE.Vector3());
        const tl = PR.cen(S.mesh, S.top.slice(0, Math.ceil(S.top.length / 3)), new THREE.Vector3()), trr = PR.cen(S.mesh, S.top.slice(-Math.ceil(S.top.length / 3)), new THREE.Vector3());
        const h1 = Math.atan2(b.x - a.x, b.z - a.z), h0 = Math.atan2(trr.x - tl.x, trr.z - tl.z);
        (tw[k] ||= []).push(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0)));
        // chord / path down the centre column
        let path = 0, prev = null; for (const band of S.colBands) { const q = PR.cen(S.mesh, band, new THREE.Vector3()); if (prev) path += q.distanceTo(prev); prev = q; }
        const ch = PR.cen(S.mesh, S.colBands[0], new THREE.Vector3()).distanceTo(PR.cen(S.mesh, S.colBands[S.colBands.length - 1], new THREE.Vector3()));
        (cp[k] ||= []).push(ch / path);
      }
    }
    for (const k of ['panelL', 'panelR', 'panelB']) {
      const m = tw[k].reduce((a, b) => a + b, 0) / tw[k].length;
      const twRms = Math.sqrt(tw[k].reduce((a, b) => a + (b - m) ** 2, 0) / tw[k].length);
      r[k] = { rowRmsMm: rnd(1000 * rr[k].reduce((a, b) => a + b, 0) / rr[k].length, 2), hemTwistMeanDeg: rnd(deg(m), 1), hemTwistRmsDeg: rnd(deg(twRms), 2), chordOverPathMin: rnd(Math.min(...cp[k]), 4) };
    }
    res[name] = r;
    unstage(R);
  }
  out.rows.C7 = res;
}

// C10: cost (ring-buffer timing, grid solver), 600 frames standing in the trade wind and 600 at a sprint; asleep
if (ROWS.includes('C10') && MODE === 2) {
  const res = {};
  staged(R, { wind: [135, 5.5] });
  const C = rig(R);
  const take = () => { C.sys.ringN = 0; C.sys.ringI = 0; };
  take();
  for (let i = 0; i < 600; i++) step(R);
  res.standTrade = C.sys.timing(); unstage(R);
  staged(R, {}); R.player.sprinting = true; take();
  for (let i = 0; i < 600; i++) { go(R, SPEEDS.sprint); step(R); }
  res.sprint = C.sys.timing(); R.player.sprinting = false; unstage(R);
  staged(R, {}); R.an.setWind(0, 0);
  for (let i = 0; i < 120; i++) step(R);
  take(); for (let i = 0; i < 600; i++) step(R);
  res.asleepStill = { ...C.sys.timing(), asleep: C.pieces.map((p) => p.asleep) }; unstage(R);
  for (const k in res) for (const q of ['mean', 'p50', 'p95', 'max']) if (res[k]?.[q] != null) res[k][q] = rnd(res[k][q], 4);
  res.particles = C.pieces.reduce((a, p) => a + p.n, 0); res.pinned = C.pieces.reduce((a, p) => a + p.n - p.bones.length, 0); res.clBones = C.bones.length;
  res.joints = {}; R.model.traverse((o) => { if (o.isSkinnedMesh) res.joints[o.name] = o.skeleton.bones.length; });
  out.rows.C10 = res;
}

// C11: repeatable: the same staging three times on fresh rigs (digest per frame); the reset after a history at the
// same pose; the nudge standing (graded) and after a sprint (reported)
if (ROWS.includes('C11') && MODE === 2) {
  const res = {};
  const seq = async (pre) => {
    const Q = await makeBench();
    Q.an.setWind(45 * Math.PI / 180, 5.5);
    if (pre) { Q.player.sprinting = true; for (let i = 0; i < 120; i++) { go(Q, SPEEDS.sprint); step(Q); } Q.player.sprinting = false; for (let i = 0; i < 30; i++) { go(Q, SPEEDS.jog); step(Q); } }
    reset(Q);
    const ds = [];
    Q.an.clothReset(Q.t); ds.push(Q.an.clothDigest());
    for (let i = 0; i < 120; i++) { go(Q, SPEEDS.jog); step(Q); }
    ds.push(Q.an.clothDigest());
    for (let i = 0; i < 60; i++) { still(Q); step(Q); }
    ds.push(Q.an.clothDigest());
    return { Q, ds };
  };
  const a = await seq(false), b = await seq(false), c = await seq(false);
  res.threeStagings = { digests: [a.ds, b.ds, c.ds], identical: JSON.stringify(a.ds) === JSON.stringify(b.ds) && JSON.stringify(b.ds) === JSON.stringify(c.ds) };
  // a history, then the reset at a pose copied from a clean rig: the cloth's state after reset must not carry it
  {
    const save = (Q) => { const s = []; Q.model.traverse((o) => { if (o.isBone && !o.name.startsWith('cl_')) s.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); }); return s; };
    const A = await makeBench(), B = await makeBench();
    for (const Q of [A, B]) Q.an.setWind(45 * Math.PI / 180, 5.5);
    for (let i = 0; i < 30; i++) step(A);
    B.player.sprinting = true; for (let i = 0; i < 150; i++) { go(B, SPEEDS.sprint); step(B); } B.player.sprinting = false;
    for (let i = 0; i < 30; i++) { still(B); step(B); }
    const sa = save(A), names = new Map(); B.model.traverse((o) => { if (o.isBone) names.set(o.name, o); });
    for (const [o, p, q, s] of sa) { const t = names.get(o.name); if (t) { t.position.copy(p); t.quaternion.copy(q); t.scale.copy(s); } }
    B.model.position.copy(A.model.position); B.model.rotation.copy(A.model.rotation);
    A.model.updateMatrixWorld(true); B.model.updateMatrixWorld(true);
    // (the stow kit's shaft capsule is the kit's: copy it too)
    if (A.an._stowCap && B.an._stowCap) { B.an._stowCap.a.copy(A.an._stowCap.a); B.an._stowCap.b.copy(A.an._stowCap.b); B.an._stowCap.on = A.an._stowCap.on; }
    // (step 2: the weapons lane now writes the prop capsules (stowBow, heldBow, heldLance): the clean rig's are copied too)
    { const { propCaps } = await import('../../../src/entities/anim/cloth/propCaps.js'); const pa = propCaps(A.an), pb = propCaps(B.an);
      for (const sa of pa.list) { const sb = pb[sa.name]; for (const k of ['a', 'b', 'pa', 'pb', 'va', 'vb']) Object.assign(sb[k], sa[k]); sb.on = sa.on; sb.r = sa.r; sb.primed = sa.primed; sb.set = sa.set; } }
    A.an.clothReset(0); B.an.clothReset(0);
    res.resetAfterHistory = { clean: A.an.clothDigest(), afterSprint: B.an.clothDigest(), identical: A.an.clothDigest() === B.an.clothDigest() };
  }
  // the nudge: 1e-4 m to every free particle, standing in still air, against the same run without it, after 1 s
  const nudge = async (sprintFirst) => {
    const run = async (dn) => {
      const Q = await makeBench(); Q.an.setWind(0, 0);
      reset(Q);
      if (sprintFirst) { Q.player.sprinting = true; for (let i = 0; i < 120; i++) { go(Q, SPEEDS.sprint); step(Q); } Q.player.sprinting = false; }
      else Q.an.clothReset(Q.t);
      const C = peekClothRig(Q.an);
      if (dn) for (const P of C.pieces) for (let i = 0; i < P.n; i++) if (P.w[i] !== 0) { P.x[i * 3] += 1e-4; P.x[i * 3 + 1] += 1e-4 * 0.5; P.x[i * 3 + 2] -= 1e-4 * 0.7; }
      for (let i = 0; i < 60; i++) { if (sprintFirst) go(Q, SPEEDS.sprint); step(Q); }
      return C.pieces.map((P) => Float64Array.from(P.x));
    };
    const x0 = await run(false), x1 = await run(true);
    let m = 0; x0.forEach((a, k) => { for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - x1[k][i])); });
    return m;
  };
  res.nudgeStanding1s = rnd(await nudge(false), 7);
  res.nudgeSprint1s = rnd(await nudge(true), 7);
  out.rows.C11 = res;
}

for (const [id, row] of Object.entries(out.rows)) for (const [k, v] of Object.entries(row)) console.log(id.padEnd(4), k.padEnd(18), JSON.stringify(v));
if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify(out, null, 1));
