/**
 * THE M3 LIVE KINDS' FILES (Milestone 3 wave 3c, area C; IK11). The Kiln, Davit and Sonde GLBs are fetched the first time
 * a quest stands one (./live-kind.js `ensureKind`: the Yards' encounter on "The Kiln Yards"' 'climb', the Sonde at
 * MOORING once "A Line Over the Glass" runs), never at boot: the registry's boot glob (../../registry.js, `kinds/*.js`)
 * does not see them. One list for the game (./kind.js, ../davit/kind.js, ../sonde/kind.js read their urls here) and the
 * shipped-size ledger (tools/tier0/budgets.json shipped.deferred). Imports nothing, so Node reads it. The grey Spindle
 * ships no file (it is built from its form).
 */
export const M3_LIVE_URLS = Object.freeze({
  kiln: '/models/instruments/kiln.glb',
  davit: '/models/instruments/davit.glb',
  sonde: '/models/instruments/sonde.glb',
});
/** Paths under public/ (the ledger's `under`). */
export const M3_LIVE_FILES = Object.freeze(Object.values(M3_LIVE_URLS).map((u) => u.replace(/^\//, '')));
