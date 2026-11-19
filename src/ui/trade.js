/**
 * THE TRADE SCREEN AND THE GUILD NOTICES (Milestone 2 wave 4, area E's ui; HR10, F46; BIBLE 18 "Trade counter: the
 * satchel grid beside the counter's stock; price in salt; the three trade grades as a 3 px rule" with the words
 * TRADE · GIVE · TAKE, and "Guild Notice board: up to three notices as glass cards" with GUILD NOTICE · TAKE · untimed).
 *
 * Glass #1E1A28 at 0.90 (a menu), square corners, the 6 px L ticks, a lilac #D8CCE4 selection line; Chakra Petch for
 * the head, the column words and the names, IBM Plex Mono for the numerals; the world frosted behind it (backdrop blur)
 * and frozen (the presenter's hold: ctx.state 'dialogue'). Each row carries its trade grade as a 3 px rule at its left
 * edge, told apart by SHAPE (common one solid rule, guild two, old-work three), never by a coloured tile. The verb on
 * the screen is TRADE; GIVE and TAKE head its two columns; prices are `SALT ×n`. Click a row to trade one; Escape closes.
 *
 *   openTrade(ctx, counter, { present })              -> Promise<void> (closes on Escape)
 *   openNotices(ctx, counter, notices, { present })   -> Promise<void>
 *   tradeWords()                                      -> the words on the open screen that are not names or numbers
 */
import TRADE from '../game/text/ui/trade.json';

const CSS = `
#cal-trade { position: fixed; inset: 0; z-index: 63; display: none; color: #EFE6D5; backdrop-filter: blur(7px) saturate(0.85); background: rgba(14, 12, 20, 0.28); }
#cal-trade.on { display: block; }
#cal-trade .tr-panel { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(920px, 78vw);
  background: rgba(30, 26, 40, 0.90); padding: 20px 26px 24px; }
#cal-trade .tr-tick { position: absolute; width: 6px; height: 6px; border-color: #D8CCE4; border-style: solid; }
#cal-trade .t1 { left: -1px; top: -1px; border-width: 1px 0 0 1px; } #cal-trade .t2 { right: -1px; top: -1px; border-width: 1px 1px 0 0; }
#cal-trade .t3 { left: -1px; bottom: -1px; border-width: 0 0 1px 1px; } #cal-trade .t4 { right: -1px; bottom: -1px; border-width: 0 1px 1px 0; }
#cal-trade .tr-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid rgba(239,230,213,0.25); padding-bottom: 10px; margin-bottom: 14px; }
#cal-trade .tr-head h3 { margin: 0; font: 600 18px/1 'Chakra Petch', sans-serif; letter-spacing: 0.2em; }
#cal-trade .tr-salt { font: 500 14px/1 'IBM Plex Mono', monospace; letter-spacing: 0.04em; }
#cal-trade .tr-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
#cal-trade h4 { margin: 0 0 8px; font: 600 12px/1 'Chakra Petch', sans-serif; letter-spacing: 0.18em; opacity: 0.75; }
#cal-trade .tr-row { position: relative; display: grid; grid-template-columns: 1fr 52px 92px; align-items: center; padding: 8px 8px 8px 16px; cursor: pointer;
  font: 600 14px/1.2 'Chakra Petch', sans-serif; letter-spacing: 0.04em; border-bottom: 1px solid rgba(239,230,213,0.08); }
#cal-trade .tr-row:hover, #cal-trade .tr-row.sel { box-shadow: inset 0 -1px 0 #D8CCE4; }
#cal-trade .tr-row.off { opacity: 0.42; cursor: default; }
#cal-trade .tr-row .n, #cal-trade .tr-row .p { font: 400 13px/1 'IBM Plex Mono', monospace; text-align: right; }
#cal-trade .tr-grade { position: absolute; left: 4px; top: 7px; bottom: 7px; width: 3px; }
#cal-trade .tr-grade i { position: absolute; left: 0; width: 3px; background: #EFE6D5; opacity: 0.7; }
#cal-trade .tr-notes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
#cal-trade .tr-card { position: relative; background: rgba(30, 26, 40, 0.90); padding: 14px 16px 16px; min-height: 210px; }
#cal-trade .tr-card h5 { margin: 0 0 8px; font: 600 11px/1 'Chakra Petch', sans-serif; letter-spacing: 0.18em; opacity: 0.7; }
#cal-trade .tr-card b { display: block; font: 600 14px/1.25 'Chakra Petch', sans-serif; letter-spacing: 0.05em; margin-bottom: 8px; }
#cal-trade .tr-card p { margin: 0 0 8px; font: 400 12px/1.45 'IBM Plex Mono', monospace; opacity: 0.85; }
#cal-trade .tr-card .from, #cal-trade .tr-card .pays { font: 400 11px/1.4 'IBM Plex Mono', monospace; opacity: 0.7; }
#cal-trade .tr-card .term { position: absolute; right: 14px; top: 13px; font: 400 11px/1 'IBM Plex Mono', monospace; opacity: 0.6; }
#cal-trade .tr-card .take { display: inline-block; margin-top: 10px; font: 600 12px/1 'Chakra Petch', sans-serif; letter-spacing: 0.16em; padding: 6px 0; cursor: pointer; }
#cal-trade .tr-card .take:hover { box-shadow: inset 0 -1px 0 #D8CCE4; }
#cal-trade .tr-card .take.done { opacity: 0.45; cursor: default; box-shadow: none; }
#cal-trade .tr-panel.notes { background: transparent; padding: 0; width: min(1040px, 84vw); }
`;

