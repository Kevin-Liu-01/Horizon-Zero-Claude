/**
 * A WALKABLE LINE OVER THE ISLAND'S GROUND (Milestone 3 wave 3, area E): A* on a grid of `cell` m over a box, no step
 * steeper than `maxDeg`, the island's height handed in (`heightAt`: the recipe's in Node, the drawn terrain's sampled
 * in the page by the runner), and no cell inside the game's colliders (`blocked`, built by `footprint` from the
 * colliders in collision.register's shape, grown by the walker's `pad`). The hour-two runner walks leg 6's long legs
 * along it (tools/gates/systems/hour-two.mjs).
 *
 * Why (wave 3b): at 4c14e00 (run 20261121T014109Z-4c14e00-m3w3-review-hour2) the walk to Oro stalled against Ninewalls'
 * outer wall on the west face and the climb from Oro stalled between the crescent walls (wall-3 and wall-4, 48 m from
 * the tree): the line knew the ground and not the walls. At 3f3c32e a straight climb stalled 104 m short on the shelf's
 * 33-37 deg south face, so the slope bar stays.
 *
 * The line returned is thinned by sight: a waypoint is kept only where the straight walk from the last one would cross a
 * blocked cell, a step over the bar, or run past `every` m, so no leg between two waypoints cuts a wall's end. Pure: no
 * THREE, no DOM.
 *
 *   walkRoute(heightAt, a, b, { cell, maxDeg, box, pad, every, blocked }) -> [{ x, z }] | null
 *
 * The cell is 1 m (wave 3b): on 2 m (and on 1.5 m) cells the line through Ninewalls' south-west gap and the tube mouth's
 * forecourt opened or closed with the grid's phase (the Yards' corner from Oro: none on 2 m at any of three phases, and
 * one at every phase on 1 m; 100-160 ms in Node).
 *   footprint(colliders, pad) -> { blocked(x, z), n }
 */

const D2R = Math.PI / 180;

/**
 * The colliders' footprint on the ground, grown by `pad` m (the walker's radius and a margin). `colliders` are in
 * collision.register's shape ({ shape: { type: 'box', c, half, yaw } | { type: 'capsule', a, b, radius } |
 * { type: 'sphere', c, radius } }, as ninewallsColliders and yardsColliders give them) or the registered record's flat
 * fields ({ type: 'box', cx, cz, hx, hz, yaw, miny, maxy } | { type: 'capsule', ax, az, bx, bz, r } |
 * { type: 'sphere', cx, cz, r }). A box's yaw is collision's (local x = (cos yaw, -sin yaw) in the engine frame, as
 * nav.js _box reads it). Anything under 0.7 m tall is walked over (nav.js's rule).
 */
