// @ts-check
/**
 * Tier 0 import graph (static; comments are stripped first, so an example in a doc comment is not an import;
 * see parseImports for how strings are read).
 *
 *   node tools/tier0/imports.mjs [--tree <dir>]
 *
 * Roots: the module scripts of index.html, and every tracked .js / .mjs under tools/.
 * FAIL on:
 *   - a relative or root-absolute ('/src/…') import whose file does not exist
 *     (dynamic `import('…')` with a literal path included, also inside gate page-code strings);
 *   - a named import the target module does not export (unless the target has `export *`);
 *   - a bare import from src/ of a package that is not in package.json `dependencies`
 *     (devDependencies do not ship), or of a Node built-in;
 *   - a bare import from tools/ of a package in neither dependencies nor devDependencies;
 *   - src/ importing anything under tools/ (gate-only code must not ship);
 *   - src/game/** importing three (rules stay testable in Node).
 * Reported, not graded: src modules that nothing reachable from index.html imports.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { listFiles } from './lib/files.mjs';
import { scanJs } from './lib/scanjs.mjs';

const IMPORT_RE = /(?:^|[^.\w$])(?:import|export)\s*(?:([\w$*\s{},]*?)\s*from\s*)?['"]([^'"\n]+)['"]|(?:^|[^.\w$])import\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;

/**
 * Imports in one module's source. Comments are blanked. Quoted strings that contain whitespace are blanked
 * (an import specifier never does; a fixture sentence that quotes an import is not one). Template literals
 * are page code or file contents written elsewhere, so only their root-absolute imports ('/src/…') count.
 * @param {string} src
 * @returns {{ spec: string, names: string[], dynamic: boolean }[]}
 */
export function parseImports(src) {
  let code = '';
  let templ = '';
  for (const seg of scanJs(src)) {
    if (seg.ctx === 'comment') code += seg.text.replace(/[^\n]/g, ' ');
    else if (seg.ctx === 'string' && seg.text[0] === '`') { templ += seg.text + '\n'; code += '``'; }
    else if (seg.ctx === 'string' && /\s/.test(seg.text)) code += "''";
    else code += seg.text;
  }
  const out = [];
  for (const [text, absOnly] of /** @type {[string, boolean][]} */ ([[code, false], [templ, true]])) {
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[2] || m[3];
      if (!spec || (absOnly && !spec.startsWith('/'))) continue;
      const names = [];
      const brace = /\{([^}]*)\}/.exec(m[1] || '');
      if (brace) {
        for (const part of brace[1].split(',')) {
          const n = part.trim().split(/\s+as\s+/)[0].trim();
          if (n && n !== 'type') names.push(n);
        }
      }
      out.push({ spec, names, dynamic: !!m[3] });
    }
  }
  return out;
}

/**
 * Names a module exports, and whether it re-exports `*`.
 * @param {string} src
 */
export function parseExports(src) {
  const t = scanJs(src).map((x) => (x.ctx === 'comment' ? ' ' : x.ctx === 'string' && x.text[0] === '`' ? '``' : x.text)).join('');
  const set = new Set();
  for (const m of t.matchAll(/export\s+(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) set.add(m[1]);
  for (const m of t.matchAll(/export\s+(?:const|let|var)\s*\{([^}]*)\}/g)) for (const x of m[1].split(',')) { const n = x.split(':').pop()?.split('=')[0].trim(); if (n) set.add(n); }
  for (const m of t.matchAll(/export\s+(?:const|let|var)\s*\[([^\]]*)\]/g)) for (const x of m[1].split(',')) { const n = x.split('=')[0].trim(); if (n) set.add(n); }
  for (const m of t.matchAll(/export\s*\{([^}]*)\}/g)) for (const x of m[1].split(',')) { const n = x.trim().split(/\s+as\s+/).pop()?.trim(); if (n) set.add(n); }
  if (/export\s+default\b/.test(t)) set.add('default');
  for (const m of t.matchAll(/export\s*\*\s*as\s+([\w$]+)\s+from/g)) set.add(m[1]);
  const star = /export\s*\*\s*from/.test(t);
  return { set, star };
}

