#!/usr/bin/env node
/**
 * CALIMA — the M3 SURFACES (wave 3, area C): the Kiln, the Davit and the Sonde dressed in the Instruments' shared
 * language on their accepted grey forms. Original work: no third-party asset is read. Built from the shared hull kit
 * (`parts/kit.mjs`): weathered white enamel plates over gunmetal cores and joints, tarnished brass trim, rings and
 * rivets, pale-ice glass, flat survey ink; baked AO, the dust band at the feet, verdigris in the brass crevices.
 *
 *   node tools/build/instruments/gen-m3-art.mjs [--out <dir>] [--only kiln,davit,sonde]
 *     -> public/models/instruments/{kiln,davit,sonde}.glb
 *
 * ONE SOURCE. Every part is read from the kinds' own form modules (src/instruments/kinds/<kind>/form.js, through
 * tools/gates/instruments/m3/forms.mjs): a part's place, size and tone come from the accepted grey form and only its
 * surface is made here, so the silhouette, the heights of IK1 and every anchor the rules use (the firebox door, the
 * hose coupling, the keel ring, the lamp) are the form's. The body frame is the form's (y up from the ground under the
 * hull's centre, +z forward): nothing is recentred.
 *
 * THE NEVER LIST holds: no head, no eye, no lens on a neck, no glow inside a body. A lamp is a drum (or the Sonde's
 * lantern cage) whose iris the lamp system draws in the state's colour (calm #F2EAD3, wary #B5E61D, hostile #FF2D8C;
 * never red): nothing in a GLB is lamp-coloured. The only emissive glass is the pale-ice canisters (<= #D6F0EE), and
 * the only fire is the Kiln's coal bed BEHIND its firebox door (the one place a hull glows, and only while the door is
 * sprung: the shut door covers the whole opening).
 *
 * Nodes (each kind's moving or removable pieces are their own `tool` nodes, the hull's material, `extras.anchor` the
 * pivot in the body frame): the Kiln's `door` (hinge), `stack` (trunnion), `hose` (the Davit re-seats it);
 * the Davit's `plate1..3` (its rack: one fewer per repair); the Sonde's `rotorR` / `rotorL` (spin about +y).
 * `asset.extras.r5Sockets` carries the lamp ({ at, r, shape, axis }), the door, the coupling and the keel.
 *
 * Budgets (IK1): triangles <= 80 k / 50 k / 25 k; textures: the kit's shared 256 x 256 decal atlas and its 8 x 4
 * palette (inside a 1024 x 1024 set each).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V, strut, ball, rbox, lathe, at, plate, basis, AXIS_Z, AXIS_X } from '../lib/hs.mjs';
import {
  THREE, C, KBucket, mergeLabelled, finish, writeInstrument, lod1From, resetKitStats, kitStats,
  rivet, rivetRing, lampDrum, antenna, VIAL_PROFILE,
} from './parts/kit.mjs';
import { M3_FORMS } from '../../gates/instruments/m3/forms.mjs';
import { KILN_DOOR, KILN_COUPLING } from '../../../src/instruments/kinds/kiln/form.js';
import { SONDE_KEEL } from '../../../src/instruments/kinds/sonde/form.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const LANE = 'instruments';
export const RECIPE = 'tools/build/instruments/gen-m3-art.mjs';
export const ART_KINDS = Object.freeze(['kiln', 'davit', 'sonde']);
export const OUTPUTS = ART_KINDS.map((k) => `public/models/instruments/${k}.glb`);
export const TRI_CAP = Object.freeze({ kiln: 80000, davit: 50000, sonde: 25000 });

/**
 * The fire behind the Kiln's door: a coal bed's orange (linear factor; the page and the game scale it by the door) and
 * the deeper red of its dull coals (wave 3c: two glows, so the bed has a hot heart and a dull crust, not one flat colour).
 */
export const FIRE = Object.freeze({ hex: 0xff5a14, crust: 0xb8300a });
const SOOT = 0x2a2522;

/** A small deterministic generator (the kit's rule: no clocks, no Math.random). */
function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/**
 * THE COAL BED (M3 wave 3c; the wave-3 review: "the fire behind the open door reads as a flat salmon panel"). Not a
 * panel: a heap of faceted coals with relief, banked higher at the back and in the middle, behind the grate's bars, its
 * heart hot (`fire`), its crust of dull coals (`crust`) and a few dead black clinkers (the hull's soot); hot coals banked
 * up the sooty back (no pointed flames: in the dark opening they read as teeth). Everything stays inside the door's outline and behind its
 * back face (art.test.mjs: the fire is seen only through the sprung door), and in front of the recess's back plate.
 * The game and the page flicker the two glows (kinds/kiln/kind.js `fireFlicker`).
 */
function coalBed(fire, crust, hull, { cy, zb, D }) {
  const rnd = lcg(0x6b11);
  const hx = D.half[0], hy = D.half[1], doorBack = D.c[2] - D.half[2] - 0.02;   // 2 cm clear of the shut door's back
  const yFloor = cy - hy;
  const q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const lump = (bucket, x, y, z, r, surf, tone) => {
    const g = new THREE.IcosahedronGeometry(r, 0);
    e.set(rnd() * 6.283, rnd() * 6.283, rnd() * 6.283); q.setFromEuler(e);
    sc.set(1 + rnd() * 0.35, 0.65 + rnd() * 0.3, 1 + rnd() * 0.3);
    p.set(x, y, z);
    bucket.add(g, { surf, tone, wear: 0, matrix: new THREE.Matrix4().compose(p, q, sc) });
    g.dispose();
  };
  for (let i = 0; i < 130; i++) {
    const r = 0.022 + rnd() * 0.0135;                    // the bed is 0.10 m deep: a coal fits it with its tumble
    const x = (rnd() * 2 - 1) * (hx - r * 1.4);
    const back = rnd();                                   // 0 at the back plate, 1 at the bed's front
    const z = zb + 0.02 + r * 1.4 + back * Math.max(0, doorBack - zb - 0.02 - r * 2.8);
    // the heap: its crest 0.34 m over the floor in the middle at the back, falling to the sides and the front
    const crest = 0.34 * (1 - 0.55 * (x / hx) ** 2) * (1 - 0.55 * back);
    const u = Math.sqrt(rnd());
    const y = yFloor + r * 1.4 + u * Math.max(0.01, crest - r);
    const deep = (1 - u) * 0.7 + (1 - back) * 0.3;        // low and at the back: the heart
    const k = rnd();
    if (k < 0.12) lump(hull, x, y, z, r, 'graphite', 0x141210);          // a dead clinker
    else if (deep > 0.55 || k > 0.82) lump(fire, x, y, z, r, 'lamp', FIRE.hex);
    else lump(crust, x, y, z, r, 'lamp', FIRE.crust);
  }
  // no tongues of flame (wave 3c, after the first film at 17ed6fd: five pointed cones in the dark opening of the sprung
  // door read as teeth in a mouth); the hot coals are banked up the sooty back instead, a glowing slope, never a sheet
  for (let i = 0; i < 46; i++) {
    const r = 0.02 + rnd() * 0.012;
    const x = (rnd() * 2 - 1) * (hx - r * 1.6);
    const y = yFloor + 0.2 + rnd() * 0.24 * (1 - 0.6 * (x / hx) ** 2);
    const hot = rnd() < 0.7;
    lump(hot ? fire : crust, x, y, zb + 0.02 + r * 1.4, r, 'lamp', hot ? FIRE.hex : FIRE.crust);
  }
}

