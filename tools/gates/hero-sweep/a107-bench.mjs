/**
 * M1a round 2 (hero-anim) — A107's offline bench: the kept row `A107-draw-arm-path` (tools/gates.r5.melee.mjs) as
 * the page runs it, on the sweep's dressed bench (`bench.mjs makeBench({ melee: true })`): from idle, a jog and a
 * sprint, five draw -> holster cycles and one AIM stow (the guard, then the aim comes up: `p.aiming`, the bow drawn,
 * the quick holster), every frame the layer poses as 'draw' or 'holster' read with the row's own clauses:
 *   (a) elbow.y <= head.y + 0.05 m; (b) elbow no more than 0.10 m behind the head bone's frontal plane on every
 *   frame where the elbow is above the shoulder joint or (within 0.12 m under it and the layer's w >= 0.5);
 *   (c) the right forearm >= 0.05 m off the back half of the head ellipsoid.
 * Plus the holster's first step (the pop): the largest one-step move of the right elbow in the first four steps of
 * every holster, character metres, relative to the shoulder joint. Not a gate: the gate is the page row.
 *
 *   node tools/gates/hero-sweep/a107-bench.mjs [--modes idle,jog,sprint] [--trace]
 */
import { makeBench, step, reset, SPEEDS } from './bench.mjs';
import { THREE } from './load.mjs';

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const TRACE = args.includes('--trace');

