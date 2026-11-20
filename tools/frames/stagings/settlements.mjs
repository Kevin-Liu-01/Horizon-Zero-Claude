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
 *   F36  a street at work: the lens on the cistern's pad, 3.3 m south-south-east of its centre (bible E -15.65,
 *        N -222.97), looking up the lane on bearing 20, 12 deg up, fov 45: the cistern's kerb lower left, the tree, the
 *        tube mouth upper right (29 m); written: 5 people at work, each held in its work clip (src/world/npc/people/
 *        holds.js AT_WORK). The first restage (E -17.25, N -223.83, bearing 45) stood a metre under the kerb. At 48311d0 a lens up the south-west lane on bearing 60 saw only the hillside (the ground under
 *        the village climbs 26 deg there); from wave 3 to the M2 exit the lens 15 m south-south-west of the tree (E -16.13,
 *        N -227.10, bearing 20, fov 55) put two of the five on one line of sight and one behind the trunk: about three
 *        read
 *   F39-people  IN11's cost case: F39 (tools/frames/stagings/instruments.mjs: the Screed stalled on wall-1, three
 *        Sickles, Brea) with five of the Holds cast where the village shelters from it (holds.js stageSheltered: the
 *        shelter spots farthest from its threat lines, NW9); F39's own staging runs first, unchanged
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
    at: { en: [-15.65, -222.97] }, bearing: 20, camera: { mode: 'eye', eye: 1.7, pitch: 12, fov: 45 },
    state: { pose: 'idle', hud: false },
    ref: { written: '5 people at work in ash-grey and carmine, each with a violet accent; the tube mouth and the cistern in frame.' },
    note: 'M2 fix wave: restaged up the cistern\'s lane; the five are held in their work clips (tools/build/settlements/at-work-probe-page.mjs counts them in the frozen frame).',
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

/** IN11's cost case: F39's staging, plus five of the cast sheltering, in ONE lens (a lane frame of its own; F39 stays
 * instruments'). POLISH (frames lane): at 02f7125 it used F39's own lens (bearing 321, behind her left shoulder) and the
 * five sheltered 73-86 m behind it, at the doors on bearings 219-244 from her and 27-33 m lower: the frame drew what F39
 * draws (116 draws against 117) and IN11 was not measured as written. The people keep their shelter (holds.js
 * stageSheltered: the five spots farthest from the Screed's threat lines); the lens moves to hold them with the fight.
 * The people system hides a person past 90 m from the CAMERA (people/index.js HIDE_R), so the lens stands within 79 m of
 * all five and 76 m of the fight: 70 m from her toward the village's east side, 15 m over her ground (35 m over its
 * own), turned down 36 deg toward bearing 339, fov 60 (found in Node on recipe.js heightAt; a lens 25 m behind her
 * stood 115 m from them and drew none, run 20261120T002449Z-4e451a2-polish-x2-partial). The five at the doors fill the
 * lower left, the fight (Screed, three Sickles, Brea) the upper right; each person draws 120-404 px (the look probe,
 * run 20261120T013206Z-4e451a2-polish-x3-partial) */
FRAMES.push({
  id: 'F39-people', subject: 'IN11\'s cost case: the Screed fight with five of the Holds sheltering, all in the lens', in: 'M2', hour: 16.5, weather: 'trade',
  at: { en: [44.83, -169.9] }, bearing: 321,
  camera: { mode: 'orbit', yawRel: 130, dist: 70, height: 15, target: { fwd: -21.91, side: 46.12, up: -2.63 }, fov: 60 },
  state: { pose: 'idle', hud: false },
  ref: { written: 'IN11: F39\'s staging (Screed + 3 Sickles + Brea) with 5 people, all in the lens: p95 interval <= 16.7 ms, median GPU <= 14 ms' },
  note: 'A cost frame, not a look frame: the people shelter at the doors 73-86 m from her, as NW9 sends them, and the lens (within 90 m of them) holds them with the fight.',
});

