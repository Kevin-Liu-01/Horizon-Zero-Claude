/**
 * THE PIT-CUPS' GRID (area A, M2 wave 2), shared by the ground shader (groundShader.js HOLDS_TERM, which draws each
 * hollow, its crescent wall and its vine at range) and the flora (holds/flora.js, which stands a vine mesh in each pit
 * near the lens). The two must agree to the pit, so the cell hash is an integer one (the GLSL's uint arithmetic and
 * Math.imul wrap the same way).
 *
 * The grid: engine (x, z) turned 20 deg (PM), 8 m cells, every other row shifted half a cell; in each cell one pit,
 * its centre jittered by up to 0.48 m. Hash bits 0-9 (hx): the pit exists when hx >= 0.18; bits 10-19 (hy): its vine is
 * green when hy > 0.15; bits 20-29 (hz): its rim radius 1.9 + 0.7 hz m.
 */
export const PIT = Object.freeze({ cell: 8, c: 0.9397, s: 0.342, jitter: 0.12, exists: 0.18, green: 0.15, r0: 1.9, r1: 0.7 });

export function pitHash(cx, cy) {
  let h = (Math.imul((cx + 4096) >>> 0, 73856093) ^ Math.imul((cy + 4096) >>> 0, 19349663)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

/** Every pit whose centre falls in the engine box [x0, x1] x [z0, z1]: { x, z, r, green, cx, cy } (exists only). */
export function pitsIn(x0, x1, z0, z1) {
  const { cell, c, s } = PIT, out = [];
  // the box's corners in the turned frame, in cells
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    const u = (c * x - s * z) / cell, v = (s * x + c * z) / cell;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  for (let cy = Math.floor(v0) - 1; cy <= Math.ceil(v1); cy++) {
    const sh = 0.5 * (((cy % 2) + 2) % 2);
    for (let cx = Math.floor(u0 + sh) - 1; cx <= Math.ceil(u1 + sh); cx++) {
      const h = pitHash(cx, cy);
      const hx = (h & 1023) / 1023, hy = ((h >>> 10) & 1023) / 1023, hz = ((h >>> 20) & 1023) / 1023;
      if (hx < PIT.exists) continue;
      const pu = cx + 0.5 + (hx - 0.5) * PIT.jitter - sh, pv = cy + 0.5 + (hy - 0.5) * PIT.jitter;
      // back to the world: the transpose of the turn
      const x = (c * pu + s * pv) * cell, z = (-s * pu + c * pv) * cell;
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      out.push({ x, z, r: PIT.r0 + PIT.r1 * hz, green: hy > PIT.green, cx, cy });
    }
  }
  return out;
}

/** The pit (if any) in the cell under engine (x, z), as the shader finds it: { d, r } (d: metres from its centre), or null. */
export function pitAt(x, z) {
  const { cell, c, s } = PIT;
  let u = (c * x - s * z) / cell;
  const v = (s * x + c * z) / cell, cy = Math.floor(v), sh = 0.5 * (((cy % 2) + 2) % 2);
  u += sh;
  const cx = Math.floor(u), h = pitHash(cx, cy);
  const hx = (h & 1023) / 1023, hy = ((h >>> 10) & 1023) / 1023, hz = ((h >>> 20) & 1023) / 1023;
  if (hx < PIT.exists) return null;
  const du = (u - cx - 0.5 - (hx - 0.5) * PIT.jitter) * cell, dv = (v - cy - 0.5 - (hy - 0.5) * PIT.jitter) * cell;
  return { d: Math.hypot(du, dv), r: PIT.r0 + PIT.r1 * hz };
}