let root = null;
const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const h = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; parent?.appendChild(e); return e; };
const ticks = (el) => { for (const t of ['t1', 't2', 't3', 't4']) h('i', `tr-tick ${t}`, el); };

function mount() {
  if (root) return root;
  const st = document.createElement('style');
  st.id = 'cal-trade-style';
  st.textContent = CSS;
  document.head.appendChild(st);
  root = h('div', null, document.body);
  root.id = 'cal-trade';
  return root;
}

/** The grade's 3 px rule: one, two or three segments (shape, not colour). */
function grade(row, g) {
  const n = g === 'old-work' ? 3 : g === 'guild' ? 2 : 1;
  const r = h('span', 'tr-grade', row);
  r.dataset.grade = g;
  const seg = 100 / (n * 2 - 1);
  for (let i = 0; i < n; i++) { const s = h('i', null, r); s.style.top = `${i * 2 * seg}%`; s.style.height = `${seg}%`; }
  return r;
}

function hold(present, close) {
  if (!present?._hold) return;
  present._hold();
  present._escape = close;
}

export function openTrade(ctx, counter, { present = null } = {}) {
  const R = mount(), W = TRADE.words, inv = ctx.inventory;
  return new Promise((resolve) => {
    let closed = false;
    const close = () => { if (closed) return; closed = true; R.classList.remove('on'); R.innerHTML = ''; present?._release?.(); ctx.tradeOpen = null; resolve(); };
    const paint = () => {
      R.innerHTML = '';
      const P = h('div', 'tr-panel', R);
      ticks(P);
      const head = h('div', 'tr-head', P);
      h('h3', null, head, W.head);
      h('span', 'tr-salt', head, fill(W.salt, { n: inv?.count?.('metal-shards') ?? 0 }));
      const cols = h('div', 'tr-cols', P);
      const give = h('div', 'tr-col tr-give', cols), take = h('div', 'tr-col tr-take', cols);
      h('h4', null, give, W.give);
      h('h4', null, take, W.take);
      for (const s of counter.rules.takes(inv)) {
        const row = h('div', `tr-row${s.have > 0 ? '' : ' off'}`, give);
        row.dataset.id = s.id;
        grade(row, s.grade);
        h('span', 'nm', row, s.name); h('span', 'n', row, fill(W.have, { n: s.have })); h('span', 'p', row, fill(W.price, { n: s.price }));
        row.addEventListener('click', () => { if (counter.give(s.id).ok) paint(); });
      }
      const salt = inv?.count?.('metal-shards') ?? 0;
      for (const s of counter.rules.stock()) {
        const row = h('div', `tr-row${s.qty > 0 && salt >= s.price ? '' : ' off'}`, take);
        row.dataset.id = s.id;
        grade(row, s.grade);
        h('span', 'nm', row, s.name); h('span', 'n', row, fill(W.have, { n: s.qty })); h('span', 'p', row, fill(W.price, { n: s.price }));
        row.addEventListener('click', () => { if (counter.take(s.id).ok) paint(); });
      }
      take.querySelector('.tr-row')?.classList.add('sel');
    };
    paint();
    R.classList.add('on');
    hold(present, close);
    ctx.tradeOpen = { close, paint, kind: 'trade' };
  });
}

export function openNotices(ctx, counter, N, { present = null } = {}) {
  const R = mount();
  return new Promise((resolve) => {
    let closed = false;
    const close = () => { if (closed) return; closed = true; R.classList.remove('on'); R.innerHTML = ''; present?._release?.(); ctx.tradeOpen = null; resolve(); };
    const paint = () => {
      R.innerHTML = '';
      const P = h('div', 'tr-panel notes', R);
      const grid = h('div', 'tr-notes', P);
      // up to three notices: those not taken first
      const list = N.notices.slice().sort((a, b) => Number(counter.taken.includes(a.id)) - Number(counter.taken.includes(b.id))).slice(0, 3);
      for (const n of list) {
        const c = h('div', 'tr-card', grid);
        ticks(c);
        h('h5', null, c, N.head);
        h('span', 'term', c, n.term);
        h('b', null, c, n.title);
        for (const line of (n.body || []).slice(0, 3)) h('p', null, c, line);
        h('div', 'from', c, n.from);
        h('div', 'pays', c, n.pays);
        const taken = counter.taken.includes(n.id);
        const t = h('span', `take${taken ? ' done' : ''}`, c, N.verb);
        t.addEventListener('click', () => { if (counter.takeNotice(n.id)) paint(); });
      }
    };
    paint();
    R.classList.add('on');
    hold(present, close);
    ctx.tradeOpen = { close, paint, kind: 'notices' };
  });
}

/** The words on the open screen that are neither a name, a numeral nor a notice's own sentence (HR10's "exactly"). */
export function tradeWords() {
  if (!root || !root.classList.contains('on')) return null;
  const out = [];
  for (const el of root.querySelectorAll('h3, h4, h5, .term, .take')) out.push(el.textContent);
  const prices = [...root.querySelectorAll('.p, .tr-salt')].map((e) => e.textContent);
  return { words: out, prices, grades: [...root.querySelectorAll('.tr-grade')].map((g) => g.dataset.grade), rows: root.querySelectorAll('.tr-row').length };
}
