import * as THREE from 'three';
import './inventory.css';
import { itemDef, ammoDef, rarityDef, POCKETS } from '../items/items.js';
import { fieldWord } from './tips.js';

/* Reused vectors for the loot-popup projection — no per-frame allocation. */
const _lootV = new THREE.Vector3();
const _lootD = new THREE.Vector3();
const _lootF = new THREE.Vector3();

/**
 * THE SATCHEL + THE TAKE-ALL POPUP  —  lane `shell-ui` (bible §9.7; armory takes the
 * equip panel at W3 under its grant)
 * ===========================================================================
 * A field-book page: pocket index down the margin, a grid of specimen cards, a
 * detail column. Ink on paper, every item a one-weight engraved mark (`itemIcon`),
 * rarity as an ink colour on the card's edge.
 *
 * The screen is a distinct game state ('inventory'): opening sets ctx.state, exits
 * pointer lock and freezes the world exactly like the hub; closes on I / Esc /
 * clicking outside the panel. Opened from the hub it sits in the hub's page body and
 * the hub keeps the margin (see `body.cal-hub-open` in inventory.css).
 *
 * AMMO reads ctx.combat defensively; CRAFTING lists ammo recipes live from combat.
 * Item names go through `fieldWord` (tips.js) until combat-kit renames the catalogue
 * at W2.
 *
 * PUBLISHED: `itemIcon(id)` -> inline SVG (currentColor); `itemPlayerName(id, fallback)`;
 * `LOOT_POPUP` (the popup registry the HUD's toast suppression reads, gate A10).
 */

/* ------------------------------- engraved item marks --------------------------- */

const L = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="square" stroke-linejoin="miter"';
const F = 'fill="currentColor"';
const MARKS = {
  salt: `<path ${L} d="M12 2.5 20 8v8l-8 5.5L4 16V8Z"/><path ${L} d="M4 8l8 5 8-5M12 13v8.5"/>`,
  juniper: `<path ${L} d="M4 19 17 6"/><path ${L} d="M8 21 20 9"/><path ${L} d="M14 5l5 5M4 15l5 5"/>`,
  resin: `<path ${F} d="M12 2c1 4.4 5.6 7 5.6 12a5.6 5.6 0 0 1-11.2 0c0-2.8 1.6-4.4 2.4-6.6 1 1.4 1.6 2.8 1.8 4.2 1-2.6.2-6.4 1.4-9.6Z"/>`,
  brine: `<path ${L} d="M12 3c3 5 6.5 8 6.5 12a6.5 6.5 0 0 1-13 0C5.5 11 9 8 12 3Z"/><path ${L} d="M8.5 15.5a3.5 3.5 0 0 0 3.5 3"/>`,
  dust: `<rect ${L} x="6.5" y="4" width="11" height="17"/><path ${L} d="M6.5 8.5h11M6.5 12.5h11M6.5 16.5h11M9.5 4V2h5v2"/>`,
  cord: `<path ${L} d="M3 8c3-3 6-3 9 0s6 3 9 0M3 16c3-3 6-3 9 0s6 3 9 0"/>`,
  lampglass: `<circle ${L} cx="12" cy="12" r="8.5"/><circle ${F} cx="12" cy="12" r="3.4"/><path ${L} d="M12 1.5v2M12 20.5v2M1.5 12h2M20.5 12h2"/>`,
  escapement: `<circle ${L} cx="12" cy="12" r="6.5"/><circle ${F} cx="12" cy="12" r="1.7"/><path ${L} d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22M4.9 4.9l2.5 2.5M16.6 16.6l2.5 2.5M19.1 4.9l-2.5 2.5M7.4 16.6l-2.5 2.5"/>`,
  gourd: `<path ${L} d="M10.5 2.5h3v4c0 1.2 1 1.8 2 2.6 2.2 1.8 3 4 3 6.2a6.5 6.5 0 0 1-13 0c0-2.2.8-4.4 3-6.2 1-.8 2-1.4 2-2.6Z"/><path ${L} d="M6 14h12"/>`,
  pot: `<path ${L} d="M9 3h6l-1 3.5c4 1.2 5.5 5 5 8.5-.4 2.8-2 5-3.5 6h-7C7 20 5.400 17.800 5 15c-.5-3.500 1-7.300 5-8.500Z"/><path ${L} d="M6 12.500h12"/>`,
  arrow: `<path ${L} d="M12 22V4"/><path ${F} d="M12 1l4 7h-8Z"/><path ${L} d="M8.500 22l3.500-3.500 3.500 3.500M8.500 18.500 12 15l3.500 3.500"/>`,
  barbed: `<path ${L} d="M12 22V6"/><path ${F} d="M12 1l5 9-5-2.500L7 10Z"/><path ${L} d="M8.500 22l3.500-3.500 3.500 3.500"/>`,
  trap: `<path ${L} d="M3 19h18M6 19v-6M18 19v-6M6 13l6-5 6 5"/><path ${L} d="M12 8V3"/>`,
  rock: `<path ${L} d="M4 16 8 6l9-1.500L21 13l-5 7.500-9-.5Z"/><path ${L} d="M8 6l3.500 7L21 13M11.500 13 7 20"/>`,
  ceramic: `<path ${L} d="M3 18 12 4l9 14Z"/><path ${L} d="M8 18l4-7 4 7"/>`,
  book: `<path ${L} d="M4 3h13l3 3v15H4Z"/><path ${L} d="M8 3v18M11 8h6M11 12h6M11 16h4"/>`,
  mark: `<path ${L} d="M12 3l9 9-9 9-9-9Z"/>`,
};
const markKey = (id) => {
  const s = String(id ?? '');
  if (/shard|salt/.test(s)) return 'salt';
  if (/wood|juniper/.test(s)) return 'juniper';
  if (/blaze|resin|cinder|fire/.test(s)) return 'resin';
  if (/chill|brine|freeze/.test(s)) return 'brine';
  if (/spark|dust|shock/.test(s)) return 'dust';
  if (/wire|cord|cable|rope/.test(s)) return 'cord';
  if (/lens|lampglass/.test(s)) return 'lampglass';
  if (/heart|core|escapement/.test(s)) return 'escapement';
  if (/herb|moss|root|gourd|potion|flask|draught|medic/.test(s)) return 'gourd';
  if (/blast|pot|paste/.test(s)) return 'pot';
  if (/trap/.test(s)) return 'trap';
  if (/rock/.test(s)) return 'rock';
  if (/shell|ceramic/.test(s)) return 'ceramic';
  if (/hardpoint|tear|barbed/.test(s)) return 'barbed';
  if (/hunter|reed|precision|sighting|arrow/.test(s)) return 'arrow';
  return 'mark';
};
const iconSvg = (key) => `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${MARKS[key] ?? MARKS.mark}</svg>`;