/** @param {string} spec */
const pkgOf = (spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

/**
 * @param {{ root: string }} o
 * @returns {Promise<import('./lib/files.mjs').CheckResult>}
 */
export async function run({ root }) {
  const t0 = Date.now();
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const deps = new Set(Object.keys(pkg.dependencies || {}));
  const devDeps = new Set(Object.keys(pkg.devDependencies || {}));
  const builtins = new Set([...builtinModules, ...builtinModules.map((b) => `node:${b}`)]);
  const failures = [];
  /** @type {Map<string, ReturnType<typeof parseExports>>} */
  const exportsCache = new Map();
  /** @param {string} abs */
  const exportsOf = (abs) => {
    let e = exportsCache.get(abs);
    if (!e) { e = parseExports(readFileSync(abs, 'utf8')); exportsCache.set(abs, e); }
    return e;
  };
  const rel = (/** @type {string} */ abs) => path.relative(root, abs);

  const html = existsSync(path.join(root, 'index.html')) ? readFileSync(path.join(root, 'index.html'), 'utf8') : '';
  const htmlRoots = [...html.matchAll(/<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/g)].map((m) => path.join(root, m[1].replace(/^\//, '')));
  for (const r of htmlRoots) if (!existsSync(r)) failures.push(`index.html: missing module script ${rel(r)}`);
  const toolRoots = listFiles(root, ['tools']).filter((f) => /\.m?js$/.test(f)).map((f) => path.join(root, f));

  const seen = new Set();
  const fromApp = new Set();
  /** @param {string} abs @param {boolean} app */
  const walk = (abs, app) => {
    const key = `${app}:${abs}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (app) fromApp.add(abs);
    const r = rel(abs);
    const inSrc = r.startsWith('src/');
    let src;
    try { src = readFileSync(abs, 'utf8'); } catch { return; }
    for (const im of parseImports(src)) {
      const s = im.spec;
      if (/^(https?:|data:|blob:)/.test(s) || s.includes('${')) continue;
      let target = null;
      if (s.startsWith('./') || s.startsWith('../')) target = path.resolve(path.dirname(abs), s.split('?')[0]);
      else if (s.startsWith('/')) {
        if (!/^\/(src|tools|public|node_modules)\//.test(s)) continue;   // a URL path the page serves, not a module
        if (s.startsWith('/public/') || s.startsWith('/node_modules/')) continue;
        target = path.join(root, s.split('?')[0]);
      } else {
        const p = pkgOf(s);
        if (builtins.has(s) || builtins.has(p)) { if (inSrc) failures.push(`${r}: imports Node built-in '${s}' (src ships to the browser)`); continue; }
        if (inSrc && !deps.has(p)) failures.push(`${r}: imports '${s}' but '${p}' is not in package.json dependencies${devDeps.has(p) ? ' (it is a devDependency and does not ship)' : ''}`);
        else if (!inSrc && !deps.has(p) && !devDeps.has(p)) failures.push(`${r}: imports '${s}' but '${p}' is not in package.json`);
        if (r.startsWith('src/game/') && p === 'three') failures.push(`${r}: src/game/ must not import three`);
        continue;
      }
      if (!existsSync(target) || statSync(target).isDirectory()) { failures.push(`${r}: '${s}' does not resolve (${rel(target)} missing)`); continue; }
      if (inSrc && rel(target).startsWith('tools/')) failures.push(`${r}: src imports gate/tool code '${s}'`);
      if (!/\.(m?js)$/.test(target)) continue;
      if (im.names.length) {
        const ex = exportsOf(target);
        if (!ex.star) for (const n of im.names) if (!ex.set.has(n)) failures.push(`${r}: '${n}' is not exported by ${rel(target)}`);
      }
      walk(target, app && !im.dynamic ? true : app);
    }
  };
  for (const r of htmlRoots) if (existsSync(r)) walk(r, true);
  for (const r of toolRoots) walk(r, false);

  const srcFiles = listFiles(root, ['src']).filter((f) => /\.m?js$/.test(f));
  const unreached = srcFiles.filter((f) => !fromApp.has(path.join(root, f)));
  const uniq = [...new Set(failures)];
  return {
    id: 'import-graph',
    status: uniq.length ? 'FAIL' : 'PASS',
    summary: `${fromApp.size} modules reachable from index.html, ${toolRoots.length} tool scripts walked; ${uniq.length} broken imports`,
    failures: uniq,
    notes: unreached.length ? [`${unreached.length} src modules not imported from index.html (not graded): ${unreached.slice(0, 25).join(', ')}${unreached.length > 25 ? ', …' : ''}`] : [],
    ms: Date.now() - t0,
  };
}

if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const { treeRoot } = await import('./lib/files.mjs');
  const r = await run({ root: treeRoot() });
  console.log(`${r.status} import-graph: ${r.summary}`);
  for (const n of r.notes || []) console.log('  ' + n);
  for (const f of r.failures) console.log('  - ' + f);
  process.exitCode = r.status === 'FAIL' ? 1 : 0;
}
