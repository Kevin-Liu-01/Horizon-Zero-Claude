/**
 * M1.2e / M1.2f / M1.3c / M1.3f (hero-anim) — the sweep's bars, measured on the posed skeleton, the CPU-skinned
 * body, the outfit and the stow kit. One function, used by the Node bench (`bench.mjs`) and, as source text, by
 * the page rows (`tools/gates/hero-sweep.mjs`), so both grade the same thing. Self-contained: no imports, no
 * closure over this module (the page receives `String(buildSweep)`).
 *
 * Per sampled step (`sample(st)`):
 *  ARMS (M1.3f, M1.2f; BIBLE §5.2 "never an arm behind the head")
 *   - `behind`: a hand point (wrist, index knuckle, middle fingertip) or a forearm point (a quarter, half and
 *     three quarters down it) behind the back of the skull within the head's half-width, over the crown, or (hands)
 *     at the nape: the aim rig's own test (aim-rig/measure.mjs bar 6), head-ellipsoid units about the skull centre;
 *   - `plane`: a hand or forearm point ABOVE ITS OWN SHOULDER JOINT and behind the head's frontal plane (the plane
 *     through the skull centre, normal to the head's forward axis). This is "a hand behind the head plane" of
 *     M1.2f's stow rows: an arm can only be behind the head when it is up at head level;
 *   - `overShoulder`: the highest wrist over its own shoulder joint (m; BIBLE: the lance stow "no hand rises above
 *     the shoulder").
 *  CLOTH (M1.2e: "cloth through body, quiver or draw arm")
 *   - the wrap tail's and the knot tail's vertices (HairWrap, weighted >= 0.5 to their chains) and the sash panels'
 *     vertices (the outfit's, weighted >= 0.5 to a `dyn_panel` chain, or before the panels had chains: the pelvis-
 *     and-thigh-skinned sheet below the belt, found at bind) against the body's capsules (torso pelvis -> neck,
 *     each thigh hip -> knee, each shin knee -> ankle) at the body's INNER radius (the 20th percentile of the skin's
 *     own distance to that axis at bind, less 5 mm: a point inside it is inside her; the torso as four segments up
 *     her spine since M1.2e round 2, the round-1 straight torso graded beside it as `clipFramesLine`), the stowed quiver (its own
 *     vertices' axis and radius) and the draw arm (right upper arm and forearm, 0.040 / 0.032 m);
 *   - a frame with any such point is a clipping frame.
 *   - the panels' hang: each panel's root-to-hem straight length over its bind length (M1.2e: >= 0.85 in a crouch
 *     and a sit).
 *  RUN (M1.3c)
 *   - each wrist's distance off the torso midline (pelvis-spine_03 mid x, char), A-run-arms' >= 0.10 m;
 *   - each forearm's clearance of the survey case (axis to axis, less both radii).
 */
