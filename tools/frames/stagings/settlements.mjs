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
 *   F36  a street at work: the lens 15 m south-south-west of the tree (bible E -16.13, N -227.10) looking on bearing 20
 *        across the slope, the cistern (bearing 359 from it), the tree (20) and the tube mouth (45) in frame; written: 5
 *        people at work (none at blockout: wave 3's cast). At 48311d0 a lens up the south-west lane on bearing 60 saw
 *        only the hillside (the ground under the village climbs 26 deg there)
 *   F37  Oro beside Brea at 3 m: the PEOPLE crop, staged as F20 stages Ansel (golden 17:30, the orbit lens 4 m in
 *        front of her, Oro 3 m to her left facing the lens), in the tube mouth's forecourt (bible E 4.04, N -207.53,
 *        facing 250: the lens looks up the north-east lane, the tube mouth and the terraces behind them). At wave 1 it
 *        stood in the flat studio light, which hides every mesh but Brea's (page.mjs 3b), so Oro could never be filmed
 *        there: the staging error the blockout review named
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
    at: { en: [-16.13, -227.1] }, bearing: 20, camera: { mode: 'eye', eye: 1.7, pitch: 8, fov: 55 },
    state: { pose: 'idle', hud: false },
    ref: { written: '5 people at work in ash-grey and carmine, each with a violet accent; the tube mouth and the cistern in frame.' },
  },
  {
    id: 'F37', subject: 'Oro beside Brea at 3 m', in: 'M2', hour: 17.5, weather: 'trade',
    at: { en: [4.04, -207.53] }, bearing: 250,
    camera: { mode: 'orbit', yawRel: 0, dist: 4.0, height: 1.7, target: { fwd: 0, side: 1.5, up: 1.05 }, fov: 42 },
    state: { pose: 'idle', hud: false, actors: [{ type: 'person', id: 'oro', dist: 3, side: 90, face: 'camera' }] },
    ref: { crops: ['people-lineup'] },
    note: 'Staged as F20 (Ansel beside Brea at 3 m), not in the studio light: the studio hides every mesh but hers.',
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
    // M2 wave 3: five of the Holds cast at work (src/world/npc/people/holds.js AT_WORK: a farmer drawing water at the cistern,
    // a picker at the tree's foot, a youth sowing by a door, a picker kneeling to sort at the next, a farmer at the third)
    async world(f, api) {
      if (!api.C.settlements?.ninewalls) api.standIn('no Ninewalls in this build');
      const H = api.C.people?.holds;
      if (!H?.stageAtWork) { api.standIn('no Holds people in this build: the street is empty'); return; }
      api.undo(() => H.unstage());
      const ps = await H.stageAtWork();
      if (ps.length < 5) api.standIn(`${ps.length} of 5 people at work`);
      // let the mixers pose them in their work clips before the settle
      await api.frames(3);
    },
  },
};
