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
const LOOK = readFileSync(path.join(ROOT, 'docs/ROUND5-LOOK.md'), 'utf8');
/** A ROUND5-LOOK §7 row, verbatim (its bullet and the indented clauses under it): R66 (e) moves V10, V37, V36, V-map, V-ui-* to these. */
function lookRow(id) {
  const lines = LOOK.split('\n');
  const i = lines.findIndex((l) => l.startsWith('- **' + id + '**'));
  if (i < 0) throw new Error('ROUND5-LOOK §7 row not found: ' + id);
  const out = [lines[i]];
  for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) out.push(lines[j].trim());
  return out.join(' ').replace(/^- /, '').replace(/\*\*/g, '');
}
/** R66 (b): every V row that cites a panel also carries the IP-clause, which outranks every likeness clause. */
const IP_CLAUSE = ' || IP-clause (R66 b, c): nothing from the rights holders R66 (c) names: no names, logos, creature designs or UI trade dress; the panels are graded for light, placement and legibility only, never as a target for chrome geometry, icon glyphs or glows. FAIL on a notch, a cut corner, a hexagon, a hologram, a teal glow or a violet glow wash.';
/** U-17: every look film stages a bible §8.9 beat through hud.stageNote (works only under ?shot=1). */
const STAGE_NOTE = `__CTX__.hud?.stageNote?.({ kicker: 'FIELD NOTE', title: 'THE TILLER HERD', objective: 'Read the herd from cover, then shoot the level vial on the Plumb.' });`;
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
 * the camera off the Instrument so it stands clear of her and still under the crosshair's reading:
 * 0.15 is close to the most it can be at 15 m (`_pickTarget` reads an Instrument within about 2.9 m
 * of the line of sight, about 0.16 rad at this range); 0.22 loses the card.
 */
