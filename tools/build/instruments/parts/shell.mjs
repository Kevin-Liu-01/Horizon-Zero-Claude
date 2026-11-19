/**
 * CALIMA — the Instruments' plated SHELL and SURVEY LEG (instruments, M2 wave 2 "the look"). Original work: no
 * third-party asset is read. Built on the shared hull kit (`./kit.mjs`, M1.4a) so the Tiller, the Sickle and the
 * Screed read as the same maker's work as the Plumb, the Peg and the Gauge:
 *
 *   loftShell(b, sections, opts)   a hull lofted along +Z through rounded cross-sections (a superellipse per section:
 *                                  half-width `w` at `ym`, belly `yb`, crown `yt`), cut into WHITE ENAMEL PLATES by
 *                                  seams round it (`seamsU`, turns from the crown) and across it (`seamsZ`); each plate
 *                                  has a turned-in lip, the GUNMETAL core shows in every seam, brass rivets run down
 *                                  each plate edge (2 cm domes), and the two ends close on enamel caps.
 *                                  Returns { at(u, z) -> { p, n } } on the outer skin (for fittings).
 *   surveyLeg(H, leg, opts)        one stilt leg in the family's parts: a gunmetal thigh under an enamel greave with brass
 *                                  bands, a gunmetal knee hub with brass axle bosses, an enamel or graduated shin
 *                                  (`staff`), a gunmetal piston to the ankle, a riveted brass-and-rubber disc foot.
 *                                  `H(bone)` returns the bone's bucket.
 *   skirtPlate(b, outline, M, o)   a flat riveted enamel plate with a brass foot strip (a dust skirt, a moldboard face).
 *
 * Space: metres, +Y up, +Z forward. Deterministic (no clocks, no Math.random).
 */
import { THREE, C, rivet, staff } from './kit.mjs';
import { V, strut, ball, lathe, plate, rbox, at } from '../../lib/hs.mjs';

const sgnpow = (t, e) => Math.sign(t) * Math.pow(Math.abs(t), e);

/** Catmull-Rom over the sections' numeric fields at z (clamped at the ends). */
function sectionAt(S, z) {
  if (z <= S[0].z) return S[0];
  if (z >= S[S.length - 1].z) return S[S.length - 1];
  let i = 0;
  while (i < S.length - 2 && z > S[i + 1].z) i++;
  const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1], d = S[Math.min(S.length - 1, i + 2)];
  const t = (z - b.z) / (c.z - b.z), t2 = t * t, t3 = t2 * t;
  const cr = (k) => 0.5 * ((2 * b[k]) + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3);
  return { z, w: Math.max(0.01, cr('w')), yb: cr('yb'), ym: cr('ym'), yt: cr('yt'), n: b.n ?? 3 };
}

/** A point on the superellipse ring of section s at turn u (0 = crown, 0.25 = +x flank, 0.5 = keel). */
function ringPoint(s, u, inset = 0) {
  const th = u * Math.PI * 2, e = 2 / (s.n ?? 3);
  const sx = sgnpow(Math.sin(th), e), cy = sgnpow(Math.cos(th), e);
  const h = cy >= 0 ? (s.yt - s.ym) : (s.ym - s.yb);
  return new THREE.Vector3((s.w - inset) * sx, s.ym + (h - inset) * cy, s.z);
}

/**
 * Loft a plated shell. sections: [{ z, w, yb, ym, yt, n? }] in increasing z. opts:
 *   seamsU   plate seams round the hull, in turns from the crown (default [0.08, 0.2, 0.33, 0.5, 0.67, 0.8, 0.92])
 *   seamsZ   plate seams along it (z values strictly inside the first and last section)
 *   gap      seam width (m, 0.014); lip depth (m, 0.014); rivet every (m, 0.15; 0 = none), rivet inset (m, 0.028)
 *   uSteps   ring resolution per full turn (48); zStep max spacing along z (m, 0.12)
 *   tone     the plates' enamel (C.ENAMEL); coreTone (C.GUNMETAL); capSurf/capTone for the two end caps
 *   zMin, zMax  loft only this part of the run; caps [start, end] (default both)
 *   skip(u0, u1, z0, z1)  return true to leave a plate out (a hatch, a skirt's seat)
 *   plateTone(u0, u1, z0, z1)  a plate's tone (default `tone`)
 *   rivetSkip(p, u, z) return true to leave a rivet out
 */
