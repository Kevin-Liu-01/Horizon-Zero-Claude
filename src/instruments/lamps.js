import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hexToRgb, srgbToLinear } from './lib/color.js';
import { perceptionScale } from './lib/weather.js';

/**
 * LAMP STATES — the Instruments' lamp grammar (instruments-core W0b; bible §7.2,
 * replaces `EYE_COLORS`; gates `A-lamp-states`, `A-lamp-canon-distance`,
 * `A-beams-one-draw`).
 *
 * SHAPE, THEN MOTION, THEN COLOUR. Every Instrument lamp is a lens behind an
 * iris: the aperture says the state before the colour does (100 / 50 / 20 %,
 * closed), the rhythm says it again (steady, 1 Hz pulse, 4 Hz flicker,
 * sputter-then-out), and the colour is the third read. Wary and hostile throw a
 * beam when the air can carry it (fog density > 1.2 or night).
 *
 * TWO DRAWS FOR EVERY LAMP OF EVERY INSTRUMENT. `LampSystem` owns one
 * `InstancedMesh` of iris discs (the lens, the aperture and the blades are one
 * shader) and one `InstancedMesh` of additive cones (the beams, bible §7.2:
 * "1 draw"). A kind registers a lamp with `machine.addLamp(...)` (machine.js);
 * nothing else is per machine: no geometry, no material, no texture.
 *
 * THE RING ON SCREEN IS THE TOKEN; THE CORE BLOOMS. The engine tone-maps
 * (ACES), sRGB-encodes and grades every pixel in one output pass (`engine.js`
 * OutputGradeShader), so a lens filled with the token's linear value would land
 * on screen as a different colour. The lens RING instead carries the HDR value
 * that the output pass maps BACK onto the token: `OutputInverse` inverts the
 * grade, the sRGB transfer and the ACES fit analytically, then refines against
 * an exact copy of the forward transform. It re-solves only when the exposure,
 * a grade uniform or the bloom threshold changes (a signature compare per
 * frame, no allocation). Inside the ring sits the CORE (bible §7.2 "lamp
 * emissive x2.5 with a core above the bloom threshold so lenses read at noon";
 * §10 "lamp glass ... emissive x2.5"): CORE_FRAC of the open aperture's radius,
 * x2.5 the ring's HDR, raised further where x2.5 still sits under the bloom
 * threshold (the hostile magenta is a dark colour: x4.8), so every lit state
 * puts a hot centre into the bloom chain and the glass reads as a lit lens in
 * full sun; the token ring around it is what `A-lamp-states` grades.
 *
 * THE LAMP DRUM. Each lamp is a short graphite barrel (the "lamp drum" of bible
 * §7.1 rule 2) whose face carries the iris: the lit glass sits in a dark face
 * (the retracted blades and the housing ring, the closed-iris token `#3B3A36`)
 * the way a signal lamp sits in its black backplate, so a bone-white lens still
 * separates from a sunlit bone-glaze hull (bible §7.3: >= 3:1 at noon, graded
 * by `A-weak40` against that face). The barrel wall is lit by the sun and the
 * sky (`environment.sunDir`, `sun`, `hemi`) so it reads as metal from the side
 * and sinks into the hull instead of floating as a flat disc. Lamps never cast
 * shadows and are not fogged.
 *
 * Published on the manager as `machines.lamps`:
 *   lamps.attach(machine, anchor, { radius }) -> record    (machine.addLamp)
 *   lamps.detach(machine)
 *   lamps.stateOf(machine) -> 'calm' | 'wary' | 'hostile' | 'dark'
 *   lamps.lampHdr(stateId) -> { r, g, b }   the solved ring value (gates)
 *   lamps.coreHdr(stateId) -> { r, g, b, k, lum }   the core value, its gain over the ring, its HDR luminance
 *   lamps.beamsOn() -> boolean              fog density > 1.2 or night
 *   lamps.audit() -> { lamps, beams, capacity, beamDraws, lampDraws, solves, fogK, night }
 *   lamps.lampMesh / lamps.beamMesh         the two instanced draws
 *   lamps.dispose()
 * and on every machine: `machine.lampState` (machine.js getter).
 */

/** Horizon's sensor colours (calm, wary, hostile, override teal, Focus violet). Never a CALIMA token. */
export const LAMP_CANON = Object.freeze(['#38c6ff', '#ffb31f', '#ff2413', '#19ffd0', '#9B6BFF']);

/** Bible §9.7 scanner tokens (shell-ui W2 draws them); highlights are ink and cobalt. */
export const SCANNER_TOKENS = Object.freeze({ paper: '#E2D3B0', ink: '#26343F', cobalt: '#2C4F8A' });
export const SCANNER_HIGHLIGHTS = Object.freeze(['#26343F', '#2C4F8A']);

/**
 * The four lamp states (bible §7.2). `aperture` is the lit AREA fraction of the
 * lens; `hz` the rhythm; `beam` false | 'sweep' (wary: 0.5 Hz toward the
 * stimulus) | 'lock' (hostile: on the target).
 */
