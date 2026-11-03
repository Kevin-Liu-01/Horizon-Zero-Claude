/**
 * R39 — the hero asset swap (pipeline lane, W0b fix round 5; plan §8.3 R39).
 *
 * "The orchestrator merges pipeline's SPECS.hero swap (/models/hero/brea.glb and
 *  the hero outfit, stow-kit and UAL2 rows) in the same merge window as
 *  hero-body's aloy.glb deletion, pipeline first; A-assets-tracked is graded on
 *  main after both."
 *
 * The swap cannot sit in this branch's `src/core/assets.specs.js` while the
 * branch is graded on its own: Brea's GLBs are hero-body's files, so a
 * `required` hero row pointing at them would break every boot in this tree.
 * It ships as ONE data patch that the orchestrator applies in the R39 window,
 * before hero-body's merge (pipeline first), and verifies after both merges:
 *
 *   node tools/build/pipeline/hero-swap.mjs --write  [--root <tree>]   apply (idempotent), validate, print JSON
 *   node tools/build/pipeline/hero-swap.mjs --check  [--root <tree>]   dry run: what --write would change (exit 0)
 *   node tools/build/pipeline/hero-swap.mjs --verify [--root <tree>] [--scratch <dir>]
 *        after BOTH merges: patch applied, the four files present, each matched by exactly one non-IP
 *        LICENSES.json row, aloy.glb gone, none of the four git-ignored, hero-body's rows.js a proven no-op;
 *        exit 1 otherwise
 *   node tools/build/pipeline/hero-swap.mjs --trial --scratch <dir> [--hero-ref r5/w0b-hero-body] [--shot <png>]
 *        the R39 merge trial in scratch (no git write, nothing written into the tree): clone this tree,
 *        overlay hero-body's branch (read with `git show`), fold LICENSES.json, --write, --verify, then
 *        boot the copy in ONE headless Chrome (specs-fixture serveAndRun) and run A1, A20b,
 *        A-pipeline-boot-rows, the hero-rows check (filmed) and A-human-bind (advisory: an unsealed trial
 *        never grades A-human-bind; the orchestrator's sealed run on the merged tree does)
 *
 * What the patch changes (exactly; anything else in either file is refused):
 *   src/core/assets.specs.js   SPECS.hero -> Brea; + SPECS.heroOutfitPan1, SPECS.heroStowKit; + ANIMS.heroUal2
 *                              (the rows hero-body's src/hero/rows.js adds at module evaluation today, value for
 *                              value, so its applyHeroRows() becomes a no-op — proven by `rowsNoop`)
 *   tools/licences/lib.mjs     the SCHEDULED_IP entry for public/models/aloy.glb (its file goes in the same window)
 */
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, realpathSync,
} from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../..');
export const SPECS_FILE = 'src/core/assets.specs.js';
export const LIB_FILE = 'tools/licences/lib.mjs';
export const ROWS_FILE = 'src/hero/rows.js';
export const ALOY = 'public/models/aloy.glb';
export const HERO_REF = 'r5/w0b-hero-body';

/** The rows, value for value (hero-body's HERO_ROWS / HERO_ANIMS, src/hero/rows.js at 8544703). */
export const HERO_SWAP = Object.freeze({
  specs: {
    hero: { url: '/models/hero/brea.glb', targetHeight: 1.77913, yaw: 0, required: true },
    heroOutfitPan1: { url: '/models/hero/outfit-pan-1.glb', targetHeight: 1.72, yaw: 0 },
    heroStowKit: { url: '/models/hero/kit/stowkit-v0.glb', targetHeight: 1.72, yaw: 0 },
  },
  anims: { heroUal2: { url: '/models/hero/brea-clips-ual2.glb' } },
});
/** The four shipped files the rows name. */
export const HERO_FILES = [...Object.values(HERO_SWAP.specs), ...Object.values(HERO_SWAP.anims)].map((r) => `public${r.url}`);

// ------------------------------------------------------------------ text patches (pure)

