/**
 * M1.3d (hero-anim) — THE LANCE PERFORMED BY THE BODY: the rows, in the page. Run with the runner's `--extra`
 * (no other lane's suite picks them up):
 *
 *   node tools/gates.mjs --port <p> --extra tools/gates/melee-body.mjs --only A-melee-heavy-body,A-melee-guard,A-melee-undercut
 *
 * The bars (BUILD M1.3d; BIBLE §5.3 "Melee is performed by the body. Hips first, both hands on the shaft for
 * heavy beats, weapon gripped at its sockets ... The Undercut is a low two-handed thrust from a crouch"),
 * measured every rendered step by `melee-body/measure.mjs` (the same function the Node bench grades with, sent
 * to the page as source):
 *   1. the heavy: hip rotation leads the shoulders by >= 0.040 s (half of each one's unwinding, windup ->
 *      contact); each palm within 0.05 m of its socket on the haft (right on `grip`, left on `grip2`) at every
 *      step of the windup, the contact (strike) and the follow-through (the recover's first 62 %);
 *   2. the guard: both palms within 0.05 m of their sockets for 1 s; the blade forward of the grip and down;
 *      the tip 0.35-0.70 m off the ground;
 *   3. the Undercut, standing and crouched, from the guard and from the back: both palms on their sockets in
 *      all three windows; the tip at the contact under 1.0 m and under the heavy's; the haft within 20 deg of
 *      level; the tip's travel from the chamber to the contact within 25 deg of the haft.
 * A heavy is the real input path (LMB held 0.75 s: the press's cock grows into the heavy) and `swing({ heavy })`
 * from the guard; the Undercut is `swing({ undercut: true })` (what the prompt's action fires, without a
 * machine). The swing bearing is pinned to her facing (`aimLock` 0); the Instruments are frozen.
 */
import { placed } from '../gate-places.mjs';
import { buildMeleeMeasure } from './melee-body/measure.mjs';

const HB = `
      const C = __CTX__, p = C.player, an = p.animator, cmb = C.combat, E = C.engine, mel = cmb.melee;
      const T3 = p.position.constructor, Q4 = p.model.quaternion.constructor;
      const THREE = { Vector3: T3, Quaternion: Q4, Matrix4: p.model.matrixWorld.constructor };
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const simWait = async (sec, capMs = 25000) => { const s0 = E.simTime, w0 = performance.now(); while (E.simTime - s0 < sec && performance.now() - w0 < capMs) await frame(); return E.simTime - s0; };
      const freeze = () => { for (const m of (C.machines?.list || [])) m.update = () => {}; };
      const keys = C.input.keys;
      const release = () => { keys.clear(); C.input.mouse.buttons = 0; };
      const buildMeleeMeasure = ${String(buildMeleeMeasure)};
      if (!mel?.layer?.ok) return { pass: false, detail: 'no melee layer' };
      const M = buildMeleeMeasure({ an, model: p.model, melee: mel, marks: () => mel.lance }, THREE);
      let sampling = false, contactT = null, wasStruck = false, t0 = 0;
      const updC = cmb.update.bind(cmb);
      cmb.update = function (dt, ...rest) {
        const r = updC(dt, ...rest);
        if (sampling && dt > 0) {
          const T = E.simTime - t0;
          p.model.updateMatrixWorld(true);
          M.sample(T);
          if (contactT == null && mel.phase === 'strike' && mel._struck && !wasStruck) contactT = T;
          wasStruck = mel._struck && mel.phase === 'strike';
        }
        return r;
      };
      const begin = () => { M.begin(); contactT = null; wasStruck = false; t0 = E.simTime; sampling = true; };
      const waitSwing = async () => {
        const w0 = performance.now(); let began = false;
        while (performance.now() - w0 < 6000) { await frame(); if (mel.stance === 'swing') began = true; if (began && !mel.active && mel.stance !== 'swing') break; }
        await simWait(0.2, 3000);
        sampling = false;
      };
      const lock0 = mel.aimLock;
      mel.aimLock = 0;
      const restore = () => { cmb.update = updC; mel.aimLock = lock0; release(); p.setCrouch?.(false); };
      const toGuard = async () => { p.setCrouch?.(false); release(); await simWait(0.2, 3000); standAt(p, 'openGround'); p.velocity?.set(0, 0, 0); mel.drawLance(30); await simWait(0.9, 8000); };
      const toHolstered = async () => { p.setCrouch?.(false); release(); mel.holsterLance?.(); await simWait(0.9, 8000); standAt(p, 'openGround'); p.velocity?.set(0, 0, 0); await simWait(0.3, 4000); };
      const r3 = (x) => (x == null ? null : +(+x).toFixed(3));
      const palmsOk = (s, bar) => ['windup', 'contact', 'follow'].every((w) => s.palms[w].n > 0 && s.palms[w].rightSocket <= bar && s.palms[w].leftSocket <= bar);
      const brief = (s) => s && ({ leadHalf: r3(s.leadHalf), leadPeak: r3(s.leadPeak), hipTravel: r3(s.hip.travel), shTravel: r3(s.sh.travel),
        palms: Object.fromEntries(Object.entries(s.palms).map(([k, v]) => [k, { n: v.n, rightSocket: r3(v.rightSocket), leftSocket: r3(v.leftSocket), rightShaft: r3(v.right), leftShaft: r3(v.left) }])),
        contact: { tipY: r3(s.contact.tipY), tip: s.contact.tip.map(r3), levelDeg: r3(s.contact.levelDeg), thrustDeg: r3(s.contact.thrustDeg), pelvisY: r3(s.contact.pel[1]) } });`;

