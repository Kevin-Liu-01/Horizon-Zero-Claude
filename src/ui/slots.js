import SHELL from '../game/text/ui/shell.json';
import CARDS from '../game/text/cards/tutorial.json';

/**
 * THE CONTINUE AND SAVE SLOTS, THE FIELD MANUAL'S CARDS, THE CONTEXT-LOST CARD (M1.6g2; BIBLE 18).
 *
 *   fillSlots(body, { menus, onContinue })   three glass slot cards: SLOT n, place, hour, Order, hectares and a
 *                                            thumbnail of the last rest; CONTINUE on a card with a record, ERASE
 *                                            (hold 1.2 s). The slot Continue would load is marked (`.cont`)
 *   fillManualCards(body)                    the Field Manual's tutorial cards (src/game/text/cards/tutorial.json)
 *   ContextCard                              `DISPLAY RESET · RESUMING`: the world pauses while the graphics context
 *                                            is lost and resumes when it is restored; past 5 s it reloads the last
 *                                            record (the page reloads and Continue runs on its own)
 *
 * Every word is from src/game/text/ui/shell.json. The save store is the systems lane's (src/game/save/store.js),
 * read through its own calls: slots(), latest(n), continueSlot(), erase(n), and progression's saves.useSlot(n).
 */

const el = (tag, cls, parent, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
};
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? String(v[k]) : m));
const hhmm = (h) => {
  const t = ((Number(h) || 0) % 24 + 24) % 24;
  let hh = Math.floor(t), mm = Math.round((t - hh) * 60);
  if (mm === 60) { mm = 0; hh = (hh + 1) % 24; }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

export const ERASE_HOLD_S = 1.2;
/** BIBLE 15: Order is computed from ground made true; the bible's own example puts Second Order at 55 ha. */
const SECOND_ORDER_HA = 55;

/** A slot's record, read the way Continue reads it (the newer of its named save and its checkpoint). */
function slotRecord(store, n) {
  try { return store?.latest?.(n) ?? null; } catch { return null; }
}

/** Hectares made true: the record's opened triangles, measured on the sheet's own pillar table. */
function hectares(menus, rec) {
  const tris = Array.isArray(rec?.triangles) ? rec.triangles : [];
  let m2 = 0;
  for (const t of tris) { try { m2 += menus.map.triangleArea(t) || 0; } catch { /* a pillar the sheet lacks */ } }
  return m2 / 10000;
}

/** The thumbnail: the survey sheet round the last rest's Brazier (the map's baked base), 4:3. */
function paintThumb(canvas, menus, rec) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.fillStyle = '#16141F';
  g.fillRect(0, 0, W, H);
  const lr = rec?.braziers?.lastRest ?? null;
  const base = menus.map?.bake?.base;
  if (!lr || !base || !menus.map.bake.ready) return false;
  const c = menus.map.worldToMap(lr.x, lr.z);
  const span = 260;   // canvas px of the sheet across the thumbnail (about 180 m)
  g.imageSmoothingEnabled = true;
  g.drawImage(base, c.x - span / 2, c.y - (span * H / W) / 2, span, span * H / W, 0, 0, W, H);
  // the Brazier at the centre: a lit fire bowl
  g.fillStyle = '#F2B45A';
  g.beginPath(); g.moveTo(W / 2 - 7, H / 2); g.lineTo(W / 2 + 7, H / 2); g.lineTo(W / 2 + 4, H / 2 + 6); g.lineTo(W / 2 - 4, H / 2 + 6); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(W / 2, H / 2 - 1); g.quadraticCurveTo(W / 2 - 5, H / 2 - 6, W / 2, H / 2 - 13); g.quadraticCurveTo(W / 2 + 5, H / 2 - 6, W / 2, H / 2 - 1); g.fill();
  return true;
}

/**
 * The three slot cards. `onContinue(n)` runs the chosen slot. Returns { cards, refresh, audit }.
 */
