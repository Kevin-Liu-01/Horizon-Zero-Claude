import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { SimplexNoise } from './terrain.js';
import { RiverWater } from './water.js';

/**
 * ROUND 4 — lane `world-light`. Sky, sun, cascaded shadows, aerial perspective,
 * day/night and weather. The single largest visual lever in the build.
 *
 * Findings closed here: world-01 (flat lighting / no cascades), world-04 (milky
 * sky, hard god-ray streak), world-05 (no aerial perspective), world-13 (no time
 * of day), world-14 (no weather), perf-tech-03 (shadow pass is half the frame).
 *
 * ---------------------------------------------------------------------------
 * PUBLISHED API (docs/SPEC.md §World / lighting). Nothing outside this file is
 * edited; every cross-lane need is served through these.
 *
 *   environment.time                 0–24 game hours (read/write)
 *   environment.setTime(h)           snap the sky to an hour
 *   environment.dayLengthSeconds     real seconds per in-game day
 *   environment.timeFrozen           stop the clock (set by `?shot=1`)
 *   environment.weatherParams        the resolved, cross-faded weather record
 *   environment.rest(opts)           campfire "rest until" hook -> Promise
 *   environment.phase                'night' | 'dawn' | 'day' | 'dusk'
 *   environment.sunDir               unit vector TOWARD the SUN (below the
 *                                    horizon at night)
 *   environment.lightDir             TOWARD whatever is lighting the world now
 *   environment.nightFactor          0 day .. 1 night
 *   environment.weather              'clear' | 'overcast' | 'rain' | 'storm'
 *   environment.setWeather(n, fade)  cross-fade to a weather state
 *   environment.wetness              0–1 surface wetness (world-ground reads it)
 *   environment.wind                 { x, z, strength, gust } (gust hook)
 *   environment.fogParams            aerial-perspective contract (world-ground)
 *   environment.uniforms             shared uniform holders, incl. `hzcWeather`
 *                                    (vec4 wetness, gust, windX, windZ) which is
 *                                    declared for every fogged material already
 *   environment.registerMaterial(m)  opt a custom material into fog + cascades
 *   environment.weatherStates        the list of state names
 *   environment.debugInfo()          one-call snapshot for gates / studio
 *
 * SHADOW POLICY owned here (perf-tech-03): `engine.shadowCullDistance` is
 * clamped to the last cascade's far plane (120 m — a caster past it cannot
 * appear in any shadow map) and `engine.shadowCasterBudget` is raised 2.2x
 * over the quality tier, because the engine divides that DRAW budget by the
 * cascade count and three then frustum-culls each caster per cascade.
 * `grass-chunk-*` and `bushes-*` are promoted to shadow casters.
 *
 * EVENTS (ctx.events): `time-phase`, `weather-changed`, `rest-start`,
 * `rest-end`, `thunder`.
 * ---------------------------------------------------------------------------
 *
 * WHY THE SHADER CHUNKS ARE PATCHED GLOBALLY (see `patchShaderChunks`): three's
 * built-in fog is a single exp2 term on view depth — it cannot express height
 * falloff or sun in-scatter, and it tints geometry with one flat colour, which
 * is exactly the "milky sky / no aerial perspective" the audit filmed. Rather
 * than fork every material in four other lanes, the fog chunks are replaced
 * once (the same technique three's own CSM uses for the lighting chunks) and
 * every scene material is handed the shared uniform objects. A material that is
 * never registered still renders correctly: `hzcFogA.x == 0` falls back to
 * stock exp2 fog.
 */

/* ========================================================================== */
/*                       time-of-day + weather data tables                    */
/* ========================================================================== */

const DEG = Math.PI / 180;
/** Sun arc. Fitted so t=17:00 reproduces the Round-3 sun to within 1°. */
const SUN_RISE = 6.0;
const SUN_SET = 19.5;
const SUN_MAX_ELEV = 50 * DEG;
const SUN_AZ_START = 75 * DEG;   // bearing at sunrise (ENE)
const SUN_AZ_SWEEP = 132 * DEG;  // total sweep to sunset (WNW)
/** The moon runs the same arc, half a day out of phase (+0.4 h so it is not
 *  perfectly anti-solar and the two are never both exactly on the horizon). */
const MOON_PHASE_OFFSET = 12.4;
/** Hours at which the celestial light hands over. Both are intensity troughs,
 *  so the 150° direction flip happens while the light is nearly off. */
const MOON_TAKES_OVER = 19.9;
const SUN_TAKES_OVER = 5.6;

/**
 * Keyframes, interpolated by hour. `sunI` is the celestial light (sun by day,
 * moon by night). The two troughs at 5.4/19.9 hide the hand-over.
 *
 * The direct/ambient split is the world-01 fix: ambient (1.9 across hemi + fill
 * + env) used to beat the sun (1.2). Daylight now runs sun ~4.5–5.1 against a
 * hemi of 0.32–0.36 and no counter-fill light at all.
 */
const KEYS = [
  { h: 0.0, sunI: 0.44, sun: '#7f93cc', hemiI: 0.23, hSky: '#2b3d5e', hGnd: '#14161b', env: 0.05,
    zen: '#04060d', mid: '#0a1020', hor: '#161d2e', fogH: '#151d30', fogZ: '#080c17', fogSun: '#4a5c8c',
    dens: 0.00106, night: 1.00 },
  { h: 4.6, sunI: 0.44, sun: '#8194ca', hemiI: 0.25, hSky: '#33456a', hGnd: '#191b21', env: 0.06,
    zen: '#060a16', mid: '#111a30', hor: '#28304a', fogH: '#232b41', fogZ: '#0b1120', fogSun: '#5b6a99',
    dens: 0.00122, night: 0.95 },
  { h: 5.4, sunI: 0.12, sun: '#9a8fb4', hemiI: 0.24, hSky: '#4a5578', hGnd: '#241f1e', env: 0.07,
    zen: '#0a1226', mid: '#26314e', hor: '#5e5364', fogH: '#4a4552', fogZ: '#141c34', fogSun: '#8a6f80',
    dens: 0.00145, night: 0.72 },
  { h: 6.6, sunI: 1.70, sun: '#ffb277', hemiI: 0.30, hSky: '#6f86ad', hGnd: '#3a3128', env: 0.10,
    zen: '#1b3060', mid: '#5c6f96', hor: '#e8a071', fogH: '#c1957c', fogZ: '#2b4370', fogSun: '#ff9a54',
    dens: 0.00176, night: 0.24 },
  { h: 8.2, sunI: 4.60, sun: '#ffdcb0', hemiI: 0.30, hSky: '#8fb2dc', hGnd: '#6a5a44', env: 0.105,
    zen: '#1b4a92', mid: '#7ea0cd', hor: '#ddcfb6', fogH: '#bfc0b7', fogZ: '#39619a', fogSun: '#ffc98a',
    dens: 0.00145, night: 0.00 },
  { h: 12.0, sunI: 5.20, sun: '#fff1dc', hemiI: 0.31, hSky: '#9cc0e8', hGnd: '#7a6a52', env: 0.115,
    zen: '#14428f', mid: '#7ba6d8', hor: '#c9d5da', fogH: '#b4c1c7', fogZ: '#31609c', fogSun: '#ffe6bd',
    dens: 0.00133, night: 0.00 },
  { h: 15.2, sunI: 5.00, sun: '#ffdfae', hemiI: 0.29, hSky: '#95b7e2', hGnd: '#75634a', env: 0.105,
    zen: '#17458d', mid: '#7ba0cf', hor: '#d9c8ab', fogH: '#bdb8aa', fogZ: '#355f96', fogSun: '#ffce90',
    dens: 0.00141, night: 0.00 },
  { h: 17.4, sunI: 4.90, sun: '#ffc98a', hemiI: 0.27, hSky: '#8aa9d6', hGnd: '#6d5236', env: 0.095,
    zen: '#173f83', mid: '#7d95bf', hor: '#eeae6c', fogH: '#cfa87f', fogZ: '#365a8d', fogSun: '#ffa54f',
    dens: 0.00160, night: 0.00 },
  { h: 19.0, sunI: 2.30, sun: '#ff9b52', hemiI: 0.26, hSky: '#7189b8', hGnd: '#4d3a2a', env: 0.085,
    zen: '#122e63', mid: '#6a7ba6', hor: '#f2894a', fogH: '#c08560', fogZ: '#2b4677', fogSun: '#ff7a30',
    dens: 0.00184, night: 0.10 },
  { h: 19.9, sunI: 0.14, sun: '#b06a58', hemiI: 0.25, hSky: '#5b688c', hGnd: '#3a2c26', env: 0.08,
    zen: '#0d2049', mid: '#485778', hor: '#a76a4e', fogH: '#8a6353', fogZ: '#1c2d55', fogSun: '#c0673c',
    dens: 0.00176, night: 0.48 },
  { h: 21.0, sunI: 0.46, sun: '#7f93cc', hemiI: 0.24, hSky: '#33456a', hGnd: '#1a1c22', env: 0.06,
    zen: '#070b18', mid: '#0f1729', hor: '#1e2639', fogH: '#1b2337', fogZ: '#0a101c', fogSun: '#54658f',
    dens: 0.00118, night: 0.92 },
  { h: 24.0, sunI: 0.44, sun: '#7f93cc', hemiI: 0.23, hSky: '#2b3d5e', hGnd: '#14161b', env: 0.05,
    zen: '#04060d', mid: '#0a1020', hor: '#161d2e', fogH: '#151d30', fogZ: '#080c17', fogSun: '#4a5c8c',
    dens: 0.00106, night: 1.00 },
];

/**
 * Weather states (world-14). Multipliers/targets applied on top of the hour
 * keyframe, cross-faded by `setWeather`.
 *   sunMul/hemiMul  direct vs ambient rebalance under cloud
 *   cloud           sky cover 0–1, cloudDark   underside darkness
 *   densMul         aerial-perspective density multiplier
 *   rain            streak density 0–1, wet    target surface wetness
 *   wind            base wind strength, gust   gust amplitude
 *   shaft           screen-space light-shaft strength multiplier
 *   desat           pull the palette toward grey
 */
