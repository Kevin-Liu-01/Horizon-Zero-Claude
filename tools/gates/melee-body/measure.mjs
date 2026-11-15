/**
 * M1.3d (hero-anim) — the lance bars, measured on the posed skeleton and the prop's own world matrix. One
 * function, used by the Node bench (`bench.mjs`) and, as its source text, by the page rows
 * (`tools/gates/melee-body.mjs`), so both grade the same thing. It must stay self-contained: no imports, no
 * closure over this module (the page receives `String(buildMeleeMeasure)`).
 *
 * What is read, every sampled step (character space: +X her left, +Y up, +Z forward):
 *  - HIP YAW: the line between the two hip joints (thigh_l, thigh_r heads, rigid on the pelvis);
 *  - SHOULDER YAW: the line between the two clavicle roots (rigid on the top spine bone, so it is the thorax's
 *    turn and not the shoulder girdle's shrug); the upper-arm heads' line is reported beside it;
 *  - each PALM against the haft: the palm point is the grip crease, read off the LIVE hand bones every step
 *    (the knuckle-line centre, index_01 to pinky_01, backed 0.015 m toward the wrist along wrist -> middle_01),
 *    and its distance to the haft SEGMENT (butt to tip, from the prop's own matrix). The metacarpal centre
 *    (wrist to knuckle-line midpoint) is reported too;
 *  - where on the haft each palm sits (fraction from the butt) against the prop's two sockets (grip, grip2);
 *  - the tip, the grip and the pelvis, for the beat's shape.
 *
 * The bars (BUILD M1.3d):
 *  1. heavy: hip rotation leads the shoulders by >= 0.040 s. Each yaw is followed from its most-wound value in
 *     the windup to its value at the contact; the lead is the time the shoulders cross half of their own
 *     unwinding minus the time the hips cross half of theirs (sub-step, interpolated). The times of peak
 *     unwinding rate are reported beside it;
 *  2. both palms within 0.05 m of the haft AT THEIR SOCKETS (BIBLE: "weapon gripped at its sockets"): the right
 *     palm within 0.05 m of the prop's `grip` mark and the left palm within 0.05 m of its `grip2` mark (which also
 *     puts each within 0.05 m of the shaft; the perpendicular palm-to-haft distance is reported beside it), at
 *     the windup, the contact and the follow-through (the worst step
 *     of each window: windup = the whole windup phase; contact = the strike phase; follow-through = the
 *     recover's contact -> follow leg, its first 62 %) — heavy and Undercut, and the guard;
 *  3. guard: both palms on (as 2), the blade forward of the grip and down, the tip 0.35-0.70 m off the ground;
 *  4. Undercut: a low two-handed thrust — both palms on through all three windows; the tip at contact below
 *     the heavy's and under 1.0 m; the haft within 20 deg of level at the contact; the blade travels ALONG the
 *     haft into the contact (the tip's last 0.1 s of travel within 25 deg of the haft's axis).
 */
export const BARS = { hipLead: 0.040, palm: 0.05, guardTipLo: 0.35, guardTipHi: 0.70, ucTipMax: 1.0, ucLevelDeg: 20, ucThrustDeg: 25 };

