import * as THREE from 'three';

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

function styleMachine(root, style) {
  const seen = new Set();
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
        m.color.getHSL(_hsl);
        const l = _hsl.l;
        const target = l < 0.16 ? MUSCLE : l < 0.42 ? MID : CHASSIS;
        m.color.lerp(target, 0.88);
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
      onEntry: (entry, name) => styleMachine(entry.root, STYLE[name] ?? {}),
    })
    .then(() => ctx.assets.models);
  return _promise;
}
