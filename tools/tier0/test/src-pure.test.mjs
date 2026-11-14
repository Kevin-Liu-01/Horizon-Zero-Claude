// Pure game logic from src/ that runs in Node without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deltaE, sharmaCheck } from '../../../src/instruments/lib/color.js';
import { seededRng, setAiRng, aiRandom, aiRngSeeded } from '../../../src/entities/machines/ai/rng.js';
import { Events } from '../../../src/core/events.js';
import { ITEMS, POCKETS, itemDef, itemCap } from '../../../src/items/items.js';
import { LAMP_STATES } from '../../../src/instruments/lamps.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

test('ΔE2000 matches the Sharma reference pairs', () => {
  assert.ok(sharmaCheck() < 1e-3, `worst error ${sharmaCheck()}`);
});

test('lamp tokens: calm, wary and hostile stay at least 20 ΔE2000 apart', () => {
  const lit = ['calm', 'wary', 'hostile'].map((k) => LAMP_STATES[k].token);
  for (let i = 0; i < lit.length; i++) for (let j = i + 1; j < lit.length; j++) {
    const d = deltaE(lit[i], lit[j]);
    assert.ok(d >= 20, `${lit[i]} vs ${lit[j]}: ΔE ${d.toFixed(1)}`);
  }
});

test('lamp tokens in the CSS match the lamp table', () => {
  const css = readFileSync(`${ROOT}src/style.css`, 'utf8');
  for (const k of ['calm', 'wary', 'hostile']) {
    const m = new RegExp(`--cal-lamp-${k}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    assert.ok(m, `--cal-lamp-${k} missing from src/style.css`);
    assert.equal(m[1].toUpperCase(), LAMP_STATES[k].token.toUpperCase(), k);
  }
});

test('seeded AI dice are deterministic and restorable', () => {
  const a = seededRng(42), b = seededRng(42);
  const xs = Array.from({ length: 8 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 8 }, () => b()));
  for (const x of xs) assert.ok(x >= 0 && x < 1);
  setAiRng(seededRng(7));
  assert.equal(aiRngSeeded(), true);
  const first = aiRandom();
  setAiRng(seededRng(7));
  assert.equal(aiRandom(), first);
  setAiRng(null);
  assert.equal(aiRngSeeded(), false);
});

test('event bus: on, emit, off', () => {
  const e = new Events();
  const got = [];
  const off = e.on('x', (p) => got.push(p));
  e.emit('x', 1);
  off();
  e.emit('x', 2);
  assert.deepEqual(got, [1]);
});

test('item table: every item has a name, a category and a positive cap; unknown ids fall back', () => {
  for (const [id, def] of Object.entries(ITEMS)) {
    assert.ok(def.name, `${id} has no name`);
    assert.ok(def.category, `${id} has no category`);
    assert.ok(itemCap(id) > 0, `${id} cap`);
  }
  const fb = itemDef('no-such-item');
  assert.equal(typeof fb.name, 'string');
  const cats = new Set(Object.values(ITEMS).map((d) => d.category));
  for (const p of POCKETS) if (p.category) assert.ok(cats.has(p.category) || p.category === 'ammo', `pocket ${p.id} has no items`);
});
