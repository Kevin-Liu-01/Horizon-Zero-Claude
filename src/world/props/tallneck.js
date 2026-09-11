import * as THREE from 'three';
import {
  SimplexNoise, mulberry32, composeMat, tint, paintRust,
  rustTube, tube, bake, materials,
} from './kit.js';

/**
 * ROUND 4 — `world-11`: the Tallneck-scale landmark, and the 12–15 m lookout.
 *
 * THE TALLNECK (`world-11`, decision D6 "spend the budget on verticality")
 * A static Tallneck standing in the north meadow at (-25, 220): 46 m to the
 * crown of a 26 m disc, which is the one silhouette in this valley that reads
 * from any bearing and at any distance. It is a PROP, not a machine — the
 * `machine-rig` lane owns `src/entities/machines/**` and this must not become a
 * ninth species — so it lives here as merged geometry with two moving parts:
 * the disc turns at 0.6°/s and the head lamp breathes. Both are driven off the
 * frame's `t`, cost one quaternion write each, and allocate nothing.
 *
 * A collapsed transmission pylon leans against the rear leg as the climb, with
 * a plate landing 9 m up — that landing carries the OVERRIDE interactable
 * (`activities.js`), which is the canon reward loop: climb the Tallneck, and
 * the map opens.
 *
 * THE LOOKOUT (`world-11`, 12–15 m)
 * A Nora watch-post on the knoll north-east of the camp at (52, 66): 14.2 m of
 * lashed timber with a ladder, a railed platform, a hide canopy and a banner —
 * the tower the 5.4 m Round-2 watchtower was trying to be. It is deliberately
 * inside the camp's sight line so the settlement has a skyline.
 *
 * COLLISION: the Tallneck lives in its OWN group (`tallneck-landmark`), so
 * `installSpatial`'s scene seed does not reach it; its four legs, its body and
 * the climb ramp are registered as explicit capsule/box colliders with kind
 * `'landmark'` (cheap primitives, ~40x cheaper to query than a triangle BVH).
 * The lookout is under `world-props`, where the seed picks it up per mesh and
 * names it `'tower'`.
 */

export const TALLNECK = { x: -25, z: 220, height: 46, discR: 13 };
export const LOOKOUT = { x: 52, z: 66, height: 14.2 };

/* -------------------------------------------------------------------------- */
/*                                 TALLNECK                                    */
/* -------------------------------------------------------------------------- */

