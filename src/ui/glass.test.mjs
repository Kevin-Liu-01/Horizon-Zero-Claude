// M1.6g1: the glass tokens and the field HUD's static rules, pinned in Node (Tier 0, no browser).
// The tokens live in src/style.css :root; BIBLE §18 and §10 are the source of every value here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { QUICK_SLOTS } from './quickslots.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const css = (f) => readFileSync(path.join(here, f), 'utf8');
const STYLE = readFileSync(path.join(here, '..', 'style.css'), 'utf8');
const HUD_CSS = css('hud.css');
const HUD_JS = css('hud.js');

/** `--name: value;` from the first :root block. */
function rootTokens(src) {
  const m = /:root\s*\{([\s\S]*?)\n\}/.exec(src);
  assert.ok(m, 'style.css has a :root block');
  const out = {};
  for (const t of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[t[1]] = t[2].trim();
  return out;
}
const T = rootTokens(STYLE);

test('glass: dark violet #1E1A28 at 0.70 in the HUD and 0.90 in menus (BIBLE §18)', () => {
  assert.equal(T['--cal-glass'].toUpperCase(), '#1E1A28');
  assert.equal(T['--cal-glass-rgb'].replace(/\s/g, ''), '30,26,40');
  assert.equal(Number(T['--cal-glass-a-hud']), 0.7);
  assert.equal(Number(T['--cal-glass-a-menu']), 0.9);
  assert.equal(T['--cal-glass-hud'].replace(/\s/g, ''), 'rgba(30,26,40,0.70)');
  assert.equal(T['--cal-glass-menu'].replace(/\s/g, ''), 'rgba(30,26,40,0.90)');
});

test('glass: lilac selection line #D8CCE4; 6 px registration ticks; square corners', () => {
  assert.equal(T['--cal-select-line'].toUpperCase(), '#D8CCE4');
  const glass = /\.cal-glass::after\s*\{([\s\S]*?)\n\}/.exec(STYLE);
  assert.ok(glass, '.cal-glass::after draws the ticks');
  const ticks = glass[1].match(/\/ (6px 1px|1px 6px)/g) || [];
  assert.equal(ticks.length, 8, 'four L-shaped corner ticks, 6 px each arm');
  // the only rounding in the HUD is a disc drawn as a disc (site pips, the vial's bubble and ends)
  for (const r of HUD_CSS.matchAll(/border-radius\s*:\s*([^;]+);/g)) assert.equal(r[1].trim(), '50%', `border-radius ${r[1]}`);
  assert.ok(!/backdrop-filter|filter:\s*blur/.test(HUD_CSS), 'no blur in play');
});

test('lamp tokens are the four of record', () => {
  assert.equal(T['--cal-lamp-calm'].toUpperCase(), '#F2EAD3');
  assert.equal(T['--cal-lamp-wary'].toUpperCase(), '#B5E61D');
  assert.equal(T['--cal-lamp-hostile'].toUpperCase(), '#FF2D8C');
});

test('type: Chakra Petch for display and labels, IBM Plex Mono for numerals and running text', () => {
  assert.match(T['--cal-font-display'], /^'Chakra Petch'/);
  assert.match(T['--cal-font-ui'], /^'Chakra Petch'/);
  assert.match(T['--cal-font-mono'], /^'IBM Plex Mono'/);
  for (const f of HUD_CSS.matchAll(/font-family\s*:\s*([^;]+);/g)) {
    assert.match(f[1].trim(), /^var\(--cal-font-(mono|ui|display)\)$/, `hud.css font-family ${f[1]}`);
  }
});

test('field HUD: no minimap, no hexagon, no notched corner', () => {
  for (const [name, src] of [['hud.js', HUD_JS], ['hud.css', HUD_CSS]]) {
    assert.ok(!/minimap|mini-map/i.test(src), `${name} names a minimap`);
    assert.ok(!/\bhexagon\b|polygon\([^)]*,[^)]*,[^)]*,[^)]*,[^)]*,/i.test(src), `${name} draws a hexagon or a notched polygon`);
  }
  // every clip-path polygon in the HUD is a triangle (pips) or none
  for (const m of HUD_CSS.matchAll(/polygon\(([^)]*)\)/g)) assert.equal(m[1].split(',').length, 3, `polygon(${m[1]})`);
});

test('quick slots 1-4: 1 bow, 2 lance, 3 and 4 empty until earned', () => {
  assert.deepEqual(QUICK_SLOTS.map((q) => [q.key, q.slot, q.kind]), [
    ['Digit1', 1, 'bow'], ['Digit2', 2, 'lance'], ['Digit3', 3, null], ['Digit4', 4, null],
  ]);
});
