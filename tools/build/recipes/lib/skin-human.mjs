/**
 * CALIMA — human head construction helpers (character-art, W1; R54, R56): the mesh cuts that pay
 * for the cloth, the eye patch UVs, the brow guides, the hairline shape and the scalp cards.
 * Everything Brea's recipe does that an NPC recipe does the same way. Node only, deterministic.
 * API: docs/ROUND5-CHARACTER-ART.md §3.
 */
import { MeshoptSimplifier } from 'meshoptimizer';
import { noise3, smooth, positionMap, recomputeNormals } from './face.mjs';
import {
  uvIslands, TriGrid, triSoup, hemisphereSet, bakeAOTexels, bakeAOPoints, blurMasked, convexity, scalarMap, seamlessTone, paintSkinAtlas, decodeStockSkin, webp, blit, paintEye,
  pores, colourZones, creases, smoothSkin, eyeSocketClean, lipTone, lidLines,
} from './skin.mjs';
import { rng, WRAP_ATLAS } from './wrap.mjs';
import { scatterAnchors, coilCards, coilField, coilSampler, hairCoverage, hairlineLayer, browLayer } from './hair.mjs';

const mix = (a, b, t) => a + (b - a) * t;

/** The texel density a human body wants (against the source layout): the face first, hidden body last. */
export function humanDensity(s) {
  const c = [(s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2];
  // the face. Fix round 2: the rule read `max y > 1.72`, which the face island stopped meeting once the forehead under the wrap was
  // culled, so the face fell to the skull's 1.5 (0.56 mm a texel: an 8 mm paste stroke was 14 texels tall). It is the frontmost
  // island that runs from the chin to the brow, at 2.1 (0.40 mm a texel; 2.3 does not pack)
  if (s.max[2] > 0.09 && s.min[1] < 1.6 && s.max[1] > 1.65) return 2.1;
  // skull sides + ears (fix round 2: the same culling dropped them to the neck's 1.05, 1.1 mm a texel on the ear and the temple
  // coils; the source gives them few texels, so 2.6 is what brings them to 0.64 mm. The arms, elastic, give 14 % of theirs for it)
  if (s.min[1] > 1.45 && s.max[1] > 1.66 && s.max[2] < 0.05) return 2.6;
  if (s.min[1] > 1.56 && s.max[1] < 1.6) return 0.7;                       // the mouth bag
  if (s.min[1] > 1.42) return 1.05;                                         // the neck
  if (Math.abs(c[0]) > 0.6) return c[0] < 0 ? 1.34 : 1.12;                  // hands: the right (∴) hand a little denser
  if (Math.abs(c[0]) > 0.12 && c[1] > 1.3) return 0.66;                     // arms (bare from the elbow)
  return 0.34;                                                              // covered body
}

export function vertexWeightOf(prim, set) {
  const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const out = new Float32Array(J.getCount()); const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  for (let i = 0; i < J.getCount(); i++) {
    J.getElement(i, j); W.getElement(i, w);
    let s = 0; for (let k = 0; k < 4; k++) if (set.has(j[k])) s += w[k];
    out[i] = s;
  }
  return out;
}
export function eyeCentres(prim) {
  const P = prim.getAttribute('POSITION'), p = [0, 0, 0];
  const Lc = [0, 0, 0, 0], Rc = [0, 0, 0, 0];
  for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p); const T = p[0] > 0 ? Lc : Rc; T[0] += p[0]; T[1] += p[1]; T[2] += p[2]; T[3]++; }
  return [Lc, Rc].map((c) => [c[0] / c[3], c[1] / c[3], c[2] / c[3]]);
}
export function eyeFrontZ(prim) {
  const P = prim.getAttribute('POSITION'), p = [0, 0, 0];
  let z = -9;
  for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p); z = Math.max(z, p[2]); }
  return z;
}
export function movedMask(prim, before) {
  const a = prim.getAttribute('POSITION').getArray();
  const m = new Uint8Array(a.length / 3);
  for (let i = 0; i < m.length; i++) {
    m[i] = Math.abs(a[i * 3] - before[i * 3]) + Math.abs(a[i * 3 + 1] - before[i * 3 + 1]) + Math.abs(a[i * 3 + 2] - before[i * 3 + 2]) > 1e-6 ? 1 : 0;
  }
  return m;
}

export function primFromGeo(doc, g) {
  const buf = doc.getRoot().listBuffers()[0];
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const nrm = new Float32Array(g.nrm);
  for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
  return doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(g.pos)))
    .setAttribute('NORMAL', acc('VEC3', nrm))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(g.uv)))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array(g.jnt)))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(g.wgt)))
    .setAttribute('COLOR_0', (() => { const n = g.col.length, c = new Uint8Array(n); for (let i = 0; i < n; i++) c[i] = Math.max(0, Math.min(255, Math.round(g.col[i] * 255))); return doc.createAccessor().setType('VEC4').setArray(c).setNormalized(true).setBuffer(buf); })())
    .setIndices(acc('SCALAR', new Uint32Array(g.idx)));
}

/**
 * Her hairline over the stock shell's coverage: a tapered sideburn in front of the ear, clear
 * of the ear itself, and a nape that comes to a soft low point instead of a shaved block.
 */
export function hairShape(X, Y, Z) {
  const ax = Math.abs(X);
  // the edge wanders at two scales, so it breaks into coils, not a clipper's line (fix round 1: the low edge over the ear read straight)
  const wob = (noise3(X * 90, Y * 90, Z * 90) - 0.5) * 0.009 + (noise3(X * 260 + 7, Y * 260, Z * 260) - 0.5) * 0.0042;
  // the sideburn: from under the wrap down in front of the ear, tapering to a point
  const t = smooth(1.654, 1.705, Y);
  const zf = -0.001 + t * 0.026 + wob, zb = -0.008 - t * 0.016 + wob * 0.8;
  const burn = 0.92 * (1 - smooth(zf - 0.008, zf + 0.004, Z)) * smooth(zb - 0.006, zb + 0.005, Z) * smooth(1.646, 1.676, Y);
  // behind the ear and down to the nape, whose low edge comes to a soft point
  const yLow = 1.572 + 0.036 * smooth(0.0, 0.058, ax) + 0.012 * smooth(0.05, 0.075, ax) + wob;
  // its front edge leaves the back of the ear and sweeps down and back
  const zBehind = -0.052 - 0.030 * smooth(1.668, 1.585, Y) + wob;
  const behind = (1 - smooth(zBehind - 0.006, zBehind + 0.001, Z)) * smooth(yLow - 0.003, yLow + 0.004, Y);
  // above the ear, a low band joining the two under the cloth
  const over = smooth(1.664, 1.676, Y + wob) * smooth(-0.056, -0.05, Z) * (1 - smooth(zf - 0.006, zf + 0.004, Z));
  // fix round 2: no rectangle cut round the ear (it printed a clipper's right angle): the hair keeps a wandering clearance off the
  // ear's own outline (`earClear`), and the temple runs down into a tapered sideburn (`templeHair`)
  return Math.max(burn, behind, over, templeHair(X, Y, Z)) * earClear(X, Y, Z);
}

/**
 * The ears, smaller, lower and round-topped (fix round 2). `skull(z)` is the side of the head under the ear (UBC female: fitted to the
 * stock's lateral profile in front of and behind it); `c` the ear's attachment (+x side, mirrored); `mm(v)` game mm to model units; a vertex's protrusion over it selects the ear, softly. The ear scales about
 * its attachment, then the ear and the skin round its root go down together, so it is lowered, not tilted.
 */
