/**
 * M1b exit fix: F31's violet row alone (reed-probe-page.mjs `violetShare`), without the reed probe's gust cycles, so a
 * frame film measures it in seconds:
 *   node tools/frames/film.mjs --port <p> --only F31 --probe /tools/gates/systems/violet-probe-page.mjs
 * On F31: the beds' planted instances shown to the lens and the violet share; on any other frame: nothing.
 */
import { violetShare } from './reed-probe-page.mjs';

export async function probe(frame) {
  const C = window.__CTX__;
  if (frame?.id !== 'F31') return { frame: frame?.id, skipped: true };
  if (!C?.reeds) return { error: 'no ctx.reeds' };
  const out = { frame: frame.id };
  try { out.shown = C.reeds.draw.stats().shown; } catch (e) { out.shown = { error: String(e?.message || e).slice(0, 200) }; }
  try { out.violet = await violetShare(C); } catch (e) { out.violet = { error: String(e?.stack || e).slice(0, 400) }; }
  return out;
}