/** The guard as it was before M1.3d (the A/B row puts it back for one pass). */
const READY_PRE = { hand: [-0.23, 1.12, 0.0], shaft: [0.38, -0.40, 0.83], lhOn: 0.50, yaw: -0.40 };

export const GATES = [
  {
    id: 'A-melee-heavy-body', kind: 'action', lane: 'hero-anim', timeout: 180000,
    title: 'M1.3d heavy: hip rotation leads the shoulders by >= 40 ms; both palms within 0.05 m of their sockets on the haft (right on grip, left on grip2) at every step of the windup, the contact and the follow-through (the held press, and swing({ heavy }) from the guard)',
    setup: `__CTX__.input.enabled = true;`, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}
      freeze();
      const runs = {};
      try {
        await toGuard();
        begin(); C.input.mouse.buttons |= 1; await simWait(0.75, 8000); C.input.mouse.buttons &= ~1; await waitSwing();
        runs.held = brief(M.swing('heavy', contactT));
        await toGuard();
        begin(); mel.swing({ heavy: true }); await waitSwing();
        runs.fromGuard = brief(M.swing('heavy', contactT));
      } finally { restore(); }
      const B = M.BARS;
      const ok = (s) => !!s && s.leadHalf != null && s.leadHalf >= B.hipLead && ['windup', 'contact', 'follow'].every((w) => s.palms[w].n > 0 && s.palms[w].rightSocket <= B.palm && s.palms[w].leftSocket <= B.palm);
      return { pass: ok(runs.held) && ok(runs.fromGuard), detail: runs };
    })()`),
  },
  {
    id: 'A-melee-guard', kind: 'action', lane: 'hero-anim', timeout: 60000,
    title: 'M1.3d guard: both palms within 0.05 m of their sockets for 1 s; the blade forward of the grip and down; the tip 0.35-0.70 m up',
    setup: `__CTX__.input.enabled = true;`, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}
      freeze();
      let g = null;
      try { await toGuard(); begin(); await simWait(1.0, 8000); sampling = false; g = M.guard(); } finally { restore(); }
      const B = M.BARS;
      const pass = !!g && g.rightSocket <= B.palm && g.leftSocket <= B.palm && g.bladeAhead > 0.5 && g.dir[1] < 0 && g.tipY >= B.guardTipLo && g.tipY <= B.guardTipHi;
      return { pass, detail: g && { steps: g.steps, rightSocket: r3(g.rightSocket), leftSocket: r3(g.leftSocket), tipY: r3(g.tipY), bladeAhead: r3(g.bladeAhead), haftDirY: r3(g.dir[1]), leftOnMin: r3(g.leftOnMin) } };
    })()`),
  },
  {
    id: 'A-melee-undercut', kind: 'action', lane: 'hero-anim', timeout: 240000,
    title: 'M1.3d Undercut, a low two-handed thrust (standing and crouched; from the guard and from the back): both palms on their sockets at the windup, contact and follow-through; the tip at contact under 1.0 m and under the tip of the heavy; the haft within 20 deg of level; the tip travels within 25 deg of the haft from the chamber to the contact',
    setup: `__CTX__.input.enabled = true;`, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}
      freeze();
      const runs = {};
      let heavyTipY = null;
      try {
        await toGuard();
        begin(); mel.swing({ heavy: true }); await waitSwing();
        heavyTipY = M.swing('heavy', contactT)?.contact.tipY ?? null;
        for (const [name, crouch, holstered] of [['standGuard', false, false], ['standBack', false, true], ['crouchGuard', true, false], ['crouchBack', true, true]]) {
          if (holstered) await toHolstered(); else await toGuard();
          if (crouch) { p.setCrouch?.(true); await simWait(0.6, 6000); }
          begin();
          if (holstered) mel.drawLance(2.4);
          mel.swing({ undercut: true });
          await waitSwing();
          const s = M.swing('undercut', contactT);
          runs[name] = { crouching: !!p.crouching, ...brief(s), ok: !!s && palmsOk(s, M.BARS.palm) && s.contact.tipY <= M.BARS.ucTipMax && (heavyTipY == null || s.contact.tipY < heavyTipY)
            && Math.abs(s.contact.levelDeg) <= M.BARS.ucLevelDeg && s.contact.thrustDeg != null && s.contact.thrustDeg <= M.BARS.ucThrustDeg };
          p.setCrouch?.(false);
        }
      } finally { restore(); }
      return { pass: Object.values(runs).every((r) => r.ok), detail: { heavyTipY: r3(heavyTipY), runs } };
    })()`),
  },
  {
    id: 'A-melee-aimstow-ab', kind: 'action', lane: 'hero-anim', timeout: 120000, diagnostic: true,
    title: 'M1.3d diagnostic (not a bar): A107\'s aim stow (KeyB draw, RMB) with the guard as it is and with the guard as it was before M1.3d, the elbow behind the head at shoulder height and the forearm to the back of the head, idle',
    setup: `__CTX__.input.enabled = true;`, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}
      freeze();
      const Rd = mel.layer.tables.READY, keep = JSON.parse(JSON.stringify(Rd));
      const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
      const V3 = p.position.constructor;
      const wE = new V3(), wH = new V3(), wS = new V3(), wW = new V3(), wQ = new V3(), wU = new V3();
      const inv = p.model.matrixWorld.clone();
      const tapB = async () => { keys.add('KeyB'); await frame(); await frame(); keys.delete('KeyB'); };
      const one = async () => {
        mel.holsterLance(); { const tq = performance.now(); while (mel.stance !== 'holstered' && performance.now() - tq < 3000) await frame(); }
        standAt(p, 'openGround'); p.velocity?.set(0, 0, 0); await simWait(0.3, 4000);
        await tapB(); { const tq = performance.now(); while (mel.stance !== 'ready' && performance.now() - tq < 3000) await frame(); }
        for (let i = 0; i < 8; i++) await frame();
        let band = -9, back = 9, n = 0;
        C.input.mouse.buttons |= 4;
        const tq = performance.now();
        while (performance.now() - tq < 2500) {
          await frame();
          const d = an.debugMelee();
          if (d && d.stance === 'holster') {
            n++;
            p.model.updateWorldMatrix(true, false); inv.copy(p.model.matrixWorld).invert();
            an.b.loArmR.bone.getWorldPosition(wE).applyMatrix4(inv); an.b.head.bone.getWorldPosition(wH).applyMatrix4(inv);
            an.b.upArmR.bone.getWorldPosition(wS).applyMatrix4(inv); an.b.handR.bone.getWorldPosition(wW).applyMatrix4(inv);
            const aboveSh = wE.y - wS.y, behind = wH.z - wE.z;
            if (aboveSh > 0 || (aboveSh > -0.12 && (an.melee?._dbg?.w ?? 0) >= 0.5)) band = Math.max(band, behind);
            an._headFrame();
            for (let k = 0; k <= 10; k++) { wQ.copy(wE).lerp(wW, k / 10); an._headUnit(wQ, wU); const L = wU.length(); const g = (L - 1) * Math.hypot(wU.x / L * 0.105, wU.y / L * 0.135, wU.z / L * 0.115); if (wU.z < 0 && g < back) back = g; }
          }
          if (mel.stance === 'holstered' && !(d && d.stance === 'holster')) break;
        }
        C.input.mouse.buttons &= ~4;
        for (let i = 0; i < 10; i++) await frame();
        return { holsterFrames: n, bandMax: r3(band), backOfHeadMin: r3(back) };
      };
      const out = {};
      try {
        out.now = await one();
        Object.assign(Rd, keep, { hand: READY_PRE.hand, shaft: unit(READY_PRE.shaft), lhOn: READY_PRE.lhOn, yaw: READY_PRE.yaw });
        out.preM13dGuard = await one();
      } finally { Object.assign(Rd, keep); restore(); }
      return { pass: null, detail: out };
    })()`.replace('READY_PRE.hand', JSON.stringify(READY_PRE.hand)).replace('unit(READY_PRE.shaft)', 'unit(' + JSON.stringify(READY_PRE.shaft) + ')').replace('READY_PRE.lhOn', String(READY_PRE.lhOn)).replace('READY_PRE.yaw', String(READY_PRE.yaw))),
  },
];
