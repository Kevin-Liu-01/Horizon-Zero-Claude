/**
 * Area E's Milestone 2 frames and their stagings (systems): F44 the re-survey at Benchmark 1, F46 the TRADE screen;
 * F35 (with settlements) and F38 (with instruments) are staged in those lanes' files. Contract: ./index.mjs.
 *
 * F44 at BLOCKOUT (wave 1): Brea on the bible's Benchmark 1 (E 12, N -282, on the Scar's line, 70 m south of
 * Ninewalls) at 11:00 in trade weather, the Alidade raised toward T1 (the first bearing, 249 deg), the lens behind her
 * right shoulder (uphill, toward Ninewalls) looking down the Scar's line (225 deg) to the sea, so her raised Alidade,
 * T1's bearing and the Scar running to the horizon are in frame. (The first blockout lens, three-quarter front at
 * yawRel 40, looked into Ninewalls' outermost wall 5 m behind B1 and showed no horizon: run
 * 20261119T111714Z-0ffc4e3-systems-w1-f44-partial.)
 * WAVE 3 (behaviour): the re-survey is built (src/game/resurvey/), so F44 shows it at 10 s of the hold, set from a clean
 * slate by the systems runtime (`systemsGame.hour.stageResurvey({ atS: 10 })`): the 15 s arc round the hairs at 8.8 s
 * banked, three bearing pips (T1 and T2 taken, the Ring to come), and the three Pegs that come to look placed where a
 * lured Peg is at 10 s (about 7.9 m along from its station 27 m out). The planted Windwall is area D's verb (wave 3):
 * planted when `combat.windwall.plant` exists, else named a stand-in. Wall clock: film with --repeat 2.
 * F46 (wave 4): THE TRADE SCREEN at the Ninewalls tube-mouth counter, 12:30 in trade weather: Brea at the counter's
 * front (settlements' PLACES.counter, 1.3 m out toward the street), the counter opened as "The Scar"'s reward opens it
 * (`systemsGame.hour.counter.open()`), salt x60 (the Scar's pay) and one Plumb bob in her satchel so both columns hold
 * something, and the screen opened (`counter.openScreen()`): BIBLE 18's words, the grades as 3 px rules, the world
 * frosted behind the glass. A UI slate: wall clock, film with --repeat 2.
 */
export const lane = 'systems';

/** @type {object[]} frameset.json-shaped frame definitions, `in: 'M2'` */
export const frames = [
  {
    id: 'F44', subject: 'the re-survey at Benchmark 1, 10 s into the hold', in: 'M2', hour: 11, weather: 'trade',
    at: { en: [12, -282] }, bearing: 249,
    camera: { mode: 'orbit', yawRel: 150, dist: 4.2, height: 2.3, target: { fwd: 6, side: 0, up: 1.2 }, fov: 50, lookAt: 'off' },
    state: { pose: 'idle', hud: false },
    ref: { written: 'the Alidade up in front of her face, the planted Windwall between her and one approaching Instrument, three bearing pips, the 15 s arc; the Scar running to the horizon' },
    note: 'wave 3: the re-survey staged at 10 s of the hold (the arc, the pips, the Pegs coming to look); the Windwall is a stand-in until area D plants it (see run.json standIns)',
  },
  {
    id: 'F46', subject: 'the TRADE screen at the Ninewalls counter', in: 'M2', hour: 12.5, weather: 'trade',
    at: { en: [1.8, -204.7] }, bearing: 57,
    camera: { mode: 'orbit', yawRel: 165, dist: 3.4, height: 1.9, target: { fwd: 3, side: 0, up: 1.1 }, fov: 50, lookAt: 'off' },
    state: { pose: 'idle', hud: false },
    ref: { written: "BIBLE 18's words exactly (TRADE · GIVE · TAKE), prices in salt, the three trade grades as a 3 px rule; glass" },
    note: 'wave 4: the counter opened and its screen up (src/ui/trade.js); run.json holds the words on the screen',
  },
];

export const STAGED = { F44: 'wall', F46: 'wall' };