const P = (r, h, surf, tone) => ({ r, h, surf, tone });
const MAT = { y: null, z: AXIS_Z, x: AXIS_X };
/** The lathe frame of a form cylinder: local +Y along its axis, the origin at its centre. */
const frameOf = (c, axis = 'y') => at(c[0], c[1], c[2], MAT[axis] ? MAT[axis].clone() : null);
const AXV = { x: V(1, 0, 0), y: V(0, 1, 0), z: V(0, 0, 1) };

/* ------------------------------------------------------------------ */
/* dressing: one form part -> its surface                               */
/* ------------------------------------------------------------------ */

/** A turned enamel cylinder (a frustum when r2): a gunmetal core and `panels` enamel plates with seams, rivet rings. */
function platedCyl(b, c, r, r2, h, axis, { panels = 8, gap = 2.2, rivets = true, tone = C.ENAMEL, wear = 0.4, lip = true } = {}) {
  const M = frameOf(c, axis), hh = h / 2;
  lathe(b, [P(0, -hh, 'graphite', C.GUNMETAL), P(r * 0.965, -hh, 'graphite', C.GUNMETAL), P(r2 * 0.965, hh, 'graphite', C.GUNMETAL), P(0, hh, 'graphite', C.GUNMETAL)],
    M, { segs: 32, wear: 0.3, crease: 40 });
  const e = Math.min(0.03, h * 0.08);
  const prof = lip
    ? [P(r * 0.97, -hh + 0.002, 'glaze', tone), P(r, -hh + e, 'glaze', tone), P(r2, hh - e, 'glaze', tone), P(r2 * 0.97, hh - 0.002, 'glaze', tone)]
    : [P(r, -hh, 'glaze', tone), P(r2, hh, 'glaze', tone)];
  lathe(b, prof, M, { segs: Math.max(24, panels * 6), panels, gap, wear, crease: 40 });
  if (rivets && h > 0.12) {
    const ax = AXV[axis].clone();
    const C0 = V(...c);
    for (const [f, rr] of [[-hh + e * 1.6, r], [hh - e * 1.6, r2]]) {
      const n = Math.max(8, Math.round((2 * Math.PI * rr) / 0.2));
      rivetRing(b, C0.clone().addScaledVector(ax, f), ax, rr * 1.0, n, 0.01, { radial: true, phase: Math.PI / n });
    }
  }
}

/** A turned solid in one surface (brass trim, gunmetal drums): bevelled ends, `r` at the axis' -end and `r2` at +. */
function turned(b, c, r, r2, h, axis, surf, tone, wear = 0.5) {
  const hh = h / 2, bv = Math.min(0.012, h * 0.2, r * 0.2);
  lathe(b, [P(0, -hh, surf, tone), P(r - bv, -hh, surf, tone), P(r, -hh + bv, surf, tone), P(r2, hh - bv, surf, tone), P(r2 - bv, hh, surf, tone), P(0, hh, surf, tone)],
    frameOf(c, axis), { segs: r > 0.3 ? 40 : r > 0.1 ? 24 : 14, wear, crease: 35 });
}

/** A plated box: a gunmetal core and an enamel plate on each face but the floor, split into panels, rivets at corners. */
function platedBox(b, c, s, { tone = C.ENAMEL, faces = ['+x', '-x', '+y', '+z', '-z'], panelMax = 0.9, rivets = true, skip = null } = {}) {
  const C0 = V(...c);
  rbox(b, C0, s.map((v) => v * 0.97), Math.min(0.03, Math.min(...s) / 5), { surf: 'graphite', tone: C.GUNMETAL, wear: 0.3, segs: 1 });
  const T = 0.022, M = 0.035, G = 0.026;
  for (const f of faces) {
    const k = { x: 0, y: 1, z: 2 }[f[1]], sg = f[0] === '+' ? 1 : -1;
    const ia = [0, 1, 2].filter((q) => q !== k);              // the plate's two in-plane axes
    const A = s[ia[0]] - 2 * M, B = s[ia[1]] - 2 * M;
    if (A <= 0.04 || B <= 0.04) continue;
    const long = A >= B ? 0 : 1, Lg = long === 0 ? A : B, n = Math.max(1, Math.ceil(Lg / panelMax));
    const pl = (Lg - (n - 1) * G) / n;
    for (let i = 0; i < n; i++) {
      const off = -Lg / 2 + pl / 2 + i * (pl + G);
      const ctr = C0.clone(), size = [0, 0, 0];
      ctr.setComponent(k, c[k] + sg * (s[k] / 2 - T / 2 + 0.004));
      size[k] = T;
      size[ia[long]] = pl; size[ia[1 - long]] = long === 0 ? B : A;
      ctr.setComponent(ia[long], c[ia[long]] + off);
      if (skip && skip(f, ctr, size)) continue;
      rbox(b, ctr, size, 0.008, { surf: 'glaze', tone, wear: 0.4, segs: 1 });
      if (!rivets) continue;
      const nrm = V(0, 0, 0); nrm.setComponent(k, sg);
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const p = ctr.clone();
        p.setComponent(k, ctr.getComponent(k) + sg * T / 2);
        p.setComponent(ia[0], ctr.getComponent(ia[0]) + u * (size[ia[0]] / 2 - 0.035));
        p.setComponent(ia[1], ctr.getComponent(ia[1]) + v * (size[ia[1]] / 2 - 0.035));
        rivet(b, p, nrm, 0.01);
      }
    }
  }
}

const vec = (a) => V(a[0], a[1], a[2]);