/** F39-look (the frames lane): the LOOK frame of the Holds fight with the people in it (F39-people stays IN11's cost
 * frame, its people at the doors where holds.js stageSheltered sends them). Polish 3 kept that shelter and only moved the
 * lens: the fight stands OUTSIDE wall-1, 30-35 m above the doors and 73-86 m from them, and no lens held both (at 8572260,
 * run 20261120T033426Z-8572260-frames-p3b-partial-x2, the five 36-92 px tall, the Screed 19 px on the skyline, Brea
 * behind wall-1). So this frame stages its own people NEARER the fight: five of the same cast in wall-1's LEE, backs to
 * its inner face at the foot of its bank (64.25-64.7 m from the centre; the wall's centreline is at 67.2), on bearings
 * 48.6-55.6 from the centre, 7.6-14 m from the Screed and 4.1-6.3 m off its threat lines (holds.js threatDistance: the
 * charge line on its heading and the line to her), all within 25 m of them. The wall stands about 4.4 m over that terrace
 * and 2.4 m over the Screed's ground, between them and its blade. Each holds the game's shelter clip (Idle_FoldArms_Loop),
 * turned to the village below; the one nearest the blade looks at it. A Sickle the F39 circle puts inside wall-1 is
 * mirrored out across it for this frame (see the staging). The lens is from the people toward the fight: on the same
 * terrace past the fifth of them (bearing 65 from the centre, 63.5 m out), 7.5 m over its ground, aimed 0.3 of the way
 * from the five to the Screed, fov 36: the wall's curve leads from the five in the lower middle to the Screed over it, Brea
 * beyond it on the right. Chosen from filmed variants (a crane lens 13 m over the next terrace in, at b87afe7, showed mostly
 * the wall's face and the staging threw; lenses 13-20 m off along the terrace were filmed from an uncommitted tree). */
FRAMES.push({
  id: 'F39-look', subject: 'the Holds fight with five of the people sheltering in wall-1\'s lee below it (a look frame)', in: 'M2', hour: 16.5, weather: 'trade',
  at: { en: [44.83, -169.9] }, bearing: 321,
  camera: { mode: 'orbit', yawRel: 147.04, dist: 16.35, height: 1.87, target: { fwd: 2.68, side: 4.12, up: -0.5 }, fov: 36 },
  state: { pose: 'idle', hud: false },
  ref: { written: 'the Screed stalled on wall-1 with its Sickles and Brea; the Holds people sheltering in the wall\'s lee in their dyed wool, readable as people; the Screed >= 150 px tall and >= 3 people in the one frame' },
  note: 'F39\'s fight (a Sickle inside wall-1 mirrored out of the people\'s terrace); five of the cast staged in wall-1\'s lee 7.6-14 m from the Screed (not where NW9 sends them: F39-people keeps that); the lens on their terrace past them, 7.5 m up, toward the fight; the look probe reads each person\'s height on screen and the fight\'s.',
});

/** F34-F36 are fixed lenses on a still village (wall clock is honest; --repeat 2 grades them). F37 is a slate. */
export const STAGED = { F34: 'wall', F35: 'wall', F36: 'wall', F37: 'wall', 'F39-people': 'wall', 'F39-look': 'wall' };

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
    // five of the Holds cast at work, held in their work clips (src/world/npc/people/holds.js AT_WORK: a youth with the seed
    // bag at d3's door, a picker reaching over the cistern's kerb, a farmer watering the tree's foot, a picker gathering under it,
    // a farmer kneeling to draw water)
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
  'F39-people': {
    async world(f, api) {
      const base = window.__laneStagings?.F39;
      if (!base?.world) { api.standIn('no F39 staging in this film (tools/frames/stagings/instruments.mjs)'); return; }
      await base.world(f, api);
      const H = api.C.people?.holds;
      if (!H?.stageSheltered) { api.standIn('no Holds people in this build: nobody shelters'); return; }
      api.undo(() => H.unstage());
      const r = await H.stageSheltered(5);
      if (r.people.length < 5) api.standIn(`${r.people.length} of 5 people sheltering`);
      if (!r.screeds) api.standIn('no Screed within the alarm radius: the shelter spots are not ranked by its threat lines');
      window.__f39people = r.spots;
      await api.frames(3);
    },
  },
};
/* F39-look: F39's fight, then five of the cast in wall-1's lee, held in the shelter clip (the list lives in the hook: a
 * hook is serialised on its own, so a module constant is not in the page; at b87afe7 it was, and the staging threw) */
