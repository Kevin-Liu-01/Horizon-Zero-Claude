import * as THREE from 'three';
import { rollLoot, moveTowardS, _st } from '../../entities/machines/machine.js';
import { buildRig } from '../../entities/machines/autorig.js';
import { GaitController } from '../../entities/machines/gait.js';
import { attachRigRuntime, updateRigLOD, foldMachineMeshes } from '../../entities/machines/rig/lod.js';
import { snapSockets } from '../../entities/machines/rig/sockets.js';
import { ExpansionMachine } from '../../entities/machines/rig/expansion-base.js';
import { liftExtras, seedAuthoredWeights, weightAudit } from '../lib/generated.js';
import { prepareEntry, installHull } from '../lib/hull.js';
import { prepareTools, detachTool, seatFeet } from '../lib/kindkit.js';
import { GAUGE as SITE, fieldPoint } from '../../world/sites/layout.js';

/**
 * GAUGE — BIBLE §7.4 #4 (medium, 3.2 x 2.6 x 5.5 m; the tide keeper, role `keeper`; NEUTRAL, no attack set yet);
 * BUILD M1.4e. Model: `tools/build/instruments/gen-gauge.mjs`, on the M1.4a hull kit.
 *
 * A lighthouse on stilts: a squat enamel float drum with a celadon waterline band on four very long graduated stilts,
 * ballast tanks on its flanks, a brass brine pump and sluice nozzle (a gate at the mouth), a small kit lamp drum on its
 * front-left shoulder, and a mast: the graduated tide staff with a sliding FLOAT RING, a yard of two faded orchil
 * banners, and the LANTERN-GLASS COLUMN (pale ice, lit from inside) under a brass roof and finial at 5.5 m.
 *
 * NEUTRAL (bible: "neutral unless the pans are damaged or it is attacked"; no attack set until M2.3c). It is
 * `docile` (machine.js: it never leaves its own loop), its senses raise nothing, and it has no attack rows.
 *
 * THE TIDE CLOCK (`CLOCK`). Its own clock, out of step with the Pan Houses' (the quest "The Wrong Tide"): a reading
 * reading(phi) = mean - amp cos(2 pi phi) over `CLOCK.period` sim seconds, shown by the float ring on the staff and on
 * its Sighting card (`GAUGE · SLUICE 3 · TIDE 0.4 m`). Over one period the KEEPER (the one Gauge the world spawns,
 * at Sluice 3) opens the sluice when its reading rises through 0.4 m (the wrong tide: the Pan Houses open at the
 * flood), shuts it at `CLOCK.closeAt`, walks to the Glass at `CLOCK.leaveAt`, wades in to its deepest water (never
 * deeper than WADE_MAX: the knee seals stay dry), stands reading there, and walks back by `CLOCK.returnAt`.
 *
 * THE SCRIPTED WRONG TIDE (bible §8.9 beat 0:05). Until Brea first comes within `SITE.trigger` m of Sluice 3 the clock
 * is HELD at its opening reading (0.4 m) and the keeper stands at the sluice; that first approach opens Sluice 3 (the
 * gate swings up over 1.2 s, a brine jet runs into the cell) and the clock runs from there. The world's static
 * stand-in (`world/sites/gauge.js` StaticGauge) is retired when the keeper spawns: its mesh and colliders go, and its
 * `open()` / `readout()` (the props' READ STAFF and SLUICE 3 interactions) answer from the keeper.
 *   events: `gauge-sluice` { id, sluice, tide, open, by }   (by: 'script' | 'clock' | 'interact')
 *
 * Weak points (bible; their rules are M1.6j's): two BALLAST TANKS and four KNEE SEALS. No component is torn yet.
 */