/** A gunmetal limb bar; a bar of 0.1 m or more carries an enamel greave over its middle and brass collars. */
function limb(b, p) {
  const A = vec(p.a), B = vec(p.b);
  strut(b, A, B, p.r, p.r, { surf: 'graphite', tone: C.GUNMETAL, sides: 12, wear: 0.3 });
  if (p.r >= 0.1) {
    const d = B.clone().sub(A);
    const a0 = A.clone().addScaledVector(d, 0.2), a1 = A.clone().addScaledVector(d, 0.72);
    strut(b, a0, a1, p.r * 1.2, p.r * 1.12, { surf: 'glaze', tone: C.ENAMEL, sides: 12, wear: 0.45 });
    for (const q of [a0, a1]) strut(b, q.clone().addScaledVector(d.clone().normalize(), -0.02), q.clone().addScaledVector(d.clone().normalize(), 0.02), p.r * 1.27, p.r * 1.27, { surf: 'bronze', tone: C.BRASS, sides: 12, wear: 0.6 });
  } else if (p.r >= 0.05) {
    for (const q of [A, B]) ball(b, q, p.r * 1.25, { surf: 'bronze', tone: C.BRASS, w: 10, h: 6, wear: 0.6 });
  }
}

/** The default dress of a part by its tone (a kind dresses its special parts itself first). */
function dressPart(b, p) {
  if (p.type === 'strut') {
    if (p.tone === 'joint') return limb(b, p);
    if (p.tone === 'brass') return strut(b, vec(p.a), vec(p.b), p.r, p.r, { surf: 'bronze', tone: C.BRASS, sides: 10, wear: 0.6 });
    // an enamel bar with brass collars at its ends
    const A = vec(p.a), B = vec(p.b), d = B.clone().sub(A).normalize();
    strut(b, A, B, p.r, p.r, { surf: 'glaze', tone: C.ENAMEL, sides: 10, wear: 0.45 });
    for (const q of [A, B]) strut(b, q.clone().addScaledVector(d, -0.025), q.clone().addScaledVector(d, 0.025), p.r * 1.3, p.r * 1.3, { surf: 'bronze', tone: C.BRASS, sides: 10, wear: 0.6 });
    return;
  }
  if (p.type === 'box') {
    if (p.tone === 'joint') return rbox(b, vec(p.c), p.s, Math.min(0.03, Math.min(...p.s) / 5), { surf: 'graphite', tone: C.GUNMETAL, wear: 0.3, segs: 1 });
    if (p.tone === 'brass') return rbox(b, vec(p.c), p.s, Math.min(0.012, Math.min(...p.s) / 5), { surf: 'bronze', tone: C.BRASS, wear: 0.6, segs: 1 });
    return platedBox(b, p.c, p.s);
  }
  if (p.type === 'cyl') {
    const r2 = p.r2 ?? p.r;
    if (p.tone === 'joint') return turned(b, p.c, p.r, r2, p.h, p.axis, 'graphite', C.GUNMETAL, 0.3);
    if (p.tone === 'brass') return turned(b, p.c, p.r, r2, p.h, p.axis, 'bronze', C.BRASS, 0.6);
    return platedCyl(b, p.c, p.r, r2, p.h, p.axis, { panels: Math.max(4, Math.min(12, Math.round((2 * Math.PI * Math.max(p.r, r2)) / 0.75))) });
  }
  throw new Error(`no dress for ${p.name} (${p.type})`);
}

/** A glass canister (a vial's family): pale-ice glass in `glass`, brass end caps and bands and a gunmetal cage in `b`. */
function canister(b, glass, c, r, h) {
  const C0 = V(...c), M = at(c[0], c[1], c[2]);
  const gl = h / 2 - 0.05;
  lathe(glass, VIAL_PROFILE.map(([rr, hh]) => ({ r: rr * r * 0.92, h: hh * gl, surf: 'lamp', tone: C.ICE })).reverse(), M, { segs: 18, wear: 0, crease: 50 });
  for (const s of [-1, 1]) {
    turned(b, [c[0], c[1] + s * (h / 2 - 0.035), c[2]], r * 0.98, r * 0.98, 0.07, 'y', 'bronze', C.BRASS, 0.6);
    rivetRing(b, C0.clone().add(V(0, s * (h / 2 - 0.035), 0)), V(0, 1, 0), r * 0.98, 8, 0.009, { radial: true });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4, x = Math.cos(a) * r * 1.0, z = Math.sin(a) * r * 1.0;
    strut(b, V(c[0] + x, c[1] - h / 2 + 0.06, c[2] + z), V(c[0] + x, c[1] + h / 2 - 0.06, c[2] + z), 0.012, 0.012, { surf: 'graphite', tone: C.GUNMETAL, sides: 6 });
  }
  const tg = new THREE.TorusGeometry(r * 0.96, 0.008, 4, 20);
  b.add(tg, { surf: 'bronze', tone: C.BRASS, wear: 0.6, matrix: new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(c[0], c[1], c[2])) });
  tg.dispose();
}

/** Soot and streaks: darken a bucket's vertex colours by f(x, y, z) in 0..1 (1 = soot). */
function soot(b, f) {
  const s = new THREE.Color(SOOT);
  for (let i = 0; i < b.pos.length; i += 3) {
    const k = Math.max(0, Math.min(1, f(b.pos[i], b.pos[i + 1], b.pos[i + 2])));
    if (k <= 0) continue;
    b.col[i] = b.col[i] * (1 - k) + s.r * k; b.col[i + 1] = b.col[i + 1] * (1 - k) + s.g * k; b.col[i + 2] = b.col[i + 2] * (1 - k) + s.b * k;
  }
}
/** Rust-brown run-off and grime under seams on the enamel: a fixed noise field, stronger low on the hull. */
function weather(b, { lowY = 0.6, topY = 3, k = 0.18 } = {}) {
  const g = new THREE.Color(0x6b5a46);
  for (let i = 0; i < b.pos.length; i += 3) {
    const x = b.pos[i], y = b.pos[i + 1], z = b.pos[i + 2];
    const streak = Math.max(0, Math.sin(x * 9.1 + z * 7.3) * 0.5 + Math.sin(x * 23.7 - z * 19.1) * 0.5 - 0.35);
    const low = Math.max(0, Math.min(1, (topY - y) / (topY - lowY)));
    const w = Math.min(0.5, k * (streak * 1.6 + low * 0.5));
    b.col[i] = b.col[i] * (1 - w) + g.r * w * 0.6; b.col[i + 1] = b.col[i + 1] * (1 - w) + g.g * w * 0.6; b.col[i + 2] = b.col[i + 2] * (1 - w) + g.b * w * 0.6;
  }
}

/* ------------------------------------------------------------------ */
/* the kinds                                                            */
/* ------------------------------------------------------------------ */

function byName(parts) { const m = new Map(); for (const p of parts) m.set(p.name, p); return m; }

