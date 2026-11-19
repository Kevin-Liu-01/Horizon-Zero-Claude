import * as THREE from 'three';
import * as L from './ninewalls-layout.js';
import { bankOf } from './ninewalls-ground.js';

/**
 * NINEWALLS' KIT (M2 wave 2, area B; BUILD M2.2, BIBLE §4 "the Crescent Holds: drystone houses sunk in lapilli", §8.4
 * "~16 dwellings sunk into lapilli with pumice-and-lime roofs, behind nine concentric crescent walls; the dragon tree at
 * its centre; a lava-tube mouth as hall and forge"). Original work, built at run time from the walls' data
 * (./ninewalls-layout.js) on the ground as drawn (`ground(x, z)`: terrain.getHeight), so every wall, house and place
 * stands where the data says (NW3) and on the terraces the recipe baked (./ninewalls-ground.js).
 *
 * ONE MATERIAL, TWO DRAWS. Every piece is vertex-coloured on one MeshStandardMaterial whose fragment shader draws the
 * surface from three attributes: `aKind` (0 drystone, 1 pumice-and-lime render, 2 plain: timber, cloth, clay, voids,
 * 3 lava rock, 4 the dragon tree's bark, 5 its leaves, 6 still water), `aUV` (metres across the surface: along it and
 * up it) and `aPaint` (the Datum Line's flat vermilion ink over the stones). The drystone is drawn, not modelled:
 * wavy courses of basalt stones of their own length, each its own tone (black, grey, a rust one in six, a pale
 * vesicular one in seven), dark joints, a bulge and a bevel in the normal (screen-space derivative bump), lapilli dust
 * low down from the vertex colour. The walls are one mesh (rebuilt when a wall is cut or its line painted or
 * cleared); the houses, the tree and the places one more.
 *
 *   wallsGeometry(ground, stateOf)   the nine walls on their terraces: two battered faces, a coping, the end caps and,
 *                                    on each riser's low side, the drystone skin over the ledge and the bank
 *   townGeometry(ground, natural)    the dwellings, the tree, the tube mouth and its forge, the counter, the cistern,
 *                                    the Brazier's plinth, the niche's cache, the notice board, the road's kerb
 *   kitMaterial(env)                 the material (registered with the cascades and the fog)
 */

const D2R = Math.PI / 180;
const C = (hex) => new THREE.Color(hex);
/** Linear tints (vertex colour). Drystone and rock take their tone from the shader; the vertex colour is their dust. */
const PAL = {
  stone: C(0xffffff), dust: C(0xd9c9b3), lime: C(0xd8d1c2), limeDirty: C(0xb9b0a1), line: C(0xc8401e),
  wood: C(0x6b5138), woodDark: C(0x4a3728), void: C(0x0d0b0a), clay: C(0x9a5e3f), clayDark: C(0x7a4630), straw: C(0xb49a62),
  bark: C(0x8f877b), barkDark: C(0x6c665d), leaf: C(0x5f7d57), leafPale: C(0x7d9368), leafDry: C(0x8a7455), water: C(0x1f2a26),
  iron: C(0x34302d), bronze: C(0x8c6a3a), salt: C(0xe9e5da), paper: C(0xd9cfb6), carmine: C(0x8e2a35), rock: C(0xffffff), ember: C(0x3a1a0c),
};
export const KIT_PALETTE = PAL;
const hash = (a, b = 0, c = 0) => { const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return h - Math.floor(h); };

/** A triangle soup with the kit's attributes; flat normals unless a vertex brings its own. */
class Soup {
  constructor() { this.p = []; this.n = []; this.c = []; this.k = []; this.uv = []; this.pa = []; this.hasN = []; }
  tri(a, b, c, o) {
    const { col, kind = 0, uv = null, paint = 0, nrm = null } = o;
    const P = [a, b, c];
    for (let i = 0; i < 3; i++) {
      const v = P[i];
      this.p.push(v[0], v[1], v[2]);
      const cc = Array.isArray(col) ? col[i] : col;
      this.c.push(cc.r, cc.g, cc.b);
      this.k.push(kind);
      const u = uv ? uv[i] : [v[0] + v[2], v[1]];
      this.uv.push(u[0], u[1]);
      this.pa.push(Array.isArray(paint) ? paint[i] : paint);
      if (nrm) { const nn = nrm[i]; this.n.push(nn[0], nn[1], nn[2]); this.hasN.push(1); } else { this.n.push(0, 0, 0); this.hasN.push(0); }
    }
  }
  /** a quad a b c d (counter-clockwise seen from its front) */
  quad(a, b, c, d, o) {
    const uv = o.uv, nrm = o.nrm, col = o.col, pa = o.paint;
    const pick = (q, i) => (Array.isArray(q) && q.length === 4 ? [q[i[0]], q[i[1]], q[i[2]]] : q);
    this.tri(a, b, c, { ...o, uv: uv && [uv[0], uv[1], uv[2]], nrm: nrm && [nrm[0], nrm[1], nrm[2]], col: pick(col, [0, 1, 2]), paint: pick(pa, [0, 1, 2]) });
    this.tri(a, c, d, { ...o, uv: uv && [uv[0], uv[2], uv[3]], nrm: nrm && [nrm[0], nrm[2], nrm[3]], col: pick(col, [0, 2, 3]), paint: pick(pa, [0, 2, 3]) });
  }
  /** an oriented box: centre, half sizes, yaw (three's rotation.y), its faces' uv in metres */
  box(cx, cy, cz, hx, hy, hz, ry, o, { bottom = false, pitch = 0 } = {}) {
    const c = Math.cos(ry), s = Math.sin(ry), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const P = (x, y, z) => { const y2 = y * cp - z * sp, z2 = y * sp + z * cp; return [cx + c * x + s * z2, cy + y2, cz - s * x + c * z2]; };
    const v = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz), P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)];
    const W = 2 * hx, H = 2 * hy, D = 2 * hz;
    this.quad(v[4], v[5], v[6], v[7], { ...o, uv: [[0, 0], [W, 0], [W, H], [0, H]] });           // +z
    this.quad(v[1], v[0], v[3], v[2], { ...o, uv: [[0, 0], [W, 0], [W, H], [0, H]] });           // -z
    this.quad(v[5], v[1], v[2], v[6], { ...o, uv: [[0, 0], [D, 0], [D, H], [0, H]] });           // +x
    this.quad(v[0], v[4], v[7], v[3], { ...o, uv: [[0, 0], [D, 0], [D, H], [0, H]] });           // -x
    this.quad(v[7], v[6], v[2], v[3], { ...o, uv: [[0, 0], [W, 0], [W, D], [0, D]] });           // top
    if (bottom) this.quad(v[0], v[1], v[5], v[4], { ...o, uv: [[0, 0], [W, 0], [W, D], [0, D]] });
  }
  /** a tapered tube from a to b, radii ra rb, `n` sides; smooth normals; uv: around (m) and along (m) */
  tube(a, b, ra, rb, n, o) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]) || 1;
    const t = [d[0] / len, d[1] / len, d[2] / len];
    const up = Math.abs(t[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    let u = [t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]];
    const ul = Math.hypot(...u); u = u.map((q) => q / ul);
    const w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    const ring = (p, r, k) => { const ang = (k / n) * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang); const nn = [u[0] * cs + w[0] * sn, u[1] * cs + w[1] * sn, u[2] * cs + w[2] * sn]; return { v: [p[0] + nn[0] * r, p[1] + nn[1] * r, p[2] + nn[2] * r], n: nn }; };
    for (let k = 0; k < n; k++) {
      const A = ring(a, ra, k), B = ring(a, ra, k + 1), Cq = ring(b, rb, k + 1), Dq = ring(b, rb, k);
      const ua = (k / n) * Math.PI * 2 * ra, ub = ((k + 1) / n) * Math.PI * 2 * ra;
      this.quad(A.v, B.v, Cq.v, Dq.v, { ...o, nrm: [A.n, B.n, Cq.n, Dq.n], uv: [[ua, 0], [ub, 0], [ub, len], [ua, len]] });
    }
  }
  /** a lathe about +y at (cx, cy, cz): profile [[r, y], ...] bottom to top, `n` sides, outward faces */
  lathe(cx, cy, cz, prof, n, o, { inward = false, jitter = 0, seed = 0 } = {}) {
    const R = (i, k) => { const [r, y] = prof[i]; const a = (k / n) * Math.PI * 2, jr = jitter ? 1 + jitter * (hash(seed + i * 3.1, k % n) - 0.5) : 1; return [cx + Math.sin(a) * r * jr, cy + y, cz + Math.cos(a) * r * jr]; };
    for (let i = 0; i + 1 < prof.length; i++) for (let k = 0; k < n; k++) {
      const a = R(i, k), b = R(i, k + 1), c = R(i + 1, k + 1), d = R(i + 1, k);
      const u0 = (k / n) * Math.PI * 2 * prof[i][0], u1 = ((k + 1) / n) * Math.PI * 2 * prof[i][0];
      const uv = [[u0, prof[i][1]], [u1, prof[i][1]], [u1, prof[i + 1][1]], [u0, prof[i + 1][1]]];
      if (inward) this.quad(b, a, d, c, { ...o, uv: [uv[1], uv[0], uv[3], uv[2]] }); else this.quad(a, b, c, d, { ...o, uv });
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.k, 1));
    g.setAttribute('aUV', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aPaint', new THREE.Float32BufferAttribute(this.pa, 1));
    // flat normals where a vertex brought none
    const n = this.n.slice();
    for (let t = 0; t < this.p.length / 9; t++) {
      if (this.hasN[t * 3] && this.hasN[t * 3 + 1] && this.hasN[t * 3 + 2]) continue;
      const i = t * 9, ax = this.p[i], ay = this.p[i + 1], az = this.p[i + 2];
      const ux = this.p[i + 3] - ax, uy = this.p[i + 4] - ay, uz = this.p[i + 5] - az, vx = this.p[i + 6] - ax, vy = this.p[i + 7] - ay, vz = this.p[i + 8] - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 3; k++) if (!this.hasN[t * 3 + k]) { n[i + k * 3] = nx; n[i + k * 3 + 1] = ny; n[i + k * 3 + 2] = nz; }
    }
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
  get tris() { return this.p.length / 9; }
}

