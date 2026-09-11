/* Screen-space banding metric for the rim (world-ground fix round 2).
 *
 * Films the V33 camera with core-platform's GTAO blended out — this gate
 * measures THIS lane's terrain shading, and the GTAO tile grid is a separate,
 * independently reported artefact that belongs to engine.js — then, on a
 * rectangle that is pure massif, measures how much of the vertical luminance
 * variation is PERIODIC rather than natural rock. A contour map / wood veneer
 * puts most of its energy in one spectral bin; real rock spreads it.
 */
(() => {
  const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain, r = ctx.renderer;
  ctx.environment?.setWeather?.('clear', 0);
  ctx.environment?.setTime?.(9.0);
  const p = ctx.player;
  p._updateCamera = () => {};
  if (ctx.studio) ctx.studio.update = () => {};
  for (const ps of (ctx.engine.composer?.passes || [])) {
    if (ps && ps.constructor && /GTAO/i.test(ps.constructor.name)) {
      ps.enabled = false; if ('blendIntensity' in ps) ps.blendIntensity = 0;
    }
  }
  // hide everything that is not terrain so the sample rectangle cannot catch a
  // tree trunk and read its edge as a band
  const hidden = [];
  for (const g of [ctx.vegetation?.group, ctx.props?.group, ctx.machines?.group]) {
    if (g && g.visible) { g.visible = false; hidden.push(g); }
  }
  p.position.set(22, 0, -6);
  p._snapToGround?.();
  const y = T.getHeight(22, -6);
  cam.fov = 52; cam.updateProjectionMatrix();
  cam.position.set(22, y + 5.0, -6);
  cam.lookAt(22, y + 120, -330);
  cam.updateMatrixWorld(true);
  for (let i = 0; i < 5; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }

  const gl = r.getContext();
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  for (const g of hidden) g.visible = true;

  /* ---------------------------------------------------------------------
   * WHAT IS MEASURED, AND WHY IT IS ORIENTATION AND NOT PERIODICITY.
   *
   * V33 asks the wall FOR bedding, so "how periodic is the vertical profile"
   * is the wrong test — clean bench lines score high on it and so does a wood
   * veneer. What separates them is DIRECTION. A bedding plane draws a
   * horizontal trace across the face: its luminance gradient points up/down
   * and almost never sideways. A contour-map fingerprint swirls, so its
   * gradient points every way at once.
   *
   * So: high-pass the massif rectangle, then take the structure tensor of the
   * residual. horizFrac is the share of gradient energy that is VERTICAL,
   * i.e. the share of the pattern that is made of horizontal lines. A ratio
   * cannot be gamed by flattening the wall — that is what rmsRel is for, and
   * the gate requires BOTH.
   * ------------------------------------------------------------------- */
  const RECTS = [[0.05, 0.34, 0.27, 0.70], [0.60, 0.30, 0.95, 0.66]];
  const lumAt = (x, y) => {
    const o = (((H - 1 - y) * W) + x) * 4;
    return (0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]) / 255;
  };
  let sgx = 0, sgy = 0, srms = 0, smean = 0, nPix = 0;
  const RB = 12;                     // high-pass radius, px
  for (const [x0, y0, x1, y1] of RECTS) {
    const cx0 = Math.round(x0 * W), cx1 = Math.round(x1 * W);
    const ry0 = Math.round(y0 * H), ry1 = Math.round(y1 * H);
    const w = cx1 - cx0, h = ry1 - ry0;
    const raw = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i2 = 0; i2 < w; i2++) raw[j * w + i2] = lumAt(cx0 + i2, ry0 + j);
    // separable box low-pass -> high-pass residual
    const a = new Float32Array(w * h), lo = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i2 = 0; i2 < w; i2++) {
      let s2 = 0, c = 0;
      for (let k = -RB; k <= RB; k++) { const u = i2 + k; if (u < 0 || u >= w) continue; s2 += raw[j * w + u]; c++; }
      a[j * w + i2] = s2 / c;
    }
    for (let j = 0; j < h; j++) for (let i2 = 0; i2 < w; i2++) {
      let s2 = 0, c = 0;
      for (let k = -RB; k <= RB; k++) { const v = j + k; if (v < 0 || v >= h) continue; s2 += a[v * w + i2]; c++; }
      lo[j * w + i2] = s2 / c;
    }
    for (let j = 1; j < h - 1; j++) for (let i2 = 1; i2 < w - 1; i2++) {
      const o = j * w + i2;
      const hp0 = raw[o] - lo[o];
      const gx = (raw[o + 1] - lo[o + 1]) - (raw[o - 1] - lo[o - 1]);
      const gy = (raw[o + w] - lo[o + w]) - (raw[o - w] - lo[o - w]);
      sgx += gx * gx; sgy += gy * gy;
      srms += hp0 * hp0; smean += raw[o]; nPix++;
    }
  }
  const mean = smean / Math.max(1, nPix);
  return {
    W, H, pixels: nPix,
    horizFrac: +(sgy / Math.max(1e-9, sgx + sgy)).toFixed(4),
    rmsRel: +(Math.sqrt(srms / Math.max(1, nPix)) / Math.max(1e-4, mean)).toFixed(5),
    meanLum: +mean.toFixed(4),
  };
})()
