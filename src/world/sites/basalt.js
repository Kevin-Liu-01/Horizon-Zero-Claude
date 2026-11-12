import * as THREE from 'three';
import { ORGAN, CRATER } from './layout.js';

/**
 * BASALT AND TUFF (world-props W1): the Organ Shelf's column clusters and the
 * red crater's rock, both generated here at boot from the layout (one merged
 * mesh for the columns, one instanced mesh for the tuff blocks, one merged mesh
 * for the crater's stratified buttresses). Nothing is loaded; everything is
 * snapped to `terrain.getHeight`, so a re-baked island moves nothing by hand.
 *
 * Columns (bible §8.3 "11 hex clusters", §8.7 "hex basalt columns as natural
 * stairs", ROUND5-LOOK W-05): hexagonal prisms 0.6-1.4 m across, packed in a
 * hex grid, the tallest at each cluster's back stepping down in 0.6-1.3 m
 * risers toward its face, 2-14 m above the ground, with cross-joints every
 * 1-2.5 m, chamfered and tilted tops, salt and lichen on the treads, a wet foot.
 * Each column is one box collider (A24: the player is stopped by one; the
 * mantle climbs the 1 m risers).
 *
 * Crater rock: ≈ 150 red-tuff blocks on the talus apron and the benches of the
 * high wall (W-03 palette: rust red, cinder, ochre tuff), and seven bedded
 * buttress outcrops at the cliff foot.
 *
 * Deterministic (seeded); every geometry and material is owned and disposed.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

const _c = new THREE.Color();
const BASALT = [0x34343a, 0x3a3a3f, 0x2f2f34, 0x403e3f, 0x37363a];
const TUFF = [0x7a3b2a, 0x8e3b23, 0x9a5a3a, 0x6b3426, 0x8c6a48, 0xa4683f];
const D2R = Math.PI / 180;

/** Append one hex column to the flat arrays (non-indexed, flat-ish normals per side). */
function pushColumn(out, cx, cz, rad, y0, y1, rot, seed, tone) {
  const P = out.pos, N = out.nor, C = out.col;
  const R = mulberry32(seed);
  const cham = Math.min(0.07 + rad * 0.06, (y1 - y0) * 0.1);
  // cross-joint heights (columnar jointing), measured up from the base
  const rings = [y0];
  let y = y0 + 0.6 + R() * 1.2;
  while (y < y1 - cham - 0.5) { rings.push(y); y += 1.0 + R() * 1.5; }
  rings.push(y1 - cham);
  // a broken top: the cap tilts a little
  const tx = (R() - 0.5) * 0.16, tz = (R() - 0.5) * 0.16;
  _c.setHex(tone).convertSRGBToLinear();
  const br = _c.r, bg = _c.g, bb = _c.b;
  const k0 = 0.86 + R() * 0.28;
  const corner = (i, r) => { const a = rot + (i / 6) * Math.PI * 2; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; };
  const tri = (ax, ay, az, bx, by, bz, cx2, cy2, cz2, nx, ny, nz, ka, kb, kc) => {
    P.push(ax, ay, az, bx, by, bz, cx2, cy2, cz2);
    N.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    C.push(br * ka, bg * ka, bb * ka, br * kb, bg * kb, bb * kb, br * kc, bg * kc, bb * kc);
  };
  const shadeAt = (yy, side) => {
    // wet foot, cross-joint darkening, vertical streaks, the occasional pale lichen patch
    let k = k0 * (0.72 + 0.28 * Math.min(1, (yy - y0) / 1.4));
    k *= 0.9 + 0.2 * vnoise(side * 3.1 + cx * 0.7, yy * 0.4 + cz * 0.7);
    return k;
  };
  for (let s = 0; s < 6; s++) {
    const [ax, az] = corner(s, rad), [bx, bz] = corner(s + 1, rad);
    const mx = (ax + bx) / 2 - cx, mz = (az + bz) / 2 - cz, ml = Math.hypot(mx, mz) || 1;
    const nx = mx / ml, nz = mz / ml;
    for (let r = 0; r + 1 < rings.length; r++) {
      const ya = rings[r] + (r ? 0.02 : 0), yb = rings[r + 1] - 0.02;
      const inA = r ? 0.985 : 1;                          // a slight inset at each joint
      const [a1x, a1z] = corner(s, rad * inA), [b1x, b1z] = corner(s + 1, rad * inA);
      const ka = shadeAt(ya, s), kb = shadeAt(yb, s);
      tri(a1x, ya, a1z, bx, yb, bz, b1x, ya, b1z, nx, 0, nz, ka, kb, ka);
      tri(a1x, ya, a1z, ax, yb, az, bx, yb, bz, nx, 0, nz, ka, kb, kb);
      // the joint itself: a thin dark band
      if (r + 2 < rings.length) {
        const yj = rings[r + 1];
        const kj = kb * 0.55;
        tri(ax, yb, az, bx, yj + 0.02, bz, bx, yb, bz, nx, 0, nz, kj, kj, kj);
        tri(ax, yb, az, ax, yj + 0.02, az, bx, yj + 0.02, bz, nx, 0, nz, kj, kj, kj);
      }
    }
    // chamfer + cap (tilted top)
    const yt = y1 - cham;
    const hA = y1 + tx * (ax - cx) + tz * (az - cz), hB = y1 + tx * (bx - cx) + tz * (bz - cz);
    const [ia, iaz] = corner(s, rad - cham), [ib, ibz] = corner(s + 1, rad - cham);
    const kc = k0 * 1.12;
    tri(ax, yt, az, ib, hB, ibz, bx, yt, bz, nx * 0.7, 0.7, nz * 0.7, kc, kc * 1.1, kc);
    tri(ax, yt, az, ia, hA, iaz, ib, hB, ibz, nx * 0.7, 0.7, nz * 0.7, kc, kc * 1.1, kc * 1.1);
    // the tread: salt / lichen on top, lighter
    const lich = vnoise(cx * 0.9 + s, cz * 0.9) > 0.62 ? 1.55 : 1.28;
    tri(cx, y1 + 0.01, cz, ib, hB, ibz, ia, hA, iaz, -tx, 1, -tz, k0 * lich, k0 * 1.2, k0 * 1.2);
  }
}

