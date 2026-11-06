/**
 * ROUND 5 — lane `shell-ui` gates (docs/ROUND5-PLAN.md §9 "shell-ui", R57; absorbs
 * `gates.round4.{shell-hud,shell-menus,focus-items}.mjs`).
 *
 *   nice -n 10 node tools/gates.mjs --port 5265 --lane shell-ui
 *
 * Round-4 rows are not re-typed: `re()` takes the carried row (tools/gates.r5.carried.mjs),
 * re-stages it by exact-string patches (a patch that no longer matches THROWS at load, so a
 * drift in the carried row is a LOAD-FAIL, not a silent no-op), and the result SHADOWS the
 * carried id (plan §3.3). Rows the plan renamed shadow their carried id too, so
 * `--lane carried` never grades the retired Round-4 language.
 *
 * Ids the plan names that another lane's file already claims get a suffix here, because
 * two lane files cannot define one id (gates.config.mjs keeps the alphabetically first):
 *   A-ui-words            -> A-ui-words-all (brand keeps its W0 row)
 *   A-lamp-canon-distance -> A-lamp-canon-distance-ui (runs instruments-core's own check)
 *
 * Rows that need W2 content stay PENDING with the reason in their detail: the Kit Rack and
 * tool slots (combat-kit), new kinds' Flag pips and parts (instruments-a/b), the tracker's
 * real data (progression W3).
 */
import { readFileSync, existsSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GATES as CARRIED } from './gates.r5.carried.mjs';
import { staged, stagedSetup, SKIP_CARD } from './gate-roster.mjs';

const LANE = 'shell-ui';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAN = readFileSync(path.join(ROOT, 'docs/ROUND5-PLAN.md'), 'utf8');
const BIBLE = readFileSync(path.join(ROOT, 'docs/ROUND5-BIBLE.md'), 'utf8');

/** The plan's bullet for a row, verbatim: a judge grades the plan's words, never a paraphrase here. */
function planBullet(id) {
  const line = PLAN.split('\n').find((l) => l.startsWith('- **') && l.includes(id));
  if (!line) throw new Error('plan §9 bullet not found: ' + id);
  return line.replace(/^- /, '').replace(/\*\*/g, '');
}
const INCREDIBLE = ' || R54 (d): every judge also asks whether the frame looks incredible next to its reference: a frame that passes the words and looks cheap is a major finding. R55: type is Chakra Petch + IBM Plex Mono only; engraved surveying instruments, right angles, hairlines, no hexagons.';

/** The A-ui-words regex, from the plan bullet (so this file never spells the words). */
const UI_WORDS_RE = (() => {
  const line = PLAN.split('\n').find((l) => l.includes('**A-ui-words** (brand surfaces'));
  const m = line && line.match(/`\/(.+?)\/i`/);
  if (!m) throw new Error('A-ui-words regex not found in the plan');
  return m[1];
})();

/** Bible §8.9's tutorial cards, in order, parsed from the bible's own table. */
const BIBLE_CARDS = (() => {
  const sec = BIBLE.slice(BIBLE.indexOf('**Tutorial cards**'), BIBLE.indexOf('**Walked leg.**'));
  const rows = [];
  for (const line of sec.split('\n')) {
    const m = line.match(/^\| (\d:\d\d) \| (.+) \|$/);
    if (!m) continue;
    for (const text of m[2].split(' · ')) rows.push({ beat: m[1], text: text.trim() });
  }
  if (rows.length < 10) throw new Error('bible §8.9 card table not parsed');
  return rows;
})();

/** Carried row -> this lane's row: exact-string patches, overrides, same id unless renamed. */
function re(id, { newId, patch = [], setupPatch = [], criteria, title, reference, settle, timeout, extraBefore = '' } = {}) {
  const row = CARRIED.find((g) => g.id === id);
  if (!row) throw new Error('carried row not found: ' + id);
  const d = Object.getOwnPropertyDescriptors(row);
  const out = Object.defineProperties({}, d);
  const hit = (src, list, which) => {
    let s = src;
    for (const [from, to] of list) {
      if (!s.includes(from)) throw new Error(`${id}: ${which} patch no longer matches: ${String(from).slice(0, 80)}`);
      s = s.split(from).join(to);
    }
    return s;
  };
  if (d.assert && patch.length) out.assert = hit(row.assert, patch, 'assert');
  if (d.setup && setupPatch.length) out.setup = hit(row.setup, setupPatch, 'setup');
  out.id = newId ?? id;
  out.lane = LANE;
  if (criteria) out.criteria = criteria;
  if (title) out.title = title;
  if (reference) out.reference = reference;
  if (settle != null) out.settle = settle;
  if (timeout != null) out.timeout = timeout;
  return out;
}

/* ------------------------------------------------- page-context helpers */

const FRAMES = `
  const frames = async (n) => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); };
  const wait = (ms) => new Promise(r => setTimeout(r, ms));`;

/** Leave localStorage exactly as it was found. */
const STORAGE_GUARD = `
  const snapStorage = () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; };
  const restoreStorage = (snap) => {
    try {
      const now = [];
      for (let i = 0; i < localStorage.length; i++) now.push(localStorage.key(i));
      for (const k of now) if (!(k in snap)) localStorage.removeItem(k);
      for (const k of Object.keys(snap)) if (localStorage.getItem(k) !== snap[k]) localStorage.setItem(k, snap[k]);
    } catch { /* storage off */ }
  };`;

/** Plant the player `dist` metres from `target` on bearing `ang`, facing it. */
const FACE = `
  const faceTarget = (target, dist, ang, pitch) => {
    const p = __CTX__.player;
    p.position.set(target.x + Math.sin(ang) * dist, 0, target.z + Math.cos(ang) * dist);
    p.velocity?.set?.(0, 0, 0);
    p._snapToGround?.();
    p.camYaw = ang;
    p.camPitch = pitch ?? -0.03;
    p.heading = ang + Math.PI;
  };`;

/**
 * Where to stand, found by occlusion and named by no coordinate: outward from where she spawned, the
 * first open ground (no trunk or crown within 9 m of the subject) with a bearing whose whole sight line,
 * from behind the camera to the subject, is free of trunks and crowns, the sun over the shoulder.
 */
const CLEAR_BEARING = `
  const clearBearing = () => {
    const c = __CTX__, col = c.collision, T = c.terrain, sun = c.environment?.sunDir;
    const sea = c.water?.seaLevel ?? -1e9;
    const isCover = (e) => e.kind === 'tree' || e.kind === 'canopy' || e.occluder === true;
    const buf = [];
    const coverAt = (x, z, r) => {
      const y = T.getHeight(x, z);
      return col.sphereQuery(x, y + 1.5, z, r, buf, isCover).length + col.sphereQuery(x, y + 6, z, r, buf, isCover).length;
    };
    const pp = c.player.position;
    let best = null;
    for (let ring = 1; ring <= 9 && !(best && best.score <= -1); ring++) {
      const R = ring * 22, steps = ring * 8;
      for (let s = 0; s < steps; s++) {
        const a0 = s / steps * 6.2832;
        const x = pp.x + Math.sin(a0) * R, z = pp.z + Math.cos(a0) * R;
        const y = T.getHeight(x, z);
        if (y < sea + 1 || coverAt(x, z, 9) > 0) continue;
        for (let b = 0; b < 16; b++) {
          const ang = b / 16 * 6.2832;
          const sx = Math.sin(ang), cz = Math.cos(ang);
          let cover = 0, rough = 0;
          for (let d = 3; d <= 24; d += 3) {
            const qx = x + sx * d, qz = z + cz * d;
            cover += coverAt(qx, qz, 5);
            rough += Math.abs(T.getHeight(qx, qz) - y);
          }
          if (cover > 0) continue;
          const sunK = sun ? Math.min(0.7, sx * sun.x + cz * sun.z) : 0;
          const score = rough * 0.05 - sunK * 2 + R * 0.002;
          if (!best || score < best.score) best = { x, z, ang, score, sunK: +sunK.toFixed(2), R };
        }
      }
    }
    return best;
  };`;

/**
 * Sighting on the herd kind at 15 m: frozen, composed, the card up, on a clear bearing. `yawK` turns
 * the camera off the Instrument so it stands clear of her and still under the crosshair's reading.
 */
const SIGHT_STAGE = (on, hideHero = false, yawK = 0.22) => `
  ${FRAMES}${FACE}${CLEAR_BEARING}
  const ctx = __CTX__;
  ctx.input.enabled = true;
  ${hideHero ? 'if (ctx.player.model) ctx.player.model.visible = false;   /* her violet cloth is the people\'s colour, not the overlay\'s: bible §9.1 */' : ''}
  const spot = clearBearing();
  if (!spot) return null;
  let m = null, mate = null;
  try {
    m = spawnRole('herd', spot.x, spot.z);
    /* a second of the herd, off the sight line: the others are drawn quietly */
    mate = spawnRole('herd', spot.x - Math.cos(spot.ang) * 13 - Math.sin(spot.ang) * 9, spot.z + Math.sin(spot.ang) * 13 - Math.cos(spot.ang) * 9);
  } catch (e) { /* the null below names it */ }
  if (!m) return null;
  await wait(700);
  /* r5-all-machines: freeze */
  for (const x of ctx.machines.list) if (x.alive !== false) x.update = () => {};
  const ang = spot.ang;
  const aim = () => { faceTarget(m.position, 15, ang, -0.08); ctx.player.camYaw = ang + ${yawK}; };
  aim();
  await frames(10);
  ${on ? `ctx.sighting.toggle(true);
  const t0 = performance.now();
  while (performance.now() - t0 < 9000) {
    await wait(200);
    aim();
    if (ctx.sighting.audit().cardVisible && performance.now() - t0 > 900) break;
  }
  await wait(600);` : `const t0 = performance.now();
  while (performance.now() - t0 < 2000) { await wait(200); aim(); }`}
  aim();
  return m;`;

/** The combat scene: 40 % HP, aiming, an Instrument engaged, a tool slot full (V10 / V37). */
const TOOLS_FULL = `for (const __s of (__CTX__.items?.tools?.slots ?? [])) __CTX__.inventory?.add?.(__s.id, 4); __CTX__.items?.tools?.refresh?.();`;

/* ---------------------------------------------------------------- rows */

const V37_CRITERIA = planBullet('V10-hud / V37-hud-language') + INCREDIBLE;

const r10 = re('V37-hud-language', {
  newId: 'V10-hud-language',
  title: 'The field-book HUD at 40 % HP, aiming, Instrument engaged, tool slot full',
  criteria: V37_CRITERIA,
  setupPatch: [["const STAGE_DIST = 20;", `const STAGE_DIST = 20; ${TOOLS_FULL}`]],
});
const r37 = re('V37-hud-language', {
  title: 'The field-book HUD at 40 % HP, aiming, Instrument engaged, tool slot full',
  criteria: V37_CRITERIA,
  setupPatch: [["const STAGE_DIST = 20;", `const STAGE_DIST = 20; ${TOOLS_FULL}`]],
});

