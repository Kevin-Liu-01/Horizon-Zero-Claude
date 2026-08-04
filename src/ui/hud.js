import * as THREE from 'three';
import './hud.css';

const RAD2DEG = 180 / Math.PI;

const ARROW_DEFS = [
  { id: 'hunter', key: '1', label: 'HUNTER' },
  { id: 'fire', key: '2', label: 'FIRE' },
  { id: 'shock', key: '3', label: 'SHOCK' },
];

const QUEST = [
  { kind: 'watcher', need: 4, title: 'THIN THE HERD', detail: 'Destroy the Watchers prowling the meadow' },
  { kind: 'sawtooth', need: 2, title: 'FANGS OF THE VALLEY', detail: 'Bring down both Sawtooths' },
  { kind: 'behemoth', need: 1, title: 'THE BULL', detail: 'Topple the Behemoth in the hills' },
  { kind: 'thunderjaw', need: 1, title: 'SHADOW OF THE APEX', detail: 'Slay the Thunderjaw' },
];

const XP = { watcher: 120, sawtooth: 480, behemoth: 900, thunderjaw: 2500 };

function wrap180(d) {
  d %= 360;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return d;
}
function norm360(d) {
  d %= 360;
  return d < 0 ? d + 360 : d;
}
function div(cls, parent, html) {
  const el = document.createElement('div');
  el.className = cls;
  if (html != null) el.innerHTML = html;
  parent.appendChild(el);
  return el;
}

/**
 * HZD-style presentation layer: vitals, compass, quiver, crosshair, objective
 * quest chain, damage numbers, kill feed, machine health bar, vignette,
 * death/victory screens and the pause menu (this system owns pause toggling).
 */
export class HUD {
  constructor(ctx) {
    this.ctx = ctx;
    this.rootEl = document.getElementById('hud');

    this._vw = window.innerWidth;
    this._vh = window.innerHeight;
    window.addEventListener('resize', () => {
      this._vw = window.innerWidth;
      this._vh = window.innerHeight;
    });

    this._v = new THREE.Vector3(); // scratch for projections

    // compass window: ±70° visible, mapped across 480px (edges masked out)
    this._halfWinDeg = 70;
    this._pxPerDeg = 3.35;

    // dirty-check caches so per-frame DOM writes only happen on change
    this._lastHp = -1;
    this._lastLow = null;
    this._lastMeds = -1;
    this._lastAim = null;
    this._lastArrowSig = '';
    this._lastBearing = -1;
    this._lastVin = -1;
    this._lastMhbW = -1;

    this._hurtFlash = 0;
    this._mhbTarget = null;
    this._mhbTimer = 0;
    this._mhbShown = false;

    this._pips = new Map(); // machine -> pip element

    // quest sequencer
    this._killCounts = Object.create(null);
    this._stage = 0;
    this._victoryFired = false;
    this._victoryShown = false;
    this._lastObjTitle = null;

    this._build();
    this._bindEvents();
    this._renderObjective(false);
  }

  /* --------------------------------- DOM ---------------------------------- */