export function fillSlots(body, { menus, onContinue }) {
  const S = SHELL.slots;
  const prog = menus.ctx.progression;
  const store = prog?.saves?.store ?? null;
  el('div', 't2-card-lead gs-slot-lead', body, S.lead);
  const row = el('div', 'gs-slots', body);
  const cards = [];
  const thumbs = [];

  const build = () => {
    row.innerHTML = '';
    cards.length = 0;
    thumbs.length = 0;
    const cont = store?.continueSlot?.() ?? null;
    for (let n = 1; n <= 3; n++) {
      const rec = slotRecord(store, n);
      const card = el('div', `gs-card gs-slot${rec ? '' : ' empty'}${n === cont ? ' cont' : ''}`, row);
      card.dataset.slot = String(n);
      el('div', 'gs-slot-head', card, fill(S.slot, { n }));
      const thumb = el('canvas', 'gs-slot-thumb', card);
      thumb.width = 240; thumb.height = 135;
      if (!rec) {
        el('div', 'gs-slot-empty', card, S.empty);
        paintThumb(thumb, menus, null);
        cards.push(card);
        continue;
      }
      thumbs.push([thumb, rec]);
      const place = menus.ctx.systemsGame?.S?.systems?.brazier?.names?.[rec.braziers?.lastRest?.id] || rec.place || '';
      const ha = hectares(menus, rec);
      const lines = el('div', 'gs-slot-lines', card);
      el('div', 'gs-slot-place', lines, String(place).toUpperCase() || '—');
      el('div', 'gs-slot-hour', lines, hhmm(rec.hour));
      el('div', 'gs-slot-order', lines, ha >= SECOND_ORDER_HA ? S.orderSecond : S.order);
      el('div', 'gs-slot-ha', lines, fill(S.hectares, { ha: ha.toFixed(1) }));
      const acts = el('div', 'gs-slot-acts', card);
      const go = el('button', 'gs-slot-go', acts, S.continue);
      go.addEventListener('click', () => onContinue(n));
      const er = el('button', 'gs-slot-erase', acts, `${S.erase} <i>(${S.eraseHold})</i><b></b>`);
      holdToErase(er, () => { store?.erase?.(n); build(); menus._refreshTitle?.(); });
      cards.push(card);
    }
    paintThumbs();
  };

  const paintThumbs = () => {
    let missing = false;
    for (const [c, rec] of thumbs) if (!paintThumb(c, menus, rec)) missing = true;
    // the sheet is baked once a session, time-sliced; the thumbnails fill in when it is ready
    if (missing && menus.map?.bake && !menus.map.bake.ready) menus.map.bake.start(() => { if (menus.map.bake.ready) paintThumbs(); });
  };

  build();
  return {
    cards,
    refresh: build,
    audit: () => cards.map((c) => ({ slot: +c.dataset.slot, empty: c.classList.contains('empty'), cont: c.classList.contains('cont'), text: c.innerText })),
  };
}

/** ERASE is a hold, never a click: the bar fills over ERASE_HOLD_S and the slot is cleared when it is full. */
function holdToErase(btn, done) {
  const bar = btn.querySelector('b');
  let t0 = 0, raf = 0;
  const stop = () => { cancelAnimationFrame(raf); raf = 0; t0 = 0; if (bar) bar.style.transform = 'scaleX(0)'; };
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / (ERASE_HOLD_S * 1000));
    if (bar) bar.style.transform = `scaleX(${k.toFixed(3)})`;
    if (k >= 1) { stop(); done(); return; }
    raf = requestAnimationFrame(tick);
  };
  btn.addEventListener('mousedown', (e) => { e.preventDefault(); t0 = performance.now(); raf = requestAnimationFrame(tick); });
  for (const ev of ['mouseup', 'mouseleave']) btn.addEventListener(ev, stop);
}

