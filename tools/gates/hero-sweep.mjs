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
import { buildSweep } from './hero-sweep/measure.mjs';

const HB = `
      const C = __CTX__, p = C.player, an = p.animator, cmb = C.combat, E = C.engine;
      const THREE = { Vector3: p.position.constructor, Quaternion: p.model.quaternion.constructor };
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const simWait = async (sec, capMs = 20000) => { const s0 = E.simTime, w0 = performance.now(); while (E.simTime - s0 < sec && performance.now() - w0 < capMs) await frame(); return E.simTime - s0; };
      for (const m of (C.machines?.list || [])) m.update = () => {};
      const keys = C.input.keys;
      const release = () => { keys.clear(); C.input.mouse.buttons = 0; };
      const buildSweep = ${String(buildSweep)};`;

/** The clips (page code): each awaits its lead-in with `S.on = false`, then grades with `S.on = true`. */
const CLIPS = {
  stand: { cloth: true, js: `S.on = true; await simWait(2.0);` },
  run: { cloth: true, run: true, js: `keys.add('KeyW'); await simWait(0.8); S.on = true; await simWait(3.0);` },
  sprint: { cloth: true, run: true, js: `keys.add('KeyW'); keys.add('ShiftLeft'); await simWait(1.0); S.on = true; await simWait(3.0);` },
  crouch: { cloth: true, js: `p.setCrouch(true); await simWait(0.6); S.on = true; await simWait(1.5); keys.add('KeyW'); await simWait(1.5); keys.delete('KeyW'); p.setCrouch(false);` },
  roll: { cloth: true, js: `keys.add('KeyW'); await simWait(0.6); S.on = true; p.dodge(); await simWait(1.2);` },
  sit: { cloth: true, js: `const q = p.position; const h = p.ride([{ x: q.x, y: q.y + 0.45, z: q.z }, { x: q.x + 0.001, y: q.y + 0.45, z: q.z }], { speed: 0.0001 }); await simWait(0.8); S.on = true; await simWait(2.0); S.on = false; h.cancel();` },
  unstowLance: { js: `S.on = true; cmb.melee.drawLance(30); await simWait(1.3);` },
  stowLance: { js: `cmb.melee.drawLance(30); await simWait(1.4); S.on = true; cmb.melee.holsterLance(); await simWait(1.3);` },
  unstowLanceJog: { js: `keys.add('KeyW'); await simWait(0.8); S.on = true; cmb.melee.drawLance(30); await simWait(1.3);` },
  stowLanceAim: { js: `cmb.melee.drawLance(30); await simWait(1.4); S.on = true; C.input.mouse.buttons |= 4; await simWait(1.2);` },
  unstowBow: { js: `S.on = true; C.input.mouse.buttons |= 4; await simWait(1.2);` },
  stowBow: { js: `C.input.mouse.buttons |= 4; await simWait(1.0); C.input.mouse.buttons &= ~4; S.on = true; const t0 = E.simTime; while (cmb.weaponDrawn && E.simTime - t0 < 8) await frame(); await simWait(1.0);` },
  hang: { cloth: true, hang: true, js: `an.setHangPose(true); await simWait(0.5); S.on = true; await simWait(1.0); S.hang = M.hangCheck(); S.bar = an.hangPoseInfo(); S.on = false; an.setHangPose(false);` },
};

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
      const S = { on: false, hang: null, bar: null };
      let T0 = null;
      M.begin(${JSON.stringify(name)});
      const updC = cmb.update.bind(cmb);
      cmb.update = function (dt, ...rest) {
        const r = updC(dt, ...rest);
        if (S.on && dt > 0) { if (T0 == null) T0 = E.simTime; p.model.updateMatrixWorld(true); M.sample({ T: +(E.simTime - T0).toFixed(3), cloth: ${!!c.cloth}, run: ${!!c.run} }); }
        return r;
      };
      try { ${c.js} } finally { S.on = false; cmb.update = updC; release(); p.setCrouch?.(false); }
      const r = M.end();
      const fails = [];
      if (r.frames < 20) fails.push('only ' + r.frames + ' steps graded');
      if (r.behind) fails.push(r.behind + ' behind-head steps');
      if (r.plane) fails.push(r.plane + ' steps above the shoulder behind the head plane');
      ${c.cloth ? `if (r.clipFrames) fails.push(r.clipFrames + ' clipping frames');` : ''}
      ${c.run ? `if (r.wristMid == null || r.wristMid < 0.10) fails.push('wrist ' + r.wristMid + ' m off the midline'); if (r.foreCase == null || r.foreCase <= 0) fails.push('forearm ' + r.foreCase + ' m off the survey case');` : ''}
      ${c.hang ? `const H = S.hang; if (!H || !(H.l.front > 0 && H.r.front > 0 && H.l.belowHeadBoneM >= 0 && H.r.belowHeadBoneM >= 0)) fails.push('hang: ' + JSON.stringify(H));` : ''}
      return { pass: fails.length === 0, detail: { fails, ...r, hang: S.hang, bar: S.bar, counts: M.counts, caps: M.caps } };
    })()`),
  };
};

export const SWEEP_CLIPS = Object.keys(CLIPS);
export const GATES = SWEEP_CLIPS.map(row);
