/**
 * M1.3b (hero-anim) — THE AIM RIG'S ROWS, in the page. Run with the runner's `--extra` (no other lane's suite
 * picks them up):
 *
 *   node tools/gates.mjs --port <p> --extra tools/gates/aim-rig.mjs --only A-aimrig-stand,A-aimrig-crouch,A-aimrig-loose
 *
 * The bars (BUILD M1.3b), graded in every cell of the stance x move x yaw matrix by `aim-rig/measure.mjs`
 * (the same function the Node bench grades with, sent to the page as source):
 *   1. full draw: the string hand's index knuckle within 0.03 m of the jaw-corner anchor on the head bone;
 *   2. every hand vertex outside the wrap volume (both hands, every step of the aim);
 *   3. full draw: the draw elbow level (aim frame, -0.03..+0.05 m of the shoulder) and back (>= 0.05 m behind
 *      the hand along the arrow);
 *   4. full draw: the bow arm >= 0.04 m clear of the chest (torso-skinned outfit vertices);
 *   5. the hand on the string: the nocked arrow within 0.01 m of the string's nocking point, that point within
 *      0.03 m of the string fingers;
 *   6. 0 steps with a hand or forearm behind the head (aim, draw, loose, re-nock, lowering);
 *   7. an arrow loosed only from a raised, drawn bow (aim weight >= 0.95, rendered draw >= 0.5).
 * and the rig's own verification (shoulder swing limits, nothing behind the head) logs 0 failures.
 *
 * A cell: stand on open ground, (crouch,) move 0.5 s, raise the bow, nock and draw (full at ~1 s), hold
 * (the yaw cells sweep the camera 1.2 rad out and back at 8 rad/s from 1.0 s), loose at 2.2 s, re-nock and
 * draw again, release the aim at 3.4 s, 0.6 s out. Keys and mouse bits through the real input path; the
 * Instruments frozen. Pitches -0.55, 0, 0.75 in the page (the bench adds the clamps, -1.15 and 1.02, and the
 * 3 rad/s sweep).
 */
import { placed } from '../gate-places.mjs';
import { buildMeasure } from './aim-rig/measure.mjs';

const HB = `
      const C = __CTX__, p = C.player, an = p.animator, cmb = C.combat, E = C.engine;
      const T3 = p.position.constructor, Q4 = p.model.quaternion.constructor;
      const THREE = { Vector3: T3, Quaternion: Q4 };
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const simWait = async (sec, capMs = 25000) => { const s0 = E.simTime, w0 = performance.now(); while (E.simTime - s0 < sec && performance.now() - w0 < capMs) await frame(); return E.simTime - s0; };
      const freeze = () => { for (const m of (C.machines?.list || [])) m.update = () => {}; };
      const keys = C.input.keys;
      const release = () => { keys.clear(); C.input.mouse.buttons = 0; };
      const buildMeasure = ${String(buildMeasure)};`;

const MOVES = { still: null, strafeL: 'KeyA', strafeR: 'KeyD', fwd: 'KeyW', back: 'KeyS' };
const PAGE_PITCHES = [-0.55, 0, 0.75];
const PAGE_YAWS = ['0', 'sweep8'];

