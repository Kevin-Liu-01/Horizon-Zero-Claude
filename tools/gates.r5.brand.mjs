/**
 * ROUND 5 — lane `brand` gates (docs/ROUND5-PLAN.md §9 "brand", W0-day1 block).
 *
 *   node tools/gates.mjs --port 5253 --extra tools/gates.r5.brand.mjs --lane brand
 *
 * tools/gates.mjs is frozen for this lane (plan §1.1; only gates-perf edits the
 * harness), and its directory scan still merges `gates.round4.*.mjs` only, so
 * until gates-perf's A-gates-autodiscover (W0a) imports every
 * `tools/gates.r5.*.mjs` by pattern, this file is merged through the runner's
 * existing `--extra <file>` flag — the same import + same-shape GATES merge the
 * lane files get. After A-gates-autodiscover lands, drop `--extra`:
 *   node tools/gates.mjs --port 5253 --lane brand
 * (keeping `--extra` then would only log a "duplicate gate id … keeping the
 * first" line per gate; nothing runs twice).
 *
 * W0-day1 is the MECHANICAL PASS (plan §7.1): identifier/string renames, the two
 * data stubs `src/world/island/{sites,extent}.js` at today's values, and every
 * camp/extent literal replaced by imports. Nothing may change behaviour, so the
 * gates below compare the build against numbers measured on the UNMODIFIED tree
 * (commit c32e968, port 5253, two runs, identical) — see `BASELINE`.
 *
 * The grep halves run in node when this module loads (they read the tree this
 * file sits in) and ride into the page assert as data, so one gate id carries
 * both halves and either half failing fails the gate. No gate here names a
 * coordinate: the rest point comes from the page's own `sites.js` module (the
 * same module instance the game imported) and extents from `extent.js`.
 */
