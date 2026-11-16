#!/usr/bin/env node
/**
 * CALIMA — SALTROW, the Pan Houses town kit (settlements, BUILD M1.5a; BIBLE §8.4 "Saltrow"). Original work: nothing
 * is read but the town's own layout (src/world/settlements/saltrow-layout.js).
 *
 *   node tools/build/settlements/recipes/saltrow-kit.mjs [--out <dir>]
 *     -> public/models/settlements/saltrow-kit.glb
 *   (or `node tools/build/build-assets.mjs --only settlements`, which also runs the KTX2 step on it)
 *
 * Every building of the layout is modelled in its own frame (x across its front, +z out of the front, y up from the
 * ground floor, a basalt plinth running 3 m down for sloping ground): whitewashed cubes in the layout's three lime
 * washes, basalt quoins at every corner, flat roofs behind a parapet with a raised block that steps the roofline,
 * water spouts, chimneys, small deep windows with basalt sills and painted shutters, plank doors on a basalt step,
 * orchil-violet wooden balconies on the two-storey houses, bougainvillea on one house in three. The guild house is
 * the big one across the head of the street: basalt surrounds, a bell gable over the door with its brass bell, a
 * door lantern and the brass datum stud in its step. Brea's house is the small one at the pan edge. The props:
 * salt cones, the boat ramp on black sand, the breakwater and its lamp.
 *
 * ONE MATERIAL LANGUAGE (tools/build/lib/hs.mjs): albedo is per-vertex colour (lime tone x mottling, rising damp,
 * soot and streaks baked in), roughness/metalness come from the shared 8x1 palette texel (KTX2 after the build's
 * ktx2 step). Nodes, each one mesh:
 *   b-<id>-body    walls, roof, trim, balcony, bell        _BONE (a custom byte; three `_bone`): high nibble the
 *                                                          window spill x 15 (how much a lit window of the same
 *                                                          facade lights this vertex at night), low nibble the height
 *                                                          over the house's ground floor in 0.1 m to 1.4 m (15 = no
 *                                                          foot: props, flora, glass), the runtime's base dirt.
 *                                                          (TEXCOORD_1 does not survive writeGLB's prune.)
 *   b-<id>-glass   window panes and the door lantern       COLOR_0 = the pane's night glow (black = a dark room)
 *   b-<id>-flora   bougainvillea: bract triads and leaf cards, two-sided, normals out of the wall
 *   cone, ramp, cart (the porter's salt cart), breakwater (body), breakwater-glass (the lantern's panes)
 * The runtime (src/world/settlements/saltrow.js) seats each on the ground and merges by kind into three draws.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THREE, Bucket, V, strut, ball, rbox, cable, rng } from '../../lib/hs.mjs';
import { writeGLB } from '../../lib/glb.mjs';
import { vnoise3, fbm3 } from '../../landmarks/recipes/lib/rock.mjs';
import { BUILDINGS, TONES, HARBOUR, CONES, BREAKWATER_LAMP_AT, BREAKWATER_LENS, CART, placeOf } from '../../../../src/world/settlements/saltrow-layout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const LANE = 'settlements';
export const RECIPE = 'tools/build/settlements/recipes/saltrow-kit.mjs';
export const OUTPUTS = ['public/models/settlements/saltrow-kit.glb'];

/* palette (sRGB) */
const BASALT = 0x3a3634, BASALT_HI = 0x4a4541, ORCHIL = 0x5e3a72, ORCHIL_DK = 0x4a2c5c, WOOD = 0x6a5240, WOOD_DK = 0x4b3a2e;
const SHUTTER = [0x5d4d68, 0x4f5f63, 0x6a5240];          // faded grey-violet, weathered sea-green, bare wood
const DOOR = [0x5a3468, 0x5b4030, 0x4b5a5c];
const BRASS = 0xb48a42, IRON = 0x2e2c2b, CLAY = 0x9a6a4a, SALT = 0xf1eee6;
const GLOW = [0xffa24c, 0xffb35e, 0xff9a40, 0xffc070];  // a lit room, by lamp and fire
const BRACT = [0xb52d6c, 0xc23a7c, 0x9c2766, 0xa8306f], LEAF = [0x4a6a33, 0x3c5a2b, 0x56763a];

const SEG = 0.45;                                       // wall vertex spacing (m): carries mottling, damp and spill
const PARAPET = 0.5, PLINTH = 0.32;

/* ------------------------------------------------------------------ geometry helpers */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);
const mat = (x, y, z, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().compose(V(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s);

function box(bucket, x, y, z, w, h, d, opts = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  bucket.add(g, { ...opts, matrix: mat(x, y, z, opts.ry || 0, opts.rx || 0, opts.rz || 0) });
  g.dispose();
}

/** A subdivided wall plane (w x h), centred at (x, y, z), facing local yaw `ry` (0 = +z). */
function face(bucket, x, y, z, w, h, ry, opts) {
  const g = new THREE.PlaneGeometry(w, h, Math.max(1, Math.round(w / SEG)), Math.max(1, Math.round(h / SEG)));
  bucket.add(g, { ...opts, matrix: mat(x, y, z, ry) });
  g.dispose();
}

/** A lime block: four subdivided faces and a top, from y0 to y1, centred (cx, cz). */
function limeBlock(bucket, cx, cz, w, d, y0, y1, opts) {
  const h = y1 - y0, ym = (y0 + y1) / 2;
  face(bucket, cx, ym, cz + d / 2, w, h, 0, opts);
  face(bucket, cx, ym, cz - d / 2, w, h, Math.PI, opts);
  face(bucket, cx + w / 2, ym, cz, d, h, Math.PI / 2, opts);
  face(bucket, cx - w / 2, ym, cz, d, h, -Math.PI / 2, opts);
  const g = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / 1.2)), Math.max(1, Math.round(d / 1.2)));
  bucket.add(g, { ...opts, matrix: mat(cx, y1, cz, 0, -Math.PI / 2) });
  g.dispose();
}

/** Lime wash: large soft mottling, rising damp at the foot, grey streaks under the parapet. */
function limeShade(seed, footY = 0) {
  return (p, n, k) => {
    const m = fbm3(p.x * 0.55 + seed, p.y * 0.55, p.z * 0.55 - seed, 3) - 0.5;
    const fine = vnoise3(p.x * 3.1 + seed, p.y * 3.1, p.z * 3.1) - 0.5;
    let c = 1 + m * 0.10 + fine * 0.035;
    // rising damp: a ragged grey-ochre band at the foot
    const dampTop = footY + 0.55 + 0.35 * vnoise3(p.x * 0.9 + seed, 0, p.z * 0.9);
    if (p.y < dampTop) c *= 0.82 + 0.18 * Math.min(1, Math.max(0, (p.y - footY) / Math.max(0.05, dampTop - footY)));
    // streaks: thin vertical runs from the parapet down
    const streak = Math.max(0, vnoise3(p.x * 2.6 + p.z * 2.6 + seed, 0.5, 0) - 0.62) * 2.2;
    c *= 1 - streak * 0.16 * Math.max(0, Math.min(1, (p.y - footY) / 3));
    if (n.y > 0.7) c *= 0.93;                             // roofs and tops hold the dust
    return k * 0.25 + c * 0.75;
  };
}

const basaltShade = (seed) => (p, n, k) => k * (0.86 + 0.28 * vnoise3(p.x * 4 + seed, p.y * 4, p.z * 4));
/** A hash in [0, 1) that draws nothing from a building's R(): F24's finish (quoins, washes) must not move the R() stream that
 * decides which windows are lit (F07 counts them). */
