/**
 * Round 4 gate block — lane `anim-core` (§4 of docs/ROUND4-AUDIT.md).
 *
 * Same contract as tools/gates.config.mjs: ACTION gates run `assert` in page
 * context with `__CTX__` / `__GAME__` available and resolve
 * `{ pass, detail }`; a console error during a gate is an automatic FAIL;
 * a missing API resolves `{ pass: null }` (PENDING, not FAIL).
 *
 * tools/* is owned by core-platform, so this block lives in its own file and
 * the runner merges every `tools/gates.round4.*.mjs` alongside GATES.
 *
 * FIX ROUND 1 — four judge findings are answered here and in
 * src/entities/anim/{clipLayer,locomotion,registry}.js:
 *   1+5  `stuck()` short-circuited on external layers, so A27's two stuck
 *        clauses could not fail. ClipLayer now has a real external detector
 *        (owner-declared intent + timeline stall) and A27 PROVES it can fire,
 *        headlessly and on the live roll layer, before asserting it is empty.
 *   2    A27's literal subject (glinthawk) is no longer folded into an Aloy
 *        PASS: it is its own gate, A27b, which reports PENDING while
 *        machine-rig has not migrated and FAILS the moment they claim to have.
 *   3+4  A26 could not fail on machine-side divergence. `audit()` now marks a
 *        divergent machine rig `legacy` and carries a `machines.ok` term, and
 *        the pass expression below reads both.
 *   6    A27 repaired the cross-lane NaN and then asserted the repaired
 *        condition. The verdict is now computed first; the restore happens
 *        after it, only so the gate's screenshot is not a black frame.
 */

const INPUT_ON = `__CTX__.input.enabled = true;`;

/**
 * combat.js and wheel.js both WRITE engine.timeScale every frame (they damp it
 * toward their own target), so a plain assignment survives about one frame.
 * To hold a slow-motion condition for a measurable window the gate pins the
 * property behind an accessor whose setter is a no-op, then restores the plain
 * data property. Nothing in src/ is modified; the pin is undone in a finally.
 */
const PIN = `
  const pinTS = (eng, v) => {
    const had = Object.getOwnPropertyDescriptor(eng, 'timeScale');
    const prev = eng.timeScale;
    Object.defineProperty(eng, 'timeScale', {
      configurable: true, enumerable: true, get: () => v, set: () => {},
    });
    return () => {
      if (had) Object.defineProperty(eng, 'timeScale', had);
      else Object.defineProperty(eng, 'timeScale',
        { value: prev, writable: true, enumerable: true, configurable: true });
      eng.timeScale = prev;
    };
  };
`;

