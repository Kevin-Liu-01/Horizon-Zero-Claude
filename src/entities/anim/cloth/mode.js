/**
 * CLOTH: the flag, on its own (no three.js), so the people's chains can read it without loading Brea's rig.
 */
/** The flag: 2 = the grid solver drives Brea's sash panels and wrap tail and the people's strands: `?cloth=2` in the page's address, CALIMA_CLOTH=2 in
 *  Vite's environment (vite.config.js defines `__CALIMA_CLOTH__`), or `globalThis.__CALIMA_CLOTH = 2` (the Node benches). */
export function clothMode() {
  if (globalThis.__CALIMA_CLOTH != null) return Number(globalThis.__CALIMA_CLOTH) || 0;
  // eslint-disable-next-line no-undef
  if (typeof __CALIMA_CLOTH__ !== 'undefined' && __CALIMA_CLOTH__) return Number(__CALIMA_CLOTH__) || 0;
  try {
    const s = globalThis.location?.search || '';
    const m = /[?&]cloth=(\d+)/.exec(s);
    if (m) return Number(m[1]);
  } catch { /* no location */ }
  return 0;
}

