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

/** Sighting on the herd kind at 15 m: frozen, composed, the card up. */
const SIGHT_STAGE = (on, hideHero = false) => `
  ${FRAMES}${FACE}
  const ctx = __CTX__;
  ctx.input.enabled = true;
  ${hideHero ? 'if (ctx.player.model) ctx.player.model.visible = false;   /* her violet cloth is the people\'s colour, not the overlay\'s: bible §9.1 */' : ''}
  const m = (await stageRole('herd')) || stagedPicks()[0] || null;
  if (!m) return null;
  m.update = () => {};
  for (const x of ctx.machines.list) if (x !== m && x.alive !== false && Math.hypot(x.position.x - m.position.x, x.position.z - m.position.z) < 30) x.update = () => {};
  const ang = 0.8;
  const aim = () => { faceTarget(m.position, 15, ang, -0.08); ctx.player.camYaw = ang + 0.10; };
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
    if (S._gatherMat?.color) col3d.push({ nm: 'gather', hex: S._gatherMat.color.getHexString() });
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
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return { pass: failed.length === 0, detail: { failed, figure, kind: m.kind, components: comps.map((c) => c.name), rings, leaders: a.leaders, vignette: a.vignette, paths: a.paths, readouts: a.readouts, domHits: domHits.slice(0, 8), col3d, pendingClauses } };
  })()`),
};

/** The overlay's hue histogram, literally: the ON frame's pixels in the banned hues, minus the control frame's. */
const hueCount = async (file) => {
  const { default: sharp } = await import('sharp');
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let violet = 0, teal = 0;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 0.02) continue;
    const l = (mx + mn) / 2, s = d / (1 - Math.abs(2 * l - 1));
    if (s <= 0.4) continue;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
    if (h >= 250 && h <= 290) violet++;
    else if (h >= 160 && h <= 185) teal++;
  }
  const n = info.width * info.height;
  return { pixels: n, violet, teal, violetPct: +(violet / n * 100).toFixed(4), tealPct: +(teal / n * 100).toFixed(4) };
};
const A_SIGHTING_HUE = {
  id: 'A-sighting-hue', kind: 'runner', lane: LANE, timeout: 60000,
  title: 'The Sighting frame adds 0 % of pixels in 250-290 deg (violet) or 160-185 deg (teal) above 0.4 saturation against the control frame of the same stage',
  async check() {
    const dir = path.join(process.cwd(), 'shots/gates');
    const on = path.join(dir, 'A-sighting.png'), off = path.join(dir, 'A-sighting-off.png');
    if (!existsSync(on) || !existsSync(off)) return { pass: null, detail: { why: 'run A-sighting-off and A-sighting first, in the same run', dir } };
    if (Date.now() - statSync(on).mtimeMs > 1500000) return { pass: null, detail: 'frames are stale: run all three in one run' };
    const a = await hueCount(on), b = await hueCount(off);
    const addV = a.violetPct - b.violetPct, addT = a.tealPct - b.tealPct;
    return { pass: addV <= 0.02 && addT <= 0.02, detail: { on: a, off: b, addedVioletPct: +addV.toFixed(4), addedTealPct: +addT.toFixed(4), tolerancePct: 0.02, note: 'the two frames are two boots of one stage, so a few hundred pixels of the world differ; 0.02 % is 288 px at 1600x900' } };
  },
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

const V_MAP = {
  id: 'V-map', kind: 'visual', lane: LANE, settle: 900, timeout: 180000,
  reference: 'reference/r5/gates-perf/field-book (paper) and the plan words: inked contours, soundings, revealed triangles',
  title: 'The survey sheet with T1 + T2 + T6 + T2 + T3 + T6 opened',
  criteria: planBullet('V-map') + INCREDIBLE,
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
    const RETIRED = /--cal-(accent|focus|warn|med|hostile|gold|yellow|terra|parch-dim)\b|--mn-(ink|dim|faint|line|gold|spark|panel)\b/;
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
    const style = strip(readFileSync(path.join(ROOT, 'src/style.css'), 'utf8'));
    const scale = ['--cal-type-display', '--cal-type-title', '--cal-type-head', '--cal-type-label', '--cal-type-micro', '--cal-type-body', '--cal-type-note', '--cal-type-num-l', '--cal-type-num', '--cal-type-num-s'];
    const missing = scale.filter((t) => !new RegExp(t + ':\\s*\\d+px').test(style));
    return { pass: offenders.length === 0 && missing.length === 0, detail: { offenders: offenders.slice(0, 30), typeScale: scale.length, missing } };
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

const UI_ROW = (id, title, setup, extra = {}) => ({
  id, kind: 'visual', lane: LANE, settle: 900, timeout: 180000,
  reference: 'reference/r5/gates-perf/field-book',
  title,
  criteria: 'A surface of V-ui-sheet (one system: Chakra Petch labels, Plex Mono numerals and text, field-book paper, 1 px ink rules, red margin, right angles). FAIL on any other typeface, a pill, a hexagon, smoked glass, teal, violet, a word the bible retired, or anything illegible at 1600x900.' + INCREDIBLE,
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
  })()`),
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
  })()`),
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
  })()`),
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
  /* the absorbed carried row (hud half) */
  re('A10-loot-single-render'),
  /* visuals */
  r10,
  r37,
  V36,
  alias(V36, 'V36-focus-scan'),
  V_MAP,
  ...V_UI,
  V_UI_SHEET,
  hud4k('V-hud-4k-a', 'the staff, the gourd, the field note (top-left)', 0, 0),
  hud4k('V-hud-4k-b', 'the theodolite circle and the vial (top-centre)', -1120, 0),
  hud4k('V-hud-4k-c', 'the plate, the reticle and the breath meter (centre)', -1120, -630),
  hud4k('V-hud-4k-d', 'the kit tag and the tool chips (bottom-right)', -2240, -1260),
];
