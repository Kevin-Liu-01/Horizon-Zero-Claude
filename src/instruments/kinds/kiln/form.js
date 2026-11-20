/**
 * THE KILN AT BLOCKOUT (M3 wave 1, area C; bible §7.4 #10; owner question Q3's default: drawn fresh in the shared
 * language, no board design). A grey hull: proportion and silhouette only. One source for the grey recipe
 * (tools/build/instruments/gen-m3-blockout.mjs), the line-up page (tools/gates/instruments/m3/lineup.html) and the
 * Node rows (tools/gates/instruments/m3/*.test.mjs). This module imports nothing, so node can load it.
 *
 * A walking kiln: a beehive dome on four stumpy legs, a tall chimney-mortar on a trunnion to 5.5 m, the firebox door
 * at the front (an oxblood surround in the art wave; the ONE place a hull glows, and only behind the door), four
 * canisters on the flanks (vials), the vent hose coiled on a reel carried at the stern and run forward along the right
 * flank to its coupling, low on the right flank: the wellheads seam stands a Kiln with its wellhead off a FLANK (area A,
 * src/world/sites/kilnyards-layout.js `kilnStand`: the head 4.9 m from the body's centre, the hose's run 3.2 m), so the
 * coupling faces the well and the hose is seen on it (F59). Its one lamp sits in a drum on the
 * chimney's yoke (the working end is the mortar), beside the chimney and high: never above the door, so the door
 * and the lamp never read as a mouth and an eye. No head, no neck, no eye, no face, no tail.
 *
 * Body frame: metres, y up from the ground under the hull's centre, +z forward (yaw 0 faces +z). Each knee is in the
 * sagittal plane (bible §7.1 rule 8): hip, knee and foot of a leg share one x.
 *
 * Part types (shared by the four M3 forms):
 *   box   { c: [x, y, z], s: [sx, sy, sz] }
 *   cyl   { c, r, h, axis: 'x' | 'y' | 'z', r2? }   r2 is the radius at the axis' positive end (a frustum); default r
 *   strut { a: [x, y, z], b: [x, y, z], r }        a round bar from a to b
 *   torus { c, R, tube, axis }                      a ring of centre-line radius R about `axis`
 * Flags: lamp (the kind's one lamp: drawn in the state's colour), vial (pale ice glass), hit (a hit part's id),
 * dark (the firebox door's dark face; never emissive at blockout), tone ('joint' | 'brass' | 'hull').
 */

export const KILN_ROSTER = Object.freeze({ L: 5.0, W: 3.4, H: 5.5, cls: 'large', triCap: 80000, bones: 40 });

const box = (name, c, s, f = {}) => ({ name, type: 'box', c, s, ...f });
const cyl = (name, c, r, h, axis = 'y', f = {}) => ({ name, type: 'cyl', c, r, h, axis, ...f });
const strut = (name, a, b, r, f = {}) => ({ name, type: 'strut', a, b, r, ...f });

/** The four stumpy legs: hip on a bracket off the body, knee and foot in the same x (sagittal knees). */
const LEGS = [];
for (const [side, sx] of [['R', 1], ['L', -1]]) {
  for (const [end, sz] of [['F', 1], ['H', -1]]) {
    const x = sx * 1.30;
    const hip = [x, 1.15, sz * 0.95], knee = [x, 0.80, sz > 0 ? 1.58 : -1.42], foot = [x, 0.13, sz > 0 ? 2.10 : -1.78];
    LEGS.push(
      box(`hipBracket${side}${end}`, [sx * 1.12, 1.15, sz * 0.95], [0.42, 0.22, 0.30], { tone: 'joint' }),
      strut(`thigh${side}${end}`, hip, knee, 0.15, { tone: 'joint' }),
      strut(`shin${side}${end}`, knee, foot, 0.13, { tone: 'joint' }),
      cyl(`pad${side}${end}`, [x, 0.05, foot[2]], 0.28, 0.10, 'y', { tone: 'joint' }),
    );
  }
}

