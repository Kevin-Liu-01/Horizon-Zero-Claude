/**
 * QUEST / XP / DIALOGUE / TRADE UI  —  lane `progression`
 * ===========================================================================
 * Everything `progression` needs on screen that `shell-hud` and `shell-menus`
 * (Wave 3) have not built yet, kept deliberately in its own DOM island:
 *
 *   #hzc-prog  ─ never a child of #hud, never styled from style.css or
 *                hud.css, and it injects its own <style> once. No other lane's
 *                file is touched, and when shell-hud ships the real XP bar and
 *                banner queue this whole layer can be retired by deleting one
 *                `mount()` call.
 *
 * Layers, all driven from `ctx.progression`:
 *   · bottom-left  XP strip: level pip, XP bar, tracked-quest objective line
 *   · centre       banner queue (level-up, quest, objective, save, death)
 *   · overlay      quest log (J), dialogue panel, trade panel, campfire menu
 *
 * `ui-05` (banners + quest log), `ui-17` (contextual cards), `progression-001`
 * (level pip + XP bar), `progression-004` (TRADE panel),
 * `missing-systems-npc-dialogue-quests-merchants` (dialogue).
 *
 * Every panel parks `ctx.state` on its own value, exactly the way
 * `src/ui/inventory.js` parks `'inventory'`: `main.js` only simulates
 * `playing | title | dead | victory | studio`, so an open panel freezes the
 * world without this lane owning the pause code.
 */

import { itemDef } from '../items/items.js';

const STYLE_ID = 'hzc-prog-style';