export const LAMP_STATES = Object.freeze({
  calm: Object.freeze({ id: 'calm', token: '#F2EAD3', aperture: 1.0, beam: false, rhythm: 'steady', hz: 0 }),
  wary: Object.freeze({ id: 'wary', token: '#B5E61D', aperture: 0.5, beam: 'sweep', rhythm: 'pulse', hz: 1, sweepHz: 0.5 }),
  hostile: Object.freeze({ id: 'hostile', token: '#FF2D8C', aperture: 0.2, beam: 'lock', rhythm: 'flicker', hz: 4 }),
  dark: Object.freeze({ id: 'dark', token: '#3B3A36', aperture: 0.0, beam: false, rhythm: 'sputter', hz: 0 }),
});
export const LAMP_ORDER = Object.freeze(['calm', 'wary', 'hostile', 'dark']);
const AP_CALM = LAMP_STATES.calm.aperture, AP_WARY = LAMP_STATES.wary.aperture, AP_HOSTILE = LAMP_STATES.hostile.aperture;
/** The tokens as numbers (three.js colour ints), for materials that take a hex. */
export const LAMP_HEX = Object.freeze(Object.fromEntries(LAMP_ORDER.map((s) => [s, parseInt(LAMP_STATES[s].token.slice(1), 16)])));
/**
 * Compass pips (bible §9.7: "Instrument ◆ in its lamp-state colour and iris
 * shape"): the lamp tokens and apertures, published for shell-ui (W2) so the
 * HUD never re-types a lamp colour. Graded by `A-lamp-canon-distance`.
 */
export const COMPASS_PIP = Object.freeze(Object.fromEntries(LAMP_ORDER.map((s) => [s,
  Object.freeze({ color: LAMP_STATES[s].token, aperture: LAMP_STATES[s].aperture })])));

/** Beam rules (bible §7.2 + plan §4.1 "64 per cone, instanced, 1 draw"). */
export const BEAM = Object.freeze({
  fogK: 1.2,            // weather fog-density multiplier above which beams draw
  night: 0.5,           // environment.nightFactor above which beams draw
  halfAngleDeg: 5,      // cone half-angle
  segments: 64,         // triangles per cone
  sweepDeg: 14,         // wary sweep amplitude about the stimulus bearing
  capacity: 128,
});

/** Fraction of the face radius the fully open aperture reaches (the dark drum face is outside it). */
export const APERTURE_MAX = 0.66;
/** Core radius as a fraction of the CURRENT aperture radius (the hot centre of the glass). */
export const CORE_FRAC = 0.4;
/** Core HDR = ring HDR x CORE_GAIN, raised until its luminance clears the bloom threshold by CORE_OVER. */
export const CORE_GAIN = 2.5;
const CORE_OVER = 1.25;
/** Face radius where the blades end and the housing bezel starts. */
export const BEZEL_IN = 0.93;
/** Barrel depth behind the face, in face radii (sinks the drum into the hull). */
export const BARREL_DEPTH = 0.85;
/** Graphite (bible §7.1 rule 4 `#2B2C30`), linear, for the lit barrel wall. */
const GRAPHITE_LIN = [0.0242, 0.0252, 0.0296];
/** Rhythm troughs: the lens never goes fully dark while it is alive. */
const PULSE_LOW = 0.55;
const FLICKER_LOW = 0.3;
/** The rhythm constants, for hot paths that write `lampGain` out (machine.js `_updateEyes`). */
export const LAMP_RHYTHM = Object.freeze({ pulseLow: PULSE_LOW, flickerLow: FLICKER_LOW });
const SPUTTER_S = 0.55;
/** Iris speed (1/s): the aperture closes most of the way in ~0.2 s. */
const IRIS_RATE = 14;

/** Instrument perception by weather (bible §2.3): `lib/weather.js`, re-exported for older imports. */
export { WEATHER_PERCEPTION, NIGHT_PERCEPTION, perceptionScale } from './lib/weather.js';

/**
 * Map a machine to its lamp state (bible §7.2 + §7.3).
 *   dark     dead, or blinded: a precise hit on the lamp (`lampDarkT`, 6 s) or
 *            Clouded (the Dust status, engine channel `shock`: `stunT`)
 *   hostile  alert, attack, stagger, downed
 *   wary     suspicious, search
 *   calm     patrol, return
 */
export function lampStateFor(m) {
  if (!m || !m.alive || m.state === 'dead') return 'dark';
  // the machine's doubles through its monomorphic `sc` (machine.js MachineScalars): no boxing
  const sc = m.sc;
  if (sc ? (sc.lampDarkT > 0 || sc.stunT > 0) : ((m.lampDarkT || 0) > 0 || (m.stunT || 0) > 0)) return 'dark';
  switch (m.state) {
    case 'suspicious': case 'search': return 'wary';
    case 'alert': case 'attack': case 'stagger': case 'downed': return 'hostile';
    default: return 'calm';
  }
}

/** Brightness of a lamp in state `s` at sim time `t` (peak 1 = the token). */
export function lampGain(s, t, phase = 0, darkAge = 99) {
  switch (s) {
    case 'wary': return PULSE_LOW + (1 - PULSE_LOW) * (0.5 + 0.5 * Math.cos(2 * Math.PI * (t + phase)));
    case 'hostile': return ((t + phase) * 4) % 1 < 0.5 ? 1 : FLICKER_LOW;
    case 'dark': return 1;
    default: return 1;
  }
}

/* ------------------------------------------------------------------ */
/* the output transform and its inverse                                */
/* ------------------------------------------------------------------ */

// three r169 ACESFilmicToneMapping (rows of its column-major GLSL mat3s)
const ACES_IN = [[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]];
const ACES_OUT = [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]];
const LUMA = [0.2126, 0.7152, 0.0722];