STAGINGS['F39-look'] = {
  async world(f, api) {
    const base = window.__laneStagings?.F39;
    if (!base?.world) { api.standIn('no F39 staging in this film (tools/frames/stagings/instruments.mjs)'); return; }
    await base.world(f, api);
    const H = api.C.people?.holds;
    if (!H?.stageAtWork) { api.standIn('no Holds people in this build: nobody shelters'); return; }
    const NW = await import('/src/world/settlements/ninewalls-layout.js');
    const HP = await import('/src/world/npc/people/holds.js');
    const sc = (api.C.machines?.list || []).find((m) => m && m.kind === 'screed' && !m._disposed && m.position);
    const S = sc ? { x: sc.position.x, z: sc.position.z } : { x: 39.17, z: 162.83 };
    const P = api.C.player.position, D2R = Math.PI / 180;
    // bearing from the centre (64.7 m out, the foot of wall-1's bank); turned to the village below by `turn` deg, or to the blade
    const FIVE = [
      { id: 'pit-farmer', b: 48.6, r: 64.7, face: 'screed' }, { id: 'pit-farmer-2', b: 50.0, r: 64.25, turn: -14 },
      { id: 'pit-farmer-3', b: 52.2, r: 64.7, turn: 8 }, { id: 'cochineal-picker', b: 53.3, r: 64.3, turn: -24 },
      { id: 'tiller-follower-2', b: 55.6, r: 64.6, turn: 16 },
    ];
    // a Sickle the circle (sickle-rules.js circlePos, F39) puts on the people's terrace, inside wall-1's inner face (66.5 m), is
    // mirrored out across the wall's line (137 m less its distance from the centre; its ring about her runs 10 m and she
    // stands 3 m outside the wall): people do not stand at ease 5 m from a Sickle. F39 and F39-people keep it where it is.
    const moved = [];
    for (const m of api.C.machines?.list || []) {
      if (!m || m.kind !== 'sickle' || m._disposed || !m.root) continue;
      const rr = Math.hypot(m.root.position.x - NW.CENTRE.x, m.root.position.z - NW.CENTRE.z);
      if (rr >= 66.5) continue;
      const b = NW.bearingOf(m.root.position.x, m.root.position.z), q = NW.polar(b, 137 - rr), was = [m.root.position.x, m.root.position.z];
      const h = Math.atan2(P.x - q.x, P.z - q.z);
      m.heading = h; m.root.position.set(q.x, api.C.terrain.getHeight(q.x, q.z), q.z); m.root.rotation.y = h;
      try { m.seatFeet?.(); } catch { /* */ }
      m.root.updateMatrixWorld?.(true);
      api.undo(() => { m.root.position.set(was[0], api.C.terrain.getHeight(was[0], was[1]), was[1]); });
      moved.push({ from: [+was[0].toFixed(2), +was[1].toFixed(2), +rr.toFixed(1)], to: [+q.x.toFixed(2), +q.z.toFixed(2), +(137 - rr).toFixed(1)] });
    }
    const list = FIVE.map((q, i) => {
      const at = NW.polar(q.b, q.r);
      // turned to the village below (the centre), by `turn` deg; or to the Screed's blade
      let face = NW.CENTRE;
      if (q.face === 'screed') face = S;
      else if (q.turn) { const a = Math.atan2(NW.CENTRE.x - at.x, NW.CENTRE.z - at.z) + q.turn * D2R; face = { x: at.x + Math.sin(a) * 10, z: at.z + Math.cos(a) * 10 }; }
      return { id: q.id, place: at, face, clip: 'Idle_FoldArms_Loop', offset: 0.3 + 0.13 * i };
    });
    api.undo(() => H.unstage());
    const people = await H.stageAtWork(list);
    if (people.length < 5) api.standIn(`${people.length} of 5 people sheltering`);
    window.__f39look = { people: list.map((w) => ({ id: w.id, x: +w.place.x.toFixed(2), z: +w.place.z.toFixed(2), bearing: +NW.bearingOf(w.place.x, w.place.z).toFixed(1),
      toScreedM: +Math.hypot(w.place.x - S.x, w.place.z - S.z).toFixed(1), toLinesM: sc ? +HP.threatDistance(w.place.x, w.place.z, sc, P).toFixed(1) : null })), sickleMoved: moved };
    await api.frames(3);
  },
};
