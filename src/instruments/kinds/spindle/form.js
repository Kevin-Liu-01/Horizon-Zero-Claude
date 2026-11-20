/**
 * THE SPINDLE AT BLOCKOUT (M3 wave 1, area C; bible §7.4 #6; the private design sheet's default: it takes the board's
 * ring-wheel design, with the stilt legs the board's patrol walker shows, never its lens on a neck). A grey hull:
 * proportion and silhouette only. This module imports nothing, so node can load it. Part types: ../kiln/form.js.
 *
 * Two tall jointed stilt legs pivot on a cross-beam through a spool-shaped body that widens upward into the brass hub;
 * round the hub runs the 2 m brass ring, LEVEL, on three spokes: the bible's roster word ("a level 2 m ring around a
 * brass hub"), a whorl round its spindle. The hub bearing (the weak point, exposed while the ring is stopped) is the race
 * on the hub's top. The 3 m levelling staff is the spindle itself: it stands in the hull's axis, through the spool and
 * the hub, clamped above the bearing; its brass ferrule is the top of the 3.8 m. The thrust draws it up out of the hub
 * and levels it (the behaviour wave). The warm lamp is a hooded drum on the cross-beam's right.
 *
 * WAVE 2 (originality, the wave-1 review): the ring stood upright in the frontal plane over the two legs with the lamp
 * at its hub, and from the front a round ring with one lamp in its middle on two legs read as a figure with a round head
 * and one eye. The ring is now level (seen from the front it is a thin line across the hull at 2.36 m, no disc faces
 * the lens), the lamp is off the hub's centre and below the ring, and the mast behind the ring is gone (the upright
 * staff in its corner holster is the height). No head, no neck, no torso with arms, no tail.
 *
 * WAVE 2, FIX ROUND 1 (the wave-2 judge): from the front the level ring read as a hat brim over a lamp "face" (the hub
 * with its lamp drum under the ring) on two forward-kneed legs, and the holster's truss at hip height (1.34-1.66 m) to
 * the upright staff read as an arm holding a pole. Now: the staff IS the spindle, upright in the hull's own axis (it
 * runs down through the hub and the body and stands 1.3 m out of the hub's bearing), so no truss and nothing at the
 * hull's side; the body is a spool that widens upward into the hub (an inverted top: no neck, no head between body
 * and ring); the legs pivot on the ends of a cross-beam 1.24 m apart, a trestle's stance (they stood 0.64 m apart, a
 * figure's hips); the lamp is a hooded drum on the beam's right, at 1.47 m, nowhere under the ring.
 *
 * The roster footprint (2.0 x 2.0) is the level ring's span; the legs and feet stand inside it.
 */

export const SPINDLE_ROSTER = Object.freeze({ L: 2.0, W: 2.0, H: 3.8, cls: 'medium', triCap: 50000, bones: 30 });

const box = (name, c, s, f = {}) => ({ name, type: 'box', c, s, ...f });
const cyl = (name, c, r, h, axis = 'y', f = {}) => ({ name, type: 'cyl', c, r, h, axis, ...f });
const strut = (name, a, b, r, f = {}) => ({ name, type: 'strut', a, b, r, ...f });

/** The ring's centre, its centre-line radius, its tube and its axis (level: about y; outer span 2.0 m). */
export const SPINDLE_RING = Object.freeze({ c: [0, 2.36, -0.25], R: 0.94, tube: 0.06, axis: 'y' });
/** The hull's vertical axis (x, z): the spool, the hub, the ring and the staff all stand on it. */
const AX = [0, -0.25];

/**
 * The legs: pivots at the cross-beam's ends, 1.24 m apart (a trestle's stance, a third of the height: never a figure's
 * hips), knees in the sagittal plane (the shared rig: tools/gates/instruments/m3/measure.mjs IK1-never).
 */
const LEGS = [];
for (const [side, sx] of [['R', 1], ['L', -1]]) {
  const x = sx * 0.62, hip = [x, 1.45, AX[1]], knee = [x, 0.86, 0.15], ankle = [x, 0.14, -0.30];
  LEGS.push(
    strut(`thigh${side}`, hip, knee, 0.075, { tone: 'joint' }),
    strut(`shin${side}`, knee, ankle, 0.06, { tone: 'joint' }),
    box(`foot${side}`, [x, 0.045, -0.22], [0.20, 0.09, 0.90], { tone: 'joint' }),
  );
}

const { c: RC, R: RR } = SPINDLE_RING;
/** three spokes in the ring's level plane, at 30, 150 and 270 deg (x = cos, z = sin: 270 runs straight back) */
const SPOKES = [30, 150, 270].map((deg, i) => {
  const a = deg * Math.PI / 180;
  return strut(`spoke${i + 1}`, [RC[0] + Math.cos(a) * 0.30, RC[1], RC[2] + Math.sin(a) * 0.30],
    [RC[0] + Math.cos(a) * (RR - 0.04), RC[1], RC[2] + Math.sin(a) * (RR - 0.04)], 0.035, { tone: 'brass' });
});

export const SPINDLE_PARTS = Object.freeze([
  // the spool: narrow at its foot (0.75 m), widening upward into the hub (r 0.30 at 2.20 m), the staff through its axis
  cyl('spool', [AX[0], 1.475, AX[1]], 0.13, 1.45, 'y', { r2: 0.30 }),
  // the cross-beam the legs pivot on
  box('legBeam', [AX[0], 1.45, AX[1]], [1.40, 0.20, 0.30], { tone: 'joint' }),
  // the hub on the spool's top, the ring level round it, the bearing's race on its top
  cyl('hub', [AX[0], 2.34, AX[1]], 0.30, 0.28, 'y', { tone: 'brass' }),
  { name: 'ring', type: 'torus', c: RC, R: RR, tube: SPINDLE_RING.tube, axis: 'y', tone: 'brass', hit: 'ring' },
  ...SPOKES,
  cyl('hubBearing', [AX[0], 2.51, AX[1]], 0.22, 0.06, 'y', { tone: 'joint', hit: 'hubBearing' }),
  // the levelling staff: the spindle, upright in the axis from the spool's foot through the hub, clamped above the bearing
  cyl('staffClamp', [AX[0], 2.60, AX[1]], 0.07, 0.12, 'y', { tone: 'joint' }),
  strut('staff', [AX[0], 0.70, AX[1]], [AX[0], 3.70, AX[1]], 0.035, { hit: 'staff' }),
  cyl('ferrule', [AX[0], 3.75, AX[1]], 0.02, 0.10, 'y', { tone: 'brass' }),
  // the lamp: a hooded drum on the beam's right end, beside the right leg's pivot (off the axis, nowhere under the ring)
  cyl('lampDrum', [0.36, 1.47, -0.05], 0.15, 0.14, 'z', { tone: 'joint' }),
  cyl('lamp', [0.36, 1.47, 0.035], 0.13, 0.03, 'z', { lamp: true, hit: 'lamp' }),
  ...LEGS,
]);

export const SPINDLE_LAMP = Object.freeze({ at: [0.36, 1.47, 0.05], r: 0.13 });

export const SPINDLE_HIT = Object.freeze({
  hubBearing: Object.freeze({ grammar: 'joint', across: 0.44 }),
  lamp: Object.freeze({ grammar: 'lamp', across: 0.26 }),
  staff: Object.freeze({ grammar: 'tool', across: 3.0 }),
  ring: Object.freeze({ grammar: 'tool', across: 2.0 }),
});

/** The staff's length (m): the thrust's reach is the lunge plus the staff (./rules.js). */
export const SPINDLE_STAFF_M = 3.0;