/** @type {Record<string, { world?: Function, beforeFreeze?: Function }>} in-page hooks per frame id */
export const stagings = {
  F44: {
    async world(f, api) {
      const C = api.C;

      // the Alidade raised (V): the animator's alidade layer follows Sighting's `on` (playerAnimator.js)
      if (C.sighting?.toggle) {
        C.sighting.toggle(true);
        api.undo(() => C.sighting.toggle(false));
        // the hairlines Sighting puts up are page chrome: hidden as page.mjs hides the rest (the frame has no HUD)
        const cv = C.engine?.renderer?.domElement;
        for (const el of Array.from(document.body.querySelectorAll('*'))) {
          if (el === cv || el.contains(cv) || !/sight|alidade|cross|hair/i.test(`${el.id} ${el.className}`)) continue;
          const d = el.style.display; el.style.display = 'none'; api.undo(() => { el.style.display = d; });
        }
      } else api.standIn('no Sighting in this build: the Alidade is not raised');
      // the re-survey at 10 s of the hold (src/game/hour.js stageResurvey: the arc, the pips, the Pegs that come to look)
      const H = C.systemsGame?.hour;
      if (H?.stageResurvey) {
        try {
          const rep = H.stageResurvey({ atS: 10 });
          window.__f44 = rep;
          api.undo(() => {
            if (H.unstageResurvey) H.unstageResurvey(); else H.resurvey?.arm(false);
            for (const m of (H.spawned?.lookers || [])) { try { C.machines?.sites?.dispose?.(m) ?? m.dispose?.(); } catch { /* */ } }
          });
          // no wait here: 0.3 s after the Alidade goes up her own boom (0.9 m, Sighting's) meets the pillar's drum beside
          // B1 and dissolves her to 0.06 (60ec569); the frame's lens is page.mjs's, 4.2 m off
          if (!rep.lookers.length) api.standIn('no Peg came to look (none could be stood up)');
          else api.standIn(`staged at 10 s: arc ${rep.arc} s, ${rep.taken} of 3 bearings, lookers ${JSON.stringify(rep.placed)}; her fade ${C.player?.fade ?? '?'}`);
        } catch (e) { api.standIn(`the re-survey staging threw: ${e?.message || e}`); }
      } else api.standIn('no re-survey in this build (src/game/hour.js stageResurvey)');
      const ww = C.combat?.windwall;
      if (ww?.plant && C.player?.hero?.grantOroKit) {
        try { await C.player.hero.grantOroKit({ gaff: true, windwall: true, pots: 3 }); ww.plant(); await api.sleep(700); } catch (e) { api.standIn(`the Windwall plant threw: ${e?.message || e}`); }
      } else api.standIn('no planted Windwall in this build (area D, wave 3: combat.windwall.plant)');
      const pad = (C.props?.survey?.benchmarks || C.survey?.benchmarks || []).find?.((b) => b.id === 'bm-01');
      api.standIn(pad ? `bm-01's pad at (${pad.x.toFixed(1)}, ${pad.z.toFixed(1)}); she stands on the bible's point` : "B1's pad not found on ctx.props.survey: she stands on the bible's point");
    },
    async beforeFreeze(f, api) {
      const p = api.C.player;
      api.standIn(`before the freeze: her fade ${p?.fade}, solidCut ${p?.solidCut?.toFixed?.(2)}, lensGap ${p?.lensGap?.toFixed?.(2)}, solidReach ${p?.solidReach?.toFixed?.(2)}`);
    },
  },
  F46: {
    async world(f, api) {
      const C = api.C, H = C.systemsGame?.hour, K = H?.counter;
      if (!K?.openScreen) { api.standIn('no Ninewalls counter in this build (src/game/trade/counter.js)'); return; }
      const inv = C.inventory;
      const salt0 = inv?.count?.('metal-shards') ?? 0, bob0 = inv?.count?.('machine-core') ?? 0;
      if (inv?.add) { inv.add('metal-shards', Math.max(0, 60 - salt0)); if (bob0 < 1) inv.add('machine-core', 1); }
      api.undo(() => { try { if (inv?.take) { inv.take('metal-shards', Math.max(0, (inv.count('metal-shards') ?? 0) - salt0)); if (bob0 < 1 && inv.count('machine-core') > 0) inv.take('machine-core', 1); } } catch { /* */ } });
      const was = K.opened;
      K.opened = false; K.open();
      api.undo(() => { K.opened = was; K._sync?.(); });
      K.openScreen();
      await api.sleep(400);
      api.undo(() => { C.tradeOpen?.close?.(); });
      const ui = await import('/src/ui/trade.js');
      const w = ui.tradeWords?.();
      window.__f46 = w;
      api.standIn(`the TRADE screen: words ${JSON.stringify(w?.words ?? null)}, ${w?.rows ?? 0} rows, grades ${JSON.stringify([...new Set(w?.grades ?? [])])}`);
    },
  },
};
