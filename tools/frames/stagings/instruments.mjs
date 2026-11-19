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
 * M2 WAVE 3, BEHAVIOUR: F38 (the lee walk) and F39 (the Screed fight). Both stand their machines up in `world` with the
 * game's own kinds and then HOLD them (update off, as page.mjs holds a line-up actor after its settle), so nothing in
 * frame moves but the wind and the cloth: a wall-clock staging that two repeats can grade (M2 rule 2), not yet the
 * sim-time walk itself (that is the A-moving-cover and A-screed-fight rows').
 *   F38  the herd's slope below the Plumb's terrace (src/world/holds/blockout.js HERD_SLOPE, PLUMB_TERRACE): three
 *        Tillers in file at 9.5 m on the slope's bearing, the middle one 90 % of the way up; the Plumb on its terrace
 *        45 m off, calm; Brea crouched 0.7 m off the middle hull's far flank (the lee), facing up the file. No seed-bag
 *        youth (the Holds people are area B's): a stand-in.
 *   F39  the Screed stalled on the outer wall at compass 45 deg from Ninewalls' centre (its blade at wall-1's face),
 *        its brain set to the stall (blade planted at its working height); three Sickles circling her at 9-14 m
 *        (sickle-rules.js circlePos at 1 s); Brea 9 m off its right side, facing it. No people, no dust: stand-ins.
 */
const HERD = (() => {
  const a = { e: -140, n: -205 }, b = { e: -65, n: -145 }, de = b.e - a.e, dn = b.n - a.n, L = Math.hypot(de, dn), ue = de / L, un = dn / L;
  const mid = { e: a.e + de * 0.9, n: a.n + dn * 0.9 };
  return { ue, un, mid, brea: { e: mid.e + un * 1.4, n: mid.n - ue * 1.4 }, bearing: Math.atan2(ue, un) * 180 / Math.PI };
})();
FRAMES.push(
  {
    id: 'F38', subject: 'the lee walk: Brea crouched beside a Tiller hull, the Plumb on the terrace beyond', in: 'M2', hour: 16.5, weather: 'trade',
    at: { en: [+HERD.brea.e.toFixed(2), +HERD.brea.n.toFixed(2)] }, bearing: +HERD.bearing.toFixed(1),
    camera: { mode: 'orbit', yawRel: 218, dist: 4.6, height: 1.5, target: { fwd: 3.5, side: 2.0, up: 1.3 }, fov: 60 },
    state: { pose: 'crouch', hud: false },
    ref: { written: 'her whole figure inside the hull\'s shadow from the Plumb\'s lamp; >= 3 hulls in file; a seed-bag youth behind; the Plumb\'s lamp bone-gold' },
    note: 'M2 wave 3: three Tillers in file on the herd\'s slope, the Plumb on its terrace 45 m off (calm, bone-gold), Brea crouched in the middle hull\'s lee; the machines are held for the frame. The youth is a stand-in (no Holds people yet).',
  },
  {
    id: 'F39', subject: 'the Screed fight: the Screed stalled on Ninewalls\' outer wall, three Sickles, Brea', in: 'M2', hour: 16.5, weather: 'trade',
    at: { en: [44.83, -169.9] }, bearing: 321,
    camera: { mode: 'orbit', yawRel: 160, dist: 7.5, height: 2.6, target: { fwd: 7, side: 0.5, up: 1.8 }, fov: 60 },
    state: { pose: 'idle', hud: false },
    ref: { written: 'scale and dust only, against the masked fight panel (no crop cut yet; the red eye and the animal body masked)' },
    note: 'M2 wave 3: the Screed (3.8 m) stalled with its blade on wall-1, three Sickles circling her, Brea 9 m off its right side. No dust yet (the cut order keeps the Screed\'s size and look); no people: stand-ins.',
  },
);

/**
 * M2 WAVE 4, THE HOUR: F45-transit, the Transit's far form from the last beat's anchor (area C's check of its far form
 * for area F's F45). Brea where "True Ground"'s read puts her (src/game/hour.js `_malpaisEdge`: the Malpais edge nearest
 * Ninewalls and 22 m inside it, engine (133.2, 83.2)), at 12:00 in calima snapped in, looking at the far form
 * (src/instruments/far/transit.js STATION, 86 m off on a bearing of 26 deg and about 45 m above her on the shelf). The
 * staging asks for it (`ctx.transitFar.show(true)`, as the beat does) and waits for its GLB. A wall-clock frame: nothing
 * moves but the dust, the wind and the cloth.
 */
FRAMES.push({
  id: 'F45-transit', subject: 'the Transit\'s far form in calima at noon, from the last beat\'s anchor at the Malpais edge', in: 'M2', hour: 12, weather: 'calima',
  at: { en: [133.2, -83.2] }, bearing: 26,
  camera: { mode: 'orbit', yawRel: 180, dist: 4.5, height: 1.9, target: { fwd: 86, side: 0, up: 45 }, fov: 60 },
  state: { pose: 'idle', hud: false },
  ref: { crops: ['board-calima'], written: 'three pale staff legs and the drum in amber haze, never against a low sun (sun >= 45 deg, 11:30-12:30); the far form is the read, not its detail' },
  note: 'M2 wave 4: the far form (one mesh, no behaviour) as the read-transit beat shows it; F45 (area F) is the dust and the sun, this is the far form in it.',
});

const farTransit = {
  async world(f, api) {
    const C = api.C, env = C.environment;
    if (env.weather !== 'calima' || (env.weatherParams?.calima ?? 1) < 0.999) env.setWeather('calima', 0);
    const far = C.transitFar;
    if (!far) { api.standIn('no ctx.transitFar in this build'); return; }
    api.undo(() => far.show(false));
    far.show(true);
    const t0 = performance.now();
    while (!far.root && !far.failed && performance.now() - t0 < 30000) { await api.sleep(150); far.show(true); }
    far.show(true);
    await api.frames(3);
    const r = far.report();
    window.__f45transit = r;
    if (!r.visible) api.standIn(`the far form is not up: ${r.failed || r.gate.why || 'not loaded'}`);
  },
};

const holdF38 = {
  async world(f, api) {
    const C = api.C, M = C.machines;
    const t0 = performance.now();
    while (!M?.expansionReady && performance.now() - t0 < 60000) await api.sleep(200);
    const V = C.player.position.constructor, hy = (x, z) => C.terrain.getHeight(x, z);
    const made = [];
    const gone = (m) => { try { if (M.sites?.dispose) M.sites.dispose(m); else m.dispose?.(); } catch { try { m.dispose?.(); } catch { /* */ } } };
    api.undo(() => { for (const m of made) gone(m); });
    // world x = e, z = -n (ISLAND_SCALE 1); the file's heading in the game's convention atan2(dx, dz)
    const ue = 0.7809, un = 0.6247;
    const mid = { x: -72.5, z: 151 }, hd = Math.atan2(ue, -un);
    const herd = { center: new V(mid.x, 0, mid.z), vector: new V(ue, 0, -un), alarmed: false, rearguard: null, members: [] };
    M.squads?.registerHerd?.(herd);
    for (let i = -1; i <= 1; i++) {
      const x = mid.x + ue * 9.5 * i, z = mid.z - un * 9.5 * i;
      const m = M.spawn('tiller', x, z, { herd, heading: hd, route: [new V(x, 0, z)] });
      if (!m) { api.standIn('a Tiller did not stand up'); continue; }
      M.squads?.join?.(m, herd, 'herd');
      m.heading = hd; m.root.position.set(x, hy(x, z), z); m.root.rotation.y = hd;
      made.push(m);
    }
    const pl = M.spawn('plumb', -70, 107);
    if (pl) {
      const ph = Math.atan2(C.player.position.x + 70, C.player.position.z - 107);
      pl.heading = ph; pl.root.position.set(-70, hy(-70, 107), 107); pl.root.rotation.y = ph; made.push(pl);
    } else api.standIn('the terrace Plumb did not stand up');
    await api.sleep(600);
    for (const m of made) {
      try { m.seatFeet?.(); } catch { /* */ }
      m.suspicion = 0; if (m.sc) m.sc.suspicion = 0; m._unseenT = 99; if (m.state !== 'patrol') m.setState?.('patrol');
      const u0 = m.update; m.update = function () {}; api.undo(() => { m.update = u0; });
    }
    api.standIn('no seed-bag youth (no Holds people in this build): area B');
    window.__f38 = { tillers: made.filter((m) => m.kind === 'tiller').length, plumb: !!pl, plumbDist: pl ? +Math.hypot(pl.position.x - C.player.position.x, pl.position.z - C.player.position.z).toFixed(1) : null };
  },
};

const holdF39 = {
  async world(f, api) {
    const C = api.C, M = C.machines;
    const t0 = performance.now();
    while (!M?.expansionReady && performance.now() - t0 < 60000) await api.sleep(200);
    const V = C.player.position.constructor, hy = (x, z) => C.terrain.getHeight(x, z);
    const made = [];
    const gone = (m) => { try { if (M.sites?.dispose) M.sites.dispose(m); else m.dispose?.(); } catch { try { m.dispose?.(); } catch { /* */ } } };
    api.undo(() => { for (const m of made) gone(m); });
    const NW = await import('/src/world/settlements/ninewalls-layout.js');
    NW.resetWalls(); api.undo(() => NW.resetWalls());
    const S = await import('/src/instruments/kinds/sickle-rules.js');
    const at = { x: 39.17, z: 162.83 }, hd = -0.7854;
    const sc = M.spawn('screed', at.x, at.z, { heading: hd });
    if (sc && sc.brain) {
      made.push(sc);
      const B = sc.brain;
      B.x = at.x; B.z = at.z; B.heading = hd; B.phase = 'stall'; B.phaseT = 0.8; B.bladeY = 0.85;
      sc.heading = hd; sc.root.position.set(at.x, hy(at.x, at.z), at.z); sc.root.rotation.y = hd;
      sc.setState?.('alert');
    } else api.standIn('the Screed did not stand up as the live kind');
    const P = C.player.position;
    for (let i = 0; i < 3; i++) {
      const q = S.circlePos(i, 3, 1.0, P.x, P.z);
      const h = Math.atan2(P.x - q.x, P.z - q.z);
      const m = M.spawn('sickle', q.x, q.z, { heading: h });
      if (!m) { api.standIn('a Sickle did not stand up'); continue; }
      m.heading = h; m.root.position.set(q.x, hy(q.x, q.z), q.z); m.root.rotation.y = h;
      made.push(m);
    }
    // a few frames of the machine stack (the gait seats the legs, the lamps take the state), then held
    await api.sleep(500);
    for (const m of made) {
      try { m.seatFeet?.(); } catch { /* */ }
      if (m.kind === 'sickle') { m.setState?.('alert'); }
      const u0 = m.update; m.update = function () {}; api.undo(() => { m.update = u0; });
    }
    api.standIn('no people at the fight and no dust (the cut order keeps the Screed\'s size and look)');
    window.__f39 = { screed: !!sc, sickles: made.filter((m) => m.kind === 'sickle').length, screedToHer: sc ? +Math.hypot(sc.position.x - P.x, sc.position.z - P.z).toFixed(1) : null };
  },
};

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
    window.__lineupFade = { id: f.id, fade: p.fade ?? null, fadeCur: p._fadeCur ?? null, applied: p._fadeApplied ?? null, uniform: p._mats?.[0]?.u?.value ?? null, solidCut: p.solidCut ?? null, lensGap: p.lensGap ?? null, boomLength: p.boomLength ?? null };
    // also when the fade is 1 but was never pushed (`_fadeApplied` -1): a teleport resets the fields to 1 without
    // writing the dither uniforms, so her materials can keep the last frame's dither
    if ((p._fadeCur ?? 1) < 0.999 || (p.fade ?? 1) < 0.999 || p._fadeApplied !== 1) {
      p.fade = 1; p._fadeCur = 1; p._fadeApplied = -1;
      try { p._applyFade(1 / 60, performance.now() / 1000); } catch (e) { api.standIn(`hero fade not reset: ${e.message}`); }
    }
  },
};

/** @type {Record<string, { world?: Function, beforeFreeze?: Function }>} in-page hooks per frame id */
export const STAGINGS = { 'F23-tiller': unfade, 'F23-sickle': unfade, 'F23-screed': unfade, F38: holdF38, F39: holdF39, 'F45-transit': farTransit };

/** @type {Record<string, 'sim' | 'wall'>} */
export const STAGED = { 'F23-tiller': 'wall', 'F23-sickle': 'wall', 'F23-screed': 'wall', F38: 'wall', F39: 'wall', 'F45-transit': 'wall' };   // held machines: nothing moves but the wind and the cloth