const hash01 = (a, b = 0, c = 0) => { const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return h - Math.floor(h); };
/** An sRGB hex scaled per channel (the per-house wash). */
const toneMul = (hex, r, g, b) => {
  const c = (v, k) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (c((hex >> 16) & 255, r) << 16) | (c((hex >> 8) & 255, g) << 8) | c(hex & 255, b);
};
/* M1a world debt (F24 at 6fa199d: "heavy regular quoins"; the town read as one flat block at 30-90 m): the corner stones are
 * weathered basalt in four tones, not one near-black (sRGB 0x52-0x76 against 0x3a); one course in four is washed over with the house's lime (the lime
 * runs over the stone), and the long and short stones vary +-0.07 m. Still one R() per course, as before */
const QUOIN = [0x5e554d, 0x6a6057, 0x524a44, 0x766b60];

/** Quoins up one vertical corner: courses alternate long and short across the two faces. */
function quoins(bucket, cx, cz, sx, sz, y0, y1, R, wash = null) {
  const course = 0.34;
  let i = 0;
  for (let y = y0; y + course * 0.6 < y1; y += course, i++) {
    const hgt = Math.min(course - 0.03, y1 - y - 0.02);
    const j = hash01(cx * 3.1 + sx, cz * 2.7 + sz, i), k = hash01(i, cx * 1.3, cz * 1.9 + 5.1);
    const a = (i & 1 ? 0.62 : 0.34) + (j - 0.5) * 0.14, b = (i & 1 ? 0.34 : 0.62) + (k - 0.5) * 0.14;
    const out = 0.025;
    R();                                                  // the course's old tone draw, kept so the stream is unchanged
    const washed = wash != null && hash01(i * 1.7, cx + cz, sx * 3 + sz) < 0.25;
    const t1 = washed ? wash : QUOIN[(j * QUOIN.length) | 0], t2 = washed ? wash : QUOIN[(k * QUOIN.length) | 0];
    box(bucket, cx - sx * (a / 2 - out), y + hgt / 2, cz - sz * (0.18 - out) + sz * 0.0, a, hgt, 0.36 + out,
      { surf: 'bisque', tone: t1, wear: 1.2, colorFn: basaltShade(i) });
    box(bucket, cx - sx * (0.18 - out), y + hgt / 2, cz - sz * (b / 2 - out), 0.36 + out, hgt, b,
      { surf: 'bisque', tone: t2, wear: 1.2, colorFn: basaltShade(i + 7) });
  }
}

/* ------------------------------------------------------------------ windows, doors, balconies */
/**
 * A small deep window on a facade frame `F` (a matrix: local x along the facade, +z out of it, y up): the pane,
 * a painted frame, a basalt sill, a lintel and, on some, two open shutter leaves. Returns the window record
 * { c: world-in-building Vector3, n: Vector3, lit } for the spill bake.
 */
function windowAt(body, glass, F, x, y, w, h, R, { lit, surround = false, shutters = true }) {
  const at = (lx, ly, lz) => V(lx, ly, lz).applyMatrix4(F);
  const M = (lx, ly, lz) => F.clone().multiply(mat(lx, ly, lz));
  // pane, slightly proud of the wall so it never fights it
  const pg = new THREE.PlaneGeometry(w - 0.1, h - 0.1);
  const glow = lit ? GLOW[(R() * GLOW.length) | 0] : 0x000000;
  const gk = 0.75 + R() * 0.5;
  glass.add(pg, { surf: 'glaze', tone: glow, wear: 0, matrix: M(x, y, 0.02), colorFn: () => gk });
  pg.dispose();
  // a dark reveal round it (the wall's depth), then the painted frame
  const frameTone = SHUTTER[(R() * SHUTTER.length) | 0];
  const t = 0.06;
  for (const [fx, fy, fw, fh] of [[x, y + h / 2 - t / 2, w, t], [x, y - h / 2 + t / 2, w, t], [x - w / 2 + t / 2, y, t, h], [x + w / 2 - t / 2, y, t, h]]) {
    const g = new THREE.BoxGeometry(fw, fh, 0.06);
    body.add(g, { surf: 'bisque', tone: frameTone, wear: 0.8, matrix: M(fx, fy, 0.04) });
    g.dispose();
  }
  const sillTone = surround ? BASALT_HI : BASALT;
  { const g = new THREE.BoxGeometry(w + 0.22, 0.08, 0.2); body.add(g, { surf: 'bisque', tone: sillTone, wear: 1.1, matrix: M(x, y - h / 2 - 0.04, 0.08) }); g.dispose(); }
  if (surround) {
    for (const [fx, fy, fw, fh] of [[x, y + h / 2 + 0.11, w + 0.36, 0.22], [x - w / 2 - 0.09, y, 0.18, h], [x + w / 2 + 0.09, y, 0.18, h]]) {
      const g = new THREE.BoxGeometry(fw, fh, 0.08);
      body.add(g, { surf: 'bisque', tone: BASALT_HI, wear: 1.1, matrix: M(fx, fy, 0.03), colorFn: basaltShade(fx * 7) });
      g.dispose();
    }
  } else {
    const g = new THREE.BoxGeometry(w + 0.16, 0.12, 0.08);
    body.add(g, { surf: 'bisque', tone: WOOD_DK, wear: 1, matrix: M(x, y + h / 2 + 0.06, 0.03) });
    g.dispose();
  }
  if (shutters) {
    // two leaves folded open against the wall, louvre lines as thin slats
    for (const s of [-1, 1]) {
      const lx = x + s * (w / 2 + w / 4 + 0.03);
      const g = new THREE.BoxGeometry(w / 2, h, 0.04);
      body.add(g, { surf: 'bisque', tone: frameTone, wear: 1.1, matrix: M(lx, y, 0.03) });
      g.dispose();
      for (let k = 0; k < 6; k++) {
        const sg = new THREE.BoxGeometry(w / 2 - 0.08, 0.025, 0.02);
        body.add(sg, { surf: 'bisque', tone: frameTone, wear: 1.4, matrix: M(lx, y - h / 2 + 0.15 + k * (h - 0.3) / 5, 0.06) });
        sg.dispose();
      }
    }
  }
  return { c: at(x, y, 0), n: V(0, 0, 1).transformDirection(F), lit };
}

