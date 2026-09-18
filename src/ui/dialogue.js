/**
 * CONVERSATION CARD  —  lane `progression-expansion`
 * ===========================================================================
 * `missing-systems-npc-dialogue-quests-merchants`, gate `A99-dialogue`,
 * `V45-dialogue-panel`.
 *
 * Round 3 had no dialogue at all; the Wave-2 progression lane bolted a
 * name/line/choices block into the JOURNAL overlay, which is a full-screen
 * modal — talking to a hunter blanked the hunter. `npc` (port 5218) then
 * shipped thirteen named Nora, each with authored lines and a `TALK · NAME`
 * prompt, and routed every one of them at `progression.talkTo(id)`.
 *
 * So this is the real thing: its own DOM island, anchored to the BOTTOM of the
 * frame so the person speaking stays on screen (that is half of what V45
 * judges), drawn in HZD's chrome — tracked caps for the name, a gold chamfered
 * slab, numbered choices with a role tag on the right.
 *
 *   #hzc-dlg  ─ never a child of #hud or #hzc-prog, injects its own <style>
 *               once, and is removed whole by `dispose()`.
 *
 * RULES THIS FILE KEEPS
 *   · It holds NO rules. Every line, every choice and every consequence comes
 *     from `progression.dialogueState(npc)` / `progression.choose(id)`; this
 *     file turns that record into DOM and turns a click back into a call. That
 *     is what lets `A99` assert the same state through the API and the panel.
 *   · One panel, built once, reused for every conversation — no per-open DOM
 *     churn beyond the choice rows, and every listener it adds is released in
 *     `dispose()` (the lane's memory rule).
 *   · `ctx.state` is parked on `'dialogue'` exactly the way `quests.js` parks
 *     `'quests'`: `main.js` only simulates `playing | title | dead | victory |
 *     studio`, so an open card freezes the world without this lane owning the
 *     pause code, and closing it always puts the state back.
 */

const STYLE_ID = 'hzc-dlg-style';

