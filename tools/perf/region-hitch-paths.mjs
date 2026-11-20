/**
 * A-region-hitch's CROSSINGS (Milestone 3 rule 15, area F's EF1), as data both halves read: the page row
 * (tools/perf/region-hitch.mjs) carries her along them, and Node (region-hitch.test.mjs) sweeps the regions seam along
 * the same lines, so the page and the twin cross at the same metres (rule 21: the twin imports the game's own module).
 *
 * EF1's crossings are every border among the Pans, the Holds and the Malpais (the Pans and the Malpais do not touch: 0
 * shared cells on the regions seam's 4 m grid), so two borders, each crossed each way, at a JOG (5.0 m/s,
 * src/entities/player.js SPEEDS.jog) on the ground and at KITE SPEED (10 m/s, the brief's) 60 m over the ground:
 *   the Holds to the Malpais (the first hour's own walk to the Malpais edge, and M3's new crossing): both lines run
 *     toward the Kiln Yards; the walk keeps east of Ninewalls' walls, the flight passes over them;
 *   the Pans to the Holds (M2's crossing, debt D2's walk; added in fix round 1): the line from Saltrow to Ninewalls,
 *     the walk from Saltrow's east edge, the flight from 55 m out over the sea west of Saltrow.
 */
import { RegionTracker } from '../../src/core/regions.js';
import { siteById } from '../../src/world/island/sites.js';

const yards = siteById('kiln-yards');
const toward = (a, b, s) => { const L = Math.hypot(b.x - a.x, b.z - a.z); return { x: +(a.x + ((b.x - a.x) * s) / L).toFixed(2), z: +(a.z + ((b.z - a.z) * s) / L).toFixed(2) }; };

export const JOG_MS = 5.0;
export const KITE_MS = 10.0;
export const FLIGHT_AGL_M = 60;

const saltrow = siteById('saltrow'), ninewalls = siteById('ninewalls');
const along = (s) => toward(saltrow, ninewalls, s);

/** Each crossing: from `a` (in `from`, outside `to`'s approach for its mode) to `b` (inside `to`). */
export const CROSSINGS = Object.freeze([
  Object.freeze({ id: 'holds-malpais-jog', from: 'holds', to: 'malpais', mode: 'walk', speed: JOG_MS, agl: 0,
    a: Object.freeze({ x: 40, z: 250 }), b: Object.freeze(toward({ x: 40, z: 250 }, yards, 240)) }),
  Object.freeze({ id: 'holds-malpais-kite', from: 'holds', to: 'malpais', mode: 'flight', speed: KITE_MS, agl: FLIGHT_AGL_M,
    a: Object.freeze({ x: -60, z: 240 }), b: Object.freeze(toward({ x: -60, z: 240 }, yards, 320)) }),
  Object.freeze({ id: 'pans-holds-jog', from: 'pans', to: 'holds', mode: 'walk', speed: JOG_MS, agl: 0,
    a: Object.freeze(along(10)), b: Object.freeze(along(180)) }),
  Object.freeze({ id: 'pans-holds-kite', from: 'pans', to: 'holds', mode: 'flight', speed: KITE_MS, agl: FLIGHT_AGL_M,
    a: Object.freeze(along(-55)), b: Object.freeze(along(200)) }),
]);

/** The seam swept along a line, out and back, in the crossing's mode: each event with the metres from `a`. */
export function sweep(map, c, step = 0.25) {
  const tr = new RegionTracker(map, { modeOf: () => c.mode });
  const L = Math.hypot(c.b.x - c.a.x, c.b.z - c.a.z);
  const ev = [];
  const go = (from, to, leg) => {
    for (let s = 0; s <= L + 1e-9; s += step) {
      const k = s / L;
      for (const e of tr.update(from.x + (to.x - from.x) * k, from.z + (to.z - from.z) * k)) ev.push({ leg, type: e.type, region: e.region, m: +(leg === 'out' ? s : L - s).toFixed(2) });
    }
  };
  go(c.a, c.b, 'out');
  go(c.b, c.a, 'back');
  return { L: +L.toFixed(1), ev };
}
