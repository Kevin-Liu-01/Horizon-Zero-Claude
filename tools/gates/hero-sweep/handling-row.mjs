/**
 * M1a weapons step 1 — the handling rows W1-W11 as PURE functions over a recorded step log (handling-bench.mjs
 * records it in Node; a page row can record the same fields). Every number is per step of sim time (1/60 s) or in
 * seconds of sim time from the request. Nothing here reads the scene.
 *
 * A step record (`rec`):
 *   t                       s since the case's request
 *   bowVis                  'kit' | 'held' | 'none'      which bow is drawn this step
 *   bowTip [x,y,z]          the visible bow's far (top) tip, char space
 *   bowTipSp [x,y,z]        the same in spine_02's frame (the carry frame)
 *   bowAxis [x,y,z]         the visible bow's stave axis (lower to upper), char
 *   bowLimb, bowGrip        the held bow's limb and riser socket points, char (null when not held)
 *   bowSock                 the socket the handling plan says the palm holds this step, char (null: none)
 *   bowS                    the regrip slide 0 (limb) .. 1 (riser), or null
 *   bowOwner                'carry' | 'handL'
 *   bowPhase                the handling phase name or ''
 *   curlL                   the left fingers' curl 0..1 (the handling state; null when not known)
 *   lanceVis                'kit' | 'held' | 'none'
 *   lanceButt, lanceTip     the visible lance, char
 *   lanceTipSp              its tip in spine_02's frame
 *   lanceOwner              'carry' | 'handL' | 'handR' | 'both'
 *   stance                  melee's stance
 *   palmBowL                the left palm as the bow's carry places it (0.7 wrist to middle knuckle), char
 *   palmL, palmR, wristL, wristR, elbowL, elbowR, shL, shR    char
 *   gripAxL                 the left hand's grip axis (pinky to index), char
 *   wristFlexL, wristDevL   deg
 *   kneeY                   the lower knee's height, char
 *   spineYaw, headYaw       deg (char, about +Y; 0 = her forward)
 *   aimW, aimGate           the aim weight and the handling aim gate
 *   behind, plane           measure.mjs's head-plane counters this step (0/1)
 */
const D = 180 / Math.PI;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const dist = (a, b) => len(sub(a, b));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(nrm(a), nrm(b))))) * D;
const r3 = (x) => (x == null || !Number.isFinite(x) ? x : +x.toFixed(3));
const r4 = (x) => (x == null || !Number.isFinite(x) ? x : +x.toFixed(4));
/** distance from point p to segment a-b */
const segDist = (p, a, b) => { const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1))); return dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]); };

/** first step index where f is true, or -1 */
const first = (L, f, from = 0) => { for (let i = from; i < L.length; i++) if (f(L[i], i)) return i; return -1; };

/**
 * Grade one case. `kind`: 'bowUnstow' | 'bowStow' | 'lanceDraw' | 'lanceStow' | 'swap12' | 'swap21' | 'click' | 'held'.
 * `meta`: { tempo: 'ask'|'timer', jog: bool }. Returns { W1..W11 numbers, fails[] }.
 */
