import './making.css';
import TEXT from '../game/text/ui/making.json';
import { AMMO } from '../combat/weapons.js';
import { itemIcon } from './inventory.js';

/**
 * THE MAKING LEDGER (M1.6d; BIBLE §9 "the Making ledger", §16, §18 "Making: MAKE ×1 · MAKE ×6").
 *
 * The hub's MAKING tab: a two-column dark glass ledger. Left, one row per thing Brea can make, in
 * BIBLE §16's order (five arrows, three pots, the net; no laid-trap row, Q8), each with what she
 * carries and its cap. Right, the selected item on a turntable (no glow plate), its recipe as
 * tallies of island materials with what the satchel holds against what one making takes, its effect
 * in plain words, and the two verbs MAKE ×1 and MAKE ×6 and no other.
 *
 * One recipe source: an arrow's or a pot's recipe, yield and cap are combat's (`AMMO`, made through
 * `combat.craftAmmo`, the same path the R hold and the quick-slot hold use). A row the kit cannot make
 * yet (no ammo of that id in `combat.ammo`) shows BIBLE §16's recipe from the ledger's own words file
 * (`planned`) and NOT YET IN THE KIT, with both verbs off. Every word is from
 * `src/game/text/ui/making.json`.
 *
 * The turntable is drawn, not rendered: the item's line drawing turns about its vertical axis over a
 * ruled floor (a CSS 3D turn of an SVG; no second WebGL context, nothing to compile).
 *
 * Mounted by `Menus.setTab('crafting')` into the hub body (`mount(host)` / `unmount()`); repaints on
 * `ammo-crafted`, `item-gained` and its own buttons. No per-frame work.
 */

/** Which of combat's ammunition each ledger row makes (null: not in the kit yet). Engine ids, kept out of the words file. */
const AMMO_OF = Object.freeze({ reed: 'hunter', barbed: 'hardpoint', brine: 'freeze', cinder: 'fire', dust: 'shock',
  brinePot: null, cinderPot: 'blast-bomb', dustPot: null, net: null });
for (const r of TEXT.rows) r.ammo = AMMO_OF[r.id] ?? null;

const pad3 = (n) => String(Math.max(0, Math.round(n || 0))).padStart(3, '0');
const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const h = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};

/** Tally marks for a count: groups of four strokes and a fifth across, as a field book keeps them. */
export function tallySvg(n) {
  const k = Math.max(0, Math.min(12, Math.round(n || 0)));
  const groups = Math.ceil(k / 5) || 0;
  const w = Math.max(8, groups * 30);
  let d = '';
  for (let g = 0; g < groups; g++) {
    const inG = Math.min(5, k - g * 5);
    const x0 = g * 30 + 3;
    for (let i = 0; i < Math.min(4, inG); i++) d += `M${x0 + i * 5} 3V17`;
    if (inG === 5) d += `M${x0 - 2} 15L${x0 + 18} 5`;
  }
  return `<svg class="mk-tally" viewBox="0 0 ${w} 20" width="${w}" height="20" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/></svg>`;
}

/** The turntable's line drawing for a row: an arrow with its head, a clay pot, or the net. */
function drawing(row) {
  const L = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"';
  if (row.group === 'arrows') {
    const heads = {
      reed: `<path ${L} d="M60 18 L68 40 L60 50 L52 40 Z"/>`,
      barbed: `<path ${L} d="M60 16 L70 44 L62 38 L60 50 L58 38 L50 44 Z"/>`,
      brine: `<ellipse ${L} cx="60" cy="38" rx="9" ry="12"/><path ${L} d="M60 18 V26"/>`,
      cinder: `<path ${L} d="M60 20 C67 30 68 40 60 48 C52 40 53 30 60 20 Z"/><path ${L} d="M60 30 V42"/>`,
      dust: `<circle ${L} cx="60" cy="36" r="10"/><path ${L} d="M54 31 h12 M54 36 h12 M54 41 h12"/>`,
    };
    return `<svg viewBox="0 0 120 220" aria-hidden="true">${heads[row.id] ?? heads.reed}
      <path ${L} d="M60 50 V196"/>
      <path ${L} d="M60 168 L48 186 L48 204 L60 192 M60 168 L72 186 L72 204 L60 192"/>
      <path ${L} d="M56 58 h8 M56 120 h8" opacity="0.6"/></svg>`;
  }
  if (row.group === 'pots') {
    return `<svg viewBox="0 0 120 220" aria-hidden="true">
      <path ${L} d="M48 64 h24 l-4 16 c22 8 30 30 26 52 -4 22 -18 36 -34 36 s-30 -14 -34 -36 c-4 -22 4 -44 26 -52 Z"/>
      <path ${L} d="M30 124 h60 M36 150 h48" opacity="0.6"/><path ${L} d="M60 40 V64"/><path ${L} d="M52 40 h16"/></svg>`;
  }
  return `<svg viewBox="0 0 120 220" aria-hidden="true">
    <circle ${L} cx="60" cy="112" r="44"/><path ${L} d="M16 112 h88 M60 68 v88 M29 81 l62 62 M91 81 l-62 62" opacity="0.7"/>
    <path ${L} d="M60 68 V30 M52 30 h16"/></svg>`;
}

