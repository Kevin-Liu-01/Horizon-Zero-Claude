/**
 * THE SLICE'S CUE DIRECTOR (BUILD M1.6k; TECH §14). Plays what the Round-4 mix never had: the places (the Pans,
 * Saltrow, the shore keyed to the waterline, the trade wind, wind in cane with the gust clock's tell), the work of
 * Saltrow (bell, pumps, rakes, shovels, the cart, mallets), the gulls, the Braziers, the Instruments' own cues (a
 * chirp on every lamp-state change, the Plumb's chime, vial and topple, the Peg's mallet, shot and rush, the Gauge's
 * sluice, gate and float ring), the lance's draw and swing, the Alidade, and the music bus's hostile duck.
 *
 * It owns no Web Audio graph of its own: it plays through GameAudio's bank, pool, zones and buses (src/audio/audio.js),
 * so every cue lands on one of the six buses (src/audio/buses.js) and is counted by `cueCounts()`.
 *
 * Every poll is throttled (lamp states every frame but without allocation; the places at 4 Hz; the waterline at 2 Hz),
 * and nothing here allocates per frame in steady state.
 *
 *   game.slice.stats()      { lamp: { changes, chirps, missed }, beds, cane, gull, bell, work } (rows read it)
 *   game.slice.lampChirps   lamp-change log (the last 64): [{ t, kind, from, to, played, d }]
 */
import { lampStateFor } from '../../instruments/lamps.js';
import { STREET, CREW, CONES, CART, HARBOUR, GUILD_STUD } from '../../world/settlements/saltrow-layout.js';
import { PUMPS, fieldPoint } from '../../world/sites/layout.js';
import { BUS_TRIM, MUSIC, shoreLevel, caneLevels, caneNear, CHIRP_RANGE, creakLevel, CANE_LEAD } from './mix.js';
import { LoopEmitter } from '../spatial.js';

const D2R = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

const FW = { x: Math.sin(STREET.bearing * D2R), z: -Math.cos(STREET.bearing * D2R) };
const RT = { x: Math.cos(STREET.bearing * D2R), z: Math.sin(STREET.bearing * D2R) };
const streetAt = (s, r) => ({ x: STREET.x + FW.x * s + RT.x * r, z: STREET.z + FW.z * s + RT.z * r });

/** Saltrow's middle (the street's midpoint) and the places its work is heard from. */
export const SALTROW_MID = Object.freeze(streetAt(STREET.length * 0.5, 0));
export const WORK = Object.freeze([
  ...CREW.filter((c) => /raker/.test(c.id)).map((c) => Object.freeze({ ...streetAt(c.s, c.r), set: 'saltrow/rake', every: [5, 9] })),
  ...CONES.map((c) => Object.freeze({ x: c.x, z: c.z, set: 'saltrow/shovel', every: [9, 16] })),
  Object.freeze({ x: CART.x, z: CART.z, set: 'saltrow/cart', every: [14, 24] }),
  ...CREW.filter((c) => /caulker/.test(c.id)).map((c) => Object.freeze({ ...streetAt(c.s, c.r), set: 'saltrow/hammer', every: [6, 12] })),
  Object.freeze({ x: HARBOUR.ramp.x, z: HARBOUR.ramp.z, set: 'saltrow/hammer', every: [10, 18] }),
]);
export const PUMP_AT = Object.freeze(PUMPS.map((p) => Object.freeze({ id: p.id, ...fieldPoint(p.u, p.v) })));
/** The bell hangs over the guild house's step. */
export const BELL_AT = Object.freeze({ x: GUILD_STUD.x, y: 9, z: GUILD_STUD.z });

