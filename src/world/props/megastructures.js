import * as THREE from 'three';
import {
  SimplexNoise, mulberry32, composeMat, paintRust, paintConcrete, tint,
  rustTube, iBeam, truss, bake, materials, roughen,
} from './kit.js';

/** Build-time scratch colours — every builder here runs once, in the ctor. */
const _col = new THREE.Color();
const _col2 = new THREE.Color();
const _col3 = new THREE.Color();

/**
 * ROUND 4 — `world-11` (5 m ruins, no landmarks) and `V34-midground`.
 *
 * Five old-world megastructures, 30–52 m tall, one on each cardinal bearing
 * out of the hunter camp so no vista is a bald meadow:
 *
 *   NW  THE SPAN     a pre-Fall viaduct across the dried river, one span down
 *   E   THE CORE     the sheared concrete core of a tower, leaning 7°
 *   S   THE HANGAR   an arched steel hangar stripped to its rib cage
 *   W   THE MAST     a 46 m lattice relay mast, its twin felled beside it
 *   SW  THE PYLONS   three transmission towers marching toward the rim
 *   W   THE STACK    a 34 m hyperbolic cooling tower, one flank collapsed
 *
 * THE STACK was added after gate `V34-midground` measured the west bearing at
 * ZERO landmark rays: the relay mast is 250 m out and under a degree wide, and
 * a ridge 60-120 m west of the camp hides everything shorter than 27 m at
 * 200 m (measured on port 5211). A cooling tower is the one old-world
 * silhouette that is unmistakable at that range from any angle, and at 34 m on
 * ground at y=1.5 it clears that ridge with 8 m to spare.
 *
 * Siting rules (measured on port 5211 before a line was written): every site
 * is ≥ 54 m from the nearest machine patrol anchor, off the worn paths, on
 * ground under 0.3 gradient, and — where a bald footprint mattered — in one of
 * the tree-free bands `vegetation.js` already leaves (the dried channel, the
 * high rock, the rim skirts). Nothing here edits another lane's file.
 *
 * DRAW BUDGET: one merged mesh per site per material family (metal / matte),
 * both materials shared across every site, so a vista that sees two structures
 * pays two draws and the far three are frustum-culled. Every site sits past the
 * 120 m shadow-caster clamp `world-light` publishes, so none of them costs a
 * shadow draw from the camp either.
 *
 * COLLISION: these meshes live under the `world-props` group, which
 * `installSpatial` seeds per-mesh into three-mesh-bvh colliders that are
 * blocking + occluding + camera — geometrically exact, and free. `SITES` is
 * exported so `props.js` can publish the landmark table and the gate can probe
 * a known point inside each structure.
 */

/** Published landmark table — `ctx.props.landmarks` and gate A61/V34 read this. */
export const SITES = [
  { id: 'span', name: 'The Span', x: -102, z: 165, height: 30, bearing: 'NW' },
  { id: 'core', name: 'The Core', x: 235, z: 105, height: 52, bearing: 'E' },
  { id: 'hangar', name: 'The Hangar', x: 85, z: -198, height: 33, bearing: 'S' },
  { id: 'mast', name: 'The Relay Mast', x: -250, z: 15, height: 46, bearing: 'W' },
  { id: 'pylons', name: 'The Pylon Line', x: -155, z: -182, height: 31, bearing: 'SW' },
  { id: 'stack', name: 'The Cooling Stack', x: -198, z: -28, height: 34, bearing: 'W' },
  { id: 'tanks', name: 'The Tank Farm', x: -34, z: -196, height: 26, bearing: 'S' },
  { id: 'dish', name: 'The Ground Station', x: -205, z: 30, height: 28, bearing: 'W' },
  { id: 'gantry', name: 'The Container Yard', x: 185, z: 5, height: 30, bearing: 'E' },
];

export function buildMegastructures(ctx, group) {
  const b = new Builder(ctx, group);
  b.span();
  b.core();
  b.hangar();
  b.mast();
  b.pylons();
  b.stack();
  b.tanks();
  b.dish();
  b.gantry();
  return b.meshes;
}

class Builder {
  constructor(ctx, group) {
    this.ctx = ctx;
    this.group = group;
    this.noise = new SimplexNoise(90210);
    this.mats = materials();
    this.meshes = [];
  }

  gy(x, z) { return this.ctx.terrain.getHeight(x, z); }

  /** Close one site: merge its buckets, name and park them under the group. */
  _close(id, metal, matte) {
    const m1 = bake(metal, this.mats.metal, { name: `props-mega-${id}-metal` });
    const m2 = bake(matte, this.mats.matte, { name: `props-mega-${id}-concrete` });
    for (const m of [m1, m2]) {
      if (!m) continue;
      this.group.add(m);
      this.meshes.push(m);
    }
  }

  /* ===================================================================== */
  /*  THE SPAN — collapsed viaduct across the dried river (NW, 30 m)        */
  /* ===================================================================== */

  span() {
    const metal = [], matte = [];
    const rng = mulberry32(0x5A11);
    const N = this.noise;
    const Z = 165;                     // the crossing runs along +X at this z
    const DECK = 24.5;                 // deck top above the channel floor
    const bedY = this.gy(-102, Z);
    const deckY = bedY + DECK;
    const W = 9.0;                     // carriageway width
    // Pier stations. The two central piers carry the span that came down.
    const piers = [-141, -119, -96, -73, -50];

    for (let i = 0; i < piers.length; i++) {
      const px = piers[i];
      const g0 = this.gy(px, Z);
      const broken = i === 2;          // the pier that sheared
      const top = broken ? g0 + DECK * 0.42 : deckY - 2.1;
      const H = top - g0 + 1.2;
      // tapered box column, roughened so it does not read as a primitive
      const col = new THREE.BoxGeometry(4.4, H, 3.4, 2, 8, 2);
      const p = col.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const f = (p.getY(v) + H / 2) / H;                   // 0 base .. 1 top
        p.setX(v, p.getX(v) * (1 - f * 0.32));
        p.setZ(v, p.getZ(v) * (1 - f * 0.22));
        if (broken && f > 0.86) {                            // jagged shear
          p.setY(v, p.getY(v) - (0.4 + rng() * 1.9));
          p.setX(v, p.getX(v) * (0.7 + rng() * 0.35));
        }
      }
      col.computeVertexNormals();
      paintConcrete(col, 300 + i * 7, N, 3.4);
      col.applyMatrix4(composeMat(px, g0 - 1.2 + H / 2, Z, 0, 0.02 * (i - 2), 0));
      matte.push(col.toNonIndexed());

      // pier cap (the hammerhead the deck sits on)
      if (!broken) {
        const cap = new THREE.BoxGeometry(5.6, 1.5, W + 1.2, 2, 1, 2);
        paintConcrete(cap, 340 + i, N, -9);
        cap.applyMatrix4(composeMat(px, top + 0.75, Z));
        matte.push(cap.toNonIndexed());
      }
      // exposed rebar cage at the broken crown
      if (broken) {
        for (let r = 0; r < 9; r++) {
          const a = (r / 9) * Math.PI * 2;
          const rx = px + Math.cos(a) * 1.5, rz = Z + Math.sin(a) * 1.1;
          rustTube(metal, [rx, top - 0.4, rz],
            [rx + (rng() - 0.5) * 0.6, top + 1.4 + rng() * 1.6, rz + (rng() - 0.5) * 0.6],
            0.05, 0.04, 700 + r, N, 4);
        }
      }
    }

    // deck segments between the standing piers; the 2nd bay is missing
    const bays = [[piers[0] - 7, piers[1]], [piers[1], piers[2]], [piers[3], piers[4]], [piers[4], piers[4] + 8]];
    for (let i = 0; i < bays.length; i++) {
      const [x0, x1] = bays[i];
      const L = x1 - x0;
      const slab = new THREE.BoxGeometry(L, 1.35, W, Math.max(2, L / 5 | 0), 1, 3);
      const p = slab.attributes.position;
      // shear the free ends into a broken edge
      for (let v = 0; v < p.count; v++) {
        const fx = p.getX(v) / L + 0.5;
        const free = (i === 1 && fx > 0.85) || (i === 2 && fx < 0.15) || (i === 3 && fx > 0.85) || (i === 0 && fx < 0.15);
        if (free) {
          const jag = (Math.sin(p.getZ(v) * 2.3 + i) * 0.5 + 0.5) * 1.6 + rng() * 0.5;
          p.setX(v, p.getX(v) + (fx > 0.5 ? -jag : jag));
          p.setY(v, p.getY(v) + (rng() - 0.5) * 0.35);
        }
      }
      slab.computeVertexNormals();
      paintConcrete(slab, 400 + i * 11, N, -9);
      slab.applyMatrix4(composeMat((x0 + x1) / 2, deckY - 0.7, Z));
      matte.push(slab.toNonIndexed());

      // parapets
      for (const s of [-1, 1]) {
        const par = new THREE.BoxGeometry(L * 0.97, 1.05, 0.42, Math.max(2, L / 6 | 0), 1, 1);
        const pp = par.attributes.position;
        for (let v = 0; v < pp.count; v++) {
          // bite chunks out of the parapet so it is not an extruded rectangle
          const u = pp.getX(v) / L + 0.5;
          const bite = Math.max(0, N.noise2D(u * 6.5 + i * 3, s)) * 0.9;
          if (pp.getY(v) > 0) pp.setY(v, pp.getY(v) - bite);
        }
        par.computeVertexNormals();
        paintConcrete(par, 460 + i * 5 + s, N, -9);
        par.applyMatrix4(composeMat((x0 + x1) / 2, deckY + 0.5, Z + s * (W / 2 - 0.2)));
        matte.push(par.toNonIndexed());
      }
      // steel box girders under the slab
      for (const s of [-1, 0, 1]) {
        const gir = iBeam(L, 1.0, 0.9, 0.12);
        gir.rotateZ(Math.PI / 2);
        paintRust(gir, 500 + i * 3 + s, N, 99);
        gir.applyMatrix4(composeMat((x0 + x1) / 2, deckY - 1.9, Z + s * (W / 2 - 1.4)));
        metal.push(gir.toNonIndexed());
      }
      // lamp standards along the surviving deck
      const lamps = Math.max(1, Math.round(L / 11));
      for (let k = 0; k < lamps; k++) {
        const lx = x0 + ((k + 0.5) / lamps) * L;
        const lz = Z + (k % 2 ? 1 : -1) * (W / 2 - 0.6);
        const lean = (rng() - 0.5) * 0.5;
        rustTube(metal, [lx, deckY + 1.0, lz], [lx + lean, deckY + 5.4, lz + lean * 0.5], 0.11, 0.07, 900 + k, N, 5);
        rustTube(metal, [lx + lean, deckY + 5.3, lz + lean * 0.5],
          [lx + lean * 1.4, deckY + 5.5, lz + lean * 0.5 - 1.3], 0.07, 0.05, 940 + k, N, 4);
      }
    }

