import { ResurveyHold, bearingTo, chooseLookers } from './rules.js';
import { RESURVEY } from '../quest/scar-plan.js';

/**
 * THE RE-SURVEY, LIVE (Milestone 2 area E, HR3): the rule in ./rules.js fed from the game each simulation step, its
 * overlay (the 15 s arc round the Alidade's hairs and three bearing pips), and the Instruments that come to look.
 * Built by the systems runtime (src/game/runtime.js) and armed while "True Ground"'s 'survey' stage runs.
 *
 *   const L = new ResurveyLive(ctx, { at, marks, hooks })   at: the pad {x, z}; marks: [{ id, x, z, y0, y1, name }]
 *   L.arm(on)            the stage runs (or not); the overlay shows on the pad with the Alidade up
 *   L.update(dt)         one simulation step (the runtime's update, playing only)
 *   L.take()             T while Sighting (registered here on ctx.input)
 *   L.report()           the rule's report + the lookers' times (what the runner and F44 read)
 *
 * hooks: start() · bearing({ id, bearing, n }) · paused(why) · lookers(list) · done(report)
 * (the runtime turns them into Brea's turns, the spine's events and true ground).
 *
 * Input: V raises the Alidade (src/ui/sighting.js); T takes a bearing (Sighting's own T Flags an Instrument in the hairs,
 * this one takes the mark's bearing; both may answer one press). Nothing here moves her, the camera or a hand.
 */
export class ResurveyLive {
  constructor(ctx, { at, marks, hooks = {}, rules = RESURVEY } = {}) {
    this.ctx = ctx;
    this.at = at;
    this.cfg = rules;
    this.hooks = hooks;
    this.R = new ResurveyHold({ marks, holdS: rules.holdS, onDeg: rules.onDeg, bearingDeg: rules.bearingDeg, hitDamage: rules.hitDamage });
    this.armed = false;
    this.running = false;    // the hold has begun (the Alidade first up on the pad)
    this.startT = -1;
    this.simT = 0;
    this.lookers = [];       // [{ m, id, kind, from {x,z}, to {x,z}, leaveT, arriveT, d0 }]
    this._relureT = 0;
    this._hp = null;
    this._lastWhy = null;
    this._buildDom();
    ctx.input?.onDown?.('KeyT', () => { if (ctx.state === 'playing' || ctx.params?.has?.('shot')) this.take(); });
    ctx.events?.on?.('player-hurt', (e) => this._hurt(e));
  }

  /* ------------------------------------------------------------ input */

  _view() {
    const cam = this.ctx.camera, p = this.ctx.player?.position;
    if (!cam || !p) return null;
    const eye = { x: 0, y: 0, z: 0 }, dir = { x: 0, y: 0, z: 0 };
    if (cam.getWorldPosition && cam.getWorldDirection) {
      const v = this._v || (this._v = cam.position.clone());
      cam.getWorldPosition(v); eye.x = v.x; eye.y = v.y; eye.z = v.z;
      cam.getWorldDirection(v); dir.x = v.x; dir.y = v.y; dir.z = v.z;
    } else return null;
    const onPad = Math.hypot(p.x - this.at.x, p.z - this.at.z) <= this.cfg.padR;
    return { eye, dir, alidade: !!this.ctx.sighting?.on, onPad };
  }

  _hurt(e) {
    const h = Number(e?.health);
    if (!Number.isFinite(h)) return;
    const was = this._hp;
    this._hp = h;
    if (!this.running || this.R.done || was == null) return;
    const dmg = was - h;
    if (dmg > 0 && this.R.hit(dmg)) this._say('paused', 'hit');
  }

  arm(on) {
    this.armed = !!on;
    if (!this.armed) this._show(false);
    this._hp = this.ctx.player?.health ?? null;
  }

  take() {
    if (!this.armed || !this.running || this.R.done) return null;
    const v = this._view();
    if (!v) return null;
    const r = this.R.take(v);
    if (r) {
      this._say('bearing', r);
      this._paint();
      if (this.R.done) this._finish();
    }
    return r;
  }

  /* ------------------------------------------------------------ the step */

