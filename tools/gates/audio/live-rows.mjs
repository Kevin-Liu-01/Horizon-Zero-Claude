/**
 * BUILD M1.6k live rows (audio lane), run in the page beside the kept rows. Run them at a commit from a clean tree with
 * tools/gates/audio/run-live.mjs, which records the commit and the clean flag inside the report and names the run
 * directory by the commit measured (fix round 1, the judge's fix 8):
 *
 *   tools/perf/clean-measure.sh <commit> <port> node tools/gates/audio/run-live.mjs --port <port> [--only <ids>]
 *
 *   A-audio-slice-live   the slice's bank decodes in Chrome with no failure (every set, every loop the length the
 *                        builder wrote); the director runs with its beds and the six buses' trims; the Pans theme's four
 *                        stems are up; a glass tick on ui-nav; a quick-make plays make/quick; and staged lamp-state
 *                        changes on a Plumb, the Gauge and Pegs (Brea stood 12 m from each in turn), 20 or more confirmed
 *                        on the lamp itself and 4 or more on each kind, each answered by its chirp (fix 3). The Gauge is
 *                        neutral and docile (BIBLE §7.4: no wary or hostile in Milestone 1), so its lamp's changes are
 *                        the ones it can make: dark and back to calm.
 *   A-audio-gust-live    the live director in the cane (fix 4): Brea stood inside reed beds of the real mask, hopping to
 *                        the bed whose next gust is nearest, and every frame logged: the bed's wind (its gust clock at the
 *                        reeds' time), the director's cane.ahead and its gust and lull bed volumes; per gust the lead of
 *                        the heard rise (+6 dB over the lull, the bed files' levels through the loops' smoothing) over
 *                        the wind's 4 m/s crossing. 5 or more gusts, every lead 0.8 s or more.
 *   A-audio-walk-graph   the slice walk through the game's own audio on an OfflineAudioContext (fixes 1 and 6;
 *                        tools/gates/audio/walk-graph.mjs): integrated loudness -18 LUFS +- 2 and true peak <= -1 dBTP of
 *                        the master after the real DynamicsCompressor, its gain reduction read every step, and the
 *                        Round-4 synthesized voices that still play, by name.
 *   A-audio-hour-live    Milestone 2: the first hour's bank decodes whole in Chrome (every new set, its length as built),
 *                        as the late bank GameAudio.update starts by itself after control (src/audio/bank.js loadLate);
 *                        the director's five beds and the re-survey's hold are up; Brea set down inside Ninewalls brings
 *                        Ninewalls' bed up and the Pans' beds down through the regions seam (its enter and leave), and
 *                        back home the Pans return; the calima (environment.setWeather) thins the trade wind under half
 *                        and drops a 100 m one-shot under 0.4; every first-hour event (the Windwall, the gaff, the pots,
 *                        the Screed, the re-survey, the trample's wind-up) plays its cue through the game's own bus.
 */
const ARM = `
  const _arm = async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));
    const a = __CTX__.audio;
    const t0 = performance.now();
    while (!a.ac && performance.now() - t0 < 5000) await new Promise(r => setTimeout(r, 60));
    if (a.ac && a.ac.state !== 'running') { try { await a.ac.resume(); } catch (e) {} }
    if (a.bankReady) { try { await a.bankReady; } catch (e) {} }
    const t1 = performance.now();
    while (!(a.slice && a.slice.ready) && performance.now() - t1 < 4000) await new Promise(r => setTimeout(r, 60));
    return a;
  };`;