export function loftShell(b, sections, opts = {}) {
  const S = sections;
  // `zMin` / `zMax` loft only part of the run (a shell split between two bones at a seam); `caps` [start, end]
  const z0 = Math.max(S[0].z, opts.zMin ?? -Infinity), z1 = Math.min(S[S.length - 1].z, opts.zMax ?? Infinity);
  const caps = opts.caps ?? [true, true];
  const seamsU = (opts.seamsU ?? [0.08, 0.2, 0.33, 0.5, 0.67, 0.8, 0.92]).slice().sort((p, q) => p - q);
  const seamsZ = (opts.seamsZ ?? []).filter((z) => z > z0 && z < z1).sort((p, q) => p - q);
  const gap = opts.gap ?? 0.014, lip = opts.lip ?? 0.014, uSteps = opts.uSteps ?? 48, zStep = opts.zStep ?? 0.12;
  const tone = opts.tone ?? C.ENAMEL, coreTone = opts.coreTone ?? C.GUNMETAL;
  const every = opts.rivetEvery ?? 0.15, rin = opts.rivetInset ?? 0.028;
  const sec = (z) => sectionAt(S, z);

  // surface point and normal at (u, z): the normal from the parameter derivatives
  const P = (u, z, inset = 0) => ringPoint(sec(z), ((u % 1) + 1) % 1, inset);
  const N = (u, z) => {
    const du = 1e-3, dz = 1e-3;
    const a = P(u + du, z).sub(P(u - du, z));
    const zz0 = Math.max(z0, z - dz), zz1 = Math.min(z1, z + dz);
    const c = P(u, zz1).sub(P(u, zz0));
    const n = new THREE.Vector3().crossVectors(c, a).normalize();
    // the crown must face up: flip if the parametrisation turned it inward
    const s = sec(z), mid = new THREE.Vector3(0, s.ym, z);
    if (n.dot(P(u, z).sub(mid)) < 0) n.negate();
    return n;
  };

  // panel cells: between consecutive U seams (cyclic) and Z seams
  const uEdges = seamsU.length ? seamsU : [0];
  const zEdges = [z0, ...seamsZ, z1];
  const quad = (pos, nor, A, B, Cc, D, nA, nB, nC, nD) => {
    // (A, D, B) and (B, D, C): counter-clockwise seen from outside for a grid running +u then +z
    pos.push(A.x, A.y, A.z, D.x, D.y, D.z, B.x, B.y, B.z, B.x, B.y, B.z, D.x, D.y, D.z, Cc.x, Cc.y, Cc.z);
    nor.push(nA.x, nA.y, nA.z, nD.x, nD.y, nD.z, nB.x, nB.y, nB.z, nB.x, nB.y, nB.z, nD.x, nD.y, nD.z, nC.x, nC.y, nC.z);
  };
  const emit = (pos, nor, surf, t) => {
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    b.add(g, { surf, tone: t, wear: 0.35 });
    g.dispose();
  };

  // the gunmetal core under the seams (coarse)
  {
    const pos = [], nor = [];
    const nu = Math.max(12, Math.round(uSteps / 2)), nz = Math.max(2, Math.ceil((z1 - z0) / (zStep * 2)));
    for (let j = 0; j < nz; j++) for (let i = 0; i < nu; i++) {
      const ua = i / nu, ub = (i + 1) / nu, za = z0 + (z1 - z0) * j / nz, zb = z0 + (z1 - z0) * (j + 1) / nz;
      const ins = lip * 0.9;
      quad(pos, nor, P(ua, za, ins), P(ub, za, ins), P(ub, zb, ins), P(ua, zb, ins), N(ua, za), N(ub, za), N(ub, zb), N(ua, zb));
    }
    emit(pos, nor, 'graphite', coreTone);
  }

  // the plates
  const plates = [];
  for (let zi = 0; zi < zEdges.length - 1; zi++) {
    for (let ui = 0; ui < uEdges.length; ui++) {
      const ua0 = uEdges[ui], ub0 = ui + 1 < uEdges.length ? uEdges[ui + 1] : uEdges[0] + 1;
      const za0 = zEdges[zi], zb0 = zEdges[zi + 1];
      if (opts.skip && opts.skip(ua0, ub0, za0, zb0)) continue;
      plates.push({ ua0, ub0, za0, zb0 });
    }
  }
  for (const pl of plates) {
    const { ua0, ub0, za0, zb0 } = pl;
    // the gap in turns at this plate's mean girth
    const sm = sec((za0 + zb0) / 2), girth = Math.PI * (sm.w + (sm.yt - sm.yb) / 2);
    const gu = (gap / 2) / Math.max(0.2, girth);
    const ua = ua0 + gu, ub = ub0 - gu;
    const za = za0 + (za0 > z0 || !caps[0] ? gap / 2 : 0), zb = zb0 - (zb0 < z1 || !caps[1] ? gap / 2 : 0);
    const nu = Math.max(2, Math.ceil((ub - ua) * uSteps)), nz = Math.max(1, Math.ceil((zb - za) / zStep));
    const pos = [], nor = [];
    const grid = [];
    for (let j = 0; j <= nz; j++) {
      const row = [];
      for (let i = 0; i <= nu; i++) { const u = ua + (ub - ua) * i / nu, z = za + (zb - za) * j / nz; row.push({ p: P(u, z), n: N(u, z), u, z }); }
      grid.push(row);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nu; i++) {
      const A = grid[j][i], B = grid[j][i + 1], Cc = grid[j + 1][i + 1], D = grid[j + 1][i];
      quad(pos, nor, A.p, B.p, Cc.p, D.p, A.n, B.n, Cc.n, D.n);
    }
    // the lip: each edge turns in by `lip` (the plate's thickness at the seam)
    const edge = (pts) => {
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], c = pts[k + 1];
        const ai = a.p.clone().addScaledVector(a.n, -lip), ci = c.p.clone().addScaledVector(c.n, -lip);
        const t = c.p.clone().sub(a.p).normalize();
        const out = new THREE.Vector3().crossVectors(t, a.n).normalize();
        quad(pos, nor, a.p, c.p, ci, ai, out, out, out, out);
      }
    };
    const bottom = grid[0], top = grid[nz];
    edge(bottom.slice().reverse()); edge(top);
    edge(grid.map((r) => r[0])); edge(grid.map((r) => r[nu]).reverse());
    const t = opts.plateTone ? opts.plateTone(ua0, ub0, za0, zb0) : tone;
    emit(pos, nor, 'glaze', t);
    // rivets down the plate's edges, inset from them
    if (every > 0) {
      const lenZ = zb - za;
      const nzr = Math.max(1, Math.round(lenZ / every));
      for (const uu of [ua + rin / Math.max(0.2, girth), ub - rin / Math.max(0.2, girth)]) {
        for (let k = 0; k <= nzr; k++) {
          const z = za + rin + (lenZ - 2 * rin) * k / nzr;
          const p = P(uu, z), n = N(uu, z);
          if (opts.rivetSkip && opts.rivetSkip(p, uu, z)) continue;
          rivet(b, p, n, 0.01);
        }
      }
      for (const zz of [za + rin, zb - rin]) {
        const s = sec(zz), g2 = Math.PI * (s.w + (s.yt - s.yb) / 2);
        const nur = Math.max(1, Math.round((ub - ua) * g2 / every));
        for (let k = 1; k < nur; k++) {
          const uu = ua + (ub - ua) * k / nur, p = P(uu, zz), n = N(uu, zz);
          if (opts.rivetSkip && opts.rivetSkip(p, uu, zz)) continue;
          rivet(b, p, n, 0.01);
        }
      }
    }
  }

  // the end caps: a domed enamel cap on each end
  for (const [z, dir, on] of [[z0, -1, caps[0]], [z1, 1, caps[1]]]) {
    if (!on) continue;
    const s = sec(z), nu = uSteps;
    const pos = [], nor = [];
    const c = new THREE.Vector3(0, s.ym, z + dir * (opts.capBulge ?? 0.04));
    const nc = new THREE.Vector3(0, 0, dir);
    for (let i = 0; i < nu; i++) {
      const a = P(i / nu, z, lip * 0.5), bb = P((i + 1) / nu, z, lip * 0.5);
      if (dir > 0) pos.push(c.x, c.y, c.z, bb.x, bb.y, bb.z, a.x, a.y, a.z);
      else pos.push(c.x, c.y, c.z, a.x, a.y, a.z, bb.x, bb.y, bb.z);
      for (let k = 0; k < 3; k++) nor.push(nc.x, nc.y, nc.z);
    }
    emit(pos, nor, opts.capSurf ?? 'glaze', opts.capTone ?? tone);
  }

  return {
    at: (u, z) => ({ p: P(u, z), n: N(u, z) }),
    section: sec,
    plates: plates.length,
  };
}

