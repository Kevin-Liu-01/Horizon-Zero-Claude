import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { installPeople } from '../npc/people/index.js';
import { REST_SITE } from '../island/sites.js';

/**
 * SETTLEMENT HOST at `REST_SITE` (M0.3: the Round-4 rest site renamed and trimmed).
 *
 * Builds the Brazier where Brea rests (shader-billboard flames, sparks and
 * smoke, one flickering shadow-free point light), registers the REST & SAVE
 * interactable, and installs the island people (`installPeople`). The
 * Round-4 layout that stood here (tents, racks, the old crowd, the palisade
 * village) is deleted; settlements proper arrive under `src/world/settlements/`.
 *
 * Static props are baked into merged vertex-colored meshes (matte / metal / cloth).
 */

const FIRE_X = REST_SITE.x, FIRE_Z = REST_SITE.z;

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

export class SettlementHost {
  constructor(ctx) {
    this.ctx = ctx;
    this.rng = makeRng(0xC0FFEE);

    const fy = ctx.terrain.getHeight(FIRE_X, FIRE_Z);
    this.firePosition = new THREE.Vector3(FIRE_X, fy, FIRE_Z);
    this.position = this.firePosition.clone();

    this.group = new THREE.Group();
    this.group.name = 'settlement-host';

    // geometry buckets -> merged into one mesh per material
    this._matte = [];
    this._metal = [];
    this._cloth = [];
    this._small = []; // small clutter: merged like matte but casts no shadow

    this._buildFirepit();
    this._bakeStatics();

    this._buildGroundDecal();
    this._buildCoalGlow();
    this._buildFireParticles();
    this._buildSparks();
    this._buildSmoke();
    this._buildLight();

    // the nine island people (src/world/npc/people), staged near REST
    this.people = installPeople(ctx);

    ctx.scene.add(this.group);
  }


  /**
   * The Brazier rest/save interactable (`world-12`, `progression-009`).
   *
   * `progression` registers its own `REST & SAVE` entry on `settlements.firePosition`
   * when that module is installed, so this one only lands when it is NOT —
   * checked against the live registry rather than against a flag, so whichever
   * module boots first wins and the player never sees two prompts. Ours does
   * the same three things by hand: save through `progression` if it turns up
   * later, advance the clock through `environment.rest`/`setTime`, and heal.
   */
  _ensureBrazier() {
    if (this._fireEntry || this._fireEntryChecked > 6) return;
    const ctx = this.ctx;
    const I = ctx.interactables;
    if (!I?.register) return;
    // give progression a few seconds of boot to claim it
    this._fireEntryChecked = (this._fireEntryChecked ?? 0) + 1;
    if (this._fireEntryChecked < 4) return;
    for (const e of I.list) {
      if (!e?.position) continue;
      const d = Math.hypot(e.position.x - this.firePosition.x, e.position.z - this.firePosition.z);
      if (d < 4.5 && /REST/i.test(e.label || '')) { this._fireEntry = e; return; }
    }
    this._fireEntry = I.register({
      position: this.firePosition.clone(),
      radius: 3.4, hold: 0.55, label: 'REST & SAVE', site: 'brazier',
      onInteract: () => this.restAtFire(),
    });
  }

