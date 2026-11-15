/**
 * BUILD M1b — one probe for the instruments lane's F23 frames in a single film session (lane instruments):
 *   node tools/frames/film.mjs --port <p> --only F23-peg,F23-gauge,F26 --probe /tools/instruments/m1b-probe-page.mjs
 * F23-peg runs `peg-probe-page.mjs`, F23-gauge runs `gauge-probe-page.mjs`; any other frame is skipped.
 */
export async function probe(frame) {
  if (frame?.id === 'F23-peg') return (await import('/tools/instruments/peg-probe-page.mjs')).probe(frame);
  if (frame?.id === 'F23-gauge') return (await import('/tools/instruments/gauge-probe-page.mjs')).probe(frame);
  return { skipped: 'no instruments probe for this frame' };
}
