import * as THREE from 'three';
import { Broadhead } from './broadhead.js';
import { Grazer } from './grazer.js';
import { Snapmaw } from './snapmaw.js';
import { Ravager } from './ravager.js';
import { ShellWalker } from './shellwalker.js';
import { Corruptor } from './corruptor.js';
import { Stormbird } from './stormbird.js';
import { Redeye } from './redeye.js';

/**
 * The expansion species this lane has shipped, keyed by `kind`. Every entry
 * retires a chassis the moment its sculpt is loaded — see
 * `registerExpansionSpecies` at the bottom of this file.
 */
const EXPANSION_SPECIES = {
  broadhead: Broadhead,
  grazer: Grazer,
  snapmaw: Snapmaw,
  ravager: Ravager,
  shellwalker: ShellWalker,
  corruptor: Corruptor,
  stormbird: Stormbird,
  redeye: Redeye,
  // TALLNECK: not shipped by this lane — it stays on its `behemoth` chassis.
  // `casting-v4` §4 puts it last ("if budget allows") and §2.8 states why: the
  // donor is a 49.7 x 11.7 horizontal sauropod with a TWO-JOINT neck, so the
  // species is a re-proportion job at a scale nothing else in the build uses,
  // not a rig job. Shipping it half-built would put a 14 m dinosaur in the
  // valley; the chassis at least walks a docile fixed loop.
};

/**
 * Machine-variety model STYLE pass (Round 4).
 *
 * Round 3 shipped a second GLTFLoader here plus a verbatim copy of
 * `Assets._normalize` — the duplicated asset pipeline that decision **D8**
 * names as the cost of the frozen-file contract (`perf-tech-12`). Both are
 * gone: `assets.loadExtra()` (src/core/assets.js) owns loading and
 * normalisation for every lane now, and this module is only what it should
 * always have been — the per-species STYLE table plus the `onEntry` hook that
 * applies it.
 *
 * Sources are preprocessed copies in public/models/ (MechanicalHorse merged
 * 480 meshes -> 7, Robocat's display stand excised; see
 * models-staging/MANIFEST.md for licenses).
 *
 * STYLE PASS: the four store-bought sculpts arrive in toy colors. To read as
 * the same machine family as the big four (roster-v2.md §1: white-grey armor
 * plates over dark synthetic muscle, ONE state-colored sensor), every
 * material is desaturated onto a chassis/muscle ramp, metal/rough clamped,
 * and exactly one material per species is turned into a flat emissive sensor
 * that Machine._collectEmissive wires into the EYE_COLORS state system.
 */

const SPECS = {
  // Orientation contract: the inner wrapper keeps yaw 0 and
  // each SPECIES passes its facing correction as `yawFix` (holder rotation) —
  // baking yaw here too would double-rotate (that bug shipped tails-first
  // striders for about twenty minutes).
  // horse reads ~1.8 m at the shoulder with the head topping 2.0 (roster 1.8x3)
  strider:   { url: '/models/strider.glb',   targetHeight: 2.0,  yaw: 0 },
  scrapper:  { url: '/models/scrapper.glb',  targetHeight: 1.5,  yaw: 0 },
  // scale by wingspan: 0.64 raw height * (5.5/2.27 span) => targetHeight 1.55
  glinthawk: { url: '/models/glinthawk.glb', targetHeight: 1.55, yaw: 0 },
  longleg:   { url: '/models/longleg.gltf',   targetHeight: 4.0,  yaw: 0 },

  /* ---------------- ROUND 4 EXPANSION (casting-v4.md §0) ----------------
   * Every `targetHeight` below is derived from the roster's LENGTH, not from
   * its height, because `assets.normalize()` scales on the bbox height: a
   * 17.97-deep Black Caiman normalised to 0.98 tall IS an 8.03 m croc. The
   * numbers are `casting-v4.md` §0's table, and `tools/bake-rigs.mjs --report`
   * re-derives them from the baked bytes.
   *
   * ORIENTATION CONTRACT (unchanged): `yaw` stays 0 here and each SPECIES
   * passes its facing correction as `yawFix` on the holder. Baking it in both
   * places double-rotates.
   */
  broadhead:   { url: '/models/broadhead.glb',   targetHeight: 2.0,  yaw: 0 },
  grazer:      { url: '/models/grazer.glb',      targetHeight: 2.72, yaw: 0 },
  snapmaw:     { url: '/models/snapmaw.glb',     targetHeight: 0.98, yaw: 0 },
  ravager:     { url: '/models/ravager.glb',     targetHeight: 3.66, yaw: 0 },
  shellwalker: { url: '/models/shellwalker.glb', targetHeight: 2.1,  yaw: 0 },
  corruptor:   { url: '/models/corruptor.glb',   targetHeight: 2.95, yaw: 0 },
  stormbird:   { url: '/models/stormbird.glb',   targetHeight: 7.89, yaw: 0 },
  tallneck:    { url: '/models/tallneck.glb',    targetHeight: 3.27, yaw: 0 },
  /**
   * REDEYE: zero new asset. The Watcher sculpt is loaded a SECOND time under
   * its own key rather than aliased (casting-v4 §2.9) so the per-machine
   * material clones — and the red calm sensor that is the whole point of the
   * variant — stay separate from the Watcher's.
   */
  redeye:      { url: '/models/watcher.glb',     targetHeight: 2.1,  yaw: 0 },
};

