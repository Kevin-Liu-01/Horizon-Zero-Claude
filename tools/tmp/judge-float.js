(() => {
  const ctx = __CTX__, T = ctx.terrain;
  const THREE = ctx.scene.constructor ? null : null;
  const out = [];
  const targets = [];
  ctx.scene.traverse(o => { if (o.isInstancedMesh && /rim-cliffs|rim-scree|talus|scree/i.test(o.name || '')) targets.push(o); });
  for (const im of targets) {
    const geo = im.geometry;
    const pos = geo.attributes.position;
    // local-space lowest y and radius
    let minY = Infinity;
    for (let i = 0; i < pos.count; i++) minY = Math.min(minY, pos.getY(i));
    const m = im.instanceMatrix.array;
    const rec = { name: im.name, count: im.count, minLocalY: +minY.toFixed(3), floats: [], sunk: 0, floating: 0, worst: null };
    for (let i = 0; i < im.count; i++) {
      const o = i * 16;
      // column-major 4x4: translation at 12,13,14; scale from column lengths
      const sx = Math.hypot(m[o], m[o+1], m[o+2]);
      const sy = Math.hypot(m[o+4], m[o+5], m[o+6]);
      const sz = Math.hypot(m[o+8], m[o+9], m[o+10]);
      const tx = m[o+12], ty = m[o+13], tz = m[o+14];
      // conservative: lowest point of the transformed AABB-ish along Y (rotation ignored -> approximate)
      const bottom = ty + minY * sy;
      const g = T.getHeight(tx, tz);
      const gap = bottom - g;
      if (gap > 0.6) rec.floating++;
      if (gap < -0.6) rec.sunk++;
      if (!rec.worst || gap > rec.worst.gap) rec.worst = { i, gap: +gap.toFixed(2), tx: +tx.toFixed(1), tz: +tz.toFixed(1), sx: +sx.toFixed(2), sy: +sy.toFixed(2), sz: +sz.toFixed(2), ty: +ty.toFixed(1), ground: +g.toFixed(1) };
      if (gap > 0.6 && rec.floats.length < 8) rec.floats.push({ gap: +gap.toFixed(2), x: +tx.toFixed(1), z: +tz.toFixed(1), sx: +sx.toFixed(2), sy: +sy.toFixed(2), sz: +sz.toFixed(2) });
    }
    out.push(rec);
  }
  return out;
})()
