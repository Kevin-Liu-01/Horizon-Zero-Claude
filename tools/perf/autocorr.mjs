/**
 * M1.1e TILING CHECK — normalised autocorrelation of a top-down ground capture (Node, no browser).
 *
 *   autocorr(rgba, n, pxPerM, { hpM = 2, minM = 1, maxM = 20 })
 *
 * The capture's luma is high-passed (minus three box blurs of radius hpM / 2, sigma about hpM: the macro tone and
 * the lighting are not repetition), zero-meaned and zero-padded to 2n, and its autocorrelation is taken by FFT,
 * divided at each offset by the number of overlapping pixels (so a large shift is not damped by a small overlap)
 * and by the zero-offset value. A tiled texture shows as a peak at its repeat; noise and the central lobe do not
 * reach past minM. Returns the highest value at any offset with minM <= |d| <= maxM (and its offset in metres),
 * and the ring maxima per metre, for the acceptance line "peak under 0.3 at any offset below 20 m".
 */
function fft1(re, im, n, inv) {
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI / len) * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function fft2(re, im, n, inv) {
  const r = new Float64Array(n), c = new Float64Array(n);
  for (let y = 0; y < n; y++) {
    const o = y * n;
    for (let x = 0; x < n; x++) { r[x] = re[o + x]; c[x] = im[o + x]; }
    fft1(r, c, n, inv);
    for (let x = 0; x < n; x++) { re[o + x] = r[x]; im[o + x] = c[x]; }
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) { r[y] = re[y * n + x]; c[y] = im[y * n + x]; }
    fft1(r, c, n, inv);
    for (let y = 0; y < n; y++) { re[y * n + x] = r[y]; im[y * n + x] = c[y]; }
  }
}
/** |FFT|^2 then inverse: the (circular, here padded) autocorrelation, in place in re. */
function acOf(re, im, n) {
  fft2(re, im, n, false);
  for (let i = 0; i < n * n; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
  fft2(re, im, n, true);
}
function boxBlur(src, n, r) {
  const tmp = new Float64Array(n * n), out = new Float64Array(n * n);
  for (let y = 0; y < n; y++) {
    let s = 0, c = 0;
    for (let x = -r; x <= r; x++) if (x >= 0 && x < n) { s += src[y * n + x]; c++; }
    for (let x = 0; x < n; x++) {
      tmp[y * n + x] = s / c;
      const a = x - r, b = x + r + 1;
      if (a >= 0) { s -= src[y * n + a]; c--; }
      if (b < n) { s += src[y * n + b]; c++; }
    }
  }
  for (let x = 0; x < n; x++) {
    let s = 0, c = 0;
    for (let y = -r; y <= r; y++) if (y >= 0 && y < n) { s += tmp[y * n + x]; c++; }
    for (let y = 0; y < n; y++) {
      out[y * n + x] = s / c;
      const a = y - r, b = y + r + 1;
      if (a >= 0) { s -= tmp[a * n + x]; c--; }
      if (b < n) { s += tmp[b * n + x]; c++; }
    }
  }
  return out;
}

export function autocorr(rgba, n, pxPerM, { hpM = 2, minM = 1, maxM = 20 } = {}) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) L[i] = 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2];
  const r = Math.max(1, Math.round((hpM * pxPerM) / 2));
  let lo = L;
  for (let k = 0; k < 3; k++) lo = boxBlur(lo, n, r);
  let mean = 0;
  for (let i = 0; i < n * n; i++) { L[i] -= lo[i]; mean += L[i]; }
  mean /= n * n;
  const N2 = n * 2;
  const re = new Float64Array(N2 * N2), im = new Float64Array(N2 * N2);
  const mr = new Float64Array(N2 * N2), mi = new Float64Array(N2 * N2);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { re[y * N2 + x] = L[y * n + x] - mean; mr[y * N2 + x] = 1; }
  acOf(re, im, N2);
  acOf(mr, mi, N2);
  const zero = re[0] / mr[0];
  const minP = minM * pxPerM, maxP = maxM * pxPerM;
  let best = -1, at = null;
  const rings = new Array(Math.ceil(maxM)).fill(-1);
  for (let dy = -Math.floor(maxP); dy <= Math.floor(maxP); dy++) {
    for (let dx = 0; dx <= Math.floor(maxP); dx++) {           // the autocorrelation is symmetric: half the plane
      if (dx === 0 && dy < 0) continue;
      const d = Math.hypot(dx, dy);
      if (d < minP || d > maxP) continue;
      const o = ((dy + N2) % N2) * N2 + dx;
      const cnt = mr[o];
      if (cnt < 0.25 * n * n) continue;
      const v = (re[o] / cnt) / zero;
      if (v > best) { best = v; at = [dx / pxPerM, dy / pxPerM]; }
      const ri = Math.floor(d / pxPerM);
      if (ri < rings.length && v > rings[ri]) rings[ri] = v;
    }
  }
  return { peak: +best.toFixed(4), atM: at ? at.map((v) => +v.toFixed(2)) : null, ringMaxByMetre: rings.map((v) => +v.toFixed(3)),
    method: `luma high-passed (3 box blurs, radius ${r} px = ${(r / pxPerM).toFixed(2)} m), zero-padded FFT autocorrelation normalised per overlap and by zero offset; max over ${minM}-${maxM} m with overlap >= 25 %` };
}