/**
 * Machines cast their silhouette, not their bolt heads (`perf-tech-03`).
 * With `world-light`'s three CSM cascades every caster is three shadow draws,
 * so the roster ships one caster per model and `rig/lod.js` re-applies the
 * same policy to the per-machine clone.
 */
const MACHINE_SHADOWS = { minFraction: 0.85, alwaysLargest: 1 };
for (const k in SPECS) SPECS[k].shadowPolicy = MACHINE_SHADOWS;

const CHASSIS = new THREE.Color(0xd0d5da); // lacquered plate white-grey
const MID = new THREE.Color(0x878d95);     // secondary panels
const MUSCLE = new THREE.Color(0x22262b);  // dark synthetic-muscle underside
const SENSOR_BASE = new THREE.Color(0x0a0d10);

/** Per-species style config. `sensor(mat)` picks THE eye material. */
const STYLE = {
  strider: {},   // no reliable eye material — the species file adds a lens part
  scrapper: {
    // mat12: yellow helmet eyes (+ matching accent stripes) become the sensor
    sensor: (m) => m.color.r > 0.9 && m.color.g > 0.7 && m.color.b < 0.2,
  },
  glinthawk: {
    // "Material": the big red mono-eye
    sensor: (m) => m.color.r > 0.6 && m.color.g < 0.15 && m.color.b < 0.15,
  },
  longleg: { texSat: 0.12, texBright: 1.5 }, // atlas texture -> grey chassis

  /* ---------------- ROUND 4 EXPANSION ----------------
   * Every one of these is an ANIMAL sculpt in animal colours (a brown bull, a
   * tan deer, a black caiman, an orange lion, a blue spider, a sand scorpion,
   * a brown hawk), and `roster-v2 §1` is explicit that the family reads as
   * white-grey armour plate over dark synthetic muscle with ONE state sensor.
   * The luminance ramp below does that work; the species files then add the
   * plate/muscle shell that carries the machine detail.
   *
   * `sensor` is deliberately absent on all of them: not one of these donors
   * has a material that is only the eye (the Bull's `Eye_Black` also paints
   * the muzzle rim, the Lion's face groups are four tiny colour patches), so
   * every species file adds its own `lensMesh` part instead — which is also
   * what lets the socket pass put the sensor exactly where `casting-v4` §2
   * measured it.
   */
  broadhead: { rank: true },
  grazer: { rank: true },
  snapmaw: { rank: true, texSat: 0.1, texBright: 1.35 },   // 1024² caiman scale atlas
  ravager: { rank: true },
  shellwalker: { rank: true },
  corruptor: {
    /**
     * THE ONE SPECIES THAT OPTS OUT OF THE FAMILY PALETTE (`roster-v2 §4`:
     * "matte black chassis"). `tint` replaces the chassis/mid/muscle ramp with
     * a near-black one plus red trim, which is what `casting-v4` §5.3 asks
     * `shellMaterials(tint)` for on the shell side.
     */
    rank: true,
    tint: { chassis: 0x2a2b2e, mid: 0x1b1c1f, muscle: 0x0d0e10 },
  },
  stormbird: { rank: true },
  tallneck: { rank: true },
  redeye: {},
};

