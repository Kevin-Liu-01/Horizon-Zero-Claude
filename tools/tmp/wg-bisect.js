(() => {
  const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain;
  ctx.environment?.setWeather?.('clear', 0);
  ctx.environment?.setTime?.(9.0);
  const p = ctx.player;
  p._updateCamera = () => {};
  if (ctx.studio) ctx.studio.update = () => {};
  p.position.set(22, 0, -6); p._snapToGround?.();
  const D = T.constructor.DBG;
  Object.assign(D, window.__WG_DBG__ || {});
  // rebuild the render mesh with the new height terms
  T.group.remove(T.mesh);
  T.mesh.geometry.dispose();
  T._buildMesh();
  if (window.__WG_FLAT__) {
    const M = T.mesh.material;
    const f = new M.constructor({ vertexColors: false, roughness: 0.94, metalness: 0, color: 0xffffff });
    ctx.environment.registerMaterial(f);
    T.mesh.material = f;
  }
  const y = T.getHeight(22, -6);
  const shot = () => {
    cam.fov = 52; cam.updateProjectionMatrix();
    cam.position.set(22, y + 5.0, -6);
    cam.lookAt(22, y + 120, -330);
    cam.updateMatrixWorld(true);
  };
  shot(); setInterval(shot, 8);
  for (let i = 0; i < 6; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }
  return JSON.stringify(D);
})()
