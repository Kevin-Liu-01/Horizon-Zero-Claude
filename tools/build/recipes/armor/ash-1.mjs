/**
 * CALIMA — recipe: Ash Wraps I, Pit Wraps (armory W1; bible §4.3; plan §4.1 ≤ 17.5 k,
 * ≤ 0.8 MB per set): black wool wrap-tunic over a rust under-layer, puttees, felt soles.
 * Its own 1024² `ash` sheet. Same base pieces as the Pan set (so the same body hide bit)
 * but it reads differently by SHAPE: a long diagonal wrap skirt (knee-high on her left,
 * thigh on her right) over a longer rust hem, a thick wool cowl at the neck, two broad
 * wrapped bands crossing the chest, a rope belt, wool puttees to the knee.
 */
import path from 'node:path';
import { ROOT, MCO_DIR, hex, srcRoot } from '../lib/face.mjs';
import { KEEP_TORSO, cloth, panBase, panLayout, PAN_FIT, PAN_SET, seam, salted } from '../outfit-pan-1.mjs';
import { Trim, fbm, loadRaw, paintAtlas } from './lib/atlas.mjs';
import { orientOut, ring, strapAlong, TAU } from './lib/garment.mjs';
import { tubeInto } from './lib/smock.mjs';
import { clamp, emptyPart, Field, gridInto, mix, recomputeNormals, sstep, V, cutTris } from './lib/part.mjs';
import { outfitDoc, writeOutfit } from './lib/output.mjs';
import { romFit } from './lib/romfit.mjs';
import { bakeVertexAO } from './lib/vertexao.mjs';

export const LANE = 'armory';
export const OUTPUTS = ['public/models/armory/armor-ash-1.glb'];
const RECIPE = 'tools/build/recipes/armor/ash-1.mjs';
// (armory W1: black and charcoal lifted to real dyed wool's albedo: at #232126 the tunic read as a hole under flat light)
const COL = { black: hex('#35323A'), wool: hex('#3D3A41'), rust: hex('#7A3E22'), undyed: hex('#B8AC96'), leather: hex('#3A2C22'), mica: hex('#6E6A62'), felt: hex('#4C4842'), cord: hex('#8A7A5C') };
const sc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const put = (o, c) => { o.r = c[0]; o.g = c[1]; o.b = c[2]; };
const over = (o, c, a) => { o.r += (c[0] - o.r) * a; o.g += (c[1] - o.g) * a; o.b += (c[2] - o.b) * a; };

/** Wool: felted, no slubs, a soft nap; a knit detail class. */
function wool(t, o, col, seed = 0) {
  const m = fbm(t.X * 9, t.Y * 9, t.Z * 9 + seed, 3), f = fbm(t.x * 0.2, t.y * 0.2, seed + 3.3, 2);
  put(o, sc(col, 0.86 + 0.4 * m + 0.18 * (f - 0.5)));
  // the nap: a fine pale fuzz caught on the surface (dust and the fibre tips), so a black cloth still has a texture
  const fz = fbm(t.x * 0.9, t.y * 0.9, seed + 7.7, 2);
  over(o, [108, 104, 100], 0.07 * sstep(0.55, 0.8, fz));
  o.rough = 0.96; o.det = 0.66; o.h += 0.0016 * (f - 0.5);
}

