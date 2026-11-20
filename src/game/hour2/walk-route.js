/**
 * A WALKABLE LINE OVER THE ISLAND'S GROUND (Milestone 3 wave 3, area E): A* on a grid of `cell` m over a box, no step
 * steeper than `maxDeg`, the island's height handed in (`heightAt`, the recipe's in Node). The hour-two runner walks leg
 * 6's long legs along it (tools/gates/systems/hour-two.mjs): the game's nav grid does not cover the climb from Ninewalls
 * to the Malpais shelf, and a straight walk up the shelf's 33-37 deg south face stalls (run 20261120T202939Z, 'climb'
 * 104 m short). Pure: no THREE, no DOM. Returns waypoints thinned to one every `every` m, or null.
 */
export function walkRoute(heightAt, a, b, { cell = 2, maxDeg = 26, box = null, pad = 40, every = 10 } = {}) {
  const bx = box ?? [Math.min(a.x, b.x) - pad, Math.min(a.z, b.z) - pad, Math.max(a.x, b.x) + pad, Math.max(a.z, b.z) + pad];
  const [x0, z0, x1, z1] = bx, nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1, N = nx * nz;
  const H = new Float32Array(N);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = heightAt(x0 + i * cell, z0 + j * cell);
  const tan = Math.tan(maxDeg * Math.PI / 180);
  const cl = (v, n) => Math.max(0, Math.min(n - 1, v));
  const si = cl(Math.round((a.x - x0) / cell), nx), sj = cl(Math.round((a.z - z0) / cell), nz);
  const gi = cl(Math.round((b.x - x0) / cell), nx), gj = cl(Math.round((b.z - z0) / cell), nz);
  const s = sj * nx + si, goal = gj * nx + gi;
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
      if (shut[kk]) continue;
      const d = Math.hypot(di, dj) * cell, dh = Math.abs(H[kk] - H[k]);
      if (dh / d > tan) continue;
      const c = g[k] + d + dh;
      if (c < g[kk]) { g[kk] = c; from[kk] = k; push(c + heur(kk), kk); }
    }
  }
  if (from[goal] < 0 && goal !== s) return null;
  const path = [];
  for (let k = goal; k >= 0; k = from[k]) path.push({ x: +(x0 + (k % nx) * cell).toFixed(1), z: +(z0 + ((k / nx) | 0) * cell).toFixed(1) });
  path.reverse();
  const out = [path[0]];
  for (const q of path) if (Math.hypot(q.x - out.at(-1).x, q.z - out.at(-1).z) >= every) out.push(q);
  if (out.at(-1) !== path.at(-1)) out.push(path.at(-1));
  return out;
}
