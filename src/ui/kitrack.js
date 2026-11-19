/**
 * THE KIT RACK (Milestone 2 area D, wave 3; BIBLE §8.5 "the real-time gear selector (a protractor half-ring at the right
 * screen edge, five sectors) plus quick slots 1-4. The world keeps running", §12 "Kit Rack Tab (hold; the half-ring
 * arrives with Oro's kit)", §18 glass; KT11).
 *
 * A protractor half-ring standing on the right edge of the screen (its centre on the edge, so the ring's middle is past
 * 85 % of the width: never a centre wheel), five sectors top to bottom: BOW, LANCE, GAFF, POTS, NET (an empty sector
 * says so: the net is hour 2). The rim is graduated every 6 deg. Hold Tab: it opens (a 90 ms fade and slide, so it is
 * up inside 120 ms); the mouse's vertical travel (or keys 1-5) moves the selection; let Tab go: the selection is taken
 * through the quick slots (src/ui/quickslots.js select), so the hands do exactly what keys 1-4 do. The world runs at
 * 1.0 throughout: the rack asks nothing of the clock.
 *
 * Dark violet glass #1E1A28 at 0.90, the lilac selection line over Orchil Deep, Chakra Petch labels, IBM Plex Mono
 * numerals (the style tokens of src/style.css). Nothing exists before Oro's hand-over (combat.gaff.owned); the DOM is
 * built once, on the first open. Per frame it reads numbers and touches the DOM only when the selection or a count
 * changes (0 bytes a frame while it is up and still).
 */
export const RACK_SECTORS = Object.freeze([
  Object.freeze({ id: 'bow', label: 'BOW', slot: 1 }),
  Object.freeze({ id: 'lance', label: 'LANCE', slot: 2 }),
  Object.freeze({ id: 'gaff', label: 'GAFF', slot: 3 }),
  Object.freeze({ id: 'pots', label: 'POTS', slot: 4 }),
  Object.freeze({ id: 'net', label: 'NET', slot: 0 }),
]);
/** The ring: its radius as a share of the screen's height, its band's width, the open fade (ms), mouse px per sector. */
export const RACK = Object.freeze({ radiusVh: 34, bandVh: 11, openMs: 90, pxPerSector: 70, tickDeg: 6 });

const NS = 'http://www.w3.org/2000/svg';
const POT_WORD = { brine: 'BRINE', cinder: 'CINDER', dust: 'DUST' };

const CSS = `
#cal-kitrack { position: fixed; right: 0; top: 50%; width: ${RACK.radiusVh}vh; height: ${RACK.radiusVh * 2}vh;
  transform: translate(2.5vh, -50%); opacity: 0; pointer-events: none; z-index: 40;
  transition: opacity ${RACK.openMs}ms linear, transform ${RACK.openMs}ms ease-out; }
#cal-kitrack.open { opacity: 1; transform: translate(0, -50%); }
#cal-kitrack svg { width: 100%; height: 100%; overflow: visible; display: block; }
#cal-kitrack .kr-sec { fill: rgba(var(--cal-glass-rgb, 30, 26, 40), var(--cal-glass-a-menu, 0.90)); stroke: var(--cal-glass-line, rgba(241,238,230,0.16)); stroke-width: 1; }
#cal-kitrack .kr-sec.sel { fill: var(--cal-select-fill, rgba(90, 46, 102, 0.60)); }
#cal-kitrack .kr-selline { fill: none; stroke: var(--cal-select-line, #D8CCE4); stroke-width: 2; }
#cal-kitrack .kr-tick { stroke: var(--cal-glass-tick, rgba(241,238,230,0.62)); stroke-width: 1; }
#cal-kitrack .kr-tick.major { stroke-width: 1.5; }
#cal-kitrack .kr-label { font-family: var(--cal-font-ui, 'Chakra Petch', sans-serif); font-weight: 600; letter-spacing: 0.12em;
  fill: var(--cal-glass-text, #F1EEE6); font-size: 6.5px; text-anchor: middle; dominant-baseline: middle; }
#cal-kitrack .kr-num { font-family: var(--cal-font-mono, 'IBM Plex Mono', monospace); fill: var(--cal-glass-text-2, rgba(241,238,230,0.66));
  font-size: 4.6px; text-anchor: middle; dominant-baseline: middle; }
#cal-kitrack .kr-empty .kr-label { fill: var(--cal-glass-text-2, rgba(241,238,230,0.66)); opacity: 0.55; }
#cal-kitrack .kr-empty .kr-num { opacity: 0.55; }
`;