export class TallneckLandmark {
  constructor(ctx) {
    this.ctx = ctx;
    const N = this.noise = new SimplexNoise(4242);
    const rng = mulberry32(0x7A11);
    const mats = materials();

    this.group = new THREE.Group();
    this.group.name = 'tallneck-landmark';
    const X = TALLNECK.x, Z = TALLNECK.z;
    const g0 = ctx.terrain.getHeight(X, Z);
    this.base = new THREE.Vector3(X, g0, Z);

    /** Machine plate: pale composite with blue-grey wash and warm wear. */
    const plate = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.42, metalness: 0.34,
    });
    const dark = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.72, metalness: 0.55,
    });
    this.lightMat = new THREE.MeshStandardMaterial({
      color: 0x8fd7ff, emissive: 0x39b7e8, emissiveIntensity: 2.4,
      roughness: 0.35, metalness: 0, toneMapped: false,
    });

    const plateGeos = [], darkGeos = [], lightGeos = [];

    /** Paint a plate panel: pale shell, darker seams, a hint of dust. */
    const paintPlate = (geo, seed) => {
      const p = geo.attributes.position;
      const nor = geo.attributes.normal;
      const arr = new Float32Array(p.count * 3);
      const cA = new THREE.Color('#cdd3d2');
      const cB = new THREE.Color('#8f9a9d');
      const cDust = new THREE.Color('#9a8b70');
      const r2 = mulberry32(seed);
      const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const seam = Math.abs(Math.sin(p.getY(i) * 2.6 + p.getX(i) * 0.9 + seed));
        c.copy(cA).lerp(cB, 0.25 + 0.55 * (1 - seam));
        if (nor && nor.getY(i) > 0.4) c.lerp(cDust, 0.18);
        const j = (r2() - 0.5) * 0.05;
        arr[i * 3] = c.r + j; arr[i * 3 + 1] = c.g + j; arr[i * 3 + 2] = c.b + j;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return geo;
    };

    /* ---- legs: four three-segment struts, splayed, feet on the terrain ---- */
    const BODY_Y = g0 + 27.5;
    const legs = [[-5.4, -3.2], [5.4, -3.6], [-4.8, 3.4], [5.0, 3.0]];
    this.legAxes = [];
    for (let i = 0; i < legs.length; i++) {
      const [lx, lz] = legs[i];
      const footX = X + lx * 2.15, footZ = Z + lz * 2.15;
      const footY = ctx.terrain.getHeight(footX, footZ);
      const kneeX = X + lx * 1.55, kneeZ = Z + lz * 1.55;
      const kneeY = footY + 13.2;
      const hipX = X + lx * 0.78, hipZ = Z + lz * 0.78;
      // upper (hip -> knee), lower (knee -> foot), foot pad
      const build = (a, b, r0, r1, list, seed) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const g = new THREE.CylinderGeometry(r1, r0, len, 8, 1);
        paintPlate(g, seed);
        const q = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize());
        g.applyMatrix4(new THREE.Matrix4().compose(
          new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
          q, new THREE.Vector3(1, 1, 1)));
        list.push(g.toNonIndexed());
      };
      build([hipX, BODY_Y - 1.2, hipZ], [kneeX, kneeY, kneeZ], 1.15, 0.86, plateGeos, 5000 + i * 13);
      build([kneeX, kneeY, kneeZ], [footX, footY + 1.1, footZ], 0.9, 0.62, plateGeos, 5100 + i * 13);
      // knee actuator + hydraulic
      const knee = new THREE.SphereGeometry(1.15, 10, 8);
      paintPlate(knee, 5200 + i);
      knee.applyMatrix4(composeMat(kneeX, kneeY, kneeZ));
      darkGeos.push(knee.toNonIndexed());
      rustTube(darkGeos, [hipX, BODY_Y - 3.4, hipZ], [kneeX * 0.5 + footX * 0.5, kneeY - 3.0, kneeZ * 0.5 + footZ * 0.5], 0.22, 0.18, 5300 + i, N, 5);
      // foot pad: three toes
      for (let t = 0; t < 3; t++) {
        const a = Math.atan2(lz, lx) + (t - 1) * 0.75;
        const tx = footX + Math.cos(a) * 1.5, tz = footZ + Math.sin(a) * 1.5;
        const toe = new THREE.BoxGeometry(2.0, 0.55, 0.9);
        paintPlate(toe, 5400 + i * 5 + t);
        toe.applyMatrix4(composeMat((footX + tx) / 2, ctx.terrain.getHeight((footX + tx) / 2, (footZ + tz) / 2) + 0.28, (footZ + tz) / 2, 0, -a, 0.04));
        plateGeos.push(toe.toNonIndexed());
      }
      const ankle = new THREE.SphereGeometry(0.95, 10, 8);
      paintPlate(ankle, 5500 + i);
      ankle.applyMatrix4(composeMat(footX, footY + 1.0, footZ, 0, 0, 0, 1, 0.8, 1));
      darkGeos.push(ankle.toNonIndexed());

      this.legAxes.push({
        ax: hipX, ay: BODY_Y - 1.2, az: hipZ,
        bx: footX, by: footY + 0.4, bz: footZ, r: 1.25,
      });
    }

    /* ---- body: a long armoured hull slung between the hips ---- */
    {
      const hull = new THREE.CylinderGeometry(2.9, 2.9, 15.5, 12, 3);
      hull.rotateZ(Math.PI / 2);
      const p = hull.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const f = Math.abs(p.getX(v)) / 7.75;
        const k = 1 - f * f * 0.55;
        p.setY(v, p.getY(v) * k * 0.82);
        p.setZ(v, p.getZ(v) * k);
      }
      hull.computeVertexNormals();
      paintPlate(hull, 5600);
      hull.applyMatrix4(composeMat(X, BODY_Y, Z, 0, 0.18, 0));
      plateGeos.push(hull.toNonIndexed());
      // spine ribs
      for (let i = -3; i <= 3; i++) {
        const rib = new THREE.TorusGeometry(2.75, 0.22, 6, 14, Math.PI * 1.25);
        rib.rotateY(Math.PI / 2);
        rib.rotateZ(Math.PI * 0.375);
        paintPlate(rib, 5700 + i);
        rib.applyMatrix4(composeMat(X + i * 2.1, BODY_Y + 0.2, Z, 0, 0.18, 0));
        darkGeos.push(rib.toNonIndexed());
      }
      // rear vents (emissive slots)
      for (let i = 0; i < 3; i++) {
        const vent = new THREE.BoxGeometry(0.35, 0.5, 2.2);
        tint(vent, '#7fd0f0', 0.04, rng);
        vent.applyMatrix4(composeMat(X - 6.3 + i * 0.85, BODY_Y - 0.4, Z, 0, 0.18, 0));
        lightGeos.push(vent.toNonIndexed());
      }
    }

    /* ---- neck: swept tower from the hull's front to the disc mount ---- */
    const NECK_TOP = g0 + TALLNECK.height - 3.4;
    {
      const segs = 7;
      let px = X + 6.0, py = BODY_Y + 1.4, pz = Z + 1.0;
      for (let i = 0; i < segs; i++) {
        const f = (i + 1) / segs;
        const nx = X + 6.0 - f * 4.6;
        const ny = BODY_Y + 1.4 + (NECK_TOP - BODY_Y - 1.4) * f;
        const nz = Z + 1.0 - f * 1.2;
        const len = Math.hypot(nx - px, ny - py, nz - pz);
        const g = new THREE.CylinderGeometry(1.5 - f * 0.5, 1.75 - f * 0.5, len, 9, 1);
        paintPlate(g, 5800 + i * 7);
        const q = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(nx - px, ny - py, nz - pz).normalize());
        g.applyMatrix4(new THREE.Matrix4().compose(
          new THREE.Vector3((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2), q, new THREE.Vector3(1, 1, 1)));
        plateGeos.push(g.toNonIndexed());
        // collar ring between segments
        const ring = new THREE.TorusGeometry(1.55 - f * 0.45, 0.16, 6, 12);
        ring.rotateX(Math.PI / 2);
        paintPlate(ring, 5900 + i);
        ring.applyMatrix4(composeMat(nx, ny, nz));
        darkGeos.push(ring.toNonIndexed());
        px = nx; py = ny; pz = nz;
      }
      this.neckTop = new THREE.Vector3(px, py, pz);
    }

    /* ---- the disc: 26 m of survey array, its own node so it can turn ---- */
    {
      const disc = new THREE.Group();
      disc.name = 'tallneck-disc';
      disc.position.copy(this.neckTop);
      const dGeos = [], dDark = [], dLight = [];
      const R = TALLNECK.discR;
      const body = new THREE.CylinderGeometry(R, R * 0.94, 1.9, 40, 1);
      paintPlate(body, 6000);
      dGeos.push(body.toNonIndexed());
      // upper dome
      const dome = new THREE.SphereGeometry(R * 0.55, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.4);
      paintPlate(dome, 6010);
      dome.translate(0, 0.9, 0);
      dGeos.push(dome.toNonIndexed());
      // underside dish
      const dish = new THREE.SphereGeometry(R * 0.8, 28, 10, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38);
      paintPlate(dish, 6020);
      dish.translate(0, -0.7, 0);
      dGeos.push(dish.toNonIndexed());
      // radial panel ribs
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const rib = new THREE.BoxGeometry(R * 0.9, 0.42, 0.55);
        paintPlate(rib, 6100 + i);
        rib.applyMatrix4(composeMat(Math.cos(a) * R * 0.52, 1.15, Math.sin(a) * R * 0.52, 0, -a, 0));
        dDark.push(rib.toNonIndexed());
      }
      // rim light band + the eye
      const rim = new THREE.TorusGeometry(R * 0.99, 0.2, 6, 48);
      rim.rotateX(Math.PI / 2);
      tint(rim, '#9fe4ff', 0.03, rng);
      dLight.push(rim.toNonIndexed());
      const eye = new THREE.CylinderGeometry(1.5, 1.9, 1.4, 16);
      tint(eye, '#bdf0ff', 0.03, rng);
      eye.translate(0, -1.5, 0);
      dLight.push(eye.toNonIndexed());
      // four survey antennae on the rim
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const ant = new THREE.CylinderGeometry(0.09, 0.14, 4.4, 6);
        paintPlate(ant, 6200 + i);
        ant.applyMatrix4(composeMat(Math.cos(a) * R * 0.86, 3.0, Math.sin(a) * R * 0.86, 0.16 * Math.cos(a), 0, 0.16 * Math.sin(a)));
        dDark.push(ant.toNonIndexed());
      }
      const dm = bake(dGeos, plate, { name: 'tallneck-disc-plate' });
      const dd = bake(dDark, dark, { name: 'tallneck-disc-dark' });
      const dl = bake(dLight, this.lightMat, { name: 'tallneck-disc-light', castShadow: false });
      for (const m of [dm, dd, dl]) if (m) disc.add(m);
      this.group.add(disc);
      this.disc = disc;
    }

    /* ---- the climb: a felled pylon leaning on the rear leg, with a landing */
    {
      const ax = X - 16.5, az = Z - 11.5;
      const ay = ctx.terrain.getHeight(ax, az);
      const bx = X - 6.2, bz = Z - 4.6;
      const by = ay + 9.4;
      for (const s of [-1.4, 1.4]) {
        rustTube(darkGeos, [ax + s * 0.6, ay + 0.2, az - s * 0.6], [bx + s * 0.5, by, bz - s * 0.5], 0.2, 0.16, 6300 + s, N, 5);
      }
      for (let i = 0; i < 9; i++) {
        const f = (i + 0.5) / 9;
        const rx = ax + (bx - ax) * f, rz = az + (bz - az) * f;
        const ry = ay + 0.2 + (by - ay - 0.2) * f;
        rustTube(darkGeos, [rx - 1.2, ry, rz + 1.2], [rx + 1.2, ry, rz - 1.2], 0.09, 0.09, 6320 + i, N, 4);
      }
      const land = new THREE.BoxGeometry(5.2, 0.35, 4.2, 3, 1, 3);
      paintRust(land, 6400, N, 99, 1.2);
      land.applyMatrix4(composeMat(bx - 0.4, by + 0.2, bz - 0.4, 0.02, 0.5, 0.01));
      darkGeos.push(land.toNonIndexed());
      for (const [rx, rz] of [[-2.4, -1.9], [2.4, -1.9], [2.4, 1.9], [-2.4, 1.9]]) {
        rustTube(darkGeos, [bx - 0.4 + rx, by + 0.3, bz - 0.4 + rz], [bx - 0.4 + rx, by + 1.3, bz - 0.4 + rz], 0.06, 0.05, 6420 + rx, N, 4);
      }
      this.landing = new THREE.Vector3(bx - 0.4, by + 0.5, bz - 0.4);
    }

    const m1 = bake(plateGeos, plate, { name: 'tallneck-plate' });
    const m2 = bake(darkGeos, dark, { name: 'tallneck-frame' });
    const m3 = bake(lightGeos, this.lightMat, { name: 'tallneck-lights', castShadow: false });
    for (const m of [m1, m2, m3]) if (m) this.group.add(m);
    ctx.scene.add(this.group);

    // A tall lamp so the disc reads at night without a shadow-casting light.
    this._t = 0;
  }

  /** Explicit collider descriptors — `props.js` registers these with `spatial`. */
  colliders() {
    const out = [];
    for (const a of this.legAxes) {
      out.push({
        kind: 'landmark',
        shape: { type: 'capsule', a: [a.ax, a.ay, a.az], b: [a.bx, a.by, a.bz], radius: a.r },
        blocking: true, occluder: true, camera: true, ref: this.group,
      });
    }
    out.push({
      kind: 'landmark',
      shape: {
        type: 'box',
        c: [this.base.x, this.base.y + 27.5, this.base.z],
        half: [8.2, 3.2, 3.4], yaw: 0.18,
      },
      blocking: true, occluder: true, camera: true, ref: this.group,
    });
    /**
     * The NECK and the DISC. Without these the 26 m survey disc 42 m up — the
     * single most visible object on the north bearing — was invisible to every
     * line-of-sight query in the game: gate `V34-midground` scored the north
     * vista at 3 rays because the only Tallneck collider was the hull, and a
     * machine's `occluded()` test would have looked straight through the disc.
     */
    out.push({
      kind: 'landmark',
      shape: {
        type: 'capsule',
        a: [this.base.x + 6.0, this.base.y + 28.9, this.base.z + 1.0],
        b: [this.neckTop.x, this.neckTop.y, this.neckTop.z],
        radius: 1.6,
      },
      blocking: true, occluder: true, camera: true, ref: this.group,
    });
    out.push({
      kind: 'landmark',
      shape: {
        type: 'box',
        c: [this.neckTop.x, this.neckTop.y + 0.3, this.neckTop.z],
        half: [TALLNECK.discR, 2.4, TALLNECK.discR], yaw: 0,
      },
      blocking: true, occluder: true, camera: true, ref: this.group,
    });
    // the climb ramp reads as a solid so she cannot walk through it
    out.push({
      kind: 'landmark',
      shape: {
        type: 'capsule',
        a: [this.base.x - 16.5, this.base.y + 0.6, this.base.z - 11.5],
        b: [this.landing.x, this.landing.y, this.landing.z],
        radius: 1.5,
      },
      blocking: true, occluder: false, camera: true, ref: this.group,
    });
    return out;
  }

  update(dt, t) {
    // 0.6 deg/s survey sweep + a slow lamp breath. Two writes, no allocation.
    this.disc.rotation.y = t * 0.0105;
    this.lightMat.emissiveIntensity = 2.1 + 0.55 * Math.sin(t * 0.7);
  }
}

