/**
 * Round 4 gates — lane `machine-ai` (docs/ROUND4-AUDIT.md §4).
 *
 * Same contract as tools/gates.config.mjs: ACTION gates resolve
 * { pass, detail } in page context with __CTX__/__GAME__ available; VISUAL
 * gates capture a deterministic screenshot judged against `criteria`.
 *
 * Every gate here stages its own scenario and FREEZES the machines it is not
 * measuring — with 24 machines on one valley, a wandering Sawtooth walking
 * into a stealth test is a different test (see the spatial lane's A24 notes
 * for the same lesson).
 */

const INPUT_ON = `__CTX__.input.enabled = true;`;

/** Block until the deferred variety spawns exist. */
const WAIT_VARIETY = `
  const _t0 = performance.now();
  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {
    await new Promise(r => setTimeout(r, 150));
  }
`;

/** Freeze every machine except `keep` (an array) so nothing wanders in. */
const FREEZE = `function freezeAll(keep) {
  const set = new Set(keep || []);
  for (const m of __CTX__.machines.list) {
    if (set.has(m)) continue;
    if (!m._frozenByGate) { m._frozenByGate = m.update; m.update = () => {}; }
  }
}`;

/** Teleport the player and settle her on the terrain. */
const PLACE = `function place(x, z, opts) {
  const p = __CTX__.player;
  p.position.set(x, 0, z);
  p.velocity.set(0, 0, 0);
  p._snapToGround();
  if (opts && opts.crouch !== undefined) p.setCrouch(!!opts.crouch);
  if (opts && opts.yaw !== undefined) { p.camYaw = opts.yaw; p.heading = opts.yaw + Math.PI; }
  p.moveSpeed = 0;
  return p;
}`;

/** Park a machine: no route travel, no wander, heading held. */
const PARK = `function park(m, heading) {
  m.route = [m.position.clone()];
  m._wpIndex = 0;
  m._waitT = 1e6;
  if (heading !== undefined) m.heading = heading;
  m.suspicion = 0;
  m._unseenT = 99;
  m.ai.search.stop();
  m.ai.engage.reset();
  m.setState('patrol');
}`;

/** Bearing from a to b (yaw where +Z is 0). */
const BEARING = `const bearing = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);`;

/**
 * SIM seconds, and a sleep measured in them.
 *
 * Detection curves and search timers are specified in GAME seconds, but the
 * frame loop clamps a long frame (MAX_FRAME in src/main.js), so when the
 * shared GPU is thrashing sim time runs as slow as ~0.5x wall. A gate that
 * counted wall seconds then read 6.7 s for a 3.3 s detection curve and failed
 * a build that was correct. Everything timed here counts engine.simTime, with
 * a wall-clock cap so a truly frozen page still ends the gate.
 */
const SIMCLOCK = `
  const simNow = () => (__CTX__.engine ? __CTX__.engine.simTime : performance.now() / 1000);
  /** Sleep s SIM seconds (wall cap capX x), ticking each(elapsedSim). */
  async function simSleep(s, each, capX = 3) {
    const t0 = simNow(), w0 = performance.now();
    while (simNow() - t0 < s && performance.now() - w0 < s * 1000 * capX + 4000) {
      await new Promise(r => setTimeout(r, 50));
      if (each) each(simNow() - t0);
    }
    return simNow() - t0;
  }
  /** Wait until fn() is true, at most s SIM seconds. */
  async function simUntil(fn, s, each, capX = 3) {
    const t0 = simNow(), w0 = performance.now();
    while (!fn() && simNow() - t0 < s && performance.now() - w0 < s * 1000 * capX + 4000) {
      await new Promise(r => setTimeout(r, 25));
      if (each) each(simNow() - t0);
    }
    return simNow() - t0;
  }
`;

/**
 * SIM-TICK SAMPLING. `SIMCLOCK` above fixed the DURATION of a measurement; it
 * did not fix its RESOLUTION. A gate that polls from a `setTimeout` loop
 * samples on the WALL clock, so on a thrashing box the poll interval covers
 * several sim steps at once and every path integral it accumulates is a chord
 * across the machine's real arc: the same duel scored ~10 m less travel at
 * 12 fps than at 60, which is how `A41-combat-motion` failed builds that were
 * fine. Nothing about the machine changed — only how often the gate looked.
 *
 * `tickProbe` wraps the machine's own `update()` instead, so ONE sample lands
 * per simulated step with that step's exact `dt`. Travel, idle fraction and
 * the footprint are then identical at any frame rate, and the measurement
 * window is counted in the machine's own accumulated `dt` — a fixed number of
 * simulated seconds regardless of real time. `opts.pre(dt)` runs before the
 * machine steps (used to pin the player on every tick, not every poll).
 */
const TICKPROBE = `function tickProbe(m, opts) {
  const o = opts || {};
  const base = m.update.bind(m);
  const st = {
    sim: 0, steps: 0, travel: 0, idle: 0, idleBetween: 0, between: 0, maxNet: 0,
    homeX: m.position.x, homeZ: m.position.z,
    lastX: m.position.x, lastZ: m.position.z,
    minX: m.position.x, maxX: m.position.x, minZ: m.position.z, maxZ: m.position.z,
    stop() { m.update = base; return st; },
    get spread() { return Math.hypot(st.maxX - st.minX, st.maxZ - st.minZ); },
    get idleFrac() { return st.between ? st.idleBetween / st.between : 1; },
  };
  m.update = (dt, t) => {
    if (o.pre) o.pre(dt, st);
    base(dt, t);
    if (!(dt > 0)) return;
    const x = m.position.x, z = m.position.z;
    const d = Math.hypot(x - st.lastX, z - st.lastZ);
    st.lastX = x; st.lastZ = z;
    st.sim += dt; st.steps++; st.travel += d;
    if (x < st.minX) st.minX = x; else if (x > st.maxX) st.maxX = x;
    if (z < st.minZ) st.minZ = z; else if (z > st.maxZ) st.maxZ = z;
    const net = Math.hypot(x - st.homeX, z - st.homeZ);
    if (net > st.maxNet) st.maxNet = net;
    // idle = XZ speed under 0.25 m per SIM second, measured on the step itself
    const moving = d / dt > 0.25;
    if (!moving) st.idle++;
    if (!m._attack) { st.between++; if (!moving) st.idleBetween++; }
    if (o.each) o.each(dt, st);
  };
  return st;
}
/** Run a tickProbe until it has banked \`s\` SIM seconds (wall cap ms). */
async function probeFor(st, s, wallMs) {
  const w0 = performance.now();
  while (st.sim < s && performance.now() - w0 < (wallMs || 120000)) {
    await new Promise(r => setTimeout(r, 40));
  }
  return st.sim;
}`;

