// M1.6g2: the glass shell's words, pinned in Node (Tier 0, no browser). Each BIBLE §18 row this build item owns
// must exist with exactly its listed words; the death screen offers exactly the bible's two stations (§13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(path.join(here, f), 'utf8');
const SHELL = JSON.parse(readFileSync(path.join(here, '..', 'game', 'text', 'ui', 'shell.json'), 'utf8'));
const MENU = src('menu.js');
const MAP = src('map.js');
const INV = src('inventory.js');
const SET = src('settings.js');
const LOG = src('quests.js');
const SIGHT = src('sighting.js');

const quoted = (s) => [...s.matchAll(/'([^'\n]*)'/g)].map((m) => m[1]);

test('hub: the tab words, in the bible order', () => {
  const block = MENU.slice(MENU.indexOf('const TABS = ['), MENU.indexOf('];', MENU.indexOf('const TABS = [')));
  const labels = [...block.matchAll(/label: '([A-Z ]+)'/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['MAP', 'FIELD LOG', 'SATCHEL', 'MAKING', 'CHARACTER', 'SKILLS', 'FIELD BOOKS', 'SETTINGS']);
});

test('death: THE LINE IS LOST and exactly two stations, RETURN TO THE LAST BRAZIER / QUIT TO TITLE', () => {
  assert.match(MENU, /THE LINE IS LOST/);
  const block = MENU.slice(MENU.indexOf('const opts = ['), MENU.indexOf('opts.forEach'));
  const labels = [...block.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['RETURN TO THE LAST BRAZIER', 'QUIT TO TITLE']);
  assert.doesNotMatch(MENU, /RELOAD THE LAST ENTRY|RETURN TO THE CISTERN/);
});

test('map: the legend is exactly the bible words', () => {
  const block = MAP.slice(MAP.indexOf('const LEGEND = ['), MAP.indexOf('];', MAP.indexOf('const LEGEND = [')));
  const words = [...block.matchAll(/\['\w+', '([A-Z ]+)'\]/g)].map((m) => m[1]);
  assert.deepEqual(words, ['MAIN OBJECTIVE', 'SITE', 'SETTLEMENT', 'BENCHMARK', 'TRIG PILLAR', 'BRAZIER', 'WAYPOINT', 'DANGER']);
  assert.match(MAP, /WALK THE LINE TO /);
  assert.doesNotMatch(MAP, /FLAGGED INSTRUMENT|>\$\{gate\.ok \? 'TRAVEL'/);
});

test('satchel: ALL · WEAPONS · TOOLS · STORES · FIELD BOOKS · TRADE; no coloured rarity tier, no upgrade purchase', () => {
  const block = INV.slice(INV.indexOf('const SATCHEL = ['), INV.indexOf('];', INV.indexOf('const SATCHEL = [')));
  assert.deepEqual([...block.matchAll(/word: '([A-Z ]+)'/g)].map((m) => m[1]), ['ALL', 'WEAPONS', 'TOOLS', 'STORES', 'FIELD BOOKS', 'TRADE']);
  assert.doesNotMatch(INV, /UPGRADE ·|cal-det-rar', d, rar\.name/);
});

test('settings: GRAPHICS, CONTROLS with REBIND and RESET, READING', () => {
  assert.match(SET, /\['graphics', 'GRAPHICS'\], \['controls', 'CONTROLS'\], \['reading', 'READING'\]/);
  assert.ok(quoted(SET).includes('REBIND') && quoted(SET).includes('RESET'));
  for (const id of ['tier', 'resScale', 'shadows', 'motionBlur', 'cameraShake', 'fovPunch', 'vignette', 'holdAim', 'holdSteady', 'holdResurvey', 'subtitles', 'subSize', 'subBacking', 'uiScale']) {
    assert.match(SET, new RegExp(`id: '${id}'`), `row ${id}`);
  }
  assert.match(SET, /id: 'motionBlur', kind: 'toggle', label: 'Motion blur', dflt: false/);
  assert.match(SET, /id: 'subtitles', kind: 'toggle', label: 'Subtitles', dflt: true/);
});

test('Field Log: FIELD LOG · TRACK; no reward counter', () => {
  assert.ok(quoted(LOG).includes('FIELD LOG') && quoted(LOG).includes('TRACK'));
  assert.doesNotMatch(LOG.slice(LOG.indexOf('openLog() {'), LOG.indexOf('/* ------------------------------- dialogue')), /XP|SKILL POINT|REWARD/);
});

test('slots, context lost, unsupported: the bible words', () => {
  assert.equal(SHELL.slots.head, 'CONTINUE');
  assert.equal(SHELL.slots.slot, 'SLOT {n}');
  assert.equal(SHELL.slots.erase, 'ERASE');
  assert.equal(SHELL.slots.eraseHold, 'hold');
  assert.equal(SHELL.contextLost.line, 'DISPLAY RESET · RESUMING');
  assert.equal(SHELL.unsupported.line, 'CALIMA NEEDS WEBGL 2');
  assert.ok(SHELL.unsupported.try.length >= 2);
});

test('Sighting: the card carries take a bearing (T)', () => {
  assert.match(SIGHT, /TAKE A BEARING/);
  assert.match(SIGHT, /BEARING HELD/);
});
