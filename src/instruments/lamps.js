import * as THREE from 'three';
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
 * THE COLOUR ON SCREEN IS THE TOKEN. The engine tone-maps (ACES), sRGB-encodes
 * and grades every pixel in one output pass (`engine.js` OutputGradeShader), so
 * a lens filled with the token's linear value would land on screen as a
 * different colour. The lens instead carries the HDR value that the output
 * pass maps BACK onto the token: `OutputInverse` inverts the grade, the sRGB
 * transfer and the ACES fit analytically, then refines against an exact copy of
 * the forward transform. It re-solves only when the exposure or a grade
 * uniform changes (a signature compare per frame, no allocation). Every token's
 * HDR luminance stays under the bloom threshold (calm 0.98 < 1.08), so a lens
 * never blooms onto itself; lamps never cast shadows and are not fogged.
 *
 * Published on the manager as `machines.lamps`:
 *   lamps.attach(machine, anchor, { radius }) -> record    (machine.addLamp)
 *   lamps.detach(machine)
 *   lamps.stateOf(machine) -> 'calm' | 'wary' | 'hostile' | 'dark'
 *   lamps.lampHdr(stateId) -> { r, g, b }   the solved lens value (gates)
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

/** Fraction of the disc radius the fully open aperture reaches (the rim is outside it). */
export const APERTURE_MAX = 0.86;
/** Rhythm troughs: the lens never goes fully dark while it is alive. */
const PULSE_LOW = 0.55;
const FLICKER_LOW = 0.3;
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
  if ((m.lampDarkT || 0) > 0 || (m.stunT || 0) > 0) return 'dark';
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

function inv3(m) {
  const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}
const ACES_IN_INV = inv3(ACES_IN);
const ACES_OUT_INV = inv3(ACES_OUT);
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

/**
 * Exact forward copy of the engine's output pass at the screen centre
 * (no vignette): HDR linear -> display sRGB (0..1).
 */
export function outputForward(x, P, out = [0, 0, 0]) {
  const t = [0, 0, 0];
  const k = P.exposure / 0.6;
  const v = [x[0] * k, x[1] * k, x[2] * k];
  if (P.aces) {
    mul3(ACES_IN, v, t);
    t[0] = acesFit(t[0]); t[1] = acesFit(t[1]); t[2] = acesFit(t[2]);
    mul3(ACES_OUT, t, v);
  } else {
    v[0] = x[0] * P.exposure; v[1] = x[1] * P.exposure; v[2] = x[2] * P.exposure;
  }
  const s = [oetf(sat01(v[0])), oetf(sat01(v[1])), oetf(sat01(v[2]))];
  const c = [0, 0, 0];
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

/** HDR linear value whose output-pass image is the sRGB triple `t` (0..1). */
export function outputInverse(t, P) {
  // 1. ungrade (gradeMix = 1 analytically; Newton below absorbs any other mix)
  let l = LUMA[0] * t[0] + LUMA[1] * t[1] + LUMA[2] * t[2];
  const c2 = [0, 0, 0];
  for (let it = 0; it < 24; it++) {
    const w = smooth(0.12, 0.86, l);
    for (let i = 0; i < 3; i++) c2[i] = t[i] / (P.shadow[i] + (P.highlight[i] - P.shadow[i]) * w);
    l = LUMA[0] * c2[0] + LUMA[1] * c2[1] + LUMA[2] * c2[2];
  }
  const s = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const c1 = l + (c2[i] - l) / P.saturation;
    s[i] = P.mix > 0.999 ? (c1 - 0.5 - P.lift[i]) / P.contrast + 0.5 : t[i];
  }
  // 2. un-encode; a channel at the clip aims a hair past it so it stays clipped
  const y = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const lin = srgbToLinear(sat01(s[i]));
    y[i] = t[i] >= 0.999 ? 1.004 : lin;
  }
  // 3. un-tonemap
  const x = [0, 0, 0];
  if (P.aces) {
    const f = mul3(ACES_OUT_INV, y, [0, 0, 0]);
    for (let i = 0; i < 3; i++) f[i] = acesFitInv(Math.min(1.0164, f[i]));
    mul3(ACES_IN_INV, f, x);
    const k = 0.6 / P.exposure;
    x[0] *= k; x[1] *= k; x[2] *= k;
  } else {
    x[0] = y[0] / P.exposure; x[1] = y[1] / P.exposure; x[2] = y[2] / P.exposure;
  }
  // 4. Newton on the exact forward (finite-difference Jacobian, clipped channels left alone)
  const fx = [0, 0, 0], fh = [0, 0, 0], J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let it = 0; it < 8; it++) {
    outputForward(x, P, fx);
    const r = [fx[0] - t[0], fx[1] - t[1], fx[2] - t[2]];
    for (let i = 0; i < 3; i++) if (t[i] >= 0.999 && fx[i] >= 0.9995) r[i] = 0;
    if (Math.abs(r[0]) + Math.abs(r[1]) + Math.abs(r[2]) < 1e-6) break;
    for (let j = 0; j < 3; j++) {
      const h = 1e-4 * Math.max(0.05, Math.abs(x[j]));
      const xs = [x[0], x[1], x[2]];
      xs[j] += h;
      outputForward(xs, P, fh);
      for (let i = 0; i < 3; i++) J[i][j] = (fh[i] - fx[i]) / h;
    }
    for (let i = 0; i < 3; i++) if (t[i] >= 0.999 && fx[i] >= 0.9995) { J[i] = [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0]; }
    let Ji;
    try { Ji = inv3(J); } catch (e) { break; }
    if (!Ji.every((row) => row.every(Number.isFinite))) break;
    const d = mul3(Ji, r, [0, 0, 0]);
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
  return P;
}