/**
 * One survey stilt leg. leg: { id, hip, knee, ankle, s (side sign), zs (row sign) }; H(bone) gives a bucket.
 * opts: { thighR, shinR, shin: 'staff' | 'enamel', greave: true, pad: radius, padSegs, boss: hip-boss bone or null }
 */
export function surveyLeg(H, Lg, opts = {}) {
  const thigh = `${Lg.id}_thigh`, shin = `${Lg.id}_shin`, foot = `${Lg.id}_foot`;
  const tr = opts.thighR ?? 0.055, sr = opts.shinR ?? 0.045, padR = opts.pad ?? 0.13;
  const P = (r, h, surf, tone) => ({ r, h, surf, tone });
  // the hip: a brass gimbal boss on the body (the leg's own ball rides the thigh)
  if (opts.boss) {
    // a brass gimbal saddle on the body: a block with a fore-aft pivot pin (no round face toward the lens: a disc
    // boss on a flank reads as a porthole, an eye)
    const out = new THREE.Vector3(Lg.s, 0, 0);
    rbox(H(opts.boss), Lg.hip.clone().addScaledVector(out, -0.07), [0.1, tr * 2.6, tr * 3.2], 0.012, { surf: 'bronze', tone: C.BRASS, wear: 0.6, segs: 1 });
    strut(H(opts.boss), Lg.hip.clone().add(new THREE.Vector3(0, 0, -tr * 1.9)), Lg.hip.clone().add(new THREE.Vector3(0, 0, tr * 1.9)), tr * 0.55, tr * 0.55, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
  }
  ball(H(thigh), Lg.hip, tr * 1.35, { surf: 'graphite', tone: C.GUNMETAL, w: 12, h: 8 });
  strut(H(thigh), Lg.hip, Lg.knee, tr, tr * 0.88, { surf: 'graphite', tone: C.GUNMETAL, sides: 10 });
  if (opts.greave !== false) {
    strut(H(thigh), Lg.hip.clone().lerp(Lg.knee, 0.16), Lg.hip.clone().lerp(Lg.knee, 0.8), tr * 1.38, tr * 1.15, { surf: 'glaze', tone: C.ENAMEL, sides: 10, wear: 0.4 });
    const td = Lg.knee.clone().sub(Lg.hip).normalize();
    for (const f of [0.2, 0.76]) {
      const c = Lg.hip.clone().lerp(Lg.knee, f);
      strut(H(thigh), c.clone().addScaledVector(td, -0.012), c.clone().addScaledVector(td, 0.012), tr * 1.5, tr * 1.5, { surf: 'bronze', tone: C.BRASS, sides: 12, wear: 0.6 });
    }
  }
  // the knee hub: gunmetal, brass axle bosses each side, two rivets
  const axle = new THREE.Vector3().crossVectors(Lg.knee.clone().sub(Lg.hip), Lg.ankle.clone().sub(Lg.knee)).normalize();
  if (axle.x * Lg.s < 0) axle.negate();
  ball(H(thigh), Lg.knee, tr * 1.25, { surf: 'graphite', tone: C.GUNMETAL, w: 12, h: 8 });
  strut(H(thigh), Lg.knee.clone().addScaledVector(axle, -tr * 1.35), Lg.knee.clone().addScaledVector(axle, tr * 1.35), tr * 0.95, tr * 0.95, { surf: 'bronze', tone: C.BRASS, sides: 12, wear: 0.6 });
  for (const e of [1, -1]) rivet(H(thigh), Lg.knee.clone().addScaledVector(axle, e * tr * 1.36), axle.clone().multiplyScalar(e), 0.01);
  // the shin
  const sd = Lg.ankle.clone().sub(Lg.knee).normalize();
  const s0 = Lg.knee.clone().addScaledVector(sd, tr * 0.9), s1 = Lg.knee.clone().addScaledVector(sd, tr * 0.9 + 0.1);
  strut(H(shin), s0, s1, sr * 1.3, sr * 1.3, { surf: 'rubber', tone: C.GRAPH, sides: 12 });
  strut(H(shin), s1.clone().addScaledVector(sd, -0.012), s1.clone().addScaledVector(sd, 0.014), sr * 1.45, sr * 1.45, { surf: 'bronze', tone: C.BRASS, sides: 12, wear: 0.6 });
  const shinLen = Lg.ankle.distanceTo(s1);
  const sEnd = Lg.ankle.clone().addScaledVector(sd, -Math.min(0.34, shinLen * 0.28));
  if (opts.shin === 'staff') staff(H(shin), s1.clone().addScaledVector(sd, 0.012), sEnd, sr, sr * 0.82, { sides: 8, face: new THREE.Vector3(Lg.s, 0, Lg.zs ?? 0).normalize() });
  else {
    strut(H(shin), s1.clone().addScaledVector(sd, 0.012), sEnd, sr, sr * 0.84, { surf: 'glaze', tone: C.ENAMEL, sides: 10, wear: 0.4 });
    // a vermilion graduation band at mid-shin (flat ink)
    const m = s1.clone().lerp(sEnd, 0.5);
    strut(H(shin), m.clone().addScaledVector(sd, -0.012), m.clone().addScaledVector(sd, 0.012), sr * 0.93 + 0.002, sr * 0.92 + 0.002, { surf: 'glaze', tone: C.VERM, sides: 10, wear: 0.2 });
  }
  strut(H(shin), sEnd, Lg.ankle, sr * 0.72, sr * 0.62, { surf: 'graphite', tone: C.CHROME, sides: 8 });
  strut(H(shin), sEnd.clone().addScaledVector(sd, -0.014), sEnd.clone().addScaledVector(sd, 0.02), sr * 1.05, sr * 1.05, { surf: 'bronze', tone: C.BRASS, sides: 10, wear: 0.6 });
  // the foot: a ball joint, a riveted disc pad
  ball(H(foot), Lg.ankle, sr * 0.95, { surf: 'graphite', tone: C.GUNMETAL, w: 10, h: 6 });
  const pad = V(Lg.ankle.x, 0, Lg.ankle.z);
  lathe(H(foot), [P(0, 0, 'rubber', C.RUBBER), P(padR, 0, 'rubber', C.RUBBER), P(padR * 1.04, padR * 0.16, 'bronze', C.BRASS), P(padR * 0.72, padR * 0.44, 'bronze', C.BRASS), P(padR * 0.32, padR * 0.6, 'graphite', C.GUNMETAL), P(0, padR * 0.62, 'graphite', C.GUNMETAL)],
    at(pad.x, pad.y, pad.z), { segs: opts.padSegs ?? 16, wear: 0.6 });
  const rr = padR * 0.82;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    rivet(H(foot), V(pad.x + Math.sin(a) * rr, padR * 0.3, pad.z + Math.cos(a) * rr), V(Math.sin(a), 0.6, Math.cos(a)).normalize(), 0.01);
  }
  strut(H(foot), Lg.ankle, V(pad.x, padR * 0.55, pad.z), sr * 0.7, sr * 0.75, { surf: 'graphite', tone: C.GUNMETAL, sides: 8 });
  return { axle, sd };
}

