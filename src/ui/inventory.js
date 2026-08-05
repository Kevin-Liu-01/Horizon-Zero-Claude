import './inventory.css';
import { itemDef, ammoDef } from '../items/items.js';

/**
 * Inventory screen (I) + the loot take-all popup.
 *
 * The screen is a distinct game state ('inventory'): opening sets ctx.state,
 * exits pointer lock and freezes the world exactly like the pause menu;
 * closes on I / Esc / clicking outside the panel. Dark translucent HZD panel,
 * tabs RESOURCES / AMMO / VALUABLES, Rajdhani labels, thin borders, triangle
 * corner motifs (docs/research/ui.md §2/§5 — inventory screens carry a dark
 * forest-green tint).
 *
 * AMMO tab reads ctx.combat defensively: round-2 weapons contract
 * (combat.weapons[].ammoTypes + arrowCounts) when present, else the round-1
 * arrowCounts map — whatever landed, something correct renders.
 */

const TABS = [
  { id: 'resources', label: 'RESOURCES' },
  { id: 'ammo', label: 'AMMO' },
  { id: 'valuables', label: 'VALUABLES' },
];

function el(tag, cls, parent, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  if (parent) parent.appendChild(node);
  return node;
}

export class InventoryScreen {
  constructor(ctx) {
    this.ctx = ctx;
    this.tab = 'resources';
    this._open = false;

    this._build();
    this._bind();
  }

  _build() {
    // own root on <body>: #hud belongs to the HUD builder
    this.root = el('div', 'hzc-inv', document.body);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close(); // click-outside resumes
    });

    const panel = el('div', 'hzc-inv-panel', this.root);
    // triangle corner motifs
    for (const c of ['tl', 'tr', 'bl', 'br']) el('i', `hzc-inv-corner ${c}`, panel);

    const head = el('div', 'hzc-inv-head', panel);
    el('div', 'hzc-inv-kicker', head, 'SATCHEL');
    el('div', 'hzc-inv-title', head, 'INVENTORY');

    this._tabsEl = el('div', 'hzc-inv-tabs', panel);
    this._tabBtns = new Map();
    for (const t of TABS) {
      const b = el('button', 'hzc-inv-tab', this._tabsEl, t.label);
      b.addEventListener('click', () => { this.tab = t.id; this._render(); });
      this._tabBtns.set(t.id, b);
    }

    this._bodyEl = el('div', 'hzc-inv-body', panel);
    el('div', 'hzc-inv-foot', panel,
      '<kbd>I</kbd> / <kbd>ESC</kbd> RESUME&ensp;·&ensp;CLICK OUTSIDE TO CLOSE');
  }

  _bind() {
    const ctx = this.ctx;
    ctx.input.onDown('KeyI', () => {
      if (ctx.state === 'inventory') this.close();
      else if (ctx.state === 'playing' && !ctx.wheel?.open) this.open();
    });
    // Esc: defer past the HUD's synchronous pause handler (it checks state
    // in the same keydown pass; while we're still 'inventory' it stays inert)
    ctx.input.onDown('Escape', () => {
      if (ctx.state === 'inventory') queueMicrotask(() => this.close());
    });
    // any endgame overlay steals the screen
    ctx.events.on('victory', () => this._hide());
    ctx.events.on('player-died', () => this._hide());
  }

  open() {
    const ctx = this.ctx;
    if (ctx.state !== 'playing') return;
    ctx.state = 'inventory';
    this._open = true;
    this.root.classList.add('show');
    ctx.input.exitPointerLock();
    this._render();
    ctx.events.emit('inventory-open');
  }

  close() {
    const ctx = this.ctx;
    if (ctx.state !== 'inventory') { this._hide(); return; }
    ctx.state = 'playing';
    this._hide();
    if (!ctx.params.has('shot')) ctx.input.requestPointerLock();
    ctx.events.emit('inventory-close');
  }

  _hide() {
    this._open = false;
    this.root.classList.remove('show');
  }

  /* -------------------------------- render ------------------------------ */

  _render() {
    for (const [id, b] of this._tabBtns) {
      b.classList.toggle('active', id === this.tab);
    }
    const body = this._bodyEl;
    body.innerHTML = '';
    if (this.tab === 'resources') this._renderResources(body);
    else if (this.tab === 'ammo') this._renderAmmo(body);
    else this._renderValuables(body);
  }

  _row(parent, glyph, color, name, count, active = false) {
    const r = el('div', 'hzc-inv-row' + (active ? ' active' : ''), parent);
    const g = el('span', 'hzc-inv-glyph', r, glyph);
    g.style.color = color;
    el('span', 'hzc-inv-name', r, name);
    el('span', 'hzc-inv-count', r,
      count === Infinity ? '∞' : count == null ? '—' : String(count));
    return r;
  }

  _empty(parent, text) {
    el('div', 'hzc-inv-empty', parent, text);
  }

  _renderResources(body) {
    // medicine pouch meter (herbs fill the pouch, not the satchel)
    const p = this.ctx.player;
    if (p) {
      const pouch = el('div', 'hzc-inv-pouch', body);
      el('span', 'hzc-inv-pouch-label', pouch, 'MEDICINE POUCH');
      const bar = el('div', 'hzc-inv-pouch-bar', pouch);
      const fill = el('div', 'hzc-inv-pouch-fill', bar);
      const frac = Math.max(0, Math.min(1, (p.pouch ?? 0) / (p.maxPouch || 100)));
      fill.style.width = `${Math.round(frac * 100)}%`;
      el('span', 'hzc-inv-pouch-num', pouch,
        `${Math.round(p.pouch ?? 0)} / ${p.maxPouch ?? 100}`);
    }
    const items = this.ctx.inventory?.items?.('resource') ?? [];
    if (!items.length) { this._empty(body, 'SATCHEL EMPTY'); return; }
    for (const it of items) {
      this._row(body, it.def.glyph, it.def.color, it.def.name.toUpperCase(), it.count);
    }
  }

  _renderValuables(body) {
    const items = this.ctx.inventory?.items?.('valuable') ?? [];
    if (!items.length) {
      this._empty(body, 'NO VALUABLES — MACHINE LENSES AND HEARTS APPEAR HERE');
      return;
    }
    for (const it of items) {
      this._row(body, it.def.glyph, it.def.color, it.def.name.toUpperCase(), it.count);
    }
  }

  _renderAmmo(body) {
    const c = this.ctx.combat;
    const counts = (c && typeof c.arrowCounts === 'object' && c.arrowCounts) || {};
    let rendered = 0;

    if (Array.isArray(c?.weapons) && c.weapons.length) {
      for (const w of c.weapons) {
        if (!w) continue;
        el('div', 'hzc-inv-group', body,
          String(w.name ?? w.id ?? 'WEAPON').toUpperCase());
        const ammoTypes = Array.isArray(w.ammoTypes) ? w.ammoTypes : [];
        for (const a of ammoTypes) {
          const id = typeof a === 'string' ? a : a?.id;
          if (!id) continue;
          const def = ammoDef(id);
          let n = counts[id];
          if (n == null && typeof a === 'object') n = a.count ?? a.n ?? null;
          const active = (w.activeAmmo ?? c.activeAmmo) === id
            && (c.activeWeapon === w || c.activeWeapon === w.id);
          this._row(body, def.glyph, def.color,
            String((typeof a === 'object' && a.name) || def.name).toUpperCase(),
            n, active);
          rendered++;
        }
      }
    }
    if (!rendered) {
      // round-1 combat fallback: flat arrowCounts map
      const keys = Object.keys(counts);
      for (const id of keys) {
        const def = ammoDef(id);
        this._row(body, def.glyph, def.color, def.name.toUpperCase(),
          counts[id], c?.arrowType === id);
        rendered++;
      }
    }
    if (!rendered) this._empty(body, 'QUIVER DATA UNAVAILABLE');
  }

  update(dt, t) {
    // world is frozen while open outside shot mode; keep live in shot mode
    if (this._open && this.ctx.params.has('shot')) {
      // no-op: content is static; re-render only on demand
    }
  }
}

