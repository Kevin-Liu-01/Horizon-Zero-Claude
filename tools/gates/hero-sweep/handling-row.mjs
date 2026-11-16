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
      for (let i = a; i < b; i++) {
        const r = L[i];
        if (r.bowVis !== 'held' || !r.bowLimb) continue;
        // the palm on the stave between the limb socket and the riser (generic: any design)
        pmax = Math.max(pmax, segDist(r.palmBowL, r.bowLimb, r.bowGrip));
        if (r.bowSock) { sockMax = Math.max(sockMax, dist(r.palmBowL, r.bowSock)); sockN++; }
        // the grip axis along the stave (either way round)
        const g = ang(r.gripAxL, r.bowAxis); axMax = Math.max(axMax, Math.min(g, 180 - g));
        flex = Math.max(flex, Math.abs(r.wristFlexL)); dev = Math.max(dev, Math.abs(r.wristDevL));
      }
      out.W1 = { palmToStaveMaxM: r4(pmax), palmToSocketMaxM: sockN ? r4(sockMax) : null, gripAxisToStaveMaxDeg: r3(axMax), wristFlexMaxDeg: r3(flex), wristDevMaxDeg: r3(dev) };
      // the close: curl from open to closed over >= 2 steps ending on the grip step
      if (bowGrip > 0 && L[bowGrip].curlL != null) {
        let k = bowGrip; while (k > 0 && L[k - 1].curlL != null && L[k - 1].curlL < L[k].curlL - 1e-4) k--;
        out.W1.closeSteps = bowGrip - k; out.W1.curlAtGrip = r3(L[bowGrip].curlL);
        if (out.W1.closeSteps < 2) fail(`W1 fingers closed over ${out.W1.closeSteps} steps (bar >= 2)`);
      } else out.W1.closeSteps = null;
      if ((sockN ? sockMax : pmax) > 0.010) fail(`W1 palm ${(sockN ? sockMax : pmax).toFixed(4)} m off the bow (bar 0.010)`);
      if (axMax > 10) fail(`W1 grip axis ${axMax.toFixed(1)} deg off the stave (bar 10)`);
      if (flex > 60) fail(`W1 wrist flexion ${flex.toFixed(1)} deg (bar 60)`);
      if (dev > 30) fail(`W1 wrist deviation ${dev.toFixed(1)} deg (bar 30)`);
    }
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
  if (/lance|swap/.test(kind)) {
    let tot = 0, low = 9, lowAt = null;
    const vis = L.filter((r) => r.lanceVis === 'held');
    for (let i = 1; i < vis.length; i++) tot += ang(sub(vis[i - 1].lanceTip, vis[i - 1].lanceButt), sub(vis[i].lanceTip, vis[i].lanceButt));
    for (const r of vis) { const m = r.lanceTip[1] - r.kneeY; if (m < low) { low = m; lowAt = r3(r.t); } }
    let axial = null;
    if (lanceTake > 0) {
      const b0 = L[lanceTake - 1].lanceButt, d0 = nrm(sub(L[lanceTake - 1].lanceTip, b0));
      let worst = 0;
      for (let i = lanceTake; i < n; i++) { const mv = sub(L[i].lanceButt, b0), m = len(mv); if (m > 0.15) break; if (m > 0.01) { const a = ang(mv, d0); worst = Math.max(worst, Math.min(a, 180 - a)); } }
      axial = r3(worst);
    }
    out.W4 = { shaftRotTotalDeg: r3(tot), bladeOverKneeMinM: r3(low), bladeLowAt: lowAt, first15cmOffAxisDeg: axial };
    if (tot > 140) fail(`W4 the shaft turned ${tot.toFixed(0)} deg in all (bar 140)`);
    if (low < 0) fail(`W4 the blade ${(-low).toFixed(3)} m under the knee (t ${lowAt})`);
    if (axial != null && axial > 5) fail(`W4 the first 0.15 m ${axial} deg off the shaft's axis (bar 5)`);
  }
  // ---- W5 the bow's regrip
  {
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
    out.W6 = { behindSteps: behind, planeSteps: plane, wristOverShoulderMaxM: r3(over) };
    if (behind || plane) fail(`W6 ${behind} behind-head and ${plane} head-plane steps`);
  }
  // ---- W7 times (s): request to ready; the swaps to the other weapon ready
  {
    const w7 = {};
    if (kind === 'bowUnstow' || kind === 'swap21') { const i = first(L, (r) => r.bowReady); w7.bowReadyS = i >= 0 ? r3(L[i].t) : null; }
    if (kind === 'lanceDraw' || kind === 'swap12') { const i = first(L, (r) => r.stance === 'ready'); w7.lanceReadyS = i >= 0 ? r3(L[i].t) : null; }
    if (kind === 'bowStow') { const i = first(L, (r) => r.bowHome); w7.bowStowS = i >= 0 ? r3(L[i].t) : null; w7.releaseS = out.events.bowReleaseT; }
    if (kind === 'lanceStow') { const i = first(L, (r) => r.stance === 'holstered'); w7.lanceStowS = i >= 0 ? r3(L[i].t) : null; }
    if (kind === 'click') { const i = first(L, (r) => r.swing); w7.clickToSwingS = i >= 0 ? r3(L[i].t) : null; }
    out.W7 = w7;
    const band = (v, lo, hi, what) => { if (v == null) fail(`W7 ${what}: never`); else if (v < lo || v > hi) fail(`W7 ${what} ${v} s (band ${lo}-${hi})`); };
    if (kind === 'bowUnstow') band(w7.bowReadyS, 0.30, 0.40, 'bow unstow');
    if (kind === 'lanceDraw') band(w7.lanceReadyS, 0.30, 0.40, 'lance draw');
    if (kind === 'click') band(w7.clickToSwingS, 0.25, 0.35, 'click to swing');
    if (kind === 'bowStow') band(w7.bowStowS, meta.tempo === 'timer' ? 0.43 : 0.30, meta.tempo === 'timer' ? 0.50 : 0.37, `bow stow (${meta.tempo})`);
    if (kind === 'lanceStow') band(w7.lanceStowS, meta.tempo === 'timer' ? 0.50 : 0.30, meta.tempo === 'timer' ? 0.57 : 0.37, `lance stow (${meta.tempo})`);
    if (kind === 'swap12') band(w7.lanceReadyS, 0.45, 0.65, 'swap 1 to 2');
    if (kind === 'swap21') band(w7.bowReadyS, 0.45, 0.65, 'swap 2 to 1');
  }
  // ---- W9 swap truth (at the case's end)
  if (kind === 'swap12' || kind === 'swap21') {
    const e = L[n - 1];
    const ok = kind === 'swap21' ? e.bowOwner === 'handL' && e.lanceOwner === 'carry' : e.lanceOwner === 'handR' && e.bowOwner === 'carry';
    out.W9 = { ok, end: { bow: e.bowOwner, lance: e.lanceOwner } };
    if (!ok) fail(`W9 ${kind} ended with the bow ${e.bowOwner}, the lance ${e.lanceOwner}`);
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
    // (the lance's guard turns her trunk by design (meleeLayer STANCE): the band is the draw's own reach additive, graded on
    //  the bow's unstow, where nothing else turns her)
    if (kind === 'bowUnstow') { if (sp < 5 || sp > 10) fail(`W11 spine yaw peak ${sp.toFixed(1)} deg (band 5-10)`); }
    if (hd > 3) fail(`W11 head yaw ${hd.toFixed(1)} deg (bar 3)`);
    if (pole > 25) fail(`W11 elbow pole ${pole.toFixed(1)} deg a step (bar 25)`);
  }
  return out;
}
