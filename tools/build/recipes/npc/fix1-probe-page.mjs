/**
 * The people lane's one-session probe (M1.5c/M1.5d fix round 1), run by
 *   node tools/frames/film.mjs --port <p> --only F20,F21,F22 --probe /tools/build/recipes/npc/fix1-probe-page.mjs
 * F20: the cast probe (cast-probe-page.mjs: the crowd's violet, in the world and with the town hidden); F22: the routine log
 * with Mise and Ansel and the lookout's live trials (m15-probe-page.mjs); every other frame: nothing.
 */
export async function probe(frame) {
  if (frame?.id === 'F20') return (await import('/tools/build/recipes/npc/cast-probe-page.mjs')).probe(frame);
  if (frame?.id === 'F22') return (await import('/tools/build/recipes/npc/m15-probe-page.mjs')).probe(frame);
  return { skipped: 'measured on F20 and F22 only' };
}
