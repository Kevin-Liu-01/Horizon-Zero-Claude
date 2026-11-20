/**
 * THE FIRST HOUR'S CUE DIRECTOR (Milestone 2 audio; TECH §14). What the slice's director (../slice/director.js) did
 * not play: the zones on the regions seam (the Pans, the Holds, Ninewalls, the Scar, the Malpais edge) and their
 * crossfades; the calima at noon (the wind thins, the far sounds drop); Ninewalls' and the Holds' work; Oro's forge;
 * the Kit Rack; the Windwall's open, shut, plant, block, parry and bash; the gaff's swing, hit, hook and rip; the pots'
 * throw, break and seize; the Screed's charge, stall, seals, seize and cuts; the re-survey's Alidade; and the log of the
 * Tiller's trample tells (the tell itself is played on the wind-up by the slice director's attack table).
 *
 * It owns no Web Audio graph: it plays through GameAudio's bank, pool, zones and buses (../audio.js), so every cue is on
 * one of the six buses and counted by `cueCounts()`. It only CALLS the seams (the regions map's `depth`, the weather's
 * calima weight, the combat kit's state, the Holds people's routines, the re-survey's report, the Kit Rack's state) and
 * listens to ctx.events; it writes nothing outside the audio.
 *
 * Per frame it allocates nothing in steady state: the zones and the work are polled at 4 Hz, the kit every frame
 * (numbers), the beds' levels smoothed every frame.
 *
 * Its bank loads late (the manifest's `load: 'late'`; ../bank.js loadLate): it starts with the slice's bank, binds its
 * listeners at once, and builds each bed and the re-survey's hold when that loop's buffer lands. A bed is ASKED for the
 * first frame its level would be audible (over 0.01); that ask, and every cue it plays, is logged by the bank, so the
 * rows can read whether anything was wanted before it was decoded (`bank.lateAudit()`).
 *
 *   game.hour.zone          { pans, holds, other, malpais, nine, scar, edge, calima } (smoothed weights)
 *   game.hour.levels        bedLevels(zone): { pansK, tradeK, holds, ninewalls, scar, malpais, calima }
 *   game.hour.stats()       what the rows read (beds, zone, crossings, counts, trample tells)
 */
import { LoopEmitter } from '../spatial.js';
import { CENTRE as NW_CENTRE, PLACES as NW_PLACES } from '../../world/settlements/ninewalls-layout.js';
import { SCAR } from '../../world/island/sites.js';
import {
  ZONE, regionWeight, ninewallsWeight, scarWeight, malpaisEdgeWeight, bedLevels, calimaFarGain, TRAMPLE,
} from './mix.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const PRI = { amb: 1, work: 3, kit: 6, big: 8 };

/** A Holds person's act -> [set, every [lo, hi] s] (src/world/npc/people/holds.js loops). */
export const WORK_ACTS = Object.freeze({
  harvest: ['holds/hoe', [1.6, 2.6]],
  sow: ['holds/sow', [2.2, 3.4]],
  water: ['holds/water', [2.6, 3.8]],
  draw: ['holds/bucket', [4.0, 6.0]],
  fill: ['holds/bucket', [4.0, 6.0]],
  fetch: ['holds/bucket', [4.0, 6.0]],
  pick: ['holds/pick', [1.8, 3.0]],
  scrape: ['holds/pick', [1.8, 3.0]],
  sort: ['holds/sort', [2.4, 4.0]],
  hammer: ['forge/anvil', [1.1, 1.7]],
  quench: ['forge/quench', [6.0, 9.0]],
});
/** Work is heard within this distance (m) of a person; the forge's hearth within FORGE_R of the tube mouth. */
export const WORK_R = 70, FORGE_R = 60;

/** The beds: name -> set (2D loops on the ambience bus). */
const BEDS = [['holds', 'amb/holds'], ['ninewalls', 'amb/ninewalls'], ['scar', 'amb/scar'], ['malpais', 'amb/malpais'], ['calima', 'amb/calima']];

