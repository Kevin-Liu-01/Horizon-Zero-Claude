(() => {
  const T = __CTX__.terrain;
  const thash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
  const tnoise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = thash(ix, iy), b = thash(ix + 1, iy), c = thash(ix, iy + 1), d = thash(ix + 1, iy + 1);
    const t = a + (b - a) * fx, u = c + (d - c) * fx;
    return t + (u - t) * fy;
  };
  const bhOld = (x, y, z) => {
    const sec = tnoise(x * 0.012 + y * 0.0055, z * 0.012 + y * -0.0041);
    const dipA = sec * 6.28318;
    return y + (x * Math.cos(dipA) + z * Math.sin(dipA)) * 0.44;
  };
  const bhNew = (x, y, z) => T.beddingAt(x, y, z).bh;
  const scan = (f) => {
    const g = [], e = 0.5;
    for (let a = 0; a < 6.283; a += 0.02) {
      for (let r = 300; r <= 430; r += 4) {
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const y = T.getHeight(x, z);
        const gx = (f(x + e, y, z) - f(x - e, y, z)) / (2 * e);
        const gz = (f(x, y, z + e) - f(x, y, z - e)) / (2 * e);
        g.push(Math.hypot(gx, gz));
      }
    }
    g.sort((p, q) => p - q);
    const q = (t) => g[Math.min(g.length - 1, Math.floor(t * g.length))];
    return { n: g.length, p50: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3), p99: +q(0.99).toFixed(3), max: +g[g.length - 1].toFixed(3) };
  };
  return { old: scan(bhOld), fixed: scan(bhNew) };
})()
