import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MachineAI } from './ai/index.js';
import { REST_SITE } from '../../world/island/sites.js';
import { PLAY_RADIUS, EXTENT } from '../../world/island/extent.js';
import { Squads } from './ai/squad.js';
import { safeEmit, machineCtx } from './ai/emit.js';
import {
  perceptionCfg, engageCfg, elemThreshold, alarmRadius,
} from './ai/tables.js';
import { LAMP_STATES, lampStateFor, LAMP_RHYTHM } from '../../instruments/lamps.js';
import { VFX_COLORS } from '../../instruments/lib/vfx.js';

/**
 * Base Machine: state machine, perception, terrain-conforming steering,
 * part damage (weak points / armor / burn / stun), state-colored sensor glow,
 * death FX. Subclasses supply model config, procedural animation and attacks.
 */

const CAMP = REST_SITE;            // { x, z, r }: the Instrument no-spawn ring
const WORLD_LIMIT = PLAY_RADIUS + EXTENT.machineRim;

/**
 * Sensor colours by state — THE LAMP GRAMMAR (bible §7.2, `src/instruments/
 * lamps.js` LAMP_STATES; Round 5 W0b). The Round-4 values were Horizon's own
 * sensor canon; every machine (legacy kinds included, until they go at W2)
 * now glows in the CALIMA lamp tokens, and `_updateEyes` runs the lamp
 * rhythm from `lampStateFor` / `lampGain` (calm steady, wary 1 Hz pulse,
 * hostile 4 Hz flicker, dark sputter-then-out). An Instrument kind also
 * registers an iris lens + beam with `addLamp()`, drawn by `machines.lamps`.
 */
export const EYE_COLORS = {
  calm: new THREE.Color(LAMP_STATES.calm.token),
  wary: new THREE.Color(LAMP_STATES.wary.token),
  hostile: new THREE.Color(LAMP_STATES.hostile.token),
  dead: new THREE.Color(LAMP_STATES.dark.token),
  flash: new THREE.Color(3.0, 3.0, 2.55), // white-hot attack telegraph
};

/** VFX palette (A-vfx-palette): `src/instruments/lib/vfx.js`, re-exported here for older imports. */
export { VFX_COLORS };

/**
 * THE MACHINE FSM, CLOSED (Round 5, R17). These nine are every state the
 * update switch, the reactions and the death path handle; `setState` refuses
 * any other name, so no caller — a gate, the studio's cast panel, a stray
 * `forceState` — can park a machine in a state nothing runs (the ally state
 * of the mechanic R17 deleted was exactly such a name).
 */
export const MACHINE_STATES = Object.freeze([
  'patrol', 'suspicious', 'alert', 'search', 'attack', 'return', 'stagger', 'downed', 'dead',
]);
const STATE_SET = new Set(MACHINE_STATES);

const FROST_COLOR = new THREE.Color(VFX_COLORS.seizedTint);
const _flameLate = new THREE.Color(VFX_COLORS.flameLate);
const ELEM_DECAY = 7;      // buildup meter decay per second
const TELEGRAPH_T = 0.4;   // eye-flash duration at attack windup (legacy kinds' dodge cue)
/** Dark: the last colour sputters this long, then the lamp is out (bible §7.2). */
const LAMP_SPUTTER_S = 0.55;
const RHY_PULSE = LAMP_RHYTHM.pulseLow, RHY_FLICKER = LAMP_RHYTHM.flickerLow;
/** Bible §7.2 / §10: lamp glass emissive x2.5 (an Instrument's flat lens materials). */
const LAMP_GLASS_GAIN = 2.5;
/** A precise hit on the lamp darkens it this long (bible §7.3). */
const LAMP_DARK_S = 6;

/** Roll a loot spec [{id, n | min/max, chance?}] into concrete [{id, n}]. */
export function rollLoot(spec) {
  const out = [];
  for (const s of spec) {
    if (s.chance !== undefined && Math.random() > s.chance) continue;
    const n = s.n ?? (s.min !== undefined
      ? THREE.MathUtils.randInt(s.min, s.max ?? s.min) : 1);
    if (n > 0) out.push({ id: s.id, n });
  }
  return out;
}

// shared scratch (never allocate in hot loops)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _UP = new THREE.Vector3(0, 1, 0);
const _steerOpts = { radius: 1.2, look: 5 };
const _snapRay = new THREE.Raycaster();

let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

const _ringGeo = new THREE.TorusGeometry(1, 0.09, 8, 48);
const _ringGeoSoft = new THREE.TorusGeometry(1, 0.16, 8, 48);
const _sphereGeo = new THREE.SphereGeometry(1, 10, 8);


/**
 * STEERING SCRATCH. Doubles handed between the steering helpers travel through
 * this ONE monomorphic object, never as call arguments or return values: a
 * double that crosses a call V8 does not inline is boxed (a HeapNumber per
 * argument and per return), which on the staged fight was most of what the
 * steering frames allocated. Each helper copies its inputs to locals on entry
 * and writes its outputs on exit, so the nested calls may reuse the fields.
 *   want -> d          _turnS     (heading wanted -> signed difference before the step)
 *   x, z               _faceS     (face a point)
 *   x, z, speed -> out _moveTowardS / _navTowardS (point, speed -> distance)
 *   x, z, fx, fz, speed -> out _steerAlongS (direction, face point, speed -> metres)
 *   sx, sz             stepRootS  (the root step)
 */
export const _st = { want: 0.5, d: 0.5, x: 0.5, z: 0.5, fx: 0.5, fz: 0.5, speed: 0.5, out: 0.5, sx: 0.5, sz: 0.5 };

/**
 * The root step every mover shares — hunter-camp safe ring and world rim —
 * reading (`_st.sx`, `_st.sz`): allocation-free whether or not it is inlined.
 */
export function stepRootS(m) {
  const p = m.position;
  let nx = p.x + _st.sx;
  let nz = p.z + _st.sz;
  // hunter camp is a safe zone
  const cx = nx - CAMP.x, cz = nz - CAMP.z;
  const cd = Math.sqrt(cx * cx + cz * cz);
  const minR = CAMP.r + m.bodyRadius;
  if (cd < minR && cd > 0.001) {
    nx = CAMP.x + (cx / cd) * minR;
    nz = CAMP.z + (cz / cd) * minR;
  }
  const r = Math.sqrt(nx * nx + nz * nz);
  if (r > WORLD_LIMIT) { nx *= WORLD_LIMIT / r; nz *= WORLD_LIMIT / r; }
  p.x = nx;
  p.z = nz;
}
/** The same step with arguments (kept for callers outside the hot paths). */
export function stepRoot(m, dx, dz) { _st.sx = dx; _st.sz = dz; stepRootS(m); }


/**
 * HOT PATHS, NO PROTOTYPE LOADS (memory rule; instruments-core W0b fix round 1).
 * `this._turnS(dt)` on a machine is a megamorphic load of a PROTOTYPE property;
 * the game's megamorphic stub cache is far over capacity (a dozen machine
 * classes, three.js, every lane), and a miss on a prototype-held property
 * allocates a load handler — measured in node: 5.1 KB per frame for 7,200
 * such loads under that pressure, 3 B without it. The per-frame helpers are
 * therefore module functions called directly (`turnS(m, dt)`), monomorphic
 * calls with no property load; the `Machine` methods of the same names stay as
 * one-line wrappers for every other caller (species files, engage, squads,
 * search, gates).
 */
/** `Machine._updateFx` as a module function (see HOT PATHS, NO PROTOTYPE LOADS). */
export function updateFxM(m, dt) {
  const fx = m._fx;
  for (let i = fx.length - 1; i >= 0; i--) {
    if (!fx[i].update(dt)) fx.splice(i, 1);
  }
}

/** `Machine._turnS` as a module function (see HOT PATHS, NO PROTOTYPE LOADS). */
export function turnS(m, dt) {
  const sc = m.sc;
  let d = _st.want - sc.heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const lim = m.turnRate * dt;
  sc.heading += d < -lim ? -lim : d > lim ? lim : d;
  _st.d = d;
}

/** `Machine._faceS` as a module function (see HOT PATHS, NO PROTOTYPE LOADS). */
export function faceS(m, dt) {
  const p = m.position;
  _st.want = Math.atan2(_st.x - p.x, _st.z - p.z);
  turnS(m, dt);
}

/** `Machine._moveTowardS` as a module function (see HOT PATHS, NO PROTOTYPE LOADS). */
export function moveTowardS(m, dt) {
  const sc = m.sc, p = m.position;
  const dx = _st.x - p.x, dz = _st.z - p.z, speed = _st.speed;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.01) { _st.out = dist; return; }
  _st.want = Math.atan2(dx, dz);
  turnS(m, dt);
  const align = Math.cos(_st.d);
  const target = align > 0.25 ? speed * (align > 1 ? 1 : align) : 0;
  sc._speed += (target - sc._speed) * (1 - Math.exp(-5 * dt));
  const v = sc._speed * dt;
  const step = v < dist ? v : dist;
  _st.sx = Math.sin(sc.heading) * step; _st.sz = Math.cos(sc.heading) * step;
  stepRootS(m);
  _st.out = dist;
}

/** `Machine._steerAlongS` as a module function (see HOT PATHS, NO PROTOTYPE LOADS). */
export function steerAlongS(m, dt) {
  const sc = m.sc, p = m.position;
  let dx = _st.x, dz = _st.z;
  const faceX = _st.fx, faceZ = _st.fz, speed = _st.speed;
  const l = Math.sqrt(dx * dx + dz * dz);
  if (l < 1e-5) {
    sc._speed += (0 - sc._speed) * (1 - Math.exp(-6 * dt));
    _st.out = 0;
    return;
  }
  dx /= l; dz /= l;
  _st.want = Math.atan2(faceX - p.x, faceZ - p.z);
  turnS(m, dt);
  const fx = Math.sin(sc.heading), fz = Math.cos(sc.heading);
  const align = dx * fx + dz * fz;                 // 1 forward, 0 sideways
  const lx = dx - fx * align, lz = dz - fz * align;
  const lat = Math.sqrt(lx * lx + lz * lz);
  const lateral = lat < 1 ? lat : 1;
  const target = speed * (1 - 0.42 * lateral) * (align < -0.25 ? 0.55 : 1);
  sc._speed += (target - sc._speed) * (1 - Math.exp(-5 * dt));
  const step = sc._speed * dt;
  _st.sx = dx * step; _st.sz = dz * step;
  stepRootS(m);
  const md = m.moveDir;
  md.x = dx; md.y = 0; md.z = dz;
  sc.strafeK = (dz * fx - dx * fz);
  _st.out = step;
}

/** `Machine._navTowardS` as a module function (see HOT PATHS, NO PROTOTYPE LOADS). */
export function navTowardS(m, dt) {
  const nav = m.ctx.nav, p = m.position;
  const x = _st.x, z = _st.z, speed = _st.speed;
  const dx = x - p.x, dz = z - p.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.01) { _st.out = dist; return; }
  if (nav && nav.ready && nav.steer) {
    _v3.x = dx / dist; _v3.y = 0; _v3.z = dz / dist;
    _steerOpts.radius = m.bodyRadius;               // reused: nav.steer reads it and keeps nothing
    nav.steer(p, _v3, _v3, _steerOpts);
    _st.x = _v3.x; _st.z = _v3.z; _st.fx = p.x + _v3.x * 4; _st.fz = p.z + _v3.z * 4; _st.speed = speed;
    steerAlongS(m, dt);
    _st.out = dist;
    return;
  }
  moveTowardS(m, dt);
}

/** `Machine._conform` as a module function (see HOT PATHS, NO PROTOTYPE LOADS). */
export function conformM(m, dt) {
  const sc = m.sc, pos = m.position;
  const t = m.ctx.terrain;
  /* The terrain is sampled only when the root moved since the last sample (a
   * standing machine re-uses it exactly): terrain.getHeight / getNormal take
   * (x, z) numbers, and every call boxes both. */
  const x = pos.x, z = pos.z;
  if (sc._cgOk === 0 || x !== sc._cgx || z !== sc._cgz) {
    sc._cgy = t.getHeight(x, z);
    if (m.alignToTerrain) t.getNormal(x, z, m._gN);
    sc._cgx = x; sc._cgz = z; sc._cgOk = 1;
  }
  const gy = sc._cgy;
  if (!m._airborne) {
    const dy = pos.y - gy;
    pos.y = (dy > 4 || dy < -4) ? gy : pos.y + (gy - pos.y) * (1 - Math.exp(-12 * dt));
  }
  // the body normal eases toward the ground normal (or up), written out: no Vector3 call takes a double
  const n = m._normal, g = m.alignToTerrain ? m._gN : _UP;
  const k = dt * 3.5 < 1 ? dt * 3.5 : 1;
  const nx = n.x + (g.x - n.x) * k, ny = n.y + (g.y - n.y) * k, nz = n.z + (g.z - n.z) * k;
  const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  n.x = nx / nl; n.y = ny / nl; n.z = nz / nl;
  _q1.setFromUnitVectors(_UP, n);
  const hh = sc.heading * 0.5;
  _q2._x = 0; _q2._y = Math.sin(hh); _q2._z = 0; _q2._w = Math.cos(hh);   // setFromAxisAngle(UP, heading)
  m.root.quaternion.copy(_q1).multiply(_q2);
  // smoothed acceleration → pitch cue for subclass body motion
  sc._accelPitch += (sc._speed - sc._accelPitch) * (1 - Math.exp(-4 * dt));
}