/* -------------------------------------------------------------------------- */
/*                                  LOOKOUT                                    */
/* -------------------------------------------------------------------------- */

/**
 * 14.2 m Nora watch-post. Builds into the caller's wood/cloth buckets so it
 * merges with the rest of `world-props` — one mesh, seeded as kind `'tower'`.
 */
export function buildLookout(ctx, wood, cloth) {
  const X = LOOKOUT.x, Z = LOOKOUT.z;
  const rng = mulberry32(0x100C);
  const N = new SimplexNoise(1717);
  const H = LOOKOUT.height;
  const gyAt = (x, z) => ctx.terrain.getHeight(x, z);
  const wc = '#5b4630', dk = '#463322', lash = '#6f5a3c';

  // four raked legs, lashed, with three tiers of X-bracing
  const legs = [[-2.6, -2.6], [2.6, -2.6], [2.6, 2.6], [-2.6, 2.6]];
  const topY = [];
  for (const [lx, lz] of legs) {
    const gx = X + lx, gz = Z + lz;
    const gy = gyAt(gx, gz);
    topY.push(gy + H);
    tube(wood, [gx, gy - 0.4, gz], [X + lx * 0.42, gy + H, Z + lz * 0.42], 0.19, 0.12, wc, 7, 0.07, rng);
  }
  const platY = Math.min(...topY) - 0.5;
  const gBase = gyAt(X, Z);
  for (let tier = 0; tier < 3; tier++) {
    const f0 = 0.14 + tier * 0.28, f1 = f0 + 0.28;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 4];
      const s0 = 1 - f0 * 0.58, s1 = 1 - f1 * 0.58;
      const y0 = gBase + (platY - gBase) * f0, y1 = gBase + (platY - gBase) * f1;
      tube(wood, [X + ax * s0, y0, Z + az * s0], [X + bx * s1, y1, Z + bz * s1], 0.075, 0.06, dk, 5, 0.07, rng);
      tube(wood, [X + bx * s0, y0, Z + bz * s0], [X + ax * s1, y1, Z + az * s1], 0.075, 0.06, dk, 5, 0.07, rng);
      // girt ring
      tube(wood, [X + ax * s1, y1, Z + az * s1], [X + bx * s1, y1, Z + bz * s1], 0.065, 0.065, lash, 5, 0.06, rng);
    }
  }
  // platform deck
  for (let i = 0; i < 12; i++) {
    const off = (i - 5.5) * 0.42;
    const plank = new THREE.BoxGeometry(5.0, 0.08, 0.38);
    tint(plank, i % 2 ? '#6a5138' : '#5f4931', 0.09, rng);
    plank.applyMatrix4(composeMat(X, platY + (i % 2) * 0.015, Z + off, 0, 0.015 * ((i % 3) - 1), 0));
    wood.push(plank);
  }
  // rim beams
  for (const s of [-1, 1]) {
    tube(wood, [X - 2.6, platY - 0.1, Z + s * 2.5], [X + 2.6, platY - 0.1, Z + s * 2.5], 0.11, 0.11, dk, 6, 0.06, rng);
    tube(wood, [X + s * 2.5, platY - 0.1, Z - 2.6], [X + s * 2.5, platY - 0.1, Z + 2.6], 0.11, 0.11, dk, 6, 0.06, rng);
  }
  // railing posts + two rails
  const posts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const px = X + Math.cos(a) * 2.35, pz = Z + Math.sin(a) * 2.35;
    posts.push([px, pz]);
    tube(wood, [px, platY, pz], [px, platY + 1.05, pz], 0.055, 0.045, wc, 5, 0.07, rng);
  }
  for (const h of [0.55, 1.0]) {
    for (let i = 0; i < 12; i++) {
      const [ax, az] = posts[i], [bx, bz] = posts[(i + 1) % 12];
      tube(wood, [ax, platY + h, az], [bx, platY + h, bz], 0.04, 0.04, dk, 4, 0.06, rng);
    }
  }
  // canopy: four raked poles and a sagging hide roof over the north half
  for (const [px, pz] of [[-2.0, 1.9], [2.0, 1.9], [-2.0, -0.4], [2.0, -0.4]]) {
    tube(wood, [X + px, platY, Z + pz], [X + px * 0.78, platY + 2.5, Z + pz * 0.78], 0.06, 0.045, wc, 5, 0.07, rng);
  }
  {
    const hide = new THREE.BoxGeometry(4.6, 0.05, 3.3, 8, 1, 6);
    const p = hide.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const fx = p.getX(i) / 4.6 + 0.5, fz = p.getZ(i) / 3.3 + 0.5;
      p.setY(i, p.getY(i) - Math.sin(fx * Math.PI) * Math.sin(fz * Math.PI) * 0.34
        + N.noise2D(fx * 4, fz * 4) * 0.04);
    }
    hide.computeVertexNormals();
    const n = p.count;
    const arr = new Float32Array(n * 3);
    const pal = ['#a86f44', '#7c4a2b', '#96613c'].map((c) => new THREE.Color(c));
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const fx = Math.min(2, ((p.getX(i) / 4.6 + 0.5) * 3) | 0);
      const fz = Math.min(1, ((p.getZ(i) / 3.3 + 0.5) * 2) | 0);
      c.copy(pal[(fx * 3 + fz * 5) % 3]).multiplyScalar(0.82 + rng() * 0.28);
      arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
    }
    hide.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    hide.applyMatrix4(composeMat(X, platY + 2.42, Z + 0.75, 0.14, 0, 0));
    cloth.push(hide);
  }
  // the ladder, on the camp-facing side
  {
    const lz = Z - 2.9, ly0 = gyAt(X, lz);
    for (const s of [-1, 1]) {
      tube(wood, [X + s * 0.36, ly0 - 0.15, lz], [X + s * 0.3, platY + 0.35, lz + 0.75], 0.055, 0.05, wc, 5, 0.06, rng);
    }
    const rungs = 15;
    for (let i = 0; i < rungs; i++) {
      const f = (i + 0.5) / rungs;
      const ry = ly0 - 0.15 + (platY + 0.4 - ly0) * f;
      const rz = lz + 0.75 * f;
      tube(wood, [X - 0.34, ry, rz], [X + 0.34, ry, rz], 0.032, 0.032, dk, 4, 0.06, rng);
    }
  }
  // banner on a pole: the Nora sight-mark, visible from the camp
  {
    const bx = X + 2.2, bz = Z - 1.6;
    tube(wood, [bx, platY, bz], [bx, platY + 4.2, bz], 0.06, 0.04, dk, 5, 0.06, rng);
    const flag = new THREE.PlaneGeometry(1.5, 2.4, 5, 6);
    const p = flag.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / 1.5 + 0.5;
      p.setZ(i, Math.sin(u * 4.2) * 0.14 * u);
    }
    flag.computeVertexNormals();
    tint(flag, '#8f3a2a', 0.1, rng);
    flag.applyMatrix4(composeMat(bx + 0.78, platY + 2.7, bz, 0, Math.PI / 2, 0));
    cloth.push(flag);
  }
  // a small stone brazier at the foot so the tower reads at dusk
  {
    const fx = X + 3.4, fz = Z - 2.2;
    const fy = gyAt(fx, fz);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const s = 0.24 + rng() * 0.12;
      const st = new THREE.DodecahedronGeometry(s, 0);
      tint(st, '#6f6a60', 0.1, rng);
      st.applyMatrix4(composeMat(fx + Math.cos(a) * 0.66, fy + s * 0.5, fz + Math.sin(a) * 0.66, rng(), rng() * 6.28, rng()));
      wood.push(st);
    }
  }
  return { x: X, z: Z, platformY: platY, height: H };
}
