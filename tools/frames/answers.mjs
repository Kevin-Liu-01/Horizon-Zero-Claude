/**
 * Record the reviewer's typed answers for one review page.
 *
 *   node tools/frames/answers.mjs --page <review>/<date>/<run> < answers.txt     (a run-unique page, frameset v2)
 *   node tools/frames/answers.mjs --date 2026-11-14 < answers.txt                a day: its own page if it has one
 *                                                                              (pages before v2), else its newest run page
 *   node tools/frames/answers.mjs --page <dir> --dry-run < answers.txt
 *   node tools/frames/answers.mjs --page <dir> --prev <earlier page dir> < provisional.txt
 *
 * One line per frame: `<frame> accept | closer | wrong | provisional[: sentence]` (a dash or colon may
 * separate the sentence; # lines and blank lines are ignored). "accept" freezes that page's filmed
 * frame as the frame's anchor in <review>/accepted/. Every answer is kept in <page>/answers.json and in
 * the running log <review>/answers.log. Lines it cannot read are listed and not applied.
 *
 * "provisional" is the orchestrator's, never Kevin's: PROCESS §4's two-page rule. When Kevin has said
 * nothing for two review pages running, a frame the judge called closer or same on all four points on
 * both pages, whose originality checklist passed on both and whose written target (if it has one) is not
 * failing, is accepted provisionally: its frame on this page becomes the anchor, marked provisional in
 * accepted.json, on this page (a line under the frame's heading) and on every later page's anchor label.
 * The tool checks the judge half itself, on this page's run and on --prev's run when given; the written
 * target is the caller's to state in the sentence (which is required). A provisional line never replaces
 * a frame Kevin accepted. One word from Kevin overrides it: his "accept" makes it his; his "closer" or
 * "wrong" on a provisionally accepted frame withdraws the provisional anchor (its picture is moved to
 * accepted/withdrawn/, never deleted), and the frame falls back to the anchor run.
 *
 * Re-anchoring by an orchestrator's ruling (M1b wave 2; before it, a re-film was a hand edit of both records):
 *
 *   node tools/frames/answers.mjs --reanchor <film run dir> [--pick N] [--dry-run] < reanchor.txt
 *
 * One line per frame, `<frame>: <reason>` (the reason is required: the ruling it rests on, the commit, the noise
 * and the check that the subject is unchanged). The frame must already be provisionally accepted (a frame Kevin
 * accepted is never re-anchored without his word). Its picture becomes repeat N of that run (default 2: the
 * second staging of a repeat session, as the regfix 3 and 4 re-films chose; repeat 1 is <id>.png), the run must
 * be from a clean tree, and the old picture is moved to accepted/withdrawn/<id>-<time>-<old commit>.png, never
 * deleted. Provisional status, rule and pages are kept; date, commit and run become the film run's, and the note
 * becomes "RE-ANCHORED (<reason>) ... Earlier: <old note>". Logged in answers.log as `reanchor`.
 *
 * Besides the private record under the review root, the tool keeps a public mirror in the repo,
 * tools/frames/accepted.json: per accepted frame its date, commit, run name, whether it is provisional,
 * and the sentence. It holds no picture and no reference name.
 */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFrameSet } from './frameset.mjs';
import { ACCEPTED, REVIEW, today } from './paths.mjs';

const LINE = /^\s*(F\d\d(?:-[a-z]+)?)\s*[:\-–]?\s*(accept(?:ed)?|provisional(?:ly)?(?:\s+accept(?:ed)?)?|closer|wrong)\b\s*[:\-–]?\s*(.*)$/i;
const POINT_KEYS = ['silhouette', 'material', 'light', 'finish'];
const REPO_RECORD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'accepted.json');

export function parseAnswers(text, ids) {
  const ok = [], bad = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const s = raw.trim();
    if (!s || s.startsWith('#')) continue;
    const m = LINE.exec(s);
    if (!m) { if (!/^F\d\d(-[a-z]+)?\s*$/i.test(s)) bad.push({ line: s, why: 'not "<frame> accept|closer|wrong|provisional[: sentence]"' }); continue; }
    const id = m[1].toUpperCase().replace(/-([A-Z]+)$/, (x, k) => '-' + k.toLowerCase());
    if (!ids.has(id)) { bad.push({ line: s, why: `no frame ${id} in the set` }); continue; }
    const w = m[2].toLowerCase();
    ok.push({ id, verdict: w.startsWith('provisional') ? 'provisional' : w.startsWith('accept') ? 'accept' : w, note: m[3].trim() });
  }
  return { ok, bad };
}