/**
 * The Organ Shelf. Returns { mesh, columns: [{x, z, r, y0, y1, rot}], clusters }.
 * `terrain` is ctx.terrain.
 */
export function buildOrganShelf(terrain, clusters = ORGAN) {
  const out = { pos: [], nor: [], col: [] };
  const columns = [];
  const report = [];
  let seed = 9001;
  for (const cl of clusters) {
    const R = mulberry32(seed += 101);
    const diam = 0.75 + R() * 0.5;                        // cluster's mean column diameter
    const pitch = diam * 0.93;                            // hex packing pitch (columns touch)
    const fx = Math.sin(cl.face * D2R), fz = -Math.cos(cl.face * D2R);   // toward the face
    const rot = R() * Math.PI / 3;
    const n = Math.ceil(cl.r / pitch) + 1;
    let count = 0, hiMax = 0, hiMin = 99;
    for (let j = -n; j <= n; j++) {
      for (let i = -n; i <= n; i++) {
        const lx = (i + (j & 1) * 0.5) * pitch, lz = j * pitch * 0.866;
        const d = Math.hypot(lx, lz);
        // ragged outline: a noisy radius
        const edge = cl.r * (0.82 + 0.3 * vnoise(Math.atan2(lz, lx) * 1.7 + cl.x, cl.z * 0.1));
        if (d > edge) continue;
        const x = cl.x + lx * Math.cos(rot) - lz * Math.sin(rot);
        const z = cl.z + lx * Math.sin(rot) + lz * Math.cos(rot);
        // height: tallest at the back, stepping down toward the face, quantised into risers
        const along = ((x - cl.x) * fx + (z - cl.z) * fz) / cl.r;          // -1 back .. +1 face
        const t = (1 - along) * 0.5;                                       // 1 at the back
        let h = 2 + (cl.top - 2) * Math.pow(Math.max(0, t), 0.8) * (0.8 + 0.4 * vnoise(x * 0.5, z * 0.5));
        h = Math.max(2, Math.min(cl.top, Math.round(h / 0.85) * 0.85 + (R() - 0.5) * 0.35));
        const rad = (diam * (0.85 + R() * 0.3)) / 2;
        const g0 = terrain.getHeight(x, z);
        const g1 = Math.min(g0, terrain.getHeight(x + rad, z), terrain.getHeight(x - rad, z),
          terrain.getHeight(x, z + rad), terrain.getHeight(x, z - rad));
        const y0 = g1 - 0.45, y1 = g0 + h;
        const crot = rot + (R() - 0.5) * 0.18;
        pushColumn(out, x, z, rad, y0, y1, crot, seed + count * 7, BASALT[(count + (R() * 3 | 0)) % BASALT.length]);
        columns.push({ x, z, r: rad, y0, y1, rot: crot, cluster: cl.id });
        hiMax = Math.max(hiMax, h); hiMin = Math.min(hiMin, h);
        count++;
      }
    }
    report.push({ id: cl.id, columns: count, hMin: +hiMin.toFixed(2), hMax: +hiMax.toFixed(2) });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0.02, name: 'r5-organ-basalt' });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'organ-shelf-landmark-columns';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, columns, clusters: report };
}