    // the fallen span: a slab dropped nose-first into the channel, snapped
    {
      const L = 21;
      const slab = new THREE.BoxGeometry(L, 1.3, W, 8, 1, 3);
      roughen(slab, N, 0.22, 0.35, 12);
      paintConcrete(slab, 560, N, 1.4);
      slab.applyMatrix4(composeMat(
        (piers[1] + piers[2]) / 2 + 1.5, bedY + 5.2, Z + 0.6,
        0.06, 0.04, -0.72,
      ));
      matte.push(slab.toNonIndexed());
      const L2 = 12;
      const slab2 = new THREE.BoxGeometry(L2, 1.3, W * 0.92, 5, 1, 3);
      roughen(slab2, N, 0.3, 0.4, 33);
      paintConcrete(slab2, 580, N, 1.6);
      slab2.applyMatrix4(composeMat(piers[2] - 3.4, bedY + 1.0, Z - 1.4, -0.1, 0.5, 0.24));
      matte.push(slab2.toNonIndexed());
      // twisted girders spilling out of the break
      for (let i = 0; i < 7; i++) {
        const a = rng() * Math.PI * 2;
        const bx = (piers[1] + piers[2]) / 2 + (rng() - 0.5) * 16;
        const bz = Z + (rng() - 0.5) * 10;
        const by = this.gy(bx, bz);
        rustTube(metal, [bx, by + 0.3, bz],
          [bx + Math.cos(a) * (3 + rng() * 5), by + 0.4 + rng() * 3.4, bz + Math.sin(a) * (3 + rng() * 4)],
          0.16, 0.11, 620 + i, N, 5);
      }
      // rubble mounds under the break
      for (let i = 0; i < 22; i++) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * 13;
        const x = (piers[1] + piers[2]) / 2 + Math.cos(a) * d;
        const z = Z + Math.sin(a) * d * 0.7;
        const s = 0.35 + rng() * 1.5;
        const g = new THREE.BoxGeometry(s * (0.7 + rng()), s * (0.5 + rng() * 0.6), s * (0.7 + rng()));
        paintConcrete(g, 640 + i, N, -9);
        g.applyMatrix4(composeMat(x, this.gy(x, z) + s * 0.2, z, rng() * 1.2, rng() * 6.28, rng() * 1.2));
        matte.push(g.toNonIndexed());
      }
    }
    this._close('span', metal, matte);
  }

  /* ===================================================================== */
  /*  THE CORE — sheared tower core on the east shelf (E, 52 m)             */
  /* ===================================================================== */

  core() {
    const metal = [], matte = [];
    const rng = mulberry32(0xC03E);
    const N = this.noise;
    const X = 235, Z = 105;
    const g0 = this.gy(X, Z);
    const H = 52;
    const LEAN = 0.12;                 // ~7° toward the rim
    const FLOORS = 11;
    const fh = H / FLOORS;

    // Two surviving service cores + the shear wall between them. The third
    // corner is gone, which is what makes the silhouette read as a ruin
    // instead of a chimney.
    const coreBoxes = [
      { dx: -3.6, dz: -2.4, w: 5.2, d: 4.6, h: H },
      { dx: 3.8, dz: -1.6, w: 4.4, d: 4.0, h: H * 0.74 },
      { dx: 0.4, dz: 3.6, w: 8.6, d: 1.1, h: H * 0.52 },
    ];
    for (let i = 0; i < coreBoxes.length; i++) {
      const c = coreBoxes[i];
      const box = new THREE.BoxGeometry(c.w, c.h, c.d, 2, Math.round(c.h / 4), 2);
      const p = box.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const f = (p.getY(v) + c.h / 2) / c.h;
        if (f > 0.9) {                                        // torn crown
          p.setY(v, p.getY(v) - rng() * 2.6);
          p.setX(v, p.getX(v) * (0.72 + rng() * 0.4));
        }
        // window slots: pinch alternating bands inward
        if (Math.abs(p.getY(v) % fh) < fh * 0.28) p.setX(v, p.getX(v) * 0.94);
      }
      box.computeVertexNormals();
      paintConcrete(box, 1200 + i * 9, N, 3.0);
      box.applyMatrix4(composeMat(X + c.dx, g0 + c.h / 2 - 1.0, Z + c.dz, 0, 0.3, LEAN));
      matte.push(box.toNonIndexed());
    }

    // floor plates cantilevered out of the cores — the "sliced cake" read
    for (let f = 1; f < FLOORS; f++) {
      const y = g0 + f * fh;
      const shrink = 1 - f / (FLOORS + 3);
      const wide = 13.5 * shrink, deep = 10.5 * shrink;
      if (f > 6 && rng() < 0.45) continue;                     // upper floors gone
      const plate = new THREE.BoxGeometry(wide, 0.45, deep, 4, 1, 3);
      const p = plate.attributes.position;
      // bite an irregular arc out of one edge so every floor differs
      const phase = f * 1.7;
      for (let v = 0; v < p.count; v++) {
        const u = p.getX(v) / wide + 0.5, w = p.getZ(v) / deep + 0.5;
        const bite = Math.max(0, N.fbm(u * 3.1 + phase, w * 3.1 - phase, 2));
        if (u > 0.5) p.setX(v, p.getX(v) - bite * wide * 0.42);
        if (w > 0.62) p.setZ(v, p.getZ(v) - bite * deep * 0.3);
      }
      plate.computeVertexNormals();
      paintConcrete(plate, 1300 + f * 5, N, -9);
      // lean carries the plates sideways with height
      plate.applyMatrix4(composeMat(X + f * fh * LEAN * 0.98, y, Z, 0, 0.3, LEAN));
      matte.push(plate.toNonIndexed());

      // rebar fringe on the torn edge
      if (f % 2 === 0) {
        for (let r = 0; r < 5; r++) {
          const rx = X + f * fh * LEAN + wide * (0.22 + rng() * 0.24);
          const rz = Z + (rng() - 0.5) * deep * 0.7;
          rustTube(metal, [rx, y - 0.1, rz], [rx + 0.4 + rng() * 0.9, y + (rng() - 0.4) * 0.9, rz + (rng() - 0.5) * 0.7],
            0.035, 0.03, 1400 + f * 7 + r, N, 4);
        }
      }
      // perimeter columns on the lower half only
      if (f < 7) {
        for (const [cx, cz] of [[-1, -1], [-1, 1], [1, -1]]) {
          rustTube(metal, [X + cx * wide * 0.44 + f * fh * LEAN, y, Z + cz * deep * 0.42],
            [X + cx * wide * 0.44 + (f + 1) * fh * LEAN, y + fh, Z + cz * deep * 0.42],
            0.22, 0.2, 1500 + f * 11 + cx * 3 + cz, N, 5);
        }
      }
    }

    // rooftop plant: a toppled tank and a stub of lattice mast
    {
      const tank = new THREE.CylinderGeometry(1.9, 1.9, 5.2, 10, 1);
      paintRust(tank, 1600, N, 99);
      tank.applyMatrix4(composeMat(X + H * LEAN + 2.2, g0 + H * 0.76, Z - 3.4, 1.35, 0.6, 0.2));
      metal.push(tank.toNonIndexed());
      const t = truss(9.5, 1.5, 0.1, 1700, N);
      const mtx = composeMat(X + H * LEAN - 3.2, g0 + H * 0.98, Z - 2.0, 0.22, 0.4, LEAN + 0.16);
      for (const g of t) { g.applyMatrix4(mtx); metal.push(g.toNonIndexed()); }
    }

    // debris skirt
    for (let i = 0; i < 34; i++) {
      const a = rng() * Math.PI * 2, d = 6 + Math.sqrt(rng()) * 17;
      const x = X + Math.cos(a) * d, z = Z + Math.sin(a) * d;
      const s = 0.3 + rng() * rng() * 2.4;
      const g = new THREE.BoxGeometry(s * (0.8 + rng() * 0.6), s * (0.35 + rng() * 0.5), s * (0.8 + rng() * 0.6));
      paintConcrete(g, 1800 + i, N, -9);
      g.applyMatrix4(composeMat(x, this.gy(x, z) + s * 0.16, z, rng(), rng() * 6.28, rng()));
      matte.push(g.toNonIndexed());
    }
    this._close('core', metal, matte);
  }

  /* ===================================================================== */
  /*  THE HANGAR — arched steel hall stripped to its ribs (S, 33 m)         */
  /* ===================================================================== */

  hangar() {
    const metal = [], matte = [];
    const rng = mulberry32(0x4A46);
    const N = this.noise;
    const X = 85, Z = -198;
    const YAW = 0.42;
    const R = 17.5;                    // rib radius -> 33 m at the crown (+ plinth)
    const LEN = 52;
    const RIBS = 13;
    const cs = Math.cos(YAW), sn = Math.sin(YAW);
    const at = (u, v) => [X + cs * u - sn * v, Z + sn * u + cs * v]; // local->world

    // concrete plinth walls the ribs spring from
    for (const s of [-1, 1]) {
      const [wx, wz] = at(0, s * R);
      const wall = new THREE.BoxGeometry(LEN, 3.4, 1.5, 12, 1, 1);
      const p = wall.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const u = p.getX(v) / LEN + 0.5;
        const gap = Math.max(0, N.noise2D(u * 5 + s * 3, 0.5)) * 2.6;
        if (p.getY(v) > 0) p.setY(v, p.getY(v) - gap);
      }
      wall.computeVertexNormals();
      paintConcrete(wall, 2000 + s, N, 1.0);
      wall.applyMatrix4(composeMat(wx, this.gy(wx, wz) + 1.3, wz, 0, YAW, 0));
      matte.push(wall.toNonIndexed());
    }

    for (let i = 0; i < RIBS; i++) {
      const u = (i / (RIBS - 1) - 0.5) * LEN;
      const fallen = i === 4 || i === 5;
      const partial = i === 9;
      const segs = 11;
      const [ribX, ribZ] = at(u, 0);
      const baseY = this.gy(ribX, ribZ);
      if (fallen) {
        // a rib that came down and lies buckled across the floor
        for (let k = 0; k < 5; k++) {
          const a0 = (k / 5) * Math.PI, a1 = ((k + 1) / 5) * Math.PI;
          const l0 = R * Math.cos(a0) * 1.15, l1 = R * Math.cos(a1) * 1.15;
          const h0 = 0.5 + Math.sin(a0) * 1.6, h1 = 0.5 + Math.sin(a1) * 1.6;
          const [x0, z0] = at(u + (rng() - 0.5) * 2, l0);
          const [x1, z1] = at(u + (rng() - 0.5) * 2, l1);
          rustTube(metal, [x0, this.gy(x0, z0) + h0, z0], [x1, this.gy(x1, z1) + h1, z1], 0.32, 0.3, 2100 + i * 9 + k, N, 5);
        }
        continue;
      }
      const top = partial ? segs - 4 : segs;
      for (let k = 0; k < top; k++) {
        const a0 = (k / segs) * Math.PI, a1 = ((k + 1) / segs) * Math.PI;
        const [x0, z0] = at(u, R * Math.cos(a0));
        const [x1, z1] = at(u, R * Math.cos(a1));
        const y0 = baseY + 2.4 + R * Math.sin(a0) * 0.92;
        const y1 = baseY + 2.4 + R * Math.sin(a1) * 0.92;
        rustTube(metal, [x0, y0, z0], [x1, y1, z1], 0.34, 0.32, 2200 + i * 17 + k, N, 5);
      }
      // purlins tying this rib to the last one
      if (i > 0) {
        const pu = ((i - 1) / (RIBS - 1) - 0.5) * LEN;
        for (const a of [0.22, 0.5, 0.78]) {
          const ang = a * Math.PI;
          const [x0, z0] = at(u, R * Math.cos(ang));
          const [x1, z1] = at(pu, R * Math.cos(ang));
          const y = baseY + 2.4 + R * Math.sin(ang) * 0.92;
          rustTube(metal, [x0, y, z0], [x1, y, z1], 0.1, 0.1, 2300 + i * 5, N, 4);
        }
      }
    }

    // surviving roof skin: corrugated panels clinging to the south end
    for (let i = 0; i < 5; i++) {
      const u = -LEN / 2 + 1.5 + i * 3.6;
      const a0 = 0.08 + i * 0.03, a1 = a0 + 0.30 + (i % 2) * 0.06;
      const seg = 5;
      const pts = [];
      for (let k = 0; k <= seg; k++) {
        const a = THREE.MathUtils.lerp(a0, a1, k / seg) * Math.PI;
        pts.push([R * Math.cos(a), 2.4 + R * Math.sin(a) * 0.92]);
      }
      const geo = new THREE.BufferGeometry();
      const verts = [], norms = [];
      const [bx, bz] = at(u, 0);
      const baseY = this.gy(bx, bz);
      for (let k = 0; k < seg; k++) {
        const [l0, h0] = pts[k], [l1, h1] = pts[k + 1];
        const [xa, za] = at(u, l0), [xb, zb] = at(u, l1);
        const [xc, zc] = at(u + 3.3, l1), [xd, zd] = at(u + 3.3, l0);
        const quad = [
          [xa, baseY + h0, za], [xb, baseY + h1, zb], [xc, baseY + h1, zc],
          [xa, baseY + h0, za], [xc, baseY + h1, zc], [xd, baseY + h0, zd],
        ];
        for (const v of quad) { verts.push(v[0], v[1], v[2]); norms.push(0, 1, 0); }
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
      geo.computeVertexNormals();
      paintRust(geo, 2400 + i, N, 99, 1.3);
      metal.push(geo);
    }

    // the door frame at the north end, one leaf lying flat in the grass
    {
      const [fx, fz] = at(LEN / 2 + 0.6, 0);
      const fy = this.gy(fx, fz);
      for (const s of [-1, 1]) {
        const [px, pz] = at(LEN / 2 + 0.6, s * (R - 1.2));
        rustTube(metal, [px, this.gy(px, pz), pz], [px, this.gy(px, pz) + 22, pz], 0.55, 0.4, 2500 + s, N, 6);
      }
      const [lx, lz] = at(LEN / 2 + 0.4, -R + 1.2);
      const [rx, rz] = at(LEN / 2 + 0.4, R - 1.2);
      rustTube(metal, [lx, fy + 21.6, lz], [rx, fy + 21.6, rz], 0.5, 0.5, 2520, N, 6);
      const leaf = new THREE.BoxGeometry(14, 0.35, 11, 6, 1, 5);
      roughen(leaf, N, 0.35, 0.22, 9);
      paintRust(leaf, 2540, N, 99, 1.4);
      const [dx, dz] = at(LEN / 2 + 11, -4);
      leaf.applyMatrix4(composeMat(dx, this.gy(dx, dz) + 0.32, dz, 0.05, YAW + 0.3, 0.03));
      metal.push(leaf.toNonIndexed());
    }

    // floor slabs and scattered crates inside
    {
      const [cx, cz] = at(0, 0);
      const floor = new THREE.BoxGeometry(LEN * 0.82, 0.4, R * 1.5, 10, 1, 6);
      const p = floor.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const u = p.getX(v) / LEN + 0.5, w = p.getZ(v) / (R * 1.5) + 0.5;
        if (N.fbm(u * 4.2, w * 4.2, 2) > 0.18) p.setY(v, p.getY(v) - 0.34); // heaved slabs
      }
      floor.computeVertexNormals();
      paintConcrete(floor, 2600, N, 0.4);
      floor.applyMatrix4(composeMat(cx, this.gy(cx, cz) + 0.16, cz, 0, YAW, 0));
      matte.push(floor.toNonIndexed());
      for (let i = 0; i < 9; i++) {
        const u = (rng() - 0.5) * LEN * 0.7, v = (rng() - 0.5) * R * 1.2;
        const [x, z] = at(u, v);
        const s = 1.0 + rng() * 1.4;
        const g = new THREE.BoxGeometry(s * 1.5, s, s * 1.2);
        paintRust(g, 2700 + i, N, 99, 0.8);
        g.applyMatrix4(composeMat(x, this.gy(x, z) + s * 0.5, z, (rng() - 0.5) * 0.2, rng() * 6.28, (rng() - 0.5) * 0.2));
        metal.push(g.toNonIndexed());
      }
    }
    this._close('hangar', metal, matte);
  }

  /* ===================================================================== */
  /*  THE MAST — 46 m lattice relay, its twin felled beside it (W)          */
  /* ===================================================================== */

  mast() {
    const metal = [], matte = [];
    const rng = mulberry32(0x1A57);
    const N = this.noise;
    const X = -250, Z = 15;
    const g0 = this.gy(X, Z);

    // standing mast: three stacked truss sections, tapering, leaning 4°
    let y = 0;
    const sections = [[16, 4.2], [16, 3.0], [14, 1.9]];
    const lean = 0.07;
    for (let i = 0; i < sections.length; i++) {
      const [L, w] = sections[i];
      const parts = truss(L, w, 0.13 - i * 0.025, 3000 + i * 31, N);
      const m = composeMat(X + y * lean, g0 + y, Z + y * lean * 0.4, 0, 0.4, lean);
      for (const g of parts) { g.applyMatrix4(m); metal.push(g.toNonIndexed()); }
      y += L;
    }
    // dish + whip antennas at the top
    {
      const ty = g0 + 46, tx = X + 46 * lean, tz = Z + 46 * lean * 0.4;
      const dish = new THREE.SphereGeometry(2.4, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
      paintRust(dish, 3200, N, 99, 0.7);
      dish.applyMatrix4(composeMat(tx + 1.6, ty - 5.5, tz, 1.9, 0.7, 0));
      metal.push(dish.toNonIndexed());
      rustTube(metal, [tx, ty - 1, tz], [tx + 0.4, ty + 7.5, tz - 0.2], 0.09, 0.04, 3210, N, 4);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        rustTube(metal, [tx, ty - 3, tz], [tx + Math.cos(a) * 2.2, ty - 1.4, tz + Math.sin(a) * 2.2], 0.05, 0.04, 3220 + i, N, 4);
      }
      // guy cables to three ground anchors
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        const ax = X + Math.cos(a) * 26, az = Z + Math.sin(a) * 26;
        const ay = this.gy(ax, az);
        rustTube(metal, [tx, ty - 9, tz], [ax, ay + 0.4, az], 0.05, 0.05, 3230 + i, N, 3);
        const anchor = new THREE.BoxGeometry(1.6, 1.0, 1.6);
        paintConcrete(anchor, 3240 + i, N, 0.6);
        anchor.applyMatrix4(composeMat(ax, ay + 0.35, az, 0, a, 0));
        matte.push(anchor.toNonIndexed());
      }
    }

    // the felled twin: 40 m of lattice lying across the ground, kinked
    {
      const dirs = [[0.94, 0.34], [0.86, 0.51], [0.72, 0.69]];
      let cx = X + 6, cz = Z - 9, run = 0;
      for (let i = 0; i < 3; i++) {
        const [dx, dz] = dirs[i];
        const L = 14 - i;
        const w = 4.0 - i * 0.8;
        const parts = truss(L, w, 0.12 - i * 0.02, 3300 + i * 17, N);
        const yaw = Math.atan2(dx, dz);
        const gyv = this.gy(cx + dx * L * 0.5, cz + dz * L * 0.5);
        const m = composeMat(cx, gyv + w * 0.55 + 0.2, cz, Math.PI / 2, yaw, 0);
        for (const g of parts) { g.applyMatrix4(m); metal.push(g.toNonIndexed()); }
        cx += dx * L; cz += dz * L; run += L;
      }
      void run;
    }

    // equipment bunker with a blown-out door
    {
      const bx = X - 9, bz = Z + 7;
      const by = this.gy(bx, bz);
      const box = new THREE.BoxGeometry(7.5, 3.6, 5.4, 3, 2, 2);
      const p = box.attributes.position;
      for (let v = 0; v < p.count; v++) {
        if (p.getY(v) > 1.0 && p.getX(v) > 2.5) p.setY(v, p.getY(v) - rng() * 1.5);
      }
      box.computeVertexNormals();
      paintConcrete(box, 3400, N, 1.2);
      box.applyMatrix4(composeMat(bx, by + 1.5, bz, 0, 0.3, 0));
      matte.push(box.toNonIndexed());
      const roof = new THREE.BoxGeometry(8.4, 0.35, 6.2);
      paintConcrete(roof, 3410, N, -9);
      roof.applyMatrix4(composeMat(bx - 0.4, by + 3.3, bz, 0.04, 0.3, 0.05));
      matte.push(roof.toNonIndexed());
      for (let i = 0; i < 7; i++) {
        const a = rng() * Math.PI * 2, d = 4 + rng() * 7;
        const x = bx + Math.cos(a) * d, z = bz + Math.sin(a) * d;
        const s = 0.3 + rng() * 0.8;
        const g = new THREE.BoxGeometry(s, s * 0.5, s * 0.9);
        paintConcrete(g, 3420 + i, N, -9);
        g.applyMatrix4(composeMat(x, this.gy(x, z) + s * 0.2, z, rng(), rng() * 6.28, rng()));
        matte.push(g.toNonIndexed());
      }
    }
    this._close('mast', metal, matte);
  }


  /* ===================================================================== */
  /*  THE STACK — half-collapsed hyperbolic cooling tower (W, 34 m)         */
  /* ===================================================================== */

  stack() {
    const metal = [], matte = [];
    const rng = mulberry32(0x57AC);
    const N = this.noise;
    const X = -198, Z = -28;
    const g0 = this.gy(X, Z);
    const H = 34;              // rim height above the column tops
    const LEG = 6.2;           // the open air gap the shell stands on
    const SEG = 44;            // angular resolution
    const ROWS = 16;
    const THICK = 0.45;
    // hyperbolic profile: base 13.2 m, waist 8.1 m at 62 %, rim 9.9 m
    const radiusAt = (f) => {
      const yw = 0.62;
      const k = (f - yw) / 0.78;
      return 8.1 * Math.sqrt(1 + k * k * 2.62);
    };
    /** How far up this bearing survives: one flank is torn open. */
    const topAt = (a) => {
      let d = a - 2.25;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const t = Math.abs(d);
      if (t > 1.05) return 1;                       // intact
      const bite = Math.cos((t / 1.05) * Math.PI * 0.5);
      return 1 - bite * (0.52 + 0.16 * Math.sin(a * 7.1));
    };

    /* ---- the shell: outer skin, inner skin and a rim cap ---- */
    {
      const pos = [], idx = [];
      const at = (i, j, inner) => {
        const a = (i / SEG) * Math.PI * 2;
        const tf = topAt(a);
        const f = (j / ROWS) * tf;
        const r = radiusAt(f) - (inner ? THICK : 0)
          + N.fbm(Math.cos(a) * 2.2, f * 3.1, 2) * 0.28;
        const y = LEG + f * H;
        return [X + Math.cos(a) * r, g0 + y, Z + Math.sin(a) * r];
      };
      const push = (v) => { pos.push(v[0], v[1], v[2]); return pos.length / 3 - 1; };
      for (let i = 0; i < SEG; i++) {
        const i2 = (i + 1) % SEG;
        for (let j = 0; j < ROWS; j++) {
          // outer skin
          const a0 = push(at(i, j, false)), b0 = push(at(i2, j, false));
          const c0 = push(at(i2, j + 1, false)), d0 = push(at(i, j + 1, false));
          idx.push(a0, b0, c0, a0, c0, d0);
          // inner skin (reversed winding)
          const a1 = push(at(i, j, true)), b1 = push(at(i2, j, true));
          const c1 = push(at(i2, j + 1, true)), d1 = push(at(i, j + 1, true));
          idx.push(a1, c1, b1, a1, d1, c1);
        }
        // rim cap between the two skins at the top of this column
        const o = push(at(i, ROWS, false)), o2 = push(at(i2, ROWS, false));
        const n1 = push(at(i2, ROWS, true)), n2 = push(at(i, ROWS, true));
        idx.push(o, o2, n1, o, n1, n2);
      }
      const shell = new THREE.BufferGeometry();
      shell.setIndex(idx);
      shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      shell.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      shell.computeVertexNormals();
      const flat = shell.toNonIndexed();
      shell.dispose();
      // paint in LOCAL height so the moss band lands at the foot, not at y=0
      flat.translate(0, -g0, 0);
      paintConcrete(flat, 4400, N, 3.2);
      flat.translate(0, g0, 0);
      matte.push(flat);
    }

    /* ---- the column ring the shell stands on ---- */
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2;
      const a1 = ((i + 0.62) / SEG) * Math.PI * 2;
      const rb = radiusAt(0) + 1.5, rt = radiusAt(0);
      const bx = X + Math.cos(a0) * rb, bz = Z + Math.sin(a0) * rb;
      const tx = X + Math.cos(a1) * rt, tz = Z + Math.sin(a1) * rt;
      const by = this.gy(bx, bz);
      const col = new THREE.CylinderGeometry(0.34, 0.42, Math.hypot(tx - bx, LEG + g0 - by, tz - bz), 6, 1);
      paintConcrete(col, 4500 + i, N, 2.0);
      const dir = new THREE.Vector3(tx - bx, (g0 + LEG) - by, tz - bz);
      const len = dir.length();
      dir.normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      col.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3((bx + tx) / 2, (by + g0 + LEG) / 2, (bz + tz) / 2),
        q, new THREE.Vector3(1, 1, len / len)));
      matte.push(col.toNonIndexed());
    }
    // the ring beam at the column tops
    {
      const ring = new THREE.TorusGeometry(radiusAt(0) + 0.25, 0.55, 6, SEG);
      ring.rotateX(Math.PI / 2);
      paintConcrete(ring, 4600, N, -9);
      ring.applyMatrix4(composeMat(X, g0 + LEG, Z));
      matte.push(ring.toNonIndexed());
    }

    /* ---- the collapsed flank: slabs and rebar spilling to the west ---- */
    for (let i = 0; i < 16; i++) {
      const a = 2.25 + (rng() - 0.5) * 1.7;
      const d = radiusAt(0) + 2 + rng() * 22;
      const x = X + Math.cos(a) * d, z = Z + Math.sin(a) * d;
      const w = 2.5 + rng() * 6, hgt = 0.4 + rng() * 0.5;
      const slab = new THREE.BoxGeometry(w, hgt, 2.4 + rng() * 4, 3, 1, 3);
      roughen(slab, N, 0.25, 0.3, i * 7);
      paintConcrete(slab, 4700 + i, N, 0.8);
      slab.applyMatrix4(composeMat(x, this.gy(x, z) + hgt * 0.4, z,
        (rng() - 0.5) * 0.5, rng() * 6.28, (rng() - 0.5) * 0.5));
      matte.push(slab.toNonIndexed());
      if (i % 3 === 0) {
        for (let k = 0; k < 4; k++) {
          rustTube(metal, [x, this.gy(x, z) + hgt * 0.6, z],
            [x + (rng() - 0.5) * 3.4, this.gy(x, z) + 0.6 + rng() * 2.2, z + (rng() - 0.5) * 3.4],
            0.04, 0.03, 4800 + i * 5 + k, N, 4);
        }
      }
    }

    /* ---- the pump house and its pipe run, so the tower has a reason ---- */
    {
      const px = X + 21, pz = Z + 13;
      const py = this.gy(px, pz);
      const hall = new THREE.BoxGeometry(14, 6.2, 9, 5, 3, 3);
      const bp = hall.attributes.position;
      for (let v = 0; v < bp.count; v++) {
        if (bp.getY(v) > 2.0 && bp.getX(v) < -1) bp.setY(v, bp.getY(v) - rng() * 3.2);
      }
      hall.computeVertexNormals();
      paintConcrete(hall, 4900, N, 1.4);
      hall.applyMatrix4(composeMat(px, py + 2.6, pz, 0, 0.5, 0));
      matte.push(hall.toNonIndexed());
      // the pipe: a run of big rusted tube from the hall to the tower base
      let cx = px - 6, cz = pz - 3;
      for (let i = 0; i < 5; i++) {
        const nx = cx - 3.4 - rng() * 1.2, nz = cz - 2.6 - rng();
        const y0 = Math.max(this.gy(cx, cz), this.gy(nx, nz)) + 1.5;
        rustTube(metal, [cx, y0, cz], [nx, y0 - 0.15, nz], 0.85, 0.85, 4950 + i, N, 8);
        // saddle support
        const sup = new THREE.BoxGeometry(1.2, 1.6, 1.2);
        paintConcrete(sup, 4970 + i, N, 0.6);
        sup.applyMatrix4(composeMat(nx, this.gy(nx, nz) + 0.7, nz));
        matte.push(sup.toNonIndexed());
        cx = nx; cz = nz;
      }
    }
    this._close('stack', metal, matte);
  }

  /* ===================================================================== */
  /*  THE PYLONS — three transmission towers marching SW                    */
  /* ===================================================================== */

  pylons() {
    const metal = [];
    const N = this.noise;
    const stations = [
      { x: -120, z: -150, h: 31, tilt: 0.0 },
      { x: -155, z: -182, h: 30, tilt: 0.38 },
      { x: -192, z: -214, h: 29, tilt: 1.45 },   // this one is down
    ];
    const tops = [];
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      const g0 = this.gy(s.x, s.z);
      const down = s.tilt > 1.0;
      const parts = [];
      // splayed lower body + straight upper body
      const bodyL = s.h * 0.62;
      const lower = truss(bodyL, 7.0, 0.16, 3600 + i * 41, N, 5);
      // splay: scale the base outward with a per-vertex taper
      for (const g of lower) {
        const p = g.attributes.position;
        for (let v = 0; v < p.count; v++) {
          const f = THREE.MathUtils.clamp(p.getY(v) / bodyL, 0, 1);
          const k = 1 + (1 - f) * 0.75;
          p.setX(v, p.getX(v) * k); p.setZ(v, p.getZ(v) * k);
        }
        g.computeVertexNormals();
        parts.push(g);
      }
      const upper = truss(s.h - bodyL, 3.0, 0.11, 3700 + i * 29, N, 4);
      for (const g of upper) { g.translate(0, bodyL, 0); parts.push(g); }
      // cross-arms
      for (const [ay, len] of [[s.h * 0.70, 8.5], [s.h * 0.85, 7.0], [s.h * 0.98, 5.0]]) {
        for (const sgn of [-1, 1]) {
          rustTube(parts, [0, ay, 0], [0, ay + 0.9, sgn * len], 0.11, 0.07, 3800 + i * 7 + sgn, N, 4);
          rustTube(parts, [0, ay - 2.2, 0], [0, ay + 0.85, sgn * len * 0.96], 0.07, 0.05, 3810 + i * 7 + sgn, N, 4);
          // insulator string
          rustTube(parts, [0, ay + 0.85, sgn * len * 0.96], [0, ay - 0.6, sgn * len * 0.96], 0.09, 0.09, 3820 + i * 7 + sgn, N, 5);
        }
      }
      const yaw = Math.atan2(-37, -32) + Math.PI / 2;
      const m = composeMat(s.x, g0 + (down ? 3.2 : 0), s.z, 0, yaw, s.tilt);
      for (const g of parts) { g.applyMatrix4(m); metal.push(g.toNonIndexed()); }
      tops.push({ x: s.x, y: g0 + s.h * (down ? 0.25 : 0.94), z: s.z, down });
    }
    // catenary conductors between the two standing towers
    for (let k = -1; k <= 1; k++) {
      const a = tops[0], b = tops[1];
      const off = k * 7.0;
      const segs = 8;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs, t1 = (i + 1) / segs;
        const sag = (t) => Math.sin(t * Math.PI) * 3.4;
        const p0 = [a.x + (b.x - a.x) * t0 + off * 0.4, a.y + (b.y - a.y) * t0 - sag(t0) - 2, a.z + (b.z - a.z) * t0 + off];
        const p1 = [a.x + (b.x - a.x) * t1 + off * 0.4, a.y + (b.y - a.y) * t1 - sag(t1) - 2, a.z + (b.z - a.z) * t1 + off];
        rustTube(metal, p0, p1, 0.05, 0.05, 3900 + k * 11 + i, N, 3);
      }
    }
    // snapped conductors trailing from the fallen tower
    {
      const b = tops[1], rng = mulberry32(0x9911);
      for (let k = 0; k < 4; k++) {
        let px = b.x - 4 - k * 1.5, pz = b.z - 4 - k * 2.0;
        let py = b.y - 4 - k * 3;
        for (let i = 0; i < 4; i++) {
          const nx = px - 6 - rng() * 4, nz = pz - 5 - rng() * 4;
          const ny = Math.max(this.gy(nx, nz) + 0.25, py - 6 - rng() * 4);
          rustTube(metal, [px, py, pz], [nx, ny, nz], 0.045, 0.045, 3950 + k * 7 + i, N, 3);
          px = nx; pz = nz; py = ny;
        }
      }
    }
    this._close('pylons', metal, []);
  }

  /* ===================================================================== */
  /*  THE TANKS — old-world fuel farm (S, 26 m)                             */
  /* ===================================================================== */

  /**
   * WHY THIS SITE EXISTS — and it is the same lesson `stack` taught, one
   * bearing over. `V34-midground` counts landmark rays per yaw and the SOUTH
   * fan passed on 24 of them, but every one of those rays was thrown at the
   * extreme right edge of the frame by the pylon line (bearing 214 deg); the
   * hangar answers at 154 deg, the extreme LEFT edge. The centre of the south
   * vista — bearing 168 to 200 deg, the part of the frame an eye actually
   * lands on — was a bald meadow, and the contact sheet showed it. A number
   * that passes on the two frame edges is measuring the fan, not the view.
   *
   * Four riveted storage tanks at (-34, -196) put 26 m of hard cylinder across
   * bearings 176-192 deg at 205-225 m. Two reasons for tanks rather than more
   * concrete: a cylinder reads as man-made from EVERY angle (a slab does not,
   * edge-on), and rusted steel is the darkest family this lane owns, so it
   * survives the aerial haze that washes a pale lattice mast into the rim.
   *
   * Ground measured on port 5211 before a line was written: gradient 0.011,
   * 74 m from the nearest machine patrol anchor, off the worn paths, y = -1.1.
   */
  tanks() {
    const metal = [], matte = [];
    const rng = mulberry32(0x7A11);
    const N = this.noise;
    const X = -34, Z = -196;

    /**
     * One riveted tank. `tear` (radians) opens a flank centred on `tearA`, and
     * because the metal family is DoubleSide the torn shell shows its own
     * inside — which is what sells it as empty rather than solid.
     */
    const tank = (ox, oz, r, h, opts = {}) => {
      const bx = X + ox, bz = Z + oz;
      const by = this.gy(bx, bz);
      const tear = opts.tear ?? 0;
      const shell = new THREE.CylinderGeometry(
        r * 0.985, r, h, 30, Math.max(3, Math.round(h / 2.2)), true,
        (opts.tearA ?? 0) + tear * 0.5, Math.PI * 2 - tear,
      );
      // Dent the plate. A 60-year-old tank is never a clean cylinder, and the
      // dents are what catch a rim light at 200 m.
      const p = shell.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const px = p.getX(v), py = p.getY(v), pz = p.getZ(v);
        const k = 1 + N.fbm(px * 0.17 + ox, py * 0.24 - pz * 0.11, 3) * 0.42 / r;
        p.setX(v, px * k); p.setZ(v, pz * k);
      }
      shell.computeVertexNormals();
      paintRust(shell, 7100 + Math.abs(ox) * 3 + Math.abs(oz), N, -h / 2 + 3.4);
      shell.applyMatrix4(composeMat(bx, by + h / 2, bz, 0, opts.yaw ?? 0, 0));
      metal.push(shell.toNonIndexed());

      // wind girders: the two ribs that stop a tall shell buckling
      for (const f of [0.42, 0.78]) {
        const ring = new THREE.TorusGeometry(r * 1.012, 0.16, 5, 26);
        ring.rotateX(Math.PI / 2);
        paintRust(ring, 7200 + f * 100 + ox, N, -9);
        ring.applyMatrix4(composeMat(bx, by + h * f, bz));
        metal.push(ring.toNonIndexed());
      }

      // roof: a shallow cone, caved into the shell where `cave` says so
      if (!opts.roofless) {
        const roof = new THREE.ConeGeometry(r * 1.03, r * (opts.cave ? 0.05 : 0.2), 30, 3);
        const rp = roof.attributes.position;
        if (opts.cave) {
          for (let v = 0; v < rp.count; v++) {
            const d = Math.hypot(rp.getX(v), rp.getZ(v)) / r;
            rp.setY(v, rp.getY(v) - (1 - d) * (1 - d) * r * 0.85 - rng() * 0.3);
          }
        }
        roof.computeVertexNormals();
        paintRust(roof, 7300 + ox, N, -9, 0.8);
        roof.applyMatrix4(composeMat(bx, by + h + r * (opts.cave ? 0.01 : 0.09), bz));
        metal.push(roof.toNonIndexed());
      }

      // spiral stair + its cage, the detail that gives the cylinder a scale
      if (opts.stair) {
        const turns = h / 9;
        const steps = Math.round(h / 0.6);
        for (let i = 0; i < steps; i++) {
          const f = i / steps;
          const a = (opts.stairA ?? 0) + f * turns * Math.PI * 2;
          const tx = bx + Math.cos(a) * (r + 0.65), tz = bz + Math.sin(a) * (r + 0.65);
          const step = new THREE.BoxGeometry(1.15, 0.07, 0.42);
          paintRust(step, 7400 + i, N, -9, 0.6);
          step.applyMatrix4(composeMat(tx, by + f * h + 0.4, tz, 0, -a, 0));
          metal.push(step.toNonIndexed());
          if (i % 4 === 0) {
            rustTube(metal, [tx, by + f * h + 0.4, tz], [tx, by + f * h + 1.4, tz], 0.045, 0.04, 7450 + i, N, 4);
          }
        }
      }

      // a concrete ring foundation, so it is standing on something
      const pad = new THREE.CylinderGeometry(r + 0.9, r + 1.3, 0.8, 24, 1);
      paintConcrete(pad, 7500 + ox, N, 0.5);
      pad.applyMatrix4(composeMat(bx, by + 0.2, bz));
      matte.push(pad.toNonIndexed());
      return { x: bx, y: by, z: bz, r, h };
    };

    const t = [
      tank(-19, -7, 9.6, 26, { stair: true, stairA: 1.1 }),
      tank(3, 6, 8.8, 23, { tear: 0.92, tearA: 0.6, cave: true }),
      tank(21, -9, 7.6, 18.5, { cave: true, yaw: 0.4 }),
      tank(-4, 24, 6.9, 14, { roofless: true, yaw: 0.9 }),
    ];

    /* ---- the fourth tank came off its ring and lies on its side ---- */
    {
      const bx = X - 18, bz = Z + 22;
      const by = this.gy(bx, bz);
      const R = 6.6, L = 24;
      const lying = new THREE.CylinderGeometry(R, R * 0.96, L, 26, 12, true);
      const p = lying.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const px = p.getX(v), pz = p.getZ(v);
        // crushed flat along the face that took the ground
        const crush = pz < 0 ? 1 - Math.min(0.55, (-pz / R) * 0.55) : 1;
        p.setX(v, px * (1 + N.fbm(px * 0.2, p.getY(v) * 0.2, 2) * 0.5 / R));
        p.setZ(v, pz * crush);
      }
      lying.computeVertexNormals();
      paintRust(lying, 7600, N, -R * 0.2);
      lying.applyMatrix4(composeMat(bx, by + R * 0.78, bz, Math.PI / 2, 0.75, 0.06));
      metal.push(lying.toNonIndexed());
      // the torn end cap, peeled back
      for (let i = 0; i < 5; i++) {
        const a = -0.6 + i * 0.55;
        const petal = new THREE.BoxGeometry(3.4, 0.09, 2.6, 3, 1, 2);
        paintRust(petal, 7620 + i, N, -9, 1);
        const ex = bx + Math.sin(0.75) * (L / 2 + 1.4), ez = bz + Math.cos(0.75) * (L / 2 + 1.4);
        petal.applyMatrix4(composeMat(
          ex + Math.cos(a) * 2.6, by + R * 0.8 + Math.sin(a) * 3.2, ez + Math.sin(a) * 1.4,
          a * 0.8, 0.75, 0.5 + i * 0.2,
        ));
        metal.push(petal.toNonIndexed());
      }
    }

    /* ---- containment berm: the low wall that rings the whole farm ---- */
    {
      const SEG = 46, RB = 40;
      for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        // the west arc is breached where the lying tank went through it
        if (a > 3.05 && a < 3.95) continue;
        const wx = X + Math.cos(a) * RB, wz = Z + Math.sin(a) * (RB * 0.82);
        const wy = this.gy(wx, wz);
        const hgt = 2.4 + N.fbm(wx * 0.1, wz * 0.1, 2) * 0.5;
        const seg = new THREE.BoxGeometry(RB * 0.14, hgt, 1.1, 2, 2, 1);
        paintConcrete(seg, 7700 + i, N, hgt * 0.35);
        seg.applyMatrix4(composeMat(wx, wy + hgt * 0.42, wz, 0, -a + Math.PI / 2, 0));
        matte.push(seg.toNonIndexed());
      }
    }

    /* ---- pipe rack: the run that ties the farm together ---- */
    {
      const nodes = [
        [t[0].x, t[0].z], [t[1].x, t[1].z], [t[2].x, t[2].z], [X + 30, Z + 18],
      ];
      for (let i = 0; i < nodes.length - 1; i++) {
        const [ax, az] = nodes[i], [bx2, bz2] = nodes[i + 1];
        const steps = 4;
        for (let k = 0; k < steps; k++) {
          const f0 = k / steps, f1 = (k + 1) / steps;
          const x0 = ax + (bx2 - ax) * f0, z0 = az + (bz2 - az) * f0;
          const x1 = ax + (bx2 - ax) * f1, z1 = az + (bz2 - az) * f1;
          const y0 = Math.max(this.gy(x0, z0), this.gy(x1, z1)) + 3.6;
          for (const off of [-0.55, 0.55]) {
            rustTube(metal, [x0, y0 + off * 0.4, z0 + off], [x1, y0 + off * 0.4, z1 + off],
              0.42, 0.42, 7800 + i * 13 + k, N, 6);
          }
          // trestle
          const ty = this.gy(x1, z1);
          for (const off of [-1.1, 1.1]) {
            rustTube(metal, [x1 + off * 0.3, ty, z1 + off], [x1 + off * 0.3, y0 + 0.4, z1 + off],
              0.13, 0.11, 7850 + i * 13 + k + (off > 0 ? 1 : 0), N, 5);
          }
          rustTube(metal, [x1 - 0.33, y0 + 0.5, z1 - 1.1], [x1 + 0.33, y0 + 0.5, z1 + 1.1],
            0.1, 0.1, 7880 + i * 13 + k, N, 4);
        }
      }
    }

    /* ---- the pump house, and rubble the berm shed ---- */
    {
      const px = X + 31, pz = Z + 20;
      const py = this.gy(px, pz);
      const hall = new THREE.BoxGeometry(11, 5.4, 7.5, 4, 3, 3);
      const bp = hall.attributes.position;
      for (let v = 0; v < bp.count; v++) {
        if (bp.getY(v) > 1.6 && bp.getZ(v) > 1.2) bp.setY(v, bp.getY(v) - rng() * 2.6);
      }
      hall.computeVertexNormals();
      paintConcrete(hall, 7900, N, 1.3);
      hall.applyMatrix4(composeMat(px, py + 2.3, pz, 0, -0.4, 0));
      matte.push(hall.toNonIndexed());
      for (let i = 0; i < 14; i++) {
        const a = rng() * Math.PI * 2, d = 6 + rng() * 30;
        const x = X + Math.cos(a) * d, z = Z + Math.sin(a) * d * 0.85;
        const s = 0.5 + rng() * 1.6;
        const g = new THREE.BoxGeometry(s, s * 0.42, s * 0.8, 2, 1, 2);
        roughen(g, N, 0.12, 0.6, i * 5);
        paintConcrete(g, 7950 + i, N, 0.5);
        g.applyMatrix4(composeMat(x, this.gy(x, z) + s * 0.16, z, rng() * 0.5, rng() * 6.28, rng() * 0.5));
        matte.push(g.toNonIndexed());
      }
    }
    this._close('tanks', metal, matte);
  }

  /* ===================================================================== */
  /*  THE DISH — the relay's ground station (W, 28 m)                       */
  /* ===================================================================== */

  /**
   * The west bearing has a landmark at dead centre — the 46 m relay mast at
   * (-250, 15), bearing 269 deg — and it may as well not be there. A lattice
   * tower is under a degree wide at 230 m and its members are 26 cm across;
   * the aerial haze eats it whole, which is exactly the failure `stack` was
   * added for, except `stack` sits at bearing 255 deg and so answers the LEFT
   * edge of the west frame, not its middle.
   *
   * A 22 m parabolic dish is the opposite kind of object: one continuous
   * curved surface, self-shadowing, and it holds a hard edge against the sky
   * from any angle. Parked at (-205, 30) it lands at bearing 273 deg and 185 m
   * — the middle of the west fan and the near end of the 150-300 m band, so it
   * reads at the size a landmark should.
   *
   * Ground measured on port 5211: gradient 0.033, 67 m from the nearest patrol
   * anchor, 58 m clear of the cooling stack, y = 2.3.
   */
  dish() {
    const metal = [], matte = [];
    const rng = mulberry32(0x0D15);
    const N = this.noise;
    const X = -205, Z = 30;
    const g0 = this.gy(X, Z);
    const PED = 8.2;                       // pedestal height
    const AZ = 0.95;                       // it died pointing north-east
    const EL = 0.62;                       // 35 deg above the horizon

    /**
     * A paraboloid of revolution as a single open surface. Built once in local
     * space with the axis along +Y, then swung into azimuth/elevation, so the
     * geometry does not care where it ends up. Two skins would double the cost
     * for nothing — the metal family is DoubleSide, so the back of the dish is
     * the same triangles seen from behind, which is also physically what a
     * spun-aluminium reflector is.
     */
    const paraboloid = (R, depth, RINGS, SEG) => {
      const pos = [], idx = [];
      const at = (ri, si) => {
        const rad = (ri / RINGS) * R;
        const a = (si / SEG) * Math.PI * 2;
        const y = depth * (rad / R) * (rad / R);
        return [Math.cos(a) * rad, y, Math.sin(a) * rad];
      };
      for (let ri = 0; ri <= RINGS; ri++) {
        for (let si = 0; si < SEG; si++) pos.push(...at(ri, si));
      }
      const id = (ri, si) => ri * SEG + (si % SEG);
      for (let ri = 0; ri < RINGS; ri++) {
        for (let si = 0; si < SEG; si++) {
          idx.push(id(ri, si), id(ri + 1, si), id(ri + 1, si + 1));
          idx.push(id(ri, si), id(ri + 1, si + 1), id(ri, si + 1));
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setIndex(idx);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      geo.computeVertexNormals();
      const flat = geo.toNonIndexed();
      geo.dispose();
      return flat;
    };

    /* ---- the reflector, its rim, its ribs and the feed at the focus ---- */
    {
      const R = 11.0, D = 3.3;
      const face = paraboloid(R, D, 9, 40);
      // buckle two panels: something heavy came through the dish
      const fp = face.attributes.position;
      for (let v = 0; v < fp.count; v++) {
        const px = fp.getX(v), pz = fp.getZ(v);
        const a = Math.atan2(pz, px);
        if (a > 1.75 && a < 2.55 && Math.hypot(px, pz) > R * 0.55) {
          fp.setY(v, fp.getY(v) - 1.1 - rng() * 1.4);
        }
      }
      face.computeVertexNormals();
      paintRust(face, 8100, N, -99, 0.55);
      const swing = new THREE.Matrix4().multiplyMatrices(
        composeMat(X, g0 + PED + 3.4, Z, 0, AZ, 0),
        composeMat(0, 0, 0, -Math.PI / 2 + EL, 0, 0),
      );
      face.applyMatrix4(swing);
      metal.push(face);

      const rim = new THREE.TorusGeometry(R, 0.26, 6, 44);
      rim.rotateX(Math.PI / 2);
      rim.translate(0, D, 0);
      paintRust(rim, 8110, N, -99, 0.9);
      rim.applyMatrix4(swing);
      metal.push(rim.toNonIndexed());

      /**
       * Radial ribs on the BACK of the reflector. The local paraboloid opens
       * toward +Y (vertex at y=0, rim at y=D), so "behind" is the -Y side: the
       * first pass put them at +0.28 D and they showed up as a wheel of spokes
       * lying INSIDE the bowl, which is the one place a rib never is.
       */
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const rib = new THREE.BoxGeometry(R * 0.98, 0.34, 0.1, 8, 1, 1);
        paintRust(rib, 8120 + i, N, -99, 0.9);
        rib.applyMatrix4(new THREE.Matrix4().multiplyMatrices(
          swing, composeMat(Math.cos(a) * R * 0.5, D * 0.25 - 0.42, Math.sin(a) * R * 0.5, 0, -a, -0.32),
        ));
        metal.push(rib.toNonIndexed());
      }
      // the hoop that ties the ribs together, also on the back
      for (const f of [0.44, 0.82]) {
        const hoop = new THREE.TorusGeometry(R * f, 0.14, 5, 30);
        hoop.rotateX(Math.PI / 2);
        hoop.translate(0, D * f * f - 0.42, 0);
        paintRust(hoop, 8130 + f * 100, N, -99, 0.9);
        hoop.applyMatrix4(swing);
        metal.push(hoop.toNonIndexed());
      }

      // quadripod to the feed horn at the focus
      const F = R * R / (4 * D);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.78;
        const legA = [Math.cos(a) * R * 0.93, D * 0.86, Math.sin(a) * R * 0.93];
        const legB = [0, F, 0];
        const leg = new THREE.CylinderGeometry(0.09, 0.11,
          Math.hypot(legA[0], legA[1] - F, legA[2]), 5, 1);
        paintRust(leg, 8140 + i, N, -99, 0.8);
        const dir = new THREE.Vector3(legB[0] - legA[0], legB[1] - legA[1], legB[2] - legA[2]).normalize();
        leg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(swing, new THREE.Matrix4().compose(
          new THREE.Vector3((legA[0] + legB[0]) / 2, (legA[1] + legB[1]) / 2, (legA[2] + legB[2]) / 2),
          new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
          new THREE.Vector3(1, 1, 1),
        )));
        metal.push(leg.toNonIndexed());
      }
      const horn = new THREE.ConeGeometry(0.8, 2.2, 12, 1);
      paintRust(horn, 8160, N, -99, 0.7);
      horn.applyMatrix4(new THREE.Matrix4().multiplyMatrices(swing, composeMat(0, F - 1.1, 0, Math.PI, 0, 0)));
      metal.push(horn.toNonIndexed());
    }

    /* ---- the yoke and elevation bearings that hold the dish up ---- */
    for (const sgn of [-1, 1]) {
      const ax = X + Math.cos(AZ + Math.PI / 2) * 4.4 * sgn;
      const az = Z + Math.sin(AZ + Math.PI / 2) * 4.4 * sgn;
      rustTube(metal, [ax, g0 + PED - 1.6, az], [ax, g0 + PED + 3.4, az], 0.55, 0.42, 8200 + sgn, N, 8);
      const brg = new THREE.CylinderGeometry(1.05, 1.05, 1.5, 12, 1);
      brg.rotateZ(Math.PI / 2);
      paintRust(brg, 8210 + sgn, N, -99, 0.9);
      brg.applyMatrix4(composeMat(ax, g0 + PED + 3.4, az, 0, AZ, 0));
      metal.push(brg.toNonIndexed());
    }

    /* ---- the pedestal: a concrete drum on a plinth ---- */
    {
      const drum = new THREE.CylinderGeometry(3.3, 4.1, PED, 18, 5);
      paintConcrete(drum, 8300, N, -PED / 2 + 2.6);
      drum.applyMatrix4(composeMat(X, g0 + PED / 2, Z));
      matte.push(drum.toNonIndexed());
      const plinth = new THREE.CylinderGeometry(5.6, 6.4, 1.5, 20, 1);
      paintConcrete(plinth, 8310, N, 0.9);
      plinth.applyMatrix4(composeMat(X, g0 + 0.6, Z));
      matte.push(plinth.toNonIndexed());
      // the azimuth rail the drum used to turn on
      const rail = new THREE.TorusGeometry(5.0, 0.16, 5, 30);
      rail.rotateX(Math.PI / 2);
      paintRust(rail, 8320, N, -99, 1);
      rail.applyMatrix4(composeMat(X, g0 + 1.4, Z));
      metal.push(rail.toNonIndexed());
      // cable gallery running out to the hall
      let cx = X + 5.2, cz = Z + 2.0;
      for (let i = 0; i < 6; i++) {
        const nx = cx + 3.6, nz = cz + 1.5 + rng() * 0.6;
        const y = Math.max(this.gy(cx, cz), this.gy(nx, nz)) + 1.35;
        rustTube(metal, [cx, y, cz], [nx, y - 0.08, nz], 0.3, 0.3, 8340 + i, N, 6);
        rustTube(metal, [nx, this.gy(nx, nz), nz], [nx, y, nz], 0.1, 0.09, 8360 + i, N, 4);
        cx = nx; cz = nz;
      }
    }

    /* ---- the control hall, roof half gone ---- */
    {
      const hx = X + 26, hz = Z + 12;
      const hy = this.gy(hx, hz);
      const hall = new THREE.BoxGeometry(19, 6.6, 10.5, 7, 3, 4);
      const hp = hall.attributes.position;
      for (let v = 0; v < hp.count; v++) {
        if (hp.getY(v) > 2.0 && hp.getX(v) > 1.5) hp.setY(v, hp.getY(v) - 1.2 - rng() * 3.0);
      }
      hall.computeVertexNormals();
      paintConcrete(hall, 8400, N, 1.6);
      hall.applyMatrix4(composeMat(hx, hy + 2.9, hz, 0, -0.28, 0));
      matte.push(hall.toNonIndexed());
      const slab = new THREE.BoxGeometry(11.5, 0.4, 11.2, 5, 1, 4);
      roughen(slab, N, 0.14, 0.4, 3);
      paintConcrete(slab, 8410, N, -99);
      slab.applyMatrix4(composeMat(hx - 3.6, hy + 6.2, hz, 0.03, -0.28, 0.06));
      matte.push(slab.toNonIndexed());
      // roof slabs that slid off, leaning on the wall
      for (let i = 0; i < 3; i++) {
        const s = new THREE.BoxGeometry(6.5 - i, 0.36, 4.2, 4, 1, 2);
        roughen(s, N, 0.12, 0.5, i * 9);
        paintConcrete(s, 8420 + i, N, 1.0);
        const a = -0.28 + (i - 1) * 0.5;
        s.applyMatrix4(composeMat(
          hx + 9 + i * 1.5, hy + 2.6 - i * 0.5, hz + (i - 1) * 4.5, 0.12, a, 0.85 - i * 0.16,
        ));
        matte.push(s.toNonIndexed());
      }
    }

    /* ---- two smaller dishes, down and half-buried ---- */
    for (let i = 0; i < 2; i++) {
      const a = 2.3 + i * 1.35;
      const dx = X + Math.cos(a) * (17 + i * 6), dz = Z + Math.sin(a) * (15 + i * 8);
      const dy = this.gy(dx, dz);
      const small = paraboloid(3.4 + i * 0.7, 1.0, 5, 22);
      paintRust(small, 8500 + i, N, -99, 1);
      small.applyMatrix4(composeMat(dx, dy + 0.9 + i * 0.2, dz, 1.15 + i * 0.35, a, 0.4));
      metal.push(small);
      const mount = new THREE.BoxGeometry(1.4, 1.1, 1.4);
      paintConcrete(mount, 8520 + i, N, 0.7);
      mount.applyMatrix4(composeMat(dx + 1.6, dy + 0.4, dz - 1.2, 0, a, 0.2));
      matte.push(mount.toNonIndexed());
    }
    this._close('dish', metal, matte);
  }

  /* ===================================================================== */
  /*  THE GANTRY — container yard and its portal crane (E, 30 m)            */
  /* ===================================================================== */

  /**
   * The east bearing was the last one whose landmark was a LIE OF CATEGORY.
   * `V34-midground` reported it green on 37 rays and named the thing they hit:
   * `rockworks-stacks` — a cliff. The audit asks for "a man-made or landmark
   * silhouette", and a cliff band is scenery this lane happens to own, not a
   * ruin; the only built thing in that frame was the 14 m lookout at 85 m,
   * which is inside the band's near edge and reads as camp furniture.
   *
   * A portal crane is the right answer for east specifically. The Core already
   * stands at bearing 72 deg and is a pure vertical, so a second tower there
   * would read as more of the same at a glance. A gantry is horizontal — a
   * 44 m boom on two splayed portals — and the container stacks under it are
   * the only saturated colour in a valley of ochre and rust, which is what
   * makes the eye stop at 200 m through this much haze.
   *
   * Ground measured on port 5211: gradient 0.099, 54 m from the nearest patrol
   * anchor, 112 m clear of the Core, bearing 94 deg, 206 m from the vista.
   */
  gantry() {
    const metal = [], matte = [];
    const rng = mulberry32(0x6A47);
    const N = this.noise;
    const X = 185, Z = 5;
    const g0 = this.gy(X, Z);
    const YAW = -0.34;                      // the yard runs roughly NNE
    const cs = Math.cos(YAW), sn = Math.sin(YAW);
    /** Yard-local (u along the rails, v across) to world. */
    const W = (u, v) => [X + u * cs - v * sn, Z + u * sn + v * cs];
    /**
     * The Y-rotation that puts a geometry's local +X on `u` and its local +Z on
     * `v`. It is MINUS the yaw, and getting that backwards is not subtle: with
     * +YAW the 44 m boom came out running along the rails instead of across
     * them, so it flew past both portals and the crane read as a blade lying in
     * mid-air. Three.js rotateY(t) sends +Z to (sin t, cos t) and +X to
     * (cos t, -sin t); `W` sends v to (-sn, cs) and u to (cs, sn); the two
     * agree only at t = -YAW.
     */
    const ROT = -YAW;

    /* ---- containers: the only saturated colour in the valley ---- */
    const LIVERY = ['#7d3b30', '#2f4d5c', '#5d5a34', '#6a4a24', '#39513f', '#7a6338'];
    const container = (u, v, y, yaw, roll, color, seed) => {
      const g = new THREE.BoxGeometry(12.2, 2.85, 2.5, 26, 3, 3);
      const p = g.attributes.position;
      // corrugation on the two long sides: the profile that makes a box a box
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i);
        if (Math.abs(z) > 1.1) p.setZ(i, z + Math.sin(p.getX(i) * 6.9) * 0.05 * Math.sign(z));
      }
      g.computeVertexNormals();
      const arr = new Float32Array(p.count * 3);
      const base = _col.set(color);
      const rust = _col2.set('#4f2a15');
      const r2 = mulberry32(seed);
      for (let i = 0; i < p.count; i++) {
        const ly = p.getY(i);
        const sill = THREE.MathUtils.clamp((1.4 - ly) / 2.85, 0, 1);
        const streak = N.fbm(p.getX(i) * 0.8 + seed, ly * 2.4 - p.getZ(i), 3) * 0.5 + 0.5;
        _col3.copy(base).lerp(rust, Math.min(0.9, sill * 0.5 + streak * 0.45));
        const j = (r2() - 0.5) * 0.05;
        arr[i * 3] = _col3.r + j; arr[i * 3 + 1] = _col3.g + j; arr[i * 3 + 2] = _col3.b + j;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      const [wx, wz] = W(u, v);
      g.applyMatrix4(composeMat(wx, this.gy(wx, wz) + y + 1.42, wz, roll, ROT + yaw, 0));
      metal.push(g.toNonIndexed());
    };

    // three stacks, tallest in the middle, plus a spill of singles
    const stacks = [[-18, -9, 4], [-4, -10, 5], [10, -8, 3], [-11, 8, 2], [3, 9, 4]];
    let seed = 6000;
    for (const [u, v, n] of stacks) {
      for (let i = 0; i < n; i++) {
        const slip = i === n - 1 ? (rng() - 0.5) * 1.6 : (rng() - 0.5) * 0.35;
        container(u + slip, v + (rng() - 0.5) * 0.3, i * 2.9,
          (rng() - 0.5) * 0.05, i === n - 1 ? (rng() - 0.5) * 0.09 : 0,
          LIVERY[(seed / 7 | 0) % LIVERY.length], seed);
        seed += 7;
      }
    }
    for (let i = 0; i < 6; i++) {
      const u = -26 + rng() * 52, v = -22 + rng() * 44;
      container(u, v, 0, rng() * 3.14, (rng() - 0.5) * 0.9,
        LIVERY[i % LIVERY.length], (seed += 11));
    }

    /* ---- the portal crane: two splayed legs, a boom, a hoist ---- */
    const LEGV = [-15, 15];                 // rail gauge (across the yard)
    const TOP = 26.5;
    for (const lv of LEGV) {
      for (const lu of [-3.2, 3.2]) {
        const [bx, bz] = W(lu, lv * 1.16);
        const [tx, tz] = W(lu * 0.55, lv);
        rustTube(metal, [bx, this.gy(bx, bz), bz], [tx, g0 + TOP, tz], 0.62, 0.44, 6200 + lv + lu, N, 7);
      }
      // leg bracing
      for (let i = 1; i < 5; i++) {
        const f0 = (i - 1) / 5, f1 = i / 5;
        const [ax, az] = W(-3.2 + f0 * 1.3, lv * (1.16 - f0 * 0.16));
        const [bx2, bz2] = W(3.2 - f1 * 1.3, lv * (1.16 - f1 * 0.16));
        rustTube(metal, [ax, g0 + f0 * TOP, az], [bx2, g0 + f1 * TOP, bz2], 0.14, 0.14, 6250 + lv + i, N, 4);
      }
      // sill beam + bogies on the rail
      const [s0x, s0z] = W(-4.4, lv * 1.16), [s1x, s1z] = W(4.4, lv * 1.16);
      rustTube(metal, [s0x, this.gy(s0x, s0z) + 0.9, s0z], [s1x, this.gy(s1x, s1z) + 0.9, s1z], 0.4, 0.4, 6280 + lv, N, 5);
    }
    // the boom: a deep plate girder spanning the portals and cantilevering out
    {
      const BOOM = 44, DEPTH = 2.6;
      for (const off of [-1.5, 1.5]) {
        const web = new THREE.BoxGeometry(1.0, DEPTH, BOOM, 1, 2, 34);
        const p = web.attributes.position;
        // the far cantilever sagged when the tie-back let go
        for (let i = 0; i < p.count; i++) {
          const f = Math.max(0, (p.getZ(i) - 8) / (BOOM / 2 - 8));
          p.setY(i, p.getY(i) - f * f * 3.4);
        }
        web.computeVertexNormals();
        paintRust(web, 6300 + off * 10, N, -99, 1);
        const [wx, wz] = W(off, 0);
        web.applyMatrix4(composeMat(wx, g0 + TOP + DEPTH / 2, wz, 0, ROT, 0));
        metal.push(web.toNonIndexed());
      }
      // walkway handrail along the boom, and the trolley hanging off it
      for (let i = 0; i < 14; i++) {
        const v = -BOOM / 2 + (i / 13) * BOOM;
        const [px, pz] = W(2.4, v);
        rustTube(metal, [px, g0 + TOP + DEPTH, pz], [px, g0 + TOP + DEPTH + 1.05, pz], 0.05, 0.05, 6340 + i, N, 4);
      }
      const [hx, hz] = W(0, -6.5);
      const trolley = new THREE.BoxGeometry(3.2, 1.5, 2.4, 3, 2, 2);
      paintRust(trolley, 6360, N, -99, 1);
      trolley.applyMatrix4(composeMat(hx, g0 + TOP - 0.4, hz, 0, ROT, 0));
      metal.push(trolley.toNonIndexed());
      for (const off of [-0.8, 0.8]) {
        rustTube(metal, [hx + off, g0 + TOP - 1.1, hz], [hx + off * 0.6, g0 + 9.4, hz + 0.4], 0.06, 0.06, 6370 + off, N, 3);
      }
      const block = new THREE.BoxGeometry(2.0, 1.8, 1.4, 2, 2, 1);
      paintRust(block, 6380, N, -99, 1);
      block.applyMatrix4(composeMat(hx, g0 + 8.6, hz + 0.4, 0.12, ROT, 0.08));
      metal.push(block.toNonIndexed());
    }

    /* ---- the crane that did not stay up: its boom across the yard ---- */
    {
      const [ax, az] = W(-34, -20), [bx, bz] = W(-6, 22);
      const len = Math.hypot(bx - ax, bz - az);
      const parts = truss(len, 2.6, 0.13, 6400, N, Math.round(len / 3.4));
      const yaw = Math.atan2(bx - ax, bz - az);
      const m = composeMat(ax, this.gy(ax, az) + 1.7, az, Math.PI / 2, yaw, 0);
      for (const g of parts) { g.applyMatrix4(m); metal.push(g.toNonIndexed()); }
      // the pedestal it snapped off
      const ped = new THREE.CylinderGeometry(2.6, 3.2, 5.4, 14, 3);
      paintConcrete(ped, 6420, N, -0.6);
      ped.applyMatrix4(composeMat(ax, this.gy(ax, az) + 2.4, az));
      matte.push(ped.toNonIndexed());
    }

    /* ---- the rail spur and its apron slab ---- */
    {
      for (const lv of LEGV) {
        for (let i = 0; i < 22; i++) {
          const u = -34 + (i / 21) * 68;
          const [sx, sz] = W(u, lv * 1.16);
          const tie = new THREE.BoxGeometry(0.28, 0.2, 3.0);
          tint(tie, i % 2 ? '#3b3025' : '#332a20', 0.1, rng);
          tie.applyMatrix4(composeMat(sx, this.gy(sx, sz) + 0.1, sz, 0, ROT, 0));
          matte.push(tie.toNonIndexed());
        }
        const [r0x, r0z] = W(-34, lv * 1.16), [r1x, r1z] = W(34, lv * 1.16);
        rustTube(metal, [r0x, this.gy(r0x, r0z) + 0.24, r0z], [r1x, this.gy(r1x, r1z) + 0.24, r1z],
          0.09, 0.09, 6440 + lv, N, 4);
      }
      /**
       * The hardstand, and the two reasons it is not just a box.
       *
       * 1. IT FOLLOWS THE GROUND. A flat 64 x 40 slab parked at the site's
       *    centre height floats over every metre the terrain drops — the first
       *    build put a grey sheet across the whole east vista, hovering two
       *    metres up. Each vertex is snapped to `terrain.getHeight` after the
       *    yaw, so the apron is a poured slab and not a hovercraft.
       * 2. IT IS ITS OWN MESH WITH ITS OWN `raycast`. `collision.seedWorld()`
       *    skips a mesh that owns `raycast` (the signal `camp-paths` and
       *    `camp-banners` already use); without that, a conformed slab this
       *    wide is a mesh collider, and `nav` blanks a collider triangle's
       *    padded XZ box — 2560 m2 of navgrid deleted so the machines that
       *    patrol this bearing could not path across their own yard. It is
       *    also kept OUT of `this.meshes`, so `V34-midground` cannot count a
       *    grazing ray on a ground slab as a landmark silhouette.
       */
      const apron = new THREE.BoxGeometry(64, 0.2, 40, 22, 1, 16);
      paintConcrete(apron, 6460, N, -99);
      apron.applyMatrix4(composeMat(X, g0, Z, 0, ROT, 0));
      const ap = apron.attributes.position;
      for (let i = 0; i < ap.count; i++) {
        const top = ap.getY(i) > g0;
        ap.setY(i, this.gy(ap.getX(i), ap.getZ(i)) + (top ? 0.09 : -0.11));
      }
      apron.computeVertexNormals();
      const slab = bake([apron.toNonIndexed()], this.mats.matte,
        { name: 'props-mega-gantry-apron', castShadow: false });
      if (slab) {
        slab.raycast = () => {};
        this.group.add(slab);
      }
    }
    this._close('gantry', metal, matte);
  }
}