/** An item's engraved mark, inline SVG in currentColor. */
export function itemIcon(id) { return iconSvg(markKey(id)); }

/** An item's name in the player's words. */
export function itemPlayerName(id, fallback) { return fieldWord(fallback ?? itemDef(id).name); }

/** Rarity, as an ink on paper (the catalogue's colours were chosen for a dark panel). */
const RAR_INK = {
  common: 'var(--cal-ink-62)', uncommon: 'var(--cal-verdigris)', rare: 'var(--cal-cobalt)',
  veryRare: 'var(--cal-carmine)', legendary: 'var(--cal-brass)',
};
const rarInk = (rar) => RAR_INK[rar?.id] ?? RAR_INK.common;

const CURRENCY = 'metal-shards';

/** Pocket index marks (the catalogue's glyphs are outside the latin subset). */
const POCKET_MARK = { resources: 'salt', ammo: 'arrow', tools: 'trap', valuables: 'lampglass', crafting: 'escapement', notebook: 'book', trade: 'cord' };
const POCKET_WORD = { resources: 'STORES', ammo: 'QUIVER', tools: 'TOOLS', valuables: 'SALVAGE', crafting: 'MAKING', notebook: 'FIELD BOOKS', trade: 'TRADE' };

function el(tag, cls, parent, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  if (parent) parent.appendChild(node);
  return node;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export class InventoryScreen {
  constructor(ctx) {
    this.ctx = ctx;
    this.pocket = 'resources';
    this._open = false;
    this._selected = null;      // { kind:'item'|'ammo'|'record', id }
    this._build();
    this._bind();
  }

  get isOpen() { return this._open; }

  /* ------------------------------------------------------------ structure */

  _build() {
    // own root on <body>: #hud belongs to the HUD lane
    this.root = el('div', 'cal-inv', document.body);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close(); // click-outside resumes
    });

    const shell = el('div', 'cal-inv-shell cal-page', this.root);

    const head = el('div', 'cal-inv-head', shell);
    const title = el('div', 'cal-inv-titles', head);
    el('div', 'cal-inv-title', title, 'SATCHEL');
    this._shardsEl = el('div', 'cal-inv-shards', head, '');

    const cols = el('div', 'cal-inv-cols', shell);

    // --- left rail: pockets
    this._railEl = el('nav', 'cal-inv-rail', cols);
    this._railBtns = new Map();
    for (const p of POCKETS) {
      const b = el('button', 'cal-inv-pocket', this._railEl,
        `<i class="cal-inv-pglyph">${iconSvg(POCKET_MARK[p.id])}</i>`
        + `<span class="cal-inv-plabel">${POCKET_WORD[p.id] ?? p.label}</span>`
        + '<span class="cal-inv-pcount"></span>');
      b.addEventListener('click', () => { this.pocket = p.id; this._selected = null; this._render(); });
      this._railBtns.set(p.id, b);
    }

    // --- middle: the pocket body
    const main = el('section', 'cal-inv-main', cols);
    this._capEl = el('div', 'cal-inv-cap', main);
    this._bodyEl = el('div', 'cal-inv-body', main);

    // --- right: detail pane
    this._detailEl = el('aside', 'cal-inv-detail', cols);

    el('div', 'cal-inv-foot', shell,
      '<span><kbd>I</kbd> / <kbd>ESC</kbd> close the satchel</span>'
      + '<span>A pocket to switch · an item to read it</span>');
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
    // live-refresh while open so a craft/upgrade/trade shows immediately
    for (const ev of ['item-gained', 'item-crafted', 'capacity-upgraded',
      'ammo-crafted', 'trade-buy', 'trade-sell', 'datapoint-collected']) {
      ctx.events.on(ev, () => { if (this._open) this._render(); });
    }
  }

  /* ------------------------------------------------------------- open/close */

  open(pocket) {
    const ctx = this.ctx;
    if (pocket && POCKETS.some((p) => p.id === pocket)) this.pocket = pocket;
    if (ctx.state !== 'playing' && ctx.state !== 'inventory') return false;
    ctx.state = 'inventory';
    this._open = true;
    this.root.classList.add('show');
    ctx.input.exitPointerLock();
    this._render();
    ctx.events.emit('inventory-open', { pocket: this.pocket });
    return true;
  }

  /** Datapoint pickup / Notebook key: open straight onto a record. */
  openNotebook(id) {
    if (id) this._selected = { kind: 'record', id };
    return this.open('notebook');
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

  /* -------------------------------------------------------------- render */

  _render() {
    const inv = this.ctx.inventory;
    const items = this.ctx.items;
    for (const [id, b] of this._railBtns) b.classList.toggle('active', id === this.pocket);

    // salt, top-right: salt IS the currency
    const salt = inv?.count?.(CURRENCY) ?? 0;
    this._shardsEl.innerHTML =
      `<i>${iconSvg('salt')}</i><span>${String(salt).padStart(3, '0')}</span><em>SALT</em>`;

    // pocket badge counts
    for (const p of POCKETS) {
      const b = this._railBtns.get(p.id);
      const badge = b?.lastElementChild;
      if (!badge) continue;
      if (p.category && p.category !== 'ammo') {
        badge.textContent = String((inv?.items?.(p.category) ?? []).length || '');
      } else if (p.id === 'notebook') {
        const dp = items?.datapoints;
        badge.textContent = dp ? `${dp.count}/${dp.total}` : '';
      } else badge.textContent = '';
    }

    this._capEl.innerHTML = '';
    this._bodyEl.innerHTML = '';
    this._detailEl.innerHTML = '';

    switch (this.pocket) {
      case 'ammo': this._renderAmmo(); break;
      case 'tools': this._renderPocket('tool', 'tools'); break;
      case 'valuables': this._renderPocket('valuable', 'valuables'); break;
      case 'crafting': this._renderCrafting(); break;
      case 'notebook': this._renderNotebook(); break;
      case 'trade': this._renderTrade(); break;
      default: this._renderPocket('resource', 'resources'); break;
    }
  }

  /* ---------------------------------------------------- capacity header */

  _capacityHeader(pocketId) {
    const items = this.ctx.items;
    if (!items?.upgradeCost) return;
    const def = items.POCKETS?.[pocketId];
    const tier = items.capacityTier(pocketId);
    const cost = items.upgradeCost(pocketId);
    const bar = el('div', 'cal-cap', this._capEl);
    el('span', 'cal-cap-label', bar, def?.label ?? 'CAPACITY');
    const pips = el('span', 'cal-cap-pips', bar);
    for (let i = 0; i < 3; i++) el('i', i < tier ? 'on' : '', pips);
    el('span', 'cal-cap-tier', bar, tier ? `TIER ${tier}` : 'BASE');

    if (!cost) { el('span', 'cal-cap-max', bar, 'FULLY UPGRADED'); return; }
    const can = items.canUpgrade(pocketId);
    const b = el('button', `cal-cap-up${can.ok ? '' : ' off'}`, bar,
      `UPGRADE · <i>${iconSvg('salt')}</i>${cost.shards}`
      + cost.items.map(([id, n]) => ` · <i>${itemIcon(id)}</i>${n}`).join(''));
    b.title = can.ok ? `Raise every cap in this pocket to ×${cost.mult}` : can.reason;
    b.addEventListener('click', () => {
      if (items.upgradeCapacity(pocketId)) this._render();
      else this._flash(b, can.reason);
    });
  }

  _flash(node, text) {
    if (!node) return;
    node.classList.add('deny');
    const old = node.dataset.old ?? node.innerHTML;
    node.dataset.old = old;
    node.textContent = text ?? 'CANNOT';
    setTimeout(() => {
      node.classList.remove('deny');
      node.innerHTML = node.dataset.old ?? old;
    }, 900);
  }

  /* ------------------------------------------------------- item pockets */

  _renderPocket(category, pocketId) {
    this._capacityHeader(pocketId);
    const inv = this.ctx.inventory;
    const rows = inv?.items?.(category) ?? [];

    // the gourd belongs at the top of STORES: every fog-water plant here feeds it
    if (category === 'resource') this._pouchMeter();

    if (!rows.length) {
      this._empty(category === 'valuable'
        ? 'Nothing salvaged yet. Lampglass and escapements collect here.'
        : category === 'tool'
          ? 'No tools. Make them in the Making pocket.'
          : 'The satchel is empty.');
      this._detailHint();
      return;
    }

    const grid = el('div', 'cal-grid', this._bodyEl);
    let first = null;
    for (const r of rows) {
      const card = this._itemCard(grid, r.id, r.count, r.cap);
      if (!first) first = { kind: 'item', id: r.id };
      card.addEventListener('click', () => {
        this._selected = { kind: 'item', id: r.id };
        this._render();
      });
      if (this._selected?.kind === 'item' && this._selected.id === r.id) {
        card.classList.add('sel');
      }
    }
    if (!this._selected || this._selected.kind !== 'item'
      || !rows.some((r) => r.id === this._selected.id)) {
      this._selected = first;
      grid.firstElementChild?.classList.add('sel');
    }
    this._detailItem(this._selected.id);
  }

  _itemCard(parent, id, count, cap) {
    const def = itemDef(id);
    const rar = rarityDef(def.rarity);
    const card = el('button', `cal-card r-${rar.id}`, parent);
    card.style.setProperty('--rar', rarInk(rar));
    el('i', 'cal-card-glyph', card, itemIcon(id));
    el('span', 'cal-card-name', card, esc(fieldWord(def.name).toUpperCase()));
    el('span', 'cal-card-n', card, String(count));
    if (cap) {
      const bar = el('span', 'cal-card-bar', card);
      const fill = el('i', '', bar);
      const frac = Math.min(1, count / cap);
      fill.style.width = `${Math.round(frac * 100)}%`;
      if (frac >= 1) card.classList.add('full');
    }
    return card;
  }

  _pouchMeter() {
    const p = this.ctx.player;
    if (!p) return;
    const pouch = el('div', 'cal-pouch', this._bodyEl);
    el('span', 'cal-pouch-label', pouch, 'FOG-WATER GOURD');
    const bar = el('div', 'cal-pouch-bar', pouch);
    const fill = el('div', 'cal-pouch-fill', bar);
    const frac = Math.max(0, Math.min(1, (p.gourd ?? 0) / (p.maxGourd || 100)));
    fill.style.width = `${Math.round(frac * 100)}%`;
    el('span', 'cal-pouch-num', pouch,
      `${Math.round(p.gourd ?? 0)} / ${Math.round(p.maxGourd ?? 100)}`);
  }

  _empty(text) { el('div', 'cal-inv-empty', this._bodyEl, text); }

  /* --------------------------------------------------------- detail pane */

  _detailHint() {
    el('div', 'cal-det-hint', this._detailEl, 'Nothing selected.');
  }

  _detailItem(id) {
    const inv = this.ctx.inventory;
    const items = this.ctx.items;
    const def = itemDef(id);
    const rar = rarityDef(def.rarity);
    const d = this._detailEl;
    d.style.setProperty('--rar', rarInk(rar));
    el('div', 'cal-det-rar', d, rar.name);
    const head = el('div', 'cal-det-head', d);
    el('i', 'cal-det-glyph', head, itemIcon(id));
    el('span', 'cal-det-name', head, esc(fieldWord(def.name).toUpperCase()));
    el('p', 'cal-det-desc', d, esc(fieldWord(def.desc ?? '')));

    const cap = items?.capacity ? items.capacity(id) : (def.cap ?? 0);
    const have = inv?.count?.(id) ?? 0;
    const stats = el('div', 'cal-det-stats', d);
    this._stat(stats, 'CARRIED', `${have} / ${cap}`);
    this._stat(stats, 'POCKET',
      (items?.POCKETS?.[items.pocketOf(id)]?.label) ?? 'SATCHEL');
    if (def.pouch) this._stat(stats, 'RESTORES', `${def.pouch} GOURD`);
    if (def.value) this._stat(stats, 'VALUE', `${def.value} SALT EACH`);

    const bar = el('div', 'cal-det-bar', d);
    const fill = el('i', '', bar);
    fill.style.width = `${Math.round(Math.min(1, cap ? have / cap : 0) * 100)}%`;

    // tools are usable straight out of the pocket
    const tools = items?.tools;
    if (def.category === 'tool' && tools) {
      const i = tools.slots.findIndex((s) => s.id === id);
      if (i >= 0) {
        const b = el('button', 'cal-det-act', d,
          `EQUIP TO SLOT ${i + 1} · <kbd>${tools.useKey.replace('Key', '')}</kbd> USE`);
        b.addEventListener('click', () => { tools.select(i); this._render(); });
        if (tools.index === i) { b.classList.add('on'); b.textContent = 'EQUIPPED'; }
      }
    }
  }

  _stat(parent, k, v) {
    const row = el('div', 'cal-det-stat', parent);
    el('span', 'k', row, k);
    el('span', 'v', row, String(v));
  }

  /* ---------------------------------------------------------------- ammo */

  _renderAmmo() {
    const c = this.ctx.combat;
    const counts = (c && (c.ammo || c.arrowCounts)) || {};
    let grid = el('div', 'cal-grid', this._bodyEl);
    let rendered = 0;
    let first = null;

    const push = (id, n, active, name) => {
      const def = ammoDef(id);
      const rar = rarityDef(def.rarity);
      const card = el('button', `cal-card r-${rar.id}${active ? ' active' : ''}`, grid);
      card.style.setProperty('--rar', rarInk(rar));
      el('i', 'cal-card-glyph', card, itemIcon(id));
      el('span', 'cal-card-name', card, esc(fieldWord(name ?? def.name).toUpperCase()));
      el('span', 'cal-card-n', card, n == null ? '—' : String(n));
      card.addEventListener('click', () => {
        this._selected = { kind: 'ammo', id }; this._render();
      });
      if (this._selected?.kind === 'ammo' && this._selected.id === id) card.classList.add('sel');
      if (!first) first = id;
      rendered++;
    };

    if (Array.isArray(c?.weapons) && c.weapons.length) {
      for (const w of c.weapons) {
        if (!w) continue;
        el('div', 'cal-inv-group', this._bodyEl,
          esc(fieldWord(String(w.name ?? w.id ?? 'WEAPON')).toUpperCase()));
        // each weapon gets its OWN grid: reusing one node moved every card
        // under the last header instead of grouping them by weapon
        grid = el('div', 'cal-grid', this._bodyEl);
        for (const a of (Array.isArray(w.ammoTypes) ? w.ammoTypes : [])) {
          const id = typeof a === 'string' ? a : a?.id;
          if (!id) continue;
          let n = counts[id];
          if (n == null && typeof a === 'object') n = a.count ?? a.n ?? null;
          const active = (w.activeAmmo ?? c.activeAmmo) === id
            && (c.activeWeapon === w || c.activeWeapon === w.id);
          push(id, n, active, typeof a === 'object' ? a.name : null);
        }
      }
    }
    if (!rendered) {
      for (const id of Object.keys(counts)) push(id, counts[id], c?.arrowType === id);
    }
    if (!rendered) { this._empty('The quiver is empty.'); this._detailHint(); return; }

    const sel = this._selected?.kind === 'ammo' ? this._selected.id : first;
    this._selected = { kind: 'ammo', id: sel };
    this._detailAmmo(sel, counts);
  }

  _detailAmmo(id, counts) {
    const c = this.ctx.combat;
    const def = ammoDef(id);
    const rar = rarityDef(def.rarity);
    const d = this._detailEl;
    d.style.setProperty('--rar', rarInk(rar));
    el('div', 'cal-det-rar', d, rar.name);
    const head = el('div', 'cal-det-head', d);
    el('i', 'cal-det-glyph', head, itemIcon(id));
    el('span', 'cal-det-name', head, esc(fieldWord(def.name).toUpperCase()));
    const stats = el('div', 'cal-det-stats', d);
    this._stat(stats, 'IN QUIVER', String(counts?.[id] ?? '—'));
    const status = typeof c?.recipeStatus === 'function' ? c.recipeStatus(id) : null;
    if (Array.isArray(status) && status.length) {
      el('div', 'cal-det-sub', d, 'MADE FROM');
      const list = el('div', 'cal-recipe', d);
      for (const r of status) {
        const rd = itemDef(r.id);
        const row = el('div', `cal-recipe-row${r.ok ? '' : ' short'}`, list);
        el('i', '', row, itemIcon(r.id));
        el('span', 'n', row, esc(fieldWord(rd.name).toUpperCase()));
        el('span', 'c', row, `${r.have} / ${r.need}`);
      }
      const ok = typeof c?.canCraft === 'function' ? c.canCraft(id) : false;
      const b = el('button', `cal-det-act${ok ? '' : ' off'}`, d, 'MAKE');
      b.addEventListener('click', () => {
        if (c?.craftAmmo?.(id)) this._render();
        else this._flash(b, fieldWord(c?.craftBlocker?.(id) ?? 'CANNOT MAKE'));
      });
    } else {
      el('p', 'cal-det-desc', d, 'Found, not made. Instruments carry it; you take it.');
    }
  }

  /* ------------------------------------------------------------ crafting */

  _renderCrafting() {
    const items = this.ctx.items;
    const combat = this.ctx.combat;
    el('div', 'cal-cap-title', this._capEl, 'MAKING: FROM WHAT THE SATCHEL HOLDS');

    // 1) tools & draughts
    el('div', 'cal-inv-group', this._bodyEl, 'TOOLS & DRAUGHTS');
    const gridA = el('div', 'cal-grid', this._bodyEl);
    let first = null;
    for (const r of (items?.recipes?.() ?? [])) {
      const ok = items.canCraft(r.id);
      const card = this._itemCard(gridA, r.id,
        this.ctx.inventory?.count?.(r.id) ?? 0, items.capacity(r.id));
      card.classList.toggle('craftable', ok);
      card.addEventListener('click', () => {
        this._selected = { kind: 'recipe', id: r.id }; this._render();
      });
      if (this._selected?.kind === 'recipe' && this._selected.id === r.id) card.classList.add('sel');
      if (!first) first = { kind: 'recipe', id: r.id };
    }

    // 2) ammo recipes, live from combat
    const ammoIds = [];
    if (Array.isArray(combat?.weapons)) {
      for (const w of combat.weapons) {
        for (const a of (Array.isArray(w?.ammoTypes) ? w.ammoTypes : [])) {
          const id = typeof a === 'string' ? a : a?.id;
          if (id && !ammoIds.includes(id)
            && (combat.recipeStatus?.(id) ?? []).length) ammoIds.push(id);
        }
      }
    }
    if (ammoIds.length) {
      el('div', 'cal-inv-group', this._bodyEl, 'AMMUNITION');
      const gridB = el('div', 'cal-grid', this._bodyEl);
      for (const id of ammoIds) {
        const def = ammoDef(id);
        const rar = rarityDef(def.rarity);
        const card = el('button', `cal-card r-${rar.id}`, gridB);
        card.style.setProperty('--rar', rarInk(rar));
        el('i', 'cal-card-glyph', card, itemIcon(id));
        el('span', 'cal-card-name', card, esc(fieldWord(def.name).toUpperCase()));
        el('span', 'cal-card-n', card, String(combat.ammo?.[id] ?? 0));
        card.classList.toggle('craftable', !!combat.canCraft?.(id));
        card.addEventListener('click', () => {
          this._selected = { kind: 'ammo', id }; this._render();
        });
        if (this._selected?.kind === 'ammo' && this._selected.id === id) card.classList.add('sel');
        if (!first) first = { kind: 'ammo', id };
      }
    }

    // 3) capacity upgrades — every pocket, in one place
    el('div', 'cal-inv-group', this._bodyEl, 'CARRY CAPACITY');
    const caps = el('div', 'cal-caps', this._bodyEl);
    for (const [pid, pdef] of Object.entries(items?.POCKETS ?? {})) {
      const tier = items.capacityTier(pid);
      const cost = items.upgradeCost(pid);
      const row = el('div', 'cal-caps-row', caps);
      el('span', 'cal-caps-name', row, pdef.label);
      const pips = el('span', 'cal-cap-pips', row);
      for (let i = 0; i < 3; i++) el('i', i < tier ? 'on' : '', pips);
      if (!cost) { el('span', 'cal-cap-max', row, 'MAX'); continue; }
      const can = items.canUpgrade(pid);
      const b = el('button', `cal-cap-up${can.ok ? '' : ' off'}`, row,
        `×${cost.mult} · <i>${iconSvg('salt')}</i>${cost.shards}`
        + cost.items.map(([id, n]) => ` · <i>${itemIcon(id)}</i>${n}`).join(''));
      b.addEventListener('click', () => {
        if (items.upgradeCapacity(pid)) this._render();
        else this._flash(b, can.reason);
      });
    }

    if (!this._selected || !['recipe', 'ammo'].includes(this._selected.kind)) {
      this._selected = first;
    }
    if (!this._selected) { this._detailHint(); return; }
    if (this._selected.kind === 'ammo') {
      this._detailAmmo(this._selected.id, combat?.ammo ?? combat?.arrowCounts ?? {});
    } else this._detailRecipe(this._selected.id);
  }

  _detailRecipe(id) {
    const items = this.ctx.items;
    const def = itemDef(id);
    const rar = rarityDef(def.rarity);
    const d = this._detailEl;
    d.style.setProperty('--rar', rarInk(rar));
    el('div', 'cal-det-rar', d, rar.name);
    const head = el('div', 'cal-det-head', d);
    el('i', 'cal-det-glyph', head, itemIcon(id));
    el('span', 'cal-det-name', head, esc(fieldWord(def.name).toUpperCase()));
    const r = items?.crafting?.recipe?.(id);
    el('p', 'cal-det-desc', d, esc(fieldWord(r?.note ?? def.desc ?? '')));
    const stats = el('div', 'cal-det-stats', d);
    this._stat(stats, 'CARRIED',
      `${this.ctx.inventory?.count?.(id) ?? 0} / ${items.capacity(id)}`);
    this._stat(stats, 'MAKES', `${r?.batch ?? 1} EACH TIME`);

    el('div', 'cal-det-sub', d, 'MADE FROM');
    const list = el('div', 'cal-recipe', d);
    for (const s of items.recipeStatus(id)) {
      const row = el('div', `cal-recipe-row${s.ok ? '' : ' short'}`, list);
      el('i', '', row, itemIcon(s.id));
      el('span', 'n', row, esc(fieldWord(s.def.name).toUpperCase()));
      el('span', 'c', row, `${s.have} / ${s.need}`);
    }
    const ok = items.canCraft(id);
    const b = el('button', `cal-det-act${ok ? '' : ' off'}`, d, 'MAKE');
    b.addEventListener('click', () => {
      if (items.craft(id)) this._render();
      else this._flash(b, fieldWord(items.craftBlocker(id) ?? 'CANNOT MAKE'));
    });
  }

  /* ------------------------------------------------------------ notebook */

  _renderNotebook() {
    const dp = this.ctx.items?.datapoints;
    if (!dp) { this._empty('No Field Books found yet.'); this._detailHint(); return; }
    el('div', 'cal-cap-title', this._capEl,
      `FIELD BOOKS: ${dp.count} OF ${dp.total} RECOVERED`);

    let first = null;
    for (const cat of dp.categories()) {
      el('div', 'cal-inv-group', this._bodyEl, `${esc(fieldWord(cat.label))} · ${cat.have}/${cat.total}`);
      const list = el('div', 'cal-notes', this._bodyEl);
      for (const rec of dp.list.filter((r) => r.category === cat.id)) {
        const had = dp.collected.has(rec.id);
        const row = el('button', `cal-note${had ? '' : ' locked'}`, list);
        el('i', 'cal-note-mark', row, had ? iconSvg('book') : '·');
        el('span', 'cal-note-title', row,
          had ? esc(fieldWord(rec.title).toUpperCase()) : 'NOT YET FOUND');
        if (had) {
          if (!first) first = rec.id;
          row.addEventListener('click', () => {
            this._selected = { kind: 'record', id: rec.id }; this._render();
          });
          if (this._selected?.kind === 'record' && this._selected.id === rec.id) {
            row.classList.add('sel');
          }
        }
      }
    }
    const want = this._selected?.kind === 'record' && dp.collected.has(this._selected.id)
      ? this._selected.id : first;
    if (!want) {
      el('div', 'cal-det-hint', this._detailEl,
        'The Alidade shows where Field Books lie. Hold E to read one.');
      return;
    }
    this._selected = { kind: 'record', id: want };
    this._detailRecord(dp.record(want));
  }

  _detailRecord(rec) {
    if (!rec) { this._detailHint(); return; }
    const d = this._detailEl;
    d.style.setProperty('--rar', 'var(--cal-cobalt)');
    el('div', 'cal-det-rar', d, esc(fieldWord(rec.categoryLabel ?? 'FIELD BOOK')));
    const head = el('div', 'cal-det-head', d);
    el('i', 'cal-det-glyph', head, iconSvg('book'));
    el('span', 'cal-det-name', head, esc(fieldWord(rec.title).toUpperCase()));
    if (rec.author) el('div', 'cal-det-sub', d, esc(fieldWord(rec.author)));
    const body = el('div', 'cal-read', d);
    for (const para of rec.body) el('p', '', body, esc(fieldWord(para)));
  }

  /* --------------------------------------------------------------- trade */

  _renderTrade() {
    const merch = this.ctx.progression?.merchant;
    const inv = this.ctx.inventory;
    if (!merch) {
      el('div', 'cal-cap-title', this._capEl, 'TRADE');
      this._empty('No trader in range. Find the Guild at the rest.');
      this._detailHint();
      return;
    }
    el('div', 'cal-cap-title', this._capEl,
      `TRADE: ${merch.shards?.() ?? inv?.count?.(CURRENCY) ?? 0} SALT`);

    const cols = el('div', 'cal-trade', this._bodyEl);

    // --- WARES (buy)
    const buyCol = el('div', 'cal-trade-col', cols);
    el('h4', '', buyCol, 'WARES');
    const stock = merch.stock?.() ?? [];
    let anyStock = false;
    for (const s of stock) {
      if (!s?.id || s.qty <= 0) continue;
      anyStock = true;
      const price = merch.price?.(s.id) ?? itemDef(s.id).value ?? 1;
      const afford = (merch.shards?.() ?? 0) >= price;
      const row = this._tradeRow(buyCol, s.id, s.qty, price, afford);
      row.addEventListener('click', () => {
        const out = merch.buy?.(s.id, 1);
        if (out?.ok) this._render();
        else this._flash(row.querySelector('.cal-trade-price'), out?.reason?.toUpperCase() ?? 'NO');
      });
    }
    if (!anyStock) el('div', 'cal-inv-empty', buyCol, 'Sold out.');

    // --- YOURS (sell)
    const sellCol = el('div', 'cal-trade-col', cols);
    el('h4', '', sellCol, 'YOURS TO SELL');
    const sellable = merch.sellable?.() ?? [];
    if (!sellable.length) el('div', 'cal-inv-empty', sellCol, 'Nothing the Guild wants.');
    for (const s of sellable) {
      const row = this._tradeRow(sellCol, s.id, s.n, s.price, true, true);
      row.addEventListener('click', () => {
        const out = merch.sell?.(s.id, 1);
        if (out?.ok) this._render();
        else this._flash(row.querySelector('.cal-trade-price'), out?.reason?.toUpperCase() ?? 'NO');
      });
    }

    const sel = this._selected?.kind === 'item' ? this._selected.id : stock[0]?.id;
    if (sel) { this._selected = { kind: 'item', id: sel }; this._detailItem(sel); }
    else this._detailHint();
  }

  _tradeRow(parent, id, qty, price, afford, selling = false) {
    const def = itemDef(id);
    const rar = rarityDef(def.rarity);
    const row = el('button', `cal-trade-row r-${rar.id}${afford ? '' : ' off'}`, parent);
    row.style.setProperty('--rar', rarInk(rar));
    el('i', 'cal-trade-glyph', row, itemIcon(id));
    el('span', 'cal-trade-name', row, esc(fieldWord(def.name).toUpperCase()));
    el('span', 'cal-trade-qty', row, `×${qty}`);
    el('span', 'cal-trade-price', row, `${selling ? '+' : ''}${price} SALT`);
    row.addEventListener('mouseenter', () => {
      this._selected = { kind: 'item', id };
      this._detailEl.innerHTML = '';
      this._detailItem(id);
    });
    return row;
  }

  update() { /* content is static while open; re-rendered on demand */ }
}

