(() => {
  const T = __CTX__.terrain;
  const bearings = [0, 45, 90, 135, 180, 225, 270, 315];
  const rows = [];
  for (const b of bearings) {
    const a = b * Math.PI / 180;
    const cx = Math.sin(a), cz = -Math.cos(a);
    const prof = [];
    for (let r = 290; r <= 420; r += 10) prof.push(+T.getHeight(cx * r, cz * r).toFixed(1));
    let maxSlope = 0, at = 0;
    for (let r = 290; r <= 400; r += 2) {
      const h0 = T.getHeight(cx * r, cz * r), h1 = T.getHeight(cx * (r + 2), cz * (r + 2));
      const s = (h1 - h0) / 2;
      if (s > maxSlope) { maxSlope = s; at = r; }
    }
    const base = T.getHeight(cx * 300, cz * 300);
    let crest = -Infinity;
    for (let r = 300; r <= 470; r += 3) crest = Math.max(crest, T.getHeight(cx * r, cz * r));
    rows.push({ bearing: b, h300: +base.toFixed(1), h324: +T.getHeight(cx*324, cz*324).toFixed(1), h352: +T.getHeight(cx*352, cz*352).toFixed(1), crest: +crest.toFixed(1), relief: +(crest - base).toFixed(1), maxSlopeDeg: +(Math.atan(maxSlope) * 180 / Math.PI).toFixed(1), slopeAtR: at, prof });
  }
  return rows;
})()
