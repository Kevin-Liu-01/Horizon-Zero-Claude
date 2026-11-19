// Shared by the systems rows: the writing read from disk, the way src/game/text.js hands it to the game.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeStrings, makeQuestStrings } from '../../../src/game/strings.js';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p) => JSON.parse(readFileSync(`${ROOT}src/game/text/${p}`, 'utf8'));

export function loadText() {
  const index = read('index.json');
  return {
    index,
    quest: read(index.files.quest),
    tutorial: read(index.files.tutorial),
    sighting: read(index.files.sighting),
    barks: read(index.files.barks),
    systems: read('ui/systems.json'),
  };
}

export const strings = () => makeStrings(loadText());

/** W2 read from disk (index.json's w2 block), as src/game/text.js hands it to the game. */
export function loadW2() {
  const index = read('index.json');
  const F = index.w2.files;
  const quests = Object.fromEntries(F.quests.map((f) => { const q = read(f); return [q.id, q]; }));
  return { index, quests, barks: read(F.barks), tutorial: read(F.tutorial), sighting: read(F.sighting), books: read(F.books), notices: read(F.notices) };
}

/** The strings view of one Milestone 2 quest ('the-scar', 'true-ground'). */
export const questStrings = (id) => { const w2 = loadW2(); return makeQuestStrings(loadText(), w2.quests[id], w2); };
