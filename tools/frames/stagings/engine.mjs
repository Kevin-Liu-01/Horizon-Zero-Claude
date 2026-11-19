/**
 * Area F's Milestone 2 frames and their stagings (engine, sky-look): F45 calima at noon at the Malpais edge.
 * Contract: ./index.mjs.
 *
 * M2 WAVE 4 (THE HOUR). Brea stands where "True Ground"'s last beat puts her (src/game/hour.js _malpaisEdge: the Malpais
 * edge nearest Ninewalls, (116.8, 97.9) engine, 172 m from the village on a bearing of 48 deg, and 22 m inside it on the
 * same bearing: (133.2, 83.2), ground 106.7 m), looking on along that bearing, where the beat stands what walks on the
 * rim 93 m ahead of her. Fixed camera at 12:00, calima snapped (fade 0); a
 * Plumb stands 30 m behind the lens (out of frame) so the probe reads a live Instrument's sight in the dust.
 *   F45        calima at noon: measured by tools/world/calima-noon-probe-page.mjs (film.mjs --probe): visibility
 *              (black cards, 5 % contrast, band 120-180 m), the sun's disc and halo with the lens turned onto it, the
 *              sight multiplier on the live Plumb (x0.5), the sun's altitude (EN4), and HG5: the ground material's
 *              emissive and a night read of the same lens with only the ground drawn (no ground pixel over the sky).
 *   F45-trade  the same lens in trade weather at 12:00: the Malpais edge as it is seen from the Holds, the Kiln Yards'
 *              far form (HG6) and the cloud shadows on the ground (EN5).
 * Both are wall-clock frames with nothing moving but the wind, the cloud shadows (on the clock, frozen with it) and
 * the cloth: film them with --repeat 2.
 */
export const lane = 'engine';

const EDGE = { en: [133.2, -83.2] };
const LENS = { mode: 'chase', pitch: 6, fov: 55 };
const STATE = { pose: 'idle', hud: false, actors: [{ type: 'instrument', kind: 'plumb', dist: 30, side: 180, face: 'brea' }] };

/** @type {object[]} frameset.json-shaped frame definitions, `in: 'M2'` */
export const frames = [
  {
    id: 'F45', subject: 'calima at noon at the Malpais edge, from the Holds', in: 'M2', hour: 12, weather: 'calima',
    at: EDGE, bearing: 48, camera: LENS, state: STATE,
    ref: { crops: ['board-calima'], written: "the board's calima panel with its glowing ground masked; measured: visibility 120-180 m, the sun a disc under 3 deg with no halo past 6 deg, Instruments' sight x0.5 on a Plumb, 0 emissive terrain texels, sun altitude (EN4)" },
  },
  {
    id: 'F45-trade', subject: 'the Malpais edge from the Holds at noon, trade weather', in: 'M2', hour: 12, weather: 'trade',
    at: EDGE, bearing: 48, camera: LENS, state: { pose: 'idle', hud: false },
    ref: { written: 'cold aa and pahoehoe beyond the edge, no lava, no emissive ground; the Kiln Yards far off (two tower stubs, >= 3 flue stacks, only wellheads glow: HG6); the cloud shadows on the ground (EN5)' },
  },
];

export const STAGED = { F45: 'wall', 'F45-trade': 'wall' };

/** @type {Record<string, { world?: Function, beforeFreeze?: Function }>} in-page hooks per frame id */
export const stagings = {
  F45: {
    // the dust snapped in at noon (page.mjs sets the weather; a fade would still be running at the freeze)
    world(f, api) {
      const env = api.C.environment;
      if (env.weather !== 'calima' || env.weatherParams.calima < 0.999) { env.setWeather('calima', 0); }
      api.standIn(`calima weight ${env.weatherParams.calima.toFixed(3)}, sun altitude ${env.sunAltitudeDeg?.toFixed?.(1) ?? '?'} deg, perception ${env.perceptionScale}`);
    },
  },
};
