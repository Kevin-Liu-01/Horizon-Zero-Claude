/**
 * Round 4 gates — lane `combat` (docs/ROUND4-AUDIT.md §4).
 *
 * Same contract as tools/gates.config.mjs: ACTION gates resolve
 * { pass, detail } in page context with __CTX__/__GAME__ available; VISUAL
 * gates capture a deterministic screenshot judged against `criteria`.
 *
 * GATE IDS. §4 names these A49-A54 / V28 / V29.  `machine-rig` already owns
 * `A49-fx-pool-clean` and `A50-hulls-visible` — the NUMBERS overlap, the full
 * ids do not, and the runner keys on the full id string (exactly as
 * A28-jump-arc / A28-run-cadence and A31-crouch-aim / A31-aim-strafe-skate
 * already coexist), so the §4 names are used verbatim and nothing collides.
 *
 * Every gate stages its own scenario and FREEZES the machines it is not
 * measuring: 24 machines share this valley and a wandering Sawtooth walking
 * into a nock-timing test is a different test.
 */

const INPUT_ON = `__CTX__.input.enabled = true;`;

/** Block until the deferred variety spawns exist (Thunderjaw is one of them). */
const WAIT_VARIETY = `
  const _t0 = performance.now();
  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {
    await new Promise(r => setTimeout(r, 150));
  }
`;

/** Freeze every machine except `keep` so nothing wanders into the scenario. */
const FREEZE = `function freezeAll(keep) {
  const set = new Set(keep || []);
  for (const m of __CTX__.machines.list) {
    if (set.has(m)) continue;
    if (!m._frozenByGate) { m._frozenByGate = m.update; m.update = () => {}; }
  }
}`;

/** Park a machine: no route travel, no wander, heading held, unaware. */
const PARK = `function park(m, heading) {
  m.route = [m.position.clone()];
  m._wpIndex = 0;
  m._waitT = 1e6;
  if (heading !== undefined) m.heading = heading;
  m.suspicion = 0;
  m._unseenT = 99;
  try { m.ai.search.stop(); m.ai.engage.reset(); } catch {}
  m.setState('patrol');
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

/**
 * SIM seconds. The frame loop clamps a long frame, so on a thrashing shared
 * GPU wall time runs as much as 2x sim time; anything specified in GAME
 * seconds (nock windows, draw ramps) must be counted on `engine.simTime` or
 * the gate measures the box, not the build.  Same lesson as machine-ai's
 * SIMCLOCK; combat additionally needs it because Concentration and hitstop
 * both bend `timeScale` underneath the measurement.
 */
const SIMCLOCK = `
  const simNow = () => (__CTX__.engine ? __CTX__.engine.simTime : performance.now() / 1000);
  async function simSleep(s, each, capX = 3) {
    const t0 = simNow(), w0 = performance.now();
    while (simNow() - t0 < s && performance.now() - w0 < s * 1000 * capX + 4000) {
      await new Promise(r => setTimeout(r, 30));
      if (each) each(simNow() - t0);
    }
    return simNow() - t0;
  }
  async function simUntil(fn, s, each, capX = 3) {
    const t0 = simNow(), w0 = performance.now();
    while (!fn() && simNow() - t0 < s && performance.now() - w0 < s * 1000 * capX + 4000) {
      await new Promise(r => setTimeout(r, 16));
      if (each) each(simNow() - t0);
    }
    return simNow() - t0;
  }
