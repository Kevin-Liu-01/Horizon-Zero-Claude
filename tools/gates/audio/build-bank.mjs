#!/usr/bin/env node
/**
 * Render the slice's audio bank (BUILD M1.6k; TECH §14). Node only, deterministic, no network.
 *
 *   node tools/gates/audio/build-bank.mjs [--only <set,set>] [--dry]
 *
 * For every row of src/audio/slice/cues.js with a recipe: render each variant (src/audio/slice/recipes.js, seeds
 * fixed per set), normalise it (point sources to a sample peak; beds and music to a file loudness, never above
 * -1 dBTP), encode Ogg Opus (TECH §14 asks Vorbis; see encode()) with the system ffmpeg (mono for point sources, stereo for beds and music) into
 * public/audio/<set>[-k].ogg, then write the runtime index src/audio/manifest.js and public/audio/MANIFEST.md.
 * Rows marked `keep` (Brea's efforts) carry their existing files over unchanged.
 *
 * It never deletes. It prints the files under public/audio/ that the new bank does not list ("stale"), so they can be
 * removed with `git rm` on that explicit list.
 *
 * `--only none` renders nothing and rewrites the index from the files on disk (a manifest field changed, not a sound).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUES, filesOf, COUNTED, M2_COUNTED } from '../../../src/audio/slice/cues.js';
import * as R1 from '../../../src/audio/slice/recipes.js';
import { GROUPS as R2 } from '../../../src/audio/m2/recipes.js';
import { SR } from '../../../src/audio/slice/dsp.js';
import { integratedLufs, truePeakDb } from './lufs.mjs';

/** The recipe groups: the slice's and the first hour's (src/audio/m2/recipes.js). */
const R = { ...R1, ...R2 };
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(REPO, 'public/audio');
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ONLY = flag('--only') ? new Set(flag('--only').split(',')) : null;
const DRY = args.includes('--dry');
const MONO_KBPS = Number(flag('--mono-kbps') || 48);
const STEREO_KBPS = Number(flag('--stereo-kbps') || 96);