export function gradeCase(kind, L, meta = {}) {
  const out = { kind, steps: L.length, fails: [] };
  // (M1a weapons fix 1: W9's mid-draw and mid-stow cases: the second key comes mid-sequence, so the draw's own path and
  //  time bars (W4, W7) are not theirs; W1-W3, W6, W9 and W11's per-step clauses hold)
  meta.w9mid = /^key[12]Mid/.test(meta.name || '');
  const fail = (s) => out.fails.push(s);
  const n = L.length;
  // ---- ownership events
  const bowGrip = first(L, (r, i) => i > 0 && r.bowOwner === 'handL' && L[i - 1].bowOwner !== 'handL');
  const bowRel = first(L, (r, i) => i > 0 && r.bowOwner !== 'handL' && L[i - 1].bowOwner === 'handL');
  const lanceTake = first(L, (r, i) => i > 0 && r.lanceOwner !== 'carry' && L[i - 1].lanceOwner === 'carry');
  const lanceRel = first(L, (r, i) => i > 0 && r.lanceOwner === 'carry' && L[i - 1].lanceOwner !== 'carry');
  out.events = { bowGripT: bowGrip >= 0 ? r3(L[bowGrip].t) : null, bowReleaseT: bowRel >= 0 ? r3(L[bowRel].t) : null,
    lanceTakeT: lanceTake >= 0 ? r3(L[lanceTake].t) : null, lanceReleaseT: lanceRel >= 0 ? r3(L[lanceRel].t) : null };

  // ---- W1 grip contact (the bow, in the left hand): from the grip event to the release (or the end)
  {
    const a = bowGrip >= 0 ? bowGrip : (L[0]?.bowOwner === 'handL' ? 0 : -1);
    if (a >= 0) {
      const b = bowRel >= 0 && bowRel > a ? bowRel : n;
      let pmax = 0, axMax = 0, flex = 0, dev = 0, sockMax = 0, sockN = 0;
      /* (M1a weapons fix 1: W1 is the handling's grip; under the raised aim (aim weight over 0.5) combat places the bow at
       *  the hand's origin for the draw solve (`_placeInHand`'s aimed branch), so those steps are reported, not graded) */
      /* (M1a weapons round 3: ...and the steps of the bow's hand-over between the fist's carry and that placement, `bowAimK`
       *  over 0: the raise out of the carry and the lowering back into it; reported as palmInRaiseMaxM / axisInRaiseMaxDeg) */
      let aimPalm = 0, raisePalm = 0, raiseAx = 0, raiseN = 0, regripN = 0, revFlex = 0, revDev = 0, revN = 0;
      const inAim = (r) => (r.aimW ?? 0) > 0.5 || (r.bowAimK ?? 0) > 0.01;
      for (let i = a; i < b; i++) {
        const r = L[i];
        if (r.bowVis === 'held' && r.bowLimb && (r.aimW ?? 0) > 0.5 && r.bowSock) aimPalm = Math.max(aimPalm, dist(r.palmBowL, r.bowSock));
        if (r.bowVis === 'held' && r.bowLimb && (r.aimW ?? 0) <= 0.5 && (r.bowAimK ?? 0) > 0.01) {
          raiseN++; if (r.bowSock) raisePalm = Math.max(raisePalm, dist(r.palmBowL, r.bowSock));
          const g = ang(r.gripAxL, r.bowAxis); raiseAx = Math.max(raiseAx, Math.min(g, 180 - g));
        }
        if (r.bowVis !== 'held' || !r.bowLimb || inAim(r)) continue;
        /* (M1a weapons round 3, the wave 3 ruling: the left hand OPEN in the two-hand regrip (the right holds the bow, W5)
         *  is not on the bow; those steps are counted, not graded for the grip) */
        if (r.bowGripKind === 'regrip') { regripN++; continue; }
        // the palm on the stave between the limb socket and the riser (generic: any design)
        pmax = Math.max(pmax, segDist(r.palmBowL, r.bowLimb, r.bowGrip));
        if (r.bowSock) { sockMax = Math.max(sockMax, dist(r.palmBowL, r.bowSock)); sockN++; }
        // the grip axis along the stave (either way round)
        const g = ang(r.gripAxL, r.bowAxis); axMax = Math.max(axMax, Math.min(g, 180 - g));
        /* (the ruling: "W1's wrist bar is graded after the regrip, and the take is graded on palm contact and no joint
         *  inside the bow": the wrist on the steps the carry's fist holds it, 'norm'; the reverse take's reported) */
        if (r.bowGripKind === 'rev') { revFlex = Math.max(revFlex, Math.abs(r.wristFlexL)); revDev = Math.max(revDev, Math.abs(r.wristDevL)); revN++; continue; }
        flex = Math.max(flex, Math.abs(r.wristFlexL)); dev = Math.max(dev, Math.abs(r.wristDevL));
      }
      out.W1 = { regripOpenSteps: regripN, reverseSteps: revN, reverseWristFlexMaxDeg: revN ? r3(revFlex) : null, reverseWristDevMaxDeg: revN ? r3(revDev) : null, raiseSteps: raiseN, palmInRaiseMaxM: raiseN ? r4(raisePalm) : null, axisInRaiseMaxDeg: raiseN ? r3(raiseAx) : null, palmInAimMaxM: aimPalm ? r4(aimPalm) : null, palmToStaveMaxM: r4(pmax), palmToSocketMaxM: sockN ? r4(sockMax) : null, gripAxisToStaveMaxDeg: r3(axMax), wristFlexMaxDeg: r3(flex), wristDevMaxDeg: r3(dev) };
      // the close: curl from open to closed over >= 2 steps ending on the grip step
      if (bowGrip > 0 && L[bowGrip].curlL != null) {
        let k = bowGrip; while (k > 0 && L[k - 1].curlL != null && L[k - 1].curlL < L[k].curlL - 1e-4) k--;
        out.W1.closeSteps = bowGrip - k; out.W1.curlAtGrip = r3(L[bowGrip].curlL);
        if (out.W1.closeSteps < 2) fail(`W1 fingers closed over ${out.W1.closeSteps} steps (bar >= 2)`);
      } else out.W1.closeSteps = null;
      /* M1a weapons fix 1: the palm normal against the socket frame's (sockets.js: from the palm point to the centreline),
       * and the fingertips and joints against the stave's surface (sockets.js r), every step the fingers are closed */
      let nMax = 0, nN = 0, tipMax = 0, inside = 0, closedN = 0;
      for (let i = a; i < b; i++) {
        const r = L[i];
        if (r.bowVis !== 'held' || !r.bowLineA || r.curlL == null || r.curlL < 0.8 || inAim(r) || r.bowGripKind === 'regrip') continue;
        closedN++;
        // (the socket's normal as the handling reports it when it knows it: the reverse take's, from the palm onto the limb)
        const sn = r.bowSockNH || r.bowSockN;
        if (r.palmNL && sn) { nMax = Math.max(nMax, ang(r.palmNL, sn)); nN++; }
        const rad = segDist(r.palmBowL, r.bowLimbC, r.bowLimbC) < segDist(r.palmBowL, r.bowGripC, r.bowGripC) ? r.bowRLimb : r.bowRGrip;
        for (const F of (r.fingL || []).slice(0, 4)) {
          for (let j = 0; j < 4; j++) { const d = segDist(F[j], r.bowLineA, r.bowLineB) - rad; if (j < 3 && d < 0) inside++; if (j === 3) tipMax = Math.max(tipMax, Math.abs(d)); }
        }
      }
      Object.assign(out.W1, { closedSteps: closedN, palmNormalMaxDeg: nN ? r3(nMax) : null, fingertipToSurfaceMaxM: closedN ? r4(tipMax) : null, fingerJointsInside: closedN ? inside : null });
      if (nN && nMax > 10) fail(`W1 palm normal ${nMax.toFixed(1)} deg off the socket frame (bar 10)`);
      if (closedN && tipMax > 0.015) fail(`W1 a fingertip ${tipMax.toFixed(4)} m off the stave's surface (bar 0.015)`);
      if (closedN && inside) fail(`W1 ${inside} finger joint-steps inside the stave (bar 0)`);
      if ((sockN ? sockMax : pmax) > 0.010) fail(`W1 palm ${(sockN ? sockMax : pmax).toFixed(4)} m off the bow (bar 0.010)`);
      if (axMax > 10) fail(`W1 grip axis ${axMax.toFixed(1)} deg off the stave (bar 10)`);
      if (flex > 60) fail(`W1 wrist flexion ${flex.toFixed(1)} deg (bar 60)`);
      if (dev > 30) fail(`W1 wrist deviation ${dev.toFixed(1)} deg (bar 30)`);
    }
  }
  // ---- W1 the lance's three sockets (M1a weapons fix 1): the left palm on lance.butt from its take until the right has
  // it; the right on lance.grip while it holds it; the left on lance.fore in the guard. Along the haft (the slide off the
  // socket, bar 0.010) and radially (reported); the palm normal toward the centreline; fingertips and joints on the haft
  // (sockets.js r) once the hand has held it 2 steps; the close: the drawn curl rising over >= 2 steps into the take
  {
    // (the haft's surface radius at each socket, sockets.js r; M1a weapons round 2: read from the table, the butt socket moved)
    const LR = meta.lanceR || { butt: 0.0145, grip: 0.0173, fore: 0.0162 };
    const W = {};
    const hold = (key, side, sock, pred) => {
      let along = 0, rad = 0, nMax = 0, tipMax = 0, inside = 0, n2 = 0, run = 0;
      for (let i = 0; i < n; i++) {
        const r = L[i];
        if (r.lanceVis !== 'held' || r.swing || !pred(r)) { run = 0; continue; }
        run++;
        const p = r['palm' + side], s0 = r[sock], ax = nrm(sub(r.lanceTip, r.lanceButt));
        const v = sub(p, s0), k = dot(v, ax), rv = [v[0] - ax[0] * k, v[1] - ax[1] * k, v[2] - ax[2] * k];
        along = Math.max(along, Math.abs(k)); rad = Math.max(rad, len(rv));
        if (run < 3) continue;
        n2++;
        const pn = r['palmN' + side]; if (pn && len(rv) > 1e-4) nMax = Math.max(nMax, ang(pn, [-rv[0], -rv[1], -rv[2]]));
        const R0 = LR[sock.replace('lanceSock', '').toLowerCase()];
        for (const F of (r['fing' + side] || []).slice(0, 4)) for (let j = 0; j < 4; j++) { const d = segDist(F[j], r.lanceButt, r.lanceTip) - R0; if (j < 3 && d < 0) inside++; if (j === 3) tipMax = Math.max(tipMax, Math.abs(d)); }
      }
      if (!along && !rad) return;
      W[key] = { alongMaxM: r4(along), radialMaxM: r4(rad), palmNormalMaxDeg: n2 ? r3(nMax) : null, fingertipToSurfaceMaxM: n2 ? r4(tipMax) : null, fingerJointsInside: n2 ? inside : null };
      if (along > 0.010) fail(`W1 lance ${key}: palm ${along.toFixed(4)} m along the haft off its socket (bar 0.010)`);
      if (n2 && nMax > 10) fail(`W1 lance ${key}: palm normal ${nMax.toFixed(1)} deg off the socket frame (bar 10)`);
      if (n2 && tipMax > 0.015) fail(`W1 lance ${key}: a fingertip ${tipMax.toFixed(4)} m off the haft (bar 0.015)`);
      if (n2 && inside) fail(`W1 lance ${key}: ${inside} finger joint-steps inside the haft`);
    };
    hold('butt (left, the take)', 'L', 'lanceSockButt', (r) => r.lanceOwner === 'handL');
    hold('grip (right)', 'R', 'lanceSockGrip', (r) => r.lanceOwner === 'handR' || r.lanceOwner === 'both');
    hold('fore (left, the guard)', 'L', 'lanceSockFore', (r) => r.stance === 'ready');
    if (lanceTake > 0 && L[lanceTake].curlGeoL != null) {
      let k = lanceTake; while (k > 0 && L[k - 1].curlGeoL != null && L[k - 1].curlGeoL < L[k].curlGeoL - 0.05) k--;
      W.closeStepsLeft = lanceTake - k;
      if (W.closeStepsLeft < 2) fail(`W1 lance: the left fingers closed over ${W.closeStepsLeft} steps into the take (bar >= 2)`);
    }
    if (Object.keys(W).length) out.W1lance = W;
  }
  // ---- W2 ownership
  {
    const w2 = {};
    // the bow does not move in its carry frame before the grip
    if (bowGrip > 0) {
      let d = 0; for (let i = 1; i < bowGrip; i++) if (L[i].bowVis === 'kit' && L[0].bowVis === 'kit') d = Math.max(d, dist(L[i].bowTipSp, L[0].bowTipSp));
      w2.bowBeforeGripM = r4(d);
      // across the owner change: the far end, in the carry frame, the step before against the step of
      w2.bowAcrossGripM = r4(dist(L[bowGrip].bowTipSp, L[bowGrip - 1].bowTipSp));
      w2.bowAcrossGripDeg = r3(ang(L[bowGrip].bowAxis, L[bowGrip - 1].bowAxis));
      if (w2.bowBeforeGripM > 0.0001) fail(`W2 the bow moved ${w2.bowBeforeGripM} m before the grip`);
      if (w2.bowAcrossGripM > 0.02 || w2.bowAcrossGripDeg > 2) fail(`W2 the bow jumped ${w2.bowAcrossGripM} m / ${w2.bowAcrossGripDeg} deg at the grip`);
    }
    if (bowRel > 0) {
      w2.bowAcrossReleaseM = r4(dist(L[bowRel].bowTipSp, L[bowRel - 1].bowTipSp));
      w2.bowAcrossReleaseDeg = r3(ang(L[bowRel].bowAxis, L[bowRel - 1].bowAxis));
      if (w2.bowAcrossReleaseM > 0.02 || w2.bowAcrossReleaseDeg > 2) fail(`W2 the bow jumped ${w2.bowAcrossReleaseM} m / ${w2.bowAcrossReleaseDeg} deg at the release`);
    }
    if (lanceTake > 0) {
      let d = 0; for (let i = 1; i < lanceTake; i++) if (L[i].lanceVis === 'kit' && L[0].lanceVis === 'kit') d = Math.max(d, dist(L[i].lanceTipSp, L[0].lanceTipSp));
      w2.lanceBeforeGripM = r4(d);
      w2.lanceAcrossTakeM = r4(dist(L[lanceTake].lanceTipSp, L[lanceTake - 1].lanceTipSp));
      if (w2.lanceAcrossTakeM > 0.02) fail(`W2 the lance jumped ${w2.lanceAcrossTakeM} m at the take`);
    }
    if (lanceRel > 0) {
      w2.lanceAcrossReleaseM = r4(dist(L[lanceRel].lanceTipSp, L[lanceRel - 1].lanceTipSp));
      if (w2.lanceAcrossReleaseM > 0.02) fail(`W2 the lance jumped ${w2.lanceAcrossReleaseM} m at the release`);
    }
    /* M1a weapons fix 1: "0 owner changes outside a grip or release event". The bow's changes against the events the
     * handling stamps (sim time); the lance's against its socket: the receiving hand's palm within 0.02 m along the haft
     * and 0.06 m off its centreline the step it takes it (the left on lance.butt, the right on lance.grip) */
    let ch = 0, outside = 0; const outAt = [];
    for (let i = 1; i < n; i++) {
      const a = L[i - 1], r = L[i];
      if (a.bowOwner !== r.bowOwner) {
        ch++;
        const ok = r.simT != null && (Math.abs(r.simT - r.bowGripAt) < 1e-6 || Math.abs(r.simT - r.bowReleaseAt) < 1e-6);
        if (!ok) { outside++; outAt.push(`bow ${a.bowOwner}->${r.bowOwner} t ${r3(r.t)}`); }
      }
      if (a.lanceOwner !== r.lanceOwner) {
        ch++;
        const to = r.lanceOwner, side = to === 'handL' ? 'L' : to === 'handR' || to === 'both' ? 'R' : null;
        const sock = to === 'handL' ? 'lanceSockButt' : 'lanceSockGrip';
        let ok = true;
        if (side && r.lanceVis === 'held') {
          const ax = nrm(sub(r.lanceTip, r.lanceButt)), v = sub(r['palm' + side], r[sock]), k = dot(v, ax);
          const rv = len([v[0] - ax[0] * k, v[1] - ax[1] * k, v[2] - ax[2] * k]);
          ok = Math.abs(k) <= 0.02 && rv <= 0.06;
        }
        if (!ok) { outside++; outAt.push(`lance ${a.lanceOwner}->${to} t ${r3(r.t)}`); }
      }
    }
    w2.ownerChanges = ch; w2.ownerChangesOutsideEvent = outside; if (outAt.length) w2.outsideAt = outAt.slice(0, 6);
    if (outside) fail(`W2 ${outside} owner changes outside a grip or release event (${outAt.slice(0, 3).join(', ')})`);
    // the visible prop's far end may not jump between any two steps by more than its rate (a teleport check)
    let both = 0; for (const r of L) if (r.bowOwner === 'handL' && r.lanceOwner !== 'carry') both++;
    w2.bothInHandsSteps = both;
    if (both) fail(`W2 both weapons in her hands on ${both} steps`);
    out.W2 = w2;
  }
  // ---- W3 rate
  {
    let bow = 0, lance = 0, wr = 0, wrAt = null;
    for (let i = 1; i < n; i++) {
      const a = L[i - 1], b = L[i];
      if (a.bowVis === 'held' && b.bowVis === 'held') bow = Math.max(bow, ang(a.bowAxis, b.bowAxis));
      if (a.lanceVis === 'held' && b.lanceVis === 'held') lance = Math.max(lance, ang(sub(a.lanceTip, a.lanceButt), sub(b.lanceTip, b.lanceButt)));
      if (!b.swing && !a.swing) for (const k of ['wristL', 'wristR']) { const d = dist(a[k], b[k]); if (d > wr) { wr = d; wrAt = { t: r3(b.t), k }; } }
    }
    out.W3 = { bowDegStepMax: r3(bow), lanceDegStepMax: r3(lance), wristMStepMax: r4(wr), wristAt: wrAt };
    if (bow > 10) fail(`W3 bow ${bow.toFixed(1)} deg a step (bar 10)`);
    const lb = meta.tempo === 'timer' ? 12 : 24;
    if (lance > lb) fail(`W3 lance ${lance.toFixed(1)} deg a step (bar ${lb})`);
    if (wr > 0.08) fail(`W3 a wrist moved ${wr.toFixed(3)} m in a step (bar 0.08)`);
  }
  // ---- W4 the lance's path (draw and stow): total shaft rotation, the blade over the knee, the first 0.15 m axial
  if (/lance|swap/.test(kind) && !meta.w9mid) {
    let tot = 0, low = 9, lowAt = null;
    /* M1a weapons fix round 1: the PATH, as the brief words it ("from the stowed line to the guard line"): a draw's record
     * ends at its first ready step (the guard up), a stow's at holstered. Round 2 summed every held step of the record, so
     * at a jog the guard's own bob after the draw (0.43 s of the 0.8 s record) counted as path: lanceDrawJog 269 deg, and the
     * guard's tip under the knee of the jog's raised leg (t 0.567, the draw ready at 0.417). The whole record's figures stay
     * reported beside it (recordRotDeg, recordBladeOverKneeMinM) */
    const isStow = kind === 'lanceStow' || kind === 'swap21';
    const pe = first(L, (r) => (isStow ? r.stance === 'holstered' : r.stance === 'ready' || r.stance === 'swing'));
    const pathEnd = pe >= 0 ? pe + 1 : n;
    const vis = L.slice(0, pathEnd).filter((r) => r.lanceVis === 'held');
    for (let i = 1; i < vis.length; i++) tot += ang(sub(vis[i - 1].lanceTip, vis[i - 1].lanceButt), sub(vis[i].lanceTip, vis[i].lanceButt));
    for (const r of vis) { const m = r.lanceTip[1] - r.kneeY; if (m < low) { low = m; lowAt = r3(r.t); } }
    let recTot = 0, recLow = 9;
    { const all = L.filter((r) => r.lanceVis === 'held');
      for (let i = 1; i < all.length; i++) recTot += ang(sub(all[i - 1].lanceTip, all[i - 1].lanceButt), sub(all[i].lanceTip, all[i].lanceButt));
      for (const r of all) recLow = Math.min(recLow, r.lanceTip[1] - r.kneeY); }
    let axial = null;
    if (lanceTake > 0) {
      const b0 = L[lanceTake - 1].lanceButt, d0 = nrm(sub(L[lanceTake - 1].lanceTip, b0));
      let worst = 0;
      for (let i = lanceTake; i < n; i++) { const mv = sub(L[i].lanceButt, b0), m = len(mv); if (m > 0.15) break; if (m > 0.01) { const a = ang(mv, d0); worst = Math.max(worst, Math.min(a, 180 - a)); } }
      axial = r3(worst);
    }
    out.W4 = { shaftRotTotalDeg: r3(tot), bladeOverKneeMinM: r3(low), bladeLowAt: lowAt, first15cmOffAxisDeg: axial, pathEndT: pe >= 0 ? r3(L[pe].t) : null, recordRotDeg: r3(recTot), recordBladeOverKneeMinM: r3(recLow) };
    if (tot > 140) fail(`W4 the shaft turned ${tot.toFixed(0)} deg in all (bar 140)`);
    if (low < 0) fail(`W4 the blade ${(-low).toFixed(3)} m under the knee (t ${lowAt})`);
    if (axial != null && axial > 5) fail(`W4 the first 0.15 m ${axial} deg off the shaft's axis (bar 5)`);
  }
  // ---- W5 the bow's regrip
  {
    /* (M1a weapons round 3, the wave 3 ruling: the regrip is TWO-HANDED: on every step the left is open in it, the right
     *  holds the bow's upper limb, closed on it) */
    const rg = L.filter((r) => r.bowGripKind === 'regrip' && r.bowVis === 'held');
    if (rg.length) {
      const bad = rg.filter((r) => !r.rightHold).length;
      out.W5two = { regripSteps: rg.length, rightNotHolding: bad };
      if (bad) fail(`W5 the left open in the regrip on ${bad} of ${rg.length} steps without the right hand on the bow`);
    }
    const sl = L.filter((r) => r.bowS != null && r.bowS > 0.001 && r.bowS < 0.999 && r.bowVis === 'held');
    if (sl.length) {
      let d = 0, c = 0; for (const r of sl) { d = Math.max(d, r.bowSock ? dist(r.palmBowL, r.bowSock) : segDist(r.palmBowL, r.bowLimb, r.bowGrip)); if (r.curlL != null) c = Math.max(c, r.curlL); }
      out.W5 = { slideSteps: sl.length, palmToLimbMaxM: r4(d), curlMaxWhileSliding: r3(c) };
      if (d > 0.010) fail(`W5 palm ${d.toFixed(4)} m off the limb while it slides`);
      if (c > 0.5) fail(`W5 curl ${c.toFixed(2)} while the limb slides (bar 0.5)`);
    }
    if (bowGrip > 0) {
      // (in the carry frame, spine_02's: the keeper rides it)
      // (from the grip step on: the step across the owner change is W2's)
      const t0 = L[bowGrip].bowTipSp, ax = nrm(sub(L[bowGrip - 1].bowTipSp, L[bowGrip - 1].bowLowSp));
      let worst = 0;
      for (let i = bowGrip + 1; i < n; i++) { const mv = sub(L[i].bowTipSp, t0), m = len(mv); if (m > 0.10) break; if (m > 0.01) { const a = ang(mv, ax); worst = Math.max(worst, Math.min(a, 180 - a)); } }
      out.W5 = { ...(out.W5 || {}), first10cmOffKeeperDeg: r3(worst) };
      if (worst > 5) fail(`W5 the bow's first 0.10 m ${worst.toFixed(1)} deg off its keeper axis (bar 5)`);
    }
  }
  // ---- W6 clearance: the head plane and above the shoulder
  {
    let behind = 0, plane = 0, over = -9;
    for (const r of L) { behind += r.behind || 0; plane += r.plane || 0; for (const s of ['L', 'R']) over = Math.max(over, r['wrist' + s][1] - r['sh' + s][1]); }
    /* M1a weapons fix 1: "above its shoulder joint" graded: the wrist, the elbow (the forearm's upper end) and the palm (the
     * grip socket) against the same side's shoulder joint, every step outside a swing and outside the raised aim (aim
     * weight over 0.5: the draw hand's anchor at the cheek is Kevin's bar and A35's, above the shoulder by design); the
     * swing's and the aim's own figures are reported beside it */
    let overH = -9, overAt = null, overSwing = -9, overAim = -9, overN = 0;
    for (const r of L) for (const s2 of ['L', 'R']) {
      const sh = r['sh' + s2][1], h = Math.max(r['wrist' + s2][1], r['elbow' + s2][1], r['palm' + s2][1]) - sh;
      if (r.swing) overSwing = Math.max(overSwing, h);
      else if ((r.aimW ?? 0) > 0.5) overAim = Math.max(overAim, h);
      else { if (h > overH) { overH = h; overAt = { t: r3(r.t), side: s2 }; } if (h > 0) overN++; }
    }
    out.W6 = { behindSteps: behind, planeSteps: plane, wristOverShoulderMaxM: r3(over), handOverShoulderMaxM: r3(overH), overShoulderSteps: overN, overAt,
      inSwingMaxM: overSwing > -9 ? r3(overSwing) : null, inAimMaxM: overAim > -9 ? r3(overAim) : null };
    if (behind || plane) fail(`W6 ${behind} behind-head and ${plane} head-plane steps`);
    if (overN) fail(`W6 a hand, forearm or grip ${overH.toFixed(3)} m above its shoulder joint on ${overN} side-steps (t ${overAt?.t})`);
  }
  // ---- W7 times (s): request to ready; the swaps to the other weapon ready
  {
    const w7 = {};
    if (kind === 'bowUnstow' || kind === 'swap21') { const i = first(L, (r) => r.bowReady); w7.bowReadyS = i >= 0 ? r3(L[i].t) : null; }
    if (kind === 'lanceDraw' || kind === 'swap12') { const i = first(L, (r) => r.stance === 'ready'); w7.lanceReadyS = i >= 0 ? r3(L[i].t) : null; }
    if (kind === 'bowStow') { const i = first(L, (r) => r.bowHome); w7.bowStowS = i >= 0 ? r3(L[i].t) : null; w7.releaseS = out.events.bowReleaseT; }
    if (kind === 'lanceStow') { const i = first(L, (r) => r.stance === 'holstered'); w7.lanceStowS = i >= 0 ? r3(L[i].t) : null; }
    if (kind === 'click') { const i = first(L, (r) => r.swing); w7.clickToSwingS = i >= 0 ? r3(L[i].t) : null; }
    // (M1a weapons fix 1: the bow's asked stow is swap 1 to 2's first half: key 2 to the bow home on her back)
    if (kind === 'swap12') { const i = first(L, (r) => r.bowHome); w7.bowStowAskS = i >= 0 ? r3(L[i].t) : null; }
    if (kind === 'swap21') { const i = first(L, (r) => r.stance === 'holstered'); w7.lanceStowAskS = i >= 0 ? r3(L[i].t) : null; }
    if (kind === 'aim') { const i = first(L, (r) => r.loosable); w7.rmbToLoosableS = i >= 0 ? r3(L[i].t) : null; }
    out.W7 = w7;
    const band = (v, lo, hi, what) => { if (meta.w9mid) return; if (v == null) fail(`W7 ${what}: never`); else if (v < lo || v > hi) fail(`W7 ${what} ${v} s (band ${lo}-${hi})`); };
    if (kind === 'bowUnstow') band(w7.bowReadyS, 0.30, 0.40, 'bow unstow');
    if (kind === 'lanceDraw') band(w7.lanceReadyS, 0.30, 0.40, 'lance draw');
    if (kind === 'click') band(w7.clickToSwingS, 0.25, 0.35, 'click to swing');
    if (kind === 'bowStow') band(w7.bowStowS, meta.tempo === 'timer' ? 0.43 : 0.30, meta.tempo === 'timer' ? 0.50 : 0.37, `bow stow (${meta.tempo})`);
    if (kind === 'lanceStow') band(w7.lanceStowS, meta.tempo === 'timer' ? 0.50 : 0.30, meta.tempo === 'timer' ? 0.57 : 0.37, `lance stow (${meta.tempo})`);
    if (kind === 'swap12') band(w7.lanceReadyS, 0.45, 0.65, 'swap 1 to 2');
    if (kind === 'swap12' && !meta.w9mid) band(w7.bowStowAskS, 0.30, 0.37, 'bow asked stow (in swap 1 to 2)');
    if (kind === 'swap21') band(w7.bowReadyS, 0.45, 0.65, 'swap 2 to 1');
  }
  // ---- W9 swap truth (at the case's end): key 1 ends with the bow at bow.grip in the left hand, key 2 with the lance at
  // lance.grip in the right (M1a weapons fix 1: from every start state; `meta.w9` names what the last key asked for)
  {
    const want = meta.w9 ?? (kind === 'swap21' ? 'bow' : kind === 'swap12' ? 'lance' : null);
    if (want) {
      const e = L[n - 1];
      const atGrip = want === 'bow' ? (e.bowS == null || e.bowS >= 0.999) && e.bowVis === 'held' : true;
      const ok = want === 'bow' ? e.bowOwner === 'handL' && e.lanceOwner === 'carry' && atGrip : (e.lanceOwner === 'handR' || e.lanceOwner === 'both') && e.bowOwner === 'carry';
      out.W9 = { want, ok, end: { bow: e.bowOwner, lance: e.lanceOwner, stance: e.stance } };
      if (!ok) fail(`W9 asked for the ${want}: ended with the bow ${e.bowOwner}, the lance ${e.lanceOwner}`);
    }
  }
  // ---- W8 no pop into the aim (RMB from stowed): from the bow's grip event to full raise (aim weight >= 0.99)
  if (kind === 'aim') {
    const g0 = bowGrip >= 0 ? bowGrip : 0;
    const full = first(L, (r) => (r.aimW ?? 0) >= 0.99, g0);
    const end = full >= 0 ? full : n - 1;
    let bowD = 0, hand = 0;
    for (let i = g0 + 1; i <= end; i++) {
      const a = L[i - 1], r = L[i];
      if (a.bowVis === 'held' && r.bowVis === 'held') bowD = Math.max(bowD, ang(a.bowAxis, r.bowAxis));
      hand = Math.max(hand, dist(a.wristR, r.wristR));
    }
    // the gate's rise: steps from the first under 1 (or the aim weight's first rise) to >= 0.99 of the aim weight
    const a0 = first(L, (r) => (r.aimW ?? 0) > 0.01);
    const riseSteps = a0 >= 0 && full >= 0 ? full - a0 : null;
    const gateMin = Math.min(...L.map((r) => r.aimGate ?? 1));
    // the arrow on the string (combat's nock) before the draw hand has been at the quiver (within 0.12 m)
    const q = first(L, (r) => r.handToQuiver != null && r.handToQuiver <= 0.12);
    const nk = first(L, (r) => r.nockLanded);
    const early = nk >= 0 && (q < 0 || nk < q) ? (q < 0 ? n - nk : q - nk) : 0;
    const minQ = Math.min(...L.map((r) => r.handToQuiver ?? 9));
    out.W8 = { gripT: bowGrip >= 0 ? r3(L[bowGrip].t) : null, fullRaiseT: full >= 0 ? r3(L[full].t) : null, bowDegStepMax: r3(bowD), drawHandMStepMax: r4(hand),
      aimRiseSteps: riseSteps, aimGateMin: r3(gateMin), quiverReachT: q >= 0 ? r3(L[q].t) : null, handToQuiverMinM: r3(minQ), nockT: nk >= 0 ? r3(L[nk].t) : null, arrowBeforeQuiverSteps: early };
    if (bowD > 10) fail(`W8 the bow turned ${bowD.toFixed(1)} deg a step into the raise (bar 10)`);
    if (hand > 0.08) fail(`W8 the draw hand moved ${hand.toFixed(3)} m a step into the raise (bar 0.08)`);
    if (riseSteps == null || riseSteps < 6) fail(`W8 the aim rose over ${riseSteps} steps (bar >= 6)`);
    if (early) fail(`W8 the arrow on the bow ${early} steps before the draw hand reached the quiver (closest ${minQ.toFixed(3)} m)`);
  }
  // ---- W11 body: peak spine yaw from the request's; head yaw; the elbow pole's turn per step
  {
    let sp = 0, hd = 0, pole = 0;
    const y0 = L[0].spineYaw, h0 = L[0].headYaw;
    for (let i = 0; i < n; i++) {
      const r = L[i];
      sp = Math.max(sp, Math.abs(r.spineYaw - y0)); hd = Math.max(hd, Math.abs(r.headYaw - h0));
      if (i) for (const s of ['L', 'R']) {
        // (the pole is the elbow's offset square to the shoulder-wrist line; undefined on a straight arm: graded only
        //  where the elbow stands >= 0.04 m off the line in both steps)
        const a = L[i - 1], P = (q) => { const sh = q['sh' + s], w = q['wrist' + s], e = q['elbow' + s], ax = nrm(sub(w, sh)), v = sub(e, sh), k = dot(v, ax); const o = [v[0] - ax[0] * k, v[1] - ax[1] * k, v[2] - ax[2] * k]; return len(o) >= 0.04 ? nrm(o) : null; };
        const pa = P(a), pb = P(r);
        if (!r.swing && pa && pb) pole = Math.max(pole, ang(pa, pb));
      }
    }
    out.W11 = { spineYawPeakDeg: r3(sp), headYawMaxDeg: r3(hd), elbowPoleDegStepMax: r3(pole) };
    /* M1a weapons step 2 (W11's step-2 clauses, graded on the lance draw): the prop's cant overshoot past the guard's
     * line (the largest angle off the final line after the haft first stops closing on it) and the steps it takes from
     * that peak back inside 0.5 deg; the hips' lead (s): when the pelvis has made half its turn from the request to the
     * end against when the shoulder line has */
    if (kind === 'lanceDraw' || kind === 'click') {
      const held = L.filter((r) => r.lanceVis === 'held');
      const iT = held.findIndex((r) => r.lanceOwner === 'handR' || r.lanceOwner === 'both');
      if (kind === 'lanceDraw' && iT >= 0) {
        // the signed angle off the final (guard) line in the plane the pull turns it in: + short of it, - past it
        const g = nrm(sub(held[held.length - 1].lanceTip, held[held.length - 1].lanceButt)), d0 = nrm(sub(held[iT].lanceTip, held[iT].lanceButt));
        const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const nn = nrm(cr(d0, g));
        const sg = held.slice(iT).map((r) => { const d = nrm(sub(r.lanceTip, r.lanceButt)); return Math.atan2(dot(cr(d, g), nn), dot(d, g)) * D; });
        let mn = 0, mnI = -1; for (let i = 0; i < sg.length; i++) if (sg[i] < mn) { mn = sg[i]; mnI = i; }
        let back = null; if (mnI >= 0) for (let i = mnI; i < sg.length; i++) if (Math.abs(sg[i]) <= 0.5) { back = i - mnI; break; }
        out.W11.overshootDeg = r3(-mn); out.W11.settleSteps = back;
        if (!(-mn >= 1 && -mn <= 4)) fail(`W11 cant overshoot ${(-mn).toFixed(2)} deg (band 1-4)`);
        if (back == null || back > 6) fail(`W11 settle ${back} steps back inside 0.5 deg (bar 6)`);
      }
      const half = (k) => { const v0 = L[0][k], v1 = L[n - 1][k], m = (v0 + v1) / 2; if (Math.abs(v1 - v0) < 2) return null; for (let i = 0; i < n; i++) if ((v1 > v0 ? L[i][k] >= m : L[i][k] <= m)) return L[i].t; return null; };
      const hp = half('pelvisYaw'), hs = half('shoulderYaw');
      out.W11.hipLeadS = hp != null && hs != null ? r3(hs - hp) : null;
      if (out.W11.hipLeadS == null || out.W11.hipLeadS < 0.040) fail(`W11 hip lead ${out.W11.hipLeadS} s (bar >= 0.040)`);
    }
    // (the lance's guard turns her trunk by design (meleeLayer STANCE): the band is the draw's own reach additive, graded on
    //  the bow's unstow, where nothing else turns her)
    /* M1a weapons fix 1: graded in EVERY draw (the brief: "peak spine_02 yaw 5-10 deg in each draw"), the lance's from
     * the request to the guard (its designed trunk turn into the guard counts: the bar does not exempt it) */
    if ((kind === 'bowUnstow' || kind === 'lanceDraw') && (sp < 5 || sp > 10)) fail(`W11 spine yaw peak ${sp.toFixed(1)} deg (band 5-10)`);
    // the reach additive wherever the aim weight is over 0.5 (bar 0.5 deg)
    let addAim = 0; for (const r of L) if ((r.aimW ?? 0) > 0.5) addAim = Math.max(addAim, Math.abs(r.reachYaw ?? 0));
    out.W11.additiveUnderAimDeg = r3(addAim);
    if (addAim > 0.5) fail(`W11 the reach additive ${addAim.toFixed(2)} deg under the aim (bar 0.5)`);
    // the guard's stance step: the last foot step (a foot moving over 0.004 m a step) lands within 4 steps of the hand-over
    if (kind === 'lanceDraw' && lanceTake >= 0) {
      const ho = first(L, (r) => r.lanceOwner === 'handR' || r.lanceOwner === 'both');
      let land = -1;
      for (let i = 1; i < n; i++) for (const f of ['footL', 'footR']) if (L[i][f] && L[i - 1][f] && dist(L[i][f], L[i - 1][f]) > 0.004) land = i;
      out.W11.handOverT = ho >= 0 ? r3(L[ho].t) : null; out.W11.stanceStepLandT = land >= 0 ? r3(L[land].t) : null;
      out.W11.stanceStepFromHandOverSteps = ho >= 0 && land >= 0 ? land - ho : null;
      if (ho >= 0 && land >= 0 && Math.abs(land - ho) > 4) fail(`W11 the stance step lands ${land - ho} steps from the hand-over (bar 4)`);
    }
    if (hd > 3) fail(`W11 head yaw ${hd.toFixed(1)} deg (bar 3)`);
    if (pole > 25) fail(`W11 elbow pole ${pole.toFixed(1)} deg a step (bar 25)`);
  }
  return out;
}