/** A plank door on a basalt step, under a lintel. */
function doorAt(body, F, x, w, h, tone, { surround = false, double = false } = {}) {
  const M = (lx, ly, lz) => F.clone().multiply(mat(lx, ly, lz));
  const add = (gw, gh, gd, lx, ly, lz, o) => { const g = new THREE.BoxGeometry(gw, gh, gd); body.add(g, { ...o, matrix: M(lx, ly, lz) }); g.dispose(); };
  add(w, h, 0.06, x, PLINTH + h / 2, 0.02, { surf: 'bisque', tone, wear: 1.2 });
  const planks = Math.round(w / 0.16);
  for (let i = 1; i < planks; i++) add(0.015, h - 0.06, 0.02, x - w / 2 + i * (w / planks), PLINTH + h / 2, 0.06, { surf: 'bisque', tone: WOOD_DK, wear: 0.6 });
  if (double) add(0.03, h, 0.03, x, PLINTH + h / 2, 0.065, { surf: 'bisque', tone: WOOD_DK, wear: 0.6 });
  add(0.06, 0.06, 0.04, x + w * 0.32, PLINTH + 1.0, 0.08, { surf: 'graphite', tone: IRON, wear: 0.4 });    // the latch
  add(w + 0.5, 0.18, 0.62, x, PLINTH - 0.08, 0.3, { surf: 'bisque', tone: BASALT, wear: 1.2, colorFn: basaltShade(x) });  // step
  if (surround) {
    add(w + 0.6, 0.3, 0.1, x, PLINTH + h + 0.15, 0.04, { surf: 'bisque', tone: BASALT_HI, wear: 1.1, colorFn: basaltShade(3) });
    add(0.24, h, 0.1, x - w / 2 - 0.12, PLINTH + h / 2, 0.04, { surf: 'bisque', tone: BASALT_HI, wear: 1.1, colorFn: basaltShade(5) });
    add(0.24, h, 0.1, x + w / 2 + 0.12, PLINTH + h / 2, 0.04, { surf: 'bisque', tone: BASALT_HI, wear: 1.1, colorFn: basaltShade(9) });
  } else {
    add(w + 0.3, 0.14, 0.1, x, PLINTH + h + 0.07, 0.04, { surf: 'bisque', tone: WOOD_DK, wear: 1 });
  }
}

/** The orchil-violet balcony: a plank floor on beam ends, a turned-baluster rail, posts. */
function balconyAt(body, F, x, y, w, depth) {
  const M = (lx, ly, lz) => F.clone().multiply(mat(lx, ly, lz));
  const add = (gw, gh, gd, lx, ly, lz, tone, wear = 1.0) => { const g = new THREE.BoxGeometry(gw, gh, gd); body.add(g, { surf: 'bisque', tone, wear, matrix: M(lx, ly, lz) }); g.dispose(); };
  add(w, 0.1, depth, x, y, depth / 2, ORCHIL, 1.2);                                 // floor
  for (let i = 0; i < 4; i++) add(0.12, 0.16, depth + 0.12, x - w / 2 + 0.2 + i * (w - 0.4) / 3, y - 0.13, depth / 2 - 0.05, WOOD_DK, 1.1);   // beam ends
  const railY = y + 0.95;
  add(w + 0.06, 0.07, 0.09, x, railY, depth - 0.04, ORCHIL_DK, 1.2);                // top rail
  add(w, 0.05, 0.06, x, y + 0.14, depth - 0.04, ORCHIL_DK, 1.0);
  for (const s of [-1, 1]) {
    add(0.09, 0.07, depth, x + s * (w / 2 - 0.02), railY, depth / 2, ORCHIL_DK, 1.2);
    add(0.1, 1.0, 0.1, x + s * (w / 2 - 0.03), y + 0.5, depth - 0.04, ORCHIL_DK, 1.2);   // posts
    for (let z = 0.16; z < depth - 0.12; z += 0.14) add(0.035, 0.78, 0.035, x + s * (w / 2 - 0.03), y + 0.52, z, ORCHIL, 1.1);
  }
  for (let lx = -w / 2 + 0.16; lx < w / 2 - 0.1; lx += 0.13) add(0.035, 0.78, 0.035, x + lx, y + 0.52, depth - 0.04, ORCHIL, 1.1);
}

/**
 * One bougainvillea spray at `m` (a matrix in the facade frame): papery bract triads (three ovate bracts round a point,
 * magenta) or a leaf (a longer green ovate), each a fan of 5 vertices, two-sided, every vertex normal leaning out of
 * the wall so both faces take the light like foliage, not like facets. (fix round 1: the faceted icosahedra read as
 * crystals in F22.)
 */