/**
 * A flat enamel plate (outline in the plate's local XY, metres) placed by `M` (local +Z out of the plate), `d` thick,
 * a brass strip along its lowest edge (`foot`: true), rivets every `every` m inside its top edge.
 */
export function skirtPlate(b, outline, M, { d = 0.03, foot = true, every = 0.16, tone = C.ENAMEL, inset = 0.035, rows = 2 } = {}) {
  plate(b, outline, d, 0.006, M, { surf: 'glaze', tone, wear: 0.45 });
  const xs = outline.map((q) => q[0]), ys = outline.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const out = new THREE.Vector3(0, 0, 1).transformDirection(M);
  const loc = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(M);
  if (foot) strut(b, loc(x0 + 0.01, y0 + 0.012, 0), loc(x1 - 0.01, y0 + 0.012, 0), d * 0.75, d * 0.75, { surf: 'bronze', tone: C.BRASS, sides: 8, wear: 0.6 });
  if (every > 0) {
    const n = Math.max(1, Math.round((x1 - x0 - 2 * inset) / every));
    for (let k = 0; k <= n; k++) {
      const x = x0 + inset + (x1 - x0 - 2 * inset) * k / n;
      rivet(b, loc(x, y1 - inset, d / 2), out, 0.01);
      if (rows > 1) rivet(b, loc(x, y0 + inset + 0.03, d / 2), out, 0.01);
    }
  }
}