import { readFileSync, readdirSync, lstatSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');
const read = (r) => readFileSync(path.join(ROOT, r), 'utf8');

function walk(r, exts, exclude, out = []) {
  const abs = path.join(ROOT, r);
  if (!existsSync(abs)) return out;
  if (exclude.some((x) => r === x || r.startsWith(x))) return out;
  const st = lstatSync(abs);
  if (st.isSymbolicLink()) return out;
  if (st.isDirectory()) {
    for (const e of readdirSync(abs)) walk(r ? `${r}/${e}` : e, exts, exclude, out);
  } else if (exts.includes(path.extname(r))) out.push(r);
  return out;
}

/* ------------------------------------------------------------------------ */
/* A-identifiers-renamed — §7.1 "from" column, grep over src/ tools/ index.html */
/* ------------------------------------------------------------------------ */

function identifiersGrep() {
  const map = JSON.parse(read('tools/lint/rename-map.json'));
  const files = [];
  for (const s of map.scope) walk(s, map.extensions, map.exclude, files);
  const texts = new Map(files.map((f) => [f, read(f)]));
  const scan = (row) => {
    const re = new RegExp(row.re, row.flags.includes('g') ? row.flags : row.flags + 'g');
    const hits = [];
    for (const [f, t] of texts) {
      if (row.files && !row.files.includes(f)) continue;
      const lines = t.split('\n');
      lines.forEach((ln, i) => {
        re.lastIndex = 0;
        const m = ln.match(re);
        if (m) hits.push(`${f}:${i + 1}: ${ln.trim().slice(0, 100)}`);
      });
    }
    return hits;
  };
  const rows = map.rows.map((row) => { const h = scan(row); return { class: row.class, from: row.from, to: row.to, hits: h.length, sample: h.slice(0, 4) }; });
  const removed = map.removed.rows.map((row) => ({ from: row.from, owner: row.owner, hits: scan(row).length }));
  const pkg = JSON.parse(read(map.package.file));
  const pkgOk = pkg.name === map.package.name && pkg.description === map.package.description;
  const total = rows.reduce((n, r) => n + r.hits, 0);
  return {
    pass: total === 0 && pkgOk,
    detail: {
      filesScanned: files.length, totalHits: total,
      failing: rows.filter((r) => r.hits),
      rows: rows.map((r) => `${r.from} -> ${r.to}: ${r.hits}`),
      package: { name: pkg.name, description: pkg.description, ok: pkgOk },
      removedEventsInformational: removed,
      excluded: map.exclude,
    },
  };
}

/* ------------------------------------------------------------------------ */
/* A-extent-refactor — grep half                                            */
/* ------------------------------------------------------------------------ */

/** The ten kept-code extents of grant §1.2, their old literal and their key. */
const EXTENTS = [
  { file: 'src/entities/player.js', name: 'WORLD_R', old: 330, key: null, use: /const WORLD_R = PLAY_RADIUS;/ },
  { file: 'src/entities/player.js', name: 'EDGE_SOFT', old: 312, key: 'edgeSoft' },
  { file: 'src/core/nav.js', name: 'R', old: 332, key: 'navSpan' },
  { file: 'src/core/nav.js', name: 'OUTER', old: 324, key: 'navOuter' },
  { file: 'src/entities/machines/machine.js', name: 'WORLD_LIMIT', old: 318, key: 'machineRim' },
  { file: 'src/items/gather.js', name: 'gather rim', old: 315, key: 'gatherRim' },
  { file: 'src/entities/machines/index.js', name: '_route clamp', old: 310, key: 'routeRim' },
  { file: 'src/entities/machines/ai/search.js', name: 'search cut', old: 310, key: 'searchRim' },
  { file: 'src/entities/machines/ai/doctrine.js', name: 'siteAnchor rim', old: 296, key: 'anchorRim' },
  { file: 'src/entities/machines/ai/squad.js', name: 'flee rim', old: 285, key: 'fleeRim' },
];
const OLD_LITERALS = [...new Set(EXTENTS.map((e) => e.old))];
const numTok = (n) => new RegExp(`(?<![\\w.])${n}(?![\\w.])`);

function extentGrep() {
  const rows = [];
  const keptFiles = [...new Set(EXTENTS.map((e) => e.file))];
  const leftovers = [];
  for (const f of keptFiles) {
    const t = read(f);
    t.split('\n').forEach((ln, i) => {
      for (const n of OLD_LITERALS) if (numTok(n).test(ln)) leftovers.push(`${f}:${i + 1}: ${ln.trim().slice(0, 90)}`);
    });
  }
  for (const e of EXTENTS) {
    const t = read(e.file);
    const imports = /import\s*\{[^}]*\bPLAY_RADIUS\b[^}]*\}\s*from\s*'[./]*\/?world\/island\/extent\.js'|import\s*\{[^}]*\bPLAY_RADIUS\b[^}]*\}\s*from\s*'(\.\.\/)+world\/island\/extent\.js'/.test(t);
    const uses = e.key ? new RegExp(`PLAY_RADIUS \\+ EXTENT\\.${e.key}\\b`).test(t) : e.use.test(t);
    rows.push({ file: e.file, name: e.name, old: e.old, key: e.key ?? 'PLAY_RADIUS', imports, uses });
  }
  const terrain = read('src/world/terrain.js');
  const terrainReexport = /import \{ PLAY_RADIUS \} from '\.\/island\/extent\.js';/.test(terrain)
    && /export \{ PLAY_RADIUS \};/.test(terrain) && !/PLAY_RADIUS\s*=\s*\d/.test(terrain);
  const pass = leftovers.length === 0 && rows.every((r) => r.imports && r.uses) && terrainReexport;
  return { pass, leftovers, rows: rows.filter((r) => !(r.imports && r.uses)), checked: rows.length, terrainReexport };
}

/* ------------------------------------------------------------------------ */
/* A-single-rest — grep half                                                */
/* ------------------------------------------------------------------------ */

/** Files whose camp literals the pass replaced; each must now import sites.js. */
const REST_FILES = [
  'src/entities/player.js', 'src/ui/map.js', 'src/ui/menu.js', 'src/world/props.js', 'src/world/terrain.js',
  'src/world/npc/waypoints.js', 'src/world/vegetation.js', 'src/items/gather.js', 'src/entities/machines/index.js',
  'src/entities/machines/machine.js', 'src/entities/machines/ai/doctrine.js', 'src/core/progression.js',
  'src/world/fauna.js', 'src/world/camp.js', 'src/world/props/settlement.js', 'src/world/props/activities.js',
  'src/world/props/places.js', 'src/world/props/npcs.js',
];
/**
 * Numbers that happen to sit next to each other and are NOT the camp. Matched by
 * exact trimmed line so a real camp literal can never hide behind an entry.
 */
