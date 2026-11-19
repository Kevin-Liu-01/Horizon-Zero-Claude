/**
 * Area C's Frame Set additions (instruments; M2 briefs §3.2 "Sim-time stagings", §3.3).
 *
 * The lane exports its frames from this file and never edits `tools/frames/page.mjs` or `frameset.json`:
 * engine merges them once (as `session.mjs` merged the clip files). Each entry is a frame in
 * `frameset.json`'s own schema (validated by `tools/frames/frameset.mjs validate`), so the merge is a
 * concatenation. Ids continue the set: F23-<kind>, F38, F39.
 *
 *   FRAMES   frame definitions (frameset schema)
 *   STAGED   { [frameId]: 'sim' | 'wall' }  how each is staged (M2 rule 2: a moving subject is on simulation time)
 *
 * Nothing private is in this file: references are named by crop id only.
 */

/** @type {Array<Record<string, any>>} */
export const FRAMES = [];

/** @type {Record<string, 'sim' | 'wall'>} */
export const STAGED = {};
