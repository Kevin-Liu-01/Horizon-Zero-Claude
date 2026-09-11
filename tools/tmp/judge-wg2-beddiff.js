(() => {
  const ctx = __CTX__, T = ctx.terrain, cam = ctx.camera, r = ctx.renderer;
  const p = ctx.player; p._updateCamera = () => {}; if (ctx.studio) ctx.studio.update = () => {};
  ctx.environment?.setWeather?.('clear', 0); ctx.environment?.setTime?.(12.0);
  for (const ps of (ctx.engine.composer?.passes || [])) if (ps && 'blendIntensity' in ps) ps.blendIntensity = 0;
  const hidden = [];
  for (const g of [ctx.vegetation?.group, ctx.props?.group, ctx.machines?.group]) if (g && g.visible) { g.visible = false; hidden.push(g); }
  const gl = r.getContext();
  const W = r.domElement.width, H = r.domElement.height;
  const draw = (n) => { for (let i = 0; i < n; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); } };
  const grab = () => { draw(4); const b = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
  const views = window.__JVIEWS__;
  const out = {};
  for (const v of views) {
    p.position.set(v.px, 0, v.pz); p._snapToGround?.();
    const y = T.getHeight(v.px, v.pz);
    cam.fov = v.fov || 55; cam.updateProjectionMatrix();
    cam.position.set(v.px, y + (v.eye ?? 3.0), v.pz);
    cam.lookAt(v.cx, v.cy, v.cz); cam.updateMatrixWorld(true);
    T.setStrataStrength(1); const A = grab();
    T.setStrataStrength(0); const B = grab();
    T.setStrataStrength(1);
    let sq = 0, n = 0, peak = 0;
    for (let sy = Math.round(H * 0.25); sy < Math.round(H * 0.9); sy += 2)
      for (let sx = Math.round(W * 0.1); sx < Math.round(W * 0.9); sx += 2) {
        const o = (sy * W + sx) * 4;
        const d = (0.2126 * (A[o] - B[o]) + 0.7152 * (A[o + 1] - B[o + 1]) + 0.0722 * (A[o + 2] - B[o + 2])) / 255;
        sq += d * d; n++; const ab = Math.abs(d); if (ab > peak) peak = ab;
      }
    out[v.name] = { rms: +Math.sqrt(sq / n).toFixed(5), peak: +peak.toFixed(4) };
  }
  for (const g of hidden) g.visible = true;
  return out;
})()
