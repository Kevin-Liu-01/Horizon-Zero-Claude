/**
 * CALIMA AT NOON, THE PAGE HALF (M2 wave 4, areas A+F; film.mjs --probe /tools/world/calima-noon-probe-page.mjs).
 * Runs after each frame's shot with the world frozen; every change is undone.
 *
 *   F45        the M1.1i weather probe (tools/look/calima-probe-page.mjs, read as F06's: visibility cards and the sun's
 *              radial profile with the lens turned onto it), plus:
 *                sun    { altitudeDeg }                                   EN4
 *                plumb  { sightRange, scale, reach, envScale }            EN3: a live Plumb's sight in the dust
 *                hg5    { material: [...], night: { hour, skyP50, skyMax, groundMax, groundOverSky, groundPx } }
 *                       the ground's materials (emissive colour, maps, intensity) and the lens at 00:30 with only the
 *                       ground and the sky drawn: ground pixels brighter than the sky's median (bar 0)
 *   F45-trade  sun, the cloud shadows' uniforms (EN5: strength, tile, offset) and their share of the ground in the frame
 *   any other  sun and the cloud shadows' uniforms only
 */
export async function probe(frame) {
  const C = window.__CTX__, E = C.engine, env = C.environment, cam = C.camera, R = E.renderer;
  const out = { frame: frame?.id, weather: env.weather, hour: env.time, sun: { altitudeDeg: Math.round((env.sunAltitudeDeg ?? NaN) * 10) / 10 } };
  const ca = env.u?.calCloudA?.value, co = env.u?.calCloudOff?.value;
  out.cloudShadow = ca ? { strength: +ca.z.toFixed(3), tileM: Math.round(1 / ca.x), threshold: +ca.y.toFixed(3), soft: +ca.w.toFixed(3), offset: co ? [+co.x.toFixed(4), +co.y.toFixed(4)] : null, texture: env.u.calCloudTex?.value?.name ?? null } : null;

  if (frame?.id === 'F45') {
    try {
      const base = await import('/tools/look/calima-probe-page.mjs');
      out.m11i = await base.probe({ ...frame, id: 'F06' });
    } catch (e) { out.m11i = { error: String(e?.message || e).slice(0, 300) }; }

    /* ---- the sight multiplier on a live Plumb ---- */
    try {
      const P = C.machines?.perception;
      P?.update?.(0);
      const pl = (C.machines?.list || []).find((m) => m && m.kind === 'plumb' && m.alive !== false);
      out.plumb = pl ? { sightRange: pl.sightRange ?? null, scale: P?.sightScale ?? null, reach: pl.sightRange != null && P?.sightScale != null ? Math.round(pl.sightRange * P.sightScale * 100) / 100 : null, envScale: env.perceptionScale, at: [Math.round(pl.position.x), Math.round(pl.position.z)] } : { error: 'no live Plumb' };
    } catch (e) { out.plumb = { error: String(e?.message || e) }; }

    /* ---- HG5: no emissive ground (the material, then a night read with only the ground and the sky drawn) ---- */
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
      const buf = new Uint8Array(bw * bh * 4);
      const h0 = env.time, w0 = env.weather;
      const hidden = [];
      const keep = new Set(['terrain', 'sky']);
      const hasLight = (o) => { let l = false; o.traverse((q) => { if (q.isLight) l = true; }); return l; };
      for (const ch of C.scene.children) if (ch.visible && !keep.has(ch.name) && !hasLight(ch)) { ch.visible = false; hidden.push(ch); }
      env.setWeather('trade', 0);
      env.setTime(0.5);
      E.render(0); E.render(0);
      // sky pixels by the sky's own pass: draw once with the ground hidden too, so what is left is the dome
      gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const withGround = buf.slice();
      const tg = C.scene.children.filter((c) => c.name === 'terrain');
      tg.forEach((c) => { c.visible = false; });
      E.render(0); E.render(0);
      gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      tg.forEach((c) => { c.visible = true; });
      const Y = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
      const sky = [], ground = [];
      for (let i = 0; i < bw * bh * 4; i += 16) {
        const a = Y(withGround, i), z = Y(buf, i);
        if (Math.abs(a - z) < 0.5 && withGround[i] === buf[i] && withGround[i + 1] === buf[i + 1]) sky.push(a); else ground.push(a);
      }
      sky.sort((x, y) => x - y);
      const p50 = sky.length ? sky[sky.length >> 1] : null, skyMax = sky.length ? sky[sky.length - 1] : null;
      let over = 0, gMax = 0;
      for (const g of ground) { if (g > gMax) gMax = g; if (p50 != null && g > p50) over++; }
      out.hg5.night = { hour: 0.5, skyP50: p50, skyMax, groundMax: Math.round(gMax * 10) / 10, groundOverSky: over, groundPx: ground.length, skyPx: sky.length, sampled: 'every 4th pixel' };
      for (const ch of hidden) ch.visible = true;
      env.setTime(h0);
      env.setWeather(w0, 0);
      E.render(0);
    } catch (e) { out.hg5 = { ...(out.hg5 || {}), error: String(e?.message || e).slice(0, 300) }; }
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
