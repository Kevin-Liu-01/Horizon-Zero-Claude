import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const ARROW_LEN = 0.78;

/* ------------------------- shared textures/materials ---------------------- */

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const flameTex = radialTexture([
  [0, 'rgba(255,244,200,1)'],
  [0.3, 'rgba(255,170,60,0.9)'],
  [0.65, 'rgba(255,90,15,0.45)'],
  [1, 'rgba(255,60,0,0)'],
]);
const glowTex = radialTexture([
  [0, 'rgba(220,248,255,1)'],
  [0.35, 'rgba(100,205,255,0.65)'],
  [1, 'rgba(30,110,255,0)'],
]);

const flameMat = new THREE.SpriteMaterial({
  map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffb050,
});
const shockMat = new THREE.SpriteMaterial({
  map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x7fd4ff,
});

// pale ash shaft so arrows read against dark machine plating at combat range
const shaftMat = new THREE.MeshStandardMaterial({ color: 0xc9a86b, roughness: 0.72 });
const headMats = {
  hunter: new THREE.MeshStandardMaterial({
    color: 0xc4ced6, metalness: 0.9, roughness: 0.3,
    emissive: 0xd8ecf4, emissiveIntensity: 0.85,
  }),
  fire: new THREE.MeshStandardMaterial({
    color: 0x7a4020, metalness: 0.6, roughness: 0.4,
    emissive: 0xff5a1a, emissiveIntensity: 1.6,
  }),
  shock: new THREE.MeshStandardMaterial({
    color: 0x2a4a5c, metalness: 0.7, roughness: 0.35,
    emissive: 0x37c9ff, emissiveIntensity: 1.8,
  }),
};
const fletchMats = {
  hunter: new THREE.MeshStandardMaterial({
    color: 0xf7ecd0, roughness: 0.85, emissive: 0x8a7a4e, emissiveIntensity: 0.45,
  }),
  fire: new THREE.MeshStandardMaterial({
    color: 0xff8a3a, roughness: 0.85, emissive: 0xff5a14, emissiveIntensity: 0.8,
  }),
  shock: new THREE.MeshStandardMaterial({
    color: 0x8fd8ff, roughness: 0.85, emissive: 0x2ea8e8, emissiveIntensity: 0.8,
  }),
};

/* ---------------------------- shared geometries --------------------------- */

const shaftGeo = new THREE.CylinderGeometry(0.0048, 0.0048, ARROW_LEN - 0.05, 5, 1)
  .rotateX(Math.PI / 2).translate(0, 0, (ARROW_LEN - 0.05) / 2);
// head + a small tail-tip nub merged into one mesh: the per-type (emissive)
// head material lights BOTH ends of a stuck arrow at zero extra draw calls.
const headGeo = mergeGeometries([
  new THREE.ConeGeometry(0.012, 0.06, 6)
    .rotateX(Math.PI / 2).translate(0, 0, ARROW_LEN - 0.03),
  // tail nub is what the shooter sees of their own stuck arrow (dead-on),
  // so it is deliberately chunky
  new THREE.CylinderGeometry(0.016, 0.011, 0.05, 6)
    .rotateX(Math.PI / 2).translate(0, 0, 0.025),
]);

const finsGeo = (() => {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.BoxGeometry(0.0026, 0.046, 0.115)
      .translate(0, 0.027, 0.078)
      .rotateZ((i / 3) * Math.PI * 2);
    parts.push(fin);
  }
  return mergeGeometries(parts);
})();

const NOOP_RAYCAST = () => {};