/** A damage number gives way to what she reads: thrown at the vial's word, at a plate and at the column. */
const A_DMG_CLEAR = {
  id: 'A-dmg-chip-clear', kind: 'action', lane: LANE, timeout: 180000, settle: 900,
  title: 'A damage number anchored on the circle and the vial, on a plate or on the column lands clear of all of them; in the open it stays on its anchor',
  setup: r37.setup,
  assert: `(async () => {${FRAMES}
    const c = __CTX__, hud = c.hud, cam = c.camera;
    const V3 = cam.position.constructor;
    const at = (sx, sy) => {
      const d = new V3(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1, 0.5).unproject(cam).sub(cam.position).normalize();
      return cam.position.clone().addScaledVector(d, 12);
    };
    const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const seen = (e) => { const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && e.getBoundingClientRect().width > 0; };
    const fixed = () => {
      const out = [];
      for (const sel of ['.cal-vial', '.cal-compass', '.cal-topleft']) { const e = document.querySelector(sel); if (e && seen(e)) out.push({ sel, r: e.getBoundingClientRect() }); }
      for (const e of document.querySelectorAll('.cal-mhb-plate')) if (seen(e)) out.push({ sel: 'plate', r: e.getBoundingClientRect() });
      return out;
    };
    const centre = (r) => [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
    const word = document.querySelector('.cal-eye-label').getBoundingClientRect();
    const plateEl = fixed().find((f) => f.sel === 'plate');
    const anchors = [
      ['vial word', ...centre(word)],
      ['circle', innerWidth / 2, 60],
      ['column', ...centre(document.querySelector('.cal-staff').getBoundingClientRect())],
    ];
    if (plateEl) anchors.push(['plate', ...centre(plateEl.r)]);
    const rows = [];
    for (const [name, sx, sy] of anchors) {
      hud._dmgPool.forEach((d) => { d.active = false; d.el.style.visibility = 'hidden'; });
      hud._popNumber(at(sx, sy), '340', 'weak', 1.0, 30 * hud._scale);
      const d = hud._dmgPool.find((q) => q.active);
      const hits = [];
      let first = null;
      for (const w of [3, 14, 24]) {
        await frames(w === 3 ? 3 : 11);
        const r = d.el.getBoundingClientRect();
        for (const f of fixed()) if (hit(r, f.r)) { hits.push(f.sel + '@' + w); first ??= { chip: [r.left, r.top, r.right, r.bottom].map(Math.round), other: [f.r.left, f.r.top, f.r.right, f.r.bottom].map(Math.round) }; }
      }
      rows.push({ name, hits: [...new Set(hits)], first });
    }
    /* in the open it stays with what was hit */
    hud._dmgPool.forEach((d) => { d.active = false; d.el.style.visibility = 'hidden'; });
    const ox = innerWidth * 0.72, oy = innerHeight * 0.66;
    hud._popNumber(at(ox, oy), '34', 'weak', 1.0, 22 * hud._scale);
    const od = hud._dmgPool.find((q) => q.active);
    await frames(3);
    const orect = od.el.getBoundingClientRect();
    /* against where its point projects now: the stage's camera is still settling onto the aim */
    const op = od.world.clone().project(cam);
    const px = (op.x * 0.5 + 0.5) * innerWidth, py = (-op.y * 0.5 + 0.5) * innerHeight;
    const openOk = Math.abs((orect.left + orect.right) / 2 - px) < 34 && Math.abs(orect.bottom - py) < 50;
    const failed = rows.filter((x) => x.hits.length).map((x) => x.name);
    return { pass: failed.length === 0 && openOk && !!plateEl, detail: { failed, rows, openOk, open: [Math.round(orect.left), Math.round(orect.bottom)], plateUp: !!plateEl } };
  })()`,
};

/** A row's assert, shadowing a carried id it replaces: same body, the old name. */
const alias = (row, carriedId) => Object.defineProperties({}, {
  ...Object.getOwnPropertyDescriptors(row),
  id: { value: carriedId, enumerable: true, writable: true, configurable: true },
  title: { value: `${row.title} (replaces the Round-4 row ${carriedId})`, enumerable: true, writable: true, configurable: true },
});

const A71D = {
  id: 'A71d-steady-breath-meter', kind: 'action', lane: LANE,
  title: 'Steady: a hairline breath meter under the reticle drains while it is held; no veil, no desaturation',
  timeout: 150000, settle: 1200,
  assert: staged([], `(async () => {
    ${FRAMES}
    const hud = window.__HUD_DEBUG__;
    if (!hud) return { pass: false, detail: 'no window.__HUD_DEBUG__' };
    const c = __CTX__, combat = c.combat;
    c.input.enabled = true;
    c.input.mouse.buttons |= 4;                 // aim, through the bit player.js reads
    await frames(30);
    if (!c.player.aiming) return { pass: false, detail: 'staging: RMB did not raise the aim' };
    const before = hud.surfaces().breath;
    // Shift, on the real edge combat.js arms on
    c.input.keys.add('ShiftLeft');
    const rows = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 2600) {
      await wait(260);
      const b = hud.surfaces().breath;
      rows.push({ ms: Math.round(performance.now() - t0), frac: b.fillFrac, gauge: +(combat?.steady?.gauge ?? -1).toFixed(3), active: !!combat?.steady?.active, vis: b.visible, ts: +(c.engine?.timeScale ?? 1).toFixed(3) });
    }
    const during = hud.surfaces().breath;
    /* what the frame paints while Steady is held: no full-screen overlay, no desaturation */
    const fullscreen = [...document.querySelectorAll('body > *, #hud > *')].filter((n) => {
      if (n.id === 'app' || n.id === 'hud' || n.id === 'title' || n.id === 'loading' || n.id === 'calf-layer' || n.id === 'cal-menus' || n.id === 'cal-calima') return false;
      const cs = getComputedStyle(n), r = n.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.02) return false;
      if (r.width < innerWidth * 0.9 || r.height < innerHeight * 0.9) return false;
      const bg = cs.backgroundColor, img = cs.backgroundImage;
      return (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || img !== 'none' || cs.mixBlendMode !== 'normal';
    }).map((n) => n.id || n.className);
    const veil = document.getElementById('cal-veil');
    const canvasFilter = c.renderer?.domElement?.style?.filter || '';
    c.input.keys.delete('ShiftLeft');
    await frames(10);
    const released = !combat?.steady?.active;
    const fr = rows.map((r) => r.frac);
    let drains = fr.length >= 5;
    for (let i = 1; i < fr.length; i++) if (fr[i] > fr[i - 1] + 0.005) drains = false;
    const checks = {
      armed: rows.some((r) => r.active),
      visibleWhileHeld: rows.every((r) => r.vis),
      drains: drains && fr[fr.length - 1] < fr[0] - 0.08,
      isTheGauge: rows.every((r) => Math.abs(r.frac - r.gauge) < 0.06),
      hairline: during.heightPx <= 4,
      underReticle: during.belowReticlePx > 20 && during.belowReticlePx < 120,
      noVeilElement: !veil,
      noFullScreenOverlay: fullscreen.length === 0,
      noDesaturation: canvasFilter === '',
      released,
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return { pass: failed.length === 0, detail: { failed, before, during, rows, fullscreen,
      pendingClauses: ['timeScale 1.0 and the 4 s duration: combat.js still slows time and drains over 6 s; the breath-hold is combat-kit W2 (E42), measured here: ts ' + rows[rows.length - 1]?.ts] } };
  })()`),
};

const A62 = re('A62-focus-components', {
  newId: 'A62-sighting-components',
  title: 'Sighting lists NAMED components with their loot, and labels each one in the world',
  // the label chips hang off leaders now; every clause and bar stands
});
const A63 = re('A63-loot-reveals', {
  patch: [["const crateRow = loots.find((r) => /CRATE/.test(r.name || ''));", "const crateRow = loots.find((r) => /CACHE|CRATE/.test(r.name || ''));"]],
});

const V36 = {
  id: 'V36-sighting-scan', kind: 'visual', lane: LANE,
  reference: 'reference/r5/gates-perf/surveyor-sighting (a surveyor sighting through a theodolite)',
  title: 'Sighting on the herd kind at 15 m',
  criteria: planBullet('V36-sighting-scan') + INCREDIBLE,
  settle: 900, timeout: 120000,
  setup: stagedSetup(['herd'], `(async () => {
    const __m = await (async () => { ${SIGHT_STAGE(true)} })();
    if (!__m) { __skipCard('STAGING FAILED: no herd kind could be staged: this frame has no subject'); }
  })()`),
};

const A_SIGHTING_OFF = {
  id: 'A-sighting-off', kind: 'action', lane: LANE, timeout: 120000, settle: 600,
  title: 'A-sighting, control frame: the same stage with the alidade down (A-sighting-hue subtracts it)',
  assert: staged(['herd'], `(async () => {
    const m = await (async () => { ${SIGHT_STAGE(false, true)} })();
    return { pass: m ? true : null, detail: { kind: m?.kind ?? null, role: 'control frame for A-sighting-hue' } };
  })()`),
};

