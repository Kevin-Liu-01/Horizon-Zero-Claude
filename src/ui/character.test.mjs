// M1.6i: the Character page's words and figures, pinned in Node (Tier 0, no browser). BIBLE §18 "Character":
// header, the worn set on a turntable, eight rung cards (tier label, set name, tagline, swatches; locked = black
// silhouette), customization, and the one word WEAR. BIBLE §8.4 gives the rungs, in order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { figureSvg, FIGURE_IDS } from './figures.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const T = JSON.parse(readFileSync(path.join(here, '..', 'game', 'text', 'ui', 'character.json'), 'utf8'));
const PAGE = readFileSync(path.join(here, 'character.js'), 'utf8');

test('header and verb: BREA · SALT-PAN RECKONER, WEAR', () => {
  assert.equal(T.head, 'BREA · SALT-PAN RECKONER');
  assert.equal(T.wear, 'WEAR');
  assert.equal(T.tab, 'CHARACTER');
});

test('the eight rungs of BIBLE 8.4, in order, with their tier labels and taglines', () => {
  assert.deepEqual(T.rungs.map((r) => r.tier), ['STARTER', 'SCOUT', 'RECKONER', 'VEIL', 'PIONEER', 'VANGUARD', 'ARCANE', 'CELESTIAL']);
  assert.deepEqual(T.rungs.map((r) => r.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(T.rungs[0].tagline, 'Trusted gear for the long road.');
  assert.equal(T.rungs[1].tagline, 'See farther.');
  assert.equal(T.rungs[0].name, "Raker's Whites");
  assert.equal(T.rungs[1].name, 'Guild Whites');
  assert.equal(T.rungs[1].perk, 'SHRUG');
  for (const r of T.rungs.slice(0, 2)) assert.ok(r.swatches.length >= 4, `${r.id} swatches`);
});

test('rungs 1 and 2 are the wearable two; the page has no level, experience, points or purchase', () => {
  const m = /const ARMOR_OF = Object\.freeze\(\{([^}]*)\}\)/.exec(PAGE);
  assert.ok(m, 'ARMOR_OF');
  assert.deepEqual([...m[1].matchAll(/(\w+): '([\w-]+)'/g)].map((x) => [x[1], x[2]]), [['starter', 'pan-1'], ['scout', 'pan-2']]);
  const { about, ...shown } = T;
  const words = JSON.stringify(shown).toUpperCase();
  for (const bad of ['LV.', 'LEVEL ', ' XP', 'EXPERIENCE', 'SKILL POINT', 'PURCHASE', 'UPGRADE', 'BUY']) {
    assert.ok(!words.includes(bad), `no "${bad}"`);
  }
});

test('one figure per rung, each its own silhouette; locked draws one black fill', () => {
  assert.deepEqual(FIGURE_IDS, T.rungs.map((r) => r.id));
  const shapes = FIGURE_IDS.map((id) => [...figureSvg(id, { locked: true }).matchAll(/ d="([^"]+)"/g)].map((x) => x[1]).join('|'));
  assert.equal(new Set(shapes).size, 8, 'eight distinct outlines');
  for (const id of FIGURE_IDS) {
    const fills = new Set([...figureSvg(id, { locked: true }).matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((x) => x[1]));
    assert.deepEqual([...fills], ['#0B0A0E'], `${id} locked is one black fill`);
  }
  const coloured = new Set([...figureSvg('scout', { swatches: T.rungs[1].swatches }).matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((x) => x[1]));
  assert.ok(coloured.size >= 4, 'a wearable rung is drawn in its colours');
});
