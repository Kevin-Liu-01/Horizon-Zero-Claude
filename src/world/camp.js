import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Hunter camp at (22, 30) — the respawn point. Campfire with shader-billboard
 * flames/embers/smoke, flickering warm point light (the single extra light,
 * shadow-free), the static NPC by the fire, hide tents on A-frame poles,
 * crates, a weapon rack with spears and machine-part trophies.
 *
 * Static props are baked into three merged vertex-colored meshes
 * (matte / metal / cloth) so the whole camp costs ~10 draw calls.
 */

const FIRE_X = 22, FIRE_Z = 30;

// Deterministic rng so screenshots are reproducible between runs.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function composeMat(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(
    _v1.set(x, y, z),
    _q.setFromEuler(_e.set(rx, ry, rz)),
    _v2.set(sx, sy, sz),
  );
}

export class Camp {
  constructor(ctx) {
    this.ctx = ctx;
    this.rng = makeRng(0xC0FFEE);

    const fy = ctx.terrain.getHeight(FIRE_X, FIRE_Z);
    this.firePosition = new THREE.Vector3(FIRE_X, fy, FIRE_Z);
    this.position = this.firePosition.clone();

    this.group = new THREE.Group();
    this.group.name = 'hunter-camp';

    // geometry buckets -> merged into one mesh per material
    this._matte = [];
    this._metal = [];
    this._cloth = [];
    this._small = []; // small clutter: merged like matte but casts no shadow

    this._buildFirepit();
    this._buildSeatLogs();
    this._buildTent(26.4, 33.4, 1.0);
    this._buildTent(17.6, 34.0, 0.86);
    this._buildCrates(25.4, 29.1);
    this._buildWeaponRack(19.1, 31.9);
    this._buildStuckSpear(24.1, 27.9);
    this._buildWoodPile(27.9, 31.2);
    this._bakeStatics();

    this._buildGroundDecal();
    this._buildCoalGlow();
    this._buildFireParticles();
    this._buildEmbers();
    this._buildSmoke();
    this._buildLight();
    this._placeNpc();

    ctx.scene.add(this.group);
  }

  /* ------------------------- geometry helpers ------------------------- */

  _tinted(geo, matrix, color, jitter = 0.05) {
    geo.applyMatrix4(matrix);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) {
      const j = 1 + (this.rng() * 2 - 1) * jitter;
      arr[i * 3] = _c.r * j;
      arr[i * 3 + 1] = _c.g * j;
      arr[i * 3 + 2] = _c.b * j;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  /** Cylinder from point a to point b (arrays), tapered r0 -> r1. */
  _tube(list, a, b, r0, r1, color, radial = 7, jitter = 0.05) {
    const len = _v1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).length();
    const geo = new THREE.CylinderGeometry(r1, r0, len, radial);
    _q.setFromUnitVectors(UP, _v1.normalize());
    const m = new THREE.Matrix4().compose(
      _v2.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
      _q,
      new THREE.Vector3(1, 1, 1),
    );
    list.push(this._tinted(geo, m, color, jitter));
  }

  _groundY(x, z) {
    return this.ctx.terrain.getHeight(x, z);
  }

  /* ----------------------------- firepit ------------------------------ */

  _buildFirepit() {
    const rng = this.rng;
    const fy = this.firePosition.y;

    // ash bed
    this._small.push(this._tinted(
      new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2),
      composeMat(FIRE_X, fy + 0.03, FIRE_Z),
      '#3a342d', 0.12,
    ));

    // stone ring
    const stones = 11;
    for (let i = 0; i < stones; i++) {
      const ang = (i / stones) * Math.PI * 2 + rng() * 0.22;
      const r = 0.68 + rng() * 0.08;
      const x = FIRE_X + Math.cos(ang) * r;
      const z = FIRE_Z + Math.sin(ang) * r;
      const s = 0.13 + rng() * 0.07;
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const m = composeMat(
        x, this._groundY(x, z) + s * 0.42, z,
        rng() * Math.PI, rng() * Math.PI, rng() * Math.PI,
        s * (0.9 + rng() * 0.35), s * (0.6 + rng() * 0.25), s * (0.9 + rng() * 0.3),
      );
      this._small.push(this._tinted(geo, m, rng() > 0.5 ? '#675f53' : '#6e6355', 0.11));
    }

