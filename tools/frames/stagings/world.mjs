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

/** @type {ReadonlyArray<object>} */
export const FRAMES = Object.freeze([]);

/** @type {Readonly<Record<string, WorldStaging>>} */
export const STAGINGS = Object.freeze({});

/** @type {ReadonlyArray<MaskTarget>} */
export const MASKS = Object.freeze([]);
