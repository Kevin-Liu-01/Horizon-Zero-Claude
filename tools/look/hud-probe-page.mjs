/**
 * M1.6g1 HUD PROBE — the page half (lane ui). Run by tools/frames/film.mjs --probe after a HUD frame (F03)
 * is staged and screenshotted, so the first numbers describe the filmed frame exactly.
 *
 *   probe(frame) -> {
 *     calm:     { surfaces, on: [group ids], calm }   the HUD's own surface audit at the filmed instant
 *     boxCover: { pct, cells, rects }                 union of the painted boxes of every visible HUD element
 *                                                     on a 4 px grid: an UPPER bound on cover (a box counts whole);
 *                                                     rects [l, t, r, b, glass] feed tools/look/hud-cover.mjs
 *     hud:      { weapon, quickSlots, stamina, tracker, tip, tools, compass }  the audit rows, trimmed
 *     keys:     { k2: {...}, k1: {...}, k3: {...}, pass }  quick slots driven by real keydown events on window
 *   }
 * The key test unfreezes the game clock for ~3 s and freezes it again; film.mjs unstages after.
 * Reads only: window.__CTX__ (engine, combat, quickslots, events) and window.__HUD_DEBUG__.
 */
export async function probe(frame) {
  const C = window.__CTX__, E = C.engine, H = window.__HUD_DEBUG__;
  if (!H) return { error: 'no __HUD_DEBUG__' };
  if (!frame?.state?.hud) return { skipped: 'frame has no HUD' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const W = window.innerWidth, Hh = window.innerHeight;
  const out = {};

  /* ---- 1. what the filmed frame shows ---- */
  const s = H.surfaces();
  out.calm = s.calm;
  out.hud = {
    weapon: s.weapon, quickSlots: s.quickSlots, stamina: s.stamina,
    tracker: { visible: s.tracker.visible, opacity: s.tracker.opacity, rect: s.tracker.rect },
    tip: s.tip, tools: s.tools, vitals: { visible: s.health.visible },
    compass: { visible: s.compass?.visible ?? null },
  };

  /* ---- 2. the boxes' cover: every visible leaf-ish element under #hud, painted box, union on a 4 px grid ---- */
  const G = 4, gw = Math.ceil(W / G), gh = Math.ceil(Hh / G);
  const grid = new Uint8Array(gw * gh);
  const eff = (el) => {
    let a = 1;
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      a *= parseFloat(cs.opacity) || 0;
      if (a <= 0) return 0;
    }
    return a;
  };
  const hud = document.getElementById('hud');
  const painted = (el) => {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none';
    const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    return bg || text || el.tagName === 'svg' || el.tagName === 'KBD' || cs.borderBottomWidth !== '0px';
  };
  let n = 0;
  const rects = [];   // [l, t, r, b, glass]: every painted visible box; hud-cover.mjs reads them beside the PNGs
  for (const el of hud ? hud.querySelectorAll('*') : []) {
    if (el.closest('svg') && el.tagName !== 'svg') continue;
    if (!painted(el) || eff(el) < 0.04) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= Hh) continue;
    rects.push([Math.floor(r.left), Math.floor(r.top), Math.ceil(r.right), Math.ceil(r.bottom), el.classList.contains('cal-glass') ? 1 : 0]);
    const x0 = Math.max(0, Math.floor(r.left / G)), x1 = Math.min(gw, Math.ceil(r.right / G));
    const y0 = Math.max(0, Math.floor(r.top / G)), y1 = Math.min(gh, Math.ceil(r.bottom / G));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (!grid[y * gw + x]) { grid[y * gw + x] = 1; n++; } }
  }
  out.boxCover = { pct: Math.round(n / (gw * gh) * 10000) / 100, cells: n, grid: G, viewport: [W, Hh], rects };

  /* ---- 3. keys 1 and 2 switch weapons (and 3 is empty) ---- */
  const press = async (code) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.slice(-1), bubbles: true }));
    await sleep(60);
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code.slice(-1), bubbles: true }));
  };
  const read = () => {
    const m = C.combat?.melee, a = H.surfaces();
    return {
      stance: m?.stance ?? null, lanceInHand: !!m?.lanceInHand,
      activeWeapon: C.combat?.activeWeapon?.id ?? null,
      activeSlot: C.quickslots?.activeSlot ?? null,
      hudName: a.weapon.name, hudSlot: a.quickSlots.active,
      hudOn: a.quickSlots.cells.filter((c) => c.on).map((c) => c.slot),
    };
  };
  const empties = [];
  const off = C.events?.on?.('quick-slot-empty', (e) => empties.push(e?.slot));
  E.requestTimeScale('studio', null);
  try {
    C.input.enabled = true;
    const k0 = read();
    await press('Digit2'); await sleep(1100);
    const k2 = read();
    await press('Digit1'); await sleep(1100);
    const k1 = read();
    await press('Digit3'); await sleep(400);
    const k3 = { ...read(), emptyEvent: empties.includes(3) };
    out.keys = {
      k0, k2, k1, k3,
      pass: k2.lanceInHand && k2.activeSlot === 2 && k2.hudSlot === 2 && /LANCE/.test(k2.hudName)
        && !k1.lanceInHand && k1.activeSlot === 1 && k1.hudSlot === 1 && /BOW/.test(k1.hudName) && /bow/.test(k1.activeWeapon || '')
        && k3.activeSlot === 1 && k3.emptyEvent === true,
    };
  } finally {
    if (typeof off === 'function') off();
    E.requestTimeScale('studio', 0);
  }
  return out;
}
