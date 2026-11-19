/**
 * Area E's Milestone 2 frames and their stagings (systems): F44 the re-survey at Benchmark 1, F46 the TRADE screen;
 * F35 (with settlements) and F38 (with instruments) are staged in those lanes' files. Contract: ./index.mjs.
 *
 * F44 at BLOCKOUT (wave 1): Brea on the bible's Benchmark 1 (E 12, N -282, on the Scar's line, 70 m south of
 * Ninewalls) at 11:00 in trade weather, the Alidade raised toward T1 (the first bearing, 249 deg), a three-quarter front
 * lens so her face, the raised Alidade and the ground behind her (T2's rise and the Scar's line up toward Ninewalls)
 * are in frame. Its written target's other pieces do not exist yet and are named as stand-ins: the planted Windwall
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
    camera: { mode: 'orbit', yawRel: 40, dist: 3.4, height: 1.75, target: { fwd: 0.3, side: 0, up: 1.45 }, fov: 46, lookAt: 'off' },
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
      } else api.standIn('no Sighting in this build: the Alidade is not raised');
      api.standIn('no planted Windwall in this build (area D, wave 2)');
      api.standIn('no Instrument coming to look (the re-survey, wave 3)');
      api.standIn('no bearing pips and no 15 s arc (the re-survey card, wave 3)');
      if (!C.props?.benchmarks?.length && !C.props?.gatePlaces?.benchmarks) api.standIn("no benchmark pad at B1 in this build (area A): she stands on the bible's point");
    },
  },
};
