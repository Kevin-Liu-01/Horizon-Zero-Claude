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
/* (M3 wave 3, MP2) wave 2's 'aa' square at (300, 140) lies on Rust Cone (its cone weight 0.86-1, mean 1.00: the zones' law,
 * malpaisZoneAt, does not count the cone, so Node read it as 85 % aa): the term draws it as scree, which is why its peak
 * and the scree square's were one (9.06 m). It is kept as 'cone-flank'; the aa square is now (280, 230), cone weight 0 over
 * all of it and 85 % aa by the zones' law (the best 40 m square of the flow's on a 10 m search) */
export const TOPDOWN = Object.freeze({ frame: 'F56', span: 40, px: 512, sites: Object.freeze([{ id: 'aa', x: 280, z: 230 }, { id: 'pahoehoe', x: 190, z: 125 }, { id: 'scree', x: 270, z: 112 }, { id: 'cone-flank', x: 300, z: 140 }]) });

/**
 * (M3 wave 3, MP4: "the Yards' stack steam visible over the sky in F57") what the steam adds to the frame, on the frozen
 * frame: the frame drawn with the steam and without it, and with only the sky dome (the pixels nothing else covers: the
 * sky), read back after the whole post chain. Pixels the steam changes by more than 3 of 255 in any channel, all and over
 * the sky, the luma it moves them by, where they are (a 16 x 9 grid, top row first) and their box; then the same with
 * wave 2b's cover (0.3) in the standard material, and with wave 2b's Lambert material and cover, so each change's share is
 * read (the first film at 55126d7 tried envMapIntensity 0 for the second: three reads scene.environmentIntensity for a
 * material with no envMap of its own, so it changed nothing). Restores everything.
 */
async function steamVisibility(C, st) {
  const E = C.engine, R = E.renderer, gl = R.getContext();
  const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight, n = bw * bh * 4;
  const A = new Uint8Array(n), B = new Uint8Array(n), K = new Uint8Array(n), A1 = new Uint8Array(n), A2 = new Uint8Array(n);
  const shot = (buf) => { E.render(0); E.render(0); gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf); };
  const solos = st.group.children.filter((m) => m.name.startsWith('malpais-steam-solo-'));
  const was = st.group.children.map((m) => m.visible), gwas = st.group.visible;
  const restore = () => { st.group.children.forEach((m, i) => { m.visible = was[i]; }); st.group.visible = gwas; };
  const out = { buffer: [bw, bh] };
  try {
    for (const m of solos) m.visible = false;
    st.group.visible = true;
    shot(A);
    st.group.visible = false;
    shot(B);
    const hidden = [];
    C.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && o.name !== 'sky') { o.visible = false; hidden.push(o); } });
    try { shot(K); } finally { for (const o of hidden) o.visible = true; }
    st.group.visible = true;
    // wave 2b's cover (0.3 in every group) in the standard material, then in a Lambert material (wave 2b's own)
    const meshes = st.group.children.filter((m) => !m.name.startsWith('malpais-steam-solo-'));
    const covers = st.materials.map((m) => [m.userData.cover, m.userData.cover?.value.x]);
    try {
      for (const [K2] of covers) if (K2) K2.value.x = 0.3;
      shot(A1);
      const T = await import('three');
      const lam = new Map();
      for (const m of meshes) {
        const sm = m.material;
        if (!lam.has(sm)) { const l = new T.MeshLambertMaterial({ color: sm.color.getHex(), transparent: true, depthWrite: false }); l.onBeforeCompile = sm.onBeforeCompile; l.customProgramCacheKey = () => 'cal-malpais-steam-probe-lambert'; lam.set(sm, l); }
        m.userData.__probeMat = sm; m.material = lam.get(sm);
      }
      try { shot(A2); } finally { for (const m of meshes) { m.material = m.userData.__probeMat; delete m.userData.__probeMat; } for (const l of lam.values()) l.dispose(); }
    } finally { for (const [K2, v] of covers) if (K2) K2.value.x = v; }
    const L = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
    const count = (X) => {
      let all = 0, sky = 0, skyUpper = 0, dL = 0, dLmax = 0, dLmin = 0, x0 = bw, y0 = bh, x1 = -1, y1 = -1;
      const grid = new Array(16 * 9).fill(0);
      for (let i = 0, k = 0; i < n; i += 4, k++) {
        const d = Math.max(Math.abs(X[i] - B[i]), Math.abs(X[i + 1] - B[i + 1]), Math.abs(X[i + 2] - B[i + 2]));
        if (d <= 3) continue;
        all++;
        const x = k % bw, y = bh - 1 - ((k / bw) | 0);
        grid[Math.min(8, (y * 9 / bh) | 0) * 16 + Math.min(15, (x * 16 / bw) | 0)]++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        const isSky = Math.max(Math.abs(K[i] - B[i]), Math.abs(K[i + 1] - B[i + 1]), Math.abs(K[i + 2] - B[i + 2])) <= 2;
        if (!isSky) continue;
        sky++;
        if (((k / bw) | 0) > bh / 2) skyUpper++;   // readPixels rows run bottom-up
        const l = L(X, i) - L(B, i); dL += l; if (l > dLmax) dLmax = l; if (l < dLmin) dLmin = l;
      }
      return { changed: all, overSky: sky, overSkyUpperHalf: skyUpper, skyLumaMean: sky ? +(dL / sky).toFixed(2) : null, skyLumaMax: +dLmax.toFixed(1), skyLumaMin: +dLmin.toFixed(1), box: x1 >= 0 ? [x0, y0, x1, y1] : null, grid16x9: grid };
    };
    let skyPx = 0; for (let i = 0; i < n; i += 4) if (Math.max(Math.abs(K[i] - B[i]), Math.abs(K[i + 1] - B[i + 1]), Math.abs(K[i + 2] - B[i + 2])) <= 2) skyPx++;
    out.skyPixels = skyPx;
    out.now = count(A);
    out.standardCover03 = count(A1);
    out.lambertCover03 = count(A2);
    out.method = 'readPixels after the post chain; changed = any channel > 3 of 255 against the frame without steam; sky = the pixels the sky dome alone draws the same (<= 2)';
  } finally { restore(); E.render(0); }
  return out;
}

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
  // (wave 2b, MP4) the steam's draws: each group's mesh, whether the frame drew it (visible, in the frustum, not size-culled)
  try {
    const M = C?.terrain?.malpais, st = M?._held?.steam;
    if (st) {
      const T = await import('three');
      const cam = C.camera, fr = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      out.steam = { counts: st.counts, t: st.uniforms.uSteamT.value, wind: [st.uniforms.uSteamWind.value.x, st.uniforms.uSteamWind.value.y], meshes: st.group.children.map((m) => ({ name: m.name, visible: m.visible, parentVisible: st.group.visible, inScene: !!m.parent?.parent?.parent, sizeCulled: m.userData.__sizeCulled === true, inFrustum: fr.intersectsObject(m), puffs: m.geometry.instanceCount, renderOrder: m.renderOrder, programs: m.material.version })) };
      try { out.steam.visibility = await steamVisibility(C, st); } catch (e) { out.steam.visibility = { error: String(e?.message || e).slice(0, 300) }; }
    }
  } catch (e) { out.steam = { error: String(e?.message || e).slice(0, 300) }; }
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
