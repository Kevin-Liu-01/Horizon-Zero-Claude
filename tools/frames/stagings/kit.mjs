/**
 * Area D's Milestone 2 frames and their stagings (kit: Oro's kit and the Kit Rack). Contract: ./index.mjs.
 *
 * Wave 2 ("the look") films the Boat Gaff, the first family: on her as she carries it, and in her hand at the ready.
 * They are look frames for the owner's page, on the filmer's flat studio stage (the F08-F10 stage: Brea alone, soft
 * key, even fill), never graded against a reference (the gaff has none: Kevin's bars and the bible's words). F40-F43
 * (the guard, the pot cast, the hook-rip at contact, the Kit Rack) are wave 3's: their verbs are not built.
 *
 *   F40-open        the Pine Windwall open: its fan alone, standing on its rivet beside her (the shape's look)
 *   F40-stowed      the Pine Windwall closed on her left forearm (the bracer's place), three-quarter front
 *   F42-stowed      the gaff hanging from the back of her belt, three-quarter from behind (her right)
 *   F42-ready       the gaff in her right hand at the ready, side-on from her right
 *   F42-readyfront  the same, from in front
 * (ids: the gaff's frame number F42 with a kind, the frame set's `Fnn-kind` form; F42 itself, the hook-rip at contact
 * on a Sickle, is wave 3's)
 *
 * Staging: the Tube Smith's hand-over (`hero.grantOroKit`, the gaff only: the Windwall and the pots are not built), then
 * for the ready, key 3 (quick slot 3: the draw, 0.333 s of sim time) and 1.2 s of settle. Wall clock: the subject is a
 * held pose once the draw is done (the gaff layer's ready; only the wind moves), so these film with --repeat 2 and are
 * graded only where the two agree. Everything the hook changes is undone: the gaff back on its hanger at once, the kit
 * unbound, the gaff state dropped.
 */
export const lane = 'kit';

const STUDIO = { light: 'studio', hour: 13.0, weather: 'trade', at: 'place:openGround', bearing: 180 };

/** @type {object[]} frameset.json-shaped frame definitions, `in: 'M2'` */
export const frames = [
  {
    id: 'F42-stowed', subject: 'the Boat Gaff on her, from behind (her right), flat light', in: 'M2', ...STUDIO,
    camera: { mode: 'orbit', yawRel: 215, dist: 2.3, height: 1.0, target: 'body', fov: 40 },
    state: { pose: 'idle', hud: false },
    ref: { written: 'the gaff hangs butt up from the back of her belt right of her spine, its beak end behind her right thigh, clear of her legs, the quiver and the lance; it reads as a forged hook on a pine haft' },
    note: 'M2 wave 2 look (area D). KT0 moved the mount from the bible\'s left rear hip along the belt (kit-oro.mjs).',
  },
  {
    id: 'F40-stowed', subject: 'the Pine Windwall closed on her left forearm, three-quarter front (her left), flat light', in: 'M2', ...STUDIO,
    camera: { mode: 'orbit', yawRel: 45, dist: 2.2, height: 1.0, target: 'body', fov: 40 },
    state: { pose: 'idle', hud: false },
    ref: { written: 'the closed Windwall in the left bracer\'s place (bible 3.1, one-glance read 3): nine pine slats stacked along the back of her forearm on a brass rivet at the wrist, two leather cuffs; the bracer gone; clear of her hip and skirt' },
    note: 'M2 wave 2 look (area D): the closed Windwall (kit-oro.mjs); its guard, parry, bash and plant are wave 3 (F40).',
  },
  {
    id: 'F40-open', subject: 'the Pine Windwall open (its fan alone, standing beside her), flat light', in: 'M2', ...STUDIO,
    camera: { mode: 'orbit', yawRel: 30, dist: 3.1, height: 0.9, target: { fwd: 0.15, side: 0.35, up: 0.85 }, fov: 40 },
    state: { pose: 'idle', hud: false },
    ref: { written: 'a crescent fan of nine pine slats on a brass rivet, a woven palm leaf between them, two lacings; 0.9 m across its chord; it reads as a made thing of the Holds, not a round shield' },
    note: 'M2 wave 2 look (area D): the held Windwall\'s fan (src/combat/windwall.js, one uniform) shown standing on its rivet beside her, open; on her arm in the guard is wave 3 (F40).',
  },
  {
    id: 'F42-ready', subject: 'the Boat Gaff in her right hand at the ready, side-on, flat light', in: 'M2', ...STUDIO,
    camera: { mode: 'orbit', yawRel: 270, dist: 2.5, height: 1.0, target: 'body', fov: 40 },
    state: { pose: 'idle', hud: false },
    ref: { written: 'Kevin\'s bars: the fist at her right hip, the haft up and forward, the beak below her shoulder, the hook out in front of the knuckles; no hand above the shoulder or behind the head' },
    note: 'M2 wave 2 look (area D): the ready the draw ends in (gaffLayer.js READY).',
  },
  {
    id: 'F42-readyfront', subject: 'the Boat Gaff in her right hand at the ready, from in front, flat light', in: 'M2', ...STUDIO,
    camera: { mode: 'orbit', yawRel: 330, dist: 2.5, height: 1.0, target: 'body', fov: 40 },
    state: { pose: 'idle', hud: false },
    ref: { written: 'as F42-ready; the gaff\'s head reads (socket, beak, hook) at 2.5 m' },
    note: 'M2 wave 2 look (area D).',
  },
];