/* ------------------------------------------------------------------------------------------------ the walls */

/** The dust tint at height y over a terrace at `foot`: lapilli dust in the lowest courses, clean stone above. */
const dusty = (y, foot) => { const k = Math.max(0, Math.min(1, (y - foot) / 0.9)); return PAL.dust.clone().lerp(PAL.stone, 0.35 + 0.65 * k); };

/**
 * The nine walls. `stateOf(id)` -> { state: 'whole' | 'cut', painted }. A wall: stations every STEP m on its arc; at each,
 * its high terrace (under it) and its low one (L.wallSides); two faces battered in 6 cm from foot to coping, from the
 * ground at each face (less a sunk course) to the top (the high terrace plus its height, the coping's stones uneven by
 * a few centimetres; a cut wall broken unevenly down to its line); the Datum Line a band of ink on both faces where
 * painted; the coping a low ridge; on the riser's low side the skin of stones over the ledge and down the bank.
 */
export function wallsGeometry(ground, stateOf, { step = 1.0 } = {}) {
  const S = new Soup();
  for (const w of L.WALLS) {
    const st = L.stations(w, step), { state, painted } = stateOf(w.id), cut = state === 'cut';
    const top0 = L.topOf(w, state), seed = w.order * 17.3;
    const sides = st.map((s) => L.wallSides(w, ground, s));
    const arcLen = (b) => (b - w.from) * D2R * w.r;
    // per station: the coping's height (uneven stones; a cut wall broken down to its line, never under it)
    const tops = st.map((s, i) => {
      const j = hash(seed, i) - 0.5, k = hash(seed + 3.3, Math.floor(i / 3)) - 0.5;
      return sides[i].hi + top0 + (cut ? 0.06 + 0.22 * Math.abs(k) + 0.08 * j : 0.045 * j + 0.03 * k);
    });
    const lineLo = w.lineH - w.lineW / 2, lineHi = w.lineH + w.lineW / 2;
    const at = (s, side, off) => { const d = L.dirOf(s.b); return { x: s.x + d.x * side * off, z: s.z + d.z * side * off }; };
    for (let i = 0; i + 1 < st.length; i++) {
      const s0 = st[i], s1 = st[i + 1], q0 = sides[i], q1 = sides[i + 1];
      const u0 = arcLen(s0.b), u1 = arcLen(s1.b);
      for (const side of [1, -1]) {
        // the face's foot and top points (battered: 0.5 t + 0.04 at the foot, 0.5 t - 0.03 at the coping)
        const f0 = at(s0, side, w.t / 2 + 0.04), f1 = at(s1, side, w.t / 2 + 0.04), c0 = at(s0, side, w.t / 2 - 0.03), c1 = at(s1, side, w.t / 2 - 0.03);
        const g0 = ground(f0.x, f0.z) - 0.25, g1 = ground(f1.x, f1.z) - 0.25, t0 = tops[i], t1 = tops[i + 1];
        // rows: foot | line | top (line rows only where painted and under the top)
        const ys = [[g0, g1]];
        const lines = painted && !cut ? [lineLo, lineHi] : painted && cut ? [Math.min(lineLo, top0 - w.lineW)] : [];
        for (const lh of lines) ys.push([q0.hi + lh, q1.hi + lh]);
        ys.push([t0, t1]);
        for (let r = 0; r + 1 < ys.length; r++) {
          const ya0 = Math.max(g0, Math.min(t0, ys[r][0])), ya1 = Math.max(g1, Math.min(t1, ys[r][1]));
          const yb0 = Math.max(g0, Math.min(t0, ys[r + 1][0])), yb1 = Math.max(g1, Math.min(t1, ys[r + 1][1]));
          if (yb0 - ya0 < 1e-3 && yb1 - ya1 < 1e-3) continue;
          const lerpXZ = (f, c, y, ya, yb) => { const k = (y - ya) / Math.max(1e-3, (yb - ya)); return [f.x + (c.x - f.x) * k, y, f.z + (c.z - f.z) * k]; };
          const A = lerpXZ(f0, c0, ya0, g0, t0), B = lerpXZ(f1, c1, ya1, g1, t1), Cc = lerpXZ(f1, c1, yb1, g1, t1), Dd = lerpXZ(f0, c0, yb0, g0, t0);
          const ink = painted && r === 1 && ys.length > 2 ? 1 : 0;
          const col = ink ? PAL.line : [dusty(ya0, q0.hi), dusty(ya1, q1.hi), dusty(yb1, q1.hi), dusty(yb0, q0.hi)];
          const uv = [[u0, ya0 - q0.hi], [u1, ya1 - q1.hi], [u1, yb1 - q1.hi], [u0, yb0 - q0.hi]];
          if (side > 0) S.quad(B, A, Dd, Cc, { col: ink ? PAL.line : [col[1], col[0], col[3], col[2]], kind: 0, uv: [uv[1], uv[0], uv[3], uv[2]], paint: ink });
          else S.quad(A, B, Cc, Dd, { col, kind: 0, uv, paint: ink });
        }
      }
      // the coping: a low ridge from the outer edge to the inner, stones across
      const o0 = at(s0, 1, w.t / 2 - 0.03), o1 = at(s1, 1, w.t / 2 - 0.03), n0 = at(s0, -1, w.t / 2 - 0.03), n1 = at(s1, -1, w.t / 2 - 0.03);
      const m0 = [s0.x, tops[i] + 0.07, s0.z], m1 = [s1.x, tops[i + 1] + 0.07, s1.z];
      const ink = painted && cut ? 1 : 0;   // a cut wall's broken top is where its line was
      const cc = ink ? PAL.line : PAL.stone;
      S.quad([o1.x, tops[i + 1], o1.z], [o0.x, tops[i], o0.z], m0, m1, { col: cc, kind: 0, uv: [[u1, 0], [u0, 0], [u0, w.t / 2], [u1, w.t / 2]], paint: ink * 0.6 });
      S.quad([n0.x, tops[i], n0.z], [n1.x, tops[i + 1], n1.z], m1, m0, { col: cc, kind: 0, uv: [[u0, 0], [u1, 0], [u1, w.t / 2], [u0, w.t / 2]], paint: ink * 0.6 });
      // the skin on the riser's low side: from the face's foot over the ledge, down the bank, tucked into the low terrace
      const rise0 = q0.hi - q0.lo, rise1 = q1.hi - q1.lo;
      if (Math.max(rise0, rise1) > 0.12) {
        const sideLow = q0.lowInside ? -1 : 1;
        const reach = (rise) => L.TERRACE.ledge + (rise > 0.2 ? bankOf(rise) : 0.15);
        const dists0 = [0, L.TERRACE.ledge, L.TERRACE.ledge + 0.5 * (reach(rise0) - L.TERRACE.ledge), reach(rise0), reach(rise0) + 0.45];
        const dists1 = [0, L.TERRACE.ledge, L.TERRACE.ledge + 0.5 * (reach(rise1) - L.TERRACE.ledge), reach(rise1), reach(rise1) + 0.45];
        let prevA = null, prevB = null, vA = 0, vB = 0;
        for (let k = 0; k < dists0.length; k++) {
          const pa = at(s0, sideLow, w.t / 2 + 0.04 + dists0[k]), pb = at(s1, sideLow, w.t / 2 + 0.04 + dists1[k]);
          const lift = k === dists0.length - 1 ? -0.1 : 0.04;
          const A = [pa.x, ground(pa.x, pa.z) + lift, pa.z], B = [pb.x, ground(pb.x, pb.z) + lift, pb.z];
          if (prevA) {
            vA += Math.hypot(A[0] - prevA[0], A[1] - prevA[1], A[2] - prevA[2]); vB += Math.hypot(B[0] - prevB[0], B[1] - prevB[1], B[2] - prevB[2]);
            const uv = [[u0, -vA + 0.0], [u1, -vB], [u1, -(vB - Math.hypot(B[0] - prevB[0], B[1] - prevB[1], B[2] - prevB[2]))], [u0, -(vA - Math.hypot(A[0] - prevA[0], A[1] - prevA[1], A[2] - prevA[2]))]];
            const col = [dusty(A[1], q0.lo), dusty(B[1], q1.lo), dusty(prevB[1], q1.lo), dusty(prevA[1], q0.lo)];
            // faces up and out: wound so its front is the bank's outer side
            if (sideLow < 0) S.quad(A, B, prevB, prevA, { col, kind: 0, uv });
            else S.quad(B, A, prevA, prevB, { col: [col[1], col[0], col[3], col[2]], kind: 0, uv: [uv[1], uv[0], uv[3], uv[2]] });
          }
          prevA = A; prevB = B;
        }
      }
    }
    // the two end caps
    for (const [k, sg] of [[0, -1], [st.length - 1, 1]]) {
      const s = st[k], o = at(s, 1, w.t / 2 + 0.04), n = at(s, -1, w.t / 2 + 0.04), oc = at(s, 1, w.t / 2 - 0.03), nc = at(s, -1, w.t / 2 - 0.03);
      const go = ground(o.x, o.z) - 0.25, gn = ground(n.x, n.z) - 0.25, t = tops[k];
      const A = [o.x, go, o.z], B = [n.x, gn, n.z], Cc = [nc.x, t, nc.z], Dd = [oc.x, t, oc.z];
      const uv = [[0, go - sides[k].hi], [w.t, gn - sides[k].hi], [w.t, t - sides[k].hi], [0, t - sides[k].hi]];
      if (sg < 0) S.quad(A, B, Cc, Dd, { col: PAL.stone, kind: 0, uv }); else S.quad(B, A, Dd, Cc, { col: PAL.stone, kind: 0, uv: [uv[1], uv[0], uv[3], uv[2]] });
    }
  }
  return S;
}