/* ------------------------------------------------------------------------ */

/**
 * Loot-surface registry (round 3 loot contract). interactables.js fires BOTH
 * `inventory.add` (-> 'item-gained' toasts) and `popup.show` for one loot
 * event; the HUD suppresses its toasts for ids the popup just showed by
 * reading this registry on a microtask (`show` runs later in the same
 * synchronous stack as the emits, so a deferred check always sees it).
 * Popup = the single surface for list-loot (corpses / crates / weapon
 * pickups); toasts serve auto-pickups and gathers only. (Gate A10.)
 */
export const LOOT_POPUP = { instance: null };

/**
 * Take-all loot popup: a paper chip PROJECTED onto the interactable it came from and
 * tracking it every frame (edge-clamped). Names the SOURCE, frames each row by rarity
 * ink. `visible` / `shownIds` / `shownAt` keep the shape the HUD's toast suppression
 * and gate A10 read.
 */
export class LootPopup {
  constructor(ctx) {
    this.ctx = ctx ?? null;
    this.root = el('div', 'cal-loot', document.body);
    this._kicker = el('div', 'cal-loot-kicker', this.root, 'LOOT');
    this._source = el('div', 'cal-loot-source', this.root, '');
    this._rows = el('div', 'cal-loot-rows', this.root);
    this._foot = el('div', 'cal-loot-foot', this.root, 'TAKEN');
    this._timer = 0;
    this._anchor = null;         // world position of the source, or null
    this.shownIds = new Set();   // ids of the loot event currently displayed
    this.shownAt = -Infinity;    // performance.now() of the last show()
    LOOT_POPUP.instance = this;
  }