function ashTrim(W, H, trimH) {
  const T = new Trim(W, H, trimH);
  const leather = (t, o, base) => {
    const e = Math.min(t.y, t.h - 1 - t.y);
    const m = fbm(t.ax * 0.05, t.ay * 0.09, 5.3, 3);
    put(o, sc(base, 0.86 + 0.34 * m));
    if (e < 3) { over(o, [80, 62, 48], (1 - e / 3) * 0.7); o.h = -0.0012 * (1 - e / 3); }
    o.rough = 0.6 + 0.2 * m; o.det = 0.33;
  };
  // the same cell names and sizes as the Pan sheet, so the base pieces map unchanged
  T.cell('girdle', 620, 46, (t, o) => {
    // the wool wrap the rope cinches: a band of the tunic's own black, its edges rolled
    t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0;
    wool(t, o, COL.wool, 16);
    const e = Math.min(t.y, t.h - 1 - t.y);
    if (e < 3) { const q = 0.8; o.r *= q; o.g *= q; o.b *= q; o.h -= 0.0008; }
    const c = Math.abs(2 * fbm(t.ax * 0.03, t.y * 0.12, 4.1, 2) - 1);
    o.h += 0.002 * (c - 0.6); const q2 = 0.9 + 0.14 * c; o.r *= q2; o.g *= q2; o.b *= q2;
  });
  T.cell('strap', 404, 24, (t, o) => {
    t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0;
    wool(t, o, COL.rust, 2);
    const e = Math.min(t.y, t.h - 1 - t.y);
    if (e < 2.5) { const q = 0.72; o.r *= q; o.g *= q; o.b *= q; o.h -= 0.0008; }
  });
  T.cell('strapB', 200, 22, (t, o) => leather(t, o, COL.leather));
  T.cell('pouch', 110, 90, (t, o) => leather(t, o, COL.leather));
  T.cell('brass', 54, 54, (t, o) => {
    // knapped basalt and smoked mica toggles, not brass
    const m = fbm(t.ax * 0.14, t.ay * 0.14, 2.2, 3);
    put(o, sc(COL.mica, 0.62 + 0.7 * m)); o.rough = 0.34 + 0.3 * m; o.metal = 0; o.det = 0;
  });
  T.cell('linen', 96, 90, (t, o) => {
    t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0;
    wool(t, o, COL.rust, 5);
  });
  T.cell('carmine', 54, 54, (t, o) => {
    t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0;
    wool(t, o, sc(COL.rust, 0.7), 6);
  });
  T.cell('rope', 96, 30, (t, o) => {
    // three twisted strands, grey with ash
    const f = (t.x * 0.2 + t.y * 0.34) % 1, r = Math.sin(f * Math.PI);
    const m = fbm(t.ax * 0.05, t.ay * 0.12, 2.2, 2);
    put(o, sc(COL.cord, (0.62 + 0.42 * r) * (0.82 + 0.3 * m))); o.h = 0.0018 * r; o.rough = 0.92; o.det = 0;
  });
  // reserved for Calima Veil / Lattice Quilt (W3)
  T.cell('palm', 110, 90, (t, o) => { t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0; wool(t, o, COL.undyed, 8); });
  T.cell('capelet', 150, 90, (t, o) => { t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0; wool(t, o, COL.wool, 9); });
  T.cell('celadon', 110, 60, (t, o) => { const m = fbm(t.ax * 0.1, t.ay * 0.1, 6.6, 3); put(o, sc(COL.mica, 0.5 + 0.9 * m)); o.rough = 0.22; });
  T.cell('crust', 96, 60, (t, o) => { const m = fbm(t.ax * 0.2, t.ay * 0.2, 3.3, 3); put(o, sc(COL.felt, 0.74 + 0.5 * m)); o.rough = 0.97; });
  T.cell('tongue', 240, 46, (t, o) => {
    const f = (t.x * 0.16 + t.y * 0.3) % 1, r = Math.sin(f * Math.PI);
    const m = fbm(t.ax * 0.04, t.ay * 0.1, 2.2, 2);
    put(o, sc(COL.cord, (0.72 + 0.22 * r) * (0.8 + 0.3 * m))); o.h = 0.002 * r; o.rough = 0.94; o.det = 0;
  });
  T.cell('sash', 300, 44, (t, o) => {
    t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0;
    wool(t, o, COL.rust, 13);
    const c = Math.abs(2 * fbm(t.ax * 0.02, t.y * 0.16, 2.9, 2) - 1);
    o.h += 0.0024 * (c - 0.6);
    const q = 0.84 + 0.22 * c; o.r *= q; o.g *= q; o.b *= q;
  });
  T.cell('bind', 240, 18, (t, o) => {
    t.X = t.ax * 0.012; t.Y = t.ay * 0.012; t.Z = 0;
    wool(t, o, sc(COL.rust, 0.72), 14);
    const b = 1 - clamp(Math.abs(t.y - 5) / 0.8);
    if (b > 0 && ((t.x / 4) % 1) < 0.58) over(o, [150, 110, 80], b * 0.5);
  });
  // the cowl and the chest wraps: thick black wool with a stitched edge
  return T;
}

