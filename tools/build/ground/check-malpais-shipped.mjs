/**
 * MP1 ON THE SHIPPED FILES (M3 wave 2 fix round 1, area A): no texel of the Malpais' albedo layers brighter than linear
 * 0.30 in any channel, read from public/textures/malpais/malpais_a.ktx2 as the page gets it (ETC1S transcoded to RGBA8 by
 * KTX-Software's `ktx extract`), not from the generator's buffers (tools/world/malpais-look.test.mjs reads those at 64²).
 *
 *   node tools/build/ground/check-malpais-shipped.mjs [--ktx <path of the ktx tool>]
 *
 * Prints per layer: the brightest channel (8-bit and linear), the texels over 0.30, the mean colour; exits 1 on any over.
 * The decode goes to a temporary directory outside the repo and is removed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ktxBin } from '../pipeline/ktx2.mjs';
import { MALPAIS_LAYERS } from '../../../src/world/sites/malpais-files.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const i = args.indexOf('--ktx');
const bin = ktxBin(i >= 0 ? args[i + 1] : null);
const BAR = 0.30;
const lin = (v) => Math.pow(v / 255, 2.2);
const file = path.join(ROOT, 'public', MALPAIS_LAYERS.files.a);
const tmp = mkdtempSync(path.join(os.tmpdir(), 'malpais-shipped-'));
let bad = 0;
try {
  execFileSync(bin, ['extract', '--transcode', 'rgba8', '--layer', 'all', file, path.join(tmp, 'a')], { stdio: ['ignore', 'pipe', 'pipe'] });
  const pngs = readdirSync(path.join(tmp, 'a')).filter((f) => f.endsWith('.png')).sort();
  console.log(`${path.relative(ROOT, file)}: ${pngs.length} layers decoded (ETC1S -> RGBA8)`);
  for (const [k, f] of pngs.entries()) {
    const { data, info } = await sharp(path.join(tmp, 'a', f)).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    let mx = 0, over = 0, r = 0, g = 0, b = 0;
    const n = info.width * info.height;
    for (let p = 0; p < n; p++) {
      const m = Math.max(data[p * ch], data[p * ch + 1], data[p * ch + 2]);
      if (m > mx) mx = m;
      if (lin(m) > BAR) over++;
      r += data[p * ch]; g += data[p * ch + 1]; b += data[p * ch + 2];
    }
    const id = MALPAIS_LAYERS.ids[k] ?? f;
    console.log(`  ${id.padEnd(9)} ${info.width}x${info.height}: brightest ${mx}/255 = linear ${lin(mx).toFixed(3)}, ${over} texels over ${BAR}, mean (${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)}): ${over ? 'FAIL' : 'PASS'}`);
    bad += over;
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log(bad ? `FAIL: ${bad} texels over linear ${BAR}` : `PASS: no texel over linear ${BAR}`);
process.exit(bad ? 1 : 0);
