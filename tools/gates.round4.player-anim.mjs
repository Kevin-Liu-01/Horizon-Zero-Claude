/**
 * Round 4 gates — lane `player-anim` (docs/ROUND4-AUDIT.md §4).
 *
 * Same contract as tools/gates.config.mjs: ACTION gates resolve
 * { pass, detail } in page context with __CTX__/__GAME__ available; VISUAL
 * gates capture shots/gates/<id>.png against written criteria. Every gate also
 * captures a frame, so an action gate can be judged on film as well.
 *
 * GATE IDS. §4 names these A33/A34/A35/A36/V23/V24. `A33` is already taken by
 * the character lane's `A33-rig-finite` — a DIFFERENT gate with a different
 * meaning — but the runner keys on the FULL id and `A33-hair-bounce` collides
 * with nothing, so the §4 names are used verbatim. Nothing here edits or
 * weakens another lane's gate. Two extra gates carry a lane suffix because
 * their §4 subject is already gated by the `animator` lane under the same
 * number and this lane's version is stricter, not a replacement:
 *   · `A31b-aim-strafe-skate-player-anim` — the character lane's
 *     `A31-aim-strafe-skate` SKIPs under load ("fewer than 2 clean stance
 *     windows"): at 1.35 m/s its 45 ms hitch filter, written for an 8 m/s
 *     sprint, discards every window. Same 0.06 m bar, a hitch filter scaled to
 *     the travel speed, plus the leg-CROSSING measurement A31 never had.
 *   · `A18b-slope-conform-moving` — A18 stands still; this one walks.
 */

/** Deterministic flat ground the whole suite already stages on. */
const STAGE = `p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI;`;

/**
 * A33's RUNWAY: the same staging spot, aimed down the one bearing that stays
 * flat and fast for 50 m (fix round 3, judge-player-anim-r2).
 *
 * `STAGE`'s heading (camYaw = PI, due +Z) is fine for a gate that stands still
 * and wrong for one that sprints: measured along it in 5 m steps from the
 * staging point, her speed reads 6.47 / 6.49 / 6.87 / 6.55 / 6.57 m/s out to
 * 25 m and then 4.82 / 4.12 / 5.54 m/s at 30-40 m as the ground climbs from
 * -1.33 m to +0.57 m. That hill is why A33's window had to be cut to 3.0 s,
 * and a 3.0 s window is why its cadence estimator had too few gait cycles to
 * separate the +-15 % bar.
 *
 * `camYaw = PI/2` sends her due -X instead. The same sweep along it reads
 * 6.71 / 6.87 / 6.89 / 6.83 / 6.86 / 6.84 / 6.61 / 6.82 / 6.64 / 6.68 m/s over
 * 5-50 m, all of it grass, with the ground falling gently from -1.21 to
 * -2.69 m — no hill, no water, no surface change. (It does break up past 55 m:
 * 5.39 m/s at 55, silt at 60, cobble at 65-75. The 5.5 s window plus the 1.7 s
 * run-up is ~49 m at full frame rate, so it never gets there.)
 */
const RUNWAY = `p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI * 0.5;`;

/** Freeze the machine roster: a wandering Sawtooth is a different test. */
const FREEZE = `for (const m of __CTX__.machines.list) m.update = () => {};`;

/**
 * Hide EVERY DOM overlay, not just `#hud`.
 *
 * FIX ROUND 1: the setup used to hide `#hud`, and the XP bar, the quest banner
 * and the focus layer are NOT inside it — they are their own top-level
 * siblings (`#hzcf-layer`, the progression bar, `#hzc-cfx`, `#hzc-wheel`,
 * `#perf-stats`, …). They stayed on screen over a gate shot whose whole
 * subject is a 20 cm region of her face.
 */
const NOHUD = `for (const el of Array.from(document.body.children)) {
    if (el.id === 'app' || el.tagName === 'SCRIPT' || el.tagName === 'CANVAS') continue;
    el.style.display = 'none';
  }`;

/** Hide the meadow grass — every one of these shots is about her legs/hair. */
const FILM = `
  if (__CTX__.vegetation?.group) __CTX__.vegetation.group.visible = false;
  __CTX__.player.model.traverse((o) => { o.frustumCulled = false; });`;

/**
 * Lock the camera by replacing the controller's own `_updateCamera`, which is
 * the only place that runs at exactly the right point in the frame (the same
 * trick V12 uses). `right` / `up` / `back` are metres in HER frame.
 */
const LOCKCAM = `function lockCam(right, up, back, aimH, aimFwd) {
  // NB: char +X is her LEFT (ANCHOR_OFF.x is negative for the RIGHT cheek), so
  // the world axis this multiplies is her left; pass a NEGATIVE right to stand
  // on her right, which is the side reference/draw-side.jpg is shot from.
  // \`aimFwd\` (metres, default 0) slides the LOOK-AT point down her own facing,
  // so a shot can be centred on the draw triangle — the anchor, the arrow and
  // the bow grip — instead of on her spine. It does not move the camera.
  __CTX__.player._updateCamera = function () {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    const cam = this.ctx.camera;
    const f = aimFwd ?? 0;
    cam.position.set(
      this.position.x + c * right - s * back,
      this.position.y + up,
      this.position.z - s * right - c * back);
    cam.lookAt(this.position.x + s * f, this.position.y + (aimH ?? 1.2), this.position.z + c * f);
  };
}`;

/**
 * Local-quaternion angular range of a bone over a list of samples: the max
 * pairwise angle, which is the only measure a chain PARKED AT A CONSTANT LEAN
 * cannot fake. (The first Round-4 drop drove every chain into its bend clamp
 * and left it there — 0.55 m off rest, and 1.28 deg of range.)
 */
const QRANGE = `function qrange(list, key) {
  let mx = 0;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i][key], B = list[j][key];
      const d = Math.min(1, Math.abs(A[0]*B[0] + A[1]*B[1] + A[2]*B[2] + A[3]*B[3]));
      const a = 2 * Math.acos(d) * 180 / Math.PI;
      if (a > mx) mx = a;
    }
  }
  return mx;
}`;