/* ------------------------------------------------------------------------------------------------ the dwellings */

/** A house: drystone walls from below the pad to the roof's foot, the door (a deep dark reveal, a timber lintel, a plank
 * door or none) toward the tree, a window on one side, a pumice-and-lime roof slab domed a little, and its yard things. */
function dwelling(S, d, ground) {
  const p = L.dwellingPlace(d), g = ground(p.x, p.z), seed = d.r * 7.7 + d.b;
  const c = Math.cos(p.ry), s = Math.sin(p.ry);
  const W = (lx, y, lz) => [p.x + c * lx + s * lz, y, p.z - s * lx + c * lz];
  const hw = d.w / 2, hd = d.d / 2, roofT = 0.2, wallTop = g + d.h - roofT;
  // sunk into the hillside: its foundation 0.35 m under the lowest ground at its walls, its roof at the centre's ground plus h
  let gLow = g;
  for (let k = 0; k <= 8; k++) for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const q = W(sx * hw * (k / 8), 0, sz * hd); gLow = Math.min(gLow, ground(q[0], q[2])); const r2 = W(sx * hw, 0, sz * hd * (k / 8)); gLow = Math.min(gLow, ground(r2[0], r2[2])); }
  const foot = gLow - 0.35;
  const doorX = (hash(seed) - 0.5) * (d.w - 2.2), doorW = 0.92, inset = 0.42;
  // the door's sill at the ground in front of it; the house's floor and the door's head go with it
  const dq = W(doorX, 0, hd + 0.3), gDoor = Math.min(wallTop - 1.45, ground(dq[0], dq[2]));
  const doorTop = gDoor + 1.25;
  const batter = 0.05;
  // the walls, battered in toward the roof: each face from foot to the wall's top; the front around its door
  const corner = (sx, sz, y) => { const k = (y - foot) / (wallTop - foot); return W(sx * (hw - batter * k), y, sz * (hd - batter * k)); };
  const face = (a0, a1, sz, sx0, sx1, y0, y1, uOff = 0) => {
    // a strip of the front (+z) or back (-z) face from local x a0 to a1, height y0..y1
    const k0 = (y0 - foot) / (wallTop - foot), k1 = (y1 - foot) / (wallTop - foot);
    const P = (lx, y, k) => W(lx * (1 - batter * k / hw), y, sz * (hd - batter * k));
    const A = P(a0, y0, k0), B = P(a1, y0, k0), Cc = P(a1, y1, k1), Dd = P(a0, y1, k1);
    const uv = [[a0 + uOff, y0 - g], [a1 + uOff, y0 - g], [a1 + uOff, y1 - g], [a0 + uOff, y1 - g]];
    const col = [dusty(y0, g), dusty(y0, g), dusty(y1, g), dusty(y1, g)];
    if (sz > 0) S.quad(A, B, Cc, Dd, { col, kind: 0, uv }); else S.quad(B, A, Dd, Cc, { col, kind: 0, uv: [uv[1], uv[0], uv[3], uv[2]] });
  };
  // front (+z): left of the door, right of it, over it
  face(-hw, doorX - doorW / 2, 1, 0, 0, foot, wallTop);
  face(doorX + doorW / 2, hw, 1, 0, 0, foot, wallTop);
  face(doorX - doorW / 2, doorX + doorW / 2, 1, 0, 0, doorTop + 0.18, wallTop);
  face(-hw, hw, -1, 0, 0, foot, wallTop);
  // the two sides (+x, -x), a window in one of them
  const winSide = hash(seed, 2) > 0.5 ? 1 : -1, winZ = (hash(seed, 3) - 0.5) * (d.d - 1.6), winY0 = g + 0.55, winY1 = g + 0.95, winW = 0.42;
  for (const sx of [1, -1]) {
    const P = (lz, y) => { const k = (y - foot) / (wallTop - foot); return W(sx * (hw - batter * k), y, lz * (1 - batter * k / hd)); };
    const strip = (z0, z1, y0, y1) => {
      const A = P(z0, y0), B = P(z1, y0), Cc = P(z1, y1), Dd = P(z0, y1);
      const uv = [[z0 + 9, y0 - g], [z1 + 9, y0 - g], [z1 + 9, y1 - g], [z0 + 9, y1 - g]], col = [dusty(y0, g), dusty(y0, g), dusty(y1, g), dusty(y1, g)];
      if (sx > 0) S.quad(B, A, Dd, Cc, { col: [col[1], col[0], col[3], col[2]], kind: 0, uv: [uv[1], uv[0], uv[3], uv[2]] }); else S.quad(A, B, Cc, Dd, { col, kind: 0, uv });
    };
    if (sx === winSide && d.d > 4.4 && wallTop - winY1 > 0.2) {
      strip(-hd, winZ - winW / 2, foot, wallTop); strip(winZ + winW / 2, hd, foot, wallTop);
      strip(winZ - winW / 2, winZ + winW / 2, foot, winY0); strip(winZ - winW / 2, winZ + winW / 2, winY1, wallTop);
      // its dark reveal and a timber sill
      const q = (lz, y, k) => W(sx * (hw - batter * 0.3 - k), y, lz);
      const r0 = q(winZ - winW / 2, winY0, 0.3), r1 = q(winZ + winW / 2, winY0, 0.3), r2 = q(winZ + winW / 2, winY1, 0.3), r3 = q(winZ - winW / 2, winY1, 0.3);
      if (sx > 0) S.quad(r1, r0, r3, r2, { col: PAL.void, kind: 2 }); else S.quad(r0, r1, r2, r3, { col: PAL.void, kind: 2 });
      const sl = W(sx * (hw + 0.02), winY0 - 0.04, winZ);
      S.box(sl[0], sl[1], sl[2], 0.08, 0.035, winW / 2 + 0.08, p.ry, { col: PAL.wood, kind: 2 });
    } else strip(-hd, hd, foot, wallTop);
  }
  // the door's reveal: two jambs and a head into the wall's thickness, a dark back (the sunk room); steps down
  {
    const z0 = hd - batter * 0.3, z1 = z0 - inset;
    const jl = (lx, y, lz) => W(lx, y, lz);
    const y0 = gDoor - 0.3, y1 = doorTop;
    for (const sx of [-1, 1]) {
      const x = doorX + sx * doorW / 2;
      const A = jl(x, y0, z0), B = jl(x, y0, z1), Cc = jl(x, y1, z1), Dd = jl(x, y1, z0);
      if (sx < 0) S.quad(A, B, Cc, Dd, { col: PAL.stone, kind: 0, uv: [[0, 0], [inset, 0], [inset, y1 - y0], [0, y1 - y0]] });
      else S.quad(B, A, Dd, Cc, { col: PAL.stone, kind: 0, uv: [[inset, 0], [0, 0], [0, y1 - y0], [inset, y1 - y0]] });
    }
    S.quad(jl(doorX - doorW / 2, y1, z0), jl(doorX - doorW / 2, y1, z1), jl(doorX + doorW / 2, y1, z1), jl(doorX + doorW / 2, y1, z0), { col: PAL.void, kind: 2 });
    // the back: a plank door on two houses in three, else the dark of the room
    const open = hash(seed, 5) < 0.34;
    S.quad(jl(doorX - doorW / 2, gDoor - 1.1, z1), jl(doorX + doorW / 2, gDoor - 1.1, z1), jl(doorX + doorW / 2, y1, z1), jl(doorX - doorW / 2, y1, z1),
      { col: open ? PAL.void : PAL.woodDark, kind: 2, uv: [[0, 0], [doorW, 0], [doorW, y1 - gDoor + 1.1], [0, y1 - gDoor + 1.1]] });
    // the step down to the sunk floor: two dark treads in the reveal
    for (let k = 0; k < 2; k++) {
      const y = gDoor - 0.3 - k * 0.32, zz = z0 - 0.06 - k * 0.16;
      S.quad(jl(doorX - doorW / 2, y, zz), jl(doorX + doorW / 2, y, zz), jl(doorX + doorW / 2, y, zz - 0.18), jl(doorX - doorW / 2, y, zz - 0.18), { col: PAL.barkDark, kind: 2 });
    }
    // the lintel: a timber beam, proud of the wall
    const lc = W(doorX, doorTop + 0.09, hd + 0.02);
    S.box(lc[0], lc[1], lc[2], doorW / 2 + 0.28, 0.09, 0.16, p.ry, { col: PAL.wood, kind: 2 });
  }
  // the roof: a pumice-and-lime slab, its edge a rounded lip proud of the walls, its top domed 12-18 cm
  {
    const ov = 0.1, rx = hw + ov - batter, rz = hd + ov - batter, nx = 6, nz = 5, dome = 0.12 + 0.06 * hash(seed, 7);
    const y = (i, k) => wallTop + roofT + dome * (1 - ((2 * i / nx - 1) ** 2)) * (1 - ((2 * k / nz - 1) ** 2)) - 0.015 * hash(seed + i, k);
    const P = (i, k) => W(-rx + 2 * rx * i / nx, y(i, k), -rz + 2 * rz * k / nz);
    const lime = (i, k) => PAL.lime.clone().lerp(PAL.limeDirty, 0.25 * hash(seed + i * 1.3, k * 2.1));
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const A = P(i, k + 1), B = P(i + 1, k + 1), Cc = P(i + 1, k), Dd = P(i, k);
      S.quad(A, B, Cc, Dd, { col: [lime(i, k + 1), lime(i + 1, k + 1), lime(i + 1, k), lime(i, k)], kind: 1 });
    }
    // the lip: the slab's four edges down to under the wall's top
    const edge = (i0, k0, i1, k1) => { const A = P(i0, k0), B = P(i1, k1); const a2 = [A[0], wallTop - 0.04, A[2]], b2 = [B[0], wallTop - 0.04, B[2]]; S.quad(a2, b2, B, A, { col: PAL.limeDirty, kind: 1 }); };
    for (let i = 0; i < nx; i++) { edge(i, nz, i + 1, nz); edge(i + 1, 0, i, 0); }
    for (let k = 0; k < nz; k++) { edge(nx, nz - k, nx, nz - k - 1); edge(0, k, 0, k + 1); }
    // a lime-rendered vent on one house in three
    if (hash(seed, 8) < 0.34) { const v = W((hash(seed, 9) - 0.5) * hw, wallTop + roofT + dome, -hd * 0.4); S.lathe(v[0], v[1] - 0.05, v[2], [[0.2, 0], [0.18, 0.3], [0.13, 0.42], [0.0, 0.46]], 8, { col: PAL.lime, kind: 1 }); }
  }
  // the yard: a water jar by the door, on some a woven palm shade or a stone bench, a stack of vine prunings
  {
    const jar = W(doorX + (doorW / 2 + 0.45) * (hash(seed, 10) > 0.5 ? 1 : -1), 0, hd + 0.38);
    S.lathe(jar[0], ground(jar[0], jar[2]) - 0.02, jar[2], [[0.1, 0], [0.2, 0.12], [0.23, 0.3], [0.17, 0.48], [0.09, 0.56], [0.1, 0.62], [0.0, 0.62]], 10, { col: PAL.clay, kind: 2 });
    if (hash(seed, 11) < 0.4) {
      const lx = doorX + (hash(seed, 12) > 0.5 ? 1.4 : -1.4);
      for (const sx of [-0.8, 0.8]) { const q = W(lx + sx, 0, hd + 1.5), gq = ground(q[0], q[2]); S.tube([q[0], gq - 0.1, q[2]], [q[0], gDoor + 1.9, q[2]], 0.045, 0.04, 5, { col: PAL.woodDark, kind: 2 }); }
      const a = W(lx - 1.0, gDoor + 1.95, hd + 1.6), b = W(lx + 1.0, gDoor + 1.95, hd + 1.6), cc = W(lx + 1.0, wallTop + 0.05, hd - 0.05), dd = W(lx - 1.0, wallTop + 0.05, hd - 0.05);
      S.quad(a, b, cc, dd, { col: PAL.straw, kind: 2 });
    } else if (hash(seed, 13) < 0.5) {
      const q0 = W(doorX + (hash(seed, 14) > 0.5 ? 1.6 : -1.6), 0, hd + 0.4), gb = ground(q0[0], q0[2]), q = [q0[0], gb + 0.22, q0[2]];
      S.box(q[0], q[1], q[2], 0.7, 0.05, 0.2, p.ry, { col: PAL.stone, kind: 0 });
      for (const sx of [-0.55, 0.55]) { const r = W(doorX + (hash(seed, 14) > 0.5 ? 1.6 : -1.6) + sx, gb + 0.09, hd + 0.4); S.box(r[0], r[1], r[2], 0.12, 0.11, 0.17, p.ry, { col: PAL.stone, kind: 0 }); }
    }
    if (hash(seed, 15) < 0.5) {
      const q = W(-hw + 0.5, 0, -hd - 0.35), gp = ground(q[0], q[2]);
      for (let k = 0; k < 7; k++) { const a = hash(seed, 20 + k) * 0.5 - 0.25; S.tube([q[0] + k * 0.11 * c, gp + 0.06 + (k % 3) * 0.09, q[2] - k * 0.11 * s], [q[0] + k * 0.11 * c + Math.cos(p.ry + Math.PI / 2 + a) * 1.1, gp + 0.06 + (k % 3) * 0.09, q[2] - k * 0.11 * s - Math.sin(p.ry + Math.PI / 2 + a) * 1.1], 0.025, 0.02, 4, { col: PAL.woodDark, kind: 2 }); }
    }
  }
}