export const GATES = [
  {
    id: 'A-audio-slice-live', kind: 'action', lane: 'audio',
    title: 'M1.6k live: the slice bank decodes whole, the director and six buses run, lamp changes on a Plumb, the Gauge and Pegs all chirp',
    settle: 400, timeout: 120000,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac) return { pass: null, detail: 'SKIP: no AudioContext' };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const MAN = (await import('/src/audio/manifest.js')).MANIFEST;
      const au = a.bank.audit();
      let worstLoopMs = 0, worstLoop = null, worstAnyMs = 0;
      for (const r of MAN) {
        const b = a.bank.get(r.id);
        if (!b) continue;
        const dms = Math.abs(b.duration - r.dur) * 1000;
        if (dms > worstAnyMs) worstAnyMs = dms;
        if (r.loop && dms > worstLoopMs) { worstLoopMs = dms; worstLoop = r.file; }
      }
      const S = a.slice;
      const B = a.buses;
      const trims = { amb: +B.ambBus.gain.value.toFixed(3), sfx: +B.sfxBus.gain.value.toFixed(3), inst: +B.instBus.gain.value.toFixed(3),
        brea: +B.breaBus.gain.value.toFixed(3), ui: +B.uiBus.gain.value.toFixed(3), music: +B.musicBus.gain.value.toFixed(3) };
      const stems = a.music ? Object.keys(a.music._stems || {}) : [];
      const c0 = a.cueCounts()['ui/tick'] || 0;
      __CTX__.events.emit('ui-nav', {});
      await sleep(80);
      const tick = (a.cueCounts()['ui/tick'] || 0) - c0;
      // quick-make (TECH §14): ammo-crafted plays the bank's make/quick, not the Round-4 synth
      const q0 = a.cueCounts()['make/quick'] || 0, s0 = a._counts.crafts;
      __CTX__.events.emit('ammo-crafted', { ammo: 'reed', n: 6 });
      await sleep(80);
      const quickMake = (a.cueCounts()['make/quick'] || 0) - q0;

      // lamp changes on each kind in turn, Brea 12 m off it; each staged change confirmed on the lamp (lampStateFor) and
      // answered by a chirp of the new state's set in the director's own log within the step
      const { lampStateFor } = await import('/src/instruments/lamps.js');
      const P = __CTX__.player;
      const M = __CTX__.machines;
      const live = () => (M?.list || []).filter(m => m.alive && typeof m.forceState === 'function');
      let spawned = null;
      if (!live().some(m => m.kind === 'plumb') && M?.spawn) {
        const peg = live().find(m => m.kind === 'peg') || live()[0];
        const at = peg ? { x: peg.position.x + 40, z: peg.position.z + 30 } : { x: P.position.x + 30, z: P.position.z };
        spawned = M.spawn('plumb', at.x, at.z, {});
        await sleep(1500);
      }
      const plumb = live().find(m => m.kind === 'plumb');
      const gauge = live().find(m => m.kind === 'gauge');
      const pegs = live().filter(m => m.kind === 'peg').slice(0, 2);
      const home = { x: P.position.x, y: P.position.y, z: P.position.z };
      const st0 = { ...S.lamp };
      const counts0 = a.cueCounts();
      const staged = [];
      const dark = (m, on) => { if (m.sc) m.sc.lampDarkT = on ? 30 : 0; else m.lampDarkT = on ? 30 : 0; };
      const SEQ = { plumb: ['suspicious', 'alert', 'search', 'patrol', 'dark', 'undark', 'alert', 'patrol'], peg: ['suspicious', 'alert', 'search', 'patrol', 'dark', 'undark'], gauge: ['dark', 'undark', 'dark', 'undark', 'dark', 'undark'] };
      try {
        for (const m of [plumb, gauge, ...pegs].filter(Boolean)) {
          P.position.x = m.position.x + 12; P.position.z = m.position.z;
          if (P._snapToGround) P._snapToGround();
          await sleep(400);
          for (const s of SEQ[m.kind] || SEQ.peg) {
            const before = lampStateFor(m);
            const log0 = S.lampChirps.length ? S.lampChirps[S.lampChirps.length - 1] : null;
            if (s === 'dark') dark(m, true);
            else if (s === 'undark') { dark(m, false); m.forceState('patrol'); }
            else m.forceState(s);
            await sleep(160);
            const after = lampStateFor(m);
            const i0 = log0 ? S.lampChirps.lastIndexOf(log0) + 1 : 0;
            const fresh = S.lampChirps.slice(i0);
            const voiced = fresh.some(c => c.kind === m.kind && c.to === after && c.played);
            staged.push({ kind: m.kind, s, before, after, changed: after !== before, voiced, d: +Math.hypot(m.position.x - P.position.x, m.position.z - P.position.z).toFixed(1) });
          }
        }
      } finally {
        for (const m of [plumb, gauge, ...pegs].filter(Boolean)) { dark(m, false); try { m.forceState('patrol'); } catch (e) {} }
        P.position.x = home.x; P.position.y = home.y; P.position.z = home.z;
        if (P._snapToGround) P._snapToGround();
      }
      await sleep(200);
      const counts1 = a.cueCounts();
      const chirpCues = ['calm', 'wary', 'hostile', 'dark'].reduce((n, k) => n + ((counts1['lamp/' + k] || 0) - (counts0['lamp/' + k] || 0)), 0);
      const confirmed = staged.filter(x => x.changed);
      const perKind = {};
      for (const x of confirmed) { const k = perKind[x.kind] || (perKind[x.kind] = { changed: 0, voiced: 0 }); k.changed++; if (x.voiced) k.voiced++; }
      const lamp = {
        kinds: Object.keys(perKind), spawnedPlumb: !!spawned, staged: staged.length, confirmed: confirmed.length,
        confirmedVoiced: confirmed.filter(x => x.voiced).length, perKind,
        changes: S.lamp.changes - st0.changes, chirpsVoiced: S.lamp.chirps - st0.chirps, chirpCues,
        missed: S.lamp.missed - st0.missed, outOfRange: S.lamp.outOfRange - st0.outOfRange, log: staged,
      };
      const checks = {
        bankLoaded: au.loaded && au.failedCount === 0 && au.rejectedCount === 0 && au.unlicensed === 0,
        everyRowDecoded: au.size === MAN.length,
        loopsWhole: worstLoopMs <= 1.5,
        director: !!(S && S.ready) && Object.keys(S.beds).length === 6,
        sixBusTrims: trims.amb > 0 && trims.inst > 0 && trims.brea > 0,
        themeStems: ['strings', 'whistle', 'pedal', 'ratchet'].every(k => stems.includes(k)) && !!a.music?.available,
        glassTick: tick === 1,
        quickMake: quickMake === 1 && a._counts.crafts === s0 + 1,
        // every staged change the lamp shows is chirped; every change the director saw in range is chirped
        lampChirps: lamp.confirmed >= 20 && lamp.confirmedVoiced === lamp.confirmed && lamp.missed === 0
          && lamp.chirpsVoiced + lamp.outOfRange === lamp.changes && lamp.chirpCues === lamp.chirpsVoiced,
        threeKinds: ['plumb', 'gauge', 'peg'].every(k => (perKind[k]?.changed || 0) >= 4),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, detail: {
        failed, checks, bank: { size: au.size, declared: au.declared, sets: au.sets, megabytes: au.megabytes, failed: au.failed, rejected: au.rejected },
        worstLoopMs: +worstLoopMs.toFixed(3), worstLoop, worstAnyMs: +worstAnyMs.toFixed(3), sampleRate: a.ac.sampleRate,
        trims, stems, tick, quickMake, lamp, slice: S && S.stats ? S.stats() : null,
      } };
    })()`,
  },
  {
    id: 'A-audio-gust-live', kind: 'action', lane: 'audio',
    title: 'M1.6k live: in the real reed beds the director raises the gust 0.8 s or more before the wind passes 4 m/s (5 or more gusts)',
    settle: 400, timeout: 150000,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac || !a.slice?.ready) return { pass: null, detail: 'SKIP: no AudioContext or no director' };
      const R = __CTX__.reeds;
      if (!R?.mask || !R.clocks) return { pass: null, detail: 'PENDING: no reed system' };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const raf = () => new Promise(r => requestAnimationFrame(r));
      const { CANE_LEAD } = await import('/src/audio/slice/mix.js');
      const S = a.slice, P = __CTX__.player;
      // a dense cell near each bed's centroid (the director's probe finds the bed at d = 0 there)
      const M = R.mask, N = M.n, cell = M.cell;
      const acc = new Map();
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const o = (j * N + i) * 2;
        if (M.base[o] < 0.7 * 255) continue;
        const b = M.base[o + 1];
        const e = acc.get(b) || acc.set(b, []).get(b);
        e.push([M.x0 + (i + 0.5) * cell, M.z0 + (j + 0.5) * cell]);
      }
      const spot = {};
      for (const [b, cs] of acc) {
        const cx = cs.reduce((s, c) => s + c[0], 0) / cs.length, cz = cs.reduce((s, c) => s + c[1], 0) / cs.length;
        let best = null; for (const c of cs) { const d = Math.hypot(c[0] - cx, c[1] - cz); if (!best || d < best.d) best = { x: c[0], z: c[1], d }; }
        if (M.cover(best.x, best.z) >= 0.45 && M.bedAt(best.x, best.z)?.id === b) spot[b] = best;
      }
      const beds = Object.keys(spot).map(Number);
      // file levels of the two loops (the bed's audible level = target x row gain x the file's RMS, smoothed by tau)
      const rms = (set) => { const f = a.bank.first(set); if (!f) return 0; let s = 0, n = 0; for (let c = 0; c < f.buffer.numberOfChannels; c++) { const d = f.buffer.getChannelData(c); for (let i = 0; i < d.length; i += 4) { s += d[i] * d[i]; n++; } } return Math.sqrt(s / n); };
      const rG = rms('amb/cane-gust'), rL = rms('amb/cane-lull');
      const home = { x: P.position.x, y: P.position.y, z: P.position.z };
      const gusts = [];
      const rt0 = R.t, w0 = performance.now();
      const visited = [];
      try {
        const deadline = performance.now() + 75000;
        while (gusts.length < 6 && performance.now() < deadline) {
          // the bed whose next rise through 4 m/s is 2.5-7 s away on the reeds' clock
          const t = R.t;
          let pick = null;
          for (const b of beds) {
            const sp = R.clocks[b].spans(t, t + 9).find(q => q.gust && q.start > t + 2.5 && q.start < t + 7);
            if (sp && (!pick || sp.start < pick.T)) pick = { b, T: sp.start };
          }
          if (!pick) { await sleep(250); continue; }
          const s = spot[pick.b];
          P.position.x = s.x; P.position.z = s.z;
          if (P._snapToGround) P._snapToGround();
          visited.push(pick.b);
          // log frames until 2.5 s past the crossing
          const log = [];
          while (R.t < pick.T + 2.5 && performance.now() < deadline) {
            await raf();
            const c = S._cane;
            log.push({ t: R.t, wind: R.clocks[pick.b].speed(R.t), bed: c.bed, d: c.d, ahead: c.ahead, gust: S.beds.gust.volume, lull: S.beds.lull.volume });
          }
          // heard level (dB): the loops' targets through their smoothing (gust tau 0.06 s, lull 0.12 s) on the reeds' time
          let vg = 0, vl = 0, prev = null;
          const lv = [];
          for (const f of log) {
            const dt = prev ? Math.max(0, f.t - prev.t) : 0;
            if (prev) { vg += (prev.gust - vg) * (1 - Math.exp(-dt / 0.06)); vl += (prev.lull - vl) * (1 - Math.exp(-dt / 0.12)); } else { vg = f.gust; vl = f.lull; }
            const p = (vg * rG) ** 2 + (vl * rL) ** 2;
            lv.push({ t: f.t, db: 10 * Math.log10(p + 1e-12), wind: f.wind, bed: f.bed });
            prev = f;
          }
          const T = pick.T;
          const pre = lv.filter(x => x.t >= T - 2.0 && x.t <= T - 1.4 && x.bed === pick.b).map(x => x.db).sort((p, q) => p - q);
          const lull = pre.length ? pre[pre.length >> 1] : null;
          const on = lull == null ? null : lv.find(x => x.t >= T - 2.0 && x.db >= lull + 6);
          const full = lv.filter(x => x.t >= T + 1 && x.t <= T + 2.4).map(x => x.db).sort((p, q) => p - q);
          // the wind's own crossing from the frames (the clock's span start is the same instant)
          const cross = log.find((f, i) => i && log[i - 1].wind < 4 && f.wind >= 4);
          gusts.push({ bed: pick.b, T: +T.toFixed(2), crossFromFrames: cross ? +cross.t.toFixed(2) : null, frames: log.length,
            lullDb: lull == null ? null : +lull.toFixed(1), riseDb: lull == null || !full.length ? null : +(full[full.length >> 1] - lull).toFixed(1),
            heardAt: on ? +on.t.toFixed(2) : null, lead: on ? +(T - on.t).toFixed(2) : null,
            aheadAtHeard: on ? +(log.find(f => f.t >= on.t)?.ahead ?? NaN).toFixed(2) : null,
            dAtCross: (log.find(f => f.t >= T) || {}).d ?? null });
        }
      } finally {
        P.position.x = home.x; P.position.y = home.y; P.position.z = home.z;
        if (P._snapToGround) P._snapToGround();
      }
      const leads = gusts.map(g => g.lead).filter(v => v != null);
      const reedRate = (R.t - rt0) / ((performance.now() - w0) / 1000);
      const checks = {
        fiveGusts: gusts.length >= 5,
        everyHeard: gusts.length > 0 && gusts.every(g => g.lead != null),
        lead08: leads.length > 0 && leads.every(v => v >= 0.8),
        rises: gusts.every(g => g.riseDb != null && g.riseDb >= 6),
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      const sorted = leads.slice().sort((p, q) => p - q);
      return { pass: failed.length === 0, detail: { failed, checks, caneLead: CANE_LEAD, beds: beds.length, visited,
        lead: { n: leads.length, min: sorted[0], median: sorted[sorted.length >> 1], max: sorted[sorted.length - 1] },
        reedClockPerWallSecond: +reedRate.toFixed(3), fileRms: { gust: +rG.toFixed(4), lull: +rL.toFixed(4) }, gusts } };
    })()`,
  },
  {
    id: 'A-audio-walk-graph', kind: 'action', lane: 'audio',
    title: "M1.6k: the slice walk through the game's own audio graph offline: -18 LUFS +- 2, true peak <= -1 dBTP after the real limiter",
    settle: 400, timeout: 420000,
    assert: `(async () => {
      const { renderWalkGraph } = await import('/tools/gates/audio/walk-graph.mjs');
      const r = await renderWalkGraph(__CTX__);
      if (r.error) return { pass: false, detail: r };
      const checks = { loudness: r.loudness.pass, truePeak: r.truePeak.pass, noErrors: r.errors.length === 0,
        directorChirped: r.slice.lamp.chirps > 0 && r.slice.lamp.missed === 0 };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, detail: { failed, checks, ...r } };
    })()`,
  },
  {
    id: 'A-audio-hour-live', kind: 'action', lane: 'audio',
    title: "Milestone 2 live: the first hour's bank decodes whole; the zones follow the regions seam (Ninewalls up, the Pans' beds down, and back); calima at noon thins the wind; every first-hour event plays its cue",
    settle: 400, timeout: 150000,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac) return { pass: null, detail: 'SKIP: no AudioContext' };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const t1 = performance.now();
      while (!(a.hour && a.hour.ready) && performance.now() - t1 < 4000) await sleep(60);
      const H = a.hour;
      if (!H || !H.ready) return { pass: false, detail: 'the director of the first hour never came up' };
      // the first hour's bank is the late one: GameAudio.update starts it after control (the first-load cap)
      const t2 = performance.now();
      while (!a.bankLate && performance.now() - t2 < 6000) await sleep(60);
      const lateStarted = !!a.bankLate;
      if (a.bankLate) { try { await a.bankLate; } catch (e) {} }
      const LA = a.lateAudit();
      const late = { started: lateStarted, state: LA.state, rows: LA.rows, decoded: LA.decoded, megabytes: LA.megabytes, startedS: LA.startedS, doneS: LA.doneS, missedBefore: LA.missed.length };
      const { M2_CUES } = await import('/src/audio/m2/cues.js');
      const MAN = (await import('/src/audio/manifest.js')).MANIFEST;
      const m2sets = new Set(M2_CUES.map(c => c.set));
      let decoded = 0, rows = 0, worstMs = 0;
      for (const r of MAN) {
        if (!m2sets.has(r.set)) continue;
        rows++;
        const b = a.bank.get(r.id);
        if (!b) continue;
        decoded++;
        worstMs = Math.max(worstMs, Math.abs(b.duration - r.dur) * 1000);
      }
      const P = __CTX__.player, env = __CTX__.environment;
      const home = { x: P.position.x, y: P.position.y, z: P.position.z };
      const { CENTRE } = await import('/src/world/settlements/ninewalls-layout.js');
      const go = async (x, z, ms) => { P.position.x = x; P.position.z = z; if (P._snapToGround) P._snapToGround(); await sleep(ms); };
      const snap = () => ({ zone: { ...H.stats().zone }, beds: { ...H.stats().beds }, pans: +(a.slice.beds.pans?.volume ?? -1).toFixed(3), trade: +(a.slice.beds.trade?.volume ?? -1).toFixed(3), region: __CTX__.regions?.tracker?.current ?? null });
      const cross0 = H.crossings.length;
      let atHome0, atNine, atHome1, calima = null;
      const w0 = env?.weather;
      try {
        atHome0 = snap();
        await go(CENTRE.x + 6, CENTRE.z + 6, 7000);
        atNine = snap();
        await go(home.x, home.z, 7000);
        atHome1 = snap();
        if (env?.setWeather) {
          const tr0 = a.slice.beds.trade?.volume ?? 0;
          env.setWeather('calima', 0);
          await sleep(2500);
          calima = { director: +H.calima.toFixed(3), bed: +(H.beds.calima?.volume ?? 0).toFixed(3), tradeBefore: +tr0.toFixed(3), tradeAfter: +(a.slice.beds.trade?.volume ?? 0).toFixed(3), far100: +H.farGain(100).toFixed(3) };
        }
      } finally {
        if (env?.setWeather && w0) env.setWeather(w0, 0);
        await go(home.x, home.z, 300);
      }
      const crossings = H.crossings.slice(cross0).map(c => c.type + ':' + c.region);
      // every first-hour event cue, through the game's own bus and director
      const c0 = a.cueCounts();
      const E = __CTX__.events;
      const at = { x: P.position.x + 6, y: P.position.y, z: P.position.z };
      const fake = (kind) => ({ kind, position: { x: at.x, y: at.y, z: at.z }, alive: true });
      E.emit('windwall-planted', { x: at.x, z: at.z, h: 0.9 });
      E.emit('windwall-block', { result: 'block' }); E.emit('windwall-block', { result: 'parry' }); E.emit('windwall-bash', { kind: 'screed' });
      E.emit('gaff-hit', { verb: 'light1', kind: 'screed' }); E.emit('gaff-hit', { verb: 'hookRip', kind: 'screed', blown: 'off' });
      E.emit('pot-landed', { id: 'brine', at }); E.emit('pot-status', { kind: 'screed', pot: 'brine' }); E.emit('pot-landed', { id: 'cinder', at });
      for (const n of ['screed-charge', 'screed-stalled', 'seal-off', 'screed-seized', 'screed-cut']) E.emit(n, { machine: fake('screed') });
      E.emit('resurvey-bearing', {}); E.emit('resurvey-done', {});
      E.emit('machine-attack-phase', { machine: fake('tiller'), kind: 'herd-trample', attack: 'herd-trample', phase: 'windup' });
      await sleep(600);
      const c1 = a.cueCounts();
      const want = ['windwall/plant', 'windwall/block', 'windwall/parry', 'windwall/bash', 'gaff/hit', 'gaff/hook', 'gaff/rip', 'pot/break', 'pot/seize', 'pot/cinder',
        'screed/charge', 'screed/stall', 'screed/seal', 'screed/seize', 'screed/cut', 'alidade/mark', 'alidade/true', 'tiller/trample'];
      const played = Object.fromEntries(want.map(s => [s, (c1[s] || 0) - (c0[s] || 0)]));
      const silent = want.filter(s => !(played[s] > 0));
      const checks = {
        late: late.started && late.state === 'done' && late.decoded === late.rows && late.rows > 0,
        decoded: rows > 0 && decoded === rows && worstMs < 30, beds: Object.keys(H.beds).length === 5 && !!H._hold,
        ninewallsUp: atNine.zone.nine >= 0.9 && atNine.zone.holds + atNine.zone.other >= 0.9 && atNine.beds.ninewalls > 0.1,
        pansDownInNinewalls: atNine.pans <= 0.05 && atHome0.pans > 0.05,
        pansBack: atHome1.zone.pans >= 0.9 && atHome1.zone.nine <= 0.1,
        crossings: crossings.includes('enter:holds') && crossings.includes('leave:holds'),
        calima: !!calima && calima.director >= 0.95 && calima.bed > 0.2 && calima.tradeAfter < calima.tradeBefore * 0.5 && calima.far100 < 0.4,
        events: silent.length === 0,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: failed.length === 0, detail: { failed, checks, late, bank: { rows, decoded, worstMs: +worstMs.toFixed(1) }, atHome0, atNine, atHome1, crossings, calima, played, silent } };
    })()`,
  },
];
