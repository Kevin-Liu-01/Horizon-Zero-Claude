/**
 * Credits surfaces (lane `brand`, plan §10.2). One source, two surfaces:
 *
 *   node tools/lint/credits-sync.mjs           rewrite both surfaces from the manifest
 *   node tools/lint/credits-sync.mjs --check   exit 1 if either surface drifted (A-credits, W4)
 *
 * The source is pipeline's generator `tools/licences/credits.mjs` (which reads
 * `public/LICENSES.json`). This script only pastes its output:
 *
 *   README.md          the body of the "## Credits" section, byte for byte
 *                      `creditsMarkdown()` (+ one fixed closing line)
 *   src/ui/menu.js     the rows between `// <credits:generated>` and
 *                      `// </credits:generated>`, from `creditRows()`; every
 *                      CC-BY and MIT attribution lands in the source VERBATIM
 *                      (A-licence-manifest greps the file for it), so strings
 *                      are quoted with a delimiter they do not contain rather
 *                      than escaped
 *
 * No string here is invented: the sections, their order and their text are the
 * generator's. The menu's own project rows (CALIMA, audio) live outside the
 * markers and are not licence claims.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creditRows, creditsMarkdown } from '../licences/credits.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const README = path.join(ROOT, 'README.md');
const MENU = path.join(ROOT, 'src/ui/menu.js');
const OPEN = '// <credits:generated>';
const CLOSE = '// </credits:generated>';
const README_TAIL = '\nBuilt with [Claude Code](https://claude.com/claude-code).\n';

/** A JS string literal that contains `s` verbatim (no escapes inside the text). */
export function literal(s) {
  for (const q of ["'", '"']) if (!s.includes(q) && !s.includes('\\') && !s.includes('\n')) return q + s + q;
  if (!s.includes('`') && !s.includes('${') && !s.includes('\\')) return '`' + s + '`';
  throw new Error(`credits-sync: cannot quote ${JSON.stringify(s)} verbatim`);
}

/** The generated block for src/ui/menu.js (markers included). */
export function menuBlock(groups = creditRows()) {
  const out = [OPEN, 'const CREDITS_LICENSED = ['];
  for (const g of groups) {
    out.push(`  { head: ${literal(g.head.toUpperCase())}, rows: [`);
    for (const l of g.lines) out.push(`    [${literal(l.text)}, ''],`);
    out.push('  ] },');
  }
  out.push('];', CLOSE);
  return out.join('\n');
}

/** The README "## Credits" body. */
export function readmeBody(md = creditsMarkdown()) {
  return `\n${md}${README_TAIL}`;
}

/** Replace the body of the README's "## Credits" section (heading line kept; up to the next h2 or EOF). */
function spliceReadme(text, body) {
  const h = /^##\s+Credits[ \t]*$/m.exec(text);
  if (!h) throw new Error('credits-sync: README "## Credits" heading not found');
  const start = h.index + h[0].length + 1;
  const next = /^##\s/m.exec(text.slice(start));
  const end = next ? start + next.index : text.length;
  return text.slice(0, start) + body + (next ? '\n' : '') + text.slice(end);
}

export function sync({ write = true } = {}) {
  const readme = readFileSync(README, 'utf8');
  const menu = readFileSync(MENU, 'utf8');
  // README: from the "## Credits" heading line to the next h2 (or EOF)
  const nextReadme = spliceReadme(readme, readmeBody());
  const i0 = menu.indexOf(OPEN), i1 = menu.indexOf(CLOSE);
  if (i0 < 0 || i1 < i0) throw new Error('credits-sync: menu.js credits markers not found');
  const nextMenu = menu.slice(0, i0) + menuBlock() + menu.slice(i1 + CLOSE.length);
  const drift = { readme: nextReadme !== readme, menu: nextMenu !== menu };
  if (write) {
    if (drift.readme) writeFileSync(README, nextReadme);
    if (drift.menu) writeFileSync(MENU, nextMenu);
  }
  return drift;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const drift = sync({ write: !check });
  if (check) {
    const bad = Object.entries(drift).filter(([, d]) => d).map(([k]) => k);
    console.log(bad.length ? `[credits] DRIFT: ${bad.join(', ')} differ from tools/licences/credits.mjs` : '[credits] README and menu.js match the manifest');
    process.exit(bad.length ? 1 : 0);
  }
  console.log(`[credits] README ${drift.readme ? 'rewritten' : 'unchanged'}, menu.js ${drift.menu ? 'rewritten' : 'unchanged'}`);
}
