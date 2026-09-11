import * as THREE from 'three';
import './inventory.css';
import { itemDef, ammoDef, rarityDef, POCKETS } from '../items/items.js';

/* Reused vectors for the loot-popup projection — no per-frame allocation. */
const _lootV = new THREE.Vector3();
const _lootD = new THREE.Vector3();
const _lootF = new THREE.Vector3();

/**
 * INVENTORY SCREEN + LOOT POPUP  —  lane `focus-items` (port 5212)
 * ===========================================================================
 * Findings closed here:
 *   ui-14              full-screen POCKETS: rarity frames, descriptions,
 *                      capacity bars — not a 640 px modal list
 *   progression-006    capacity readouts + the capacity UPGRADE control, and
 *                      a real CRAFTING pocket
 *   progression-004    the merchant TRADE panel (the economy itself stays in
 *                      `ctx.progression.merchant` — this is only its face)
 *   missing-systems-…  the NOTEBOOK: datapoints, by category, readable
 *   ui-16              the take-all loot popup is PROJECTED onto the
 *                      interactable instead of pinned to a screen corner
 *   onboarding-loop-…  the popup names its source and frames rows by rarity
 *
 * The screen is a distinct game state ('inventory'): opening sets ctx.state,
 * exits pointer lock and freezes the world exactly like the pause menu;
 * closes on I / Esc / clicking outside the panel.
 *
 * AMMO reads ctx.combat defensively: round-2 weapons contract
 * (combat.weapons[].ammoTypes + ammo counts) when present, else the round-1
 * arrowCounts map — whatever landed, something correct renders.
 * CRAFTING lists ammo recipes live from combat (`recipeStatus`/`canCraft`/
 * `craftAmmo`), so those numbers can only come from the lane that owns them.
 */

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
    this.root = el('div', 'hzc-inv', document.body);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close(); // click-outside resumes
    });

    const shell = el('div', 'hzc-inv-shell', this.root);
    for (const c of ['tl', 'tr', 'bl', 'br']) el('i', `hzc-inv-corner ${c}`, shell);

    const head = el('div', 'hzc-inv-head', shell);
    const title = el('div', 'hzc-inv-titles', head);
    el('div', 'hzc-inv-kicker', title, 'SATCHEL');
    el('div', 'hzc-inv-title', title, 'INVENTORY');
    this._shardsEl = el('div', 'hzc-inv-shards', head, '');

    const cols = el('div', 'hzc-inv-cols', shell);

    // --- left rail: pockets
    this._railEl = el('nav', 'hzc-inv-rail', cols);
    this._railBtns = new Map();
    for (const p of POCKETS) {
      const b = el('button', 'hzc-inv-pocket', this._railEl,
        `<i class="hzc-inv-pglyph">${p.glyph}</i>`
        + `<span class="hzc-inv-plabel">${p.label}</span>`
        + '<span class="hzc-inv-pcount"></span>');
      b.addEventListener('click', () => { this.pocket = p.id; this._selected = null; this._render(); });
      this._railBtns.set(p.id, b);
    }

    // --- middle: the pocket body
    const main = el('section', 'hzc-inv-main', cols);
    this._capEl = el('div', 'hzc-inv-cap', main);
    this._bodyEl = el('div', 'hzc-inv-body', main);

    // --- right: detail pane
    this._detailEl = el('aside', 'hzc-inv-detail', cols);

    el('div', 'hzc-inv-foot', shell,
      '<span><kbd>I</kbd> / <kbd>ESC</kbd> RESUME</span>'
      + '<span>CLICK A POCKET TO SWITCH · CLICK AN ITEM TO INSPECT</span>');
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

    // shard counter, top-right — shards ARE the currency (progression-004)
    const shards = inv?.count?.('metal-shards') ?? 0;
    const sd = itemDef('metal-shards');
    this._shardsEl.innerHTML =
      `<i style="color:${sd.color}">${sd.glyph}</i>`
      + `<span>${shards}</span><em>SHARDS</em>`;

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
    const bar = el('div', 'hzc-cap', this._capEl);
    el('span', 'hzc-cap-label', bar, def?.label ?? 'CAPACITY');
    const pips = el('span', 'hzc-cap-pips', bar);
    for (let i = 0; i < 3; i++) el('i', i < tier ? 'on' : '', pips);
    el('span', 'hzc-cap-tier', bar, tier ? `TIER ${tier}` : 'BASE');

    if (!cost) { el('span', 'hzc-cap-max', bar, 'FULLY UPGRADED'); return; }
    const can = items.canUpgrade(pocketId);
    const b = el('button', `hzc-cap-up${can.ok ? '' : ' off'}`, bar,
      `UPGRADE · <i>${itemDef('metal-shards').glyph}</i>${cost.shards}`
      + cost.items.map(([id, n]) =>
        ` · <i style="color:${itemDef(id).color}">${itemDef(id).glyph}</i>${n}`).join(''));
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

    // the medicine pouch belongs at the top of RESOURCES — it is the thing
    // every herb in this pocket feeds
    if (category === 'resource') this._pouchMeter();

    if (!rows.length) {
      this._empty(category === 'valuable'
        ? 'NO TROPHIES — MACHINE LENSES, HEARTS AND CORES COLLECT HERE'
        : category === 'tool'
          ? 'NO TOOLS — CRAFT ROCKS, DRAUGHTS AND TRAPS IN THE CRAFTING POCKET'
          : 'SATCHEL EMPTY');
      this._detailHint();
      return;
    }

    const grid = el('div', 'hzc-grid', this._bodyEl);
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
    const card = el('button', `hzc-card r-${rar.id}`, parent);
    card.style.setProperty('--rar', rar.color);
    card.style.setProperty('--glow', rar.glow);
    el('i', 'hzc-card-glyph', card, def.glyph).style.color = def.color;
    el('span', 'hzc-card-name', card, esc(def.name.toUpperCase()));
    el('span', 'hzc-card-n', card, String(count));
    if (cap) {
      const bar = el('span', 'hzc-card-bar', card);
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
    const pouch = el('div', 'hzc-pouch', this._bodyEl);
    el('span', 'hzc-pouch-label', pouch, 'MEDICINE POUCH');
    const bar = el('div', 'hzc-pouch-bar', pouch);
    const fill = el('div', 'hzc-pouch-fill', bar);
    const frac = Math.max(0, Math.min(1, (p.pouch ?? 0) / (p.maxPouch || 100)));
    fill.style.width = `${Math.round(frac * 100)}%`;
    el('span', 'hzc-pouch-num', pouch,
      `${Math.round(p.pouch ?? 0)} / ${Math.round(p.maxPouch ?? 100)}`);
  }

  _empty(text) { el('div', 'hzc-inv-empty', this._bodyEl, text); }

  /* --------------------------------------------------------- detail pane */

  _detailHint() {
    el('div', 'hzc-det-hint', this._detailEl, 'NOTHING SELECTED');
  }

  _detailItem(id) {
    const inv = this.ctx.inventory;
    const items = this.ctx.items;
    const def = itemDef(id);
    const rar = rarityDef(def.rarity);
    const d = this._detailEl;
    d.style.setProperty('--rar', rar.color);
    el('div', 'hzc-det-rar', d, rar.name);
    const head = el('div', 'hzc-det-head', d);
    el('i', 'hzc-det-glyph', head, def.glyph).style.color = def.color;
    el('span', 'hzc-det-name', head, esc(def.name.toUpperCase()));
    el('p', 'hzc-det-desc', d, esc(def.desc ?? ''));

    const cap = items?.capacity ? items.capacity(id) : (def.cap ?? 0);
    const have = inv?.count?.(id) ?? 0;
    const stats = el('div', 'hzc-det-stats', d);
    this._stat(stats, 'CARRIED', `${have} / ${cap}`);
    this._stat(stats, 'POCKET',
      (items?.POCKETS?.[items.pocketOf(id)]?.label) ?? 'SATCHEL');
    if (def.pouch) this._stat(stats, 'RESTORES', `${def.pouch} POUCH`);
    if (def.value) this._stat(stats, 'VALUE', `${def.value} SHARDS EACH`);

    const bar = el('div', 'hzc-det-bar', d);
    const fill = el('i', '', bar);
    fill.style.width = `${Math.round(Math.min(1, cap ? have / cap : 0) * 100)}%`;

    // tools are usable straight out of the pocket
    const tools = items?.tools;
    if (def.category === 'tool' && tools) {
      const i = tools.slots.findIndex((s) => s.id === id);
      if (i >= 0) {
        const b = el('button', 'hzc-det-act', d,
          `EQUIP TO SLOT ${i + 1} · <kbd>${tools.useKey.replace('Key', '')}</kbd> USE`);
        b.addEventListener('click', () => { tools.select(i); this._render(); });
        if (tools.index === i) { b.classList.add('on'); b.textContent = 'EQUIPPED'; }
      }
    }
  }

  _stat(parent, k, v) {
    const row = el('div', 'hzc-det-stat', parent);
    el('span', 'k', row, k);
    el('span', 'v', row, String(v));
  }

  /* ---------------------------------------------------------------- ammo */

  _renderAmmo() {
    const c = this.ctx.combat;
    const counts = (c && (c.ammo || c.arrowCounts)) || {};
    let grid = el('div', 'hzc-grid', this._bodyEl);
    let rendered = 0;
    let first = null;

    const push = (id, n, active, name) => {
      const def = ammoDef(id);
      const rar = rarityDef(def.rarity);
      const card = el('button', `hzc-card r-${rar.id}${active ? ' active' : ''}`, grid);
      card.style.setProperty('--rar', rar.color);
      card.style.setProperty('--glow', rar.glow);
      el('i', 'hzc-card-glyph', card, def.glyph).style.color = def.color;
      el('span', 'hzc-card-name', card, esc((name ?? def.name).toUpperCase()));
      el('span', 'hzc-card-n', card, n == null ? '—' : String(n));
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
        el('div', 'hzc-inv-group', this._bodyEl,
          esc(String(w.name ?? w.id ?? 'WEAPON').toUpperCase()));
        // each weapon gets its OWN grid: reusing one node moved every card
        // under the last header instead of grouping them by weapon
        grid = el('div', 'hzc-grid', this._bodyEl);
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
    if (!rendered) { this._empty('QUIVER DATA UNAVAILABLE'); this._detailHint(); return; }

    const sel = this._selected?.kind === 'ammo' ? this._selected.id : first;
    this._selected = { kind: 'ammo', id: sel };
    this._detailAmmo(sel, counts);
  }

  _detailAmmo(id, counts) {
    const c = this.ctx.combat;
    const def = ammoDef(id);
    const rar = rarityDef(def.rarity);
    const d = this._detailEl;
    d.style.setProperty('--rar', rar.color);
    el('div', 'hzc-det-rar', d, rar.name);
    const head = el('div', 'hzc-det-head', d);
    el('i', 'hzc-det-glyph', head, def.glyph).style.color = def.color;
    el('span', 'hzc-det-name', head, esc(def.name.toUpperCase()));
    const stats = el('div', 'hzc-det-stats', d);
    this._stat(stats, 'IN QUIVER', String(counts?.[id] ?? '—'));
    const status = typeof c?.recipeStatus === 'function' ? c.recipeStatus(id) : null;
    if (Array.isArray(status) && status.length) {
      el('div', 'hzc-det-sub', d, 'CRAFTS FROM');
      const list = el('div', 'hzc-recipe', d);
      for (const r of status) {
        const rd = itemDef(r.id);
        const row = el('div', `hzc-recipe-row${r.ok ? '' : ' short'}`, list);
        el('i', '', row, rd.glyph).style.color = rd.color;
        el('span', 'n', row, esc(rd.name.toUpperCase()));
        el('span', 'c', row, `${r.have} / ${r.need}`);
      }
      const ok = typeof c?.canCraft === 'function' ? c.canCraft(id) : false;
      const b = el('button', `hzc-det-act${ok ? '' : ' off'}`, d, 'CRAFT');
      b.addEventListener('click', () => {
        if (c?.craftAmmo?.(id)) this._render();
        else this._flash(b, c?.craftBlocker?.(id) ?? 'CANNOT CRAFT');
      });
    } else {
      el('p', 'hzc-det-desc', d, 'Found, not made. Machines carry it; you take it.');
    }
  }

  /* ------------------------------------------------------------ crafting */

  _renderCrafting() {
    const items = this.ctx.items;
    const combat = this.ctx.combat;
    el('div', 'hzc-cap-title', this._capEl, 'WORKBENCH — CRAFT FROM THE SATCHEL');

    // 1) tools & potions this lane owns
    el('div', 'hzc-inv-group', this._bodyEl, 'TOOLS & DRAUGHTS');
    const gridA = el('div', 'hzc-grid', this._bodyEl);
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
      el('div', 'hzc-inv-group', this._bodyEl, 'AMMUNITION');
      const gridB = el('div', 'hzc-grid', this._bodyEl);
      for (const id of ammoIds) {
        const def = ammoDef(id);
        const rar = rarityDef(def.rarity);
        const card = el('button', `hzc-card r-${rar.id}`, gridB);
        card.style.setProperty('--rar', rar.color);
        card.style.setProperty('--glow', rar.glow);
        el('i', 'hzc-card-glyph', card, def.glyph).style.color = def.color;
        el('span', 'hzc-card-name', card, esc(def.name.toUpperCase()));
        el('span', 'hzc-card-n', card, String(combat.ammo?.[id] ?? 0));
        card.classList.toggle('craftable', !!combat.canCraft?.(id));
        card.addEventListener('click', () => {
          this._selected = { kind: 'ammo', id }; this._render();
        });
        if (this._selected?.kind === 'ammo' && this._selected.id === id) card.classList.add('sel');
        if (!first) first = { kind: 'ammo', id };
      }
    }

    // 3) capacity upgrades — every pocket, in one place
    el('div', 'hzc-inv-group', this._bodyEl, 'CARRY CAPACITY');
    const caps = el('div', 'hzc-caps', this._bodyEl);
    for (const [pid, pdef] of Object.entries(items?.POCKETS ?? {})) {
      const tier = items.capacityTier(pid);
      const cost = items.upgradeCost(pid);
      const row = el('div', 'hzc-caps-row', caps);
      el('span', 'hzc-caps-name', row, pdef.label);
      const pips = el('span', 'hzc-cap-pips', row);
      for (let i = 0; i < 3; i++) el('i', i < tier ? 'on' : '', pips);
      if (!cost) { el('span', 'hzc-cap-max', row, 'MAX'); continue; }
      const can = items.canUpgrade(pid);
      const b = el('button', `hzc-cap-up${can.ok ? '' : ' off'}`, row,
        `×${cost.mult} · <i>${itemDef('metal-shards').glyph}</i>${cost.shards}`
        + cost.items.map(([id, n]) =>
          ` · <i style="color:${itemDef(id).color}">${itemDef(id).glyph}</i>${n}`).join(''));
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
    d.style.setProperty('--rar', rar.color);
    el('div', 'hzc-det-rar', d, rar.name);
    const head = el('div', 'hzc-det-head', d);
    el('i', 'hzc-det-glyph', head, def.glyph).style.color = def.color;
    el('span', 'hzc-det-name', head, esc(def.name.toUpperCase()));
    const r = items?.crafting?.recipe?.(id);
    el('p', 'hzc-det-desc', d, esc(r?.note ?? def.desc ?? ''));
    const stats = el('div', 'hzc-det-stats', d);
    this._stat(stats, 'CARRIED',
      `${this.ctx.inventory?.count?.(id) ?? 0} / ${items.capacity(id)}`);
    this._stat(stats, 'MAKES', `${r?.batch ?? 1} PER CRAFT`);

    el('div', 'hzc-det-sub', d, 'CRAFTS FROM');
    const list = el('div', 'hzc-recipe', d);
    for (const s of items.recipeStatus(id)) {
      const row = el('div', `hzc-recipe-row${s.ok ? '' : ' short'}`, list);
      el('i', '', row, s.def.glyph).style.color = s.def.color;
      el('span', 'n', row, esc(s.def.name.toUpperCase()));
      el('span', 'c', row, `${s.have} / ${s.need}`);
    }
    const ok = items.canCraft(id);
    const b = el('button', `hzc-det-act${ok ? '' : ' off'}`, d, 'CRAFT');
    b.addEventListener('click', () => {
      if (items.craft(id)) this._render();
      else this._flash(b, items.craftBlocker(id) ?? 'CANNOT CRAFT');
    });
  }

  /* ------------------------------------------------------------ notebook */

  _renderNotebook() {
    const dp = this.ctx.items?.datapoints;
    if (!dp) { this._empty('NO RECORDS FOUND YET'); this._detailHint(); return; }
    el('div', 'hzc-cap-title', this._capEl,
      `NOTEBOOK — ${dp.count} OF ${dp.total} RECORDS RECOVERED`);

    let first = null;
    for (const cat of dp.categories()) {
      el('div', 'hzc-inv-group', this._bodyEl, `${cat.label} · ${cat.have}/${cat.total}`);
      const list = el('div', 'hzc-notes', this._bodyEl);
      for (const rec of dp.list.filter((r) => r.category === cat.id)) {
        const had = dp.collected.has(rec.id);
        const row = el('button', `hzc-note${had ? '' : ' locked'}`, list);
        el('i', 'hzc-note-mark', row, had ? '❐' : '·');
        el('span', 'hzc-note-title', row,
          had ? esc(rec.title.toUpperCase()) : 'UNRECOVERED RECORD');
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
      el('div', 'hzc-det-hint', this._detailEl,
        'FOCUS REVEALS OLD-WORLD RECORDS. HOLD E TO READ ONE.');
      return;
    }
    this._selected = { kind: 'record', id: want };
    this._detailRecord(dp.record(want));
  }

  _detailRecord(rec) {
    if (!rec) { this._detailHint(); return; }
    const d = this._detailEl;
    d.style.setProperty('--rar', '#7fe8ff');
    el('div', 'hzc-det-rar', d, rec.categoryLabel ?? 'RECORD');
    const head = el('div', 'hzc-det-head', d);
    el('i', 'hzc-det-glyph', head, '❐').style.color = '#7fe8ff';
    el('span', 'hzc-det-name', head, esc(rec.title.toUpperCase()));
    if (rec.author) el('div', 'hzc-det-sub', d, esc(rec.author));
    const body = el('div', 'hzc-read', d);
    for (const para of rec.body) el('p', '', body, esc(para));
  }

  /* --------------------------------------------------------------- trade */

  _renderTrade() {
    const merch = this.ctx.progression?.merchant;
    const inv = this.ctx.inventory;
    if (!merch) {
      el('div', 'hzc-cap-title', this._capEl, 'TRADE');
      this._empty('NO TRADER IN RANGE — FIND THE CAMP HUNTER');
      this._detailHint();
      return;
    }
    el('div', 'hzc-cap-title', this._capEl,
      `TRADE — ${merch.shards?.() ?? inv?.count?.('metal-shards') ?? 0} SHARDS`);

    const cols = el('div', 'hzc-trade', this._bodyEl);

    // --- WARES (buy)
    const buyCol = el('div', 'hzc-trade-col', cols);
    el('h4', '', buyCol, 'HIS WARES');
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
        else this._flash(row.querySelector('.hzc-trade-price'), out?.reason?.toUpperCase() ?? 'NO');
      });
    }
    if (!anyStock) el('div', 'hzc-inv-empty', buyCol, 'SOLD OUT');

    // --- YOURS (sell)
    const sellCol = el('div', 'hzc-trade-col', cols);
    el('h4', '', sellCol, 'YOURS TO SELL');
    const sellable = merch.sellable?.() ?? [];
    if (!sellable.length) el('div', 'hzc-inv-empty', sellCol, 'NOTHING HE WANTS');
    for (const s of sellable) {
      const row = this._tradeRow(sellCol, s.id, s.n, s.price, true, true);
      row.addEventListener('click', () => {
        const out = merch.sell?.(s.id, 1);
        if (out?.ok) this._render();
        else this._flash(row.querySelector('.hzc-trade-price'), out?.reason?.toUpperCase() ?? 'NO');
      });
    }

    const sel = this._selected?.kind === 'item' ? this._selected.id : stock[0]?.id;
    if (sel) { this._selected = { kind: 'item', id: sel }; this._detailItem(sel); }
    else this._detailHint();
  }

  _tradeRow(parent, id, qty, price, afford, selling = false) {
    const def = itemDef(id);
    const rar = rarityDef(def.rarity);
    const row = el('button', `hzc-trade-row r-${rar.id}${afford ? '' : ' off'}`, parent);
    row.style.setProperty('--rar', rar.color);
    el('i', 'hzc-trade-glyph', row, def.glyph).style.color = def.color;
    el('span', 'hzc-trade-name', row, esc(def.name.toUpperCase()));
    el('span', 'hzc-trade-qty', row, `×${qty}`);
    el('span', 'hzc-trade-price', row,
      `${selling ? '+' : ''}${price} ${itemDef('metal-shards').glyph}`);
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
 * Take-all loot popup — `ui-16` + `onboarding-loop-loot-feel`.
 *
 * Round 3 pinned this to a screen corner and listed bare ids. It now:
 *   · PROJECTS onto the interactable it came from and tracks it every frame
 *     (edge-clamped, so a corpse behind you still parks at the screen edge),
 *   · names the SOURCE ("SAWTOOTH WRECK", "SUPPLY CRATE", the datapoint),
 *   · frames each row by the item's RARITY colour.
 * `visible` / `shownIds` / `shownAt` keep the exact Round-3 shape the HUD's
 * toast suppression and gate A10 read.
 */
export class LootPopup {
  constructor(ctx) {
    this.ctx = ctx ?? null;
    this.root = el('div', 'hzc-loot', document.body);
    this._kicker = el('div', 'hzc-loot-kicker', this.root, 'LOOT');
    this._source = el('div', 'hzc-loot-source', this.root, '');
    this._rows = el('div', 'hzc-loot-rows', this.root);
    this._foot = el('div', 'hzc-loot-foot', this.root, 'TAKE ALL — AUTO');
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
    this._kicker.textContent = label === 'GATHER' ? 'GATHERED' : label;
    this._source.textContent = opts.sourceName ?? '';
    this._source.style.display = opts.sourceName ? '' : 'none';
    this._rows.innerHTML = '';
    for (const r of rows) {
      const def = itemDef(r.id);
      const rar = rarityDef(def.rarity);
      const row = el('div', `hzc-loot-row r-${rar.id}`, this._rows);
      row.style.setProperty('--rar', rar.color);
      const g = el('span', 'hzc-loot-glyph', row, def.glyph);
      g.style.color = def.color;
      el('span', 'hzc-loot-name', row, esc(def.name.toUpperCase()));
      el('span', 'hzc-loot-n', row, `×${r.n ?? 1}`);
    }
    this._foot.textContent = 'TAKE ALL — AUTO';
    this._record(rows.map((r) => r.id));
    this._setAnchor(opts.position);
    this._pop();
  }

  /** Single-line variant (weapon pickups, hints). */
  showText(id, text, opts = {}) {
    const def = itemDef(id);
    const rar = rarityDef(def.rarity);
    this._kicker.textContent = 'FIELD STRIP';
    this._source.textContent = opts.sourceName ?? '';
    this._source.style.display = opts.sourceName ? '' : 'none';
    this._rows.innerHTML = '';
    const row = el('div', `hzc-loot-row r-${rar.id}`, this._rows);
    row.style.setProperty('--rar', rar.color);
    const g = el('span', 'hzc-loot-glyph', row, def.glyph);
    g.style.color = def.color;
    el('span', 'hzc-loot-name', row, esc(def.name.toUpperCase()));
    this._foot.textContent = text;
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
    this.root.style.left = `${Math.round(sx)}px`;
    this.root.style.top = `${Math.round(sy)}px`;
    this.root.classList.toggle('clamped', behind);
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
      if (this._anchor) this._place();
      if (this._timer <= 0) {
        this.root.classList.remove('show');
        this._anchor = null;
      }
    }
  }
}

