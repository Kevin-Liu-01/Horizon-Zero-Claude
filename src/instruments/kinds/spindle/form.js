/**
 * THE SPINDLE AT BLOCKOUT (M3 wave 1, area C; bible §7.4 #6; the private design sheet's default: it takes the board's
 * ring-wheel design, with the stilt legs the board's patrol walker shows, never its lens on a neck). A grey hull:
 * proportion and silhouette only. This module imports nothing, so node can load it. Part types: ../kiln/form.js.
 *
 * Two tall jointed stilt legs (knees in the sagittal plane, bending forward) carry a hip block. On it, on a short collar,
 * stands the brass hub, and round the hub runs the 2 m brass ring, LEVEL, on three spokes: the bible's roster word ("a
 * level 2 m ring around a brass hub"), a whorl round its spindle. The warm hub lamp is in a drum on the hub's front
 * right, below the ring's plane; the hub bearing (the weak point, exposed while the ring is stopped) is the race on the
 * hub's top. The 3 m levelling staff stands upright in a holster at the hull's back right corner, outside the ring's
 * sweep (1.10 m from the hub's axis), held by a triangular truss off the hip block; its brass ferrule is the top of the
 * 3.8 m. The thrust lifts it from the holster and levels it (the behaviour wave).
 *
 * WAVE 2 (originality, the wave-1 review): the ring stood upright in the frontal plane over the two legs with the lamp
 * at its hub, and from the front a round ring with one lamp in its middle on two legs read as a figure with a round head
 * and one eye. The ring is now level (seen from the front it is a thin line across the hull at 2.36 m, no disc faces
 * the lens), the lamp is off the hub's centre and below the ring, and the mast behind the ring is gone (the upright
 * staff in its corner holster is the height). No head, no neck, no torso with arms, no tail.
 *
 * The roster footprint (2.0 x 2.0) is the level ring's span; the feet and the holstered staff stand inside it.
 */

export const SPINDLE_ROSTER = Object.freeze({ L: 2.0, W: 2.0, H: 3.8, cls: 'medium', triCap: 50000, bones: 30 });

const box = (name, c, s, f = {}) => ({ name, type: 'box', c, s, ...f });
const cyl = (name, c, r, h, axis = 'y', f = {}) => ({ name, type: 'cyl', c, r, h, axis, ...f });
const strut = (name, a, b, r, f = {}) => ({ name, type: 'strut', a, b, r, ...f });

/** The ring's centre, its centre-line radius, its tube and its axis (level: about y; outer span 2.0 m). */
export const SPINDLE_RING = Object.freeze({ c: [0, 2.36, -0.25], R: 0.94, tube: 0.06, axis: 'y' });

const LEGS = [];
for (const [side, sx] of [['R', 1], ['L', -1]]) {
  const x = sx * 0.32;
  const hip = [x, 1.38, -0.25], knee = [x, 0.80, 0.20], ankle = [x, 0.14, -0.28];
  LEGS.push(
    strut(`thigh${side}`, hip, knee, 0.075, { tone: 'joint' }),
    strut(`shin${side}`, knee, ankle, 0.06, { tone: 'joint' }),
    box(`foot${side}`, [x, 0.045, -0.07], [0.22, 0.09, 1.10], { tone: 'joint' }),
  );
}

const { c: RC, R: RR } = SPINDLE_RING;
/** three spokes in the ring's level plane, at 30, 150 and 270 deg (x = cos, z = sin: 270 runs straight back) */
const SPOKES = [30, 150, 270].map((deg, i) => {
  const a = deg * Math.PI / 180;
  return strut(`spoke${i + 1}`, [RC[0] + Math.cos(a) * 0.30, RC[1], RC[2] + Math.sin(a) * 0.30],
    [RC[0] + Math.cos(a) * (RR - 0.04), RC[1], RC[2] + Math.sin(a) * (RR - 0.04)], 0.035, { tone: 'brass' });
});

/** The holstered staff: upright at the back right corner, 1.10 m from the hub's axis (the ring's outer edge is 1.0 m). */
const STAFF_AT = [0.78, -1.03];

export const SPINDLE_PARTS = Object.freeze([
  box('hipBlock', [0, 1.50, -0.25], [0.74, 0.40, 0.50]),
  box('hipCowl', [0, 1.78, -0.30], [0.50, 0.18, 0.40]),
  // the collar and the hub on the hip block; the ring level round the hub; the bearing's race on the hub's top
  cyl('collar', [0, 1.885, -0.25], 0.14, 0.05, 'y', { tone: 'joint' }),
  cyl('hub', [0, 2.175, -0.25], 0.30, 0.55, 'y', { tone: 'brass' }),
  { name: 'ring', type: 'torus', c: RC, R: RR, tube: SPINDLE_RING.tube, axis: 'y', tone: 'brass', hit: 'ring' },
  ...SPOKES,
  cyl('hubBearing', [0, 2.48, -0.25], 0.22, 0.06, 'y', { tone: 'joint', hit: 'hubBearing' }),
  // the hub lamp: a drum on the hub's front right, below the ring's plane (off the centre: never one centred pupil)
  cyl('lampDrum', [0.20, 2.06, 0.06], 0.15, 0.18, 'z', { tone: 'joint' }),
  cyl('lamp', [0.20, 2.06, 0.165], 0.13, 0.03, 'z', { lamp: true, hit: 'lamp' }),
  // the levelling staff upright in its holster, a triangular truss off the hip block's back right
  strut('holsterTrussHigh', [0.30, 1.66, -0.46], [0.74, 1.56, -0.99], 0.03, { tone: 'joint' }),
  strut('holsterTrussLow', [0.30, 1.34, -0.46], [0.74, 1.44, -0.99], 0.03, { tone: 'joint' }),
  cyl('holster', [STAFF_AT[0], 1.50, STAFF_AT[1]], 0.065, 0.30, 'y', { tone: 'joint' }),
  strut('staff', [STAFF_AT[0], 0.70, STAFF_AT[1]], [STAFF_AT[0], 3.70, STAFF_AT[1]], 0.035, { hit: 'staff' }),
  cyl('ferrule', [STAFF_AT[0], 3.75, STAFF_AT[1]], 0.02, 0.10, 'y', { tone: 'brass' }),
  ...LEGS,
]);

export const SPINDLE_LAMP = Object.freeze({ at: [0.20, 2.06, 0.18], r: 0.13 });

export const SPINDLE_HIT = Object.freeze({
  hubBearing: Object.freeze({ grammar: 'joint', across: 0.44 }),
  lamp: Object.freeze({ grammar: 'lamp', across: 0.26 }),
  staff: Object.freeze({ grammar: 'tool', across: 3.0 }),
  ring: Object.freeze({ grammar: 'tool', across: 2.0 }),
});

/** The staff's length (m): the thrust's reach is the lunge plus the staff (./rules.js). */
export const SPINDLE_STAFF_M = 3.0;
