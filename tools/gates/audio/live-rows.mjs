/**
 * BUILD M1.6k live rows (audio lane), run in the page beside the kept rows:
 *
 *   node tools/gates.mjs --port <p> --kept-stack --only A73d-ui-bus,A-audio-slice-live --extra tools/gates/audio/live-rows.mjs
 *
 *   A-audio-slice-live   the slice's bank decodes in Chrome with no failure (every set, every loop the length the
 *                        builder wrote: Ogg Opus pre-skip and padding trimmed, or a loop would click at its seam); the
 *                        director runs with its beds and the six buses' trims; the Pans theme's four stems are up;
 *                        a glass tick on ui-nav; and 20 lamp-state changes on the scene's own Instruments (forceState
 *                        and a darkened lamp, Brea stood 12 m off) give 20 chirps, each the new state's set.
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
    title: 'M1.6k live: the slice bank decodes whole, the director and six buses run, 20 lamp changes give 20 chirps',
    settle: 400, timeout: 90000,
    assert: `(async () => {
      ${ARM}
      const a = await _arm();
      if (!a.ac) return { pass: null, detail: 'SKIP: no AudioContext' };
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const MAN = (await import('/src/audio/manifest.js')).MANIFEST;
      const au = a.bank.audit();
      // every loop as long as the builder wrote it (decoded at the context's rate)
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
      // a glass tick
      const c0 = a.cueCounts()['ui/tick'] || 0;
      __CTX__.events.emit('ui-nav', {});
      await sleep(80);
      const tick = (a.cueCounts()['ui/tick'] || 0) - c0;

      // 20 lamp changes on the scene's own Instruments
      const P = __CTX__.player;
      const list = (__CTX__.machines?.list || []).filter(m => m.alive && typeof m.forceState === 'function');
      let lamp = null;
      if (list.length) {
        const home = { x: P.position.x, y: P.position.y, z: P.position.z };
        const ms = list.slice(0, 4);
        const m0 = ms[0];
        const counts0 = a.cueCounts();
        const st0 = { ...S.lamp };
        const log = [];
        try {
          P.position.x = m0.position.x + 12; P.position.z = m0.position.z;
          if (P._snapToGround) P._snapToGround();
          await sleep(300);
          const seq = ['suspicious', 'alert', 'search', 'patrol', 'dark'];
          let want = 0;
          for (const s of seq) {
            for (const m of ms) {
              if (s === 'dark') { if (m.sc) m.sc.lampDarkT = 3; else m.lampDarkT = 3; }
              else m.forceState(s);
              want++;
              await sleep(90);
              log.push({ kind: m.kind, s, lamp: m.lampState, d: +Math.hypot(m.position.x - P.position.x, m.position.z - P.position.z).toFixed(1) });
            }
          }
          await sleep(200);
          const counts1 = a.cueCounts();
          const chirps = ['calm', 'wary', 'hostile', 'dark'].reduce((n, k) => n + ((counts1['lamp/' + k] || 0) - (counts0['lamp/' + k] || 0)), 0);
          lamp = { machines: ms.map(m => m.kind), changes: S.lamp.changes - st0.changes, chirpsVoiced: S.lamp.chirps - st0.chirps,
            chirpCues: chirps, missed: S.lamp.missed - st0.missed, outOfRange: S.lamp.outOfRange - st0.outOfRange, want, log: log.slice(0, 20) };
        } finally {
          for (const m of ms) { if (m.sc) m.sc.lampDarkT = 0; else m.lampDarkT = 0; try { m.forceState('patrol'); } catch (e) {} }
          P.position.x = home.x; P.position.y = home.y; P.position.z = home.z;
          if (P._snapToGround) P._snapToGround();
        }
      }
      const checks = {
        bankLoaded: au.loaded && au.failedCount === 0 && au.rejectedCount === 0 && au.unlicensed === 0,
        everyRowDecoded: au.size === MAN.length,
        loopsWhole: worstLoopMs <= 1.5,
        director: !!(S && S.ready) && Object.keys(S.beds).length === 6,
        sixBusTrims: trims.amb > 0 && trims.inst > 0 && trims.brea > 0,
        themeStems: ['strings', 'whistle', 'pedal', 'ratchet'].every(k => stems.includes(k)) && !!a.music?.available,
        glassTick: tick === 1,
        lampChirps: !!lamp && lamp.want === 20 && lamp.changes >= 20 && lamp.chirpsVoiced >= 20 && lamp.chirpCues >= 20,
      };
      const failed = Object.keys(checks).filter(k => !checks[k]);
      return { pass: lamp ? failed.length === 0 : null, detail: {
        failed, checks, bank: { size: au.size, declared: au.declared, sets: au.sets, megabytes: au.megabytes, failed: au.failed, rejected: au.rejected },
        worstLoopMs: +worstLoopMs.toFixed(3), worstLoop, worstAnyMs: +worstAnyMs.toFixed(3), sampleRate: a.ac.sampleRate,
        trims, stems, tick, lamp, slice: S && S.stats ? S.stats() : null,
        note: lamp ? undefined : 'PENDING: no Instrument in the scene to drive',
      } };
    })()`,
  },
];
