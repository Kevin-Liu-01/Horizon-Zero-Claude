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
 * coordinate or a bone.
 *
 * M0.3 (R4a): the W0-day1 rename rows (A-identifiers-renamed, A-extent-refactor,
 * A-single-rest, A-storage-keys, A-storage-keys-reload) and the two lexicon lints
 * (code and player text) are retired: their subject (the Round-4 names, extents
 * and keys) is removed, and the Tier 0 name lint (tools/tier0/namelint.mjs, private
 * term list) replaces the lexicon those rows read. The rows are in git history.
 */
import { readFileSync, readdirSync, lstatSync, existsSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

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
/**
 * V38-title's criteria: the plan §9 bullet, verbatim (read from the plan, never paraphrased here).
 * Fix round 2: when the orchestrator rules on the W0b vista (plan §8.3 marker
 * `<!-- r5-ruling v38-pans=W1 -->`, the engine-gpu pattern), the §8.3 bullet that rules on
 * V38-title is appended VERBATIM, so the judge grades with the ruling and brand edits nothing.
 * No marker (this tree, and main at 6bfae9f): the plan bullet alone. A marker without its
 * bullet throws, so a half-applied ruling cannot pass silently.
 */
const V38_RULING = (() => {
  const mk = /^[ \t]*<!--\s*r5-ruling\s+v38-pans\s*=\s*(W0b|W1)\s*-->[ \t]*$/m.exec(PLAN);
  if (!mk) return null;
  const s83 = PLAN.slice(PLAN.indexOf('### 8.3'), PLAN.indexOf('## 9.'));
  const bullet = s83.split('\n').find((l) => /^- \*\*R\d+/.test(l) && l.includes('V38-title'));
  if (!bullet) throw new Error('plan marker r5-ruling v38-pans=' + mk[1] + ' found, but no §8.3 bullet ruling on V38-title');
  return { value: mk[1], text: bullet.replace(/^- /, '').replace(/\*\*/g, '') };
})();
const V38_CRITERIA = (() => {
  const line = PLAN.split('\n').find((l) => l.includes('**V38-title**'));
  const m = line && /shot: (.+)$/.exec(line);
  if (!m) throw new Error('plan §9 V38-title bullet not found');
  const base = 'PLAN §9 V38-title, verbatim: shot: ' + m[1].replace(/\*\*/g, '');
  return V38_RULING ? base + ' || ORCHESTRATOR RULING (plan §8.3, marker v38-pans=' + V38_RULING.value + '), verbatim: ' + V38_RULING.text : base;
})();
/** the retired families, read from the A-fonts-licensed bullet ("0 references to A, B, … in CSS/JS") */
const OLD_FAMILIES = (() => {
  const line = PLAN.split('\n').find((l) => l.includes('**A-fonts-licensed**'));
  const m = line && /0 references to (.+?) in CSS\/JS/.exec(line);
  return m ? m[1].split(/,\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean) : [];
})();
const OLD_FAMILY_RE = OLD_FAMILIES.length
  ? new RegExp(OLD_FAMILIES.map((f) => f.split(/\s+/).join('\\s*')).join('|'), 'i') : /$^/;

/** The two CALIMA families (plan R55) and their files' stems. */
const FAMILIES = [
  { family: 'Chakra Petch', stem: 'ChakraPetch', role: 'wordmark, display, HUD labels, menus, place names' },
  { family: 'IBM Plex Mono', stem: 'IBMPlexMono', role: 'numerals, bearings, body text' },
];

/**
 * Which lane owns a file (plan §2 at W0b), for naming whoever must clear a
 * reference brand may not edit (rule 1). brand's own W0 files are listed first.
 */
const OWNERS = [
  [/^(index\.html|src\/style\.css|src\/main\.js|src\/ui\/menu\.js|public\/fonts\/|public\/favicon\.svg|README\.md|tools\/lint\/|tools\/gates\.r5\.brand\.mjs$)/, 'brand'],
  [/^src\/ui\/(quests|skills)\.js$/, 'progression (W3)'],
  [/^src\/ui\/wheel\.|^src\/combat\//, 'combat-kit (W2)'],
  [/^src\/ui\/dialogue\.js$/, 'frozen UI engine (plan §1.1; orchestrator grant)'],
  [/^src\/ui\//, 'shell-ui (W2)'],
  [/^src\/studio\//, 'brand (W4: src/studio/**)'],
  [/^tools\/r5-direction\//, 'orchestrator (direction-B mock + checker, no lane): delete'],
  [/^tools\//, 'gates-perf / tools owner'],
  [/^src\//, 'see plan §2'],
];
/** The §1.2 grant row A-fonts-licensed needs (brand cannot edit these files at W0b, plan rule 1). */
const GRANT_LINE = '| brand | W0b exit (orchestrator applies) | `src/ui/{hud.css,focus.css,focus.js,inventory.css,wheel.css,map.js,quests.js,skills.js,dialogue.js}`, '
  + '`src/combat/feedback.css`, `src/studio/studio.css`, `tools/r5-direction/**` | rename/remove only: the retired family names (' + OLD_FAMILIES.join(', ') + ') in fallback stacks, comments and one canvas font string, as `tools/lint/patches/w0b-retired-font-refs.patch`; delete '
  + '`tools/r5-direction/` (its lexicon lives in `tools/lint/lexicon/direction-b.json`). No selector, property, value or logic change |';
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
  // the removal patch brand hands the orchestrator for the files it may not edit (rule 1)
  const PATCH = 'tools/lint/patches/w0b-retired-font-refs.patch';
  let patch = null;
  if (existsSync(path.join(ROOT, PATCH))) {
    const body = read(PATCH).split('\n');
    const removed = body.filter((l) => l.startsWith('-') && !l.startsWith('---') && OLD_FAMILY_RE.test(l)).length;
    const added = body.filter((l) => l.startsWith('+') && !l.startsWith('+++') && OLD_FAMILY_RE.test(l)).length;
    let applies = null, alreadyApplied = null;
    try { execFileSync('git', ['apply', '--check', PATCH], { cwd: ROOT, stdio: 'pipe' }); applies = true; } catch { applies = false; }
    // on merged main, after the orchestrator applied it: the reverse applies, and the refs counted above are what is left
    if (!applies) { try { execFileSync('git', ['apply', '--reverse', '--check', PATCH], { cwd: ROOT, stdio: 'pipe' }); alreadyApplied = true; } catch { alreadyApplied = false; } }
    patch = { file: PATCH, applies, alreadyApplied, refLinesRemoved: removed, refLinesAdded: added, refsAfterPatch: applies ? refs.length - removed + added : refs.length };
  }
  return {
    families: fams, stray, oldFamilies: OLD_FAMILIES,
    refsTotal: refs.length, refsBrand: refs.filter((r) => r.owner === 'brand'),
    refsForeign: refs.filter((r) => r.owner !== 'brand').length,
    foreignFilesByOwner: Object.fromEntries(Object.entries(byOwner).filter(([o]) => o !== 'brand').map(([o, s]) => [o, [...s]])),
    sample: refs.slice(0, 12).map((r) => `${r.file}:${r.line} [${r.owner}] ${r.text}`),
    shippedBytes: fams.reduce((n, f) => n + f.bytes, 0), patch,
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
  {
    id: 'A-fonts-licensed', kind: 'action', lane: 'brand', plain: true, settle: 1200, timeout: 90000,
    title: 'public/fonts holds only Chakra Petch, IBM Plex Mono (woff2) + one OFL.txt each, each with an OFL-1.1 LICENSES.json row; the wordmark, a HUD label and a numeral resolve to those families; 0 references to the retired families in CSS/JS',
    get assert() {
      const F = fontsNode();
      return `(async () => {
      const F = ${JSON.stringify(F)};
      const OLD = new RegExp(${JSON.stringify(OLD_FAMILY_RE.source)}, 'i');
      await document.fonts.ready;
      // --- FIRST, IN PLAY: the HUD on screen for 2.5 s, before this gate asks for any face itself:
      // (a) no request was made for a retired font FILE, (b) no element's computed stack leads with a retired family
      const m = __CTX__.menus;
      m.closeModal?.(); m._titleLeave?.(); m.titleStage = 'idle';
      document.body.classList.remove('cal-title-live');
      __GAME__.start(false);
      await new Promise((res) => setTimeout(res, 2500));
      // ... and the photo studio (its two kickers led with a retired face): enter, 1.5 s, read, leave
      let studioVisited = false;
      const studioLeading = [];
      try {
        const S = __CTX__.studio;
        if (S?.enter) {
          S.enter(); await new Promise((res) => setTimeout(res, 1500));
          studioVisited = !!document.querySelector('#studio-ui');
          for (const el of document.querySelectorAll('#studio-ui *')) {
            const first = getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
            if (OLD.test(first)) studioLeading.push(typeof el.className === 'string' && el.className ? el.className.split(/\s+/)[0] : el.tagName);
          }
          S.exit(); await new Promise((res) => setTimeout(res, 600));
        }
      } catch (e) { studioLeading.push('studio error: ' + (e?.message || e)); }
      const OLD_FILE = new RegExp('/fonts/[^?#]*(' + F.oldFamilies.map((f) => f.replace(/\\s+/g, '')).join('|') + ')', 'i');
      const fontRequests = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\\/fonts\\//.test(n));
      const retiredRequests = fontRequests.filter((n) => OLD_FILE.test(n));
      const leading = [];
      for (const el of document.querySelectorAll('*')) {
        const first = getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
        if (OLD.test(first)) leading.push((el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.split(/\\s+/)[0] : el.tagName));
      }
      const hudInPlay = { visible: !document.getElementById('hud')?.classList.contains('hidden'), state: __CTX__.state };
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
      // HUD labels: every #hud element with its own words (3+ letters) in its direct text
      const hudEls = [...document.querySelectorAll('#hud *')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && /[A-Za-z]{3,}/.test(n.textContent)));
      const hudLabel = hudEls[0];
      const numeral = document.querySelector('#title .cal-stn');
      const LICENSED = ['Chakra Petch', 'IBM Plex Mono'];
      const hudFamilies = {}; const hudUnlicensed = [];
      for (const el of hudEls) {
        const res = await resolve(el);
        hudFamilies[res.family] = (hudFamilies[res.family] || 0) + 1;
        if (!LICENSED.includes(res.family)) hudUnlicensed.push((el.className || el.tagName) + ': ' + res.stack);
      }
      const r = { wordmark: await resolve(word), hudLabel: { ...(await resolve(hudLabel)), el: hudLabel ? (hudLabel.className || hudLabel.tagName) : null, text: hudLabel?.textContent?.trim().slice(0, 30) },
        numeral: { ...(await resolve(numeral)), text: numeral?.textContent }, hudLabels: { n: hudEls.length, byFamily: hudFamilies, unlicensed: hudUnlicensed.slice(0, 8) } };
      // a retired family's @font-face still declared by another lane's CSS: load it the way a page would, then read its status
      const oldFaceObjs = [...document.fonts].filter((ff) => OLD.test(ff.family.replace(/["']/g, '')));
      for (const ff of oldFaceObjs) { try { await ff.load(); } catch { /* status 'error' */ } }
      const oldFaces = oldFaceObjs.map((ff) => ff.family.replace(/["']/g, '') + ':' + ff.status);
      const checks = {
        onlyTheTwoFamilies: F.stray.length === 0 && F.families.every((f) => f.woff2.length >= 1 && f.woff2Magic),
        oneOflPerFamily: F.families.every((f) => f.oflTexts === 1),
        oflRowPerFamily: F.families.every((f) => f.rowOk),
        wordmarkChakra: r.wordmark.family === 'Chakra Petch',
        hudLabelLicensed: LICENSED.includes(r.hudLabel.family),
        everyHudLabelLicensed: hudEls.length > 0 && hudUnlicensed.length === 0,
        numeralPlexMono: r.numeral.family === 'IBM Plex Mono',
        noOldFaceLoaded: !oldFaces.some((s) => /:loaded$/.test(s)),
        noRetiredFontFileRequested: hudInPlay.visible && studioVisited && retiredRequests.length === 0,
        noStackLeadsWithRetired: leading.length === 0 && studioLeading.length === 0,
        zeroBrandRefs: F.refsBrand.length === 0,
        zeroRefsAnywhere: F.refsTotal === 0,
      };
      return { pass: Object.values(checks).every(Boolean), detail: {
        failed: Object.keys(checks).filter((k) => !checks[k]), checks, resolved: r, oldFaces,
        inPlay: { ...hudInPlay, studioVisited, studioStacksLeadingWithRetired: studioLeading.slice(0, 6), fontRequests: fontRequests.map((n) => n.replace(/^https?:\\/\\/[^/]+/, '')), retiredRequests, stacksLeadingWithRetired: leading.length, sample: leading.slice(0, 6) },
        families: F.families.map((f) => ({ family: f.family, woff2: f.woff2, ofl: f.oflTexts, row: f.row && f.row.id })),
        shippedKB: Math.round(F.shippedBytes / 1024), stray: F.stray,
        oldFamilyRefs: { total: F.refsTotal, inBrandFiles: F.refsBrand.length, inOtherLanesFiles: F.refsForeign, byOwner: F.foreignFilesByOwner, sample: F.sample, patch: F.patch,
          note: 'every remaining reference is in a file brand may not edit at W0b (rule 1). tools/lint/patches/w0b-retired-font-refs.patch renames/removes them and deletes tools/r5-direction; it needs the §1.2 grant line in grantNeeded and is applied by the orchestrator at the brand merge',
          grantNeeded: ${JSON.stringify(GRANT_LINE)}, grantRecordedInPlan: ${JSON.stringify(PLAN.split('\n').includes(GRANT_LINE))} },
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
    title: 'the title lockup measured: ONE logo; the word is CALIMA in Chakra Petch 600, tracking 0.18 em; the spark is unclipped, inside the frame, above the cap line and centred on the plumb line; ONE hairline datum rule under the word spanning it; the coral broad-arrow centred under the I, below the rule; nothing else in the lockup',
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
        chakra600: /Chakra Petch/.test(ws.fontFamily) && ws.fontWeight === '600' && ws.textTransform === 'none',
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
  /* ------------------------------------- the calima disc (judge r0 finding) */
  {
    id: 'A-title-disc-depth', kind: 'action', lane: 'brand', plain: true, settle: 1500, timeout: 240000,
    title: 'the title calima disc is a depth-tested billboard in the 3D scene (terrain in front of the sun hides it; it is never composited over terrain), placed every frame on the sun the sky draws (the dome is centred on the player, so from the title camera that sun sits under sunDir) at a constant angular size, from a camera bearing whose whole path keeps the terrain skyline under it (clearance >= 0); IN REAL TIME (no clock or dolly jump) for the whole sway (dolly clock past 105 s): the world clock is held, the sun does not move, and the whole disc core stays above the skyline seen from the live camera at every 5 s sample; a start that bypasses the menu (__GAME__.start, the game-start event) still removes and disposes the disc (geometry + material dispose events) and hands the clock back (it runs again in play)',
    assert: `(async () => {
      const ctx = __CTX__, m = ctx.menus, scene = ctx.scene, env = ctx.environment, T = ctx.terrain, R = ctx.engine?.renderer || ctx.renderer;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const DEG = Math.PI / 180;
      const find = () => { let d = null; scene.traverse((o) => { if (o.name === 'cal-title-calima-disc') d = o; }); return d; };
      const sun = env?.sunDir;
      ${PRESS}
      ${UNTIL_MENU}
      await wait(400);
      const d = find();
      const cam = ctx.camera;
      const toDisc = d ? d.position.clone().sub(cam.position) : null;
      // the sun as the sky draws it from this camera (menus._titleSunPoint; the dome is centred on the player)
      const skySun = d ? m._titleSunPoint(d.position.clone(), cam.position).sub(cam.position) : null;
      const angDeg = toDisc && skySun ? toDisc.angleTo(skySun) * 180 / Math.PI : null;
      const offTrueSunDeg = toDisc && sun ? toDisc.angleTo(sun) * 180 / Math.PI : null;
      const angSizeDeg = d ? Math.atan(d.scale.x / 2 / toDisc.length()) * 180 / Math.PI : null;
      const facing = d ? d.quaternion.angleTo(cam.quaternion) * 180 / Math.PI : null;
      const audit = m.audit().title.disc;
      const parentAtTitle = d && d.parent ? (d.parent === scene ? 'ctx.scene' : d.parent.type + ':' + d.parent.name) : null;
      // --- REAL TIME: sample every 5 s until the dolly clock is past 105 s (both truck extremes), no jumps
      const core = audit?.coreDeg ?? null;
      const crestAt = (cx, cy, cz, a) => { let c = -Math.PI / 2; const sx = Math.sin(a), sz = Math.cos(a);
        for (let k = 20; k <= 1400; k += 20) { const e = Math.atan2(T.getHeight(cx + sx * k, cz + sz * k) - cy, k); if (e > c) c = e; } return c; };
      const v = d ? new d.position.constructor() : null, sp = d ? new d.position.constructor() : null;
      const samples = [];
      const hour0 = env.time;
      const t0 = performance.now();
      while (d && core != null && T?.getHeight && performance.now() - t0 < 170000) {
        const p = cam.position;
        m._titleSunPoint(sp, p).sub(p);
        const sel = Math.asin(sp.y / sp.length()), saz = Math.atan2(sp.x, sp.z);
        let crest = -Math.PI / 2;
        for (let k = -2; k <= 2; k++) crest = Math.max(crest, crestAt(p.x, p.y, p.z, saz + k * 0.5 * core * DEG));
        v.copy(d.position).project(cam);
        const ti = m.audit().title;
        samples.push({ s: +((performance.now() - t0) / 1000).toFixed(1), dollyT: ti.dolly.dollyT, hour: +env.time.toFixed(5), sunElDeg: +(sel / DEG).toFixed(3),
          coreBottomMinusCrestDeg: +((sel - core * DEG - crest) / DEG).toFixed(2), ndc: [+v.x.toFixed(3), +v.y.toFixed(3)], visible: d.visible, inScene: d.parent === scene,
          cam: [ti.camera.x, ti.camera.z] });
        if (ti.dolly.dollyT > 106) break;
        await wait(5000);
      }
      const clockAtTitle = m.audit().title.clock;
      const hour1 = env.time;
      // --- leave WITHOUT the menu's own start path: __GAME__.start emits game-start, menus must clean up
      const disposed = { geometry: false, material: false };
      if (d) { d.geometry.addEventListener('dispose', () => { disposed.geometry = true; }); d.material.addEventListener('dispose', () => { disposed.material = true; }); }
      const geoBefore = R?.info?.memory?.geometries ?? null;
      __GAME__.start(false);
      await wait(400);
      const hourStart = env.time;
      await wait(2000);
      const hourPlay = env.time;
      const after = find();
      const geoAfter = R?.info?.memory?.geometries ?? null;
      const minClear = samples.length ? Math.min(...samples.map((x) => x.coreBottomMinusCrestDeg)) : null;
      const sway = samples.length ? [Math.min(...samples.map((x) => x.dollyT)), Math.max(...samples.map((x) => x.dollyT))] : null;
      const checks = {
        inScene: parentAtTitle === 'ctx.scene',
        visible: !!d && d.visible,
        depthTested: !!d && d.material.depthTest === true,
        writesNoDepth: !!d && d.material.depthWrite === false,
        noFog: !!d && d.material.fog === false,
        onTheSkysSun: angDeg != null && angDeg < 0.01,
        constantAngularSize: angSizeDeg != null && Math.abs(angSizeDeg - audit.radiusDeg) < 0.01,
        facesCamera: facing != null && facing < 0.01,
        inFrustum: !!d && d.position.distanceTo(cam.position) < cam.far,
        frameChosen: !!audit && typeof audit.posOffset === 'number' && Array.isArray(audit.tried) && audit.tried.length > 0,
        skylineUnderDisc: !!audit && audit.clearanceDeg >= 0,
        realTimeWholeSway: !!sway && sway[1] > 105 && samples.length >= 15,
        clockHeldOnTitle: clockAtTitle.held && clockAtTitle.frozen && Math.abs(hour1 - hour0) < 1e-9,
        coreClearEverySample: minClear != null && minClear >= 0,
        inFrameEverySample: samples.length > 0 && samples.every((x) => x.visible && x.inScene && Math.abs(x.ndc[0]) < 1 && Math.abs(x.ndc[1]) < 1),
        removedOnGameStart: !after,
        disposedOnGameStart: disposed.geometry && disposed.material,
        clockHandedBack: typeof clockAtTitle.handBack === 'boolean' && env.timeFrozen === clockAtTitle.handBack && hourPlay > hourStart,
      };
      return { pass: Object.values(checks).every(Boolean), detail: {
        failed: Object.keys(checks).filter((k) => !checks[k]), checks,
        sunElevationDeg: sun ? +(Math.asin(sun.y) * 180 / Math.PI).toFixed(2) : null,
        parentAtTitle,
        discFromCamM: d ? +d.position.distanceTo(cam.position).toFixed(1) : null, cameraFar: cam.far,
        angleToSkySunDeg: angDeg, skySunBelowSunDirDeg: offTrueSunDeg, angularRadiusDeg: angSizeDeg, facingDeg: facing, chosen: audit,
        realTime: { samples: samples.length, seconds: samples.length ? samples[samples.length - 1].s : 0, dollyT: sway, hourAtTitle: [hour0, hour1], minCoreBottomMinusCrestDeg: minClear,
          clock: clockAtTitle, hourInPlay: [hourStart, hourPlay], timeFrozenAfter: env.timeFrozen,
          rows: samples.map((x) => x.s + 's dolly ' + x.dollyT + ' h ' + x.hour + ' el ' + x.sunElDeg + ' clear ' + x.coreBottomMinusCrestDeg + ' ndc ' + x.ndc.join(',') + ' cam ' + x.cam.join(',')) },
        disposed, geometries: { titled: geoBefore, afterLeave: geoAfter },
      } };
    })()`,
  },
  /* ------------------------------ the calima disc reads as the sun (judge r1) */
  {
    id: 'A-title-disc-sun', kind: 'action', lane: 'brand', plain: true, settle: 1500, timeout: 60000,
    title: 'the title frame as filmed for V38 (menu in, 2.5 s after it lands): writes a 4-px marker into the top-left corner (the disc\'s screen centre and core radius, and a signature) for A-title-disc-sun-pixels, which reads THIS gate\'s screenshot (canvas + CSS calima wash + scrim + UI)',
    assert: `(async () => {
      const ctx = __CTX__, m = ctx.menus, cam = ctx.camera;
      ${PRESS}
      ${UNTIL_MENU}
      await new Promise((r) => setTimeout(r, 2500));
      let d = null; ctx.scene.traverse((o) => { if (o.name === 'cal-title-calima-disc') d = o; });
      if (!d || !d.visible) return { pass: false, detail: { why: 'no visible calima disc on the title' } };
      const v = d.position.clone().project(cam);
      const x = Math.round((v.x + 1) / 2 * innerWidth), y = Math.round((1 - v.y) / 2 * innerHeight);
      const { coreDeg, edgeDeg } = m.audit().title.disc;
      const pxPerDeg = (innerHeight / 2) / Math.tan(cam.fov * Math.PI / 360) * Math.PI / 180;
      const r10 = Math.round(coreDeg * pxPerDeg * 10), p10 = Math.round(pxPerDeg * 10), e10 = Math.round(edgeDeg * pxPerDeg * 10);
      const mk = document.createElement('div'); mk.id = 'cal-gate-marker';
      mk.style.cssText = 'position:fixed;left:0;top:0;width:6px;height:1px;z-index:2147483647;display:flex;pointer-events:none';
      for (const c of [[x >> 8, x & 255, 197], [y >> 8, y & 255, 197], [r10 >> 8, r10 & 255, 197], [p10 >> 8, p10 & 255, 197], [e10 >> 8, e10 & 255, 197], [202, 17, 165]]) {
        const i = document.createElement('i'); i.style.cssText = 'display:block;width:1px;height:1px;background:rgb(' + c.join(',') + ')'; mk.appendChild(i);
      }
      document.body.appendChild(mk);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { pass: true, detail: { discPx: [x, y], coreRadiusPx: r10 / 10, edgeRadiusPx: e10 / 10, pxPerDeg: p10 / 10, dpr: devicePixelRatio, hour: ctx.environment.time } };
    })()`,
  },
  {
    id: 'A-title-disc-sun-pixels', kind: 'runner', lane: 'brand', timeout: 60000,
    title: 'on the composited title frame (the screenshot of A-title-disc-sun, same run): the calima disc core reads as the bible §9.4 coral (#F2A27E, CIE76 dE <= 10 at its centre), it is whole (>= 97 % of its core within dE 12 of its centre colour), and it is the brightest point of the sky round it: its luminance beats every 3x3 patch of the sky ring from just outside its feathered edge (edge + 2.5 px) to 5° from its centre, at or above the level of its centre, and the mean of the band 40-80 px under it (where judge r1 measured a brighter glow)',
    srcShot: 'A-title-disc-sun',
    async check() {
      const SRC = this.srcShot;
      const shot = path.join(ROOT, 'shots/gates/' + SRC + '.png');
      if (!existsSync(shot)) return { pass: null, detail: { why: 'no shots/gates/' + SRC + '.png: run ' + SRC + ' first, in the same run' } };
      const ageS = Math.round((Date.now() - statSync(shot).mtimeMs) / 1000);
      if (ageS > 900) return { pass: null, detail: { why: 'the ' + SRC + ' screenshot is ' + ageS + ' s old: run both gates in the same run', ageS } };
      const { default: sharp } = await import('sharp');
      const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const W = info.width, H = info.height;
      const at = (x, y) => { const i = (y * W + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
      const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      const lab = (c) => {
        const l = c.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
        const X = (0.4124 * l[0] + 0.3576 * l[1] + 0.1805 * l[2]) / 0.95047, Y = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2], Z = (0.0193 * l[0] + 0.1192 * l[1] + 0.9505 * l[2]) / 1.08883;
        const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
        return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
      };
      const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
      const near = (c, t) => c.every((v, i) => Math.abs(v - t[i]) <= 2);
      const mk = [0, 1, 2, 3, 4, 5].map((i) => at(i, 0));
      const markerOk = W > 8 && near(mk[5], [202, 17, 165]) && mk.slice(0, 5).every((c) => Math.abs(c[2] - 197) <= 2);
      if (!markerOk) return { pass: false, detail: { why: 'marker not found (device pixel ratio other than 1, or the page did not paint it)', marker: mk, size: [W, H] } };
      const cx = mk[0][0] * 256 + mk[0][1], cy = mk[1][0] * 256 + mk[1][1], rc = (mk[2][0] * 256 + mk[2][1]) / 10, ppd = (mk[3][0] * 256 + mk[3][1]) / 10;
      // the sky ring starts outside the disc's feathered edge plus the 3x3 patch and one pixel of AA
      const ringIn = ((mk[4][0] * 256 + mk[4][1]) / 10 + 2.5) / ppd, ringOut = 5;
      const mean = (pts) => { const s = [0, 0, 0]; for (const c of pts) { s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; } return s.map((v) => v / Math.max(1, pts.length)); };
      const disk = (r) => { const out = []; for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= 0 && y >= 0 && x < W && y < H) out.push(at(x, y)); return out; };
      const centre = mean(disk(rc * 0.5));
      const core = disk(rc * 0.85);
      const coreMean = mean(core);
      const whole = core.filter((c) => dE(c, centre) <= 12).length / core.length;
      const CORAL = [0xF2, 0xA2, 0x7E];
      const Lc = lum(centre);
      // the sky ring, edge + 2.5 px out to 5°, at or above the disc's centre: 3x3 patch means
      let ringMax = 0, ringAt = null, ringN = 0;
      for (let y = Math.floor(cy - ringOut * ppd); y <= cy; y++) for (let x = Math.floor(cx - ringOut * ppd); x <= Math.ceil(cx + ringOut * ppd); x++) {
        const r = Math.hypot(x - cx, y - cy) / ppd;
        if (r < ringIn || r > ringOut || x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        const pts = []; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) pts.push(at(x + i, y + j));
        const L = lum(mean(pts)); ringN++;
        if (L > ringMax) { ringMax = L; ringAt = [x, y, +r.toFixed(2)]; }
      }
      const band = []; for (let y = cy + 40; y <= cy + 80 && y < H; y++) for (let x = cx - 12; x <= cx + 12; x++) band.push(at(x, y));
      const bandMean = mean(band);
      const r1 = (c) => c.map((v) => Math.round(v));
      const checks = {
        coreIsCoral: dE(centre, CORAL) <= 10,
        coreWhole: whole >= 0.97,
        brighterThanSkyRing: ringN > 0 && Lc > ringMax,
        brighterThanBandBelow: Lc > lum(bandMean),
      };
      return { pass: Object.values(checks).every(Boolean), detail: {
        failed: Object.keys(checks).filter((k) => !checks[k]), checks,
        discPx: [cx, cy], coreRadiusPx: rc, pxPerDeg: ppd, shotAgeS: ageS,
        centre: r1(centre), coreMean: r1(coreMean), target: CORAL, dE76: +dE(centre, CORAL).toFixed(2), coreWholeFraction: +whole.toFixed(3),
        centreLum: +Lc.toFixed(1), skyRing: [+ringIn.toFixed(2), ringOut], skyRingMaxLum: +ringMax.toFixed(1), skyRingMaxAt: ringAt, skyRingPatches: ringN,
        bandBelowMean: r1(bandMean), bandBelowLum: +lum(bandMean).toFixed(1),
      } };
    },
  },
  /* ------------------------- the title at whatever hour the player quits at (judge r0, fix round 1) */
  {
    id: 'A-title-any-hour', kind: 'action', lane: 'brand', plain: true, settle: 1500, timeout: 180000,
    title: 'QUIT TO TITLE at any hour shows the title at its own hour: after play at 12:00, 21:00 and 03:00, and with a rest still running at the quit, the title stands at the hour of the first visit (the boot hour, the title hour) with the clock held, and ONE calima disc is in the scene, visible, its whole core inside the frame and above the terrain skyline seen from the live camera, when the menu is in and again 3 s later; leaving by NEW GAME removes and disposes that disc and hands back the hour the player quit at (the rest\'s end hour when a rest was running), and the clock runs again',
    assert: `(async () => {
      const ctx = __CTX__, M = ctx.menus, env = ctx.environment, T = ctx.terrain, cam = ctx.camera, scene = ctx.scene;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const DEG = Math.PI / 180;
      const discs = () => { const out = []; scene.traverse((o) => { if (o.name === 'cal-title-calima-disc') out.push(o); }); return out; };
      const untilPlaying = async () => { const t0 = performance.now(); while (ctx.state !== 'playing' && performance.now() - t0 < 30000) await wait(100); };
      const crestAt = (cx, cy, cz, a) => { let c = -Math.PI / 2; const sx = Math.sin(a), sz = Math.cos(a);
        for (let k = 20; k <= 1400; k += 20) { const e = Math.atan2(T.getHeight(cx + sx * k, cz + sz * k) - cy, k); if (e > c) c = e; } return c; };
      const sp = cam.position.clone(), v = cam.position.clone();
      /** one reading of the title as the player sees it: the hour, the clock, and the disc on screen */
      const look = () => {
        const ds = discs(), d = ds[0], a = M.audit().title;
        const out = { hour: +env.time.toFixed(4), frozen: env.timeFrozen, held: a.clock.held, discs: ds.length };
        if (!d || !T?.getHeight) return out;
        const p = cam.position, core = a.disc?.coreDeg;
        M._titleSunPoint(sp, p).sub(p);
        const sel = Math.asin(sp.y / sp.length()), saz = Math.atan2(sp.x, sp.z);
        let crest = -Math.PI / 2;
        for (let k = -2; k <= 2; k++) crest = Math.max(crest, crestAt(p.x, p.y, p.z, saz + k * 0.5 * core * DEG));
        v.copy(d.position).project(cam);
        const pxPerDeg = (innerHeight / 2) / Math.tan(cam.fov * Math.PI / 360) * DEG;
        const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight, r = core * pxPerDeg;
        return { ...out, visible: d.visible, inScene: d.parent === scene, px: [Math.round(x), Math.round(y)], corePx: +r.toFixed(1),
          coreInFrame: v.z < 1 && x - r >= 0 && x + r <= innerWidth && y - r >= 0 && y + r <= innerHeight,
          coreBottomMinusCrestDeg: +((sel - core * DEG - crest) / DEG).toFixed(2) };
      };
      // the first visit: the boot hour, which every other title gate measures, is the title hour
      ${PRESS}
      ${UNTIL_MENU}
      await wait(300);
      const first = look();
      const titleHour = M.audit().title.clock.titleHour;
      const CASES = [{ hour: 12 }, { hour: 21 }, { hour: 3 }, { hour: 12, rest: 6.2 }];
      const rows = [];
      let prev = null;   // the title being left, and the hour it must hand back
      const leave = async () => {
        const d = discs()[0] || null, disposed = { geometry: false, material: false };
        if (d) { d.geometry.addEventListener('dispose', () => { disposed.geometry = true; }); d.material.addEventListener('dispose', () => { disposed.material = true; }); }
        M.newGame();
        const handedBack = env.time;   // read before any frame runs: exactly what _titleLeave restored
        await untilPlaying();
        await wait(1000);
        return { handedBack: +handedBack.toFixed(4), discsAfter: discs().length, disposed, frozenInPlay: env.timeFrozen, clockRuns: env.time !== handedBack };
      };
      for (const c of CASES) {
        const left = await leave();
        if (prev) Object.assign(prev, { left, handBackOk: Math.abs(left.handedBack - prev.expectHandBack) < 1e-3 });
        env.setTime(c.hour);
        await wait(1500);   // play: the clock runs
        if (c.rest != null) { env.rest({ toHour: c.rest, seconds: 2 }); await wait(150); }
        const quitHour = env.time;
        M.quitToTitle();
        await wait(400);
        ${PRESS}
        ${UNTIL_MENU}
        const t0 = performance.now();
        while (env.resting && performance.now() - t0 < 5000) await wait(100);
        await wait(300);
        const menuIn = look();
        await wait(3000);
        const later = look();
        prev = { case: c.rest != null ? c.hour + 'h, resting to ' + c.rest + 'h' : c.hour + 'h', quitHour: +quitHour.toFixed(4),
          expectHandBack: c.rest != null ? c.rest : quitHour, menuIn, later };
        rows.push(prev);
      }
      { const left = await leave(); Object.assign(prev, { left, handBackOk: Math.abs(left.handedBack - prev.expectHandBack) < 1e-3 }); }
      const onTitle = (r) => r.hour === titleHour && r.frozen === true && r.held === true && r.discs === 1 && r.visible === true && r.inScene === true
        && r.coreInFrame === true && r.coreBottomMinusCrestDeg >= 0;
      const checks = {
        firstVisitIsTheTitleHour: typeof titleHour === 'number' && first.hour === titleHour && first.discs === 1,
        titleHourEveryVisit: rows.length === CASES.length && rows.every((r) => r.menuIn.hour === titleHour && r.later.hour === titleHour),
        clockHeldEveryVisit: rows.every((r) => r.menuIn.frozen && r.later.frozen && r.menuIn.held),
        oneDiscEveryVisit: rows.every((r) => r.menuIn.discs === 1 && r.later.discs === 1),
        coreInFrameEveryVisit: rows.every((r) => r.menuIn.coreInFrame === true && r.later.coreInFrame === true),
        coreClearOfSkylineEveryVisit: rows.every((r) => onTitle(r.menuIn) && onTitle(r.later)),
        hourHandedBack: rows.every((r) => r.handBackOk === true),
        discDroppedAndDisposedOnLeave: rows.every((r) => r.left && r.left.discsAfter === 0 && r.left.disposed.geometry && r.left.disposed.material),
        clockRunsInPlay: rows.every((r) => r.left && r.left.frozenInPlay === false && r.left.clockRuns),
      };
      return { pass: Object.values(checks).every(Boolean), detail: {
        failed: Object.keys(checks).filter((k) => !checks[k]), checks, titleHour, first,
        rows: rows.map((r) => r.case + ' | quit at ' + r.quitHour + ' | menu in: h ' + r.menuIn.hour + ' discs ' + r.menuIn.discs + ' px ' + (r.menuIn.px || []).join(',')
          + ' core ' + r.menuIn.corePx + 'px inFrame ' + r.menuIn.coreInFrame + ' clear ' + r.menuIn.coreBottomMinusCrestDeg + '° | +3 s: h ' + r.later.hour + ' px ' + (r.later.px || []).join(',')
          + ' inFrame ' + r.later.coreInFrame + ' clear ' + r.later.coreBottomMinusCrestDeg + '° | left: hour ' + (r.left && r.left.handedBack) + ' (want ' + +(+r.expectHandBack).toFixed(4) + ')'
          + ' discs ' + (r.left && r.left.discsAfter) + ' disposed ' + (r.left && r.left.disposed.geometry && r.left.disposed.material) + ' clock runs ' + (r.left && r.left.clockRuns)),
      } };
    })()`,
  },
  /* --------------------- nothing behind the spark (fix round 2, judge brand-W0b-judge-r1-eng-film) */
  {
    // fix round 2 (judge brand-W0b-judge-r1-eng-film saw a needle spire behind the spark; their fix: "At W1, re-check that
    // the chooser's bearing clears the spark of any vertical skyline feature"). Graded now, and it is that W1 re-check.
    id: 'A-title-spark-clear', kind: 'action', lane: 'brand', plain: true, settle: 1500, timeout: 300000,
    title: 'Nothing stands behind the spark (the judge saw a needle of rock rising behind it on the plumb axis, "pinned on a stick"; bible 9.8: the spark is "the calima sun"): '
      + 'along the ray through every column of the spark box\'s bottom edge (one per 6 px, at least 9), from the LIVE camera, every other visible mesh in the scene '
      + '(raycast; the sky dome and the disc excepted) is under the spark, and the terrain (marched in 2 m steps over the rendered terrain mesh\'s box) '
      + 'stays at least 0.4° (about 6 px) under it: on the press beat (0.3 s, 2.6 s), IN REAL TIME with the menu in every 5 s until the dolly clock passes 105 s (the whole truck), '
      + 'on the second visit (QUIT TO TITLE) at the press beat, and with the lockup restaged at 2.4x as V-logo-4k films it; the framing chooser reports the spark clear every time',
    assert: `(async () => {
      const ctx = __CTX__, M = ctx.menus, cam = ctx.camera, scene = ctx.scene, T = ctx.terrain, env = ctx.environment;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const DEG = Math.PI / 180;
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\\/deps\\/three\\.js/.test(n));
      if (!url || !T?.getHeight || !T.mesh) return { pass: null, detail: { why: 'no three module URL in the page, or no terrain mesh', url: url || null } };
      const THREE = await import(url);
      const rc = new THREE.Raycaster(), ndc = new THREE.Vector2(), box = new THREE.Box3();
      rc.far = cam.far;
      const meshes = () => { const out = []; scene.traverseVisible((o) => { if ((o.isMesh || o.isInstancedMesh) && o !== T.mesh && o !== env.sky && o.name !== 'cal-title-calima-disc') out.push(o); }); return out; };
      const chain = (o) => { const n = []; for (let p = o; p && p !== scene && n.length < 3; p = p.parent) n.push(p.name || p.type); return n.join('<'); };
      /** one reading: every column of the spark box's bottom edge, from the live camera */
      const look = (label) => {
        const r = document.querySelector('#title .cal-spark').getBoundingClientRect();
        box.setFromObject(T.mesh);
        const list = meshes();
        const cols = Math.max(9, Math.ceil(r.width / 6) + 1);
        let marginDeg = Infinity; const hits = [];
        const t0 = performance.now();
        for (let i = 0; i < cols; i++) {
          const x = r.left + r.width * i / (cols - 1), y = r.bottom;
          ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
          rc.setFromCamera(ndc, cam);
          const o = rc.ray.origin, d = rc.ray.direction, hz = Math.hypot(d.x, d.z), el = Math.atan2(d.y, hz);
          let crest = -Math.PI / 2, tHit = null;
          for (let s = 2; s <= cam.far; s += 2) {
            const px = o.x + d.x * s, pz = o.z + d.z * s;
            if (px < box.min.x || px > box.max.x || pz < box.min.z || pz > box.max.z) break;
            const h = T.getHeight(px, pz), e = Math.atan2(h - o.y, s * hz);
            if (e > crest) crest = e;
            if (tHit == null && h >= o.y + d.y * s) tHit = s;
          }
          marginDeg = Math.min(marginDeg, (el - crest) / DEG);
          const m = rc.intersectObjects(list, false)[0];
          if (tHit != null) hits.push({ col: i, what: 'terrain', distM: tHit });
          if (m) hits.push({ col: i, what: chain(m.object), distM: Math.round(m.distance) });
        }
        const a = M.audit().title;
        return { label, s: +((performance.now() - T0) / 1000).toFixed(1), dollyT: a.dolly?.dollyT ?? null, stage: M.titleStage,
          spark: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], cols, hits: hits.length, hitList: hits.slice(0, 6),
          terrainMarginDeg: +marginDeg.toFixed(2), objects: list.length, ms: Math.round(performance.now() - t0) };
      };
      const T0 = performance.now();
      const rows = [];
      const chooser = [];
      const audit = () => { const s = M.audit().title.disc; return s ? { hour: s.hour, posOffset: s.posOffset, lookOffset: s.lookOffset, tiltExtraDeg: s.tiltExtraDeg, clearanceDeg: s.clearanceDeg, discPx: s.discPx, spark: s.spark, ms: s.ms } : null; };
      // the first visit: the press beat (V-logo films at 2.6 s), then the menu in real time over the whole truck
      chooser.push({ visit: 1, ...audit() });
      await wait(300); rows.push(look('press 0.3 s'));
      await wait(2300); rows.push(look('press 2.6 s'));
      ${PRESS}
      ${UNTIL_MENU}
      await wait(300);
      while (performance.now() - T0 < 200000) {
        rows.push(look('menu'));
        if ((M.audit().title.dolly?.dollyT ?? 0) > 107) break;
        await wait(5000);
      }
      // the second visit: QUIT TO TITLE after a little play, the press beat
      M.newGame();
      { const t1 = performance.now(); while (ctx.state !== 'playing' && performance.now() - t1 < 30000) await wait(100); }
      await wait(2000);
      M.quitToTitle();
      chooser.push({ visit: 2, ...audit() });
      await wait(300); rows.push(look('visit 2 press 0.3 s'));
      await wait(2300); rows.push(look('visit 2 press 2.6 s'));
      // V-logo-4k's staging: the lockup at 2.4x, re-framed for it without the disc rule (menus._titleReframe({ disc: false })), the press beat
      const L = document.querySelector('#title .cal-logo'), lk = L.style.getPropertyValue('--cal-lk');
      L.style.setProperty('--cal-lk', (92 * 2.4) + 'px');
      const re = M._titleReframe ? M._titleReframe({ disc: false }) : null;
      chooser.push({ visit: '2, lockup 2.4x (V-logo-4k staging)', ...(re ? audit() : { why: 'no menus._titleReframe' }) });
      await wait(300); rows.push(look('lockup 2.4x 0.3 s'));
      await wait(2300); rows.push(look('lockup 2.4x 2.6 s'));
      if (lk) L.style.setProperty('--cal-lk', lk); else L.style.removeProperty('--cal-lk');
      const menuRows = rows.filter((r) => r.label === 'menu');
      const checks = {
        nothingBehindTheSpark: rows.every((r) => r.hits === 0),
        // a needle whose tip stops a few px under the spark still reads as "pinned on a stick": 0.4° (about 6 px) of air
        terrainUnderTheSparkEverywhere: rows.every((r) => r.terrainMarginDeg >= 0.4),
        wholeTruckSampled: menuRows.length >= 15 && Math.max(...menuRows.map((r) => r.dollyT || 0)) > 105,
        chooserReportsClear: chooser.length === 3 && chooser.every((c) => c.spark && c.spark.measured === true && c.spark.clear === true),
      };
      return { pass: Object.values(checks).every(Boolean), detail: {
        failed: Object.keys(checks).filter((k) => !checks[k]), checks,
        minTerrainMarginDeg: Math.min(...rows.map((r) => r.terrainMarginDeg)),
        chooser,
        rows: rows.map((r) => r.label + ' t ' + r.s + 's dolly ' + (r.dollyT == null ? '-' : (+r.dollyT).toFixed(1)) + ' spark ' + r.spark.join(',') + ' cols ' + r.cols
          + ' hits ' + r.hits + (r.hits ? ' ' + JSON.stringify(r.hitList) : '') + ' terrain margin ' + r.terrainMarginDeg + '° (' + r.objects + ' meshes, ' + r.ms + ' ms)'),
      } };
    })()`,
  },
  /* ------------------------------------------------------------- visuals */
  {
    id: 'V-logo', kind: 'visual', lane: 'brand', plain: true, settle: 2600,
    title: 'Title screen at 1600x900 after settle (press beat): the CALIMA lockup',
    reference: ['reference/r5/brand/os-benchmark-broad-arrow.jpg'],
    criteria: 'Bible 9.8. The LOCKUP is the wordmark, the spark, the rule and the arrow; the PRESS ANY KEY line, the field-note line and the save line '
      + 'below it are the title menu, not the lockup. PASS: CALIMA in Chakra Petch SemiBold caps with crisp chamfered corners (plan R55); '
      + 'the I is a thin plumb line ending in a pointed bob, and its dot is the FULL coral spark (ten rays, none cut) floating ABOVE the word; '
      + 'ONE hairline datum rule under the word, as wide as the word; under the I, below that rule, a small coral broad-arrow '
      + 'pointing UP at the spark, shaped like the benchmark arrow in the reference. '
      + 'FAIL on: any second line of text or tagline, a kicker naming another brand, the spark on, under, behind or clipped by a rule, '
      + 'reflection dashes, or any word from the title of another game anywhere.',
  },
  {
    id: 'V-logo-4k', kind: 'visual', lane: 'brand', plain: true, settle: 2600,
    title: 'The lockup at 2.4x (a 3840x2160-equivalent crop): the same vector construction rendered at 4K pixel density; the vista is re-framed '
      + 'for the lockup as staged (menus._titleReframe({ disc: false }): this shot films the construction, not the disc), so nothing stands behind the larger spark (A-title-spark-clear)',
    setup: `(() => { const L = document.querySelector('#title .cal-logo'); L.style.setProperty('--cal-lk', (92 * 2.4) + 'px');
      for (const s of ['.mn-title', '#btn-start']) document.querySelectorAll('#title ' + s).forEach((n) => { n.style.visibility = 'hidden'; });
      __CTX__.menus._titleReframe({ disc: false }); })()`,
    reference: ['reference/r5/brand/os-benchmark-broad-arrow.jpg'],
    criteria: 'The V-logo construction up close. PASS: the spark is whole (ten round-capped rays, none clipped or overlapped), clear of the cap line; '
      + 'the plumb line is a single thin stroke from the cap line to a pointed bob whose tip sits on the baseline; the datum rule is one hairline, '
      + 'straight, edge to edge of the word; the broad-arrow is three coral strokes meeting at one point just under the rule, centred on the plumb line; '
      + 'the Chakra Petch caps show clean chamfered corners and an even stroke. FAIL on jagged or broken strokes, a misplaced or doubled part, '
      + 'or any text besides CALIMA.',
  },
  {
    id: 'V38-title', kind: 'visual', lane: 'brand', plain: true, settle: 2200,
    title: 'Title screen after settle (menu in): plan §9 V38-title, criteria verbatim from the plan (shadows the carried V38-title). '
      + 'STAGING NOTE (orchestrator W0b instruction; the criteria are NOT changed by it): the Pans are world-ground W1 and the calima weather world-sky W1, '
      + 'so this shot is staged over the best available vista (the Round-4 valley) under brand\'s calima stand-in (the CSS wash and the depth-tested coral disc), '
      + 'framed so the spark stands in clear sky (A-title-spark-clear; on this valley the chooser takes 15:30 and 8° more tilt); '
      + 'the Pans clause cannot pass before W1',
    setup: `(async () => { ${PRESS} ${UNTIL_MENU} })()`,
    reference: ['reference/r5/brand/calima-dawn-maspalomas.jpg', 'reference/r5/brand/salinas-de-janubio.jpg'],
    criteria: V38_CRITERIA,
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
 * V38 over the title's whole life (round 3). The same plan-verbatim criteria, filmed three more ways,
 * so the judge can grade the title the player actually sits on and not one lucky frame:
 *   V38-title-drift35 / -drift105  real time (the title holds the world clock; no clock or dolly jump),
 *                                  near the two extremes of the lateral truck;
 *   V38-title-quit                 the SECOND title visit: NEW GAME, 4 s of play, QUIT TO TITLE, a key;
 *   V38-title-quit-12 / -quit-21   the same after play at 12:00 and at 21:00 (fix round 1, judge r0: the
 *                                  title stands at its own hour whatever hour the player quit at;
 *                                  A-title-any-hour grades it).
 * REGISTRATION ON MAIN TODAY. Main's runner merges `--extra` files after the Round-4 lane files and keeps
 * the FIRST row of a duplicated id, i.e. shell-menus' Round-4 `V38-title`, whose lane is not `brand`, so
 * `--extra tools/gates.r5.brand.mjs --lane brand` would film no V38 at all. Until gates-perf's registry
 * (gates.config.mjs exporting LANE_FILE_RE, under which brand's `V38-title` shadows the carried row) is
 * in this tree, the same row is also published as `V38-title-r5`.
 */
const REGISTRY_LIVE = /export const LANE_FILE_RE/.test(read('tools/gates.config.mjs'));
const V38_ROW = W0B.find((g) => g.id === 'V38-title');
/** NEW GAME, play (at `hour` when given), QUIT TO TITLE, a key: the title a player who quits actually sees */
const QUIT_STEPS = (hour) => `
      ${PRESS} ${UNTIL_MENU}
      __CTX__.menus.newGame();
      { const t0 = performance.now();
        while (__CTX__.state !== 'playing' && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100)); }
      ${hour == null ? '' : `__CTX__.environment.setTime(${hour});`}
      await new Promise((r) => setTimeout(r, 4000));
      __CTX__.menus.quitToTitle();
      await new Promise((r) => setTimeout(r, 400));
      ${PRESS} ${UNTIL_MENU}`;
const QUIT_SETUP = (hour) => `(async () => {${QUIT_STEPS(hour)}
    })()`;
/**
 * The disc reads as the sun on the title a player who quit at NOON sees (fix round 1, judge r0): the
 * A-title-disc-sun pair again, staged after NEW GAME, play at 12:00 and QUIT TO TITLE. The pixels row
 * reads THIS row's screenshot (srcShot) and must run after it, in the same run (file order).
 */
const DISC_SUN = W0B.find((g) => g.id === 'A-title-disc-sun');
const DISC_PIX = W0B.find((g) => g.id === 'A-title-disc-sun-pixels');
const FIRST_VISIT = `${PRESS}\n      ${UNTIL_MENU}`;
if (!DISC_SUN.assert.includes(FIRST_VISIT)) throw new Error('A-title-disc-sun: first-visit prelude not found');
const DISC_SUN_QUIT = [
  { ...DISC_SUN, id: 'A-title-disc-sun-quit12', assert: DISC_SUN.assert.replace(FIRST_VISIT, QUIT_STEPS(12)),
    title: DISC_SUN.title.replace('the title frame as filmed for V38', 'the title frame a player sees after QUIT TO TITLE at 12:00 (NEW GAME, the clock set to 12:00, 4 s of play, QUIT TO TITLE, a key)')
      .replace('for A-title-disc-sun-pixels', 'for A-title-disc-sun-quit12-pixels') },
  { ...DISC_PIX, id: 'A-title-disc-sun-quit12-pixels', srcShot: 'A-title-disc-sun-quit12',
    title: DISC_PIX.title.replace('the screenshot of A-title-disc-sun, same run', 'the screenshot of A-title-disc-sun-quit12, same run: the title after QUIT TO TITLE at 12:00') },
];
const V38_VARIANTS = [
  ...(REGISTRY_LIVE ? [] : [{ ...V38_ROW, id: 'V38-title-r5',
    title: V38_ROW.title + ' [published under this id while main\'s runner keeps the Round-4 V38-title row]' }]),
  { ...V38_ROW, id: 'V38-title-drift35', settle: 32500,
    title: V38_ROW.title + ' [real time, about 35 s after the title appeared: one end of the lateral truck]' },
  { ...V38_ROW, id: 'V38-title-drift105', settle: 102500,
    title: V38_ROW.title + ' [real time, about 105 s after the title appeared: the other end of the truck]' },
  { ...V38_ROW, id: 'V38-title-quit', settle: 2200,
    title: V38_ROW.title + ' [the second title visit: NEW GAME, 4 s of play, QUIT TO TITLE, a key press]',
    setup: QUIT_SETUP(null) },
  // fix round 1 (judge r0): the player quits at whatever hour the world is in; the title stands at its own hour
  { ...V38_ROW, id: 'V38-title-quit-12', settle: 2200,
    title: V38_ROW.title + ' [the second title visit after play at 12:00: NEW GAME, the clock set to 12:00, 4 s of play, QUIT TO TITLE, a key press]',
    setup: QUIT_SETUP(12) },
  { ...V38_ROW, id: 'V38-title-quit-21', settle: 2200,
    title: V38_ROW.title + ' [the second title visit after play at 21:00 (night): NEW GAME, the clock set to 21:00, 4 s of play, QUIT TO TITLE, a key press]',
    setup: QUIT_SETUP(21) },
];

export const GATES = [...W0B, ...DISC_SUN_QUIT, ...V38_VARIANTS];