  /** True while the popup is on screen (drives __HUD_DEBUG__.lootSurfaces). */
  get visible() { return this._timer > 0; }

  _record(ids) {
    this.shownIds.clear();
    for (const id of ids) this.shownIds.add(String(id));
    this.shownAt = performance.now();
  }

  show(rows, label = 'LOOT', opts = {}) {
    this._kicker.textContent = label === 'GATHER' ? 'GATHERED' : fieldWord(label);
    this._source.textContent = fieldWord(opts.sourceName ?? '');
    this._source.style.display = opts.sourceName ? '' : 'none';
    this._rows.innerHTML = '';
    for (const r of rows) {
      const def = itemDef(r.id);
      const rar = rarityDef(def.rarity);
      const row = el('div', `cal-loot-row r-${rar.id}`, this._rows);
      row.style.setProperty('--rar', rarInk(rar));
      el('span', 'cal-loot-glyph', row, itemIcon(r.id));
      el('span', 'cal-loot-name', row, esc(fieldWord(def.name).toUpperCase()));
      el('span', 'cal-loot-n', row, `×${r.n ?? 1}`);
    }
    this._foot.textContent = 'TAKEN';
    this._record(rows.map((r) => r.id));
    this._setAnchor(opts.position);
    this._pop();
  }

  /** Single-line variant (weapon pickups, hints). */
  showText(id, text, opts = {}) {
    const def = itemDef(id);
    const rar = rarityDef(def.rarity);
    this._kicker.textContent = 'STRIPPED';
    this._source.textContent = fieldWord(opts.sourceName ?? '');
    this._source.style.display = opts.sourceName ? '' : 'none';
    this._rows.innerHTML = '';
    const row = el('div', `cal-loot-row r-${rar.id}`, this._rows);
    row.style.setProperty('--rar', rarInk(rar));
    el('span', 'cal-loot-glyph', row, itemIcon(id));
    el('span', 'cal-loot-name', row, esc(fieldWord(def.name).toUpperCase()));
    this._foot.textContent = fieldWord(text);
    this._record([id]);
    this._setAnchor(opts.position);
    this._pop();
  }

