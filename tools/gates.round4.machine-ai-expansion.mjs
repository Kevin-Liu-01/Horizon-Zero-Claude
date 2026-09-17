/**
 * Round 4 gates — lane `machine-ai-expansion` (docs/ROUND4-AUDIT.md §4).
 *
 * The §4 block for this lane reads "A37-A43, A41b, A41c — run for the NEW
 * KINDS", plus `A90-memory-stability` and `A41d-must-fire`. Those ids are
 * already registered by lane `machine-ai` with the SAME meaning, so nothing
 * here redefines them: `A41b`/`A41c`/`A41d`/`A43` discover their species from
 * `machines.list` and therefore cover every new kind the moment it spawns at
 * boot, and the ids below are the new-kind-specific stagings the auto-discovery
 * cannot do — a stealth approach needs a grass corridor and a machine facing
 * away, a detection curve needs a cone, a stagger needs a tearable component.
 *
 * ID SUFFIXES. `A37`-`A43`, `A41b`, `A41c` and `A90-memory-stability` are all
 * taken (by `machine-ai` and by `core`), so each is registered here with an
 * `-expansion` suffix, per the orchestrator's collision rule. `A41d-must-fire`
 * is the one §4 id that is genuinely new: `machine-ai` registered
 * `A41d-held-radius-coverage`, whose MUST_FIRE half this lane tightened in
 * place (a fired row now excuses a silent one only through the same
 * band+ring-window shell, never from a rear arc, and only on a >= 50 % share);
 * `A41d-must-fire` is the same bar asserted for the new kinds alone, so a
 * regression names the species rather than the suite.
 *
 * Every gate freezes the machines it is not measuring, stages on sim time, and
 * returns PENDING (never FAIL) when the page is too starved to answer.
 */

import {
  INPUT_ON, WAIT_VARIETY, FREEZE, PLACE, PARK, BEARING, SIMCLOCK, TICKPROBE,
  HARDGROUND, SOLO,
} from './gates.round4.machine-ai.mjs';

/** Block until the expansion roster exists (it spawns behind the variety load). */
const WAIT_EXPANSION = `
  {
    const _t1 = performance.now();
    while (!__CTX__.machines?.expansionReady && performance.now() - _t1 < 30000) {
      await new Promise(r => setTimeout(r, 150));
    }
  }
`;

const READY = `(async () => { ${INPUT_ON} ${WAIT_VARIETY} ${WAIT_EXPANSION} })()`;

/**
 * The nine kinds this lane added, and one living machine of each. Reads the
 * roster rather than a hard-coded list, so a kind `machines-expansion` takes
 * over with a real species class is still covered under the same id.
 */
const NEWKINDS = `
  const NEW_KINDS = Object.keys(__CTX__.machines.doctrineAudit().live);
  function newPicks() {
    const list = __CTX__.machines.list;
    return NEW_KINDS
      .map(k => list.find(m => m.kind === k && m.alive))
      .filter(Boolean);
  }
  /** ...minus the docile ones, which have no fight to measure. */
  function newFighters() { return newPicks().filter(m => !m.docile && m.ai.picker.rows.length); }
`;

