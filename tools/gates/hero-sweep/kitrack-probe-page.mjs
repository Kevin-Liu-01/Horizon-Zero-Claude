/**
 * KT11's page half (Milestone 2 area D, wave 3): the Kit Rack, measured in the page after F43's shot (film.mjs
 * `--probe /tools/gates/hero-sweep/kitrack-probe-page.mjs`; every other frame returns null).
 *
 *   openMs        setOpen(true) to the ring's computed opacity >= 0.99 (rAF-polled; bar <= 120)
 *   centreXK      the ring's box middle as a share of the window's width (bar >= 0.85: never centred)
 *   sectors       the sector paths drawn (bar 5) and the rim's ticks (every 6 deg over 180: 31)
 *   timeScales    the engine's time-scale requests while it is open, other than the filmer's own 'studio' (bar: none;
 *                 the world runs at 1.0)
 *   heapPerFrame  usedJSHeapSize's mean growth a frame over 120 frames with it open and still (Chrome's own counter:
 *                 coarse; GC can only lower it) and the DOM writes it made in them (bar 0)
 *   beforeHandOver  whether setOpen(true) opens it with no Oro kit (bar: false; checked by removing the gaff's `owned`)
 */
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));

export async function probe(f) {
  if (f?.id !== 'F43') return null;
  const C = window.__CTX__, R = C?.quickslots?.rack, E = C?.engine;
  if (!R) return { error: 'no Kit Rack' };
  const out = {};
  // before the hand-over: with the gaff not hers it does not open
  const g = C.combat?.gaff, own0 = g?.owned;
  R.setOpen(false); await raf();
  if (g) g.owned = false;
  R.setOpen(true); out.beforeHandOver = R.open; R.setOpen(false);
  if (g) g.owned = own0;
  await raf(); await raf();
  // the open: time to full opacity
  const el = R.el || document.getElementById('cal-kitrack');
  for (let i = 0; i < 20; i++) await raf();
  const t0 = performance.now();
  R.setOpen(true);
  let openMs = null;
  for (let i = 0; i < 60; i++) {
    await raf();
    const op = Number(getComputedStyle(el).opacity);
    if (op >= 0.99) { openMs = +(performance.now() - t0).toFixed(1); break; }
  }
  out.openMs = openMs;
  const r = R.rect();
  out.centreXK = r?.centreXK != null ? +r.centreXK.toFixed(3) : null;
  out.box = r ? { x: Math.round(r.x), w: Math.round(r.w), h: Math.round(r.h), winW: innerWidth } : null;
  out.sectors = el.querySelectorAll('path.kr-sec').length;
  out.ticks = el.querySelectorAll('line.kr-tick').length;
  out.labels = [...el.querySelectorAll('text.kr-label')].map((t) => t.textContent);
  out.timeScales = E?._ts ? Object.keys(E._ts).filter((k) => k !== 'studio' && E._ts[k] != null) : null;
  // still and open: the heap's growth a frame and the DOM writes it makes
  let writes = 0;
  const mo = new MutationObserver((l) => { writes += l.length; });
  mo.observe(el, { subtree: true, attributes: true, childList: true, characterData: true });
  const h0 = performance.memory?.usedJSHeapSize ?? null;
  for (let i = 0; i < 120; i++) { R.update(1 / 60); await raf(); }
  const h1 = performance.memory?.usedJSHeapSize ?? null;
  mo.disconnect();
  out.heapPerFrame = h0 != null && h1 != null ? Math.round((h1 - h0) / 120) : null;
  out.domWritesIn120 = writes;
  return out;
}