export class HourAudio {
  /** @param {import('../audio.js').GameAudio} game */
  constructor(game) {
    this.game = game;
    this.ctx = game.ctx;
    this.ready = false;
    this.beds = {};
    this.zone = { pans: 1, holds: 0, other: 0, malpais: 0, nine: 0, scar: 0, edge: 0, calima: 0 };
    this._zt = { pans: 1, holds: 0, other: 0, malpais: 0, nine: 0, scar: 0, edge: 0 };
    this.levels = bedLevels(this.zone);
    this._zoneT = 0;
    this._workT = 0;
    this._work = new WeakMap();          // a routine entry -> { act, t }
    this._bellowsT = 4;
    this._hold = null;
    this._holdLevel = 0;
    this._holdArc = -1;
    this._ww = { phase: 'stowed' };
    this._gaffN = -1;
    this._potFlying = false;
    this._rack = { open: false, sel: -1 };
    this._lastPot = null;
    this._pending = [];                  // [{ t, set, pos, cat, vol }] (a cue a moment after its event)
    this._scratch = { x: 0, y: 0, z: 0 };
    this.counts = { work: 0, forge: 0, kit: 0, screed: 0, alidade: 0, rack: 0 };
    this.crossings = [];                 // [{ type, region, t, bed }]: each enter/leave with the beds' levels there
    this.trample = { tells: [], hits: [] };
    this._listeners = [];
    this.calima = 0;
    this._bedAsked = { holds: false, ninewalls: false, scar: false, malpais: false, calima: false };
    this._holdAsked = false;
    this._bedsDone = false;
  }

  /** Build each bed and the hold whose loop has landed (late bank). Idempotent; cheap once all are up. */
  _ensureBeds() {
    const g = this.game;
    if (this._bedsDone || !g.bank || !g.ac || !g.buses) return;
    let all = true;
    for (const [name, set] of BEDS) {
      if (this.beds[name]) continue;
      const first = g.bank.peek(set);
      if (!first) { all = false; continue; }
      const l = new LoopEmitter(g.ac, first.buffer, g.buses.ambBus, { gain: 0, native: true, tau: 0.5 });
      l.rowGain = first.row.gain ?? 1;
      l.start();
      this.beds[name] = l;
    }
    if (!this._hold) {
      const h = g.bank.peek('alidade/hold');
      if (h) {
        this._hold = new LoopEmitter(g.ac, h.buffer, g.buses.breaBus, { gain: 0, native: true, tau: 0.15 });
        this._hold.rowGain = h.row.gain ?? 1;
        this._hold.start();
      } else all = false;
    }
    this._bedsDone = all;
  }

  /** The late bank has landed (GameAudio): the beds and the hold come up now, not at the next poll. */
  lateLanded() { if (this.ready) this._ensureBeds(); }

  /** How much she is in a place now (0..1), from the zones' targets: the late load fetches her place's rows first. */
  placeWeight(place) {
    const T = this._zt;
    if (place === 'holds') return Math.min(1, T.holds + T.other);
    if (place === 'ninewalls') return T.nine;
    if (place === 'scar') return T.scar;
    if (place === 'malpais') return Math.max(T.malpais, T.edge);
    return 0;
  }

  /**
   * After the boot bank has decoded (GameAudio's bankReady): the listeners bind; the beds start silent as their loops
   * land (now, if the late bank is already in; else at the 4 Hz poll or when it lands).
   */
  start() {
    const g = this.game;
    if (this.ready || !g.ac || !g.buses) return;
    this._bind();
    this.ready = true;
    this._ensureBeds();
  }

  /* ------------------------------------------------------------------ events */

  _on(name, fn) {
    const ev = this.ctx.events;
    if (!ev?.on) return;
    const f = (e) => { if (this.ready && this.game.ac) { try { fn(e || {}); } catch (err) { console.warn(`[CAL] audio (hour) ${name}:`, err?.message || err); } } };
    ev.on(name, f);
    this._listeners.push([name, f]);
  }