/* ------------------------------------------------------------------------ */

/**
 * Small take-all loot popup (docs/research/mechanics.md §5: compact list of
 * icon + name + count; HFW-style auto take-all streamline). Shown by
 * interactables whenever an entry with a loot table is opened.
 */
export class LootPopup {
  constructor() {
    this.root = el('div', 'hzc-loot', document.body);
    this._kicker = el('div', 'hzc-loot-kicker', this.root, 'LOOT');
    this._rows = el('div', 'hzc-loot-rows', this.root);
    this._foot = el('div', 'hzc-loot-foot', this.root, 'TAKE ALL — AUTO');
    this._timer = 0;
  }

  show(rows, label = 'LOOT') {
    this._kicker.textContent = label === 'GATHER' ? 'GATHERED' : label;
    this._rows.innerHTML = '';
    for (const r of rows) {
      const def = itemDef(r.id);
      const row = el('div', 'hzc-loot-row', this._rows);
      const g = el('span', 'hzc-loot-glyph', row, def.glyph);
      g.style.color = def.color;
      el('span', 'hzc-loot-name', row, def.name.toUpperCase());
      el('span', 'hzc-loot-n', row, `×${r.n ?? 1}`);
    }
    this._foot.textContent = 'TAKE ALL — AUTO';
    this._pop();
  }

  /** Single-line variant (weapon pickups, hints). */
  showText(id, text) {
    const def = itemDef(id);
    this._kicker.textContent = 'FIELD STRIP';
    this._rows.innerHTML = '';
    const row = el('div', 'hzc-loot-row', this._rows);
    const g = el('span', 'hzc-loot-glyph', row, def.glyph);
    g.style.color = def.color;
    el('span', 'hzc-loot-name', row, def.name.toUpperCase());
    this._foot.textContent = text;
    this._pop();
  }

  _pop() {
    this._timer = 2.8;
    this.root.classList.remove('show');
    void this.root.offsetWidth; // restart the slide-in animation
    this.root.classList.add('show');
  }

  update(dt) {
    if (this._timer > 0) {
      this._timer -= dt;
      if (this._timer <= 0) this.root.classList.remove('show');
    }
  }
}