const A_SIGHTING = {
  id: 'A-sighting', kind: 'action', lane: LANE, timeout: 120000, settle: 600,
  title: 'Sighting on a herd kind at 15 m: named components with loot, cobalt rings, white transect dashes, a <= 20 % sepia vignette; no violet or teal anywhere in the overlay',
  assert: staged(['herd'], `(async () => {
    const m = await (async () => { ${SIGHT_STAGE(true, true)} })();
    if (!m) return { pass: null, detail: 'SKIP-R18: no herd kind stands' };
    const ctx = __CTX__, S = ctx.sighting;
    const a = S.audit();
    const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return { h: 0, s: 0 }; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return { h, s }; };
    const banned = (r, g, b) => { const { h, s } = hsl(r, g, b); return s > 0.4 && ((h >= 250 && h <= 290) || (h >= 160 && h <= 185)); };
    /* every colour the overlay's DOM paints */
    const domHits = [];
    const scan = (root) => {
      for (const n of [root, ...root.querySelectorAll('*')]) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        for (const k of ['color', 'backgroundColor', 'borderLeftColor', 'borderTopColor', 'stroke', 'fill']) {
          const mm = String(cs[k]).match(/rgba?\\((\\d+), (\\d+), (\\d+)(?:, ([\\d.]+))?\\)/);
          if (mm && (mm[4] === undefined || +mm[4] > 0.02) && banned(+mm[1], +mm[2], +mm[3])) domHits.push((n.className?.baseVal ?? n.className) + ' ' + k + ' ' + cs[k]);
        }
      }
    };
    scan(document.getElementById('calf-layer'));
    scan(document.querySelector('.calf-tint'));
    /* every colour the overlay's 3D shells paint */
    const col3d = [];
    const pick = (mat, names) => { for (const nm of names) { const u = mat?.uniforms?.[nm]?.value; if (u?.isColor) col3d.push({ nm, hex: u.getHexString() }); } };
    pick(S._figureMat, ['uInk', 'uPaper']); pick(S._ringMat, ['uColor']);
    for (const e of S._paths.values()) pick(e.mat, ['uPaper', 'uInk']);
    pick(S._gatherMat, ['uColor']);
    const hits3d = col3d.filter((c) => { const v = parseInt(c.hex, 16); return banned(v >> 16, (v >> 8) & 255, v & 255); });
    const ring = getComputedStyle(document.querySelector('.calf-ring'));
    const rings = a.rings || [];
    const comps = a.card?.components ?? [];
    const withLoot = comps.filter((c) => (c.loot?.length ?? 0) > 0);
    const hasParts = Array.isArray(m.parts) && m.parts.some((p) => p && (p.weak || p.tearable || p.tearHp > 0));
    /* the drawn figure: its mask holds coverage over the staged Instrument, none in the far corner */
    const figure = (() => {
      const r = ctx.renderer, rt = S._figureRT;
      if (!S._figure.visible || !S._hulls.size || rt.width < 16) return { pass: false, visible: S._figure.visible, hulls: S._hulls.size, w: rt.width };
      const px = new Uint8Array(rt.width * rt.height * 4);
      r.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, px);
      let covered = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] > 127) covered++;
      const frac = covered / (rt.width * rt.height);
      return { pass: frac > 0.0005 && frac < 0.5 && (px[0] === 0), covered, frac: +frac.toFixed(5), hulls: S._hulls.size, size: [rt.width, rt.height] };
    })();
    const carries = (document.querySelector('.calf-card')?.innerText || '').includes('CARRIES');
    const pendingClauses = [];
    if (!hasParts) pendingClauses.push('components with loot: the staged kind (' + m.kind + ') has no named parts yet (R18; instruments-a W1 merges them); its weak points and carried loot are graded instead');
    if (!a.paths.count) pendingClauses.push('transects: no route on the staged Instrument');
    const checks = {
      cardUp: a.cardVisible === true,
      namedComponents: comps.length >= 1 && comps.every((c) => typeof c.name === 'string' && c.name.trim().length > 1),
      lootListed: hasParts ? withLoot.length >= 1 : carries,
      cobaltRings: rings.length >= 1 && ring.stroke === 'rgb(44, 79, 138)',
      leaderLines: (a.leaders ?? 0) >= 1,
      vignetteAtMost20: a.vignette.maxAlpha <= 0.2 && a.vignette.centerAlpha <= 0.02,
      noCanvasWash: !(ctx.renderer?.domElement?.style?.filter),
      domNoBannedHue: domHits.length === 0,
      shaderNoBannedHue: hits3d.length === 0,
      readouts: /^\\d{3}$/.test(a.readouts.bearing) && /^(\\d{3,}|---)$/.test(a.readouts.distance),
      transectsWhite: !a.paths.count || [...S._paths.values()].every((e) => e.mat.uniforms.uPaper.value.getHexString() === 'dbd3c5' || e.mat.uniforms.uPaper.value.r > 0.8),
      figureDrawn: figure.pass === true,
      oneSightedInFull: [...S._hulls.values()].filter((e) => !e.quiet).length === 1 && a.figure.subject === m.kind,
      revealsOffTheSubject: (() => { const b = S._hideBox, o = [...document.querySelectorAll('.calf-reveal')].filter((e) => e.style.display !== 'none' && e.offsetParent !== null).map((e) => e.getBoundingClientRect()); return o.every((r) => r.right <= b[4] || r.left >= b[6] || r.bottom <= b[5] || r.top >= b[7]); })(),
      transectsFew: a.paths.count <= 2,
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return { pass: failed.length === 0, detail: { failed, figure, kind: m.kind, components: comps.map((c) => c.name), rings, leaders: a.leaders, vignette: a.vignette, paths: a.paths, readouts: a.readouts, figureCast: a.figure, domHits: domHits.slice(0, 8), col3d, pendingClauses } };
  })()`),
};

/**
 * The overlay's hue histogram, literally: the ON frame's pixels in the banned hues, minus the control
 * frame's. R61 (c): a pixel whose largest channel is under 24 has no visible hue and is not counted;
 * above that floor the bar is 0 %, with no tolerance.
 */
const HUE_FLOOR = 24;
const hueCount = async (file) => {
  const { default: sharp } = await import('sharp');
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let violet = 0, teal = 0, belowFloor = 0;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 0.02) continue;
    const l = (mx + mn) / 2, s = d / (1 - Math.abs(2 * l - 1));
    if (s <= 0.4) continue;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
    const banned = (h >= 250 && h <= 290) || (h >= 160 && h <= 185);
    if (!banned) continue;
    if (mx * 255 < HUE_FLOOR) { belowFloor++; continue; }
    if (h >= 250) violet++; else teal++;
  }
  const n = info.width * info.height;
  return { pixels: n, violet, teal, belowFloor, violetPct: +(violet / n * 100).toFixed(4), tealPct: +(teal / n * 100).toFixed(4) };
};
const A_SIGHTING_HUE = {
  id: 'A-sighting-hue', kind: 'runner', lane: LANE, timeout: 60000,
  title: 'The Sighting frame adds 0 % of pixels in 250-290 deg (violet) or 160-185 deg (teal) above 0.4 saturation against the control frame of the same stage, counting no pixel whose largest channel is under 24 (R61 c)',
  async check() {
    const dir = path.join(process.cwd(), 'shots/gates');
    const on = path.join(dir, 'A-sighting.png'), off = path.join(dir, 'A-sighting-off.png');
    if (!existsSync(on) || !existsSync(off)) return { pass: null, detail: { why: 'run A-sighting-off and A-sighting first, in the same run', dir } };
    if (Date.now() - statSync(on).mtimeMs > 1500000) return { pass: null, detail: 'frames are stale: run all three in one run' };
    const a = await hueCount(on), b = await hueCount(off);
    const addV = Math.max(0, a.violet - b.violet), addT = Math.max(0, a.teal - b.teal);
    return { pass: addV === 0 && addT === 0, detail: { on: a, off: b, addedVioletPx: addV, addedTealPx: addT, floor: HUE_FLOOR } };
  },
};

/**
 * The frame the composer finished, and the same frame with the overlay on it: read in one task, either
 * side of the overlay's own hook, so no animation or camera lies between the two.
 */
const OVERLAY_DIFF = `
  const overlayFrame = (extra) => new Promise((res) => {
    const c = __CTX__, r = c.renderer, gl = r.getContext(), S = c.sighting;
    const hooks = c.engine.onAfterRender;
    const w = r.domElement.width, h = r.domElement.height;
    const read = () => { r.setRenderTarget(null); const b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
    let before = null;
    const pre = () => { before = read(); };
    const post = () => {
      const after = read();
      const more = extra ? extra() : null;
      hooks.splice(hooks.indexOf(pre), 1);
      hooks.splice(hooks.indexOf(post), 1);
      res({ before, after, more, w, h });
    };
    hooks.splice(hooks.indexOf(S._afterComposer), 0, pre);
    hooks.splice(hooks.indexOf(S._afterComposer) + 1, 0, post);
  });`;

/** Her silhouette, independent of how the overlay knows it: every mesh under her that is really visible, drawn into a private target. */
const HER_SILHOUETTE = `
  const herSilhouette = () => {
    const c = __CTX__, r = c.renderer, S = c.sighting;
    const w = r.domElement.width, h = r.domElement.height;
    const scene = new S._maskScene.constructor();     /* three's classes, through objects already live */
    const rt = S._figureRT.clone();
    rt.samples = 0;
    rt.setSize(w, h);
    let meshes = 0;
    const shown = (o) => { for (let a = o; a; a = a.parent) if (!a.visible) return false; return true; };
    c.player.model.traverse((o) => {
      if (!o.isMesh || !shown(o)) return;
      const ov = S._overlayFor(o, S._hullMaskMat);
      S._maskScene.remove(ov);
      scene.add(ov);
      meshes++;
    });
    const clearA = r.getClearAlpha();
    const clearC = r.getClearColor(new S._shared.uInk.value.constructor());
    const auto = r.autoClear;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.autoClear = false;
    r.render(scene, c.camera);
    r.autoClear = auto;
    r.setClearColor(clearC, clearA);
    const px = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(rt, 0, 0, w, h, px);
    r.setRenderTarget(null);
    rt.dispose();
    return { px, meshes };
  };`;

/**
 * R54, the row that keeps Brea in the frame: the alidade up, an Instrument and a transect staged straight
 * behind her, and the overlay's own pixels counted inside her silhouette. Its control turns the knock-out
 * off on the same stage, so the row is seen to catch the failure it exists for.
 */
