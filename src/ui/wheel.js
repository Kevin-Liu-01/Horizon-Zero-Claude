import './wheel.css';
import { AMMO, ammoIconSVG, itemIconSVG, itemName, weaponIconSVG } from '../combat/weapons.js';

/**
 * HZD WEAPON WHEEL — `combat-wheel-canon-gaps` + `ui-09`.
 *
 * HOLD Tab -> radial wheel over a blurred scrim, `engine.timeScale` eased to
 * 0.25 while open; mouse direction / 1-6 highlights a petal, Z/X/scroll cycles
 * the highlighted weapon's ammo, HOLD R crafts a batch. Release Tab equips.
 *
 * Round 4 rebuilt it for four findings:
 *
 *   SIX PETALS   The roster grew to six (Ropecaster + Tripcaster,
 *                `combat-roster-missing`) and the wheel was hard-wired to four
 *                screen directions — the two new weapons were literally
 *                unreachable from the wheel. Petals are now laid out by ANGLE
 *                off `weapons.length`, so adding a seventh costs nothing.
 *   WEAPON ART   Each petal is a weapon SILHOUETTE (`weaponIconSVG`), not a
 *                text label the player has to read mid-fight.
 *   AMMO ARCS    The hovered weapon's ammo types are drawn as arc segments on
 *                the ring inside its own sector, coloured by ammo and filled
 *                by how full that quiver is — the canon "ammo on the ring".
 *   STAT BARS    Damage / tear / speed / range bars in the centre card, so the
 *                wheel answers "which of these is the hard-hitting one".
 *   HOLD-R CRAFT R is a HOLD with a radial fill, driven by the SAME
 *                `combat.craft` state machine the hip-fire craft uses, so the
 *                fill, the denial reason and the `ammo-crafted` toast are one
 *                implementation instead of two that drift.
 *
 * The wheel is also OFFSET RIGHT (`ui-09`), which is where HZD puts it: the
 * left third of the screen stays clear of the weapon the player is inspecting.
 *
 * Published for combat: `open`, `hover`, `hoverWeapon`, `hoverAmmoId`.
 * Emits 'wheel-open' / 'wheel-close'; equipping goes through
 * `combat.setWeapon`, which emits 'weapon-switch'.
 */

const WHEEL_TS = 0.25;
const R_RING = 246;        // petal ring radius, SVG units
const R_ARC = 292;         // ammo arc radius
const CX = 320, CY = 320;  // SVG centre
const VIEW = 640;

const STAT_ROWS = [
  ['damage', 'DMG'], ['tear', 'TEAR'], ['speed', 'SPD'], ['range', 'RNG'],
];

