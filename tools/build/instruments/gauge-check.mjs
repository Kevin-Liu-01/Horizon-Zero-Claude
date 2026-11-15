#!/usr/bin/env node
/**
 * CALIMA — BUILD M1.4e, the browser-free half of the Gauge's checks (Node only, no Chrome).
 *
 *   node tools/build/instruments/gauge-check.mjs [--json]
 *
 * Rebuilds the Gauge from its recipe into a temporary directory (the shipped GLB is not touched), twice (determinism),
 * and measures the model the recipe writes. The rendered half (F23-gauge, the scripted wrong tide, the clock, the wade,
 * the mast from Saltrow's ramp, the Sighting card) is `tools/instruments/gauge-probe-page.mjs`, run by
 * `tools/frames/film.mjs --probe`.
 *
 *   tris          <= 50 000 (TECH §9.2 medium-Instrument cap), LOD1 <= 40 % of the hull
 *   height        the finial's spike 5.5 m +- 0.1 (BUILD M1.4e)
 *   footprint     3.2 x 2.6 m +- 0.15 (BIBLE §7.4 #4)
 *   wade          the knee seals and the drum's keel above WADE_MAX (1.2 m) with room: it wades to 1.2 m dry
 *   lamp          off the drum's axis and on the drum (no neck), on its shoulder: at or above the rim, not mid-wall
 *   enamel        the enamel share of the hull's surface area (white enamel is the dominant hull colour, BIBLE §7.2)
 *   emissive      one emissive material, the lantern glass, no bluer or brighter than #D6F0EE
 *   bones         <= 30
 *   deterministic two builds write the same bytes
 */
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { build } from './gen-gauge.mjs';
import { SURF_OF, ATLAS, decalAtlasBytes, C, THREE } from './parts/kit.mjs';

const WADE_MAX = 1.2;
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gauge-check-'));
let r, h1, h2, gltf;
try {
  r = await build({ out: tmp, file: path.join(tmp, 'gauge.glb') });
  const b1 = readFileSync(path.join(tmp, 'gauge.glb'));
  h1 = createHash('sha256').update(b1).digest('hex');
  await build({ out: tmp, file: path.join(tmp, 'gauge2.glb') });
  h2 = createHash('sha256').update(readFileSync(path.join(tmp, 'gauge2.glb'))).digest('hex');
  gltf = JSON.parse(b1.subarray(20, 20 + b1.readUInt32LE(12)).toString());
} finally { rmSync(tmp, { recursive: true, force: true }); }

const { hullAll, float, gate, sockets } = r._buckets;
const area = (b, pred) => {
  let a = 0, all = 0;
  for (let t = 0; t < b.pos.length / 9; t++) {
    const p = (k) => [b.pos[(t * 3 + k) * 3], b.pos[(t * 3 + k) * 3 + 1], b.pos[(t * 3 + k) * 3 + 2]];
    const [A, B, D] = [p(0), p(1), p(2)];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [D[0] - A[0], D[1] - A[1], D[2] - A[2]];
    const s = 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    all += s;
    if (pred(b, t * 3)) a += s;
  }
  return [a, all];
};
// peg-check.mjs's classifier: a glaze triangle is enamel unless the decal atlas or its vertex colour makes it ink, and
// the celadon waterline band (a glaze accent, not enamel) is excluded by its hue
const atlas = decalAtlasBytes();
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const texel = (u1, v1) => {
  const u = ((u1 % 1) + 1) % 1, v = Math.min(0.999, Math.max(0, v1));
  const o = (Math.floor(v * ATLAS) * ATLAS + Math.floor(u * ATLAS)) * 4;
  return [lin(atlas[o]), lin(atlas[o + 1]), lin(atlas[o + 2])];
};
const isEnamel = (b, i) => {
  if (Math.floor(b.uv[i * 2] * 8) !== SURF_OF.glaze) return false;
  const t = texel(b.uv1[i * 2], b.uv1[i * 2 + 1]);
  const r0 = b.col[i * 3] * t[0], g0 = b.col[i * 3 + 1] * t[1], b0 = b.col[i * 3 + 2] * t[2];
  if (g0 > r0 * 1.08 && g0 > b0) return false;   // celadon
  return !(r0 > 2.2 * g0 && r0 > 0.05) && t[0] + t[1] + t[2] >= 0.6;
};
const [eh, ah] = area(hullAll, isEnamel), [ef, af] = area(float, isEnamel), [eg, ag] = area(gate, isEnamel);
const enamel = (eh + ef + eg) / (ah + af + ag);
const emissive = (gltf.materials || []).filter((m) => (m.emissiveFactor && m.emissiveFactor.some((v) => v > 0)) || m.emissiveTexture);
const ice = new THREE.Color(C.ICE);
const iceOk = emissive.length === 1 && /lantern/.test(emissive[0].name) && emissive[0].emissiveFactor.every((v, i) => v <= [ice.r, ice.g, ice.b][i] + 1e-4);
const hullTris = r.meshTris['gauge-hull'], lodTris = r.meshTris['gauge-lod1'];
const kneeMin = Math.min(...sockets.knees.map((k) => k[1] - 0.06));   // the seal collar's lower brass ring

