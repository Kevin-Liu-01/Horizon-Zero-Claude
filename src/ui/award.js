/**
 * THE CERTIFICATION CARD (Milestone 2 wave 4, area E's ui; BIBLE 15, 18 "Certification card: a glass card for 4 s when a
 * rank is granted, with the act counted", `BEARING II · BACK BEARING`). Opened by src/game/certs/live.js.
 *
 * The card: glass #1E1A28 at 0.70 (the HUD's), square corners, the 6 px L ticks; the head CERTIFICATIONS in Chakra Petch;
 * the net as the SKILLS tab draws it (BIBLE 15: 44 px circles with the broad arrow, 1 px rules, never hexagons): three
 * 44 px circles on a triangle of 1 px rules, the granted discipline's circle ruled in lilac with its rank's pips; the
 * line `CERT RANK · PERK` and the act counted under it in IBM Plex Mono. 4 s, then it goes. Two grants in one moment
 * (Ballast I and Bearing I at the re-survey) queue, one card after the other.
 *
 *   showAward(ctx, card, { head, ranks, names, rankWords })   card: { line, act, cert, rank }
 *   awardShapes()   -> { circles: [{ r, d }], rules: [{ w }] }   what the card drew (for the shape row; no hexagon)
 */
const HOLD_MS = 4000;
const R = 22;   // 44 px circles
const CSS = `
#cal-award { position: fixed; left: 50%; top: 16vh; transform: translateX(-50%); z-index: 62; pointer-events: none;
  background: rgba(30, 26, 40, 0.70); color: #EFE6D5; padding: 14px 22px 16px; min-width: 360px; opacity: 0; transition: opacity 0.3s; }
#cal-award.on { opacity: 1; }
#cal-award .aw-tick { position: absolute; width: 6px; height: 6px; border-color: #D8CCE4; border-style: solid; }
#cal-award .t1 { left: -1px; top: -1px; border-width: 1px 0 0 1px; } #cal-award .t2 { right: -1px; top: -1px; border-width: 1px 1px 0 0; }
#cal-award .t3 { left: -1px; bottom: -1px; border-width: 0 0 1px 1px; } #cal-award .t4 { right: -1px; bottom: -1px; border-width: 0 1px 1px 0; }
#cal-award h5 { margin: 0 0 10px; font: 600 11px/1 'Chakra Petch', sans-serif; letter-spacing: 0.16em; opacity: 0.7; }
#cal-award svg { display: block; margin: 0 auto 10px; }
#cal-award b { display: block; font: 600 16px/1.2 'Chakra Petch', sans-serif; letter-spacing: 0.1em; text-align: center; }
#cal-award small { display: block; margin-top: 6px; font: 400 12px/1.4 'IBM Plex Mono', monospace; text-align: center; opacity: 0.75; }
`;

const ORDER = ['transect', 'bearing', 'ballast'];
const queue = [];
let host = null, busy = false, last = null;

function mount() {
  if (host || typeof document === 'undefined') return host;
  const st = document.createElement('style');
  st.id = 'cal-award-style';
  st.textContent = CSS;
  document.head.appendChild(st);
  host = document.createElement('div');
  host.id = 'cal-award';
  host.setAttribute('role', 'status');
  document.body.appendChild(host);
  return host;
}

/** The broad arrow (the guild's mark: three strokes meeting at a point), inside a circle at (cx, cy). */
const broadArrow = (cx, cy, s, ink) => `<path d="M${cx} ${cy - s}V${cy + s * 0.55}M${cx} ${cy - s}L${cx - s * 0.62} ${cy - s * 0.18}M${cx} ${cy - s}L${cx + s * 0.62} ${cy - s * 0.18}" fill="none" stroke="${ink}" stroke-width="1.5" stroke-linecap="square"/>`;

/** The net: three 44 px circles on 1 px rules (a triangle), the granted one in lilac with its pips. */
function netSvg(cert, ranks, names) {
  const W = 220, H = 92;
  const pts = { transect: [36, 66], bearing: [110, 24], ballast: [184, 66] };
  let s = `<svg class="aw-net" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
  const edge = (a, b) => {
    const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
    return `<line x1="${(ax + ux * R).toFixed(1)}" y1="${(ay + uy * R).toFixed(1)}" x2="${(bx - ux * R).toFixed(1)}" y2="${(by - uy * R).toFixed(1)}" stroke="#EFE6D5" stroke-opacity="0.45" stroke-width="1" class="aw-rule"/>`;
  };
  s += edge('transect', 'bearing') + edge('bearing', 'ballast') + edge('ballast', 'transect');
  for (const k of ORDER) {
    const [cx, cy] = pts[k], on = k === cert, ink = on ? '#D8CCE4' : '#EFE6D5';
    s += `<circle class="aw-node" cx="${cx}" cy="${cy}" r="${R - 0.5}" fill="rgba(30,26,40,0.6)" stroke="${ink}" stroke-opacity="${on ? 1 : 0.5}" stroke-width="1"/>`;
    s += broadArrow(cx, cy, 9, on ? ink : 'rgba(239,230,213,0.55)');
    const n = ranks?.[k] ?? 0;
    for (let i = 0; i < n; i++) s += `<rect x="${cx - (n - 1) * 3 + i * 6 - 1.5}" y="${cy + 12}" width="3" height="3" fill="${ink}"/>`;
    void names;
  }
  return `${s}</svg>`;
}

function next() {
  const h = mount();
  if (!h) return;
  const c = queue.shift();
  if (!c) { busy = false; return; }
  busy = true;
  last = c;
  h.innerHTML = `<i class="aw-tick t1"></i><i class="aw-tick t2"></i><i class="aw-tick t3"></i><i class="aw-tick t4"></i><h5></h5>${netSvg(c.card.cert, c.ranks, c.names)}<b></b><small></small>`;
  h.querySelector('h5').textContent = c.head || '';
  h.querySelector('b').textContent = c.card.line;
  h.querySelector('small').textContent = c.card.act || '';
  h.classList.add('on');
  setTimeout(() => { h.classList.remove('on'); setTimeout(next, 350); }, HOLD_MS);
}

export function showAward(ctx, card, { head = '', ranks = {}, names = {} } = {}) {
  queue.push({ card, head, ranks: { ...ranks }, names });
  if (!busy) next();
  if (ctx) ctx.awardShown = (ctx.awardShown ?? 0) + 1;
}

/** What the card on screen is drawn of: its circles (radius, diameter) and its rules (width), and its words. */
export function awardShapes() {
  if (!host) return null;
  const circles = [...host.querySelectorAll('circle')].map((c) => { const r = Number(c.getAttribute('r')) + 0.5; return { r, d: r * 2 }; });
  const rules = [...host.querySelectorAll('line')].map((l) => ({ w: Number(l.getAttribute('stroke-width')) }));
  const polys = host.querySelectorAll('polygon, polyline').length;
  return { circles, rules, polygons: polys, line: host.querySelector('b')?.textContent ?? null, act: host.querySelector('small')?.textContent ?? null, on: host.classList.contains('on'), last: last?.card ?? null };
}
