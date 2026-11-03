/**
 * ISLAND SITES — every authored coordinate of Orchil, and the one place the rest
 * point lives (Round 5, plan §3.2, bible §8.4). Owned by world-ground from W1.
 *
 *   FRAME   the bible writes (E, N) in metres from the island's centre; the engine
 *           is x = E, z = −N. Everything exported in the engine frame carries x, z;
 *           the raw table keeps e, n so the bible stays greppable.
 *   SCALE   authored at 1024 m and multiplied by ISLAND_SCALE, so the 860 m and 720 m
 *           fallbacks are one number (extent.js).
 *
 *   REST       where the player spawns and where "respawn at rest" puts her: Brea's
 *              cistern at Saltrow (A-single-rest)
 *   REST_SITE  the same cistern as a settlement record: its centre and `r`, the radius
 *              of the Instrument no-spawn ring (machines/index.js + machine.js keep out)
 *   SITES      every named site { id, name, e, n, x, z, h, biome, land }
 *   TRIG       the six trig pillars and SIGHT_PAIRS, the rays that must stay open
 *   SCAR       the Screed Scar's straight line and width
 *   TUBES      tube trench polylines (`terrain.trench(id)`; carved at W3, plan §3.2)
 *   GROUND     named ground features this lane authored into the heightfield, for
 *              ctx.props.gatePlaces (world-props) and the world-ground gates
 *
 * Plain frozen data, importing only extent.js: safe from any module, worker or node.
 */
import { ISLAND_SCALE as S } from './extent.js';

const site = (id, name, e, n, h, biome, extra = {}) => Object.freeze({
  id, name, e, n, x: e * S, z: -n * S, h, biome, land: true, ...extra,
});

/** Bible §8.4. `h` is the stated height: A-world-size holds the terrain to it ±3 m. */
export const SITES = Object.freeze([
  site('saltrow', 'Saltrow', -267, -229, 3, 'pans'),
  site('salt-pans', 'salt pans', -320, -293, 1, 'pans'),
  site('the-glass', 'the Glass', -384, -176, 0.5, 'pans'),
  site('organ-shelf', 'Organ Shelf', -219, -341, 1, 'pans'),
  site('sounding-ring', 'Sounding Ring', -347, -320, 0.5, 'pans'),
  site('black-sand-beach', 'black-sand beach', -187, -411, 0.5, 'pans'),
  site('ninewalls', 'Ninewalls', -11, -213, 71, 'holds'),
  site('the-boilers', 'the Boilers', -368, -59, 2, 'flank'),
  site('roques', 'Roques', -43, 101, 207, 'caldera'),
  site('jameo', 'Jameo', 112, -160, 103, 'holds'),
  site('kiln-yards', 'Kiln Yards', 219, -27, 142, 'malpais'),
  site('rust-cone', 'Rust Cone', 283, -101, 145, 'malpais'),
  site('hornito-field', 'hornito field', 272, -187, 16, 'malpais'),
  site('mistfold', 'Mistfold', 240, 261, 66, 'cloudline'),
  site('fog-harp', 'Fog Harp', 176, 229, 92, 'cloudline'),
  site('pinned-cliff', 'Pinned Cliff', -183, 103, 44, 'flank'),
  site('leveler-muster', 'Leveler Muster', -283, 160, 5, 'flank'),
  site('calibration-yard', 'Calibration Yard', 16, 37, 222, 'caldera'),
  site('the-fundamental', 'the Fundamental', 128, 144, 233, 'caldera'),
]);

const byId = Object.fromEntries(SITES.map((s) => [s.id, s]));
/** A site record by id (null when unknown). */
export const siteById = (id) => byId[id] || null;

/**
 * Brea's cistern: at Saltrow's seaward edge, where her house meets the pans
 * (bible §8.6). The single spawn / respawn / rest constant.
 */
export const CISTERN = Object.freeze({ e: -284, n: -247, x: -284 * S, z: 247 * S });

/** Spawn point: one pace north of the cistern's centre, ±1 m of it (A-single-rest). */
export const REST = Object.freeze({ x: CISTERN.x + 0.6, z: CISTERN.z - 0.7 });

export const REST_SITE = Object.freeze({ x: CISTERN.x, z: CISTERN.z, r: 25 * S });

/** Bible §8.4 trig pillars. `h` is the terrain height the recipe sets under the pillar. */
export const TRIG = Object.freeze([
  site('T1', 'Organ Shelf', -187, -357, 9.5, 'pans'),
  site('T2', 'Ninewalls Rise', 75, -267, 86, 'holds'),
  site('T3', 'Rust Cone', 283, -101, 145, 'malpais'),
  site('T4', 'Cloudline Ridge', 64, 320, 214, 'cloudline'),
  site('T5', 'Flank Crest', -133, 165, 124, 'flank'),
  site('T6', 'West Rim', -75, 48, 234, 'caldera'),
]);