/* ------------------------------------------------------------------------------------------------ the dragon tree */

/** The one dragon tree: a fluted trunk splayed at the foot, forking three times into an umbrella of sword-leaf rosettes
 * with a skirt of dry leaves under each; top at PLACES.tree.top (bible: canopy under 9 m), spread canopyR. */
function dragonTree(S, ground) {
  const T = L.PLACES.tree, g = ground(T.x, T.z);
  const prof = [[0.86, -0.3], [0.78, 0], [0.62, 0.35], [0.53, 1.0], [0.5, 2.0], [0.47, 3.0], [0.48, 3.9], [0.52, T.crown - 0.25], [0.42, T.crown]];
  S.lathe(T.x, g, T.z, prof, 14, { col: PAL.bark, kind: 4 }, { jitter: 0.07, seed: 3 });
  const tips = [];
  const fork = (a, dir, len, r, depth, sd) => {
    const b = [a[0] + dir[0] * len, a[1] + dir[1] * len, a[2] + dir[2] * len];
    S.tube(a, b, r, r * 0.8, 8, { col: depth === 0 ? PAL.bark : PAL.barkDark.clone().lerp(PAL.bark, 0.5), kind: 4 });
    if (depth >= 2) { tips.push({ p: b, dir }); return; }
    const n = depth === 0 ? 2 : 2 + (hash(sd, depth) > 0.6 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const yaw = Math.atan2(dir[0], dir[2]) + ((k + 0.5) / n - 0.5) * 1.5 + (hash(sd, k) - 0.5) * 0.3;
      const out = Math.hypot(dir[0], dir[2]), up = 0.55 + 0.2 * hash(sd + 1, k);
      const d2 = [Math.sin(yaw) * Math.max(0.55, out), up, Math.cos(yaw) * Math.max(0.55, out)], l = Math.hypot(...d2);
      fork(b, d2.map((q) => q / l), len * 0.72, r * 0.72, depth + 1, sd * 1.7 + k + 1);
    }
  };
  const base = [T.x, g + T.crown - 0.05, T.z];
  for (let k = 0; k < 5; k++) {
    const yaw = (k / 5) * Math.PI * 2 + 0.4, up = 0.62;
    const d = [Math.sin(yaw) * 0.78, up, Math.cos(yaw) * 0.78], l = Math.hypot(...d);
    fork(base, d.map((q) => q / l), 1.15, 0.27, 0, k * 3.7 + 1);
  }
  // the rosettes: sword leaves fanned up and out from each tip, the old ones hanging dry under them
  for (let t = 0; t < tips.length; t++) {
    const { p } = tips[t];
    const N = 34;
    for (let k = 0; k < N; k++) {
      const yaw = (k / N) * Math.PI * 2 + hash(t, k) * 0.4, rise = 0.25 + 0.95 * hash(t + 7, k), len = 0.55 + 0.25 * hash(t + 3, k);
      const dx = Math.sin(yaw) * Math.cos(rise), dz = Math.cos(yaw) * Math.cos(rise), dy = Math.sin(rise);
      const m = [p[0] + dx * len * 0.55, p[1] + dy * len * 0.55 + 0.03, p[2] + dz * len * 0.55];
      const e = [p[0] + dx * len, p[1] + dy * len - 0.06 * (1 - dy), p[2] + dz * len];
      const sw = [Math.cos(yaw) * 0.035, 0, -Math.sin(yaw) * 0.035];
      const col = hash(t, k + 50) > 0.6 ? PAL.leafPale : PAL.leaf;
      const a1 = [p[0] - sw[0], p[1], p[2] - sw[2]], a2 = [p[0] + sw[0], p[1], p[2] + sw[2]], m1 = [m[0] - sw[0], m[1], m[2] - sw[2]], m2 = [m[0] + sw[0], m[1], m[2] + sw[2]];
      const o = { col, kind: 5 };
      S.quad(a1, a2, m2, m1, { ...o, uv: [[0, 0], [0.07, 0], [0.07, 0.3], [0, 0.3]] });
      S.tri(m1, m2, e, { ...o, uv: [[0, 0.3], [0.07, 0.3], [0.035, 0.6]] });
    }
    for (let k = 0; k < 10; k++) {
      const yaw = (k / 10) * Math.PI * 2 + hash(t + 2, k), len = 0.5 + 0.2 * hash(t, k + 9);
      const dx = Math.sin(yaw) * 0.35, dz = Math.cos(yaw) * 0.35;
      const a = [p[0], p[1] - 0.05, p[2]], e = [p[0] + dx * len, p[1] - len * 0.92, p[2] + dz * len];
      const sw = [Math.cos(yaw) * 0.03, 0, -Math.sin(yaw) * 0.03];
      const A = [a[0] - sw[0], a[1], a[2] - sw[2]], B = [a[0] + sw[0], a[1], a[2] + sw[2]];
      S.tri(A, B, e, { col: PAL.leafDry, kind: 5, uv: [[0, 0], [0.06, 0], [0.03, 0.5]] });
    }
  }
  return tips.length;
}