export async function runA107(R, { modes = ['idle', 'jog', 'sprint'], trace = false } = {}) {
  const { player: p, an, model } = R;
  const M = R.melee;
  const inv = new THREE.Matrix4();
  const wE = new THREE.Vector3(), wH = new THREE.Vector3(), wS = new THREE.Vector3(), wW = new THREE.Vector3();
  const wQ = new THREE.Vector3(), wU = new THREE.Vector3();
  const read = () => {
    model.updateWorldMatrix(true, true);
    inv.copy(model.matrixWorld).invert();
    an.b.loArmR.bone.getWorldPosition(wE).applyMatrix4(inv);
    an.b.head.bone.getWorldPosition(wH).applyMatrix4(inv);
    an.b.upArmR.bone.getWorldPosition(wS).applyMatrix4(inv);
    an.b.handR.bone.getWorldPosition(wW).applyMatrix4(inv);
    let back = 9;
    an._headFrame();
    for (let i = 0; i <= 10; i++) {
      wQ.copy(wE).lerp(wW, i / 10);
      an._headUnit(wQ, wU);
      const L = wU.length();
      if (L < 1e-6) { back = Math.min(back, -0.1); continue; }
      const g = (L - 1) * Math.hypot(wU.x / L * 0.105, wU.y / L * 0.135, wU.z / L * 0.115);
      if (wU.z < 0 && g < back) back = g;
    }
    return { over: wE.y - wH.y, behind: wH.z - wE.z, aboveSh: wE.y - wS.y, back, e: wE.clone().sub(wS) };
  };
  let move = 0;
  const go = () => {
    if (!move) { p.velocity.set(0, 0, 0); p.moveSpeed = 0; return; }
    p.velocity.set(Math.sin(p.heading) * move, 0, Math.cos(p.heading) * move); p.moveSpeed = move;
  };
  const st1 = () => { go(); step(R); };
  const out = [];
  for (const mode of modes) {
    reset(R);
    move = mode === 'idle' ? 0 : mode === 'jog' ? SPEEDS.jog : SPEEDS.sprint;
    p.sprinting = mode === 'sprint';
    for (let i = 0; i < (move ? 84 : 18); i++) st1();
    for (let cyc = 0; cyc < 6; cyc++) {
      const aimStow = cyc === 5;
      const s = { mode, cycle: aimStow ? 'aim-stow' : cyc + 1, frames: 0, band: 0, overMax: -9, behindBandMax: -9, behindAt: null, backMin: 9, pop: 0, popAt: null, aimWMax: 0 };
      const take = (phase, k) => {
        const r = read();
        s.frames++;
        if (r.over > s.overMax) s.overMax = r.over;
        if (r.back < s.backMin) s.backMin = r.back;
        const w = an.melee?._dbg?.w ?? 0;
        if (r.aboveSh > 0 || (r.aboveSh > -0.12 && w >= 0.5)) {
          s.band++;
          if (r.behind > s.behindBandMax) { s.behindBandMax = r.behind; s.behindAt = `${phase} k${k} w${w.toFixed(2)} aboveSh ${r.aboveSh.toFixed(3)}`; }
        }
        if (trace) console.log(mode, s.cycle, phase, k, 'behind', r.behind.toFixed(3), 'aboveSh', r.aboveSh.toFixed(3), 'w', w.toFixed(2), 'aimW', (an._aimW ?? 0).toFixed(2), 'drawK', (an.melee?._dbg?.drawK ?? 0).toFixed(2));
        return r;
      };
      M.drawLance(); M._keyGuard = true;   // (as the KeyB press does: a sprint does not stow a keyed guard)
      let k = 0;
      for (let i = 0; i < 120; i++) { st1(); if (an.melee?._dbg?.stance === 'draw') take('draw', k++); if (M.stance === 'ready') break; }
      for (let i = 0; i < 8; i++) st1();
      const drew = M.stance === 'ready';
      let prevE = read().e;
      if (aimStow) { p.aiming = true; p.camYaw = p.heading + Math.PI; R.combat.weaponDrawn = 'bow'; } else M.holsterLance();
      k = 0;
      for (let i = 0; i < 150; i++) {
        st1();
        s.aimWMax = Math.max(s.aimWMax, an._aimW ?? 0);
        const d = an.melee?._dbg;
        if (d?.stance === 'holster') {
          const r = take('holster', k);
          if (k < 4) { const m = r.e.distanceTo(prevE); if (m > s.pop) { s.pop = m; s.popAt = k; s.popFar = an.melee._dbg.elbowSettleFar || 0; s.popSettle = an.melee._dbg.elbowSettle; } }
          prevE = r.e; k++;
        } else prevE = read().e;
        if (M.stance === 'holstered' && d?.stance !== 'holster') break;
      }
      if (aimStow) { p.aiming = false; R.combat.weaponDrawn = false; }
      for (let i = 0; i < 10; i++) st1();
      const fails = [];
      if (!drew || s.frames < 6) fails.push('did not play');
      if (!(s.overMax <= 0.05)) fails.push('elbow over head ' + s.overMax.toFixed(3));
      if (s.band && !(s.behindBandMax <= 0.10)) fails.push('elbow behind head ' + s.behindBandMax.toFixed(3));
      if (!(s.backMin >= 0.05)) fails.push('forearm on the back of the head ' + s.backMin.toFixed(3));
      out.push({ ...s, overMax: +s.overMax.toFixed(3), behindBandMax: s.band ? +s.behindBandMax.toFixed(3) : null, backMin: +s.backMin.toFixed(3), pop: +s.pop.toFixed(3), aimWMax: +s.aimWMax.toFixed(2), fails });
    }
    p.sprinting = false; move = 0;
  }
  return out;
}

async function main() {
  const R = await makeBench({ melee: true });
  const modes = flag('--modes') ? flag('--modes').split(',') : undefined;
  const rows = await runA107(R, { modes, trace: TRACE });
  let bad = 0;
  for (const r of rows) {
    if (r.fails.length) bad++;
    console.log(`${r.mode.padEnd(6)} ${String(r.cycle).padEnd(8)} frames ${r.frames} band ${r.band} over ${r.overMax} behindBand ${r.behindBandMax} (${r.behindAt}) backMin ${r.backMin} pop ${r.pop}@${r.popAt}${TRACE ? ` far ${r.popFar} settle ${r.popSettle}` : ''} aimW ${r.aimWMax} ${r.fails.length ? 'FAIL ' + r.fails.join('; ') : 'pass'}`);
  }
  console.log(`${rows.length} cycles, ${bad} fail`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