/** Desaturate a texture toward machine-chassis grey via a canvas redraw. */
function desatTexture(tex, sat, bright) {
  const img = tex.image;
  if (!img || !img.width) return tex;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.filter = `saturate(${sat}) brightness(${bright}) contrast(0.92)`;
  g.drawImage(img, 0, 0);
  const out = new THREE.CanvasTexture(c);
  out.flipY = tex.flipY;
  out.colorSpace = tex.colorSpace;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  out.magFilter = tex.magFilter;
  out.minFilter = tex.minFilter;
  out.needsUpdate = true;
  return out;
}

const _hsl = { h: 0, s: 0, l: 0 };
const _bv = new THREE.Vector3();

/**
 * BIND-POSE BAKE — turn a rigged donor into a static sculpt (`machines-expansion`).
 *
 * Every expansion species is driven by `autorig.js` + `GaitController` rather
 * than by its donor's clips (the reason is recorded at the top of
 * `rig/rigs-expansion.js`: the three foot gates are graded per species and the
 * procedural path is the one with five species holding them). `buildRig` skins
 * a sculpt by measuring each vertex against the rig spec's capsules in BODY
 * space, and it gets those positions with `bodyInv * mesh.matrixWorld` — which
 * is the truth for a static mesh and a LIE for a skinned one, whose vertices
 * are placed by the bind matrix and the skeleton instead. Measured on the Hawk:
 * the raw buffer spans y −3.30 … +9.53 while the drawn bird spans 0 … 7.89, so
 * a rig spec fitted to the drawn bird would have weighted the wrong vertices.
 *
 * So the donor is baked: every vertex is pushed through `applyBoneTransform`
 * (which returns it in the mesh's own LOCAL space), written back, and the
 * `SkinnedMesh` is replaced by a plain `Mesh` with the same transform. The
 * skeleton and its bones are dropped with it.
 *
 * Three things fall out, all of them wanted:
 *   - the buffer now IS the drawn animal, so the rig specs are measurable;
 *   - the donor skeleton stops existing, so a machine carries ONE skeleton
 *     (the auto-rig's) instead of two — `A90`'s bone-texture cost, halved;
 *   - the clone can be a plain `clone()` (`rigged: false`), which SHARES the
 *     geometry between instances, which is what the species geometry pool in
 *     `rig/lod.js` needs to make a second machine of a kind cost nothing.
 *
 * @returns {number} meshes baked
 */
function freezeSkins(root) {
  const jobs = [];
  root.traverse((o) => { if (o.isSkinnedMesh && o.skeleton && o.geometry) jobs.push(o); });
  if (!jobs.length) return 0;
  root.updateMatrixWorld(true);
  for (const sk of jobs) {
    const geo = sk.geometry;
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    // one buffer per donor, not per machine: this runs on the ASSET entry
    const baked = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      _bv.fromBufferAttribute(pos, i);
      sk.applyBoneTransform(i, _bv);
      baked[i * 3] = _bv.x; baked[i * 3 + 1] = _bv.y; baked[i * 3 + 2] = _bv.z;
    }
    const out = geo.clone();
    out.setAttribute('position', new THREE.BufferAttribute(baked, 3));
    out.deleteAttribute('skinIndex');
    out.deleteAttribute('skinWeight');
    if (nrm) out.computeVertexNormals();   // the bind rotation moved them
    out.computeBoundingBox();
    out.computeBoundingSphere();
    const mesh = new THREE.Mesh(out, sk.material);
    mesh.name = sk.name;
    mesh.position.copy(sk.position);
    mesh.quaternion.copy(sk.quaternion);
    mesh.scale.copy(sk.scale);
    mesh.castShadow = sk.castShadow;
    mesh.receiveShadow = sk.receiveShadow;
    mesh.frustumCulled = true;
    mesh.userData = sk.userData;
    sk.parent?.add(mesh);
    sk.parent?.remove(sk);
    geo.dispose();
    sk.skeleton.dispose?.();
  }
  // the bones are now inert: drop every one that carries nothing but bones
  const drop = [];
  root.traverse((o) => { if (o.isBone && !(o.parent && o.parent.isBone)) drop.push(o); });
  for (const b of drop) b.parent?.remove(b);
  return jobs.length;
}

