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
    // (round 4: kd 8 (was 5). Resting on her back with friction 0.45, a 1e-4 m nudge to the tail was still 2.6e-5 m after
    //  1 s standing (C11, bar 1e-5); here 6.6e-6. The flutter at a run 0.051 -> 0.036 m RMS, at a sprint 0.052 -> 0.038
    //  (C8, bar 0.04); its lift in the wind table moves by 0-4 deg)
    areal: 0.35, hem: 1.0, shear: 2e-2, bendAlong: 1.0, bendAcross: 0.5, kd: 8.0, mu: 0.45, cd: 0.7, cl: 0.3, slack: 1.03,
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
    // (round 4, the RUN: at a run with the trade wind 45 deg off her back the air of her travel met the panels at ~1 m/s,
    //  and the hem a thigh had pushed forward came back down at the kick limit, 0.3 m/s: it hung 0.1-0.2 m ahead of the
    //  knees as they crossed, 22-23 % of frames (bar 2 %). The fall is no longer a kick (`vFall` 1.0 m/s, solver.js), the
    //  panels meet 1.6 x her travel as air (`air`; the brief leaves the share free per material), and no lift (`cl` 0:
    //  with lift, a front panel pressed back by the air rode a sprinting thigh up to 60-70 deg and stayed there). The
    //  fronts are backstopped at her frontal plane (rig.js BACKSTOP): pressed back, the long front-left slipped between
    //  her legs. Node bench, six starts: hems ahead of the knee plane at a run 0 / 0 %, at a sprint 0 / 0 %)
    // (round 5, the SWING: the kick limit holds only a particle a collider touched in the last `kickHold` substeps (0.2 s);
    //  a free one swings up to `vSwing` 1.0 m/s. At 0.3 m/s for every particle a panel trailing 0.2-0.4 m behind her at a
    //  sprint came back at that speed when she stopped and settled 1.8-1.95 s after the stop (C4); here 0.33-0.65 s.
    //  1.5 m/s, or kd 6 with it, made the front panels at a sprint chaotic: a 1e-4 m nudge 0.01-0.1 m after 1 s (C11))
    // (the flap, round 2: `leeShelter` 0.1, the share of the free stream's force a panel takes in her lee (aero.js; the
    //  contact's SHELTER 0.3 was used for both). Behind her in the trade wind the back panel took 0.3 of the full wind and
    //  stood 26-47 deg off plumb, 0.47-0.67 m from her hips (Node, the Scout, 5.5 m/s from her front). A bluff body's
    //  near wake keeps well under half the free stream's speed: 0.1 of its force. cd, the hem and the air share were tried
    //  lower (cd 0.5-0.85, hem 2.5, air 1.75-2.6): each put a panel into her in the Node sweep's roll or a sit's hem
    //  awake, or the fronts ahead of the knees at a run (C8), and are kept)
    areal: 0.90, hem: 1.6, shear: 5e-3, bendAlong: 0.25, bendAcross: 0.12, kd: 8.0, mu: 0.05, cd: 1.0, cl: 0, slack: 1.03, vFall: 1.0, vSwing: 1.0, kickHold: 24, leeShelter: 0.1,
    // (round 2, the TURN: yaw share 0.3 (was 0.6): a 180 deg turn on the spot in 0.5 s, the hems lagged 49 / 28 / 29 deg,
    //  band 8-25; here 16.7 / 13.3 / 17.4)
    // (round 3: yaw 0.2, was 0.3: at the body's own size (the rest lengths follow her scale) the front-left hem lagged a
    //  180 deg turn on the spot by 30 deg, band 8-25; here 13.5 / 8.4 / 14.8 (L / R / back). The tail's 0.6 stays: 0.35
    //  crossed its tongues at a sprint)
    share: { lin: 0.35, vert: 0.8, yaw: 0.2 }, vFedMax: 1.2, air: 1.6, vRel: 0.3,
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
 *  was 1/240. Round 3: 1/120 s, 2 at 60 Hz: Node bench, the edges 1.028 / 1.024 x rest at a run / sprint (two starts),
 *  the front hems ahead of the knee plane at a sprint 0 % (1/180: 39 %), the Node sweep's clip frames 75 (1/180: 69).
 *  With 1 constraint pass a substep the front-left panel flipped up over her thigh at a sprint, 111-178 deg.) */
export const SUB_H = 1 / 120;
export const SUB_MAX = 8;
/** A particle's speed cap (m/s): a guard, not a working limit. */
export const V_CAP = 12;
/** Sleep: every particle under SLEEP_V (m/s) in its root's own frame for SLEEP_T (s), the air at her under SLEEP_WIND
 *  (m/s) and the root's acceleration (low-passed) under SLEEP_ACC (m/s2). (cloth.md 2.6 proposed 0.2 m/s2 measured on
 *  the root's travel; an idle's breath and weight shift put her head at 0.2-1.0 m/s2 and her pelvis at 0.06-0.2
 *  (bench, standing), so at 0.2 nothing standing would ever sleep: the stillness is read in the root's frame instead, and
 *  the root's own acceleration only wakes a piece past 1.0.) */
export const SLEEP_V = 0.01, SLEEP_T = 1.0, SLEEP_WIND = 0.3, SLEEP_ACC = 1.0;
/** (round 5) The sleep through an idle (solver.js, ClothPiece.qe): every free particle within SLEEP_D (m) of its running
 *  mean (time constant SLEEP_EMA, s) in the level frame for SLEEP_T; calm also asks the root under SLEEP_RV (m/s) and
 *  turning under SLEEP_YAW (rad/s). Asleep, it blends from where it was to its mean over SLEEP_BLEND (s), and wakes when
 *  the root's up has turned past acos(SLEEP_TILT) from the one it slept with or a body collider comes more than SLEEP_PEN
 *  (m) into the soft surface at a sleeping particle (less: the particle is put back on it). */
export const SLEEP_D = 0.01, SLEEP_EMA = 0.15, SLEEP_RV = 0.3, SLEEP_YAW = 0.5, SLEEP_BLEND = 0.12, SLEEP_TILT = Math.cos(12 * Math.PI / 180), SLEEP_PEN = 0.02;
/** The reset's settle: substeps at the frame's substep with the wind at 0 and the colliders in place (2 s). */
export const RESET_SUBSTEPS = 480;
/** A root that moves further than this in one frame (m) re-seats the piece (as RESEAT_D2 for the chains). */
export const RESEAT_D = 1.0;
