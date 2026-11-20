/**
 * The Malpais' probe (area A, M3 wave 2): run by `film.mjs --probe /tools/world/malpais-probe-page.mjs` after each shot,
 * on the frozen frame. The lens as drawn (camera-probe-page.mjs), the region's build (src/world/sites/malpais-region.js:
 * its state, the steps' milliseconds, the worst slice, what it built), which ground programs the chunks draw, every
 * material in the scene with an emissive colour (MP1: only the wellheads' caps), and the frame's draws and triangles as
 * the renderer counted them on the last render. Reads only; changes nothing.
 */
import { probe as lens } from './camera-probe-page.mjs';

export function probe(f) {
  const out = lens(f);
  const C = window.__CTX__;
  try {
    const M = C?.terrain?.malpais;
    out.malpais = M ? { state: M.state, stats: JSON.parse(JSON.stringify(M.stats)) } : null;
  } catch (e) { out.malpais = { error: String(e) }; }
  try {
    const progs = {};
    for (const Ck of C?.terrain?._chunks || []) {
      const ms = Array.isArray(Ck.mesh.material) ? Ck.mesh.material : [Ck.mesh.material];
      for (const m of ms) { const k = m?.name || m?.customProgramCacheKey?.() || '?'; progs[k] = (progs[k] || 0) + 1; }
    }
    out.groundPrograms = progs;
  } catch (e) { out.groundPrograms = { error: String(e) }; }
  try {
    const glow = new Set();
    C.scene.traverseVisible((o) => {
      if (!(o.isMesh || o.isInstancedMesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m?.emissive && m.emissive.getHex() !== 0 && (m.emissiveIntensity ?? 1) > 0) glow.add(m.name || m.type);
    });
    out.emissiveMaterials = [...glow].sort();
  } catch (e) { out.emissiveMaterials = { error: String(e) }; }
  const info = C?.engine?.renderer?.info?.render;
  out.render = info ? { calls: info.calls, triangles: info.triangles } : null;
  return out;
}