/* ---- wave 3 ("behaviour"): the verbs, each held at its key step (the verb's own clock clamped there, so a repeat
 * holds the same step of it; only the wind and the cloth move) ---- */
frames.push(
  {
    id: 'F40', subject: 'the Windwall guard, side-on from her left, the gaff in her right hand, flat light', in: 'M2', ...STUDIO,
    camera: { mode: 'orbit', yawRel: 90, dist: 2.6, height: 1.0, target: 'body', fov: 40 },
    state: { pose: 'idle', hud: false },
    ref: { written: "Kevin's bars (no reference): the fan open on her left forearm in front of her body, its top under her shoulders, no hand, forearm or slat behind her head; the gaff at the ready in her right hand" },
    note: 'M2 wave 3 (area D): windwallLayer.js GUARD, held in the guard (RMB with the gaff out).',
  },
  {
    id: 'F40-front', subject: 'the Windwall guard from in front, flat light', in: 'M2', ...STUDIO,
    camera: { mode: 'orbit', yawRel: 0, dist: 2.8, height: 1.0, target: 'body', fov: 40 },
    state: { pose: 'idle', hud: false },
    ref: { written: 'as F40: the crescent hangs from the forearm in front of her body' },
    note: 'M2 wave 3 (area D).',
  },
  {
    id: 'F41', subject: 'a pot cast at the release, side-on from her left, flat light', in: 'M2', ...STUDIO,
    camera: { mode: 'orbit', yawRel: 90, dist: 2.6, height: 1.0, target: 'body', fov: 40 },
    state: { pose: 'idle', hud: false },
    ref: { written: "Kevin's bars: a pendulum, no hand above the shoulder; the release in front of her below her chest, the hip turned into it" },
    note: 'M2 wave 3 (area D): potLayer.js, held at the release (src/combat/pots.js POT_CAST.releaseAt).',
  },
  {
    id: 'F42', subject: 'the gaff hook-rip mid-pull on a Sickle, three-quarter front from her right', in: 'M2', hour: 16.5, weather: 'trade', at: 'place:openGround', bearing: 180,
    camera: { mode: 'orbit', yawRel: 300, dist: 4.4, height: 1.4, target: { fwd: 1.3, side: 0, up: 0.85 }, fov: 45 },
    state: { pose: 'idle', hud: false },
    ref: { written: "Kevin's bars: the body performs it: the hook in the Sickle's part, the rip mid-pull (her pelvis dropping back, the lead foot stepping back), the fist below her shoulder; never a hand behind the head" },
    note: 'M2 wave 3 (area D): gaffLayer.js hookRip; polish 3: held mid-pull (half-way through its P phase), the Sickle moved so the hook\'s tip is in one of its parts (run.json names the part and the gap).',
  },
  {
    id: 'F42-light', subject: 'the gaff light 1 at contact, side-on from her right, flat light', in: 'M2', ...STUDIO,
    camera: { mode: 'orbit', yawRel: 300, dist: 2.6, height: 1.0, target: 'body', fov: 40 },
    state: { pose: 'idle', hud: false },
    ref: { written: "Kevin's bars: the hip leads, the fist across in front of her below her shoulder, the haft level, the hook leading" },
    note: 'M2 wave 3 (area D): gaffLayer.js light1, held at its contact (the end of S).',
  },
  {
    id: 'F43', subject: 'the Kit Rack open over the field, the world behind it', in: 'M2', hour: 16.5, weather: 'trade', at: 'place:openGround', bearing: 180,
    camera: { mode: 'chase' },
    state: { pose: 'idle', hud: true },
    ref: { written: 'a half-ring at the right edge, five sectors (BOW, LANCE, GAFF, POTS, NET), the rim graduated every 6 deg, dark violet glass, the lilac selection line; the world unfrozen behind it; no centre wheel' },
    note: 'M2 wave 3 (area D): src/ui/kitrack.js, opened as Tab does.',
  },
);

