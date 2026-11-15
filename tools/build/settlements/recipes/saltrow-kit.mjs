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
 *   b-<id>-body    walls, roof, trim, balcony, bell        TEXCOORD_1.x = window spill (0..1): how much a lit window
 *                                                          of the same facade lights this vertex at night
 *   b-<id>-glass   window panes and the door lantern       COLOR_0 = the pane's night glow (black = a dark room)
 *   b-<id>-flora   bougainvillea                           (vertex colour, foliage)
 *   cone, ramp, breakwater (body), breakwater-glass (the lamp)
 * The runtime (src/world/settlements/saltrow.js) seats each on the ground and merges by kind into three draws.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { THREE, Bucket, V, strut, ball, rbox, cable, rng } from '../../lib/hs.mjs';
import { writeGLB } from '../../lib/glb.mjs';
import { vnoise3, fbm3 } from '../../landmarks/recipes/lib/rock.mjs';
import { BUILDINGS, TONES, HARBOUR, CONES } from '../../../../src/world/settlements/saltrow-layout.js';

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

/** Quoins up one vertical corner: courses alternate long and short across the two faces. */
function quoins(bucket, cx, cz, sx, sz, y0, y1, R) {
  const course = 0.34;
  let i = 0;
  for (let y = y0; y + course * 0.6 < y1; y += course, i++) {
    const hgt = Math.min(course - 0.03, y1 - y - 0.02);
    const a = i & 1 ? 0.62 : 0.34, b = i & 1 ? 0.34 : 0.62;
    const out = 0.035;
    box(bucket, cx - sx * (a / 2 - out), y + hgt / 2, cz - sz * (0.18 - out) + sz * 0.0, a, hgt, 0.36 + out,
      { surf: 'bisque', tone: R() < 0.3 ? BASALT_HI : BASALT, wear: 1.2, colorFn: basaltShade(i) });
    box(bucket, cx - sx * (0.18 - out), y + hgt / 2, cz - sz * (b / 2 - out), 0.36 + out, hgt, b,
      { surf: 'bisque', tone: BASALT, wear: 1.2, colorFn: basaltShade(i + 7) });
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

/** Bougainvillea: a twisted trunk up a front corner, a mass over the door and a fall from the parapet. */
function bougainvillea(flora, body, F, x0, roofY, doorX, R) {
  const at = (lx, ly, lz) => V(lx, ly, lz).applyMatrix4(F);
  const trunk = [];
  for (let i = 0; i <= 8; i++) trunk.push(at(x0 + Math.sin(i * 1.3) * 0.12, PLINTH + i * (roofY - 0.4) / 8, 0.12 + Math.cos(i * 1.1) * 0.05));
  cable(body, trunk, 0.06, { surf: 'bisque', tone: WOOD_DK, wear: 1, segs: 24, radial: 5 });
  const blob = new THREE.IcosahedronGeometry(1, 0);
  const put = (lx, ly, lz, r) => {
    const leaf = R() < 0.3;
    const tone = leaf ? LEAF[(R() * LEAF.length) | 0] : BRACT[(R() * BRACT.length) | 0];
    const m = F.clone().multiply(new THREE.Matrix4().compose(V(lx, ly, lz), _q.setFromEuler(_e.set(R() * 3, R() * 3, R() * 3)),
      new THREE.Vector3(r * (0.8 + R() * 0.4), r * (0.6 + R() * 0.3), r * (0.8 + R() * 0.4))));
    flora.add(blob, { surf: 'bisque', tone, wear: 0.9, matrix: m });
  };
  // up the corner: a column thickening toward the top
  for (let i = 0; i < 70; i++) {
    const t = R();
    put(x0 + (R() - 0.5) * (0.5 + t * 0.9), PLINTH + 0.6 + t * (roofY - 0.6), 0.18 + R() * 0.35, 0.16 + R() * 0.12 + t * 0.06);
  }
  // the swag along the parapet toward the door, falling in tongues
  const x1 = doorX;
  for (let i = 0; i < 110; i++) {
    const t = R(), lx = x0 + (x1 - x0) * t * 1.15;
    const fall = Math.pow(R(), 2) * (0.6 + 1.6 * Math.abs(Math.sin(lx * 2.1)));
    put(lx + (R() - 0.5) * 0.4, roofY + 0.1 - fall, 0.2 + R() * 0.38, 0.17 + R() * 0.12);
  }
  // a crown over the parapet edge
  for (let i = 0; i < 40; i++) put(x0 + (x1 - x0) * R() * 0.9, roofY + 0.25 + R() * 0.35, 0.05 + R() * 0.4, 0.2 + R() * 0.1);
  blob.dispose();
}

/** The brass bell: a lathe profile, mouth down, its crown on a yoke. */
function bell(body, F, x, y, z) {
  const prof = [[0.0, 0.0], [0.2, 0.0], [0.215, 0.03], [0.19, 0.1], [0.15, 0.22], [0.13, 0.34], [0.11, 0.4], [0.06, 0.43], [0.0, 0.44]]
    .map(([r, h]) => new THREE.Vector2(r, h));
  const g = new THREE.LatheGeometry(prof, 18);
  body.add(g, { surf: 'bronze', tone: BRASS, wear: 0.9, matrix: F.clone().multiply(mat(x, y, z)) });
  g.dispose();
  const M = F.clone().multiply(mat(x, y + 0.5, z));
  const yoke = new THREE.BoxGeometry(0.62, 0.1, 0.12);
  body.add(yoke, { surf: 'bisque', tone: WOOD_DK, wear: 1, matrix: M });
  yoke.dispose();
  const clap = new THREE.SphereGeometry(0.045, 8, 6);
  body.add(clap, { surf: 'graphite', tone: IRON, wear: 0.4, matrix: F.clone().multiply(mat(x, y + 0.04, z)) });
  clap.dispose();
}

/* ------------------------------------------------------------------ a building */
function building(b, idx) {
  const R = rng(0x5a17 + idx * 977);
  const body = new Bucket(`b-${b.id}-body`), glass = new Bucket(`b-${b.id}-glass`), flora = new Bucket(`b-${b.id}-flora`);
  const tone = TONES[b.tone];
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
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) quoins(body, sx * w / 2, sz * d / 2, sx, sz, PLINTH, b.h, R);
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
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) quoins(body, s.x + sx * s.w / 2, s.z + sz * s.d / 2, sx, sz, roofY, y1, R);
    // a small window on its front
    const F = mat(s.x, 0, s.z + s.d / 2);
    windows.push(windowAt(body, glass, F, 0, roofY + s.h * 0.55, 0.6, 0.7, R, { lit: R() < 0.5, shutters: false }));
    // a door out onto the roof from it
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
  const doorX = guild ? 0 : (R() < 0.5 ? -1 : 1) * Math.min(1.4, w * 0.18);
  for (const fa of facades) {
    const { F, len } = fa;
    const cols = Math.max(1, Math.floor((len - 1.4) / (guild ? 2.4 : 2.6)));
    const xs = Array.from({ length: cols }, (_, i) => -len / 2 + (i + 0.5) * len / cols);
    const litOdds = fa.front ? 0.72 : 0.45;
    // the party walls of a terrace carry no windows
    if (fa.side && !guild && R() < 0.55) continue;
    for (const x of xs) {
      // ground floor
      if (!(fa.front && Math.abs(x - doorX) < (guild ? 1.8 : 1.1))) {
        windows.push(windowAt(body, glass, F, x, PLINTH + 1.55, guild ? 0.95 : 0.78, guild ? 1.35 : 1.05, R,
          { lit: guild || R() < litOdds, surround: guild, shutters: !guild && R() < 0.6 }));
      }
      // upper floor (the balcony's door takes the middle bay of the front)
      if (two) {
        const balc = b.balcony && fa.front && Math.abs(x) < len / cols * 0.6;
        if (!balc) windows.push(windowAt(body, glass, F, x, 4.3, guild ? 0.95 : 0.78, guild ? 1.25 : 1.0, R,
          { lit: guild || R() < litOdds * 0.9, surround: guild, shutters: !guild && R() < 0.5 }));
      }
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
    bell(body, F, 0, gy + 0.85, 0);
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
  }
  glass.uv1 = new Array((glass.pos.length / 3) * 2).fill(0);
  flora.uv1 = new Array((flora.pos.length / 3) * 2).fill(0);
  return { body, glass, flora, windows: windows.length, lit: lit.length };
}

/* ------------------------------------------------------------------ props */
function saltCone() {
  const b = new Bucket('cone');
  const R = rng(4242);
  const prof = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    prof.push(new THREE.Vector2(Math.max(0.001, (1 - t) * 1.0 + (t < 0.08 ? 0.04 : 0)), t * 1.0));
  }
  const g = new THREE.LatheGeometry(prof, 28);
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    const k = 1 + (vnoise3(x * 3, y * 3, z * 3) - 0.5) * 0.12 * (1 - y);
    pa.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  b.add(g, { surf: 'bisque', tone: SALT, wear: 0.6, colorFn: (p, n, k) => k * (0.92 + 0.12 * vnoise3(p.x * 6, p.y * 6, p.z * 6)) * (p.y < 0.06 ? 0.86 : 1) });
  g.dispose();
  // a rake left against it, half the cones
  strut(b, V(0.55, 0.0, 0.62), V(0.05, 1.05, 0.12), 0.018, 0.018, { surf: 'bisque', tone: WOOD, wear: 1, sides: 5 });
  box(b, 0.6, 0.03, 0.66, 0.5, 0.05, 0.06, { surf: 'bisque', tone: WOOD_DK, wear: 1, ry: 0.7 });
  void R;
  b.uv1 = new Array((b.pos.length / 3) * 2).fill(0);
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
  b.uv1 = new Array((b.pos.length / 3) * 2).fill(0);
  return b;
}