/** THE KILN: an enamel beehive with an oxblood firebox, the bottle stack on its trunnion, glass canisters, its hose. */
function kiln() {
  const F = M3_FORMS.kiln, N = byName(F.parts);
  const hull = new KBucket('kiln-hull'), glass = new KBucket('kiln-glass'), fire = new KBucket('kiln-fire'), crust = new KBucket('kiln-crust');
  const door = new KBucket('door'), stack = new KBucket('stack'), hose = new KBucket('hose');
  const done = new Set();
  const take = (...names) => names.forEach((n) => done.add(n));
  // the beehive: plated courses, an oxblood glaze band at the dome's foot (the bible's oxblood, the firebox's family)
  for (const n of ['fireBody', 'domeLow', 'domeHigh']) {
    const p = N.get(n);
    platedCyl(hull, p.c, p.r, p.r2 ?? p.r, p.h, 'y', { panels: n === 'domeHigh' ? 6 : 8, gap: 2.4 });
    take(n);
  }
  { const p = N.get('domeLow'); turned(hull, [0, p.c[1] - p.h / 2 + 0.035, 0], p.r * 1.012, p.r * 1.004, 0.07, 'y', 'glaze', C.OXBLOOD, 0.4); }
  // the firebox: an oxblood surround (a frame round the opening), the coal bed behind it (fire), a grate, the door
  const S = N.get('fireboxSurround'), D = KILN_DOOR, ow = D.half[0] * 2 + 0.04, oh = D.half[1] * 2 + 0.04;
  const zf = S.c[2] + S.s[2] / 2, z0 = S.c[2] - S.s[2] / 2, cy = S.c[1];
  const sideW = (S.s[0] - ow) / 2, capH = (S.s[1] - oh) / 2;
  const ox = { surf: 'glaze', tone: C.OXBLOOD, wear: 0.55, segs: 1 };
  rbox(hull, V(0, cy + oh / 2 + capH / 2, S.c[2]), [S.s[0], capH, S.s[2]], 0.02, ox);
  rbox(hull, V(0, cy - oh / 2 - capH / 2, S.c[2]), [S.s[0], capH, S.s[2]], 0.02, ox);
  for (const s of [-1, 1]) rbox(hull, V(s * (ow / 2 + sideW / 2), cy, S.c[2]), [sideW, oh, S.s[2]], 0.02, ox);
  // a brass rim inside the opening's lip and rivets on the frame's face
  for (const [a, bb] of [[[-ow / 2, cy - oh / 2], [ow / 2, cy - oh / 2]], [[-ow / 2, cy + oh / 2], [ow / 2, cy + oh / 2]], [[-ow / 2, cy - oh / 2], [-ow / 2, cy + oh / 2]], [[ow / 2, cy - oh / 2], [ow / 2, cy + oh / 2]]]) {
    strut(hull, V(a[0], a[1], zf - 0.01), V(bb[0], bb[1], zf - 0.01), 0.018, 0.018, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.6 });
  }
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) rivet(hull, V(s * (ow / 2 + sideW / 2), cy - oh / 2 + 0.07 + i * (oh - 0.14) / 5, zf + 0.002), V(0, 0, 1), 0.012);
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) rivet(hull, V(-S.s[0] / 2 + 0.08 + i * (S.s[0] - 0.16) / 6, cy + s * (oh / 2 + capH / 2), zf + 0.002), V(0, 0, 1), 0.012);
  // the recess: sooty walls, the coal bed (the fire) at its back, a gunmetal grate across its lower half
  // the recess's back stands just proud of the fire body's skin (r 1.29 m at the door's centre line), so the coal bed is
  // seen through the sprung door and never inside the body
  const zb = 1.34;
  rbox(hull, V(0, cy, zb - 0.02), [ow + 0.02, oh + 0.02, 0.03], 0.005, { surf: 'graphite', tone: SOOT, wear: 0.1, segs: 1 });
  coalBed(fire, crust, hull, { cy, zb, D });
  for (let i = 0; i < 5; i++) strut(hull, V(-ow / 2, cy - oh / 2 + 0.08 + i * 0.07, zb + 0.06), V(ow / 2, cy - oh / 2 + 0.08 + i * 0.07, zb + 0.06), 0.014, 0.014, { surf: 'graphite', tone: C.GUNMETAL, sides: 6, wear: 0.2 });
  take('fireboxSurround');
  // the door (its own node, hinged on the left): a gunmetal iron plate, a brass rim, strap hinges, a latch bar, three
  // dark draught slots (never lit: a vent, not a mouth or an eye), rivets
  const dc = V(...D.c), hx = -D.half[0], dz = D.c[2] - D.half[2] + 0.03;
  rbox(door, V(dc.x, dc.y, dz), [D.half[0] * 2, D.half[1] * 2, D.half[2] * 2], 0.012, { surf: 'graphite', tone: 0x3a3836, wear: 0.5, segs: 1 });
  for (const [a, bb] of [[[-1, -1], [1, -1]], [[-1, 1], [1, 1]], [[-1, -1], [-1, 1]], [[1, -1], [1, 1]]]) {
    strut(door, V(a[0] * (D.half[0] - 0.02), dc.y + a[1] * (D.half[1] - 0.02), dz + D.half[2] + 0.004), V(bb[0] * (D.half[0] - 0.02), dc.y + bb[1] * (D.half[1] - 0.02), dz + D.half[2] + 0.004), 0.016, 0.016, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.65 });
  }
  for (const yy of [-0.26, 0.26]) {
    rbox(door, V(hx + 0.22, dc.y + yy, dz + D.half[2] + 0.012), [0.5, 0.07, 0.018], 0.006, { surf: 'bronze', tone: C.BRASS, wear: 0.65, segs: 1 });
    for (const xx of [0.05, 0.22, 0.4]) rivet(door, V(hx + xx, dc.y + yy, dz + D.half[2] + 0.022), V(0, 0, 1), 0.011);
  }
  rbox(door, V(D.half[0] - 0.1, dc.y, dz + D.half[2] + 0.03), [0.06, 0.34, 0.05], 0.01, { surf: 'bronze', tone: C.BRASS, wear: 0.7, segs: 1 });
  for (let i = 0; i < 3; i++) rbox(door, V(0.04, dc.y - 0.08 + i * 0.08, dz + D.half[2] + 0.002), [0.36, 0.028, 0.012], 0.004, { surf: 'graphite', tone: 0x161514, wear: 0, segs: 1 });
  take('fireboxDoor');
  // the stack on its trunnion (its own node: it tilts to shell): a plated bottle stack, sooted toward the muzzle
  { const p = N.get('chimney'); platedCyl(stack, p.c, p.r, p.r2, p.h, 'y', { panels: 6, gap: 2.6 }); }
  for (const n of ['hoopLow', 'hoopHigh', 'muzzle']) { const p = N.get(n); turned(stack, p.c, p.r * 1.02, p.r * 1.02, p.h, 'y', 'bronze', C.BRASS, 0.7); }
  { const m = N.get('muzzle'); turned(stack, [m.c[0], m.c[1] + m.h / 2 + 0.003, m.c[2]], m.r * 0.82, m.r * 0.82, 0.004, 'y', 'graphite', 0x161412, 0.1); }
  { const p = N.get('finial'); antenna(stack, V(p.c[0], p.c[1] - p.h / 2 - 0.08, p.c[2]), V(p.c[0], p.c[1] + p.h / 2, p.c[2]), { r: 0.012, finial: 0.1 }); }
  take('chimney', 'hoopLow', 'hoopHigh', 'muzzle', 'finial');
  soot(stack, (x, y) => (y > 4.6 ? (y - 4.6) / 0.75 * 0.85 : 0));
  // the lamp drum low at the front right (the form's drum; the iris is the lamp system's)
  const LD = N.get('lampDrum'), L = N.get('lamp');
  const dr = lampDrum(hull, V(LD.c[0], LD.c[1], LD.c[2] - LD.h / 2), V(0, 0, 1), { r: LD.r, depth: L.c[2] + L.h / 2 - (LD.c[2] - LD.h / 2), ticks: 16 });
  take('lampDrum', 'lamp');
  // the canisters: pale-ice glass in brass and gunmetal
  for (let i = 1; i <= 4; i++) { const p = N.get(`canister${i}`); canister(hull, glass, p.c, p.r, p.h); take(`canister${i}`); }
  // the hose (its own node: a Davit re-seats it): an armoured gunmetal hose with brass ferrules, a brass coupling
  for (const n of ['hoseRun', 'hose']) {
    const p = N.get(n), A = vec(p.a), B = vec(p.b), d = B.clone().sub(A), Lh = d.length();
    strut(hose, A, B, p.r, p.r, { surf: 'rubber', tone: 0x26231f, sides: 12, wear: 0.4 });
    const nf = Math.max(2, Math.round(Lh / 0.24));
    for (let k = 1; k < nf; k++) { const q = A.clone().addScaledVector(d, k / nf); strut(hose, q.clone().addScaledVector(d, -0.012 / Lh), q.clone().addScaledVector(d, 0.012 / Lh), p.r * 1.12, p.r * 1.12, { surf: 'bronze', tone: C.BRASS, sides: 12, wear: 0.6 }); }
    take(n);
  }
  { const p = N.get('hoseCoupling'); turned(hose, p.c, p.r, p.r, p.h, 'x', 'bronze', C.BRASS, 0.7); rivetRing(hose, vec(p.c).add(V(p.h / 2, 0, 0)), V(1, 0, 0), p.r * 0.7, 6, 0.01); take('hoseCoupling'); }
  // the reel: gunmetal with brass flanges
  { const p = N.get('hoseReel'); turned(hull, p.c, p.r * 0.8, p.r * 0.8, p.h, 'x', 'graphite', C.GUNMETAL, 0.3);
    for (const s of [-1, 1]) { turned(hull, [p.c[0] + s * (p.h / 2 - 0.02), p.c[1], p.c[2]], p.r, p.r, 0.04, 'x', 'bronze', C.BRASS, 0.6); rivetRing(hull, vec(p.c).add(V(s * (p.h / 2), 0, 0)), V(s, 0, 0), p.r * 0.85, 10, 0.01); }
    for (let k = 0; k < 4; k++) { const tg = new THREE.TorusGeometry(p.r * 0.84, 0.05, 6, 24); hull.add(tg, { surf: 'rubber', tone: 0x26231f, wear: 0.3, matrix: new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(p.c[0] - 0.2 + k * 0.13, p.c[1], p.c[2])) }); tg.dispose(); }
    take('hoseReel'); }
  for (const p of F.parts) if (!done.has(p.name)) dressPart(hull, p);
  // weathering: grime low, soot above the firebox's mouth and streaked up the front of the dome
  weather(hull, { lowY: 0.4, topY: 3.2, k: 0.26 });
  soot(hull, (x, y, z) => (z > 0.6 && Math.abs(x) < 0.75 && y > cy + oh / 2 && y < 3.3 ? 0.55 * (1 - Math.abs(x) / 0.75) * Math.min(1, (3.3 - y) / 0.8) : 0));
  const T = F.parts.find((p) => p.name === 'trunnion');
  return {
    hull, sensors: [{ bucket: glass, name: 'r5-kiln-canister-glass', emissive: C.ICE }, { bucket: fire, name: 'r5-kiln-fire', emissive: FIRE.hex, baseColor: [0.08, 0.03, 0.01, 1] }, { bucket: crust, name: 'r5-kiln-crust', emissive: FIRE.crust, baseColor: [0.05, 0.02, 0.01, 1] }],
    tools: [{ bucket: door, anchor: [hx, D.c[1], D.c[2]] }, { bucket: stack, anchor: T.c }, { bucket: hose, anchor: KILN_COUPLING }],
    lamp: { at: dr.face, r: dr.radius, shape: 'disc', axis: [0, 0, 1] },
    sockets: { door: D.c, doorHinge: [hx, D.c[1], D.c[2]], coupling: KILN_COUPLING, trunnion: T.c, fire: [0, cy - 0.04, zb + 0.02] },
  };
}

