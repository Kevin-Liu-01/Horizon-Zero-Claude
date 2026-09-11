(() => {
  const ctx = __CTX__, T = ctx.terrain;
  const res = {};
  const targets = [];
  ctx.scene.traverse(o => { if (o.isInstancedMesh && /rim-cliffs|rim-scree/i.test(o.name || '')) targets.push(o); });
  for (const im of targets) {
    const m = im.instanceMatrix.array;
    const rows = [];
    for (let i = 0; i < im.count; i++) {
      const o = i * 16;
      const sx = Math.hypot(m[o], m[o+1], m[o+2]);
      const sz = Math.hypot(m[o+8], m[o+9], m[o+10]);
      const sy = Math.hypot(m[o+4], m[o+5], m[o+6]);
      const tx = m[o+12], ty = m[o+13], tz = m[o+14];
      // footprint: ellipse of半 radius sx / sz, 12 samples, rotation folded in
      // by using the actual basis vectors (col0 = x axis, col2 = z axis)
      let maxGap = -Infinity, at = null;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const px = tx + m[o] * ca + m[o+8] * sa;
        const pz = tz + m[o+2] * ca + m[o+10] * sa;
        const g = T.getHeight(px, pz);
        // bottom of the disc/slab at this rim point (flat base for scree)
        const bottom = ty + (im.name === 'rim-scree' ? 0 : -1.0 * sy * 0.45);
        const gap = bottom - g;
        if (gap > maxGap) { maxGap = gap; at = [+px.toFixed(1), +pz.toFixed(1)]; }
      }
      rows.push({ i, gap: +maxGap.toFixed(2), x: +tx.toFixed(1), z: +tz.toFixed(1), sx: +sx.toFixed(1), sy: +sy.toFixed(1), sz: +sz.toFixed(1), at });
    }
    rows.sort((a, b) => b.gap - a.gap);
    res[im.name] = {
      count: rows.length,
      over1m: rows.filter(r => r.gap > 1).length,
      over3m: rows.filter(r => r.gap > 3).length,
      over8m: rows.filter(r => r.gap > 8).length,
      worst5: rows.slice(0, 5),
    };
  }
  return res;
})()
