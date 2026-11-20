/**
 * The Malpais' probe (area A, M3 wave 2): run by `film.mjs --probe /tools/world/malpais-probe-page.mjs` after each shot,
 * on the frozen frame. The lens as drawn (camera-probe-page.mjs), the region's build (src/world/sites/malpais-region.js:
 * its state, the steps' milliseconds, the worst slice, what it built), which ground programs the chunks draw, every
 * material in the scene with an emissive colour (MP1: only the wellheads' caps), and the frame's draws and triangles as
 * the renderer counted them on the last render. Reads only; changes nothing.
 */
import { probe as lens } from './camera-probe-page.mjs';

/* (M3 wave 2 fix round 1, MP2 "no tile repeat under 20 m") on F56 only: 40 m orthographic top-down captures of the
 * Malpais' ground term at an aa site and a pahoehoe site (Node chose them: 85-100 % one zone over the square), the material
 * alone (meadow-page.mjs topDown: no shadow, sky or skyline), returned as 8-bit luma for tools/perf/autocorr.mjs */
/* (wave 2b, MP7 "the cone face not a large repeating pattern") and Rust Cone's scree: a square on its south-west flank,
 * 17 m from its axis (the cone's weight 1 over all of it) */
export const TOPDOWN = Object.freeze({ frame: 'F56', span: 40, px: 512, sites: Object.freeze([{ id: 'aa', x: 300, z: 140 }, { id: 'pahoehoe', x: 190, z: 125 }, { id: 'scree', x: 270, z: 112 }]) });

export async function probe(f) {
  const out = lens(f);
  if (f?.id === TOPDOWN.frame && window.__CTX__?.terrain?.malpais?.ready) {
    try {
      const M = await import('/tools/perf/meadow-page.mjs');
      const C = window.__CTX__;
      out.topdown = [];
      for (const s of TOPDOWN.sites) {
        const t = await M.topDown(C.engine, C, s.x, s.z, { span: TOPDOWN.span, px: TOPDOWN.px });
        const L = new Uint8Array(t.px * t.px);
        for (let i = 0; i < L.length; i++) L[i] = Math.round(0.2126 * t.rgba[i * 4] + 0.7152 * t.rgba[i * 4 + 1] + 0.0722 * t.rgba[i * 4 + 2]);
        let bin = ''; for (let i = 0; i < L.length; i += 32768) bin += String.fromCharCode.apply(null, L.subarray(i, i + 32768));
        out.topdown.push({ ...s, span: t.span, px: t.px, luma: btoa(bin) });
      }
    } catch (e) { out.topdown = { error: String(e?.message || e).slice(0, 300) }; }
  }
  const C = window.__CTX__;
  try {
    const M = C?.terrain?.malpais;
    out.malpais = M ? { state: M.state, stats: JSON.parse(JSON.stringify(M.stats)) } : null;
    if (M?._held?.tiles) { let on = 0, inst = 0; for (const t of M._held.tiles) if (t.mesh.visible) { on++; inst += t.mesh.count; } out.malpais.clinkerShown = { tiles: on, of: M._held.tiles.length, clasts: inst }; }
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
