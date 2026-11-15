#!/usr/bin/env node
/**
 * CALIMA — BUILD M1.4d, the browser-free half of the Peg's checks (Node only, no Chrome).
 *
 *   node tools/build/instruments/peg-check.mjs [--json]
 *
 * Rebuilds the Peg from its recipe into a temporary directory (the shipped GLB is not touched), twice (determinism),
 * and measures the model the recipe writes. The rendered half (F23-peg, the swarm, the transect rule, the lane in
 * the cover mask, the lamp kill) is `tools/instruments/peg-probe-page.mjs`, run by `tools/frames/film.mjs --probe`.
 *
 *   tris          <= 25 000 (TECH §9.2 small-Instrument cap)
 *   height        the ranging pole's top 1.9 m +- 0.1 (BIBLE §7.4: "ranging pole to ~1.9")
 *   body          0.9 m +- 0.1 tall without the pole; length 1.1 m +- 0.15; width <= 0.8 m
 *   lamp          off the canister's axis (|x| >= 0.1 m: a centred lens on the round cap read as a camera lens and an eye)
 *   enamel        the enamel share of the hull's surface area (white enamel is the dominant hull colour, BIBLE §7.2)
 *   emissive      no emissive material at all (the lamp system draws the lamp)
 *   bones         <= 20 (small class cap)
 *   deterministic two builds write the same bytes
 */
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { build } from './gen-peg.mjs';
import { SURF_OF, ATLAS, decalAtlasBytes } from './parts/kit.mjs';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'peg-check-'));
let r, h1, h2, gltf;
try {
  r = await build({ out: tmp, file: path.join(tmp, 'peg.glb') });
  const b1 = readFileSync(path.join(tmp, 'peg.glb'));
  h1 = createHash('sha256').update(b1).digest('hex');
  await build({ out: tmp, file: path.join(tmp, 'peg2.glb') });
  h2 = createHash('sha256').update(readFileSync(path.join(tmp, 'peg2.glb'))).digest('hex');
  gltf = JSON.parse(b1.subarray(20, 20 + b1.readUInt32LE(12)).toString());
} finally { rmSync(tmp, { recursive: true, force: true }); }

const { hullAll, rack, sockets } = r._buckets;
// the enamel share by area: triangles whose palette slot is glaze and whose tone is the enamel white
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
// plumb-check.mjs's classifier: a glaze triangle is enamel unless the decal atlas or its vertex colour makes it ink
// (the vermilion peg caps, the survey band's vermilion half, engraved numerals)
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
  const r0 = b.col[i * 3] * t[0], g0 = b.col[i * 3 + 1] * t[1];
  return !(r0 > 2.2 * g0 && r0 > 0.05) && t[0] + t[1] + t[2] >= 0.6;
};
const [eh, ah] = area(hullAll, isEnamel), [er, ar] = area(rack, isEnamel);
const emissive = (gltf.materials || []).filter((m) => m.emissiveFactor && m.emissiveFactor.some((v) => v > 0) || m.emissiveTexture).map((m) => m.name);

const rows = [
  { id: 'tris', bar: '<= 25000', v: r.tris, pass: r.tris <= 25000 },
  { id: 'height', bar: '1.9 +- 0.1 m', v: r.size.y, pass: Math.abs(r.size.y - 1.9) <= 0.1 },
  { id: 'body-height', bar: '0.9 +- 0.1 m', v: r.body.y, pass: Math.abs(r.body.y - 0.9) <= 0.1 },
  { id: 'body-length', bar: '1.1 +- 0.15 m', v: r.body.z, pass: Math.abs(r.body.z - 1.1) <= 0.15 },
  { id: 'body-width', bar: '<= 0.8 m', v: r.body.x, pass: r.body.x <= 0.8 },
  { id: 'lamp-off-axis', bar: '|x| >= 0.10 m', v: sockets.lamp[0], pass: Math.abs(sockets.lamp[0]) >= 0.1 },
  { id: 'lamp-height', bar: '>= 0.75 m (clear of crouch-height grass)', v: sockets.lamp[1], pass: sockets.lamp[1] >= 0.75 },
  { id: 'enamel-share', bar: '>= 40 % of hull + rack area (white enamel dominant)', v: +(100 * (eh + er) / (ah + ar)).toFixed(1), pass: (eh + er) / (ah + ar) >= 0.4 },
  { id: 'emissive', bar: 'no emissive material', v: emissive, pass: emissive.length === 0 },
  { id: 'bones', bar: '<= 20', v: r.bones, pass: r.bones <= 20 },
  { id: 'deterministic', bar: 'two builds, same bytes', v: h1 === h2 ? h1.slice(0, 16) : `${h1.slice(0, 12)} != ${h2.slice(0, 12)}`, pass: h1 === h2 },
];
const out = { kind: 'peg', size: r.size, body: r.body, tris: r.tris, sockets, rows, pass: rows.every((x) => x.pass) };
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  for (const x of rows) console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.id.padEnd(14)} ${JSON.stringify(x.v).padEnd(22)} bar ${x.bar}`);
  console.log(`${rows.filter((x) => x.pass).length}/${rows.length} ${out.pass ? 'PASS' : 'FAIL'}`);
}
