/**
 * Record the reviewer's typed answers for one review page.
 *
 *   node tools/frames/answers.mjs --page <review>/<date>/<run> < answers.txt     (a run-unique page, frameset v2)
 *   node tools/frames/answers.mjs --date 2026-11-14 < answers.txt                a day: its own page if it has one
 *                                                                              (pages before v2), else its newest run page
 *   node tools/frames/answers.mjs --page <dir> --dry-run < answers.txt
 *
 * One line per frame: `<frame> accept | closer | wrong[: sentence]` (a dash or colon may separate
 * the sentence; # lines and blank lines are ignored). "accept" freezes that day's filmed frame as
 * the frame's anchor in <review>/accepted/. Every answer is kept in <date>/answers.json and in the
 * running log <review>/answers.log. Lines it cannot read are listed and not applied.
 */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFrameSet } from './frameset.mjs';
import { ACCEPTED, REVIEW, today } from './paths.mjs';

const LINE = /^\s*(F\d\d(?:-[a-z]+)?)\s*[:\-–]?\s*(accept(?:ed)?|closer|wrong)\b\s*[:\-–]?\s*(.*)$/i;

export function parseAnswers(text, ids) {
  const ok = [], bad = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const s = raw.trim();
    if (!s || s.startsWith('#')) continue;
    const m = LINE.exec(s);
    if (!m) { if (!/^F\d\d(-[a-z]+)?\s*$/i.test(s)) bad.push({ line: s, why: 'not "<frame> accept|closer|wrong[: sentence]"' }); continue; }
    const id = m[1].toUpperCase().replace(/-([A-Z]+)$/, (x, k) => '-' + k.toLowerCase());
    if (!ids.has(id)) { bad.push({ line: s, why: `no frame ${id} in the set` }); continue; }
    ok.push({ id, verdict: m[2].toLowerCase().startsWith('accept') ? 'accept' : m[2].toLowerCase(), note: m[3].trim() });
  }
  return { ok, bad };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const date = flag('--date') || today();
  const dry = args.includes('--dry-run');
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--date' && args[i - 1] !== '--page');
  const text = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8');
  const set = loadFrameSet();
  const { ok, bad } = parseAnswers(text, new Set(set.frames.map((f) => f.id)));
  // the page: --page, else the day's own page (built before frameset v2), else the day's newest run page
  let dir = flag('--page') ? path.resolve(flag('--page')) : path.join(REVIEW, date);
  if (!flag('--page') && !existsSync(path.join(dir, 'page.json')) && existsSync(dir)) {
    const runs = readdirSync(dir).map((d) => path.join(dir, d)).filter((d) => existsSync(path.join(d, 'page.json')));
    runs.sort((a, b) => statSync(path.join(b, 'page.json')).mtimeMs - statSync(path.join(a, 'page.json')).mtimeMs);
    if (runs.length) { dir = runs[0]; console.log(`answers: ${date} has ${runs.length} run page(s); using the newest, ${path.basename(dir)} (name one with --page)`); }
  }
  const page = (() => { try { return JSON.parse(readFileSync(path.join(dir, 'page.json'), 'utf8')); } catch { return null; } })();
  if (!page) { console.error(`answers: no review page at ${dir}`); process.exit(2); }
  const at = new Date().toISOString();
  const accPath = path.join(ACCEPTED, 'accepted.json');
  const accepted = existsSync(accPath) ? JSON.parse(readFileSync(accPath, 'utf8')) : {};
  const done = [];
  for (const a of ok) {
    if (a.verdict === 'accept') {
      const fr = page.frames.find((x) => x.id === a.id);
      if (page.placeholder) { bad.push({ line: `${a.id} accept`, why: 'this page shows placeholders, not a film run' }); continue; }
      if (!fr?.ok || !fr.src || !existsSync(fr.src)) { bad.push({ line: `${a.id} accept`, why: 'that frame has no filmed picture on this page' }); continue; }
      if (!dry) {
        mkdirSync(ACCEPTED, { recursive: true });
        copyFileSync(fr.src, path.join(ACCEPTED, `${a.id}.png`));
        accepted[a.id] = { date: page.date || date, commit: page.commit, run: path.basename(page.run), at, provisional: false, note: a.note || null };
      }
    }
    done.push(a);
  }
  if (!dry) {
    const prev = (() => { try { return JSON.parse(readFileSync(path.join(dir, 'answers.json'), 'utf8')); } catch { return { answers: {} }; } })();
    for (const a of done) prev.answers[a.id] = { verdict: a.verdict, note: a.note, at };
    writeFileSync(path.join(dir, 'answers.json'), JSON.stringify(prev, null, 1));
    writeFileSync(accPath, JSON.stringify(accepted, null, 1));
    appendFileSync(path.join(REVIEW, 'answers.log'), done.map((a) => `${at}\t${page.date || date}\t${page.commit}\t${a.id}\t${a.verdict}\t${a.note}\t${path.basename(page.run || '')}`).join('\n') + (done.length ? '\n' : ''));
  }
  console.log(`answers ${date}${dry ? ' (dry run)' : ''}: ${done.length} recorded`
    + ` (${done.filter((a) => a.verdict === 'accept').length} accept, ${done.filter((a) => a.verdict === 'closer').length} closer, ${done.filter((a) => a.verdict === 'wrong').length} wrong)`);
  for (const a of done.filter((x) => x.verdict === 'wrong')) console.log(`  direction ${a.id}: ${a.note || '(no sentence)'}`);
  for (const b of bad) console.log(`  NOT APPLIED "${b.line}": ${b.why}`);
  if (bad.length) process.exitCode = 1;
}