export const GATES = [
  {
    id: 'A26-one-convention', kind: 'action', lane: 'anim-core',
    title: 'One bone-space convention: __CTX__.anim.audit() proves every Aloy rotation path is BoneSpace, and FAILS on any live rig — Aloy or machine — that diverges',
    settle: 1500,
    assert: `(async () => {
      const anim = __CTX__.anim || window.__ANIM__;
      if (!anim || typeof anim.audit !== 'function') {
        return { pass: false, detail: 'no __CTX__.anim.audit() — anim-core did not publish' };
      }
      const a = anim.audit(__CTX__);
      const st = anim.selftest(0.02);
      const probe = a.aloy.animatorProbe;
      const ml = a.machines.local;

      // The bar, literally:
      //  1. every anim-core module exists and its algebra self-test passes
      //  2. zero rig modules in the KNOWN_MODULES table are 'legacy' — that
      //     status is set by a LIVE probe, not by self-declaration, and now
      //     covers the machine rigs as well as Aloy (judge findings 3+4)
      //  3. every Aloy rotation path is BoneSpace, and the one still owned by
      //     another lane (playerAnimator, player-anim, Wave 2) is proved
      //     identical to BoneSpace on the LIVE rig — an import swap, not a
      //     second convention
      //  4. the machine rigs that ARE reachable are identical too, so a
      //     Wave 1 migration that changes the algebra fails this gate instead
      //     of merely printing DIVERGENT in the detail
      const pass = !!(a.ok && st.pass
        && a.modulesPresent
        && a.legacyModules.length === 0
        && a.aloy.ok && a.aloy.divergent.length === 0
        && probe && probe.reachable === true && probe.identical === true
        && probe.entryTableValid === true
        && a.machines.ok === true
        && (ml && ml.reachable ? ml.identical === true : true));

      return { pass, detail: {
        version: a.version,
        modules: Object.keys(a.modules).filter(k => a.modules[k]).join('+'),
        algebraMaxDeltaRad: a.algebra.maxDeltaRad,
        clipLayerSelftest: st.clipLayer.pass,
        stuckDetectorSelftest: st.stuckDetector.pass,
        rigSelftest: st.rig.pass,
        legacyModules: a.legacyModules,
        selfDeclaredForeign: a.selfDeclaredForeign,
        registered: a.registered.map(r => r.id + '=' + r.convention),
        aloyPaths: a.aloy.rows,
        animatorEquivalence: probe && {
          bones: probe.bones, probed: probe.checked,
          maxDeltaRad: probe.maxDeltaRad, identical: probe.identical,
          entryTableValid: probe.entryTableValid,
        },
        machinesOk: a.machines.ok,
        machineLocalEquivalence: ml,
        mixerSpecies: a.machines.mixer,
        pendingMigration: a.pendingMigration.map(p => p.id + ' -> ' + p.owner + ' (wave ' + p.wave + ')'),
        doc: a.doc,
      } };
    })()`,
  },

  {
    id: 'A27-timescale-safe', kind: 'action', lane: 'anim-core',
    title: 'ALOY one-shots restore on mixer time, not wall clock: 0.02 timeScale through a roll leaves no action stuck — and the stuck detector is proved able to fire first',
    setup: INPUT_ON,
    settle: 900,
    assert: `(async () => {
      const anim = __CTX__.anim || window.__ANIM__;
      if (!anim || typeof anim.selftest !== 'function') {
        return { pass: false, detail: 'no __CTX__.anim — anim-core did not publish' };
      }
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      ${PIN}
      const eng = __CTX__.engine, p = __CTX__.player, an = p.animator;
      const TS = 0.02;

      /* ---- 1. headless proof: one-shot restores on animation time, AND the
              stuck detector fires for every state it claims to catch ---- */
      const st = anim.selftest(TS);

      /* ---- 2. FALSIFIABILITY on the live rig ------------------------------
         The first Round 4 drop asserted \`stuck.length === 0\` on layers whose
         stuck() opened with \`if (this.external) return null\`. Before this gate
         is allowed to read anything into an empty list, it forces the REAL
         Aloy roll layer into each stuck state and checks the detector reports
         it. Purely synchronous: no frame is drawn between the force and the
         restore, and update() rewrites the weight from the action next tick. */
      let falsifiable = { reachable: false };
      const loco = an && an.loco;
      const rollLayer = loco && loco.set && loco.set.get && loco.set.get('roll');
      if (rollLayer) {
        const save = {
          intent: rollLayer.intent, intentT: rollLayer.intentT,
          overstayT: rollLayer.overstayT,
          stallT: rollLayer.stallT, weight: rollLayer.weight,
          _lastIntent: rollLayer._lastIntent,
        };
        try {
          const before = rollLayer.stuck();
          rollLayer.intent = 0; rollLayer.overstayT = 9; rollLayer.weight = 0.9;
          const heldAfterIntent = rollLayer.stuck();
          const setSees = loco.audit().stuck.map(s => s.name);
          rollLayer.intent = 1; rollLayer.overstayT = 0;
          rollLayer.stallT = 9; rollLayer.weight = 0.9;
          const frozenScrub = rollLayer.stuck();
          falsifiable = {
            reachable: true, external: rollLayer.external, scrubbed: rollLayer.scrubbed,
            healthyBefore: before,
            heldAfterIntent, frozenScrub, setRollup: setSees,
            // the clause A27 asserts must be able to come out non-empty
            canFail: before === null
              && typeof heldAfterIntent === 'string' && /after intent cleared/.test(heldAfterIntent)
              && typeof frozenScrub === 'string' && /frozen/.test(frozenScrub)
              && setSees.indexOf('roll') >= 0,
          };
        } finally {
          rollLayer.intent = save.intent; rollLayer.intentT = save.intentT;
          rollLayer.overstayT = save.overstayT;
          rollLayer.stallT = save.stallT; rollLayer.weight = save.weight;
          rollLayer._lastIntent = save._lastIntent;
        }
        falsifiable.healthyAfterRestore = rollLayer.stuck();
      }

      /* ---- 3. the live Aloy roll one-shot under a pinned 0.02 timeScale ---- */
      // NOTE the fixed-step loop (main.js, D5) only advances the sim once the
      // accumulator reaches 1/60 s, so at timeScale 0.02 roughly 49 frames in
      // 50 tick every system with dt === 0. That is the condition this gate
      // exists to survive; anim-core is dt-0 safe (ClipLayer guards dt > 0,
      // LocomotionBlend only ever multiplies BY dt).
      let live = { skipped: 'no clip base' };
      let liveOk = null;
      let crossLane = [];
      let repair = null;
      const roll = loco && loco.actions && loco.actions.roll;
      const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
      if (loco && roll && typeof loco.audit === 'function') {
        const dur = roll.getClip().duration;
        const homePos = p.position.clone();
        // ---- REGRESSION GUARD: dodge OUT OF A SPRINT, not from a standstill.
        // The first Round 4 drop rolled from rest, and passed. In the full
        // suite it FAILED, because a dodge that interrupts locomotion is a
        // different state: every gait layer's intent drops to 0 while its
        // weight is still high, and locomotion.js normalizes by the weight
        // sum — as the sum dips during the roll's ramp, the division pushes
        // those decaying tails back UP. A detector that timed the age of the
        // intent value instead of the age of the overstay fired on that. This
        // is also just what a player does, so the gate now does it too and
        // the two stuck-list clauses below are measured in that state.
        __CTX__.input.keys.add('KeyW');
        __CTX__.input.keys.add('ShiftLeft');
        await sleep(1400);
        const sprintSpeed = Math.hypot(p.velocity.x, p.velocity.z);
        const gaitWeightAtDodge = {};
        for (const slot of ['idle', 'walk', 'jog', 'sprint']) {
          const L = loco.set.get(slot);
          if (L) gaitWeightAtDodge[slot] = +L.weight.toFixed(4);
        }

        // mixer baseline AFTER the sprint: the animation-seconds clauses below
        // measure the slow-motion window only, not the run-up into it
        const mix0 = an.mixer.time;
        const unpin = pinTS(eng, TS);
        let slow;
        try {
          await sleep(120);
          const mixPin = an.mixer.time;
          p.dodge();
          __CTX__.input.keys.delete('KeyW');
          __CTX__.input.keys.delete('ShiftLeft');
          const t0 = performance.now();
          await sleep(900);
          const wall = (performance.now() - t0) / 1000;
          slow = {
            wallSeconds: +wall.toFixed(3),
            observedTimeScale: +((an.mixer.time - mixPin - 0.12 * TS) / wall).toFixed(4),
            dodging: p.dodging,
            dodgeK: +p.dodgeK.toFixed(4),
            rollClipFrac: +(roll.time / dur).toFixed(4),
            rollWeight: +roll.weight.toFixed(4),
            rollIntent: rollLayer ? rollLayer.intent : null,
            animSeconds: +(an.mixer.time - mix0).toFixed(4),
            stuck: loco.audit().stuck,
            playerFinite: finite(p.position) && finite(p.velocity),
          };
        } finally { unpin(); }

        await sleep(1700);                     // let the roll finish in real time
        const after = {
          dodging: p.dodging,
          dodgeK: +p.dodgeK.toFixed(3),
          rollWeight: +roll.weight.toFixed(4),
          rollIntent: rollLayer ? rollLayer.intent : null,
          rollIntentHeldFor: rollLayer ? +rollLayer.intentT.toFixed(3) : null,
          dominant: an.dominantAction() && an.dominantAction().slot,
          animSeconds: +(an.mixer.time - mix0).toFixed(3),
          stuck: loco.audit().stuck,
          playerFinite: finite(p.position) && finite(p.velocity),
        };

        // ---- VERDICT FIRST, repair after (judge finding 6) ----
        // player.js integrates the roll from the clip's root-motion curve; an
        // earlier revision differentiated it by dt, which is 0/0 on a dt === 0
        // fixed-step tick and sent position NaN (scene renders black). That is
        // another lane's file, but a NaN player during a slow-motion roll is a
        // real failure of the behaviour this gate films, so it FAILS here and
        // is named — it is not repaired into a pass.
        const nanSeen = slow.playerFinite === false || after.playerFinite === false;
        if (nanSeen) {
          crossLane.push({
            id: 'player-dodge-divide-by-dt', owner: 'player-control', wave: 1,
            file: 'src/entities/player.js (dodge integration)',
            symptom: 'dt === 0 fixed-step tick during a roll -> 0/0 -> NaN velocity and position; scene renders black',
            trigger: 'engine.timeScale <= ~0.3 (wheel 0.25, Concentration 0.02) while dodging',
            fix: 'integrate the root-motion curve directly, or guard the divide (dt > 1e-5)',
            blocking: 'A27 FAILS while this is live',
          });
        }

        // Every clause below is an ANIMATION quantity except the last, which is
        // the cross-lane blocker above: anim-core's contract is that the
        // one-shot advances on the mixer's clock and hands back cleanly.
        liveOk = slow.dodging === true                 // still rolling 900 ms in
          && slow.dodgeK < 0.35                        // a wall clock would be > 1
          && slow.rollClipFrac < 0.35                  // the clip did NOT run ahead
          && slow.animSeconds < 0.15                   // the mixer ran on scaled dt
          && slow.stuck.length === 0
          && after.dodging === false                   // resolved once time ran
          && after.rollWeight < 0.05                   // handed back, not stuck
          && after.animSeconds > 1.0
          && after.stuck.length === 0
          && nanSeen === false;

        // only NOW, and only to leave the film a lit frame
        if (nanSeen) {
          p.velocity.set(0, 0, 0);
          p.position.copy(homePos);
          if (p._snapToGround) p._snapToGround();
          repair = 'restored player after the verdict was recorded (gate still FAILS)';
        }
        live = { clipDuration: +dur.toFixed(3), pinnedTimeScale: TS, fixedStepDtZeroTicks: true,
                 enteredFrom: 'sprint', sprintSpeedMs: +sprintSpeed.toFixed(2), gaitWeightAtDodge,
                 slow, after, postVerdictRepair: repair };
      }

      // the stuck clauses above only mean anything if the detector can fail
      const detectorProved = !!(st.stuckDetector && st.stuckDetector.pass
        && falsifiable.reachable && falsifiable.canFail === true
        && falsifiable.healthyAfterRestore === null);

      return { pass: liveOk === null ? null : !!(st.pass && detectorProved && liveOk), detail: {
        subject: 'Aloy roll one-shot (anim-core owns locomotion.js). The glinthawk half of §4 is gate A27b — it is PENDING, not passing.',
        clipLayerSelftest: st.clipLayer,
        stuckDetectorSelftest: { pass: st.stuckDetector.pass, failed: st.stuckDetector.failed,
          cases: Object.fromEntries(Object.entries(st.stuckDetector.cases)
            .map(([k, v]) => [k, v.stuck === null ? 'silent (expected ' + v.want + ')' : v.stuck])) },
        liveStuckDetectorFalsifiable: falsifiable,
        detectorProved,
        aloyRoll: live,
        aloyRollOk: liveOk,
        crossLane,
      } };
    })()`,
  },

  {
    id: 'A27b-timescale-safe-glinthawk', kind: 'action', lane: 'machine-rig',
    title: 'PENDING for machine-rig Wave 1 — the glinthawk one-shot still restores on setTimeout; at 0.02 timeScale it fires ~45x early',
    settle: 1500,
    assert: `(async () => {
      // §4 names the glinthawk as A27's literal subject. anim-core does not own
      // src/entities/machines/glinthawk.js, so this gate cannot fix it — but
      // folding its result into an Aloy PASS would tell a reader the timescale
      // bug is gone when it is not. So it stands alone:
      //   PENDING  glinthawk still on its own wall-clock one-shot (Wave 1 work
      //            has not started) — measured and reported, never green
      //   FAIL     it CLAIMS ClipLayerSet but a wall-clock restore is still in
      //            the source, or the migrated one-shot desyncs at 0.02
      //   PASS     migrated: the clip advances on mixer time and hands back
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      ${PIN}
      const eng = __CTX__.engine, TS = 0.02;
      // the herd streams in over the first few seconds and the roster is not
      // identical run to run, so poll rather than sample once
      const roster = () => (__CTX__.machines && __CTX__.machines.list) || [];
      const pick = () => roster().find(m => m && m.kind === 'glinthawk' && m.mixer && m._act && m.alive);
      let g = pick();
      for (let i = 0; i < 24 && !g; i++) { await sleep(250); g = pick(); }
      if (!g) {
        const list = roster();
        const seen = list.filter(m => m && m.kind === 'glinthawk')
          .map(m => ({ alive: !!m.alive, mixer: !!m.mixer, act: m._act ? Object.keys(m._act).length : 0 }));
        return { pass: null, detail: { reachable: false, why: 'no live glinthawk spawned within 6 s',
          machinesInList: list.length, kinds: list.map(m => m && m.kind), glinthawksSeen: seen,
          owner: 'machine-rig (Wave 1)' } };
      }

      const src = typeof g._oneShot === 'function' ? String(g._oneShot) : '';
      const migrated = !!(g.layers && g.layers.audit);
      const wallClock = /setTimeout|setInterval|Date\\.now|performance\\.now/.test(src);
      const act = g._act.Attack, idle = g._act.Idle;
      let measured = null;

      if (act && idle) {
        const unpin = pinTS(eng, TS);
        // Decisive instrumentation rather than an inference: wrap setTimeout
        // for exactly the synchronous span of the one-shot call, so any timer
        // the species schedules is recorded WITH the wall-clock moment it
        // fires. An earlier revision inferred the restore from idle.time
        // snapping backwards, which read as "did not fire" whenever idle
        // happened to already be at 0. This cannot be fooled that way.
        const origST = window.setTimeout;
        const timers = [];
        window.setTimeout = function (fn, ms) {
          const rec = { delayMs: ms, firedAfterWallSeconds: null };
          timers.push(rec);
          const t0 = performance.now();
          const args = Array.prototype.slice.call(arguments, 2);
          return origST.call(window, function () {
            rec.firedAfterWallSeconds = +((performance.now() - t0) / 1000).toFixed(3);
            return typeof fn === 'function' ? fn.apply(this, args) : fn;
          }, ms);
        };
        try {
          const clipDur = act.getClip().duration;
          const idleT0 = idle.time, idleW0 = idle.weight, attW0 = act.weight;
          try {
            if (migrated && g.layers.oneShot) g.layers.oneShot('Attack', { fade: 0.2 });
            else g._oneShot('Attack', 0.2);
          } finally { window.setTimeout = origST; }
          // wait one WALL-CLOCK clip duration: at TS 0.02 only ~2 % of the clip
          // has animated, so a mixer-time scheduler must still be mid-shot
          await sleep(clipDur * 1000 + 400);
          measured = {
            clipDuration: +clipDur.toFixed(3),
            wallSecondsWaited: +(clipDur + 0.4).toFixed(3),
            attackClipFracPlayed: +(act.time / clipDur).toFixed(4),
            attackWeight: +act.weight.toFixed(4), attackWeightBefore: +attW0.toFixed(4),
            idleTimeBefore: +idleT0.toFixed(4), idleTimeAfter: +idle.time.toFixed(4),
            idleWeightBefore: +idleW0.toFixed(4), idleWeightAfter: +idle.weight.toFixed(4),
            timersScheduledByOneShot: timers,
          };
          // a restore that ran off a wall-clock timer, caught in the act
          measured.wallClockRestoreFired = timers.some((t) => t.firedAfterWallSeconds != null);
          measured.earlyByFactor = measured.wallClockRestoreFired && measured.attackClipFracPlayed > 0
            ? +(1 / measured.attackClipFracPlayed).toFixed(1) : null;
        } finally { window.setTimeout = origST; unpin(); }
      }

      const restoredOnMixerTime = !!(measured && measured.wallClockRestoreFired === false
        && measured.attackClipFracPlayed < 0.35);

      let pass, verdict;
      if (!migrated) {
        pass = null;
        verdict = 'PENDING — glinthawk.js is machine-rig Wave 1 and has not migrated. '
          + 'The measurement below IS the bug §4 describes: it is not fixed, and this gate is not green.';
      } else if (wallClock || !restoredOnMixerTime) {
        pass = false;
        verdict = wallClock
          ? 'FAIL — ClipLayerSet is wired up but a wall-clock timer is still in _oneShot'
          : 'FAIL — migrated, but the one-shot still restored before the clip animated';
      } else {
        pass = true;
        verdict = 'PASS — the one-shot advanced and handed back on mixer time';
      }

      return { pass, detail: {
        verdict,
        owner: 'machine-rig (Wave 1)',
        file: 'src/entities/machines/glinthawk.js',
        usesClipLayerSet: migrated,
        wallClockOneShotInSource: wallClock,
        measuredAtTimeScale: TS,
        measured,
        restoredOnMixerTime,
        fix: 'this._act -> ClipLayerSet; _oneShot(name, fade) -> set.oneShot(name, { fade }) — docs/ROUND4-ANIM-CORE.md §4',
        stuckAfter: migrated && g.layers.stuck ? g.layers.stuck() : null,
      } };
    })()`,
  },
];

export default GATES;