const _o = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _nv = new THREE.Vector3();
function spray(flora, F, lx, ly, lz, r, R) {
  const leaf = R() < 0.3;
  const tone = leaf ? LEAF[(R() * LEAF.length) | 0] : BRACT[(R() * BRACT.length) | 0];
  const pos = [], nor = [];
  const petal = (cx, cy, cz, ux, uy, uz, len, wid, n) => {
    // u: the petal's axis; v: across it (perpendicular to u and the normal)
    _t1.set(ux, uy, uz).normalize();
    _t2.crossVectors(n, _t1).normalize();
    const P = (a, b) => [cx + _t1.x * a + _t2.x * b, cy + _t1.y * a + _t2.y * b, cz + _t1.z * a + _t2.z * b];
    const v0 = [cx, cy, cz], v1 = P(len * 0.35, wid * 0.5), v2 = P(len * 0.8, wid * 0.32), v3 = P(len, 0), v4 = P(len * 0.8, -wid * 0.32), v5 = P(len * 0.35, -wid * 0.5);
    const fan = [[v0, v1, v2], [v0, v2, v3], [v0, v3, v4], [v0, v4, v5]];
    for (const [a, b, c] of fan) {
      pos.push(...a, ...b, ...c, ...a, ...c, ...b);          // both faces
      for (let k = 0; k < 6; k++) nor.push(n.x, n.y, n.z);
    }
  };
  const groups = leaf ? 1 : 2;
  for (let g = 0; g < groups; g++) {
    _o.set(lx + (R() - 0.5) * r * 0.9, ly + (R() - 0.5) * r * 0.7, lz + (R() - 0.5) * r * 0.6);
    // normal: out of the wall (+z), tilted at random up to ~55 deg
    _nv.set((R() - 0.5) * 1.3, (R() - 0.35) * 1.1, 1).normalize();
    const n = _nv.clone();
    const a0 = R() * Math.PI * 2;
    const base = new THREE.Vector3(1, 0, 0);
    if (Math.abs(n.x) > 0.9) base.set(0, 1, 0);
    const e1 = base.clone().sub(n.clone().multiplyScalar(base.dot(n))).normalize(), e2 = new THREE.Vector3().crossVectors(n, e1);
    if (leaf) {
      const u = e1.clone().multiplyScalar(Math.cos(a0)).addScaledVector(e2, Math.sin(a0));
      petal(_o.x, _o.y, _o.z, u.x, u.y, u.z, r * 1.25, r * 0.6, n);
    } else {
      for (let k = 0; k < 3; k++) {
        const a = a0 + k * 2.094;
        const u = e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
        u.addScaledVector(n, 0.35);                         // cupped
        petal(_o.x, _o.y, _o.z, u.x, u.y, u.z, r * 0.62, r * 0.55, n);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const k0 = 0.85 + R() * 0.3;
  flora.add(geo, { surf: 'bisque', tone, wear: 0.4, matrix: F, colorFn: (p, nn, k) => k * k0 });
  geo.dispose();
}

/** Bougainvillea: a twisted trunk up a front corner, a mass over the door and a fall from the parapet. */
function bougainvillea(flora, body, F, x0, roofY, doorX, R) {
  const at = (lx, ly, lz) => V(lx, ly, lz).applyMatrix4(F);
  const trunk = [];
  for (let i = 0; i <= 8; i++) trunk.push(at(x0 + Math.sin(i * 1.3) * 0.12, PLINTH + i * (roofY - 0.4) / 8, 0.12 + Math.cos(i * 1.1) * 0.05));
  cable(body, trunk, 0.06, { surf: 'bisque', tone: WOOD_DK, wear: 1, segs: 24, radial: 5 });
  const put = (lx, ly, lz, r) => spray(flora, F, lx, ly, lz, r * 1.15, R);
  // up the corner: a column thickening toward the top
  for (let i = 0; i < 95; i++) {
    const t = R();
    put(x0 + (R() - 0.5) * (0.5 + t * 0.9), PLINTH + 0.6 + t * (roofY - 0.6), 0.18 + R() * 0.35, 0.16 + R() * 0.12 + t * 0.06);
  }
  // the swag along the parapet toward the door, falling in tongues
  const x1 = doorX;
  for (let i = 0; i < 150; i++) {
    const t = R(), lx = x0 + (x1 - x0) * t * 1.15;
    const fall = Math.pow(R(), 2) * (0.6 + 1.6 * Math.abs(Math.sin(lx * 2.1)));
    put(lx + (R() - 0.5) * 0.4, roofY + 0.1 - fall, 0.2 + R() * 0.38, 0.17 + R() * 0.12);
  }
  // a crown over the parapet edge
  for (let i = 0; i < 55; i++) put(x0 + (x1 - x0) * R() * 0.9, roofY + 0.25 + R() * 0.35, 0.05 + R() * 0.4, 0.2 + R() * 0.1);
}

/** The brass bell: a lathe profile, mouth down, its crown on a yoke. */
function bell(body, F, x, y, z) {
  const prof = [[0.0, 0.0], [0.2, 0.0], [0.215, 0.03], [0.19, 0.1], [0.15, 0.22], [0.13, 0.34], [0.11, 0.4], [0.06, 0.43], [0.0, 0.44]]
    .map(([r, h]) => new THREE.Vector2(r, h));
  const g = new THREE.LatheGeometry(prof, 18);
  g.scale(1.45, 1.45, 1.45);                             // a 0.64 m bell: it reads from the street's foot
  body.add(g, { surf: 'bronze', tone: BRASS, wear: 0.9, matrix: F.clone().multiply(mat(x, y, z)) });
  g.dispose();
  const M = F.clone().multiply(mat(x, y + 0.68, z));
  const yoke = new THREE.BoxGeometry(0.8, 0.12, 0.14);
  body.add(yoke, { surf: 'bisque', tone: WOOD_DK, wear: 1, matrix: M });
  yoke.dispose();
  const clap = new THREE.SphereGeometry(0.045, 8, 6);
  body.add(clap, { surf: 'graphite', tone: IRON, wear: 0.4, matrix: F.clone().multiply(mat(x, y + 0.04, z)) });
  clap.dispose();
}

/* ------------------------------------------------------------------ a building */
/**
 * Is a building's side face a party wall? A point 0.4 m out from the face's middle stands inside a neighbour's
 * footprint. Party walls carry no windows; every other side does (F07 looks up the street at the houses' down-street
 * ends).
 */
function partyWall(b, sideSign) {
  const p = placeOf(b), c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const lx = sideSign * (b.w / 2 + 0.4);
  const x = p.x + c * lx, z = p.z - s * lx;
  for (const o of BUILDINGS) {
    if (o === b) continue;
    const q = placeOf(o), qc = Math.cos(q.yaw), qs = Math.sin(q.yaw);
    const dx = x - q.x, dz = z - q.z;
    const ox = dx * qc - dz * qs, oz = dx * qs + dz * qc;
    if (Math.abs(ox) <= o.w / 2 + 0.05 && Math.abs(oz) <= o.d / 2 + 0.05) return true;
  }
  return false;
}

function building(b, idx) {
  const R = rng(0x5a17 + idx * 977);
  const body = new Bucket(`b-${b.id}-body`), glass = new Bucket(`b-${b.id}-glass`), flora = new Bucket(`b-${b.id}-flora`);
  // M1a world debt (F24): each house's wash is its tone renewed in its own year: value +-6 %, a little warmer or cooler
  const hv = hash01(idx * 7.3, 1.1), hw = hash01(idx * 3.7, 2.3);
  const tone = toneMul(TONES[b.tone], 0.94 + 0.12 * hv + 0.02 * (hw - 0.5), 0.94 + 0.12 * hv, 0.94 + 0.12 * hv - 0.045 * (hw - 0.5));
  const wash = toneMul(tone, 0.86, 0.85, 0.83);
  const guild = b.kind === 'guild';
  const w = b.w, d = b.d, roofY = b.h - PARAPET;
  const lime = { surf: 'bisque', tone, wear: 0.4, colorFn: limeShade(idx * 13.7, PLINTH) };
  const windows = [];

  // plinth: basalt from 3 m down to the socle
  box(body, 0, PLINTH - 1.6, 0, w + 0.14, 3.2, d + 0.14, { surf: 'bisque', tone: BASALT, wear: 1.2, colorFn: basaltShade(idx) });
  // the main block, parapet, its lime coping
  limeBlock(body, 0, 0, w, d, PLINTH, roofY, lime);
  for (const [px, pz, pw, pd] of [[0, d / 2 - 0.11, w, 0.22], [0, -d / 2 + 0.11, w, 0.22], [w / 2 - 0.11, 0, 0.22, d - 0.44], [-w / 2 + 0.11, 0, 0.22, d - 0.44]]) {
    limeBlock(body, px, pz, pw, pd, roofY, b.h, lime);
  }
  box(body, 0, b.h + 0.03, d / 2 - 0.11, w + 0.06, 0.06, 0.28, { surf: 'bisque', tone, wear: 0.8 });
  box(body, 0, b.h + 0.03, -d / 2 + 0.11, w + 0.06, 0.06, 0.28, { surf: 'bisque', tone, wear: 0.8 });
  // quoins at the four corners
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) quoins(body, sx * w / 2, sz * d / 2, sx, sz, PLINTH, b.h, R, wash);
  if (guild) {
    // a basalt cornice band at the roof and at the first floor
    box(body, 0, roofY + 0.05, d / 2 + 0.05, w + 0.1, 0.16, 0.12, { surf: 'bisque', tone: BASALT_HI, wear: 1.1, colorFn: basaltShade(31) });
    box(body, 0, 3.15, d / 2 + 0.04, w, 0.12, 0.1, { surf: 'bisque', tone: BASALT_HI, wear: 1.1, colorFn: basaltShade(37) });
  }
  // the raised block: the stepped roofline
  if (b.step) {
    const s = b.step, y1 = roofY + s.h;
    limeBlock(body, s.x, s.z, s.w, s.d, roofY - 0.02, y1, { ...lime, colorFn: limeShade(idx * 13.7 + 5, roofY) });
    box(body, s.x, y1 + 0.03, s.z, s.w + 0.08, 0.06, s.d + 0.08, { surf: 'bisque', tone, wear: 0.8 });
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) quoins(body, s.x + sx * s.w / 2, s.z + sz * s.d / 2, sx, sz, roofY, y1, R, wash);
    // a small window on its front
    const F = mat(s.x, 0, s.z + s.d / 2);
    windows.push(windowAt(body, glass, F, 0, roofY + s.h * 0.55, 0.6, 0.7, R, { lit: R() < 0.5, shutters: false }));
    // a door out onto the roof from it
  }
  // M1a world debt (F24): the roof hut (layout `hut`), a stair head at the house's rear: a lime block with its coping, a
  // plank door toward the front, no glass and no R() draw (the windows' lit pattern stays the kit's)
  if (b.hut) {
    const s = b.hut, y1 = roofY + s.h;
    limeBlock(body, s.x, s.z, s.w, s.d, roofY - 0.02, y1, { ...lime, colorFn: limeShade(idx * 13.7 + 9, roofY) });
    box(body, s.x, y1 + 0.03, s.z, s.w + 0.1, 0.06, s.d + 0.1, { surf: 'bisque', tone, wear: 0.8 });
    box(body, s.x, roofY + 0.9, s.z + s.d / 2 + 0.02, 0.78, 1.75, 0.05, { surf: 'bisque', tone: WOOD_DK, wear: 1.1 });
    box(body, s.x, roofY + 1.82, s.z + s.d / 2 + 0.04, 0.95, 0.1, 0.08, { surf: 'bisque', tone: WOOD_DK, wear: 1 });
  }
  // chimney and a water spout or two
  if (idx % 2 === 0 || guild) {
    const cx = (b.step ? -b.step.x : w * 0.25) * 0.8, cz = -d * 0.25;
    limeBlock(body, cx, cz, 0.55, 0.55, roofY, roofY + 1.1, lime);
    box(body, cx, roofY + 1.16, cz, 0.75, 0.08, 0.75, { surf: 'bisque', tone: BASALT, wear: 1.2 });
    box(body, cx, roofY + 1.04, cz, 0.42, 0.06, 0.42, { surf: 'bisque', tone: 0x1c1a19, wear: 0.3 });   // the soot in its throat
  }
  for (const sx of [-0.3, 0.35]) {
    const g = new THREE.CylinderGeometry(0.07, 0.08, 0.5, 6, 1, true);
    body.add(g, { surf: 'bisque', tone: CLAY, wear: 1.1, matrix: mat(sx * w, roofY + 0.08, d / 2 + 0.22, 0, Math.PI / 2) });
    g.dispose();
  }

  // facades: front (+z), back (-z), sides (+x, -x); each as a frame with x along it and +z out
  const facades = [
    { F: mat(0, 0, d / 2), len: w, front: true },
    { F: mat(0, 0, -d / 2, Math.PI), len: w, front: false },
    { F: mat(w / 2, 0, 0, Math.PI / 2), len: d, front: false, side: 1 },
    { F: mat(-w / 2, 0, 0, -Math.PI / 2), len: d, front: false, side: -1 },
  ];
  const two = b.h > 5;
  // (fix round 1, F07) a facade that faces the breakwater lens (within ~70 deg) has its rooms lit 19 in 20: F07 sees
  // the town 120-140 m off and counted 14 window blobs; the draws of R() are the same, only the odds move
  const pl = placeOf(b), cyw = Math.cos(pl.yaw), syw = Math.sin(pl.yaw);
  const tl = { x: BREAKWATER_LENS.x - pl.x, z: BREAKWATER_LENS.z - pl.z }, tlL = Math.hypot(tl.x, tl.z) || 1;
  const facesLens = (F) => {
    const n = V(0, 0, 1).transformDirection(F);
    const wx = cyw * n.x + syw * n.z, wz = -syw * n.x + cyw * n.z;
    return (wx * tl.x + wz * tl.z) / tlL > 0.34;
  };
  const doorX = guild ? 0 : (R() < 0.5 ? -1 : 1) * Math.min(1.4, w * 0.18);
  for (const fa of facades) {
    const { F, len } = fa;
    const cols = Math.max(1, Math.floor((len - 1.4) / (guild ? 2.4 : 2.6)));
    const xs = Array.from({ length: cols }, (_, i) => -len / 2 + (i + 0.5) * len / cols);
    const litOdds = facesLens(F) ? 0.95 : fa.front ? 0.8 : fa.side ? 0.7 : 0.45;
    // the party walls of a terrace carry no windows
    if (fa.side && partyWall(b, fa.side)) continue;
    for (const x of xs) {
      // ground floor
      if (!(fa.front && Math.abs(x - doorX) < (guild ? 1.8 : 1.1))) {
        windows.push(windowAt(body, glass, F, x, PLINTH + 1.55, guild ? 0.95 : 0.78, guild ? 1.35 : 1.05, R,
          { lit: guild || R() < litOdds, surround: guild, shutters: !guild && R() < 0.6 }));
      }
      // upper floor (the balcony's door takes the middle bay of the front)
      if (two) {
        const balc = (b.balcony && fa.front && Math.abs(x) < len / cols * 0.6) || (fa.side && fa.side === b.sideBalcony && Math.abs(x) < 1.5);
        if (!balc) windows.push(windowAt(body, glass, F, x, 4.3, guild ? 0.95 : 0.78, guild ? 1.25 : 1.0, R,
          { lit: guild || R() < litOdds * 0.9, surround: guild, shutters: !guild && R() < 0.5 }));
      }
    }
    if (fa.side && fa.side === b.sideBalcony && two) {
      balconyAt(body, F, 0, 3.05, Math.min(2.6, len - 2.2), 0.85);
      windows.push(windowAt(body, glass, F, 0, 3.15 + 0.95, 1.0, 1.75, R, { lit: true, shutters: false }));
    }
    if (fa.front) {
      doorAt(body, F, doorX, guild ? 1.7 : 1.05, guild ? 2.45 : 2.1, guild ? WOOD : DOOR[idx % DOOR.length], { surround: guild, double: guild });
      if (b.balcony && two) {
        const bw = Math.min(3.4, w - 2.2);
        balconyAt(body, F, 0, 3.05, bw, 0.9);
        // the balcony door: a tall glazed leaf pair
        windows.push(windowAt(body, glass, F, 0, 3.15 + 0.95, 1.0, 1.75, R, { lit: R() < 0.7, shutters: false }));
      }
      if (b.flora) bougainvillea(flora, body, F, (doorX > 0 ? -1 : 1) * (len / 2 - 0.55), roofY + 0.2, doorX, R);
    }
  }

  if (guild) {
    // the bell gable (espadaña) over the door: a lime wall standing up from the front parapet, an opening, the bell
    const F = mat(0, 0, d / 2 - 0.25);
    const gw = 2.4, gh = 2.6, gy = b.h;
    const L = (x, y0, y1, ww) => limeBlock(body, x, d / 2 - 0.25, ww, 0.5, y0, y1, { ...lime, colorFn: limeShade(91, gy) });
    L(-0.95, gy, gy + gh - 0.5, 0.5); L(0.95, gy, gy + gh - 0.5, 0.5);              // the two jambs
    L(0, gy + gh - 0.5, gy + gh, gw);                                              // the head
    L(0, gy + gh, gy + gh + 0.45, 1.2);                                            // the stepped top
    box(body, 0, gy + gh + 0.5, d / 2 - 0.25, 1.36, 0.08, 0.62, { surf: 'bisque', tone: BASALT_HI, wear: 1.1 });
    box(body, 0, gy + gh + 0.02, d / 2 - 0.25, gw + 0.14, 0.08, 0.6, { surf: 'bisque', tone: BASALT_HI, wear: 1.1 });
    bell(body, F, 0, gy + 0.7, 0);
    // the lantern beside the door: an iron bracket, glazed box, always lit at night
    const lx = 1.55, ly = PLINTH + 2.45;
    box(body, lx, ly + 0.36, d / 2 + 0.22, 0.04, 0.04, 0.44, { surf: 'graphite', tone: IRON, wear: 0.4 });
    box(body, lx, ly + 0.27, d / 2 + 0.42, 0.26, 0.05, 0.26, { surf: 'graphite', tone: IRON, wear: 0.4 });
    box(body, lx, ly - 0.02, d / 2 + 0.42, 0.22, 0.04, 0.22, { surf: 'graphite', tone: IRON, wear: 0.4 });
    const lg = new THREE.BoxGeometry(0.2, 0.28, 0.2);
    glass.add(lg, { surf: 'glaze', tone: 0xffb860, wear: 0, matrix: mat(lx, ly + 0.12, d / 2 + 0.42), colorFn: () => 1.4 });
    lg.dispose();
    windows.push({ c: V(lx, ly + 0.12, d / 2 + 0.05), n: V(0, 0, 1), lit: true });
    // the brass datum stud in the step (layout GUILD_STUD: 0.55 m out from the front face)
    const sg = new THREE.CylinderGeometry(0.075, 0.08, 0.03, 16);
    body.add(sg, { surf: 'bronze', tone: BRASS, wear: 0.5, matrix: mat(0, PLINTH + 0.02, d / 2 + 0.55) });
    sg.dispose();
    const rg = new THREE.TorusGeometry(0.075, 0.008, 4, 16);
    body.add(rg, { surf: 'bronze', tone: 0x8a6a34, wear: 0.4, matrix: mat(0, PLINTH + 0.035, d / 2 + 0.55, 0, Math.PI / 2) });
    rg.dispose();
    // the broad guild step across the front
    box(body, 0, PLINTH - 0.1, d / 2 + 0.55, 4.6, 0.22, 1.1, { surf: 'bisque', tone: BASALT, wear: 1.2, colorFn: basaltShade(77) });
  }

  // the window spill bake: lit windows light their own facade at night (falls off within ~6 m)
  const lit = windows.filter((wi) => wi.lit);
  const n = body.pos.length / 3;
  body.uv1 = new Array(n * 2).fill(0);
  const L = lit.map((wi) => [wi.c.x, wi.c.y, wi.c.z, wi.n.x, wi.n.y, wi.n.z]);
  for (let i = 0; i < n; i++) {
    const px = body.pos[i * 3], py = body.pos[i * 3 + 1], pz = body.pos[i * 3 + 2];
    const nx = body.nor[i * 3], ny = body.nor[i * 3 + 1], nz = body.nor[i * 3 + 2];
    let s = 0;
    for (const [cx, cy, cz, mx, my, mz] of L) {
      const ox = px - cx, oy = py - cy, oz = pz - cz;
      const out = ox * mx + oy * my + oz * mz;
      if (out < -0.3 || out > 1.6) continue;
      const k = Math.max(nx * mx + ny * my + nz * mz, ny > 0.6 ? 0.8 : 0);   // sills, steps, balcony floors catch it too
      if (k < 0.3) continue;
      const r = Math.hypot(ox, oy, oz);
      if (r > 6) continue;
      s += k * (1 / (1 + (r / 1.15) ** 2)) * (1 - r / 6);
    }
    body.uv1[i * 2] = Math.min(1, s);
    body.uv1[i * 2 + 1] = py;
  }
  glass.uv1 = noFoot(glass);
  flora.uv1 = noFoot(flora);
  return { body, glass, flora, windows: windows.length, lit: lit.length };
}

/** TEXCOORD_1 for a piece with no spill and no foot: x 0, y 99 (the runtime's base dirt reads y as height). */
const noFoot = (b) => { const n = b.pos.length / 3, a = new Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2] = 0; a[i * 2 + 1] = 99; } return a; };

