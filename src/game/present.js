/**
 * PRESENTER — the systems' stand-in screens until the glass shell lands (M1.6g2 owns the dialogue lower-third, the
 * Brazier dialog and the slot cards): a dialogue lower-third (at most three lines, numbered stations), Brea's
 * field-turn subtitle, and the small Brazier dialog beside the fire. Glass #1E1A28, Chakra Petch for names and
 * labels, IBM Plex Mono for lines (BIBLE 18). Every word comes in from the caller (src/game/text/).
 *
 *   p.scene(scene, speakers, { next }) -> Promise<{ exit }>   plays cards; stations as numbered choices
 *   p.subtitle(lines, speaker)                                 one field turn, queued, 2.6 s + 1.1 s a line
 *   p.brazier({ title, rows, line }) -> Promise<row id | null> the rest dialog (rows: [{ id, label, forecast }])
 *   p.busy                                                     a scene or the Brazier dialog is open
 *   p.dispose()
 *
 * Keys: E, Space or Enter advance a card; 1-3 pick a station; 1-4 pick a rest row; Escape closes the Brazier dialog.
 */
const CSS = `
#cal-sys { position: fixed; inset: 0; pointer-events: none; z-index: 61; color: #EFE6D5; }
#cal-sys .sys-lt { position: absolute; left: 50%; bottom: 7vh; transform: translateX(-50%); width: min(780px, 70vw);
  background: rgba(30, 26, 40, 0.90); padding: 14px 20px 16px; display: none; pointer-events: auto; }
#cal-sys .sys-lt.on { display: block; }
#cal-sys .sys-tick { position: absolute; width: 6px; height: 6px; border-color: #D8CCE4; border-style: solid; }
#cal-sys .t1 { left: -1px; top: -1px; border-width: 1px 0 0 1px; } #cal-sys .t2 { right: -1px; top: -1px; border-width: 1px 1px 0 0; }
#cal-sys .t3 { left: -1px; bottom: -1px; border-width: 0 0 1px 1px; } #cal-sys .t4 { right: -1px; bottom: -1px; border-width: 0 1px 1px 0; }
#cal-sys .sys-who { font: 600 13px/1 'Chakra Petch', sans-serif; letter-spacing: 0.14em; margin-bottom: 8px; }
#cal-sys .sys-sub { font: 400 11px/1 'Chakra Petch', sans-serif; letter-spacing: 0.08em; opacity: 0.6; margin-left: 10px; }
#cal-sys .sys-line { font: 400 15px/1.45 'IBM Plex Mono', monospace; white-space: pre-line; }
#cal-sys .sys-next { position: absolute; right: 14px; bottom: 10px; font: 400 12px/1 'IBM Plex Mono', monospace; opacity: 0.55; }
#cal-sys .sys-st { display: block; font: 400 14px/1.6 'IBM Plex Mono', monospace; margin-top: 6px; cursor: pointer; }
#cal-sys .sys-st b { font: 600 12px 'Chakra Petch', sans-serif; display: inline-block; width: 22px; opacity: 0.7; }
#cal-sys .sys-st:hover { box-shadow: inset 0 -1px 0 #D8CCE4; }
#cal-sys .sys-subt { position: absolute; left: 50%; bottom: 16vh; transform: translateX(-50%); max-width: 62vw; text-align: center;
  font: 400 15px/1.45 'IBM Plex Mono', monospace; white-space: pre-line; text-shadow: 0 1px 3px rgba(0,0,0,0.85); opacity: 0; transition: opacity 0.25s; }
#cal-sys .sys-subt.on { opacity: 1; }
#cal-sys .sys-subt i { font: 600 12px 'Chakra Petch', sans-serif; font-style: normal; letter-spacing: 0.12em; opacity: 0.75; margin-right: 8px; }
#cal-sys .sys-bz { position: absolute; left: 58%; top: 42%; min-width: 300px; background: rgba(30, 26, 40, 0.90); padding: 14px 18px; display: none; pointer-events: auto; }
#cal-sys .sys-bz.on { display: block; }
#cal-sys .sys-bz h4 { margin: 0 0 10px; font: 600 12px/1 'Chakra Petch', sans-serif; letter-spacing: 0.14em; opacity: 0.75; }
#cal-sys .sys-row { display: block; padding: 6px 0; cursor: pointer; font: 600 14px/1.2 'Chakra Petch', sans-serif; letter-spacing: 0.06em; }
#cal-sys .sys-row small { display: block; font: 400 12px/1.4 'IBM Plex Mono', monospace; letter-spacing: 0; opacity: 0.7; }
#cal-sys .sys-row:hover, #cal-sys .sys-row.sel { box-shadow: inset 0 -1px 0 #D8CCE4; }
#cal-sys .sys-refuse { font: 600 14px/1.3 'Chakra Petch', sans-serif; letter-spacing: 0.06em; }
`;

const el = (tag, cls, parent, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  parent?.appendChild(e);
  return e;
};