/* ------------------------------------------------------------------------------------------------ the places */

/** The lava-tube mouth (hall and forge): a rough basalt arch set into the slope, the tube's dark throat behind it, and
 * the smithy before it: a hearth of stones, an anvil on a log, a quench trough. */
function tubeMouth(S, ground) {
  const M = L.PLACES.tubeMouth, g = ground(M.x, M.z);
  const tg = L.tangentOf(M.b), out = L.dirOf(M.b);       // along the face; away from the centre (into the hill)
  const W = (u, y, v) => [M.x + tg.x * u + out.x * v, g + y, M.z + tg.z * u + out.z * v];
  const hw = M.w / 2, h = M.h;
  // the arch: rings of jittered rock from one foot over the top to the other, 1.1-1.5 m thick, 2.4 m deep
  const N = 16, depth = 2.4;
  const archAt = (k, rr, v) => { const a = Math.PI * (k / N); const jr = 1 + 0.12 * (hash(k, rr * 3.3, v) - 0.5); return W(-Math.cos(a) * (hw + rr) * jr, Math.sin(a) * (h - 0.3 + rr * 0.8) * jr + (k === 0 || k === N ? -0.4 : 0), v); };
  for (let k = 0; k < N; k++) {
    for (const [r0, r1] of [[0, 0.7], [0.7, 1.5]]) {
      // the front face of the ring
      const A = archAt(k, r0, -0.2), B = archAt(k + 1, r0, -0.2), Cc = archAt(k + 1, r1, -0.1), Dd = archAt(k, r1, -0.1);
      S.quad(B, A, Dd, Cc, { col: PAL.rock, kind: 3 });
    }
    // the intrados (the arch's underside) into the hill
    const A = archAt(k, 0, -0.2), B = archAt(k + 1, 0, -0.2), Cc = archAt(k + 1, 0, depth), Dd = archAt(k, 0, depth);
    S.quad(A, B, Cc, Dd, { col: PAL.rock, kind: 3 });
    // the outer back of the rock, buried into the slope
    const E = archAt(k, 1.5, -0.1), F = archAt(k + 1, 1.5, -0.1), G2 = archAt(k + 1, 1.7, depth), H2 = archAt(k, 1.7, depth);
    S.quad(E, F, G2, H2, { col: PAL.rock, kind: 3 });
  }
  // the throat: a dark tube going on into the hill, a floor of trodden ash, and the black at its end
  const throat = (k, v) => { const a = Math.PI * (k / N); return W(-Math.cos(a) * hw * 0.96, Math.sin(a) * (h - 0.35), v); };
  for (let k = 0; k < N; k++) {
    const A = throat(k, depth), B = throat(k + 1, depth), Cc = throat(k + 1, depth + 6), Dd = throat(k, depth + 6);
    S.quad(A, B, Cc, Dd, { col: PAL.void.clone().lerp(PAL.rock, 0.06), kind: 2 });
  }
  S.quad(W(-hw, -0.05, -0.2), W(hw, -0.05, -0.2), W(hw, -0.05, depth + 6), W(-hw, -0.05, depth + 6), { col: PAL.barkDark.clone().multiplyScalar(0.5), kind: 2 });
  S.quad(W(-hw, -0.1, depth + 6), W(hw, -0.1, depth + 6), W(hw, h, depth + 6), W(-hw, h, depth + 6), { col: PAL.void, kind: 2 });
  // the forge's hearth just inside the mouth, its coals a dull red-brown (no glow: daylight), the bellows' leather
  const hc = W(-hw * 0.45, 0.35, 1.2);
  S.lathe(hc[0], g - 0.05, hc[2], [[0.75, 0], [0.78, 0.5], [0.62, 0.62], [0.0, 0.6]], 10, { col: PAL.stone, kind: 0 }, { jitter: 0.12, seed: 9 });
  S.lathe(hc[0], g + 0.58, hc[2], [[0.55, 0], [0.0, 0.08]], 10, { col: PAL.ember, kind: 3 });
  // the anvil on its log, and the trough
  const an = W(hw * 0.2, 0, -2.2);
  S.lathe(an[0], g - 0.05, an[2], [[0.32, 0], [0.3, 0.62], [0.0, 0.64]], 9, { col: PAL.woodDark, kind: 4 });
  S.box(an[0], g + 0.72, an[2], 0.12, 0.08, 0.28, Math.atan2(out.x, out.z), { col: PAL.iron, kind: 2 });
  S.box(an[0], g + 0.84, an[2], 0.16, 0.04, 0.36, Math.atan2(out.x, out.z), { col: PAL.iron, kind: 2 });
  const tr = W(hw + 0.9, 0, -1.4);
  S.box(tr[0], g + 0.25, tr[2], 0.75, 0.25, 0.38, Math.atan2(out.x, out.z) + Math.PI / 2, { col: PAL.stone, kind: 0 });
  S.box(tr[0], g + 0.47, tr[2], 0.62, 0.02, 0.27, Math.atan2(out.x, out.z) + Math.PI / 2, { col: PAL.water, kind: 6 });
  // bronze bars stacked by the hearth (cast from salvage)
  for (let k = 0; k < 5; k++) { const q = W(-hw + 0.7 + (k % 3) * 0.24, 0.06 + Math.floor(k / 3) * 0.09, -0.8); S.box(q[0], q[1], q[2], 0.1, 0.04, 0.3, Math.atan2(out.x, out.z), { col: PAL.bronze, kind: 2 }); }
}