export function reshapeEars(prim, headW, { mm, scale = 0.85, drop = 5, c = [0.0735, 1.636, -0.024], skull = (z) => 0.0705 + 0.2 * (z + 0.006) } = {}) {
  const P = prim.getAttribute('POSITION'), a = P.getArray();
  const top = c[1] + 0.012;
  let n = 0;
  for (let i = 0; i < P.getCount(); i++) {
    if (headW[i] < 0.3) continue;
    const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2], ax = Math.abs(x), sx = Math.sign(x) || 1;
    if (ax < 0.055 || y < 1.57 || y > 1.71 || z > 0.03 || z < -0.09) continue;
    const box = smooth(1.596, 1.606, y) * (1 - smooth(1.668, 1.678, y)) * smooth(-0.054, -0.044, z) * (1 - smooth(-0.004, 0.004, z));
    const w = box * smooth(0.0012, 0.0042, ax - skull(z));
    // the root and the skin about it travel with the ear (a broad, soft patch), so the ear is lowered, not sheared
    const wT = Math.exp(-0.5 * (((y - c[1]) / 0.026) ** 2 + ((z - c[2]) / 0.024) ** 2)) * smooth(0.06, 0.068, ax);
    if (w <= 0 && wT <= 0.002) continue;
    let px = c[0] + (ax - c[0]) * scale, py = c[1] + (y - c[1]) * scale, pz = c[2] + (z - c[2]) * scale;
    // the outline rounds: in the ear's own (y, z) plane every point past an upright ellipse (half 0.030 x 0.018, scaled) in the
    // upper half comes softly back toward it, so the helix is an arc, with no point at its top-back; the lobe's tip rounds up
    {
      const ey = (py - c[1]) / (0.030 * scale), ez = (pz - c[2]) / (0.018 * scale), r = Math.hypot(ey, ez);
      const k = smooth(-0.15, 0.35, ey);
      if (r > 0.9) { const f = 1 + ((0.9 + (r - 0.9) * 0.35) / r - 1) * k; py = c[1] + (py - c[1]) * f; pz = c[2] + (pz - c[2]) * f; }
      const lobe = smooth(-0.62, -0.95, ey);
      if (lobe > 0) { py += lobe * 0.0016; pz += (c[2] - 0.003 - pz) * lobe * 0.42; px -= lobe * 0.0008; }
    }
    void top;
    const nx = ax + (px - ax) * w, ny = y + (py - y) * w - mm(drop) * Math.max(w, wT), nz = z + (pz - z) * w;
    a[i * 3] = sx * nx; a[i * 3 + 1] = ny; a[i * 3 + 2] = nz;
    n++;
  }
  P.setArray(a);
  return n;
}

/** Brea's ear after `reshapeEars`: its outline in the side (y, z) plane, an upright ellipse. */
export const EAR = { c: [0.0735, 1.6312, -0.024], ry: 0.0255, rz: 0.0153 };

/** 0 on and near the ear, 1 a wandering 3-6 mm off its outline: the hairline goes round the ear, never in a box. */
export function earClear(X, Y, Z, { gap = 0.0042, ear = EAR } = {}) {
  if (Math.abs(X) < 0.05) return 1;
  const wob = (noise3(X * 150 + 3, Y * 150, Z * 150) - 0.5) * 0.0045 + (noise3(X * 420, Y * 420 + 5, Z * 420) - 0.5) * 0.0016;
  const r = Math.hypot((Y - ear.c[1]) / (ear.ry + gap + wob), (Z - ear.c[2]) / (ear.rz + gap + wob));
  return smooth(0.94, 1.06, r);
}

/**
 * The close coils from the temple down in front of the ear (fix round 2, the judges: "the temple coil patches end in a hard
 * right-angle step in front of both ears"): the front edge comes down and back from under the hem to a soft point at the tragus'
 * height, the bottom edge rises toward the face to meet it, and over the ear the hair runs on to the nape. Both edges wander.
 */
export function templeHair(X, Y, Z) {
  const ax = Math.abs(X);
  if (ax < 0.05 || Y < 1.6 || Y > 1.725 || Z < -0.06 || Z > 0.045) return 0;
  const wob = (noise3(X * 90, Y * 90, Z * 90) - 0.5) * 0.0065 + (noise3(X * 260 + 7, Y * 260, Z * 260) - 0.5) * 0.0032;
  const t = smooth(1.62, 1.705, Y);
  const zf = mix(-0.0045, 0.025, Math.pow(t, 0.85)) + wob;
  const front = 1 - smooth(zf - 0.003, zf + 0.0035, Z);
  const tipY = 1.6235 + wob * 0.7;
  const bottom = smooth(tipY - 0.002, tipY + 0.007, Y - Math.max(0, Z + 0.006) * 0.75);
  const back = smooth(-0.062, -0.05, Z);
  return 0.95 * front * bottom * back * smooth(0.05, 0.058, ax);
}

/**
 * The cornea stands proud of the ball, a tight dome over the iris: from the side the iris and a wet form read, not a flat grey
 * wedge. `sphereZ` is the balls' centre depth. After A-face-delta's socket measure: the ball stays rigid, this is the eye's own form.
 */
export function corneaDome(eyesPrim, eyes, sphereZ, { height = 0.0033, r0 = 0.0018, r1 = 0.0074 } = {}) {
  const P = eyesPrim.getAttribute('POSITION'), a = P.getArray();
  for (let i = 0; i < P.getCount(); i++) {
    const e = eyes[a[i * 3] > 0 ? 0 : 1];
    const dx = a[i * 3] - e[0], dy = a[i * 3 + 1] - e[1], dz = a[i * 3 + 2] - sphereZ;
    if (dz <= 0) continue;
    a[i * 3 + 2] += height * (1 - smooth(r0, r1, Math.hypot(dx, dy)));
  }
  P.setArray(a);
  recomputeNormals(eyesPrim, null);
}

/**
 * What faces INTO the head never sees the sun, but the shadow pass renders back faces, so an inner wall facing a sun behind her has
 * no caster in front of it and lights up inside the nose, along the lips and on the lower lid. Read from a baked sky visibility,
 * after the paint (which reads the true normals): the deep ones point straight down, where no sun ever is; a nostril's floor, the
 * lower lid's rim and the top of the lower lip lean forward, out of any sun behind the head.
 */
