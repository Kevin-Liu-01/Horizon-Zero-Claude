(async () => {
  const ctx = __CTX__;
  const r = ctx.renderer;
  const p = ctx.player;
  p.position.set(-40, 0, -60); p._snapToGround?.();
  ctx.vegetation?.forceStream?.(-40, -60);
  await new Promise(res => setTimeout(res, 1200));
  const frames = [];
  let last = performance.now();
  await new Promise(res => {
    let n = 0;
    const tick = () => {
      const t = performance.now();
      frames.push(t - last); last = t; n++;
      if (n < 120) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
  frames.sort((a, b) => a - b);
  const med = frames[Math.floor(frames.length / 2)];
  return {
    medianFrameMs: +med.toFixed(2), fps: +(1000 / med).toFixed(1),
    p95ms: +frames[Math.floor(frames.length * 0.95)].toFixed(2),
    drawCalls: r.info.render.calls, triangles: r.info.render.triangles,
    programs: r.info.programs?.length, textures: r.info.memory.textures,
    geometries: r.info.memory.geometries,
    grass: ctx.vegetation.grassStats?.(),
    trees: ctx.vegetation.treeStats?.(),
  };
})()