export const STAGED = { 'F40-open': 'wall', 'F40-stowed': 'wall', 'F42-stowed': 'wall', 'F42-ready': 'wall', 'F42-readyfront': 'wall', F40: 'wall', 'F40-front': 'wall', F41: 'wall', F42: 'wall', 'F42-light': 'wall', F43: 'wall' };

/** @type {Record<string, { world?: Function, beforeFreeze?: Function }>} (each hook self-contained: serialised alone) */
export const stagings = {
  'F40-open': {
    async world(f, api) {
      const C = api.C, p = C.player;
      let mod;
      try { mod = await import('/src/combat/windwall.js'); } catch (e) { api.standIn('no src/combat/windwall.js in this build'); return; }
      const ww = new mod.HeldWindwall(C);
      await ww.ready;
      if (!ww.u) { api.standIn('the held Windwall did not load'); return; }
      ww.setOpen(1);
      const T = mod.WINDWALL_FAN, mid = (T.spreadDeg / 2) * Math.PI / 180;
      // char space: the middle slat up (the fan's local +Y turned by `mid` about +Z lies at 90 + mid deg), its face
      // toward the lens at her front-left, standing on its rivet 0.78 m to her left, a little in front
      // (a child of her model, in her own frame: the studio stage shows her hierarchy alone)
      const g = ww.group, m = p.model;
      m.updateMatrixWorld(true);
      const sc = m.scale?.x || 1;
      g.rotation.set(0, 0, 0);
      g.rotateY(Math.PI / 4);
      g.rotateZ(-mid);
      g.position.set(0.78 / sc, 0.03 / sc, 0.25 / sc);
      g.scale.setScalar(1 / sc);
      g.visible = true;
      m.add(g);
      api.undo(() => { ww.dispose(); });
      await api.sleep(300);
    },
  },
  'F40-stowed': {
    async world(f, api) {
    const DRAW = false;
    const C = api.C, hero = C.player?.hero;
    if (!hero?.grantOroKit) { api.standIn('no hero.grantOroKit in this build'); return; }
    await hero.grantOroKit({ gaff: true, windwall: true, pots: 0 });
    api.undo(() => {
      const g = C.combat?.gaff, an = C.player?.animator;
      if (g) { g.want = false; g.after = null; g.owned = false; if (g.prop?.group) { g.prop.group.visible = false; g.prop.group.removeFromParent(); } }
      if (an) { an._gf = null; an._oroKit = null; }
      const K = hero.oro;
      hero.oro?.dispose?.();
      // a fresh (empty) kit for whatever films next
      if (K) hero.oro = new K.constructor(C.player);
      // (wave 3: the Windwall and the pots are granted too; their states and layers go with the kit)
      const ww = C.combat?.windwall; if (ww?.prop?.group) { ww.prop.group.visible = false; ww.prop.group.removeFromParent(); }
      C.combat?.pots?.dispose?.();
      if (an) { an._wwS = null; if (an._pots?.belt) for (const m of an._pots.belt) m.removeFromParent(); an._pots = null; }
      if (C.combat) { C.combat.gaff = null; C.combat.windwall = null; C.combat.pots = null; C.combat.status = null; }
    });
    if (!C.combat?.gaff?.owned) { api.standIn('the gaff was not granted'); return; }
    await (C.combat.gaff.prop?.ready ?? Promise.resolve());
    if (DRAW) {
      if (C.quickslots?.select) C.quickslots.select(3); else C.combat.gaff.draw();
      await api.sleep(1200);
      if (!C.player?.animator?.gaffInHand?.()) api.standIn('the gaff is not in her hand after the draw');
    } else await api.sleep(400);
    },
  },
  'F42-stowed': {
    async world(f, api) {
    const DRAW = false;
    const C = api.C, hero = C.player?.hero;
    if (!hero?.grantOroKit) { api.standIn('no hero.grantOroKit in this build'); return; }
    await hero.grantOroKit({ gaff: true, windwall: false, pots: 0 });
    api.undo(() => {
      const g = C.combat?.gaff, an = C.player?.animator;
      if (g) { g.want = false; g.after = null; g.owned = false; if (g.prop?.group) { g.prop.group.visible = false; g.prop.group.removeFromParent(); } }
      if (an) { an._gf = null; an._oroKit = null; }
      const K = hero.oro;
      hero.oro?.dispose?.();
      // a fresh (empty) kit for whatever films next
      if (K) hero.oro = new K.constructor(C.player);
      // (wave 3: the Windwall and the pots are granted too; their states and layers go with the kit)
      const ww = C.combat?.windwall; if (ww?.prop?.group) { ww.prop.group.visible = false; ww.prop.group.removeFromParent(); }
      C.combat?.pots?.dispose?.();
      if (an) { an._wwS = null; if (an._pots?.belt) for (const m of an._pots.belt) m.removeFromParent(); an._pots = null; }
      if (C.combat) { C.combat.gaff = null; C.combat.windwall = null; C.combat.pots = null; C.combat.status = null; }
    });
    if (!C.combat?.gaff?.owned) { api.standIn('the gaff was not granted'); return; }
    await (C.combat.gaff.prop?.ready ?? Promise.resolve());
    if (DRAW) {
      if (C.quickslots?.select) C.quickslots.select(3); else C.combat.gaff.draw();
      await api.sleep(1200);
      if (!C.player?.animator?.gaffInHand?.()) api.standIn('the gaff is not in her hand after the draw');
    } else await api.sleep(400);
    },
  },
  'F42-ready': {
    async world(f, api) {
    const DRAW = true;
    const C = api.C, hero = C.player?.hero;
    if (!hero?.grantOroKit) { api.standIn('no hero.grantOroKit in this build'); return; }
    await hero.grantOroKit({ gaff: true, windwall: false, pots: 0 });
    api.undo(() => {
      const g = C.combat?.gaff, an = C.player?.animator;
      if (g) { g.want = false; g.after = null; g.owned = false; if (g.prop?.group) { g.prop.group.visible = false; g.prop.group.removeFromParent(); } }
      if (an) { an._gf = null; an._oroKit = null; }
      const K = hero.oro;
      hero.oro?.dispose?.();
      // a fresh (empty) kit for whatever films next
      if (K) hero.oro = new K.constructor(C.player);
      // (wave 3: the Windwall and the pots are granted too; their states and layers go with the kit)
      const ww = C.combat?.windwall; if (ww?.prop?.group) { ww.prop.group.visible = false; ww.prop.group.removeFromParent(); }
      C.combat?.pots?.dispose?.();
      if (an) { an._wwS = null; if (an._pots?.belt) for (const m of an._pots.belt) m.removeFromParent(); an._pots = null; }
      if (C.combat) { C.combat.gaff = null; C.combat.windwall = null; C.combat.pots = null; C.combat.status = null; }
    });
    if (!C.combat?.gaff?.owned) { api.standIn('the gaff was not granted'); return; }
    await (C.combat.gaff.prop?.ready ?? Promise.resolve());
    if (DRAW) {
      if (C.quickslots?.select) C.quickslots.select(3); else C.combat.gaff.draw();
      await api.sleep(1200);
      if (!C.player?.animator?.gaffInHand?.()) api.standIn('the gaff is not in her hand after the draw');
    } else await api.sleep(400);
    },
  },
  'F42-readyfront': {
    async world(f, api) {
    const DRAW = true;
    const C = api.C, hero = C.player?.hero;
    if (!hero?.grantOroKit) { api.standIn('no hero.grantOroKit in this build'); return; }
    await hero.grantOroKit({ gaff: true, windwall: false, pots: 0 });
    api.undo(() => {
      const g = C.combat?.gaff, an = C.player?.animator;
      if (g) { g.want = false; g.after = null; g.owned = false; if (g.prop?.group) { g.prop.group.visible = false; g.prop.group.removeFromParent(); } }
      if (an) { an._gf = null; an._oroKit = null; }
      const K = hero.oro;
      hero.oro?.dispose?.();
      // a fresh (empty) kit for whatever films next
      if (K) hero.oro = new K.constructor(C.player);
      // (wave 3: the Windwall and the pots are granted too; their states and layers go with the kit)
      const ww = C.combat?.windwall; if (ww?.prop?.group) { ww.prop.group.visible = false; ww.prop.group.removeFromParent(); }
      C.combat?.pots?.dispose?.();
      if (an) { an._wwS = null; if (an._pots?.belt) for (const m of an._pots.belt) m.removeFromParent(); an._pots = null; }
      if (C.combat) { C.combat.gaff = null; C.combat.windwall = null; C.combat.pots = null; C.combat.status = null; }
    });
    if (!C.combat?.gaff?.owned) { api.standIn('the gaff was not granted'); return; }
    await (C.combat.gaff.prop?.ready ?? Promise.resolve());
    if (DRAW) {
      if (C.quickslots?.select) C.quickslots.select(3); else C.combat.gaff.draw();
      await api.sleep(1200);
      if (!C.player?.animator?.gaffInHand?.()) api.standIn('the gaff is not in her hand after the draw');
    } else await api.sleep(400);
    },
  },
};