/** The kinds whose attacks and steps this file voices (audio.js leaves them alone). */
export const KIND_CUES = Object.freeze({
  plumb: { step: 'plumb/servo', idle: 'plumb/gyro', weak: 'plumb/vial' },
  peg: { step: 'mstep/light', idle: 'peg/idle', weak: 'bow/hit-weak' },
  gauge: { step: 'gauge/stilt', idle: 'gauge/idle', weak: 'bow/hit-weak' },
  // Milestone 2 (src/audio/m2/cues.js): the Tiller's own stilt and coring bed; the Screed keeps its weight class's step
  // (mstep/heavy: the third class A76-footfalls hears) with its hull's clank as a layer over it
  tiller: { step: 'tiller/step', idle: 'tiller/idle', weak: 'bow/hit-weak' },
  screed: { step: null, layer: 'screed/step', idle: 'screed/idle', weak: 'bow/hit-weak' },
});
/** attack id -> [phase, set] or a list of them */
export const ATTACK_CUES = Object.freeze({
  mallet: ['strike', 'peg/mallet'],
  'peg-shot': ['strike', 'peg/shot'],
  'swarm-rush': ['windup', 'peg/rush'],
  pendulum: ['windup', 'plumb/bob'],
  'bob-drop': ['windup', 'plumb/bob'],
  // the Tiller (M2): the trample's tell on its wind-up (heard 1 s or more before contact, src/audio/m2/mix.js TRAMPLE);
  // its close blows keep the generic wind-up and strike
  'herd-trample': [['windup', 'tiller/trample'], ['strike', 'inst/strike']],
  'hopper-burst': [['windup', 'inst/windup'], ['strike', 'inst/strike']],
  'auger-jab': [['windup', 'inst/windup'], ['strike', 'inst/strike']],
  'drum-shove': [['windup', 'inst/windup'], ['strike', 'inst/strike']],
});

const PRI = { amb: 1, work: 3, chirp: 7, inst: 6, big: 8 };

export class SliceAudio {
  /** @param {import('../audio.js').GameAudio} game */
  constructor(game) {
    this.game = game;
    this.ctx = game.ctx;
    this.ready = false;
    this.beds = {};               // name -> LoopEmitter (2D, the ambience bus)
    this._bedT = 0;
    this._waterT = 0;
    this._waterD = 999;
    this._caneT = 0;
    this._probeT = 0;
    this._cane = { d: 999, bed: -1, ahead: 0, gust: 0, lull: 0 };
    this._lamp = new WeakMap();   // machine -> last lamp state voiced
    this.lamp = { changes: 0, chirps: 0, missed: 0, outOfRange: 0 };
    this.lampChirps = [];
    this._hour = null;
    this.bell = { tolls: 0 };
    this._tolls = 0; this._tollT = 0;
    this._work = WORK.map(() => 2 + Math.random() * 6);
    this.work = 0;
    this._gullT = 4;
    this.gull = 0;
    this._hostile = false;
    this._musicGain = 1;
    this._stance = '';
    this._phase = 'idle';
    this._creak = null;
    this._creakLevel = 0;
    this._drawPrev = 0;
    this._float = null;
    this._sluiceOpen = false;
    this._scratch = { x: 0, y: 0, z: 0 };
  }

  /** After the bank has decoded: the beds start (silent until the first update sets their levels). */
  start() {
    const g = this.game;
    if (this.ready || !g.ac || !g.buses) return;
    const B = g.buses;
    // the six buses' trims (TECH §14), under the player's sliders
    B.ambBus.gain.value = BUS_TRIM.ambience;
    B.sfxBus.gain.value = BUS_TRIM.sfx;
    B.instBus.gain.value = BUS_TRIM.inst;
    B.breaBus.gain.value = BUS_TRIM.brea;
    B.uiBus.gain.value = BUS_TRIM.ui;
    B.musicBus.gain.value = BUS_TRIM.music * MUSIC.trim;
    const Loop = LoopEmitter;
    for (const [name, set, tau] of [['pans', 'amb/pans', 0.6], ['saltrow', 'amb/saltrow', 0.6], ['shore', 'amb/shore', 0.6],
      ['trade', 'amb/trade', 0.8], ['gust', 'amb/cane-gust', 0.06], ['lull', 'amb/cane-lull', 0.12]]) {
      const first = g.bank.first(set);
      if (!first) continue;
      const l = new Loop(g.ac, first.buffer, B.ambBus, { gain: 0, native: true, tau });
      l.rowGain = first.row.gain ?? 1;
      l.start();
      this.beds[name] = l;
    }
    const cr = g.bank.first('bow/creak');
    if (cr) {
      this._creak = new Loop(g.ac, cr.buffer, B.breaBus, { gain: 0, native: true, tau: 0.05 });
      this._creak.rowGain = cr.row.gain ?? 1;
      this._creak.start();
    }
    this.ready = true;
  }