/** `Machine._updateEyes` as a module function (see HOT PATHS, NO PROTOTYPE LOADS). */
export function updateEyesM(m, dt, t) {
  const sc = m.sc;
  const tt = m.ctx.engine?.simTime ?? t;
  const s = lampStateFor(m);
  if (s !== m._lampState) {
    m._lampPrev = m._lampState || 'calm';
    m._lampState = s;
    sc._lampSince = tt;
  }
  if (sc._lampPhase < 0) sc._lampPhase = Math.random();
  const phase = sc._lampPhase;
  let target;
  let pulse;
  if (s === 'dark') {
    const age = tt - sc._lampSince;
    if (age < LAMP_SPUTTER_S && m._lampPrev !== 'dark') {
      const pv = m._lampPrev;   // (no keyed load by a varying string: see lamps.js update())
      target = pv === 'calm' ? (m._eyeCalm || EYE_COLORS.calm) : pv === 'wary' ? EYE_COLORS.wary : pv === 'hostile' ? EYE_COLORS.hostile : EYE_COLORS.dead;
      pulse = Math.sin(tt * 97 + phase * 13) > 0.1 ? 0.9 : 0.15;
    } else {
      target = EYE_COLORS.dead;
      pulse = 0;
    }
  } else {
    target = s === 'calm' ? (m._eyeCalm || EYE_COLORS.calm) : s === 'wary' ? EYE_COLORS.wary : EYE_COLORS.hostile;
    // lampGain(s, tt, phase) written out: a double returned from a call is boxed
    const tp = tt + phase;
    pulse = s === 'wary' ? RHY_PULSE + (1 - RHY_PULSE) * (0.5 + 0.5 * Math.cos(2 * Math.PI * tp))
      : s === 'hostile' ? ((tp * 4) % 1 < 0.5 ? 1 : RHY_FLICKER) : 1;
  }
  const legacyCue = !m.lamp;
  if (legacyCue && sc._eyeFlare > 0) pulse *= 1 + sc._eyeFlare;
  sc._eyeFlare = 0;
  if (sc._telegraphT > 0 && m.alive) {
    sc._telegraphT -= dt;
    if (legacyCue) {
      // attack-windup telegraph (legacy kinds): eye burns white-hot for ~0.4 s
      target = EYE_COLORS.flash;
      pulse = Math.max(pulse, 2.6);
    }
  }
  // the colour eases toward the target (written out: no call takes a double)
  const ec = m._eyeColor;
  const ea = Math.min(1, dt * (target === EYE_COLORS.flash ? 25 : 12));
  const dr = target.r - ec.r, dg = target.g - ec.g, db = target.b - ec.b;
  const easing = dr * dr + dg * dg + db * db > 1e-12;
  if (easing) { ec.r += dr * ea; ec.g += dg * ea; ec.b += db * ea; }
  const lightK = m.state === 'dead' ? Math.max(0, 1 - sc._deathT * 0.55) : 1;
  const eyes = m._eyeMats;
  // nothing a lens shows changed (steady calm, a settled colour): no material is touched
  if (!easing && pulse === sc._ePulse && lightK === sc._eLight && eyes.length === sc._eN) return;
  sc._ePulse = pulse; sc._eLight = lightK; sc._eN = eyes.length;

  for (let i = 0; i < eyes.length; i++) {
    const e = eyes[i];
    if (e.kind === 'sprite' || e.kind === 'basic') {
      const k = pulse * (e.base ?? 1), c = e.mat.color;
      c.r = ec.r * k; c.g = ec.g * k; c.b = ec.b * k;
      // solid eye cores would linger as black balls on a dead machine
      if (e.kind === 'basic') e.mat.opacity = m.state === 'dead' ? 0 : 1;
    } else {
      const em = e.mat.emissive;
      em.r = ec.r; em.g = ec.g; em.b = ec.b;
      // an Instrument's lamp glass is the state colour at emissive x2.5 (bible §7.2 / §10 "lamp
      // glass ... emissive x2.5"): it clears the bloom threshold, so a lens reads at noon.
      // Written only when it changed (`e.last`): a store into a material is boxed.
      const v = m.lamp ? LAMP_GLASS_GAIN * pulse : e.base * pulse;
      if (v !== e.last) { e.mat.emissiveIntensity = v; e.last = v; }
    }
  }
  // death: EVERY light dies out (research 0.4) — body strips fade with the
  // eyes, and identity-colored part glows (canisters/loaders/vents) gutter (lightK above)
  const emis = m._emisMats, ek = (0.6 + pulse * 0.7) * lightK;
  if (ek !== sc._eEmis) { sc._eEmis = ek; for (let i = 0; i < emis.length; i++) emis[i].emissiveIntensity = ek; }
  if (lightK < 1) {
    for (let i = 0; i < m._partGlows.length; i++) {
      const g = m._partGlows[i];
      if (g.sprite) g.mat.opacity = g.base * lightK;
      else g.mat.emissiveIntensity = g.base * lightK;
    }
  }
}

/** `Machine._updateParts` as a module function (see HOT PATHS, NO PROTOTYPE LOADS). */
export function updatePartsM(m, dt, t) {
  const parts = m.parts;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.attached && p.update) p.update(dt, t, p);
  }
}

/** `Machine._updateElemental` as a module function (see HOT PATHS, NO PROTOTYPE LOADS). */
export function updateElementalM(m, dt) {
  const sc = m.sc;
  if (sc._elemHold > 0) {
    sc._elemHold -= dt;
  } else {
    const e = m.elemental;
    if (e.fire > 0) e.fire = Math.max(0, e.fire - ELEM_DECAY * dt);
    if (e.shock > 0) e.shock = Math.max(0, e.shock - ELEM_DECAY * dt);
    if (e.freeze > 0) e.freeze = Math.max(0, e.freeze - ELEM_DECAY * dt);
  }
  if (sc.brittleT > 0) {
    sc.brittleT -= dt;
    sc._iceClock -= dt;
    if (sc._iceClock <= 0 && !m.lowLOD) {
      sc._iceClock = 0.22;
      m._arcFlash(VFX_COLORS.saltGlint); // salt-crust glints crawling over seized plates
    }
  }
  const k = sc._frostK + ((sc.brittleT > 0 ? 1 : 0) - sc._frostK) * (1 - Math.exp(-5 * dt));
  if (Math.abs(k - sc._frostK) > 1e-4 || k > 0.003) {
    sc._frostK = k;
    m._applyFrost();
  }
}

/**
 * MONOMORPHIC HOT SCALARS — the memory rule (plan §0 rule 5, `A-alloc-rate`;
 * instruments-core W0b fix round 1, measured by `A-alloc-machines`).
 *
 * A machine is an instance of one of a dozen classes (every Instrument kind, the
 * legacy kinds until W2), so every `this.heading` read inside a shared `Machine`
 * method sees a dozen receiver maps: the access goes MEGAMORPHIC, and V8's
 * megamorphic load/store of a double field boxes the value — a fresh HeapNumber
 * per read and per write, measured at ~240 B per 40-machine pass in node and at
 * 1.8 MB/s in `Machines.update` + 0.6 MB/s in `_updateEyes` on the staged fight.
 * The per-frame doubles therefore live on ONE monomorphic object per machine,
 * `machine.sc` (this class, every field initialised in a fixed order), and the
 * hot paths read `const sc = this.sc; sc.heading` — a megamorphic load of an
 * OBJECT (no box) followed by monomorphic double loads (no box).
 *
 * Every other reader keeps the old name: `Machine.prototype` carries a get/set
 * pair per field (`m.heading` / `m.heading = x` read and write `m.sc.heading`),
 * so frozen files (gait, engage, squad, collision ...), species files, gates and
 * other lanes see no change. A field is moved here only if it is a number on
 * every machine at every time (never null / undefined), so its representation
 * stays Double, and only if it CHANGES per frame: the read-mostly doubles
 * (body radius, speeds, sight, height ...) stay own fields with a Tagged
 * representation instead (see the constructor), which every reader, frozen
 * files included, loads without a box.
 */
export const MACHINE_SCALARS = Object.freeze(['heading', '_speed', '_accelPitch', 'strafeK', 'suspicion', '_unseenT', '_stateT', 'playerDist', 'detectFill', 'scanOffset', 'health', 'lampDarkT', 'stunT', 'burnT', '_burnDps', '_flameClock', '_arcClock', 'brittleT', '_frostK', '_iceClock', '_elemHold', '_eyeFlare', '_telegraphT', '_deathT', '_waitT', '_lodAccum', '_lampSince', '_lampPhase', '_alarmCd', '_attackCd']);
export class MachineScalars {
  constructor() {
    this._cgOk = 0;     // _conform terrain sample cache: valid?
    this._cgx = 0.5;    //   at x
    this._cgz = 0.5;    //   at z
    this._cgy = 0.5;    //   ground height there
    this._ePulse = -1;  // _updateEyes: the pulse, light and lens count last written to the materials
    this._eLight = -1;
    this._eN = -1;
    this._eEmis = -1;   //   ...and the body-strip emissive last written
    /*
     * PUBLISHED BOXES for the doubles that frozen files read every frame through
     * the old names (`m.heading` in collision / gait / melee, `m._speed` and
     * `m._accelPitch` in gait / footlock): the getter returns ONE boxed copy per
     * change (`_pb*`, a Tagged field: returning it allocates nothing) instead of
     * a fresh HeapNumber per read. `_pv*` is the value that box holds.
     */
    this._pbheading = null; this._pbheading = 0; this._pvheading = 0.5;
    this._pb_speed = null; this._pb_speed = 0; this._pv_speed = 0.5;
    this._pb_accelPitch = null; this._pb_accelPitch = 0; this._pv_accelPitch = 0.5;
    this._pbstrafeK = null; this._pbstrafeK = 0; this._pvstrafeK = 0.5;
    this.heading = 0;
    this._speed = 0;
    this._accelPitch = 0;
    this.strafeK = 0;
    this.suspicion = 0;
    this._unseenT = 99;
    this._stateT = 0;
    this.playerDist = 999;
    this.detectFill = 0;
    this.scanOffset = 0;
    this.health = 0;
    this.lampDarkT = 0;
    this.stunT = 0;
    this.burnT = 0;
    this._burnDps = 0;
    this._flameClock = 0;
    this._arcClock = 0;
    this.brittleT = 0;
    this._frostK = 0;
    this._iceClock = 0;
    this._elemHold = 0;
    this._eyeFlare = 0;
    this._telegraphT = 0;
    this._deathT = 0;
    this._waitT = 0;
    this._lodAccum = 0;
    this._lampSince = 0;
    this._lampPhase = -1;
    this._alarmCd = 0;
    this._attackCd = 0;
  }
}

