/**
 * Studio photo-mode post pass — depth of field, film filters, grain/vignette
 * and aspect-ratio frames. Lane `studio` (`missing-systems-photo-mode`).
 *
 * WHY A LANE-OWNED PASS AND NOT AN ENGINE ONE
 * -------------------------------------------
 * `src/core/engine.js` belongs to `core-platform` and its composer chain is a
 * 60 fps gameplay budget: ScenePass -> GTAO -> bloom -> grade -> SMAA. This
 * pass is APPENDED at runtime through the public `engine.composer.addPass()`
 * and stays `enabled = false` until the studio is both open and asking for an
 * effect, so a gameplay frame never pays for it (`pass.enabled === false` is
 * skipped by EffectComposer before any draw). Nothing in engine.js changes.
 *
 * Because it is appended AFTER SMAA it becomes the composer's last enabled
 * pass while it is on, so `renderToScreen` lands on it automatically and the
 * bars/filters are part of `Frame -> PNG` exactly as they are on screen.
 *
 * DEPTH: `engine.depthTexture` is the depth attachment of the MSAA scene
 * target (the same one GTAO samples). It is never bound as a write target in
 * the post ping-pong, so sampling it here cannot create a feedback loop.
 */
import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** Filter ids, in shader order. `none` must stay index 0. */
export const FILTERS = ['none', 'noir', 'sepia', 'cold', 'warm', 'bleach', 'focus'];

/** Frame presets: label -> aspect ratio (0 = full frame, no bars). */
export const FRAMES = [
  { id: 'full', label: 'Full', aspect: 0 },
  { id: 'wide', label: '2.39', aspect: 2.39 },
  { id: 'scope', label: '2.00', aspect: 2.0 },
  { id: 'flat', label: '1.85', aspect: 1.85 },
  { id: 'hd', label: '16:9', aspect: 16 / 9 },
  { id: 'academy', label: '4:3', aspect: 4 / 3 },
  { id: 'square', label: '1:1', aspect: 1 },
];

