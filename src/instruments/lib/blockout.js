/**
 * THE WAVE 1 BLOCKOUTS OF AREA C (M2 briefs §3.4, §6; owner question Q1's and Q3's defaults): the Tiller in its
 * default form, the Sickle and the Screed as grey hulls in the Instruments' shared language, sized by bible §7.4.
 * One source for three readers:
 *   - tools/build/instruments/gen-blockout.mjs builds the grey GLBs from `parts` (boxes and cylinders, each on a bone);
 *   - tools/instruments/in0-geometry.mjs (IN0) and the kinds' sight occluders read `hullShapes()` (the parts marked
 *     `occludes`) through src/instruments/lib/sight.js;
 *   - tools/instruments/blockout.test.mjs grades the sizes (IN4: +-0.1 m against the roster) and the parts.
 *
 * Body frame: metres, y up from the ground under the hull's centre, +z the hull's forward (yaw 0 faces +z, the
 * game's heading convention). `c` is a part's centre, `s` its full size [x, y, z]; a cylinder's axis is y unless
 * `axis` says 'x' or 'z'. No art: one grey, the lamp and the pale vial glass only (lamp colours are the state's).
 *
 * The shared language (bible §7.2, Q3's default): enamel hull panels, brass and gunmetal struts, ONE lamp in a drum
 * at the working end, a mast and finial for height; no head, no neck, no eye, no face, no tail.
 *
 * This module imports nothing, so node can load it.
 */

/** Bible §7.4 roster sizes, L x W x H (m); the line-up grades each built hull against these within 0.1 m (IN4). */
export const ROSTER = Object.freeze({
  tiller: Object.freeze({ L: 4.5, W: 1.8, H: 2.7, cls: 'medium' }),
  sickle: Object.freeze({ L: 3.6, W: 1.4, H: 1.7, cls: 'medium' }),
  screed: Object.freeze({ L: 6.5, W: 3.6, H: 3.8, cls: 'large' }),
});

const box = (name, bone, c, s, extra = {}) => ({ name, bone, type: 'box', c, s, ...extra });
const cyl = (name, bone, c, r, h, axis = 'y', extra = {}) => ({ name, bone, type: 'cyl', c, r, h, axis, ...extra });

/* ------------------------------------------------------------------------------------------------------------ */
/* TILLER: a long enamel hull on six stilts (bible §7.4 #3), the forms IN0 compares                             */
/* ------------------------------------------------------------------------------------------------------------ */
/**
 * `m1`: the M1 body as built (gen-tiller.mjs: three turned segments of radius <= 0.5 m on the axis at 1.78 m, keel at
 * 1.30 m, about 3.4 m from the abdomen to the drum): the shape the sightline meets today.
 * `hull`: the default form's hull without a skirt (3.6 x 1.5 m, belly 1.25 m, deck 2.15 m, a shallow dome to 2.45 m;
 * the drum at the bow and the auger at the stern make the roster's 4.5 m).
 * `skirt`: the same hull with an enamel dust skirt on both flanks down to 0.5 m over the ground (the stilts pass
 * through slots in it), and the bow and stern plates down to 0.9 m.
 * `deep`: the hull itself carried down to a 0.7 m belly.
 */
const TILLER_FORMS = {
  m1: { L: 3.4, W: 1.0, parts: [box('body', 'pelvis', [0, 1.79, 0.1], [1.0, 0.98, 3.4], { occludes: true })] },
  hull: { L: 3.6, W: 1.5, parts: [
    box('hull', 'pelvis', [0, 1.70, 0], [1.5, 0.90, 3.6], { occludes: true }),
    box('dome', 'pelvis', [0, 2.30, -0.2], [1.1, 0.30, 2.2], { occludes: true }),
  ] },
  skirt: { L: 3.6, W: 1.5, parts: [
    box('hull', 'pelvis', [0, 1.70, 0], [1.5, 0.90, 3.6], { occludes: true }),
    box('dome', 'pelvis', [0, 2.30, -0.2], [1.1, 0.30, 2.2], { occludes: true }),
    box('skirtL', 'pelvis', [-0.72, 0.875, 0], [0.06, 0.75, 3.4], { occludes: true }),
    box('skirtR', 'pelvis', [0.72, 0.875, 0], [0.06, 0.75, 3.4], { occludes: true }),
    box('skirtBow', 'chest', [0, 1.075, 1.78], [1.4, 0.35, 0.05], { occludes: true }),
    box('skirtStern', 'pelvis', [0, 1.075, -1.78], [1.4, 0.35, 0.05], { occludes: true }),
  ] },
  deep: { L: 3.6, W: 1.5, parts: [
    box('hull', 'pelvis', [0, 1.425, 0], [1.5, 1.45, 3.6], { occludes: true }),
    box('dome', 'pelvis', [0, 2.30, -0.2], [1.1, 0.30, 2.2], { occludes: true }),
  ] },
};