    // charred tepee logs, tips crossing above center
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + 0.5;
      const bx = FIRE_X + Math.cos(ang) * 0.40;
      const bz = FIRE_Z + Math.sin(ang) * 0.40;
      const ta = ang + 2.5;
      const tx = FIRE_X + Math.cos(ta) * 0.10;
      const tz = FIRE_Z + Math.sin(ta) * 0.10;
      this._tube(this._small,
        [bx, fy + 0.03, bz], [tx, fy + 0.72, tz],
        0.055, 0.038, '#221a14', 0.18);
    }
    // two half-burnt logs lying at the edge
    this._tube(this._small,
      [FIRE_X - 0.55, fy + 0.09, FIRE_Z - 0.15],
      [FIRE_X + 0.25, fy + 0.12, FIRE_Z + 0.42],
      0.06, 0.05, '#31251a', 0.2);
    this._tube(this._small,
      [FIRE_X + 0.5, fy + 0.08, FIRE_Z - 0.4],
      [FIRE_X - 0.1, fy + 0.1, FIRE_Z - 0.55],
      0.055, 0.045, '#2a1f16', 0.2);

    // cooking spit: forked uprights + crossbar + soot-black pot over the flames
    const spitYaw = 0.35;
    const sx = Math.cos(spitYaw), sz = Math.sin(spitYaw);
    const barH = 0.95;
    for (const side of [-1, 1]) {
      const ux = FIRE_X + sx * 0.8 * side, uz = FIRE_Z + sz * 0.8 * side;
      const gy = this._groundY(ux, uz);
      this._tube(this._small, [ux, gy - 0.05, uz], [ux, gy + barH, uz], 0.028, 0.022, '#5b4630');
      // fork stub
      this._tube(this._small,
        [ux, gy + barH - 0.06, uz],
        [ux + sz * 0.12 * side, gy + barH + 0.14, uz - sx * 0.12 * side],
        0.016, 0.012, '#5b4630');
    }
    const barY = fy + barH + 0.02;
    this._tube(this._small,
      [FIRE_X - sx * 0.95, barY, FIRE_Z - sz * 0.95],
      [FIRE_X + sx * 0.95, barY, FIRE_Z + sz * 0.95],
      0.02, 0.02, '#66513a');
    // hanging pot
    this._tube(this._small, [FIRE_X, barY, FIRE_Z], [FIRE_X, barY - 0.22, FIRE_Z], 0.006, 0.006, '#2c2118');
    this._metal.push(this._tinted(
      new THREE.SphereGeometry(0.13, 10, 8),
      composeMat(FIRE_X, barY - 0.32, FIRE_Z, 0, 0, 0, 1, 0.8, 1),
      '#31302e', 0.05,
    ));
  }

  _buildSeatLogs() {
    // two sitting logs facing the fire
    const logs = [
      { x: 20.2, z: 28.6, yaw: 0.75, len: 1.8 },
      { x: 23.9, z: 32.6, yaw: 0.55, len: 1.6 },
    ];
    for (const L of logs) {
      const y = this._groundY(L.x, L.z);
      const dx = Math.cos(L.yaw) * L.len / 2, dz = Math.sin(L.yaw) * L.len / 2;
      this._tube(this._matte,
        [L.x - dx, this._groundY(L.x - dx, L.z - dz) + 0.14, L.z - dz],
        [L.x + dx, this._groundY(L.x + dx, L.z + dz) + 0.14, L.z + dz],
        0.15, 0.13, '#4c3a26', 0.1);
      // stub branch on one log for character
      if (L.len > 1.7) {
        this._tube(this._small,
          [L.x + dx * 0.4, y + 0.24, L.z + dz * 0.4],
          [L.x + dx * 0.4 + 0.18, y + 0.44, L.z + dz * 0.4 + 0.1],
          0.03, 0.02, '#4c3a26', 0.1);
      }
    }
  }

  /* ------------------------------ tents ------------------------------- */

  _tentCloth(W, H, D) {
    const cols = 12, rows = 14;
    const pos = [], uv = [], idx = [];
    for (let iu = 0; iu <= rows; iu++) {
      const u = iu / rows;                    // 0 back -> 1 front
      const z = (u - 0.5) * D;
      const ridgeSag = 0.09 * Math.sin(Math.PI * u);
      for (let iv = 0; iv <= cols; iv++) {
        const v = (iv / cols) * 2 - 1;        // -1 hem .. 0 ridge .. 1 hem
        const a = Math.abs(v);
        const side = Math.sign(v);
        let x = side * (W / 2) * a + side * 0.09 * Math.sin(Math.PI * a);
        let y = H * (1 - a) - ridgeSag * (1 - a);
        y -= 0.05 * Math.sin(Math.PI * a) * Math.sin(Math.PI * u);
        x += 0.014 * Math.sin(u * 21 + a * 9);
        y += 0.012 * Math.sin(u * 17 + v * 13);
        pos.push(x, y - 0.08, z);
        uv.push(u, (v + 1) / 2);
      }
    }
    for (let iu = 0; iu < rows; iu++) {
      for (let iv = 0; iv < cols; iv++) {
        const a = iu * (cols + 1) + iv, b = a + 1;
        const c = a + cols + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

  /** Stitched-hide patchwork: per-patch tint blocks + darkened seam bands. */
  _paintTentCloth(geo, matrix, seed) {
    geo.applyMatrix4(matrix);
    const uv = geo.attributes.uv;
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    const palette = ['#a86f44', '#6e4123', '#96613c', '#7c4a2b', '#b07f58', '#5f3a20']
      .map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      const pu = Math.min(3, (u * 4) | 0), pv = Math.min(2, (v * 3) | 0);
      const hash = (pu * 5 + pv * 11 + seed * 7) % palette.length;
      _c.copy(palette[hash]);
      // per-patch luminance swing so hides read as distinct pieces in full sun
      const lum = 0.78 + 0.44 * (((pu * 13 + pv * 29 + seed * 3) % 7) / 6);
      // seams: darken near the patch grid lines (stitch shadow)
      const fu = Math.abs(u * 4 - Math.round(u * 4));
      const fv = Math.abs(v * 3 - Math.round(v * 3));
      const seam = Math.min(1, Math.min(fu, fv) * 6.5);
      const k = lum * (0.58 + 0.42 * seam) * (0.96 + this.rng() * 0.08);
      arr[i * 3] = _c.r * k;
      arr[i * 3 + 1] = _c.g * k;
      arr[i * 3 + 2] = _c.b * k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  _buildTent(x, z, s) {
    const W = 2.7 * s, H = 1.85 * s, D = 3.1 * s;
    // opening faces the fire
    const yaw = Math.atan2(FIRE_X - x, FIRE_Z - z);
    // settle base into the slope: use lowest of the four hem corners
    let base = Infinity;
    for (const [cx, cz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
      const wx = x + cx * Math.cos(yaw) + cz * Math.sin(yaw);
      const wz = z - cx * Math.sin(yaw) + cz * Math.cos(yaw);
      base = Math.min(base, this._groundY(wx, wz));
    }
    const tm = composeMat(x, base + 0.02, z, 0, yaw, 0);

    const cloth = this._tentCloth(W, H, D);
    this._tentSeed = (this._tentSeed ?? 0) + 1;
    this._cloth.push(this._paintTentCloth(cloth, tm, this._tentSeed));

    // dark back closure (reads as shadowed interior)
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2 * 0.92, 0);
    shape.lineTo(0, H * 0.9);
    shape.lineTo(W / 2 * 0.92, 0);
    shape.closePath();
    const back = new THREE.ShapeGeometry(shape).translate(0, -0.06, -D / 2 + 0.1);
    this._cloth.push(this._tinted(back, tm, '#33251a', 0.05));

    // A-frame poles: crossed pairs front and back, ridge pole on top
    const pole = '#5b4630';
    const local = (lx, ly, lz) => {
      const p = new THREE.Vector3(lx, ly, lz).applyMatrix4(tm);
      return [p.x, p.y, p.z];
    };
    for (const zEnd of [D / 2 * 0.94, -D / 2 * 0.94]) {
      this._tube(this._matte, local(-W / 2 * 0.98, -0.1, zEnd), local(0.16 * s, H + 0.22 * s, zEnd), 0.035, 0.028, pole);
      this._tube(this._matte, local(W / 2 * 0.98, -0.1, zEnd), local(-0.16 * s, H + 0.22 * s, zEnd), 0.035, 0.028, pole);
    }
    this._tube(this._matte, local(0, H + 0.05, -D / 2 - 0.28), local(0, H + 0.05, D / 2 + 0.34), 0.032, 0.028, '#66513a');

    // bedroll just inside the opening
    const bx = x + Math.sin(yaw) * D * 0.12, bz = z + Math.cos(yaw) * D * 0.12;
    const roll = new THREE.CapsuleGeometry(0.16 * s, 1.1 * s, 3, 8);
    this._cloth.push(this._tinted(
      roll,
      composeMat(bx, base + 0.14 * s, bz, 0, yaw + Math.PI / 2 + 0.25, Math.PI / 2, 1, 1, 0.7),
      '#7d6a4a', 0.08,
    ));
  }

  /* -------------------------- crates & props -------------------------- */

  /** Horizontal plank bands with per-plank luminance + subtle grain waves. */
  _paintPlanks(geo, matrix, color) {
    const posA = geo.attributes.position;
    const n = posA.count;
    const arr = new Float32Array(n * 3);
    _c.set(color);
    const bandK = [];
    for (let b = 0; b < 3; b++) bandK.push(0.52 + this.rng() * 0.62);
    for (let i = 0; i < n; i++) {
      const t = (posA.getY(i) + 0.5) * 3; // 0..3 across three planks
      const band = Math.min(2, Math.max(0, Math.round(t - 0.5)));
      const grain = 0.95 + 0.05 * Math.sin(posA.getX(i) * 31 + posA.getZ(i) * 17 + band * 9);
      let k = bandK[band] * grain * (1 + (this.rng() * 2 - 1) * 0.04);
      // recessed dark gap where planks meet
      if (Math.abs(t - 1) < 0.02 || Math.abs(t - 2) < 0.02) k *= 0.45;
      arr[i * 3] = Math.min(1, _c.r * k * 1.04);
      arr[i * 3 + 1] = Math.min(1, _c.g * k);
      arr[i * 3 + 2] = Math.min(1, _c.b * k * 0.9);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geo.applyMatrix4(matrix);
    return geo;
  }

  _buildCrates(x, z) {
    const rng = this.rng;
    const crates = [
      { dx: 0, dz: 0, s: 0.62, yaw: 0.3 },
      { dx: 0.75, dz: 0.35, s: 0.5, yaw: -0.4 },
      { dx: 0.25, dz: -0.15, s: 0.42, yaw: 0.9, stack: 0.62 },
    ];
    for (const c of crates) {
      const cx = x + c.dx, cz = z + c.dz;
      const y = this._groundY(cx, cz) + (c.stack ?? 0) + c.s / 2 - 0.02;
      const m = composeMat(cx, y, cz, 0, c.yaw, 0, c.s);
      this._matte.push(this._paintPlanks(
        new THREE.BoxGeometry(1, 1, 1, 1, 6, 1), m.clone(), '#5f4526'));
      // corner framing posts, slightly proud
      for (const [px, pz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
        const post = new THREE.BoxGeometry(0.1, 1.06, 0.1).translate(px, 0, pz);
        this._matte.push(this._tinted(post, m.clone(), '#5a4527', 0.08));
      }
    }
    // grain sack slumped against the crates
    const sx = x - 0.55, sz = z + 0.5;
    this._matte.push(this._tinted(
      new THREE.SphereGeometry(0.34, 10, 8),
      composeMat(sx, this._groundY(sx, sz) + 0.17, sz, 0, rng() * 2, 0.15, 1, 0.52, 0.85),
      '#57452b', 0.16,
    ));
  }

  _spear(baseX, baseZ, tiltX, tiltZ, sink = 0) {
    // shaft + flattened blade + leather wrap; tilt is the lean direction
    const y0 = this._groundY(baseX, baseZ) - sink;
    const L = 1.95;
    const tip = [baseX + tiltX * L, y0 + L * Math.sqrt(Math.max(0.1, 1 - tiltX * tiltX - tiltZ * tiltZ)), baseZ + tiltZ * L];
    this._tube(this._matte, [baseX, y0, baseZ], tip, 0.024, 0.018, '#6a5138', 0.08);
    const dir = _v1.set(tip[0] - baseX, tip[1] - y0, tip[2] - baseZ).normalize();
    _q.setFromUnitVectors(UP, dir);
    // blade
    const blade = new THREE.CylinderGeometry(0.003, 0.034, 0.28, 6).scale(1, 1, 0.35).translate(0, 0.13, 0);
    const bm = new THREE.Matrix4().compose(_v2.set(tip[0], tip[1], tip[2]), _q, new THREE.Vector3(1, 1, 1));
    this._metal.push(this._tinted(blade, bm, '#454f58', 0.06));
    // leather lashing right under the blade, flush with the shaft
    const wrap = new THREE.CylinderGeometry(0.032, 0.028, 0.24, 7).translate(0, -0.12, 0);
    this._small.push(this._tinted(wrap, bm.clone(), '#53301f', 0.08));
  }

  _buildStuckSpear(x, z) {
    this._spear(x, z, 0.14, 0.22, 0.12);
  }

  _buildWeaponRack(x, z) {
    const yawToFire = Math.atan2(FIRE_X - x, FIRE_Z - z);
    // crossbar runs perpendicular to the fire direction
    const px = Math.cos(yawToFire), pz = -Math.sin(yawToFire);
    const h = 1.35;
    const ends = [
      [x - px * 0.8, z - pz * 0.8],
      [x + px * 0.8, z + pz * 0.8],
    ];
    for (const [ex, ez] of ends) {
      this._tube(this._matte, [ex, this._groundY(ex, ez) - 0.1, ez], [ex, this._groundY(ex, ez) + h, ez], 0.04, 0.032, '#54402b');
    }
    const topA = [ends[0][0], this._groundY(ends[0][0], ends[0][1]) + h, ends[0][1]];
    const topB = [ends[1][0], this._groundY(ends[1][0], ends[1][1]) + h, ends[1][1]];
    this._tube(this._matte, topA, topB, 0.028, 0.028, '#66513a');

    // spears resting on the crossbar: base 0.42m fire-side, tilt sized so the
    // shaft actually meets the bar plane just below bar height
    const fx = Math.sin(yawToFire), fz = Math.cos(yawToFire);
    const leanX = -fx * 0.32, leanZ = -fz * 0.32;
    this._spear(x - px * 0.28 + fx * 0.42, z - pz * 0.28 + fz * 0.42, leanX, leanZ);
    this._spear(x + px * 0.24 + fx * 0.42, z + pz * 0.24 + fz * 0.42, leanX, leanZ);

    // machine-part trophies hanging from the crossbar
    const midX = x - px * 0.42, midZ = z - pz * 0.42;
    const midTopY = this._groundY(midX, midZ) + h;
    this._tube(this._small, [midX, midTopY, midZ], [midX, midTopY - 0.3, midZ], 0.006, 0.006, '#2c2118');
    const plate = new THREE.BoxGeometry(0.2, 0.3, 0.035);
    this._metal.push(this._tinted(plate, composeMat(midX, midTopY - 0.45, midZ, 0.1, yawToFire + 0.4, 0.05), '#93a4b0', 0.07));

    const lx = x + px * 0.45, lz = z + pz * 0.45;
    const lTopY = this._groundY(lx, lz) + h;
    this._tube(this._small, [lx, lTopY, lz], [lx, lTopY - 0.26, lz], 0.006, 0.006, '#2c2118');
    // glowing watcher-eye lens trophy — own emissive material, pulsed in update
    this._lensMat = new THREE.MeshStandardMaterial({
      color: '#0a2630', emissive: '#38d9f7', emissiveIntensity: 1.6,
      roughness: 0.3, metalness: 0.2,
    });
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), this._lensMat);
    lens.position.set(lx, lTopY - 0.35, lz);
    this.group.add(lens);
    const ring = new THREE.TorusGeometry(0.075, 0.016, 6, 14);
    this._metal.push(this._tinted(ring, composeMat(lx, lTopY - 0.35, lz, 0.2, yawToFire, 0), '#7e8a92', 0.06));
  }

  _buildWoodPile(x, z) {
    // small stack of firewood
    const y = this._groundY(x, z);
    const yaw = 0.8;
    for (let i = 0; i < 5; i++) {
      const row = i < 3 ? 0 : 1;
      const off = (i % 3) - 1 + (row ? 0.5 : 0) - (row && i === 4 ? 1 : 0);
      const ox = Math.cos(yaw) * off * 0.17, oz = Math.sin(yaw) * off * 0.17;
      this._tube(this._small,
        [x + ox - Math.sin(yaw) * 0.4, y + 0.08 + row * 0.15, z + oz + Math.cos(yaw) * 0.4],
        [x + ox + Math.sin(yaw) * 0.4, y + 0.08 + row * 0.15, z + oz - Math.cos(yaw) * 0.4],
        0.075, 0.065, i % 2 ? '#54402b' : '#4a3826', 0.12);
    }
  }

  /* ------------------------- static mesh bake ------------------------- */

  _bakeStatics() {
    const make = (geos, mat) => {
      if (!geos.length) return null;
      // mergeGeometries needs uniform indexed-ness (icosahedra are non-indexed)
      const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
      const merged = mergeGeometries(flat, false);
      for (const g of geos) g.dispose();
      for (const g of flat) g.dispose();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const matteMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, metalness: 0,
    });
    make(this._matte, matteMat);
    // small clutter + all-metal trinkets are too small to pay shadow draws for
    const small = make(this._small, matteMat);
    if (small) small.castShadow = false;
    const metal = make(this._metal, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.35, metalness: 0.85,
    }));
    if (metal) metal.castShadow = false;
    make(this._cloth, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide,
      // faked warm bounce so shaded hide doesn't go cold gray at golden hour
      emissive: '#3d2010', emissiveIntensity: 0.45,
    }));
    this._matte = this._metal = this._cloth = this._small = null;
  }

  /* -------------------------- ground & glow --------------------------- */

  _buildGroundDecal() {
    // trampled-dirt patch conforming to the heightfield
    const geo = new THREE.RingGeometry(0.01, 3.9, 36, 5);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + FIRE_X, wz = pos.getZ(i) + FIRE_Z;
      pos.setY(i, this._groundY(wx, wz) - this.firePosition.y + 0.05);
    }
    geo.computeVertexNormals();

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g2d = canvas.getContext('2d');
    // alphaMap samples the GREEN channel — paint luminance on black, not alpha
    g2d.fillStyle = '#000';
    g2d.fillRect(0, 0, 128, 128);
    const grad = g2d.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.32)');
    grad.addColorStop(0.8, 'rgba(255,255,255,0.1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g2d.fillStyle = grad;
    g2d.fillRect(0, 0, 128, 128);
    // noisy erosion so the patch edge doesn't read as a stamped ellipse
    const img = g2d.getImageData(0, 0, 128, 128);
    const px = img.data;
    const nRng = makeRng(913);
    for (let i = 0; i < px.length; i += 4) {
      const k = 0.62 + nRng() * 0.75;
      px[i] = Math.min(255, px[i] * k);
      px[i + 1] = Math.min(255, px[i + 1] * k);
      px[i + 2] = Math.min(255, px[i + 2] * k);
      px[i + 3] = 255;
    }
    g2d.putImageData(img, 0, 0);

    const mat = new THREE.MeshStandardMaterial({
      color: '#6a5640', roughness: 1, metalness: 0,
      transparent: true, depthWrite: false,
      alphaMap: new THREE.CanvasTexture(canvas),
      polygonOffset: true, polygonOffsetFactor: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(FIRE_X, this.firePosition.y, FIRE_Z);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    this.group.add(mesh);
  }

  _buildCoalGlow() {
    this._coalMat = new THREE.MeshStandardMaterial({
      color: '#160c06', emissive: '#ff5a16', emissiveIntensity: 1.8,
      roughness: 1,
    });
    const coals = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6), this._coalMat);
    coals.scale.set(1.15, 0.28, 1.15);
    coals.position.copy(this.firePosition).y += 0.08;
    this.group.add(coals);
  }

  /* --------------------------- particles ------------------------------ */

  _buildFireParticles() {
    const N = 110;
    const rng = this.rng;
    const seed = new Float32Array(N);
    const size = new Float32Array(N);   // world size, meters
    const rad = new Float32Array(N);
    const speed = new Float32Array(N);
    const alpha = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      seed[i] = rng();
      const glow = i < 10; // a few soft glow sprites at the base
      // ~2x sprite size so the fire reads across the camp even in daylight
      size[i] = glow ? 0.55 + rng() * 0.35 : 0.15 + rng() * 0.25;
      rad[i] = glow ? 0.08 + rng() * 0.1 : 0.05 + rng() * 0.22;
      speed[i] = glow ? 0.55 + rng() * 0.3 : 0.8 + rng() * 0.75;
      alpha[i] = glow ? 0.2 : 0.62 + rng() * 0.3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aRad', new THREE.BufferAttribute(rad, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.7, 0), 1.6);

    this._fireMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uFocal: { value: 800 },
        uWind: { value: new THREE.Vector2(0.16, 0.07) },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed, aSize, aRad, aSpeed, aAlpha;
        uniform float uTime, uFocal;
        uniform vec2 uWind;
        varying float vLife;
        varying float vAlpha;
        void main() {
          float life = fract(uTime * aSpeed + aSeed * 7.13);
          vLife = life;
          vAlpha = aAlpha;
          float taper = 1.0 - 0.72 * life;
          float ang = aSeed * 40.0 + uTime * (1.2 + aSeed) + life * 2.5;
          vec3 p = vec3(cos(ang) * aRad * taper, life * 1.15, sin(ang) * aRad * taper);
          p.xz += uWind * life * life;
          p.y += 0.05 * sin(uTime * 17.0 + aSeed * 60.0) * life;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aSize * (1.0 - 0.65 * life) * uFocal / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vLife;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float core = smoothstep(1.0, 0.0, length(uv));
          core *= core;
          vec3 col = mix(vec3(1.0, 0.82, 0.4), vec3(1.0, 0.44, 0.10), smoothstep(0.05, 0.6, vLife));
          col = mix(col, vec3(0.7, 0.14, 0.03), smoothstep(0.55, 1.0, vLife));
          // white-hot heart early in life so flames punch through daylight
          float hot = core * (1.0 - smoothstep(0.0, 0.45, vLife));
          col = mix(col, vec3(1.0, 0.96, 0.8), hot * 0.85);
          float a = core * (1.0 - vLife) * smoothstep(0.0, 0.07, vLife) * vAlpha;
          gl_FragColor = vec4(col * a * 1.55, a);
        }
      `,
    });
    const pts = new THREE.Points(geo, this._fireMat);
    pts.position.copy(this.firePosition).y += 0.12;
    pts.renderOrder = 3;
    this.group.add(pts);
  }

  _buildEmbers() {
    const N = 26;
    const rng = this.rng;
    const seed = new Float32Array(N);
    const speed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      seed[i] = rng();
      speed[i] = 0.3 + rng() * 0.3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), 3.2);

    this._emberMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uFocal: { value: 800 },
        uWind: { value: new THREE.Vector2(0.55, 0.25) },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed, aSpeed;
        uniform float uTime, uFocal;
        uniform vec2 uWind;
        varying float vLife;
        varying float vTw;
        void main() {
          float life = fract(uTime * aSpeed + aSeed * 3.71);
          vLife = life;
          vTw = 0.55 + 0.45 * sin(uTime * 22.0 + aSeed * 87.0);
          vec3 p = vec3(0.0, 0.15 + life * 2.9, 0.0);
          p.x += 0.3 * sin(uTime * 1.6 + aSeed * 31.0 + life * 6.0) * life + uWind.x * life * life * 2.0;
          p.z += 0.3 * cos(uTime * 1.3 + aSeed * 23.0 + life * 5.0) * life + uWind.y * life * life * 2.0;
          p.x += (aSeed - 0.5) * 0.4;
          p.z += (fract(aSeed * 13.7) - 0.5) * 0.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (0.05 - 0.026 * life) * uFocal / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vLife;
        varying float vTw;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float a = smoothstep(0.95, 0.25, length(uv)) * (1.0 - vLife) * vTw;
          vec3 col = mix(vec3(1.0, 0.72, 0.3), vec3(1.0, 0.4, 0.1), vLife);
          gl_FragColor = vec4(col * a * 1.6, a);
        }
      `,
    });
    const pts = new THREE.Points(geo, this._emberMat);
    pts.position.copy(this.firePosition).y += 0.25;
    pts.renderOrder = 4;
    this.group.add(pts);
  }

  _buildSmoke() {
    const N = 10;
    const rng = this.rng;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const pos = new Float32Array(N * 4 * 3);
    const corner = new Float32Array(N * 4 * 2);
    const seed = new Float32Array(N * 4);
    const idx = [];
    for (let i = 0; i < N; i++) {
      const s = rng();
      for (let k = 0; k < 4; k++) {
        corner[(i * 4 + k) * 2] = corners[k][0];
        corner[(i * 4 + k) * 2 + 1] = corners[k][1];
        seed[i * 4 + k] = s;
      }
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(1.2, 4, 0.6), 7.5);

    this._smokeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWind: { value: new THREE.Vector2(0.5, 0.22) },
      },
      vertexShader: /* glsl */ `
        attribute vec2 aCorner;
        attribute float aSeed;
        uniform float uTime;
        uniform vec2 uWind;
        varying vec2 vUv;
        varying float vLife;
        varying float vSeed;
        void main() {
          float life = fract(uTime * (0.05 + aSeed * 0.025) + aSeed * 9.7);
          vLife = life;
          vSeed = aSeed;
          vUv = aCorner;
          float y = 0.6 + life * 6.8;
          vec3 c = vec3(0.0, y, 0.0);
          c.x += uWind.x * life * y * 0.42 + 0.22 * sin(uTime * 0.7 + aSeed * 20.0 + life * 5.0);
          c.z += uWind.y * life * y * 0.42 + 0.22 * cos(uTime * 0.6 + aSeed * 14.0 + life * 4.0);
          float size = mix(0.35, 2.1, pow(life, 0.8));
          float dir = mix(-1.0, 1.0, step(0.5, aSeed));
          float rot = aSeed * 21.0 + uTime * 0.3 * dir;
          float cs = cos(rot), sn = sin(rot);
          vec2 cor = vec2(aCorner.x * cs - aCorner.y * sn, aCorner.x * sn + aCorner.y * cs);
          vec4 mv = modelViewMatrix * vec4(c, 1.0);
          mv.xy += cor * size;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vLife;
        varying float vSeed;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                     mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          float d = length(vUv);
          float soft = smoothstep(1.0, 0.2, d);
          float n = noise(vUv * 2.6 + vSeed * 17.0 + vLife * 1.5) * 0.65
                  + noise(vUv * 6.2 - vSeed * 9.0) * 0.35;
          soft *= smoothstep(0.22, 0.78, n + 0.35 * (1.0 - d));
          float a = soft * smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.35, 1.0, vLife)) * 0.16;
          vec3 col = mix(vec3(0.34, 0.31, 0.29), vec3(0.82, 0.77, 0.72), min(1.0, vLife * 0.9 + 0.25));
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, this._smokeMat);
    mesh.position.copy(this.firePosition).y += 0.3;
    mesh.renderOrder = 2;
    mesh.frustumCulled = false; // billboard offsets happen in view space
    this.group.add(mesh);
  }

  /* ----------------------------- light -------------------------------- */

  _buildLight() {
    // the single allowed extra light — shadow-free by contract
    this._lightBase = 21;
    const light = new THREE.PointLight('#ff9550', this._lightBase, 24, 2);
    light.castShadow = false;
    this._lightY = this.firePosition.y + 1.0;
    light.position.set(FIRE_X, this._lightY, FIRE_Z);
    this.fireLight = light;
    this.group.add(light);
  }

  /* ------------------------------ npc ---------------------------------- */

  _placeNpc() {
    // The raw NPC model is dozens of submeshes (a major draw-call cost, twice
    // over with the shadow pass). Bake world transforms and merge everything
    // sharing a material so the whole character renders in <=10 draws.
    const src = this.ctx.assets.models.npc.root.clone();
    src.updateMatrixWorld(true);

    // meshopt models quantize attributes (Int16/Uint8, normalized) with array
    // types that vary per primitive; expand to plain Float32 so transforms
    // bake losslessly and mergeGeometries accepts them
    const toFloat = (attr) => {
      const out = new Float32Array(attr.count * attr.itemSize);
      for (let i = 0; i < attr.count; i++) {
        for (let k = 0; k < attr.itemSize; k++) {
          out[i * attr.itemSize + k] = attr.getComponent(i, k); // denormalizes
        }
      }
      return new THREE.BufferAttribute(out, attr.itemSize);
    };

    const byMat = new Map(); // material.uuid -> { material, geos }
    src.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.material || Array.isArray(o.material)) return;
      let bucket = byMat.get(o.material.uuid);
      if (!bucket) {
        bucket = { material: o.material, geos: [] };
        byMat.set(o.material.uuid, bucket);
      }
      const flatSrc = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
      const g = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const a = flatSrc.getAttribute(name);
        if (a) g.setAttribute(name, toFloat(a));
      }
      if (flatSrc !== o.geometry) flatSrc.dispose();
      g.applyMatrix4(o.matrixWorld); // bake into npc-root space
      bucket.geos.push(g);
    });

    const npc = new THREE.Group();
    npc.name = 'camp-npc';
    for (const { material, geos } of byMat.values()) {
      // merge on the shared attribute set so all primitives line up
      let names = null;
      for (const g of geos) {
        const ks = Object.keys(g.attributes);
        names = names ? names.filter((n) => ks.includes(n)) : ks;
      }
      for (const g of geos) {
        for (const name of Object.keys(g.attributes)) {
          if (!names.includes(name)) g.deleteAttribute(name);
        }
      }
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      npc.add(mesh);
    }

    const x = 23.0, z = 31.9;
    // standing against the seat log behind, facing the fire
    npc.position.set(x, this._groundY(x, z) - 0.03, z);
    npc.rotation.y = Math.atan2(FIRE_X - x, FIRE_Z - z);
    this.ctx.scene.add(npc);
    this.npc = npc;
  }

  /* ----------------------------- update -------------------------------- */

  update(dt, t) {
    // perspective-correct point sizes: world meters -> device pixels
    const focal = this.ctx.renderer.domElement.height /
      (2 * Math.tan(THREE.MathUtils.degToRad(this.ctx.camera.fov) / 2));
    this._fireMat.uniforms.uFocal.value = focal;
    this._emberMat.uniforms.uFocal.value = focal;
    this._fireMat.uniforms.uTime.value = t;
    this._emberMat.uniforms.uTime.value = t;
    this._smokeMat.uniforms.uTime.value = t;
    // low-frequency flicker mix; smooth, no popping
    const f = 1
      + 0.13 * Math.sin(t * 11.3)
      + 0.08 * Math.sin(t * 23.7 + 1.3)
      + 0.06 * Math.sin(t * 5.1 + 0.7);
    this.fireLight.intensity = this._lightBase * f;
    this.fireLight.position.y = this._lightY + 0.06 * Math.sin(t * 9.1);
    this._coalMat.emissiveIntensity = 1.4 + 0.7 * f;
    this._lensMat.emissiveIntensity = 1.5 + 0.45 * Math.sin(t * 2.1);
  }
}