  _bind() {
    const P = (m) => m?.position || null;
    // the regions seam: each crossing logged with the beds' levels at that moment (the zones' row reads them)
    for (const type of ['enter', 'leave']) {
      this._on(`region-${type}`, (e) => {
        if (this.crossings.length >= 32) this.crossings.shift();
        this.crossings.push({ type, region: e.region, t: +(performance.now() / 1000).toFixed(2), zone: this._zoneSnap() });
      });
    }
    // the Windwall
    this._on('windwall-planted', (e) => {
      this._scratch.x = e.x; this._scratch.z = e.z; this._scratch.y = this._groundY(e.x, e.z) + 0.3;
      if (this.game.playAt('windwall/plant', this._scratch, { category: 'sfx', volume: 1, priority: PRI.kit })) this.counts.kit++;
    });
    this._on('windwall-block', (e) => { if (this._atHer(e.result === 'parry' ? 'windwall/parry' : 'windwall/block', 0.6, 1.2, 'sfx', 1)) this.counts.kit++; });
    this._on('windwall-bash', () => { if (this._atHer('windwall/bash', 0.9, 1.1, 'sfx', 1)) this.counts.kit++; });
    // the gaff's contact (combat's kit verbs): the hook-rip's bite and, a moment later, the rip; or a light's hit
    this._on('gaff-hit', (e) => {
      if (!e.kind) return;
      if (e.verb === 'hookRip') {
        if (this._atHer('gaff/hook', 1.5, 1.2, 'sfx', 1)) this.counts.kit++;
        if (e.torn || e.blown === 'off') this._later(0.16, 'gaff/rip', this._herPoint(1.6, 1.2), 'sfx', 1);
      } else if (this._atHer('gaff/hit', 1.5, 1.2, 'sfx', 1)) this.counts.kit++;
    });
    // the pots
    this._on('pot-landed', (e) => {
      const at = e.at;
      if (!at) return;
      this._lastPot = { x: at.x, y: at.y + 0.3, z: at.z };
      if (this.game.playAt(e.id === 'cinder' ? 'pot/cinder' : 'pot/break', this._lastPot, { category: 'sfx', volume: 1, priority: PRI.kit })) this.counts.kit++;
    });
    this._on('pot-status', (e) => {
      if (e.pot !== 'brine' || !this._lastPot) return;
      if (this.game.playAt('pot/seize', this._lastPot, { category: 'sfx', volume: 1, priority: PRI.kit, height: 1 })) this.counts.kit++;
    });
    // the Screed (its own events, scar-plan.js names)
    const screed = (set, h = 1.5) => (e) => { if (this.game.playAt(set, P(e.machine), { category: set === 'screed/cut' ? 'sfx' : 'inst', volume: 1, priority: PRI.big, height: h, duck: 0.3 })) this.counts.screed++; };
    this._on('screed-charge', screed('screed/charge'));
    this._on('screed-stalled', screed('screed/stall', 0.8));
    this._on('screed-stalled-rock', screed('screed/stall', 0.8));
    this._on('seal-off', screed('screed/seal', 1.4));
    this._on('screed-seized', screed('screed/seize', 1.4));
    this._on('screed-cut', screed('screed/cut', 0.6));
    // the re-survey
    this._on('resurvey-bearing', () => { if (this.game.play2D('alidade/mark', { category: 'brea', volume: 1 })) this.counts.alidade++; });
    this._on('resurvey-done', () => { if (this.game.play2D('alidade/true', { category: 'brea', volume: 1 })) this.counts.alidade++; });
    // the trample tells (the cue is the slice director's attack table): their times, and the hits that follow
    this._on('machine-attack-phase', (e) => {
      if (e.attack !== TRAMPLE.attack || e.phase !== 'windup') return;
      const m = e.machine, p = this.ctx.player?.position;
      if (this.trample.tells.length >= 32) this.trample.tells.shift();
      this.trample.tells.push({ t: performance.now() / 1000, d: m && p ? +Math.hypot(m.position.x - p.x, m.position.z - p.z).toFixed(2) : null, m });
    });
    this._on('player-damage', (e) => {
      const m = e.from;
      if (!m || m.kind !== 'tiller') return;
      const now = performance.now() / 1000;
      let tell = null;
      for (let i = this.trample.tells.length - 1; i >= 0; i--) { const q = this.trample.tells[i]; if (q.m === m && now - q.t < 3) { tell = q; break; } }
      if (!tell) return;
      if (this.trample.hits.length >= 32) this.trample.hits.shift();
      this.trample.hits.push({ leadS: +(now - tell.t).toFixed(3), d0: tell.d });
    });
  }