/** The counter at the tube's mouth: a drystone base, a timber top, a palm-mat awning on poles, jars and a salt sack. */
function counter(S, ground) {
  const K = L.PLACES.counter, g = ground(K.x, K.z), ry = -K.b * D2R;
  S.box(K.x, g + (K.h - 0.08) / 2 - 0.1, K.z, K.w / 2, (K.h - 0.08) / 2 + 0.1, K.d / 2, ry, { col: PAL.stone, kind: 0 });
  S.box(K.x, g + K.h - 0.04, K.z, K.w / 2 + 0.1, 0.05, K.d / 2 + 0.08, ry, { col: PAL.wood, kind: 2 });
  const c = Math.cos(ry), s = Math.sin(ry), W = (lx, y, lz) => [K.x + c * lx + s * lz, g + y, K.z - s * lx + c * lz];
  for (const lx of [-K.w / 2 - 0.1, K.w / 2 + 0.1]) for (const lz of [-0.9, 0.9]) { const q = W(lx, 0, lz); S.tube([q[0], g - 0.1, q[2]], [q[0], g + (lz > 0 ? 2.05 : 2.35), q[2]], 0.05, 0.045, 5, { col: PAL.woodDark, kind: 2 }); }
  const a = W(-K.w / 2 - 0.3, 2.1, 1.0), b = W(K.w / 2 + 0.3, 2.1, 1.0), cc = W(K.w / 2 + 0.3, 2.4, -1.0), dd = W(-K.w / 2 - 0.3, 2.4, -1.0);
  S.quad(a, b, cc, dd, { col: PAL.straw, kind: 2 });
  for (let k = 0; k < 3; k++) { const q = W(-K.w / 2 + 0.4 + k * 0.5, K.h, 0); S.lathe(q[0], q[1], q[2], [[0.06, 0], [0.12, 0.1], [0.1, 0.22], [0.05, 0.27], [0.0, 0.27]], 8, { col: k === 1 ? PAL.clayDark : PAL.clay, kind: 2 }); }
  const sk = W(K.w / 2 + 0.55, 0, 0.5);
  S.lathe(sk[0], g - 0.02, sk[2], [[0.2, 0], [0.26, 0.2], [0.22, 0.48], [0.1, 0.58], [0.0, 0.6]], 8, { col: PAL.salt, kind: 2 });
}

