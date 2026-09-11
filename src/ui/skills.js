/**
 * SKILL TREE UI  —  lane `progression`  (`progression-001`, D7 slice)
 * ===========================================================================
 * Three trees — Prowler / Brave / Forager — twelve nodes, and every node spends
 * a real skill point on a multiplier the simulation reads this frame. The panel
 * says which hook each node changes, because the audit's complaint about Round
 * 3 progression was not "there is no tree", it was "nothing it could change
 * exists"; showing the hook keeps this lane honest.
 *
 * Shares the `#hzc-prog` DOM island and the stylesheet that `ui/quests.js`
 * injects — one style tag, one root, two panels, and nothing appended into
 * `#hud` (which belongs to `shell-hud`).
 */

import { progRoot } from './quests.js';

const STYLE_ID = 'hzc-skills-style';

const CSS = `
#hzc-prog .sk-overlay {
  position: absolute; inset: 0; pointer-events: auto;
  background: radial-gradient(ellipse at 50% 45%, rgba(6,9,12,0.64), rgba(6,9,12,0.92));
  display: flex; align-items: center; justify-content: center;
  opacity: 0; visibility: hidden; transition: opacity 0.16s ease;
}
#hzc-prog .sk-overlay.show { opacity: 1; visibility: visible; }
#hzc-prog .sk-panel {
  background: linear-gradient(168deg, rgba(13,18,22,0.95), rgba(8,11,14,0.98));
  border: 1px solid rgba(239,230,213,0.18);
  padding: 24px 28px 20px; width: min(1020px, 92vw); max-height: 86vh;
  display: flex; flex-direction: column;
  clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px);
}
#hzc-prog .sk-head {
  display: flex; align-items: baseline; justify-content: space-between;
  border-bottom: 1px solid rgba(239,230,213,0.16); padding-bottom: 12px;
}
#hzc-prog .sk-title {
  font-family: var(--font-display, 'Michroma', sans-serif);
  font-size: 13px; letter-spacing: 0.5em; text-indent: 0.5em; color: var(--pg-gold, #c8a24b);
}
#hzc-prog .sk-points {
  font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--pg-teal, #59c1c6);
}
#hzc-prog .sk-cols {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
  overflow-y: auto; padding: 16px 4px 4px; flex: 1 1 auto;
}
#hzc-prog .sk-cols::-webkit-scrollbar { width: 6px; }
#hzc-prog .sk-cols::-webkit-scrollbar-thumb { background: rgba(239,230,213,0.22); }
#hzc-prog .sk-col h3 {
  font-family: var(--font-display, 'Michroma', sans-serif);
  font-weight: 400; font-size: 11px; letter-spacing: 0.34em;
  color: #FAF9F5; text-align: center; padding-bottom: 10px;
  border-bottom: 1px solid rgba(239,230,213,0.14); margin-bottom: 4px;
}
#hzc-prog .sk-col.Prowler h3 { color: #9ad9c0; }
#hzc-prog .sk-col.Brave h3 { color: #e8a06a; }
#hzc-prog .sk-col.Forager h3 { color: #b9d17a; }

#hzc-prog .sk-node {
  position: relative; margin-top: 12px; padding: 11px 13px 12px 42px;
  border: 1px solid rgba(239,230,213,0.16);
  background: rgba(239,230,213,0.03);
  cursor: default; transition: border-color 0.14s ease, background 0.14s ease;
}
#hzc-prog .sk-node .sk-dot {
  position: absolute; left: 12px; top: 13px;
  width: 18px; height: 18px;
  border: 1px solid rgba(239,230,213,0.4);
  transform: rotate(45deg);
}
#hzc-prog .sk-node .sk-dot::after {
  content: ''; position: absolute; inset: 3px; background: transparent;
}
#hzc-prog .sk-node.available { cursor: pointer; border-color: rgba(200,162,75,0.55); }
#hzc-prog .sk-node.available:hover { background: rgba(200,162,75,0.13); }
#hzc-prog .sk-node.available .sk-dot { border-color: var(--pg-gold, #c8a24b); }
#hzc-prog .sk-node.unlocked { border-color: rgba(89,193,198,0.55); background: rgba(89,193,198,0.07); }
#hzc-prog .sk-node.unlocked .sk-dot { border-color: var(--pg-teal, #59c1c6); }
#hzc-prog .sk-node.unlocked .sk-dot::after { background: var(--pg-teal, #59c1c6); }
#hzc-prog .sk-node.locked { opacity: 0.45; }
#hzc-prog .sk-name {
  font-size: 14px; letter-spacing: 0.09em; text-transform: uppercase; color: #FAF9F5;
  display: flex; justify-content: space-between; gap: 10px;
}
#hzc-prog .sk-cost { font-size: 11px; color: var(--pg-gold, #c8a24b); letter-spacing: 0.16em; }
#hzc-prog .sk-desc { font-size: 12px; color: rgba(239,230,213,0.7); margin-top: 4px; line-height: 1.45; }
#hzc-prog .sk-req { font-size: 10.5px; letter-spacing: 0.14em; color: #d9543f; margin-top: 5px; text-transform: uppercase; }
#hzc-prog .sk-hook {
  font-size: 9.5px; letter-spacing: 0.1em; color: rgba(239,230,213,0.35);
  margin-top: 6px; font-family: var(--font-focus, monospace); word-break: break-word;
}
#hzc-prog .sk-foot {
  padding-top: 12px; margin-top: 8px; border-top: 1px solid rgba(239,230,213,0.14);
  font-size: 10.5px; letter-spacing: 0.2em; text-transform: uppercase;
  color: rgba(239,230,213,0.5); display: flex; gap: 20px; flex-wrap: wrap;
}
`;

