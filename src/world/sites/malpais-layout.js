/**
 * THE MALPAIS AT BLOCKOUT (Milestone 3 wave 1, area A; BUILD M3.2, BIBLE §3.3-§3.4): the places of the Malpais that are
 * not the Kiln Yards (those are ./kilnyards-layout.js), as plain frozen data, importing only pure modules: safe from the
 * island recipe, its workers and node.
 *
 *   RUST_CONE      the cinder cone and T3 on its top (BIBLE: "Rust Cone (145 m cinder cone, T3 on top)"); the recipe's
 *                  CONE stamp and PAD hold it; recorded here with the reading of "145 m" the blockout builds to
 *   HORNITOS       the hornito field (BIBLE: "the hornito field (steaming, 3-6 m)"): seven spatter cones on the lava flat
 *                  at the foot of Rust Cone's south flank, four of them steaming (M3 briefs F58: >= 5, >= 3 steaming)
 *   TUBE_SHELTER   the lava-tube shelter (BIBLE: "a lava-tube shelter with a dormant Peg nest"; its place is not given:
 *                  this file gives it). A tube the Yards' cut opened: its mouth in the apron's north batter at its west
 *                  end, running 24 m north into the shelf (its first 6 m an open cut through the batter, the rest
 *                  under the crust), 6 m wide and 4.2 m high inside; the
 *                  Brazier's spot, the dormant nest at its back, the salt cache in a side niche (BIBLE §3.4)
 *   BENCH_B6       Benchmark 6 ("the edge of the hornito field"), snapped to walkable ground
 *   FOOTPRINT      the authored box outside which nothing of the Malpais blockout changes the ground
 *   malpaisColliders(ground)   the hornitos and the tube's walls, in collision.register's shape
 *
 * Frame: the bible's (E, N); engine x = E, z = -N (sites.js). Bands marked * are starting values (M3 briefs §14).
 */
import { ISLAND_SCALE as S } from '../island/extent.js';
import { APRON, apronPoint } from './kilnyards-layout.js';

const rec = (id, e, n, extra = {}) => Object.freeze({ id, e: +e.toFixed(2), n: +n.toFixed(2), x: +(e * S).toFixed(2), z: +(-n * S).toFixed(2), ...extra });

/**
 * Rust Cone. The recipe's cone (recipe.js CONE: r 98, its crest 146) and T3's pad hold the top at 145.0 m above the sea:
 * the blockout reads BUILD's "145 m +-3" as the top's elevation (the bible's Malpais band is "20-145 m"), which stands
 * 60 m over the saddle toward the Yards and 135-139 m over its lowest foot (tools/world/malpais-rows.mjs MP0 prints
 * both; the reading is sent for a ruling). The scree face the slide verb uses is wave 3's.
 */
export const RUST_CONE = Object.freeze({ ...rec('rust-cone', 283, -101), top: 145, tol: 3, trig: 'T3' });

/**
 * The hornitos: { id, e, n, x, z, h (m over its foot), r (its foot's radius), steam }. hornito-1 stood at (266, -197) until
 * fix round 1: B6's post (268, -196) was 2.24 m from its centre, 1.16 m inside its 3.4 m foot (F58 at 3283f5b). It stands
 * 4.5 m south-west, so the post is 2.43 m outside its foot (malpais-rows.mjs prints B6's clearance from every foot; >= 1 m).
 */
export const HORNITOS = Object.freeze([
  [265, -201, 4.5, 3.4, true], [275, -200, 6.0, 4.2, true], [284, -196, 3.2, 2.6, false], [279, -209, 5.0, 3.6, true],
  [290, -205, 3.8, 3.0, true], [268, -208, 3.0, 2.4, false], [295, -214, 4.2, 3.2, false],
].map(([e, n, h, r, steam], i) => rec(`hornito-${i + 1}`, e, n, { h, r, steam })));

/** Benchmark 6 (plan (268, -180), on Rust Cone's 48 deg south foot): the nearest ground no steeper than 20 deg over 4 m. */
export const BENCH_B6 = rec('B6', 268, -196, { plan: Object.freeze({ e: 268, n: -180 }) });

/**
 * The tube: a straight run in the apron's frame from v0 (the mouth, on the apron's north edge) to v1, at u; floor from
 * floor0 at the mouth to floor1 at the back; `half` the half-width of its floor, `height` its headroom; the crust (the
 * roof) begins `lip` m in from the mouth. The spots are in the same frame.
 */
const T = Object.freeze({ u: -20, v0: APRON.halfWid, v1: APRON.halfWid + 24, half: 3, height: 4.2, floor0: APRON.h, floor1: APRON.h + 1.2, lip: 6, wallBlend: 1.0 });
const tp = (id, u, v, extra = {}) => { const p = apronPoint(u, v); return rec(id, p.e, p.n, extra); };
export const TUBE_SHELTER = Object.freeze({
  ...T,
  mouth: tp('tube-mouth', T.u, T.v0),
  back: tp('tube-back', T.u, T.v1),
  /** the Brazier that kindles (BIBLE §3.4: Braziers at "the Malpais tube shelter") */
  brazier: tp('tube-brazier', T.u, T.v0 + 15),
  /** the dormant Peg nest (area C places its Pegs; 0 wake in 10 visits unless struck, MP6) */
  nest: tp('tube-nest', T.u + 0.5, T.v1 - 2.5),
  /** the salt cache (BIBLE §3.4: "the Malpais tube shelter") in a niche of the west wall */
  cache: tp('tube-cache', T.u - T.half + 0.5, T.v0 + 11),
});

