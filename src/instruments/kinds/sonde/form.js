/**
 * THE SONDE AT BLOCKOUT (M3 wave 1, area C; bible §7.4 #8; the private design sheet's default: it takes the board's
 * hovering designs, the one kind that flies). A grey hull: proportion and silhouette only. This module imports
 * nothing, so node can load it. Part types: ../kiln/form.js.
 *
 * A lozenge survey balloon the size of a cart: a long envelope tapered to a point at both ends (thin enamel tiles in the
 * art wave), an open gondola slung under it on four struts with the lamp in a drum at its port bow and a sounding weight
 * hanging under its keel, two ducted brass fans on outriggers off the gondola's flanks, and a banded 18 m tether from
 * the gondola's keel ring to an anchor post. No tail fins (no tail), no head, no glow inside the envelope (the lamp is in
 * the gondola).
 *
 * WAVE 2 (originality, the wave-1 review): from the front the round envelope carried a brass cap disc at its nose and
 * two fan ducts facing fore and aft on its flanks, the lamp centred below: a round face with discs for eyes. The nose
 * cap is gone and both ends come to a point; the two ducts turn their axes upright (lift fans, as a survey drone's)
 * and move down to outriggers off the gondola, so from the front, the side or behind each is a flat band and no disc
 * faces the lens; the lamp moves off the centre line to the gondola's port bow. The heights, the keel ring and the
 * tether are as in wave 1.
 *
 * Body frame: y = 0 at the sounding weight's lowest point (the hull hangs; it has no feet), +z forward.
 */

export const SONDE_ROSTER = Object.freeze({ L: 4.5, W: 2.5, H: 3.0, cls: 'small', triCap: 25000, bones: 20, tetherM: 18 });

const box = (name, c, s, f = {}) => ({ name, type: 'box', c, s, ...f });
const cyl = (name, c, r, h, axis = 'y', f = {}) => ({ name, type: 'cyl', c, r, h, axis, ...f });
const strut = (name, a, b, r, f = {}) => ({ name, type: 'strut', a, b, r, ...f });

const EY = 1.88, ER = 1.12;

/** wave 2: two lift fans, ducts upright (axis y), on outriggers off the gondola's flanks (never a disc to the lens) */
const FANS = [];
for (const [side, sx] of [['R', 1], ['L', -1]]) {
  FANS.push(
    strut(`outrigger${side}`, [sx * 0.40, 0.50, -0.10], [sx * 0.56, 0.50, -0.10], 0.04, { tone: 'joint' }),
    cyl(`duct${side}`, [sx * 0.89, 0.50, -0.10], 0.36, 0.20, 'y', { tone: 'brass', hit: `fan${side}` }),
    cyl(`fanHub${side}`, [sx * 0.89, 0.50, -0.10], 0.07, 0.24, 'y', { tone: 'joint' }),
  );
}

export const SONDE_PARTS = Object.freeze([
  // the envelope: a body and two tapered caps (r at the -z end, r2 at the +z end)
  cyl('envelope', [0, EY, 0], ER, 2.20, 'z', { hit: 'envelope' }),
  // wave 2: both ends come to a point (no cap disc at the nose)
  cyl('envelopeNose', [0, EY, 1.675], ER, 1.15, 'z', { r2: 0.02 }),
  cyl('envelopeStern', [0, EY, -1.675], 0.02, 1.15, 'z', { r2: ER }),
  ...FANS,
  // the gondola and its four struts
  ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz], i) => strut(`sling${i + 1}`, [sx * 0.36, 0.57, sz * 0.45], [sx * 0.48, 0.92, sz * 0.62], 0.025, { tone: 'joint' })),
  box('gondola', [0, 0.42, 0.10], [0.80, 0.30, 1.10]),
  // the lamp at the gondola's port bow (off the centre line). Wave 2b: an upright lantern lit all round, standing proud
  // of its drum's face (it was a 0.03 m disc on the face: from the ground under the moored hull, its own view, it read
  // edge-on, 6.53 dE2000 off its token at 9d1acc3); the same 0.26 m across, the drum unchanged
  cyl('lampDrum', [-0.24, 0.42, 0.73], 0.15, 0.16, 'z', { tone: 'joint' }),
  cyl('lamp', [-0.24, 0.42, 0.92], 0.13, 0.20, 'y', { lamp: true, hit: 'lamp' }),
  cyl('keelRing', [0, 0.25, 0.30], 0.06, 0.04, 'y', { tone: 'brass' }),
  // the sounding weight on its line
  strut('weightLine', [0, 0.27, -0.10], [0, 0.20, -0.10], 0.01, { tone: 'joint' }),
  cyl('weight', [0, 0.10, -0.10], 0.08, 0.20, 'y', { tone: 'brass' }),
]);

export const SONDE_LAMP = Object.freeze({ at: [-0.24, 0.42, 0.92], r: 0.13 });

/** Where the tether meets the hull (body frame): the gondola's keel ring. */
export const SONDE_KEEL = Object.freeze([0, 0.23, 0.30]);

/** The anchor post (a line-up and Sounding Ring prop; world frame from its foot). */
export const SONDE_POST = Object.freeze({ r: 0.12, h: 1.30, base: 0.30 });

/**
 * Where it is moored (a proposal for the Ring's staging, areas A and E; row 0 measures it): a post on the Sounding
 * Ring's rise, `offsetM` from the Ring's site on `bearingDeg` (the SW, downwind of the trade: the Sonde leans away from
 * the Ring and a cut tether drifts it clear). tools/gates/instruments/m3/sonde-mooring.mjs checks it against every
 * probed lens and the bow.
 */
export const SONDE_MOORING = Object.freeze({ site: 'sounding-ring', bearingDeg: 225, offsetM: 14 });

/** The tether's bands: alternating vermilion and staff-white, one metre each (the family mark, flat ink). */
export const SONDE_TETHER = Object.freeze({ lengthM: 18, bandM: 1.0, r: 0.025, colours: Object.freeze(['#D2452E', '#E6DCC8']) });

export const SONDE_HIT = Object.freeze({
  envelope: Object.freeze({ grammar: 'tool', across: 2.24 }),
  fanR: Object.freeze({ grammar: 'joint', across: 0.72 }),
  fanL: Object.freeze({ grammar: 'joint', across: 0.72 }),
  /** the tether is cut at its shackle on the post (0.30 m across), or shot through anywhere on its 18 m */
  tether: Object.freeze({ grammar: 'tool', across: 0.30 }),
  lamp: Object.freeze({ grammar: 'lamp', across: 0.26 }),
});
