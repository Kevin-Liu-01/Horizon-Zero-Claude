/**
 * THE PANS' SCATTER (world-ground W1, bible §8.3, §9.6): where every instance stands.
 * Pure: a function of the height grid and the baked masks, tile-seeded so it is the same
 * whichever worker runs it and in whichever order (the build's byte-identity holds).
 *
 * Solid vertex-coloured meshes, no alpha; one draw per kind (`A-scatter-draws`); colonies,
 * never a uniform sprinkle. Streamed kinds re-fill their instance buffer around the camera
 * (vegetation.js); static kinds are one buffer for the whole field.
 *
 * Record: x, y, z, yaw, sx, sy, sz, lean, tint (9 floats per instance).
 */
import { WORLD_SIZE } from './extent.js';
import { rng, ss, fbm, fieldWalls, fieldToWorld, fieldCells, PAN, authored } from './recipe.js';
import { GRID, MASK_N, SHORE_ENC } from './bake.js';

export const STRIDE = 9;
export const TILE = 16;
export const TILE_N = Math.ceil(WORLD_SIZE / TILE);
const HALF = WORLD_SIZE / 2;

/** Density caps per m² and the ground each kind may stand on. */
export const KINDS = Object.freeze({
  marram: { streamed: true, cap: 2.5 },
  glasswort: { streamed: true, cap: 1.6 },
  lavender: { streamed: true, cap: 0.7 },
});

/** A field reader over the finished grids (shared record: read at once). */
export function fieldReader(F) {
  const { H, maskA, maskB, shore } = F;
  const { side, step, half } = GRID, N = MASK_N, cell = WORLD_SIZE / N;
  const R = { h: 0, slope: 0, rock: 0, shingle: 0, silt: 0, cover: 0, track: 0, damp: 0, coast: 0, glass: 0 };
  const hAt = (x, z) => {
    const fx = (x + half) / step, fz = (z + half) / step;
    const ix = fx < 0 ? 0 : fx >= side - 1 ? side - 2 : fx | 0;
    const iz = fz < 0 ? 0 : fz >= side - 1 ? side - 2 : fz | 0;
    const tx = fx - ix, tz = fz - iz, o = iz * side + ix;
    const a = H[o] + (H[o + 1] - H[o]) * tx, b = H[o + side] + (H[o + side + 1] - H[o + side]) * tx;
    return a + (b - a) * tz;
  };
  R.hAt = hAt;
  R.at = (x, z) => {
    R.h = hAt(x, z);
    const gx = (hAt(x + 2, z) - hAt(x - 2, z)) / 4, gz = (hAt(x, z + 2) - hAt(x, z - 2)) / 4;
    R.slope = Math.sqrt(gx * gx + gz * gz);
    const fx = (x + HALF) / cell - 0.5, fz = (z + HALF) / cell - 0.5;
    const ix = fx < 0 ? 0 : fx >= N - 1 ? N - 1 : fx + 0.5 | 0;
    const iz = fz < 0 ? 0 : fz >= N - 1 ? N - 1 : fz + 0.5 | 0;
    const o = (iz * N + ix) * 4;
    R.rock = maskA[o + 1] / 255; R.shingle = maskA[o + 2] / 255; R.silt = maskA[o + 3] / 255;
    R.track = maskB[o + 1] / 255; R.damp = maskB[o + 2] / 255;
    // cover bilinear: the same read as terrain.tallGrassDensity, so the field and the plants agree
    {
      const bx = fx < 0 ? 0 : fx >= N - 1 ? N - 2 : fx | 0, bz = fz < 0 ? 0 : fz >= N - 1 ? N - 2 : fz | 0;
      const tx = fx - bx, tz = fz - bz, q = (bz * N + bx) * 4;
      const c0 = maskB[q] + (maskB[q + 4] - maskB[q]) * tx, c1 = maskB[q + N * 4] + (maskB[q + N * 4 + 4] - maskB[q + N * 4]) * tx;
      R.cover = (c0 + (c1 - c0) * tz) / 255;
    }
    R.coast = SHORE_ENC.dMin + (shore[o] / 255) * (SHORE_ENC.dMax - SHORE_ENC.dMin);
    R.glass = shore[o + 2] / 255;
    return R;
  };
  return R;
}

function tileRng(tx, tz, salt) {
  return rng(Math.imul(tx + 1, 73856093) ^ Math.imul(tz + 1, 19349663) ^ Math.imul(salt, 83492791));
}

