/**
 * M1.3b (hero-anim) — the aim rig's bars, measured on the posed skeleton and the CPU-skinned body. One
 * function, used by the Node bench (`bench.mjs`) and, as its source text, by the page rows
 * (`tools/gates/aim-rig.mjs`), so both grade the same thing. It must stay self-contained: no imports, no
 * closure over this module (the page receives `String(buildMeasure)`).
 *
 * The bars (BUILD M1.3b), per cell of the stance x move x yaw matrix:
 *  1. at full draw the string hand's index knuckle (index_01_r's joint) within 0.03 m of the jaw-corner
 *     anchor (a point fixed to the head bone on the skin at the right corner of the jaw);
 *  2. every hand vertex (both hands) outside the wrap volume: the star-shaped region from the skull centre
 *     out to the head wrap's outer surface, in every direction the wrap covers (its Head-skinned shell; the
 *     sash and the knot tail are cloth chains with their own colliders, A-wrap-clear);
 *  3. at full draw the draw elbow level (aim frame: -0.03 to +0.05 m from the shoulder's height) and back
 *     (at least 0.05 m behind the hand along the arrow);
 *  4. at full draw the bow arm >= 0.04 m clear of the chest (torso-skinned vertices to the arm's axis, less
 *     its radius: 0.045 m upper arm, 0.035 m forearm, as A-draw-elbow-level measured it);
 *  5. the hand on the string: the nocked arrow within 0.01 m of the string's nocking point, and that point
 *     within 0.03 m of the string fingers' hook (index_02_r and middle_02_r, midway) at full draw;
 *  6. 0 frames with a hand or forearm behind the head, on every step of the aim, the loose and the way out:
 *     wrist, index knuckle, middle fingertip and three points down each forearm, BEHIND the back of the skull
 *     and within the head's half-width of its mid-plane (from the shoulders up), or over the crown;
 *  7. an arrow loosed only from a raised, drawn bow: at every loose the aim weight >= 0.95 and the rendered
 *     draw >= 0.5.
 */
export const BARS = { knuckleJaw: 0.03, elbowLo: -0.03, elbowHi: 0.05, elbowBack: 0.05, bowChest: 0.04, arrowNock: 0.01, handNock: 0.03, looseAim: 0.95, looseDraw: 0.5 };

