/**
 * The review page: one static page per integration run, per frame "masked reference | today | last
 * accepted", with the answer written as plain text to type back (accept / closer / wrong).
 *
 *   node tools/frames/review.mjs                      page for the newest film run, dated today
 *   node tools/frames/review.mjs --run <run-dir>      a given run
 *   node tools/frames/review.mjs --placeholder        make a placeholder run (grey "film pending" frames) first
 *   node tools/frames/review.mjs --baseline           also make this run the baseline anchors (M0.5)
 *   node tools/frames/review.mjs --date 2026-11-14 --status "merged: ...|next: ..."
 *
 * Writes <review>/<date>/index.html with today/, anchor/, sheets/ (one image per frame: the same
 * sheet as an image) and answers.txt. Reference crops are linked from <review>/crops/. Nothing is
 * written inside the repo. Answers are recorded by tools/frames/answers.mjs.
 */
import sharp from 'sharp';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadFrameSet } from './frameset.mjs';
import { ACCEPTED, BASELINE, CROPS, REVIEW, RUNS, assertOutsideRepo, today } from './paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const POINTS = ['silhouette and proportion', 'material and surface', 'light and colour', 'finish'];
const POINT_KEYS = ['silhouette', 'material', 'light', 'finish'];

function readJson(file, dflt = null) { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return dflt; } }

export function newestRun() {
  if (!existsSync(RUNS)) return null;
  const dirs = readdirSync(RUNS).map((d) => path.join(RUNS, d)).filter((d) => existsSync(path.join(d, 'run.json')));
  dirs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return dirs[0] || null;
}

/** A grey 1600 x 900 frame that says it is a placeholder, for testing the page without a film. */
export async function makePlaceholderRun(set) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  let commit = 'unknown';
  try { commit = execFileSync('git', ['-C', REPO, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* */ }
  const dir = path.join(RUNS, `${stamp}-${commit}-placeholder`);
  mkdirSync(dir, { recursive: true });
  const frames = [];
  for (const f of set.frames) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#3a3a40"/>`
      + `<text x="800" y="420" font-family="Helvetica, Arial" font-size="96" fill="#d8d2c4" text-anchor="middle">${esc(f.id)}</text>`
      + `<text x="800" y="500" font-family="Helvetica, Arial" font-size="34" fill="#a8a296" text-anchor="middle">PLACEHOLDER: film pending</text>`
      + `<text x="800" y="550" font-family="Helvetica, Arial" font-size="24" fill="#8a8478" text-anchor="middle">${esc(f.subject)}</text></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(dir, `${f.id}.png`));
    frames.push({ id: f.id, file: `${f.id}.png`, ok: true, placeholder: true, standIns: ['placeholder image: no film run yet'], measured: {} });
  }
  writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ placeholder: true, commit, startedAt: new Date().toISOString(), frameset: set.sha256, frames }, null, 1));
  return dir;
}

/** One frame's sheet as an image: reference | today | anchor, labelled. */
async function sheet(out, cells) {
  const W = 640, H = 360, LAB = 34, GAP = 8;
  const comps = [];
  let x = 0;
  for (const c of cells) {
    let img;
    if (c.file && existsSync(c.file)) img = await sharp(c.file).resize(W, H, { fit: 'contain', background: '#16161a' }).toBuffer();
    else {
      const words = String(c.text || 'none').slice(0, 600).split(/\s+/);
      const lines = []; let cur = '';
      for (const w of words) { if ((cur + ' ' + w).length > 54) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }
      if (cur) lines.push(cur);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#202026"/>`
        + lines.slice(0, 13).map((l, i) => `<text x="20" y="${40 + i * 24}" font-family="Helvetica, Arial" font-size="18" fill="#d8d2c4">${esc(l)}</text>`).join('') + '</svg>';
      img = await sharp(Buffer.from(svg)).png().toBuffer();
    }
    const lab = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LAB}"><rect width="${W}" height="${LAB}" fill="#101014"/>`
      + `<text x="10" y="23" font-family="Helvetica, Arial" font-size="17" fill="#efe6d5">${esc(c.label)}</text></svg>`;
    comps.push({ input: Buffer.from(lab), left: x, top: 0 }, { input: img, left: x, top: LAB });
    x += W + GAP;
  }
  await sharp({ create: { width: x - GAP, height: H + LAB, channels: 3, background: '#16161a' } }).composite(comps).jpeg({ quality: 86 }).toFile(out);
}