const A_OVER_BREA = {
  id: 'A-sighting-over-brea', kind: 'action', lane: LANE, timeout: 150000, settle: 600,
  title: 'With Brea visible and an Instrument and a transect straight behind her, the raised alidade adds 0 pixels inside her silhouette; with the knock-out off the same stage adds them',
  assert: staged(['herd'], `(async () => {
    ${FRAMES}
    const m = await (async () => { ${SIGHT_STAGE(true, false, 0)} })();
    if (!m) return { pass: null, detail: 'SKIP-R18: no herd kind stands' };
    ${OVERLAY_DIFF}${HER_SILHOUETTE}
    const c = __CTX__, S = c.sighting;
    /* a transect loop right through where she stands, and the sighted Instrument straight behind her */
    const hp = c.player.position;
    const loop = [];
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.2832; loop.push({ x: hp.x + Math.sin(a) * 5, z: hp.z + Math.cos(a) * 5 }); }
    S._disposePaths();
    m.route = loop;
    S._buildPath(m, 1);
    for (const e of S._paths.values()) { e.mat.uniforms.uFade.value = 1; }
    const aimBehind = async () => {
      /* one-pixel-true: turn the camera until the Instrument's centre stands on her chest */
      for (let i = 0; i < 6; i++) {
        const v = m.position.clone(); v.y += (m.height ?? 2.4) * 0.5;
        const q = hp.clone(); q.y += 1.1;
        const pv = v.project(c.camera), pq = q.project(c.camera);
        c.player.camYaw -= (pv.x - pq.x) * 0.9;     /* a larger yaw moves the Instrument right on the screen */
        await frames(4);
      }
    };
    await aimBehind();
    /* the sheet's own fade logic would free a route it did not choose: hold it */
    for (const e of S._paths.values()) e.want = true;
    S._walksRoute = () => true;
    await frames(4);
    const count = (shot, sil) => {
      const { before, after, w, h } = shot;
      let inside = 0, added = 0, paper = 0, outside = 0, silPx = 0;
      const on = (x, y) => sil[(y * w + x) * 4] > 127;
      for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
        const i = (y * w + x) * 4;
        const diff = Math.abs(after[i] - before[i]) > 2 || Math.abs(after[i + 1] - before[i + 1]) > 2 || Math.abs(after[i + 2] - before[i + 2]) > 2;
        const inHer = on(x, y);
        if (inHer) silPx++;
        /* eroded by 2 px: the depth is one sample per pixel and MSAA softens her edge */
        if (inHer && on(x - 2, y) && on(x + 2, y) && on(x, y - 2) && on(x, y + 2)) {
          inside++;
          if (diff) { added++; if (Math.min(after[i], after[i + 1], after[i + 2]) > 170) paper++; }
        } else if (!inHer && diff) outside++;
      }
      return { silPx, insidePx: inside, addedPx: added, paperPx: paper, outsidePx: outside };
    };
    const shot = await overlayFrame(() => herSilhouette());
    const on = count(shot, shot.more.px);
    /* the DOM half of the overlay: no reveal chip lies on her */
    let chipPx = 0;
    {
      const sil = shot.more.px, cssK = shot.w / innerWidth;
      for (const el of document.querySelectorAll('.calf-reveal')) {
        if (el.style.display === 'none' || el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        for (let y = Math.round(r.top); y < r.bottom; y += 2) for (let x = Math.round(r.left); x < r.right; x += 2) {
          const px = Math.round(x * cssK), py = shot.h - 1 - Math.round(y * cssK);
          if (px >= 0 && px < shot.w && py >= 0 && py < shot.h && sil[(py * shot.w + px) * 4] > 127) chipPx += 4;
        }
      }
    }
    S.debugOcclusion(false);
    await frames(2);
    const shot2 = await overlayFrame(() => herSilhouette());
    const off = count(shot2, shot2.more.px);
    S.debugOcclusion(true);
    delete S._walksRoute;
    const checks = {
      herVisibleInFrame: on.insidePx > 4000,
      overlayDrew: on.outsidePx > 300,
      noPixelOverHer: on.addedPx === 0,
      noPaperOverHer: on.paperPx === 0,
      controlCatchesIt: off.addedPx > 150,
      noRevealOnHer: chipPx === 0,
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return { pass: failed.length === 0, detail: { failed, on, control: off, chipPx, meshesInSilhouette: shot.more.meshes, heroShells: S._heroShells.size, paths: S._paths.size } };
  })()`),
};

/**
 * R54: a transect is a chain line at every distance, not road paint. The overlay's own paper pixels, with the
 * figure off, in every column: how thick the line is across the screen, measured.
 */
const A_TRANSECT_FINE = {
  id: 'A-transect-fine', kind: 'action', lane: LANE, timeout: 150000, settle: 600,
  title: 'A transect is at most 3 px of paper across at any distance (95th percentile, station ticks aside), and no more than two are up',
  assert: staged(['herd'], `(async () => {
    ${FRAMES}
    const m = await (async () => { ${SIGHT_STAGE(true, false)} })();
    if (!m) return { pass: null, detail: 'SKIP-R18: no herd kind stands' };
    ${OVERLAY_DIFF}
    const c = __CTX__, S = c.sighting, p = c.player;
    /* a loop in front of the lens, near to far, whatever route the fixture carries */
    const f = { x: -Math.sin(p.camYaw), z: -Math.cos(p.camYaw) }, sd = { x: f.z, z: -f.x };
    const loop = [];
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * 6.2832;
      loop.push({ x: p.position.x + f.x * (24 + 18 * Math.cos(a)) + sd.x * 16 * Math.sin(a), z: p.position.z + f.z * (24 + 18 * Math.cos(a)) + sd.z * 16 * Math.sin(a) });
    }
    S._disposePaths();
    m.route = loop;
    S._walksRoute = () => true;
    S._buildPath(m, 1);
    for (const e of S._paths.values()) e.mat.uniforms.uFade.value = 1;
    const count = S._paths.size;
    S._figure.visible = false;
    await frames(3);
    const shot = await overlayFrame();
    S._figure.visible = true;
    delete S._walksRoute;
    const { before, after, w, h } = shot;
    const runs = [];
    let paper = 0;
    for (let x = 0; x < w; x += 2) {
      let run = 0;
      for (let y = 0; y < h; y++) {
        const i = (y * w + x) * 4;
        const on = Math.abs(after[i] - before[i]) > 10 && Math.min(after[i], after[i + 1], after[i + 2]) > 150;
        if (on) { run++; paper++; } else if (run) { runs.push(run); run = 0; }
      }
      if (run) runs.push(run);
    }
    runs.sort((a, b) => a - b);
    const q = (t) => runs.length ? runs[Math.min(runs.length - 1, Math.floor(runs.length * t))] : 0;
    const checks = { lineDrew: paper > 400, atMostTwoUp: S._paths.size <= 2 && count <= 2, fine: q(0.95) <= 3 };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return { pass: failed.length === 0, detail: { failed, paperPx: paper, runs: runs.length, p50: q(0.5), p95: q(0.95), max: runs[runs.length - 1] ?? 0, paths: S._paths.size } };
  })()`),
};

/** R61 (d), on the worst frame the shell can stage: a herd in range, one sighted, a component on it. */
const A_SIGHT_DRAWS = {
  id: 'A-sighting-draws', kind: 'action', lane: LANE, timeout: 150000, settle: 600,
  title: 'Raising the alidade adds at most 30 draws on the worst staged frame (R61 d): the same frozen frame with the alidade down and up',
  assert: staged(['herd'], `(async () => {
    ${FRAMES}${FACE}${CLEAR_BEARING}
    const c = __CTX__, S = c.sighting;
    c.input.enabled = true;
    const spot = clearBearing();
    if (!spot) return { pass: null, detail: 'no clear ground' };
    const herd = [];
    for (let i = 0; i < 8; i++) {
      const a = spot.ang + Math.PI + (i - 3.5) * 0.28;
      try { const q = spawnRole('herd', spot.x + Math.sin(a) * (6 + i * 3), spot.z + Math.cos(a) * (6 + i * 3)); if (q) herd.push(q); } catch (e) { /* counted below */ }
    }
    await wait(900);
    /* r5-all-machines: freeze */
    for (const x of c.machines.list) if (x.alive !== false) x.update = () => {};
    const m = herd[0];
    if (!m) return { pass: null, detail: 'SKIP-R18: no herd kind stands' };
    faceTarget(m.position, 15, spot.ang, -0.08);
    c.player.update = () => {};
    await frames(20);
    const hooks = c.engine.onAfterRender;
    const sample = async (n) => {
      const rows = [];
      const hook = () => { rows.push(c.renderer.info.render.calls); };
      hooks.push(hook);
      await frames(n);
      hooks.splice(hooks.indexOf(hook), 1);
      rows.sort((a, b) => a - b);
      return { median: rows[rows.length >> 1], min: rows[0], max: rows[rows.length - 1], frames: rows.length };
    };
    const down = await sample(40);
    S.toggle(true);
    await wait(1700);          /* the sweep has run out; the figure and the paths have polled */
    const up = await sample(40);
    const held = S.overlayDraws();
    /* the sweep's own frame: everything at once, the worst instant of the raise */
    S.toggle(false);
    await wait(900);
    const down2 = await sample(20);
    S.toggle(true);
    await frames(3);
    const sweepFrame = S.overlayDraws();
    /* what the overlay costs on the GPU: the engine's timer query ends before the hooks */
    let gpu = null;
    try {
      const gl = c.renderer.getContext(), ext = c.engine._gpuExt || gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (ext) {
        const qs = [];
        const pre = () => { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); qs.push(q); };
        const post = () => { gl.endQuery(ext.TIME_ELAPSED_EXT); };
        hooks.splice(hooks.indexOf(S._afterComposer), 0, pre);
        hooks.splice(hooks.indexOf(S._afterComposer) + 1, 0, post);
        await wait(1200);
        await frames(40);
        hooks.splice(hooks.indexOf(pre), 1); hooks.splice(hooks.indexOf(post), 1);
        await wait(400);
        const ms = [];
        for (const q of qs) { if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) ms.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q); }
        ms.sort((a, b) => a - b);
        gpu = ms.length ? { medianMs: +ms[ms.length >> 1].toFixed(2), maxMs: +ms[ms.length - 1].toFixed(2), n: ms.length } : null;
      }
    } catch (e) { gpu = String(e); }
    const added = up.median - down.median;
    const checks = {
      staged: herd.length >= 6 && S.audit().shells.machines >= 2,
      addedAtMost30: added <= 30,
      ledgerAtMost30: held.total <= 30 && sweepFrame.total <= 30,
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return { pass: failed.length === 0, detail: { failed, down, up, down2, added, held, sweepFrame, herd: herd.length, cast: S.audit().figure, overlayGpu: gpu,
      pendingClauses: ['the Screed fight at <= 350 draws with the alidade up: A21 from the W2 exit (R61 d), no Screed yet'] } };
  })()`),
};

const A71 = re('A71-compass-truth', {
  title: 'The theodolite circle carries Flagged / objective / fighting Instruments only: 0 at spawn, +1 per Flag, each in its lamp colour and iris shape',
  patch: [
    ['const one = after.machinePips === 1;',
      `const one = after.machinePips === 1;
      /* bible §7.2: shape, then colour: the pip wears the lamp's colour and its iris aperture */
      const __hexRgb = (h) => { const v = parseInt(String(h).slice(1), 16); return 'rgb(' + (v >> 16) + ', ' + ((v >> 8) & 255) + ', ' + (v & 255) + ')'; };
      const __st = (after.pipStyles || [])[0] || null;
      const iris = !!__st && !!__st.token && __st.color === __hexRgb(__st.token.color) && Math.abs(__st.apertureCss - __st.token.aperture) < 0.08 && __st.kind === 'flag';
      const bearingReads = /^\\d{3}$/.test(after.bearing || '');`],
    ['pass: zeroed && tagged && one,', 'pass: zeroed && tagged && one && iris && bearingReads,'],
    ['zeroed, taggedOne: tagged, addsExactlyOne: one,', 'zeroed, taggedOne: tagged, addsExactlyOne: one, iris, bearingReads, pip: __st, bearing: after.bearing,'],
  ],
});