function el(tag, cls, parent, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
}

export class SkillTreeUI {
  constructor(ctx, prog) {
    this.ctx = ctx;
    this.prog = prog;
    this.open_ = false;
    this.root = progRoot();

    if (!document.getElementById(STYLE_ID)) {
      const s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = CSS;
      document.head.appendChild(s);
    }

    this.overlay = el('div', 'sk-overlay', this.root);
    this.panel = el('div', 'sk-panel', this.overlay);
    const head = el('div', 'sk-head', this.panel);
    el('div', 'sk-title', head, 'SKILLS');
    this.pointsEl = el('div', 'sk-points', head, '0 POINTS');
    this.cols = el('div', 'sk-cols', this.panel);
    el('div', 'sk-foot', this.panel,
      '<span><kbd>K</kbd>CLOSE</span><span>CLICK A LIT NODE TO LEARN IT</span><span>POINTS COME FROM LEVELS AND QUESTS</span>');

    this.overlay.addEventListener('mousedown', (e) => { if (e.target === this.overlay) this.close(); });

    const input = ctx.input;
    if (input?.onDown) {
      input.onDown('KeyK', () => {
        if (this.open_) this.close();
        else if (ctx.state === 'playing') this.open();
      });
      input.onDown('Escape', () => { if (this.open_) queueMicrotask(() => this.close()); });
    }
    /**
     * Guarded, for the reason documented in `Progression._emit`:
     * `src/core/events.js` walks its subscriber set with no try/catch, and
     * 'player-died' / 'victory' are emitted by OTHER lanes. A DOM hiccup while
     * closing this panel must not unwind their death or endgame handling.
     */
    const on = (name, fn) => ctx.events?.on?.(name, (payload) => {
      try { fn(payload); } catch (err) { console.warn(`[skills] ${name}:`, err?.message || err); }
    });
    on('player-died', () => this._forceClose());
    on('victory', () => this._forceClose());
  }

  /** Emitting must never throw back into this panel. Same contract as above. */
  _emit(type, payload) {
    try { this.ctx.events?.emit?.(type, payload); }
    catch (err) { console.warn(`[skills] emit ${type}:`, err?.message || err); }
  }

  open() {
    const ctx = this.ctx;
    if (this.open_) return;
    if (ctx.state !== 'playing' && ctx.state !== 'quests' && ctx.state !== 'campfire') return;
    this.open_ = true;
    ctx.state = 'skills';
    ctx.input?.exitPointerLock?.();
    this.overlay.classList.add('show');
    this._emit('ui-open');
    this.refresh();
  }

  close() {
    if (!this.open_) return;
    const ctx = this.ctx;
    this.open_ = false;
    this.overlay.classList.remove('show');
    if (ctx.state === 'skills') ctx.state = 'playing';
    this._emit('ui-close');
    if (!ctx.params?.has?.('shot')) ctx.input?.requestPointerLock?.();
  }

  _forceClose() {
    if (!this.open_) return;
    this.open_ = false;
    this.overlay.classList.remove('show');
  }

  refresh() {
    const p = this.prog;
    if (!p || !this.cols) return;
    this.pointsEl.textContent =
      `${p.skillPoints} POINT${p.skillPoints === 1 ? '' : 'S'}  ·  ${p.spentPoints} SPENT`;
    if (!this.open_) return;              // no DOM churn while it is closed
    this._render();
  }

  _render() {
    const p = this.prog;
    this.cols.innerHTML = '';
    const trees = p.SKILL_TREES || ['Prowler', 'Brave', 'Forager'];
    const nodes = p.skillTree();
    for (const tree of trees) {
      const col = el('div', `sk-col ${tree}`, this.cols);
      el('h3', null, col, tree.toUpperCase());
      const rows = nodes.filter((n) => n.tree === tree).sort((a, b) => a.tier - b.tier);
      for (const n of rows) this._node(col, n);
    }
  }

  _node(parent, n) {
    const p = this.prog;
    const check = p.canUnlock(n.id);
    const cls = n.unlocked ? 'unlocked' : (check.ok ? 'available' : 'locked');
    const node = el('div', `sk-node ${cls}`, parent);
    el('div', 'sk-dot', node);
    const name = el('div', 'sk-name', node);
    el('span', null, name, n.name);
    el('span', 'sk-cost', name, n.unlocked ? 'LEARNED' : `${n.cost}◆`);
    el('div', 'sk-desc', node, n.desc);
    if (!n.unlocked && !check.ok) el('div', 'sk-req', node, check.reason);
    if (n.hook) el('div', 'sk-hook', node, `hook: ${n.hook}`);
    if (check.ok) {
      node.addEventListener('click', () => {
        if (p.unlock(n.id)) { this.refresh(); this.prog.ui?.refreshXp?.(); }
      });
    }
  }

  update() { /* event-driven */ }

  dispose() { this.overlay?.remove(); }
}
