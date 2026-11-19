/**
 * THE SIM-TIME STAGINGS SEAM (Milestone 2, the shared seams). Owner: engine. Each lane adds its Milestone 2 frames
 * and their stagings in ITS OWN file here, `tools/frames/stagings/<lane>.mjs`; this file merges them once (as
 * tools/gates/hero-sweep/session.mjs merged the clip files). Lanes never edit page.mjs or frameset.json.
 *
 * A lane file exports (either spelling of each name is read: `frames` or `FRAMES`, `stagings` or `STAGINGS`):
 *   export const lane = 'systems';                    the lane's name (default: the file's own name)
 *   export const frames = [ { id: 'F44', ... } ];     frame definitions in frameset.json's shape, `in: 'M2'`; ids
 *                                                     continue from F32 (the Milestone 2 Frame Set additions)
 *   export const STAGED = { F44: 'sim' | 'wall' };    optional: how each is staged (carried on the frame as `staged`)
 *   export const stagings = { F44: { world, beforeFreeze } };
 *     world(f, api)          in-page, after page.mjs has placed Brea, set the hour and weather, hidden what roams
 *                            and staged the frame's actors (page.mjs step 4); before the lens and the settle
 *     beforeFreeze(f, api)   in-page, after the pose and the screens (page.mjs step 8); before the freeze and measure
 *   or, world.mjs's shape: { id, clock: 'sim' | 'wall', stage(ctx, frame, api) } (run where `world` runs).
 *   Each hook is serialised on its own (page.evaluate), so it may not touch anything outside its body. `api`:
 *     { C, undo(fn), standIn(text), sleep(ms), frames(n), rec: {x, z}, bearing, sim }   `sim` is page.mjs's
 *     simulation clock when the frame's pose runs on it (else null). Everything a hook changes is undone through
 *     `undo`; a hook that throws is recorded as a stand-in, never fatal.
 *
 * Merged frames are filmed only when named (`film.mjs --only F44`) or with `film.mjs --lanes`, so a full film of the
 * frozen set is unchanged and frameset.json's sha256 (the freeze) still names that set alone.
 *
 *   const L = await loadLanes()          { frames, hooks: { [id]: { world?: src, beforeFreeze?: src } }, lanes, errors }
 *   await installStagings(page, L)       defines window.__laneStagings in the page (after boot, before staging)
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const HOOKS = ['world', 'beforeFreeze', 'stage'];

export async function loadLanes(dir = DIR) {
  const out = { frames: [], hooks: {}, lanes: [], errors: [] };
  const files = readdirSync(dir).filter((f) => f.endsWith('.mjs') && f !== 'index.mjs').sort();
  const owner = {};
  for (const file of files) {
    let mod;
    try { mod = await import(pathToFileURL(path.join(dir, file)).href); } catch (e) { out.errors.push(`${file}: ${e?.message || e}`); continue; }
    const lane = mod.lane || file.replace(/\.mjs$/, '');
    out.lanes.push(lane);
    // (either spelling: `frames` / `FRAMES`, `stagings` / `STAGINGS`; `STAGED` { id: 'sim' | 'wall' } is carried as f.staged)
    const staged = mod.STAGED || mod.staged || {};
    for (const f0 of mod.frames || mod.FRAMES || []) {
      const f = staged[f0.id] && !f0.staged ? { ...f0, staged: staged[f0.id] } : f0;
      if (owner[f.id]) { out.errors.push(`${file}: frame ${f.id} is already ${owner[f.id]}'s`); continue; }
      owner[f.id] = lane;
      out.frames.push({ ...f, lane });
    }
    for (const [id, h] of Object.entries(mod.stagings || mod.STAGINGS || {})) {
      if (owner[id] && owner[id] !== lane) { out.errors.push(`${file}: staging ${id} belongs to ${owner[id]}'s frame`); continue; }
      const src = {};
      for (const k of HOOKS) if (typeof h?.[k] === 'function') src[k] = h[k].toString();
      out.hooks[id] = src;
      // a staging's `clock` ('sim' | 'wall', world.mjs's shape) is carried on its frame as `staged`
      const fr = out.frames.find((f) => f.id === id);
      if (fr && h?.clock && !fr.staged) fr.staged = h.clock;
    }
  }
  return out;
}

/** The merged set: frameset.json's frames plus the lane frames selected (all with `all`, else only `only`'s ids). */
export function mergeFrames(set, lanes, { all = false, only = null } = {}) {
  const extra = lanes.frames.filter((f) => all || (only && only.has(f.id)));
  return { ...set, frames: [...set.frames, ...extra] };
}

export async function installStagings(page, lanes) {
  await page.evaluate((hooks) => {
    window.__laneStagings = {};
    for (const [id, h] of Object.entries(hooks)) {
      const o = {};
      for (const [k, src] of Object.entries(h)) {
        // a method's toString() is `world(f, api) { ... }` (no `function`): make it an expression either way
        const s = /^(async\s+)?function\b/.test(src) || /^(async\s*)?\(?[\w\s,{}]*\)?\s*=>/.test(src) ? src : (src.startsWith('async ') ? `async function ${src.slice(6)}` : `function ${src}`);
        o[k] = (0, eval)(`(${s})`);
      }
      // world.mjs's shape, `stage(ctx, frame, opts)`, runs where `world` runs
      if (o.stage && !o.world) { const st = o.stage; o.world = (f, api) => st(api.C, f, api); }
      window.__laneStagings[id] = o;
    }
    return Object.keys(window.__laneStagings).length;
  }, lanes.hooks);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const L = await loadLanes();
  console.log(`stagings: ${L.lanes.length} lane files (${L.lanes.join(', ') || 'none'}), ${L.frames.length} frames (${L.frames.map((f) => `${f.id}:${f.lane}`).join(' ') || 'none'})`);
  for (const e of L.errors) console.log('  FAIL', e);
  process.exit(L.errors.length ? 1 : 0);
}