function paramSig(P) {
  return P.exposure + P.contrast * 3 + P.saturation * 7 + P.mix * 11 + (P.aces ? 13 : 0)
    + P.lift[0] * 17 + P.lift[1] * 19 + P.lift[2] * 23 + P.shadow[0] * 29 + P.shadow[1] * 31
    + P.shadow[2] * 37 + P.highlight[0] * 41 + P.highlight[1] * 43 + P.highlight[2] * 47;
}

/* ------------------------------------------------------------------ */
/* shaders                                                             */
/* ------------------------------------------------------------------ */

const IRIS_VERT = /* glsl */`
  attribute vec4 aLamp;   // rgb: lens HDR (already x rhythm gain), a: aperture radius 0..1
  attribute vec4 aIris;   // rgb: blade HDR, a: 1 = cracked (dark)
  varying vec2 vP;
  varying vec4 vLamp;
  varying vec4 vIris;
  void main() {
    vP = position.xy;
    vLamp = aLamp;
    vIris = aIris;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const IRIS_FRAG = /* glsl */`
  varying vec2 vP;
  varying vec4 vLamp;
  varying vec4 vIris;
  void main() {
    float r = length(vP);
    if (r > 1.0) discard;
    vec3 c;
    if (r < vLamp.a) {
      c = vLamp.rgb;
    } else if (r > 0.93) {
      c = vIris.rgb * 1.9;                 // bronze bezel
    } else {
      // six blades: a hairline seam per blade, swept with the radius
      float a = atan(vP.y, vP.x) / 6.2831853 + 0.5;
      float s = abs(fract(a * 6.0 + r * 0.55) - 0.5);
      float seam = 1.0 - smoothstep(0.0, 0.03, 0.5 - s);
      c = vIris.rgb * (1.0 - 0.45 * (1.0 - seam) * step(0.5, 1.0 - vIris.a));
      // a cracked (dark) iris: one wavering fracture across the closed blades and a branch
      // running off it below (never a symmetric cross: it must not read as a reticle)
      if (vIris.a > 0.5) {
        float k1 = abs(vP.y - 0.35 * vP.x - 0.08 + 0.05 * sin(vP.x * 23.0));
        float k2 = abs(vP.x + 0.6 * vP.y + 0.22 + 0.04 * sin(vP.y * 31.0)) + step(0.003, vP.y) * 10.0;
        c *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.025, min(k1, k2)));
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
      lift: [0, 0, 0], shadow: [1, 1, 1], highlight: [1, 1, 1] };
    this._sig = NaN;
    this.solves = 0;
    /** Solved lens HDR per state, and the blade colour (the dark token). */
    this.hdr = {};
    for (const id of LAMP_ORDER) this.hdr[id] = { r: 0, g: 0, b: 0 };
    /** Linear token colour per state (beam tint). */
    this.lin = {};
    for (const id of LAMP_ORDER) {
      const c = hexToRgb(LAMP_STATES[id].token);
      this.lin[id] = { r: srgbToLinear(c[0]), g: srgbToLinear(c[1]), b: srgbToLinear(c[2]) };
    }

    // ---- the iris discs: ONE instanced draw for every lamp ----
    const disc = new THREE.CircleGeometry(1, 40);
    this._aLamp = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this._aIris = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    disc.setAttribute('aLamp', this._aLamp);
    disc.setAttribute('aIris', this._aIris);
    this._lampMat = new THREE.ShaderMaterial({
      vertexShader: IRIS_VERT, fragmentShader: IRIS_FRAG,
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
    for (const id of LAMP_ORDER) {
      const x = outputInverse(hexToRgb(LAMP_STATES[id].token), P);
      const h = this.hdr[id];
      h.r = x[0]; h.g = x[1]; h.b = x[2];
    }
    this.solves++;
    return true;
  }

  /** The solved lens HDR for a state (gates; a copy). */
  lampHdr(id) { const h = this.hdr[id]; return h ? { r: h.r, g: h.g, b: h.b } : null; }

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

  /** Once per rendered frame (Machines.interpolate). Allocation-free. */
  update() {
    this.beamDraws = 0;
    this.lampDraws = 0;
    this._solve(false);
    this._airUpdate();
    const t = this.ctx.engine?.simTime ?? (performance.now() / 1000);
    const dt = Math.min(0.25, Math.max(0, t - (this._lastT ?? t)));
    this._lastT = t;
    const ease = 1 - Math.exp(-IRIS_RATE * dt);
    const recs = this.records;
    const L = this._aLamp.array, I = this._aIris.array, B = this._aBeam.array;
    const dark = this.hdr.dark;
    const air = this.beamsOn();
    const scale = perceptionScale(this.ctx.environment);
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
      // aperture eases toward the state (the iris moves in ~0.15 s)
      let target = spec.aperture;
      const age = t - r.since;
      let colourId = s;
      let gain = lampGain(s, t, r.phase);
      if (s === 'dark' && age < SPUTTER_S && r.prev !== 'dark') {
        // sputter, then out: the previous colour stutters through a closing iris
        const on = Math.sin(t * 97.0 + r.phase * 13.0) > 0.1;
        target = on ? LAMP_STATES[r.prev].aperture * (1 - age / SPUTTER_S) : 0;
        colourId = r.prev;
        gain = on ? 0.9 : 0.2;
      }
      r.aperture += (target - r.aperture) * ease;
      if (Math.abs(target - r.aperture) < 0.004) r.aperture = target;

      r.anchor.updateWorldMatrix(true, false);
      r.anchor.matrixWorld.decompose(_p, _q, _s);
      _s.setScalar(r.radius);
      _m.compose(_p, _q, _s);
      _m.toArray(this.lampMesh.instanceMatrix.array, n * 16);
      const h = this.hdr[colourId];
      const o = n * 4;
      L[o] = h.r * gain; L[o + 1] = h.g * gain; L[o + 2] = h.b * gain;
      L[o + 3] = APERTURE_MAX * Math.sqrt(Math.max(0, r.aperture));
      I[o] = dark.r; I[o + 1] = dark.g; I[o + 2] = dark.b;
      I[o + 3] = s === 'dark' ? 1 : 0;
      n++;

      // ---- the beam ----
      r.beamOn = false;
      if (air && spec.beam && nb < this.capacity && !m.lowLOD) {
        if (spec.beam === 'lock' && player) {
          _t.set(player.position.x, player.position.y + 1.3, player.position.z);
        } else if (m.lastKnown) {
          _t.set(m.lastKnown.x, (m.lastKnown.y || m.position.y) + 1.0, m.lastKnown.z);
        } else {
          _t.copy(_z).applyQuaternion(_q).multiplyScalar(10).add(_p);
        }
        _d.subVectors(_t, _p);
        if (_d.lengthSq() < 1e-6) _d.copy(_z).applyQuaternion(_q);
        _d.normalize();
        if (spec.beam === 'sweep') {
          const a = (BEAM.sweepDeg * Math.PI / 180) * Math.sin(2 * Math.PI * spec.sweepHz * (t + r.phase));
          _qs.setFromAxisAngle(_up, a);
          _d.applyQuaternion(_qs);
        }
        if (!r.dirSet) { r.dir.copy(_d); r.dirSet = true; }
        r.dir.lerp(_d, 0.2).normalize();
        const len = Math.max(2, (m.sightRange || 30) * scale);
        const rad = len * Math.tan(BEAM.halfAngleDeg * Math.PI / 180);
        _qs.setFromUnitVectors(_z, r.dir);
        _s.set(rad, rad, len);
        _m.compose(_p, _qs, _s);
        _m.toArray(this.beamMesh.instanceMatrix.array, nb * 16);
        const lc = this.lin[s];
        const k = 0.22 * fogBoost * lampGain(s, t, r.phase);
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