const StudioShader = {
  name: 'StudioPhotoShader',
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1600, 1 / 900) },
    uNearFar: { value: new THREE.Vector2(0.1, 2000) },
    uFocus: { value: 8 },
    uNearRange: { value: 4 },
    uFarRange: { value: 14 },
    uMaxRadius: { value: 0 },      // px; 0 disables the gather entirely
    uFilter: { value: 0 },
    uFilterAmt: { value: 1 },
    uGrain: { value: 0 },
    uVignette: { value: 0 },
    uFrameAspect: { value: 0 },
    uViewAspect: { value: 16 / 9 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    #include <common>
    #include <packing>

    #define TAPS 32

    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2  uTexel;
    uniform vec2  uNearFar;
    uniform float uFocus;
    uniform float uNearRange;
    uniform float uFarRange;
    uniform float uMaxRadius;
    uniform float uFilter;
    uniform float uFilterAmt;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uFrameAspect;
    uniform float uViewAspect;
    uniform float uTime;
    varying vec2 vUv;

    /** Linear view distance in metres (sky reads uNearFar.y). */
    float viewDist(vec2 uv) {
      float dz = texture2D(tDepth, uv).x;
      return -perspectiveDepthToViewZ(dz, uNearFar.x, uNearFar.y);
    }

    /** Signed circle of confusion, -1 (near blur) .. +1 (far blur). */
    float coc(float d) {
      float s = d - uFocus;
      return s < 0.0
        ? -clamp(-s / max(0.05, uNearRange), 0.0, 1.0)
        :  clamp( s / max(0.05, uFarRange),  0.0, 1.0);
    }

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;

      /* ------------------------------- depth of field ------------------- */
      if (uMaxRadius > 0.25) {
        float dC = viewDist(vUv);
        float cC = coc(dC);
        float rC = abs(cC) * uMaxRadius;
        if (rC > 0.4) {
          // Golden-angle spiral gather. Each tap is weighted by its OWN blur
          // radius so a sharp foreground cannot smear into a blurred
          // background (the classic bleed), while a blurred foreground is
          // still allowed to spill over a sharp subject.
          //
          // The spiral is ROTATED BY A PER-PIXEL HASH. Thirty-two taps is a
          // coarse sample of a 20 px disc, and with the same fixed spiral on
          // every pixel that coarseness is coherent: the first shipped frame
          // showed the gather's own arms as blotchy banding across the
          // defocused ground. Randomising the start angle spends the same taps
          // and turns the identical error into per-pixel noise, which at these
          // radii reads as film grain instead of as structure.
          vec3 sum = col;
          float wsum = 1.0;
          const float GA = 2.39996323;
          float a0 = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453) * 6.28318531;
          for (int i = 0; i < TAPS; i++) {
            float fi = float(i) + 0.5;
            float a  = a0 + fi * GA;
            float r  = sqrt(fi / float(TAPS));
            vec2 off = vec2(cos(a), sin(a)) * r * rC * uTexel;
            vec2 uv  = clamp(vUv + off, vec2(0.0), vec2(1.0));
            float dT = viewDist(uv);
            float cT = coc(dT);
            // a tap in front of the focal plane always contributes; one behind
            // only contributes while it is at least as unfocused as we are
            float w = (cT < 0.0 || dT >= dC - 0.02)
              ? 1.0
              : smoothstep(0.0, 1.0, abs(cT) / max(0.02, abs(cC)));
            sum += texture2D(tDiffuse, uv).rgb * w;
            wsum += w;
          }
          col = sum / max(1e-4, wsum);
        }
      }

      /* -------------------------------- film filters -------------------- */
      int f = int(uFilter + 0.5);
      if (f > 0) {
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        vec3 g = col;
        if (f == 1) {                                   // noir
          g = vec3(clamp((l - 0.5) * 1.22 + 0.5, 0.0, 1.2));
        } else if (f == 2) {                            // sepia
          g = vec3(l * 1.07 + 0.06, l * 0.94 + 0.02, l * 0.72 - 0.01);
        } else if (f == 3) {                            // cold dusk
          g = vec3(col.r * 0.86, col.g * 0.97, col.b * 1.20);
          g = mix(vec3(l), g, 1.12);
        } else if (f == 4) {                            // warm gold
          g = vec3(col.r * 1.16, col.g * 1.01, col.b * 0.80);
          g = mix(vec3(l), g, 1.08);
        } else if (f == 5) {                            // bleach bypass
          vec3 o = mix(2.0 * col * vec3(l), 1.0 - 2.0 * (1.0 - col) * (1.0 - vec3(l)), step(0.5, vec3(l)));
          g = mix(col, o, 0.85);
        } else {                                        // focus: teal / amber
          g = mix(vec3(l * 0.42, l * 0.86, l * 0.92), vec3(l * 1.18, l * 0.72, l * 0.34), smoothstep(0.34, 0.78, l));
        }
        col = mix(col, clamp(g, 0.0, 4.0), clamp(uFilterAmt, 0.0, 1.0));
      }

      /* --------------------------------- grain + vignette --------------- */
      if (uGrain > 0.001) {
        float n = fract(sin(dot(vUv * vec2(1213.7, 907.3) + uTime, vec2(12.9898, 78.233))) * 43758.5453);
        col += (n - 0.5) * uGrain * 0.24;
      }
      if (uVignette > 0.001) {
        // aspect-corrected radius, normalised so the corner is 1.0: the falloff
        // is a circle on screen, not an ellipse stretched by the window
        float r = length(vec2((vUv.x - 0.5) * uViewAspect, vUv.y - 0.5))
          / max(0.001, 0.5 * length(vec2(uViewAspect, 1.0)));
        col *= clamp(1.0 - uVignette * smoothstep(0.42, 1.0, r), 0.0, 1.0);
      }

      /* -------------------------------------- frame bars ---------------- */
      if (uFrameAspect > 0.01) {
        float keep;
        if (uFrameAspect < uViewAspect) {
          // narrower than the window: pillarbox
          keep = uFrameAspect / uViewAspect;
          float m = (1.0 - keep) * 0.5;
          if (vUv.x < m || vUv.x > 1.0 - m) col = vec3(0.0);
        } else {
          keep = uViewAspect / uFrameAspect;
          float m = (1.0 - keep) * 0.5;
          if (vUv.y < m || vUv.y > 1.0 - m) col = vec3(0.0);
        }
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/**
 * The pass itself. Owns its own resolution (so it survives the engine's
 * dynamic-resolution resizes) and nothing else.
 */
export class StudioPass extends ShaderPass {
  constructor(engine) {
    super(StudioShader);
    this.engine = engine;
    this.enabled = false;
    this.uniforms.tDepth.value = engine.depthTexture;
    this._w = 1600;
    this._h = 900;
  }

  setSize(w, h) {
    this._w = Math.max(1, w);
    this._h = Math.max(1, h);
    this.uniforms.uTexel.value.set(1 / this._w, 1 / this._h);
  }

  /** Called once per frame by Studio.interpolate() with REAL seconds. */
  sync(cam, opts, realDt) {
    const u = this.uniforms;
    u.tDepth.value = this.engine.depthTexture;   // re-seated on a resize
    u.uNearFar.value.set(cam.near, cam.far);
    u.uFocus.value = opts.focus;
    u.uNearRange.value = opts.nearRange;
    u.uFarRange.value = opts.farRange;
    // aperture 0..1 -> 0..22 px of gather at 1080p-ish, scaled by height so the
    // look is resolution independent
    u.uMaxRadius.value = opts.dof ? opts.aperture * 22 * (this._h / 900) : 0;
    u.uFilter.value = Math.max(0, FILTERS.indexOf(opts.filter));
    u.uFilterAmt.value = opts.filterAmt;
    u.uGrain.value = opts.grain;
    u.uVignette.value = opts.vignette;
    u.uFrameAspect.value = opts.frameAspect;
    u.uViewAspect.value = this._w / Math.max(1, this._h);
    u.uTime.value = (u.uTime.value + realDt) % 1000;
    this.enabled = !!(opts.active
      && (u.uMaxRadius.value > 0.25 || u.uFilter.value > 0 || u.uFrameAspect.value > 0.01
        || u.uGrain.value > 0.001 || u.uVignette.value > 0.001));
  }
}
