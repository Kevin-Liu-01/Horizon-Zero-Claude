/**
 * ROUND 5 — lane `brand` gates (docs/ROUND5-PLAN.md §9 "brand": W0-day1 + W0b blocks).
 *
 *   node tools/gates.mjs --port 5253 --extra tools/gates.r5.brand.mjs --lane brand
 *
 * HOW THIS FILE IS MERGED. On main today `tools/gates.mjs` scans
 * `gates.round4.*.mjs` only, and its `--extra <file>` flag imports ONE more module
 * and merges its `GATES` exactly like a scanned lane file (same loader, same
 * load-failure reporting, same duplicate-id rule, and `--lane` sees its rows) —
 * so the command above runs every brand row. gates-perf's r5 registry
 * (`gates.config.mjs` + `LANE_FILE_RE = /^gates\.r5\.([a-z0-9][a-z0-9-]*)\.mjs$/`,
 * A-gates-autodiscover) picks this file up by its name once it merges; then
 *   node tools/gates.mjs --port 5253 --lane brand
 * runs the same rows (an `--extra` left on only prints one "duplicate gate id …
 * keeping the first" line per row). `V38-title` here SHADOWS the carried row of
 * the same id (plan §3.3) while brand is active.
 *
 * STAGING RULE (plan §9, A-gate-preludes): no gate here names a species, a
 * coordinate or a bone. The rest point comes from `src/world/island/sites.js`
 * (imported in node and in the page), extents from `extent.js`, the forbidden
 * vocabularies from `tools/lint/` (rename-map.json, lexicon.json), and the
 * allowed non-camp coincidences of A-single-rest are pinned by a hash of the
 * line, not by its text.
 */
import { readFileSync, readdirSync, lstatSync, existsSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { REST, REST_SITE } from '../src/world/island/sites.js';
import { loadLexicon, matchTexts, playerStatic, scanCode, gradeCode } from './lint/namecheck.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');
const read = (r) => readFileSync(path.join(ROOT, r), 'utf8');
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };

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

/** Files whose camp literals the day-1 pass replaced; each must still import sites.js. */
const REST_FILES = [
  'src/entities/player.js', 'src/ui/map.js', 'src/ui/menu.js', 'src/world/props.js', 'src/world/terrain.js',
  'src/world/npc/waypoints.js', 'src/world/vegetation.js', 'src/items/gather.js', 'src/entities/machines/index.js',
  'src/entities/machines/machine.js', 'src/entities/machines/ai/doctrine.js', 'src/core/progression.js',
  'src/world/fauna.js', 'src/world/camp.js', 'src/world/props/settlement.js', 'src/world/props/activities.js',
  'src/world/props/places.js', 'src/world/props/npcs.js',
].filter((f) => existsSync(path.join(ROOT, f)));   // a file its owner deletes (§6) no longer needs the import
/**
 * Lines whose numbers happen to match the rest point and are NOT it, pinned by
 * file + FNV-1a of the trimmed line (so a real copy can never hide behind an
 * entry, and this file never spells the line out).
 */
const NOT_CAMP = new Map([
  ['src/world/fauna.js|d4fa3db7', 'fauna stat block (roam / hp)'],
  ['src/world/npc/npc.js|710951a9', 'clock times in a comment'],
]);
/** The rest point's own numbers, read from sites.js — never written here. */
const num = (v) => `(?<![\\w.])${v}(?:\\.0+)?(?![\\w.])`;
const CAMP_RES = [
  new RegExp(`${num(REST_SITE.x)}.{0,40}${num(REST_SITE.z)}`),
  new RegExp(`${num(REST.x)}.{0,40}${num(REST.z)}`),
  new RegExp(`${num(`(?:${REST_SITE.x}|${REST_SITE.z})`)}\\s*\\+\\s*\\(`),      // doctrine-style `x + (dx …`
  /FIRE_[XZ]\s*=\s*\d/,
];

function restGrep() {
  const files = walk('src', ['.js', '.mjs', '.css', '.html'], ['src/world/island/']);
  const hits = []; const allowed = [];
  for (const f of files) {
    read(f).split('\n').forEach((ln, i) => {
      if (!CAMP_RES.some((re) => re.test(ln))) return;
      const why = NOT_CAMP.get(`${f}|${fnv(ln.trim())}`);
      if (why) allowed.push(`${f}:${i + 1} (${why})`);
      else hits.push(`${f}:${i + 1}: ${ln.trim().slice(0, 100)}`);
    });
  }
  const noImport = REST_FILES.filter((f) => !/import\s*\{[^}]*\bREST(?:_SITE)?\b[^}]*\}\s*from\s*'[./]+(?:world\/)?island\/sites\.js'/.test(read(f)));
  return { pass: hits.length === 0 && noImport.length === 0, filesScanned: files.length, hits, noImport, allowed };
}

/* ------------------------------------------------------------------------ */
/* the day-1 old-map baseline (UNMODIFIED tree, c32e968, two identical runs) */
/* ------------------------------------------------------------------------ */

