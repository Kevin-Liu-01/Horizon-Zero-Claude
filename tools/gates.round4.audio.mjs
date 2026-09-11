/**
 * Round 4 — `audio` lane gates (audit §4).
 *
 * Audio cannot be judged from a screenshot, so every gate here measures actual
 * samples. Two channels:
 *   1. `ctx.audio.probe3D()` / `probeSet()` render the REAL bus graph and the
 *      REAL spatial chain through an `OfflineAudioContext` and hand back
 *      per-ear energy, peak, RMS and a 12-band spectrum.
 *   2. `ctx.audio.bankAudit()` / `cueCounts()` report what the live mix
 *      actually loaded and actually played.
 *
 * Every gate arms the AudioContext first: browsers refuse one until a gesture,
 * and a suspended context measures as silence.
 */

/** Page-context helper: arm the AudioContext and wait for the bank to decode. */
const ARM = `
  const _arm = async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));
    const a = __CTX__.audio;
    const t0 = performance.now();
    while (!a.ac && performance.now() - t0 < 5000) await new Promise(r => setTimeout(r, 60));
    if (a.ac && a.ac.state !== 'running') { try { await a.ac.resume(); } catch (e) {} }
    if (a.bankReady) { try { await a.bankReady; } catch (e) {} }
    return a;
  };`;

/** The seed bank the audit asks for, by set id. */
const SPECIES = ['watcher', 'strider', 'scrapper', 'longleg', 'glinthawk', 'sawtooth', 'behemoth', 'thunderjaw'];

/**
 * The species -> footfall weight class the design assigns (mirrors `WEIGHT` in
 * `src/audio/audio.js`). Duplicated on purpose: a gate that imported the table
 * it is grading would pass whatever the table happened to say, including a
 * table that had collapsed all eight species onto one class.
 */
const WEIGHT = {
  watcher: 'light', scrapper: 'light', glinthawk: 'light', longleg: 'medium',
  strider: 'medium', sawtooth: 'medium', behemoth: 'heavy', thunderjaw: 'heavy',
};

