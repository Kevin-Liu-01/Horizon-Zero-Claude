/**
 * CLOTH: the colliders. Tapered capsules (two end points, a radius at each end), each end kept at last frame's and
 * this frame's place so a substep meets the collider where it was at that substep (linear in between), plus one
 * ground plane. A piece meets the colliders its mask names. A prop capsule (propCaps.js) is swept: its radius grows by
 * its ends' speed x h / 2, so a fast shaft cannot pass a strand between two substeps.
 *
 * `radiusProfile` is how a body capsule's radii are found at build time: the skin's and the clothes' own distance to
 * the axis (vertices weighted >= 0.9 to the segment's bones), the `pct` percentile in the upper and the lower half of
 * the segment, so the cloth stands on the trousers, not in them. No allocation per frame.
 */

/** A collider record. `a`/`b` are this frame's ends, `pa`/`pb` last frame's (world, m); `r0`/`r1` the radii at a and b. */
export function makeCollider(name, bit, r0, r1, src) {
  return {
    name, bit, r0, r1, src, on: true, swept: false, ri0: 0, ri1: 0,
    a: new Float64Array(3), b: new Float64Array(3), pa: new Float64Array(3), pb: new Float64Array(3),
    va: new Float64Array(3), vb: new Float64Array(3),
    // this substep's ends and their velocity (written by `at`), and its box grown by its larger radius, the sweep and
    // the most stand-off a piece uses (`box`: min x y z, max x y z) for the particle's first test
    ia: new Float64Array(3), ib: new Float64Array(3), iva: new Float64Array(3), ivb: new Float64Array(3), sw: 0,
    box: new Float64Array(6),
    primed: false, hits: 0,
    // the frame's bounding sphere of the swept segment (for the per-piece cull)
    cx: 0, cy: 0, cz: 0, cr: 0,
  };
}

/** Shift this frame's ends to last frame's and write the new ones (world, m). */
export function setEnds(C, ax, ay, az, bx, by, bz, dt) {
  if (C.primed) { C.pa[0] = C.a[0]; C.pa[1] = C.a[1]; C.pa[2] = C.a[2]; C.pb[0] = C.b[0]; C.pb[1] = C.b[1]; C.pb[2] = C.b[2]; }
  C.a[0] = ax; C.a[1] = ay; C.a[2] = az; C.b[0] = bx; C.b[1] = by; C.b[2] = bz;
  if (!C.primed) { C.pa.set(C.a); C.pb.set(C.b); C.primed = true; }
  const k = dt > 0 ? 1 / dt : 0;
  for (let i = 0; i < 3; i++) { C.va[i] = (C.a[i] - C.pa[i]) * k; C.vb[i] = (C.b[i] - C.pb[i]) * k; }
  // the swept segment's bounding sphere (both frames' ends)
  let mx = 9e9, Mx = -9e9, my = 9e9, My = -9e9, mz = 9e9, Mz = -9e9;
  const ends = [C.a, C.b, C.pa, C.pb];
  for (let e = 0; e < 4; e++) { const p = ends[e]; if (p[0] < mx) mx = p[0]; if (p[0] > Mx) Mx = p[0]; if (p[1] < my) my = p[1]; if (p[1] > My) My = p[1]; if (p[2] < mz) mz = p[2]; if (p[2] > Mz) Mz = p[2]; }
  C.cx = (mx + Mx) / 2; C.cy = (my + My) / 2; C.cz = (mz + Mz) / 2;
  const rr = Math.max(C.r0, C.r1);
  C.cr = Math.sqrt((Mx - mx) ** 2 + (My - my) ** 2 + (Mz - mz) ** 2) / 2 + rr;
}

/** The ends at fraction `f` of the frame (into ia / ib), and the sweep allowance for substep `h`. */
export function at(C, f, h) {
  const g = 1 - f;
  for (let i = 0; i < 3; i++) {
    C.ia[i] = C.pa[i] * g + C.a[i] * f; C.ib[i] = C.pb[i] * g + C.b[i] * f;
    C.iva[i] = C.va[i]; C.ivb[i] = C.vb[i];
  }
  if (C.swept) {
    const sa = Math.sqrt(C.va[0] ** 2 + C.va[1] ** 2 + C.va[2] ** 2), sb = Math.sqrt(C.vb[0] ** 2 + C.vb[1] ** 2 + C.vb[2] ** 2);
    C.sw = Math.max(sa, sb) * h * 0.5;
  } else C.sw = 0;
  const g2 = (C.r0 > C.r1 ? C.r0 : C.r1) + C.sw + 0.03, B = C.box;
  for (let i = 0; i < 3; i++) { const a = C.ia[i], b = C.ib[i]; B[i] = (a < b ? a : b) - g2; B[i + 3] = (a > b ? a : b) + g2; }
}

/**
 * Push particle i (positions `x`, previous `xp`, both Float64Array, stride 3) out of collider C at its substep place,
 * standing off by `off` (m), with Coulomb friction `mu` against the collider's own motion over the substep `h`.
 * Returns the penetration depth resolved (0 if none). `out` (Float64Array 3) receives the contact normal.
 */