`;

/**
 * Stand the player a set distance from a machine, facing it, with the roster
 * frozen and the target parked.  `back` puts her BEHIND the machine (the
 * Silent Strike approach); otherwise she faces its front.
 */
const STAGE = `async function stage(kind, dist, opts) {
  const o = opts || {};
  const C = __CTX__;
  freezeAll([]);
  let m = C.machines.list.find((x) => x.kind === kind && x.alive !== false && !x._disposed);
  if (!m) return null;
  if (m._frozenByGate) { m.update = m._frozenByGate; m._frozenByGate = null; }
  // move the target somewhere flat and clear, well away from the herd
  const hx = o.x !== undefined ? o.x : -60, hz = o.z !== undefined ? o.z : -60;
  m.position.set(hx, C.terrain.getHeight(hx, hz), hz);
  if (m.root) m.root.position.copy(m.position);
  park(m, o.mHeading !== undefined ? o.mHeading : 0);
  m.health = m.maxHealth;
  m.alive = true;
  // the player: behind the machine (heading 0 = +Z, so behind is -Z)
  const a = o.back ? (m.heading + Math.PI) : m.heading;
  const px = hx + Math.sin(a) * dist, pz = hz + Math.cos(a) * dist;
  place(px, pz, { crouch: !!o.crouch });
  /* FACING. camYaw is the ORBIT angle and the lens looks the other way: the
   * camera's world direction is yaw + PI (player.heading = camYaw + PI), so
   * setting camYaw to the bearing points her directly AWAY from the target —
   * which is how the first run of A49 swung four times and hit nothing. */
  await faceMachine(m);
  await new Promise(r => setTimeout(r, 200));
  return m;
}`;

/**
 * Aim the lens at a machine from wherever the player ended up.
 *
 * camYaw is the ORBIT angle and the lens looks the other way: the camera's
 * world direction is yaw + PI (player.heading = camYaw + PI). Setting camYaw
 * to the bearing points her directly AWAY from the target — which is how the
 * first run of A49 swung four times and hit nothing.
 */
const FACE = `async function faceMachine(m) {
  const p = __CTX__.player;
  const b = Math.atan2(m.position.x - p.position.x, m.position.z - p.position.z);
  p.camYaw = b + Math.PI;
  p.heading = b;
  p.camPitch = 0;
  p.moveSpeed = 0;
  try { p._updateCamera?.(0); } catch {}
  await new Promise(r => setTimeout(r, 120));
}`;

/**
 * HOLD A MACHINE ON ITS MARK.
 *
 * `stage()` deliberately leaves the target's `update` live so it animates and
 * reacts — but a Sawtooth staged 8 m in front of the player DETECTS her and
 * charges. Measured on port 5208: it closed 6.8 m during a single full draw,
 * so a crosshair solved onto its chest before the draw was aiming at empty
 * grass by the time the arrow left, and V28 filmed a miss. `pin` restores the
 * transform after every one of the machine's own steps: the rig, the mixer and
 * the reaction channels all still run, the machine simply does not travel.
 */
const PIN = `function pin(m, heading) {
  if (m._pinned) return m._pinned;
  const base = m.update.bind(m);
  const home = m.position.clone();
  const h = heading !== undefined ? heading : m.heading;
  m.update = (dt, t) => {
    base(dt, t);
    m.position.copy(home);
    m.heading = h;
    if (m.root) { m.root.position.copy(home); m.root.updateMatrixWorld(true); }
  };
  m._pinned = { home, stop() { m.update = base; m._pinned = null; } };
  return m._pinned;
}`;

export const GATES = [
  /* ------------------------------------------------------------------ A49 */
  {
    id: 'A49-melee-exists', kind: 'action', lane: 'combat',
    title: 'LMB with no aim, 1.5 m from a Watcher: melee-hit fires and the machine loses HP',
    setup: INPUT_ON,
    settle: 400, timeout: 90000,
    assert: `(async () => {
      ${FREEZE} ${PARK} ${PLACE} ${SIMCLOCK} ${FACE} ${STAGE}
      const C = __CTX__;
      const m = await stage('watcher', 1.5, {});
      if (!m) return { pass: null, detail: 'SKIP: no watcher in the roster' };
      const hp0 = m.health;
      let hit = null, swings = 0;
      C.events.on('melee-hit', (e) => { if (!hit) hit = e; });

      /* LMB is a real mouse press, not a call into swing(): the finding is
       * "LMB outside aim is dead input", so the gate has to go through the
       * same input path the player does. */
      C.player.aiming = false;
      C.input.mouse.buttons &= ~4;
      for (let i = 0; i < 4 && !hit; i++) {
        C.input.mouse.buttons |= 1;
        await simSleep(0.09);
        C.input.mouse.buttons &= ~1;
        swings = C.combat.melee.audit().swings;
        await simUntil(() => !!hit, 1.1);
      }
      C.input.mouse.buttons &= ~1;
      const a = C.combat.melee.audit();
      const drop = hp0 - m.health;
      const p = C.player;
      return {
        pass: !!hit && drop > 0 && a.swings > 0,
        detail: {
          swings: a.swings, hits: a.hits,
          hpDrop: +drop.toFixed(1),
          damage: hit ? +hit.damage.toFixed(1) : 0,
          heavy: hit ? hit.heavy : null,
          /* The machine's blocking collider will not let her stand at 1.5 m
           * from its CENTRE (a Watcher holds her at 3.35 m), so what "1.5 m"
           * can mean is 1.5 m from its shell. Reported so the number is not
           * silently reinterpreted. */
          centreDist: +Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z).toFixed(2),
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A50 */
  {
    id: 'A50-silent-strike', kind: 'action', lane: 'combat',
    title: 'Crouched behind an unaware Watcher at 2 m: prompt reads SILENT STRIKE and it kills',
    setup: INPUT_ON,
    settle: 400, timeout: 90000,
    assert: `(async () => {
      ${FREEZE} ${PARK} ${PLACE} ${SIMCLOCK} ${FACE} ${STAGE}
      const C = __CTX__;
      const m = await stage('watcher', 1.8, { back: true, crouch: true });
      if (!m) return { pass: null, detail: 'SKIP: no watcher in the roster' };
      // it must stay unaware for the offer to be legal
      m.suspicion = 0; m.setState('patrol');

      // the melee scan runs at 10 Hz and interactables re-selects each frame
      await simUntil(() => C.interactables?.current?.label === 'SILENT STRIKE', 2.5);
      const label = C.interactables?.current?.label ?? null;
      const target = C.combat.melee.silentTarget?.kind ?? null;

      let ev = null;
      C.events.on('silent-strike', (e) => { ev = e; });
      const res = C.combat.melee.silentStrike();
      await simSleep(0.35);
      const dead = m.alive === false || m.health <= 0;
      return {
        pass: label === 'SILENT STRIKE' && !!ev && !!res && dead,
        detail: {
          label, target, emitted: !!ev,
          killed: !!ev?.killed, alive: m.alive, hp: +Math.max(0, m.health).toFixed(1),
          centreDist: +Math.hypot(m.position.x - C.player.position.x, m.position.z - C.player.position.z).toFixed(2),
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A51 */
  {
    id: 'A51-nock-gap', kind: 'action', lane: 'combat',
    title: 'Two consecutive full-draw hunter shots are 1.05-1.40 s apart (was 0.714 s)',
    setup: INPUT_ON,
    settle: 400, timeout: 90000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${SIMCLOCK}
      const C = __CTX__;
      freezeAll([]);
      place(0, 0, { crouch: false });
      C.combat.setWeapon(1, { silent: true });
      C.combat.ammo.hunter = 60;

      /* MEASURE ON THE CLOCK THE FEATURE RUNS ON.
       *
       * The interval is a REAL-TIME feel number: nockTime and drawTime are
       * both integrated from min(0.05, performance.now() delta) once per
       * frame (see combat.js, "Real time comes from a monotonic clock").
       * Neither wall time nor engine.simTime is that clock. Wall time lets a
       * stalled frame inflate the gap; simTime lets it DEFLATE the gap, which
       * is how this gate read 1.039 s for a 1.12 s interval on a run where the
       * shared GPU was thrashing hard enough to lose the browser three times —
       * simTime advances by realDt * timeScale with realDt clamped to
       * MAX_FRAME, so a 200 ms frame contributes 50 ms of sim and 200 ms of
       * nock. Accumulating the same clamped delta on rAF measures exactly what
       * the draw integrates, in both directions. Bounds are unchanged. */
      let clk = 0, _prev = performance.now(), _stop = false;
      const _tickClk = () => {
        const now = performance.now();
        clk += Math.min(0.05, Math.max(0, (now - _prev) / 1000));
        _prev = now;
        if (!_stop) requestAnimationFrame(_tickClk);
      };
      requestAnimationFrame(_tickClk);

      const shots = [];
      C.events.on('arrow-fired', (e) => shots.push({
        t: clk, sim: simNow(), draw: e.drawStrength ?? e.draw ?? 0,
      }));

      /* A bow LOOSES ON RELEASE, so the fastest legal pair of full-draw shots
       * is: hold to full, release (shot 1), re-press immediately, hold to full,
       * release (shot 2). The interval that measures is loose -> loose, and it
       * must be nockTime + drawTime = 0.42 + 0.70 = 1.12 s: the string cannot
       * start bending until the next arrow is physically on it. */
      C.player.aiming = true;
      C.input.mouse.buttons |= 4;      // RMB: raise the bow (starts the nock)
      await simSleep(0.1);
      for (let s = 0; s < 2; s++) {
        C.input.mouse.buttons |= 1;
        // wait for full draw; the nock gate is what makes this take >0.42 s
        await simUntil(() => C.combat.drawStrength >= 0.995, 3.0);
        const want = shots.length + 1;
        C.input.mouse.buttons &= ~1;   // loose
        await simUntil(() => shots.length >= want, 1.0);
        // re-press on the very next tick: no human pause in the measurement
      }
      await simSleep(0.1);
      _stop = true;
      C.input.mouse.buttons &= ~4;
      C.player.aiming = false;

      if (shots.length < 2) {
        return { pass: false, detail: { shots: shots.length, note: 'second shot never loosed' } };
      }
      const gap = shots[1].t - shots[0].t;
      return {
        pass: gap >= 1.05 && gap <= 1.40 && shots[0].draw >= 0.95 && shots[1].draw >= 0.95,
        detail: {
          gap: +gap.toFixed(3),
          simGap: +(shots[1].sim - shots[0].sim).toFixed(3),
          draws: shots.slice(0, 2).map((s) => +s.draw.toFixed(2)),
          nockTime: C.combat.activeWeapon.nockTime,
          drawTime: C.combat.activeWeapon.drawTime,
          expected: +(C.combat.activeWeapon.nockTime + C.combat.activeWeapon.drawTime).toFixed(2),
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A52 */
  {
    id: 'A52-arrow-drop', kind: 'action', lane: 'combat',
    title: 'At 55 m a full-draw hunter arrow lands 2.5-5 m BELOW the crosshair; launch within 0.3 deg of the ray',
    setup: INPUT_ON,
    settle: 400, timeout: 90000,
    assert: `(async () => {
      ${FREEZE} ${PARK} ${PLACE} ${SIMCLOCK} ${FACE}
      const C = __CTX__, T = C.player.position.constructor;
      freezeAll([]);

      /* Give the crosshair something REAL to land on at 55 m, so the aim point
       * is the game's own (no hand-written aimPoint that _updateAimPoint would
       * overwrite on the next frame) and the shot is the one a player takes. */
      const m = C.machines.list.find((x) => x.kind === 'watcher' && x.alive !== false && !x._disposed);
      if (!m) return { pass: null, detail: 'SKIP: no watcher to aim at' };
      const hx = -80, hz = -80;
      m.position.set(hx, C.terrain.getHeight(hx, hz), hz);
      if (m.root) m.root.position.copy(m.position);
      park(m, 0);
      m.health = m.maxHealth * 1e6;    // it must survive to be aimed at again

      const RANGE = 55;
      const p = place(hx, hz + RANGE, {});
      C.combat.setWeapon(1, { silent: true });
      C.combat.selectAmmo('hunter-bow', 'hunter');
      C.combat.ammo.hunter = 60;
      await faceMachine(m);
      // level the crosshair on its chest, not its feet
      const chest = new T().copy(m.position); chest.y += (m.height ?? 1.8) * 0.55;
      const eye = new T(); C.camera.getWorldPosition(eye);
      p.camPitch = Math.atan2(chest.y - eye.y, Math.hypot(chest.x - eye.x, chest.z - eye.z));
      try { p._updateCamera?.(0); } catch {}
      await new Promise(r => setTimeout(r, 200));

      let fired = null;
      C.events.on('arrow-fired', (e) => { if (!fired) fired = e; });

      C.player.aiming = true;
      C.input.mouse.buttons |= 4;
      await simSleep(0.7);             // clear the nock window
      C.input.mouse.buttons |= 1;
      await simUntil(() => C.combat.drawStrength >= 0.99, 2.4);
      const draw = C.combat.drawStrength;
      C.input.mouse.buttons &= ~1;
      await simUntil(() => !!fired, 1.5);
      C.input.mouse.buttons &= ~4;
      C.player.aiming = false;
      m.health = m.maxHealth;
      if (!fired) return { pass: false, detail: { draw: +draw.toFixed(2), note: 'no arrow fired' } };
      if (!fired.dir || !fired.origin || !fired.aimPoint) {
        return { pass: false, detail: 'arrow-fired must publish origin/dir/aimPoint' };
      }

      const origin = new T(fired.origin.x, fired.origin.y, fired.origin.z);
      const aim = new T(fired.aimPoint.x, fired.aimPoint.y, fired.aimPoint.z);
      const got = new T(fired.dir.x, fired.dir.y, fired.dir.z).normalize();

      /* 1. LAUNCH HONESTY. The finding is a hidden gravity LOFT term that
       * tilted every shot up by exactly the drop it was about to take, so the
       * arrow always landed on the crosshair. The arrow must leave the nock
       * pointed AT the crosshair's world hit and nowhere else. */
      const want = aim.clone().sub(origin).normalize();
      const offDeg = Math.acos(Math.max(-1, Math.min(1, want.dot(got)))) * 180 / Math.PI;
      // and specifically: no UPWARD bias (that is the shape a loft term has)
      const liftDeg = (Math.asin(Math.max(-1, Math.min(1, got.y)))
        - Math.asin(Math.max(-1, Math.min(1, want.y)))) * 180 / Math.PI;

      /* 2. HONEST DROP. Integrate the SHIPPED arrow — the pool publishes its
       * own gravity and drag — out to 55 m of horizontal range, and compare
       * its height there with the straight crosshair line at the same range. */
      const G = C.combat.arrows.gravity, DRAG = C.combat.arrows.drag;
      const speed = fired.speed ?? 62;
      const pos = origin.clone();
      const v = got.clone().multiplyScalar(speed);
      let horiz = 0, tFly = 0, px = pos.x, pz = pos.z;
      const dt = 1 / 480;
      for (let i = 0; i < 480 * 12 && horiz < RANGE; i++) {
        v.multiplyScalar(Math.max(0, 1 - DRAG * dt));
        v.y -= G * dt;
        pos.addScaledVector(v, dt);
        horiz += Math.hypot(pos.x - px, pos.z - pz);
        px = pos.x; pz = pos.z;
        tFly += dt;
      }
      const wantFlat = Math.hypot(want.x, want.z);
      const line = origin.clone().addScaledVector(want, horiz / Math.max(1e-6, wantFlat));
      const drop = line.y - pos.y;
      return {
        pass: offDeg <= 0.3 && liftDeg <= 0.3 && drop >= 2.5 && drop <= 5.0,
        detail: {
          launchOffDeg: +offDeg.toFixed(3),
          upwardBiasDeg: +liftDeg.toFixed(3),
          dropM: +drop.toFixed(2),
          rangeM: +horiz.toFixed(1),
          flightS: +tFly.toFixed(2),
          gravity: G, drag: DRAG, speed: +speed.toFixed(1),
          draw: +draw.toFixed(2),
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A53 */
  {
    id: 'A53-conc-not-on-sprint', kind: 'action', lane: 'combat',
    title: 'Sprinting into an aim never arms Concentration (Shift held from the sprint has no edge left)',
    setup: INPUT_ON,
    settle: 400, timeout: 90000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${SIMCLOCK}
      const C = __CTX__;
      freezeAll([]);
      const p = place(0, 0, {});
      C.combat.concentration.active = false;
      C.combat.concentration.gauge = 1;
      p.aiming = false;
      C.input.mouse.buttons = 0;

      // hold Shift+W and build to sprint speed
      const sprint = C.input.codeFor?.('sprint') || 'ShiftLeft';
      C.input.keys.add('KeyW');
      C.input.keys.add(sprint);
      C.input.keys.add('ShiftLeft');
      let vmax = 0;
      await simSleep(2.6, () => { vmax = Math.max(vmax, p.moveSpeed ?? 0); });

      // NOW press RMB, Shift still down — the old edge (aiming && shiftDown)
      // fired here and burned the gauge for free
      C.input.mouse.buttons |= 4;
      p.aiming = true;
      let armed = false, tsMin = 1;
      await simSleep(1.2, () => {
        if (C.combat.concentration.active) armed = true;
        tsMin = Math.min(tsMin, C.engine.timeScale);
      });
      const active = C.combat.concentration.active;
      const ts = C.engine.timeScale;

      /* And the control half: releasing Shift and pressing it again WHILE
       * aiming must still arm it, or the fix has just deleted the feature. */
      C.input.keys.delete(sprint);
      C.input.keys.delete('ShiftLeft');
      await simSleep(0.25);
      C.input.keys.add(sprint);
      await simSleep(0.45);
      const rearms = C.combat.concentration.active;

      // clean up
      C.input.keys.delete(sprint); C.input.keys.delete('ShiftLeft'); C.input.keys.delete('KeyW');
      C.input.mouse.buttons &= ~4;
      p.aiming = false;
      await simSleep(0.4);

      return {
        pass: !armed && !active && Math.abs(ts - 1) < 0.02 && rearms,
        detail: {
          sprintSpeed: +vmax.toFixed(2),
          armedBySprint: armed,
          activeAfterAim: active,
          timeScale: +ts.toFixed(3),
          minTimeScale: +tsMin.toFixed(3),
          rearmsOnFreshPress: rearms,
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A54 */
  {
    id: 'A54-elemental-tiers', kind: 'action', lane: 'combat',
    title: 'Freeze to brittle: 1-2 arrows on a Watcher, 3-5 on a Sawtooth, 8-12 on a Thunderjaw',
    setup: INPUT_ON,
    settle: 500, timeout: 150000,
    assert: `(async () => {
      ${WAIT_VARIETY} ${FREEZE} ${PARK} ${PLACE} ${SIMCLOCK}
      const C = __CTX__;
      freezeAll([]);
      place(0, 0, {});

      /* The THRESHOLDS are machine-ai's (ai/tables.js ELEM_THRESHOLD); the
       * ARROW is combat's (AMMO.freeze.elementAmount). This gate is the
       * contract between them: it fires the shipped ammo definition through
       * the shipped takeDamage and counts hits to the status, so a change on
       * either side that breaks the canon tiers fails here. */
      const def = C.combat.ammoDefs.freeze;
      const out = {};
      const V = C.player.position.constructor;
      for (const kind of ['watcher', 'sawtooth', 'thunderjaw']) {
        const m = C.machines.list.find((x) => x.kind === kind && x.alive !== false && !x._disposed);
        if (!m) { out[kind] = null; continue; }
        m.health = m.maxHealth * 1e6;    // isolate the STATUS, not the kill
        m.elemental.freeze = 0;
        m.brittleT = 0;
        let n = 0;
        const pt = new V(); const dir = new V(0, 0, 1);
        for (; n < 40;) {
          pt.copy(m.position); pt.y += (m.height ?? 2) * 0.5;
          m.takeDamage({
            point: pt.clone(), object: null, dir: dir.clone(),
            impact: def.impact, tear: def.tear,
            element: 'freeze', elementAmount: def.elementAmount,
            type: 'freeze', baseDamage: def.impact, draw: 1, seen: true,
          });
          n++;
          // BRITTLE is machine.js's freeze status: brittleT ticks down from 8 s
          if (m.brittleT > 0) break;
        }
        out[kind] = m.brittleT > 0 ? n : null;
        m.health = m.maxHealth;
        m.elemental.freeze = 0; m.brittleT = 0;
      }
      const ok = (v, lo, hi) => v !== null && v >= lo && v <= hi;
      return {
        pass: ok(out.watcher, 1, 2) && ok(out.sawtooth, 3, 5) && ok(out.thunderjaw, 8, 12),
        detail: {
          arrows: out,
          elementAmount: def.elementAmount,
          want: { watcher: '1-2', sawtooth: '3-5', thunderjaw: '8-12' },
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ V28 */
  {
    id: 'V28-impact', kind: 'visual', lane: 'combat',
    title: 'A full-draw hit on a Sawtooth at 8 m reads as an IMPACT, frozen 60 ms after the hit',
    settle: 900, timeout: 150000,
    setup: `(async () => {
      ${WAIT_VARIETY} ${FREEZE} ${PARK} ${PLACE} ${SIMCLOCK} ${FACE} ${STAGE} ${PIN}
      const C = __CTX__;
      C.input.enabled = true;
      const m = await stage('sawtooth', 8, { x: -70, z: -70, mHeading: Math.PI });
      if (!m) return;
      pin(m, Math.PI);            // it must not charge out of the shot
      C.combat.setWeapon(1, { silent: true });
      C.combat.ammo.hardpoint = 40;
      C.combat.selectAmmo('hunter-bow', 'hardpoint');
      m.health = m.maxHealth;

      /* Sec 4 says a full-draw WEAK hit: the shot has to land on a live weak
       * POINT, which is what multiplies the impact (machine.js weakPoints) and
       * what the HUD renders large. Read it LIVE each time — the machine is
       * pinned in place but its rig still moves the chest around. */
      const V = C.player.position.constructor;
      const p = C.player;
      const aim = new V();
      let wpName = null;
      const readAim = () => {
        let bestD = Infinity;
        wpName = null;
        if (m.root) m.root.updateWorldMatrix(true, true);
        for (const wp of (m.weakPoints || [])) {
          if (wp.enabled === false) continue;
          const w = new V();
          wp.obj.getWorldPosition(w);
          const d = w.distanceToSquared(p.position);
          if (d < bestD) { bestD = d; aim.copy(w); wpName = wp.name; }
        }
        if (!wpName) { aim.copy(m.position); aim.y += (m.height ?? 3) * 0.55; }
        /* Bias to the UPPER half of the weak sphere. Anywhere inside it counts
         * as a weak hit, but the bottom of it is down in the grass, where the
         * burst is half-occluded and reads as a puff. */
        aim.y += 0.30;
      };
      readAim();

      await faceMachine(m);

      /* PIN THE AIM POINT; FRAME WITH THE CAMERA SEPARATELY.
       *
       * Three camera-side solves were tried and all three were flaky, because
       * a third-person boom cannot be aimed to better than a couple of degrees
       * from a gate: writing camYaw/camPitch orbits the camera itself, so a
       * closed-form solve is stale on arrival; feeding the error back winds up
       * (a zero-dt camera step does not move the boom, so the same error is
       * added forever); and stepping it with a large dt overshoots. At 14 m,
       * two degrees is 0.7 m, which added to the nock offset and the arrow
       * drop just clears a 1.05 m weak sphere — so the same gate filmed a 110
       * weak hit one run and a 44 body hit the next.
       *
       * The shot does not need the camera. _updateAimPoint is the one
       * function that decides where an arrow is sent, so the gate overrides it
       * for the duration and hands it the weak point directly; the camera is
       * then aimed independently, purely to frame the impact. Nothing in
       * src/ is changed for this — it is the same page-context wrap machine-ai
       * gates use on machine.update.
       */
      const realAim = C.combat._updateAimPoint.bind(C.combat);
      C.combat._updateAimPoint = () => { readAim(); C.combat.aimPoint.copy(aim); };

      const frame = async () => {
        for (let it = 0; it < 3; it++) {
          readAim();
          const eye = new V();
          C.camera.getWorldPosition(eye);
          const dx = aim.x - eye.x, dy = aim.y - eye.y, dz = aim.z - eye.z;
          p.camYaw = Math.atan2(dx, dz) - Math.PI;
          p.heading = p.camYaw + Math.PI;
          p.camPitch = Math.atan2(dy, Math.hypot(dx, dz));
          try { p._updateCamera?.(0); } catch {}
          await new Promise(r => setTimeout(r, 70));
        }
      };
      await frame();

      let hit = null;
      C.events.on('machine-damaged', (e) => { if (e && e.machine === m && !hit) hit = e; });

      /* RMB stays DOWN through the freeze: the frame is filmed down the sights
       * at the bow's aim FOV, which is where a player sees their own impact and
       * the only place the reticle tick is on screen. */
      p.aiming = true;
      C.input.mouse.buttons |= 4;
      await simSleep(0.75);
      await frame();                      // the aim FOV changed the framing
      C.input.mouse.buttons |= 1;
      await simUntil(() => C.combat.drawStrength >= 0.995, 2.6);
      C.input.mouse.buttons &= ~1;        // loose
      await simUntil(() => hit !== null, 2.5);
      window.__V28__ = {
        wpName, weak: !!(hit && hit.weak),
        dmg: hit ? +(hit.damage ?? 0).toFixed(1) : 0,
      };

      /* 60 ms AFTER the hit, then hard-freeze so the film catches the burst at
       * its peak instead of the smoke two seconds later. Hitstop already slows
       * this moment; the gate pins it.
       *
       * Counted on the FX clock, in a requestAnimationFrame loop, not with
       * simSleep: a 30 ms poll under a loaded GPU overshot 0.06 s of sim by
       * 70 % (measured 0.103 s), and the two things this frame is judged on
       * both move fast — the burst keeps expanding, and the 260 ms reticle
       * tick runs on WALL time, of which simSleep was burning 254 ms before
       * the freeze landed. Polling every frame puts the shutter within one
       * frame of the mark. */
      await new Promise((res) => {
        const fx0 = C.combat._fxT;
        const w0 = performance.now();
        const step = () => {
          if (C.combat._fxT - fx0 >= 0.06 || performance.now() - w0 > 3000) {
            C.engine.requestTimeScale('studio', 0);
            res();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      C.combat._updateAimPoint = realAim;
    })()`,
    criteria: 'A Sawtooth at 8 m has just taken a full-draw Hardpoint arrow on a WEAK POINT, frozen 60 ms after '
      + 'impact. PASS requires ALL of: (1) a bright hot-orange SPARK BURST at the impact point whose spread is at '
      + 'least one eighth of the machine\'s on-screen height — not a single dot; (2) dark metal PLATE CHIPS thrown '
      + 'clear of the sparks (distinct dark fragments, not just more orange); (3) a floating DAMAGE NUMBER at the '
      + 'impact point rendered LARGE — clearly bigger than the compass/HUD body labels, roughly 18 px or more; '
      + '(4) the RETICLE shows a hit-confirm tick (chevrons/flare snapped out from the crosshair, absent in a '
      + 'resting reticle). '
      + 'FAIL if the impact is a faint puff, if the damage number is the same size as the compass labels, or if '
      + 'nothing marks the crosshair.',
  },

  /* ------------------------------------------------------------------ V29 */
  {
    id: 'V29-wielded-carry', kind: 'visual', lane: 'combat',
    title: 'Jogging toward an alert Sawtooth, the bow is LOW IN THE LEFT HAND — never on her back',
    settle: 900, timeout: 150000,
    setup: `(async () => {
      ${WAIT_VARIETY} ${FREEZE} ${PARK} ${PLACE} ${SIMCLOCK} ${FACE} ${STAGE} ${PIN}
      const C = __CTX__;
      C.input.enabled = true;
      const m = await stage('sawtooth', 16, { x: -70, z: -70, mHeading: Math.PI });
      if (!m) return;
      C.combat.setWeapon(1, { silent: true });
      pin(m);                     // alert, but it does not get to close the gap

      /* The finding is that a jog BETWEEN arrows stowed the bow. So: shoot
       * once (which starts the 8 s holster window), drop the aim, then jog.
       * The machine is ALERT and inside THREAT_RANGE, which is the second,
       * independent reason the bow must stay out. */
      C.combat.noteCombatAction();
      m.setState('alert');
      m.suspicion = 1;
      m.lastKnown = C.player.position.clone();

      const p = C.player;
      p.aiming = false;
      C.input.mouse.buttons = 0;
      // jog at the machine: W held, no sprint
      p.camYaw = Math.atan2(m.position.x - p.position.x, m.position.z - p.position.z);
      p.heading = p.camYaw;
      C.input.keys.add('KeyW');
      await simSleep(1.4);

      /* FREEZE FIRST, THEN FRAME.
       * The boom puts the camera at bearing camYaw from her, so camYaw = her
       * heading looks back at her FACE and camYaw = heading + PI is the
       * over-the-shoulder shot. But the controller RE-ALIGNS the camera behind
       * her while she runs: setting the yaw and then sleeping half a second
       * gave the over-the-shoulder shot back every time, which is why the
       * first cut of this gate filmed her back. Stop the sim, THEN place the
       * lens, so nothing can swing it round again. */
      C.input.keys.delete('KeyW');
      C.engine.requestTimeScale('studio', 0);
      await new Promise(r => setTimeout(r, 260));
      const b2 = Math.atan2(m.position.x - p.position.x, m.position.z - p.position.z);
      p.heading = b2;
      p.camYaw = b2 - 1.15;   // front-LEFT quarter: her left hand toward camera
      p.camPitch = 0.05;
      try { p._updateCamera?.(0); } catch {}
      await new Promise(r => setTimeout(r, 200));
      try { p._updateCamera?.(0); } catch {}
    })()`,
    criteria: 'Aloy is mid-jog toward an alert Sawtooth, filmed from her front-left quarter so both her LEFT HAND '
      + 'and her BACK are visible. PASS requires the bow to be HELD IN HER LEFT HAND, carried low and raked across '
      + 'the front of her body (limbs angled down/forward), with her left arm swing visibly damped — the arm is not '
      + 'pumping freely like the right one. '
      + 'FAIL if the bow is slung diagonally across her BACK, if there is no bow visible anywhere, or if the bow is '
      + 'levelled/aimed like she is shooting (she is not aiming here).',
  },
];