const A71B = re('A71b-hud-scale-floor', {
  patch: [
    ['Math.abs(r.plateW - 224 * r.world) <= 2', 'Math.abs(r.plateW - 280 * r.world) <= 2'],
    ['const notABanner = plateSeen.every(r => r.plateW <= window.innerWidth * 0.35);',
      /* the bar is the row's own (35 % of the window); a simulated viewport row is graded against the window it simulates */
      'const notABanner = plateSeen.every(r => r.plateW <= (parseInt(r.vp, 10) > 1000 ? parseInt(r.vp, 10) : window.innerWidth) * 0.35);'],
  ],
});

const A71C = re('A71c-hud-surfaces', {
  title: 'Every HUD surface is on screen and correct: the levelling staff with ten graduations + numerals, the gourd, a projected plate, the vial, tool chips, the kit tag, the stadia; no kill feed',
  patch: [
    [`const red = /(?:rgb|#)/.test(s.health.fillImage || '') && /207,\\s*59,\\s*50|cf3b32/i.test(s.health.fillImage || '');
      const green = /111,\\s*191,\\s*95/.test(s.pouch.color || '');`,
    `const vermilion = (s.health.graduationColors || []).includes('rgb(210, 69, 46)');
      const paper = (s.health.graduationColors || []).includes('rgb(241, 238, 230)');`],
    [`healthSegments: s.health.segments === 4,`, `healthGraduations: s.health.graduations === 10 && vermilion && paper,`],
    [`healthRed: red,`, `damageEatsFromRight: /^inset\\(0(px)? (\\d+)% 0(px)? 0(px)?\\)$/.test(s.health.clip || ''),`],
    [`pouchVisible: s.pouch.visible === true,`, `gourdVisible: s.gourd.visible === true,`],
    [`pouchGreen: green,`, `gourdNumeral: /^\\d{3}$/.test(s.gourd.num || ''),`],
    [`xpBar: s.xp.visible === true,`, ``],
    [`health: s.health, pouch: s.pouch, bars: s.machineBars, eye: s.eye,`, `health: s.health, gourd: s.gourd, bars: s.machineBars, eye: s.eye,`],
    [`tools: s.tools, xp: s.xp, weapon: s.weapon, reticle: s.reticle,`, `tools: s.tools, weapon: s.weapon, reticle: s.reticle, pendingClauses: ['the combat-kit Kit Rack and tool slots (W2)', 'XP retired from the HUD: certifications replace it at W3 (A-certifications)'],`],
    [`Math.abs(r.plateW - 224 * r.world) <= 2`, `Math.abs(r.plateW - 280 * r.world) <= 2`],
  ],
});

const A71E = re('A71e-tutorial-cards', {
  title: 'Tutorial cards: the 18 cards of bible §8.9 in its order with its text, one-shot, with real kbd glyphs',
  patch: [
    ["const shown = hud.showTip('focus');", "const shown = hud.showTip('sighting');"],
    ["const again = hud.showTip('focus');", "const again = hud.showTip('sighting');"],
    ["oneShot: again === false && seen.includes('focus'),", `oneShot: again === false && seen.includes('sighting'),
        /* bible §8.9, parsed from the bible's own table at gate load: same cards, same order, same text */
        cardsMatchBible: (() => { const want = ${JSON.stringify(BIBLE_CARDS)}, got = hud.cards(); return got.length === want.length && want.every((w, i) => got[i].beat === w.beat && got[i].text === w.text); })(),
        paperCard: getComputedStyle(el).backgroundColor === 'rgb(226, 211, 176)',
        plexBody: /IBM Plex Mono/.test(getComputedStyle(el.querySelector('.cal-tip-body')).fontFamily),`],
    ["detail: { failed, card, kbd, kbdText, bodyPx, seen } };", "detail: { failed, card, kbd, kbdText, bodyPx, seen, cards: hud.cards().length } };"],
  ],
});

const A70B = re('A70b-fast-travel', {
  patch: [["/CAMPFIRE/.test(out.awayFromFire.reason)", "/CISTERN/.test(out.awayFromFire.reason)"]],
});

const A72B = re('A72b-accessibility', {
  patch: [
    ["getPropertyValue('--cal-accent').trim();", "getPropertyValue('--cal-c-weak').trim();"],
  ],
});

/* ---------------------------------------------------------- the survey sheet */

const MAP_OPEN = `
  const m = __CTX__.menus;
  m.openHub('map');
  await frames(4);
  const t0m = performance.now();
  while (!m.map.bake.ready && performance.now() - t0m < 90000) await wait(200);
  await frames(4);`;

const A_MAP = {
  id: 'A-map-triangles', kind: 'action', lane: LANE, timeout: 180000, settle: 800,
  title: 'The sheet shows only the coastline before any reveal; T1 + T2 + T6 paint that triangle within 5 % of its geometry; the state is in the store for the reload row',
  assert: `(async () => {${FRAMES}${STORAGE_GUARD}
    __CTX__.input.enabled = true;
    const c = __CTX__;
    ${MAP_OPEN}
    if (!m.map.bake.ready) return { pass: false, detail: 'the bake never finished' };
    const M = m.map;
    M.setTriangles([]);
    M.fog.clear();
    M.clearWaypoint();
    const pl = c.player, ppos = { x: pl.position.x, z: pl.position.z };
    M.draw();
    await frames(2);
    /* every map pixel that differs from the base sheet, by more than the wash's own step */
    const read = () => {
      const g = M.canvas.getContext('2d', { willReadFrequently: true });
      const W = M.canvas.width;
      const cur = g.getImageData(0, 0, W, W).data;
      const base = M.bake.base.getContext('2d').getImageData(0, 0, W, W).data;
      return { cur, base, W };
    };
    const diffPx = (r, skip) => {
      let n = 0;
      for (let y = 0; y < r.W; y += 2) for (let x = 0; x < r.W; x += 2) {
        if (skip && skip(x, y)) continue;
        const i = (y * r.W + x) * 4;
        if (Math.abs(r.cur[i] - r.base[i]) > 3 || Math.abs(r.cur[i + 1] - r.base[i + 1]) > 3 || Math.abs(r.cur[i + 2] - r.base[i + 2]) > 3) n += 4;
      }
      return n;
    };
    const pp = M.worldToMap(ppos.x, ppos.z);
    const nearMarks = (x, y) => Math.hypot(x - pp.x, y - pp.y) < 60;       // Brea's own arrow
    const r0 = read();
    const marks0 = (M.markers() || []).filter((q) => q.kind === 'quest').length;
    const before = { px: diffPx(r0, (x, y) => nearMarks(x, y)
      || (M.visibleMarkers() || []).some((q) => { const qq = M.worldToMap(q.x, q.z); return Math.abs(x - qq.x) < 280 && Math.abs(y - qq.y) < 60; })), painted: { ...M.audit().painted }, objectives: marks0 };

    const opened = M.revealTriangle('T1', 'T2', 'T6');
    const second = M.revealTriangle('T6', 'T1', 'T2');
    await frames(2);
    const a = M._pillarById.get('T1'), b = M._pillarById.get('T2'), d = M._pillarById.get('T6');
    const pa = M.worldToMap(a.x, a.z), pb = M.worldToMap(b.x, b.z), pd = M.worldToMap(d.x, d.z);
    const area = Math.abs((pb.x - pa.x) * (pd.y - pa.y) - (pd.x - pa.x) * (pb.y - pa.y)) / 2;
    const worldArea = M.triangleArea(['T1', 'T2', 'T6']);
    const inTri = (x, y) => {
      const s1 = (pb.x - pa.x) * (y - pa.y) - (pb.y - pa.y) * (x - pa.x);
      const s2 = (pd.x - pb.x) * (y - pb.y) - (pd.y - pb.y) * (x - pb.x);
      const s3 = (pa.x - pd.x) * (y - pd.y) - (pa.y - pd.y) * (x - pd.x);
      return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
    };
    M.draw({ washOnly: true });      // the wash and the ink, without the pillars, names and marks that stand on the vertices
    await frames(2);
    const r1 = read();
    M.draw();
    let painted = 0, inside = 0;
    for (let y = 0; y < r1.W; y += 2) for (let x = 0; x < r1.W; x += 2) {
      const i = (y * r1.W + x) * 4;
      const diff = Math.abs(r1.cur[i] - r1.base[i]) > 3 || Math.abs(r1.cur[i + 1] - r1.base[i + 1]) > 3 || Math.abs(r1.cur[i + 2] - r1.base[i + 2]) > 3;
      if (diff) painted += 4;
      if (inTri(x, y)) inside += 4;
    }
    const after = M.audit();
    const raw = JSON.parse(localStorage.getItem('cal.map.v5') || 'null');
    const pct = Math.abs(painted - area) / area * 100;
    const checks = {
      coastlineOnlyBefore: before.painted.ink === false && before.painted.pillars === 0 && before.painted.sites === 0 && before.px <= 40,
      revealOpens: opened === true,
      revealIsIdempotent: second === false,
      paintedWithin5pct: pct <= 5,
      inkDrawn: after.painted.ink === true && after.painted.pillars === 3,
      persisted: Array.isArray(raw?.tri) && raw.tri.length === 1 && raw.tri[0].join() === 'T1,T2,T6',
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    /* left in the store ON PURPOSE: A-map-triangles-reload boots a fresh page on it, then restores */
    return { pass: failed.length === 0, detail: { failed, before, opened, second, areaPx: Math.round(area), paintedPx: painted, insidePx: inside, worldAreaM2: Math.round(worldArea), errorPct: +pct.toFixed(2), after: { triangles: after.triangles, painted: after.painted, anySea: after.anySea } } };
  })()`,
};

const A_MAP_RELOAD = {
  id: 'A-map-triangles-reload', kind: 'action', lane: LANE, timeout: 180000, settle: 800,
  title: 'A real reload: a fresh page boots on the store A-map-triangles left and paints the triangle; then the store is cleared',
  assert: `(async () => {${FRAMES}
    const before = JSON.parse(localStorage.getItem('cal.map.v5') || 'null');
    ${MAP_OPEN}
    const M = m.map;
    M.draw();
    await frames(2);
    const tri = M.triangles(), painted = { ...M.audit().painted };
    M.setTriangles([]);
    m.closeHub(true);
    const pass = Array.isArray(before?.tri) && tri.length === 1 && tri[0].join() === 'T1,T2,T6' && painted.ink === true && painted.pillars === 3;
    return { pass: before?.tri?.length ? pass : null, detail: before?.tri?.length ? { store: before.tri, tri, painted } : 'run A-map-triangles first: it plants the store this row reads' };
  })()`,
};

