#!/usr/bin/env node
/**
 * CALIMA — the wave 1 BLOCKOUT generator (M2 briefs §3.4: grey boxes, no art; area C). Original work: no third-party
 * asset is read.
 *
 *   node tools/build/instruments/gen-blockout.mjs [--out <dir>]
 *     -> public/models/instruments/tiller-blockout.glb  the Tiller's default form (#3: 4.5 x 1.8 x 2.7 m, IN0's skirt)
 *
 * M2 wave 2: the Screed's and the Sickle's GLBs are their art now (gen-screed.mjs, gen-sickle.mjs); this recipe
 * builds only the grey Tiller kept for the line-up's record. `--grey <dir>` still writes the grey Screed and Sickle
 * there (never into public/), for a side-by-side with the wave 1 silhouettes.
 *
 * Every part is read from src/instruments/lib/blockout.js (one source with IN0 and the sight occluders): a box is a
 * bevelled box, a cylinder a 16-sided strut, a leg a strut from its hip on the hull to its foot pad. One grey for the
 * hull, a darker grey for joints and legs, a dark lamp face under the lamp system's iris (drawn in the state's colour),
 * a vial's glass pale. No rig: a blockout stands (its rules run in Node, tools/instruments/screed-rules.test.mjs).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V, strut, rbox } from '../lib/hs.mjs';
import { KBucket, writeInstrument } from './parts/kit.mjs';
import { FORMS, partsOf, boundsOf } from '../../../src/instruments/lib/blockout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const LANE = 'instruments';
export const RECIPE = 'tools/build/instruments/gen-blockout.mjs';
export const OUTPUTS = ['public/models/instruments/tiller-blockout.glb'];

const GREY = 0xa9a7a2, JOINT = 0x6d6c69, GLASS = 0xd6f0ee, LAMP_FACE = 0x3a3936;

function cylAlong(bucket, p, opts) {
  const [x, y, z] = p.c, h = p.h / 2;
  const a = p.axis === 'x' ? V(x - h, y, z) : p.axis === 'z' ? V(x, y, z - h) : V(x, y - h, z);
  const b = p.axis === 'x' ? V(x + h, y, z) : p.axis === 'z' ? V(x, y, z + h) : V(x, y + h, z);
  strut(bucket, a, b, p.r, p.r, { sides: 16, ...opts });
}

async function one(kind, file, formId) {
  const hull = new KBucket(`${kind}-hull`);
  let lampAt = null, lampR = 0.2;
  for (const p of partsOf(kind, formId)) {
    if (p.lamp) {
      // the lamp is the lamp system's iris at this anchor (drawn in the state's colour); the housing's face is grey.
      // (An emissive sensor mesh here was drawn away from its anchor in the first film at b89be8d: no sensor mesh.)
      // the face sits just behind the iris (in the film at cb501fb the face's own depth hid the iris at its centre)
      lampAt = p.c; lampR = p.r ?? Math.min(p.s[0], p.s[1]) / 2;
      const back = { ...p, c: [p.c[0], p.c[1], p.c[2] - 0.06] };
      if (p.type === 'box') rbox(hull, V(...back.c), p.s, 0.01, { surf: 'graphite', tone: LAMP_FACE, segs: 1 });
      else cylAlong(hull, back, { surf: 'graphite', tone: LAMP_FACE });
      continue;
    }
    const opts = { surf: p.vial ? 'glaze' : p.blade ? 'bronze' : 'bisque', tone: p.vial ? GLASS : (p.type === 'cyl' && p.r < 0.15) ? JOINT : GREY };
    if (p.type === 'box') rbox(hull, V(...p.c), p.s, Math.min(0.04, Math.min(...p.s) / 4), { ...opts, segs: 1 });
    else cylAlong(hull, p, opts);
  }
  // legs: hip on the hull's underside to the foot pad; a pad on the ground
  const L = FORMS[kind].legs;
  for (const f of L.feet) {
    const sx = Math.sign(f.x) || 1;
    const hip = V(sx * L.hipX, L.hipY, f.z + (L.rakedBack ? 0.35 : 0));
    const knee = V(sx * L.knee[0], L.knee[1], f.z + (L.rakedBack ? 0.05 : 0));
    const foot = V(f.x, 0.08, f.z);
    const r = kind === 'screed' ? 0.16 : kind === 'sickle' ? 0.06 : 0.07;
    strut(hull, hip, knee, r, r * 0.9, { surf: 'graphite', tone: JOINT, sides: 10 });
    strut(hull, knee, foot, r * 0.9, r * 0.75, { surf: 'graphite', tone: JOINT, sides: 10 });
    strut(hull, V(f.x, 0, f.z), V(f.x, 0.08, f.z), r * 2.2, r * 2.2, { surf: 'rubber', tone: JOINT, sides: 12 });
  }
  const b = boundsOf(kind, formId);
  const stats = await writeInstrument([
    { bucket: hull, role: 'hull', material: { name: `r5-${kind}-blockout` } },
  ], {
    file,
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Size: b.size.map((v) => +v.toFixed(4)),
      r5Blockout: { kind, form: formId || null, wave: 'M2 wave 1', lamp: lampAt, lampR },
      r5Generator: { name: RECIPE, design: `${kind}-blockout`, licence: 'original work (generated), no third-party assets' },
    },
  });
  return { kind, file: path.relative(ROOT, file), bytes: stats.bytes, tris: stats.tris, size: b.size.map((v) => +v.toFixed(3)) };
}

export async function build({ out = ROOT, grey = null } = {}) {
  const r = [await one('tiller', path.join(out, OUTPUTS[0]), FORMS.tiller.chosen)];
  if (grey) {
    if (path.resolve(grey).startsWith(path.join(ROOT, 'public'))) throw new Error('--grey writes outside public/');
    r.push(await one('screed', path.join(grey, 'screed-grey.glb')), await one('sickle', path.join(grey, 'sickle-grey.glb')));
  }
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out'), g = process.argv.indexOf('--grey');
  console.log(JSON.stringify(await build({ out: i >= 0 ? path.resolve(process.argv[i + 1]) : ROOT, grey: g >= 0 ? path.resolve(process.argv[g + 1]) : null })));
}
