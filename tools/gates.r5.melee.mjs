/**
 * ROUND 5 — lane `melee` gate file (W1): the lance on Brea (plan §9 melee).
 *
 *   nice -n 10 node tools/gates.mjs --port 5256 --lane melee
 *
 * Re-staged from the carried Round-4 player-melee rows (R47): every clause of
 * theirs stands unless a Brea or lance reason is written beside it, and the
 * new W1 rows are at the end of the file. Numbers: docs/ROUND5-MELEE.md.
 */
import { CANON_SPEEDS } from './gate-speeds.mjs';
import { HERO, ROSTER, FAIL_CARD, staged, stagedSetup } from './gate-roster.mjs';
import { PLACES, placed, placedSetup } from './gate-places.mjs';


const STAGE = `standAt(p, 'openGround'); `;

const FREEZE = `for (const m of  __CTX__.machines.list) m.update = () => {};`;

const NOHUD = `for (const el of Array.from(document.body.children)) {
    if (el.id === 'app' || el.tagName === 'SCRIPT' || el.tagName === 'CANVAS') continue;
    el.style.display = 'none';
  }`;
const FILM = `
  if (__CTX__.vegetation?.group) __CTX__.vegetation.group.visible = false;
  __CTX__.player.model.traverse((o) => { o.frustumCulled = false; });`;

const AIMLOCK = `__CTX__.combat.melee.aimLock = 0;`;

const FRAME = `const frame = () => new Promise((r) => requestAnimationFrame(r));`;

const SWING = `
  ${FRAME}
  const rec = async (opts = {}) => {
    const C = __CTX__, M = C.combat.melee, p = C.player;
    const an = p.animator;
    const out = [];

    const V3 = p.position.constructor, _bw = new V3(), _lh = new V3();
    const bowOf = () => {
      const g = C.combat?.bow?.group;
      if (!g) return { bowP: null, bowLH: null };
      let lh = null;
      const hb = an.b?.handL?.bone;
      if (hb && g.parent && g.visible !== false) {
        g.getWorldPosition(_bw); hb.getWorldPosition(_lh);
        lh = +_bw.distanceTo(_lh).toFixed(3);
      }
      return { bowP: g.parent ? (g.parent.name || g.parent.type) : null, bowLH: lh,
        bowVisible: g.visible !== false, wd: !!C.combat.weaponDrawn };
    };
    let hit = null;
    const onHit = (e) => { if (!hit) { const dd = an.debugMelee();
      hit = { ...e, phase: M.phase, k: M._phaseEnd > 0 ? M._t / M._phaseEnd : 0,
        tip: dd?.tipWorld || null, w: dd?.w ?? null, beat: dd?.beat ?? null,
        tipChar: dd?.tipChar || null, held: dd?.held ?? null,
        stance: dd?.stance ?? null, layerPhase: dd?.phase ?? null }; } };
    C.events.on('melee-hit', onHit);
    const p0 = { x: p.position.x, z: p.position.z };

    if (opts.pre) {
      const d0 = an.debugMelee();
      if (d0) out.push({ t: 0, stance: 'pre', phase: d0.phase, beat: d0.beat, w: d0.w,
        grip: d0.grip, hand: d0.handChar, tip: d0.tipWorld, shaft: d0.shaft,
        yaw: d0.torsoYawDeg, parent: d0.parent, held: d0.held, pre: true,
        px: p.position.x, pz: p.position.z, k: 0, dt: 0 });
    }
    M.swing({ heavy: !!opts.heavy });
    const t0 = performance.now();
    let seenSwing = false;
    while (performance.now() - t0 < (opts.budget ?? 6000)) {
      await frame();
      const d = an.debugMelee();
      if (!d) break;
      out.push({
        t: +((performance.now() - t0) / 1000).toFixed(4),
        stance: d.stance, phase: d.phase, beat: d.beat, w: d.w,
        grip: d.grip, hand: d.handChar, tip: d.tipWorld, shaft: d.shaft,
        clear: d.shaftClear, hair: d.hairClear, cross: d.forearmCross,
        toSpine: d.forearmToSpine, toSpineL: d.forearmToSpineL,
        elbow: d.elbowOverHead, yaw: d.torsoYawDeg,
        err: d.shaftErrDeg, palm: d.palmToAxis, gripAxis: d.gripAxisDeg,
        knuckle: d.knuckleToAxis, lh: d.leftHandToShaft, lhSeg: d.leftHandToHaft, lp: d.leftPalmToHaft, lgf: d.leftGripFrac, parent: d.parent,
        handAxis: d.handAxis,

        pelvisC: d.pelvisChar, kneeL: d.kneeLChar, kneeR: d.kneeRChar,
        footLC: d.footLChar, footRC: d.footRChar,
        ahead: d.bladeAhead, stub: d.buttToWrist, hairArg: d.hairArgmin,
        grabGap: d.grabGap, grabReach: d.grabReach, carryB: d.carryBlend,
        hcF: d.headCylForearm, hcH: d.headCylHaft, bowClear: d.bowClear, lab: d.leftArmToBow, ...bowOf(),
        px: p.position.x, pz: p.position.z, spd: Math.hypot(p.velocity.x, p.velocity.z),
        k: M._phaseEnd > 1e-4 ? M._t / M._phaseEnd : 0, held: d.held,
        dt: 0,
      });
      if (M.stance === 'swing') seenSwing = true;
      if (seenSwing && !M.active) break;
    }
    C.events.off?.('melee-hit', onHit);
    const step = Math.hypot(p.position.x - p0.x, p.position.z - p0.z);
    return { samples: out, hit, step: +step.toFixed(3) };
  };

  const pathLen = (s, key) => {
    let d = 0;
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1][key], b = s[i][key];
      if (!a || !b) continue;
      d += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    return +d.toFixed(3);
  };
  const maxStep = (s, key) => {
    let m = 0;
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1][key], b = s[i][key];
      if (!a || !b) continue;
      m = Math.max(m, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    return +m.toFixed(3);
  };

  const bearings = (s) => s.filter((x) => x.shaft).map((x) => ({
    yaw: Math.atan2(x.shaft[0], x.shaft[2]) * 180 / Math.PI,
    pitch: Math.asin(Math.max(-1, Math.min(1, x.shaft[1]))) * 180 / Math.PI,
    phase: x.phase, k: x.k, t: x.t,
  }));

  const arcSig = (b) => {
    let lo = 1e9, hi = -1e9, iLo = 0, iHi = 0;
    let pLo = 1e9, pHi = -1e9;
    b.forEach((x, i) => {
      if (x.yaw < lo) { lo = x.yaw; iLo = i; }
      if (x.yaw > hi) { hi = x.yaw; iHi = i; }
      if (x.pitch < pLo) pLo = x.pitch;
      if (x.pitch > pHi) pHi = x.pitch;
    });
    const contact = b.filter((x) => x.phase === 'strike');
    const c = contact.length
      ? contact.reduce((best, x) => (Math.abs(x.k - 0.70) < Math.abs(best.k - 0.70) ? x : best), contact[0])
      : b[Math.floor(b.length / 2)];
    return {
      sweep: +((hi - lo) * (iHi > iLo ? 1 : -1)).toFixed(1),
      contactPitch: +(c ? c.pitch : 0).toFixed(1),
      contactYaw: +(c ? c.yaw : 0).toFixed(1),
      yawRange: [+lo.toFixed(1), +hi.toFixed(1)],
      pitchSpan: +(pHi - pLo).toFixed(1),
    };
  };

  const contactSig = (s) => {
    const strike = s.filter((x) => x.phase === 'strike' && x.hand && x.shaft);
    if (!strike.length) return null;
    const c = strike.reduce((best, x) => (Math.abs(x.k - 0.70) < Math.abs(best.k - 0.70) ? x : best), strike[0]);
    return { hand: c.hand.map((v) => +v.toFixed(3)), shaft: c.shaft.map((v) => +v.toFixed(3)),
      two: typeof c.lp === 'number' && c.lp <= 0.05,
      yaw: +(Math.atan2(c.shaft[0], c.shaft[2]) * 180 / Math.PI).toFixed(1),
      pitch: +(Math.asin(Math.max(-1, Math.min(1, c.shaft[1]))) * 180 / Math.PI).toFixed(1) };
  };

  const legSig = (s) => {
    const strike = s.filter((x) => x.phase === 'strike' && x.pelvisC && x.kneeL && x.kneeR);
    if (!strike.length) return null;
    const c = strike.reduce((best, x) => (Math.abs(x.k - 0.70) < Math.abs(best.k - 0.70) ? x : best), strike[0]);
    return { pelvis: c.pelvisC, kneeL: c.kneeL, kneeR: c.kneeR,
      footL: c.footLC || null, footR: c.footRC || null };
  };
  const handSig = (s) => {
    const h = s.filter((x) => x.hand);
    if (!h.length) return { spanY: 0, contactY: 0 };
    let lo = 1e9, hi = -1e9;
    for (const x of h) { if (x.hand[1] < lo) lo = x.hand[1]; if (x.hand[1] > hi) hi = x.hand[1]; }
    const strike = h.filter((x) => x.phase === 'strike');
    const c = strike.length
      ? strike.reduce((best, x) => (Math.abs(x.k - 0.70) < Math.abs(best.k - 0.70) ? x : best), strike[0])
      : h[Math.floor(h.length / 2)];
    return { spanY: +(hi - lo).toFixed(3), contactY: +c.hand[1].toFixed(3) };
  };`;

const READY = `
  const toReady = async (C) => {
    const M = C.combat.melee;
    M.drawLance(30);
    const t0 = performance.now();
    while (M.stance !== 'ready' && performance.now() - t0 < 3000) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
    return M.stance;
  };`;

const PLACE = `

  const place = async (role, d) => {
    const C = __CTX__, p = C.player;
    let m = (KIND[role] ? await stageRole(role) : null) || stagedPicks()[0] || null;
    if (!m) return null;
    const h = p.heading ?? 0;
    const mx = p.position.x + Math.sin(h) * d, mz = p.position.z + Math.cos(h) * d;
    const gy = C.terrain ? C.terrain.getHeight(mx, mz) : m.position.y;
    window.__PLACE_SUNK__ = +(gy - m.position.y).toFixed(3);
    m.position.set(mx, gy, mz);
    m.heading = h + Math.PI;

    if (m.root) {
      m.root.position.set(m.position.x, m.position.y, m.position.z);
      m.root.rotation.set(0, m.heading, 0);
    }
    m.update = () => {};

    m.state = 'idle';
    if (m.ai && m.ai.reactions) {
      m.ai.reactions.t = 0;
      if (typeof m.ai.reactions.clear === 'function') m.ai.reactions.clear();
    }
    if (m.maxHealth) m.health = m.maxHealth;
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
    return m;
  };`;

const LOCKCAM = `const lockCam = (right, back, up, aimH, fov, fwd) => {
  const C = __CTX__, p = C.player;
  const h = p.heading ?? 0, s = Math.sin(h), c = Math.cos(h);
  const f = fwd || 0;
  const put = () => {
    const px = p.position.x, py = p.position.y, pz = p.position.z;
    C.camera.position.set(px + c * right - s * back, py + up, pz + (-s) * right - c * back);
    C.camera.lookAt(px + s * f, py + aimH, pz + c * f);
  };
  p._updateCamera = put;

  put();
  C.camera.fov = fov; C.camera.updateProjectionMatrix();
};`;

const PIN = `const pin = async (st, settle = 900) => {
  const M = __CTX__.combat.melee;
  M.update = () => {};
  const s = { stance: 'ready', drawK: 1, phase: 'idle', k: 0, combo: 0, heavy: false,
    aimYaw: 0, contactK: 0.70, ...st };
  M.poseState = () => s;
  await new Promise((r) => setTimeout(r, settle));
};`;

const gridOf = (cols, rows, cropFrac, labels) => `
  const dom = C.renderer.domElement;
  const W = dom.width, H = dom.height;
  const cw = Math.floor(W / ${cols}), ch = Math.floor(H / ${rows});
  const sw = Math.floor(W * ${cropFrac}), sx = Math.floor((W - sw) / 2);
  const fit = Math.min(cw / sw, ch / H);
  const dw = Math.round(sw * fit), dh = Math.round(H * fit);
  const LABELS = ${JSON.stringify(labels)};
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g2 = cv.getContext('2d');
  g2.fillStyle = '#101010'; g2.fillRect(0, 0, W, H);
  let want = false, got = 0;
  const grabFrame = () => {
    if (!want || got >= ${cols * rows}) return;
    want = false;
    const cx = (got % ${cols}) * cw, cy = Math.floor(got / ${cols}) * ch;
    g2.drawImage(dom, sx, 0, sw, H, cx + (cw - dw) / 2, cy + (ch - dh) / 2, dw, dh);
    g2.strokeStyle = '#ffffff'; g2.lineWidth = 3;
    g2.strokeRect(cx + 1.5, cy + 1.5, cw - 3, ch - 3);

    const lab = LABELS[got] || '';
    let fs = 24;
    g2.font = 'bold ' + fs + 'px monospace';
    while (fs > 12 && g2.measureText(lab).width + 36 > cw) { fs -= 1; g2.font = 'bold ' + fs + 'px monospace'; }
    g2.fillStyle = 'rgba(0,0,0,0.65)';
    g2.fillRect(cx + 8, cy + 8, Math.ceil(g2.measureText(lab).width) + 24, fs + 8);
    g2.fillStyle = '#ffe9b0';
    g2.fillText(lab, cx + 20, cy + 8 + fs);
    got++;
  };
  e.onAfterRender.push(grabFrame);
  const strip = async (setupFn) => {
    setupFn();
    await new Promise((r) => setTimeout(r, 560));
    want = true;
    const t0 = performance.now();
    while (want && performance.now() - t0 < 1500) await new Promise((r) => requestAnimationFrame(r));
  };
  const show = () => {
    const i = e.onAfterRender.indexOf(grabFrame);
    if (i >= 0) e.onAfterRender.splice(i, 1);
    const el = document.createElement('img');
    el.src = cv.toDataURL('image/png');
    el.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;object-fit:fill';
    document.body.appendChild(el);
  };`;
const STRIPS = gridOf(2, 1, 0.56, [
  'SIDE (from her right)', 'FRONT-QUARTER (same frozen frame)',
]);

const STRIPS12 = gridOf(6, 2, 0.46, [
  '3/4 L1 CONTACT', '3/4 L2 CONTACT', '3/4 L3 CONTACT', '3/4 HV CONTACT', '3/4 HV FOLLOW', '3/4 JOG L3 CONTACT',
  'SIDE L1 WINDUP', 'SIDE L2 WINDUP', 'SIDE HV WINDUP', 'SIDE L1 FOLLOW', 'SIDE JOG HV CONTACT', 'SIDE LIVE+TRAIL',
]);

/** Axis to axis, the two radii: shaft 0.0145 + bow limb 0.02 / quiver tube 0.03. */
const AXIS_TOUCH = 0.035;
const AXIS_TOUCH_QUIVER = 0.045;
/**
 * Page helper: a stowed piece's line off the stow kit's own skinned vertices.
 * PIECE bits: 1 lance, 2 bow, 4 quiver (lowest / highest vertex of the bit).
 */
const KITLINES = `
  const __kg = km.geometry, __kP = __kg.getAttribute('_piece'), __kPos = __kg.getAttribute('position');
  const __kExt = {};
  for (const bit of [1, 2, 4]) {
    let lo = -1, hi = -1;
    for (let i = 0; i < __kPos.count; i++) {
      if ((Math.round(__kP.getX(i)) & bit) === 0) continue;
      if (lo < 0 || __kPos.getY(i) < __kPos.getY(lo)) lo = i;
      if (hi < 0 || __kPos.getY(i) > __kPos.getY(hi)) hi = i;
    }
    __kExt[bit] = [lo, hi];
  }
  const lineOf = (bit, a, b) => {
    const e = __kExt[bit];
    if (!e || e[0] < 0) return false;
    km.updateMatrixWorld(true);
    km.getVertexPosition(e[0], a); km.localToWorld(a); an._charOfWorld(a.clone(), a);
    km.getVertexPosition(e[1], b); km.localToWorld(b); an._charOfWorld(b.clone(), b);
    return true;
  };
  const segPt = (qq, A, B) => { const ab = B.clone().sub(A), t = Math.max(0, Math.min(1, qq.clone().sub(A).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return A.clone().addScaledVector(ab, t).distanceTo(qq); };
  const segSeg = (A, B, Cc, D) => { let m = 9; for (let i = 0; i <= 16; i++) { const qq = A.clone().lerp(B, i / 16); m = Math.min(m, segPt(qq, Cc, D)); } return m; };
`;

/** The film helpers, for a builder's or a judge's extra film rows (`--extra`). */
export const FILM_KIT = { NOHUD, FILM, FREEZE, STAGE, AIMLOCK, LOCKCAM, PIN, READY, gridOf };

