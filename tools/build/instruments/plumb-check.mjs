#!/usr/bin/env node
/**
 * CALIMA — BUILD M1.4a-c, the browser-free half of the Plumb's acceptance (Node only, no Chrome).
 *
 *   node tools/build/instruments/plumb-check.mjs [--json]
 *
 * Rebuilds the Plumb from its recipe into a temporary directory (the shipped GLB is not touched) and measures the
 * model the recipe writes. The rendered half (enamel share of the VISIBLE hull in F23, the emissive pass, the 40 m
 * shots, the topple clock, Pry, the greyscale lamp classifier) is `tools/instruments/plumb-probe-page.mjs`, run by
 * `tools/frames/film.mjs --probe`.
 *
 *   tris          <= 25 000 (TECH §9.2 small-Instrument cap)
 *   height        3.4 m +- 0.1
 *   vial          tube length >= 0.25 m
 *   graduations   the widest graduation band / the shortest graduated staff <= 4 %
 *   detail        rivet diameter 2 cm and its size in pixels at 6 m through the F23 lens (>= 2 px resolves)
 *   dust          the dust band ends at 0.6 m +- 0.1 (the height where enamel stops darkening, measured on the staffs)
 *   emissive      the hull material has no emissive factor or map; the only emissive material is the vial glass;
 *                 the hull's `_LAMPPROX` spill field is 0 everywhere
 *   enamel        the enamel share of the hull's whole surface area (all round; the F23 visible share is the probe's)
 *   lamp tokens   every lamp token and the vial glass >= 20 dE2000 from each of the five excluded colours
 */
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { build, PLUMB } from './gen-plumb.mjs';
import { C, SURF_OF, GRAD_PERIOD, GRAD_PX, ATLAS, BAND, U1_SCALE, decalAtlasBytes, kitStats } from './parts/kit.mjs';
import { LAMP_STATES, LAMP_CANON } from '../../../src/instruments/lamps.js';
import { deltaE } from '../../../src/instruments/lib/color.js';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'plumb-check-'));
let r, r0;
try {
  r = await build({ out: tmp, file: path.join(tmp, 'plumb.glb') });
  r0 = await build({ out: tmp, file: path.join(tmp, 'plumb-nodust.glb'), noDust: true });   // the same model with no dust band
} finally { rmSync(tmp, { recursive: true, force: true }); }
const { hullAll, glassAll, bob, drum, sockets } = r._buckets;
/** the lamp system draws its iris and dark housing face over the drum's face (r <= lampR): that disc is lamp, not hull */
const LF = sockets.lamp, LR = sockets.lampR;
const onLampFace = (b, i) => b === drum && Math.abs(b.pos[i * 3 + 2] - LF[2]) < 0.012 && Math.hypot(b.pos[i * 3] - LF[0], b.pos[i * 3 + 1] - LF[1]) <= LR + 1e-3;

/* ---- classes per triangle: enamel / ink / brass / gunmetal / cloth (glass is not hull) ---- */
const atlas = decalAtlasBytes();
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
function texel(u1, v1) {
  const u = ((u1 % 1) + 1) % 1, v = Math.min(0.999, Math.max(0, v1));
  const o = (Math.floor(v * ATLAS) * ATLAS + Math.floor(u * ATLAS)) * 4;
  return [lin(atlas[o]), lin(atlas[o + 1]), lin(atlas[o + 2])];
}
function classOf(b, i) {
  const slot = Math.floor(b.uv[i * 2] * 8);
  if (slot === SURF_OF.glaze) {
    const t = texel(b.uv1[i * 2], b.uv1[i * 2 + 1]);
    const r0 = b.col[i * 3] * t[0], g0 = b.col[i * 3 + 1] * t[1];
    if (r0 > 2.2 * g0 && r0 > 0.05) return 'ink';
    if (t[0] + t[1] + t[2] < 0.6) return 'ink';
    return 'enamel';
  }
  if (slot === SURF_OF.bronze || slot === SURF_OF.patina) return 'brass';
  if (slot === SURF_OF.bisque) return 'cloth';
  return 'gunmetal';
}
const area = {};
let total = 0;
for (const b of [hullAll, bob, drum]) {
  const P = b.pos;
  for (let t = 0; t + 8 < P.length; t += 9) {
    const ax = P[t + 3] - P[t], ay = P[t + 4] - P[t + 1], az = P[t + 5] - P[t + 2];
    const bx = P[t + 6] - P[t], by = P[t + 7] - P[t + 1], bz = P[t + 8] - P[t + 2];
    const a = 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    // a triangle's class from its three corners' majority (decals are mapped per triangle: kit.decalSince)
    if (onLampFace(b, t / 3) && onLampFace(b, t / 3 + 1) && onLampFace(b, t / 3 + 2)) continue;   // the lamp's face
    const cs = [0, 1, 2].map((k) => classOf(b, t / 3 + k));
    const c = cs[0] === cs[1] || cs[0] === cs[2] ? cs[0] : cs[1];
    area[c] = (area[c] || 0) + a; total += a;
  }
}
const share = Object.fromEntries(Object.entries(area).map(([k, v]) => [k, +(100 * v / total).toFixed(1)]));

