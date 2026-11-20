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
 *                  this file gives it). R9: along the hornito field's east edge, a tube under a proud crust broken
 *                  open at its upslope end (the mouth), 22 m long, 6 m wide and 4.2 m high inside; the Brazier's spot,
 *                  the dormant nest at its back, the salt cache in a side niche (BIBLE §3.4)
 *   STEAM          the fumarole steam (M3 MP4, BIBLE §3.3 "fumarole steam"; the hornito field "steaming"): every source
 *                  with its place, its plume's height and spread (./malpais-steam.js draws them)
 *   BENCH_B6       Benchmark 6 ("the edge of the hornito field"), snapped to walkable ground
 *   FOOTPRINT      the authored box outside which nothing of the Malpais blockout changes the ground
 *   malpaisColliders(ground)   the hornitos and the tube's walls, in collision.register's shape
 *
 * Frame: the bible's (E, N); engine x = E, z = -N (sites.js). Bands marked * are starting values (M3 briefs §14).
 */
import { ISLAND_SCALE as S } from '../island/extent.js';
import { APRON, apronPoint, YARDS } from './kilnyards-layout.js';

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
/* M3 wave 2 fix round 1: the feet narrowed (were r 3.4, 4.2, 2.6, 3.6, 3.0, 2.4, 3.2): a hornito is a spatter chimney taller
 * than it is wide (its skirt's diameter 0.83-0.87 of its height, the column's about half), not a rubble heap */
export const HORNITOS = Object.freeze([
  [265, -201, 4.5, 1.9, true], [275, -200, 6.0, 2.5, true], [284, -196, 3.2, 1.4, false], [279, -209, 5.0, 2.1, true],
  [290, -205, 3.8, 1.6, true], [268, -208, 3.0, 1.3, false], [295, -214, 4.2, 1.8, false],
].map(([e, n, h, r, steam], i) => rec(`hornito-${i + 1}`, e, n, { h, r, steam })));

/** Benchmark 6 (plan (268, -180), on Rust Cone's 48 deg south foot): the nearest ground no steeper than 20 deg over 4 m. */
export const BENCH_B6 = rec('B6', 268, -196, { plan: Object.freeze({ e: 268, n: -180 }) });

/**
 * The tube (M3 wave 2b, the orchestrator's ruling R9, provisional: "the tube shelter moves to the hornito field (hornitos
 * stand on lava tubes), so F58 can hold both"; the old place: a trench cut north into the Yards' apron batter, its
 * mouth at the apron's west end). It lies on the field's floor along its east edge: a pahoehoe tube whose roof stands
 * proud of the flow (an inflated tube, its crust a low whaleback), broken open at its upslope end, which is the mouth,
 * and running SSE down the flow toward the sea front. Its frame: the mouth (the floor at the opening's centre), the
 * axis' bearing into the tube; s m along the axis, l m to its right. The floor is the field's own ground (no cut: the
 * island's height is not touched); `half` the half-width of its floor, `height` the headroom over it, `crust` the roof's
 * thickness, `wall` the side walls' thickness at the springline. The spots are in the same frame.
 * (Node, tools/world: 2.5 m of fall over its 22 m; every hornito's foot 1.5 m or more off its foot; every spot of it 79 m
 * or more from the Holds' ground, so the Holds' cast is never held while she is in it (EF2: the regions seam approaches
 * at 60 m on foot). The field's south-west edge, nearer the Holds, put the mouth 50 m from them.)
 */
const T = Object.freeze({ e: 306, n: -198, bearing: 170, len: 22, half: 3, height: 4.2, crust: 1.2, wall: 1.3, lip: 0 });
const _tb = T.bearing * Math.PI / 180;
/** A point of the tube's frame (s along the axis from the mouth, l to its right) in the bible's frame (E, N). */
export const tubeEN = (s, l = 0) => ({ e: T.e + Math.sin(_tb) * s + Math.cos(_tb) * l, n: T.n + Math.cos(_tb) * s - Math.sin(_tb) * l });
/** The tube's frame at an engine point: { s, l }. */
export function tubeSL(x, z, out = { s: 0, l: 0 }) {
  const de = x / S - T.e, dn = -z / S - T.n;
  out.s = de * Math.sin(_tb) + dn * Math.cos(_tb); out.l = de * Math.cos(_tb) - dn * Math.sin(_tb);
  return out;
}
const tp = (id, s, l, extra = {}) => { const p = tubeEN(s, l); return rec(id, p.e, p.n, extra); };
export const TUBE_SHELTER = Object.freeze({
  ...T,
  /** the outer foot's half-width (the shell's skirt on the ground) */
  foot: +(T.half + T.wall + 0.6).toFixed(2),
  mouth: tp('tube-mouth', 0, 0),
  back: tp('tube-back', T.len, 0),
  /** the Brazier that kindles (BIBLE §3.4: Braziers at "the Malpais tube shelter"). (M3 wave 3, MP6) 4 m in, right of
   * the axis, under the crust and near the mouth where its smoke leaves (was 9 m in, left: from F58's lens the ray to it
   * ran into the mouth's left wall; from here it passes 0.9 m left of the axis, 2.2 m up) */
  brazier: tp('tube-brazier', 4, 1.2),
  /** the dormant Peg nest (area C places its Pegs; 0 wake in 10 visits unless struck, MP6) */
  nest: tp('tube-nest', T.len - 2.5, 0.5),
  /** the salt cache (BIBLE §3.4: "the Malpais tube shelter") in a niche of the left wall */
  cache: tp('tube-cache', 13, -T.half + 0.5),
});

