import * as THREE from 'three';

/**
 * MachineFx — ONE instanced billboard pool for every machine particle
 * (`perf-tech-07`: "per-particle materials").
 *
 * Round 3 spawned a `THREE.Sprite` with its OWN `SpriteMaterial` for every
 * dust puff, smoke wisp, flame lick and shock arc. Measured on the staged
 * 8-machine fight (`tools/gates.mjs --only A21-real-draw-calls`): **58 live
 * unnamed dust sprites = 58 draw calls**, the single largest term in A21's
 * 157-call overage, plus 58 material allocations per second of combat.
 *
 * This is all of them in ONE `THREE.Points` draw:
 *
 * - a fixed-capacity ring buffer (`MAX`), zero allocation after construction
 * - per-particle size / colour / opacity / rotation-free billboarding in the
 *   vertex shader (`gl_PointSize` with perspective attenuation)
 * - one shared additive and one shared alpha-blended pass, because a machine's
 *   FX vocabulary is exactly "hot" (sparks, flame, arcs) and "cold" (dust,
 *   smoke) — 2 draws total for every particle of every machine on screen
 * - `attachFxPool(machine)` shadows the per-instance FX spawners so the pool
 *   is used without editing `machine.js` (owned by `machine-ai`)
 *
 * Published as `ctx.machineFx`. See §"Published API" in the lane report:
 * `machine-ai` should call `ctx.machineFx.puff(...)` directly once it lands.
 */

const MAX = 512;
const _c = new THREE.Color();
const _p = new THREE.Vector3();

