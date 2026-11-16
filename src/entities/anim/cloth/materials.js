/**
 * CLOTH: the materials (one row per fabric; a piece names its material, and no state retunes it).
 *
 * Units: areal mass kg/m2; compliance (XPBD alpha) m/N; kd velocity damping 1/s relative to the piece's carried
 * frame; mu Coulomb friction against a collider; cd / cl the drag and lift coefficients of a sheet in air (per
 * particle, on its own normal and area); `airShare` is not used by the solver directly (the share of her own travel
 * the cloth meets as air is the linear inertia share, `share.lin`, below); `slack` the long-range attachment's
 * allowance over a column's rest path.
 *
 * The shares are the inertia blend (cloth.md 2.4): the part of the root's motion in a frame that the free particles
 * are NOT carried with, i.e. that becomes lag. lin horizontal, vert vertical, yaw the turn about the vertical.
 * `vFedMax` is the most the root velocity the cloth is told about may change in one frame (m/s). `air` is the share of
 * that fed velocity met as wind on top of the lag velocity the particles carry (0.65 with lin 0.35: all of her travel).
 *
 * C2-C8 of the brief tuned `cd`, `cl` and the shares only (the bands are frozen, not the physics).
 */
export const MATERIALS = {
  // the wrap's tail and the people's wraps: coarse linen, light, stiff to bend across (wrung), easy along
  coarseLinen: {
    // (the tail rides her head in its own wake: none of her travel past the lag share is met as air; cd 0.7 holds the
    //  brief's bands, 5.5 m/s 25-50 deg and 9 m/s 45-70 standing, 30-65 at a sprint, on the bench at this commit)
    // (step 2: kd 5 (was 3) and a kick limit of 1.5 m/s: at a sprint the tongues crossed in 10-35 frames of 240 and the
    //  tail whipped to 64-81 deg; here 0 crossed, 34 deg mean, 37 at worst)
    areal: 0.35, hem: 1.0, shear: 2e-2, bendAlong: 1.0, bendAcross: 0.5, kd: 5.0, mu: 0.45, cd: 0.7, cl: 0.3, slack: 1.03,
    share: { lin: 0.35, vert: 0.8, yaw: 0.6 }, vFedMax: 1.2, air: 0, vRel: 1.5,
  },
  // Brea's sash panels: embroidered, lined linen, heavy at the hem (the couched border)
  lined: {
    // (step 2, WEIGHT: kd 6 (was 4), friction 0.3 (was 0.5: a lined panel slides off a rising thigh instead of riding it
    //  up), and the KICK limit `vRel` 0.8 m/s: a knee that shoves the panel moves it but cannot fling it; at a sprint the
    //  front hems' flutter fell from 0.13-0.19 m RMS to 0.06-0.09 and their forward chord from 29-31 deg to 12-20)
    // (round 2, the KNEES: friction 0.05 (was 0.3: the lining slides on the trousers, so a rising thigh lifts a panel
    //  without dragging it up and forward with it), the kick limit 0.3 m/s (was 0.8), kd 8 (was 6). Bench (six starts
    //  each, fresh rigs) at a sprint: front hems more than 0.05 m ahead of the knee plane in 1.5 / 12.1 % of frames ->
    //  0 / 0 %, hem flutter L 0.11 -> 0.04 m, R 0.058 -> 0.022 m. At a run they still are, ~20 % (the result has the numbers))
    areal: 0.90, hem: 1.6, shear: 5e-3, bendAlong: 0.25, bendAcross: 0.12, kd: 8.0, mu: 0.05, cd: 1.0, cl: 0.25, slack: 1.03,
    // (round 2, the TURN: yaw share 0.3 (was 0.6): a 180 deg turn on the spot in 0.5 s, the hems lagged 49 / 28 / 29 deg,
    //  band 8-25; here 16.7 / 13.3 / 17.4)
    share: { lin: 0.35, vert: 0.8, yaw: 0.3 }, vFedMax: 1.2, air: 0.65, vRel: 0.3,
  },
  felt: {
    areal: 0.80, hem: 1.2, shear: 2e-3, bendAlong: 0.07, bendAcross: 0.05, kd: 5.0, mu: 0.60, cd: 0.6, cl: 0.15, slack: 1.02,
    share: { lin: 0.35, vert: 0.8, yaw: 0.6 }, vFedMax: 1.2, air: 0.65, vRel: 1.0,
  },
  leather: {
    areal: 2.0, hem: 1.0, shear: 2e-4, bendAlong: 0.012, bendAcross: 0.008, kd: 6.0, mu: 0.35, cd: 0.5, cl: 0.05, slack: 1.01,
    share: { lin: 0.35, vert: 0.8, yaw: 0.6 }, vFedMax: 1.2, air: 0.65, vRel: 0.6,
  },
};

/** Air density, kg/m3. */
export const RHO = 1.2;
/** The substep (s), and the most substeps a frame takes. (Step 2: 1/180 s, 3 at 60 Hz, the brief's first cut for C10;
 *  was 1/240.) */
export const SUB_H = 1 / 180;
export const SUB_MAX = 8;
/** A particle's speed cap (m/s): a guard, not a working limit. */
export const V_CAP = 12;
/** Sleep: every particle under SLEEP_V (m/s) in its root's own frame for SLEEP_T (s), the air at her under SLEEP_WIND
 *  (m/s) and the root's acceleration (low-passed) under SLEEP_ACC (m/s2). (cloth.md 2.6 proposed 0.2 m/s2 measured on
 *  the root's travel; an idle's breath and weight shift put her head at 0.2-1.0 m/s2 and her pelvis at 0.06-0.2
 *  (bench, standing), so at 0.2 nothing standing would ever sleep: the stillness is read in the root's frame instead, and
 *  the root's own acceleration only wakes a piece past 1.0.) */
export const SLEEP_V = 0.01, SLEEP_T = 0.5, SLEEP_WIND = 0.3, SLEEP_ACC = 1.0;
/** The reset's settle: substeps at the frame's substep with the wind at 0 and the colliders in place (2 s). */
export const RESET_SUBSTEPS = 480;
/** A root that moves further than this in one frame (m) re-seats the piece (as RESEAT_D2 for the chains). */
export const RESEAT_D = 1.0;