/** THE DAVIT: a plated deck on six legs, its cab, the winch, the rack of three plates, the derrick and its stowed arm. */
function davit() {
  const F = M3_FORMS.davit, N = byName(F.parts);
  const hull = new KBucket('davit-hull'), glass = new KBucket('davit-glass');
  const plates = [1, 2, 3].map((i) => new KBucket(`plate${i}`));
  const done = new Set(), take = (...n) => n.forEach((q) => done.add(q));
  // the cab plated, its front kept plain (no slot, no window, no lamp: never a face)
  { const p = N.get('hull'); platedBox(hull, p.c, p.s, { panelMax: 0.95 }); take('hull'); }
  { const p = N.get('cab'); platedBox(hull, p.c, p.s, { panelMax: 0.6 }); take('cab'); }
  // the winch: a gunmetal drum wound with cable, brass flanges and rivets (its weak point)
  { const p = N.get('winch'); turned(hull, p.c, p.r * 0.86, p.r * 0.86, p.h - 0.08, 'x', 'graphite', C.GUNMETAL, 0.3);
    for (const s of [-1, 1]) { turned(hull, [p.c[0] + s * (p.h / 2 - 0.03), p.c[1], p.c[2]], p.r, p.r, 0.06, 'x', 'bronze', C.BRASS, 0.6); rivetRing(hull, vec(p.c).add(V(s * p.h / 2, 0, 0)), V(s, 0, 0), p.r * 0.75, 10, 0.01); }
    for (let k = 0; k < 9; k++) { const tg = new THREE.TorusGeometry(p.r * 0.88, 0.016, 4, 28); hull.add(tg, { surf: 'graphite', tone: 0x4a4744, wear: 0.4, matrix: new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(p.c[0] - p.h / 2 + 0.1 + k * (p.h - 0.2) / 8, p.c[1], p.c[2])) }); tg.dispose(); }
    take('winch'); }
  // the plates of the rack (each its own node): enamel, a brass edge, four rivets and 1, 2 or 3 vermilion ink ticks
  for (let i = 1; i <= 3; i++) {
    const p = N.get(`plate${i}`), b = plates[i - 1], c = vec(p.c);
    rbox(b, c, p.s, 0.01, { surf: 'glaze', tone: C.ENAMEL, wear: 0.45, segs: 1 });
    for (const s of [-1, 1]) strut(b, V(c.x - p.s[0] / 2 + 0.02, c.y + s * (p.s[1] / 2 - 0.015), c.z), V(c.x + p.s[0] / 2 - 0.02, c.y + s * (p.s[1] / 2 - 0.015), c.z), 0.025, 0.025, { surf: 'bronze', tone: C.BRASS, sides: 6, wear: 0.6 });
    for (const sz of [-1, 1]) for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rivet(b, V(c.x + u * (p.s[0] / 2 - 0.06), c.y + v * (p.s[1] / 2 - 0.08), c.z + sz * p.s[2] / 2), V(0, 0, sz), 0.011);
    for (let k = 0; k < i; k++) for (const sz of [-1, 1]) rbox(b, V(c.x - 0.12 * (i - 1) / 2 + k * 0.12, c.y, c.z + sz * (p.s[2] / 2 + 0.001)), [0.05, 0.3, 0.004], 0.001, { surf: 'glaze', tone: C.VERM, wear: 0.15, segs: 1 });
    take(`plate${i}`);
  }
  // the counterweight: gunmetal with a row of brass bolts and two staff-white ink bands (flat survey ink)
  { const p = N.get('counterweight'); rbox(hull, vec(p.c), p.s, 0.03, { surf: 'graphite', tone: C.GUNMETAL, wear: 0.35, segs: 1 });
    for (let k = 0; k < 6; k++) rivet(hull, V(p.c[0] - p.s[0] / 2 + 0.1 + k * (p.s[0] - 0.2) / 5, p.c[1] + p.s[1] / 2 - 0.06, p.c[2] - p.s[2] / 2), V(0, 0, -1), 0.016);
    for (const s of [-1, 1]) rbox(hull, V(p.c[0] + s * 0.32, p.c[1] - 0.05, p.c[2] - p.s[2] / 2 - 0.001), [0.12, p.s[1] * 0.6, 0.004], 0.001, { surf: 'glaze', tone: C.STAFF, wear: 0.2, segs: 1 });
    take('counterweight'); }
  // the rack's two rails: open brass frames (a top and a bottom bar, three uprights), not solid sheets
  for (const n of ['rackRailR', 'rackRailL']) {
    const p = N.get(n), c = vec(p.c), hy = p.s[1] / 2 - 0.02, hz = p.s[2] / 2 - 0.02;
    for (const y of [-hy, hy]) strut(hull, V(c.x, c.y + y, c.z - hz), V(c.x, c.y + y, c.z + hz), 0.022, 0.022, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.6 });
    for (const z of [-hz, 0, hz]) strut(hull, V(c.x, c.y - hy, c.z + z), V(c.x, c.y + hy, c.z + z), 0.022, 0.022, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.6 });
    for (const z of [-hz, hz]) rivet(hull, V(c.x + Math.sign(c.x) * 0.024, c.y + hy, c.z + z), V(Math.sign(c.x), 0, 0), 0.012);
    take(n);
  }
  // the derrick's chords: enamel bars with brass collars (the default dress); laces gunmetal (joint)
  // wave 3c: the cab lantern on its foot at the roof's right-front corner, set back from the cab's face (the round
  // front lamp in a drum on the cab's face read as an eye): an upright caged lantern lit all round, the Sonde's family
  const LD = N.get('lampDrum'), L = N.get('lamp');
  turned(hull, LD.c, LD.r, LD.r * 1.25, LD.h, 'y', 'graphite', C.GUNMETAL, 0.3);
  rivetRing(hull, vec(LD.c).add(V(0, -LD.h / 2 + 0.01, 0)), V(0, 1, 0), LD.r * 1.1, 6, 0.009);
  for (const s of [-1, 1]) turned(hull, [L.c[0], L.c[1] + s * (L.h / 2 + 0.015), L.c[2]], L.r * 1.15, L.r * 1.15, 0.03, 'y', 'bronze', C.BRASS, 0.6);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; strut(hull, V(L.c[0] + Math.cos(a) * L.r * 1.08, L.c[1] - L.h / 2, L.c[2] + Math.sin(a) * L.r * 1.08), V(L.c[0] + Math.cos(a) * L.r * 1.08, L.c[1] + L.h / 2, L.c[2] + Math.sin(a) * L.r * 1.08), 0.009, 0.009, { surf: 'graphite', tone: C.GUNMETAL, sides: 5 }); }
  strut(hull, V(L.c[0], L.c[1] + L.h / 2 + 0.03, L.c[2]), V(L.c[0], L.c[1] + L.h / 2 + 0.07, L.c[2]), 0.012, 0.004, { surf: 'bronze', tone: C.BRASS, sides: 6 });
  take('lampDrum', 'lamp');
  for (const p of F.parts) if (!done.has(p.name)) dressPart(hull, p);
  // an antenna at the stern's left (the family's spike finial), clear of the derrick
  antenna(hull, V(-0.62, 1.66, -1.30), V(-0.62, 3.15, -1.30), { r: 0.012, finial: 0.12, cross: 0.05 });
  weather(hull, { lowY: 0.4, topY: 2.4, k: 0.26 });
  return {
    hull, sensors: [{ bucket: glass, name: 'r5-davit-glass', emissive: C.ICE }],
    tools: plates.map((b, i) => ({ bucket: b, anchor: N.get(`plate${i + 1}`).c })),
    lamp: { at: L.c, r: L.r, h: L.h, shape: 'lantern', axis: [0, 1, 0] },
    sockets: { winch: N.get('winch').c, hookR: N.get('hookBlockR').c },
  };
}