export function footprint(colliders, pad = 0.8, { minH = 0.7, bucket = 8 } = {}) {
  const items = [];
  for (const raw of colliders || []) {
    const s = raw?.shape ?? raw;
    if (!s || !s.type) continue;
    let it = null;
    if (s.type === 'box') {
      const cx = s.c ? s.c[0] : s.cx, cz = s.c ? s.c[2] : s.cz, hx = s.half ? s.half[0] : s.hx, hz = s.half ? s.half[2] : s.hz;
      const hy = s.half ? s.half[1] : s.hy ?? ((s.maxy ?? 0) - (s.miny ?? 0)) / 2;
      if (Number.isFinite(hy) && 2 * hy < minH) continue;
      const yaw = s.yaw ?? 0;
      it = { k: 0, cx, cz, hx, hz, cs: Math.cos(-yaw), sn: Math.sin(-yaw), R: Math.hypot(hx, hz) + pad };
    } else if (s.type === 'capsule') {
      const a = s.a ? [s.a[0], s.a[1], s.a[2]] : [s.ax, s.ay, s.az], b = s.b ? [s.b[0], s.b[1], s.b[2]] : [s.bx, s.by, s.bz];
      const r = s.radius ?? s.r;
      if (Number.isFinite(a[1]) && Number.isFinite(b[1]) && Math.abs(b[1] - a[1]) + 2 * r < minH) continue;
      const cx = (a[0] + b[0]) / 2, cz = (a[2] + b[2]) / 2;
      it = { k: 1, ax: a[0], az: a[2], bx: b[0], bz: b[2], r: r + pad, cx, cz, R: Math.hypot(b[0] - a[0], b[2] - a[2]) / 2 + r + pad };
    } else if (s.type === 'sphere') {
      const cx = s.c ? s.c[0] : s.cx, cz = s.c ? s.c[2] : s.cz, r = s.radius ?? s.r;
      if (2 * r < minH) continue;
      it = { k: 1, ax: cx, az: cz, bx: cx, bz: cz, r: r + pad, cx, cz, R: r + pad };
    }
    if (it && Number.isFinite(it.cx) && Number.isFinite(it.cz)) items.push(it);
  }
  // a bucket grid so a cell asks only the colliders near it
  const B = new Map(), key = (i, j) => `${i},${j}`;
  for (const it of items) {
    const i0 = Math.floor((it.cx - it.R) / bucket), i1 = Math.floor((it.cx + it.R) / bucket);
    const j0 = Math.floor((it.cz - it.R) / bucket), j1 = Math.floor((it.cz + it.R) / bucket);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); if (!B.has(k)) B.set(k, []); B.get(k).push(it); }
  }
  const p2 = pad * pad;
  const hit = (it, x, z) => {
    if (it.k === 0) {
      const rx = x - it.cx, rz = z - it.cz, lx = rx * it.cs - rz * it.sn, lz = rx * it.sn + rz * it.cs;
      const ex = Math.max(0, Math.abs(lx) - it.hx), ez = Math.max(0, Math.abs(lz) - it.hz);
      return ex * ex + ez * ez <= p2;
    }
    const dx = it.bx - it.ax, dz = it.bz - it.az, L2 = dx * dx + dz * dz;
    const t = L2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - it.ax) * dx + (z - it.az) * dz) / L2));
    const qx = it.ax + dx * t - x, qz = it.az + dz * t - z;
    return qx * qx + qz * qz <= it.r * it.r;
  };
  return {
    n: items.length,
    blocked(x, z) {
      const L = B.get(key(Math.floor(x / bucket), Math.floor(z / bucket)));
      if (!L) return false;
      for (const it of L) if (hit(it, x, z)) return true;
      return false;
    },
  };
}