function polar(cx, cy, r, deg) {
  const a = (deg - 90) * (Math.PI / 180);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

export class WeaponWheel {
  constructor(ctx) {
    this.ctx = ctx;
    this.open = false;
    this.hover = 0;
    this._lastT = 0;
    this._cx = 0;
    this._cy = 0;
    this._sig = '';
    this._craftSig = '';
    this._blocker = null;      // cached craftBlocker() string; see _refreshCraft
    this._savedYaw = 0;
    this._savedPitch = 0;

    this._build();

    const inPlay = () => ctx.state === 'playing' || ctx.params.has('shot');
    ctx.input.onDown('Tab', () => {
      if (this.open) return;
      if (!inPlay()) return;
      this._openWheel();
    });
    // gate the release by state: a Tab let go over the pause/death screen
    // must NOT equip the hovered weapon or play the close whoosh
    ctx.input.onUp('Tab', () => {
      if (!this.open) return;
      if (inPlay()) this._closeWheel(true);
      else this._forceClose();
    });
    ctx.input.onDown('KeyZ', () => { if (this.open) this._cycle(-1); });
    ctx.input.onDown('KeyX', () => { if (this.open) this._cycle(1); });
    // R is a HOLD now (combat._updateCraft owns the timer); no keydown craft.

    // force-close (silent) whenever the game leaves 'playing' while the
    // wheel is up: death, victory, pause. Pause never reaches update()
    // (main.js halts system updates), so hook the transitions directly.
    ctx.events.on('player-died', () => this._forceClose());
    ctx.events.on('victory', () => this._forceClose());
    ctx.input.onDown('Escape', () => this._forceClose());
    ctx.events.on('ammo-crafted', () => this._flashCraft(true));
    document.addEventListener('pointerlockchange', () => {
      // Esc in the browser can eat the keydown and just drop pointer lock —
      // the HUD pauses on that signal, so the wheel must fold with it
      if (document.pointerLockElement == null && !ctx.params.has('shot')) {
        this._forceClose();
      }
    });
  }

  /* ------------------------------- published ------------------------------ */

  /** The weapon under the cursor (what Tab-release would equip). */
  get hoverWeapon() { return this.ctx.combat?.weapons?.[this.hover] ?? null; }

  /**
   * The ammo the craft hold should target while the wheel is open. `combat`
   * reads this so hold-R crafts what the player is LOOKING at, not what is
   * equipped — one craft state machine, two places it can be driven from.
   */
  get hoverAmmoId() { return this.hoverWeapon?.activeAmmo ?? null; }

  /* --------------------------------- DOM ---------------------------------- */

  _build() {
    const weapons = this.ctx.combat?.weapons ?? [];
    const n = Math.max(1, weapons.length);
    this._n = n;
    this._step = 360 / n;

    const root = document.createElement('div');
    root.id = 'hzc-wheel';

    // ---- ring chrome: one hover arc + one ammo-arc group per sector
    const pad = 4;                       // degrees of gap between sectors
    let arcs = '';
    let ammoArcs = '';
    for (let i = 0; i < n; i++) {
      const mid = i * this._step;
      const a0 = mid - this._step / 2 + pad, a1 = mid + this._step / 2 - pad;
      arcs += `<path class="ww-arc" data-arc="${i}" d="${arcPath(CX, CY, R_RING, a0, a1)}"/>`;
      /**
       * AMMO ARCS. Each ammo type of this weapon gets a slice of the sector at
       * `R_ARC`: a dim track plus a bright fill whose length is that quiver's
       * fullness. On hover the whole group lights; the SELECTED ammo's arc is
       * thicker. That is the canon read — how much of what, at a glance.
       */
      const types = weapons[i]?.ammoTypes ?? [];
      let g = '';
      const span = (a1 - a0) / Math.max(1, types.length);
      for (let k = 0; k < types.length; k++) {
        const t = types[k];
        if (!t) continue;
        const b0 = a0 + span * k + 1.2, b1 = a0 + span * (k + 1) - 1.2;
        g += `<path class="ww-aarc-bg" d="${arcPath(CX, CY, R_ARC, b0, b1)}"/>`
          + `<path class="ww-aarc" data-w="${i}" data-a="${t.id}" data-a0="${b0}" data-a1="${b1}"`
          + ` style="--ac:${t.color}" d="${arcPath(CX, CY, R_ARC, b0, b1)}"/>`;
      }
      ammoArcs += `<g class="ww-aarcs" data-g="${i}">${g}</g>`;
    }

    let html = `
      <div class="ww-scrim"></div>
      <div class="ww-wrap">
        <svg class="ww-rings" viewBox="0 0 ${VIEW} ${VIEW}" aria-hidden="true">
          <circle cx="${CX}" cy="${CY}" r="${R_RING}" class="ww-ring"/>
          <circle cx="${CX}" cy="${CY}" r="132" class="ww-ring ww-ring-in"/>
          <circle cx="${CX}" cy="${CY}" r="${R_ARC + 14}" class="ww-ring ww-ring-out"/>
          ${ammoArcs}
          ${arcs}
        </svg>`;

    // ---- petals, positioned by angle (CSS % of the wrap box)
    for (let i = 0; i < n; i++) {
      const w = weapons[i];
      const [x, y] = polar(CX, CY, R_RING, i * this._step);
      const left = (x / VIEW) * 100, top = (y / VIEW) * 100;
      html += `
        <div class="ww-slot" data-slot="${i}" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%">
          <div class="ww-art">${weaponIconSVG(w?.id ?? '')}</div>
          <div class="ww-slot-head"><kbd>${w?.slot ?? i + 1}</kbd><span class="ww-slot-name">${w?.name ?? '—'}</span></div>
          <div class="ww-ammos"></div>
        </div>`;
    }

    // ---- centre card
    let statHtml = '';
    for (const [k, label] of STAT_ROWS) {
      statHtml += `<div class="ww-stat" data-stat="${k}">
        <span class="ww-stat-k">${label}</span>
        <span class="ww-stat-bar"><i></i></span></div>`;
    }
    html += `
        <div class="ww-center">
          <div class="ww-weapon-name"></div>
          <div class="ww-ammo-name"></div>
          <div class="ww-stats">${statHtml}</div>
          <div class="ww-divider"></div>
          <div class="ww-recipe"></div>
          <div class="ww-craft">
            <svg class="ww-craft-ring" viewBox="0 0 40 40" aria-hidden="true">
              <circle class="bg" cx="20" cy="20" r="16"/>
              <circle class="fg" cx="20" cy="20" r="16"
                stroke-dasharray="100.53" stroke-dashoffset="100.53"/>
            </svg>
            <span class="ww-craft-txt"></span>
          </div>
        </div>
        <div class="ww-hint">RELEASE <kbd>TAB</kbd> EQUIP · <kbd>Z</kbd><kbd>X</kbd> AMMO · HOLD <kbd>R</kbd> CRAFT</div>
      </div>`;

    root.innerHTML = html;
    document.body.appendChild(root);
    this.root = root;

    this._slots = [...root.querySelectorAll('.ww-slot')];
    this._arcs = [...root.querySelectorAll('.ww-arc')];
    this._aGroups = [...root.querySelectorAll('.ww-aarcs')];
    this._aArcs = [...root.querySelectorAll('.ww-aarc')];
    this._wName = root.querySelector('.ww-weapon-name');
    this._aName = root.querySelector('.ww-ammo-name');
    this._recipe = root.querySelector('.ww-recipe');
    this._craftEl = root.querySelector('.ww-craft');
    this._craftTxt = root.querySelector('.ww-craft-txt');
    this._craftRing = root.querySelector('.ww-craft-ring .fg');
    this._statBars = {};
    for (const [k] of STAT_ROWS) {
      this._statBars[k] = root.querySelector(`.ww-stat[data-stat="${k}"] i`);
    }

    // per-petal ammo chips (counts under the art)
    this._ammoEls = [];
    for (let i = 0; i < n; i++) {
      const host = this._slots[i].querySelector('.ww-ammos');
      const els = [];
      for (const a of (weapons[i]?.ammoTypes ?? [])) {
        if (!a) continue;
        const el = document.createElement('div');
        el.className = 'ww-ammo';
        el.dataset.ammo = a.id;
        el.style.setProperty('--ac', a.color);
        el.innerHTML = `<div class="ww-ammo-ic">${ammoIconSVG(a.id)}</div><div class="ww-ammo-n">0</div>`;
        host.appendChild(el);
        els.push(el);
      }
      this._ammoEls.push(els);
    }

    // arc geometry cache: length per arc, so the fill is one attribute write
    this._arcLen = this._aArcs.map((p) => {
      try { return p.getTotalLength() || 1; } catch { return 1; }
    });
  }

  /* ------------------------------ open / close ---------------------------- */

  _openWheel() {
    const combat = this.ctx.combat;
    this.open = true;
    // highlight the equipped weapon (fall back to slot 1 while disc is held)
    const idx = combat?.weapons?.indexOf?.(combat.activeWeapon) ?? 0;
    this.hover = idx >= 0 ? idx : 0;
    this._cx = 0;
    this._cy = 0;
    this._sig = '';
    this._craftSig = '';
    const p = this.ctx.player;
    this._savedYaw = p?.camYaw ?? 0;
    this._savedPitch = p?.camPitch ?? 0;
    this.root.classList.add('open');
    this._refresh();
    this.ctx.events.emit('wheel-open');
  }

  _closeWheel(equip) {
    this.open = false;
    this.root.classList.remove('open');
    if (equip) {
      const w = this.ctx.combat?.weapons?.[this.hover];
      if (w) this.ctx.combat.setWeapon(w.slot);
    }
    // time restore is combat's job (it owns concentration/hitstop targets)
    this.ctx.events.emit('wheel-close');
  }

  /**
   * Silent close for state transitions (pause/death/victory): no equip, no
   * 'wheel-close' whoosh, and time is restored HERE because combat.update
   * may be frozen (main.js stops system updates while paused).
   */
  _forceClose() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('open');
    this.ctx.engine.timeScale = 1;
  }

  hoverSlot(slotN) {
    const idx = (this.ctx.combat?.weapons ?? []).findIndex((w) => w.slot === slotN);
    if (idx >= 0) this.hover = idx;
  }

  _cycle(dir) {
    const w = this.ctx.combat?.weapons?.[this.hover];
    if (w) this.ctx.combat.cycleAmmo(dir, w);
  }

  _flashCraft(ok) {
    const el = this._craftEl;
    if (!el) return;
    el.classList.remove('flash', 'deny');
    void el.offsetWidth; // restart animation
    el.classList.add(ok ? 'flash' : 'deny');
  }

  /* --------------------------------- update ------------------------------- */

  update(dt, t) {
    /* Monotonic real dt for the same reason combat.update takes one: the `t`
     * main.js passes alternates between the frame's start and its end while
     * time is slowed, and the wheel slows time to 0.25x by definition. */
    const now = performance.now() / 1000;
    const realDt = this._lastT ? Math.min(0.05, Math.max(0, now - this._lastT)) : 0;
    this._lastT = now;
    if (!this.open) return;

    const ctx = this.ctx;
    if (ctx.state !== 'playing' && !ctx.params.has('shot')) {
      this._forceClose();
      return;
    }
    // safety: blur can eat the keyup
    if (!ctx.input.isDown('Tab')) {
      this._closeWheel(true);
      return;
    }

    // the wheel owns time while open
    ctx.engine.timeScale = Math.abs(ctx.engine.timeScale - WHEEL_TS) < 0.002
      ? WHEEL_TS
      : ctx.engine.timeScale + (WHEEL_TS - ctx.engine.timeScale) * Math.min(1, realDt * 14);

    // freeze the orbit camera: player has already consumed mouse dx this
    // frame, so restore the saved orbit and recompute the camera in place
    const p = ctx.player;
    if (p) {
      if (p.camYaw !== this._savedYaw || p.camPitch !== this._savedPitch) {
        p.camYaw = this._savedYaw;
        p.camPitch = this._savedPitch;
        try { p._updateCamera?.(0); } catch { /* ignore */ }
      }
    }

    /**
     * Virtual cursor -> hovered petal. `Math.round(ang / step)` is what makes
     * this generic over N: with six petals the sector is 60 deg, not the 90
     * the four-slot version hard-coded (and which silently mapped two of the
     * six weapons onto the same quadrant).
     */
    const mx = ctx.input.mouse.dx, my = ctx.input.mouse.dy;
    if (mx !== 0 || my !== 0) {
      this._cx += mx;
      this._cy += my;
      const len = Math.hypot(this._cx, this._cy);
      if (len > 140) { this._cx *= 140 / len; this._cy *= 140 / len; }
      if (len > 26) {
        const ang = Math.atan2(this._cx, -this._cy); // 0 = up, clockwise
        const sector = (Math.PI * 2) / this._n;
        this.hover = ((Math.round(ang / sector) % this._n) + this._n) % this._n;
      }
    }

    // scroll cycles ammo of the hovered weapon
    const wheel = ctx.input.mouse.wheel;
    if (wheel !== 0) this._cycle(wheel > 0 ? 1 : -1);

    this._refresh();
    this._refreshCraft();
  }

  /**
   * The craft radial is a per-frame read of `combat.craft` — two attribute
   * writes and a class toggle, nothing more.
   *
   * `craftBlocker()` is deliberately NOT called here: it walks the recipe and
   * builds a string ("NEED 1 BLASTPASTE"), so calling it every frame would
   * allocate twice a frame for a label that only changes when the hovered ammo
   * or the inventory does. `_refresh()` already gates on exactly that, so it
   * caches the blocker in `_blocker` and this reads the cache.
   */
  _refreshCraft() {
    const c = this.ctx.combat?.craft;
    if (!c) return;
    const el = this._craftEl;
    const def = AMMO[this.hoverAmmoId];
    const on = c.progress > 0.001;
    el.classList.toggle('holding', on);
    el.classList.toggle('disabled', on ? !c.ok : !!this._blocker);
    const C = 100.53;
    this._craftRing.setAttribute('stroke-dashoffset', String(C * (1 - Math.min(1, c.progress))));
    const txt = on
      ? (c.ok ? 'CRAFTING…' : (c.blocker || 'CANNOT CRAFT'))
      : (def ? (this._blocker || `HOLD R · CRAFT +${def.batch}`) : '');
    if (this._craftSig !== txt) { this._craftSig = txt; this._craftTxt.textContent = txt; }
  }

  _refresh() {
    const combat = this.ctx.combat;
    const weapons = combat?.weapons ?? [];
    const hoverW = weapons[this.hover];
    const inv = this.ctx.inventory;

    // cheap change signature
    let sig = `${this.hover}|${combat?.activeWeapon?.id}`;
    for (const w of weapons) {
      sig += `|${w.activeAmmo}`;
      for (const a of w.ammoTypes) sig += `,${combat.ammoCount(a?.id)}`;
    }
    if (hoverW && AMMO[hoverW.activeAmmo]?.recipe) {
      for (const [id] of AMMO[hoverW.activeAmmo].recipe) {
        sig += `;${inv?.count ? inv.count(id) : -1}`;
      }
    }
    if (sig === this._sig) return;
    this._sig = sig;
    // recompute the (string-building) craft blocker exactly when it can change
    this._blocker = hoverW ? combat.craftBlocker(hoverW.activeAmmo) : null;

    for (let i = 0; i < this._slots.length; i++) {
      const w = weapons[i];
      const el = this._slots[i];
      const isHover = i === this.hover;
      el.classList.toggle('hover', isHover);
      el.classList.toggle('equipped', !!w && combat.activeWeapon === w);
      this._arcs[i]?.classList.toggle('on', isHover);
      this._aGroups[i]?.classList.toggle('on', isHover);
      const ammoEls = this._ammoEls[i];
      for (const ae of ammoEls) {
        const id = ae.dataset.ammo;
        const n = combat.ammoCount(id);
        const nEl = ae.querySelector('.ww-ammo-n');
        const txt = n === Infinity ? '∞' : String(n);
        if (nEl.textContent !== txt) nEl.textContent = txt;
        ae.classList.toggle('sel', w?.activeAmmo === id);
        ae.classList.toggle('empty', n !== Infinity && n <= 0);
      }
    }

    // ---- ammo arcs: fill = how full that quiver is
    for (let k = 0; k < this._aArcs.length; k++) {
      const path = this._aArcs[k];
      const id = path.dataset.a;
      const def = AMMO[id];
      const n = combat.ammoCount(id);
      const full = def && def.cap ? Math.min(1, n / def.cap) : (n > 0 ? 1 : 0);
      const L = this._arcLen[k];
      path.setAttribute('stroke-dasharray', String(L));
      path.setAttribute('stroke-dashoffset', String((L * (1 - full)).toFixed(2)));
      const wi = +path.dataset.w;
      path.classList.toggle('sel', weapons[wi]?.activeAmmo === id);
    }

    // ---- centre card: hovered weapon + ammo + stats + recipe
    const def = hoverW ? AMMO[hoverW.activeAmmo] : null;
    this._wName.textContent = hoverW?.name ?? '';
    if (def) {
      const n = combat.ammoCount(def.id);
      this._aName.innerHTML =
        `<i style="color:${def.color}">${ammoIconSVG(def.id)}</i>${def.name} · ${n === Infinity ? '∞' : n}`;
    } else {
      this._aName.textContent = '';
    }

    // stat bars (`ui-09`): 0..1 authored in weapons.js, purely presentational
    const stats = hoverW?.stats;
    for (const [k] of STAT_ROWS) {
      const bar = this._statBars[k];
      if (!bar) continue;
      const v = Math.max(0, Math.min(1, stats?.[k] ?? 0));
      bar.style.width = `${(v * 100).toFixed(0)}%`;
      bar.classList.toggle('none', v <= 0.001);
    }

    if (def?.recipe) {
      let rh = '';
      for (const [id, need] of def.recipe) {
        const have = inv?.count ? inv.count(id) : Infinity;
        const good = have >= need;
        rh += `<span class="ww-ing ${good ? 'ok' : 'no'}">
          <i>${itemIconSVG(id)}</i>${need} ${itemName(id)}
          <b>${have === Infinity ? '' : `(${have})`}</b></span>`;
      }
      this._recipe.innerHTML = rh;
    } else {
      this._recipe.innerHTML = '';
    }
    this._craftSig = '';   // force the craft label to re-render
  }
}