const ASH_PAINTERS = {
  underyoke(t, o) { wool(t, o, sc(COL.rust, 0.9), 15); o.ao *= 0.62 + 0.38 * sstep(1.40, 1.49, t.Y); seam(t, o, { threads: false, groove: 0.82 }); o.crease = 0.4; },
  smock(t, o) {
    wool(t, o, COL.black, 1);
    const f1 = fbm(t.X * 19, t.Y * 2.4, t.Z * 19, 3);
    const gw = sstep(1.26, 1.165, t.Y);
    o.h += 0.0055 * (f1 - 0.5) + 0.004 * gw * (fbm(Math.atan2(t.Z + 0.02, t.X) * 6, t.Y * 3, 3.1, 3) - 0.5);
    o.ao *= 1 - 0.3 * sstep(1.178, 1.148, t.Y);
  },
  skirt(t, o) {
    wool(t, o, COL.black, 2);
    seam(t, o, { thread: [120, 76, 48], d0: 3.6, line2: 3, a: 0.6 });
    const f1 = fbm(t.X * 14, t.Y * 1.8, t.Z * 14, 3);
    o.h += 0.009 * (f1 - 0.5);
    o.ao *= 1 - 0.40 * sstep(1.05, 1.086, t.Y);
    // ash settled in the nap, rising from the hem
    const n = fbm(t.X * 12, t.Y * 4, t.Z * 12, 3);
    over(o, [120, 114, 104], sstep(0.92, 0.62, t.Y) * (0.1 + 0.36 * n));
    o.wear = 0.8;
  },
  under(t, o) { wool(t, o, COL.rust, 3); seam(t, o, { threads: false }); o.ao *= 0.86; const n = fbm(t.X * 12, t.Y * 4, t.Z * 12, 3); over(o, [120, 106, 92], 0.32 * n); },
  sleeves(t, o) { wool(t, o, COL.rust, 4); seam(t, o, { threads: false }); o.ao *= 0.76 + 0.24 * sstep(0.17, 0.22, Math.abs(t.X)); },
  trousers(t, o) {
    wool(t, o, sc(COL.wool, 1.12), 7);
    seam(t, o, { thread: [96, 86, 74], d0: 3.4, a: 0.36 });
    const n = fbm(t.X * 11, t.Y * 3.5, t.Z * 11, 3);
    over(o, [120, 112, 100], sstep(0.72, 0.42, t.Y) * (0.12 + 0.32 * n));
  },
  boots(t, o) {
    const side = t.X >= 0 ? 1 : -1;
    const cx = side * 0.111, cz = t.Y < 0.13 ? 0.0 : -0.042;
    const th = Math.atan2(t.Z - cz, t.X - cx);
    const n = fbm(t.X * 21, t.Y * 21, t.Z * 21, 3);
    if (t.Y > 0.075) {
      // puttees: a broad wool band wound in a steep overlapping spiral, the turns' edges shadowed
      const band = t.Y / 0.042 + th / TAU;
      const fb = band - Math.floor(band);
      const crown = Math.sin(Math.min(1, fb / 0.82) * Math.PI);
      put(o, sc(Math.floor(band) % 5 === 0 ? COL.rust : COL.wool, (0.78 + 0.34 * crown) * (0.92 + 0.2 * (n - 0.5))));
      o.h = 0.0028 * Math.min(1, fb / 0.82);
      o.rough = 0.95; o.det = 0.66;
      if (fb > 0.9) { const q = 0.6; o.r *= q; o.g *= q; o.b *= q; }
    } else {
      // felt soles and foot wraps
      put(o, sc(COL.felt, 0.72 + 0.5 * n)); o.rough = 0.97; o.det = 0.66;
      if (t.Y < 0.022) { const q = 0.7; o.r *= q; o.g *= q; o.b *= q; }
    }
    seam(t, o, { threads: false });
    over(o, [132, 124, 110], sstep(0.26, 0.0, t.Y) * (0.14 + 0.42 * n));
  },
  cowl(t, o) {
    wool(t, o, sc(COL.wool, 1.05), 11);
    seam(t, o, { thread: [120, 76, 48], d0: 3.2, a: 0.5 });
    const f1 = fbm(t.X * 26, t.Y * 40, t.Z * 26, 3);
    o.h += 0.006 * (f1 - 0.5);
  },
  wrap(t, o) {
    wool(t, o, sc(COL.wool, 0.94), 12);
    seam(t, o, { thread: [120, 76, 48], d0: 3.4, a: 0.56 });
    const f1 = fbm(t.X * 22, t.Y * 22, t.Z * 22, 3);
    o.h += 0.0045 * (f1 - 0.5);
  },
  default(t, o) { put(o, [200, 0, 200]); },
};