/** One tuff block: a squashed, bedded, noise-displaced icosahedron (unit size). */
function tuffBlockGeo() {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = vnoise(x * 2.3 + 5, z * 2.3 + y * 1.7);
    const k = 0.78 + 0.42 * n;
    // bedded: flatten into terraces (tuff splits along its beds)
    y = Math.round(y * 3) / 3 * 0.55 + y * 0.12;
    p.setXYZ(i, x * k, y * k, z * k * 0.9);
  }
  const ng = g.toNonIndexed();
  g.dispose();
  ng.computeVertexNormals();
  // vertex shade: tops lighter (dust), bed lines darker
  const pos = ng.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const bed = 0.82 + 0.18 * Math.abs(Math.sin(y * 9.4));
    const k = bed * (0.86 + 0.24 * (y + 0.6));
    col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/**
 * The red crater's rock. Returns { blocks (InstancedMesh), buttresses (Mesh), count }.
 * Blocks scatter over the talus apron and the benches of the high wall (the
 * ring's plan ellipse, 0.55-1.05 of its radius, on the wall's side), where the
 * ground is 0.4-34 m up and not steeper than ~50 deg.
 */
export function buildCraterRock(terrain) {
  const cx = CRATER.centre.e, cz = -CRATER.centre.n;
  const R = mulberry32(0x7aff);
  const recs = [];
  let tries = 0;
  while (recs.length < 150 && tries++ < 6000) {
    const a = R() * Math.PI * 2;
    // the high wall faces S/SE from its N-by-W crest: keep to the N half
    const bearing = (Math.atan2(Math.cos(a), -Math.sin(a)) / D2R + 360) % 360;
    const dWall = Math.abs(((bearing - CRATER.wallBearing + 540) % 360) - 180);
    if (dWall > 95) continue;
    const d = 0.55 + R() * 0.5;
    const x = cx + Math.cos(a) * CRATER.rx * d, z = cz + Math.sin(a) * CRATER.rz * d;
    const h = terrain.getHeight(x, z);
    if (h < 0.4 || h > 34) continue;
    const sl = terrain.slopeFast ? terrain.slopeFast(x, z) : 0;
    if (sl > 1.2) continue;
    const big = R() < 0.12;
    const s = big ? 1.6 + R() * 1.8 : 0.35 + Math.pow(R(), 2.2) * 1.4;
    recs.push({ x, z, h, s, yaw: R() * Math.PI * 2, tilt: (R() - 0.5) * 0.5, tone: TUFF[(R() * TUFF.length) | 0] });
  }
  const geo = tuffBlockGeo();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, name: 'r5-tuff' });
  const blocks = new THREE.InstancedMesh(geo, mat, recs.length);
  blocks.name = 'red-crater-landmark-tuff';
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    _p.set(r.x, r.h + r.s * 0.18, r.z);
    _q.setFromEuler(_e.set(r.tilt, r.yaw, r.tilt * 0.6));
    _s.set(r.s * (1 + 0.3 * Math.sin(i)), r.s * 0.75, r.s);
    _m.compose(_p, _q, _s);
    blocks.setMatrixAt(i, _m);
    blocks.setColorAt(i, _c.setHex(r.tone).convertSRGBToLinear());
  }
  blocks.instanceMatrix.needsUpdate = true;
  if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
  blocks.castShadow = true;
  blocks.receiveShadow = true;
  blocks.computeBoundingSphere();

  // seven bedded buttress outcrops at the cliff foot: stacks of 3-6 tuff beds
  const out = { pos: [], nor: [], col: [] };
  const buttress = [];
  let b = 0;
  for (let k = 0; k < 40 && buttress.length < 7; k++) {
    const bearing = CRATER.wallBearing - 80 + R() * 160;
    const a = Math.atan2(-Math.cos(bearing * D2R), Math.sin(bearing * D2R));
    const x = cx + Math.cos(a) * CRATER.rx * 0.62, z = cz + Math.sin(a) * CRATER.rz * 0.62;
    const h = terrain.getHeight(x, z);
    if (h < 1 || h > 18) continue;
    if (buttress.some((q) => Math.hypot(q.x - x, q.z - z) < 18)) continue;
    let y = h - 1.2;
    const beds = 3 + (R() * 4 | 0);
    let w = 4.5 + R() * 3.5;
    for (let i = 0; i < beds; i++) {
      const t = 0.9 + R() * 2.4;
      pushSlab(out, x + (R() - 0.5) * 1.5, z + (R() - 0.5) * 1.5, y, t, w, w * (0.5 + R() * 0.3), a + (R() - 0.5) * 0.5, TUFF[(b + i) % TUFF.length], R);
      y += t; w *= 0.78 + R() * 0.18;
    }
    buttress.push({ x, z, top: y });
    b++;
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  bg.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  bg.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  bg.computeBoundingBox(); bg.computeBoundingSphere();
  const buttresses = new THREE.Mesh(bg, mat);
  buttresses.name = 'red-crater-landmark-beds';
  buttresses.castShadow = true;
  buttresses.receiveShadow = true;
  return { blocks, buttresses, count: recs.length, buttress, geo, bgeo: bg, mat };
}