/** One stance's matrix: every move x yaw x pitch cell, all seven bars, every step. */
const matrixRow = (stance) => ({
  id: `A-aimrig-${stance}`, kind: 'action', lane: 'hero-anim', timeout: 900000,
  title: `M1.3b aim rig, ${stance}: in every move x yaw x pitch cell the knuckle on the jaw-corner anchor (<= 0.03 m), hand vertices out of the wrap, elbow level and back, bow arm off the chest (>= 0.04 m), the hand on the string, 0 hand or forearm behind the head, loosed only raised and drawn, 0 failed verifications`,
  setup: `__CTX__.input.enabled = true;`, settle: 400,
  assert: placed(['openGround'], `(async () => {${HB}
      if (!an?.debugAimRig || !an.T.cRig) return { pass: false, detail: 'the constraint rig is not on (an.T.cRig)' };
      freeze();
      const M = buildMeasure({ an, model: p.model, combat: cmb }, THREE);
      const cells = [];
      const MOVES = ${JSON.stringify(MOVES)};
      let sampling = false, T = 0, tSim0 = 0;
      let yawProg = null;
      const updA = an.update;
      an.update = function (dt, t) {
        if (yawProg && dt > 0) yawProg(E.simTime - tSim0);
        return updA.call(this, dt, t);
      };
      const updC = cmb.update.bind(cmb);
      cmb.update = function (dt, ...rest) {
        const r = updC(dt, ...rest);
        if (sampling && dt > 0) { T = E.simTime - tSim0; M.sample({ T, aiming: !!p.aiming, draw: cmb.drawStrength }); }
        return r;
      };
      const onFire = () => { if (sampling) M.loose(E.simTime - tSim0); };
      C.events.on('arrow-fired', onFire);
      try {
        for (const pitch of ${JSON.stringify(PAGE_PITCHES)}) for (const move of Object.keys(MOVES)) for (const yaw of ${JSON.stringify(PAGE_YAWS)}) {
          release(); await simWait(0.3, 4000);
          p.setCrouch?.(false); standAt(p, 'openGround'); p.velocity?.set(0, 0, 0); await simWait(0.3, 4000);
          if (${JSON.stringify(stance)} === 'crouch') { p.setCrouch(true); await simWait(0.5, 4000); }
          p.camPitch = pitch;
          const k = MOVES[move];
          if (k) { keys.add(k); await simWait(0.5, 4000); }
          const yaw0 = p.camYaw;
          an.resetAimAudit?.();
          M.begin(); tSim0 = E.simTime; sampling = true;
          yawProg = (tt) => {
            p.camPitch = pitch;
            if (yaw !== 'sweep8' || tt < 1.0) return;
            const per = 4 * 1.2 / 8, end = 1.0 + per * Math.max(1, Math.round(1.2 / per));
            if (tt >= end) { p.camYaw = yaw0; return; }
            const ph = (tt - 1.0) * 8, A = 1.2, m = ph % (4 * A);
            p.camYaw = yaw0 + (m < A ? m : m < 3 * A ? 2 * A - m : m - 4 * A);
          };
          C.input.mouse.buttons |= 4;                       // raise
          await simWait(0.25, 4000);
          C.input.mouse.buttons |= 1;                       // nock and draw
          await simWait(1.95, 15000);
          C.input.mouse.buttons &= ~1;                      // loose (2.2 s)
          await simWait(0.4, 4000);
          C.input.mouse.buttons |= 1;                       // re-nock, draw again
          await simWait(0.8, 8000);
          C.input.mouse.buttons &= ~4;                      // the aim comes down with the string drawn (3.4 s)
          C.input.mouse.buttons &= ~1;
          await simWait(0.6, 6000);
          sampling = false; yawProg = null;
          if (k) keys.delete(k);
          const r = M.end();
          cells.push({ cell: ${JSON.stringify(stance)} + '.' + move + '.' + yaw + '@' + pitch, crouching: !!p.crouching, full: r.full,
            knuckleJaw: +r.knuckleJaw.toFixed(4), elbowH: r.elbowH.map((x) => +x.toFixed(4)), elbowBack: +r.elbowBack.toFixed(4),
            bowChest: +r.bowChest.toFixed(4), arrowNock: +r.arrowNock.toFixed(4), handNock: +r.handNock.toFixed(4),
            wrapIn: r.wrapIn, behind: r.behind, behindAt: r.behindAt, looses: r.looses, verifyFails: r.verifyFails, fails: r.fails });
          p.camYaw = yaw0;
        }
      } finally { an.update = updA; cmb.update = updC; C.events.off?.('arrow-fired', onFire); release(); }
      const bad = cells.filter((c) => c.fails.length);
      const worst = {
        knuckleJaw: Math.max(...cells.map((c) => c.knuckleJaw)), elbowLo: Math.min(...cells.map((c) => c.elbowH[0])), elbowHi: Math.max(...cells.map((c) => c.elbowH[1])),
        elbowBack: Math.min(...cells.map((c) => c.elbowBack)), bowChest: Math.min(...cells.map((c) => c.bowChest)), arrowNock: Math.max(...cells.map((c) => c.arrowNock)),
        handNock: Math.max(...cells.map((c) => c.handNock)), wrapIn: cells.reduce((a, c) => a + c.wrapIn, 0), behind: cells.reduce((a, c) => a + c.behind, 0),
        looses: cells.reduce((a, c) => a + c.looses.length, 0), verifyFails: cells.reduce((a, c) => a + c.verifyFails, 0),
      };
      return { pass: bad.length === 0, detail: { cells: cells.length, failing: bad.length, worst, counts: M.counts, bad: bad.slice(0, 12), all: cells } };
    })()`),
});

