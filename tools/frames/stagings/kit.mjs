/**
 * Area D's Milestone 2 frames and their stagings (kit: Oro's kit and the Kit Rack). Contract: ./index.mjs.
 *
 * Wave 2 ("the look") films the Boat Gaff, the first family: on her as she carries it, and in her hand at the ready.
 * They are look frames for the owner's page, on the filmer's flat studio stage (the F08-F10 stage: Brea alone, soft
 * key, even fill), never graded against a reference (the gaff has none: Kevin's bars and the bible's words). F40-F43
 * (the guard, the pot cast, the hook-rip at contact, the Kit Rack) are wave 3's: their verbs are not built.
 *
 *   D-gaff-back    the gaff hanging from the back of her belt, three-quarter from behind (her right)
 *   D-gaff-side    the gaff in her right hand at the ready, side-on from her right
 *   D-gaff-front   the same, from in front
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
    id: 'D-gaff-back', subject: 'the Boat Gaff on her, from behind (her right), flat light', in: 'M2', ...STUDIO,
    camera: { mode: 'orbit', yawRel: 215, dist: 2.3, height: 1.0, target: 'body', fov: 40 },
    state: { pose: 'idle', hud: false },
    ref: { written: 'the gaff hangs butt up from the back of her belt right of her spine, its beak end behind her right thigh, clear of her legs, the quiver and the lance; it reads as a forged hook on a pine haft' },
    note: 'M2 wave 2 look (area D). KT0 moved the mount from the bible\'s left rear hip along the belt (kit-oro.mjs).',
  },
  {
    id: 'D-gaff-side', subject: 'the Boat Gaff in her right hand at the ready, side-on, flat light', in: 'M2', ...STUDIO,
    camera: { mode: 'orbit', yawRel: 270, dist: 2.5, height: 1.0, target: 'body', fov: 40 },
    state: { pose: 'idle', hud: false },
    ref: { written: 'Kevin\'s bars: the fist at her right hip, the haft up and forward, the beak below her shoulder, the hook out in front of the knuckles; no hand above the shoulder or behind the head' },
    note: 'M2 wave 2 look (area D): the ready the draw ends in (gaffLayer.js READY).',
  },
  {
    id: 'D-gaff-front', subject: 'the Boat Gaff in her right hand at the ready, from in front, flat light', in: 'M2', ...STUDIO,
    camera: { mode: 'orbit', yawRel: 330, dist: 2.5, height: 1.0, target: 'body', fov: 40 },
    state: { pose: 'idle', hud: false },
    ref: { written: 'as D-gaff-side; the gaff\'s head reads (socket, beak, hook) at 2.5 m' },
    note: 'M2 wave 2 look (area D).',
  },
];

export const STAGED = { 'D-gaff-back': 'wall', 'D-gaff-side': 'wall', 'D-gaff-front': 'wall' };

/** @type {Record<string, { world?: Function, beforeFreeze?: Function }>} (each hook self-contained: serialised alone) */
export const stagings = {
  'D-gaff-back': {
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
  'D-gaff-side': {
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
  'D-gaff-front': {
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