  dispose() {
    const ev = this.ctx.events;
    for (const [n, f] of this._listeners) { try { ev?.off?.(n, f); } catch { /* bus gone */ } }
    this._listeners.length = 0;
    for (const l of Object.values(this.beds)) l.dispose();
    this.beds = {};
    this._hold?.dispose(); this._hold = null;
    this._bedsDone = false;
    this.ready = false;
  }

  /* ------------------------------------------------------------------ helpers */

  _groundY(x, z) { const T = this.ctx.terrain; try { return T ? T.getHeight(x, z) : 0; } catch { return 0; } }

  /** A point `ahead` m in front of her at `h` m (the gaff's tip, the Windwall's face). */
  _herPoint(ahead, h) {
    const p = this.ctx.player;
    if (!p) return null;
    const hd = p.heading || 0;
    return { x: p.position.x + Math.sin(hd) * ahead, y: p.position.y + h, z: p.position.z + Math.cos(hd) * ahead };
  }

  _atHer(set, ahead, h, cat, vol) {
    const pt = this._herPoint(ahead, h);
    return pt ? this.game.playAt(set, pt, { category: cat, volume: vol, priority: PRI.kit }) : false;
  }

  _later(dt, set, pos, cat, vol) {
    if (this._pending.length >= 8) this._pending.shift();
    this._pending.push({ t: dt, set, pos, cat, vol });
  }

  _zoneSnap() {
    const L = this.levels;
    return { holds: +L.holds.toFixed(3), ninewalls: +L.ninewalls.toFixed(3), scar: +L.scar.toFixed(3), malpais: +L.malpais.toFixed(3), pans: +L.pansK.toFixed(3) };
  }

  /** Calima at noon: a one-shot at `d` m (GameAudio.playAt multiplies its voice by this). */
  farGain(d) { return calimaFarGain(d, this.calima); }

  /* ------------------------------------------------------------------ per frame */

  update(rdt, playing) {
    if (!this.ready) return;
    const ctx = this.ctx, p = ctx.player;
    // the weather's calima weight (environment's blended state)
    const w = ctx.environment?.w;
    this.calima = clamp(w && Number.isFinite(w.calima) ? w.calima : 0, 0, 1);
    this._zoneT -= rdt;
    if (this._zoneT <= 0) { this._zoneT = 0.25; this._zoneTargets(p); this._ensureBeds(); }
    // smooth the weights, then the beds' levels
    const Z = this.zone, T = this._zt;
    const kR = 1 - Math.exp(-rdt / ZONE.tau), kS = 1 - Math.exp(-rdt / ZONE.subTau);
    for (const k of ['pans', 'holds', 'other', 'malpais']) Z[k] += (T[k] - Z[k]) * kR;
    for (const k of ['nine', 'scar', 'edge']) Z[k] += (T[k] - Z[k]) * kS;
    Z.calima = this.calima;
    const L = bedLevels(Z, this.levels);
    const on = playing ? 1 : 0.5;
    const B = this.beds;
    // the asks: a bed is wanted the first frame its level would be audible (logged by the bank against its decode)
    const A = this._bedAsked, bank = this.game.bank;
    if (bank) {
    if (!A.holds && on * L.holds > 0.01) { A.holds = true; bank.noteAsk('amb/holds'); }
    if (!A.ninewalls && on * L.ninewalls > 0.01) { A.ninewalls = true; bank.noteAsk('amb/ninewalls'); }
    if (!A.scar && on * L.scar > 0.01) { A.scar = true; bank.noteAsk('amb/scar'); }
    if (!A.malpais && on * L.malpais > 0.01) { A.malpais = true; bank.noteAsk('amb/malpais'); }
    if (!A.calima && on * L.calima > 0.01) { A.calima = true; bank.noteAsk('amb/calima'); }
    }
    if (B.holds) B.holds.volume = on * L.holds * B.holds.rowGain;
    if (B.ninewalls) B.ninewalls.volume = on * L.ninewalls * B.ninewalls.rowGain;
    if (B.scar) B.scar.volume = on * L.scar * B.scar.rowGain;
    if (B.malpais) B.malpais.volume = on * L.malpais * B.malpais.rowGain;
    if (B.calima) B.calima.volume = on * L.calima * B.calima.rowGain;
    if (!playing || !p) { if (this._hold) this._hold.volume = 0; return; }
    for (let i = this._pending.length - 1; i >= 0; i--) {
      const q = this._pending[i];
      q.t -= rdt;
      if (q.t > 0) continue;
      this._pending.splice(i, 1);
      if (q.pos && this.game.playAt(q.set, q.pos, { category: q.cat, volume: q.vol, priority: PRI.kit })) this.counts.kit++;
    }
    this._kit();
    this._rackPoll();
    this._resurvey(rdt);
    this._workT -= rdt;
    if (this._workT <= 0) { this._workT = 0.25; this._workPoll(0.25, p); }
  }