export async function buildReview({ runDir, date = today(), status = '', setBaseline = false } = {}) {
  assertOutsideRepo(REVIEW, REPO);
  const set = loadFrameSet();
  const run = readJson(path.join(runDir, 'run.json'));
  if (!run) throw new Error(`no run.json in ${runDir}`);
  const cropMan = readJson(path.join(CROPS, 'manifest.json'), { crops: {}, texts: {} });
  const accepted = readJson(path.join(ACCEPTED, 'accepted.json'), {});
  const judge = readJson(path.join(runDir, 'judge.json'), {});
  const out = path.join(REVIEW, date);
  for (const d of ['today', 'anchor', 'sheets']) mkdirSync(path.join(out, d), { recursive: true });

  if (setBaseline && !run.placeholder) {
    mkdirSync(BASELINE, { recursive: true });
    for (const fr of run.frames) if (fr.ok && existsSync(path.join(runDir, fr.file))) copyFileSync(path.join(runDir, fr.file), path.join(BASELINE, `${fr.id}.png`));
    writeFileSync(path.join(BASELINE, 'baseline.json'), JSON.stringify({ run: path.basename(runDir), commit: run.commit, at: new Date().toISOString() }, null, 1));
  }
  const baseline = readJson(path.join(BASELINE, 'baseline.json'), null);

  const rows = [];
  for (const f of set.frames) {
    const fr = run.frames.find((x) => x.id === f.id) || { id: f.id, ok: false, error: 'not filmed in this run' };
    // today
    let todayRel = null;
    const src = fr.file && path.join(runDir, fr.file);
    if (fr.ok && src && existsSync(src)) {
      todayRel = `today/${f.id}.jpg`;
      await sharp(src).resize(1600, 900, { fit: 'inside' }).jpeg({ quality: 90 }).toFile(path.join(out, todayRel));
    }
    // anchor: last accepted, else the baseline
    let anchorRel = null, anchorLabel = 'no anchor yet (no accepted frame, no baseline)';
    const acc = accepted[f.id];
    const accFile = path.join(ACCEPTED, `${f.id}.png`), baseFile = path.join(BASELINE, `${f.id}.png`);
    if (acc && existsSync(accFile)) { anchorRel = `anchor/${f.id}.jpg`; anchorLabel = `accepted ${acc.date}${acc.provisional ? ' (provisional, two-page rule)' : ''} at ${acc.commit || '?'}`; await sharp(accFile).jpeg({ quality: 90 }).toFile(path.join(out, anchorRel)); }
    else if (existsSync(baseFile)) { anchorRel = `anchor/${f.id}.jpg`; anchorLabel = `baseline ${baseline?.commit || ''} (not accepted yet)`; await sharp(baseFile).jpeg({ quality: 90 }).toFile(path.join(out, anchorRel)); }
    // reference
    const refs = (f.ref?.crops || []).map((id) => ({ id, rel: `../crops/${id}.png`, abs: path.join(CROPS, `${id}.png`), note: cropMan.crops?.[id]?.judgeNote || null, masked: (cropMan.crops?.[id]?.masks || 0) > 0 }));
    const textRef = f.ref?.text ? (cropMan.texts?.[f.ref.text]?.text || `(worded reference ${f.ref.text} not found)`) : null;
    const j = judge[f.id] || null;
    const further = j && POINT_KEYS.some((k) => j.points?.[k] === 'further');
    const primary = refs.find((r) => existsSync(r.abs));
    await sheet(path.join(out, 'sheets', `${f.id}.jpg`), [
      { label: `${f.id} reference${primary ? ` (${primary.id}${primary.masked ? ', masked' : ''})` : ''}`, file: primary?.abs, text: textRef || f.ref?.written || (f.ref?.measured ? 'Measured only: ' + f.ref.measured.join('; ') : f.ref?.bar) },
      { label: `${f.id} today`, file: src && fr.ok ? src : null, text: fr.error || 'not filmed' },
      { label: `${f.id} ${anchorRel ? anchorLabel : 'no anchor yet'}`, file: anchorRel ? path.join(out, anchorRel) : null, text: 'no anchor yet' },
    ]);
    rows.push({ f, fr, todayRel, anchorRel, anchorLabel, refs, textRef, j, further });
  }
  rows.sort((a, b) => (b.further ? 1 : 0) - (a.further ? 1 : 0));

  const answersTxt = [
    `# CALIMA review ${date}, run ${path.basename(runDir)} at ${run.commit || '?'}`,
    '# One line per frame you want to answer: <frame> accept | closer | wrong[: one sentence]. Blank lines and # lines are ignored.',
    ...rows.map((r) => `${r.f.id} `),
  ].join('\n') + '\n';
  writeFileSync(path.join(out, 'answers.txt'), answersTxt);
  writeFileSync(path.join(out, 'page.json'), JSON.stringify({ date, run: runDir, commit: run.commit, placeholder: !!run.placeholder, frameset: set.sha256, frames: rows.map((r) => ({ id: r.f.id, today: r.todayRel, src: r.fr.file ? path.join(runDir, r.fr.file) : null, ok: !!r.fr.ok })) }, null, 1));

  const [st1, st2] = String(status || '').split('|');
  const card = (r) => {
    const f = r.f, fr = r.fr, m = fr.measured || {};
    const refHtml = r.refs.length
      ? r.refs.map((c) => `<figure><img src="${esc(c.rel)}" alt="${esc(c.id)}" loading="lazy"><figcaption>${esc(c.id)}${c.masked ? ' · masked' : ''}${c.note ? `<br><span class="note">${esc(c.note)}</span>` : ''}</figcaption></figure>`).join('')
      : '';
    const words = [
      r.textRef && `<p class="target"><b>Worded reference.</b> ${esc(r.textRef)}</p>`,
      f.ref?.written && `<p class="target"><b>Written target.</b> ${esc(f.ref.written)}</p>`,
      f.ref?.measured && `<p class="target"><b>Measured.</b> ${esc(f.ref.measured.join(' · '))}</p>`,
      f.ref?.bar && `<p class="target"><b>Bar.</b> ${esc(f.ref.bar)}</p>`,
    ].filter(Boolean).join('');
    const judgeHtml = r.j
      ? `<table class="judge">${POINT_KEYS.map((k, i) => `<tr class="${esc(r.j.points?.[k])}"><td>${POINTS[i]}</td><td>${esc(r.j.points?.[k] || '-')}</td><td>${esc(r.j.why?.[k] || '')}</td></tr>`).join('')}</table>`
        + (r.j.originality ? `<p class="orig">originality checklist: ${r.j.originality.pass ? 'pass' : 'FAIL: ' + esc((r.j.originality.fails || []).join('; '))}</p>` : '')
      : '<p class="dim">judge: not run for this page</p>';
    const meas = [
      m.frameMsMedian != null && `frame ${m.frameMsMedian} ms median, ${m.frameMsP95} ms p95`,
      m.calls != null && `${m.calls} draws`,
      m.triangles != null && `${(m.triangles / 1e6).toFixed(2)} M triangles`,
      m.meanLuminance != null && `mean luminance ${m.meanLuminance} %`,
    ].filter(Boolean).join(' · ');
    const stand = (fr.standIns || []).length ? `<ul class="stand">${fr.standIns.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : '';
    return `<section class="frame${r.further ? ' further' : ''}" id="${esc(f.id)}">
  <header><h2>${esc(f.id)} <span>${esc(f.subject)}</span></h2><div class="meta">${esc(f.in)} · ${String(f.hour).padStart(4, '0')} h · ${esc(f.weather)} · ${esc(f.camera.mode)}${f.camera.screen ? ' ' + esc(f.camera.screen) : ''} · ${esc(f.state?.pose || 'idle')}${r.further ? ' · <b class="bad">FURTHER on a point</b>' : ''}</div></header>
  <div class="cols">
    <div class="col"><h3>reference</h3>${refHtml}${words}</div>
    <div class="col"><h3>today</h3>${r.todayRel ? `<a href="${esc(r.todayRel)}"><img src="${esc(r.todayRel)}" alt="today" loading="lazy"></a>` : `<div class="empty">${esc(fr.error || 'not filmed')}</div>`}<p class="dim">${esc(meas)}</p>${stand}</div>
    <div class="col"><h3>last accepted</h3>${r.anchorRel ? `<a href="${esc(r.anchorRel)}"><img src="${esc(r.anchorRel)}" alt="anchor" loading="lazy"></a>` : '<div class="empty">no anchor yet</div>'}<p class="dim">${esc(r.anchorLabel)}</p></div>
  </div>
  ${judgeHtml}
  <div class="answer" data-id="${esc(f.id)}">
    <label><input type="radio" name="a-${esc(f.id)}" value="accept"> accept</label>
    <label><input type="radio" name="a-${esc(f.id)}" value="closer"> closer</label>
    <label><input type="radio" name="a-${esc(f.id)}" value="wrong"> wrong</label>
    <input type="text" class="why" placeholder="one sentence (optional; what is wrong becomes the next direction)">
  </div>
</section>`;
  };
  const filmed = rows.filter((r) => r.todayRel).length;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CALIMA review ${esc(date)}</title>
<style>
:root{color-scheme:dark}body{margin:0;background:#141418;color:#e9e3d6;font:15px/1.45 -apple-system,Helvetica,Arial,sans-serif}
main{max-width:1680px;margin:0 auto;padding:20px 24px 80px}h1{font-weight:400;letter-spacing:.06em;margin:0 0 4px}
.status p{margin:2px 0;color:#c9c1b0}.banner{background:#5a3b1d;color:#ffe7c2;padding:10px 14px;border-radius:6px;margin:12px 0}
.how{background:#1d1d23;border:1px solid #2c2c35;border-radius:8px;padding:12px 16px;margin:14px 0}
code,pre,textarea{font:13px/1.4 ui-monospace,Menlo,monospace}textarea{width:100%;height:150px;background:#0f0f12;color:#e9e3d6;border:1px solid #333;border-radius:6px;padding:8px;box-sizing:border-box}
button{background:#3b3550;color:#fff;border:0;border-radius:6px;padding:7px 14px;font-size:14px;cursor:pointer}
.frame{border-top:1px solid #2c2c35;padding:16px 0 10px}.frame.further{border-left:4px solid #c0392b;padding-left:12px}
.frame h2{margin:0;font-size:20px;font-weight:500}.frame h2 span{color:#c9c1b0;font-weight:400;margin-left:8px}.meta{color:#8f8878;font-size:13px}
.cols{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:10px}.col h3{margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8f8878}
.col img{width:100%;display:block;border-radius:4px;background:#000}figure{margin:0 0 8px}figcaption{font-size:12px;color:#8f8878}.note{color:#b8a98a}
.empty{aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:#1d1d23;border-radius:4px;color:#8f8878;text-align:center;padding:10px}
.target{font-size:13px;color:#d6cdb9;margin:6px 0}.dim{color:#8f8878;font-size:12px;margin:6px 0}.stand{font-size:12px;color:#e0b070;margin:4px 0 0;padding-left:18px}
.judge{font-size:13px;border-collapse:collapse;margin-top:8px}.judge td{padding:2px 10px 2px 0}.judge tr.further td:nth-child(2){color:#ff7b6b}.judge tr.closer td:nth-child(2){color:#8fd18f}
.answer{margin-top:10px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}.answer .why{flex:1;min-width:280px;background:#0f0f12;color:#e9e3d6;border:1px solid #333;border-radius:6px;padding:6px 8px}
.bad{color:#ff7b6b}@media(max-width:1000px){.cols{grid-template-columns:1fr}}
</style></head><body><main>
<h1>CALIMA · Frame Set review · ${esc(date)}</h1>
<div class="status"><p>${esc(st1 || `run ${path.basename(runDir)} at ${run.commit || '?'}; ${filmed} of ${rows.length} frames filmed${run.chromeSeconds ? `, ${run.chromeSeconds} s of Chrome` : ''}`)}</p><p>${esc(st2 || `frame set ${set.sha256.slice(0, 12)}; frames that got further on a point come first`)}</p></div>
${run.placeholder ? '<div class="banner">PLACEHOLDER PAGE: no film run yet. The "today" column shows grey placeholders; the filmed page replaces this one.</div>' : ''}
<div class="how"><b>How to answer.</b> For each frame, one word: <b>accept</b> (freezes today as the anchor), <b>closer</b>, or <b>wrong</b> plus a sentence (it becomes the next direction). Pick below and copy the text, or type the same lines yourself, e.g.<pre>F02 closer
F08 accept
F05 wrong: the stacks still read as cylinders</pre>
<textarea id="answers" spellcheck="false" placeholder="your answers appear here as you pick"></textarea>
<p><button id="copy">Copy answers</button> <span id="copied" class="dim"></span></p>
<p class="dim">Recorded with: <code>node tools/frames/answers.mjs --date ${esc(date)} &lt;answers.txt</code>. Silence on two pages running lets the judge's comparison stand, provisionally.</p></div>
${rows.map(card).join('\n')}
</main>
<script>
const ta=document.getElementById('answers');
function build(){const L=[];document.querySelectorAll('.answer').forEach(a=>{const v=a.querySelector('input[type=radio]:checked');if(!v)return;const w=a.querySelector('.why').value.trim();L.push(a.dataset.id+' '+v.value+(w?': '+w:''));});ta.value=L.join('\\n');}
document.querySelectorAll('.answer input').forEach(i=>i.addEventListener('input',build));
document.getElementById('copy').onclick=async()=>{build();try{await navigator.clipboard.writeText(ta.value);document.getElementById('copied').textContent='copied';}catch(e){ta.select();document.execCommand('copy');document.getElementById('copied').textContent='copied';}};
</script></body></html>`;
  writeFileSync(path.join(out, 'index.html'), html);
  return { page: path.join(out, 'index.html'), frames: rows.length, filmed, placeholder: !!run.placeholder };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const set = loadFrameSet();
  let runDir = flag('--run');
  if (args.includes('--placeholder')) runDir = await makePlaceholderRun(set);
  runDir = runDir || newestRun();
  if (!runDir) { console.error('review: no film run yet (use --placeholder to test the page)'); process.exit(2); }
  const r = await buildReview({ runDir: path.resolve(runDir), date: flag('--date') || today(), status: flag('--status') || '', setBaseline: args.includes('--baseline') });
  console.log(`review: ${r.page} (${r.filmed}/${r.frames} frames with a picture${r.placeholder ? ', PLACEHOLDER' : ''})`);
}