/** Her arrow on the sheet points where she looks: the drawn pixels, at four headings. */
const A_MAP_ARROW = {
  id: 'A-map-arrow-heading', kind: 'action', lane: LANE, timeout: 180000, settle: 800,
  title: 'Her arrow on the survey sheet points where the camera looks, at four headings, measured off the drawn pixels; an objective on her own spot steps aside',
  assert: `(async () => {${FRAMES}
    __CTX__.input.enabled = true;
    const c = __CTX__;
    ${MAP_OPEN}
    const M = m.map, p = c.player;
    M.setTriangles([]);
    M.fog.clear();
    M.clearWaypoint();
    const home = { x: p.position.x, z: p.position.z, yaw: p.camYaw };
    /* a spot on the sheet with nothing else vermilion near it */
    const marks = M.visibleMarkers();
    let spot = null;
    for (let i = 0; i < 40 && !spot; i++) {
      const x = home.x + Math.sin(i * 2.4) * (40 + i * 9), z = home.z + Math.cos(i * 2.4) * (40 + i * 9);
      if (marks.every((q) => Math.hypot(q.x - x, q.z - z) > 40)) spot = { x, z };
    }
    p.position.x = spot.x; p.position.z = spot.z;
    const W = M.canvas.width;
    const g = M.canvas.getContext('2d', { willReadFrequently: true });
    const rows = [];
    for (const yaw of [0.4, 0.4 + Math.PI / 2, 0.4 + Math.PI, 0.4 + Math.PI * 1.5]) {
      p.camYaw = yaw;
      M.draw();
      await frames(1);
      const pt = M.worldToMap(spot.x, spot.z);
      /* where the sheet puts a point along her camera's forward: no assumption about the sheet's axes */
      const pf = M.worldToMap(spot.x - Math.sin(yaw) * 50, spot.z - Math.cos(yaw) * 50);
      const fl = Math.hypot(pf.x - pt.x, pf.y - pt.y) || 1;
      const ux = (pf.x - pt.x) / fl, uy = (pf.y - pt.y) / fl;
      const R = Math.round(W * 0.03);
      const x0 = Math.max(0, Math.round(pt.x) - R), y0 = Math.max(0, Math.round(pt.y) - R);
      const d = g.getImageData(x0, y0, R * 2, R * 2);
      let far = 0, tipX = 0, tipY = 0, n = 0;
      for (let y = 0; y < R * 2; y++) for (let x = 0; x < R * 2; x++) {
        const i = (y * R * 2 + x) * 4;
        if (Math.abs(d.data[i] - 210) > 26 || Math.abs(d.data[i + 1] - 69) > 34 || Math.abs(d.data[i + 2] - 46) > 34) continue;
        const dx = x + x0 - pt.x, dy = y + y0 - pt.y, dl = Math.hypot(dx, dy);
        n++;
        if (dl > far) { far = dl; tipX = dx; tipY = dy; }
      }
      rows.push({ yaw: +yaw.toFixed(2), px: n, tipDot: +((tipX * ux + tipY * uy) / (far || 1)).toFixed(3), far: +far.toFixed(1) });
    }
    /* an objective on her own spot steps aside: her arrow's pixels are the same with it as without it */
    const nearHer = () => {
      const pt = M.worldToMap(spot.x, spot.z), R = Math.round(W * 14 / 690);
      const d = g.getImageData(Math.round(pt.x) - R, Math.round(pt.y) - R, R * 2, R * 2);
      let n = 0;
      for (let i = 0; i < d.data.length; i += 4) if (Math.abs(d.data[i] - 210) < 26 && Math.abs(d.data[i + 1] - 69) < 34 && Math.abs(d.data[i + 2] - 46) < 34) n++;
      return n;
    };
    p.camYaw = 0.4;
    M.draw();
    await frames(1);
    const alone = nearHer();
    const prog = c.progression, orig = prog.getMarkers;
    prog.getMarkers = () => [{ x: spot.x, z: spot.z, label: 'Objective', tracked: true }];
    M.draw();
    await frames(1);
    const withObjective = nearHer(), gaveWay = M.audit().gaveWay;
    prog.getMarkers = orig;
    p.position.x = home.x; p.position.z = home.z; p.camYaw = home.yaw;
    M.draw();
    m.closeHub(true);
    const giveWay = gaveWay === 1 && Math.abs(withObjective - alone) <= alone * 0.1;
    return { pass: rows.every((r) => r.px > 20 && r.tipDot >= 0.97) && giveWay, detail: { rows, giveWay, alone, withObjective, gaveWay } };
  })()`,
};

const V_MAP = {
  id: 'V-map', kind: 'visual', lane: LANE, settle: 900, timeout: 180000,
  reference: 'reference/r5/gates-perf/field-book (paper) and the plan words: inked contours, soundings, revealed triangles',
  title: 'The survey sheet with T1 + T2 + T6 + T2 + T3 + T6 opened',
  criteria: planBullet('V-map') + ' || R61 (a): the "soundings offshore" clause is PENDING until world-ground\'s island merges; the orchestrator re-films it then. Every other clause is graded now.' + INCREDIBLE,
  setup: `(async () => {${FRAMES}
    __CTX__.input.enabled = true;
    ${MAP_OPEN}
    const raw = localStorage.getItem('cal.map.v5');
    m.map.setTriangles([['T1', 'T2', 'T6'], ['T2', 'T3', 'T6']]);
    /* the shot's triangles stay in memory, not in the store other rows boot on */
    if (raw == null) localStorage.removeItem('cal.map.v5'); else localStorage.setItem('cal.map.v5', raw);
    m.map.setWaypoint(m.map._pillarById.get('T3').x - 40, m.map._pillarById.get('T3').z + 30, 'Waypoint');
    if (raw == null) localStorage.removeItem('cal.map.v5'); else localStorage.setItem('cal.map.v5', raw);
  })()`,
};

/* ------------------------------------------------------------- A-ui-words */

const A_UI_WORDS = {
  id: 'A-ui-words-all', kind: 'action', lane: LANE, timeout: 180000, settle: 900,
  title: 'All surfaces (HUD, hub, satchel, map, tips, cards, Sighting, death) render none of the plan §9 A-ui-words terms',
  assert: `(async () => {${FRAMES}${STORAGE_GUARD}
    const snap = snapStorage();
    const RE = new RegExp(${JSON.stringify(UI_WORDS_RE)}, 'gi');
    const c = __CTX__, m = c.menus, hud = window.__HUD_DEBUG__;
    c.input.enabled = true;
    const s = {}, later = {};
    try {
      document.getElementById('hud').classList.add('reveal');
      s.hud = document.getElementById('hud').innerText;
      for (const card of hud.cards()) s['card:' + card.id] = card.title + ' ' + card.body + ' ' + card.text;
      const T = (await import('/src/ui/tips.js')).TIPS;
      T.forEach((t, i) => { s['tip:' + i] = t.text.replace(/<[^>]+>/g, ' '); });
      for (const id of ['map', 'settings', 'inventory', 'crafting', 'notebook']) {
        m.openHub(id); await frames(8);
        s['hub:' + id + ':frame'] = document.querySelector('.mn-hub-margin').innerText + ' ' + document.querySelector('.mn-hub-head').innerText + ' ' + document.querySelector('.mn-hub-foot').innerText;
        if (id === 'map' || id === 'settings') s['hub:' + id] = m.hubBody.innerText;
        else s['hub:' + id] = document.querySelector('.cal-inv').innerText;
      }
      for (const p of ['resources', 'ammo', 'tools', 'valuables', 'crafting', 'notebook', 'trade']) {
        c.items?.screen?.open?.(p);
        c.items?.screen?._render?.();
        await frames(2);
        s['satchel:' + p] = document.querySelector('.cal-inv')?.innerText || '';
      }
      m.openHub('quests'); await frames(6);
      later['hub:quests (progression W3)'] = document.getElementById('cal-prog')?.innerText || '';
      m.openHub('skills'); await frames(6);
      later['hub:skills (progression W3)'] = document.getElementById('cal-prog')?.innerText || '';
      m.closeHub(true);
      await frames(4);
      /* the alidade */
      const list = c.machines.list.filter((x) => x.alive !== false);
      if (list[0]) {
        const q = list[0].position;
        c.player.position.set(q.x + 10, 0, q.z + 10); c.player._snapToGround?.();
        c.player.camYaw = Math.atan2(10, 10);
        c.sighting.toggle(true);
        await wait(1000);
        s.sighting = document.getElementById('calf-layer').innerText;
        c.sighting._cardM = null;
        s.sightingCard = c.sighting._cardHTML(list[0]).replace(/<[^>]+>/g, ' ');
        c.sighting.toggle(false);
      }
      /* death */
      c.events.emit('player-damage', { from: { displayName: 'Tiller', kind: 'tiller' }, amount: 12 });
      c.player.takeDamage(9999);
      const t0 = performance.now();
      while (m.audit().death.state !== 'choice' && performance.now() - t0 < 6000) await wait(100);
      s.death = m.deathEl.innerText;
      m.respawn('checkpoint');
    } finally { restoreStorage(snap); }
    const hits = [], laterHits = [];
    for (const [k, t] of Object.entries(s)) for (const mm of String(t).matchAll(RE)) hits.push(k + ': "' + mm[0] + '"');
    for (const [k, t] of Object.entries(later)) for (const mm of String(t).matchAll(RE)) laterHits.push(k + ': "' + mm[0] + '"');
    return { pass: hits.length === 0 && Object.keys(s).length > 30, detail: { hits: hits.slice(0, 40), surfaces: Object.keys(s).length,
      pendingClauses: laterHits.length ? ['quest and skill page text is progression W3 (src/ui/{quests,skills}.js, core/progression.js): ' + laterHits.slice(0, 12).join('; ')] : [] } };
  })()`,
};

/** Every settings row on the page, none clipped: a third column the book cannot show is a broken page. */
const A_SETTINGS_ROWS = {
  id: 'A-settings-rows-visible', kind: 'action', lane: LANE, timeout: 120000, settle: 900,
  title: 'The settings page shows every row and every rebind inside the page at 1600x900, without a scroll',
  assert: `(async () => {${FRAMES}
    const m = __CTX__.menus;
    __CTX__.input.enabled = true;
    m.openHub('settings');
    await frames(10);
    const host = m.hubBody.getBoundingClientRect();
    const rows = [...m.hubBody.querySelectorAll('.mn-set-row')];
    const binds = [...m.hubBody.querySelectorAll('[data-rebind]')].filter((e) => e.tagName === 'BUTTON');
    const out = rows.filter((e) => { const r = e.getBoundingClientRect(); return r.right > host.right + 1 || r.bottom > host.bottom + 1 || r.width < 8; });
    const ACTIONS = (await import('/src/core/input.js')).ACTIONS;
    const scroller = m.hubBody.querySelector('.mn-settings');
    m.closeHub(true);
    return { pass: rows.length >= 20 && out.length === 0 && binds.length === ACTIONS.length, detail: { rows: rows.length, binds: binds.length, actions: ACTIONS.length,
      clipped: out.slice(0, 8).map((e) => e.innerText.slice(0, 40)), scrollOverflowPx: scroller ? scroller.scrollHeight - scroller.clientHeight : null } };
  })()`,
};

