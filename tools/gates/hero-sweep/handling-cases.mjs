/**
 * M1a weapons fix 1: the handling bench's case names (`handling-bench.mjs` runs each in its own Node process; the parent
 * reads this list without building a rig) and W10's sequences and interrupts.
 */
export const CASE_NAMES = [
  'bowUnstow', 'bowStowTimer', 'lanceDraw', 'lanceStowAsk', 'lanceStowTimer', 'swap12', 'swap21', 'swap12Jog', 'swap21Jog',
  'click', 'heldBowRun', 'heldBowSprint', 'heldLanceRun', 'lanceDrawWalk', 'lanceDrawJog', 'lanceDrawCrouch',
  'bowUnstowWalk', 'bowUnstowJog', 'bowUnstowCrouch',
  'rmbFromStowed', 'key1MidLanceDraw', 'key2MidBowUnstow', 'key2MidBowStow', 'key1MidLanceStow',
];
/** W10: every sequence the player or the game starts, and the four interrupts (the brief: roll, aim, strike, the opposite request) */
export const W10_SEQS = ['bowUnstow', 'bowStowTimer', 'lanceDraw', 'lanceStowAsk', 'lanceStowTimer', 'swap12', 'swap21'];
export const W10_KINDS = ['roll', 'aim', 'strike', 'opposite'];
