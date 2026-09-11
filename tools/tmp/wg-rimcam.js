(() => {
  const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain;
  ctx.environment?.setWeather?.('clear', 0);
  ctx.environment?.setTime?.(9.0);
  const p = ctx.player;
  p._updateCamera = () => {};
  if (ctx.studio) ctx.studio.update = () => {};
  p.position.set(22, 0, -6);
  p._snapToGround?.();
  ctx.vegetation?.forceStream?.(22, -6);
  const y = T.getHeight(22, -6);
  const shot = () => {
    cam.fov = 52; cam.updateProjectionMatrix();
    cam.position.set(22, y + 5.0, -6);
    cam.lookAt(22, y + 120, -330);
    cam.updateMatrixWorld(true);
  };
  shot();
  setInterval(shot, 8);
  if (window.__WG_MODE__ === 'plainmat') {
    const THREE = ctx.THREE || (ctx.terrain.mesh.material.constructor);
    const m = ctx.terrain.mesh.material;
    const flat = new m.constructor({ vertexColors: true, roughness: 0.94, metalness: 0 });
    ctx.terrain.mesh.material = flat;
  }
  for (let i = 0; i < 4; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }
  return 'ok';
})()
