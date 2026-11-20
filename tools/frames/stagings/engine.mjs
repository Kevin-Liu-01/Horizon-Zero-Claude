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
/* M2 fix wave (F45 "lensed so the rim and the Yards read"): the chase lens looks UP the slope (camPitch < 0 looks up). At
 * pitch 16 it looked down on her from behind (fa45e47): the slope filled the frame, the rim ran along its top edge and
 * the Yards' towers were cut by it. At -8 the rim crosses the upper middle (22 deg up at 93 m on the bearing) and the
 * Yards (17-30 deg up at 103 m, bearing 57) stand whole on the sky over it, with the Transit's mark (bearing 36) left.
 * F45-trade keeps this lens: it is HG6's read of the Yards from the edge (towers, stacks and the wellheads' glow face
 * the Holds), and the Malpais edge as the Holds see it */
const LENS = { mode: 'chase', pitch: -8, fov: 55 };
/* POLISH (frames lane): F45 looks OUT OVER THE RIM to the Kiln Yards and the calima sun's disc, not into the slope.
 * From the beat's anchor the Yards stand on bearing 57 and the noon sun on 166 (environment.js: 70 + f x 220 deg, 49 deg
 * up): 109 deg apart, so no lens there holds both, and at 02f7125 the -8 deg lens still looked into the slope with no
 * disc in frame. The lens stands on the Malpais shelf 59 m north of the Yards instead (bible E 216, N 32; ground 149 m,
 * found in Node on recipe.js heightAt: the shelf runs level to the rim 50 m south, then falls; from there the two tower
 * stubs and the stacks' heads rise over the rim on bearings 160-194, 6 deg under to 19 deg over the level, and the disc
 * stands on 166 at 49 deg). Brea faces the rim on bearing 174 and the play camera looks up past her (chase, pitch -24,
 * fov 62): she stands between the two tower stubs at the frame's foot, the stacks' heads behind her, the disc above.
 * Two orbit lenses (7.5 m and 4.5 m behind her, turned 27 deg up) drew her see-through with her dither at 1 (runs
 * 20261120T000919Z-4e451a2-polish-x1-partial, 20261120T013206Z-4e451a2-polish-x3-partial); the chase lens draws her
 * whole. The disc reads 201.5 at its centre against the dust's 166.6 at 5-8 deg (x3, the probe below) */
const RIM = { en: [216, 32] };
const RIM_LENS = { mode: 'chase', pitch: -24, fov: 62 };
const STATE = { pose: 'idle', hud: false, actors: [{ type: 'instrument', kind: 'plumb', dist: 30, side: 180, face: 'brea' }] };

/** @type {object[]} frameset.json-shaped frame definitions, `in: 'M2'` */
export const frames = [
  {
    id: 'F45', subject: 'calima at noon at the Malpais edge: over the rim to the Kiln Yards and the sun', in: 'M2', hour: 12, weather: 'calima',
    at: RIM, bearing: 174, camera: RIM_LENS, state: STATE,
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
    // an orbit lens replaces the play camera's update (page.mjs ownLens), so her occlusion fade stays at whatever the last
    // play-camera frame left: the first film of the rim lens drew her screen-door dithered. Set back to fully drawn, as
    // tools/frames/stagings/instruments.mjs `unfade` does for the line-up
    beforeFreeze(f, api) {
      const p = api.C.player;
      if (!p) return;
      const m0 = p._mats?.[0];
      api.standIn(`her dither before the freeze: fade ${p.fade}, cur ${p._fadeCur}, applied ${p._fadeApplied}, uniform ${m0?.u?.value ?? '?'}, mats ${p._mats?.length ?? 0}`);
      if ((p._fadeCur ?? 1) < 0.999 || (p.fade ?? 1) < 0.999 || p._fadeApplied !== 1) {
        api.standIn(`her fade ${p.fade ?? '?'} (${p._fadeCur ?? '?'}) set back to 1`);
        p.fade = 1; p._fadeCur = 1; p._fadeApplied = -1;
        try { p._applyFade(1 / 60, performance.now() / 1000); } catch (e) { api.standIn(`hero fade not reset: ${e.message}`); }
      }
    },
  },
};
