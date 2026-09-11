(() => {
  const T = __CTX__.terrain;
  const e = 0.5;
  const buckets = {};
  const steepSamples = [];
  for (let a = 0; a < 6.283; a += 0.01) {
    for (let rr = 10; rr <= 430; rr += 5) {
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const y = T.getHeight(x, z);
      const gx = (T.beddingAt(x + e, y, z).bh - T.beddingAt(x - e, y, z).bh) / (2 * e);
      const gz = (T.beddingAt(x, y, z + e).bh - T.beddingAt(x, y, z - e).bh) / (2 * e);
      const g = Math.hypot(gx, gz);
      // slope: how steep is the ground here (the shader gates on the normal)
      const n = T.getNormal(x, z);
      const steepF = 1 - n.y;   // 0 flat, ~1 vertical
      const key = Math.floor(rr / 40) * 40;
      (buckets[key] || (buckets[key] = [])).push(g);
      if (steepF > 0.20) steepSamples.push({ r: +rr, g: +g.toFixed(2), s: +steepF.toFixed(2) });
    }
  }
  const out = {};
  for (const k of Object.keys(buckets)) {
    const v = buckets[k].sort((p, q) => p - q);
    out[k] = { p50: +v[Math.floor(v.length * 0.5)].toFixed(3), p99: +v[Math.floor(v.length * 0.99)].toFixed(3), max: +v[v.length - 1].toFixed(3), n: v.length };
  }
  steepSamples.sort((p, q) => q.g - p.g);
  return { byRadius: out, steepCount: steepSamples.length, worstSteep: steepSamples.slice(0, 12) };
})()