/* ------------------------------------------------------------------ props */
function saltCone() {
  const b = new Bucket('cone');
  const R = rng(4242);
  const prof = [];
  // (M1b closing fix, F20: the cones cut both frame edges at 2-4 m and their 28 sides and 12 rings read as facets) 72 sides and
  // 24 rings, so the silhouette and the shading read round from a near lens; the crust itself is the runtime's (saltrow.js:
  // the pans' own salt layer, its tints and grain)
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    prof.push(new THREE.Vector2(Math.max(0.001, (1 - t) * 1.0 + (t < 0.08 ? 0.04 * (1 - t / 0.08) : 0)), t * 1.0));
  }
  const g = new THREE.LatheGeometry(prof, 72);
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    const k = 1 + (vnoise3(x * 3, y * 3, z * 3) - 0.5) * 0.12 * (1 - y);
    pa.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  // the lathe's seam (side 0 and side 72 are the same points) shares one normal, so no crease runs down the heap
  {
    const P = prof.length, na = g.attributes.normal, S = 72;
    for (let i = 0; i < P; i++) {
      const a = i, c = S * P + i;
      const x = na.getX(a) + na.getX(c), y = na.getY(a) + na.getY(c), z = na.getZ(a) + na.getZ(c), l = Math.hypot(x, y, z) || 1;
      na.setXYZ(a, x / l, y / l, z / l); na.setXYZ(c, x / l, y / l, z / l);
    }
  }
  b.add(g, { surf: 'bisque', tone: SALT, wear: 0.6, colorFn: (p, n, k) => k * (0.92 + 0.12 * vnoise3(p.x * 6, p.y * 6, p.z * 6)) * (p.y < 0.06 ? 0.86 : 1) });
  g.dispose();
  // a rake left against it, half the cones
  strut(b, V(0.55, 0.0, 0.62), V(0.05, 1.05, 0.12), 0.018, 0.018, { surf: 'bisque', tone: WOOD, wear: 1, sides: 5 });
  box(b, 0.6, 0.03, 0.66, 0.5, 0.05, 0.06, { surf: 'bisque', tone: WOOD_DK, wear: 1, ry: 0.7 });
  void R;
  b.uv1 = noFoot(b);
  return b;
}