/** Instances of a streamed kind on one tile, appended to `out` (a plain array). */
export function scatterTile(kind, tx, tz, R, out) {
  const x0 = -HALF + tx * TILE, z0 = -HALF + tz * TILE;
  const seed = kind === 'marram' ? 11 : kind === 'glasswort' ? 23 : 37;
  const r = tileRng(tx, tz, seed);
  // the tile's corners and centre tell most tiles there is nothing to do
  const cap = KINDS[kind].cap, tries = Math.round(cap * TILE * TILE);
  for (let t = 0; t < tries; t++) {
    const a = r(), b = r(), c0 = r(), c1 = r(), c2 = r(), c3 = r();
    const x = x0 + a * TILE, z = z0 + b * TILE;
    const F = R.at(x, z);
    if (F.h < 0.04 || F.coast < 1) continue;
    let d = 0, sy = 1, sc = 1, lean = 0;
    if (kind === 'marram') {
      if (F.slope > 0.9 || F.rock > 0.5 || F.track > 0.4) continue;
      d = F.cover > 0.45 ? 2.3 : F.cover > 0.02 ? 0.3 + F.cover * 1.5 : 0;
      sc = 0.72 + c0 * 0.62; sy = 0.78 + c1 * 0.6; lean = 0.14 + c2 * 0.2;
    } else if (kind === 'glasswort') {
      if (F.slope > 0.5 || F.rock > 0.3 || F.track > 0.3 || F.h > 2.8) continue;
      if (authored.pan(x, z).kind >= 0) continue;      // the cells are worked ground: nothing grows in them
      const margin = Math.max(F.silt, F.damp * 1.1) * (1 - F.cover);
      if (margin <= 0.08) continue;
      d = margin * 1.5 * ss(0.38, 0.62, fbm(x * 0.05 + 2, z * 0.05, 3));
      sc = 0.7 + c0 * 1.1; sy = 0.7 + c1 * 0.9;
    } else { // lavender
      if (F.slope > 0.45 || F.rock > 0.2 || F.track > 0.25 || F.coast < 14 || F.h > 7 || F.silt > 0.6) continue;
      if (authored.pan(x, z).kind >= 0) continue;
      const patch = ss(0.5, 0.68, fbm(x * 0.032 + 40, z * 0.032 - 8, 3));
      d = patch * 0.62 * (1 - F.cover * 0.7);
      sc = 0.75 + c0 * 0.6; sy = 0.8 + c1 * 0.5;
    }
    if (d <= 0 || c3 * cap > d) continue;
    out.push(x, F.h - 0.015, z, c2 * 6.2832, sc, sc * sy, sc, lean, 0.78 + c0 * 0.44);
  }
}

/** Field walls round Saltrow, engine (x, z): hand-laid lines between the tracks. */
const ENCLOSURES = [
  [[-262, 196], [-232, 208], [-206, 204], [-190, 232], [-212, 262], [-226, 272]],
  [[-232, 208], [-226, 236], [-212, 262]],
  [[-300, 176], [-262, 196], [-250, 168], [-214, 160], [-206, 204]],
  [[-214, 160], [-176, 170], [-168, 206], [-190, 232]],
  [[-168, 206], [-132, 214], [-128, 250], [-160, 262]],
  [[-250, 168], [-258, 142], [-222, 128], [-214, 160]],
];

