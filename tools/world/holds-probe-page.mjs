/**
 * The Holds' look probe (area A, M2 wave 2): run by `film.mjs --probe /tools/world/holds-probe-page.mjs` after each
 * shot, on the frozen frame. The lens exactly as drawn (camera-probe-page.mjs: the skyline masks and holds-look.mjs cast
 * the frame's rays from it), plus the Holds' plants (holds/flora.js stats: instances and triangles per kind) and the
 * frame's draws and triangles as the renderer counted them on the last render. Reads only; changes nothing.
 */
import { probe as lens } from './camera-probe-page.mjs';

export function probe(f) {
  const out = lens(f);
  const C = window.__CTX__;
  try { out.holdsFlora = C?.vegetation?.holdsFlora?.stats?.() ?? null; } catch (e) { out.holdsFlora = { error: String(e) }; }
  const info = C?.engine?.renderer?.info?.render;
  out.render = info ? { calls: info.calls, triangles: info.triangles } : null;
  out.floraBuildMs = C?.vegetation?.holdsFlora?.buildMs ?? null;
  return out;
}