export const GATES = [
  /* ===================================================================== */
  {
    id: 'A73-sample-bank', kind: 'action', lane: 'audio',
    title: 'Sample bank: >60 decoded buffers, every one with an allowed licence, seed sets complete',
    settle: 300,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac) return { pass: null, detail: 'SKIP: no AudioContext in this browser' };
      const b = a.bankAudit();
      const need = [
        ['foot/grass', 'foot/dirt', 'foot/rock'],
        ${JSON.stringify(SPECIES)}.flatMap(s => ['voice/' + s + '/windup', 'voice/' + s + '/strike']),
        ['hunter', 'sharpshot', 'war'].flatMap(w => ['nock','draw','release','flyby','empty'].map(k => 'bow/' + w + '/' + k)),
        ['hit/plink', 'hit/thunk', 'hit/crunch', 'hit/crit'],
        ['amb/meadow', 'amb/river', 'amb/campfire'],
      ].flat();
      const missing = need.filter(s => !a.bank.has(s));
      // a licence row is not enough — the file must actually make sound
      const probe = await a.probeSet('hit/crit');
      const audible = !!probe && probe.peak > 0.05;
      const pass = b.size > 60
        && b.unlicensed === 0
        && b.failedCount === 0
        && b.rejectedCount === 0
        && Object.keys(b.licenses).every(l => ['CC0-1.0', 'CC-PD', 'Unlicense', 'PD'].includes(l))
        && missing.length === 0
        && b.megabytes <= 40
        && audible;
      return { pass, detail: {
        buffers: b.size, sets: b.sets, megabytes: b.megabytes,
        licenses: b.licenses, unlicensed: b.unlicensed,
        failed: b.failedCount, rejected: b.rejectedCount,
        missingSeedSets: missing, probeCritPeak: probe && probe.peak,
      } };
    })()`,
  },

  /* ===================================================================== */
  {
    /**
     * Regression gate for the servo-loop chain leak (judge-audio-pipeline, R1).
     *
     * `machine-killed` faded the idle bed and armed `chain.endsAt`, but nothing
     * ever swept `_loopChains` — so the chain stayed `busy` forever. Eight
     * deaths in earshot exhausted the 8-chain pool and no machine in the world
     * ever hummed again for the rest of the session.
     *
     * The invariant this pins: **`loopChainsBusy` may exceed `servoLoops` only
     * by the chains currently mid-fade.** Comparing the two, rather than to a
     * fixed number, makes the gate immune to how many real machines happen to
     * be within the 55 m radius when it runs.
     *
     * Synthetic machines on purpose: killing ten real ones would drag every
     * other lane's death path (wreck lifecycle, stimulus cascade, HUD toasts)
     * into an audio gate, and this build already has `Machines.update` system
     * errors that would fail it for someone else's bug. The synthetics are
     * killed through the REAL `machine-killed` event, so the real handler is
     * what gets exercised; `_wreck` is preset and the body is moved 9 km away
     * first so the other listeners file nothing and no stimulus is heard.
     */
    id: 'A78-loop-reclaim', kind: 'action', lane: 'audio',
    title: 'Servo idle beds survive repeated deaths: the loop-chain pool is reclaimed, not one-way',
    settle: 400, timeout: 60000,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac) return { pass: null, detail: 'SKIP: no AudioContext' };
      if (!a.bank.has('machine/servo-loop')) return { pass: null, detail: 'SKIP: no machine/servo-loop cue' };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      /**
       * Poll, never sleep a fixed span: a chain is released on the first
       * _updateSpatial tick after its fade ends, and under a loaded gate box
       * (eight lanes, one GPU) AudioContext time drifts behind wall time and
       * frames are scarce. A fixed 750 ms wait sampled one tick early and made
       * this gate report a leak that the film showed clearing at ~900 ms.
       * The budget is generous; the leak this pins never clears at all.
       */
      const waitFor = async (fn, budget = 4000) => {
        const t = performance.now();
        while (performance.now() - t < budget) { if (fn()) return true; await sleep(60); }
        return false;
      };
      const layers = () => a.debugState().layers;
      const P = __CTX__.player.position;
      const base = layers();

      let n = 0;
      const mk = () => ({
        kind: 'watcher', displayName: 'watcher', alive: true, eyeHeight: 1.2,
        _wreck: true,                                  // sites.onKilled() early-returns
        position: { x: P.x + 1.5, y: P.y, z: P.z + 1.5 },
        _gateId: ++n,
      });

      // --- three rounds of four in-earshot deaths, through machine-killed
      const rounds = [];
      for (let r = 0; r < 3; r++) {
        const batch = [];
        for (let i = 0; i < 4; i++) {
          const m = mk();
          a._syncServoLoop(m);                         // the roster sync mints the bed
          if (a._machineLoops.has(m)) batch.push(m);
        }
        const minted = batch.length;
        for (const m of batch) {
          m.alive = false;
          m.position.x = 9000; m.position.z = 9000;    // outside every stimulus radius
          __CTX__.events.emit('machine-killed', { machine: m });
        }
        // the chains must come back: busy may not outrun the live bed count
        const drained = await waitFor(() => {
          const L = layers(); return L.loopChainsBusy <= L.servoLoops;
        });
        const L = layers();
        rounds.push({ round: r, minted, drained, busy: L.loopChainsBusy, loops: L.servoLoops,
          // _loopList is the array the per-frame spatial walk reads instead of
          // a Map iterator; if it ever desyncs from the Map, a retired bed
          // keeps being pumped and positioned after its machine is gone
          listParity: a._loopList.length === a._machineLoops.size });
      }

      // --- and the leave-the-radius path, which used to free the chain
      //     mid-fade and hand a still-audible bed to the next machine
      const walker = mk();
      a._syncServoLoop(walker);
      const wc = a._machineLoops.get(walker)?.chain || null;
      const walkerGot = !!wc;
      walker.position.x = P.x + 400;
      a._syncServoLoop(walker);                        // want=false -> retire
      const reservedDuringFade = !!wc && wc.busy === true;
      const releasedAfterFade = !!wc
        && await waitFor(() => wc.busy === false && wc.loop === null);

      // --- the thing the bug actually cost: can a new machine still hum?
      const fresh = mk();
      a._syncServoLoop(fresh);
      const freshGotLoop = a._machineLoops.has(fresh);
      const end = layers();
      const chainsFree = (a._loopChains || []).filter(c => !c.busy).length;
      const e = a._machineLoops.get(fresh);
      if (e) a._retireLoop(fresh, e, 0.05);            // leave the mix as we found it

      if (rounds[0].minted === 0) {
        return { pass: null, detail: {
          reason: 'PENDING: the live roster held every loop chain at gate start, '
            + 'so this run could not mint a test bed. Re-run with fewer machines in earshot.',
          base, rounds,
        } };
      }
      // whatever round 0 could mint, round 2 must still mint — that is the leak
      const poolRecovers = rounds.every(r => r.minted === rounds[0].minted);
      // every round's chains came back within the budget — none were orphaned
      const noOrphans = rounds.every(r => r.drained && r.busy <= r.loops);
      // the per-frame cache never drifts from the Map it mirrors
      const listParity = rounds.every(r => r.listParity)
        && a._loopList.length === a._machineLoops.size;
      const pass = poolRecovers && noOrphans && walkerGot
        && reservedDuringFade && releasedAfterFade && freshGotLoop && listParity;
      return { pass, detail: {
        rounds, base, end, chainsFree,
        deathsDriven: n - 1, mintedPerRound: rounds.map(r => r.minted),
        walkerGot, reservedDuringFade, releasedAfterFade, freshGotLoop,
        listParity, loopList: a._loopList.length, loopMap: a._machineLoops.size,
      } };
    })()`,
  },

  /* ===================================================================== */
  {
    id: 'A74-3d', kind: 'action', lane: 'audio',
    title: '3D: front-right ≠ back-right, L/R separated, 300 m attenuates below 0.02, occlusion darkens',
    settle: 300,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac || !a.probe3D) return { pass: null, detail: 'SKIP: no AudioContext / probe3D' };
      // listener at the origin facing -Z: +x is right, -z is in front
      const r = await a.probe3D([
        { x: 14.14, y: 1.6, z: -14.14 },              // 0: 20 m front-right
        { x: 14.14, y: 1.6, z: 14.14 },               // 1: 20 m back-right
        { x: -14.14, y: 1.6, z: -14.14 },             // 2: 20 m front-left
        { x: 0, y: 1.6, z: -2 },                      // 3: reference distance
        { x: 0, y: 1.6, z: -300 },                    // 4: 300 m
        { x: 14.14, y: 1.6, z: -14.14, occ: 1 },      // 5: front-right, occluded
      ]);
      if (!r.points.length) return { pass: null, detail: 'SKIP: ' + (r.error || 'offline render failed') };
      const [fr, br, fl, ref, far, occ] = r.points;

      // front vs back at the same distance and the same side
      const levelDelta = Math.abs(fr.rms - br.rms) / Math.max(fr.rms, br.rms, 1e-9);
      const briDelta = Math.abs(fr.centroid - br.centroid) / Math.max(fr.centroid, br.centroid, 1);
      const frontBack = levelDelta > 0.08 || briDelta > 0.08;

      // left/right must be a mirror, not a smear
      const lr = fr.balance > 0.2 && fl.balance < -0.2;

      // distance law
      const atten = far.rms / Math.max(ref.rms, 1e-9);
      const distance = atten < 0.02 && far.rms < 0.02;

      // occlusion: quieter AND darker
      const occluded = occ.rms < fr.rms * 0.6 && occ.centroid < fr.centroid * 0.6;

      return { pass: frontBack && lr && distance && occluded, detail: {
        frontRight: { rms: fr.rms, bal: fr.balance, centroid: fr.centroid },
        backRight: { rms: br.rms, bal: br.balance, centroid: br.centroid },
        frontLeft: { bal: fl.balance },
        levelDelta: +levelDelta.toFixed(3), brightnessDelta: +briDelta.toFixed(3),
        atten300m: +atten.toFixed(5), rms300m: far.rms,
        occluded: { rms: occ.rms, centroid: occ.centroid },
        checks: { frontBack, lr, distance, occluded },
      } };
    })()`,
  },

  /* ===================================================================== */
  {
    id: 'A75-species-voices', kind: 'action', lane: 'audio',
    title: 'Eight species, eight voices: windup + strike per species, spectrally distinct, dispatched by kind',
    settle: 300,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac) return { pass: null, detail: 'SKIP: no AudioContext' };
      const species = ${JSON.stringify(SPECIES)};

      // 1. every species owns a windup AND a strike
      const missing = [];
      for (const s of species) {
        for (const ph of ['windup', 'strike']) {
          if (!a.bank.has('voice/' + s + '/' + ph)) missing.push('voice/' + s + '/' + ph);
        }
      }

      // 2. the eight strikes must be different SOUNDS, not one roar retuned:
      //    cosine distance between 12-band spectra, plus centroid spread
      const specs = {};
      for (const s of species) specs[s] = await a.probeSet('voice/' + s + '/strike');
      const audible = species.filter(s => !specs[s] || specs[s].peak < 0.05);
      let minDist = 1; let closest = null;
      for (let i = 0; i < species.length; i++) {
        for (let j = i + 1; j < species.length; j++) {
          const A = specs[species[i]]; const B = specs[species[j]];
          if (!A || !B) continue;
          const d = __CTX__.audio.constructor.bandDistance(A.bands, B.bands);
          if (d < minDist) { minDist = d; closest = species[i] + '/' + species[j]; }
        }
      }

      // 3. dispatch: the audio contract must select the right cue per kind.
      //    machine-ai owns the emitter; this drives the published events so the
      //    routing is gated now instead of after Wave 3.
      const before = a.cueCounts();
      for (const s of species) {
        __CTX__.events.emit('machine-attack-phase', {
          machine: { kind: s, position: { x: 6, y: 0, z: -6 }, alive: true },
          phase: 'windup', index: 0,
        });
        await new Promise(r => setTimeout(r, 40));
      }
      const after = a.cueCounts();
      const delta = (id) => (after[id] || 0) - (before[id] || 0);
      const dispatched = species.filter(s => delta('voice/' + s + '/windup') > 0);
      const fired = species.map(s => [s, delta('voice/' + s + '/windup')]);

      const pass = missing.length === 0
        && audible.length === 0
        && minDist >= 0.05
        && dispatched.length === 8;
      return { pass, detail: {
        missing, inaudible: audible,
        minSpectralDistance: minDist, closestPair: closest,
        centroids: species.map(s => [s, specs[s] && specs[s].centroid]),
        dispatchedWindups: dispatched.length, fired,
        note: 'emitter side (machine-ai machine-attack-phase in live combat) is verified by the machine-ai lane',
      } };
    })()`,
  },


  /* ===================================================================== */
  {
    /**
     * A76 — the footfall contract, measured on the sound that actually comes
     * out rather than on a string comparison.
     *
     * ROUND-4 WAVE-3 REWRITE. The first cut asked `terrain.surfaceAt()` for
     * six hand-picked coordinates and demanded three distinct answers. Those
     * six points happened to land on `dirt` and `grass`, so the gate failed a
     * valley that actually exposes SEVEN surfaces — and, worse, it would have
     * passed a build whose audio lane mapped all seven onto one silent set,
     * because it never checked that a footstep made a noise. It measured the
     * wrong lane's data through a sample too small to describe it.
     *
     * What it measures now, in the order that makes a failure diagnosable:
     *
     *   0. EMITTER LIVENESS — `machine-rig`'s GaitController must really be
     *      raising `machine-footfall` from the live roster. Synthesised
     *      events (ours, tagged) are excluded, so this cannot self-satisfy.
     *      (WHICH species walk is `A76b-footfall-species`, machine-rig's own.)
     *   1. ROUTING — one synthetic footfall per species, each carrying a
     *      position object we own, and `playAt` is spied so the cue is
     *      attributed by object identity instead of by a count the live
     *      roster is concurrently moving. Every species must reach the weight
     *      class the design assigns it, and the cue must actually play.
     *   2. SURFACE COVERAGE — the valley is swept on a 10 m × 6° polar grid
     *      (~2000 probes) and EVERY surface that sweep can produce is walked
     *      on for real: the player is placed there and `_footstep` is driven
     *      through its normal path. Each must play a bank cue (not fall
     *      through to the procedural stub), and a non-grass surface must not
     *      come out as `foot/grass` — precisely the regression where
     *      world-ground adds a material and the audio map silently defaults.
     *
     * The audit's bar is "≥3 distinct player footstep sets across the
     * valley"; this passes only if every surface the valley HAS is distinct
     * and audible, which is strictly more.
     */
    id: 'A76-footfalls', kind: 'action', lane: 'audio',
    title: 'Footfalls: 8 species → right weight class; every valley surface audible and distinct (≥3 sets)',
    settle: 400, timeout: 150000,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac) return { pass: null, detail: 'SKIP: no AudioContext' };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const species = ${JSON.stringify(SPECIES)};
      /** the design's species -> weight class table (src/audio/audio.js WEIGHT) */
      const WANT = ${JSON.stringify(WEIGHT)};
      const P = __CTX__.player;
      const home = { x: P.position.x, y: P.position.y, z: P.position.z };
      const t = __CTX__.terrain;

      /* -- 0. the emitter side must be alive ----------------------------- */
      let live = 0; const liveKinds = {};
      const onFall = (e) => {
        const m = e && e.machine;
        if (!m || m.__gateSynthetic) return;
        live++; if (m.kind) liveKinds[m.kind] = (liveKinds[m.kind] || 0) + 1;
      };
      __CTX__.events.on('machine-footfall', onFall);

      /* -- the spy: attribute cues by identity, not by a moving counter --- */
      const rec = [];
      const origAt = a.playAt.bind(a);
      const orig2D = a.play2D.bind(a);
      a.playAt = (id, pos, opts) => { const r = origAt(id, pos, opts); rec.push({ id, pos, r }); return r; };
      a.play2D = (id, opts) => { const r = orig2D(id, opts); rec.push({ id, pos: null, r }); return r; };

      let out;
      try {
        const t0 = performance.now();
        while (live < 4 && performance.now() - t0 < 30000) await sleep(150);
        const emitterLive = live >= 4;

        /* -- 1. routing: one species at a time, identity-attributed ------- */
        const routed = {}; const misrouted = [];
        for (let i = 0; i < species.length; i++) {
          const s = species[i];
          // a fresh machine object per species: the consumer throttles per
          // machine (90 ms), and reusing one would swallow seven of eight
          const pos = { x: P.position.x + 4, y: P.position.y, z: P.position.z - 4 };
          const mark = rec.length;
          __CTX__.events.emit('machine-footfall', {
            machine: { kind: s, alive: true, position: pos, __gateSynthetic: true },
            foot: 'FL', position: pos,
          });
          await sleep(110);
          const mine = rec.slice(mark).filter(e => e.pos === pos);
          const played = mine.filter(e => e.r && e.id.indexOf('mstep/') === 0).map(e => e.id);
          routed[s] = played;
          const want = 'mstep/' + WANT[s];
          if (played.indexOf(want) < 0) misrouted.push({ species: s, want, got: played });
        }
        const classes = {};
        for (const s of species) for (const id of routed[s]) classes[id] = (classes[id] || 0) + 1;
        const classCount = Object.keys(classes).length;

        /* -- 2. surface coverage: sweep the valley, then walk on it ------- */
        if (!t || typeof t.surfaceAt !== 'function') {
          out = { pass: false, detail: { reason: 'terrain.surfaceAt() is not published by world-ground' } };
        } else {
          const reps = {}; const census = {};
          for (let r = 0; r <= 320; r += 10) {
            for (let ang = 0; ang < 360; ang += 6) {
              const rad = ang * Math.PI / 180;
              const x = r * Math.cos(rad); const z = r * Math.sin(rad);
              let s;
              try { s = String(t.surfaceAt(x, z)); } catch (e) { s = 'THREW:' + e.message; }
              census[s] = (census[s] || 0) + 1;
              if (!reps[s]) reps[s] = [x, z];
            }
          }
          const surfaces = Object.keys(census).sort();
          const threw = surfaces.filter(s => s.indexOf('THREW:') === 0);

          // walk on every one of them, through the real _footstep path
          const walked = {}; const silent = []; const defaulted = [];
          const GRASSY = ['grass', 'meadow', 'moss'];
          for (const s of surfaces) {
            if (s.indexOf('THREW:') === 0) continue;
            const xz = reps[s];
            P.position.x = xz[0]; P.position.z = xz[1];
            const mark = rec.length;
            a._footstep(0.7, false, false);              // the real consumer path
            const mine = rec.slice(mark).filter(e => e.id.indexOf('foot/') === 0);
            const hit = mine.filter(e => e.r).map(e => e.id);
            walked[s] = { at: [Math.round(xz[0]), Math.round(xz[1])], played: hit };
            if (!hit.length) silent.push(s);
            else if (hit[0] === 'foot/grass' && GRASSY.indexOf(s) < 0) defaulted.push(s);
            await sleep(90);
          }
          const distinct = [...new Set(Object.keys(walked).reduce((acc, k) => acc.concat(walked[k].played), []))];

          const pass = emitterLive
            && misrouted.length === 0
            && classCount >= 3
            && threw.length === 0
            && silent.length === 0
            && defaulted.length === 0
            && distinct.length >= 3;
          out = { pass, detail: {
            emitter: { liveFootfalls: live, liveSpecies: liveKinds, ok: emitterLive },
            routing: { routed, misrouted, weightClasses: classCount },
            valley: census,
            walked, distinctFootstepSets: distinct,
            silentSurfaces: silent, surfacesFallingBackToGrass: defaulted, surfaceAtThrew: threw,
          } };
        }
      } finally {
        delete a.playAt; delete a.play2D;               // restore the prototype methods
        if (__CTX__.events.off) __CTX__.events.off('machine-footfall', onFall);
        P.position.x = home.x; P.position.y = home.y; P.position.z = home.z;
        if (P._snapToGround) P._snapToGround();
      }
      return out;
    })()`,
  },

  /* ===================================================================== */
  {
    /**
     * A77 — the adaptive score, driven the way the game drives it.
     *
     * ROUND-4 WAVE-3 REWRITE. The first cut fired one `machine-alerted`, slept
     * 900 ms and asserted `music.quantised === true`. Both halves were weak:
     * `quantised` is vacuously true over an empty transition list, and one
     * event proves nothing about the calm → suspicious → combat → resolve arc
     * the audit actually asks for. It never looked at a stinger at all.
     *
     * This walks the whole arc through the PUBLISHED event contract
     * (`machine-state`, which `machine-ai` emits and `_musicSelect` consumes)
     * rather than by calling `setMusicState`, so the selector's hold windows,
     * its stinger choices and the director's quantiser are all in the path.
     *
     * The three things it will not let regress:
     *   - EVERY transition lands on a bar line — `barError` is recomputed by
     *     the director from its own origin, not a flag it sets about itself;
     *   - the crossfades MOVE REAL GAINS: in combat the kit must be up and the
     *     exploration pluck gone, and in resolve the pad must be back and the
     *     kit away. A director scheduling immaculate ramps onto disconnected
     *     gain nodes passed the old gate and fails this one;
     *   - the combat and resolve stingers each fire exactly once per arc.
     *
     * The player is parked away from the live roster first: `_musicSelect`
     * polls machines within 120 m, and a Watcher that noticed the gate would
     * pin the score in combat and make the arc unobservable.
     */
    id: 'A77-music-states', kind: 'action', lane: 'audio',
    title: 'Score: calm→suspicious→combat→resolve, bar-quantised fades that move real stem gains, one stinger each',
    settle: 400, timeout: 180000,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac) return { pass: null, detail: 'SKIP: no AudioContext' };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const m = a.music;
      if (!m || !m.available) {
        return { pass: false, detail: {
          reason: 'the composed stem score is not available — GameAudio fell back to the procedural drone',
          missingStems: m ? m.missing : 'no MusicDirector at all',
        } };
      }
      const P = __CTX__.player;
      const home = { x: P.position.x, y: P.position.y, z: P.position.z };

      let out;
      try {
        /* -- park away from every living machine (the selector polls 120 m) */
        const live = (__CTX__.machines && __CTX__.machines.list || []).filter(x => x.alive);
        let best = { x: home.x, z: home.z, d: -1 };
        for (let r = 0; r <= 300; r += 20) {
          for (let ang = 0; ang < 360; ang += 15) {
            const rad = ang * Math.PI / 180;
            const x = r * Math.cos(rad); const z = r * Math.sin(rad);
            let d = 1e9;
            for (const mm of live) {
              const dx = mm.position.x - x; const dz = mm.position.z - z;
              const q = Math.sqrt(dx * dx + dz * dz);
              if (q < d) d = q;
            }
            if (d > best.d) best = { x, z, d };
          }
        }
        P.position.x = best.x; P.position.z = best.z;
        if (P._snapToGround) P._snapToGround();

        /* -- clean start: calm, every hold cleared (published API) -------- */
        a.setMusicState('calm', { force: true });
        const tc = performance.now();
        while (m.state !== 'calm' && performance.now() - tc < 10000) await sleep(120);

        const baseT = m.transitions.length;
        const baseSt = { combat: m.stingers.combat, resolve: m.stingers.resolve, alert: m.stingers.alert };
        const path = [m.state];

        /**
         * Drive one machine FSM state through the real published event and
         * wait for the director to LAND on the matching score state. The
         * event is re-stamped while waiting because the selector's hold
         * window (4 s suspicion / 5 s combat) is shorter than the time a
         * bar-quantised crossfade needs to complete, and a lapsed hold would
         * drop the score back mid-arc.
         */
        const drive = async (machineState, scoreState, budget) => {
          const synth = { kind: 'watcher', alive: true, __gateSynthetic: true, eyeHeight: 1.2,
            position: { x: P.position.x + 600, y: 0, z: P.position.z + 600 } };
          const t0 = performance.now();
          let last = -1e9;
          while (performance.now() - t0 < budget) {
            const now = performance.now();
            if (now - last > 700) {
              last = now;
              __CTX__.events.emit('machine-state', {
                machine: synth, state: machineState, to: machineState, prev: 'idle', from: 'idle',
              });
            }
            if (m.state === scoreState) return true;
            await sleep(120);
          }
          return false;
        };

        const gotSuspicious = await drive('suspicious', 'suspicious', 20000);
        path.push(m.state);
        const suspiciousMix = m.stems;

        const gotCombat = await drive('attack', 'combat', 20000);
        path.push(m.state);
        // let the 0.25-bar escalation fade finish before reading the mix
        await sleep(900);
        const combatMix = m.stems;
        const combatOk = combatMix.drums.gain > 0.5 && combatMix.pluck.gain < 0.08;

        /* -- stop feeding it: the 5 s combat hold lapses and the selector
              must route through 'resolve' (its own phrase), not snap to calm */
        const tr = performance.now();
        while (m.state !== 'resolve' && performance.now() - tr < 30000) await sleep(120);
        const gotResolve = m.state === 'resolve';
        path.push(m.state);
        await sleep(1500);                              // combat>resolve is 0.5 bar
        const resolveMix = m.stems;
        const resolveOk = resolveMix.pad.gain > 0.25 && resolveMix.drums.gain < 0.08;

        /* -- every transition on the bar grid ---------------------------- */
        const made = m.transitions.slice(baseT);
        const offGrid = made.filter(x => x.barError > 1e-3);
        const noFade = made.filter(x => !(x.xfade > 0));
        const seq = made.map(x => x.from + '>' + x.to);

        const dSt = {
          combat: m.stingers.combat - baseSt.combat,
          resolve: m.stingers.resolve - baseSt.resolve,
          alert: m.stingers.alert - baseSt.alert,
        };

        /* -- the stems are COMPOSED to the declared tempo, not noise ------
         * A bar clock is worthless if what it schedules has no metre. The
         * onset detector (offline, on the decoded buffer) is run against the
         * 16th-note grid of the declared BPM: a rendered pattern lands on it
         * to within a few milliseconds, a field recording or a noise bed does
         * not. Only the percussive stems are graded — a pad has no onsets to
         * measure and its flux detector output is meaningless, so asserting
         * on it would be theatre.
         *
         * Measured on this bank: drums 100 % on the 16th grid at 4.8 ms mean
         * error but only 52 % on the quarter, which is the signature of an
         * actual pattern with 8th/16th subdivisions rather than a click.
         */
        const QUARTER = 60 / 96;                     // BPM is declared by the director
        const RHYTHMIC = ['music/drums-combat', 'music/perc-tense', 'music/pluck-calm'];
        const grids = {};
        for (const s of RHYTHMIC) grids[s] = await a.probeBeats(s, QUARTER / 4);
        const offGridStems = RHYTHMIC.filter(s => !grids[s]
          || grids[s].onsets < 4 || grids[s].onGrid < 0.95 || grids[s].meanError > 0.015);
        const quarterGrid = await a.probeBeats('music/drums-combat', QUARTER);
        // all-on-the-quarter would be a metronome, not a drum part
        const syncopated = !!quarterGrid && quarterGrid.onGrid < 0.95;

        /* -- and they are all the same length, or the phase lock drifts --- */
        const stemKeys = Object.keys(m.stems);
        const durations = {};
        for (const k of stemKeys) {
          const f = a.bank.first(m.stems[k].set);
          durations[k] = f ? +f.buffer.duration.toFixed(3) : null;
        }
        const dlist = stemKeys.map(k => durations[k]);
        const sameLength = dlist.every(d => d !== null && Math.abs(d - dlist[0]) < 0.02);
        // every stem must cover a whole 4-bar phrase, and the director must be
        // looping at the MUSICAL length (10.0 s), not at the encoder's tail
        const phrase = 4 * 4 * (QUARTER);            // 10.0 s
        const coversPhrase = dlist.every(d => d !== null && d >= phrase);
        const loopsOnPhrase = Math.abs(m.loopEnd - phrase) < 1e-3;

        const pass = gotSuspicious && gotCombat && gotResolve
          && seq.indexOf('calm>suspicious') >= 0
          && seq.indexOf('suspicious>combat') >= 0
          && seq.indexOf('combat>resolve') >= 0
          && offGrid.length === 0 && noFade.length === 0
          && m.quantised === true
          && dSt.combat === 1 && dSt.resolve === 1
          && combatOk && resolveOk
          && stemKeys.length === 7
          && offGridStems.length === 0 && syncopated
          && sameLength && coversPhrase && loopsOnPhrase;

        out = { pass, detail: {
          parkedAt: [Math.round(best.x), Math.round(best.z)], nearestMachine: +best.d.toFixed(1),
          path, sequence: seq, transitions: made,
          offGrid, missingCrossfade: noFade, quantised: m.quantised,
          stingers: dSt,
          mixes: { suspicious: suspiciousMix, combat: combatMix, resolve: resolveMix },
          mixOk: { combat: combatOk, resolve: resolveOk },
          stems: stemKeys,
          composed: { sixteenthGrid: grids, offGridStems, quarterGrid, syncopated },
          form: { durations, sameLength, coversPhrase, loopEnd: m.loopEnd, loopsOnPhrase },
          reached: { suspicious: gotSuspicious, combat: gotCombat, resolve: gotResolve },
        } };
      } finally {
        P.position.x = home.x; P.position.y = home.y; P.position.z = home.z;
        if (P._snapToGround) P._snapToGround();
      }
      return out;
    })()`,
  },

  /* ===================================================================== */
  {
    /**
     * A73b — Aloy has a voice, and it is not a VOICE (audio-03, decision D2).
     *
     * The audit's blocker was "Aloy is mute": no effort, no hurt, no breath,
     * so sprinting, falling four metres and being mauled by a Sawtooth all
     * sounded identical from the player character. D2 answered the follow-up
     * question — no VO, ever — so this gate has to prove BOTH halves: that
     * the effort layer fires on the verbs that cost something, and that
     * nothing in the bank is a line of dialogue.
     *
     * The no-VO half is the one worth having. It is the only automatic check
     * that a later round cannot quietly drop a licensed voice library into
     * `public/audio/` — the licence allowlist in A73 would happily pass a CC0
     * voice pack, and nothing else would notice.
     */
    id: 'A73b-aloy-effort', kind: 'action', lane: 'audio',
    title: 'Aloy: effort/hurt/land/breath layers fire on the real verbs — and the bank holds no VO (D2)',
    settle: 300, timeout: 90000,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac) return { pass: null, detail: 'SKIP: no AudioContext' };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));

      /* -- D2: the aloy bank is a throat and a diaphragm, not a script ---- */
      const ALLOWED = ['aloy/effort', 'aloy/effort-hard', 'aloy/hurt',
        'aloy/breath-in', 'aloy/breath-out', 'aloy/breath-hard'];
      const aloySets = a.bank.setIds().filter(s => s.indexOf('aloy/') === 0);
      const missing = ALLOWED.filter(s => !a.bank.has(s));
      const unexpected = aloySets.filter(s => ALLOWED.indexOf(s) < 0);
      // any set anywhere in the bank that smells like recorded speech
      const speechy = a.bank.setIds().filter(s => /\\b(vo|voiceover|dialog|dialogue|speech|line|bark|say|talk)\\b/i.test(s));

      const rec = [];
      const orig2D = a.play2D.bind(a);
      a.play2D = (id, opts) => { const r = orig2D(id, opts); rec.push({ id, r }); return r; };
      let out;
      try {
        const fire = async (name, payload) => {
          const mark = rec.length;
          __CTX__.events.emit(name, payload);
          await sleep(90);
          return rec.slice(mark).filter(e => e.r).map(e => e.id);
        };
        const heard = {};
        heard['player-dodge'] = await fire('player-dodge', {});
        heard['player-jump'] = await fire('player-jump', {});
        heard['player-land-hard'] = await fire('player-land', { fallHeight: 4.2, impact: 0.9 });
        heard['player-mantle'] = await fire('player-mantle', {});
        heard['player-hurt'] = await fire('player-hurt', { amount: 20 });
        heard['player-crouch'] = await fire('player-crouch', { crouching: true });

        /* -- the breath layer is a function of exertion, not of an event -- */
        const breath = {};
        const breathe = (exertion) => {
          a._exertion = exertion; a._breathT = 0;
          const mark = rec.length;
          a._breathLayer(0.05, true);                  // the real per-frame path
          return rec.slice(mark).filter(e => e.r).map(e => e.id);
        };
        const savedEx = a._exertion;
        breath.hard = breathe(0.9);
        breath.moderate = breathe(0.45);
        breath.rested = breathe(0.02);
        a._exertion = savedEx;

        const has = (list, id) => list.indexOf(id) >= 0;
        const checks = {
          dodgeEffort: has(heard['player-dodge'], 'aloy/effort'),
          jumpEffort: has(heard['player-jump'], 'aloy/effort'),
          // a real fall grunts AND lands boots-first on the surface underfoot
          hardLandEffort: has(heard['player-land-hard'], 'aloy/effort-hard'),
          hardLandBoots: heard['player-land-hard'].some(id => id.indexOf('foot/') === 0),
          hardLandGear: has(heard['player-land-hard'], 'gear/heavy'),
          mantleEffort: has(heard['player-mantle'], 'aloy/effort-hard'),
          hurt: has(heard['player-hurt'], 'aloy/hurt'),
          crouchFoley: has(heard['player-crouch'], 'gear/light'),
          breathHard: has(breath.hard, 'aloy/breath-hard'),
          breathModerate: has(breath.moderate, 'aloy/breath-out'),
          breathRestedSilent: breath.rested.length === 0,
          noVO: speechy.length === 0 && unexpected.length === 0,
          bankComplete: missing.length === 0,
        };
        const failed = Object.keys(checks).filter(k => !checks[k]);
        out = { pass: failed.length === 0, detail: {
          failed, checks, heard, breath,
          aloySets, unexpectedAloySets: unexpected, speechLikeSets: speechy, missing,
        } };
      } finally {
        delete a.play2D;
      }
      return out;
    })()`,
  },

  /* ===================================================================== */
  {
    /**
     * A75b — death is a sequence, not an explosion (audio-06).
     *
     * Round 3 played one `_explosion` on `machine-killed` and that was the
     * entire death of a Thunderjaw. The ladder this pins is:
     *
     *   machine-killed        -> blast + reactor power-down (pitched by mass)
     *   machine-death-impact  -> the mass actually reaching the ground
     *   ~1.4 s later          -> a loot beacon loop you can navigate to
     *   looted / disposed     -> the beacon stops, because a beacon that
     *                            outlives its loot is a lie
     *
     * Driven on a synthetic corpse: killing a real machine would pull the
     * wreck lifecycle, the stimulus cascade, progression XP and the HUD into
     * an audio gate. `_wreck` is preset and the events are the REAL published
     * ones, so the real handlers are what run. The corpse is placed at the
     * player so the beacon's 55 m audibility test is meaningful.
     */
    id: 'A75b-death-ladder', kind: 'action', lane: 'audio',
    title: 'Machine death: blast → power-down → collapse impact → loot beacon that stops when looted',
    settle: 300, timeout: 90000,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac) return { pass: null, detail: 'SKIP: no AudioContext' };
      if (!a.zones) return { pass: false, detail: 'no ZoneEmitters — the beacon has nowhere to live' };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const P = __CTX__.player;
      const rec = [];
      const origAt = a.playAt.bind(a);
      a.playAt = (id, pos, opts) => { const r = origAt(id, pos, opts); rec.push({ id, pos, r }); return r; };

      let out; let corpse = null;
      try {
        const pos = { x: P.position.x + 3, y: P.position.y, z: P.position.z + 3 };
        corpse = {
          kind: 'thunderjaw', displayName: 'thunderjaw', alive: false, height: 4.5,
          eyeHeight: 3.2, _wreck: true, position: pos, __gateSynthetic: true,
        };

        const mark0 = rec.length;
        __CTX__.events.emit('machine-killed', { machine: corpse });
        await sleep(160);
        const onKill = rec.slice(mark0).filter(e => e.pos === pos && e.r).map(e => e.id);

        const mark1 = rec.length;
        __CTX__.events.emit('machine-death-impact', { machine: corpse, position: pos, strength: 0.95 });
        await sleep(160);
        const onImpact = rec.slice(mark1).filter(e => e.pos === pos && e.r).map(e => e.id);

        /* -- the beacon arms on the live _beaconScan, not on our say-so --- */
        const beaconId = 'loot:' + a._idOf(corpse);
        const t0 = performance.now();
        let armed2 = false;
        while (performance.now() - t0 < 12000) {
          if (a.zones.ids().indexOf(beaconId) >= 0) { armed2 = true; break; }
          await sleep(120);
        }
        // it must NOT arrive before the collapse has had time to finish
        const armedAfter = performance.now() - t0;

        /* -- and it must stop when the wreck is answered ------------------ */
        __CTX__.events.emit('loot-rummage', { machine: corpse });
        const t1 = performance.now();
        let silenced = false;
        while (performance.now() - t1 < 6000) {
          if (a.zones.ids().indexOf(beaconId) < 0) { silenced = true; break; }
          await sleep(120);
        }

        const checks = {
          powerdown: onKill.indexOf('machine/powerdown') >= 0,
          collapse: onImpact.indexOf('machine/collapse') >= 0,
          beaconArmed: armed2,
          beaconWaitedForCollapse: armedAfter >= 1200,
          beaconSilencedByLoot: silenced,
          beaconForgotten: !a._wreckBeacons.has(corpse),
        };
        const failed = Object.keys(checks).filter(k => !checks[k]);
        out = { pass: failed.length === 0, detail: {
          failed, checks, onKill, onImpact, beaconId,
          armedAfterMs: Math.round(armedAfter),
        } };
      } finally {
        delete a.playAt;
        if (corpse) { a._wreckBeacons.delete(corpse); a.zones.retire('loot:' + a._idOf(corpse), 0.05); }
      }
      return out;
    })()`,
  },

  /* ===================================================================== */
  {
    /**
     * A77b — the hit ladder and the status loops (audio-10).
     *
     * Every arrow used to land on the same clank at the same volume, and a
     * burning machine sounded exactly like a machine that was not on fire.
     *
     * Two halves, both measured rather than asserted:
     *   LADDER — the four rungs must be four different SOUNDS (cosine distance
     *     between 12-band spectra, the same measure A75 uses on the species
     *     voices), and the rung the consumer picks must track the damage the
     *     HUD prints, so what you hear and what you read agree.
     *   STATUS — a real machine is set alight and the 4 Hz status sweep must
     *     raise a positional `status/burn` loop for it, then retire that exact
     *     loop when the timer runs out. The stop half is the one that rots:
     *     the loop is spawned by the same code every frame, so only an
     *     explicit retirement test can catch a burn that never goes out.
     */
    id: 'A77b-hit-ladder', kind: 'action', lane: 'audio',
    title: 'Hit ladder: 4 spectrally distinct rungs chosen by damage; elemental status loops start AND stop',
    settle: 300, timeout: 90000,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac) return { pass: null, detail: 'SKIP: no AudioContext' };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const RUNGS = ['hit/plink', 'hit/thunk', 'hit/crunch', 'hit/crit'];

      /* -- 1. four rungs, four sounds ------------------------------------ */
      const specs = {};
      for (const r of RUNGS) specs[r] = await a.probeSet(r);
      const inaudible = RUNGS.filter(r => !specs[r] || specs[r].peak < 0.05);
      let minDist = 1; let closest = null;
      for (let i = 0; i < RUNGS.length; i++) {
        for (let j = i + 1; j < RUNGS.length; j++) {
          const A = specs[RUNGS[i]]; const B = specs[RUNGS[j]];
          if (!A || !B) continue;
          const d = __CTX__.audio.constructor.bandDistance(A.bands, B.bands);
          if (d < minDist) { minDist = d; closest = RUNGS[i] + '/' + RUNGS[j]; }
        }
      }
      // a crit must also READ as bigger than a plink, not merely different
      const louder = specs['hit/crit'] && specs['hit/plink']
        && specs['hit/crit'].rms > specs['hit/plink'].rms;

      const P = __CTX__.player;
      const home = { x: P.position.x, y: P.position.y, z: P.position.z };
      const rec = [];
      const origAt = a.playAt.bind(a);
      a.playAt = (id, pos, opts) => { const r = origAt(id, pos, opts); rec.push({ id, pos, r }); return r; };

      let out; let victim = null; const saved = {};
      try {
        /* -- 2. the consumer picks the rung the damage number implies ----- */
        const shoot = async (damage, weak) => {
          const point = { x: P.position.x + 2, y: P.position.y + 1, z: P.position.z - 2 };
          const mark = rec.length;
          __CTX__.events.emit('arrow-hit', {
            point, machine: { kind: 'sawtooth', alive: true, position: point, __gateSynthetic: true },
            weak, damage, type: 'hunter',
          });
          await sleep(110);
          return rec.slice(mark).filter(e => e.pos === point && e.r).map(e => e.id);
        };
        const picked = {
          plink: await shoot(3, false),
          thunk: await shoot(12, false),
          crunch: await shoot(40, false),
          crit: await shoot(40, true),
        };

        /* -- 3. a status loop that starts AND stops ----------------------- */
        const live = (__CTX__.machines && __CTX__.machines.list || []).filter(m => m.alive);
        let nearest = null; let nd = 1e9;
        for (const m of live) {
          const d = Math.hypot(m.position.x - P.position.x, m.position.z - P.position.z);
          if (d < nd) { nd = d; nearest = m; }
        }
        let burnOn = null; let burnOff = null; let burnId = null;
        if (nearest) {
          victim = nearest;
          P.position.x = nearest.position.x + 6; P.position.z = nearest.position.z + 6;
          saved.burnT = nearest.burnT;
          burnId = 'burn:' + a._idOf(nearest);
          nearest.burnT = 4;
          a._statusScan(true);                          // the real 4 Hz sweep
          burnOn = a.zones.ids().indexOf(burnId) >= 0;
          nearest.burnT = 0;
          a._statusScan(true);
          burnOff = a.zones.ids().indexOf(burnId) < 0;
          nearest.burnT = saved.burnT;
        }

        const checks = {
          rungsAudible: inaudible.length === 0,
          rungsDistinct: minDist >= 0.05,
          critLoudestRung: !!louder,
          plinkOnLightHit: picked.plink.indexOf('hit/plink') >= 0,
          thunkOnMidHit: picked.thunk.indexOf('hit/thunk') >= 0,
          crunchOnHeavyHit: picked.crunch.indexOf('hit/crunch') >= 0,
          critOnWeakPoint: picked.crit.indexOf('hit/crit') >= 0,
          statusLoopStarts: burnOn === true,
          statusLoopStops: burnOff === true,
        };
        const failed = Object.keys(checks).filter(k => !checks[k]);
        out = { pass: failed.length === 0, detail: {
          failed, checks, picked,
          minSpectralDistance: +minDist.toFixed(4), closestPair: closest,
          rms: RUNGS.map(r => [r, specs[r] && specs[r].rms]),
          burn: { id: burnId, started: burnOn, stopped: burnOff, nearestMachine: +nd.toFixed(1) },
        } };
      } finally {
        delete a.playAt;
        if (victim && saved.burnT !== undefined) victim.burnT = saved.burnT;
        P.position.x = home.x; P.position.y = home.y; P.position.z = home.z;
        if (P._snapToGround) P._snapToGround();
      }
      return out;
    })()`,
  },

  /* ===================================================================== */
  {
    /**
     * A73c — three bows, three voices, and the whole shot ladder (audio-13).
     *
     * Round 3 played ONE synthesized twang for all three bows and nothing at
     * all for the nock, the re-nock or the draw — the 0.42 s nock delay that
     * `combat` added in Wave 2 was completely silent, so the pause before a
     * second shot read as input lag rather than as Aloy reaching for an arrow.
     *
     * The nock and draw cues are polled off `combat.nockLanded` /
     * `combat.drawStrength` (see `_nockPoll`) because `combat` publishes no
     * `arrow-nocked` event. That is the half most likely to rot — a rename of
     * either field silently restores the Round-3 silence with no error — so
     * this gate drives a REAL aim → draw → loose → re-nock cycle through the
     * input layer, per weapon, and requires the whole ladder to sound:
     *
     *   nock (aim raise) → draw → release → flyby → nock again (re-nock)
     *
     * and requires each bow to use its OWN set: a build that routed all three
     * to `bow/hunter` would pass a "did a bow sound play" check and fail this.
     */
    id: 'A73c-bow-sets', kind: 'action', lane: 'audio',
    title: 'Per-bow shot ladder: nock → draw → release → flyby → re-nock, on the right set for each bow',
    setup: `__CTX__.input.enabled = true;`,
    settle: 400, timeout: 150000,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac) return { pass: null, detail: 'SKIP: no AudioContext' };
      const C = __CTX__;
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const BOWS = [[1, 'hunter', 'hunter-bow'], [2, 'sharpshot', 'sharpshot-bow'], [3, 'war', 'war-bow']];

      const out = {}; const problems = [];
      try {
        for (const row of BOWS) {
          const slot = row[0]; const set = row[1]; const weaponId = row[2];
          C.combat.setWeapon(slot, { silent: true });
          // a bow with an empty quiver never starts a draw
          const ammoId = C.combat.activeWeapon && C.combat.activeWeapon.ammo;
          for (const k in C.combat.ammo) if (C.combat.ammo[k] < 20) C.combat.ammo[k] = 40;
          const before = a.cueCounts();

          C.player.aiming = true;
          C.input.mouse.buttons |= 4;                 // RMB: raise the bow, nock starts
          await sleep(950);                           // nockTime is 0.42 s
          C.input.mouse.buttons |= 1;                 // LMB: draw
          await sleep(950);
          C.input.mouse.buttons &= ~1;                // loose
          await sleep(1500);                          // the re-nock lands
          C.input.mouse.buttons &= ~4;
          C.player.aiming = false;
          await sleep(300);

          const after = a.cueCounts();
          const d = (id) => (after[id] || 0) - (before[id] || 0);
          const mine = {};
          for (const k of ['nock', 'draw', 'release', 'flyby', 'empty']) mine[k] = d('bow/' + set + '/' + k);
          // nothing may have leaked onto another bow's set
          const leaked = [];
          for (const other of BOWS) {
            if (other[1] === set) continue;
            for (const k of ['nock', 'draw', 'release', 'flyby']) {
              const n = d('bow/' + other[1] + '/' + k);
              if (n > 0) leaked.push('bow/' + other[1] + '/' + k + ' x' + n);
            }
          }
          out[set] = { weapon: C.combat.activeWeapon && C.combat.activeWeapon.id, ammoId, cues: mine, leaked };
          if (weaponId !== (C.combat.activeWeapon && C.combat.activeWeapon.id)) problems.push(set + ': wrong weapon selected');
          if (mine.nock < 2) problems.push(set + ': nock fired ' + mine.nock + 'x (want the raise AND the re-nock)');
          if (mine.draw < 1) problems.push(set + ': no draw cue');
          if (mine.release < 1) problems.push(set + ': no release cue');
          if (mine.flyby < 1) problems.push(set + ': no arrow flyby');
          if (leaked.length) problems.push(set + ': leaked onto ' + leaked.join(', '));
        }
      } finally {
        C.input.mouse.buttons &= ~5;
        C.player.aiming = false;
      }
      return { pass: problems.length === 0, detail: { problems, perBow: out } };
    })()`,
  },

  /* ===================================================================== */
  {
    /**
     * A75c — the stealth layer has a voice (audio-08).
     *
     * "Suspicion and scan are silent" was a Major: a Watcher that had heard
     * something sounded exactly like a Watcher that had not, so the entire
     * stealth read was visual. Worse, the first fix reached for the attack
     * windup at +5 % pitch — which tells the player "it is committing" at the
     * moment it is in fact still guessing, and that is a lie they will act on.
     *
     * Four claims, all measured through the published `machine-ai` contract:
     *   RISE     a machine entering suspicion/search warbles, and the cue is
     *            `machine/warble` — NOT a species attack voice;
     *   FALL     losing contact plays the falling `machine/unwarble`, which is
     *            how a player learns the crouch-walk worked;
     *   COMMIT   reaching alert/alarm is a different sound again (the alarm),
     *            so the three rungs of the ladder are three cues;
     *   THROTTLE a search FSM re-enters its state several times a second; the
     *            warble is throttled per machine (1.6 s) so it reads as one
     *            machine thinking rather than a stuttering chorus.
     */
    id: 'A75c-suspicion-scan', kind: 'action', lane: 'audio',
    title: 'Stealth voice: rise-warble ≠ fall-warble ≠ alarm ≠ attack voice, scan pings, both throttled per machine',
    settle: 300, timeout: 90000,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac) return { pass: null, detail: 'SKIP: no AudioContext' };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const P = __CTX__.player;
      const rec = [];
      const origAt = a.playAt.bind(a);
      a.playAt = (id, pos, opts) => { const r = origAt(id, pos, opts); rec.push({ id, pos, r }); return r; };

      let out;
      /** hoisted: the finally block needs these to hand the loop chains back */
      const synths = [];
      try {
        /** a fresh machine per case: every throttle in this path is per-machine */
        const mk = () => {
          const pos = { x: P.position.x + 5, y: P.position.y, z: P.position.z - 5 };
          const m = { kind: 'watcher', alive: true, eyeHeight: 1.2, position: pos, __gateSynthetic: true };
          synths.push(m);
          return m;
        };
        const fire = async (payload, pos, ms) => {
          const mark = rec.length;
          __CTX__.events.emit(payload.ev, payload.data);
          await sleep(ms || 120);
          return rec.slice(mark).filter(e => e.pos === pos && e.r).map(e => e.id);
        };

        // RISE
        const m1 = mk();
        const rise = await fire({ ev: 'machine-state',
          data: { machine: m1, state: 'suspicious', to: 'suspicious', prev: 'idle', from: 'idle' } }, m1.position);

        // FALL — contact lost: idle again, from suspicious
        const m2 = mk();
        const fall = await fire({ ev: 'machine-state',
          data: { machine: m2, state: 'idle', to: 'idle', prev: 'suspicious', from: 'suspicious' } }, m2.position);

        // COMMIT
        const m3 = mk();
        const commit = await fire({ ev: 'machine-state',
          data: { machine: m3, state: 'alert', to: 'alert', prev: 'suspicious', from: 'suspicious' } }, m3.position);

        // SCAN
        const m4 = mk();
        const scan = await fire({ ev: 'machine-scan',
          data: { machine: m4, position: m4.position, hit: false } }, m4.position);

        // THROTTLE — a search FSM chattering at 10 Hz is still ONE machine
        const m5 = mk();
        const mark = rec.length;
        for (let i = 0; i < 10; i++) {
          __CTX__.events.emit('machine-state', {
            machine: m5, state: 'search', to: 'search', prev: 'suspicious', from: 'suspicious',
          });
          __CTX__.events.emit('machine-scan', { machine: m5, position: m5.position, hit: false });
          await sleep(60);
        }
        const spam = rec.slice(mark).filter(e => e.pos === m5.position && e.r).map(e => e.id);
        const warbleSpam = spam.filter(id => id.indexOf('machine/warble') === 0).length;
        const pingSpam = spam.filter(id => id === 'machine/scan-ping').length;

        const has = (l, id) => l.indexOf(id) >= 0;
        const anyVoice = (l) => l.some(id => id.indexOf('voice/') === 0);
        const checks = {
          riseWarbles: has(rise, 'machine/warble'),
          riseIsNotAnAttackVoice: !anyVoice(rise),
          fallUnwarbles: has(fall, 'machine/unwarble'),
          fallIsNotTheRiseCue: !has(fall, 'machine/warble'),
          commitAlarms: has(commit, 'machine/alarm'),
          commitIsNotAWarble: !has(commit, 'machine/warble') && !has(commit, 'machine/unwarble'),
          scanPings: has(scan, 'machine/scan-ping'),
          warbleThrottled: warbleSpam <= 1,
          pingThrottled: pingSpam <= 1,
        };
        const failed = Object.keys(checks).filter(k => !checks[k]);
        out = { pass: failed.length === 0, detail: {
          failed, checks,
          heard: { rise, fall, commit, scan },
          under10HzSpam: { warbles: warbleSpam, pings: pingSpam, all: spam },
        } };
      } finally {
        delete a.playAt;
        // the machine-state handler syncs a servo bed for anything in earshot;
        // hand those loop chains back rather than leaving five phantom watchers
        // humming for the rest of the page
        for (const m of synths) {
          const e = a._machineLoops.get(m);
          if (e) a._retireLoop(m, e, 0.05);
        }
      }
      return out;
    })()`,
  },
];