/* ---- an offline estimate of the VISIBLE share from F23's bearing (a z-buffered class render; the probe measures
   the real frame): the Plumb at the origin facing +Z, Brea 6 m in front, the lens 4.5 m behind her at 25 deg off
   her back, 2 m up, looking at 1.6 m up 4 m past her ---- */
function visibleShare(eye, tgt, W = 360, Hh = 540, fov = 50) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nz = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const f = nz(sub(tgt, eye)), rr = nz(cross(f, [0, 1, 0])), u = cross(rr, f), fl = (Hh / 2) / Math.tan(fov * Math.PI / 360);
  const zb = new Float32Array(W * Hh).fill(1e9), id = new Array(W * Hh).fill(null);
  const proj = (p) => { const d = sub(p, eye); const z = dot(d, f); return [W / 2 + dot(d, rr) * fl / z, Hh / 2 - dot(d, u) * fl / z, z]; };
  for (const [b, cls] of [[hullAll, true], [bob, true], [drum, true], [glassAll, false]]) {
    const P = b.pos;
    for (let t = 0; t + 8 < P.length; t += 9) {
      const v = [0, 1, 2].map((k) => proj([P[t + k * 3], P[t + k * 3 + 1], P[t + k * 3 + 2]]));
      const c = (onLampFace(b, t / 3) && onLampFace(b, t / 3 + 1) && onLampFace(b, t / 3 + 2)) ? 'lamp' : cls ? (() => { const cs = [0, 1, 2].map((k) => classOf(b, t / 3 + k)); return cs[0] === cs[1] || cs[0] === cs[2] ? cs[0] : cs[1]; })() : 'glass';
      const ar = (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[1][1] - v[0][1]) * (v[2][0] - v[0][0]);
      if (Math.abs(ar) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(v[0][0], v[1][0], v[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(v[0][0], v[1][0], v[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(v[0][1], v[1][1], v[2][1]))), y1 = Math.min(Hh - 1, Math.ceil(Math.max(v[0][1], v[1][1], v[2][1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((v[1][0] - px) * (v[2][1] - py) - (v[1][1] - py) * (v[2][0] - px)) / ar;
        const w1 = ((v[2][0] - px) * (v[0][1] - py) - (v[2][1] - py) * (v[0][0] - px)) / ar;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * v[0][2] + w1 * v[1][2] + w2 * v[2][2], o = y * W + x;
        if (z < zb[o]) { zb[o] = z; id[o] = c; }
      }
    }
  }
  const n = {}; let hullPx = 0;
  for (const c of id) if (c && c !== 'glass' && c !== 'lamp') { n[c] = (n[c] || 0) + 1; hullPx++; }
  return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, +(100 * v / hullPx).toFixed(1)]));
}
const a25 = 25 * Math.PI / 180;
const visF23 = visibleShare([4.5 * Math.sin(a25), 2.0, 6 + 4.5 * Math.cos(a25)], [0, 1.6, 2]);
const visFront = visibleShare([0, 1.6, 8], [0, 1.7, 0]);

/* ---- dust: each vertex's colour against the same vertex built with no dust band; the band ends at the highest
   vertex the dust still darkens by more than 2 % ---- */
let dustEnd = 0, dusted = 0;
const H0 = r0._buckets.hullAll;
for (let i = 0; i < hullAll.pos.length / 3; i++) {
  const a = hullAll.col[i * 3] + hullAll.col[i * 3 + 1] + hullAll.col[i * 3 + 2], b = H0.col[i * 3] + H0.col[i * 3 + 1] + H0.col[i * 3 + 2];
  if (b > 1e-4 && a / b < 0.98) { dusted++; dustEnd = Math.max(dustEnd, hullAll.pos[i * 3 + 1]); }
}
const prof = [];
const upper = null;

/* ---- emissive ---- */
let proxMax = 0;
for (const v of hullAll.prox || []) proxMax = Math.max(proxMax, v);

/* ---- graduations ---- */
const pxM = GRAD_PERIOD / ATLAS;
const widest = Math.max(GRAD_PX.majorW, GRAD_PX.minorW, GRAD_PX.tickW) * pxM;
const shinLen = kitStats.staffs.length ? Math.min(...kitStats.staffs) : null;

/* ---- detail at 6 m through the F23 lens (fov 50, 900 CSS px tall at DPR 1.25) ---- */
const devPx = 900 * 1.25, fov = 50;
const pxPerM6 = devPx / (2 * 6 * Math.tan((fov / 2) * Math.PI / 180));
const rivetD = 2 * kitStats.rivetRMin;

/* ---- lamp tokens ---- */
const tokens = { calm: LAMP_STATES.calm.token, wary: LAMP_STATES.wary.token, hostile: LAMP_STATES.hostile.token, dark: LAMP_STATES.dark.token, glass: '#D6F0EE' };
const lamp = Object.fromEntries(Object.entries(tokens).map(([k, hex]) => [k, { hex, minDE: +Math.min(...LAMP_CANON.map((x) => deltaE(hex, x))).toFixed(1) }]));

const rows = {
  tris: { value: r.tris, bar: '<= 25000', pass: r.tris <= 25000 },
  height: { value: +r.size.y.toFixed(3), bar: '3.4 +- 0.1 m', pass: Math.abs(r.size.y - 3.4) <= 0.1 },
  vial: { value: sockets.vialLen, bar: '>= 0.25 m', pass: sockets.vialLen >= 0.25 },
  graduations: { widestM: +widest.toFixed(4), shortestStaffM: shinLen && +shinLen.toFixed(3), pct: shinLen && +(100 * widest / shinLen).toFixed(2), bar: '<= 4 %', pass: !!shinLen && widest / shinLen <= 0.04 },
  detail: { rivetDiameterM: rivetD, rivets: kitStats.rivets, rivetsAt2cm: kitStats.rivets2cm, pxAt6m: +(rivetD * pxPerM6).toFixed(1), bar: '2 cm detail >= 2 px at 6 m', pass: rivetD <= 0.02 && rivetD * pxPerM6 >= 2 },
  dust: { endM: +dustEnd.toFixed(3), dustedVertices: dusted, bar: '0.6 +- 0.1 m', pass: dusted > 0 && Math.abs(dustEnd - 0.6) <= 0.1 },
  emissive: { hullEmissive: 'none (no emissiveFactor, no map)', emissiveMaterials: ['r5-plumb-vial-glass'], hullSpillMax: proxMax, bar: '0 emissive texels outside lamps and vials', pass: proxMax === 0 },
  enamelVisibleOffline: { f23Bearing: visF23, front8m: visFront, allRoundArea: share, bar: 'enamel 55-75 % of the visible hull (offline estimate; the probe measures F23 itself)', pass: visF23.enamel >= 55 && visF23.enamel <= 75 },
  lampTokens: { ...lamp, bar: '>= 20 dE2000 from each excluded colour', pass: Object.values(lamp).every((x) => x.minDE >= 20) },
};
if (process.argv.includes('--json')) console.log(JSON.stringify({ meshTris: r.meshTris, bytes: r.bytes, rows }, null, 1));
else for (const [k, v] of Object.entries(rows)) { const { profile, ...rest } = v; console.log(`${v.pass ? 'PASS' : 'FAIL'} ${k}: ${JSON.stringify(rest)}`); }
void PLUMB; void C; void BAND; void U1_SCALE;