const A_LAMP_UI = {
  id: 'A-lamp-canon-distance-ui', kind: 'runner', lane: LANE, timeout: 120000,
  title: 'instruments-core\'s A-lamp-canon-distance over this lane\'s CSS tokens: every lamp, beam, scanner and compass-pip colour dE2000 >= 20 from canon',
  async check(ctx) {
    const core = (await import('./gates.r5.instruments-core.mjs')).GATES.find((g) => g.id === 'A-lamp-canon-distance');
    if (!core) return { pass: null, detail: 'instruments-core row not found' };
    return core.check(ctx);
  },
};

/* ------------------------------------------------- the language, statically */

/** Our sheets: only the two families through tokens, no smoked glass, no chamfers, the retired tokens gone. */
const A_UI_STATIC = {
  id: 'A-ui-language-static', kind: 'runner', lane: LANE, timeout: 30000,
  title: 'This lane\'s sheets: every font-family is a token, the type scale is defined in tokens, no backdrop-filter, no chamfered clip-paths, no rounded chips, the Round-4 palette tokens are gone',
  check() {
    const files = ['src/style.css', 'src/ui/hud.css', 'src/ui/focus.css', 'src/ui/inventory.css'];
    const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders = [];
    const RETIRED = /--cal-(accent|focus|warn|med|hostile|gold|yellow|terra|parch-dim|verdigris)\b|--mn-(ink|dim|faint|line|gold|spark|panel)\b/;
    const ROUND_OK = /(\.cal-iris i|cal-vial-bubble|data-shape='site')/;
    for (const f of files) {
      const lines = strip(readFileSync(path.join(ROOT, f), 'utf8')).split('\n');
      let selector = '';
      lines.forEach((ln, i) => {
        if (ln.includes('{')) selector = ln;
        const at = f + ':' + (i + 1) + ' ' + ln.trim().slice(0, 90);
        if (/backdrop-filter/.test(ln)) offenders.push('smoked glass: ' + at);
        if (RETIRED.test(ln)) offenders.push('retired token: ' + at);
        const ff = ln.match(/font-family:\s*([^;]+);/);
        if (ff && !selector.includes('@font-face') && !/^(var\(--cal-font-(display|ui|mono)\)|var\(--font(-display)?\)|inherit)/.test(ff[1].trim()) && !/^\s*(--cal-font|--font)/.test(ln)) offenders.push('font: ' + at);
        if (/border-radius:\s*[1-9]/.test(ln) && !ROUND_OK.test(selector)) offenders.push('rounded: ' + at);
        if (/clip-path:\s*polygon\(\s*\d+px\s+0/.test(ln)) offenders.push('chamfer: ' + at);
      });
    }
    /* bible §9.1 bans teal UI at any strength: every colour this lane writes, in its sheets and its code,
       outside 160-185 deg above 0.12 saturation. Only the Brine element swatch (bible §9.1 Elements) stands there by name. */
    const teal = [];
    const hueOf = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2; if (!d) return [0, 0]; const sat = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return [h < 0 ? h + 360 : h, sat]; };
    for (const f of [...files, 'src/ui/hud.js', 'src/ui/focus.js', 'src/ui/map.js', 'src/ui/menu.js', 'src/ui/settings.js', 'src/ui/tips.js', 'src/ui/inventory.js', 'index.html']) {
      readFileSync(path.join(ROOT, f), 'utf8').split('\n').forEach((ln, i) => {
        if (/--cal-brine:/.test(ln)) return;
        for (const m of ln.matchAll(/#([0-9a-fA-F]{6})\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
          let r, g, b;
          if (m[1]) { const v = parseInt(m[1], 16); r = v >> 16; g = (v >> 8) & 255; b = v & 255; } else { r = +m[2]; g = +m[3]; b = +m[4]; }
          const [h, sat] = hueOf(r, g, b);
          if (h >= 160 && h <= 185 && sat > 0.12) teal.push(f + ':' + (i + 1) + ' ' + m[0]);
        }
      });
    }
    const style = strip(readFileSync(path.join(ROOT, 'src/style.css'), 'utf8'));
    const scale = ['--cal-type-display', '--cal-type-title', '--cal-type-head', '--cal-type-label', '--cal-type-micro', '--cal-type-body', '--cal-type-note', '--cal-type-num-l', '--cal-type-num', '--cal-type-num-s'];
    const missing = scale.filter((t) => !new RegExp(t + ':\\s*\\d+px').test(style));
    return { pass: offenders.length === 0 && missing.length === 0 && teal.length === 0, detail: { offenders: offenders.slice(0, 30), teal: teal.slice(0, 20), typeScale: scale.length, missing } };
  },
};

/** R55 on what actually renders: the sheets can be clean and a canvas or an inline style still not. */
const A_UI_TYPE = {
  id: 'A-ui-type-only', kind: 'action', lane: LANE, timeout: 180000, settle: 900,
  title: 'R55 on the rendered DOM: every visible text node on every surface is Chakra Petch or IBM Plex Mono, every pure numeral is Plex Mono, and only those two families load',
  assert: `(async () => {${FRAMES}${STORAGE_GUARD}
    const snap = snapStorage();
    const c = __CTX__, m = c.menus, hud = window.__HUD_DEBUG__;
    c.input.enabled = true;
    const bad = [], badNum = [], perSurface = {};
    const FAM = new Set(['Chakra Petch', 'IBM Plex Mono']);
    const walk = (where) => {
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n, total = 0;
      while ((n = tw.nextNode())) {
        const t = n.nodeValue.trim();
        if (!t) continue;
        const el = n.parentElement;
        if (!el || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        let eff = 1;
        for (let a = el; a && a !== document.body; a = a.parentElement) eff *= parseFloat(getComputedStyle(a).opacity) || 0;
        if (eff < 0.02) continue;
        total++;
        const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
        const at = where + ' <' + el.tagName.toLowerCase() + ' ' + (el.className?.baseVal ?? el.className ?? '') + '> ' + t.slice(0, 30);
        if (!FAM.has(fam)) bad.push(fam + ': ' + at);
        else if (/\\d/.test(t) && /^[\\d\\s.,:%+\\-\\u2212\\u00b0\\/\\u00d7]+$/.test(t) && fam !== 'IBM Plex Mono') badNum.push(at);
      }
      perSurface[where] = total;
    };
    try {
      document.getElementById('hud').classList.add('reveal');
      await frames(4);
      walk('hud');
      for (const id of ['map', 'settings', 'inventory', 'crafting', 'notebook', 'quests', 'skills']) {
        m.openHub(id); await frames(8);
        walk('hub:' + id);
      }
      m.closeHub(true);
      await frames(4);
      const list = c.machines.list.filter((x) => x.alive !== false);
      if (list[0]) {
        const q = list[0].position;
        c.player.position.set(q.x + 10, 0, q.z + 10); c.player._snapToGround?.();
        c.player.camYaw = Math.atan2(10, 10);
        c.sighting.toggle(true);
        await wait(1000);
        walk('sighting');
        c.sighting.toggle(false);
      }
      const prog = c.progression;
      const npc = prog && Object.keys(prog.NPCS || {})[0];
      if (npc && prog.dialogueUI.open(npc)) { await frames(4); walk('dialogue'); prog.dialogueUI.close(); await frames(2); }
      hud.resetTips();
      c.hud._tipQueue.length = 0; c.hud._tipT = 0; c.hud._tipGap = 0;
      hud.showTip('sighting');
      const t1 = performance.now();
      while (!c.hud._tipEl.classList.contains('show') && performance.now() - t1 < 6000) await wait(100);
      walk('tip');
      c.events.emit('player-damage', { from: { displayName: 'Tiller', kind: 'tiller' }, amount: 12 });
      c.player.takeDamage(9999);
      const t0 = performance.now();
      while (m.audit().death.state !== 'choice' && performance.now() - t0 < 6000) await wait(100);
      walk('death');
      m.respawn('checkpoint');
    } finally { restoreStorage(snap); }
    await document.fonts.ready;
    const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '') + ' ' + f.weight + ' ' + f.style);
    const families = [...new Set(loaded.map((l) => l.replace(/ \\d+ \\w+$/, '')))];
    const checks = {
      everyTextNode: bad.length === 0,
      numeralsArePlex: badNum.length === 0,
      bothLoaded: families.includes('Chakra Petch') && families.includes('IBM Plex Mono'),
      onlyThoseTwo: families.every((f) => FAM.has(f)),
      surfacesWalked: Object.values(perSurface).filter((n) => n > 0).length >= 10,
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return { pass: failed.length === 0, detail: { failed, bad: bad.slice(0, 30), badNum: badNum.slice(0, 30), perSurface, loaded } };
  })()`,
};

/* --------------------------------------------------- the contact sheet rows */

const UI_ROW = (id, title, setup, { pendingWords = '', ...extra } = {}) => ({
  id, kind: 'visual', lane: LANE, settle: 900, timeout: 180000,
  reference: 'reference/r5/gates-perf/field-book',
  title,
  criteria: 'A surface of V-ui-sheet (one system: Chakra Petch labels, Plex Mono numerals and text, field-book paper, 1 px ink rules, red margin, right angles). FAIL on any other typeface, a pill, a hexagon, smoked glass, teal, violet, a word the bible retired, or anything illegible at 1600x900.' + (pendingWords ? ' || ' + pendingWords : '') + INCREDIBLE,
  setup, ...extra,
});

/** A full satchel, from the catalogue itself (no item id is spelled here). */
const SEED_SATCHEL = `{
  const __items = await import('/src/items/items.js');
  const __inv = __CTX__.inventory;
  let __k = 3;
  for (const id of Object.keys(__items.ITEMS)) { __inv?.add?.(id, 2 + (__k++ * 5) % 17); }
}`;

const V_UI = [
  UI_ROW('V-ui-title', 'Title: the menu in, over the vista', `(async () => {${FRAMES}
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
    const t0 = performance.now();
    while (__CTX__.menus?.titleStage !== 'menu' && performance.now() - t0 < 20000) await wait(100);
    await wait(1200);
  })()`, { plain: true, settle: 1200 }),
  UI_ROW('V-ui-inventory', 'The satchel, in the hub', `(async () => {${FRAMES}
    __CTX__.input.enabled = true;
    ${SEED_SATCHEL}
    await frames(6);
    __CTX__.menus.openHub('inventory');
    await frames(10);
  })()`),
  UI_ROW('V-ui-settings', 'Settings, in the hub', `(async () => {${FRAMES}
    __CTX__.input.enabled = true;
    __CTX__.menus.openHub('settings');
    await frames(10);
  })()`),
  UI_ROW('V-ui-pause', 'Pause: the hub on the field log, opened with Esc', `(async () => {${FRAMES}
    __CTX__.input.enabled = true;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }));
    await frames(8);
    __CTX__.menus.setTab('quests');
    await frames(10);
  })()`, { pendingWords: 'R61 (b): retired words in quest text are PENDING until progression W3 (plan §7.3); that text is in its files. Every other clause is graded now.' }),
  UI_ROW('V-ui-tip', 'A tutorial card in play', `(async () => {${FRAMES}
    __CTX__.input.enabled = true;
    window.__HUD_DEBUG__.resetTips();
    __CTX__.hud._tipQueue.length = 0;
    __CTX__.hud._tipT = 0; __CTX__.hud._tipGap = 0;
    window.__HUD_DEBUG__.showTip('sighting');
    const t0 = performance.now();
    while (!__CTX__.hud._tipEl.classList.contains('show') && performance.now() - t0 < 6000) await wait(100);
    __CTX__.hud._tipT = 30;
    await wait(500);
  })()`, { pendingWords: 'The field note and the objective mark print the tracked quest\'s own text, which is progression W3\'s (plan §7.3; R61 b rules the same text PENDING on V-ui-pause; orchestrator: rule this row likewise). The card, the type and every other clause are graded now.' }),
  UI_ROW('V-ui-death', 'The death choice', `(async () => {${FRAMES}
    __CTX__.input.enabled = true;
    const c = __CTX__;
    c.events.emit('player-damage', { from: { displayName: 'Tiller', kind: 'tiller' }, amount: 12 });
    c.player.takeDamage(9999);
    const t0 = performance.now();
    while (c.menus.audit().death.state !== 'choice' && performance.now() - t0 < 15000) await wait(100);
    await wait(900);
  })()`),
  UI_ROW('V-ui-dialogue', 'A conversation: settlements\' panel in the shared paper and type', `(async () => {${FRAMES}
    __CTX__.input.enabled = true;
    const prog = __CTX__.progression;
    prog.dialogueUI.open(Object.keys(prog.NPCS)[0]);
    await frames(10);
  })()`, { pendingWords: 'R61 (b): retired words in dialogue text are PENDING until settlements W2, because that text is in its files. Every other clause is graded now.' }),
  UI_ROW('V-ui-books', 'The Field Books page, with records found', `(async () => {${FRAMES}
    __CTX__.input.enabled = true;
    const dp = __CTX__.items.datapoints;
    for (const r of dp.list.slice(0, 7)) dp.collect(r.id);
    await frames(4);
    __CTX__.menus.openHub('notebook');
    await frames(10);
  })()`, { pendingWords: 'The catalogue\'s record titles and bodies are progression W3 text, as the log\'s are (R61 b names that page; orchestrator: rule this row likewise). The headings and every other clause are graded now.' }),
  UI_ROW('V-ui-making', 'The Making page, with a full satchel', `(async () => {${FRAMES}
    __CTX__.input.enabled = true;
    ${SEED_SATCHEL}
    await frames(6);
    __CTX__.menus.openHub('crafting');
    await frames(10);
  })()`, { pendingWords: 'Item names that fieldWord cannot reach are combat-kit W2 (R61 b applies the same logic; orchestrator: rule this row likewise).' }),
  UI_ROW('V-ui-skills', 'The Skills page', `(async () => {${FRAMES}
    __CTX__.input.enabled = true;
    __CTX__.menus.openHub('skills');
    await frames(10);
  })()`, { pendingWords: 'Skill names and text are progression W3 (certifications replace them, A-certifications; R61 b applies the same logic; orchestrator: rule this row likewise).' }),
  UI_ROW('V-ui-trade', 'The Trade page', `(async () => {${FRAMES}
    __CTX__.input.enabled = true;
    ${SEED_SATCHEL}
    await frames(6);
    __CTX__.menus.openHub('inventory');
    await frames(4);
    __CTX__.items.screen.open('trade');
    await frames(10);
  })()`, { pendingWords: 'Item names that fieldWord cannot reach are combat-kit W2; merchant lines are settlements W2 (R61 b applies the same logic; orchestrator: rule this row likewise).' }),
];

/** 4K, at true pixels: the HUD laid out for 3840x2160, shifted so each corner falls in the 1600x900 frame. */
const hud4k = (id, title, dx, dy) => ({
  id, kind: 'visual', lane: LANE, settle: 700, timeout: 180000,
  reference: 'reference/r5/gates-perf/field-book',
  title: '4K crop at true pixels: ' + title,
  criteria: 'A crop at true pixels of the HUD laid out for 3840x2160. Every label and numeral is crisp and in proportion, the same design as at 1600x900, nothing a hairline thinner than it should be, nothing clipped.' + INCREDIBLE,
  setup: `(async () => {
    await ${r37.setup};
    window.__HUD_DEBUG__.simulateViewport(3840, 2160);
    const h = document.getElementById('hud');
    h.style.width = '3840px'; h.style.height = '2160px';
    h.style.transform = 'translate(${dx}px, ${dy}px)';
    h.style.right = 'auto'; h.style.bottom = 'auto';
  })()`,
});

/** The book at 4K, at true pixels: laid out as 1600x900 under a 2.4 zoom (what --ui-z does on a 3840x2160 window), shifted so the corner falls in the frame. */
const hub4k = (id, title, tab, dx, dy) => ({
  id, kind: 'visual', lane: LANE, settle: 700, timeout: 180000,
  reference: 'reference/r5/gates-perf/field-book',
  title: '4K crop at true pixels: ' + title,
  criteria: 'A crop at true pixels of a hub page at 3840x2160. Every label and numeral crisp and in proportion, the same page as at 1600x900, no rule thinner than a device pixel, nothing clipped.' + INCREDIBLE,
  setup: `(async () => {${FRAMES}
    __CTX__.input.enabled = true;
    ${MAP_OPEN.replace("m.openHub('map')", `m.openHub('${tab}')`).replace('while (!m.map.bake.ready', `while ('${tab}' === 'map' && !m.map.bake.ready`)}
    m.map.setTriangles([['T1', 'T2', 'T6'], ['T2', 'T3', 'T6']]);
    localStorage.removeItem('cal.map.v5');
    m.map.draw?.();
    document.documentElement.style.setProperty('--ui-z', '2.4');
    const hub = document.querySelector('.mn-hub');
    hub.style.cssText += ';position:fixed;left:${dx / 2.4}px;top:${dy / 2.4}px;right:auto;bottom:auto;width:1600px;height:900px;';
    await frames(6);
  })()`,
});

const V_UI_SHEET = {
  id: 'V-ui-sheet', kind: 'runner', lane: LANE, timeout: 120000,
  title: 'The contact sheet: title, play HUD (40 % HP, aiming, Instrument engaged), Sighting, satchel, map, settings, pause, tip card, death choice, judged for coherence as one system',
  criteria: 'Nine surfaces on one sheet read as ONE designed system: engraved surveying instruments and a field book. The same two typefaces, the same paper, the same ink, the same hairlines and graduated ticks, right angles everywhere; custom-made for this game.' + INCREDIBLE,
  async check() {
    const dir = path.join(process.cwd(), 'shots/gates');
    const order = ['V-ui-title', 'V37-hud-language', 'V36-sighting-scan', 'V-ui-inventory', 'V-map', 'V-ui-settings', 'V-ui-pause', 'V-ui-tip', 'V-ui-death'];
    const missing = order.filter((n) => !existsSync(path.join(dir, n + '.png')));
    if (missing.length) return { pass: null, detail: { why: 'run the surface rows first', missing } };
    const { default: sharp } = await import('sharp');
    const W = 800, H = 450, G = 10;
    const comps = await Promise.all(order.map(async (n, i) => ({
      input: await sharp(path.join(dir, n + '.png')).resize(W, H).png().toBuffer(),
      left: G + (i % 3) * (W + G), top: G + Math.floor(i / 3) * (H + G),
    })));
    const out = path.join(dir, 'V-ui-sheet.png');
    await sharp({ create: { width: 3 * W + 4 * G, height: 3 * H + 4 * G, channels: 3, background: '#1C1B1E' } }).composite(comps).png().toFile(out);
    return { pass: null, detail: { needsJudge: true, sheet: out, surfaces: order, criteria: this.criteria } };
  },
};

/** For a builder's or judge's extra rows at other angles (`--extra`). */
export { SIGHT_STAGE };

export const GATES = [
  /* actions */
  A_UI_STATIC,
  A_UI_WORDS,
  A_UI_TYPE,
  A_SETTINGS_ROWS,
  A_LAMP_UI,
  A71,
  A71B,
  A71C,
  A71D,
  alias(A71D, 'A71d-conc-veil'),
  A71E,
  re('A71f-interact-anchor'),
  re('A71g-tracker-live'),
  re('A71h-mhb-melee-clear'),
  A_SIGHTING_OFF,
  A_SIGHTING,
  A_SIGHTING_HUE,
  A_OVER_BREA,
  A_TRANSECT_FINE,
  A_SIGHT_DRAWS,
  A62,
  alias(A62, 'A62-focus-components'),
  A63,
  re('A68-no-softlock'),
  re('A69-death-choice'),
  re('A70-hub-tabs'),
  A70B,
  re('A70c-title-flow'),
  re('A72-settings-persist'),
  A72B,
  A_MAP,
  A_MAP_RELOAD,
  A_MAP_ARROW,
  A_DMG_CLEAR,
  /* the absorbed carried row (hud half) */
  re('A10-loot-single-render'),
  /* visuals */
  r10,
  r37,
  V36,
  alias(V36, 'V36-focus-scan'),
  V_MAP,
  ...V_UI,
  hud4k('V-hud-4k-a', 'the staff, the gourd, the field note (top-left)', 0, 0),
  hud4k('V-hud-4k-b', 'the theodolite circle and the vial (top-centre)', -1120, 0),
  hud4k('V-hud-4k-c', 'the plate, the reticle and the breath meter (centre)', -1120, -630),
  hud4k('V-hud-4k-d', 'the kit tag and the tool chips (bottom-right)', -2240, -1260),
  hub4k('V-ui-4k-a', 'the book, map page, top-left: the fore-edge, the station index, the title, the sheet', 'map', 0, 0),
  hub4k('V-ui-4k-b', 'the book, settings page, bottom-right: the foot, the actions', 'settings', -2240, -1260),
  V_UI_SHEET,
];
