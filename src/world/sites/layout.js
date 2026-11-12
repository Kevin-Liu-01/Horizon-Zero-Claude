/**
 * WORLD-PROPS LAYOUT — where every Round-5 prop of the W1 slice stands (lane
 * world-props, plan §2: "W1: Sounding Ring, Organ Shelf clusters, wind pumps,
 * red crater, all 6 trig pillars + 12 benchmark pads, ctx.props.gatePlaces,
 * static scripted Gauge"; R66 m: six offshore stacks, a sea arch, one Roque
 * plug).
 *
 * Every SITE coordinate is read from world-ground's `src/world/island/sites.js`
 * (SITES, TRIG, SALT_FIELD, GROUND): this file never restates one. What lives
 * here is what world-props authors itself, all in the engine frame (x = E,
 * z = -N) and all relative to a site where there is one:
 *   - the pumps in the salt field's own (u, v) frame,
 *   - the benchmarks (bible §8.5 names twelve and places none) by region,
 *   - the Organ Shelf's eleven column clusters,
 *   - the stacks, the arch and the plug by bearing and range from the island's
 *     centre (look spec W-04: 520-900 m out on bearings 200-300, beyond
 *     PLAY_RADIUS + 20 m),
 *   - the static Gauge at Sluice 3.
 * Heights are never stored: the runtime snaps everything to `terrain.getHeight`
 * (or to the sea for the stacks), so a re-baked island moves nothing by hand.
 *
 * The island this was authored on is world-ground's W1 bake (its tree, commit
 * 0083ab8). On a tree that still carries the W0 stub `sites.js` (no TRIG, no
 * SALT_FIELD) `SITES_OK` is false and the bible's own table (§8.4, at 1024 m)
 * stands in, so nothing crashes; the gates then report the island as missing.
 */
import * as Island from '../island/sites.js';

/** The island scale (world-ground's ISLAND_SCALE through its site records), 1 on the stub. */
const S = (() => {
  const s = Island.SITES?.find?.((r) => r.id === 'saltrow');
  return s && s.e ? s.x / s.e : 1;
})();

/** Bible §8.4 at 1024 m (E, N), used only when sites.js does not publish its tables. */
const BIBLE_SITES = {
  saltrow: [-267, -229, 3], 'salt-pans': [-320, -293, 1], 'the-glass': [-384, -176, 0.5], 'organ-shelf': [-219, -341, 1],
  'sounding-ring': [-347, -320, 0.5], 'black-sand-beach': [-187, -411, 0.5], ninewalls: [-11, -213, 71], 'the-boilers': [-368, -59, 2],
  roques: [-43, 101, 207], jameo: [112, -160, 103], 'kiln-yards': [219, -27, 142], 'rust-cone': [283, -101, 145],
  'hornito-field': [272, -187, 16], mistfold: [240, 261, 66], 'fog-harp': [176, 229, 92], 'pinned-cliff': [-183, 103, 44],
  'leveler-muster': [-283, 160, 5], 'calibration-yard': [16, 37, 222], 'the-fundamental': [128, 144, 233],
};
const BIBLE_TRIG = [
  ['T1', 'Organ Shelf', -187, -357], ['T2', 'Ninewalls Rise', 75, -267], ['T3', 'Rust Cone', 283, -101],
  ['T4', 'Cloudline Ridge', 64, 320], ['T5', 'Flank Crest', -133, 165], ['T6', 'West Rim', -75, 48],
];
const BIBLE_PAIRS = [['T1', 'T2'], ['T1', 'T6'], ['T2', 'T3'], ['T2', 'T6'], ['T3', 'T4'], ['T3', 'T6'], ['T4', 'T5'], ['T4', 'T6'], ['T5', 'T6'], ['T5', 'T1']];

/** True when world-ground's island tables are in this tree (the W1 island). */
export const SITES_OK = Array.isArray(Island.TRIG) && !!Island.SALT_FIELD;

export function site(id) {
  const r = Island.siteById?.(id);
  if (r) return r;
  const b = BIBLE_SITES[id];
  return b ? { id, name: id, e: b[0], n: b[1], x: b[0] * S, z: -b[1] * S, h: b[2], land: true } : null;
}

export const TRIG = SITES_OK ? Island.TRIG
  : BIBLE_TRIG.map(([id, name, e, n]) => ({ id, name, e, n, x: e * S, z: -n * S }));
export const TRIG_TOP = Island.TRIG_TOP ?? 4;
export const SIGHT_PAIRS = Island.SIGHT_PAIRS ?? BIBLE_PAIRS;
export const REST = Island.REST;
export const GROUND = Island.GROUND ?? null;