/** The tube floor's height (m) at v (the apron's frame). */
export const tubeFloor = (v) => T.floor0 + (T.floor1 - T.floor0) * Math.min(1, Math.max(0, (v - T.v0) / (T.v1 - T.v0)));

/** The authored box outside which the Malpais blockout leaves the ground as it was (the same float). */
export const FOOTPRINT = (() => {
  let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  const m = APRON.batter + 1;
  for (const [u, v] of [[-APRON.halfLen - m, -APRON.halfWid - m], [APRON.halfLen + m, -APRON.halfWid - m], [-APRON.halfLen - m, APRON.halfWid + m], [APRON.halfLen + m, APRON.halfWid + m],
    [T.u - T.half - T.wallBlend - 1, T.v1 + T.wallBlend + 1], [T.u + T.half + T.wallBlend + 1, T.v1 + T.wallBlend + 1]]) {
    const p = apronPoint(u, v);
    e0 = Math.min(e0, p.e); e1 = Math.max(e1, p.e); n0 = Math.min(n0, p.n); n1 = Math.max(n1, p.n);
  }
  return Object.freeze({ e0: Math.floor(e0), e1: Math.ceil(e1), n0: Math.floor(n0), n1: Math.ceil(n1) });
})();

/**
 * The hornitos (vertical capsules, the cone's mid radius) and the tube's two side walls and its back (boxes the height
 * of its headroom along the trench's walls, so she cannot climb the bake's smeared wall out of the tube); the crust is
 * not a blocker (it is over her head: nav's walk grid would not stamp it, and the camera keeps it as a camera collider).
 * @param {(x: number, z: number) => number} ground  engine frame
 */
export function malpaisColliders(ground) {
  const out = [];
  for (const h of HORNITOS) {
    const g = ground(h.x, h.z);
    out.push({ kind: 'landmark', id: h.id, shape: { type: 'capsule', a: [h.x, g - 0.5, h.z], b: [h.x, g + h.h * 0.7, h.z], radius: h.r * 0.62 } });
  }
  for (const b of tubeBoxes(ground)) out.push({ kind: 'landmark', id: b.id, shape: { type: 'box', c: [b.x, b.y, b.z], half: b.half, yaw: b.yaw }, camera: true, blocking: b.blocking });
  return out;
}

/**
 * The tube's grey boxes (engine frame): the two walls and the back as blockers, the crust as the roof (not a blocker).
 * The crust is cut in four lengths, each reaching up to the ground beside the trench (`natural(x, z)`, engine frame: the
 * recipe in Node, the bake at run time, read past the trench's wall blend where the cut does not reach); with no
 * `natural` the crust is 1.5 m thick.
 */
export function tubeBoxes(natural = null) {
  const out = [];
  const yaw = Math.atan2(-Math.cos(APRON.bearing * Math.PI / 180), Math.sin(APRON.bearing * Math.PI / 180));   // local +x along u
  const len = T.v1 - T.v0, mid = (T.v0 + T.v1) / 2, fm = (T.floor0 + T.floor1) / 2;
  const at = (id, u, v, y, half, blocking) => { const p = apronPoint(u, v); out.push({ id, x: p.e * S, z: -p.n * S, y, half, yaw, blocking }); };
  // walls: 0.6 m thick, standing on the floor to the crust's underside
  for (const s of [-1, 1]) at(`tube-wall-${s < 0 ? 'w' : 'e'}`, T.u + s * (T.half + 0.3), mid + T.lip / 2, fm + T.height / 2, [0.3, T.height / 2 + 0.2, (len - T.lip) / 2], true);
  at('tube-back', T.u, T.v1 + 0.3, T.floor1 + T.height / 2, [T.half + 0.6, T.height / 2 + 0.2, 0.3], true);
  // the crust: four lengths from the lip to the back
  const L = (len - T.lip) / 4;
  for (let k = 0; k < 4; k++) {
    const v = T.v0 + T.lip + L * (k + 0.5), floor = tubeFloor(v), y0 = floor + T.height;
    let top = y0 + 1.5;
    if (natural) {
      top = y0 + 0.4;
      // the ground beside the trench (past its wall blend) is the shelf as it was: the crust lies flush with it
      for (const du of [-T.half - T.wallBlend - 0.6, T.half + T.wallBlend + 0.6]) for (const dv of [-L / 2, 0, L / 2]) { const p = apronPoint(T.u + du, v + dv); top = Math.max(top, natural(p.e * S, -p.n * S) + 0.25); }
    }
    at(`tube-crust-${k + 1}`, T.u, v, (y0 + top) / 2, [T.half + T.wallBlend + 0.2, (top - y0) / 2, L / 2], false);
  }
  return out;
}
