(async () => {
  const ctx = __CTX__, engine = ctx.engine, renderer = ctx.renderer, cam = ctx.camera;
  const T = ctx.terrain, gl = renderer.getContext(), p = ctx.player;
  p._updateCamera = () => {};
  if (ctx.studio) ctx.studio.update = () => {};
  ctx.environment?.setWeather?.('clear', 0);
  ctx.environment?.setTime?.(9.0);
  const draw = (n = 4) => { for (let i = 0; i < n; i++) { engine._shadowCullClock = 0; engine.render(0.05); } };
  const W = renderer.domElement.width, H = renderer.domElement.height;
  const grab = () => { const b = new Uint8Array(W * H * 4); draw(4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
  const stat = (A, B, x0, y0, x1, y1) => {
    let sq = 0, n = 0, peak = 0, sa = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const o = (y * W + x) * 4;
      const la = 0.2126 * A[o] + 0.7152 * A[o + 1] + 0.0722 * A[o + 2];
      const lb = 0.2126 * B[o] + 0.7152 * B[o + 1] + 0.0722 * B[o + 2];
      const d = (la - lb) / 255; sq += d * d; n++; sa += la;
      if (Math.abs(d) > peak) peak = Math.abs(d);
    }
    return { rms: +Math.sqrt(sq / n).toFixed(4), peak: +peak.toFixed(3), meanLuma: +(sa / n).toFixed(1) };
  };
  const setCam = (x, y, z, tx, ty, tz, fov) => {
    cam.fov = fov; cam.updateProjectionMatrix();
    cam.position.set(x, y, z); cam.lookAt(tx, ty, tz); cam.updateMatrixWorld(true);
  };
  const out = {};

  // ---- FAR: the V33 massif framing ----
  p.position.set(22, 0, -6); p._snapToGround?.(); ctx.vegetation?.forceStream?.(22, -6);
  let y = T.getHeight(22, -6);
  setCam(22, y + 5.0, -6, 22, y + 120, -330, 52);
  engine.gtao.enabled = false; const farOff = grab();
  engine.gtao.enabled = true;
  engine.gtao.updateGtaoMaterial({ screenSpaceRadius: false, radius: 0.55 }); const farShip = grab();
  engine.gtao.updateGtaoMaterial({ screenSpaceRadius: true, radius: 0.25 }); const farSSR = grab();
  const band = [Math.round(W * 0.05), Math.round(H * 0.30), Math.round(W * 0.95), Math.round(H * 0.75)];
  out.farShipVsOff = stat(farShip, farOff, ...band);
  out.farSSRVsOff = stat(farSSR, farOff, ...band);

  // ---- NEAR: camp ground, 2 m eye, where AO is supposed to earn its keep ----
  p.position.set(24, 0, 34); p._snapToGround?.(); ctx.vegetation?.forceStream?.(24, 34);
  y = T.getHeight(24, 34);
  setCam(24, y + 2.0, 34, 30, y + 0.2, 44, 55);
  engine.gtao.enabled = false; const nearOff = grab();
  engine.gtao.enabled = true;
  engine.gtao.updateGtaoMaterial({ screenSpaceRadius: false, radius: 0.55 }); const nearShip = grab();
  engine.gtao.updateGtaoMaterial({ screenSpaceRadius: true, radius: 0.25 }); const nearSSR = grab();
  const full = [0, 0, W, H];
  out.nearShipVsOff = stat(nearShip, nearOff, ...full);
  out.nearSSRVsOff = stat(nearSSR, nearOff, ...full);

  // restore the shipped configuration
  engine.gtao.updateGtaoMaterial({ screenSpaceRadius: false, radius: 0.55 });
  return out;
})()
