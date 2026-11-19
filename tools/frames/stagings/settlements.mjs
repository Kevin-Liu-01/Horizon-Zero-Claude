/**
 * Area B's Frame Set additions (settlements and people; M2 briefs §3.2 "Sim-time stagings", §3.3): F34-F37.
 *
 * Merged by tools/frames/stagings/index.mjs (engine); this lane never edits page.mjs or frameset.json. Each entry is a
 * frame in frameset.json's own schema. The places come from src/world/settlements/ninewalls-layout.js (the village's
 * centre at bible E -11, N -213; the Rise is trig T2 at E 75, N -267).
 *
 *   F34  Ninewalls from the Rise, state `before`: the lens 7 m from T2's pillar toward the village (bible E 69.07,
 *        N -263.28), 101 m from the centre, looking on bearing 310 (8 deg right of the centre, so the walls' north-east
 *        backs up the hill are in frame) and 6 deg down. Written: 9 walls countable, >= 12 roofs below wall-top, the
 *        dragon tree's canopy under 9 m, the line on >= 3 walls
 *   F35  the same lens after "True Ground" (state `after`): the line on 0 walls (the staging clears it; a cut wall
 *        stays cut)
 *   F36  a street at work: the lens in the south-west lane (bible E -23.21, N -222.54) looking up it on bearing 60,
 *        the cistern and the tube mouth in frame; written: 5 people at work (none at blockout: wave 3's cast)
 *   F37  Oro beside Brea at 3 m: the PEOPLE crop; Oro is wave 2 (no person by that id until then)
 *
 * The world hooks run in the page (each serialised on its own; `api.C` is the game's ctx). A frame filmed before the
 * village exists says so as a stand-in.
 */
export const lane = 'settlements';

export const FRAMES = [
  {
    id: 'F34', subject: 'Ninewalls from the Rise, before True Ground', in: 'M2', hour: 15.5, weather: 'trade',
    at: { en: [69.07, -263.28] }, bearing: 310, camera: { mode: 'eye', eye: 1.7, pitch: -6, fov: 45 },
    state: { pose: 'idle', hud: false },
    ref: { written: 'From Ninewalls Rise: the nine crescent walls countable; 12 or more roofs below wall-top height; the dragon tree\'s canopy under 9 m; the Datum Line, a flat vermilion band 0.25 m tall with no glow, on 3 or more walls.' },
    note: 'Blockout (M2 wave 1): grey walls and boxes, the line as a flat band in the walls\' vertex colour. tools/build/settlements/ninewalls-rows.mjs NW0 (c) counts the walls from this lens in Node.',
  },
  {
    id: 'F35', subject: 'Ninewalls from the Rise, after True Ground', in: 'M2', hour: 15.5, weather: 'trade',
    at: { en: [69.07, -263.28] }, bearing: 310, camera: { mode: 'eye', eye: 1.7, pitch: -6, fov: 45 },
    state: { pose: 'idle', hud: false },
    ref: { written: 'The same lens as F34 after the re-survey: the Datum Line on 0 walls; every other count as F34; a wall the Screed cut stays cut.' },
  },
  {
    id: 'F36', subject: 'a Ninewalls street at work', in: 'M2', hour: 16.5, weather: 'trade',
    at: { en: [-23.21, -222.54] }, bearing: 60, camera: { mode: 'eye', eye: 1.7, pitch: 3, fov: 55 },
    state: { pose: 'idle', hud: false },
    ref: { written: '5 people at work in ash-grey and carmine, each with a violet accent; the tube mouth and the cistern in frame.' },
  },
  {
    id: 'F37', subject: 'Oro beside Brea at 3 m', in: 'M2', hour: 17.5, weather: 'trade',
    at: { en: [-23.21, -222.54] }, bearing: 60,
    camera: { mode: 'orbit', yawRel: 0, dist: 4.0, height: 1.7, target: { fwd: 0, side: 1.5, up: 1.05 }, fov: 42 },
    light: 'studio',
    state: { pose: 'idle', hud: false, actors: [{ type: 'person', id: 'oro', dist: 3, side: 90, face: 'camera' }] },
    ref: { crops: ['people-lineup'] },
    note: 'Oro is wave 2: until his person exists the filmer names the missing actor as a stand-in.',
  },
];

/** F34-F36 are fixed lenses on a still village (wall clock is honest; --repeat 2 grades them). F37 is a slate. */
export const STAGED = { F34: 'wall', F35: 'wall', F36: 'wall', F37: 'wall' };

export const STAGINGS = {
  F34: {
    world(f, api) {
      const nw = api.C.settlements?.ninewalls;
      if (!nw) { api.standIn('no Ninewalls in this build'); return; }
      const W = nw.walls, was = W.wallsSave().get();
      W.resetWalls(); nw.update(0);
      api.undo(() => { W.wallsSave().set(was); nw.update(0); });
    },
  },
  F35: {
    world(f, api) {
      const nw = api.C.settlements?.ninewalls;
      if (!nw) { api.standIn('no Ninewalls in this build'); return; }
      const W = nw.walls, was = W.wallsSave().get();
      for (const w of W.WALLS) W.setPainted(w.id, false);
      nw.update(0);
      api.undo(() => { W.wallsSave().set(was); nw.update(0); });
    },
  },
  F36: {
    world(f, api) {
      if (!api.C.settlements?.ninewalls) api.standIn('no Ninewalls in this build');
      api.standIn('no Holds people in this build (wave 3): the street is empty');
    },
  },
};