  /** The zones' targets (4 Hz): the regions' weights from their depths, the sub-zones from distances. */
  _zoneTargets(p) {
    const T = this._zt;
    if (!p) return;
    const x = p.position.x, z = p.position.z;
    const map = this.ctx.regions?.map;
    if (map?.depth) {
      let sum = 0;
      const wp = regionWeight(map.depth('pans', x, z)), wh = regionWeight(map.depth('holds', x, z)), wm = regionWeight(map.depth('malpais', x, z));
      sum = wp + wh + wm;
      // any other region (not built in the first hour): the Holds' bed stands in
      const wo = sum < 1 ? 1 - sum : 0;
      const n = Math.max(1, sum + wo);
      T.pans = wp / n; T.holds = wh / n; T.malpais = wm / n; T.other = wo / n;
      T.edge = malpaisEdgeWeight(map.depth('malpais', x, z));
    } else { T.pans = 1; T.holds = 0; T.malpais = 0; T.other = 0; T.edge = 0; }
    T.nine = ninewallsWeight(Math.hypot(x - NW_CENTRE.x, z - NW_CENTRE.z));
    T.scar = scarWeight(x, z, SCAR);
  }

  /** The Windwall's fan (open / shut on its phases), the gaff's swings, the pot leaving her hand. */
  _kit() {
    const cb = this.ctx.combat;
    if (!cb) return;
    const ww = cb.windwall;
    if (ww?.owned) {
      const ph = ww.phase;
      if (ph !== this._ww.phase) {
        if (ph === 'opening' && this.game.play2D('windwall/open', { category: 'brea', volume: 1 })) this.counts.kit++;
        else if (ph === 'closing' && this.game.play2D('windwall/shut', { category: 'brea', volume: 1 })) this.counts.kit++;
        this._ww.phase = ph;
      }
    }
    const g = cb.gaff;
    if (g?.owned && g.verbs) {
      const n = g.verbs.count;
      if (this._gaffN >= 0 && n !== this._gaffN) {
        const rip = g.verbs.verb?.id === 'hookRip';
        if (this.game.play2D('gaff/swing', { category: 'brea', volume: rip ? 1 : 0.8, rate: rip ? 0.88 : 0.96 + Math.random() * 0.08 })) this.counts.kit++;
      }
      this._gaffN = n;
    }
    const K = cb.pots;
    if (K?.owned) {
      const fl = !!K.flying;
      if (fl && !this._potFlying && this.game.play2D('pot/throw', { category: 'brea', volume: 1 })) this.counts.kit++;
      this._potFlying = fl;
    }
  }

  /** The Kit Rack: it opens, a sector passes, the sector is taken. */
  _rackPoll() {
    const R = this.ctx.quickslots?.rack;
    if (!R) return;
    const S = this._rack;
    if (R.open && !S.open) { if (this.game.play2D('rack/open', { category: 'ui', volume: 1 })) this.counts.rack++; S.sel = R.sel; }
    else if (R.open && R.sel !== S.sel) { if (this.game.play2D('rack/step', { category: 'ui', volume: 1 })) this.counts.rack++; S.sel = R.sel; }
    else if (!R.open && S.open) { if (this.game.play2D('rack/take', { category: 'ui', volume: 1 })) this.counts.rack++; }
    S.open = !!R.open;
  }