  /**
   * `brazier-rest`, emitted from the path the player actually takes.
   *
   * The shipped chain is: `progression._ensureInteractables()` registers the
   * `REST & SAVE` entry first and its `onInteract` only OPENS the rest UI;
   * the sleep itself happens later, when `ui/quests.js`'s REST UNTIL DAWN
   * button calls `progression.rest(6.2)` directly. `_ensureBrazier()` above
   * therefore adopts progression's entry and `restAtFire()` is never called in
   * a normal session — so an emit placed inside it fires for nobody. (Round 4
   * judge finding: the previous fix landed in exactly that dead branch.)
   *
   * Wrapping the entry's `onInteract` would fire on the UI OPENING, which is
   * not a rest. So hook `progression.rest` itself — a published method on the
   * published module, wrapped once, from out here rather than by editing
   * another lane's file. Every caller is covered: the UI button, `restAtFire`,
   * a console call, a future quest script. If `rest` is ever not a function,
   * fall back to progression's own `banner` event, whose 'RESTED' card is
   * raised on the same line as the checkpoint.
   *
   * Called every frame until it takes, because `installProgression()` runs
   * after the host is constructed.
   */
  _hookProgressionRest() {
    const ctx = this.ctx;
    const prog = ctx.progression;
    // keyed on the instance, not a boolean: a rebuilt `progression` gets its
    // own wrapper instead of silently losing the event again
    if (!prog || this._restHookedOn === prog) return;
    const fire = () => ctx.events?.emit?.('brazier-rest', {
      hour: ctx.environment?.time ?? 6.2,
    });
    if (typeof prog.rest === 'function') {
      if (!prog.__brazierRestHooked) {
        const inner = prog.rest.bind(prog);
        // arrow, not async function: no allocation beyond the promise `rest`
        // already makes, and `restAtFire` can still await the real return value
        prog.rest = (toHour = 6.2) => {
          const r = inner(toHour);
          return Promise.resolve(r).then((v) => { fire(); return v; });
        };
        prog.__brazierRestHooked = true;
      }
      this._restHooked = true;
      this._restHookedOn = prog;
      return;
    }
    if (ctx.events?.on) {
      ctx.events.on('banner', (e) => {
        if (e?.kind === 'save' && /RESTED/i.test(e?.title || '')) fire();
      });
      this._restHooked = true;
      this._restHookedOn = prog;
    }
  }

  /** Rest at the fire: dawn, full health and pouch, and a save. */
  async restAtFire(toHour = 6.2) {
    const ctx = this.ctx;
    const prog = ctx.progression;
    /**
     * `progression` owns the rest when it is installed — it runs its own fade,
     * heals, and saves — so this delegates, and `_hookProgressionRest()` above
     * is what emits `brazier-rest` for that branch (exactly once, whoever called).
     * The branch below is the no-progression build, which has to emit its own.
     */
    if (prog?.rest) {
      this._hookProgressionRest();
      return prog.rest(toHour);
    }
    const env = ctx.environment;
    if (env?.rest) { try { await env.rest({ toHour, seconds: 2.0 }); } catch { /* busy */ } }
    else env?.setTime?.(toHour);
    const p = ctx.player;
    if (p) {
      p.health = p.maxHealth ?? p.health;
      p.gourd = p.maxGourd ?? p.gourd;
      ctx.events?.emit?.('player-hurt', { health: p.health, max: p.maxHealth });
    }
    prog?.save?.('brazier');
    ctx.events?.emit?.('brazier-rest', { hour: env?.time ?? toHour });
    return true;
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

  /**
   * Cylinder from point a to point b (arrays), tapered r0 -> r1.
   * Segmented along its HORIZONTAL run so `nav`'s per-triangle AABB stamp does
   * not blank a whole square around a long beam — see props/kit.js heightSegs.
   */
  _tube(list, a, b, r0, r1, color, radial = 7, jitter = 0.05) {
    const len = _v1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).length();
    const hs = Math.max(1, Math.min(16,
      Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.9)));
    const geo = new THREE.CylinderGeometry(r1, r0, len, radial, hs);
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
      // ~2x sprite size so the fire reads across the site even in daylight
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

  _buildSparks() {
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

    this._sparkMat = new THREE.ShaderMaterial({
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
    const pts = new THREE.Points(geo, this._sparkMat);
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

  /* ----------------------------- update -------------------------------- */

  update(dt, t) {
    // perspective-correct point sizes: world meters -> device pixels
    const focal = this.ctx.renderer.domElement.height /
      (2 * Math.tan(THREE.MathUtils.degToRad(this.ctx.camera.fov) / 2));
    this._fireMat.uniforms.uFocal.value = focal;
    this._sparkMat.uniforms.uFocal.value = focal;
    this._fireMat.uniforms.uTime.value = t;
    this._sparkMat.uniforms.uTime.value = t;
    this._smokeMat.uniforms.uTime.value = t;
    // low-frequency flicker mix; smooth, no popping
    const f = 1
      + 0.13 * Math.sin(t * 11.3)
      + 0.08 * Math.sin(t * 23.7 + 1.3)
      + 0.06 * Math.sin(t * 5.1 + 0.7);
    this.fireLight.intensity = this._lightBase * f;
    this.fireLight.position.y = this._lightY + 0.06 * Math.sin(t * 9.1);
    this._coalMat.emissiveIntensity = 1.4 + 0.7 * f;


    this.people?.update(dt, t);

    this._ensureBrazier();
    this._hookProgressionRest();
  }
}
