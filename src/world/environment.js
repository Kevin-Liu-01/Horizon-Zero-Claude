import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * ROUND 5 — lane `world-sky` (docs/ROUND5-PLAN.md §2, §9 "world-sky"; the look items are
 * docs/ROUND5-LOOK.md L-03 … L-15). Sky, sun, cascaded shadows, aerial perspective, the
 * golden-weighted clock, the CALIMA weather and the per-biome grade of Orchil.
 * The system is Round 4's `world-light` lane, kept; its values are replaced.
 *
 * ---------------------------------------------------------------------------
 * PUBLISHED API. Nothing outside this file is edited; every cross-lane need is
 * served through these (exact signatures in docs/ROUND5-WORLD-SKY.md §3).
 *
 *   environment.time                 0–24 game hours (read/write)
 *   environment.setTime(h)           snap the sky to an hour (re-bakes the sky IBL under ?shot)
 *   environment.clock                'golden' (default) | 'even' (L-11, Kevin's Q1)
 *   environment.dayLengthSeconds     real seconds per in-game day (1800)
 *   environment.timeFrozen           stop the clock (set by `?shot=1`)
 *   environment.weather              'trade' | 'calima' | 'fogbank' | 'squall' (bible §2.3)
 *   environment.setWeather(n, fade)  cross-fade; fade 0 snaps. Round-4 names are aliases:
 *                                    clear -> trade, rain/storm -> squall, overcast stays
 *                                    a hidden legacy state for the kind-block's beam row
 *   environment.weatherStates        ['trade', 'calima', 'fogbank', 'squall']
 *   environment.states               name -> the weather record (read-only use)
 *   environment.weatherParams        the resolved, cross-faded weather record
 *   environment.perceptionScale      Instrument sight multiplier: 1.0 / 0.5 / 0.5 / 0.8,
 *                                    0.7 at night (min of the two; fogbank only inside the bank)
 *   environment.windAt(x, z, out?)   wind speed in m/s at a point (trade 5.5 with gusts,
 *                                    lulls at dawn and dusk); `out.x/.z` get the velocity
 *   environment.wind                 { x, z, strength, gust } (Round-4 foliage contract, kept)
 *   environment.phase                'night' | 'dawn' | 'day' | 'dusk'
 *   environment.sunDir / moonDir     unit vectors TOWARD the body (noon stands in the south)
 *   environment.lightDir             TOWARD whatever lights the world now
 *   environment.nightFactor          0 day .. 1 night
 *   environment.biome                dominant biome at the camera; `biomeMix` the six weights
 *   environment.exposureEV           the keyed EV now applied (hour + biome + weather)
 *   environment.fogParams            aerial-perspective contract (world-ground: horizon,
 *                                    zenith, sun, transmittance(dist, camY, fragY), ext …)
 *   environment.fogTransmittance(a, b)  CPU mirror between two world points (L-05)
 *   environment.uniforms (= .u)      shared uniform holders, incl. calWeather, calSunCol,
 *                                    calSunRad (L-06/W-09: the sun disc's HDR radiance)
 *   environment.registerMaterial(m)  opt a custom material into fog + cascades
 *   environment.skyIBL               the sky-captured PMREM texture ('CAL.skyIBL', L-04)
 *   environment.skyCube              the raw 128² sky cube (a sky-only reflection probe, W-08)
 *   environment.borrowLight(ms)      lend the pooled impact light (P-04 e) -> PointLight|null
 *   environment.fireLight            the pooled fire light (F-1 rule; `fireSource` = Object3D)
 *   environment.rest(opts)           rest-until hook -> Promise<hour>
 *   environment.dispose()            tear everything down
 *   Environment.direction(h, out)    static sun direction for an hour
 *   Environment.HOURS                { newGame: 7, title: 17.75, shot: 17.75 }
 *
 * EVENTS (ctx.events): `time-phase`, `weather-changed`, `rest-start`, `rest-end`, `thunder`.
 * ---------------------------------------------------------------------------
 *
 * WHY THE SHADER CHUNKS ARE PATCHED GLOBALLY (see `patchShaderChunks`): three's
 * built-in fog is a single exp2 term on view depth. Rather than fork every material
 * in other lanes, the fog chunks are replaced once and every scene material is handed
 * the shared uniform objects. A material that is never registered still renders:
 * `calFogA.x == 0` falls back to stock exp2 fog.
 */

/* ========================================================================== */
/*                       time-of-day + weather data tables                    */
/* ========================================================================== */

const DEG = Math.PI / 180;
/** Sun arc (L-11): rises 06:00 at bearing 70, culminates 50° up in the SOUTH at the
 *  12:45 solar noon (Orchil is at 28° N), sets 19:30 at bearing 290. */
const SUN_RISE = 6.0;
const SUN_SET = 19.5;
const SUN_MAX_ELEV = 50 * DEG;
const SUN_AZ_START = 70 * DEG;
const SUN_AZ_SWEEP = 220 * DEG;
/** The moon runs the same arc, half a day out of phase (+0.4 h). */
const MOON_PHASE_OFFSET = 12.4;
/** Hand-over hours; both are intensity troughs (sunI ≤ 0.15) at 05:24 and 19:54. */
const SUN_TAKES_OVER = 5.4;
const MOON_TAKES_OVER = 19.9;

/** Hours the game starts at (L-11 / R66 j). The look places and gates (`?shot`) stand at 17:45. */
const HOURS = Object.freeze({ newGame: 7.0, title: 17.75, shot: 17.75 });

/**
 * Keyframes, interpolated by hour (bible §2.4 as amended by R66 k = ROUND5-LOOK L-03).
 * `sunI` is the celestial light (sun by day, moon by night). `env` is the sky-IBL
 * intensity and `hemiI` the hemisphere fill (see below). `ev` is the hour's exposure offset; `mist` the valley-mist density;
 * (Measured on the first films: at L-03's 0.30–0.45 sky-IBL and 0.10–0.14 hemisphere every
 * surface turned from the sun read black. The sky IBL now runs at ≈ 0.9–1.0, i.e. the sky
 * lights the ground with the radiance it shows, and the hemisphere carries the violet-rose
 * shadow tint at golden hours and the moonlit fill at night.)
 * `sea` the cloud-sea colour (bible: "cloud sea lit from below #F6D2B0" at dawn).
 * Bible / LOOK hex values are kept verbatim; the 04:36, 05:24, 19:54 and 21:00 rows and
 * the colours the tables leave blank are this lane's, chosen to interpolate between them.
 */
const KEYS = [
  { h: 0.0, sunI: 0.45, sun: '#9FB3D6', hemiI: 0.80, hSky: '#3a4c78', hGnd: '#161922', env: 1.00,
    zen: '#0D1220', mid: '#121a2f', hor: '#1B2438', fogH: '#20283A', fogZ: '#0c1222', fogSun: '#3d4a6a',
    sea: '#2a3146', dens: 0.00110, mist: 0.0012, night: 1.00, ev: 1.30 },
  { h: 4.6, sunI: 0.42, sun: '#9fb0d2', hemiI: 0.78, hSky: '#3d4c78', hGnd: '#191b21', env: 1.00,
    zen: '#121a31', mid: '#1b2440', hor: '#2f3550', fogH: '#2f3546', fogZ: '#111830', fogSun: '#4f5a80',
    sea: '#363c55', dens: 0.00120, mist: 0.0016, night: 0.95, ev: 1.25 },
  // hand-over trough 05:24
  { h: 5.4, sunI: 0.10, sun: '#a99cb8', hemiI: 0.62, hSky: '#5a5f88', hGnd: '#241f1e', env: 1.00,
    zen: '#222b47', mid: '#3c4260', hor: '#7d7387', fogH: '#5d6070', fogZ: '#1c2440', fogSun: '#8a6f80',
    sea: '#6d6a80', dens: 0.00140, mist: 0.0020, night: 0.74, ev: 1.00 },
  // 05:30 pre-dawn (bible)
  { h: 5.5, sunI: 0.14, sun: '#c9a5a8', hemiI: 0.55, hSky: '#6a6a92', hGnd: '#2a2422', env: 1.00,
    zen: '#2B3550', mid: '#4b4f6c', hor: '#9C8FA0', fogH: '#6F7480', fogZ: '#222a46', fogSun: '#a07a84',
    sea: '#8f8a9e', dens: 0.00145, mist: 0.0020, night: 0.68, ev: 0.90 },
  // 07:00 dawn (bible): cool shadows go violet-rose (R66 k)
  { h: 7.0, sunI: 2.60, sun: '#FFC9A0', hemiI: 0.30, hSky: '#9a8fb8', hGnd: '#4a3a30', env: 0.95,
    zen: '#6E88A8', mid: '#9aa5c0', hor: '#F2B98E', fogH: '#C9B3A6', fogZ: '#7d8db0', fogSun: '#ffb487',
    sea: '#F6D2B0', dens: 0.00135, mist: 0.0012, night: 0.04, ev: 0.35 },
  // 09:30 (L-03 new key)
  { h: 9.5, sunI: 4.50, sun: '#FFE6C8', hemiI: 0.16, hSky: '#93a8d0', hGnd: '#6a5a48', env: 0.88,
    zen: '#5579ad', mid: '#8ea8cc', hor: '#D3D5D8', fogH: '#CCD2D6', fogZ: '#6f8cb8', fogSun: '#ffdcb0',
    sea: '#F4EEE6', dens: 0.00118, mist: 0.0005, night: 0.00, ev: 0.05 },
  // 12:00 trade noon (bible): −0.3 EV comes from the Pans' biome row
  { h: 12.0, sunI: 5.10, sun: '#FFF6E8', hemiI: 0.15, hSky: '#9cb8de', hGnd: '#7a6a56', env: 0.85,
    zen: '#3F78B5', mid: '#7ca2cf', hor: '#BFD3E0', fogH: '#CFD8DE', fogZ: '#5c86bb', fogSun: '#fff0d8',
    sea: '#F2F4F5', dens: 0.00100, mist: 0.0003, night: 0.00, ev: 0.00 },
  // 16:30 (L-03 new key, the light analyst's row)
  { h: 16.5, sunI: 4.80, sun: '#FFD9A8', hemiI: 0.24, hSky: '#9a8cc0', hGnd: '#6e5640', env: 0.90,
    zen: '#6F7FB8', mid: '#a49fc6', hor: '#E2BBAE', fogH: '#C89A88', fogZ: '#7d82b0', fogSun: '#ffc58c',
    sea: '#F3DDCF', dens: 0.00118, mist: 0.0008, night: 0.00, ev: 0.10 },
  // 17:45 (L-03 new key)
  { h: 17.75, sunI: 4.20, sun: '#FFC48A', hemiI: 0.30, hSky: '#9a86b8', hGnd: '#6a4e3a', env: 0.95,
    zen: '#62679f', mid: '#a493b4', hor: '#EBA98C', fogH: '#CF9A80', fogZ: '#6f6f9f', fogSun: '#ffae6a',
    sea: '#F2CDB6', dens: 0.00122, mist: 0.0011, night: 0.00, ev: 0.15 },
  // 18:45 golden (bible; zenith #555079 per R66 k)
  { h: 18.75, sunI: 2.80, sun: '#FFB070', hemiI: 0.38, hSky: '#9a7fae', hGnd: '#5a4030', env: 1.00,
    zen: '#555079', mid: '#9a7c98', hor: '#F08A5A', fogH: '#D9A37E', fogZ: '#5c5a85', fogSun: '#ff9a50',
    sea: '#F2C0A0', dens: 0.00128, mist: 0.0013, night: 0.00, ev: 0.25 },
  // 19:20 (L-03 new key)
  { h: 19.333, sunI: 1.20, sun: '#FF9B52', hemiI: 0.45, hSky: '#8a76a6', hGnd: '#4a3428', env: 1.00,
    zen: '#4A4A7C', mid: '#7d6688', hor: '#D97A62', fogH: '#A67C78', fogZ: '#47466e', fogSun: '#ff8a48',
    sea: '#c79a92', dens: 0.00135, mist: 0.0015, night: 0.12, ev: 0.40 },
  // 19:45 dusk (bible)
  { h: 19.75, sunI: 0.35, sun: '#c46a5a', hemiI: 0.50, hSky: '#6f6a98', hGnd: '#33282a', env: 1.00,
    zen: '#2F3560', mid: '#574a6c', hor: '#C46A7A', fogH: '#7A6474', fogZ: '#2c2f52', fogSun: '#b06060',
    sea: '#8d7a8c', dens: 0.00140, mist: 0.0017, night: 0.40, ev: 0.70 },
  // hand-over trough 19:54
  { h: 19.9, sunI: 0.10, sun: '#8f7a96', hemiI: 0.55, hSky: '#5a5f88', hGnd: '#2a2426', env: 1.00,
    zen: '#252a50', mid: '#3e3a5c', hor: '#8a5a6c', fogH: '#5f5466', fogZ: '#22284a', fogSun: '#7a5068',
    sea: '#6a6078', dens: 0.00145, mist: 0.0017, night: 0.55, ev: 0.85 },
  { h: 21.0, sunI: 0.42, sun: '#9FB3D6', hemiI: 0.80, hSky: '#3a4c78', hGnd: '#1a1c22', env: 1.00,
    zen: '#121831', mid: '#182035', hor: '#222a40', fogH: '#262d40', fogZ: '#0e1426', fogSun: '#45527a',
    sea: '#30374d', dens: 0.00118, mist: 0.0013, night: 0.92, ev: 1.25 },
  // 23:00 night (bible): moon #9FB3D6
  { h: 23.0, sunI: 0.45, sun: '#9FB3D6', hemiI: 0.80, hSky: '#3a4c78', hGnd: '#161922', env: 1.00,
    zen: '#0D1220', mid: '#121a2f', hor: '#1B2438', fogH: '#20283A', fogZ: '#0c1222', fogSun: '#3d4a6a',
    sea: '#2a3146', dens: 0.00110, mist: 0.0012, night: 1.00, ev: 1.30 },
  { h: 24.0, sunI: 0.45, sun: '#9FB3D6', hemiI: 0.80, hSky: '#3a4c78', hGnd: '#161922', env: 1.00,
    zen: '#0D1220', mid: '#121a2f', hor: '#1B2438', fogH: '#20283A', fogZ: '#0c1222', fogSun: '#3d4a6a',
    sea: '#2a3146', dens: 0.00110, mist: 0.0012, night: 1.00, ev: 1.30 },
];

/** Calima, any hour (bible §2.3, §2.4, §9.3; LOOK L-14). */
const CALIMA = Object.freeze({
  zen: '#B9875C', hor: '#D2A274', fog: '#C98B4E', disc: '#F2A27E', sun: '#F7B276', haze: '#D58A63',
});

/**
 * Weather states (bible §2.3). Multipliers/targets applied on top of the hour key,
 * cross-faded by `setWeather`.
 *   sunMul/hemiMul  direct vs ambient    cloud/cloudDark  sky cover, underside darkness
 *   densMul         aerial density ×     mist             valley-mist ×
 *   rain/wet        streaks, wetness     wind/gust        Round-4 foliage strength units
 *   windMS          wind speed, m/s      shaft            screen-space shaft ×
 *   desat           pull toward grey     cloudShadow      ground cloud-shadow strength
 *   calima/fogbank  state weights        perception       Instrument sight ×
 *   shadowK         shadow strength      seaCloud         cloud-sea ×
 *   ev              exposure offset      bloomK           bloom strength ×
 */
const W_TRADE = { sunMul: 1.00, hemiMul: 1.00, cloud: 0.30, cloudDark: 0.30, densMul: 1.00, mist: 1.0, rain: 0.00, wet: 0.00, wind: 0.85, gust: 0.35, windMS: 5.5, shaft: 1.00, desat: 0.00, cloudShadow: 0.26, lightning: 0, calima: 0, fogbank: 0, perception: 1.0, shadowK: 1.00, seaCloud: 1.0, ev: 0.00, bloomK: 1.00 };
const WEATHER = {
  trade: W_TRADE,
  // bible: fog Calima Ochre ×4, coral disc, shadow strength 0.45, perception 0.5; L-14: EV +0.15, bloom ×1.25
  calima: { ...W_TRADE, sunMul: 0.70, hemiMul: 1.40, cloud: 0.05, cloudDark: 0.20, densMul: 4.00, mist: 0.6, windMS: 2.5, wind: 0.50, gust: 0.20, shaft: 0.35, cloudShadow: 0.00, calima: 1, perception: 0.5, shadowK: 0.45, seaCloud: 0.4, ev: 0.15, bloomK: 1.25 },
  // bible: height fog below 150 m ×3, perception 0.5 inside the bank
  fogbank: { ...W_TRADE, sunMul: 0.55, hemiMul: 1.40, cloud: 0.70, cloudDark: 0.35, densMul: 3.00, mist: 3.0, windMS: 1.5, wind: 0.35, gust: 0.15, shaft: 0.50, desat: 0.30, cloudShadow: 0.10, fogbank: 1, perception: 0.5, shadowK: 0.70, seaCloud: 1.6, ev: 0.10, bloomK: 0.80 },
  // bible: rare, rain on the windward side only, perception 0.8 (fog ×1.6 is this lane's)
  squall: { ...W_TRADE, sunMul: 0.30, hemiMul: 1.80, cloud: 0.92, cloudDark: 0.62, densMul: 1.60, mist: 1.4, rain: 0.80, wet: 0.70, windMS: 9.0, wind: 1.80, gust: 0.90, shaft: 0.15, desat: 0.50, cloudShadow: 0.12, perception: 0.8, shadowK: 0.80, seaCloud: 1.2, ev: 0.10, bloomK: 0.60 },
  // hidden Round-4 state: the kind-block's beam row stages fog density > 1.2 with no rain
  overcast: { ...W_TRADE, sunMul: 0.26, hemiMul: 1.85, cloud: 0.94, cloudDark: 0.62, densMul: 1.85, wet: 0.10, wind: 1.20, gust: 0.55, windMS: 7.0, shaft: 0.18, desat: 0.55, cloudShadow: 0.10, shadowK: 0.80, ev: 0.10, bloomK: 0.70 },
};
const BIBLE_STATES = Object.freeze(['trade', 'calima', 'fogbank', 'squall']);
const ALIAS = Object.freeze({ clear: 'trade', rain: 'squall', storm: 'squall' });

/**
 * Lighting by biome (bible §9.3), driven by the biome weights at the camera. Fog
 * colours are applied as a tint relative to the Pans' fog (#CFD8DE, which equals the
 * noon key), so the hour keys hold exactly in the Pans and every other biome shifts
 * by its own ratio. `bloom` offsets the bloom threshold (salt glare lowers it).
 */
const BIOMES = Object.freeze({
  pans:      { fog: '#CFD8DE', dens: 1.0, ev: -0.3, bloom: -0.10 },
  holds:     { fog: '#D9C3A2', dens: 1.3, ev: 0.0, bloom: 0.00 },
  malpais:   { fog: '#B9A08C', dens: 1.1, ev: 0.1, bloom: 0.00 },
  cloudline: { fog: '#8E9A8C', dens: 3.0, ev: 0.2, bloom: 0.15 },   // ×3 below 150 m only
  flank:     { fog: '#C7CDD2', dens: 1.2, ev: 0.0, bloom: 0.00 },
  caldera:   { fog: '#BFD0E6', dens: 0.6, ev: -0.1, bloom: 0.00 },
});
const BIOME_IDS = Object.freeze(Object.keys(BIOMES));
/** Round-4 terrain biome names → their CALIMA stand-ins until world-ground's island lands. */
const R4_BIOME = Object.freeze({ meadow: 'pans', marsh: 'flank', forest: 'cloudline', ash: 'malpais', scree: 'holds', snow: 'caldera' });
const CALIMA_EV = 0.15;          // L-03 (the bible's +0.2 is superseded by the look spec)
const CALIMA_BLOOM = -0.15;
/** EV may move at most this much per update (A-biome-grade ≤ 0.05 EV per frame). */
const EV_STEP_MAX = 0.04;
const EV_RATE = 0.6;             // EV per second when it is moving

/** NE trade wind from bearing 045: blows TOWARD 225 (SW). North is −Z, east is +X. */
const WIND_FROM = Object.freeze({ x: Math.SQRT1_2, z: -Math.SQRT1_2 });
/** The trade inversion parks a cloud deck at 110–150 m on the windward slopes (bible §2.3). */
const SEA_CLOUD = Object.freeze({ base: 105, top: 150, density: 0.065, near: -60, far: 140 });

/** Cascaded shadow splits as fractions of `maxFar` (A56: near texel ≤ 2 cm). */
const CSM_BREAKS = [0.11, 0.33, 1.0];
const CSM_MAX_FAR = 120;
const CSM_MAP_SIZE = 2048;
/** Aerial perspective: 1/H of the main layer and its reference height; the valley
 *  mist's 1/H (14 m) above its floor (L-05). */
const FOG_HEIGHT_FALLOFF = 1 / 140;
const FOG_HEIGHT_REF = 4;
const MIST_FALLOFF = 1 / 14;
const MIST_FLOOR = 0;
/** Per-channel extinction (L-05): golden/trade air and calima dust. */
const EXT_TRADE = Object.freeze([0.82, 1.00, 1.32]);
const EXT_CALIMA = Object.freeze([1.00, 0.97, 0.90]);
/** Grass chunks within this of the player cast, at most GRASS_CAST_MAX of them. */
const GRASS_CAST_RADIUS = 46;
const GRASS_CAST_MAX = 3;
/** Sky IBL (L-04): rebake every 0.1 game hours or on a 0.05 weather move. */
const IBL_HOURS = 0.1;
const IBL_WEATHER = 0.05;
/** W-08: meshes on this layer are drawn into the sky cube (the reflection probe). */
const REFLECT_LAYER = 6;

/* ---------------------- golden-weighted clock (L-11) ---------------------- */

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Sun elevation in degrees at an hour (continuous; negative at night). */
const sunElevDeg = (h) => 50 * Math.sin(Math.PI * (h - SUN_RISE) / (SUN_SET - SUN_RISE));
/** Clock rate by sun elevation: ×2.5 below −4°, ×0.5 at 2–22°, ×1 otherwise, blended over 2°. */
const goldenRate = (e) => 1 + 1.5 * (1 - smooth(-5, -3, e)) - 0.5 * smooth(1, 3, e) * (1 - smooth(21, 23, e));
/** Normaliser so a golden day is still `dayLengthSeconds` long: the mean of 1/rate over 24 h. */
const GOLDEN_NORM = (() => {
  let s = 0; const N = 4800;
  for (let i = 0; i < N; i++) s += 1 / goldenRate(sunElevDeg((i + 0.5) * 24 / N));
  return s / N;
})();

/* ========================================================================== */
/*                          global shader chunk patches                       */
/* ========================================================================== */

let _chunksPatched = false;

/**
 * Replace three's fog chunks with the L-05 model — a main exponential height layer,
 * a valley-mist layer, the windward cloud-sea slab, per-channel extinction and two
 * Henyey-Greenstein lobes toward the sun — and fold a cloud-shadow term into the
 * directional-light loop. With `calFogA.x == 0` the fog falls back to stock exp2.
 * Called AFTER `engine.enableCSM()` (CSM replaces the lighting chunks wholesale).
 */
function patchShaderChunks() {
  const C = THREE.ShaderChunk;
  patchLightChunks(C);
  if (_chunksPatched) return;
  _chunksPatched = true;

  C.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  uniform mat4 calViewInv;
  // wetness, gust, windX, windZ — world-ground's surface + foliage contract
  uniform vec4 calWeather;
#endif`;

  C.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorldPos = ( calViewInv * vec4( mvPosition.xyz, 1.0 ) ).xyz;
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
  // main layer: density, 1/H, reference height, (unused)
  uniform vec4 calFogA;
  // in-scatter strength, (unused), max opacity, (unused)
  uniform vec4 calFogB;
  // valley mist: density, 1/H, floor y, noise amount
  uniform vec4 calFogC;
  // cloud sea: density, base y, top y, (unused)
  uniform vec4 calFogD;
  // windward axis (x, z) and its ramp (near, far) in metres along it
  uniform vec4 calFogE;
  // two Henyey-Greenstein lobes: g1, weight1, g2, weight2
  uniform vec4 calFogG;
  uniform vec3 calFogExt;
  uniform vec3 calFogHorizon;
  uniform vec3 calFogZenith;
  uniform vec3 calFogSun;
  uniform vec3 calCloudSeaCol;
  uniform vec3 calSunDir;
  uniform vec3 calCamPos;
  // scale (1/m), coverage, strength, softness
  uniform vec4 calCloudA;
  uniform vec2 calCloudDrift;
  // wetness, gust, windX, windZ — world-ground's surface + foliage contract
  uniform vec4 calWeather;

  float calHash21( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
  float calNoise2( vec2 p ) {
    vec2 i = floor( p ), f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( calHash21( i ), calHash21( i + vec2( 1.0, 0.0 ) ), f.x ),
                mix( calHash21( i + vec2( 0.0, 1.0 ) ), calHash21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
  }
  float calCloudShadow() {
    if ( calCloudA.z <= 0.001 ) return 1.0;
    vec2 uv = vFogWorldPos.xz * calCloudA.x + calCloudDrift;
    float n = calNoise2( uv ) * 0.64 + calNoise2( uv * 2.17 + 13.7 ) * 0.36;
    float m = smoothstep( calCloudA.y, calCloudA.y + calCloudA.w, n );
    return 1.0 - m * calCloudA.z;
  }
  // closed-form mean of exp( -(y - ref) k ) along a ray from the camera to the fragment
  float calHeightAvg( float k, float ref, float dy ) {
    float b = exp( - ( calCamPos.y - ref ) * k );
    float e = dy * k;
    return abs( e ) < 0.002 ? b : b * ( 1.0 - exp( - e ) ) / e;
  }
  // Henyey-Greenstein phase relative to isotropic (its mean over the sphere is 1)
  float calHG( float g, float c ) {
    return ( 1.0 - g * g ) / pow( max( 1.0 + g * g - 2.0 * g * c, 1e-4 ), 1.5 );
  }
#endif`;

  C.fog_fragment = /* glsl */`
#ifdef USE_FOG
  if ( calFogA.x > 0.0 ) {
    vec3 calDv = vFogWorldPos - calCamPos;
    float calDist = max( length( calDv ), 1e-3 );
    vec3 calVd = calDv / calDist;
    float calDy = calDv.y;
    // main layer: analytic height fog (both endpoints matter: a ridge top reads
    // thinner than a valley floor at the same range)
    float calTauM = calFogA.x * vFogDepth * clamp( calHeightAvg( calFogA.y, calFogA.z, calDy ), 0.0, 12.0 );
    // valley mist: a second, shallow layer pooled over the valley floor, broken by
    // one 120 m noise read drifting downwind
    float calTauV = 0.0;
    if ( calFogC.x > 0.0 ) {
      float calMn = 1.0 + calFogC.w * ( calNoise2( vFogWorldPos.xz * ( 1.0 / 120.0 ) + calCloudDrift * 3.0 ) * 2.0 - 1.0 );
      calTauV = calFogC.x * vFogDepth * clamp( calHeightAvg( calFogC.y, calFogC.z, calDy ), 0.0, 40.0 ) * calMn;
    }
    // cloud sea: the windward slab between calFogD.y and calFogD.z, as optical
    // depth (no planes, no extra fill): the ray's length inside the slab
    float calTauC = 0.0;
    float calSeaLit = 1.0;
    if ( calFogD.x > 0.0 ) {
      // the deck's top heaps and sinks (± 22 m) where the ray crosses it: a lumpy sea of
      // cloud, brighter on the heaps, not a flat sheet
      float calTy = calFogD.z;
      vec2 calTop = calCamPos.xz + calDv.xz * clamp( ( calTy - calCamPos.y ) / ( abs( calDy ) > 0.05 ? calDy : 0.05 ), 0.0, 1.0 );
      float calHeap = calNoise2( calTop * ( 1.0 / 95.0 ) - calCloudDrift * 6.0 ) * 0.6 + calNoise2( calTop * ( 1.0 / 31.0 ) + 7.3 ) * 0.4;
      calTy += ( calHeap - 0.5 ) * 44.0;
      calSeaLit = 0.78 + 0.42 * calHeap;
      float calLo = min( calCamPos.y, vFogWorldPos.y ), calHi = max( calCamPos.y, vFogWorldPos.y );
      float calOv = max( 0.0, min( calHi, calTy ) - max( calLo, calFogD.y ) );
      float calAdy = abs( calDy );
      float calSeg = calAdy > 0.05 ? calDist * calOv / calAdy
        : ( ( calCamPos.y > calFogD.y && calCamPos.y < calFogD.z ) ? calDist : 0.0 );
      float calWw = smoothstep( calFogE.z, calFogE.w, dot( vFogWorldPos.xz, calFogE.xy ) );
      float calBreak = smoothstep( 0.18, 0.52, calNoise2( vFogWorldPos.xz * ( 1.0 / 260.0 ) - calCloudDrift * 2.0 ) + 0.22 );
      calTauC = calFogD.x * calSeg * calWw * calBreak;
    }

    float calUp = clamp( calVd.y * 1.55 + 0.10, 0.0, 1.0 );
    vec3 calSky = mix( calFogHorizon, calFogZenith, calUp * calUp );
    float calCos = dot( calVd, calSunDir );
    calSky += calFogSun * ( calHG( calFogG.x, calCos ) * calFogG.y + calHG( calFogG.z, calCos ) * calFogG.w ) * calFogB.x;

    vec3 calTau = ( calTauM + calTauV ) * calFogExt + vec3( calTauC );
    vec3 calTrans = clamp( exp( - calTau ), vec3( 1.0 - calFogB.z ), vec3( 1.0 ) );
    float calTot = calTauM + calTauV + calTauC;
    vec3 calIn = calTot > 1e-6 ? ( calSky * ( calTauM + calTauV ) + calCloudSeaCol * calSeaLit * calTauC ) / calTot : calSky;
    gl_FragColor.rgb = mix( calIn, gl_FragColor.rgb, calTrans );
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
 * Cloud shadows folded into the directional-light loop. Every branch of whatever
 * CSM installed funnels through getDirectionalLightInfo(), so one insertion covers all.
 */
let cloudShadowSites = 0;
function patchLightChunks(C) {
  const lf = C.lights_fragment_begin;
  if (lf.indexOf('calCloudShadow') < 0) {
    let n = 0;
    C.lights_fragment_begin = lf.replace(
      /getDirectionalLightInfo\(\s*(directionalLight|directionalLights\[\s*0\s*\])\s*,\s*directLight\s*\);/g,
      (m) => { n++; return `${m}\n\t\t\tdirectLight.color *= calCloudShadow();`; },
    );
    cloudShadowSites = n;
  }
  if (C.lights_pars_begin.indexOf('calCloudShadow') < 0) {
    C.lights_pars_begin = /* glsl */`
#ifndef USE_FOG
  float calCloudShadow() { return 1.0; }
#endif
` + C.lights_pars_begin;
  }
}

/* ========================================================================== */
/*                      the sky's baked tiling noise (L-10)                   */
/* ========================================================================== */

/**
 * 256² RGBA8, four independent 5-octave value-noise fbm fields that tile (lattice
 * periods 8 … 128 cells per tile). Built once at boot in ≈ 10 ms, deterministic, no
 * file and no licence row: it replaces the six procedural fbm calls the Round-4 sky
 * shaded under every pixel it covered. Mipmapped, so the plane-projected clouds stop
 * aliasing toward the horizon.
 */
function makeSkyNoise(N = 256) {
  const data = new Uint8Array(N * N * 4);
  const acc = new Float32Array(N * N);
  const hash = (x, y, s) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  for (let ch = 0; ch < 4; ch++) {
    acc.fill(0);
    let amp = 0.5;
    for (let o = 0; o < 5; o++) {
      const P = 8 << o;
      const lat = new Float32Array(P * P);
      for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) lat[j * P + i] = hash(i, j, ch * 977 + o * 131 + 7);
      for (let y = 0; y < N; y++) {
        const fy = (y / N) * P, y0 = Math.floor(fy), ty = fy - y0;
        const sy = ty * ty * (3 - 2 * ty);
        const r0 = (y0 % P) * P, r1 = ((y0 + 1) % P) * P;
        for (let x = 0; x < N; x++) {
          const fx = (x / N) * P, x0 = Math.floor(fx), tx = fx - x0;
          const sx = tx * tx * (3 - 2 * tx);
          const c0 = x0 % P, c1 = (x0 + 1) % P;
          const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx;
          const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
          acc[y * N + x] += amp * (a + (b - a) * sy);
        }
      }
      amp *= 0.5;
    }
    for (let i = 0; i < N * N; i++) data[i * 4 + ch] = Math.max(0, Math.min(255, Math.round((acc[i] / 0.96875) * 255)));
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.name = 'CAL.skyNoise';
  tex.needsUpdate = true;
  return tex;
}

/* ========================================================================== */
/*          display mirror: the linear colour that SHOWS as a target hex      */
/* ========================================================================== */

const _acesIn = [0.59719, 0.35458, 0.04823, 0.07600, 0.90834, 0.01566, 0.02840, 0.13383, 0.83777];
const _acesOut = [1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602];
const _rrt = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
const _oetf = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const _sat = (x) => Math.min(1, Math.max(0, x));
const _m3 = [0, 0, 0];
const det = (a0, a1, a2, b0, b1, b2, c0, c1, c2) => a0 * (b1 * c2 - b2 * c1) - a1 * (b0 * c2 - b2 * c0) + a2 * (b0 * c1 - b1 * c0);
/** CPU mirror of engine.js's OutputGradeShader (ACES at exposure, sRGB, contrast, lift,
 *  saturation, split tone; no vignette). `out` gets display sRGB 0..1. No allocation. */
function displayOf(lin, exposure, G, out) {
  const k = exposure / 0.6;
  const r = lin[0] * k, g = lin[1] * k, b = lin[2] * k;
  for (let i = 0; i < 3; i++) _m3[i] = _rrt(_acesIn[i * 3] * r + _acesIn[i * 3 + 1] * g + _acesIn[i * 3 + 2] * b);
  for (let i = 0; i < 3; i++) {
    out[i] = _sat(_acesOut[i * 3] * _m3[0] + _acesOut[i * 3 + 1] * _m3[1] + _acesOut[i * 3 + 2] * _m3[2]);
    out[i] = _oetf(out[i]);
  }
  if (!G) return out;
  const src0 = out[0], src1 = out[1], src2 = out[2];
  let c0 = (src0 - 0.5) * G.contrast + 0.5 + G.lift[0];
  let c1 = (src1 - 0.5) * G.contrast + 0.5 + G.lift[1];
  let c2 = (src2 - 0.5) * G.contrast + 0.5 + G.lift[2];
  const l = 0.2126 * c0 + 0.7152 * c1 + 0.0722 * c2;
  c0 = l + (c0 - l) * G.sat; c1 = l + (c1 - l) * G.sat; c2 = l + (c2 - l) * G.sat;
  const s = smooth(0.12, 0.86, l);
  c0 *= G.sh[0] + (G.hi[0] - G.sh[0]) * s;
  c1 *= G.sh[1] + (G.hi[1] - G.sh[1]) * s;
  c2 *= G.sh[2] + (G.hi[2] - G.sh[2]) * s;
  out[0] = _sat(src0 + (c0 - src0) * G.mix);
  out[1] = _sat(src1 + (c1 - src1) * G.mix);
  out[2] = _sat(src2 + (c2 - src2) * G.mix);
  return out;
}

/* ========================================================================== */

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _shaftSize = new THREE.Vector2();
const _c0 = new THREE.Color();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

/** Wrap an hour into [0, 24). */
const wrap24 = (h) => ((h % 24) + 24) % 24;

export class Environment {
  static get HOURS() { return HOURS; }
  static get KEYS() { return KEYS; }
  static get CALIMA() { return CALIMA; }
  static get BIOMES() { return BIOMES; }

  constructor(ctx) {
    this.ctx = ctx;
    const { scene, engine } = ctx;

    /* ----------------------------- clock ------------------------------- */
    const qs = ctx.params;
    const t0 = parseFloat(qs?.get?.('time'));
    const shot = !!qs?.has?.('shot');
    /** 0–24 game hours. A New Game starts at 07:00 (L-11); gates and look places at 17:45. */
    this._time = Number.isFinite(t0) ? wrap24(t0) : (shot ? HOURS.shot : HOURS.newGame);
    /** Real seconds for a full 24 h cycle; advances on SIM dt. */
    this.dayLengthSeconds = 1800;
    /** 'golden' weights the clock toward low sun (L-11, Kevin's Q1); 'even' is linear. */
    this.clock = qs?.get?.('clock') === 'even' ? 'even' : 'golden';
    /** `?shot=1` freezes the clock so every gate frame is deterministic. */
    this.timeFrozen = shot;
    this._phase = '';
    this._rest = null;
    this._t = 0;

    /* ---------------------------- weather ------------------------------ */
    this.weather = 'trade';
    this._wFrom = { ...WEATHER.trade };
    this._wTo = { ...WEATHER.trade };
    this._wK = 1;
    this._wRate = 1;
    this.w = { ...WEATHER.trade };   // resolved, per frame
    this.wetness = 0;
    this.wind = { x: -Math.SQRT1_2, z: Math.SQRT1_2, strength: 0.85, gust: 0 };
    this._windMS = 5.5;
    this._gustPhase = 0;
    this._lightning = { t: 0, k: 0, next: 4 };
    this._perception = 1;
    this._iblW = 0;              // weather "position" the IBL was last baked at

    /* ------------------------------ biome ------------------------------ */
    this._bw = { pans: 0, holds: 0, malpais: 0, cloudline: 0, flank: 0, caldera: 0,
      meadow: 0, forest: 0, snow: 0, marsh: 0, ash: 0, scree: 0 };
    /** The six CALIMA weights at the camera (Σ = 1). */
    this.biomeMix = { pans: 1, holds: 0, malpais: 0, cloudline: 0, flank: 0, caldera: 0 };
    this.biome = 'pans';
    this._biomeFog = new THREE.Color(1, 1, 1);    // linear ratio against the Pans' fog
    /** The live (eased) biome fog tint, linear, × the hour's fog. */
    this.biomeFogTint = this._biomeFog;
    this._biomeDens = 1;
    this._biomeEV = -0.3;
    this._biomeBloom = -0.10;
    this._biomeRatio = {};
    _c0.set(BIOMES.pans.fog);
    for (const id of BIOME_IDS) {
      _c1.set(BIOMES[id].fog);
      this._biomeRatio[id] = [_c1.r / _c0.r, _c1.g / _c0.g, _c1.b / _c0.b];
    }
    this._lastCam = new THREE.Vector3(NaN, NaN, NaN);

    /* ------------------------- exposure + bloom ------------------------ */
    this.exposureBase = ctx.renderer?.toneMappingExposure ?? 0.94;
    this.exposureEV = 0;
    this._evTarget = 0;
    this._bloomBase = engine?.bloom ? { threshold: engine.bloom.threshold, strength: engine.bloom.strength } : null;

    /* ------------------ shared uniform holders (see patch) -------------- */
    this.u = {
      calViewInv: { value: new THREE.Matrix4() },
      calFogA: { value: new THREE.Vector4(0.001, FOG_HEIGHT_FALLOFF, FOG_HEIGHT_REF, 0) },
      calFogB: { value: new THREE.Vector4(0.045, 0, 0.92, 0) },
      calFogC: { value: new THREE.Vector4(0.0003, MIST_FALLOFF, MIST_FLOOR, 0.45) },
      calFogD: { value: new THREE.Vector4(0, SEA_CLOUD.base, SEA_CLOUD.top, 0) },
      calFogE: { value: new THREE.Vector4(WIND_FROM.x, WIND_FROM.z, SEA_CLOUD.near, SEA_CLOUD.far) },
      calFogG: { value: new THREE.Vector4(0.72, 0.9, 0.20, 0.25) },
      calFogExt: { value: new THREE.Vector3(...EXT_TRADE) },
      calFogHorizon: { value: new THREE.Color('#CFD8DE') },
      calFogZenith: { value: new THREE.Color('#5c86bb') },
      calFogSun: { value: new THREE.Color('#fff0d8') },
      calCloudSeaCol: { value: new THREE.Color('#F2F4F5') },
      calSunDir: { value: new THREE.Vector3(0, 1, 0) },
      calCamPos: { value: new THREE.Vector3() },
      calCloudA: { value: new THREE.Vector4(1 / 190, 0.52, 0.26, 0.30) },
      calCloudDrift: { value: new THREE.Vector2() },
      calWeather: { value: new THREE.Vector4(0, 0, -Math.SQRT1_2, Math.SQRT1_2) },
      /** the direct sun (or moon) as the cascades light it: linear colour × intensity */
      calSunCol: { value: new THREE.Color() },
      /** the sun disc's HDR radiance (sunCol × 40 × visibility), for sea glitter (W-09) */
      calSunRad: { value: new THREE.Color() },
    };
    this.uniforms = this.u;

    /* ------------------------------ sun -------------------------------- */
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.nightFactor = 0;
    this.sunAboveHorizon = true;
    this._celestialColor = new THREE.Color('#ffc98a');
    this._celestialIntensity = 4.5;

    /** Public handle for colour and direction; NOT in the scene while cascades are live
     *  (a non-cascade directional light would be a second, shadowless sun). */
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
      this._sunInScene = false;
    } else {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      scene.add(this.sun, this.sun.target);
      this._sunInScene = true;
    }

    patchShaderChunks();

    /* ---------------------- ambient: hemi + sky IBL -------------------- */
    // L-03: the hemisphere light is the warm ground bounce only (0.10–0.14); the sky
    // fill comes from the sky-captured IBL (L-04) built below.
    this.hemi = new THREE.HemisphereLight('#8C8FC4', '#6e5640', 0.12);
    scene.add(this.hemi);

    /* ---------------------------- fog ---------------------------------- */
    // scene.fog stays a real FogExp2 so USE_FOG/FOG_EXP2 are defined (the fallback path).
    scene.fog = new THREE.FogExp2('#CFD8DE', 0.001);
    this.fogParams = this._buildFogContract();

    /* --------------------------- pooled lights ------------------------- */
    // Allocated at construction with intensity 0 so NUM_POINT_LIGHTS never changes.
    this.fireLight = new THREE.PointLight('#ff9a4e', 0, 14, 2);
    this.fireLight.castShadow = false;
    this.fireLight.position.set(0, 2, 0);
    scene.add(this.fireLight);
    /** F-1: the fire the pooled light follows (a brazier, W2). Null → the Round-4 camp fire. */
    this.fireSource = null;
    this.eyeLights = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight('#F2EAD3', 0, 14, 2);
      l.castShadow = false;
      scene.add(l);
      this.eyeLights.push(l);
    }
    // bible §9.1 lamp canon (never the Round-4 cyan): calm, wary, hostile
    this._lampCol = [new THREE.Color('#F2EAD3'), new THREE.Color('#B5E61D'), new THREE.Color('#FF2D8C')];
    this._campFire = null;
    this._campSearch = 0;
    this._borrowUntil = -1;

    /* ------------------------------ sky -------------------------------- */
    this._noise = makeSkyNoise(256);
    this._discLin = new THREE.Color(1, 0.5, 0.3);
    this._discFor = { exposure: -1, mix: -1 };
    this.sky = this._buildSky();
    scene.add(this.sky);
    /** L-15: the Round-4 far ridge rings are gone; the horizon is the sea and the
     *  sister isles world-ground carries inside the dome. */
    this.ridges = null;

    this.birds = this._buildBirds();
    scene.add(this.birds);
    this.motes = this._buildMotes();
    scene.add(this.motes);
    this.rain = this._buildRain();
    scene.add(this.rain);

    /** The island's water is world-ground's (`ctx.water`); bible §9.5 "no rivers":
     *  `RiverWater` is gone from this file (A-no-river). */
    this.water = ctx.water ?? null;

    /* ------------------- screen-space light shafts --------------------- */
    this._shafts = this._buildShafts();
    this._afterRender = () => this._renderShafts();
    engine?.onAfterRender?.push(this._afterRender);

    /** The fog's camera uniforms are those of the camera the frame is drawn with. */
    this._prevOBR = scene.onBeforeRender;
    const prevOBR = this._prevOBR;
    this._obr = (r, sc, camera, target) => {
      if (typeof prevOBR === 'function') prevOBR.call(scene, r, sc, camera, target);
      if (camera && camera.isCamera) {
        this.u.calCamPos.value.setFromMatrixPosition(camera.matrixWorld);
        this.u.calViewInv.value.copy(camera.matrixWorld);
      }
    };
    scene.onBeforeRender = this._obr;

    /* ------------------------ material registry ------------------------ */
    this._matSeen = new WeakSet();
    this._matCount = 0;
    this._grassCasters = [];
    this._scanClock = 0;
    this._scanAge = 0;
    this._registerScene();

    this._applyTime(0, true);

    /* -------------------------- sky IBL (L-04) -------------------------- */
    this._buildIBL();
    this._bakeIBL(true);
  }

  /* ====================================================================== */
  /*                          published contracts                           */
  /* ====================================================================== */

  get time() { return this._time; }
  set time(h) { this.setTime(h); }

  /** Snap the sky to an hour (0–24). Returns the wrapped value. */
  setTime(h) {
    this._time = wrap24(h);
    this._applyTime(0, true);
    if (this.timeFrozen && this._ibl) this._bakeIBL(true);
    return this._time;
  }

  /** 'night' | 'dawn' | 'day' | 'dusk' — for audio/AI/progression. */
  get phase() { return this._phase; }

  /** The pre-grade sky key colours now (linear, live objects): `top` overhead, `low` the
   *  sky's band at the sea line, `mid`, and `fog` (the aerial in-scatter at the sea line). */
  get skyKeys() {
    const su = this.sky.material.uniforms;
    return this._skyKeys || (this._skyKeys = { top: su.uZenith.value, low: su.uHorizon.value, mid: su.uMid.value, fog: this.u.calFogHorizon.value });
  }

  /** Instrument sight multiplier (bible §2.3): trade 1.0, calima 0.5, fogbank 0.5 inside
   *  the bank, squall 0.8; night 0.7; the smaller of weather and night applies. */
  get perceptionScale() { return this._perception; }

  /** Diagnostics for gates and the studio. */
  debugInfo() {
    const csm = this.ctx.engine?.csm;
    const near = csm?.lights?.[0]?.shadow?.camera;
    return {
      hour: this._time,
      clock: this.clock,
      phase: this._phase,
      weather: this.weather,
      perceptionScale: this._perception,
      wetness: this.wetness,
      wind: { ...this.wind, ms: this._windMS },
      nightFactor: this.nightFactor,
      sunDir: this.sunDir.toArray(),
      sunIntensity: this._celestialIntensity,
      hemiIntensity: this.hemi.intensity,
      envIntensity: this.ctx.scene.environmentIntensity,
      environment: this.ctx.scene.environment?.name ?? null,
      fogDensity: this.u.calFogA.value.x,
      mistDensity: this.u.calFogC.value.x,
      cloudSea: this.u.calFogD.value.x,
      transmittance300: this.fogParams.transmittance(300, 6, 6),
      biome: this.biome,
      biomeMix: { ...this.biomeMix },
      exposureEV: this.exposureEV,
      exposure: this.ctx.renderer?.toneMappingExposure,
      cascades: csm ? csm.cascades : 0,
      nearTexelM: near ? (near.right - near.left) / csm.shadowMapSize : null,
      cloudShadowSites,
      registeredMaterials: this._matCount,
      ibl: this._ibl ? { size: this._ibl.size, bakes: this._ibl.bakes, faceFrames: this._ibl.faceFrames } : null,
    };
  }

  get cloudShadowSites() { return cloudShadowSites; }

  /**
   * Rest-until hook. Advances the clock to `toHour` over `seconds` of real time,
   * emitting `rest-start` / `rest-end`.
   *   env.rest({ toHour: 6.2, seconds: 2.2 })  -> Promise<hour>
   *   env.rest(8)                              -> advance 8 game hours
   */
  rest(opts = {}) {
    const o = typeof opts === 'number' ? { hours: opts } : opts;
    const from = this._time;
    const to = Number.isFinite(o.toHour) ? wrap24(o.toHour) : wrap24(from + (o.hours ?? 8));
    let span = to - from;
    if (span <= 0.001) span += 24;
    const seconds = Math.max(0.1, o.seconds ?? 2.4);
    if (this._rest) { const prev = this._rest; this._rest = null; prev.resolve?.(this._time); }
    this.ctx.events?.emit?.('rest-start', { from, to, seconds });
    return new Promise((resolve) => {
      this._rest = { from, span, seconds, k: 0, resolve, to };
    });
  }

  get resting() { return !!this._rest; }

  /**
   * Cross-fade to a weather state.
   *   env.setWeather('calima')        2.5 s default fade
   *   env.setWeather('squall', 0)     snap (gates)
   * Round-4 names are accepted as aliases (clear → trade, rain/storm → squall).
   */
  setWeather(name, fadeSeconds = 2.5) {
    const id = ALIAS[name] || name;
    const target = WEATHER[id];
    if (!target) return this.weather;
    if (id === this.weather && this._wK >= 1) return this.weather;
    for (const k in this.w) this._wFrom[k] = this.w[k];
    for (const k in target) this._wTo[k] = target[k];
    this.weather = id;
    if (!(fadeSeconds > 0)) {
      for (const k in target) this.w[k] = target[k];
      this._wK = 1;
      this._applyTime(0, true);
      if (this.timeFrozen && this._ibl) this._bakeIBL(true);
    } else {
      this._wK = 0;
      this._wRate = 1 / Math.max(0.05, fadeSeconds);
    }
    this.ctx.events?.emit?.('weather-changed', { weather: id, fadeSeconds });
    return id;
  }

  get weatherStates() { return BIBLE_STATES.slice(); }
  get states() { return WEATHER; }
  get weatherParams() { return this.w; }

  /**
   * Wind at a point, m/s (the bible's NE trade, 5.5 m/s with coherent gusts; lulls at
   * dawn and dusk). With `out`, writes the velocity into out.x / out.z. No allocation.
   */
  windAt(x, z, out) {
    const t = this._t;
    const wx = this.wind.x, wz = this.wind.z;
    const along = x * wx + z * wz;
    const g = Math.sin(along * 0.045 - t * 1.3) * 0.6 + Math.sin((x * 0.031 - z * 0.027) + t * 0.7) * 0.4;
    const s = Math.max(0, this._windMS * (1 + 0.22 * g + 0.35 * this.wind.gust));
    if (out) { out.x = wx * s; out.z = wz * s; if ('y' in out) out.y = 0; }
    return s;
  }

  /**
   * P-04 (e): lend the pooled impact light for `ms` (it is eyeLights[1]); the borrower
   * sets position, colour and intensity. Returns the PointLight, or null while it is
   * already lent. 0 recompiles: the light count never changes.
   */
  borrowLight(ms = 90) {
    const now = this.ctx.engine?.wallTime ?? 0;
    if (now < this._borrowUntil) return null;
    this._borrowUntil = now + Math.max(0, ms) / 1000;
    const l = this.eyeLights[1];
    l.color.set('#FFB070'); l.distance = 6;
    return l;
  }

  /** CPU mirror of the shader's main + mist transmittance (green channel) between two points. */
  fogTransmittance(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    return this.fogParams.transmittance(Math.sqrt(dx * dx + dy * dy + dz * dz), a.y, b.y);
  }

  /** The aerial-perspective contract world-ground (and any hand-written material) reads. */
  _buildFogContract() {
    const u = this.u;
    const self = this;
    const avg = (k, ref, camY, fragY) => {
      const base = Math.exp(-(camY - ref) * k);
      const e = (fragY - camY) * k;
      return Math.abs(e) < 0.002 ? base : base * (1 - Math.exp(-e)) / e;
    };
    return {
      uniforms: u,
      get density() { return u.calFogA.value.x; },
      get heightFalloff() { return u.calFogA.value.y; },
      get heightRef() { return u.calFogA.value.z; },
      get inscatterStrength() { return u.calFogB.value.x; },
      get mist() { return u.calFogC.value; },
      get cloudSea() { return u.calFogD.value; },
      ext: u.calFogExt.value,
      horizon: u.calFogHorizon.value,
      zenith: u.calFogZenith.value,
      sun: u.calFogSun.value,
      sunDir: u.calSunDir.value,
      /** Beer-Lambert transmittance (green channel; main layer + valley mist at its mean
       *  noise) for a ray of `dist` m between two heights. */
      transmittance(dist, camY = FOG_HEIGHT_REF, fragY = camY) {
        const a = u.calFogA.value, c = u.calFogC.value;
        const tm = a.x * dist * Math.min(12, Math.max(0, avg(a.y, a.z, camY, fragY)));
        const tv = c.x > 0 ? c.x * dist * Math.min(40, Math.max(0, avg(c.y, c.z, camY, fragY))) : 0;
        return Math.exp(-(tm + tv) * u.calFogExt.value.y);
      },
      glsl: {
        parsVertex: 'varying vec3 vFogWorldPos; varying float vFogDepth; uniform mat4 calViewInv;',
        vertex: 'vFogDepth = -mvPosition.z; vFogWorldPos = (calViewInv * vec4(mvPosition.xyz,1.0)).xyz;',
        note: 'Built-in materials get this for free once registerMaterial() has seen them.',
      },
      register: (m) => self.registerMaterial(m),
    };
  }

  /** Opt a material into the cascades + aerial fog. */
  registerMaterial(mat) {
    if (!mat || this._matSeen.has(mat)) return mat;
    this._matSeen.add(mat);
    this._matCount++;
    const engine = this.ctx.engine;
    const u = this.u;
    const prev = typeof mat.onBeforeCompile === 'function' ? mat.onBeforeCompile : null;

    const lit = !!(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial
      || mat.isMeshLambertMaterial || mat.isMeshPhongMaterial || mat.isMeshToonMaterial);
    let csmFn = null;
    if (lit && engine?.csm) {
      engine.csmSetupMaterial(mat);
      if (mat.onBeforeCompile !== prev) {
        csmFn = mat.onBeforeCompile;
        mat.onBeforeCompile = prev;
      }
    }

    mat.onBeforeCompile = function (shader, renderer) {
      if (prev) prev.call(this, shader, renderer);
      if (csmFn) csmFn.call(this, shader, renderer);
      const su = shader.uniforms;
      for (const k in u) su[k] = u[k];
    };
    mat.needsUpdate = true;
    return mat;
  }

  /** One traversal: register every material, and set the shadow-caster policy. */
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

  _shadowPolicy(o) {
    if (o.userData.__calShadow) return;
    const n = o.name || '';
    if (n.startsWith('bushes-')) {
      o.userData.__calShadow = 1;
      o.castShadow = true;
      if (o.userData.__shadowCulled === true) o.userData.__shadowBase = true;
      return;
    }
    if (!n.startsWith('grass-chunk')) return;
    o.userData.__calShadow = 1;
    this._grassCasters.push(o);
  }

  /** The (at most GRASS_CAST_MAX) grass chunks near enough for a cascade to resolve. */
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
    const cut = Math.min(R2, GRASS_CAST_MAX >= 3 ? m2 : (GRASS_CAST_MAX === 2 ? m1 : m0));
    for (let i = 0; i < n; i++) {
      const o = list[i];
      const dx = o.position.x - px, dz = o.position.z - pz;
      const want = dx * dx + dz * dz <= cut;
      if (o.userData.__shadowCulled === true) o.userData.__shadowBase = want;
      else if (o.castShadow !== want) o.castShadow = want;
    }
  }

  /* ====================================================================== */
  /*                              sun position                              */
  /* ====================================================================== */

  /**
   * Direction TOWARD the celestial body for a given hour (L-11: bearing 70 + f × 220°,
   * south at 12:45, elevation 50·sin(πf)). Continuous outside [rise, set].
   */
  static direction(hour, out) {
    const f = (hour - SUN_RISE) / (SUN_SET - SUN_RISE);
    const elev = SUN_MAX_ELEV * Math.sin(Math.PI * f);
    const beta = SUN_AZ_START + f * SUN_AZ_SWEEP;
    const ce = Math.cos(elev), se = Math.sin(elev);
    return out.set(Math.sin(beta) * ce, se, -Math.cos(beta) * ce).normalize();
  }

  /** Game hours per real second at an hour, for the active clock. */
  clockRate(h = this._time) {
    const base = 24 / this.dayLengthSeconds;
    return this.clock === 'golden' ? base * goldenRate(sunElevDeg(h)) * GOLDEN_NORM : base;
  }

  /* ====================================================================== */
  /*                              per-frame                                 */
  /* ====================================================================== */

  update(dt, t) {
    const ctx = this.ctx;
    const engine = ctx.engine;
    this._t = t;

    /* ---- clock ---- */
    if (this._rest) {
      const r = this._rest;
      r.k = Math.min(1, r.k + dt / r.seconds);
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
      this._time = wrap24(this._time + dt * this.clockRate());
    }

    /* ---- weather cross-fade ---- */
    if (this._wK < 1) {
      this._wK = Math.min(1, this._wK + dt * this._wRate);
      const k = this._wK * this._wK * (3 - 2 * this._wK);
      for (const key in this._wTo) this.w[key] = this._wFrom[key] + (this._wTo[key] - this._wFrom[key]) * k;
    }

    /* ---- wind + gusts ---- */
    this._gustPhase += dt * (0.22 + this.w.wind * 0.16);
    const g = Math.sin(this._gustPhase) * 0.5 + Math.sin(this._gustPhase * 2.37 + 1.1) * 0.32
      + Math.sin(this._gustPhase * 0.61 - 0.4) * 0.18;
    this.wind.gust = Math.max(0, g) * this.w.gust;
    this.wetness += (this.w.wet - this.wetness) * Math.min(1, dt * (this.w.wet > this.wetness ? 0.55 : 0.12));

    this._updateLightning(dt);

    /* ---- biome at the camera ---- */
    const cam = ctx.camera;
    this._updateBiome(cam.position, dt);

    this._applyTime(dt, false);

    /* ---- animated uniforms ---- */
    const su = this.sky.material.uniforms;
    su.uTime.value = t;
    this._birdMat.uniforms.uTime.value = t;
    this._rainMat.uniforms.uTime.value = t;
    const mu = this._moteMat.uniforms;
    mu.uTime.value = t;
    mu.uFocal.value = ctx.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));

    /* ---- follow the camera / player ---- */
    this.u.calCamPos.value.copy(cam.position);
    this.u.calViewInv.value.copy(cam.matrixWorld);
    const p = ctx.player?.position;
    if (p) {
      this._updateGrassCasters(p.x, p.z);
      this.sky.position.set(p.x, 0, p.z);
      this.sun.position.copy(this.sunDir).multiplyScalar(300).add(p);
      this.sun.target.position.copy(p);
    }
    this.motes.position.set(cam.position.x, cam.position.y, cam.position.z);
    this.rain.position.set(cam.position.x, cam.position.y, cam.position.z);
    // squall: rain on the windward side only (bible §2.3)
    const ww = smooth(SEA_CLOUD.near, SEA_CLOUD.far, cam.position.x * WIND_FROM.x + cam.position.z * WIND_FROM.z);
    const rainAmt = this.w.rain * (this.weather === 'squall' ? 0.15 + 0.85 * ww : 1);
    this.rain.visible = rainAmt > 0.004;
    this._rainMat.uniforms.uAmount.value = rainAmt;
    this._rainMat.uniforms.uWind.value.set(this.wind.x * this._windMS * 0.18, 0, this.wind.z * this._windMS * 0.18);

    /* ---- cloud + mist drift (downwind) ---- */
    const cd = this.u.calCloudDrift.value;
    cd.x -= dt * this.wind.x * this.wind.strength * 0.0016;
    cd.y -= dt * this.wind.z * this.wind.strength * 0.0016;
    const sd = su.uDrift.value;
    sd.x += dt * this.wind.x * (6 + this._windMS * 1.6);
    sd.y += dt * this.wind.z * (6 + this._windMS * 1.6);
    if (Math.abs(sd.x) > 4.2e5) sd.x = 0;   // the noise tiles every 4.2 km × 100
    if (Math.abs(sd.y) > 4.2e5) sd.y = 0;
    mu.uDrift.value.set(this.wind.x * this._windMS, this.wind.z * this._windMS);

    /* ---- pooled lights ---- */
    this._updateNightLights(dt);

    /* ---- shadow policy: cascades multiply the shadow pass ---- */
    if (engine) {
      const tier = engine.tier || {};
      const want = Math.min(tier.shadowCullDistance ?? CSM_MAX_FAR, CSM_MAX_FAR);
      if (engine.shadowCullDistance !== want) engine.shadowCullDistance = want;
      const budget = Math.round((tier.shadowCasterBudget ?? 150) * 2.2);
      if (engine.shadowCasterBudget !== budget) engine.shadowCasterBudget = budget;
    }

    /* ---- sky IBL: one face per frame, PMREM on the seventh ---- */
    this._stepIBL();

    /* ---- material scan: machines and props land after boot ---- */
    this._scanAge += dt;
    this._scanClock -= dt;
    if (this._scanClock <= 0) {
      this._scanClock = this._scanAge < 45 ? 0.4 : 2.5;
      this._registerScene();
    }
  }

  /* ---------------------------------------------------------------- biome */

  /** The six CALIMA biome weights at (x, z) into `mix` (Σ = 1). Round-4 terrain names map
   *  through R4_BIOME until world-ground's island lands. No allocation. */
  _mixAt(x, z, mix) {
    const T = this.ctx.terrain;
    const bw = this._bw;
    let got = false;
    if (T && typeof T.biomeWeights === 'function') {
      for (const k in bw) bw[k] = 0;
      T.biomeWeights(x, z, bw);
      let s = 0;
      for (let i = 0; i < BIOME_IDS.length; i++) s += bw[BIOME_IDS[i]] || 0;
      if (s > 0.01) {
        for (let i = 0; i < BIOME_IDS.length; i++) mix[BIOME_IDS[i]] = (bw[BIOME_IDS[i]] || 0) / s;
        got = true;
      } else {
        for (let i = 0; i < BIOME_IDS.length; i++) mix[BIOME_IDS[i]] = 0;
        for (const r4 in R4_BIOME) { if (bw[r4] > 0) { mix[R4_BIOME[r4]] += bw[r4]; s += bw[r4]; } }
        if (s > 0.01) { for (let i = 0; i < BIOME_IDS.length; i++) mix[BIOME_IDS[i]] /= s; got = true; }
      }
    }
    if (!got) { for (let i = 0; i < BIOME_IDS.length; i++) mix[BIOME_IDS[i]] = 0; mix.pans = 1; }
    return mix;
  }

  /**
   * The unsmoothed per-biome grade at a point (bible §9.3): `{ biome, mix, fogTint: [r,g,b]
   * (linear, × the hour's fog), dens, ev, bloom }`. Gates and the studio read it; writes
   * into `out` when given.
   */
  gradeAt(x, z, y = 0, out) {
    const o = out || { biome: 'pans', mix: { pans: 1, holds: 0, malpais: 0, cloudline: 0, flank: 0, caldera: 0 }, fogTint: [1, 1, 1], dens: 1, ev: 0, bloom: 0 };
    this._mixAt(x, z, o.mix);
    this._aggregate(o.mix, y, o);
    return o;
  }

  _aggregate(mix, y, o) {
    const clLow = 1 - smooth(130, 170, y);
    let fr = 0, fg = 0, fb = 0, dens = 0, ev = 0, bloom = 0, best = -1;
    for (let i = 0; i < BIOME_IDS.length; i++) {
      const id = BIOME_IDS[i], k = mix[id];
      if (k > best) { best = k; o.biome = id; }
      if (k <= 0) continue;
      const B = BIOMES[id], R = this._biomeRatio[id];
      fr += R[0] * k; fg += R[1] * k; fb += R[2] * k;
      dens += (id === 'cloudline' ? 1 + (B.dens - 1) * clLow : B.dens) * k;
      ev += B.ev * k;
      bloom += B.bloom * k;
    }
    o.fogTint[0] = fr; o.fogTint[1] = fg; o.fogTint[2] = fb;
    o.dens = dens; o.ev = ev; o.bloom = bloom;
    return o;
  }

  /** Biome weights at the camera → fog tint, density × and the keyed EV (bible §9.3). */
  _updateBiome(pos, dt) {
    const G = this._gradeNow || (this._gradeNow = { biome: 'pans', mix: this.biomeMix, fogTint: [1, 1, 1], dens: 1, ev: 0, bloom: 0 });
    this._mixAt(pos.x, pos.z, this.biomeMix);
    this._aggregate(this.biomeMix, pos.y, G);
    this.biome = G.biome;
    const fr = G.fogTint[0], fg = G.fogTint[1], fb = G.fogTint[2], dens = G.dens, ev = G.ev, bloom = G.bloom;
    // a teleport (> 50 m in one update) is a cut: snap; walking eases (≈ 0.6 s)
    const jump = !(this._lastCam.distanceToSquared(pos) < 2500);
    this._lastCam.copy(pos);
    const a = jump || !(dt > 0) ? 1 : Math.min(1, dt / 0.6);
    this._biomeFog.r += (fr - this._biomeFog.r) * a;
    this._biomeFog.g += (fg - this._biomeFog.g) * a;
    this._biomeFog.b += (fb - this._biomeFog.b) * a;
    this._biomeDens += (dens - this._biomeDens) * a;
    this._biomeEV = ev;
    this._biomeBloom += (bloom - this._biomeBloom) * a;
    this._evSnap = jump;
  }

  /* ---------------------------------------------------------------- time */

  _applyTime(dt, snap) {
    const h = this._time;
    const k = this._keyAt(h);
    const w = this.w;
    const flash = this._lightning.k;
    const cal = w.calima;

    /* ---- celestial direction ---- */
    Environment.direction(h, this.sunDir);
    Environment.direction(h + MOON_PHASE_OFFSET, this.moonDir);
    const isMoon = h >= MOON_TAKES_OVER || h < SUN_TAKES_OVER;
    const dir = isMoon ? this.moonDir : this.sunDir;
    this.lightDir.copy(dir);
    this.sunAboveHorizon = this.sunDir.y > 0;
    this.nightFactor = k.night;
    // calima, read as daylight: 1 by day, falling with the sun
    const dayK = 0.10 + 0.90 * smooth(-0.06, 0.22, this.sunDir.y);

    /* ---- direct light ---- */
    _c0.copy(k.sunC);
    if (cal > 0.001 && !isMoon) _c0.lerp(this._calSun, cal);
    let intensity = k.sunI * (isMoon ? 1 : w.sunMul);
    if (flash > 0.001) {
      _c0.lerp(_c1.setRGB(0.86, 0.90, 1.0), Math.min(0.85, flash));
      intensity += flash * 5.5;
    }
    if (w.desat > 0.001) _c0.lerp(_c1.setRGB(0.80, 0.82, 0.86), w.desat * 0.92);
    this._celestialColor.copy(_c0);
    this._celestialIntensity = intensity;
    this.sun.color.copy(_c0);
    this.sun.intensity = intensity;
    this.u.calSunCol.value.copy(_c0).multiplyScalar(intensity);
    this.u.calSunDir.value.copy(this.sunDir.y > -0.05 ? this.sunDir : dir);

    if (this.csm) {
      _v0.copy(dir).multiplyScalar(-1);
      this.csm.lightDirection.copy(_v0);
      const lights = this.csm.lights;
      for (let i = 0; i < lights.length; i++) {
        lights[i].color.copy(_c0);
        lights[i].intensity = intensity;
        lights[i].shadow.intensity = w.shadowK;
      }
    } else {
      this.sun.position.copy(dir).multiplyScalar(300);
      this.sun.shadow.intensity = w.shadowK;
    }

    /* ---- ambient: warm ground bounce + the sky IBL ---- */
    _c1.copy(k.hSkyC);
    if (cal > 0.001) _c1.lerp(_c2.copy(this._calHor).multiplyScalar(dayK), cal * 0.7);
    if (w.desat > 0.001) _c1.lerp(_c2.setRGB(0.72, 0.74, 0.78), w.desat * 0.5);
    this.hemi.color.copy(_c1);
    _c1.copy(k.hGndC);
    if (w.desat > 0.001) _c1.lerp(_c2.setRGB(0.34, 0.35, 0.37), w.desat * 0.6);
    this.hemi.groundColor.copy(_c1);
    this.hemi.intensity = k.hemiI * w.hemiMul + flash * 0.8;
    this.ctx.scene.environmentIntensity = k.env * (0.6 + 0.4 * w.hemiMul);

    /* ---- fog / aerial perspective (L-05) ---- */
    const dens = k.dens * w.densMul * this._biomeDens;
    const fa = this.u.calFogA.value;
    fa.x = dens; fa.y = FOG_HEIGHT_FALLOFF; fa.z = FOG_HEIGHT_REF; fa.w = 0;
    const fc = this.u.calFogC.value;
    fc.x = k.mist * w.mist * Math.min(this._biomeDens, 1.6);
    fc.y = MIST_FALLOFF; fc.z = MIST_FLOOR; fc.w = 0.45;
    const fb = this.u.calFogB.value;
    fb.x = 0.045 * (1 - w.desat * 0.7) * (1 - k.night * 0.75) * (1 + cal * 0.4);
    fb.z = 0.92;
    const fgU = this.u.calFogG.value;
    fgU.x = 0.72 + 0.08 * cal; fgU.y = 0.9; fgU.z = 0.20; fgU.w = 0.25;
    const ext = this.u.calFogExt.value;
    ext.set(EXT_TRADE[0] + (EXT_CALIMA[0] - EXT_TRADE[0]) * cal,
      EXT_TRADE[1] + (EXT_CALIMA[1] - EXT_TRADE[1]) * cal,
      EXT_TRADE[2] + (EXT_CALIMA[2] - EXT_TRADE[2]) * cal);

    // fog colour: the hour's fog × the biome's tint; calima replaces it with ochre
    const fogH = this.u.calFogHorizon.value;
    fogH.copy(k.fogHC);
    fogH.r *= this._biomeFog.r; fogH.g *= this._biomeFog.g; fogH.b *= this._biomeFog.b;
    if (cal > 0.001) fogH.lerp(_c2.copy(this._calFog).multiplyScalar(dayK), cal);
    if (w.desat > 0.001) fogH.lerp(_c2.setRGB(0.62, 0.64, 0.67).multiplyScalar(0.25 + 0.75 * (1 - k.night)), w.desat * 0.6);
    const fogZ = this.u.calFogZenith.value;
    fogZ.copy(k.fogZC);
    if (cal > 0.001) fogZ.lerp(_c2.copy(this._calZen).multiplyScalar(dayK), cal);
    if (w.desat > 0.001) fogZ.lerp(_c2.setRGB(0.48, 0.51, 0.56).multiplyScalar(0.25 + 0.75 * (1 - k.night)), w.desat * 0.6);
    const fogS = this.u.calFogSun.value;
    fogS.copy(k.fogSunC);
    if (cal > 0.001) fogS.lerp(_c2.copy(this._calHaze).multiplyScalar(dayK), cal);
    const fog = this.ctx.scene.fog;
    fog.density = dens;
    fog.color.copy(fogH);

    /* ---- cloud sea (bible §2.3, §9.4): thickest at dawn, thinner at noon ---- */
    const seaHour = 0.55 + 0.45 * (1 - smooth(9.0, 12.0, h) * (1 - smooth(16.0, 19.5, h)));
    const fd = this.u.calFogD.value;
    fd.x = SEA_CLOUD.density * seaHour * w.seaCloud;
    this.u.calCloudSeaCol.value.copy(k.seaC);
    if (cal > 0.001) this.u.calCloudSeaCol.value.lerp(_c2.copy(this._calHor).multiplyScalar(dayK), cal * 0.8);

    /* ---- cloud shadows ---- */
    const ca = this.u.calCloudA.value;
    ca.x = 1 / 190;
    ca.y = 0.58 - w.cloud * 0.20;
    ca.z = w.cloudShadow * (1 - k.night) * (this.sunAboveHorizon ? 1 : 0);
    ca.w = 0.30;

    /* ---- wind ---- */
    const lull = 0.35 + 0.65 * smooth(7.2, 10.5, h) * (1 - smooth(17.5, 19.3, h));
    this._windMS = w.windMS * (w.calima > 0.5 || w.fogbank > 0.5 ? 1 : lull);
    this.wind.x = -WIND_FROM.x; this.wind.z = -WIND_FROM.z;
    this.wind.strength = w.wind * (0.6 + 0.4 * lull) + this.wind.gust;
    this.u.calWeather.value.set(this.wetness, this.wind.gust,
      this.wind.x * this.wind.strength, this.wind.z * this.wind.strength);

    /* ---- perception (bible §2.3) ---- */
    const camY = this.ctx.camera?.position?.y ?? 0;
    const outside = smooth(140, 170, camY);
    const wp = 1 - (1 - w.perception) * (1 - w.fogbank * outside);
    const np = 1 + (0.7 - 1) * k.night;
    this._perception = Math.min(wp, np);

    /* ---- exposure: hour + biome + weather, rate-limited (A-biome-grade) ---- */
    // a negative biome EV (the Pans' −0.3) is salt glare under a high sun (bible §2.4 lists it
    // in the noon row): it fades out as the sun drops toward golden hour
    const glare = smooth(0.25, 0.60, this.sunDir.y);
    const bEV = this._biomeEV < 0 ? this._biomeEV * glare : this._biomeEV;
    this._evTarget = k.ev + bEV + w.ev + cal * (CALIMA_EV - w.ev);
    if (snap || this._evSnap || !(dt > 0)) this.exposureEV = this._evTarget;
    else {
      const step = Math.min(EV_STEP_MAX, EV_RATE * dt);
      const d = this._evTarget - this.exposureEV;
      this.exposureEV += Math.max(-step, Math.min(step, d));
    }
    const r = this.ctx.renderer;
    if (r) {
      const e = this.exposureBase * Math.pow(2, this.exposureEV);
      if (Math.abs(r.toneMappingExposure - e) > 1e-5) r.toneMappingExposure = e;
    }
    this._applyBloom(cal);

    /* ---- sky uniforms ---- */
    const su = this.sky.material.uniforms;
    su.uSunDir.value.copy(this.sunDir);
    su.uMoonDir.value.copy(this.moonDir);
    su.uSunCol.value.copy(k.sunC);
    if (cal > 0.001) su.uSunCol.value.lerp(this._calSun, cal);
    su.uHorizon.value.copy(k.horC);
    su.uMid.value.copy(k.midC);
    su.uZenith.value.copy(k.zenC);
    su.uNight.value = k.night;
    su.uCloud.value.set(w.cloud, w.cloudDark, w.desat, flash);
    su.uStorm.value = w.rain;
    su.uCalima.value.set(cal, dayK);
    su.uCalZen.value.copy(this._calZen);
    su.uCalHor.value.copy(this._calHor);
    su.uFogDens.value = dens / 0.001;
    su.uGround.value.copy(k.hGndC);
    if (cal > 0.001) this._updateDisc(r);
    su.uDisc.value.copy(this._discLin);
    // the sun disc's HDR radiance, published for the sea's glitter path (W-09)
    const vis = (1 - k.night) * smooth(-0.02, 0.04, this.sunDir.y) * (1 - w.cloud * 0.5) * (1 - cal);
    this.u.calSunRad.value.copy(k.sunC).multiplyScalar(40 * vis);

    /* ---- motes (P-09) ---- */
    const mu = this._moteMat.uniforms;
    mu.uMix.value.set((1 - k.night) * (1 - cal) * (1 - w.rain), cal * dayK, 0);
    mu.uSunDir.value.copy(this.sunDir);
    mu.uSunCol.value.copy(su.uSunCol.value);
    mu.uDust.value.copy(this._calFog);

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

  /** Bloom threshold by biome and weather, strength by weather; written only on change,
   *  relative to the tier's own values (look-post owns the base, L-07). */
  _applyBloom(cal) {
    const b = this.ctx.engine?.bloom, base = this._bloomBase;
    if (!b || !base) return;
    const th = base.threshold + this._biomeBloom * (1 - cal) + CALIMA_BLOOM * cal;
    const st = base.strength * this.w.bloomK;
    if (Math.abs(b.threshold - th) > 1e-4) b.threshold = th;
    if (Math.abs(b.strength - st) > 1e-4) b.strength = st;
  }

  /**
   * The calima disc's linear colour, solved so that it SHOWS as #F2A27E through the
   * output chain (engine.look.invert when look-post publishes it; otherwise a CPU mirror
   * of the ACES grade, by damped Newton). Re-solved only when the exposure moves.
   */
  _updateDisc(renderer) {
    const eng = this.ctx.engine;
    const E = renderer?.toneMappingExposure ?? 1;
    const gu = eng?.grade?.uniforms;
    const gm = gu?.uGradeMix?.value ?? 0;
    if (Math.abs(E - this._discFor.exposure) < 1e-4 && gm === this._discFor.mix) return;
    this._discFor.exposure = E; this._discFor.mix = gm;
    const tgt = this._discTarget;   // display sRGB 0..1
    if (typeof eng?.look?.invert === 'function') {
      const q = this._solveQ; q[0] = tgt[0]; q[1] = tgt[1]; q[2] = tgt[2];
      const o = eng.look.invert(q);
      if (o && o.length >= 3) { this._discLin.setRGB(o[0], o[1], o[2]); return; }
    }
    const G = gu ? this._gradeMirror(gu) : null;
    const x = this._solveX, y = this._solveY, xp = this._solveXp, yp = this._solveYp, J = this._solveJ, r = this._solveR;
    for (let i = 0; i < 3; i++) x[i] = Math.pow(tgt[i], 2.2) / E * 0.6;
    // full-Jacobian Newton (ACES mixes the channels), step-limited to stay ≥ 0
    for (let it = 0; it < 40; it++) {
      displayOf(x, E, G, y);
      for (let i = 0; i < 3; i++) r[i] = y[i] - tgt[i];
      if (Math.abs(r[0]) + Math.abs(r[1]) + Math.abs(r[2]) < 1e-5) break;
      for (let j = 0; j < 3; j++) {
        xp[0] = x[0]; xp[1] = x[1]; xp[2] = x[2];
        const hs = Math.max(1e-5, x[j] * 1e-3);
        xp[j] += hs;
        displayOf(xp, E, G, yp);
        for (let i = 0; i < 3; i++) J[i * 3 + j] = (yp[i] - y[i]) / hs;
      }
      const D = det(J[0], J[1], J[2], J[3], J[4], J[5], J[6], J[7], J[8]);
      if (!(Math.abs(D) > 1e-12)) break;
      const d0 = det(r[0], J[1], J[2], r[1], J[4], J[5], r[2], J[7], J[8]) / D;
      const d1 = det(J[0], r[0], J[2], J[3], r[1], J[5], J[6], r[2], J[8]) / D;
      const d2 = det(J[0], J[1], r[0], J[3], J[4], r[1], J[6], J[7], r[2]) / D;
      let st = 1;
      if (x[0] - d0 < 0) st = Math.min(st, 0.9 * x[0] / Math.max(d0, 1e-9));
      if (x[1] - d1 < 0) st = Math.min(st, 0.9 * x[1] / Math.max(d1, 1e-9));
      if (x[2] - d2 < 0) st = Math.min(st, 0.9 * x[2] / Math.max(d2, 1e-9));
      x[0] = Math.max(0, x[0] - st * d0); x[1] = Math.max(0, x[1] - st * d1); x[2] = Math.max(0, x[2] - st * d2);
    }
    this._discLin.setRGB(x[0], x[1], x[2]);
  }

  _gradeMirror(gu) {
    const G = this._G || (this._G = { contrast: 1, sat: 1, mix: 1, lift: [0, 0, 0], sh: [1, 1, 1], hi: [1, 1, 1] });
    G.contrast = gu.uContrast?.value ?? 1;
    G.sat = gu.uSaturation?.value ?? 1;
    G.mix = gu.uGradeMix?.value ?? 1;
    const L = gu.uLift?.value, S = gu.uShadowTint?.value, H = gu.uHighlightTint?.value;
    if (L) { G.lift[0] = L.x; G.lift[1] = L.y; G.lift[2] = L.z; }
    if (S) { G.sh[0] = S.r; G.sh[1] = S.g; G.sh[2] = S.b; }
    if (H) { G.hi[0] = H.r; G.hi[1] = H.g; G.hi[2] = H.b; }
    return G;
  }

  /** Interpolate the keyframe table at `h`, writing into a reused record. */
  _keyAt(h) {
    const K = this._key || (this._key = {
      sunI: 0, hemiI: 0, env: 0, dens: 0, mist: 0, night: 0, ev: 0,
      sunC: new THREE.Color(), hSkyC: new THREE.Color(), hGndC: new THREE.Color(),
      zenC: new THREE.Color(), midC: new THREE.Color(), horC: new THREE.Color(),
      fogHC: new THREE.Color(), fogZC: new THREE.Color(), fogSunC: new THREE.Color(), seaC: new THREE.Color(),
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
        k.seaCol = new THREE.Color(k.sea);
      }
    }
    if (!this._calSun) {
      this._calSun = new THREE.Color(CALIMA.sun);
      this._calZen = new THREE.Color(CALIMA.zen);
      this._calHor = new THREE.Color(CALIMA.hor);
      this._calFog = new THREE.Color(CALIMA.fog);
      this._calHaze = new THREE.Color(CALIMA.haze);
      _c2.set(CALIMA.disc);
      _c2.convertLinearToSRGB();
      this._discTarget = [_c2.r, _c2.g, _c2.b];
      this._solveX = [0, 0, 0]; this._solveY = [0, 0, 0]; this._solveXp = [0, 0, 0]; this._solveYp = [0, 0, 0];
      this._solveJ = new Float64Array(9); this._solveR = [0, 0, 0]; this._solveQ = [0, 0, 0];
    }
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const s = THREE.MathUtils.clamp((h - a.h) / Math.max(1e-4, b.h - a.h), 0, 1);
    K.sunI = a.sunI + (b.sunI - a.sunI) * s;
    K.hemiI = a.hemiI + (b.hemiI - a.hemiI) * s;
    K.env = a.env + (b.env - a.env) * s;
    K.dens = a.dens + (b.dens - a.dens) * s;
    K.mist = a.mist + (b.mist - a.mist) * s;
    K.night = a.night + (b.night - a.night) * s;
    K.ev = a.ev + (b.ev - a.ev) * s;
    K.sunC.copy(a.sunCol).lerp(b.sunCol, s);
    K.hSkyC.copy(a.hSkyCol).lerp(b.hSkyCol, s);
    K.hGndC.copy(a.hGndCol).lerp(b.hGndCol, s);
    K.zenC.copy(a.zenCol).lerp(b.zenCol, s);
    K.midC.copy(a.midCol).lerp(b.midCol, s);
    K.horC.copy(a.horCol).lerp(b.horCol, s);
    K.fogHC.copy(a.fogHCol).lerp(b.fogHCol, s);
    K.fogZC.copy(a.fogZCol).lerp(b.fogZCol, s);
    K.fogSunC.copy(a.fogSunCol).lerp(b.fogSunCol, s);
    K.seaC.copy(a.seaCol).lerp(b.seaCol, s);
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
    L.k = Math.max(0, L.k - dt * (L.k > 0.55 ? 7.5 : 3.2));
    if (L.k > 0.18 && L.k < 0.24) L.k = 0.55;
  }

  /**
   * Pooled point lights, allocated at boot so the light count never changes: the fire
   * (F-1 rule) and two that follow the nearest live Instruments' lamps in the bible's
   * lamp colours. eyeLights[1] doubles as the borrowed impact light (P-04 e).
   */
  _updateNightLights(dt) {
    const night = this.nightFactor;
    const ctx = this.ctx;
    const now = ctx.engine?.wallTime ?? 0;

    /* F-1: intensity max(night, a dusk ramp from 18:30, 1 within 12 m) × 26 × flicker,
       over 14 m; beyond 40 m in daylight it is 0. */
    if (!this.fireSource && !this._campFire && (this._campSearch -= dt) <= 0) {
      this._campSearch = 1.5;
      const camp = ctx.camp?.group || ctx.scene.getObjectByName('hunter-camp');
      camp?.traverse((o) => {
        if (!this._campFire && o.isPointLight && o !== this.fireLight) this._campFire = o;
      });
    }
    const src = this.fireSource || this._campFire;
    if (src) {
      src.getWorldPosition(this.fireLight.position);
      const d = this.fireLight.position.distanceTo(ctx.camera.position);
      const dusk = smooth(18.5, 19.75, this._time) * (this._time < 22 ? 1 : 0);
      const near = 1 - smooth(12, 14, d);
      let k = Math.max(night, dusk, near);
      if (d > 40 && night < 0.05 && dusk < 0.05) k = 0;
      const flick = 0.82 + Math.sin(now * 9.1) * 0.10 + Math.sin(now * 21.7) * 0.06;
      this.fireLight.intensity = k * 26 * flick;
    } else {
      this.fireLight.intensity = 0;
    }
    this.fireLight.distance = 14;

    const lent = now < this._borrowUntil;
    const list = ctx.machines?.list;
    if (!list || !list.length) {
      this.eyeLights[0].intensity = 0;
      if (!lent) this.eyeLights[1].intensity = 0;
      return;
    }
    const p = ctx.camera.position;
    let a = null, b = null, da = 1e9, db = 1e9;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m || m.alive === false || !m.position) continue;
      const dx = m.position.x - p.x, dz = m.position.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < da) { b = a; db = da; a = m; da = d; }
      else if (d < db) { b = m; db = d; }
    }
    for (let i = 0; i < this.eyeLights.length; i++) {
      if (i === 1 && lent) continue;
      const l = this.eyeLights[i];
      const m = i === 0 ? a : b;
      if (!m || (i === 0 ? da : db) > 3600) { l.intensity = 0; continue; }
      l.position.set(m.position.x, m.position.y + (m.eyeHeight ?? 1.5), m.position.z);
      const st = m.state;
      const c = (st === 'attack' || st === 'alert') ? 2 : (st === 'suspicious' || st === 'search') ? 1 : 0;
      l.color.copy(this._lampCol[c]);
      l.intensity = night * 3.2;
      l.distance = 14;
    }
  }

  /* ====================================================================== */
  /*                         sky-captured IBL (L-04)                        */
  /* ====================================================================== */

  /**
   * The sky dome alone (a second mesh sharing the dome's geometry and material, in a
   * scene of its own, so no other system's onBeforeRender runs) rendered by six cube
   * cameras into a HalfFloat cube, one face per frame, then filtered by PMREM into one
   * pre-allocated target published as `scene.environment` ('CAL.skyIBL'). The Round-4
   * RoomEnvironment and its 256 PMREM are gone.
   */
  _buildIBL() {
    const r = this.ctx.renderer;
    if (!r) return;
    const q = this.ctx.engine?.quality;
    const size = q === 'low' ? 64 : q === 'ultra' ? 256 : 128;
    const cubeRT = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false, depthBuffer: true });
    cubeRT.texture.name = 'CAL.skyCube';
    const cubeCam = new THREE.CubeCamera(1, 3000, cubeRT);
    // CubeCamera orients its six cameras only inside update(); faces are rendered one by
    // one here, so the orientation is set once by hand (else all six look down -Z)
    cubeCam.coordinateSystem = r.coordinateSystem;
    cubeCam.updateCoordinateSystem();
    cubeCam.updateMatrixWorld(true);
    const scene = new THREE.Scene();
    const dome = new THREE.Mesh(this.sky.geometry, this.sky.material);
    dome.frustumCulled = false;
    dome.layers.set(REFLECT_LAYER);   // the cube cameras see the REFLECT layer only
    scene.add(dome);
    const pmrem = new THREE.PMREMGenerator(r);
    this._ibl = { size, cubeRT, cubeCam, scene, dome, pmrem, rt: null, face: 0, pending: false,
      lastH: -99, bakes: 0, faceFrames: 0 };
    this.ctx.engine?.registerRenderTarget?.('env:skyCube', cubeRT);
    this.skyCube = cubeRT.texture;
    for (const c of cubeCam.children) c.layers.set(REFLECT_LAYER);
    /**
     * W-08: the REFLECT layer. A lane opts a cheap mesh (terrain LOD2, a landmark's LOD1,
     * a settlement's LOD1; ≤ 10 draws in all) into the sky cube with `reflect.add(obj)`;
     * the cube then re-centres on the camera on a 25 m move and renders those meshes over
     * the dome, so the sky IBL and `skyCube` (the probe water samples) carry the island.
     * With nothing added the cube is the sky alone, centred on the origin, at no extra cost.
     */
    const self = this;
    this.reflect = {
      layer: REFLECT_LAYER,
      count: 0,
      center: cubeCam.position,
      add(obj) { obj.traverse((o) => o.layers.enable(REFLECT_LAYER)); this.count++; self._ibl.lastH = -99; return obj; },
      remove(obj) { obj.traverse((o) => o.layers.disable(REFLECT_LAYER)); this.count = Math.max(0, this.count - 1); return obj; },
    };
  }

  _renderIBLFace(face) {
    const I = this._ibl, r = this.ctx.renderer;
    const su = this.sky.material.uniforms;
    const prevT = r.getRenderTarget(), prevF = r.getActiveCubeFace(), prevM = r.getActiveMipmapLevel();
    const prevAuto = r.autoClear;
    r.autoClear = true;
    su.uIbl.value = 1;
    r.setRenderTarget(I.cubeRT, face);
    r.render(I.scene, I.cubeCam.children[face]);
    su.uIbl.value = 0;
    if (this.reflect.count > 0) {
      // the island over the dome: the main scene through a REFLECT-only camera, shadow
      // maps left as they are (no re-render of the cascades for a probe face)
      const sm = r.shadowMap.autoUpdate;
      r.shadowMap.autoUpdate = false;
      r.autoClear = false;
      r.clearDepth();
      r.render(this.ctx.scene, I.cubeCam.children[face]);
      r.shadowMap.autoUpdate = sm;
    }
    r.setRenderTarget(prevT, prevF, prevM);
    r.autoClear = prevAuto;
  }

  _filterIBL() {
    const I = this._ibl;
    const first = !I.rt;
    I.rt = I.pmrem.fromCubemap(I.cubeRT.texture, I.rt);
    if (first) {
      I.rt.texture.name = 'CAL.skyIBL';
      this.ctx.engine?.registerRenderTarget?.('env:pmrem', I.rt);
      if (I.pmrem._pingPongRenderTarget) this.ctx.engine?.registerRenderTarget?.('env:pmremPingPong', I.pmrem._pingPongRenderTarget);
      this.skyIBL = I.rt.texture;
      this.ctx.scene.environment = I.rt.texture;
    }
    I.bakes++;
  }

  /** All six faces + the PMREM now (boot, and every `setTime`/`setWeather` under `?shot`). */
  _bakeIBL() {
    const I = this._ibl;
    if (!I) return;
    for (let f = 0; f < 6; f++) this._renderIBLFace(f);
    this._filterIBL();
    I.pending = false; I.face = 0;
    I.lastH = this._time; this._iblW = this._weatherPos();
  }

  /**
   * Gate / studio probe: the sky cube's linear radiance toward `dir` (× `scale` on the way
   * through an 8-bit target, so values up to 1/scale read). Allocates and disposes a 4×4
   * target per call; never called by the frame.
   */
  sampleSkyCube(dir, scale = 0.5) {
    const I = this._ibl, r = this.ctx.renderer;
    if (!I || !r) return null;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, depthBuffer: false });
    const mat = new THREE.ShaderMaterial({
      uniforms: { tCube: { value: I.cubeRT.texture }, uDir: { value: new THREE.Vector3().copy(dir).normalize() }, uScale: { value: scale } },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform samplerCube tCube; uniform vec3 uDir; uniform float uScale; void main() { gl_FragColor = vec4(textureCube(tCube, uDir).rgb * uScale, 1.0); }',
      depthTest: false, depthWrite: false,
    });
    const quad = new FullScreenQuad(mat);
    const prev = r.getRenderTarget();
    r.setRenderTarget(rt);
    quad.render(r);
    const px = new Uint8Array(4 * 16);
    r.readRenderTargetPixels(rt, 0, 0, 4, 4, px);
    r.setRenderTarget(prev);
    quad.dispose(); mat.dispose(); rt.dispose();
    return [px[0] / 255 / scale, px[1] / 255 / scale, px[2] / 255 / scale];
  }

  /** A scalar that moves when the sky's weather moves (for the 0.05 rebake rule). */
  _weatherPos() { const w = this.w; return w.calima + w.cloud * 0.6 + w.desat + w.fogbank * 0.5 + w.rain * 0.3; }

  /** Round robin: one face per frame, the PMREM on the seventh; rebake every 0.1 h or on a
   *  0.05 weather move. */
  _stepIBL() {
    const I = this._ibl;
    if (!I) return;
    if (this.reflect.count > 0) {
      const c = this.ctx.camera.position;
      if (I.cubeCam.position.distanceToSquared(c) > 625 && !I.pending) {
        I.cubeCam.position.copy(c); I.cubeCam.updateMatrixWorld(true); I.lastH = -99;
      }
    }
    if (!I.pending) {
      let dh = Math.abs(this._time - I.lastH); if (dh > 12) dh = 24 - dh;
      if (dh < IBL_HOURS && Math.abs(this._weatherPos() - this._iblW) < IBL_WEATHER) return;
      I.pending = true; I.face = 0; I.lastH = this._time; this._iblW = this._weatherPos();
    }
    if (I.face < 6) { this._renderIBLFace(I.face++); I.faceFrames++; return; }
    this._filterIBL();
    I.pending = false;
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
    rt.texture.name = 'CAL.lightShafts';
    this.ctx.engine?.registerRenderTarget?.('env:shafts', rt);

    const gather = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDepth: { value: null },
        uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
        uColor: { value: new THREE.Color('#ffb066') },
        uParams: { value: new THREE.Vector4(0.91, 0.30, 1.0, 1.78) },
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
            float d = texture2D(tDepth, clamp(c, 0.0, 1.0)).x;
            float sky = step(0.99995, d);
            vec2 r = (c - uSunUv) * vec2(uParams.w, 1.0);
            acc += sky * exp(-dot(r, r) * 18.0) * illum;
            illum *= uParams.x;
          }
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

  /** Runs from `engine.onAfterRender`, after the composer resolved the frame. Two draws,
   *  quarter resolution. (L-08 moves this into HDR before the grade in W2.) */
  _renderShafts() {
    const s = this._shafts;
    const engine = this.ctx.engine;
    const renderer = this.ctx.renderer;
    const depth = engine?.depthTexture;
    if (!depth) return;

    const cam = this.ctx.camera;
    const sun = this.sunDir;
    if (sun.y <= 0.015 || this.nightFactor > 0.85) return;
    cam.getWorldDirection(_v1);
    const facing = _v1.dot(sun);
    if (facing <= 0.02) return;
    const strength = Math.min(1, facing * 1.35) * (1 - this.nightFactor)
      * this.w.shaft * Math.min(1, sun.y * 5.0 + 0.15);
    if (strength < 0.02) return;

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

  /* ========================= ambient air (P-09) ========================== */

  /**
   * One Points draw, a type per point: 170 sunlit pollen and salt glints in a 24 m box
   * (off at night), 600 calima dust motes in a 44 m box drifting downwind at the wind's
   * speed (2–4 m/s in calima), and 240 slots for Malpaís embers (world-props registers
   * emitters in W3; weight 0 until then). Alpha × (0.4 + 2.2 × pow(view·sun, 4)).
   */
  _buildMotes() {
    const NP = 170, ND = 600, NE = 240, N = NP + ND + NE;
    const rand = (() => { let s = 977; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const type = i < NP ? 0 : i < NP + ND ? 1 : 2;
      const box = type === 1 ? 44 : 24;
      const hgt = type === 1 ? 14 : 9;
      pos[i * 3] = (rand() - 0.5) * box;
      pos[i * 3 + 1] = rand() * hgt;
      pos[i * 3 + 2] = (rand() - 0.5) * box;
      seed[i * 2] = rand();
      seed[i * 2 + 1] = type;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6, 0), 40);

    this._moteMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uFocal: { value: 800 },
        uMix: { value: new THREE.Vector3(1, 0, 0) },        // pollen, dust, embers
        uDrift: { value: new THREE.Vector2(-3.9, 3.9) },    // wind velocity, m/s
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
        uDust: { value: new THREE.Color(CALIMA.fog) },
      },
      vertexShader: /* glsl */ `
        attribute vec2 aSeed;
        uniform float uTime, uFocal;
        uniform vec3 uMix;
        uniform vec2 uDrift;
        uniform vec3 uSunDir;
        varying float vA;
        varying float vType;
        void main() {
          float s = aSeed.x;
          float type = aSeed.y;
          float w = type < 0.5 ? uMix.x : type < 1.5 ? uMix.y : uMix.z;
          vType = type;
          if (w < 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
          vec3 p;
          float edge;
          if (type > 0.5 && type < 1.5) {
            // calima dust: rides the wind through a 44 m box around the camera
            vec3 drift = vec3(uDrift.x, -0.05 - s * 0.08, uDrift.y) * uTime * (0.8 + s * 0.4);
            p = mod(position + drift, vec3(44.0, 14.0, 44.0)) - vec3(22.0, 3.0, 22.0);
            p += vec3(sin(uTime * 0.7 + s * 40.0), sin(uTime * 0.9 + s * 21.0) * 0.6, cos(uTime * 0.6 + s * 33.0)) * 0.6;
            edge = (1.0 - smoothstep(14.0, 21.0, length(p.xz))) * (1.0 - smoothstep(8.0, 11.0, p.y));
          } else {
            vec3 drift = vec3(uTime * (0.30 + s * 0.25), -uTime * (0.045 + s * 0.05), uTime * (0.18 + s * 0.16));
            p = mod(position + drift, vec3(24.0, 9.0, 24.0)) - vec3(12.0, 0.0, 12.0);
            p.x += sin(uTime * 0.9 + s * 40.0) * 0.5;
            p.y += 0.6 + sin(uTime * 1.3 + s * 21.0) * 0.35;
            p.z += cos(uTime * 0.7 + s * 33.0) * 0.5;
            edge = (1.0 - smoothstep(7.0, 11.5, length(p.xz))) * (1.0 - smoothstep(6.0, 8.8, p.y));
          }
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          // sunlit toward the light only: forward scatter
          vec3 vdir = normalize((modelMatrix * vec4(p, 1.0)).xyz - cameraPosition);
          float fwd = pow(max(dot(vdir, normalize(uSunDir)), 0.0), 4.0);
          vA = w * edge * (0.25 + 0.75 * fract(s * 7.31)) * (0.4 + 2.2 * fwd);
          float size = type > 0.5 && type < 1.5 ? (0.020 + s * 0.016) : (0.028 + s * 0.020);
          gl_PointSize = clamp(size * uFocal / -mv.z, 1.0, 6.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        varying float vType;
        uniform vec3 uSunCol, uDust;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float a = smoothstep(1.0, 0.15, length(uv)) * vA * 0.30;
          vec3 tint = vType > 0.5 && vType < 1.5 ? uDust * 1.4 : vec3(1.0, 0.86, 0.58) * normalize(uSunCol + 1e-3) * 1.7;
          gl_FragColor = vec4(tint * a, a);
        }
      `,
    });
    const pts = new THREE.Points(geo, this._moteMat);
    pts.name = 'air-motes';
    pts.frustumCulled = false;
    pts.userData.noSizeCull = true;
    return pts;
  }

  /* =============================== rain ================================== */

  /** One draw: screen-sized streaks in a wrap-around box that rides the camera. */
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

  /**
   * The dome. L-10: drawn LAST (renderOrder 1000, z = w, LEQUAL), so it shades only the
   * pixels nothing else covered and the sister isles beyond 1,900 m stay drawn; the
   * Round-4 procedural fbm is replaced by four fetches of the baked noise (stars and the
   * moon keep their hash at night). L-03 keys, L-06 sun, L-14 calima, bible §9.4 trade
   * stratocumulus (flat bases on one plane, tops heaped in four slices, drifting SW).
   * At the horizon the dome hands over to exactly the fog's in-scatter, so the far sea
   * meets the sky with no tonal step.
   */
  _buildSky() {
    const geo = new THREE.SphereGeometry(1900, 48, 32);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      depthFunc: THREE.LessEqualDepth,
      fog: false,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uSunCol: { value: new THREE.Color('#ffc98a') },
        uHorizon: { value: new THREE.Color('#BFD3E0') },
        uMid: { value: new THREE.Color('#7ca2cf') },
        uZenith: { value: new THREE.Color('#3F78B5') },
        uGround: { value: new THREE.Color('#7a6a56') },
        uNight: { value: 0 },
        uCloud: { value: new THREE.Vector4(0.3, 0.3, 0, 0) },
        uStorm: { value: 0 },
        uTime: { value: 0 },
        uDrift: { value: new THREE.Vector2() },
        uCalima: { value: new THREE.Vector2(0, 1) },
        uCalZen: { value: new THREE.Color(CALIMA.zen) },
        uCalHor: { value: new THREE.Color(CALIMA.hor) },
        uDisc: { value: new THREE.Color(1, 0.4, 0.25) },
        uFogDens: { value: 1 },
        uIbl: { value: 0 },
        uNoise: { value: this._noise },
        // the fog's own in-scatter terms, shared objects (the horizon hand-over)
        calFogHorizon: this.u.calFogHorizon,
        calFogZenith: this.u.calFogZenith,
        calFogSun: this.u.calFogSun,
        calFogB: this.u.calFogB,
        calFogG: this.u.calFogG,
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position.z = gl_Position.w;   // the far plane: drawn last, behind everything
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 uSunDir, uMoonDir, uSunCol, uHorizon, uMid, uZenith, uGround;
        uniform float uNight, uStorm, uTime, uFogDens, uIbl;
        uniform vec4 uCloud;   // coverage, underside darkness, desat, flash
        uniform vec2 uDrift, uCalima;
        uniform vec3 uCalZen, uCalHor, uDisc;
        uniform sampler2D uNoise;
        uniform vec3 calFogHorizon, calFogZenith, calFogSun;
        uniform vec4 calFogB, calFogG;

        float hash3(vec3 p){ return fract(sin(dot(p, vec3(12.99,78.23,45.16)))*43758.5453); }
        float hg(float g, float c) { return (1.0 - g * g) / pow(max(1.0 + g * g - 2.0 * g * c, 1e-4), 1.5); }

        void main() {
          vec3 d = normalize(vDir);
          vec3 sd = normalize(uSunDir);
          vec3 md = normalize(uMoonDir);
          float h = clamp(d.y, -0.08, 1.0);
          float day = 1.0 - uNight;
          float cal = uCalima.x;
          float sunD = max(dot(d, sd), 0.0);
          float moonD = max(dot(d, md), 0.0);

          // ---- the gradient (L-03 keys): horizon -> mid -> zenith, warm toward the sun
          vec2 hz = normalize(d.xz + vec2(1e-5));
          vec2 sz = normalize(sd.xz + vec2(1e-5));
          float az = max(dot(hz, sz), 0.0);
          vec3 horizon = mix(uHorizon * 0.86, uHorizon, pow(az, 2.0));
          vec3 col = mix(horizon, uMid, smoothstep(0.0, 0.30, h));
          col = mix(col, uZenith, smoothstep(0.20, 0.95, h));
          col += uSunCol * pow(az, 6.0) * (1.0 - smoothstep(0.0, 0.40, h)) * 0.18 * day;

          // ---- calima (L-14): the gradient flattens to ochre, a broad coral glow at the sun
          if (cal > 0.001) {
            vec3 cg = mix(uCalHor, uCalZen, smoothstep(0.0, 0.75, h)) * uCalima.y;
            cg += uDisc * 0.10 * pow(sunD, 10.0) * uCalima.y;
            col = mix(col, cg, cal);
          }

          // ---- overcast lid
          {
            vec3 lid = mix(vec3(0.66, 0.68, 0.72), vec3(0.19, 0.21, 0.25), uCloud.y);
            lid = mix(lid, vec3(0.09, 0.10, 0.13), uNight * 0.86);
            col = mix(col, lid, smoothstep(0.34, 0.95, uCloud.x) * 0.88 * (1.0 - cal));
          }

          // ---- stars: stable 3D hash cells, fading with daylight (night only)
          if (uNight > 0.01 && d.y > -0.02) {
            vec3 g = d * 260.0;
            vec3 cell = floor(g);
            float r = hash3(cell);
            if (r > 0.9880) {
              vec3 jit = vec3(hash3(cell + 1.7), hash3(cell + 5.3), hash3(cell + 9.1)) - 0.5;
              float dd = length(fract(g) - 0.5 - jit * 0.6);
              float tw = 0.62 + 0.38 * sin(uTime * (1.4 + r * 8.0) + r * 60.0);
              float mag = smoothstep(0.36, 0.0, dd) * (0.40 + (r - 0.9880) * 78.0);
              col += vec3(0.88, 0.92, 1.0) * mag * tw * 1.10 * uNight * smoothstep(-0.02, 0.16, d.y) * (1.0 - cal * 0.85);
            }
            float mw = exp(-pow((dot(d, normalize(vec3(0.42, 0.55, -0.72))) ), 2.0) * 34.0);
            col += vec3(0.30, 0.34, 0.46) * mw * 0.045 * uNight;
          }

          // ---- moon: disc, maria, halo
          if (uNight > 0.005 && md.y > -0.06) {
            float disc = smoothstep(0.99955, 0.99988, moonD);
            float mtex = texture2D(uNoise, d.xz * 9.0 + 0.3).a * 0.7 + 0.45;
            col += vec3(0.92, 0.93, 0.88) * disc * mtex * 1.2 * uNight;
            col += vec3(0.62, 0.68, 0.86) * pow(moonD, 900.0) * 0.30 * uNight;
            col += vec3(0.38, 0.44, 0.62) * pow(moonD, 60.0) * 0.08 * uNight;
          }

          // ---- high cirrus: one fetch, stretched across the wind
          if (d.y > 0.06) {
            vec2 cuv = d.xz / (d.y + 0.42);
            vec2 ruv = vec2(cuv.x * 0.71 + cuv.y * 0.71, -cuv.x * 0.71 + cuv.y * 0.71);
            float cir = texture2D(uNoise, vec2(ruv.x * 0.10, ruv.y * 0.55) - uDrift * 0.000004).g;
            cir = smoothstep(0.50, 0.80, cir) * smoothstep(0.05, 0.28, d.y) * (1.0 - smoothstep(0.5, 0.85, d.y));
            col = mix(col, mix(vec3(0.99, 0.92, 0.86), vec3(0.24, 0.27, 0.36), uNight),
                      cir * 0.22 * (1.0 - uCloud.x * 0.8) * (1.0 - cal));
          }

          // ---- trade stratocumulus (bible §9.4): flat bases on the 1000 m plane, tops
          // heaped through four slices to 1600 m, drifting SW; hazed with distance
          float cover = 0.0;
          if (d.y > 0.012 && cal < 0.98) {
            vec3 acc = vec3(0.0);
            float tr = 1.0;
            float thr = mix(0.58, 0.30, uCloud.x);
            vec3 lit = mix(vec3(1.10, 1.02, 0.94) * (0.55 + 0.45 * uSunCol), vec3(0.050, 0.058, 0.085), uNight);
            vec3 shadeC = mix(mix(uMid, uHorizon, 0.5) * 0.72, vec3(0.012, 0.015, 0.024), uNight);
            shadeC = mix(shadeC, vec3(0.26, 0.28, 0.33), uCloud.y);
            float t0 = 1000.0 / d.y;
            for (int k = 0; k < 4; k++) {
              float fk = float(k);
              float hk = 1000.0 + fk * 200.0;
              vec2 p = d.xz * (hk / d.y) - uDrift;
              float n = texture2D(uNoise, p * (1.0 / 4200.0)).r;
              float sh = n - thr - fk * 0.030;
              float a = smoothstep(0.0, 0.07, sh) * 0.85;
              float up = (fk + 0.5) / 4.0;
              vec3 c = mix(shadeC, lit, smoothstep(0.0, 1.0, up * 0.9 + clamp(sh * 6.0, 0.0, 0.3)));
              c += uSunCol * pow(sunD, 4.0) * 0.35 * day * up;
              acc += tr * a * c;
              tr *= 1.0 - a;
            }
            cover = (1.0 - tr) * (1.0 - cal);
            float haze = exp(-t0 / 14000.0);
            vec3 cc = acc / max(1.0 - tr, 1e-3);
            cc = mix(horizon, cc, haze);
            cc += vec3(0.9, 0.94, 1.0) * uCloud.w * 0.9;
            col = mix(col, cc, cover * smoothstep(0.012, 0.05, d.y));
          }

          // ---- sun (L-06): 0.5° disc at ×40 HDR with limb darkening, two corona lobes,
          // a haze glow that grows with the fog; occluded by cloud; none in the IBL
          float occl = 1.0 - cover * 0.92;
          if (sd.y > -0.10 && uIbl < 0.5) {
            float horizonDim = smoothstep(-0.10, 0.06, sd.y);
            float ang = acos(clamp(sunD, -1.0, 1.0));
            float rr = ang / 0.00873;               // 0.5° radius
            float discM = 1.0 - smoothstep(0.85, 1.05, rr);
            float limb = 1.0 - 0.6 * (1.0 - sqrt(max(0.0, 1.0 - min(rr * rr, 1.0))));
            float clear = (1.0 - cal) * occl * horizonDim * day;
            col += uSunCol * 40.0 * discM * limb * clear;
            col += uSunCol * (pow(sunD, 900.0) * 1.6 + pow(sunD, 64.0) * 0.35) * clear;
            col += uSunCol * pow(sunD, 8.0) * 0.08 * clamp(uFogDens, 0.5, 4.0) * occl * horizonDim * day * (1.0 - cal);
            // calima: a soft coral disc that SHOWS as #F2A27E (solved on the CPU)
            if (cal > 0.001) {
              float cr = ang / 0.0175;               // 1.0° radius, soft edge
              float cm = 1.0 - smoothstep(0.80, 1.15, cr);
              col = mix(col, uDisc, cm * cal * horizonDim * smoothstep(0.0, 0.5, uCalima.y));
            }
          }

          col += vec3(0.80, 0.86, 1.0) * uCloud.w * 0.55;
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(col, vec3(l), uCloud.z * 0.4);

          // ---- the horizon hand-over: at and below the horizon the dome IS the fog's
          // in-scatter (same terms as fog_fragment), so the far sea meets the sky clean
          {
            float up = clamp(d.y * 1.55 + 0.10, 0.0, 1.0);
            vec3 fogC = mix(calFogHorizon, calFogZenith, up * up);
            float c = dot(d, sd);
            fogC += calFogSun * (hg(calFogG.x, c) * calFogG.y + hg(calFogG.z, c) * calFogG.w) * calFogB.x;
            float k = 1.0 - smoothstep(-0.004, 0.065, d.y);
            col = mix(col, fogC, k);
          }
          // IBL capture: below the horizon reads the warm ground bounce
          if (uIbl > 0.5) col = mix(col, uGround * 0.55 + calFogHorizon * 0.15, smoothstep(0.0, -0.20, d.y));

          gl_FragColor = vec4(min(col, vec3(48.0)), 1.0);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'sky';
    mesh.renderOrder = 1000;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.noSizeCull = true;
    return mesh;
  }

  /* ============================== dispose ================================ */

  /** Tear down everything this system made (GPU and scene). */
  dispose() {
    const scene = this.ctx.scene;
    const engine = this.ctx.engine;
    const hooks = engine?.onAfterRender;
    if (hooks) { const i = hooks.indexOf(this._afterRender); if (i >= 0) hooks.splice(i, 1); }
    if (scene.onBeforeRender === this._obr) scene.onBeforeRender = this._prevOBR ?? (() => {});
    for (const o of [this.sky, this.birds, this.motes, this.rain]) {
      scene.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    }
    scene.remove(this.hemi, this.fireLight, ...this.eyeLights);
    if (this._sunInScene) scene.remove(this.sun, this.sun.target);
    this.sun.dispose?.();
    this._noise.dispose();
    const S = this._shafts;
    engine?.unregisterRenderTarget?.(S.rt);
    S.rt.dispose(); S.gather.dispose(); S.composite.dispose(); S.quadA.dispose(); S.quadB.dispose();
    const I = this._ibl;
    if (I) {
      if (scene.environment === I.rt?.texture) scene.environment = null;
      engine?.unregisterRenderTarget?.(I.cubeRT); if (I.rt) engine?.unregisterRenderTarget?.(I.rt);
      if (I.pmrem._pingPongRenderTarget) engine?.unregisterRenderTarget?.(I.pmrem._pingPongRenderTarget);
      I.rt?.dispose(); I.cubeRT.dispose(); I.pmrem.dispose();
      I.scene.remove(I.dome);
      this._ibl = null;
    }
    this.skyIBL = null; this.skyCube = null;
    if (scene.fog) scene.fog = null;
  }
}
