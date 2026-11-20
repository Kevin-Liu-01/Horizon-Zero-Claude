/**
 * THE KILN AT BLOCKOUT (M3 wave 1, area C; bible §7.4 #10; owner question Q3's default: drawn fresh in the shared
 * language, no board design). A grey hull: proportion and silhouette only. One source for the grey recipe
 * (tools/build/instruments/gen-m3-blockout.mjs), the line-up page (tools/gates/instruments/m3/lineup.html) and the
 * Node rows (tools/gates/instruments/m3/*.test.mjs). This module imports nothing, so node can load it.
 *
 * A walking kiln: a beehive dome on four stumpy legs, a tall chimney-mortar on a trunnion to 5.5 m, the firebox door
 * at the front (an oxblood surround in the art wave; the ONE place a hull glows, and only behind the door), four
 * canisters on the flanks (vials), the vent hose coiled on a reel snug on the stern and run forward along the right
 * flank to its coupling, low on the right flank: the wellheads seam stands a Kiln with its wellhead off a FLANK (area A,
 * src/world/sites/kilnyards-layout.js `kilnStand`: the head 4.9 m from the body's centre, the hose's run 3.2 m), so the
 * coupling faces the well and the hose is seen on it (F59).
 *
 * WAVE 2 (originality, the wave-1 review): the lamp sat in a drum on the chimney's yoke, beside the stack and high, and
 * from the front a tall stack with one lamp beside it read as a neck with an eye. The lamp now sits LOW at the front
 * right, in a drum on a bracket off the fire body beside the firebox surround, at 1.25 m (0.23 of the height; was 3.86 m,
 * 0.70), below the door's centre and 1.4 m from the stack's axis: a working lamp at the fire's own face, like a stove's,
 * never above the door (so door and lamp are never a mouth and an eye) and never at the stack. The stack is a bottle
 * kiln's: it grows out of the dome broad (0.46 m at its root, was 0.34) and tapers to the muzzle, ringed by two brass
 * hoops, and the trunnion sits between a matched pair of yoke cheeks: a structure, not a neck. Nothing glows but the
 * door. No head, no neck, no eye, no face, no tail.
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
    // the stance splays to the roster's 5.0 m length on the feet (front and hind alike), so nothing hangs off the
    // stern to make it: a drum on a stalk behind read as a tail in the side silhouette (fix round 1, c8062b9)
    const hip = [x, 1.15, sz * 0.95], knee = [x, 0.80, sz * 1.62], foot = [x, 0.13, sz * 2.22];
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
  // wave 2: a bottle kiln's stack, broad at its root (0.46 m) and tapering to the muzzle, two brass hoops on it
  cyl('chimney', [0, 4.48, -0.20], 0.46, 1.50, 'y', { r2: 0.31, hit: 'chimney' }),
  cyl('hoopLow', [0, 4.12, -0.20], 0.46, 0.07, 'y', { tone: 'brass' }),
  cyl('hoopHigh', [0, 4.84, -0.20], 0.38, 0.07, 'y', { tone: 'brass' }),
  cyl('muzzle', [0, 5.28, -0.20], 0.38, 0.10, 'y', { tone: 'brass' }),
  cyl('finial', [0.30, 5.40, -0.20], 0.025, 0.20, 'y', { tone: 'brass' }),
  // the trunnion's yoke: a matched pair of cheeks (wave 1's single right cheek carried the lamp)
  box('yokeCheekR', [0.55, 3.80, -0.20], [0.12, 0.45, 0.40], { tone: 'joint' }),
  box('yokeCheekL', [-0.55, 3.80, -0.20], [0.12, 0.45, 0.40], { tone: 'joint' }),
  // wave 2: the lamp low at the front right, in a drum on a bracket off the fire body, beside the firebox surround
  box('lampBracket', [0.80, 1.25, 1.06], [0.16, 0.12, 0.20], { tone: 'joint' }),
  cyl('lampDrum', [0.85, 1.25, 1.26], 0.17, 0.28, 'z', { tone: 'joint' }),
  cyl('lamp', [0.85, 1.25, 1.415], 0.13, 0.03, 'z', { lamp: true, hit: 'lamp' }),
  // the firebox: a surround (oxblood in the art wave) and the door, its hinge on the left
  box('fireboxSurround', [0, 1.55, 1.30], [1.20, 1.10, 0.30]),
  box('fireboxDoor', [0, 1.55, 1.48], [0.80, 0.80, 0.06], { hit: 'fireboxDoor', dark: true }),
  cyl('doorHinge', [-0.42, 1.55, 1.48], 0.05, 0.80, 'y', { tone: 'brass' }),
  // four canisters on the flanks (vials: the Cinder round flask's family), each on a bracket
  ...[[1, 0.45], [1, -0.45], [-1, 0.45], [-1, -0.45]].flatMap(([sx, z], i) => [
    cyl(`canister${i + 1}`, [sx * 1.52, 1.85, z], 0.18, 0.75, 'y', { vial: true, hit: `canister${i + 1}` }),
    box(`canisterBracket${i + 1}`, [sx * 1.36, 1.85, z], [0.16, 0.10, 0.12], { tone: 'brass' }),
  ]),
  // the vent hose: its reel snug on the stern (inside the hind feet), the hose run forward along the right flank to the
  // coupling low on the right flank (it faces the wellhead the seam stands it beside)
  cyl('hoseReel', [0, 1.30, -1.62], 0.40, 0.62, 'x', { tone: 'joint' }),
  strut('hoseRun', [0.36, 1.26, -1.62], [1.50, 1.30, -1.05], 0.13, { tone: 'joint' }),
  strut('hose', [1.50, 1.30, -1.05], [1.56, 1.12, -0.10], 0.13, { hit: 'hose', tone: 'joint' }),
  cyl('hoseCoupling', [1.68, 1.12, -0.10], 0.16, 0.12, 'x', { tone: 'brass' }),
  ...LEGS,
]);

/** The hull's lamp anchor and radius (body frame), as the lamp system will take it. */
export const KILN_LAMP = Object.freeze({ at: [0.85, 1.25, 1.43], r: 0.13 });

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