/**
 * The porter's salt cart (layout CART; fix round 1: the porter needs readable work in F22): a plank bed on two big
 * spoked wheels, low side boards, two legs at the front it rests on, a push bar across the back at 1.05 m, and its
 * load: linen salt sacks and an open basket heaped with salt. Local +z the end he pushes toward, y 0 the ground.
 */
function cart() {
  const b = new Bucket('cart');
  const R = rng(515);
  const { w: W, d: D } = CART;
  const BED = 0.62, bw = W - 0.16, bl = D - 0.3;
  box(b, 0, BED, 0.05, bw, 0.07, bl, { surf: 'bisque', tone: WOOD, wear: 1.1 });
  for (let i = 0; i < 6; i++) box(b, 0, BED + 0.04, 0.05 - bl / 2 + (i + 0.5) * bl / 6, bw - 0.02, 0.012, 0.012, { surf: 'bisque', tone: WOOD_DK, wear: 0.8 });
  for (const s of [-1, 1]) {
    box(b, s * (bw / 2 - 0.02), BED + 0.17, 0.05, 0.04, 0.28, bl, { surf: 'bisque', tone: WOOD, wear: 1.2 });          // side boards
    box(b, s * (bw / 2 - 0.1), BED - 0.08, 0.05, 0.08, 0.1, D, { surf: 'bisque', tone: WOOD_DK, wear: 1.1 });        // the frame rails
    // the wheel: a rim, a hub, eight spokes
    const rim = new THREE.TorusGeometry(0.42, 0.035, 5, 20);
    b.add(rim, { surf: 'bisque', tone: WOOD_DK, wear: 1.2, matrix: mat(s * (W / 2 + 0.02), 0.44, -0.05, Math.PI / 2) });
    rim.dispose();
    const tyre = new THREE.TorusGeometry(0.445, 0.012, 4, 20);
    b.add(tyre, { surf: 'graphite', tone: IRON, wear: 0.6, matrix: mat(s * (W / 2 + 0.02), 0.44, -0.05, Math.PI / 2) });
    tyre.dispose();
    strut(b, V(s * (W / 2 - 0.06), 0.44, -0.05), V(s * (W / 2 + 0.1), 0.44, -0.05), 0.07, 0.07, { surf: 'bisque', tone: WOOD_DK, wear: 1, sides: 8 });
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      strut(b, V(s * (W / 2 + 0.02), 0.44, -0.05), V(s * (W / 2 + 0.02), 0.44 + Math.sin(a) * 0.4, -0.05 + Math.cos(a) * 0.4), 0.018, 0.018, { surf: 'bisque', tone: WOOD_DK, wear: 1, sides: 4 });
    }
    // a front leg to rest on, and a push handle up from each back corner
    strut(b, V(s * (bw / 2 - 0.12), BED - 0.1, D / 2 - 0.2), V(s * (bw / 2 - 0.12), 0.0, D / 2 - 0.12), 0.03, 0.03, { surf: 'bisque', tone: WOOD_DK, wear: 1, sides: 5 });
    strut(b, V(s * (bw / 2 - 0.06), BED - 0.05, -D / 2 + 0.05), V(s * (bw / 2 - 0.02), 1.06, -D / 2 - 0.2), 0.03, 0.028, { surf: 'bisque', tone: WOOD, wear: 1.1, sides: 6 });
  }
  box(b, 0, BED + 0.17, 0.05 + bl / 2, bw, 0.28, 0.04, { surf: 'bisque', tone: WOOD, wear: 1.2 });
  box(b, 0, BED + 0.17, 0.05 - bl / 2, bw, 0.28, 0.04, { surf: 'bisque', tone: WOOD, wear: 1.2 });
  strut(b, V(-(bw / 2 + 0.02), 1.06, -D / 2 - 0.2), V(bw / 2 + 0.02, 1.06, -D / 2 - 0.2), 0.03, 0.03, { surf: 'bisque', tone: WOOD_DK, wear: 1.2, sides: 6 });   // push bar
  // the load: four sacks and a basket of salt
  const sack = new THREE.SphereGeometry(1, 10, 7);
  for (const [x, z, ry] of [[-0.24, -0.38, 0.2], [0.25, -0.34, -0.15], [-0.22, 0.12, 0.5], [0.24, 0.22, -0.4]]) {
    const m = new THREE.Matrix4().compose(V(x, BED + 0.2, z), _q.setFromEuler(_e.set(0.1 * (R() - 0.5), ry, 0.12 * (R() - 0.5))), new THREE.Vector3(0.26, 0.19, 0.34));
    b.add(sack, { surf: 'bisque', tone: 0xd9cfbc, wear: 0.9, matrix: m, colorFn: (p, n, k) => k * (0.9 + 0.12 * vnoise3(p.x * 9, p.y * 9, p.z * 9)) });
  }
  sack.dispose();
  const basket = new THREE.CylinderGeometry(0.3, 0.22, 0.34, 14, 2, true);
  b.add(basket, { surf: 'bisque', tone: 0x9a7a4c, wear: 1.2, matrix: mat(0.0, BED + 0.55, 0.62), colorFn: (p, n, k) => k * (0.85 + 0.3 * (Math.sin(p.y * 90) * 0.5 + 0.5)) });
  basket.dispose();
  const heap = new THREE.SphereGeometry(0.29, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  b.add(heap, { surf: 'bisque', tone: SALT, wear: 0.6, matrix: new THREE.Matrix4().compose(V(0, BED + 0.7, 0.62), _q.identity(), new THREE.Vector3(1, 0.55, 1)) });
  heap.dispose();
  b.uv1 = noFoot(b);
  return b;
}

