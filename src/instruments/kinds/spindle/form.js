/**
 * THE SPINDLE AT BLOCKOUT (M3 wave 1, area C; bible §7.4 #6; the private design sheet's default: it takes the board's
 * ring-wheel design, with the stilt legs and mast the board's patrol walker shows, never its lens on a neck). A grey
 * hull: proportion and silhouette only. This module imports nothing, so node can load it. Part types: ../kiln/form.js.
 *
 * Two tall jointed stilt legs (knees in the sagittal plane, bending forward) carry a hip block; an arm from the block
 * holds the axle of a 2 m brass ring-wheel standing in the frontal plane, spoked to a brass hub. The hub carries the
 * warm hub lamp at its face, inside the hub bearing's race (the weak point, exposed while the ring is stopped). A mast
 * and spike finial behind the ring make the 3.8 m. The 3 m levelling staff is slung at rest behind the ring, raked
 * back 24 deg from upright on a trunnion at the hip block's right rear (the thrust swings it level on that trunnion in
 * the behaviour wave). No bar reaches out from the body to hold it: a horizontal clamp at hip height beside a staff
 * read as an arm holding a pole on a two-legged figure (line-up judge, d695cc9). No head, no neck, no torso with
 * arms, no tail.
 *
 * The roster footprint (2.0 x 2.0) is the ring's span (2.0 wide) and the long stilt feet with the slung staff behind
 * (2.0 deep): the ring stands in the frontal plane, as the board draws it, not level (the bible's word; for the owner).
 */

export const SPINDLE_ROSTER = Object.freeze({ L: 2.0, W: 2.0, H: 3.8, cls: 'medium', triCap: 50000, bones: 30 });

const box = (name, c, s, f = {}) => ({ name, type: 'box', c, s, ...f });
const cyl = (name, c, r, h, axis = 'y', f = {}) => ({ name, type: 'cyl', c, r, h, axis, ...f });
const strut = (name, a, b, r, f = {}) => ({ name, type: 'strut', a, b, r, ...f });

/** The ring's centre, its centre-line radius and tube (outer span 2.0 m). */
export const SPINDLE_RING = Object.freeze({ c: [0, 2.55, 0.02], R: 0.94, tube: 0.06 });

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
/** three spokes at 90, 210 and 330 degrees (the three ring segments are the components) */
const SPOKES = [90, 210, 330].map((deg, i) => {
  const a = deg * Math.PI / 180;
  return strut(`spoke${i + 1}`, [RC[0] + Math.cos(a) * 0.26, RC[1] + Math.sin(a) * 0.26, RC[2]],
    [RC[0] + Math.cos(a) * (RR - 0.04), RC[1] + Math.sin(a) * (RR - 0.04), RC[2]], 0.035, { tone: 'brass' });
});

export const SPINDLE_PARTS = Object.freeze([
  box('hipBlock', [0, 1.50, -0.25], [0.74, 0.40, 0.50]),
  box('hipCowl', [0, 1.78, -0.30], [0.50, 0.18, 0.40]),
  // the arm to the axle, behind the ring
  strut('ringArm', [0, 1.80, -0.35], [0, 2.55, -0.35], 0.08, { tone: 'joint' }),
  cyl('axle', [0, 2.55, -0.17], 0.10, 0.40, 'z', { tone: 'joint' }),
  // the ring-wheel: rim, spokes, hub, the hub bearing's race and the lamp at its face
  { name: 'ring', type: 'torus', c: RC, R: RR, tube: SPINDLE_RING.tube, axis: 'z', tone: 'brass', hit: 'ring' },
  ...SPOKES,
  cyl('hub', [0, 2.55, 0.02], 0.27, 0.26, 'z', { tone: 'brass' }),
  cyl('hubBearing', [0, 2.55, 0.17], 0.22, 0.06, 'z', { tone: 'joint', hit: 'hubBearing' }),
  cyl('lamp', [0, 2.55, 0.215], 0.13, 0.03, 'z', { lamp: true, hit: 'lamp' }),
  // the mast and finial behind the ring (the height)
  strut('mast', [0, 1.95, -0.52], [0, 3.62, -0.52], 0.035, { tone: 'joint' }),
  cyl('finial', [0, 3.71, -0.52], 0.02, 0.18, 'y', { tone: 'brass' }),
  // the levelling staff, slung at rest: on its trunnion at the hip block's right rear, raked back 24 deg behind the
  // ring (wholly behind the ring's plane: 0.17 m clear of the rim's back face at its nearest), its tip at 3.77 m
  cyl('staffTrunnion', [0.45, 1.50, -0.42], 0.09, 0.16, 'x', { tone: 'joint' }),
  strut('staff', [0.45, 1.03, -0.211], [0.45, 3.771, -1.431], 0.035, { hit: 'staff' }),
  ...LEGS,
]);

export const SPINDLE_LAMP = Object.freeze({ at: [0, 2.55, 0.23], r: 0.13 });

export const SPINDLE_HIT = Object.freeze({
  hubBearing: Object.freeze({ grammar: 'joint', across: 0.44 }),
  lamp: Object.freeze({ grammar: 'lamp', across: 0.26 }),
  staff: Object.freeze({ grammar: 'tool', across: 3.0 }),
  ring: Object.freeze({ grammar: 'tool', across: 2.0 }),
});

/** The staff's length (m): the thrust's reach is the lunge plus the staff (./rules.js). */
export const SPINDLE_STAFF_M = 3.0;