const SIGHT_STAGE = (on, hideHero = false, yawK = 0.15) => `
  ${FRAMES}${FACE}${CLEAR_BEARING}
  const ctx = __CTX__;
  ctx.input.enabled = true;
  ${STAGE_NOTE}
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

/**
 * A full satchel, from the catalogue itself (no item id is spelled here), holding only what the game
 * can give her today (r1 gate judge): every recipe's inputs and outputs, every stores item, and what a
 * living Instrument carries; never an item named for a kind that is no longer in \`ctx.machines.kinds\`
 * (the four deleted IP kinds' lampglass and hearts).
 */
const SEED_SATCHEL = `{
  const __items = await import('/src/items/items.js');
  const __craft = await import('/src/items/crafting.js');
  const __inv = __CTX__.inventory;
  const __kinds = new Set(__CTX__.machines?.kinds ?? []);
  const __ids = new Set();
  for (const r of __craft.RECIPES ?? []) { __ids.add(r.id); for (const c of r.cost ?? []) __ids.add(c[0]); }
  for (const [id, d] of Object.entries(__items.ITEMS)) if (d.category === 'resource') __ids.add(id);
  /* what a STAGED kind carries (role-mapped, never legacy, R28): a legacy kind still drops a deleted kind's loot */
  const __roles = __CTX__.machines?.roles;
  const __live = new Set([...(typeof __roles?.values === 'function' ? __roles.values() : Object.values(__roles ?? {}))].map((v) => (typeof v === 'string' ? v : v?.kind)).filter((k) => k && __kinds.has(k)));
  /* r5-all-machines: census */ for (const m of __CTX__.machines?.list ?? []) { if (!__live.has(m.kind)) continue; for (const l of m.lootTable ?? []) if (l?.id) __ids.add(l.id); for (const pt of m.parts ?? []) for (const l of pt?.loot ?? []) if (l?.id) __ids.add(l.id); }
  let __k = 3;
  for (const id of __ids) { if (!__items.ITEMS[id]) continue; __inv?.add?.(id, 2 + (__k++ * 5) % 17); }
}`;

/* ---------------------------------------------------------------- rows */

const V37_CRITERIA = planBullet('V10-hud / V37-hud-language') + INCREDIBLE + ' || R66 (e): this row takes ROUND5-LOOK §7 V-hud-glass\'s criteria for its paper clauses (V-hud-glass, registered below, is the same staging); graded on frames from after the world look pass.';

const r10 = re('V37-hud-language', {
  newId: 'V10-hud-language',
  title: 'The field HUD at 40 % HP, aiming, Instrument engaged, tool slot full',
  criteria: V37_CRITERIA,
  setupPatch: [["const STAGE_DIST = 20;", `const STAGE_DIST = 20; ${TOOLS_FULL} ${STAGE_NOTE}`]],
});
const r37 = re('V37-hud-language', {
  title: 'The field HUD at 40 % HP, aiming, Instrument engaged, tool slot full',
  criteria: V37_CRITERIA,
  setupPatch: [["const STAGE_DIST = 20;", `const STAGE_DIST = 20; ${TOOLS_FULL} ${STAGE_NOTE}`]],
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
    ${STAGE_NOTE}
    /* 0.22 rad off the Instrument: her lance clears its ring and the card holds (the reach is an angle now) */
    const __m = await (async () => { ${SIGHT_STAGE(true, false, 0.22)} })();
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
  title: 'With Brea visible and an Instrument and a transect straight behind her, the raised alidade adds 0 pixels inside her silhouette, in WebGL and in its DOM half (rings, casings, leaders, chips, ticks, card); with the knock-out off the same stage adds them',
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
    /* the weak point if it has one (its ring, chip and leader are the DOM half under test), else its centre */
    const wpObj = (m.weakPoints || []).find((w) => w && w.enabled !== false && w.obj)?.obj || null;
    const aimBehind = async () => {
      /* one-pixel-true: turn the camera until that point stands on her chest */
      for (let i = 0; i < 6; i++) {
        const v = m.position.clone(); v.y += (m.height ?? 2.4) * 0.5;
        if (wpObj) wpObj.getWorldPosition(v);
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
    /*
     * The DOM half of the overlay, sampled where it really paints, on the silhouette of the same
     * frame (r1 gate judge: the rings, their casings, the leaders, the part chips and the card's
     * leader are DOM, which the WebGL diff above cannot see). Rings: their stroked circle; leaders:
     * every 2 px along each segment; chips and ticks: their box every 2 px. The reticle is the
     * crosshair she aims with and is not counted.
     */
    const domOnHer = (shot) => {
      const sil = shot.more.px, cssK = shot.w / innerWidth;
      const hit = (x, y) => { const px = Math.round(x * cssK), py = shot.h - 1 - Math.round(y * cssK); return px >= 0 && px < shot.w && py >= 0 && py < shot.h && sil[(py * shot.w + px) * 4] > 127; };
      const shown = (el) => el.style.display !== 'none' && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
      const by = {}, add = (k, n) => { by[k] = (by[k] || 0) + n; };
      for (const el of document.querySelectorAll('#calf-layer .calf-ring, #calf-layer .calf-ring-u')) {
        if (!shown(el)) continue;
        const cx = +el.getAttribute('cx'), cy = +el.getAttribute('cy'), r = +el.getAttribute('r');
        const sw = parseFloat(getComputedStyle(el).strokeWidth) || 2;
        for (let i = 0; i < 96; i++) { const a = i / 96 * 6.2832; for (let k = -1; k <= 1; k++) { const rr = r + k * sw * 0.5; if (hit(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)) add(el.getAttribute('class'), 1); } }
      }
      for (const el of document.querySelectorAll('#calf-layer .calf-leader, #calf-layer .calf-leader-u')) {
        if (!shown(el)) continue;
        const pts = (el.getAttribute('points') || '').trim().split(/\s+/).map((q) => q.split(',').map(Number)).filter((q) => q.length === 2 && q.every(Number.isFinite));
        for (let i = 1; i < pts.length; i++) {
          const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
          for (let k = 0; k <= n; k++) if (hit(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n)) add(el.getAttribute('class'), 1);
        }
      }
      for (const el of document.querySelectorAll('#calf-layer .calf-plabel, #calf-layer .calf-reveal, #calf-layer .calf-rtick, #calf-layer .calf-card.show')) {
        if (!shown(el) || el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        for (let y = Math.round(r.top); y < r.bottom; y += 2) for (let x = Math.round(r.left); x < r.right; x += 2) if (hit(x, y)) add(String(el.className).split(' ')[0], 4);
      }
      return { total: Object.values(by).reduce((a, b) => a + b, 0), by };
    };
    const shot = await overlayFrame(() => herSilhouette());
    const on = count(shot, shot.more.px);
    const dom = domOnHer(shot);
    const chipPx = dom.by['calf-reveal'] || 0;
    const domDrawn = { rings: [...document.querySelectorAll('.calf-ring')].filter((e) => e.style.display !== 'none').length, leaders: [...document.querySelectorAll('.calf-leader')].filter((e) => e.style.display !== 'none').length, labels: [...document.querySelectorAll('.calf-plabel')].filter((e) => e.style.display !== 'none').length };
    S.debugOcclusion(false);
    await frames(3);
    const shot2 = await overlayFrame(() => herSilhouette());
    const off = count(shot2, shot2.more.px);
    const domOff = domOnHer(shot2);
    const domDrawnOff = { rings: [...document.querySelectorAll('.calf-ring')].filter((e) => e.style.display !== 'none').length, leaders: [...document.querySelectorAll('.calf-leader')].filter((e) => e.style.display !== 'none').length, labels: [...document.querySelectorAll('.calf-plabel')].filter((e) => e.style.display !== 'none').length };
    S.debugOcclusion(true);
    delete S._walksRoute;
    const checks = {
      herVisibleInFrame: on.insidePx > 4000,
      overlayDrew: on.outsidePx > 300,
      noPixelOverHer: on.addedPx === 0,
      noPaperOverHer: on.paperPx === 0,
      controlCatchesIt: off.addedPx > 150,
      noRevealOnHer: chipPx === 0,
      noDomInkOnHer: dom.total === 0,
      domControlCatchesIt: domOff.total > 0,
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return { pass: failed.length === 0, detail: { failed, on, control: off, chipPx, dom, domControl: domOff, domDrawn, domDrawnOff, herBox: S.audit().herBox, meshesInSilhouette: shot.more.meshes, heroShells: S._heroShells.size, paths: S._paths.size } };
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
    /* W1 fix round 2: the row's own rule ("the first stand-off at which ITS plate is free at 1.6") with two
       farther candidates. At 1.6 the 448 px plate of a Tiller 26-44 m off rides above the top band and
       is clamped there; the row then leaned on a second, free plate, which U-02's compact plates now
       step off the engaged Instruments' boxes. Every check below is unchanged. */
    [`for (const d of [26, 34, 44]) {`, `for (const d of [26, 34, 44, 56, 70]) {`],
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
        /* R66 (e): the card is glass now (U-01): the violet-black at the HUD's 0.70 */
        glassCard: getComputedStyle(el).backgroundColor === 'rgba(30, 26, 40, 0.7)' && el.classList.contains('cal-glass'),
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
  title: 'All surfaces (HUD, hub, satchel, map, tips, cards, Sighting, death) render none of the plan §9 A-ui-words terms, and no two items print under one name (the catalogue, and every satchel page as rendered)',
  assert: `(async () => {${FRAMES}${STORAGE_GUARD}
    const snap = snapStorage();
    const RE = new RegExp(${JSON.stringify(UI_WORDS_RE)}, 'gi');
    const c = __CTX__, m = c.menus, hud = window.__HUD_DEBUG__;
    c.input.enabled = true;
    const s = {}, later = {};
    const pageCollisions = [];
    let itemRows = 0;
    /* the word bridge is injective over the whole catalogue: one player word, one item */
    const catalogueCollisions = [];
    {
      const IT = await import('/src/items/items.js'), TP = await import('/src/ui/tips.js');
      const byWord = new Map();
      const put = (id, name) => { const w = TP.fieldWord(name).toUpperCase(); if (!byWord.has(w)) byWord.set(w, new Set()); byWord.get(w).add(id); };
      for (const [id, d] of Object.entries(IT.ITEMS)) put(id, d.name);
      for (const [id, d] of Object.entries(IT.AMMO_INFO ?? {})) put('ammo:' + id, d.name);
      for (const [w, ids] of byWord) if (ids.size > 1) catalogueCollisions.push(w + ' <- ' + [...ids].join(', '));
    }
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
      ${SEED_SATCHEL}
      for (const p of ['resources', 'ammo', 'tools', 'valuables', 'crafting', 'notebook', 'trade']) {
        c.items?.screen?.open?.(p);
        c.items?.screen?._render?.();
        await frames(2);
        s['satchel:' + p] = document.querySelector('.cal-inv')?.innerText || '';
        /* r1 gate judge: no two items print under one name on a page */
        const seen = new Map();
        for (const el of document.querySelectorAll('.cal-inv [data-item]')) {
          if (el.offsetParent === null) continue;
          const nm = (el.querySelector('.cal-card-name, .cal-trade-name')?.textContent || '').trim();
          if (!nm) continue;
          const id = el.dataset.item.replace(/^ammo:/, 'ammo:');
          if (!seen.has(nm)) seen.set(nm, new Set());
          seen.get(nm).add(id);
        }
        for (const [nm, ids] of seen) if (ids.size > 1) pageCollisions.push(p + ': ' + nm + ' <- ' + [...ids].join(', '));
        itemRows += seen.size;
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
    return { pass: hits.length === 0 && Object.keys(s).length > 30 && catalogueCollisions.length === 0 && pageCollisions.length === 0 && itemRows > 10,
      detail: { hits: hits.slice(0, 40), surfaces: Object.keys(s).length, catalogueCollisions, pageCollisions, itemRows,
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
    ${STAGE_NOTE}
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
const hud4k = (id, title, dx, dy, extra = '') => ({
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
    ${extra}
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

/* ===================================================== W1 fix round 2: declutter, staging, glass */

/**
 * Text-bearing surfaces, counted on the rendered DOM (A-ui-declutter): a surface is a top-level
 * piece of the HUD or the alidade (a child of #hud, of the top-left column, of the projected
 * layers, of #calf-layer, or a toast in a stack) that shows at least one visible text node with
 * effective opacity >= 0.15 and at least half of its box on screen.
 */
const SURFACES = `
  const textSurfaces = () => {
    const STACK = (n) => n && (n.id === 'hud' || n.id === 'calf-layer' || (n.classList && (n.classList.contains('cal-topleft')
      || n.classList.contains('cal-world') || n.classList.contains('cal-awares') || n.classList.contains('cal-dmglayer')
      || n.classList.contains('cal-banners') || n.classList.contains('cal-items') || n.classList.contains('cal-flashes'))));
    const rootOf = (el) => { let n = el; while (n && n.parentElement && !STACK(n.parentElement)) n = n.parentElement; return n && n.parentElement ? n : null; };
    const eff = (el) => { let a = 1; for (let n = el; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; a *= parseFloat(cs.opacity); if (!(a > 0)) return 0; } return a; };
    const roots = new Map();
    for (const top of [document.getElementById('hud'), document.getElementById('calf-layer')]) {
      if (!top) continue;
      const tw = document.createTreeWalker(top, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = tw.nextNode())) {
        if (!/[A-Za-z0-9]/.test(n.nodeValue)) continue;
        const el = n.parentElement;
        if (!el) continue;
        const root = rootOf(el);
        if (!root || roots.has(root)) continue;
        if (eff(el) < 0.15) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const vx = Math.min(r.right, innerWidth) - Math.max(r.left, 0), vy = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
        if (vx < r.width * 0.5 || vy < r.height * 0.5) continue;
        roots.set(root, (root.className && String(root.className.baseVal ?? root.className).split(' ')[0]) || root.tagName);
      }
    }
    return [...roots.values()];
  };`;

/** The judge's finding: raising the alidade with the SIGHTING card up must not stack the two cards. */
const A_TIP_CARD = {
  id: 'A-sighting-tip-clear', kind: 'action', lane: LANE, timeout: 150000, settle: 600,
  title: 'The SIGHTING tutorial card is up when she raises the alidade, as it asks: the card puts itself away and never intersects the Instrument card',
  assert: staged(['herd'], `(async () => {
    ${FRAMES}
    const hud = window.__HUD_DEBUG__, H = __CTX__.hud;
    hud.resetTips(); H._tipQueue.length = 0; H._tipT = 0; H._tipGap = 0;
    const m = await (async () => { ${SIGHT_STAGE(false)} })();
    if (!m) return { pass: null, detail: 'SKIP-R18: no herd kind stands' };
    hud.showTip('sighting');
    const t0 = performance.now();
    while (!H._tipEl.classList.contains('show') && performance.now() - t0 < 4000) await wait(100);
    const tipUp = H._tipEl.classList.contains('show');
    const tipRect = H._tipEl.getBoundingClientRect();
    /* she does what the card asks: V */
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', key: 'v', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyV', key: 'v', bubbles: true }));
    if (!__CTX__.sighting.on) __CTX__.sighting.toggle(true);
    const rows = [];
    const t1 = performance.now();
    let worst = 0;
    while (performance.now() - t1 < 3200) {
      await wait(160);
      const a = __CTX__.sighting.audit();
      const c = document.querySelector('.calf-card').getBoundingClientRect(), t = H._tipEl.getBoundingClientRect();
      const tipShown = parseFloat(getComputedStyle(H._tipEl).opacity) > 0.05 && getComputedStyle(H._tipEl).visibility !== 'hidden';
      const ox = Math.min(c.right, t.right) - Math.max(c.left, t.left), oy = Math.min(c.bottom, t.bottom) - Math.max(c.top, t.top);
      const inter = a.cardVisible && tipShown && ox > 0 && oy > 0 ? Math.round(ox * oy) : 0;
      worst = Math.max(worst, inter);
      rows.push({ ms: Math.round(performance.now() - t1), card: a.cardVisible, tip: tipShown, id: H._tipCur, inter });
    }
    const checks = {
      tipWasUp: tipUp,
      cardCameUp: rows.some((r) => r.card),
      neverIntersect: worst === 0,
      /* once the alidade is up the SIGHTING card is gone (a later card in the queue may follow it) */
      sightingTipPutAway: rows.filter((r) => r.card).every((r) => !(r.tip && r.id === 'sighting')),
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return { pass: failed.length === 0, detail: { failed, tipRect: [tipRect.left, tipRect.top, tipRect.right, tipRect.bottom].map(Math.round), worstPx: worst, rows: rows.filter((r, i) => i % 3 === 0) } };
  })()`),
};

/** Three of the herd engaged, the latest hit most recently: one full plate, the others compact. */
const PLATES_STAGE = `
  const stagePlates = async () => {
    const c = __CTX__, p = c.player, pp = p.position;
    const herd = [];
    for (let i = 0; i < 3; i++) { try { const mm = spawnRole('herd', pp.x + 16 + i * 6, pp.z + 18 - i * 3); if (mm) herd.push(mm); } catch (e) { /* named below */ } }
    await wait(700);
    for (const mm of herd) mm.update = () => {};
    const mid = herd[1] || herd[0];
    if (mid) p.camYaw = Math.atan2(mid.position.x - pp.x, mid.position.z - pp.z) + Math.PI;
    for (const mm of herd) {
      const pt = mm.position.clone(); pt.y += (mm.height ?? 2.2) * 0.6;
      c.events.emit('machine-damaged', { machine: mm, damage: 12, weak: false, point: pt, tear: 0, tornPart: null, triggeredElement: null });
      await wait(120);
    }
    await frames(20);
    return herd;
  };`;

const A_DECLUTTER = {
  id: 'A-ui-declutter', kind: 'action', lane: LANE, timeout: 240000, settle: 600,
  title: 'U-02: the alidade on the herd at 15 m shows <= 8 text surfaces, <= 2 reveal chips with words, its bearing and range in the card (no floating box); three engaged show one full plate and <= 2 compact; calm exploration (full health, nothing Flagged, 30 s idle) shows <= 4',
  criteria: lookRow('A-ui-declutter'),
  assert: staged(['herd'], `(async () => {
    ${FRAMES}${SURFACES}${PLATES_STAGE}
    const c = __CTX__, S = c.sighting, hud = window.__HUD_DEBUG__;
    ${STAGE_NOTE}
    /* 1. the alidade on the herd at 15 m, her in the frame */
    const m = await (async () => { ${SIGHT_STAGE(true, false)} })();
    if (!m) return { pass: null, detail: 'SKIP-R18: no herd kind stands' };
    await frames(6);
    const a = S.audit();
    const sight = textSurfaces();
    const eye = hud.surfaces().eye;
    const card = document.querySelector('.calf-card')?.innerText || '';
    const floating = [...document.querySelectorAll('#calf-layer .calf-read')].filter((e) => e.offsetParent !== null).length;
    const textReveals = a.reveals.length;
    S.toggle(false);
    await frames(10);
    /* 2. three engaged, as V37 stages them */
    const herd = await stagePlates();
    const mb = hud.surfaces().machineBars;
    const plates = [...document.querySelectorAll('.cal-mhb')].filter((e) => getComputedStyle(e).visibility === 'visible');
    const full = plates.filter((e) => !e.classList.contains('compact')).length, compact = plates.filter((e) => e.classList.contains('compact')).length;
    /* no plate on an engaged Instrument (r1 gate judge: the Tiller hid behind its own plates) */
    const B = c.hud._mhbBox, covered = [];
    for (const el of plates) {
      const r = el.querySelector('.cal-mhb-plate').getBoundingClientRect();
      for (let j = 0; j < 3; j++) { const o = j * 4; if (B[o + 2] <= B[o]) continue; const ox = Math.min(r.right, B[o + 2]) - Math.max(r.left, B[o]), oy = Math.min(r.bottom, B[o + 3]) - Math.max(r.top, B[o + 1]); if (ox > 2 && oy > 2) covered.push(Math.round(ox * oy)); }
    }
    /* 3. calm: everything away, full health, nothing Flagged, 30 s */
    /* calm means calm: everyone 400 m off, at rest, reading nothing */
    /* r5-all-machines: clear */ for (const x of c.machines.list) { if (x.alive !== false) { x.position.x += 400; x.root?.position?.set?.(x.position.x, x.position.y, x.position.z); x.update = () => {}; x.state = 'idle'; x.suspicion = 0; } }
    for (const [mm, el] of S.tags) { el.remove(); S.tags.delete(mm); }
    c.player.health = c.player.maxHealth;
    c.hud._engaged.clear();
    document.getElementById('hud').classList.remove('reveal');
    const t0 = performance.now();
    while (performance.now() - t0 < 30500) { c.player.health = c.player.maxHealth; await wait(500); }
    const calm = textSurfaces();
    const eyeCalm = hud.surfaces().eye;
    const checks = {
      sightingSurfacesAtMost8: sight.length <= 8,
      textRevealsAtMost2: textReveals <= 2,
      noFloatingReadout: floating === 0,
      cardCarriesBearing: /BRG\\s*\\d{3}/.test(card) && /DST\\s*\\d{3}/.test(card),
      oneFullPlate: full <= 1 && plates.length >= 1,
      compactAtMost2: compact <= 2,
      noPlateOnAnEngagedInstrument: covered.length === 0,
      calmAtMost4: calm.length <= 4,
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return { pass: failed.length === 0, detail: { failed, sight, eye, textReveals, ticks: a.revealTicks, candidates: a.revealCandidates, card: card.slice(0, 80), herd: herd.length, plates: { full, compact, names: mb.names }, covered, calm, eyeCalm,
      gradedWith: 'A-sighting, A63, A71c, A71g, A-dmg-chip-clear in the same run (the row\\'s fifth clause)' } };
  })()`),
};

/** U-17: the look frames carry CALIMA's quest words only, through hud.stageNote. */
const LOOK_WORDS_RE = (() => {
  const line = LOOK.split('\n').find((l) => l.includes('0 case-insensitive matches of'));
  const m = line && line.match(/`(\\b\(.+?\)\\b)`/);
  if (!m) throw new Error('A-ui-words-look regex not found in ROUND5-LOOK §7');
  return m[1];
})();
const A_WORDS_LOOK = {
  id: 'A-ui-words-look', kind: 'action', lane: LANE, timeout: 200000, settle: 600,
  title: "U-17: the DOM text of every look-gate frame of this lane (the field HUD, the alidade on the herd, three engaged, a tutorial card) matches none of ROUND5-LOOK §7's IP words, with the note staged by hud.stageNote; outside ?shot the call refuses",
  criteria: lookRow('A-ui-words-look'),
  assert: staged(['herd'], `(async () => {
    ${FRAMES}${PLATES_STAGE}
    const RE = new RegExp(${JSON.stringify(LOOK_WORDS_RE)}, 'gi');
    const c = __CTX__, hud = window.__HUD_DEBUG__, H = c.hud;
    const staged = H.stageNote({ kicker: 'FIELD NOTE', title: 'THE TILLER HERD', objective: 'Read the herd from cover, then shoot the level vial on the Plumb.' });
    const texts = {};
    const grab = (k) => { texts[k] = (document.getElementById('hud')?.innerText || '') + ' ' + (document.getElementById('calf-layer')?.innerText || ''); };
    document.getElementById('hud').classList.add('reveal');
    await frames(6); grab('field');
    const m = await (async () => { ${SIGHT_STAGE(true, false, 0.22)} })();
    if (m) grab('sighting');
    c.sighting.toggle(false); await frames(6);
    await stagePlates(); grab('engaged');
    hud.resetTips(); H._tipQueue.length = 0; H._tipT = 0; H._tipGap = 0;
    hud.showTip('bow');
    const t0 = performance.now();
    while (!H._tipEl.classList.contains('show') && performance.now() - t0 < 4000) await wait(100);
    grab('tip');
    const note = { kicker: H._trackKicker.textContent, title: H._trackTitle.textContent, obj: H._trackObj.textContent };
    /* the contract's other half: outside ?shot nothing can be staged */
    const realParams = c.params;
    c.params = new URLSearchParams('');
    const refusedInPlay = H.stageNote({ title: 'X', objective: 'Y' }) === false;
    c.params = realParams;
    const hits = [];
    for (const [k, t] of Object.entries(texts)) for (const mm of String(t).matchAll(RE)) hits.push(k + ': "' + mm[0] + '"');
    const checks = { staged: staged === true, noteIsStaged: note.title === 'THE TILLER HERD', zeroHits: hits.length === 0, framesRead: Object.keys(texts).length >= 4, refusedInPlay };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return { pass: failed.length === 0, detail: { failed, hits, frames: Object.keys(texts), note, gradedWith: 'A-ui-words-all in the same run' } };
  })()`),
};

/** CIE dE2000 between two sRGB triples (0-255), for the glass rows. */
const DE2000 = `
  const lab = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; const R = f(r), G = f(g), B = f(b);
    let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const t = (v) => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116; X = t(X); Y = t(Y); Z = t(Z); return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; };
  const de00 = (c1, c2) => { const [L1, a1, b1] = lab(...c1), [L2, a2, b2] = lab(...c2); const rad = Math.PI / 180;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
    const a1p = a1 * (1 + G), a2p = a2 * (1 + G), C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const h = (b, a) => { if (!a && !b) return 0; const v = Math.atan2(b, a) / rad; return v < 0 ? v + 360 : v; }; const h1 = h(b1, a1p), h2 = h(b2, a2p);
    const dL = L2 - L1, dC = C2p - C1p; let dh = 0; if (C1p * C2p) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
    const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * rad / 2); const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    let hb = h1 + h2; if (C1p * C2p) { if (Math.abs(h1 - h2) > 180) hb += h1 + h2 < 360 ? 360 : -360; hb /= 2; }
    const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
    const SL = 1 + 0.015 * (Lb - 50) ** 2 / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
    const RT = -2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad);
    return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH)); };
  const rgba = (s) => { const m = String(s).match(/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
  const GLASS = [30, 26, 40];
  const FIVE = [[255, 36, 19], [56, 198, 255], [255, 179, 31], [25, 255, 208], [155, 107, 255]];`;

/** The rendered DOM under the glass rules (A-glass-language-static's live half). */
const GLASS_SCAN = `
  const glassScan = (where, roots) => {
    const out = { panels: 0, badAlpha: [], badTint: [], backdrop: [], clip: [], radius: [], teal: [], circles: 0 };
    const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2; if (!d) return [0, 0]; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return [h < 0 ? h + 360 : h, s]; };
    /* discs by role: the compass marks and the lamp's iris, the vial's bubble, the emblem's ring, the weak-point rings */
    const disc = (el) => !!el.closest('[data-shape], .cal-iris, .cal-vial-bubble, .cal-pip');
    /* the selection is a dye fill (Orchil Deep at 60 %), not a glass panel */
    const isSelect = (v) => v && Math.abs(v[0] - 90) + Math.abs(v[1] - 46) + Math.abs(v[2] - 102) < 6;
    for (const root of roots) {
      if (!root) continue;
      for (const el of [root, ...root.querySelectorAll('*')]) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        const tag = where + ' ' + (String(el.className?.baseVal ?? el.className).split(' ')[0] || el.tagName);
        if (cs.backdropFilter && cs.backdropFilter !== 'none') out.backdrop.push(tag);
        if (/blur\\(/.test(cs.filter || '')) out.backdrop.push(tag + ' filter:blur');
        const panel = r.width >= 40 && r.height >= 16 && (rgba(cs.backgroundColor)?.[3] > 0.05 || cs.backgroundImage !== 'none');
        const cp = cs.clipPath || 'none';
        if (panel && /polygon\\(/.test(cp)) {
          const pts = cp.slice(cp.indexOf('(') + 1, cp.lastIndexOf(')')).split(',').map((q) => q.trim().split(/\\s+/));
          let diag = false;
          for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if (a[0] !== b[0] && a[1] !== b[1]) diag = true; }
          if (pts.length >= 5 || diag) out.clip.push(tag + ' ' + cp.slice(0, 60));
        }
        const rad = Math.max(...[cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].map((v) => parseFloat(v) || 0));
        if (rad > 2 && !disc(el)) out.radius.push(tag + ' ' + rad);
        if (el.tagName === 'circle' || el.tagName === 'ellipse') { out.circles++; if (!disc(el)) out.radius.push(tag + ' <' + el.tagName + '>'); }
        for (const k of ['color', 'backgroundColor', 'borderTopColor', 'fill', 'stroke']) {
          const v = rgba(cs[k]); if (!v || v[3] <= 0.02) continue;
          const [h, s] = hsl(v[0], v[1], v[2]);
          if (h >= 160 && h <= 185 && s > 0.4) out.teal.push(tag + ' ' + k + ' ' + cs[k]);
        }
        if (el.classList?.contains('cal-glass') && !isSelect(rgba(cs.backgroundColor))) {
          out.panels++;
          const v = rgba(cs.backgroundColor);
          if (!v || v[3] < 0.66 || v[3] > 0.95) out.badAlpha.push(tag + ' ' + cs.backgroundColor);
          else if (de00(v.slice(0, 3), GLASS) > 3) out.badTint.push(tag + ' ' + cs.backgroundColor);
        }
      }
    }
    return out;
  };`;

const A_GLASS_STATIC = {
  id: 'A-glass-language-static', kind: 'action', lane: LANE, timeout: 200000, settle: 900,
  title: 'U-01 on the rendered DOM: 0 backdrop-filter or blur while playing, 0 clip-path panels with >= 5 vertices or a diagonal edge, 0 radius > 2 px outside discs by role (SVG circles counted), every glass panel alpha 0.66-0.95 within dE00 3 of #1E1A28, 0 teal; every glow / focus / accent / select / highlight token >= 20 dE00 from the five',
  criteria: lookRow('A-glass-language-static'),
  assert: staged(['herd'], `(async () => {
    ${FRAMES}${DE2000}${GLASS_SCAN}
    const c = __CTX__;
    c.input.enabled = true;
    document.getElementById('hud').classList.add('reveal');
    ${TOOLS_FULL}
    await frames(8);
    const scans = {};
    scans.hud = glassScan('hud', [document.getElementById('hud')]);
    const m = await (async () => { ${SIGHT_STAGE(true, false)} })();
    scans.sighting = glassScan('sighting', [document.getElementById('hud'), document.getElementById('calf-layer')]);
    c.sighting.toggle(false); await frames(4);
    window.__HUD_DEBUG__.resetTips(); c.hud._tipQueue.length = 0; c.hud._tipT = 0; c.hud._tipGap = 0;
    window.__HUD_DEBUG__.showTip('bow');
    await wait(900);
    scans.tip = glassScan('tip', [document.getElementById('hud')]);
    /* the tokens by name: every glow, focus, accent, select and highlight colour */
    const tokens = [];
    for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch { continue; } for (const r of rules) { if (r.selectorText !== ':root') continue; for (const k of r.style) if (/--cal-.*(glow|focus|accent|select|highlight)/.test(k)) tokens.push(k); } }
    const tokenDist = tokens.map((k) => { const raw = getComputedStyle(document.documentElement).getPropertyValue(k).trim(); const probe = document.createElement('i'); probe.style.color = raw; document.body.appendChild(probe); const v = rgba(getComputedStyle(probe).color); probe.remove(); return { k, raw, min: v ? +Math.min(...FIVE.map((f) => de00(v.slice(0, 3), f))).toFixed(1) : null }; });
    const sum = (k) => Object.values(scans).reduce((n, s) => n + s[k].length, 0);
    const checks = {
      noBackdropOrBlur: sum('backdrop') === 0,
      noNotchedPanels: sum('clip') === 0,
      radiusOnlyOnDiscs: sum('radius') === 0,
      glassAlpha: sum('badAlpha') === 0,
      glassTint: sum('badTint') === 0,
      glassPanelsPresent: Object.values(scans).reduce((n, s) => n + s.panels, 0) >= 6,
      noTeal: sum('teal') === 0,
      tokensFarFromTheFive: tokenDist.length > 0 && tokenDist.every((t) => t.min != null && t.min >= 20),
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    const trim = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v.slice(0, 6) : v]));
    return { pass: failed.length === 0, detail: { failed, scans: Object.fromEntries(Object.entries(scans).map(([k, v]) => [k, trim(v)])), tokenDist,
      pendingClauses: ['the hub, title, map and satchel pages are paper until their W2 restyle (U-08..U-11): their glass panels are graded then; their border-radius / clip / backdrop clauses hold today through A-ui-language-static', '0 px of teal in a UI FRAME: graded here on every colour the DOM paints (the frame-pixel form waits for the orchestrator CDP wrapper, U-04)', 'A-ui-type-only PASS: graded in the same run'] } };
  })()`),
};

const A_HUD_GLASS = {
  id: 'A-hud-glass', kind: 'action', lane: LANE, timeout: 200000, settle: 900,
  title: 'U-06 (started): every HUD glass panel alpha 0.66-0.80 over #1E1A28 within dE00 3; the staff 300 +- 8 px with 9 graduation gaps; tools centred within 12 px of W/2 with their bottom >= 0.92 H; no minimap',
  criteria: lookRow('A-hud-glass'),
  assert: staged(['herd'], `(async () => {
    ${FRAMES}${DE2000}
    const c = __CTX__, hud = window.__HUD_DEBUG__;
    c.input.enabled = true;
    document.getElementById('hud').classList.add('reveal');
    ${TOOLS_FULL}
    ${STAGE_NOTE}
    await frames(10);
    const m = await (async () => { ${SIGHT_STAGE(true, false)} })();
    await frames(6);
    const panels = [...document.querySelectorAll('#hud .cal-glass, #calf-layer .cal-glass')].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0);
    const bad = [];
    for (const e of panels) { const v = rgba(getComputedStyle(e).backgroundColor); if (v && Math.abs(v[0] - 90) + Math.abs(v[1] - 46) + Math.abs(v[2] - 102) < 6) continue; if (!v || v[3] < 0.66 || v[3] > 0.80 || de00(v.slice(0, 3), GLASS) > 3) bad.push(String(e.className).split(' ')[0] + ' ' + getComputedStyle(e).backgroundColor); }
    const s = hud.surfaces();
    const tools = document.querySelector('.cal-tools');
    const tr = tools.getBoundingClientRect();
    const toolsShown = getComputedStyle(tools).display !== 'none' && tr.width > 0;
    const minimap = document.querySelectorAll('[class*="minimap"], [id*="minimap"]').length;
    const checks = {
      hudPanelsGlass: panels.length >= 5 && bad.length === 0,
      staff300: Math.abs(s.health.widthPx - 300) <= 8,
      nineGaps: s.health.gaps === 9 && s.health.graduations === 10,
      toolsCentred: !toolsShown || Math.abs((tr.left + tr.right) / 2 - innerWidth / 2) <= 12,
      toolsLow: !toolsShown || tr.bottom >= innerHeight * 0.92,
      noMinimap: minimap === 0,
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return { pass: failed.length === 0, detail: { failed, panels: panels.length, bad, staff: { w: s.health.widthPx, h: s.health.heightPx, gaps: s.health.gaps, graduations: s.health.graduations, colors: s.health.graduationColors }, tools: { shown: toolsShown, cx: Math.round((tr.left + tr.right) / 2), bottom: Math.round(tr.bottom), slots: s.tools.slots },
      pendingClauses: ['tools: the slots are combat-kit W2 (the Kit Rack); graded on whatever slots the tree has, and vacuous with none shown (' + (toolsShown ? 'shown' : 'none shown') + ')', 'the A71b/c/d/f/g/h, A63, A-dmg-chip-clear and A-ui-contrast clauses: graded with those rows; A-ui-contrast is W2 (U-05)', 'the interact prompt beside the crosshair (U-06): it stays projected on the interactable, because A71f-interact-anchor (carried, binding) grades exactly that; the orchestrator rules which bar holds at W2'] } };
  })()`),
};

const GLASS_REF = 'reference/r5/shell-ui/glass-tokens.png (project-original, rendered from U-01 by R-glass-tokens) · ext:kevin-nov6-keyart.jpg@860d7e9f#1-TR · ext:kevin-nov6-board.jpg@f2694e04#2-MR · ext:kevin-nov6-stills.md@bf79cdc9#5-3';
const V_HUD_DECLUTTER = {
  id: 'V-hud-declutter', kind: 'visual', lane: LANE, settle: 900, timeout: 150000,
  reference: GLASS_REF,
  title: 'U-02: the alidade on the herd at 15 m, her in the frame, the six surfaces of 1-TR',
  criteria: lookRow('V-hud-declutter') + IP_CLAUSE + INCREDIBLE,
  setup: stagedSetup(['herd'], `(async () => {
    ${STAGE_NOTE}
    const __m = await (async () => { ${SIGHT_STAGE(true, false, 0.22)} })();
    if (!__m) { __skipCard('STAGING FAILED: no herd kind could be staged'); }
    /* the herd noticed the spawn; four calm seconds and the vial puts itself away, as in play */
    await new Promise((r) => setTimeout(r, 4600));
  })()`),
};

const V_HUD_GLASS = {
  id: 'V-hud-glass', kind: 'visual', lane: LANE, settle: 1200, timeout: 180000,
  reference: GLASS_REF,
  title: 'U-06 (started): the thin glass field HUD at 40 % HP, aiming, an Instrument engaged, a tool slot full',
  criteria: lookRow('V-hud-glass') + IP_CLAUSE + INCREDIBLE + ' || R66 (e): graded on frames from after the world look pass; this W1 frame is the start of U-06.',
  setup: null,   // set below from r37's staging
};

/**
 * The project-original stored reference for every glass V-row (U-01): the tokens rendered by the
 * game's own stylesheet over four lights (white salt at noon, golden grass, dusk, night). The frame
 * is copied to reference/r5/shell-ui/glass-tokens.png with its MANIFEST row.
 */
const R_GLASS_TOKENS = {
  id: 'R-glass-tokens', kind: 'visual', lane: LANE, settle: 900, timeout: 120000,
  reference: 'none: this frame IS the reference (project-original, CC0 by construction)',
  title: 'The U-01 glass tokens, rendered from src/style.css over four lights',
  criteria: lookRow('A-glass-language-static') + ' || The sheet a judge holds every glass row against: dark violet glass that recedes, staff-white type that holds at four lights, lilac selection over Orchil Deep, the vermilion staff, the WEAK chip, right angles with registration ticks. FAIL on a notch, a hexagon, a glow, teal.',
  setup: `(async () => {${FRAMES}
    await document.fonts.ready;
    const lights = [['WHITE SALT · 12:00', 'linear-gradient(180deg, #F6F3EC, #E9E4D8)'], ['GOLDEN GRASS · 18:40', 'linear-gradient(180deg, #E6B46A, #A8742F)'], ['DUSK · 20:10', 'linear-gradient(180deg, #7C6A8C, #3E3550)'], ['NIGHT · 23:30', 'linear-gradient(180deg, #1A2030, #0B0D14)']];
    const sheet = document.createElement('div');
    sheet.id = 'r-glass-tokens';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:grid;grid-template-columns:repeat(4,1fr);font-family:var(--cal-font-mono);color:var(--cal-staff)';
    const col = (name, bg) => \`<div style="position:relative;background:\${bg};padding:22px 18px;display:flex;flex-direction:column;gap:14px">
      <div style="font:600 11px var(--cal-font-ui);letter-spacing:.22em;color:\${name.startsWith('WHITE') || name.startsWith('GOLD') ? '#1C1B1E' : '#F1EEE6'}">\${name}</div>
      <div class="cal-glass" style="position:relative;padding:9px 12px 10px 17px"><i style="position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--cal-c-staff)"></i>
        <div style="font:600 11px var(--cal-font-ui);letter-spacing:.22em;color:var(--cal-glass-text-2)">FIELD NOTE</div>
        <div style="font:600 17px var(--cal-font-ui);letter-spacing:.07em;margin-top:2px">THE FIRST TRIANGLE</div>
        <div style="font:400 13px var(--cal-font-mono);margin-top:3px">Climb T1 on the Organ Shelf; sight T2 and T6.</div></div>
      <div style="display:flex;align-items:center;gap:8px"><svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.4" fill="none" stroke="rgba(20,22,26,.62)" stroke-width="3.4"/><circle cx="12" cy="12" r="10.4" fill="none" stroke="#F1EEE6" stroke-width="1.4"/><path d="M12 6.5V17.5M12 6.5L7.4 13M12 6.5L16.6 13" fill="none" stroke="#D2452E" stroke-width="1.8"/></svg>
        <svg width="200" height="6" viewBox="0 0 300 6" preserveAspectRatio="none" style="box-shadow:0 0 0 1px rgba(20,22,26,.62)">\${Array.from({ length: 10 }, (_, i) => \`<rect x="\${i * 30 + (i ? 1 : 0)}" width="\${i ? 29 : 30}" height="6" fill="\${i < 7 ? '#D2452E' : 'rgba(30,26,40,.78)'}"/>\`).join('')}\${Array.from({ length: 9 }, (_, i) => \`<rect x="\${(i + 1) * 30 - 1}" width="2" height="6" fill="#F1EEE6"/>\`).join('')}</svg>
        <span class="cal-glass" style="position:relative;padding:3px 7px 2px;font:600 15px var(--cal-font-mono)">070<span style="font:400 11px var(--cal-font-mono);color:var(--cal-staff-80)">/100</span></span></div>
      <div class="cal-glass" style="position:relative;padding:8px 12px 10px 17px;--glass-a:.80"><i style="position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--cal-c-staff)"></i>
        <div style="font:400 12px var(--cal-font-mono);color:var(--cal-glass-text-2);border-bottom:1px solid var(--cal-glass-line);padding-bottom:3px"><span style="font:600 11px var(--cal-font-ui);letter-spacing:.12em">BRG</span> <b style="color:#F1EEE6">126</b>  <span style="font:600 11px var(--cal-font-ui);letter-spacing:.12em">DST</span> <b style="color:#F1EEE6">018</b> m</div>
        <div style="font:600 22px var(--cal-font-display);letter-spacing:.1em;margin-top:4px">TILLER</div>
        <div style="display:flex;justify-content:space-between;font:600 11.5px var(--cal-font-ui);letter-spacing:.07em;color:var(--cal-glass-text-2)"><span>SOIL CORE</span><span>TRANSECT 27</span></div>
        <div style="position:relative;height:6px;margin:6px 0;background:rgba(241,238,230,.12)"><i style="position:absolute;inset:0 30% 0 0;background:#F1EEE6"></i></div>
        <div style="display:flex;justify-content:space-between;font:600 12px var(--cal-font-ui);letter-spacing:.06em"><span>LAMP</span><span style="font:600 11px var(--cal-font-ui);padding:0 4px;color:var(--cal-weak-ink);background:var(--cal-weak-chip)">WEAK</span></div></div>
      <div style="display:flex;gap:6px">\${['V', 'T', 'E'].map((k, i) => \`<div class="cal-glass" style="position:relative;width:44px;height:44px;\${i === 1 ? 'background-color:var(--cal-select-fill);box-shadow:inset 0 0 0 1px var(--cal-select-line)' : ''}"><kbd style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:0 4px;font:500 11px var(--cal-font-mono);color:#26343F;background:#F1EEE6;border:1px solid #26343F;border-bottom-width:2px">\${k}</kbd></div>\`).join('')}</div>
      <div class="cal-glass menu" style="position:relative;padding:10px 12px;font:500 14px var(--cal-font-ui);letter-spacing:.12em">MAP <span style="margin-left:14px;padding-bottom:3px;border-bottom:2px solid var(--cal-select-line)">SATCHEL</span> <span style="margin-left:14px;color:var(--cal-glass-text-2)">SKILLS</span></div>
      <div style="display:flex;align-items:flex-end;gap:10px">
        <div class="cal-glass" style="position:relative;width:150px;padding:4px 8px 6px;font:600 12px var(--cal-font-ui);letter-spacing:.035em">TILLER<div style="position:relative;height:5px;margin-top:3px;background:rgba(241,238,230,.12)"><i style="position:absolute;inset:0 45% 0 0;background:#F1EEE6"></i><i style="position:absolute;inset:0 45% 0 55%;background:#D2452E;width:12%"></i></div></div>
        <b style="font:600 24px var(--cal-font-mono);text-shadow:0 1px 0 rgba(20,22,26,.95),0 0 3px rgba(20,22,26,.9)">18</b>
        <b style="font:600 24px var(--cal-font-mono);padding:2px 5px 1px;color:var(--cal-weak-ink);background:var(--cal-weak-chip);box-shadow:0 1px 0 rgba(20,22,26,.6)">34</b>
        <span class="cal-glass" style="position:relative;padding:0 8px;line-height:22px;font:600 17px var(--cal-font-mono)">126</span></div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="position:relative;display:inline-flex;gap:5px;align-items:baseline;padding:1px 6px 0;font:600 11px var(--cal-font-ui);letter-spacing:.08em;color:#F1EEE6;background:var(--cal-glass-hud);box-shadow:inset 0 0 0 1px var(--cal-glass-line),inset 3px 0 0 #56603F">LOOT <span style="font:400 11px var(--cal-font-mono);letter-spacing:0;color:var(--cal-glass-text-2)">· SALT CACHE</span></span>
        <i style="display:block;width:8px;height:8px;background:linear-gradient(#F1EEE6,#F1EEE6) center/6px 1.5px no-repeat,linear-gradient(#F1EEE6,#F1EEE6) center/1.5px 6px no-repeat,linear-gradient(rgba(20,22,26,.62),rgba(20,22,26,.62)) center/8px 3.5px no-repeat,linear-gradient(rgba(20,22,26,.62),rgba(20,22,26,.62)) center/3.5px 8px no-repeat"></i>
        <span style="display:inline-flex;align-items:center;gap:6px"><kbd style="padding:0 4px;font:500 13px var(--cal-font-mono);color:#26343F;background:#F1EEE6;border:1px solid #26343F;border-bottom-width:2px">E</kbd><span class="cal-glass" style="position:relative;padding:2px 8px 1px;font:600 13px var(--cal-font-ui);letter-spacing:.12em">GATHER</span></span></div>
      <div class="cal-glass" style="position:relative;width:240px;min-height:56px;padding:5px 10px 5px 8px;display:flex;align-items:center;gap:9px">
        <svg width="26" height="44" viewBox="0 0 26 44"><path d="M6 2 Q22 22 6 42" fill="none" stroke="#F1EEE6" stroke-width="2"/><path d="M6 2 V42" stroke="#F1EEE6" stroke-width="1"/></svg>
        <div style="flex:1"><div style="font:600 14px var(--cal-font-ui);letter-spacing:.07em">SABINA BOW</div><div style="font:500 11.5px var(--cal-font-ui);letter-spacing:.06em;color:var(--cal-glass-text-2)">REED ARROW</div></div>
        <b style="font:500 28px var(--cal-font-mono);letter-spacing:-.03em">040</b></div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;font:500 9px var(--cal-font-mono);letter-spacing:.02em;color:\${name.startsWith('WHITE') || name.startsWith('GOLD') ? '#1C1B1E' : '#F1EEE6'}">\${[['#1E1A28', 'GLASS'], ['#5A2E66', 'ORCHIL'], ['#D8CCE4', 'LILAC'], ['#D2452E', 'VERMIL.'], ['#2C4F8A', 'COBALT'], ['#F1EEE6', 'STAFF']].map(([h, n]) => \`<div style="display:flex;flex-direction:column;gap:3px"><i style="display:block;height:18px;background:\${h};box-shadow:inset 0 0 0 1px rgba(127,127,127,.4)"></i>\${n}</div>\`).join('')}</div>
    </div>\`;
    sheet.innerHTML = lights.map(([n, bg]) => col(n, bg)).join('');
    document.body.appendChild(sheet);
    await frames(6);
  })()`,
};

V_HUD_GLASS.setup = r37.setup;

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
  /* W1 fix round 2: the r1 judge's findings, U-02, U-17, U-01, U-06 (started) */
  A_TIP_CARD,
  A_DECLUTTER,
  A_WORDS_LOOK,
  A_GLASS_STATIC,
  A_HUD_GLASS,
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
  /* r1 judge: 4k-c showed no plate and no breath meter. At 4K the plates ride the top band (230-330 px) and the
     breath meter sits 120 px under the reticle (1080): 1000 px apart, more than one 900 px crop. Two crops, one staging. */
  hud4k('V-hud-4k-c', 'the plates over the Instrument and the reticle (top-centre)', -1120, -200, `
    /* r1 judge: the frame showed no plate and no breath meter. Steady held on the real Shift edge,
       and one more hit just before the shutter so the plate's 5 s hold is live */
    const __c = __CTX__;
    __c.input.keys.add('ShiftLeft');
    /* r5-all-machines: cast */ const __m = __c.hud._mhbPick[0] || [...__c.hud._engaged.keys()][0];
    if (__m) {
      /* at 20 m its plate rides the top band, above this crop: bring the frozen Instrument to 11 m on the line of sight */
      const __p = __c.player.position, __a = __c.player.camYaw + Math.PI;
      const __x = __p.x + Math.sin(__a) * 11, __z = __p.z + Math.cos(__a) * 11, __y = __c.terrain?.getHeight?.(__x, __z) ?? __m.position.y;
      __m.position.set(__x, __y, __z); __m.root?.position?.set?.(__x, __y, __z); __m.root?.updateMatrixWorld?.(true);
      const __pt = __m.position.clone(); __pt.y += (__m.height ?? 2.2) * 0.6;
      __c.events.emit('machine-damaged', { machine: __m, damage: 9, weak: false, point: __pt, tear: 0, tornPart: null, triggeredElement: null });
    }
    await new Promise((r) => setTimeout(r, 500));`),
  hud4k('V-hud-4k-e', 'the reticle, the draw scale and the breath meter while Steady is held (centre)', -1120, -630, `
    /* r1 judge: the frame showed no plate and no breath meter. Steady held on the real Shift edge,
       and one more hit just before the shutter so the plate's 5 s hold is live */
    const __c = __CTX__;
    __c.input.keys.add('ShiftLeft');
    /* r5-all-machines: cast */ const __m = __c.hud._mhbPick[0] || [...__c.hud._engaged.keys()][0];
    if (__m) {
      /* at 20 m its plate rides the top band, above this crop: bring the frozen Instrument to 11 m on the line of sight */
      const __p = __c.player.position, __a = __c.player.camYaw + Math.PI;
      const __x = __p.x + Math.sin(__a) * 11, __z = __p.z + Math.cos(__a) * 11, __y = __c.terrain?.getHeight?.(__x, __z) ?? __m.position.y;
      __m.position.set(__x, __y, __z); __m.root?.position?.set?.(__x, __y, __z); __m.root?.updateMatrixWorld?.(true);
      const __pt = __m.position.clone(); __pt.y += (__m.height ?? 2.2) * 0.6;
      __c.events.emit('machine-damaged', { machine: __m, damage: 9, weak: false, point: __pt, tear: 0, tornPart: null, triggeredElement: null });
    }
    await new Promise((r) => setTimeout(r, 500));`),
  hud4k('V-hud-4k-d', 'the kit tag and the tool chips (bottom-right)', -2240, -1260),
  hub4k('V-ui-4k-a', 'the book, map page, top-left: the fore-edge, the station index, the title, the sheet', 'map', 0, 0),
  hub4k('V-ui-4k-b', 'the book, settings page, bottom-right: the foot, the actions', 'settings', -2240, -1260),
  V_HUD_DECLUTTER,
  V_HUD_GLASS,
  R_GLASS_TOKENS,
  V_UI_SHEET,
];
