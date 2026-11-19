/**
 * CALIMA AT NOON, THE PAGE HALF (M2 wave 4, areas A+F; film.mjs --probe /tools/world/calima-noon-probe-page.mjs).
 * Runs after each frame's shot with the world frozen; every change is undone.
 *
 *   F45        the M1.1i weather probe (tools/look/calima-probe-page.mjs, read as F06's: visibility cards and the sun's
 *              radial profile with the lens turned onto it), plus:
 *                sun    { altitudeDeg }                                   EN4
 *                plumb  { sightRange, scale, reach, envScale }            EN3: a live Plumb's sight in the dust
 *                hg5    { material: [...], unlit: { pixels, groundPixelsOverFloor, maxOver } }
 *                       the ground's materials (emissive colour, maps, intensity), and the lens with every light, the
 *                       sky's light and the air off and only the ground drawn: ground pixels that still show (bar 0)
 *              its visibility cards are laid with the lens turned to bearing 112 at the same place (open lowland)
 *   F45-trade  sun, the cloud shadows' uniforms (EN5: strength, tile, offset) and their share of the ground in the frame
 *   any other  sun and the cloud shadows' uniforms only
 */
export async function probe(frame) {
  const C = window.__CTX__, E = C.engine, env = C.environment, cam = C.camera, R = E.renderer;
  const out = { frame: frame?.id, weather: env.weather, hour: env.time, sun: { altitudeDeg: Math.round((env.sunAltitudeDeg ?? NaN) * 10) / 10 } };
  const ca = env.u?.calCloudA?.value, co = env.u?.calCloudOff?.value;
  out.cloudShadow = ca ? { strength: +ca.z.toFixed(3), tileM: Math.round(1 / ca.x), threshold: +ca.y.toFixed(3), soft: +ca.w.toFixed(3), offset: co ? [+co.x.toFixed(4), +co.y.toFixed(4)] : null, texture: env.u.calCloudTex?.value?.name ?? null } : null;

  if (frame?.id === 'F45') {
    /* ---- EN3: the M1.1i probe read as F06's, its cards laid across the open lowland on the left of the lens's own
     * position (bearing VIS_BEARING, level: toward the beat's rim the ground climbs 42 m in 100 m and hides every card) ---- */
    const VIS_BEARING = 112;
    try {
      const q0 = cam.quaternion.clone(), pos0 = cam.position.clone();
      const D2R = Math.PI / 180;
      cam.lookAt(pos0.x + Math.sin(VIS_BEARING * D2R) * 100, pos0.y, pos0.z - Math.cos(VIS_BEARING * D2R) * 100);
      cam.updateMatrixWorld(true);
      const base = await import('/tools/look/calima-probe-page.mjs');
      out.m11i = await base.probe({ ...frame, id: 'F06' });
      out.m11i.visBearing = VIS_BEARING;
      cam.position.copy(pos0); cam.quaternion.copy(q0); cam.updateMatrixWorld(true);
      E.render(0);
    } catch (e) { out.m11i = { error: String(e?.message || e).slice(0, 300) }; }

    /* ---- the sight multiplier on a live Plumb ---- */
    try {
      const P = C.machines?.perception;
      P?.update?.(0);
      const pl = (C.machines?.list || []).find((m) => m && m.kind === 'plumb' && m.alive !== false);
      out.plumb = pl ? { sightRange: pl.sightRange ?? null, scale: P?.sightScale ?? null, reach: pl.sightRange != null && P?.sightScale != null ? Math.round(pl.sightRange * P.sightScale * 100) / 100 : null, envScale: env.perceptionScale, at: [Math.round(pl.position.x), Math.round(pl.position.z)] } : { error: 'no live Plumb' };
    } catch (e) { out.plumb = { error: String(e?.message || e) }; }

    /* ---- HG5: no emissive ground. The ground's materials, then the lens drawn with every light, the sky's light and
     * the air off and only the ground shown: a ground pixel over the post chain's own floor (the same draw with the
     * ground hidden too) is light the ground made itself ---- */
    try {
      const mats = new Map();
      C.terrain?.group?.traverse?.((o) => {
        if (!o.isMesh) return;
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m && !mats.has(m)) mats.set(m, o.name);
      });
      out.hg5 = {
        material: [...mats].map(([m, name]) => ({ mesh: name, type: m.type, emissive: m.emissive ? m.emissive.getHexString() : null, emissiveIntensity: m.emissiveIntensity ?? null, emissiveMap: !!m.emissiveMap })),
      };
      const gl = R.getContext();
      const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
      const A = new Uint8Array(bw * bh * 4), B = new Uint8Array(bw * bh * 4);
      const undo = [];
      const set = (o, k, v) => { const was = o[k]; o[k] = v; undo.push(() => { o[k] = was; }); };
      for (const ch of C.scene.children) if (ch.visible && ch.name !== 'terrain') set(ch, 'visible', false);
      C.scene.traverse((o) => { if (o.isLight) set(o, 'intensity', 0); });
      set(C.scene, 'environmentIntensity', 0);
      const U = env.u, keepU = ['calFogA', 'calFogC', 'calFogD'].map((k) => [k, U[k].value.clone()]);
      undo.push(() => { for (const [k, v] of keepU) U[k].value.copy(v); });
      const freeze = () => { U.calFogA.value.x = 1e-9; U.calFogC.value.x = 0; U.calFogD.value.x = 0; for (const l of (E.csm?.lights || [])) l.intensity = 0; };
      freeze(); E.render(0); freeze(); E.render(0);
      gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, A);
      const tg = C.scene.children.filter((c) => c.name === 'terrain');
      tg.forEach((c) => { c.visible = false; });
      freeze(); E.render(0);
      gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, B);
      tg.forEach((c) => { c.visible = true; });
      let lit = 0, n = 0, mx = 0;
      for (let i = 0; i < A.length; i += 4) {
        n++;
        const d = Math.max(A[i] - B[i], A[i + 1] - B[i + 1], A[i + 2] - B[i + 2]);
        if (d > mx) mx = d;
        if (d > 2) lit++;
      }
      out.hg5.unlit = { pixels: n, groundPixelsOverFloor: lit, maxOver: mx, method: 'lights, sky light and air off, only the ground drawn, against the same draw with the ground hidden (> 2/255)' };
      /* M2 fix wave (HG5's lights-off pixels FOUND): where they are (a 16 x 9 grid of the frame, top row first, and their
       * box), whose they are (each of the ground's meshes hidden in turn: the lit pixels that fall to the floor are that
       * mesh's), and what makes them (the same draw with the far-form air off: island/aerial.js AERIAL, the sister isles'
       * own air, terrain.js uIsleVis; what is left is light the ground's surface itself makes) */
      try {
        const litMask = new Uint8Array(n);
        const grid = new Array(16 * 9).fill(0); let x0 = bw, y0 = bh, x1 = -1, y1 = -1;
        for (let i = 0, k = 0; i < A.length; i += 4, k++) {
          const d = Math.max(A[i] - B[i], A[i + 1] - B[i + 1], A[i + 2] - B[i + 2]);
          if (d <= 2) continue;
          litMask[k] = 1;
          const x = k % bw, yb = (k / bw) | 0, y = bh - 1 - yb;   // readPixels rows run bottom-up
          grid[Math.min(8, (y * 9 / bh) | 0) * 16 + Math.min(15, (x * 16 / bw) | 0)]++;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        out.hg5.where = { grid16x9: grid, box: x1 >= 0 ? [x0, y0, x1, y1] : null, buffer: [bw, bh] };
        const Cc = new Uint8Array(bw * bh * 4);
        const countLit = () => { let c = 0, m = 0; for (let i = 0, k = 0; i < Cc.length; i += 4, k++) { const d = Math.max(Cc[i] - B[i], Cc[i + 1] - B[i + 1], Cc[i + 2] - B[i + 2]); if (d > 2) { c++; if (d > m) m = d; } } return { lit: c, maxOver: m }; };
        const meshes = []; C.terrain.group.traverse((o) => { if (o.isMesh && o.visible) meshes.push(o); });
        const byMesh = [];
        for (const m of meshes) {
          m.visible = false; freeze(); E.render(0); gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, Cc); m.visible = true;
          let gone = 0; for (let i = 0, k = 0; i < Cc.length; i += 4, k++) { if (!litMask[k]) continue; const d = Math.max(Cc[i] - B[i], Cc[i + 1] - B[i + 1], Cc[i + 2] - B[i + 2]); if (d <= 2) gone++; }
          if (gone) byMesh.push({ mesh: m.name || m.type, gone, renderOrder: m.renderOrder, material: Array.isArray(m.material) ? m.material.map((x) => x?.name || x?.type) : (m.material?.name || m.material?.type || null), cacheKey: Array.isArray(m.material) ? m.material.map((x) => x?.customProgramCacheKey?.() ?? null) : (m.material?.customProgramCacheKey?.() ?? null), at: m.geometry?.boundingSphere ? [Math.round(m.geometry.boundingSphere.center.x + m.position.x), Math.round(m.geometry.boundingSphere.center.z + m.position.z)] : null });
        }
        byMesh.sort((a, b) => b.gone - a.gone);
        out.hg5.byMesh = byMesh.slice(0, 12);
        /* the sky's colours as the shaders read them from uniforms, not from a light: the fog's horizon, zenith and sun
         * in-scatter (calFog*: the far-form air, the ground's wet-film sky reflection, terrain.js gSky), the cloud sea's and
         * the dome's horizon band (aerial.js AERIAL_DOME). With them black, a ground pixel still over the floor is light the
         * ground's surface makes itself */
        const Aer = await import('/src/world/island/aerial.js');
        const keepC = ['calFogHorizon', 'calFogZenith', 'calFogSun', 'calCloudSeaCol'].filter((k) => U[k]?.value?.isColor).map((k) => [k, U[k].value.clone()]);
        const dome0 = Aer.AERIAL_DOME.value.clone();
        for (const [k] of keepC) U[k].value.setRGB(0, 0, 0);
        Aer.AERIAL_DOME.value.setRGB(0, 0, 0);
        freeze(); E.render(0); gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, Cc);
        out.hg5.skyColoursOff = { ...countLit(), what: 'calFogHorizon, calFogZenith, calFogSun, calCloudSeaCol and AERIAL_DOME black: the sky colours the shaders read from uniforms' };
        for (const [k, v] of keepC) U[k].value.copy(v);
        Aer.AERIAL_DOME.value.copy(dome0);
      } catch (e) { out.hg5.findError = String(e?.message || e).slice(0, 300); }
      while (undo.length) undo.pop()();
      env._lightDirty = true; env._applyTime?.(0, true);
      E.render(0);
    } catch (e) { out.hg5 = { ...(out.hg5 || {}), error: String(e?.message || e).slice(0, 300) }; }
  }

  /* ---- M2 fix wave (HG6, the Yards' far form "fogged and lit like the rest"): its pixels in the frame (the frame drawn
   * with and without it), their mean display colour against what they hide, the same with the air off (its own lit
   * colour) and with the sun off (its sky fill alone), and the ground just under the rim beside it for comparison ---- */
  if (frame?.id === 'F45' || frame?.id === 'F45-trade') {
    try {
      const ky = C.terrain?.kilnYards?.group;
      if (!ky) throw new Error('no Kiln Yards far form');
      const gl = R.getContext();
      const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
      const A = new Uint8Array(bw * bh * 4), B = new Uint8Array(bw * bh * 4), Cc = new Uint8Array(bw * bh * 4);
      const draw = (buf) => { E.render(0); E.render(0); gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf); };
      draw(A); ky.visible = false; draw(B); ky.visible = true;
      const mask = new Uint8Array(bw * bh); let n = 0;
      for (let i = 0, k = 0; i < A.length; i += 4, k++) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 6) { mask[k] = 1; n++; }
      const mean = (buf) => { const s = [0, 0, 0]; for (let i = 0, k = 0; i < buf.length; i += 4, k++) if (mask[k]) { s[0] += buf[i]; s[1] += buf[i + 1]; s[2] += buf[i + 2]; } return n ? s.map((v) => Math.round(v / n)) : null; };
      const Y = (c) => (c ? Math.round(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) : null);
      const U = env.u, fa = U.calFogA.value.clone();
      U.calFogA.value.x = 1e-9; draw(Cc); const airOff = mean(Cc); U.calFogA.value.copy(fa);
      const lights = []; C.scene.traverse((o) => { if (o.isDirectionalLight) { lights.push([o, o.intensity]); o.intensity = 0; } });
      for (const l of (E.csm?.lights || [])) { if (!lights.find((q) => q[0] === l)) { lights.push([l, l.intensity]); l.intensity = 0; } }
      draw(Cc); const sunOff = mean(Cc);
      for (const [l, v] of lights) l.intensity = v;
      E.render(0);
      const site = C.terrain.kilnYards ? { x: Math.round(ky.children[0]?.geometry?.boundingSphere?.center?.x ?? 0), z: Math.round(ky.children[0]?.geometry?.boundingSphere?.center?.z ?? 0) } : null;
      const dist = site ? Math.round(Math.hypot(site.x - cam.position.x, site.z - cam.position.z)) : null;
      const mats = ky.children.map((m) => ({ name: m.material?.name, fog: m.material?.fog, registered: !!env._matSeen?.has?.(m.material), color: m.material?.color?.getHexString?.(), emissive: m.material?.emissive?.getHexString?.(), envMap: !!m.material?.envMap }));
      out.kilnYards = { pixels: n, asDrawn: mean(A), behind: mean(B), yDrawn: Y(mean(A)), yBehind: Y(mean(B)), airOff, yAirOff: Y(airOff), sunOff, ySunOff: Y(sunOff), distM: dist, materials: mats,
        note: 'display sRGB means over the far form\'s own pixels; behind = the same pixels with the form hidden (the dust or sky it stands in)' };
    } catch (e) { out.kilnYards = { error: String(e?.message || e).slice(0, 300) }; }
  }

  if (frame?.id === 'F45-trade') {
    /* ---- EN5: the share of the frame's lit ground under a cloud shadow (the same frame with the shadows off) ---- */
    try {
      const sw = env.perfSwitches?.().find((s) => s.id === 'cloud-shadow');
      if (sw) {
        const gl = R.getContext();
        const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
        const a = new Uint8Array(bw * bh * 4), b = new Uint8Array(bw * bh * 4);
        E.render(0); gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, a);
        sw.off(); E.render(0); E.render(0); gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, b);
        sw.on(); E.render(0);
        let n = 0, shaded = 0, dsum = 0;
        for (let i = 0; i < a.length; i += 16) {
          const ya = 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2], yb = 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
          if (yb < 1) continue;
          n++;
          if (yb - ya > 2) { shaded++; dsum += (yb - ya) / yb; }
        }
        out.cloudShadow.inFrame = { samples: n, shadedShare: n ? Math.round(shaded / n * 1000) / 1000 : null, meanDarkening: shaded ? Math.round(dsum / shaded * 1000) / 1000 : null };
      }
    } catch (e) { out.cloudShadow = { ...(out.cloudShadow || {}), error: String(e?.message || e).slice(0, 300) }; }
  }
  return out;
}