export function buildMeleeMeasure(R, THREE) {
  const { an, model, melee } = R;
  const V = () => new THREE.Vector3();
  const lay = an.melee;
  const b = an.b;
  const kn = lay._knuckle, knL = lay._knuckleL;
  const midR = an.bones[an._findName('middle_01_r_')], midL = an.bones[an._findName('middle_01_l_')];
  const clavL = b.clavL?.bone, clavR = b.clavR?.bone;
  const thL = b.thighL.bone, thR = b.thighR.bone;
  const uaL = b.upArmL.bone, uaR = b.upArmR.bone;
  const inv = new THREE.Matrix4();
  const t1 = V(), t2 = V(), t3 = V(), t4 = V(), t5 = V(), butt = V(), tip = V(), dir = V();
  const CH = (bone, out) => out.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(inv);
  const yawOf = (a, c) => {
    // the line from her right joint to her left (+X): its turn about +Y, 0 when square to her facing
    return Math.atan2(-(a.z - c.z), a.x - c.x);
  };
  const segDist = (A, Bp, P) => {
    const ab = t5.subVectors(Bp, A); const l2 = ab.lengthSq();
    let s = l2 > 1e-12 ? ((P.x - A.x) * ab.x + (P.y - A.y) * ab.y + (P.z - A.z) * ab.z) / l2 : 0;
    s = Math.max(0, Math.min(1, s));
    const dx = A.x + ab.x * s - P.x, dy = A.y + ab.y * s - P.y, dz = A.z + ab.z * s - P.z;
    return [Math.sqrt(dx * dx + dy * dy + dz * dz), s];
  };
  // the palm (grip crease) and the metacarpal centre of one hand, char space
  const palm = (hand, k, mid, outP, outM) => {
    CH(k.i, t1); CH(k.p, t2); t1.add(t2).multiplyScalar(0.5);      // knuckle-line centre
    CH(hand, t3); CH(mid, t4);                                      // wrist, middle_01
    t4.sub(t3).normalize();
    outP.copy(t1).addScaledVector(t4, -0.015);
    outM.copy(t1).add(t3).multiplyScalar(0.5);
  };
  const pR = V(), pL = V(), mR = V(), mL = V();
  let S = [];
  const api = {
    BARS: { hipLead: 0.040, palm: 0.05, guardTipLo: 0.35, guardTipHi: 0.70, ucTipMax: 1.0, ucLevelDeg: 20, ucThrustDeg: 25 },
    begin() { S = []; },
    /** One step: `T` seconds, the melee state (phase, k, beat, stance). After the animator and combat. */
    sample(T) {
      model.updateMatrixWorld(true);
      inv.copy(model.matrixWorld).invert();
      const g = lay.lance;
      if (!g) return;
      g.updateWorldMatrix(true, false);
      butt.set(0, 0, 0).applyMatrix4(g.matrixWorld).applyMatrix4(inv);
      tip.set(0, 0, lay._localLen).applyMatrix4(g.matrixWorld).applyMatrix4(inv);
      dir.subVectors(tip, butt);
      const L = dir.length(); dir.multiplyScalar(1 / (L || 1));
      palm(b.handR.bone, kn, midR, pR, mR);
      palm(b.handL.bone, knL, midL, pL, mL);
      const [dR, sR] = segDist(butt, tip, pR);
      const [dL, sL] = segDist(butt, tip, pL);
      const [dmR] = segDist(butt, tip, mR);
      const [dmL] = segDist(butt, tip, mL);
      // each palm to ITS socket on the haft (the prop's marks: grip for the right hand, grip2 for the left)
      const gk = R.marks ? R.marks() : { grip: 0.20, grip2: 0.55 };
      t1.copy(butt).addScaledVector(dir, gk.grip * L);
      const kR = t1.distanceTo(pR);
      t1.copy(butt).addScaledVector(dir, gk.grip2 * L);
      const kL = t1.distanceTo(pL);
      const hip = yawOf(CH(thL, t1), CH(thR, t2));
      const sh = clavL && clavR ? yawOf(CH(clavL, t1), CH(clavR, t2)) : NaN;
      const ua = yawOf(CH(uaL, t1), CH(uaR, t2));
      const pel = CH(b.pelvis.bone, V());
      const st = melee.poseState ? { stance: melee.stance, phase: melee.phase, heavy: melee.heavy, beat: lay._dbg.beat } : {};
      S.push({
        T, stance: st.stance, phase: st.phase, beat: st.beat, k: melee._phaseEnd > 0 ? melee._t / melee._phaseEnd : 0,
        hip, sh, ua, dR, dL, dmR, dmL, kR, kL, sR, sL, len: L,
        tip: [tip.x, tip.y, tip.z], butt: [butt.x, butt.y, butt.z], dir: [dir.x, dir.y, dir.z], pel: [pel.x, pel.y, pel.z],
        lhW: lay._lhOnW || 0,
      });
    },
    samples() { return S; },
    /**
     * Grade one swing (the samples of one beat from its windup to the end of its recover). `contactT` is the
     * time of the contact (the melee-hit, or the first step at the strike's hold).
     */
    swing(beatId, contactT) {
      const sw = S.filter((s) => s.stance === 'swing' && s.beat === beatId);
      if (!sw.length) return null;
      const win = { windup: [], contact: [], follow: [] };
      for (const s of sw) {
        if (s.phase === 'windup') win.windup.push(s);
        else if (s.phase === 'strike') win.contact.push(s);
        else if (s.phase === 'recover' && s.k <= 0.62) win.follow.push(s);
      }
      const worst = (arr, key) => arr.reduce((m, s) => Math.max(m, s[key]), 0);
      const palms = {};
      for (const w of Object.keys(win)) palms[w] = { n: win[w].length, right: worst(win[w], 'dR'), left: worst(win[w], 'dL'), rightSocket: worst(win[w], 'kR'), leftSocket: worst(win[w], 'kL'), rightMeta: worst(win[w], 'dmR'), leftMeta: worst(win[w], 'dmL'), leftOnMin: win[w].reduce((m, s) => Math.min(m, s.lhW), 1), sR: win[w].length ? win[w][win[w].length - 1].sR : null, sL: win[w].length ? win[w][win[w].length - 1].sL : null };
      // the contact step: the one nearest contactT (or the last strike step)
      let c = win.contact[win.contact.length - 1] || sw[sw.length - 1];
      if (contactT != null) { let best = 1e9; for (const s of sw) { const d = Math.abs(s.T - contactT); if (d < best) { best = d; c = s; } } }
      // the lead: each yaw from its most-wound windup value to its contact value
      const lead = (key) => {
        const wu = sw.filter((s) => s.T <= c.T);
        const yc = c[key];
        let ext = wu[0], far = -1;
        for (const s of wu) { const d = Math.abs(s[key] - yc); if (s.phase === 'windup' && d > far) { far = d; ext = s; } }
        const y0 = ext[key], half = (y0 + yc) / 2, sg = Math.sign(yc - y0) || 1;
        let tHalf = null, vMax = 0, tV = null;
        for (let i = 1; i < wu.length; i++) {
          const a = wu[i - 1], bb = wu[i];
          if (a.T < ext.T) continue;
          const va = (a[key] - half) * sg, vb = (bb[key] - half) * sg;
          if (tHalf == null && va < 0 && vb >= 0) tHalf = a.T + (bb.T - a.T) * (-va / (vb - va));
          const v = ((bb[key] - a[key]) * sg) / (bb.T - a.T);
          if (v > vMax) { vMax = v; tV = (a.T + bb.T) / 2; }
        }
        return { from: y0, to: yc, travel: (yc - y0) * sg, tWound: ext.T, tHalf, tPeakRate: tV, peakRate: vMax };
      };
      const hip = lead('hip'), sh = lead('sh'), ua = lead('ua');
      // the thrust: the tip's travel from the chamber (the step whose tip is furthest back along the contact's haft
      // axis, before the contact) to the contact, against that axis
      let thrustDeg = null, thrustLen = 0;
      {
        let ch = null, best = 1e9;
        for (const s of sw) {
          if (s.T > c.T) break;
          const a = s.tip[0] * c.dir[0] + s.tip[1] * c.dir[1] + s.tip[2] * c.dir[2];
          if (a < best) { best = a; ch = s; }
        }
        if (ch && ch !== c) {
          const m = [c.tip[0] - ch.tip[0], c.tip[1] - ch.tip[1], c.tip[2] - ch.tip[2]], ml = Math.hypot(...m) || 1;
          thrustLen = ml;
          thrustDeg = Math.acos(Math.max(-1, Math.min(1, (m[0] * c.dir[0] + m[1] * c.dir[1] + m[2] * c.dir[2]) / ml))) * 180 / Math.PI;
        }
      }
      return {
        beat: beatId, steps: sw.length, contactT: c.T, palms,
        hip, sh, ua,
        leadHalf: hip.tHalf != null && sh.tHalf != null ? sh.tHalf - hip.tHalf : null,
        leadPeak: hip.tPeakRate != null && sh.tPeakRate != null ? sh.tPeakRate - hip.tPeakRate : null,
        leadHalfUpperArm: hip.tHalf != null && ua.tHalf != null ? ua.tHalf - hip.tHalf : null,
        contact: { tip: c.tip, pel: c.pel, levelDeg: Math.asin(Math.max(-1, Math.min(1, c.dir[1]))) * 180 / Math.PI, thrustDeg, thrustLen, tipY: c.tip[1] },
      };
    },
    /** The guard, over the ready steps sampled. */
    guard() {
      const g = S.filter((s) => s.stance === 'ready');
      if (!g.length) return null;
      const last = g[g.length - 1];
      return {
        steps: g.length, right: g.reduce((m, s) => Math.max(m, s.dR), 0), left: g.reduce((m, s) => Math.max(m, s.dL), 0),
        rightSocket: g.reduce((m, s) => Math.max(m, s.kR), 0), leftSocket: g.reduce((m, s) => Math.max(m, s.kL), 0),
        leftOnMin: g.reduce((m, s) => Math.min(m, s.lhW), 1),
        tipY: last.tip[1], tipZ: last.tip[2], buttZ: last.butt[2], dir: last.dir, sR: last.sR, sL: last.sL,
        bladeAhead: last.tip[2] - (last.butt[2] + last.dir[2] * 0.2 * last.len),
      };
    },
  };
  return api;
}
