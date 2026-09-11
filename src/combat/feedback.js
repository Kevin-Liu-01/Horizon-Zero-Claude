import './feedback.css';
import { AMMO, ammoIconSVG } from './weapons.js';

/**
 * COMBAT FEEDBACK LAYER — `combat-hit-feedback-faint`,
 * `onboarding-loop-crafting-feedback`.
 *
 * Two things the audit says are missing and that belong to the weapon, not to
 * the HUD chrome:
 *
 *   RETICLE TICK  Every landed hit snaps four chevrons out of the crosshair,
 *                 sized by the fraction of the target's health that hit took
 *                 and coloured by what it was (body / weak / tear / crit /
 *                 kill). Before this, a hit and a miss looked identical.
 *   CRAFT RADIAL  R is now a HOLD (`combat-wheel-canon-gaps`) with a filling
 *                 ring, a denial state when the recipe is short, and an
 *                 `ammo-crafted` toast on completion.
 *
 * This is a combat-owned overlay (`#hzc-cfx`, z-index 46, pointer-events
 * none) so `shell-hud` never has to be edited for combat to confirm a hit.
 * It renders nothing the HUD already renders — damage NUMBERS stay in
 * `src/ui/hud.js`, which is shell-hud's file.
 *
 * All DOM is built once; per-frame work is a handful of style writes on at
 * most three live elements.
 */

/**
 * How long a landed hit marks the crosshair.
 *
 * 260 ms was too short to be the confirmation `combat-hit-feedback-faint`
 * asked for: with `opacity = 1 - k^2` the chevrons are already at 20 % after
 * 230 ms, so any frame grabbed a quarter of a second after the hit shows a
 * bare reticle — V28's first cut filmed exactly that. It now holds at FULL
 * opacity for the snap-out, then fades, so the tick is unmistakable for the
 * moment the player is actually looking at it.
 */
const TICK_MS = 380;
const TICK_HOLD = 0.28;             // fraction of TICK_MS spent at full opacity

export class CombatFeedback {
  constructor(ctx) {
    this.ctx = ctx;
    const root = document.createElement('div');
    root.id = 'hzc-cfx';
    root.innerHTML = `
      <div class="cfx-tick">
        <svg viewBox="0 0 74 74" aria-hidden="true">
          <path d="M25 25 L15 15 M49 25 L59 15 M25 49 L15 59 M49 49 L59 59"/>
        </svg>
      </div>
      <div class="cfx-trap"></div>
      <div class="cfx-craft">
        <svg class="cfx-ring" viewBox="0 0 40 40" aria-hidden="true">
          <circle class="bg" cx="20" cy="20" r="16"/>
          <circle class="fg" cx="20" cy="20" r="16"
            stroke-dasharray="100.53" stroke-dashoffset="100.53"/>
        </svg>
        <div class="cfx-ring-ic"></div>
        <div class="cfx-craft-label"></div>
      </div>
      <div class="cfx-toast"></div>`;
    document.body.appendChild(root);
    this.root = root;

    this._tick = root.querySelector('.cfx-tick');
    this._ring = root.querySelector('.cfx-ring .fg');
    this._ringIc = root.querySelector('.cfx-ring-ic');
    this._craft = root.querySelector('.cfx-craft');
    this._craftLabel = root.querySelector('.cfx-craft-label');
    this._toast = root.querySelector('.cfx-toast');
    this._trap = root.querySelector('.cfx-trap');

    this._tickT = 1e9;
    this._tickScale = 1;
    this._toastT = 1e9;
    this._craftIcon = null;
    this._trapText = '';
  }

  /* -------------------------------- ticks --------------------------------- */

  /**
   * `k` 0..1 is how much of the target this hit removed — the tick is a
   * READOUT, not a constant. A 6-damage plink on a Thunderjaw and a 400-point
   * Critical Hit must not look the same.
   */
  hit(kind = 'body', k = 0.2) {
    const el = this._tick;
    el.className = 'cfx-tick' + (kind && kind !== 'body' ? ' ' + kind : '');
    this._tickT = 0;
    this._tickScale = 0.72 + Math.min(1, Math.max(0, k)) * 0.85
      + (kind === 'crit' || kind === 'kill' ? 0.35 : 0);
  }

