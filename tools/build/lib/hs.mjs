/**
 * CALIMA asset pipeline — hard-surface procedural modelling kit (node).
 * Promoted from the Round-5 proof (tools/r5-poc/lib/hs.mjs, pipeline lane W0a);
 * the proof copy is deleted with tools/r5-poc/ at the W0 exit (A-poc-promoted).
 *
 * Everything a creature or a landmark is made of goes through one
 * `Bucket`: a flat, non-indexed triangle soup carrying position / normal /
 * COLOR_0 / TEXCOORD_0. Two conventions make the whole asset ONE material:
 *
 *   - ALBEDO is per-vertex colour (tone x baked wear/grime/cavity), so
 *     bone glaze, oxblood bands, verdigris trim and graphite joints are all
 *     the same draw call;
 *   - ROUGHNESS / METALNESS come from an 8x1 palette texture that every
 *     vertex addresses by a UV texel (`SURF[...].slot`) — the same trick
 *     Round 4's `rig/shells.js` uses at runtime, moved offline.
 *
 * Space: metres, +Y up, +Z forward (the autorig body frame).
 * No DOM, no canvas: runs under plain node with three r169.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/* ------------------------------------------------------------------ */
/* surfaces (palette texels)                                            */
/* ------------------------------------------------------------------ */

export const PALETTE_W = 8;
export const SURF = {
  glaze:    { slot: 0, rough: 0.30, metal: 0.00 }, // fired glaze, glossy dielectric
  bisque:   { slot: 1, rough: 0.74, metal: 0.00 }, // unglazed ceramic / stone
  patina:   { slot: 2, rough: 0.64, metal: 0.22 }, // verdigris copper
  bronze:   { slot: 3, rough: 0.36, metal: 0.90 }, // worn bronze / brass
  graphite: { slot: 4, rough: 0.50, metal: 0.55 }, // composite joints, frames
  rubber:   { slot: 5, rough: 0.90, metal: 0.00 }, // pads, seals
  chrome:   { slot: 6, rough: 0.18, metal: 1.00 }, // piston rods
  lamp:     { slot: 7, rough: 0.40, metal: 0.00 }, // sensor glass (emissive bucket)
};

/** RGBA bytes of the palette (R = AO 1, G = roughness, B = metalness). */
export function paletteBytes() {
  const out = new Uint8Array(PALETTE_W * 4);
  for (const s of Object.values(SURF)) {
    out[s.slot * 4] = 255;
    out[s.slot * 4 + 1] = Math.round(s.rough * 255);
    out[s.slot * 4 + 2] = Math.round(s.metal * 255);
    out[s.slot * 4 + 3] = 255;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* deterministic helpers                                                */
/* ------------------------------------------------------------------ */

export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function hash3(x, y, z) {
  const h = Math.sin(x * 37.1 + y * 91.7 + z * 13.3) * 43758.5453;
  return h - Math.floor(h);
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const _m3 = new THREE.Matrix3();

/* ------------------------------------------------------------------ */
/* the bucket                                                           */
/* ------------------------------------------------------------------ */

export class Bucket {
  constructor(name) {
    this.name = name;
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.pieces = 0;
  }

  get triangles() { return this.pos.length / 9; }

  /**
   * Add a three geometry, transformed by `matrix`, painted with one surface.
   * opts: surf, tone (sRGB hex), wear 0..1, edge (attribute-driven rim
   * lightening), colorFn(p, n, k) -> k override.
   */
  add(geo, opts = {}) {
    const { matrix = null, surf = 'glaze', tone = 0xffffff, wear = 0.3 } = opts;
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matrix) g.applyMatrix4(matrix);
    const flip = matrix ? matrix.determinant() < 0 : false;
    const P = g.attributes.position;
    const N = g.attributes.normal;
    const E = g.attributes.edge || null;
    const S = SURF[surf] || SURF.glaze;
    const u = (S.slot + 0.5) / PALETTE_W;
    _c.set(tone); // sRGB hex -> linear (ColorManagement on)
    const r0 = _c.r, g0 = _c.g, b0 = _c.b;
    const n = P.count;
    for (let t = 0; t < n; t += 3) {
      const order = flip ? [t, t + 2, t + 1] : [t, t + 1, t + 2];
      for (const i of order) {
        _v.fromBufferAttribute(P, i);
        _n.fromBufferAttribute(N, i);
        const up = THREE.MathUtils.clamp(_n.y, -1, 1);
        const speck = (hash3(_v.x, _v.y, _v.z) - 0.5) * 0.12 * wear;
        let k = 1 + up * 0.12 * wear + speck - (up < -0.35 ? 0.22 * wear : 0);
        if (E) k += E.getX(i) * 0.16 * wear;
        if (opts.colorFn) k = opts.colorFn(_v, _n, k);
        k = THREE.MathUtils.clamp(k, 0.45, 1.5);
        this.pos.push(_v.x, _v.y, _v.z);
        this.nor.push(_n.x, _n.y, _n.z);
        this.col.push(r0 * k, g0 * k, b0 * k);
        this.uv.push(u, 0.5);
      }
    }
    this.pieces++;
    g.dispose();
    return this;
  }

  /** Multiply every vertex colour by f(position) — grime, AO ramps. */
  shade(fn) {
    for (let i = 0; i < this.pos.length; i += 3) {
      const k = fn(this.pos[i], this.pos[i + 1], this.pos[i + 2]);
      this.col[i] *= k; this.col[i + 1] *= k; this.col[i + 2] *= k;
    }
  }

  translate(dx, dy, dz) {
    for (let i = 0; i < this.pos.length; i += 3) {
      this.pos[i] += dx; this.pos[i + 1] += dy; this.pos[i + 2] += dz;
    }
  }

  bounds(box = new THREE.Box3()) {
    for (let i = 0; i < this.pos.length; i += 3) {
      box.expandByPoint(_v.set(this.pos[i], this.pos[i + 1], this.pos[i + 2]));
    }
    return box;
  }
}

/* ------------------------------------------------------------------ */
/* frames                                                               */
/* ------------------------------------------------------------------ */

/** Matrix whose local X/Y/Z are the given world axes, origin `o`. */
export function basis(x, y, z, o) {
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(o);
}

/** Matrix mapping local +Y onto the segment a -> b, centred at its midpoint. */
export function alongY(a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return { m: new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)), len };
}

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const MIRROR_X = new THREE.Matrix4().makeScale(-1, 1, 1);