const NOT_CAMP = new Map([
  ["src/ui/hud.js|P('M6 22 H34 V30 H6 Z')", 'SVG glyph path'],
  ['src/world/fauna.js|roam: 18, hp: 26,', 'fauna stat block'],
  ["src/entities/machines/ai/tables.js|watcher: { guards: ['strider'], radius: 22, band: [16, 30] },", 'guard radius + band'],
  ['src/entities/machines/sawtooth.js|// damage ladder (research 5): sawtooth hits 22-30', 'damage range comment'],
  ['src/world/npc/npc.js|/** 06:00–19:00 day · 19:00–22:30 evening · else night. */', 'clock times'],
]);
const n = (v) => `(?<![\\w.])${v}(?:\\.0+)?(?![\\w.])`;
const CAMP_RES = [
  new RegExp(`${n(22)}.{0,40}${n(30)}`), new RegExp(`${n(18)}.{0,40}${n(26)}`),
  new RegExp(`${n('(?:22|30)')}\\s*\\+\\s*\\(`),           // doctrine-style `22 + (dx …`
  /FIRE_[XZ]\s*=\s*\d/,
];

function restGrep() {
  const files = walk('src', ['.js', '.mjs', '.css', '.html'], ['src/world/island/']);
  const hits = []; const allowed = [];
  for (const f of files) {
    read(f).split('\n').forEach((ln, i) => {
      if (!CAMP_RES.some((re) => re.test(ln))) return;
      const why = NOT_CAMP.get(`${f}|${ln.trim()}`);
      if (why) allowed.push(`${f}:${i + 1} (${why})`);
      else hits.push(`${f}:${i + 1}: ${ln.trim().slice(0, 100)}`);
    });
  }
  const noImport = REST_FILES.filter((f) => !/import\s*\{[^}]*\bREST(?:_SITE)?\b[^}]*\}\s*from\s*'[./]+(?:world\/)?island\/sites\.js'/.test(read(f)));
  return { pass: hits.length === 0 && noImport.length === 0, filesScanned: files.length, hits, noImport, allowed };
}

/* ------------------------------------------------------------------------ */
/* the old-map baseline (UNMODIFIED tree, c32e968, two identical runs)       */
/* ------------------------------------------------------------------------ */

const BASELINE = {
  extents: { WORLD_R: 330, EDGE_SOFT: 312, R: 332, OUTER: 324, WORLD_LIMIT: 318, 'gather rim': 315,
    '_route clamp': 310, 'search cut': 310, 'siteAnchor rim': 296, 'flee rim': 285 },
  navN: 333, navCostHash: '92662038', navPathHash: '66a0055d', navNulls: 0,
  terrainHash: '88b3916f', colliders: { n: 4826, hash: 'e8c8ba84' },
  gather: { n: 203, hash: 'fa5d3dbc', maxR: 309.325 },
  route: { rimMaxR: 310, campMinD: 31 }, machine: { rimR: 318, campRingR: 25 },
  doctrine: { rimR: 296, campD: 46 }, playerRimMax: 330.05,
  spawn: { x: 18, z: 26 }, campRespawn: { x: 18, z: 26 },
};