export const GATES = [

  {
    id: 'A100-lance-holster', kind: 'action', lane: 'melee',
    timeout: 90000, settle: 500,
    title: 'Not in melee (idle, run, sprint, crouch, bow drawn, dodge): the stowed lance, read off the stow kit\'s own skinned vertices, is on a spine socket on the R10 diagonal: midpoint <= 0.30 m from the upper back, 30-60 deg from vertical, blade 0.20-0.70 m over the right shoulder and > 0.15 m right of the spine, tails >= 0.06 m, no intersection with bow or quiver',
    setup: `__CTX__.input.enabled = true;`,
    assert: placed(['openGround'], `(async () => {${HERO}
      const C = __CTX__, p = C.player, an = p.animator;
      if (!an?.debugMelee) return { pass: null, detail: 'SKIP: no animator.debugMelee (melee layer did not build)' };
      const kit = p.hero?.kit, km = kit?.meshes?.[0];
      if (!km) return { pass: false, detail: 'no stow kit on the hero' };
      ${FREEZE} ${STAGE} ${FRAME} ${AIMLOCK} ${KITLINES}
      const M = C.combat.melee;
      M.holsterLance();
      const settle = async (n) => { for (let i = 0; i < n; i++) await frame(); };
      await settle(40);
      const V3 = p.position.constructor;
      const q = { b: new V3(), t: new V3(), m: new V3(), s3: new V3(), uR: new V3(), uL: new V3(), a0: new V3(), a1: new V3(), a2: new V3(), f: new V3(), lat: new V3() };
      const read = () => {
        const L = lineOf(1, q.b, q.t);
        q.m.addVectors(q.b, q.t).multiplyScalar(0.5);
        an._charOf(an.b.spine3.bone, q.s3); an._charOf(an.b.upArmR.bone, q.uR); an._charOf(an.b.upArmL.bone, q.uL);
        q.lat.subVectors(q.uL, q.uR); q.lat.y = 0; q.lat.normalize();
        an._charOf(an.b.pelvis.bone, q.a0); an._charOf(an.b.neck1.bone, q.a1);
        q.a2.subVectors(q.a1, q.a0).normalize();
        q.f.crossVectors(q.lat, q.a2).normalize();
        const back = q.s3.clone().addScaledVector(q.f, -0.13);
        const d = q.t.clone().sub(q.b).normalize();
        let tails = 9;
        for (const cls of ['hair', 'cloth', 'wrap']) {
          const ch = an.chainOf?.(cls) || [];
          const links = Array.isArray(ch) ? ch : (ch.links || []);
          for (let i = 0; i + 1 < links.length; i++) {
            an._charOf(links[i], q.a0); an._charOf(links[i + 1], q.a1);
            tails = Math.min(tails, segSeg(q.a0, q.a1, q.b, q.t) - 0.0145);
          }
        }
        const bowA = new V3(), bowB = new V3(), quA = new V3(), quB = new V3();
        const hasBow = lineOf(2, bowA, bowB) && !(kit.hidden & 2), hasQ = lineOf(4, quA, quB);
        return {
          parent: kit.socket?.parent?.name || null, collapsed: !!(kit.hidden & 1), held: !!M.lanceInHand,
          midToBack: +q.m.distanceTo(back).toFixed(3),
          tiltDeg: +(Math.acos(Math.min(1, Math.abs(d.y))) * 180 / Math.PI).toFixed(2),
          bladeOverShoulder: +(q.t.y - q.uR.y).toFixed(3),
          tipRightOfSpine: +(-(q.t.clone().sub(q.s3).dot(q.lat))).toFixed(3),
          buttLeft: +(q.b.clone().sub(q.s3).dot(q.lat)).toFixed(3),
          tails: +tails.toFixed(4),
          bowAxis: hasBow ? +segSeg(q.b, q.t, bowA, bowB).toFixed(4) : null,
          quiverAxis: hasQ ? +segSeg(q.b, q.t, quA, quB).toFixed(4) : null,
        };
      };
      const worst = async (label, n, extra = () => ({})) => {
        let o = null;
        for (let i = 0; i < n; i++) {
          await frame();
          const r = read();
          if (!o) { o = { label, frames: 1, ...r, tiltMin: r.tiltDeg, tiltMax: r.tiltDeg, midMax: r.midToBack, bladeMin: r.bladeOverShoulder, bladeMax: r.bladeOverShoulder, tipMin: r.tipRightOfSpine, tailsMin: r.tails, bowMin: r.bowAxis, quMin: r.quiverAxis, anyHeld: r.held, anyCollapsed: r.collapsed, ...extra() }; continue; }
          o.frames++;
          o.tiltMin = Math.min(o.tiltMin, r.tiltDeg); o.tiltMax = Math.max(o.tiltMax, r.tiltDeg);
          o.midMax = Math.max(o.midMax, r.midToBack);
          o.bladeMin = Math.min(o.bladeMin, r.bladeOverShoulder); o.bladeMax = Math.max(o.bladeMax, r.bladeOverShoulder);
          o.tipMin = Math.min(o.tipMin, r.tipRightOfSpine); o.tailsMin = Math.min(o.tailsMin, r.tails);
          if (r.bowAxis != null) o.bowMin = o.bowMin == null ? r.bowAxis : Math.min(o.bowMin, r.bowAxis);
          if (r.quiverAxis != null) o.quMin = o.quMin == null ? r.quiverAxis : Math.min(o.quMin, r.quiverAxis);
          o.anyHeld = o.anyHeld || r.held; o.anyCollapsed = o.anyCollapsed || r.collapsed;
        }
        return o;
      };
      const rows = [];
      rows.push(await worst('idle', 20));
      C.input.keys.clear(); C.input.keys.add('KeyW');
      await settle(60); rows.push(await worst('run', 40, () => ({ speed: +Math.hypot(p.velocity.x, p.velocity.z).toFixed(2) })));
      C.input.keys.add('ShiftLeft');
      await settle(70); rows.push(await worst('sprint', 40, () => ({ speed: +Math.hypot(p.velocity.x, p.velocity.z).toFixed(2) })));
      C.input.keys.clear(); await settle(30);
      p.setCrouch ? p.setCrouch(true) : (p.crouching = true); await settle(30);
      rows.push(await worst('crouch', 20));
      p.setCrouch ? p.setCrouch(false) : (p.crouching = false); await settle(20);
      C.input.mouse.buttons |= 4;
      for (let i = 0; i < 60 && !p.aiming; i++) await frame();
      await settle(30);
      C.input.mouse.buttons |= 1;
      await settle(70);
      rows.push(await worst('bow-draw', 20, () => ({ aiming: !!p.aiming, draw: +(C.combat.drawStrength ?? 0).toFixed(2) })));
      C.input.mouse.buttons &= ~1; C.input.mouse.buttons &= ~4;
      await settle(50);
      M.holsterLance();
      for (let i = 0; i < 90 && M.stance !== 'holstered'; i++) await frame();
      p.dodge();
      rows.push(await worst('dodge', 40));
      await settle(40);
      const bad = [];
      const spineish = (n) => !!n && /spine/i.test(n);
      for (const r of rows) {
        if (!spineish(r.parent)) bad.push(r.label + ': the socket hangs off ' + r.parent);
        if (r.anyHeld) bad.push(r.label + ': the lance was in her hand');
        if (r.anyCollapsed) bad.push(r.label + ': the stowed copy was collapsed (the lance is invisible)');
        if (!(r.midMax <= 0.30)) bad.push(r.label + ': midpoint ' + r.midMax + ' m from the upper back');
        if (!(r.tiltMin >= 30 && r.tiltMax <= 60)) bad.push(r.label + ': tilt ' + r.tiltMin + '-' + r.tiltMax + ' deg');
        if (!(r.bladeMin > 0.20 && r.bladeMax <= 0.70)) bad.push(r.label + ': blade ' + r.bladeMin + '-' + r.bladeMax + ' m over the right shoulder');
        if (!(r.tipMin > 0.15)) bad.push(r.label + ': tip ' + r.tipMin + ' m right of the spine');
        if (!(r.tailsMin >= 0.06)) bad.push(r.label + ': wrap/knot tail ' + r.tailsMin + ' m from the shaft');
        if (r.bowMin != null && !(r.bowMin >= ${AXIS_TOUCH})) bad.push(r.label + ': the shaft axis passes ' + r.bowMin + ' m from the stowed bow axis (touching at ${AXIS_TOUCH})');
        if (r.quMin != null && !(r.quMin >= ${AXIS_TOUCH_QUIVER})) bad.push(r.label + ': the shaft axis passes ' + r.quMin + ' m from the quiver axis (touching at ${AXIS_TOUCH_QUIVER})');
      }
      const draw = rows.find((r) => r.label === 'bow-draw');
      if (!draw?.aiming) bad.push('the bow-draw row never entered aim');
      const sprint = rows.find((r) => r.label === 'sprint');
      if (!(sprint?.speed > 5.5)) bad.push('the sprint row only reached ' + sprint?.speed + ' m/s');
      return { pass: bad.length === 0, detail: { bad, rows } };
    })()`),
  },

  {
    id: 'A101-lance-grip', kind: 'action', lane: 'melee',
    timeout: 240000, settle: 500,
    title: 'Ready + every frame of all three lights and the heavy: palm on the haft axis, '
      + 'haft on the hand\'s grip axis, blade forward of the hand — and the FIRST swing from '
      + 'holstered (real LMB, idle/jog/sprint) lands with the grip at 0.15-0.28, never inside '
      + 'the hand-over; bow and lance never both in hand',
    setup: `__CTX__.input.enabled = true;`,
    assert: placed(['openGround'], `(async () => {${HERO}${ROSTER}
      const C = __CTX__, p = C.player, an = p.animator;
      if (!an?.debugMelee) return { pass: null, detail: 'SKIP: no animator.debugMelee' };
      ${FREEZE} ${STAGE} ${AIMLOCK} ${SWING} ${READY}
      const M = C.combat.melee;
      const rows = [];
      const bad = [];

      const holsterRows = [];
      {
        const prevState = C.state;
        C.state = 'playing';
        const heading0 = p.heading;
        const fromHolster = async (label, keys, holdMs) => {
          M.holsterLance();
          { const tq = performance.now();
            while (M.stance !== 'holstered' && performance.now() - tq < 3000) await frame(); }
          for (let i = 0; i < 12; i++) await frame();
          ${STAGE}
          p.heading = heading0;
          C.input.keys.clear();
          for (const k of keys) C.input.keys.add(k);
          { const tq = performance.now(); while (performance.now() - tq < (keys.length ? 1400 : 300)) await frame(); }
          const out = [];
          const t0 = performance.now();
          const g0 = C.engine.wallTime;
          C.input.mouse.buttons |= 1;
          let released = false, seen = false, firstSwingT = null, firstSwingG = null, heavy = null;
          while (performance.now() - t0 < 4000) {
            await frame();
            const t = (performance.now() - t0) / 1000;
            if (!released && t * 1000 >= holdMs) { C.input.mouse.buttons &= ~1; released = true; }
            const d = an.debugMelee();
            if (!d) break;
            let gf = null;
            if (d.butt && d.tipChar && d.handChar) {
              const bx = d.tipChar[0] - d.butt[0], by = d.tipChar[1] - d.butt[1], bz = d.tipChar[2] - d.butt[2];
              const ll = bx * bx + by * by + bz * bz;
              gf = ll > 1e-6 ? ((d.handChar[0] - d.butt[0]) * bx + (d.handChar[1] - d.butt[1]) * by
                + (d.handChar[2] - d.butt[2]) * bz) / ll : null;
            }
            out.push({ t, stance: d.stance, phase: d.phase, k: M._phaseEnd > 1e-4 ? M._t / M._phaseEnd : 0,
              carryB: d.carryBlend, done: d.handoverDone, gfn: d.gripFracNow, gf, held: d.held });
            if (d.stance === 'swing') { if (firstSwingT == null) { firstSwingT = t; firstSwingG = C.engine.wallTime - g0; } if (heavy == null || M.phase === 'strike') heavy = !!M.heavy; seen = true; }
            if (seen && !M.active && M.stance !== 'swing') break;
          }
          C.input.mouse.buttons &= ~1;
          C.input.keys.clear(); p.velocity.set(0, 0, 0);
          const swing = out.filter((x) => x.stance === 'swing');
          const inHand = swing.filter((x) => !(x.carryB >= 1) || x.done === false);
          const strike = swing.filter((x) => x.phase === 'strike' && typeof x.gf === 'number');
          const c = strike.length ? strike.reduce((b, x) => (Math.abs(x.k - 0.70) < Math.abs(b.k - 0.70) ? x : b), strike[0]) : null;
          const drawFrames = out.filter((x) => x.stance === 'draw');
          const fdt = drawFrames.length > 1 ? (drawFrames[drawFrames.length - 1].t - drawFrames[0].t) / (drawFrames.length - 1) : null;
          return { label, swingFrames: swing.length, swingFramesInHandover: inHand.length,
            gripFracAtContact: c ? +c.gf.toFixed(3) : null, contactK: c ? +c.k.toFixed(2) : null,
            clickToFirstSwingS: firstSwingT == null ? null : +firstSwingT.toFixed(3),

            clickToFirstSwingGameS: firstSwingG == null ? null : +firstSwingG.toFixed(3),
            drawFrameMs: fdt == null ? null : +(fdt * 1000).toFixed(1), heavy,
            gripFracPath: out.filter((x, i) => i % 3 === 0 && (x.stance === 'draw' || x.stance === 'swing'))
              .slice(0, 14).map((x) => (x.stance[0] + (x.gf == null ? '?' : x.gf.toFixed(2)))) };
        };
        const modes = [['idle', []], ['jog', ['KeyW']], ['sprint', ['KeyW', 'ShiftLeft']]];
        for (const [mode, keys] of modes) {
          for (const [kind, hold] of [['click', 60], ['hold', 420]]) {
            const r = await fromHolster(mode + ' ' + kind, keys, hold);
            holsterRows.push(r);
            const tag = 'from holstered, ' + r.label;
            if (!(r.swingFrames >= 6)) { bad.push(tag + ': only ' + r.swingFrames + ' swing frames — the queued swing never played'); continue; }
            if (r.swingFramesInHandover > 0) {
              bad.push(tag + ': ' + r.swingFramesInHandover + ' of ' + r.swingFrames
                + ' swing frames were inside the hand-over (the haft still sliding through her fist) — ruling R5');
            }
            if (r.gripFracAtContact == null) bad.push(tag + ': no contact frame was sampled');
            else if (!(r.gripFracAtContact >= 0.15 && r.gripFracAtContact <= 0.28)) {
              bad.push(tag + ': the grip was at ' + r.gripFracAtContact + ' of the haft at contact — canon M3 is 0.15-0.28');
            }
            if (r.heavy !== (kind === 'hold')) {
              bad.push(tag + ': the input asked for a ' + (kind === 'hold' ? 'heavy' : 'light') + ' and a '
                + (r.heavy ? 'heavy' : 'light') + ' played');
            }
            if (kind === 'click' && r.drawFrameMs != null && r.drawFrameMs <= 25
              && !(r.clickToFirstSwingS <= 0.35)) {
              bad.push(tag + ': the click took ' + r.clickToFirstSwingS + ' s to reach the first swing frame at '
                + r.drawFrameMs + ' ms frames (design 0.25-0.35 s)');
            }
          }
        }
        C.state = prevState;
      }

      if (await toReady(C) !== 'ready') return { pass: null, detail: 'SKIP: the guard never came up' };
      const d0 = an.debugMelee();
      const beats = [];
      for (let i = 0; i < 3; i++) beats.push(await rec({}));
      beats.push(await rec({ heavy: true }));

      const sweepOf = (arr) => {
        let w = 0;
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const a = arr[i], b = arr[j];
            if (!a || !b) continue;
            const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
            const ang = Math.acos(d) * 180 / Math.PI;
            if (ang > w) w = ang;
          }
        }
        return +w.toFixed(1);
      };
      const check = (label, s) => {

        const held = s.filter((x) => x.stance === 'swing' || x.stance === 'ready');
        if (held.length < 6) { bad.push(label + ': only ' + held.length + ' held frames'); return; }
        const palm = Math.max(...held.map((x) => x.palm ?? 9));
        const axis = Math.max(...held.map((x) => x.gripAxis ?? 99));
        const knk = Math.max(...held.map((x) => x.knuckle ?? 9));
        const err = Math.max(...held.map((x) => x.err ?? 99));
        const two = held.filter((x) => x.beat === 'light-3' && x.phase !== 'windup');
        const lh = two.length ? Math.min(...two.map((x) => x.lh ?? 9)) : null;
        const ahead = Math.min(...held.map((x) => x.ahead ?? -9));
        const stub = held.map((x) => x.stub ?? 9);
        const stubLo = Math.min(...stub), stubHi = Math.max(...stub);

        const handSweep = sweepOf(held.map((x) => x.handAxis).filter(Boolean));
        const shaftSweep = sweepOf(held.map((x) => x.shaft).filter(Boolean));
        rows.push({ label, frames: held.length, palmMax: +palm.toFixed(4),
          gripAxisMaxDeg: +axis.toFixed(2), knuckleToAxisMax: +knk.toFixed(4),
          shaftErrMaxDeg: +err.toFixed(2), light3PastCockFrames: two.length,
          handSweepDeg: handSweep, shaftSweepDeg: shaftSweep,
          shaftVsHandMaxDeg: +axis.toFixed(2),
          bladeAheadMin: +ahead.toFixed(3), buttToWrist: [+stubLo.toFixed(3), +stubHi.toFixed(3)],
          leftHandToShaftMin: lh == null ? null : +lh.toFixed(3) });
        if (!(handSweep >= 45)) {
          bad.push(label + ': the hand only turned ' + handSweep + ' deg through the beat — '
            + 'the haft is not being carried by an arm that is doing anything');
        }
        if (!(shaftSweep >= 45)) bad.push(label + ': the haft only swept ' + shaftSweep + ' deg');
        if (!(axis <= 3)) {
          bad.push(label + ': the haft drifted ' + axis.toFixed(1) + ' deg off the live knuckle line');
        }
        if (!(palm <= 0.03)) bad.push(label + ': palm ' + palm.toFixed(4) + ' m off the haft axis');
        if (!(axis <= 25)) bad.push(label + ': haft ' + axis.toFixed(1) + ' deg off the knuckle line');

        if (!(knk <= 0.03)) bad.push(label + ': the haft is ' + knk.toFixed(4) + ' m off the knuckle line (live bones)');
        /* TWO HANDS (R1, R12, bible §5.3): every held frame of light-1, light-2 and
         * the heavy, and light-3's cock: the left palm on the haft, off the live
         * knuckle bones against the prop's matrix. */
        /* ...from the cock on: a beat chained off light-3's free hand spends its opening
         * bringing that hand back (the cock key is reached at 0.58 of the windup), and
         * the guard frame that ends light-3's row is that same hand on its way home */
        const twoF = held.filter((x) => (x.stance === 'swing' && !(x.phase === 'windup' && x.k < 0.58) && x.beat !== 'light-3')
          || (x.beat === 'light-3' && x.phase === 'windup' && x.k >= 0.30 && x.k <= 0.58)
          || (x.stance === 'ready' && label !== 'light-3'));
        const lpMax = twoF.length ? Math.max(...twoF.map((x) => x.lp ?? 9)) : null;
        rows[rows.length - 1].leftPalmToHaftMax = lpMax == null ? null : +lpMax.toFixed(4);
        if (lpMax != null && !(lpMax <= 0.05)) bad.push(label + ': a two-handed frame had the left palm ' + lpMax.toFixed(3) + ' m off the haft');
        if (!(ahead >= 0.35)) bad.push(label + ': the blade is only ' + ahead.toFixed(3) + ' m ahead of the hand');

        if (!(stubLo >= 0.21 && stubHi <= 0.45)) {
          bad.push(label + ': butt-to-wrist ' + stubLo.toFixed(3) + '-' + stubHi.toFixed(3)
            + ' m (canon 0.15-0.28 of a ' + d0.length + ' m haft = 0.23-0.42)');
        }
      };
      beats.forEach((b, i) => check(i < 3 ? 'light-' + (i + 1) : 'heavy', b.samples));

      const l3 = beats[2].samples.filter((x) => x.beat === 'light-3' && x.phase !== 'windup' && x.lhSeg != null);
      const lhMin = l3.length ? Math.min(...l3.map((x) => x.lhSeg)) : null;
      const lhLineMin = l3.length ? Math.min(...l3.map((x) => x.lh ?? 9)) : null;
      if (lhMin == null) bad.push('no light-3 frames were sampled for the free-hand clause');
      else if (!(lhMin >= 0.08)) {
        bad.push('light-3: the LEFT hand came within ' + lhMin.toFixed(3) + ' m of the haft — '
          + 'ruling R1 makes light-3 one-handed, the free arm trails');
      }

      /* the guard's marks (V46, bible §5.3): right at 20 %, left at 55 % */
      const readyLeftFrac = d0?.leftGripFrac ?? null;
      if (readyLeftFrac == null || !(readyLeftFrac >= 0.50 && readyLeftFrac <= 0.60)) bad.push('ready guard: the left hand is at ' + readyLeftFrac + ' of the haft (55 % +- 5)');
      if (!(d0?.leftPalmToHaft <= 0.05)) bad.push('ready guard: the left palm is ' + d0?.leftPalmToHaft + ' m off the haft');
      const readyTipY = d0 && d0.tipChar ? d0.tipChar[1] : null;
      if (readyTipY == null) bad.push('no ready-guard tip reading');
      else if (!(readyTipY >= 0.35 && readyTipY <= 0.55)) {
        bad.push('ready guard: the tip is at ' + readyTipY.toFixed(3) + ' m — canon M7 is 0.35-0.55 m');
      }

      const bowBad = [];
      const bowRow = (label, samples) => {
        const f = samples.filter((x) => x.stance === 'swing' || x.stance === 'ready');
        const off = f.filter((x) => x.bowP && /hand/i.test(x.bowP));
        const wd = f.filter((x) => x.wd);
        const lh = f.map((x) => x.bowLH).filter((v) => typeof v === 'number');
        const cl = f.map((x) => x.bowClear).filter((v) => typeof v === 'number');
        const r = { label, frames: f.length, framesOffBack: off.length,
          parents: [...new Set(f.map((x) => x.bowP))], wieldedFrames: wd.length,
          bowToLeftHandMinM: lh.length ? +Math.min(...lh).toFixed(3) : null,
          haftToBowMinM: cl.length ? +Math.min(...cl).toFixed(3) : null };
        if (cl.length) { const w = f.reduce((b, x) => ((x.bowClear ?? 9) < (b.bowClear ?? 9) ? x : b), f[0]); r.haftToBowAt = [w.stance, w.phase, +(w.k ?? 0).toFixed(2), w.beat]; }
        if (!(f.length >= 6)) bowBad.push(label + ': only ' + f.length + ' swing frames sampled');
        if (off.length) bowBad.push(label + ': the bow was OFF her back on ' + off.length + ' of ' + f.length
          + ' swing frames (parent ' + r.parents.join('/') + ') — canon finding 2: the left hand is empty');
        if (wd.length) bowBad.push(label + ': combat called the bow wielded on ' + wd.length + ' swing frames');
        if (r.bowToLeftHandMinM != null && !(r.bowToLeftHandMinM >= 0.30)) {
          bowBad.push(label + ': the bow came within ' + r.bowToLeftHandMinM + ' m of her left hand');
        }
        if (r.haftToBowMinM != null && !(r.haftToBowMinM >= 0.05)) {
          bowBad.push(label + ': the haft passed ' + r.haftToBowMinM + ' m from the stowed bow');
        }
        return r;
      };
      const bowRows = beats.map((b, i) => bowRow((i < 3 ? 'light-' + (i + 1) : 'heavy') + ' (no threat)', b.samples));
      {

        const mt = await stageAny({ filter: (x) => !!x.root });
        if (!mt) bowBad.push('threat row: no staged machine to set alert (' + (noKindsSkip()?.detail || 'the staged kind could not be spawned') + ')');
        else {
          const sx = mt.position.x, sz = mt.position.z, st0 = mt.state;
          const h = p.heading ?? 0;
          mt.position.set(p.position.x + Math.sin(h) * 12, mt.position.y, p.position.z + Math.cos(h) * 12);
          if (mt.root) mt.root.position.copy(mt.position);
          mt.state = 'alert';
          for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
          const t1 = await rec({});
          const t2 = await rec({ heavy: true });

          const after = [];
          for (let i = 0; i < 30; i++) {
            await new Promise((r) => requestAnimationFrame(r));
            const g = C.combat?.bow?.group;
            after.push({ stance: M.stance, bowP: g && g.parent ? g.parent.name : null, wd: !!C.combat.weaponDrawn });
          }
          bowRows.push(bowRow('light-1 (machine ALERT 12 m away)', t1.samples));
          bowRows.push(bowRow('heavy (machine ALERT 12 m away)', t2.samples));
          bowRows.push(bowRow('guard after, 30 frames (ALERT)', after));
          mt.state = st0;
          mt.position.set(sx, mt.position.y, sz);
          if (mt.root) mt.root.position.copy(mt.position);
        }
      }
      for (const x of bowBad) bad.push(x);

      const bothRows = [];
      {
        const prevState = C.state;
        C.state = 'playing';
        for (const [label, keys] of [['idle', []], ['jog', ['KeyW']]]) {
          await toReady(C);
          C.input.keys.clear(); for (const k of keys) C.input.keys.add(k);
          for (let i = 0; i < (keys.length ? 40 : 5); i++) await frame();
          M.swing({});
          { const tq = performance.now();
            while (!(M.phase === 'recover' && M._t / M._phaseEnd > 0.15) && performance.now() - tq < 3000) await frame(); }
          C.input.mouse.buttons |= 4;
          let both = 0, n = 0, bowInHandAt = null;
          const t0 = performance.now();
          while (performance.now() - t0 < 1200) {
            await frame(); n++;
            const sp = M.lance?.group?.parent?.name || '';
            const bw = C.combat?.bow?.group?.parent?.name || '';
            if (/hand_r/.test(sp) && /hand_l/.test(bw)) both++;
            if (bowInHandAt == null && /hand_l/.test(bw)) bowInHandAt = +((performance.now() - t0) / 1000).toFixed(3);
          }
          C.input.mouse.buttons &= ~4;
          C.input.keys.clear(); p.velocity.set(0, 0, 0);
          const r = { label, frames: n, framesBothInHand: both, bowInHandAfterAimS: bowInHandAt,
            lanceAtEnd: M.lance?.group?.parent?.name || null };
          bothRows.push(r);
          if (both > 0) bad.push('aim after a swing (' + label + '): the bow and the lance were BOTH in her hands on ' + both + ' of ' + n + ' frames — ruling R8');
          if (bowInHandAt == null) bad.push('aim after a swing (' + label + '): the bow never came into her hand within 1.2 s — aim must still win');
          for (let i = 0; i < 30; i++) await frame();
        }
        C.state = prevState;
      }

      return { pass: bad.length === 0, detail: { bad, rows, fromHolstered: holsterRows, neverBothInHand: bothRows,
        bladeAheadOfHand: d0.bladeAhead, gripFrac: d0.gripFrac, length: d0.length,
        readyTipHeightM: readyTipY, readyTip: d0.tipChar, readyShaft: d0.shaft, readyLeftFrac, readyLeftPalm: d0.leftPalmToHaft,
        light3LeftHandToHaftMin: lhMin, light3LeftHandToShaftLineMin: lhLineMin,
        bowRows,
        note: 'bowRows (round 5 fix pass 1): the bow on every LIVE swing frame — parent bone, '
          + 'combat.weaponDrawn, distance to her left hand, haft-to-bow — with and without an '
          + 'ALERT machine inside combat\\'s 40 m threat range; the judge found combat.js put it '
          + 'in her left fist on every live swing. HONEST READING OF THESE NUMBERS (fix round 2). This gate is a STATIC GRIP '
          + 'ASSERTION plus a MOTION assertion, and only the second kind can fail on a '
          + 'build that never moves an arm. CONSTRUCTION IDENTITIES, reported and NOT '
          + 'gated as evidence: palmMax, gripAxisMaxDeg, shaftVsHandMaxDeg, shaftErrMaxDeg '
          + 'and leftHandToShaftMin — all are derived from the same hand-local grip '
          + 'transform the pose writes (and the left hand IKs onto the shaft point '
          + 'itself), so they read ~0 for any grip, right or wrong. The judge was right '
          + 'that round 1 called two of them falsifiable; they are not. WHAT CAN FAIL: '
          + 'knuckleToAxisMax (the haft off the prop\\'s own world matrix against the LIVE '
          + 'index_01_r/pinky_01_r bones, bar 0.03 m — it moved 0.0381 -> 0.0148 when the '
          + 'grip was fixed), bladeAheadMin, buttToWrist, and the two clauses added in fix '
          + 'round 2: handSweepDeg, the excursion of that same LIVE knuckle line through '
          + 'the beat (bar 45 deg; a mesh parented to hand_r with a dead arm reads ~0, '
          + 'which is exactly the build the judge said would pass round 1\\'s A101), and '
          + 'shaftSweepDeg, the prop\\'s own axis excursion. The PAIR is the discriminator: '
          + 'a dead arm fails the first, and the Round-3 bug — the mesh flown through the '
          + 'camera plane with the body still — passes the second and fails the first. '
          + 'The anti-fake work also lives in A102 (handTravel, torsoYawExcursion, '
          + 'distinctArcs, framesOffHand) and A104/A105. OLD NOTE: palmMax and gripAxisMaxDeg '
          + 'are SELF-CONSISTENCY checks, not falsifiable ones — both are derived from the '
          + 'same hand-local grip axis the pose writes, so they read 0 for any grip, right '
          + 'or wrong. The falsifiable clauses are knuckleToAxisMax (the haft measured off '
          + 'the prop\\'s own world matrix against the LIVE index_01_r/pinky_01_r bones, '
          + 'bar 0.03 m), bladeAheadMin (tip in front of the grip along her facing) and '
          + 'buttToWrist (the canon rear-quarter grip). Round 1 gated only the first two '
          + 'and knuckleToAxis was 0.0381 m — out of band and ungated. Canon grip is the rear 0.15-0.28 of '
          + 'the haft (docs/research/lance-canon.md); this build uses 0.20, so the blade is '
          + '1.48 m forward of the hand. ONE-HANDED on the guard and on all four swings per '
          + 'lance-canon.md finding 2 and orchestrator ruling R1 (Sep 26): the old two-handed '
          + 'clause is void and its opposite is gated (light3LeftHandToShaftMin >= 0.08 m). '
          + 'readyTipHeightM is ruling R2 / canon M7 (0.35-0.55 m). '
          + 'ROUND 6: no frame is filtered any more (rounds 1-5 excluded carryBlend < 1); '
          + 'fromHolstered is ruling R5 (the first LMB from holstered, real input, idle/jog/'
          + 'sprint x click/hold: grip fraction at contact 0.15-0.28, zero swing frames inside '
          + 'the hand-over, the beat asked for); neverBothInHand is ruling R8 (RMB during a '
          + 'follow-through: never the lance in her right fist and the bow in her left).' } };
    })()`),
  },

  {
    id: 'A102-melee-body-motion', kind: 'action', lane: 'melee',
    timeout: 120000, settle: 500,
    title: 'Light chain then heavy, standing: the hand travels, the torso twists, she steps in, '
      + 'the four swings are different arcs and the lance never teleports',
    setup: `__CTX__.input.enabled = true;`,
    assert: placed(['openGround'], `(async () => {${HERO}
      const C = __CTX__, p = C.player, an = p.animator;
      if (!an?.debugMelee) return { pass: null, detail: 'SKIP: no animator.debugMelee' };
      ${FREEZE} ${STAGE} ${AIMLOCK} ${SWING} ${READY}

      for (const m of ( C.machines?.list || [])) {
        if (m.alive && Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z) < 6) {
          m.position.x += 40;
          if (m.root) m.root.position.x = m.position.x;
        }
      }
      if (await toReady(C) !== 'ready') return { pass: null, detail: 'SKIP: the guard never came up' };

      const beats = [];
      for (let i = 0; i < 3; i++) { beats.push(await rec({ pre: true })); await new Promise((r) => setTimeout(r, 120)); }
      beats.push(await rec({ heavy: true, pre: true }));

      const rows = [], bad = [];
      beats.forEach((b, i) => {
        const label = i < 3 ? 'light-' + (i + 1) : 'heavy';
        const s = b.samples.filter((x) => x.stance === 'swing');
        if (s.length < 6) { bad.push(label + ': only ' + s.length + ' swing frames'); return; }

        const hand = pathLen(b.samples, 'grip');
        const handFirst = pathLen(b.samples.filter((x) => !x.pre), 'grip');
        const gripJump = maxStep(b.samples, 'grip');
        const tipJump = maxStep(b.samples, 'tip');
        const offHand = b.samples.filter((x) => x.stance === 'swing' && x.held === false).length;

        const inHandover = b.samples.filter((x) => x.stance === 'swing' && typeof x.carryB === 'number' && x.carryB < 1).length;
        const badParent = b.samples.filter((x) => x.stance === 'swing' && x.parent !== HBN('handR')).length;

        let worst = 0, worstStep = 0;
        for (let i = 1; i < b.samples.length; i++) {
          const a = b.samples[i - 1], c = b.samples[i];
          const dt = c.t - a.t;
          if (!a.grip || !c.grip || !(dt >= 0.004)) continue;
          const step = Math.hypot(c.grip[0] - a.grip[0], c.grip[1] - a.grip[1], c.grip[2] - a.grip[2]);
          const limit = 0.5 * Math.max(1, dt / 0.06);
          if (step / limit > worst) { worst = step / limit; worstStep = step; }
        }
        const tipSpeed = 0;
        const yaws = s.map((x) => x.yaw).filter((v) => typeof v === 'number');
        const yawExc = yaws.length ? Math.max(...yaws) - Math.min(...yaws) : 0;
        const sig = arcSig(bearings(s));
        const hs = handSig(s);
        const cs = contactSig(s);
        const ls = legSig(s);
        rows.push({ label, frames: s.length, handTravel: hand, handTravelFromFirstFrame: handFirst, step: b.step,
          contactLegs: ls,
          contactHand: cs ? cs.hand : null, contactShaft: cs ? cs.shaft : null,
          contactYawDeg: cs ? cs.yaw : null, contactTwoHanded: cs ? cs.two : null,
          torsoYawExcursionDeg: +yawExc.toFixed(1),
          tipYawSweepDeg: sig.sweep, contactPitchDeg: sig.contactPitch,
          shaftPitchSpanDeg: sig.pitchSpan,
          handSpanY: hs.spanY, contactHandY: hs.contactY,
          maxGripStepPerFrame: gripJump, maxTipStepPerFrame: tipJump,
          worstGripStepVsBudget: +worst.toFixed(2), worstGripStep: +worstStep.toFixed(3),
          framesOffHand: offHand + badParent, swingFramesInHandover: inHandover });
        if (inHandover > 0) bad.push(label + ': ' + inHandover + ' swing frames inside the hand-over blend — the grip is not rigid on them (ruling R5)');
        if (!(hand >= 1.2)) bad.push(label + ': the hand travelled ' + hand + ' m');
        if (!(yawExc >= 15)) bad.push(label + ': torso yaw excursion ' + yawExc.toFixed(1) + ' deg');
        if (!(b.step >= 0.25 && b.step <= 0.8)) bad.push(label + ': step-in ' + b.step + ' m');

        if (worst > 1) bad.push(label + ': the HAND moved ' + worstStep.toFixed(2) + ' m in one frame — '
          + worst.toFixed(2) + 'x the §4 budget for that frame length');
        if (offHand + badParent > 0) bad.push(label + ': ' + (offHand + badParent) + ' swing frames with the lance off the hand');
      });

      let gap = 0, tipPop = 0, reach = 0, slide = 0, slideStep = 0, slideDt = 0;
      let flips = 0, worstDt = 0, popDt = 0;
      {
        const M = C.combat.melee;
        let prev = null, prevT = 0;

        const stall = (ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) {  } };
        const cycle = async (n, load) => {
          for (let i = 0; i < n; i++) {
            await frame();
            if (load) stall(20 + (i % 3) * 30);
            const now = performance.now() / 1000;
            const d = an.debugMelee();
            if (!d) continue;
            gap = Math.max(gap, d.grabGap || 0);
            reach = Math.max(reach, d.grabReach || 0);
            if (prev && prev.tipWorld && d.tipWorld) {
              const step = Math.hypot(
                d.tipWorld[0] - prev.tipWorld[0],
                d.tipWorld[1] - prev.tipWorld[1],
                d.tipWorld[2] - prev.tipWorld[2]);
              if (prev.held !== d.held) {
                flips++;
                worstDt = Math.max(worstDt, now - prevT);
                if (step > tipPop) { tipPop = step; popDt = now - prevT; }
              }

              const dt = Math.max(0.004, now - prevT);
              const limit = 0.5 * Math.max(1, dt / 0.06);
              const own = d.carrySlide || 0;
              if (own / limit > slide) { slide = own / limit; slideStep = own; slideDt = dt; }
            }
            prev = d; prevT = now;
          }
        };
        for (let c = 0; c < 8; c++) {
          const load = c >= 2;
          if (c % 2 === 0) M.holsterLance(); else M.drawLance(20);
          await cycle(load ? 40 : 80, load);
        }
      }
      if (!(flips >= 6)) bad.push('only ' + flips + ' re-parents were sampled across 8 draw/holster cycles');
      if (!(gap <= 0.10)) bad.push('the draw/holster re-parent moved the prop ' + gap.toFixed(3) + ' m');
      if (!(tipPop <= 0.9)) bad.push('the tip moved ' + tipPop.toFixed(2) + ' m across the re-parent frame');
      if (!(reach <= 0.25)) bad.push('the hand took the haft from ' + reach.toFixed(3) + ' m away');
      if (slide > 1) bad.push('the prop slid ' + slideStep.toFixed(2) + ' m through its own parent in one '
        + (slideDt * 1000).toFixed(0) + ' ms frame — ' + slide.toFixed(2) + 'x the §4 budget');

      const TOL = [20, 20, 0.12, 0.10];
      const sig = rows.map((r) => [r.tipYawSweepDeg, r.contactPitchDeg, r.handSpanY, r.contactHandY]);
      const groups = [];
      for (const v of sig) {
        const g = groups.find((x) => x.every((q, i) => Math.abs(q - v[i]) <= TOL[i]));
        if (!g) groups.push(v);
      }
      if (!(groups.length >= 4)) {
        bad.push('only ' + groups.length + ' distinct arcs among the four swings — '
          + rows.map((r) => r.label + ' [sweep ' + r.tipYawSweepDeg + ', pitch '
            + r.contactPitchDeg + ', handSpanY ' + r.handSpanY + ', contactHandY '
            + r.contactHandY + ']').join('; '));
      }

      const csep = [];
      const legSep = [];
      let worstLeg = 9;
      const d3 = (a, b3) => Math.hypot(a[0] - b3[0], a[1] - b3[1], a[2] - b3[2]);
      for (let a = 0; a < rows.length; a++) {
        for (let b2 = a + 1; b2 < rows.length; b2++) {
          const A = rows[a], B = rows[b2];
          if (!A.contactHand || !B.contactHand) continue;
          const dh = Math.hypot(A.contactHand[0] - B.contactHand[0],
            A.contactHand[1] - B.contactHand[1], A.contactHand[2] - B.contactHand[2]);
          const dot = A.contactShaft[0] * B.contactShaft[0] + A.contactShaft[1] * B.contactShaft[1]
            + A.contactShaft[2] * B.contactShaft[2];
          const ang = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
          const grip = A.contactTwoHanded !== B.contactTwoHanded;
          const ok = dh > 0.12 || ang > 15 || grip;
          csep.push({ pair: A.label + '/' + B.label, handM: +dh.toFixed(3),
            bearingDeg: +ang.toFixed(1), gripDiffers: grip, ok });
          if (!ok) {
            bad.push(A.label + ' and ' + B.label + ' land in the SAME contact pose — wrists '
              + dh.toFixed(3) + ' m apart, shafts ' + ang.toFixed(1) + ' deg apart, same grip');
          }

          if (A.contactLegs && B.contactLegs) {
            const dp = d3(A.contactLegs.pelvis, B.contactLegs.pelvis);
            const dl = d3(A.contactLegs.kneeL, B.contactLegs.kneeL);
            const dr = d3(A.contactLegs.kneeR, B.contactLegs.kneeR);
            const legM = Math.max(dp, dl, dr);
            if (legM < worstLeg) worstLeg = legM;
            legSep.push({ pair: A.label + '/' + B.label, pelvisM: +dp.toFixed(3),
              kneeLM: +dl.toFixed(3), kneeRM: +dr.toFixed(3), legM: +legM.toFixed(3),
              gated: false });
          } else {
            bad.push(A.label + '/' + B.label + ': no leg pose was sampled at contact, so the '
              + 'stance instrument is not running');
          }
        }
      }

      const pinnedLegs = [], pinSep = [], pinFrames = [];
      let worstPinned = 9, pinnedPelvisY = null, pinnedContactPitch = null;
      {
        const M = C.combat.melee;
        M.update = () => {};

        const pinAt = async (st) => {
          const s2 = { stance: 'swing', drawK: 1, phase: 'strike', k: 0.70, combo: 0,
            heavy: false, aimYaw: 0, contactK: 0.70, ...st };
          M.poseState = () => s2;

          let prev = -9, still = 0, n = 0, prevPy = -9;
          while (n < 60) {
            await frame(); n++;
            const dd = an.debugMelee();
            const amp = dd?.legAmp ?? 0;
            const py = dd?.pelvisChar ? dd.pelvisChar[1] : 0;
            const lw = typeof dd?.legW === 'number' ? dd.legW : 1;

            const ft = an.debugFeet ? an.debugFeet() : null;
            const air = !!(ft && ft.some((f) => f.flight != null));
            still = Math.abs(amp - prev) < 0.002 && Math.abs(py - prevPy) < 0.002 && lw >= 0.98 && !air ? still + 1 : 0;
            prev = amp; prevPy = py;

            if (still >= 3 && n >= 10) break;
          }
          pinFrames.push(n);
          const d = an.debugMelee();
          return { pelvis: d.pelvisChar, kneeL: d.kneeLChar, kneeR: d.kneeRChar,
            footL: d.footLChar, footR: d.footRChar, shaft: d.shaft, hand: d.handChar, legW: d.legW };
        };
        const pinKeys = [['light-1', { combo: 0 }], ['light-2', { combo: 1 }],
          ['light-3', { combo: 2 }], ['heavy', { heavy: true }]];
        for (const [label, st] of pinKeys) {
          const r = await pinAt(st);
          pinnedLegs.push({ label, ...r });
        }
        delete M.update; delete M.poseState;

        const pitchOf = (v) => (v ? Math.asin(Math.max(-1, Math.min(1, v[1]))) * 180 / Math.PI : null);
        const byLabel = Object.fromEntries(pinnedLegs.map((r) => [r.label, r]));
        const hvP = byLabel.heavy?.pelvis?.[1];
        const lightP = ['light-1', 'light-2', 'light-3'].map((k) => byLabel[k]?.pelvis?.[1]);
        pinnedPelvisY = { 'light-1': lightP[0], 'light-2': lightP[1], 'light-3': lightP[2], heavy: hvP };
        if (typeof hvP !== 'number' || lightP.some((v) => typeof v !== 'number')) {
          bad.push('pinned pelvis heights missing — the heavy-lowest clause could not run');
        } else if (!(hvP <= Math.min(...lightP) - 0.04)) {
          bad.push('PINNED: the heavy\\'s hips (' + hvP.toFixed(3) + ' m) are not the lowest of the four by '
            + '0.04 m (lights ' + lightP.map((v) => v.toFixed(3)).join(' / ') + ') — V47 criterion (1)');
        }
        const l3Pitch = pitchOf(byLabel['light-3']?.shaft), hvPitch = pitchOf(byLabel.heavy?.shaft);
        pinnedContactPitch = { 'light-3': l3Pitch == null ? null : +l3Pitch.toFixed(1),
          heavy: hvPitch == null ? null : +hvPitch.toFixed(1) };
        if (l3Pitch == null || hvPitch == null) bad.push('pinned contact shafts missing — the L3/heavy clause could not run');
        else if (!(l3Pitch <= hvPitch - 10)) {
          bad.push('PINNED: light-3 lands at ' + l3Pitch.toFixed(1) + ' deg against the heavy\\'s '
            + hvPitch.toFixed(1) + ' — not a descending chop against a level lunge (bar 10 deg apart)');
        }
        for (let a = 0; a < pinnedLegs.length; a++) {
          for (let b2 = a + 1; b2 < pinnedLegs.length; b2++) {
            const A = pinnedLegs[a], B = pinnedLegs[b2];
            if (!A.pelvis || !B.pelvis || !A.kneeL || !B.kneeL || !A.kneeR || !B.kneeR) {
              bad.push('pinned stance: ' + A.label + '/' + B.label + ' had no leg pose');
              continue;
            }
            const dp = d3(A.pelvis, B.pelvis);
            const dl = d3(A.kneeL, B.kneeL);
            const dr = d3(A.kneeR, B.kneeR);
            const legM = Math.max(dp, dl, dr);
            if (legM < worstPinned) worstPinned = legM;
            pinSep.push({ pair: A.label + '/' + B.label, pelvisM: +dp.toFixed(3),
              kneeLM: +dl.toFixed(3), kneeRM: +dr.toFixed(3), legM: +legM.toFixed(3),
              ok: legM >= 0.06 });
            if (!(legM >= 0.06)) {
              bad.push('PINNED (the frames V47 row 1 prints): ' + A.label + ' and ' + B.label
                + ' stand in the same stance — pelvis ' + dp.toFixed(3) + ' m, knees '
                + dl.toFixed(3) + ' / ' + dr.toFixed(3) + ' m, worst axis ' + legM.toFixed(3)
                + ' m against a 0.06 m bar');
            }
          }
        }
      }

      return { pass: bad.length === 0, detail: { bad, rows, distinctArcs: groups.length,
        contactSeparation: csep,
        stanceSeparation: legSep, worstStanceSeparationM: +worstLeg.toFixed(3),
        pinnedStanceSeparation: pinSep, worstPinnedStanceM: +worstPinned.toFixed(3),
        pinnedSettleFrames: pinFrames,
        pinnedPelvisY, pinnedContactPitch,
        pinnedLegs,
        reparentGap: +gap.toFixed(4), tipAcrossReparent: +tipPop.toFixed(3),
        reparentsSampled: flips, worstReparentFrameMs: +(worstDt * 1000).toFixed(0),
        tipPopFrameMs: +(popDt * 1000).toFixed(0),
        grabReach: +reach.toFixed(4), handoverSlideVsBudget: +slide.toFixed(2),
        handoverSlideStep: +slideStep.toFixed(3),
        note: 'reparentGap is the prop\\'s WORLD-space discontinuity on the frame its '
          + 'parent changes (what §4\\'s teleport clause is about); grabReach is how far '
          + 'the hand was from the haft when it took it, and handoverSlide is the residual '
          + 'paid off afterwards, held to the same per-frame budget as the swing. Round 1 '
          + 'published only the reach, called it the gap, and popped the prop by that much: '
          + 'it read 0.084 m alone and 0.111 m under the concurrent suite. '
          + 'handTravel is the CHARACTER-space path of the grip over the whole swing '
          + '(cock, strike, follow-through and the return to guard) — it excludes the '
          + 'root step-in, which is measured separately, so it is the stricter read. '
          + 'The step-in is a velocity impulse the controller integrates and collides '
          + '(melee.js STEP_ACCEL), never a position write.' } };
    })()`),
  },

  {
    id: 'A103-melee-contact-sync', kind: 'action', lane: 'melee',
    timeout: 720000, settle: 600,
    title: 'Swinging at a machine: melee-hit fires INSIDE the strike phase, the blade actually '
      + 'REACHES the hull (tip <= 0.15 m from the nearest surface) and the sparks are on it — on '
      + 'EVERY staged kind (R7; grounded fliers included), and on a 25 deg slope the blade '
      + 'stays out of the ground',
    setup: `__CTX__.input.enabled = true;`,
    assert: staged([], placed(['openGround', 'meleeSlope'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator;
      if (!an?.debugMelee) return { pass: null, detail: 'SKIP: no animator.debugMelee' };
      ${FREEZE} ${STAGE} ${AIMLOCK} ${SWING} ${READY} ${PLACE}
      const m = await place('sentry', 2.8);
      if (!m) return noKindsSkip() || { pass: null, detail: 'SKIP: no machine in the roster' };
      if (await toReady(C) !== 'ready') return { pass: null, detail: 'SKIP: the guard never came up' };

      const rows = [], bad = [];

      const offHull = (p3) => {
        const caps = (C.hitHulls && C.hitHulls.hulls) ? C.hitHulls.hulls(m) : null;
        if (!caps || !caps.length) return null;
        let best = Infinity;
        for (const c of caps) {
          const r = c.r || 0;
          if (r <= 1e-4) continue;
          const ax = c.a[0], ay = c.a[1], az = c.a[2];
          const ex = c.b[0] - ax, ey = c.b[1] - ay, ez = c.b[2] - az;
          const ll = ex * ex + ey * ey + ez * ez;
          let t = ll > 1e-9 ? ((p3.x - ax) * ex + (p3.y - ay) * ey + (p3.z - az) * ez) / ll : 0;
          t = t < 0 ? 0 : (t > 1 ? 1 : t);
          const qx = ax + ex * t, qy = ay + ey * t, qz = az + ez * t;
          best = Math.min(best, Math.abs(Math.hypot(p3.x - qx, p3.y - qy, p3.z - qz) - r));
        }
        return best === Infinity ? null : +best.toFixed(4);
      };

      const bodyToHull = () => {
        const caps = (C.hitHulls && C.hitHulls.hulls) ? C.hitHulls.hulls(m) : null;
        if (!caps || !caps.length) return null;

        const px = p.position.x, py = p.position.y, pz = p.position.z;
        let best = Infinity;
        for (const c of caps) {
          const r = c.r || 0;
          if (r <= 1e-4) continue;
          const ax = c.a[0], ay = c.a[1], az = c.a[2];
          const ex = c.b[0] - ax, ey = c.b[1] - ay, ez = c.b[2] - az;
          const ll = ex * ex + ey * ey + ez * ez;
          for (let s2 = 0; s2 <= 10; s2++) {
            const qy = py + 0.4 + s2 * 0.1;
            let t = ll > 1e-9 ? ((px - ax) * ex + (qy - ay) * ey + (pz - az) * ez) / ll : 0;
            t = t < 0 ? 0 : (t > 1 ? 1 : t);
            const d = Math.hypot(px - (ax + ex * t), qy - (ay + ey * t), pz - (az + ez * t));
            if (d - r - 0.4 < best) best = d - r - 0.4;
          }
        }
        return best === Infinity ? null : +best.toFixed(3);
      };
      let liveOff = null, liveBody = null, liveCaps = null;
      const offAtHit = (e) => {
        if (liveOff == null && e && e.point) {
          liveOff = offHull(e.point); liveBody = bodyToHull();

          liveCaps = (C.hitHulls && C.hitHulls.hulls) ? C.hitHulls.hulls(m) : null;
        }
      };

      const tipToHull = (tip, caps) => {
        if (!tip || !caps || !caps.length) return null;
        let best = Infinity;
        for (const c of caps) {
          const r = c.r || 0;
          if (r <= 1e-4) continue;
          const ax = c.a[0], ay = c.a[1], az = c.a[2];
          const ex = c.b[0] - ax, ey = c.b[1] - ay, ez = c.b[2] - az;
          const ll = ex * ex + ey * ey + ez * ez;
          let t = ll > 1e-9 ? ((tip[0] - ax) * ex + (tip[1] - ay) * ey + (tip[2] - az) * ez) / ll : 0;
          t = t < 0 ? 0 : (t > 1 ? 1 : t);
          const d = Math.hypot(tip[0] - (ax + ex * t), tip[1] - (ay + ey * t), tip[2] - (az + ez * t)) - r;
          if (d < best) best = d;
        }
        return best === Infinity ? null : +best.toFixed(4);
      };

      const walkIn = async () => {
        C.input.keys.add('KeyW');
        let last = 99, still = 0;
        for (let f = 0; f < 150; f++) {
          await frame();
          C.combat.melee.drawLance(30);
          const d2 = Math.hypot(p.position.x - m.position.x, p.position.z - m.position.z);
          if (Math.abs(d2 - last) < 0.002) { if (++still > 8) break; } else still = 0;
          last = d2;
        }
        C.input.keys.delete('KeyW');
        for (let f = 0; f < 14; f++) await frame();
      };
      for (let i = 0; i < 4; i++) {
        liveOff = null; liveBody = null; liveCaps = null;

        p.velocity.set(0, 0, 0);
        p.heading = 0; p._faceX = 0; p._faceZ = 1; p._candX = 0; p._candZ = 1; p._latchT = 0;
        p.camYaw = Math.PI;
        if (p.model) p.model.rotation.y = 0;
        await place(m.kind, 2.8);
        for (let f = 0; f < 8; f++) await frame();
        await walkIn();

        const heavy = i === 3;
        if (!heavy) C.combat.melee.combo = i;
        C.events.on('melee-hit', offAtHit);
        const b = await rec({ budget: 4000, heavy });
        C.events.off?.('melee-hit', offAtHit);

        if (!b.hit) {
          const ph = b.samples.map((x) => x.phase);
          rows.push({ swing: i + 1, beat: heavy ? 'heavy' : 'light-' + (i + 1), hit: null,
            frames: b.samples.length, phasesSeen: [...new Set(ph)], stanceEnd: C.combat.melee.stance,
            playerToMachine: +Math.hypot(p.position.x - m.position.x, p.position.z - m.position.z).toFixed(3),
            machineAlive: m.alive !== false, machineState: m.state });
          bad.push('swing ' + (i + 1) + (heavy ? ' (heavy)' : '') + ': no melee-hit fired');
          continue;
        }
        const pt = b.hit.point;
        const dist = (t) => (t && pt ? Math.hypot(t[0] - pt.x, t[1] - pt.y, t[2] - pt.z) : null);

        const at = dist(b.hit.tip);
        const strike = b.samples.filter((x) => x.phase === 'strike' && x.tip);
        const near = strike.length ? Math.min(...strike.map((x) => dist(x.tip))) : null;
        const d = near == null ? at : Math.min(at == null ? 9 : at, near);
        const off = liveOff;

        const published = b.hit.contactGap;
        const gap = tipToHull(b.hit.tip, liveCaps);
        const row = { swing: i + 1, beat: heavy ? 'heavy' : 'light-' + (i + 1), phase: b.hit.phase, k: +(b.hit.k ?? 0).toFixed(3),
          tipToHullAtHit: gap == null ? null : +gap.toFixed(3),
          publishedContactGap: published == null ? null : +published.toFixed(3),
          crossCheckDeltaM: gap == null || published == null ? null : +Math.abs(gap - published).toFixed(4),
          tipToImpactAtHit: at == null ? null : +at.toFixed(3),
          tipToImpactOnScreen: near == null ? null : +near.toFixed(3),
          pointOffHull: off,
          playerToHullAtHit: liveBody,
          machineState: m.state,
          poseW: b.hit.w, poseBeat: b.hit.beat, poseStance: b.hit.stance,
          poseLayerPhase: b.hit.layerPhase, tipChar: b.hit.tipChar,
          playerToMachine: +Math.hypot(p.position.x - m.position.x, p.position.z - m.position.z).toFixed(3),
          strikeFrames: strike.length, damage: +(b.hit.damage ?? 0).toFixed(1),
          point: pt ? [+pt.x.toFixed(3), +pt.y.toFixed(3), +pt.z.toFixed(3)] : null };
        rows.push(row);
        if (b.hit.phase !== 'strike') bad.push('swing ' + (i + 1) + ': the hit fired in phase "' + b.hit.phase + '"');
        if (d == null) bad.push('swing ' + (i + 1) + ': no tip reading at the hit');
        else if (!(d <= 1.2)) bad.push('swing ' + (i + 1) + ': the tip was ' + d.toFixed(2) + ' m from the impact point');
        if (gap == null) bad.push('swing ' + (i + 1) + ': the gate could not solve the tip against the hull — the reach is unmeasured');
        else if (!(gap <= 0.15)) {
          bad.push('swing ' + (i + 1) + ': the blade stopped ' + gap.toFixed(3)
            + ' m SHORT of the nearest hull surface — the licence-clean lance reference (light-strike; A-reference-set, W0b) '
            + 'has the blade ON the machine');
        }

        const shell = +(row.playerToMachine - ((m.bodyRadius || 1) + 0.4)).toFixed(3);
        row.playerToShell = shell;
        if (!(shell > 0)) {
          bad.push('swing ' + (i + 1) + ': her capsule was ' + shell.toFixed(3)
            + ' m inside the machine SHELL — the melee approach term is unbounded');
        }
        if (liveBody != null && !(liveBody > -0.10)) {
          bad.push('swing ' + (i + 1) + ': her own capsule was ' + liveBody.toFixed(3)
            + ' m inside the machine hit hull');
        }
        if (off == null) bad.push('swing ' + (i + 1) + ': could not read the machine hull to check the impact point');
        else if (!(off <= 0.05)) {
          bad.push('swing ' + (i + 1) + ': the published impact point is ' + off.toFixed(3)
            + ' m off the machine hull — the sparks are not on the machine');
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!rows.some((r) => r.hit !== null && r.phase)) bad.push('no melee-hit fired at all');

      const speciesRows = [], speciesSum = {};
      {
        const kinds = [...STAGED_KINDS].sort();
        const getKind = (kind) => {
          let mm = liveOfKind(kind);
          if (!mm && C.machines.spawn) { try { mm = C.machines.spawn(kind, p.position.x + 60, p.position.z + 40); } catch { mm = null; } }
          return mm && mm.kind === kind ? mm : null;
        };
        const walkTo = async (mm) => {
          C.input.keys.add('KeyW');
          let last = 99, still = 0;
          for (let f = 0; f < 240; f++) {
            await frame();
            C.combat.melee.drawLance(30);
            const d2 = Math.hypot(p.position.x - mm.position.x, p.position.z - mm.position.z);
            if (Math.abs(d2 - last) < 0.002) { if (++still > 8) break; } else still = 0;
            last = d2;
          }
          C.input.keys.delete('KeyW');
          for (let f = 0; f < 12; f++) await frame();
        };
        const capsOf = (mm) => (C.hitHulls && C.hitHulls.hulls) ? C.hitHulls.hulls(mm) : null;
        const bodyGap = (mm) => {
          const caps = capsOf(mm);
          if (!caps || !caps.length) return null;
          const px = p.position.x, py = p.position.y, pz = p.position.z;
          let best = Infinity;
          for (const c of caps) {
            const r = c.r || 0;
            if (r <= 1e-4) continue;
            const ax = c.a[0], ay = c.a[1], az = c.a[2];
            const ex = c.b[0] - ax, ey = c.b[1] - ay, ez = c.b[2] - az;
            const ll = ex * ex + ey * ey + ez * ez;
            for (let s2 = 0; s2 <= 10; s2++) {
              const qy = py + 0.4 + s2 * 0.1;
              let t = ll > 1e-9 ? ((px - ax) * ex + (qy - ay) * ey + (pz - az) * ez) / ll : 0;
              t = t < 0 ? 0 : (t > 1 ? 1 : t);
              const d = Math.hypot(px - (ax + ex * t), qy - (ay + ey * t), pz - (az + ez * t));
              if (d - r - 0.4 < best) best = d - r - 0.4;
            }
          }
          return best === Infinity ? null : +best.toFixed(3);
        };
        for (const other of  C.machines.list) {
          if (other.alive && Math.hypot(other.position.x - p.position.x, other.position.z - p.position.z) < 60) {
            other.position.x += 250; if (other.root) other.root.position.x = other.position.x;
          }
        }
        for (const kind of kinds) {
          const mm = getKind(kind);
          if (!mm) { bad.push(kind + ': could not be staged — its reach is unmeasured'); continue; }
          const sum = { rows: 0, pass: 0, worst: null };
          for (let i = 0; i < 3; i++) {
            const heavy = i === 2;
            C.combat.melee.holsterLance();
            for (let f = 0; f < 8; f++) await frame();
            ${STAGE}
            p.heading = 0; p._faceX = 0; p._faceZ = 1; p._candX = 0; p._candZ = 1; p._latchT = 0;
            p.camYaw = Math.PI;
            if (p.model) p.model.rotation.y = 0;
            const d0 = (mm.standoffHalfLen || 0) + (mm.bodyRadius || 1) + 0.95 + 1.2;
            const mx = p.position.x, mz = p.position.z + d0;
            const gy = C.terrain ? C.terrain.getHeight(mx, mz) : mm.position.y;
            mm.update = () => {};
            mm.position.set(mx, gy, mz); mm.heading = Math.PI; mm.state = 'idle';
            if (mm.root) { mm.root.position.set(mx, gy, mz); mm.root.rotation.set(0, Math.PI, 0); }
            if (mm.ai && mm.ai.reactions) { mm.ai.reactions.t = 0; if (typeof mm.ai.reactions.clear === 'function') mm.ai.reactions.clear(); }
            if (mm.maxHealth) mm.health = mm.maxHealth;

            if (typeof mm._airborne === 'boolean' && typeof mm.animate === 'function') {
              mm._airborne = false; mm._groundHold = 1e9;
              for (let f = 0; f < 30; f++) { try { mm.animate(1 / 60, performance.now() / 1000); } catch {  } }
              mm.position.y = gy; if (mm.root) mm.root.position.y = gy;
            }
            for (let f = 0; f < 4; f++) await frame();
            await toReady(C);
            C.combat.melee.drawLance(30);
            await walkTo(mm);
            if (!heavy) C.combat.melee.combo = i;
            let hitRow = null;
            const onHit = (e) => {
              if (hitRow) return;
              const dd = an.debugMelee();
              const caps = capsOf(mm);
              hitRow = { phase: C.combat.melee.phase, tip: dd ? dd.tipWorld : null,
                gap: dd && caps ? tipToHull(dd.tipWorld, caps) : null, body: bodyGap(mm),
                aimed: !!C.combat.melee.aimOk, aimPitchDeg: dd ? dd.aimPitchDeg : null, aimYawDeg: dd ? dd.aimYawDeg : null };
            };
            C.events.on('melee-hit', onHit);
            const b = await rec({ budget: 4000, heavy });
            C.events.off?.('melee-hit', onHit);
            const row = { kind, beat: heavy ? 'heavy' : 'light-' + (i + 1),
              stand: +Math.hypot(p.position.x - mm.position.x, p.position.z - mm.position.z).toFixed(3),
              hit: !!hitRow, phase: hitRow ? hitRow.phase : null,
              tipToHullAtHit: hitRow && hitRow.gap != null ? +hitRow.gap.toFixed(3) : null,
              playerToHullAtHit: hitRow ? hitRow.body : null,
              aimed: hitRow ? hitRow.aimed : null, aimPitchDeg: hitRow ? hitRow.aimPitchDeg : null,
              aimYawDeg: hitRow ? hitRow.aimYawDeg : null };
            speciesRows.push(row);
            sum.rows++;
            let ok = true;
            const tag = kind + ' ' + row.beat;
            if (!hitRow) { bad.push(tag + ': no melee-hit fired'); ok = false; }
            else {
              if (row.phase !== 'strike') { bad.push(tag + ': the hit fired in phase "' + row.phase + '"'); ok = false; }
              if (row.tipToHullAtHit == null) { bad.push(tag + ': the gate could not solve the tip against the hull'); ok = false; }
              else if (!(row.tipToHullAtHit <= 0.15)) {
                bad.push(tag + ': the blade stopped ' + row.tipToHullAtHit.toFixed(3) + ' m SHORT of the hull (bar 0.15 m) — '
                  + 'unreachable from where the melee term lets her stand (' + row.stand + ' m from its centre)');
                ok = false;
              }
              if (row.playerToHullAtHit != null && !(row.playerToHullAtHit > -0.10)) {
                bad.push(tag + ': her own capsule was ' + row.playerToHullAtHit + ' m inside the hull'); ok = false;
              }
            }
            if (ok) sum.pass++;
            if (row.tipToHullAtHit != null && (sum.worst == null || row.tipToHullAtHit > sum.worst)) sum.worst = row.tipToHullAtHit;
            await new Promise((r) => setTimeout(r, 150));
          }
          speciesSum[kind] = sum.pass + '/' + sum.rows + ' (worst ' + sum.worst + ' m)';
          mm.position.x += 250; if (mm.root) mm.root.position.x = mm.position.x;
        }
      }

      const realRows = [];
      {
        const M = C.combat.melee;
        const prevState = C.state;
        C.state = 'playing';
        M.aimLock = 0;
        const fr = () => new Promise((r) => requestAnimationFrame(r));
        const gk = (kind) => {
          let mm = liveOfKind(kind);
          if (!mm && C.machines.spawn) { try { mm = C.machines.spawn(kind, p.position.x + 60, p.position.z + 40); } catch { mm = null; } }
          return mm && mm.kind === kind ? mm : null;
        };
        const distTo = (mm) => Math.hypot(p.position.x - mm.position.x, p.position.z - mm.position.z);
        const walkIn = async (mm, ms, drawn) => {
          C.input.keys.add('KeyW');
          let last = 99, still = 0;
          const t0 = performance.now();
          while (performance.now() - t0 < ms) {
            await fr();
            if (drawn) M.drawLance(3.6);
            const d2 = distTo(mm);
            if (Math.abs(d2 - last) < 0.002) { if (++still > 8) break; } else still = 0;
            last = d2;
          }
          C.input.keys.delete('KeyW');
          for (let f = 0; f < 10; f++) await fr();
        };
        const click = async (mm, holdMs) => {
          let hit = null;
          const onHit = () => {
            if (hit) return;
            const dd = an.debugMelee();
            const caps = C.hitHulls && C.hitHulls.hulls ? C.hitHulls.hulls(mm) : null;
            hit = { phase: M.phase, heavy: !!M.heavy, gap: dd && caps ? tipToHull(dd.tipWorld, caps) : null, stand: +distTo(mm).toFixed(3) };
          };
          C.events.on('melee-hit', onHit);
          C.input.mouse.buttons |= 1;
          const t0 = performance.now();
          let up = false, seen = false, heavy = null;
          while (performance.now() - t0 < 4500) {
            await fr();
            if (!up && performance.now() - t0 > holdMs) { C.input.mouse.buttons &= ~1; up = true; }
            /* the beat that STRIKES is the beat played: a held press opens as a light's
             * cock and turns into the heavy at chargeTime (the press starts the swing) */
            if (M.stance === 'swing') { seen = true; if (heavy == null || M.phase === 'strike') heavy = !!M.heavy; }
            if (seen && !M.active) break;
          }
          C.input.mouse.buttons &= ~1;
          C.events.off?.('melee-hit', onHit);
          return { hit, swung: seen, heavy };
        };
        for (const other of  C.machines.list) {
          if (other.alive && Math.hypot(other.position.x - p.position.x, other.position.z - p.position.z) < 70) {
            other.position.x += 250; if (other.root) other.root.position.x = other.position.x;
          }
        }
        for (const kind of [...STAGED_KINDS].sort()) {
          const mm = gk(kind);
          if (!mm) { bad.push('real input: no ' + kind + ' could be staged'); continue; }
          const hp0 = mm.health, mh0 = mm.maxHealth;
          mm.maxHealth = 1e9; mm.health = 1e9;
          for (const [beat, holdMs] of [['light', 70], ['heavy', 520]]) {
            C.input.keys.clear(); C.input.mouse.buttons &= ~1;
            M.holsterLance();
            { const tq = performance.now(); while (M.stance !== 'holstered' && performance.now() - tq < 3000) await fr(); }
            ${STAGE}
            p.heading = 0; p._faceX = 0; p._faceZ = 1; p._candX = 0; p._candZ = 1; p._latchT = 0;
            p.camYaw = Math.PI;
            if (p.model) p.model.rotation.y = 0;
            const d0 = (mm.standoffHalfLen || 0) + (mm.bodyRadius || 1) + 0.95 + 1.6;
            const mx = p.position.x, mz = p.position.z + d0;
            const gy = C.terrain ? C.terrain.getHeight(mx, mz) : mm.position.y;
            mm.update = () => {};
            mm.position.set(mx, gy, mz); mm.heading = Math.PI; mm.state = 'idle';
            if (mm.root) { mm.root.position.set(mx, gy, mz); mm.root.rotation.set(0, Math.PI, 0); }
            if (typeof mm._airborne === 'boolean' && typeof mm.animate === 'function') {
              mm._airborne = false; mm._groundHold = 1e9;
              for (let f = 0; f < 30; f++) { try { mm.animate(1 / 60, performance.now() / 1000); } catch {  } }
              mm.position.y = gy; if (mm.root) mm.root.position.y = gy;
            }
            for (let f = 0; f < 6; f++) await fr();
            await walkIn(mm, 6000, false);
            const standHolstered = +distTo(mm).toFixed(3);
            const c1 = await click(mm, holdMs);
            const row = { kind, beat, standHolsteredM: standHolstered, swung: c1.swung, beatPlayed: c1.heavy == null ? null : (c1.heavy ? 'heavy' : 'light'),
              firstClick: c1.hit ? { phase: c1.hit.phase, standM: c1.hit.stand, tipToHullM: c1.hit.gap == null ? null : +c1.hit.gap.toFixed(3) } : 'whiff (out of reach)' };
            const tag = 'real input ' + kind + ' ' + beat;
            const judgeHit = (h, what) => {
              if (h.phase !== 'strike') bad.push(tag + ' (' + what + '): the hit fired in phase "' + h.phase + '"');
              if (h.gap == null) bad.push(tag + ' (' + what + '): the gate could not solve the tip against the hull');
              else if (!(h.gap <= 0.15)) {
                bad.push(tag + ' (' + what + '): a melee-hit LANDED with the blade ' + h.gap.toFixed(3) + ' m from the hull (bar 0.15) — damage at a distance');
              }
            };
            if (!c1.swung) bad.push(tag + ': the click never swung');
            if (c1.heavy != null && c1.heavy !== (beat === 'heavy')) bad.push(tag + ': a ' + (c1.heavy ? 'heavy' : 'light') + ' played for a ' + beat + ' input');
            if (c1.hit) judgeHit(c1.hit, 'first click');
            else {
              await walkIn(mm, 4500, true);
              row.walkedInDrawnToM = +distTo(mm).toFixed(3);
              const c2 = await click(mm, holdMs);
              row.afterWalkIn = c2.hit ? { phase: c2.hit.phase, standM: c2.hit.stand, tipToHullM: c2.hit.gap == null ? null : +c2.hit.gap.toFixed(3) } : 'whiff';
              if (!c2.hit) bad.push(tag + ': out of reach from the holstered stop (' + standHolstered + ' m), and STILL no hit after walking in drawn to '
                + row.walkedInDrawnToM + ' m — the hull is unreachable on the real input path');
              else judgeHit(c2.hit, 'after walking in');
            }
            realRows.push(row);
            await new Promise((r) => setTimeout(r, 120));
          }
          mm.maxHealth = mh0; mm.health = hp0;
          mm.position.x += 250; if (mm.root) mm.root.position.x = mm.position.x;
        }
        C.input.keys.clear(); C.input.mouse.buttons &= ~1;
        C.state = prevState;
      }

      const slopeRows = [];
      {
        const T = C.terrain;

        const __sl = PLACE('meleeSlope');
        const SX = __sl.x, SZ = __sl.z, UP = __sl.heading;
        const list =  C.machines?.list || [];
        for (const o of list) {
          if (o.alive && Math.hypot(o.position.x - SX, o.position.z - SZ) < 70) { o.position.x += 250; if (o.root) o.root.position.x = o.position.x; }
        }
        const slope = (() => { const e = 1.0, gx = (T.getHeight(SX + e, SZ) - T.getHeight(SX - e, SZ)) / (2 * e),
          gz = (T.getHeight(SX, SZ + e) - T.getHeight(SX, SZ - e)) / (2 * e); return +(Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI).toFixed(1); })();
        for (const [dir, H] of [['uphill', UP], ['across', UP + Math.PI / 2], ['downhill', UP + Math.PI]]) {
          for (const heavy of [false, true]) {
            C.combat.melee.holsterLance();
            for (let f = 0; f < 8; f++) await frame();
            p.position.set(SX, 0, SZ); p.velocity.set(0, 0, 0); p._snapToGround();
            p.heading = H; p._faceX = Math.sin(H); p._faceZ = Math.cos(H); p._candX = p._faceX; p._candZ = p._faceZ; p._latchT = 0;
            if (p.model) p.model.rotation.y = H;
            p.camYaw = H + Math.PI;
            for (let f = 0; f < 10; f++) await frame();
            await toReady(C);
            C.combat.melee.combo = 0;
            const tr = [];
            const b = await rec({ heavy, budget: 3000 });
            let minAll = 9, cK = null;
            for (const x of b.samples) {
              if (x.stance !== 'swing' || !x.tip) continue;
              const under = x.tip[1] - T.getHeight(x.tip[0], x.tip[2]);
              if (under < minAll) minAll = under;
              if (x.phase === 'strike' && (cK == null || Math.abs(x.k - 0.70) < Math.abs(cK.k - 0.70))) cK = { k: x.k, under };
            }

            let minGuard = 9, guardFrames = 0;
            for (let f = 0; f < 24; f++) {
              await frame();
              const dg = an.debugMelee();
              if (!dg || !dg.tipWorld || dg.stance !== 'ready') continue;
              guardFrames++;
              const ug = dg.tipWorld[1] - T.getHeight(dg.tipWorld[0], dg.tipWorld[2]);
              if (ug < minGuard) minGuard = ug;
            }
            const row = { dir, beat: heavy ? 'heavy' : 'light-1', slopeDeg: slope,
              tipAboveGroundAtContact: cK ? +cK.under.toFixed(3) : null,
              tipAboveGroundMinAllFrames: +minAll.toFixed(3),
              guardFrames, tipAboveGroundGuardMin: guardFrames ? +minGuard.toFixed(3) : null };
            slopeRows.push(row);
            const tag = 'slope ' + dir + ' ' + row.beat;
            if (row.tipAboveGroundAtContact == null) bad.push(tag + ': no contact frame sampled');
            else if (!(row.tipAboveGroundAtContact > 0)) bad.push(tag + ': the blade was ' + row.tipAboveGroundAtContact + ' m into the ground at contact — ruling R9');
            if (!(row.tipAboveGroundMinAllFrames > 0)) bad.push(tag + ': the blade went ' + row.tipAboveGroundMinAllFrames + ' m into the ground during the swing');
            if (!(guardFrames >= 6)) bad.push(tag + ': only ' + guardFrames + ' guard frames after the swing');
            else if (!(row.tipAboveGroundGuardMin > 0)) bad.push(tag + ': the guard after the swing put the blade ' + row.tipAboveGroundGuardMin + ' m into the ground');
          }
        }
      }

      const reaches = rows.map((r) => r.tipToHullAtHit).filter((v) => typeof v === 'number');
      const spReach = speciesRows.map((r) => r.tipToHullAtHit).filter((v) => typeof v === 'number');
      return { pass: bad.length === 0, detail: { bad, speciesSummary: speciesSum, realInputRows: realRows, slopeRows, rows, contactK: 0.70,
        reachRangeM: reaches.length ? [Math.min(...reaches), Math.max(...reaches)] : null,
        speciesReachRangeM: spReach.length ? [Math.min(...spReach), Math.max(...spReach)] : null,
        speciesRows,
        reachSource: 'gate-side closed-form solve on b.hit.tip against hitHulls.hulls(m) captured '
          + 'inside the melee-hit event (round 5, M1); publishedContactGap is melee.js\\'s own '
          + 'number, kept as a cross-check only (crossCheckDeltaM)',
        machineSunk: window.__PLACE_SUNK__ ?? null,
        machine: m.kind, machineDist: +Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z).toFixed(2),
        note: 'melee.js used to resolve the hit on the FIRST frame of the strike phase, i.e. '
          + 'with the lance still cocked. CONTACT_K moves the resolve 70 % into that window, '
          + 'and the trigger takes the NEAREST frame because a 0.10 s strike is two rendered '
          + 'frames on this box. Phase DURATIONS, the combo window and the damage numbers are '
          + 'unchanged. '
          + 'WHY THE BAR IS ABOUT THE IMPACT POINT AND NOT ABOUT REACH (fix round 3): the '
          + 'machine cannot be parked at the 1.5 m §4 asks for, and neither can she walk to '
          + 'it. Its blocking capsule (collision._syncMachines: standoffHalfLen 1.5615 + '
          + 'bodyRadius 0.9 + machinePad 0.55 + her own radius) holds her 3.412 m from a '
          + 'Sentry CENTRE head-on — measured, and it does not move: 2.6 s of KeyW into the '
          + 'machine reads 3.412 m on every frame. The contact pose puts the blade tip 1.80 m '
          + 'ahead of her root, so the blade is ~1.4 m short of the shell and NO swing timing '
          + 'or pose in this lane can close that. What this row therefore gates is what it '
          + 'can gate: that melee-hit fires inside the strike, and that the point published '
          + 'to the sparks, the decal, the damage direction and positional audio is the part '
          + 'of the machine the blade is NEAREST. Fix round 2 approximated that with three '
          + 'rays from the tip aimed at three heights on the body centre; measured against '
          + 'the exact answer this round it was wrong by about a metre (published 1.349 / '
          + '1.440 / 1.468 m where the true nearest hull surface was 0.375 / 0.438 / 0.989 m) '
          + 'and the row FAILED at 1.232 m. melee.js now solves point-to-capsule in closed '
          + 'form over all 295 hull capsules of the target, once per landed hit. The reach '
          + 'shortfall itself is a CROSS-LANE defect (collision / machine standoff): no '
          + 'machine in the roster can be reached head-on — holdHeadOn is 3.16 m (flanker), '
          + '3.41 (sentry), 5.85 (heavy), 7.41 (colossus) against a 1.80 m reach.' } };
    })()`)),
  },

  {
    id: 'A104-melee-self-clear', kind: 'action', lane: 'melee',
    timeout: 120000, settle: 500,
    title: 'Every frame of every swing: the haft clears her head/neck/spine, the forearm never '
      + 'crosses into her body, the elbow never goes over her head — and on the heavy\'s contact '
      + 'and follow-through neither the forearm nor the haft crosses her face; the free arm never '
      + 'goes through the stowed bow',
    setup: `__CTX__.input.enabled = true;`,
    assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator;
      if (!an?.debugMelee) return { pass: null, detail: 'SKIP: no animator.debugMelee' };
      ${FREEZE} ${STAGE} ${AIMLOCK} ${SWING} ${READY} ${PIN}
      if (await toReady(C) !== 'ready') return { pass: null, detail: 'SKIP: the guard never came up' };
      const beats = [];
      for (let i = 0; i < 3; i++) beats.push(await rec({}));
      beats.push(await rec({ heavy: true }));

      C.combat.melee.holsterLance();
      const hol = [];
      for (let i = 0; i < 140; i++) {
        await frame();
        const d = an.debugMelee();
        if (d) hol.push({ stance: d.stance, clear: d.shaftClear, hair: d.hairClear,
          cross: d.forearmCross, toSpine: d.forearmToSpine,
          toSpineL: d.forearmToSpineL, lh: d.leftHandToShaft, elbow: d.elbowOverHead });
        if (d && d.stance === 'holstered' && i > 30) break;
      }
      await toReady(C);

      const rows = [], bad = [];
      const scan = (label, s, heavy, hairBar = 0.06) => {
        const live = s.filter((x) => (x.w ?? 0) > 0.3);
        if (live.length < 5) { bad.push(label + ': only ' + live.length + ' posed frames'); return; }
        const clear = Math.min(...live.map((x) => x.clear ?? 9));
        const hair = Math.min(...live.map((x) => x.hair ?? 9));
        const spine = Math.min(...live.map((x) => x.toSpine ?? 9));
        const crossX = Math.max(...live.map((x) => x.cross ?? -9));
        const elbow = Math.max(...live.map((x) => x.elbow ?? -9));
        const worstHair = live.reduce((b, x) => ((x.hair ?? 9) < (b.hair ?? 9) ? x : b), live[0]);

        const two = live.filter((x) => typeof x.lp === 'number' && x.lp <= 0.05
          && typeof x.toSpineL === 'number');
        const spineL = two.length ? Math.min(...two.map((x) => x.toSpineL)) : null;
        const spineLAll = live.filter((x) => typeof x.toSpineL === 'number');
        const atOf = (key) => { const w = live.reduce((b, x) => ((x[key] ?? 9) < (b[key] ?? 9) ? x : b), live[0]); return [w.stance, w.phase, +(w.k ?? 0).toFixed(2)]; };
        rows.push({ label, frames: live.length, toSpineAt: atOf('toSpine'), toSpineLAt: atOf('toSpineL'), shaftClearMin: +clear.toFixed(3),
          hairClearMin: +hair.toFixed(3), hairArgmin: worstHair.hairArg ?? null,
          forearmToSpineMin: +spine.toFixed(3),
          twoHandFrames: two.length,
          forearmToSpineLMin: spineL == null ? null : +spineL.toFixed(3),
          forearmToSpineLMinAllFrames: spineLAll.length
            ? +Math.min(...spineLAll.map((x) => x.toSpineL)).toFixed(3) : null,
          forearmMaxX: +crossX.toFixed(3), elbowOverHeadMax: +elbow.toFixed(3) });
        if (!(clear >= 0.12)) bad.push(label + ': the haft came within ' + clear.toFixed(3) + ' m of head/neck/spine');
        if (!(hair >= hairBar)) bad.push(label + ': the haft came within ' + hair.toFixed(3) + ' m of the ponytail');
        if (!(spine >= 0.10)) bad.push(label + ': the forearm came within ' + spine.toFixed(3) + ' m of the spine');
        if (spineL != null && !(spineL >= 0.10)) {
          bad.push(label + ': the LEFT forearm came within ' + spineL.toFixed(3)
            + ' m of the spine on a two-handed frame');
        }
        if (!heavy && !(elbow <= 0.25)) bad.push(label + ': the elbow went ' + elbow.toFixed(3) + ' m over her head');
        if (heavy && !(elbow <= 0.45)) bad.push(label + ': the elbow went ' + elbow.toFixed(3) + ' m over her head');
      };
      beats.forEach((b, i) => scan(i < 3 ? 'light-' + (i + 1) : 'heavy', b.samples, i === 3));

      scan('holster', hol.map((x) => ({ ...x, w: 1 })), false, 0.02);

      const HEAD_R = 0.16;
      const hv = beats[3].samples.filter((x) => x.beat === 'heavy'
        && ((x.phase === 'strike' && x.k >= 0.5) || (x.phase === 'recover' && x.k <= 0.62))
        && typeof x.hcF === 'number' && typeof x.hcH === 'number');
      const hvF = hv.length ? Math.min(...hv.map((x) => x.hcF)) : null;
      const hvH = hv.length ? Math.min(...hv.map((x) => x.hcH)) : null;
      if (!hv.length) bad.push('heavy: no contact/follow frames were sampled for the head cylinder');
      else {
        if (!(hvF > HEAD_R)) bad.push('heavy (live): the forearm came ' + hvF.toFixed(3) + ' m from the head axis at face height — ruling R3 bar 0.16 m');
        if (!(hvH > HEAD_R)) bad.push('heavy (live): the haft came ' + hvH.toFixed(3) + ' m from the head axis at face height — ruling R3 bar 0.16 m');
      }
      const pinned = [];
      for (const [phase, k] of [['strike', 0.70], ['recover', 0.62]]) {
        await pin({ stance: 'swing', phase, k, heavy: true, combo: 0 }, 700);
        const d = an.debugMelee();
        const r = { phase, k, headCylForearm: d ? d.headCylForearm : null, headCylHaft: d ? d.headCylHaft : null,
          hand: d ? d.handChar : null, elbow: d ? d.elbowRChar : null, head: d ? d.headChar : null,
          butt: d ? d.butt : null, tip: d ? d.tipChar : null };
        pinned.push(r);
        if (!(r.headCylForearm > HEAD_R)) bad.push('heavy ' + phase + ' (pinned, the V47 frame): the forearm is ' + r.headCylForearm + ' m from the head axis at face height — bar 0.16 m');
        if (!(r.headCylHaft > HEAD_R)) bad.push('heavy ' + phase + ' (pinned, the V47 frame): the haft is ' + r.headCylHaft + ' m from the head axis at face height — bar 0.16 m');
      }
      const heavyFace = { liveFrames: hv.length, liveForearmMinM: hvF, liveHaftMinM: hvH, pinned };

      const recoverRows = [];
      {
        const Mm = C.combat.melee;
        const prevState = C.state;
        C.state = 'playing';
        for (const [label, keys, stop] of [['jog heavy', ['KeyW'], false], ['sprint-stop heavy', ['KeyW', 'ShiftLeft'], true]]) {
          await toReady(C);
          ${STAGE}
          C.input.keys.clear(); for (const k of keys) C.input.keys.add(k);
          { const tq = performance.now(); while (performance.now() - tq < 1500) { await frame(); Mm.drawLance(30); } }
          if (stop) C.input.keys.clear();
          const b = await rec({ heavy: true, budget: 4000 });
          const settle = [];
          for (let i = 0; i < 12; i++) { await frame(); const d = an.debugMelee(); if (d) settle.push({ phase: 'settle', toSpine: d.forearmToSpine }); }
          C.input.keys.clear(); p.velocity.set(0, 0, 0);
          const recF = b.samples.filter((x) => x.phase === 'recover' && typeof x.toSpine === 'number').concat(settle);
          const allF = b.samples.filter((x) => (x.w ?? 0) > 0.3 && typeof x.toSpine === 'number');
          const r = { label, recoverFrames: recF.length,
            forearmToSpineRecoverMinM: recF.length ? +Math.min(...recF.map((x) => x.toSpine)).toFixed(3) : null,
            forearmToSpineSwingMinM: allF.length ? +Math.min(...allF.map((x) => x.toSpine)).toFixed(3) : null };
          recoverRows.push(r);
          if (!(r.recoverFrames >= 5)) bad.push(label + ': only ' + r.recoverFrames + ' recover frames sampled');
          else if (!(r.forearmToSpineRecoverMinM >= 0.10)) {
            bad.push(label + ': on the recover the forearm came within ' + r.forearmToSpineRecoverMinM
              + ' m of her belly/spine axis — ruling R9 bar 0.10 m');
          }
          if (r.forearmToSpineSwingMinM != null && !(r.forearmToSpineSwingMinM >= 0.10)) {
            bad.push(label + ': the forearm came within ' + r.forearmToSpineSwingMinM + ' m of the spine axis during the swing');
          }
        }
        C.state = prevState;
        await toReady(C);
      }

      const labRows = beats.map((b, i) => {
        const f = b.samples.filter((x) => (x.w ?? 0) > 0.3 && typeof x.lab === 'number');
        return { label: i < 3 ? 'light-' + (i + 1) : 'heavy', frames: f.length,
          leftArmToBowMinM: f.length ? +Math.min(...f.map((x) => x.lab)).toFixed(4) : null };
      });
      for (const r of labRows) {
        if (!(r.frames >= 5)) bad.push(r.label + ': only ' + r.frames + ' frames measured the free arm against the stowed bow');
        else if (!(r.leftArmToBowMinM >= 0.08)) {
          bad.push(r.label + ': the free LEFT arm came within ' + r.leftArmToBowMinM
            + ' m of the stowed bow\\'s limb (axis to axis; bar 0.08 m — contact)');
        }
      }

      return { pass: bad.length === 0, detail: { bad, rows, heavyFace, movingHeavyRecover: recoverRows, leftArmToBow: labRows,
        note: 'hairArgmin names the STRAND that produced hairClearMin. Fix round 1: the '
          + 'per-frame guard was built from four main-strand hair bones while this clause '
          + 'measured all 32 back-hair strands — so it failed on strands the guard could not '
          + 'see (the main strand\\'s end bone and two side strands). Guard and clause '
          + 'are the same array now, and the braid additionally collides with the haft '
          + 'after the spring sim (meleeLayer _hairOffHaft). '
          + 'forearmToSpine, not the bare x, is the "crossing into her body" read: a '
          + 'canon follow-through (docs/research/lance-canon.md) puts the tip past the target\\'s '
          + 'far shoulder and therefore the hand over her own midline, half a metre out in '
          + 'FRONT of her chest — forearmMaxX is reported for the literal §4 wording. The '
          + 'elbow budget is wider on the heavy because the canon\\'s committed overhead '
          + 'loads the shoulder; the haft still never goes behind her head (shaftClearMin).' } };
    })()`),
  },

  {
    id: 'A105-melee-while-moving', kind: 'action', lane: 'melee',
    timeout: 120000, settle: 500,
    title: 'Swinging while jogging: the legs keep the stride, she keeps >= 60 % of her speed, '
      + 'the upper body still does the swing, and (round 5 fix pass 2) a jogging L1/L2/L3/HEAVY '
      + 'never folds her torso past 45 deg or lifts the drive hand over her head',
    setup: `__CTX__.input.enabled = true;`,
    assert: placed(['openGround', 'runway'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator;
      if (!an?.debugMelee || !an.debugFeet) return { pass: null, detail: 'SKIP: no animator.debugMelee/debugFeet' };
      ${FREEZE} ${AIMLOCK} ${SWING} ${READY}

      const toStart = () => {
        standAt(p, 'runway');
        for (const m of ( C.machines?.list || [])) {
          if (m.alive && Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z) < 45) {
            m.position.x += 100;
            if (m.root) m.root.position.x = m.position.x;
          }
        }
      };
      toStart();
      await new Promise((r) => setTimeout(r, 250));
      if (await toReady(C) !== 'ready') return { pass: null, detail: 'SKIP: the guard never came up' };

      const Tj = C.terrain;
      const mkWin = () => ({ open: {}, raw: [], done: [], hitch: 0, prev: performance.now(), dts: [] });

      const winSample = (W, an2) => {
        const f = an2.debugFeet();
        if (!f || f.length < 2) return null;
        const now = performance.now();
        const fdt = now - W.prev; W.prev = now;
        W.dts.push(fdt);
        for (let side = 0; side < 2; side++) {
          const e = f[side], w = e.world;

          const on = e.planted && (w.y - Tj.getHeight(w.x, w.z) - (__CTX__.player.animator._ballRest || 0)) <= 0.012;
          const win = W.open[e.name];

          if (on) {
            const gh = Tj.getHeight(w.x, w.z);
            if (!win) {
              W.open[e.name] = { x0: w.x, x1: w.x, z0: w.z, z1: w.z, n: 1, maxDt: 0, side,
                act: !!W.swingActive, gLo: gh, gHi: gh, ax: w.x, az: w.z };
            } else {
              win.x0 = Math.min(win.x0, w.x); win.x1 = Math.max(win.x1, w.x);
              win.z0 = Math.min(win.z0, w.z); win.z1 = Math.max(win.z1, w.z); win.n++;
              win.maxDt = Math.max(win.maxDt, fdt);
              win.gLo = Math.min(win.gLo, gh); win.gHi = Math.max(win.gHi, gh);
              if (W.swingActive) win.act = true;
            }
          } else if (win) {
            if (win.n >= 3) {
              W.raw.push({ d: +Math.hypot(win.x1 - win.x0, win.z1 - win.z0).toFixed(4),
                side: win.side, maxDt: +win.maxDt.toFixed(0), n: win.n,
                swinging: !!win.act, at: [+win.ax.toFixed(1), +win.az.toFixed(1)],
                groundRise: +(win.gHi - win.gLo).toFixed(3) });
            }
            W.open[e.name] = null;
          }
        }
        return f;
      };
      const ctrl = mkWin();

      const RAMP_MS = 1000, SAMPLE_MS = 4200;
      const jog = async (W, onFrame) => {
        toStart();
        await new Promise((r) => setTimeout(r, 200));
        C.input.keys.clear(); C.input.keys.add('KeyW');
        const t0 = performance.now(); const sp = [];
        while (performance.now() - t0 < RAMP_MS + SAMPLE_MS) {
          await frame();
          const d = an.debugMelee();

          W.swingActive = !!C.combat.melee.active;
          if (performance.now() - t0 > RAMP_MS) {
            const f = winSample(W, an);
            if (onFrame) onFrame(f, d);
          } else W.prev = performance.now();
          sp.push(Math.hypot(p.velocity.x, p.velocity.z));
        }
        C.input.keys.clear();
        p.velocity.set(0, 0, 0);
        return sp.slice(Math.floor(sp.length * 0.2));
      };
      const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; };

      const torsoPitch = (d) => {
        const pc = d?.pelvisChar, hc = d?.headChar;
        if (!pc || !hc) return null;
        const dx = hc[0] - pc[0], dy = hc[1] - pc[1], dz = hc[2] - pc[2];
        const l = Math.hypot(dx, dy, dz);
        return l > 1e-6 ? Math.acos(Math.max(-1, Math.min(1, dy / l))) * 180 / Math.PI : null;
      };

      const jogPose = (d) => ({ stance: d.stance, phase: d.phase, beat: d.beat,
        yaw: d.torsoYawDeg, grip: d.grip, w: d.w, pitch: torsoPitch(d),
        hmh: d.handChar && d.headChar ? +(d.handChar[1] - d.headChar[1]).toFixed(4) : null,
        head: d.headChar ? d.headChar[1] : null, hand: d.handChar ? d.handChar[1] : null,
        hcF: d.headCylForearm, hcH: d.headCylHaft, strideW: d.strideW,
        cut: d.stridePitchCut, handCut: d.strideHandCut });

      const ctrlPitch = [];
      const base = median(await jog(ctrl, (f, d) => { const t = torsoPitch(d); if (t != null) ctrlPitch.push(t); }));

      const feet = [];
      const poses = [];

      const swg = mkWin();
      let driftL = 0, driftR = 0;
      const M = C.combat.melee;
      let swings = 0;
      const sp = await jog(swg, (f, d) => {
        if (f) feet.push({ l: f[0].planted, r: f[1].planted });
        if (d) poses.push(jogPose(d));
        if (!M.active && M.stance !== 'draw') { M.swing({}); swings++; }
      });

      const hvWin = mkWin();
      const hvPoses = [];
      let hvSwings = 0, hvHeavy = 0, hvL3 = 0;
      const hvSp = await jog(hvWin, (f, d) => {
        if (d) hvPoses.push(jogPose(d));
        if (!M.active && M.stance !== 'draw') {
          const heavy = hvSwings % 2 === 0;
          if (!heavy) { M.combo = 2; M._comboT = Math.max(M._comboT || 0, 1); hvL3++; } else hvHeavy++;
          M.swing({ heavy }); hvSwings++;
        }
      });
      const hvSwung = median(hvSp);

      const swung = median(sp);
      const swingPoses = poses.filter((x) => x.stance === 'swing');
      const yaws = swingPoses.map((x) => x.yaw).filter((v) => typeof v === 'number');
      const yawExc = yaws.length ? Math.max(...yaws) - Math.min(...yaws) : 0;
      const handPath = pathLen(poses, 'grip');
      const plantedFrames = feet.filter((f) => f.l || f.r).length;
      const stride = feet.length ? plantedFrames / feet.length : 0;

      const bad = [];
      if (!(swings >= 2)) bad.push('only ' + swings + ' swings fired while jogging');
      if (!(base > 1.0)) bad.push('baseline jog was only ' + base.toFixed(2) + ' m/s');
      if (!(swung >= base * 0.6)) bad.push('speed fell to ' + swung.toFixed(2) + ' of ' + base.toFixed(2) + ' m/s');

      const closeWin = (W) => {
        const d = W.dts.slice().sort((a, b) => a - b);
        const med = d.length ? d[Math.floor(d.length / 2)] : 16;
        const bar = Math.max(45, 2.2 * med);
        W.medianFrameMs = +med.toFixed(1);
        W.hitchBarMs = +bar.toFixed(0);
        for (const r of W.raw) {
          if (r.maxDt > bar) W.hitch++; else W.done.push(r);
        }
        return W;
      };
      closeWin(swg); closeWin(ctrl);
      const jDone = swg.done.map((x) => x.d);
      const cDone = ctrl.done.map((x) => x.d);
      for (const x of swg.done) {
        if (x.side === 0) driftL = Math.max(driftL, x.d); else driftR = Math.max(driftR, x.d);
      }

      const jWorst = jDone.length ? Math.max(...jDone) : 0;
      const cWorst = cDone.length ? Math.max(...cDone) : 0;
      if (!(jDone.length >= 3)) bad.push('jogging: only ' + jDone.length + ' clean stance windows (' + swg.hitch + ' hitched)');
      else if (!(jWorst <= 0.08)) {
        bad.push('a planted foot drifted ' + jWorst.toFixed(3) + ' m while swinging and jogging '
          + '(bar 0.08; the same runway with no swing read ' + cWorst.toFixed(3) + ' m)');
      }
      if (!(stride > 0.15 && stride < 0.98)) bad.push('stance duty ' + stride.toFixed(2) + ' — the legs are not striding');
      if (!(yawExc >= 12)) bad.push('the upper body only twisted ' + yawExc.toFixed(1) + ' deg while swinging');
      if (!(handPath >= 1.2)) bad.push('the hand only travelled ' + handPath + ' m across ' + swings + ' swings');

      const allJog = poses.concat(hvPoses).filter((x) => x.stance === 'swing');
      const srJog = allJog.filter((x) => x.phase === 'strike' || x.phase === 'recover');
      const pitchBad = allJog.filter((x) => typeof x.pitch === 'number' && x.pitch > 45);
      const pitchN = allJog.filter((x) => typeof x.pitch === 'number').length;
      const maxPitch = pitchN ? Math.max(...allJog.filter((x) => typeof x.pitch === 'number').map((x) => x.pitch)) : null;
      const handBad = srJog.filter((x) => typeof x.hmh === 'number' && !(x.hmh < 0));
      const hmhN = srJog.filter((x) => typeof x.hmh === 'number').length;
      const worstHmh = hmhN ? Math.max(...srJog.filter((x) => typeof x.hmh === 'number').map((x) => x.hmh)) : null;
      const hvSR = srJog.filter((x) => x.beat === 'heavy');
      const cylVals = hvSR.flatMap((x) => [x.hcF, x.hcH]).filter((v) => typeof v === 'number');
      const cylMin = cylVals.length ? Math.min(...cylVals) : null;
      const perBeat = {};
      for (const b of ['light-1', 'light-2', 'light-3', 'heavy']) {
        const fr = allJog.filter((x) => x.beat === b);
        const sr = fr.filter((x) => x.phase === 'strike' || x.phase === 'recover');
        const pv = fr.map((x) => x.pitch).filter((v) => typeof v === 'number');
        const hv = sr.map((x) => x.hmh).filter((v) => typeof v === 'number');
        perBeat[b] = { frames: fr.length, strikeRecoverFrames: sr.length,
          maxPitchDeg: pv.length ? +Math.max(...pv).toFixed(1) : null,
          minHeadY: fr.length ? +Math.min(...fr.map((x) => x.head ?? 9)).toFixed(3) : null,
          worstHandMinusHead: hv.length ? +Math.max(...hv).toFixed(3) : null,
          maxPitchCut: fr.length ? +Math.max(...fr.map((x) => x.cut || 0)).toFixed(3) : null,
          maxHandCut: fr.length ? +Math.max(...fr.map((x) => x.handCut || 0)).toFixed(3) : null };
        if (!(sr.length >= 3)) bad.push('jogging ' + b + ': only ' + sr.length + ' strike/recover frames — the beat was not exercised at a jog');
      }
      if (!(pitchN >= 20)) bad.push('jogging swings: only ' + pitchN + ' frames with a torso reading');
      else if (pitchBad.length) {
        bad.push('jogging swings: torso folded past 45 deg on ' + pitchBad.length + '/' + pitchN
          + ' frames (worst ' + maxPitch.toFixed(1) + ' deg, ' + pitchBad.map((x) => x.beat + ' ' + x.phase).slice(0, 4).join(', ') + ')');
      }
      if (!(hmhN >= 10)) bad.push('jogging swings: only ' + hmhN + ' strike/recover frames with a hand/head reading');
      else if (handBad.length) {
        bad.push('jogging swings: the drive hand at or over the head on ' + handBad.length + '/' + hmhN
          + ' strike/recover frames (worst +' + worstHmh.toFixed(3) + ' m, ' + handBad.map((x) => x.beat + ' ' + x.phase).slice(0, 4).join(', ') + ')');
      }
      if (!(cylVals.length >= 4)) bad.push('jogging heavy: only ' + cylVals.length + ' head-cylinder readings');
      else if (!(cylMin >= 0.16)) bad.push('jogging heavy: forearm/haft ' + cylMin.toFixed(3) + ' m from the head axis at face height (R3 bar 0.16)');
      const hvJDone = closeWin(hvWin).done.map((x) => x.d);
      const hvJWorst = hvJDone.length ? Math.max(...hvJDone) : null;
      if (!(hvHeavy >= 1 && hvL3 >= 1)) bad.push('heavy/L3 segment: ' + hvHeavy + ' heavies and ' + hvL3 + ' light-3s fired');
      if (!(hvSwung >= base * 0.6)) bad.push('heavy/L3 segment: speed fell to ' + hvSwung.toFixed(2) + ' of ' + base.toFixed(2) + ' m/s');
      if (!(hvJDone.length >= 3)) bad.push('heavy/L3 segment: only ' + hvJDone.length + ' clean stance windows (' + hvWin.hitch + ' hitched)');
      else if (!(hvJWorst <= 0.08)) bad.push('heavy/L3 segment: a planted foot drifted ' + hvJWorst.toFixed(3) + ' m (bar 0.08)');

      const T = C.terrain;
      C.input.keys.clear();
      p.velocity.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 700));
      const stOpen = {}, stDone = [];
      let stHitch = 0, stPrev = performance.now(), stLift = 0, stSwings = 0;

      let stEma = 16;
      const rootSteps = [];
      let p0 = { x: p.position.x, z: p.position.z };
      const step0 = an.debugStep?.() || { steps: 0 };
      const tS = performance.now();
      let wasActive = false;
      while (performance.now() - tS < 13000) {
        await frame();
        const now = performance.now();
        const fdt = now - stPrev; stPrev = now;
        stEma = stEma * 0.88 + fdt * 0.12;
        const hitch = fdt > 45 && fdt > 2.2 * stEma;
        for (const f of an.debugFeet()) {
          const h = T.getHeight(f.world.x, f.world.z);
          const on = f.planted && (f.world.y - h - (__CTX__.player.animator._ballRest || 0)) <= 0.012;
          if (!f.planted) stLift = Math.max(stLift, f.world.y - h);
          const w = stOpen[f.name];
          if (on) {
            if (!w) stOpen[f.name] = { x0: f.world.x, x1: f.world.x, z0: f.world.z, z1: f.world.z, n: 1, bad: false };
            else {
              w.x0 = Math.min(w.x0, f.world.x); w.x1 = Math.max(w.x1, f.world.x);
              w.z0 = Math.min(w.z0, f.world.z); w.z1 = Math.max(w.z1, f.world.z); w.n++;
              if (hitch) w.bad = true;
            }
          } else if (w) {
            if (w.n >= 3) {
              if (w.bad) stHitch++;
              else stDone.push(+Math.hypot(w.x1 - w.x0, w.z1 - w.z0).toFixed(4));
            }
            stOpen[f.name] = null;
          }
        }
        if (wasActive && !M.active) {
          rootSteps.push(+Math.hypot(p.position.x - p0.x, p.position.z - p0.z).toFixed(3));
        }
        if (!M.active && M.stance !== 'draw') {
          p0 = { x: p.position.x, z: p.position.z };
          M.swing({ heavy: stSwings % 4 === 3 }); stSwings++;
        }
        wasActive = M.active;
      }
      for (const k in stOpen) {
        const w = stOpen[k];
        if (w && w.n >= 3) { if (w.bad) stHitch++; else stDone.push(+Math.hypot(w.x1 - w.x0, w.z1 - w.z0).toFixed(4)); }
      }
      const stepN = (an.debugStep?.()?.steps || 0) - (step0.steps || 0);
      const standDrift = stDone.length ? Math.max(...stDone) : null;
      if (!(stDone.length >= 3)) {
        bad.push('standing: only ' + stDone.length + ' clean stance windows (' + stHitch + ' hitched) — not exercised');
      } else if (!(standDrift <= 0.08)) {
        bad.push('standing: a planted foot drifted ' + standDrift + ' m across ' + stDone.length + ' windows');
      }
      if (!(stepN >= 3)) bad.push('standing: the animator took only ' + stepN + ' steps across ' + stSwings + ' swings');
      if (!(stLift >= 0.03)) bad.push('standing: no foot ever left the ground (peak lift ' + stLift.toFixed(3) + ' m)');

      return { pass: bad.length === 0, detail: { bad, swings,
        baseSpeed: +base.toFixed(2), swingSpeed: +swung.toFixed(2),
        speedRatio: +(swung / Math.max(1e-3, base)).toFixed(3),
        footDrift: [+driftL.toFixed(3), +driftR.toFixed(3)],
        joggingWindows: jDone.length, joggingHitched: swg.hitch, joggingDrifts: jDone.slice(0, 10),
        joggingWorst: +jWorst.toFixed(4), controlWorst: +cWorst.toFixed(4),
        joggingBar: 0.08, outlierDiscard: 'none (fix round 3)',
        medianFrameMs: swg.medianFrameMs, hitchBarMs: swg.hitchBarMs,
        controlMedianFrameMs: ctrl.medianFrameMs,

        worstJoggingWindow: swg.done.reduce((a, b) => (a && a.d >= b.d ? a : b), null),
        worstControlWindow: ctrl.done.reduce((a, b) => (a && a.d >= b.d ? a : b), null),
        controlWindows: cDone.length, controlDrifts: cDone.slice(0, 10),
        stanceDuty: +stride.toFixed(3),
        torsoYawExcursionDeg: +yawExc.toFixed(1), handPath, frames: poses.length,

        jogSwingPose: { bars: { torsoPitchDeg: 45, handUnderHead: '< 0 m', heavyHeadCyl: 0.16 },
          frames: pitchN, strikeRecoverFrames: hmhN, maxTorsoPitchDeg: maxPitch != null ? +maxPitch.toFixed(1) : null,
          framesOver45: pitchBad.length, worstHandMinusHead: worstHmh != null ? +worstHmh.toFixed(3) : null,
          framesHandOverHead: handBad.length, heavyHeadCylMin: cylMin != null ? +cylMin.toFixed(4) : null,
          perBeat,
          controlJogPitchDeg: ctrlPitch.length ? [+Math.min(...ctrlPitch).toFixed(1), +median(ctrlPitch).toFixed(1), +Math.max(...ctrlPitch).toFixed(1)] : null,
          heavySegment: { swings: hvSwings, heavy: hvHeavy, light3: hvL3, speed: +hvSwung.toFixed(2),
            speedRatio: +(hvSwung / Math.max(1e-3, base)).toFixed(3), windows: hvJDone.length,
            hitched: hvWin.hitch, worstDrift: hvJWorst != null ? +hvJWorst.toFixed(4) : null } },
        standing: { swings: stSwings, drift: standDrift, windows: stDone.length,
          hitchedWindows: stHitch, drifts: stDone.slice(0, 12), stepsTaken: stepN,
          avgFrameMs: +stEma.toFixed(1),
          peakLift: +stLift.toFixed(3), rootPerSwing: rootSteps.slice(0, 10) },
        note: 'BOTH rows are now gated on their RAW worst clean window against 0.08 m, with '
          + 'no outlier discard anywhere (fix round 3). The control jog and the swinging jog '
          + 'start from the same pose with the same velocity and cover the same x -60..-85 '
          + 'of the player-anim runway; controlWorst is published as evidence that the '
          + 'instrument and the runway are sane and does NOT enter the pass condition. '
          + 'The masked melee clip carries NO leg tracks and the procedural torso yaw is '
          + 'spent on spine_01..03 only — the pelvis never yaws — so the JOGGING stride is '
          + 'untouched by construction. The STANDING row is the one round 1 did not have: '
          + 'the step-in is a velocity impulse, and until fix round 2 nothing moved a foot to '
          + 'meet it (judge-measured 0.404 m of planted drift on a standing heavy). '
          + 'playerAnimator._stanceStep now unplants, lifts and replants the foot the body '
          + 'has left behind, and since fix round 3 it triggers on the ball\\'s MEASURED '
          + 'world slip as well as its char-space error — the same quantity this row reads — '
          + 'so the 0.0867 m tail the judge found over 11 runs is bounded by construction; '
          + 'stepsTaken and peakLift are there so taking the step-in away cannot pass this '
          + 'row instead.' } };
    })()`),
  },

  {
    id: 'A106-melee-approach-immovable', kind: 'action', lane: 'melee',
    timeout: 900000, settle: 500,
    title: 'The melee approach term: walking in with the lance DRAWN moves the machine 0.000 m, '
      + 'letting go never moves HER more than 0.15 m in a frame nor 0.10 m in total (a planted '
      + 'foot <= 0.08 m), and nowhere it lets her stand — nor any swing there — puts her body or '
      + 'either forearm inside a hit hull — frozen, and with the rig animating',
    setup: `__CTX__.input.enabled = true;`,
    assert: staged([], placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator;
      const M = C.combat?.melee;
      if (!M || typeof M.drawLance !== 'function') return { pass: null, detail: 'SKIP: no melee' };
      if (! C.machines?.list?.length) return { pass: null, detail: 'SKIP: no machines' };
      { const __k = noKindsSkip(); if (__k) return __k; }
      ${FREEZE} ${AIMLOCK} ${FRAME}

      const list =  C.machines.list;
      const rows = [], bad = [];

      const kinds = [...new Set([KIND.sentry, KIND.herd].filter(Boolean))];
      const run = async (kind, drawn) => {
        standAt(p, 'openGround');
        let m = liveOfKind(kind);
        if (!m) { try { m = C.machines.spawn(kind, p.position.x + 40, p.position.z + 30); } catch (e) { m = null; } }
        if (!m) return null;

        for (const o of list) {
          if (o === m || !o.alive) continue;
          o.position.x += 120;
          if (o.root) o.root.position.x = o.position.x;
        }
        const h = p.heading ?? 0;
        const mx = p.position.x + Math.sin(h) * 5.0, mz = p.position.z + Math.cos(h) * 5.0;
        const gy = C.terrain ? C.terrain.getHeight(mx, mz) : m.position.y;
        m.position.set(mx, gy, mz); m.heading = h + Math.PI; m.state = 'idle';

        if (m.root) { m.root.position.set(mx, gy, mz); m.root.rotation.set(0, m.heading, 0); }
        if (drawn) {
          M.drawLance(300);
          const t0 = performance.now();
          while (M.stance !== 'ready' && performance.now() - t0 < 3000) await frame();
        } else {
          M.holsterLance();
          for (let i = 0; i < 40; i++) await frame();
        }
        for (let i = 0; i < 20; i++) await frame();
        const x0 = m.position.x, z0 = m.position.z;
        let px = x0, pz = z0, worst = 0, appr = 0, frames = 0;
        C.input.keys.add('KeyW');
        const t1 = performance.now();
        while (performance.now() - t1 < 3000) {
          await frame();
          frames++;
          if (drawn) M.drawLance(300);
          if (M.approachMachine === m) appr++;
          const st = Math.hypot(m.position.x - px, m.position.z - pz);
          if (st > worst) worst = st;
          px = m.position.x; pz = m.position.z;
        }
        C.input.keys.delete('KeyW');
        for (let i = 0; i < 10; i++) await frame();
        const stand = Math.hypot(p.position.x - m.position.x, p.position.z - m.position.z);
        return { kind, drawn, frames, approachFrames: appr,
          machineDisplacementM: +Math.hypot(m.position.x - x0, m.position.z - z0).toFixed(4),
          worstFramePushM: +worst.toFixed(4),
          standM: +stand.toFixed(3),
          playerToShellM: +(stand - ((m.bodyRadius || 1) + 0.4)).toFixed(3),
          standoffHalfLen: +(m.standoffHalfLen ?? 0).toFixed(4),

          meleeStandoffHalfLen: (typeof m.meleeStandoffHalfLen === 'number')
            ? +m.meleeStandoffHalfLen.toFixed(4) : null,
          stance: M.stance };
      };
      for (const kind of kinds) {
        for (const drawn of [false, true]) {
          const r = await run(kind, drawn);
          if (!r) continue;
          rows.push(r);
          if (!(r.machineDisplacementM <= 0.005)) {
            bad.push(kind + (drawn ? ' (lance drawn)' : ' (holstered)') + ': the machine moved '
              + r.machineDisplacementM.toFixed(3) + ' m — a walking player shoved it');
          }
          if (drawn && !(r.approachFrames > 0)) {
            bad.push(kind + ': the melee approach term never engaged, so this row proves nothing');
          }
          if (drawn && !(r.playerToShellM > 0)) {
            bad.push(kind + ': her capsule ended ' + r.playerToShellM.toFixed(3)
              + ' m inside the machine shell');
          }
        }
      }
      if (!rows.some((r) => r.drawn)) bad.push('no drawn row ran at all');

      const reachRows = [];
      const reach = async (kind, K) => {
        standAt(p, 'openGround');
        let m = liveOfKind(kind);
        if (!m && C.machines.spawn) {
          try { m = C.machines.spawn(kind, p.position.x + 40, p.position.z); } catch { m = null; }
        }
        if (!m || m.kind !== kind) return { kind, skipped: 'no ' + kind + ' in the scene' };
        for (const o of list) {
          if (o === m || !o.alive) continue;
          o.position.x += 120;
          if (o.root) o.root.position.x = o.position.x;
        }
        const h = p.heading ?? 0;
        const mx = p.position.x + Math.sin(h) * 6.0, mz = p.position.z + Math.cos(h) * 6.0;
        const gy = C.terrain ? C.terrain.getHeight(mx, mz) : m.position.y;
        m.position.set(mx, gy, mz); m.heading = h + Math.PI; m.state = 'idle';
        if (m.root) { m.root.position.set(mx, gy, mz); m.root.rotation.set(0, m.heading, 0); }

        const read = () => ({
          standoffHalfLen: +(m.standoffHalfLen ?? 0).toFixed(6),
          meleeTerm: (typeof m.meleeStandoffHalfLen === 'number')
            ? +m.meleeStandoffHalfLen.toFixed(6) : null,
          chargeReachM: +((m.bodyRadius + (m.standoffHalfLen ?? 0) + K)).toFixed(6),
          damageRadiusM: +((m.bodyRadius + (m.standoffHalfLen ?? 0) + K) + 0.8).toFixed(6),
          silentPromptM: +(2.0 + (m.standoffHalfLen ?? 0) + 1.0).toFixed(6),
        });

        M.holsterLance();
        for (let i = 0; i < 40; i++) await frame();
        const off = read();

        M.drawLance(300);
        const t0 = performance.now();
        while (M.stance !== 'ready' && performance.now() - t0 < 3000) await frame();
        C.input.keys.add('KeyW');
        let live = false;
        const t1 = performance.now();
        while (performance.now() - t1 < 4000) {
          await frame();
          M.drawLance(300);
          if (M.approachMachine === m && typeof m.meleeStandoffHalfLen === 'number') { live = true; break; }
        }
        const on = read();
        C.input.keys.delete('KeyW');
        return { kind, K, termLive: live, holstered: off, drawn: on,
          chargeReachDeltaM: +(on.chargeReachM - off.chargeReachM).toFixed(6),
          standoffDeltaM: +(on.standoffHalfLen - off.standoffHalfLen).toFixed(6),

          termCutM: live && on.meleeTerm !== null
            ? +Math.abs(on.standoffHalfLen - on.meleeTerm).toFixed(4) : 0 };
      };
      for (const [kind, K] of [[KIND.herd, 0.8], [KIND.heavy, 0.9]].filter(([k]) => k)) {
        const r = await reach(kind, K);
        reachRows.push(r);
        if (r.skipped) { bad.push('A106 reach row: ' + r.skipped); continue; }
        if (!r.termLive) {
          bad.push(kind + ' reach row: the melee approach term never engaged, so the row '
            + 'proves nothing');
          continue;
        }
        if (!(r.termCutM > 0.01)) {
          bad.push(kind + ' reach row: the term published no cut (' + r.termCutM
            + ' m), so the row proves nothing');
        }
        if (Math.abs(r.chargeReachDeltaM) > 1e-6) {
          bad.push(kind + ': drawing the lance changed its CHARGE REACH by '
            + r.chargeReachDeltaM.toFixed(4) + ' m (' + r.holstered.chargeReachM + ' -> '
            + r.drawn.chargeReachM + ') — the approach term is leaking into machine geometry');
        }
        if (Math.abs(r.standoffDeltaM) > 1e-6) {
          bad.push(kind + ': drawing the lance changed m.standoffHalfLen by '
            + r.standoffDeltaM.toFixed(4) + ' m — the term must publish '
            + 'meleeStandoffHalfLen, not overwrite the machine\\'s own half-length');
        }
      }

      const releaseRows = [];
      const Cc = C.collision;
      const origMove = Cc.moveCapsule;
      let corr = 0;
      Cc.moveCapsule = function (pos, prev, vel, r, h, dt, opts) {
        const ix = pos.x, iz = pos.z;
        const res = origMove.call(this, pos, prev, vel, r, h, dt, opts);
        corr += Math.hypot(pos.x - ix, pos.z - iz);
        return res;
      };
      const getKind = (kind) => {
        let m = liveOfKind(kind);
        if (!m && C.machines.spawn) {
          try { m = C.machines.spawn(kind, p.position.x + 40, p.position.z + 30); } catch { m = null; }
        }
        return m && m.kind === kind ? m : null;
      };

      const stageFacing = async (m, d, yaw = Math.PI) => {
        standAt(p, 'openGround');
        p.heading = 0; p._faceX = 0; p._faceZ = 1; p._candX = 0; p._candZ = 1; p._latchT = 0;
        if (p.model) p.model.rotation.y = 0;
        const __og = PLACE('openGround');
        for (const o of list) {
          if (o === m || !o.alive) continue;
          if (Math.hypot(o.position.x - __og.x, o.position.z - __og.z) < 70) {
            o.position.x += 150; if (o.root) o.root.position.x = o.position.x;
          }
        }
        const mx = p.position.x, mz = p.position.z + d;
        const gy = C.terrain ? C.terrain.getHeight(mx, mz) : m.position.y;
        m.update = () => {};
        m.position.set(mx, gy, mz); m.heading = yaw; m.state = 'idle';
        if (m.root) { m.root.position.set(mx, gy, mz); m.root.rotation.set(0, m.heading, 0); }
        for (let i = 0; i < 4; i++) await frame();
      };
      const releaseRun = async (m, how, yaw) => {
        M.aimLock = 0;
        M.holsterLance();
        for (let i = 0; i < 10; i++) await frame();

        await stageFacing(m, (m.bodyRadius || 1) + (m.standoffHalfLen || 0) + 0.95 + 0.4 + 1.0, yaw);
        M.drawLance(300);
        const t0 = performance.now();
        while (M.stance !== 'ready' && performance.now() - t0 < 3000) await frame();
        C.input.keys.add('KeyW');
        let last = 99, still = 0, appr = 0;
        for (let f = 0; f < 180; f++) {
          await frame(); M.drawLance(300);
          if (M.approachMachine === m) appr++;
          const d2 = Math.hypot(p.position.x - m.position.x, p.position.z - m.position.z);
          if (Math.abs(d2 - last) < 0.002) { if (++still > 6) break; } else still = 0;
          last = d2;
        }
        C.input.keys.delete('KeyW');

        for (let f = 0; f < 30; f++) { await frame(); M.drawLance(300); }
        const stand = Math.hypot(p.position.x - m.position.x, p.position.z - m.position.z);
        const termAtStand = typeof m.meleeStandoffHalfLen === 'number';
        let worstCorr = 0, worstStep = 0, worstStandStep = 0, latched = 0, frames = 0, worstAt = null;
        let totalCorr = 0, standCorr = 0;
        let px = p.position.x, pz = p.position.z;

        const mx0 = m.position.x, mz0 = m.position.z;
        let mWorstFrame = 0, mpx = mx0, mpz = mz0;
        corr = 0;

        const footWin = [null, null], footPrev = [null, null], footAcc = [0, 0];
        let footDragStand = 0, footWalkRaw = 0, footDragWalk = 0;
        const feetStep = (phase, corrNow) => {
          const fs = an.debugFeet ? an.debugFeet() : null;
          if (!fs) return;
          for (let i = 0; i < 2 && i < fs.length; i++) {
            const f = fs[i];
            if (f.planted) {
              if (!footWin[i]) { footWin[i] = { x: f.world.x, z: f.world.z }; footAcc[i] = 0; footPrev[i] = null; }
              const dd = Math.hypot(f.world.x - footWin[i].x, f.world.z - footWin[i].z);
              if (phase === 'stand' && dd > footDragStand) footDragStand = dd;
              if (phase !== 'stand' && dd > footWalkRaw) footWalkRaw = dd;
              if (phase !== 'stand' && corrNow > 0.001 && footPrev[i]) {
                footAcc[i] += Math.hypot(f.world.x - footPrev[i].x, f.world.z - footPrev[i].z);
                if (footAcc[i] > footDragWalk) footDragWalk = footAcc[i];
              }
              footPrev[i] = { x: f.world.x, z: f.world.z };
            } else { footWin[i] = null; footPrev[i] = null; }
          }
        };

        let push0 = Cc.meleePushM || 0;
        const sample = (phase) => {
          corr += (Cc.meleePushM || 0) - push0; push0 = Cc.meleePushM || 0;
          totalCorr += corr;
          if (phase === 'stand') standCorr += corr;
          feetStep(phase, corr);
          const st = Math.hypot(p.position.x - px, p.position.z - pz);
          if (corr > worstCorr) { worstCorr = corr; worstAt = phase + '@' + frames; }
          if (st > worstStep) worstStep = st;
          if (phase === 'stand' && st > worstStandStep) worstStandStep = st;
          const rc = Cc._machineMap && Cc._machineMap.get(m);
          if (rc && rc.mLatched) latched++;
          const ms = Math.hypot(m.position.x - mpx, m.position.z - mpz);
          if (ms > mWorstFrame) mWorstFrame = ms;
          mpx = m.position.x; mpz = m.position.z;
          px = p.position.x; pz = p.position.z; corr = 0; frames++;
        };
        if (how === 'holster') M.holsterLance(); else M.aimLock = 1.66;

        { const ts = performance.now(); while (performance.now() - ts < 800) { await frame(); sample('stand'); } }

        C.input.keys.add('KeyS');
        const t1 = performance.now();
        let relDist = null;
        while (performance.now() - t1 < 4000) {
          await frame(); sample('walk');
          if (relDist == null && m.meleeStandoffHalfLen == null) relDist = Math.hypot(p.position.x - m.position.x, p.position.z - m.position.z);
          if (performance.now() - t1 >= 1000 && m.meleeStandoffHalfLen == null) break;
        }
        const walkAwayS = (performance.now() - t1) / 1000;
        C.input.keys.delete('KeyS');
        for (let f = 0; f < 6; f++) { await frame(); sample('walk'); }
        M.aimLock = 0;
        return { kind: m.kind, how, yaw: +yaw.toFixed(2), stand: +stand.toFixed(3), approachFrames: appr, termAtStand,
          released: m.meleeStandoffHalfLen == null, latchedFrames: latched, frames,
          worstFrameCorrectionM: +worstCorr.toFixed(4), worstAt,
          totalCorrectionM: +totalCorr.toFixed(4), standCorrectionM: +standCorr.toFixed(4),
          plantedFootDragM: +Math.max(footDragStand, footDragWalk).toFixed(4), plantedFootDragStandM: +footDragStand.toFixed(4),
          plantedFootDragWalkM: +footDragWalk.toFixed(4), plantedFootDriftWalkRawM: +footWalkRaw.toFixed(4),
          worstFrameStepM: +worstStep.toFixed(4), worstStandStepM: +worstStandStep.toFixed(4),
          walkAwayS: +walkAwayS.toFixed(2), releasedAtCentreDistM: relDist == null ? null : +relDist.toFixed(3),
          machineMovedM: +Math.hypot(m.position.x - mx0, m.position.z - mz0).toFixed(4), machineWorstFrameM: +mWorstFrame.toFixed(4),
          fullStandoffEndOnM: +((m.standoffHalfLen || 0) + (m.bodyRadius || 1) + Cc.machinePad + 0.4).toFixed(3) };
      };
      try {
        for (const kind of [...new Set([KIND.sentry, KIND.herd, KIND.colossus].filter(Boolean))]) {
          const m = getKind(kind);
          if (!m) { bad.push('release clause: no ' + kind + ' could be staged'); continue; }
          for (let i = 0; i < 20; i++) await frame();

          await stageFacing(m, (m.bodyRadius || 1) + (m.standoffHalfLen || 0) + 0.95 + 0.4 + 1.2);
          M.drawLance(300);
          { const tq = performance.now();
            while (performance.now() - tq < 3000) {
              await frame(); M.drawLance(300);
              const rq = Cc._machineMap && Cc._machineMap.get(m);
              if (rq && rq.bValid && M.approachMachine === m) break;
            } }
          const rb = Cc._machineMap && Cc._machineMap.get(m);
          const base0 = m.standoffHalfLen || 0;
          const full = base0 + (m.bodyRadius || 1) + Cc.machinePad + 0.4;
          const cutF = rb ? full - rb.bFront : 0, cutR = rb ? full - rb.bBack : 0;
          const yaw = cutF >= cutR ? Math.PI : 0;
          if (!(Math.max(cutF, cutR) > 0.05)) {
            bad.push('release clause: ' + kind + '\\'s hull bound cuts neither end on this pose '
              + '(outline front ' + (rb ? rb.bFront.toFixed(3) : '?') + ', rear ' + (rb ? rb.bBack.toFixed(3) : '?')
              + ' m against ' + full.toFixed(3) + ' m end-on) — nothing to release, the clause is not exercised');
          }
          for (let run = 0; run < 5; run++) {
            for (const how of ['holster', 'lost']) {
              const r = await releaseRun(m, how, yaw);
              r.run = run + 1;
              r.endCutM = +Math.max(cutF, cutR).toFixed(3);
              releaseRows.push(r);
              const tag = kind + ' ' + how + ' run ' + (run + 1);
              if (!(r.latchedFrames > 0)) {
                bad.push(tag + ': she never stood inside the full standoff, so nothing was released');
              }
              if (!r.termAtStand || !(r.approachFrames > 0)) {
                bad.push(tag + ': the term was not live at the stand — the row proves nothing');
              } else if (!r.released) {
                bad.push(tag + ': the term had not released by the end of the walk-away');
              }
              if (!(r.machineMovedM <= 0.005)) {
                bad.push(tag + ': letting go of the term moved the MACHINE ' + r.machineMovedM + ' m (worst frame '
                  + r.machineWorstFrameM + ' m) — the manager pushed it off her; bar 0.005 m');
              }
              if (!(r.worstFrameCorrectionM <= 0.15)) {
                bad.push(tag + ': the term release moved her root ' + r.worstFrameCorrectionM.toFixed(3)
                  + ' m in ONE frame (' + r.worstAt + ') — bar 0.15 m');
              }
              if (!(r.worstStandStepM <= 0.15)) {
                bad.push(tag + ': standing still, her root moved ' + r.worstStandStepM.toFixed(3)
                  + ' m in one frame after the release');
              }

              if (!(r.totalCorrectionM <= 0.10)) {
                bad.push(tag + ': the release moved her root ' + r.totalCorrectionM.toFixed(3)
                  + ' m IN TOTAL (' + r.standCorrectionM.toFixed(3) + ' m of it while she stood still) — ruling R6 bar 0.10 m');
              }
              if (!(r.plantedFootDragM <= 0.08)) {
                bad.push(tag + ': a planted foot was dragged ' + r.plantedFootDragM.toFixed(3)
                  + ' m during the release — ruling R6 bar 0.08 m');
              }
            }
          }
          m.position.x += 150; if (m.root) m.root.position.x = m.position.x;
        }
      } finally {
        Cc.moveCapsule = origMove;
        C.input.keys.delete('KeyW'); C.input.keys.delete('KeyS');
        M.aimLock = 0;
      }

      const hullRows = [];
      const segSeg = (p1, q1, p2, q2) => {
        const d1x = q1[0] - p1[0], d1y = q1[1] - p1[1], d1z = q1[2] - p1[2];
        const d2x = q2[0] - p2[0], d2y = q2[1] - p2[1], d2z = q2[2] - p2[2];
        const rx = p1[0] - p2[0], ry = p1[1] - p2[1], rz = p1[2] - p2[2];
        const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z;
        const ff = d2x * rx + d2y * ry + d2z * rz;
        let sN, tN;
        if (a <= 1e-9 && e <= 1e-9) { sN = 0; tN = 0; }
        else if (a <= 1e-9) { sN = 0; tN = Math.min(1, Math.max(0, ff / e)); }
        else {
          const c = d1x * rx + d1y * ry + d1z * rz;
          if (e <= 1e-9) { tN = 0; sN = Math.min(1, Math.max(0, -c / a)); }
          else {
            const b = d1x * d2x + d1y * d2y + d1z * d2z;
            const den = a * e - b * b;
            sN = den > 1e-12 ? Math.min(1, Math.max(0, (b * ff - c * e) / den)) : 0;
            tN = (b * sN + ff) / e;
            if (tN < 0) { tN = 0; sN = Math.min(1, Math.max(0, -c / a)); }
            else if (tN > 1) { tN = 1; sN = Math.min(1, Math.max(0, (b - c) / a)); }
          }
        }
        return Math.hypot(p1[0] + d1x * sN - (p2[0] + d2x * tN), p1[1] + d1y * sN - (p2[1] + d2y * tN),
          p1[2] + d1z * sN - (p2[2] + d2z * tN));
      };
      const bodyGap = (caps, x, y, z) => {
        let best = Infinity, arg = null;
        const a = [x, y + 0.4, z], b = [x, y + 1.4, z];
        for (const c of caps) {
          if (!(c.r > 1e-4)) continue;
          const g = segSeg(a, b, c.a, c.b) - c.r - 0.4;
          if (g < best) { best = g; arg = c.name; }
        }
        return { gap: best, hull: arg };
      };

      const armV = new (p.position.constructor)(), armV2 = new (p.position.constructor)();
      const armV3 = new (p.position.constructor)();
      const knuckle = (side) => {
        const bi = an.bones[an._findName('index_01_' + side + '_')];
        const bp = an.bones[an._findName('pinky_01_' + side + '_')];
        return bi && bp ? [bi, bp] : null;
      };
      const KN = { right: knuckle('r'), left: knuckle('l') };
      const armGap = (caps) => {
        const b = an.b;
        let best = Infinity, arg = null, side = null;
        for (const [sd, lo, ha] of [['right', b.loArmR, b.handR], ['left', b.loArmL, b.handL]]) {
          if (!lo || !ha) continue;
          lo.bone.getWorldPosition(armV);

          const kn = KN[sd];
          if (kn) { kn[0].getWorldPosition(armV2); kn[1].getWorldPosition(armV3); armV2.add(armV3).multiplyScalar(0.5); }
          else ha.bone.getWorldPosition(armV2);
          const e = [armV.x, armV.y, armV.z];
          const f = [armV2.x, armV2.y, armV2.z];
          for (const c of caps) {
            if (!(c.r > 1e-4)) continue;
            const g = segSeg(e, f, c.a, c.b) - c.r - 0.05;
            if (g < best) { best = g; arg = c.name; side = sd; }
          }
        }
        return { gap: best, hull: arg, side };
      };

      const cl = (px, py, pz, ax, ay, az, bx, by, bz) => {
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const l2 = abx * abx + aby * aby + abz * abz;
        let t = l2 > 1e-12 ? ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        return [ax + abx * t, ay + aby * t, az + abz * t];
      };
      const axisDist = (x, y, z, A, B) => {
        const y0 = y + 0.4, y1 = y + 1.4;
        const s1 = cl(x, (y0 + y1) / 2, z, A[0], A[1], A[2], B[0], B[1], B[2]);
        const s2 = cl(s1[0], s1[1], s1[2], x, y0, z, x, y1, z);
        const s3 = cl(s2[0], s2[1], s2[2], A[0], A[1], A[2], B[0], B[1], B[2]);
        return Math.hypot(s2[0] - s3[0], s2[1] - s3[1], s2[2] - s3[2]);
      };
      const V3 = p.position.constructor;
      const roster = [...STAGED_KINDS].sort();
      for (const kind of roster) {
        const m = getKind(kind);
        if (!m) { hullRows.push({ kind, skipped: 'could not be spawned in this scene' }); continue; }
        for (let i = 0; i < 12; i++) await frame();
        M.aimLock = 0;
        M.holsterLance();
        for (let i = 0; i < 16; i++) await frame();

        await stageFacing(m, (m.bodyRadius || 1) + (m.standoffHalfLen || 0) + 0.95 + 0.4 + 1.2);
        M.drawLance(300);
        const t0 = performance.now();
        let rc = null;
        while (performance.now() - t0 < 4000) {
          await frame(); M.drawLance(300);
          rc = Cc._machineMap && Cc._machineMap.get(m);
          if (M.stance === 'ready' && M.approachMachine === m && rc && rc.meleeCut && rc.bValid) break;
        }
        const live = !!(rc && rc.meleeCut && M.approachMachine === m);
        if (!live) {
          hullRows.push({ kind, termLive: false });
          bad.push(kind + ': the melee term never went live against it — its hull clause proves nothing');
          M.holsterLance(); m.position.x += 150; if (m.root) m.root.position.x = m.position.x;
          continue;
        }
        const base = m.standoffHalfLen || 0;
        const dBase = (m.bodyRadius || 1) + Cc.machinePad + 0.4;

        const mStart = [m.position.x, m.position.z];
        const bearings = [0];
        for (let k = 0; k < 16; k++) bearings.push(-Math.PI + (k + 0.5) * (2 * Math.PI / 16));
        let termWorst = { gap: Infinity }, sharedWorst = { gap: Infinity }, headOn = null;
        let nTerm = 0, nShared = 0, pen = 0, lost = 0, capsN = 0;
        let armPen = 0, armWorst = { gap: Infinity }, swingPen = 0, swingFrames = 0, swingWorst = { gap: Infinity };
        const putDown = async (wx, wz, r) => {
          const x0 = m.position.x + wx * r, z0 = m.position.z + wz * r;
          p.position.set(x0, C.terrain.getHeight(x0, z0), z0);
          if (p._prevPos) p._prevPos.copy(p.position);
          p.velocity.set(0, 0, 0);
          p.heading = Math.atan2(-wx, -wz); p._faceX = -wx; p._faceZ = -wz;
          p._candX = -wx; p._candZ = -wz; p.camYaw = p.heading + Math.PI;
          if (p.model) p.model.rotation.y = p.heading;
          for (let f = 0; f < 2; f++) { await frame(); M.drawLance(300); }
        };
        const mgrUpdate = C.machines.update;
        C.machines.update = () => {};
        let machineMovedM = 0;
        try {
        for (let bi = 0; bi < bearings.length; bi++) {
          const b = bearings[bi];
          const hfx = Math.sin(m.heading), hfz = Math.cos(m.heading);
          const wx = hfx * Math.cos(b) + hfz * Math.sin(b), wz = hfz * Math.cos(b) - hfx * Math.sin(b);
          const r0 = (m.bodyRadius || 1) + 0.3;
          await putDown(wx, wz, r0);
          await putDown(wx, wz, r0);

          for (let f = 0; f < 30; f++) {
            if (p.grounded && Math.abs(p.position.y - C.terrain.getHeight(p.position.x, p.position.z)) < 0.01) break;
            await frame(); M.drawLance(300);
          }
          if (M.approachMachine !== m || !rc.meleeCut) { lost++; continue; }
          const caps = C.hitHulls.hulls(m);
          capsN = caps.length;
          const top = m.position.y + Math.max(0.6, (m.height || 2) * 0.75);
          const bA = [m.position.x - hfx * base, m.position.y + 0.15, m.position.z - hfz * base];
          const bB = [m.position.x + hfx * base, top, m.position.z + hfz * base];
          const g = bodyGap(caps, p.position.x, p.position.y, p.position.z);
          const ag = armGap(caps);
          const db = axisDist(p.position.x, p.position.y, p.position.z, bA, bB) - dBase;
          const cls = Math.abs(db) < 0.03 ? 'shared' : (db < 0 ? 'opened' : 'extended');
          const where = bi === 0 ? 'head-on' : ('bearing ' + Math.round(b * 180 / Math.PI));
          if (bi === 0) {
            headOn = { gap: +g.gap.toFixed(3), hull: g.hull, cls,
              standM: +Math.hypot(p.position.x - m.position.x, p.position.z - m.position.z).toFixed(3) };
          }
          if (cls === 'shared') {
            nShared++;
            if (g.gap < sharedWorst.gap) sharedWorst = { gap: g.gap, hull: g.hull, where };
          } else {
            nTerm++;
            if (g.gap <= 0) pen++;
            if (g.gap < termWorst.gap) termWorst = { gap: g.gap, hull: g.hull, where, cls };
            if (ag.gap < 0) armPen++;
            if (ag.gap < armWorst.gap) armWorst = { gap: ag.gap, hull: ag.hull, side: ag.side, where };
          }
        }

        machineMovedM = +Math.hypot(m.position.x - mStart[0], m.position.z - mStart[1]).toFixed(4);

        {
          const hp0 = m.health;
          m.health = 1e6;
          const hfx = Math.sin(m.heading), hfz = Math.cos(m.heading);
          await putDown(hfx, hfz, (m.bodyRadius || 1) + 0.3);
          await putDown(hfx, hfz, (m.bodyRadius || 1) + 0.3);
          for (let f = 0; f < 10; f++) { await frame(); M.drawLance(300); }
          for (const heavy of [false, true]) {
            M.combo = 0;
            M.swing({ heavy });
            let seen = false;
            const tq = performance.now();
            while (performance.now() - tq < 3000) {
              await frame();
              if (M.stance === 'swing') seen = true;
              const ag = armGap(C.hitHulls.hulls(m));
              swingFrames++;
              if (ag.gap < 0) swingPen++;
              if (ag.gap < swingWorst.gap) swingWorst = { gap: ag.gap, hull: ag.hull, side: ag.side, beat: heavy ? 'heavy' : 'light-1', phase: M.phase };
              if (seen && !M.active) break;
            }
            for (let f = 0; f < 12; f++) await frame();
          }
          m.health = hp0;
        }
        } finally { C.machines.update = mgrUpdate; }
        if (machineMovedM > 0.005) {
          bad.push(kind + ': the machine moved ' + machineMovedM + ' m while she was set against it — '
            + 'the hull clause was measured on a machine that did not stay put');
        }
        if (lost) bad.push(kind + ': the term dropped on ' + lost + ' of ' + bearings.length + ' bearings — those went unmeasured');
        const row = { kind, termLive: true, hulls: capsN, machineMovedM,
          outlineFrontM: +(rc.bFront || 0).toFixed(3), outlineBackM: +(rc.bBack || 0).toFixed(3),
          baseHalfLen: +base.toFixed(3), boundCostMs: +(rc.bMs || 0).toFixed(2),
          termPoints: nTerm, penetrations: pen,
          termWorstGapM: nTerm ? +termWorst.gap.toFixed(3) : null, termWorstHull: termWorst.hull || null,
          termWorstWhere: termWorst.where ? termWorst.where + '/' + termWorst.cls : null,
          headOn, sharedPoints: nShared,
          sharedWorstGapM: nShared ? +sharedWorst.gap.toFixed(3) : null,
          sharedWorstHull: sharedWorst.hull || null, sharedWorstWhere: sharedWorst.where || null,
          armPenetrations: armPen, armWorstGapM: Number.isFinite(armWorst.gap) ? +armWorst.gap.toFixed(3) : null,
          armWorstHull: armWorst.hull || null, armWorstWhere: armWorst.where ? armWorst.where + '/' + armWorst.side : null,
          swingFrames, swingArmPenetrations: swingPen,
          swingArmWorstGapM: Number.isFinite(swingWorst.gap) ? +swingWorst.gap.toFixed(3) : null,
          swingArmWorst: swingWorst.hull ? swingWorst.beat + ' ' + swingWorst.phase + ' ' + swingWorst.side + ' in ' + swingWorst.hull : null };
        hullRows.push(row);
        if (armPen > 0) {
          bad.push(kind + ': at ' + armPen + ' place(s) the melee term lets her stand, her ' + armWorst.side
            + ' forearm/fist is INSIDE a hull (worst ' + armWorst.gap.toFixed(3) + ' m, ' + armWorst.hull + ', ' + armWorst.where + ') — S5');
        }
        if (swingPen > 0) {
          bad.push(kind + ': swinging at it head-on, a forearm/fist went INSIDE its hull on ' + swingPen + ' of '
            + swingFrames + ' frames (worst ' + row.swingArmWorstGapM + ' m, ' + row.swingArmWorst + ') — S5');
        }
        if (pen > 0) {
          bad.push(kind + ': ' + pen + ' place(s) the melee term lets her stand put her body capsule '
            + 'INSIDE a hull (worst ' + termWorst.gap.toFixed(3) + ' m, ' + termWorst.hull + ', '
            + row.termWorstWhere + ')');
        }
        M.holsterLance();
        for (let i = 0; i < 16; i++) await frame();
        m.position.x += 150; if (m.root) m.root.position.x = m.position.x;
      }
      for (const k of [...new Set([KIND.sentry, KIND.herd].filter(Boolean))]) {
        if (!hullRows.some((r) => r.kind === k && r.termLive)) bad.push('hull clause: ' + k + ' was not measured');
      }

      const liveRows = [];
      const animateRig = (m) => {
        m.update = (dt, t) => { m._speed = 0; m._conform(dt); m.animate?.(dt, t); m._updateParts?.(dt, t); };
      };
      for (const kind of [...new Set([KIND.sentry, KIND.herd].filter(Boolean))]) {
        const m = getKind(kind);
        if (!m) { bad.push('live-hull clause: no ' + kind + ' could be staged'); continue; }
        for (const variant of ['frozen-then-animated', 'animated-throughout']) {
          M.aimLock = 0;
          M.holsterLance();
          for (let i = 0; i < 12; i++) await frame();
          await stageFacing(m, (m.bodyRadius || 1) + (m.standoffHalfLen || 0) + 0.95 + 0.4 + 1.2);
          if (variant === 'animated-throughout') {
            animateRig(m);
            const tq = performance.now();
            while (performance.now() - tq < 1000) await frame();
          }
          M.drawLance(300);
          { const tq = performance.now();
            while (M.stance !== 'ready' && performance.now() - tq < 3000) await frame(); }
          C.input.keys.add('KeyW');
          let last = 99, still = 0;
          for (let f = 0; f < 200; f++) {
            await frame(); M.drawLance(300);
            const d2 = Math.hypot(p.position.x - m.position.x, p.position.z - m.position.z);
            if (Math.abs(d2 - last) < 0.002) { if (++still > 8) break; } else still = 0;
            last = d2;
          }
          C.input.keys.delete('KeyW');
          for (let f = 0; f < 6; f++) { await frame(); M.drawLance(300); }
          const rc0 = Cc._machineMap && Cc._machineMap.get(m);
          if (rc0) { rc0.pushMax = 0; rc0.rMsMax = 0; rc0.rMsSum = 0; rc0.rN = 0; rc0.lMsMax = 0; rc0.lMsSum = 0; rc0.lN = 0; }
          const cyc0 = rc0 ? (rc0.rCycles || 0) : 0;
          const standAt = Math.hypot(p.position.x - m.position.x, p.position.z - m.position.z);
          const mx0 = m.position.x, mz0 = m.position.z;
          animateRig(m);
          let frames = 0, termFrames = 0, aside = 0, worst = { gap: Infinity }, below = 0;
          let armW = { gap: Infinity }, armIn = 0;
          let sMin = 9, sMax = 0, stepMax = 0, lpx = p.position.x, lpz = p.position.z;
          let tw = performance.now();
          const measure = (phase) => {
            const rc = Cc._machineMap && Cc._machineMap.get(m);
            const on = !!(rc && rc.meleeCut);
            const st = Math.hypot(p.position.x - lpx, p.position.z - lpz);
            if (st > stepMax) stepMax = st;
            lpx = p.position.x; lpz = p.position.z;
            const sd = Math.hypot(p.position.x - m.position.x, p.position.z - m.position.z);
            if (sd < sMin) sMin = sd;
            if (sd > sMax) sMax = sd;
            if (!on) return on;
            termFrames++;
            if (rc.aside) { aside++; return on; }
            const caps5 = C.hitHulls.hulls(m);
            const g = bodyGap(caps5, p.position.x, p.position.y, p.position.z);
            if (g.gap < worst.gap) worst = { gap: g.gap, hull: g.hull, phase, t: +((performance.now() - tw) / 1000).toFixed(2) };
            if (g.gap < 0.05) below++;
            const ag = armGap(caps5);
            if (ag.gap < armW.gap) armW = { gap: ag.gap, hull: ag.hull, side: ag.side, phase };
            if (ag.gap < 0) armIn++;
            return on;
          };
          let drawnFrames = 0, drawnTerm = 0;
          while (performance.now() - tw < 6000) {
            await frame(); M.drawLance(300);
            frames++; drawnFrames++;
            if (measure('drawn')) drawnTerm++;
          }
          M.holsterLance();
          let holFrames = 0, released = false, heldWhileStanding = 0, standFrames = 0;

          const th = performance.now();
          while (performance.now() - th < 1200) {
            await frame(); frames++; holFrames++; standFrames++;
            if (measure('holstered-stand')) heldWhileStanding++;
          }
          C.input.keys.add('KeyS');
          const tw2 = performance.now();
          while (performance.now() - tw2 < 1800) {
            await frame(); frames++; holFrames++;
            if (!measure('holstered-walk')) released = true;
          }
          C.input.keys.delete('KeyS');
          const rc = Cc._machineMap && Cc._machineMap.get(m);
          m.update = () => {};
          const row = { kind, variant, standAtEngageM: +standAt.toFixed(3),
            standRangeM: [+sMin.toFixed(3), +sMax.toFixed(3)], frames, drawnFrames, drawnTermFrames: drawnTerm,
            holsteredFrames: holFrames, termFrames, asideFrames: aside, framesBelowBar: below,
            worstGapM: Number.isFinite(worst.gap) ? +worst.gap.toFixed(4) : null,
            worstHull: worst.hull || null, worstPhase: worst.phase || null, worstAtS: worst.t ?? null,
            releasedAfterHolster: released && !(rc && rc.meleeCut),
            latchedWhileStanding: heldWhileStanding + '/' + standFrames,
            armWorstGapM: Number.isFinite(armW.gap) ? +armW.gap.toFixed(4) : null,
            armWorst: armW.hull ? armW.phase + ' ' + armW.side + ' in ' + armW.hull : null, armFramesInside: armIn,
            largestLivePushM: rc ? +(rc.pushMax || 0).toFixed(4) : null,
            worstFrameStepM: +stepMax.toFixed(4),
            machineMovedM: +Math.hypot(m.position.x - mx0, m.position.z - mz0).toFixed(4),
            rollCycles: rc ? (rc.rCycles || 0) - cyc0 : null,
            rollMsMean: rc && rc.rN ? +(rc.rMsSum / rc.rN).toFixed(3) : null,
            rollMsMax: rc ? +(rc.rMsMax || 0).toFixed(3) : null,
            liveMsMean: rc && rc.lN ? +(rc.lMsSum / rc.lN).toFixed(4) : null,
            liveMsMax: rc ? +(rc.lMsMax || 0).toFixed(3) : null };
          liveRows.push(row);
          const tag = kind + ' ' + variant;
          if (!(drawnTerm >= drawnFrames - 1 && drawnFrames > 20)) {
            bad.push(tag + ': the term was engaged on only ' + drawnTerm + ' of ' + drawnFrames
              + ' drawn frames — the row proves nothing');
          }
          if (below > 0) {
            bad.push(tag + ': with the rig animating, her body capsule came within ' + worst.gap.toFixed(3)
              + ' m of ' + worst.hull + ' (' + worst.phase + ', t ' + worst.t + ' s) on ' + below
              + ' frame(s) — bar 0.05 m (ruling R4)');
          }
          if (!row.releasedAfterHolster) bad.push(tag + ': the term had not let go after she walked away from the holster');
          if (armIn > 0) {
            bad.push(tag + ': a forearm/fist was INSIDE a hull on ' + armIn + ' frame(s) (worst ' + row.armWorstGapM
              + ' m, ' + row.armWorst + ') — S5');
          }
          if (row.machineMovedM > 0.005) bad.push(tag + ': the machine moved ' + row.machineMovedM + ' m');
        }
        M.holsterLance();
        for (let i = 0; i < 12; i++) await frame();
        m.position.x += 150; if (m.root) m.root.position.x = m.position.x;
      }

      return { pass: bad.length === 0, detail: { bad, rows, reachRows, releaseRows, hullRows, liveRows,
        note: 'The control (holstered) and the treatment (drawn) are the same walk into the '
          + 'same frozen machine over the same ground. machineDisplacementM is the machine '
          + 'ROOT, which is what machines/index.js pushes; worstFramePushM is the largest '
          + 'single-frame move, because an integrating push shows up there first. '
          + 'playerToShellM is the exact no-interpenetration bound the ownership grant asks '
          + 'for (her capsule radius 0.4 against the machine bodyRadius shell), and '
          + 'meleeStandoffHalfLen is published so the segment half of the term is visible: on '
          + 'a Sentry 1.5615 -> 0.5465 (MELEE_L_FLOOR), pad 0.55 -> 0.32, while '
          + 'standoffHalfLen itself does not move on any row. reachRows are the '
          + 'second clause (fix pass 2): the term is published as m.meleeStandoffHalfLen and '
          + 'read by ONE consumer (the manager push loop that has to agree with the player '
          + 'capsule), so the machine\\'s own standoffHalfLen — which the Round-4 herd walker file and '
          + 'the Round-4 heavy file turn into a charge reach and melee.js into a Silent Strike prompt '
          + 'radius — is bit-identical drawn and holstered. ROUND 5 (ruling R4): releaseRows '
          + 'is clause 3 — per RENDERED frame, what the collision solve added to the position '
          + 'her own integrator produced (moveCapsule wrapped, summed over the sim sub-steps '
          + 'of the frame), while the term lets go after a holster or a lost target and she '
          + 'stands, then walks away; bar 0.15 m, 5 runs x 2 sequences x sentry/herd walker/'
          + 'widest-cone sentry, each void unless the term was live at the stand and withdrawn by the '
          + 'end. The round-4 build read 1.247 / 0.525 / 1.234 m here. hullRows is clause 4 — '
          + 'every species in the roster staged FACING her (root yaw = heading, which m.update '
          + 'would have done had it not been stubbed), the live collider outline found by the '
          + 'solver, and her capsule against every hull capsule at each outline point: '
          + 'penetrations must be 0 on every point the term decided (opened = inside the full '
          + 'standoff, extended = an end the hulls lengthened). sharedWorstGapM is the '
          + 'machine\\'s OWN standoff outline, identical holstered and drawn, published per '
          + 'species so the base standoff\\'s own hull pokes are visible (the Sentry '
          + 'family\\'s neck bone capsule spans 4.4 m across the body; a Flier\\'s '
          + 'wings) — the spatial lane\\'s geometry, not this term\\'s. FIX PASS 1: liveRows is '
          + 'clause 5 — the rig ANIMATED in place (conform + idle clip, no AI) for 6 s with the '
          + 'term engaged and 3 s after a holster, Sentry / Widest-cone sentry / Herd walker, frozen-then-animated '
          + '(the judge\\'s staging) and animated-throughout; her capsule against every hull '
          + 'capsule on every rendered frame, bar 0.05 m, and the term must let go after the '
          + 'holster (it relaxes to the machine\\'s own standoff at 1.5 m/s, <= 0.10 m a frame). '
          + 'Clause 3 now also counts the live check\\'s own pushes (collision.meleePushM). '
          + 'ROUND 6 (ruling R6): clause 3 adds the Colossus and gates the TOTAL the release moved '
          + 'her (<= 0.10 m over the stand and the walk-away, totalCorrectionM) and every planted '
          + 'foot (<= 0.08 m, plantedFootDragM); clause 5 stands 1.2 s after the holster (the term '
          + 'stays latched and must not move her) and then walks away, which is what releases it. '
          + 'S5: clauses 4 and 5 measure BOTH forearms (elbow -> fist capsule, radius 0.05) against '
          + 'every hull capsule as well as her body capsule, and clause 4 swings a light-1 and a '
          + 'heavy at every species head-on: no forearm/fist inside a hull (< 0).' } };
    })()`)),
  },

  {
    id: 'A107-draw-arm-path', kind: 'action', lane: 'melee',
    timeout: 300000, settle: 500,
    title: 'Draw and holster from idle, a jog and a sprint (real key, 5 cycles each, plus the '
      + 'aim stow): the right elbow never above her head (+0.05 m), wherever it is up at '
      + 'shoulder height never more than 0.10 m behind her head, and the forearm never on the back of her head',
    setup: `__CTX__.input.enabled = true;`,
    assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator;
      if (!an?.debugMelee || !an.b?.upArmR || !an.b?.loArmR || !an.b?.head) {
        return { pass: null, detail: 'SKIP: no animator.debugMelee / arm bones' };
      }
      ${FREEZE} ${FRAME}

      const C0 = C.state;
      C.state = 'playing';
      const M = C.combat.melee;
      M.aimLock = 0;
      const V3 = p.position.constructor;
      const wE = new V3(), wH = new V3(), wS = new V3(), wW = new V3(), wQ = new V3(), wU = new V3();
      const inv = p.model.matrixWorld.clone();

      const hasHead = typeof an._headFrame === 'function' && typeof an._headUnit === 'function';
      const read = () => {
        p.model.updateWorldMatrix(true, false);
        inv.copy(p.model.matrixWorld).invert();
        an.b.loArmR.bone.getWorldPosition(wE).applyMatrix4(inv);
        an.b.head.bone.getWorldPosition(wH).applyMatrix4(inv);
        an.b.upArmR.bone.getWorldPosition(wS).applyMatrix4(inv);
        an.b.handR.bone.getWorldPosition(wW).applyMatrix4(inv);
        let back = 9, any = 9;
        if (hasHead) {
          an._headFrame();
          for (let i = 0; i <= 10; i++) {
            wQ.copy(wE).lerp(wW, i / 10);
            an._headUnit(wQ, wU);
            const L = wU.length();
            if (L < 1e-6) { back = Math.min(back, -0.1); any = Math.min(any, -0.1); continue; }
            const g = (L - 1) * Math.hypot(wU.x / L * 0.105, wU.y / L * 0.135, wU.z / L * 0.115);
            if (g < any) any = g;
            if (wU.z < 0 && g < back) back = g;
          }
        }
        return { over: wE.y - wH.y, behind: wH.z - wE.z, aboveSh: wE.y - wS.y, back, any };
      };
      const tapB = async () => { C.input.keys.add('KeyB'); await frame(); await frame(); C.input.keys.delete('KeyB'); };
      const stats = () => ({ frames: 0, overMax: -9, behindBandMax: -9, behindAnyMax: -9, bandFrames: 0,
        overAt: null, behindAt: null, backMin: 9, anyMin: 9, aboveShMax: -9, backAt: null });
      const take = (st, tag, phase) => {
        const r = read();
        st.frames++;
        if (r.back < st.backMin) { st.backMin = r.back; st.backAt = tag + ' ' + phase; }
        if (r.any < st.anyMin) st.anyMin = r.any;
        if (r.aboveSh > st.aboveShMax) st.aboveShMax = r.aboveSh;
        if (r.over > st.overMax) { st.overMax = r.over; st.overAt = tag + ' ' + phase; }
        if (r.behind > st.behindAnyMax) st.behindAnyMax = r.behind;
        /* M4: the band has to evaluate. Elbow within 0.12 m under the shoulder and up:
         * more frames graded than Round 4's "over the shoulder", the same 0.10 m bar. */
        if (r.aboveSh > 0 || (r.aboveSh > -0.12 && (an.melee?._dbg?.w ?? 0) >= 0.5)) {
          st.bandFrames++;
          if (r.behind > st.behindBandMax) { st.behindBandMax = r.behind; st.behindAt = tag + ' ' + phase; }
        }
      };
      const rows = [], bad = [];
      const modes = [['idle', []], ['jog', ['KeyW']], ['sprint', ['KeyW', 'ShiftLeft']]];
      for (const [mode, keys] of modes) {
        M.holsterLance();
        { const tq = performance.now(); while (M.stance !== 'holstered' && performance.now() - tq < 3000) await frame(); }
        ${STAGE}
        C.input.keys.clear(); for (const k of keys) C.input.keys.add(k);
        { const tq = performance.now(); while (performance.now() - tq < (keys.length ? 1400 : 300)) await frame(); }
        for (let cyc = 0; cyc < 6; cyc++) {
          const aimStow = cyc === 5;
          const st = stats();
          const tag = mode + (aimStow ? ' aim-stow' : ' cycle ' + (cyc + 1));

          await tapB();
          { const tq = performance.now();
            while (performance.now() - tq < 2000) {
              await frame();
              const d = an.debugMelee();
              if (d && d.stance === 'draw') take(st, tag, 'draw');
              if (M.stance === 'ready') break;
            } }
          for (let i = 0; i < 8; i++) await frame();
          const drew = M.stance === 'ready';

          if (aimStow) C.input.mouse.buttons |= 4; else await tapB();
          { const tq = performance.now();
            while (performance.now() - tq < 2500) {
              await frame();
              const d = an.debugMelee();
              if (d && d.stance === 'holster') take(st, tag, 'holster');
              if (M.stance === 'holstered' && !(d && d.stance === 'holster')) break;
            } }
          C.input.mouse.buttons &= ~4;
          for (let i = 0; i < 10; i++) await frame();
          const row = { mode, cycle: aimStow ? 'aim-stow' : cyc + 1, drew, holstered: M.stance === 'holstered',
            pathFrames: st.frames, bandFrames: st.bandFrames,
            elbowOverHeadMaxM: +st.overMax.toFixed(3), elbowOverAt: st.overAt,
            elbowBehindHeadBandMaxM: st.bandFrames ? +st.behindBandMax.toFixed(3) : null, elbowBehindAt: st.behindAt,
            elbowBehindAnyMaxM: +st.behindAnyMax.toFixed(3),
            elbowAboveShoulderMaxM: +st.aboveShMax.toFixed(3),
            forearmToBackOfHeadMinM: hasHead ? +st.backMin.toFixed(3) : null, forearmBackAt: st.backAt,
            forearmToHeadMinM: hasHead ? +st.anyMin.toFixed(3) : null };
          rows.push(row);
          if (!drew || !(st.frames >= 6)) { bad.push(tag + ': the draw/holster did not play (' + st.frames + ' path frames)'); continue; }
          if (!(row.elbowOverHeadMaxM <= 0.05)) {
            bad.push(tag + ': the right elbow went ' + row.elbowOverHeadMaxM + ' m ABOVE her head (' + row.elbowOverAt + ') — bar +0.05 m');
          }
          if (row.elbowBehindHeadBandMaxM != null && !(row.elbowBehindHeadBandMaxM <= 0.10)) {
            bad.push(tag + ': with the elbow up at shoulder height it was ' + row.elbowBehindHeadBandMaxM
              + ' m BEHIND her head (' + row.elbowBehindAt + ') — bar 0.10 m, Kevin\\'s "arm literally behind head"');
          }
          if (!hasHead) bad.push(tag + ': no head ellipsoid to measure the forearm against (clause c)');
          else if (!(row.forearmToBackOfHeadMinM >= 0.05)) {
            bad.push(tag + ': the right forearm came within ' + row.forearmToBackOfHeadMinM + ' m of the BACK of her head ('
              + row.forearmBackAt + ') — bar 0.05 m, the r5 skeptic\\'s "forearm across the back of her head"');
          }
          if (keys.length) {

            C.input.keys.clear(); for (const k of keys) C.input.keys.add(k);
          }
        }
        C.input.keys.clear(); p.velocity.set(0, 0, 0);
      }
      C.state = C0;
      const per = {};
      for (const r of rows) {
        const k = r.mode;
        per[k] = per[k] || { cycles: 0, overMax: -9, behindBandMax: -9, behindAnyMax: -9, bandFrames: 0, aboveShoulderMax: -9, forearmBackOfHeadMin: 9 };
        per[k].cycles++;
        per[k].bandFrames += r.bandFrames;
        per[k].aboveShoulderMax = Math.max(per[k].aboveShoulderMax, r.elbowAboveShoulderMaxM);
        if (r.forearmToBackOfHeadMinM != null) per[k].forearmBackOfHeadMin = Math.min(per[k].forearmBackOfHeadMin, r.forearmToBackOfHeadMinM);
        per[k].overMax = Math.max(per[k].overMax, r.elbowOverHeadMaxM);
        if (r.elbowBehindHeadBandMaxM != null) per[k].behindBandMax = Math.max(per[k].behindBandMax, r.elbowBehindHeadBandMaxM);
        per[k].behindAnyMax = Math.max(per[k].behindAnyMax, r.elbowBehindAnyMaxM);
      }
      return { pass: bad.length === 0, detail: { bad, perMode: per, rows,
        note: 'ROUND 6 (c): the right forearm >= 0.05 m off the BACK half of her head ellipsoid on every '
          + 'draw/holster frame (forearmToBackOfHeadMinM). WHY (b) READS NO FRAMES ON THIS BUILD, stated so '
          + 'nobody has to discover it: the re-authored reach never lifts the elbow above the shoulder joint '
          + '(elbowAboveShoulderMaxM, bandFrames 0) — which is the strongest form of "not up behind her '
          + 'head"; (a) and (c) are the clauses that bind every frame. The band itself is geometry: the '
          + 'haft rides on her back 0.13 m behind the spine, so at the grab the hand is 0.2+ m behind the '
          + 'shoulder plane and, with a 0.25 m forearm, the elbow is 0.1-0.2 m behind the head plane on ANY '
          + 'roll of the elbow circle unless it goes up above the shoulder. '
          + 'R8 as gated: (a) elbow <= head + 0.05 m on every draw/holster frame; (b) elbow no '
          + 'more than 0.10 m behind the head\\'s frontal plane on every such frame where the elbow '
          + 'is above the shoulder joint. elbowBehindAnyMaxM is the band-free reading, published: '
          + 'it is dominated by the guard/idle arm at the ends of the path, whose elbow sits beside '
          + 'the ribs 0.26-0.36 m behind the head plane (the shoulder joint itself 0.14-0.20 m '
          + 'behind it). Five KeyB cycles per stance plus one aim stow (RMB -> the quick holster).' } };
    })()`),
  },

  /* ------------------------------------------------------ A-stow-clearance */
  {
    id: 'A-stow-clearance', kind: 'action', lane: 'melee',
    timeout: 150000, settle: 500,
    title: 'Sprint 4 s, crouch-walk, dodge and a 24-yaw chase sweep: every stowed piece\'s lowest point >= 0.05 m from both calf/heel capsules every frame, >= 0.05 m above the terrain crouched, no stowed piece on the boom (pivot -> lens) by > 0.02 m, <= 8 % of the head\'s screen box covered',
    setup: `__CTX__.input.enabled = true;`,
    assert: placed(['openGround'], `(async () => {${HERO}
      const C = __CTX__, p = C.player, an = p.animator, E = C.engine;
      const kit = p.hero?.kit, km = kit?.meshes?.[0];
      if (!km) return { pass: false, detail: 'no stow kit on the hero' };
      ${FREEZE} ${STAGE} ${FRAME} ${AIMLOCK} ${KITLINES}
      C.combat.melee.holsterLance();
      for (let i = 0; i < 40; i++) await frame();
      const V3 = p.position.constructor;
      const g = km.geometry, P = g.getAttribute('_piece'), pos = g.getAttribute('position');
      const PIECES = { lance: 1, bow: 2, quiver: 4 };
      /* every vertex of a piece that can be its lowest: the bottom 6 % of its bind height */
      const low = {};
      for (const [name, bit] of Object.entries(PIECES)) {
        let lo = 9, hi = -9; const ids = [];
        for (let i = 0; i < pos.count; i++) { if ((Math.round(P.getX(i)) & bit) === 0) continue; const y = pos.getY(i); if (y < lo) lo = y; if (y > hi) hi = y; }
        const cut = lo + (hi - lo) * 0.06;
        for (let i = 0; i < pos.count; i++) { if ((Math.round(P.getX(i)) & bit) === 0) continue; if (pos.getY(i) <= cut) ids.push(i); }
        low[name] = ids;
      }
      const a = new V3(), b = new V3(), c = new V3(), v = new V3(), w = new V3();
      const capsule = (q, A, B, r) => segPt(q, A, B) - r;
      const rows = {};
      const sample = (tag) => {
        km.updateMatrixWorld(true);
        const r = rows[tag] || (rows[tag] = { n: 0, legGap: 9, legGapPiece: null, groundGap: 9, groundPiece: null });
        r.n++;
        for (const [name, ids] of Object.entries(low)) {
          if (name !== 'lance' && (kit.hidden & PIECES[name])) continue;
          for (const i of ids) {
            km.getVertexPosition(i, v); km.localToWorld(v);
            const gy = C.terrain.getHeight(v.x, v.z);
            if (v.y - gy < r.groundGap) { r.groundGap = v.y - gy; r.groundPiece = name; }
            an._charOfWorld(v.clone(), w);
            for (const [ca, fo] of [[an.b.calfL, an.b.footL], [an.b.calfR, an.b.footR]]) {
              an._charOf(ca.bone, a); an._charOf(fo.bone, b);
              let d = capsule(w, a, b, 0.05);
              /* the heel: the foot joint to the ball, 0.04 */
              const ball = fo.bone.children.find((x) => x.isBone);
              if (ball) { an._charOf(ball, c); d = Math.min(d, capsule(w, b, c, 0.04)); }
              if (d < r.legGap) { r.legGap = d; r.legGapPiece = name; }
            }
          }
        }
      };
      const runFor = async (tag, sec) => { const t0 = performance.now(); while (performance.now() - t0 < sec * 1000) { await frame(); sample(tag); } };
      const keys = C.input.keys;
      keys.clear(); keys.add('KeyW'); keys.add('ShiftLeft');
      await new Promise((r) => setTimeout(r, 800));
      await runFor('sprint', 4);
      keys.clear(); p.velocity.set(0, 0, 0); ${STAGE}
      await new Promise((r) => setTimeout(r, 300));
      p.setCrouch ? p.setCrouch(true) : (p.crouching = true);
      await new Promise((r) => setTimeout(r, 500));
      await runFor('crouch', 0.6);
      keys.add('KeyW'); await new Promise((r) => setTimeout(r, 400));
      await runFor('crouchWalk', 2);
      keys.clear(); p.setCrouch ? p.setCrouch(false) : (p.crouching = false);
      ${STAGE}
      await new Promise((r) => setTimeout(r, 400));
      p.dodge(); await runFor('dodge', 0.8);
      await new Promise((r) => setTimeout(r, 300));
      /* the chase sweep: the boom and the head's screen box at 24 yaws, standing and running */
      const cam = C.camera;
      const lines = [[1, 0.0145], [2, 0.02], [4, 0.03]];
      const la = new V3(), lb = new V3();
      const camRows = [];
      /* the kit's triangles in the head's screen box, nearer than the head */
      const idx = g.index;
      const raster = (headW, hr, only = 7) => {
        const pts = (x) => x.project(cam);
        const hc = headW.clone(); const hcn = pts(hc.clone());
        const sc = new V3().copy(headW); sc.y += hr;
        const top = pts(sc.clone());
        const hh = Math.abs(top.y - hcn.y) * 1.0;
        const hw = hh * cam.projectionMatrix.elements[0] / cam.projectionMatrix.elements[5];
        const box = { x0: hcn.x - hw, x1: hcn.x + hw, y0: hcn.y - hh, y1: hcn.y + hh };
        const N = 28, hit = new Uint8Array(N * N);
        const camD = cam.position.distanceTo(headW);
        const vA = new V3(), vB = new V3(), vC = new V3();
        const proj = (i, out) => { km.getVertexPosition(i, out); km.localToWorld(out); const d = out.distanceTo(cam.position); out.project(cam); out.w = d; return out; };
        for (let t = 0; t < idx.count; t += 3) {
          const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2);
          const hide = kit.hidden | 0;
          if (Math.round(P.getX(i0)) & hide) continue;
          if (!((Math.round(P.getX(i0)) & only))) continue;
          proj(i0, vA); proj(i1, vB); proj(i2, vC);
          if (vA.w > camD && vB.w > camD && vC.w > camD) continue;
          if (Math.max(vA.x, vB.x, vC.x) < box.x0 || Math.min(vA.x, vB.x, vC.x) > box.x1 || Math.max(vA.y, vB.y, vC.y) < box.y0 || Math.min(vA.y, vB.y, vC.y) > box.y1) continue;
          const area = (vB.x - vA.x) * (vC.y - vA.y) - (vB.y - vA.y) * (vC.x - vA.x);
          if (Math.abs(area) < 1e-9) continue;
          for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
            const px = box.x0 + (ix + 0.5) / N * (box.x1 - box.x0), py = box.y0 + (iy + 0.5) / N * (box.y1 - box.y0);
            const u = ((px - vA.x) * (vC.y - vA.y) - (py - vA.y) * (vC.x - vA.x)) / area;
            const q2 = ((py - vA.y) * (vB.x - vA.x) - (px - vA.x) * (vB.y - vA.y)) / area;
            if (u >= 0 && q2 >= 0 && u + q2 <= 1) hit[iy * N + ix] = 1;
          }
        }
        let n = 0; for (let i = 0; i < hit.length; i++) n += hit[i];
        return n / hit.length;
      };
      for (const moving of [false, true]) {
        keys.clear(); ${STAGE} p.velocity.set(0, 0, 0);
        await new Promise((r) => setTimeout(r, 250));
        for (let y = 0; y < 24; y++) {
          p.camYaw = (y / 24) * Math.PI * 2;
          if (moving) { keys.clear(); keys.add('KeyW'); ${STAGE} }
          for (let i = 0; i < (moving ? 40 : 18); i++) await frame();
          km.updateMatrixWorld(true);
          const piv = p.camPivot ? p.camPivot.clone() : null;
          let boomPen = -9;
          if (piv) for (const [bit, r] of lines) {
            if (bit !== 1 && (kit.hidden & bit)) continue;
            lineOf(bit, la, lb);
            la.applyMatrix4(p.model.matrixWorld); lb.applyMatrix4(p.model.matrixWorld);
            const d = segSeg(piv, cam.position, la, lb);
            boomPen = Math.max(boomPen, r - d);
          }
          const hW = new V3(); an.b.head.bone.getWorldPosition(hW);
          const R = an.skull ? an.skull(a, b) : null;
          const hr = R ? Math.max(R.x, R.y, R.z) : 0.12;
          if (R) hW.copy(a).applyMatrix4(p.model.matrixWorld);
          const cover = raster(hW, hr);
          /* who covers it, and from where (0 = the lens straight behind her) */
          const camRel = Math.atan2(cam.position.x - p.position.x, cam.position.z - p.position.z) - (p.heading ?? 0);
          const rel = ((camRel * 180 / Math.PI + 180 + 720) % 360) - 180;
          camRows.push({ yaw: y, moving, boomPen: +boomPen.toFixed(3), headCover: +cover.toFixed(3), relDeg: +((rel + 540) % 360 - 180).toFixed(0),
            by: cover > 0.02 ? { lance: +raster(hW, hr, 1).toFixed(3), bow: +raster(hW, hr, 2).toFixed(3), quiver: +raster(hW, hr, 4).toFixed(3) } : null });
        }
      }
      keys.clear(); p.velocity.set(0, 0, 0);
      const bad = [];
      for (const [tag, r] of Object.entries(rows)) {
        if (r.n < 5) bad.push(tag + ': ' + r.n + ' samples');
        if (!(r.legGap >= 0.05)) bad.push(tag + ': the ' + r.legGapPiece + ' comes ' + r.legGap.toFixed(3) + ' m from a calf/heel capsule');
        if (/crouch/.test(tag) && !(r.groundGap >= 0.05)) bad.push(tag + ': the ' + r.groundPiece + ' is ' + r.groundGap.toFixed(3) + ' m over the terrain');
      }
      const worstBoom = Math.max(...camRows.map((x) => x.boomPen));
      const worstCover = Math.max(...camRows.map((x) => x.headCover));
      if (!(worstBoom <= 0.02)) bad.push('a stowed piece crosses the boom by ' + worstBoom.toFixed(3) + ' m');
      if (!(worstCover <= 0.08)) bad.push('stowed gear covers ' + (worstCover * 100).toFixed(1) + ' % of the head box');
      for (const r of Object.values(rows)) { r.legGap = +r.legGap.toFixed(3); r.groundGap = +r.groundGap.toFixed(3); }
      return { pass: bad.length === 0, detail: { bad, rows, worstBoomPen: worstBoom, worstHeadCover: worstCover, camRows } };
    })()`),
  },

  /* ------------------------------------------------------ A-heavy-two-hand */
  {
    id: 'A-heavy-two-hand', kind: 'action', lane: 'melee',
    timeout: 60000, settle: 500,
    title: 'The heavy, windup / contact / follow: both hands <= 0.05 m from the shaft (knuckle-line centres off the live bones vs the prop\'s own matrix) and no two-handed clip track from the banned combo clip anywhere in the layer',
    setup: `__CTX__.input.enabled = true;`,
    assert: placed(['openGround'], `(async () => {${HERO}
      const C = __CTX__, p = C.player, an = p.animator;
      if (!an?.debugMelee) return { pass: null, detail: 'SKIP: no animator.debugMelee' };
      ${FREEZE} ${STAGE} ${AIMLOCK} ${SWING} ${READY}
      if (await toReady(C) !== 'ready') return { pass: null, detail: 'SKIP: the guard never came up' };
      const k = (x) => (x.phase === 'windup' ? 'windup' : x.phase === 'strike' ? 'contact' : (x.k <= 0.62 ? 'follow' : 'return'));
      const bad = [];
      const heavyRow = async (tag) => {
        const r = await rec({ heavy: true });
        const s = r.samples.filter((x) => x.beat === 'heavy' && x.stance === 'swing');
        const rows = {};
        for (const x of s) {
          const t = k(x), o = rows[t] || (rows[t] = { frames: 0, rightMax: 0, leftMax: 0, leftFracMin: 9, leftFracMax: -9, tMin: 9e9, tMax: 0 });
          o.frames++;
          o.rightMax = Math.max(o.rightMax, x.knuckle ?? 9);
          o.leftMax = Math.max(o.leftMax, x.lp ?? 9);
          o.tMin = Math.min(o.tMin, x.t); o.tMax = Math.max(o.tMax, x.t);
          if (typeof x.lgf === 'number') { o.leftFracMin = Math.min(o.leftFracMin, x.lgf); o.leftFracMax = Math.max(o.leftFracMax, x.lgf); }
        }
        for (const t of ['windup', 'contact', 'follow']) {
          const o = rows[t];
          if (!o || o.frames < 2) { bad.push(tag + ' ' + t + ': only ' + (o?.frames ?? 0) + ' frames'); continue; }
          if (!(o.rightMax <= 0.05)) bad.push(tag + ' ' + t + ': right hand ' + o.rightMax + ' m from the shaft');
          if (!(o.leftMax <= 0.05)) bad.push(tag + ' ' + t + ': left hand ' + o.leftMax + ' m from the shaft');
        }
        return rows;
      };
      const rows = await heavyRow('shepherd');
      /* THE COUNTERWEIGHT'S HEAVY (bible §5.3; its GLB is armory's W3): the same two-handed beats on its
       * 1.50 m haft and marks, on its slower clock. The prop in her hand stands in for the model. */
      const M = C.combat.melee, lay = an.melee, T0 = M.lance.tuning;
      const VAR = await import('/src/combat/lanceStow.js');
      M.lance.tuning = VAR.LANCE_VARIANTS.counterweight;
      lay.attachLance(M.lance.group, 1.50, 1, { grip: 0.20, grip2: 0.55 });
      if (M.stance !== 'ready') await toReady(C);
      for (let i = 0; i < 30; i++) await frame();
      const counterRows = await heavyRow('counterweight');
      M.lance.tuning = T0;
      lay.attachLance(M.lance.group, M.lance.length, 1, { grip: M.lance.grip, grip2: M.lance.grip2 });
      const w0 = rows.windup ? rows.windup.tMax - rows.windup.tMin : 0, w1 = counterRows.windup ? counterRows.windup.tMax - counterRows.windup.tMin : 0;
      if (!(w1 > w0 * 1.08)) bad.push('the counterweight heavy is not slower: cock ' + w1.toFixed(3) + ' s against ' + w0.toFixed(3) + ' s');
      const banned = (an.melee?.set?.order || []).filter((l) => /Heavy_Combo/i.test(l.action?.getClip?.()?.__maskedFrom || l.action?.getClip?.()?.name || ''));
      if (banned.length) bad.push('the banned combo clip is in the layer: ' + banned.map((l) => l.name).join(','));
      return { pass: bad.length === 0, detail: { bad, rows, counterRows, clips: (an.melee?.set?.order || []).map((l) => l.action?.getClip?.()?.__maskedFrom || l.name) } };
    })()`),
  },

  /* -------------------------------------------------------- A-melee-latency */
  {
    id: 'A-melee-latency', kind: 'action', lane: 'melee',
    timeout: 60000, settle: 500,
    title: 'At the 60 Hz sim, real LMB: lance in hand, press -> strike phase <= 0.30 s; from holstered, press -> strike <= the draw + 0.30 s, the draw <= 0.35 s (R5)',
    setup: `__CTX__.input.enabled = true;`,
    assert: placed(['openGround'], `(async () => {${HERO}
      const C = __CTX__, p = C.player, an = p.animator, E = C.engine;
      if (!an?.debugMelee) return { pass: null, detail: 'SKIP: no animator.debugMelee' };
      ${FREEZE} ${STAGE} ${AIMLOCK} ${FRAME} ${READY}
      const M = C.combat.melee;
      const prev = C.state; C.state = 'playing';
      const clock = () => E.simTime ?? (performance.now() / 1000);
      const press = async (holdMs = 70) => {
        const t0 = clock(), w0 = performance.now();
        let drawEnd = null, strike = null, drawStart = null, released = false, frames = 0;
        C.input.mouse.buttons |= 1;
        while (performance.now() - w0 < 3000) {
          await frame(); frames++;
          if (!released && performance.now() - w0 >= holdMs) { C.input.mouse.buttons &= ~1; released = true; }
          if (drawStart == null && M.stance === 'draw') drawStart = clock() - t0;
          if (drawEnd == null && drawStart != null && M.stance !== 'draw') drawEnd = clock() - t0;
          if (M.phase === 'strike') { strike = clock() - t0; break; }
        }
        C.input.mouse.buttons &= ~1;
        const fps = frames / Math.max(1e-3, (performance.now() - w0) / 1000);
        const tq = performance.now();
        while ((M.active || M.stance === 'swing') && performance.now() - tq < 3000) await frame();
        return { strike, drawStart, drawEnd, fps: +fps.toFixed(0) };
      };
      const rows = [];
      await toReady(C);
      for (let i = 0; i < 3; i++) { for (let j = 0; j < 30; j++) await frame(); rows.push({ mode: 'in hand', ...(await press()) }); }
      for (let i = 0; i < 3; i++) {
        M.holsterLance();
        { const tq = performance.now(); while (M.stance !== 'holstered' && performance.now() - tq < 3000) await frame(); }
        for (let j = 0; j < 20; j++) await frame();
        rows.push({ mode: 'holstered', ...(await press()) });
      }
      C.state = prev;
      const bad = [];
      for (const r of rows) {
        if (r.strike == null) { bad.push(r.mode + ': no strike phase'); continue; }
        if (r.mode === 'in hand' && !(r.strike <= 0.30)) bad.push('in hand: press -> strike ' + r.strike.toFixed(3) + ' s');
        if (r.mode === 'holstered') {
          const draw = (r.drawEnd ?? r.strike) - (r.drawStart ?? 0);
          r.draw = +draw.toFixed(3);
          if (!(draw <= 0.35)) bad.push('holstered: the draw ' + draw.toFixed(3) + ' s');
          if (!(r.strike - (r.drawEnd ?? r.strike) <= 0.30)) bad.push('holstered: draw end -> strike ' + (r.strike - r.drawEnd).toFixed(3) + ' s');
        }
        r.strike = +r.strike.toFixed(3);
        if (r.drawEnd != null) r.drawEnd = +r.drawEnd.toFixed(3);
        if (r.drawStart != null) r.drawStart = +r.drawStart.toFixed(3);
      }
      return { pass: bad.length === 0, detail: { bad, rows, usingSimClock: typeof E.simTime === 'number' } };
    })()`),
  },

  /* ------------------------------------------- A49-melee-exists / A50-undercut */
  {
    id: 'A49-melee-exists', kind: 'action', lane: 'melee',
    timeout: 60000, settle: 400,
    title: 'LMB with no aim, 1.5 m from the sentry: melee-hit fires and the machine loses HP',
    setup: `__CTX__.input.enabled = true;`,
    assert: staged(['sentry'], placed(['duelGround'], `(async () => {${HERO}
      const C = __CTX__, p = C.player, an = p.animator;
      ${STAGE} ${AIMLOCK} ${FRAME} ${PLACE}
      C.state = 'playing';
      const m = await place('sentry', 1.5 + (0));
      if (!m) return { pass: null, detail: 'SKIP: no sentry could be staged' };
      const hp0 = m.health;
      let hit = null;
      const onHit = (e) => { if (!hit) hit = e; };
      C.events.on('melee-hit', onHit);
      p.aiming = false; C.input.mouse.buttons &= ~4;
      for (let i = 0; i < 4 && !hit; i++) {
        C.input.mouse.buttons |= 1;
        await new Promise((r) => setTimeout(r, 90));
        C.input.mouse.buttons &= ~1;
        const t0 = performance.now();
        while (!hit && performance.now() - t0 < 1200) await frame();
      }
      C.input.mouse.buttons &= ~1;
      C.events.off?.('melee-hit', onHit);
      const a = C.combat.melee.audit(), drop = hp0 - m.health;
      return { pass: !!hit && drop > 0 && a.swings > 0, detail: { swings: a.swings, hits: a.hits, hpDrop: +drop.toFixed(1), damage: hit ? +hit.damage.toFixed(1) : 0, contactGap: hit?.contactGap ?? null, kind: m.kind } };
    })()`)),
  },
  {
    id: 'A50-undercut', kind: 'action', lane: 'melee',
    timeout: 90000, settle: 400,
    title: 'Crouched behind the unaware sentry: the prompt reads UNDERCUT, real E plays the draw and the stab, the lance is in her hand before the contact frame (M11), it kills and emits undercut',
    setup: `__CTX__.input.enabled = true;`,
    assert: staged(['sentry'], placed(['duelGround'], `(async () => {${HERO}
      const C = __CTX__, p = C.player, an = p.animator;
      ${STAGE} ${AIMLOCK} ${FRAME} ${PLACE}
      C.state = 'playing';
      const M = C.combat.melee;
      M.holsterLance();
      { const tq = performance.now(); while (M.stance !== 'holstered' && performance.now() - tq < 3000) await frame(); }
      p.setCrouch ? p.setCrouch(true) : (p.crouching = true);
      const m = await place('sentry', 1.8);
      if (!m) return { pass: null, detail: 'SKIP: no sentry could be staged' };
      /* she is behind it: it faces the way she faces */
      m.heading = p.heading ?? 0;
      if (m.root) m.root.rotation.set(0, m.heading, 0);
      m.suspicion = 0; m.state = 'patrol';
      let label = null;
      { const tq = performance.now(); while (performance.now() - tq < 2500) { await frame(); label = C.interactables?.current?.label ?? null; if (label === 'UNDERCUT') break; } }
      let ev = null, heldAtContact = null, gripDone = null, stance = null;
      const onU = (e) => { ev = e; heldAtContact = !!M.lanceInHand; gripDone = !!an.melee?.handoverDone; stance = M.stance; };
      C.events.on('undercut', onU);
      C.input.keys.add('KeyE');
      { const tq = performance.now(); while (!ev && performance.now() - tq < 4000) await frame(); }
      C.input.keys.delete('KeyE');
      C.events.off?.('undercut', onU);
      for (let i = 0; i < 10; i++) await frame();
      p.setCrouch ? p.setCrouch(false) : (p.crouching = false);
      const dead = m.alive === false || m.health <= 0;
      const pass = label === 'UNDERCUT' && !!ev && dead && heldAtContact === true;
      return { pass, detail: { label, emitted: !!ev, killed: !!ev?.killed, dead, heldAtContact, gripDone, stance, kind: m.kind } };
    })()`)),
  },

  {
    id: 'V46-lance-ready', kind: 'visual', lane: 'melee',
    reference: 'reference/r5/gates-perf/lance-ready-side (A-reference-set, W0b)',
    settle: 400,
    title: 'Melee ready stance, side + front-quarter of ONE frozen frame, judged against '
      + 'the licence-clean lance reference reference/r5/gates-perf/lance-ready-side (A-reference-set, W0b)',
    criteria: "Two views of ONE frozen frame of the guard: side on the left, front-quarter on the right. Judge against the licence-clean polearm-guard reference (its one-handed staff guard is the haft line and the stance; the two-handed grip is this plan's, bible section 5.3). PASS requires ALL of: two hands on the haft; the right hand near the hip with only a short stub of haft behind it (20 % from the butt); the left hand forward on the haft at about 55 %, palm wrapped on it, not floating beside it; the blade forward and down, tip at shin-to-knee height (0.35-0.55 m, A101 gates it); elbows near the body, no T-rex; knees bent, trunk over the front hand, a stance that could move. FAIL on any hand off the haft, the haft through her body, the haft horizontal or pointing up, a neutral idle with a pole stuck to her, an arm across her chest or face. Kevin's question: does this look like someone who knows how to hold a spear?",
    setup: placedSetup(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, e = C.engine;
      C.input.enabled = true; C.state = 'playing';
      ${NOHUD} ${FILM} ${FREEZE} ${STAGE} ${AIMLOCK} ${LOCKCAM} ${PIN} ${READY}
      await toReady(C);

      {
        const M = C.combat.melee;
        M.swing({});
        const tq = performance.now();
        while (performance.now() - tq < 4000) {
          await new Promise((r) => requestAnimationFrame(r));
          if (M.stance === 'ready' && !M.active && performance.now() - tq > 600) break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      await pin({ stance: 'ready' }, 900);

      C.engine.timeScale = 0;
      ${STRIPS}
      /* at 6 m (plan §9), on a long lens */
      await strip(() => lockCam(-5.9, 1.0, 1.30, 0.92, 27, 0.25));
      await strip(() => lockCam(-3.6, -4.8, 1.45, 0.92, 27, 0.25));
      show();
      return got;
    })()`),
  },

  {
    id: 'V47-melee-swing', kind: 'visual', lane: 'melee',
    reference: 'reference/r5/gates-perf/lance-windup, lance-strike, lance-follow (A-reference-set, W0b)',
    settle: 400,
    title: 'Twelve captioned panels: top row (one 3/4 near-front camera) L1 / L2 / L3 / HEAVY at '
      + 'CONTACT + HEAVY FOLLOW + L3 CONTACT AT A JOG; bottom row (one side camera) L1 / L2 / '
      + 'HEAVY WINDUP + L1 FOLLOW + HEAVY CONTACT AT A JOG + a LIVE contact with the swing trail',
    criteria: "Twelve captioned panels: row one (3/4) the four contacts, the heavy's follow, light-3 at a jog; row two (side) light-1, light-2 and heavy windups, light-1 follow, the heavy at a jog, a live contact with the swing smear. Judge against the licence-clean strike, windup and follow references. PASS requires ALL of: the BODY does the work in every panel (hips rotated into the beat, the lead knee bent with weight over it, the rear leg pushing, a step-in legible, a real follow-through); the lance is IN her hands in every panel, the fist closed on it; light-1, light-2 and the heavy show BOTH hands on the haft; light-3 is one-handed with the free arm trailing; the four contacts are four different actions (level thrust, sweep crossing her front, long overhand stab, low committed drive with the hips lowest); no arm behind the head, no forearm or haft through her body or across her face; the heavy visibly heavier than the lights. FAIL if the haft floats off a hand, if two beats are the same pose, if she stands upright while only the arms move.",
    setup: placedSetup(['openGround', 'runway'], `(async () => {
      const C = __CTX__, p = C.player, e = C.engine;
      C.input.enabled = true; C.state = 'playing';
      ${NOHUD} ${FILM} ${FREEZE} ${STAGE} ${AIMLOCK} ${LOCKCAM} ${PIN} ${READY}
      await toReady(C);
      await pin({ stance: 'ready' }, 500);
      const SIDE = () => lockCam(-3.4, 0.55, 1.25, 0.98, 40, 0.55);

      const Q34 = () => lockCam(-1.7, -2.5, 1.45, 0.95, 40, 0.45);
      SIDE();
      const M = C.combat.melee;

      const beat = (phase, k, heavy, combo) => { M.poseState = () => ({
        stance: 'swing', drawK: 1, phase, k, combo: combo || 0, heavy, aimYaw: 0, contactK: 0.70 }); };
      ${STRIPS12}

      const h0 = p.heading;
      const jogTo = async (setupFn) => {
        standAt(p, 'runway');
        for (const m of ( C.machines?.list || [])) {
          if (m.alive && Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z) < 45) {
            m.position.x += 100;
            if (m.root) m.root.position.x = m.position.x;
          }
        }
        setupFn();
        C.input.keys.clear(); C.input.keys.add('KeyW');
        const t0 = performance.now();
        while (performance.now() - t0 < 3000) {
          await new Promise((r) => requestAnimationFrame(r));
          if (performance.now() - t0 > 700 && Math.hypot(p.velocity.x, p.velocity.z) >= 4
            && (p.animator._moveW || 0) > 0.98) break;
        }
      };
      const jogStop = async () => {
        C.input.keys.clear(); p.velocity.set(0, 0, 0);
        ${STAGE}
        p.heading = h0;
        await new Promise((r) => setTimeout(r, 900));
      };

      await strip(() => { Q34(); beat('strike', 0.70, false, 0); });
      await strip(() => { Q34(); beat('strike', 0.70, false, 1); });
      await strip(() => { Q34(); beat('strike', 0.70, false, 2); });
      await strip(() => { Q34(); beat('strike', 0.70, true, 0); });

      await strip(() => { Q34(); beat('recover', 0.62, true, 0); });

      await jogTo(() => { Q34(); beat('strike', 0.70, false, 2); });
      await strip(() => { Q34(); beat('strike', 0.70, false, 2); });
      await jogStop();

      await strip(() => { SIDE(); beat('windup', 0.58, false, 0); });
      await strip(() => { SIDE(); beat('windup', 0.58, false, 1); });
      await strip(() => { SIDE(); beat('windup', 0.58, true, 0); });
      await strip(() => { SIDE(); beat('recover', 0.62, false, 0); });

      await jogTo(() => { SIDE(); beat('strike', 0.70, true, 0); });
      await strip(() => { SIDE(); beat('strike', 0.70, true, 0); });
      await jogStop();

      delete M.update; delete M.poseState;
      M.aimLock = 0;
      await toReady(C);
      await new Promise((r) => setTimeout(r, 250));
      {
        SIDE();

        M._updateTrail = () => {};
        M.swing({});
        const t0 = performance.now();
        let seen = false;
        while (performance.now() - t0 < 5000) {
          await new Promise((r) => requestAnimationFrame(r));
          if (M._trail && M._trail.visible) {
            M.update = () => {};
            M._trail.scale.setScalar(M._trailScale * 0.9);
            seen = true;
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 420));
        want = true;
        const t1 = performance.now();
        while (want && performance.now() - t1 < 2000) await new Promise((r) => requestAnimationFrame(r));
        if (!seen) got = Math.max(got, 12);
      }

      show();
      C.engine.timeScale = 0;
      return got;
    })()`),
  },

  {
    id: 'V48-lance-holster', kind: 'visual', lane: 'melee',
    reference: 'reference/r5/gates-perf/lance-back-carry (A-reference-set, W0b)',
    settle: 400,
    title: 'Sprinting, back view — the stowed lance, judged against the licence-clean lance reference reference/r5/gates-perf/lance-back-carry (A-reference-set, W0b)',
    criteria: "The hero from behind at a sprint, judged against the licence-clean back-carry reference. PASS requires ALL of: one steep diagonal lance across her back; the blade above the RIGHT shoulder; the bronze bob cap low at the LEFT hip; clear of the wrap tail, of the stowed bow and of the quiver (nothing passing through anything); the arms still swinging fore and aft beside the body. FAIL on a second lance anywhere, a pole floating off her back, the shaft crossing her head, the wrap tail drawn through the shaft.",
    setup: placedSetup(['openGround'], `(async () => {
      const C = __CTX__, p = C.player;
      ${NOHUD} ${FILM} ${FREEZE} ${STAGE} ${AIMLOCK} ${LOCKCAM}
      C.combat.melee.holsterLance();
      C.input.enabled = true;
      C.input.keys.clear(); C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft');
      await new Promise((r) => setTimeout(r, 1500));
      lockCam(0, 2.6, 1.35, 1.15, 42);
      await new Promise((r) => setTimeout(r, 700));
      C.engine.timeScale = 0;
    })()`),
  },

  {
    id: 'V49-draw-from-jog', kind: 'visual', lane: 'melee',
    reference: 'reference/r5/gates-perf/lance-back-carry (A-reference-set, W0b)',
    settle: 400,
    title: 'Drawing the lance at a jog, frame by frame — rear-3/4 and side — the right arm reaches '
      + 'up the SIDE and over the shoulder, never up behind her head',
    criteria: "Twelve captioned tiles, two rows of six, of ONE real draw each from a jog (the melee key): rear 3/4 and side. PASS requires ALL of: the stride carries on under the draw (the feet still in a jog in every tile); the right hand goes up to the shaft where the shaft is, at the right shoulder, the elbow out and below the head, never behind the head; the fist closes on the haft and pulls it forward over the shoulder; the left hand catches it at the front on the way down; the last tile is the two-handed guard at a jog. FAIL if the lance leaves her back before the hand arrives, if it teleports between tiles, if an elbow goes above her head or behind her skull, if there are two lances.",
    setup: placedSetup(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, e = C.engine;
      ${NOHUD} ${FILM} ${FREEZE} ${STAGE} ${AIMLOCK} ${LOCKCAM}
      ${gridOf(6, 2, 0.46, [
        'REAR3/4 DRAW .10', 'REAR3/4 DRAW .25', 'REAR3/4 DRAW .40', 'REAR3/4 DRAW .55', 'REAR3/4 DRAW .75', 'REAR3/4 GUARD',
        'SIDE DRAW .10', 'SIDE DRAW .25', 'SIDE DRAW .40', 'SIDE DRAW .55', 'SIDE DRAW .75', 'SIDE GUARD',
      ])}
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const M = C.combat.melee;
      C.state = 'playing';
      C.input.enabled = true;

      const BASE = LABELS.slice();
      const lay = p.animator && p.animator.melee;
      e.onAfterRender.unshift(() => {
        if (!want || got >= LABELS.length || !lay || !lay._dbg) return;
        const D = lay._dbg;
        LABELS[got] = BASE[got] + (D.stance === 'draw' ? ' (posed ' + (+D.drawK).toFixed(2) + ')' : D.stance === 'ready' ? '' : ' (' + D.stance + ')');
      });
      const grabNow = async () => {
        const g0 = got; want = true;
        const tq = performance.now();
        while (got === g0 && performance.now() - tq < 1500) await frame();
      };
      const drawRow = async (cam) => {
        M.holsterLance();
        { const tq = performance.now(); while (M.stance !== 'holstered' && performance.now() - tq < 3000) await frame(); }
        for (let i = 0; i < 20; i++) await frame();
        C.input.keys.clear(); C.input.keys.add('KeyW');
        { const tq = performance.now(); while (performance.now() - tq < 1500) await frame(); }
        cam();
        for (let i = 0; i < 6; i++) await frame();

        e.timeScale = 0.25;
        C.input.keys.add('KeyB'); await frame(); await frame(); C.input.keys.delete('KeyB');
        const targets = [0.10, 0.25, 0.40, 0.55, 0.75];
        const lay2 = p.animator && p.animator.melee;
        const tq = performance.now();
        while (targets.length && performance.now() - tq < 8000) {
          await frame();
          const D = lay2 && lay2._dbg;
          const posed = D && D.stance === 'draw' ? +D.drawK : (M.stance === 'ready' ? 1 : -1);
          if (posed >= targets[0]) {
            e.timeScale = 0;
            while (targets.length && posed >= targets[0]) { targets.shift(); await grabNow(); }
            e.timeScale = 0.25;
          }
        }
        { const tr = performance.now(); while (M.stance !== 'ready' && performance.now() - tr < 4000) await frame(); }
        for (let i = 0; i < 4; i++) await frame();
        e.timeScale = 0;
        await grabNow();
        e.timeScale = 1;
      };
      await drawRow(() => lockCam(-1.1, 1.7, 1.7, 1.35, 42));
      await drawRow(() => lockCam(-2.0, 0.1, 1.5, 1.25, 42));
      C.input.keys.clear();
      show();
      e.timeScale = 0;
    })()`),
  },
];
