/**
 * BUILD M1b — one probe for the instruments lane's F23 frames in a single film session (lane instruments):
 *   node tools/frames/film.mjs --port <p> --only F23-peg,F23-gauge,F26 --probe /tools/instruments/m1b-probe-page.mjs
 * F23-peg runs `peg-probe-page.mjs`, F23-gauge runs `gauge-probe-page.mjs`; any other frame is skipped.
 * M1a regressions run (ruling 3): F32 runs the seam probe on the staged frame, as tools/perf/world-r2.mjs --seams does
 * (tools/perf/census-page.mjs `seams`: land and water white over magenta, a gap pixel with land within 3 px on both
 * sides is a crack; bar: none wider than 2 px), so F32 can be filmed and its cracks counted in the same session.
 */
export async function probe(frame) {
  if (frame?.id === 'F23-peg') return (await import('/tools/instruments/peg-probe-page.mjs')).probe(frame);
  if (frame?.id === 'F23-gauge') return (await import('/tools/instruments/gauge-probe-page.mjs')).probe(frame);
  if (frame?.id === 'F32') {
    const P = await import('/tools/perf/census-page.mjs');
    const C = window.__CTX__, T = C.terrain;
    const land = new Set(); T.group.traverse((o) => { if (o.isMesh && o !== T.isles) land.add(o); });
    const water = new Set(); (T.water?.group || T.water?.mesh)?.traverse?.((o) => { if (o.isMesh) water.add(o); });
    const s = P.seams(C.engine, C.scene, (o) => land.has(o) || water.has(o));
    return { seams: s, bar: 'no crack wider than 2 px (ruling 3: LOD seam or chunk notch)', pass: s.widestPx <= 2 };
  }
  return { skipped: 'no instruments probe for this frame' };
}
