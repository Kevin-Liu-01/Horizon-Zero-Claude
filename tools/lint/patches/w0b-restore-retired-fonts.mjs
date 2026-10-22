/**
 * W0b option (b) for the ORCHESTRATOR (lane brand, fix round 3, Oct 22): restore the 8 retired Round-4 font files
 * and their 5 `legacy-font-*` rows in the brand merge when the §1.2 grant for
 * `tools/lint/patches/w0b-retired-font-refs.patch` is NOT recorded.
 *
 * Plan rule 4 and §6: the old fonts go only when `A-fonts-licensed` (+ V-logo) passes, and `A-fonts-licensed`
 * cannot pass until the 37 references in other lanes' files are gone. Brand's branch deletes the files and rows
 * because the deletion, the rows and the reference patch are one package (R43 (b) in
 * `w0b-plan-orchestrator.patch`). Without the grant the package is split, and this script puts the old content
 * back, byte for byte, from a main commit that still holds it.
 *
 *   node tools/lint/patches/w0b-restore-retired-fonts.mjs --check        report only, write nothing
 *   node tools/lint/patches/w0b-restore-retired-fonts.mjs                restore (from main 148f007)
 *   options: --ref <commit> (default 148f007) --root <dir> (default: the repo root) --git <repo> (default: --root)
 *
 * Files come from `git show <ref>:<path>` and are checked against the commit's blob id; the rows are copied from
 * the commit's `public/LICENSES.json` unchanged and written through pipeline's `tools/licences/add.mjs` (`upsert`:
 * validated, canonical order), so the result equals the commit's rows. Read-only git only; nothing is staged.
 * Measured consequences (docs/ROUND5-BRAND.md §7): `A-fonts-licensed` stays FAIL (and fails `onlyTheThreeFamilies`
 * too), and the 5 rows return 5 player-lint hits, so the W0b player ratchet must be re-recorded on merged main.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const a = process.argv.slice(2);
const val = (f, d) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };
const ROOT = path.resolve(val('--root', path.join(HERE, '../../..')));
const GIT = path.resolve(val('--git', ROOT));
const REF = val('--ref', '148f007');
const CHECK = a.includes('--check');

export const RETIRED_FILES = [
  'public/fonts/ChakraPetch-Regular.ttf', 'public/fonts/ChakraPetch-SemiBold.ttf', 'public/fonts/JuliusSansOne-Regular.ttf',
  'public/fonts/Michroma-Regular.ttf', 'public/fonts/Orbitron-Variable.ttf', 'public/fonts/Rajdhani-Bold.ttf',
  'public/fonts/Rajdhani-Medium.ttf', 'public/fonts/Rajdhani-SemiBold.ttf',
];
export const RETIRED_ROWS = ['legacy-font-chakra-petch', 'legacy-font-julius-sans-one', 'legacy-font-michroma',
  'legacy-font-orbitron', 'legacy-font-rajdhani'];

const git = (args, enc = 'utf8') => execFileSync('git', ['-C', GIT, ...args], { encoding: enc, maxBuffer: 64 << 20 });
const report = { ref: REF, root: ROOT, check: CHECK, files: [], rows: [] };

for (const f of RETIRED_FILES) {
  const blob = git(['rev-parse', `${REF}:${f}`]).trim();
  const abs = path.join(ROOT, f);
  const present = existsSync(abs) && git(['hash-object', abs]).trim() === blob;
  if (!present && !CHECK) {
    writeFileSync(abs, git(['show', `${REF}:${f}`], 'buffer'));
    if (git(['hash-object', abs]).trim() !== blob) throw new Error(`${f}: written bytes do not match ${REF}'s blob ${blob}`);
  }
  report.files.push({ file: f, blob: blob.slice(0, 12), state: present ? 'present' : CHECK ? 'missing' : 'restored' });
}

const theirs = JSON.parse(git(['show', `${REF}:public/LICENSES.json`])).rows;
const ours = JSON.parse(readFileSync(path.join(ROOT, 'public/LICENSES.json'), 'utf8')).rows;
const add = [];
for (const id of RETIRED_ROWS) {
  const row = theirs.find((r) => r.id === id);
  if (!row) throw new Error(`${REF}:public/LICENSES.json has no row ${id}`);
  const have = ours.find((r) => r.id === id);
  if (!have) add.push(row);
  report.rows.push({ id, state: have ? (JSON.stringify(have) === JSON.stringify(row) ? 'present' : 'present (differs)') : CHECK ? 'missing' : 'restored' });
}
if (add.length && !CHECK) {
  const { upsert } = await import(path.join(ROOT, 'tools/licences/add.mjs'));
  upsert(add, { root: ROOT });
}
console.log(JSON.stringify(report, null, 1));