const rows = [
  { id: 'tris', bar: '<= 50000 (medium cap)', v: r.tris, pass: r.tris <= 50000 },
  { id: 'lod1', bar: '<= 40 % of the hull', v: +(100 * lodTris / hullTris).toFixed(1), pass: lodTris <= 0.4 * hullTris },
  { id: 'height', bar: '5.5 +- 0.1 m', v: r.size.y, pass: Math.abs(r.size.y - 5.5) <= 0.1 },
  { id: 'length', bar: '3.2 +- 0.15 m', v: r.size.z, pass: Math.abs(r.size.z - 3.2) <= 0.15 },
  { id: 'width', bar: '2.6 +- 0.15 m', v: r.size.x, pass: Math.abs(r.size.x - 2.6) <= 0.15 },
  { id: 'knee-seals', bar: `lowest seal >= ${WADE_MAX} + 0.15 m`, v: +kneeMin.toFixed(3), pass: kneeMin >= WADE_MAX + 0.15 },
  { id: 'keel', bar: `drum keel >= ${WADE_MAX} + 0.6 m`, v: sockets.drumBottom, pass: sockets.drumBottom >= WADE_MAX + 0.6 },
  { id: 'lamp-off-axis', bar: '|x| >= 0.2 m, on the drum (z within its radius + 0.25)', v: sockets.lamp, pass: Math.abs(sockets.lamp[0]) >= 0.2 && Math.abs(sockets.lamp[2]) <= 0.82 + 0.25 },
  { id: 'lamp-shoulder', bar: 'lamp centre at or above the drum rim - 0.05 m (the shoulder, not mid-wall)', v: +(sockets.lamp[1] - (sockets.waterline + 0.8)).toFixed(3), pass: sockets.lamp[1] >= sockets.waterline + 0.8 - 0.05 },
  { id: 'enamel-share', bar: '>= 40 % of hull + tools area (white enamel dominant)', v: +(100 * enamel).toFixed(1), pass: enamel >= 0.4 },
  { id: 'emissive', bar: 'one emissive material, the lantern glass, <= #D6F0EE', v: emissive.map((m) => `${m.name} ${m.emissiveFactor.map((x) => x.toFixed(3)).join(',')}`), pass: iceOk },
  { id: 'bones', bar: '<= 30', v: r.bones, pass: r.bones <= 30 },
  { id: 'deterministic', bar: 'two builds, same bytes', v: h1 === h2 ? h1.slice(0, 16) : `${h1.slice(0, 12)} != ${h2.slice(0, 12)}`, pass: h1 === h2 },
];
const out = { kind: 'gauge', size: r.size, tris: r.tris, meshTris: r.meshTris, sockets, rows, pass: rows.every((x) => x.pass) };
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  for (const x of rows) console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.id.padEnd(14)} ${JSON.stringify(x.v).padEnd(40)} bar ${x.bar}`);
  console.log(`${rows.filter((x) => x.pass).length}/${rows.length} ${out.pass ? 'PASS' : 'FAIL'}`);
}