export const GATES = [
  matrixRow('stand'),
  matrixRow('crouch'),
  {
    id: 'A-aimrig-loose', kind: 'action', lane: 'hero-anim', timeout: 120000,
    title: 'M1.3b: an arrow is only ever loosed from a raised, drawn bow (a tap from the hip and a half-raised release loose nothing; a full draw looses at aim >= 0.95, rendered draw >= 0.5); no draw during a roll (draw 0 and no arrow while dodging)',
    setup: `__CTX__.input.enabled = true;`, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}
      freeze();
      const fired = [];
      const onFire = () => fired.push({ aimW: +(an._aimW * (1 - an._dodgeW)).toFixed(3), drawS: +an._drawS.toFixed(3), draw: +cmb.drawStrength.toFixed(3), dodging: !!p.dodging });
      C.events.on('arrow-fired', onFire);
      const rows = {};
      try {
        // (a) RMB and LMB together, LMB up after 0.15 s: the bow is not raised yet
        release(); standAt(p, 'openGround'); await simWait(0.4, 4000);
        let n0 = fired.length;
        C.input.mouse.buttons |= 5; await simWait(0.15, 3000); C.input.mouse.buttons &= ~1; await simWait(0.4, 4000);
        rows.tapFromHip = { looses: fired.length - n0 };
        // (b) a short draw: raised, LMB 0.2 s (draw ~0.25)
        release(); await simWait(0.5, 4000); n0 = fired.length;
        C.input.mouse.buttons |= 4; await simWait(0.6, 4000); C.input.mouse.buttons |= 1; await simWait(0.2, 3000); C.input.mouse.buttons &= ~1; await simWait(0.4, 4000);
        rows.shortDraw = { looses: fired.length - n0 };
        // (c) a full draw: looses, raised and drawn
        release(); await simWait(0.5, 4000); n0 = fired.length;
        C.input.mouse.buttons |= 4; await simWait(0.6, 4000); C.input.mouse.buttons |= 1; await simWait(1.2, 6000); C.input.mouse.buttons &= ~1; await simWait(0.4, 4000);
        rows.fullDraw = { looses: fired.length - n0, at: fired.slice(n0) };
        // (d) a roll from full draw: the draw drops to 0 on the roll's first step, nothing looses during it
        release(); await simWait(0.5, 4000); n0 = fired.length;
        C.input.mouse.buttons |= 4; await simWait(0.6, 4000); C.input.mouse.buttons |= 1; await simWait(1.2, 6000);
        keys.add('KeyW'); p.dodge(); let maxDraw = 0, maxAimW = 0, steps = 0;
        const t0 = E.simTime;
        while (E.simTime - t0 < 0.9) { await frame(); if (p.dodging) { steps++; maxDraw = Math.max(maxDraw, cmb.drawStrength); maxAimW = Math.max(maxAimW, an._aimW * (1 - an._dodgeW)); } }
        C.input.mouse.buttons &= ~1; keys.delete('KeyW'); await simWait(0.4, 4000);
        rows.roll = { dodgeSteps: steps, maxDrawWhileDodging: +maxDraw.toFixed(3), maxAimWWhileDodging: +maxAimW.toFixed(3), loosesDuringRoll: fired.slice(n0).filter((f) => f.dodging).length, looses: fired.length - n0 };
      } finally { C.events.off?.('arrow-fired', onFire); release(); }
      const allOk = fired.every((f) => f.aimW >= 0.95 && f.drawS >= 0.5);
      const pass = rows.tapFromHip.looses === 0 && rows.shortDraw.looses === 0 && rows.fullDraw.looses === 1 && allOk
        && rows.roll.dodgeSteps > 0 && rows.roll.maxDrawWhileDodging === 0 && rows.roll.loosesDuringRoll === 0;
      return { pass, detail: { rows, fired } };
    })()`),
  },
];
