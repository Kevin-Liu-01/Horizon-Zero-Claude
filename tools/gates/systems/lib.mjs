// Shared by the systems rows: the writing read from disk, the way src/game/text.js hands it to the game.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeStrings } from '../../../src/game/strings.js';

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