export function leanInwardNormals(bodyPrim, eyesPrim, { L, eyes }) {
  const P = bodyPrim.getAttribute('POSITION'), N = bodyPrim.getAttribute('NORMAL');
  const pos = P.getArray(), nrm = Float32Array.from(N.getArray());
  const pick = [];
  for (let i = 0; i < P.getCount(); i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; if (y > 1.53 && y < 1.72 && Math.abs(x) < 0.075 && z > 0.03) pick.push(i); }
  const pts = new Float32Array(pick.length * 3), ns = new Float32Array(pick.length * 3);
  pick.forEach((v, i) => { for (let k = 0; k < 3; k++) { pts[i * 3 + k] = pos[v * 3 + k]; ns[i * 3 + k] = nrm[v * 3 + k]; } });
  const soup = triSoup(bodyPrim);
  for (const v of triSoup(eyesPrim)) soup.push(v);
  const ao = bakeAOPoints(pts, ns, new TriGrid(new Float32Array(soup), 0.012), { rays: 64, maxD: 0.03, lift: 0.0006 });
  let bent = 0;
  pick.forEach((v, i) => {
    const inward = ns[i * 3 + 2] < 0.45 ? 1 : 0.35;
    const x = pts[i * 3], y = pts[i * 3 + 1];
    const onLip = Math.abs(x) < 0.04 && y < L.upperLip[1] + 0.002 && y > L.upperLip[1] - 0.04;
    // on the front of the mid-face, a surface facing back at all is one of these, whatever the rays found; the lips only lean (below)
    const k = onLip ? 1 - smooth(0.1, 0.2, ao[i]) : Math.max((1 - smooth(0.16, 0.42, ao[i])) * inward, Math.abs(x) < 0.05 ? 1 - smooth(-0.04, 0.2, ns[i * 3 + 2]) : 0);
    if (k <= 0.01) return;
    const nx = nrm[v * 3] * (1 - k), ny = nrm[v * 3 + 1] * (1 - k) - k, nz = nrm[v * 3 + 2] * (1 - k) + 0.12 * k, l = Math.hypot(nx, ny, nz) || 1;
    nrm[v * 3] = nx / l; nrm[v * 3 + 1] = ny / l; nrm[v * 3 + 2] = nz / l;
    bent++;
  });
  pick.forEach((v) => {
    const x = pos[v * 3], y = pos[v * 3 + 1];
    const e = eyes[x > 0 ? 0 : 1];
    const lid = Math.abs(x - e[0]) < 0.027 && y < e[1] - 0.001 && y > e[1] - 0.017;
    const lip = Math.abs(x) < 0.04 && y < L.noseTip[1] - 0.003 && y > L.upperLip[1] - 0.04;
    // under the tip nothing outside the nose faces up: whatever does is a nostril's floor
    if (Math.abs(x) < 0.028 && y < L.noseTip[1] - 0.002 && y > L.upperLip[1] + 0.004 && nrm[v * 3 + 1] > -0.25) {
      const nx = nrm[v * 3], nz = Math.max(nrm[v * 3 + 2], 0.35), l = Math.hypot(nx, 0.25, nz);
      nrm[v * 3] = nx / l; nrm[v * 3 + 1] = -0.25 / l; nrm[v * 3 + 2] = nz / l;
      bent++;
      return;
    }
    if (!lid && !lip) return;
    const ny = nrm[v * 3 + 1], nz = nrm[v * 3 + 2];
    if (ny <= 0.3 * Math.max(nz, 0.01)) return;
    const yz = Math.hypot(ny, nz), a = Math.atan2(0.3, 1), sc = Math.sign(nz) >= 0 ? 1 : -1;
    nrm[v * 3 + 1] = yz * Math.sin(a) * sc; nrm[v * 3 + 2] = yz * Math.cos(a);
    bent++;
  });
  // Then the rays decide what the rules above missed (fix round 1: the judges' backlit and side-lit frames).
  const grid = new TriGrid(new Float32Array(soup), 0.012);
  // A deep fold (a nostril's walls, the corner of the mouth, the alar groove) shades by the way out of it, its bent normal, not by
  // its own facing: a wall inside the nostril that faces a sun on her left is shut off from it by the ala 5 mm away, but the
  // shadow's 3.5 cm normal offset steps over the ala and the wall burns pale through the opening
  const hemi = hemisphereSet(96);
  const yLo = L.upperLip[1] - 0.04, yHi = eyes[0][1] + 0.012;
  const openA = new Float32Array(pick.length).fill(1);
  pick.forEach((v, i) => {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    if (y < yLo || y > yHi || Math.abs(x) > 0.052) return;
    let gx = ns[i * 3], gy = ns[i * 3 + 1], gz = ns[i * 3 + 2];
    const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
    let tx, ty, tz;
    if (Math.abs(gx) < 0.8) { tx = 0; ty = -gz; tz = gy; } else { tx = -gz; ty = 0; tz = gx; }
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const bx = gy * tz - gz * ty, by = gz * tx - gx * tz, bz = gx * ty - gy * tx;
    let ox = 0, oy = 0, oz = 0, open = 0;
    for (let r = 0; r < 96; r++) {
      const a = hemi[r * 3], b = hemi[r * 3 + 1], c = hemi[r * 3 + 2];
      const dx = tx * a + bx * b + gx * c, dy = ty * a + by * b + gy * c, dz = tz * a + bz * b + gz * c;
      if (grid.cast(x + gx * 0.0005, y + gy * 0.0005, z + gz * 0.0005, dx, dy, dz, 0.03, 0.0003) >= 0) continue;
      ox += dx; oy += dy; oz += dz; open++;
    }
    const a = open / 96, k = 1 - smooth(0.3, 0.62, a);
    openA[i] = a;
    if (k <= 0.01 || open === 0) return;
    const ol = Math.hypot(ox, oy, oz) || 1;
    let nx = nrm[v * 3] * (1 - k) + (ox / ol) * k, ny = nrm[v * 3 + 1] * (1 - k) + (oy / ol) * k, nz = nrm[v * 3 + 2] * (1 - k) + (oz / ol) * k;
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm[v * 3] = nx / l; nrm[v * 3 + 1] = ny / l; nrm[v * 3 + 2] = nz / l;
    bent++;
  });
  // The nose's underside faces the ground, which the game's light barely fills: by its own facing it went black round the nostrils,
  // with the lit columella a pale shard between them. It takes the light the upper lip throws back up into it, as a forward lean of
  // the shading normal (safe in a back light: forward is away from any sun behind her); the slit itself keeps its dark.
  const tip = L.noseTip;
  pick.forEach((v, i) => {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    if (Math.abs(x) > 0.027 || y > tip[1] + 0.003 || y < L.upperLip[1] + 0.003 || z < tip[2] - 0.042) return;
    const ny = nrm[v * 3 + 1];
    const k = 0.7 * smooth(-0.12, -0.42, ny) * smooth(0.32, 0.58, openA[i]) * (1 - smooth(0.022, 0.027, Math.abs(x)));
    if (k <= 0.01) return;
    const tx = nrm[v * 3] * 0.45, ty = -0.42, tz = 0.9, tl = Math.hypot(tx, ty, tz);
    const nx = mix(nrm[v * 3], tx / tl, k), my = mix(ny, ty / tl, k), nz = mix(nrm[v * 3 + 2], tz / tl, k), l = Math.hypot(nx, my, nz) || 1;
    nrm[v * 3] = nx / l; nrm[v * 3 + 1] = my / l; nrm[v * 3 + 2] = nz / l;
    bent++;
  });
  // Last, the back suns (an ala's groove, a lip's corner, a pale shard inside a nostril): the game's
  // sun shadow samples 3.5 cm out along the vertex normal (environment.js normalBias), so a surface that faces a sun BEHIND the
  // head while the head itself stands between them lights up anyway. For every back sun the game can give her face (azimuth
  // 100..260 deg off her front, up to 52 deg high), a vertex in the mid-face that faces it and is shut off from it by her own
  // skin turns away from it, by the least turn that does (a projection, so a front or top light barely changes).
  const suns = [];
  for (let A = 100; A <= 260; A += 20) for (const E of [4, 18, 34, 52]) {
    const a = A * Math.PI / 180, e = E * Math.PI / 180;
    suns.push([Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)]);
  }
  pick.forEach((v) => {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    if (y < yLo || y > yHi || Math.abs(x) > 0.052) return;
    let nx = nrm[v * 3], ny = nrm[v * 3 + 1], nz = nrm[v * 3 + 2];
    const shut = [];
    for (const s of suns) {
      if (nx * s[0] + ny * s[1] + nz * s[2] <= -0.02) continue;
      if (grid.cast(x + nx * 0.0006, y + ny * 0.0006, z + nz * 0.0006, s[0], s[1], s[2], 0.25, 0.0004) >= 0) shut.push(s);
    }
    if (!shut.length) return;
    for (let it = 0; it < 8; it++) {
      let moved = false;
      for (const s of shut) {
        const d = nx * s[0] + ny * s[1] + nz * s[2] + 0.03;
        if (d <= 0) continue;
        nx -= d * s[0]; ny -= d * s[1]; nz -= d * s[2];
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        moved = true;
      }
      if (!moved) break;
    }
    nrm[v * 3] = nx; nrm[v * 3 + 1] = ny; nrm[v * 3 + 2] = nz;
    bent++;
  });
  N.setArray(nrm);
  return bent;
}

/**
 * Whatever a collar's opening could show that is not skin: a closed dark lid inside the collar, from inside the neck out toward the
 * collar's own wall (`margin` short of it) a hand's width under its rim at the BACK, where the collar stands off the neck; at the
 * front and the sides it stays inside the neck (the V shows skin down to the smock). A look down inside the collar, past a bowed
 * head, over the shoulder and down the back, where the single-sided smock shows no inside, meets the lid, never the ground.
 * Fix round 1 (A-wrap-closed): the first version lay under the skin, so such a look slid down the gap between the back and the
 * smock and out through it; a lid nearer the wall than 12 mm poked through the smock's back once the arms were down.
 * Skinned like the torso under the collar (never the neck); one dark texel (the UV of `darkUV`); both faces. Call after the paint.
 * Returns the first new vertex index.
 */
