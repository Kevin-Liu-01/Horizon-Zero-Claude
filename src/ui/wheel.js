import './wheel.css';
import { AMMO, ammoIconSVG, itemIconSVG, itemName } from '../combat/weapons.js';

/**
 * HZD weapon wheel (spec v2): HOLD Tab -> radial wheel over a blurred scrim,
 * engine.timeScale eased to 0.25 while open, 4 weapon slots showing ammo
 * petals + live counts, mouse direction / 1-4 to highlight, Z/X/scroll to
 * cycle the highlighted weapon's ammo, R to craft a batch in place.
 * Release Tab: equips the highlighted weapon and restores time.
 *
 * Emits 'wheel-open' / 'wheel-close'; equipping goes through
 * combat.setWeapon which emits 'weapon-switch'.
 */

const WHEEL_TS = 0.25;
// slot index 0..3 -> screen direction (up, right, down, left)
const SLOT_POS = ['up', 'right', 'down', 'left'];

function polar(cx, cy, r, deg) {
  const a = (deg - 90) * (Math.PI / 180);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
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
    this._savedYaw = 0;
    this._savedPitch = 0;

    this._build();

    ctx.input.onDown('Tab', () => {
      if (this.open) return;
      if (ctx.state !== 'playing' && !ctx.params.has('shot')) return;
      this._openWheel();
    });
    ctx.input.onUp('Tab', () => {
      if (this.open) this._closeWheel(true);
    });
    ctx.input.onDown('KeyZ', () => { if (this.open) this._cycle(-1); });
    ctx.input.onDown('KeyX', () => { if (this.open) this._cycle(1); });
    ctx.input.onDown('KeyR', () => { if (this.open) this._craft(); });
    ctx.events.on('player-died', () => { if (this.open) this._closeWheel(false); });
  }

  /* --------------------------------- DOM ---------------------------------- */

  _build() {
    const combat = this.ctx.combat;
    const weapons = combat?.weapons ?? [];

    const root = document.createElement('div');
    root.id = 'hzc-wheel';

    // ring chrome + per-slot hover arcs (slot arcs centered on N/E/S/W)
    let arcs = '';
    for (let i = 0; i < 4; i++) {
      const mid = i * 90;
      arcs += `<path class="ww-arc" data-arc="${i}" d="${arcPath(310, 310, 224, mid - 34, mid + 34)}"/>`;
    }
    let html = `
      <div class="ww-scrim"></div>
      <div class="ww-wrap">
        <svg class="ww-rings" viewBox="0 0 620 620" aria-hidden="true">
          <circle cx="310" cy="310" r="224" class="ww-ring"/>
          <circle cx="310" cy="310" r="140" class="ww-ring ww-ring-in"/>
          <circle cx="310" cy="310" r="296" class="ww-ring ww-ring-out"/>
          ${arcs}
        </svg>`;

    for (let i = 0; i < 4; i++) {
      const w = weapons[i];
      const name = w?.name ?? '—';
      const slotN = w?.slot ?? i + 1;
      let ammoHtml = '';
      for (const a of (w?.ammoTypes ?? [])) {
        if (!a) continue;
        ammoHtml += `
          <div class="ww-ammo" data-ammo="${a.id}" style="--ac:${a.color}">
            <div class="ww-ammo-ic">${ammoIconSVG(a.id)}</div>
            <div class="ww-ammo-n">0</div>
          </div>`;
      }
      html += `
        <div class="ww-slot ww-${SLOT_POS[i]}" data-slot="${i}">
          <div class="ww-slot-head"><kbd>${slotN}</kbd><span class="ww-slot-name">${name}</span></div>
          <div class="ww-ammos">${ammoHtml}</div>
        </div>`;
    }

    html += `
        <div class="ww-center">
          <div class="ww-weapon-name"></div>
          <div class="ww-ammo-name"></div>
          <div class="ww-divider"></div>
          <div class="ww-recipe"></div>
          <div class="ww-craft"></div>
          <div class="ww-hint">RELEASE <kbd>TAB</kbd> EQUIP · <kbd>Z</kbd><kbd>X</kbd> AMMO</div>
        </div>
      </div>`;

    root.innerHTML = html;
    document.body.appendChild(root);
    this.root = root;

    this._slots = [...root.querySelectorAll('.ww-slot')];
    this._arcs = [...root.querySelectorAll('.ww-arc')];
    this._wName = root.querySelector('.ww-weapon-name');
    this._aName = root.querySelector('.ww-ammo-name');
    this._recipe = root.querySelector('.ww-recipe');
    this._craftEl = root.querySelector('.ww-craft');
    this._ammoEls = this._slots.map((s) => [...s.querySelectorAll('.ww-ammo')]);
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
    const p = this.ctx.player;
    this._savedYaw = p?.camYaw ?? 0;
    this._savedPitch = p?.camPitch ?? 0;
    this.root.classList.add('open');
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

  hoverSlot(slotN) {
    const idx = (this.ctx.combat?.weapons ?? []).findIndex((w) => w.slot === slotN);
    if (idx >= 0) this.hover = idx;
  }

  _cycle(dir) {
    const w = this.ctx.combat?.weapons?.[this.hover];
    if (w) this.ctx.combat.cycleAmmo(dir, w);
  }

  _craft() {
    const w = this.ctx.combat?.weapons?.[this.hover];
    if (!w) return;
    const ok = this.ctx.combat.craftAmmo(w.activeAmmo);
    const el = this._craftEl;
    el.classList.remove('flash', 'deny');
    void el.offsetWidth; // restart animation
    el.classList.add(ok ? 'flash' : 'deny');
  }

  /* --------------------------------- update ------------------------------- */

  update(dt, t) {
    const realDt = Math.min(0.05, Math.max(0, t - this._lastT));
    this._lastT = t;
    if (!this.open) return;

    const ctx = this.ctx;
    if (ctx.state !== 'playing' && !ctx.params.has('shot')) {
      this._closeWheel(false);
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

    // virtual cursor -> hovered slot
    const mx = ctx.input.mouse.dx, my = ctx.input.mouse.dy;
    if (mx !== 0 || my !== 0) {
      this._cx += mx;
      this._cy += my;
      const len = Math.hypot(this._cx, this._cy);
      if (len > 140) { this._cx *= 140 / len; this._cy *= 140 / len; }
      if (len > 26) {
        const ang = Math.atan2(this._cx, -this._cy); // 0 = up, clockwise
        this.hover = ((Math.round(ang / (Math.PI / 2)) % 4) + 4) % 4;
      }
    }

    // scroll cycles ammo of the hovered weapon
    const wheel = ctx.input.mouse.wheel;
    if (wheel !== 0) this._cycle(wheel > 0 ? 1 : -1);

    this._refresh();
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

    for (let i = 0; i < this._slots.length; i++) {
      const w = weapons[i];
      const el = this._slots[i];
      el.classList.toggle('hover', i === this.hover);
      el.classList.toggle('equipped', !!w && combat.activeWeapon === w);
      this._arcs[i]?.classList.toggle('on', i === this.hover);
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

    // center card: hovered weapon + ammo + recipe + craft prompt
    const def = hoverW ? AMMO[hoverW.activeAmmo] : null;
    this._wName.textContent = hoverW?.name ?? '';
    if (def) {
      const n = combat.ammoCount(def.id);
      this._aName.innerHTML =
        `<i style="color:${def.color}">${ammoIconSVG(def.id)}</i>${def.name} · ${n === Infinity ? '∞' : n}`;
    } else {
      this._aName.textContent = '';
    }

    if (def?.recipe) {
      let rh = '';
      let ok = true;
      for (const [id, need] of def.recipe) {
        const have = inv?.count ? inv.count(id) : Infinity;
        const good = have >= need;
        ok = ok && good;
        rh += `<span class="ww-ing ${good ? 'ok' : 'no'}">
          <i>${itemIconSVG(id)}</i>${need} ${itemName(id)}
          <b>${have === Infinity ? '' : `(${have})`}</b></span>`;
      }
      const capped = (combat.ammoCount(def.id) ?? 0) >= def.cap;
      this._recipe.innerHTML = rh;
      this._craftEl.innerHTML = capped
        ? 'QUIVER FULL'
        : `<kbd>R</kbd> CRAFT +${def.batch}`;
      this._craftEl.classList.toggle('disabled', !ok || capped);
    } else {
      this._recipe.innerHTML = '';
      this._craftEl.innerHTML = '';
      this._craftEl.classList.remove('disabled');
    }
  }
}