  /** The re-survey's hold: up while the arc fills on the mark, under it while paused, gone when off or done. */
  _resurvey(rdt) {
    const H = this._hold;
    const L = this.ctx.systemsGame?.hour?.resurvey;
    if (!this._holdAsked && L && L.armed && L.running && !L.R?.done) { this._holdAsked = true; this.game.bank?.noteAsk('alidade/hold'); }
    if (!H) return;
    let want = 0;
    if (L && L.armed && L.running && !L.R?.done) {
      const arc = L.R?.arc ?? 0;
      want = arc > this._holdArc + 1e-6 ? 1 : 0.3;
      this._holdArc = arc;
    } else this._holdArc = -1;
    this._holdLevel += (want - this._holdLevel) * Math.min(1, rdt * 8);
    H.volume = this._holdLevel * H.rowGain;
  }

  /**
   * The Holds at work (4 Hz): each person in a work act within WORK_R of her plays its act's cue at their place on its
   * own clock; Oro's hearth burns while she is within FORGE_R of the tube mouth, with the bellows between.
   */
  _workPoll(dt, p) {
    const x = p.position.x, z = p.position.z;
    const R = this.ctx.people?.holds?.routines;
    const list = R?.list;
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        const row = WORK_ACTS[e.act];
        const pos = e.person?.group?.position;
        if (!row || !pos) { this._work.delete(e); continue; }
        if (Math.hypot(pos.x - x, pos.z - z) > WORK_R) continue;
        let s = this._work.get(e);
        if (!s || s.act !== e.act) { s = { act: e.act, t: 0.6 + Math.random() * 1.2 }; this._work.set(e, s); }
        s.t -= dt;
        if (s.t > 0) continue;
        s.t = row[1][0] + Math.random() * (row[1][1] - row[1][0]);
        this._scratch.x = pos.x; this._scratch.y = pos.y + 0.6; this._scratch.z = pos.z;
        if (this.game.playAt(row[0], this._scratch, { category: 'sfx', volume: 1, priority: PRI.work, rate: 0.96 + Math.random() * 0.08 })) {
          if (row[0].startsWith('forge/')) this.counts.forge++; else this.counts.work++;
        }
      }
    }
    // the forge's hearth (a positional loop) and its bellows
    const Zn = this.game.zones;
    const fm = NW_PLACES.tubeMouth;
    const dF = Math.hypot(x - fm.x, z - fm.z);
    if (Zn) {
      if (dF < FORGE_R) Zn.ensure('forge', 'forge/fire', fm.x, this._groundY(fm.x, fm.z) + 0.8, fm.z, { category: 'sfx', volume: 1 });
      else if (Zn.has('forge')) Zn.retire('forge', 0.8);
    }
    this._bellowsT -= dt;
    if (this._bellowsT <= 0) {
      this._bellowsT = 7 + Math.random() * 7;
      if (dF < 45) {
        this._scratch.x = fm.x; this._scratch.z = fm.z; this._scratch.y = this._groundY(fm.x, fm.z) + 0.8;
        if (this.game.playAt('forge/bellows', this._scratch, { category: 'sfx', volume: 1, priority: PRI.work })) this.counts.forge++;
      }
    }
  }

  stats() {
    const b = {};
    for (const k of Object.keys(this.beds)) b[k] = +this.beds[k].volume.toFixed(3);
    const z = {};
    for (const k of Object.keys(this.zone)) z[k] = +this.zone[k].toFixed(3);
    return {
      ready: this.ready, beds: b, zone: z, calima: +this.calima.toFixed(3), hold: +this._holdLevel.toFixed(3),
      counts: { ...this.counts }, crossings: this.crossings.slice(),
      trample: { tells: this.trample.tells.length, hits: this.trample.hits.slice() },
    };
  }
}
