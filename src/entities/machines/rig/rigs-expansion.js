/**
 * ROUND-4 EXPANSION RIG SPECS (`machines-expansion`).
 *
 * The same contract as `autorig.js` RIGS — BODY space, +Z forward, y = 0 at
 * the feet, metres — for the nine species `docs/research/casting-v4.md` casts.
 * They live in their own file only because `autorig.js` already carries the
 * big three and a ninth spec would bury them; `autorig.js` merges this in, so
 * `RIGS.snapmaw` resolves exactly like `RIGS.sawtooth`.
 *
 * ## Every number here was MEASURED, not copied
 *
 * `casting-v4` §2 carries a spec for `RIGS.snapmaw` and `RIGS.ravager` written
 * before the donors were normalised, and two of its assumptions do not survive
 * contact with the bytes. Measured in the running game, after
 * `assets.normalize()` (probe: one vertex + bone sweep per donor into body
 * space, `shots/measure.png`):
 *
 * | donor | normalised size (x,y,z) | where the mass is |
 * |---|---|---|
 * | Bull (broadhead) | 1.10 x 2.00 x 3.52 | head z +1.28, tail z −1.73 |
 * | Deer (grazer) | 0.93 x 2.72 x 2.80 | head z +0.83 at y 2.44 |
 * | Caiman (snapmaw) | 1.52 x 0.98 x 8.03 | **body z −0.3 … +2.4**, snout to +4.0 |
 * | Lion (ravager) | 2.11 x 3.66 x 6.00 | mane z +1.9 … +3.0, back line y 2.4 |
 * | Spider (shellwalker) | 6.23 x 2.04 x 5.53 | front feet z +2.6 |
 * | Scorpion (corruptor) | 5.46 x 2.95 x 9.02 | claws z +2.9 … +4.2, tail arch −2.9 … −4.2 |
 *
 * The Snapmaw is the one that matters: `casting-v4` puts its pelvis at
 * z −1.45 and its hind legs at z −1.40, which on the real Caiman is **inside
 * the tail** (half-width 0.18 m at z −1.43, and the tail is where the whole
 * silhouette's taper lives). The legs are where the sculpt's feet are — the
 * slabs whose vertices reach y = 0 — which is z +0.0 … +2.3. The spec below
 * puts the hind hips at z +0.30 and the front at z +1.85, which is a 1.55 m
 * wheelbase under an 8 m animal: short, and correct for a crocodile.
 *
 * The rigged donors (Bull, Deer, Spider) hand their joint positions over
 * directly — those rows are the donor's own bind pose read in body space, so
 * a plate drawn on them is drawn on the animal, not near it.
 *
 * ## Why every one of these is auto-rigged rather than mixer-driven
 *
 * `casting-v4` §1 casts Broadhead / Grazer / Shell-Walker / Stormbird as
 * "rigged model via mixer". They are auto-rigged here instead, and the reason
 * is the gate bar, not convenience: `A45-no-skate`, `A46-ground-truth` and
 * `A48-cadence` are graded per species with no exemptions, and the two
 * clip-driven species already in the build (Watcher, Longleg) needed four
 * rounds of `FootLock` / stance-window / cadence-loop tuning EACH to hold
 * them — `longleg.js` carries ~120 lines of comments recording it. The
 * `GaitController` path holds all three bars on five species with a per-species
 * cadence table and nothing else.
 *
 * What the clips would have bought is bought differently: the donor's own BIND
 * POSE is the sculpt (so the animal is the animal), attack limb work is
 * authored through `gait.pose` the way the Sawtooth's paw is (gate `V27`), the
 * idle library covers `Idle_Headlow` / `Eating`, and `gait.deathPose` covers
 * `Death`. The cost is honest and it is recorded here: no `Attack_Headbutt`
 * keyframes, no ear flicks off the donor's `Idle_2`.
 */