const URL = '/models/instruments/gauge.glb';
/** The model's height (m): `r5Size[1]`, the finial's spike (the loader scales the bbox to this). */
const HEIGHT = 5.5;
/** Deepest water it walks into (m): the knee seals sit 1.5 m up (bible: "wades to 1.2 m"). */
export const WADE_MAX = 1.2;
/** How far ahead of its centre the wade test reads the water (m): the front feet's line. */
const WADE_LOOK = 1.6;
/** The tide clock (sim seconds; readings in metres). Phases as fractions of the period. */
export const CLOCK = Object.freeze({
  period: 600, mean: 0.75, amp: 0.45,
  openAt: 0.4,              // its (wrong) opening reading, rising
  closeAt: 0.30,            // phase: the sluice shuts (reading ~0.89)
  leaveAt: 0.55,            // phase: it walks to the Glass
  returnAt: 0.80,           // phase: it walks back to Sluice 3
  gateSeconds: 1.2,
});
export const OPEN_PHASE = Math.acos((CLOCK.mean - CLOCK.openAt) / CLOCK.amp) / (2 * Math.PI);
export const readingAt = (phi) => CLOCK.mean - CLOCK.amp * Math.cos(2 * Math.PI * phi);
const STATION_HEADING = Math.PI - (SITE.nozzleBearing * Math.PI) / 180;   // its front (and the nozzle) toward the cell
const QUAD_WALK = { stride: 1.0, duty: 0.68, lift: 0.2, offsets: { LF: 0, RH: 0.25, RF: 0.5, LH: 0.75 } };   // a slow wading walk
const QUAD_RUN = { stride: 1.5, duty: 0.55, lift: 0.26, offsets: { LF: 0, RH: 0.25, RF: 0.5, LH: 0.75 } };

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Gauge extends ExpansionMachine {
  constructor(ctx, manager, opts = {}) {
    super(ctx, manager, {
      kind: 'gauge',
      displayName: 'Gauge',
      rigged: false,
      yawFix: 0,
      maxHealth: 420, armor: 0.15, level: 5,
      walkSpeed: 1.1, runSpeed: 2.2, turnRate: 0.9,
      sightRange: 30, hearRange: 20, eyeHeight: 3.0,
      attackRange: 0, bodyRadius: 1.35,
      docile: true,
      ...opts,
    });
    const entry = ctx.assets.models[this.modelKind];
    const S = entry.r5Sockets;
    this._S = S;
    this.sluice = SITE.sluice;
    this.keeper = false;
    this._job = 'idle';                         // idle | station | sluice | toGlass | wade | toStation | goto
    this._jobT = 0.5; this._jobT = 0;
    this._tx = 0.5; this._tx = this.position.x;
    this._tz = 0.5; this._tz = this.position.z;
    this._gateK = 0.5; this._gateK = 0;
    this._gateWant = 0;
    this._phi = OPEN_PHASE;
    this._held = true;
    this._reading = CLOCK.openAt;
    this._wadeStop = null;                       // { x, z, depth } where the last wade stopped short of WADE_MAX
    this._maxDepth = 0.5; this._maxDepth = 0;    // deepest water under its centre since the last reset (m)
    this._log = [];                              // (keeper) the clock's events: { t, ev, reading }
    this._clockT = 0.5; this._clockT = 0;
    this._seeded = seedAuthoredWeights(this);
    const ring = detachTool(this, 'gauge-float');
    const gate = detachTool(this, 'gauge-gate');

    this.addLamp(S.lamp, { radius: S.lampR });
    this.addWeakPoint('lamp', this.body, S.lamp[0], S.lamp[1], S.lamp[2], S.lampR * 1.25, 2.0);
    for (const c of S.tanks) this.addWeakPoint('ballast tank', this.body, c[0], c[1], c[2], S.tankR * 1.3, 2.0);
    for (const k of S.knees) this.addWeakPoint('knee seal', this.body, k[0], k[1], k[2], 0.11, 2.0);
    this.lootTable = rollLoot([{ id: 'metal-shards', min: 6, max: 10 }, { id: 'wire', min: 1, max: 2 }]);

    // the lantern glass is a level glass, not a lamp (as the Plumb's vial): it keeps its own pale ice, never the
    // lamp's state colour, and goes dark over 0.8 s when the Gauge dies
    this._glow = null;
    this.model.traverse((o) => {
      if (this._glow || !o.isMesh || o.name !== 'gauge-lantern') return;
      const m = o.material;
      if (m && !Array.isArray(m) && m.emissive) {
        this._eyeMats = this._eyeMats.filter((e) => e.mat !== m);
        m.emissiveIntensity = 1;
        this._glow = { mat: m, k: 1 };
      }
    });

    attachRigRuntime(this, { quantise: false });
    buildRig(this, entry.r5Rig);
    // the float ring and the sluice gate ride the drum (pelvis), unskinned; animate() moves them
    const pel = this.rig.pelvis, bp = pel.userData.bodyPos || [0, 0, 0];
    const hang = (mesh, anchor) => {
      if (!mesh) return null;
      mesh.position.set(anchor[0] - bp[0], anchor[1] - bp[1], anchor[2] - bp[2]);
      mesh.rotation.set(0, 0, 0); mesh.scale.setScalar(1);
      mesh.castShadow = false;
      mesh.userData.noSnap = true; mesh.userData.noReparent = true; mesh.userData.noSizeCull = true;
      pel.add(mesh);
      return mesh;
    };
    this._ring = hang(ring, entry.tools?.['gauge-float'] || S.floatRest);
    this._ringY0 = this._ring ? this._ring.position.y : 0;
    this._gate = hang(gate, entry.tools?.['gauge-gate'] || S.gateHinge);
    this._gateAxis = new THREE.Vector3(...S.gateAxis).normalize();
    this._jet = this._makeJet(pel, bp);

    this.gait = new GaitController(this, this.rig, {
      walk: QUAD_WALK, run: QUAD_RUN, runRef: 2.2,
      rollAmp: 0.012, impactAmp: 0.015, breatheRate: 0.5, stepDustSpeed: 9,
      turnRadius: 2.2, lookClampYaw: 1.0, stanceFlex: 0.05,
      fidgets: [{ name: 'read-staff', head: 0.2, dur: 2.6 }],
    });
    this.gait.update(0.016, 0);
    foldMachineMeshes(this);
    // the stilts, the staff and the finial are thin: never size-culled (the mast is read from Saltrow's ramp)
    this.root.traverse((o) => { if (o.isMesh) o.userData.noSizeCull = true; });
    snapSockets(this);
    installHull(this);
    this._deathRoll = 0.25;
    this._deathSink = 0.02;
  }

  weightAudit() { return weightAudit(this); }

  onDeathPose(k, deathT) { this.gait.deathPose(k, deathT, 'quad'); }

  /** Stand on its feet where it now stands (lib/kindkit.js `seatFeet`). */
  seatFeet() { return seatFeet(this); }

  /* --------------------------------------------------------- the card ---- */
  /** Its Sighting card (`ui/tips.js cardParts`): `GAUGE · SLUICE 3 · TIDE 0.4 m`. */
  get cardWork() { return `SLUICE ${this.sluice}`; }
  get cardValue() { return `TIDE ${this.reading().toFixed(1)} m`; }
  /** The reading its float ring shows (m): the keeper's clock (every Gauge reads the same staff). */
  reading() { const k = this.manager?._gaugeKeeper; return k && k !== this ? k._reading : this._reading; }
  /** The world props' contract (`world/sites/gauge.js` readout()). */
  readout() { const t = +this.reading().toFixed(1); return { kind: 'GAUGE', sluice: this.sluice, tide: t, text: `GAUGE · SLUICE ${this.sluice} · TIDE ${t.toFixed(1)} m` }; }
  get sluiceOpen() { return this._gateWant > 0; }

  /* --------------------------------------------------------- the keeper -- */
  /** Make this Gauge the world's tide keeper at Sluice 3 (doctrine install; one keeper). */
  becomeKeeper() {
    const M = this.manager;
    if (!M || (M._gaugeKeeper && M._gaugeKeeper !== this && M._gaugeKeeper.alive && !M._gaugeKeeper._disposed)) return false;
    M._gaugeKeeper = this;
    this.keeper = true;
    const p = fieldPoint(SITE.u, SITE.v);
    this.station = { x: p.x, z: p.z, heading: STATION_HEADING };
    this.gaugeId = SITE.id;
    this._resetKeeper();
    this._retireStatic();
    return true;
  }

  /** Back to the scripted start: at Sluice 3, the clock held at its wrong-tide reading, the sluice shut. */
  _resetKeeper() {
    const st = this.station;
    if (!st) return;
    this._phi = OPEN_PHASE; this._held = true; this._reading = readingAt(OPEN_PHASE);
    this._job = 'station'; this._jobT = 0;
    this._gateWant = 0; this._gateK = 0;
    this._scripted = false;
    this._log.length = 0;
    this.position.set(st.x, this.ctx.terrain.getHeight(st.x, st.z), st.z);
    this.heading = st.heading; if (this.sc) this.sc.heading = st.heading; if (this.root) this.root.rotation.y = st.heading;
    this.route = [new THREE.Vector3(st.x, 0, st.z)]; this._wpIndex = 0;
    if (this.sc) this.sc._speed = 0;
  }

  /** The static stand-in at Sluice 3 goes: its mesh and colliders; its interactions answer from the keeper. */
  _retireStatic() {
    const sg = this.ctx.props?.gauge;
    if (!sg || sg._living) return;
    sg._living = this;
    sg.readout = () => this.readout();
    sg.open = () => this.openSluice('interact');
    const go = () => {
      const C = this.ctx.collision;
      if (C && Array.isArray(C.colliders) && sg.body) {
        const ids = C.colliders.filter((c) => c.ref === sg.body).map((c) => c.id);
        if (ids.length) C.unregister(ids);
      }
      try { sg.dispose(); } catch (e) { /* already gone */ }
    };
    if (sg.ready && typeof sg.ready.then === 'function') sg.ready.then(go, go); else go();
  }

  /** Open the sluice (idempotent while open). `by`: 'script' | 'clock' | 'interact'. */
  openSluice(by = 'clock') {
    if (this._gateWant > 0) return false;
    this._gateWant = 1;
    if (this.keeper && this._held) { this._held = false; this._scripted = true; }
    this._note('open', by);
    this.ctx.events?.emit?.('gauge-sluice', { id: this.gaugeId ?? 'gauge', sluice: this.sluice, tide: +this.reading().toFixed(1), open: true, by });
    return true;
  }

  closeSluice(by = 'clock') {
    if (this._gateWant <= 0) return false;
    this._gateWant = 0;
    this._note('close', by);
    this.ctx.events?.emit?.('gauge-sluice', { id: this.gaugeId ?? 'gauge', sluice: this.sluice, tide: +this.reading().toFixed(1), open: false, by });
    return true;
  }

  _note(ev, by) {
    if (this._log.length < 64) this._log.push({ t: +this._clockT.toFixed(2), ev, by, reading: +this.reading().toFixed(3), job: this._job, x: +this.position.x.toFixed(2), z: +this.position.z.toFixed(2) });
  }

  /** Walk to (x, z) and stand (a probe / script verb; the wade limit holds). */
  goto(x, z, then = 'idle') { this._tx = x; this._tz = z; this._job = 'goto'; this._then = then; this._jobT = 0; this._wadeStop = null; }

  /** The Glass's deepest water it may wade to (cached): pools[0] sampled on a 2 m grid, depth <= WADE_MAX. */
  wadeSpot() {
    if (this.manager?._gaugeWade) return this.manager._gaugeWade;
    const W = this._water();
    const G = W?.pools?.[0];
    if (!W || !G) return null;
    let best = null;
    for (let gx = -G.rx; gx <= G.rx; gx += 2) for (let gz = -G.rz; gz <= G.rz; gz += 2) {
      const x = G.x + gx, z = G.z + gz;
      if (W.levelAt(x, z) !== G.level) continue;              // the Glass's own water, not the sea beyond its barrier
      const d = W.depthAt(x, z);
      if (d > 0 && d <= WADE_MAX - 0.05 && (!best || d > best.depth)) best = { x, z, depth: d };
    }
    if (this.manager) this.manager._gaugeWade = best;
    return best;
  }

  _water() { return this.ctx.environment?.water ?? this.ctx.water ?? null; }

  /** One walking step toward (_tx, _tz) with the wade limit; returns 'arrived' | 'blocked' | 'walking'. */
  _walk(dt) {
    const W = this._water(), p = this.position;
    const dx = this._tx - p.x, dz = this._tz - p.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.6) { this.sc._speed += (0 - this.sc._speed) * (1 - Math.exp(-6 * dt)); return 'arrived'; }
    if (W) {
      const h = Math.atan2(dx, dz);
      const ahead = W.depthAt(p.x + Math.sin(h) * WADE_LOOK, p.z + Math.cos(h) * WADE_LOOK);
      if (ahead > WADE_MAX) {
        if (!this._wadeStop) this._wadeStop = { x: +p.x.toFixed(2), z: +p.z.toFixed(2), ahead: +ahead.toFixed(3), depth: +W.depthAt(p.x, p.z).toFixed(3) };
        this.sc._speed += (0 - this.sc._speed) * (1 - Math.exp(-6 * dt));
        return 'blocked';
      }
    }
    _st.x = this._tx; _st.z = this._tz; _st.speed = this.walkSpeed;
    moveTowardS(this, dt);
    if (W) { const dd = W.depthAt(p.x, p.z); if (dd > this._maxDepth) this._maxDepth = dd; }
    return 'walking';
  }

  _faceTo(heading, dt) {
    const sc = this.sc;
    let e = heading - sc.heading;
    e = Math.atan2(Math.sin(e), Math.cos(e));
    sc.heading += Math.max(-this.turnRate * dt, Math.min(this.turnRate * dt, e));
    sc._speed += (0 - sc._speed) * (1 - Math.exp(-6 * dt));
  }

  /** Neutral: no suspicion, no engagement. The keeper runs its clock; any other Gauge stands or walks its `goto`. */
  _statePatrol(dt) {
    const sc = this.sc;
    sc.suspicion = 0;
    this._jobT += dt;
    if (this.keeper) this._clock(dt);
    const j = this._job;
    if (j === 'goto' || j === 'toGlass' || j === 'toStation') {
      const r = this._walk(dt);
      if (r !== 'walking') {
        if (j === 'goto') this._job = this._then || 'idle';
        else if (j === 'toGlass') { this._job = 'wade'; this._note('wade', 'clock'); }
        else { this._job = 'station'; this._note('station', 'clock'); }
        this._jobT = 0;
      }
      return;
    }
    if ((j === 'station' || j === 'sluice') && this.station) { this._faceTo(this.station.heading, dt); return; }
    sc._speed += (0 - sc._speed) * (1 - Math.exp(-6 * dt));
  }

  /** The keeper's clock and its jobs (sim seconds). */
  _clock(dt) {
    const st = this.station;
    if (this._held) {
      this._reading = readingAt(this._phi);
      // the scripted wrong tide (beat 0:05): her first approach to Sluice 3 opens it
      const P = this.ctx.player?.position;
      if (P && this._job === 'station') {
        const dx = P.x - st.x, dz = P.z - st.z;
        if (dx * dx + dz * dz < SITE.trigger * SITE.trigger) this.openSluice('script');
      }
      return;
    }
    this._clockT += dt;
    const phi0 = this._phi;
    this._phi = (this._phi + dt / CLOCK.period) % 1;
    this._reading = readingAt(this._phi);
    const cross = (a) => (phi0 < a && this._phi >= a) || (phi0 > this._phi && (a > phi0 || a <= this._phi));
    if (cross(OPEN_PHASE) && this._job === 'station') this.openSluice('clock');
    if (cross(CLOCK.closeAt)) this.closeSluice('clock');
    if (cross(CLOCK.leaveAt) && this._job === 'station') {
      const w = this.wadeSpot();
      if (w) { this._tx = w.x; this._tz = w.z; this._job = 'toGlass'; this._jobT = 0; this._wadeStop = null; this._note('leave', 'clock'); }
    }
    if (cross(CLOCK.returnAt) && (this._job === 'wade' || this._job === 'toGlass')) {
      this._tx = st.x; this._tz = st.z; this._job = 'toStation'; this._jobT = 0; this._note('return', 'clock');
    }
  }

  /** Brine jet: a pale additive cone out of the nozzle, drawn only while the sluice runs. */
  _makeJet(pel, bp) {
    const S = this._S;
    const nd = new THREE.Vector3(...S.nozzleDir).normalize();
    const dir = nd.clone().add(new THREE.Vector3(0, -0.45, 0)).normalize();   // it falls as it leaves the mouth
    const len = Math.min(3.2, (S.mouth[1] + 0.1) / Math.max(0.3, -dir.y));
    const geo = new THREE.CylinderGeometry(0.07, 0.24, len, 12, 1, true);
    geo.translate(0, -len / 2, 0);                                            // its top at the mouth, down the cone
    const mat = new THREE.MeshBasicMaterial({ color: 0xbde6e3, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const jet = new THREE.Mesh(geo, mat);
    jet.name = 'gauge-jet';
    jet.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    jet.position.set(S.mouth[0] - bp[0], S.mouth[1] - bp[1], S.mouth[2] - bp[2]);
    jet.visible = false;
    jet.castShadow = false;
    jet.raycast = () => {};
    jet.userData.noSnap = true; jet.userData.noReparent = true; jet.userData.noSizeCull = true; jet.userData.noMerge = true;
    pel.add(jet);
    return jet;
  }

  update(dt, t) {
    const r = super.update(dt, t);
    // the gate swings on its own clock, even beyond the animation ring
    const want = this._gateWant;
    if (this._gateK !== want) {
      const s = dt / CLOCK.gateSeconds;
      this._gateK = want > this._gateK ? Math.min(want, this._gateK + s) : Math.max(want, this._gateK - s);
    }
    const g = this._glow;
    if (g && (this.alive ? g.k !== 1 : g.k > 0)) {
      g.k = this.alive ? 1 : Math.max(0, g.k - dt / 0.8);
      g.mat.emissiveIntensity = g.k;
    }
    return r;
  }

  _die() {
    const r = super._die();
    this._gateWant = 0;
    if (this.manager?._gaugeKeeper === this) this.manager._gaugeKeeper = null;
    return r;
  }

  disposeFx(keepBeacon = false) {
    const r = super.disposeFx(keepBeacon);
    if (this._disposed && this.manager?._gaugeKeeper === this) this.manager._gaugeKeeper = null;
    return r;
  }

  animate(dt, t) {
    const gait = this.gait, cheap = gait.updateCheap, dead = this.state === 'dead';
    if (dead) return;
    this._snapDoctrineSockets();
    const lod = updateRigLOD(this);
    if (lod >= 3) cheap.call(gait, dt, t); else gait.update(dt, t);
    // the float ring rides the staff to the reading (0-1.2 m of tide over the staff's travel)
    if (this._ring) {
      const k = Math.min(1, Math.max(0, this.reading() / 1.2));
      this._ring.position.y = this._ringY0 + k * this._S.floatTravel;
    }
    const gk = this._gateK, e = gk * gk * (3 - 2 * gk);
    if (this._gate) this._gate.quaternion.setFromAxisAngle(this._gateAxis, 1.2 * e);
    const jet = this._jet;
    if (jet) {
      const on = gk > 0.35 && this._gateWant > 0;
      jet.visible = on;
      if (on) jet.material.opacity = 0.3 * Math.min(1, (gk - 0.35) / 0.4) * (0.85 + 0.15 * Math.sin(t * 19));
    }
  }
}

export default {
  id: 'gauge',
  role: 'keeper',
  Cls: Gauge,
  /** P-03: the registry height (m) (`machines.heightOf`). */
  height: HEIGHT,
  spec: { url: URL, targetHeight: HEIGHT, yaw: 0 },
  onEntry: (entry) => { liftExtras(entry); prepareEntry(entry, 'gauge'); prepareTools(entry); },
  tables: {
    // neutral: its senses raise nothing (docile also keeps it in its own loop)
    perception: { gain: 0, periphRange: 0, scanSweep: 0.4, scanPeriod: 6.0, contactRange: 0 },
    engage: { archetype: 'skittish', band: [6, 14], orbitSpeed: 0.5, backSpeed: 0.6 },
    attacks: [],
    attackMode: 'table',
    react: { staggerFrac: 9, downedFrac: 9 },
    elem: 140,
  },
  audio: { set: 'gauge', mass: 'medium' },
  doctrine: {
    // the world's one Gauge: the tide keeper at Sluice 3 (its station is the layout's, not this anchor)
    spawn: [(() => { const p = fieldPoint(SITE.u, SITE.v); return { n: 1, x: p.x, z: p.z, route: 3, routePoints: 2, poi: 'gauge-keeper', keeper: true }; })()],
    install: (m) => {
      if (m.kind !== 'gauge' || m.manager?._gaugeKeeper) return;
      const p = fieldPoint(SITE.u, SITE.v);
      if (Math.hypot(m.position.x - p.x, m.position.z - p.z) < 3) m.becomeKeeper();
    },
  },
};