const OLD_HERO = [
  '  // Kept Round-4 body until hero-body\'s W0b exit swaps the url to Brea',
  '  // (plan §6: aloy.glb is deleted at the W0 exit). yOffset: the skirt tassels',
  '  // hang below the soles, so bbox-min grounding would float her.',
  '  hero: { url: \'/models/aloy.glb\', targetHeight: 1.72, yaw: 0, yOffset: -0.055, required: true },',
].join('\n');
const NEW_HERO = [
  '  // Brea, the protagonist (hero-body W0b; swapped in the R39 merge window,',
  '  // plan §8.3). targetHeight makes her BODY 1.72 m: the GLB\'s bbox includes',
  '  // the hair (asset extras r5Hero).',
  '  hero: { url: \'/models/hero/brea.glb\', targetHeight: 1.77913, yaw: 0, required: true },',
  '  // Her default outfit (Pan Whites I, bible §3.9) and the merged stow kit:',
  '  // boot rows the Player equips synchronously. Never added to the scene:',
  '  // src/hero/{outfit,stowkit}.js bind clones of their meshes to her bones by',
  '  // name, so targetHeight is the body\'s. hero-body\'s rows (armory from W1).',
  '  heroOutfitPan1: { url: \'/models/hero/outfit-pan-1.glb\', targetHeight: 1.72, yaw: 0 },',
  '  heroStowKit: { url: \'/models/hero/kit/stowkit-v0.glb\', targetHeight: 1.72, yaw: 0 },',
].join('\n');
const OLD_ANIMS = [
  ' *   ual: Quaternius Universal Animation Library, CC0 — public/anims/LICENSE',
  ' */',
  'export const ANIMS = {',
  '  ual: { url: \'/anims/AnimationLibrary_Godot_Standard.gltf\' },',
  '};',
].join('\n');
const NEW_ANIMS = [
  ' *   ual: Quaternius Universal Animation Library, CC0 — public/anims/LICENSE',
  ' *   heroUal2: Brea\'s NATIVE clip pack (Quaternius UAL2 on the UBC skeleton,',
  ' *     CC0; no retarget, R15): climb, slide, consume, knockback',
  ' */',
  'export const ANIMS = {',
  '  ual: { url: \'/anims/AnimationLibrary_Godot_Standard.gltf\' },',
  '  heroUal2: { url: \'/models/hero/brea-clips-ual2.glb\' },',
  '};',
].join('\n');
const OLD_SCHEDULED = [
  '  \'public/models/aloy.glb\': {',
  '    delete_at: \'W0 exit\', owner: \'hero-body\', liveRow: \'hero\',',
  '    why: \'Round-4 hero body, kept until Brea passes the hero-body block (plan §6, R30)\',',
  '  },',
  '',
].join('\n');

const count = (text, needle) => text.split(needle).length - 1;

/** One replacement that must find `from` exactly once, or `to` exactly once (already applied). */
function replaceOnce(text, from, to, what) {
  const nFrom = count(text, from), nTo = to ? count(text, to) : 0;
  if (nFrom === 1 && nTo === 0) return { text: text.replace(from, () => to), state: 'applied' };
  if (nFrom === 0 && (to ? nTo === 1 : true)) return { text, state: 'already' };
  throw new Error(`${what}: expected the pre-swap block once (found ${nFrom}) or the post-swap block once (found ${nTo}); the file changed since the patch was written — refusing`);
}

/** assets.specs.js text -> swapped text. Pure; throws on an unexpected file. */
export function patchSpecsText(text) {
  const a = replaceOnce(text, OLD_HERO, NEW_HERO, `${SPECS_FILE} hero row`);
  const b = replaceOnce(a.text, OLD_ANIMS, NEW_ANIMS, `${SPECS_FILE} ANIMS`);
  return { text: b.text, hero: a.state, anims: b.state, changed: a.state === 'applied' || b.state === 'applied' };
}