/** Soft radial alpha sprite, generated once and shared by both passes. */
function puffTexture() {
  const s = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VERT = /* glsl */`
  attribute float aSize;
  attribute float aOpacity;
  attribute vec3 aColor;
  varying float vOpacity;
  varying vec3 vColor;
  void main() {
    vOpacity = aOpacity;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // aSize is a WORLD diameter; 2*fovScale converts it to pixels
    gl_PointSize = aSize * uPixelsPerMeter / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  uniform sampler2D uMap;
  varying float vOpacity;
  varying vec3 vColor;
  void main() {
    if (vOpacity <= 0.002) discard;
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor, t.a * vOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

class Pass {
  constructor(map, additive, renderOrder) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.opacity = new Float32Array(MAX);
    this.color = new Float32Array(MAX * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aOpacity', new THREE.BufferAttribute(this.opacity, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uPixelsPerMeter: { value: 600 } },
      vertexShader: `uniform float uPixelsPerMeter;\n${VERT}`,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: !additive,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    this.points.name = 'machine-fx';
    this.count = 0;
    // live particles, packed [0, count)
    this.life = new Float32Array(MAX);
    this.dur = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.size0 = new Float32Array(MAX);
    this.grow = new Float32Array(MAX);
    this.peak = new Float32Array(MAX);
    this.flick = new Uint8Array(MAX);
  }

  spawn(x, y, z, opts) {
    let i = this.count;
    if (i >= MAX) {
      // pool full: recycle the oldest (largest life fraction)
      let worst = 0, wk = -1;
      for (let j = 0; j < MAX; j++) {
        const k = this.life[j] / this.dur[j];
        if (k > wk) { wk = k; worst = j; }
      }
      i = worst;
    } else {
      this.count++;
    }
    const o3 = i * 3;
    this.pos[o3] = x; this.pos[o3 + 1] = y; this.pos[o3 + 2] = z;
    this.vel[o3] = opts.vx || 0; this.vel[o3 + 1] = opts.vy || 0; this.vel[o3 + 2] = opts.vz || 0;
    _c.set(opts.color ?? 0xffffff);
    this.color[o3] = _c.r; this.color[o3 + 1] = _c.g; this.color[o3 + 2] = _c.b;
    this.size0[i] = opts.size || 0.6;
    this.grow[i] = opts.grow ?? 1.0;
    this.peak[i] = opts.peak ?? 0.6;
    this.dur[i] = Math.max(0.05, opts.dur ?? 1);
    this.life[i] = 0;
    this.flick[i] = opts.flicker ? 1 : 0;
    this.size[i] = this.size0[i];
    this.opacity[i] = 0;
    return i;
  }

  /**
   * Is this glow record's machine gone?
   *
   * ROUND-4 FIX ROUND 1. `detachGlowsOf()` had no caller anywhere in the repo,
   * and `machine-ai`'s `sites.dispose()` (not this lane's file) removes the
   * machine root without telling the pool — so every despawn leaked its
   * records forever. They kept resolving a world position from a matrix the
   * renderer no longer updates, and because leaked records sit at the FRONT of
   * the array while `writeGlows` stops at MAX, it was the LIVING machines' eye
   * glows that got dropped once respawns pushed past the cap. Measured before:
   * glowsBefore 75, glowsAfter 75, stillWriting 75 after one dispose.
   *
   * So the pool prunes itself, on the two conditions that are true for a
   * disposed machine and false for a live one, and costs two property reads.
   */
  _glowDead(g) {
    if (!g.obj || !g.obj.parent) return true;
    if (g.machine && g.machine._disposed) return true;
    if (g.root && !g.root.parent) return true;
    return false;
  }

  /** Persistent glows tracked from a live Object3D (machine eyes). */
  writeGlows(glows, base) {
    // self-prune: compact the record list in place (no allocation, order-free)
    let w = 0;
    for (let i = 0; i < glows.length; i++) {
      const g = glows[i];
      if (this._glowDead(g)) { if (g.obj) g.obj.visible = true; continue; }
      glows[w++] = g;
    }
    glows.length = w;

    let n = base;
    for (let i = 0; i < glows.length && n < MAX; i++) {
      const g = glows[i];
      const obj = g.obj;
      if (!g.enabled) continue;
      obj.getWorldPosition(_p);
      const o3 = n * 3;
      this.pos[o3] = _p.x; this.pos[o3 + 1] = _p.y; this.pos[o3 + 2] = _p.z;
      const m = g.mat;
      // an emissive-sourced glow tracks the material the EYE-STATE system
      // writes (blue / yellow / red / telegraph white / dark on death), so a
      // pooled accent still reports the machine's state
      if (g.emissive && m && m.emissive) {
        _c.copy(m.emissive);
        this.opacity[n] = THREE.MathUtils.clamp((m.emissiveIntensity ?? 1) / 2.4, 0, 1) * g.gain;
      } else {
        _c.copy(m ? m.color : g.color);
        this.opacity[n] = (m ? m.opacity : 1) * g.gain;
      }
      this.color[o3] = _c.r; this.color[o3 + 1] = _c.g; this.color[o3 + 2] = _c.b;
      this.size[n] = g.size * (obj.scale?.x ? Math.max(0.2, obj.scale.x / (g.scale0 || 1)) : 1);
      n++;
    }
    return n;
  }

  update(dt) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] += dt;
      const k = this.life[i] / this.dur[i];
      if (k >= 1) {
        // swap-remove with the last live particle (packed, order-free)
        n--;
        if (i !== n) {
          const a = i * 3, b = n * 3;
          this.pos[a] = this.pos[b]; this.pos[a + 1] = this.pos[b + 1]; this.pos[a + 2] = this.pos[b + 2];
          this.vel[a] = this.vel[b]; this.vel[a + 1] = this.vel[b + 1]; this.vel[a + 2] = this.vel[b + 2];
          this.color[a] = this.color[b]; this.color[a + 1] = this.color[b + 1]; this.color[a + 2] = this.color[b + 2];
          this.life[i] = this.life[n]; this.dur[i] = this.dur[n];
          this.size0[i] = this.size0[n]; this.grow[i] = this.grow[n];
          this.peak[i] = this.peak[n]; this.flick[i] = this.flick[n];
        }
        i--;
        continue;
      }
      const o3 = i * 3;
      this.pos[o3] += this.vel[o3] * dt;
      this.pos[o3 + 1] += this.vel[o3 + 1] * dt;
      this.pos[o3 + 2] += this.vel[o3 + 2] * dt;
      this.size[i] = this.size0[i] * (1 + k * this.grow[i]);
      const fade = Math.min(1, k * 4) * (1 - k * k);
      this.opacity[i] = this.peak[i] * fade * (this.flick[i] ? (0.45 + Math.random() * 0.55) : 1);
    }
    this.count = n;
    const total = this.glows ? this.writeGlows(this.glows, n) : n;
    const g = this.geo;
    g.setDrawRange(0, total);
    n = total;
    if (n > 0) {
      g.attributes.position.needsUpdate = true;
      g.attributes.aSize.needsUpdate = true;
      g.attributes.aOpacity.needsUpdate = true;
      g.attributes.aColor.needsUpdate = true;
    }
    this.points.visible = n > 0;
  }
}

export class MachineFx {
  constructor(ctx) {
    this.ctx = ctx;
    const map = puffTexture();
    this.map = map;
    this.cold = new Pass(map, false, 2);
    this.hot = new Pass(map, true, 3);
    // sustained machine eye halos ride the same additive draw as the sparks
    this.hot.glows = [];
    const root = new THREE.Group();
    root.name = 'machine-fx';
    root.add(this.cold.points, this.hot.points);
    ctx.scene.add(root);
    this.root = root;
    this._px = 600;
    this._h = 0;
    this._fov = 0;
    this.resize();

    // Self-ticked on SIM time: `engine.simTime` is the fixed-step accumulator
    // AFTER `engine.timeScale`, so a Concentration slow-mo slows the dust with
    // everything else and no machine has to remember to pump the pool.
    this._simT = ctx.engine?.simTime ?? 0;
    if (ctx.engine?.onAfterRender) {
      ctx.engine.onAfterRender.push((e) => {
        const dt = Math.min(0.1, Math.max(0, e.simTime - this._simT));
        this._simT = e.simTime;
        this.update(dt);
      });
    }
  }

  /** pixels-per-metre at 1 m depth, so a puff's world size is honest. */
  resize() {
    const cam = this.ctx.camera;
    const h = this.ctx.engine?.renderer?.domElement?.clientHeight || 900;
    const fov = cam?.fov ?? 55;
    if (h === this._h && fov === this._fov) return;
    this._h = h; this._fov = fov;
    this._px = h / (2 * Math.tan(fov * Math.PI / 360));
    this.cold.mat.uniforms.uPixelsPerMeter.value = this._px;
    this.hot.mat.uniforms.uPixelsPerMeter.value = this._px;
  }

  update(dt) {
    this.resize();
    this.cold.update(dt);
    this.hot.update(dt);
  }

  get live() { return this.cold.count + this.hot.count; }
  get glowCount() { return this.hot.glows.length; }

  /**
   * Fold a machine's eye halo into the pooled additive draw. The sprite object
   * stays in the scene graph (invisible) so it keeps riding its bone, keeps
   * answering `A44b`'s socket test and keeps being the thing the eye-state
   * system writes colour and opacity to — the pool just draws it.
   */
  attachGlow(obj, opts = {}) {
    const rec = {
      obj, mat: obj.material || null, color: new THREE.Color(opts.color ?? 0xffffff),
      size: opts.size ?? (obj.scale?.x ?? 0.4), scale0: obj.scale?.x ?? 1,
      gain: opts.gain ?? 1, enabled: true, emissive: !!opts.emissive,
      // backpointers the self-prune reads (see `_glowDead`)
      machine: opts.machine || null, root: opts.machine?.root || null,
    };
    this.hot.glows.push(rec);
    obj.visible = false;
    return rec;
  }

  detachGlowsOf(root) {
    this.hot.glows = this.hot.glows.filter((g) => {
      let n = g.obj;
      while (n) { if (n === root) { g.obj.visible = true; return false; } n = n.parent; }
      return true;
    });
  }

  /* --------------------------- spawners --------------------------- */

  /** Kicked-up ground dust (footfalls, landings, charge scrapes). */
  puff(x, y, z, scale = 0.8, color = 0x6f5637) {
    this.cold.spawn(x, y, z, {
      color, size: scale, grow: 1.3, peak: 0.62, dur: 0.9 + Math.random() * 0.4, vy: 0.7,
    });
  }

  /** Warm-grey wreck smoke. */
  smoke(x, y, z, scale = 1, color = 0x56493d) {
    this.cold.spawn(
      x + (Math.random() - 0.5) * scale, y + (Math.random() - 0.3) * scale, z + (Math.random() - 0.5) * scale,
      { color, size: scale * 0.5, grow: 1.6, peak: 0.26, dur: 1.4 + Math.random() * 1.0, vy: 0.6 + Math.random() * 0.9 },
    );
  }

  /** Additive flame lick. */
  flame(x, y, z, scale = 0.5, color = 0xff7a1e) {
    this.hot.spawn(x, y, z, {
      color, size: scale, grow: -0.4, peak: 0.85, dur: 0.55, vy: 1.6, flicker: true,
    });
  }

  /** Additive spark / arc flash. */
  spark(x, y, z, scale = 0.3, color = 0xbfe8ff, dur = 0.35) {
    this.hot.spawn(x, y, z, {
      color, size: scale, grow: 0.2, peak: 0.95, dur, flicker: true,
      vx: (Math.random() - 0.5) * 2.4, vy: 0.6 + Math.random() * 2.2, vz: (Math.random() - 0.5) * 2.4,
    });
  }

  /** Sooty wisp off a burning part. */
  burnSmoke(x, y, z) {
    this.cold.spawn(x, y + 0.25, z, {
      color: 0x4a4038, size: 0.35 + Math.random() * 0.25, grow: 2, peak: 0.22, dur: 0.9, vy: 1.1,
    });
  }

  dispose() {
    this.root.parent?.remove(this.root);
    for (const p of [this.cold, this.hot]) { p.geo.dispose(); p.mat.dispose(); }
    this.map.dispose();
  }
}

/** Lazily create (and publish) the one pool for this context. */
export function machineFx(ctx) {
  if (!ctx) return null;
  if (!ctx.machineFx) {
    try { ctx.machineFx = new MachineFx(ctx); } catch (e) { ctx.machineFx = null; }
  }
  return ctx.machineFx;
}

/**
 * Route a machine's per-particle FX through the pool WITHOUT editing
 * `machine.js` (owned by `machine-ai`): the five single-sprite spawners are
 * shadowed on the instance. Every one keeps its exact signature and falls
 * back to the prototype implementation if the pool failed to build.
 *
 * Called once per machine from `attachRigRuntime()`.
 */
export function attachFxPool(machine) {
  const pool = machineFx(machine.ctx);
  if (!pool) return null;
  const proto = Object.getPrototypeOf(machine);
  machine._fxPool = pool;
  machine._dustPuff = function (x, y, z, scale = 0.8) { pool.puff(x, y, z, scale); };
  machine._flamePuff = function (p) { pool.flame(p.x, p.y, p.z, 0.5 + Math.random() * 0.4); };
  machine._burnSmoke = function (p) { pool.burnSmoke(p.x, p.y, p.z); };
  machine._smokeBurst = function (p, n) {
    const cap = Math.max(0.9, this.bodyRadius);
    for (let i = 0; i < n; i++) pool.smoke(p.x, p.y, p.z, cap * 1.3);
  };
  machine._arcFlash = function (color = 0xbfe8ff) {
    pool.spark(
      this.position.x + (Math.random() - 0.5) * this.bodyRadius * 1.5,
      this.position.y + this.height * (0.25 + Math.random() * 0.6),
      this.position.z + (Math.random() - 0.5) * this.bodyRadius * 1.5,
      0.35 + Math.random() * this.bodyRadius * 0.35, color, 0.14,
    );
  };
  // eye halos: one pooled additive draw for every machine on screen instead
  // of one Sprite draw each (measured: 15 sprite draws in a staged fight)
  machine.body?.traverse((o) => {
    if (!o.isSprite || o.userData.pooledGlow) return;
    o.userData.pooledGlow = pool.attachGlow(o, { size: o.scale.x * 1.15, machine });
  });
  // Pure-GLOW part accents — antenna tips, radar sweep strips, cannon
  // muzzles, launcher vents, cargo seams — are billboards' work, not
  // geometry's: they exist to be a coloured light. Aim markers stay real
  // meshes (a weak point or an elemental canister has to be shootable).
  for (const part of machine.parts || []) {
    if (part.weak || part.elemental || !part.mesh) continue;
    part.mesh.traverse((o) => {
      if (!o.isMesh || o.userData.pooledGlow) return;
      const m = o.material;
      if (!m || !m.emissive) return;
      if (m.emissive.r + m.emissive.g + m.emissive.b < 0.05) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const r = o.geometry.boundingSphere?.radius ?? 0.1;
      o.userData.pooledGlow = pool.attachGlow(o, {
        size: Math.max(0.18, Math.min(1.1, r * 2.2)), emissive: true, gain: 0.9, machine,
      });
    });
  }
  machine._fxPoolFallback = proto;
  return pool;
}