/**
 * A-extent-refactor proved the day-1 pass changed no number. Its HASH half is the
 * day-1 old map: W0a deleted content (the IP machine GLBs, the camp NPC bodies),
 * so from W0a on the collider / nav / gather hashes may legitimately differ. At
 * W0b the hashes are REPORTED against this baseline and the extents are graded
 * by value, by grep and by the structural probes (route, machine, doctrine and
 * player clamps), which content deletions cannot move. A-reach-all-sites takes
 * over at W1.
 */
const BASELINE = {
  extents: { WORLD_R: 330, EDGE_SOFT: 312, R: 332, OUTER: 324, WORLD_LIMIT: 318, 'gather rim': 315,
    '_route clamp': 310, 'search cut': 310, 'siteAnchor rim': 296, 'flee rim': 285 },
  navN: 333, navCostHash: '92662038', navPathHash: '66a0055d', navNulls: 0,
  terrainHash: '88b3916f', colliders: { n: 4826, hash: 'e8c8ba84' },
  gather: { n: 203, hash: 'fa5d3dbc', maxR: 309.325 },
  route: { rimMaxR: 310, campMinD: 31 }, machine: { rimR: 318, campRingR: 25 },
  doctrine: { rimR: 296, campD: 46 }, playerRimMax: 330.05,
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


/* ======================================================================== */
/* W0b                                                                      */
/* ======================================================================== */

const PLAN = read('docs/ROUND5-PLAN.md');
/** the A-ui-words regex, read from the plan bullet (so this file never spells the words) */
const UI_WORDS_RE = (() => {
  const line = PLAN.split('\n').find((l) => l.includes('**A-ui-words**'));
  const m = line && /`\/(.+?)\/i`/.exec(line);
  return m ? m[1] : null;
})();
/** the retired families, read from the A-fonts-licensed bullet ("0 references to A, B, … in CSS/JS") */
const OLD_FAMILIES = (() => {
  const line = PLAN.split('\n').find((l) => l.includes('**A-fonts-licensed**'));
  const m = line && /0 references to (.+?) in CSS\/JS/.exec(line);
  return m ? m[1].split(/,\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean) : [];
})();
const OLD_FAMILY_RE = OLD_FAMILIES.length
  ? new RegExp(OLD_FAMILIES.map((f) => f.split(/\s+/).join('\\s*')).join('|'), 'i') : /$^/;

/** The three CALIMA families (bible §9.7) and their files' stems. */
const FAMILIES = [
  { family: 'Bodoni Moda', stem: 'BodoniModa', role: 'display, wordmark, place names' },
  { family: 'IBM Plex Sans Condensed', stem: 'IBMPlexSansCondensed', role: 'HUD, menus' },
  { family: 'IBM Plex Mono', stem: 'IBMPlexMono', role: 'numerals, bearings' },
];

/**
 * Which lane owns a file (plan §2 at W0b), for naming whoever must clear a
 * reference brand may not edit (rule 1). brand's own W0 files are listed first.
 */
const OWNERS = [
  [/^(index\.html|src\/style\.css|src\/main\.js|src\/ui\/menu\.js|public\/fonts\/|public\/favicon\.svg|README\.md|tools\/lint\/)/, 'brand'],
  [/^src\/ui\/(quests|skills)\.js$/, 'progression (W3)'],
  [/^src\/ui\/wheel\.|^src\/combat\//, 'combat-kit (W2)'],
  [/^src\/ui\/dialogue\.js$/, 'frozen UI engine (plan §1.1; orchestrator grant)'],
  [/^src\/ui\//, 'shell-ui (W2)'],
  [/^src\/studio\//, 'brand (W4: src/studio/**)'],
  [/^tools\/r5-direction\//, 'orchestrator (direction mock, no lane)'],
  [/^tools\//, 'gates-perf / tools owner'],
  [/^src\//, 'see plan §2'],
];
const ownerOf = (f) => (OWNERS.find(([re]) => re.test(f)) || [null, 'unknown'])[1];

/** A-fonts-licensed, node half: the folder, the manifest rows, the old-family references. */
function fontsNode() {
  const dir = path.join(ROOT, 'public/fonts');
  const files = readdirSync(dir).filter((f) => f !== '.DS_Store').sort();
  const manifest = JSON.parse(read('public/LICENSES.json'));
  const fams = FAMILIES.map(({ family, stem }) => {
    const woff2 = files.filter((f) => new RegExp(`^${stem}-[A-Za-z-]+\\.woff2$`).test(f));
    const ofl = files.filter((f) => f === `${stem}-OFL.txt`);
    const magic = woff2.map((f) => readFileSync(path.join(dir, f)).subarray(0, 4).toString('latin1'));
    const row = manifest.rows.find((r) => r.licence === 'OFL-1.1' && woff2.length
      && woff2.every((f) => (r.paths || []).includes(`public/fonts/${f}`)));
    return {
      family, woff2, oflTexts: ofl.length, woff2Magic: magic.every((m) => m === 'wOF2'),
      row: row ? { id: row.id, licence: row.licence, licence_text: row.licence_text, sha256: row.archive_sha256, retrieved: row.retrieved, source_url: row.source_url } : null,
      rowOk: !!row && row.licence_text === `public/fonts/${stem}-OFL.txt` && !!row.archive_sha256 && !!row.retrieved,
      bytes: woff2.reduce((n, f) => n + statSync(path.join(dir, f)).size, 0),
    };
  });
  const stray = files.filter((f) => !FAMILIES.some(({ stem }) => new RegExp(`^${stem}-[A-Za-z-]+\\.woff2$`).test(f) || f === `${stem}-OFL.txt`));
  // references to the retired families in CSS / JS / HTML (tools/lint is the lexicon: excluded)
  const scanned = [...walk('src', ['.css', '.js', '.mjs', '.html'], []), 'index.html',
    ...walk('tools', ['.css', '.js', '.mjs', '.html'], ['tools/lint/'])];
  const refs = [];
  for (const f of scanned) {
    read(f).split('\n').forEach((ln, i) => { if (OLD_FAMILY_RE.test(ln)) refs.push({ file: f, line: i + 1, owner: ownerOf(f), text: ln.trim().slice(0, 90) }); });
  }
  const byOwner = {};
  for (const r of refs) (byOwner[r.owner] = byOwner[r.owner] || new Set()).add(r.file);
  return {
    families: fams, stray, oldFamilies: OLD_FAMILIES,
    refsTotal: refs.length, refsBrand: refs.filter((r) => r.owner === 'brand'),
    refsForeign: refs.filter((r) => r.owner !== 'brand').length,
    foreignFilesByOwner: Object.fromEntries(Object.entries(byOwner).filter(([o]) => o !== 'brand').map(([o, s]) => [o, [...s]])),
    sample: refs.slice(0, 12).map((r) => `${r.file}:${r.line} [${r.owner}] ${r.text}`),
    shippedBytes: fams.reduce((n, f) => n + f.bytes, 0),
  };
}

const PRESS = `window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));`;
/** wait (in the page) until the title menu is in, so a shot is the menu and not the press beat */
const UNTIL_MENU = `await (async () => { const t0 = performance.now(); while (__CTX__.menus?.titleStage !== 'menu' && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 100)); })();`;
/** freeze the real loading screen (the boot's own DOM and setLoad) at a progress value */
const LOADING_AT = (p) => `(() => {
  document.body.classList.remove('cal-title-live');
  document.getElementById('title').classList.add('hidden');
  const L = document.getElementById('loading'); L.classList.remove('hidden');
  __GAME__.setLoad(${p}, 'gate');
})()`;

const W0B = [
  /* ------------------------------------------------------------ the lints */
  {
    id: 'A-no-horizon-terms-code', kind: 'runner', lane: 'brand', timeout: 120000,
    title: 'namecheck --code: every Horizon-lexicon hit in identifiers + strings of src/**, index.html, tools/** (minus tools/lint, comments stripped) is covered by tools/lint/engine-allow.json; no entry over its cap; total <= the W0b ratchet',
    check: () => {
      const scan = scanCode();
      const allow = JSON.parse(read('tools/lint/engine-allow.json'));
      const g = gradeCode(scan, allow);
      const byKind = {};
      for (const e of g.entries) byKind[e.kind] = (byKind[e.kind] || 0) + e.count;
      return { pass: g.pass, detail: {
        filesScanned: scan.files, distinctPairs: scan.hits.length, occurrences: scan.occurrences,
        total: g.total, ratchetTotal: g.ratchetTotal, byKind, uncovered: g.uncovered.slice(0, 20), uncoveredN: g.uncovered.length,
        overCap: g.over, entries: g.entries.length,
        lexicon: loadLexicon().union,
      } };
    },
  },
  {
    id: 'A-no-horizon-terms-player', kind: 'action', lane: 'brand', plain: true, timeout: 300000, settle: 1500,
    title: 'namecheck --player: the union lexicon over rendered DOM text (title, loading, every title modal, HUD, every hub tab, menus cards, every tip), content ids (kinds, roles, events, audio sets, items, quests), every key and display string of the exported content tables, and public/**/*.{json,md,txt} -> distinct (surface, term) hits <= the W0b ratchet',
    get assert() {
      const lex = loadLexicon();
      const st = playerStatic('named');
      const stLit = playerStatic('literal');
      const ratchet = JSON.parse(read('tools/lint/ratchet.json')).player || {};
      return `(async () => {
      const LEX = ${JSON.stringify(lex)};
      const matchTexts = ${matchTexts.toString()};
      const STATIC = ${JSON.stringify(st.hits)};
      const STATIC_LIT = ${stLit.hits.length};
      const RATCHET = ${JSON.stringify(ratchet)};
      const ctx = __CTX__, m = ctx.menus;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const texts = [];
      const add = (where, t) => { if (t != null && String(t).trim()) texts.push({ where, text: String(t) }); };
      const strip = (h) => String(h).replace(/<[^>]+>/g, ' ');
      const surfaces = [];
      // --- the title (press beat, then the menu), the loading screen, the title modals
      add('dom:document-title', document.title);
      add('dom:loading', document.getElementById('loading')?.textContent);
      add('dom:title-press', document.getElementById('title')?.innerText);
      ${PRESS}
      ${UNTIL_MENU}
      add('dom:title-menu', document.getElementById('title')?.innerText);
      for (const k of ['credits', 'manual', 'difficulty', 'settings']) {
        m.openModal(k); await wait(350); add('dom:modal:' + k, m.modalEl?.innerText); m.closeModal();
      }
      // --- every card the menus lane prebuilds (death, victory, hub chrome)
      add('dom:menus-cards', document.getElementById('cal-menus')?.textContent);
      // --- into the game: the HUD, then every hub tab
      // the shipped start path minus the pointer lock a headless page cannot take
      m.closeModal(); m._titleLeave?.(); m.titleStage = 'idle';
      document.body.classList.remove('cal-title-live');
      __GAME__.start(false);
      await wait(3000);
      add('dom:hud', document.getElementById('hud')?.innerText);
      for (const t of m.audit().tabs) { m.openHub(t); await wait(700); add('dom:hub:' + t, document.body.innerText); }
      m.closeHub(true);
      await wait(300);
      // --- every tip (all tags), the tab tags
      try { const T = await import('/src/ui/tips.js'); for (const t of T.TIPS) add('tips', strip(t.text)); } catch (e) { surfaces.push('tips: ' + e.message); }
      // --- content ids
      add('ids:kinds', (ctx.machines?.kinds || []).join(' '));
      add('ids:roles', JSON.stringify(ctx.machines?.roles || {}));
      add('ids:events', [...(ctx.events?.map?.keys?.() || [])].join(' '));
      try { add('ids:audio-sets', JSON.stringify(Object.keys(ctx.audio?.bank?.sets || {}))); } catch { /* none */ }
      // --- the exported content tables: keys (depth <= 3) and display strings (depth <= 5)
      const MODULES = ${JSON.stringify(CONTENT_MODULES)};
      const SHOW = /^(id|ids|name|label|title|text|desc|description|line|lines|hint|sub|prompt|kicker|head|say|reply|options|label2|short|long|blurb|lore|quest|objective|objectives|tag|tags|kind|role|faction|set|sets|item|items)$/;
      const walkT = (where, v, depth, out, key) => {
        if (v == null || depth > 5 || out.length > 4000) return;
        if (typeof v === 'string') { if (depth === 0 || key === '*' || SHOW.test(key || '')) out.push(v); return; }
        if (typeof v !== 'object' || ArrayBuffer.isView(v)) return;
        if (Array.isArray(v)) { for (const x of v) walkT(where, x, depth + 1, out, typeof x === 'string' ? '*' : key); return; }
        for (const [k, x] of Object.entries(v)) { if (depth <= 3) out.push(k); walkT(where, x, depth + 1, out, k); }
      };
      let tables = 0;
      for (const mod of MODULES) {
        let M = null;
        try { M = await import(mod); } catch (e) { surfaces.push(mod + ': ' + e.message); continue; }
        for (const n of Object.keys(M)) {
          const v = M[n];
          if (!v || typeof v !== 'object' || ArrayBuffer.isView(v) || (Object.getPrototypeOf(v) !== Object.prototype && !Array.isArray(v))) continue;
          tables++;
          const out = []; walkT(mod + '#' + n, v, 0, out, n);
          add('table:' + mod.replace('/src/', '') + '#' + n, out.join(' \\u00b7 '));
        }
      }
      const dom = matchTexts(LEX, texts, 'named');
      const lit = matchTexts(LEX, texts, 'literal');
      const count = STATIC.length + dom.length;
      const bySurface = {};
      for (const h of [...STATIC, ...dom]) { const s = h.where.split(':').slice(0, 2).join(':'); bySurface[s] = (bySurface[s] || 0) + 1; }
      const byTerm = {};
      for (const h of [...STATIC, ...dom]) byTerm[h.term] = (byTerm[h.term] || 0) + 1;
      const top = Object.entries(byTerm).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([t, n]) => t + ':' + n).join(' ');
      const pass = RATCHET.count == null ? null : count <= RATCHET.count;
      return { pass, detail: {
        verdict: RATCHET.count == null ? 'PENDING: no ratchet recorded yet; this run measured ' + count : (pass ? 'PASS ' : 'FAIL ') + count + ' <= ' + RATCHET.count + ' (W0b ratchet)',
        count, ratchet: RATCHET.count, literal: STATIC_LIT + lit.length, staticHits: STATIC.length, domHits: dom.length,
        surfacesHarvested: texts.length, contentTables: tables, chars: texts.reduce((n, t) => n + t.text.length, 0), problems: surfaces,
        bySurface, topTerms: top,
        brandSurfaceHits: dom.filter((h) => /^dom:(document-title|loading|title|modal:(credits|manual|difficulty))/.test(h.where)).map((h) => h.where + ' "' + h.word + '" -> ' + h.term),
        sample: dom.slice(0, 40).map((h) => h.where + ' "' + h.word + '" -> ' + h.term + ' (' + h.rule + ')'),
      } };
    })()`;
    },
  },
  /* ---------------------------------------------------------------- fonts */
  {
    id: 'A-fonts-licensed', kind: 'action', lane: 'brand', plain: true, settle: 1200, timeout: 90000,
    title: 'public/fonts holds only Bodoni Moda, IBM Plex Sans Condensed, IBM Plex Mono (woff2) + one OFL.txt each, each with an OFL-1.1 LICENSES.json row; the wordmark, a HUD label and a numeral resolve to those families; 0 references to the retired families in CSS/JS',
    get assert() {
      const F = fontsNode();
      return `(async () => {
      const F = ${JSON.stringify(F)};
      const OLD = ${JSON.stringify(OLD_FAMILIES)};
      await document.fonts.ready;
      const GENERIC = /^(serif|sans-serif|monospace|system-ui|cursive|fantasy|ui-monospace|ui-sans-serif|ui-serif|math|emoji)$/i;
      /** emulate the browser's fallback walk: the first family in the computed stack that has a LOADED face */
      const resolve = async (el) => {
        if (!el) return { family: null, why: 'element missing' };
        const cs = getComputedStyle(el);
        const stack = cs.fontFamily.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
        const sample = (el.textContent || 'A').trim().slice(0, 40) || 'A';
        for (const f of stack) {
          if (GENERIC.test(f)) return { family: f, generic: true, stack: cs.fontFamily };
          const faces = [...document.fonts].filter((ff) => ff.family.replace(/["']/g, '') === f);
          if (!faces.length) continue;
          try { await document.fonts.load(cs.fontStyle + ' ' + cs.fontWeight + ' 16px "' + f + '"', sample); } catch { /* error status below */ }
          if (faces.some((ff) => ff.status === 'loaded')) return { family: f, weight: cs.fontWeight, style: cs.fontStyle, stack: cs.fontFamily };
        }
        return { family: null, stack: cs.fontFamily };
      };
      const word = document.querySelector('#title .cal-word');
      // a HUD label: the first #hud element with its own words (3+ letters) in its direct text
      const hudLabel = [...document.querySelectorAll('#hud *')].find((el) => [...el.childNodes].some((n) => n.nodeType === 3 && /[A-Za-z]{3,}/.test(n.textContent)));
      const numeral = document.querySelector('#title .cal-stn');
      const r = { wordmark: await resolve(word), hudLabel: { ...(await resolve(hudLabel)), el: hudLabel ? (hudLabel.className || hudLabel.tagName) : null, text: hudLabel?.textContent?.trim().slice(0, 30) },
        numeral: { ...(await resolve(numeral)), text: numeral?.textContent } };
      const oldFaces = [...document.fonts].filter((ff) => OLD.some((o) => ff.family.replace(/["']/g, '').toLowerCase() === o.toLowerCase()))
        .map((ff) => ff.family + ':' + ff.status);
      const checks = {
        onlyTheThreeFamilies: F.stray.length === 0 && F.families.every((f) => f.woff2.length >= 1 && f.woff2Magic),
        oneOflPerFamily: F.families.every((f) => f.oflTexts === 1),
        oflRowPerFamily: F.families.every((f) => f.rowOk),
        wordmarkBodoni: r.wordmark.family === 'Bodoni Moda',
        hudLabelPlexCondensed: r.hudLabel.family === 'IBM Plex Sans Condensed',
        numeralPlexMono: r.numeral.family === 'IBM Plex Mono',
        noOldFaceLoaded: !oldFaces.some((s) => /:loaded$/.test(s)),
        zeroBrandRefs: F.refsBrand.length === 0,
        zeroRefsAnywhere: F.refsTotal === 0,
      };
      return { pass: Object.values(checks).every(Boolean), detail: {
        failed: Object.keys(checks).filter((k) => !checks[k]), checks, resolved: r, oldFaces,
        families: F.families.map((f) => ({ family: f.family, woff2: f.woff2, ofl: f.oflTexts, row: f.row && f.row.id })),
        shippedKB: Math.round(F.shippedBytes / 1024), stray: F.stray,
        oldFamilyRefs: { total: F.refsTotal, inBrandFiles: F.refsBrand.length, inOtherLanesFiles: F.refsForeign, byOwner: F.foreignFilesByOwner, sample: F.sample,
          note: 'every remaining reference is a fallback string or comment in a file brand may not edit (rule 1); none resolves (see resolved / oldFaces). The removal-only patch is tools/lint/patches/w0b-retired-font-refs.patch for the orchestrator to apply at merge' },
      } };
    })()`;
    },
  },
  /* -------------------------------------------------------------- UI words */
  {
    id: 'A-ui-words', kind: 'action', lane: 'brand', plain: true, settle: 1200, timeout: 90000,
    title: 'brand surfaces (tab title, loading, title press + menu + line, credits, field manual, new-game modal) render none of the plan §9 A-ui-words terms',
    assert: `(async () => {
      const RE = new RegExp(${JSON.stringify(UI_WORDS_RE)}, 'gi');
      const m = __CTX__.menus;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const s = {};
      s['document.title'] = document.title;
      s.loading = document.getElementById('loading')?.textContent || '';
      s.titlePress = document.getElementById('title')?.innerText || '';
      ${PRESS}
      ${UNTIL_MENU}
      s.titleMenu = document.getElementById('title')?.innerText || '';
      for (const k of ['credits', 'manual', 'difficulty']) { m.openModal(k); await wait(350); s['modal:' + k] = m.modalEl?.innerText || ''; m.closeModal(); }
      // the title's other field notes (one shows per visit)
      for (let i = 0; i < 3; i++) { m._refreshTitle(); s['titleLine' + i] = m._titleTip?.innerText || ''; }
      const hits = [];
      for (const [k, t] of Object.entries(s)) for (const mm of t.matchAll(RE)) hits.push(k + ': "' + mm[0] + '"');
      return { pass: !!${JSON.stringify(UI_WORDS_RE)} && hits.length === 0 && s.titleMenu.length > 20,
        detail: { hits, regexFromPlan: !!${JSON.stringify(UI_WORDS_RE)}, surfaces: Object.fromEntries(Object.entries(s).map(([k, t]) => [k, t.length])), menuText: s.titleMenu.replace(/\\s+/g, ' ').slice(0, 200) } };
    })()`,
  },
  /* ------------------------------------------------- the lockup, literally */
  {
    id: 'A-logo-construction', kind: 'action', lane: 'brand', plain: true, settle: 1500, timeout: 60000,
    title: 'the title lockup measured: ONE logo; the word is CALIMA in Bodoni Moda 500, tracking 0.18 em; the spark is unclipped, inside the frame, above the cap line and centred on the plumb line; ONE hairline datum rule under the word spanning it; the coral broad-arrow centred under the I, below the rule; nothing else in the lockup',
    assert: `(async () => {
      await document.fonts.ready;
      const logo = [...document.querySelectorAll('.cal-logo')].filter((n) => { const r = n.getBoundingClientRect(); return r.width > 2 && r.height > 2 && +getComputedStyle(n).opacity > 0.05; });
      const L = document.querySelector('#title .cal-logo');
      const word = L.querySelector('.cal-word'), I = L.querySelector('.cal-i');
      const spark = L.querySelector('.cal-spark'), plumb = L.querySelector('.cal-plumb'), arrow = L.querySelector('.cal-arrow');
      const rules = L.querySelectorAll('.cal-datum');
      const R = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom, cx: b.x + b.width / 2 }; };
      const ws = getComputedStyle(word);
      const fs = parseFloat(ws.fontSize), ls = parseFloat(ws.letterSpacing);
      const spans = [...word.children].filter((c) => c.tagName === 'SPAN');
      const glyphL = R(spans[0]).x, glyphR = R(spans[spans.length - 1]).r - ls;     // the last letter's tracking is not the word
      const sp = R(spark), pl = R(plumb), ar = R(arrow), ru = rules[0] ? R(rules[0]) : null, ib = R(I);
      // clipping: no clip-path / mask / overflow:hidden from the spark up to the logo
      const clipped = []; for (let n = spark; n && n !== L.parentElement; n = n.parentElement) {
        const c = getComputedStyle(n);
        if (c.clipPath !== 'none' || (c.maskImage && c.maskImage !== 'none') || (n !== spark && /hidden|clip/.test(c.overflow))) clipped.push(n.className?.baseVal ?? n.className);
      }
      const stroke = arrow.querySelector('path')?.getAttribute('stroke');
      const sparkStroke = spark.querySelector('g')?.getAttribute('stroke');
      const capTop = pl.y;                                   // the plumb line spans cap line -> baseline
      const text = L.textContent.replace(/\\s+/g, '');
      const checks = {
        oneLogo: logo.length === 1,
        wordIsCalima: word.textContent.replace(/\\s+/g, '') === 'CALIMA' && text === 'CALIMA',
        bodoni500: /Bodoni Moda/.test(ws.fontFamily) && ws.fontWeight === '500' && ws.textTransform === 'none',
        tracking018: Math.abs(ls / fs - 0.18) < 0.005,
        sparkInFrame: sp.x >= 0 && sp.y >= 0 && sp.r <= innerWidth && sp.b <= innerHeight,
        sparkUnclipped: clipped.length === 0 && getComputedStyle(spark).overflow === 'visible',
        sparkAboveCapLine: sp.b <= capTop - 0.05 * fs,
        sparkOnAxis: Math.abs(sp.cx - pl.cx) <= 1,
        sparkCoral: (sparkStroke || '').toUpperCase() === '#DA7756',
        oneRule: rules.length === 1,
        ruleUnderWord: !!ru && ru.y >= pl.b && ru.h <= Math.max(1.5, 0.02 * fs),
        ruleSpansWord: !!ru && Math.abs(ru.x - glyphL) <= 2 && Math.abs(ru.r - glyphR) <= 2,
        ruleNotTouchingSpark: !!ru && sp.b < ru.y,
        arrowUnderI: Math.abs(ar.cx - pl.cx) <= 1,
        arrowBelowRule: !!ru && ar.y >= ru.b,
        arrowCoral: (stroke || '').toUpperCase() === '#DA7756',
        plumbIsTheI: Math.abs(pl.cx - (ib.x + (ib.w - ls) / 2)) <= 1 && getComputedStyle(I).color === 'rgba(0, 0, 0, 0)',
      };
      const r1 = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 10) / 10]));
      return { pass: Object.values(checks).every(Boolean), detail: {
        failed: Object.keys(checks).filter((k) => !checks[k]), checks,
        fontSize: fs, trackingEm: +(ls / fs).toFixed(4), family: ws.fontFamily, weight: ws.fontWeight,
        spark: r1(sp), plumb: r1(pl), rule: ru && r1(ru), arrow: r1(ar), glyphSpan: [Math.round(glyphL), Math.round(glyphR)],
        gapSparkToCap: +(capTop - sp.b).toFixed(1), gapRuleToArrow: ru ? +(ar.y - ru.b).toFixed(1) : null, clipped, logos: logo.length } };
    })()`,
  },
  {
    id: 'A-loading-fill', kind: 'action', lane: 'brand', plain: true, settle: 600, timeout: 60000,
    title: 'the real loading screen (main.js setLoad) frozen at 40 % and 100 %: the datum rule fill is 0.40 / 1.00 of the rule, the copy reads "Reading the benchmarks…" and never the Round-4 line, on field-book paper',
    assert: `(async () => {
      ${LOADING_AT(0.4)};
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const frac = () => { const t = document.querySelector('#loading .cal-datum').getBoundingClientRect(); const f = document.querySelector('#loading .cal-datum > i').getBoundingClientRect(); return { f: f.width / t.width, left: f.x - t.x, w: t.width }; };
      await wait(600);
      const at40 = frac();
      const label40 = document.getElementById('load-label').textContent;
      __GAME__.setLoad(1, 'gate');
      await wait(600);
      const at100 = frac();
      const label100 = document.getElementById('load-label').textContent;
      const bg = getComputedStyle(document.getElementById('loading')).backgroundColor;
      const loadingText = document.getElementById('loading').textContent;
      const COPY = 'Reading the benchmarks\\u2026';
      const checks = {
        fill40: Math.abs(at40.f - 0.40) <= 0.01 && Math.abs(at40.left) < 0.5,
        fill100: Math.abs(at100.f - 1) <= 0.005,
        copy: label40 === COPY && label100 === COPY,
        noRoundFourLine: !/waking/i.test(loadingText),
        paper: bg === 'rgb(226, 211, 176)',
        oneLogo: document.querySelectorAll('#loading .cal-logo').length === 1,
      };
      return { pass: Object.values(checks).every(Boolean), detail: { failed: Object.keys(checks).filter((k) => !checks[k]), checks,
        at40: +at40.f.toFixed(4), at100: +at100.f.toFixed(4), ruleWidth: Math.round(at40.w), label: label40, background: bg } };
    })()`,
  },
  /* ------------------------------------------------------------- visuals */
  {
    id: 'V-logo', kind: 'visual', lane: 'brand', plain: true, settle: 2600,
    title: 'Title screen at 1600x900 after settle (press beat): the CALIMA lockup',
    reference: ['reference/r5/brand/bodoni-manuale-tipografico-1818.jpg', 'reference/r5/brand/os-benchmark-broad-arrow.jpg'],
    criteria: 'Bible 9.8. PASS: CALIMA in Didone (Bodoni) caps with real thick/thin contrast, comparable to the Bodoni 1818 caps in the reference; '
      + 'the I is a thin plumb line ending in a pointed bob, and its dot is the FULL coral spark (ten rays, none cut) floating ABOVE the word; '
      + 'ONE hairline datum rule under the word, as wide as the word; under the I, below that rule, a small coral broad-arrow '
      + 'pointing UP at the spark, shaped like the benchmark arrow in the reference. '
      + 'FAIL on: any second line of text or tagline, a kicker naming another brand, the spark on, under, behind or clipped by a rule, '
      + 'reflection dashes, thin wide-tracked sans caps, or the words HORIZON or ZERO anywhere.',
  },
  {
    id: 'V-logo-4k', kind: 'visual', lane: 'brand', plain: true, settle: 2600,
    title: 'The lockup at 2.4x (a 3840x2160-equivalent crop): the same vector construction rendered at 4K pixel density',
    setup: `(() => { const L = document.querySelector('#title .cal-logo'); L.style.setProperty('--cal-lk', (92 * 2.4) + 'px');
      for (const s of ['.mn-title', '#btn-start']) document.querySelectorAll('#title ' + s).forEach((n) => { n.style.visibility = 'hidden'; }); })()`,
    reference: ['reference/r5/brand/bodoni-manuale-tipografico-1818.jpg', 'reference/r5/brand/os-benchmark-broad-arrow.jpg'],
    criteria: 'The V-logo construction up close. PASS: the spark is whole (ten round-capped rays, none clipped or overlapped), clear of the cap line; '
      + 'the plumb line is a single thin stroke from the cap line to a pointed bob whose tip sits on the baseline; the datum rule is one hairline, '
      + 'straight, edge to edge of the word; the broad-arrow is three coral strokes meeting at an apex just under the rule, centred on the plumb line; '
      + 'the Bodoni caps show hairline serifs and vertical stress like the reference. FAIL on jagged or broken strokes, a misplaced or doubled part, '
      + 'or any text besides CALIMA.',
  },
  {
    id: 'V38-title', kind: 'visual', lane: 'brand', plain: true, settle: 2200,
    title: 'Title screen with the menu in: one logo over the live vista in calima, vertical menu (shadows the carried V38-title)',
    setup: `(async () => { ${PRESS} ${UNTIL_MENU} })()`,
    reference: ['reference/r5/brand/calima-dawn-maspalomas.jpg', 'reference/r5/brand/salinas-de-janubio.jpg'],
    criteria: 'Bible 9.8 title. PASS: exactly ONE logo (the V-logo lockup); a vertical menu (CONTINUE / NEW GAME / SETTINGS / FIELD MANUAL / CREDITS, '
      + 'station numbers, CONTINUE greyed with no save), a save line and one field-note line, all readable; behind it a LIVE vista in calima: '
      + 'an ochre-hazed flat sky and skyline with a soft coral disc sun, low contrast like the calima reference. '
      + 'STAGING NOTE (W0b): the Pans do not exist until world-ground W1 and the calima weather until world-sky W1, so this shot is the best '
      + 'available calima-tinted vista: the Round-4 valley rim seen from REST toward the sun, under the brand stand-in wash (an ochre colour '
      + 'blend + haze over the canvas, the coral disc placed on the projected sun direction and shown only when the sun clears the skyline). '
      + 'Salt grid and white surf on black sand are NOT expected until W1 (salinas reference = the target). '
      + 'FAIL on: a second logo, a tall walker silhouette (the old long-necked tower) on the skyline, live lava, the keybind wall, a start button beside the menu, '
      + 'or menu text unreadable against the vista.',
  },
  {
    id: 'V-loading', kind: 'visual', lane: 'brand', plain: true, settle: 900,
    title: 'Loading screen at 40 % (the real boot DOM + main.js setLoad, frozen)',
    setup: LOADING_AT(0.4),
    reference: ['reference/r5/brand/os-benchmark-broad-arrow.jpg'],
    criteria: 'Bible 9.8 loading. PASS: the CALIMA lockup in ink on field-book paper; its datum rule is drawn as a faint track and filled solidly from the '
      + 'LEFT to about 40 % of the word width; the copy under it reads "Reading the benchmarks…"; nothing else. FAIL on a separate progress bar, '
      + 'any other copy (no "Waking the machines"), a teal or glowing bar, or the fill starting anywhere but the left end.',
  },
  {
    id: 'V-loading-100', kind: 'visual', lane: 'brand', plain: true, settle: 900,
    title: 'Loading screen at 100 % (frozen)',
    setup: LOADING_AT(1),
    reference: ['reference/r5/brand/os-benchmark-broad-arrow.jpg'],
    criteria: 'As V-loading at 100 %: the datum rule is one complete hairline under the whole word (the finished lockup); copy unchanged. FAIL as V-loading.',
  },
];

/**
 * The content modules the player lint reads: EVERY export that is a plain object
 * or array is a content table (keys + display strings); functions and classes
 * are skipped. A module that fails to import is reported, not fatal.
 */
const CONTENT_MODULES = [
  '/src/ui/tips.js', '/src/core/progression.js', '/src/combat/weapons.js', '/src/items/items.js', '/src/items/crafting.js',
  '/src/items/datapoints.js', '/src/world/props/places.js', '/src/world/props/megastructures.js', '/src/world/props/npcs.js',
  '/src/world/npc/waypoints.js', '/src/audio/manifest.js', '/src/audio/music.js', '/src/entities/machines/legacy.js',
  '/src/entities/machines/ai/tables.js', '/src/instruments/roles.js', '/src/studio/pose.js', '/src/studio/cast.js',
  '/src/core/assets.specs.js',
];


const DAY1 = [
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

export const GATES = [...DAY1, ...W0B];