/** Static instanced kinds for the whole Pans. */
export function scatterStatic(R) {
  const r = rng(0x0b5a17);
  const rocks = [], columns = [], walls = [], heaps = [];
  // boulders: reef in the surf, the Shelf's foot, sparse on the beach and dunes, a fan at the crater
  for (let t = 0; t < 26000; t++) {
    const x = -HALF + r() * WORLD_SIZE * 0.6, z = -20 + r() * (HALF + 20);
    if (x > -60) continue;
    const F = R.at(x, z);
    const u0 = r(), u1 = r(), u2 = r(), u3 = r();
    let keep = 0, sMin = 0.2, sMax = 0.9;
    if (F.coast < 3 && F.coast > -14 && F.rock > 0.3) { keep = 0.5; sMin = 0.5; sMax = 2.1; }            // reef
    else if (F.rock > 0.55 && F.slope < 1.2) { keep = 0.05; sMin = 0.3; sMax = 1.5; }                    // table, crags
    else if (F.shingle > 0.2) { keep = 0.09; sMin = 0.14; sMax = 0.62; }
    else if (authored.crater(x, z) > 0.25 && F.slope > 0.2 && F.slope < 1.0) { keep = 0.34; sMin = 0.25; sMax = 1.9; }   // the ring's rockfall
    else if (F.coast > 8 && F.h > 0.1 && F.track < 0.3) { keep = 0.012; sMin = 0.16; sMax = 0.7; }
    if (!keep || u0 > keep) continue;
    const s = sMin + u1 * u1 * (sMax - sMin);
    rocks.push(x, F.h - s * 0.2, z, u2 * 6.2832, s * (0.9 + u3 * 0.4), s * (0.62 + u1 * 0.4), s * (0.8 + u2 * 0.4), (u3 - 0.5) * 0.4, 0.8 + u3 * 0.35);
    if (rocks.length / STRIDE > 1100) break;
  }
  // basalt pavements: tight hex-packed columns where the Shelf's edge breaks down (the Causeway look)
  for (let t = 0; t < 400 && columns.length / STRIDE < 340; t++) {
    const cx = -230 + r() * 150, cz = 300 + r() * 110;
    const F0 = R.at(cx, cz);
    if (F0.rock < 0.35 || F0.coast < 6) continue;
    const rad = 2.6 + r() * 3.2, pitch = 0.92 + r() * 0.2, w = pitch * 0.56, ph = r() * 6.28, topH = 0.5 + r() * 1.1;
    for (let j = -8; j <= 8; j++) {
      for (let i = -8; i <= 8; i++) {
        const x = cx + (i + (j & 1) * 0.5) * pitch, z = cz + j * pitch * 0.866;
        const d = Math.hypot(x - cx, z - cz) / rad;
        if (d > 1) continue;
        const F = R.at(x, z);
        if (F.h < 0.5 || F.slope > 1.3) continue;
        const u1 = r(), u2 = r();
        // heights fall away from the cluster's core, with a step or two: a broken pavement
        const hh = (topH * (1 - d * d * 0.75) + Math.sin(x * 1.3 + ph) * 0.14 + (u1 - 0.5) * 0.34) * 0.9 + 0.32;
        columns.push(x, F.h - 0.25, z, 0.2 + (u2 - 0.5) * 0.06, w, hh, w, (u1 - 0.5) * 0.05, 0.84 + u2 * 0.3);
      }
    }
  }
  // the dykes: one stone run per 1.7 m of every wall of the field
  const seg = 1.7, P = { x: 0, z: 0 }, Q = { x: 0, z: 0 };
  for (const W of fieldWalls()) {
    const len = Math.hypot(W.u1 - W.u0, W.v1 - W.v0), n = Math.max(1, Math.round(len / seg));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      fieldToWorld(W.u0 + (W.u1 - W.u0) * t0, W.v0 + (W.v1 - W.v0) * t0, P);
      fieldToWorld(W.u0 + (W.u1 - W.u0) * t1, W.v0 + (W.v1 - W.v0) * t1, Q);
      const cx = (P.x + Q.x) * 0.5, cz = (P.z + Q.z) * 0.5;
      const u = r(), v = r(), w = r();
      if (u < 0.016) continue;                                     // the odd breach: a dyke is hand-laid
      const dx = Q.x - P.x, dz = Q.z - P.z;
      const hBase = R.hAt(cx, cz);
      const main = W.main ? 1 : 0;
      walls.push(cx + (v - 0.5) * 0.14, hBase - 0.03, cz + (w - 0.5) * 0.14, Math.atan2(dx, dz) + (u - 0.5) * 0.14 + (v > 0.5 ? Math.PI : 0),
        (0.82 + w * 0.42) * (main ? 1.9 : 1), (0.66 + v * 0.74) * (main ? 0.72 : 1), Math.hypot(dx, dz) / seg * 1.08,
        main, 0.8 + u * 0.62);
    }
  }
  // the old enclosures round the town: long field walls on the plain behind the pans (worked land,
  // the same lava stone), in the same kind and the same draw
  for (const line of ENCLOSURES) {
    for (let k = 0; k < line.length - 1; k++) {
      const [ax, az] = line[k], [bx, bz] = line[k + 1];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / seg));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, wob = Math.sin(t * len * 0.09 + k) * 0.5;
        const cx = ax + (bx - ax) * t + (bz - az) / len * wob, cz = az + (bz - az) * t - (bx - ax) / len * wob;
        const u = r(), v = r(), w = r();
        const F = R.at(cx, cz);
        if (u < 0.05 || F.track > 0.3 || F.rock > 0.5 || F.coast < 8) continue;     // gaps, gateways
        walls.push(cx + (v - 0.5) * 0.14, F.h - 0.05, cz + (w - 0.5) * 0.14, Math.atan2(bx - ax, bz - az) + (u - 0.5) * 0.14 + (v > 0.5 ? Math.PI : 0),
          0.74 + w * 0.36, 0.5 + v * 0.46, len / n / seg * 1.08, 0, 0.8 + u * 0.62);
      }
    }
  }
  // raked salt: long low windrows and small heaps in the crust cells nearest the town
  for (const c of fieldCells()) {
    if (c.kind !== PAN.WHITE && c.kind !== PAN.CREAM) continue;
    if (r() > 0.3) continue;
    const rows = 1 + Math.floor(r() * 3);
    const heapLine = r() < 0.55;
    for (let k = 0; k < rows; k++) {
      const vw = c.v0 + 2.2 + ((k + 0.5) / rows) * (c.v1 - c.v0 - 4.4);
      const step = heapLine ? 3.2 + r() * 1.8 : 4.4;
      for (let u = c.u0 + 2.4; u < c.u1 - 2.4; u += step) {
        fieldToWorld(u + (r() - 0.5) * 0.6, vw + (r() - 0.5) * 0.5, P);
        const hBase = R.hAt(P.x, P.z);
        const a = r(), b = r();
        if (heapLine) {
          const s = 0.3 + a * 0.34;
          heaps.push(P.x, hBase - 0.02, P.z, b * 6.28, s, s * (0.52 + b * 0.3), s, 0, 0.92 + a * 0.12);
        } else {
          heaps.push(P.x, hBase - 0.03, P.z, Math.atan2(0.78, 0.626) + (b - 0.5) * 0.08, 0.52 + a * 0.24, 0.14 + b * 0.1, 2.6, 0, 0.9 + a * 0.14);
        }
      }
    }
  }
  // the cones: the harvest piled at the field's town edge, the Pans' white silhouette
  const CONES = [[-60, 50.8, 3], [-7, 48.4, 2], [58, 52, 3]];
  for (const [cu, cv, count] of CONES) {
    let u = cu;
    for (let k = 0; k < count; k++) {
      const s = 2.1 + r() * 0.9;
      fieldToWorld(u, cv + (r() - 0.5) * 0.6, P);
      heaps.push(P.x, R.hAt(P.x, P.z) - 0.05, P.z, r() * 6.28, s, s * (0.72 + r() * 0.1), s, 0, 1.0);
      u += s * 2.3 + 0.5 + r() * 1.6;
    }
  }
  return {
    rocks: Float32Array.from(rocks), columns: Float32Array.from(columns),
    walls: Float32Array.from(walls), heaps: Float32Array.from(heaps),
  };
}

