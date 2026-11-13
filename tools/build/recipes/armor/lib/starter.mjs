/**
 * CALIMA — armor recipes: the pieces of C-06's Starter re-cut (armory W1 exit; docs/ROUND5-LOOK.md C-06, R66 f): the
 * wound violet forearm wraps, the leather bracer over the right one, the band on the right upper arm, the crossed
 * harness's compass-rose boss and the boots' laced tops. Deterministic, procedural, project-original.
 *
 * Limb pieces lie on Brea's own body (lib/breabody.mjs): a ring at each station along the limb's bind axis takes the
 * body's radius there per bearing, so a wrap hugs her sculpt rather than the stock body the cloth was drafted on.
 */
import { V, mix, sstep, clamp } from './part.mjs';
import { TAU } from './garment.mjs';

/** A frame round the segment a -> b: X along it, Y and Z square to it (Y as close to world up as it goes). */
export function limbFrame(a, b) {
  const X = V.norm(V.sub(b, a));
  const up = Math.abs(X[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const Z = V.norm(V.cross(X, up));
  const Y = V.norm(V.cross(Z, X));
  return { X, Y, Z, len: V.len(V.sub(b, a)) };
}

/**
 * The body's radius about a limb axis: a table over (t along a -> b, bearing about it) of the largest distance of the
 * body's points that lie in that slab and bearing, low-passed round the limb. `pick(i)` keeps the body points that
 * belong to the limb (the other arm, the ribs never count).
 */
export function limbRadius(body, a, b, { NT = 24, NA = 24, t0 = -0.1, t1 = 1.1, pick = null, maxR = 0.09 } = {}) {
  const F = limbFrame(a, b);
  const tab = new Float64Array(NT * NA);
  const P = body.pos;
  for (let i = 0; i < P.length / 3; i++) {
    if (pick && !pick(i)) continue;
    const rel = [P[i * 3] - a[0], P[i * 3 + 1] - a[1], P[i * 3 + 2] - a[2]];
    const t = V.dot(rel, F.X) / F.len;
    if (t < t0 || t > t1) continue;
    const y = V.dot(rel, F.Y), z = V.dot(rel, F.Z), r = Math.hypot(y, z);
    if (r > maxR) continue;
    const ph = Math.atan2(y, z);
    const ti = Math.round(((t - t0) / (t1 - t0)) * (NT - 1)), ai = ((Math.round(((ph + Math.PI) / TAU) * NA) % NA) + NA) % NA;
    for (let dt = -1; dt <= 1; dt++) for (let da = -1; da <= 1; da++) {
      const T = ti + dt, A = (ai + da + NA) % NA;
      if (T < 0 || T >= NT) continue;
      if (r > tab[T * NA + A]) tab[T * NA + A] = r;
    }
  }
  // holes from the slab sampling take their neighbours, then two passes round and along
  for (let T = 0; T < NT; T++) for (let A = 0; A < NA; A++) if (!tab[T * NA + A]) tab[T * NA + A] = tab[T * NA + ((A + 1) % NA)] || tab[T * NA + ((A + NA - 1) % NA)] || 0.03;
  for (let pass = 0; pass < 2; pass++) {
    const o = tab.slice();
    for (let T = 0; T < NT; T++) for (let A = 0; A < NA; A++) {
      const s = o[T * NA + A] * 2 + o[T * NA + (A + 1) % NA] + o[T * NA + (A + NA - 1) % NA] + (T > 0 ? o[(T - 1) * NA + A] : o[T * NA + A]) + (T < NT - 1 ? o[(T + 1) * NA + A] : o[T * NA + A]);
      tab[T * NA + A] = Math.max(o[T * NA + A] * 0.985, s / 6);
    }
  }
  const at = (t, ph) => {
    const ft = clamp((t - t0) / (t1 - t0)) * (NT - 1), fa = (((ph + Math.PI) / TAU) * NA % NA + NA) % NA;
    const T0 = Math.floor(ft), T1 = Math.min(NT - 1, T0 + 1), A0 = Math.floor(fa) % NA, A1 = (A0 + 1) % NA;
    const u = ft - T0, v = fa - Math.floor(fa);
    return mix(mix(tab[T0 * NA + A0], tab[T0 * NA + A1], v), mix(tab[T1 * NA + A0], tab[T1 * NA + A1], v), u);
  };
  return { F, at, a };
}

/**
 * A wound wrap round a limb from t = from to t = to of a -> b: strips wound on the bias, each turn lapping the one
 * under it (the radius steps up across a turn and drops at its lower edge), so the spiral reads in the silhouette and
 * the shading. `rect` is a trim cell: u along the strip, v across it. Skin per vertex from `skin` (Brea's body).
 */
export function woundWrap(part, R, skin, { from = 0, to = 1, off = 0.0026, step = 0.0019, pitch = 0.034, turnsSign = 1, rings = 30, sides = 20, rect, endRoll = 0.0018, flare = 0 } = {}) {
  const { F } = R;
  const a0 = R.a;
  const base = part.pos.length / 3;
  for (let r = 0; r <= rings; r++) {
    const t = mix(from, to, r / rings);
    for (let s = 0; s <= sides; s++) {
      const ph = -Math.PI + (s / sides) * TAU;
      // the turn coordinate: along the limb plus a full pitch per turn round it (the bias)
      const along = t * F.len;
      const turn = along / pitch + turnsSign * (ph + Math.PI) / TAU;
      const fb = turn - Math.floor(turn);
      // each turn: thin at its lower edge (it tucks under the next), full at its upper (it laps over the last)
      const lap = step * sstep(0.0, 0.85, fb) - step * 0.35 * sstep(0.92, 1.0, fb);
      const ends = endRoll * (sstep(0.06, 0.0, (t - from) / (to - from)) + sstep(0.94, 1.0, (t - from) / (to - from)));
      const rr = R.at(t, ph) + off + lap + ends + flare * (t - from) / (to - from);
      const c = V.add(a0, V.mul(F.X, along));
      const q = V.add(c, V.add(V.mul(F.Y, Math.sin(ph) * rr), V.mul(F.Z, Math.cos(ph) * rr)));
      part.pos.push(...q);
      part.nrm.push(...V.norm(V.add(V.mul(F.Y, Math.sin(ph)), V.mul(F.Z, Math.cos(ph)))));
      // the strip's own coordinates: u along the wound strip (wraps every pitch), v across it
      part.uv.push(rect[0] + rect[2] * Math.abs(((ph + Math.PI) / TAU * 2) % 2 - 1), rect[1] + rect[3] * fb);
      const sk = skin.skin(q[0], q[1], q[2], 4);
      part.jnt.push(...sk.j); part.wgt.push(...sk.w);
    }
  }
  const cc = sides + 1;
  for (let r = 0; r < rings; r++) for (let s = 0; s < sides; s++) {
    const a = base + r * cc + s, b = a + 1, d = a + cc, e = d + 1;
    part.idx.push(a, b, d, b, e, d);
  }
  return part;
}

/**
 * A stiff cuff round a limb (the bracer, the arm band): a shell `off` off the body's radius from t = from to t = to,
 * its two ends rolled, an optional row of lacing holes down its inner seam (`laceAt` bearing). rect: u along, v round.
 */
export function cuff(part, R, skin, { from, to, off = 0.006, thick = 0.003, rings = 8, sides = 20, rect, stiff = 0.6, laceAt = null, laceRect = null, roll = 0.0018 } = {}) {
  const { F } = R;
  const a0 = R.a;
  const base = part.pos.length / 3;
  // a stiff cuff does not follow every dip of the muscle: its radius per bearing is the max over its length, blended
  const maxAt = new Float64Array(sides + 1);
  for (let s = 0; s <= sides; s++) {
    const ph = -Math.PI + (s / sides) * TAU;
    for (let r = 0; r <= rings; r++) maxAt[s] = Math.max(maxAt[s], R.at(mix(from, to, r / rings), ph));
  }
  const prof = [[0, -thick * 0.2], [0.04, roll], [0.12, 0], [0.88, 0], [0.96, roll], [1, -thick * 0.2]];
  for (let r = 0; r < prof.length; r++) {
    const [f, lift] = prof[r];
    const t = mix(from, to, f);
    for (let s = 0; s <= sides; s++) {
      const ph = -Math.PI + (s / sides) * TAU;
      const rr = mix(R.at(t, ph), maxAt[s], stiff) + off + lift + thick;
      const c = V.add(a0, V.mul(F.X, t * F.len));
      const n = V.norm(V.add(V.mul(F.Y, Math.sin(ph)), V.mul(F.Z, Math.cos(ph))));
      const q = V.add(c, V.mul(n, rr));
      part.pos.push(...q); part.nrm.push(...n);
      part.uv.push(rect[0] + rect[2] * f, rect[1] + rect[3] * (s / sides));
      const sk = skin.skin(q[0], q[1], q[2], 4);
      part.jnt.push(...sk.j); part.wgt.push(...sk.w);
    }
  }
  const cc = sides + 1;
  for (let r = 0; r < prof.length - 1; r++) for (let s = 0; s < sides; s++) {
    const a = base + r * cc + s, b = a + 1, d = a + cc, e = d + 1;
    part.idx.push(a, b, d, b, e, d);
  }
  // the lacing: X crossings over the seam on its inner side, a cord standing on the leather
  if (laceAt != null && laceRect) {
    const N = 4;
    for (let k = 0; k < N; k++) {
      const f0 = 0.16 + (k / N) * 0.68, f1 = 0.16 + ((k + 1) / N) * 0.68;
      for (const [fa, fb, da, db] of [[f0, f1, -0.18, 0.18], [f0, f1, 0.18, -0.18]]) {
        const pts = [];
        for (let m = 0; m <= 4; m++) {
          const f = mix(fa, fb, m / 4), ph = laceAt + mix(da, db, m / 4);
          const t = mix(from, to, f);
          const rr = mix(R.at(t, ph), maxAt[Math.round(((ph + Math.PI) / TAU) * sides) % sides] || R.at(t, ph), stiff) + off + thick + 0.0016;
          const n = V.norm(V.add(V.mul(F.Y, Math.sin(ph)), V.mul(F.Z, Math.cos(ph))));
          pts.push(V.add(V.add(a0, V.mul(F.X, t * F.len)), V.mul(n, rr)));
        }
        cordInto(part, pts, 0.0013, laceRect, skin);
      }
    }
  }
  return part;
}

/** A thin round cord through `pts`, skinned per point. */
export function cordInto(part, pts, r, rect, skin, sides = 4) {
  const base = part.pos.length / 3;
  const N = pts.length;
  for (let k = 0; k < N; k++) {
    const q = pts[k];
    const tan = V.norm(V.sub(pts[Math.min(N - 1, k + 1)], pts[Math.max(0, k - 1)]));
    const aux = Math.abs(tan[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const s1 = V.norm(V.cross(tan, aux)), s2 = V.norm(V.cross(s1, tan));
    const sk = skin.skin(q[0], q[1], q[2], 4);
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * TAU;
      const n = V.add(V.mul(s1, Math.cos(a)), V.mul(s2, Math.sin(a)));
      part.pos.push(...V.add(q, V.mul(n, r))); part.nrm.push(...n);
      part.uv.push(rect[0] + rect[2] * (k / Math.max(1, N - 1)), rect[1] + rect[3] * (s / sides));
      part.jnt.push(...sk.j); part.wgt.push(...sk.w);
    }
  }
  const cc = sides + 1;
  for (let k = 0; k < N - 1; k++) for (let s = 0; s < sides; s++) {
    const a = base + k * cc + s, b = a + 1, d = a + cc, e = d + 1;
    part.idx.push(a, d, b, b, d, e);
  }
}

/**
 * The compass-rose boss where the harness straps cross (C-06, 4-DET): a 6 cm cast bronze disc, domed, with a raised
 * rim, an eight-point rose standing on its face (four long cardinal points, four short) and a centre stud. `c` its
 * centre on the straps, `n` out of her chest, `up` toward her head. Rigid on `sk` (one skin: it is one casting).
 */
export function compassBoss(part, c, n, up, rect, sk, { R = 0.03, thick = 0.0055 } = {}) {
  const Y = V.norm(V.sub(up, V.mul(n, V.dot(up, n)))), X = V.norm(V.cross(Y, n));
  const at = (x, y, z) => V.add(c, V.add(V.add(V.mul(X, x), V.mul(Y, y)), V.mul(n, z)));
  const push = (q, nn, u, v) => { part.pos.push(...q); part.nrm.push(...nn); part.uv.push(rect[0] + rect[2] * u, rect[1] + rect[3] * v); part.jnt.push(...sk.j); part.wgt.push(...sk.w); };
  // the disc: back edge, side wall, the raised rim, the field (a low dome) to the centre
  const SIDES = 16;
  const prof = [[R * 0.98, 0], [R, thick * 0.35], [R * 0.97, thick * 0.85], [R * 0.86, thick * 0.62], [R * 0.45, thick * 0.74], [0.0004, thick * 0.82]];
  let base = part.pos.length / 3;
  for (let r = 0; r < prof.length; r++) for (let s = 0; s <= SIDES; s++) {
    const a = (s / SIDES) * TAU, [rad, z] = prof[r];
    const q = at(Math.cos(a) * rad, Math.sin(a) * rad, z);
    const slope = r === 0 ? 0 : (prof[r - 1][1] - z) / Math.max(1e-4, rad - prof[r - 1][0] || 1e-4);
    const nn = V.norm(V.add(V.mul(n, 1), V.mul(V.add(V.mul(X, Math.cos(a)), V.mul(Y, Math.sin(a))), r <= 1 ? 1.6 : clamp(-slope, -1.5, 1.5) * 0.3)));
    push(q, nn, 0.5 + 0.5 * Math.cos(a) * rad / R, 0.5 + 0.5 * Math.sin(a) * rad / R);
  }
  for (let r = 0; r < prof.length - 1; r++) for (let s = 0; s < SIDES; s++) {
    const a = base + r * (SIDES + 1) + s, b = a + 1, d = a + SIDES + 1, e = d + 1;
    part.idx.push(a, b, d, b, e, d);
  }
  // the rose: eight points, each a low ridged pyramid standing on the field (a lit flank and a shaded flank)
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * TAU + Math.PI / 2;
    const long = k % 2 === 0;
    const len = (long ? 0.84 : 0.52) * R * 0.86, half = (long ? 0.15 : 0.13) * R, h = thick * 0.82 + (long ? 0.0026 : 0.0018);
    const d = [Math.cos(ang), Math.sin(ang)], s = [-d[1], d[0]];
    const tip = at(d[0] * len, d[1] * len, thick * 0.84);
    const l = at(s[0] * half, s[1] * half, thick * 0.8), rr = at(-s[0] * half, -s[1] * half, thick * 0.8);
    const top = at(0, 0, h);
    base = part.pos.length / 3;
    const f1 = V.norm(V.cross(V.sub(tip, top), V.sub(l, top))), f2 = V.norm(V.cross(V.sub(rr, top), V.sub(tip, top)));
    push(top, f1, 0.5, 0.5); push(l, f1, 0.5 + 0.5 * s[0] * half / R, 0.5 + 0.5 * s[1] * half / R); push(tip, f1, 0.5 + 0.5 * d[0] * len / R, 0.5 + 0.5 * d[1] * len / R);
    push(top, f2, 0.5, 0.5); push(tip, f2, 0.5 + 0.5 * d[0] * len / R, 0.5 + 0.5 * d[1] * len / R); push(rr, f2, 0.5 - 0.5 * s[0] * half / R, 0.5 - 0.5 * s[1] * half / R);
    const o1 = V.dot(f1, n) < 0, o2 = V.dot(f2, n) < 0;
    if (o1) part.idx.push(base, base + 2, base + 1); else part.idx.push(base, base + 1, base + 2);
    if (o2) part.idx.push(base + 3, base + 5, base + 4); else part.idx.push(base + 3, base + 4, base + 5);
  }
  // the centre stud
  base = part.pos.length / 3;
  const SD = 10, sr = R * 0.14;
  for (const [rad, z] of [[sr, thick * 0.84], [sr * 0.8, thick + 0.0028], [0.0003, thick + 0.0034]]) for (let s = 0; s <= SD; s++) {
    const a = (s / SD) * TAU;
    push(at(Math.cos(a) * rad, Math.sin(a) * rad, z), V.norm(V.add(n, V.mul(V.add(V.mul(X, Math.cos(a)), V.mul(Y, Math.sin(a))), rad / sr * 0.8))), 0.5 + 0.5 * Math.cos(a) * rad / R, 0.5 + 0.5 * Math.sin(a) * rad / R);
  }
  for (let r = 0; r < 2; r++) for (let s = 0; s < SD; s++) {
    const a = base + r * (SD + 1) + s, b = a + 1, d = a + SD + 1, e = d + 1;
    part.idx.push(a, b, d, b, e, d);
  }
  return part;
}
