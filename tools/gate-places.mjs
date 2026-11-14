/**
 * GATE PLACES — where a gate stages, by NAME, never by coordinate (plan §9
 * intro, §3.2 `ctx.props.gatePlaces`).
 *
 * Round 4's gates teleported to literal coordinates of the old valley map (the
 * flat meadow strip, the 56 deg face, the west herd, the rest site ...). Round 5
 * replaces the map at W1, so a coordinate in a gate is a gate that silently
 * measures the wrong ground. Every gate now asks for a NAMED place:
 *
 *   1. `ctx.props.gatePlaces[name]` — published by the build (world-props, W1
 *      day 1; `A-gate-places-published`). Authoritative whenever present.
 *   2. Otherwise the gate reports `SKIP-R18 (place)` with a named note.
 *
 * `rest` and `restSite` come from the page's own `src/world/island/sites.js`
 * (the module instance the game imported), so they follow world-ground's move
 * of REST to Saltrow at W1 with no table edit.
 *
 * Place record: `{ x, z, yaw?, pitch?, r?, ... , note }`. `yaw` is the camera
 * yaw (`player.camYaw`) the gate faces; a list place (e.g. `grassPoints`) is
 * `{ points: [{x, z}, ...] }`. Every name below is a contract for world-props'
 * `gatePlaces` (docs/ROUND5-GATES-PERF.md §places lists their meaning).
 */

import { SKIP_CARD } from './gate-roster.mjs';

/**
 * The W0 map table (old-valley coordinates) was deleted at M0.3 R4a: the island publishes
 * `ctx.props.gatePlaces` and that is the only source. `W0_PLACES` stays exported, empty, for the
 * gate files that still import it.
 */
export const W0_PLACES = Object.freeze({});

/** The place names a gate may ask for (the gatePlaces contract). */
const PLACE_NAMES = ['openGround', 'spawnVista', 'herdSite', 'fightGround', 'waterFeature', 'aaRidgeView', 'runway', 'steepFace', 'duelGround', 'impactGround', 'rangeGround', 'riverChannel', 'rockShelf', 'grassSite', 'grassPoints', 'rimView', 'biomeStation', 'rimFace', 'litMeadowRef', 'rimStrata', 'shadowCaster', 'parkAway', 'aerialStation', 'midgroundVista', 'gtaoPark', 'navLegs', 'navProbe', 'ringSkyline', 'castStage', 'meleeSlope'];

/** Every name a gate may ask for (the gatePlaces contract world-props publishes at W1). */
export const PLACE_KEYS = ['rest', 'restSite', ...PLACE_NAMES];

/**
 * Page-context prelude. Splice inside an `async` body (it awaits one dynamic
 * import of sites.js). Defines:
 *   PLACE(name)          record or null
 *   placeSkip(...names)  null, or the SKIP-R18 (place) result naming what is missing
 *   standAt(p, name, { dx, dz, yaw })  teleport the player onto the place (snap
 *                        to ground, zero velocity, face its yaw unless yaw: false)
 *   PLACES_SOURCE        'ctx.props.gatePlaces' | 'none'
 */
export const PLACES = `
      /* __R5_PLACES__ (tools/gate-places.mjs) */
      const __pC = window.__CTX__;
      const __pPub = __pC?.props?.gatePlaces || null;
      let __pSites = null;
      try { __pSites = await import('/src/world/island/sites.js'); } catch (e) { __pSites = null; }
      const PLACES_SOURCE = __pPub ? 'ctx.props.gatePlaces' : 'none';
      const PLACE = (k) => {
        if (k === 'rest' && __pSites?.REST) return { x: __pSites.REST.x, z: __pSites.REST.z, note: 'sites.js REST' };
        if (k === 'restSite' && __pSites?.REST_SITE) return { ...__pSites.REST_SITE, note: 'sites.js REST_SITE' };
        if (__pPub && __pPub[k] != null) return __pPub[k];
        return null;
      };
      const placeSkip = (...keys) => {
        const miss = keys.flat().filter((k) => !PLACE(k));
        return miss.length ? { pass: null, detail: 'SKIP-R18 (place) ' + miss.join(', ') + ': not in ctx.props.gatePlaces' } : null;
      };
      const standAt = (p, k, o = {}) => {
        const s = PLACE(k);
        p.position.set(s.x + (o.dx || 0), 0, s.z + (o.dz || 0));
        p.velocity?.set?.(0, 0, 0);
        p._snapToGround?.();
        if (o.yaw !== false && (o.yaw != null || s.yaw != null)) p.camYaw = o.yaw ?? s.yaw;
        return s;
      };`;

const isIife = (s) => /^\s*\(/.test(s);

/** Wrap an assert expression so it SKIPs when a named place is unavailable. */
export function placed(names, body) {
  return `(async () => {${PLACES}
      const __pskip = placeSkip(${JSON.stringify(names)});
      if (__pskip) return __pskip;
      return await ${body.trim()};
    })()`;
}

/** Same for a `setup` string: a missing place draws the SKIP card (gate-roster SKIP_CARD) and stages nothing. */
export function placedSetup(names, setup = '') {
  const run = !setup ? '' : isIife(setup) ? `await ${setup.trim()};` : setup;
  return `(async () => {${PLACES}${SKIP_CARD}
      { const __s = placeSkip(${JSON.stringify(names)}); if (__s) { __skipCard(__s.detail); return; } }
      ${run}
    })()`;
}