/** A set's seed: FNV-1a of its id, so a variant's samples never depend on the order of the table. */
export function seedOf(set, k) {
  let h = 0x811c9dc5;
  for (const ch of set) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return (h ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0;
}

/** Render one variant of a cue: { chs: Float32Array[], lufs, tp, gainApplied }. */
export function renderCue(c, k) {
  const fn = R[c.recipe[0]][c.recipe[1]];
  let out = fn(seedOf(c.set, k));
  let chs = Array.isArray(out) ? out : [out];
  if (c.ch === 1 && chs.length === 2) chs = [chs[0].map((v, i) => 0.5 * (v + chs[1][i]))];
  if (c.ch === 2 && chs.length === 1) chs = [chs[0], chs[0].slice()];
  let g = 1;
  if (c.lufs != null) {
    const l = integratedLufs(chs);
    g = Math.pow(10, (c.lufs - l) / 20);
  } else {
    let pk = 0;
    for (const x of chs) for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
    g = pk > 0 ? Math.pow(10, (c.peak ?? -1) / 20) / pk : 1;
  }
  for (const x of chs) for (let i = 0; i < x.length; i++) x[i] *= g;
  // never above -1 dBTP in a file (an encoder's overshoot is measured again on decode by the rows)
  let tp = truePeakDb(chs);
  if (tp > -1.2) {
    const h = Math.pow(10, (-1.2 - tp) / 20);
    for (const x of chs) for (let i = 0; i < x.length; i++) x[i] *= h;
    g *= h; tp = truePeakDb(chs);
  }
  return { chs, lufs: integratedLufs(chs), tp, gainApplied: g };
}

function interleave(chs) {
  const n = chs[0].length, c = chs.length;
  const o = new Float32Array(n * c);
  for (let i = 0; i < n; i++) for (let j = 0; j < c; j++) o[i * c + j] = chs[j][i];
  return Buffer.from(o.buffer);
}

function encode(chs, file) {
  mkdirSync(path.dirname(file), { recursive: true });
  // Ogg Opus through the system ffmpeg's libopus. TECH §14 names Ogg Vorbis; this machine's ffmpeg has no libvorbis and
  // its built-in Vorbis encoder is stereo-only and experimental, so the bank is Ogg Opus (as the Round-4 bank was):
  // same container, decoded by decodeAudioData in Chrome, mono for point sources. 48 kb/s mono, 96 kb/s stereo.
  const kbps = chs.length === 1 ? MONO_KBPS : STEREO_KBPS;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', String(chs.length), '-i', 'pipe:0',
    '-c:a', 'libopus', '-b:a', `${kbps}k`, '-vbr', 'on', '-application', 'audio', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', file],
  { input: interleave(chs), maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${file}: ${r.stderr}`);
}

function walk(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base)); else out.push(path.relative(base, p));
  }
  return out;
}

async function main() {
  const oldMan = await import('../../../src/audio/manifest.js');
  const rows = [];
  const report = [];
  const t0 = Date.now();
  for (const c of CUES) {
    if (c.keep) {
      for (const e of oldMan.MANIFEST.filter((m) => m.set === c.set)) {
        rows.push({ ...e, gain: c.gain, tags: [c.bus, c.set.split('/')[0]], source: 'kept set (renamed in M0.3; regenerated in Milestone 3)', author: 'CALIMA project (synthesized, no third-party audio)' });
      }
      continue;
    }
    const files = filesOf(c);
    for (let k = 0; k < files.length; k++) {
      const rel = files[k];
      const abs = path.join(OUT, rel);
      let bytes = 0, dur = 0, meta = null;
      if (!ONLY || ONLY.has(c.set)) {
        const r = renderCue(c, k);
        dur = r.chs[0].length / SR;
        meta = { lufs: +r.lufs.toFixed(2), tp: +r.tp.toFixed(2) };
        if (!DRY) encode(r.chs, abs);
      }
      if (existsSync(abs)) bytes = statSync(abs).size;
      if (!dur) {
        const prev = oldMan.MANIFEST.find((m) => m.file === rel);
        dur = prev ? prev.dur : 0;
      }
      rows.push({
        id: k ? `${c.set}#${k + 1}` : c.set, set: c.set, file: rel, bytes, dur: +dur.toFixed(3), ch: c.ch, gain: c.gain, loop: !!c.loop,
        tags: [c.bus, c.set.split('/')[0]], license: 'CC0-1.0', source: `synthesized by src/audio/${c.m2 ? 'm2' : 'slice'}/recipes.js`,
        author: 'CALIMA project (synthesized, no third-party audio)',
        // the load phase (src/audio/m2/cues.js `load`): 'late' rows are fetched after control, nearest place first
        ...(c.load === 'late' ? { load: 'late', place: c.place } : {}),
        // a tell (a blow's warning): boot, and first in the boot load (src/audio/bank.js load `first`)
        ...(c.tell ? { tell: true } : {}),
      });
      report.push({ file: rel, bytes, dur: +dur.toFixed(3), ...meta });
    }
  }
  const total = rows.reduce((a, r) => a + r.bytes, 0);
  const lateBytes = rows.reduce((a, r) => a + (r.load === 'late' ? r.bytes : 0), 0);
  const listed = new Set(rows.map((r) => r.file));
  const stale = walk(OUT).filter((f) => f !== 'MANIFEST.md' && !listed.has(f));

  const js = `/**
 * GENERATED by tools/gates/audio/build-bank.mjs — do not hand-edit; re-run the builder.
 *
 * The runtime index for public/audio/: the slice's bank (BUILD M1.6k), rendered from src/audio/slice/recipes.js by the
 * cue list src/audio/slice/cues.js. Every row carries its licence so SampleBank refuses an unlicensed file.
 */

export const AUDIO_BASE = '/audio/';

/** @type {{id:string,set:string,file:string,bytes:number,dur:number,ch:number,gain:number,loop:boolean,tags:string[],license:string,source:string,author:string}[]} */
export const MANIFEST = [
${rows.map((r) => `  ${JSON.stringify(r).replace(/"([a-z]+)":/g, '$1: ').replace(/"/g, "'").replace(/,(?=[a-z]+: )/g, ', ')},`).join('\n')}
];

/** set id -> the manifest rows in that set, in round-robin order. */
export const SETS = MANIFEST.reduce((m, e) => {
  (m[e.set] || (m[e.set] = [])).push(e);
  return m;
}, /** @type {Record<string, typeof MANIFEST>} */({}));

export const BANK_BYTES = ${total};

/**
 * The load phases. 'boot' rows (every row without \`load: 'late'\`) load when the title first takes a key or a click;
 * 'late' rows load after New Game or Continue gives her control (src/audio/bank.js loadLate). The shipped ledger
 * (tools/tier0/budgets.mjs, budgets.json shipped.deferred) reads DEFERRED_FILES from this module: one list, the game's.
 */
export const LATE_SETS = new Set(MANIFEST.filter((e) => e.load === 'late').map((e) => e.set));
export const BOOT_BYTES = ${total - lateBytes};
export const LATE_BYTES = ${lateBytes};
/** The deferred files, relative to public/ (what the ledger leaves out of the first load). */
export const DEFERRED_FILES = MANIFEST.filter((e) => e.load === 'late').map((e) => AUDIO_BASE.slice(1) + e.file);
`;
  const md = `# Audio bank — the slice (BUILD M1.6k) and the first hour (Milestone 2)

Every file in \`public/audio/\` is **synthesized by this repository's own code** and released under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). No recording and no third-party audio is bundled.

| field | value |
|---|---|
| files | ${rows.length} |
| sets | ${new Set(rows.map((r) => r.set)).size} (${COUNTED.length} counted cues: ${COUNTED.length - M2_COUNTED.length} the slice's, ${M2_COUNTED.length} the first hour's) |
| total size | ${(total / 1048576).toFixed(2)} MB (budget 8 MB in Milestone 1, 12 MB in Milestone 2) |
| load | boot ${((total - lateBytes) / 1048576).toFixed(2)} MB (${rows.filter((r) => r.load !== 'late').length} files, before control); late ${(lateBytes / 1048576).toFixed(2)} MB (${rows.filter((r) => r.load === 'late').length} files, after New Game or Continue gives control) |
| format | Ogg Opus, 48 kHz (48 kb/s mono point sources, 96 kb/s stereo beds and music) |
| recipes | \`src/audio/slice/recipes.js\`, \`src/audio/m2/recipes.js\` (deterministic; seeds per set in \`tools/gates/audio/build-bank.mjs\`) |
| cue list | \`src/audio/slice/cues.js\` with \`src/audio/m2/cues.js\` (bus, range, place, level) |
| runtime index | \`src/audio/manifest.js\` (generated) |

Brea's breath and effort set (\`brea/\`) is the existing synthesized set, kept until Milestone 3 regenerates it.

| file | set | ch | duration | size | bus | load |
|---|---|---|---|---|---|---|
${rows.map((r) => `| \`${r.file}\` | \`${r.set}\` | ${r.ch} | ${(+r.dur).toFixed(2)} s | ${(r.bytes / 1024).toFixed(1)} KB | ${r.tags[0]} | ${r.load === 'late' ? `late (${r.place})` : 'boot'} |`).join('\n')}
`;
  if (!DRY) {
    writeFileSync(path.join(REPO, 'src/audio/manifest.js'), js);
    writeFileSync(path.join(OUT, 'MANIFEST.md'), md);
  }
  console.log(JSON.stringify({ files: rows.length, sets: new Set(rows.map((r) => r.set)).size, counted: COUNTED.length, m2Counted: M2_COUNTED.length, megabytes: +(total / 1048576).toFixed(3),
    lateMegabytes: +(lateBytes / 1048576).toFixed(3), lateFiles: rows.filter((r) => r.load === 'late').length, seconds: (Date.now() - t0) / 1000, stale }, null, 1));
  if (args.includes('--report')) console.log(JSON.stringify(report, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