/** The Field Manual (EXTRAS): every tutorial card the game shows, as small glass cards, then the keys. */
export function fillManualCards(body, keysNode) {
  const M = SHELL.manual;
  el('h4', 'gs-man-head', body, M.cards);
  const grid = el('div', 'gs-man-cards', body);
  for (const c of CARDS.cards ?? []) {
    const card = el('div', 'gs-card gs-man-card', grid);
    if (c.head) el('div', 'gs-man-title', card, c.head);
    el('div', `gs-man-body${c.head ? '' : ' caps'}`, card, String(c.body).replace(/\{key:(\w+)\}/g, (m, k) => `<kbd>${KEYCAP[k] ?? k.toUpperCase()}</kbd>`));
  }
  if (keysNode) {
    el('h4', 'gs-man-head', body, M.keys);
    body.appendChild(keysNode);
  }
}
const KEYCAP = { alidade: 'V', bearing: 'T', steady: 'SHIFT', interact: 'E', crouch: 'C', slot: '1', pry: 'E' };

/**
 * DISPLAY RESET · RESUMING (BIBLE 18 "Context lost"). Listens on the game canvas; three.js's own renderer restores
 * its state on `webglcontextrestored`. While the context is lost the world is parked off 'playing' (main.js only
 * simulates playing, title, dead, victory and studio) and the card stands; on restore the state goes back. If no
 * restore comes within 5 s, the page reloads and Continue runs by itself on the next title (sessionStorage flag).
 */
export const RESUME_FLAG = 'cal.resumeAfterReset';
const RESTORE_WAIT_MS = 5000;

export class ContextCard {
  constructor(menus) {
    this.menus = menus;
    this.ctx = menus.ctx;
    this.lost = false;
    this.log = [];
    const C = SHELL.contextLost;
    this.el = el('div', 'gs-ctx', menus.root);
    const card = el('div', 'gs-card gs-ctx-card', this.el);
    el('div', 'gs-ctx-line', card, C.line);
    this._sub = el('div', 'gs-ctx-sub', card, C.sub);
    const cv = this.ctx.renderer?.domElement;
    this._cv = cv;
    this._onLost = (e) => { e.preventDefault?.(); this.onLost(); };
    this._onRestored = () => this.onRestored();
    cv?.addEventListener('webglcontextlost', this._onLost);
    cv?.addEventListener('webglcontextrestored', this._onRestored);
  }

  onLost() {
    if (this.lost) return;
    this.lost = true;
    this._t0 = performance.now();
    this._prev = this.ctx.state;
    if (this.ctx.state === 'playing') this.ctx.state = 'context-lost';
    this._sub.textContent = SHELL.contextLost.sub;
    this.el.classList.add('show');
    this.log.push({ what: 'lost', state: this._prev, t: Math.round(this._t0) });
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.reload(), RESTORE_WAIT_MS);
  }

  onRestored() {
    if (!this.lost) return;
    clearTimeout(this._timer);
    this.lost = false;
    if (this.ctx.state === 'context-lost') this.ctx.state = this._prev === 'playing' ? 'playing' : (this._prev ?? 'playing');
    this.el.classList.remove('show');
    this.log.push({ what: 'restored', ms: Math.round(performance.now() - this._t0) });
  }

  /** No restore in time: reload the last record. A save on the way out is not taken (the world may be mid-loss). */
  reload() {
    if (!this.lost) return;
    this._sub.textContent = SHELL.contextLost.reload;
    this.log.push({ what: 'reload', ms: Math.round(performance.now() - this._t0) });
    const wasPlaying = this._prev === 'playing' || this._prev === 'paused';
    try { if (wasPlaying && this.ctx.progression?.hasSave?.()) sessionStorage.setItem(RESUME_FLAG, '1'); } catch { /* storage off */ }
    setTimeout(() => location.reload(), 400);
  }

  audit() { return { lost: this.lost, visible: this.el.classList.contains('show'), text: this.el.innerText, log: this.log.slice(-6) }; }

  dispose() {
    clearTimeout(this._timer);
    this._cv?.removeEventListener('webglcontextlost', this._onLost);
    this._cv?.removeEventListener('webglcontextrestored', this._onRestored);
    this.el.remove();
  }
}