  /* ------------------------------------------------------------------ events (wired by audio.js) */

  /** A one-shot at a world point on a bus category. */
  at(set, pos, category, volume = 1, priority = PRI.inst, height = 0) {
    if (!pos) return false;
    return this.game.playAt(set, pos, { category, volume, priority, height, rate: 0.97 + Math.random() * 0.06 });
  }

  /** machine-attack-phase: true when this file voiced it (audio.js then stays quiet). */
  attackPhase(e) {
    const m = e.machine;
    const kind = m?.kind;
    if (!KIND_CUES[kind]) return false;
    const cue = ATTACK_CUES[e.attack || e.kind];
    if (cue) {
      const list = Array.isArray(cue[0]) ? cue : [cue];
      for (let i = 0; i < list.length; i++) if (list[i][0] === e.phase) this.at(list[i][1], m.position, 'inst', 1, PRI.big, 1);
    }
    return true;     // a kind of the slice: never the generic voice
  }

  /** machine-footfall for a slice kind: its own step. */
  stepSet(m) { return KIND_CUES[m?.kind]?.step || null; }
  /** A layer played over a kind's footfall (the Screed's hull), or null. */
  stepLayer(m) { return KIND_CUES[m?.kind]?.layer || null; }
  /** The idle bed for a slice kind. */
  idleSet(m) { return KIND_CUES[m?.kind]?.idle || null; }
  /** An arrow in a weak point. */
  weakSet(m) { return KIND_CUES[m?.kind]?.weak || 'bow/hit-weak'; }

  plumbChime(e) { const m = e.machine; return this.at('plumb/chime', m?.position || (e.x != null ? { x: e.x, y: 0, z: e.z } : null), 'inst', 1, PRI.big, 3); }
  plumbTopple(e) { return this.at('plumb/topple', e.machine?.position, 'inst', 1, PRI.big, 1.5); }

  sluice(e) {
    const keeper = this._keeper();
    const pos = keeper?.position;
    if (pos) this.at('gauge/gate', pos, 'sfx', 1, PRI.big, 1);
    this._sluiceOpen = !!e.open;
  }

  kindled(e) { const b = this._brazier(e.id); if (b) this.at('brazier/kindle', b, 'sfx', 1, PRI.work, 0.8); }
  restStart() { this.game.play2D('brazier/rest', { category: 'sfx', volume: 1 }); }

  /* ------------------------------------------------------------------ per frame */