/** THE SONDE: an enamel-gored envelope on brass hoops, two ducted fans, the gondola, its lantern and sounding weight. */
function sonde() {
  const F = M3_FORMS.sonde, N = byName(F.parts);
  const hull = new KBucket('sonde-hull');
  const rotors = { R: new KBucket('rotorR'), L: new KBucket('rotorL') };
  const done = new Set(), take = (...n) => n.forEach((q) => done.add(q));
  // the envelope: one turned body along +z (stern point, the 2.2 m barrel, nose point: the form's three pieces exactly),
  // twelve enamel gores over a gunmetal frame, brass hoops at the barrel's ends and middle, a vermilion ink band
  const E = N.get('envelope'), EN = N.get('envelopeNose'), ES = N.get('envelopeStern');
  const z0 = ES.c[2] - ES.h / 2, z1 = E.c[2] - E.h / 2, z2 = E.c[2] + E.h / 2, z3 = EN.c[2] + EN.h / 2, R = E.r;
  const prof = [];
  const ogive = (za, zb, ra, rb, n) => { for (let i = 0; i <= n; i++) { const t = i / n; prof.push([za + (zb - za) * t, ra + (rb - ra) * t]); } };
  ogive(z0, z1, ES.r, R, 6); prof.pop(); ogive(z1, z2, R, R, 4); prof.pop(); ogive(z2, z3, R, EN.r2 ?? 0.02, 6);
  const EM = at(0, E.c[1], 0, AXIS_Z.clone());
  lathe(hull, [P(0, z0, 'graphite', C.GUNMETAL), ...prof.map(([z, r]) => P(r * 0.975, z, 'graphite', C.GUNMETAL)), P(0, z3, 'graphite', C.GUNMETAL)], EM, { segs: 36, crease: 60, wear: 0.3 });
  lathe(hull, prof.map(([z, r]) => P(r, z, 'glaze', C.ENAMEL)), EM, { segs: 72, panels: 12, gap: 1.6, crease: 60, wear: 0.4 });
  for (const z of [z1, (z1 + z2) / 2, z2]) {
    const tg = new THREE.TorusGeometry(R + 0.012, 0.026, 6, 64);
    hull.add(tg, { surf: 'bronze', tone: C.BRASS, wear: 0.6, matrix: new THREE.Matrix4().makeTranslation(0, E.c[1], z) }); tg.dispose();
    rivetRing(hull, V(0, E.c[1], z + 0.05), V(0, 0, 1), R + 0.004, 40, 0.01, { radial: true });
  }
  // (no ink ring round the nose: seen nose-on, a ring about the point read as a target, an eye; wave 3's first film)
  // the keel spine under the envelope (the slings hang from it)
  strut(hull, V(0, E.c[1] - R + 0.02, -1.25), V(0, E.c[1] - R + 0.02, 1.35), 0.04, 0.04, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
  take('envelope', 'envelopeNose', 'envelopeStern');
  // the fans: a brass duct (outer) over a gunmetal throat, two stator bars; the rotor (its own node) a hub and 4 blades
  for (const s of ['R', 'L']) {
    const d = N.get(`duct${s}`), h = N.get(`fanHub${s}`), M = frameOf(d.c, 'y'), hh = d.h / 2, ro = d.r, ri = d.r * 0.82;
    lathe(hull, [P(ri, hh, 'graphite', C.GUNMETAL), P(ri, -hh, 'graphite', C.GUNMETAL), P(ro * 0.97, -hh, 'bronze', C.BRASS), P(ro, -hh + 0.02, 'bronze', C.BRASS), P(ro, hh - 0.02, 'bronze', C.BRASS), P(ro * 0.97, hh, 'bronze', C.BRASS), P(ri, hh, 'bronze', C.BRASS)], M, { segs: 40, wear: 0.6, crease: 30 });
    rivetRing(hull, vec(d.c), V(0, 1, 0), ro, 14, 0.009, { radial: true });
    for (const a of [0, Math.PI / 2]) strut(hull, V(d.c[0] - Math.cos(a) * ri, d.c[1] - hh * 0.6, d.c[2] - Math.sin(a) * ri), V(d.c[0] + Math.cos(a) * ri, d.c[1] - hh * 0.6, d.c[2] + Math.sin(a) * ri), 0.012, 0.012, { surf: 'graphite', tone: C.GUNMETAL, sides: 6 });
    const rb = rotors[s];
    turned(rb, h.c, h.r, h.r, h.h, 'y', 'graphite', C.GUNMETAL, 0.3);
    turned(rb, [h.c[0], h.c[1] + h.h / 2 + 0.01, h.c[2]], h.r * 0.8, 0.01, 0.04, 'y', 'bronze', C.BRASS, 0.6);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      const Mb = basis(V(dx, 0, dz), V(-dz * 0.94, 0.34, dx * 0.94).normalize(), new THREE.Vector3().crossVectors(V(dx, 0, dz), V(-dz * 0.94, 0.34, dx * 0.94).normalize()), V(h.c[0], h.c[1] + 0.02, h.c[2]));
      plate(rb, [[h.r * 0.8, -0.05], [ri - 0.02, -0.035], [ri - 0.02, 0.035], [h.r * 0.8, 0.05]], 0.008, 0.002, Mb, { surf: 'glaze', tone: C.ENAMEL, wear: 0.3 });
    }
    take(`duct${s}`, `fanHub${s}`);
  }
  // the gondola: plated, a brass rail round its top; the keel ring; the sounding weight as a brass plumb bob
  { const p = N.get('gondola'); platedBox(hull, p.c, p.s, { panelMax: 0.6 });
    const y = p.c[1] + p.s[1] / 2 + 0.03, hx = p.s[0] / 2 - 0.03, hz = p.s[2] / 2 - 0.03;
    for (const [a, b] of [[[-hx, -hz], [hx, -hz]], [[hx, -hz], [hx, hz]], [[hx, hz], [-hx, hz]], [[-hx, hz], [-hx, -hz]]]) strut(hull, V(a[0], y, p.c[2] + a[1]), V(b[0], y, p.c[2] + b[1]), 0.014, 0.014, { surf: 'bronze', tone: C.BRASS, sides: 6, wear: 0.6 });
    take('gondola'); }
  { const p = N.get('keelRing'); const tg = new THREE.TorusGeometry(p.r, 0.016, 6, 18); hull.add(tg, { surf: 'bronze', tone: C.BRASS, wear: 0.6, matrix: new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(p.c[0], p.c[1] - 0.02, p.c[2])) }); tg.dispose(); take('keelRing'); }
  { const p = N.get('weight'), y0 = p.c[1] - p.h / 2, Mw = at(p.c[0], y0, p.c[2]);
    lathe(hull, [P(0, 0, 'bronze', C.BRASS), P(p.r * 0.5, 0.05, 'bronze', C.BRASS), P(p.r, 0.12, 'bronze', C.BRASS), P(p.r * 0.9, 0.16, 'bronze', C.BRASS), P(p.r * 0.3, p.h, 'bronze', C.BRASS), P(0, p.h, 'bronze', C.BRASS)], Mw, { segs: 18, wear: 0.6, crease: 30 });
    take('weight'); }
  // the lantern at the port bow: its drum (a bracket housing) and a cage round the lamp (the lamp system lights it)
  const LD = N.get('lampDrum'), L = N.get('lamp');
  turned(hull, LD.c, LD.r, LD.r, LD.h, 'z', 'graphite', C.GUNMETAL, 0.3);
  rivetRing(hull, vec(LD.c).add(V(0, 0, LD.h / 2)), V(0, 0, 1), LD.r * 0.8, 6, 0.009);
  for (const s of [-1, 1]) turned(hull, [L.c[0], L.c[1] + s * (L.h / 2 + 0.015), L.c[2]], L.r * 1.15, L.r * 1.15, 0.03, 'y', 'bronze', C.BRASS, 0.6);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; strut(hull, V(L.c[0] + Math.cos(a) * L.r * 1.08, L.c[1] - L.h / 2, L.c[2] + Math.sin(a) * L.r * 1.08), V(L.c[0] + Math.cos(a) * L.r * 1.08, L.c[1] + L.h / 2, L.c[2] + Math.sin(a) * L.r * 1.08), 0.009, 0.009, { surf: 'graphite', tone: C.GUNMETAL, sides: 5 }); }
  strut(hull, V(L.c[0], L.c[1] + L.h / 2 + 0.03, L.c[2]), V(L.c[0], L.c[1] + L.h / 2 + 0.07, L.c[2]), 0.012, 0.004, { surf: 'bronze', tone: C.BRASS, sides: 6 });
  take('lampDrum', 'lamp');
  for (const p of F.parts) if (!done.has(p.name)) dressPart(hull, p);
  weather(hull, { lowY: 0.8, topY: 2.2, k: 0.2 });
  return {
    hull, sensors: [],
    tools: [{ bucket: rotors.R, anchor: N.get('fanHubR').c }, { bucket: rotors.L, anchor: N.get('fanHubL').c }],
    lamp: { at: L.c, r: L.r, h: L.h, shape: 'lantern', axis: [0, 1, 0] },
    sockets: { keel: SONDE_KEEL, ductR: N.get('ductR').c, ductL: N.get('ductL').c },
  };
}

