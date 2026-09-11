(() => {
  const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain;
  ctx.environment?.setWeather?.('clear', 0);
  ctx.environment?.setTime?.(9.0);
  const p = ctx.player;
  p._updateCamera = () => {};
  if (ctx.studio) ctx.studio.update = () => {};
  p.position.set(22, 0, -6); p._snapToGround?.();
  const y = T.getHeight(22, -6);
  cam.fov = 52; cam.updateProjectionMatrix();
  cam.position.set(22, y + 5.0, -6);
  cam.lookAt(22, y + 120, -330);
  cam.updateMatrixWorld(true);
  const e = cam.matrixWorld.elements;
  const rx = [e[0], e[1], e[2]], uy = [e[4], e[5], e[6]], fz = [-e[8], -e[9], -e[10]];
  const th = Math.tan(cam.fov * 0.5 * Math.PI / 180), asp = 1600 / 900;
  const o = [cam.position.x, cam.position.y, cam.position.z];
  const cast = (px, py) => {
    const nx = 2 * px / 1600 - 1, ny = 1 - 2 * py / 900;
    const d = [0, 0, 0];
    for (let k = 0; k < 3; k++) d[k] = fz[k] + rx[k] * nx * th * asp + uy[k] * ny * th;
    const L = Math.hypot(d[0], d[1], d[2]);
    for (let k = 0; k < 3; k++) d[k] /= L;
    let hit = null;
    for (let t = 2; t < 1400; t += 1.0) {
      const X = o[0] + d[0] * t, Y = o[1] + d[1] * t, Z = o[2] + d[2] * t;
      if (Math.abs(X) > 470 || Math.abs(Z) > 470) break;
      if (Y <= T.getHeight(X, Z)) { hit = { t: +t.toFixed(0), x: +X.toFixed(0), y: +Y.toFixed(0), z: +Z.toFixed(0), r: +Math.hypot(X, Z).toFixed(0) }; break; }
    }
    return hit;
  };
  return JSON.stringify({
    plaidA: cast(950, 470), plaidB: cast(1050, 500), plaidC: cast(900, 520),
    swirl: cast(1000, 600), peak: cast(1050, 200),
  });
})()