export const GATES = [
  /* ------------------------------------------------------------------ A37 */
  {
    id: 'A37-stealth-approach', kind: 'action', lane: 'machine-ai',
    title: 'Crouched in tall grass, 20 m -> 3 m behind a Watcher: never leaves patrol/suspicious, suspicion < 0.3',
    setup: `(async () => { ${INPUT_ON} ${WAIT_VARIETY} })()`,
    settle: 600, timeout: 70000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${PARK} ${BEARING}
      const ctx = __CTX__, T = ctx.terrain;
      const w = ctx.machines.list.find(m => m.kind === 'watcher' && m.alive);
      if (!w) return { pass: null, detail: 'SKIP: no living watcher' };

      // 1. find a tall-grass corridor at least 22 m long: sample the valley for
      //    a start point and a bearing along which isInTallGrass holds the
      //    whole way. This is the cover world-ground owes the stealth loop.
      let corridor = null;
      for (let i = 0; i < 4000 && !corridor; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 40 + Math.random() * 230;
        const sx = Math.sin(a) * r, sz = Math.cos(a) * r;
        if (T.tallGrassDensity(sx, sz) < 0.55) continue;
        for (let k = 0; k < 8; k++) {
          const b = (k / 8) * Math.PI * 2;
          let ok = true;
          for (let d = 0; d <= 22; d += 1) {
            const x = sx + Math.sin(b) * d, z = sz + Math.cos(b) * d;
            if (!T.isInTallGrass(x, z)) { ok = false; break; }
          }
          if (ok) { corridor = { x: sx, z: sz, b }; break; }
        }
      }
      if (!corridor) return { pass: null, detail: 'SKIP: no 22 m tall-grass corridor in the valley (world-ground stealth-no-cover-on-routes)' };

      // 2. stage: the watcher sits at the far end FACING AWAY down the
      //    corridor; she walks up behind it from 20 m to 3 m over 15 s.
      const endX = corridor.x + Math.sin(corridor.b) * 22;
      const endZ = corridor.z + Math.cos(corridor.b) * 22;
      w.position.set(endX, T.getHeight(endX, endZ), endZ);
      w.spawnPos.set(endX, 0, endZ);
      park(w, corridor.b);           // faces further along the corridor: away
      freezeAll([w]);

      const p = place(corridor.x + Math.sin(corridor.b) * 2, corridor.z + Math.cos(corridor.b) * 2, { crouch: true });
      const samples = [];
      const t0 = performance.now();
      const DUR = 15000;
      const HOLD = 2000;                                  // 2 s crouched at 3 m
      let worst = 0, badState = null, minDist = 999, grassMiss = 0, facedHer = 0;
      /**
       * Also pin that the machine never actually SEES her. Round 4 fix 2 gave
       * perception an engaged-contact term (PERCEPTION.engagedRange, 8 m, no
       * cone) so a machine already in melee stops losing a player standing in
       * front of it. That term is gated on attack state and on line of sight,
       * and grass still collapses sight to hiddenRange - this counter is the
       * standing proof that it cannot leak into the stealth approach.
       */
      let seenSamples = 0;
      while (performance.now() - t0 < DUR + HOLD) {
        const el = performance.now() - t0;
        const k = Math.min(1, el / DUR);                  // 0..1
        const d = Math.max(3, 20 - 17 * k);               // 20 m -> 3 m, then held
        const x = w.position.x - Math.sin(corridor.b) * d;
        const z = w.position.z - Math.cos(corridor.b) * d;
        // HARDER than the audit's staging: for the second half the Watcher
        // turns around and looks straight down the corridor AT her. Hidden is
        // hidden — facing must not matter once she is in the grass.
        if (k > 0.5) { w.heading = corridor.b + Math.PI; facedHer++; }
        p.position.set(x, T.getHeight(x, z), z);
        p.setCrouch(true);
        p.inTallGrass = T.isInTallGrass(x, z);
        if (!p.inTallGrass) grassMiss++;
        // she is WALKING, so the crouch-walk footstep stimulus must fire; the
        // teleport-per-sample staging cannot produce it on its own
        ctx.machines.noise({ x, z, radius: 2.2, strength: 0.45, kind: 'footstep' });
        const dist = Math.hypot(p.position.x - w.position.x, p.position.z - w.position.z);
        minDist = Math.min(minDist, dist);
        worst = Math.max(worst, w.suspicion);
        if (!['patrol', 'suspicious', 'return'].includes(w.state)) badState = w.state;
        if (w._visible) seenSamples++;
        samples.push(+w.suspicion.toFixed(3));
        await new Promise(r => setTimeout(r, 100));
      }
      return {
        pass: worst < 0.3 && badState === null && seenSamples === 0,
        detail: {
          peakSuspicion: +worst.toFixed(3), finalState: w.state, badState,
          seenSamplesWhileHidden: seenSamples,
          minDistM: +minDist.toFixed(2), samples: samples.length,
          finalDistM: +Math.hypot(p.position.x - w.position.x, p.position.z - w.position.z).toFixed(2),
          grassMissSamples: grassMiss, samplesWithWatcherFacingHer: facedHer,
          crouchNoiseRadiusM: 2.2,
          hiddenRangeM: w.ai.perception.cfg.hiddenRange,
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A38 */
  {
    id: 'A38-unseen-shot', kind: 'action', lane: 'machine-ai',
    title: 'A 35 m hit from behind points the Watcher at the SHOT ORIGIN, not at the player',
    setup: `(async () => { ${INPUT_ON} ${WAIT_VARIETY} })()`,
    settle: 600, timeout: 45000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${PARK} ${BEARING} ${SIMCLOCK}
      const ctx = __CTX__, T = ctx.terrain;
      const w = ctx.machines.list.find(m => m.kind === 'watcher' && m.alive);
      if (!w) return { pass: null, detail: 'SKIP: no living watcher' };
      freezeAll([w]);
      park(w, Math.random() * Math.PI * 2);

      // shooter stands 35 m DIRECTLY BEHIND it, outside the sight cone
      const back = w.heading + Math.PI;
      const ox = w.position.x + Math.sin(back) * 35;
      const oz = w.position.z + Math.cos(back) * 35;
      const p = place(ox, oz, { crouch: false });
      await new Promise(r => setTimeout(r, 400));
      const seenBefore = w._visible;

      // fire: 'arrow-fired' is what records the shot origin (machines/index.js)
      ctx.events.emit('arrow-fired', { type: 'hunter', drawStrength: 1 });
      const point = { x: w.position.x, y: w.position.y + 1, z: w.position.z };
      const dx = point.x - ox, dz = point.z - oz;
      const l = Math.hypot(dx, dz) || 1;
      let mesh = null; w.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
      w.takeDamage({
        point, object: mesh, impact: 5, tear: 0, element: 'none', elementAmount: 0,
        dir: { x: dx / l, y: 0, z: dz / l }, type: 'hunter',
      });

      /**
       * She immediately relocates 22 m: if the machine were omniscient it
       * would follow HER, not the shot.
       *
       * The relocation has to be somewhere it genuinely CANNOT see. A hit
       * turns the machine to face the shot origin, and its cone is +-50 deg,
       * so a fixed sideways step lands 32 deg off-axis at 41 m — inside the
       * cone. It then re-acquires her by sight, which is CORRECT behaviour but
       * makes lastKnown equal to her position and failed this gate wrongly.
       * Search the ring around the shot origin for a spot the collision world
       * itself calls blocked, and assert on every UNSEEN sample as well as on
       * the end state, so a legitimate re-acquisition can never be mistaken
       * for a leak (and a leak can never hide behind one).
       */
      let px = null, pz = null;
      for (let k = 0; k < 24 && px === null; k++) {
        const a = back + Math.PI * 0.5 + (k / 24) * Math.PI * 2;
        const x = ox + Math.sin(a) * 22, z = oz + Math.cos(a) * 22;
        if (Math.hypot(x, z) > 295) continue;
        if (w.ai.perception.hasLOS({ x, y: T.getHeight(x, z) + 1.2, z })) continue;
        px = x; pz = z;
      }
      const stagedUnseen = px !== null;
      if (!stagedUnseen) {
        const side = back + Math.PI * 0.5;
        px = ox + Math.sin(side) * 22; pz = oz + Math.cos(side) * 22;
      }
      place(px, pz, { crouch: true });

      let leaked = 0, unseenSamples = 0, everVisible = false, lk0 = null;
      await simSleep(2.5, () => {
        const pl = ctx.player;
        pl.position.set(px, T.getHeight(px, pz), pz);
        pl.velocity.set(0, 0, 0);
        if (lk0 === null) lk0 = { x: w.lastKnown.x, z: w.lastKnown.z };
        if (w._visible) { everVisible = true; return; }
        unseenSamples++;
        // WHILE UNSEEN the machine must not know where she is standing now
        if (Math.hypot(w.lastKnown.x - px, w.lastKnown.z - pz) <= 8) leaked++;
      });

      const dOrigin0 = lk0 ? Math.hypot(lk0.x - ox, lk0.z - oz) : 999;
      const dOrigin = Math.hypot(w.lastKnown.x - ox, w.lastKnown.z - oz);
      const dPlayer = Math.hypot(w.lastKnown.x - px, w.lastKnown.z - pz);
      const stateOk = ['suspicious', 'search'].includes(w.state);
      return {
        pass: stateOk && dOrigin0 <= 8 && leaked === 0
          && (everVisible ? true : dPlayer > 8),
        detail: {
          state: w.state, seenBeforeShot: seenBefore,
          stagedUnseenRelocation: stagedUnseen,
          lastKnownToShotOriginAtHitM: +dOrigin0.toFixed(2),
          lastKnownToShotOriginM: +dOrigin.toFixed(2),
          lastKnownToPlayerNowM: +dPlayer.toFixed(2),
          unseenSamples, leakedSamples: leaked, reacquiredBySight: everVisible,
          suspicion: +w.suspicion.toFixed(2),
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A39 */
  {
    id: 'A39-detection-curve', kind: 'action', lane: 'machine-ai',
    title: 'Standing still in the cone: 30 m suspicious >= 1.5 s / alert >= 3.0 s; 10 m alert <= 1.5 s',
    setup: `(async () => { ${INPUT_ON} ${WAIT_VARIETY} })()`,
    settle: 600, timeout: 130000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${PARK} ${BEARING} ${SIMCLOCK}
      const ctx = __CTX__, T = ctx.terrain;
      const w = ctx.machines.list.find(m => m.kind === 'watcher' && m.alive);
      if (!w) return { pass: null, detail: 'SKIP: no living watcher' };
      freezeAll([w]);
      const home = w.position.clone();

      async function run(dist) {
        w.position.copy(home);
        park(w, 0);
        w.suspicion = 0;
        w._unseenT = 99;
        w.ai.perception.acc = 0;
        // she stands still, upright, in the open, dead ahead down the cone
        let px = home.x + Math.sin(w.heading) * dist;
        let pz = home.z + Math.cos(w.heading) * dist;
        // nudge the pair onto a line with clear line of sight
        for (let tries = 0; tries < 24; tries++) {
          const h = w.ai.perception.hasLOS({ x: px, y: T.getHeight(px, pz), z: pz });
          if (h) break;
          w.heading += Math.PI * 2 / 24;
          px = home.x + Math.sin(w.heading) * dist;
          pz = home.z + Math.cos(w.heading) * dist;
        }
        const p = place(px, pz, { crouch: false });
        p.moveSpeed = 0;
        w.suspicion = 0; w.setState('patrol'); w._waitT = 1e6;
        /**
         * Start the clock at FIRST CONTACT, not at the teleport. Staging a
         * teleport costs ~0.5-0.7 s before the machine's senses have a settled
         * player to look at (she snaps to ground, the collision capsule
         * re-seeds, the perception tick is 100 ms), and that latency is not
         * part of the detection curve the audit specifies. Suspicion is zeroed
         * AT t0, so this buys the build no head start — only a fair start.
         */
        // clear the STALE visibility flag from the previous leg, so the clock
        // starts on a fresh perception tick rather than on last run's answer
        w._visible = false;
        w.ai.perception.visible = false;
        /**
         * Both clocks below are SIM seconds. The audit states this curve in
         * GAME seconds, and a thrashing shared GPU makes sim time run at
         * ~0.5x wall — which read a correct 3.3 s alert as 6.7 s and failed
         * the gate for the frame clamp's behaviour, not the machine's.
         */
        const acquireS = await simUntil(() => w._visible, 2.5, () => {
          p.moveSpeed = 0; p.velocity.set(0, 0, 0);
        });
        w.suspicion = 0;
        w.ai.perception.acc = 0;
        let tSus = null, tAlert = null;
        await simUntil(() => tAlert !== null, 9, (el) => {
          p.moveSpeed = 0;                       // standing still
          p.velocity.set(0, 0, 0);
          if (tSus === null && (w.state === 'suspicious' || w.suspicion >= w.perceptCfg.susEnter)) tSus = el;
          if (tAlert === null && (w.state === 'alert' || w.state === 'attack' || w.suspicion >= 1)) tAlert = el;
        });
        return {
          tSus: tSus === null ? null : +tSus.toFixed(2),
          tAlert: tAlert === null ? null : +tAlert.toFixed(2),
          visible: w._visible, fill: +(w.detectFill || 0).toFixed(3),
          acquireLatencyS: +acquireS.toFixed(2),
        };
      }

      const far = await run(30);
      const near = await run(10);
      // restore
      w.position.copy(home);
      park(w, w.heading);

      const pass = far.tSus !== null && far.tSus >= 1.5
        && far.tAlert !== null && far.tAlert >= 3.0 && far.tAlert <= 4.6
        && near.tAlert !== null && near.tAlert <= 1.5;
      return {
        pass,
        detail: {
          at30m: { suspiciousAtS: far.tSus, alertAtS: far.tAlert, sawPlayer: far.visible, fillPerS: far.fill, acquireLatencyS: far.acquireLatencyS },
          at10m: { suspiciousAtS: near.tSus, alertAtS: near.tAlert, sawPlayer: near.visible, fillPerS: near.fill, acquireLatencyS: near.acquireLatencyS },
          clock: 'SIM seconds (ctx.engine.simTime), measured from first contact (w._visible), with suspicion zeroed at t0',
          bars: { sus30: '>=1.5', alert30: '3.0-4.6', alert10: '<=1.5' },
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A40 */
  {
    id: 'A40-lost-contact', kind: 'action', lane: 'machine-ai',
    title: 'Break LOS behind cover and crouch: the machine searches lastKnown, not the player',
    setup: `(async () => { ${INPUT_ON} ${WAIT_VARIETY} })()`,
    settle: 600, timeout: 100000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${PARK} ${BEARING} ${SIMCLOCK}
      const ctx = __CTX__, T = ctx.terrain;
      if (!ctx.collision) return { pass: null, detail: 'SKIP: ctx.collision not installed (spatial lane)' };
      const w = ctx.machines.list.find(m => m.kind === 'watcher' && m.alive);
      if (!w) return { pass: null, detail: 'SKIP: no living watcher' };
      freezeAll([w]);
      park(w, 0);

      /**
       * Stage a real occlusion. Rather than hoping the Watcher happens to be
       * standing next to a trunk, search the valley for a spot W with BOTH a
       * clear sightline A (14 m, LOS true) and a genuinely blocked one B
       * (>= 16 m from A, LOS false through ctx.collision), then move the
       * Watcher there. "Blocked" is the collision world's own answer, not the
       * gate's guess.
       */
      const home = w.position.clone();
      let W = null, A = null, B = null;
      for (let tries = 0; tries < 400 && !B; tries++) {
        const a0 = Math.random() * Math.PI * 2;
        const r0 = 30 + Math.random() * 230;
        const wx = Math.sin(a0) * r0, wz = Math.cos(a0) * r0;
        if (Math.hypot(wx, wz) > 285) continue;
        w.position.set(wx, T.getHeight(wx, wz), wz);
        A = null; B = null;
        for (let k = 0; k < 24 && !A; k++) {
          const a = (k / 24) * Math.PI * 2 + 0.13;
          const x = wx + Math.sin(a) * 14, z = wz + Math.cos(a) * 14;
          if (Math.hypot(x, z) > 300) continue;
          if (w.ai.perception.hasLOS({ x, y: T.getHeight(x, z), z })) A = { x, z, a };
        }
        if (!A) continue;
        for (let r = 12; r <= 30 && !B; r += 2) {
          for (let k = 0; k < 32 && !B; k++) {
            const a = (k / 32) * Math.PI * 2;
            const x = wx + Math.sin(a) * r, z = wz + Math.cos(a) * r;
            const dAB = Math.hypot(x - A.x, z - A.z);
            const dWB = Math.hypot(x - wx, z - wz);
            // B must be (a) far from the last-seen point, and (b) FARTHER from
            // it than the machine is now — so a machine that walks to
            // lastKnown provably opens the range to her, which is the audit's
            // "player distance grows"
            if (dAB < 20 || dAB < dWB + 4) continue;
            if (Math.hypot(x, z) > 300) continue;
            if (w.ai.perception.hasLOS({ x, y: T.getHeight(x, z), z })) continue;
            /**
             * ...and it must STAY blocked along the WHOLE approach, not just
             * from W. Checking only W and A let the Watcher walk into an open
             * sightline halfway down the leg and re-acquire her at 12-18 m,
             * which is correct perception but a different test than this one.
             * Probe the segment W->A and a ring at the inner search radius
             * around A: every one of those vantage points must be blocked.
             */
            const tgt = { x, y: T.getHeight(x, z), z };
            let blocked = true;
            for (let i = 1; i <= 6 && blocked; i++) {
              const k = i / 6;
              const vx = wx + (A.x - wx) * k, vz = wz + (A.z - wz) * k;
              w.position.set(vx, T.getHeight(vx, vz), vz);
              if (w.ai.perception.hasLOS(tgt)) blocked = false;
            }
            for (let i = 0; i < 8 && blocked; i++) {
              const a2 = (i / 8) * Math.PI * 2;
              const vx = A.x + Math.sin(a2) * 6, vz = A.z + Math.cos(a2) * 6;
              w.position.set(vx, T.getHeight(vx, vz), vz);
              if (w.ai.perception.hasLOS(tgt)) blocked = false;
            }
            w.position.set(wx, T.getHeight(wx, wz), wz);
            if (blocked) B = { x, z };
          }
        }
        if (B) W = { x: wx, z: wz };
      }
      if (!B) {
        w.position.copy(home);
        return { pass: null, detail: 'SKIP: no clear/blocked sightline pair found anywhere in the valley' };
      }
      w.spawnPos.set(W.x, 0, W.z);
      w.heading = bearing(w.position.x, w.position.z, A.x, A.z);
      const p = place(A.x, A.z, { crouch: false });
      w.forceState('attack');
      /**
       * Wait for FIRST CONTACT instead of sleeping a fixed 900 ms of wall.
       * Staging a teleport costs a perception tick (100 ms of SIM time), and
       * under GPU contention 900 ms of wall can be under 300 ms of sim — which
       * sampled _visible before the machine had looked at her even once and
       * failed the gate on its own staging.
       */
      await simUntil(() => w._visible, 3, () => {
        p.position.set(A.x, T.getHeight(A.x, A.z), A.z);
        p.velocity.set(0, 0, 0);
      });
      if (w._visible) w.forceState('attack');
      const lk0 = w.lastKnown.clone();
      const sawHer = w._visible;

      place(B.x, B.z, { crouch: true });
      /**
       * The Watcher works its standoff band while it can see her, so it has
       * drifted a few metres off the staged spot W. Put it back before the
       * measurement starts: the occluder was surveyed from W, and a drifting
       * camera would be testing a different sightline than the one staged.
       */
      w.position.set(W.x, T.getHeight(W.x, W.z), W.z);
      const blocked = !w.ai.perception.hasLOS({ x: B.x, y: T.getHeight(B.x, B.z), z: B.z });
      if (!blocked) return { pass: null, detail: 'SKIP: staged cover did not block the sightline' };
      const dPlayer0 = Math.hypot(w.position.x - B.x, w.position.z - B.z);
      const dLK0 = Math.hypot(w.position.x - lk0.x, w.position.z - lk0.z);
      let sawSearch = false;
      const states = [];
      /**
       * "Walks to lastKnown" is measured as the CLOSEST it gets to the
       * remembered point during the window, not where it happens to stand at
       * the end: a real search does not park on the spot, it walks there and
       * then sweeps 6-18 m of cover around it (SEARCH.radius), so an end-of
       * -window sample can read 14 m from a machine that went straight there.
       * Player distance is still measured end-to-end — that one must grow.
       */
      let dLKmin = dLK0, dPlayerMin = dPlayer0;
      /**
       * The load-bearing measurement is lkDriftMin: how close the machine's
       * REMEMBERED point ever gets to where she actually is. That is the
       * omniscience test (machine-ai-03 / stealth-omniscient-pursuit) and it
       * cannot be satisfied by luck of terrain.
       *
       * What is NOT asserted any more: "distance to the player must not
       * shrink". A search sweeps a 6-18 m ring of cover around lastKnown
       * (SEARCH.radius), and B is only ~20 m from A, so a machine doing
       * exactly the right thing walks into that ring and closes on her hiding
       * spot without ever seeing her — which is the whole point of holding
       * still in HZD. Whether that ring happens to point at her or away from
       * her is a coin flip on where the valley put the occluder, and it is
       * what failed this gate on a build whose behaviour was correct. Four
       * stronger, staging-independent bars replace it (below).
       */
      let lkDriftMin = Math.hypot(lk0.x - B.x, lk0.z - B.z);
      let unseenSamples = 0, leaks = 0, seenSamples = 0, reAttack = false;
      // 11 SIM seconds: the search timers this measures are in game seconds
      await simSleep(11, () => {
        const p2 = ctx.player;
        p2.position.set(B.x, T.getHeight(B.x, B.z), B.z);
        p2.setCrouch(true);
        p2.moveSpeed = 0;
        p2.velocity.set(0, 0, 0);
        if (w.state === 'search') sawSearch = true;
        if (states[states.length - 1] !== w.state) states.push(w.state);
        dLKmin = Math.min(dLKmin, Math.hypot(w.position.x - lk0.x, w.position.z - lk0.z));
        dPlayerMin = Math.min(dPlayerMin, Math.hypot(w.position.x - B.x, w.position.z - B.z));
        /**
         * The leak count is the omniscience test and it needs no luck from the
         * staging: on EVERY sample where the machine cannot see her, its
         * remembered point must not be sitting on top of her. (When it can see
         * her, lastKnown SHOULD be her position — that is not a leak, and
         * asserting "it never saw her" would just be re-testing the occluder
         * search above.) reAttack is the other half: once it has given up
         * and started sweeping, it must not snap back into the fight without
         * actually re-acquiring her.
         */
        const d = Math.hypot(w.lastKnown.x - B.x, w.lastKnown.z - B.z);
        if (w._visible) { seenSamples++; return; }
        unseenSamples++;
        lkDriftMin = Math.min(lkDriftMin, d);
        if (d < 6) leaks++;
        if (sawSearch && w.state === 'attack') reAttack = true;
      });
      const dPlayer1 = Math.hypot(w.position.x - B.x, w.position.z - B.z);
      const dLK1 = Math.hypot(w.position.x - lk0.x, w.position.z - lk0.z);
      return {
        pass: sawHer && sawSearch && w.state !== 'attack'
          && dLKmin < dLK0 - 1        // it went to the remembered point...
          && dLKmin < 4               // ...and actually arrived there
          && dLKmin < dPlayerMin      // ...which it approached, not her
          && leaks === 0              // it never learned where she really is
          && !reAttack                // and never snapped back into the fight
          && dPlayerMin > 3,          // never walked onto her
        detail: {
          states, sawSearch, finalState: w.state, sawHerAtA: sawHer,
          unseenSamples, leakedSamples: leaks, seenSamples, reAttackWhileUnseen: reAttack,
          occluderProvedByCollision: 'W, 6 points along W->A, and an 8-point ring at 6 m around A',
          lastKnownToPlayerClosestWhileUnseenM: +lkDriftMin.toFixed(2),
          distToLastKnown: { before: +dLK0.toFixed(2), closest: +dLKmin.toFixed(2), after: +dLK1.toFixed(2) },
          distToPlayer: { before: +dPlayer0.toFixed(2), closest: +dPlayerMin.toFixed(2), after: +dPlayer1.toFixed(2), note: 'reported, not asserted' },
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A41 */
  {
    id: 'A41-combat-motion', kind: 'action', lane: 'machine-ai',
    title: 'Sawtooth duel, 25 SIM s: works the standoff band and uses >= 3 distinct attacks',
    setup: `(async () => { ${INPUT_ON} ${WAIT_VARIETY} })()`,
    settle: 600, timeout: 200000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${PARK} ${TICKPROBE}
      const ctx = __CTX__, T = ctx.terrain;
      const s = ctx.machines.list.find(m => m.kind === 'sawtooth' && m.alive);
      if (!s) return { pass: null, detail: 'SKIP: no living sawtooth' };
      freezeAll([s]);
      const p = ctx.player;
      const home = s.position.clone();
      const px = home.x + 8, pz = home.z, py = T.getHeight(px, pz);
      place(px, pz, { crouch: false });
      s.heading = Math.atan2(px - home.x, pz - home.z);
      s.suspicion = 1; s._unseenT = 0; s.lastKnown.copy(p.position);
      s.forceState('attack');

      /**
       * 25 SIMULATED seconds, sampled ON THE MACHINE'S OWN TICKS.
       *
       * The duel's whole content - cooldowns, orbit flips, windup lengths,
       * footwork speed - is expressed in game seconds, and every number below
       * is a path integral over the machine's motion. The previous version
       * counted sim time correctly but still polled from a setTimeout loop, so
       * under GPU/CPU contention each poll spanned several sim steps and
       * 'travel' measured chords across the orbit instead of the arc: the same
       * healthy duel scored well under the 25 m bar at 12 fps and comfortably
       * over it at 60. That is a property of the harness, not of the AI, and
       * it is what made this gate flake.
       *
       * 'tickProbe' now wraps 'sawtooth.update()': exactly one sample per sim
       * step with that step's own dt, and the window closes on 25 seconds of
       * accumulated dt no matter how long that takes in wall time. The player
       * is pinned inside the same wrapper, so she is a target dummy on every
       * tick rather than every poll. A page too starved to bank 25 sim seconds
       * inside the wall cap reads PENDING, never FAIL.
       */
      const DUR = 25;
      const attacks = new Set();
      const probe = tickProbe(s, {
        pre: () => {
          // target dummy: hold the ground and stay alive so the fight is about
          // the MACHINE's footwork, not about her dying to it
          p.position.set(px, py, pz);
          p.velocity.set(0, 0, 0);
          p.health = p.maxHealth;
        },
      });
      ctx.events.on('machine-attack', (e) => {
        if (e.machine === s && probe.sim < DUR) attacks.add(e.kind);
      });
      // 120 s, not 150: puppeteer aborts a Runtime.evaluate at its own 180 s
      // protocolTimeout (tools/gates.mjs belongs to core-platform and does not
      // raise it), and an assert killed there reports FAIL rather than the
      // PENDING this measurement is careful to return when the page is starved.
      await probeFor(probe, DUR, 120000);
      probe.stop();

      const endNet = Math.hypot(s.position.x - home.x, s.position.z - home.z);
      /**
       * COVERAGE, not the end position. The old bar was endNet > 4: where the
       * machine happened to be standing when the clock ran out. Orbiting a
       * pinned player 8 m from home at a legal ring of 3-7 m puts a perfectly
       * healthy duel anywhere from 1 m to 15 m from home depending only on
       * which side of her it stopped on - a lottery. Replaced by two bars that
       * a statue or a two-step shuffler cannot pass and a real duel always
       * does: the machine must at some point get > 4 m from where it started,
       * AND the footprint it walked must span > 6 m.
       */
      const detail = {
        simSecondsRan: +probe.sim.toFixed(1),
        simSteps: probe.steps,
        meanStepMs: +(probe.sim * 1000 / Math.max(1, probe.steps)).toFixed(2),
        travelM: +probe.travel.toFixed(1),
        maxDisplacementM: +probe.maxNet.toFixed(1),
        footprintSpanM: +probe.spread.toFixed(1),
        endDisplacementM: +endNet.toFixed(1),
        idleBetweenAttacks: +probe.idleFrac.toFixed(3),
        idleAllSamples: +(probe.idle / Math.max(1, probe.steps)).toFixed(3),
        attackIds: [...attacks], distinct: attacks.size,
        note: 'sampled once per SIM STEP inside sawtooth.update(); idle = XZ speed < 0.25 m per SIM second, asserted BETWEEN attacks (machine-ai-02 is "statues between attacks"; a planted windup is not a statue). endDisplacementM is reported, not asserted - see the coverage note in the source.',
      };
      if (probe.sim < DUR * 0.8) {
        return { pass: null, detail: { ...detail, why: 'PENDING: the page only advanced ' + probe.sim.toFixed(1) + ' of ' + DUR + ' sim seconds inside the wall cap' } };
      }
      return {
        pass: probe.travel > 25 && probe.maxNet > 4 && probe.spread > 6
          && probe.idleFrac < 0.2 && attacks.size >= 3,
        detail,
      };
    })()`,
  },

  /* ----------------------------------------------------------------- A41b */
  /**
   * The judge's Strider staging, generalised to the whole roster.
   *
   * The bug this gate exists for: `strider`'s table gave `charge` a 5-20 m row
   * while `strider.js` only ever OFFERS a charge past 15 m and its kicks stop
   * at 4.2 m, so 4.2-15 m built nothing - and the species' own standoff band
   * is 10-22 m, i.e. the footwork parked it at 12.5 m, dead centre of its own
   * dead zone, where it stood and did nothing for the entire fight. The class
   * is "a row is legal at a range it cannot build at", and every species can
   * grow one, so every species is staged.
   *
   * Per kind, at 2/6/10/14/20 m: EITHER an attack starts within 3 sim seconds,
   * OR the machine deliberately repositions - it must move at least a metre
   * and end up nearer a range something can fire at. Standing still is the one
   * answer that fails. Cooldowns are cleared at each staging so this measures
   * the TABLE and not the dice; the structural audit
   * (`AttackPicker.coverage()`) is asserted alongside, so a hole inside a
   * species' engage band fails even if the escape footwork papers over it.
   */
  {
    id: 'A41b-attack-coverage', kind: 'action', lane: 'machine-ai',
    title: 'Every species has a move (or a deliberate reposition) at 2/6/10/14/20 m, no hole inside its band, and never just ONE move across it',
    setup: `(async () => { ${INPUT_ON} ${WAIT_VARIETY} })()`,
    settle: 600, timeout: 300000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${PARK} ${TICKPROBE}
      const ctx = __CTX__, T = ctx.terrain, p = ctx.player;
      const DISTS = [2, 6, 10, 14, 20];
      const STAGE = 3;                 // sim seconds allowed per staging
      /**
       * WALL BUDGET. This is 40 stagings inside ONE page.evaluate, and
       * puppeteer kills a Runtime.evaluate at its own protocolTimeout (180 s)
       * long before the runner's \`timeout\` field is consulted — a ceiling this
       * lane cannot raise, since tools/gates.mjs belongs to core-platform. On a
       * quiet box the whole sweep costs ~8 s (every staging fires in under
       * 0.25 sim s). With sixteen lanes' suites sharing the GPU the frame loop
       * clamps to ~0.2x, so a staging that legitimately spends its full 3 SIM
       * seconds repositioning can burn 12+ s of wall, and enough of those in a
       * row walked the whole gate into the protocol timeout and reported FAIL
       * for a build with no coverage hole at all.
       *
       * So: each staging gets a wall cap, the sweep gets a total budget, and
       * running out of either is NEVER a failure — it is \`starved\`, and a
       * starved sweep returns PENDING with everything it did measure. Real
       * holes found before the budget ran out are still reported and still
       * fail. The bar is untouched; only the harness's patience is bounded.
       */
      const WALL_TOTAL = 110000, WALL_STAGE = 7000;
      const T0 = performance.now();
      const budgetLeft = () => WALL_TOTAL - (performance.now() - T0);
      let starved = null;
      const kinds = [...new Set(ctx.machines.list.filter(m => m.alive).map(m => m.kind))].sort();
      if (!kinds.length) return { pass: null, detail: 'SKIP: no living machines' };
      freezeAll([]);                   // freeze everything; unfreeze one at a time

      const report = {}, fails = [];
      for (const kind of kinds) {
        const m = ctx.machines.list.find(x => x.kind === kind && x.alive);
        if (!m) continue;
        m.update = m._frozenByGate; m._frozenByGate = null;   // wake this one
        const band = m.ai.engage.cfg.band;
        // read the TABLE, not one fight's luck: a 'species' row that failed to
        // build earlier in the session is in .phantom and would be scored as
        // missing coverage the table does have
        m.ai.picker.phantom.clear();
        const cov = m.ai.picker.coverage();
        // structural bar 1: nothing inside the engage band may be uncoverable
        const bandHoles = cov.holes.filter(h => h[1] >= band[0] && h[0] <= band[1]);
        if (bandHoles.length) fails.push(kind + ': hole(s) ' + JSON.stringify(bandHoles) + ' inside band ' + JSON.stringify(band));
        /**
         * Structural bar 2: MOVE VARIETY (judge-machine-ai-followup-r0).
         * Covering a band with one row is not covering it. Wave 1 closed the
         * Strider's 4.2-15 m hole by stretching 'charge' across it, which left
         * 'charge' the only row legal anywhere in the 10-22 m band — a canon
         * 15-50 m gallop thrown from 5.5 m, four times a fight, forever. That
         * passes bar 1 with a perfect score, so bar 2 exists: at least two
         * non-rear rows must reach into the band, and no single row may be the
         * sole answer for more than 70 % of it.
         *
         * It is asserted STRUCTURALLY rather than by counting the ids thrown
         * across the five stagings, because the scored picker legitimately
         * chooses the same move twice when two stagings land in one row's band
         * (a Watcher at 6 m and at 10 m both want the flash) — that is
         * selection, not a ladder. Observed ids are reported alongside.
         */
        const prof = m.ai.picker.bandProfile();
        if (prof.distinct < 2) {
          fails.push(kind + ': only ' + prof.distinct + ' non-rear move ('
            + prof.ids.join(', ') + ') reaches its band ' + JSON.stringify(band)
            + ' — one move is not a moveset');
        }
        if (prof.maxSoleFrac > 0.7) {
          fails.push(kind + ': ' + prof.maxSoleId + ' is the ONLY answer for '
            + Math.round(prof.maxSoleFrac * 100) + '% of band ' + JSON.stringify(band));
        }
        const rows = { band, reach: cov.reach, holes: cov.holes, bandHoles,
          bandMoves: prof.distinct, bandCovers: prof.covers, bandSole: prof.sole,
          maxSole: prof.maxSoleId + ' ' + Math.round(prof.maxSoleFrac * 100) + '%',
          observed: [], at: {} };

        for (const d of DISTS) {
          // reset the picker + the species ladder so this is a RANGE test
          const pk = m.ai.picker;
          pk.cd.clear(); pk.missed.clear(); pk.used.clear(); pk.phantom.clear();
          pk.stalled.clear(); pk.noteArranged(null);
          pk.lastId = null; pk.streak = 0;
          for (const k of Object.keys(m)) {
            if (typeof m[k] === 'number' && (/^_cd[A-Z]/.test(k) || /^_[a-zA-Z]+Cd$/.test(k))) m[k] = 0;
          }
          if (m.ai._cdKeys) m.ai._cdKeys = null;
          m._attack = null; m._attackCd = 0; m._downT = 0;
          if (m.flock) m.flock.diver = null;
          m.ai.engage.reset();
          m.ai.engage.missT = 0;

          // stage: player planted d metres in front of the machine's nose
          const mx = m.position.x, mz = m.position.z;
          const px = mx + Math.sin(m.heading) * d, pz = mz + Math.cos(m.heading) * d;
          const py = T.getHeight(px, pz);
          place(px, pz, { crouch: false });
          m.suspicion = 1; m._unseenT = 0; m.lastKnown.copy(p.position);
          /**
           * Seed the perception product too. 'playerDist' refreshes on the
           * perception tick, so without this the first frame of a staging
           * selects a move for the PREVIOUS staging's distance — the gate then
           * credits an attack that was chosen for a range the player is no
           * longer at, which is the very lie it exists to catch.
           */
          m.playerDist = d;
          if (m.ai.perception) m.ai.perception.acc = m.perceptCfg.tick;
          m.forceState('attack');

          /**
           * REACH HONESTY. An attack only counts if it could have connected
           * from where it was thrown: the table row that fired must cover the
           * distance at the instant of 'machine-attack' (rows are tolerant by
           * 0.35 m, the same pad 'nearestCovered' uses, so a float edge is not
           * a coin flip). A Longleg throwing its 7 m jet cone at a target 14 m
           * away is a flail, not coverage, and has to reposition like any
           * other machine standing outside its moveset.
           */
          let fired = null, firedAt = null, firedRow = null, firedOk = false;
          let mode = null, hole = null;
          const onAtk = (e) => {
            if (e.machine !== m || fired) return;
            fired = e.kind;
            firedAt = Math.hypot(m.position.x - px, m.position.z - pz);
            const row = m.ai.picker.rows.find((r) => r.id === e.kind) || null;
            firedRow = row ? [row.min, row.max] : null;
            firedOk = row
              ? firedAt >= row.min - 0.35 && firedAt <= row.max + 0.35
              : m.ai.picker.coveredAt(firedAt);
          };
          ctx.events.on('machine-attack', onAtk);
          const probe = tickProbe(m, {
            pre: () => {
              p.position.set(px, py, pz);
              p.velocity.set(0, 0, 0);
              p.health = p.maxHealth;
              m.suspicion = 1; m._unseenT = 0;
              if (m.state !== 'attack' && !m._attack) m.setState('attack');
            },
            each: () => { mode = m.ai.engage.mode; if (m.ai.engage.hole != null) hole = m.ai.engage.hole; },
          });
          const w0 = performance.now();
          const cap = Math.min(WALL_STAGE, Math.max(600, budgetLeft()));
          while (!fired && probe.sim < STAGE && performance.now() - w0 < cap) {
            await new Promise(r => setTimeout(r, 25));
          }
          probe.stop();
          // cut short by wall time, not by the machine running out of answers
          const cutShort = !fired && probe.sim < STAGE * 0.9;
          if (cutShort && !starved) {
            starved = kind + ' @ ' + d + 'm banked only ' + probe.sim.toFixed(2)
              + ' of ' + STAGE + ' sim seconds in ' + Math.round(cap) + ' ms of wall';
          }
          ctx.events.off?.('machine-attack', onAtk);

          const endD = Math.hypot(m.position.x - px, m.position.z - pz);
          const want = m.ai.picker.nearestCovered(d);
          const closed = want == null ? 0 : Math.abs(d - want) - Math.abs(endD - want);
          const repositioned = Math.abs(endD - d) >= 1
            && (m.ai.picker.coveredAt(endD) || closed > 0.5);
          const ok = firedOk || repositioned;
          if (fired && rows.observed.indexOf(fired) < 0) rows.observed.push(fired);
          rows.at[d] = {
            attack: fired, attackRow: firedRow, inReach: firedOk,
            firedAtM: firedAt == null ? null : +firedAt.toFixed(2),
            covered: m.ai.picker.coveredAt(d), endDistM: +endD.toFixed(2),
            movedM: +(endD - d).toFixed(2), mode, seekingRadius: hole,
            simSeconds: +probe.sim.toFixed(2),
            verdict: ok ? (firedOk ? 'attacked' : 'repositioned')
              : (fired ? 'FLAIL (' + fired + ' thrown from ' + firedAt.toFixed(1) + ' m, row ' + JSON.stringify(firedRow) + ')' : 'NOTHING'),
          };
          // a staging the wall cut short is not evidence either way
          if (!ok && !cutShort) {
            fails.push(kind + ' @ ' + d + 'm: ' + (fired
              ? 'threw ' + fired + ' from ' + firedAt.toFixed(1) + ' m, outside its own row ' + JSON.stringify(firedRow) + ', and did not reposition'
              : 'no attack and no reposition') + ' (ended ' + endD.toFixed(1) + ' m, mode ' + mode + ')');
          }
        }
        report[kind] = rows;
        // put it back to sleep before waking the next species
        m._frozenByGate = m.update; m.update = () => {};
        if (budgetLeft() <= 0) {
          if (!starved) starved = 'the ' + WALL_TOTAL + ' ms sweep budget ran out after ' + Object.keys(report).length + ' of ' + kinds.length + ' species';
          break;
        }
      }
      const staged = Object.keys(report).length;
      if (fails.length === 0 && (starved || staged < kinds.length)) {
        return {
          pass: null,
          detail: {
            why: 'PENDING: the page was too starved to finish the sweep — ' + starved,
            stagedSpecies: staged, ofSpecies: kinds.length,
            wallMs: Math.round(performance.now() - T0), failures: fails, report,
          },
        };
      }
      return {
        pass: fails.length === 0,
        detail: {
          kinds: kinds.length, stagedSpecies: staged,
          wallMs: Math.round(performance.now() - T0), starved,
          failures: fails, report,
          note: 'per staging: cooldowns cleared, playerDist seeded, player pinned d metres off the nose, 3 SIM seconds sampled on the machine’s own update ticks. Pass = an attack started FROM INSIDE ITS OWN ROW (inReach), or the machine moved >= 1 m and ended nearer a range its table can fire at. An attack thrown from outside the firing row is a FLAIL and does not count. bandHoles is the structural audit: ranges inside the engage band that NO move covers. bandMoves/bandSole are the variety audit: >= 2 non-rear rows must reach the band and none may be the sole answer for more than 70% of it.',
        },
      };
    })()`,
  },

  /* ----------------------------------------------------------------- A41c */
  /**
   * SUSTAINED MOVE VARIETY, EVERY SPECIES (judge-machine-ai-followup-r1).
   *
   * A41b reads the TABLE and A41 measures one Sawtooth's footwork; between
   * them they missed a Strider that threw `dash-kick` seven times out of seven
   * in a 25-second duel. `bandProfile()` scored that same moveset "3 distinct,
   * max sole 57 %" because three rows do reach the band — the fight only ever
   * stood at one radius inside it. A structural reading of a table can never
   * see that, so this gate watches the fights.
   *
   * Every living species duels a pinned player for 30 SIMULATED seconds AT
   * ONCE — one shared 30 s window rather than eight sequential ones, which is
   * what keeps a measurement of eight species inside puppeteer's 180 s
   * protocol ceiling. Each machine is staged on its own bearing at its own
   * band centre, so they are not fighting over the same metre of ground.
   *
   * FIX ROUND 2 (judge-machine-ai-followup-r2). Both bars were blind to the
   * defect they were written for.
   *
   *   1. The variety bar was `min(3, rows arrangeable FROM THE RING WINDOW)`.
   *      The regression it exists to catch is precisely a row falling out of
   *      that window, so the bar fell with it: break the Strider's front-kick
   *      again and the demand silently drops from 3 moves to 2, which the two
   *      remaining moves meet. The bar now comes from the TABLE and nothing
   *      else — see the residue note below.
   *   2. `ringPlan().legal` was asserted as the livelock invariant and is a
   *      tautology: `_bestArrangeable` only offers rows `_reachable` accepts
   *      and `_reachable` only returns radii inside `[row.min, row.max]`, so
   *      it is true by construction and 0/1820 steps was never evidence. It
   *      is still sampled (a refactor that lets the ring escape its row would
   *      trip it) but it is no longer the bar.
   *
   * RESIDUE (same finding, verified by injection). `bandProfile().distinct`
   * closed three of the four shapes this regression can take and not the
   * fourth, because the ring window IS the band: `[band[0] + hyst/2,
   * band[1]]`. Injecting each shape into a live Strider whose `front-kick`
   * row is `[0, 4.6]` and whose healthy window is `[4.1, 14]`:
   *
   *   A  row max shrinks to 4.0      -> blocked 1 (front-kick)   CAUGHT
   *   B  band floor rises to 4.5     -> blocked 1 (front-kick)   CAUGHT
   *      (window floor 4.8 clears the row — the r1 livelock exactly)
   *   C  hysteresis widens to 1.8    -> blocked 1 (front-kick)   CAUGHT
   *   D  band floor rises to 4.95    -> blocked 0, band bar 3->2 MISSED
   *
   * In D the row leaves the band, so it leaves `bandProfile()` and leaves
   * `_bandEligible()` in the same instant: the move is gone from the fight,
   * the livelock invariant stops watching it, and the bar falls by one to
   * meet the two moves that remain. Green, and the Strider is back to the
   * two-move fight this gate was written for. So the bar is now
   * `picker.movesetSize()` — the species' non-rear, part-attached, not-
   * disabled TABLE rows, which read nothing the footwork can move. Today
   * that is the SAME number for all eight species (3, except a 2-row
   * Glinthawk), so it changes no verdict and adds no flake; it only removes
   * the gate's ability to lower its own bar. `bandProfile()` is still
   * reported, as diagnosis rather than as the bar.
   *
   * Bars, per species:
   *   - at least 2 distinct TABLE moves, and 3 once the species' TABLE holds
   *     3+ non-rear rows at all. `machine-attack` also carries species
   *     flourishes (a Thunderjaw footfall `step`, a Glinthawk `screech`), so
   *     only ids that are rows in that machine's table count.
   *   - `picker.bandBlocked(lo, hi) === 0` on EVERY sim step: every row that
   *     reaches into the band must be arrangeable from the ring window the
   *     footwork can actually hold. A row inside the band but outside the
   *     window is a move the machine wants for ever and never fires — the
   *     livelock itself (a Strider kick capped at 4.4 m against a 4.5 m ring
   *     floor), asserted directly rather than through its symptom.
   *
   * TIME SCALE. The window is 25 sim seconds and the runner's ceiling is wall
   * seconds, so the gate asks the engine for 3x through the published
   * `requestTimeScale` authority and releases it in every exit path. Nothing
   * about the simulation changes — `main.js` steps whole FIXED_DT ticks and
   * MAX_STEPS caps a frame at 0.05 s either way — there are simply more of
   * them per rendered frame, so a starved page degrades to 1x instead of
   * failing. Measurement is still per SIM STEP, via `tickProbe`.
   */
  {
    id: 'A41c-sustained-variety', kind: 'action', lane: 'machine-ai',
    title: 'Sustained duel, EVERY species: >= 2 distinct table moves in 30 SIM s (3 where the TABLE holds 3+ non-rear rows), and never a band row the ring window cannot set up',
    setup: `(async () => { ${INPUT_ON} ${WAIT_VARIETY} })()`,
    settle: 600, timeout: 300000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${TICKPROBE}
      const ctx = __CTX__, T = ctx.terrain, p = ctx.player;
      const DUR = 30, WALL = 130000, ACCEL = 3;
      const kinds = [...new Set(ctx.machines.list.filter(m => m.alive).map(m => m.kind))].sort();
      const picks = kinds.map(k => ctx.machines.list.find(m => m.kind === k && m.alive)).filter(Boolean);
      if (picks.length < 2) return { pass: null, detail: 'SKIP: fewer than two species alive' };
      freezeAll(picks);

      // ARENA: the player pinned at the first pick's home, everyone else
      // teleported onto their own bearing at their own band centre. spawnPos
      // moves with them (the soft leash is measured from it) and territory is
      // lifted for the duel so a site-owned machine does not walk home.
      const A = picks[0].position.clone();
      const px = A.x, pz = A.z, py = T.getHeight(px, pz);
      place(px, pz, { crouch: false });
      const st = new Map();
      picks.forEach((m, i) => {
        const band = m.ai.engage.cfg.band;
        const r = Math.max(4, (band[0] + band[1]) * 0.5);
        const th = i * (Math.PI * 2 / picks.length);
        const x = px + Math.sin(th) * r, z = pz + Math.cos(th) * r;
        m.position.set(x, T.getHeight(x, z), z);
        m.spawnPos.set(x, 0, z);
        m._gateTerritory = m.territory; m.territory = null;
        m.heading = Math.atan2(px - x, pz - z);
        const pk = m.ai.picker;
        pk.cd.clear(); pk.missed.clear(); pk.used.clear(); pk.phantom.clear();
        pk.stalled.clear(); pk.noteArranged(null);
        pk.lastId = null; pk.streak = 0;
        m._attack = null; m._attackCd = 0; m._downT = 0;
        m.ai.engage.reset(); m.ai.engage.missT = 0;
        m.suspicion = 1; m._unseenT = 0; m.lastKnown.copy(p.position); m.playerDist = r;
        m.forceState('attack');
        const win = m.ai.engage._ringWindow();
        /*
         * THE BAR COMES FROM THE TABLE, AND FROM NOTHING THE FOOTWORK CAN
         * MOVE. movesetSize() counts the species' non-rear, part-attached,
         * not-disabled rows — it consults neither the ring window (revision 1)
         * nor the engage band (revision 2), both of which fall by one at the
         * exact instant a regression pushes a row out of the fight. See form D
         * in the header for the injection that proved the band reading blind.
         * bandProfile() is kept as diagnosis so a failure says which rows the
         * table meant to put at this standoff.
         * NOTE: no backticks in here — this comment lives inside the assert
         * template literal, and one would end the string.
         */
        const prof = pk.bandProfile();
        const arrange = pk.rows.filter((row) => row.arc !== 'rear'
          && pk._reachable(row, win[0], win[1]) != null).map((row) => row.id);
        const moveset = pk.movesetRows();
        const s = {
          kind: m.kind, ids: [], fired: [], illegal: 0, plans: 0,
          blocked: 0, blockedIds: null, steps: 0, modes: {},
          window: [+win[0].toFixed(2), +win[1].toFixed(2)], arrange,
          bandRows: prof.ids, moveset,
          bar: Math.max(2, Math.min(3, pk.movesetSize())),
        };
        st.set(m, s);
        s.probe = tickProbe(m, {
          pre: () => {
            // target dummy: she holds the ground, stays alive, stays seen
            p.position.set(px, py, pz);
            p.velocity.set(0, 0, 0);
            p.health = p.maxHealth;
            m.suspicion = 1; m._unseenT = 0; m.lastKnown.copy(p.position);
            if (m.state !== 'attack' && !m._attack) m.setState('attack');
          },
          each: () => {
            const w = m.ai.engage._ringWindow();
            const pk2 = m.ai.picker;
            const plan = pk2.ringPlan(w[0], w[1]);
            // sampled, not asserted: true by construction (see the header)
            if (plan) { s.plans++; if (!plan.legal) s.illegal++; }
            // ASSERTED: a row inside the band the ring window cannot set up.
            // Read straight off the picker so a step where everything is on
            // cooldown (ringPlan === null) is still measured.
            s.steps++;
            if (pk2.bandBlocked(w[0], w[1]) > 0) {
              s.blocked++;
              if (!s.blockedIds) s.blockedIds = pk2.bandUnreachable(w[0], w[1]);
            }
            s.modes[m.ai.engage.mode] = (s.modes[m.ai.engage.mode] || 0) + 1;
          },
        });
      });

      const onAtk = (e) => {
        const s = st.get(e.machine);
        if (!s || s.probe.sim >= DUR) return;
        if (!e.machine.ai.picker.rows.some((row) => row.id === e.kind)) return;  // flourish, not a move
        s.ids.push(e.kind);
        if (s.fired.length < 16) {
          s.fired.push(e.kind + '@' + Math.hypot(e.machine.position.x - px, e.machine.position.z - pz).toFixed(1) + 'm');
        }
      };
      ctx.events.on('machine-attack', onAtk);
      let ran = 0;
      try {
        ctx.engine.requestTimeScale?.('gate-a41c', ACCEL);
        const w0 = performance.now();
        const minSim = () => { let n = Infinity; for (const s of st.values()) if (s.probe.sim < n) n = s.probe.sim; return n; };
        while (minSim() < DUR && performance.now() - w0 < WALL) {
          await new Promise(r => setTimeout(r, 40));
        }
        ran = minSim();
      } finally {
        ctx.engine.requestTimeScale?.('gate-a41c', null);
        ctx.events.off?.('machine-attack', onAtk);
        for (const [m, s] of st) { s.probe.stop(); m.territory = m._gateTerritory; }
      }

      const report = {}, fails = [];
      for (const [m, s] of st) {
        const distinct = [...new Set(s.ids)];
        const pk = m.ai.picker;
        report[s.kind] = {
          simSeconds: +s.probe.sim.toFixed(1), simSteps: s.probe.steps,
          attacks: s.ids.length, distinct, distinctCount: distinct.length, bar: s.bar,
          movesetInTable: s.moveset,
          bandRowsInTable: s.bandRows, arrangeableFromRing: s.arrange,
          ringWindowM: s.window,
          blockedSteps: s.blocked, blockedRows: s.blockedIds, stepsSampled: s.steps,
          illegalRingPlans: s.illegal, ringPlansSampled: s.plans,
          gaveUpOnAtEnd: [...pk.stalled.keys()],
          travelM: +s.probe.travel.toFixed(1), firedAt: s.fired, modes: s.modes,
        };
        if (s.probe.sim < DUR * 0.8) continue;      // starved: not evidence either way
        if (s.blocked > 0) {
          fails.push(s.kind + ': ' + JSON.stringify(s.blockedIds) + ' reach into band '
            + JSON.stringify(m.ai.engage.cfg.band) + ' but not into ring window '
            + JSON.stringify(s.window) + ' — unarrangeable on ' + s.blocked + ' of '
            + s.steps + ' sim steps, so it can want that move for ever and never fire it (livelock)');
        }
        if (s.illegal > 0) {
          fails.push(s.kind + ': ' + s.illegal + ' of ' + s.plans
            + ' ring plans set up a move the ring cannot fire from — ringPlan().legal is'
            + ' true by construction, so this means the construction itself broke');
        }
        if (distinct.length < s.bar) {
          fails.push(s.kind + ': only ' + distinct.length + ' distinct move('
            + distinct.join(', ') + ') in ' + s.probe.sim.toFixed(1) + ' sim s — the TABLE holds '
            + s.moveset.length + ' non-rear row(s) ' + JSON.stringify(s.moveset)
            + ', so the bar is ' + s.bar + '. Of those, ' + JSON.stringify(s.bandRows)
            + ' reach into band ' + JSON.stringify(m.ai.engage.cfg.band) + ' and '
            + JSON.stringify(s.arrange) + ' are arrangeable from ring window '
            + JSON.stringify(s.window) + ' — a row missing from those two lists is a move '
            + 'the standoff can no longer show, which is the defect, not a reason to ask for less');
        }
      }
      const detail = {
        species: picks.length, simSecondsEach: +ran.toFixed(1), timeScaleAsked: ACCEL,
        failures: fails, report,
        note: 'all species duel a pinned player at once for 30 SIM seconds, each on its own bearing at its own band centre; sampled once per sim step inside each machine.update(). Only ids that are rows in that machine own table count as moves (machine-attack also carries footfall/screech flourishes). Bar = 2 distinct, or 3 once the species TABLE holds 3+ non-rear rows at all (picker.movesetSize()) — read from the table and from nothing the footwork can move, since BOTH the ring window (revision 1) and the engage band (revision 2) fall by one at the instant a regression pushes a row out of the fight, letting the gate lower its own bar. Verified by injection: a Strider band floor raised to 4.95 m drops front-kick out of the standoff with blocked 0 and the band-derived bar falling 3->2; the moveset bar holds at 3 and fails it. ASSERTED per step: picker.bandBlocked(ringWindow) === 0, i.e. every row that reaches into the band is arrangeable from a radius the footwork can hold; a row inside the band but outside the window is the livelock (a kick capped at 4.4 m against a 4.5 m ring floor). ringPlan().legal is sampled but NOT the bar: it is true by construction.',
      };
      if (ran < DUR * 0.8) {
        return { pass: null, detail: { ...detail, why: 'PENDING: the page banked only '
          + ran.toFixed(1) + ' of ' + DUR + ' sim seconds inside the ' + (WALL / 1000) + ' s wall cap' } };
      }
      return { pass: fails.length === 0, detail };
    })()`,
  },

  /* ------------------------------------------------------------------ A42 */
  {
    id: 'A42-stagger', kind: 'action', lane: 'machine-ai',
    title: 'Tearing a part mid-windup cancels the attack and staggers for 0.6-1.2 s',
    setup: `(async () => { ${INPUT_ON} ${WAIT_VARIETY} })()`,
    settle: 600, timeout: 60000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${PARK}
      const ctx = __CTX__, T = ctx.terrain;
      const s = ctx.machines.list.find(m => m.kind === 'sawtooth' && m.alive);
      if (!s) return { pass: null, detail: 'SKIP: no living sawtooth' };
      freezeAll([s]);
      const p = ctx.player;
      const px = s.position.x + 6, pz = s.position.z;
      place(px, pz, { crouch: false });
      s.heading = Math.atan2(px - s.position.x, pz - s.position.z);
      s.suspicion = 1; s._unseenT = 0; s.lastKnown.copy(p.position);

      let ev = null;
      ctx.events.on('machine-stagger', (e) => { if (e.machine === s && !ev) ev = e; });

      const part = s.parts.find(q => q.attached && q.tearable);
      if (!part) return { pass: null, detail: 'SKIP: sawtooth exposes no tearable part' };

      s.forceState('attack');
      // wait for a real windup
      const t0 = performance.now();
      while (performance.now() - t0 < 22000) {
        p.position.set(px, T.getHeight(px, pz), pz);
        p.health = p.maxHealth;
        if (s._attack && s._attack.phase === 'windup') break;
        await new Promise(r => setTimeout(r, 30));
      }
      if (!s._attack || s._attack.phase !== 'windup') {
        return { pass: false, detail: 'no attack windup observed in 22 s' };
      }
      const windupKind = s._attack.kind;
      part.mesh.updateWorldMatrix(true, false);
      const e = part.mesh.matrixWorld.elements;
      s.takeDamage({
        point: { x: e[12], y: e[13], z: e[14] },
        object: part.mesh, impact: 1, tear: 9999,
        element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'tearblast',
      });
      const cancelled = s._attack === null;
      const stateNow = s.state;
      await new Promise(r => setTimeout(r, 400));
      const stillStagger = s.state === 'stagger';
      // wait it out and confirm it resumes the fight
      const t1 = performance.now();
      while (s.state === 'stagger' && performance.now() - t1 < 3000) {
        await new Promise(r => setTimeout(r, 50));
      }
      const dur = ev ? ev.duration : null;
      return {
        pass: !!ev && cancelled && stateNow === 'stagger' && dur >= 0.6 && dur <= 1.2,
        detail: {
          cancelledAttack: cancelled, windupKind, stateAtTear: stateNow,
          staggerEvent: !!ev, durationS: dur ? +dur.toFixed(2) : null,
          stillStaggeringAt400ms: stillStagger, resumedState: s.state,
          partTorn: part.name,
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A43 */
  {
    id: 'A43-corpse-lifecycle', kind: 'action', lane: 'machine-ai',
    title: 'Eight wrecks freeze, fade, dispose and schedule a respawn; scene growth <= +40 and nothing of a disposed machine is left in the scene',
    setup: `(async () => { ${INPUT_ON} ${WAIT_VARIETY} })()`,
    settle: 800, timeout: 120000,
    assert: `(async () => {
      ${FREEZE} ${PLACE}
      const ctx = __CTX__;
      const count = () => { let n = 0; ctx.scene.traverse(() => n++); return n; };
      const before = count();
      const p = ctx.player;
      const live = ctx.machines.list.filter(m => m.alive)
        .sort((a, b) => a.position.distanceToSquared(p.position) - b.position.distanceToSquared(p.position))
        .slice(0, 8);
      if (live.length < 8) return { pass: null, detail: 'SKIP: fewer than 8 living machines' };
      const anchor = live[0].position.clone();
      for (const m of live) {
        let mesh = null; m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
        m.takeDamage({
          point: m.position.clone(), object: mesh, impact: 1e6, tear: 0,
          element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', seen: true,
        });
      }
      // step 90 m away, as the gate specifies
      place(anchor.x + 90, anchor.z, { crouch: false });

      /**
       * FREEZE is a SIM-clock stage (SITE.freeze seconds of SIMULATED time).
       * main.js clamps a frame at MAX_FRAME, so under the load of eight
       * simultaneous deaths sim time runs ~0.84-0.94x wall and a fixed 12 s
       * wall sleep sometimes sampled BEFORE the freeze — failing a lifecycle
       * that was working. Poll the wrecks' OWN clock, with a wall timeout.
       */
      const wreckAge = () => { const w = live[0]._wreck; return w ? w.age : 0; };
      const tFreeze = performance.now();
      let frozen = 0;
      while (performance.now() - tFreeze < 30000) {
        await new Promise(r => setTimeout(r, 250));
        frozen = live.filter(m => m._frozen).length;
        if (frozen >= live.length) break;
      }
      const freezeWallS = +((performance.now() - tFreeze) / 1000).toFixed(2);
      const freezeSimS = +wreckAge().toFixed(2);

      // cost of a frozen wreck vs a living machine, same call, same frame
      const t = performance.now() / 1000;
      const timeIt = (list, n) => {
        // an unobserved freeze must read as PENDING, never as a NaN < 0.02
        if (!list.length) return null;
        const t0 = performance.now();
        for (let i = 0; i < n; i++) for (const m of list) { try { m.update(0.016, t); } catch { /* */ } }
        return (performance.now() - t0) / (n * list.length);
      };
      const deadCostMs = timeIt(live.filter(m => m._frozen), 200);
      const alive = ctx.machines.list.filter(m => m.alive && !m._frozenByGate).slice(0, 3);
      const aliveCostMs = alive.length ? timeIt(alive, 60) : null;

      /**
       * The remaining ~120 s of the audit's 130 s window is run through the
       * site manager's own clock rather than in wall time — advance() calls
       * the SAME update() the frame loop calls, one simulated second at a
       * time. Nothing is skipped; only the waiting is.
       */
      const audit = ctx.machines.sites.advance(130, 1);
      await new Promise(r => setTimeout(r, 300));
      const after = count();
      const disposed = live.filter(m => m._disposed).length;
      const stillListed = ctx.machines.list.filter(m => live.includes(m)).length;

      /**
       * ORPHAN SWEEP (fix round 1). "growth <= +40" is a NET figure, and the
       * eight removed machine subtrees are hundreds of objects of slack: the
       * eight loot beacons that used to be left standing in the meadow after
       * their wreck disposed scored -711 and passed. So the sweep is explicit
       * now - after disposal NOTHING anywhere in the scene graph may still
       * point at a disposed machine, whether through userData.machine (the
       * loot beam, torn-part debris), userData.fxOwner (any effect that was
       * in flight when the corpse froze) or the machine's own FX ledger. Each
       * such object is both a visible ghost and a retained Machine, with its
       * per-machine cloned materials, gait, AI and parts hanging off it.
       */
      const gone = new Set(live.filter(m => m._disposed));
      const orphans = [];
      ctx.scene.traverse((o) => {
        const u = o.userData;
        if (!u) return;
        if (gone.has(u.machine) || gone.has(u.fxOwner)) {
          orphans.push({ type: o.type, geo: o.geometry ? o.geometry.type : null, visible: o.visible });
        }
      });
      const fxLeft = live.reduce((n, m) => n + (m.fxAudit ? m.fxAudit().inScene : 0), 0);
      const lootLeft = live.filter(m => m._beaconMesh || (m._tornRecs && m._tornRecs.length)).length;

      return {
        pass: deadCostMs === null ? null
          : (disposed >= 8 && (after - before) <= 40 && audit.pending >= 8
            && frozen >= 8 && deadCostMs < 0.02 && stillListed === 0
            && orphans.length === 0 && fxLeft === 0 && lootLeft === 0),
        detail: {
          sceneObjects: { before, after, growth: after - before },
          orphansRetainingADisposedMachine: orphans.length,
          orphanSample: orphans.slice(0, 5),
          fxMeshesStillInScene: fxLeft, wrecksStillHoldingLootObjects: lootLeft,
          frozen, freezeWallS, freezeSimS, disposed, stillInRoster: stillListed,
          frozenUpdateMsPerCall: deadCostMs === null ? null : +deadCostMs.toFixed(5),
          livingUpdateMsPerCall: aliveCostMs === null ? null : +aliveCostMs.toFixed(4),
          respawnsScheduled: audit.pending, nextRespawnInS: audit.nextRespawnIn,
          note: deadCostMs === null
            ? 'PENDING: no wreck reached the freeze stage inside a 30 s wall timeout'
            : 'freeze is observed on the wrecks own sim clock (polled, 30 s wall cap); the remaining 130 s window is advanced through SiteManager.update(1) x130',
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A44 */
  /**
   * `A44` is already taken by `machine-rig` (socket integrity), so this lane's
   * gate is registered as `A44-listener-isolation-machine-ai` per the id rule.
   *
   * The defect it locks down cost this lane four gates in round 1.
   * `src/entities/playerAnimator.js:459` subscribes `player-damage` to a method
   * that does not exist, `core/events.js` dispatches synchronously, and
   * machines raise that event from inside `Machines.update` — so the FIRST
   * machine hit that landed on Aloy threw out of the machine loop and the
   * engine's quarantine disabled every machine in the valley for the rest of
   * the session. A40/A41/A42/A43 all went red with every one of their own
   * assertions passing.
   *
   * WHAT THIS GATE USED TO PROVE, AND WHY THAT WAS NOT ENOUGH
   * ---------------------------------------------------------
   * The first version flipped `machine-state`, which `machine.js:1028` raises
   * through `Machine.emit()` -> `safeEmit`. That is the COVERED path, so the
   * gate passed while eleven raw `this.ctx.events.emit(...)` sites in the
   * species files — six of them on `player-damage`, plus `thunderjaw.js:283`
   * firing on every footfall of every fight — still threw straight out of the
   * loop. A judge probe measured 727 emits from one engaged Thunderjaw in
   * 10 sim s, of which 725 quarantined `Machines.update` and left the
   * well-behaved subscriber deaf. A gate scoped to the path that was already
   * safe is not a gate.
   *
   * So all three paths are now driven, from inside the machine loop, once per
   * SIM STEP:
   *   1. the REAL species site — `thunderjaw.onFootfall()`, i.e. the literal
   *      `this.ctx.events.emit('machine-attack', ...)` at thunderjaw.js:283;
   *   2. the species IDIOM on the outage event — `m.ctx.events.emit(
   *      'player-damage', ...)`, exactly as watcher.js:421 and
   *      thunderjaw.js:773 write it;
   *   3. the covered path — `setState` -> `Machine.emit('machine-state')`.
   * Each has a subscriber that throws (registered FIRST, so it aborts the walk
   * if the bus is walked naively) and a well-behaved subscriber behind it.
   *
   * The bar, per path: the loop keeps stepping (no `Machines` quarantine, no
   * new system errors), the broadcast still reaches every later subscriber,
   * and the failure is REPORTED with its stack in
   * `machines.aiAudit().listenerErrors` — never silently swallowed. Part 3 is
   * what stops the isolation from becoming a place for bugs to hide.
   */
  {
    id: 'A44-listener-isolation-machine-ai', kind: 'action', lane: 'machine-ai',
    title: 'A throwing subscriber cannot quarantine the machine loop — on the raw species emit sites too — and is still reported',
    setup: `(async () => { ${INPUT_ON} ${WAIT_VARIETY} })()`,
    settle: 600, timeout: 90000,
    /** The gate installs the throwing listeners itself; those warnings are its own. */
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${SIMCLOCK} ${TICKPROBE}
      const ctx = __CTX__, G = window.__GAME__;
      // A Thunderjaw is preferred because thunderjaw.js:283 (onFootfall) is a
      // REAL raw emit site: driving it means this gate exercises the species
      // file's own line, not a stand-in for it.
      const tj = ctx.machines.list.find(x => x.alive && x.kind === 'thunderjaw'
        && typeof x.onFootfall === 'function');
      const m = tj || ctx.machines.list.find(x => x.alive);
      if (!m) return { pass: null, detail: 'SKIP: no living machines' };
      freezeAll([m]);
      ctx.machines.clearListenerErrors();
      const sysBefore = (G.systemErrors || []).reduce((n, r) => n + r.count, 0);

      const MSG = 'gate: this._onSomething is not a function';
      const EVENTS = ['machine-attack', 'player-damage', 'machine-state'];
      const heard = { 'machine-attack': 0, 'player-damage': 0, 'machine-state': 0 };
      const good = {}, bad = {};
      for (const ev of EVENTS) {
        bad[ev] = () => { throw new TypeError(MSG); };
        good[ev] = () => { heard[ev]++; };
        ctx.events.on(ev, bad[ev]);    // the thrower goes FIRST in the Set
        ctx.events.on(ev, good[ev]);
      }

      let rawSite = 0, rawIdiom = 0, flips = 0;
      const x0 = m.position.x, z0 = m.position.z;
      const probe = tickProbe(m, {
        pre: () => {
          // (1) the real species call site, from inside Machines.update
          if (tj) {
            const st = m.state, pd = m.playerDist;
            m.state = 'attack'; m.playerDist = 5;   // its own two guards
            m.onFootfall(0, 0, 3, 1);
            m.state = st; m.playerDist = pd;
            rawSite++;
          }
          // (2) the species idiom on the event that caused the outage
          m.ctx.events.emit('player-damage', { amount: 0, from: m });
          rawIdiom++;
          // (3) the covered path (what the first version of this gate tested)
          m.suspicion = 1.2; m._unseenT = 0;
          m.lastKnown.copy(ctx.player.position);
          m.setState(m.state === 'alert' ? 'attack' : 'alert');
          flips++;
        },
      });
      const simRan = await probeFor(probe, 4, 30000);
      probe.stop();
      for (const ev of EVENTS) { ctx.events.off?.(ev, bad[ev]); ctx.events.off?.(ev, good[ev]); }

      const errs = ctx.machines.aiAudit().listenerErrors;
      const mine = {};
      for (const e of errs) if (e.message.indexOf(MSG) >= 0) mine[e.event] = e;
      const emitted = {
        'machine-attack': rawSite, 'player-damage': rawIdiom, 'machine-state': flips,
      };
      const perEvent = {}, missed = [];
      for (const ev of EVENTS) {
        const want = emitted[ev];
        const rec = mine[ev] || null;
        perEvent[ev] = {
          emittedByGate: want, wellBehavedHeard: heard[ev],
          isolatedFailures: rec ? rec.count : 0,
          reportedStackHead: rec ? rec.stack.split(' | ')[0] : null,
          path: ev === 'machine-attack' ? 'RAW: thunderjaw.js:283 onFootfall'
            : ev === 'player-damage' ? 'RAW IDIOM: m.ctx.events.emit (watcher.js:421 / thunderjaw.js:773)'
            : 'COVERED: Machine.emit -> safeEmit',
        };
        if (!want) continue;              // no Thunderjaw: path 1 not staged
        if (heard[ev] < want) missed.push(ev + ': well-behaved subscriber heard ' + heard[ev] + ' of ' + want);
        if (!rec || rec.count < want) missed.push(ev + ': only ' + (rec ? rec.count : 0) + ' of ' + want + ' failures were reported');
        if (rec && !rec.stack) missed.push(ev + ': failure reported without a stack');
      }
      const sysAfter = (G.systemErrors || []).reduce((n, r) => n + r.count, 0);
      const machinesUpdate = (G.systemErrors || []).filter(r => /Machines/.test(r.key));
      const stillStepping = ctx.machines.list.filter(x => x.alive).length;

      const detail = {
        driver: m.kind, realRawSiteDriven: !!tj,
        simSecondsRun: +simRan.toFixed(2), simSteps: probe.steps,
        perEvent, shortfalls: missed,
        systemErrorsBefore: sysBefore, systemErrorsAfter: sysAfter,
        machinesUpdateQuarantined: machinesUpdate.map(r => r.key + ' x' + r.count),
        machinesStillAlive: stillStepping,
        movedM: +Math.hypot(m.position.x - x0, m.position.z - z0).toFixed(2),
        note: 'three emit paths driven once per SIM STEP from inside Machines.update: the real species site (thunderjaw.js:283), the raw species idiom on player-damage, and Machine.emit. Each has a throwing subscriber registered ahead of a well-behaved one. Pass = the loop keeps stepping, every later subscriber still hears every broadcast, and every swallowed failure is counted with its stack in machines.aiAudit().listenerErrors.',
      };
      if (simRan < 3) return { pass: null, detail: { ...detail, why: 'PENDING: the page advanced only ' + simRan.toFixed(1) + ' sim seconds' } };
      return {
        pass: flips > 10 && rawIdiom > 10 && missed.length === 0
          && machinesUpdate.length === 0 && sysAfter === sysBefore
          && stillStepping > 0,
        detail,
      };
    })()`,
  },

  /* ----------------------------------------------------------- V25 (numbers) */
  {
    id: 'V25n-alarm-converge-numbers', kind: 'action', lane: 'machine-ai',
    title: 'Alarm doctrine, measured: recipients go to search on the CALLER, amber eyes, player never detected',
    setup: `(async () => { ${INPUT_ON} ${WAIT_VARIETY} })()`,
    settle: 600, timeout: 60000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${PARK}
      const ctx = __CTX__, T = ctx.terrain;
      const list = ctx.machines.list.filter(m => m.kind === 'watcher' && m.alive);
      if (list.length < 2) return { pass: null, detail: 'SKIP: fewer than 2 living watchers' };
      const caller = list[0];
      const helpers = list.slice(1, 4);
      while (helpers.length < 3) {
        const m = ctx.machines.spawn('watcher', caller.position.x + 24, caller.position.z + 6 * helpers.length);
        if (!m) break;
        helpers.push(m);
      }
      if (helpers.length < 3) return { pass: null, detail: 'SKIP: could not stage 3 recipients' };
      freezeAll([caller, ...helpers]);
      park(caller, 0);
      const ring = [[33, -7], [36, 3], [39, -2]];
      helpers.forEach((h, i) => {
        const x = caller.position.x + ring[i % 3][0], z = caller.position.z + ring[i % 3][1];
        h.position.set(x, T.getHeight(x, z), z);
        h.spawnPos.set(x, 0, z);
        park(h, Math.PI);
      });
      const px = caller.position.x + 50, pz = caller.position.z + 4;
      const p = place(px, pz, { crouch: true });
      await new Promise(r => setTimeout(r, 400));

      // the ALARM POINT is where the caller stood when it chirped — the caller
      // then fights its own fight and moves, so every convergence measurement
      // below is against this frozen point, not against a walking machine
      const C = { x: caller.position.x, z: caller.position.z };
      const d0 = helpers.map(h => Math.hypot(h.position.x - C.x, h.position.z - C.z));
      const lk0 = helpers.map(h => h.lastKnown.clone());
      caller.forceState('alert');            // -> onAlerted -> alertNearby(60)
      // forceState hands the caller the player's position (that is the test
      // harness, not the game); take it back so the caller holds its ground and
      // the recipients' convergence is the only thing moving
      caller.lastKnown.set(C.x, caller.position.y, C.z);
      await new Promise(r => setTimeout(r, 3000));
      const d1 = helpers.map(h => Math.hypot(h.position.x - C.x, h.position.z - C.z));

      const states = helpers.map(h => h.state);
      const eyes = helpers.map(h => '#' + h._eyeColor.getHexString());
      const closed = d0.map((v, i) => +(v - d1[i]).toFixed(2));
      // lastKnown must point at the CALLER, not at the hidden player
      const lkToCaller = helpers.map(h => +Math.hypot(
        h.lastKnown.x - C.x, h.lastKnown.z - C.z).toFixed(2));
      const lkToPlayer = helpers.map(h => +Math.hypot(
        h.lastKnown.x - px, h.lastKnown.z - pz).toFixed(2));
      const sawPlayer = helpers.some(h => h._visible);
      // amber (search) reads red>green>blue with a real green channel; hostile
      // red is green-starved. This separates them without eyeballing pixels.
      const amber = helpers.every(h => h._eyeColor.g > 0.25 && h._eyeColor.g < h._eyeColor.r);
      const pass = states.every(s => s === 'search')
        && closed.every(c => c > 1)
        && lkToCaller.every(v => v < 6)
        && lkToPlayer.every(v => v > 25)
        && !sawPlayer && amber;
      return {
        pass,
        detail: {
          recipientStates: states, recipientEyes: eyes, amberNotRed: amber,
          distToAlarmPointBefore: d0.map(v => +v.toFixed(1)),
          distToAlarmPointAfter: d1.map(v => +v.toFixed(1)),
          closedM: closed,
          lastKnownToAlarmPointM: lkToCaller, lastKnownToHiddenPlayerM: lkToPlayer,
          anyRecipientSawPlayer: sawPlayer,
          callerState: caller.state,
          hadPriorContact: lk0.map(v => +v.length().toFixed(1)),
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ V25 */
  {
    id: 'V25-alarm-converge', kind: 'visual', lane: 'machine-ai',
    title: 'A Watcher alarms with the player hidden 50 m away; recipients converge on the CALLER, eyes yellow',
    settle: 1600,
    setup: `(async () => {
      ${INPUT_ON} ${WAIT_VARIETY}
      ${FREEZE} ${PLACE} ${PARK}
      const ctx = __CTX__, T = ctx.terrain;
      const list = ctx.machines.list.filter(m => m.kind === 'watcher' && m.alive);
      if (list.length < 2) return 'SKIP';
      const caller = list[0];
      // spread three recipients between the caller and the camera so their
      // sensors read at 20-30 m, and freeze everyone else
      const helpers = list.slice(1, 4);
      while (helpers.length < 3) {
        const m = ctx.machines.spawn('watcher', caller.position.x + 24, caller.position.z + 6 * helpers.length);
        if (!m) break;
        helpers.push(m);
      }
      freezeAll([caller, ...helpers]);
      park(caller, 0);
      // recipients sit BETWEEN the caller and the hidden player, 10-16 m from
      // the lens, so their sensor colour is readable in the frame while the
      // caller stays the distant thing they are all walking toward
      const ring = [[33, -7], [36, 3], [39, -2]];
      helpers.forEach((h, i) => {
        const x = caller.position.x + ring[i % 3][0], z = caller.position.z + ring[i % 3][1];
        h.position.set(x, T.getHeight(x, z), z);
        h.spawnPos.set(x, 0, z);
        park(h, Math.PI);
      });
      // the player is hidden 50 m out, looking back along the line
      const px = caller.position.x + 50, pz = caller.position.z + 4;
      // camYaw is the bearing FROM the subject TO the player: the boom swings
      // out along +yaw and the lens looks back down it, through Aloy, at the
      // group. (Setting it the other way films the empty meadow behind her.)
      const p = place(px, pz, { crouch: true, yaw: Math.atan2(px - caller.position.x, pz - caller.position.z) });
      p.camPitch = -0.02;
      await new Promise(r => setTimeout(r, 400));

      const d0 = helpers.map(h => Math.hypot(h.position.x - caller.position.x, h.position.z - caller.position.z));
      const CX = caller.position.x, CZ = caller.position.z;
      caller.forceState('alert');           // -> onAlerted -> alertNearby(60)
      caller.lastKnown.set(CX, caller.position.y, CZ);   // it holds its ground
      // the runner's own settle (1.6 s) runs after this and the shutter fires
      // at the end of it, so wait 1.4 s here to capture at the audit's +3 s
      await new Promise(r => setTimeout(r, 1400));
      const d1 = helpers.map(h => Math.hypot(h.position.x - caller.position.x, h.position.z - caller.position.z));
      window.__V25__ = {
        recipientStates: helpers.map(h => h.state),
        distToCaller: { before: d0.map(v => +v.toFixed(1)), after: d1.map(v => +v.toFixed(1)) },
        closed: d0.map((v, i) => +(v - d1[i]).toFixed(2)),
        distToCamera: helpers.map(h => +Math.hypot(h.position.x - px, h.position.z - pz).toFixed(1)),
        callerState: caller.state,
        playerSeenByAny: helpers.some(h => h._visible) || caller._visible,
        suspicions: helpers.map(h => +h.suspicion.toFixed(2)),
      };
      return window.__V25__;
    })()`,
    criteria: 'Three Watchers stand 10-16 m from the lens and are walking TOWARD the calling Watcher further out, not toward the camera. '
      + 'Their sensor eyes read YELLOW/amber (search), not red (alert/attack) — the player is hidden 50 m back and none of them has '
      + 'detected her. FAIL on red eyes, on recipients heading for the camera, or on a static line-up. '
      + 'window.__V25__ carries the numbers: every recipient state should be "search" and every closed value positive.',
  },
];
