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

/**
 * The line-up slate (M2 wave 1): F23-peg's place, F14's raked salt cell (E -314.8, N -267.0, bearing 315: open crust,
 * no meadow over the legs), 16:30 in the trade wind, the HUD off, Brea idle and the blockout 6 m ahead of her along the
 * cell, facing her and calmed before the freeze. The lens is F23's rear three-quarter orbit, set back for the bigger
 * hulls. These are grey blockouts (gen-blockout.mjs): the frames show size, silhouette and the one lamp, never finish.
 */
const SLATE = { hour: 16.5, weather: 'trade', at: { en: [-314.8, -267] }, bearing: 315 };
const actor = (kind) => ({ pose: 'idle', hud: false, actors: [{ type: 'instrument', kind, dist: 6, side: 0, face: 'brea', calm: true }] });

/** @type {Array<Record<string, any>>} */
export const FRAMES = [
  {
    id: 'F23-tiller', subject: 'the Tiller (default form, grey blockout) with Brea at 6 m', in: 'M2', ...SLATE,
    camera: { mode: 'orbit', yawRel: 155, dist: 5.0, height: 1.8, target: { fwd: 4.5, side: 0, up: 1.25 }, fov: 50 },
    state: actor('tiller-blockout'),
    ref: { crops: ['inst-tiller', 'inst-lineup'] },
    note: 'M2 wave 1 blockout: the default form (2.7 m, 4.5 x 1.8 m on six high-kneed stilts, a shallow dome, the drum lamp at the bow, a mast and finial) with the dust skirt IN0 asks for (the sightline passed under the M1 body\'s belly). Grey: judge size and silhouette only.',
  },
  {
    id: 'F23-sickle', subject: 'the Sickle (grey blockout) with Brea at 6 m', in: 'M2', ...SLATE,
    camera: { mode: 'orbit', yawRel: 155, dist: 4.5, height: 1.5, target: { fwd: 4, side: 0, up: 0.8 }, fov: 50 },
    state: actor('sickle'),
    ref: { crops: ['inst-lineup'] },
    note: 'No board design: drawn fresh in the shared language (Q3). M2 wave 1 blockout: a low wedge on four raked-back legs, the hub and its two blades at the front, one slit lamp, 1.7 m. Material, lamp and finish are not built yet; silhouette is "no reference".',
  },
  {
    id: 'F23-screed', subject: 'the Screed (grey blockout) with Brea at 6 m', in: 'M2', ...SLATE,
    camera: { mode: 'orbit', yawRel: 155, dist: 6.5, height: 2.1, target: { fwd: 5.5, side: 0, up: 1.7 }, fov: 55 },
    state: actor('screed'),
    ref: { crops: ['inst-lineup'] },
    note: 'M2 wave 1 blockout: the grader body (the board has none; Q3) with the 3.6 m moldboard on two rams, ripper tines, the cab mast with its lamp drum, disc and finial to 3.8 m. Its cab mast is to be judged against the board\'s survey-tripod mast (that crop is not cut yet); the body is "no reference".',
  },
];

/** @type {Record<string, 'sim' | 'wall'>} */
export const STAGED = { 'F23-tiller': 'wall', 'F23-sickle': 'wall', 'F23-screed': 'wall' };   // a standing blockout: nothing moves
