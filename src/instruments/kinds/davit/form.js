/**
 * THE DAVIT AT BLOCKOUT (M3 wave 1, area C; bible §7.4 #7; owner question Q3's default: drawn fresh in the shared
 * language, no board design). A grey hull: proportion and silhouette only. This module imports nothing, so node can
 * load it. Part types: ../kiln/form.js.
 *
 * A compact six-legged hull: each leg hangs from an outrigger and bends its knee in the sagittal plane. A cab with the
 * cab lamp (in a drum, off the centre line: never a face), the winch drum behind it (the weak point: Pry it and there
 * are no more repairs), a rack of THREE spare enamel plates on its back, standing upright 0.30 m apart so the count
 * reads at 20 m, a counterweight at the stern. Two folding crane arms rise from kingposts beside the cab, each a boom
 * and a jib to a sheave at 4.2 m, a hook block hanging on its cable. No head, no neck, no torso with arms, no tail.
 */

export const DAVIT_ROSTER = Object.freeze({ L: 4.0, W: 2.4, H: 4.2, cls: 'medium', triCap: 50000, bones: 30 });

const box = (name, c, s, f = {}) => ({ name, type: 'box', c, s, ...f });
const cyl = (name, c, r, h, axis = 'y', f = {}) => ({ name, type: 'cyl', c, r, h, axis, ...f });
const strut = (name, a, b, r, f = {}) => ({ name, type: 'strut', a, b, r, ...f });

const LEGS = [];
for (const [side, sx] of [['R', 1], ['L', -1]]) {
  for (const [end, z] of [['F', 1.05], ['M', 0.0], ['H', -1.05]]) {
    const x = sx * 1.12;
    LEGS.push(
      box(`outrigger${side}${end}`, [sx * 0.94, 1.12, z], [0.40, 0.14, 0.18], { tone: 'joint' }),
      strut(`thigh${side}${end}`, [x, 1.12, z], [x, 0.62, z + 0.32], 0.065, { tone: 'joint' }),
      strut(`shin${side}${end}`, [x, 0.62, z + 0.32], [x, 0.09, z], 0.055, { tone: 'joint' }),
      cyl(`pad${side}${end}`, [x, 0.045, z], 0.08, 0.09, 'y', { tone: 'joint' }),
    );
  }
}

const ARMS = [];
for (const [side, sx] of [['R', 1], ['L', -1]]) {
  const kx = sx * 0.55, tx = sx * 0.66;
  ARMS.push(
    cyl(`kingpost${side}`, [kx, 1.84, 0.50], 0.12, 0.36, 'y', { tone: 'joint' }),
    strut(`boom${side}`, [kx, 1.95, 0.50], [sx * 0.62, 3.55, 0.05], 0.075),
    cyl(`elbow${side}`, [sx * 0.62, 3.55, 0.05], 0.10, 0.18, 'x', { tone: 'brass' }),
    strut(`jib${side}`, [sx * 0.62, 3.55, 0.05], [tx, 3.98, 1.78], 0.055),
    cyl(`sheave${side}`, [tx, 4.05, 1.86], 0.15, 0.08, 'x', { tone: 'brass' }),
    strut(`cable${side}`, [tx, 3.92, 1.92], [tx, 2.95, 1.92], 0.012, { tone: 'joint' }),
    box(`hookBlock${side}`, [tx, 2.84, 1.92], [0.16, 0.22, 0.16], { tone: 'joint', hit: `hook${side}` }),
    cyl(`hook${side}`, [tx, 2.66, 1.92], 0.03, 0.16, 'y', { tone: 'brass' }),
  );
}

export const DAVIT_PARTS = Object.freeze([
  box('hull', [0, 1.30, -0.10], [1.55, 0.70, 2.60]),
  box('cab', [0, 1.95, 0.85], [1.00, 0.60, 0.70]),
  cyl('lampDrum', [0.32, 1.98, 1.30], 0.15, 0.22, 'z', { tone: 'joint' }),
  cyl('lamp', [0.32, 1.98, 1.42], 0.13, 0.03, 'z', { lamp: true, hit: 'lamp' }),
  cyl('winch', [0, 1.98, 0.08], 0.30, 0.95, 'x', { tone: 'joint', hit: 'winch' }),
  // the plate rack: two rails and three plates standing upright, 0.30 m apart
  box('rackRailR', [0.48, 1.95, -0.85], [0.06, 0.60, 1.00], { tone: 'brass' }),
  box('rackRailL', [-0.48, 1.95, -0.85], [0.06, 0.60, 1.00], { tone: 'brass' }),
  box('plate1', [0, 2.07, -0.55], [0.86, 0.66, 0.04], { hit: 'plate1' }),
  box('plate2', [0, 2.07, -0.85], [0.86, 0.66, 0.04], { hit: 'plate2' }),
  box('plate3', [0, 2.07, -1.15], [0.86, 0.66, 0.04], { hit: 'plate3' }),
  box('counterweight', [0, 1.25, -1.75], [1.10, 0.55, 0.50], { tone: 'joint' }),
  ...ARMS,
  ...LEGS,
]);

export const DAVIT_LAMP = Object.freeze({ at: [0.32, 1.98, 1.44], r: 0.13 });

export const DAVIT_HIT = Object.freeze({
  winch: Object.freeze({ grammar: 'joint', across: 0.60 }),
  plate1: Object.freeze({ grammar: 'tool', across: 0.66 }),
  plate2: Object.freeze({ grammar: 'tool', across: 0.66 }),
  plate3: Object.freeze({ grammar: 'tool', across: 0.66 }),
  hookR: Object.freeze({ grammar: 'tool', across: 0.26 }),
  hookL: Object.freeze({ grammar: 'tool', across: 0.26 }),
  lamp: Object.freeze({ grammar: 'lamp', across: 0.26 }),
});