const CSS = `
#hzc-prog {
  position: fixed; inset: 0; pointer-events: none; z-index: 60;
  font-family: var(--font, 'Rajdhani', system-ui, sans-serif);
  color: var(--hzc-text, #efe6d5);
  --pg-gold: #c8a24b;
  --pg-teal: var(--hzc-accent, #59c1c6);
  --pg-panel: linear-gradient(168deg, rgba(13,18,22,0.94), rgba(8,11,14,0.97));
}
#hzc-prog .pg-hidden { display: none !important; }

/* ------------------------------ bottom-left strip ------------------------- */
#hzc-prog .pg-strip {
  position: absolute; left: 30px; bottom: 26px; width: 288px;
  pointer-events: none;
}
#hzc-prog .pg-xprow { display: flex; align-items: center; gap: 9px; }
#hzc-prog .pg-pip {
  width: 30px; height: 30px; flex: 0 0 30px;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-display, 'Michroma', sans-serif);
  font-size: 12px; color: #0b0e11; background: var(--pg-gold);
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  text-shadow: none;
}
#hzc-prog .pg-xpwrap { flex: 1 1 auto; }
#hzc-prog .pg-xplabel {
  font-size: 9.5px; letter-spacing: 0.26em; text-transform: uppercase;
  color: rgba(239,230,213,0.62); margin-bottom: 3px;
  display: flex; justify-content: space-between;
}
#hzc-prog .pg-xpbar {
  position: relative; height: 5px;
  background: rgba(239,230,213,0.13);
  border: 1px solid rgba(239,230,213,0.22);
}
#hzc-prog .pg-xpfill {
  position: absolute; left: 0; top: 0; bottom: 0; width: 0%;
  background: linear-gradient(90deg, var(--pg-gold), #f0d590);
  transition: width 0.35s cubic-bezier(0.2,0.7,0.3,1);
}
#hzc-prog .pg-points {
  margin-top: 5px; font-size: 10px; letter-spacing: 0.2em;
  color: var(--pg-teal); text-transform: uppercase;
}
#hzc-prog .pg-track {
  margin-top: 9px; padding-left: 10px;
  border-left: 2px solid var(--pg-gold);
}
#hzc-prog .pg-track-title {
  font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase;
  color: var(--pg-gold);
}
#hzc-prog .pg-track-obj {
  font-size: 12.5px; letter-spacing: 0.05em; color: rgba(239,230,213,0.9);
  margin-top: 2px;
}
#hzc-prog .pg-track-count { color: var(--pg-teal); }

/* -------------------------------- banners --------------------------------- */
#hzc-prog .pg-banners {
  position: absolute; left: 50%; top: 21%; transform: translateX(-50%);
  width: min(640px, 74vw); text-align: center;
}
#hzc-prog .pg-banner {
  margin-bottom: 12px; opacity: 0;
  animation: pgBanner 3.4s cubic-bezier(0.2,0.8,0.3,1) forwards;
}
#hzc-prog .pg-banner .b-title {
  font-family: var(--font-display, 'Michroma', sans-serif);
  font-size: 21px; letter-spacing: 0.34em; text-indent: 0.34em;
  color: #FAF9F5; text-shadow: 0 2px 22px rgba(0,0,0,0.8);
}
#hzc-prog .pg-banner .b-detail {
  margin-top: 6px; font-size: 12px; letter-spacing: 0.28em; text-indent: 0.28em;
  text-transform: uppercase; color: rgba(239,230,213,0.72);
}
#hzc-prog .pg-banner .b-rule {
  width: 190px; height: 1px; margin: 10px auto 0;
  background: linear-gradient(90deg, transparent, var(--pg-gold), transparent);
}
#hzc-prog .pg-banner.k-level .b-title { color: var(--pg-gold); }
#hzc-prog .pg-banner.k-quest-done .b-title, #hzc-prog .pg-banner.k-victory .b-title { color: var(--pg-teal); }
#hzc-prog .pg-banner.k-discovery .b-title { color: var(--pg-teal); }
#hzc-prog .pg-banner.k-death .b-title { color: #d9543f; }
@keyframes pgBanner {
  0% { opacity: 0; transform: translateY(12px) scale(0.985); }
  9% { opacity: 1; transform: translateY(0) scale(1); }
  78% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-8px); }
}

/* --------------------------------- toasts --------------------------------- */
#hzc-prog .pg-toasts {
  position: absolute; left: 50%; top: 34%; transform: translateX(-50%);
  text-align: center;
}
#hzc-prog .pg-toast {
  font-family: var(--font-display, 'Michroma', sans-serif);
  font-size: 15px; letter-spacing: 0.16em; color: var(--pg-gold);
  text-shadow: 0 2px 14px rgba(0,0,0,0.8);
  animation: pgToast 1.5s ease-out forwards;
}
@keyframes pgToast {
  0% { opacity: 0; transform: translateY(10px); }
  16% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-26px); }
}

/* -------------------------------- overlays -------------------------------- */
#hzc-prog .pg-overlay {
  position: absolute; inset: 0; pointer-events: auto;
  background: radial-gradient(ellipse at 50% 45%, rgba(6,9,12,0.62), rgba(6,9,12,0.9));
  display: flex; align-items: center; justify-content: center;
  opacity: 0; visibility: hidden; transition: opacity 0.16s ease;
}
#hzc-prog .pg-overlay.show { opacity: 1; visibility: visible; }
#hzc-prog .pg-panel {
  position: relative;
  background: var(--pg-panel);
  border: 1px solid rgba(239,230,213,0.18);
  padding: 26px 30px 22px;
  width: min(920px, 88vw); max-height: 82vh; overflow: hidden;
  display: flex; flex-direction: column;
  clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px);
}
#hzc-prog .pg-panel.narrow { width: min(560px, 88vw); }
#hzc-prog .pg-head {
  font-family: var(--font-display, 'Michroma', sans-serif);
  font-size: 13px; letter-spacing: 0.5em; text-indent: 0.5em;
  color: var(--pg-gold); padding-bottom: 12px;
  border-bottom: 1px solid rgba(239,230,213,0.16);
}
#hzc-prog .pg-sub {
  font-size: 11px; letter-spacing: 0.2em; color: rgba(239,230,213,0.55);
  text-transform: uppercase; margin-top: 6px;
}
#hzc-prog .pg-body { overflow-y: auto; padding: 14px 4px 4px; flex: 1 1 auto; }
#hzc-prog .pg-body::-webkit-scrollbar { width: 6px; }
#hzc-prog .pg-body::-webkit-scrollbar-thumb { background: rgba(239,230,213,0.22); }
#hzc-prog .pg-foot {
  padding-top: 12px; margin-top: 8px;
  border-top: 1px solid rgba(239,230,213,0.14);
  font-size: 10.5px; letter-spacing: 0.2em; text-transform: uppercase;
  color: rgba(239,230,213,0.5); display: flex; gap: 18px; flex-wrap: wrap;
}
#hzc-prog kbd {
  font-family: var(--font, sans-serif); font-weight: 700; font-size: 10px;
  border: 1px solid rgba(239,230,213,0.4); border-bottom-width: 2px;
  padding: 1px 6px 0; margin-right: 5px; color: #efe6d5;
  background: rgba(239,230,213,0.08);
}

/* quest rows */
#hzc-prog .pg-quest {
  border-left: 2px solid rgba(239,230,213,0.2);
  padding: 10px 0 12px 14px; margin-bottom: 12px; cursor: pointer;
}
#hzc-prog .pg-quest:hover { background: rgba(239,230,213,0.04); }
#hzc-prog .pg-quest.tracked { border-left-color: var(--pg-gold); }
#hzc-prog .pg-quest.done { opacity: 0.5; border-left-color: var(--pg-teal); }
#hzc-prog .pg-q-title {
  font-size: 15px; letter-spacing: 0.1em; text-transform: uppercase; color: #FAF9F5;
  display: flex; align-items: baseline; gap: 10px;
}
#hzc-prog .pg-q-tag {
  font-size: 9px; letter-spacing: 0.2em; padding: 1px 6px;
  border: 1px solid currentColor; color: var(--pg-teal);
}
#hzc-prog .pg-q-tag.main { color: var(--pg-gold); }
#hzc-prog .pg-q-sum { font-size: 12px; color: rgba(239,230,213,0.6); margin: 4px 0 7px; }
#hzc-prog .pg-obj {
  font-size: 12.5px; color: rgba(239,230,213,0.85);
  display: flex; gap: 8px; padding: 1.5px 0;
}
#hzc-prog .pg-obj .mark { color: rgba(239,230,213,0.4); width: 13px; }
#hzc-prog .pg-obj.done { color: rgba(239,230,213,0.42); text-decoration: line-through; }
#hzc-prog .pg-obj.done .mark { color: var(--pg-teal); text-decoration: none; }
#hzc-prog .pg-obj.next .mark { color: var(--pg-gold); }
#hzc-prog .pg-rewards {
  margin-top: 7px; font-size: 11px; letter-spacing: 0.12em;
  color: var(--pg-gold); text-transform: uppercase;
}

/* buttons */
#hzc-prog .pg-btn {
  font-family: var(--font, sans-serif); font-weight: 600;
  font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase;
  color: #efe6d5; background: rgba(12,16,20,0.6);
  border: 1px solid rgba(239,230,213,0.35);
  padding: 8px 18px; cursor: pointer;
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  transition: background 0.14s ease, border-color 0.14s ease;
}
#hzc-prog .pg-btn:hover { background: rgba(200,162,75,0.18); border-color: var(--pg-gold); }
#hzc-prog .pg-btn:disabled { opacity: 0.34; cursor: default; }
#hzc-prog .pg-btn.primary { border-color: var(--pg-gold); }
#hzc-prog .pg-row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 14px; }

/* dialogue */
#hzc-prog .pg-dlg-name {
  font-family: var(--font-display, 'Michroma', sans-serif);
  font-size: 16px; letter-spacing: 0.3em; color: var(--pg-gold);
}
#hzc-prog .pg-dlg-title { font-size: 11px; letter-spacing: 0.24em; color: rgba(239,230,213,0.5); text-transform: uppercase; margin-top: 4px; }
#hzc-prog .pg-dlg-line {
  font-size: 16px; line-height: 1.55; color: rgba(239,230,213,0.92);
  margin: 18px 0 6px; font-style: italic;
}
#hzc-prog .pg-choice {
  display: block; width: 100%; text-align: left; margin-top: 8px;
  font-family: var(--font, sans-serif); font-size: 13.5px; letter-spacing: 0.06em;
  color: #efe6d5; background: rgba(239,230,213,0.05);
  border: 1px solid rgba(239,230,213,0.18); border-left-width: 3px;
  padding: 9px 14px; cursor: pointer;
}
#hzc-prog .pg-choice:hover { background: rgba(200,162,75,0.16); border-left-color: var(--pg-gold); }
#hzc-prog .pg-choice .hint { color: var(--pg-teal); font-size: 11px; letter-spacing: 0.14em; margin-left: 8px; }

/* trade */
#hzc-prog .pg-trade { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
#hzc-prog .pg-trade h4 {
  font-size: 10px; letter-spacing: 0.3em; text-transform: uppercase;
  color: var(--pg-gold); font-weight: 400; margin-bottom: 8px;
  border-bottom: 1px solid rgba(239,230,213,0.14); padding-bottom: 6px;
}
#hzc-prog .pg-item {
  display: flex; align-items: center; gap: 10px; padding: 6px 8px; cursor: pointer;
  border: 1px solid transparent;
}
#hzc-prog .pg-item:hover { background: rgba(239,230,213,0.06); border-color: rgba(239,230,213,0.18); }
#hzc-prog .pg-item .glyph { width: 18px; text-align: center; font-size: 15px; }
#hzc-prog .pg-item .nm { flex: 1 1 auto; font-size: 13px; }
#hzc-prog .pg-item .qty { font-size: 11px; color: rgba(239,230,213,0.5); }
#hzc-prog .pg-item .pr { font-size: 12px; color: var(--pg-gold); min-width: 46px; text-align: right; }
#hzc-prog .pg-item.poor .pr { color: #d9543f; }
#hzc-prog .pg-purse {
  font-size: 12px; letter-spacing: 0.18em; color: var(--pg-gold);
  text-transform: uppercase;
}
#hzc-prog .pg-msg { font-size: 12px; color: var(--pg-teal); min-height: 16px; margin-top: 8px; letter-spacing: 0.1em; }
#hzc-prog .pg-msg.bad { color: #d9543f; }
`;

