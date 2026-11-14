/**
 * The Frame Set definition (tools/frames/frameset.json): load, validate, and the filming order.
 *
 *   node tools/frames/frameset.mjs           validate and print the set (and its sha256 for the freeze)
 *   node tools/frames/frameset.mjs --crops   also check every referenced crop exists in the private crop manifest
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CROPS } from './paths.mjs';

export const FRAMESET_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'frameset.json');

const MODES = ['chase', 'eye', 'pov', 'orbit', 'screen'];
const SCREENS = ['title', 'map', 'crafting', 'character', 'sighting'];
const POSES = ['idle', 'run', 'draw', 'crouch', 'crouchAim', 'lanceHeavy', 'sit'];
const WEATHER = ['trade', 'calima', 'fogbank', 'squall'];

export function loadFrameSet(file = FRAMESET_PATH) {
  const raw = readFileSync(file);
  const set = JSON.parse(raw);
  set.sha256 = createHash('sha256').update(raw).digest('hex');
  return set;
}

/** Problems with the set, as strings (empty when valid). */
export function validate(set) {
  const bad = [];
  const ids = new Set();
  for (const f of set.frames) {
    const at = `frame ${f.id}`;
    if (!/^F\d\d(-[a-z]+)?$/.test(f.id || '')) bad.push(`${at}: id must be Fnn or Fnn-kind`);
    if (ids.has(f.id)) bad.push(`${at}: duplicate id`);
    ids.add(f.id);
    if (!f.subject) bad.push(`${at}: no subject`);
    if (!(f.hour >= 0 && f.hour < 24)) bad.push(`${at}: hour must be 0-24`);
    if (!WEATHER.includes(f.weather)) bad.push(`${at}: weather must be one of ${WEATHER.join(', ')}`);
    if (!f.at) bad.push(`${at}: no 'at'`);
    const c = f.camera || {};
    if (!MODES.includes(c.mode)) bad.push(`${at}: camera.mode must be one of ${MODES.join(', ')}`);
    if (c.mode === 'screen' && !SCREENS.includes(c.screen)) bad.push(`${at}: screen must be one of ${SCREENS.join(', ')}`);
    if (c.mode === 'orbit' && !(c.dist > 0)) bad.push(`${at}: orbit needs dist`);
    if (c.mode === 'eye' && f.bearing == null) bad.push(`${at}: eye needs a bearing`);
    if (!POSES.includes(f.state?.pose || 'idle')) bad.push(`${at}: pose must be one of ${POSES.join(', ')}`);
    const r = f.ref || {};
    if (!r.crops?.length && !r.written && !r.measured?.length && !r.text && !r.bar) bad.push(`${at}: no reference (crops, text, written, measured or bar)`);
  }
  for (let n = 1; n <= 32; n++) {
    const id = `F${String(n).padStart(2, '0')}`;
    if (![...ids].some((k) => k === id || k.startsWith(id + '-'))) bad.push(`missing ${id}`);
  }
  return bad;
}

/**
 * Filming order for one Chrome session: world and character frames first, then the UI screens,
 * the title last (it leaves the game on the title flow).
 */
export function filmOrder(frames) {
  const rank = (f) => (f.camera.mode !== 'screen' ? 0 : f.camera.screen === 'title' ? 2 : 1);
  return frames.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i).map((x) => x.f);
}

/** Crop ids and worded-reference ids the set references. */
export function referencedCrops(set) {
  const crops = new Set(), texts = new Set();
  for (const f of set.frames) {
    for (const c of f.ref?.crops || []) crops.add(c);
    if (f.ref?.text) texts.add(f.ref.text);
  }
  return { crops: [...crops], texts: [...texts] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const set = loadFrameSet();
  const bad = validate(set);
  if (process.argv.includes('--crops')) {
    const man = path.join(CROPS, 'manifest.json');
    if (!existsSync(man)) bad.push(`no crop manifest at ${man} (run tools/frames/crops.mjs)`);
    else {
      const m = JSON.parse(readFileSync(man, 'utf8'));
      const { crops, texts } = referencedCrops(set);
      for (const c of crops) if (!m.crops?.[c] || !existsSync(path.join(CROPS, `${c}.png`))) bad.push(`crop ${c} missing`);
      for (const t of texts) if (!m.texts?.[t]) bad.push(`worded reference ${t} missing`);
    }
  }
  const order = filmOrder(set.frames);
  console.log(`frameset: ${set.frames.length} frames (F01-F32), sha256 ${set.sha256.slice(0, 16)}`);
  console.log(`film order: ${order.map((f) => f.id).join(' ')}`);
  if (bad.length) { for (const b of bad) console.log('  FAIL', b); process.exit(1); }
  console.log('frameset: valid');
}