/* ---- wave 3's hooks: one prelude (the hand-over and its undo, in-page), each hook made from it ---- */
const PRE = `
  const C = api.C, hero = C.player?.hero;
  if (!hero?.grantOroKit) { api.standIn('no hero.grantOroKit in this build'); return; }
  await hero.grantOroKit({ gaff: true, windwall: true, pots: 3 });
  api.undo(() => {
    const cb = C.combat, an = C.player?.animator;
    const g = cb?.gaff; if (g) { g.want = false; g.after = null; g.owned = false; g.verbs?.cancel?.(); if (g.prop?.group) { g.prop.group.visible = false; g.prop.group.removeFromParent(); } }
    const ww = cb?.windwall; if (ww) { ww.owned = false; ww.want = false; ww.phase = 'stowed'; ww.plantedAt = null; if (ww.prop?.group) { ww.prop.group.visible = false; ww.prop.group.removeFromParent(); } }
    const K = cb?.pots; if (K) { K.cancel?.(); K.dispose?.(); }
    if (an) { an._gf = null; an._wwS = null; if (an._pots?.belt) for (const m of an._pots.belt) m.removeFromParent(); an._pots = null; an._oroKit = null; }
    C.quickslots?.rack?.setOpen?.(false);
    const KO = hero.oro; hero.oro?.dispose?.(); if (KO) hero.oro = new KO.constructor(C.player);
    if (cb) { cb.gaff = null; cb.windwall = null; cb.pots = null; cb.status = null; }
  });
  if (!C.combat?.gaff?.owned) { api.standIn('the gaff was not granted'); return; }
  await (C.combat.gaff.prop?.ready ?? Promise.resolve());
  await (C.combat.windwall?.prop?.ready ?? Promise.resolve());
  const drawGaff = async () => { if (C.quickslots?.select) C.quickslots.select(3); else C.combat.gaff.draw(); await api.sleep(900); if (!C.player?.animator?.gaffInHand?.()) api.standIn('the gaff is not in her hand after the draw'); };
  /** hold a clock at \`at\`: wrap its step so it never passes it */
  const holdAt = (obj, key, get, at) => { const s0 = obj[key].bind(obj); obj[key] = (dt) => s0(Math.min(dt, Math.max(0, at - get()))); api.undo(() => { obj[key] = s0; }); };
  const waitFor = async (fn, ms = 4000) => { const t0 = performance.now(); while (!fn() && performance.now() - t0 < ms) await api.sleep(30); return fn(); };
`;
const AF = Object.getPrototypeOf(async function () {}).constructor;
const hook = (body) => new AF('f', 'api', PRE + body);

