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
 * lured Peg is at 10 s (about 7.9 m along from its station 27 m out). The planted Windwall is area D's verb (wave 3).
 * POLISH (frames lane, F44 to its written target): the kit is handed over and the Windwall planted on her line before the
 * hold is staged (it was never planted: the staging looked for the verb before the hand-over made it), the Alidade's
 * raise is held to its full weight before the freeze, Sighting's card is hidden with the rest of its chrome, and the
 * lens stands at her LEFT side, a little behind, at 1.9 m (yawRel 100), looking past her down the slope: her profile
 * with the right hand and the tube at her eye, the planted fan in front of her knees, the Peg that comes up her line
 * 18.7 m out, the coast and the horizon. (yawRel 150, behind her left shoulder, hid the hand behind her head; every lens
 * on her right stands inside the benchmark house 1-2 m north of the pad: runs 20261120T000919Z-4e451a2-polish-x1-partial
 * and 20261120T002449Z-4e451a2-polish-x2-partial.) Wall clock: film with --repeat 2.
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
    camera: { mode: 'orbit', yawRel: 100, dist: 3.6, height: 1.9, target: { fwd: 2.8, side: 0, up: 0.9 }, fov: 55, lookAt: 'off' },
    state: { pose: 'idle', hud: false },
    ref: { written: 'the Alidade up in front of her face, the planted Windwall between her and one approaching Instrument, three bearing pips, the 15 s arc; the Scar running to the horizon' },
    note: 'wave 3: the re-survey staged at 10 s of the hold (the arc, the pips, the Pegs coming to look); polish: the Windwall planted on her line to the Peg that comes up the Scar, the Alidade at her right eye (run.json standIns name both)',
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
      const C = api.C, p = C.player, hero = p?.hero;
      /* POLISH (frames lane, F44 to its written target): the Windwall is PLANTED here, before the Alidade goes up. At
       * 02f7125 the staging asked for `combat.windwall.plant` before the kit was handed over, and the Windwall state is
       * made by the hand-over (hero.grantOroKit -> ensureWindwall): it never existed, so every film named a stand-in.
       * Now: Oro's kit is granted (undone as tools/frames/stagings/kit.mjs undoes it), the fan is put on her guard and
       * planted at once (the plant is X from the guard; the guard's RMB is not held, so the plant is asked on the step
       * the guard is set), and the staging waits for the animator's step to stand it on the ground 0.42 m in front of
       * her, square to her heading: bearing 249, the line to the looker that comes up the Scar 19 m out on 250 */
      if (hero?.grantOroKit) {
        try {
          await hero.grantOroKit({ gaff: true, windwall: true, pots: 0 });
          api.undo(() => {
            const cb = C.combat, an = p?.animator;
            const g = cb?.gaff; if (g) { g.want = false; g.after = null; g.owned = false; g.verbs?.cancel?.(); if (g.prop?.group) { g.prop.group.visible = false; g.prop.group.removeFromParent(); } }
            const w = cb?.windwall; if (w) { w.owned = false; w.want = false; w.phase = 'stowed'; w.plantedAt = null; if (w.prop?.group) { w.prop.group.visible = false; w.prop.group.removeFromParent(); } }
            try { cb?.kitVerbs?._unplant?.(); } catch { /* */ }
            const K = cb?.pots; if (K) { K.cancel?.(); K.dispose?.(); }
            if (an) { an._gf = null; an._wwS = null; if (an._pots?.belt) for (const m of an._pots.belt) m.removeFromParent(); an._pots = null; an._oroKit = null; }
            const KO = hero.oro; hero.oro?.dispose?.(); if (KO) hero.oro = new KO.constructor(p);
            if (cb) { cb.gaff = null; cb.windwall = null; cb.pots = null; cb.status = null; }
          });
          const ww = C.combat?.windwall;
          await (ww?.prop?.ready ?? Promise.resolve());
          if (!ww?.owned) api.standIn('the Windwall was not handed over');
          else {
            ww.want = true; ww.phase = 'guard'; ww.t = 0; ww.open = 1; ww.arm = 1;
            if (!ww.plant()) api.standIn(`the Windwall did not plant from ${ww.phase}`);
            const t0 = performance.now();
            while (ww.phase !== 'planted' && performance.now() - t0 < 3000) await api.sleep(50);
            // the plant's arm goes back (PLANT_BACK) before the Alidade's arm comes up
            await api.sleep(500);
            if (ww.phase !== 'planted') api.standIn(`the Windwall is ${ww.phase}, not planted`);
            else api.standIn(`the Windwall planted at (${ww.plantedAt.x.toFixed(1)}, ${ww.plantedAt.z.toFixed(1)}), heading ${(ww.plantedAt.heading * 180 / Math.PI).toFixed(1)} deg`);
          }
        } catch (e) { api.standIn(`the Windwall plant threw: ${e?.message || e}`); }
      } else api.standIn('no hero.grantOroKit in this build: no Windwall to plant');

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
          if (!rep.lookers.length) api.standIn('no Peg came to look (none could be stood up)');
          else api.standIn(`staged at 10 s: arc ${rep.arc} s, ${rep.taken} of 3 bearings, lookers ${JSON.stringify(rep.placed)}`);
        } catch (e) { api.standIn(`the re-survey staging threw: ${e?.message || e}`); }
      } else api.standIn('no re-survey in this build (src/game/hour.js stageResurvey)');

      // the Alidade raised (V): the animator's alidade overlay follows Sighting's `on` (playerAnimator.js OVERLAY 4b)
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
      const pad = (C.props?.survey?.benchmarks || C.survey?.benchmarks || []).find?.((b) => b.id === 'bm-01');
      api.standIn(pad ? `bm-01's pad at (${pad.x.toFixed(1)}, ${pad.z.toFixed(1)}); she stands on the bible's point` : "B1's pad not found on ctx.props.survey: she stands on the bible's point");
    },
    async beforeFreeze(f, api) {
      const C = api.C, p = C.player, an = p?.animator, S = C.sighting;
      // the Alidade at her face: Sighting still on, and the overlay's weight up (rate 14/s: 0.3 s from down to up)
      if (S && !S.on) { api.standIn('Sighting was off before the freeze: raised again'); S.toggle(true); }
      const t0 = performance.now();
      while ((an?._ali?.w ?? 1) < 0.97 && performance.now() - t0 < 1500) await api.sleep(50);
      // Sighting's card (the read of whatever its crosshair rests on) is page chrome too: hidden for the frame
      const card = S?._card;
      if (card) { const d = card.style.display; card.style.display = 'none'; api.undo(() => { card.style.display = d; }); }
      const ali = an?.debugAlidade?.() ?? null;
      api.standIn(`before the freeze: Sighting ${S?.on ? 'on' : 'off'}, alidade weight ${an?._ali ? an._ali.w.toFixed(3) : 'none'}, aiming ${!!p?.aiming}, stance ${C.combat?.melee?.stance ?? '-'}, tube to eye ${ali?.tubeToEye ?? '?'}; her fade ${p?.fade}, Windwall ${C.combat?.windwall?.phase ?? '-'}`);
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
