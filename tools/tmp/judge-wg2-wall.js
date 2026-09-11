(() => {
  const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain;
  const p = ctx.player; p._updateCamera = () => {}; if (ctx.studio) ctx.studio.update = () => {};
  ctx.environment?.setWeather?.('clear', 0); ctx.environment?.setTime?.(11.0);
  for (const ps of (ctx.engine.composer?.passes || [])) if (ps && 'blendIntensity' in ps) ps.blendIntensity = 0;
  const px = window.__JPX__, pz = window.__JPZ__;
  p.position.set(px, 0, pz); p._snapToGround?.();
  ctx.vegetation?.forceStream?.(px, pz);
  const y = T.getHeight(px, pz);
  const dx = window.__JDX__, dz = window.__JDZ__;
  const shot = () => {
    cam.fov = 60; cam.updateProjectionMatrix();
    cam.position.set(px, y + 1.7, pz);
    cam.lookAt(px + dx, y + (window.__JDY__ ?? 6), pz + dz);
    cam.updateMatrixWorld(true);
  };
  shot(); setInterval(shot, 8);
  for (let i = 0; i < 4; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }
  return { y, r: Math.hypot(px, pz) };
})()