/** A bedded slab: an irregular octagon prism with a pale top and a darker underside. */
function pushSlab(out, cx, cz, y0, t, w, d, yaw, tone, R) {
  const P = out.pos, N = out.nor, C = out.col;
  const k = 8;
  const pts = [];
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2;
    const j = 0.8 + R() * 0.35;
    const lx = Math.cos(a) * w * 0.5 * j, lz = Math.sin(a) * d * 0.5 * j;
    pts.push([cx + lx * Math.cos(yaw) - lz * Math.sin(yaw), cz + lx * Math.sin(yaw) + lz * Math.cos(yaw)]);
  }
  _c.setHex(tone).convertSRGBToLinear();
  const push = (ax, ay, az, bx, by, bz, qx, qy, qz, kk) => {
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = qx - ax, vy = qy - ay, vz = qz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    P.push(ax, ay, az, bx, by, bz, qx, qy, qz);
    N.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    for (let i = 0; i < 3; i++) C.push(_c.r * kk, _c.g * kk, _c.b * kk);
  };
  const y1 = y0 + t;
  for (let i = 0; i < k; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % k];
    const kk = 0.85 + R() * 0.2;
    push(ax, y0, az, ax, y1, az, bx, y1, bz, kk);
    push(ax, y0, az, bx, y1, bz, bx, y0, bz, kk);
    push(cx, y1, cz, bx, y1, bz, ax, y1, az, 1.22);
    push(cx, y0, cz, ax, y0, az, bx, y0, bz, 0.6);
  }
}