/** The judge half of the two-page rule on one page's run: null when it holds, else why not. */
export function judgeHolds(judge, id) {
  const j = judge?.[id];
  if (!j) return 'no judge verdict';
  const off = POINT_KEYS.filter((k) => !['closer', 'same'].includes(j.points?.[k]));
  if (off.length) return `judge: ${off.map((k) => `${k} ${j.points?.[k] || 'missing'}`).join(', ')}`;
  if (!j.originality?.pass) return `originality checklist: ${j.originality ? 'FAIL ' + (j.originality.fails || []).join('; ') : 'not recorded'}`;
  return null;
}

const readJson = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const pageOf = (dir) => readJson(path.join(dir, 'page.json'), null);

/** Put (or take away) the provisional line under a frame's heading on a built page. */
function markPage(dir, id, line) {
  const file = path.join(dir, 'index.html');
  if (!existsSync(file)) return false;
  let html = readFileSync(file, 'utf8');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  html = html.replace(new RegExp(`\\n?<p class="prov" data-prov="${id}"[^\\n]*</p>`, 'g'), '');
  if (line) {
    const at = new RegExp(`(<section class="frame[^"]*" id="${id}">\\s*<header>[\\s\\S]*?</header>)`);
    if (!at.test(html)) return false;
    html = html.replace(at, `$1\n<p class="prov" data-prov="${id}" style="background:#2d3b1d;color:#e6f2c8;padding:6px 10px;border-radius:6px;margin:8px 0 0;font-size:13px">${esc(line)}</p>`);
  }
  writeFileSync(file, html);
  return true;
}

/** The repo's public mirror of accepted.json: no picture, no reference name. */
function writeMirror(accepted) {
  const pub = {};
  for (const id of Object.keys(accepted).sort()) { const r = accepted[id]; pub[id] = { date: r.date, commit: r.commit, run: r.run, provisional: !!r.provisional, ...(r.rule ? { rule: r.rule, pages: r.pages } : {}), note: r.note }; }
  writeFileSync(REPO_RECORD, JSON.stringify({ about: 'Accepted Frame Set anchors (written by tools/frames/answers.mjs). provisional: PROCESS §4 two-page rule; one word from Kevin overrides it.', frames: pub }, null, 1) + '\n');
}