/** Small DOM helper — no framework, no per-frame allocation. */
function el(tag, cls, parent, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** Shared root so quests.js and skills.js never fight over a container. */
export function progRoot() {
  ensureStyle();
  let root = document.getElementById('hzc-prog');
  if (!root) {
    root = document.createElement('div');
    root.id = 'hzc-prog';
    document.body.appendChild(root);
  }
  return root;
}

export class QuestLogUI {
  constructor(ctx, prog) {
    this.ctx = ctx;
    this.prog = prog;
    this.root = progRoot();
    this.state = null;        // 'quests' | 'dialogue' | 'trade' | 'campfire'
    this._banners = [];
    this._msgT = 0;

    this._buildStrip();
    this._buildBanners();
    this._buildOverlay();
    this._bind();
    this.refresh();
    this.refreshXp();
  }

  /* ------------------------------ construction --------------------------- */

  _buildStrip() {
    const strip = el('div', 'pg-strip', this.root);
    const row = el('div', 'pg-xprow', strip);
    this._pip = el('div', 'pg-pip', row, '1');
    const wrap = el('div', 'pg-xpwrap', row);
    this._xpLabel = el('div', 'pg-xplabel', wrap);
    this._xpLeft = el('span', null, this._xpLabel, 'LEVEL 1');
    this._xpRight = el('span', null, this._xpLabel, '0 / 100 XP');
    const bar = el('div', 'pg-xpbar', wrap);
    this._xpFill = el('div', 'pg-xpfill', bar);
    this._points = el('div', 'pg-points pg-hidden', strip, '');
    this._track = el('div', 'pg-track pg-hidden', strip);
    this._trackTitle = el('div', 'pg-track-title', this._track, '');
    this._trackObj = el('div', 'pg-track-obj', this._track, '');
  }

  _buildBanners() {
    this._bannerEl = el('div', 'pg-banners', this.root);
    this._toastEl = el('div', 'pg-toasts', this.root);
  }

  _buildOverlay() {
    this._overlay = el('div', 'pg-overlay', this.root);
    this._panel = el('div', 'pg-panel', this._overlay);
    this._head = el('div', 'pg-head', this._panel, 'JOURNAL');
    this._body = el('div', 'pg-body', this._panel);
    this._foot = el('div', 'pg-foot', this._panel, '');
    this._overlay.addEventListener('mousedown', (e) => {
      if (e.target === this._overlay) this.close();
    });
  }

  _bind() {
    const ctx = this.ctx;
    const input = ctx.input;
    if (input?.onDown) {
      input.onDown('KeyJ', () => {
        if (this.state === 'quests') this.close();
        else if (ctx.state === 'playing') this.openLog();
      });
      input.onDown('Escape', () => {
        if (this.state) queueMicrotask(() => this.close());
      });
    }
    /**
     * `src/core/events.js` walks its subscriber set unguarded, so a throw in
     * here would unwind whoever emitted — `player-died` and `victory` are
     * emitted by OTHER lanes, and a DOM hiccup in this panel must never take
     * their death or endgame handling down with it. Same rule as
     * `Progression._emit`.
     */
    const on = (name, fn) => ctx.events?.on?.(name, (payload) => {
      try { fn(payload); } catch (err) { console.warn(`[quests] ${name}:`, err?.message || err); }
    });
    on('xp-gained', ({ amount, reason } = {}) => {
      if (amount > 0) this.toast(`+${amount} XP${reason === 'quest' ? '  QUEST' : ''}`);
      this.refreshXp();
    });
    on('player-died', () => this._forceClose());
    on('victory', () => this._forceClose());
  }

  /* --------------------------------- strip -------------------------------- */

  refreshXp() {
    const p = this.prog;
    if (!p || !this._pip) return;
    this._pip.textContent = String(p.level);
    this._xpLeft.textContent = `LEVEL ${p.level}`;
    const next = p.xpToNext;
    if (!Number.isFinite(next)) {
      this._xpRight.textContent = 'MAX';
      this._xpFill.style.width = '100%';
    } else {
      this._xpRight.textContent = `${p.xpIntoLevel} / ${next} XP`;
      this._xpFill.style.width = `${Math.max(0, Math.min(100, (p.xpIntoLevel / next) * 100))}%`;
    }
    if (p.skillPoints > 0) {
      this._points.classList.remove('pg-hidden');
      this._points.innerHTML = `◆ ${p.skillPoints} SKILL POINT${p.skillPoints > 1 ? 'S' : ''} — <kbd>K</kbd>`;
    } else {
      this._points.classList.add('pg-hidden');
    }
  }

  refresh() {
    if (!this._track) return;
    const p = this.prog;
    const s = p.tracked ? p.state(p.tracked) : null;
    if (!s || s.status !== 'active') { this._track.classList.add('pg-hidden'); return; }
    this._track.classList.remove('pg-hidden');
    this._trackTitle.textContent = s.title.toUpperCase();
    const o = s.current;
    if (!o) { this._trackObj.textContent = 'Return to Varl'; return; }
    const count = (o.need > 1) ? ` <span class="pg-track-count">${o.have}/${o.need}</span>` : '';
    this._trackObj.innerHTML = `${o.label}${count}`;
    if (this.state === 'quests') this._renderLog();
  }

  /* -------------------------------- banners ------------------------------- */

  /** Emitting must never throw back into this panel. See `Progression._emit`. */
  _emit(type, payload) {
    try { this.ctx.events?.emit?.(type, payload); }
    catch (err) { console.warn(`[quests] emit ${type}:`, err?.message || err); }
  }

  banner(title, detail, kind = 'info') {
    if (!this._bannerEl) return;
    const b = el('div', `pg-banner k-${kind}`, this._bannerEl);
    el('div', 'b-title', b, String(title));
    if (detail) el('div', 'b-detail', b, String(detail));
    el('div', 'b-rule', b);
    // the animation is 3.4 s; clean up a touch after so the node never leaks
    setTimeout(() => b.remove(), 3800);
    while (this._bannerEl.childElementCount > 3) this._bannerEl.firstElementChild.remove();
  }

  toast(text) {
    if (!this._toastEl) return;
    const t = el('div', 'pg-toast', this._toastEl, String(text));
    setTimeout(() => t.remove(), 1700);
    while (this._toastEl.childElementCount > 5) this._toastEl.firstElementChild.remove();
  }

  /* -------------------------------- panels -------------------------------- */

  _open(state, head, footHtml) {
    const ctx = this.ctx;
    const PANEL = /^(quests|dialogue|trade|campfire|skills)$/;
    if (ctx.state !== 'playing' && !PANEL.test(ctx.state) && !this.state) return false;
    if (!this.state) {
      this._prevState = ctx.state;
      ctx.state = state;
      ctx.input?.exitPointerLock?.();
    } else {
      ctx.state = state;
    }
    this.state = state;
    this._head.textContent = head;
    this._foot.innerHTML = footHtml || '<span><kbd>ESC</kbd>CLOSE</span>';
    this._overlay.classList.add('show');
    this._emit('ui-open');
    return true;
  }

  close() {
    if (!this.state) return;
    const ctx = this.ctx;
    this.state = null;
    this._overlay.classList.remove('show');
    this._body.innerHTML = '';
    this._panel.classList.remove('narrow');
    if (ctx.state === 'quests' || ctx.state === 'dialogue'
        || ctx.state === 'trade' || ctx.state === 'campfire') {
      ctx.state = 'playing';
    }
    this._emit('ui-close');
    // Leaving a conversation is what closes the `talk` objective — and a
    // conversation you left THROUGH the trade panel still counts as talking.
    if (this.prog.dialogue.open) this.prog.closeDialogue();
    if (!ctx.params?.has?.('shot')) ctx.input?.requestPointerLock?.();
  }

  /** Endgame overlays own the screen — drop out without touching ctx.state. */
  _forceClose() {
    if (!this.state) return;
    this.state = null;
    this._overlay.classList.remove('show');
    this._body.innerHTML = '';
  }

  /* --------------------------------- log ---------------------------------- */

  openLog() {
    if (!this._open('quests', 'JOURNAL',
      '<span><kbd>J</kbd>CLOSE</span><span><kbd>K</kbd>SKILLS</span><span>CLICK A QUEST TO TRACK IT</span>')) return;
    this._renderLog();
  }

  _renderLog() {
    const p = this.prog;
    const body = this._body;
    body.innerHTML = '';
    const groups = [
      ['ACTIVE', p.quests.active()],
      ['AVAILABLE', p.quests.offered()],
      ['COMPLETED', p.quests.completed()],
    ];
    let any = false;
    for (const [label, rows] of groups) {
      if (!rows.length) continue;
      any = true;
      el('div', 'pg-sub', body, label);
      for (const q of rows) this._questRow(body, q, label);
    }
    if (!any) el('div', 'pg-q-sum', body, 'No quests. Speak to Varl at the campfire.');
  }

  _questRow(parent, q, group) {
    const row = el('div', `pg-quest${q.tracked ? ' tracked' : ''}${q.status === 'done' ? ' done' : ''}`, parent);
    const title = el('div', 'pg-q-title', row);
    el('span', null, title, q.title.toUpperCase());
    el('span', `pg-q-tag ${q.type}`, title, q.type.toUpperCase());
    if (q.tracked) el('span', 'pg-q-tag', title, 'TRACKED');
    el('div', 'pg-q-sum', row, q.summary || '');
    for (const o of q.objectives) {
      const isNext = !o.done && q.current && o.id === q.current.id;
      const line = el('div', `pg-obj${o.done ? ' done' : ''}${isNext ? ' next' : ''}`, row);
      el('span', 'mark', line, o.done ? '✓' : (isNext ? '▶' : '·'));
      const count = o.need > 1 ? `  ${o.have}/${o.need}` : '';
      el('span', null, line, `${o.label}${count}`);
    }
    const r = q.rewards || {};
    const bits = [];
    if (r.xp) bits.push(`${r.xp} XP`);
    if (r.shards) bits.push(`${r.shards} SHARDS`);
    if (r.skillPoints) bits.push(`${r.skillPoints} SKILL POINT${r.skillPoints > 1 ? 'S' : ''}`);
    for (const it of (r.items || [])) bits.push(`${it.n}× ${it.id.replace(/-/g, ' ').toUpperCase()}`);
    if (bits.length) el('div', 'pg-rewards', row, `REWARD  ·  ${bits.join('  ·  ')}`);

    if (group === 'ACTIVE') row.addEventListener('click', () => { this.prog.track(q.id); this._renderLog(); });
    if (group === 'AVAILABLE') row.addEventListener('click', () => { this.prog.startQuest(q.id); this._renderLog(); });
  }

  /* ------------------------------- dialogue -------------------------------- */

  openDialogue(npcId) {
    const p = this.prog;
    const def = p.NPCS?.[npcId] ?? null;
    const name = def?.name ?? 'Varl';
    if (!this._open('dialogue', 'CONVERSATION', '<span><kbd>ESC</kbd>LEAVE</span>')) return;
    this._panel.classList.add('narrow');
    this._renderDialogue(npcId, name, def);
  }

  _renderDialogue(npcId, name, def) {
    const p = this.prog;
    const body = this._body;
    body.innerHTML = '';
    el('div', 'pg-dlg-name', body, String(name).toUpperCase());
    el('div', 'pg-dlg-title', body, def?.title ?? 'Hunter of the Valley');

    const greet = def?.greeting || ['Speak, then.'];
    const line = greet[Math.min(greet.length - 1, Math.floor(p.stats.kills / 3))];
    el('div', 'pg-dlg-line', body, `“${line}”`);

    const choices = [];
    const active = p.quests.active().filter((q) => q.giver === npcId);
    const offered = p.quests.offered().filter((q) => q.giver === npcId);
    const turnIn = active.find((q) => q.current && q.current.type === 'talk');

    if (turnIn) {
      choices.push({
        label: `“About ${turnIn.title}…”`, hint: 'REPORT IN',
        run: () => { this.close(); },
      });
    }
    for (const q of offered) {
      choices.push({
        label: `“Tell me about ${q.title}.”`, hint: 'ACCEPT QUEST',
        run: () => { p.startQuest(q.id); this._renderDialogue(npcId, name, def); },
      });
    }
    choices.push({ label: '“Show me what you have to trade.”', hint: 'TRADE', run: () => this.openTrade() });
    if (active.length) {
      choices.push({
        label: '“What am I supposed to be doing?”', hint: 'JOURNAL',
        run: () => this.openLog(),
      });
    }
    choices.push({ label: '“Later, Varl.”', hint: 'LEAVE', run: () => this.close() });

    for (const c of choices) {
      const b = el('button', 'pg-choice', body,
        `${c.label}<span class="hint">${c.hint}</span>`);
      b.addEventListener('click', c.run);
    }
  }

  /* --------------------------------- trade --------------------------------- */

  openTrade() {
    if (!this._open('trade', 'TRADE', '<span><kbd>ESC</kbd>DONE</span><span>CLICK TO BUY OR SELL</span>')) return;
    this._panel.classList.remove('narrow');
    this._renderTrade();
  }

  _renderTrade(msg, bad) {
    const p = this.prog;
    const m = p.merchant;
    const body = this._body;
    body.innerHTML = '';
    const purse = el('div', 'pg-purse', body, `◆ ${m.shards()} METAL SHARDS`);
    purse.style.marginBottom = '12px';

    const grid = el('div', 'pg-trade', body);
    const left = el('div', null, grid);
    el('h4', null, left, "Varl's wares");
    for (const row of m.stock()) {
      const price = m.price(row.id);
      const poor = m.shards() < price || row.qty <= 0;
      const item = el('div', `pg-item${poor ? ' poor' : ''}`, left);
      el('span', 'glyph', item, this._glyph(row.id));
      el('span', 'nm', item, this._name(row.id));
      el('span', 'qty', item, `×${row.qty}`);
      el('span', 'pr', item, `${price}◆`);
      item.addEventListener('click', () => {
        const r = m.buy(row.id, 1);
        this._renderTrade(r.ok ? `Bought ${this._name(row.id)} for ${r.cost}◆` : r.reason, !r.ok);
      });
    }

    const right = el('div', null, grid);
    el('h4', null, right, 'Your goods');
    const sellable = m.sellable();
    if (!sellable.length) el('div', 'pg-q-sum', right, 'Nothing he wants. Bring him lenses and hearts.');
    for (const row of sellable) {
      const item = el('div', 'pg-item', right);
      el('span', 'glyph', item, this._glyph(row.id));
      el('span', 'nm', item, this._name(row.id));
      el('span', 'qty', item, `×${row.n}`);
      el('span', 'pr', item, `+${row.price}◆`);
      item.addEventListener('click', () => {
        const r = m.sell(row.id, 1);
        this._renderTrade(r.ok ? `Sold ${this._name(row.id)} for ${r.paid}◆` : r.reason, !r.ok);
      });
    }

    const msgEl = el('div', `pg-msg${bad ? ' bad' : ''}`, body, msg || '');
    msgEl.style.marginTop = '14px';
  }

  /** Names and glyphs come from the item catalog, not from a copy of it. */
  _name(id) { return itemDef(id)?.name ?? String(id); }
  _glyph(id) { return itemDef(id)?.glyph ?? '◇'; }

  /* ------------------------------- campfire -------------------------------- */

  openCampfire() {
    if (!this._open('campfire', 'CAMPFIRE', '<span><kbd>ESC</kbd>STAND UP</span>')) return;
    this._panel.classList.add('narrow');
    const p = this.prog;
    const body = this._body;
    body.innerHTML = '';
    el('div', 'pg-q-sum', body,
      'The fire is banked and the valley is quiet enough to think. Rest here and the day moves on without you.');
    const info = p.saveInfo();
    if (info) {
      el('div', 'pg-sub', body,
        `LAST SAVE — LEVEL ${info.level} · ${new Date(info.savedAt).toLocaleTimeString()}`);
    }
    const row = el('div', 'pg-row', body);
    const bSave = el('button', 'pg-btn primary', row, 'SAVE PROGRESS');
    bSave.addEventListener('click', () => {
      const r = p.save('campfire');
      this._flash(body, r.ok ? 'Progress saved.' : `Save failed: ${r.error}`, !r.ok);
    });
    const bRest = el('button', 'pg-btn', row, 'REST UNTIL DAWN');
    bRest.addEventListener('click', () => { p.rest(6.2); this.close(); });
    const bSkills = el('button', 'pg-btn', row, 'SKILLS');
    bSkills.addEventListener('click', () => { this.close(); p.openSkills(); });
    const bLog = el('button', 'pg-btn', row, 'JOURNAL');
    bLog.addEventListener('click', () => this.openLog());

    el('div', 'pg-sub', body, 'DIFFICULTY').style.marginTop = '18px';
    const diffRow = el('div', 'pg-row', body);
    for (const d of (p.DIFFICULTIES ?? [])) {
      const b = el('button', `pg-btn${d.id === p.difficulty ? ' primary' : ''}`, diffRow, d.name.toUpperCase());
      b.addEventListener('click', () => { p.setDifficulty(d.id); this.openCampfire(); });
    }
    this._msgEl = el('div', 'pg-msg', body, '');
  }

  _flash(parent, text, bad) {
    if (!this._msgEl || !this._msgEl.isConnected) this._msgEl = el('div', 'pg-msg', parent, '');
    this._msgEl.className = `pg-msg${bad ? ' bad' : ''}`;
    this._msgEl.textContent = text;
  }

  /* --------------------------------- frame ---------------------------------- */

  update() { /* everything here is event-driven; no per-frame work */ }

  dispose() {
    this._overlay?.remove();
    this._bannerEl?.remove();
    this._toastEl?.remove();
    this._track?.parentElement?.remove();
  }
}
