/**
 * WORLD STAGINGS (area A, the Holds, the Scar and the Malpais edge; M2 wave 1 seam, M2 briefs §3.2 "Sim-time
 * stagings"). The engine merges every lane's `tools/frames/stagings/<area>.mjs` into the filmer once (as
 * tools/gates/hero-sweep/session.mjs merged the clip files); lanes never edit `page.mjs` or `frameset.json`.
 *
 * What this file exports, and nothing else:
 *
 *   FRAMES     frameset-shaped frame definitions this area films (validated by tools/frames/frameset.mjs
 *              `validate` rules: id, subject, hour, weather, at, camera, state, ref). A fixed-camera frame needs no
 *              staging function: `stageFrame` stands it from its definition.
 *   STAGINGS   { [frameId]: WorldStaging } for frames whose world needs putting in a state from a clean slate
 *              (sim time, page.mjs 7a). Empty until the area has a moving subject (calima at noon, F45, wave 4).
 *   MASKS      the skyline-mask targets: which accepted frames the area's places can appear in, and the region and
 *              headroom the mask is built from (tools/world/skyline-masks.mjs).
 *
 * @typedef {object} WorldStaging
 * @property {string} id              the frame id it stages
 * @property {'wall' | 'sim'} clock   wall-clock frames are filmed with --repeat 2 and graded only if both agree
 * @property {(ctx: object, frame: object, opts: object) => (object | Promise<object>)} stage
 *   runs in the page after `stageFrame`'s slate; returns { frames, digest } for a sim-time staging
 *
 * @typedef {object} MaskTarget
 * @property {string} id              an accepted frame id, or a beat lens defined in FRAMES
 * @property {number} headroom        metres above the ground of the region in which new content may stand
 */

export const lane = 'world';

/**
 * Wave 1 (blockout): three lenses for the owner's next page, while the Holds are grey. F33 is the brief's frame (the
 * Holds from Ninewalls Rise; its look and its masked crops come in wave 2); F33-scar and F33-trig are this area's
 * blockout lenses (the Scar from Benchmark 1, and the T1 beat's lens from T1's deck toward T2, which is also the
 * T1 beat's skyline mask). Fixed cameras on the wall clock: nothing in them moves but the wind and the clouds.
 * @type {ReadonlyArray<object>}
 */
export const FRAMES = Object.freeze([
  {
    id: 'F33', subject: 'the Holds from Ninewalls Rise, golden (blockout)', in: 'M2', hour: 17.75, weather: 'trade',
    at: 'trig:T2', bearing: 305, camera: { mode: 'eye', eye: 9, pitch: -9, fov: 55 }, state: { pose: 'idle', hud: false },
    ref: { written: "wave 1 blockout: from 9 m over T2's deck (from its 4.6 m deck the Rise's own crown fills the lower half of the frame), Ninewalls' nine grey walls below, the slope above them to the Plumb's bench and the barranco, the Pans and Saltrow beyond; wave 2: 5-9 terrace tiers and >= 40 pit-cups countable, green on >= a third (HG2)" },
  },
  {
    id: 'F33-scar', subject: 'the Screed Scar from Benchmark 1 (blockout)', in: 'M2', hour: 17.75, weather: 'trade',
    at: { en: [-60.5, -353.6] }, bearing: 45, camera: { mode: 'eye', eye: 20, pitch: -10, fov: 50 }, state: { pose: 'idle', hud: false },
    ref: { written: "wave 1 blockout: 20 m over the Scar's floor 440 m from its north-east end, looking up it: the floor 25 m wide between its two berms running dead straight up the Holds past B1's pad (98 m ahead) toward the north-east skyline (HG1). From Brea's eye on its floor (a chase lens at B1, filmed at 0909873) the rising ground hides the line" },
  },
  {
    id: 'F33-trig', subject: "the T1 beat's lens: from T1's deck toward T2 (blockout)", in: 'M2', hour: 9, weather: 'trade',
    at: 'trig:T1', bearing: 71, camera: { mode: 'eye', eye: 4.6, pitch: -2, fov: 55 }, state: { pose: 'idle', hud: false },
    ref: { written: "the slice's 0:18 beat at blockout: the Holds rising beyond the Organ Shelf, the Scar's pale line across them and its south-west end at the Shelf's foot, T2 on the Rise; the skyline mask of the T1 beat" },
  },
]);

/** @type {Readonly<Record<string, WorldStaging>>} */
export const STAGINGS = Object.freeze({});

/**
 * The frames the Holds' places can appear in (M2 briefs §2 rule 3, HG8). The region and headrooms are
 * tools/world/skyline-masks.mjs MASK_REGION; the masks are built from each frame's own filmed lens.
 * @type {ReadonlyArray<MaskTarget>}
 */
export const MASKS = Object.freeze(['F02', 'F05', 'F17', 'F24', 'F25', 'F32', 'F33-trig'].map((id) => Object.freeze({ id, headroom: 12 })));
