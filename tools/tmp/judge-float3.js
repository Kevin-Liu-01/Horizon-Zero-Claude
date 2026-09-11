(() => {
  const ctx = __CTX__, T = ctx.terrain;
  const res = {};
  const targets = [];
  ctx.scene.traverse(o => { if (o.isInstancedMesh && /rim-cliffs|rim-scree/i.test(o.name || '')) targets.push(o); });
  for (const im of targets) {
    const m = im.instanceMatrix.array;
    const geo = im.geometry, pos = geo.attributes.position;
    // sample the true lowest ring of local vertices (y within 5% of min)
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const lows = [];
    const thr = minY + (maxY - minY) * 0.12;
    for (let i = 0; i < pos.count && lows.length < 400; i++) {
      if (pos.getY(i) <= thr) lows.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
    }
    const rows = [];
    for (let i = 0; i < im.count; i++) {
      const o = i * 16;
      let maxGap = -Infinity, at = null;
      for (const [lx, ly, lz] of lows) {
        const px = tx(o, 0) * lx + tx(o, 4) * ly + tx(o, 8) * lz + m[o + 12];
        const py = tx(o, 1) * lx + tx(o, 5) * ly + tx(o, 9) * lz + m[o + 13];
        const pz = tx(o, 2) * lx + tx(o, 6) * ly + tx(o, 10) * lz + m[o + 14];
        const gap = py - T.getHeight(px, pz);
        if (gap > maxGap) { maxGap = gap; at = [+px.toFixed(1), +py.toFixed(1), +pz.toFixed(1)]; }
      }
      rows.push({ i, gap: +maxGap.toFixed(2), x: +m[o + 12].toFixed(1), z: +m[o + 14].toFixed(1), at });
    }
    function tx(o, k) { return m[o + k]; }
    rows.sort((a, b) => b.gap - a.gap);
    res[im.name + '_inPlay'] = rows.filter(r => Math.hypot(r.x, r.z) < 345).slice(0, 6);
    res[im.name] = {
      count: rows.length, lowVerts: lows.length,
      over1m: rows.filter(r => r.gap > 1).length,
      over3m: rows.filter(r => r.gap > 3).length,
      over8m: rows.filter(r => r.gap > 8).length,
      median: rows[Math.floor(rows.length / 2)].gap,
      worst3: rows.slice(0, 3),
    };
  }
  return res;
})()