/** Builds one arrow visual; origin at the tail, tip at +Z * ARROW_LEN. */
export function makeArrow() {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  const head = new THREE.Mesh(headGeo, headMats.hunter);
  const fins = new THREE.Mesh(finsGeo, fletchMats.hunter);
  shaft.castShadow = true;
  const flame = new THREE.Sprite(flameMat);
  flame.position.set(0, 0.015, ARROW_LEN - 0.1);
  flame.scale.setScalar(0.09);
  flame.visible = false;
  const glow = new THREE.Sprite(shockMat);
  glow.position.set(0, 0, ARROW_LEN - 0.08);
  glow.scale.setScalar(0.15);
  glow.visible = false;
  group.add(shaft, head, fins, flame, glow);
  // arrows must never intercept combat/aim raycasts
  group.traverse((o) => { o.raycast = NOOP_RAYCAST; });
  return { group, head, fins, flame, glow };
}

export function setArrowType(arrow, type) {
  arrow.head.material = headMats[type] ?? headMats.hunter;
  arrow.fins.material = fletchMats[type] ?? fletchMats.hunter;
  arrow.flame.visible = type === 'fire';
  arrow.glow.visible = type === 'shock';
}

/* -------------------------------- the pool -------------------------------- */

// broad-phase capsule radii / center heights per machine kind
const HIT_RADII = { watcher: 2.6, sawtooth: 3.6, behemoth: 5.2, thunderjaw: 10, aloy: 0 };
const HIT_CY = { watcher: 1.0, sawtooth: 1.2, behemoth: 2.2, thunderjaw: 3.6 };

const TRAIL_COLORS = {
  hunter: [0.62, 0.52, 0.34],
  fire: [1.0, 0.45, 0.12],
  shock: [0.3, 0.75, 1.0],
};

const _Z = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();
const _oldTip = new THREE.Vector3();
const _newTip = new THREE.Vector3();
const _segDir = new THREE.Vector3();
const _c = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ap = new THREE.Vector3();
const _cl = new THREE.Vector3();
const _hitP = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ray = new THREE.Raycaster();
const _s = new THREE.Vector3();

function distPointSeg(p, a, b) {
  _ab.subVectors(b, a);
  const lsq = _ab.lengthSq();
  if (lsq < 1e-10) return p.distanceTo(a);
  const t = THREE.MathUtils.clamp(_ap.subVectors(p, a).dot(_ab) / lsq, 0, 1);
  _cl.copy(a).addScaledVector(_ab, t);
  return _cl.distanceTo(p);
}

export class ArrowPool {
  constructor(ctx, trailFx, size = 28) {
    this.ctx = ctx;
    this.trailFx = trailFx;
    this.onImpact = null; // ({point, normal, object, machine, dir, type, baseDamage, draw}) => void
    this.list = [];
    for (let i = 0; i < size; i++) {
      const a = makeArrow();
      a.group.visible = false;
      a.mode = 'idle'; // idle | fly | stuck
      a.fresh = false;
      a.pos = new THREE.Vector3(); // tail position
      a.vel = new THREE.Vector3();
      a.type = 'hunter';
      a.baseDamage = 0;
      a.draw = 0;
      a.age = 0;
      a.seed = Math.random() * 20;
      ctx.scene.add(a.group);
      this.list.push(a);
    }
  }