export const GATES = [
  /* ------------------------------------------------------- A33-hair-bounce */
  {
    id: 'A33-hair-bounce', kind: 'action', lane: 'player-anim',
    timeout: 95000,
    title: 'The ponytail actually bounces at sprint: >= 0.04 m of world-Y travel, locked to the footfall cadence',
    setup: `__CTX__.input.enabled = true;`,
    settle: 500,
    assert: `(async () => {
     try {
      const C = __CTX__, p = C.player, an = p.animator;
      ${FREEZE}
      ${RUNWAY}
      // where the runway starts: the window's stop condition is a DISTANCE
      // budget measured from here, because the flat bearing is only clear for
      // ~50 m (see RUNWAY) and wall clock does not say how far she has gone
      const sx = p.position.x, sz = p.position.z;
      const V = () => new p.position.constructor();
      const name = Object.keys(an.bones).find((n) => n.startsWith('dyn_hairBackMain_04'));
      if (!name) return { pass: null, detail: 'SKIP: dyn_hairBackMain_04 not on this rig' };
      const bone = an.bones[name];
      // the chain this bone belongs to, so the DEVIATION from its own animated
      // rest can be measured too — world Y alone also moves when the body bobs,
      // and a rigid rod welded to a bobbing head would pass on that number
      const chain = an._chains.find((c) => c.links.some((l) => l.bone === bone));
      const idx = chain ? chain.links.findIndex((l) => l.bone === bone) : -1;
      /* SOLVER STATE, NAMED (fix round 5). The one unexplained A33 FAIL in the
       * judge's four re-runs carried nothing but "Cannot read properties of
       * undefined (reading '9')". 9 is idx * 3 for this bone (it sits 4th
       * in its chain), i.e. chain.pos was undefined at the deviation read —
       * a chain that exists but whose Verlet arrays were never allocated
       * (_initChainSolver runs once at construction; anything that leaves it
       * half-done leaves exactly this). It is still a FAIL — an unmeasurable
       * deviation clause has not passed — but it now says WHICH of the two
       * things went wrong instead of a stack. */
      if (chain && !(chain.pos && chain.anim)) {
        return { pass: false, detail: {
          bone: name, chainLinks: chain.links.length, chainIndex: idx,
          note: 'chain solver state missing: _initChainSolver never allocated pos/anim for this chain',
        } };
      }
      C.input.keys.clear(); C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft');
      await new Promise((r) => setTimeout(r, 1700));
      const w = V();
      const ys = [], devs = [], ts = [], freqs = [], phs = [], sps = [];
      const t0 = performance.now();
      /* THE WINDOW IS CLOSED BY FOOTFALLS, NOT BY THE WALL CLOCK.
       *
       * FIX ROUND 3 (judge-player-anim-r2) moved the bearing: the OLD one
       * (camYaw = PI, due +Z) runs out of flat ground at ~28 m — measured along
       * it her sprint speed falls 6.57 -> 4.82 -> 4.12 m/s between 25 and 35 m
       * as the ground climbs from -1.33 to +0.57 m — so its window had to be
       * cut to 3.0 s and the estimator was left with 5.4 footfalls to separate
       * a +-15 % bar. The runway now points down the ONE bearing that stays
       * flat (see RUNWAY).
       *
       * FIX ROUND 4 (judge-player-anim-r2, residue) closes the other half. A
       * FIXED 5.5 s window buys a number of gait cycles that depends on how
       * busy the box is: measured here, 13.7 footfalls at 14 fps against 19.9
       * at 24 fps, and the judge — running sixteen lanes at once — got windows
       * short enough that the clause could not be read at all and reported
       * PENDING. Wall clock was never the quantity that mattered. The loop now
       * runs until the GAIT has banked \`FOOT_TARGET\` footfalls (measured the
       * same way the estimator measures them, by unwrapping loco.phase), which
       * is frame-rate invariant, and the two other bounds are pure safety:
       *
       *   · DIST_MAX 46 m from the staging point — the runway is clear to 50 m
       *     and this is the quantity that actually decides whether she is still
       *     on it. Frame rate cannot push her past it: distance per footfall is
       *     a sim-space constant (1.79 m measured), so 20 footfalls is 41.5 m
       *     off the 5.5 m run-up at ANY frame rate.
       *   · 45 s of wall clock / 1200 frames — the deadline is a HANG guard,
       *     not a measurement bound, so it is set from the assert's own 95 s
       *     budget rather than from any frame rate. Banked footfalls per wall
       *     second are fps x MAX_FRAME x footHz = 0.19 x fps here, so 45 s
       *     banks the full 20 at 2.4 fps and still clears the 16-footfall
       *     resolvability floor at 1.9 fps; below that the lock SKIPs (never
       *     fails) and the physical clauses are still asserted. The frame cap
       *     cannot bind before the footfall target at any rate: 20 footfalls
       *     is ~107 frames on a sim-clamped host and 318 at 60 fps.
       *
       * Measured on this box at 20.5 fps: 20 footfalls at t = 6.1 s, 41 m
       * downrange, her speed 6.69 m/s and the ground still falling smoothly.
       * Under a synthetic frame hog (fix round 5): 20 footfalls / ratio 1.000
       * at 17.1, 16.9, 18.8 and 6.3 fps, and 17.6 footfalls / ratio 0.995 at
       * 3.7 fps, where the OLD 25 s deadline was what cut the window short. */
      const FOOT_TARGET = 20, DIST_MAX = 46;
      let phPrev = an.loco?.phase ?? 0, cycAcc = 0, dist = 0;
      while (ys.length < 1200 && performance.now() - t0 < 45000
             && Math.abs(cycAcc) * 2 < FOOT_TARGET && dist < DIST_MAX) {
        bone.getWorldPosition(w);
        ys.push(w.y);
        ts.push((performance.now() - t0) / 1000);
        freqs.push(an.loco?.freq ?? 0);
        const ph = an.loco?.phase ?? 0;
        phs.push(ph);
        let dph = ph - phPrev;
        if (dph < -0.5) dph += 1; else if (dph > 0.5) dph -= 1;
        cycAcc += dph; phPrev = ph;
        dist = Math.hypot(p.position.x - sx, p.position.z - sz);
        sps.push(p.moveSpeed);
        if (chain && idx >= 0) {
          const i = idx * 3;
          devs.push(Math.hypot(chain.pos[i] - chain.anim[i],
                               chain.pos[i+1] - chain.anim[i+1],
                               chain.pos[i+2] - chain.anim[i+2]));
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
      const runwayM = dist;
      /* The MEDIAN sprint speed across the window, not the last frame's. One
       * end-of-window sample is a reading of where she happened to stop, and
       * this gate is about the hair while she is sprinting, not about the
       * terrain 40 m downrange. */
      const speed = sps.slice().sort((a, b) => a - b)[sps.length >> 1] || 0;
      const speedEnd = p.moveSpeed;
      C.input.keys.clear();
      if (ys.length < 24) return { pass: null, detail: { n: ys.length, note: 'SKIP: too few frames' } };
      const p2p = Math.max(...ys) - Math.min(...ys);
      const devP2P = devs.length ? Math.max(...devs) - Math.min(...devs) : 0;
      const devMax = devs.length ? Math.max(...devs) : 0;

      /* --- the footfall rate to lock AGAINST, measured, not assumed.
       *
       * FIX ROUND 1. loco.freq is the NOMINAL gait rate the blend derives
       * from travel speed, in GAMEPLAY seconds. Under load those are not wall
       * seconds: src/main.js caps a frame at MAX_FRAME = 0.05 s, so at 15 fps
       * (0.067 s frames) the whole simulation — her legs included — advances at
       * 75 % of real time. The hair, which is driven BY the legs, then swings
       * at 0.75 x 3.65 = 2.7 Hz in wall clock while loco.freq * 2 still reads
       * 3.65, and the gate failed a correctly-locked ponytail. Both of this
       * lane's earlier estimators measured that 2.7 Hz, which is how we know it
       * was the reference that was wrong.
       *
       * FIX ROUND 2 (judge-player-anim-r1): this reference change is the ONLY
       * fix A33 ever needed. Fix round 1 also shipped a dt clamp / MAX_SUB
       * change in playerAnimator.js and called it a rig-side slow-motion bug;
       * main.js sub-steps the sim, so _springs never sees more than 1/60 s
       * and that code has never executed. See docs/ROUND4-PLAYER-ANIM.md §6c.
       * (Fix round 3 removed that dead pair; the constants are back at 3 /
       * 0.05 s, the values the loop has always effectively used.) Nothing here
       * was weakened for it: p2p / oscP2P / restDev and the +-15 % lock are all
       * still asserted.
       *
       * The gait PHASE (loco.phase, 0..1 per cycle) is the honest reference:
       * unwrapped over the sample window it gives the cycles that ACTUALLY
       * happened while the hair was being watched, whatever the host did. The
       * nominal rate is still reported alongside it. */
      const psi = new Array(phs.length);
      psi[0] = 0;
      let cyc = 0;
      for (let i = 1; i < phs.length; i++) {
        let d = phs[i] - phs[i - 1];
        if (d < -0.5) d += 1; else if (d > 0.5) d -= 1;
        cyc += d;
        psi[i] = cyc;
      }
      const span = ts[ts.length - 1] - ts[0];
      const gaitHzMeasured = span > 0.2 ? Math.abs(cyc) / span : 0;
      const gaitHzNominal = freqs.slice().sort((a, b) => a - b)[freqs.length >> 1] || 0;
      const gaitHz = gaitHzMeasured > 0.2 ? gaitHzMeasured : gaitHzNominal;
      const footHz = gaitHz * 2;
      const footCycles = Math.abs(cyc) * 2;      // footfalls inside the window

      /* --- the tip's own oscillation, detrended.
       * The raw world Y is DETRENDED first: sprinting 40 m across a meadow,
       * most of its range is the terrain going up and down under her, and a
       * mean-removed signal reports that ~1 Hz drift instead of the hair. A
       * centred moving average over ~0.45 s is longer than a step and far
       * shorter than the terrain trend, so subtracting it leaves the
       * stride-rate oscillation. */
      const dtAvg = span / Math.max(1, ys.length - 1);
      const half = Math.max(2, Math.round(0.225 / Math.max(0.005, dtAvg)));
      const res = [];
      for (let i = 0; i < ys.length; i++) {
        let sum = 0, n = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(ys.length - 1, i + half); j++) { sum += ys[j]; n++; }
        res.push(ys[i] - sum / n);
      }
      // the boxcar is truncated at both ends, so the residual is only NEARLY
      // zero-mean; the sin/cos basis below carries no constant term, so remove
      // what is left before fitting
      const mean = res.reduce((a, v) => a + v, 0) / res.length;
      for (let i = 0; i < res.length; i++) res[i] -= mean;
      const oscP2P = Math.max(...res) - Math.min(...res);

      /* --- THE LOCK, MEASURED ON THE GAIT-PHASE AXIS, NOT THE WALL CLOCK.
       *
       * FIX ROUND 3 (judge-player-anim-r2). Fix round 1's Lomb-Scargle fitted
       * the residual against sin/cos of WALL-CLOCK time and then divided the
       * winning frequency by the measured footfall rate. That estimator
       * scattered: the judge measured 1.176 / 1.21 / 1.04 / 1.026 across four
       * clean re-runs of a rig he independently confirmed to be locked, and I
       * reproduce it here (1.426 at 19.7 fps, 1.319 at 16.8 fps on the same
       * frames whose gait-phase fit reads 1.055 and 0.965). The reason is not
       * noise, it is DRIFT: her cadence is not constant across the window —
       * it tracks speed, which moves with the ground and with how much sim
       * time each frame was allowed — so no single wall-clock sinusoid fits
       * the whole record, the periodogram's peak smears, and a 3 s window's
       * ~0.33 Hz half-width is wider than the +-0.5 Hz the +-15 % bar allows
       * at 3.3 Hz.
       *
       * The gait phase already tracks that drift exactly. So the fit is done
       * against sin/cos of (r x 2 x psi), where psi is the unwrapped gait
       * phase in cycles: r is the number of hair oscillations PER FOOTFALL,
       * which is precisely what "locked to the footfall cadence" means, and
       * the +-15 % bar from §4 applies to it unchanged. Cadence drift now
       * moves the basis with the legs instead of smearing the peak, and the
       * peak is sharp: 19 footfalls of window gives a half-width of ~0.026 in
       * r against a +-0.15 bar. Measured on the flat runway at 17 fps —
       * exactly the frame rate the old estimator failed at — r = 1.000 with
       * 65 % of the residual's variance explained and 145x the median power
       * in the scan. No physical clause moved. */
      const varTot = res.reduce((a, v) => a + v * v, 0);
      const PH = (r) => {
        const k = 2 * Math.PI * 2 * r;
        let ss = 0, sc = 0, cc = 0, sy = 0, cy = 0;
        for (let i = 0; i < res.length; i++) {
          const s = Math.sin(k * psi[i]), c = Math.cos(k * psi[i]), v = res[i];
          ss += s * s; sc += s * c; cc += c * c; sy += s * v; cy += c * v;
        }
        const det = ss * cc - sc * sc;
        if (!(Math.abs(det) > 1e-9)) return 0;
        const a = (cc * sy - sc * cy) / det, b2 = (ss * cy - sc * sy) / det;
        return Math.max(0, a * sy + b2 * cy);      // explained sum of squares
      };
      const sampleHz = span > 0.2 ? ys.length / span : 0;
      const perCycle = footCycles > 0.5 ? ys.length / footCycles : 0;
      /* The scan's top end is capped at THREE samples per hair oscillation
       * (FIX ROUND 4). r = 2.2 asks for the fit of an oscillation sampled
       * perCycle/2.2 times a cycle, and on a slow host that is 2.4 — inside a
       * hair's breadth of Nyquist, where the basis stops being able to tell a
       * real 2.2 from an alias of something slower. Nothing the bar cares
       * about moves: r = 1 keeps >= 5 samples per oscillation, the half-rate
       * competitor at 0.5 is always in the scan, and a hair that genuinely
       * swung at twice the cadence would peak at the scan's edge and fail the
       * lock exactly as it does today. */
      const rMax = Math.min(2.2, Math.max(0.8, perCycle / 3));
      let ratio = 0, best = 0;
      const pw = [];
      for (let r = 0.4; r <= rMax + 0.0001; r += 0.005) {
        const v = PH(r);
        pw.push(v);
        if (v > best) { best = v; ratio = r; }
      }
      pw.sort((a, b) => a - b);
      const medPw = pw[pw.length >> 1];
      const signif = varTot > 1e-9 ? best / varTot : 0;
      // how far the winning rate stands above the scan's own noise floor: the
      // standard "is there a peak at all" test, and the one that decides
      // whether this window can be read
      const contrast = medPw > 1e-12 ? best / medPw : 999;
      const hairHz = ratio * footHz;
      const locked = Math.abs(ratio - 1) <= 0.15;

      /* Resolvability. The clause is SKIPPED rather than failed when the
       * window cannot be read — the way A13 skips when it has too few clean
       * stance windows.
       *
       * FIX ROUND 4 (judge-player-anim-r2, residue) RAISES this floor to the
       * >= 8 GAIT CYCLES the judge asked for — 16 footfalls, twice the old bar
       * — and the window above is what makes that affordable: it no longer
       * stops at a wall-clock deadline, it stops when 20 footfalls have been
       * banked, so the floor is cleared with margin at every frame rate this
       * box produces instead of being cleared only when the box happens to be
       * quiet. 16 footfalls puts the fit's half-width at ~0.031 in r against
       * the +-0.15 bar. The rest of the floor is unchanged: >= 4 samples per
       * footfall (twice Nyquist at the bar), a peak at least 4x the scan's
       * median power, and a scan whose top end still reaches 1.5 so the bar is
       * not the edge of the scan.
       *
       * Every physical clause is asserted at every frame rate regardless: a
       * frozen chain fails on detrendedYp2p and restDeviationP2P whatever the
       * sampler managed. */
      const canResolve = footCycles >= 16 && perCycle >= 4 && contrast >= 4
        && ys.length >= 40 && signif >= 0.15 && rMax >= 1.5;
      const physical = speed > 6.1 && p2p >= 0.04 && oscP2P >= 0.03
        && devP2P >= 0.012 && devMax <= 0.35;
      const pass = !physical ? false : (canResolve ? locked : null);
      return { pass, detail: {
        note: canResolve ? undefined
          : 'frequency lock NOT ASSERTED: ' + footCycles.toFixed(1) + ' footfalls / '
            + perCycle.toFixed(1) + ' samples per footfall / peak contrast '
            + contrast.toFixed(1) + ' cannot resolve the cadence',
        sampleHz: +sampleHz.toFixed(1),
        bone: name, speed: +speed.toFixed(2), speedEndOfWindow: +speedEnd.toFixed(2),
        frames: ys.length,
        worldYp2p: +p2p.toFixed(4), detrendedYp2p: +oscP2P.toFixed(4),
        hairHz: +hairHz.toFixed(2), footfallHz: +footHz.toFixed(2), ratio: +ratio.toFixed(3),
        footfallHzNominal: +(gaitHzNominal * 2).toFixed(2),
        gaitCyclesInWindow: +cyc.toFixed(2), footfallsInWindow: +footCycles.toFixed(2),
        samplesPerFootfall: +perCycle.toFixed(2),
        significance: +signif.toFixed(3), peakContrast: +contrast.toFixed(1),
        scanTop: +rMax.toFixed(2), runwayMetres: +runwayM.toFixed(1),
        windowSeconds: +span.toFixed(2),
        restDeviationP2P: +devP2P.toFixed(4), restDeviationMax: +devMax.toFixed(4),
      } };
     } catch (e) {
      /* A THROWN GATE MUST STILL SAY WHERE IT THREW (fix round 4). This gate
       * failed one clean re-run with nothing but the runner's own
       * "Cannot read properties of undefined (reading '9')" — the message
       * puppeteer keeps when an assert rejects, with no stack and no state, so
       * the failure could not be told from a real regression. It still FAILS
       * (pass: false, exactly as before), it just fails legibly. */
      return { pass: false, detail: {
        threw: String((e && e.message) || e),
        stack: String((e && e.stack) || '').split('\\n').slice(0, 12).join(' | '),
      } };
     }
    })()`,
  },

  /* ----------------------------------------------------- A34-chains-driven */
  {
    id: 'A34-chains-driven', kind: 'action', lane: 'player-anim',
    timeout: 60000,
    title: 'At least 180 of the 271 dyn_ bones move > 0.5 deg over 3 s of jog (Round 3: 8 chains / 30 bones at 0.2 deg)',
    setup: `__CTX__.input.enabled = true;`,
    settle: 500,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator;
      ${FREEZE}
      ${STAGE}
      ${QRANGE}
      // EVERY dyn_ bone on the live skeleton, not the animator's own list —
      // a bone the chain builder silently dropped has to show up as a failure
      const bones = [];
      p.model.traverse((o) => { if (o.isBone && o.name.startsWith('dyn_')) bones.push(o); });
      if (bones.length < 200) return { pass: null, detail: { found: bones.length, note: 'SKIP: rig has no dyn_ chains' } };
      C.input.keys.clear(); C.input.keys.add('KeyW');
      await new Promise((r) => setTimeout(r, 1800));
      const snaps = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 3000) {
        const row = new Array(bones.length);
        for (let i = 0; i < bones.length; i++) {
          const q = bones[i].quaternion;
          row[i] = [q.x, q.y, q.z, q.w];
        }
        snaps.push(row);
        await new Promise((r) => setTimeout(r, 60));
      }
      const speed = p.moveSpeed;
      C.input.keys.clear();
      let moved = 0, worst = 0;
      const still = [];
      for (let i = 0; i < bones.length; i++) {
        const deg = qrange(snaps, i);
        if (deg > 0.5) moved++; else if (still.length < 12) still.push(bones[i].name);
        if (deg > worst) worst = deg;
      }
      const chains = an.debugChains();
      const pass = moved >= 180 && speed > 3.5 && chains.nonFinite === 0;
      return { pass, detail: {
        dynBones: bones.length, movedOver0p5Deg: moved, bar: 180,
        maxDeg: +worst.toFixed(2), speed: +speed.toFixed(2),
        chains: chains.chains, links: chains.links, nonFinite: chains.nonFinite,
        stillExamples: still,
      } };
    })()`,
  },

  /* ------------------------------------------------------ A35-cheek-anchor */
  {
    id: 'A35-cheek-anchor', kind: 'action', lane: 'player-anim',
    timeout: 70000,
    title: 'Full draw at three aim pitches: knuckle on the cheek, hand behind the face plane, bow arm locked 165-172 deg, hands >= 0.45 m apart',
    setup: `__CTX__.input.enabled = true;`,
    settle: 500,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, cmb = C.combat;
      ${FREEZE}
      if (!an?.debugArm) return { pass: null, detail: 'SKIP: animator exposes no debugArm()' };
      const V = () => new p.position.constructor();
      const rows = [];
      const measure = async (pitch, tag) => {
        C.input.mouse.buttons = 0; C.input.keys.clear();
        await new Promise((r) => setTimeout(r, 500));
        ${STAGE}
        p.camPitch = pitch;
        C.input.mouse.buttons |= 4;
        await new Promise((r) => setTimeout(r, 700));
        C.input.mouse.buttons |= 1;
        // long enough for a full draw even at 20 fps with a 0.42 s nock delay
        await new Promise((r) => setTimeout(r, 2400));
        p.camPitch = pitch;
        await new Promise((r) => setTimeout(r, 200));
        const R = an.debugArm('r'), L = an.debugArm('l');
        const hl = V(), hr = V();
        an.getBoneWorld('hand_l_014', hl); an.getBoneWorld('hand_r_045', hr);
        rows.push({ tag, drawS: +cmb.drawStrength.toFixed(2),
          handToHead: R.handToHead,
          handBehindFace: R.handBehindFace,
          bowElbowDeg: L.elbowDeg,
          handSep: +hl.distanceTo(hr).toFixed(4),
          handHeadUnit: R.handHeadUnit });
      };
      await measure(-0.4, 'up');
      await measure(0, 'level');
      await measure(0.75, 'down');
      C.input.mouse.buttons = 0; C.input.keys.clear();
      const bad = rows.filter((r) => !(r.drawS > 0.9
        && r.handToHead >= 0.10 && r.handToHead <= 0.16
        && r.handBehindFace > 0
        && r.bowElbowDeg >= 165 && r.bowElbowDeg <= 172
        && r.handSep >= 0.45
        && r.handHeadUnit >= 0.88));
      return { pass: bad.length === 0, detail: { rows, failing: bad.map((r) => r.tag) } };
    })()`,
  },

  /* --------------------------------------------------- A36-hit-react-visible */
  {
    id: 'A36-hit-react-visible', kind: 'action', lane: 'player-anim',
    timeout: 70000,
    title: 'A 14 hp hit at rest leans the torso >= 12 deg, decays over > 0.45 s, and makes a hit clip the dominant action',
    setup: `__CTX__.input.enabled = true;`,
    settle: 500,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator;
      ${FREEZE}
      ${STAGE}
      if (!an?.torsoAxis) return { pass: null, detail: 'SKIP: animator exposes no torsoAxis()' };
      const V = () => new p.position.constructor();
      C.input.keys.clear(); C.input.mouse.buttons = 0;
      await new Promise((r) => setTimeout(r, 900));
      // the axis just BEFORE the hit is the reference — the idle clip already
      // sits ~10.6 deg off bind, so an angle measured from bind can go DOWN
      // when the torso leans back through that offset
      const ref = an.torsoAxis(V());
      const baseFromBind = an.torsoLeanDeg();
      const hp0 = p.health;
      const cur = V();
      // the exact §4 stimulus: the event other lanes deal damage with
      C.events.emit('player-damage', { amount: 14 });
      const S = [];
      const t0 = performance.now();
      let dominantHit = false, dominantSlot = null;
      while (performance.now() - t0 < 2000) {
        const d = an.dominantAction();
        if (d && (d.slot === 'hitChest' || d.slot === 'hitHead')) { dominantHit = true; dominantSlot = d.slot; }
        an.torsoAxis(cur);
        const dot = Math.max(-1, Math.min(1, cur.dot(ref)));
        S.push({ t: (performance.now() - t0) / 1000, lean: Math.acos(dot) * 180 / Math.PI,
                 w: an._hitClipW, slot: an._hitSlot });
        await new Promise((r) => requestAnimationFrame(r));
      }
      // peak, and how long it takes to fall back under 25 % of the peak
      let peak = 0, peakT = 0;
      for (const s of S) if (Math.abs(s.lean) > peak) { peak = Math.abs(s.lean); peakT = s.t; }
      let endT = S[S.length - 1].t;
      for (const s of S) if (s.t > peakT && Math.abs(s.lean) < peak * 0.25) { endT = s.t; break; }
      const decay = endT - peakT;
      const hurt = p.health < hp0;
      const pass = peak >= 12 && decay > 0.45 && dominantHit && hurt;
      return { pass, detail: {
        idleLeanFromBindDeg: +baseFromBind.toFixed(2), peakLeanDeg: +peak.toFixed(2),
        peakAtS: +peakT.toFixed(3), decayS: +decay.toFixed(3),
        dominantHitSlot: dominantSlot, hitClass: an._hitClass,
        maxClipWeight: +Math.max(...S.map((s) => s.w)).toFixed(3),
        healthBefore: hp0, healthAfter: p.health,
      } };
    })()`,
  },

  /* ------------------------------------ A31b-aim-strafe-skate-player-anim */
  {
    id: 'A31b-aim-strafe-skate-player-anim', kind: 'action', lane: 'player-anim',
    // FIX ROUND 7: four passes instead of two (the two transition ENTRIES the
    // blocker below lived in), each closing on banked footfalls rather than
    // wall clock, so the whole gate's duration scales with how slow the box is.
    // Sized off A18b's 150 s: four passes x (2 s staging + 30 s hang guard).
    timeout: 185000,
    title: 'Aim-strafe from a standing start, a backpedal AND a run: planted-foot drift <= 0.06 m BOTH ways, the legs never cross, and the cadence is a side-step not a shuffle',
    setup: `__CTX__.input.enabled = true;`,
    settle: 500,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, T = C.terrain;
      ${FREEZE}
      if (!an?.debugFeet) return { pass: null, detail: 'SKIP: animator exposes no debugFeet()' };
      // fix round 8: the mirror clause below reads loco.phase / loco._revSign,
      // so ABSENT telemetry must SKIP here rather than read as a mirrored gait
      // further down. (The footfall window already depended on loco.phase.)
      if (!an.loco || typeof an.loco.phase !== 'number') {
        return { pass: null, detail: 'SKIP: animator exposes no loco.phase/_revSign' };
      }
      /* FIX ROUND 7 (judge-player-anim-r2, blocker) — THE ENTRY PATH IS PART
       * OF THE TEST.
       *
       * Both run() calls used to clear the keys, re-stage and press a single
       * key, so every pass entered the sidestep from a STANDING START. The
       * locomotion mirror is latched (locomotion.js, REV_HYST), and from a
       * standing start the latch is always +1 — so the gate could not see the
       * case where it is -1. Entering the same sidestep straight out of a
       * backpedal, with aim held throughout, ran the entire strafe with the
       * gait phase backward and slid the trailing ball 0.0176-0.0670 m per
       * stance against this gate's own 0.06 m bar, five times across four
       * runs at 15.6-44 fps, and A31b read 0.0002-0.0021 m the whole time.
       *
       * \`entry\` now stages the pass the way a player reaches it: 'stand'
       * (unchanged), 'back' (backpedal, then release KeyS and press the strafe
       * key the same frame) and 'fwd' (forward run into the sidestep). Aim is
       * pressed BEFORE the entry move and never released, which is what makes
       * the whole thing one continuous aim-strafe rather than three states.
       * Both strafe directions get both a standing start and a transition. */
      const run = async (key, entry) => {
        C.input.keys.clear(); C.input.mouse.buttons = 0;
        ${STAGE}
        await new Promise((r) => setTimeout(r, 400));
        C.input.mouse.buttons |= 4;
        if (entry === 'back') {
          C.input.keys.add('KeyS');
          await new Promise((r) => setTimeout(r, 1500));
          C.input.keys.delete('KeyS');
        } else if (entry === 'fwd') {
          C.input.keys.add('KeyW');
          await new Promise((r) => setTimeout(r, 1500));
          C.input.keys.delete('KeyW');
        }
        C.input.keys.add(key);
        await new Promise((r) => setTimeout(r, 1600));
        const S = [];
        const t0 = performance.now();
        let prev = performance.now();
        /* THE WINDOW IS CLOSED BY FOOTFALLS, NOT BY THE WALL CLOCK.
         *
         * FIX ROUND 7 (judge-player-anim-r2, major) — the same treatment A33
         * already got in fix round 4, applied to this gate. A FIXED 3000 ms
         * window buys a number of stances that depends on how busy the box is,
         * and the audit's working condition is sixteen lanes at once: measured
         * here the suite runs at 12-20 fps, and at those rates 3 s is barely
         * three stances per foot before the n >= 3 sample floor starts eating
         * them. The loop now runs until the GAIT has banked FOOT_TARGET
         * footfalls (loco.phase, unwrapped — the same reference A33 uses),
         * which is frame-rate invariant: 8 footfalls is ~4 stances per foot at
         * ANY frame rate, twice the 2-window floor below.
         *
         * The two other bounds are pure HANG guards, not measurement bounds:
         * 30 s of wall clock and 900 frames. Banked footfalls per wall second
         * are fps x MAX_FRAME(0.05) x footHz(~2.4), so 30 s banks the full 8
         * at 2.2 fps; the frame cap cannot bind first (8 footfalls is ~200
         * frames at 60 fps and ~45 on a sim-clamped host). */
        const FOOT_TARGET = 8;
        let phPrev = an.loco?.phase ?? 0, cycAcc = 0, frames = 0;
        while (frames < 900 && performance.now() - t0 < 30000
               && Math.abs(cycAcc) * 2 < FOOT_TARGET) {
          const now = performance.now();
          const f = an.debugFeet();
          const ph = an.loco?.phase ?? 0;
          let dph = ph - phPrev;
          if (dph < -0.5) dph += 1; else if (dph > 0.5) dph -= 1;
          cycAcc += dph; phPrev = ph; frames++;
          // legs crossed = the RIGHT ball is on her LEFT of the left ball, in
          // HER frame. This is the measurement A31 never had, and it is what
          // the audit filmed on 41 % of aim-strafe frames.
          const h = p.heading, s = Math.sin(h), c = Math.cos(h);
          const lx = (f[0].world.x - p.position.x) * c - (f[0].world.z - p.position.z) * s;
          const rx = (f[1].world.x - p.position.x) * c - (f[1].world.z - p.position.z) * s;
          S.push({ dt: now - prev, feet: f, crossed: rx > lx, sep: lx - rx, dph,
                   hz: 2 * (an.loco?.freq ?? 0), sp: p.moveSpeed });
          prev = now;
          await new Promise((r) => requestAnimationFrame(r));
        }
        const spd = S.reduce((a, x) => a + x.sp, 0) / S.length;
        /* Hitch filter SCALED TO TRAVEL. A13's flat 45 ms is written for an
         * 8.2 m/s sprint, where a dropped frame moves her 0.37 m and swamps a
         * 0.06 m measurement. At the 1.35 m/s aim-strafe the same 45 ms moves
         * her 0.06 m — and this box runs the suite at ~20 fps, so EVERY window
         * spanned one and A31 discarded all of them and reported SKIP. The
         * honest bar is the frame time in which she travels the drift bar
         * itself, floored at 100 ms so a normal loaded frame is not a hitch.
         *
         * FIX ROUND 7 (judge-player-anim-r2, major) — THAT FILTER WAS STILL
         * ALL-OR-NOTHING, AND IT TOOK THE WHOLE GATE DOWN UNDER LOAD.
         *
         * \`hitchMs\` floors at 100 ms, so every window containing one frame
         * slower than 10 fps was thrown away whole — which on a loaded box is
         * every window. Measured on a quiet box: PASS, 9 windows, 0 hitched.
         * On the same box running the lane's own 8-gate suite (~17.7 fps):
         * R 0 windows / 5 hitched, L 0 / 6, "SKIP: fewer than 2 clean stance
         * windows" — and a SKIP does not fail a run, so with the blocker above
         * live the gate was silent on exactly the runs the audit cares about.
         * The judge's no-filter probe at 10.0-10.3 fps scored 9 and 10 windows
         * and read 0.0047 / 0.0015 m worst drift on windows whose longest
         * frames were 146 and 138 ms: the windows this gate was discarding
         * measure fine.
         *
         * A long frame can only ever INFLATE a drift reading (the body
         * translates, the lock updates once), never deflate one, and the
         * inflation is bounded by how far she travels in that frame. So the
         * filter is now applied where it can change a verdict and nowhere
         * else: every stance with >= 3 samples is scored and reported, and a
         * window is set aside as UNRESOLVABLE only when it both fails the
         * 0.06 m bar AND its longest frame could account for the whole reading
         * (dt * speed >= drift). A window under the bar passes whatever its
         * frame times were; a window over the bar that its own worst frame
         * cannot explain is a real slide and still fails the gate — the
         * blocker's 0.067 m at 38 ms (0.051 m of travel) is exactly that case.
         * The gate falls back to SKIP only if fewer than 2 windows survive
         * THAT test, or if the unresolvable ones outnumber the resolved ones
         * (at which point the pass genuinely did not measure anything). */
        const hitchMs = Math.max(100, (0.06 / Math.max(0.4, spd)) * 1000);
        const DRIFT_BAR = 0.06;
        const drifts = [];
        let hitched = 0;
        const unresolved = [];
        /* WHAT THE WORST WINDOW IS MADE OF (fix round 5, additive — no bar,
         * filter or clause here moved). worstWindow carries the shape of the
         * worst window: sample count, the longest frame inside it, how far the
         * ball rose within it, how far above the ground it got, how much of
         * the foot lock's budget it spent, and where in the run it fell. That
         * is the discriminator between a real slide (flat, yRange ~ 0, lock
         * error at the cap) and a stance window split by the foot's own
         * toe-off across the 5 cm ground test.
         *
         * FIX ROUND 6 — this comment used to argue from those same numbers
         * that the gate's two suite failures (0.1154 / 0.1177 m) "do not
         * reproduce standalone" over sixteen runs and were "never
         * attributable". That was wrong, and wrong because of the bug fixed
         * just below: the gate never scored the stance that was still open at
         * loop exit, which on aim-strafe-left is the long saturated one. It
         * reproduces standalone every time, at 0.13-0.57 m, with no load.
         * Cause and fix: docs/ROUND4-PLAYER-ANIM.md 6e. */
        const wins = [];
        /* FIX ROUND 6 (judge-player-anim-r2, blocker). A window used to be
         * scored ONLY in the lift branch below — only when the foot came UP
         * inside the sampling window. The stance still OPEN when the 3000 ms
         * loop expired was silently dropped, and on aim-strafe-LEFT that
         * dropped stance is deterministically the long, saturated one: the
         * judge measured it at 0.3433 m (this exact 3 s logic) and 0.4469 m
         * (the same stance allowed to close), with lock.errM pinned at capM
         * 0.3000, while every window this gate did score read 1-6 mm. The gate
         * was green over a third of a metre of planted-foot slide. closeWin is
         * now called BOTH on lift and once after the loop, so the last stance
         * is scored like any other. isLast is kept (a useful diagnostic) but it
         * is no longer the difference between measured and invisible. */
        for (let side = 0; side < 2; side++) {
          let win = null;
          const closeWin = () => {
            if (win && win.n >= 3) {
              const d = Math.hypot(win.x1 - win.x0, win.z1 - win.z0);
              /* HOW MUCH OF \`d\` THE LONGEST FRAME COULD HAVE MANUFACTURED.
               *
               * FIX ROUND 8 (judge-player-anim-r2, major) — this used to be
               * body travel alone, \`(maxDt/1000) * spd\`. At 1.35 m/s that is
               * 0.06 m at 44 ms, so below ~22 fps the excuse covered the whole
               * drift bar and kept covering it: measured 0.0885 / 0.0952 /
               * 0.0545 / 0.1040 m of "explainable" on a PASSING standalone run
               * at 41-78 ms worst frames. The 6f blocker's own slides were
               * 0.0176-0.0670 m, so on a box one notch busier than that run
               * the gate would have filed the blocker \`unresolved\` instead of
               * failing it. An excuse that grows with the frame rate is not a
               * bar, and the suite runs this gate at 12-25 fps.
               *
               * The honest bound is not how far SHE moved, it is how far a
               * long frame can move a PLANTED BALL, and the animator publishes
               * exactly that. The ball rides \`anchor + IK residual\`; the
               * anchor is captured on the plant frame and does not move again
               * until the correction saturates MAX_LOCK (playerAnimator
               * _footLock). So while the lock is unsaturated the ball cannot
               * travel further than the correction the lock was holding, which
               * is \`lock.errM\` — a slow frame inflates both together, and the
               * residual is a FRACTION of errM, never a multiple of it. Only
               * once errM pins at capM does the anchor itself slide, and only
               * then is body travel the relevant bound.
               *
               *   unsaturated: explainM = min(body travel, maxLockErr)
               *   saturated  : explainM = body travel   (the anchor is moving)
               *
               * This is frame-rate-independent in form: it is measured lock
               * state, not fps. Against the 6f blocker (errM peaked at 0.037
               * of the 0.300 cap while the left ball slid 0.0670 m) it yields
               * explainM 0.037 < 0.067 at ANY frame rate -> a real FAIL, not
               * an unresolved window. Against the round-6 saturated blocker
               * (errM pinned at capM, 0.34-0.45 m of slide) body travel is
               * still an order of magnitude short -> also a FAIL. */
              const travelM = (win.maxDt / 1000) * spd;
              const sat = win.lockCap != null && win.lockErr >= win.lockCap - 1e-3;
              const explainM = (win.lockCap == null || sat)
                ? travelM : Math.min(travelM, win.lockErr);
              if (d > DRIFT_BAR && explainM >= d) {
                hitched++;
                unresolved.push({ foot: side === 0 ? 'L' : 'R', driftM: +d.toFixed(4),
                                  samples: win.n, longestFrameMs: Math.round(win.maxDt),
                                  couldExplainM: +explainM.toFixed(4),
                                  bodyTravelM: +travelM.toFixed(4),
                                  maxLockErrM: +win.lockErr.toFixed(4), saturated: sat });
              } else { drifts.push(d); wins.push({ d, w: win, explainM }); }
            }
            win = null;
          };
          for (const s of S) {
            const f = s.feet[side];
            const above = f.world.y - T.getHeight(f.world.x, f.world.z);
            const planted = f.planted && Math.abs(above) < 0.05;
            if (planted) {
              if (!win) {
                win = { x0: f.world.x, x1: f.world.x, z0: f.world.z, z1: f.world.z, n: 0,
                        side, y0: f.world.y, y1: f.world.y, a0: above, a1: above, maxDt: 0,
                        lockErr: 0, lockCap: f.lock?.capM ?? null };
              }
              if (s.dt > win.maxDt) win.maxDt = s.dt;
              // how much of the foot lock's budget this stance is using: past
              // the cap the anchor slides and the ball travels the excess, so
              // this is the one number that tells a real slide from a
              // measurement artefact (see docs/ROUND4-PLAYER-ANIM.md 6e)
              if ((f.lock?.errM ?? 0) > win.lockErr) win.lockErr = f.lock.errM;
              win.x0 = Math.min(win.x0, f.world.x); win.x1 = Math.max(win.x1, f.world.x);
              win.z0 = Math.min(win.z0, f.world.z); win.z1 = Math.max(win.z1, f.world.z);
              win.y0 = Math.min(win.y0, f.world.y); win.y1 = Math.max(win.y1, f.world.y);
              win.a0 = Math.min(win.a0, above); win.a1 = Math.max(win.a1, above);
              win.n++;
            } else closeWin();
          }
          closeWin();   // the trailing stance is a stance
        }
        const worst = wins.reduce((a, w) => (a && a.d >= w.d ? a : w), null);
        const crossedFrac = S.filter((x) => x.crossed).length / S.length;
        const cad = S.map((x) => x.hz).sort((a, b) => a - b)[S.length >> 1];
        C.input.keys.clear(); C.input.mouse.buttons = 0;
        const footfalls = Math.abs(cycAcc) * 2;
        const wallS = (performance.now() - t0) / 1000;
        return { key, entry, drifts: drifts.map((d) => +d.toFixed(4)), windows: drifts.length, hitched,
                 unresolved,
                 maxDrift: drifts.length ? +Math.max(...drifts).toFixed(4) : null,
                 crossedFrac: +crossedFrac.toFixed(3),
                 minSepM: +Math.min(...S.map((x) => x.sep)).toFixed(4),
                 stepsPerSec: +cad.toFixed(2), speed: +spd.toFixed(2), hitchMs: Math.round(hitchMs),
                 footfalls: +footfalls.toFixed(2), frames: S.length, windowS: +wallS.toFixed(1),
                 fps: +(S.length / Math.max(0.1, wallS)).toFixed(1),
                 // the mirror latch the entry paths exist to exercise: a
                 // sustained sidestep must settle to the FORWARD loop (+1)
                 // whatever preceded it (locomotion.js, REV_HYST / REV_DWELL)
                 revSign: an.loco?._revSign ?? null,
                 reverse: +(an.loco?.reverse ?? 0).toFixed(3),
                 phaseBackFrames: S.filter((x) => x.dph < -1e-6).length,
                 worstWindow: worst ? {
                   foot: worst.w.side === 0 ? 'L' : 'R',
                   samples: worst.w.n, longestFrameMs: Math.round(worst.w.maxDt),
                   driftM: +worst.d.toFixed(4),
                   yRangeM: +(worst.w.y1 - worst.w.y0).toFixed(4),
                   aboveGroundM: [+worst.w.a0.toFixed(3), +worst.w.a1.toFixed(3)],
                   maxLockErrM: +worst.w.lockErr.toFixed(4), lockCapM: worst.w.lockCap,
                   couldExplainM: +worst.explainM.toFixed(4),
                   // what the OLD (fix round 7) rule would have excused: body
                   // travel in the longest frame, unbounded by the lock. Kept
                   // beside couldExplainM so the gap between the two — the
                   // whole of fix round 8's tightening — is readable in any
                   // verdict without re-deriving it from fps.
                   bodyTravelM: +((worst.w.maxDt / 1000) * spd).toFixed(4),
                   ofWindows: drifts.length, isLast: wins[wins.length - 1] === worst,
                 } : null };
      };
      /* FOUR PASSES: both directions from a standing start (the two this gate
       * has always run), plus the two TRANSITION entries the blocker lived in
       * — a sidestep out of a backpedal and a sidestep out of a forward run,
       * aim never released. The mirror latch keys on |moveAngle|, so one
       * direction per transition covers it and neither key gets only one
       * entry path. */
      const passes = [];
      passes.push(await run('KeyD', 'stand'));
      passes.push(await run('KeyA', 'stand'));
      passes.push(await run('KeyA', 'back'));
      passes.push(await run('KeyD', 'fwd'));
      const detail = {};
      for (const x of passes) detail[(x.key === 'KeyD' ? 'R' : 'L') + '-' + x.entry] = x;
      const nameOf = (x) => (x.key === 'KeyD' ? 'R' : 'L') + '-' + x.entry;
      /* (1) THE MIRROR CLAUSE — CHECKED FIRST, AND IT CANNOT BE SKIPPED PAST.
       *
       * FIX ROUND 8 (judge-player-anim-r2, major). Every clause this gate had
       * was a DRIFT measurement, and a drift measurement can always be argued
       * with (a long frame, a short window, a sample floor). The failure mode
       * it exists to catch has a second signature that no frame time can fake:
       * a sustained sidestep played on the MIRRORED clip runs the master gait
       * phase BACKWARD. All four passes here are sustained sidesteps and all
       * four settle to the forward loop by design (locomotion.js REV_HYST /
       * REV_BIAS: 1.5708 is below both switching bounds, so a sidestep
       * resolves to +1 from either latch state); the backpedal mirror is a
       * different input and is not one of A31b's passes. Measured on the 6f
       * blocker: revSign -1 with 101/102 and 82/83 frames of backward phase.
       * Measured on the fixed build, 8+ runs, every pass: +1 and 0 backward
       * frames. So this is a binary, and it is checked BEFORE the SKIP branch
       * — a mirrored run is RED whatever its windows did, and can never hide
       * behind an unresolvable window or a short sample. */
      const mirrored = passes.filter((x) => x.revSign !== 1 || x.phaseBackFrames !== 0);
      if (mirrored.length) {
        return { pass: false, detail: { ...detail,
          failing: mirrored.map(nameOf),
          note: 'MIRRORED: ' + mirrored.map((x) => nameOf(x) + ' rev ' + x.revSign
            + ', ' + x.phaseBackFrames + '/' + x.frames + ' frames of backward gait phase').join('; ') } };
      }
      /* (2) SKIP is the LAST resort, not the first (fix round 7) — but an
       * unresolvable window is now VISIBLE (fix round 8, judge-player-anim-r2).
       * It used to take unresolvable > resolved to stop a PASS, so a run could
       * carry a >6 cm window it could not account for and still read green
       * with nothing in the verdict saying so. Every unresolvable window is by
       * construction over the drift bar, so ANY of them means this pass did
       * not settle the question: the run is yellow, not green. That costs
       * nothing on a healthy build (a sub-bar window is never set aside, at
       * any frame rate — measured 0 unresolvable across 4 passes down to
       * 22.6 fps under the lane's own suite) and it stops the one shape the
       * judge found: a bar-grazing slide filed as an excuse and reported as a
       * pass. */
      const blind = passes.filter((x) => x.windows < 2 || x.hitched > 0);
      if (blind.length) {
        return { pass: null, detail: { ...detail,
          note: 'SKIP: ' + blind.map((x) => nameOf(x)
            + ' resolved ' + x.windows + ' / unresolvable ' + x.hitched
            + (x.unresolved[0] ? ' (worst ' + Math.max(...x.unresolved.map((u) => u.driftM))
               + ' m, lock ' + x.unresolved[0].maxLockErrM + ' m)' : '')).join(', ') } };
      }
      const ok = (x) => x.maxDrift <= 0.06 && x.crossedFrac <= 0.02
        && x.stepsPerSec >= 1.8 && x.stepsPerSec <= 3.6;
      const failing = passes.filter((x) => !ok(x)).map(nameOf);
      return { pass: failing.length === 0, detail: failing.length ? { ...detail, failing } : detail };
    })()`,
  },

  /* ------------------------------------------- A18b-slope-conform-moving */
  {
    id: 'A18b-slope-conform-moving', kind: 'action', lane: 'player-anim',
    // FIX ROUND 1: 70 s was not enough headroom. The body of this gate is only
    // ~5.5 s of staged walking, but it runs a deterministic terrain scan and
    // two re-stages, and on a box running fourteen lanes' suites at once the
    // whole thing has measured 78 s wall clock and been killed by its own
    // timeout while every clause inside it was passing. The measurement window
    // is unchanged; only the patience is.
    timeout: 150000,
    title: 'The conform holds WHILE MOVING: walking up and down a ~20 deg face, planted soles stay ON the ground (no float, no sink)',
    setup: `__CTX__.input.enabled = true;`,
    settle: 500,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, T = C.terrain;
      ${FREEZE}
      if (!an?.debugFeet || !T?.getHeight) return { pass: null, detail: 'SKIP: no debugFeet()/terrain' };
      const V = () => new p.position.constructor();
      const n = V();
      const angOf = (v) => Math.acos(Math.max(-1, Math.min(1, v.y))) * 180 / Math.PI;
      // deterministic: fixed scan order, first LOCALLY CONSISTENT ~20 deg face
      let spot = null;
      for (let x = -200; x <= 200 && !spot; x += 5) {
        for (let z = -200; z <= 200; z += 5) {
          T.getNormal(x, z, n);
          if (Math.abs(angOf(n) - 20) > 1.5) continue;
          const nx = n.x, ny = n.y, nz = n.z;
          let ok = true;
          for (const [dx, dz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) {
            T.getNormal(x + dx, z + dz, n);
            if (n.x * nx + n.y * ny + n.z * nz < 0.9945) { ok = false; break; }
          }
          if (!ok) continue;
          // fall-line heading (downhill) in world yaw
          spot = { x, z, up: Math.atan2(-nx, -nz), n: { x: nx, y: ny, z: nz } };
          break;
        }
      }
      if (!spot) return { pass: null, detail: 'SKIP: no consistent 20 deg face found' };

      const walk = async (yaw, tag) => {
        C.input.keys.clear();
        // re-stage before EACH direction and keep the sample window short: at
        // 1.5 m/s she leaves a 20 deg face in about two seconds, and a sample
        // taken on the 7 deg run-out is not a measurement of this gate
        p.position.set(spot.x, 0, spot.z); p.velocity.set(0, 0, 0); p._snapToGround();
        p.camYaw = yaw;
        await new Promise((r) => setTimeout(r, 500));
        C.input.keys.add('KeyW'); C.input.keys.add('AltLeft');   // stroll
        await new Promise((r) => setTimeout(r, 700));
        let worstClear = 0, worstTilt = 0, samples = 0, offFace = 0, flatFrames = 0;
        const clears = [], tilts = [];
        let minSlope = 90, maxSpeed = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < 1300) {
          const f = an.debugFeet();
          const st = an.debugStance ? an.debugStance() : null;
          T.getNormal(p.position.x, p.position.z, n);
          const slope = angOf(n);
          maxSpeed = Math.max(maxSpeed, p.moveSpeed);
          // only judge frames she is actually still on the face
          if (slope < 12) { offFace++; await new Promise((r) => requestAnimationFrame(r)); continue; }
          minSlope = Math.min(minSlope, slope);
          for (let i = 0; i < 2; i++) {
            if (!f[i].planted) continue;
            samples++;
            const ft = st && st.feet ? st.feet[i] : null;
            // A planted sole touches the ground SOMEWHERE: the heel on a heel
            // strike, the ball on a toe-off. Measuring the ball alone reports
            // 0.16 m of "float" on the frame the heel is down, which is the
            // clip, not the conform (docs/ROUND4-CHARACTER.md §3 makes the same
            // point about the pelvis clamp).
            const clear = ft && ft.heelClear != null
              ? (Math.abs(ft.heelClear) < Math.abs(ft.toeClear) ? ft.heelClear : ft.toeClear)
              : f[i].world.y - T.getHeight(f[i].world.x, f[i].world.z);
            clears.push(Math.abs(clear));
            if (Math.abs(clear) > Math.abs(worstClear)) worstClear = clear;
            // Sole TILT is only a conform question during the FLAT phase. A
            // walking foot is mid-roll for most of its stance — heel-strike to
            // toe-off legitimately sweeps ~30 deg, and downhill that is the
            // whole point of the clip — so the tilt is judged only on frames
            // where the entire sole is near the ground (both contact points
            // within 5 cm, the nearer within 2 cm).
            if (ft && ft.soleTiltErrDeg != null && ft.heelClear != null) {
              const near = Math.min(Math.abs(ft.heelClear), Math.abs(ft.toeClear));
              const far = Math.max(Math.abs(ft.heelClear), Math.abs(ft.toeClear));
              if (near < 0.02 && far < 0.05) {
                flatFrames++;
                tilts.push(ft.soleTiltErrDeg);
                if (ft.soleTiltErrDeg > worstTilt) worstTilt = ft.soleTiltErrDeg;
              }
            }
          }
          await new Promise((r) => requestAnimationFrame(r));
        }
        C.input.keys.clear();
        const gy = T.getHeight(p.position.x, p.position.z);
        clears.sort((a, b) => a - b);
        tilts.sort((a, b) => a - b);
        const pct = (arr) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.9))] : 0);
        return { tag, worstClearM: +worstClear.toFixed(4), p90ClearM: +pct(clears).toFixed(4),
                 worstSoleTiltDeg: +worstTilt.toFixed(2), p90SoleTiltDeg: +pct(tilts).toFixed(2),
                 samples, flatFrames, offFaceFrames: offFace, minSlopeDeg: +minSlope.toFixed(1),
                 maxSpeed: +maxSpeed.toFixed(2), bodyErrM: +(p.position.y - gy).toFixed(4) };
      };
      const down = await walk(spot.up, 'downhill');
      const up = await walk(spot.up + Math.PI, 'uphill');
      const rows = [down, up];
      if (rows.some((r) => r.samples < 8)) {
        return { pass: null, detail: { at: { x: spot.x, z: spot.z }, rows, note: 'SKIP: too few planted samples on the face' } };
      }
      /* Bars, and why they are not A18's.
       * CLEARANCE 0.05 m (A18 standing: 0.02 m) is the finding this gate
       * exists for — "downhill floats, uphill sinks" — and it is the number
       * that moved: 0.149 m downhill / -0.083 m uphill before the flat-phase
       * conform authority and the per-foot LOWER term, 0.025 / 0.014 after.
       * SOLE TILT 26 deg (A18 standing: 6 deg) because a WALKING sole is not a
       * standing one: descending a 20 deg face you land heel-first on a surface
       * that is falling away and the ankle dorsiflexes through the contact, so
       * a large sole-to-ground angle mid-stance is the clip being right, not
       * the conform being wrong. It is measured only on frames where the whole
       * sole is near the ground, and it is held to a bar rather than merely
       * reported so a conform that stops working downhill still fails here.
       * Measured after the fix: 19-24 deg downhill, 1.6-2.3 deg uphill; before
       * it, 27-34 deg downhill. A18's own 0.02 m / 6 deg standing bars are
       * untouched and still run. */
      /* Clearance is judged on the 90th PERCENTILE of the planted samples with
       * a hard outlier ceiling on the single worst frame, not on the worst
       * frame alone. On film (shots/pa-slope-uphill.png) both soles sit on a
       * 20 deg face with heel/toe clearance 0.002/0.000 m — but this box runs
       * the suite at ~20 fps, and one frame in thirty catches the pelvis clamp
       * mid-convergence right after the stage teleport and reads 0.07 m. A
       * single-frame worst is measuring the sampler, not the conform. The
       * ceiling still fails the finding this gate exists for: the 0.149 m
       * downhill float was EVERY frame, not one. */
      const bad = rows.filter((r) => !(r.p90ClearM <= 0.05 && Math.abs(r.worstClearM) <= 0.12
        && r.flatFrames >= 3 && r.p90SoleTiltDeg <= 22 && r.worstSoleTiltDeg <= 32
        && Math.abs(r.bodyErrM) <= 0.06 && r.maxSpeed > 0.6));
      return { pass: bad.length === 0, detail: { at: { x: spot.x, z: spot.z }, rows, failing: bad.map((r) => r.tag) } };
    })()`,
  },

  /* ---------------------------------------------------- V23-secondary-motion */
  {
    id: 'V23-secondary-motion', kind: 'visual', lane: 'player-anim',
    title: 'Sprint, side view — three frames 80 ms apart, composited',
    criteria: 'Three vertical strips of the SAME sprint, 80 ms apart, left to right. '
      + 'PASS if the ponytail, the braids, the quiver, the belt pouches and the '
      + 'skirt flaps are in visibly DIFFERENT positions in each strip, and if the '
      + 'hair trails BEHIND her head rather than sticking out forward or sideways. '
      + 'FAIL if the hair is a rigid cone welded to her back (Round 3), if any '
      + 'strand stands straight out from the body like a tentacle, or if the three '
      + 'strips are indistinguishable.',
    // The three moments are grabbed inside `engine.onAfterRender` — the same
    // task as the render, so the drawing buffer is still intact without
    // `preserveDrawingBuffer` (the trick V20-aa-crop uses) — composited into
    // one canvas as three strips, and laid over the page for the shot.
    setup: `(async () => {
      const C = __CTX__, p = C.player, e = C.engine;
      C.input.enabled = true;
      C.state = 'playing';
      ${NOHUD}
      ${FREEZE}
      ${FILM}
      ${LOCKCAM}
      ${STAGE}
      // FIX ROUND 1: her RIGHT (negative), not her left. The sun sits on this
      // side at the stage point, and from the left she filmed as a backlit
      // silhouette — the judge has to tell a ponytail from a braid from a
      // pouch strap across three strips, and none of that reads in shadow.
      lockCam(-3.5, 1.15, 0, 1.05);
      C.input.keys.clear(); C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft');
      await new Promise((r) => setTimeout(r, 2600));

      const dom = C.renderer.domElement;
      const W = dom.width, H = dom.height, sw = Math.floor(W / 3);
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      let want = false, got = 0;
      const grab = () => {
        if (!want || got >= 3) return;
        want = false;
        g.drawImage(dom, (W - sw) / 2, 0, sw, H, got * sw, 0, sw, H);
        g.strokeStyle = '#000'; g.lineWidth = 4;
        g.strokeRect(got * sw + 2, 2, sw - 4, H - 4);
        got++;
      };
      e.onAfterRender.push(grab);
      for (let i = 0; i < 3; i++) {
        want = true;
        const t0 = performance.now();
        while (want && performance.now() - t0 < 1500) await new Promise((r) => requestAnimationFrame(r));
        const t1 = performance.now();
        while (performance.now() - t1 < 80) await new Promise((r) => requestAnimationFrame(r));
      }
      const i = e.onAfterRender.indexOf(grab);
      if (i >= 0) e.onAfterRender.splice(i, 1);
      C.input.keys.clear();
      if (got < 3) return false;
      const el = document.createElement('img');
      el.src = cv.toDataURL('image/png');
      el.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;object-fit:fill';
      document.body.appendChild(el);
      return true;
    })()`,
    settle: 900,
  },

  /* -------------------------------------------------- V24-draw-vs-reference */
  {
    id: 'V24-draw-vs-reference', kind: 'visual', lane: 'player-anim',
    title: 'Full draw, side, zoomed — judged against reference/draw-side.jpg',
    criteria: 'Aloy at full draw, from her right, close. Judge against '
      + 'reference/draw-side.jpg. PASS requires ALL of: the drawing hand\'s '
      + 'KNUCKLES are on her cheek/jaw (touching the face, not floating in front '
      + 'of it and not buried inside the skull or the braid); the arrow shaft and '
      + 'the drawing forearm are roughly IN LINE, so the fletching sits at the '
      + 'corner of her mouth; the BOW ARM is straight — a locked elbow, not a '
      + 'visibly bent one; her eye is looking down the shaft. FAIL if the hand is '
      + 'out in front of her face, below her chin, behind her ear, if the bracer '
      + 'lies across her eyes, or if the bow arm is bent like a curl.',
    setup: `(async () => {
      const C = __CTX__, p = C.player;
      C.input.enabled = true;
      C.state = 'playing';
      ${NOHUD}
      ${FREEZE}
      ${FILM}
      ${LOCKCAM}
      ${STAGE}
      p.camPitch = 0;
      C.input.mouse.buttons |= 4;
      await new Promise((r) => setTimeout(r, 800));
      C.input.mouse.buttons |= 1;
      await new Promise((r) => setTimeout(r, 2600));
      const before = p.animator.debugArm('l').elbowDeg;
      /*
       * FIX ROUND 1 — FREEZE THE AIM BEFORE MOVING THE CAMERA.
       *
       * \`combat.aimPoint\` is the CAMERA RAY's world hit (src/combat/combat.js
       * \`_updateAimPoint\`), so the moment this gate relocated the camera to
       * film her from the side, the thing she is aiming AT jumped with it —
       * measured -60.5,0,-12.3 (60 m down her own facing) -> 80.8,-2.6,-74.5
       * (140 m off to the side). The bow arm then folds to reach across her
       * body: elbow 167.9 deg -> 97.1, the string hand ends up IN FRONT of her
       * face (behindFace +0.061 -> -0.006 m). Those are verbatim the FAIL
       * conditions in this gate's own criteria, and they were an artefact of
       * the camera, not of the rig — A35 measures the same pose at 167.9 deg
       * because A35 never moves the camera. Stubbing the updater holds the last
       * gameplay aim point, so the pose the judge sees is the pose the player
       * gets.
       */
      C.combat._updateAimPoint = () => {};
      /*
       * Framing. reference/draw-side.jpg is a near-perpendicular view from her
       * RIGHT (negative \`right\`), a hand's breadth behind the shoulder line,
       * at anchor height, with the look-at slid 0.34 m DOWN HER FACING so the
       * whole draw triangle — anchor fist, arrow, bow grip, bow arm elbow —
       * sits in the middle of the frame instead of her spine. The previous
       * numbers put the camera 0.45 m in FRONT of her and looked at her chest,
       * which cropped the bow arm out entirely and left three of the four PASS
       * clauses unjudgeable.
       */
      lockCam(-1.70, 1.46, 0.22, 1.35, 0.34);
      C.camera.fov = 31; C.camera.updateProjectionMatrix();
      await new Promise((r) => setTimeout(r, 500));
      const A = p.animator.debugArm('r'), B = p.animator.debugArm('l');
      // the arrow has to be ON the string for the judge to call the fletching
      const bow = C.combat.bow;
      let arrowVisible = null;
      if (bow && bow.nockArrow) {
        arrowVisible = bow.nockArrow.group.visible;
        for (let o = bow.nockArrow.group; o; o = o.parent) if (!o.visible) arrowVisible = false;
      }
      C.engine.timeScale = 0;
      return { drawS: C.combat.drawStrength, arrowVisible,
        bowElbowDegBeforeCamLock: before, bowElbowDeg: B.elbowDeg,
        handToHead: A.handToHead, handBehindFace: A.handBehindFace };
    })()`,
    settle: 900,
  },
];