/** The slipway: dressed basalt setts on a 9 deg fall, local +z down into the sea, top at y 0. */
function ramp() {
  const b = new Bucket('ramp');
  const { length: L, width: W } = HARBOUR.ramp;
  const fall = Math.tan(9 * Math.PI / 180);
  const R = rng(77);
  for (let z = 0; z < L; z += 0.6) {
    for (let x = -W / 2 + 0.3; x < W / 2; x += 0.6) {
      const y = -z * fall;
      box(b, x + (R() - 0.5) * 0.04, y - 0.12, z + 0.3, 0.56, 0.24, 0.56,
        { surf: 'bisque', tone: R() < 0.3 ? BASALT_HI : BASALT, wear: 1.2, rx: Math.atan(fall), colorFn: basaltShade(x * 3 + z) });
    }
  }
  // its kerbs and the skirt down into the ground
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.4, 1.8, L + 0.4);
    b.add(g, { surf: 'bisque', tone: BASALT, wear: 1.2, matrix: mat(s * (W / 2 + 0.2), -L * fall / 2 - 0.7, L / 2, 0, Math.atan(fall)), colorFn: basaltShade(s * 11) });
    g.dispose();
  }
  // two bollards at the top
  for (const s of [-1, 1]) strut(b, V(s * (W / 2 + 0.6), -0.3, 0.4), V(s * (W / 2 + 0.6), 0.65, 0.4), 0.13, 0.11, { surf: 'graphite', tone: IRON, wear: 0.8, sides: 10 });
  b.uv1 = noFoot(b);
  return b;
}