/** 3 x 3 inverse into `o` (rows); false when singular. Allocation-free. */
function inv3Into(m, o) {
  const a = m[0][0], b = m[0][1], c = m[0][2], d = m[1][0], e = m[1][1], f = m[1][2], g = m[2][0], h = m[2][1], i = m[2][2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!det || !Number.isFinite(det)) return false;
  o[0][0] = A / det; o[0][1] = -(b * i - c * h) / det; o[0][2] = (b * f - c * e) / det;
  o[1][0] = B / det; o[1][1] = (a * i - c * g) / det; o[1][2] = -(a * f - c * d) / det;
  o[2][0] = C / det; o[2][1] = -(a * h - b * g) / det; o[2][2] = (a * e - b * d) / det;
  return true;
}
const mat3 = () => [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
const ACES_IN_INV = mat3();
const ACES_OUT_INV = mat3();
inv3Into(ACES_IN, ACES_IN_INV);
inv3Into(ACES_OUT, ACES_OUT_INV);
const mul3 = (M, v, out) => {
  const x = v[0], y = v[1], z = v[2];
  out[0] = M[0][0] * x + M[0][1] * y + M[0][2] * z;
  out[1] = M[1][0] * x + M[1][1] * y + M[1][2] * z;
  out[2] = M[2][0] * x + M[2][1] * y + M[2][2] * z;
  return out;
};
const acesFit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
function acesFitInv(y) {
  const a = 1 - 0.983729 * y, b = 0.0245786 - 0.432951 * y, c = -(0.000090537 + 0.238081 * y);
  return (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
}
const sat01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const oetf = (c) => (c <= 0.0031308 ? c * 12.92 : Math.pow(c, 0.41666) * 1.055 - 0.055);
const smooth = (e0, e1, x) => { const t = sat01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

/* Scratch for the transforms: a re-solve (an exposure or grade change, which
 * world-sky may animate per frame from W1) allocates nothing. */
const _F = { t: [0, 0, 0], v: [0, 0, 0], s: [0, 0, 0], c: [0, 0, 0] };
const _I = { c2: [0, 0, 0], s: [0, 0, 0], y: [0, 0, 0], f: [0, 0, 0], fx: [0, 0, 0], fh: [0, 0, 0],
  r: [0, 0, 0], xs: [0, 0, 0], d: [0, 0, 0], J: mat3(), Ji: mat3() };

/**
 * Exact forward copy of the engine's output pass at the screen centre
 * (no vignette): HDR linear -> display sRGB (0..1). Allocation-free when `out` is passed.
 */
export function outputForward(x, P, out = [0, 0, 0]) {
  const t = _F.t, v = _F.v, s = _F.s, c = _F.c;
  const k = P.exposure / 0.6;
  v[0] = x[0] * k; v[1] = x[1] * k; v[2] = x[2] * k;
  if (P.aces) {
    mul3(ACES_IN, v, t);
    t[0] = acesFit(t[0]); t[1] = acesFit(t[1]); t[2] = acesFit(t[2]);
    mul3(ACES_OUT, t, v);
  } else {
    v[0] = x[0] * P.exposure; v[1] = x[1] * P.exposure; v[2] = x[2] * P.exposure;
  }
  s[0] = oetf(sat01(v[0])); s[1] = oetf(sat01(v[1])); s[2] = oetf(sat01(v[2]));
  for (let i = 0; i < 3; i++) c[i] = (s[i] - 0.5) * P.contrast + 0.5 + P.lift[i];
  const l = LUMA[0] * c[0] + LUMA[1] * c[1] + LUMA[2] * c[2];
  const w = smooth(0.12, 0.86, l);
  for (let i = 0; i < 3; i++) {
    const sv = l + P.saturation * (c[i] - l);
    const g = sv * (P.shadow[i] + (P.highlight[i] - P.shadow[i]) * w);
    out[i] = sat01(s[i] + (g - s[i]) * P.mix);
  }
  return out;
}

/** HDR linear value whose output-pass image is the sRGB triple `t` (0..1). Allocation-free when `x` is passed. */
export function outputInverse(t, P, x = [0, 0, 0]) {
  const { c2, s, y, f, fx, fh, r, xs, d, J, Ji } = _I;
  // 1. ungrade (gradeMix = 1 analytically; Newton below absorbs any other mix)
  let l = LUMA[0] * t[0] + LUMA[1] * t[1] + LUMA[2] * t[2];
  for (let it = 0; it < 24; it++) {
    const w = smooth(0.12, 0.86, l);
    for (let i = 0; i < 3; i++) c2[i] = t[i] / (P.shadow[i] + (P.highlight[i] - P.shadow[i]) * w);
    l = LUMA[0] * c2[0] + LUMA[1] * c2[1] + LUMA[2] * c2[2];
  }
  for (let i = 0; i < 3; i++) {
    const c1 = l + (c2[i] - l) / P.saturation;
    s[i] = P.mix > 0.999 ? (c1 - 0.5 - P.lift[i]) / P.contrast + 0.5 : t[i];
  }
  // 2. un-encode; a channel at the clip aims a hair past it so it stays clipped
  for (let i = 0; i < 3; i++) y[i] = t[i] >= 0.999 ? 1.004 : srgbToLinear(sat01(s[i]));
  // 3. un-tonemap
  if (P.aces) {
    mul3(ACES_OUT_INV, y, f);
    for (let i = 0; i < 3; i++) f[i] = acesFitInv(Math.min(1.0164, f[i]));
    mul3(ACES_IN_INV, f, x);
    const k = 0.6 / P.exposure;
    x[0] *= k; x[1] *= k; x[2] *= k;
  } else {
    x[0] = y[0] / P.exposure; x[1] = y[1] / P.exposure; x[2] = y[2] / P.exposure;
  }
  // 4. Newton on the exact forward (finite-difference Jacobian, clipped channels left alone)
  for (let it = 0; it < 8; it++) {
    outputForward(x, P, fx);
    for (let i = 0; i < 3; i++) r[i] = (t[i] >= 0.999 && fx[i] >= 0.9995) ? 0 : fx[i] - t[i];
    if (Math.abs(r[0]) + Math.abs(r[1]) + Math.abs(r[2]) < 1e-6) break;
    for (let j = 0; j < 3; j++) {
      const h = 1e-4 * Math.max(0.05, Math.abs(x[j]));
      xs[0] = x[0]; xs[1] = x[1]; xs[2] = x[2];
      xs[j] += h;
      outputForward(xs, P, fh);
      for (let i = 0; i < 3; i++) J[i][j] = (fh[i] - fx[i]) / h;
    }
    for (let i = 0; i < 3; i++) {
      if (t[i] >= 0.999 && fx[i] >= 0.9995) { J[i][0] = i === 0 ? 1 : 0; J[i][1] = i === 1 ? 1 : 0; J[i][2] = i === 2 ? 1 : 0; }
    }
    if (!inv3Into(J, Ji)) break;
    let finite = true;
    for (let i = 0; i < 3 && finite; i++) for (let j = 0; j < 3; j++) if (!Number.isFinite(Ji[i][j])) { finite = false; break; }
    if (!finite) break;
    mul3(Ji, r, d);
    x[0] -= d[0]; x[1] -= d[1]; x[2] -= d[2];
  }
  return x;
}

/** Read the engine's live output-pass parameters into `P` (allocation-free after the first call). */
function readOutputParams(engine, P) {
  const r = engine?.renderer;
  const u = engine?.grade?.uniforms;
  P.exposure = r?.toneMappingExposure ?? 1;
  P.aces = !r || r.toneMapping === THREE.ACESFilmicToneMapping;
  P.contrast = u?.uContrast?.value ?? 1;
  P.saturation = u?.uSaturation?.value ?? 1;
  P.mix = u?.uGradeMix?.value ?? 0;
  const L = u?.uLift?.value, S = u?.uShadowTint?.value, H = u?.uHighlightTint?.value;
  P.lift[0] = L?.x ?? 0; P.lift[1] = L?.y ?? 0; P.lift[2] = L?.z ?? 0;
  P.shadow[0] = S?.r ?? 1; P.shadow[1] = S?.g ?? 1; P.shadow[2] = S?.b ?? 1;
  P.highlight[0] = H?.r ?? 1; P.highlight[1] = H?.g ?? 1; P.highlight[2] = H?.b ?? 1;
  P.bloomThr = engine?.bloom?.threshold ?? 1.08;
  return P;
}

function paramSig(P) {
  return P.exposure + P.contrast * 3 + P.saturation * 7 + P.mix * 11 + (P.aces ? 13 : 0)
    + P.lift[0] * 17 + P.lift[1] * 19 + P.lift[2] * 23 + P.shadow[0] * 29 + P.shadow[1] * 31
    + P.shadow[2] * 37 + P.highlight[0] * 41 + P.highlight[1] * 43 + P.highlight[2] * 47 + P.bloomThr * 53;
}

/* ------------------------------------------------------------------ */
/* shaders                                                             */
/* ------------------------------------------------------------------ */

const IRIS_VERT = /* glsl */`
  attribute vec4 aLamp;   // rgb: ring HDR (already x rhythm gain), a: aperture radius 0..1 of the face
  attribute vec4 aIris;   // rgb: blade HDR (the closed-iris token), a: 1 = cracked (dark)
  attribute vec4 aCore;   // rgb: core HDR (x rhythm gain), a: unused
  varying vec2 vP;
  varying float vWall;
  varying vec3 vN;
  varying vec3 vV;
  varying vec4 vLamp;
  varying vec4 vIris;
  varying vec3 vCore;
  void main() {
    vP = position.xy;
    vWall = 1.0 - step(0.5, normal.z);   // the face has normal +Z; the barrel wall is radial
    vLamp = aLamp;
    vIris = aIris;
    vCore = aCore.rgb;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vV = cameraPosition - wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const IRIS_FRAG = /* glsl */`
  uniform vec3 uSunDir;     // world, toward the sun
  uniform vec3 uSunRad;     // sun colour x intensity / pi (three's Lambert)
  uniform vec3 uSkyRad;     // hemisphere sky colour x intensity / pi
  uniform vec3 uGraphite;   // barrel albedo (linear)
  varying vec2 vP;
  varying float vWall;
  varying vec3 vN;
  varying vec3 vV;
  varying vec4 vLamp;
  varying vec4 vIris;
  varying vec3 vCore;
  void main() {
    if (vWall > 0.5) {
      // the barrel: graphite lit by sun + sky, a faint grazing sheen so it reads as metal
      vec3 n = normalize(vN);
      float nl = max(dot(n, uSunDir), 0.0);
      float sky = 0.5 + 0.5 * n.y;
      float fr = pow(1.0 - abs(dot(n, normalize(vV))), 4.0);
      gl_FragColor = vec4(uGraphite * (uSunRad * nl + uSkyRad * sky) + uSkyRad * 0.12 * fr, 1.0);
      return;
    }
    float r = length(vP);
    if (r > 1.0) discard;
    vec3 c;
    float a = vLamp.a;
    if (r < a) {
      // the lit glass: a hot core above the bloom threshold inside the token ring
      float rc = a * ${CORE_FRAC.toFixed(3)};
      c = mix(vCore, vLamp.rgb, smoothstep(rc * 0.85, rc * 1.15, r));
    } else if (r > ${BEZEL_IN.toFixed(3)}) {
      c = vIris.rgb * 1.9;                 // housing bezel (darkened bronze)
    } else {
      // the iris blades / drum face: six blades, a hairline seam per blade, swept with the radius
      float ang = atan(vP.y, vP.x) / 6.2831853 + 0.5;
      float s = abs(fract(ang * 6.0 + r * 0.55) - 0.5);
      float seam = 1.0 - smoothstep(0.0, 0.03, 0.5 - s);
      c = vIris.rgb * (1.0 - 0.45 * (1.0 - seam) * step(0.5, 1.0 - vIris.a));
      // a cracked (dark) iris: one wavering fracture across the closed blades and a branch
      // running off it below (never a symmetric cross: it must not read as a reticle)
      if (vIris.a > 0.5) {
        vec2 q = vP / ${APERTURE_MAX.toFixed(3)};
        float k1 = abs(q.y - 0.35 * q.x - 0.08 + 0.05 * sin(q.x * 23.0));
        float k2 = abs(q.x + 0.6 * q.y + 0.22 + 0.04 * sin(q.y * 31.0)) + step(0.003, q.y) * 10.0;
        c *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.025, min(k1, k2))) * step(length(q), 1.08);
      }
    }
    gl_FragColor = vec4(c, 1.0);
  }
`;

const BEAM_VERT = /* glsl */`
  attribute vec4 aBeam;   // rgb: colour x intensity
  varying vec3 vCol;
  varying float vZ;
  varying float vEdge;
  void main() {
    vCol = aBeam.rgb;
    vZ = position.z;                       // 0 at the lens, 1 at the far end
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    // the instance matrix scales the unit cone NON-uniformly (radius x radius x length): a normal
    // goes through the inverse scale (R S^-1 n == M (n / s^2)), or a long thin cone's normals all
    // lean down its axis and the shaft reads as a flat, hard-edged wedge that brightens with length
    mat3 im = mat3(instanceMatrix);
    vec3 s2 = vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
    vec3 n = normalize(mat3(modelViewMatrix) * (im * (normal / s2)));
    vec3 v = normalize(-mv.xyz);
    vEdge = abs(dot(n, v));
    gl_Position = projectionMatrix * mv;
  }
`;
const BEAM_FRAG = /* glsl */`
  varying vec3 vCol;
  varying float vZ;
  varying float vEdge;
  void main() {
    float along = (1.0 - vZ);
    float a = along * along * vEdge * vEdge;   // bright on the axis, gone at the silhouette: a shaft, not a wedge
    gl_FragColor = vec4(vCol * a, 1.0);
  }
`;

/* ------------------------------------------------------------------ */
/* the system                                                          */
/* ------------------------------------------------------------------ */

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _d = new THREE.Vector3();
const _t = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _qs = new THREE.Quaternion();

export class LampSystem {
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    this.capacity = opts.capacity ?? BEAM.capacity;
    this.records = [];
    this._P = { exposure: 1, aces: true, contrast: 1, saturation: 1, mix: 1,
      lift: [0, 0, 0], shadow: [1, 1, 1], highlight: [1, 1, 1], bloomThr: 1.08 };
    this._sig = NaN;
    this.solves = 0;
    /** The tokens as sRGB triples, and the solver's output scratch (a re-solve allocates nothing). */
    this._tokRgb = {};
    for (const id of LAMP_ORDER) this._tokRgb[id] = hexToRgb(LAMP_STATES[id].token);
    this._x = [0, 0, 0];
    /** Solved lens HDR per state, and the blade colour (the dark token). */
    this.hdr = {};
    for (const id of LAMP_ORDER) this.hdr[id] = { r: 0, g: 0, b: 0 };
    /** Solved core HDR per state (ring x CORE_GAIN, raised to clear the bloom threshold) and its gain. */
    this.core = {};
    for (const id of LAMP_ORDER) this.core[id] = { r: 0, g: 0, b: 0, k: CORE_GAIN };
    /** Linear token colour per state (beam tint). */
    this.lin = {};
    for (const id of LAMP_ORDER) {
      const c = hexToRgb(LAMP_STATES[id].token);
      this.lin[id] = { r: srgbToLinear(c[0]), g: srgbToLinear(c[1]), b: srgbToLinear(c[2]) };
    }

    // ---- the iris discs: ONE instanced draw for every lamp ----
    // the face (iris + drum face, z = 0, normal +Z) and the barrel wall behind it (z in [-depth, 0])
    const face = new THREE.CircleGeometry(1, 40);
    const wall = new THREE.CylinderGeometry(1, 1, BARREL_DEPTH, 40, 1, true);
    wall.rotateX(Math.PI / 2);
    wall.translate(0, 0, -BARREL_DEPTH / 2);
    const disc = mergeGeometries([face, wall], false);
    face.dispose(); wall.dispose();
    this._aLamp = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this._aIris = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this._aCore = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    disc.setAttribute('aLamp', this._aLamp);
    disc.setAttribute('aIris', this._aIris);
    disc.setAttribute('aCore', this._aCore);
    this._uLight = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunRad: { value: new THREE.Vector3(0, 0, 0) },
      uSkyRad: { value: new THREE.Vector3(0, 0, 0) },
      uGraphite: { value: new THREE.Vector3(GRAPHITE_LIN[0], GRAPHITE_LIN[1], GRAPHITE_LIN[2]) },
    };
    this._lampMat = new THREE.ShaderMaterial({
      vertexShader: IRIS_VERT, fragmentShader: IRIS_FRAG, uniforms: this._uLight,
      depthWrite: true, depthTest: true, fog: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this._lampMat.name = 'instrument-lamps';
    this.lampMesh = new THREE.InstancedMesh(disc, this._lampMat, this.capacity);
    this.lampMesh.name = 'instrument-lamps';
    this.lampMesh.count = 0;
    this.lampMesh.frustumCulled = false;
    this.lampMesh.castShadow = false;
    this.lampMesh.receiveShadow = false;
    this.lampMesh.userData.noSizeCull = true;
    this.lampMesh.userData.noShadow = true;
    this.lampMesh.raycast = () => {};
    this.lampMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // ---- the beams: ONE instanced additive draw for every beam ----
    const cone = new THREE.ConeGeometry(1, 1, BEAM.segments, 1, true);
    cone.translate(0, -0.5, 0);                 // apex at the origin, base at y = -1
    cone.rotateX(-Math.PI / 2);                 // base at z = +1: the cone points down +Z
    this._aBeam = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    cone.setAttribute('aBeam', this._aBeam);
    this._beamMat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
    });
    this._beamMat.name = 'instrument-beams';
    this.beamMesh = new THREE.InstancedMesh(cone, this._beamMat, this.capacity);
    this.beamMesh.name = 'instrument-beams';
    this.beamMesh.count = 0;
    this.beamMesh.visible = false;
    this.beamMesh.frustumCulled = false;
    this.beamMesh.castShadow = false;
    this.beamMesh.receiveShadow = false;
    this.beamMesh.renderOrder = 5;
    this.beamMesh.userData.noSizeCull = true;
    this.beamMesh.userData.noShadow = true;
    this.beamMesh.raycast = () => {};
    this.beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    /** Draws of the beam mesh in the last rendered frame (A-beams-one-draw reads it). */
    this.beamDraws = 0;
    this.lampDraws = 0;
    this._frame = -1;
    // per-frame draw counters: zeroed in update() (before the frame renders), counted per draw
    this.beamMesh.onBeforeRender = () => { this.beamDraws++; };
    this.lampMesh.onBeforeRender = () => { this.lampDraws++; };
    this.beamCount = 0;
    /** Gate/debug: draw the frame without the beams (A-lamp-states' paired with/without read). */
    this.hideBeams = false;
    this.fogK = 1;
    this.night = 0;
    this._lastT = -1;
    /** Last-seen output-pass inputs (the per-frame change test, allocation-free in optimized code). */
    this._pe = -1; this._pc = -1; this._ps = -1; this._pm = -1; this._pb = -1; this._pt = -1;
    this._sigEvery = 0;

    this.group = new THREE.Group();
    this.group.name = 'instrument-lamps-root';
    this.group.add(this.lampMesh, this.beamMesh);
    ctx.scene?.add(this.group);
    /**
     * ONE DRAW MEANS ONE DRAW (A-beams-one-draw). The GTAO pass re-renders the
     * scene with an override material to build its normal/depth G-buffer; an
     * additive light cone written into that buffer is a second beam draw per
     * frame AND false ambient occlusion along the beam. A render with
     * `scene.overrideMaterial` set (G-buffer, never the beauty pass) skips both
     * lamp draws; the pass restores visibility itself afterwards
     * (GTAOPass.restoreVisibility). Chained, allocation-free.
     */
    const scene = ctx.scene;
    if (scene) {
      const prev = scene.onBeforeRender;
      this._sceneHook = prev;
      const self = this;
      scene.onBeforeRender = function lampsOverrideSkip(r, sc, cam, target) {
        if (prev) prev.call(this, r, sc, cam, target);
        if (sc.overrideMaterial) { self.beamMesh.visible = false; self.lampMesh.visible = false; }
        else { self.beamMesh.visible = self.beamCount > 0 && !self.hideBeams; self.lampMesh.visible = self.lampMesh.count > 0; }
      };
      this._scene = scene;
    }
    this._solve(true);
  }

  /** Re-solve the lens values when the output pass changed (exposure, grade). */
  _solve(force = false) {
    const P = readOutputParams(this.ctx.engine, this._P);
    const sig = paramSig(P);
    if (!force && sig === this._sig) return false;
    this._sig = sig;
    const x = this._x;
    for (let i = 0; i < LAMP_ORDER.length; i++) {
      const id = LAMP_ORDER[i];
      outputInverse(this._tokRgb[id], P, x);
      const h = this.hdr[id];
      h.r = x[0]; h.g = x[1]; h.b = x[2];
      // the core: x2.5, raised until its HDR luminance clears the bloom threshold by CORE_OVER
      const lum = LUMA[0] * x[0] + LUMA[1] * x[1] + LUMA[2] * x[2];
      // (dark has no glass: its aperture is closed; its 'core' is the ring value)
      const k = id === 'dark' ? 1 : Math.max(CORE_GAIN, lum > 1e-4 ? CORE_OVER * P.bloomThr / lum : CORE_GAIN);
      const c = this.core[id];
      c.k = k; c.r = x[0] * k; c.g = x[1] * k; c.b = x[2] * k;
    }
    this.solves++;
    return true;
  }

  /** The solved lens HDR for a state (gates; a copy). */
  lampHdr(id) { const h = this.hdr[id]; return h ? { r: h.r, g: h.g, b: h.b } : null; }

  /** The solved core HDR for a state, its gain over the ring and its luminance (gates; a copy). */
  coreHdr(id) { const c = this.core[id]; return c ? { r: c.r, g: c.g, b: c.b, k: c.k, lum: LUMA[0] * c.r + LUMA[1] * c.g + LUMA[2] * c.b } : null; }

  /** The barrel's light: sun + sky from the environment (allocation-free). */
  _lightUpdate() {
    const env = this.ctx.environment, u = this._uLight;
    const sd = env?.sunDir, sun = env?.sun, hemi = env?.hemi;
    if (sd) u.uSunDir.value.set(sd.x, sd.y, sd.z);
    const ks = sun ? sun.intensity / Math.PI : 0;
    if (sun) u.uSunRad.value.set(sun.color.r * ks, sun.color.g * ks, sun.color.b * ks);
    const kh = hemi ? hemi.intensity / Math.PI : 0;
    if (hemi) u.uSkyRad.value.set(hemi.color.r * kh, hemi.color.g * kh, hemi.color.b * kh);
  }

  /**
   * Register a lamp. `anchor` is an Object3D riding the lamp's bone whose +Z is
   * the lens axis and whose origin is the lens centre. One lamp per machine.
   */
  attach(machine, anchor, opts = {}) {
    if (!machine || !anchor) return null;
    this.detach(machine);
    if (this.records.length >= this.capacity) {
      console.warn(`[lamps] capacity ${this.capacity} reached — '${machine.kind}' lamp not drawn`);
      return null;
    }
    const rec = {
      machine, anchor,
      radius: opts.radius ?? 0.13,
      phase: ((machine.id ?? this.records.length) * 0.618) % 1,
      state: 'calm', prev: 'calm', since: 0,
      aperture: LAMP_STATES.calm.aperture,
      dir: new THREE.Vector3(0, 0, 1), dirSet: false,
      beamOn: false,
    };
    this.records.push(rec);
    machine.lamp = rec;
    return rec;
  }

  detach(machine) {
    const i = this.records.findIndex((r) => r.machine === machine);
    if (i < 0) return false;
    const last = this.records.pop();
    if (i < this.records.length) this.records[i] = last;
    if (machine.lamp) machine.lamp = null;
    return true;
  }

  stateOf(machine) { return lampStateFor(machine); }

  /** Can the air carry a beam right now? (fog density > 1.2 or night) */
  beamsOn() { return this.fogK > BEAM.fogK || this.night > BEAM.night; }

  _airUpdate() {
    const env = this.ctx.environment;
    const w = env?.weatherParams;
    this.fogK = (w && Number.isFinite(w.densMul)) ? w.densMul : 1;
    this.night = env?.nightFactor ?? 0;
  }

  /**
   * Once per rendered frame (Machines.interpolate). Allocation-free: the
   * output-pass change test, the air and the barrel light are written out here
   * (not helper calls) so they run in this function's optimized code, and every
   * machine double is read through `machine.sc` (monomorphic). A re-solve runs
   * only when an output-pass input changed (rare; `_solve` is allocation-free too).
   */
  update() {
    this.beamDraws = 0;
    this.lampDraws = 0;
    const E = this.ctx.engine;
    const rr = E ? E.renderer : null, gu = E && E.grade ? E.grade.uniforms : null;
    if (rr && gu) {
      const e = rr.toneMappingExposure, c = gu.uContrast.value, sa = gu.uSaturation.value, mx = gu.uGradeMix.value;
      const bt = E.bloom ? E.bloom.threshold : 1.08, tm = rr.toneMapping;
      if (e !== this._pe || c !== this._pc || sa !== this._ps || mx !== this._pm || bt !== this._pb || tm !== this._pt) {
        this._pe = e; this._pc = c; this._ps = sa; this._pm = mx; this._pb = bt; this._pt = tm;
        this._solve(false);
      }
      // the lift / tint vectors change in place: the full signature is checked every 64 frames
      this._sigEvery = (this._sigEvery + 1) & 63;
      if (this._sigEvery === 0) this._solve(false);
    } else if (this._pe === -1) { this._pe = 0; this._solve(false); }
    const env = this.ctx.environment;
    // the air (fog density > 1.2 or night) and the barrel's sun + sky
    const wp = env ? env.weatherParams : null;
    const dm = wp ? wp.densMul : 1;
    this.fogK = (typeof dm === 'number' && dm === dm) ? dm : 1;
    const nf = env ? env.nightFactor : 0;
    this.night = typeof nf === 'number' ? nf : 0;
    if (env) {
      // (field writes, not Vector3.set: a double argument to a call that is not inlined is boxed)
      const u = this._uLight, sd = env.sunDir, sun = env.sun, hemi = env.hemi;
      if (sd) { const v = u.uSunDir.value; v.x = sd.x; v.y = sd.y; v.z = sd.z; }
      if (sun) { const ks = sun.intensity / Math.PI, v = u.uSunRad.value, c = sun.color; v.x = c.r * ks; v.y = c.g * ks; v.z = c.b * ks; }
      if (hemi) { const kh = hemi.intensity / Math.PI, v = u.uSkyRad.value, c = hemi.color; v.x = c.r * kh; v.y = c.g * kh; v.z = c.b * kh; }
    }
    const t = E ? E.simTime : performance.now() / 1000;
    const dt = this._lastT < 0 ? 0 : Math.min(0.25, Math.max(0, t - this._lastT));
    this._lastT = t;
    const ease = 1 - Math.exp(-IRIS_RATE * dt);
    const recs = this.records;
    const L = this._aLamp.array, I = this._aIris.array, K = this._aCore.array, B = this._aBeam.array;
    const dark = this.hdr.dark;
    const air = this.fogK > BEAM.fogK || this.night > BEAM.night;
    let scale = -1;                         // perceptionScale, read only if a beam is drawn
    const fogBoost = Math.min(2.5, 0.6 + 0.8 * Math.max(0, this.fogK - 1) + 0.9 * this.night);
    const player = this.ctx.player;
    let n = 0, nb = 0;
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      const m = r.machine;
      // self-prune: a disposed machine, or an anchor no longer in the scene
      if (m._disposed || !r.anchor.parent) {
        recs[i] = recs[recs.length - 1];
        recs.pop();
        if (m.lamp === r) m.lamp = null;
        i--;
        continue;
      }
      const s = lampStateFor(m);
      if (s !== r.state) { r.prev = r.state; r.state = s; r.since = t; }
      const spec = LAMP_STATES[s];
      // aperture eases toward the state (the iris moves in ~0.15 s); constants, not a keyed double load
      let target = s === 'calm' ? AP_CALM : s === 'wary' ? AP_WARY : s === 'hostile' ? AP_HOSTILE : 0;
      const age = t - r.since;
      let colourId = s;
      // lampGain(s, t, phase), written out (a double return from a call would box)
      const tp = t + r.phase;
      const stateGain = s === 'wary' ? PULSE_LOW + (1 - PULSE_LOW) * (0.5 + 0.5 * Math.cos(2 * Math.PI * tp))
        : s === 'hostile' ? ((tp * 4) % 1 < 0.5 ? 1 : FLICKER_LOW) : 1;
      let gain = stateGain;
      if (s === 'dark' && age < SPUTTER_S && r.prev !== 'dark') {
        // sputter, then out: the previous colour stutters through a closing iris
        const on = Math.sin(t * 97.0 + r.phase * 13.0) > 0.1;
        const pa = r.prev === 'calm' ? AP_CALM : r.prev === 'wary' ? AP_WARY : r.prev === 'hostile' ? AP_HOSTILE : 0;
        target = on ? pa * (1 - age / SPUTTER_S) : 0;
        colourId = r.prev;
        gain = on ? 0.9 : 0.2;
      }
      r.aperture += (target - r.aperture) * ease;
      if (Math.abs(target - r.aperture) < 0.004) r.aperture = target;

      r.anchor.updateWorldMatrix(true, false);
      // the instance matrix = the anchor's world matrix with its basis rescaled to the lamp radius,
      // written element by element (Matrix4.decompose + compose box doubles: 16 B per lamp measured)
      {
        const te = r.anchor.matrixWorld.elements, im = this.lampMesh.instanceMatrix.array, ob = n * 16, rad = r.radius;
        for (let c = 0; c < 12; c += 4) {
          const a = te[c], b = te[c + 1], d = te[c + 2];
          const k = rad / (Math.sqrt(a * a + b * b + d * d) || 1);
          im[ob + c] = a * k; im[ob + c + 1] = b * k; im[ob + c + 2] = d * k; im[ob + c + 3] = 0;
        }
        im[ob + 12] = te[12]; im[ob + 13] = te[13]; im[ob + 14] = te[14]; im[ob + 15] = 1;
      }
      const h = this.hdr[colourId];
      const o = n * 4;
      L[o] = h.r * gain; L[o + 1] = h.g * gain; L[o + 2] = h.b * gain;
      L[o + 3] = APERTURE_MAX * Math.sqrt(Math.max(0, r.aperture));
      const kc = this.core[colourId];
      K[o] = kc.r * gain; K[o + 1] = kc.g * gain; K[o + 2] = kc.b * gain; K[o + 3] = 0;
      I[o] = dark.r; I[o + 1] = dark.g; I[o + 2] = dark.b;
      I[o + 3] = s === 'dark' ? 1 : 0;
      n++;

      // ---- the beam ----
      r.beamOn = false;
      if (air && spec.beam && nb < this.capacity && !m.lowLOD) {
        r.anchor.matrixWorld.decompose(_p, _q, _s);      // (beams only: fog or night)
        if (spec.beam === 'lock' && player) {
          _t.x = player.position.x; _t.y = player.position.y + 1.3; _t.z = player.position.z;
        } else if (m.lastKnown) {
          _t.x = m.lastKnown.x; _t.y = (m.lastKnown.y || m.position.y) + 1.0; _t.z = m.lastKnown.z;
        } else {
          _t.copy(_z).applyQuaternion(_q).multiplyScalar(10).add(_p);
        }
        _d.subVectors(_t, _p);
        if (_d.lengthSq() < 1e-6) _d.copy(_z).applyQuaternion(_q);
        _d.normalize();
        if (spec.beam === 'sweep') {
          const a = (BEAM.sweepDeg * Math.PI / 180) * Math.sin(2 * Math.PI * spec.sweepHz * (t + r.phase));
          _qs._x = 0; _qs._y = Math.sin(a * 0.5); _qs._z = 0; _qs._w = Math.cos(a * 0.5);   // setFromAxisAngle(up, a)
          _d.applyQuaternion(_qs);
        }
        if (!r.dirSet) { r.dir.copy(_d); r.dirSet = true; }
        r.dir.lerp(_d, 0.2).normalize();
        if (scale < 0) scale = perceptionScale(this.ctx.environment);
        const sr = m.sightRange;
        const len = Math.max(2, (sr || 30) * scale);
        const rad = len * Math.tan(BEAM.halfAngleDeg * Math.PI / 180);
        _qs.setFromUnitVectors(_z, r.dir);
        _s.x = rad; _s.y = rad; _s.z = len;
        _m.compose(_p, _qs, _s);
        _m.toArray(this.beamMesh.instanceMatrix.array, nb * 16);
        const lc = this.lin[s];
        const k = 0.22 * fogBoost * stateGain;
        const ob = nb * 4;
        B[ob] = lc.r * k; B[ob + 1] = lc.g * k; B[ob + 2] = lc.b * k; B[ob + 3] = 1;
        r.beamOn = true;
        nb++;
      } else {
        r.dirSet = false;
      }
    }
    this.lampMesh.count = n;
    this.lampMesh.visible = n > 0;
    this.beamMesh.count = nb;
    this.beamMesh.visible = nb > 0;
    this.beamCount = nb;
    if (n) {
      this.lampMesh.instanceMatrix.needsUpdate = true;
      this._aLamp.needsUpdate = true;
      this._aIris.needsUpdate = true;
      this._aCore.needsUpdate = true;
    }
    if (nb) {
      this.beamMesh.instanceMatrix.needsUpdate = true;
      this._aBeam.needsUpdate = true;
    }
  }

  audit() {
    return {
      lamps: this.records.length, beams: this.beamCount, capacity: this.capacity,
      lampDraws: this.lampDraws, beamDraws: this.beamDraws, solves: this.solves,
      fogK: +this.fogK.toFixed(3), night: +this.night.toFixed(3), beamsOn: this.beamsOn(),
      states: this.records.reduce((a, r) => { a[r.state] = (a[r.state] || 0) + 1; return a; }, {}),
    };
  }

  dispose() {
    if (this._scene && this._scene.onBeforeRender?.name === 'lampsOverrideSkip') this._scene.onBeforeRender = this._sceneHook || (() => {});
    this._scene = null;
    this.group.parent?.remove(this.group);
    this.lampMesh.geometry.dispose();
    this.beamMesh.geometry.dispose();
    this._lampMat.dispose();
    this._beamMat.dispose();
    this.lampMesh.dispose();
    this.beamMesh.dispose();
    for (const r of this.records) if (r.machine.lamp === r) r.machine.lamp = null;
    this.records.length = 0;
  }
}
