/**
 * CLOTH: the air. Per particle, on the sheet's own normal there (from its grid neighbours) and the area it carries:
 *
 *   u = wind(x, t) - v,  c = u^ . n,  F = 1/2 rho A |u|^2 ( cd |c| u^ + cl c (n - c u^) )
 *
 * A sheet edge-on to the flow takes almost nothing, face-on the whole pressure, at an angle it is lifted. Her own travel
 * is in v, so a run presses the front panels back onto her thighs. A particle in contact with a collider last substep
 * takes SHELTER of it (the wind cannot pump cloth through a leg), and so does a particle in her LEE: downwind of her
 * root's vertical axis and within `P.lee` m of the line through it along the wind (her body stands in the flow; a wind
 * from behind does not lift the front panels off her thighs). The wind is the world's at her (the environment's
 * gust clock is in it) plus a small coherent turbulence on position and the sim clock (`TURB` of the speed, two
 * octaves). Deterministic: sines of position and sim time only. No allocation.
 */
import { RHO } from './materials.js';

export const SHELTER = 0.3;
export const TURB = 0.15;

/**
 * Accumulate the aero force (N) on every free particle of piece P into P.f (Float64Array 3n, overwritten).
 * `wx`, `wz` the world wind (m/s) at her; `t` sim time (s).
 */
export function aeroForces(P, wx, wz, t) {
  const x = P.x, v = P.v, f = P.f, nrm = P.nrm, A = P.area, n = P.n, mat = P.mat;
  // (P.airK: a piece's share of the sheet's air, 1 for Brea's cloth; the people's strands stand for a whole tail or
  //  apron with a handful of particles and catch less, cloth/strands.js)
  const cd = mat.cd, cl = mat.cl, airK = P.airK ?? 1;
  const ws = Math.sqrt(wx * wx + wz * wz);
  const lee = P.lee || 0, ux0 = ws > 1e-6 ? wx / ws : 0, uz0 = ws > 1e-6 ? wz / ws : 0, rx = P.root.p[0], rz = P.root.p[2];
  const C = P.C || 1;
  let tx = 0, ty = 0, tz = 0;
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    f[k] = 0; f[k + 1] = 0; f[k + 2] = 0;
    // coherent turbulence: two octaves, along and across the wind, and a little up; sampled once a ROW, at the row's
    // middle particle (round 3, cost: its shortest wavelength is 1.2 m, a row is 0.1-0.3 m across: a sixth of the sines)
    if (ws > 1e-3 && i % C === 0) {
      const q = (i + (C >> 1)) * 3, px = x[q], py = x[q + 1], pz = x[q + 2];
      const g1 = Math.sin(px * 1.7 + pz * 1.3 - t * 3.1) * 0.6 + Math.sin(px * 4.3 - pz * 3.7 + py * 2.9 + t * 7.3) * 0.4;
      const g2 = Math.sin(pz * 2.1 - px * 0.9 + t * 2.3 + 1.7) * 0.6 + Math.sin(pz * 5.1 + px * 4.1 - py * 3.3 - t * 8.9) * 0.4;
      tx = (g1 * wx - g2 * wz * 0.6) * TURB;
      tz = (g1 * wz + g2 * wx * 0.6) * TURB;
      ty = Math.sin(py * 3.1 + t * 4.7 + px) * 0.3 * TURB * ws;
    }
    if (P.w[i] === 0) continue;
    let ux = wx + tx, uy = ty, uz = wz + tz;
    ux -= v[k]; uy -= v[k + 1]; uz -= v[k + 2];
    const u2 = ux * ux + uy * uy + uz * uz;
    if (u2 < 1e-8) continue;
    const um = Math.sqrt(u2), hx = ux / um, hy = uy / um, hz = uz / um;
    const nx = nrm[k], ny = nrm[k + 1], nz = nrm[k + 2];
    const c = hx * nx + hy * ny + hz * nz;
    let sh = P.contact[i] ? SHELTER : 1;
    if (lee > 0 && ws > 1e-3) {
      const dx = x[k] - rx, dz = x[k + 2] - rz, al = dx * ux0 + dz * uz0, la = Math.abs(dx * uz0 - dz * ux0);
      if (al > 0) {
        let e = 1 - (la - 0.6 * lee) / (0.4 * lee); e = e < 0 ? 0 : e > 1 ? 1 : e;
        let g = al / 0.06; g = g > 1 ? 1 : g;
        const s2 = 1 - (1 - SHELTER) * e * g;
        if (s2 < sh) sh = s2;
      }
    }
    const q = 0.5 * RHO * A[i] * u2 * sh * airK;
    const dr = cd * (c < 0 ? -c : c), li = cl * c;
    f[k] = q * (dr * hx + li * (nx - c * hx));
    f[k + 1] = q * (dr * hy + li * (ny - c * hy));
    f[k + 2] = q * (dr * hz + li * (nz - c * hz));
  }
}
