/**
 * M1a weapons fix 1: the handling bench's case names (`handling-bench.mjs` runs each in its own Node process; the parent
 * reads this list without building a rig) and W10's sequences and interrupts.
 */
export const CASE_NAMES = [
  'bowUnstow', 'bowStowTimer', 'lanceDraw', 'lanceStowAsk', 'lanceStowTimer', 'swap12', 'swap21', 'swap12Jog', 'swap21Jog',
  'click', 'clickJog', 'clickSprint', 'heldBowRun', 'heldBowSprint', 'heldLanceRun', 'lanceDrawWalk', 'lanceDrawJog', 'lanceDrawCrouch',
  'bowUnstowWalk', 'bowUnstowJog', 'bowUnstowCrouch',
  'rmbFromStowed', 'key1MidLanceDraw', 'key2MidBowUnstow', 'key2MidBowStow', 'key1MidLanceStow',
];
/**
 * M2 polish (hero-anim, the gaff in the loop): the gaff against the bow, with the game's own Oro kit, hanger, gaff layer and
 * held gaff (each case's process grants the kit; the bow-and-lance cases above never load it). The gaff against the lance
 * is gaff-bench.mjs's (swapLanceToGaff, swapGaffToLance). Run by default after the cases above, counted apart.
 */
export const GAFF_CASE_NAMES = ['swapBowToGaff', 'swapGaffToBow', 'swapBowToGaffJog', 'swapGaffToBowJog', 'key3MidBowUnstow', 'key1MidGaffDraw'];
/** W10: every sequence the player or the game starts, and the four interrupts (the brief: roll, aim, strike, the opposite request) */
export const W10_SEQS = ['bowUnstow', 'bowStowTimer', 'lanceDraw', 'lanceStowAsk', 'lanceStowTimer', 'swap12', 'swap21'];
export const W10_KINDS = ['roll', 'aim', 'strike', 'opposite'];
