(() => {
  const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain;
  ctx.environment?.setWeather?.('clear', 0);
  ctx.environment?.setTime?.(9.0);
  const p = ctx.player;
  p._updateCamera = () => {};
  if (ctx.studio) ctx.studio.update = () => {};
  p.position.set(22, 0, -6);
  p._snapToGround?.();
  const y = T.getHeight(22, -6);
  const shot = () => {
    cam.fov = 52; cam.updateProjectionMatrix();
    cam.position.set(22, y + 5.0, -6);
    cam.lookAt(22, y + 120, -330);
    cam.updateMatrixWorld(true);
  };
  shot(); setInterval(shot, 8);
  const names = [];
  ctx.scene.traverse(o => { if (o.name && (o.isMesh || o.isGroup)) names.push(o.name + (o.isMesh ? '' : '(g)')); });
  const HIDE = window.__WG_HIDE__ || '';
  if (HIDE) {
    const re = new RegExp(HIDE);
    ctx.scene.traverse(o => { if (o.name && re.test(o.name)) o.visible = false; });
  }
  for (let i = 0; i < 4; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }
  return names.slice(0, 200).join(',');
})()