export function appendCollarSkirt(prim, outfitTris, { centerZ = -0.012, y0 = 1.44, rx0 = 0.032, rz0 = 0.038, rx1 = 0.19, rz1 = 0.14, seg = 20, rings = 2, gap = 0.006, backLift = 0.035, margin = 0.012, lip = 0.006, darkUV, reach = -0.1 } = {}) {
  const grid = new TriGrid(new Float32Array(outfitTris), 0.03);
  const P = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const n0 = P.getCount();
  const near = [];
  // skinned like the torso under the collar, never like the neck: with the head bowed the neck leans forward off a lid that
  // followed it and the opening behind it showed the ground
  { const q = [0, 0, 0]; for (let i = 0; i < n0; i++) { P.getElement(i, q); if (q[1] > 1.28 && q[1] < 1.43 && Math.abs(q[0]) < 0.28) near.push([q[0], q[1], q[2], i]); } }
  const pos = [], nrm = [], uv = [], jnt = [], wgt = [], idx = [];
  const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  const put = (x, y, z) => {
    pos.push(x, y, z); nrm.push(0, 1, 0); uv.push(darkUV[0], darkUV[1]);
    let best = -1, bd = 9;
    for (const v of near) { const d = (v[0] - x) ** 2 + (v[1] - y) ** 2 + (v[2] - z) ** 2; if (d < bd) { bd = d; best = v[3]; } }
    J.getElement(best, j); W.getElement(best, w);
    jnt.push(...j); wgt.push(...w);
  };
  // rings 0..rings: the lid; rings+1: its lip, out to `lip` from the wall at the back, folding back to the lid's edge (rings+2), so
  // a look grazing down the inside of the back wall meets it (fix round 1: measured on the live pose, 0 enclosed px over 96 views)
  const ringsAll = rings + 2;
  const edge = [];
  for (let r = 0; r <= rings; r++) for (let k = 0; k < seg; k++) {
    const t0 = r / rings, a = (k / seg) * Math.PI * 2, sa = Math.sin(a), ca = Math.cos(a);
    // out to the wall at the back, and (fix round 2, `reach`: the cosine past which it reaches the wall) round the sides too: A-wrap-closed's
    // collar views saw slivers of sky beside the neck where the smock's single-sided inner wall turns its back
    const back = smooth(reach, reach - 0.4, ca), t = t0 * back;
    const lift = backLift * 0.5 * (1 - ca);                    // 0 at the front, half at the sides, all of it at the back
    let y = y0 + lift - 0.004 * t;                             // flat out to the wall: a look past the neck meets it before the wall
    // it stays inside the outfit's wall at its own height, and under its roof
    const wall = grid.cast(0, y, centerZ, sa, 0, ca, 0.4, 0.0001);
    const lim = wall >= 0 ? Math.max(0, wall - margin) : 1;
    const rr = Math.min(1, lim / Math.max(1e-6, Math.hypot(sa * mix(rx0, rx1, t), ca * mix(rz0, rz1, t))));
    const x = sa * mix(rx0, rx1, t) * rr, z = centerZ + ca * mix(rz0, rz1, t) * rr;
    const hit = grid.cast(x, 1.62, z, 0, -1, 0, 0.34, 0.0001);
    if (hit >= 0) y = Math.min(y, 1.62 - hit - gap);
    put(x, y, z);
    if (r === rings) edge.push([sa, ca, y, Math.hypot(x, z - centerZ), back]);
  }
  for (const out of [true, false]) for (const [sa, ca, y, r0, back] of edge) {
    const wall = grid.cast(0, y, centerZ, sa, 0, ca, 0.4, 0.0001);
    const rr = out && back >= 0.5 && wall >= 0 ? Math.min(r0 + 0.03, Math.max(0, wall - lip)) : out ? r0 * 0.975 : r0;
    put(sa * rr, y, centerZ + ca * rr);
  }
  for (let r = 0; r < ringsAll; r++) for (let k = 0; k < seg; k++) {
    const kn = (k + 1) % seg, a = n0 + r * seg + k, b = n0 + r * seg + kn, c = n0 + (r + 1) * seg + k, d = n0 + (r + 1) * seg + kn;
    // wound so its upper (inner, for the hem) face is the front one
    idx.push(a, c, b, b, c, d);
  }
  // and its other face too: from a camera above her the far side of a bowed lid turns its back, which FrontSide would cull
  const nRing = (ringsAll + 1) * seg, m0 = n0 + nRing;
  for (let i = 0; i < nRing; i++) {
    pos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); nrm.push(0, -1, 0); uv.push(uv[i * 2], uv[i * 2 + 1]);
    jnt.push(jnt[i * 4], jnt[i * 4 + 1], jnt[i * 4 + 2], jnt[i * 4 + 3]); wgt.push(wgt[i * 4], wgt[i * 4 + 1], wgt[i * 4 + 2], wgt[i * 4 + 3]);
  }
  for (let r = 0; r < ringsAll; r++) for (let k = 0; k < seg; k++) {
    const kn = (k + 1) % seg, a = m0 + r * seg + k, b = m0 + r * seg + kn, c = m0 + (r + 1) * seg + k, d = m0 + (r + 1) * seg + kn;
    idx.push(a, b, c, b, d, c);
  }
  const grow = (A, add) => { const src = A.getArray(), dst = new src.constructor(src.length + add.length); dst.set(src); dst.set(add, src.length); A.setArray(dst); };
  grow(P, pos); grow(prim.getAttribute('NORMAL'), nrm); grow(prim.getAttribute('TEXCOORD_0'), uv); grow(J, jnt); grow(W, wgt);
  grow(prim.getIndices(), idx);
  return n0;
}

/**
 * The collar's inner wall (fix round 2, A-wrap-closed's collar views, R64 d): a single-sided outfit shows nothing from inside, so a
 * level look past the neck into the collar stand's far side saw the sky through it. A band of the body's own dark texel stands `inset`
 * inside the outfit's wall, from `y0` (the collar lid's height) up to `below` under the outfit's rim, at every azimuth whose cosine
 * (0 = her front) is under `reach` (the front V stays open), facing the neck. Skinned like the torso under the collar, as the lid is.
 * Call after `appendCollarSkirt`. Returns the first new vertex index.
 */
export function appendCollarLiner(prim, outfitTris, { centerZ = -0.012, y0 = 1.44, seg = 20, reach = 0.45, inset = 0.003, below = 0.003, darkUV } = {}) {
  const grid = new TriGrid(new Float32Array(outfitTris), 0.03);
  const P = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const n0 = P.getCount();
  const near = [];
  { const q = [0, 0, 0]; for (let i = 0; i < n0; i++) { P.getElement(i, q); if (q[1] > 1.28 && q[1] < 1.43 && Math.abs(q[0]) < 0.28) near.push([q[0], q[1], q[2], i]); } }
  const pos = [], nrm = [], uv = [], jnt = [], wgt = [], idx = [];
  const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
  const put = (x, y, z, nx, nz) => {
    pos.push(x, y, z); nrm.push(nx, 0, nz); uv.push(darkUV[0], darkUV[1]);
    let best = -1, bd = 9;
    for (const v of near) { const d = (v[0] - x) ** 2 + (v[1] - y) ** 2 + (v[2] - z) ** 2; if (d < bd) { bd = d; best = v[3]; } }
    J.getElement(best, j); W.getElement(best, w);
    jnt.push(...j); wgt.push(...w);
  };
  const cols = [];
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * Math.PI * 2, sa = Math.sin(a), ca = Math.cos(a);
    if (ca >= reach) { cols.push(null); continue; }
    const wallAt = (y) => grid.cast(0, y, centerZ, sa, 0, ca, 0.3, 0.0001);
    let yBot = y0 + 0.035 * 0.5 * (1 - ca);
    while (wallAt(yBot) < 0 && yBot < y0 + 0.08) yBot += 0.002;
    let yTop = yBot;
    while (wallAt(yTop + 0.002) >= 0 && yTop < yBot + 0.15) yTop += 0.002;
    yTop -= below;
    const rB = wallAt(yBot), rT = wallAt(yTop);
    if (rB < 0 || rT < 0 || yTop <= yBot + 0.004) { cols.push(null); continue; }
    const base = n0 + pos.length / 3;
    put(sa * (rB - inset), yBot, centerZ + ca * (rB - inset), -sa, -ca);
    put(sa * (rT - inset), yTop, centerZ + ca * (rT - inset), -sa, -ca);
    cols.push(base);
  }
  for (let k = 0; k < seg; k++) {
    const a = cols[k], b = cols[k + 1];
    if (a === null || b === null) continue;
    // facing the neck: the quad's normal points at the axis
    const ax = pos[(a - n0) * 3], az = pos[(a - n0) * 3 + 2] - centerZ, bx = pos[(b - n0) * 3], bz = pos[(b - n0) * 3 + 2] - centerZ;
    const e1 = [bx - ax, 0, bz - az], e2 = [0, 1, 0];
    const nx = e1[1] * e2[2] - e1[2] * e2[1], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const inward = nx * -(ax + bx) + nz * -(az + bz) > 0;
    if (inward) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const grow = (A, add) => { const src = A.getArray(), dst = new src.constructor(src.length + add.length); dst.set(src); dst.set(add, src.length); A.setArray(dst); };
  grow(P, pos); grow(prim.getAttribute('NORMAL'), nrm); grow(prim.getAttribute('TEXCOORD_0'), uv); grow(J, jnt); grow(W, wgt);
  grow(prim.getIndices(), idx);
  return { first: n0, tris: idx.length / 3 };
}

/**
 * The close coils a wrap leaves showing at the temples: a band under the first hem above a point, as wide as
 * `width(az)` by azimuth (0 at the forehead corner, widest before the ear), both sides alike, clear of the ear.
 * `hemGap(p, max)` comes from woundHeadwrap. The coil field itself breaks the band's lower edge.
 */
export function hairBandUnderHem(hemGap, { center = [0, 1.672, -0.012], az0 = 0.62, az1 = 1.05, azEnd = 2.6, width = 0.019, max = 0.03 } = {}) {
  const q = [0, 0, 0];
  return (X, Y, Z) => {
    if (Y < 1.6) return 0;
    const ax = Math.abs(X);
    const clear = earClear(X, Y, Z);                                            // round the ear's own outline (fix round 2: no box)
    if (clear <= 0) return 0;
    const az = Math.atan2(ax, Z - center[2]);
    if (az < az0 || az > azEnd) return 0;
    const wob = (noise3(X * 170, Y * 170, Z * 170) - 0.5) * 0.0065 + (noise3(X * 60, Y * 60, Z * 60) - 0.5) * 0.006;
    const w = width * smooth(az0, az1, az) + wob;
    if (w <= 0) return 0;
    q[0] = X; q[1] = Y; q[2] = Z;
    const g = hemGap(q, max);
    return (1 - smooth(w * 0.5, w * 1.25, g)) * clear;
  };
}