export function walkRoute(heightAt, a, b, { cell = 1, maxDeg = 26, box = null, pad = 60, every = 10, blocked = null } = {}) {
  const bx = box ?? [Math.min(a.x, b.x) - pad, Math.min(a.z, b.z) - pad, Math.max(a.x, b.x) + pad, Math.max(a.z, b.z) + pad];
  // the grid's nodes on whole multiples of the cell, so the same ground gives the same line from any start
  const x0 = Math.floor(bx[0] / cell) * cell, z0 = Math.floor(bx[1] / cell) * cell, [, , x1, z1] = bx;
  const nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1, N = nx * nz;
  const H = new Float32Array(N), X = new Uint8Array(N);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * cell, z = z0 + j * cell;
    H[j * nx + i] = heightAt(x, z);
    if (blocked && blocked(x, z)) X[j * nx + i] = 1;
  }
  const tan = Math.tan(maxDeg * D2R);
  const cl = (v, n) => Math.max(0, Math.min(n - 1, v));
  const si = cl(Math.round((a.x - x0) / cell), nx), sj = cl(Math.round((a.z - z0) / cell), nz);
  let gi = cl(Math.round((b.x - x0) / cell), nx), gj = cl(Math.round((b.z - z0) / cell), nz);
  const s = sj * nx + si;
  X[s] = 0;   // she stands there
  // a goal inside a collider's pad (Oro by the tube mouth's jambs): the nearest free cell within 8 m of it
  if (X[gj * nx + gi]) {
    let best = null, bd = Infinity;
    const R = Math.ceil(8 / cell);
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const ii = gi + di, jj = gj + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz || X[jj * nx + ii]) continue;
      const d = Math.hypot(di, dj);
      if (d < bd) { bd = d; best = [ii, jj]; }
    }
    if (!best) return null;
    [gi, gj] = best;
  }
  const goal = gj * nx + gi;
  const g = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), shut = new Uint8Array(N);
  // binary heap of [f, k]
  const hk = [], hf = [];
  const push = (f, k) => { let i = hk.length; hk.push(k); hf.push(f); while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; } };
  const pop = () => {
    const k = hk[0], lk = hk.pop(), lf = hf.pop();
    if (hk.length) {
      hk[0] = lk; hf[0] = lf; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hk.length && hf[l] < hf[m]) m = l; if (r < hk.length && hf[r] < hf[m]) m = r; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m; }
    }
    return k;
  };
  const heur = (k) => Math.hypot((k % nx) - gi, ((k / nx) | 0) - gj) * cell;
  g[s] = 0; push(heur(s), s);
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (hk.length) {
    const k = pop();
    if (shut[k]) continue;
    shut[k] = 1;
    if (k === goal) break;
    const i = k % nx, j = (k / nx) | 0;
    for (const [di, dj] of D) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const kk = jj * nx + ii;
      if (shut[kk] || X[kk]) continue;
      // a diagonal does not squeeze between two blocked cells
      if (di && dj && (X[j * nx + ii] || X[jj * nx + i])) continue;
      const d = Math.hypot(di, dj) * cell, dh = Math.abs(H[kk] - H[k]);
      if (dh / d > tan) continue;
      const c = g[k] + d + dh;
      if (c < g[kk]) { g[kk] = c; from[kk] = k; push(c + heur(kk), kk); }
    }
  }
  if (from[goal] < 0 && goal !== s) return null;
  const path = [];
  for (let k = goal; k >= 0; k = from[k]) path.push(k);
  path.reverse();
  const P = (k) => ({ x: +(x0 + (k % nx) * cell).toFixed(1), z: +(z0 + ((k / nx) | 0) * cell).toFixed(1) });
  // thin by sight: the straight walk from the last kept point to path[q] stays on free cells and under the bar
  const hAt = (x, z) => {
    const fi = cl((x - x0) / cell, nx), fj = cl((z - z0) / cell, nz);
    const i = Math.min(nx - 2, Math.floor(fi)), j = Math.min(nz - 2, Math.floor(fj)), u = fi - i, v = fj - j;
    return H[j * nx + i] * (1 - u) * (1 - v) + H[j * nx + i + 1] * u * (1 - v) + H[(j + 1) * nx + i] * (1 - u) * v + H[(j + 1) * nx + i + 1] * u * v;
  };
  const freeAt = (x, z) => !X[cl(Math.round((z - z0) / cell), nz) * nx + cl(Math.round((x - x0) / cell), nx)];
  const clear = (p, q) => {
    const L = Math.hypot(q.x - p.x, q.z - p.z);
    if (L > every) return false;
    const n = Math.max(1, Math.ceil(L / (cell / 2)));
    let hp = hAt(p.x, p.z);
    for (let m = 1; m <= n; m++) {
      const x = p.x + (q.x - p.x) * (m / n), z = p.z + (q.z - p.z) * (m / n);
      if (!freeAt(x, z)) return false;
      const h = hAt(x, z);
      if (Math.abs(h - hp) / (L / n) > tan) return false;
      hp = h;
    }
    return true;
  };
  const out = [P(path[0])];
  let last = 0;
  for (let q = 2; q < path.length; q++) {
    if (!clear(out.at(-1), P(path[q]))) { out.push(P(path[q - 1])); last = q - 1; }
  }
  if (last !== path.length - 1 || out.length === 1) out.push(P(path.at(-1)));
  return out;
}