/** `--reanchor <run dir>`: re-anchor provisionally accepted frames on a film run, by a ruling (see the header). */
export function reanchor(runDir, text, { pick = 2, dry = false, ids } = {}) {
  const run = readJson(path.join(runDir, 'run.json'), null);
  if (!run) return { done: [], bad: [{ line: runDir, why: 'no run.json in that run dir' }] };
  if (run.dirty) return { done: [], bad: [{ line: runDir, why: 'the run was filmed from a dirty tree (MEASUREMENT RULE: film at a commit from a clean tree)' }] };
  const accPath = path.join(ACCEPTED, 'accepted.json');
  const accepted = existsSync(accPath) ? JSON.parse(readFileSync(accPath, 'utf8')) : {};
  const at = new Date().toISOString(), date = today();
  const done = [], bad = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const s = raw.trim();
    if (!s || s.startsWith('#')) continue;
    const m = /^(F\d\d(?:-[a-z]+)?)\s*[:\-–]\s*(.+)$/i.exec(s);
    if (!m) { bad.push({ line: s, why: 'not "<frame>: <reason>"' }); continue; }
    const id = m[1].toUpperCase().replace(/-([A-Z]+)$/, (x, k) => '-' + k.toLowerCase()), reason = m[2].trim();
    if (ids && !ids.has(id)) { bad.push({ line: s, why: `no frame ${id} in the set` }); continue; }
    const prior = accepted[id];
    if (!prior) { bad.push({ line: s, why: 'not an accepted frame: nothing to re-anchor' }); continue; }
    if (!prior.provisional) { bad.push({ line: s, why: `Kevin accepted it on ${prior.date}; only his word re-anchors it` }); continue; }
    const fr = (run.frames || []).find((x) => x.id === id && (x.repeat || 1) === pick);
    const src = fr?.ok && fr.file ? path.join(runDir, fr.file) : null;
    if (!src || !existsSync(src)) { bad.push({ line: s, why: `that run has no filmed repeat ${pick} of ${id}` }); continue; }
    if (!dry) {
      mkdirSync(path.join(ACCEPTED, 'withdrawn'), { recursive: true });
      const pic = path.join(ACCEPTED, `${id}.png`);
      if (existsSync(pic)) renameSync(pic, path.join(ACCEPTED, 'withdrawn', `${id}-${at.replace(/[:.]/g, '')}-${prior.commit}.png`));
      copyFileSync(src, pic);
      accepted[id] = { ...prior, date, commit: run.commit, run: path.basename(runDir), at,
        note: `RE-ANCHORED (${reason}); the picture is repeat ${pick} (${fr.file}) of run ${path.basename(runDir)} at ${run.commit}; the anchor at ${prior.commit} is in accepted/withdrawn/. Provisional status and pages unchanged. Earlier: ${prior.note || ''}` };
    }
    done.push({ id, reason, file: fr.file, from: prior.commit, to: run.commit });
  }
  if (!dry && done.length) {
    writeFileSync(accPath, JSON.stringify(accepted, null, 1));
    appendFileSync(path.join(REVIEW, 'answers.log'), done.map((a) => `${at}\t${date}\t${run.commit}\t${a.id}\treanchor\t${a.reason}\t${path.basename(runDir)}`).join('\n') + '\n');
    writeMirror(accepted);
  }
  return { done, bad };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--reanchor')) {
  const args = process.argv.slice(2);
  const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const runDir = path.resolve(flag('--reanchor'));
  const dry = args.includes('--dry-run');
  const { done, bad } = reanchor(runDir, readFileSync(0, 'utf8'), { pick: Number(flag('--pick') || 2), dry, ids: new Set(loadFrameSet().frames.map((f) => f.id)) });
  console.log(`reanchor${dry ? ' (dry run)' : ''}: ${done.length} re-anchored on ${path.basename(runDir)}`);
  for (const a of done) console.log(`  ${a.id}: ${a.from} -> ${a.to} (${a.file})`);
  for (const b of bad) console.log(`  NOT APPLIED "${b.line}": ${b.why}`);
  if (bad.length) process.exitCode = 1;
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const date = flag('--date') || today();
  const dry = args.includes('--dry-run');
  const file = args.find((a, i) => !a.startsWith('--') && !['--date', '--page', '--prev'].includes(args[i - 1]));
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
  const page = pageOf(dir);
  if (!page) { console.error(`answers: no review page at ${dir}`); process.exit(2); }
  const prevDir = flag('--prev') ? path.resolve(flag('--prev')) : null;
  const prevPage = prevDir ? pageOf(prevDir) : null;
  if (prevDir && !prevPage) { console.error(`answers: no review page at ${prevDir}`); process.exit(2); }
  const judgeNow = page.run ? readJson(path.join(page.run, 'judge.json'), null) : null;
  const judgePrev = prevPage?.run ? readJson(path.join(prevPage.run, 'judge.json'), null) : null;
  const at = new Date().toISOString();
  const accPath = path.join(ACCEPTED, 'accepted.json');
  const accepted = existsSync(accPath) ? JSON.parse(readFileSync(accPath, 'utf8')) : {};
  const done = [], marks = [];
  const freeze = (a, fr, provisional) => {
    mkdirSync(ACCEPTED, { recursive: true });
    copyFileSync(fr.src, path.join(ACCEPTED, `${a.id}.png`));
    accepted[a.id] = { date: page.date || date, commit: page.commit, run: path.basename(page.run), at, provisional, note: a.note || null,
      ...(provisional ? { rule: 'PROCESS §4 two-page rule', pages: [prevPage && path.basename(prevPage.run), path.basename(page.run)].filter(Boolean) } : {}) };
  };
  for (const a of ok) {
    const fr = page.frames.find((x) => x.id === a.id);
    const prior = accepted[a.id];
    if (a.verdict === 'accept' || a.verdict === 'provisional') {
      if (page.placeholder) { bad.push({ line: `${a.id} ${a.verdict}`, why: 'this page shows placeholders, not a film run' }); continue; }
      if (!fr?.ok || !fr.src || !existsSync(fr.src)) { bad.push({ line: `${a.id} ${a.verdict}`, why: 'that frame has no filmed picture on this page' }); continue; }
    }
    if (a.verdict === 'provisional') {
      if (!a.note) { bad.push({ line: `${a.id} provisional`, why: 'a provisional acceptance needs its sentence (why the rule holds, the written target included)' }); continue; }
      if (prior && !prior.provisional) { bad.push({ line: `${a.id} provisional`, why: `Kevin accepted it on ${prior.date}; his word stands` }); continue; }
      const now = judgeHolds(judgeNow, a.id), prev = prevPage ? judgeHolds(judgePrev, a.id) : null;
      if (now || prev) { bad.push({ line: `${a.id} provisional`, why: [now && `this page: ${now}`, prev && `--prev page: ${prev}`].filter(Boolean).join('; ') }); continue; }
      if (!dry) {
        freeze(a, fr, true);
        marks.push([a.id, `PROVISIONALLY ACCEPTED (two-page rule: no answer on two pages running; the judge closer or same on all four points on both; originality passes). This frame is now the anchor. One word from you overrides it. ${a.note}`]);
      }
    } else if (a.verdict === 'accept') {
      if (!dry) { freeze(a, fr, false); marks.push([a.id, null]); }
    } else if (prior?.provisional) {
      // Kevin's closer or wrong overrides a provisional acceptance: the anchor goes back to the anchor run
      if (!dry) {
        const pic = path.join(ACCEPTED, `${a.id}.png`);
        if (existsSync(pic)) { mkdirSync(path.join(ACCEPTED, 'withdrawn'), { recursive: true }); renameSync(pic, path.join(ACCEPTED, 'withdrawn', `${a.id}-${at.replace(/[:.]/g, '')}.png`)); }
        delete accepted[a.id];
        marks.push([a.id, null]);
      }
      console.log(`  ${a.id}: Kevin's "${a.verdict}" withdraws the provisional acceptance of ${prior.date} at ${prior.commit}`);
    }
    done.push({ ...a, by: a.verdict === 'provisional' ? 'orchestrator (two-page rule)' : 'reviewer' });
  }
  if (!dry) {
    const prevAnswers = readJson(path.join(dir, 'answers.json'), { answers: {} });
    for (const a of done) prevAnswers.answers[a.id] = { verdict: a.verdict, note: a.note, at, by: a.by };
    writeFileSync(path.join(dir, 'answers.json'), JSON.stringify(prevAnswers, null, 1));
    writeFileSync(accPath, JSON.stringify(accepted, null, 1));
    appendFileSync(path.join(REVIEW, 'answers.log'), done.map((a) => `${at}\t${page.date || date}\t${page.commit}\t${a.id}\t${a.verdict}\t${a.note}\t${path.basename(page.run || '')}`).join('\n') + (done.length ? '\n' : ''));
    for (const [id, line] of marks) if (!markPage(dir, id, line) && line) console.log(`  ${id}: could not mark the page (no section for it in ${path.join(dir, 'index.html')})`);
    writeMirror(accepted);
  }
  const n = (v) => done.filter((a) => a.verdict === v).length;
  console.log(`answers ${page.date || date}${dry ? ' (dry run)' : ''}: ${done.length} recorded`
    + ` (${n('accept')} accept, ${n('provisional')} provisional, ${n('closer')} closer, ${n('wrong')} wrong)`);
  for (const a of done.filter((x) => x.verdict === 'wrong')) console.log(`  direction ${a.id}: ${a.note || '(no sentence)'}`);
  for (const b of bad) console.log(`  NOT APPLIED "${b.line}": ${b.why}`);
  if (bad.length) process.exitCode = 1;
}
