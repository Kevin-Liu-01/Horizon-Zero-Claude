/**
 * GATE PLACES — where a gate stages, by NAME, never by coordinate (plan §9
 * intro, §3.2 `ctx.props.gatePlaces`).
 *
 * Round 4's gates teleported to literal coordinates of the old valley map (the
 * flat meadow strip, the 56 deg face, the west herd, the camp ...). Round 5
 * replaces the map at W1, so a coordinate in a gate is a gate that silently
 * measures the wrong ground. Every gate now asks for a NAMED place:
 *
 *   1. `ctx.props.gatePlaces[name]` — published by the build (world-props, W1
 *      day 1; `A-gate-places-published`). Authoritative whenever present.
 *   2. The W0 MAP TABLE below — the same names, authored once for the map this
 *      tree ships until world-ground's W1 terrain lands. It is used ONLY while
 *      the live terrain matches the W0 map's height signature, so a gate can
 *      never teleport onto coordinates of a map that is gone.
 *   3. Neither → the gate reports `SKIP-R18 (place)` with a named note.
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
 * The W0 map (the Round-4 valley at PLAY_RADIUS 330). Heights measured on this
 * tree with `terrain.getHeight` (Oct 15, port 5255): if any of these three
 * reads more than 5 cm off, the table is not this map's and is not used.
 */
export const W0_SIGNATURE = [
  [-60, -45, -1.267],
  [118, 220, 9.474],
  [-205, -55, -2.346],
];

/** name -> record, for the W0 map only. Comments say what the place IS, so world-props can re-author it. */
export const W0_PLACES = {
  // a flat strip with ≥ 60 m of clear running along +Z (camYaw π faces +Z); the
  // animator gates' sprint/strafe/draw course
  openGround: { x: -60, z: -45, yaw: Math.PI, note: 'flat meadow strip, clear run along +Z' },
  // the spawn vista A9/A21 measure: a wide view over the playable world from near the spawn
  spawnVista: { x: 0, z: 0, yaw: Math.PI, pitch: 0.06, note: 'map centre facing the valley (Round-4 spawn vista)' },
  // open grazing ground where a herd of 6 + 2 escorts stands in one frame (A21 herd scenario)
  herdSite: { x: -205, z: -55, note: 'west meadow herd ground' },
  // flat ground with room for an 8-machine arc 9-17 m ahead (A21 staged fight)
  fightGround: { x: 0, z: 0, yaw: Math.PI, pitch: 0.05, note: 'flat ground at the map centre' },
  // the map's signature water feature, framed (V8; used when the water system publishes no pool)
  waterFeature: { x: -60, z: 20, yaw: 4.7, pitch: 0.2, note: 'dry riverbed cut' },
  // a tree line against open sky in the upper-left screen quadrant (V20 crops 140,300 400x225 px)
  aaRidgeView: { x: 0, z: 0, yaw: Math.PI, pitch: -0.03, note: 'pine ridge against sky from the map centre' },
  // the open-ground spot facing a flat, single-surface bearing clear for >= 50 m (A33 sprints down it)
  runway: { x: -60, z: -45, yaw: Math.PI * 0.5, len: 50, note: 'open-ground spot facing due -X: flat, grass, fast for 50 m' },
  // a > 50 deg terrain face the player cannot sprint up (A29, A31b)
  steepFace: { x: 118, z: 220, note: 'terrace lip, 56 deg over ~1.5 m of its fall line' },
  // flat, clear ground away from any herd where one machine is staged for a melee/stealth duel (A49, A50)
  duelGround: { x: -60, z: -60, note: 'flat clear meadow, away from the herd' },
  // flat, clear, well-lit ground for a filmed hit or chase on one machine (V28, V29)
  impactGround: { x: -70, z: -70, note: 'flat clear meadow, the impact/carry film spot' },
  // a target spot with >= 55 m of flat, unobstructed sight line along +Z (A52 shoots from 55 m)
  rangeGround: { x: -80, z: -80, note: 'flat meadow with 55 m of open sight line along +Z' },
  // a water-cut channel: x-range to scan for its lowest line, z stations to sample, and the z of the V32 shot
  riverChannel: { x0: -200, x1: -60, zs: [-120, 0, 120], zShot: -20, note: 'the dry west river channel' },
  // a rock surface zone (A58 zone probe)
  rockShelf: { x: 150, z: 95, note: 'SE rocky-highland shelf' },
  // a dense-grass meadow spot (A58 zone probe; A59 bare-ground frame)
  grassSite: { x: -60, z: -90, note: 'meadow, dense grass' },
  // six grass points spread over the map for near-tier density (A59)
  grassPoints: { points: [[-60, -90], [-30, -40], [88, 34], [-110, -90], [44, -74], [-160, 90]], note: 'six meadow points' },
  // a spot near the rest site facing the map's boundary massif (V33): look.dy is metres above the spot's ground
  rimView: { x: 22, z: -6, look: { x: 22, z: -330, dy: 120 }, note: 'north of the camp palisade, facing the north rim' },
  // one station from which four bearings 90 deg apart run out to different biomes (V44)
  biomeStation: { x: 30, z: -60, note: 'valley-floor station, four bearings 35/125/215/305 deg' },
  // inside the play radius facing the boundary wall the player walks into (A62)
  rimFace: { x: 0, z: -300, look: { x: 0, z: -420, dy: 40 }, note: 'r=300 at the north wall' },
  // an open sunlit ground frame used as the luminance reference (A62)
  litMeadowRef: { x: -40, z: -60, look: { x: -32, z: -52, dy: -2 }, note: 'lit meadow reference frame' },
  // a view of the boundary wall's bedding planes (A63): look.y is absolute
  rimStrata: { x: 0, z: -250, look: { x: 0, y: 80, z: -400 }, note: 'facing the north wall strata' },
  // a raised platform that casts a clean ground shadow: footprint centre and platform height h (A55)
  shadowCaster: { x: 33, z: -14, h: 5.05, note: 'hunters watchtower platform, 5.05 m' },
  // somewhere to park the hero out of every measurement frame (A55)
  parkAway: { x: -120, z: 120, note: 'open meadow far from the light probes' },
  // a station with open sight lines 240-290 m out on all bearings (A57 aerial perspective)
  aerialStation: { x: 0, z: 0, note: 'map centre with 240-290 m sight lines on 8 bearings' },
  // a low rise open on all four bearings to 150-300 m (V34)
  midgroundVista: { x: -20, z: 20, note: 'low rise NW of the camp, open on four bearings' },
  // where to park the hero out of every GTAO measurement frame
  gtaoPark: { x: 52, z: 24, note: 'player parking east of the camp, out of the GTAO frames' },
  // four long cross-map nav legs [x0, z0, x1, z1], each between two walkable land points >= 150 m apart,
  // crossing the valley floor, the river cut and the rock highland (A25b; Round 4's legs: from the
  // open-ground strip, the rest site, the SE rock shelf and a NW meadow point)
  navLegs: { legs: [[-60, -45, 120, -120], [22, 30, -205, -55], [150, 95, 30, -220], [-160, 90, 135, -35]],
    note: 'four cross-map nav legs between walkable land points' },
  // open walkable ground with a clear 34 m run east AND west of it, no blocker inside 8 m (A25b
  // registers a blocker there, paths through it, removes it and paths again)
  navProbe: { x: 0, z: 0, note: 'open ground at the map centre, clear 34 m east and west' },
  // a station whose camera, looking up at `look`, frames the boundary massif's CREST LINE against
  // open sky across most of the frame width (V7: the skyline must be in frame, not a wall of rock)
  ringSkyline: { x: 0, z: 0, look: { x: 0, z: 330, dy: 105 }, note: 'map centre facing the south massif, crest against sky' },
};