  update(dt) {
    if (!this.armed || this.R.done) { if (this.R.done) this._show(false); return; }
    this.simT += dt;
    const v = this._view();
    if (!v) return;
    if (!this.running) {
      this._show(v.onPad && v.alidade);
      if (!(v.onPad && v.alidade)) return;
      this.running = true;
      this.startT = this.simT;
      this._hp = this.ctx.player?.health ?? this._hp;
      this._sendLookers();
      this._say('start');
    }
    this.R.step(dt, v);
    const why = this.R.on ? null : this.R._why;
    if (why && why !== this._lastWhy && (why === 'offMark' || why === 'hit')) this._say('paused', why);
    this._lastWhy = why;
    this._trackLookers(dt);
    this._show(v.onPad && v.alidade);
    this._paint();
    if (this.R.done) this._finish();
  }

  _finish() {
    if (this._finished) return;
    this._finished = true;
    this._show(false);
    for (const L of this.lookers) if (L.m?.ai) L.m.ai.lureT = 0;
    this._say('done', this.report());
  }

  /* ------------------------------------------------- come to look */

  /** `only`: the machines that may come (F44's staging hands its own three); else every live one near. */
  _sendLookers(only = null) {
    const M = this.ctx.machines;
    const list = (only || M?.list || []).filter((m) => m && m.alive !== false && !m._disposed && m.position);
    const refuse = (k) => this.hooks.refuses?.(k) ?? false;
    const plain = list.map((m, i) => ({ id: i, kind: m.kind, x: m.position.x, z: m.position.z }));
    const pick = chooseLookers(plain, this.at, { n: 3, range: 70, standOff: 6, refuse });
    this.lookers = pick.map((p) => {
      const m = list[p.id];
      return { m, id: m.id ?? p.id, kind: m.kind, from: { x: m.position.x, z: m.position.z }, to: { x: p.x, z: p.z }, d0: p.d, leaveT: -1, arriveT: -1, dMin: p.d };
    });
    this._lure();
    this._say('lookers', this.lookers.map((L) => ({ kind: L.kind, d0: L.d0 })));
  }

  _lure() {
    for (const L of this.lookers) {
      const m = L.m;
      if (!m || m.alive === false || m._disposed || !m.ai?.lure) continue;
      // a lure holds it on the point (machine ai lure: suspicious, creeping to the point at 0.7 of its walk)
      if (m.state !== 'attack' && m.state !== 'alert') m.ai.lure(L.to.x, L.to.z, 6);
    }
  }

  _trackLookers(dt) {
    this._relureT += dt;
    if (this._relureT >= 2) { this._relureT = 0; this._lure(); }
    const t = this.simT - this.startT;
    for (const L of this.lookers) {
      const m = L.m;
      if (!m || m.alive === false || !m.position) continue;
      const moved = Math.hypot(m.position.x - L.from.x, m.position.z - L.from.z);
      const d = Math.hypot(m.position.x - this.at.x, m.position.z - this.at.z);
      if (L.leaveT < 0 && moved > 1.0) L.leaveT = +t.toFixed(2);
      if (L.arriveT < 0 && d <= this.cfg.nearM) L.arriveT = +t.toFixed(2);
      if (d < L.dMin) L.dMin = +d.toFixed(2);
    }
  }

  /* ------------------------------------------------------------ out */

  _say(what, arg) { const fn = this.hooks[what]; if (typeof fn === 'function') { try { fn(arg); } catch (err) { this.hookErrors = (this.hookErrors ?? 0) + 1; this.lastHookError = String(err?.message || err); } } }

  report() {
    const C = this.cfg;
    const looks = this.lookers.map((L) => ({ kind: L.kind, d0: +L.d0.toFixed(1), leaveT: L.leaveT, arriveT: L.arriveT, dMin: +(+L.dMin).toFixed(1) }));
    const left = looks.filter((L) => L.leaveT >= 0 && L.leaveT <= C.leaveS).length;
    const came = looks.filter((L) => L.arriveT >= 0 && L.arriveT <= C.arriveS).length;
    return { ...this.R.report(), running: this.running, startT: this.startT, simT: +this.simT.toFixed(3), lookers: looks, lookersLeft: left, lookersCame: came,
      comeToLook: left >= C.lookers && came >= C.lookers };
  }

  /* ------------------------------------------------------------ the overlay */