  /**
   * @param {number} rdt real seconds
   * @param {boolean} playing
   */
  update(rdt, playing) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const p = ctx.player;
    this._lamps(p);
    this._bow(playing);
    this._lance(playing);
    this._gauge(playing);
    this._bedT -= rdt;
    if (this._bedT <= 0) {
      this._bedT = 0.25;
      this._places(p, playing);
    }
    this._caneT -= rdt;
    if (this._caneT <= 0) {
      this._caneT = 0.05;      // the gust's tell is a timing cue: 20 Hz
      this._caneUpdate(p, playing);
    }
    this._oneShots(rdt, p, playing);
    // music: 6 dB down while any Instrument is hostile (TECH §14), smoothed over ~0.4 s
    const want = (this._hostile ? Math.pow(10, -MUSIC.hostileDuckDb / 20) : 1);
    this._musicGain += (want - this._musicGain) * Math.min(1, rdt * 2.5);
    this.game.buses.musicBus.gain.value = BUS_TRIM.music * MUSIC.trim * this._musicGain;
  }

  /** A chirp on every lamp-state change (within CHIRP_RANGE of the listener). */
  _lamps(p) {
    const list = this.ctx.machines?.list;
    if (!list) return;
    const L = this.game._listener;
    let hostile = false;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const s = lampStateFor(m);
      const was = this._lamp.get(m);
      if (was === undefined) { this._lamp.set(m, s); continue; }       // first sight: its state, no chirp
      const dx = m.position.x - (p ? p.position.x : L.x), dz = m.position.z - (p ? p.position.z : L.z);
      const d2 = dx * dx + dz * dz;
      if (s === 'hostile' && d2 < 14400) hostile = true;
      if (s === was) continue;
      this._lamp.set(m, s);
      this.lamp.changes++;
      if (d2 > CHIRP_RANGE * CHIRP_RANGE) { this.lamp.outOfRange++; continue; }
      const played = this.game.playAt(`lamp/${s}`, m.position, {
        category: 'inst', volume: 1, priority: PRI.chirp, height: m.eyeHeight ?? 1.4,
      });
      if (played) this.lamp.chirps++; else this.lamp.missed++;
      if (this.lampChirps.length >= 64) this.lampChirps.shift();
      this.lampChirps.push({ t: +(performance.now() / 1000).toFixed(3), kind: m.kind, from: was, to: s, played, d: +Math.sqrt(d2).toFixed(1) });
    }
    this._hostile = hostile;
  }

  /** The bow's hold creak follows the draw (the Round-4 oscillator creak is retired when this runs). */
  _bow(playing) {
    if (!this._creak) return;
    const cb = this.ctx.combat;
    const draw = playing && cb ? (cb.drawStrength ?? 0) : 0;
    const lvl = creakLevel(draw, draw > this._drawPrev + 1e-4);
    this._drawPrev = draw;
    this._creak.volume = lvl * this._creak.rowGain;
  }

  /** The lance: off her back (stance 'draw' begins) and every swing (the strike phase begins), hit or miss. */
  _lance(playing) {
    const ml = this.ctx.combat?.melee;
    if (!ml || !playing) return;
    const st = ml.stance || '';
    if (st === 'draw' && this._stance !== 'draw') this.game.play2D('lance/draw', { category: 'brea', volume: 1 });
    this._stance = st;
    const ph = ml.phase || 'idle';
    if (ph === 'strike' && this._phase !== 'strike') this.game.play2D('lance/swing', { category: 'brea', volume: ml.heavy ? 1 : 0.8, rate: ml.heavy ? 0.9 : 1.05 });
    this._phase = ph;
  }

  /** The Gauge: the float ring moves a tenth; the sluice loop runs while open. */
  _gauge(playing) {
    const k = this._keeper();
    if (!k) return;
    const r = typeof k.reading === 'function' ? Math.round(k.reading() * 10) : null;
    if (r != null && this._float != null && r !== this._float && playing) this.at('gauge/float', k.position, 'inst', 1, PRI.work, 2);
    this._float = r;
  }

  _keeper() {
    const list = this.ctx.machines?.list;
    if (!list) return null;
    for (let i = 0; i < list.length; i++) if (list[i].kind === 'gauge' && list[i].alive) return list[i];
    return null;
  }

  _brazier(id) {
    const b = this.ctx.braziers?.list?.find?.((q) => q.id === id);
    const o = b?.obj?.position || b?.def || null;
    return o && o.x != null ? { x: o.x, y: (o.y ?? 0) + 0.6, z: o.z } : null;
  }

  /** Where the beds stand (4 Hz): Saltrow by its distance, the shore by the waterline's, the Pans the rest. */
  _places(p, playing) {
    if (!p) return;
    const x = p.position.x, z = p.position.z;
    this._waterT -= 0.25;
    if (this._waterT <= 0) { this._waterT = 0.5; this._waterD = this._waterline(x, z); }
    const dS = Math.hypot(x - SALTROW_MID.x, z - SALTROW_MID.z);
    const town = 1 - smooth(55, 150, dS);
    const shore = shoreLevel(this._waterD);
    const env = this.ctx.environment;
    const wind = clamp(env?.wind?.strength ?? 0.85, 0.3, 1.4);
    const on = playing ? 1 : 0.5;
    const B = this.beds;
    // Milestone 2 (src/audio/m2/director.js): the Pans' beds follow the zones on the regions seam, and the trade wind
    // thins off the Pans and in the calima (src/audio/m2/mix.js bedLevels)
    const HL = this.game.hour?.ready ? this.game.hour.levels : null;
    const pansK = HL ? HL.pansK : 1, tradeK = HL ? HL.tradeK : 1;
    if (B.pans) B.pans.volume = on * (1 - 0.8 * town) * pansK * B.pans.rowGain;
    if (B.saltrow) B.saltrow.volume = on * town * pansK * B.saltrow.rowGain;
    if (B.shore) B.shore.volume = on * shore * B.shore.rowGain;
    if (B.trade) B.trade.volume = on * clamp(wind / 0.85, 0.4, 1.4) * (1 - 0.6 * town) * tradeK * B.trade.rowGain;
    // pumps (positional loops while within 90 m) and the lit Braziers (within 35 m)
    const Z = this.game.zones;
    if (Z) {
      for (const pm of PUMP_AT) {
        const d = Math.hypot(x - pm.x, z - pm.z);
        if (d < 90) Z.ensure(`pump:${pm.id}`, 'saltrow/pump', pm.x, this._groundY(pm.x, pm.z) + 6, pm.z, { category: 'sfx', volume: 1 });
        else if (Z.has(`pump:${pm.id}`)) Z.retire(`pump:${pm.id}`, 0.8);
      }
      const br = this.ctx.braziers;
      if (br?.list) {
        for (const b of br.list) {
          const pos = this._brazier(b.id);
          if (!pos) continue;
          const key = `brazier:${b.id}`;
          const lit = br.lit?.has?.(b.id);
          if (lit && Math.hypot(x - pos.x, z - pos.z) < 35) Z.ensure(key, 'brazier/burn', pos.x, pos.y, pos.z, { category: 'sfx', volume: 1 });
          else if (Z.has(key)) Z.retire(key, 0.6);
        }
      }
      const k = this._keeper();
      if (k && this._sluiceOpen && Math.hypot(x - k.position.x, z - k.position.z) < 120) {
        Z.ensure('sluice', 'gauge/sluice', k.position.x, k.position.y + 0.5, k.position.z, { category: 'sfx', volume: 1 });
      } else if (Z.has('sluice')) Z.retire('sluice', 1.2);
    }
  }

  _groundY(x, z) { const T = this.ctx.terrain; try { return T ? T.getHeight(x, z) : 0; } catch { return 0; } }

  /** Distance to open sea (m): the nearest of 12 bearings x 8 radii with water deeper than 0.4 m (2 Hz). */
  _waterline(x, z) {
    const w = this.ctx.environment?.water || this.ctx.water;
    if (!w || typeof w.depthAt !== 'function') return 999;
    if (w.depthAt(x, z) > 0.4) return 0;
    const R = [6, 12, 20, 32, 50, 75, 105, 145];
    for (let r = 0; r < R.length; r++) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        if (w.depthAt(x + Math.cos(a) * R[r], z + Math.sin(a) * R[r]) > 0.4) return R[r];
      }
    }
    return 999;
  }

  /**
   * Wind in cane (20 Hz): the nearest reed within 36 m (the reed mask), its bed's gust clock read CANE_LEAD (1.05 s)
   * ahead, so the gust is heard at least 0.8 s before the wind at the bed reaches 4 m/s and cover opens.
   */
  _caneUpdate(p, playing) {
    const B = this.beds;
    if (!B.gust || !B.lull) return;
    const R = this.ctx.reeds;
    const c = this._cane;
    if (!p || !R || !R.mask || !playing) { B.gust.volume = 0; B.lull.volume = 0; c.gust = 0; c.lull = 0; return; }
    // the nearest reed: re-probed at 4 Hz (the ring), the clock read every tick
    this._probeT -= 0.05;
    if (this._probeT <= 0) { this._probeT = 0.25; this._caneProbe(p.position.x, p.position.z, R.mask); }
    if (c.bed < 0) { B.gust.volume = 0; B.lull.volume = 0; c.gust = 0; c.lull = 0; return; }
    const clock = R.clocks?.[c.bed];
    if (!clock) return;
    const tc = R.t ?? 0;
    c.ahead = clock.speed(tc + CANE_LEAD);
    const lv = caneLevels(c.ahead);
    const near = caneNear(c.d);
    c.gust = lv.gust * near; c.lull = lv.lull * near;
    B.gust.volume = c.gust * B.gust.rowGain;
    B.lull.volume = c.lull * B.lull.rowGain;
  }

  _caneProbe(x, z, M) {
    const c = this._cane;
    c.d = 999; c.bed = -1;
    const R = [0, 4, 8, 14, 22, 32];
    for (let r = 0; r < R.length && c.bed < 0; r++) {
      const n = r ? 8 : 1;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * R[r], pz = z + Math.sin(a) * R[r];
        if (!M.covers(px, pz) || M.cover(px, pz) < 0.45) continue;
        const b = M.bedAt(px, pz);
        if (b) { c.d = R[r]; c.bed = b.id; break; }
      }
    }
  }

  /** The bell on the hour, Saltrow's work while it is light, gulls near the sea. */
  _oneShots(rdt, p, playing) {
    if (!p || !playing) return;
    const x = p.position.x, z = p.position.z;
    const env = this.ctx.environment;
    const hour = env?.time;
    if (typeof hour === 'number') {
      const h = Math.floor(hour);
      if (this._hour != null && h !== this._hour) { this._tolls = 3; this._tollT = 0; }
      this._hour = h;
    }
    if (this._tolls > 0) {
      this._tollT -= rdt;
      if (this._tollT <= 0) {
        this._tollT = 2.6;
        this._tolls--;
        if (this.at('saltrow/bell', BELL_AT, 'sfx', 1, PRI.big, 0)) this.bell.tolls++;
      }
    }
    const light = typeof hour !== 'number' || (hour > 6 && hour < 20);
    for (let i = 0; i < WORK.length; i++) {
      this._work[i] -= rdt;
      if (this._work[i] > 0) continue;
      const w = WORK[i];
      this._work[i] = w.every[0] + Math.random() * (w.every[1] - w.every[0]);
      if (!light || Math.hypot(x - w.x, z - w.z) > 90) continue;
      this._scratch.x = w.x; this._scratch.z = w.z; this._scratch.y = this._groundY(w.x, w.z) + 0.6;
      if (this.at(w.set, this._scratch, 'sfx', 1, PRI.work, 0)) this.work++;
    }
    this._gullT -= rdt;
    if (this._gullT <= 0) {
      this._gullT = 7 + Math.random() * 9;
      if (this._waterD < 160) {
        const a = Math.random() * Math.PI * 2, r = 25 + Math.random() * 45;
        this._scratch.x = x + Math.cos(a) * r; this._scratch.z = z + Math.sin(a) * r; this._scratch.y = p.position.y + 14 + Math.random() * 10;
        if (this.at('amb/gull', this._scratch, 'ambience', 1, PRI.amb, 0)) this.gull++;
      }
    }
  }

  stats() {
    const b = {};
    for (const k of Object.keys(this.beds)) b[k] = +this.beds[k].volume.toFixed(3);
    return {
      ready: this.ready, lamp: { ...this.lamp }, beds: b,
      cane: { d: this._cane.d, bed: this._cane.bed, ahead: +this._cane.ahead.toFixed(2), gust: +this._cane.gust.toFixed(3), lull: +this._cane.lull.toFixed(3) },
      waterline: this._waterD, hostile: this._hostile, music: +this._musicGain.toFixed(3),
      bell: this.bell.tolls, work: this.work, gull: this.gull,
    };
  }

  dispose() {
    for (const l of Object.values(this.beds)) l.dispose();
    this.beds = {};
    this._creak?.dispose();
    this._creak = null;
    this.ready = false;
  }
}
