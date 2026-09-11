/* Bedding-orientation probe (world-ground fix round 2, gate A63).
 *
 * Renders the V33 camera twice — beds on, beds off — and differences the two
 * framebuffers. The difference is the bedding term ALONE. Then takes the
 * structure tensor of that difference over the massif: bedding planes draw
 * horizontal traces, so their gradient points up and down; the wood-veneer
 * fingerprint swirled, so its gradient pointed everywhere.
 */
(() => {
  const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain, r = ctx.renderer;
  ctx.environment?.setWeather?.('clear', 0);
  ctx.environment?.setTime?.(12.0);
  const p = ctx.player;
  p._updateCamera = () => {};
  if (ctx.studio) ctx.studio.update = () => {};
  for (const ps of (ctx.engine.composer?.passes || [])) {
    if (ps && ps.constructor && /GTAO/i.test(ps.constructor.name)) {
      ps.enabled = false; if ('blendIntensity' in ps) ps.blendIntensity = 0;
    }
  }
  const hidden = [];
  for (const g of [ctx.vegetation?.group, ctx.props?.group, ctx.machines?.group]) {
    if (g && g.visible) { g.visible = false; hidden.push(g); }
  }
  /* 150 m from the wall, not 370: bandFar deliberately eases the beds off with
   * distance, so at the V33 camera the difference image is only two 8-bit
   * levels and the measurement floor is the framebuffer's own dither. This is
   * the same wall, filmed where the term it is measuring is actually on. */
  p.position.set(0, 0, -250);
  p._snapToGround?.();
  const y = T.getHeight(0, -250);
  cam.fov = 52; cam.updateProjectionMatrix();
  cam.position.set(0, y + 5.0, -250);
  cam.lookAt(0, 80, -400);
  cam.updateMatrixWorld(true);

  const gl = r.getContext();
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const grab = () => {
    for (let i = 0; i < 4; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }
    const buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  };
  T.setStrataStrength(1); const A = grab();
  T.setStrataStrength(0); const B = grab();
  T.setStrataStrength(1);
  for (const g of hidden) g.visible = true;

  const RECTS = [[0.10, 0.12, 0.92, 0.62]];
  const D0 = (x, sy) => {
    const o = (((H - 1 - sy) * W) + x) * 4;
    return ((0.2126 * (A[o] - B[o]) + 0.7152 * (A[o + 1] - B[o + 1])
           + 0.0722 * (A[o + 2] - B[o + 2]))) / 255;
  };
  let sgx = 0, sgy = 0, sq = 0, n = 0, peak = 0;
  for (const [x0, y0, x1, y1] of RECTS) {
    const cx0 = Math.round(x0 * W), cx1 = Math.round(x1 * W);
    const ry0 = Math.round(y0 * H), ry1 = Math.round(y1 * H);
    const w = cx1 - cx0, h = ry1 - ry0;
    // 3x3 pre-blur: the difference of two 8-bit buffers carries +-1 level of
    // isotropic dither, and an unfiltered gradient measures that, not the beds
    const d = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let s2 = 0, c = 0;
      for (let b = -1; b <= 1; b++) for (let a2 = -1; a2 <= 1; a2++) {
        const u = cx0 + i + a2, v = ry0 + j + b;
        if (u < 0 || u >= W || v < 0 || v >= H) continue;
        s2 += D0(u, v); c++;
      }
      d[j * w + i] = s2 / c;
    }
    const G = 3;
    for (let j = G; j < h - G; j++) for (let i = G; i < w - G; i++) {
      const o = j * w + i;
      const gx = d[o + G] - d[o - G];
      const gy = d[o + G * w] - d[o - G * w];
      sgx += gx * gx; sgy += gy * gy;
      sq += d[o] * d[o]; n++;
      const a2 = Math.abs(d[o]); if (a2 > peak) peak = a2;
    }
  }
  return {
    W, H, pixels: n,
    horizFrac: +(sgy / Math.max(1e-12, sgx + sgy)).toFixed(4),
    bedRms: +(Math.sqrt(sq / Math.max(1, n))).toFixed(5),
    bedPeak: +peak.toFixed(4),
  };
})()