/* ------------------------------------------------------------------ */
/* primitives                                                           */
/* ------------------------------------------------------------------ */

/** Tapered cylinder a -> b (radius r0 at a, r1 at b). */
export function strut(bucket, a, b, r0, r1, opts = {}) {
  const { m, len } = alongY(a, b);
  const g = new THREE.CylinderGeometry(r1, r0, len, opts.sides ?? 10, 1, !!opts.open);
  bucket.add(g, { ...opts, matrix: opts.matrix ? opts.matrix.clone().multiply(m) : m });
  g.dispose();
}

export function ball(bucket, c, r, opts = {}) {
  const g = new THREE.SphereGeometry(r, opts.w ?? 12, opts.h ?? 8);
  const m = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z);
  bucket.add(g, { ...opts, matrix: opts.matrix ? opts.matrix.clone().multiply(m) : m });
  g.dispose();
}

/** Bevelled box. `rot` Euler [x,y,z]. */
export function rbox(bucket, c, size, radius, opts = {}) {
  const g = new RoundedBoxGeometry(size[0], size[1], size[2], opts.segs ?? 2, radius);
  const m = new THREE.Matrix4().compose(
    c, new THREE.Quaternion().setFromEuler(new THREE.Euler(...(opts.rot || [0, 0, 0]))),
    new THREE.Vector3(1, 1, 1));
  bucket.add(g, { ...opts, matrix: opts.matrix ? opts.matrix.clone().multiply(m) : m });
  g.dispose();
}

export function torus(bucket, c, R, r, axis = 'y', opts = {}) {
  const g = new THREE.TorusGeometry(R, r, opts.tube ?? 6, opts.radial ?? 24);
  // torus lies in XY (axis Z) in three
  const q = new THREE.Quaternion();
  if (axis === 'y') q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  else if (axis === 'x') q.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  const m = new THREE.Matrix4().compose(c, q, new THREE.Vector3(1, 1, 1));
  bucket.add(g, { ...opts, matrix: opts.matrix ? opts.matrix.clone().multiply(m) : m });
  g.dispose();
}

/** Swept tube through points. */
export function cable(bucket, pts, r, opts = {}) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, opts.segs ?? 16, r, opts.radial ?? 6, false);
  bucket.add(g, opts);
  g.dispose();
}

/**
 * Bevelled extruded plate. `outline` is a 2-D polygon in the plate's local
 * XY (metres), extruded `depth` along local +Z and centred on z = 0. The
 * bevel faces carry `edge = 1` so `Bucket.add` lightens them (worn rims).
 */
export function plate(bucket, outline, depth, bevel, matrix, opts = {}) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 1, curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  // groups: 0 = caps, 1 = sides (incl. bevel)
  const n = ng.attributes.position.count;
  const edge = new Float32Array(n);
  for (const grp of ng.groups) {
    if (grp.materialIndex !== 1) continue;
    for (let i = grp.start; i < grp.start + grp.count; i++) edge[i] = 1;
  }
  ng.setAttribute('edge', new THREE.BufferAttribute(edge, 1));
  bucket.add(ng, { ...opts, matrix });
  ng.dispose();
}

