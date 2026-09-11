/* JUDGE round-2 cameras for world-ground. window.__JCAM__ selects the view,
 * window.__JNOGTAO__ blends GTAO out, window.__JNOSTRATA__ zeroes the bedding. */
(() => {
  const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain;
  const which = window.__JCAM__ || 'gate';
  ctx.environment?.setWeather?.('clear', 0);
  const p = ctx.player;
  p._updateCamera = () => {};
  if (ctx.studio) ctx.studio.update = () => {};
  if (window.__JNOGTAO__) {
    const passes = ctx.engine.composer?.passes || [];
    for (const ps of passes) if (ps && 'blendIntensity' in ps) ps.blendIntensity = 0;
  }
  if (window.__JNOSTRATA__ && T.setStrataStrength) T.setStrataStrength(0);
  let px, pz, cx, cy, cz, fov = 52, hour = 9.0;
  if (which === 'gate') { px = 22; pz = -6; cx = 22; cy = 120; cz = -330; }
  else if (which === 'close') { px = 0; pz = -250; cx = 0; cy = 80; cz = -400; hour = 12; }
  else if (which === 'scree') { px = -262; pz = 55; cx = -320; cy = 40; cz = 67; hour = 15; fov = 55; }
  else if (which === 'gate17') { px = 22; pz = -6; cx = 22; cy = 120; cz = -330; hour = 17.0; }
  else if (which === 'east') { px = 240; pz = 10; cx = 400; cy = 90; cz = 10; hour = 10.5; }
  else if (which === 'ground') { px = -40; pz = -60; cx = -40; cy = -8; cz = -95; hour = 12; fov = 60; }
  else if (which === 'river') { px = 60; pz = 120; cx = 20; cy = -2; cz = 175; hour = 11; fov = 58; }
  ctx.environment?.setTime?.(hour);
  p.position.set(px, 0, pz);
  p._snapToGround?.();
  ctx.vegetation?.forceStream?.(px, pz);
  const y = T.getHeight(px, pz);
  const shot = () => {
    cam.fov = fov; cam.updateProjectionMatrix();
    cam.position.set(px, y + (which === 'ground' ? 1.5 : 5.0), pz);
    cam.lookAt(cx, (which === 'gate' || which === 'gate17') ? y + cy : (which === 'ground' || which === 'river' ? y + cy : cy), cz);
    cam.updateMatrixWorld(true);
  };
  shot();
  setInterval(shot, 8);
  for (let i = 0; i < 4; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }
  return { which, hour, y };
})()