/** Every part of the set, before the sheet: `build` paints them, the offline checks read them. */
export async function ashParts() {
  const base = await panBase({
    trim: ashTrim,
    buckle: false,
    // a diagonal wrap: long at her left (+X), rising to her right, the front panel crossing
    // (its own soft drape: Pan I's modelled folds are cut for Pan's 34 columns and Pan's under-tunic)
    skirt: { yHem: 0.60, rows: 8, flare: 0.06, ripA: 0.006, colsPer: 16, fold: null },
    skirtHem: (th, y0) => y0 + 0.085 * (1 - Math.cos(th - 0.2)) * 0.9,
    under: { yTop: 0.76, yHem: 0.545, off: -0.012, flare: 0.05, floorY: 0.70 },
  });
  const { doc, parts, W, H, bodyPart, skinOf, clothField } = base;
  const added = [];
  // ---- the cowl: a thick wool roll around the neck, a loose second turn on the shoulders
  const cowl = emptyPart('cowl', { density: 1 });
  const neckF = new Field([bodyPart], 0.04);
  const COLS = 40;
  const rowsC = [[1.532, 0.006], [1.517, 0.018], [1.496, 0.026], [1.472, 0.034], [1.448, 0.046], [1.425, 0.06], [1.408, 0.064]];
  const keepN = (q) => Math.abs(q.x) < 0.14 && q.y > 1.38;
  const neck = rowsC.map(([y]) => ring(neckF, Math.max(y, 1.46), COLS, { cx: 0, cz: -0.035, keep: keepN, dy: 0.03, dth: 0.22, smooth: 3 }));
  gridInto(cowl, rowsC.length - 1, COLS, (_a, _b, r, c) => {
    const [y, off] = rowsC[r];
    const th = -Math.PI / 2 + TAU * (c % COLS) / COLS;
    const lump = 0.006 * Math.sin(th * 3 + y * 40);
    const rad = neck[r][c] + off + lump;
    // her shoulders are wider than she is deep: the loose turn lies on them and falls against the chest and the back,
    // it is no brim standing out in front of her
    const kz = 1 - 0.36 * (r / (rowsC.length - 1));
    // (armory W1: the loose turn stands a little higher off the tops of her shoulders: at full draw the raised arms'
    // shoulders came up 2-3 cm through it)
    const lift = 0.014 * Math.max(0, Math.min(1, (Math.abs(Math.cos(th)) - 0.35) / 0.4)) * (r / (rowsC.length - 1));
    // (fix round 1: the top turn sits 8 mm lower under the chin and 4 mm further off it: at full draw her turned head
    // brought her jaw down onto it, A-variant-swap-matrix's 0-in-the-head clause)
    const front = Math.max(0, Math.sin(th)) * (r === 0 ? 1 : r === 1 ? 0.5 : 0);
    const p = [Math.cos(th) * (rad + lift + 0.004 * front), y - 0.012 * Math.sin(th - 1.0) * (r / 6) + lift * 0.8 - 0.008 * front, -0.035 + Math.sin(th) * (rad + 0.004 * front) * kz];
    const w = Math.max(0, Math.min(1, (y - 1.42) / 0.09));
    // (fix round 1, judges: "Ash I at full draw: ease the cowl's roll against the deltoid without lumping it": the
    // loose turn rides its CLAVICLE where it lies on the shoulder, up to 45 % at the shoulder's top, so a drawn arm's
    // shrug lifts the wool with it instead of rising 1-3 cm through it; the neck turn stays on the neck)
    // (only the loose outer turn: the first run's clavicle share on the upper rows lifted them into her jaw at full draw)
    const cl = 0.45 * Math.max(0, Math.min(1, (Math.abs(p[0]) - 0.07) / 0.1)) * Math.max(0, Math.min(1, (r - 2) / 2));
    // ...and its very edge over the shoulder's point takes a little of the upper arm
    const ua = 0;
    const jc = base.J(p[0] >= 0 ? 'clavicle_l' : 'clavicle_r'), ju = base.J(p[0] >= 0 ? 'upperarm_l' : 'upperarm_r');
    const rest = 1 - cl - ua;
    return { p, uv: [(c / COLS) * 0.72, (r / (rowsC.length - 1)) * 0.2], j: [base.J('neck_01'), base.J('spine_03'), jc, ju], w: [w * rest, (1 - w) * rest, cl, ua] };
  });
  orientOut(cowl, 0, -0.035);
  added.push(cowl);
  // ---- two broad wool wraps crossing the chest and back (real bands over the yoke)
  const wrapF = clothField;
  // (armory W1: each band was cut at the top of the shoulder, front and back apart, and the two cut ends showed
  // there. Each is now ONE band: up the back from the hip, over the shoulder, down the front to the other hip)
  for (const [ctl, tag] of [
    [[[-0.135, 1.15, 0.03], [-0.11, 1.17, -0.09], [-0.03, 1.27, -0.125], [0.08, 1.38, -0.13], [0.118, 1.462, -0.03], [0.112, 1.458, 0.05], [0.075, 1.36, 0.12], [-0.02, 1.26, 0.135], [-0.10, 1.18, 0.105], [-0.135, 1.15, 0.03]], 'a'],
    [[[0.135, 1.15, 0.03], [0.11, 1.17, -0.09], [0.03, 1.27, -0.125], [-0.08, 1.38, -0.13], [-0.118, 1.462, -0.03], [-0.112, 1.458, 0.05], [-0.075, 1.36, 0.12], [0.02, 1.26, 0.135], [0.10, 1.18, 0.105], [0.135, 1.15, 0.03]], 'b'],
  ]) {
    const w = emptyPart('wrap', { density: 0.9 });
    strapAlong(w, wrapF, skinOf, ctl, { width: 0.088, margin: 0.012 + (tag === 'b' ? 0.005 : 0), segs: 26, cols: 4, crown: 0.0035 });
    orientOut(w, 0, -0.02, 1.25);
    added.push(w);
  }
  // ---- the rope belt: two turns round the wool band and a knot with its ends hanging
  {
    const girdle = parts.find((p) => p.slot === 'girdle');
    const belt = new Field([girdle], 0.04);
    const rope = emptyPart('ropebelt', { trim: true });
    const rr = base.trim.rect('rope');
    for (const [y, tilt, ph] of [[1.139, 0.006, 0.4], [1.108, -0.005, 2.1]]) {
      const rad = ring(belt, y, 40, { dy: 0.02, dth: 0.2, smooth: 3 });
      const path = [];
      for (let c = 0; c < 40; c++) {
        const th = -Math.PI / 2 + (c / 40) * TAU;
        const r = rad[c] + 0.0052;
        path.push([Math.cos(th) * r, y + tilt * Math.sin(th + ph), -0.02 + Math.sin(th) * r]);
      }
      tubeInto(rope, path, 0.0072, { sides: 5, closed: true, rect: rr, skin: skinOf, tile: 0.09 });
    }
    // the knot at her left front, the two ends falling from it
    const thK = Math.PI / 2 - 0.5, rK = belt.radial(1.122, thK, 0, -0.02, 0.03, 0.14) + 0.009;
    const k = [Math.cos(thK) * rK, 1.122, -0.02 + Math.sin(thK) * rK];
    const jK = base.J('spine_01');
    { // an overhand knot: a tight coil of the same rope
      const coil = [];
      for (let i = 0; i <= 12; i++) { const a2 = (i / 12) * TAU * 1.6; coil.push(V.add(k, [Math.cos(a2) * 0.0105, 0.012 - 0.024 * (i / 12), 0.004 + Math.sin(a2) * 0.0095])); }
      tubeInto(rope, coil, 0.0072, { sides: 5, rect: rr, joint: jK, tile: 0.06 });
    }
    // (fix round 1: the two ends ride the left thigh down their length, half of it at the tip, as the sash's tails do:
    // rigid on the pelvis, her left thigh came 3.9-4.5 cm up through them at a sprint with the lance)
    const jP = base.J('pelvis'), jT = base.J('thigh_l');
    for (const [dx, len] of [[-0.012, 0.15], [0.013, 0.2]]) {
      const v0 = rope.pos.length / 3;
      const top = k[1] - 0.008;
      tubeInto(rope, [V.add(k, [dx * 0.5, -0.008, 0.002]), V.add(k, [dx, -len * 0.4, 0.008 + len * 0.05]), V.add(k, [dx * 1.3, -len, 0.012 + len * 0.1])], 0.0066, { sides: 5, rect: rr, joint: jP, tile: 0.09, radiusAt: (u) => (u > 0.92 ? 1.4 : 1) });
      for (let i = v0; i < rope.pos.length / 3; i++) {
        const u = Math.max(0, Math.min(1, (top - rope.pos[i * 3 + 1]) / len)), w = 0.5 * u;
        rope.jnt[i * 4] = jP; rope.jnt[i * 4 + 1] = jT; rope.jnt[i * 4 + 2] = 0; rope.jnt[i * 4 + 3] = 0;
        rope.wgt[i * 4] = 1 - w; rope.wgt[i * 4 + 1] = w; rope.wgt[i * 4 + 2] = 0; rope.wgt[i * 4 + 3] = 0;
      }
    }
    recomputeNormals(rope);
    added.push(rope);
  }
  void KEEP_TORSO; void V; void mix; void clamp; void salted; void cloth;
  // (the smock's bound neck lies under the cowl here: its rim would only come through the wool)
  const all = [...parts.map((p) => (p.slot === 'binds' ? cutTris(p, (cx, cy) => cy < 1.43) : p)), ...added];
  for (const p of added) recomputeNormals(p);
  return { base, all };
}

