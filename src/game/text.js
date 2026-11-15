/**
 * The writing, parsed by Vite at build time and handed to `makeStrings` (src/game/strings.js). The JSON under
 * src/game/text/ is plain data; this is the one module that imports it.
 */
import index from './text/index.json';
import quest from './text/quests/rakers-morning.json';
import tutorial from './text/cards/tutorial.json';
import sighting from './text/cards/sighting.json';
import barks from './text/barks/saltrow.json';
import systems from './text/ui/systems.json';
import { makeStrings } from './strings.js';

export const TEXT = Object.freeze({ index, quest, tutorial, sighting, barks, systems });
export const STRINGS = makeStrings(TEXT);