export class Machine {
  constructor(ctx, manager, opts) {
    /** The per-frame doubles (`MachineScalars`): FIRST, so every setter below lands in it. */
    this.sc = new MachineScalars();
    /**
     * READ-MOSTLY DOUBLES ARE TAGGED FIELDS. These are set once (spawn / species
     * / a gate) and read every frame by this file AND by frozen ones (gait,
     * collision, engage, the rig). Added with `null` first, each field takes V8's
     * Tagged representation: a megamorphic load then returns the stored number
     * as-is, with no HeapNumber copy — a Double-representation field is boxed on
     * every megamorphic read (measured: 122 B vs 1.6 B per 40-machine pass in
     * node). A write allocates once, which for these is never per frame.
     */
    this.turnRate = null; this.bodyRadius = null; this.walkSpeed = null; this.runSpeed = null;
    this.sightRange = null; this.sightHalf = null; this.eyeHeight = null; this.height = null;
    this.standoffHalfLen = null; this.hearRange = null; this.attackRange = null; this.maxHealth = null;
    /**
     * NOT the root ctx: a read-only, prototype-chained view of it whose
     * `events.emit` is `safeEmit` (see ai/emit.js). Species files write the
     * raw idiom `this.ctx.events.emit(...)` in eleven places — six of them
     * `player-damage` — and a subscriber that throws there used to take the
     * whole `Machines.update` loop into the engine quarantine. Every other
     * field, including ones other lanes install on ctx later, reads straight
     * through. `machine.ctx` is for READING; nothing here writes to it.
     */
    this.ctx = machineCtx(ctx);
    /** The un-facaded ctx, for anything that needs bus identity. */
    this.rootCtx = ctx;
    this.manager = manager;

    this.kind = opts.kind;
    this.displayName = opts.displayName;
    this.maxHealth = opts.maxHealth;
    this.health = this.maxHealth;
    this.armor = opts.armor ?? 0;
    this.alive = true;
    this.state = 'patrol';

    // steering / senses config
    this.walkSpeed = opts.walkSpeed ?? 2;
    this.runSpeed = opts.runSpeed ?? 6;
    this.turnRate = opts.turnRate ?? 2.2;
    this.sightRange = opts.sightRange ?? 40;
    this.sightHalf = opts.sightHalf ?? THREE.MathUtils.degToRad(50);
    this.hearRange = opts.hearRange ?? 26;
    this.stealthRange = opts.stealthRange ?? 8;
    this.eyeHeight = opts.eyeHeight ?? 1.5;
    this.attackRange = opts.attackRange ?? 3;
    this.bodyRadius = opts.bodyRadius ?? 1.2;
    this.territory = opts.territory ?? null; // { x, z, r }
    this.alignToTerrain = opts.alignToTerrain ?? true;

    /**
     * THE SCULPT MAY NOT BE THIS KIND'S YET (`machine-ai-expansion`).
     *
     * `kind` is the BEHAVIOUR identity — every table in `ai/tables.js`, the
     * doctrine in `ai/doctrine.js`, the site lifecycle and every gate key off
     * it. `modelKind` is which loaded sculpt the body is built from, and it is
     * normally the same string. It differs only while a Round-4 expansion
     * species has its behaviour shipped (this lane) and its mesh still in
     * flight (`machines-expansion` owns every species file and every donor
     * model): a Broadhead then thinks, fights, herds and dies as a Broadhead
     * on a Strider chassis. The moment `machines-expansion` registers a real
     * `Broadhead` class through `machines.registerKind()` the chassis is gone
     * and nothing else in this file changes — see `ai/doctrine.js` §CHASSIS.
     *
     * Everything that frees GPU memory must key off `modelKind`, not `kind`,
     * or a disposed proxy would free the donor species' shared buffers
     * (`ai/sites.js:protectedGeos`).
     */
    this.modelKind = opts.modelKind ?? this.kind;
    // model
    const src = ctx.assets.models[this.modelKind];
    this.size = src.size;
    this.height = src.size.y;
    // capsule half-length for player standoff: long bodies (snout/tail) must
    // not sweep through the player even when the CENTER keeps its distance
    this.standoffHalfLen = opts.standoffHalfLen
      ?? Math.max(0, Math.max(this.size.x, this.size.z) * 0.5 - this.bodyRadius);
    this.root = new THREE.Group();
    this.root.name = `${this.kind}-machine`;
    this.position = this.root.position;
    // body: procedural bob/sway/pitch in gameplay space (+Z forward);
    // holder: fixed yaw correction so every model faces +Z at heading 0.
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.holder = new THREE.Group();
    this.holder.rotation.y = opts.yawFix ?? 0;
    this.body.add(this.holder);
    this.model = opts.rigged ? skeletonClone(src.root) : src.root.clone();
    this.holder.add(this.model);

    // per-machine unique materials: elemental frost tint and state emissives
    // must never bleed onto the other clone of the same sculpt
    const _uniq = new Map();
    const _own = (m) => { if (!_uniq.has(m)) _uniq.set(m, m.clone()); return _uniq.get(m); };
    this.model.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      o.material = Array.isArray(o.material) ? o.material.map(_own) : _own(o.material);
    });

    // Mirrored (negative-scale) nodes render fine but are INVISIBLE to
    // raycasts under FrontSide culling (three tests winding in LOCAL space,
    // and WebGLRenderer flips frontFace for negative determinants — the
    // Raycaster does not). Arrows, aim assist and part hull-snaps must hit
    // both halves, so double-side exactly those meshes.
    this.model.updateWorldMatrix(true, true);
    this.model.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (o.matrixWorld.determinant() < 0) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.side = THREE.DoubleSide;
      }
    });

    // metal sanity: metalness-heavy PBR with no env goes jet-black in shadow.
    // Modest clamps (lead adds a scene env map in parallel) keep plates readable.
    this.model.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.metalness !== undefined) m.metalness = Math.min(m.metalness, 0.7);
        if (m.roughness !== undefined) m.roughness = Math.max(m.roughness, 0.35);
      }
    });

    const spawn = opts.spawn;
    this.spawnPos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.position.set(spawn.x, ctx.terrain.getHeight(spawn.x, spawn.z), spawn.z);
    this.heading = opts.heading ?? Math.random() * Math.PI * 2;

    this.route = opts.route ?? [this.spawnPos.clone()];
    this._wpIndex = 0;
    this._waitT = 0;

    // perception state
    this.suspicion = 0;
    this.lastKnown = new THREE.Vector3();
    this.playerDist = 999;
    this._visible = false;
    this._unseenT = 99;
    this.detectFill = 0;        // current sight fill rate (HUD stealth meter)
    this.scanOffset = 0;        // sensor sweep offset applied to the cone
    this.hearScale = opts.hearScale ?? 1;
    this._alarmCd = 0;
    this.elemThreshold = elemThreshold(this.kind);
    this.perceptCfg = perceptionCfg(this.kind);
    this.engageCfg = engageCfg(this.kind);
    this.alarmRadius = opts.alarmRadius ?? alarmRadius(this.kind);

    // AI-published motion channels.
    this.moveDir = new THREE.Vector3(0, 0, 1); // world XZ travel direction
    this.strafeK = 0;                          // -1..1 sideways component
    /**
     * `aiPose` is a PUBLISHED, normalised description of what the current
     * generic move is doing (0..1 / -1..1 per channel), offered to any lane
     * that wants to react to a telegraph — VFX, audio, machine-rig's authored
     * attack keyframes (machine-rig-08). Nothing reads it yet; it is a
     * contract, not a dependency, so the moves do NOT rely on it to be
     * visible: `ai/attacks.js` also writes the real `gait.pose` channels
     * (crouch / spineRear / spineYaw / tailYaw / headPitch / legLift / tuck)
     * directly, which gait.js consumes every frame.
     */
    this.aiPose = {                            // generic attack pose channels
      coil: 0, lunge: 0, charge: 0, sweep: 0, rear: 0, forage: 0,
    };
    this._react = { x: 0, y: 0, z: 0, k: 0, t: 0 }; // hit impulse for the rig

    // ecosystem / lifecycle
    this.escort = opts.escort ?? null;
    /**
     * THE HERD, HELD BY THE BASE (FIX ROUND 5).
     *
     * `opts.herd` used to be remembered only by the species files that happen
     * to implement herd doctrine — `strider.js` does `this.herd = opts.herd`.
     * The moment `machines-expansion` landed real `Broadhead` and `Grazer`
     * classes that do not, every herd behaviour keyed off `machine.herd` went
     * silently dead: `ai/doctrine.js` skipped its wiring, no stampede vector
     * was ever computed and no rearguard was ever posted, with nothing
     * throwing. A shared field belongs to the shared class, so nothing
     * downstream depends on a species file remembering to copy it.
     */
    this.herd = opts.herd ?? null;
    /**
     * ...AND ITS TWO SIBLINGS, FOR THE SAME REASON (FIX ROUND 2).
     *
     * `herd` above was made a spawn OPTION so a site respawn could replay it.
     * `convoy` and `basking` were left hard-initialised to `null`, and a squad
     * is only ever attached AFTER `spawn()` returns (`Squads.registerConvoy`
     * walks the members it was handed), so neither ever reached `opts`, neither
     * was stored in the MachineSite record, and `Squads.forget` dropped the
     * dead member with nothing putting the new one back. One dispose/respawn
     * cycle emptied the Shell-Walker column and the Snapmaw pool permanently:
     * `convoyMembers 2 -> 0`, `baskingMembers 2 -> 0`, both machines alive and
     * standing on the spot with no column and no pair. Measured, not argued.
     *
     * The handle is now placement like any other, written back into the site
     * record by `Squads._remember` and re-attached by `Squads.adopt` from
     * `Machines._spawnCls` — the one path every spawn and every respawn takes.
     */
    this.convoy = opts.convoy ?? null;
    this.basking = opts.basking ?? null;
    /** Never leaves `patrol` — see `setState` (casting-v4 §2.8, Tallneck). */
    this.docile = !!opts.docile;
    this.scavenge = null;
    this._site = opts._site ?? null;
    this._frozen = false;
    this._disposed = false;

    // combat state
    this.stunT = 0;
    this.burnT = 0;
    this._burnDps = 0;
    this._burnAnchor = new THREE.Vector3(); // body-local stuck-arrow point
    this._burnAnchorSet = false;
    this._arcClock = 0;
    this._eyeFlare = 0; // one-frame sensor flare (attack telegraphs)
    this.lampDarkT = 0; // a hit lamp is dark this long (bible §7.3)
    this.lamp = null;   // the iris lamp record (`addLamp`, `machines.lamps`)
    this.flagMark = null; // the Flag this machine is searching toward (`machines.perception`)
    this.dustOccluded = false; // Dust hides it from the player (Dust-sight outline flag)
    this._attack = null;
    this._attackCd = 1 + Math.random() * 2;
    this._speed = 0;
    this._accelPitch = 0;
    this._stateT = 0;
    this._alertEpisode = false;
    this._airborne = false;

    // death
    this._deathT = 0;
    this._deathSide = Math.random() < 0.5 ? 1 : -1;
    this._deathRoll = 0.9 + Math.random() * 0.3;
    this._deathTwist = (Math.random() - 0.5) * 0.9;
    this._beaconSpawned = false;

    // sensors / glow
    /**
     * PER-SPECIES CALM SENSOR COLOUR (casting-v4.md §5.1 — the Redeye).
     *
     * `EYE_COLORS.calm` is global, so a Redeye Watcher whose whole point is
     * that its IDLE sensor is already red could only ever be a recoloured
     * Watcher. `_eyeCalm` is the colour the `default` branch of
     * `_updateEyes` lerps to; every other state is unchanged, so a Redeye
     * still goes yellow when it is wary and white-hot on a telegraph.
     * Set from `ai/doctrine.js` at spawn; species files may set it too.
     */
    this._eyeCalm = opts.eyeCalm ? new THREE.Color(opts.eyeCalm) : EYE_COLORS.calm;
    this._eyeColor = this._eyeCalm.clone();
    this._eyeMats = [];   // sprite/basic materials fully colored by state
    this._emisMats = [];  // model emissive materials tinted by state
    this._collectEmissive();

    this.weakPoints = [];
    this._fx = [];
    /**
     * Every scene object an FX closure owns, so a corpse can be torn down
     * without leaking it (fix round 1: "disposing a wreck orphans its loot
     * beacon"). FX meshes are parented to `ctx.scene`, NOT to `root`, because
     * they must not inherit the machine's death crumple — which meant that
     * dropping `_fx` (freeze) or removing `root` (dispose) left every mesh
     * still in flight standing in the world forever, each one retaining the
     * whole disposed machine through `userData.machine`.
     */
    this._fxObjects = new Set();
    this._flameClock = 0;
    this.lowLOD = false;

    // --- component system (spec v2 machine parts contract)
    this.parts = [];
    this._partGlows = []; // identity-colored part emissives/sprites (die on death)
    this.elemental = { fire: 0, shock: 0, freeze: 0 };
    this._elemHold = 0;
    this.brittleT = 0;      // freeze status: impact x2 + frost tint
    this._frostK = 0;
    this._frostMats = null; // lazy-collected on first freeze
    this._iceClock = 0;
    this._telegraphT = 0;   // white-hot eye flash at attack windup
    this.level = opts.level ?? 1;
    this.elemWeak = opts.elemWeak ?? null;     // buildup x1.6
    this.elemResist = opts.elemResist ?? null; // buildup x0.5
    this.lootTable = [];    // rolled by subclasses (research doc tables)
    this._looted = false;
    this._lootRegistered = false;

    this._normal = new THREE.Vector3(0, 1, 0);
    // read every frame by the manager / engage frame on EVERY machine: own fields, never a
    // prototype-chain lookup of a missing name (see HOT PATHS, NO PROTOTYPE LOADS)
    this.meleeStandoffHalfLen = null;          // collision.js publishes the melee term here
    this._lampState = null;                    // _updateEyes: the lamp state last shown, and the one before
    this._lampPrev = 'calm';
    this._partsHidden = false;
    this._fleeing = false;
    this._downT = null; this._downT = 0;       // (Tagged: a flier's crit window, read on every machine)
    this._hasTickCd = typeof this.tickCooldowns === 'function';
    this._hasAnimate = typeof this.animate === 'function';
    this._gN = new THREE.Vector3(0, 1, 0);   // ground normal at the last terrain sample (_conform)

    this.root.traverse((o) => { o.userData.machine = this; });
    ctx.scene.add(this.root);

    // the brain: senses, footwork, search, move selection, hit reactions
    this.ai = new MachineAI(this);
  }

  /* --------- the hot scalars by their old names (see MachineScalars) --------- */
  get heading() { const sc = this.sc; if (sc.heading !== sc._pvheading) { sc._pbheading = sc.heading; sc._pvheading = sc.heading; } return sc._pbheading; }
  set heading(v) { this.sc.heading = v; }
  get _speed() { const sc = this.sc; if (sc._speed !== sc._pv_speed) { sc._pb_speed = sc._speed; sc._pv_speed = sc._speed; } return sc._pb_speed; }
  set _speed(v) { this.sc._speed = v; }
  get _accelPitch() { const sc = this.sc; if (sc._accelPitch !== sc._pv_accelPitch) { sc._pb_accelPitch = sc._accelPitch; sc._pv_accelPitch = sc._accelPitch; } return sc._pb_accelPitch; }
  set _accelPitch(v) { this.sc._accelPitch = v; }
  get strafeK() { const sc = this.sc; if (sc.strafeK !== sc._pvstrafeK) { sc._pbstrafeK = sc.strafeK; sc._pvstrafeK = sc.strafeK; } return sc._pbstrafeK; }
  set strafeK(v) { this.sc.strafeK = v; }
  get suspicion() { return this.sc.suspicion; }
  set suspicion(v) { this.sc.suspicion = v; }
  get _unseenT() { return this.sc._unseenT; }
  set _unseenT(v) { this.sc._unseenT = v; }
  get _stateT() { return this.sc._stateT; }
  set _stateT(v) { this.sc._stateT = v; }
  get playerDist() { return this.sc.playerDist; }
  set playerDist(v) { this.sc.playerDist = v; }
  get detectFill() { return this.sc.detectFill; }
  set detectFill(v) { this.sc.detectFill = v; }
  get scanOffset() { return this.sc.scanOffset; }
  set scanOffset(v) { this.sc.scanOffset = v; }
  get health() { return this.sc.health; }
  set health(v) { this.sc.health = v; }
  get lampDarkT() { return this.sc.lampDarkT; }
  set lampDarkT(v) { this.sc.lampDarkT = v; }
  get stunT() { return this.sc.stunT; }
  set stunT(v) { this.sc.stunT = v; }
  get burnT() { return this.sc.burnT; }
  set burnT(v) { this.sc.burnT = v; }
  get _burnDps() { return this.sc._burnDps; }
  set _burnDps(v) { this.sc._burnDps = v; }
  get _flameClock() { return this.sc._flameClock; }
  set _flameClock(v) { this.sc._flameClock = v; }
  get _arcClock() { return this.sc._arcClock; }
  set _arcClock(v) { this.sc._arcClock = v; }
  get brittleT() { return this.sc.brittleT; }
  set brittleT(v) { this.sc.brittleT = v; }
  get _frostK() { return this.sc._frostK; }
  set _frostK(v) { this.sc._frostK = v; }
  get _iceClock() { return this.sc._iceClock; }
  set _iceClock(v) { this.sc._iceClock = v; }
  get _elemHold() { return this.sc._elemHold; }
  set _elemHold(v) { this.sc._elemHold = v; }
  get _eyeFlare() { return this.sc._eyeFlare; }
  set _eyeFlare(v) { this.sc._eyeFlare = v; }
  get _telegraphT() { return this.sc._telegraphT; }
  set _telegraphT(v) { this.sc._telegraphT = v; }
  get _deathT() { return this.sc._deathT; }
  set _deathT(v) { this.sc._deathT = v; }
  get _waitT() { return this.sc._waitT; }
  set _waitT(v) { this.sc._waitT = v; }
  get _lodAccum() { return this.sc._lodAccum; }
  set _lodAccum(v) { this.sc._lodAccum = v; }
  get _lampSince() { return this.sc._lampSince; }
  set _lampSince(v) { this.sc._lampSince = v; }
  get _lampPhase() { return this.sc._lampPhase; }
  set _lampPhase(v) { this.sc._lampPhase = v; }
  get _alarmCd() { return this.sc._alarmCd; }
  set _alarmCd(v) { this.sc._alarmCd = v; }
  get _attackCd() { return this.sc._attackCd; }
  set _attackCd(v) { this.sc._attackCd = v; }

  /* ------------------------- setup helpers ------------------------- */

  _collectEmissive() {
    const seen = new Map();
    this.model.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.emissive) return;
      const m = o.material;
      const glows = m.emissiveMap || m.emissive.r + m.emissive.g + m.emissive.b > 0.05;
      if (!glows) return;
      if (!seen.has(m)) {
        const c = m; // already unique per machine (constructor material pass)
        // Flat emissive (no map) = sensor/glow bits -> full state color.
        // Lens/lamp materials: drop the (blue) emissive map so flat state
        // color shows. Body strips keep their map and only pulse intensity.
        const n = (m.name || '').toLowerCase();
        if (!m.emissiveMap) {
          this._eyeMats.push({ mat: c, base: 1.6, kind: 'emissive', last: -1 });
        } else if (n.includes('lense') || n.includes('lens') || n.includes('light')) {
          c.emissiveMap = null;
          this._eyeMats.push({ mat: c, base: 2.2, kind: 'emissive', last: -1 });
        } else {
          this._emisMats.push(c);
        }
        seen.set(m, c);
      }
      o.material = seen.get(m);
    });
  }

  /** Uniform world scale of a node (bones live in a scaled subtree). */
  _worldScale(node) {
    node.updateWorldMatrix(true, false);
    node.getWorldScale(_v3);
    return Math.max(_v3.x, 1e-6);
  }

  /** Add a state-colored glow sprite (+ optional solid core) at a local offset
   *  given in METERS (world units), regardless of the parent's scale.
   *  `intensity` scales the halo brightness (keep < 1 when the eye also has
   *  an emissive lens mesh, or the additive stack blows out to white). */
  addEye(parent, x, y, z, scale = 0.4, core = 0, intensity = 1) {
    const s = this._worldScale(parent);
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, toneMapped: false,
    });
    const spr = new THREE.Sprite(mat);
    spr.position.set(x / s, y / s, z / s);
    spr.scale.setScalar(scale / s);
    spr.userData.machine = this;
    spr.raycast = () => {}; // glow is FX, not a hitbox (weak hits must hit the model)
    parent.add(spr);
    this._eyeMats.push({ mat, base: intensity, kind: 'sprite', last: -1 });
    if (core > 0) {
      const cm = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true });
      const mesh = new THREE.Mesh(_sphereGeo, cm);
      mesh.scale.setScalar(core / s);
      mesh.position.set(x / s, y / s, z / s);
      mesh.userData.machine = this;
      mesh.raycast = () => {};
      parent.add(mesh);
      this._eyeMats.push({ mat: cm, base: 1, kind: 'basic', last: -1 });
    }
    return spr;
  }

  /**
   * THE IRIS LAMP (bible §7.2, instruments-core W0b; gates `A-lamp-states`,
   * `A-beams-one-draw`). Registers this machine's lens with `machines.lamps`,
   * which draws every lamp of every Instrument in ONE instanced draw (iris
   * aperture 100/50/20 %, closed when dark) and every beam in one more.
   *
   *   at    an Object3D whose origin is the lens centre and whose +Z is the
   *         lens axis, or a BODY-space [x, y, z] (an anchor facing +Z is made
   *         under `this.body`, so `buildRig` carries it on the nearest bone —
   *         call this BEFORE `buildRig`)
   *   opts  { radius = 0.13 } lens radius in metres
   * Returns the lamp record (`machine.lamp`), or null when no lamp system is
   * installed (a studio cast, a probe). The record is released on dispose.
   */
  addLamp(at, opts = {}) {
    let anchor = at;
    if (Array.isArray(at)) {
      const s = this._worldScale(this.body);
      anchor = new THREE.Object3D();
      anchor.name = 'lamp-anchor';
      anchor.position.set(at[0] / s, at[1] / s, at[2] / s);
      anchor.userData.machine = this;
      anchor.userData.lampAnchor = true;
      this.body.add(anchor);
    }
    this._lampAnchor = anchor;
    return this.manager?.lamps?.attach(this, anchor, opts) ?? null;
  }

  /** Weak-point sphere. Offset in meters; radius is in world meters.
   *  Returns the record — set `.enabled = false` for armor-hidden weak spots
   *  (canon strip loop: tear the plate, weak point comes online). */
  addWeakPoint(name, parent, x, y, z, radius, mult = 3) {
    const s = this._worldScale(parent);
    const obj = new THREE.Object3D();
    obj.position.set(x / s, y / s, z / s);
    obj.userData.machine = this;
    parent.add(obj);
    const rec = { name, obj, radius, mult, enabled: true };
    this.weakPoints.push(rec);
    return rec;
  }

  /**
   * Round-3 contract (gate A6): [{ name, world: Vector3, planted: bool }] for
   * every walking machine. Gait-controlled species report their IK feet;
   * native-boned subclasses (watcher) and non-walkers override.
   */
  debugFeet() {
    return this.gait ? this.gait.debugFeet() : [];
  }

  /** Testability: spawn wireframe markers at weak points for screenshots. */
  debugWeakPoints() {
    for (const wp of this.weakPoints) {
      const s = this._worldScale(wp.obj);
      const m = new THREE.Mesh(
        _sphereGeo,
        new THREE.MeshBasicMaterial({ color: 0xff30e0, wireframe: true, toneMapped: false }),
      );
      m.scale.setScalar(wp.radius / s);
      wp.obj.add(m);
    }
  }

  /* ------------------------- component parts ------------------------- */

  /**
   * Anchor a procedural add-on part (spec v2). `pos` is in METERS in parent
   * space (parent defaults to this.body: +Z forward, y up from the feet).
   * `snap: true` raycasts the sculpt so the part sits flush on the hull,
   * oriented +Y along the surface normal unless `orient: false`.
   */
  addPart(opts) {
    const parent = opts.parent ?? this.body;
    const s = this._worldScale(parent);
    const holder = new THREE.Group();
    holder.name = `part-${opts.name}`;
    holder.add(opts.mesh);
    const pos = new THREE.Vector3(...(opts.pos ?? [0, 0, 0]));
    let normal = null;
    if (opts.snap && parent === this.body) {
      // Sketchfab sculpts aren't reliably raycastable on both halves
      // (mirrored-node exports, one-sided shells): snap the authored point
      // AND its x-mirror, keep whichever lands closer to the author intent.
      let hit = this._snapToHull(pos, opts.snapTarget);
      const mp = pos.clone();
      mp.x = -mp.x;
      const mt = opts.snapTarget
        ? [-(opts.snapTarget[0] ?? 0), opts.snapTarget[1], opts.snapTarget[2]]
        : undefined;
      const mhit = this._snapToHull(mp, mt);
      if (mhit) {
        mhit.pos.x = -mhit.pos.x;
        mhit.normal.x = -mhit.normal.x;
        if (!hit || mhit.pos.distanceToSquared(pos) < hit.pos.distanceToSquared(pos)) {
          hit = mhit;
        }
      }
      if (hit) {
        pos.copy(hit.pos);
        normal = hit.normal;
        if (opts.proud) pos.addScaledVector(normal, opts.proud);
      }
    }
    holder.position.set(pos.x / s, pos.y / s, pos.z / s);
    holder.scale.setScalar(1 / s);
    if (normal && opts.orient !== false) holder.quaternion.setFromUnitVectors(_UP, normal);
    else if (opts.rot) holder.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);

    const tearHp = opts.tearHp ?? 40;
    const part = {
      name: opts.name,
      displayName: opts.displayName ?? opts.name,
      mesh: holder,
      tearHp,
      maxTearHp: tearHp,
      hp: opts.hp,
      attached: true,
      weak: !!opts.weak,
      weakMult: opts.weakMult ?? 2,
      tearable: Number.isFinite(tearHp),
      elemental: opts.elemental ?? null,   // 'blaze' | 'freeze' | null
      linkedAttack: opts.linkedAttack ?? null,
      loot: opts.loot ?? [],
      pickupWeapon: opts.pickupWeapon ?? null,
      settleY: opts.settleY ?? 0.24,
      sparkleWhileTorn: !!opts.sparkleWhileTorn,
      update: opts.update ?? null,
      onTorn: opts.onTorn ?? null,
      anchor: pos.clone(), // parent-local meters (for exposed-zone follow-ups)
      machine: this,
      interactable: null,
    };
    holder.traverse((o) => { o.userData.machine = this; o.userData.part = part; });
    // wire part emissives into the light systems:
    // - `userData.sensor` materials join the eye-state system (state color,
    //   telegraph flash, dark on death — "the light dies out")
    // - all other part glows keep their identity color but fade out on death
    holder.traverse((o) => {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (o.isSprite) {
          this._partGlows.push({ part, mat: m, sprite: true, base: m.opacity });
        } else if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.05) {
          if (m.userData?.sensor) {
            this._eyeMats.push({ mat: m, base: m.emissiveIntensity, kind: 'emissive', last: -1, part });
          } else {
            this._partGlows.push({ part, mat: m, sprite: false, base: m.emissiveIntensity });
          }
        }
      }
    });
    parent.add(holder);
    this.parts.push(part);
    return part;
  }

  /** Drop every live reference to a detached part's materials so state
   *  tinting (frost, eye state, death fade) never writes to debris or to
   *  disposed materials. Sensor lights on the part go dark (disconnected). */
  _purgePartRefs(part) {
    if (this._frostMats) {
      for (const f of this._frostMats) {
        if (f.part === part) f.m.color.copy(f.c); // un-tint the debris
      }
      this._frostMats = this._frostMats.filter((f) => f.part !== part);
    }
    this._eyeMats = this._eyeMats.filter((e) => {
      if (e.part !== part) return true;
      if (e.mat.emissive) {
        e.mat.emissive.copy(EYE_COLORS.dead);
        e.mat.emissiveIntensity = 0.4;
      }
      return false;
    });
    this._partGlows = this._partGlows.filter((g) => g.part !== part);
  }

  /**
   * Cast a ray from outside `pos` toward `target` (body-local meters) and
   * return the hull surface point + outward normal in body space, so parts
   * hug the sculpt regardless of per-model proportions.
   */
  _snapToHull(pos, target) {
    this.root.updateWorldMatrix(true, true);
    // NEVER raycast SkinnedMeshes here: at construction time the skeleton's
    // boneMatrices are still zeroed, so a skinned raycast computes (and
    // permanently caches) a degenerate mesh boundingSphere and returns
    // garbage hit points — this is what made the mixer species' bodies
    // vanish while their parts floated. Skinned models author part
    // positions directly (static sculpts are converted AFTER parts are
    // placed, so the autorig species still snap normally).
    const targets = [];
    this.model.traverse((o) => {
      if (o.isMesh && !o.isSkinnedMesh) targets.push(o);
    });
    if (!targets.length) return null;
    _v1.copy(pos);
    this.body.localToWorld(_v1);
    _v2.set(
      target?.[0] ?? 0,
      target?.[1] ?? pos.y,
      target?.[2] ?? pos.z * 0.3,
    );
    this.body.localToWorld(_v2);
    const dir = _v3.subVectors(_v2, _v1);
    const len = dir.length();
    if (len < 1e-4) return null;
    dir.divideScalar(len);
    _snapRay.set(_v1.clone().addScaledVector(dir, -this.height), dir);
    _snapRay.near = 0;
    _snapRay.far = this.height * 2 + len;
    _snapRay.camera = this.ctx.camera;
    const hits = _snapRay.intersectObjects(targets, false);
    if (!hits.length) return null;
    const h = hits[0];
    const n = h.face
      ? h.face.normal.clone().transformDirection(h.object.matrixWorld)
      : dir.clone().negate();
    if (n.dot(dir) > 0) n.negate(); // outward
    const q = this.body.getWorldQuaternion(_q1).invert();
    n.applyQuaternion(q).normalize();
    const local = this.body.worldToLocal(h.point.clone());
    return { pos: local.addScaledVector(n, 0.02), normal: n };
  }

  /**
   * True when an attack id is gated behind a part and EVERY part providing
   * it has been torn off (canon attack-removal loop).
   */
  attackDisabled(id) {
    let linked = false;
    for (const p of this.parts) {
      if (p.linkedAttack !== id) continue;
      linked = true;
      if (p.attached) return false;
    }
    return linked;
  }

  _updateParts(dt, t) { updatePartsM(this, dt, t); }

  _disposeSubtree(obj) {
    obj.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) m.dispose?.();
    });
  }

  /* --------------------- bone-anchored hit volumes --------------------- */

  /**
   * `machine-ai-13` — the query side of this lives in `ctx.hitHulls` (spatial):
   * per-bone capsules extracted from the skinned mesh, plus one per attached
   * component holder. These two calls are the machine-side seam.
   *
   * `hitVolumes()` is the descriptor list (bone name, owning part, capsule) —
   * `focus-items` wants it for `ui-10` part labels.
   */
  hitVolumes() {
    return this.ctx.hitHulls?.hulls?.(this) || [];
  }

  /**
   * Which bone volume does this world point land in? Used when a hit arrives
   * with no `object` (splash damage, a Critical Hit)
   * so it still attributes to a component instead of the body centre.
   * Not a hot path — one call per impact, never per frame.
   */
  resolveHitVolume(point) {
    const hulls = this.hitVolumes();
    if (!hulls.length) return null;
    let best = null, bd = Infinity;
    for (const h of hulls) {
      const ax = h.a[0], ay = h.a[1], az = h.a[2];
      const bx = h.b[0], by = h.b[1], bz = h.b[2];
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const len2 = dx * dx + dy * dy + dz * dz;
      let t = len2 > 1e-9
        ? ((point.x - ax) * dx + (point.y - ay) * dy + (point.z - az) * dz) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t, py = ay + dy * t, pz = az + dz * t;
      const d = Math.hypot(point.x - px, point.y - py, point.z - pz) - h.r;
      if (d < bd) { bd = d; best = h; }
    }
    return best ? { name: best.name, part: best.part, distance: +bd.toFixed(3) } : null;
  }

  /* ------------------------- damage contract ------------------------- */

  /**
   * Damage model v2 — three channels (spec v2):
   * hit = { point, object, impact, tear, element:'none'|'fire'|'shock'|'freeze',
   *         elementAmount, dir, type }
   * Backward compat: hit.baseDamage (round-1 combat) is treated as impact,
   * with legacy fire/shock arrow types mapped onto elemental buildup.
   * Returns { damage, tear, weak, killed, tornPart|null, triggeredElement|null }.
   */
  takeDamage(hit) {
    if (!this.alive) {
      return { damage: 0, tear: 0, weak: false, killed: false, tornPart: null, triggeredElement: null };
    }
    hit = hit || {};

    // --- channel mapping (legacy compat)
    let impact = hit.impact;
    let tear = hit.tear;
    let element = hit.element && hit.element !== 'none' ? hit.element : null;
    let elementAmount = hit.elementAmount ?? 0;
    if (impact === undefined && hit.baseDamage !== undefined) {
      impact = hit.baseDamage;
      if (tear === undefined) tear = hit.baseDamage * 0.35;
      if (!element) {
        if (hit.type === 'fire') { element = 'fire'; elementAmount = 40; }
        else if (hit.type === 'shock') { element = 'shock'; elementAmount = 45; }
        else if (hit.type === 'freeze') { element = 'freeze'; elementAmount = 40; }
      }
    }
    impact = impact ?? 0;
    tear = tear ?? 0;

    // --- which part owns the struck object?
    let part = null;
    let o = hit.object;
    while (o) {
      if (o.userData?.part) { part = o.userData.part; break; }
      o = o.parent;
    }
    if (part && !part.attached) part = null; // stray debris

    // machine-ai-13: no struck node (splash, crit, ally strike) — attribute the
    // hit to the bone volume it landed in rather than to the body centre
    let volume = null;
    if (part) {
      volume = { name: hit.object?.name || part.name, part: part.name };
    } else if (hit.point) {
      // only pay for the hull walk when the node lookup came up empty —
      // one call per impact, never per frame
      volume = this.resolveHitVolume(hit.point);
      if (volume && volume.part) {
        for (const q of this.parts) {
          if (q.name === volume.part && q.attached) { part = q; break; }
        }
      }
    }

    // --- impact channel (weak spots multiply IMPACT only)
    let mult = 1 - this.armor;
    let weak = false;
    if (hit.point) {
      for (const wp of this.weakPoints) {
        if (wp.enabled === false) continue; // still hidden under armor
        wp.obj.getWorldPosition(_v1);
        if (_v1.distanceToSquared(hit.point) <= wp.radius * wp.radius) {
          const wm = wp.mult ?? 3;
          mult = Math.max(mult, wm);
          if (wm >= 2) weak = true;
          // bible §7.3: a precise hit on the LAMP darkens it for 6 s (sight off)
          if (wp.name === 'lamp' && this.alive) this.lampDarkT = LAMP_DARK_S;
        }
      }
    }
    if (part?.weak) {
      mult = Math.max(mult, part.weakMult);
      if (part.weakMult >= 2) weak = true;
    }
    if (this.brittleT > 0) mult *= 2; // BRITTLE: frozen metal shatters
    const damage = impact * mult;
    this.health = Math.max(0, this.health - damage);

    // --- tear channel (rips components off; never touches health)
    let tornPart = null;
    if (part && part.tearable && tear > 0) {
      part.tearHp -= tear;
      if (part.tearHp <= 0) {
        tornPart = part;
        this._tearPart(part, hit);
      }
    }

    // --- element channel (canister detonation beats buildup)
    let triggeredElement = null;
    if (element) {
      const canister = part && part.attached && part.elemental
        && ((part.elemental === 'blaze' && element === 'fire')
          || (part.elemental === 'freeze' && element === 'freeze')
          || (part.elemental === 'shock' && element === 'shock'));
      if (canister) {
        triggeredElement = element;
        this._detonateCanister(part);
      } else if (elementAmount > 0) {
        /**
         * `combat-elemental-no-tier-scaling`: the meter stays 0..100 (the HUD
         * reads it that way) and the per-kind THRESHOLD scales the gain
         * instead — one Freeze arrow brittles a Watcher, nine a Thunderjaw.
         */
        let amt = elementAmount * (100 / this.elemThreshold);
        if (element === this.elemWeak) amt *= 1.6;
        if (element === this.elemResist) amt *= 0.5;
        this.elemental[element] = Math.min(100, (this.elemental[element] ?? 0) + amt);
        this._elemHold = 1.6;
        if (this.elemental[element] >= 100) {
          this.elemental[element] = 0;
          triggeredElement = element;
          this._triggerElement(element, hit.point);
        }
      }
    }

    /**
     * `machine-ai-03` / `stealth-omniscient-pursuit` — the single most
     * important line in this file. Being shot used to hand the machine the
     * player's EXACT live position and full alert, which is why stealth
     * collapsed after one arrow. Now:
     *   - a hit it SAW (or a melee hit, or one that lands while it already has
     *     eyes on her) escalates normally;
     *   - a hit it did NOT see plants partial suspicion at the reconstructed
     *     SHOT ORIGIN, with a couple of metres of error, and sends it hunting
     *     in that direction. It never learns where she is standing now.
     */
    const seen = hit.seen === true || this._visible
      || this.state === 'attack' || this.state === 'alert';
    if (seen) {
      this.suspicion = 1;
      this._unseenT = 0;
      if (this._visible && this.ctx.player) this.lastKnown.copy(this.ctx.player.position);
      else if (hit.point) { this.lastKnown.copy(hit.point); this.lastKnown.y = 0; }
    } else {
      const o = this.manager.shotOrigin ? this.manager.shotOrigin(hit) : null;
      const ox = o ? o.x : (hit.point ? hit.point.x : this.position.x);
      const oz = o ? o.z : (hit.point ? hit.point.z : this.position.z);
      this.ai.perception.unseenHit(ox, oz, 1);
      // a hit is loud: it also wakes the neighbours toward the same bearing
      this.manager.noise?.({
        x: this.position.x, z: this.position.z, kind: 'impact', source: this,
      });
    }

    this.emit('machine-damaged', {
      machine: this, damage, weak, point: hit.point,
      tear, tornPart, triggeredElement,
      volume: volume ? volume.name : null,   // bone/part label for focus-items
    });

    let killed = false;
    if (this.health <= 0) { killed = true; this._die(); }
    else {
      // escalate FIRST so the reaction's `resumeState` remembers the fight,
      // then react — a stagger must survive the escalation, not be undone by it
      const st = this.state;
      if (seen && (st === 'patrol' || st === 'suspicious' || st === 'search' || st === 'return')) {
        this.setState('alert');
      } else if (!seen && (st === 'patrol' || st === 'return')) {
        this.setState('suspicious');
      }
      // combat-machine-no-flinch / machine-ai-10: flinch, stagger, or go down
      this.ai.reactions.onDamage(damage, hit, tornPart);
    }
    return { damage, tear, weak, killed, tornPart, triggeredElement };
  }

  /* -------------------- elemental statuses & canisters -------------------- */

  _triggerElement(el, point) {
    if (el === 'fire') {
      this.burnT = 8;
      this._burnDps = 4 + this.maxHealth * 0.02;
      if (point) {
        this._burnAnchor.copy(point);
        this.body.worldToLocal(this._burnAnchor);
        this._burnAnchorSet = true;
      }
    } else if (el === 'shock') {
      this.stunT = Math.max(this.stunT, 3);
      this._cancelAttack();
    } else if (el === 'freeze') {
      this.brittleT = 8;
      _v1.copy(point ?? this.position);
      if (!point) _v1.y += this.height * 0.5;
      this._sparkBurst(_v1, 26, VFX_COLORS.saltGlint); // seized-crust shatter glints
    }
  }

  /** Matching-element hit on an attached canister: elemental explosion. */
  _detonateCanister(part) {
    if (!part.attached) return;
    part.attached = false;
    part.tearHp = 0;
    this._purgePartRefs(part); // materials are disposed right below
    part.mesh.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3().setFromMatrixPosition(part.mesh.matrixWorld);
    part.mesh.parent?.remove(part.mesh);
    this._disposeSubtree(part.mesh);

    const el = part.elemental === 'blaze' ? 'fire'
      : part.elemental === 'freeze' ? 'freeze' : 'shock';
    this._explosionFX(pos, el);
    const dmg = el === 'fire' ? 120 : 80; // AoE to the machine itself (spec v2)
    this.health = Math.max(0, this.health - dmg);
    this._triggerElement(el, pos);

    const p = this.ctx.player;
    if (p) {
      const d = pos.distanceTo(p.position);
      if (d < 5) {
        this.emit('player-damage', {
          amount: Math.max(6, Math.round(30 * (1 - d / 6))), from: this,
        });
        this.knockbackPlayer(9);
      }
      p._shake = Math.min(1, (p._shake ?? 0) + 0.45);
    }
    this.emit('machine-damaged', {
      machine: this, damage: dmg, weak: false, point: pos,
      tear: 0, tornPart: null, triggeredElement: el,
    });
  }

  /* ----------------------- part tear-off & physics ----------------------- */

  _tearPart(part, hit) {
    if (!part.attached) return;
    part.attached = false;
    part.tearHp = 0;
    // debris must never inherit frost tint / eye state / death fades
    this._purgePartRefs(part);
    const mesh = part.mesh;
    mesh.visible = true; // detached debris ignores the machine's part LOD
    this.ctx.scene.attach(mesh); // keep world transform
    // debris must not resolve as the machine for combat raycasts — shooting
    // a grounded part would otherwise damage the machine remotely
    mesh.traverse((o) => { delete o.userData.machine; });

    // launch: outward from the body + along the arrow + up
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 1.5,
      3.6 + Math.random() * 2.2,
      (Math.random() - 0.5) * 1.5,
    );
    _v1.subVectors(mesh.position, this.position);
    _v1.y = 0;
    if (_v1.lengthSq() > 1e-4) vel.addScaledVector(_v1.normalize(), 2.2);
    if (hit?.dir) { vel.x += hit.dir.x * 3; vel.z += hit.dir.z * 3; }
    const angVel = new THREE.Vector3(
      (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7,
    );
    _v1.copy(mesh.position);
    this._sparkBurst(_v1, 22);
    this._smokeBurst(_v1, 3);

    // lootable where it falls (items system lands concurrently — optional-chain)
    const entry = {
      position: mesh.position, // live ref: prompt follows the falling part
      radius: 2.4,
      label: part.pickupWeapon ? 'PICK UP' : 'LOOT',
      hold: 0.45,
      once: true,
      loot: part.loot,
      part,
      machine: this,
    };
    if (part.pickupWeapon) entry.pickupWeapon = part.pickupWeapon;
    const rec = { part, entry, done: false };
    // remembered so a disposed wreck takes its debris (and the debris'
    // interactable, which retains this Machine through `entry.machine`) with it
    (this._tornRecs ||= []).push(rec);
    entry.onInteract = () => this._removeTornPart(rec);
    part.interactable = this.ctx.interactables?.register?.(entry) ?? entry;

    // gravity + terrain bounce (2 bounces then settle), 60s despawn
    let life = 0;
    let bounces = 0;
    let settled = false;
    const settleY = part.settleY;
    const terrain = this.ctx.terrain;
    const dq = new THREE.Quaternion();
    const axis = new THREE.Vector3();
    rec.update = (dt) => {
      if (rec.done) return false;
      life += dt;
      if (life > 60) { this._removeTornPart(rec); return false; }
      if (!settled) {
        vel.y -= 21 * dt;
        mesh.position.addScaledVector(vel, dt);
        const wa = angVel.length();
        if (wa > 1e-4) {
          dq.setFromAxisAngle(axis.copy(angVel).divideScalar(wa), wa * dt);
          mesh.quaternion.premultiply(dq);
        }
        const gy = terrain.getHeight(mesh.position.x, mesh.position.z) + settleY;
        if (mesh.position.y <= gy) {
          mesh.position.y = gy;
          bounces += 1;
          if (bounces > 2 || Math.abs(vel.y) < 1.6) {
            settled = true;
            this._dustPuff(mesh.position.x, gy + 0.15, mesh.position.z, 0.9);
          } else {
            vel.y = -vel.y * 0.38;
            vel.x *= 0.55;
            vel.z *= 0.55;
            angVel.multiplyScalar(0.45);
            this._dustPuff(mesh.position.x, gy + 0.12, mesh.position.z, 0.7);
          }
        }
      } else if (part.sparkleWhileTorn && Math.random() < dt * 2) {
        axis.copy(mesh.position);
        axis.y += 0.35;
        this._sparkBurst(axis, 5); // live cables spitting sparks (disc launcher)
      }
      return true;
    };
    this._fx.push(rec);

    part.onTorn?.(part, this);
    this.emit('part-torn', { machine: this, part });
  }

  _removeTornPart(rec) {
    if (rec.done) return;
    rec.done = true;
    rec.entry.consumed = true;
    const mesh = rec.part.mesh;
    mesh.parent?.remove(mesh);
    this._disposeSubtree(mesh);
    rec.entry.machine = null;              // break the retain chain
    const i = this._tornRecs ? this._tornRecs.indexOf(rec) : -1;
    if (i >= 0) this._tornRecs.splice(i, 1);
  }

  /** Elemental explosion FX: fireball/ice-burst + ring + sparks + smoke. */
  _explosionFX(pos, el) {
    const V = VFX_COLORS;
    const hot = new THREE.Color(el === 'fire' ? V.cinderHot : el === 'freeze' ? V.brineHot : V.dustHot);
    const mid = new THREE.Color(el === 'fire' ? V.cinderMid : el === 'freeze' ? V.brineMid : V.dustMid);
    const late = new THREE.Color(el === 'fire' ? V.cinderLate : el === 'freeze' ? V.brineLate : V.dustLate);
    this.spawnShockRing(pos.x, pos.z, 5.5, 0.5, 0, 0);
    this._sparkBurst(pos, 34, mid.getHex());
    if (el === 'fire') this._smokeBurst(pos, 8);
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.SpriteMaterial({
        map: glowTexture(), transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      });
      mat.color.copy(i === 0 ? hot : mid);
      const s = new THREE.Sprite(mat);
      s.position.set(
        pos.x + (i === 0 ? 0 : (Math.random() - 0.5) * 1.6),
        pos.y + (i === 0 ? 0 : (Math.random() - 0.2) * 1.4),
        pos.z + (i === 0 ? 0 : (Math.random() - 0.5) * 1.6),
      );
      const s0 = i === 0 ? 1.6 : 0.7 + Math.random() * 0.7;
      s.scale.setScalar(s0);
      this._fxAdd(s);
      let t = 0;
      const dur = i === 0 ? 0.5 : 0.34 + Math.random() * 0.25;
      const from = mat.color.clone();
      this._fx.push({
        update: (dt) => {
          t += dt;
          const k = Math.min(1, t / dur);
          s.scale.setScalar(s0 + k * (i === 0 ? 5.5 : 2.4));
          s.position.y += dt * 1.4;
          mat.opacity = 0.95 * (1 - k * k);
          mat.color.lerpColors(from, late, k);
          if (k >= 1) { this._fxDrop(s); mat.dispose(); return false; }
          return true;
        },
      });
    }
  }

  _die() {
    if (this.state === 'dead') return;
    this.alive = false;
    this._cancelAttack();
    this.ai?.reactions.onDeath();
    this.ai?.search.stop();
    this.escort = null;
    this.scavenge = null;
    this.burnT = 0;
    this.stunT = 0;
    this._deathT = 0;
    this.setState('dead');
    _v1.copy(this.position); _v1.y += this.height * 0.55;
    this._sparkBurst(_v1, 46);
    this._smokeBurst(_v1, 10);
    this.emit('machine-killed', { machine: this });
  }

  /* ------------------------- state machine ------------------------- */

  setState(name) {
    const sc = this.sc;
    /**
     * DOCILE MACHINES NEVER LEAVE THE LOOP (casting-v4.md §2.8, the Tallneck).
     *
     * `PERCEPTION.tallneck` zeroes every sense and `REACT.tallneck` puts every
     * reaction threshold above 1.0 of maxHP, so nothing SHOULD flip it — but
     * "nothing should" is not a guarantee, and one stray `forceState`, alarm
     * recipient or scavenger claim would have a 25 m comms tower charging the
     * player. `docile` is the hard guard the card asks for: the only state a
     * docile machine may enter is its own patrol loop (and `dead`, which the
     * Tallneck's armour makes unreachable but which must not be blocked in
     * case another lane kills one deliberately).
     */
    if (this.docile && name !== 'patrol' && name !== 'dead') return;
    if (!STATE_SET.has(name)) return;
    if (this.state === name) return;
    const wasCalm = this.state === 'patrol' || this.state === 'return' || this.state === 'suspicious';
    const prev = this.state;
    this.state = name;
    sc._stateT = 0;
    if ((name === 'alert' || name === 'attack') && !this._alertEpisode) {
      this._alertEpisode = true;
      this.emit('machine-alerted', { machine: this });
      this.onAlerted?.(wasCalm);
      /**
       * THE FLAG (bible §7.4 Sightline, §4.7 "Shrug"; instruments-core W0b):
       * a machine whose perception row says `flags: true` (or one staged with
       * `flagsOnSight`) that goes hostile BY SIGHT with a lit lamp marks her
       * for `machines.perception.flagDuration` seconds.
       */
      if (this._visible && (this.flagsOnSight ?? this.perceptCfg?.flags) && !(sc.lampDarkT > 0)) {
        this.manager?.perception?.flagPlayer(this);
      }
    }
    if (name === 'patrol' || name === 'return') {
      this._alertEpisode = false;
      this.ai?.engage.reset();
    }
    if (name !== 'search') this.ai?.search.stop();
    // SPEC event: audio/HUD read state transitions instead of polling
    this.emit('machine-state', { machine: this, state: name, prev });
    this.onStateChange?.(name);
  }

  /** Testability hook: force a state; wires up sensible targets. */
  forceState(name) {
    const p = this.ctx.player;
    if (name === 'dead') { this.health = 0; this._die(); return; }
    if (name === 'stagger') { this.ai.reactions._stagger(0.9); return; }
    if (name === 'downed') { this.ai.reactions._down(); return; }
    if (name === 'alert' || name === 'attack' || name === 'search' || name === 'suspicious') {
      this.suspicion = name === 'suspicious' ? 0.6 : name === 'search' ? 0.5 : 1;
      this._unseenT = 0;
      if (p) this.lastKnown.copy(p.position);
      if (name === 'search') this.ai.beginSearch();
    }
    this._attackCd = 0;
    this.setState(name);
  }

  update(dt, t) {
    const sc = this.sc;
    if (this._disposed) return;
    if (this.state === 'dead') {
      // perf-tech-08: a frozen wreck costs nothing. The site manager flips
      // `_frozen` 10 s after death and disposes it entirely at ~82 s.
      if (this._frozen) return;
      this._updateDeath(dt);
      updateFxM(this, dt);
      updateEyesM(this, dt, t);
      return;
    }

    this.ai.tick(dt);
    sc._alarmCd = Math.max(0, sc._alarmCd - dt);
    if (sc.lampDarkT > 0) sc.lampDarkT = Math.max(0, sc.lampDarkT - dt);

    // attack-timer cooldowns tick unconditionally (lowLOD coarse steps and
    // stun must not freeze them — subclasses implement tickCooldowns)
    if (this._hasTickCd) this.tickCooldowns(dt);

    // burn DoT ticks even while stunned — sustained flames + smoke at the
    // stuck-arrow point (SPEC: "orange flame particles")
    if (sc.burnT > 0) {
      sc.burnT -= dt;
      sc.health -= sc._burnDps * dt;
      sc._flameClock -= dt;
      if (sc._flameClock <= 0 && !this.lowLOD) {
        sc._flameClock = 0.07;
        if (this._burnAnchorSet) {
          _v1.copy(this._burnAnchor);
          this.body.localToWorld(_v1);
        } else {
          _v1.copy(this.position);
          _v1.y += this.height * 0.5;
        }
        _v1.x += (Math.random() - 0.5) * 0.25;
        _v1.y += (Math.random() - 0.5) * 0.2;
        _v1.z += (Math.random() - 0.5) * 0.25;
        this._flamePuff(_v1);
        if (Math.random() < 0.3) this._burnSmoke(_v1);
      }
      if (sc.health <= 0) { this._die(); return; }
    }

    // elemental buildup decay + brittle/frost status (runs through stun too)
    updateElementalM(this, dt);

    if (sc.stunT > 0) {
      sc.stunT -= dt;
      // shock: frozen — shiver + jittering electric arcs (SPEC: "electric arcs")
      this.body.position.x = (Math.random() - 0.5) * 0.035;
      sc._arcClock -= dt;
      if (sc._arcClock <= 0 && !this.lowLOD) {
        sc._arcClock = 0.09;
        this._arcFlash();
      }
      sc._speed = 0;
      conformM(this, dt);
      updateFxM(this, dt);
      updateEyesM(this, dt, t);
      return;
    }
    this.body.position.x = 0;

    sc._stateT += dt;
    this._perceive(dt);

    // hit reactions own the frame while a stagger / downed window runs
    if (this.ai.reactions.update(dt)) {
      conformM(this, dt);
      if (!this.lowLOD) { if (this._hasAnimate) this.animate(dt, t); updatePartsM(this, dt, t); }
      updateFxM(this, dt);
      updateEyesM(this, dt, t);
      return;
    }

    switch (this.state) {
      case 'patrol': this._statePatrol(dt); break;
      case 'suspicious': this._stateSuspicious(dt); break;
      case 'alert': this._stateAlert(dt); break;
      case 'attack': this._engageFrame(dt); break;
      case 'search': this._stateSearch(dt); break;
      case 'return': this._stateReturn(dt); break;
      case 'stagger': this._stateStagger(dt); break;
      case 'downed': this._stateDowned(dt); break;
    }

    conformM(this, dt);
    if (!this.lowLOD) {
      if (this._hasAnimate) this.animate(dt, t);
      updatePartsM(this, dt, t); // radar spin, canister glow pulses, …
    }
    updateFxM(this, dt);
    updateEyesM(this, dt, t);
  }

  _updateElemental(dt) { updateElementalM(this, dt); }

  /** BRITTLE visual: whole-body frost tint (lazy per-machine material list).
   *  Entries remember their owning part so tear-off debris is un-tinted and
   *  dropped from the list (never write to detached/disposed materials). */
  _applyFrost() {
    if (!this._frostMats) {
      this._frostMats = [];
      this.body.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m.isMeshStandardMaterial || !m.color) continue;
          this._frostMats.push({ m, c: m.color.clone(), r: m.roughness, part: o.userData.part ?? null });
        }
      });
    }
    const k = this._frostK * 0.8;
    for (const f of this._frostMats) {
      f.m.color.copy(f.c).lerp(FROST_COLOR, k);
      f.m.roughness = THREE.MathUtils.lerp(f.r, 0.12, k);
    }
  }

  /* ------------------------- state machine ------------------------- */

  _statePatrol(dt) {
    const sc = this.sc;
    const c = this.perceptCfg;
    if (sc.suspicion > c.susEnter) { this.setState('suspicious'); return; }
    // ecosystem overrides of the plain waypoint loop (machine-ai-14)
    if (this.scavenge && Squads.stepScavenge(this, dt)) return;
    if (this.escort && Squads.stepEscort(this, dt)) return;
    // a calm convoy walks its shared route IN FILE behind the crate carrier
    // (casting-v4 §2.5); an alarmed one closes ranks and becomes an `escort`
    // anchored on the carrier, which the branch above already understands
    if (this.convoy && Squads.stepConvoy(this, dt)) return;
    /**
     * BASKING (casting-v4 §2.3). A Snapmaw on its bank does not walk a
     * waypoint loop — it lies there. The fidget is the whole idle: a slow
     * flank roll and a jaw twitch, no translation at all, which is why the
     * ambush works. It ends the moment suspicion crosses `susEnter` above.
     */
    if (this.basking) {
      const b = this._basking;
      if (b) {
        b.t += dt;
        sc._speed += (0 - sc._speed) * (1 - Math.exp(-8 * dt));
        sc.heading += Math.sin(b.t * 0.35 + b.phase) * dt * 0.12;
        this.aiPose.forage = 0.15 + 0.15 * Math.sin(b.t * 0.9 + b.phase);
        return;
      }
    }
    if (sc._waitT > 0) {
      sc._waitT -= dt;
      sc._speed += (0 - sc._speed) * (1 - Math.exp(-6 * dt));
      return;
    }
    const wp = this.route[this._wpIndex];
    _st.x = wp.x; _st.z = wp.z; _st.speed = this.walkSpeed;
    navTowardS(this, dt);
    const d = _st.out;
    if (d < this.bodyRadius + 0.6) {
      this._wpIndex = (this._wpIndex + 1) % this.route.length;
      sc._waitT = 1.2 + Math.random() * 2.4;
    }
  }

  /**
   * Suspicious: face the stimulus, then creep toward `lastKnown` — which is
   * where the NOISE was, never where the player is. A lure holds it there.
   */
  _stateSuspicious(dt) {
    const sc = this.sc;
    const c = this.perceptCfg;
    if (sc.suspicion >= c.alertAt) { this.setState('alert'); return; }
    if (sc.suspicion < 0.06 && this.ai.lureT <= 0) { this.setState('return'); return; }
    const lk = this.ai.lureT > 0 ? this.ai.lurePos : this.lastKnown;
    if (sc._stateT < 0.9) {
      _st.x = lk.x; _st.z = lk.z;
      faceS(this, dt);
      sc._speed += (0 - sc._speed) * (1 - Math.exp(-6 * dt));
      return;
    }
    _st.x = lk.x; _st.z = lk.z; _st.speed = this.walkSpeed * 0.7;
    navTowardS(this, dt);
    const d = _st.out;
    if (d < 2.5) {
      sc._speed += (0 - sc._speed) * (1 - Math.exp(-6 * dt));
      sc.heading += Math.sin(sc._stateT * 1.6) * dt * 0.9;
      if (this.ai.lureT <= 0) sc.suspicion = Math.max(0, sc.suspicion - dt * 0.3);
    }
    // nothing found where the noise was: sweep the area properly
    if (sc._stateT > 6 && this.ai.lureT <= 0) {
      this.ai.beginSearch();
      this.setState('search');
    }
  }

  _stateAlert(dt) {
    const sc = this.sc;
    const p = this.ctx.player;
    const face = this._visible && p ? p.position : this.lastKnown;
    _st.x = face.x; _st.z = face.z;
    faceS(this, dt);
    sc._speed += (0 - sc._speed) * (1 - Math.exp(-6 * dt));
    if (sc._stateT > 0.65) this.setState('attack');
  }

  /**
   * `machine-ai-02` / `machine-ai-15`: ONE combat frame, for every species.
   *
   * This logic used to live in `_stateAttack()` — which three species
   * (scrapper, glinthawk, strider) override. Those three therefore never
   * reached the engage layer OR the scored attack table: a Scrapper parked at
   * exactly 7 m, where its own if-ladder had a dead zone between `claw`
   * (< 3.4 m) and `laser` (> 7 m), and threw nothing at all for the whole
   * fight. `update()` now routes the `attack` state here instead — a name no
   * species overrides — so the band-work and the scored table always run.
   *
   * The two things those overrides owned that are NOT footwork are preserved
   * below by CAPABILITY rather than by class, because the species files belong
   * to `machine-rig`: a stampeding Strider (`_fleeing`/`_flee`, strider-07)
   * and a burn-grounded Glinthawk (`_downT`, its crit window). A follow-up is
   * filed to `machine-rig` to delete the now-dead `_stateAttack` overrides.
   */
  _engageFrame(dt) {
    const sc = this.sc;
    if (this._attack) { this._updateAttack(dt); return; }
    sc._attackCd -= dt;
    const p = this.ctx.player;
    if (!p) { this.setState('return'); return; }

    /**
     * KNIFE-RANGE CONTACT (fix round 1, `A41b-attack-coverage`).
     *
     * Everything below keys off `_visible`, and `_visible` is an OPTICAL
     * product — at 2 m it is the easiest thing in the world to lose (a rock
     * lip crossing two capsule centres, one perception tick of lag, a charge
     * that drove past her). When it broke mid-duel the frame fell through to
     * `pursue(lastKnown)`, which picks no move and sets no footwork mode, so
     * the machine walked INTO the player at 1.3 m and threw nothing for three
     * seconds — "broken AI at exactly the range players test first".
     *
     * `contact` is the non-optical half of an ALREADY-ENGAGED machine's
     * senses: inside `contactRange`, with its own `lastKnown` still accurate
     * to `contactSlack`, it may fight what it can hear and feel. It is not a
     * detection channel: only `attack` state reaches this function, it never
     * writes `lastKnown` (so it cannot reveal a position the machine has not
     * earned), and a machine that has genuinely lost her — stale belief —
     * gets nothing and keeps searching. See PERCEPTION.contactRange notes.
     */
    _v1.set(p.position.x - this.position.x, 0, p.position.z - this.position.z);
    const distNow = Math.sqrt(_v1.x * _v1.x + _v1.z * _v1.z);
    const cr = this.perceptCfg.contactRange ?? 0;
    let contact = false;
    if (!this._visible && cr > 0 && distNow <= cr + this.bodyRadius) {
      const bx = this.lastKnown.x - p.position.x, bz = this.lastKnown.z - p.position.z;
      const slack = this.perceptCfg.contactSlack ?? 2;
      contact = bx * bx + bz * bz <= slack * slack;
    }
    // in contact it has NOT lost her: the search countdown cannot mature
    if (contact) sc._unseenT = Math.min(sc._unseenT, 1.5);
    const engaged = this._visible || contact;

    if (sc._unseenT > 4.5) { this.ai.beginSearch(); this.setState('search'); return; }
    // soft leash (machine-ai-18): dragged too far from home, it disengages —
    // its senses keep working the whole way, only the pursuit gives up
    if (this.ai.engage.leashed()) { this.setState('return'); return; }

    // a stampede is flight, not engagement: the herd vector owns the frame
    if (this._fleeing && typeof this._flee === 'function') { this._flee(dt); return; }
    // a burn-grounded flier flops toward her: pure Critical Hit window
    if (this._downT > 0) {
      _st.x = p.position.x; _st.z = p.position.z; _st.speed = 1.4;
      moveTowardS(this, dt);
      return;
    }

    if (engaged) {
      this.ai.engage.noteSeen();
      this.ai.engage.update(dt, p.position.x, p.position.z);
    } else if (this.ai.engage.noteBlind(dt)) {
      /**
       * A LOST SIGHTLINE IS NOT A LOST FIGHT (FIX ROUND 3,
       * judge-machine-ai-r2 §2).
       *
       * `pursue` is LONG-HAUL travel — straight at the remembered point at
       * 0.9 x runSpeed, no band, no ring, no orbit — and every frame with no
       * line of sight used to go to it, however close she was. On open ground
       * that is invisible. On a Scrapper's own ground it is the whole fight:
       * 59 of 215 perception ticks in a solo duel had `collision.occluded`
       * true (31 of the 41 ticks at the 4 m mark — one rock), so each time the
       * machine backed out toward the 7-29 m `laser` it lost her behind that
       * rock, sprinted back to 1.3 m, re-acquired, and started the standoff
       * over. Its laser never fired on that ground and fired freely in the
       * open meadow, which is what pinned the cause to the ground rather than
       * to the table.
       *
       * So while the belief is fresh AND still at standoff range, keep working
       * the BAND against it: the machine strafes for a clear line instead of
       * charging the boulder. It still aims at `lastKnown` and never at the
       * live player, and it still cannot attack (selection below needs
       * `engaged`).
       *
       * BOUNDED BY ENGAGE'S OWN CLOCK (FIX ROUND 4, judge-machine-ai-r2-r1
       * §1). Round 3 bounded this with `_unseenT`, which every duel gate in
       * the lane pins to 0 — so under the lane's own staging the blind orbit
       * never expired and the machine could sweep for ever. `noteBlind(dt)`
       * advances `Engage._blindT`, which only `noteSeen()` (above, and only on
       * a frame the machine can genuinely fight her) clears, runs the
       * "I cannot see from here" give-up when it matures, and answers whether
       * the band still owns the frame. Past `beliefHold` it says no and the
       * pursuit below takes over; past `_unseenT > 4.5` the fight is a search.
       */
      this.ai.engage.update(dt, this.lastKnown.x, this.lastKnown.z);
    } else {
      // it knows roughly where she was; it does not know where she IS
      this.ai.engage.pursue(dt, this.lastKnown.x, this.lastKnown.z, this.runSpeed * 0.9);
    }
    // a flier holds its cruise altitude while it works the band (the flight
    // model owns y; `_steerAlong` only ever moves it in XZ)
    if (this._airborne && typeof this._fly === 'function') {
      this._fly(this.flyCruise ?? 11, dt);
    }
    if (engaged && sc._attackCd <= 0) {
      /**
       * Selection distance is measured HERE, not read from `playerDist`.
       *
       * `playerDist` is a perception product and refreshes on the perception
       * tick (`PERCEPTION.tick`, 0.1 s, deliberately staggered per machine so
       * 24 machines do not all raycast on the same frame). Move selection is
       * the one consumer that cannot tolerate that lag: a Strider closing at
       * 13 m/s is 1.3 m from where the last tick says it is, so a table row
       * chosen at the edge of its band could fire from outside it — the same
       * "throws a move that cannot reach" symptom as the dead zone the A41b
       * gate exists for, arriving by a different road. One hypot, and only on
       * the frames the machine is actually off its global attack cooldown.
       */
      _v1.set(p.position.x - this.position.x, 0, p.position.z - this.position.z);
      const a = this.ai.chooseAttack(Math.sqrt(_v1.x * _v1.x + _v1.z * _v1.z));
      if (a) this._startAttack(a);
    }
  }

  /** Legacy name — species `super._stateAttack(dt)` calls land on the frame. */
  _stateAttack(dt) { this._engageFrame(dt); }

  /** 12-20 s sweep of the cover around the last contact (machine-ai-11). */
  _stateSearch(dt) {
    const sc = this.sc;
    const c = this.perceptCfg;
    if (sc.suspicion >= c.alertAt) { this.ai.search.stop(); this.setState('alert'); return; }
    if (!this.ai.search.active) this.ai.beginSearch();
    if (!this.ai.search.update(dt)) {
      this.ai.search.stop();
      this.setState('return');
    }
  }

  _stateReturn(dt) {
    const sc = this.sc;
    const c = this.perceptCfg;
    if (sc.suspicion >= c.alertAt) { this.setState('alert'); return; }
    if (sc.suspicion > c.susEnter) { this.setState('suspicious'); return; }
    const wp = this.route[this._wpIndex];
    _st.x = wp.x; _st.z = wp.z; _st.speed = this.walkSpeed * 1.25;
    navTowardS(this, dt);
    const d = _st.out;
    if (d < this.bodyRadius + 1) {
      sc.suspicion = 0;
      this.ai.engage.reset();
      this.setState('patrol');
    }
  }

  /** Planted while a hit lands home (`machine-ai-10`); the rig reads `_react`. */
  _stateStagger(dt) {
    const sc = this.sc;
    sc._speed += (0 - sc._speed) * (1 - Math.exp(-8 * dt));
  }

  /** Down: the Critical Hit window. Reactions owns the timer. */
  _stateDowned(dt) {
    const sc = this.sc;
    sc._speed += (0 - sc._speed) * (1 - Math.exp(-8 * dt));
  }

  /* ------------------------- attacks ------------------------- */

  _startAttack(a) {
    const sc = this.sc;
    a.t = 0;
    a.struck = false;
    a.phase = 'windup';
    a.hit = false;
    this._attack = a;
    // canon dodge cue: white-hot eye flash at every attack windup
    sc._telegraphT = TELEGRAPH_T;
    this.emit('machine-telegraph', { machine: this });
    this.emit('machine-attack', { machine: this, kind: a.kind });
    this.emit('machine-attack-phase', { machine: this, kind: a.kind, attack: a.kind, phase: 'windup' });
    a.onWindup?.(a);
  }

  _updateAttack(dt) {
    const sc = this.sc;
    const a = this._attack;
    a.t += dt;
    const w = a.windup, s = a.strike, r = a.recover;
    const was = a.phase;
    if (a.t < w) {
      a.phase = 'windup'; a.phaseT = a.t / w;
      if (a.track !== false) {
        // track the target it can actually see; otherwise commit to lastKnown
        const p = this._visible ? this.ctx.player : null;
        const tgt = p ? p.position : this.lastKnown;
        _st.x = tgt.x; _st.z = tgt.z;
        faceS(this, dt);
      }
    } else if (a.t < w + s) {
      if (!a.struck) { a.struck = true; a.onStrike?.(a); }
      a.phase = 'strike'; a.phaseT = (a.t - w) / s;
    } else {
      a.phase = 'recover'; a.phaseT = (a.t - w - s) / r;
    }
    /**
     * `machine-ai-09` — planted windups. `_speed` is what the gait galloped on,
     * so a stationary windup used to run the legs at full tilt in place. Damp
     * it per phase unless the move declares its own root motion (`plant:false`
     * or `plant:'windup'` for a charge, which must gallop through the strike).
     */
    const plant = a.plant;
    if (plant !== false) {
      const planted = plant === 'windup'
        ? a.phase === 'windup' || a.phase === 'recover'
        : true;
      if (planted) sc._speed += (0 - sc._speed) * (1 - Math.exp(-10 * dt));
    }
    if (a.phase !== was) {
      this.emit('machine-attack-phase', { machine: this, kind: a.kind, attack: a.kind, phase: a.phase });
    }
    a.onUpdate?.(a, dt);
    if (a.t >= w + s + r) {
      a.cleanup?.(a);
      sc._attackCd = a.cooldown ?? 2.5;
      // miss recovery (machine-ai-08): a whiff backs it off and is remembered
      this.ai.picker.finish(a);
      // ...and the footwork re-chooses its standoff for the NEXT move, which
      // is what makes a whole moveset show up instead of the two moves that
      // happen to fit the radius it settled on (machine-ai-08)
      this.ai.engage.repick();
      if (a.needsHit && !a.hit) this.ai.engage.noteMiss();
      this.emit('machine-attack-phase', { machine: this, kind: a.kind, attack: a.kind, phase: 'end', hit: !!a.hit });
      this._attack = null;
    }
  }

  _cancelAttack() {
    const sc = this.sc;
    if (!this._attack) return;
    const a = this._attack;
    a.cleanup?.(a);
    this._attack = null;
    sc._attackCd = Math.max(sc._attackCd, 1.2);
    this.emit('machine-attack-phase', { machine: this, kind: a.kind, attack: a.kind, phase: 'cancel' });
  }

  /** Deal damage to the player if within range (and optionally in front arc). */
  damagePlayer(amount, maxRange, arcCos = -2) {
    const sc = this.sc;
    const p = this.ctx.player;
    if (!p) return false;
    _v1.subVectors(p.position, this.position);
    const d = Math.sqrt(_v1.x * _v1.x + _v1.z * _v1.z);
    if (d > maxRange) return false;
    if (arcCos > -1.5 && d > 0.01) {
      const fx = Math.sin(sc.heading), fz = Math.cos(sc.heading);
      if ((_v1.x * fx + _v1.z * fz) / d < arcCos) return false;
    }
    this.emit('player-damage', { amount, from: this });
    return true;
  }

  /**
   * Arc-limited damage measured against an arbitrary world bearing —
   * `machine-ai-13`'s rear 200-degree tail sweep uses this.
   */
  damagePlayerArc(amount, maxRange, bearing, arcCos) {
    const p = this.ctx.player;
    if (!p) return false;
    _v1.subVectors(p.position, this.position);
    const d = Math.sqrt(_v1.x * _v1.x + _v1.z * _v1.z);
    if (d > maxRange) return false;
    if (d > 0.01) {
      const fx = Math.sin(bearing), fz = Math.cos(bearing);
      if ((_v1.x * fx + _v1.z * fz) / d < arcCos) return false;
    }
    this.emit('player-damage', { amount, from: this });
    return true;
  }

  knockbackPlayer(strength) {
    const sc = this.sc;
    const p = this.ctx.player;
    if (!p || p.dodging) return;
    _v1.subVectors(p.position, this.position);
    _v1.y = 0;
    if (_v1.lengthSq() < 0.01) _v1.set(Math.sin(sc.heading), 0, Math.cos(sc.heading));
    _v1.normalize();
    p.velocity.x += _v1.x * strength;
    p.velocity.z += _v1.z * strength;
  }

  /* ------------------------- perception ------------------------- */

  /**
   * Senses live in `ai/perception.js` (machine-ai-03/04/05/06/12/19). This is
   * the seam: nothing else in this file may read `player.position` to decide
   * what a machine knows.
   */
  _perceive(dt) {
    this.ai.perception.update(dt);
  }

  /** Terrain + prop line of sight (machine-ai-04). */
  _hasLOS(target) {
    return this.ai.perception.hasLOS(target);
  }

  /** Squad alarm — recipients converge on THIS machine, not on the player. */
  alertNearby(radius) {
    return this.manager.alarm ? this.manager.alarm(this, radius) : 0;
  }

  /* ------------------------- steering ------------------------- */

  /* The steering helpers. The `S` forms read and write `_st` (see STEERING
   * SCRATCH) and take only `dt`; the named forms below keep their signatures
   * for every other caller (engage, squads, search, the species files). */

  /** Turn toward `_st.want` at `turnRate`; `_st.d` = the signed difference before the step. */
  _turnS(dt) { turnS(this, dt); }

  /** Face the point (`_st.x`, `_st.z`). */
  _faceS(dt) { faceS(this, dt); }

  /** Plain heading chase to (`_st.x`, `_st.z`) at `_st.speed`; `_st.out` = distance. */
  _moveTowardS(dt) { moveTowardS(this, dt); }

  /**
   * Combat footwork primitive (`machine-ai-02`): translate along (`_st.x`,
   * `_st.z`) while the heading turns toward (`_st.fx`, `_st.fz`). Sideways
   * travel costs speed, which is what keeps a circling predator readable rather
   * than a hovercraft. Publishes `moveDir` / `strafeK` for `machine-rig`'s gait.
   * `_st.out` = metres actually covered this frame.
   */
  _steerAlongS(dt) { steerAlongS(this, dt); }

  /**
   * Waypoint travel with the navgrid's whiskers applied (`machine-ai-01`) to
   * (`_st.x`, `_st.z`) at `_st.speed`; `_st.out` = distance. Falls back to the
   * plain heading chase when `ctx.nav` is not installed.
   */
  _navTowardS(dt) { navTowardS(this, dt); }

  _turnToward(want, dt) { _st.want = want; turnS(this, dt); return _st.d; }

  _face(x, z, dt) { _st.x = x; _st.z = z; faceS(this, dt); return _st.d; }

  _moveToward(x, z, speed, dt) { _st.x = x; _st.z = z; _st.speed = speed; moveTowardS(this, dt); return _st.out; }

  /** See `_steerAlongS`. @returns metres actually covered this frame. */
  _steerAlong(dx, dz, faceX, faceZ, speed, dt) {
    _st.x = dx; _st.z = dz; _st.fx = faceX; _st.fz = faceZ; _st.speed = speed;
    steerAlongS(this, dt);
    return _st.out;
  }

  /** See `_navTowardS`. @returns the distance to the point. */
  _navToward(x, z, speed, dt) { _st.x = x; _st.z = z; _st.speed = speed; navTowardS(this, dt); return _st.out; }

  /** Move the root directly (attack root-motion). Respects camp/world limits. */
  moveRoot(dx, dz) {
    this._applyStep(dx, dz);
  }

  _applyStep(dx, dz) {
    _st.sx = dx; _st.sz = dz;
    stepRootS(this);
  }

  _conform(dt) { conformM(this, dt); }

  /* ------------------------- death / fx ------------------------- */

  _updateDeath(dt) {
    const sc = this.sc;
    sc._deathT += dt;
    const k = THREE.MathUtils.smoothstep(Math.min(sc._deathT / 1.15, 1), 0, 1);
    // crash onto the side with a yaw twist — a wreck, not a parked machine.
    // Rigged subclasses shrink _deathRoll/_deathSink: their skeletons buckle
    // instead of the whole body sinking into the terrain as a blob.
    this.body.rotation.z = this._deathSide * this._deathRoll * k;
    this.body.rotation.x = 0.15 * k;
    this.body.rotation.y = this._deathTwist * k;
    this.body.position.y = -this.height * (this._deathSink ?? 0.1) * k;
    this.onDeathPose?.(k, sc._deathT); // subclass crumple (bones etc.)
    if (!this._beaconSpawned && sc._deathT > 1.4) {
      this._beaconSpawned = true;
      this._spawnBeacon();
    }
  }

  _spawnBeacon() {
    // corpse loot: register the lootable with the machine's rolled table
    // (items builder owns the take-all popup; optional-chain across builders)
    if (!this._lootRegistered) {
      this._lootRegistered = true;
      this._lootEntry = this.ctx.interactables?.register?.({
        position: this.position,
        radius: Math.max(2.6, this.bodyRadius + 1.6),
        label: 'LOOT',
        hold: 0.45,
        once: true,
        loot: this.lootTable,
        machine: this,
        onInteract: () => { this._looted = true; },
      });
    }
    const h = Math.max(4, this.height * 1.4);
    const geo = new THREE.CylinderGeometry(0.09, 0.16, h, 8, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: VFX_COLORS.beacon, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set(this.position.x, this.position.y + h / 2, this.position.z);
    beam.userData.machine = this;
    // own geometry: this cylinder was built for this one beacon
    this._beaconMesh = this._fxAdd(beam, true);
    let t = 0;
    // kept on the machine so the site manager can preserve it when it drops
    // every other FX entry at freeze time (perf-tech-08)
    this._beacon = {
      update: (dt2) => {
        t += dt2;
        if (this._looted) {
          // corpse emptied: the beacon dies out
          mat.opacity -= dt2 * 0.8;
          if (mat.opacity <= 0.01) { this.dropBeacon(); return false; }
          return true;
        }
        // fade out as the camera walks up so it never becomes a screen-tall slab
        const cam = this.ctx.camera;
        let fade = 1;
        if (cam) {
          const d = Math.hypot(
            cam.position.x - beam.position.x, cam.position.z - beam.position.z,
          );
          fade = THREE.MathUtils.smoothstep(d, 3.5, 11);
        }
        mat.opacity = (0.22 + Math.sin(t * 2.4) * 0.1) * fade;
        return true; // persistent loot beacon
      },
    };
    this._fx.push(this._beacon);
  }

  _sparkBurst(worldPos, n, color = 0xffc061) {
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 7 + 2;
      const sp = Math.random() * 6 + 1.5;
      vel[i * 3] = Math.cos(a) * sp;
      vel[i * 3 + 1] = up;
      vel[i * 3 + 2] = Math.sin(a) * sp;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color, size: 0.14, transparent: true, opacity: 1,
      map: glowTexture(), // soft round sparks, not bare squares
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.position.copy(worldPos);
    this._fxAdd(pts, true);   // own geometry: per-burst point cloud
    let life = 0;
    this._fx.push({
      update: (dt) => {
        life += dt;
        const arr = geo.attributes.position.array;
        for (let i = 0; i < n; i++) {
          vel[i * 3 + 1] -= 16 * dt;
          arr[i * 3] += vel[i * 3] * dt;
          arr[i * 3 + 1] += vel[i * 3 + 1] * dt;
          arr[i * 3 + 2] += vel[i * 3 + 2] * dt;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 1 - life / 1.1;
        if (life > 1.1) {
          this._fxDrop(pts); geo.dispose(); mat.dispose();
          return false;
        }
        return true;
      },
    });
  }

  _smokeBurst(worldPos, n) {
    // warm-gray wisps, capped near bodyRadius so smoke never blots the screen
    const cap = Math.max(0.9, this.bodyRadius);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({
        map: glowTexture(), color: 0x56493d, transparent: true,
        opacity: 0.0, depthWrite: false,
      });
      const s = new THREE.Sprite(mat);
      s.position.set(
        worldPos.x + (Math.random() - 0.5) * this.bodyRadius * 1.4,
        worldPos.y + (Math.random() - 0.3) * 1.2,
        worldPos.z + (Math.random() - 0.5) * this.bodyRadius * 1.4,
      );
      const scale0 = cap * (0.35 + Math.random() * 0.25);
      s.scale.setScalar(scale0);
      this._fxAdd(s);
      const rise = 0.6 + Math.random() * 0.9;
      const dur = 1.3 + Math.random() * 1.1;
      const delay = Math.random() * 0.5;
      let t = -delay;
      this._fx.push({
        update: (dt) => {
          t += dt;
          if (t < 0) return true;
          const k = t / dur;
          s.position.y += rise * dt;
          s.scale.setScalar(scale0 + k * cap * 0.7);
          mat.opacity = 0.24 * Math.sin(Math.min(k, 1) * Math.PI);
          if (k >= 1) { this._fxDrop(s); mat.dispose(); return false; }
          return true;
        },
      });
    }
  }

  _flamePuff(worldPos) {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xff7a1e, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(worldPos);
    s.scale.setScalar(0.5 + Math.random() * 0.4);
    this._fxAdd(s);
    let t = 0;
    this._fx.push({
      update: (dt) => {
        t += dt;
        s.position.y += dt * 1.6;
        s.scale.multiplyScalar(1 - dt * 0.8);
        mat.opacity = 0.85 * (1 - t / 0.55);
        mat.color.lerp(_flameLate, dt * 2);
        if (t > 0.55) { this._fxDrop(s); mat.dispose(); return false; }
        return true;
      },
    });
  }

  /** Sooty wisp rising off a burning part. */
  _burnSmoke(worldPos) {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0x4a4038, transparent: true, opacity: 0.22,
      depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(worldPos);
    s.position.y += 0.25;
    const scale0 = 0.35 + Math.random() * 0.25;
    s.scale.setScalar(scale0);
    this._fxAdd(s);
    let t = 0;
    const dur = 0.9;
    this._fx.push({
      update: (dt) => {
        t += dt;
        s.position.y += dt * 1.1;
        s.scale.setScalar(scale0 + (t / dur) * 0.7);
        mat.opacity = 0.22 * (1 - t / dur);
        if (t > dur) { this._fxDrop(s); mat.dispose(); return false; }
        return true;
      },
    });
  }

  /** Jittering electric arc streak across the body while shock-stunned. */
  _arcFlash(color = VFX_COLORS.bronzeChip) {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), color, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      rotation: Math.random() * Math.PI,
    });
    const s = new THREE.Sprite(mat);
    s.position.set(
      this.position.x + (Math.random() - 0.5) * this.bodyRadius * 1.5,
      this.position.y + this.height * (0.25 + Math.random() * 0.6),
      this.position.z + (Math.random() - 0.5) * this.bodyRadius * 1.5,
    );
    // elongated thin sprite reads as an arc streak
    const L = 0.5 + Math.random() * this.bodyRadius * 0.8;
    s.scale.set(L, 0.09 + Math.random() * 0.08, 1);
    this._fxAdd(s);
    let t = 0;
    this._fx.push({
      update: (dt) => {
        t += dt;
        mat.rotation += dt * 20 * (Math.random() - 0.5);
        mat.opacity = Math.random() < 0.4 ? 0.2 : 0.95;
        if (t > 0.12) { this._fxDrop(s); mat.dispose(); return false; }
        return true;
      },
    });
  }

  /** Kicked-up ground dust (charge scrapes, landings). Non-additive earth puff. */
  _dustPuff(x, y, z, scale0 = 0.8) {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0x6f5637, transparent: true, opacity: 0,
      depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.scale.setScalar(scale0);
    this._fxAdd(s);
    let t = 0;
    const dur = 0.9 + Math.random() * 0.4;
    this._fx.push({
      update: (dt) => {
        t += dt;
        const k = t / dur;
        s.position.y += dt * 0.7;
        s.scale.setScalar(scale0 * (1 + k * 1.3));
        // fast ramp-in, slow settle — stays readable most of its life
        mat.opacity = 0.62 * Math.min(1, k * 4) * (1 - k * k);
        if (k >= 1) { this._fxDrop(s); mat.dispose(); return false; }
        return true;
      },
    });
  }

  /** Expanding radial shockwave ring; damages the player once at impact radius. */
  spawnShockRing(cx, cz, maxR, dur, damage, dmgRadius) {
    const y = this.ctx.terrain.getHeight(cx, cz) + 0.35;
    // hot core ring: white-hot fading to orange, holds bright until late so it
    // still reads at dodge distance
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff3d8, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const ring = new THREE.Mesh(_ringGeo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, y, cz);
    this._fxAdd(ring);
    // trailing ground-dust ring just behind the wavefront
    const dringMat = new THREE.MeshBasicMaterial({
      color: 0x9a8262, transparent: true, opacity: 0.4,
      depthWrite: false,
    });
    const dring = new THREE.Mesh(_ringGeoSoft, dringMat);
    dring.rotation.x = -Math.PI / 2;
    dring.position.set(cx, y - 0.05, cz);
    this._fxAdd(dring);
    // central dust plume
    const dmat = new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xc9a878, transparent: true, opacity: 0.5, depthWrite: false,
    });
    const dust = new THREE.Sprite(dmat);
    dust.position.set(cx, y + 0.6, cz);
    dust.scale.setScalar(2);
    this._fxAdd(dust);
    const _hot = new THREE.Color(0xfff3d8);
    const _cool = new THREE.Color(0xff7a24);
    let t = 0;
    let dealt = false;
    this._fx.push({
      update: (dt) => {
        t += dt;
        const k = Math.min(t / dur, 1);
        const r = 0.6 + (maxR - 0.6) * k;
        ring.scale.set(r, r, 2.2 + k * 4.5);
        mat.color.copy(_hot).lerp(_cool, Math.min(1, k * 1.6));
        mat.opacity = k < 0.7 ? 0.9 : 0.9 * (1 - (k - 0.7) / 0.3);
        const rd = Math.max(0.4, r * 0.82);
        dring.scale.set(rd, rd, 2.6 + k * 5);
        dringMat.opacity = k < 0.6 ? 0.38 : 0.38 * (1 - (k - 0.6) / 0.4);
        dust.scale.setScalar(2 + k * maxR * 1.2);
        dmat.opacity = 0.5 * (1 - k);
        if (!dealt && damage > 0) {
          const p = this.ctx.player;
          if (p) {
            const d = Math.hypot(p.position.x - cx, p.position.z - cz);
            if (d <= r + 0.6 && d <= dmgRadius) {
              dealt = true;
              this.emit('player-damage', { amount: damage, from: this });
            } else if (r > d + 1.2) {
              dealt = true; // wave passed the player without touching them
            }
          }
        }
        if (k >= 1) {
          this._fxDrop(ring); this._fxDrop(dust);
          this._fxDrop(dring);
          mat.dispose(); dmat.dispose(); dringMat.dispose();
          return false;
        }
        return true;
      },
    });
  }

  _updateFx(dt) { updateFxM(this, dt); }

  /**
   * Raise a world event WITHOUT letting a subscriber take the machine loop
   * down with it. See `ai/emit.js` for the full reasoning: a synchronous
   * dispatch means one broken listener (a `player-damage` handler that does
   * not exist, say) otherwise quarantines `Machines.update` and freezes every
   * machine in the valley for the rest of the session. Failures are counted,
   * warned once and reported through `machines.aiAudit().listenerErrors`.
   */
  emit(name, payload) { return safeEmit(this.ctx, name, payload); }

  /* --------------------- FX object ownership --------------------- */

  /**
   * Add an FX mesh to the scene AND to this machine's owned set.
   *
   * `ownGeo` says the geometry was built for this one effect and may be
   * disposed with it. Sprites and the shared soft-ring geometry must NOT set
   * it — every machine in the world points at those same buffers.
   */
  _fxAdd(obj, ownGeo = false) {
    obj.userData.fxOwner = this;
    if (ownGeo) obj.userData.fxOwnGeo = true;
    this._fxObjects.add(obj);
    this.ctx.scene.add(obj);
    return obj;
  }

  /** The FX closure finished normally and is taking its mesh out. */
  _fxDrop(obj) {
    this._fxObjects.delete(obj);
    obj.userData.fxOwner = null;
    this.ctx.scene.remove(obj);
    return obj;
  }

  /**
   * Tear down FX-owned scene objects. Called by the site manager at FREEZE
   * (which drops the `_fx` closures, so anything still in flight would be
   * orphaned) and again at DISPOSE.
   *
   * `keepBeacon` preserves the loot beam, which is the one FX that is meant to
   * outlive the crumple: it stands until the wreck is looted or disposed.
   */
  disposeFx(keepBeacon = false) {
    const beam = keepBeacon ? this._beaconMesh : null;
    for (const obj of [...this._fxObjects]) {
      if (obj === beam) continue;
      this._fxObjects.delete(obj);
      this.ctx.scene.remove(obj);
      // break the retain chain: `userData.machine` on the beacon kept the
      // whole disposed Machine (its cloned materials, gait, AI, parts) alive
      obj.userData.fxOwner = null;
      obj.userData.machine = null;
      if (obj.userData.fxOwnGeo) obj.geometry?.dispose?.();
      const mats = Array.isArray(obj.material) ? obj.material
        : (obj.material ? [obj.material] : []);
      for (const mat of mats) mat.dispose?.();
    }
    this._fx.length = 0;
    if (beam) {
      if (this._beacon) this._fx.push(this._beacon);
      return;
    }
    this._beacon = null;
    this._beaconMesh = null;
    /**
     * Torn parts are `scene.attach`ed, so they are world objects with their
     * own loot prompt — and each prompt holds `entry.machine`, i.e. this whole
     * Machine. A wreck that has faded out and been disposed takes its own
     * debris with it; otherwise the debris (and everything it retains) is
     * immortal, since its 60 s despawn timer stopped the moment the corpse
     * froze and its `_fx` closure was dropped.
     */
    if (this._tornRecs) {
      for (const rec of [...this._tornRecs]) this._removeTornPart(rec);
      this._tornRecs.length = 0;
    }
    if (this._disposed) this._releaseOnDispose();
  }

  /**
   * THE LAST STEP OF A DISPOSED MACHINE (R34, instruments-core W0b;
   * `A90b-memory-attribution` with the role-based workload).
   *
   * `ai/sites.js` dispose frees the geometries and materials it can see and
   * `rig/lod.js` `disposeRig` the skeletons. What was left held after the
   * corpse lifecycle was the MODEL CLONE (this constructor's
   * `src.root.clone()`) and the AUTO-RIG BONES (`autorig.js` `makeBone`):
   * anything still pointing at the Machine reached both through `model`,
   * `body`, `rig` and `gait`. So the machine lets go of its own body:
   *   - its lamp record and any Flag mark are released;
   *   - every SkinnedMesh's skeleton is disposed (idempotent with `disposeRig`)
   *     and unbound; every bone array is emptied;
   *   - the subtree is cut from `root` and the body-side fields are nulled, so
   *     a stale reference to the Machine retains a shell, not a sculpt.
   * Geometries shared with the species' source asset are never touched here.
   * Idempotent.
   */
  _releaseOnDispose() {
    if (this._released) return;
    this._released = true;
    try { this.disposeRig?.(); } catch (e) { /* rig never built */ }
    this.manager?.lamps?.detach(this);
    this.lamp = null;
    this._lampAnchor = null;
    this.flagMark = null;
    const bones = [];
    const drop = (sk) => {
      if (!sk) return;
      try { sk.dispose(); } catch (e) { /* already gone */ }
      for (const b of sk.bones) bones.push(b);
      sk.bones.length = 0;
      sk.boneInverses.length = 0;
    };
    this.root?.traverse((o) => {
      if (o.isSkinnedMesh) { drop(o.skeleton); o.skeleton = null; }
    });
    drop(this.rig?.skeleton);
    for (const b of bones) { b.parent?.remove(b); b.userData = {}; }
    if (this.rig) {
      for (const k of Object.keys(this.rig)) this.rig[k] = null;
    }
    this.root?.clear();
    this.model = null;
    this.holder = null;
    this.body = null;
    this.rig = null;
    this.gait = null;
    // the rig's other handles on the bones and the clone: the rest-pose Map
    // (Bone -> Quaternion), the bone-space rotator, the socket proxy (it keeps
    // `model`), the shared FX pool handle
    this._rest = null;
    this._rot = null;
    this.hullProxy = null;
    this._hullProxy = null;
    this._fxPool = null;
    // ...and any other field still pointing INTO the released subtree (a node,
    // a skeleton, a Map keyed by nodes): measured, not assumed — a disposed
    // machine that something still holds must hold a shell, not a sculpt
    for (const k of Object.keys(this)) {
      const v = this[k];
      if (!v || typeof v !== 'object' || v === this.root || k === 'ctx' || k === 'rootCtx' || k === 'manager') continue;
      if (v.isObject3D || v.isSkeleton || (v instanceof Map && v.size && [...v.keys()][0]?.isObject3D)) this[k] = null;
    }
    this.parts.length = 0;
    this.weakPoints.length = 0;
    this._eyeMats.length = 0;
    this._emisMats.length = 0;
    this._partGlows.length = 0;
    this._frostMats = null;
    this._fadeMats = null;
  }

  /**
   * Take the loot beacon out for good (looted, or the wreck is being
   * disposed). Separate from the beam's own update closure because a FROZEN
   * corpse never ticks its FX — before this, looting a frozen wreck left the
   * beam standing over an empty pile until the site disposed it.
   */
  dropBeacon() {
    const beam = this._beaconMesh;
    if (this._beacon) {
      const i = this._fx.indexOf(this._beacon);
      if (i >= 0) this._fx.splice(i, 1);
    }
    this._beacon = null;
    this._beaconMesh = null;
    if (!beam) return;
    this._fxObjects.delete(beam);
    this.ctx.scene.remove(beam);
    beam.userData.machine = null;
    beam.userData.fxOwner = null;
    beam.geometry?.dispose?.();
    beam.material?.dispose?.();
  }

  /** Gate/debug hook: FX meshes this machine still owns in the scene. */
  fxAudit() {
    let inScene = 0;
    for (const o of this._fxObjects) if (o.parent) inScene++;
    return { owned: this._fxObjects.size, inScene, closures: this._fx.length };
  }

  /* ------------------------- sensor glow ------------------------- */

  /**
   * THE LAMP RHYTHM (bible §7.2, instruments-core W0b): `lampStateFor(this)`
   * names the state, `lampGain` the brightness on the SIM clock — calm steady,
   * wary a 1 Hz pulse, hostile a 4 Hz flicker, dark (dead, a lamp hit, Clouded)
   * a 0.55 s sputter of the last colour and then out. Every glow this machine
   * owns follows it: eye sprites, flat emissive lens materials, shell sensor
   * strips. An Instrument's iris + beam (`addLamp`) are drawn by
   * `machines.lamps` from the same two functions. The white-hot windup flash
   * (`_telegraphT`) is the Round-4 dodge cue and stays on machines WITHOUT an
   * iris lamp only (the legacy kinds, gone at W2): an Instrument's lamp never
   * leaves the grammar.
   */
  _updateEyes(dt, t) { updateEyesM(this, dt, t); }
}
