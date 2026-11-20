// M3 wave 2b, area C: the last two seams of the M3 brief §3.2 committed typed and EMPTY (as wave 1's were): props in the
// hands' `heldNet` (src/hero/sockets.js, hero-anim's) and fauna (src/world/fauna/index.js, world's). Empty means: nothing
// to hold and no animal, so nothing on the page changes; typed means: the slot and the calls exist for their owners to
// fill. And §3.2's one "never": Instruments ignore animals (nothing under src/instruments/ imports the fauna seam).
// Browser-free: node --test tools/gates/instruments/m3/seams.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOCKETS } from '../../../../src/hero/sockets.js';
import * as FAUNA from '../../../../src/world/fauna/index.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

test('props in the hands: heldNet is a slot beside kiteBar, typed and empty (no socket until hero-anim and area D fill it)', () => {
  assert.ok(SOCKETS.kiteBar?.gripL && SOCKETS.kiteBar?.gripR, 'kiteBar (area B) is there');
  assert.ok('heldNet' in SOCKETS, 'heldNet slot');
  assert.ok(Object.isFrozen(SOCKETS.heldNet));
  assert.deepEqual(Object.keys(SOCKETS.heldNet), [], 'empty: the net is not built');
  const src = readFileSync(path.join(REPO, 'src/hero/sockets.js'), 'utf8');
  assert.match(src, /@type \{Readonly<\{[\s\S]*grip\?[\s\S]*keeperAxis\?[\s\S]*\}>\}\s*\*\/\s*heldNet:/, 'heldNet carries its type');
});

test('fauna: species, a spawn per region, one shared mover, scare(point); typed and empty', () => {
  assert.deepEqual([...FAUNA.SPECIES], []);
  assert.ok(Object.isFrozen(FAUNA.SPECIES));
  for (const r of ['pans', 'holds', 'malpais', 'cloudline', 'flank', 'caldera']) assert.deepEqual([...FAUNA.spawnsFor(r)], [], r);
  assert.deepEqual([...FAUNA.MOVER.animals], []);
  for (const f of ['step', 'enter', 'leave']) assert.equal(typeof FAUNA.MOVER[f], 'function', f);
  assert.doesNotThrow(() => { FAUNA.MOVER.step(1 / 60); FAUNA.MOVER.enter('malpais'); FAUNA.MOVER.leave('malpais'); });
  assert.equal(FAUNA.scare({ x: 0, z: 0 }, 30), 0, 'no animal to scare');
  const src = readFileSync(path.join(REPO, 'src/world/fauna/index.js'), 'utf8');
  for (const t of ['@typedef {object} Species', '@typedef {object} Spawn', '@typedef {object} Animal', '@typedef {object} FaunaMover']) assert.ok(src.includes(t), t);
});

test('§3.2: Instruments ignore animals: no file under src/instruments/ imports the fauna seam', () => {
  const hits = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(m?js)$/.test(n) && /world\/fauna/.test(readFileSync(p, 'utf8'))) hits.push(path.relative(REPO, p));
    }
  };
  walk(path.join(REPO, 'src/instruments'));
  assert.deepEqual(hits, []);
});
