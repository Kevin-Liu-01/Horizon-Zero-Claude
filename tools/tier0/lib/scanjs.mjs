// @ts-check
/**
 * A small JavaScript splitter (pure): source -> segments tagged `code`, `comment` or `string`
 * (quotes, template literals and regex literals). It is a lexer approximation, good enough to
 * tell a comment from an identifier from a string; it does not parse.
 *   - a template literal is one `string` segment, `${…}` included;
 *   - `/` starts a regex unless the previous significant character ends an expression
 *     (identifier character, `)` or `]`); `return /x/` is therefore read as code, which only
 *     matters for what the lint calls the context of that regex.
 */

/** @typedef {{ ctx: 'code'|'comment'|'string', text: string, line: number }} Segment */

/**
 * @param {string} src
 * @returns {Segment[]}
 */
export function scanJs(src) {
  /** @type {Segment[]} */
  const segs = [];
  const n = src.length;
  let i = 0;
  let codeStart = 0;
  let lastSig = '';
  let line = 1;
  /** @param {number} a @param {number} b */
  const lineAt = (a, b) => { for (let k = a; k < b; k++) if (src.charCodeAt(k) === 10) line++; };
  let lineCursor = 0;
  /** @param {number} at */
  const syncLine = (at) => { lineAt(lineCursor, at); lineCursor = at; return line; };
  /** @param {'code'|'comment'|'string'} ctx @param {number} a @param {number} b */
  const push = (ctx, a, b) => { if (b > a) segs.push({ ctx, text: src.slice(a, b), line: syncLine(a) }); };

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    let end = -1;
    /** @type {'comment'|'string'|null} */
    let kind = null;
    if (c === '/' && d === '/') {
      const j = src.indexOf('\n', i);
      end = j < 0 ? n : j; kind = 'comment';
    } else if (c === '/' && d === '*') {
      const j = src.indexOf('*/', i + 2);
      end = j < 0 ? n : j + 2; kind = 'comment';
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      end = Math.min(n, j + 1); kind = 'string';
    } else if (c === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (depth === 0 && ch === '`') break;
        if (ch === '$' && src[j + 1] === '{') { depth++; j += 2; continue; }
        if (depth > 0 && ch === '{') depth++;
        else if (depth > 0 && ch === '}') depth--;
        j++;
      }
      end = Math.min(n, j + 1); kind = 'string';
    } else if (c === '/' && !/[\w$)\]]/.test(lastSig)) {
      let j = i + 1;
      let cls = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') cls = true;
        else if (src[j] === ']') cls = false;
        else if (src[j] === '/' && !cls) break;
        j++;
      }
      if (src[j] === '/') {
        j++;
        while (j < n && /[a-z]/.test(src[j])) j++;
        end = j; kind = 'string';
      }
    }
    if (kind) {
      push('code', codeStart, i);
      push(kind, i, end);
      i = end; codeStart = end;
      if (kind === 'string') lastSig = 'x';
      continue;
    }
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
  push('code', codeStart, n);
  return segs;
}

/**
 * The source with comments replaced by spaces (newlines kept), for import scanning.
 * @param {string} src
 */
export function stripComments(src) {
  return scanJs(src).map((s) => (s.ctx === 'comment' ? s.text.replace(/[^\n]/g, ' ') : s.text)).join('');
}
