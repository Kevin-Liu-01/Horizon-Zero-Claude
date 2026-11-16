/**
 * CLOTH: the flag, on its own (no three.js), so the people's chains can read it without loading Brea's rig.
 */
/** The flag: 2 = the grid solver drives Brea's sash panels and wrap tail and the people's strands. The only cloth since
 *  cloth fix round 1 (the old chains' panel path and clothWrap.js are gone): `?cloth=0`, CALIMA_CLOTH=0 and
 *  `globalThis.__CALIMA_CLOTH = 0` no longer turn it off (the C0 baseline and the before-and-after clips were recorded
 *  at 6782b47 and 20261116T004625Z). Kept as a function so the people's chains read it as before. */
export function clothMode() {
  return 2;
}

/** The timing clock for the ring buffers: the bench's own (`__clothClock`), else the browser's REAL clock, even under the
 *  sim-time slate (which pins `performance.now` to the virtual clock, so the ring would read 0 ms). */
export function realClock() {
  if (globalThis.__clothClock) return globalThis.__clothClock;
  const pn = globalThis.Performance?.prototype?.now, perf = globalThis.performance;
  if (pn && perf) return () => pn.call(perf);
  return perf ? () => perf.now() : null;
}