/** The breakwater: a basalt mole with armour blocks, its lamp column at the end. Local +z out to sea, top y 1.3. */
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
  // the lamp: a lime-washed column, an iron cage, the lantern
  const lz = L - 1.2;
  strut(b, V(0, 1.3, lz), V(0, 4.1, lz), 0.36, 0.3, { surf: 'bisque', tone: TONES[0], wear: 0.6, sides: 14, colorFn: limeShade(3, 1.3) });
  strut(b, V(0, 4.1, lz), V(0, 4.25, lz), 0.42, 0.42, { surf: 'bisque', tone: BASALT, wear: 1.1, sides: 14 });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    strut(b, V(Math.cos(a) * 0.2, 4.25, lz + Math.sin(a) * 0.2), V(Math.cos(a) * 0.2, 4.95, lz + Math.sin(a) * 0.2), 0.02, 0.02, { surf: 'graphite', tone: IRON, wear: 0.4, sides: 4 });
  }
  const cap = new THREE.ConeGeometry(0.34, 0.32, 12);
  b.add(cap, { surf: 'bronze', tone: 0x6e5a3a, wear: 0.9, matrix: mat(0, 5.1, lz) });
  cap.dispose();
  const lg = new THREE.CylinderGeometry(0.17, 0.17, 0.6, 12);
  g.add(lg, { surf: 'glaze', tone: 0xffbe6a, wear: 0, matrix: mat(0, 4.6, lz), colorFn: () => 1.5 });
  lg.dispose();
  b.uv1 = new Array((b.pos.length / 3) * 2).fill(0);
  g.uv1 = new Array((g.pos.length / 3) * 2).fill(0);
  return { body: b, glass: g, lampY: 4.6, lampZ: lz };
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
  const cone = saltCone(), rp = ramp(), bw = breakwater();
  parts.push({ bucket: cone, material: { name: 'saltrow-kit' } });
  parts.push({ bucket: rp, material: { name: 'saltrow-kit' } });
  parts.push({ bucket: bw.body, material: { name: 'saltrow-kit' } });
  parts.push({ bucket: bw.glass, material: { name: 'saltrow-kit' } });
  const res = await writeGLB(parts, {
    file: path.join(out, OUTPUTS[0]),
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Generator: { name: RECIPE, design: 'saltrow-kit', licence: 'original work (generated)' },
      r5Saltrow: {
        buildings: BUILDINGS.length, windows: stats.windows, litWindows: stats.lit, cones: CONES.length,
        lamp: { y: bw.lampY, z: bw.lampZ }, spill: 'TEXCOORD_1.x', glow: 'COLOR_0 on *-glass',
      },
    },
  });
  return { kit: 'saltrow', ...res, reference: undefined, kb: +(res.bytes / 1024).toFixed(1), windows: stats.windows, lit: stats.lit,
    trisBy: { ...Object.fromEntries(Object.entries(stats.buildings).map(([k, v]) => [k, v.tris])), cone: cone.triangles, ramp: rp.triangles, breakwater: bw.body.triangles } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const r = await build({ out: i > 0 ? path.resolve(process.argv[i + 1]) : ROOT });
  console.log(JSON.stringify(r));
}