const SF = Island.SALT_FIELD ?? { e: -318, n: -290, ue: 0.78, un: -0.626, ve: 0.626, vn: 0.78 };
/** Salt-field frame (u along the coast toward the black-sand beach, v inland) -> engine x, z. */
export function fieldPoint(u, v) {
  return { x: (SF.e + u * SF.ue + v * SF.ve) * S, z: -(SF.n + u * SF.un + v * SF.vn) * S };
}

const D2R = Math.PI / 180;
/** Compass bearing (deg, 0 = N, 90 = E) and range from the island's centre -> engine x, z. */
export function polar(bearingDeg, range) {
  return { x: Math.sin(bearingDeg * D2R) * range * S, z: -Math.cos(bearingDeg * D2R) * range * S };
}

/* ------------------------------------------------------------------ the Ring */
/**
 * The Ring stands on its site; its face normal (+Z of the recipe) is turned to
 * bearing 100 (E by S), between T1's deck (077 from the Ring) and the
 * black-sand beach where look.pansInland stands (122), so both see it open
 * with the western sea and the low sun through it; it leans back toward the
 * sea. (At 072 the beach saw it 50 deg side-on and it read as fallen.)
 */
export const RING = { site: 'sounding-ring', faceBearing: 100 };

/* ---------------------------------------------------------------- the pumps */
/** Three pumps (bible §8.6): two on the seaward berm at the intake, one by the landward reservoir. */
export const PUMPS = [
  { id: 'pump-intake-a', u: -50, v: -32, yawBearing: 225 },
  { id: 'pump-intake-b', u: 70, v: -30, yawBearing: 230 },
  { id: 'pump-reservoir', u: -80, v: 92, yawBearing: 220 },
];

/* ---------------------------------------------------------- the static Gauge */
/** Sluice 3: the brine cell at the field's seaward side, in its (u, v) frame. */
export const GAUGE = { id: 'gauge-sluice-3', u: -40, v: -6, nozzleBearing: 140, sluice: 3, tide: 0.4, trigger: 26 };

/* ---------------------------------------------------------- the Organ Shelf */
/**
 * Eleven column clusters along the Shelf's flow front and on its table (bible
 * §8.3 "11 hex clusters"; W-05: columns 0.6-1.4 m across stepping 2-14 m, read
 * as pipes from 150 m). `x, z` the cluster's centre, `r` its radius, `top` its
 * tallest column above the local ground, `face` the bearing it faces out.
 */
export const ORGAN = [
  { id: 'organ-1', x: -224, z: 362, r: 3.4, top: 9, face: 250 },
  { id: 'organ-2', x: -212, z: 338, r: 4.0, top: 12, face: 300 },
  { id: 'organ-3', x: -206, z: 381, r: 3.0, top: 7, face: 220 },
  { id: 'organ-4', x: -178, z: 388, r: 3.8, top: 11, face: 190 },
  { id: 'organ-5', x: -170, z: 410, r: 2.8, top: 6, face: 175 },
  { id: 'organ-6', x: -148, z: 401, r: 4.2, top: 14, face: 165 },
  { id: 'organ-7', x: -140, z: 320, r: 3.6, top: 10, face: 20 },
  { id: 'organ-8', x: -122, z: 327, r: 3.0, top: 8, face: 40 },
  { id: 'organ-9', x: -110, z: 380, r: 4.0, top: 13, face: 120 },
  { id: 'organ-10', x: -98, z: 344, r: 3.0, top: 7, face: 80 },
  { id: 'organ-11', x: -160, z: 356, r: 2.6, top: 4, face: 0 },
];

/* ---------------------------------------------------------- the red crater */
/**
 * The red tuff ring over the Glass is world-ground's landform (El Golfo); what
 * world-props adds is its rock: tuff blocks on the talus apron and the benches,
 * and stratified buttress outcrops at the cliff foot. `centre` / `rx` / `rz` is
 * the ring's plan ellipse (the landform recipe's CRATER), the high wall N by W.
 */
export const CRATER = { id: 'red-crater', centre: { e: -388, n: -160 }, rx: 108, rz: 72, wallBearing: 340, landmark: { x: -388, z: 84 } };

/* --------------------------------------------------------------- benchmarks */
/**
 * Twelve benchmarks, two per biome, each a region the re-survey makes true
 * ground (`ctx.datum.setTrue(region)`, progression W3). `x, z` is where to look;
 * the runtime sets the pad on the flattest ground within `r` of it. bm-01 is the
 * first hour's Benchmark 1, on the Scar's line below Ninewalls (bible §8.9).
 */
