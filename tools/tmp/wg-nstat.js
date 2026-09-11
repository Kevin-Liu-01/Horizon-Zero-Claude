(() => {
  const c = __CTX__, T = c.terrain;
  Object.assign(T.constructor.DBG, window.__WG_DBG__ || {});
  T.group.remove(T.mesh); T.mesh.geometry.dispose(); T._buildMesh();
  const g = T.mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal;
  const n = T._hg.n; const acc = [];
  for (let iz = 0; iz < n - 1; iz++) for (let ix = 0; ix < n - 1; ix++) {
    const i = iz * n + ix; const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z); if (r < 330 || r > 380) continue;
    const j = i + 1;
    const d = nor.getX(i) * nor.getX(j) + nor.getY(i) * nor.getY(j) + nor.getZ(i) * nor.getZ(j);
    acc.push(Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI);
  }
  acc.sort((p, q) => p - q);
  return JSON.stringify({ dbg: T.constructor.DBG, p50: +acc[acc.length >> 1].toFixed(1),
    p90: +acc[Math.floor(acc.length * 0.9)].toFixed(1), p99: +acc[Math.floor(acc.length * 0.99)].toFixed(1) });
})()