/** Brow centre lines from the stock brow cards (raw, after the field), flattened 40 % (bible §3.5). */
export function browLines(prim) {
  const P = prim.getAttribute('POSITION'), p = [0, 0, 0];
  const out = {};
  for (const side of [1, -1]) {
    const bins = new Map();
    let meanY = 0, cnt = 0;
    for (let i = 0; i < P.getCount(); i++) {
      P.getElement(i, p);
      if (Math.sign(p[0]) !== side) continue;
      const k = Math.round(p[0] / 0.004);
      const b = bins.get(k) || { y0: 9, y1: -9, s: 0, n: 0 };
      b.y0 = Math.min(b.y0, p[1]); b.y1 = Math.max(b.y1, p[1]); b.s += p[1]; b.n++;
      bins.set(k, b); meanY += p[1]; cnt++;
    }
    meanY /= cnt;
    const keys = [...bins.keys()].sort((a, b) => a - b);
    const pts = keys.map((k) => { const b = bins.get(k); const cy = b.s / b.n; return { x: k * 0.004, y: cy + (meanY + 0.0038 - cy) * 0.74, half: (b.y1 - b.y0) * 0.5 * 1.08 }; });
    const x0 = pts[0].x, x1 = pts[pts.length - 1].x;
    // the painted brow stops short of the stock card's long outer tail
    const inner = side > 0 ? x0 : x1, outer = side > 0 ? x1 : x0;
    const cut = outer + (inner - outer) * 0.13;
    out[side] = {
      x0: side > 0 ? x0 : cut, x1: side > 0 ? cut : x1,
      line: (x) => {
        const f = Math.max(0, Math.min(pts.length - 1.0001, (x - x0) / (x1 - x0) * (pts.length - 1)));
        const i = Math.floor(f), t = f - i;
        return { y: pts[i].y + (pts[i + 1].y - pts[i].y) * t, half: Math.max(0.0014, (pts[i].half + (pts[i + 1].half - pts[i].half) * t) * 0.54) };
      },
    };
  }
  return out;
}

/**
 * The eyeball gets a planar projection along +Z into its patch, a hair converged, so the iris sits in the patch centre.
 * `rect` is one patch both eyes share, or (fix round 2) `[rectLeft, rectRight]`, one per eye, so each eye's lids, corners and
 * caruncle are painted where that eye's own opening puts them (`paintHumanSkin` paints them from the openings).
 */
export const EYE_CONV = 0.00045;
export function remapEyeUV(prim, eyes, rect) {
  const P = prim.getAttribute('POSITION'), UV = prim.getAttribute('TEXCOORD_0'), p = [0, 0, 0];
  const arr = new Float32Array(UV.getCount() * 2);
  for (let i = 0; i < P.getCount(); i++) {
    P.getElement(i, p);
    const e = p[0] > 0 ? eyes[0] : eyes[1];
    const conv = p[0] > 0 ? -EYE_CONV : EYE_CONV;
    const r = Array.isArray(rect) ? rect[p[0] > 0 ? 0 : 1] : rect;
    arr[i * 2] = r.x + (0.5 + (p[0] - e[0] + conv) / EYE_SPAN) * r.w;
    arr[i * 2 + 1] = r.y + (0.5 - (p[1] - e[1]) / EYE_SPAN) * r.h;
  }
  UV.setArray(arr);
}
/** The metres the eye patch spans. */
export const EYE_SPAN = 0.0345;

/** An ear's tip that would pierce the cloth lies under it instead: the hem crosses the ear, the ear does not poke through the wrap. */
export function tuckUnderCloth(prim, stack, isEar, { clear = 0.0016 } = {}) {
  const P = prim.getAttribute('POSITION'), a = P.getArray(), c = stack.center;
  let n = 0;
  for (let i = 0; i < P.getCount(); i++) {
    const p = [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
    if (!isEar(p)) continue;
    const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2], r = Math.hypot(x, y, z) || 1;
    if (!stack.coveredAt(x / r, y / r, z / r)) continue;
    const top = stack.clothAt(x / r, y / r, z / r) - clear;
    if (r <= top) continue;
    a[i * 3] = c[0] + x / r * top; a[i * 3 + 1] = c[1] + y / r * top; a[i * 3 + 2] = c[2] + z / r * top;
    n++;
  }
  P.setArray(a);
  return n;
}

/** Drop skull triangles the wrap fully covers (ears stay). Returns the count. */
export function cullUnderWrap(prim, covers, isEar) {
  const P = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), p = [0, 0, 0];
  const c = new Uint8Array(P.getCount());
  for (let i = 0; i < c.length; i++) { P.getElement(i, p); c[i] = (p[1] > 1.6 && !isEar(p) && covers(p)) ? 1 : 0; }
  const keep = [];
  let n = 0;
  for (let t = 0; t < idx.length; t += 3) { if (c[idx[t]] && c[idx[t + 1]] && c[idx[t + 2]]) { n++; continue; } keep.push(idx[t], idx[t + 1], idx[t + 2]); }
  prim.getIndices().setArray(new Uint32Array(keep));
  return n;
}

/** The back half of each eyeball is inside the skull. */
export function cullEyeBacks(prim, eyes) {
  const P = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), p = [0, 0, 0];
  const zc = eyes[0][2] - 0.002;
  const back = new Uint8Array(P.getCount());
  for (let i = 0; i < back.length; i++) { P.getElement(i, p); back[i] = p[2] < zc ? 1 : 0; }
  const keep = [];
  let n = 0;
  for (let t = 0; t < idx.length; t += 3) { if (back[idx[t]] && back[idx[t + 1]] && back[idx[t + 2]]) { n++; continue; } keep.push(idx[t], idx[t + 1], idx[t + 2]); }
  prim.getIndices().setArray(new Uint32Array(keep));
  compactPrim(prim);
  return n;
}

/**
 * The ball under the lids is never seen (fix round 2, paying for the lid rims, the lashes' backs and the tail's hems): a ball
 * triangle with no vertex inside the eye's opening grown by `margin` (front-projected; the lids lie on the ball, so any view sees
 * the ball only through that opening) is dropped. `opens` from eyeOpening, one per eye ([left, right]). Returns the count.
 */
export function cullEyeUnderLids(prim, eyes, opens, { margin = 0.0026 } = {}) {
  const P = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray(), p = [0, 0, 0];
  const seen = new Uint8Array(P.getCount());
  for (let i = 0; i < seen.length; i++) {
    P.getElement(i, p);
    const o = opens[p[0] > 0 ? 0 : 1];
    const lo = Math.min(o.x0, o.x1), hi = Math.max(o.x0, o.x1);
    if (p[0] < lo - margin || p[0] > hi + margin) continue;
    const X = Math.max(lo, Math.min(hi, p[0]));
    seen[i] = p[1] <= o.upper(X) + margin && p[1] >= o.lower(X) - margin ? 1 : 0;
  }
  const keep = [];
  let n = 0;
  for (let t = 0; t < idx.length; t += 3) { if (seen[idx[t]] || seen[idx[t + 1]] || seen[idx[t + 2]]) keep.push(idx[t], idx[t + 1], idx[t + 2]); else n++; }
  prim.getIndices().setArray(new Uint32Array(keep));
  compactPrim(prim);
  return n;
}

