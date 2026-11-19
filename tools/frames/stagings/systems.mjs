/**
 * Area E's Milestone 2 frames and their stagings (systems): F44 the re-survey at Benchmark 1, F46 the TRADE screen;
 * F35 (with settlements) and F38 (with instruments) are staged in those lanes' files. Contract: ./index.mjs.
 *
 * F44 at BLOCKOUT (wave 1): Brea on the bible's Benchmark 1 (E 12, N -282, on the Scar's line, 70 m south of
 * Ninewalls) at 11:00 in trade weather, the Alidade raised toward T1 (the first bearing, 249 deg), the lens behind her
 * right shoulder (uphill, toward Ninewalls) looking down the Scar's line (225 deg) to the sea, so her raised Alidade,
 * T1's bearing and the Scar running to the horizon are in frame. (The first blockout lens, three-quarter front at
 * yawRel 40, looked into Ninewalls' outermost wall 5 m behind B1 and showed no horizon: run
 * 20261119T111714Z-0ffc4e3-systems-w1-f44-partial.) Its written target's other pieces do not exist yet and are named as stand-ins: the planted Windwall
 * (area D), the approaching Instrument (the re-survey's "come to look", wave 3), the three bearing pips and the 15 s
 * arc (the re-survey's card, wave 3), B1's pad (area A). Staged on the wall clock: the Alidade's raise is a held pose,
 * nothing in frame moves but the wind; rule 2 puts F44 on simulation time when the hold is built (frozen at 10 s).
 * F46 needs the TRADE screen (wave 4): not staged.
 */
export const lane = 'systems';

/** @type {object[]} frameset.json-shaped frame definitions, `in: 'M2'` */
export const frames = [
  {
    id: 'F44', subject: 'the re-survey at Benchmark 1 (blockout)', in: 'M2', hour: 11, weather: 'trade',
    at: { en: [12, -282] }, bearing: 249,
    camera: { mode: 'orbit', yawRel: 150, dist: 4.2, height: 2.3, target: { fwd: 6, side: 0, up: 1.2 }, fov: 50, lookAt: 'off' },
    state: { pose: 'idle', hud: false },
    ref: { written: 'the Alidade up in front of her face, the planted Windwall between her and one approaching Instrument, three bearing pips, the 15 s arc; the Scar running to the horizon' },
    note: 'wave 1 blockout: her pose at the mark and the ground around B1 only; the Windwall, the Instrument, the pips and the arc are stand-ins (see run.json standIns)',
  },
];

export const STAGED = { F44: 'wall' };

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
      api.standIn('no planted Windwall in this build (area D, wave 2)');
      api.standIn('no Instrument coming to look (the re-survey, wave 3)');
      api.standIn('no bearing pips and no 15 s arc (the re-survey card, wave 3)');
      const pad = (C.props?.survey?.benchmarks || C.survey?.benchmarks || []).find?.((b) => b.id === 'bm-01');
      api.standIn(pad ? `bm-01's pad at (${pad.x.toFixed(1)}, ${pad.z.toFixed(1)}); she stands on the bible's point` : "B1's pad not found on ctx.props.survey: she stands on the bible's point");
    },
  },
};