  _build() {
    const root = this.rootEl;

    this._vignette = div('hzc-vignette', root);

    // top-left vitals
    const tl = div('hzc-topleft', root);
    div('hzc-health-label', tl, 'VITALITY');
    this._healthFill = div('hzc-healthfill', div('hzc-healthbar', tl));
    const meds = div('hzc-meds', tl);
    this._medEls = [];
    for (let i = 0; i < 5; i++) this._medEls.push(div('hzc-med', meds));
    div('hzc-med-key', meds, 'F');

    // compass
    const comp = div('hzc-compass', root);
    const win = div('hzc-compass-window', comp);
    const track = div('hzc-compass-track', win);
    this._ticks = [];
    for (let a = 0; a < 360; a += 15) {
      if (a % 45 === 0) continue;
      this._ticks.push({ a, el: div('hzc-tick', track), label: false, vis: null });
    }
    const dirs = [
      [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'],
      [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'],
    ];
    for (const [a, n] of dirs) {
      let cls = 'hzc-cdir';
      if (n.length === 1) cls += ' main';
      if (n === 'N') cls += ' north';
      this._ticks.push({ a, el: div(cls, track, n), label: true, vis: null });
    }
    this._pipLayer = div('hzc-compass-pips', win);
    div('hzc-compass-caret', comp);
    this._bearingEl = div('hzc-bearing', comp, '000');

    // machine health bar
    this._mhbEl = div('hzc-mhb', root);
    this._mhbName = div('hzc-mhb-name', this._mhbEl, 'MACHINE');
    this._mhbFill = div('hzc-mhb-fill', div('hzc-mhb-bar', this._mhbEl));

    // objective card
    this._objEl = div('hzc-objective', root);
    div('hzc-obj-kicker', this._objEl, 'HUNT');
    this._objTitle = div('hzc-obj-title', this._objEl);
    this._objDetail = div('hzc-obj-detail', this._objEl);
    this._objProg = div('hzc-obj-progress', this._objEl);

    // crosshair — every stroke is doubled (dark under, light over) so it
    // stays readable against bright sky and chrome machine plating alike
    const cross = div('hzc-cross', root);
    div('hzc-dot', cross);
    this._ring = div('hzc-ring', cross);
    this._ring.innerHTML =
      '<svg viewBox="0 0 72 72">' +
      '<circle class="track-under" cx="36" cy="36" r="26"/>' +
      '<circle class="track" cx="36" cy="36" r="26"/>' +
      '<circle class="prog-under" cx="36" cy="36" r="26" transform="rotate(-90 36 36)"/>' +
      '<circle class="prog" cx="36" cy="36" r="26" transform="rotate(-90 36 36)"/>' +
      '</svg>';
    this._prog = this._ring.querySelector('.prog');
    this._progUnder = this._ring.querySelector('.prog-under');
    this._ringC = 2 * Math.PI * 26;
    for (const el of [this._prog, this._progUnder]) {
      el.style.strokeDasharray = this._ringC.toFixed(2);
      el.style.strokeDashoffset = this._ringC.toFixed(2);
    }

    // quiver
    const ar = div('hzc-arrows', root);
    this._arrowEls = [];
    for (const d of ARROW_DEFS) {
      const cell = div('hzc-arrow', ar);
      div('k', cell, d.key);
      div('n', cell, d.label);
      this._arrowEls.push({ root: cell, count: div('c', cell, '—') });
    }

    // kill feed + damage numbers
    this._toastsEl = div('hzc-toasts', root);
    const dl = div('hzc-dmglayer', root);
    this._dmgPool = [];
    for (let i = 0; i < 20; i++) {
      this._dmgPool.push({
        el: div('hzc-dmg', dl),
        active: false, age: 0, dur: 1, drift: 0,
        world: new THREE.Vector3(),
      });
    }

    // death screen
    this._deathEl = div('hzc-death', root);
    div('hzc-death-title', this._deathEl, 'YOU DIED');
    div('hzc-death-sub', this._deathEl, 'THE CAMPFIRE REKINDLES YOUR SPARK');

    // victory screen
    this._victoryEl = div('hzc-victory', root);
    div('hzc-victory-kicker', this._victoryEl, 'QUEST COMPLETE');
    div('hzc-victory-title', this._victoryEl, 'VALLEY RECLAIMED');
    div('hzc-victory-line', this._victoryEl);
    div('hzc-victory-sub', this._victoryEl, 'EVERY MACHINE LIES SILENT · THE HUNT IS OVER');

    // pause menu (only HUD child with pointer events)
    this._pauseEl = div('hzc-pause', root);
    const pi = div('hzc-pause-inner', this._pauseEl);
    div('hzc-pause-title', pi, 'PAUSED');
    const btn = document.createElement('button');
    btn.className = 'hzc-btn';
    btn.textContent = 'RESUME THE HUNT';
    btn.addEventListener('click', () => this.setPaused(false));
    pi.appendChild(btn);
    div('hzc-pause-hints', pi,
      'WASD MOVE · SHIFT SPRINT · C CROUCH · SPACE DODGE<br>' +
      'RMB AIM · LMB LOOSE · 1/2/3 ARROWS · Q FOCUS · F MEDICINE');
  }

  /* -------------------------------- events -------------------------------- */

  _bindEvents() {
    const ev = this.ctx.events;

    ev.on('arrow-hit', (e) => this._spawnDamage(e));
    ev.on('machine-damaged', (e) => {
      const m = e?.machine;
      if (!m) return;
      if (m !== this._mhbTarget) {
        this._mhbTarget = m;
        this._mhbName.textContent = String(m.displayName ?? m.kind ?? 'MACHINE').toUpperCase();
        this._lastMhbW = -1;
      }
      this._mhbTimer = 4;
    });
    ev.on('machine-killed', (e) => this._onKill(e));
    ev.on('player-hurt', () => {
      this._hurtFlash = Math.min(1.2, this._hurtFlash + 0.75);
    });
    ev.on('player-died', () => {
      if (this._victoryShown) return; // victory owns the screen — no death card
      this._deathEl.classList.add('show');
    });
    ev.on('player-respawn', () => {
      this._deathEl.classList.remove('show');
      this._hurtFlash = 0;
      this._vignette.style.opacity = '0';
      this._lastVin = 0;
      // Race guard: if victory fired during the respawn window, player.js just
      // reset state to 'playing' underneath the overlay — re-assert victory.
      if (this._victoryShown) {
        this.ctx.state = 'victory';
        this.ctx.input.exitPointerLock();
      }
    });
    ev.on('victory', () => this._showVictory());
    ev.on('game-start', () => this._renderObjective(false));

    this.ctx.input.onDown('Escape', () => {
      if (this.ctx.state === 'playing') this.setPaused(true);
      else if (this.ctx.state === 'paused') this.setPaused(false);
    });
    // Browsers exit pointer lock on Esc without delivering the keydown —
    // treat any lock loss during play as a pause request.
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement == null &&
          this.ctx.state === 'playing' &&
          this.ctx.game?.started &&
          !this.ctx.params.has('shot')) {
        this.setPaused(true);
      }
    });
    // Esc-unpause can't re-acquire pointer lock (no user activation, and
    // browsers enforce a cooldown after Esc). Any click while playing and
    // unlocked counts as the activation we need to restore mouse-look.
    document.addEventListener('mousedown', () => {
      if (this.ctx.state === 'playing' &&
          !this.ctx.input.pointerLocked &&
          !this.ctx.params.has('shot')) {
        this.ctx.input.requestPointerLock();
      }
    });
  }

  /* ------------------------------ pause menu ------------------------------- */

  setPaused(on) {
    const ctx = this.ctx;
    if (on) {
      if (ctx.state !== 'playing') return;
      ctx.state = 'paused';
      this._pauseEl.classList.add('show');
      ctx.input.exitPointerLock();
    } else {
      if (ctx.state !== 'paused') return;
      ctx.state = 'playing';
      this._pauseEl.classList.remove('show');
      if (!ctx.params.has('shot')) ctx.input.requestPointerLock();
    }
  }

  /* --------------------------- quest sequencer ----------------------------- */

  _onKill(e) {
    const m = e?.machine ?? e ?? {};
    const kind = m.kind ?? 'machine';
    this._killCounts[kind] = (this._killCounts[kind] || 0) + 1;

    const name = String(m.displayName ?? kind).toUpperCase();
    this._toast(`<b>${name}</b>&ensp;DESTROYED&ensp;·&ensp;+${XP[kind] ?? 100} XP`);

    if (m === this._mhbTarget) this._mhbTimer = Math.min(this._mhbTimer, 0.9);

    let advanced = false;
    while (this._stage < QUEST.length &&
           (this._killCounts[QUEST[this._stage].kind] || 0) >= QUEST[this._stage].need) {
      this._stage++;
      advanced = true;
    }
    if (advanced && this._stage < QUEST.length) this._toast('<b>OBJECTIVE COMPLETE</b>');
    this._renderObjective(advanced);

    // Killing the Thunderjaw completes the hunt (SPEC) even if earlier quest
    // stages are unfinished; the full chain also lands here on its last kill.
    if (!this._victoryFired && (kind === 'thunderjaw' || this._stage >= QUEST.length)) {
      this._victoryFired = true;
      // let the kill explosion breathe before the fanfare
      setTimeout(() => this.ctx.events.emit('victory'), 1400);
    }
  }

  _renderObjective(bump) {
    let title, detail;
    if (this._stage >= QUEST.length) {
      title = 'VALLEY RECLAIMED';
      detail = 'All machines destroyed';
      this._objProg.textContent = '';
    } else {
      const s = QUEST[this._stage];
      title = s.title;
      detail = s.detail;
      const have = Math.min(this._killCounts[s.kind] || 0, s.need);
      this._objProg.textContent = `${have} / ${s.need} DESTROYED`;
    }
    this._objTitle.textContent = title;
    this._objDetail.textContent = detail;
    if (title !== this._lastObjTitle) {
      this._lastObjTitle = title;
      this.ctx.events.emit('objective-changed', { title, detail });
    }
    if (bump) {
      this._objEl.classList.remove('bump');
      void this._objEl.offsetWidth;
      this._objEl.classList.add('bump');
    }
  }

  _showVictory() {
    this._victoryFired = true;
    this._victoryShown = true;
    this._pauseEl.classList.remove('show');
    this._deathEl.classList.remove('show');
    this._victoryEl.classList.add('show');
    // hide every gameplay HUD layer under the overlay (see hud.css)
    this.rootEl.classList.add('endgame');
    this.ctx.state = 'victory';
    this.ctx.input.exitPointerLock();
  }

  /* ------------------------------ kill feed -------------------------------- */

  _toast(html) {
    const el = document.createElement('div');
    el.className = 'hzc-toast';
    el.innerHTML = html;
    this._toastsEl.appendChild(el);
    while (this._toastsEl.children.length > 4) this._toastsEl.firstChild.remove();
    setTimeout(() => el.remove(), 3250);
  }

  /* ---------------------------- damage numbers ----------------------------- */

  _spawnDamage(e) {
    if (!e || !e.point || !e.machine) return;
    const dmg = Math.round(e.damage ?? 0);
    if (dmg <= 0) return;
    let slot = null, oldest = null;
    for (const c of this._dmgPool) {
      if (!c.active) { slot = c; break; }
      if (!oldest || c.age > oldest.age) oldest = c;
    }
    slot = slot ?? oldest;
    slot.active = true;
    slot.age = 0;
    slot.dur = e.weak ? 1.1 : 0.9;
    slot.world.copy(e.point);
    slot.world.y += 0.15;
    slot.drift = (Math.random() - 0.5) * 40;
    slot.el.textContent = String(dmg);
    slot.el.classList.toggle('weak', !!e.weak);
    slot.el.style.visibility = 'visible';
  }

  _updateDamageNumbers(dt) {
    const cam = this.ctx.camera;
    const v = this._v;
    for (const d of this._dmgPool) {
      if (!d.active) continue;
      d.age += dt;
      if (d.age >= d.dur) {
        d.active = false;
        d.el.style.visibility = 'hidden';
        continue;
      }
      v.copy(d.world).project(cam);
      if (v.z > 1 || v.z < -1) {
        d.el.style.visibility = 'hidden';
        continue;
      }
      d.el.style.visibility = 'visible';
      const k = d.age / d.dur;
      const x = (v.x * 0.5 + 0.5) * this._vw + d.drift * k;
      const y = (-v.y * 0.5 + 0.5) * this._vh - 48 * k;
      d.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%,-100%)`;
      d.el.style.opacity = (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88).toFixed(2);
    }
  }

  /* ------------------------------ frame update ----------------------------- */

  update(dt, t) {
    const p = this.ctx.player;
    if (!p) return;
    this._updateHealth(p);
    this._updateCompass(p);
    this._updateMachineBar(dt);
    this._updateCrosshair(p);
    this._updateArrows();
    this._updateDamageNumbers(dt);
    this._updateVignette(dt, t, p);
  }

  _updateHealth(p) {
    const hp = Math.max(0, Math.min(1, p.health / p.maxHealth));
    const w = Math.round(hp * 200) / 2; // 0.5% granularity
    if (w !== this._lastHp) {
      this._lastHp = w;
      this._healthFill.style.width = w + '%';
      const low = hp < 0.32;
      if (low !== this._lastLow) {
        this._lastLow = low;
        this._healthFill.classList.toggle('low', low);
      }
    }
    const meds = p.medicine | 0;
    if (meds !== this._lastMeds) {
      this._lastMeds = meds;
      for (let i = 0; i < this._medEls.length; i++) {
        this._medEls[i].classList.toggle('full', i < meds);
      }
    }
  }

  _updateCompass(p) {
    // camera forward is (-sin camYaw, -cos camYaw) => bearing = -camYaw
    const camB = norm360(-p.camYaw * RAD2DEG);

    for (const tk of this._ticks) {
      const d = wrap180(tk.a - camB);
      if (Math.abs(d) > this._halfWinDeg) {
        if (tk.vis !== false) { tk.el.style.visibility = 'hidden'; tk.vis = false; }
        continue;
      }
      if (tk.vis !== true) { tk.el.style.visibility = 'visible'; tk.vis = true; }
      const x = (d * this._pxPerDeg).toFixed(1);
      tk.el.style.transform = tk.label
        ? `translateX(calc(${x}px - 50%))`
        : `translateX(${x}px)`;
    }

    const bi = Math.round(camB) % 360;
    if (bi !== this._lastBearing) {
      this._lastBearing = bi;
      this._bearingEl.textContent = String(bi).padStart(3, '0');
    }

    const list = this.ctx.machines?.list;
    if (!Array.isArray(list)) return;
    for (const m of list) {
      let pip = this._pips.get(m);
      if (!pip) {
        pip = div('hzc-pip', this._pipLayer);
        this._pips.set(m, pip);
      }
      const pos = m.position ?? m.root?.position;
      if (!pos || m.alive === false) { pip.style.visibility = 'hidden'; continue; }
      const dx = pos.x - p.position.x;
      const dz = pos.z - p.position.z;
      const dist = Math.hypot(dx, dz);
      const d = wrap180(Math.atan2(dx, -dz) * RAD2DEG - camB);
      if (dist > 320 || dist < 2 || Math.abs(d) > this._halfWinDeg) {
        pip.style.visibility = 'hidden';
        continue;
      }
      pip.style.visibility = 'visible';
      pip.style.transform =
        `translateX(calc(${(d * this._pxPerDeg).toFixed(1)}px - 50%)) rotate(45deg)`;
      pip.style.opacity = Math.max(0.3, Math.min(1, 1.25 - dist / 300)).toFixed(2);
      const s = (m.state === 'alert' || m.state === 'attack') ? 'hostile'
        : (m.state === 'suspicious' || m.state === 'search') ? 'wary' : 'calm';
      if (pip.dataset.s !== s) pip.dataset.s = s;
    }
  }

  _updateMachineBar(dt) {
    const m = this._mhbTarget;
    if (m) {
      const hostile = m.alive !== false && (m.state === 'alert' || m.state === 'attack');
      if (hostile) this._mhbTimer = 4;
      this._mhbTimer -= dt;
    }
    const show = !!m && this._mhbTimer > 0;
    if (show !== this._mhbShown) {
      this._mhbShown = show;
      this._mhbEl.classList.toggle('show', show);
    }
    if (show) {
      const frac = Math.max(0, Math.min(1, (m.health ?? 0) / (m.maxHealth || 1)));
      const w = Math.round(frac * 200) / 2;
      if (w !== this._lastMhbW) {
        this._lastMhbW = w;
        this._mhbFill.style.width = w + '%';
      }
    }
  }

  _updateCrosshair(p) {
    const aiming = !!p.aiming;
    if (aiming !== this._lastAim) {
      this._lastAim = aiming;
      this._ring.classList.toggle('show', aiming);
    }
    if (!aiming) return;
    const dsRaw = this.ctx.combat?.drawStrength;
    const ds = typeof dsRaw === 'number' ? Math.max(0, Math.min(1, dsRaw)) : 0;
    const off = (this._ringC * (1 - ds)).toFixed(1);
    this._prog.style.strokeDashoffset = off;
    this._progUnder.style.strokeDashoffset = off;
    this._prog.classList.toggle('full', ds > 0.985);
  }

  _updateArrows() {
    const c = this.ctx.combat;
    let type = c?.arrowType ?? 'hunter';
    if (typeof type === 'number') type = ARROW_DEFS[type]?.id ?? 'hunter';
    const counts = c?.arrowCounts;
    let sig = String(type);
    for (let i = 0; i < ARROW_DEFS.length; i++) {
      const id = ARROW_DEFS[i].id;
      let n = counts ? counts[id] : (id === 'hunter' ? Infinity : 24);
      if (n == null) n = id === 'hunter' ? Infinity : 0;
      this._arrowEls[i].n = n;
      sig += '|' + n;
    }
    if (sig === this._lastArrowSig) return;
    this._lastArrowSig = sig;
    for (let i = 0; i < ARROW_DEFS.length; i++) {
      const el = this._arrowEls[i];
      const n = el.n;
      el.root.classList.toggle('active', ARROW_DEFS[i].id === type);
      el.count.textContent = n === Infinity ? '∞' : String(n);
      el.root.classList.toggle('empty', n !== Infinity && n <= 0);
    }
  }

  _updateVignette(dt, t, p) {
    this._hurtFlash = Math.max(0, this._hurtFlash - dt * 0.9);
    const hp = p.health / p.maxHealth;
    const low = hp < 0.35 ? (0.35 - hp) / 0.35 : 0;
    const pulse = low > 0 ? low * (0.38 + 0.1 * Math.sin(t * 4.2)) : 0;
    const o = Math.min(0.92, this._hurtFlash * 0.8 + pulse);
    if (Math.abs(o - this._lastVin) > 0.008) {
      this._lastVin = o;
      this._vignette.style.opacity = o.toFixed(3);
    }
  }
}