const WEATHER = {
  clear: { sunMul: 1.00, hemiMul: 1.00, cloud: 0.30, cloudDark: 0.30, densMul: 1.00, rain: 0.00, wet: 0.00, wind: 0.85, gust: 0.35, shaft: 1.00, desat: 0.00, cloudShadow: 0.26, lightning: 0 },
  overcast: { sunMul: 0.26, hemiMul: 1.85, cloud: 0.94, cloudDark: 0.62, densMul: 1.85, rain: 0.00, wet: 0.10, wind: 1.20, gust: 0.55, shaft: 0.18, desat: 0.55, cloudShadow: 0.10, lightning: 0 },
  rain: { sunMul: 0.17, hemiMul: 1.90, cloud: 0.98, cloudDark: 0.72, densMul: 2.55, rain: 0.85, wet: 0.85, wind: 1.55, gust: 0.75, shaft: 0.08, desat: 0.72, cloudShadow: 0.06, lightning: 0 },
  storm: { sunMul: 0.10, hemiMul: 1.75, cloud: 1.00, cloudDark: 0.88, densMul: 3.20, rain: 1.00, wet: 1.00, wind: 2.35, gust: 1.35, shaft: 0.04, desat: 0.82, cloudShadow: 0.04, lightning: 1 },
};

/** Cascaded shadow splits as fractions of `maxFar`. Near cascade tight enough
 *  that its texel is ~1.4 cm/px at 16:9 / 55° fov (gate A56 wants ≤ 2 cm). */
const CSM_BREAKS = [0.11, 0.33, 1.0];
const CSM_MAX_FAR = 120;
const CSM_MAP_SIZE = 2048;
/** Aerial perspective: 1/H of the exponential density falloff, and the height
 *  the quoted density is measured at. */
const FOG_HEIGHT_FALLOFF = 1 / 140;
const FOG_HEIGHT_REF = 4;
/** Grass chunks within this of the player cast, at most GRASS_CAST_MAX of
 *  them; see `_shadowPolicy`. The cap is what makes the cost a CONSTANT rather
 *  than a function of where the player is standing in the chunk grid. */
const GRASS_CAST_RADIUS = 46;
const GRASS_CAST_MAX = 3;

/* ========================================================================== */
/*                          global shader chunk patches                       */
/* ========================================================================== */

let _chunksPatched = false;

/**
 * Replace three's fog chunks with a height + distance + in-scatter model, and
 * fold a cloud-shadow term into the directional-light loop.
 *
 * Every uniform introduced here is optional: with `hzcFogA.x == 0` the fog
 * falls back to stock exp2 and `hzcCloudShadow()` returns 1, so a material this
 * file never registers still renders exactly as it did before.
 *
 * Called AFTER `engine.enableCSM()` because CSM's `injectInclude()` overwrites
 * `lights_fragment_begin` / `lights_pars_begin` wholesale; we wrap whatever it
 * left behind.
 */
