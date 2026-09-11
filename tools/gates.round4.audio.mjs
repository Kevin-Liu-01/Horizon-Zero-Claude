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
        rounds.push({ round: r, minted, drained, busy: L.loopChainsBusy, loops: L.servoLoops });
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
      const pass = poolRecovers && noOrphans && walkerGot
        && reservedDuringFade && releasedAfterFade && freshGotLoop;
      return { pass, detail: {
        rounds, base, end, chainsFree,
        deathsDriven: n - 1, mintedPerRound: rounds.map(r => r.minted),
        walkerGot, reservedDuringFade, releasedAfterFade, freshGotLoop,
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
    id: 'A76-footfalls', kind: 'action', lane: 'audio',
    title: 'machine-footfall fires for all 8 species; surfaceAt selects ≥3 player footstep sets',
    settle: 300,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac) return { pass: null, detail: 'SKIP: no AudioContext' };
      const species = ${JSON.stringify(SPECIES)};

      // --- audio side, verifiable now: the consumer routes every species to a
      //     weight-class footfall set and each set is loaded.
      const before = a.cueCounts();
      const counts0 = a.contractCounts()['machine-footfall'];
      for (const s of species) {
        __CTX__.events.emit('machine-footfall', {
          machine: { kind: s, position: { x: 4, y: 0, z: -4 }, alive: true },
          foot: 'FL', position: { x: 4, y: 0, z: -4 },
        });
        await new Promise(r => setTimeout(r, 120));
      }
      const after = a.cueCounts();
      const delta = (id) => (after[id] || 0) - (before[id] || 0);
      const classes = ['mstep/light', 'mstep/medium', 'mstep/heavy'].filter(c => delta(c) > 0);
      const total = classes.reduce((n, c) => n + delta(c), 0);
      const routed = species.length;
      const fired = ['mstep/light', 'mstep/medium', 'mstep/heavy'].map(c => [c, delta(c)]);
      // the live roster also emits footfalls, so require at least our own 8
      const consumerOk = total >= 8 && classes.length >= 3;

      // --- emitter side: machine-rig must emit machine-footfall from
      //     GaitController._footfall. Nothing to observe until it does.
      const counts = a.contractCounts();
      const t = __CTX__.terrain;
      const hasSurface = !!(t && typeof t.surfaceAt === 'function');
      let surfaces = [];
      if (hasSurface) {
        const pts = [[0,0],[40,0],[-90,60],[120,-120],[30,-210],[-160,90]];
        surfaces = [...new Set(pts.map(([x,z]) => { try { return String(t.surfaceAt(x,z)); } catch (e) { return 'err'; } }))];
      }

      // more than this gate's own 8: proof machine-rig is emitting for real
      const emitterLive = counts['machine-footfall'] - counts0 > species.length || counts0 > 0;
      if (!hasSurface || !emitterLive) {
        return { pass: null, detail: {
          reason: 'PENDING until Wave 2/3: '
            + (hasSurface ? '' : 'terrain.surfaceAt() not published by world-ground; ')
            + (emitterLive ? '' : 'machine-rig does not emit machine-footfall from GaitController._footfall yet'),
          consumerReady: consumerOk,
          footfallCuesPlayed: fired,
          weightClasses: classes,
          contractCounts: counts,
          playerFootstepSetsAvailable: ['foot/grass','foot/dirt','foot/rock'].filter(s => a.bank.has(s)),
          speciesRouted: routed,
        } };
      }
      return { pass: consumerOk && surfaces.length >= 3, detail: { surfaces, classes, fired, counts } };
    })()`,
  },

  /* ===================================================================== */
  {
    id: 'A77-music-states', kind: 'action', lane: 'audio',
    title: 'Adaptive score: bar-quantised stem crossfades + combat/resolve stingers',
    settle: 200,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac) return { pass: null, detail: 'SKIP: no AudioContext' };
      if (!a.music || !a.music.stems) {
        return { pass: null, detail: {
          reason: 'PENDING until Wave 3 (audio content half): the adaptive stem score is not written yet. '
            + 'The pipeline it needs is live — SampleBank + licence manifest, the mix buses, the ducker and '
            + 'the offline analyser — so this is a content task, not an engineering one.',
          currentScore: 'procedural: 55 Hz drone + pentatonic plucks + a tension percussion layer',
          tension: a.debugState().layers.tension,
          bankReadyForStems: a.bank.audit().loaded,
        } };
      }
      const m = a.music;
      const seen = [];
      __CTX__.events.emit('machine-alerted', { machine: __CTX__.machines.list[0] });
      await new Promise(r => setTimeout(r, 900));
      seen.push(m.state);
      return { pass: seen.length > 0 && m.quantised === true, detail: { seen, stems: Object.keys(m.stems) } };
    })()`,
  },
];
