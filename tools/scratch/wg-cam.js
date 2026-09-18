(() => {
  const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain, p = ctx.player;
  ctx.environment?.setWeather?.('clear', 0);
  ctx.environment?.setTime?.(11.0);
  p._updateCamera = () => {};
  if (ctx.studio) ctx.studio.update = () => {};
  const C = window.__WGCAM__;
  p.position.set(C.px, 0, C.pz); p._snapToGround?.();
  ctx.vegetation?.forceStream?.(C.cx, C.cz);
  const y = T.getHeight(C.cx, C.cz);
  const shot = () => {
    cam.fov = C.fov || 55; cam.updateProjectionMatrix();
    cam.position.set(C.cx, y + C.h, C.cz);
    cam.lookAt(C.tx, C.ty, C.tz);
    cam.updateMatrixWorld(true);
  };
  shot(); setInterval(shot, 8);
  for (let i = 0; i < 5; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }
})()