/**
 * RANKED RAMP — the fix for "the machine is the right shape and the wrong
 * animal" (`machines-expansion`).
 *
 * The Round-3 ramp is absolute: lightness under 0.16 is muscle, under 0.42 is
 * panel grey, above that is chassis plate. That works on the toy-coloured
 * store-bought sculpts it was written for and it fails on a REAL ANIMAL. The
 * Bull's seven materials measure 0.13-0.21 lightness — hide, hooves, muzzle,
 * eye rim, horn — so every one of them lands in MUSCLE and the machine renders
 * as a black bull with no plate on it at all. Gate `V26a` graded exactly that.
 *
 * The family read is a CONTRAST — white-grey plate over dark synthetic muscle —
 * and a contrast is relative. So the donor's own materials are ranked against
 * each other: its brightest surface becomes chassis, its darkest becomes
 * muscle, and everything between lands on the panel grey. Absolute lightness
 * stops mattering, which is what makes the same pass work on a black caiman, a
 * tan deer and an orange lion.
 *
 * VERTEX COLOURS are ranked with them. Quaternius' `Main` material carries its
 * palette in a `color` ATTRIBUTE with `vertexColors: true`, so a material-only
 * pass leaves the albedo exactly as brown as it was — measured on the Grazer,
 * whose material read 0x89898e (correctly grey) over a vertex buffer that was
 * still a deer.
 */
function rankedRamp(root, chassis, mid, muscle) {
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const samples = [];
  const mats = new Set();
  const geos = new Set();
  const area = new Map();          // material -> vertices it paints
  root.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    const n = o.geometry?.attributes?.position?.count || 0;
    for (const m of list) {
      area.set(m, (area.get(m) || 0) + n);
      if (mats.has(m) || m.userData?.shell) continue;
      mats.add(m);
      if (m.color && !m.map) samples.push(lum(m.color));
    }
    const ca = o.geometry?.attributes?.color;
    if (ca && !geos.has(o.geometry)) {
      geos.add(o.geometry);
      const step = Math.max(1, Math.floor(ca.count / 400));
      for (let i = 0; i < ca.count; i += step) {
        samples.push(0.2126 * ca.getX(i) + 0.7152 * ca.getY(i) + 0.0722 * ca.getZ(i));
      }
    }
  });
  if (samples.length < 2) return null;
  samples.sort((a, b) => a - b);
  const lo = samples[Math.floor(samples.length * 0.05)];
  const hi = samples[Math.floor(samples.length * 0.95)];
  const span = Math.max(1e-3, hi - lo);
  /**
   * THE MAJORITY OF THE SURFACE IS PLATE. `roster-v2 §1` is "white-grey armour
   * plates over dark synthetic muscle" — plate is the body, muscle is the
   * joints and the underside — so the thresholds are deliberately low: only the
   * darkest fifth of the donor becomes muscle and only the next fifth becomes
   * panel grey. An even three-way split reads as a dark animal with some light
   * bits, which is what the first `V26a` frame was.
   */
  const pick = (l) => {
    const t = THREE.MathUtils.clamp((l - lo) / span, 0, 1);
    return t < 0.18 ? muscle : t < 0.40 ? mid : chassis;
  };
  /**
   * THE DOMINANT SURFACE IS THE CHASSIS, whatever its lightness.
   *
   * A ranked ramp still fails on a donor whose biggest material is also its
   * darkest — the Bull's hide is both — and the result is a black machine with
   * white hooves. The largest material by vertex count is the BODY, and a
   * machine's body is its armour, so it is pinned to the plate tone and the
   * rest of the donor is ranked around it.
   */
  let dominant = null, best = 0;
  for (const [m, n] of area) {
    if (m.userData?.shell || !m.color || m.map) continue;
    if (n > best) { best = n; dominant = m; }
  }
  // rewrite the vertex buffers once per geometry (shared across instances)
  const c = new THREE.Color();
  for (const g of geos) {
    const ca = g.attributes.color;
    if (ca.userData?.ramped) continue;
    for (let i = 0; i < ca.count; i++) {
      c.setRGB(ca.getX(i), ca.getY(i), ca.getZ(i));
      c.lerp(pick(lum(c)), 0.9);
      ca.setXYZ(i, c.r, c.g, c.b);
    }
    ca.needsUpdate = true;
    ca.userData = { ...(ca.userData || {}), ramped: true };
  }
  pick.dominant = dominant;
  pick.chassis = chassis;
  return pick;
}

