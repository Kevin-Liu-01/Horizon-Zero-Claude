/**
 * Merge trials in scratch (pipeline lane, W0b fix round 5). Builds the state a merge of this tree with other
 * lanes' branches would produce, WITHOUT any git write and without touching the tree: the tree is cloned
 * (specs-fixture cloneTree: tracked + untracked-not-ignored, `cp -c` clones, node_modules symlinked), then each
 * branch's changes since its merge base with HEAD are laid over the copy, read with `git show` (read-only git).
 *
 * A path that only the branch changed is taken as the branch has it (deleted, added or modified). A path that
 * this tree (or an earlier overlay) also changed is resolved the way the plan's merge steps say:
 *   public/LICENSES.json   pipeline's side, then `tools/licences/fold.mjs --theirs <branch> --base <merge base>`
 *                          (merge step 2): a row-level three-way fold, never a text merge
 *   any other text file    `git merge-file -p <current> <base> <branch>` (git's own three-way merge, printed to
 *                          stdout; nothing in the repository is written). A conflict stops nothing but is
 *                          reported, and the path keeps the current side.
 *   deleted by the branch  deleted when the current copy still equals the base, else a conflict
 *
 *   overlayRefs({ root, copy, refs, scratch }) -> { refs: [{ ref, sha, base, added, modified, deleted, merged, folds, conflicts }] }
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';

const git = (args, cwd, enc = 'utf8', input = undefined) => execFileSync('git', args,
  { cwd, encoding: enc, maxBuffer: 256 * 2 ** 20, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], ...(input === undefined ? {} : { input }) });
const lines = (s) => String(s).split('\n').filter(Boolean);

/** Paths this tree changed since `base`: tracked edits and untracked-not-ignored new files. */
export function oursSince(root, base) {
  return new Set([...lines(git(['diff', '--name-only', '--no-renames', base], root)), ...lines(git(['ls-files', '-o', '--exclude-standard'], root))]);
}

/**
 * pipeline's removal-only edits to src/main.js (plan §1.2 grant, W0 exit), re-applied onto another lane's file
 * (docs/ROUND5-PIPELINE.md §5 step 1). Each edit must find its text exactly once, else nothing is applied. The
 * ?poc=human block is found by its structure (comment + `if (params.get('poc') === 'human')` + the
 * installPocHuman call), so this resolver names no POC folder path.
 */