function patchShaderChunks() {
  const C = THREE.ShaderChunk;
  // The lighting half is re-applied on every call: three's CSM re-installs its
  // own `lights_*` chunks each time `enableCSM()` runs, which would silently
  // drop the cloud-shadow term. The content check below makes that a no-op when
  // nothing has clobbered us. The fog half only ever needs writing once.
  patchLightChunks(C);
  if (_chunksPatched) return;
  _chunksPatched = true;

  C.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  uniform mat4 hzcViewInv;
  // wetness, gust, windX, windZ — world-ground's surface + foliage contract
  uniform vec4 hzcWeather;
#endif`;

  // World position from VIEW position, not from `transformed`: sprite_vert has
  // no `transformed` in scope, and instanced/batched meshes would need the
  // instance matrix folded in by hand. `mvPosition` is the one thing every
  // shader that includes <fog_vertex> is guaranteed to have.
  C.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorldPos = ( hzcViewInv * vec4( mvPosition.xyz, 1.0 ) ).xyz;
#endif`;

  C.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  // density, 1/heightFalloff, heightRef, inscatterPow
  uniform vec4 hzcFogA;
  // inscatterStrength, groundGlow, maxOpacity, unused
  uniform vec4 hzcFogB;
  uniform vec3 hzcFogHorizon;
  uniform vec3 hzcFogZenith;
  uniform vec3 hzcFogSun;
  uniform vec3 hzcSunDir;
  uniform vec3 hzcCamPos;
  // scale (1/m), coverage, strength, softness
  uniform vec4 hzcCloudA;
  uniform vec2 hzcCloudDrift;
  // wetness, gust, windX, windZ — world-ground's surface + foliage contract
  uniform vec4 hzcWeather;

  float hzcHash21( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
  float hzcNoise2( vec2 p ) {
    vec2 i = floor( p ), f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hzcHash21( i ), hzcHash21( i + vec2( 1.0, 0.0 ) ), f.x ),
                mix( hzcHash21( i + vec2( 0.0, 1.0 ) ), hzcHash21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
  }
  float hzcCloudShadow() {
    if ( hzcCloudA.z <= 0.001 ) return 1.0;
    vec2 uv = vFogWorldPos.xz * hzcCloudA.x + hzcCloudDrift;
    float n = hzcNoise2( uv ) * 0.64 + hzcNoise2( uv * 2.17 + 13.7 ) * 0.36;
    float m = smoothstep( hzcCloudA.y, hzcCloudA.y + hzcCloudA.w, n );
    return 1.0 - m * hzcCloudA.z;
  }
#endif`;

  C.fog_fragment = /* glsl */`
#ifdef USE_FOG
  if ( hzcFogA.x > 0.0 ) {
    // Analytic height fog: density falls off as exp( -(y - ref) / H ), so the
    // integral along the ray has a closed form. Both endpoints matter, which is
    // what makes a ridge top read thinner than a valley floor at the same range.
    float hzcK = hzcFogA.y;
    float hzcDy = vFogWorldPos.y - hzcCamPos.y;
    float hzcBase = exp( - ( hzcCamPos.y - hzcFogA.z ) * hzcK );
    float hzcE = hzcDy * hzcK;
    float hzcAvg = abs( hzcE ) < 0.002 ? hzcBase : hzcBase * ( 1.0 - exp( - hzcE ) ) / hzcE;
    float hzcTau = hzcFogA.x * vFogDepth * clamp( hzcAvg, 0.0, 12.0 );
    float hzcTrans = clamp( exp( - hzcTau ), 1.0 - hzcFogB.z, 1.0 );

    vec3 hzcDv = vFogWorldPos - hzcCamPos;
    vec3 hzcVd = hzcDv / max( length( hzcDv ), 1e-3 );
    float hzcUp = clamp( hzcVd.y * 1.55 + 0.10, 0.0, 1.0 );
    vec3 hzcSky = mix( hzcFogHorizon, hzcFogZenith, hzcUp * hzcUp );
    float hzcSd = max( dot( hzcVd, hzcSunDir ), 0.0 );
    // Forward in-scatter: the haze lights up toward the sun and warms the
    // ridges that face it. Squared so it stays a glow, not a second sun.
    // No (1 - trans) factor here: the mix() below already scales the whole
    // in-scatter term by it, and double-counting made the fogged pixel leave
    // the straight line between "no fog" and "full fog" that A57 measures.
    hzcSky += hzcFogSun * pow( hzcSd, hzcFogA.w ) * hzcFogB.x;
    hzcSky += hzcFogSun * hzcSd * hzcSd * hzcFogB.y;
    gl_FragColor.rgb = mix( hzcSky, gl_FragColor.rgb, hzcTrans );
  } else {
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  }
#endif`;

}

/**
 * Cloud shadows folded into the directional-light loop (world-04).
 * `lights_fragment_begin` at this point is whatever CSM installed; every branch
 * of it funnels through getDirectionalLightInfo(), so one textual insertion
 * covers the cascade, the fade and the no-shadow path alike.
 */
let cloudShadowSites = 0;
function patchLightChunks(C) {
  const lf = C.lights_fragment_begin;
  if (lf.indexOf('hzcCloudShadow') < 0) {
    let n = 0;
    C.lights_fragment_begin = lf.replace(
      /getDirectionalLightInfo\(\s*(directionalLight|directionalLights\[\s*0\s*\])\s*,\s*directLight\s*\);/g,
      (m) => { n++; return `${m}\n\t\t\tdirectLight.color *= hzcCloudShadow();`; },
    );
    cloudShadowSites = n;
  }
  if (C.lights_pars_begin.indexOf('hzcCloudShadow') < 0) {
    // Lit materials with fog:false never see the fog chunk, so they need the
    // stub. USE_FOG is a compile define, so this is order-independent.
    C.lights_pars_begin = /* glsl */`
#ifndef USE_FOG
  float hzcCloudShadow() { return 1.0; }
#endif
` + C.lights_pars_begin;
  }
}

/* ========================================================================== */

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _shaftSize = new THREE.Vector2();
const _c0 = new THREE.Color();
const _c1 = new THREE.Color();

/** Wrap an hour into [0, 24). */
const wrap24 = (h) => ((h % 24) + 24) % 24;

export class Environment {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, engine } = ctx;

    /* ----------------------------- clock ------------------------------- */
    const qs = ctx.params;
    const t0 = parseFloat(qs?.get?.('time'));
    /** 0–24 game hours. Default 17:00 — HZD late afternoon. */
    this._time = Number.isFinite(t0) ? wrap24(t0) : 17.0;
    /** Real seconds for a full 24 h cycle. Advances on SIM dt, so the studio's
     *  timeScale freeze freezes the sky too. */
    this.dayLengthSeconds = 1800;
    /** `?shot=1` freezes the clock so every gate frame is deterministic. */
    this.timeFrozen = !!qs?.has?.('shot');
    this._phase = '';
    this._rest = null;

    /* ---------------------------- weather ------------------------------ */
    this.weather = 'clear';
    this._wFrom = { ...WEATHER.clear };
    this._wTo = { ...WEATHER.clear };
    this._wK = 1;
    this._wRate = 1;
    this.w = { ...WEATHER.clear };   // resolved, per frame
    this.wetness = 0;
    this.wind = { x: 0.82, z: 0.57, strength: 0.85, gust: 0 };
    this._gustPhase = 0;
    this._lightning = { t: 0, k: 0, next: 4 };

    /* ------------------ shared uniform holders (see patch) -------------- */
    // ONE object per uniform, plugged into every registered material's shader.
    // Updating `.value` here updates every material at once — no per-material
    // bookkeeping, no per-frame allocation.
    this.u = {
      hzcViewInv: { value: new THREE.Matrix4() },
      hzcFogA: { value: new THREE.Vector4(0.00157, FOG_HEIGHT_FALLOFF, FOG_HEIGHT_REF, 7.0) },
      hzcFogB: { value: new THREE.Vector4(0.55, 0.16, 1.0, 0) },
      hzcFogHorizon: { value: new THREE.Color('#cfa87f') },
      hzcFogZenith: { value: new THREE.Color('#365a8d') },
      hzcFogSun: { value: new THREE.Color('#ffa54f') },
      hzcSunDir: { value: new THREE.Vector3(0, 1, 0) },
      hzcCamPos: { value: new THREE.Vector3() },
      hzcCloudA: { value: new THREE.Vector4(1 / 190, 0.52, 0.26, 0.30) },
      hzcCloudDrift: { value: new THREE.Vector2() },
      hzcWeather: { value: new THREE.Vector4(0, 0, 0.82, 0.57) },
    };
    /** Alias so other lanes can plug the shared holders into their own shaders. */
    this.uniforms = this.u;

    /* ------------------------------ sun -------------------------------- */
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    /** Toward whichever body is currently lighting the world (sun OR moon). */
    this.lightDir = new THREE.Vector3();
    this.nightFactor = 0;
    this.sunAboveHorizon = true;
    this._celestialColor = new THREE.Color('#ffc98a');
    this._celestialIntensity = 4.5;

    /**
     * The sun is NOT added to the scene when cascades are live: three's CSM
     * makes one DirectionalLight PER CASCADE, and every directional light in
     * the scene that is not a cascade gets added on top of the one the CSM
     * shader picked — a stray sun (or the old counter-fill light) would be a
     * second, shadowless sun. It is kept as the public handle for colour and
     * direction, and it is the fallback light if enableCSM is unavailable.
     */
    this.sun = new THREE.DirectionalLight('#ffc98a', 4.5);
    this.sun.castShadow = false;

    this.csm = null;
    if (typeof engine?.enableCSM === 'function') {
      this.csm = engine.enableCSM({
        cascades: 3,
        maxFar: CSM_MAX_FAR,
        mode: 'practical',
        shadowMapSize: CSM_MAP_SIZE,
        lightMargin: 260,
        shadowBias: -0.00022,
        fade: true,
        lightDirection: new THREE.Vector3(0.48, -0.46, 0.75).normalize(),
        lightIntensity: 4.5,
      });
      // `enableCSM` cannot take a custom split callback (mode 'custom' without
      // one console.errors, which would fail every gate), so the splits are
      // installed after the fact. engine.resize() re-runs updateFrustums and
      // picks these up.
      this.csm.mode = 'custom';
      this.csm.customSplitsCallback = (amount, near, far, target) => {
        for (let i = 0; i < amount; i++) {
          target.push(i === amount - 1 ? 1 : (CSM_BREAKS[i] ?? (i + 1) / amount));
        }
      };
      this.csm.updateFrustums();
      for (const l of this.csm.lights) {
        l.shadow.normalBias = 0.035;
        l.shadow.bias = -0.00022;
      }
    } else {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      scene.add(this.sun, this.sun.target);
    }

    // Chunk patches must land AFTER CSM's injectInclude (it replaces the
    // lighting chunks wholesale) and BEFORE the first material compiles.
    patchShaderChunks();

    /* ---------------------- ambient: hemi + IBL ------------------------ */
    // world-01: hemi 1.25 -> 0.35 and the 0.5 counter-fill directional is gone.
    // Everything that used to be "bounce" is hemi + a much dimmer IBL now, so
    // the sun is the only thing making a lit surface bright.
    this.hemi = new THREE.HemisphereLight('#8aa9d6', '#6d5236', 0.32);
    scene.add(this.hemi);

    const pmrem = new THREE.PMREMGenerator(ctx.renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.12;
    pmrem.dispose();

    /* ---------------------------- fog ---------------------------------- */
    // scene.fog stays a real FogExp2 so USE_FOG/FOG_EXP2 are defined and three
    // keeps refreshing fogColor/fogDensity — that pair IS the fallback path.
    scene.fog = new THREE.FogExp2('#cfa87f', 0.00157);
    this.fogParams = this._buildFogContract();

    /* --------------------------- night lights -------------------------- */
    // Allocated at construction with intensity 0 so NUM_POINT_LIGHTS never
    // changes at runtime (a change recompiles every program in the scene).
    this.fireLight = new THREE.PointLight('#ff9a4e', 0, 26, 2);
    this.fireLight.castShadow = false;
    this.fireLight.position.set(0, 2, 0);
    scene.add(this.fireLight);
    this.eyeLights = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight('#ff5a3c', 0, 14, 2);
      l.castShadow = false;
      scene.add(l);
      this.eyeLights.push(l);
    }
    this._campFire = null;
    this._campSearch = 0;

    /* ------------------------------ sky -------------------------------- */
    this.sky = this._buildSky();
    scene.add(this.sky);

    this.ridges = this._buildRidges();
    scene.add(this.ridges);

    this.birds = this._buildBirds();
    scene.add(this.birds);
    this.motes = this._buildMotes();
    scene.add(this.motes);
    this.rain = this._buildRain();
    scene.add(this.rain);

    this.water = new RiverWater(ctx);

    /* ------------------- screen-space light shafts --------------------- */
    this._shafts = this._buildShafts();
    this._afterRender = () => this._renderShafts();
    engine?.onAfterRender?.push(this._afterRender);

    /**
     * The fog reconstructs world position from view position, so its camera
     * uniforms have to be the ones the frame is actually drawn with — not the
     * ones the sim tick left behind. `Environment.update()` runs before
     * `Player.update()` (world before actors), and a gate or photo mode can
     * render with a camera the sim never saw at all. three calls this exactly
     * once per `renderer.render(scene, …)`, with that camera. Chained, never
     * replaced: the slot belongs to the scene, not to this lane.
     */
    const prevOBR = scene.onBeforeRender;
    scene.onBeforeRender = (r, sc, camera, target) => {
      if (typeof prevOBR === 'function') prevOBR.call(scene, r, sc, camera, target);
      if (camera && camera.isCamera) {
        this.u.hzcCamPos.value.setFromMatrixPosition(camera.matrixWorld);
        this.u.hzcViewInv.value.copy(camera.matrixWorld);
      }
    };

    /* ------------------------ material registry ------------------------ */
    this._matSeen = new WeakSet();
    this._matCount = 0;
    this._grassCasters = [];
    this._scanClock = 0;
    this._scanAge = 0;
    this._registerScene();

    // Resolve the first frame's values so nothing renders with the constructor
    // defaults (a single dark frame at boot is a visible pop).
    this._applyTime(0);
  }

  /* ====================================================================== */
  /*                          published contracts                           */
  /* ====================================================================== */

  get time() { return this._time; }
  set time(h) { this.setTime(h); }

  /** Snap the sky to an hour (0–24). Returns the wrapped value. */
  setTime(h) {
    this._time = wrap24(h);
    this._applyTime(0);
    return this._time;
  }

  /** 'night' | 'dawn' | 'day' | 'dusk' — for audio/AI/progression. */
  get phase() { return this._phase; }

  /** Diagnostics for gates and the studio. Allocation-light, call at will. */
  debugInfo() {
    const csm = this.ctx.engine?.csm;
    const near = csm?.lights?.[0]?.shadow?.camera;
    return {
      hour: this._time,
      phase: this._phase,
      weather: this.weather,
      wetness: this.wetness,
      wind: { ...this.wind },
      nightFactor: this.nightFactor,
      sunDir: this.sunDir.toArray(),
      sunIntensity: this.sun.intensity,
      hemiIntensity: this.hemi.intensity,
      envIntensity: this.ctx.scene.environmentIntensity,
      fogDensity: this.u.hzcFogA.value.x,
      transmittance300: this.fogParams.transmittance(300, 6, 6),
      cascades: csm ? csm.cascades : 0,
      nearTexelM: near ? (near.right - near.left) / csm.shadowMapSize : null,
      cloudShadowSites,
      registeredMaterials: this._matCount,
    };
  }

  /** How many light-loop call sites the cloud-shadow term was woven into. */
  get cloudShadowSites() { return cloudShadowSites; }

  /**
   * Campfire rest hook (world-13 / progression). Advances the clock to `toHour`
   * over `seconds` of real time, emitting `rest-start` / `rest-end`.
   *   env.rest({ toHour: 6.2, seconds: 2.2 })  -> Promise<hour>
   *   env.rest(8)                              -> advance 8 game hours
   */
  rest(opts = {}) {
    const o = typeof opts === 'number' ? { hours: opts } : opts;
    const from = this._time;
    let to = Number.isFinite(o.toHour) ? wrap24(o.toHour) : wrap24(from + (o.hours ?? 8));
    let span = to - from;
    if (span <= 0.001) span += 24;
    const seconds = Math.max(0.1, o.seconds ?? 2.4);
    // A second rest request mid-rest must not orphan the first promise.
    if (this._rest) { const prev = this._rest; this._rest = null; prev.resolve?.(this._time); }
    this.ctx.events?.emit?.('rest-start', { from, to, seconds });
    return new Promise((resolve) => {
      this._rest = { from, span, seconds, k: 0, resolve, to };
    });
  }

  get resting() { return !!this._rest; }

  /**
   * Cross-fade to a weather state (world-14).
   *   env.setWeather('rain')          2.5 s default fade
   *   env.setWeather('storm', 0.6)
   */
  setWeather(name, fadeSeconds = 2.5) {
    const target = WEATHER[name];
    if (!target) return this.weather;
    if (name === this.weather && this._wK >= 1) return this.weather;
    for (const k in this.w) this._wFrom[k] = this.w[k];
    for (const k in target) this._wTo[k] = target[k];
    this._wK = 0;
    this._wRate = 1 / Math.max(0.05, fadeSeconds);
    this.weather = name;
    this.ctx.events?.emit?.('weather-changed', { weather: name, fadeSeconds });
    return name;
  }

  get weatherStates() { return Object.keys(WEATHER); }

  /** The live, cross-faded weather record (sunMul, cloud, rain, wind, …). */
  get weatherParams() { return this.w; }

  /**
   * The aerial-perspective contract `world-ground` (and anything else with a
   * hand-written material) needs to match the sky it is standing under.
   */
  _buildFogContract() {
    const u = this.u;
    const self = this;
    return {
      uniforms: u,
      get density() { return u.hzcFogA.value.x; },
      get heightFalloff() { return u.hzcFogA.value.y; },
      get heightRef() { return u.hzcFogA.value.z; },
      get inscatterPow() { return u.hzcFogA.value.w; },
      get inscatterStrength() { return u.hzcFogB.value.x; },
      horizon: u.hzcFogHorizon.value,
      zenith: u.hzcFogZenith.value,
      sun: u.hzcFogSun.value,
      sunDir: u.hzcSunDir.value,
      /** Beer-Lambert transmittance for a ray of `dist` m between two heights. */
      transmittance(dist, camY = FOG_HEIGHT_REF, fragY = camY) {
        const a = u.hzcFogA.value;
        const k = a.y;
        const base = Math.exp(-(camY - a.z) * k);
        const e = (fragY - camY) * k;
        const avg = Math.abs(e) < 0.002 ? base : base * (1 - Math.exp(-e)) / e;
        return Math.exp(-a.x * dist * Math.min(12, Math.max(0, avg)));
      },
      /** GLSL a custom material can paste; identical maths to the chunk. */
      glsl: {
        parsVertex: 'varying vec3 vFogWorldPos; varying float vFogDepth; uniform mat4 hzcViewInv;',
        vertex: 'vFogDepth = -mvPosition.z; vFogWorldPos = (hzcViewInv * vec4(mvPosition.xyz,1.0)).xyz;',
        note: 'Built-in materials get this for free once registerMaterial() has seen them.',
      },
      register: (m) => self.registerMaterial(m),
    };
  }

  /**
   * Opt a material into the cascades + aerial fog. Built-in materials in the
   * scene graph are found automatically; this is for anything held off-scene or
   * created after a scan.
   */
  registerMaterial(mat) {
    if (!mat || this._matSeen.has(mat)) return mat;
    this._matSeen.add(mat);
    this._matCount++;
    const engine = this.ctx.engine;
    const u = this.u;
    const prev = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile : null;

    // CSM only makes sense for materials that run the lighting chunks.
    const lit = !!(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial
      || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial || mat.isMeshToonMaterial);
    let csmFn = null;
    if (lit && engine?.csm) {
      engine.csmSetupMaterial(mat);
      if (mat.onBeforeCompile !== prev) {
        csmFn = mat.onBeforeCompile;
        mat.onBeforeCompile = prev;   // put it back; the chain below calls it
      }
    }

    mat.onBeforeCompile = function (shader, renderer) {
      if (prev) prev.call(this, shader, renderer);
      if (csmFn) csmFn.call(this, shader, renderer);
      const su = shader.uniforms;
      su.hzcViewInv = u.hzcViewInv;
      su.hzcFogA = u.hzcFogA;
      su.hzcFogB = u.hzcFogB;
      su.hzcFogHorizon = u.hzcFogHorizon;
      su.hzcFogZenith = u.hzcFogZenith;
      su.hzcFogSun = u.hzcFogSun;
      su.hzcSunDir = u.hzcSunDir;
      su.hzcCamPos = u.hzcCamPos;
      su.hzcCloudA = u.hzcCloudA;
      su.hzcCloudDrift = u.hzcCloudDrift;
      su.hzcWeather = u.hzcWeather;
    };
    mat.needsUpdate = true;
    return mat;
  }

  /**
   * One traversal: register every material, and set the shadow-caster policy
   * the audit asks for (grass + bush cast; world-01).
   *
   * Re-run on a timer because machines, camp props and the variety species land
   * seconds after boot. A material is touched exactly once (WeakSet), so the
   * repeat cost is the traversal, which is an order of magnitude cheaper than
   * the cull pass the engine already runs ten times a second.
   */
  _registerScene() {
    const scene = this.ctx.scene;
    scene.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isLine || o.isSprite) {
        const m = o.material;
        if (Array.isArray(m)) { for (let i = 0; i < m.length; i++) this.registerMaterial(m[i]); }
        else this.registerMaterial(m);
        this._shadowPolicy(o);
      }
    });
  }

  /**
   * world-01 "grass+bush casters".
   *
   * The bushes are two world-wide InstancedMeshes and cost ~0.04 M triangles to
   * cast: they go on and stay on. Grass is 178 per-chunk InstancedMeshes of
   * ~53 k triangles each, and a 48 m chunk's bounding sphere intersects ALL
   * THREE cascades — measured at the spawn vista, promoting every chunk took
   * the frame from 3.93 M to 8.81 M triangles and 223 to 302 draw calls, i.e.
   * grass shadows alone were 55 % of the frame against a 6.5 M budget
   * (perf-tech-02 / A21). They are worth paying for only where a cascade can
   * actually resolve a blade: cascade 0 reaches 13 m at 1.4 cm/px, cascade 1
   * 40 m at 4 cm/px, and past that a tuft shadow is sub-pixel mush. So the
   * chunk the player is standing in and its immediate neighbours cast, and the
   * rest do not — re-evaluated every frame in `update()`, which is a loop over
   * 178 cached meshes and no allocation.
   */
  _shadowPolicy(o) {
    if (o.userData.__hzcShadow) return;
    const n = o.name || '';
    if (n.startsWith('bushes-')) {
      o.userData.__hzcShadow = 1;
      o.castShadow = true;
      if (o.userData.__shadowCulled === true) o.userData.__shadowBase = true;
      return;
    }
    if (!n.startsWith('grass-chunk')) return;
    o.userData.__hzcShadow = 1;
    this._grassCasters.push(o);
  }

  /**
   * The (at most GRASS_CAST_MAX) grass chunks near enough for a cascade to
   * resolve a blade shadow. Two passes over a cached array, no allocation and
   * no sort: the first finds the Nth-smallest distance, the second applies it.
   */
  _updateGrassCasters(px, pz) {
    const list = this._grassCasters;
    const n = list.length;
    if (!n) return;
    const R2 = GRASS_CAST_RADIUS * GRASS_CAST_RADIUS;
    let m0 = Infinity, m1 = Infinity, m2 = Infinity;
    for (let i = 0; i < n; i++) {
      const o = list[i];
      const dx = o.position.x - px, dz = o.position.z - pz;
      const d = dx * dx + dz * dz;
      if (d >= R2) continue;
      if (d < m0) { m2 = m1; m1 = m0; m0 = d; }
      else if (d < m1) { m2 = m1; m1 = d; }
      else if (d < m2) { m2 = d; }
    }
    // Clamp to the radius: with fewer candidates than the cap the Nth-smallest
    // is still Infinity, and an un-clamped cut promotes EVERY chunk. Measured
    // the hard way — standing dead centre in a 48 m chunk there is exactly one
    // candidate inside the radius, and A21's spawn vista went from 4.9 M to
    // 8.6 M triangles because of it.
    const cut = Math.min(R2, GRASS_CAST_MAX >= 3 ? m2 : (GRASS_CAST_MAX === 2 ? m1 : m0));
    for (let i = 0; i < n; i++) {
      const o = list[i];
      const dx = o.position.x - px, dz = o.position.z - pz;
      const want = dx * dx + dz * dz <= cut;
      // The engine's distance cull stashes the base flag when it turns a caster
      // off, so when it is holding the mesh that stash is what must move.
      if (o.userData.__shadowCulled === true) o.userData.__shadowBase = want;
      else if (o.castShadow !== want) o.castShadow = want;
    }
  }

  /* ====================================================================== */
  /*                              sun position                              */
  /* ====================================================================== */

  /**
   * Direction TOWARD the celestial body for a given hour. Continuous outside
   * [rise, set] (elevation simply goes negative), so the moon can use it with
   * a 12.4 h offset.
   */
  static direction(hour, out) {
    const f = (hour - SUN_RISE) / (SUN_SET - SUN_RISE);
    const elev = SUN_MAX_ELEV * Math.sin(Math.PI * f);
    const beta = SUN_AZ_START - f * SUN_AZ_SWEEP;
    const ce = Math.cos(elev), se = Math.sin(elev);
    return out.set(Math.sin(beta) * ce, se, -Math.cos(beta) * ce).normalize();
  }

  /* ====================================================================== */
  /*                              per-frame                                 */
  /* ====================================================================== */

  update(dt, t) {
    const ctx = this.ctx;
    const engine = ctx.engine;

    /* ---- clock ---- */
    if (this._rest) {
      const r = this._rest;
      r.k = Math.min(1, r.k + dt / r.seconds);
      // ease so the sky accelerates away and settles on the target hour
      const e = r.k * r.k * (3 - 2 * r.k);
      this._time = wrap24(r.from + r.span * e);
      if (r.k >= 1) {
        this._time = r.to;
        const done = r.resolve;
        this._rest = null;
        ctx.events?.emit?.('rest-end', { hour: this._time });
        done?.(this._time);
      }
    } else if (!this.timeFrozen && dt > 0) {
      this._time = wrap24(this._time + dt * (24 / this.dayLengthSeconds));
    }

    /* ---- weather cross-fade ---- */
    if (this._wK < 1) {
      this._wK = Math.min(1, this._wK + dt * this._wRate);
      const k = this._wK * this._wK * (3 - 2 * this._wK);
      for (const key in this._wTo) this.w[key] = this._wFrom[key] + (this._wTo[key] - this._wFrom[key]) * k;
    }

    /* ---- wind + gusts (world-14 gust hook) ---- */
    this._gustPhase += dt * (0.22 + this.w.wind * 0.16);
    const g = Math.sin(this._gustPhase) * 0.5 + Math.sin(this._gustPhase * 2.37 + 1.1) * 0.32
      + Math.sin(this._gustPhase * 0.61 - 0.4) * 0.18;
    this.wind.gust = Math.max(0, g) * this.w.gust;
    this.wind.strength = this.w.wind + this.wind.gust;
    this.wetness += (this.w.wet - this.wetness) * Math.min(1, dt * (this.w.wet > this.wetness ? 0.55 : 0.12));

    /* ---- lightning (storm) ---- */
    this._updateLightning(dt);

    this._applyTime(dt);

    /* ---- animated uniforms ---- */
    this.sky.material.uniforms.uTime.value = t;
    this._birdMat.uniforms.uTime.value = t;
    this._moteMat.uniforms.uTime.value = t;
    this._rainMat.uniforms.uTime.value = t;
    this.water.update(dt, t);
    this._moteMat.uniforms.uFocal.value = ctx.renderer.domElement.height /
      (2 * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2));

    /* ---- follow the camera / player ---- */
    const cam = ctx.camera;
    this.u.hzcCamPos.value.copy(cam.position);
    this.u.hzcViewInv.value.copy(cam.matrixWorld);
    const p = ctx.player?.position;
    if (p) {
      this._updateGrassCasters(p.x, p.z);
      this.sky.position.set(p.x, 0, p.z);
      this.motes.position.set(p.x, p.y, p.z);
      this.sun.position.copy(this.sunDir).multiplyScalar(300).add(p);
      this.sun.target.position.copy(p);
    }
    this.rain.position.set(cam.position.x, cam.position.y, cam.position.z);
    this.rain.visible = this.w.rain > 0.004;
    this._rainMat.uniforms.uAmount.value = this.w.rain;
    this._rainMat.uniforms.uWind.value.set(this.wind.x * this.wind.strength, 0, this.wind.z * this.wind.strength);

    /* ---- weather uniform (wetness + gust hook for world-ground) ---- */
    this.u.hzcWeather.value.set(this.wetness, this.wind.gust,
      this.wind.x * this.wind.strength, this.wind.z * this.wind.strength);

    /* ---- cloud shadow drift ---- */
    const cd = this.u.hzcCloudDrift.value;
    cd.x += dt * this.wind.x * this.wind.strength * 0.0016;
    cd.y += dt * this.wind.z * this.wind.strength * 0.0016;

    /* ---- night point lights ---- */
    this._updateNightLights(dt);

    /* ---- shadow policy: cascades multiply the shadow pass (perf-tech-03) ---- */
    if (engine) {
      const tier = engine.tier || {};
      // Casters past the last cascade's far plane cannot appear in any shadow
      // map, so culling at CSM_MAX_FAR is free quality-wise and is the
      // "casters culled beyond 120 m" the gate asks for.
      const want = Math.min(tier.shadowCullDistance ?? CSM_MAX_FAR, CSM_MAX_FAR);
      if (engine.shadowCullDistance !== want) engine.shadowCullDistance = want;
      // The engine divides this DRAW budget by the cascade count; three then
      // frustum-culls each caster per cascade, so the realised cost is well
      // under caster x cascades. Measured at the spawn vista: 2.2x keeps the
      // Round-3 caster density at ~the Round-3 draw count.
      const budget = Math.round((tier.shadowCasterBudget ?? 150) * 2.2);
      if (engine.shadowCasterBudget !== budget) engine.shadowCasterBudget = budget;
    }

    /* ---- material scan: machines and camp props land after boot ---- */
    this._scanAge += dt;
    this._scanClock -= dt;
    if (this._scanClock <= 0) {
      this._scanClock = this._scanAge < 45 ? 0.4 : 2.5;
      this._registerScene();
    }
  }

  /* ---------------------------------------------------------------- time */

  _applyTime(dt) {
    const h = this._time;
    const k = this._keyAt(h);
    const w = this.w;
    const flash = this._lightning.k;

    /* ---- celestial direction ---- */
    Environment.direction(h, this.sunDir);
    Environment.direction(h + MOON_PHASE_OFFSET, this.moonDir);
    const isMoon = h >= MOON_TAKES_OVER || h < SUN_TAKES_OVER;
    const dir = isMoon ? this.moonDir : this.sunDir;
    this.lightDir.copy(dir);
    this.sunAboveHorizon = this.sunDir.y > 0;
    this.nightFactor = k.night;

    /* ---- colours ---- */
    _c0.copy(k.sunC);
    let intensity = k.sunI * (isMoon ? 1 : w.sunMul);
    // Storm flashes are a second, colder sun for ~120 ms.
    if (flash > 0.001) {
      _c0.lerp(_c1.setRGB(0.86, 0.90, 1.0), Math.min(0.85, flash));
      intensity += flash * 5.5;
    }
    // Cloud cover desaturates the direct light and lifts the ambient.
    if (w.desat > 0.001) _c0.lerp(_c1.setRGB(0.80, 0.82, 0.86), w.desat * 0.92);
    this._celestialColor.copy(_c0);
    this._celestialIntensity = intensity;

    this.sun.color.copy(_c0);
    this.sun.intensity = intensity;
    // The publicly visible sun direction is the SUN's, even at night — audio,
    // AI and the shaft pass want to know where the sun is, not the light.
    this.u.hzcSunDir.value.copy(this.sunDir.y > -0.05 ? this.sunDir : dir);

    if (this.csm) {
      _v0.copy(dir).multiplyScalar(-1);
      this.csm.lightDirection.copy(_v0);
      const lights = this.csm.lights;
      for (let i = 0; i < lights.length; i++) {
        lights[i].color.copy(_c0);
        lights[i].intensity = intensity;
      }
    } else {
      this.sun.position.copy(dir).multiplyScalar(300);
    }

    /* ---- ambient ---- */
    _c1.copy(k.hSkyC);
    if (w.desat > 0.001) _c1.lerp(_c0.setRGB(0.72, 0.74, 0.78), w.desat * 0.5);
    this.hemi.color.copy(_c1);
    _c1.copy(k.hGndC);
    if (w.desat > 0.001) _c1.lerp(_c0.setRGB(0.34, 0.35, 0.37), w.desat * 0.6);
    this.hemi.groundColor.copy(_c1);
    this.hemi.intensity = k.hemiI * w.hemiMul + flash * 0.8;
    this.ctx.scene.environmentIntensity = k.env * (0.55 + 0.45 * w.hemiMul);

    /* ---- fog / aerial perspective ---- */
    const dens = k.dens * w.densMul;
    const fa = this.u.hzcFogA.value;
    fa.x = dens;
    fa.y = FOG_HEIGHT_FALLOFF;
    fa.z = FOG_HEIGHT_REF;
    fa.w = 7.0;
    const fb = this.u.hzcFogB.value;
    fb.x = 0.55 * (1 - w.desat * 0.7) * (1 - k.night * 0.75);
    fb.y = 0.16 * (1 - w.desat * 0.8) * (1 - k.night * 0.8);
    fb.z = 1.0;
    _c1.copy(k.fogHC);
    if (w.desat > 0.001) _c1.lerp(_c0.setRGB(0.62, 0.64, 0.67), w.desat * 0.6);
    this.u.hzcFogHorizon.value.copy(_c1);
    _c1.copy(k.fogZC);
    if (w.desat > 0.001) _c1.lerp(_c0.setRGB(0.48, 0.51, 0.56), w.desat * 0.6);
    this.u.hzcFogZenith.value.copy(_c1);
    this.u.hzcFogSun.value.copy(k.fogSunC);
    // keep the fallback path (and anything reading scene.fog) in step
    const fog = this.ctx.scene.fog;
    fog.density = dens;
    fog.color.copy(this.u.hzcFogHorizon.value);

    /* ---- cloud shadows ---- */
    const ca = this.u.hzcCloudA.value;
    ca.x = 1 / 190;
    ca.y = 0.58 - w.cloud * 0.20;
    ca.z = w.cloudShadow * (1 - k.night) * (this.sunAboveHorizon ? 1 : 0);
    ca.w = 0.30;

    /* ---- sky uniforms ---- */
    const su = this.sky.material.uniforms;
    su.uSunDir.value.copy(this.sunDir);
    su.uMoonDir.value.copy(this.moonDir);
    su.uSunCol.value.copy(k.sunC);
    su.uHorizon.value.copy(this.u.hzcFogHorizon.value);
    su.uMid.value.copy(k.midC);
    su.uZenith.value.copy(k.zenC);
    su.uNight.value = k.night;
    su.uCloud.value.set(w.cloud, w.cloudDark, w.desat, flash);
    su.uStorm.value = w.rain;

    /* ---- phase events ---- */
    const phase = k.night > 0.72 ? 'night'
      : (h >= 4.6 && h < 8.2) ? 'dawn'
        : (h >= 18.4 && h < 21.2) ? 'dusk' : 'day';
    if (phase !== this._phase) {
      const prev = this._phase;
      this._phase = phase;
      if (prev) this.ctx.events?.emit?.('time-phase', { phase, hour: h, previous: prev });
    }
  }

  /** Interpolate the keyframe table at `h`, writing into a reused record. */
  _keyAt(h) {
    const K = this._key || (this._key = {
      sunI: 0, hemiI: 0, env: 0, dens: 0, night: 0,
      sunC: new THREE.Color(), hSkyC: new THREE.Color(), hGndC: new THREE.Color(),
      zenC: new THREE.Color(), midC: new THREE.Color(), horC: new THREE.Color(),
      fogHC: new THREE.Color(), fogZC: new THREE.Color(), fogSunC: new THREE.Color(),
    });
    if (!KEYS[0]._c) {
      for (const k of KEYS) {
        k._c = 1;
        k.sunCol = new THREE.Color(k.sun);
        k.hSkyCol = new THREE.Color(k.hSky);
        k.hGndCol = new THREE.Color(k.hGnd);
        k.zenCol = new THREE.Color(k.zen);
        k.midCol = new THREE.Color(k.mid);
        k.horCol = new THREE.Color(k.hor);
        k.fogHCol = new THREE.Color(k.fogH);
        k.fogZCol = new THREE.Color(k.fogZ);
        k.fogSunCol = new THREE.Color(k.fogSun);
      }
    }
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const s = THREE.MathUtils.clamp((h - a.h) / Math.max(1e-4, b.h - a.h), 0, 1);
    K.sunI = a.sunI + (b.sunI - a.sunI) * s;
    K.hemiI = a.hemiI + (b.hemiI - a.hemiI) * s;
    K.env = a.env + (b.env - a.env) * s;
    K.dens = a.dens + (b.dens - a.dens) * s;
    K.night = a.night + (b.night - a.night) * s;
    K.sunC.copy(a.sunCol).lerp(b.sunCol, s);
    K.hSkyC.copy(a.hSkyCol).lerp(b.hSkyCol, s);
    K.hGndC.copy(a.hGndCol).lerp(b.hGndCol, s);
    K.zenC.copy(a.zenCol).lerp(b.zenCol, s);
    K.midC.copy(a.midCol).lerp(b.midCol, s);
    K.horC.copy(a.horCol).lerp(b.horCol, s);
    K.fogHC.copy(a.fogHCol).lerp(b.fogHCol, s);
    K.fogZC.copy(a.fogZCol).lerp(b.fogZCol, s);
    K.fogSunC.copy(a.fogSunCol).lerp(b.fogSunCol, s);
    return K;
  }

  _updateLightning(dt) {
    const L = this._lightning;
    if (this.w.lightning < 0.25) { L.k *= Math.max(0, 1 - dt * 8); return; }
    L.t += dt;
    if (L.t >= L.next) {
      L.t = 0;
      L.next = 3.5 + Math.random() * 9;
      L.k = 1;
      this.ctx.events?.emit?.('thunder', { strength: 0.6 + Math.random() * 0.4 });
    }
    // two-stroke decay: a hard flash and a weaker echo
    L.k = Math.max(0, L.k - dt * (L.k > 0.55 ? 7.5 : 3.2));
    if (L.k > 0.18 && L.k < 0.24) L.k = 0.55;
  }

  /**
   * world-13 "night = machine eyes + campfire as light sources". Three pooled
   * point lights, allocated at boot so the light count never changes: one on
   * the camp fire and two that chase the nearest live machines.
   */
  _updateNightLights(dt) {
    const night = this.nightFactor;
    const ctx = this.ctx;

    if (!this._campFire && (this._campSearch -= dt) <= 0) {
      this._campSearch = 1.5;
      const camp = ctx.camp?.group || ctx.scene.getObjectByName('hunter-camp');
      camp?.traverse((o) => {
        if (!this._campFire && o.isPointLight && o !== this.fireLight) this._campFire = o;
      });
    }
    if (this._campFire) this._campFire.getWorldPosition(this.fireLight.position);
    // flicker keyed to the fire, strongest once the sun is gone
    const flick = 0.82 + Math.sin(this.ctx.engine.wallTime * 9.1) * 0.10
      + Math.sin(this.ctx.engine.wallTime * 21.7) * 0.06;
    this.fireLight.intensity = night * 26 * flick;
    this.fireLight.distance = 30;

    const list = ctx.machines?.list;
    if (!list || !list.length) {
      for (const l of this.eyeLights) l.intensity = 0;
      return;
    }
    const p = ctx.camera.position;
    // nearest two alive machines, no allocation
    let a = null, b = null, da = 1e9, db = 1e9;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m || m.alive === false || !m.position) continue;
      const dx = m.position.x - p.x, dz = m.position.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < da) { b = a; db = da; a = m; da = d; }
      else if (d < db) { b = m; db = d; }
    }
    const pick = [a, b];
    for (let i = 0; i < this.eyeLights.length; i++) {
      const l = this.eyeLights[i];
      const m = pick[i];
      if (!m || (i === 0 ? da : db) > 3600) { l.intensity = 0; continue; }
      l.position.set(m.position.x, m.position.y + (m.eyeHeight ?? 1.5), m.position.z);
      const st = m.state;
      if (st === 'attack' || st === 'alert') l.color.setRGB(1.0, 0.22, 0.12);
      else if (st === 'suspicious' || st === 'search') l.color.setRGB(1.0, 0.70, 0.14);
      else l.color.setRGB(0.25, 0.85, 1.0);
      l.intensity = night * 3.2;
      l.distance = 16;
    }
  }

  /* ====================================================================== */
  /*                    screen-space light shafts (world-04)                */
  /* ====================================================================== */

  _buildShafts() {
    const SAMPLES = 26;
    const rt = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    rt.texture.name = 'HZC.lightShafts';

    const gather = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDepth: { value: null },
        uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
        uColor: { value: new THREE.Color('#ffb066') },
        uParams: { value: new THREE.Vector4(0.91, 0.30, 1.0, 1.78) }, // decay, weight, intensity, aspect
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D tDepth;
        uniform vec2 uSunUv;
        uniform vec3 uColor;
        uniform vec4 uParams;
        varying vec2 vUv;
        void main() {
          vec2 delta = (vUv - uSunUv) * (1.0 / float(${SAMPLES})) * 0.92;
          vec2 c = vUv;
          float illum = 1.0;
          float acc = 0.0;
          for (int i = 0; i < ${SAMPLES}; i++) {
            c -= delta;
            // depth == 1 means nothing was drawn there: open sky, so the ray
            // from the sun reaches the camera through that pixel.
            float d = texture2D(tDepth, clamp(c, 0.0, 1.0)).x;
            float sky = step(0.99995, d);
            vec2 r = (c - uSunUv) * vec2(uParams.w, 1.0);
            acc += sky * exp(-dot(r, r) * 18.0) * illum;
            illum *= uParams.x;
          }
          // normalised by the sample count so the strength knob means the same
          // thing whatever SAMPLES is — unnormalised this dumped ~3x sunColour
          // on every pixel near the sun and bleached a quarter of the frame.
          acc /= float(${SAMPLES});
          gl_FragColor = vec4(uColor * min(acc * uParams.y * uParams.z, 0.30), 1.0);
        }
      `,
    });

    const composite = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
      uniforms: { tShaft: { value: rt.texture }, uTexel: { value: new THREE.Vector2(1 / 400, 1 / 225) } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D tShaft;
        uniform vec2 uTexel;
        varying vec2 vUv;
        void main() {
          // 9-tap blur: the quarter-res buffer has hard occluder edges in it
          // (a grass blade 2 m from the lens is a hard silhouette), and an
          // unblurred shaft reads as a painted wedge rather than a ray.
          vec2 o = uTexel * 2.4;
          vec3 c = texture2D(tShaft, vUv).rgb * 0.24;
          c += texture2D(tShaft, vUv + vec2(o.x, 0.0)).rgb * 0.12;
          c += texture2D(tShaft, vUv - vec2(o.x, 0.0)).rgb * 0.12;
          c += texture2D(tShaft, vUv + vec2(0.0, o.y)).rgb * 0.12;
          c += texture2D(tShaft, vUv - vec2(0.0, o.y)).rgb * 0.12;
          c += texture2D(tShaft, vUv + o).rgb * 0.07;
          c += texture2D(tShaft, vUv - o).rgb * 0.07;
          c += texture2D(tShaft, vUv + vec2(o.x, -o.y)).rgb * 0.07;
          c += texture2D(tShaft, vUv - vec2(o.x, -o.y)).rgb * 0.07;
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });

    return {
      rt,
      gather,
      composite,
      quadA: new FullScreenQuad(gather),
      quadB: new FullScreenQuad(composite),
      w: 0,
      h: 0,
    };
  }

  /**
   * Runs from `engine.onAfterRender`, i.e. after the composer has resolved the
   * frame to the canvas and while the scene depth attachment is still the one
   * that produced it. Two draws, quarter resolution.
   */
  _renderShafts() {
    const s = this._shafts;
    const engine = this.ctx.engine;
    const renderer = this.ctx.renderer;
    const depth = engine?.depthTexture;
    if (!depth) return;

    // strength: sun above the horizon, in front of the camera, not rained out
    const cam = this.ctx.camera;
    const sun = this.sunDir;
    if (sun.y <= 0.015 || this.nightFactor > 0.85) return;
    cam.getWorldDirection(_v1);
    const facing = _v1.dot(sun);
    if (facing <= 0.02) return;
    const strength = Math.min(1, facing * 1.35) * (1 - this.nightFactor)
      * this.w.shaft * Math.min(1, sun.y * 5.0 + 0.15);
    if (strength < 0.02) return;

    // sun position in NDC
    _v0.copy(cam.position).addScaledVector(sun, 900).project(cam);
    const ux = _v0.x * 0.5 + 0.5, uy = _v0.y * 0.5 + 0.5;
    if (ux < -0.6 || ux > 1.6 || uy < -0.6 || uy > 1.6) return;

    const size = renderer.getDrawingBufferSize(_shaftSize);
    const w = Math.max(2, Math.round(size.x * 0.25));
    const h = Math.max(2, Math.round(size.y * 0.25));
    if (w !== s.w || h !== s.h) {
      s.rt.setSize(w, h);
      s.composite.uniforms.uTexel.value.set(1 / w, 1 / h);
      s.w = w; s.h = h;
    }

    const gu = s.gather.uniforms;
    gu.tDepth.value = depth;
    gu.uSunUv.value.set(ux, uy);
    gu.uColor.value.copy(this._celestialColor);
    gu.uParams.value.set(0.912, 0.30, strength * 0.8, size.x / Math.max(1, size.y));

    const wasAuto = renderer.autoClear;
    const wasTarget = renderer.getRenderTarget();
    renderer.autoClear = false;
    renderer.setRenderTarget(s.rt);
    s.quadA.render(renderer);
    renderer.setRenderTarget(wasTarget);
    s.quadB.render(renderer);
    renderer.autoClear = wasAuto;
  }

  /* ====================================================================== */
  /*                          far ridge silhouettes                         */
  /* ====================================================================== */

  /**
   * world-05 second half: "rim geometry lit, not MeshBasicMaterial". The rings
   * used to be unlit meshes with the horizon colour baked into their vertices,
   * so they never changed with the light and could never receive the aerial
   * tint. They are lit standard material now with honest rock/snow albedo and
   * real normals; the height-aware fog does the hazing, which is why the peaks
   * come out of the haze while the bases sink into it.
   */
  _buildRidges() {
    const group = new THREE.Group();
    group.name = 'far-ridges';
    const noise = new SimplexNoise(777);
    const SS = THREE.MathUtils.smoothstep;
    const rings = [
      { r: 620, h: 168, base: '#6d6353', snowY: 92, seed: 0.0 },
      { r: 900, h: 232, base: '#6a6455', snowY: 128, seed: 3.7 },
      { r: 1180, h: 300, base: '#66604f', snowY: 168, seed: 7.9 },
    ];
    const cBase = new THREE.Color(), cTmp = new THREE.Color();
    const cSnow = new THREE.Color('#dfe6ea');
    const cDark = new THREE.Color('#3e392f');
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.96,
      metalness: 0,
      fog: true,
    });
    this.ridgeMaterial = mat;

    for (const ring of rings) {
      const segs = 240;
      const pos = [];
      const col = [];
      const idx = [];
      cBase.set(ring.base);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const cs = Math.cos(a), sn = Math.sin(a);
        const x = cs * ring.r, z = sn * ring.r;
        const mass = noise.fbm(cs * 2.3 + ring.r, sn * 2.3, 3) * 0.5 + 0.5;
        const sector = noise.fbm(cs * 1.6 + ring.seed, sn * 1.6 - ring.seed * 2, 2) * 0.5 + 0.5;
        const jag = SS(sector, 0.52, 0.82);
        const teeth = Math.abs(noise.noise2D(cs * (5.5 + 4 * jag) + 9, sn * (5.5 + 4 * jag) - 4));
        const peak = ring.h * (0.34 + 0.52 * mass + 0.38 * teeth * jag);
        const midY = peak * 0.50;

        // strata banding on the mid band, snow on the upper faces — albedo
        // only; all the light and haze now comes from the sun and the fog.
        const strata = noise.fbm(cs * 1.9 + 21, sn * 1.9 - 8, 2) * 0.5 + 0.5;
        cTmp.copy(cBase).lerp(cDark, 0.18 * strata);
        const snowLine = ring.snowY * (0.82 + 0.36 * (noise.fbm(cs * 2.9 - 7, sn * 2.9 + 2, 2) * 0.5 + 0.5));
        const snowK = SS(peak, snowLine, snowLine * 1.30);

        pos.push(x, -40, z, x, midY, z, x, peak, z);
        _c0.copy(cBase).lerp(cDark, 0.45);
        col.push(_c0.r, _c0.g, _c0.b);
        col.push(cTmp.r, cTmp.g, cTmp.b);
        _c0.copy(cTmp).lerp(cSnow, snowK * 0.92);
        col.push(_c0.r, _c0.g, _c0.b);

        if (i < segs) {
          const b = i * 3;
          idx.push(b, b + 1, b + 3, b + 3, b + 1, b + 4);
          idx.push(b + 1, b + 2, b + 4, b + 4, b + 2, b + 5);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `far-ridge-${ring.r}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.noSizeCull = true;
      group.add(mesh);
    }
    return group;
  }

  /* ====================================================================== */
  /*                                bird flocks                             */
  /* ====================================================================== */

  _buildBirds() {
    const flocks = [
      { c: [-70, 92, 55], r: 78, n: 11, s: 0.9 },
      { c: [140, 120, -170], r: 130, n: 8, s: 1.6 },
    ];
    const pos = [];
    const bird = [];
    const center = [];
    const idx = [];
    let vb = 0;
    const rand = (() => { let s = 511; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    for (const f of flocks) {
      for (let b = 0; b < f.n; b++) {
        const phase = rand() * Math.PI * 2;
        const radius = f.r * (0.82 + rand() * 0.4);
        const speed = 0.055 + rand() * 0.03;
        const flap = 5.5 + rand() * 3.5;
        const sc = f.s * (0.8 + rand() * 0.5);
        const wing = [
          [0, 0, 0.30], [-0.95, 0.02, -0.34], [0, 0, -0.10],
          [0, 0, 0.30], [0, 0, -0.10], [0.95, 0.02, -0.34],
        ];
        for (const [wx, wy, wz] of wing) {
          pos.push(wx * sc, wy * sc, wz * sc);
          bird.push(phase, radius, speed, flap);
          center.push(f.c[0], f.c[1], f.c[2]);
        }
        idx.push(vb, vb + 1, vb + 2, vb + 3, vb + 4, vb + 5);
        vb += 6;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aBird', new THREE.Float32BufferAttribute(bird, 4));
    geo.setAttribute('aCenter', new THREE.Float32BufferAttribute(center, 3));
    geo.setIndex(idx);

    this._birdMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec4 aBird;
        attribute vec3 aCenter;
        uniform float uTime;
        void main() {
          float a = uTime * aBird.z * 6.2832 + aBird.x;
          vec3 c = aCenter + vec3(
            cos(a) * aBird.y,
            sin(uTime * 0.34 + aBird.x * 3.0) * 5.0 + sin(a * 2.0) * 2.2,
            sin(a) * aBird.y * 0.74
          );
          float flap = sin(uTime * aBird.w + aBird.x * 7.0) * 0.8;
          vec3 local = vec3(position.x, position.y + abs(position.x) * flap, position.z);
          vec2 tng = normalize(vec2(-sin(a), cos(a) * 0.74));
          float yaw = atan(tng.x, tng.y);
          float cy = cos(yaw), sy = sin(yaw);
          vec3 p = vec3(local.x * cy + local.z * sy, local.y, -local.x * sy + local.z * cy);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(c + p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uNight;
        void main() { gl_FragColor = vec4(vec3(0.13, 0.115, 0.10) * (1.0 - uNight * 0.6), 1.0); }
      `,
    });
    const mesh = new THREE.Mesh(geo, this._birdMat);
    mesh.name = 'bird-flocks';
    mesh.frustumCulled = false;
    mesh.userData.noSizeCull = true;
    return mesh;
  }

  /* ============================== pollen ================================= */

  _buildMotes() {
    const N = 170;
    const rand = (() => { let s = 977; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rand() - 0.5) * 24;
      pos[i * 3 + 1] = rand() * 9;
      pos[i * 3 + 2] = (rand() - 0.5) * 24;
      seed[i] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 22);

    this._moteMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uFocal: { value: 800 },
        uTint: { value: new THREE.Color(1.0, 0.86, 0.58) },
        uGain: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime, uFocal;
        varying float vA;
        void main() {
          vec3 drift = vec3(
            uTime * (0.30 + aSeed * 0.25),
            -uTime * (0.045 + aSeed * 0.05),
            uTime * (0.18 + aSeed * 0.16)
          );
          vec3 p = mod(position + drift, vec3(24.0, 9.0, 24.0)) - vec3(12.0, 0.0, 12.0);
          p.x += sin(uTime * 0.9 + aSeed * 40.0) * 0.5;
          p.y += 0.6 + sin(uTime * 1.3 + aSeed * 21.0) * 0.35;
          p.z += cos(uTime * 0.7 + aSeed * 33.0) * 0.5;
          float edge = (1.0 - smoothstep(7.0, 11.5, length(p.xz))) * (1.0 - smoothstep(6.0, 8.8, p.y));
          vA = edge * (0.25 + 0.75 * fract(aSeed * 7.31));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp((0.028 + aSeed * 0.020) * uFocal / -mv.z, 1.0, 7.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        uniform vec3 uTint;
        uniform float uGain;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float a = smoothstep(1.0, 0.15, length(uv)) * vA * 0.34 * uGain;
          gl_FragColor = vec4(uTint * a, a);
        }
      `,
    });
    const pts = new THREE.Points(geo, this._moteMat);
    pts.name = 'pollen-motes';
    pts.frustumCulled = false;
    pts.userData.noSizeCull = true;
    return pts;
  }

  /* =============================== rain ================================== */

  /**
   * world-14. One draw call: 2600 screen-aligned streaks in a wrap-around box
   * that rides the camera, animated entirely in the vertex shader off `uTime`,
   * so there is nothing per-frame to allocate or upload but two uniforms.
   */
  _buildRain() {
    const N = 9000;
    const rand = (() => { let s = 20250909; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    const pos = new Float32Array(N * 6 * 3);
    const seed = new Float32Array(N * 6 * 3);
    const corner = new Float32Array(N * 6 * 2);
    const CORN = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];
    let v = 0;
    for (let i = 0; i < N; i++) {
      const s0 = rand(), s1 = rand(), s2 = rand();
      for (let c = 0; c < 6; c++) {
        pos[v * 3] = 0; pos[v * 3 + 1] = 0; pos[v * 3 + 2] = 0;
        seed[v * 3] = s0; seed[v * 3 + 1] = s1; seed[v * 3 + 2] = s2;
        corner[v * 2] = CORN[c][0];
        corner[v * 2 + 1] = CORN[c][1];
        v++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);

    this._rainMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uAmount: { value: 0 },
        uWind: { value: new THREE.Vector3() },
        uTint: { value: new THREE.Color(0.72, 0.80, 0.90) },
      },
      vertexShader: /* glsl */`
        attribute vec3 aSeed;
        attribute vec2 aCorner;
        uniform float uTime, uAmount;
        uniform vec3 uWind;
        varying float vA;
        void main() {
          if (aSeed.x > uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
          const float BX = 13.0, BY = 19.0;
          float fall = uTime * (13.0 + aSeed.z * 7.0);
          float y = BY - mod(fall + aSeed.z * BY * 3.0, BY);
          vec3 p = vec3(
            (fract(aSeed.x * 37.19) - 0.5) * BX * 2.0 + uWind.x * y * 0.10,
            y - BY * 0.20,
            (fract(aSeed.y * 51.37) - 0.5) * BX * 2.0 + uWind.z * y * 0.10
          );
          vec3 dirW = normalize(vec3(uWind.x * 0.32, -1.0, uWind.z * 0.32));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vec3 dirV = normalize((modelViewMatrix * vec4(dirW, 0.0)).xyz);
          vec2 d2 = normalize(dirV.xy + vec2(1e-4, 0.0));
          vec2 side = vec2(-d2.y, d2.x);
          // Streaks are sized in SCREEN space, not world space: a view-space
          // offset subtends offset/depth radians, so both terms scale with
          // depth. Without this a drop 3 m from the lens drew as a 10 px white
          // bar and the storm looked like falling planks.
          float k = clamp(-mv.z, 1.5, 26.0);
          float len = (0.020 + fract(aSeed.z * 91.7) * 0.026) * k;
          mv.xy += d2 * (aCorner.y * len) + side * (aCorner.x * 0.0014 * k);
          float dist = length(mv.xyz);
          vA = smoothstep(0.8, 2.4, dist) * (1.0 - smoothstep(15.0, 24.0, dist))
             * (0.40 + 0.60 * fract(aSeed.z * 13.7));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        varying float vA;
        uniform vec3 uTint;
        void main() {
          if (vA <= 0.001) discard;
          gl_FragColor = vec4(uTint, vA * 0.52);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, this._rainMat);
    mesh.name = 'rain';
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    mesh.userData.noSizeCull = true;
    return mesh;
  }

  /* ================================ sky ================================== */

  _buildSky() {
    const geo = new THREE.SphereGeometry(1900, 48, 32);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uSunCol: { value: new THREE.Color('#ffc98a') },
        uHorizon: { value: new THREE.Color('#cfa87f') },
        uMid: { value: new THREE.Color('#7d95bf') },
        uZenith: { value: new THREE.Color('#173f83') },
        uNight: { value: 0 },
        uCloud: { value: new THREE.Vector4(0.3, 0.3, 0, 0) },
        uStorm: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 uSunDir, uMoonDir, uSunCol, uHorizon, uMid, uZenith;
        uniform float uNight, uStorm, uTime;
        uniform vec4 uCloud;   // coverage, underside darkness, desat, flash

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float hash3(vec3 p){ return fract(sin(dot(p, vec3(12.99,78.23,45.16)))*43758.5453); }
        float noise(vec2 p){
          vec2 i=floor(p), f=fract(p);
          f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                     mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
        }
        float fbm(vec2 p){
          float s=0., a=.5;
          for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.02; a*=.5; }
          return s;
        }

        void main() {
          vec3 d = normalize(vDir);
          vec3 sd = normalize(uSunDir);
          vec3 md = normalize(uMoonDir);
          float h = clamp(d.y, -0.08, 1.0);

          // ---- gradient. Deeper than Round 3: the zenith is a real blue and
          // the warm band is confined to the sun's bearing instead of ringing
          // the whole horizon (world-04 "milky sky").
          vec2 hz = normalize(d.xz + vec2(1e-5));
          vec2 sz = normalize(sd.xz + vec2(1e-5));
          float az = max(dot(hz, sz), 0.0);
          vec3 horizon = mix(uHorizon * 0.72, uHorizon, pow(az, 2.2));
          vec3 col = mix(horizon, uMid, smoothstep(-0.02, 0.26, h));
          col = mix(col, uZenith, smoothstep(0.18, 0.92, h));
          // band the warm glow into the sun's quadrant only
          col += uSunCol * pow(az, 6.0) * (1.0 - smoothstep(0.0, 0.42, h)) * 0.22 * (1.0 - uNight);

          // overcast lid: past ~40% cover the gradient flattens into a sheet,
          // otherwise a "cloudy" sky kept a blue zenith showing through
          {
            vec3 lid = mix(vec3(0.66, 0.68, 0.72), vec3(0.19, 0.21, 0.25), uCloud.y);
            lid = mix(lid, vec3(0.09, 0.10, 0.13), uNight * 0.86);
            col = mix(col, lid, smoothstep(0.34, 0.95, uCloud.x) * 0.88);
          }

          float sunD = max(dot(d, sd), 0.0);
          float moonD = max(dot(d, md), 0.0);

          // ---- stars: stable 3D hash cells, twinkling, fading with daylight
          if (uNight > 0.01 && d.y > -0.02) {
            vec3 g = d * 260.0;
            vec3 cell = floor(g);
            float r = hash3(cell);
            if (r > 0.9880) {
              vec3 jit = vec3(hash3(cell + 1.7), hash3(cell + 5.3), hash3(cell + 9.1)) - 0.5;
              float dd = length(fract(g) - 0.5 - jit * 0.6);
              float tw = 0.62 + 0.38 * sin(uTime * (1.4 + r * 8.0) + r * 60.0);
              float mag = smoothstep(0.36, 0.0, dd) * (0.40 + (r - 0.9880) * 78.0);
              col += vec3(0.88, 0.92, 1.0) * mag * tw * 1.35 * uNight * smoothstep(-0.02, 0.16, d.y);
            }
            // milky band
            float mw = exp(-pow((dot(d, normalize(vec3(0.42, 0.55, -0.72))) ), 2.0) * 34.0);
            col += vec3(0.30, 0.34, 0.46) * mw * 0.055 * uNight;
          }

          // ---- moon: disc, limb darkening, maria, halo
          if (uNight > 0.005 && md.y > -0.06) {
            float disc = smoothstep(0.99955, 0.99988, moonD);
            float mtex = fbm(d.xz * 190.0 + 4.0) * 0.35 + 0.65;
            col += vec3(0.92, 0.93, 0.88) * disc * mtex * 1.5 * uNight;
            col += vec3(0.62, 0.68, 0.86) * pow(moonD, 900.0) * 0.35 * uNight;
            col += vec3(0.38, 0.44, 0.62) * pow(moonD, 60.0) * 0.10 * uNight;
          }

          // ---- high cirrus
          if (d.y > 0.06) {
            vec2 cuv = d.xz / (d.y + 0.42);
            vec2 ruv = vec2(cuv.x * 0.86 - cuv.y * 0.51, cuv.x * 0.51 + cuv.y * 0.86);
            float cir = fbm(vec2(ruv.x * 0.5, ruv.y * 3.2) + vec2(uTime * 0.005, 0.0));
            cir = smoothstep(0.52, 0.85, cir)
                * smoothstep(0.05, 0.28, d.y) * (1.0 - smoothstep(0.5, 0.85, d.y));
            col = mix(col, mix(vec3(0.99, 0.90, 0.80), vec3(0.30,0.34,0.44), uNight),
                      cir * 0.26 * (1.0 - uCloud.x * 0.8));
          }

          // ---- cumulus: domain-warped fbm, sunlit rims from a step toward
          // the sun. Coverage and underside darkness are the weather knobs.
          float cover = 0.0;
          if (d.y > 0.012) {
            vec2 uv = d.xz / (d.y + 0.18);
            vec2 drift = vec2(uTime * 0.0065, uTime * 0.0022) * (1.0 + uStorm * 2.0);
            vec2 warp = vec2(fbm(uv * 0.85 + drift * 0.6),
                             fbm(uv * 0.85 + 7.31 - drift * 0.4)) - 0.5;
            vec2 cuv = uv * 1.22 + warp * 0.9 + drift;
            float c = fbm(cuv);
            float lo = mix(0.56, 0.20, uCloud.x);
            cover = smoothstep(lo, lo + 0.24, c) * mix(smoothstep(0.96, 0.16, d.y), 1.0, uCloud.x * 0.9);
            if (cover > 0.002) {
              float cSun = fbm(cuv + sz * 0.10);
              float rimL  = clamp((c - cSun) * 4.5, 0.0, 1.0);
              float shade = clamp((cSun - c) * 3.5, 0.0, 1.0);
              float tex = fbm(cuv * 2.9 + drift * 1.6);
              vec3 lit    = mix(vec3(1.18, 1.00, 0.80), vec3(0.34,0.38,0.50), uNight);
              vec3 body   = mix(vec3(0.94, 0.90, 0.86), vec3(0.52, 0.55, 0.62),
                                smoothstep(0.32, 0.78, tex));
              body = mix(body, vec3(0.30, 0.32, 0.38), uCloud.y);
              body = mix(body, vec3(0.12, 0.14, 0.19), uNight * 0.82);
              vec3 shadowC = mix(vec3(0.42, 0.44, 0.52), vec3(0.09,0.10,0.14), uNight);
              vec3 cloudCol = mix(body, shadowC, shade * (0.55 + 0.45 * uCloud.y));
              cloudCol = mix(cloudCol, lit, rimL * 0.9 * (1.0 - uNight));
              cloudCol += uSunCol * pow(sunD, 3.0) * (0.24 + 0.5 * rimL) * (1.0 - uNight);
              cloudCol += vec3(0.9, 0.94, 1.0) * uCloud.w * 0.9;
              col = mix(col, cloudCol, cover * 0.92);
            }
          }

          // ---- sun: a TIGHT HDR disc with a corona, not a smeared blob. The
          // long radial spokes are gone — occlusion-aware shafts are a
          // screen-space pass now (see _renderShafts).
          float occl = 1.0 - cover * 0.92;
          float day = 1.0 - uNight;
          if (sd.y > -0.10) {
            float disc = smoothstep(0.99995, 0.999985, sunD);
            float horizonDim = smoothstep(-0.10, 0.06, sd.y);
            col += uSunCol * disc * 15.0 * occl * horizonDim * day;
            // corona: two lobes, tight then wide
            col += uSunCol * pow(sunD, 2200.0) * 2.6 * occl * horizonDim * day;
            col += uSunCol * pow(sunD, 190.0) * 0.26 * (0.35 + 0.65 * occl) * horizonDim * day;
            col += uSunCol * pow(sunD, 14.0) * 0.045 * occl * horizonDim * day;
          }

          // storm flash lifts the whole dome
          col += vec3(0.80, 0.86, 1.0) * uCloud.w * 0.55;

          // desaturate under cloud
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(col, vec3(l), uCloud.z * 0.4);

          gl_FragColor = vec4(min(col, vec3(26.0)), 1.0);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'sky';
    mesh.userData.noSizeCull = true;
    return mesh;
  }
}