function styleMachine(root, style) {
  const seen = new Set();
  // per-species palette override (the Corruptor's matte-black chassis)
  const chassis = style.tint ? new THREE.Color(style.tint.chassis) : CHASSIS;
  const mid = style.tint ? new THREE.Color(style.tint.mid) : MID;
  const muscle = style.tint ? new THREE.Color(style.tint.muscle) : MUSCLE;
  const rank = style.rank ? rankedRamp(root, chassis, mid, muscle) : null;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      if (style.sensor?.(m)) {
        // THE sensor: flat emissive, no map -> _collectEmissive gives it the
        // full state color treatment (blue/yellow/red, telegraph, death fade)
        m.color.copy(SENSOR_BASE);
        m.emissive = new THREE.Color(0x38c6ff);
        m.emissiveIntensity = 1.6;
        m.metalness = 0.2;
        m.roughness = 0.4;
        m.toneMapped = true;
        continue;
      }
      if (m.map) {
        m.map = desatTexture(m.map, style.texSat ?? 0.15, style.texBright ?? 1.1);
        m.color?.set(0xffffff);
      } else if (m.color) {
        // luminance ramp: bright toy colors -> chassis plate, mids -> panel
        // grey, dark -> muscle. Keep ~12% of the original hue so plates don't
        // go dead flat.
        // RANKED (expansion donors) or absolute (the Round-3 sculpts)
        const target = rank
          ? (m === rank.dominant ? rank.chassis
            : rank(0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b))
          : (m.color.getHSL(_hsl), _hsl.l < 0.16 ? muscle : _hsl.l < 0.42 ? mid : chassis);
        m.color.lerp(target, style.tint ? 0.94 : 0.88);
      }
      // machine family metal response (Machine ctor clamps again, harmless)
      if (m.metalness !== undefined) {
        m.metalness = THREE.MathUtils.clamp(m.metalness < 0.45 ? 0.55 : m.metalness, 0.45, 0.7);
      }
      if (m.roughness !== undefined) {
        m.roughness = THREE.MathUtils.clamp(m.roughness, 0.35, 0.62);
      }
    }
  });
}

let _promise = null;

/**
 * Load + normalize + style the variety models, injecting them into
 * ctx.assets.models under their species keys. Idempotent; resolves to the
 * models map. `machines/index.js` defers the variety spawns on this.
 *
 * ONE loader, ONE normaliser: `assets.loadExtra` (D8 / perf-tech-12).
 */
export function loadVarietyModels(ctx, onProgress) {
  if (_promise) return _promise;
  _promise = ctx.assets
    .loadExtra(SPECS, {
      onProgress: onProgress ?? (() => {}),
      onEntry: (entry, name) => {
        // the expansion species are auto-rigged, so their donors are baked out
        // of their bind pose first (see `freezeSkins`)
        if (EXPANSION_KINDS.has(name)) entry.bakedSkins = freezeSkins(entry.root);
        styleMachine(entry.root, STYLE[name] ?? {});
      },
    })
    .then(() => {
      registerExpansionSpecies(ctx);
      return ctx.assets.models;
    });
  return _promise;
}

/** Species whose donor is baked out of its bind pose (see `freezeSkins`). */
const EXPANSION_KINDS = new Set([
  'broadhead', 'grazer', 'snapmaw', 'ravager',
  'shellwalker', 'corruptor', 'stormbird', 'tallneck',
]);

/**
 * THE CHASSIS HANDOVER (`machines-expansion` -> `machine-ai`).
 *
 * `ai/doctrine.js` ships every expansion kind on a CHASSIS — an existing
 * species class borrowed for its body while the kind's own tables, doctrine and
 * gates run — and publishes ONE call to retire it:
 * `machines.registerKind(kind, Cls)`. This is where that call is made, from
 * inside this lane's own file: the moment the sculpt is loaded, the real class
 * takes over every future spawn, including every site respawn. Nothing else
 * changes — the tables, the spawn plan and the gate keys all key off `kind`.
 *
 * Order matters and it is guaranteed: `index.js` spawns the expansion layout
 * from `.then()` on this same promise, so registration lands first and not one
 * machine is ever built on a chassis whose species file is present.
 */
function registerExpansionSpecies(ctx) {
  const M = ctx.machines;
  if (!M?.registerKind) return 0;
  let n = 0;
  for (const [kind, Cls] of Object.entries(EXPANSION_SPECIES)) {
    if (!ctx.assets.models[kind]) continue;
    try { M.registerKind(kind, Cls); n++; } catch (e) { console.warn(`[machines] registerKind ${kind}`, e); }
  }
  return n;
}
