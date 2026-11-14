/**
 * Masked reference crops for the Frame Set (plan: PROCESS §4, private rules §P8).
 *
 *   node tools/frames/crops.mjs            cut every crop in the private recipe, masks painted flat
 *   node tools/frames/crops.mjs --check    verify every crop exists, matches its recipe and source
 *
 * The recipe (boxes, masks and the reason for each mask) is PRIVATE and is read from
 * $CALIMA_CROP_RECIPE or <review>/crops/recipe.json. The source images and the crops never enter
 * the repo; this script refuses to write inside it. A judge is only ever shown the masked crop.
 */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CROPS, RECIPE, assertOutsideRepo } from './paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/** Paint every mask of a crop, in crop-local pixels, as one SVG overlay. */
function maskSvg(c, color) {
  const [x0, y0, x1, y1] = c.box, w = x1 - x0, h = y1 - y0;
  const shapes = (c.masks || []).map((m) => {
    if (m.rect) {
      const [a, b, cc, d] = m.rect;
      const rx = Math.max(0, a - x0), ry = Math.max(0, b - y0);
      const rw = Math.min(w, cc - x0) - rx, rh = Math.min(h, d - y0) - ry;
      return rw > 0 && rh > 0 ? `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${color}"/>` : '';
    }
    if (m.poly) return `<polygon points="${m.poly.map(([px, py]) => `${px - x0},${py - y0}`).join(' ')}" fill="${color}"/>`;
    throw new Error(`crop ${c.id}: a mask needs rect or poly`);
  }).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${shapes}</svg>`);
}

async function cut(recipe, c) {
  const file = path.join(recipe.sourceDir, recipe.sources[c.src] || '');
  if (!recipe.sources[c.src] || !existsSync(file)) throw new Error(`crop ${c.id}: source ${c.src} missing`);
  const src = readFileSync(file);
  const [x0, y0, x1, y1] = c.box;
  const meta = await sharp(src).metadata();
  if (x0 < 0 || y0 < 0 || x1 > meta.width || y1 > meta.height || x1 <= x0 || y1 <= y0) throw new Error(`crop ${c.id}: box outside ${meta.width}x${meta.height}`);
  let img = sharp(src).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 });
  if ((c.masks || []).length) img = sharp(await img.png().toBuffer()).composite([{ input: maskSvg(c, recipe.maskColor || '#808080'), left: 0, top: 0 }]);
  const out = await img.png({ compressionLevel: 9 }).toBuffer();
  return { out, srcSha: sha(src), w: x1 - x0, h: y1 - y0 };
}

async function main() {
  const check = process.argv.includes('--check');
  if (!existsSync(RECIPE)) {
    console.log(`crops: no private recipe at ${RECIPE}; nothing to do (crops are cut only on the review machine)`);
    process.exit(check ? 2 : 0);
  }
  assertOutsideRepo(CROPS, REPO);
  const recipe = JSON.parse(readFileSync(RECIPE, 'utf8'));
  mkdirSync(CROPS, { recursive: true });
  const manPath = path.join(CROPS, 'manifest.json');
  const prev = existsSync(manPath) ? JSON.parse(readFileSync(manPath, 'utf8')) : { crops: {} };
  const manifest = { cutAt: new Date().toISOString(), recipeSha: sha(readFileSync(RECIPE)), crops: {}, texts: {} };
  const bad = [];
  for (const c of recipe.crops) {
    const r = await cut(recipe, c);
    const dest = path.join(CROPS, `${c.id}.png`);
    const row = { file: `${c.id}.png`, src: c.src, srcSha: r.srcSha, box: c.box, masks: (c.masks || []).length, p8: c.p8 || null, w: r.w, h: r.h, sha: sha(r.out), judgeNote: c.judgeNote || null };
    if (check) {
      if (!existsSync(dest)) bad.push(`${c.id}: missing`);
      else if (sha(readFileSync(dest)) !== row.sha) bad.push(`${c.id}: differs from its recipe (re-cut it)`);
    } else writeFileSync(dest, r.out);
    manifest.crops[c.id] = row;
  }
  for (const t of recipe.texts || []) manifest.texts[t.id] = { text: t.text };
  const p8 = Object.entries(manifest.crops).filter(([, v]) => v.p8);
  const p8Masked = p8.filter(([, v]) => v.masks > 0);
  if (!check) writeFileSync(manPath, JSON.stringify(manifest, null, 1));
  else if (prev.recipeSha && prev.recipeSha !== manifest.recipeSha) bad.push('recipe changed since the last cut');
  console.log(`crops: ${Object.keys(manifest.crops).length} image crops, ${Object.keys(manifest.texts).length} text references, `
    + `${p8Masked.length}/${p8.length} section-P8 crops masked -> ${CROPS}`);
  if (p8Masked.length !== p8.length) bad.push(`P8 crops without a mask: ${p8.filter(([, v]) => !v.masks).map(([k]) => k).join(', ')}`);
  if (bad.length) { for (const b of bad) console.log('  FAIL', b); process.exit(1); }
  if (check) console.log('crops: check OK');
}

main().catch((e) => { console.error('crops:', e.message); process.exit(1); });
