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
    camera: { mode: 'orbit', yawRel: 45, dist: 2.6, height: 0.9, target: 'body', fov: 40 },
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

export const STAGED = { 'F40-open': 'wall', 'F40-stowed': 'wall', 'F42-stowed': 'wall', 'F42-ready': 'wall', 'F42-readyfront': 'wall' };

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
      // toward the lens at her front-left, standing 0.55 m to her left and 0.85 m in front; then her heading
      const h = p.heading ?? p.model?.rotation?.y ?? 0;
      const g = ww.group;
      g.rotation.set(0, 0, 0);
      g.rotateY(h + Math.PI / 4);
      g.rotateZ(-mid);
      const cx = 0.55, cz = 0.85, x = p.position.x + Math.cos(h) * cx + Math.sin(h) * cz, z = p.position.z - Math.sin(h) * cx + Math.cos(h) * cz;
      const y = C.terrain?.getHeight ? C.terrain.getHeight(x, z) : p.position.y;
      g.position.set(x, y + 0.04, z);
      g.visible = true;
      (C.scene || C.engine.scene).add(g);
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
      if (C.combat) C.combat.gaff = null;
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
      if (C.combat) C.combat.gaff = null;
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
      if (C.combat) C.combat.gaff = null;
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
      if (C.combat) C.combat.gaff = null;
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
