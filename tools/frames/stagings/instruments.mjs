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
 * no meadow over the legs), 16:30 in the trade wind, the HUD off, Brea idle and the Instrument 6 m ahead of her along
 * the cell, facing her and calmed before the freeze. The lens is F23's rear three-quarter orbit, set back for the
 * bigger hulls. M2 wave 2: the three are their art (gen-tiller.mjs, gen-sickle.mjs, gen-screed.mjs), and F23-tiller
 * films the Tiller that PLAYS (kind `tiller`, the corrected form), not the grey line-up kind.
 */
const SLATE = { hour: 16.5, weather: 'trade', at: { en: [-314.8, -267] }, bearing: 315 };
const actor = (kind) => ({ pose: 'idle', hud: false, actors: [{ type: 'instrument', kind, dist: 6, side: 0, face: 'brea', calm: true }] });

/** @type {Array<Record<string, any>>} */
export const FRAMES = [
  {
    id: 'F23-tiller', subject: 'the Tiller that plays (the corrected form) with Brea at 6 m', in: 'M2', ...SLATE,
    camera: { mode: 'orbit', yawRel: 155, dist: 5.0, height: 1.8, target: { fwd: 4.5, side: 0, up: 1.25 }, fov: 50 },
    state: actor('tiller'),
    ref: { crops: ['inst-tiller', 'inst-lineup'] },
    note: 'M2 wave 2 art: the corrected Tiller (2.7 m, about 4.5 x 1.8 m): a plated white-enamel hull with brass hoops and strakes, the dust skirt to 0.5 m (the herd\'s cover, IN0), six high-kneed stilts outside it, the lamp drum in a yoke at the bow, a seed hopper with a level vial and a gyroscope ring, two antennae and a banner, the auger at the stern. Judge the shared language against the crop; the skirt is the cover the herd beat needs.',
  },
  {
    id: 'F23-sickle', subject: 'the Sickle with Brea at 6 m', in: 'M2', ...SLATE,
    camera: { mode: 'orbit', yawRel: 155, dist: 4.5, height: 1.5, target: { fwd: 4, side: 0, up: 0.8 }, fov: 50 },
    state: actor('sickle'),
    ref: { crops: ['inst-lineup'] },
    note: 'No board design: drawn fresh in the shared language (Q3). M2 wave 2 art: a low plated wedge on four raked-back legs, the hub (an oxblood band on its cowl, the brass bearing exposed) and its two curved bronze blades, ONE lamp drum on its right shoulder, the coolant flask a pale-ice vial, one antenna, 1.7 m. Material, lamp and finish against the line-up; silhouette is "no reference".',
  },
  {
    id: 'F23-screed', subject: 'the Screed with Brea at 6 m', in: 'M2', ...SLATE,
    camera: { mode: 'orbit', yawRel: 155, dist: 6.5, height: 2.1, target: { fwd: 5.5, side: 0, up: 1.7 }, fov: 55 },
    state: actor('screed'),
    ref: { crops: ['inst-lineup'] },
    note: 'M2 wave 2 art: the grader body (the board has none; Q3): a wide plated hull on six short heavy legs, a spoil hopper, the 3.5 m bronze moldboard on a push frame and two rams (their seals the weak points), the ripper, and the cab mast in the board\'s survey-tripod language: an enamel column, ONE lamp drum, the disc platform with a vial, two banners and a finial to 3.8 m. The body is "no reference".',
  },
];

/**
 * Before the freeze (page.mjs step 9): an orbit lens replaces the play camera's own update (page.mjs `ownLens`), so
 * the hero's occlusion fade is never computed again for the frame and stays at whatever the last play-camera frame
 * left (wave 1: Brea screen-door dithered in F23-tiller, both repeats). The line-up frames record that value and set
 * her back to fully drawn; the record is read by tools/instruments/lineup-probe-page.mjs.
 */
const unfade = {
  beforeFreeze(f, api) {
    const p = api.C.player;
    if (!p) return;
    window.__lineupFade = { id: f.id, fade: p.fade ?? null, fadeCur: p._fadeCur ?? null, solidCut: p.solidCut ?? null, lensGap: p.lensGap ?? null, boomLength: p.boomLength ?? null };
    if ((p._fadeCur ?? 1) < 0.999 || (p.fade ?? 1) < 0.999) {
      p.fade = 1; p._fadeCur = 1; p._fadeApplied = -1;
      try { p._applyFade(1 / 60, performance.now() / 1000); } catch (e) { api.standIn(`hero fade not reset: ${e.message}`); }
    }
  },
};

/** @type {Record<string, { world?: Function, beforeFreeze?: Function }>} in-page hooks per frame id */
export const STAGINGS = { 'F23-tiller': unfade, 'F23-sickle': unfade, 'F23-screed': unfade };

/** @type {Record<string, 'sim' | 'wall'>} */
export const STAGED = { 'F23-tiller': 'wall', 'F23-sickle': 'wall', 'F23-screed': 'wall' };   // a standing blockout: nothing moves
