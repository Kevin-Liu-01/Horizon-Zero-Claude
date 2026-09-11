(() => {
  const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain;
  const P = new URLSearchParams(location.search);
  const num = (k, d) => (P.has(k) ? parseFloat(P.get(k)) : d);
  const hour = num('hour', NaN);
  ctx.environment?.setWeather?.('clear', 0);
  if (!Number.isNaN(hour)) ctx.environment?.setTime?.(hour);
  const p = ctx.player;
  p._updateCamera = () => {};
  if (ctx.studio) ctx.studio.update = () => {};
  const hide = (P.get('hide') || '').split(',').filter(Boolean);
  const info = {};
  for (const h of hide) {
    if (h === 'far' && T.farRanges) { T.farRanges.visible = false; info.far = 1; }
    if (h === 'cliffs' && T.cliffMeshes) { T.cliffMeshes.forEach ? T.cliffMeshes.forEach(m=>m.visible=false) : (T.cliffMeshes.visible=false); info.cliffs = 1; }
    if (h === 'mesh' && T.mesh) { T.mesh.visible = false; info.mesh = 1; }
    if (h === 'veg' && ctx.vegetation?.group) { ctx.vegetation.group.visible = false; info.veg = 1; }
    if (h === 'fog') { ctx.scene.fog = null; info.fog = 1; }
    if (h.startsWith('re:')) { const rx = new RegExp(h.slice(3), 'i'); let n = 0; ctx.scene.traverse(o => { if (o.name && rx.test(o.name)) { o.visible = false; n++; } }); info[h] = n; }
  }
  const cx = num('cx', 0), cz = num('cz', 0), ch = num('ch', 5), fov = num('fov', 52);
  const tx = num('tx', 0), ty = num('ty', 0), tz = num('tz', -330);
  const parkx = num('parkx', cx + 40), parkz = num('parkz', cz + 40);
  p.position.set(parkx, 0, parkz);
  p._snapToGround?.();
  ctx.vegetation?.forceStream?.(cx, cz);
  const y = T.getHeight(cx, cz);
  const shot = () => {
    cam.fov = fov; cam.updateProjectionMatrix();
    cam.position.set(cx, y + ch, cz);
    cam.lookAt(tx, ty, tz);
    cam.updateMatrixWorld(true);
  };
  shot();
  setInterval(shot, 8);
  for (let i = 0; i < 4; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }
  const sceneNames = [];
  ctx.scene.traverse(o => { if (o.visible && o.isMesh && /rim|far|cliff|scree|range/i.test(o.name||'')) sceneNames.push(o.name); });
  return { info, y: +y.toFixed(2), names: sceneNames.slice(0, 20), hasFar: !!T.farRanges, hasCliffs: !!T.cliffMeshes };
})()
