/**
 * CALIMA — the shared weapon atlas (armory W1; bible §5.1 "one shared 1024²
 * weapon atlas"; plan §4.1, §4.4). 1024² base + 512² normal / ORM, embedded in
 * the merged stow kit (always resident); the held bow and lance GLBs carry no
 * textures and render with the kit's maps at runtime (src/hero/weaponAtlas.js),
 * so every weapon on her costs one set of GPU textures.
 *
 * Cells are named and allocated in rows; `cell(name)` gives [u, v, du, dv]. New
 * weapons (combat-kit W2, variants W3) append cells to the end of the list so
 * existing UVs never move; the sheet has room below the last row.
 * Long cells run along u: a shaft's length maps to u, its round to v.
 */
import { Trim, fbm, paintAtlas } from './atlas.mjs';
import { noise3, hex } from '../../lib/face.mjs';
import { clamp, mix, sstep } from './part.mjs';

const W = 1024;
const put = (o, c, k = 1) => { o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; };
const over = (o, c, a) => { o.r += (c[0] - o.r) * a; o.g += (c[1] - o.g) * a; o.b += (c[2] - o.b) * a; };

const WOOD = {
  sap: hex('#D6BC8C'), heart: hex('#6A3A26'), pine: hex('#3A2A1E'), esparto: hex('#B59A62'), horn: hex('#2E2622'),
  bronze: hex('#B08A45'), cane: hex('#C9B27A'), node: hex('#8E7748'), palm: hex('#A88F5A'), leather: hex('#4A3020'),
  lapilli: hex('#1C1B1E'), string: hex('#E8E0CC'), verm: hex('#D8432B'), white: hex('#EDEAE2'), carmine: hex('#A3213A'), brass: hex('#C29A52'),
};

function grain(t, o, base, { stretch = 0.02, cross = 0.55, seed = 0, ring = 0.32 } = {}) {
  // long wavy annual rings: value noise warped along u
  const warp = fbm(t.ax * 0.012, t.ay * 0.05, seed + 1.1, 2);
  const r = Math.sin((t.ay * cross + warp * 34) * 1.0);
  const fine = noise3(t.ax * stretch * 6, t.ay * 1.1, seed + 3.3);
  const k = 1 + ring * 0.5 * r * (0.5 + 0.5 * fine) + 0.16 * (fine - 0.5) + 0.2 * (fbm(t.ax * 0.03, t.ay * 0.12, seed + 7.7, 2) - 0.5);
  put(o, base, k);
  o.h = 0.0005 * r;
}

/**
 * Armory W1: the cells were laid out at a third of the sheet (the stave's grain was the V-weapon-sheet's weakest
 * read: 441 px/m along a 1.45 m stave). Every cell is now SCALE times larger in both directions on the same 1024²
 * sheet (no new texture, the same VRAM): the painters still see their own cell size (texel coordinates come back
 * divided by SCALE), so each one looks as it was designed, sampled SCALE times finer; heights turn to normals at
 * the matching density (`D`).
 */