/** Streamed kinds for tile rows [tz0, tz1): per kind, records + per-tile counts. */
export function scatterRows(F, tz0, tz1) {
  const R = fieldReader(F), out = {};
  const { maskA, maskB, shore } = F, N = MASK_N, per = TILE / (WORLD_SIZE / N);
  for (const kind of Object.keys(KINDS)) out[kind] = { rec: [], counts: new Uint32Array((tz1 - tz0) * TILE_N) };
  for (let tz = tz0; tz < tz1; tz++) {
    for (let tx = 0; tx < TILE_N; tx++) {
      // a tile with no cover, no margin and no shingle in its texels is skipped outright
      let cover = 0, wet = 0, land = 0;
      const i0 = Math.floor(tx * per), j0 = Math.floor(tz * per), s = Math.ceil(per);
      for (let j = j0; j < Math.min(N, j0 + s); j++) for (let i = i0; i < Math.min(N, i0 + s); i++) {
        const o = (j * N + i) * 4;
        if (maskB[o] > cover) cover = maskB[o];
        if (maskB[o + 2] > wet) wet = maskB[o + 2];
        if (maskA[o + 3] > wet) wet = maskA[o + 3];
        if (shore[o] > land) land = shore[o];
      }
      const coastM = SHORE_ENC.dMin + (land / 255) * (SHORE_ENC.dMax - SHORE_ENC.dMin);
      if (coastM < 1) continue;
      const idx = (tz - tz0) * TILE_N + tx;
      const run = (kind) => {
        const a = out[kind].rec, n0 = a.length;
        scatterTile(kind, tx, tz, R, a);
        out[kind].counts[idx] = (a.length - n0) / STRIDE;
      };
      if (cover > 0) run('marram');
      if (wet > 12) run('glasswort');
      if (coastM > 12) run('lavender');
    }
  }
  for (const kind of Object.keys(KINDS)) out[kind].rec = Float32Array.from(out[kind].rec);
  return out;
}

/** Marram records for one tile, for a runtime re-bake after a cover stamp. */
export function marramTile(tx, tz, R) {
  const a = [];
  scatterTile('marram', tx, tz, R, a);
  return Float32Array.from(a);
}

/** Marram density at a point, tufts/m²: the same rule the scatter plants by. */
export function marramDensity(F) {
  if (F.h < 0.04 || F.coast < 1 || F.slope > 0.9 || F.rock > 0.5 || F.track > 0.4) return 0;
  return F.cover > 0.45 ? 2.3 : F.cover > 0.02 ? 0.3 + F.cover * 1.5 : 0;
}
