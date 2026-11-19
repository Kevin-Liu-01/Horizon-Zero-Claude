#!/usr/bin/env node
/**
 * IN0, area C's geometry check at blockout (M2 briefs §6 row 0), browser-free:
 *   node tools/instruments/in0-geometry.mjs [--json]
 *
 * 1. THE TILLER'S SIGHT SHADOW from a terrace Plumb's lamp. The Plumb's eye is its lamp, 2.5 m over its feet
 *    (plumb.js eyeHeight), standing Ht m above the herd's ground at D m. A hull stands broadside to it (and at 45 deg);
 *    Brea walks along the hull's lee side, s m off its flank. At each step of her walk the segments from the eye to her
 *    figure are tested against the hull's blockout shapes with the game's own ray test (src/instruments/lib/sight.js).
 *    "Shadow width" is the length of her walk over which she is hidden:
 *      ray  - the game's line-of-sight ray (perception.js hasLOS: her position + targetEyeY 1.2 m, crouched or not)
 *      body - her whole figure (feet 0.1, knee 0.5, hip 0.95, chest 1.2, head 1.65 m standing; 0.1, 0.4, 0.6, 0.75,
 *             1.05 m crouched) every point hidden: the F38 target ("her whole figure inside the hull's shadow")
 *    for each Tiller form in src/instruments/lib/blockout.js, and the exposed length in a file's gap.
 * 2. THE SCREED'S CHARGE inside Ninewalls' wall spacing: its turning circle (blockout.js SCREED_MOVE) and whether a
 *    6.5 x 3.6 m hull can stand and run a straight 25 m charge between the outer three walls. The wall arcs come from
 *    `src/world/settlements/ninewalls-layout.js` (area B's seam) when it exists; else the run says so and uses none.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { segmentHit } from '../../src/instruments/lib/sight.js';
import { FORMS, hullShapes, SCREED_MOVE } from '../../src/instruments/lib/blockout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const JSON_OUT = process.argv.includes('--json');
const EYE = 2.5;                                   // plumb.js eyeHeight at scale 1
const RAY_Y = 1.2;                                 // ai/tables.js targetEyeY
const STAND = [0.1, 0.5, 0.95, 1.2, 1.65], CROUCH = [0.1, 0.4, 0.6, 0.75, 1.05];
const STEP = 0.05;

/** Hidden length (m) of her walk along the hull's long axis, s m off the lee flank. */
function shadow(shapes, eye, halfW, s, heights, span) {
  let hidden = 0, run = 0, best = 0;
  for (let x = -span; x <= span + 1e-9; x += STEP) {
    const bx = x, bz = halfW + s;
    let all = true;
    for (const h of heights) {
      let hit = false;
      for (const sh of shapes) if (segmentHit(sh, eye.x, eye.y, eye.z, bx, h, bz) >= 0) { hit = true; break; }
      if (!hit) { all = false; break; }
    }
    if (all) { hidden += STEP; run += STEP; if (run > best) best = run; } else run = 0;
  }
  return { hiddenM: +hidden.toFixed(2), longestM: +best.toFixed(2) };
}

function tillerTable() {
  const rows = [];
  for (const formId of Object.keys(FORMS.tiller.forms)) {
    const form = FORMS.tiller.forms[formId];
    // one hull at the origin, long axis along x (yaw pi/2), the lee side +z
    const one = hullShapes('tiller', 0, 0, Math.PI / 2, formId);
    for (const Ht of [0, 4, 8, 12]) for (const D of [15, 25, 35, 45]) for (const bearing of [0, 45]) {
      const a = (bearing * Math.PI) / 180;
      const eye = { x: -Math.sin(a) * D, y: Ht + EYE, z: -Math.cos(a) * D };
      const r = { form: formId, Ht, D, bearing };
      for (const s of [0.6, 1.2]) {
        r[`ray_s${s}`] = shadow(one, eye, form.W / 2, s, [RAY_Y], 6).longestM;
        r[`standBody_s${s}`] = shadow(one, eye, form.W / 2, s, STAND, 6).longestM;
        r[`crouchBody_s${s}`] = shadow(one, eye, form.W / 2, s, CROUCH, 6).longestM;
      }
      rows.push(r);
    }
  }
  return rows;
}

/** A file of n hulls on the x axis at the open and the closed spacing: the exposed length of her lee walk (ray, crouched body). */
function fileTable(formId, gapOpen, gapClosed) {
  const out = [];
  const L = FORMS.tiller.L, W = FORMS.tiller.forms[formId].W;   // centre spacing = the roster's 4.5 m + the clear gap (tiller-herd.js FILE)
  for (const [label, gap] of [['open', gapOpen], ['closed', gapClosed]]) for (const n of [3, 6]) {
    const shapes = [];
    for (let i = 0; i < n; i++) shapes.push(...hullShapes('tiller', -i * (L + gap), 0, Math.PI / 2, formId));
    const x0 = -(n - 1) * (L + gap) - L / 2, x1 = L / 2;
    for (const [Ht, D] of [[4, 25], [8, 35]]) {
      const eye = { x: (x0 + x1) / 2, y: Ht + EYE, z: -D };
      let exposedRay = 0, exposedBody = 0;
      for (let x = x0; x <= x1; x += STEP) {
        const vis = (h) => !shapes.some((sh) => segmentHit(sh, eye.x, eye.y, eye.z, x, h, W / 2 + 0.6) >= 0);
        if (vis(RAY_Y)) exposedRay += STEP;
        if (CROUCH.some(vis)) exposedBody += STEP;
      }
      out.push({ form: formId, file: label, gapM: gap, n, Ht, D, walkM: +(x1 - x0).toFixed(1), exposedRayM: +exposedRay.toFixed(1), exposedCrouchBodyM: +exposedBody.toFixed(1) });
    }
  }
  return out;
}

