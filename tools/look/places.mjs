/**
 * THE LOOK PLACES (lane look-post, L-00; docs/ROUND5-LOOK.md §3.1 L-00).
 *
 * The contract is world-props' `ctx.props.gatePlaces.look.<name>` (plan §3.2
 * `ctx.props.gatePlaces`, ROUND5-LOOK §5.2: a day-1 stub, real by its W1
 * exit). Each record: `{ x, z, hour, sunRel, pitch, weather, cam, dist, note }`
 *   x, z      where the hero stands
 *   hour      the frozen hour (16.5 = 16:30)
 *   sunRel    camera yaw relative to the sun's bearing, degrees (0 = facing the sun,
 *             180 = the sun behind the camera); the look is graded against light, so a
 *             place is defined against the sun, not a compass bearing
 *   pitch     camera pitch (player.camPitch)
 *   weather   environment weather name (trade weather until world-sky ships its names)
 *   cam       'chase' (the player camera) | 'close' (0.8 m from her face, 3/4) | 'over' (over the shoulder)
 *   dist      'close' only: camera distance to the head, metres
 *
 * Until world-props publishes `gatePlaces.look`, the gates stage these STAND-INS on whatever
 * map the tree runs: each names a base place from tools/gate-places.mjs (resolved by the
 * PLACES prelude: ctx.props.gatePlaces, else the W0 map table) and adds the light. Every
 * frame staged from a stand-in says so (`source: 'stand-in'`); it is never the place the
 * panel describes (no Ring, no cliff over the sea on the W0 map), so likeness rows filmed on
 * stand-ins grade light and palette only.
 */
export const LOOK_PLACE_NAMES = ['field', 'vista', 'aim', 'close', 'dusk', 'pansInland', 'pansSunset', 'meadow', 'beach',
  'title', 'saltrowDusk', 'craterWall', 'steepFace', 'reed', 'brazier'];

/** The five W1 places A-look-frame-stats grades, and their panels. */
export const LOOK_CORE = { field: '1-TR', vista: '1-MR', aim: '1-BL', close: '1-MC', dusk: '2-MR' };

export const LOOK_STANDINS = {
  field: { base: 'grassSite', hour: 16.5, sunRel: 35, pitch: 0.02, weather: 'clear', cam: 'chase',
    note: 'stand-in: behind Brea in grass, the sun 35 deg off the lens axis ahead (1-TR)' },
  vista: { base: 'midgroundVista', hour: 19.0, sunRel: 8, pitch: 0.0, weather: 'clear', cam: 'chase',
    note: 'stand-in: a rise facing the low sun (1-MR); no sea or Ring on this map' },
  aim: { base: 'rangeGround', hour: 17.75, sunRel: 25, pitch: 0.0, weather: 'clear', cam: 'over',
    note: 'stand-in: over the shoulder toward the sun-side (1-BL, 5-2)' },
  // fix round 2: heroRel turns Brea so the sun keys her face. With sunRel 120 and no heroRel she faced 120 deg away
  // from the sun and the close camera (35 deg off her nose) saw the back-lit side (the judge's 'almost black' face);
  // her nose now points 55 deg off the sun, the camera sits 35 deg off her nose on the same side, so the sun lights
  // the 3/4 face from 20 deg beyond the lens and the far cheek is the readable shadow side (1-MC)
  close: { base: 'openGround', hour: 18.75, sunRel: 120, heroRel: -175, pitch: 0.0, weather: 'clear', cam: 'close', dist: 0.8,
    note: 'stand-in: 0.8 m, 3/4 face, the sun to camera side (1-MC): her nose 55 deg off the sun, the lens 35 deg off her nose' },
  dusk: { base: 'grassSite', hour: 19.75, sunRel: 60, pitch: 0.03, weather: 'clear', cam: 'chase',
    note: 'stand-in: grass at 19:45 (2-MR)' },
};

/**
 * 12 seeded random poses for A-look-random / V-look-random: hours 16:30-19:45, 20-200 m from
 * any gate place, yaw uniform against the sun. Deterministic (mulberry32, seed 0xCA1A).
 */
export function randomPoses(seed = 0xCA1A, n = 12) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ i, hour: +(16.5 + rnd() * 3.25).toFixed(3), dist: +(20 + rnd() * 180).toFixed(1), bearing: +(rnd() * 360).toFixed(1),
      sunRel: +(rnd() * 360 - 180).toFixed(1), pitch: +(0.06 - rnd() * 0.08).toFixed(3), from: i });
  }
  return out;
}
