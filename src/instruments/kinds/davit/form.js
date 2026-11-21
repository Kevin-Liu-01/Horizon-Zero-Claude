/**
 * THE DAVIT AT BLOCKOUT (M3 wave 1, area C; bible §7.4 #7; owner question Q3's default: drawn fresh in the shared
 * language, no board design). A grey hull: proportion and silhouette only. This module imports nothing, so node can
 * load it. Part types: ../kiln/form.js.
 *
 * A compact six-legged hull: each leg hangs from an outrigger and bends its knee in the sagittal plane. A cab with the
 * cab lantern (upright on the roof's right-front corner, off the centre line: never a face; wave 3c), the winch drum behind it (the weak point: Pry it and there
 * are no more repairs), a rack of THREE spare enamel plates on its back, standing upright 0.30 m apart so the count
 * reads at 20 m, a counterweight at the stern. Two folding crane arms beside the cab: the working one unfolded and
 * up, the other stowed, folded along the deck (two raised together read as a figure's arms: never at rest).
 *
 * WAVE 2 (originality, the wave-1 review): the working arm was a solid boom to a brass elbow and a jib out over the bow
 * to a ball-like sheave with the hook hanging, and from the side that raised, jointed arm with a hook at its end read as
 * a long neck and head on a six-legged body. It is now a DERRICK: a straight, open lattice boom (two chords, laced; no
 * elbow) on a slewing turntable at the deck's right edge, raked forward 58 deg to a flat sheave at 4.2 m; its backstay
 * pendant runs from the boom's tip to the top of an A-frame gantry on the deck behind the winch, and the hoist cable
 * runs visibly from the winch drum up the boom: boom, pendant and gantry close one triangle, the shape of a crane,
 * never a neck.
 * No head, no neck, no torso with arms, no tail.
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
{
  // the working arm (right), wave 2: a straight open lattice boom on a slewing turntable at the deck's right edge, raked
  // forward to a flat sheave at 4.2 m; the hoist cable up the boom from the winch; the backstay pendant from the boom's
  // tip to the top of an A-frame gantry behind the winch (boom, pendant and gantry: one triangle)
  const bx = 0.75, foot = [bx, 1.90, 0.30], tip = [bx, 4.08, 1.73];
  ARMS.push(
    cyl('turntableR', [bx, 1.69, 0.30], 0.24, 0.08, 'y', { tone: 'brass' }),
    cyl('kingpostR', [bx, 1.80, 0.30], 0.13, 0.18, 'y', { tone: 'joint' }),
    // the lattice: two chords 0.26 m apart at the foot, 0.14 m at the tip, laced on five bays
    strut('boomChordR1', [bx - 0.13, foot[1], foot[2]], [bx - 0.07, tip[1], tip[2]], 0.04),
    strut('boomChordR2', [bx + 0.13, foot[1], foot[2]], [bx + 0.07, tip[1], tip[2]], 0.04),
  );
  for (let i = 0; i < 5; i++) {
    const t0 = i / 5, t1 = (i + 1) / 5, lerp = (t, k) => foot[k] + (tip[k] - foot[k]) * t, half = (t) => 0.13 - 0.06 * t;
    const s0 = i % 2 ? 1 : -1;
    ARMS.push(strut(`boomLace${i + 1}`, [bx + s0 * half(t0), lerp(t0, 1), lerp(t0, 2)], [bx - s0 * half(t1), lerp(t1, 1), lerp(t1, 2)], 0.018, { tone: 'joint' }));
  }
  ARMS.push(
    // fix round 1: the sheave sits between the chords' ends (r 0.10, inside the lattice's 0.14 m), never a disc proud of
    // the tip (from the side a 0.15 m disc on the boom's end over the six legs could read as a head on a neck)
    cyl('boomTipPin', [bx, tip[1], tip[2]], 0.05, 0.22, 'x', { tone: 'joint' }),
    cyl('sheaveR', [bx, tip[1], tip[2]], 0.10, 0.06, 'x', { tone: 'brass' }),
    strut('hoistCable', [0.30, 2.18, 0.20], [bx, tip[1] + 0.08, tip[2] - 0.06], 0.012, { tone: 'joint' }),
    strut('cableR', [bx, tip[1] - 0.04, tip[2] + 0.17], [bx, 2.95, tip[2] + 0.17], 0.012, { tone: 'joint' }),
    box('hookBlockR', [bx, 2.84, tip[2] + 0.17], [0.16, 0.22, 0.16], { tone: 'joint', hit: 'hookR' }),
    cyl('hookR', [bx, 2.66, tip[2] + 0.17], 0.03, 0.16, 'y', { tone: 'brass' }),
    // the A-frame gantry behind the winch (clear of the drum) and the backstay pendant to the boom's tip
    strut('gantryLegR1', [0.30, 1.66, -0.35], [0.62, 2.85, -0.35], 0.05, { tone: 'joint' }),
    strut('gantryLegR2', [0.74, 1.66, -0.35], [0.62, 2.85, -0.35], 0.05, { tone: 'joint' }),
    cyl('gantryTop', [0.62, 2.85, -0.35], 0.06, 0.16, 'z', { tone: 'brass' }),
    strut('backstayR', [0.62, 2.85, -0.30], [bx, tip[1], tip[2] - 0.02], 0.015, { tone: 'joint' }),
  );
  // the stowed arm (left): the boom laid back along the deck beside the rack, the jib folded forward over it, its hook
  // block hanging short at the cab's flank (the pair never stands up as a pair: never read as two raised arms)
  const sx = -0.62;
  ARMS.push(
    cyl('kingpostL', [-0.55, 1.84, 0.50], 0.12, 0.36, 'y', { tone: 'joint' }),
    strut('boomL', [-0.55, 1.95, 0.50], [sx, 2.45, -1.30], 0.075),
    cyl('elbowL', [sx, 2.45, -1.30], 0.10, 0.18, 'x', { tone: 'brass' }),
    strut('jibL', [sx, 2.45, -1.30], [-0.66, 2.62, 0.45], 0.055),
    cyl('sheaveL', [-0.66, 2.64, 0.52], 0.12, 0.08, 'x', { tone: 'brass' }),
    strut('cableL', [-0.66, 2.55, 0.56], [-0.66, 2.36, 0.56], 0.012, { tone: 'joint' }),
    box('hookBlockL', [-0.66, 2.25, 0.56], [0.16, 0.22, 0.16], { tone: 'joint', hit: 'hookL' }),
    cyl('hookL', [-0.66, 2.07, 0.56], 0.03, 0.16, 'y', { tone: 'brass' }),
  );
}

export const DAVIT_PARTS = Object.freeze([
  box('hull', [0, 1.30, -0.10], [1.55, 0.70, 2.60]),
  box('cab', [0, 1.95, 0.85], [1.00, 0.60, 0.70]),
  // wave 3c: the cab lantern, upright on its foot at the roof's right-front corner and set back 0.25 m from the cab's
  // face (the round lamp in a drum on the cab's face read as an eye: the wave-3 review)
  cyl('lampDrum', [0.34, 2.30, 0.95], 0.06, 0.10, 'y', { tone: 'joint' }),
  cyl('lamp', [0.34, 2.45, 0.95], 0.13, 0.20, 'y', { lamp: true, hit: 'lamp' }),
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

export const DAVIT_LAMP = Object.freeze({ at: [0.34, 2.45, 0.95], r: 0.13, h: 0.20, shape: 'lantern' });

export const DAVIT_HIT = Object.freeze({
  winch: Object.freeze({ grammar: 'joint', across: 0.60 }),
  plate1: Object.freeze({ grammar: 'tool', across: 0.66 }),
  plate2: Object.freeze({ grammar: 'tool', across: 0.66 }),
  plate3: Object.freeze({ grammar: 'tool', across: 0.66 }),
  hookR: Object.freeze({ grammar: 'tool', across: 0.26 }),
  hookL: Object.freeze({ grammar: 'tool', across: 0.26 }),
  lamp: Object.freeze({ grammar: 'lamp', across: 0.26 }),
});
