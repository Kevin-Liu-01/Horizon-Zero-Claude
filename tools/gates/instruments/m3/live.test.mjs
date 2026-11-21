/**
 * M3 wave 3c, area C: the live kinds' pure halves in Node. The page row is ./live-kinds.mjs (Chrome).
 *   files    the three live GLBs the kinds fetch on demand ship in public/ and are the shipped ledger's deferred rows
 *   fire     the fire behind the sprung door glows within base +-flicker and is dark while the door is shut
 *   davit    the cab lantern: upright (a lantern, not a disc on the cab's face), off the centre line, set back from the
 *            cab's face and at or under 0.6 of the height (measure.mjs's lens rule)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { M3_LIVE_FILES, M3_LIVE_URLS } from '../../../../src/instruments/kinds/kiln/files.js';
import { fireFlicker, FIRE_GLOW } from '../../../../src/instruments/kinds/kiln/fire.js';
import { DAVIT_PARTS, DAVIT_LAMP, DAVIT_ROSTER } from '../../../../src/instruments/kinds/davit/form.js';
import { loadBudgets, deferredFiles } from '../../../tier0/budgets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

test('live files: shipped, and deferred by the ledger (IK11: not in the first load)', async () => {
  assert.deepEqual(Object.keys(M3_LIVE_URLS).sort(), ['davit', 'kiln', 'sonde']);
  for (const f of M3_LIVE_FILES) assert.ok(fs.existsSync(path.join(ROOT, 'public', f)), f);
  const D = await deferredFiles(ROOT, loadBudgets(ROOT).shipped.deferred);
  for (const f of M3_LIVE_FILES) assert.equal(D.when.get(`public/${f}`), 'control', f);
});

test('fire: lit only with the door open, within its flicker band', () => {
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < 30; t += 1 / 60) { const g = fireFlicker(t, 1, 3); lo = Math.min(lo, g); hi = Math.max(hi, g); }
  assert.ok(lo >= FIRE_GLOW.base * (1 - FIRE_GLOW.flicker) - 1e-9 && hi <= FIRE_GLOW.base * (1 + FIRE_GLOW.flicker) + 1e-9, `${lo} ${hi}`);
  assert.ok(hi - lo > FIRE_GLOW.base * FIRE_GLOW.flicker, 'it flickers');
  assert.equal(fireFlicker(5, 0), 0);
});

test('davit: the cab lantern is upright, off the centre line, set back from the cab face, under 0.6 of the height', () => {
  const lamp = DAVIT_PARTS.find((p) => p.lamp), cab = DAVIT_PARTS.find((p) => p.name === 'cab');
  assert.equal(lamp.axis, 'y');
  assert.equal(DAVIT_LAMP.shape, 'lantern');
  assert.ok(Math.abs(lamp.c[0]) >= 0.1);
  assert.ok(lamp.c[2] + lamp.r <= cab.c[2] + cab.s[2] / 2 - 0.1, 'set back from the cab face');
  assert.ok(lamp.c[1] - lamp.h / 2 >= cab.c[1] + cab.s[1] / 2 - 1e-6, 'above the cab roof, not on its face');
  assert.ok(lamp.c[1] / DAVIT_ROSTER.H <= 0.6);
  assert.ok(!DAVIT_PARTS.some((p) => p.type === 'cyl' && p.axis === 'z' && /lamp/.test(p.name)), 'no lamp disc faces the lens');
});