function removeHumanBlock(lines) {
  const at = lines.map((l, i) => (l.trim().startsWith('// Round 5 human-pipeline proof (`?poc=human`)') ? i : -1)).filter((i) => i >= 0);
  if (at.length !== 1) return { ok: false, why: `the ?poc=human block: its comment found ${at.length} times (want 1)` };
  const i = at[0];
  const shape = [/^ {4}\/\/ /, /^ {4}\/\/ /, /^ {4}if \(params\.get\('poc'\) === 'human'\) \{$/, /^ {6}const \{ installPocHuman \} = await import\(.*pocHuman\.js'\);$/,
    /^ {6}await installPocHuman\(ctx\);$/, /^ {4}\}$/];
  for (let k = 0; k < shape.length; k++) if (!shape[k].test(lines[i + 1 + k] ?? '')) return { ok: false, why: `the ?poc=human block: line ${i + 2 + k} is not the expected shape` };
  lines.splice(i, 1 + shape.length);
  return { ok: true };
}
export const POC_REMOVAL_EDITS = [
  { what: 'the ?poc=creature comment line', from: ' * `?poc=creature` stages a generated creature in the running game,\n', to: '' },
  { what: 'the creature flag', from: "['creature', 'biome'].includes(", to: "['biome'].includes(" },
];
export function reapplyPocRemoval(text) {
  for (const e of POC_REMOVAL_EDITS) {
    const n = text.split(e.from).length - 1;
    if (n !== 1) return { ok: false, why: `${e.what}: found ${n} times (want 1)` };
  }
  const lines = text.split('\n');
  const h = removeHumanBlock(lines);
  if (!h.ok) return h;
  let out = lines.join('\n');
  for (const e of POC_REMOVAL_EDITS) out = out.replace(e.from, () => e.to);
  return { ok: true, text: out, applied: POC_REMOVAL_EDITS.length + 1 };
}
const RESOLVERS = { 'src/main.js': reapplyPocRemoval };

export function overlayRefs({ root, copy, refs, scratch }) {
  const touched = new Map();                       // path -> who changed it last ('pipeline' or a ref)
  const out = [];
  const tmp = path.join(scratch, `merge-overlay-${process.pid}`);
  mkdirSync(tmp, { recursive: true });
  try {
    for (const ref of refs) {
      const sha = git(['rev-parse', ref], root).trim();
      const base = git(['merge-base', 'HEAD', sha], root).trim();
      for (const f of oursSince(root, base)) if (!touched.has(f)) touched.set(f, 'pipeline');
      const rec = { ref, sha: sha.slice(0, 10), base: base.slice(0, 10), added: 0, modified: 0, deleted: 0, merged: [], folds: [], conflicts: [] };
      const theirs = lines(git(['diff', '--name-status', '--no-renames', base, sha], root)).map((l) => l.split('\t'));
      for (const [st, f] of theirs) {
        const dst = path.join(copy, f);
        const prev = touched.get(f);
        if (!prev) {
          if (st === 'D') { rmSync(dst, { force: true }); rec.deleted += 1; } else {
            mkdirSync(path.dirname(dst), { recursive: true });
            writeFileSync(dst, git(['show', `${sha}:${f}`], root, 'buffer'));
            rec[st === 'A' ? 'added' : 'modified'] += 1;
          }
          touched.set(f, ref);
          continue;
        }
        if (f === 'public/LICENSES.json') {
          const t = path.join(tmp, 'theirs.json'), b = path.join(tmp, 'base.json');
          writeFileSync(t, git(['show', `${sha}:${f}`], root, 'buffer'));
          writeFileSync(b, git(['show', `${base}:${f}`], root, 'buffer'));
          let fold;
          try {
            fold = JSON.parse(execFileSync(process.execPath, [path.join(copy, 'tools/licences/fold.mjs'), '--theirs', t, '--base', b, '--root', copy, '--write'],
              { cwd: copy, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').pop());
          } catch (e) {
            try { fold = JSON.parse(String(e.stdout || '').trim().split('\n').pop()); } catch { fold = { ok: false, error: String(e.stderr || e.message).slice(0, 300) }; }
          }
          rec.folds.push({ path: f, with: prev, ok: fold.ok, rows: fold.rows, added: fold.added, derived: (fold.derived || []).map((d) => d.id), deleted: fold.deleted, conflicts: fold.conflicts, invalid: fold.invalid, error: fold.error });
          if (!fold.ok) rec.conflicts.push({ path: f, with: prev, why: 'LICENSES.json fold refused' });
          touched.set(f, ref);
          continue;
        }
        if (st === 'D') {
          const baseBuf = git(['show', `${base}:${f}`], root, 'buffer');
          if (existsSync(dst) && readFileSync(dst).equals(baseBuf)) { rmSync(dst); rec.deleted += 1; touched.set(f, ref); } else rec.conflicts.push({ path: f, with: prev, why: 'deleted by the branch, changed here' });
          continue;
        }
        if (!existsSync(dst)) { rec.conflicts.push({ path: f, with: prev, why: 'changed by the branch, deleted here' }); continue; }
        const cur = path.join(tmp, 'current'), bse = path.join(tmp, 'base'), thr = path.join(tmp, 'theirs');
        writeFileSync(cur, readFileSync(dst));
        writeFileSync(thr, git(['show', `${sha}:${f}`], root, 'buffer'));
        let baseOk = true;
        try { writeFileSync(bse, git(['show', `${base}:${f}`], root, 'buffer')); } catch { writeFileSync(bse, ''); baseOk = false; }
        if (readFileSync(cur).equals(readFileSync(thr))) { rec.merged.push({ path: f, with: prev, how: 'identical' }); continue; }
        try {
          const merged = execFileSync('git', ['merge-file', '-p', '-L', prev, '-L', 'base', '-L', ref, cur, bse, thr], { encoding: 'buffer', maxBuffer: 64 * 2 ** 20, stdio: ['ignore', 'pipe', 'pipe'] });
          writeFileSync(dst, merged);
          rec.merged.push({ path: f, with: prev, how: baseOk ? 'merge-file' : 'merge-file (added on both sides)' });
          touched.set(f, ref);
        } catch (e) {
          // merge step 1: src/main.js = the branch's file with pipeline's removal-only edits re-applied
          const resolver = prev === 'pipeline' ? RESOLVERS[f] : null;
          const r = resolver ? resolver(readFileSync(thr, 'utf8')) : null;
          if (r && r.ok) {
            writeFileSync(dst, r.text);
            rec.merged.push({ path: f, with: prev, how: `merge step 1: ${ref}'s file + pipeline's ${r.applied} removal-only edits (git merge-file: ${e.status} conflict)` });
            touched.set(f, ref);
          } else {
            rec.conflicts.push({ path: f, with: prev, why: `git merge-file: ${e.status} conflict(s)${r ? `; resolver: ${r.why}` : ''}; the current side is kept` });
          }
        }
      }
      out.push(rec);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return { refs: out };
}

/**
 * CLI (merge step 1 at the real merge, after git reports the src/main.js conflict):
 *   git show r5/w0b-brand:src/main.js | node tools/build/pipeline/merge-overlay.mjs --reapply-poc-removal > src/main.js
 * prints the branch's file with pipeline's three removal-only edits applied; exit 1 (nothing printed) when any
 * edit does not find its text exactly once.
 */
if (process.argv[1] && process.argv[1].endsWith('merge-overlay.mjs') && process.argv.includes('--reapply-poc-removal')) {
  const r = reapplyPocRemoval(readFileSync(0, 'utf8'));
  if (!r.ok) { process.stderr.write(`merge-overlay: ${r.why}\n`); process.exit(1); }
  process.stdout.write(r.text);
}
