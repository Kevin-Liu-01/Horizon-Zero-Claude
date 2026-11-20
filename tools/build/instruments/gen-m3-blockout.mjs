#!/usr/bin/env node
/**
 * CALIMA — the M3 wave 1 GREY HULLS (area C: the Kiln, the Spindle, the Davit and the Sonde; M3 briefs §3.4 "grey
 * hulls", §6). Original work: no third-party asset is read.
 *
 *   node tools/build/instruments/gen-m3-blockout.mjs --out <dir outside the repo> [--only kiln,sonde]
 *     -> <dir>/<kind>-grey.glb, one per kind, and a JSON line per kind (bytes, triangles, size)
 *
 * Wave 1 ships nothing: the four kinds are not registered (src/instruments/registry.js finds kinds/*.js only; these
 * live in kinds/<kind>/), so no GLB goes into public/ and nothing enters the first load. This recipe writes the grey
 * hulls OUTSIDE the repo, for the art wave to start from and for the triangle count of IK1; it refuses public/ and
 * the tree. The line-up page (tools/gates/instruments/m3/lineup.html) builds the same parts in the browser.
 *
 * Every part is read from the kinds' form modules through tools/gates/instruments/m3/forms.mjs (one source): a box is
 * a bevelled box, a cylinder a 16-sided strut on its axis (a frustum where it has r2), a strut a 10-sided bar, a torus
 * its 28 struts. One grey for the hull, darker for joints, brass-grey for trim, a dark face under the lamp, pale ice
 * for a vial. The firebox door is the dark face's grey (never emissive at blockout).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { V, strut, rbox } from '../lib/hs.mjs';
import { KBucket, writeInstrument } from './parts/kit.mjs';
import { M3_FORMS, M3_KINDS, expandParts, boundsOf } from '../../gates/instruments/m3/forms.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const LANE = 'instruments';
export const RECIPE = 'tools/build/instruments/gen-m3-blockout.mjs';
/** Nothing in public/ (wave 1 ships no asset). */
export const OUTPUTS = [];
/** Build evidence, not content (the build driver runs it only with an explicit --out, never into the repository). */
export const PROOF = true;

export const GREY = Object.freeze({ hull: 0xa9a7a2, joint: 0x6d6c69, brass: 0x8f8a7a, dark: 0x3a3936, glass: 0xd6f0ee });

const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** The tone and surface of a part (the page uses the same table). */
export function toneOf(p) {
  if (p.lamp || p.dark) return { tone: GREY.dark, surf: 'graphite' };
  if (p.vial) return { tone: GREY.glass, surf: 'glaze' };
  if (p.tone === 'joint') return { tone: GREY.joint, surf: 'graphite' };
  if (p.tone === 'brass') return { tone: GREY.brass, surf: 'bronze' };
  return { tone: GREY.hull, surf: 'bisque' };
}

function cylinder(bucket, p, opts) {
  const a = AX[p.axis || 'y'], h = p.h / 2;
  const A = V(p.c[0] - a[0] * h, p.c[1] - a[1] * h, p.c[2] - a[2] * h), B = V(p.c[0] + a[0] * h, p.c[1] + a[1] * h, p.c[2] + a[2] * h);
  strut(bucket, A, B, p.r, p.r2 ?? p.r, { sides: 16, ...opts });
}

async function one(kind, out) {
  const F = M3_FORMS[kind];
  const hull = new KBucket(`${kind}-grey`);
  let lamp = null;
  for (const p of expandParts(F.parts)) {
    const opts = toneOf(p);
    if (p.lamp) lamp = { at: p.c, r: p.r };
    if (p.type === 'box') rbox(hull, V(...p.c), p.s, Math.min(0.03, Math.min(...p.s) / 4), { ...opts, segs: 1 });
    else if (p.type === 'cyl') cylinder(hull, p, opts);
    else if (p.type === 'strut') strut(hull, V(...p.a), V(...p.b), p.r, p.r, { sides: 10, ...opts });
  }
  const b = boundsOf(F.parts);
  const file = path.join(out, `${kind}-grey.glb`);
  const stats = await writeInstrument([{ bucket: hull, role: 'hull', material: { name: `r5-${kind}-grey` } }], {
    file,
    provenance: { recipe: RECIPE, sources: [], licence: 'project-original' },
    extras: {
      r5Size: b.size.map((v) => +v.toFixed(4)),
      r5Blockout: { kind, wave: 'M3 wave 1', lamp: lamp?.at ?? null, lampR: lamp?.r ?? null },
      r5Generator: { name: RECIPE, design: `${kind}-grey`, licence: 'original work (generated), no third-party assets' },
    },
  });
  return { kind, file, bytes: stats.bytes, tris: stats.tris, size: b.size.map((v) => +v.toFixed(3)) };
}

export async function build({ out, only = null } = {}) {
  if (!out) throw new Error('--out <dir outside the repo> is required (wave 1 ships no asset)');
  const abs = path.resolve(out);
  if (abs === ROOT || abs.startsWith(ROOT + path.sep)) throw new Error(`--out must be outside the repo (${ROOT})`);
  const r = [];
  for (const k of M3_KINDS) if (!only || only.includes(k)) r.push(await one(k, abs));
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out'), o = process.argv.indexOf('--only');
  const rows = await build({ out: i >= 0 ? process.argv[i + 1] : null, only: o >= 0 ? process.argv[o + 1].split(',') : null });
  for (const row of rows) console.log(JSON.stringify(row));
}
