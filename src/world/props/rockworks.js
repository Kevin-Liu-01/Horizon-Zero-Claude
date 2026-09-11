import * as THREE from 'three';
import {
  SimplexNoise, mulberry32, composeMat, paintRock, bake, materials, roughen,
} from './kit.js';

/**
 * ROUND 4 — `world-16` (heightfield-only, no verticality), the `world-props`
 * half: cliff, arch and cave collision meshes, plus the climbable-ledge table.
 *
 * The terrain heightfield cannot express an overhang — every query is a single
 * height per (x,z) — so the three landforms HZD leans on hardest are impossible
 * to author in `terrain.js` at all. They are built here as real meshes and
 * registered as their own colliders, which is what makes them *space* rather
 * than decoration:
 *
 *   THE STACKS  (96, 120)   a 13 m cliff band 40 m long with three benches,
 *                           the climbable route out of the north meadow
 *   THE ARCH    (188, -118) a 19 m natural span you can walk under and shoot
 *                           through, with a talus apron
 *   THE HOLLOW  (-166, 118) a cave mouth in a rock knuckle, 6 m deep, dark
 *                           enough to read as shelter and lit by its own coals
 *
 * CLIMBABLE LEDGES. `player-control` owns traversal, so this lane publishes
 * DATA, not behaviour: `ctx.props.ledges` is an array of
 * `{ id, x, y, z, nx, nz, width, topY, from, to }` records — a horizontal grab
 * edge at world `y`, facing `(nx,nz)`, `width` metres wide, with the stand
 * height on top. `from`/`to` are the two ends of the edge so a mantle can pick
 * the nearest point along it. Also exposed as
 * `ctx.props.ledgeNear(x, y, z, maxDist)` returning the closest record or null,
 * which is the whole API a mantle probe needs.
 *
 * COLLISION: these live in their own group (`world-rockworks`) so the scene
 * seed does not double them, and each mesh is registered explicitly as kind
 * `'cliff'` / `'arch'` / `'cave'` — blocking, occluding, camera.
 */

export const LEDGE_KINDS = ['cliff', 'arch', 'cave'];

export class Rockworks {
  constructor(ctx) {
    this.ctx = ctx;
    this.noise = new SimplexNoise(31337);
    this.group = new THREE.Group();
    this.group.name = 'world-rockworks';
    /** @type {{kind:string, mesh:THREE.Mesh}[]} */
    this.parts = [];
    /** @type {object[]} */
    this.ledges = [];

    this._stacks();
    this._arch();
    this._hollow();

    ctx.scene.add(this.group);
  }

  gy(x, z) { return this.ctx.terrain.getHeight(x, z); }

  _push(kind, geos, name, { camera = true } = {}) {
    const mesh = bake(geos, materials().rock, { name });
    if (!mesh) return null;
    this.group.add(mesh);
    this.parts.push({ kind, mesh, camera });
    return mesh;
  }

  _ledge(id, x, y, z, nx, nz, width, topY) {
    const len = Math.hypot(nx, nz) || 1;
    const ux = nx / len, uz = nz / len;
    // edge runs perpendicular to the face normal
    const ex = -uz * width * 0.5, ez = ux * width * 0.5;
    this.ledges.push({
      id, x, y, z, nx: ux, nz: uz, width, topY,
      from: { x: x + ex, y, z: z + ez },
      to: { x: x - ex, y, z: z - ez },
    });
  }

  /* ------------------------- the stacks (cliff band) --------------------- */