  _buildDom() {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'cal-resurvey';
    el.id = 'cal-resurvey';
    el.setAttribute('aria-hidden', 'true');
    const R = 46, C = 2 * Math.PI * R;
    this._circ = C;
    el.innerHTML = `
      <svg class="crs-arc" width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="${R}" fill="none" stroke="rgba(214,240,238,0.22)" stroke-width="1"/>
        <circle class="crs-fill" cx="60" cy="60" r="${R}" fill="none" stroke="#F2EAD3" stroke-width="3"
          stroke-dasharray="0 ${C.toFixed(2)}" transform="rotate(-90 60 60)" stroke-linecap="butt"/>
      </svg>
      <div class="crs-pips"></div>
      <div class="crs-t"></div>`;
    const st = el.style;
    Object.assign(st, { position: 'fixed', left: '50%', top: '50%', width: '120px', height: '120px', marginLeft: '-60px', marginTop: '-60px', pointerEvents: 'none', zIndex: '40', display: 'none', fontFamily: '"IBM Plex Mono", monospace', color: '#F2EAD3' });
    const pips = el.querySelector('.crs-pips');
    Object.assign(pips.style, { position: 'absolute', left: '50%', top: '128px', transform: 'translateX(-50%)', display: 'flex', gap: '14px', whiteSpace: 'nowrap', fontSize: '11px', letterSpacing: '0.08em' });
    for (const m of this.R.marks) {
      const p = document.createElement('div');
      p.className = 'crs-pip';
      p.dataset.mark = m.id;
      Object.assign(p.style, { display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 7px', border: '1px solid rgba(214,240,238,0.35)', background: 'rgba(214,240,238,0.08)' });
      p.innerHTML = `<span class="crs-dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;border:1px solid #F2EAD3"></span><span class="crs-name" style="font-family:'Chakra Petch',sans-serif">${m.label ?? m.id}</span><span class="crs-brg">---</span>`;
      pips.appendChild(p);
    }
    const tt = el.querySelector('.crs-t');
    Object.assign(tt.style, { position: 'absolute', left: '50%', top: '-22px', transform: 'translateX(-50%)', fontSize: '11px', letterSpacing: '0.1em', whiteSpace: 'nowrap' });
    (document.getElementById('app') || document.body).appendChild(el);
    this.el = el;
    this._fill = el.querySelector('.crs-fill');
    this._tt = tt;
  }

  _show(on) {
    if (!this.el) return;
    const want = !!on && this.armed && !this.R.done;
    if (want === this._shown) return;
    this._shown = want;
    this.el.style.display = want ? 'block' : 'none';
    this.el.classList.toggle('on', want);
  }

  _paint() {
    if (!this.el) return;
    const k = this.R.progress;
    this._fill.setAttribute('stroke-dasharray', `${(k * this._circ).toFixed(2)} ${this._circ.toFixed(2)}`);
    this._fill.setAttribute('stroke-opacity', this.R.on ? '1' : '0.45');
    this._tt.textContent = `${this.R.arc.toFixed(1)} / ${this.R.holdS} s`;
    for (const p of this.el.querySelectorAll('.crs-pip')) {
      const b = this.R.bearings.get(p.dataset.mark);
      const dot = p.querySelector('.crs-dot');
      dot.style.background = b != null ? '#F2EAD3' : (this.R.mark === p.dataset.mark ? 'rgba(242,234,211,0.35)' : 'transparent');
      p.querySelector('.crs-brg').textContent = b != null ? String(Math.round(b) % 360).padStart(3, '0') : '---';
    }
  }

  dispose() { this.el?.remove(); }
}

/** The three marks as upright segments from the live ground: T1, T2 (foot to plate) and the Sounding Ring. */
export function liveMarks({ ground, trig, trigTop, ring, ringH = 32.8, names = {} }) {
  const out = [];
  for (const id of RESURVEY.marks) {
    if (id === 'sounding-ring') {
      if (!ring) continue;
      const g = ground(ring.x, ring.z);
      out.push({ id, label: names[id] ?? 'RING', x: ring.x, z: ring.z, y0: g, y1: g + ringH });
    } else {
      const t = trig.find((p) => p.id === id);
      if (!t) continue;
      const g = ground(t.x, t.z);
      out.push({ id, label: names[id] ?? id, x: t.x, z: t.z, y0: g, y1: g + trigTop });
    }
  }
  return out;
}

export { bearingTo };