export function collideCapsule(C, x, xp, i, off, mu, h, out) {
  const k = i * 3, B = C.box;
  if (x[k] < B[0] || x[k] > B[3] || x[k + 1] < B[1] || x[k + 1] > B[4] || x[k + 2] < B[2] || x[k + 2] > B[5]) return 0;
  const ax = C.ia[0], ay = C.ia[1], az = C.ia[2];
  const dx = C.ib[0] - ax, dy = C.ib[1] - ay, dz = C.ib[2] - az;
  const px = x[k] - ax, py = x[k + 1] - ay, pz = x[k + 2] - az;
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = l2 > 1e-12 ? (px * dx + py * dy + pz * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = C.r0 + (C.r1 - C.r0) * t + off + C.sw;
  let nx = px - dx * t, ny = py - dy * t, nz = pz - dz * t;
  const d2 = nx * nx + ny * ny + nz * nz;
  if (d2 >= r * r) return 0;
  let d = Math.sqrt(d2);
  if (d < 1e-7) {
    // on the axis: out along the particle's travel, reversed (or up)
    nx = xp[k] - x[k]; ny = xp[k + 1] - x[k + 1]; nz = xp[k + 2] - x[k + 2];
    let l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l < 1e-9) { nx = 0; ny = 1; nz = 0; l = 1; }
    nx /= l; ny /= l; nz /= l; d = 0;
  } else { nx /= d; ny /= d; nz /= d; }
  const pen = r - d;
  x[k] += nx * pen; x[k + 1] += ny * pen; x[k + 2] += nz * pen;
  // friction: the tangential travel this substep, relative to the collider's surface there
  const cvx = (C.iva[0] + (C.ivb[0] - C.iva[0]) * t) * h, cvy = (C.iva[1] + (C.ivb[1] - C.iva[1]) * t) * h, cvz = (C.iva[2] + (C.ivb[2] - C.iva[2]) * t) * h;
  let rx = x[k] - xp[k] - cvx, ry = x[k + 1] - xp[k + 1] - cvy, rz = x[k + 2] - xp[k + 2] - cvz;
  const rn = rx * nx + ry * ny + rz * nz;
  rx -= rn * nx; ry -= rn * ny; rz -= rn * nz;
  const rt = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (rt > 1e-9) {
    const f = mu * pen >= rt ? 1 : (mu * pen) / rt;
    x[k] -= rx * f; x[k + 1] -= ry * f; x[k + 2] -= rz * f;
  }
  out[0] = nx; out[1] = ny; out[2] = nz;
  C.hits++;
  return pen;
}

/** Push particle i out of collider C at its substep place: at its inner radii (`ri0`/`ri1`) when `inner`, else its outer
 *  ones, plus `off`; no friction. Returns the depth resolved. */
export function pushOut(C, x, i, off, inner) {
  const k = i * 3;
  const ax = C.ia[0], ay = C.ia[1], az = C.ia[2];
  const dx = C.ib[0] - ax, dy = C.ib[1] - ay, dz = C.ib[2] - az;
  const px = x[k] - ax, py = x[k + 1] - ay, pz = x[k + 2] - az;
  const l2 = dx * dx + dy * dy + dz * dz;
  let t = l2 > 1e-12 ? (px * dx + py * dy + pz * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = (inner ? C.ri0 + (C.ri1 - C.ri0) * t : C.r0 + (C.r1 - C.r0) * t) + off;
  const nx = px - dx * t, ny = py - dy * t, nz = pz - dz * t;
  const d2 = nx * nx + ny * ny + nz * nz;
  if (d2 >= r * r || d2 < 1e-14) return 0;
  const d = Math.sqrt(d2), f = (r - d) / d;
  x[k] += nx * f; x[k + 1] += ny * f; x[k + 2] += nz * f;
  return r - d;
}

/** The ground plane at height `gy` (m): push particle i up to it with friction `mu`; returns the depth (0 if none). */
export function collideGround(gy, x, xp, i, off, mu) {
  const k = i * 3, y = gy + off;
  if (x[k + 1] >= y) return 0;
  const pen = y - x[k + 1];
  x[k + 1] = y;
  const rx = x[k] - xp[k], rz = x[k + 2] - xp[k + 2], rt = Math.sqrt(rx * rx + rz * rz);
  if (rt > 1e-9) { const f = mu * pen >= rt ? 1 : (mu * pen) / rt; x[k] -= rx * f; x[k + 2] -= rz * f; }
  return pen;
}

/**
 * Build-time: the radii of a body segment a-b (THREE.Vector3 world) at its two ends, from the meshes' own vertices
 * weighted >= 0.9 to bones matching `re` (and none to a `dyn_` / `cl_` bone): the `pct` percentile of their distance to
 * the axis over t in [0.08, 0.5] and [0.5, 0.92]. `meshes` are SkinnedMeshes; `V` a THREE.Vector3 class.
 */
export function radiusProfile(meshes, a, b, re, pct, V) {
  const A = a, AB = new V().subVectors(b, a), l2 = AB.lengthSq() || 1e-9, v = new V(), w0 = [], w1 = [];
  for (const m of meshes) {
    if (!m) continue;
    const bn = m.skeleton.bones.map((x) => x.name), si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
    for (let i = 0; i < si.count; i++) {
      let w = 0, cloth = false;
      for (let k = 0; k < 4; k++) {
        const n = bn[si.getComponent(i, k)] || '', ww = sw.getComponent(i, k);
        if (ww > 0 && /^(dyn_|cl_|sash_)/.test(n)) cloth = true;
        if (re.test(n)) w += ww;
      }
      if (w < 0.9 || cloth) continue;
      m.getVertexPosition(i, v); m.localToWorld(v);
      const t = (v.x - A.x) * AB.x / l2 + (v.y - A.y) * AB.y / l2 + (v.z - A.z) * AB.z / l2;
      if (t <= 0.08 || t >= 0.92) continue;
      const d = Math.hypot(v.x - A.x - AB.x * t, v.y - A.y - AB.y * t, v.z - A.z - AB.z * t);
      (t < 0.5 ? w0 : w1).push(d);
    }
  }
  const p = (ds) => { if (!ds.length) return null; ds.sort((x, y) => x - y); return ds[Math.min(ds.length - 1, Math.floor(ds.length * pct))]; };
  return [p(w0), p(w1)];
}