  _stacks() {
    const X = 96, Z = 120;
    const N = this.noise;
    const rng = mulberry32(0xC11F);
    const geos = [];
    const YAW = -0.55;                        // face looks back toward the camp
    const cs = Math.cos(YAW), sn = Math.sin(YAW);
    const at = (u, v) => [X + cs * u - sn * v, Z + sn * u + cs * v];
    const LEN = 42;
    const g0 = this.gy(X, Z);

    // three stacked benches, each stepped back — the climbable route
    const tiers = [
      { y0: 0.0, h: 4.6, back: 0.0, len: LEN },
      { y0: 4.4, h: 4.4, back: 3.1, len: LEN * 0.86 },
      { y0: 8.6, h: 4.6, back: 6.4, len: LEN * 0.62 },
    ];
    for (let t = 0; t < tiers.length; t++) {
      const T = tiers[t];
      const box = new THREE.BoxGeometry(T.len, T.h, 7.5 + t * 1.2, 14, 4, 4);
      roughen(box, N, 0.62, 0.13, t * 17 + 3);
      // undercut the face so it overhangs the tier below (heightfields cannot)
      const p = box.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const fy = p.getY(v) / T.h + 0.5;
        if (p.getZ(v) < 0) p.setZ(v, p.getZ(v) - (1 - fy) * 1.15);
      }
      box.computeVertexNormals();
      paintRock(box, 7000 + t * 31, N);
      const [bx, bz] = at(0, T.back);
      box.applyMatrix4(composeMat(bx, g0 + T.y0 + T.h / 2 - 0.6, bz, 0.02, YAW, 0.01));
      geos.push(box.toNonIndexed());

      // the grab edge at the top of this tier, on the face side
      const [lx, lz] = at(0, T.back - (7.5 + t * 1.2) / 2 - 0.2);
      // local -v points out of the face: world (sin YAW, -cos YAW)
      this._ledge(`stacks-${t}`, lx, g0 + T.y0 + T.h - 0.62, lz,
        sn, -cs, T.len * 0.7, g0 + T.y0 + T.h - 0.55);
    }
    // buttress stacks in front of the face, so the silhouette is not a slab
    for (let i = 0; i < 5; i++) {
      const u = (i / 4 - 0.5) * LEN * 0.9 + (rng() - 0.5) * 4;
      const [sx, sz] = at(u, -4.4 - rng() * 1.6);
      const h = 3.4 + rng() * 5.2;
      const col = new THREE.CylinderGeometry(1.5 + rng() * 0.9, 2.2 + rng() * 1.1, h, 7, 3);
      roughen(col, N, 0.35, 0.5, i * 13);
      paintRock(col, 7200 + i, N);
      col.applyMatrix4(composeMat(sx, this.gy(sx, sz) + h / 2 - 0.4, sz, (rng() - 0.5) * 0.1, rng() * 3, (rng() - 0.5) * 0.1));
      geos.push(col.toNonIndexed());
    }
    // talus at the foot
    for (let i = 0; i < 26; i++) {
      const u = (rng() - 0.5) * LEN, v = -5.5 - rng() * 5;
      const [tx, tz] = at(u, v);
      const s = 0.3 + rng() * rng() * 1.8;
      const g = new THREE.DodecahedronGeometry(s, 0);
      paintRock(g, 7300 + i, N);
      g.applyMatrix4(composeMat(tx, this.gy(tx, tz) + s * 0.42, tz, rng(), rng() * 6.28, rng(),
        1, 0.7 + rng() * 0.4, 1));
      geos.push(g.toNonIndexed());
    }
    this._push('cliff', geos, 'rockworks-stacks');
  }

  /* ------------------------------- the arch ------------------------------ */

  _arch() {
    const X = 188, Z = -118;
    const N = this.noise;
    const rng = mulberry32(0xA2C4);
    const geos = [];
    const YAW = 0.85;
    const cs = Math.cos(YAW), sn = Math.sin(YAW);
    const at = (u, v) => [X + cs * u - sn * v, Z + sn * u + cs * v];
    const SPAN = 15.5;                        // half-width of the opening
    const H = 19;

    // two piers + the arch ring, built as a swept band of boxes so the opening
    // is a real hole a capsule can pass through
    const SEG = 15;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI, a1 = ((i + 1) / SEG) * Math.PI;
      const am = (a0 + a1) / 2;
      const u0 = Math.cos(a0) * SPAN, u1 = Math.cos(a1) * SPAN;
      const y0 = Math.sin(a0) * H, y1 = Math.sin(a1) * H;
      const len = Math.hypot(u1 - u0, y1 - y0) * 1.25;
      const thick = 3.6 + 2.2 * Math.sin(am) + N.noise2D(i * 0.7, 3) * 0.9;
      const depth = 7.0 + N.noise2D(i * 0.5, 9) * 2.2;
      const seg = new THREE.BoxGeometry(len, thick, depth, 3, 3, 3);
      roughen(seg, N, 0.5, 0.28, i * 11);
      paintRock(seg, 7400 + i * 7, N);
      const um = (u0 + u1) / 2, ym = (y0 + y1) / 2;
      const tilt = Math.atan2(y1 - y0, u1 - u0);
      const [wx, wz] = at(um, 0);
      const base = this.gy(...at(0, 0));
      seg.applyMatrix4(composeMat(wx, base + ym + 0.4, wz, 0, YAW, tilt));
      geos.push(seg.toNonIndexed());
    }
    // pier feet, widened into the ground
    for (const s of [-1, 1]) {
      const [fx, fz] = at(s * SPAN, 0);
      const foot = new THREE.CylinderGeometry(3.4, 5.6, 5.2, 9, 3);
      roughen(foot, N, 0.6, 0.3, s * 21);
      paintRock(foot, 7500 + s, N);
      foot.applyMatrix4(composeMat(fx, this.gy(fx, fz) + 1.6, fz, 0, rng() * 3, s * 0.05));
      geos.push(foot.toNonIndexed());
      // a grab ledge on the outside of each pier at 4.2 m
      this._ledge(`arch-${s > 0 ? 'e' : 'w'}`, fx + cs * s * 3.2, this.gy(fx, fz) + 4.2, fz + sn * s * 3.2,
        cs * s, sn * s, 4.0, this.gy(fx, fz) + 4.3);
    }
    // crown boulders + talus apron
    for (let i = 0; i < 20; i++) {
      const u = (rng() - 0.5) * SPAN * 2.6, v = (rng() - 0.5) * 12;
      const [tx, tz] = at(u, v);
      const s = 0.35 + rng() * rng() * 2.2;
      const g = new THREE.DodecahedronGeometry(s, 0);
      paintRock(g, 7600 + i, N);
      g.applyMatrix4(composeMat(tx, this.gy(tx, tz) + s * 0.4, tz, rng(), rng() * 6.28, rng()));
      geos.push(g.toNonIndexed());
    }
    this._push('arch', geos, 'rockworks-arch');
  }

  /* ------------------------------ the hollow ----------------------------- */

  _hollow() {
    const X = -166, Z = 118;
    const N = this.noise;
    const rng = mulberry32(0x40FF);
    const geos = [];
    const YAW = -1.9;                          // mouth faces roughly south-east
    const cs = Math.cos(YAW), sn = Math.sin(YAW);
    const at = (u, v) => [X + cs * u - sn * v, Z + sn * u + cs * v];
    const g0 = this.gy(X, Z);

    // knuckle of rock: three fused lumps with a tunnel bored through the front
    const lumps = [[0, 2.5, 7.6, 8.2], [-6.4, 4.2, 5.6, 6.4], [6.0, 3.4, 5.0, 7.0]];
    for (let i = 0; i < lumps.length; i++) {
      const [u, v, r, h] = lumps[i];
      const [lx, lz] = at(u, v);
      const g = new THREE.SphereGeometry(r, 14, 10);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const y = p.getY(k);
        p.setY(k, y * (h / (2 * r)) * (y > 0 ? 1 : 0.55));
      }
      roughen(g, N, 0.85, 0.16, i * 29);
      paintRock(g, 7700 + i * 13, N);
      g.applyMatrix4(composeMat(lx, this.gy(lx, lz) + h * 0.28, lz, 0, rng() * 3, 0));
      geos.push(g.toNonIndexed());
    }
    // mouth: an arched surround built from 9 blocks so the opening is hollow
    const MW = 3.1, MH = 4.4;
    for (let i = 0; i < 11; i++) {
      const a = (i / 10) * Math.PI;
      const u = Math.cos(a) * (MW + 1.5), y = Math.sin(a) * (MH + 1.2);
      const [bx, bz] = at(u, -6.6);
      const blk = new THREE.BoxGeometry(2.4, 2.4, 3.4, 2, 2, 2);
      roughen(blk, N, 0.4, 0.4, i * 7);
      paintRock(blk, 7800 + i * 5, N);
      blk.applyMatrix4(composeMat(bx, g0 + y + 0.4, bz, 0, YAW, a - Math.PI / 2));
      geos.push(blk.toNonIndexed());
    }
    // the chamber shell behind the mouth: an inverted box so it is dark inside
    {
      const [cx, cz] = at(0, -2.0);
      const shell = new THREE.CylinderGeometry(4.2, 4.6, 5.0, 12, 2, true);
      const p = shell.attributes.position;
      for (let k = 0; k < p.count; k++) p.setZ(k, p.getZ(k) * 1.5);
      shell.computeVertexNormals();
      shell.scale(-1, 1, 1);                   // flip inward-facing
      roughen(shell, N, 0.35, 0.4, 5);
      paintRock(shell, 7900, N);
      shell.applyMatrix4(composeMat(cx, g0 + 2.1, cz, 0, YAW, 0));
      geos.push(shell.toNonIndexed());
      // back wall
      const back = new THREE.BoxGeometry(9.5, 6.0, 1.6, 3, 3, 1);
      roughen(back, N, 0.5, 0.3, 11);
      paintRock(back, 7910, N);
      const [wx, wz] = at(0, 2.6);
      back.applyMatrix4(composeMat(wx, g0 + 2.4, wz, 0, YAW, 0));
      geos.push(back.toNonIndexed());
    }
    // a shelf ledge above the mouth
    {
      const [sx, sz] = at(0, -6.9);
      this._ledge('hollow-shelf', sx, g0 + MH + 1.9, sz, -sn, cs, 5.0, g0 + MH + 2.0);
    }
    // spill of boulders at the mouth
    for (let i = 0; i < 14; i++) {
      const u = (rng() - 0.5) * 12, v = -8.5 - rng() * 5;
      const [tx, tz] = at(u, v);
      const s = 0.3 + rng() * rng() * 1.5;
      const g = new THREE.DodecahedronGeometry(s, 0);
      paintRock(g, 7950 + i, N);
      g.applyMatrix4(composeMat(tx, this.gy(tx, tz) + s * 0.4, tz, rng(), rng() * 6.28, rng()));
      geos.push(g.toNonIndexed());
    }
    this._push('cave', geos, 'rockworks-hollow');
    const [mx, mz] = at(0, -6.6);
    this.hollowMouth = new THREE.Vector3(mx, g0, mz);
  }

  /* ------------------------------ published ------------------------------ */

  /** Collider descriptors for `props.js` to hand to `ctx.collision.register`. */
  colliders() {
    return this.parts.map(({ kind, mesh, camera }) => ({
      kind, object: mesh, blocking: true, occluder: true, camera,
    }));
  }

  /** Nearest climbable ledge to a point, or null. Allocation-free. */
  ledgeNear(x, y, z, maxDist = 2.5) {
    let best = null, bestD = maxDist * maxDist;
    for (let i = 0; i < this.ledges.length; i++) {
      const L = this.ledges[i];
      // distance to the finite edge segment
      const ax = L.from.x, az = L.from.z, bx = L.to.x, bz = L.to.z;
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz || 1;
      let t = ((x - ax) * dx + (z - az) * dz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t, pz = az + dz * t;
      const d = (px - x) * (px - x) + (pz - z) * (pz - z) + (L.y - y) * (L.y - y);
      if (d < bestD) { bestD = d; best = L; }
    }
    return best;
  }
}
