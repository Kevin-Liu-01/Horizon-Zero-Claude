/**
 * One film run, both lanes' probes (sky-look + instruments share a lane, and a turn gets one Chrome session):
 *   node tools/frames/film.mjs --port <p> --only F02,F03,F04,F05,F23-plumb,F24 --probe /tools/instruments/combo-probe-page.mjs
 * F23-plumb takes the Plumb probe (tools/instruments/plumb-probe-page.mjs); every frame takes the sky probe
 * (tools/look/sky-probe-page.mjs), which tools/look/m11-accept.mjs reads. Each result is the probe's own, unchanged.
 */
export async function probe(frame) {
  const sky = await import('/tools/look/sky-probe-page.mjs');
  if (frame?.id !== 'F23-plumb') return sky.probe(frame);
  const plumb = await import('/tools/instruments/plumb-probe-page.mjs');
  // the sky probe first (it reads the frozen frame as filmed); the Plumb probe then moves cameras and machines
  let s = null;
  try { s = await sky.probe(frame); } catch (e) { s = { error: String(e?.message || e).slice(0, 300) }; }
  const p = await plumb.probe(frame);
  return { ...p, sky: s };
}
