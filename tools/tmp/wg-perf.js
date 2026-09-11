(async () => {
  const ctx = __CTX__;
  const r = ctx.renderer;
  const p = ctx.player;
  p.position.set(-40, 0, -60); p._snapToGround?.();
  ctx.vegetation?.forceStream?.(-40, -60);
  await new Promise(res => setTimeout(res, 1200));
  const sample = async (label) => {
    const frames = [];
    let last = performance.now();
    await new Promise(res => {
      let n = 0;
      const tick = () => { const t = performance.now(); if (n > 10) frames.push(t - last); last = t; n++; if (n < 100) requestAnimationFrame(tick); else res(); };
      requestAnimationFrame(tick);
    });
    frames.sort((a, b) => a - b);
    return { label, med: +frames[Math.floor(frames.length / 2)].toFixed(2), calls: r.info.render.calls, tris: r.info.render.triangles };
  };
  const all = await sample('all');
  ctx.vegetation.group.visible = false;
  const noVeg = await sample('noVeg');
  ctx.vegetation.group.visible = true;
  ctx.terrain.mesh.visible = false;
  if (ctx.terrain.farRanges) ctx.terrain.farRanges.visible = false;
  const noTerrain = await sample('noTerrainMesh');
  ctx.terrain.mesh.visible = true;
  if (ctx.terrain.farRanges) ctx.terrain.farRanges.visible = true;
  return JSON.stringify({ all, noVeg, noTerrain, stats: ctx.vegetation.grassStats() });
})()