export const WEAPON_TRIM_SCALE = 1.6;
export function weaponTrim() {
  const T = new Trim(W, W, W);
  const S = WEAPON_TRIM_SCALE, cell0 = T.cell.bind(T);
  T.cell = (name, w, h, painter, opt) => cell0(name, Math.round(w * S), Math.round(h * S), (t, o) => {
    t.x /= S; t.y /= S; t.w /= S; t.h /= S; t.ax /= S; t.ay /= S;
    painter(t, o);
  }, opt);
  /* ---- row 1: the long woods ---- */
  // Sabina stave: u along the stave, v around. Pale sapwood; the dark heart stripe down the belly (v 0.75)
  T.cell('juniper', 640, 72, (t, o) => {
    const twist = 0.10 * Math.sin(t.u * 6.1 + 0.6) + 0.05 * Math.sin(t.u * 17.3);
    const v = (t.v + twist + 1) % 1;
    const stripe = 1 - sstep(0.12, 0.2, Math.abs(v - 0.75) + 0.04 * (fbm(t.ax * 0.03, 2.2, 3.3, 2) - 0.5));
    const thin = 1 - sstep(0.012, 0.03, Math.abs(v - 0.25) + 0.02 * (fbm(t.ax * 0.04, 5.2, 3.3, 2) - 0.5));
    const base = [mix(WOOD.sap[0], WOOD.heart[0], Math.max(stripe, thin)), mix(WOOD.sap[1], WOOD.heart[1], Math.max(stripe, thin)), mix(WOOD.sap[2], WOOD.heart[2], Math.max(stripe, thin))];
    grain(t, o, base, { seed: 2, cross: 0.8 + 0.5 * stripe, ring: 0.13 + 0.16 * stripe });
    // knots of wind-twisted wood, burned dark
    for (const [ku, kv] of [[0.17, 0.3], [0.31, 0.78], [0.66, 0.2], [0.83, 0.68]]) {
      const d = Math.hypot((t.u - ku) * t.w / 7, (t.v - kv) * t.h / 5);
      if (d < 1.3) { const q = 1 - 0.62 * (1 - d / 1.3); o.r *= q; o.g *= q; o.b *= q; o.h -= 0.0006 * (1 - d / 1.3); }
    }
    o.rough = 0.62 + 0.1 * stripe; o.det = 0;
  });
  // resin-dark pine haft: u along. Rubbed paler where hands go
  T.cell('pine', 384, 36, (t, o) => {
    grain(t, o, WOOD.pine, { seed: 6, cross: 1.2, ring: 0.42 });
    const resin = fbm(t.ax * 0.02, t.ay * 0.2, 8.8, 2);
    if (resin > 0.58) { const q = 0.82; o.r *= q; o.g *= q; o.b *= q; }
    o.rough = 0.46 + 0.26 * (1 - sstep(0.5, 0.66, resin)); o.det = 0;
  });
  /* ---- row 2 ---- */
  // lance haft, the graduated upper third: vermilion / white 0.1 m bands, hand-painted, chipped (u along)
  T.cell('graduated', 300, 36, (t, o) => {
    const band = Math.floor(t.u * 3) % 2 === 0;
    const wob = 0.012 * (noise3(t.ay * 0.2, 1.1, 2.2) - 0.5);
    const f = (t.u + wob) * 3, edge = Math.abs(f - Math.round(f));
    put(o, band ? WOOD.verm : WOOD.white, 0.9 + 0.16 * fbm(t.ax * 0.1, t.ay * 0.2, 4.1, 2));
    if (edge < 0.03) { const q = 0.5; o.r *= q; o.g *= q; o.b *= q; }
    const chip = fbm(t.ax * 0.17, t.ay * 0.3, 7.7, 3);
    if (chip > 0.68) { const a = sstep(0.68, 0.72, chip); o.r += (WOOD.pine[0] * 1.2 - o.r) * a; o.g += (WOOD.pine[1] * 1.2 - o.g) * a; o.b += (WOOD.pine[2] * 1.2 - o.b) * a; o.h -= 0.0005 * a; }
    o.rough = chip > 0.68 ? 0.7 : 0.44; o.det = 0;
  });
  T.cell('esparto', 128, 64, (t, o) => {
    // cord wound round: rows across v, a twist in each
    // (armory W1: the turns read as a black-and-yellow coil spring: the groove between turns is a shade, not a gap,
    // each turn's two plies show, and the cord rises a little round the wrap: a helix, not rings)
    const yy = t.y + t.x * 0.035;
    const f = (yy / 4.2) % 1, r = Math.sin(f * Math.PI), tw = Math.abs(Math.sin((t.x * 0.42 + yy * 0.9)));
    const row = noise3(Math.floor(yy / 4.2) * 1.37, t.ax * 0.03, 4.2);
    put(o, WOOD.esparto, (0.76 + 0.3 * r) * (0.9 + 0.12 * tw) * (0.88 + 0.24 * row));
    o.h = 0.0008 * r; o.rough = 0.92; o.det = 0;
  });
  T.cell('bronzeBlade', 128, 128, (t, o) => {
    // v across the blade (0 midrib, 1 edge), u along. The cell is 8x denser across than along, so the
    // noise runs in the blade's metres or it streaks into a feather. Planished, patina low, honed at the edge
    const wx = t.u * 210, wy = t.v * 28;
    const hm = fbm(wx * 0.11, wy * 0.11, 3.1, 3), pl = noise3(wx * 0.32, wy * 0.32, 6.2), pat = fbm(wx * 0.035, wy * 0.05, 9.3, 3);
    const edge = sstep(0.74, 0.96, t.v);
    put(o, WOOD.bronze, 0.72 + 0.26 * hm + 0.08 * (pl - 0.5));
    if (pat < 0.52 && edge < 0.5) over(o, [52, 62, 48], (0.52 - pat) * 2.1 * (1 - edge * 2));
    // the patina rubbed through along the midrib
    const rub = sstep(0.2, 0.0, t.v) * sstep(0.42, 0.62, hm);
    over(o, [206, 170, 110], rub * 0.5);
    // dark in the hollow beside the midrib
    if (t.v < 0.2) { const q = 0.82 + 0.9 * t.v; o.r *= q; o.g *= q; o.b *= q; }
    over(o, [232, 200, 136], edge * 0.6);
    // C-08 (ROUND5-LOOK): the ground bevel honed (roughness 0.26-0.30) and a 3 mm polish band at the very edge (the outer
    // ~0.11 of the bevel strip's v), mirror-bright bronze at 0.22-0.24, so the blade glints under a low sun
    const bev = sstep(0.64, 0.7, t.v), band = sstep(0.865, 0.885, t.v);
    over(o, [246, 220, 168], band * 0.82);
    o.metal = pat < 0.38 && bev < 0.3 ? 0.55 : 1;
    o.rough = band > 0.5 ? 0.23 + 0.01 * hm : bev > 0.5 ? 0.27 + 0.03 * hm : mix(0.44, 0.3, edge) + 0.16 * (hm - 0.5);
    o.h = 0.0006 * (pl - 0.5) * (1 - band) + 0.0005 * (hm - 0.5) * (1 - band); o.det = 0; o.wear = 0.3;
  });
  T.cell('bronzeCast', 96, 96, (t, o) => {
    const hm = fbm(t.ax * 0.2, t.ay * 0.2, 5.1, 3), pat = fbm(t.ax * 0.06, t.ay * 0.06, 2.3, 3);
    put(o, WOOD.bronze, 0.66 + 0.4 * hm);
    if (pat < 0.5) over(o, [54, 64, 50], (0.5 - pat) * 2.2);
    const rub = sstep(0.55, 0.8, pat);
    over(o, [214, 182, 120], rub * 0.35);
    o.metal = pat < 0.36 ? 0.4 : 1; o.rough = 0.34 + 0.3 * (1 - rub); o.h = 0.0012 * (hm - 0.5); o.det = 0; o.wear = 0.3;
  });
  T.cell('horn', 64, 64, (t, o) => {
    const s = fbm(t.ax * 0.05, t.ay * 0.6, 2.7, 3);
    put(o, WOOD.horn, 0.7 + 0.9 * s);
    if (s > 0.62) over(o, [150, 128, 96], (s - 0.62) * 1.6);
    o.rough = 0.3 + 0.2 * s; o.det = 0;
  });
  T.cell('string', 64, 32, (t, o) => {
    const f = ((t.x * 0.34 + t.y * 0.5) % 1), r = Math.sin(f * Math.PI);
    put(o, WOOD.string, 0.66 + 0.4 * r); o.h = 0.0004 * r; o.rough = 0.75; o.det = 0;
  });
  /* ---- row 3: quiver and leathers ---- */
  T.cell('cane', 300, 72, (t, o) => {
    // giant cane: u along the tube, nodes every 0.15 m (u wraps once per 0.60 m tube), fibres, sun-pale
    const fib = noise3(t.ax * 0.06, t.ay * 1.0, 3.3), m = fbm(t.ax * 0.02, t.ay * 0.1, 4.4, 2);
    put(o, WOOD.cane, 0.8 + 0.24 * fib + 0.2 * (m - 0.5));
    const nd = Math.abs((t.u * 4) % 1 - 0.5);
    if (nd < 0.045) over(o, WOOD.node, (1 - nd / 0.045) * 0.9);
    o.rough = 0.42 + 0.2 * m; o.h = 0.0004 * fib; o.det = 0;
  });
  T.cell('palm', 128, 96, (t, o) => {
    const a = (t.x + t.y) / 8, b = (t.x - t.y) / 8;
    const up = (Math.floor(a) + Math.floor(b)) % 2 === 0;
    const f = up ? a - Math.floor(a) : b - Math.floor(b);
    const r = Math.sin(f * Math.PI);
    put(o, WOOD.palm, (0.68 + 0.46 * r) * (0.92 + 0.16 * fbm(t.ax * 0.1, t.ay * 0.1, 7.1, 2)));
    o.h = 0.0015 * r; o.rough = 0.88; o.det = 0;
  });
  T.cell('leather', 128, 96, (t, o) => {
    const m = fbm(t.ax * 0.05, t.ay * 0.09, 5.3, 3), sc1 = fbm(t.ax * 0.3, t.ay * 0.9, 8.2, 2);
    put(o, WOOD.leather, 0.8 + 0.4 * m);
    if (sc1 > 0.66) over(o, [106, 84, 62], (sc1 - 0.66) * 1.7);
    const e = Math.min(t.x, t.y, t.w - 1 - t.x, t.h - 1 - t.y);
    const band = 1 - clamp(Math.abs(e - 5) / 0.8);
    if (band > 0) { const f = ((t.x + t.y) / 4.2) % 1; if (f < 0.58) over(o, [142, 118, 88], band * 0.62); else { const q = 1 - 0.3 * band; o.r *= q; o.g *= q; o.b *= q; } o.h -= 0.0003 * band; }
    if (e < 3) over(o, [118, 92, 68], (1 - e / 3) * 0.7);
    o.rough = 0.55 + 0.2 * m; o.det = 0;
  });
  T.cell('leatherDark', 96, 48, (t, o) => {
    const m = fbm(t.ax * 0.06, t.ay * 0.1, 1.3, 3);
    put(o, WOOD.lapilli, 1.1 + 0.8 * m);
    const e = Math.min(t.y, t.h - 1 - t.y);
    if (e < 2.5) over(o, [90, 72, 58], (1 - e / 2.5) * 0.7);
    o.rough = 0.55 + 0.2 * m; o.det = 0;
  });
  T.cell('carmine', 48, 48, (t, o) => {
    const f = (t.y / 2.4) % 1, r = Math.sin(f * Math.PI);
    put(o, WOOD.carmine, 0.72 + 0.34 * r); o.h = 0.0005 * r; o.rough = 0.82; o.det = 0;
  });
  T.cell('brass', 48, 48, (t, o) => {
    const m = fbm(t.ax * 0.12, t.ay * 0.12, 2.2, 3);
    put(o, WOOD.brass, 0.84 + 0.4 * m);
    if (m < 0.36) over(o, [74, 92, 72], (0.36 - m) * 2.2);
    o.metal = 1; o.rough = 0.28 + 0.26 * m; o.det = 0; o.wear = 0.3;
  });
  /* ---- row 4: arrows ---- */
  T.cell('fletchW', 64, 64, (t, o) => {
    // gull feather, u along the quill. Barbs slant out of the shaft (v 0)
    const barb = Math.sin((t.x * 0.9 - t.y * 1.4)), m = fbm(t.ax * 0.1, t.ay * 0.2, 3.3, 2);
    put(o, [242, 238, 230], 0.84 + 0.16 * (0.5 + 0.5 * barb) + 0.1 * (m - 0.5));
    if (t.v < 0.08) over(o, [190, 180, 160], 0.8);
    o.rough = 0.8; o.det = 0;
  });
  T.cell('fletchB', 64, 64, (t, o) => {
    // C-08: the cock feather dyed in orchil (#6B3F73), the other two left white: the arrow is the Reckoner's
    const barb = Math.sin((t.x * 0.9 - t.y * 1.4)), m = fbm(t.ax * 0.1, t.ay * 0.2, 6.3, 2);
    put(o, [107, 63, 115], 0.92 + 0.12 * (0.5 + 0.5 * barb) + 0.08 * (m - 0.5));
    if (t.v < 0.08) over(o, [170, 160, 140], 0.8);
    o.rough = 0.72; o.det = 0;
  });
  T.cell('shaft', 128, 24, (t, o) => {
    const f = noise3(t.ax * 0.05, t.ay * 0.9, 2.1);
    put(o, WOOD.cane, 0.84 + 0.22 * f);
    if (Math.abs((t.u * 3) % 1 - 0.5) < 0.012) over(o, WOOD.node, 0.8);
    o.rough = 0.5; o.det = 0;
  });
  // the plain 2-texel-safe swatches other pieces want
  // three plies of hemp, twisted: diagonal strands round the cord (u around, v along, mirrored every 9 mm)
  T.cell('cord', 32, 32, (t, o) => {
    const ply = ((t.u * 3 + t.v * 1.6) % 1 + 1) % 1, crown = Math.sin(Math.PI * ply);
    put(o, [200, 180, 142], (0.66 + 0.4 * crown) * (0.9 + 0.2 * noise3(t.ax * 0.5, t.ay * 0.5, 9.1)));
    o.h = 0.0004 * crown; o.rough = 0.86; o.det = 0;
  });
  return T;
}

/** Paint the sheet. Returns { base, normal, orm } WebP buffers. */
export async function paintWeaponAtlas() {
  const T = weaponTrim();
  const layout = { W, H: W, D: 900 * WEAPON_TRIM_SCALE, islands: [], trimH: W };
  const tex = await paintAtlas([], layout, { painters: {}, trim: T, curv: { crease: 0.7, ridge: 0.5 }, q: { base: 90, normal: 88, orm: 86 } });
  return { tex, T };
}