export function buildSweep(R, THREE, opts = {}) {
  const { an, model } = R;
  const V = () => new THREE.Vector3();
  model.updateMatrixWorld(true);
  const bones = {};
  model.traverse((o) => { if (o.isBone && !bones[o.name]) bones[o.name] = o; });
  const B = (n) => bones[n] || null;
  let skin = null, wrap = null, outfit = null, kit = null;
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (o.geometry.getAttribute('_hidemask')) skin = skin || o;
    if (/HairWrap/.test(o.name)) wrap = o;
    if (/outfit/.test(o.userData?.heroPart || '') && o.name !== 'Caster' && o.material?.name !== 'hero-caster') outfit = outfit || o;
    if (/stowkit/.test(o.userData?.heroPart || '')) kit = kit || o;
  });
  const tmp = V(), tmp2 = V(), tmp3 = V();
  const CH = (w, out) => model.worldToLocal(out.copy(w));
  const CP = (b, out) => { b.getWorldPosition(out); return CH(out, out); };
  const VP = (mesh, i, out) => { mesh.getVertexPosition(i, out); mesh.localToWorld(out); return CH(out, out); };
  const weightTo = (mesh, re) => {
    const bn = mesh.skeleton.bones.map((x) => x.name), si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
    const n = mesh.geometry.attributes.position.count, w = new Float32Array(n);
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) if (re.test(bn[si.getComponent(i, k)] || '')) w[i] += sw.getComponent(i, k);
    return w;
  };
  const pick = (w, min, step = 1) => { const out = []; for (let i = 0; i < w.length; i += step) if (w[i] >= min) out.push(i); return out; };
  const segT = (P, A, Bp) => { tmp2.subVectors(Bp, A); tmp3.subVectors(P, A); return Math.max(0, Math.min(1, tmp3.dot(tmp2) / (tmp2.lengthSq() || 1e-9))); };
  const segD = (P, A, Bp) => { const t = segT(P, A, Bp); return tmp3.subVectors(P, A).addScaledVector(tmp2.subVectors(Bp, A), -t).length(); };
  const segSeg = (a0, a1, b0, b1) => {
    // closest distance between two segments (sampled finely: 9 x 9 is enough at these lengths)
    let d = 9;
    for (let i = 0; i <= 8; i++) { tmp.copy(a0).lerp(a1, i / 8); const e = segD(tmp, b0, b1); if (e < d) d = e; }
    for (let i = 0; i <= 8; i++) { const q = V().copy(b0).lerp(b1, i / 8); const e = segD(q, a0, a1); if (e < d) d = e; }
    return d;
  };

  /* ---------------- the head frame (the animator's convention, as aim-rig/measure.mjs) */
  const headB = an.b.head.bone;
  const hq = new THREE.Quaternion(), hqi = new THREE.Quaternion(), hp = V();
  const headFrame = () => { an._charOf(headB, hp); an._liveW(headB, hq); hq.multiply(an.b.head.invW); hqi.copy(hq).invert(); };
  const toHead = (pChar, out) => out.subVectors(pChar, hp).applyQuaternion(hqi);
  headFrame();
  const skullC = an.T.headOff.clone();
  const HR = an.T.headR;
  const unit = (pChar, out) => { toHead(pChar, out).sub(skullC); out.x /= HR.x; out.y /= HR.y; out.z /= HR.z; return out; };
  const behind = (pChar, hand) => {
    const u = unit(pChar, tmp3);
    if (Math.abs(u.x) < 1 && u.z > -1.4 && u.z < 0.8 && u.y > 1) return 'crown';
    if (u.z < -1 && Math.abs(u.x) < 1 && u.y >= -1) return 'skull';
    if (hand && u.z < -1 && u.z > -2.5 && Math.abs(u.x) < 1 && u.y > -2.4) return 'nape';
    return null;
  };
  /** behind the head's frontal plane (through the skull centre): the head-frame depth (m, < 0 behind) */
  const planeDepth = (pChar) => toHead(pChar, tmp3).sub(skullC).z;
  /* M1a r3 (hero-anim): THE HEAD PLANE AS KEVIN'S BAR READS IT, "never an arm or hand behind the head". The
   * head-frame plane above tilts with the head: looking up at a ledge it put every point at her shoulders "behind"
   * it (the page's mantle and climb: a forearm 0.006 m over the shoulder, 0.256 m "behind"). A point now counts when
   * it is behind BOTH that plane and the vertical one through the skull centre, normal to the head's forward laid
   * level (`planeDepthLevel`, m, < 0 behind); upside down (the head's up axis under 0.3 of the vertical) the level
   * plane is undefined and the head-frame plane alone grades. Both depths are reported at the first step. */
  const _hf = V(), _hu = V(), _sc = V();
  const headLevel = () => {
    _hu.set(0, 1, 0).applyQuaternion(hq);
    _hf.set(0, 0, 1).applyQuaternion(hq); _hf.y = 0;
    const ok = _hu.y >= 0.3 && _hf.lengthSq() > 1e-4;
    if (ok) _hf.normalize();
    _sc.copy(skullC).applyQuaternion(hq).add(hp);
    return ok;
  };
  const planeDepthLevel = (pChar) => tmp3.subVectors(pChar, _sc).dot(_hf);
  const side = (s) => ({
    s, sh: s === 'r' ? an.b.upArmR.bone : an.b.upArmL.bone, el: s === 'r' ? an.b.loArmR.bone : an.b.loArmL.bone, wr: s === 'r' ? an.b.handR.bone : an.b.handL.bone,
    kn: B('index_01_' + s), tip: B('middle_04_leaf_' + s) || B('middle_03_' + s),
  });
  const SR = side('r'), SL = side('l');

  /* ---------------- the body capsules at the skin's inner radius (bind) */
  /* M1.2e round 2: the TORSO follows her spine: four segments, pelvis -> spine_01 -> spine_02 -> spine_03 -> neck,
   * each at the inner radius of the torso skin nearest to it (the 20th percentile less 5 mm, as every capsule here).
   * The single straight pelvis -> neck capsule of round 1 cut through her own body whenever she bent: measured on the
   * bench, 28 % of her own torso skin more than 2 cm inside it in the ledge climb, 26 % in the roll and the slide, 19 %
   * in the crouch (2.1 % standing), so the belt on her belly, where the panels hang, was "inside her". The four
   * segments: 3.4 % standing, 4.1-6.1 % in those clips. The straight capsule is still graded beside it
   * (`clipFramesLine`, `clipByLine`: the round-1 body), so both numbers are on the record. */
  const spineB = [an.b.pelvis.bone, B('spine_01') || an.b.spine1?.bone, B('spine_02') || an.b.spine2?.bone, B('spine_03') || an.b.spine3?.bone, an.b.neck1?.bone || headB].filter(Boolean);
  const capDefs = [
    ['thighL', an.b.thighL.bone, an.b.calfL.bone, /^thigh_.*l$|^thigh_l$/],
    ['thighR', an.b.thighR.bone, an.b.calfR.bone, /^thigh_.*r$|^thigh_r$/],
    ['shinL', an.b.calfL.bone, an.b.footL.bone, /^calf_.*l$|^calf_l$/],
    ['shinR', an.b.calfR.bone, an.b.footR.bone, /^calf_.*r$|^calf_r$/],
  ];
  const caps = [];
  {
    // the straight round-1 torso (line only) and the spine's four segments (radii from the skin nearest each)
    const w = weightTo(skin, /^(pelvis|spine_0[1-5])/), idx = pick(w, 0.9, 1);
    const A = CP(an.b.pelvis.bone, V()), Bp = CP(an.b.neck1?.bone || headB, V()), ds = [];
    const segP = spineB.map((b) => CP(b, V()));
    const buckets = segP.slice(1).map(() => []);
    for (const i of idx) {
      VP(skin, i, tmp);
      const t = segT(tmp, A, Bp); if (t > 0.08 && t < 0.92) ds.push(segD(tmp, A, Bp));
      let bs = -1, bd = 9, bt = 0;
      for (let k = 0; k + 1 < segP.length; k++) { const d = segD(tmp, segP[k], segP[k + 1]); if (d < bd) { bd = d; bs = k; bt = segT(tmp, segP[k], segP[k + 1]); } }
      if (bs >= 0 && bt > 0.08 && bt < 0.92) buckets[bs].push(bd);
    }
    ds.sort((x, y) => x - y);
    caps.push({ name: 'torso', a: an.b.pelvis.bone, b: an.b.neck1?.bone || headB, A, B: Bp, r: +((ds.length ? ds[Math.floor(ds.length * 0.2)] - 0.005 : 0.08)).toFixed(4), line: true });
    for (let k = 0; k + 1 < spineB.length; k++) {
      const d = buckets[k].sort((x, y) => x - y);
      caps.push({ name: 'torso', seg: k, a: spineB[k], b: spineB[k + 1], A: segP[k], B: segP[k + 1], r: +((d.length ? d[Math.floor(d.length * 0.2)] - 0.005 : 0.08)).toFixed(4), spine: true });
    }
  }
  for (const [name, a, b, re] of capDefs) {
    const A = CP(a, V()), Bp = CP(b, V());
    const w = weightTo(skin, re), idx = pick(w, 0.9, 1), ds = [];
    for (const i of idx) { VP(skin, i, tmp); const t = segT(tmp, A, Bp); if (t > 0.08 && t < 0.92) ds.push(segD(tmp, A, Bp)); }
    ds.sort((x, y) => x - y);
    const r = ds.length ? ds[Math.floor(ds.length * 0.2)] - 0.005 : 0.08;
    caps.push({ name, a, b, A, B: Bp, r: +r.toFixed(4) });
  }
  const capsNow = () => { for (const c of caps) { CP(c.a, c.A); CP(c.b, c.B); } };

  /* ---------------- the cloth points */
  const tailW = wrap ? weightTo(wrap, /^dyn_wrapSash_0[2-9]/) : null;
  const tailIdx = tailW ? pick(tailW, 0.5, 2) : [];
  const knotW = wrap ? weightTo(wrap, /^dyn_hairKnotTail_0[2-9]/) : null;
  const knotIdx = knotW ? pick(knotW, 0.5, 2) : [];
  let panelIdx = [], panelMode = 'none';
  const panelInfo = new Map();
  const panelChains = [];
  if (outfit) {
    const pw = weightTo(outfit, /^dyn_panel/);
    panelIdx = pick(pw, 0.5, 1);
    // which panel each vertex is on and its height at bind (for the report)
    {
      const bn = outfit.skeleton.bones.map((x) => x.name), si = outfit.geometry.attributes.skinIndex, sw = outfit.geometry.attributes.skinWeight;
      for (const i of panelIdx) {
        let best = '', bw = 0;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k), n = bn[si.getComponent(i, k)] || ''; if (/^dyn_panel/.test(n) && w > bw) { bw = w; best = n; } }
        VP(outfit, i, tmp); panelInfo.set(i, best.replace(/^dyn_(panel[A-Za-z])_.*$/, '$1') + '@' + tmp.y.toFixed(2));
      }
    }
    if (panelIdx.length) {
      panelMode = 'chain';
      for (const name of Object.keys(bones)) {
        if (!/^dyn_panel[A-Za-z]*_01$/.test(name)) continue;
        const stem = name.slice(0, -3), list = [];
        for (let k = 1; k < 20; k++) { const b = B(`${stem}_${String(k).padStart(2, '0')}`); if (b) list.push(b); else break; }
        const end = B(`${stem}_end`); if (end) list.push(end);
        const r0 = CP(list[0], V()), r1 = CP(list[list.length - 1], V());
        panelChains.push({ stem, list, rest: r0.distanceTo(r1) });
      }
    } else if (opts.panelBind) {
      // (a control: the panels' vertices found by their bind positions, char space, as another build listed them)
      const key = (v) => `${Math.round(v.x * 2000)},${Math.round(v.y * 2000)},${Math.round(v.z * 2000)}`;
      const want = new Map(opts.panelBind.map((q) => [key({ x: q[0], y: q[1], z: q[2] }), q[3]]));
      for (let i = 0; i < outfit.geometry.attributes.position.count; i++) { VP(outfit, i, tmp); const k = key(tmp); if (want.has(k)) { panelIdx.push(i); panelInfo.set(i, want.get(k)); } }
      panelMode = 'bind-matched';
    } else {
      // (before the panels had chains: the sheet below the belt skinned to the pelvis and a thigh, off the body)
      const pel = weightTo(outfit, /^(pelvis|thigh_l|thigh_r)$/);
      for (let i = 0; i < pel.length; i += 1) {
        if (pel[i] < 0.99) continue;
        VP(outfit, i, tmp);
        if (tmp.y > 0.95 || tmp.y < 0.36) continue;
        let inside = false;
        for (const c of caps) if (c.name !== 'torso' && segD(tmp, c.A, c.B) < c.r + 0.03) inside = true;
        if (!inside) panelIdx.push(i);
      }
      panelMode = 'sheet';
    }
  }
  // the stowed quiver: its own vertices (stow kit piece 4), axis from the extreme points along its long direction
  let quiverIdx = [];
  if (kit && kit.geometry.getAttribute('_piece')) {
    const P = kit.geometry.getAttribute('_piece');
    for (let i = 0; i < P.count; i += 3) if ((Math.round(P.getX(i)) & 4) !== 0) quiverIdx.push(i);
  }
  const axisOf = (mesh, idx, out) => {
    // the two farthest-apart samples (by a 2-pass sweep) are the ends; the radius is the median distance to that axis
    if (!idx.length) return null;
    const a = VP(mesh, idx[0], V()); let far = a.clone(), d = -1;
    for (const i of idx) { VP(mesh, i, tmp); const e = tmp.distanceTo(a); if (e > d) { d = e; far.copy(tmp); } }
    const b = far.clone(); let far2 = b.clone(); d = -1;
    for (const i of idx) { VP(mesh, i, tmp); const e = tmp.distanceTo(b); if (e > d) { d = e; far2.copy(tmp); } }
    out.a = b; out.b = far2;
    const ds = []; for (const i of idx) { VP(mesh, i, tmp); ds.push(segD(tmp, out.a, out.b)); }
    ds.sort((x, y) => x - y); out.r = ds[Math.floor(ds.length / 2)];
    // pull the ends in by the radius (the farthest points are on the caps' rims)
    const dir = tmp2.subVectors(out.b, out.a).normalize();
    out.a.addScaledVector(dir, out.r * 0.7); out.b.addScaledVector(dir, -out.r * 0.7);
    return out;
  };
  // the survey case: the outfit's vertices on a 0.38 m tube across the upper back (outfit-pan-1.mjs: top at her
  // left shoulder blade, 36 deg; found at bind as the vertices within 6 cm of that line behind the back)
  let caseIdx = [];
  if (outfit) {
    const S = 0.969, mid = V().set(0.087 * S, 1.249 * S, -0.17), d = V().set(Math.sin(0.628), Math.cos(0.628), 0);
    const a = mid.clone().addScaledVector(d, -0.2), b = mid.clone().addScaledVector(d, 0.2);
    for (let i = 0; i < outfit.geometry.attributes.position.count; i += 2) { VP(outfit, i, tmp); if (tmp.z < -0.09 && segD(tmp, a, b) < 0.06) caseIdx.push(i); }
  }
  const caseAxis = {}, quiverAxis = {};

  /* ---------------- per-frame accumulators */
  let acc = null;
  const begin = (label = '') => {
    acc = { label, frames: 0, behind: 0, behindAt: null, plane: 0, planeAt: null, overShoulder: -9,
      clipFrames: 0, clipAt: null, clipBy: {}, clipDeepest: 0, panelHangMin: 9, clipFramesLine: 0, clipByLine: {},
      wristMid: 9, foreCase: 9, foreCaseAt: null, quiverClip: 0, drawArmClip: 0 };
  };
  const armPoints = (S) => {
    const e = CP(S.el, V()), w = CP(S.wr, V());
    const pts = [[w, 1]];
    if (S.kn) pts.push([CP(S.kn, V()), 1]);
    if (S.tip) pts.push([CP(S.tip, V()), 1]);
    for (const t of [0.25, 0.5, 0.75]) pts.push([e.clone().lerp(w, t), 0]);
    return pts;
  };
  /** opts: { arms, cloth, run, T } */
  const sample = (st = {}) => {
    acc.frames++;
    model.updateMatrixWorld(true);
    headFrame();
    if (st.arms !== false) {
      for (const S of [SR, SL]) {
        const sh = CP(S.sh, V());
        for (const [q, h] of armPoints(S)) {
          const why = behind(q, h);
          if (why) { acc.behind++; if (!acc.behindAt) acc.behindAt = { T: st.T, why, side: S.s, pt: h ? 'hand' : 'forearm' }; break; }
        }
        /* M1a r3: the plane on the level head forward (above); not while she tumbles; and not the draw arm while it
         * holds the string at full aim (the rig's weight >= 0.5): the knuckle on the jaw corner puts the wrist at the
         * back of the cheek by design, behind the skull centre's plane, and that arm is graded by the anchor rows
         * (A16, A32, A-draw-elbow-level: the knuckle on the jaw-corner anchor, no hand or forearm point behind the head)
         * and by the skull test above on every step */
        const onString = S === SR && (an._cr?.w ?? 0) >= 0.5 && !!st.aiming;
        if (!onString) {
          const lvl = headLevel();
          for (const [q, h] of armPoints(S)) {
            const dh = planeDepth(q), dl = lvl ? planeDepthLevel(q) : dh;
            if (q.y > sh.y && dh < 0 && dl < 0) { acc.plane++; if (!acc.planeAt) acc.planeAt = { T: st.T, side: S.s, pt: h ? 'hand' : 'forearm', aboveSh: +(q.y - sh.y).toFixed(3), depthHeadFrame: +dh.toFixed(3), depthLevel: +dl.toFixed(3) }; break; }
          }
        } else acc.planeOnString = (acc.planeOnString || 0) + 1;
        const w = CP(S.wr, V());
        acc.overShoulder = Math.max(acc.overShoulder, w.y - sh.y);
      }
    }
    if (st.cloth) {
      capsNow();
      let hit = null, deep = 0, hitL = null;
      const test = (mesh, idx, tag) => {
        for (const i of idx) {
          VP(mesh, i, tmp);
          for (const c of caps) {
            const d = segD(tmp, c.A, c.B);
            if (d >= c.r) continue;
            const dd = c.r - d;
            // (the round-1 body: the straight torso and the legs; the graded body: the spine's torso and the legs)
            if (!c.spine && (!hitL || dd > hitL.depthM)) hitL = { by: tag, into: c.name, depthM: +dd.toFixed(4), at: tag === 'panel' ? panelInfo.get(i) : undefined };
            if (c.line) continue;
            if (dd > deep) { deep = dd; hit = { by: tag, into: c.name, depthM: +dd.toFixed(4), at: tag === 'panel' ? panelInfo.get(i) : undefined }; }
          }
        }
      };
      if (wrap) { test(wrap, tailIdx, 'tail'); test(wrap, knotIdx, 'knotTail'); }
      if (outfit && panelIdx.length) test(outfit, panelIdx, 'panel');
      // the quiver and the draw arm
      if (kit && quiverIdx.length && axisOf(kit, quiverIdx, quiverAxis)) {
        const chk = (mesh, idx, tag) => { for (const i of idx) { VP(mesh, i, tmp); const d = segD(tmp, quiverAxis.a, quiverAxis.b); if (d < quiverAxis.r - 0.004) { acc.quiverClip++; if (!hit) hit = { by: tag, into: 'quiver', depthM: +(quiverAxis.r - d).toFixed(4) }; if (!hitL) hitL = hit; return; } } };
        if (outfit && panelIdx.length) chk(outfit, panelIdx, 'panel');
        if (wrap) chk(wrap, tailIdx, 'tail');
      }
      {
        const sh = CP(SR.sh, V()), el = CP(SR.el, V()), wr = CP(SR.wr, V());
        const chk = (mesh, idx, tag) => { for (const i of idx) { VP(mesh, i, tmp); if (segD(tmp, sh, el) < 0.040 || segD(tmp, el, wr) < 0.032) { acc.drawArmClip++; if (!hit) hit = { by: tag, into: 'drawArm', depthM: null }; if (!hitL) hitL = hit; return; } } };
        if (wrap) chk(wrap, tailIdx, 'tail');
        if (outfit && panelIdx.length) chk(outfit, panelIdx, 'panel');
      }
      if (hitL) {
        const lh = hitL || hit;
        if (lh) { acc.clipFramesLine++; const key = lh.by + (lh.at ? '(' + lh.at.split('@')[0] + ')' : '') + '>' + lh.into; acc.clipByLine[key] = (acc.clipByLine[key] || 0) + 1; }
      }
      if (hit) { acc.clipFrames++; const key = hit.by + (hit.at ? '(' + hit.at.split('@')[0] + ')' : '') + '>' + hit.into; acc.clipBy[key] = (acc.clipBy[key] || 0) + 1; if (!acc.clipAt) acc.clipAt = { T: st.T, ...hit }; if (deep > acc.clipDeepest) acc.clipWorst = { T: st.T, ...hit }; }
      if (deep > acc.clipDeepest) acc.clipDeepest = deep;
      for (const pc of panelChains) {
        const r0 = CP(pc.list[0], tmp), r1 = CP(pc.list[pc.list.length - 1], tmp2);
        const k = r0.distanceTo(r1) / pc.rest;
        if (k < acc.panelHangMin) acc.panelHangMin = k;
      }
    }
    if (st.run) {
      const pel = CP(an.b.pelvis.bone, V()), sp = CP(an.b.spine3.bone, V());
      const midX = (pel.x + sp.x) / 2;
      const wl = CP(SL.wr, V()), wr = CP(SR.wr, V());
      acc.wristMid = Math.min(acc.wristMid, wl.x - midX, midX - wr.x);
      if (outfit && caseIdx.length && axisOf(outfit, caseIdx, caseAxis)) {
        for (const S of [SR, SL]) {
          const e = CP(S.el, V()), w = CP(S.wr, V());
          const d = segSeg(e, w, caseAxis.a, caseAxis.b) - caseAxis.r - 0.032;
          if (d < acc.foreCase) { acc.foreCase = d; acc.foreCaseAt = { T: st.T, side: S.s }; }
        }
      }
    }
  };
  const end = () => {
    const r = { ...acc };
    r.overShoulder = +r.overShoulder.toFixed(4);
    r.clipDeepest = +r.clipDeepest.toFixed(4);
    r.panelHangMin = r.panelHangMin === 9 ? null : +r.panelHangMin.toFixed(3);
    r.wristMid = r.wristMid === 9 ? null : +r.wristMid.toFixed(4);
    r.foreCase = r.foreCase === 9 ? null : +r.foreCase.toFixed(4);
    return r;
  };

  /* ---------------- the idle hands' pose hash (M1.3c): both hands and every finger joint, local TRS (`armBones`: the
   * clavicles, upper arms and forearms too, published beside it as `armHash`) */
  const handRe = /^(hand|index|middle|ring|pinky|thumb)_/, armRe2 = /^(clavicle|upperarm|lowerarm)_/;
  let handBones = Object.keys(bones).filter((n) => handRe.test(n)).sort().map((n) => bones[n]);
  const armBones = Object.keys(bones).filter((n) => armRe2.test(n)).sort().map((n) => bones[n]);
  const useBones = (which) => { handBones = (which === 'arms' ? armBones : Object.keys(bones).filter((n) => handRe.test(n)).sort().map((n) => bones[n])); };
  const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
  let ha = 0x811c9dc5, hb = 0x01000193 ^ 0x5bd1e995;
  const mixw = (x) => { ha = Math.imul(ha ^ x, 0x01000193) >>> 0; hb = Math.imul(hb ^ x, 0x5bd1e995) >>> 0; hb ^= hb >>> 15; };
  const num = (v) => { F64[0] = Math.round(v * 1e5) / 1e5; mixw(U32[0]); mixw(U32[1]); };
  const hashReset = () => { ha = 0x811c9dc5; hb = 0x01000193 ^ 0x5bd1e995; };
  /** the hashed bones' local rotations now, flat (the bench keeps a reference trace beside the hash) */
  const tracePose = () => { const o = []; for (const b of handBones) o.push(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w); return o; };
  const hashPose = () => { for (const b of handBones) { num(b.quaternion.x); num(b.quaternion.y); num(b.quaternion.z); num(b.quaternion.w); num(b.position.x); num(b.position.y); num(b.position.z); } };
  const hashHex = () => (ha >>> 0).toString(16).padStart(8, '0') + (hb >>> 0).toString(16).padStart(8, '0');

  /* ---------------- the kite's hang pose (M1.3f): both wrists in front of the head plane, at or below head height */
  const hangCheck = () => {
    model.updateMatrixWorld(true); headFrame();
    const top = hp.clone(); // the head bone (the skull's base) and the skull top
    const crown = V().copy(skullC); crown.y += HR.y; crown.applyQuaternion(hq).add(hp);
    const out = {};
    for (const S of [SR, SL]) {
      const w = CP(S.wr, V());
      out[S.s] = { front: +planeDepth(w).toFixed(4), belowHeadBoneM: +(top.y - w.y).toFixed(4), belowCrownM: +(crown.y - w.y).toFixed(4), y: +w.y.toFixed(3) };
    }
    return out;
  };

  /** the panels' vertices at bind (char space) and their panel, for a control run (`opts.panelBind`) */
  const panelBindList = () => panelIdx.map((i) => { VP(outfit, i, tmp); return [tmp.x, tmp.y, tmp.z, panelInfo.get(i)]; });
  return { panelBindList, begin, sample, end, hashReset, hashPose, hashHex, hangCheck, useBones, tracePose, caps: caps.map((c) => ({ name: c.name + (c.seg != null ? c.seg : c.line ? 'Line' : ''), r: c.r })),
    counts: { tail: tailIdx.length, knot: knotIdx.length, panel: panelIdx.length, panelMode, panelChains: panelChains.map((p) => p.stem), quiver: quiverIdx.length, case: caseIdx.length, handBones: handBones.length } };
}