async function screedTable() {
  const p = path.join(ROOT, 'src/world/settlements/ninewalls-layout.js');
  const M = SCREED_MOVE;
  const circle = { turnRadiusM: M.turnRadius, turningCircleM: +(2 * M.turnRadius + FORMS.screed.W).toFixed(2), chargeM: M.chargeLen, hullL: FORMS.screed.L, hullW: FORMS.screed.W };
  if (!fs.existsSync(p)) return { ...circle, walls: null, note: 'src/world/settlements/ninewalls-layout.js does not exist at this tree (area B NW0): the wall-spacing clause is not measured; what the Screed needs is stated instead',
    needs: { ringSpacingForStandM: +(FORMS.screed.W + 0.6).toFixed(2), straightRunM: +(M.chargeLen + FORMS.screed.L).toFixed(2),
      note: 'to stand between two walls broadside the ring spacing must pass the hull width plus both walls\' half thickness; a 25 m straight charge needs a chord of 25 m + the hull length inside one ring band, or crossing the walls (a charge INTO a wall is the stall)' } };
  const mod = await import(pathToFileURL(p).href);
  const walls = mod.WALLS || mod.walls || mod.default?.walls || null;
  if (!Array.isArray(walls)) return { ...circle, walls: null, note: 'ninewalls-layout.js exports no wall list (WALLS)' };
  // the outer three rings: the chord a straight 25 m charge needs (hull length + 25 m) inside each ring band
  const rings = [...walls].sort((a, b) => b.r - a.r);
  const out = [];
  for (let i = 0; i < Math.min(3, rings.length - 1); i++) {
    const outer = rings[i], inner = rings[i + 1];
    const band = outer.r - inner.r - ((outer.thick || 0.6) + (inner.thick || 0.6)) / 2;
    const mid = (outer.r + inner.r) / 2;
    // the longest straight chord inside the band (tangent to the inner ring's outer face): 2 sqrt(Ro^2 - Ri^2)
    const ro = outer.r - (outer.thick || 0.6) / 2 - FORMS.screed.W / 2, ri = inner.r + (inner.thick || 0.6) / 2 + FORMS.screed.W / 2;
    const chord = ro > ri ? 2 * Math.sqrt(ro * ro - ri * ri) : 0;
    out.push({ between: [outer.id, inner.id], bandM: +band.toFixed(2), midR: +mid.toFixed(1), standsBroadside: band >= FORMS.screed.W, straightChordM: +chord.toFixed(1), charge25Fits: chord >= M.chargeLen + FORMS.screed.L });
  }
  return { ...circle, walls: walls.length, bands: out };
}

const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
const tiller = tillerTable();
const files = fileTable(FORMS.tiller.chosen, 5.0, 4.0);
const screed = await screedTable();
const summary = {};
for (const formId of Object.keys(FORMS.tiller.forms)) {
  const rs = tiller.filter((r) => r.form === formId);
  const min = (k) => Math.min(...rs.map((r) => r[k]));
  summary[formId] = { minRay_s0_6: min('ray_s0.6'), minStandBody_s0_6: min('standBody_s0.6'), minCrouchBody_s0_6: min('crouchBody_s0.6'),
    minRay_s1_2: min('ray_s1.2'), minCrouchBody_s1_2: min('crouchBody_s1.2'),
    cases: rs.length, standBodyUnder1_5: rs.filter((r) => r['standBody_s0.6'] < 1.5).length, crouchBodyUnder1_5: rs.filter((r) => r['crouchBody_s0.6'] < 1.5).length,
    rayUnder1_5: rs.filter((r) => r['ray_s0.6'] < 1.5).length,
    terrace: (() => { const t = rs.filter((r) => r.Ht > 0); return { cases: t.length, standBodyUnder1_5: t.filter((r) => r['standBody_s0.6'] < 1.5).length,
      crouchBodyUnder1_5: t.filter((r) => r['crouchBody_s0.6'] < 1.5).length, medianStandBody: med(t.map((r) => r['standBody_s0.6'])), medianCrouchBody: med(t.map((r) => r['crouchBody_s0.6'])) }; })() };
}
const out = { forms: FORMS.tiller.forms, chosen: FORMS.tiller.chosen, summary, files, screed };
if (JSON_OUT) console.log(JSON.stringify({ ...out, tiller }, null, 1));
else {
  console.log('IN0 Tiller sight shadow (m of her lee walk hidden; worst case over Ht 0-12 m, D 15-45 m, broadside and 45 deg):');
  for (const [k, v] of Object.entries(summary)) console.log(' ', k.padEnd(14), JSON.stringify(v));
  console.log('IN0 a file of 3 and 6 (chosen form):');
  for (const r of files) console.log(' ', JSON.stringify(r));
  console.log('IN0 the Screed:', JSON.stringify(screed));
}