/** The breakwater: a basalt mole with armour blocks, its lamp column at the root. Local +z out to sea, top y 1.3. */
function breakwater() {
  const b = new Bucket('breakwater'), g = new Bucket('breakwater-glass');
  const { length: L, width: W } = HARBOUR.breakwater;
  const R = rng(91);
  // the deck: rough-dressed slabs
  for (let z = 0; z < L; z += 1.1) {
    rbox(b, V((R() - 0.5) * 0.08, 1.15, z + 0.55), [W, 0.3, 1.04], 0.06, { surf: 'bisque', tone: R() < 0.4 ? BASALT_HI : BASALT, wear: 1.2, segs: 1, colorFn: basaltShade(z) });
  }
  box(b, 0, -4.2, L / 2, W - 0.2, 10.4, L, { surf: 'bisque', tone: BASALT, wear: 1.2, colorFn: basaltShade(5) });
  // armour blocks tumbled along both flanks and round the head
  for (let i = 0; i < 70; i++) {
    const z = R() * (L + 2), s = R() < 0.5 ? -1 : 1;
    const head = z > L;
    const x = head ? (R() - 0.5) * W * 1.6 : s * (W / 2 + 0.4 + R() * 1.3);
    const sz = 0.9 + R() * 0.9;
    rbox(b, V(x, -0.6 + R() * 1.4 - (Math.abs(x) - W / 2) * 0.5, Math.min(z, L + 1.2)), [sz, sz * 0.8, sz * 1.1], 0.12,
      { surf: 'bisque', tone: R() < 0.3 ? BASALT_HI : BASALT, wear: 1.3, segs: 1, rot: [R() * 0.8, R() * 3, R() * 0.8], colorFn: basaltShade(i) });
  }
  // the lamp (fix round 1: the plain white column under a glass cylinder read as a candle): a basalt plinth, a square
  // lime-washed pier with a basalt cornice, and a lantern on it: an iron base plate, four corner posts and a mullion
  // on each face, four glazed panes, an iron top plate, a pyramid cap with a ring and finial, and an iron bracket arm
  // with a hook. At the ROOT on the north-west edge (the layout's BREAKWATER_LAMP_AT: its `side` is to the right
  // looking out to sea, this local x the other way)
  const lz = BREAKWATER_LAMP_AT.along, lx = -BREAKWATER_LAMP_AT.side;
  const sq = (y0, y1, r0, r1, o) => {
    const c = new THREE.CylinderGeometry(r1, r0, y1 - y0, 4, Math.max(1, Math.round((y1 - y0) / 0.4)), false);
    b.add(c, { ...o, matrix: mat(lx, (y0 + y1) / 2, lz, Math.PI / 4) });
    c.dispose();
  };
  sq(1.3, 1.85, 0.62, 0.6, { surf: 'bisque', tone: BASALT, wear: 1.2, colorFn: basaltShade(17) });
  sq(1.85, 1.95, 0.56, 0.5, { surf: 'bisque', tone: BASALT_HI, wear: 1.1 });
  sq(1.95, 3.55, 0.4, 0.34, { surf: 'bisque', tone: TONES[1], wear: 0.6, colorFn: limeShade(3, 1.95) });
  sq(3.55, 3.7, 0.48, 0.5, { surf: 'bisque', tone: BASALT_HI, wear: 1.1, colorFn: basaltShade(19) });
  const LB = 3.7, LT = 4.42, LH = LT - LB, half = 0.2;
  box(b, lx, LB + 0.03, lz, 0.5, 0.06, 0.5, { surf: 'graphite', tone: IRON, wear: 0.5 });
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) box(b, lx + sx * half, LB + LH / 2, lz + sz * half, 0.045, LH, 0.045, { surf: 'graphite', tone: IRON, wear: 0.5 });
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    box(b, lx + sx * (half + 0.005), LB + LH / 2, lz + sz * (half + 0.005), sz ? 0.025 : 0.02, LH, sx ? 0.025 : 0.02, { surf: 'graphite', tone: IRON, wear: 0.5 });
    box(b, lx + sx * (half + 0.005), LB + LH * 0.62, lz + sz * (half + 0.005), sz ? 0.4 : 0.02, 0.02, sx ? 0.4 : 0.02, { surf: 'graphite', tone: IRON, wear: 0.5 });
  }
  box(b, lx, LT + 0.03, lz, 0.52, 0.06, 0.52, { surf: 'graphite', tone: IRON, wear: 0.5 });
  const cap = new THREE.ConeGeometry(0.4, 0.34, 4);
  b.add(cap, { surf: 'bronze', tone: 0x5e4c32, wear: 0.9, matrix: mat(lx, LT + 0.06 + 0.17, lz, Math.PI / 4) });
  cap.dispose();
  const fin = new THREE.SphereGeometry(0.05, 8, 6);
  b.add(fin, { surf: 'bronze', tone: 0x6e5a3a, wear: 0.8, matrix: mat(lx, LT + 0.45, lz) });
  fin.dispose();
  const ring = new THREE.TorusGeometry(0.07, 0.012, 4, 12);
  b.add(ring, { surf: 'graphite', tone: IRON, wear: 0.4, matrix: mat(lx, LT + 0.56, lz) });
  ring.dispose();
  // the panes: a glazed box inside the frame, and a smaller hot core (the wick's flame seen through it)
  const lg = new THREE.BoxGeometry(2 * half - 0.02, LH - 0.04, 2 * half - 0.02);
  g.add(lg, { surf: 'glaze', tone: 0xffb45e, wear: 0, matrix: mat(lx, LB + LH / 2, lz), colorFn: () => 0.62 });
  lg.dispose();
  const core = new THREE.BoxGeometry(0.06, 0.14, 0.06);
  g.add(core, { surf: 'glaze', tone: 0xffd690, wear: 0, matrix: mat(lx, LB + LH * 0.42, lz), colorFn: () => 1.5 });
  core.dispose();
  // lamp spill on its own pier and plinth top (the windows' bake: TEXCOORD_1.x), falling off over ~2.4 m
  const lampC = V(lx, LB + LH / 2, lz);
  const n0 = b.pos.length / 3;
  b.uv1 = noFoot(b);
  for (let i = 0; i < n0; i++) {
    const px = b.pos[i * 3], py = b.pos[i * 3 + 1], pz = b.pos[i * 3 + 2];
    const r = Math.hypot(px - lampC.x, py - lampC.y, pz - lampC.z);
    if (r > 2.4 || py > LB) continue;
    b.uv1[i * 2] = Math.min(1, 0.9 / (1 + (r / 0.8) ** 2) * (1 - r / 2.4));
  }
  g.uv1 = noFoot(g);
  return { body: b, glass: g, lampY: LB + LH / 2, lampZ: lz };
}

/* ------------------------------------------------------------------ build */
export async function build({ out = ROOT } = {}) {
  const parts = [];
  const stats = { buildings: {}, windows: 0, lit: 0, tris: {} };
  BUILDINGS.forEach((b, i) => {
    const r = building(b, i);
    parts.push({ bucket: r.body, material: { name: 'saltrow-kit' } });
    parts.push({ bucket: r.glass, material: { name: 'saltrow-kit' } });
    if (r.flora.pos.length) parts.push({ bucket: r.flora, material: { name: 'saltrow-kit' } });
    stats.windows += r.windows; stats.lit += r.lit;
    stats.buildings[b.id] = { windows: r.windows, lit: r.lit, tris: r.body.triangles + r.glass.triangles + r.flora.triangles };
  });
  const cone = saltCone(), rp = ramp(), bw = breakwater(), ct = cart();
  parts.push({ bucket: cone, material: { name: 'saltrow-kit' } });
  parts.push({ bucket: ct, material: { name: 'saltrow-kit' } });
  parts.push({ bucket: rp, material: { name: 'saltrow-kit' } });
  parts.push({ bucket: bw.body, material: { name: 'saltrow-kit' } });
  parts.push({ bucket: bw.glass, material: { name: 'saltrow-kit' } });
  // (fix round 1) the spill and the foot travel as the one custom byte attribute `_BONE` (three: `_bone`), packed
  // spill x 15 in the high nibble and the foot (0.1 m steps to 1.4 m; 15 = no foot) in the low: writeGLB's prune()
  // drops TEXCOORD_1 because no material samples it, so from 5210b31 to 6fcc3be the window spill never reached the
  // runtime (every wall vertex read 0) and the walls had no falloff to show
  for (const { bucket: b } of parts) {
    const n = b.pos.length / 3, u = b.uv1;
    const L = new Uint8Array(n).fill(15);
    if (u && u.length === n * 2) {
      for (let i = 0; i < n; i++) {
        const sp = Math.round(Math.min(1, Math.max(0, u[i * 2])) * 15);
        const fy = u[i * 2 + 1];
        const fq = fy >= 98 ? 15 : Math.min(14, Math.max(0, Math.round(fy / 0.1)));
        L[i] = sp * 16 + fq;
      }
    }
    b.labels = Array.from(L);
    delete b.uv1;
  }
  const res = await writeGLB(parts, {
    file: path.join(out, OUTPUTS[0]),
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Generator: { name: RECIPE, design: 'saltrow-kit', licence: 'original work (generated)' },
      r5Saltrow: {
        buildings: BUILDINGS.length, windows: stats.windows, litWindows: stats.lit, cones: CONES.length,
        lamp: { y: bw.lampY, z: bw.lampZ }, spill: '_BONE high nibble / 15', foot: '_BONE low nibble x 0.1 m (15: none)', glow: 'COLOR_0 on *-glass',
      },
    },
  });
  return { kit: 'saltrow', ...res, reference: undefined, kb: +(res.bytes / 1024).toFixed(1), windows: stats.windows, lit: stats.lit,
    trisBy: { ...Object.fromEntries(Object.entries(stats.buildings).map(([k, v]) => [k, v.tris])), cone: cone.triangles, cart: ct.triangles, ramp: rp.triangles, breakwater: bw.body.triangles } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const r = await build({ out: i > 0 ? path.resolve(process.argv[i + 1]) : ROOT });
  console.log(JSON.stringify(r));
}