stagings.F40 = stagings['F40-front'] = {
  beforeFreeze: hook(`
    await drawGaff();
    C.input.mouse.buttons |= 4;   // RMB held: the guard (the gaff is out, so the bow does not aim)
    api.undo(() => { C.input.mouse.buttons &= ~4; });
    const ok = await waitFor(() => C.combat.windwall?.phase === 'guard', 2000);
    if (!ok) api.standIn('the Windwall did not come up to the guard');
    await api.sleep(700);
  `),
};
stagings.F41 = {
  beforeFreeze: hook(`
    const K = C.combat.pots, P = await import('/src/combat/pots.js');
    if (!K?.owned) { api.standIn('no pots on her'); return; }
    holdAt(K, 'step', () => K.casting?.t ?? 1e9, P.POT_CAST.releaseAt - 0.004);
    const p = C.player.position, h = C.player.heading || 0;
    if (!K.cast({ x: p.x + Math.sin(h) * 9, y: p.y, z: p.z + Math.cos(h) * 9 })) { api.standIn('the cast did not start'); return; }
    await waitFor(() => (K.casting?.t ?? 0) >= P.POT_CAST.releaseAt - 0.005, 3000);
    await api.sleep(400);
  `),
};
stagings['F42-light'] = {
  beforeFreeze: hook(`
    await drawGaff();
    const V = C.combat.gaff.verbs, G = await import('/src/combat/gaff.js');
    const at = G.verbContactAt(G.GAFF_LIGHTS[0]);
    V.strike();
    holdAt(V, 'step', () => (V.verb ? V.t : 1e9), at - 0.001);
    await waitFor(() => V.verb && V.t >= at - 0.002, 2000);
    await api.sleep(400);
  `),
};
stagings.F42 = {
  beforeFreeze: hook(`
    await drawGaff();
    const M = C.machines, p = C.player, an = p.animator, h = p.heading || 0;
    const t0 = performance.now();
    while (!M?.expansionReady && performance.now() - t0 < 30000) await api.sleep(200);
    /* POLISH 3 (frames lane): the hook-rip MID-PULL with the hook in a part of the Sickle. At 2944784 the frame held the
     * contact (the end of H, when the reach has just arrived) with the Sickle's hub 1.9 m out, so it read as the ready
     * stance: no part on the hook, no pull. Now: the Sickle stands up in front of her (its brain calmed and on its mark,
     * its feet seated, then held), its blows switched off for the frame (a rip would tear the part off at the contact);
     * the rip is held half-way through P (her pelvis dropping back, the lead foot stepping back: gaffLayer.js hookRip);
     * then the hook's tip is read (gaffLayer.js gaffHookWorld) and the Sickle is moved on the ground so that its part
     * nearest the tip's height, on the side toward her, sits on the tip. (Its art faces its root's heading reversed, so
     * at her own heading it faces her.) */
    let x = p.position.x + Math.sin(h) * 3.3, z = p.position.z + Math.cos(h) * 3.3;
    const hd = h;
    const m = M?.spawn?.('sickle', x, z, { heading: hd });
    const mark = () => {
      const B = m.brain; if (B) { B.x = x; B.z = z; B.heading = hd; }
      m.heading = hd; m.root.position.set(x, C.terrain.getHeight(x, z), z); m.root.rotation.y = hd;
      m.suspicion = 0; if (m.sc) { m.sc.suspicion = 0; m.sc.heading = hd; }
    };
    if (!m) api.standIn('no Sickle stood up'); else {
      api.undo(() => { try { if (M.sites?.dispose) M.sites.dispose(m); else m.dispose?.(); } catch { try { m.dispose?.(); } catch { /* */ } } });
      const td = m.takeDamage; m.takeDamage = function () { return null; }; api.undo(() => { m.takeDamage = td; });
      mark();
      await api.sleep(300);
      mark();
      try { m.seatFeet?.(); } catch { /* */ }
      const u0 = m.update; m.update = function () {}; api.undo(() => { m.update = u0; });
      m.root.updateMatrixWorld?.(true);
    }
    const V = C.combat.gaff.verbs, G = await import('/src/combat/gaff.js');
    const R = G.HOOK_RIP, at = R.W + R.H + R.P * 0.5;
    if (!V.hookRip()) api.standIn('the hook-rip did not start (a verb was playing: ' + (V.verb?.id ?? '-') + ')');
    holdAt(V, 'step', () => (V.verb ? V.t : 1e9), at - 0.001);
    const held = await waitFor(() => V.verb && V.t >= at - 0.002, 2000);
    if (!held) api.standIn('the hook-rip did not reach mid-pull: verb ' + (V.verb?.id ?? '-') + ', t ' + (V.t ?? 0).toFixed(3));
    await api.sleep(300);
    const V3 = p.position.constructor, tip = new V3();
    const rep = { verb: V.verb?.id ?? null, phase: V.phase, k: +(V.k ?? 0).toFixed(3), t: +(V.t ?? 0).toFixed(3), at: +at.toFixed(3) };
    if (m && an?.gaffHookWorld?.(tip)) {
      rep.tip = [+tip.x.toFixed(3), +tip.y.toFixed(3), +tip.z.toFixed(3)];
      const fx = Math.sin(h), fz = Math.cos(h), q = new V3();
      m.root.updateMatrixWorld(true);
      const cands = [];
      for (const pt of (m.parts || [])) {
        if (!pt || pt.attached === false || !pt.mesh?.getWorldPosition) continue;
        pt.mesh.getWorldPosition(q);
        // on her side of the hull: its offset from the root along her heading is negative (toward her)
        const along = (q.x - m.root.position.x) * fx + (q.z - m.root.position.z) * fz;
        cands.push({ pt, ox: q.x - m.root.position.x, oz: q.z - m.root.position.z, dy: Math.abs(q.y - tip.y), along, y: q.y });
      }
      const near = cands.filter((c) => c.along < 0.1);
      near.sort((a, b) => a.dy - b.dy);
      const pick = (near.length ? near : cands.sort((a, b) => a.dy - b.dy))[0];
      if (!pick) api.standIn('the Sickle has no attached part to hook');
      else {
        // the root moves so that part sits on the tip, 3 cm past it along her heading (the hook IN it); the hull must stay
        // 1.15 m clear of her (its body radius 0.75 and 0.4 of room)
        x = tip.x + fx * 0.03 - pick.ox; z = tip.z + fz * 0.03 - pick.oz;
        const gap = Math.hypot(x - p.position.x, z - p.position.z);
        mark();
        try { m.seatFeet?.(); } catch { /* */ }
        m.root.updateMatrixWorld(true);
        pick.pt.mesh.getWorldPosition(q);
        rep.part = pick.pt.name ?? null; rep.parts = cands.length;
        rep.tipToPartM = +q.distanceTo(tip).toFixed(3); rep.tipToPartFlatM = +Math.hypot(q.x - tip.x, q.z - tip.z).toFixed(3);
        rep.hullToHerM = +gap.toFixed(2);
        if (gap < 1.15) api.standIn('the Sickle stands ' + gap.toFixed(2) + ' m from her (under 1.15)');
      }
    } else if (m) api.standIn('no hook tip to read (gaffHookWorld)');
    window.__f42 = rep;
    api.standIn('the hook-rip ' + JSON.stringify(rep));
    await api.sleep(200);
  `),
};
stagings.F43 = {
  beforeFreeze: hook(`
    const R = C.quickslots?.rack;
    if (!R) { api.standIn('no Kit Rack in this build'); return; }
    R.setOpen(true);
    if (!R.open) api.standIn('the Kit Rack did not open');
    await api.sleep(400);
    const r = R.rect?.();
    if (r && r.centreXK != null && r.centreXK < 0.85) api.standIn('the Kit Rack centre at ' + r.centreXK.toFixed(3) + ' of the width (bar 0.85)');
  `),
};