/** An annular sector path (the ring's centre at (cx, cy), radii r0 < r1, from angle a0 to a1, deg, 0 = +x, y down). */
function sectorPath(cx, cy, r0, r1, a0, a1) {
  const p = (r, a) => `${(cx + r * Math.cos(a * Math.PI / 180)).toFixed(2)} ${(cy + r * Math.sin(a * Math.PI / 180)).toFixed(2)}`;
  const big = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${p(r1, a0)} A ${r1} ${r1} 0 ${big} 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 ${big} 0 ${p(r0, a0)} Z`;
}

export class KitRack {
  constructor(ctx, slots) {
    this.ctx = ctx;
    this.slots = slots;
    this.el = null;
    this.open = false;
    this.sel = 2;                // GAFF
    this.openedAt = -1;          // performance.now() of the last open (the page row reads it)
    this.opens = 0; this.taken = [];
    this._acc = 0;
    this._shown = -1;
    this._counts = ['', '', '', '', ''];
    this._earned = [false, false, false, false, false];
    this._bowN = -2; this._potKey = -2;
    this._tabWas = false;
  }

  /** The rack exists once Oro's kit is hers. */
  get earned() { return !!this.ctx.combat?.gaff?.owned; }

  /** Is sector `i` earned (something she owns)? */
  earnedSector(i) {
    const c = this.ctx.combat, id = RACK_SECTORS[i].id;
    if (id === 'bow') return !!c?.weapons?.some?.((w) => /bow|recurve/.test(w.id));
    if (id === 'lance') return !!c?.melee;
    if (id === 'gaff') return !!c?.gaff?.owned;
    if (id === 'pots') return !!c?.pots?.owned;
    return false;
  }

  _build() {
    if (this.el || typeof document === 'undefined') return;
    if (!document.getElementById('cal-kitrack-css')) {
      const st = document.createElement('style'); st.id = 'cal-kitrack-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.id = 'cal-kitrack';
    el.setAttribute('aria-hidden', 'true');
    // the SVG's own units: 100 wide, 200 high; the ring's centre on the right edge, mid-height
    const W = 100, H = 200, cx = W, cy = H / 2, r1 = 96, r0 = r1 - (RACK.bandVh / RACK.radiusVh) * 100;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMaxYMid meet');
    this._sec = []; this._lab = []; this._num = []; this._grp = [];
    const n = RACK_SECTORS.length, span = 180 / n;
    for (let i = 0; i < n; i++) {
      // top to bottom: angles from 270 (up) through 180 (left) to 90 (down), y down
      const a0 = 270 - i * span, a1 = a0 - span;
      const g = document.createElementNS(NS, 'g');
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', sectorPath(cx, cy, r0, r1, a1, a0));
      path.setAttribute('class', 'kr-sec');
      g.appendChild(path);
      const am = (a0 + a1) / 2, rm = (r0 + r1) / 2;
      const lx = cx + rm * Math.cos(am * Math.PI / 180), ly = cy + rm * Math.sin(am * Math.PI / 180);
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('class', 'kr-label'); t.setAttribute('x', lx.toFixed(2)); t.setAttribute('y', (ly - 4).toFixed(2));
      t.setAttribute('font-size', '8'); t.textContent = RACK_SECTORS[i].label;
      const c = document.createElementNS(NS, 'text');
      c.setAttribute('class', 'kr-num'); c.setAttribute('x', lx.toFixed(2)); c.setAttribute('y', (ly + 6).toFixed(2));
      c.setAttribute('font-size', '6'); c.textContent = '';
      g.appendChild(t); g.appendChild(c);
      svg.appendChild(g);
      this._sec.push(path); this._lab.push(t); this._num.push(c); this._grp.push(g);
    }
    // the protractor's rim, graduated every 6 deg (a longer tick every 30)
    for (let a = 90; a <= 270 + 1e-6; a += RACK.tickDeg) {
      const major = Math.round(a) % 30 === 0;
      const ra = r1 + 0.5, rb = r1 + (major ? 4.5 : 2.5);
      const l = document.createElementNS(NS, 'line');
      const ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180);
      l.setAttribute('x1', (cx + ra * ca).toFixed(2)); l.setAttribute('y1', (cy + ra * sa).toFixed(2));
      l.setAttribute('x2', (cx + rb * ca).toFixed(2)); l.setAttribute('y2', (cy + rb * sa).toFixed(2));
      l.setAttribute('class', major ? 'kr-tick major' : 'kr-tick');
      svg.appendChild(l);
    }
    // the selection's lilac line along the outer arc of the selected sector
    this._selLine = document.createElementNS(NS, 'path');
    this._selLine.setAttribute('class', 'kr-selline');
    svg.appendChild(this._selLine);
    this._geo = { cx, cy, r0, r1, span };
    el.appendChild(svg);
    (document.getElementById('hud') || document.body).appendChild(el);
    this.el = el;
  }

  _showSel() {
    if (this._shown === this.sel || !this.el) return;
    this._shown = this.sel;
    for (let i = 0; i < this._sec.length; i++) this._sec[i].classList.toggle('sel', i === this.sel);
    const { cx, cy, r1, span } = this._geo;
    const a0 = 270 - this.sel * span, a1 = a0 - span;
    const p = (a) => `${(cx + r1 * Math.cos(a * Math.PI / 180)).toFixed(2)} ${(cy + r1 * Math.sin(a * Math.PI / 180)).toFixed(2)}`;
    this._selLine.setAttribute('d', `M ${p(a1)} A ${r1} ${r1} 0 0 1 ${p(a0)}`);
  }

  /** The counts and the empty sectors: written at the open, and again only when a count changes (no string a frame). */
  _refresh(force = false) {
    const c = this.ctx.combat, K = c?.pots;
    const bowN = c?.ammo?.[c?.activeWeapon?.activeAmmo ?? 'hunter'] ?? -1;
    const potKey = K?.owned ? (K.belt.count.brine | 0) + 4 * (K.belt.count.cinder | 0) + 16 * (K.belt.count.dust | 0) + 64 * (K.belt.selected === 'brine' ? 0 : K.belt.selected === 'cinder' ? 1 : 2) : -1;
    if (!force && bowN === this._bowN && potKey === this._potKey) return;
    this._bowN = bowN; this._potKey = potKey;
    for (let i = 0; i < RACK_SECTORS.length; i++) {
      const id = RACK_SECTORS[i].id, earned = this._earned[i];
      let s;
      if (!earned) s = 'EMPTY';
      else if (id === 'bow') s = bowN >= 0 ? String(bowN) : '';
      else if (id === 'pots') s = `${POT_WORD[K.belt.selected] ?? ''} ${K.belt.count[K.belt.selected] ?? 0}/${K.belt.total}`;
      else s = '';
      if (s !== this._counts[i]) { this._counts[i] = s; this._num[i].textContent = s; }
      this._grp[i].classList.toggle('kr-empty', !earned);
    }
  }

  setOpen(on) {
    if (on === this.open) return;
    if (on && !this.earned) return;
    this._build();
    if (!this.el) return;
    this.open = on;
    if (on) {
      this.opens++; this.openedAt = typeof performance !== 'undefined' ? performance.now() : 0; this._acc = 0;
      this.sel = Math.max(0, Math.min(RACK_SECTORS.length - 1, (this.slots?.activeSlot ?? 3) - 1));
      for (let i = 0; i < RACK_SECTORS.length; i++) this._earned[i] = this.earnedSector(i);
      this._shown = -1; this._refresh(true); this._showSel();
    }
    this.el.classList.toggle('open', on);
    if (!on) this._take();
  }

  /** Let go: the selected sector through the quick slots (an empty one says so and does nothing). */
  _take() {
    const s = RACK_SECTORS[this.sel];
    this.taken.push(s.id); if (this.taken.length > 8) this.taken.shift();
    if (!s.slot || !this.earnedSector(this.sel)) { this.ctx.events?.emit?.('quick-slot-empty', { slot: s.slot, earns: s.id, rack: true }); return; }
    this.slots?.select?.(s.slot);
  }

  /** Each frame (the world's clock is not touched). */
  update() {
    const ctx = this.ctx, input = ctx.input;
    if (!input) return;
    const playing = ctx.state === 'playing' || ctx.params?.has?.('shot');
    const tab = playing && !!input.isDown?.('Tab');
    if (tab !== this._tabWas) { this._tabWas = tab; this.setOpen(tab); }
    if (!this.open) return;
    // the mouse's vertical travel moves the selection a sector per RACK.pxPerSector
    this._acc += input.mouse?.dy || 0;
    if (Math.abs(this._acc) >= RACK.pxPerSector) {
      const step = this._acc > 0 ? 1 : -1;
      this._acc -= step * RACK.pxPerSector;
      this.sel = Math.max(0, Math.min(RACK_SECTORS.length - 1, this.sel + step));
    }
    this._showSel();
    this._refresh();
  }

  /** The ring's box on screen (the page row: its centre's share of the width, KT11). */
  rect() {
    const r = this.el?.getBoundingClientRect?.();
    if (!r) return null;
    const w = typeof window !== 'undefined' ? window.innerWidth : 0;
    return { x: r.x, y: r.y, w: r.width, h: r.height, centreXK: w ? (r.x + r.width / 2) / w : null, open: this.open };
  }
}