export const EXPANSION_RIGS = {
  /* ------------------------------------------------------------------ */
  /* BROADHEAD — longhorn bull, 3.52 m long, withers 1.33 (roster §3 2x3.5) */
  /* ------------------------------------------------------------------ */
  broadhead: {
    spine: [
      { name: 'pelvis', pos: [0, 1.38, -1.20], r: 0.60 },
      { name: 'spine', pos: [0, 1.42, -0.55], r: 0.58 },
      { name: 'chest', pos: [0, 1.38, 0.15], r: 0.58 },
      { name: 'neck', pos: [0, 1.42, 0.62], r: 0.40 },
      { name: 'head', pos: [0, 1.70, 1.24], r: 0.46, tip: [0, 1.60, 1.72] },
    ],
    tail: [
      { name: 'tail1', pos: [0, 1.62, -1.50], r: 0.24 },
      { name: 'tail2', pos: [0, 1.28, -1.70], r: 0.18 },
    ],
    legGateY: 1.16,
    legInboard: 0.14,
    legs: [
      { id: 'LF', parent: 'chest', hinge: 1, hip: [-0.27, 1.14, 0.38], knee: [-0.27, 0.56, 0.44], ankle: [-0.27, 0.20, 0.40], toe: [-0.27, 0.03, 0.54], r: 0.24, restFoot: [-0.27, 0.40] },
      { id: 'RF', parent: 'chest', hinge: 1, hip: [0.27, 1.14, 0.38], knee: [0.27, 0.56, 0.44], ankle: [0.27, 0.20, 0.40], toe: [0.27, 0.03, 0.54], r: 0.24, restFoot: [0.27, 0.40] },
      { id: 'LH', parent: 'pelvis', hinge: -1, hip: [-0.25, 1.00, -1.15], knee: [-0.26, 0.58, -1.24], ankle: [-0.26, 0.22, -1.44], toe: [-0.26, 0.03, -1.32], r: 0.25, restFoot: [-0.26, -1.42] },
      { id: 'RH', parent: 'pelvis', hinge: -1, hip: [0.25, 1.00, -1.15], knee: [0.26, 0.58, -1.24], ankle: [0.26, 0.22, -1.44], toe: [0.26, 0.03, -1.32], r: 0.25, restFoot: [0.26, -1.42] },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* GRAZER — deer, 2.80 m long, head carried at 2.44 (roster §3 1.6x2.8) */
  /* ------------------------------------------------------------------ */
  grazer: {
    spine: [
      { name: 'pelvis', pos: [0, 1.50, -0.85], r: 0.48 },
      { name: 'spine', pos: [0, 1.50, -0.30], r: 0.46 },
      { name: 'chest', pos: [0, 1.48, 0.22], r: 0.46 },
      { name: 'neck', pos: [0, 1.85, 0.58], r: 0.30 },
      { name: 'head', pos: [0, 2.40, 0.84], r: 0.34, tip: [0, 2.28, 1.18] },
    ],
    tail: [
      { name: 'tail1', pos: [0, 1.66, -1.08], r: 0.18 },
      { name: 'tail2', pos: [0, 1.60, -1.30], r: 0.14 },
    ],
    legGateY: 1.28,
    legInboard: 0.11,
    legs: [
      { id: 'LF', parent: 'chest', hinge: 1, hip: [-0.21, 1.24, 0.31], knee: [-0.21, 0.68, 0.40], ankle: [-0.21, 0.22, 0.36], toe: [-0.21, 0.03, 0.50], r: 0.19, restFoot: [-0.21, 0.36] },
      { id: 'RF', parent: 'chest', hinge: 1, hip: [0.21, 1.24, 0.31], knee: [0.21, 0.68, 0.40], ankle: [0.21, 0.22, 0.36], toe: [0.21, 0.03, 0.50], r: 0.19, restFoot: [0.21, 0.36] },
      { id: 'LH', parent: 'pelvis', hinge: -1, hip: [-0.23, 1.17, -0.80], knee: [-0.24, 0.72, -0.96], ankle: [-0.24, 0.24, -1.24], toe: [-0.24, 0.03, -1.12], r: 0.20, restFoot: [-0.24, -1.22] },
      { id: 'RH', parent: 'pelvis', hinge: -1, hip: [0.23, 1.17, -0.80], knee: [0.24, 0.72, -0.96], ankle: [0.24, 0.24, -1.24], toe: [0.24, 0.03, -1.12], r: 0.20, restFoot: [0.24, -1.22] },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* SNAPMAW — caiman, 8.03 m long, 0.98 tall. THE SPRAWL IS THE READ:   */
  /* the knees sit OUTBOARD of the hips and the lift is tiny (a croc     */
  /* barely picks a foot up), which is what separates this silhouette    */
  /* from every other quadruped in the roster.                           */
  /* ------------------------------------------------------------------ */
  snapmaw: {
    spine: [
      { name: 'pelvis', pos: [0, 0.52, -0.20], r: 0.62 },
      { name: 'spine', pos: [0, 0.56, 0.70], r: 0.62 },
      { name: 'chest', pos: [0, 0.56, 1.60], r: 0.58 },
      { name: 'neck', pos: [0, 0.54, 2.35], r: 0.40 },
      { name: 'head', pos: [0, 0.52, 3.05], r: 0.44, tip: [0, 0.46, 3.95] },
    ],
    tail: [
      { name: 'tail1', pos: [0, 0.50, -1.05], r: 0.36 },
      { name: 'tail2', pos: [0, 0.46, -1.95], r: 0.28 },
      { name: 'tail3', pos: [0, 0.42, -2.80], r: 0.20 },
      { name: 'tail4', pos: [0, 0.38, -3.60], r: 0.15 },
    ],
    legGateY: 0.40,
    legInboard: 0.16,
    legs: [
      { id: 'LF', parent: 'chest', hinge: 1, hip: [-0.34, 0.46, 1.85], knee: [-0.60, 0.30, 1.92], ankle: [-0.70, 0.12, 1.98], toe: [-0.74, 0.02, 2.20], r: 0.20, restFoot: [-0.70, 1.98] },
      { id: 'RF', parent: 'chest', hinge: 1, hip: [0.34, 0.46, 1.85], knee: [0.60, 0.30, 1.92], ankle: [0.70, 0.12, 1.98], toe: [0.74, 0.02, 2.20], r: 0.20, restFoot: [0.70, 1.98] },
      { id: 'LH', parent: 'pelvis', hinge: -1, hip: [-0.32, 0.44, 0.30], knee: [-0.58, 0.28, 0.18], ankle: [-0.68, 0.12, 0.08], toe: [-0.72, 0.02, 0.30], r: 0.21, restFoot: [-0.68, 0.10] },
      { id: 'RH', parent: 'pelvis', hinge: -1, hip: [0.32, 0.44, 0.30], knee: [0.58, 0.28, 0.18], ankle: [0.68, 0.12, 0.08], toe: [0.72, 0.02, 0.30], r: 0.21, restFoot: [0.68, 0.10] },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* RAVAGER — lion, 6.00 m long, back line 2.4, head carried UP.        */
  /* `casting-v4` §2.4: head up is what separates this from the          */
  /* Sawtooth's low prowl, and it is the Lion's own authored pose.       */
  /* ------------------------------------------------------------------ */
  ravager: {
    spine: [
      { name: 'pelvis', pos: [0, 2.10, -1.55], r: 1.10 },
      { name: 'spine', pos: [0, 2.28, -0.50], r: 0.95 },
      { name: 'chest', pos: [0, 2.34, 0.72], r: 0.95 },
      { name: 'neck', pos: [0, 2.55, 1.62], r: 0.80 },
      { name: 'head', pos: [0, 2.90, 2.35], r: 0.85, tip: [0, 2.80, 2.95] },
    ],
    tail: [
      { name: 'tail1', pos: [0, 2.05, -2.10], r: 0.34 },
      { name: 'tail2', pos: [0, 1.66, -2.72], r: 0.24 },
    ],
    legGateY: 1.95,
    legInboard: 0.30,
    legs: [
      { id: 'LF', parent: 'chest', hinge: -1, hip: [-0.55, 2.05, 1.18], knee: [-0.58, 1.18, 1.02], ankle: [-0.58, 0.50, 1.10], toe: [-0.58, 0.04, 1.42], r: 0.44, restFoot: [-0.58, 1.14] },
      { id: 'RF', parent: 'chest', hinge: -1, hip: [0.55, 2.05, 1.18], knee: [0.58, 1.18, 1.02], ankle: [0.58, 0.50, 1.10], toe: [0.58, 0.04, 1.42], r: 0.44, restFoot: [0.58, 1.14] },
      { id: 'LH', parent: 'pelvis', hinge: 1, hip: [-0.50, 2.00, -0.78], knee: [-0.54, 1.18, -0.60], ankle: [-0.54, 0.50, -0.82], toe: [-0.54, 0.04, -0.64], r: 0.46, restFoot: [-0.54, -0.80] },
      { id: 'RH', parent: 'pelvis', hinge: 1, hip: [0.50, 2.00, -0.78], knee: [0.54, 1.18, -0.60], ankle: [0.54, 0.50, -0.82], toe: [0.54, 0.04, -0.64], r: 0.46, restFoot: [0.54, -0.80] },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* SHELL-WALKER — hexapod crab walk on the Spider's own six rear legs; */
  /* the FRONT pair is promoted to the two arm-claws (casting-v4 §2.5)   */
  /* and is NOT in this spec, because a limb the gait walks on cannot    */
  /* also be held up. The claws are shell + pose channels.               */
  /*                                                                     */
  /* The donor's right front foot is `FrontFoot2.R`, not `FrontFoot.R` — */
  /* the naming bug `casting-v4` §0 flags. Nothing here keys on it: the  */
  /* legs are measured positions, not name lookups.                      */
  /* ------------------------------------------------------------------ */
  shellwalker: {
    spine: [
      { name: 'pelvis', pos: [0, 1.05, -1.05], r: 0.95 },
      { name: 'spine', pos: [0, 1.10, -0.35], r: 0.95 },
      { name: 'chest', pos: [0, 1.12, 0.35], r: 0.90 },
      { name: 'neck', pos: [0, 1.16, 0.90], r: 0.55 },
      { name: 'head', pos: [0, 1.20, 1.35], r: 0.55, tip: [0, 1.18, 1.85] },
    ],
    tail: [],
    legGateY: 1.34,
    legInboard: 0.34,
    legs: [
      { id: 'MFL', parent: 'chest', hinge: 1, hip: [-0.60, 0.95, -0.11], knee: [-2.11, 1.62, -0.29], ankle: [-2.60, 0.60, 0.55], toe: [-2.77, 0.03, 1.69], r: 0.30, restFoot: [-2.77, 1.40] },
      { id: 'MFR', parent: 'chest', hinge: 1, hip: [0.60, 0.95, -0.11], knee: [2.11, 1.62, -0.29], ankle: [2.60, 0.60, 0.55], toe: [2.77, 0.03, 1.69], r: 0.30, restFoot: [2.77, 1.40] },
      { id: 'MBL', parent: 'spine', hinge: -1, hip: [-0.53, 0.93, -0.37], knee: [-1.60, 1.76, -0.85], ankle: [-2.55, 0.62, -1.15], toe: [-2.90, 0.03, -1.33], r: 0.30, restFoot: [-2.90, -1.20] },
      { id: 'MBR', parent: 'spine', hinge: -1, hip: [0.53, 0.93, -0.37], knee: [1.60, 1.76, -0.85], ankle: [2.55, 0.62, -1.15], toe: [2.90, 0.03, -1.33], r: 0.30, restFoot: [2.90, -1.20] },
      { id: 'BL', parent: 'pelvis', hinge: -1, hip: [-0.46, 0.95, -0.62], knee: [-1.22, 1.32, -1.35], ankle: [-1.80, 0.60, -2.00], toe: [-2.10, 0.03, -2.49], r: 0.30, restFoot: [-2.10, -2.30] },
      { id: 'BR', parent: 'pelvis', hinge: -1, hip: [0.46, 0.95, -0.62], knee: [1.22, 1.32, -1.35], ankle: [1.80, 0.60, -2.00], toe: [2.10, 0.03, -2.49], r: 0.30, restFoot: [2.10, -2.30] },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* CORRUPTOR — arachnid hub with the knees ABOVE the hips and a tail   */
  /* that leaves the body and arches up and forward over the back.       */
  /* The one shape `autorig.js` had not been asked for.                   */
  /* ------------------------------------------------------------------ */
  corruptor: {
    spine: [
      { name: 'pelvis', pos: [0, 0.78, -0.75], r: 0.85 },
      { name: 'spine', pos: [0, 0.85, -0.10], r: 0.80 },
      { name: 'chest', pos: [0, 0.88, 0.60], r: 0.80 },
      { name: 'neck', pos: [0, 0.82, 1.35], r: 0.70 },
      { name: 'head', pos: [0, 0.74, 2.30], r: 1.00, tip: [0, 0.66, 3.60] },
    ],
    tail: [
      { name: 'tail1', pos: [0, 1.25, -1.45], r: 0.50 },
      { name: 'tail2', pos: [0, 2.00, -2.35], r: 0.42 },
      { name: 'tail3', pos: [0, 2.65, -2.90], r: 0.34 },
      { name: 'tail4', pos: [0, 2.85, -3.75], r: 0.28 },
    ],
    legGateY: 0.72,
    legInboard: 0.30,
    legs: [
      { id: 'LF', parent: 'chest', hinge: 1, hip: [-0.62, 0.72, 0.62], knee: [-1.35, 1.05, 0.48], ankle: [-1.85, 0.48, 0.38], toe: [-2.05, 0.03, 0.32], r: 0.24, restFoot: [-2.05, 0.40] },
      { id: 'RF', parent: 'chest', hinge: 1, hip: [0.62, 0.72, 0.62], knee: [1.35, 1.05, 0.48], ankle: [1.85, 0.48, 0.38], toe: [2.05, 0.03, 0.32], r: 0.24, restFoot: [2.05, 0.40] },
      { id: 'LH', parent: 'pelvis', hinge: -1, hip: [-0.58, 0.70, -0.48], knee: [-1.30, 1.02, -0.72], ankle: [-1.80, 0.46, -0.92], toe: [-2.00, 0.03, -1.05], r: 0.26, restFoot: [-2.00, -0.95] },
      { id: 'RH', parent: 'pelvis', hinge: -1, hip: [0.58, 0.70, -0.48], knee: [1.30, 1.02, -0.72], ankle: [1.80, 0.46, -0.92], toe: [2.00, 0.03, -1.05], r: 0.26, restFoot: [2.00, -0.95] },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* STORMBIRD — a FLYER, so this spec exists for the GROUNDED half of   */
  /* its life only (roster §4: all six engines torn = grounded for good, */
  /* and `A48s` measures cadence on the grounded bird). Two raptor legs  */
  /* under a 17 m wingspan; the wings are shell and pose channels.       */
  /* ------------------------------------------------------------------ */
  stormbird: {
    spine: [
      { name: 'pelvis', pos: [0, 2.35, -0.60], r: 1.20 },
      { name: 'chest', pos: [0, 2.55, 0.55], r: 1.25 },
      { name: 'neck', pos: [0, 2.85, 1.55], r: 0.80 },
      { name: 'head', pos: [0, 3.25, 2.35], r: 0.75, tip: [0, 3.10, 3.20] },
    ],
    tail: [
      { name: 'tail1', pos: [0, 2.30, -1.70], r: 0.70 },
      { name: 'tail2', pos: [0, 2.20, -2.70], r: 0.55 },
    ],
    legGateY: 2.15,
    legInboard: 0.35,
    legs: [
      { id: 'L', parent: 'pelvis', hinge: 1, hip: [-0.72, 2.20, -0.35], knee: [-0.86, 1.35, 0.05], ankle: [-0.88, 0.62, -0.30], toe: [-0.90, 0.05, 0.10], r: 0.46, restFoot: [-0.88, -0.20] },
      { id: 'R', parent: 'pelvis', hinge: 1, hip: [0.72, 2.20, -0.35], knee: [0.86, 1.35, 0.05], ankle: [0.88, 0.62, -0.30], toe: [0.90, 0.05, 0.10], r: 0.46, restFoot: [0.88, -0.20] },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* REDEYE WATCHER — the Watcher's body plan, its own kind. The spec is */
  /* only used for the DORSAL BLASTER's socket frame and the shell trim; */
  /* locomotion is the Watcher's clip path, which this species inherits. */
  /* ------------------------------------------------------------------ */
};

export default EXPANSION_RIGS;