/** The cistern: a drystone kerb with a lime-rendered rim, dark water inside, a timber frame with its bucket. */
function cistern(S, ground) {
  const Cq = L.PLACES.cistern, g = ground(Cq.x, Cq.z), r = Cq.r;
  S.lathe(Cq.x, g - 0.3, Cq.z, [[r + 0.05, 0], [r, Cq.h + 0.3]], 20, { col: PAL.stone, kind: 0 });
  S.lathe(Cq.x, g + Cq.h, Cq.z, [[r + 0.04, 0], [r + 0.02, 0.07], [r - 0.32, 0.08], [r - 0.34, 0]], 20, { col: PAL.lime, kind: 1 });
  S.lathe(Cq.x, g - 0.45, Cq.z, [[r - 0.34, 0], [r - 0.34, Cq.h + 0.45]], 20, { col: PAL.stone, kind: 0 }, { inward: true });
  S.lathe(Cq.x, g - 0.25, Cq.z, [[r - 0.34, 0], [0.0, 0]], 20, { col: PAL.water, kind: 6 }, { inward: true });
  // the frame: two posts, a beam, a rope and a bucket of hide
  const ex = Math.cos(0.6), ez = Math.sin(0.6);
  const p1 = [Cq.x + ex * (r + 0.1), g, Cq.z + ez * (r + 0.1)], p2 = [Cq.x - ex * (r + 0.1), g, Cq.z - ez * (r + 0.1)];
  for (const q of [p1, p2]) S.tube([q[0], g - 0.2, q[2]], [q[0], g + 2.0, q[2]], 0.06, 0.05, 6, { col: PAL.woodDark, kind: 2 });
  S.tube([p1[0], g + 1.95, p1[2]], [p2[0], g + 1.95, p2[2]], 0.05, 0.05, 6, { col: PAL.wood, kind: 2 });
  S.tube([Cq.x, g + 1.95, Cq.z], [Cq.x, g + 0.95, Cq.z], 0.008, 0.008, 3, { col: PAL.straw, kind: 2 });
  S.lathe(Cq.x, g + 0.62, Cq.z, [[0.11, 0], [0.15, 0.3], [0.0, 0.31]], 8, { col: PAL.woodDark, kind: 2 });
}

/** The niche in the third wall's inner face, the salt cache in it: a dark recess under a lintel stone, a lidded jar. */
function niche(S, ground) {
  const N = L.PLACES.niche, w = L.wallById(N.wall), g = ground(N.x, N.z);
  const tg = L.tangentOf(N.b), inw = L.dirOf(N.b + 180);
  const face = { x: L.CENTRE.x + Math.sin(N.b * D2R) * (w.r - w.t / 2 - 0.02), z: L.CENTRE.z - Math.cos(N.b * D2R) * (w.r - w.t / 2 - 0.02) };
  const gw = ground(face.x, face.z);
  const W = (u, y, v) => [face.x + tg.x * u + inw.x * v, gw + y, face.z + tg.z * u + inw.z * v];
  S.quad(W(N.w / 2, N.sill, 0.0), W(-N.w / 2, N.sill, 0.0), W(-N.w / 2, N.sill + N.h, 0.0), W(N.w / 2, N.sill + N.h, 0.0), { col: PAL.void, kind: 2 });
  const l = W(0, N.sill + N.h + 0.08, 0.06);
  S.box(l[0], l[1], l[2], N.w / 2 + 0.2, 0.08, 0.1, Math.atan2(inw.x, inw.z), { col: PAL.stone, kind: 0 });
  const s = W(0, N.sill - 0.05, 0.08);
  S.box(s[0], s[1], s[2], N.w / 2 + 0.1, 0.05, 0.14, Math.atan2(inw.x, inw.z), { col: PAL.stone, kind: 0 });
  const j = W(0.15, N.sill, 0.06);
  S.lathe(j[0], j[1], j[2], [[0.08, 0], [0.13, 0.12], [0.11, 0.26], [0.07, 0.3], [0.09, 0.32], [0.0, 0.34]], 9, { col: PAL.salt, kind: 2 });
  return g;
}

/** The Guild notice board (bible §8.4: Saltrow and Ninewalls): two posts, a board, a few pale notes pinned to it. */
function noticeBoard(S, ground) {
  const q = L.polar(46, 15.2), g = ground(q.x, q.z), ry = Math.atan2(L.CENTRE.x - q.x, L.CENTRE.z - q.z);
  const c = Math.cos(ry), s = Math.sin(ry), W = (lx, y, lz) => [q.x + c * lx + s * lz, g + y, q.z - s * lx + c * lz];
  for (const lx of [-0.62, 0.62]) { const p = W(lx, 0, 0); S.tube([p[0], g - 0.2, p[2]], [p[0], g + 1.85, p[2]], 0.05, 0.045, 6, { col: PAL.woodDark, kind: 2 }); }
  const b = W(0, 1.3, 0.04);
  S.box(b[0], b[1], b[2], 0.6, 0.38, 0.025, ry, { col: PAL.wood, kind: 2 });
  for (let k = 0; k < 4; k++) { const n = W(-0.4 + k * 0.27, 1.25 + (k % 2) * 0.16, 0.07); S.box(n[0], n[1], n[2], 0.09, 0.12, 0.003, ry + (hash(k) - 0.5) * 0.1, { col: PAL.paper, kind: 2 }); }
  return { x: q.x, z: q.z };
}