  /* ------------------------------ craft radial ---------------------------- */

  /** `p` 0..1 hold progress; `ok=false` renders the denial state. */
  craft(p, ammoId, ok, reason) {
    const el = this._craft;
    if (p <= 0) {
      if (el.classList.contains('on')) el.classList.remove('on');
      return;
    }
    if (!el.classList.contains('on')) el.classList.add('on');
    el.classList.toggle('deny', !ok);
    const C = 100.53;
    this._ring.setAttribute('stroke-dashoffset', String(C * (1 - Math.min(1, p))));
    if (this._craftIcon !== ammoId) {
      this._craftIcon = ammoId;
      this._ringIc.innerHTML = ammoId ? ammoIconSVG(ammoId) : '';
      const def = AMMO[ammoId];
      if (def) this._ringIc.style.color = def.color;
    }
    const label = ok
      ? `CRAFT ${(AMMO[ammoId]?.name ?? '').toUpperCase()}`
      : (reason || 'MISSING RESOURCES');
    if (this._craftLabel.textContent !== label) this._craftLabel.textContent = label;
  }

  /* -------------------------------- toasts -------------------------------- */

  toast(text, ammoId = null, deny = false) {
    const el = this._toast;
    el.className = 'cfx-toast' + (deny ? ' deny' : '');
    el.innerHTML = (ammoId
      ? `<i style="color:${AMMO[ammoId]?.color ?? '#efe6d5'}">${ammoIconSVG(ammoId)}</i>`
      : '') + `<b>${text}</b>`;
    this._toastT = 0;
  }

  /* ------------------------------ trap prompt ----------------------------- */

  trapPrompt(text) {
    if (text === this._trapText) return;
    this._trapText = text;
    this._trap.textContent = text || '';
    this._trap.classList.toggle('on', !!text);
  }

  /* -------------------------------- update -------------------------------- */

  update(realDt) {
    /**
     * A FROZEN WORLD FREEZES THE CONFIRMATION TOO.
     *
     * These animate on real time so hitstop and Concentration cannot smear
     * them — but "real time" and "photo mode" are different questions. When
     * `engine.timeScale` is 0 (studio, or a gate pinning a frame) the world is
     * being LOOKED at, and a hit marker that keeps expiring underneath it
     * means the impact is gone from every photograph of the impact: V28
     * captured 900 ms after the hit and the 260 ms tick had already finished.
     * Hold the whole layer instead.
     */
    if ((this.ctx.engine?.timeScale ?? 1) <= 0.001) return;

    // hit marker: snap out, fade
    if (this._tickT < 1e8) {
      this._tickT += realDt * 1000;
      const k = this._tickT / TICK_MS;
      if (k >= 1) {
        this._tickT = 1e9;
        this._tick.style.opacity = '0';
      } else {
        const e = 1 - Math.pow(1 - k, 3);
        const s = this._tickScale * (0.55 + 0.45 * e);
        this._tick.style.transform = `scale(${s.toFixed(3)})`;
        const f = k <= TICK_HOLD ? 0 : (k - TICK_HOLD) / (1 - TICK_HOLD);
        this._tick.style.opacity = String((1 - f * f).toFixed(3));
      }
    }
    // toast: hold 0.9 s then fade over 0.5 s
    if (this._toastT < 1e8) {
      this._toastT += realDt;
      const t = this._toastT;
      const o = t < 0.08 ? t / 0.08 : (t < 0.95 ? 1 : Math.max(0, 1 - (t - 0.95) / 0.5));
      this._toast.style.opacity = o.toFixed(3);
      const lift = Math.min(1, t / 1.45) * 10;
      this._toast.style.transform = `translate(-50%, ${-lift.toFixed(1)}px)`;
      if (t > 1.45) this._toastT = 1e9;
    }
  }

  dispose() { this.root.remove(); }
}
