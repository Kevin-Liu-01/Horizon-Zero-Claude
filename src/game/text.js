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
// W2 (Milestone 2): the rest of the first hour
import scar from './text/quests/the-scar.json';
import trueGround from './text/quests/true-ground.json';
import tutorialW2 from './text/cards/tutorial-w2.json';
import sightingW2 from './text/cards/sighting-w2.json';
import barksHolds from './text/barks/holds.json';
import booksW2 from './text/books/field-books-w2.json';
import noticesNinewalls from './text/notices/ninewalls.json';
// wave 4: the certifications and the Ninewalls counter
import certs from './text/ui/certs.json';
import trade from './text/ui/trade.json';
import { makeStrings, makeQuestStrings } from './strings.js';

export const TEXT = Object.freeze({ index, quest, tutorial, sighting, barks, systems });
export const STRINGS = makeStrings({ ...TEXT, extraCards: tutorialW2.cards, extraSighting: sightingW2.cards });

/** W2 as plain data, and one strings view per Milestone 2 quest (src/game/quest/scar-plan.js ids). */
export const TEXT_W2 = Object.freeze({ quests: { 'the-scar': scar, 'true-ground': trueGround }, tutorial: tutorialW2, sighting: sightingW2, barks: barksHolds, books: booksW2, notices: noticesNinewalls, certs, trade });
export const QUEST_STRINGS = Object.freeze({
  'the-scar': makeQuestStrings(TEXT, scar, TEXT_W2),
  'true-ground': makeQuestStrings(TEXT, trueGround, TEXT_W2),
});