/** The cowl's own fit (fix round 1; first run: 3 cm brought the roll within 2.4 cm of the draw hand at full draw). */
export const COWL_FIT = { maxPush: 0.02, giveUp: 0.035, radius: 0.06, smoothPasses: 4 };

export async function build({ out = ROOT } = {}) {
  const { base, all } = await ashParts();
  const { doc, W, H } = base;
  const layout = await panLayout(all, base.trim, W, H);
  const srcNormal = await loadRaw(path.join(MCO_DIR(srcRoot()), 'T_Peasant_Normal.png'), 1024);
  const tex = await paintAtlas(all, layout, { painters: ASH_PAINTERS, srcNormal, trim: base.trim, salt: [150, 144, 132], curv: { crease: 0.8, ridge: 0.5 }, q: { base: 90, normal: 88, orm: 84 } });
  romFit(all, base, PAN_FIT);
  // fix round 1 (judges: "ease the cowl's roll against the deltoid without lumping it, a romFit ease on the cowl alone
  // with a capped push"): a second fit on the cowl alone, up to 2 cm, in a 6 cm field smoothed four times, so the
  // room a drawn arm's shoulder asks for spreads along the roll instead of standing as a lump over one shoulder
  romFit(all.filter((p) => p.slot === 'cowl'), base, { ...PAN_FIT, maxPush: COWL_FIT.maxPush, giveUp: COWL_FIT.giveUp, radius: COWL_FIT.radius, smoothPasses: COWL_FIT.smoothPasses });
  outfitDoc(doc, all, { name: 'Outfit_Ash_1', matName: 'MI_Ash_1', tex, texPrefix: 'ash', extra: { _AO: ['SCALAR', bakeVertexAO(all, { body: base.bodyPart })] } });
  for (const m of doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()) pr.getAttribute('_AO')?.setNormalized(true);
  return writeOutfit(doc, path.join(out, OUTPUTS[0]), {
    recipe: RECIPE, sources: ['mco-fantasy-standard', 'ubc-standard', 'brea-generated'], licence: 'CC0-1.0',
    r5Outfit: { ...PAN_SET, set: 'ash', variant: 'ash-1', name: 'Ash Wraps I — Pit Wraps', density: +layout.D.toFixed(1), detailRep: +((W / layout.D) / 0.026).toFixed(1), pieces: ['wrap skirt', 'rust under-layer', 'cowl', 'chest wraps', 'rope belt', 'puttees'], hasAo: true },
  });
}