/** The six stilts of the default form, hip (on the hull) to foot (on the ground), and its working ends. */
const TILLER_KIT = [
  // the drum lamp in a housing at the bow (a limb circle round it; never on a neck), the hopper under the dome,
  // the auger at the stern, the mast and finial
  cyl('drum', 'chest', [0, 1.95, 1.95], 0.32, 0.55, 'x'),
  cyl('lamp', 'chest', [0, 1.95, 2.24], 0.20, 0.06, 'z', { lamp: true }),
  cyl('hopper', 'pelvis', [0, 2.30, 0.9], 0.34, 0.30),
  cyl('auger', 'tail1', [0, 1.35, -1.95], 0.10, 0.6, 'z'),
  cyl('mast', 'pelvis', [0.0, 2.50, -1.3], 0.035, 0.40),
  cyl('finial', 'pelvis', [0.0, 2.68, -1.3], 0.06, 0.04),
];

/* ------------------------------------------------------------------------------------------------------------ */
/* SICKLE: a low wedge on four raked-back legs, a hub with two scissor blades at the front, one slit lamp        */
/* ------------------------------------------------------------------------------------------------------------ */
const SICKLE_PARTS = [
  box('body', 'pelvis', [0, 0.95, -0.25], [1.05, 0.45, 2.1], { occludes: true }),
  box('wedge', 'chest', [0, 1.10, 0.95], [0.85, 0.32, 0.6], { occludes: true }),
  cyl('hubCowl', 'chest', [0, 1.10, 1.30], 0.30, 0.34, 'z'),                 // the oxblood hub cowl (a grey box at blockout)
  cyl('hub', 'head', [0, 1.10, 1.50], 0.16, 0.10, 'z', { bearing: true }),  // the hub bearing: its weak point
  box('bladeL', 'head', [-0.35, 1.30, 1.62], [0.7, 0.06, 0.12], { blade: true }),
  box('bladeR', 'head', [0.35, 0.90, 1.62], [0.7, 0.06, 0.12], { blade: true }),
  box('slitLamp', 'chest', [0, 1.30, 1.05], [0.30, 0.05, 0.06], { lamp: true }),
  cyl('flask', 'pelvis', [0, 1.30, -0.75], 0.12, 0.34, 'y', { vial: true }),  // the coolant flask (vial)
  cyl('antenna', 'pelvis', [0.3, 1.45, -1.0], 0.02, 0.50),                    // to 1.7 m: the kind's height
];

/* ------------------------------------------------------------------------------------------------------------ */
/* SCREED: a walking grader. Wide hull on six short heavy legs, the 3.6 m moldboard on two rams, ripper tines,   */
/* a cab mast with the lamp drum to 3.8 m, a disc platform and a finial                                         */
/* ------------------------------------------------------------------------------------------------------------ */
const SCREED_PARTS = [
  box('hull', 'pelvis', [0, 1.55, -0.6], [2.7, 1.3, 4.2], { occludes: true }),
  box('spoilHopper', 'pelvis', [0, 2.45, -1.2], [2.0, 0.5, 2.0], { occludes: true }),
  box('blade', 'blade', [0, 0.85, 3.12], [3.6, 1.1, 0.25], { occludes: true, blade: true }),   // the moldboard, down
  cyl('ramL', 'blade', [-0.95, 1.25, 2.1], 0.12, 1.9, 'z', { seal: 'L' }),                     // the two hydraulic rams
  cyl('ramR', 'blade', [0.95, 1.25, 2.1], 0.12, 1.9, 'z', { seal: 'R' }),
  cyl('sealL', 'blade', [-0.95, 1.25, 1.2], 0.17, 0.16, 'z', { weak: 'seal' }),               // ram seals: weak points
  cyl('sealR', 'blade', [0.95, 1.25, 1.2], 0.17, 0.16, 'z', { weak: 'seal' }),
  box('ripper', 'tail1', [0, 0.65, -3.10], [1.6, 0.9, 0.3]),
  cyl('mast', 'chest', [0, 2.95, 0.6], 0.10, 1.3),
  cyl('disc', 'chest', [0, 3.55, 0.6], 0.55, 0.06),
  cyl('drum', 'chest', [0, 3.35, 0.95], 0.24, 0.42, 'x'),
  cyl('lamp', 'chest', [0, 3.35, 1.18], 0.16, 0.05, 'z', { lamp: true, weak: 'lamp' }),       // the cab lamp
  cyl('finial', 'chest', [0, 3.72, 0.6], 0.04, 0.16),                                          // to 3.8 m
];

/** Six legs as [x, z] foot positions under the hull (stilts for the Tiller, short heavy legs for the Screed). */
const LEGS6 = (x, z0, z1) => [[x, z1], [x, 0], [x, z0], [-x, z1], [-x, 0], [-x, z0]].map(([lx, lz], i) => ({ id: ['RF', 'RM', 'RH', 'LF', 'LM', 'LH'][i], x: lx, z: lz }));
const LEGS4 = (x, z0, z1) => [[x, z1], [x, z0], [-x, z1], [-x, z0]].map(([lx, lz], i) => ({ id: ['RF', 'RH', 'LF', 'LH'][i], x: lx, z: lz }));