export const BENCHMARKS = [
  { id: 'bm-01', name: 'Benchmark 1 (Ninewalls)', region: 'ninewalls', biome: 'holds', x: 19, z: 243, r: 14 },
  { id: 'bm-02', name: 'Jameo benchmark', region: 'jameo', biome: 'holds', x: 87, z: 147, r: 14 },
  { id: 'bm-03', name: 'Beach benchmark', region: 'black-sand-beach', biome: 'pans', x: -211, z: 397, r: 5 },
  { id: 'bm-04', name: 'Glass benchmark', region: 'the-glass', biome: 'pans', x: -365, z: 140, r: 5 },
  { id: 'bm-05', name: 'Kiln Yards benchmark', region: 'kiln-yards', biome: 'malpais', x: 204, z: 3, r: 14 },
  { id: 'bm-06', name: 'Hornito benchmark', region: 'hornito-field', biome: 'malpais', x: 296, z: 201, r: 14 },
  { id: 'bm-07', name: 'Mistfold benchmark', region: 'mistfold', biome: 'cloudline', x: 212, z: -260, r: 14 },
  { id: 'bm-08', name: 'Cloudline benchmark', region: 'fog-harp', biome: 'cloudline', x: 120, z: -215, r: 14 },
  { id: 'bm-09', name: 'Pinned Cliff benchmark', region: 'pinned-cliff', biome: 'flank', x: -205, z: -100, r: 14 },
  { id: 'bm-10', name: 'Muster benchmark', region: 'leveler-muster', biome: 'flank', x: -307, z: -146, r: 14 },
  { id: 'bm-11', name: 'Calibration benchmark', region: 'calibration-yard', biome: 'caldera', x: -12, z: -36, r: 14 },
  { id: 'bm-12', name: 'Fundamental benchmark', region: 'the-fundamental', biome: 'caldera', x: 100, z: -143, r: 14 },
];

/* ------------------------------------------------------------- the skyline */
/**
 * W-04: six stacks and one arch 520-900 m out on bearings 200-300 (all beyond
 * PLAY_RADIUS + 20 m, no colliders), staggered at four ranges; S2 and S3 stand
 * in the glitter column seen from T1 toward the 18:45 sun (WNW). Heights vary
 * 20-48 m (CV 0.30). From Saltrow they hold its S, SW and W bearings.
 */
export const STACKS = [
  { id: 'stack-1', kind: 'stack-a', bearing: 228, range: 540, height: 34, yaw: 0.4 },
  { id: 'stack-2', kind: 'stack-c', bearing: 249, range: 735, height: 26, yaw: 2.1 },
  { id: 'stack-3', kind: 'stack-b', bearing: 256, range: 640, height: 48, yaw: 1.2 },
  { id: 'stack-4', kind: 'stack-a', bearing: 212, range: 600, height: 44, yaw: 3.6 },
  { id: 'stack-5', kind: 'stack-c', bearing: 272, range: 690, height: 20, yaw: 5.0 },
  { id: 'stack-6', kind: 'stack-b', bearing: 292, range: 860, height: 38, yaw: 0.9 },
  { id: 'sea-arch', kind: 'sea-arch', bearing: 236, range: 700, height: 31, yaw: 0.35 },
];

/**
 * The Roque plug (R66 m: 55-60 m, on the caldera's west rim) and its 28 m
 * companion needle, on the rim's south-west shoulder 50-65 m from T6. Chosen
 * (offline search on world-ground's bake) as the rim ground the Pans see whole:
 * from the black-sand beach the plug stands ~55 m clear above the rim line
 * behind it (>= 105 px at the look.pansInland camera); both stay >= 17 m off
 * every one of the ten sight rays (A-trig-pillars tests them). On the crest
 * north of T6 the Flank hid all but the top 18 m from the Pans.
 */
export const ROQUES = [
  { id: 'roque-plug', kind: 'roque-plug', x: -28, z: 1, height: 58, yaw: 0.3 },
  { id: 'roque-needle', kind: 'roque-needle', x: -40, z: -14, height: 28, yaw: 1.7 },
];

/** The bearing sectors A-landmark-bearing grades, and its stations (W1: Saltrow). */
export const BEARING_STATIONS = { saltrow: 'saltrow', ninewalls: 'ninewalls', calibrationYard: 'calibration-yard' };