/** Every name a gate may ask for (the gatePlaces contract world-props publishes at W1). */
export const PLACE_KEYS = ['rest', 'restSite', ...Object.keys(W0_PLACES)];

/**
 * Page-context prelude. Splice inside an `async` body (it awaits one dynamic
 * import of sites.js). Defines:
 *   PLACE(name)          record or null
 *   placeSkip(...names)  null, or the SKIP-R18 (place) result naming what is missing
 *   standAt(p, name, { dx, dz, yaw })  teleport the player onto the place (snap
 *                        to ground, zero velocity, face its yaw unless yaw: false)
 *   PLACES_SOURCE        'ctx.props.gatePlaces' | 'W0 map table' | 'none'
 */
export const PLACES = `
      /* __R5_PLACES__ (tools/gate-places.mjs) */
      const __pC = window.__CTX__;
      const __pPub = __pC?.props?.gatePlaces || null;
      const __pT = __pC?.terrain;
      const __pW0 = ${JSON.stringify({ sig: W0_SIGNATURE, places: W0_PLACES })};
      const __pW0ok = !!__pT?.getHeight && __pW0.sig.every(([x, z, h]) => Math.abs(__pT.getHeight(x, z) - h) < 0.05);
      let __pSites = null;
      try { __pSites = await import('/src/world/island/sites.js'); } catch (e) { __pSites = null; }
      const PLACES_SOURCE = __pPub ? 'ctx.props.gatePlaces' : __pW0ok ? 'W0 map table' : 'none';
      const PLACE = (k) => {
        if (k === 'rest' && __pSites?.REST) return { x: __pSites.REST.x, z: __pSites.REST.z, note: 'sites.js REST' };
        if (k === 'restSite' && __pSites?.REST_SITE) return { ...__pSites.REST_SITE, note: 'sites.js REST_SITE' };
        if (__pPub && __pPub[k] != null) return __pPub[k];
        if (__pW0ok && __pW0.places[k]) return __pW0.places[k];
        return null;
      };
      const placeSkip = (...keys) => {
        const miss = keys.flat().filter((k) => !PLACE(k));
        return miss.length ? { pass: null, detail: 'SKIP-R18 (place) ' + miss.join(', ') + ': not in ctx.props.gatePlaces (world-props W1) and the W0 map table does not match this terrain' } : null;
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