/**
 * Crease-aware lathe. `profile` = [{ r, h, surf?, tone? }, ...] along the
 * local +Y axis; segment j (point j -> j+1) is painted with point j's
 * surf/tone. Normals are smooth around the axis and split along the
 * profile wherever two segments meet at more than `crease` degrees, so a
 * turned body keeps hard bevels and soft domes in the same mesh.
 * `panels`: split the revolution into N panels with `gap` degree seams.
 */
export function lathe(bucket, profile, matrix, opts = {}) {
  const segs = opts.segs ?? 32;
  const crease = Math.cos(THREE.MathUtils.degToRad(opts.crease ?? 38));
  const panels = opts.panels ?? 1;
  const gap = THREE.MathUtils.degToRad(opts.gap ?? 0);
  const phi0 = opts.phiStart ?? 0;
  const phiLen = opts.phiLength ?? Math.PI * 2;
  const P = profile;
  // per-segment 2-D outward normals in (r, h)
  const segN = [];
  for (let j = 0; j < P.length - 1; j++) {
    const dr = P[j + 1].r - P[j].r, dh = P[j + 1].h - P[j].h;
    const l = Math.hypot(dr, dh) || 1;
    segN.push([dh / l, -dr / l]);
  }
  const vN = (j, side) => { // normal at point j for segment (side 0 = seg j-1, 1 = seg j)
    const a = segN[j - 1], b = segN[j];
    if (!a) return b; if (!b) return a;
    const dot = a[0] * b[0] + a[1] * b[1];
    if (dot >= crease) {
      const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    }
    return side === 0 ? a : b;
  };
  // emit per surf/tone run so each run is one `Bucket.add` call
  const runs = new Map();
  const per = Math.max(2, Math.round(segs / panels));
  for (let p = 0; p < panels; p++) {
    const a0 = phi0 + (p / panels) * phiLen + (panels > 1 ? gap / 2 : 0);
    const a1 = phi0 + ((p + 1) / panels) * phiLen - (panels > 1 ? gap / 2 : 0);
    for (let j = 0; j < P.length - 1; j++) {
      const surf = P[j].surf ?? opts.surf ?? 'glaze';
      const tone = P[j].tone ?? opts.tone ?? 0xffffff;
      const key = `${surf}|${tone}`;
      let run = runs.get(key);
      if (!run) { run = { surf, tone, pos: [], nor: [] }; runs.set(key, run); }
      const nA = vN(j, 1), nB = vN(j + 1, 0);
      if (P[j].r < 1e-6 && P[j + 1].r < 1e-6) continue;
      for (let k = 0; k < per; k++) {
        const t0 = a0 + (k / per) * (a1 - a0), t1 = a0 + ((k + 1) / per) * (a1 - a0);
        const s0 = Math.sin(t0), c0 = Math.cos(t0), s1 = Math.sin(t1), c1 = Math.cos(t1);
        const q = (r, h, s, c) => [r * s, h, r * c];
        const nq = (n2, s, c) => [n2[0] * s, n2[1], n2[0] * c];
        const A = q(P[j].r, P[j].h, s0, c0), B = q(P[j].r, P[j].h, s1, c1);
        const C = q(P[j + 1].r, P[j + 1].h, s1, c1), D = q(P[j + 1].r, P[j + 1].h, s0, c0);
        const nA0 = nq(nA, s0, c0), nA1 = nq(nA, s1, c1), nB1 = nq(nB, s1, c1), nB0 = nq(nB, s0, c0);
        // two triangles, CCW seen from outside
        if (P[j].r > 1e-6) run.pos.push(...A, ...B, ...D), run.nor.push(...nA0, ...nA1, ...nB0);
        if (P[j + 1].r > 1e-6) run.pos.push(...B, ...C, ...D), run.nor.push(...nA1, ...nB1, ...nB0);
      }
    }
  }
  for (const run of runs.values()) {
    if (!run.pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(run.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(run.nor, 3));
    bucket.add(g, { ...opts, surf: run.surf, tone: run.tone, matrix });
    g.dispose();
  }
}

/** Lathe with its axis along local +Z (rotate the +Y lathe onto Z). */
export const AXIS_Z = new THREE.Matrix4().makeRotationX(Math.PI / 2);
export const AXIS_X = new THREE.Matrix4().makeRotationZ(-Math.PI / 2);

export function at(x, y, z, m = null) {
  const t = new THREE.Matrix4().makeTranslation(x, y, z);
  return m ? t.multiply(m) : t;
}

export { THREE };