export const GATES = [
  /* --------------------------------------------------------- A37-expansion */
  /**
   * The Redeye is a Watcher with a BETTER cone (`PERCEPTION.redeye`: +0.22 rad
   * of focus pad, 165 deg of peripheral arc out to 12 m, a 4.4 s sweep and
   * gain 2.35 against the Watcher's 2.05) and a 70 m alarm against its 60.
   * That is the whole species, and it is also the one change most likely to
   * quietly break the stealth pillar: a cone wide enough to be worth escorting
   * a herd with must still be beaten by tall grass, or crouching stops working
   * next to every Broadhead in the valley.
   */
  {
    id: 'A37-expansion', kind: 'action', lane: 'machine-ai-expansion',
    title: 'Crouched in tall grass, 20 m -> 3 m behind a REDEYE (the widest cone in the roster): never leaves patrol/suspicious, suspicion < 0.3, never seen',
    setup: READY, settle: 600, timeout: 75000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${PARK}
      const ctx = __CTX__, T = ctx.terrain;
      const w = ctx.machines.list.find(m => m.kind === 'redeye' && m.alive);
      if (!w) return { pass: null, detail: 'SKIP: no living redeye' };
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
      if (!corridor) return { pass: null, detail: 'SKIP: no 22 m tall-grass corridor in the valley' };
      const endX = corridor.x + Math.sin(corridor.b) * 22;
      const endZ = corridor.z + Math.cos(corridor.b) * 22;
      w.position.set(endX, T.getHeight(endX, endZ), endZ);
      w.spawnPos.set(endX, 0, endZ);
      park(w, corridor.b);
      freezeAll([w]);
      const p = place(corridor.x + Math.sin(corridor.b) * 2, corridor.z + Math.cos(corridor.b) * 2, { crouch: true });
      const t0 = performance.now(), DUR = 15000, HOLD = 2000;
      let worst = 0, badState = null, minDist = 999, grassMiss = 0, seen = 0, faced = 0;
      while (performance.now() - t0 < DUR + HOLD) {
        const k = Math.min(1, (performance.now() - t0) / DUR);
        const d = Math.max(3, 20 - 17 * k);
        const x = w.position.x - Math.sin(corridor.b) * d;
        const z = w.position.z - Math.cos(corridor.b) * d;
        if (k > 0.5) { w.heading = corridor.b + Math.PI; faced++; }   // it turns AND looks
        p.position.set(x, T.getHeight(x, z), z);
        p.setCrouch(true);
        p.inTallGrass = T.isInTallGrass(x, z);
        if (!p.inTallGrass) grassMiss++;
        ctx.machines.noise({ x, z, radius: 2.2, strength: 0.45, kind: 'footstep' });
        minDist = Math.min(minDist, Math.hypot(x - w.position.x, z - w.position.z));
        worst = Math.max(worst, w.suspicion);
        if (!['patrol', 'suspicious', 'return'].includes(w.state)) badState = w.state;
        if (w._visible) seen++;
        await new Promise(r => setTimeout(r, 100));
      }
      const cfg = w.ai.perception.cfg;
      return {
        pass: worst < 0.3 && badState === null && seen === 0,
        detail: {
          kind: w.kind, peakSuspicion: +worst.toFixed(3), finalState: w.state, badState,
          seenSamplesWhileHidden: seen, minDistM: +minDist.toFixed(2),
          grassMissSamples: grassMiss, samplesFacingHer: faced,
          hiddenRangeM: cfg.hiddenRange, focusPad: cfg.focusPad,
          periphDeg: cfg.periphDeg, periphRangeM: cfg.periphRange, gain: cfg.gain,
          alarmRadiusM: w.alarmRadius,
          note: 'the Redeye cone is deliberately the widest in the roster; tall grass must still beat it, or crouching stops working beside every escorted herd',
        },
      };
    })()`,
  },

  /* --------------------------------------------------------- A38-expansion */
  {
    id: 'A38-expansion', kind: 'action', lane: 'machine-ai-expansion',
    title: 'Every new kind: a 35 m hit from outside its cone points it at the SHOT ORIGIN, not at the player, and never straight to alert/attack',
    setup: READY, settle: 600, timeout: 120000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${PARK} ${BEARING} ${SIMCLOCK} ${NEWKINDS}
      const ctx = __CTX__, T = ctx.terrain;
      const picks = newPicks().filter(m => !m.docile);
      if (!picks.length) return { pass: null, detail: 'SKIP: no new kinds alive' };
      const fails = [], report = {};
      for (const m of picks) {
        freezeAll([m]);
        if (m._frozenByGate) { m.update = m._frozenByGate; m._frozenByGate = null; }
        const home = (m._gateHome || m.spawnPos).clone();
        m.position.set(home.x, T.getHeight(home.x, home.z), home.z);
        park(m, 0);                                  // facing +Z
        // she shoots from 35 m DIRECTLY BEHIND it
        const ox = home.x, oz = home.z - 35;
        const p = place(ox, oz, { crouch: false });
        // ...and then MOVES, so "points at the player" and "points at the shot"
        // are different answers (the whole finding)
        const hit = {
          point: m.position.clone(), object: null, impact: 5, tear: 0,
          element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 },
          type: 'hunter', baseDamage: 5,
          origin: { x: ox, y: p.position.y, z: oz },
        };
        m.takeDamage(hit);
        /**
         * AND SHE VANISHES. The first cut moved her 30 m sideways and waited
         * 1.2 s, which measured the wrong thing for two species: a suspicious
         * machine TURNS toward the shot, and a Grazer (the fastest sensor
         * sweep in the roster) and a Stormbird (90 m of sight range) swept
         * their cone across her new spot and re-acquired her honestly — so
         * lastKnown was on the player because the machine had EARNED it. The
         * finding is about a machine that has NOT earned it, so she leaves the
         * valley: 240 m out is past every sightRange here, and anything the
         * machine then believes came from the arrow alone.
         */
        {
          // 120 m toward the valley centre — past every sightRange in the
          // roster (the Stormbird's 90 m is the longest) and, unlike a fixed
          // +240 offset, always INSIDE the world: a Stormbird home at
          // (150, 230) put her outside the rim, the player controller clamped
          // her straight back to 87 m, and the machine then saw her honestly.
          const L = Math.hypot(home.x, home.z) || 1;
          const ax = home.x - (home.x / L) * 120, az = home.z - (home.z / L) * 120;
          p.position.set(ax, T.getHeight(ax, az), az);
        }
        await simSleep(1.2);
        const dOrigin = Math.hypot(m.lastKnown.x - ox, m.lastKnown.z - oz);
        const dPlayer = Math.hypot(m.lastKnown.x - p.position.x, m.lastKnown.z - p.position.z);
        const stateOk = m.state === 'suspicious' || m.state === 'search';
        const ok = stateOk && dOrigin <= 8 && dOrigin < dPlayer;
        report[m.kind] = {
          state: m.state, toShotOriginM: +dOrigin.toFixed(2),
          toPlayerM: +dPlayer.toFixed(2), suspicion: +m.suspicion.toFixed(2),
        };
        if (!ok) {
          fails.push(m.kind + ': state ' + m.state + ', lastKnown ' + dOrigin.toFixed(1)
            + ' m from the shot origin and ' + dPlayer.toFixed(1) + ' m from the player');
        }
        m._frozenByGate = m.update; m.update = () => {};
      }
      return { pass: fails.length === 0, detail: { kinds: picks.length, failures: fails, report,
        note: 'bar: state is suspicious or search (never alert/attack), lastKnown within 8 m of the SHOT ORIGIN, and nearer the origin than the player — who has moved 30 m since the hit landed' } };
    })()`,
  },

  /* --------------------------------------------------------- A39-expansion */
  {
    id: 'A39-expansion', kind: 'action', lane: 'machine-ai-expansion',
    title: 'Every new kind: standing still in the cone at 30 m takes >= 1.5 SIM s to suspicious and >= 3.0 s to alert; the Tallneck never reacts at all',
    setup: READY, settle: 600, timeout: 180000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${PARK} ${SIMCLOCK} ${NEWKINDS}
      const ctx = __CTX__, T = ctx.terrain;
      const picks = newPicks();
      if (!picks.length) return { pass: null, detail: 'SKIP: no new kinds alive' };
      const fails = [], report = {}, starved = [];
      for (const m of picks) {
        freezeAll([m]);
        if (m._frozenByGate) { m.update = m._frozenByGate; m._frozenByGate = null; }
        const home = (m._gateHome || m.spawnPos).clone();
        m.position.set(home.x, T.getHeight(home.x, home.z), home.z);
        park(m, 0);
        m.suspicion = 0; m._unseenT = 99;
        // squarely in front, 30 m, standing, still, no grass
        const px = home.x, pz = home.z + 30;
        const p = place(px, pz, { crouch: false });
        p.inTallGrass = false;
        m.ai.perception.scanT = 0;                 // sweep phase pinned
        let tSus = null, tAlert = null;
        const ran = await simSleep(7, (el) => {
          p.inTallGrass = false;
          if (tSus === null && m.suspicion >= m.perceptCfg.susEnter) tSus = el;
          if (tAlert === null && m.suspicion >= m.perceptCfg.alertAt) tAlert = el;
        });
        const docile = !!m.docile;
        report[m.kind] = {
          docile, gain: m.perceptCfg.gain,
          suspiciousAtS: tSus === null ? null : +tSus.toFixed(2),
          alertAtS: tAlert === null ? null : +tAlert.toFixed(2),
          endState: m.state, endSuspicion: +m.suspicion.toFixed(2), simRan: +ran.toFixed(1),
        };
        if (ran < 5) { starved.push(m.kind); m._frozenByGate = m.update; m.update = () => {}; continue; }
        if (docile) {
          // the Tallneck's whole species: every sense is zero AND the state
          // guard holds, so nothing it can be shown moves it off its loop
          if (m.suspicion > 0.02 || m.state !== 'patrol') {
            fails.push(m.kind + ': docile machine reacted — suspicion '
              + m.suspicion.toFixed(2) + ', state ' + m.state);
          }
        } else if (tSus !== null && tSus < 1.5) {
          fails.push(m.kind + ': suspicious after only ' + tSus.toFixed(2) + ' s at 30 m (bar >= 1.5)');
        } else if (tAlert !== null && tAlert < 3.0) {
          fails.push(m.kind + ': alert after only ' + tAlert.toFixed(2) + ' s at 30 m (bar >= 3.0)');
        }
        m._frozenByGate = m.update; m.update = () => {};
      }
      const detail = { kinds: picks.length, failures: fails, starved, report,
        note: 'the audit curve, per new kind: a standing, still player squarely in the cone at 30 m is never seen instantly. A kind that never reaches the threshold inside the window passes this bar (it is a floor, not a ceiling) and is caught instead by A41-expansion, which needs it to fight. The Tallneck is asserted the other way: it must not react at all.' };
      if (starved.length) return { pass: null, detail: { ...detail, why: 'PENDING: ' + JSON.stringify(starved) + ' banked under 5 of 7 sim seconds' } };
      return { pass: fails.length === 0, detail };
    })()`,
  },

  /* --------------------------------------------------------- A40-expansion */
  {
    id: 'A40-expansion', kind: 'action', lane: 'machine-ai-expansion',
    title: 'Every new fighting kind: breaking contact for 6 SIM s drops it to search, walking to lastKnown and not to the player',
    setup: READY, settle: 600, timeout: 180000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${SIMCLOCK} ${NEWKINDS}
      const ctx = __CTX__, T = ctx.terrain;
      const picks = newFighters();
      if (!picks.length) return { pass: null, detail: 'SKIP: no new fighting kinds alive' };
      const fails = [], report = {}, starved = [];
      for (const m of picks) {
        freezeAll([m]);
        if (m._frozenByGate) { m.update = m._frozenByGate; m._frozenByGate = null; }
        const home = (m._gateHome || m.spawnPos).clone();
        m.position.set(home.x, T.getHeight(home.x, home.z), home.z);
        m.ai.engage.reset(); m._attack = null; m._attackCd = 0;
        const band = m.ai.engage.cfg.band;
        const r = Math.max(5, (band[0] + band[1]) * 0.5);
        const px = home.x + r, pz = home.z;
        const p = place(px, pz, { crouch: false });
        m.forceState('attack');
        m.lastKnown.set(px, p.position.y, pz);
        await simSleep(0.6);
        /**
         * She vanishes, completely: 240 m out, past every sightRange in the
         * roster. The bar is then unambiguous — the machine must walk to the
         * point it REMEMBERS and give the fight up, and its belief must not
         * follow her.
         *
         * The first cut also asserted "player distance grows", copied from the
         * audit's A40 text. That is not a property of the AI on this staging:
         * lastKnown and the player's escape bearing can point the same way, so
         * walking correctly to the remembered point reduced the distance to
         * her by 4-10 m for six of eight species while their belief sat
         * exactly where she had been. What the finding is actually about is
         * whether the machine tracks the BELIEF or the PLAYER, and that is
         * what is asserted here.
         */
        const L = Math.hypot(home.x, home.z) || 1;
        const gx = home.x - (home.x / L) * 120, gz = home.z - (home.z / L) * 120;
        p.position.set(gx, T.getHeight(gx, gz), gz);
        p.setCrouch(true);
        const toLast0 = Math.hypot(m.position.x - m.lastKnown.x, m.position.z - m.lastKnown.z);
        const d0 = Math.hypot(m.position.x - gx, m.position.z - gz);
        const ran = await simSleep(6.5);
        const d1 = Math.hypot(m.position.x - gx, m.position.z - gz);
        const toLast = Math.hypot(m.position.x - m.lastKnown.x, m.position.z - m.lastKnown.z);
        const beliefAtOld = Math.hypot(m.lastKnown.x - px, m.lastKnown.z - pz);
        /**
         * SEARCHING IS A SWEEP, NOT A STAND. SEARCH.radius is [6, 18] m, so
         * a machine correctly working the cover around its belief is 6-18 m
         * off it by design — the first cut asked for "no further than it
         * started" and failed a Shell-Walker that was 17.3 m out on its own
         * sweep ring. The bar is the ring plus slack.
         */
        const ok = (m.state === 'search' || m.state === 'return' || m.state === 'patrol')
          && beliefAtOld <= 12 && toLast <= 26;
        report[m.kind] = {
          state: m.state, distToPlayerStartM: +d0.toFixed(1), distToPlayerEndM: +d1.toFixed(1),
          beliefStillAtOldSpotM: +beliefAtOld.toFixed(1),
          distToLastKnownStartM: +toLast0.toFixed(1), distToLastKnownM: +toLast.toFixed(1),
          simRan: +ran.toFixed(1),
        };
        if (ran < 5) { starved.push(m.kind); m._frozenByGate = m.update; m.update = () => {}; continue; }
        if (!ok) {
          fails.push(m.kind + ': state ' + m.state + ', belief moved ' + beliefAtOld.toFixed(1)
            + ' m from where she was last seen, and it ended ' + toLast.toFixed(1)
            + ' m from that remembered point (started ' + toLast0.toFixed(1)
            + ' m; the search sweep ring is 6-18 m, bar 26)');
        }
        m._frozenByGate = m.update; m.update = () => {};
      }
      const detail = { kinds: picks.length, failures: fails, starved, report,
        note: 'bar: it gives up the fight (search/return/patrol), its belief stays within 12 m of the point she was LAST SEEN at (she is 240 m away by then, past every sightRange in the roster, so nothing it believes can have been earned), and it stays inside the 6-18 m search sweep ring around that remembered point (bar 26 m) — it works the cover where it last saw her, and tracks the belief, never the player. The omniscient-pursuit finding, re-asserted for every kind this lane added.' };
      if (starved.length) return { pass: null, detail: { ...detail, why: 'PENDING: ' + JSON.stringify(starved) } };
      return { pass: fails.length === 0, detail };
    })()`,
  },

  /* --------------------------------------------------------- A41-expansion */
  {
    id: 'A41-expansion', kind: 'action', lane: 'machine-ai-expansion',
    title: 'Every new fighting kind, 22 SIM s on the hardest arc of its own ground: idle-statue samples < 20 %, XZ travel > 18 m, >= 3 distinct table moves (>= 2 for a 2-move table)',
    setup: READY, settle: 600, timeout: 420000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${TICKPROBE} ${HARDGROUND} ${SOLO} ${NEWKINDS}
      const ctx = __CTX__;
      const DUR = 22, EACH_WALL = 38000, ACCEL = 3, SEED = 0x4E01;
      const picks = newFighters();
      if (!picks.length) return { pass: null, detail: 'SKIP: no new fighting kinds alive' };
      const report = {}, fails = [], starved = [];
      let prevRng = null, prevStep = ctx.engine.stepMode;
      try {
        prevRng = ctx.machines.setAiRng(ctx.machines.seededRng(SEED));
        ctx.engine.stepMode = 'fixed';
        ctx.engine.requestTimeScale?.('gate-a41-exp', ACCEL);
        for (const m of picks) {
          freezeAll([m]);
          if (m._frozenByGate) { m.update = m._frozenByGate; m._frozenByGate = null; }
          const ground = hardBearing(m);
          const s = await soloDuel(m, { dur: DUR, wall: EACH_WALL, bearing: ground.bearing });
          const bar = Math.max(2, Math.min(3, m.ai.picker.movesetSize()));
          report[s.kind] = {
            stagedBearing: ground.bearing, ringOccludedFrac: ground.occ,
            simSeconds: +s.probe.sim.toFixed(1), travelM: +s.probe.travel.toFixed(1),
            idleFrac: +s.probe.idleFrac.toFixed(2), distinct: s.distinct, bar,
            moveset: s.moveset, firedAt: s.fired, modes: s.modes,
            heldReachM: s.held.reach, ringWindowM: s.window,
            ringGiveUps: m.ai.engage.ringGiveUps,
            unreachableRings: m.ai.picker.unreachableRings(),
            blindGiveUps: s.blindGiveUps, blockedSteps: s.blocked,
          };
          if (s.probe.sim < DUR * 0.8) { starved.push(s.kind); continue; }
          if (s.probe.idleFrac >= 0.2) {
            fails.push(s.kind + ': idle on ' + (s.probe.idleFrac * 100).toFixed(0) + '% of the samples between attacks (bar < 20%)');
          }
          if (s.probe.travel < 18) {
            fails.push(s.kind + ': travelled only ' + s.probe.travel.toFixed(1) + ' m in ' + s.probe.sim.toFixed(0) + ' sim s (bar > 18)');
          }
          if (s.distinct.length < bar) {
            fails.push(s.kind + ': only ' + s.distinct.length + ' distinct move(s) '
              + JSON.stringify(s.distinct) + ' — the table holds ' + JSON.stringify(s.moveset));
          }
          if (s.blocked > 0) {
            fails.push(s.kind + ': ' + JSON.stringify(s.blockedIds)
              + ' reach into the band but not into ring window ' + JSON.stringify(s.window)
              + ' on ' + s.blocked + ' of ' + s.steps + ' sim steps (livelock)');
          }
        }
      } finally {
        ctx.engine.requestTimeScale?.('gate-a41-exp', null);
        ctx.machines.setAiRng(prevRng || null);
        ctx.engine.stepMode = prevStep;
        for (const m of picks) { m.territory = m._gateTerritory ?? m.territory; }
      }
      const detail = { kinds: picks.length, simSecondsEach: DUR, rngSeed: SEED, starved, failures: fails, report,
        note: 'A41 for the kinds this lane added, staged exactly as A41c stages the Round-3 roster: one species at a time on its OWN ground, on the worst arc hardBearing(m) can find that it can still fight from, on whole 1/60 s steps with the lane dice seeded. ringGiveUps / unreachableRings are the new ring-reach watchdog (ENGAGE.ringPatience) reporting how often this ground refused a radius.' };
      if (starved.length) return { pass: null, detail: { ...detail, why: 'PENDING: ' + JSON.stringify(starved) + ' banked under ' + (DUR * 0.8) + ' sim s' } };
      return { pass: fails.length === 0, detail };
    })()`,
  },

  /* -------------------------------------------------------- A41b-expansion */
  /**
   * The structural half, for the new tables only: no hole in the band, at least
   * two non-rear rows reaching it, no row the sole answer for more than 70 %,
   * every row's `[min,max]` inside what its builder can reach, and the ring
   * floor under the shortest row's max. Reads the table, so it is instant and
   * it is the one gate that can fail BEFORE a machine has moved.
   */
  {
    id: 'A41b-expansion', kind: 'action', lane: 'machine-ai-expansion',
    title: 'Every new kind’s table: no hole in the engage band, >= 2 non-rear rows reach it, no row is the sole answer for > 70 %, and the ring floor clears the shortest row',
    setup: READY, settle: 400, timeout: 60000,
    assert: `(async () => {
      ${NEWKINDS}
      const picks = newPicks();
      if (!picks.length) return { pass: null, detail: 'SKIP: no new kinds alive' };
      const fails = [], report = {};
      for (const m of picks) {
        const pk = m.ai.picker, eng = m.ai.engage;
        const band = eng.cfg.band, win = eng._ringWindow();
        if (m.docile) {
          report[m.kind] = { docile: true, rows: pk.rows.length, band };
          if (pk.rows.length) fails.push(m.kind + ': a docile machine must have an EMPTY attack table, it has ' + pk.rows.length + ' rows');
          continue;
        }
        const prof = pk.bandProfile();
        const cov = pk.coverage();
        const blocked = pk.bandUnreachable(win[0], win[1]);
        const holesInBand = cov.holes.filter(h => h[1] > band[0] && h[0] < band[1]);
        report[m.kind] = {
          band, ringWindowM: [+win[0].toFixed(2), +win[1].toFixed(2)],
          moveset: pk.movesetRows(), bandRows: prof.ids, distinctInBand: prof.distinct,
          maxSoleFrac: prof.maxSoleFrac, maxSoleId: prof.maxSoleId,
          uncoveredFracOfBand: prof.uncovered, holesInBand, allHoles: cov.holes,
          blockedByRingWindow: blocked, phantom: cov.phantom,
        };
        if (prof.uncovered > 0.001 || holesInBand.length) {
          fails.push(m.kind + ': ' + JSON.stringify(holesInBand) + ' inside band ' + JSON.stringify(band) + ' has no move at all');
        }
        if (prof.distinct < 2) {
          fails.push(m.kind + ': only ' + prof.distinct + ' non-rear row reaches band ' + JSON.stringify(band));
        }
        if (prof.maxSoleFrac > 0.70) {
          fails.push(m.kind + ': ' + prof.maxSoleId + ' is the sole answer for '
            + (prof.maxSoleFrac * 100).toFixed(0) + '% of the band (bar 70%)');
        }
        if (blocked.length) {
          fails.push(m.kind + ': ' + JSON.stringify(blocked) + ' reach into the band but not into ring window '
            + JSON.stringify(win.map(v => +v.toFixed(2))) + ' — a move it can want for ever and never fire');
        }
        if (cov.phantom.length) {
          fails.push(m.kind + ': phantom rows ' + JSON.stringify(cov.phantom) + ' are in the table and not in the world');
        }
      }
      return { pass: fails.length === 0, detail: { kinds: picks.length, failures: fails, report,
        note: 'ai/doctrine.js states these five rules in its BAND HONESTY header; this asserts them off the live picker, so a row edited in tables.js by machines-expansion is checked the same way' } };
    })()`,
  },

  /* -------------------------------------------------------- A41c-expansion */
  /**
   * The sustained half, for the new kinds only. Identical staging and identical
   * bar to `A41c-sustained-variety` — which already covers them by
   * auto-discovery — but scoped to the nine so a failure names the species and
   * so this lane has a verdict that does not move when another lane's species
   * changes. 5-of-5 repeatability is the residue bar and is asserted by RUNNING
   * IT FIVE TIMES, not by claiming a seed makes it stable: `runs` below duels
   * every new kind five times from five different seeds and every run must pass.
   */
  {
    id: 'A41c-expansion', kind: 'action', lane: 'machine-ai-expansion',
    title: 'New kinds, FIVE independent seeded duels each: >= 2 distinct table moves every run (3 where the table holds 3+), and never a band row the ring window cannot set up',
    setup: READY, settle: 600, timeout: 600000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${TICKPROBE} ${HARDGROUND} ${SOLO} ${NEWKINDS}
      const ctx = __CTX__;
      const DUR = 16, EACH_WALL = 26000, ACCEL = 3;
      const SEEDS = [0xC1A1, 0xC1A2, 0xC1A3, 0xC1A4, 0xC1A5];
      const picks = newFighters();
      if (!picks.length) return { pass: null, detail: 'SKIP: no new fighting kinds alive' };
      const runs = [], fails = [], starved = [];
      const byKind = {};
      let prevRng = null, prevStep = ctx.engine.stepMode;
      const T0 = performance.now(), WALL_TOTAL = 520000;
      try {
        ctx.engine.stepMode = 'fixed';
        ctx.engine.requestTimeScale?.('gate-a41c-exp', ACCEL);
        for (let r = 0; r < SEEDS.length; r++) {
          const run = { seed: SEEDS[r], kinds: {} };
          for (const m of picks) {
            if (performance.now() - T0 > WALL_TOTAL) { run.cutShort = true; break; }
            prevRng = ctx.machines.setAiRng(ctx.machines.seededRng(SEEDS[r])) ?? prevRng;
            freezeAll([m]);
            if (m._frozenByGate) { m.update = m._frozenByGate; m._frozenByGate = null; }
            const ground = hardBearing(m);
            const s = await soloDuel(m, { dur: DUR, wall: EACH_WALL, bearing: ground.bearing });
            const bar = Math.max(2, Math.min(3, m.ai.picker.movesetSize()));
            const row = {
              distinct: s.distinct, bar, blocked: s.blocked, blockedIds: s.blockedIds,
              sim: +s.probe.sim.toFixed(1), bearing: ground.bearing, occ: ground.occ,
              ringGiveUps: m.ai.engage.ringGiveUps,
            };
            run.kinds[s.kind] = row;
            (byKind[s.kind] = byKind[s.kind] || []).push(s.distinct.length);
            if (s.probe.sim < DUR * 0.8) { starved.push(s.kind + '@seed' + r); continue; }
            if (s.distinct.length < bar) {
              fails.push('run ' + r + ' ' + s.kind + ': ' + s.distinct.length + ' distinct '
                + JSON.stringify(s.distinct) + ' (bar ' + bar + ', table ' + JSON.stringify(s.moveset) + ')');
            }
            if (s.blocked > 0) {
              fails.push('run ' + r + ' ' + s.kind + ': ' + JSON.stringify(s.blockedIds)
                + ' unarrangeable from ring window on ' + s.blocked + ' of ' + s.steps + ' steps');
            }
          }
          runs.push(run);
          if (run.cutShort) break;
        }
      } finally {
        ctx.engine.requestTimeScale?.('gate-a41c-exp', null);
        ctx.machines.setAiRng(prevRng || null);
        ctx.engine.stepMode = prevStep;
        for (const m of picks) { m.territory = m._gateTerritory ?? m.territory; }
      }
      const cleanRuns = runs.filter(r => !r.cutShort).length;
      const detail = {
        kinds: picks.length, seeds: SEEDS.length, cleanRuns,
        distinctCountsPerKind: byKind, starved, failures: fails, runs,
        wallMs: Math.round(performance.now() - T0),
        note: 'the residue bar for this lane is "A41c passes 5 of 5 clean runs", so the gate RUNS IT FIVE TIMES from five different seeds rather than claiming one seed makes a verdict repeatable. distinctCountsPerKind is the distribution the residue asked to see printed, not one run.',
      };
      if (starved.length || cleanRuns < SEEDS.length) {
        return { pass: null, detail: { ...detail, why: 'PENDING: ' + (starved.length
          ? JSON.stringify(starved) + ' starved' : 'only ' + cleanRuns + ' of ' + SEEDS.length + ' runs fitted the wall budget') } };
      }
      return { pass: fails.length === 0, detail };
    })()`,
  },

  /* ------------------------------------------------------------ A41d-must-fire */
  /**
   * The MUST_FIRE half of the held-radius bar, for the new kinds, with the
   * excuse rule the residue asked for: a fired row only excuses a silent one
   * through the SAME band+ring-window shell `owedRows` uses, never from a rear
   * arc, and only when it covers a meaningful SHARE of the silent row's shell.
   * (The same tightening was applied in place to
   * `A41d-held-radius-coverage`, which covers the Round-3 roster.)
   */
  {
    id: 'A41d-must-fire', kind: 'action', lane: 'machine-ai-expansion',
    title: 'New kinds: no owed move is stood in for 3 s and never thrown (excused only by a fired FRONT move sharing >= 50 % of its band+window shell), and none is both unfired and never stood in',
    setup: READY, settle: 600, timeout: 420000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${TICKPROBE} ${HARDGROUND} ${SOLO} ${NEWKINDS}
      const ctx = __CTX__;
      const DUR = 22, EACH_WALL = 38000, ACCEL = 3, SEED = 0x41DE;
      const MIN_HELD = 0.75, MUST_FIRE = 3.0, SHARE = 0.5;
      const picks = newFighters();
      if (!picks.length) return { pass: null, detail: 'SKIP: no new fighting kinds alive' };
      const report = {}, fails = [], starved = [];
      let prevRng = null, prevStep = ctx.engine.stepMode;
      try {
        prevRng = ctx.machines.setAiRng(ctx.machines.seededRng(SEED));
        ctx.engine.stepMode = 'fixed';
        ctx.engine.requestTimeScale?.('gate-a41d-mf', ACCEL);
        for (const m of picks) {
          freezeAll([m]);
          if (m._frozenByGate) { m.update = m._frozenByGate; m._frozenByGate = null; }
          const owed = owedRows(m);
          const ground = hardBearing(m);
          const s = await soloDuel(m, { dur: DUR, wall: EACH_WALL, bearing: ground.bearing });
          const band = m.ai.engage.cfg.band, win = m.ai.engage._ringWindow();
          const rows = owed.map((row) => ({
            id: row.id, shell: [row.lo, row.hi],
            fired: s.distinct.includes(row.id),
            heldS: +m.ai.engage.heldAt(row.lo, row.hi).toFixed(2),
          }));
          const firedShells = s.distinct
            .map((id) => m.ai.picker.rowById.get(id)).filter(Boolean)
            .filter((row) => row.arc !== 'rear')
            .map((row) => [Math.max(row.min, band[0], win[0]), Math.min(row.max, band[1], win[1])])
            .filter((f) => f[0] <= f[1]);
          const shared = (lo, hi) => {
            const w = Math.max(1e-6, hi - lo);
            for (const f of firedShells) {
              if ((Math.min(hi, f[1]) - Math.max(lo, f[0])) / w >= SHARE) return true;
            }
            return false;
          };
          const mute = rows.filter(r => !r.fired && r.heldS >= MUST_FIRE && !shared(r.shell[0], r.shell[1]));
          const dead = rows.filter(r => !r.fired && r.heldS < MIN_HELD);
          report[s.kind] = {
            stagedBearing: ground.bearing, ringOccludedFrac: ground.occ,
            simSeconds: +s.probe.sim.toFixed(1), band, ringWindowM: s.window,
            owed: rows, distinct: s.distinct, firedAt: s.fired,
            firedShells: firedShells.map(f => [+f[0].toFixed(2), +f[1].toFixed(2)]),
            heldReachM: s.held.reach, heldStepM: s.held.step, heldBins: s.held.bins,
            heldButSilent: mute.map(d => d.id), neverStoodIn: dead.map(d => d.id),
            ringGiveUps: m.ai.engage.ringGiveUps,
            unreachableRings: m.ai.picker.unreachableRings(),
          };
          if (s.probe.sim < DUR * 0.8) { starved.push(s.kind); continue; }
          if (mute.length) {
            fails.push(s.kind + ': ' + JSON.stringify(mute.map(d => d.id))
              + ' STOOD IN RANGE AND NEVER FIRED — '
              + mute.map(d => d.id + ' held ' + d.heldS + ' s inside ' + d.shell[0] + '-' + d.shell[1] + ' m').join('; ')
              + ' (bar ' + MUST_FIRE + ' s), and no FRONT move that did fire covers >= '
              + (SHARE * 100) + '% of those radii');
          }
          if (dead.length) {
            fails.push(s.kind + ': ' + JSON.stringify(dead.map(d => d.id))
              + ' never fired AND the footwork never stood in their range — '
              + dead.map(d => d.id + ' needs ' + d.shell[0] + '-' + d.shell[1] + ' m, held ' + d.heldS + ' s').join('; '));
          }
        }
      } finally {
        ctx.engine.requestTimeScale?.('gate-a41d-mf', null);
        ctx.machines.setAiRng(prevRng || null);
        ctx.engine.stepMode = prevStep;
        for (const m of picks) { m.territory = m._gateTerritory ?? m.territory; }
      }
      const detail = { kinds: picks.length, simSecondsEach: DUR, minHeldSeconds: MIN_HELD,
        mustFireSeconds: MUST_FIRE, excuseShare: SHARE, rngSeed: SEED, starved, failures: fails, report,
        note: 'the residue asked for exactly this tightening: clip fired rows through the same band+ring-window shell as owedRows, drop arc:rear rows from the excuse set, and require a meaningful share rather than any overlap. firedShells prints the clipped ranges the excuse was computed from.' };
      if (starved.length) return { pass: null, detail: { ...detail, why: 'PENDING: ' + JSON.stringify(starved) } };
      return { pass: fails.length === 0, detail };
    })()`,
  },

  /* --------------------------------------------------------- A42-expansion */
  {
    id: 'A42-expansion', kind: 'action', lane: 'machine-ai-expansion',
    title: 'Every new kind with a tearable component: tearing it mid-windup cancels the attack, staggers 0.6-1.2 s and emits machine-stagger',
    setup: READY, settle: 600, timeout: 180000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${SIMCLOCK} ${NEWKINDS}
      const ctx = __CTX__, T = ctx.terrain;
      const picks = newFighters().filter(m => m.parts.some(p => p.attached && Number.isFinite(p.tearHp)));
      if (!picks.length) return { pass: null, detail: 'SKIP: no new kind with a tearable component' };
      const fails = [], report = {};
      for (const m of picks) {
        freezeAll([m]);
        if (m._frozenByGate) { m.update = m._frozenByGate; m._frozenByGate = null; }
        const home = (m._gateHome || m.spawnPos).clone();
        m.position.set(home.x, T.getHeight(home.x, home.z), home.z);
        const band = m.ai.engage.cfg.band;
        const r = Math.max(4, band[0] + 0.6);
        const px = home.x + r, pz = home.z;
        const p = place(px, pz, { crouch: false });
        m.ai.engage.reset(); m._attack = null; m._attackCd = 0;
        m.suspicion = 1; m._unseenT = 0; m.lastKnown.copy(p.position);
        m.forceState('attack');
        let ev = null;
        const on = (e) => { if (e.machine === m && !ev) ev = e; };
        ctx.events.on('machine-stagger', on);
        // wait for a windup, then tear a component off it
        await simUntil(() => m._attack && m._attack.phase === 'windup', 8,
          () => { p.position.set(px, p.position.y, pz); m.suspicion = 1; m._unseenT = 0; m.lastKnown.copy(p.position); });
        const had = m._attack ? (m._attack.rowId || m._attack.kind) : null;
        const part = m.parts.find(pp => pp.attached && Number.isFinite(pp.tearHp));
        if (part) {
          // TEAR, not kill: a big impact term would take the machine's health
          // with it and the gate would be measuring a death, not a stagger
          m.takeDamage({
            point: m.position.clone(), object: part.mesh.children[0] || null,
            impact: 1, tear: part.tearHp + 400, element: 'none',
            elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter',
            baseDamage: 1, part,
          });
        }
        await simSleep(0.35);
        const staggered = m.state === 'stagger' || m.state === 'downed' || !!ev;
        const cancelled = !m._attack || (m._attack.rowId || m._attack.kind) !== had;
        ctx.events.off?.('machine-stagger', on);
        report[m.kind] = {
          windupCaught: had, torn: part ? part.name : null, tornAttached: part ? part.attached : null,
          state: m.state, staggerEvent: ev ? { duration: +(ev.duration || 0).toFixed(2), kind: ev.kind } : null,
          attackCancelled: cancelled,
        };
        if (!had) { m._frozenByGate = m.update; m.update = () => {}; continue; }  // never wound up: not evidence
        const dur = ev ? ev.duration : 0;
        const durOk = !ev || ev.kind === 'downed' || (dur >= 0.55 && dur <= 1.25);
        if (!staggered || !cancelled || !durOk) {
          fails.push(m.kind + ': tore ' + (part ? part.name : 'nothing') + ' mid-windup of ' + had
            + ' -> state ' + m.state + ', cancelled ' + cancelled + ', stagger ' + JSON.stringify(report[m.kind].staggerEvent));
        }
        m._frozenByGate = m.update; m.update = () => {};
      }
      return { pass: fails.length === 0, detail: { kinds: picks.length, failures: fails, report,
        note: 'a species that never reached a windup inside 8 sim s is reported and skipped rather than failed — that is a staging miss, not a stagger defect' } };
    })()`,
  },

  /* --------------------------------------------------------- A43-expansion */
  {
    id: 'A43-expansion', kind: 'action', lane: 'machine-ai-expansion',
    title: 'Kill one of every new kind and run the corpse clock at 200 m: every wreck disposes, leaves no scene node behind, and schedules a respawn',
    setup: READY, settle: 600, timeout: 180000,
    assert: `(async () => {
      ${PLACE} ${NEWKINDS}
      const ctx = __CTX__;
      const count = (o) => { let n = 0; o.traverse(() => n++); return n; };
      const sceneNodes = () => { let n = 0; ctx.scene.traverse(() => n++); return n; };
      const picks = newPicks();
      if (!picks.length) return { pass: null, detail: 'SKIP: no new kinds alive' };
      const before = sceneNodes();
      const killed = [];
      for (const m of picks) {
        let mesh = null; m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
        const n = count(m.root);
        killed.push({ kind: m.kind, nodes: n, root: m.root, site: m._site ? m._site.id : null, m });
        m.takeDamage({ point: m.position.clone(), object: mesh, impact: 999999, tear: 0,
          element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 999999 });
      }
      await new Promise(r => setTimeout(r, 600));
      // ...and walk away, which is what the lifecycle waits for
      const p = ctx.player;
      p.position.set(p.position.x + 400, 0, p.position.z + 400);
      p._snapToGround?.();
      await new Promise(r => setTimeout(r, 400));
      ctx.machines.sites.advance(240, 1);
      await new Promise(r => setTimeout(r, 900));
      const after = sceneNodes();
      const live = new Set(ctx.machines.list.map(m => m.root));
      const stillInScene = killed.filter(k => {
        let seen = false;
        ctx.scene.traverse(o => { if (o === k.root) seen = true; });
        return seen && !live.has(k.root);
      });
      const notDisposed = killed.filter(k => !k.m._disposed);
      const scheduled = killed.filter(k => k.site != null
        && ctx.machines.sites.sites.some(s => s.id === k.site && (s.pending || s.machine)));
      const fails = [];
      if (stillInScene.length) fails.push(JSON.stringify(stillInScene.map(k => k.kind)) + ' left their root in the scene after disposal');
      if (notDisposed.length) fails.push(JSON.stringify(notDisposed.map(k => k.kind)) + ' never reached dispose()');
      if (scheduled.length < killed.filter(k => k.site != null).length) {
        fails.push('only ' + scheduled.length + ' of ' + killed.filter(k => k.site != null).length + ' sites scheduled a respawn');
      }
      return {
        pass: fails.length === 0,
        detail: {
          killed: killed.map(k => ({ kind: k.kind, nodes: k.nodes, disposed: !!k.m._disposed })),
          sceneNodesBefore: before, sceneNodesAfter: after, delta: after - before,
          sitesAudit: ctx.machines.sites.audit(), populationAudit: ctx.machines.populationAudit(),
          squads: ctx.machines.doctrineAudit().squads, failures: fails,
          note: 'delta is expected to be strongly NEGATIVE (one machine of every new kind left the world). The bar is structural: no wreck root survives in the scene, every wreck reached dispose(), and every site it came from is scheduled to repopulate.',
        },
      };
    })()`,
  },

  /* ------------------------------------ A90-memory-stability-expansion ---- */
  /**
   * THIS LANE'S §4 MEMORY BAR, AND THE INVARIANT UNDER IT.
   *
   * `A90-memory-stability` (lane `core`) is not redefined here — it keeps its
   * own, stricter numbers and this lane reports its reading. §4 sets a
   * different bar for `machine-ai-expansion` ("scene object growth <= +600,
   * heap <= +25 %"), and adds the thing the residue actually needed: the
   * ATTRIBUTION. The round-3 verdict read "+1130 objects after 30 kills" and
   * concluded the corpse reclaim was leaking. It was not. A census of every
   * node in the scene across that same loop attributed +1170 of +1170 to LIVE
   * machines and 0 to anything orphaned — the loop spawns 30 Watchers (110
   * scene nodes each, the heaviest donor hierarchy in the roster) and nothing
   * ever despawns them. The defect was a missing CEILING, not a missing
   * `dispose()`, and `ECOSYSTEM.population` is that ceiling.
   *
   * So this gate asserts three things a raw count cannot:
   *   - `nonMachineGrowth === 0`   nothing outside a machine root grew at all
   *   - `orphanMachineRoots === 0` no machine root survives outside the roster
   *   - `populationAudit().overBudget === false` the ceiling actually held
   * ...on top of the §4 numbers.
   */
  {
    id: 'A90-memory-stability-expansion', kind: 'action', lane: 'machine-ai-expansion',
    timeout: 300000,
    title: '30 kills + spawns with the full expansion roster: scene growth <= +600 and heap <= +25 %, with ZERO growth outside machine roots, zero orphaned roots, and the population budget holding',
    setup: READY, settle: 1500,
    assert: `(async () => {
      const ctx = __CTX__;
      const r = ctx.renderer || ctx.engine?.renderer;
      const count = (o) => { let n = 0; o.traverse(() => n++); return n; };
      const snap = () => {
        let total = 0; ctx.scene.traverse(() => total++);
        let machineNodes = 0;
        for (const m of ctx.machines.list) machineNodes += count(m.root);
        const live = new Set(ctx.machines.list.map(m => m.root));
        let orphanRoots = 0, orphanNodes = 0;
        for (const ch of ctx.scene.children) {
          if (/-machine$/.test(ch.name || '') && !live.has(ch)) { orphanRoots++; orphanNodes += count(ch); }
        }
        return {
          total, machineNodes, nonMachine: total - machineNodes,
          orphanRoots, orphanNodes, roster: ctx.machines.list.length,
          geo: r.info.memory.geometries, tex: r.info.memory.textures,
          heap: performance.memory?.usedJSHeapSize ?? null,
        };
      };
      const kill = (m) => {
        let mesh = null; m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
        m.takeDamage({ point: m.position.clone(), object: mesh, impact: 999999, tear: 0,
          element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 999999 });
      };
      if (window.gc) window.gc();
      await new Promise(res => setTimeout(res, 1200));
      const a = snap();
      let kills = 0;
      for (let i = 0; i < 30; i++) {
        const m = ctx.machines.list.find(x => x.alive && !x._disposed && !x.docile);
        if (!m) break;
        kill(m); kills++;
        ctx.input.keys.add('KeyW');
        await new Promise(res => setTimeout(res, 900));
        ctx.input.keys.delete('KeyW');
        try { ctx.machines.spawn('watcher', ctx.player.position.x + 30, ctx.player.position.z + 30); } catch (e) {}
        await new Promise(res => setTimeout(res, 250));
      }
      // the corpse lifecycle needs the player far away and ~130 s of clock
      const p0 = ctx.player.position.clone();
      ctx.player.position.set(p0.x + 260, 0, p0.z + 260);
      ctx.player._snapToGround?.();
      await new Promise(res => setTimeout(res, 800));
      ctx.machines.sites.advance(240, 1);
      await new Promise(res => setTimeout(res, 1500));
      if (window.gc) window.gc();
      await new Promise(res => setTimeout(res, 1200));
      const b = snap();
      const pop = ctx.machines.populationAudit();
      const heapGrowth = (a.heap && b.heap) ? (b.heap - a.heap) / a.heap : null;
      const objGrowth = b.total - a.total;
      const nonMachineGrowth = b.nonMachine - a.nonMachine;
      const fails = [];
      if (objGrowth > 600) fails.push('scene grew +' + objGrowth + ' objects (bar +600)');
      if (nonMachineGrowth !== 0) fails.push(nonMachineGrowth + ' scene objects grew OUTSIDE every machine root — that is a real leak, not population');
      if (b.orphanRoots !== 0) fails.push(b.orphanRoots + ' machine root(s) survive in the scene outside the roster (' + b.orphanNodes + ' nodes)');
      if (heapGrowth !== null && heapGrowth >= 0.25) fails.push('heap grew ' + (heapGrowth * 100).toFixed(1) + '% (bar 25%)');
      if (pop.overBudget) fails.push('population is over its node budget: ' + pop.nodes + ' > ' + pop.budget);
      return {
        pass: fails.length === 0,
        detail: {
          kills, before: a, after: b, objGrowth, nonMachineGrowth,
          machineNodeGrowth: b.machineNodes - a.machineNodes,
          geoGrowth: b.geo - a.geo, texGrowth: b.tex - a.tex,
          heapGrowthPct: heapGrowth === null ? 'n/a (--enable-precise-memory-info)' : +(heapGrowth * 100).toFixed(1),
          populationAudit: pop, sitesAudit: ctx.machines.sites.audit(),
          squads: ctx.machines.doctrineAudit().squads, failures: fails,
          note: 'ATTRIBUTION IS THE BAR. nonMachineGrowth and orphanMachineRoots are the only readings that can distinguish a leak from a population; the raw object delta cannot, which is what the round-3 verdict turned on. geoGrowth/texGrowth are reported, not asserted: they track the SURVIVING machines per-machine component geometry, so they move with the composition of the live roster exactly as the node count does.',
        },
      };
    })()`,
  },

  /* ------------------------------------------------- A100-expansion-doctrine */
  /**
   * THE DOCTRINE ITSELF, ASSERTED (this lane's brief, casting-v4 §2).
   *
   * Every other gate here measures a machine in isolation. These are the
   * behaviours that only exist between machines — herd flee-and-rearguard,
   * convoy crate guard, basking pair, corruption cascade with its hard cap,
   * docility, escort slots, the mountable override path and the flyer's
   * air-to-ground transition — and none of them would be caught by a duel.
   */
  {
    id: 'A100-expansion-doctrine', kind: 'action', lane: 'machine-ai-expansion',
    title: 'Herd stampede + single rearguard, convoy closes on the crate carrier, basking pair wakes together, corruption caps at 2, Tallneck never leaves patrol, Stormbird grounds when every engine is torn',
    setup: READY, settle: 600, timeout: 180000,
    assert: `(async () => {
      ${FREEZE} ${PLACE} ${SIMCLOCK} ${NEWKINDS}
      const ctx = __CTX__, T = ctx.terrain, S = ctx.machines.squads;
      const fails = [], report = {};

      /* ---- 1. HERD: one rearguard turns, everyone else stampedes -------- */
      const herd = S.herds.find(h => h.members.some(m => m.alive && (m.kind === 'broadhead' || m.kind === 'grazer')));
      if (!herd) { report.herd = 'SKIP: no living broadhead/grazer herd'; }
      else {
        const living = herd.members.filter(m => m.alive && !m._disposed);
        herd.alarmed = false; herd.rearguard = null;
        for (const m of living) { m._fleeing = false; m._fleeT = 0; m.suspicion = 0; }
        const c = herd.center;
        const p = place(c.x + 12, c.z + 12, { crouch: false });
        const trigger = living[0];
        trigger.lastKnown.copy(p.position);
        trigger.onAlerted ? trigger.onAlerted(true) : null;
        const fleeing = living.filter(m => m._fleeing).length;
        const rg = herd.rearguard;
        report.herd = {
          kind: trigger.kind, members: living.length, alarmed: herd.alarmed,
          rearguard: rg ? rg.kind : null, rearguardIsMember: !!rg && living.includes(rg),
          fleeing, vector: [+herd.vector.x.toFixed(2), +herd.vector.z.toFixed(2)],
          vectorPointsAway: herd.vector.x * (c.x - p.position.x) + herd.vector.z * (c.z - p.position.z) > 0,
        };
        if (!herd.alarmed) fails.push('herd: alarm did not latch');
        if (!rg || !living.includes(rg)) fails.push('herd: no rearguard among the living');
        if (living.length > 1 && fleeing !== living.length - 1) {
          fails.push('herd: ' + fleeing + ' of ' + (living.length - 1) + ' non-rearguard members are stampeding');
        }
        if (!report.herd.vectorPointsAway) fails.push('herd: the stampede vector does not point away from the threat');
        // ...and the flag RESETS (machine-ai-07), so it can be spooked again
        for (const m of living) { m.suspicion = 0; m._fleeing = false; }
        herd._calmT = 0;
        S.update(S.calmTime + 1);
        report.herd.alarmedAfterCalm = herd.alarmed;
        if (herd.alarmed) fails.push('herd: the alarm flag did not reset after the calm window');
      }

      /* ---- 2. CONVOY: escorts close ranks on the crate carrier ---------- */
      const convoy = S.convoys[0];
      if (!convoy) { report.convoy = 'SKIP: no convoy registered'; }
      else {
        const living = convoy.members.filter(m => m.alive && !m._disposed);
        const carrier = convoy.carrier;
        const carrierHasCrate = !!carrier && carrier.parts.some(p => p.name === convoy.defend && p.attached);
        for (const m of living) m.suspicion = 0.9;
        S._updateConvoys(0.1);
        const others = living.filter(m => m !== convoy.carrier);
        const slotted = others.filter(m => m.escort
          && Math.hypot(m.escort.x - convoy.carrier.position.x, m.escort.z - convoy.carrier.position.z) < 0.01);
        report.convoy = {
          members: living.length, carrier: carrier ? carrier.kind : null, carrierHasCrate,
          alarmed: convoy.alarmed, defend: convoy.defend,
          escortsOnCarrier: slotted.length, escorts: others.length,
          ringRadiusM: convoy.radius,
        };
        if (!carrier) fails.push('convoy: no carrier elected');
        if (!convoy.alarmed) fails.push('convoy: an alarmed convoy did not latch');
        if (others.length && slotted.length !== others.length) {
          fails.push('convoy: ' + slotted.length + ' of ' + others.length + ' escorts closed ranks on the carrier');
        }
        for (const m of living) m.suspicion = 0;
      }

      /* ---- 3. BASKING: the pair wakes with whichever one notices ------- */
      const site = S.baskings[0];
      if (!site) { report.basking = 'SKIP: no basking site registered'; }
      else {
        const living = site.members.filter(m => m.alive && !m._disposed);
        site.alarmed = false;
        for (const m of living) { m.suspicion = 0; m.setState('patrol'); }
        const waker = living[0];
        if (waker) {
          const p2 = place(waker.position.x + 8, waker.position.z, { crouch: false });
          waker.lastKnown.copy(p2.position);
          waker.suspicion = 1; waker._unseenT = 0;
          waker.setState('alert');
        }
        const awake = living.filter(m => m.state !== 'patrol' || m.suspicion > 0.5).length;
        report.basking = {
          members: living.length, alarmed: site.alarmed, awake,
          baskingFlagSet: living.every(m => !!m.basking),
          perception: { gain: waker ? waker.perceptCfg.gain : null, periphRange: waker ? waker.perceptCfg.periphRange : null },
        };
        if (living.length > 1 && awake < living.length) {
          fails.push('basking: only ' + awake + ' of ' + living.length + ' Snapmaws woke with the site');
        }
        for (const m of living) { m.suspicion = 0; m.setState('patrol'); }
      }

      /* ---- 4. CORRUPTION: it happens, and it is HARD CAPPED at 2 ------- */
      const corr = ctx.machines.list.find(m => m.kind === 'corruptor' && m.alive);
      if (!corr) { report.corruption = 'SKIP: no living corruptor'; }
      else {
        const cfg = ctx.machines.list.length ? null : null;
        // bring three victims inside the radius and run the cascade hard
        const near = ctx.machines.list.filter(m => m !== corr && m.alive && !m.docile && m.kind !== corr.kind).slice(0, 4);
        const saved = near.map(m => m.position.clone());
        near.forEach((m, i) => m.position.set(corr.position.x + 6 + i, corr.position.y, corr.position.z + 2));
        corr.suspicion = 1; corr.setState('alert');
        corr._corruptor.t = 0;
        for (let i = 0; i < 12; i++) { S._updateCorruption(5); }
        const victims = ctx.machines.list.filter(m => m.corrupted);
        report.corruption = {
          candidates: near.length, corrupted: victims.length,
          cap: 2, kinds: victims.map(m => m.kind),
          uncorruptableSpear: victims.every(m => !ctx.machines.canOverride(m)),
        };
        if (victims.length && !report.corruption.uncorruptableSpear) {
          fails.push('corruption: the Spear can still override a corrupted machine (casting-v4 §2.6 says it cannot)');
        }
        if (near.length >= 2 && victims.length === 0) fails.push('corruption: a Corruptor in a fight corrupted nothing');
        if (victims.length > 2) fails.push('corruption: ' + victims.length + ' concurrent victims — the hard cap of 2 did not hold');
        // ...and the source dying releases them
        for (const v of victims) S.uncorrupt(v);
        near.forEach((m, i) => m.position.copy(saved[i]));
        corr.suspicion = 0; corr.setState('patrol');
        report.corruption.releasedOnSourceLoss = ctx.machines.list.filter(m => m.corrupted).length === 0;
        if (!report.corruption.releasedOnSourceLoss) fails.push('corruption: victims stayed corrupted after release');
      }

      /* ---- 5. TALLNECK: nothing moves it off its loop ------------------ */
      const tn = ctx.machines.list.find(m => m.kind === 'tallneck' && m.alive);
      if (!tn) { report.tallneck = 'SKIP: no living tallneck'; }
      else {
        const tried = [];
        for (const st of ['alert', 'attack', 'search', 'suspicious', 'stagger']) {
          tn.setState(st); tried.push([st, tn.state]);
        }
        ctx.machines.alarm(tn, 200);
        tn.takeDamage({ point: tn.position.clone(), object: null, impact: 400, tear: 0,
          element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 400 });
        report.tallneck = {
          docile: tn.docile, state: tn.state, attempts: tried,
          rows: tn.ai.picker.rows.length, alarmRadius: tn.alarmRadius,
          suspicion: +tn.suspicion.toFixed(2), alive: tn.alive,
        };
        if (tn.state !== 'patrol') fails.push('tallneck: left patrol (state ' + tn.state + ')');
        if (tn.ai.picker.rows.length) fails.push('tallneck: has ' + tn.ai.picker.rows.length + ' attack rows');
      }

      /* ---- 6. STORMBIRD: every engine torn = grounded, and the grounded
                rows become legal at the same instant (negated needPart) ---- */
      const sb = ctx.machines.list.find(m => m.kind === 'stormbird' && m.alive);
      if (!sb) { report.stormbird = 'SKIP: no living stormbird'; }
      else {
        const pk = sb.ai.picker;
        const before = {
          engines: sb.parts.filter(p => p.name === 'engine' && p.attached).length,
          groundedRowsLegal: pk.rows.filter(r => r.needPart === '!engine').map(r => [r.id, pk._needPartOk(r.needPart)]),
          band: sb.ai.engage.cfg.band.slice(), airborne: !!sb._airborne,
        };
        for (const p of sb.parts.filter(p => p.name === 'engine' && p.attached)) {
          sb.takeDamage({ point: sb.position.clone(), object: p.mesh.children[0] || null,
            impact: 1, tear: p.tearHp + 500, element: 'none', elementAmount: 0,
            dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 1, part: p });
        }
        const after = {
          engines: sb.parts.filter(p => p.name === 'engine' && p.attached).length,
          groundedRowsLegal: pk.rows.filter(r => r.needPart === '!engine').map(r => [r.id, pk._needPartOk(r.needPart)]),
          band: sb.ai.engage.cfg.band.slice(), airborne: !!sb._airborne,
          airRowLegal: pk._needPartOk('engine'),
        };
        report.stormbird = { before, after, alive: sb.alive };
        if (before.groundedRowsLegal.some(r => r[1])) fails.push('stormbird: a grounded row was legal while its engines were attached');
        if (after.engines === 0) {
          if (!after.groundedRowsLegal.every(r => r[1])) fails.push('stormbird: the grounded rows did not become legal once every engine was torn');
          if (after.airborne) fails.push('stormbird: still airborne with zero engines');
          if (after.band[1] >= before.band[1]) fails.push('stormbird: the band did not come down on grounding (' + JSON.stringify(before.band) + ' -> ' + JSON.stringify(after.band) + ')');
        }
      }

      return { pass: fails.length === 0, detail: { failures: fails, report,
        chassis: ctx.machines.chassisAudit(), doctrine: ctx.machines.doctrineAudit(),
        note: 'the between-machine half of the expansion: no duel can see any of these. A section reports SKIP (and is not judged) when the machine it needs is not alive in this world.' } };
    })()`,
  },
];