export class Presenter {
  constructor(ctx) {
    this.ctx = ctx;
    this.busy = false;
    this._subQ = [];
    this._subT = 0;
    if (typeof document === 'undefined') { this.headless = true; return; }
    const style = el('style', null, document.head);
    style.id = 'cal-sys-style';
    style.textContent = CSS;
    this._style = style;
    this.root = el('div', null, document.body);
    this.root.id = 'cal-sys';
    this.lt = el('div', 'sys-lt', this.root);
    for (const t of ['t1', 't2', 't3', 't4']) el('i', `sys-tick ${t}`, this.lt);
    this.who = el('div', 'sys-who', this.lt);
    this.line = el('div', 'sys-line', this.lt);
    this.sts = el('div', null, this.lt);
    this.nextEl = el('div', 'sys-next', this.lt);
    this.subt = el('div', 'sys-subt', this.root);
    this.bz = el('div', 'sys-bz', this.root);
    for (const t of ['t1', 't2', 't3', 't4']) el('i', `sys-tick ${t}`, this.bz);
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey, true);
    this.lt.addEventListener('click', () => this._advance?.());
  }

  _key(e) {
    if (!this.busy || e.repeat) return;
    const c = e.code;
    if (this._pick && /^Digit[1-4]$/.test(c)) { e.stopPropagation(); this._pick(Number(c.slice(5)) - 1); return; }
    if (this._advance && (c === 'KeyE' || c === 'Space' || c === 'Enter')) { e.stopPropagation(); e.preventDefault(); this._advance(); return; }
    if (this._escape && c === 'Escape') { e.stopPropagation(); this._escape(); }
  }

  _hold() {
    this.busy = true;
    const ctx = this.ctx;
    this._prevState = ctx.state === 'dialogue' ? 'playing' : ctx.state;
    ctx.state = 'dialogue';
  }

  _release() {
    this.busy = false;
    this._advance = this._pick = this._escape = null;
    if (this.ctx.state === 'dialogue') this.ctx.state = this._prevState || 'playing';
  }

  /** Play a scene: its cards one by one, then its stations (if any) until the exit station has played. */
  scene(scene, speakers, { next = '' } = {}) {
    if (this.headless) return Promise.resolve({ exit: true });
    this._hold();
    this.lt.classList.add('on');
    return new Promise((resolve) => {
      const queue = scene.cards.slice();
      const stations = Array.isArray(scene.stations) ? scene.stations : null;
      const heard = new Set();
      const show = () => {
        const c = queue.shift();
        if (!c) {
          if (stations && !this._exitPlayed) return choose();
          this.lt.classList.remove('on');
          this._exitPlayed = false;
          this._release();
          resolve({ exit: true });
          return;
        }
        const sp = speakers[c.who] || { name: String(c.who).toUpperCase(), sub: '' };
        this.who.textContent = sp.name;
        el('span', 'sys-sub', this.who, sp.sub || '');
        this.line.textContent = c.lines.join('\n');
        this.sts.textContent = '';
        this.nextEl.textContent = next;
        this._pick = null;
        this._advance = show;
      };
      const choose = () => {
        this.sts.textContent = '';
        this.nextEl.textContent = '';
        this._advance = null;
        const open = stations.filter((s) => s.exit || !heard.has(s.label));
        open.forEach((s, i) => {
          const row = el('span', 'sys-st', this.sts);
          el('b', null, row, String(i + 1));
          row.appendChild(document.createTextNode(s.label));
          row.addEventListener('click', () => this._pick(i));
        });
        this._pick = (i) => {
          const s = open[i];
          if (!s) return;
          heard.add(s.label);
          if (s.exit) this._exitPlayed = true;
          queue.push(...s.cards);
          show();
        };
      };
      show();
    });
  }

  subtitle(lines, speaker) {
    if (this.headless) return;
    this._subQ.push({ lines, speaker });
    if (this._subT <= 0) this._nextSub();
  }

  _nextSub() {
    const s = this._subQ.shift();
    if (!s) { this.subt.classList.remove('on'); this._subT = 0; return; }
    this.subt.textContent = '';
    if (s.speaker) el('i', null, this.subt, s.speaker);
    this.subt.appendChild(document.createTextNode(s.lines.join('\n')));
    this.subt.classList.add('on');
    this._subT = 2.6 + 1.1 * s.lines.length;
  }

  /** Real seconds (subtitles run while the world runs). */
  update(dt) {
    if (this.headless) return;
    if (this._subT > 0) { this._subT -= dt; if (this._subT <= 0) this._nextSub(); }
  }

  /** The Brazier dialog: rows to choose, or one refusal line. Resolves the chosen row id or null. */
  brazier({ title, rows, line }) {
    if (this.headless) return Promise.resolve(rows?.[0]?.id ?? null);
    this._hold();
    this.bz.querySelectorAll('h4, .sys-row, .sys-refuse').forEach((n) => n.remove());
    el('h4', null, this.bz, title || '');
    this.bz.classList.add('on');
    return new Promise((resolve) => {
      const done = (v) => { this.bz.classList.remove('on'); this._release(); resolve(v); };
      if (line) {
        el('div', 'sys-refuse', this.bz, line);
        this._advance = () => done(null);
        this._escape = () => done(null);
        return;
      }
      rows.forEach((r, i) => {
        const row = el('span', 'sys-row', this.bz, r.label);
        el('small', null, row, r.forecast || '');
        row.addEventListener('click', () => done(r.id));
        if (i === 0) row.classList.add('sel');
      });
      this._pick = (i) => { if (rows[i]) done(rows[i].id); };
      this._advance = () => done(rows[0]?.id ?? null);
      this._escape = () => done(null);
    });
  }

  dispose() {
    if (this.headless) return;
    window.removeEventListener('keydown', this._onKey, true);
    this.root?.remove();
    this._style?.remove();
  }
}
