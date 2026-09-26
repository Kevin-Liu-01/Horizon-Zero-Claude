(async () => {
  const T = __CTX__.terrain;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = performance.now();
  while (!T._routeCoverDone && performance.now() - t0 < 45000) await sleep(200);
  const waited = Math.round(performance.now() - t0);
  const stats = T.routeCoverStats();
  const a0 = performance.now();
  const mask = T.maskAudit(2);
  const maskMs = Math.round(performance.now() - a0);
  const a1 = performance.now();
  const vc = T.vertexColorAudit(3);
  const vcMs = Math.round(performance.now() - a1);
  // the judge's own measure, on the full 512^2 grid
  const md = T._maskData;
  const N = md.N, sc = md.scale, v = new Uint8Array(12);
  let cells = 0, coverGap = 0, onFullBiome = 0, worstGap = 0, worstAt = null;
  for (let iz = 0; iz < N; iz++) {
    const wz = (iz + 0.5) * sc - 360;
    for (let ix = 0; ix < N; ix++) {
      const wx = (ix + 0.5) * sc - 360;
      if (wx * wx + wz * wz > 330 * 330) continue;
      cells++;
      T._maskTexel(wx, wz, v);
      const o = (iz * N + ix) * 4;
      const gap = (v[4] - md.d2[o]) / 255;
      if (gap > 0.02) {
        coverGap++;
        const bb = Math.max(md.d2[o + 3], md.d3[o], md.d3[o + 1], md.d3[o + 2], md.d3[o + 3]) / 255;
        if (bb > 0.9) onFullBiome++;
        if (gap > worstGap) { worstGap = gap; worstAt = [Math.round(wx), Math.round(wz)]; }
      }
    }
  }
  return {
    waitedMs: waited, done: !!T._routeCoverDone, stats,
    maskAudit: mask, maskMs, vertexAudit: vc, vcMs,
    judgeMeasure: { cells, coverGap, pct: +(100 * coverGap / cells).toFixed(3), onFullBiome, worstGap: +worstGap.toFixed(2), worstAt },
  };
})()