/** A trig pillar's top above its ground (bible §8.5: a 4 m cylinder). */
export const TRIG_TOP = 4;

/** Bible §8.4: the rays A-trig-pillars tests against terrain and colliders. */
export const SIGHT_PAIRS = Object.freeze([
  ['T1', 'T2'], ['T1', 'T6'], ['T2', 'T3'], ['T2', 'T6'], ['T3', 'T4'],
  ['T3', 'T6'], ['T4', 'T5'], ['T4', 'T6'], ['T5', 'T6'], ['T5', 'T1'],
]);

/** Bible §8.3: the Screed Scar, straight, 25 m wide, ≈ 480 m (full treatment at W2). */
export const SCAR = Object.freeze({
  a: Object.freeze({ x: 251 * S, z: 43 * S }),
  b: Object.freeze({ x: -91 * S, z: 384 * S }),
  width: 25 * S,
});

/**
 * Tube trench polylines (bible §8.7). Published at W1 exit for world-props; the
 * trenches are carved at W3 (`A-trench`), the shells are world-props' (W3/W4).
 */
export const TUBES = Object.freeze({
  'ninewalls-jameo': Object.freeze([[-11, -213], [30, -200], [72, -178], [112, -160]]
    .map(([e, n]) => Object.freeze({ x: e * S, z: -n * S }))),
  'malpais-tube': Object.freeze([[300, -30], [335, -10], [372, 22]]
    .map(([e, n]) => Object.freeze({ x: e * S, z: -n * S }))),
  'the-boilers': Object.freeze([[-368, -59], [-395, -52], [-420, -44]]
    .map(([e, n]) => Object.freeze({ x: e * S, z: -n * S }))),
});

/**
 * The salt field's frame: `u` runs along the coast toward the black-sand beach, `v`
 * inland toward Saltrow. Authored here so settlements (the pumps) and world-props read
 * the same grid the ground is cut to.
 */
export const SALT_FIELD = Object.freeze({
  e: -318, n: -290, x: -318 * S, z: 290 * S,
  ue: 0.78, un: -0.626, ve: 0.626, vn: 0.78,
  uMin: -118, uMax: 96, vMin: -28, vMax: 84,
});

/**
 * Named ground this lane authored into the heightfield (measured on the bake): the
 * place table ctx.props.gatePlaces starts from. world-props owns gatePlaces (W1); until
 * it is merged the world-ground gates fall back to this, and it can adopt any row as is.
 * yaw is `player.camYaw`: camYaw π faces +z.
 */
export const GROUND = Object.freeze({
  openGround: Object.freeze({ x: -164, z: 260, yaw: Math.PI, note: 'flat Pans strip, ±0.06 m over 70 m along +z' }),
  runway: Object.freeze({ x: -164, z: 260, yaw: Math.PI, len: 50, note: 'the same strip, facing +z' }),
  fightGround: Object.freeze({ x: -164, z: 258, yaw: Math.PI, pitch: 0.05, note: 'flat ground with room for an 8-machine arc' }),
  duelGround: Object.freeze({ x: -158, z: 262, note: 'flat clear ground' }),
  impactGround: Object.freeze({ x: -170, z: 266, note: 'flat clear ground, the impact/carry film spot' }),
  rangeGround: Object.freeze({ x: -164, z: 236, note: 'flat ground with 55 m of open sight line along +z' }),
  herdSite: Object.freeze({ x: -170, z: 256, note: 'open Pans ground for a herd' }),
  steepFace: Object.freeze({ x: -14, z: -380, note: 'north-coast scarp, ≈ 55 deg' }),
  hillside38: Object.freeze({ x: -212, z: -296, note: 'flank slope, ≈ 39 deg, uniform over 12 m' }),
  slope10: Object.freeze({ x: -308, z: -194, note: 'uniform ≈ 9 deg face' }),
  slope20: Object.freeze({ x: -290, z: -224, note: 'uniform ≈ 21 deg face' }),
  slope30: Object.freeze({ x: -272, z: -272, note: 'uniform ≈ 29 deg face' }),
  parkAway: Object.freeze({ x: -120, z: 230, note: 'open ground far from the Pans frames' }),
  rockShelf: Object.freeze({ x: -170, z: 352, note: 'the Organ Shelf table' }),
  waterFeature: Object.freeze({ x: -340, z: 208, yaw: 4.2, pitch: 0.12, note: 'the Glass, framed from its landward shore' }),
  vistas: Object.freeze({
    pans: Object.freeze({ x: -238, z: 196, y: 16.5, look: Object.freeze({ x: -340, y: -9, z: 330 }), fov: 50,
      note: 'from Saltrow\'s rise: salt grid below, the Ring and the surf beyond' }),
  }),
});
