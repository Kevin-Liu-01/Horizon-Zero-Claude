import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { CSMFrustum } from 'three/examples/jsm/csm/CSMFrustum.js';

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
 *
 * ROUND 5 (engine-gpu W0a) — render-target measurement hooks, gate A-rt-ledger,
 * docs/ROUND5-ENGINE.md. On demand only: nothing here runs per frame.
 *   engine.renderTargetLedger()              every render target -> GPU bytes
 *   engine.registerRenderTarget(owner, rt)   a lane's own target (held weakly; survives setSize)
 *   engine.unregisterRenderTarget(rt)
 *   engine.trackRenderTargets(on)            measurement mode: remember every bound target
 *   engine.glTally                           `?rtTally=1` only: GL allocation tally from boot (census)
 * PMREMGenerator outputs are remembered by texture (WeakRef to the target) so
 * the ledger counts scene.environment with the depth renderbuffer fromScene made.
 *
 * ROUND 5 (engine-gpu W0b) — THE GPU TIER DECISION, gates A-gpu-tier and
 * A-rt-ledger, numbers in docs/ROUND5-ENGINE.md §3. The shipped default tier
 * (`high`) takes the plan's levers: DPR cap 1.25, SMAA-only (no MSAA; R25),
 * GTAO at quarter resolution, SMAA targets RGBA8, and per-cascade shadow-map
 * caps applied inside enableCSM (world-sky still asks for its own size).
 * Fix round 1 (the vista GPU term): the direct post topology (no MSAA ->
 * no resolve copy; renderTarget2 holds the grade's RGBA8 output), GTAO's
 * multiply and bloom's composite folded into the grade, far cascades on
 * alternate frames, and an anisotropic-filtering cap.
 *   QUALITY_TIERS.<tier>.smaaHalfFloat / .csmMapCaps   W0b levers
 *   QUALITY_TIERS.<tier>.postFold / .csmFarCadence / .maxAnisotropy   fix-round-1 levers
 *   ROUND4_HIGH                              the Round-4 `high` row, for before/after
 *   engine.applyTier(row, name)              apply any tier row at runtime (setQuality's body)
 *   engine.csmMapSizes                       the per-cascade map sizes in force
 *   engine.postDirect                        the direct topology is in force (no MSAA)
 *   engine.anisotropyCap                     the anisotropic-filtering cap in force (colour textures)
 * Fix round 2: the cap is split by texture role.
 *   QUALITY_TIERS.<tier>.maxAnisotropyData   cap on data textures (normal / rough / AO maps)
 *   engine.anisotropyCapData                 the data-texture cap in force
 */

/**
 * Quality tiers (perf-tech-05). `?q=low|medium|high|ultra`, default high.
 *
 * `csmMapCaps[i]` caps cascade i's shadow map (the last entry repeats); null =
 * every cascade at the size world-sky asks for. `smaaHalfFloat: false` stores
 * the SMAA edge and blend-weight targets as RGBA8, which is the format the
 * SMAA reference implementation uses for both (three r169 allocates them as
 * HalfFloat: 18 MB for nothing at 2000 x 1125).
 * `postFold`: GTAO's multiply and bloom's composite run inside the grade pass
 * instead of as two full-resolution blends (false = Round 4's chain).
 * `csmFarCadence`: cascades >= 1 render every Nth frame, staggered (1 = every
 * frame); cascade 0 always renders. `maxAnisotropy`: cap on the anisotropic
 * filtering of COLOUR (sRGB) textures; `maxAnisotropyData`: the cap on DATA
 * textures (normal maps, roughness / AO packs: everything not sRGB);
 * undefined = the colour cap; null = the GPU's maximum, i.e. as authored.
 */
export const QUALITY_TIERS = {
  low: {
    dprCap: 1.0, msaa: 0, gtao: false, gtaoScale: 0.25, smaa: true, smaaHalfFloat: false, csmMapCaps: [1024],
    postFold: true, csmFarCadence: 2, maxAnisotropy: 1, maxAnisotropyData: 1,
    bloom: true, sizeCullPx: 11,
    shadowCullDistance: 70, shadowCasterBudget: 60, shadowType: THREE.PCFShadowMap, drs: true, drsFloor: 0.55,
  },
  medium: {
    dprCap: 1.25, msaa: 0, gtao: false, gtaoScale: 0.25, smaa: true, smaaHalfFloat: false, csmMapCaps: [2048, 1024],
    postFold: true, csmFarCadence: 2, maxAnisotropy: 1, maxAnisotropyData: 4,
    bloom: true, sizeCullPx: 9,
    shadowCullDistance: 95, shadowCasterBudget: 95, shadowType: THREE.PCFShadowMap, drs: true, drsFloor: 0.65,
  },
  /** THE SHIPPED DEFAULT (W0b decision, A-gpu-tier / A-rt-ledger). */
  high: {
    dprCap: 1.25, msaa: 0, gtao: true, gtaoScale: 0.25, smaa: true, smaaHalfFloat: false, csmMapCaps: [2048, 1024],
    postFold: true, csmFarCadence: 2, maxAnisotropy: 1, maxAnisotropyData: 4,
    bloom: true, sizeCullPx: 7,
    shadowCullDistance: 120, shadowCasterBudget: 150, shadowType: THREE.PCFSoftShadowMap, drs: true, drsFloor: 0.7,
  },
  ultra: {
    dprCap: 2.0, msaa: 4, gtao: true, gtaoScale: 1.0, smaa: true, smaaHalfFloat: true, csmMapCaps: null,
    postFold: true, csmFarCadence: 1, maxAnisotropy: null, maxAnisotropyData: null,
    bloom: true, sizeCullPx: 4,
    shadowCullDistance: 190, shadowCasterBudget: 260, shadowType: THREE.PCFSoftShadowMap, drs: false, drsFloor: 0.85,
  },
};

/** The tier a fresh install boots into (main.js: `?q=` or this). */
export const DEFAULT_TIER = 'high';

/**
 * Round 4's `high` row, kept for the before/after measurement of the W0b
 * decision (A-gpu-tier applies it through engine.applyTier on the same frame).
 * Not a selectable tier.
 */
export const ROUND4_HIGH = Object.freeze({
  dprCap: 1.5, msaa: 4, gtao: true, gtaoScale: 0.5, smaa: true, smaaHalfFloat: true, csmMapCaps: null,
  postFold: false, csmFarCadence: 1, maxAnisotropy: null, maxAnisotropyData: null,
  bloom: true, sizeCullPx: 7,
  shadowCullDistance: 120, shadowCasterBudget: 150, shadowType: THREE.PCFSoftShadowMap, drs: true, drsFloor: 0.7,
});

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
    // W0b fix round 1 (A-gpu-tier): GTAO's multiply and bloom's additive
    // composite folded into this pass (engine._postFold). 0 = not this frame.
    tAO: { value: null },
    uAOMix: { value: 0 },
    tBloom: { value: null },
    uBloomOn: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tAO;
    uniform sampler2D tBloom;
    uniform float uAOMix, uBloomOn;
    uniform float uContrast, uSaturation, uVignette, uVigInner, uVigOuter, uAspect, uGradeMix;
    uniform vec3 uLift, uShadowTint, uHighlightTint;
    varying vec2 vUv;

    // NOTE: three injects <colorspace_pars_fragment> into every ShaderMaterial
    // fragment prefix already, so sRGBTransferOETF() is in scope — including it
    // here a second time is a redefinition error.
    #include <tonemapping_pars_fragment>

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      // the two in-place blends that used to run as full-resolution passes
      // before this one, same arithmetic, same order: GTAO's multiply
      // (GTAOBlendShader + DstColor x Zero) then bloom's additive composite
      // (CopyShader + SrcAlpha x One). Uniform branches: coherent, no recompile.
      if (uAOMix > 0.0) {
        vec4 ao = texture2D(tAO, vUv);
        src.rgb *= mix(vec3(1.0), ao.rgb, uAOMix);
        src.a *= ao.a;
      }
      if (uBloomOn > 0.0) {
        vec4 bl = texture2D(tBloom, vUv);
        src.rgb += bl.rgb * bl.a;
        src.a += bl.a * bl.a;
      }

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
 * GTAO view-distance fade, metres (core-platform-gtao, gate A109). Ambient
 * occlusion here is a contact-scale term (0.55 m world radius). Past ~120 m that
 * radius is one or two AO texels and a 24-bit depth step on this 0.1 / 2400 m
 * camera is 7 cm at 350 m and 0.6 m at 1 km, so the horizon search is reading
 * depth quantisation, not rock: measured on the eye-height camp view, shipped
 * occlusion ROSE with distance (0.07 at 30-100 m, 0.118 at 150-250 m) where a
 * real contact term can only fall. It is faded out, 60 -> 120 m, and the pass
 * skips its kernel entirely past the far edge.
 */
const GTAO_FADE_START = 60;
const GTAO_FADE_END = 120;

/**
 * THE LATTICE (core-platform-gtao, gates V33b / A108). three r169's GTAOShader
 * reads the centre depth with `getDepth(vUv)` — NEAREST on the full-res depth
 * texture — and rebuilds the centre position at `vUv`. The AO pass runs at HALF
 * resolution (`tier.gtaoScale`), so every AO texel centre maps to
 * `uv * depthSize = 2i + 1`: exactly on the boundary between depth texels 2i and
 * 2i+1. Which one it gets is decided by float rounding in the interpolated uv,
 * which flips in irregular RUNS of whole columns and rows (measured parity map
 * at the V33 camera: runs of 1-45 AO texels, e.g. "E8 O5 E8 O5 E8 O4 E2 O11").
 * On one side of each flip the depth belongs to the texel half a texel away from
 * the position it is assigned to, so on a receding wall the centre sits "in" the
 * surface and the whole kernel reads it as occluded: mean AO in the V33 massif
 * band 0.765 in odd-parity rows against 0.983 in even ones. Runs of columns x
 * runs of rows = the screen-locked plaid on every distant vista.
 *
 * Fix: fetch ONE deterministic texel and rebuild the centre position and
 * normal at THAT texel's centre, so depth and position always describe the
 * same point. Measured at tier high, DPR 1 / 1.5, V33 camera: the far-massif
 * autocorrelation peak 0.19-0.38 drops to the GTAO-off control's 0.05-0.10.
 * Replacing the noise texture (candidate a) or only the normal (candidate d)
 * left the lattice untouched.
 *
 * WHICH texel (Round 5 W0b, quarter-resolution GTAO). Round 4 took
 * `floor(uv * depthSize - 0.25 * k)` with k = depth px per AO px: k*i + 0.25
 * at k = 1 and k*i + 0.5 at k = 2, both mid-texel. At k = 4 (the W0b tier)
 * that is k*i + 1.0, exactly on a texel boundary, so float rounding picks
 * 4i or 4i + 1 in runs of columns. Because the position is rebuilt at
 * whichever texel is fetched, that is a one-depth-texel jitter of the sample
 * point, NOT the Round-4 depth/position mismatch: A108 on the Pans POC reads
 * the same with Round 4's formula as with this one (W0b negative control,
 * docs/ROUND5-ENGINE.md §3.5). The texel is now picked from the AO texel's own
 * index i = floor(uv * resolution), floor((i + 0.125) * k): the SAME texel as
 * Round 4 at k = 1 and 2 (i, 2i) and mid-texel at k = 4 (4i + 0.5), so which
 * texel is sampled no longer depends on float rounding at the shipped tier.
 *
 * Returns false (and leaves the stock shader) if three's source moved under an
 * anchor; `engine.gtaoPatched` carries the answer and A108 asserts it.
 */
function patchGtaoShader(material) {
  let fs = material.fragmentShader;
  const edits = [
    [/uniform float scale;/,
      'uniform float scale;\n\t\tuniform float aoFadeStart;\n\t\tuniform float aoFadeEnd;'],
    [/float depth = getDepth\(vUv\.xy\);/,
      'vec2 depthSize = vec2(textureSize(tDepth, 0));\n'
      + '\t\t\tvec2 aoTexel = floor(vUv * resolution);\n'
      + '\t\t\tivec2 centerTexel = ivec2(floor((aoTexel + 0.125) * depthSize / resolution));\n'
      + '\t\t\tvec2 centerUv = (vec2(centerTexel) + 0.5) / depthSize;\n'
      + '\t\t\tfloat depth = texelFetch(tDepth, centerTexel, 0).DEPTH_SWIZZLING;'],
    [/vec3 viewPos = getViewPosition\(vUv, depth\);\s*vec3 viewNormal = getViewNormal\(vUv\);/,
      'vec3 viewPos = getViewPosition(centerUv, depth);\n'
      + '\t\t\tfloat viewDist = -viewPos.z;\n'
      + '\t\t\tif (viewDist >= aoFadeEnd) {\n'
      + '\t\t\t\tfloat ao = 1.0;\n'
      + '\t\t\t\tgl_FragColor = FRAGMENT_OUTPUT;\n'
      + '\t\t\t\treturn;\n'
      + '\t\t\t}\n'
      + '\t\t\tvec3 viewNormal = getViewNormal(centerUv);'],
    [/ao = pow\(ao, scale\);/,
      'ao = mix(ao, 1.0, smoothstep(aoFadeStart, aoFadeEnd, viewDist));\n\t\t\tao = pow(ao, scale);'],
  ];
  for (const [re, to] of edits) {
    if (!re.test(fs)) return false;
    fs = fs.replace(re, to);
  }
  material.fragmentShader = fs;
  material.uniforms.aoFadeStart = { value: GTAO_FADE_START };
  material.uniforms.aoFadeEnd = { value: GTAO_FADE_END };
  material.needsUpdate = true;
  return true;
}

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
    // DIRECT (W0b fix round 1, no MSAA): the scene target IS the composer's
    // read buffer — there is no multisample buffer to resolve, so the copy
    // into the ping-pong pair was a full-resolution HalfFloat pass for nothing.
    if (readBuffer === target && !this.renderToScreen) return;
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

/*
 * Scratch for Engine._csmUpdate (the per-cascade, allocation-free CSM.update).
 * three r169's CSM.update() runs every frame and builds `new Vector3()` for its
 * lookAt origin each call; these are the same objects CSM.js keeps at module
 * scope, plus that origin.
 */
const _csmOrigin = new THREE.Vector3();
const _csmUp = new THREE.Vector3(0, 1, 0);
const _csmCenter = new THREE.Vector3();
const _csmBox = new THREE.Box3();
const _csmCamToLight = new THREE.Matrix4();
const _csmLightOri = new THREE.Matrix4();
const _csmLightOriInv = new THREE.Matrix4();
const _csmLightFrustum = new CSMFrustum();

/** Bytes per texel of a texture as the GPU stores it (render-target ledger). */
function _texelBytes(t) {
  if (!t) return 0;
  const T = THREE;
  if (t.format === T.DepthFormat) return t.type === T.UnsignedShortType ? 2 : 4;
  if (t.format === T.DepthStencilFormat) return t.type === T.FloatType ? 8 : 4;
  if (t.type === T.UnsignedShort4444Type || t.type === T.UnsignedShort5551Type) return 2;
  if (t.type === T.UnsignedInt248Type || t.type === T.UnsignedInt5999Type) return 4;
  const ch = t.format === T.RedFormat || t.format === T.RedIntegerFormat || t.format === T.AlphaFormat ? 1
    : t.format === T.RGFormat || t.format === T.RGIntegerFormat ? 2 : 4;   // RGB is padded to 4
  const by = t.type === T.HalfFloatType || t.type === T.ShortType || t.type === T.UnsignedShortType ? 2
    : t.type === T.FloatType || t.type === T.IntType || t.type === T.UnsignedIntType ? 4 : 1;
  return ch * by;
}

/** A mipmapped texture holds 4/3 of its base level. */
function _mipFactor(t) {
  return t && t.generateMipmaps && t.minFilter !== THREE.NearestFilter && t.minFilter !== THREE.LinearFilter ? 4 / 3 : 1;
}

/**
 * PMREM outputs (render-target ledger). PMREMGenerator.fromScene() returns a
 * cubeUV render target that carries a DEPTH renderbuffer (three r169 sets
 * `depthBuffer = true` on it before rendering the cube faces). A caller that
 * keeps only `.texture` (environment.js does, for scene.environment) leaves the
 * ledger no target to read that depth from, and the 768x1024 DEPTH_COMPONENT24
 * (3,145,728 B) went uncounted. Every PMREM output is remembered here by its
 * texture; the target only through a WeakRef, so this never keeps it alive.
 * Runs once per PMREM call (boot), never per frame.
 */
const _pmremOut = new WeakMap();
{
  const P = THREE.PMREMGenerator.prototype;
  if (!Object.prototype.hasOwnProperty.call(P, '__ledgerWrapped')) {
    for (const k of ['fromScene', 'fromEquirectangular', 'fromCubemap']) {
      const orig = P[k];
      if (typeof orig !== 'function') continue;
      P[k] = function () {
        const rt = orig.apply(this, arguments);
        if (rt && rt.isRenderTarget && rt.texture) {
          _pmremOut.set(rt.texture, { ref: new WeakRef(rt), via: k, width: rt.width, height: rt.height,
            depthBuffer: !!rt.depthBuffer && !rt.depthTexture, stencil: !!rt.stencilBuffer });
        }
        return rt;
      };
    }
    Object.defineProperty(P, '__ledgerWrapped', { value: true });
  }
}

/**
 * MEASUREMENT MODE `?rtTally=1` ONLY (gate A-rt-ledger-census). Wraps the
 * WebGL2 prototype BEFORE the renderer creates its context, so every GL
 * allocation of the page is recorded from the first call: texture levels
 * (texImage*, texStorage*, compressed*, copyTexImage2D, generateMipmap),
 * renderbuffer storage (incl. multisample), framebuffer attachments, explicit
 * deletes. Raw call parameters only (internal format, size, samples, levels):
 * the census does its own byte arithmetic from GL enums, independent of the
 * ledger's, and attributes every live attachment to a ledger row, so a target
 * the ledger omits cannot pass. While installed it holds every GL object that
 * was not explicitly deleted (an object dropped without dispose() stays
 * counted: the conservative reading). Never installed in a normal run. Its
 * per-call bookkeeping writes into slots created on the first upload of each
 * level, so steady-state frames allocate nothing here either.
 */
function _installGlTally() {
  const G = typeof window !== 'undefined' ? window.WebGL2RenderingContext : null;
  if (!G || window.__rtTally) return window.__rtTally || null;
  const P = G.prototype;
  const tally = { tex: new Set(), rb: new Set(), fb: new Set(), info: new WeakMap(), orphanCalls: 0, since: performance.now() };
  const states = new WeakMap();
  const st = (gl) => {
    let s = states.get(gl);
    if (!s) {
      const n = 32;
      s = { unit: 0, b2d: new Array(n).fill(null), bcube: new Array(n).fill(null), b3d: new Array(n).fill(null),
        b2da: new Array(n).fill(null), rb: null, draw: null, read: null };
      states.set(gl, s);
    }
    return s;
  };
  const TEX_2D = 0x0DE1, CUBE = 0x8513, CUBE_X = 0x8515, TEX_3D = 0x806F, TEX_2DA = 0x8C1A;
  const FB = 0x8D40, DRAW_FB = 0x8CA9, READ_FB = 0x8CA8;
  const texFor = (gl, target) => {
    const s = st(gl);
    if (target === TEX_2D) return s.b2d[s.unit];
    if (target === CUBE || (target >= CUBE_X && target < CUBE_X + 6)) return s.bcube[s.unit];
    if (target === TEX_3D) return s.b3d[s.unit];
    if (target === TEX_2DA) return s.b2da[s.unit];
    return null;
  };
  const slot = (info, face, level) => {
    const k = face * 32 + level;
    let v = info.lv[k];
    if (!v) { v = info.lv[k] = { face, level, ifmt: 0, fmt: 0, type: 0, w: 0, h: 0, d: 1, bytes: -1 }; }
    return v;
  };
  const level = (gl, target, lvl, ifmt, fmt, type, w, h, d, bytes) => {
    const obj = texFor(gl, target);
    const info = obj && tally.info.get(obj);
    if (!info) { tally.orphanCalls++; return; }
    const face = target >= CUBE_X && target < CUBE_X + 6 ? target - CUBE_X : 0;
    const v = slot(info, face, lvl);
    v.ifmt = ifmt; v.fmt = fmt; v.type = type; v.w = w; v.h = h; v.d = d; v.bytes = bytes;
  };
  // Wrappers take named parameters and hand them on one by one (never `arguments` itself, which
  // would materialise an object per GL call); `orig.apply(this, arguments)` is V8's no-copy path.
  const wrap = (name, after) => {
    const orig = P[name];
    if (typeof orig !== 'function') return;
    P[name] = function (a0, a1, a2, a3, a4, a5, a6, a7, a8) {
      const out = orig.apply(this, arguments);
      after(this, out, arguments.length, a0, a1, a2, a3, a4, a5, a6, a7, a8);
      return out;
    };
  };
  const srcW = (src) => (src ? src.width || src.videoWidth || src.naturalWidth || src.displayWidth || 0 : 0);
  const srcH = (src) => (src ? src.height || src.videoHeight || src.naturalHeight || src.displayHeight || 0 : 0);
  const sizeOf = (v) => (typeof v === 'number' ? v : (v && v.byteLength) || 0);
  wrap('createTexture', (gl, obj) => {
    if (!obj) return;
    const info = { kind: 'tex', obj, lv: [], deleted: false };
    tally.info.set(obj, info); tally.tex.add(info);
  });
  wrap('deleteTexture', (gl, out, n, obj) => {
    const info = obj && tally.info.get(obj);
    if (info) { info.deleted = true; tally.tex.delete(info); }
  });
  wrap('activeTexture', (gl, out, n, unit) => { st(gl).unit = unit - 0x84C0; });
  wrap('bindTexture', (gl, out, n, t, obj) => {
    const s = st(gl);
    if (t === TEX_2D) s.b2d[s.unit] = obj; else if (t === CUBE) s.bcube[s.unit] = obj;
    else if (t === TEX_3D) s.b3d[s.unit] = obj; else if (t === TEX_2DA) s.b2da[s.unit] = obj;
  });
  // texImage2D(target, level, ifmt, w, h, border, format, type, ...) or (target, level, ifmt, format, type, source)
  wrap('texImage2D', (gl, out, n, t, l, ifmt, a3, a4, a5, a6, a7) => {
    if (n >= 8) level(gl, t, l, ifmt, a6, a7, a3, a4, 1, -1);
    else level(gl, t, l, ifmt, a3, a4, srcW(a5), srcH(a5), 1, -1);
  });
  wrap('texImage3D', (gl, out, n, t, l, ifmt, w, h, d, border, fmt, type) => level(gl, t, l, ifmt, fmt, type, w, h, d, -1));
  wrap('copyTexImage2D', (gl, out, n, t, l, ifmt, x, y, w, h) => level(gl, t, l, ifmt, 0, 0, w, h, 1, -1));
  wrap('compressedTexImage2D', (gl, out, n, t, l, ifmt, w, h, border, data) => level(gl, t, l, ifmt, 0, 0, w, h, 1, sizeOf(data)));
  wrap('compressedTexImage3D', (gl, out, n, t, l, ifmt, w, h, d, border, data) => level(gl, t, l, ifmt, 0, 0, w, h, d, sizeOf(data)));
  wrap('texStorage2D', (gl, out, n, target, levels, ifmt, w, h) => {
    for (let f = 0; f < (target === CUBE ? 6 : 1); f++) {
      for (let l = 0; l < levels; l++) {
        level(gl, target === CUBE ? CUBE_X + f : target, l, ifmt, 0, 0, Math.max(1, w >> l), Math.max(1, h >> l), 1, -1);
      }
    }
  });
  wrap('texStorage3D', (gl, out, n, target, levels, ifmt, w, h, d) => {
    for (let l = 0; l < levels; l++) {
      level(gl, target, l, ifmt, 0, 0, Math.max(1, w >> l), Math.max(1, h >> l), target === TEX_3D ? Math.max(1, d >> l) : d, -1);
    }
  });
  wrap('generateMipmap', (gl, out, n, target) => {
    const obj = texFor(gl, target);
    const info = obj && tally.info.get(obj);
    if (!info) { tally.orphanCalls++; return; }
    for (let f = 0; f < (target === CUBE ? 6 : 1); f++) {
      const base = info.lv[f * 32];
      if (!base) continue;
      for (let l = 1, w = base.w, h = base.h, d = base.d; (w > 1 || h > 1 || (target === TEX_3D && d > 1)) && l < 32; l++) {
        w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); if (target === TEX_3D) d = Math.max(1, d >> 1);
        const v = slot(info, f, l);
        v.ifmt = base.ifmt; v.fmt = base.fmt; v.type = base.type; v.w = w; v.h = h; v.d = d; v.bytes = -1;
      }
    }
  });
  wrap('createRenderbuffer', (gl, obj) => {
    if (!obj) return;
    const info = { kind: 'rb', obj, ifmt: 0, w: 0, h: 0, samples: 0, deleted: false };
    tally.info.set(obj, info); tally.rb.add(info);
  });
  wrap('deleteRenderbuffer', (gl, out, n, obj) => {
    const info = obj && tally.info.get(obj);
    if (info) { info.deleted = true; tally.rb.delete(info); }
  });
  wrap('bindRenderbuffer', (gl, out, n, t, obj) => { st(gl).rb = obj; });
  const storage = (gl, samples, ifmt, w, h) => {
    const obj = st(gl).rb, info = obj && tally.info.get(obj);
    if (!info) { tally.orphanCalls++; return; }
    info.samples = samples; info.ifmt = ifmt; info.w = w; info.h = h;
  };
  wrap('renderbufferStorage', (gl, out, n, t, ifmt, w, h) => storage(gl, 0, ifmt, w, h));
  wrap('renderbufferStorageMultisample', (gl, out, n, t, samples, ifmt, w, h) => storage(gl, samples, ifmt, w, h));
  wrap('createFramebuffer', (gl, obj) => {
    if (!obj) return;
    const info = { kind: 'fb', obj, att: {}, deleted: false };
    tally.info.set(obj, info); tally.fb.add(info);
  });
  wrap('deleteFramebuffer', (gl, out, n, obj) => {
    const info = obj && tally.info.get(obj);
    if (info) { info.deleted = true; tally.fb.delete(info); }
  });
  wrap('bindFramebuffer', (gl, out, n, t, fb) => {
    const s = st(gl);
    if (t === FB) { s.draw = fb; s.read = fb; } else if (t === DRAW_FB) s.draw = fb; else if (t === READ_FB) s.read = fb;
  });
  const attach = (gl, target, attachment, obj) => {
    const s = st(gl), fb = target === READ_FB ? s.read : s.draw, info = fb && tally.info.get(fb);
    if (!info) { if (fb) tally.orphanCalls++; return; }
    info.att[attachment] = obj ? tally.info.get(obj) || null : null;
  };
  wrap('framebufferTexture2D', (gl, out, n, t, attachment, textarget, tex) => attach(gl, t, attachment, tex));
  wrap('framebufferTextureLayer', (gl, out, n, t, attachment, tex) => attach(gl, t, attachment, tex));
  wrap('framebufferRenderbuffer', (gl, out, n, t, attachment, rbt, rb) => attach(gl, t, attachment, rb));
  window.__rtTally = tally;
  return tally;
}

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
    this.quality = QUALITY_TIERS[opts.quality] ? opts.quality : DEFAULT_TIER;
    // a per-engine copy: a gate or a probe that moves one lever on `engine.tier` never edits the table
    const tier = { ...QUALITY_TIERS[this.quality] };
    this.tier = tier;
    /** Screenshots/gates must be bit-deterministic: no dynamic resolution there. */
    this.drsEnabled = tier.drs && opts.dynamicResolution !== false;

    // measurement mode only (gate A-rt-ledger-census): GL allocation tally from the context's first call
    this.glTally = typeof location !== 'undefined' && /[?&]rtTally=1(&|$)/.test(location.search) ? _installGlTally() : null;

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
    this._applyAnisotropyCap();

    // ---- CSM plumbing (world-01 / perf-tech-03) ----
    this.csm = null;
    this._csmFrame = 0;
    /** per-cascade shadow-map sizes in force (tier csmMapCaps applied), or null without CSM */
    this.csmMapSizes = null;
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
    sceneRT.texture.name = 'CAL.sceneTarget';
    this.sceneTarget = sceneRT;

    this.composer = new EffectComposer(this.renderer, sceneRT);
    // the custom-target branch of the composer ctor leaves _width in device px;
    // re-declare the CSS size so addPass()/setSize() size passes correctly.
    this.composer._pixelRatio = this.basePixelRatio;
    this.composer._width = window.innerWidth;
    this.composer._height = window.innerHeight;

    this.composer.renderTarget2.depthTexture?.dispose();
    this.composer.renderTarget2.dispose();
    this.composer.renderTarget2 = this._makePostTarget(w, h, 'CAL.postA');
    this.postTarget = this._makePostTarget(w, h, 'CAL.postB');

    this.scenePass = new ScenePass(this.scene, this.camera, this);
    this.composer.addPass(this.scenePass);

    // GTAO (world-03) — half-res cone tracing off the shared depth, denoised,
    // blended multiplicatively in HDR before bloom.
    this.gtao = new GTAOPass(this.scene, this.camera, w, h);
    this._attachGtaoDepth();
    // depth-consistent centre sample + view-distance fade (see patchGtaoShader)
    this.gtaoPatched = patchGtaoShader(this.gtao.gtaoMaterial);
    if (!this.gtaoPatched) console.warn('[CAL] GTAO shader patch anchors missing — stock GTAO (screen-locked lattice on distant terrain)');
    this.gtao.blendIntensity = 0.9;
    this.gtao.updateGtaoMaterial({
      radius: 0.55, distanceExponent: 1.6, thickness: 0.7,
      scale: 1.0, samples: 9, distanceFallOff: 1.0, screenSpaceRadius: false,
    });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 4 });
    this.gtao.enabled = this.tier.gtao;
    this._gtaoInPlace();
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
    this._bloomFold();
    this.composer.addPass(this.bloom);

    // tonemap + sRGB + grade + vignette, one pass (see OutputGradeShader)
    this.grade = new OutputGradePass(OutputGradeShader);
    this.grade.uniforms.uAspect.value = window.innerWidth / Math.max(1, window.innerHeight);
    this.composer.addPass(this.grade);

    this.smaa = new SMAAPass(w, h);
    this.smaa.enabled = this.tier.smaa;
    this._applySmaaType();
    this.composer.addPass(this.smaa);

    // The composer's swap never hands the scene target out as a WRITE buffer:
    // in the direct topology it is the read buffer the chain starts from, and
    // it carries the depth texture GTAO and the studio pass sample. After the
    // first swapping pass the pair is renderTarget2 <-> postTarget, as before.
    const composer = this.composer;
    composer.swapBuffers = () => {
      const tmp = composer.readBuffer;
      composer.readBuffer = composer.writeBuffer;
      composer.writeBuffer = tmp === this.sceneTarget ? this.postTarget : tmp;
    };
    this._applyPostTopology();
  }

  /**
   * POST TOPOLOGY (W0b fix round 1, A-gpu-tier). With no MSAA the scene
   * target is the composer's read buffer (no resolve copy) and renderTarget2
   * only ever receives the grade's output — tonemapped, sRGB-encoded, clamped
   * to [0, 1] — so it is stored RGBA8 (the format SMAA's reference reads)
   * instead of HalfFloat, and postTarget is released until a pass after the
   * grade (the studio pass) needs a write target. With MSAA, Round 4's
   * topology: resolve copy into a HalfFloat renderTarget2. Returns whether
   * the direct topology is in force.
   */
  _applyPostTopology() {
    const direct = this.sceneTarget.samples === 0;
    const rt2 = this.composer.renderTarget2;
    const want = direct ? THREE.UnsignedByteType : THREE.HalfFloatType;
    if (rt2.texture.type !== want) { rt2.texture.type = want; rt2.dispose(); }
    if (direct && this.postTarget) this.postTarget.dispose();
    this.postDirect = direct;
    return direct;
  }

  /**
   * Whether GTAO's multiply and bloom's composite are folded into the grade
   * pass this frame: the tier asks for it (`postFold`), the grade runs, and
   * neither pass is the one drawing to the screen. Otherwise both blend in
   * place exactly as in Round 4.
   */
  _postFold() {
    return this.postFoldReady === true && this.tier.postFold !== false && this.grade.enabled === true;
  }

  /**
   * Bloom without its full-resolution additive composite when the grade
   * folds it (`_postFold`): three r169's UnrealBloomPass.render up to and
   * including the mip composite, then the composite texture is handed to the
   * grade instead of being blended over the read buffer. The bright pass also
   * applies GTAO's multiply when GTAO is folded (it used to read the frame
   * after GTAO's in-place blend). Otherwise three's own render.
   */
  _bloomFold() {
    const b = this.bloom, engine = this;
    const stock = UnrealBloomPass.prototype.render;
    const hp = b.materialHighPassFilter;
    const A1 = 'uniform sampler2D tDiffuse;', A2 = 'vec4 texel = texture2D( tDiffuse, vUv );';
    // three moved an anchor: no folding at all (both passes blend in place, Round 4's chain)
    this.postFoldReady = hp.fragmentShader.includes(A1) && hp.fragmentShader.includes(A2);
    if (!this.postFoldReady) { console.warn('[CAL] bloom high-pass anchors missing: post fold off'); return false; }
    hp.uniforms.tAO = { value: null };
    hp.uniforms.uAOMix = { value: 0 };
    hp.fragmentShader = hp.fragmentShader
      .replace(A1, A1 + '\n\t\tuniform sampler2D tAO;\n\t\tuniform float uAOMix;')
      .replace(A2, A2 + '\n\t\t\tif (uAOMix > 0.0) { vec4 ao = texture2D(tAO, vUv); texel.rgb *= mix(vec3(1.0), ao.rgb, uAOMix); texel.a *= ao.a; }');
    hp.needsUpdate = true;
    b.render = function (renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
      const gu = engine.grade.uniforms;
      const fold = !this.renderToScreen && engine._postFold();
      if (this.highPassUniforms.uAOMix) {
        this.highPassUniforms.uAOMix.value = fold ? gu.uAOMix.value : 0;
        this.highPassUniforms.tAO.value = fold ? gu.tAO.value : null;
      }
      if (!fold) { stock.call(this, renderer, writeBuffer, readBuffer, deltaTime, maskActive); return; }
      renderer.getClearColor(this._oldClearColor);
      this.oldClearAlpha = renderer.getClearAlpha();
      const oldAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setClearColor(this.clearColor, 0);
      if (maskActive) renderer.state.buffers.stencil.setTest(false);
      this.highPassUniforms.tDiffuse.value = readBuffer.texture;
      this.highPassUniforms.luminosityThreshold.value = this.threshold;
      this.fsQuad.material = this.materialHighPassFilter;
      renderer.setRenderTarget(this.renderTargetBright);
      renderer.clear();
      this.fsQuad.render(renderer);
      let input = this.renderTargetBright;
      for (let i = 0; i < this.nMips; i++) {
        const m = this.separableBlurMaterials[i];
        this.fsQuad.material = m;
        m.uniforms.colorTexture.value = input.texture;
        m.uniforms.direction.value = UnrealBloomPass.BlurDirectionX;
        renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
        renderer.clear();
        this.fsQuad.render(renderer);
        m.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
        m.uniforms.direction.value = UnrealBloomPass.BlurDirectionY;
        renderer.setRenderTarget(this.renderTargetsVertical[i]);
        renderer.clear();
        this.fsQuad.render(renderer);
        input = this.renderTargetsVertical[i];
      }
      this.fsQuad.material = this.compositeMaterial;
      this.compositeMaterial.uniforms.bloomStrength.value = this.strength;
      this.compositeMaterial.uniforms.bloomRadius.value = this.radius;
      this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;
      renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
      renderer.clear();
      this.fsQuad.render(renderer);
      if (maskActive) renderer.state.buffers.stencil.setTest(true);
      gu.tBloom.value = this.renderTargetsHorizontal[0].texture;
      gu.uBloomOn.value = 1;
      renderer.setClearColor(this._oldClearColor, this.oldClearAlpha);
      renderer.autoClear = oldAutoClear;
    };
    return true;
  }

  /**
   * SMAA edge + blend-weight targets: RGBA8 unless the tier asks for HalfFloat
   * (`smaaHalfFloat`). Both hold values in [0, 1] that the reference SMAA
   * stores in RGBA8; three r169 makes them HalfFloat. Changing the type of an
   * allocated target disposes it, and three re-allocates it at the new type on
   * its next bind. Returns the type in force.
   */
  _applySmaaType() {
    const type = this.tier.smaaHalfFloat === false ? THREE.UnsignedByteType : THREE.HalfFloatType;
    for (const rt of [this.smaa?.edgesRT, this.smaa?.weightsRT]) {
      if (!rt || rt.texture.type === type) continue;
      rt.texture.type = type;
      rt.dispose();
    }
    return type;
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
    // tier read at call time, not captured: setQuality('high' -> 'ultra') must
    // move the AO buffer from half to full res (it used to stay at the boot tier).
    g.setSize = (w, h) => {
      const scale = this.tier.gtaoScale;
      GTAOPass.prototype.setSize.call(g, Math.max(2, Math.round(w * scale)), Math.max(2, Math.round(h * scale)));
      g.normalRenderTarget?.setSize(1, 1);
    };
    g.setSize(g.width, g.height);
  }

  /**
   * GTAO multiplies its AO into the frame IN PLACE (W0b, A-gpu-tier). three
   * r169's GTAOPass `Default` output copies the whole read buffer into the
   * write buffer and then multiplies the AO into the copy: two full-resolution
   * HalfFloat passes, the first a plain copy. Multiply-blending the AO straight
   * into the read buffer (no swap) is the same arithmetic in one pass: the
   * blend shader samples only the denoised AO target, and the destination is
   * read by the fixed-function blend (dst * mix(1, ao, intensity); alpha
   * kept), so no texture is sampled from the target being written. Any other
   * `output` (the debug views) takes three's own render with its swap.
   *
   * FOLDED (W0b fix round 1, tier `postFold`): when the grade pass runs, even
   * that blend is skipped — the grade multiplies the denoised AO in on its way
   * past (same GTAOBlendShader arithmetic) and bloom's bright pass applies it
   * to what it extracts (engine._postFold, _bloomFold). Measured on the Pans
   * POC (X-equiv2): 0.4-1.9 % of output channels move by 1 (float instead of
   * a HalfFloat intermediate) and up to 108 channels by more (SMAA edge
   * decisions flipping on near-threshold edges).
   */
  _gtaoInPlace() {
    const g = this.gtao, engine = this;
    const stock = GTAOPass.prototype.render;
    g.render = function (renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
      if (this.output !== GTAOPass.OUTPUT.Default || this._renderGBuffer) {
        this.needsSwap = true;
        stock.call(this, renderer, writeBuffer, readBuffer, deltaTime, maskActive);
        return;
      }
      this.needsSwap = false;
      const u = this.gtaoMaterial.uniforms, cam = this.camera;
      u.cameraNear.value = cam.near;
      u.cameraFar.value = cam.far;
      u.cameraProjectionMatrix.value.copy(cam.projectionMatrix);
      u.cameraProjectionMatrixInverse.value.copy(cam.projectionMatrixInverse);
      u.cameraWorldMatrix.value.copy(cam.matrixWorld);
      this.renderPass(renderer, this.gtaoMaterial, this.gtaoRenderTarget, 0xffffff, 1.0);
      this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(cam.projectionMatrixInverse);
      this.renderPass(renderer, this.pdMaterial, this.pdRenderTarget, 0xffffff, 1.0);
      // folded (W0b fix round 1): the grade multiplies the denoised AO in on
      // its way past, and bloom's bright pass does the same (engine._postFold)
      if (!this.renderToScreen && engine._postFold()) {
        const gu = engine.grade.uniforms;
        gu.tAO.value = this.pdRenderTarget.texture;
        gu.uAOMix.value = this.blendIntensity;
        return;
      }
      this.blendMaterial.uniforms.intensity.value = this.blendIntensity;
      this.blendMaterial.uniforms.tDiffuse.value = this.pdRenderTarget.texture;
      this.renderPass(renderer, this.blendMaterial, this.renderToScreen ? null : readBuffer);
    };
    g.needsSwap = false;
  }

  /** Swap quality tier at runtime (settings screen / F3 cycling). */
  setQuality(name) {
    const tier = QUALITY_TIERS[name];
    if (!tier || name === this.quality) return this.quality;
    return this.applyTier(tier, name);
  }

  /**
   * Apply a tier ROW (any object shaped like a QUALITY_TIERS entry) at
   * runtime: every lever, render targets rebuilt in place. setQuality's body;
   * A-gpu-tier also uses it to measure ROUND4_HIGH against the shipped tier on
   * the same frame. The engine keeps its own copy of the row.
   */
  applyTier(row, name = 'custom') {
    if (!row) return this.quality;
    const tier = { ...row };
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
    this._applySmaaType();
    this._applyCsmCaps();
    this.drsEnabled = tier.drs && this.opts.dynamicResolution !== false;
    // MSAA sample count is a render-target property: rebuild in place.
    if (this.sceneTarget.samples !== tier.msaa) {
      this.sceneTarget.samples = tier.msaa;
      this.sceneTarget.dispose();
    }
    this._applyPostTopology();
    this._applyAnisotropyCap();
    this.resize();
    return this.quality;
  }

  /**
   * The tier's texture-filtering caps, split by texture ROLE (W0b fix round 2):
   * `maxAnisotropy` caps COLOUR textures (sRGB: albedo, emissive, decals) and
   * `maxAnisotropyData` caps DATA textures (everything three does not decode
   * from sRGB: normal maps, roughness / AO packs, masks); undefined = the same
   * cap as colour, null = the GPU's maximum (as authored).
   *
   * three clamps every texture's `anisotropy` to
   * `capabilities.getMaxAnisotropy()` when it uploads it (one global value), so
   * the engine answers that call with the HIGHER of the two caps and lowers the
   * other role's textures itself, right after three's upload, with one
   * `texParameterf` on the texture three already made (`_anisoRoles`, run at
   * the top of render(): an integer compare per frame, the sweep only when the
   * renderer's texture count changes). Textures already uploaded under other
   * caps are re-uploaded once when a cap changes. Returns the colour cap.
   */
  _applyAnisotropyCap() {
    const r = this.renderer, caps = r.capabilities;
    if (this._anisoHw === undefined) {
      this._anisoHw = caps.getMaxAnisotropy();
      this._anisoExt = r.extensions.has('EXT_texture_filter_anisotropic') ? r.extensions.get('EXT_texture_filter_anisotropic') : null;
      this._anisoLow = [];
      this._anisoStamp = 0;
      this._anisoTexCount = -1;
      this._anisoVisit = (o) => {
        const m = o.material;
        if (!m) return;
        if (Array.isArray(m)) { for (let i = 0; i < m.length; i++) this._anisoMat(m[i]); } else this._anisoMat(m);
      };
    }
    const hw = this._anisoHw;
    const clamp = (v) => (v ? Math.max(1, Math.min(v, hw)) : hw);
    const colour = clamp(this.tier.maxAnisotropy);
    const data = this.tier.maxAnisotropyData === undefined ? colour : clamp(this.tier.maxAnisotropyData);
    if (colour === this.anisotropyCap && data === this.anisotropyCapData) return colour;
    const first = this.anisotropyCap === undefined;
    const hi = Math.max(colour, data);
    this.anisotropyCap = colour;
    this.anisotropyCapData = data;
    caps.getMaxAnisotropy = () => hi;
    /** the role three's upload over-filters, and its cap; null = no split */
    this._anisoLowRole = colour < data ? 'colour' : data < colour ? 'data' : null;
    this._anisoLowCap = Math.min(colour, data);
    this._anisoLow.length = 0;
    this._anisoTexCount = -1;
    if (!first) {
      const props = r.properties;
      const bump = (t) => { if (t && t.isTexture && t.anisotropy > 1 && t.version > 0 && !t.isRenderTargetTexture) t.needsUpdate = true; };
      this.scene.traverse((o) => {
        if (!o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          for (const k in m) bump(m[k]);
          const u = props.has(m) ? props.get(m).uniforms : null;
          if (u) for (const k in u) bump(u[k]?.value);
        }
      });
    }
    return colour;
  }

  /**
   * Per frame, before the composer (no allocation): when a cap is split by
   * role, sweep the scene for the low role's textures whenever the renderer's
   * texture count moved (a texture was uploaded or disposed), and re-apply the
   * low cap to any tracked texture three re-uploaded since (three sets the
   * global cap on every upload).
   */
  _anisoRoles() {
    if (this._anisoLowRole === null || !this._anisoExt) return;
    const props = this.renderer.properties;
    const n = this.renderer.info.memory.textures;
    if (n !== this._anisoTexCount) {
      this._anisoTexCount = n;
      this._anisoStamp = (this._anisoStamp + 1) % 1e9;
      this._anisoLow.length = 0;
      this.scene.traverse(this._anisoVisit);
      return;
    }
    const L = this._anisoLow;
    for (let i = L.length - 1; i >= 0; i--) {
      const t = L[i];
      if (!props.has(t)) { L[i] = L[L.length - 1]; L.length--; continue; }   // disposed
      const p = props.get(t);
      if (p.__calAnisoVer !== p.__version) this._anisoSet(t, p);
    }
  }

  /** one material of the sweep: its texture slots and its program's uniforms, once per sweep */
  _anisoMat(m) {
    const props = this.renderer.properties;
    if (!props.has(m)) return;           // never rendered: its textures are not uploaded yet
    const mp = props.get(m);
    if (mp.__calAnisoStamp === this._anisoStamp) return;
    mp.__calAnisoStamp = this._anisoStamp;
    for (const k in m) this._anisoTex(m[k]);
    const u = mp.uniforms;
    if (u) for (const k in u) { const v = u[k]; if (v) this._anisoTex(v.value); }
  }

  /** a texture of the low role that three has uploaded: track it and lower its cap */
  _anisoTex(t) {
    if (!t || t.isTexture !== true || t.isRenderTargetTexture || !(t.anisotropy > 1)) return;
    if ((t.colorSpace === THREE.SRGBColorSpace) !== (this._anisoLowRole === 'colour')) return;
    const props = this.renderer.properties;
    if (!props.has(t)) return;
    const p = props.get(t);
    if (p.__webglTexture === undefined) return;
    if (p.__calAnisoStamp === this._anisoStamp) return;
    p.__calAnisoStamp = this._anisoStamp;
    this._anisoLow.push(t);
    if (p.__calAnisoVer !== p.__version || p.__calAniso !== Math.min(t.anisotropy, this._anisoLowCap)) this._anisoSet(t, p);
  }

  /**
   * TEXTURE_MAX_ANISOTROPY on the GL texture three made for `t`, under the
   * same conditions three's setTextureParameters applies it (mipmapped linear
   * minification, non-nearest magnification, filterable type), bound through
   * three's state so its binding cache stays true.
   */
  _anisoSet(t, p) {
    p.__calAnisoVer = p.__version;
    const T3 = THREE;
    if (t.magFilter === T3.NearestFilter) return;
    if (t.minFilter !== T3.NearestMipmapLinearFilter && t.minFilter !== T3.LinearMipmapLinearFilter) return;
    if (t.type === T3.FloatType && !this.renderer.extensions.has('OES_texture_float_linear')) return;
    const gl = this.renderer.getContext();
    const target = t.isCubeTexture ? gl.TEXTURE_CUBE_MAP
      : (t.isDataArrayTexture || t.isCompressedArrayTexture) ? gl.TEXTURE_2D_ARRAY
        : t.isData3DTexture ? gl.TEXTURE_3D : gl.TEXTURE_2D;
    const want = Math.min(t.anisotropy, this._anisoLowCap);
    this.renderer.state.bindTexture(target, p.__webglTexture);
    gl.texParameterf(target, this._anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, want);
    p.__calAniso = want;
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

  // ------------------------------------------------- render-target ledger

  /**
   * A lane that owns a render target outside the post chain and the lights
   * (a reflection, an impostor bake, light shafts, a map canvas) registers it
   * so the ledger names it.
   *
   * The registry holds the target WEAKLY (owner in a WeakMap, enumeration
   * through WeakRefs) and does NOT listen for 'dispose': three's
   * RenderTarget.setSize() dispatches 'dispose' on every size change, so a
   * dispose listener silently dropped every target that resizes (a 2x2
   * target sized on first use, a DPR change). A disposed target stays named
   * and reads `allocated: false` (0 bytes summed) until it is bound again at
   * its new size, unregistered, or garbage-collected — the registry never
   * keeps a target alive.
   */
  registerRenderTarget(owner, rt) {
    if (!rt || !rt.isRenderTarget) return rt;
    const owners = this._rtOwners || (this._rtOwners = new WeakMap());
    const refs = this._rtRefs || (this._rtRefs = new Set());
    // Sweep first (W0a judge): a WeakRef whose target was collected, or that
    // was unregistered, is dead weight in the Set until the ledger next runs —
    // and a lane that registers per spawn without ever reading the ledger would
    // grow it without bound. On demand only (registration), never per frame.
    for (const ref of refs) {
      const t = ref.deref();
      if (!t || !owners.has(t)) refs.delete(ref);
    }
    const had = owners.get(rt);
    if (!had) refs.add(new WeakRef(rt));
    owners.set(rt, String(owner));
    return rt;
  }

  /** Drop a registered target from the ledger (e.g. before handing it to another owner). */
  unregisterRenderTarget(rt) {
    const owners = this._rtOwners;
    if (!rt || !owners || !owners.has(rt)) return false;
    owners.delete(rt);
    for (const ref of this._rtRefs) if (ref.deref() === rt) { this._rtRefs.delete(ref); break; }
    return true;
  }

  /**
   * Measurement mode: while on, every target bound through setRenderTarget is
   * remembered, so the ledger can name targets nobody registered. Off restores
   * the renderer's own method and drops the set (no reference outlives it).
   */
  trackRenderTargets(on) {
    const r = this.renderer;
    if (on && !this._rtSeen) {
      const seen = this._rtSeen = new Set();
      const orig = this._rtOrigSet = r.setRenderTarget;
      r.setRenderTarget = function (t, a, b) { if (t) seen.add(t); return orig.call(this, t, a, b); };
    } else if (!on && this._rtSeen) {
      r.setRenderTarget = this._rtOrigSet;
      this._rtSeen = null;
      this._rtOrigSet = null;
    }
    return !!this._rtSeen;
  }

  /**
   * Every render target this frame can touch, with the GPU bytes its
   * allocation costs (gate A-rt-ledger). Sources: the post chain (the scene
   * target and the ping-pong pair, then every pass's own targets found by a
   * property scan, so a new pass is counted without editing this), every
   * light's shadow map (CSM cascades named), the PMREM target behind
   * scene.environment / scene.background (with its depth renderbuffer, also
   * after its owner dropped the target object), registered targets, and
   * targets seen while `trackRenderTargets(true)`. Each row carries its
   * `target` (null for a texture-only row) and `texture`, for the census.
   *
   * Bytes are what the allocation holds: colour texture(s) x mips x faces,
   * the multisampled colour and depth renderbuffers (x samples) of an MSAA
   * target, the depth renderbuffer or depth texture. DEPTH_COMPONENT24 counts
   * 4 bytes. `allocated` is false for a target the GPU has never seen (a pass
   * that has been off since boot); those bytes are listed but not summed.
   * The canvas drawing buffer is reported apart (`canvasBytes`): it is not a
   * three render target. 1 MB = 1e6 bytes, the unit of docs/ROUND5-PLAN §4.4.
   */
  renderTargetLedger() {
    const r = this.renderer;
    const rows = [];
    const seen = new Set();
    const add = (owner, rt) => {
      if (!rt || !rt.isRenderTarget || seen.has(rt)) return;
      seen.add(rt);
      const props = r.properties.has(rt) ? r.properties.get(rt) : null;
      const allocated = !!(props && props.__webglFramebuffer !== undefined);
      const px = rt.width * rt.height * (rt.isWebGLCubeRenderTarget ? 6 : 1) * Math.max(1, rt.depth || 1);
      // three's MSAA path (WebGLTextures.setupRenderTarget): renderbuffers x
      // samples unless the tile-memory render-to-texture extension takes it
      const rtt = r.extensions.has('WEBGL_multisampled_render_to_texture') && props?.__useRenderToTexture !== false;
      const msaa = rt.samples > 0 && !rtt ? Math.min(r.capabilities.maxSamples, rt.samples) : 0;
      let color = 0;
      for (const t of rt.textures || [rt.texture]) color += px * _texelBytes(t) * _mipFactor(t);
      // a depth renderbuffer is DEPTH_COMPONENT24 or DEPTH24_STENCIL8: 4 bytes
      const depthBpp = rt.depthTexture ? _texelBytes(rt.depthTexture) : 4;
      const parts = {
        color,
        msaaColor: msaa ? rt.width * rt.height * msaa * _texelBytes(rt.texture) : 0,
        msaaDepth: msaa && rt.depthBuffer ? rt.width * rt.height * msaa * depthBpp : 0,
        depth: rt.depthBuffer ? px * depthBpp : 0,
      };
      const bytes = parts.color + parts.msaaColor + parts.msaaDepth + parts.depth;
      rows.push({ owner, name: rt.texture?.name || '', width: rt.width, height: rt.height, samples: msaa,
        type: rt.texture?.type, format: rt.texture?.format, depth: rt.depthTexture ? 'texture' : rt.depthBuffer ? 'renderbuffer' : 'none',
        parts, bytes, mb: +(bytes / 1e6).toFixed(3), allocated, target: rt, texture: rt.texture || null });
    };
    add('post:scene', this.sceneTarget);
    add('post:pingA', this.composer.renderTarget2);
    add('post:pingB', this.postTarget);
    for (const pass of this.composer.passes) {
      const pn = pass.constructor?.name?.replace(/^_/, '') || 'Pass';
      for (const k of Object.keys(pass)) {
        const v = pass[k];
        if (v?.isRenderTarget) add(`post:${pn}.${k}`, v);
        else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) if (v[i]?.isRenderTarget) add(`post:${pn}.${k}[${i}]`, v[i]);
      }
    }
    const csmLights = this.csm?.lights || [];
    this.scene.traverse((o) => {
      if (!o.isLight || !o.shadow?.map) return;
      const ci = csmLights.indexOf(o);
      add(ci >= 0 ? `shadow:csm[${ci}]` : `shadow:${o.name || o.type}`, o.shadow.map);
    });
    // A texture a lane's REGISTERED target owns (world-sky registering its PMREM target as 'env:pmrem')
    // is counted once, on the registered row below, never again as scene.environment.
    const registeredTex = new Set();
    if (this._rtRefs) {
      for (const ref of this._rtRefs) {
        const rt = ref.deref();
        if (rt && this._rtOwners.get(rt)) for (const t of rt.textures || [rt.texture]) registeredTex.add(t);
      }
    }
    for (const k of ['environment', 'background']) {
      const t = this.scene[k];
      if (!t?.isRenderTargetTexture || seen.has(t) || registeredTex.has(t)) continue;
      seen.add(t);
      // A PMREM output: count the TARGET that produced it (colour + its depth renderbuffer: fromScene
      // renders the cube faces with depth) while that target object is alive...
      const pm = _pmremOut.get(t);
      const src = pm && pm.ref.deref();
      if (src && !seen.has(src)) { add(`env:${k}`, src); rows[rows.length - 1].pmrem = pm.via; continue; }
      // ...and after the caller dropped it (environment.js keeps only .texture; three never deletes the
      // depth renderbuffer of a target nobody disposes), the colour from the texture plus the depth
      // the target was produced with. Not a PMREM output: the texture alone.
      const w = t.image?.width || 0, h = t.image?.height || 0;
      const color = w * h * _texelBytes(t);
      const depth = pm && pm.depthBuffer ? w * h * 4 : 0;
      const bytes = color + depth;
      const props = r.properties.has(t) ? r.properties.get(t) : null;
      rows.push({ owner: `env:${k}`, name: t.name || 'PMREM', width: w, height: h, samples: 0,
        type: t.type, format: t.format, depth: depth ? 'renderbuffer (producing target dropped by its owner)' : 'none',
        parts: { color, msaaColor: 0, msaaDepth: 0, depth }, pmrem: pm ? pm.via : null,
        bytes, mb: +(bytes / 1e6).toFixed(3), allocated: !!props?.__webglTexture, target: null, texture: t });
    }
    if (this._rtRefs) {
      for (const ref of this._rtRefs) {
        const rt = ref.deref();
        const owner = rt && this._rtOwners.get(rt);
        if (!owner) { this._rtRefs.delete(ref); continue; }   // collected or unregistered
        add(owner, rt);
      }
    }
    if (this._rtSeen) for (const rt of this._rtSeen) add('unregistered', rt);
    let total = 0, provisioned = 0;
    for (const row of rows) { if (row.allocated) total += row.bytes; else provisioned += row.bytes; }
    const gl = r.getContext();
    const attrs = gl.getContextAttributes?.() || {};
    const canvasBytes = gl.drawingBufferWidth * gl.drawingBufferHeight
      * (4 + (attrs.depth ? 4 : 0) + (attrs.antialias ? 4 * 4 + (attrs.depth ? 4 * 4 : 0) : 0));
    return {
      rows, bytes: total, mb: +(total / 1e6).toFixed(2), provisionedBytes: provisioned,
      canvas: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, bytes: canvasBytes, mb: +(canvasBytes / 1e6).toFixed(2) },
      pixelRatio: +r.getPixelRatio().toFixed(3), quality: this.quality, msaa: this.sceneTarget.samples,
      gtao: !!this.gtao.enabled, gtaoScale: this.tier.gtaoScale, bloom: !!this.bloom.enabled, smaa: !!this.smaa.enabled,
      tracking: !!this._rtSeen,
    };
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
    this._applyCsmCaps();
    this.csm.updateFrustums();
    return this.csm;
  }

  /**
   * The tier's per-cascade shadow-map caps (W0b, A-rt-ledger). world-sky asks
   * enableCSM for a size (2048); cascade i gets min(that, tier.csmMapCaps[i]),
   * the last cap repeating. `csm.shadowMapSize` stays the requested size, which
   * is cascade 0's at every tier that caps only the far cascades (A56 reads the
   * near texel from it). A map whose size changes is disposed; three allocates
   * it again at the new size on the next shadow render. Returns the sizes.
   */
  _applyCsmCaps() {
    const csm = this.csm;
    if (!csm) { this.csmMapSizes = null; return null; }
    const caps = this.tier.csmMapCaps;
    const sizes = [];
    for (let i = 0; i < csm.lights.length; i++) {
      const cap = caps && caps.length ? caps[Math.min(i, caps.length - 1)] : Infinity;
      const size = Math.max(1, Math.min(csm.shadowMapSize, cap));
      const sh = csm.lights[i].shadow;
      if (sh.mapSize.x !== size || sh.mapSize.y !== size) {
        sh.mapSize.set(size, size);
        if (sh.map) { sh.map.dispose(); sh.map = null; }
      }
      sizes.push(size);
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.csmMapSizes = sizes;
    return sizes;
  }

  /**
   * CSM.update() (three r169) with two changes and nothing else: each cascade
   * snaps its light to ITS OWN texel grid (`shadow.mapSize`, which
   * _applyCsmCaps may have made smaller than `csm.shadowMapSize`; snapping a
   * 1024 map on a 2048 grid moves it by half texels and the far shadows
   * shimmer), and nothing is allocated (CSM.update builds a Vector3 per call,
   * every frame). With every cascade at csm.shadowMapSize it places the lights
   * exactly where CSM.update does.
   */
  _csmUpdate() {
    const csm = this.csm;
    if (!csm) return;
    const frustums = csm.frustums;
    // FAR-CASCADE CADENCE (tier `csmFarCadence`, W0b fix round 1): cascade 0
    // renders every frame; cascade i >= 1 renders on the frames where
    // (frame + i) % cadence === 0, so with cadence 2 the two far cascades
    // alternate and every frame renders two of the three maps. A cascade that
    // skips a frame keeps its map AND its shadow matrix from the frame it was
    // drawn (three updates both only when it renders), so receivers stay
    // registered to the map; a moving caster's far shadow trails by one frame.
    // A map that does not exist yet (just created or re-sized) renders at once.
    const cad = Math.max(1, this.tier.csmFarCadence | 0 || 1);
    this._csmFrame = (this._csmFrame + 1) % 65536 || 0;
    for (let i = 0; i < csm.lights.length; i++) {
      const sh = csm.lights[i].shadow;
      if (i === 0 || cad === 1) { sh.autoUpdate = true; continue; }
      sh.autoUpdate = false;
      if (!sh.map || (this._csmFrame + i) % cad === 0) sh.needsUpdate = true;
    }
    _csmLightOri.lookAt(_csmOrigin, csm.lightDirection, _csmUp);
    _csmLightOriInv.copy(_csmLightOri).invert();
    for (let i = 0; i < frustums.length; i++) {
      const light = csm.lights[i];
      const sc = light.shadow.camera;
      const tw = (sc.right - sc.left) / (light.shadow.mapSize.x || csm.shadowMapSize);
      const th = (sc.top - sc.bottom) / (light.shadow.mapSize.y || csm.shadowMapSize);
      _csmCamToLight.multiplyMatrices(_csmLightOriInv, csm.camera.matrixWorld);
      frustums[i].toSpace(_csmCamToLight, _csmLightFrustum);
      const nv = _csmLightFrustum.vertices.near, fv = _csmLightFrustum.vertices.far;
      _csmBox.makeEmpty();
      for (let j = 0; j < 4; j++) { _csmBox.expandByPoint(nv[j]); _csmBox.expandByPoint(fv[j]); }
      _csmBox.getCenter(_csmCenter);
      _csmCenter.z = _csmBox.max.z + csm.lightMargin;
      _csmCenter.x = Math.floor(_csmCenter.x / tw) * tw;
      _csmCenter.y = Math.floor(_csmCenter.y / th) * th;
      _csmCenter.applyMatrix4(_csmLightOri);
      light.position.copy(_csmCenter);
      light.target.position.copy(_csmCenter);
      light.target.position.x += csm.lightDirection.x;
      light.target.position.y += csm.lightDirection.y;
      light.target.position.z += csm.lightDirection.z;
    }
  }

  disableCSM() {
    if (!this.csm) return;
    for (const m of this._csmMaterials) { this.csm.teardownMaterial?.(m); m.needsUpdate = true; }
    this._csmMaterials.clear();
    this.csm.remove?.();
    this.csm.dispose?.();
    if (this.csmSourceLight) this.csmSourceLight.castShadow = this._csmLightShadowWas ?? true;
    this.csm = null;
    this.csmMapSizes = null;
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
    this.cancelWarmUp();
    try {
      // The compile is the same synchronous call `compileAsync` makes first;
      // only the readiness WAIT is ours now. `_awaitProgramsReady` says why
      // the raced `compileAsync` had to go.
      this.renderer.compile(scene, camera);
      await this._awaitProgramsReady(timeoutMs);
    } catch (err) {
      console.warn('[CAL] shader warm-up skipped:', err?.message || err);
    }
    const textures = this.warmUpTextures(scene);
    this.warmUpMs = Math.round(performance.now() - t0);
    this.warmUpPrograms = this.renderer.info.programs?.length ?? 0;
    this.warmUpTexturesUploaded = textures;
    return { ms: this.warmUpMs, programs: this.warmUpPrograms, textures };
  }

  /**
   * AN ABANDONED COMPILE POLL IS A TIMER NOBODY OWNS (`memory-attribution`).
   *
   * `compileAsync` (three.module.js:29751) calls `compile()` synchronously,
   * keeps the `Set` of EVERY material in the scene, and then polls
   * `checkMaterialsReady` on a `setTimeout(..., 10)` chain until each
   * material's `currentProgram.isReady()`. This method used to race that
   * promise against a timeout — and when the timeout won, nothing could stop
   * the poll, because three exposes no handle for it. Two consequences:
   *
   *   - the chain holds that material Set strongly for as long as it keeps
   *     rescheduling: every material in the scene, with its maps, retained
   *     behind a timer no code owns. That is exactly the shape of retention
   *     `A90b-memory-attribution` exists to find, in the one place the
   *     instrument cannot see it — a closure inside the library;
   *   - `properties.get(material)` auto-creates an empty record for a material
   *     that has since been DISPOSED, so the next tick reads `undefined` and
   *     throws `TypeError: ... reading 'isReady'` from inside a `setTimeout`,
   *     where this method's own try/catch cannot see it. That is a console
   *     error on machine despawn — an automatic FAIL for the console-error
   *     gates — and it is `machine-rig`'s open cross-lane request against this
   *     function (docs/ROUND4-MACHINE-RIG.md §9), which `rig/lod.js
   *     guardMaterialDisposal()` works around from the outside today.
   *
   * So the wait is ours. `renderer.compile()` does the same program building
   * `compileAsync` does. Readiness is then read off `renderer.info.programs`
   * (public: `info.programs = programCache.programs`, three.module.js:29038)
   * through `WebGLProgram.isReady()` (:20371) — the program cache removes an
   * entry before the program is deleted, so this can never touch a dead
   * object, it holds nothing the renderer does not already hold, and it
   * touches no material at all. The timer handle is kept so the poll can be
   * cancelled, and the next `warmUp()` cancels the previous one (main.js warms
   * up twice: at boot, and again after the variety models land).
   *
   * @param {number} timeoutMs give up waiting after this long — the same
   *   budget the race used to enforce
   * @returns {Promise<{pending:number, ms:number}>} programs still not ready
   */
  _awaitProgramsReady(timeoutMs = 20000) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        this._warmUpPoll = 0;
        const programs = this.renderer.info.programs || [];
        let pending = 0;
        for (let i = 0; i < programs.length; i++) {
          const p = programs[i];
          if (!p || typeof p.isReady !== 'function') continue;
          // a program released under us is not pending — and must not throw
          try { if (!p.isReady()) pending++; } catch (err) { /* already gone */ }
        }
        const ms = Math.round(performance.now() - t0);
        if (pending === 0 || ms >= timeoutMs) { resolve({ pending, ms }); return; }
        this._warmUpPoll = setTimeout(tick, 16);
      };
      tick();
    });
  }

  /** Stop a readiness poll that is still running. Safe to call at any time. */
  cancelWarmUp() {
    if (this._warmUpPoll) clearTimeout(this._warmUpPoll);
    this._warmUpPoll = 0;
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
    if (n === 1) console.warn(`[CAL] ${key} threw — recovered, logged once:`, err);
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
      `CAL  ${s.fps} fps   ${s.medianFrameMs}ms med  ${s.p95FrameMs}ms p95  ${s.maxFrameMs}ms max`
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
    this._csmUpdate();
    this._anisoRoles();
    // Deterministic ping-pong: ScenePass always resolves into renderTarget2 and
    // the chain alternates rt2 <-> postTarget from there. Without re-seating,
    // the composer's swap parity drifts frame to frame and the multisampled
    // scene target gets picked up as a post write target again.
    // DIRECT topology (no MSAA): the chain starts FROM the scene target and the
    // first swapping pass (the grade) writes renderTarget2 (_applyPostTopology).
    if ((this.sceneTarget.samples === 0) !== this.postDirect) this._applyPostTopology();
    if (this.postDirect) {
      this.composer.readBuffer = this.sceneTarget;
      this.composer.writeBuffer = this.composer.renderTarget2;
    } else {
      this.composer.readBuffer = this.composer.renderTarget2;
      this.composer.writeBuffer = this.postTarget;
    }
    // folded blends are re-armed by the passes that run this frame (_postFold)
    const gu = this.grade.uniforms;
    gu.uAOMix.value = 0;
    gu.uBloomOn.value = 0;
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