const KINDS = { kiln, davit, sonde };

/* ------------------------------------------------------------------ */
/* write                                                                */
/* ------------------------------------------------------------------ */
const r4 = (a) => (Array.isArray(a) ? a.map((v) => +(+v).toFixed(4)) : a?.isVector3 ? [+a.x.toFixed(4), +a.y.toFixed(4), +a.z.toFixed(4)] : a);

async function one(kind, out) {
  resetKitStats();
  const K = KINDS[kind]();
  const hullAll = mergeLabelled(new Map([['body', K.hull]]), ['body'], `${kind}-hull`);
  const glassAll = K.sensors.map((s) => ({ ...s, bucket: mergeLabelled(new Map([['body', s.bucket]]), ['body'], s.bucket.name) }));
  const toolB = K.tools.map((t) => ({ ...t, bucket: mergeLabelled(new Map([['body', t.bucket]]), ['body'], t.bucket.name) }));
  const fin = finish(hullAll, { occluders: [...glassAll.map((g) => g.bucket), ...toolB.map((t) => t.bucket)], rays: 28, dist: 0.4, footBand: 0.6, lamps: [{ at: r4(K.lamp.at), r: K.lamp.r }], verdigris: 0.35 });
  for (const t of toolB) finish(t.bucket, { occluders: [hullAll], rays: 28, dist: 0.3, footBand: 0.6, lamps: [], verdigris: 0.35 });
  const lod1 = await lod1From(hullAll, 0.3, `${kind}-lod1`);
  const box = new THREE.Box3();
  for (const b of [hullAll, ...glassAll.map((g) => g.bucket), ...toolB.map((t) => t.bucket)]) b.bounds(box);
  const size = box.getSize(new THREE.Vector3());
  const parts = [{ bucket: hullAll, role: 'hull', material: { name: `r5-${kind}-hull` } }];
  for (const g of glassAll) { const col = new THREE.Color(g.emissive); parts.push({ bucket: g.bucket, role: 'sensor', material: { name: g.name, emissive: [col.r, col.g, col.b], baseColor: g.baseColor || [0.07, 0.11, 0.12, 1] } }); }
  for (const t of toolB) parts.push({ bucket: t.bucket, role: 'tool', material: { anchor: r4(t.anchor) } });
  parts.push({ bucket: lod1, role: 'lod1', material: { name: `r5-${kind}-hull` } });
  const target = path.join(out, `public/models/instruments/${kind}.glb`);
  const sockets = { lamp: r4(K.lamp.at), lampR: +K.lamp.r.toFixed(4), lampShape: K.lamp.shape, lampAxis: K.lamp.axis, ...(K.lamp.h ? { lampH: K.lamp.h } : {}), top: +box.max.y.toFixed(4) };
  for (const [k, v] of Object.entries(K.sockets)) sockets[k] = r4(v);
  const stats = await writeInstrument(parts, {
    file: target,
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Size: r4([size.x, size.y, size.z]),
      r5Bounds: { min: r4(box.min), max: r4(box.max) },
      r5Sockets: sockets,
      r5Tools: Object.fromEntries(toolB.map((t) => [t.bucket.name, r4(t.anchor)])),
      r5Generator: { name: RECIPE, design: kind, kit: 'M1.4a', form: `src/instruments/kinds/${kind}/form.js`, licence: 'original work (generated), no third-party assets' },
    },
  });
  return {
    kind, file: path.relative(out, target), bytes: stats.bytes, tris: stats.tris, triCap: TRI_CAP[kind], meshTris: stats.meshTris, materials: stats.materials, textures: stats.textures,
    rivets: kitStats.rivets, aoMean: +fin.aoMean.toFixed(3), size: r4([size.x, size.y, size.z]), H: +box.max.y.toFixed(3), minY: +box.min.y.toFixed(3),
  };
}

export async function build({ out = ROOT, only = null } = {}) {
  const r = [];
  for (const k of ART_KINDS) if (!only || only.includes(k)) r.push(await one(k, out));
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out'), o = process.argv.indexOf('--only');
  const rows = await build({ out: i >= 0 ? path.resolve(process.argv[i + 1]) : ROOT, only: o >= 0 ? process.argv[o + 1].split(',') : null });
  for (const row of rows) console.log(JSON.stringify(row));
}