/** Hands at a game's density: the palm and back islands simplified with their borders locked (the fingers keep their silhouette). */
export async function simplifyHands(prim) {
  await MeshoptSimplifier.ready;
  const { islands, islandOf } = uvIslands(prim);
  const pos = Float32Array.from(prim.getAttribute('POSITION').getArray());
  const idx = prim.getIndices().getArray();
  const groups = new Map();
  const rest = [];
  for (let t = 0; t < idx.length; t += 3) {
    const s = islands[islandOf[idx[t]]];
    const isHand = Math.abs((s.min[0] + s.max[0]) / 2) > 0.6 && s.tris > 100;
    if (isHand) { let g = groups.get(s.id); if (!g) { g = []; groups.set(s.id, g); } g.push(idx[t], idx[t + 1], idx[t + 2]); } else rest.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  let cut = 0;
  const ids = [...groups.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const g = groups.get(id);
    const target = Math.floor(g.length * 0.5 / 3) * 3;
    const [out] = MeshoptSimplifier.simplify(Uint32Array.from(g), pos, 3, target, 0.012, ['LockBorder']);
    cut += (g.length - out.length) / 3;
    for (let i = 0; i < out.length; i++) rest.push(out[i]);
  }
  prim.getIndices().setArray(new Uint32Array(rest));
  return cut;
}

/** Remove vertices no triangle references (every attribute, keeping order). */
export function compactPrim(prim) {
  const idx = prim.getIndices().getArray();
  const n = prim.getAttribute('POSITION').getCount();
  const remap = new Int32Array(n).fill(-1);
  let m = 0;
  for (let i = 0; i < idx.length; i++) if (remap[idx[i]] < 0) remap[idx[i]] = 0;
  for (let i = 0; i < n; i++) if (remap[i] === 0) remap[i] = m++;
  if (m === n) return;
  for (const sem of prim.listSemantics()) {
    const A = prim.getAttribute(sem), s = A.getElementSize(), src = A.getArray();
    const dst = new src.constructor(m * s);
    for (let i = 0; i < n; i++) if (remap[i] >= 0) for (let k = 0; k < s; k++) dst[remap[i] * s + k] = src[i * s + k];
    A.setArray(dst);
  }
  const out = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) out[i] = remap[idx[i]];
  prim.getIndices().setArray(out);
}
/** Coil cards on the scalp below the wrap, around the ears and down the nape. */
export function scalpCards({ bodyPrim, headW, shellGrid, wrapped, skinJ, skinW, hairShape: shape = hairShape, temples = false, twoSided = false }) {
  const A = WRAP_ATLAS;
  const P = bodyPrim.getAttribute('POSITION');
  const verts = [];
  { const p = [0, 0, 0]; for (let i = 0; i < P.getCount(); i++) { if (headW[i] < 0.2) continue; P.getElement(i, p); if (p[1] > 1.5) verts.push([p[0], p[1], p[2], i]); } }
  const soup = triSoup(bodyPrim, (a, b, c) => headW[a] > 0.5 || headW[b] > 0.5 || headW[c] > 0.5);
  const grid = new TriGrid(new Float32Array(soup), 0.016);
  const center = [0, 1.66, -0.02];
  const keep = (p, d) => {
    // under the stock shell, below the wrap's low edge (by a tuck), not on the ear
    const hit = shellGrid.cast(p[0] - d[0] * 0.002, p[1] - d[1] * 0.002, p[2] - d[2] * 0.002, d[0], d[1], d[2], 0.03, 0.0001);
    if (hit < 0) return false;
    if (shape(p[0], p[1] - 0.002, p[2]) < 0.6) return false;
    if (p[2] > -0.05) return false;                                 // in front of the ear the coils are painted
    // (fix round 2, A-wrap-closed: a card whose tip could close against the top of the ear left a pinhole of sky between them)
    if (earClear(p[0], p[1], p[2], { gap: 0.02 }) < 0.5) return false;
    return wrapped.lowEdge(p) < 0.10;
  };
  const anchors = scatterAnchors(grid, { center, step: 0.118, seed: 5, keep, elMin: -1.2, elMax: 0.75 });
  // (fix round 2, A-wrap-closed: the lowest nape cards and those just behind the ear lie flat, a fifth of the lift, and so do the temple
  // cards below (0.3): seen from behind, a tip standing off the head's curve at its outline shut a sliver of sky against the skin)
  for (const a of anchors) if (a.p[1] < 1.6 || earClear(a.p[0], a.p[1], a.p[2], { gap: 0.022 }) < 0.5) a.liftK = 0.2;
  // a few coils escape under the hem at the temples: the wrap sits on hair, not on a mannequin
  const R0 = rng(77);
  const far = 0.3;
  // (fix round 2: six a side, from the forehead corner to above the sideburn; the last three stood over the ear's top, where their
  // tips closed against it (A-wrap-closed), and the painted coils carry that stretch now)
  if (temples) for (const side of [1, -1]) for (let i = 0; i < 6; i++) {
    const az = side * (0.62 + i * 0.105 + (R0() - 0.5) * 0.06);
    let found = null;
    for (let el = 0.5; el > -0.3; el -= 0.006) {
      const d = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
      const t = grid.cast(center[0] + d[0] * far, center[1] + d[1] * far, center[2] + d[2] * far, -d[0], -d[1], -d[2], far, 0.0001);
      if (t < 0) continue;
      const q = [center[0] + d[0] * (far - t), center[1] + d[1] * (far - t), center[2] + d[2] * (far - t)];
      if (wrapped.hemGap(q, 0.006) < 0.004) { found = { p: q, n: d, az, el, scale: 0.42 + R0() * 0.2, liftK: 0.3 }; break; }
    }
    if (found && Math.abs(found.p[0]) < 0.0735 && earClear(found.p[0], found.p[1], found.p[2], { gap: 0.011 }) >= 0.5) anchors.push(found);
  }
  const skinOf = (p) => {
    let best = null, bd = 9;
    for (const v of verts) { const d = (v[0] - p[0]) ** 2 + (v[1] - p[1]) ** 2 + (v[2] - p[2]) ** 2; if (d < bd) { bd = d; best = v[3]; } }
    const j = [0, 0, 0, 0], w = [0, 0, 0, 0];
    skinJ.getElement(best, j); skinW.getElement(best, w);
    return { j: j.slice(), w: w.slice() };
  };
  const flow = (a, R) => {
    const x = a.p[0], z = a.p[2];
    const f = [Math.sign(x) * 0.12 + (R() - 0.5) * 0.7, -1, (z > -0.01 ? -0.85 : -0.2) + (R() - 0.5) * 0.7];
    return f;
  };
  // (fix round 1, A-wrap-closed: the cards hug the scalp, so their tips break the hairline over skin, not against the sky)
  return coilCards(anchors, { flow, skinOf, rect: A.coilFringe.rect, W: A.W, length: [0.012, 0.02], width: [0.011, 0.018], liftTip: [0.0004, 0.0016], twoSided });
}

/**
 * The face layers every human gets, in paint order: the source's strokes smoothed, the make-up
 * off the eyes, the lips toned, the colour zones, pores, squint creases, the nasolabial fold.
 */