  _alloc() {
    let best = null, bestScore = -1;
    for (const a of this.list) {
      // prefer idle, then oldest stuck, then oldest flying
      const score = a.mode === 'idle' ? 1e9 : (a.mode === 'stuck' ? 1e5 : 0) + a.age;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  fire(origin, dir, speed, type, baseDamage, draw) {
    const a = this._alloc();
    if (a.group.parent !== this.ctx.scene) {
      a.group.parent?.remove(a.group);
      this.ctx.scene.add(a.group);
    }
    a.group.scale.setScalar(1);
    a.group.visible = true;
    a.mode = 'fly';
    a.age = 0;
    a.fresh = true; // first collision segment sweeps from the tail, not the tip
    a.type = type;
    a.baseDamage = baseDamage;
    a.draw = draw;
    setArrowType(a, type);
    a.pos.copy(origin);
    a.vel.copy(dir).multiplyScalar(speed);
    _q.setFromUnitVectors(_Z, dir);
    a.group.quaternion.copy(_q);
    a.group.position.copy(a.pos);
    return a;
  }

  /**
   * Plant an already-resolved hit (point-blank shots the flight sweep can't
   * see because the nock spawns inside the target). Sticks an arrow at
   * `point` along `dir` and parents it to the machine so it rides along.
   */
  stickImmediate(point, dir, type, machine) {
    const a = this._alloc();
    if (a.group.parent !== this.ctx.scene) {
      a.group.parent?.remove(a.group);
      this.ctx.scene.add(a.group);
    }
    a.group.scale.setScalar(1);
    a.group.visible = true;
    a.mode = 'stuck';
    a.age = 0;
    a.type = type;
    setArrowType(a, type);
    a.vel.set(0, 0, 0);
    a.pos.copy(point).addScaledVector(dir, -(ARROW_LEN - 0.12));
    a.group.position.copy(a.pos);
    _q.setFromUnitVectors(_Z, dir);
    a.group.quaternion.copy(_q);
    if (machine?.root) machine.root.attach(a.group);
    return a;
  }

  _recycle(a) {
    a.mode = 'idle';
    a.group.visible = false;
    if (a.group.parent !== this.ctx.scene) {
      a.group.parent?.remove(a.group);
      this.ctx.scene.add(a.group);
    }
  }

  update(dt, t) {
    const machines = this.ctx.machines?.list;
    for (const a of this.list) {
      if (a.mode === 'idle') continue;
      if (a.mode === 'fly') this._stepFly(a, dt, machines);
      else {
        a.age += dt;
        if (a.age > 10) {
          const k = 1 - (a.age - 10) / 0.35;
          if (k <= 0.02) { this._recycle(a); continue; }
          a.group.scale.setScalar(k);
        }
      }
      // elemental flicker
      if (a.type === 'fire' && a.group.visible) {
        const s = 0.085 * (1 + 0.35 * Math.sin(t * 23 + a.seed) * Math.sin(t * 31 + a.seed * 2));
        a.flame.scale.set(s, s * 1.5, 1);
      } else if (a.type === 'shock' && a.group.visible) {
        const s = 0.15 * (1 + 0.2 * Math.sin(t * 15 + a.seed));
        a.glow.scale.set(s, s, 1);
      }
    }
  }

  _stepFly(a, dt, machines) {
    a.age += dt;
    if (a.age > 12 || a.pos.y < -80) { this._recycle(a); return; }
    if (dt <= 0) return;

    _dir.copy(a.vel).normalize();
    _oldTip.copy(a.pos);
    // after the first step the tail has already swept the tip's start point
    if (!a.fresh) _oldTip.addScaledVector(_dir, ARROW_LEN);
    a.fresh = false;

    a.vel.y -= 9.8 * dt;
    a.vel.multiplyScalar(Math.max(0, 1 - 0.05 * dt)); // slight drag
    a.pos.addScaledVector(a.vel, dt);
    _dir.copy(a.vel).normalize();
    _newTip.copy(a.pos).addScaledVector(_dir, ARROW_LEN);

    _q.setFromUnitVectors(_Z, _dir);
    a.group.quaternion.copy(_q);
    a.group.position.copy(a.pos);

    _segDir.subVectors(_newTip, _oldTip);
    const segLen = _segDir.length();
    if (segLen < 1e-6) return;
    _segDir.multiplyScalar(1 / segLen);

    let hitDist = Infinity, hitObj = null, hitMachine = null;

    // --- machines: sphere broad-phase, then precise raycast of the segment
    if (machines) {
      for (const m of machines) {
        if (m.alive === false || !m.root) continue;
        const r = HIT_RADII[m.kind] ?? 2.5;
        if (r <= 0) continue;
        _c.copy(m.position);
        _c.y += HIT_CY[m.kind] ?? 1.2;
        if (distPointSeg(_c, _oldTip, _newTip) > r) continue;
        _ray.camera = this.ctx.camera; // machines may contain Sprites (eye glows)
        _ray.set(_oldTip, _segDir);
        _ray.near = 0;
        _ray.far = Math.min(segLen, hitDist);
        const hits = _ray.intersectObject(m.root, true);
        if (hits.length && hits[0].distance < hitDist) {
          hitDist = hits[0].distance;
          hitObj = hits[0].object;
          hitMachine = m;
        }
      }
    }

    // --- terrain: analytic march + bisection along the segment
    const terr = this.ctx.terrain;
    if (terr) {
      const step = 0.3;
      let sPrev = 0;
      let abovePrev = _oldTip.y > terr.getHeight(_oldTip.x, _oldTip.z);
      if (!abovePrev) {
        if (0 < hitDist) { hitDist = 0; hitObj = null; hitMachine = null; }
      } else {
        const limit = Math.min(segLen, hitDist);
        for (let s = step; sPrev < limit; s += step) {
          const sc = Math.min(s, limit);
          _s.copy(_oldTip).addScaledVector(_segDir, sc);
          const above = _s.y > terr.getHeight(_s.x, _s.z);
          if (!above) {
            // bisect [sPrev, sc]
            let lo = sPrev, hi = sc;
            for (let i = 0; i < 7; i++) {
              const mid = (lo + hi) / 2;
              _s.copy(_oldTip).addScaledVector(_segDir, mid);
              if (_s.y > terr.getHeight(_s.x, _s.z)) lo = mid; else hi = mid;
            }
            if (hi < hitDist) { hitDist = hi; hitObj = null; hitMachine = null; }
            break;
          }
          sPrev = sc;
          if (sc >= limit) break;
        }
      }
    }

    // --- tracer trail breadcrumbs
    if (this.trailFx) {
      const col = TRAIL_COLORS[a.type] ?? TRAIL_COLORS.hunter;
      const n = Math.min(5, Math.max(1, Math.ceil(segLen / 0.4)));
      const end = Number.isFinite(hitDist) ? hitDist : segLen;
      for (let i = 0; i < n; i++) {
        const s = end * ((i + 0.5) / n);
        _s.copy(_oldTip).addScaledVector(_segDir, s);
        const elemental = a.type !== 'hunter';
        this.trailFx.emit(
          _s.x, _s.y, _s.z,
          (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4 + 0.15, (Math.random() - 0.5) * 0.4,
          col[0], col[1], col[2],
          (elemental ? 0.09 : 0.06) + Math.random() * 0.05,
          (elemental ? 0.22 : 0.16) + Math.random() * 0.1,
        );
      }
    }

    if (!Number.isFinite(hitDist)) return;

    // --- impact
    _hitP.copy(_oldTip).addScaledVector(_segDir, hitDist);
    // plant the arrow with the tip embedded ~12cm
    a.pos.copy(_hitP).addScaledVector(_segDir, -(ARROW_LEN - 0.12));
    a.group.position.copy(a.pos);
    _q.setFromUnitVectors(_Z, _segDir);
    a.group.quaternion.copy(_q);
    a.mode = 'stuck';
    a.age = 0;
    a.vel.set(0, 0, 0);

    if (hitMachine?.root) hitMachine.root.attach(a.group); // ride along with the machine

    if (hitMachine) _n.copy(_segDir).negate();
    else if (this.ctx.terrain) this.ctx.terrain.getNormal(_hitP.x, _hitP.z, _n);
    else _n.set(0, 1, 0);

    this.onImpact?.({
      point: _hitP,          // scratch — consumer must clone to retain
      normal: _n,            // scratch
      dir: _segDir,          // scratch
      object: hitObj,
      machine: hitMachine,
      type: a.type,
      baseDamage: a.baseDamage,
      draw: a.draw,
    });
  }
}