/**
 * W10 (M1a weapons fix 1; RESTATED in weapons round 3 per the wave 3 ruling): an interrupt injected at step `k` (the
 * record runs on 0.6 s past the case). W2's ownership (both weapons in hands, the jumps at owner changes, an owner change
 * outside an event) and W6's head-plane and shoulder clauses hold over the whole run.
 *
 * The ruling: "the 0.06 m per step bar applies to a jump against the sequence's own planned motion (the rendered wrist
 * against where the authored path puts it that step), not to the authored path's own speed". `ref` is the same sequence
 * run UNINTERRUPTED (the authored path, step for step; handling-bench.mjs records it in its own process). The jump at a
 * step is how far either wrist's offset from the authored path changes in that step, |(R[i+1] - A[i+1]) - (R[i] - A[i])|:
 * across the interrupt step (k to k + 1) and over the 4 steps after it (no blend shorter than 4 steps: a cut shows as one
 * step's jump inside them). Swing steps are left out after the interrupt step, as before. The raw per-step wrist travel
 * (the old reading) is reported beside it. Without `ref` the old reading is graded.
 */
export function gradeInterrupt(L, k, g, ref = null) {
  const fails = [];
  const keep = (g.fails || []).filter((f) => /^W2 |^W6 /.test(f));
  for (const f of keep) fails.push(f);
  let across = 0, after = 0, jA = 0, jAf = 0;
  const off = (i, s) => (ref && ref[i] ? sub(L[i][s], ref[i][s]) : [0, 0, 0]);
  const jump = (i, s) => len(sub(off(i + 1, s), off(i, s)));
  const hasRef = !!(ref && ref.length > k + 1);
  for (const s of ['wristL', 'wristR']) {
    if (L[k + 1] && L[k]) { across = Math.max(across, dist(L[k][s], L[k + 1][s])); if (hasRef) jA = Math.max(jA, jump(k, s)); }
    for (let i = k + 1; i <= k + 4 && i + 1 < L.length; i++) {
      if (L[i + 1].swing || L[i].swing) continue;
      after = Math.max(after, dist(L[i][s], L[i + 1][s]));
      if (hasRef && ref[i + 1]) jAf = Math.max(jAf, jump(i, s));
    }
  }
  const a = hasRef ? jA : across, b = hasRef ? jAf : after;
  if (a > 0.06) fails.push(`wrist ${a.toFixed(3)} m ${hasRef ? 'off the authored path' : ''} across the interrupt step`);
  if (b > 0.06) fails.push(`wrist ${b.toFixed(3)} m ${hasRef ? 'off the authored path' : ''} a step within 4 steps after it`);
  return { jumpAcrossM: r4(a), jumpAfterM: r4(b), wristAcrossM: r4(across), wristAfterM: r4(after), againstRef: hasRef, fails };
}
