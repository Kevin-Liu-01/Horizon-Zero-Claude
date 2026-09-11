(() => {
  const c = __CTX__, T = c.terrain, cam = c.camera, r = c.renderer;
  const gl = r.getContext();
  const p = c.player; p._updateCamera = () => {}; if (c.studio) c.studio.update = () => {};
  c.environment?.setWeather?.('clear', 0);
  const out = {};
  const W = r.domElement.width, H = r.domElement.height;
  const buf = new Uint8Array(W * H * 4);
  const lumaOf = (x0, y0, w, h) => {
    gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let s = 0;
    for (let i = 0; i < w * h; i++) s += 0.3 * buf[i * 4] + 0.59 * buf[i * 4 + 1] + 0.11 * buf[i * 4 + 2];
    return s / (w * h);
  };
  for (const hr of [8, 12, 17]) {
    c.environment?.setTime?.(hr);
    // stand at r=300 inside the play disc, face the north rim
    p.position.set(0, 0, -300); p._snapToGround?.();
    c.vegetation?.forceStream?.(0, -300);
    const y = T.getHeight(0, -300);
    cam.fov = 55; cam.updateProjectionMatrix();
    cam.position.set(0, y + 2.0, -300);
    cam.lookAt(0, y + 40, -420);
    cam.updateMatrixWorld(true);
    for (let i = 0; i < 6; i++) { c.engine._shadowCullClock = 0; c.engine.render(0.05); }
    // upper-centre band = the wall (GL origin bottom-left)
    const wall = lumaOf(Math.round(W * 0.25), Math.round(H * 0.55), Math.round(W * 0.5), Math.round(H * 0.3));
    // lit meadow reference: same hour, look down at the meadow from the camp
    p.position.set(-40, 0, -60); p._snapToGround?.();
    c.vegetation?.forceStream?.(-40, -60);
    const my = T.getHeight(-40, -60);
    cam.position.set(-40, my + 3.2, -60);
    cam.lookAt(-40 + 8, my - 2, -60 + 8);
    cam.updateMatrixWorld(true);
    for (let i = 0; i < 6; i++) { c.engine._shadowCullClock = 0; c.engine.render(0.05); }
    const meadow = lumaOf(Math.round(W * 0.25), Math.round(H * 0.2), Math.round(W * 0.5), Math.round(H * 0.4));
    out['h' + hr] = { wall: +wall.toFixed(1), meadow: +meadow.toFixed(1), ratio: +(wall / meadow).toFixed(3) };
  }
  return JSON.stringify(out);
})()