export function faceLayers({ L, eyes, cheek, mouthBag = null }) {
  const noseT = L.noseTip;
  const faceZone = (T) => (T.Y > 1.45 && Math.abs(T.X) < 0.1 ? 1 : 0);
  const notFeature = (T) => {
    // smooth the source's strokes on the open skin, not on the lips or inside the nostrils
    // (fix round 2: the ring round the mouth is open skin too: the source's strokes there read as stubble in a low sun)
    const lip = Math.hypot((T.X) / 0.028, (T.Y - (L.upperLip[1] - 0.009)) / 0.0145);
    const nostril = Math.hypot(T.X / 0.024, (T.Y - (noseT[1] - 0.012)) / 0.012);
    return faceZone(T) * smooth(0.9, 1.12, lip) * smooth(0.9, 1.25, nostril);
  };
  // a nostril is a graded dark brown with a small dark core: never a black hole, never a pale wall in it
  const nostrils = (T) => {
    if (Math.abs(T.X) > 0.02 || T.Y > noseT[1] + 0.006 || T.Y < noseT[1] - 0.026 || T.Z < noseT[2] - 0.05) return;
    const d = Math.hypot((Math.abs(T.X) - 0.0088) / 0.0072, (T.Y - (noseT[1] - 0.0087)) / 0.0062, (T.Z - (noseT[2] - 0.0076)) / 0.011);
    const inner = 1 - smooth(0.42, 1.12, d), core = 1 - smooth(0.14, 0.52, d);
    const under = smooth(-0.3, -0.85, T.ny) * (1 - smooth(1.0, 1.7, d));
    if (under <= 0 && inner <= 0) return;
    // what faces up in there is the nostril's floor: never lit in life, and no pale shard in a frame
    const floor = smooth(-0.15, 0.35, T.ny) * (1 - smooth(0.9, 1.5, d));
    const m = (1 - 0.16 * under) * (1 - 0.42 * inner) * (1 - 0.6 * core) * (1 - 0.8 * floor);
    T.r *= m; T.g *= m * 0.95; T.b *= m * 0.93;
    T.nflat = Math.max(T.nflat, Math.max(inner, floor));
    T.ao = mix(T.ao, Math.max(T.ao, 0.5), inner);      // the hollow's shade is painted, soft: the baked AO would crush it to black
    T.rough = mix(T.rough, 0.9, inner);
  };
  // anything that faces INTO the head (a nostril's inner wall, a lip's inside, a lid's wet line) never sees the sky and is
  // near-black in the albedo, whatever the source painted: the shadow pass renders back faces, so with the sun behind her
  // it would light up inside the nose and along the lips
  const inward = (T) => {
    // the inside of the mouth, teeth and all: she keeps it shut (the lips share that island: only what faces away from the light is inside)
    if (mouthBag && mouthBag.has(T.island) && (T.nz < 0.05 || T.ao < 0.22)) { T.r = 8; T.g = 5; T.b = 5; T.rough = 0.98; T.ao = Math.min(T.ao, 0.3); return; }
    if (T.Y < 1.45 || Math.abs(T.X) > 0.05 || T.Z < 0.02) return;
    // (fix round 2: a texel that faces forward is darkened this way only round the nostrils; at the mouth's corners the deep fold's
    // low AO took the forward skin toward near-black too, and a low sun read it as stubble or grime)
    const nose = Math.hypot(T.X / 0.024, (T.Y - (noseT[1] - 0.012)) / 0.014) < 1;
    const k = (1 - smooth(0.12, 0.3, T.ao)) * (T.nz < 0.25 ? 1 : nose ? 0.6 : 0.12);
    if (k <= 0) return;
    T.r = mix(T.r, 26, k); T.g = mix(T.g, 14, k); T.b = mix(T.b, 11, k);
    T.rough = mix(T.rough, 0.95, k);
  };
  // the source's normal map was baked against the stock ear's own vertex normals: on the moved, re-split and softened ear it printed
  // flat planes across the helix and the concha (fix round 1, "faceted ears"). The recipe keeps the ear's normals unsoftened, and the
  // map's relief goes in at half: the folds read, the planes do not
  const ears = (T) => {
    const ax = Math.abs(T.X);
    if (ax < 0.058 || T.Y < 1.575 || T.Y > 1.715 || T.Z < -0.08 || T.Z > 0.035) return;
    const k = smooth(0.058, 0.066, ax) * smooth(1.575, 1.59, T.Y) * (1 - smooth(1.70, 1.715, T.Y)) * smooth(-0.08, -0.07, T.Z) * (1 - smooth(0.022, 0.035, T.Z));
    T.nflat = Math.max(T.nflat, k * 0.5);
  };
  // fix round 2 (the judges: "large smooth planes on the cheek and forehead with little micro-form"): a skin's broad planes are never
  // quite flat: a slow undulation in the height (a centimetre across, a tenth of a millimetre deep), a matching drift in tone and a
  // finer one in the sheen, so a highlight breaks up along the cheek instead of sliding over a plastic plane
  const planes = (T) => {
    if (T.Y < 1.5 || Math.abs(T.X) > 0.1) return;
    const n1 = noise3(T.X * 70, T.Y * 70, T.Z * 70) - 0.5, n2 = noise3(T.X * 170 + 11, T.Y * 170, T.Z * 170) - 0.5;
    T.h += n1 * 0.00013 + n2 * 0.00005;
    T.r *= 1 + n1 * 0.05; T.g *= 1 + n1 * 0.042; T.b *= 1 + n1 * 0.035;
    T.rough += n2 * 0.08 - n1 * 0.03;
  };
  return [
    smoothSkin({ zone: notFeature }),
    inward,
    nostrils,
    ears,
    eyeSocketClean({ eyes }),
    // (fix round 2: moist lips, the lower one smoothest, so the sun finds its crest; the reference's lower lip carries a highlight)
    lipTone({ center: [0, L.upperLip[1] - 0.011, L.upperLip[2] - 0.006], r: [0.036, 0.024, 0.03], rough: 0.34 }),
    colourZones([
      // fix round 2 (the judges: "matte, no specular breakup; the reference's highlights on the cheekbone, nose bridge and lips are
      // missing"): the T-zone, the nose, the cheekbone's crest and the chin carry a real sheen (roughness about 0.34 to 0.42 against
      // 0.55 on the cheek's fall and the jaw), so a sun draws its highlight along the forms
      { at: [0, 1.70, 0.08], s: [0.05, 0.024, 0.05], gain: [1.03, 1.03, 0.98], rough: -0.17 },           // the forehead, warm and yellow, a soft sheen
      { at: [0, 1.695, 0.095], s: [0.016, 0.02, 0.03], gain: [1, 1, 1], rough: -0.06 },                    // the brow's centre, the T's top
      { at: cheek, s: [0.024, 0.02, 0.03], gain: [1.13, 1.05, 1.01], rough: -0.12 },                     // the cheek, red through, the bone catching light
      { at: [-cheek[0], cheek[1], cheek[2]], s: [0.024, 0.02, 0.03], gain: [1.13, 1.05, 1.01], rough: -0.12 },
      { at: [cheek[0] + 0.004, cheek[1] + 0.009, cheek[2] - 0.004], s: [0.016, 0.006, 0.02], gain: [1.03, 1.02, 1.0], rough: -0.1 },   // the cheekbone's crest
      { at: [-cheek[0] - 0.004, cheek[1] + 0.009, cheek[2] - 0.004], s: [0.016, 0.006, 0.02], gain: [1.03, 1.02, 1.0], rough: -0.1 },
      { at: noseT, s: [0.014, 0.02, 0.02], gain: [1.0, 1.01, 1.02], rough: -0.24 },                       // the nose, sun-reddened and oily
      { at: L.noseBridge, s: [0.012, 0.022, 0.02], gain: [1.02, 1.0, 0.98], rough: -0.2 },
      // (fix round 2: the muzzle is no longer cooler and greyer: in a low sun that grey read as stubble round the mouth)
      { at: [0, L.chin[1] + 0.024, L.chin[2]], s: [0.04, 0.02, 0.03], gain: [1.01, 0.99, 0.97] },
      { at: L.chin, s: [0.018, 0.012, 0.016], gain: [1.1, 1.03, 0.99], rough: -0.14 },
      { at: [0.074, 1.635, -0.03], s: [0.016, 0.03, 0.028], gain: [1.05, 0.96, 0.93] },                     // the ears
      { at: [-0.074, 1.635, -0.03], s: [0.016, 0.03, 0.028], gain: [1.05, 0.96, 0.93] },
      { at: [eyes[0][0], eyes[0][1] - 0.0145, eyes[0][2] + 0.008], s: [0.017, 0.0065, 0.02], gain: [0.93, 0.9, 0.91] },   // under the eyes
      { at: [eyes[1][0], eyes[1][1] - 0.0145, eyes[1][2] + 0.008], s: [0.017, 0.0065, 0.02], gain: [0.93, 0.9, 0.91] },
      { at: [0, 1.50, 0.03], s: [0.05, 0.03, 0.06], gain: [0.94, 0.93, 0.93] },                           // under the jaw
    ]),
    pores({ depth: 0.00009, poreFreq: 820, zone: (T) => (T.Y > 1.42 && Math.abs(T.X) < 0.2 ? 1 : Math.abs(T.X) > 0.4 ? 0.6 : 0.4) }),
    planes,
    // (fix round 2, the judges: "remove the mouth-corner and philtrum darkening from the crease and AO layers"): the baked AO's floor
    // is raised over the philtrum and round the mouth's corners, where it painted a grey moustache and two dark spots; the slit stays
    (T) => {
      if (Math.abs(T.X) > 0.04 || T.Y < L.upperLip[1] - 0.03 || T.Y > noseT[1] - 0.004 || T.nz < 0.3) return;
      const ph = (1 - smooth(0.006, 0.011, Math.abs(T.X))) * smooth(L.upperLip[1] + 0.0015, L.upperLip[1] + 0.004, T.Y) * (1 - smooth(noseT[1] - 0.016, noseT[1] - 0.01, T.Y));
      const cy = L.upperLip[1] - 0.0085;
      const cn = Math.max(...[1, -1].map((sx) => 1 - smooth(0.004, 0.009, Math.hypot(T.X - sx * 0.027, (T.Y - cy) * 1.2))));
      const k = Math.max(ph * 0.8, cn * 0.7);
      if (k > 0) T.ao = mix(T.ao, Math.max(T.ao, 0.78), k);
    },
    creases([
      // sun creases at the outer eye corners: she squints for a living
      ...[1, -1].flatMap((sx) => {
        const e = eyes[sx > 0 ? 0 : 1];
        const z = e[2] - 0.006;
        return [
          { pts: [[e[0] + sx * 0.0225, e[1] + 0.0025, z - 0.002], [e[0] + sx * 0.0305, e[1] + 0.0065, z - 0.012]], w: 0.0009, depth: 0.00016, dark: 0.13 },
          { pts: [[e[0] + sx * 0.0235, e[1] - 0.0005, z - 0.002], [e[0] + sx * 0.0325, e[1] + 0.0005, z - 0.014]], w: 0.001, depth: 0.00018, dark: 0.15 },
          { pts: [[e[0] + sx * 0.0225, e[1] - 0.004, z - 0.002], [e[0] + sx * 0.0305, e[1] - 0.0065, z - 0.012]], w: 0.0009, depth: 0.00016, dark: 0.12 },
        ];
      }),
      // the fold from the wing of the nose toward the mouth corner (fix round 2: it stops above the corner, soft: its old end printed a
      // dark spot beside the mouth that a low sun read as grime)
      ...[1, -1].map((sx) => ({ pts: [[sx * 0.0215, noseT[1] - 0.006, noseT[2] - 0.034], [sx * 0.0305, noseT[1] - 0.024, noseT[2] - 0.044]], w: 0.0026, depth: 0.0002, dark: 0.075 })),
      // fix round 2 (the judges: "add sub-lid micro-shading"): the soft fold where the lower lid meets the cheek, from the inner corner
      // down and out, and a faint line under it
      ...[1, -1].flatMap((sx) => {
        const e = eyes[sx > 0 ? 0 : 1], z = e[2] + 0.004;
        return [
          { pts: [[e[0] - sx * 0.0135, e[1] - 0.0055, z], [e[0] - sx * 0.002, e[1] - 0.0098, z + 0.001], [e[0] + sx * 0.012, e[1] - 0.0092, z - 0.004]], w: 0.0026, depth: 0.00012, dark: 0.06 },
          { pts: [[e[0] - sx * 0.008, e[1] - 0.0128, z], [e[0] + sx * 0.008, e[1] - 0.0142, z - 0.002]], w: 0.0018, depth: 0.00006, dark: 0.03 },
        ];
      }),
      // two soft lines across the neck
      { pts: [[-0.05, 1.525, 0.035], [0, 1.519, 0.062], [0.05, 1.525, 0.035]], w: 0.0022, depth: 0.00016, dark: 0.08 },
    ]),
  ];
}