/* Page-context probe library (no allocation concerns: runs once per gate). */
const LIB = `
  const ctx = __CTX__;
  const S = await import('/src/world/island/sites.js');
  const E = await import('/src/world/island/extent.js');
  const fnvStr = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
  const fnvBytes = (a) => { let h = 0x811c9dc5; for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
  const rnd = (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const f3 = (v) => (Math.round(v * 1000) / 1000).toFixed(3);
  const r3 = (v) => +(+v).toFixed(3);
  const FAR = E.PLAY_RADIUS + 70;
  const navProbe = () => {
    const nav = ctx.nav; if (!nav) return null;
    nav.rebuildNow({ full: true });
    const costHash = fnvBytes(nav.cost);
    const r = rnd(20261015); const parts = []; let nulls = 0;
    for (let q = 0; q < 20; q++) {
      const a0 = r() * Math.PI * 2, r0 = (E.PLAY_RADIUS - 30) * Math.sqrt(r());
      const a1 = r() * Math.PI * 2, r1 = (E.PLAY_RADIUS - 30) * Math.sqrt(r());
      const p = nav.path({ x: Math.sin(a0) * r0, z: Math.cos(a0) * r0 }, { x: Math.sin(a1) * r1, z: Math.cos(a1) * r1 }, [], { maxExpansions: 200000 });
      if (!p) { nulls++; parts.push('null'); continue; }
      parts.push(p.map((w) => f3(w.x) + ',' + f3(w.z)).join(';'));
    }
    return { N: nav.N, costHash, pathHash: fnvStr(parts.join('|')), nulls };
  };
  const terrainHash = () => {
    const T = ctx.terrain; const s = []; const R = E.PLAY_RADIUS + 10;
    for (let i = 0; i < 96; i++) for (let j = 0; j < 96; j++) s.push(f3(T.getHeight(-R + i * (2 * R / 95), -R + j * (2 * R / 95))));
    return fnvStr(s.join(','));
  };
  const colliderHash = () => {
    const rows = [];
    for (const c of (ctx.collision?.colliders || [])) {
      if (!c || c.dead || c.dynamic) continue;
      rows.push(c.kind + ':' + [c.minx, c.miny, c.minz, c.maxx, c.maxy, c.maxz].map((v) => (Math.round(v * 100) / 100).toFixed(2)).join(','));
    }
    rows.sort();
    return { n: rows.length, hash: fnvStr(rows.join('|')) };
  };
  const gatherProbe = () => {
    const g = ctx.interactables?.gather; if (!g) return null;
    const rows = g.nodes.map((n) => n.kind + ':' + f3(n.position.x) + ',' + f3(n.position.z)).sort();
    let maxR = 0; for (const n of g.nodes) maxR = Math.max(maxR, Math.hypot(n.position.x, n.position.z));
    return { n: rows.length, hash: fnvStr(rows.join('|')), maxR: r3(maxR) };
  };
  const routeProbe = () => {
    const M = ctx.machines; if (!M?._route) return null;
    let maxR = 0; for (const p of M._route(FAR, 0, 12, 24, 0.3)) maxR = Math.max(maxR, Math.hypot(p.x, p.z));
    let minD = 1e9; for (const p of M._route(S.REST_SITE.x, S.REST_SITE.z, 6, 24, 0.7)) minD = Math.min(minD, Math.hypot(p.x - S.REST_SITE.x, p.z - S.REST_SITE.z));
    return { rimMaxR: r3(maxR), campMinD: r3(minD) };
  };
  const machineProbe = () => {
    const m = (ctx.machines?.list || []).find((x) => x.alive && x._applyStep); if (!m) return null;
    const sx = m.position.x, sz = m.position.z;
    m.position.x = 0; m.position.z = 0; m._applyStep(FAR * 3, 0);
    const rim = Math.hypot(m.position.x, m.position.z);
    m.position.x = S.REST_SITE.x + 1; m.position.z = S.REST_SITE.z; m._applyStep(0.001, 0);
    const ring = Math.hypot(m.position.x - S.REST_SITE.x, m.position.z - S.REST_SITE.z) - (m.bodyRadius || 0);
    m.position.x = sx; m.position.z = sz;
    return { rimR: r3(rim), campRingR: r3(ring), kind: m.kind };
  };
  const doctrineProbe = async () => {
    const D = await import('/src/entities/machines/ai/doctrine.js'); if (!D.siteAnchor) return null;
    const a = D.siteAnchor(ctx, { x: FAR, z: 0 });
    const b = D.siteAnchor(ctx, { x: S.REST_SITE.x + 1, z: S.REST_SITE.z });
    return { rimR: r3(Math.hypot(a.x, a.z)), rimClamp: a.clamped, campD: r3(Math.hypot(b.x - S.REST_SITE.x, b.z - S.REST_SITE.z)), campClamp: b.clamped };
  };
  const playerRimProbe = async () => {
    const p = ctx.player; const s = p.position.clone();
    p.position.set(FAR, 0, 0); p.velocity?.set?.(0, 0, 0);
    await new Promise((r) => setTimeout(r, 400));
    const rr = Math.hypot(p.position.x, p.position.z);
    p.position.copy(s); p.velocity?.set?.(0, 0, 0); p._snapToGround?.();
    return r3(rr);
  };
`;

/* ------------------------------------------------------------------------ */
/* A-storage-keys — the old -> new key pairs come from tools/lint/rename-map.json */
/* (the lexicon), so this file holds no old key literal of its own.         */
/* ------------------------------------------------------------------------ */
const KEY_PAIRS = JSON.parse(read('tools/lint/rename-map.json')).rows
  .filter((r) => r.class === 'storage key').map((r) => [r.from, r.to]);