  /** Copy the source position; live refs (a falling part) keep being read. */
  _setAnchor(pos) {
    if (!pos || typeof pos.x !== 'number' || !this.ctx?.camera) {
      this._anchor = null;
      this.root.classList.remove('projected');
      return;
    }
    this._anchor = pos;
    this.root.classList.add('projected');
    this._place();
  }

  /** ui-16: park the card beside the thing it came from, clamped on screen. */
  _place() {
    const cam = this.ctx?.camera;
    const a = this._anchor;
    if (!cam || !a) return;
    const w = window.innerWidth, h = window.innerHeight;
    _lootV.set(a.x ?? 0, (a.y ?? 0) + 1.05, a.z ?? 0);
    _lootD.copy(_lootV).sub(cam.position);
    cam.getWorldDirection(_lootF);
    const behind = _lootD.dot(_lootF) <= 0;
    _lootV.project(cam);
    let sx = (_lootV.x * 0.5 + 0.5) * w;
    let sy = (-_lootV.y * 0.5 + 0.5) * h;
    if (behind) { sx = w - sx; sy = h * 0.82; }
    const pad = 30;
    const bw = this.root.offsetWidth || 210;
    const bh = this.root.offsetHeight || 120;
    sx = Math.min(Math.max(sx, pad + bw * 0.5), w - pad - bw * 0.5);
    sy = Math.min(Math.max(sy, pad + bh), h - pad);
    // the popup is `zoom`ed with the menus (--ui-z), so its own left/top are in zoomed px
    const z = this._z || 1;
    this.root.style.left = `${Math.round(sx / z)}px`;
    this.root.style.top = `${Math.round(sy / z)}px`;
    this.root.classList.toggle('clamped', behind);
  }

  _pop() {
    this._z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-z')) || 1;
    this._timer = 2.8;
    this.root.classList.remove('show');
    void this.root.offsetWidth; // restart the slide-in animation
    this.root.classList.add('show');
  }

  update(dt) {
    if (this._timer > 0) {
      this._timer -= dt;
      if (this._anchor) this._place();
      if (this._timer <= 0) {
        this.root.classList.remove('show');
        this._anchor = null;
      }
    }
  }
}

