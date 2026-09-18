import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { CSM } from 'three/examples/jsm/csm/CSM.js';

/**
 * Renderer + scene + camera + post stack + the perf/quality plumbing every
 * other lane measures itself against. Systems register with the game, not here.
 *
 * ROUND 4 (core-platform lane) — published API, see docs/SPEC.md §Engine:
 *   engine.requestTimeScale(source, value)  single time authority
 *   engine.timeScale                        resolved (studio > wheel > hitstop > concentration > legacy)
 *   engine.enableCSM(opts) / engine.csm     cascaded shadow plumbing for world-light
 *   engine.csmSetupMaterial(mat)
 *   engine.setQuality(tier) / engine.quality
 *   engine.grade.uniforms                   filmic grade + vignette knobs
 *   engine.setGrade(on)                     grade on/off (tonemap always stays on)
 *   engine.sizeCullPx                       screen-space small-mesh cull (perf-tech-04 assist)
 *   engine.gtao / engine.bloom / engine.smaa
 *   engine.shadowCullDistance               distance caster culling (perf-tech-03)
 *   engine.shadowCasterBudget               DRAW budget: casters x CSM cascades
 *   engine.setDynamicResolution(on)         DRS off + full scale for any measurement
 *   engine.effectivePixelRatio              basePixelRatio * renderScale (what is really drawn)
 *   engine.onAfterRender[]                  callbacks run right after the composer
 *   engine.perfReset() / engine.perfSnapshot(n)   honest per-frame stats (perf-tech-02)
 *   engine.warmUp(scene, camera)            shader pre-compile (perf-tech-10)
 */

/** Quality tiers (perf-tech-05). `?q=low|medium|high|ultra`, default high. */
export const QUALITY_TIERS = {
  low: {
    dprCap: 1.0, msaa: 2, gtao: false, gtaoScale: 0.5, smaa: true, bloom: true, sizeCullPx: 11,
    shadowCullDistance: 70, shadowCasterBudget: 60, shadowType: THREE.PCFShadowMap, drs: true, drsFloor: 0.55,
  },
  medium: {
    dprCap: 1.25, msaa: 4, gtao: false, gtaoScale: 0.5, smaa: true, bloom: true, sizeCullPx: 9,
    shadowCullDistance: 95, shadowCasterBudget: 95, shadowType: THREE.PCFShadowMap, drs: true, drsFloor: 0.65,
  },
  high: {
    dprCap: 1.5, msaa: 4, gtao: true, gtaoScale: 0.5, smaa: true, bloom: true, sizeCullPx: 7,
    shadowCullDistance: 120, shadowCasterBudget: 150, shadowType: THREE.PCFSoftShadowMap, drs: true, drsFloor: 0.7,
  },
  ultra: {
    dprCap: 2.0, msaa: 4, gtao: true, gtaoScale: 1.0, smaa: true, bloom: true, sizeCullPx: 4,
    shadowCullDistance: 190, shadowCasterBudget: 260, shadowType: THREE.PCFSoftShadowMap, drs: false, drsFloor: 0.85,
  },
};

/** Highest wins. Anything not listed sorts just above `legacy`. */
const TS_PRIORITY = ['studio', 'wheel', 'hitstop', 'concentration', 'legacy'];

/**
 * ACES tonemap + sRGB encode + filmic grade + vignette in ONE fullscreen pass
 * (world-03). Round 4 fix round 1: this used to be three's OutputPass followed
 * by a separate grade ShaderPass. Two full-resolution passes over a half-float
 * target is pure bandwidth — measured 1.3 ms of GPU time and one extra draw
 * call for the privilege — and the grade shader does nothing the output shader
 * could not do on the way past. The op order is byte-identical to the two-pass
 * version (tonemap -> sRGB transfer -> grade), so the look does not move.
 */
const OutputGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    toneMappingExposure: { value: 1 },
    uGradeMix: { value: 1 },
    uContrast: { value: 1.07 },
    uSaturation: { value: 1.06 },
    uLift: { value: new THREE.Vector3(0.004, 0.006, 0.012) },
    uShadowTint: { value: new THREE.Color(0.94, 0.97, 1.08) },
    uHighlightTint: { value: new THREE.Color(1.045, 1.005, 0.955) },
    uVignette: { value: 0.34 },
    uVigInner: { value: 0.34 },
    uVigOuter: { value: 0.92 },
    uAspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uContrast, uSaturation, uVignette, uVigInner, uVigOuter, uAspect, uGradeMix;
    uniform vec3 uLift, uShadowTint, uHighlightTint;
    varying vec2 vUv;

    // NOTE: three injects <colorspace_pars_fragment> into every ShaderMaterial
    // fragment prefix already, so sRGBTransferOETF() is in scope — including it
    // here a second time is a redefinition error.
    #include <tonemapping_pars_fragment>

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);

      #ifdef ACES_FILMIC_TONE_MAPPING
        src.rgb = ACESFilmicToneMapping(src.rgb);
      #elif defined( AGX_TONE_MAPPING )
        src.rgb = AgXToneMapping(src.rgb);
      #elif defined( NEUTRAL_TONE_MAPPING )
        src.rgb = NeutralToneMapping(src.rgb);
      #elif defined( REINHARD_TONE_MAPPING )
        src.rgb = ReinhardToneMapping(src.rgb);
      #elif defined( CINEON_TONE_MAPPING )
        src.rgb = CineonToneMapping(src.rgb);
      #elif defined( LINEAR_TONE_MAPPING )
        src.rgb = LinearToneMapping(src.rgb);
      #endif

      #ifdef SRGB_TRANSFER
        src = sRGBTransferOETF(src);
      #endif

      vec3 c = src.rgb;
      c = (c - 0.5) * uContrast + 0.5 + uLift;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      // split tone: cool shade, warm light — the HZD valley read
      c *= mix(uShadowTint, uHighlightTint, smoothstep(0.12, 0.86, l));
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
      float r = length(d) / (0.5 * sqrt(uAspect * uAspect + 1.0));
      c *= 1.0 - uVignette * smoothstep(uVigInner, uVigOuter, r);
      gl_FragColor = vec4(clamp(mix(src.rgb, c, uGradeMix), 0.0, 1.0), src.a);
    }
  `,
};

/** ShaderPass that keeps the tonemap defines in sync with the renderer. */
class OutputGradePass extends ShaderPass {
  constructor(shader) {
    super(shader);
    // three injects <tonemapping_pars_fragment> into a ShaderMaterial's prefix
    // ONLY when material.toneMapped is true AND the pass happens to be writing
    // to the canvas — so the same shader compiled fine mid-chain and failed
    // with "function already has a body" the moment it rendered to screen.
    // Opting out of the automatic injection makes the include below the single
    // definition in every case, and stops three tonemapping our output twice.
    this.material.toneMapped = false;
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    this.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    if (this._cs !== renderer.outputColorSpace || this._tm !== renderer.toneMapping) {
      this._cs = renderer.outputColorSpace;
      this._tm = renderer.toneMapping;
      const d = {};
      if (THREE.ColorManagement.getTransfer(this._cs) === THREE.SRGBTransfer) d.SRGB_TRANSFER = '';
      const names = {
        [THREE.LinearToneMapping]: 'LINEAR_TONE_MAPPING',
        [THREE.ReinhardToneMapping]: 'REINHARD_TONE_MAPPING',
        [THREE.CineonToneMapping]: 'CINEON_TONE_MAPPING',
        [THREE.ACESFilmicToneMapping]: 'ACES_FILMIC_TONE_MAPPING',
        [THREE.AgXToneMapping]: 'AGX_TONE_MAPPING',
        [THREE.NeutralToneMapping]: 'NEUTRAL_TONE_MAPPING',
      };
      if (names[this._tm]) d[names[this._tm]] = '';
      this.material.defines = d;
      this.material.needsUpdate = true;
    }
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}

/** Bloom mip chains never need DPR-2 fill; cap the widest mip. */
const BLOOM_MAX_WIDTH = 1280;

/**
 * Renders the world into the multisampled scene target (which owns the depth
 * texture GTAO reads) and hands the resolved colour to the composer's plain
 * ping-pong pair. Replaces RenderPass so that MSAA is paid for exactly once.
 */
class ScenePass extends Pass {
  constructor(scene, camera, engine) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.engine = engine;
    this.needsSwap = false;
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }',
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    const target = this.engine.sceneTarget;
    renderer.setRenderTarget(target);
    renderer.clear(true, true, true);
    renderer.render(this.scene, this.camera);
    // reading target.texture is what resolves the multisample buffer — once
    this.material.uniforms.tDiffuse.value = target.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.fsQuad.render(renderer);
  }

  setSize(width, height) {
    const e = this.engine;
    e.sceneTarget.setSize(width, height);
    e.postTarget.setSize(width, height);
    e.depthTexture.image.width = width;
    e.depthTexture.image.height = height;
    e.depthTexture.dispose();
  }

  dispose() { this.fsQuad.dispose(); this.material.dispose(); }
}

const _wp = new THREE.Vector3();

/** Does this material put light into the bloom chain? (allocation-free) */
function _glowsOne(m) {
  if (!m) return false;
  if (m.toneMapped === false) return true;               // unlit / UI / glow quads
  if (m.blending !== undefined && m.blending !== THREE.NormalBlending) return true;
  const e = m.emissive;
  if (e && (e.r + e.g + e.b) * (m.emissiveIntensity ?? 1) > 0.02) return true;
  return false;
}
function _glows(mat) {
  if (Array.isArray(mat)) {
    for (let i = 0; i < mat.length; i++) if (_glowsOne(mat[i])) return true;
    return false;
  }
  return _glowsOne(mat);
}

export class Engine {
  constructor(container, opts = {}) {
    this.opts = opts;
    this.quality = QUALITY_TIERS[opts.quality] ? opts.quality : 'high';
    const tier = QUALITY_TIERS[this.quality];
    this.tier = tier;
    /** Screenshots/gates must be bit-deterministic: no dynamic resolution there. */
    this.drsEnabled = tier.drs && opts.dynamicResolution !== false;

    this.renderer = new THREE.WebGLRenderer({
      // AA is the composer's job now (MSAA render target + SMAA) — canvas AA
      // never applied because every frame goes through the composer (world-02).
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, tier.dprCap);
    this.renderScale = 1;
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = tier.shadowType;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.94;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false; // engine owns the reset (perf-tech-02)
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      55, window.innerWidth / window.innerHeight, 0.1, 2400,
    );
    this.camera.position.set(0, 3, 8);

    this.clock = new THREE.Clock();

    // ---- time authority (machine-rig-18 / studio-19) ----
    this._ts = Object.create(null);
    this._tsOrder = TS_PRIORITY.slice();

    // ---- frame bookkeeping (filled by the game loop) ----
    this.frames = 0;
    this.simTime = 0;
    this.wallTime = 0;
    this.alpha = 1;
    this.steps = 1;
    /** 'substep' (default) or 'fixed' — see docs/SPEC.md §4.1 and main.js. */
    this.stepMode = 'substep';

    this._buildComposer();

    // ---- CSM plumbing (world-01 / perf-tech-03) ----
    this.csm = null;
    this._csmMaterials = new Set();

    // ---- distance caster culling (perf-tech-03) ----
    this.shadowCullDistance = tier.shadowCullDistance;
    this.shadowCasterBudget = tier.shadowCasterBudget;
    this.activeShadowCasters = 0;
    this.shadowCascades = 1;
    this.shadowDrawEstimate = 0;
    /** Screen-space small-mesh cull, device px of projected diameter. 0 = off. */
    this.sizeCullPx = tier.sizeCullPx;
    /**
     * Emissive/additive meshes cull at this fraction of the threshold (0 =
     * never). Measured at the west herd with the sim frozen: culling glows like
     * everything else moves 120 px of a 1.44 Mpx frame, exempting them entirely
     * moves 35 — so half the threshold is the balance point, and a red eye stays
     * on screen until it is genuinely sub-pixel.
     */
    this.sizeCullGlowFactor = 0.5;
    this.sizeCulled = 0;
    this._shadowCullClock = 0;
    this._casterPool = [];   // reused: no per-frame allocation
    this._casterDist = [];

    this.onAfterRender = [];

    // ---- perf ring buffer ----
    /**
     * `js` is the WHOLE main-loop callback, not the submit half of it: every
     * fixed/sub step of every system, every `interpolate()`, the render submit
     * and the frame tail (stats + dynamic resolution). Round 4 judge finding on
     * A21 — the old `js` term timed `engine.render()` alone, so every system
     * update in the game ran outside the number the budget was written for
     * ("systems + submit", tools/budgets.mjs). `sim`/`render`/`tail` carry the
     * split so a failure says which half owes it. main.js `_frame()` is the
     * only writer; see `_recordFrame`.
     */
    this._perf = {
      i: 0, n: 0,
      ms: new Float32Array(240), calls: new Uint16Array(240), tris: new Float64Array(240),
      js: new Float32Array(240), sim: new Float32Array(240),
      render: new Float32Array(240), tail: new Float32Array(240),
    };
    this.lastFrame = { ms: 16.7, jsMs: 0, simMs: 0, renderMs: 0, tailMs: 0, calls: 0, triangles: 0 };
    this._drsAcc = 0;

    this._buildStatsOverlay();
    window.addEventListener('resize', () => this.resize());
  }

  // ------------------------------------------------------------------ post

  _buildComposer() {
    const w = Math.max(1, Math.floor(window.innerWidth * this.basePixelRatio));
    const h = Math.max(1, Math.floor(window.innerHeight * this.basePixelRatio));

    // ---- render-target topology (world-02 / world-03 / perf-tech-06) ----
    //
    // Only the SCENE is worth multisampling; fullscreen quads are not. Three's
    // EffectComposer ping-pongs two buffers, and with an odd number of swapping
    // passes the MSAA buffer ends up being written (and resolved) two or three
    // more times per frame — measured 42.9 ms/frame at DPR 2 versus 19.3 ms
    // with the same passes and no MSAA. So:
    //
    //   composer.renderTarget1  = sceneTarget: MSAA ×N + the depth texture.
    //                             written once by ScenePass, resolved once.
    //   composer.renderTarget2  ┐ plain half-float ping-pong pair, re-seated
    //   engine.postTarget       ┘ every frame by render() so parity can't drift.
    //
    // GTAO samples that depth texture instead of re-rendering a normal/depth
    // G-buffer (+250 draw calls at the spawn vista). Because the depth texture
    // is attached to sceneTarget alone, no pass ever samples a texture bound to
    // the target it writes — ANGLE answers that feedback loop by copying the
    // attachment per draw, which cost 141 ms of stall per frame.
    this.depthTexture = new THREE.DepthTexture(w, h);
    this.depthTexture.format = THREE.DepthFormat;
    this.depthTexture.type = THREE.UnsignedIntType;
    this.depthTexture.minFilter = THREE.NearestFilter;
    this.depthTexture.magFilter = THREE.NearestFilter;

    const sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      depthTexture: this.depthTexture,
      samples: this.tier.msaa,
    });
    sceneRT.texture.name = 'HZC.sceneTarget';
    this.sceneTarget = sceneRT;

    this.composer = new EffectComposer(this.renderer, sceneRT);
    // the custom-target branch of the composer ctor leaves _width in device px;
    // re-declare the CSS size so addPass()/setSize() size passes correctly.
    this.composer._pixelRatio = this.basePixelRatio;
    this.composer._width = window.innerWidth;
    this.composer._height = window.innerHeight;

    this.composer.renderTarget2.depthTexture?.dispose();
    this.composer.renderTarget2.dispose();
    this.composer.renderTarget2 = this._makePostTarget(w, h, 'HZC.postA');
    this.postTarget = this._makePostTarget(w, h, 'HZC.postB');

    this.scenePass = new ScenePass(this.scene, this.camera, this);
    this.composer.addPass(this.scenePass);

    // GTAO (world-03) — half-res cone tracing off the shared depth, denoised,
    // blended multiplicatively in HDR before bloom.
    this.gtao = new GTAOPass(this.scene, this.camera, w, h);
    this._attachGtaoDepth();
    this.gtao.blendIntensity = 0.9;
    this.gtao.updateGtaoMaterial({
      radius: 0.55, distanceExponent: 1.6, thickness: 0.7,
      scale: 1.0, samples: 9, distanceFallOff: 1.0, screenSpaceRadius: false,
    });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 4 });
    this.gtao.enabled = this.tier.gtao;
    this.composer.addPass(this.gtao);

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.35, 0.5, 1.08,
    );
    // Bloom is low-frequency by definition: paying DPR-2 fill for it buys
    // nothing a viewer can see, so its mip chain is capped at 1280 wide.
    const bloomSetSize = UnrealBloomPass.prototype.setSize.bind(this.bloom);
    this.bloom.setSize = (bw, bh) => {
      const s = Math.min(1, BLOOM_MAX_WIDTH / Math.max(1, bw));
      bloomSetSize(Math.max(2, Math.round(bw * s)), Math.max(2, Math.round(bh * s)));
    };
    this.bloom.enabled = this.tier.bloom;
    this.composer.addPass(this.bloom);

    // tonemap + sRGB + grade + vignette, one pass (see OutputGradeShader)
    this.grade = new OutputGradePass(OutputGradeShader);
    this.grade.uniforms.uAspect.value = window.innerWidth / Math.max(1, window.innerHeight);
    this.composer.addPass(this.grade);

    this.smaa = new SMAAPass(w, h);
    this.smaa.enabled = this.tier.smaa;
    this.composer.addPass(this.smaa);
  }

  _makePostTarget(w, h, name) {
    const t = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      samples: 0,
    });
    t.texture.name = name;
    return t;
  }

  /**
   * Point GTAO at the composer's depth attachment. GTAOPass.setGBuffer() reads
   * `this.normalRenderTarget.depthTexture` on the external path (an upstream
   * three r169 slip), so the pass is built with its own G-buffer first and the
   * now-dead normal target is shrunk to 1×1 rather than left at full res.
   */
  _attachGtaoDepth() {
    const g = this.gtao;
    g.setGBuffer(this.depthTexture, undefined);
    g.normalRenderTarget?.setSize(1, 1);
    const scale = this.tier.gtaoScale;
    g.setSize = (w, h) => {
      GTAOPass.prototype.setSize.call(g, Math.max(2, Math.round(w * scale)), Math.max(2, Math.round(h * scale)));
      g.normalRenderTarget?.setSize(1, 1);
    };
    g.setSize(g.width, g.height);
  }

  /** Swap quality tier at runtime (settings screen / F3 cycling). */
  setQuality(name) {
    const tier = QUALITY_TIERS[name];
    if (!tier || name === this.quality) return this.quality;
    this.quality = name;
    this.tier = tier;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, tier.dprCap);
    this.renderScale = 1;
    this.renderer.shadowMap.type = tier.shadowType;
    this.renderer.shadowMap.needsUpdate = true;
    this.shadowCullDistance = tier.shadowCullDistance;
    this.shadowCasterBudget = tier.shadowCasterBudget;
    this.sizeCullPx = tier.sizeCullPx;
    this.gtao.enabled = tier.gtao;
    this.bloom.enabled = tier.bloom;
    this.smaa.enabled = tier.smaa;
    this.drsEnabled = tier.drs && this.opts.dynamicResolution !== false;
    // MSAA sample count is a render-target property: rebuild in place.
    this.sceneTarget.samples = tier.msaa;
    this.sceneTarget.dispose();
    this.resize();
    return this.quality;
  }

  /**
   * Grade on/off WITHOUT losing the tonemap: the grade shares the output pass
   * now, so `grade.enabled = false` would dump raw HDR to the screen. Lanes and
   * A/B probes flip this instead.
   */
  setGrade(on) { this.grade.uniforms.uGradeMix.value = on ? 1 : 0; return !!on; }

  /**
   * Dynamic resolution on/off, and always back to full scale when it goes off
   * (perf-tech-05). Anything that measures — A21, tools/screenshot.mjs, a photo
   * mode capture — has to call this: with DRS live, `basePixelRatio` is NOT the
   * ratio being rendered at (`renderScale` multiplies it), so a burst labelled
   * "DPR 1.5" could be sampling 1.05 and nobody could tell from the numbers.
   */
  setDynamicResolution(on) {
    this.drsEnabled = !!on && this.tier.drs !== false && this.opts.dynamicResolution !== false;
    if (!this.drsEnabled && this.renderScale !== 1) {
      this.renderScale = 1;
      this._drsAcc = 0;
      this.resize();
    }
    return this.drsEnabled;
  }

  /** The pixel ratio actually being rendered at, DRS included. */
  get effectivePixelRatio() { return this.basePixelRatio * this.renderScale; }

  /**
   * Restore every mesh the screen-space cull is currently hiding. Photo mode
   * and any offline capture should call this before a beauty frame.
   */
  uncullAll() {
    let n = 0;
    this.scene.traverse((o) => {
      if (o.userData?.__sizeCulled === true) { o.visible = true; o.userData.__sizeCulled = false; n++; }
    });
    this.sizeCulled = 0;
    return n;
  }

  // ------------------------------------------------------------- timeScale

  /**
   * The one place a slow-mo owner is allowed to speak. `value === null`
   * releases the source. Priority: studio > wheel > hitstop > concentration >
   * anything else > direct `engine.timeScale =` writes (legacy).
   */
  requestTimeScale(source, value) {
    if (value === null || value === undefined) delete this._ts[source];
    else {
      if (!this._tsOrder.includes(source)) this._tsOrder.splice(this._tsOrder.length - 1, 0, source);
      this._ts[source] = value;
    }
    return this.timeScale;
  }

  timeScaleSources() { return { ...this._ts }; }

  get timeScale() {
    for (let i = 0; i < this._tsOrder.length; i++) {
      const v = this._ts[this._tsOrder[i]];
      if (v !== undefined) return v;
    }
    return 1;
  }

  /** Legacy write path — lowest priority so studio/wheel always win. */
  set timeScale(v) { this._ts.legacy = v; }

  // -------------------------------------------------------------- cascades

  /**
   * Wire cascaded shadow maps. `world-light` owns the values; this owns the
   * plumbing. Pass the existing sun as `light` and its shadow is handed over.
   */
  enableCSM({ light = null, cascades = 3, maxFar = 220, mode = 'practical',
    shadowMapSize = 2048, lightMargin = 220, shadowBias = -0.0004, fade = true,
    lightDirection = null, lightIntensity = null } = {}) {
    if (this.csm) this.disableCSM();
    const dir = lightDirection
      ? lightDirection.clone().normalize()
      : light
        ? _wp.copy(light.target?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3())
          .sub(light.getWorldPosition(new THREE.Vector3())).normalize().clone()
        : new THREE.Vector3(1, -1, 1).normalize();
    this.csm = new CSM({
      camera: this.camera,
      parent: this.scene,
      cascades, maxFar, mode, shadowMapSize, lightMargin, shadowBias,
      lightDirection: dir,
      lightIntensity: lightIntensity ?? (light ? light.intensity : 3),
    });
    this.csm.fade = fade;
    if (light) {
      this.csmSourceLight = light;
      this._csmLightShadowWas = light.castShadow;
      light.castShadow = false;
      for (const l of this.csm.lights) l.color.copy(light.color);
    }
    this.csm.updateFrustums();
    return this.csm;
  }

  disableCSM() {
    if (!this.csm) return;
    for (const m of this._csmMaterials) { this.csm.teardownMaterial?.(m); m.needsUpdate = true; }
    this._csmMaterials.clear();
    this.csm.remove?.();
    this.csm.dispose?.();
    if (this.csmSourceLight) this.csmSourceLight.castShadow = this._csmLightShadowWas ?? true;
    this.csm = null;
  }

  /**
   * Register a material with the cascades (no-op when CSM is off).
   *
   * A CASCADE REGISTRATION IS A STRONG REFERENCE, AND IT HAD NO END
   * (`memory-attribution`). `three/examples/jsm/csm/CSM.js` keeps
   * `this.shaders = new Map()` keyed by MATERIAL (CSM.js:46, :278, :282) and
   * this class kept `_csmMaterials = new Set()` of the same materials — two
   * strong containers, neither with a removal path. `environment.js`
   * `_registerScene()` re-traverses the scene on a timer and registers every
   * material it has not seen, so every machine that spawns puts its ~9
   * materials in both, and a machine that dies takes none of them out:
   * `sites.dispose()` disposes the material and the Map goes on holding it,
   * with its maps, its uniforms and its cached shader object.
   *
   * MEASURED, `A90b-memory-attribution` container census, 30 kills and 30
   * spawns on port 5208: `engine._csmMaterials` **+267**, `engine.csm.shaders`
   * **+267**, monotonic, against a live scene whose material count was flat.
   * That is the largest single retainer the attribution pass found, and it is
   * unbounded in a normal session, not just under a gate's workload.
   *
   * The fix is the one line the upstream class is missing: a material that
   * disposes drops out of both containers. `Material.dispose()` dispatches a
   * `dispose` event (three.module.js `Material.prototype.dispose`), so the
   * listener costs nothing per frame and cannot be forgotten by a caller. The
   * closure captures the material, and the material owns the listener — that
   * cycle is collectable once these two containers let go, which is the point.
   */
  csmSetupMaterial(material) {
    if (!this.csm || !material || this._csmMaterials.has(material)) return material;
    this.csm.setupMaterial(material);
    this._csmMaterials.add(material);
    if (!material.userData?.csmForgetBound) {
      if (material.userData) material.userData.csmForgetBound = true;
      material.addEventListener('dispose', () => this.csmForgetMaterial(material));
    }
    return material;
  }

  /**
   * Drop a material from the cascade bookkeeping. Called automatically when the
   * material disposes; safe to call by hand and safe to call twice.
   *
   * @returns {boolean} whether this engine was still holding it
   */
  csmForgetMaterial(material) {
    if (!material) return false;
    const had = this._csmMaterials.delete(material);
    try { this.csm?.shaders?.delete?.(material); } catch (err) { /* CSM internals moved */ }
    return had;
  }

  // -------------------------------------------------------------- warm-up

  /**
   * perf-tech-10 — compile every program while the loading bar is still up so
   * the first arrow / first Thunderjaw does not stall the frame.
   */
  async warmUp(scene = this.scene, camera = this.camera, timeoutMs = 20000) {
    const t0 = performance.now();
    try {
      await Promise.race([
        this.renderer.compileAsync(scene, camera),
        new Promise((r) => setTimeout(r, timeoutMs)),
      ]);
    } catch (err) {
      console.warn('[HZC] shader warm-up skipped:', err?.message || err);
    }
    const textures = this.warmUpTextures(scene);
    this.warmUpMs = Math.round(performance.now() - t0);
    this.warmUpPrograms = this.renderer.info.programs?.length ?? 0;
    this.warmUpTexturesUploaded = textures;
    return { ms: this.warmUpMs, programs: this.warmUpPrograms, textures };
  }

  /**
   * ...AND EVERY GPU RESOURCE, NOT JUST EVERY PROGRAM (`memory-attribution`).
   *
   * `compileAsync` builds programs. It does NOT upload textures: three uploads
   * a texture the first time a draw call binds it (`WebGLTextures.setTexture2D`
   * -> `initTexture`, three.module.js:24788), and `info.memory.textures++`
   * happens there (:24825). Two consequences, one visible and one measured:
   *
   *   - the first frame that shows a surface nobody has drawn yet pays for its
   *     upload on the frame, which is the same class of hitch `warmUp()` was
   *     written to remove for shaders;
   *   - `renderer.info.memory.textures` climbs for MINUTES after boot as the
   *     player walks into parts of the world that have not been drawn. Measured
   *     by `A90b-memory-attribution` on port 5208: of a +22 texture delta across
   *     30 kills, **18 were first-time uploads of textures that already existed
   *     at boot** and 0 were leaked — `A90-memory-stability` was failing its
   *     "textures <= +8" bar mostly on the world being SEEN for the first time.
   *
   * Uploading them behind the loading bar fixes both: the counter is honest
   * from the first frame, and nothing stalls. A skeleton's bone texture is
   * built here too (`Skeleton.computeBoneTexture`, which the renderer would
   * otherwise do lazily at first draw) so a machine that walks into view does
   * not allocate on the frame either. Idempotent — `initTexture` on an already
   * uploaded texture is a no-op — so the deferred re-run after the variety
   * models land costs only the traversal.
   *
   * @returns {number} textures pushed to the GPU
   */
  warmUpTextures(scene = this.scene) {
    const r = this.renderer;
    if (!r?.initTexture || !scene) return 0;
    const seen = new Set();
    let n = 0;
    const put = (t) => {
      if (!t || !t.isTexture || seen.has(t)) return;
      seen.add(t);
      // a render target's texture is owned and sized by the target itself
      if (t.isRenderTargetTexture) return;
      try { r.initTexture(t); n++; } catch (err) { /* exotic/compressed format */ }
    };
    scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) {
        if (!m) continue;
        for (const k in m) {
          const v = m[k];
          if (v && v.isTexture) put(v);
        }
      }
      if (o.isSkinnedMesh && o.skeleton) {
        try {
          if (!o.skeleton.boneTexture) o.skeleton.computeBoneTexture();
          put(o.skeleton.boneTexture);
        } catch (err) { /* a skin with no bones */ }
      }
    });
    return n;
  }

  // ----------------------------------------------------------------- size

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.basePixelRatio * this.renderScale);
    this.renderer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    // composer.setSize resizes rt1/rt2 and calls setSize on every pass;
    // ScenePass.setSize is what re-sizes the shared depth texture + postTarget
    // (RenderTarget.setSize does not touch an attached depth texture).
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.grade.uniforms.uAspect.value = w / Math.max(1, h);
    // Both of these are cross-lane: CSM is world-light's, onResize is anyone's.
    // resize() runs from the dynamic-resolution path inside the frame loop, so
    // a throw here would take the loop with it (see Game._frame).
    try { this.csm?.updateFrustums(); } catch (err) { this._hookThrew('csm.updateFrustums', err); }
    try { this.onResize?.(w, h); } catch (err) { this._hookThrew('engine.onResize', err); }
  }

  /** One warn per hook, then silence — the frame loop must not spam. */
  _hookThrew(key, err) {
    this._hookErrors = this._hookErrors || new Map();
    const n = (this._hookErrors.get(key) || 0) + 1;
    this._hookErrors.set(key, n);
    if (n === 1) console.warn(`[HZC] ${key} threw — recovered, logged once:`, err);
    this.hookErrorCount = (this.hookErrorCount ?? 0) + 1;
  }

  // ------------------------------------------------------- shadow culling

  /**
   * ONE traversal, two policies (perf-tech-03 + the screen-space half of
   * perf-tech-04).
   *
   * 1. Shadow casters. The shadow pass was 241 of 464 draw calls at the spawn
   *    vista. Casters past `shadowCullDistance` stop rendering into the map;
   *    the flag they had is restored the moment they come back in range.
   *
   * 2. Small meshes. A machine is built from 8-31 separate meshes and every one
   *    of them is a draw call at any distance — the west herd spent 90 calls on
   *    six striders whose bolt heads and hip plates project to one pixel. A
   *    mesh whose projected diameter is under `sizeCullPx` device pixels is
   *    hidden until it grows back past the hysteresis band. This is a renderer
   *    policy, not a model change: it is generic over the scene, it never
   *    touches a mesh an owner has already hidden, and `userData.noSizeCull`
   *    opts a mesh out. It is NOT a substitute for real LOD chains
   *    (`machine-rig` perf-tech-04/14) — it only removes what is already
   *    sub-pixel.
   */
  _cullPass(dt) {
    this._shadowCullClock -= dt;
    if (this._shadowCullClock > 0) return;
    this._shadowCullClock = 0.1;
    const cam = this.camera.position;
    const pool = this._casterPool, dists = this._casterDist;
    pool.length = 0;
    dists.length = 0;

    // projected diameter in device px = 2 * r * (H / (2 tan(fov/2))) / distance
    //
    // FIX ROUND 1 — measure against the BASE resolution, never the drawing
    // buffer. `getDrawingBufferSize()` carries `renderScale`, so with dynamic
    // resolution running the threshold moved with the load: a busy frame
    // dropped to 0.7 scale, every mesh lost 30 % of its projected size, and
    // parts of machines vanished exactly when the frame was already struggling
    // (and came back when it recovered) — measured at the spawn vista, 35 more
    // meshes fell under the threshold at scale 0.7, 29 of them machine parts. It also made the draw-call count
    // load-dependent — the same staged scene read 456 / 483 / 295 calls across
    // runs of A21, which is what cost the last round its reproducibility.
    // What is visible must depend on where the camera is, not on how busy the
    // GPU is.
    const baseH = Math.max(1, Math.round(window.innerHeight * this.basePixelRatio));
    const fovK = baseH / (2 * Math.tan((this.camera.fov * Math.PI / 180) / 2));
    const cullPx = this.sizeCullPx;
    // hysteresis is applied inline as limit * 1.3: never flicker on the boundary
    let sizeCulled = 0;

    this.scene.traverse((o) => {
      if (!o.isMesh) return;
      // Read the matrix the LAST render left behind instead of calling
      // getWorldPosition(), which walks the parent chain and recomputes
      // matrices for every mesh in the scene. One frame of staleness is
      // irrelevant to a cull decision and this pass now touches every mesh,
      // not just the casters.
      const me = o.matrixWorld.elements;
      _wp.set(me[12], me[13], me[14]);
      // WORLD scale, not o.scale: every model here is scaled by its normalizing
      // wrapper, so the local scale of a machine's hip plate is 1 and its real
      // size is two groups up. Largest column length of the world matrix.
      const scl = Math.sqrt(Math.max(
        me[0] * me[0] + me[1] * me[1] + me[2] * me[2],
        me[4] * me[4] + me[5] * me[5] + me[6] * me[6],
        me[8] * me[8] + me[9] * me[9] + me[10] * me[10]));
      let r = o.geometry?.boundingSphere?.radius;
      if (r === undefined || r === null) {
        o.geometry?.computeBoundingSphere?.();
        r = o.geometry?.boundingSphere?.radius ?? 0;
      }
      r *= scl;
      const dx = _wp.x - cam.x, dy = _wp.y - cam.y, dz = _wp.z - cam.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // ---- 2. screen-space small-mesh cull ----
      const wasCulled = o.userData.__sizeCulled === true;
      if (cullPx > 0 && !o.userData.noSizeCull && !o.isInstancedMesh && r > 0) {
        // Anything that glows keeps a far lower threshold: bloom turns a 4-pixel
        // emissive lens into a 200-pixel flare, so culling one by its geometry
        // size deletes something the player can see across the valley — and the
        // red eye / orange canister read IS the machine's tell. Measured on
        // film: hiding them at 7 px removed the strider's chest glare entirely.
        const glow = _glows(o.material);
        const limit = glow ? cullPx * this.sizeCullGlowFactor : cullPx;
        const px = 2 * r * fovK / Math.max(0.05, dist);
        if (limit <= 0) {
          if (wasCulled) { o.visible = true; o.userData.__sizeCulled = false; }
          if (o.castShadow || o.userData.__shadowCulled === true) {
            pool.push(o); dists.push(Math.max(0, dist - r));
          }
          return;
        }
        if (px < limit || (wasCulled && px < limit * 1.3)) {
          if (!wasCulled && o.visible) { o.visible = false; o.userData.__sizeCulled = true; }
          if (o.userData.__sizeCulled === true) sizeCulled++;
        } else if (wasCulled) {
          o.visible = true;
          o.userData.__sizeCulled = false;
        }
      } else if (wasCulled) {
        o.visible = true;
        o.userData.__sizeCulled = false;
      }

      // ---- 1. shadow caster cull ----
      if (o.userData.__sizeCulled === true) return; // invisible: draws nothing at all
      const off = o.userData.__shadowCulled === true;
      if (!off && !o.castShadow) return; // never a caster: nothing to do
      pool.push(o);
      dists.push(Math.max(0, dist - r));
    });
    this.sizeCulled = sizeCulled;
    // Distance cull first, then a hard caster budget: in a staged eight-machine
    // fight everything is inside 30 m and distance alone saves nothing, so the
    // nearest N keep their shadows and the rest drop out until they matter.
    let cut = this.shadowCullDistance;
    // The budget is a DRAW budget, not a caster budget. Cascaded shadow maps
    // render every caster once PER CASCADE — measured at the spawn vista, three
    // cascades took the frame from 292 to 415 calls with the same caster list —
    // so when world-light turns CSM on, the number of casters that fits inside
    // the same number of draws is divided by the cascade count. world-light can
    // raise `engine.shadowCasterBudget` if it has frame to spend; it must not
    // discover the 3x silently.
    const cascades = this.csm ? (this.csm.cascades || 1) : 1;
    const budget = Math.max(8, Math.floor(this.shadowCasterBudget / cascades));
    this.shadowDrawEstimate = 0;
    // Rank by distance rather than thresholding on it: a distance CUT admits
    // every tie above the budget, and ties are common because `dist - radius`
    // clamps to 0 for anything the camera is standing inside (terrain, camp
    // structures). Measured: a 150-caster budget was letting 198 casters
    // through with three cascades. The rank array is reused; the sort runs at
    // most 10x/second.
    const order = this._casterOrder || (this._casterOrder = []);
    order.length = 0;
    for (let i = 0; i < dists.length; i++) if (dists[i] <= cut) order.push(i);
    if (order.length > budget) {
      order.sort((a, b) => dists[a] - dists[b]);
      order.length = budget;
    }
    const keep = this._casterKeep || (this._casterKeep = new Set());
    keep.clear();
    for (let i = 0; i < order.length; i++) keep.add(order[i]);
    let active = 0;
    for (let i = 0; i < pool.length; i++) {
      const o = pool[i];
      const off = o.userData.__shadowCulled === true;
      const on = keep.has(i);
      if (on) {
        active++;
        if (off) {
          o.castShadow = o.userData.__shadowBase !== false;
          o.userData.__shadowCulled = false;
        }
      } else if (!off) {
        o.userData.__shadowBase = o.castShadow;
        o.castShadow = false;
        o.userData.__shadowCulled = true;
      }
    }
    this.activeShadowCasters = active;
    this.shadowCascades = cascades;
    this.shadowDrawEstimate = active * cascades;
  }

  // ---------------------------------------------------------------- stats

  _buildStatsOverlay() {
    const el = document.createElement('div');
    el.id = 'perf-stats';
    el.style.cssText = 'position:fixed;top:8px;left:8px;z-index:99999;display:none;'
      + 'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#cfe6f2;'
      + 'background:rgba(6,12,18,.78);border:1px solid rgba(120,190,225,.35);'
      + 'padding:7px 10px;white-space:pre;pointer-events:none;letter-spacing:.02em;'
      + 'text-shadow:0 1px 2px rgba(0,0,0,.9)';
    document.body.appendChild(el);
    this.statsEl = el;
    this.statsVisible = false;
    this._statsClock = 0;
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'F3') return;
      e.preventDefault();
      this.statsVisible = !this.statsVisible;
      if (this.statsVisible) this.enableGpuTimer(true);
      el.style.display = this.statsVisible ? 'block' : 'none';
    });
  }

  /**
   * True GPU cost per frame via EXT_disjoint_timer_query_webgl2. rAF pacing is
   * quantised by vsync (16.7 / 33.3 / 50 ms) and collapses the moment another
   * process touches the CPU, so the perf gate measures the work itself.
   */
  enableGpuTimer(on = true) {
    if (on && this._gpuExt === undefined) {
      this._gl = this.renderer.getContext();
      this._gpuExt = this._gl.getExtension('EXT_disjoint_timer_query_webgl2') || null;
      this._gpuPending = [];
      this._gpuSamples = [];
    }
    this.gpuTimerOn = !!(on && this._gpuExt);
    return this.gpuTimerOn;
  }

  _pollGpuTimer() {
    const gl = this._gl, ext = this._gpuExt, pending = this._gpuPending;
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      for (const q of pending) gl.deleteQuery(q);
      pending.length = 0;
      return;
    }
    while (pending.length) {
      const q = pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      gl.deleteQuery(q);
      pending.shift();
      this.lastGpuMs = ns / 1e6;
      this._gpuSamples.push(this.lastGpuMs);
      if (this._gpuSamples.length > 240) this._gpuSamples.shift();
    }
    while (pending.length > 8) gl.deleteQuery(pending.shift());
  }

  perfReset() {
    this._perf.i = 0;
    this._perf.n = 0;
    if (this._gpuSamples) this._gpuSamples.length = 0;
  }

  /** Honest per-frame stats over the last `n` recorded frames. */
  perfSnapshot(n = 60) {
    const p = this._perf, cap = p.ms.length;
    const count = Math.min(n, p.n);
    if (!count) return null;
    const ms = [], calls = [], tris = [], js = [], sim = [], render = [], tail = [];
    for (let k = 0; k < count; k++) {
      const idx = (p.i - 1 - k + cap * 2) % cap;
      ms.push(p.ms[idx]); calls.push(p.calls[idx]); tris.push(p.tris[idx]); js.push(p.js[idx]);
      sim.push(p.sim[idx]); render.push(p.render[idx]); tail.push(p.tail[idx]);
    }
    const sorted = ms.slice().sort((a, b) => a - b);
    const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
    const asc = (a) => a.slice().sort((x, y) => x - y);
    const jsSorted = asc(js), simSorted = asc(sim), renderSorted = asc(render), tailSorted = asc(tail);
    const gpu = (this._gpuSamples || []).slice(-count).sort((a, b) => a - b);
    return {
      gpuFrames: gpu.length,
      p95GpuMs: gpu.length ? +q(gpu, 0.95).toFixed(2) : null,
      medianGpuMs: gpu.length ? +q(gpu, 0.5).toFixed(2) : null,
      frames: count,
      medianFrameMs: +q(sorted, 0.5).toFixed(2),
      p95FrameMs: +q(sorted, 0.95).toFixed(2),
      maxFrameMs: +sorted[sorted.length - 1].toFixed(2),
      // The JS term is the whole main-loop callback (see `_perf` above); the
      // three parts below add up to it, frame for frame.
      p95JsMs: +q(jsSorted, 0.95).toFixed(2),
      medianJsMs: +q(jsSorted, 0.5).toFixed(2),
      maxJsMs: +jsSorted[jsSorted.length - 1].toFixed(2),
      p95SimMs: +q(simSorted, 0.95).toFixed(2),
      medianSimMs: +q(simSorted, 0.5).toFixed(2),
      p95RenderMs: +q(renderSorted, 0.95).toFixed(2),
      medianRenderMs: +q(renderSorted, 0.5).toFixed(2),
      p95TailMs: +q(tailSorted, 0.95).toFixed(2),
      jsTerm: 'sim(steps+interpolate) + renderSubmit + frameTail',
      maxDrawCalls: Math.max(...calls),
      minDrawCalls: Math.min(...calls),
      medianDrawCalls: q(calls.slice().sort((a, b) => a - b), 0.5),
      maxTriangles: Math.max(...tris),
      fps: +(1000 / (ms.reduce((a, b) => a + b, 0) / count)).toFixed(1),
      pixelRatio: +this.renderer.getPixelRatio().toFixed(3),
      renderScale: +this.renderScale.toFixed(3),
      quality: this.quality,
    };
  }

  /**
   * Record one frame. `jsMs` MUST be the whole main-loop callback — the caller
   * (main.js `_frame`) times it from before the first simulation step to after
   * the frame tail — and `simMs`/`renderMs`/`tailMs` are its parts. Called last
   * in the frame so the tail it reports is this frame's, not the previous one's.
   */
  _recordFrame(frameMs, jsMs, simMs = 0, renderMs = 0, tailMs = 0) {
    const p = this._perf, cap = p.ms.length;
    const info = this.renderer.info;
    p.ms[p.i] = frameMs;
    p.js[p.i] = jsMs;
    p.sim[p.i] = simMs;
    p.render[p.i] = renderMs;
    p.tail[p.i] = tailMs;
    p.calls[p.i] = Math.min(65535, info.render.calls);
    p.tris[p.i] = info.render.triangles;
    p.i = (p.i + 1) % cap;
    p.n = Math.min(cap, p.n + 1);
    this.lastFrame.ms = frameMs;
    this.lastFrame.jsMs = jsMs;
    this.lastFrame.simMs = simMs;
    this.lastFrame.renderMs = renderMs;
    this.lastFrame.tailMs = tailMs;
    this.lastFrame.calls = info.render.calls;
    this.lastFrame.triangles = info.render.triangles;
  }

  _updateStats(dt) {
    if (!this.statsVisible) return;
    this._statsClock -= dt;
    if (this._statsClock > 0) return;
    this._statsClock = 0.25;
    const s = this.perfSnapshot(60);
    if (!s) return;
    const info = this.renderer.info;
    const errs = this.systemErrorCount ?? 0;
    this.statsEl.textContent =
      `HZC  ${s.fps} fps   ${s.medianFrameMs}ms med  ${s.p95FrameMs}ms p95  ${s.maxFrameMs}ms max`
      + `${s.p95GpuMs != null ? `  gpu ${s.medianGpuMs}/${s.p95GpuMs}ms` : ''}\n`
      + `js ${s.p95JsMs}ms p95 = sim ${s.p95SimMs} + submit ${s.p95RenderMs} + tail ${s.p95TailMs}\n`
      + `draw ${this.lastFrame.calls}  tris ${(this.lastFrame.triangles / 1000).toFixed(0)}k  `
      + `prog ${info.programs?.length ?? 0}  geo ${info.memory.geometries}  tex ${info.memory.textures}\n`
      + `q=${this.quality}  dpr ${s.pixelRatio} (x${s.renderScale})  msaa ${this.composer.renderTarget1.samples}  `
      + `gtao ${this.gtao.enabled ? 'on' : 'off'}  smaa ${this.smaa.enabled ? 'on' : 'off'}\n`
      + `steps ${this.steps} ${this.stepMode}  alpha ${this.alpha.toFixed(2)}  ts ${this.timeScale.toFixed(3)} `
      + `[${Object.keys(this._ts).join(',') || 'none'}]  casters ${this.activeShadowCasters}`
      + `${this.shadowCascades > 1 ? `x${this.shadowCascades}=${this.shadowDrawEstimate}` : ''}/${this.shadowCasterBudget}  `
      + `sizecull ${this.sizeCulled}@${this.sizeCullPx}px\n`
      + `sim ${this.simTime.toFixed(1)}s  frames ${this.frames}  errors ${errs}`;
  }

  // -------------------------------------------------- dynamic resolution

  /** perf-tech-05 — hold the frame budget by trading pixels, not systems. */
  _updateDynamicResolution(frameMs) {
    if (!this.drsEnabled) return;
    this._drsAcc = this._drsAcc * 0.9 + frameMs * 0.1;
    // Each change reallocates the render targets, so rate-limit hard: at most
    // one step every 0.6 s, and never inside the 14.5-20.5 ms dead band.
    this._drsCooldown = (this._drsCooldown ?? 0) - frameMs / 1000;
    if (this._drsCooldown > 0) return;
    const floor = this.tier.drsFloor;
    let next = this.renderScale;
    if (this._drsAcc > 20.5 && this.renderScale > floor) next = Math.max(floor, this.renderScale - 0.05);
    else if (this._drsAcc < 14.5 && this.renderScale < 1) next = Math.min(1, this.renderScale + 0.025);
    if (Math.abs(next - this.renderScale) > 0.001) {
      this.renderScale = next;
      this._drsCooldown = 0.6;
      this.resize();
    }
  }

  // --------------------------------------------------------------- render

  /**
   * Submit the frame. Returns the SUBMIT half of the main-loop JS time only —
   * cull + CSM + composer + the after-render hooks. The whole-frame JS number
   * the perf budget is written against is assembled by main.js `_frame()` and
   * handed to `_recordFrame()`; do not mistake this return value for it.
   */
  render(realDt = 0.016) {
    this.renderer.info.reset();
    const t0 = performance.now();
    this._cullPass(realDt);
    this.csm?.update();
    // Deterministic ping-pong: ScenePass always resolves into renderTarget2 and
    // the chain alternates rt2 <-> postTarget from there. Without re-seating,
    // the composer's swap parity drifts frame to frame and the multisampled
    // scene target gets picked up as a post write target again.
    this.composer.readBuffer = this.composer.renderTarget2;
    this.composer.writeBuffer = this.postTarget;
    let query = null;
    if (this.gpuTimerOn) {
      query = this._gl.createQuery();
      this._gl.beginQuery(this._gpuExt.TIME_ELAPSED_EXT, query);
    }
    this.composer.render(realDt);
    if (query) {
      this._gl.endQuery(this._gpuExt.TIME_ELAPSED_EXT);
      this._gpuPending.push(query);
      this._pollGpuTimer();
    }
    for (let i = 0; i < this.onAfterRender.length; i++) {
      try { this.onAfterRender[i](this); } catch (err) { this._hookThrew('engine.onAfterRender[' + i + ']', err); }
    }
    // after the hooks: they run inside the frame and cost real milliseconds
    // (the perf scenarios' pin closure is one of them).
    return performance.now() - t0;
  }
}