/**
 * A human skin atlas (1024² base, 512² normal + ORM), composited from the stock layout, the baked
 * form (ray-cast AO against skin + `occluders` + collar) and the layers of lib/skin.mjs +
 * lib/hair.mjs, with the eye patch blitted in. `marks` are the character's own layers (a salt
 * line, a scar, a tattoo), painted last. `collar` = flat triangles of the outfit near the neck.
 */
export async function paintHumanSkin({ bodyPrim, skinMat, layout, eyeR, EYE_PX, L, eyes, brows, shellGrid, occluders, collar = [], opens, marks = [], scar = null, tone = '#8A5A3C', iris = '#3B2A20', amber = '#5E3A20', hairColor = '#15110F', hairShape: shape = hairShape, hairBand = null, temple = templeHair, names = 'human', fill = [0.15, 0.108, 0.09], sclera = [166, 148, 130], eyeSkin = [118, 80, 60] }) {
  const W = 1024, AOW = 512;
  const baseTex = skinMat.getBaseColorTexture(), nTex = skinMat.getNormalTexture(), rTex = skinMat.getMetallicRoughnessTexture();
  const stock = await decodeStockSkin(baseTex.getImage(), nTex.getImage(), rTex.getImage());
  // the AO: skin (head, neck, shoulders), wrap, collar
  const pan = collar;
  const soup = [];
  triSoup(bodyPrim, null, soup);
  const headOnly = soup.filter((_, i) => true);
  for (let i = 0; i < occluders.length; i++) headOnly.push(occluders[i]);
  for (let t = 0; t + 8 < pan.length; t += 9) if (pan[t + 1] > 1.3 && pan[t + 4] > 1.3 && pan[t + 7] > 1.3 && Math.abs(pan[t]) < 0.3) headOnly.push(pan[t], pan[t + 1], pan[t + 2], pan[t + 3], pan[t + 4], pan[t + 5], pan[t + 6], pan[t + 7], pan[t + 8]);
  const grid = new TriGrid(new Float32Array(headOnly), 0.012);
  const pmA = positionMap(bodyPrim, AOW, AOW);
  const valid = (i) => !Number.isNaN(pmA.pos[i * 3]);
  const headTexel = (i) => { const o = i * 3; return pmA.pos[o + 1] > 1.40 && Math.abs(pmA.pos[o]) < 0.26; };
  const rawAO = bakeAOTexels(pmA, grid, { rays: 48, maxD: 0.07, lift: 0.0014, want: headTexel });
  const ao = blurMasked(rawAO, AOW, AOW, valid, 3);
  // the convexity, broad
  const convMap = scalarMap(bodyPrim, convexity(bodyPrim), W, W, 0);
  // the coil field (the same drawing the cards use)
  const coilF = coilField(192, 192, { count: 340, seed: 21 });
  const sampler = coilSampler(coilF, 0.058);
  // the hair coverage, blurred: a texel array over the 1024 layout
  const pm = positionMap(bodyPrim, W, W);
  const headish = (i) => pm.pos[i * 3 + 1] > 1.52 && Math.abs(pm.pos[i * 3]) < 0.1;
  const validT = (i) => !Number.isNaN(pm.pos[i * 3]);
  const rawCov = hairCoverage(pm, shellGrid, { W, want: headish, maxD: 0.03 });
  const cov = blurMasked(rawCov, W, W, validT, 5);
  const cheek = [L.cheekL[0] - 0.004, L.cheekL[1] - 0.004, L.cheekL[2] + 0.004];
  const layers = [
    ...faceLayers({ L, eyes, cheek, mouthBag: new Set(layout.islands.filter((q) => q.min[1] > 1.56 && q.max[1] < 1.6).map((q) => q.id)) }),
    hairlineLayer({
      sampler, hair: hairColor,
      coverage: (T) => {
        if (T.Y < 1.52 || Math.abs(T.X) > 0.1) return 0;
        const c = Math.max(cov[T.y * W + T.x] * shape(T.X, T.Y, T.Z), temple ? temple(T.X, T.Y, T.Z) * earClear(T.X, T.Y, T.Z) : 0);
        return hairBand ? Math.max(c, hairBand(T.X, T.Y, T.Z)) : c;
      },
      flowUV: (T, uv) => { uv[0] = Math.atan2(T.X, -T.Z + 0.001) * 0.09; uv[1] = T.Y; },
    }),
    lidLines({ open: opens[0], side: 1 }),
    lidLines({ open: opens[1], side: -1 }),
    browLayer({ x0: brows[1].x0, x1: brows[1].x1, line: brows[1].line, side: 1, seed: 17, scar, hair: hairColor }),
    browLayer({ x0: brows[-1].x1, x1: brows[-1].x0, line: brows[-1].line, side: -1, seed: 19, hair: hairColor }),
    ...marks,
  ];
  const toneMaps = seamlessTone(bodyPrim, layout.islands, layout.islandOf, stock, W);
  // the tone actually painted at the mid-cheek: the zones, grain and form all moved it, so the
  // first pass measures it and the second lands on `tone`
  const cheekMean = (P) => {
    let acc = [0, 0, 0], n = 0;
    for (let i = 0; i < W * W; i++) {
      const o = i * 3;
      if (!P.filled[i] || Number.isNaN(pm.pos[o])) continue;
      if (Math.hypot(pm.pos[o] - cheek[0], pm.pos[o + 1] - cheek[1], pm.pos[o + 2] - cheek[2]) >= 0.014) continue;
      acc[0] += P.base[o]; acc[1] += P.base[o + 1]; acc[2] += P.base[o + 2]; n++;
    }
    return acc.map((v) => v / Math.max(1, n));
  };
  const args = { prim: bodyPrim, islands: layout.islands, stock, W, tone, toneAt: cheek, ao, aoW: AOW, conv: convMap, layers, pm, toneMaps };
  const first = await paintSkinAtlas(args);
  const want = [parseInt(tone.slice(1, 3), 16), parseInt(tone.slice(3, 5), 16), parseInt(tone.slice(5, 7), 16)];
  const m0 = cheekMean(first);
  const painted = await paintSkinAtlas({ ...args, toneK: want.map((t, k) => t / Math.max(1, m0[k])) });
  painted.stats.cheekPainted = '#' + cheekMean(painted).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  // the eye patch: one per eye (fix round 2), painted from that eye's own opening, or one shared patch as before
  const rects = Array.isArray(eyeR) ? eyeR : [eyeR];
  rects.forEach((rc, k) => {
    const eyeP = paintEye(EYE_PX, Array.isArray(eyeR)
      ? { span: EYE_SPAN, iris, amber, sclera, open: opens[k], centre: eyes[k], side: k ? -1 : 1, conv: k ? EYE_CONV : -EYE_CONV, skin: eyeSkin }
      : { span: EYE_SPAN, iris, amber });
    const ex = Math.round(rc.x * W), ey = Math.round(rc.y * W);
    blit(painted.base, W, eyeP.base, EYE_PX, EYE_PX, ex, ey);
    blit(painted.normal, W, eyeP.normal, EYE_PX, EYE_PX, ex, ey);
    blit(painted.orm, W, eyeP.orm, EYE_PX, EYE_PX, ex, ey);
  });
  baseTex.setImage(await webp(painted.base, W, { quality: 96 })).setMimeType('image/webp').setURI(`${names}-skin-base.webp`);
  nTex.setImage(await webp(painted.normal, W, { to: 512, quality: 96, kernel: 'lanczos3' })).setMimeType('image/webp').setURI(`${names}-skin-normal.webp`);
  rTex.setImage(await webp(painted.orm, W, { to: 512, quality: 90, kernel: 'mitchell' })).setMimeType('image/webp').setURI(`${names}-skin-orm.webp`);
  skinMat.setRoughnessFactor(1).setMetallicFactor(1).setDoubleSided(false);
  skinMat.setOcclusionTexture(rTex);
  skinMat.setOcclusionStrength(1);
  // the hero fill: light that went into the skin comes back out of it (no subsurface pass here), so the
  // shadow side keeps its form instead of going to a black mask. Same image, no new map, no new draw.
  // The runtime scales it with the scene's ambient (src/hero/index.js, R59 c), so it is gone at night
  skinMat.setEmissiveTexture(baseTex).setEmissiveFactor(fill);
  return { stats: painted.stats };
}