/** lib.mjs text -> SCHEDULED_IP without aloy.glb. Pure; throws on an unexpected file. */
export function patchLibText(text) {
  if (count(text, OLD_SCHEDULED) === 1) return { text: text.replace(OLD_SCHEDULED, ''), scheduled: 'applied', changed: true };
  if (!/^\s*'public\/models\/aloy\.glb'\s*:/m.test(text)) return { text, scheduled: 'already', changed: false };
  throw new Error(`${LIB_FILE}: the SCHEDULED_IP entry for aloy.glb is not the block the patch removes — refusing`);
}

// ------------------------------------------------------------------ validation helpers

const json = (x) => JSON.stringify(x);
const sameRow = (a, b) => json(Object.entries(a || {}).sort()) === json(Object.entries(b || {}).sort());

/** Import a specs module from a scratch copy of `text` (never from the tree under edit). */
async function importSpecsText(text, scratch) {
  const dir = path.join(scratch, `hero-swap-specs-${process.pid}-${process.hrtime.bigint()}`);
  mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'assets.specs.mjs');
  writeFileSync(f, text);
  try { return await import(pathToFileURL(f).href); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** The patched specs carry exactly the swap rows and nothing else changed. */
async function validateSpecs(beforeText, afterText, scratch) {
  const before = await importSpecsText(beforeText, scratch);
  const after = await importSpecsText(afterText, scratch);
  const problems = [];
  for (const [k, row] of Object.entries(HERO_SWAP.specs)) if (!sameRow(after.SPECS[k], row)) problems.push(`SPECS.${k} = ${json(after.SPECS[k])}, want ${json(row)}`);
  for (const [k, row] of Object.entries(HERO_SWAP.anims)) if (!sameRow(after.ANIMS[k], row)) problems.push(`ANIMS.${k} = ${json(after.ANIMS[k])}, want ${json(row)}`);
  for (const k of Object.keys(before.SPECS)) if (!(k in HERO_SWAP.specs) && json(before.SPECS[k]) !== json(after.SPECS[k])) problems.push(`SPECS.${k} changed`);
  for (const k of Object.keys(after.SPECS)) if (!(k in HERO_SWAP.specs) && !(k in before.SPECS)) problems.push(`SPECS.${k} appeared`);
  for (const k of Object.keys(before.ANIMS)) if (!(k in HERO_SWAP.anims) && json(before.ANIMS[k]) !== json(after.ANIMS[k])) problems.push(`ANIMS.${k} changed`);
  if (json(before.DELETED) !== json(after.DELETED)) problems.push('DELETED changed');
  if (json(Object.keys(before).sort()) !== json(Object.keys(after).sort())) problems.push('the module exports changed');
  if (/^\s*import\s/m.test(afterText)) problems.push('the specs module imports something (not pure data)');
  return { ok: !problems.length, problems, rows: Object.keys(after.SPECS), anims: Object.keys(after.ANIMS) };
}

function syntaxOk(text, scratch) {
  const dir = path.join(scratch, `hero-swap-lib-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'lib.mjs');
  writeFileSync(f, text);
  try { execFileSync(process.execPath, ['--check', f], { stdio: ['ignore', 'pipe', 'pipe'] }); return { ok: true }; } catch (e) {
    return { ok: false, error: String(e.stderr || e.message).slice(0, 300) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const scratchOf = (s) => {
  const d = s || process.env.R5_SCRATCH || path.join(os.tmpdir(), 'calima-r5-scratch', 'pipeline');
  mkdirSync(d, { recursive: true });
  return realpathSync(d);
};

// ------------------------------------------------------------------ apply

/**
 * Apply (write) or dry-run the patch on `root`. Idempotent. Never writes a file whose patched form fails
 * validation. Returns { ok, write, changed: [files], specs, lib, validation, pendingFiles, problems }.
 * `pendingFiles` lists the four GLBs not in the tree yet: expected when the swap goes in first (R39).
 */
export async function applyHeroSwap({ root = ROOT, write = false, scratch = null } = {}) {
  const sc = scratchOf(scratch);
  const out = { ok: false, write, root, changed: [], problems: [] };
  try {
    const specsPath = path.join(root, SPECS_FILE), libPath = path.join(root, LIB_FILE);
    const specsBefore = readFileSync(specsPath, 'utf8'), libBefore = readFileSync(libPath, 'utf8');
    const s = patchSpecsText(specsBefore), l = patchLibText(libBefore);
    out.specs = { hero: s.hero, anims: s.anims };
    out.lib = { scheduledIpAloy: l.scheduled };
    // validate against the PRE-swap rows: when the patch is already applied, compare with the reverse patch
    const pre = s.changed ? specsBefore : specsBefore.replace(NEW_HERO, OLD_HERO).replace(NEW_ANIMS, OLD_ANIMS);
    out.validation = await validateSpecs(pre, s.text, sc);
    out.libSyntax = syntaxOk(l.text, sc);
    if (!out.validation.ok) out.problems.push(...out.validation.problems);
    if (!out.libSyntax.ok) out.problems.push(`${LIB_FILE} would not parse: ${out.libSyntax.error}`);
    if (!out.problems.length && write) {
      if (s.changed) { writeFileSync(specsPath, s.text); out.changed.push(SPECS_FILE); }
      if (l.changed) { writeFileSync(libPath, l.text); out.changed.push(LIB_FILE); }
    } else if (!write) {
      if (s.changed) out.changed.push(`${SPECS_FILE} (dry run)`);
      if (l.changed) out.changed.push(`${LIB_FILE} (dry run)`);
    }
    out.pendingFiles = HERO_FILES.filter((f) => !existsSync(path.join(root, f)));
    if (out.pendingFiles.length) out.note = `R39 "pipeline first": ${out.pendingFiles.length} hero file(s) arrive with hero-body's merge in the same window; run --verify after it`;
    out.ok = !out.problems.length;
  } catch (e) {
    out.problems.push(String(e?.message || e));
  }
  return out;
}

// ------------------------------------------------------------------ rows.js no-op proof

/**
 * hero-body's src/hero/rows.js mutates SPECS/ANIMS at module evaluation. After the swap it must change nothing.
 * Proof in scratch: rows.js (verbatim) next to a copy of the tree's specs and an assets.js shim exporting
 * clones of SPECS / ANIMS; import rows.js and compare both before/after. Negative control: the same with the
 * PRE-swap specs must show a change (otherwise the probe cannot see a mutation). Also compares the rows'
 * values with rows.js's own HERO_ROWS / HERO_ANIMS exports.
 */
export async function rowsNoop({ root = ROOT, scratch = null, specsText = null } = {}) {
  const sc = scratchOf(scratch);
  const rowsSrc = path.join(root, ROWS_FILE);
  if (!existsSync(rowsSrc)) return { ok: null, why: `${ROWS_FILE} not in this tree (hero-body's file)` };
  const run = async (text, tag) => {
    const dir = path.join(sc, `hero-rows-noop-${tag}-${process.pid}-${process.hrtime.bigint()}`);
    mkdirSync(path.join(dir, 'src/core'), { recursive: true });
    mkdirSync(path.join(dir, 'src/hero'), { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), '{ "type": "module" }\n');
    writeFileSync(path.join(dir, SPECS_FILE), text);
    writeFileSync(path.join(dir, 'src/core/assets.js'), [
      "import { SPECS as S, ANIMS as A } from './assets.specs.js';",
      'export const SPECS = JSON.parse(JSON.stringify(S));',
      'export const ANIMS = JSON.parse(JSON.stringify(A));',
    ].join('\n'));
    copyFileSync(rowsSrc, path.join(dir, ROWS_FILE));
    try {
      const core = await import(pathToFileURL(path.join(dir, SPECS_FILE)).href);
      const shim = await import(pathToFileURL(path.join(dir, 'src/core/assets.js')).href);
      const snap = () => json({ core: core.SPECS, coreAnims: core.ANIMS, specs: shim.SPECS, anims: shim.ANIMS });
      const before = snap();
      const rows = await import(pathToFileURL(path.join(dir, ROWS_FILE)).href);
      const after = snap();
      return { mutated: before !== after, heroRows: rows.HERO_ROWS ?? null, heroAnims: rows.HERO_ANIMS ?? null };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  try {
    const now = specsText ?? readFileSync(path.join(root, SPECS_FILE), 'utf8');
    const pre = now.replace(NEW_HERO, OLD_HERO).replace(NEW_ANIMS, OLD_ANIMS);
    const swapped = patchSpecsText(now).text;
    const post = await run(swapped, 'post');
    const control = await run(pre, 'pre');
    const valueProblems = [];
    for (const [k, row] of Object.entries(HERO_SWAP.specs)) if (!post.heroRows?.[k] || !sameRow(post.heroRows[k], row)) valueProblems.push(`rows.js HERO_ROWS.${k} = ${json(post.heroRows?.[k])}, patch ${json(row)}`);
    for (const [k, row] of Object.entries(HERO_SWAP.anims)) if (!post.heroAnims?.[k] || !sameRow(post.heroAnims[k], row)) valueProblems.push(`rows.js HERO_ANIMS.${k} = ${json(post.heroAnims?.[k])}, patch ${json(row)}`);
    const ok = !post.mutated && control.mutated && !valueProblems.length;
    return { ok, mutatesAfterSwap: post.mutated, negativeControl: { preSwapMutates: control.mutated, caught: control.mutated }, valueProblems,
      note: 'after the swap applyHeroRows() and the HERO_ANIMS loop change nothing: hero-body (armory from W1) removes them; HERO_ROWS / DEFAULT_OUTFIT stay (src/hero/index.js reads them)' };
  } catch (e) {
    return { ok: false, error: String(e?.stack || e).slice(0, 400) };
  }
}

// ------------------------------------------------------------------ verify (after both merges)

/** `git check-ignore` with this tree's rules (works on a non-repo copy too, by asking ROOT). */
function ignored(paths, cwd) {
  try {
    return execFileSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd, input: paths.join('\n'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).split('\n').filter(Boolean);
  } catch (e) {
    if (e.status === 1) return (e.stdout || '').split('\n').filter(Boolean);
    throw new Error(`git check-ignore failed (exit ${e.status}): ${String(e.stderr || e.message).trim().slice(0, 200)}`);
  }
}

export async function verifyHeroSwap({ root = ROOT, scratch = null, rulesRoot = null } = {}) {
  const sc = scratchOf(scratch);
  const problems = [];
  const detail = {};
  const specsText = readFileSync(path.join(root, SPECS_FILE), 'utf8');
  const p = patchSpecsText(specsText);
  if (p.changed) problems.push(`${SPECS_FILE}: the swap is not applied (hero ${p.hero}, ANIMS ${p.anims})`);
  const lib = patchLibText(readFileSync(path.join(root, LIB_FILE), 'utf8'));
  if (lib.changed) problems.push(`${LIB_FILE}: SCHEDULED_IP still lists aloy.glb`);
  detail.files = Object.fromEntries(HERO_FILES.map((f) => [f, existsSync(path.join(root, f))]));
  for (const [f, ok] of Object.entries(detail.files)) if (!ok) problems.push(`${f} missing (hero-body's merge)`);
  detail.aloyGone = !existsSync(path.join(root, ALOY));
  if (!detail.aloyGone) problems.push(`${ALOY} still on disk (hero-body deletes it in the same window)`);
  // licence rows: exactly one non-IP row per file (hero-body's rows folded by tools/licences/fold.mjs)
  const { loadManifest, matchRows } = await import(pathToFileURL(path.join(root, 'tools/licences/lib.mjs')).href);
  const manifest = loadManifest(root);
  const { byFile } = matchRows(manifest, HERO_FILES);
  const byId = new Map((manifest?.rows || []).map((r) => [r.id, r]));
  detail.licenceRows = Object.fromEntries(HERO_FILES.map((f) => [f, (byFile.get(f) || []).map((id) => ({ id, licence: byId.get(id)?.licence, ip: byId.get(id)?.ip === true, derived_from: byId.get(id)?.derived_from }))]));
  for (const [f, rows] of Object.entries(detail.licenceRows)) {
    if (rows.length !== 1) problems.push(`${f}: ${rows.length} LICENSES.json rows (want exactly 1)`);
    else if (rows[0].ip) problems.push(`${f}: its row ${rows[0].id} is marked ip`);
  }
  const aloyRows = (manifest?.rows || []).filter((r) => (r.paths || []).includes(ALOY)).map((r) => r.id);
  detail.aloyRows = aloyRows;
  if (detail.aloyGone && aloyRows.length) detail.pruneLanded = `row(s) ${aloyRows.join(', ')} name the deleted file: node tools/licences/add.mjs --prune-landed`;
  // tracked: none of the four is ignored by this tree's .gitignore rules
  detail.ignored = ignored(HERO_FILES, rulesRoot || root);
  if (detail.ignored.length) problems.push(`git-ignored: ${detail.ignored.join(', ')}`);
  // rows.js
  detail.rowsNoop = await rowsNoop({ root, scratch: sc, specsText });
  if (detail.rowsNoop.ok === false) problems.push(`src/hero/rows.js is not a no-op after the swap: ${json(detail.rowsNoop).slice(0, 300)}`);
  return { ok: !problems.length, problems, detail };
}

// ------------------------------------------------------------------ the R39 merge trial (scratch)

/**
 * Build the R39 merge state in scratch: this tree (working tree, as the merge would take it) + the branches in
 * `refs` (default hero-body's), laid over it by merge-overlay.mjs (git show, read-only; LICENSES.json by
 * fold.mjs, merge step 2; any other both-sides path by `git merge-file -p`). Returns
 * { copy, filesCopied, overlay: [{ ref, sha, base, added, modified, deleted, merged, folds, conflicts }] }.
 */
export async function buildTrial({ root = ROOT, scratch = null, refs = [HERO_REF], name = 'hero-swap-trial' } = {}) {
  const sc = scratchOf(scratch);
  const { cloneTree } = await import('./specs-fixture.mjs');
  const { overlayRefs } = await import('./merge-overlay.mjs');
  const copy = path.join(sc, `${name}-${process.pid}`);
  rmSync(copy, { recursive: true, force: true });
  mkdirSync(copy, { recursive: true });
  const filesCopied = cloneTree(root, copy);
  const { refs: overlay } = overlayRefs({ root, copy, refs, scratch: sc });
  return { copy, filesCopied, overlay };
}

/** check.mjs on the trial copy (node half only; no R5_WAVE, as on main): clause statuses + the credits exit signal. */
export function licenceSummary(copy) {
  const env = { ...process.env };
  delete env.R5_WAVE;
  let r;
  try {
    r = JSON.parse(execFileSync(process.execPath, [path.join(copy, 'tools/licences/check.mjs'), '--json-line'], { cwd: copy, env, encoding: 'utf8', maxBuffer: 64 * 2 ** 20, stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').pop());
  } catch (e) {
    try { r = JSON.parse(String(e.stdout || '').trim().split('\n').pop()); } catch { return { error: String(e.stderr || e.message).slice(0, 300) }; }
  }
  const c = r.clauses || {};
  return { pass: r.pass, wave: r.wave?.wave ?? null, waveSource: r.wave?.source ?? null, summary: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.status])),
    files: c['files-matched']?.files, unmatched: c['files-matched']?.unmatched, ipInvalid: (c['legacy-source']?.ipInvalid || []).map((x) => x.file || x.id),
    credits: c.credits && { status: c.credits.status, readme: `${c.credits.readme?.shown}/${c.credits.readme?.of}`, w0Exit: c.credits.w0Exit, exitControl: c.credits.exitControl?.ok } };
}

/** The hero rows the patch adds, as the booted page sees them (filmed by the trial). */
export const HERO_ROWS_ASSERT = `(async () => {
  const A = __CTX__.assets, p = __CTX__.player, h = p?.hero;
  const want = ${json(Object.fromEntries(Object.entries(HERO_SWAP.specs).map(([k, r]) => [k, r.url])))};
  const rows = Object.fromEntries(Object.entries(want).map(([k, url]) => [k, { spec: A.specs[k]?.url ?? null, loaded: !!A.models[k], fromUrl: A.models[k]?.spec?.url ?? null }]));
  const ual2 = A.anims?.heroUal2 ? { loaded: true, clips: (A.anims.heroUal2.animations || []).length } : { loaded: false };
  const skippedHero = (A.skipped || []).filter((s) => /^hero/.test(s.name)).map((s) => s.name + ':' + s.status);
  const info = h?.info ? h.info() : null;
  const rowsOk = Object.entries(want).every(([k, url]) => rows[k].spec === url && rows[k].loaded && rows[k].fromUrl === url);
  const outfitRow = h?.outfit?.row ?? null, outfitMeshes = h?.outfit?.meshes?.length ?? 0, kitAttached = !!h?.kit?.attached;
  const pass = rowsOk && ual2.loaded && ual2.clips > 0 && !skippedHero.length && h?.isBrea === true && outfitRow === 'heroOutfitPan1' && outfitMeshes > 0 && kitAttached;
  return { pass, detail: { rows, heroUal2: ual2, skippedHero, isBrea: h?.isBrea ?? null, outfitRow, outfitMeshes, kitAttached,
    info: info && { draws: info.draws, tris: info.tris, casters: info.casters, skeletons: info.skeletons },
    rigProfile: p?.model?.userData?.rigProfile?.name ?? A.models.hero?.root?.userData?.rigProfile?.name ?? null } };
})()`;

/**
 * The whole trial: build, patch (--write), verify, boot. Returns { pass, detail }. `pass` needs: no overlay
 * conflict, fold ok, patch applied and validated, verify ok (incl. rows.js no-op with its negative control),
 * and A1, A20b, A-pipeline-boot-rows and the hero-rows check PASS on the booted copy. A-human-bind on the
 * copy is reported (advisory, unsealed). The copy is removed at the end.
 */
export async function heroSwapTrial({ root = ROOT, scratch = null, heroRef = HERO_REF, port = 0, shot = null, keep = false, boot = true } = {}) {
  const t0 = Date.now();
  const sc = scratchOf(scratch);
  const detail = {};
  let copy = null;
  try {
    const { preflight, serveAndRun } = await import('./specs-fixture.mjs');
    // State-aware: after the R39 window the swap is on HEAD itself, and the patch then rightly changes nothing.
    let swappedOnHead = false;
    try {
      swappedOnHead = !patchSpecsText(readFileSync(path.join(root, SPECS_FILE), 'utf8')).changed
        && !patchLibText(readFileSync(path.join(root, LIB_FILE), 'utf8')).changed;
    } catch { swappedOnHead = false; }   // an unexpected file: the patch below reports it
    detail.swappedOnHead = swappedOnHead;
    const tr = await buildTrial({ root, scratch: sc, refs: [heroRef] });
    copy = tr.copy;
    detail.trial = { filesCopied: tr.filesCopied, overlay: tr.overlay };
    if (tr.overlay.some((o) => o.conflicts.length)) return { pass: false, detail };
    detail.patch = await applyHeroSwap({ root: copy, write: true, scratch: sc });
    detail.patchAgain = await applyHeroSwap({ root: copy, write: true, scratch: sc });   // idempotent: changes nothing
    detail.verify = await verifyHeroSwap({ root: copy, scratch: sc, rulesRoot: root });
    detail.licence = licenceSummary(copy);   // advisory: what A-licence-manifest's node half reads after the window
    const staticOk = detail.patch.ok && detail.patch.changed.length === (swappedOnHead ? 0 : 2) && detail.patchAgain.ok && !detail.patchAgain.changed.length && detail.verify.ok;
    if (!staticOk || !boot) return { pass: staticOk ? null : false, detail };
    let pf = preflight(root);
    for (let i = 0; !pf.ok && i < 18; i++) { await new Promise((r) => setTimeout(r, 10000)); pf = preflight(root); }
    detail.preflight = pf;
    if (!pf.ok) return { pass: null, detail: { ...detail, pending: 'preflight refused to launch Chrome (plan §0 rule 8)' } };
    const { GATES } = await import(pathToFileURL(path.join(copy, 'tools/gates.config.mjs')).href);
    const P = await import(pathToFileURL(path.join(copy, 'tools/gates.r5.pipeline.mjs')).href);
    const g = (id) => GATES.find((x) => x.id === id) || { id, missing: true };
    const lane = (id) => P.GATES.find((x) => x.id === id) || { id, missing: true };
    const defs = [g('A1-boot-clean'), g('A20b-no-system-errors'), lane('A-pipeline-boot-rows'),
      { id: 'hero-swap-rows', settle: 3000, timeout: 30000, assert: HERO_ROWS_ASSERT, ...(shot ? { shot: path.resolve(shot) } : {}) },
      lane('A-human-bind')];
    if (shot) mkdirSync(path.dirname(path.resolve(shot)), { recursive: true });
    const cacheDir = path.join(sc, `hero-swap-vite-cache-${process.pid}`);
    const sock = path.join(os.tmpdir(), `cal-hs-${process.pid}.sock`);
    try {
      detail.boot = await serveAndRun(copy, defs, { port, sock, cacheDir, onProbe: (pr) => { detail.viteProbe = { ok: pr.ok }; } });
    } finally { rmSync(cacheDir, { recursive: true, force: true }); rmSync(sock, { force: true }); }
    const graded = detail.boot.filter((r) => r.id !== 'A-human-bind');
    const bind = detail.boot.find((r) => r.id === 'A-human-bind');
    detail.humanBindAdvisory = bind ? { pass: bind.pass, ...bind.detail, error: bind.error, note: 'unsealed merge trial: advisory only; A-human-bind is graded by the orchestrator on the merged tree' } : null;
    return { pass: graded.every((r) => r.pass === true), detail };
  } catch (e) {
    detail.error = String(e?.stack || e).slice(0, 600);
    return { pass: false, detail };
  } finally {
    if (copy && !keep) rmSync(copy, { recursive: true, force: true });
    detail.copyRemoved = copy ? !existsSync(copy) : null;
    detail.ms = Date.now() - t0;
  }
}

// ------------------------------------------------------------------ CLI

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const val = (f, d = null) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };
  const root = val('--root') ? path.resolve(val('--root')) : ROOT;
  const scratch = val('--scratch');
  let res, code = 0;
  if (a.includes('--trial')) {
    res = await heroSwapTrial({ root, scratch, heroRef: val('--hero-ref', HERO_REF), port: Number(val('--port', 0)), shot: val('--shot'), boot: !a.includes('--no-boot') });
  } else if (a.includes('--verify')) {
    res = await verifyHeroSwap({ root, scratch });
    code = res.ok ? 0 : 1;
  } else if (a.includes('--write') || a.includes('--check')) {
    res = await applyHeroSwap({ root, scratch, write: a.includes('--write') });
    code = res.ok ? 0 : 1;
  } else {
    process.stderr.write('usage: hero-swap.mjs --check | --write | --verify [--root <tree>] [--scratch <dir>] | --trial --scratch <dir> [--hero-ref <ref>] [--shot <png>] [--no-boot]\n');
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify(res)}\n`, () => process.exit(code));
}