const CSS = `
#hzc-dlg {
  position: fixed; inset: 0; pointer-events: none; z-index: 62;
  font-family: var(--font, 'Rajdhani', system-ui, sans-serif);
  color: var(--hzc-text, #efe6d5);
  --dlg-gold: #c8a24b;
  --dlg-teal: var(--hzc-accent, #59c1c6);
  opacity: 0; visibility: hidden;
  transition: opacity 0.18s ease;
}
#hzc-dlg.show { opacity: 1; visibility: visible; }

/* the card sits in the bottom third: the speaker stays visible above it */
#hzc-dlg .dlg-stage {
  position: absolute; left: 50%; bottom: 6.5vh; transform: translateX(-50%);
  width: min(920px, 74vw);
  pointer-events: auto;
}

/* --------------------------------- speaker -------------------------------- */
#hzc-dlg .dlg-who {
  display: flex; align-items: baseline; gap: 14px;
  padding: 0 4px 9px;
}
#hzc-dlg .dlg-mark {
  width: 11px; height: 11px; flex: 0 0 11px;
  background: var(--dlg-gold);
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  transform: translateY(-1px);
}
#hzc-dlg .dlg-name {
  font-family: var(--font-display, 'Michroma', sans-serif);
  font-size: 17px; letter-spacing: 0.30em; text-indent: 0.30em;
  color: #FAF9F5; text-shadow: 0 2px 16px rgba(0,0,0,0.85);
}
#hzc-dlg .dlg-role {
  font-size: 10px; letter-spacing: 0.26em; text-indent: 0.26em;
  text-transform: uppercase; color: rgba(239,230,213,0.58);
}

/* ---------------------------------- card ---------------------------------- */
#hzc-dlg .dlg-card {
  position: relative;
  background: linear-gradient(168deg, rgba(12,17,21,0.93), rgba(7,10,13,0.96));
  border: 1px solid rgba(200,162,75,0.34);
  box-shadow: 0 18px 54px rgba(0,0,0,0.55), inset 0 1px 0 rgba(239,230,213,0.06);
  clip-path: polygon(0 0, calc(100% - 17px) 0, 100% 17px, 100% 100%, 17px 100%, 0 calc(100% - 17px));
  padding: 17px 22px 13px;
}
#hzc-dlg .dlg-card::before {
  content: ''; position: absolute; left: 0; top: 10px; bottom: 10px; width: 2px;
  background: linear-gradient(180deg, transparent, var(--dlg-gold), transparent);
}
#hzc-dlg .dlg-line {
  font-size: 16.5px; line-height: 1.52; letter-spacing: 0.012em;
  color: rgba(250,249,245,0.94);
  min-height: 2.4em;
  padding-left: 12px;
}
#hzc-dlg .dlg-rule {
  height: 1px; margin: 13px 0 9px;
  background: linear-gradient(90deg, rgba(200,162,75,0.42), rgba(200,162,75,0.05) 62%, transparent);
}

/* -------------------------------- choices --------------------------------- */
#hzc-dlg .dlg-choices { display: flex; flex-direction: column; gap: 3px; }
#hzc-dlg .dlg-choice {
  display: flex; align-items: center; gap: 12px;
  width: 100%; text-align: left;
  background: transparent; border: 0; border-left: 2px solid transparent;
  padding: 8px 10px 8px 10px; margin: 0;
  color: rgba(239,230,213,0.86);
  font: inherit; font-size: 14.5px; letter-spacing: 0.015em;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
#hzc-dlg .dlg-choice:hover, #hzc-dlg .dlg-choice.sel {
  background: rgba(200,162,75,0.11);
  border-left-color: var(--dlg-gold);
  color: #FAF9F5;
}
#hzc-dlg .dlg-key {
  flex: 0 0 20px; height: 20px;
  display: flex; align-items: center; justify-content: center;
  font-size: 10.5px; letter-spacing: 0;
  color: var(--dlg-gold);
  border: 1px solid rgba(200,162,75,0.45);
}
#hzc-dlg .dlg-choice:hover .dlg-key, #hzc-dlg .dlg-choice.sel .dlg-key {
  background: var(--dlg-gold); color: #0b0e11; border-color: var(--dlg-gold);
}
#hzc-dlg .dlg-text { flex: 1 1 auto; }
#hzc-dlg .dlg-hint {
  flex: 0 0 auto; font-size: 9.5px; letter-spacing: 0.24em; text-indent: 0.24em;
  text-transform: uppercase; color: var(--dlg-teal); opacity: 0.85;
}
#hzc-dlg .dlg-choice[data-kind="quest-accept"] .dlg-hint,
#hzc-dlg .dlg-choice[data-kind="quest-turnin"] .dlg-hint { color: var(--dlg-gold); }

/* --------------------------------- footer --------------------------------- */
#hzc-dlg .dlg-foot {
  display: flex; gap: 22px; justify-content: flex-end;
  padding: 9px 4px 0;
  font-size: 9.5px; letter-spacing: 0.24em; text-indent: 0.24em;
  text-transform: uppercase; color: rgba(239,230,213,0.45);
}
#hzc-dlg .dlg-foot kbd {
  font: inherit; color: var(--dlg-gold); margin-right: 7px;
}
@media (max-width: 900px) {
  #hzc-dlg .dlg-stage { width: 88vw; bottom: 4vh; }
  #hzc-dlg .dlg-line { font-size: 15px; }
}
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

function el(tag, cls, parent, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
}

const KEY_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];

export class DialogueUI {
  constructor(ctx, prog) {
    this.ctx = ctx;
    this.prog = prog;
    this.npcId = null;
    this.isOpen = false;
    this._prevState = null;
    this._choices = [];
    /** every listener this panel installs, so `dispose()` can take them back */
    this._keyHooks = [];
    this._eventOffs = [];
    this._rows = [];

    ensureStyle();
    this._build();
    this._bind();
    this._bindEvents();
  }

  /* ------------------------------ construction --------------------------- */

  _build() {
    let root = document.getElementById('hzc-dlg');
    if (!root) {
      root = document.createElement('div');
      root.id = 'hzc-dlg';
      document.body.appendChild(root);
    }
    root.innerHTML = '';
    this.root = root;
    const stage = el('div', 'dlg-stage', root);
    const who = el('div', 'dlg-who', stage);
    el('div', 'dlg-mark', who);
    this._nameEl = el('div', 'dlg-name', who, '');
    this._roleEl = el('div', 'dlg-role', who, '');
    const card = el('div', 'dlg-card', stage);
    this._lineEl = el('div', 'dlg-line', card, '');
    el('div', 'dlg-rule', card);
    this._choiceEl = el('div', 'dlg-choices', card);
    this._footEl = el('div', 'dlg-foot', stage,
      '<span><kbd>1-3</kbd>CHOOSE</span><span><kbd>ESC</kbd>LEAVE</span>');
  }

  _bind() {
    const input = this.ctx.input;
    if (!input?.onDown) return;
    for (let i = 0; i < 3; i++) {
      const code = KEY_CODES[i];
      const fn = () => { if (this.isOpen) this._pick(i); };
      input.onDown(code, fn);
      this._keyHooks.push([code, fn]);
    }
    const esc = () => { if (this.isOpen) queueMicrotask(() => this.close()); };
    input.onDown('Escape', esc);
    this._keyHooks.push(['Escape', esc]);
  }

  /**
   * Death and victory own the screen. Guarded, because `src/core/events.js`
   * walks its subscriber set unguarded: a DOM hiccup in this card must never
   * unwind the lane that emitted `player-died`.
   */
  _bindEvents() {
    const ev = this.ctx.events;
    if (!ev?.on) return;
    const on = (name, fn) => {
      const off = ev.on(name, (p) => {
        try { fn(p); } catch (err) { console.warn(`[dialogue] ${name}:`, err?.message || err); }
      });
      if (typeof off === 'function') this._eventOffs.push(off);
    };
    on('player-died', () => this.forceClose());
    on('victory', () => this.forceClose());
  }

  /* --------------------------------- open --------------------------------- */

  /**
   * Show the card for `npcId`. Returns false (and draws nothing) when another
   * modal owns the screen — the caller falls back to whatever it had.
   */
  open(npcId) {
    const ctx = this.ctx;
    const state = this.prog.dialogueState(npcId);
    if (!state) return false;
    const PANEL = /^(playing|dialogue|quests|trade|campfire|skills)$/;
    if (!PANEL.test(ctx.state)) return false;

    if (!this.isOpen) {
      this._prevState = ctx.state === 'dialogue' ? 'playing' : ctx.state;
      ctx.input?.exitPointerLock?.();
    }
    ctx.state = 'dialogue';
    this.npcId = npcId;
    this.isOpen = true;
    this.root.classList.add('show');
    this._render(state);
    return true;
  }

  /** Re-read the state and repaint (a choice, a quest accepted, a reload). */
  refresh() {
    if (!this.isOpen) return;
    const state = this.prog.dialogueState(this.npcId);
    if (state) this._render(state);
  }

  _render(state) {
    this._nameEl.textContent = String(state.name || '').toUpperCase();
    this._roleEl.textContent = String(state.title || '');
    this._lineEl.textContent = `“${state.line}”`;

    // rebuild only the rows (2-3 of them); everything else is reused
    this._choiceEl.textContent = '';
    this._rows.length = 0;
    this._choices = state.choices || [];
    for (let i = 0; i < this._choices.length; i++) {
      const c = this._choices[i];
      const row = el('button', 'dlg-choice', this._choiceEl);
      row.type = 'button';
      row.dataset.kind = c.kind;
      row.dataset.choice = c.id;
      el('span', 'dlg-key', row, String(i + 1));
      el('span', 'dlg-text', row, String(c.label));
      el('span', 'dlg-hint', row, String(c.hint || ''));
      row.addEventListener('click', () => this._choose(c.id));
      this._rows.push(row);
    }
  }

  _pick(i) {
    const c = this._choices[i];
    if (c) this._choose(c.id);
  }

  /**
   * One click / keypress. Every consequence is decided by `progression.choose`;
   * this only decides what to do with the panel afterwards.
   */
  _choose(choiceId) {
    if (!this.isOpen) return;
    let res = null;
    try { res = this.prog.choose(choiceId); } catch (err) {
      console.warn('[dialogue] choice failed:', err?.message || err);
      return;
    }
    if (!res) return;
    if (res.closed) {
      const action = res.action;
      this.close();
      if (action === 'trade') this.prog.openTrade();
      else if (action === 'journal') this.prog.openQuestLog();
      return;
    }
    if (res.state) this._render(res.state);
  }

  /* -------------------------------- close --------------------------------- */

  /**
   * @param {{silent?:boolean}} [opts] `silent` is the re-entrant path:
   *        `progression.closeDialogue()` is already unwinding, so do not call
   *        back into it (that is what credits the `talk` objective).
   */
  close(opts = {}) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('show');
    const ctx = this.ctx;
    if (ctx.state === 'dialogue') ctx.state = this._prevState || 'playing';
    this._prevState = null;
    if (!opts.silent && this.prog.dialogue.open) this.prog.closeDialogue();
    if (!ctx.params?.has?.('shot') && ctx.state === 'playing') ctx.input?.requestPointerLock?.();
  }

  /** Endgame overlays own the screen: drop out without touching ctx.state. */
  forceClose() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('show');
    this._prevState = null;
  }

  /* ------------------------------ diagnostics ----------------------------- */

  /** Everything `A99` and `V45` read off the panel itself. */
  audit() {
    const rows = [...this._choiceEl.querySelectorAll('.dlg-choice')];
    const box = this.isOpen ? this.root.querySelector('.dlg-stage')?.getBoundingClientRect() : null;
    return {
      open: this.isOpen,
      npc: this.npcId,
      name: this._nameEl.textContent,
      role: this._roleEl.textContent,
      line: this._lineEl.textContent,
      choices: rows.map((r) => ({
        kind: r.dataset.kind,
        id: r.dataset.choice,
        text: r.querySelector('.dlg-text')?.textContent ?? '',
        hint: r.querySelector('.dlg-hint')?.textContent ?? '',
      })),
      /** fraction of the viewport height the card covers, measured from the DOM */
      coverage: box ? +((box.height / Math.max(1, window.innerHeight))).toFixed(3) : 0,
      bottomAnchored: box ? box.top / Math.max(1, window.innerHeight) > 0.5 : null,
      nodes: this.root.querySelectorAll('*').length,
    };
  }

  update() { /* event-driven: nothing per frame */ }

  dispose() {
    const input = this.ctx.input;
    for (const [code, fn] of this._keyHooks) {
      try { input?._downHandlers?.get?.(code)?.delete?.(fn); } catch { /* input gone */ }
    }
    this._keyHooks.length = 0;
    for (const off of this._eventOffs) { try { off(); } catch { /* already gone */ } }
    this._eventOffs.length = 0;
    this._rows.length = 0;
    this._choices = [];
    this.isOpen = false;
    this.root?.remove();
    this.root = null;
  }
}