export class MakingLedger {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = null;
    this.sel = TEXT.rows[0].id;
    this.lastMade = null;
    this._onChange = () => { if (this.root) this.paint(); };
    ctx.events?.on?.('ammo-crafted', this._onChange);
    ctx.events?.on?.('item-gained', this._onChange);
  }

  /** The row's live state: ammo id, carried, cap, yield, recipe [{id, need, have, ok}], whether it can be made. */
  rowState(row) {
    const combat = this.ctx.combat;
    const inv = this.ctx.inventory;
    const def = row.ammo ? AMMO[row.ammo] : null;
    const inKit = !!def && !!def.recipe && !!def.batch && !!combat?.ammo && row.ammo in combat.ammo;
    const recipe = inKit
      ? def.recipe.map(([id, need]) => ({ id, need, have: inv?.count?.(id) ?? 0 }))
      : (TEXT.planned[row.id] || []).map(([id, need]) => ({ id, need, have: inv?.count?.(id) ?? 0 }));
    for (const r of recipe) r.ok = r.have >= r.need;
    const carried = inKit ? (combat.ammo[row.ammo] ?? 0) : 0;
    const cap = def?.cap ?? 0;
    const full = inKit && carried >= cap;
    const short = recipe.filter((r) => !r.ok);
    const can = inKit && !full && !short.length;
    // how many makings the satchel and the cap allow, up to six
    let times = 0;
    if (can) {
      const byMat = Math.min(...recipe.map((r) => Math.floor(r.have / r.need)));
      const bySpace = Math.ceil((cap - carried) / def.batch);
      times = Math.max(0, Math.min(6, byMat, bySpace));
    }
    const why = !inKit ? TEXT.unlearned : full ? TEXT.full
      : short.length ? fill(TEXT.short, { what: short.map((r) => (TEXT.materials[r.id] ?? r.id).toUpperCase()).join(' · ') }) : null;
    return { inKit, def, recipe, carried, cap, batch: def?.batch ?? 0, can, times, why };
  }

  mount(host) {
    this.unmount();
    this.root = h('div', 'mk cal-glass menu', host);
    this.root.dataset.screen = 'making';
    this.paint();
    return this.root;
  }

  unmount() {
    this.root?.remove();
    this.root = null;
  }

  /** MAKE ×n: run the recipe up to n times through combat; returns how many were made. */
  make(rowId, n = 1) {
    const row = TEXT.rows.find((r) => r.id === rowId);
    const combat = this.ctx.combat;
    if (!row?.ammo || !combat?.craftAmmo) return 0;
    const before = combat.ammo?.[row.ammo] ?? 0;
    for (let i = 0; i < n; i++) if (!combat.craftAmmo(row.ammo)) break;
    const made = (combat.ammo?.[row.ammo] ?? 0) - before;
    this.lastMade = made > 0 ? fill(TEXT.made, { n: made, name: row.name }) : null;
    this.ctx.events?.emit?.('ui-confirm', { label: n === 1 ? TEXT.make1 : TEXT.make6 });
    if (this.root) this.paint();
    return made;
  }

  paint() {
    const R = this.root;
    if (!R) return;
    R.innerHTML = '';
    const head = h('header', 'mk-head', R);
    h('div', 'mk-title', head, TEXT.head);
    h('div', 'mk-sub', head, TEXT.sub);

    const cols = h('div', 'mk-cols', R);
    const list = h('div', 'mk-list', cols);
    let group = null;
    for (const row of TEXT.rows) {
      if (row.group !== group) { group = row.group; h('div', 'mk-group', list, TEXT.groups[group]); }
      const s = this.rowState(row);
      const b = h('button', `mk-row${row.id === this.sel ? ' on' : ''}${s.inKit ? '' : ' locked'}`, list);
      b.dataset.row = row.id;
      h('span', 'mk-ico', b, row.ammo ? itemIcon(row.ammo) : itemIcon(row.group === 'nets' ? 'wire' : 'pot'));
      h('span', 'mk-name', b, row.name);
      const c = h('span', 'mk-carry', b, s.inKit ? `<b>${pad3(s.carried)}</b><i>/</i>${pad3(s.cap)}` : '<b>—</b>');
      if (s.inKit) {
        const bar = h('span', 'mk-cap', c);
        h('i', null, bar).style.transform = `scaleX(${s.cap ? Math.min(1, s.carried / s.cap).toFixed(3) : 0})`;
      }
      b.addEventListener('click', () => { this.sel = row.id; this.lastMade = null; this.paint(); });
    }

    const row = TEXT.rows.find((r) => r.id === this.sel) ?? TEXT.rows[0];
    const s = this.rowState(row);
    const det = h('div', 'mk-detail', cols);
    const dh = h('div', 'mk-dhead', det);
    h('span', 'mk-ico', dh, row.ammo ? itemIcon(row.ammo) : itemIcon(row.group === 'nets' ? 'wire' : 'pot'));
    h('div', 'mk-dname', dh, row.name);
    const turn = h('div', 'mk-turn', det);
    h('div', 'mk-floor', turn);
    h('div', 'mk-spin', turn, drawing(row));
    h('p', 'mk-does', det, row.does);

    const stat = h('div', 'mk-stats', det);
    const line = (k, v) => { const r = h('div', 'mk-stat', stat); h('span', null, r, k); h('b', null, r, v); };
    line(TEXT.carried, s.inKit ? `${pad3(s.carried)} / ${pad3(s.cap)}` : '—');
    line(fill(TEXT.makes, { n: s.inKit ? s.batch : (row.group === 'arrows' ? 6 : 1) }), '');

    h('div', 'mk-made-head', det, TEXT.madeFrom);
    const rec = h('div', 'mk-recipe', det);
    for (const r of s.recipe) {
      const m = h('div', `mk-mat${r.ok ? '' : ' short'}`, rec);
      h('span', 'mk-ico', m, itemIcon(r.id));
      h('span', 'mk-mname', m, TEXT.materials[r.id] ?? r.id);
      h('span', 'mk-tallies', m, tallySvg(r.need));
      h('span', 'mk-have', m, `<b>${r.have}</b> / ${r.need}`);
    }

    const acts = h('div', 'mk-acts', det);
    const b1 = h('button', `mk-btn${s.can ? '' : ' off'}`, acts, TEXT.make1);
    const b6 = h('button', `mk-btn primary${s.can && s.times >= 1 ? '' : ' off'}`, acts, TEXT.make6);
    b1.dataset.make = '1'; b6.dataset.make = '6';
    if (s.can) {
      b1.addEventListener('click', () => this.make(row.id, 1));
      b6.addEventListener('click', () => this.make(row.id, 6));
    } else { b1.disabled = true; b6.disabled = true; }
    h('div', 'mk-why', det, this.lastMade ?? s.why ?? '');
  }

  audit() {
    const rows = TEXT.rows.map((row) => {
      const s = this.rowState(row);
      return { id: row.id, name: row.name, inKit: s.inKit, carried: s.carried, cap: s.cap, batch: s.batch, can: s.can,
        recipe: s.recipe.map((r) => `${r.id} ${r.have}/${r.need}`) };
    });
    return { mounted: !!this.root, sel: this.sel, rows, buttons: this.root ? [...this.root.querySelectorAll('.mk-btn')].map((b) => b.textContent) : [] };
  }
}