export function buildMeasure(R, THREE) {
  const { an, model } = R;
  const V = () => new THREE.Vector3();
  const BARS_ = { knuckleJaw: 0.03, elbowLo: -0.03, elbowHi: 0.05, elbowBack: 0.05, bowChest: 0.04, arrowNock: 0.01, handNock: 0.03, looseAim: 0.95, looseDraw: 0.5 };
  model.updateMatrixWorld(true);
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const B = (n) => bones[n] || null;
  let skin = null, wrap = null, outfit = null;
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (/Brea_Skin|_hidemask/.test(o.name) || o.geometry.getAttribute('_hidemask')) skin = skin || o;
    if (/HairWrap/.test(o.name)) wrap = o;
    if (/outfit/.test(o.userData?.heroPart || '')) outfit = outfit || o;
  });
  if (!skin) model.traverse((o) => { if (!skin && o.isSkinnedMesh && /Skin/.test(o.name)) skin = o; });
  const CH = (w, out) => model.worldToLocal(out.copy(w));
  const WP = (b, out) => b.getWorldPosition(out);
  const CP = (b, out) => CH(WP(b, out), out);
  const headB = an.b.head.bone;
  // the head's frame, character space: position and live-vs-bind rotation (the animator's own convention)
  const hq = new THREE.Quaternion(), hqi = new THREE.Quaternion(), hp = V();
  const headFrame = () => {
    an._charOf(headB, hp);
    an._liveW(headB, hq); hq.multiply(an.b.head.invW); hqi.copy(hq).invert();
  };
  const toHead = (pChar, out) => out.subVectors(pChar, hp).applyQuaternion(hqi);   // head bind frame, origin at the bone
  // bone-weighted vertex lists, measured once
  const weighted = (mesh, re, minW) => {
    const out = [];
    if (!mesh) return out;
    const bn = mesh.skeleton.bones.map((x) => x.name), si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (re.test(bn[si.getComponent(i, k)] || '')) w += sw.getComponent(i, k);
      if (w >= minW) out.push(i);
    }
    return out;
  };
  const tmp = V(), tmp2 = V(), tmp3 = V();
  // --- the wrap volume, in the head's bind frame about the skull centre: the outer radius per direction bin
  headFrame();
  const skullC = an.T.headOff.clone();                     // skull centre, head bind frame (from the bone)
  const AZ = 36, EL = 18;
  const wrapR = new Float32Array(AZ * EL);                  // 0 = the wrap does not cover that direction
  const bin = (h) => {
    const x = h.x - skullC.x, y = h.y - skullC.y, z = h.z - skullC.z;
    const r = Math.hypot(x, y, z) || 1e-6;
    const az = Math.atan2(x, z), el = Math.asin(Math.max(-1, Math.min(1, y / r)));
    const ia = Math.min(AZ - 1, Math.floor((az + Math.PI) / (2 * Math.PI) * AZ));
    const ie = Math.min(EL - 1, Math.max(0, Math.floor((el + Math.PI / 2) / Math.PI * EL)));
    return [ia * EL + ie, r];
  };
  const wrapIdx = weighted(wrap, /^Head$/, 0.5);
  for (const i of wrapIdx) {
    wrap.getVertexPosition(i, tmp); wrap.localToWorld(tmp); CH(tmp, tmp); toHead(tmp, tmp2);
    const [k, r] = bin(tmp2);
    if (r > wrapR[k]) wrapR[k] = r;
  }
  // close one-bin holes in the shell (a covered direction's neighbours on both sides covered)
  const wrapR2 = wrapR.slice();
  for (let a = 0; a < AZ; a++) for (let e = 1; e < EL - 1; e++) {
    const k = a * EL + e;
    if (wrapR[k] > 0) continue;
    const l = wrapR[((a + AZ - 1) % AZ) * EL + e], r = wrapR[((a + 1) % AZ) * EL + e], u = wrapR[a * EL + e + 1], d = wrapR[a * EL + e - 1];
    if ((l > 0 && r > 0) || (u > 0 && d > 0)) wrapR2[k] = Math.max(l, r, u, d);
  }
  const inWrap = (pChar) => { toHead(pChar, tmp3); const [k, r] = bin(tmp3); return wrapR2[k] > 0 && r < wrapR2[k]; };
  // --- hands (both), torso
  const handIdx = weighted(skin, /^(hand|index|middle|ring|pinky|thumb)_.*[lr]$/, 0.5);
  const armRe = /clavicle|upperarm|lowerarm|hand|index|middle|ring|pinky|thumb/i;
  const chestMesh = outfit || skin;
  const chestIdx = [];
  {
    const pel = V(), nk = V();
    CP(an.b.pelvis.bone, pel); CP(an.b.neck1?.bone || headB, nk);
    const bn = chestMesh.skeleton.bones.map((x) => x.name), si = chestMesh.geometry.attributes.skinIndex, sw = chestMesh.geometry.attributes.skinWeight;
    for (let i = 0; i < chestMesh.geometry.attributes.position.count; i += 2) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (armRe.test(bn[si.getComponent(i, k)] || '')) w += sw.getComponent(i, k);
      if (w >= 0.1) continue;
      chestMesh.getVertexPosition(i, tmp); chestMesh.localToWorld(tmp); CH(tmp, tmp);
      if (tmp.y > pel.y + 0.18 && tmp.y < nk.y - 0.02 && Math.abs(tmp.x) < 0.2) chestIdx.push(i);
    }
  }
  const segD = (P, A, Bp) => { tmp2.subVectors(Bp, A); tmp3.subVectors(P, A); const t = Math.max(0, Math.min(1, tmp3.dot(tmp2) / (tmp2.lengthSq() || 1e-9))); return tmp3.addScaledVector(tmp2, -t).length(); };
  // the jaw-corner anchor: the rig's own when it has one, else the same head-frame point
  const JAW = an.T.cRig?.jaw ? new THREE.Vector3().fromArray(an.T.cRig.jaw) : new THREE.Vector3(-0.048, 0.002, -0.012);
  const jawChar = (out) => { headFrame(); return out.copy(JAW).applyQuaternion(hq).add(hp); };
  // behind the head: head-ellipsoid units about the skull centre
  const HR = an.T.headR;
  const unit = (pChar, out) => { toHead(pChar, out).sub(skullC); out.x /= HR.x; out.y /= HR.y; out.z /= HR.z; return out; };
  /** `hand`: a hand point (the skull, the nape below it, the crown); else a forearm point (the skull and the crown) */
  const behind = (pChar, hand) => {
    const u = unit(pChar, tmp3);
    if (Math.abs(u.x) < 1 && u.z > -1.4 && u.z < 0.8 && u.y > 1) return 'crown';
    if (u.z < -1 && Math.abs(u.x) < 1 && u.y >= -1) return 'skull';
    if (hand && u.z < -1 && u.z > -2.5 && Math.abs(u.x) < 1 && u.y > -2.4) return 'nape';
    return null;
  };
  const side = (s) => ({
    sh: s === 'r' ? an.b.upArmR.bone : an.b.upArmL.bone, el: s === 'r' ? an.b.loArmR.bone : an.b.loArmL.bone, wr: s === 'r' ? an.b.handR.bone : an.b.handL.bone,
    kn: B('index_01_' + s), tip: B('middle_04_leaf_' + s) || B('middle_03_' + s), i2: B('index_02_' + s), m2: B('middle_02_' + s),
  });
  const SR = side('r'), SL = side('l');
  const P = { s: V(), e: V(), w: V(), k: V(), f: V(), a: V(), b: V(), j: V(), n: V(), h: V(), q: V() };
  let acc = null;
  const begin = () => {
    acc = { frames: 0, full: 0, knuckleJaw: 0, elbowH: [9, -9], elbowBack: 9, bowChest: 9, arrowNock: 0, handNock: 0,
      wrapIn: 0, wrapInFull: 0, behind: 0, behindAt: null, looses: [],
      kept: { elbowCharMax: -9, wristNockFull: 0, wristNockRamp: 0, headClearMin: 9, handHeadUnitMin: 9, quiverMin: 9, looseRear: 0 }, looseFrom: null, looseT0: null, verifyFails0: an.debugAimRig?.()?.verifyFails ?? 0, aimSteps: 0 };
  };
  const sample = (st) => {
    acc.frames++;
    const aimW = an._aimW * (1 - (an._dodgeW || 0));
    const drawS = an._drawS;
    const live = aimW > 0.005 || (an._looseT ?? 9) < 1;
    if (!live) return;
    acc.aimSteps++;
    headFrame();                                    // the head as posed this step (every head-frame read below)
    // 6: behind the head, both arms
    for (const S of [SR, SL]) {
      CP(S.el, P.e); CP(S.wr, P.w);
      const pts = [[P.w, 1]];
      if (S.kn) pts.push([CP(S.kn, P.k), 1]);
      if (S.tip) pts.push([CP(S.tip, P.f), 1]);
      for (const t of [0.25, 0.5, 0.75]) pts.push([P.a.copy(P.e).lerp(P.w, t).clone(), 0]);
      for (const [q, h] of pts) { const why = behind(q, h); if (why) { acc.behind++; if (!acc.behindAt) { const u = unit(q, V()); acc.behindAt = { T: +st.T.toFixed(3), why, side: S === SR ? 'r' : 'l', pt: h ? 'hand' : 'forearm', u: [u.x, u.y, u.z].map((x) => +x.toFixed(2)), aimW: +aimW.toFixed(2), drawS: +drawS.toFixed(2) }; } break; } }
    }
    // 2: hand vertices outside the wrap volume
    let nIn = 0;
    for (const i of handIdx) { skin.getVertexPosition(i, tmp); skin.localToWorld(tmp); CH(tmp, tmp); if (inWrap(tmp)) { nIn++; if (!acc.wrapAt) { const u = unit(tmp, V()); acc.wrapAt = { T: +st.T.toFixed(3), side: tmp.x < hp.x ? 'r' : 'l', u: [u.x, u.y, u.z].map((x) => +x.toFixed(2)), aimW: +aimW.toFixed(2), drawS: +drawS.toFixed(2) }; } } }
    acc.wrapIn += nIn;
    // the kept rows' own reads (A16, A17, A32), report-only
    {
      const K = acc.kept, A = an.debugArm?.('r');
      if (A) {
        if (st.T < 0.75) K.quiverMin = Math.min(K.quiverMin, A.handToQuiver);
        if (acc.looseT0 != null && st.T - acc.looseT0 <= 0.26) K.looseRear = Math.max(K.looseRear, acc.looseFrom - A.hand.z);
      }
      const bow = R.combat?.bow;
      if (bow?.getNockWorld && st.aiming) {
        const ds = st.draw;
        bow.getNockWorld(ds, P.b); CH(P.b, P.b); CP(SR.wr, P.w);
        const dn = P.b.distanceTo(P.w);
        if (ds > 0.05 && ds < 0.9) K.wristNockRamp = Math.max(K.wristNockRamp, dn);
        if (ds >= 0.9 && A) { K.wristNockFull = Math.max(K.wristNockFull, dn); K.elbowCharMax = Math.max(K.elbowCharMax, A.elbowAboveShoulder); K.headClearMin = Math.min(K.headClearMin, A.headClear); K.handHeadUnitMin = Math.min(K.handHeadUnitMin, A.handHeadUnit); }
      }
    }
    const full = st.aiming && aimW >= 0.98 && drawS >= 0.99 && (an._looseT ?? 9) >= 1;
    if (!full) return;
    acc.full++;
    acc.wrapInFull += nIn;
    // 1: the knuckle on the jaw-corner anchor
    CP(SR.kn, P.k); jawChar(P.j);
    { const kj = P.k.distanceTo(P.j); if (kj > acc.knuckleJaw) { acc.knuckleJaw = kj; acc.knuckleAt = +st.T.toFixed(3); } }
    // 3: the elbow, aim frame
    const A = an.debugAimRig?.() || null;
    const d = A?.d ? P.n.fromArray(A.d).normalize() : (() => { const D = an._aimDbg?.d; return P.n.copy(D).normalize(); })();
    const up = P.q.set(0, 1, 0).addScaledVector(d, -d.y).normalize();
    CP(SR.sh, P.s); CP(SR.el, P.e); CP(SR.wr, P.w);
    const eh = P.a.subVectors(P.e, P.s).dot(up);
    acc.elbowH[0] = Math.min(acc.elbowH[0], eh); acc.elbowH[1] = Math.max(acc.elbowH[1], eh);
    acc.elbowBack = Math.min(acc.elbowBack, P.a.subVectors(P.w, P.e).dot(d));
    // 4: the bow arm off the chest
    CP(SL.sh, P.s); CP(SL.el, P.e); CP(SL.wr, P.w);
    const mid = P.a.copy(P.s).lerp(P.e, 0.5);
    let chest = 9;
    for (const i of chestIdx) {
      chestMesh.getVertexPosition(i, tmp); chestMesh.localToWorld(tmp); CH(tmp, tmp);
      chest = Math.min(chest, segD(tmp, mid, P.e) - 0.045, segD(tmp, P.e, P.w) - 0.035);
    }
    acc.bowChest = Math.min(acc.bowChest, chest);
    // 5: the hand on the string
    const bow = R.combat?.bow;
    if (bow?.getNockWorld) {
      bow.getNockWorld(1, P.b); CH(P.b, P.b);
      CP(SR.i2, P.h); CP(SR.m2, P.a); P.h.lerp(P.a, 0.5);         // the string fingers' first joints
      acc.handNock = Math.max(acc.handNock, P.b.distanceTo(P.h));
      const g = bow.nockArrow?.group;
      if (g && g.visible) { g.getWorldPosition(P.a); CH(P.a, P.a); acc.arrowNock = Math.max(acc.arrowNock, P.a.distanceTo(P.b)); }
    }
  };
  const loose = (T) => { if (acc.looseT0 == null && T != null) { acc.looseT0 = T; acc.looseFrom = an.debugArm?.('r')?.hand?.z ?? 0; } acc.looses.push({ aimW: +(an._aimW * (1 - (an._dodgeW || 0))).toFixed(3), drawS: +an._drawS.toFixed(3) }); };
  const end = () => {
    const r = { ...acc };
    r.verifyFails = (an.debugAimRig?.()?.verifyFails ?? 0) - acc.verifyFails0;
    r.fails = [];
    if (!r.full) r.fails.push('no full-draw frame');
    if (r.knuckleJaw > BARS_.knuckleJaw) r.fails.push(`knuckle ${r.knuckleJaw.toFixed(3)} m off the jaw (at ${r.knuckleAt} s)`);
    if (r.wrapIn > 0) r.fails.push(`${r.wrapIn} hand-vertex steps inside the wrap (first ${JSON.stringify(r.wrapAt)})`);
    if (r.full && (r.elbowH[0] < BARS_.elbowLo || r.elbowH[1] > BARS_.elbowHi)) r.fails.push(`elbow height ${r.elbowH.map((x) => x.toFixed(3)).join('..')}`);
    if (r.full && r.elbowBack < BARS_.elbowBack) r.fails.push(`elbow ${r.elbowBack.toFixed(3)} m behind the hand`);
    if (r.full && r.bowChest < BARS_.bowChest) r.fails.push(`bow arm ${r.bowChest.toFixed(3)} m off the chest`);
    if (r.arrowNock > BARS_.arrowNock) r.fails.push(`arrow ${r.arrowNock.toFixed(3)} m off the string`);
    if (r.full && r.handNock > BARS_.handNock) r.fails.push(`string ${r.handNock.toFixed(3)} m off the hand`);
    if (r.behind > 0) r.fails.push(`${r.behind} behind-head steps (first ${JSON.stringify(r.behindAt)})`);
    for (const l of r.looses) if (l.aimW < BARS_.looseAim || l.drawS < BARS_.looseDraw) r.fails.push(`loosed at aim ${l.aimW} draw ${l.drawS}`);
    if (r.verifyFails > 0) r.fails.push(`${r.verifyFails} solve verifications failed (last ${JSON.stringify(an.debugAimRig?.()?.verifyLast)})`);
    return r;
  };
  return { begin, sample, loose, end, jawChar, inWrap, behind, counts: { hand: handIdx.length, wrap: wrapIdx.length, chest: chestIdx.length } };
}