export const GATES = [
  {
    id: 'A-identifiers-renamed', kind: 'runner', lane: 'brand',
    title: 'W0-day1: 0 hits in src/ tools/ index.html for every §7.1 "from" (prefixes, storage keys, events, ctx members, the asset rig row); package renamed',
    check: () => identifiersGrep(),
  },
  {
    id: 'A-extent-refactor', kind: 'action', lane: 'brand', timeout: 120000,
    title: 'W0-day1: every kept-code extent is PLAY_RADIUS + an EXTENT offset, numerically identical; 0 old literals; nav path hash of 20 fixed queries and the old-map probes unchanged',
    settle: 2500,
    assert: `(async () => {
      const GREP = ${JSON.stringify(extentGrep())};
      const BASE = ${JSON.stringify(BASELINE)};
      const ROWS = ${JSON.stringify(EXTENTS.map(({ name, old, key }) => ({ name, old, key })))};
      ${LIB}
      const T = await import('/src/world/terrain.js');
      const values = ROWS.map((r) => ({ name: r.name, old: r.old, now: E.PLAY_RADIUS + (r.key ? E.EXTENT[r.key] : 0) }));
      const valuesOk = values.every((v) => v.now === v.old) && T.PLAY_RADIUS === E.PLAY_RADIUS;
      const nav = navProbe(), terrain = terrainHash(), colliders = colliderHash(), gather = gatherProbe();
      const route = routeProbe(), machine = machineProbe(), doctrine = await doctrineProbe(), playerRimR = await playerRimProbe();
      const checks = {
        values: valuesOk,
        navN: nav?.N === BASE.navN, navCost: nav?.costHash === BASE.navCostHash,
        navPaths: nav?.pathHash === BASE.navPathHash && nav?.nulls === BASE.navNulls,
        terrain: terrain === BASE.terrainHash,
        colliders: colliders.n === BASE.colliders.n && colliders.hash === BASE.colliders.hash,
        gather: !!gather && gather.n === BASE.gather.n && gather.hash === BASE.gather.hash && gather.maxR === BASE.gather.maxR,
        route: !!route && route.rimMaxR === BASE.route.rimMaxR && route.campMinD === BASE.route.campMinD,
        machine: !!machine && machine.rimR === BASE.machine.rimR && machine.campRingR === BASE.machine.campRingR,
        doctrine: !!doctrine && doctrine.rimR === BASE.doctrine.rimR && doctrine.campD === BASE.doctrine.campD,
        playerRim: playerRimR <= BASE.playerRimMax && playerRimR > E.PLAY_RADIUS + E.EXTENT.edgeSoft,
        grep: GREP.pass,
      };
      const pass = Object.values(checks).every(Boolean);
      return { pass, detail: {
        failed: Object.keys(checks).filter((k) => !checks[k]),
        values, PLAY_RADIUS: E.PLAY_RADIUS, terrainReexportsSame: T.PLAY_RADIUS === E.PLAY_RADIUS,
        nav, terrain, colliders, gather, route, machine, doctrine, playerRimR,
        grep: { leftovers: GREP.leftovers, missingImportOrUse: GREP.rows, checked: GREP.checked, terrainReexport: GREP.terrainReexport },
        note: 'A3 / A13 unchanged is graded by those gates: node tools/gates.mjs --port 5253 --only A3-sprint-speed,A13-no-skate',
      } };
    })()`,
  },
  {
    id: 'A-single-rest', kind: 'action', lane: 'brand', timeout: 90000,
    title: 'W0-day1: 0 numeric camp literals in src/; spawn and death-respawn ("RESPAWN AT CAMP") land within 3 m of REST; the Instrument no-spawn ring is centred on REST_SITE',
    setup: '__CTX__.input.enabled = true;',
    settle: 1500,
    assert: `(async () => {
      const GREP = ${JSON.stringify(restGrep())};
      ${LIB}
      const p = ctx.player; const REST = S.REST, SITE = S.REST_SITE;
      const dRest = () => Math.hypot(p.position.x - REST.x, p.position.z - REST.z);
      const spawn = { x: r3(p.position.x), z: r3(p.position.z), d: r3(dRest()) };
      // the Instrument no-spawn ring + the route keep-out + the doctrine keep-out, all centred on REST_SITE
      const machine = machineProbe(), route = routeProbe(), doctrine = await doctrineProbe();
      const fire = ctx.camp?.firePosition;
      const fireD = fire ? r3(Math.hypot(fire.x - SITE.x, fire.z - SITE.z)) : null;
      let minMachineD = 1e9;
      for (const m of (ctx.machines?.list || [])) if (m.alive) minMachineD = Math.min(minMachineD, Math.hypot(m.position.x - SITE.x, m.position.z - SITE.z));
      // death -> death card -> RESPAWN AT CAMP (the shipped UI path)
      p.position.set(SITE.x - 80, 0, SITE.z - 75); p.velocity?.set?.(0, 0, 0); p._snapToGround?.();
      await new Promise((r) => setTimeout(r, 300));
      const before = r3(dRest());
      p.takeDamage(p.maxHealth + 100, 'gate');
      let btn = null; const t0 = performance.now();
      while (!btn && performance.now() - t0 < 15000) {
        await new Promise((r) => setTimeout(r, 200));
        btn = [...document.querySelectorAll('.mn-death-opt')].find((b) => (b.querySelector('b')?.textContent || '').trim() === 'RESPAWN AT CAMP');
      }
      let respawn = null;
      if (btn) {
        btn.click();
        await new Promise((r) => setTimeout(r, 800));
        respawn = { x: r3(p.position.x), z: r3(p.position.z), d: r3(dRest()), state: ctx.state, health: p.health };
      }
      const checks = {
        grep: GREP.pass,
        spawn: spawn.d <= 3,
        respawn: !!respawn && respawn.d <= 3 && respawn.state === 'playing' && respawn.health > 0 && before > 3,
        ringCentred: !!machine && Math.abs(machine.campRingR - SITE.r) < 0.01,
        routeKeepOut: !!route && Math.abs(route.campMinD - (SITE.r + 6)) < 0.01,
        doctrineKeepOut: !!doctrine && doctrine.campClamp === 'camp' && Math.abs(doctrine.campD - 46) < 0.01,
        campfireAtSite: fireD !== null && fireD < 0.01,
      };
      return { pass: Object.values(checks).every(Boolean), detail: {
        failed: Object.keys(checks).filter((k) => !checks[k]),
        REST, REST_SITE: SITE, spawn, deathAt: before, respawn, ring: machine, route, doctrine, campfireToSite: fireD,
        minAliveMachineToSite: r3(minMachineD),
        grep: { hits: GREP.hits, missingImport: GREP.noImport, filesScanned: GREP.filesScanned, allowedNotCamp: GREP.allowed },
      } };
    })()`,
  },
  {
    id: 'A-storage-keys', kind: 'action', lane: 'brand', timeout: 60000,
    title: 'save, change settings, open the map, dismiss a tip -> every localStorage key the game writes matches /^cal\\..*\\.v5$/; then plants the pre-Round-5 keys for A-storage-keys-reload',
    setup: '__CTX__.input.enabled = true;',
    settle: 3500,
    assert: `(async () => {
      const ctx = __CTX__, prog = ctx.progression, menus = ctx.menus;
      const PAIRS = ${JSON.stringify(KEY_PAIRS)};
      const before = new Set(Object.keys(localStorage));
      const acts = {};
      acts.save = prog?.save?.('gate')?.ok ?? null;
      acts.checkpoint = prog?.checkpoint?.('gate')?.ok ?? null;
      try { menus.settings.set('sensitivity', 1.35); acts.settings = true; } catch (e) { acts.settings = String(e); }
      try { ctx.audio?.setVolume?.('music', 0.41); acts.audio = true; } catch (e) { acts.audio = String(e); }
      try { menus.openHub('map'); await new Promise((r) => setTimeout(r, 600)); menus.map?.fog?.save?.(); menus.closeHub?.(true); acts.map = true; } catch (e) { acts.map = String(e); }
      acts.tip = ctx.hud?.showTip?.('aim') ?? null;
      await new Promise((r) => setTimeout(r, 1200));
      const keys = Object.keys(localStorage).sort();
      const bad = keys.filter((k) => !/^cal\\..*\\.v5$/.test(k));
      const missing = PAIRS.map(([, to]) => to).filter((k) => !keys.includes(k));
      /* Plant the pre-Round-5 keys holding CURRENT-FORMAT values (a valid v5 save,
         a settings map with sensitivity 2.75, audio with music 0.123, a fully
         revealed fog, three seen tips): if anything still read an old key, the
         next boot would visibly pick it up. Then clear ours, so that boot sees
         ONLY old keys. */
      const fogN = menus?.map?.fog?.cells?.length || 0;
      const plant = {};
      for (const [from, to] of PAIRS) {
        const cur = localStorage.getItem(to);
        let v = cur;
        if (/settings/.test(to)) { const o = JSON.parse(cur || '{}'); o.sensitivity = 2.75; v = JSON.stringify(o); }
        else if (/audio/.test(to)) { const o = JSON.parse(cur || '{}'); o.music = 0.123; v = JSON.stringify(o); }
        else if (/map/.test(to)) v = btoa(String.fromCharCode(1).repeat(fogN));
        else if (/tips/.test(to)) v = JSON.stringify(['aim', 'conc', 'craft']);
        if (v == null) continue;
        localStorage.setItem(from, v); plant[from] = v.length;
      }
      for (const [, to] of PAIRS) localStorage.removeItem(to);
      return { pass: bad.length === 0 && missing.length === 0 && Object.keys(plant).length === PAIRS.length,
        detail: { acts, keysWritten: keys.filter((k) => !before.has(k)), keys, bad, missing, planted: plant, fogCells: fogN } };
    })()`,
  },
  {
    id: 'A-storage-keys-reload', kind: 'action', lane: 'brand', timeout: 60000,
    title: 'boot with ONLY the planted pre-Round-5 keys (valid current-format values) -> fresh start: no save, default settings/audio/fog/tips; the old keys are never read or rewritten; 0 console errors',
    settle: 3500,
    assert: `(async () => {
      const ctx = __CTX__, prog = ctx.progression, menus = ctx.menus;
      const PAIRS = ${JSON.stringify(KEY_PAIRS)};
      const OLD = PAIRS.map(([from]) => from);
      const present = OLD.filter((k) => localStorage.getItem(k) != null);
      if (present.length !== OLD.length) return { pass: null, detail: { verdict: 'PENDING: the planted keys are not in this profile (run A-storage-keys first in the same browser; a relaunch between the two gates drops them)', present } };
      const snapBefore = Object.fromEntries(OLD.map((k) => [k, localStorage.getItem(k)]));
      const fog = menus?.map?.fog;
      const seenTips = window.__HUD_DEBUG__?.tips?.().seen || [];
      const checks = {
        noSave: prog?.hasSave?.() === false,
        // the game writes its own 'start' checkpoint 1.5 s into a run that has none
        // under the NEW key — that is the fresh start; adopting the old one is not
        checkpointFresh: (() => {
          const [oldCp, newCp] = PAIRS.find(([f]) => /checkpoint/.test(f));
          const cur = localStorage.getItem(newCp);
          if (cur == null) return true;
          let reason = null; try { reason = JSON.parse(cur).reason; } catch { /* not JSON */ }
          return cur !== snapBefore[oldCp] && reason === 'start';
        })(),
        metaFresh: !prog?.saves?.meta?.()?.hasSave,
        settingsDefault: menus?.settings?.get?.('sensitivity') === 1,
        audioDefault: (ctx.audio?.settings?.music ?? null) !== 0.123,
        fogFresh: !!fog && fog.seen < fog.cells.length,
        tipsFresh: !seenTips.includes('craft') && !seenTips.includes('conc'),
      };
      await new Promise((r) => setTimeout(r, 1500));
      const rewritten = OLD.filter((k) => localStorage.getItem(k) !== snapBefore[k]);
      const strayKeys = Object.keys(localStorage).filter((k) => !/^cal\\..*\\.v5$/.test(k) && !OLD.includes(k));
      checks.oldUntouched = rewritten.length === 0;
      checks.noStrayKeys = strayKeys.length === 0;
      for (const k of OLD) localStorage.removeItem(k);       // leave the profile tidy
      return { pass: Object.values(checks).every(Boolean), detail: {
        failed: Object.keys(checks).filter((k) => !checks[k]), checks, rewritten, strayKeys,
        sensitivity: menus?.settings?.get?.('sensitivity'), music: ctx.audio?.settings?.music,
        fogSeen: fog?.seen, fogCells: fog?.cells?.length, seenTips } };
    })()`,
  },
];