/** The authored box outside which the Malpais blockout leaves the ground as it was (the same float): the apron's. */
export const FOOTPRINT = (() => {
  let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  const m = APRON.batter + 1;
  for (const [u, v] of [[-APRON.halfLen - m, -APRON.halfWid - m], [APRON.halfLen + m, -APRON.halfWid - m], [-APRON.halfLen - m, APRON.halfWid + m], [APRON.halfLen + m, APRON.halfWid + m]]) {
    const p = apronPoint(u, v);
    e0 = Math.min(e0, p.e); e1 = Math.max(e1, p.e); n0 = Math.min(n0, p.n); n1 = Math.max(n1, p.n);
  }
  return Object.freeze({ e0: Math.floor(e0), e1: Math.ceil(e1), n0: Math.floor(n0), n1: Math.ceil(n1) });
})();

/**
 * The hornitos (vertical capsules, the cone's mid radius) and the tube's two side walls and its back (boxes the height
 * of its headroom along the tube's sides, in four lengths each on its own ground, so she walks in at the mouth only); the
 * crust is not a blocker (it is over her head: nav's walk grid would not stamp it, and the camera keeps it as a camera
 * collider).
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
 * The tube's boxes (engine frame): the two walls and the back as blockers, the crust as the roof (a camera collider, not
 * a blocker), each length standing on the floor under its middle. `ground(x, z)` the drawn terrain (engine frame); with
 * none the floor is 0.
 */
export function tubeBoxes(ground = null) {
  const out = [];
  const yaw = Math.atan2(-Math.cos(_tb), Math.sin(_tb));   // local +x along the axis (s), +z along l
  const G = (s, l) => { const p = tubeEN(s, l); return ground ? ground(p.e * S, -p.n * S) : 0; };
  const at = (id, s, l, y, half, blocking) => { const p = tubeEN(s, l); out.push({ id, x: p.e * S, z: -p.n * S, y, half, yaw, blocking }); };
  const K = 4, L = (T.len - T.lip) / K, tw = T.wall * 0.5;
  for (let k = 0; k < K; k++) {
    const s = T.lip + L * (k + 0.5), f = G(s, 0);
    // walls: standing on the floor to the crust's underside
    for (const sg of [-1, 1]) at(`tube-wall-${sg < 0 ? 'l' : 'r'}-${k + 1}`, s, sg * (T.half + tw), f + T.height / 2 - 0.2, [L / 2, T.height / 2 + 0.4, tw], true);
    // the crust over the headroom
    at(`tube-crust-${k + 1}`, s, 0, f + T.height + T.crust / 2, [L / 2, T.crust / 2, T.half + T.wall], false);
  }
  const fb = G(T.len, 0);
  at('tube-back', T.len + 0.4, 0, fb + T.height / 2, [0.5, T.height / 2 + 0.4, T.half + tw], true);
  return out;
}

/**
 * THE STEAM (M3 MP4: ">= 3 steam sources in F56 and >= 3 in F58; each is fumarole white, 0 emissive"): the sources, as
 * data, in the engine frame: { id, kind: 'hornito' | 'vent' | 'stack', x, z, base (m over the ground at x, z: a
 * hornito's or a stack's top), h (the plume's rise, m), r (a puff's starting radius, m), n (puffs in flight) }.
 * The plumes keep inside the computed masks' headrooms (tools/frames/stagings/m3-world.mjs MASKS: the Malpais ground
 * 12 m, the hornito field 20 m, the Yards 32 m over the shelf; a puff rises to 1.15 of its plume's rise at most): a vent's
 * plume rises at most 10 m, a hornito's to 19.6 m over its foot, a stack's to 31 m.
 *   VENTS   fumaroles in the cold flow: cracks that breathe, no cone (two on Rust Cone's south-west foot, three in the aa
 *           between it and the hornito field)
 */
export const VENTS = Object.freeze([
  [262, -168, 0.9], [244, -186, 1.1], [257, -207, 0.8], [233, -168, 0.7], [276, -152, 0.8],
].map(([e, n, k], i) => rec(`vent-${i + 1}`, e, n, { k })));
const STEAM_STACKS = Object.freeze({ 'stack-4': 9, 'stack-20': 10 });
export const STEAM = Object.freeze([
  ...HORNITOS.filter((h) => h.steam).map((h) => Object.freeze({ id: `steam-${h.id}`, kind: 'hornito', x: h.x, z: h.z, base: h.h, h: +Math.min(13, (19.6 - h.h) / 1.15).toFixed(2), r: h.r * 0.45, n: 14 })),
  // (M3 wave 3, MP4's cost per source) a vent's plume 8 puffs in flight (was 12), its puffs swelling less (malpais-steam.js)
  ...VENTS.map((v) => Object.freeze({ id: `steam-${v.id}`, kind: 'vent', x: v.x, z: v.z, base: 0.2, h: 9 * v.k, r: 0.8, n: 8 })),
  ...YARDS.stacks.filter((s) => STEAM_STACKS[s.id]).map((s) => Object.freeze({ id: `steam-${s.id}`, kind: 'stack', x: s.x, z: s.z, base: s.h, h: STEAM_STACKS[s.id], r: s.r * 0.8, n: 12 })),
]);
