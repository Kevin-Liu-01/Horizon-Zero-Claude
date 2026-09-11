/* Rim albedo banding probe (world-ground fix round 2).
 *
 * Measures the HIGH-FREQUENCY residual of the terrain's vertex-colour
 * luminance on the rim band, which is what films as the "wood veneer /
 * fingerprint" contour map, and attributes it to the individual terms of
 * terrain.js pass 2.
 */
(() => {
  const T = __CTX__.terrain;
  const geo = T.mesh.geometry;
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  const hg = T._hg;
  const side = hg.n, step = hg.step, H = hg.H;
  const N = side * side;

  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    lum[i] = 0.2126 * col.getX(i) + 0.7152 * col.getY(i) + 0.0722 * col.getZ(i);
  }

  // separable box blur over the grid, radius R nodes
  const blur = (src, R) => {
    const a = new Float32Array(N), b = new Float32Array(N);
    for (let z = 0; z < side; z++) {
      for (let x = 0; x < side; x++) {
        let s = 0, c = 0;
        for (let k = -R; k <= R; k++) {
          const xx = x + k; if (xx < 0 || xx >= side) continue;
          s += src[z * side + xx]; c++;
        }
        a[z * side + x] = s / c;
      }
    }
    for (let z = 0; z < side; z++) {
      for (let x = 0; x < side; x++) {
        let s = 0, c = 0;
        for (let k = -R; k <= R; k++) {
          const zz = z + k; if (zz < 0 || zz >= side) continue;
          s += a[zz * side + x]; c++;
        }
        b[z * side + x] = s / c;
      }
    }
    return b;
  };

  const stat = (field, R, mask) => {
    const lo = blur(field, R);
    const vals = [];
    let mean = 0, n = 0;
    for (let i = 0; i < N; i++) {
      if (!mask(i)) continue;
      vals.push(Math.abs(field[i] - lo[i]));
      mean += lo[i]; n++;
    }
    vals.sort((a, b) => a - b);
    mean /= Math.max(1, n);
    const q = (p) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : 0;
    return {
      n, mean: +mean.toFixed(4),
      p50: +q(0.5).toFixed(5), p95: +q(0.95).toFixed(5), p99: +q(0.99).toFixed(5),
      relP95: +(q(0.95) / Math.max(1e-4, mean)).toFixed(4),
      relP99: +(q(0.99) / Math.max(1e-4, mean)).toFixed(4),
    };
  };

  const rOf = (i) => Math.hypot(pos.getX(i), pos.getZ(i));
  const rimMask = (i) => { const r = rOf(i); return r > 300 && r < 440; };
  const nearMask = (i) => { const r = rOf(i); return r > 300 && r < 360; };
  const meadowMask = (i) => rOf(i) < 200;

  // ---- candidate terms, recomputed from the same inputs -------------------
  const SS = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const W = 8;
  const gW = new Float32Array(N), mSf = new Float32Array(N), sunF = new Float32Array(N), mSharp = new Float32Array(N);
  for (let iz = 0; iz < side; iz++) {
    for (let ix = 0; ix < side; ix++) {
      const i = iz * side + ix;
      const iL = ix > 0 ? i - 1 : i, iR = ix < side - 1 ? i + 1 : i;
      const iD = iz > 0 ? i - side : i, iU = iz < side - 1 ? i + side : i;
      const gx = (H[iR] - H[iL]) / (((iR - iL) || 1) * step);
      const gz = (H[iU] - H[iD]) / ((((iU - iD) / side) || 1) * step);
      mSharp[i] = Math.hypot(gx, gz);
      const iLw = i - Math.min(ix, W), iRw = i + Math.min(side - 1 - ix, W);
      const iDw = i - Math.min(iz, W) * side, iUw = i + Math.min(side - 1 - iz, W) * side;
      const gxW = (H[iRw] - H[iLw]) / (Math.max(1, iRw - iLw) * step);
      const gzW = (H[iUw] - H[iDw]) / (Math.max(1, (iUw - iDw) / side) * step);
      gW[i] = Math.hypot(gxW, gzW);
      sunF[i] = 0.55 * gxW + 0.72 * gzW;
      mSf[i] = gW[i];
    }
  }
  const warmShade = new Float32Array(N);
  for (let i = 0; i < N; i++) warmShade[i] = SS(sunF[i], 0.06, 1.0) - SS(-sunF[i], 0.06, 1.0);
  const splat = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const m = mSf[i];
    splat[i] = (m > 0.5 ? SS(m, 0.5, 0.85) : 0) + (m > 0.75 ? SS(m, 0.75, 1.25) : 0);
  }
  const HS = hg.HS || H;
  const gS = new Float32Array(N);
  for (let iz = 0; iz < side; iz++) {
    for (let ix = 0; ix < side; ix++) {
      const i = iz * side + ix, Wq = 4;
      const iLw = i - Math.min(ix, Wq), iRw = i + Math.min(side - 1 - ix, Wq);
      const iDw = i - Math.min(iz, Wq) * side, iUw = i + Math.min(side - 1 - iz, Wq) * side;
      const gx = (HS[iRw] - HS[iLw]) / (Math.max(1, iRw - iLw) * step);
      const gz = (HS[iUw] - HS[iDw]) / (Math.max(1, (iUw - iDw) / side) * step);
      gS[i] = Math.hypot(gx, gz);
    }
  }
  const snowT = new Float32Array(N), snowLine = new Float32Array(N);
  const umberF = new Float32Array(N), rvF = new Float32Array(N), dryF = new Float32Array(N);
  const gn = T.grassNoise;
  for (let i = 0; i < N; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const rim = SS(r, 276, 438 * 0.94);
    const hS = H[i] + (HS[i] - H[i]) * rim;
    const mS = mSharp[i] + (gS[i] - mSharp[i]) * rim;
    const st = T._snowline(x, z);
    snowLine[i] = st;
    snowT[i] = SS(hS, st, st + 26 + 66 * SS(mS, 0.5, 2.6)) * (1 - 0.72 * SS(mS, 1.3, 3.0));
    umberF[i] = SS(gn.fbm(x * 0.023 - 40, z * 0.023 + 31, 2), 0.18, 0.52);
    rvF[i] = gn.fbm(x * 0.0065 - 21, z * 0.0065 + 44, 2) * 0.5 + 0.5;
    dryF[i] = gn.fbm(x * 0.01 + 9, z * 0.01 - 4, 2) * 0.5 + 0.5;
  }

  return {
    lumRim: stat(lum, 8, rimMask),
    lumNear: stat(lum, 8, nearMask),
    lumMeadow: stat(lum, 8, meadowMask),
    termWarmShade: stat(warmShade, 8, rimMask),
    termSplat: stat(splat, 8, rimMask),
    termSnow: stat(snowT, 8, rimMask),
    termSunFace: stat(sunF, 8, rimMask),
    termSnowline: stat(snowLine, 8, rimMask),
    termUmber: stat(umberF, 8, rimMask),
    termRv: stat(rvF, 8, rimMask),
    termDry: stat(dryF, 8, rimMask),
    termSlopeS: stat(gS, 8, rimMask),
  };
})()