export const FORMS = Object.freeze({
  tiller: {
    forms: TILLER_FORMS,
    /** IN0's choice for the default form (tools/instruments/in0-geometry.mjs; for the owner at blockout, Q1) */
    chosen: 'skirt',
    kit: TILLER_KIT,
    legs: { feet: LEGS6(0.75, -1.35, 1.35), hipY: 1.45, hipX: 0.55, knee: [0.86, 2.05], thigh: 0.85, shin: 1.15 },   // high knees (the stilt walker's)
    L: ROSTER.tiller.L, W: ROSTER.tiller.W, H: ROSTER.tiller.H,
  },
  sickle: {
    parts: SICKLE_PARTS,
    legs: { feet: LEGS4(0.55, -1.75, 0.45), hipY: 0.85, hipX: 0.40, knee: [0.58, 1.15], thigh: 0.55, shin: 0.75, rakedBack: true },
    L: ROSTER.sickle.L, W: ROSTER.sickle.W, H: ROSTER.sickle.H,
  },
  screed: {
    parts: SCREED_PARTS,
    legs: { feet: LEGS6(1.55, -2.4, 1.0), hipY: 1.0, hipX: 1.2, knee: [1.62, 1.05], thigh: 0.55, shin: 0.65 },
    L: ROSTER.screed.L, W: ROSTER.screed.W, H: ROSTER.screed.H,
  },
});

/** The Screed's movement rules (IN5; bible §7.4 #9): a long wide hull walks like a grader and cannot turn in a charge. */
export const SCREED_MOVE = Object.freeze({
  walk: 1.4, chargeSpeed: 8.0, turnRate: 0.35,      // rad/s walking: turnRadius = walk / turnRate
  turnRadius: 1.4 / 0.35,
  chargeLen: 25, windupS: 1.2, bladeUp: 2.6, stallS: 3.0,
});

/** Every part of a kind's blockout (the Tiller's chosen form plus its kit). */
export function partsOf(kind, formId) {
  const F = FORMS[kind];
  if (!F) return [];
  if (kind === 'tiller') return [...F.forms[formId || F.chosen].parts, ...F.kit];
  return F.parts;
}

/**
 * The sight occluders of one hull at (x, z) facing `yaw`, as src/instruments/lib/sight.js shapes (world space; the
 * hull stands on y = `y0`). Only parts marked `occludes`; a box stays a box turned by `yaw`.
 */
export function hullShapes(kind, x, z, yaw, formId, y0 = 0) {
  const s = Math.sin(yaw), c = Math.cos(yaw), out = [];
  for (const p of partsOf(kind, formId)) {
    if (!p.occludes || p.type !== 'box') continue;
    // body (x right, z forward) -> world: forward (sin yaw, cos yaw), right (cos yaw, -sin yaw)
    const wx = x + p.c[0] * c + p.c[2] * s, wz = z - p.c[0] * s + p.c[2] * c;
    out.push({ type: 'box', cx: wx, cy: y0 + p.c[1], cz: wz, hx: p.s[0] / 2, hy: p.s[1] / 2, hz: p.s[2] / 2, yaw });
  }
  return out;
}

/** Axis-aligned bounds [min, max] of a kind's parts (body frame), legs' feet included. */
export function boundsOf(kind, formId) {
  const mn = [1e9, 0, 1e9], mx = [-1e9, -1e9, -1e9];
  const grow = (x, y, z) => { mn[0] = Math.min(mn[0], x); mn[1] = Math.min(mn[1], y); mn[2] = Math.min(mn[2], z); mx[0] = Math.max(mx[0], x); mx[1] = Math.max(mx[1], y); mx[2] = Math.max(mx[2], z); };
  for (const p of partsOf(kind, formId)) {
    let hx, hy, hz;
    if (p.type === 'box') [hx, hy, hz] = p.s.map((v) => v / 2);
    else if (p.axis === 'x') { hx = p.h / 2; hy = p.r; hz = p.r; } else if (p.axis === 'z') { hx = p.r; hy = p.r; hz = p.h / 2; } else { hx = p.r; hy = p.h / 2; hz = p.r; }
    grow(p.c[0] - hx, p.c[1] - hy, p.c[2] - hz); grow(p.c[0] + hx, p.c[1] + hy, p.c[2] + hz);
  }
  const Lg = FORMS[kind].legs;
  for (const f of Lg.feet) {
    grow(f.x - 0.15, 0, f.z - 0.15); grow(f.x + 0.15, 0, f.z + 0.15);
    if (Lg.knee) { const kx = Math.sign(f.x) * Lg.knee[0]; grow(kx, Lg.knee[1], f.z); }
  }
  return { min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
}
