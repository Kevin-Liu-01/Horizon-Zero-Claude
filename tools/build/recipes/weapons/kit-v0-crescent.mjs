/**
 * CALIMA — patch: the archer's crescent bracer's bronze crescent, taller
 * (hero-body W0b fix round 3; bible §3.2 cue 3, gate V-brea-one-glance).
 *
 *   node tools/build/recipes/weapons/kit-v0-crescent.mjs [--check]
 *
 * The judge read the crescent at 64 px black fill as "a 1-2 px nub on the
 * front view only": its horns stood 7.2 cm proud of the leather, 2.5 px at the
 * sheet's 2.8 cm/px. `kit-v0.mjs` now authors the fin `CRESCENT_K` (1.5x)
 * taller — horns 10.8 cm, belly 3.8 cm proud — but that recipe needs the UBC
 * sources (`models-staging/r5-src/`), which are not on this machine. This
 * script applies exactly the same change to the SHIPPED GLBs, in place, so the
 * assets and the recipe agree:
 *
 *   public/models/hero/kit/stowkit-v0.glb          the bracer piece (`_PIECE` 8)
 *   public/models/hero/kit/bracer-crescent-v0.glb  the standalone bracer
 *
 * The crescent's vertices are the bracer's vertices in the atlas `bronze` cell
 * (`cell('bronze')`; the leather is the `leather` cell). The forearm axis is
 * the leather's principal axis; the dorsal direction is the crescent's
 * centroid off that axis. Each crescent vertex's height along the dorsal
 * direction above the fin's own base row is scaled by `CRESCENT_K` — the base
 * row stays on the leather, the span along the forearm, the thickness and the
 * triangle count are unchanged. Positions are edited in the accessor's own
 * (quantised, uniformly scaled) space through gltf-transform's normalised
 * element accessors; nothing else in the file is touched. Idempotent: the
 * applied factor is recorded in `asset.extras.patches` and a second run is a
 * no-op. `--check` reports without writing.
 */
import path from 'node:path';
import { io, ROOT } from '../lib/face.mjs';
import { cell, CRESCENT_K } from './kit-v0.mjs';

const FILES = [
  ['public/models/hero/kit/stowkit-v0.glb', 8],
  ['public/models/hero/kit/bracer-crescent-v0.glb', null],
];
const PATCH = 'crescent-k';
const check = process.argv.includes('--check');

const inRect = (u, v, r, tol = 0.004) => u >= r[0] - tol && u <= r[0] + r[2] + tol && v >= r[1] - tol && v <= r[1] + r[3] + tol;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Principal axis of a point set (power iteration on the covariance). */
function principal(pts) {
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c[0] /= pts.length; c[1] /= pts.length; c[2] /= pts.length;
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) { const d = sub(p, c); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += d[i] * d[j]; }
  let v = [1, 0.3, 0.2];
  for (let it = 0; it < 64; it++) v = norm([dot(M[0], v), dot(M[1], v), dot(M[2], v)]);
  return { c, axis: v };
}

const rect = cell('bronze');
const doc0 = await io();
const out = [];
for (const [rel, bit] of FILES) {
  const file = path.join(ROOT, rel);
  const doc = await doc0.read(file);
  const asset = doc.getRoot().getAsset();
  const patches = asset.extras?.patches || [];
  const done = patches.find((p) => p.id === PATCH);
  if (done) { out.push({ file: rel, skipped: 'already patched', k: done.k }); continue; }
  let moved = 0, info = null;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), UV = prim.getAttribute('TEXCOORD_0');
      const PC = bit ? (prim.getAttribute('_PIECE') || prim.getAttribute('_piece')) : null;
      if (!P || !UV || (bit && !PC)) continue;
      const n = P.getCount(), e = [], u = [], pc = [];
      const cres = [], leather = [];
      for (let i = 0; i < n; i++) {
        if (bit && Math.round(PC.getElement(i, pc)[0]) !== bit) continue;
        UV.getElement(i, u);
        (inRect(u[0], u[1], rect) ? cres : leather).push(i);
      }
      if (!cres.length || leather.length < 8) continue;
      const pos = (i) => P.getElement(i, e).slice(0, 3);
      const L = leather.map(pos), Cp = cres.map(pos);
      const { c, axis } = principal(L);
      const cc = Cp.reduce((s, p) => [s[0] + p[0] / Cp.length, s[1] + p[1] / Cp.length, s[2] + p[2] / Cp.length], [0, 0, 0]);
      const off = sub(cc, c);
      const Y = norm(sub(off, axis.map((a) => a * dot(off, axis))));
      const hs = Cp.map((p) => dot(sub(p, c), Y));
      const h0 = Math.min(...hs), h1 = Math.max(...hs);
      for (let k = 0; k < cres.length; k++) {
        const d = (hs[k] - h0) * (CRESCENT_K - 1);
        const p = Cp[k];
        if (!check) P.setElement(cres[k], [p[0] + Y[0] * d, p[1] + Y[1] * d, p[2] + Y[2] * d]);
        moved++;
      }
      // the accessor's own space -> metres: the node's (uniform) scale
      const node = doc.getRoot().listNodes().find((nd) => nd.getMesh() === mesh);
      const sc = node ? node.getScale() : [1, 1, 1];
      info = { crescentVerts: cres.length, leatherVerts: leather.length, finHeightM: +((h1 - h0) * sc[0]).toFixed(4),
        finHeightAfterM: +((h1 - h0) * CRESCENT_K * sc[0]).toFixed(4), nodeScale: sc.map((x) => +x.toFixed(5)) };
    }
  }
  if (!moved) { out.push({ file: rel, error: 'no crescent vertices found' }); continue; }
  if (!check) {
    asset.extras = { ...(asset.extras || {}), patches: [...patches, { id: PATCH, k: CRESCENT_K, by: 'tools/build/recipes/weapons/kit-v0-crescent.mjs', why: 'V-brea-one-glance cue 3 at 64 px (fix round 3)' }] };
    const bytes = await doc0.writeBinary(doc);
    (await import('node:fs')).writeFileSync(file, bytes);
    out.push({ file: rel, moved, bytes: bytes.byteLength, ...info });
  } else out.push({ file: rel, moved, check: true, ...info });
}
console.log(JSON.stringify(out, null, 1));