/** The road's kerb: a stone every 1.4 m along its downhill edge, a run of drystone on the outside of each hairpin. */
function roadKerb(S, ground, natural) {
  const R = L.ROAD, half = L.TERRACE.roadHalf;
  let acc = 0, n = 0;
  for (let i = 0; i + 1 < R.length; i++) {
    const a = R[i], b = R[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
    // the downhill side: where the hillside falls away
    const lx = -uz, lz = ux;
    const nat = natural || ground;
    const down = nat(a[0] + lx * (half + 2), a[1] + lz * (half + 2)) < nat(a[0] - lx * (half + 2), a[1] - lz * (half + 2)) ? 1 : -1;
    for (let t = (1.4 - acc) % 1.4; t < l; t += 1.4) {
      const x = a[0] + ux * t + lx * down * (half - 0.15), z = a[1] + uz * t + lz * down * (half - 0.15), gy = ground(x, z);
      const k = hash(i, t * 3.1);
      S.box(x, gy + 0.08, z, 0.22 + 0.12 * k, 0.14 + 0.06 * hash(t, i), 0.17, Math.atan2(ux, uz) + (k - 0.5) * 0.5, { col: PAL.stone, kind: 0 });
      n++;
    }
    acc = (acc + l) % 1.4;
  }
  return n;
}

/** The houses, the tree and the places, and the road's kerb. */
export function townGeometry(ground, natural = null) {
  const S = new Soup();
  for (const d of L.DWELLINGS) dwelling(S, d, ground);
  const tips = dragonTree(S, ground);
  tubeMouth(S, ground);
  counter(S, ground);
  cistern(S, ground);
  niche(S, ground);
  const board = noticeBoard(S, ground);
  // the Brazier's plinth (the Ninewalls Brazier itself is systems' and settlements', wave 4): a squared drystone block
  const B = L.PLACES.brazier, gb = ground(B.x, B.z);
  S.box(B.x, gb + 0.18, B.z, 0.42, 0.28, 0.42, -B.b * D2R, { col: PAL.stone, kind: 0 });
  const kerb = roadKerb(S, ground, natural);
  return { soup: S, tips, board, kerb };
}

/* ------------------------------------------------------------------------------------------------ the material */

const VERT_DECL = `
attribute float aKind;
attribute vec2 aUV;
attribute float aPaint;
varying float vNwKind;
varying vec2 vNwUV;
varying float vNwPaint;
varying vec3 vNwW;`;

const FRAG_DECL = `
uniform vec3 uNwLine;
varying float vNwKind;
varying vec2 vNwUV;
varying float vNwPaint;
varying vec3 vNwW;
float nwHash(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float nwNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(nwHash(i), nwHash(i + vec2(1.0, 0.0)), f.x), mix(nwHash(i + vec2(0.0, 1.0)), nwHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float nwFbm(vec2 p) { return 0.55 * nwNoise(p) + 0.3 * nwNoise(p * 2.07 + 3.1) + 0.15 * nwNoise(p * 4.3 - 1.7); }
/* drystone (no mortar): irregular basalt stones laid in rough courses, a Voronoi of points jittered in cells 0.44 x 0.28 m
   (each row of cells shifted by its own amount, so no joint runs straight up); edge is the distance to the stone's
   border (F2 - F1), dark and deep in the gap; returns the stone's height, 0 in a joint */
float nwStone(vec2 uv, out vec3 sid) {
  vec2 cs = vec2(0.44, 0.28);
  vec2 q = uv / cs;
  float row0 = floor(q.y);
  float f1 = 9.0, f2 = 9.0; vec2 id1 = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    float rj = row0 + float(j);
    float shift = nwHash(vec2(rj, 3.7));
    for (int i = -1; i <= 1; i++) {
      vec2 c = vec2(floor(q.x - shift) + float(i), rj);
      vec2 h = vec2(nwHash(c + 0.17), nwHash(c.yx + 4.3));
      vec2 pt = vec2(c.x + shift + 0.2 + 0.6 * h.x, rj + 0.3 + 0.4 * h.y);
      vec2 dv = (q - pt) * cs;
      float d = length(dv * vec2(0.85, 1.0));
      if (d < f1) { f2 = f1; f1 = d; id1 = c; } else if (d < f2) { f2 = d; }
    }
  }
  sid = vec3(nwHash(id1), nwHash(id1 + 13.1), nwHash(id1.yx + 5.3));
  float edge = (f2 - f1) * 0.5;
  return smoothstep(0.006, 0.045, edge) * (0.75 + 0.25 * smoothstep(0.0, 0.12, f2 - f1));
}
vec3 nwBumpN(vec3 surfPos, vec3 surfN, float h, float faceDir) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfN), r2 = cross(surfN, sx);
  float det = dot(sx, r1) * faceDir;
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * surfN - grad);
}
float nwHgt = 0.0;
float nwRough = 0.92;`;

const FRAG_COLOR = `
{
  int k = int(vNwKind + 0.5);
  vec3 base = diffuseColor.rgb;
  if (k == 0) {
    vec3 sid; float st = nwStone(vNwUV, sid);
    // basalt stones: near-black to weathered grey, one in seven a warmer brown, one in nine dusted pale; at range (the
    // pattern under a few pixels) each stone's tone goes to the wall's mean, so a wall far off is one stone colour
    float far = clamp(max(fwidth(vNwUV.x), fwidth(vNwUV.y)) / 0.09, 0.0, 1.0);
    vec3 sc = mix(vec3(0.042, 0.04, 0.038), vec3(0.1, 0.094, 0.086), sid.x);
    sc = mix(sc, vec3(0.105, 0.07, 0.05), step(0.86, sid.y) * 0.7);
    sc = mix(sc, vec3(0.15, 0.145, 0.135), step(0.89, sid.z) * (1.0 - step(0.86, sid.y)) * 0.8);
    float pit = smoothstep(0.66, 0.8, nwNoise(vNwUV * 41.0 + sid.xy * 9.0));
    sc *= 1.0 - 0.3 * pit;
    sc *= 0.88 + 0.24 * nwNoise(vNwUV * 9.0 + sid.zx * 5.0);
    sc = mix(sc, vec3(0.068, 0.064, 0.059), far * 0.8);
    vec3 joint = vec3(0.016, 0.015, 0.014) * (0.8 + 0.4 * nwNoise(vNwUV * 17.0));
    vec3 c = mix(mix(joint, sc, st), vec3(0.058, 0.055, 0.051), far * 0.5);
    // the vertex colour is the dust: lapilli in the joints first, then over the stones low down
    vec3 dust = base;
    float dk = clamp(1.0 - (dust.r + dust.g + dust.b) / 3.0, 0.0, 1.0);
    c = mix(c, c * 0.35 + vec3(0.2, 0.18, 0.155) * 0.5, dk * (1.0 - st * 0.55));
    // the Datum Line: flat vermilion ink over the stones, thinner in the joints
    c = mix(c, uNwLine * (0.78 + 0.22 * st), vNwPaint * (0.55 + 0.45 * st));
    diffuseColor.rgb = c;
    nwHgt = (st * (0.82 + 0.18 * sid.x) + 0.12 * nwNoise(vNwUV * 23.0)) * 0.03 * (1.0 - far);
    nwRough = mix(0.98, 0.9, st);
  } else if (k == 1) {
    vec2 p = vNwW.xz + vec2(vNwW.y * 0.7, -vNwW.y * 0.6);
    float n = nwFbm(p * 2.6);
    float speck = smoothstep(0.74, 0.86, nwNoise(p * 31.0));
    diffuseColor.rgb = base * (0.9 + 0.16 * n) * (1.0 - 0.3 * speck);
    nwHgt = (n * 0.006 - speck * 0.002);
    nwRough = 0.86;
  } else if (k == 2) {
    float n = nwNoise(vec2(vNwUV.x * 22.0, vNwUV.y * 2.4)) * 0.6 + nwNoise(vNwUV * 7.0) * 0.4;
    diffuseColor.rgb = base * (0.86 + 0.24 * n);
    nwHgt = n * 0.002;
    nwRough = 0.82;
  } else if (k == 3) {
    vec2 p = vNwW.xz + vec2(vNwW.y * 0.7, -vNwW.y * 0.6);
    float n = nwFbm(p * 1.4), f = nwNoise(p * 11.0);
    vec3 rc = mix(vec3(0.03, 0.028, 0.027), vec3(0.09, 0.082, 0.074), n);
    rc = mix(rc, vec3(0.1, 0.06, 0.04), smoothstep(0.66, 0.85, nwNoise(p * 0.7 + 4.0)) * 0.45);
    diffuseColor.rgb = rc * (0.8 + 0.4 * f) * base;
    nwHgt = (n * 0.06 + f * 0.012);
    nwRough = 0.95;
  } else if (k == 4) {
    float n = nwNoise(vec2(vNwUV.x * 13.0, vNwUV.y * 1.3)), r = nwNoise(vec2(vNwUV.x * 3.0, vNwUV.y * 5.0));
    diffuseColor.rgb = base * (0.72 + 0.32 * n) * (0.92 + 0.12 * r);
    nwHgt = n * 0.012;
    nwRough = 0.9;
  } else if (k == 5) {
    float n = nwNoise(vec2(vNwUV.x * 40.0, vNwUV.y * 6.0));
    diffuseColor.rgb = base * (0.88 + 0.2 * n);
    nwRough = 0.7;
  } else {
    nwRough = 0.07;
  }
}`;

/** The kit's one material. `env` registers it with the cascades and the fog (environment.registerMaterial). */
export function kitMaterial(env) {
  // double-sided: the tree's leaves, the awnings and the mats are single sheets (three turns the normal to the viewer)
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  m.name = 'CAL.ninewalls';
  const U = { uNwLine: { value: PAL.line.clone() } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${VERT_DECL}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNwKind = aKind; vNwUV = aUV; vNwPaint = aPaint; vNwW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${FRAG_DECL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>${FRAG_COLOR}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = nwRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = nwBumpN(-vViewPosition, normal, nwHgt, faceDirection);');
  };
  m.customProgramCacheKey = () => 'cal-ninewalls-kit-2';
  env?.registerMaterial?.(m);
  return m;
}
