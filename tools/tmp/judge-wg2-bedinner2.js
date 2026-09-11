(() => {
  const T = __CTX__.terrain;
  const e = 0.5;
  let worst = null; const rows = [];
  for (let a = 0; a < 6.283; a += 0.008) {
    for (let rr = 6; rr <= 440; rr += 3) {
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const y = T.getHeight(x, z);
      const gx = (T.beddingAt(x + e, y, z).bh - T.beddingAt(x - e, y, z).bh) / (2 * e);
      const gz = (T.beddingAt(x, y, z + e).bh - T.beddingAt(x, y, z - e).bh) / (2 * e);
      const g = Math.hypot(gx, gz);
      const n = T.getNormal(x, z);
      const steepF = 1 - Math.min(1, Math.max(0, n.y));
      if (steepF <= 0.09) continue;            // shelf-lowered gate floor
      rows.push({ r: rr, g, s: steepF });
      if (!worst || g > worst.g) worst = { r: rr, g: +g.toFixed(3), s: +steepF.toFixed(3), at: [+x.toFixed(0), +z.toFixed(0)] };
    }
  }
  rows.sort((p, q) => q.g - p.g);
  const top = rows.slice(0, 8).map(o => ({ r: o.r, g: +o.g.toFixed(2), s: +o.s.toFixed(2) }));
  // also: worst among points that clear the FULL steep gate (no shelf)
  const full = rows.filter(o => o.s > 0.36);
  full.sort((p, q) => q.g - p.g);
  return { n: rows.length, worstAnyShelfGate: worst, top,
           worstFullGate: full[0] ? { r: full[0].r, g: +full[0].g.toFixed(3), s: +full[0].s.toFixed(2) } : null,
           nFull: full.length };
})()