export const KILN_PARTS = Object.freeze([
  // the beehive: a fire body and two dome courses to a crown
  cyl('fireBody', [0, 1.75, 0], 1.32, 1.40, 'y', { r2: 1.24 }),
  cyl('domeLow', [0, 2.75, 0], 1.24, 0.60, 'y', { r2: 0.95 }),
  cyl('domeHigh', [0, 3.30, 0], 0.95, 0.50, 'y', { r2: 0.50 }),
  cyl('crown', [0, 3.625, 0], 0.50, 0.15, 'y', { r2: 0.42, tone: 'brass' }),
  // the chimney-mortar on its trunnion (it tilts in the behaviour wave), a muzzle ring and a spike finial to 5.5 m
  cyl('trunnion', [0, 3.78, -0.20], 0.18, 1.10, 'x', { tone: 'joint' }),
  cyl('chimney', [0, 4.48, -0.20], 0.34, 1.50, 'y', { r2: 0.30, hit: 'chimney' }),
  cyl('muzzle', [0, 5.28, -0.20], 0.38, 0.10, 'y', { tone: 'brass' }),
  cyl('finial', [0.30, 5.40, -0.20], 0.025, 0.20, 'y', { tone: 'brass' }),
  // the lamp drum on the yoke's right cheek (the working end), facing forward
  box('yokeCheek', [0.55, 3.80, -0.10], [0.12, 0.45, 0.40], { tone: 'joint' }),
  cyl('lampDrum', [0.55, 3.86, 0.10], 0.19, 0.30, 'z', { tone: 'joint' }),
  cyl('lamp', [0.55, 3.86, 0.27], 0.13, 0.04, 'z', { lamp: true, hit: 'lamp' }),
  // the firebox: a surround (oxblood in the art wave) and the door, its hinge on the left
  box('fireboxSurround', [0, 1.55, 1.30], [1.20, 1.10, 0.30]),
  box('fireboxDoor', [0, 1.55, 1.48], [0.80, 0.80, 0.06], { hit: 'fireboxDoor', dark: true }),
  cyl('doorHinge', [-0.42, 1.55, 1.48], 0.05, 0.80, 'y', { tone: 'brass' }),
  // four canisters on the flanks (vials: the Cinder round flask's family), each on a bracket
  ...[[1, 0.45], [1, -0.45], [-1, 0.45], [-1, -0.45]].flatMap(([sx, z], i) => [
    cyl(`canister${i + 1}`, [sx * 1.52, 1.85, z], 0.18, 0.75, 'y', { vial: true, hit: `canister${i + 1}` }),
    box(`canisterBracket${i + 1}`, [sx * 1.36, 1.85, z], [0.16, 0.10, 0.12], { tone: 'brass' }),
  ]),
  // the vent hose: its reel carried on a frame at the stern, the hose run forward along the right flank to the coupling
  // low on the right flank (it faces the wellhead the seam stands it beside)
  strut('reelFrameR', [0.26, 1.30, -1.20], [0.36, 1.30, -2.26], 0.05, { tone: 'joint' }),
  strut('reelFrameL', [-0.26, 1.30, -1.20], [-0.36, 1.30, -2.26], 0.05, { tone: 'joint' }),
  cyl('hoseReel', [0, 1.30, -2.26], 0.36, 0.62, 'x', { tone: 'joint' }),
  strut('hoseRun', [0.40, 1.26, -2.18], [1.50, 1.30, -1.05], 0.13, { tone: 'joint' }),
  strut('hose', [1.50, 1.30, -1.05], [1.56, 1.12, -0.10], 0.13, { hit: 'hose', tone: 'joint' }),
  cyl('hoseCoupling', [1.68, 1.12, -0.10], 0.16, 0.12, 'x', { tone: 'brass' }),
  ...LEGS,
]);

/** The hull's lamp anchor and radius (body frame), as the lamp system will take it. */
export const KILN_LAMP = Object.freeze({ at: [0.55, 3.86, 0.29], r: 0.13 });

/**
 * The hit parts (the seam of M2 briefs §3.2: `sealed` | `seized` | `off`; M3 adds reseat). The door's own state is
 * the rules' (`./rules.js`): `shut` | `sprung`. Every weak point is at least 0.25 m across (bible §7.1 rule 4).
 */
export const KILN_HIT = Object.freeze({
  fireboxDoor: Object.freeze({ grammar: 'joint', across: 0.80 }),
  canister1: Object.freeze({ grammar: 'vial', across: 0.36 }),
  canister2: Object.freeze({ grammar: 'vial', across: 0.36 }),
  canister3: Object.freeze({ grammar: 'vial', across: 0.36 }),
  canister4: Object.freeze({ grammar: 'vial', across: 0.36 }),
  chimney: Object.freeze({ grammar: 'tool', across: 0.68 }),
  hose: Object.freeze({ grammar: 'tool', across: 0.26 }),
  lamp: Object.freeze({ grammar: 'lamp', across: 0.26 }),
});

/** The firebox door in the body frame: its centre, half sizes, and the way it faces (+z). */
export const KILN_DOOR = Object.freeze({ c: [0, 1.55, 1.51], half: [0.40, 0.40, 0.03], normal: [0, 0, 1] });

/** The hose's coupling in the body frame (its outer face, where it meets a wellhead's hose): low on the RIGHT flank. */
export const KILN_COUPLING = Object.freeze([1.74, 1.12, -0.10]);
/** The flank the coupling is on: body +x (a Kiln at a wellhead turns this flank to it). */
export const KILN_COUPLING_SIDE = 1;
