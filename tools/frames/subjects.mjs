#!/usr/bin/env node
/**
 * THE SUBJECTS OF THE STAGED FRAMES (Milestone 3 rule 17; area F's EF4). Every staging names the object or objects it
 * is OF, and the filmer refuses to shoot it (a named "not staged" FAIL in run.json, no picture) when a subject is under
 * its pixel floor, outside the lens's safe area, or hidden: tools/frames/film.mjs runs tools/frames/subject-page.mjs on
 * the frozen frame before the shutter, with the law of tools/frames/subject-math.mjs.
 *
 *   SUBJECTS[frameId] = [{ name, kind, ...bars }]     JSON: handed to the page as it is
 *   subjectsFor(frame) -> subjects | null             the frame's own `subjects` (a lane's file may carry them) or these
 *   node tools/frames/subjects.mjs [--check]          which frames declare subjects; fails on an unknown kind
 *   node tools/frames/subjects.mjs --precheck F56,F57 the Node half: fixed 'eye' lenses measured on the recipe's ground
 *                                                     (data shapes, the sun, ground regions; no meshes), no Chrome
 *
 * KINDS (resolved in the page by subject-page.mjs; the data kinds in Node too):
 *   hero                          Brea's model (her skinned vertices sampled)
 *   object   { object }           the scene's object of that name (e.g. the Survey Kite's mesh, 'survey-kite')
 *   path     { path }             an object at a path off ctx (e.g. 'combat.windwall.prop.group')
 *   machines { machine }          every visible Instrument of that kind: each a member
 *   people                        every visible person: each a member
 *   bone     { bone, r }          a sphere of radius r round one of her bones (her hand with the Alidade at her eye)
 *   shapes   { shapes: [...] }    data-defined cylinders, cones and points (engine frame), each a member
 *   sun                           the sun's disc (environment.sunDir)
 *   ground   { region }           the share of the frame whose rays first strike that region's ground
 *   dom      { selector }         a page element (a HUD read-out): its box
 * Bars (subject-math.mjs DEFAULTS): minPx (screen-box height, CSS px of the 1600 x 900 frame), minShare, inLens (0.7),
 * visible (0.7), min (members that must pass; default all).
 *
 * The floors are the frames' own written targets read as sizes: a thing the target asks to be COUNTED or READ is at
 * least 20 px tall; a figure the frame is OF is at least 80-250 px; a "whole" thing has inLens 0.95.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HORNITOS, RUST_CONE, TUBE_SHELTER } from '../../src/world/sites/malpais-layout.js';
import { YARDS, WELLHEADS } from '../../src/world/sites/kilnyards-layout.js';
import { siteById } from '../../src/world/island/sites.js';
import { WIND_ROADS, POST_HEIGHT_M } from '../../src/game/kite/roads.js';

const cyl = (id, x, z, r, h, extra = {}) => ({ id, kind: 'cylinder', x: +x.toFixed(2), z: +z.toFixed(2), r, h, ...extra });
const site = (id, r, h) => { const s = siteById(id); return cyl(id, s.x, s.z, r, h, { onGround: true }); };

export const KINDS = Object.freeze(['hero', 'object', 'path', 'machines', 'people', 'bone', 'shapes', 'sun', 'ground', 'dom']);

/** @type {Readonly<Record<string, ReadonlyArray<object>>>} */
export const SUBJECTS = Object.freeze({
  // ---- Milestone 2 (rule 17 was written on these: D5)
  // the fight is a subject the target asks to READ ("on the skyline", with the people "readable as people"): the floors are
  // the doc's (a figure the frame is of: 40 px for her and a Sickle's 25, the Screed's hull 60). At 79da069 (run
  // 20261120T113047Z-79da069-ef-w2-partial) floors of 12-20 px passed a fight of 12-35 px that does not read
  'F39-look': [
    { name: 'the Screed on wall-1', kind: 'machines', machine: 'screed', min: 1, minPx: 60 },
    { name: 'a Sickle with it', kind: 'machines', machine: 'sickle', min: 1, minPx: 25 },
    { name: 'Brea at the fight', kind: 'hero', minPx: 40 },
    { name: 'the Holds people at their doors', kind: 'people', min: 4, minPx: 30 },
  ],
  F44: [
    { name: 'Brea at the re-survey', kind: 'hero', minPx: 250 },
    { name: 'the Alidade at her eye (her right hand)', kind: 'bone', bone: 'handR', r: 0.1, minPx: 8 },
    { name: 'the planted Windwall', kind: 'path', path: 'combat.windwall.prop.group', minPx: 30 },
    { name: 'the Peg coming up her line', kind: 'machines', machine: 'peg', min: 1, minPx: 20 },
  ],
  F45: [
    { name: 'the calima sun\'s disc', kind: 'sun' },
    { name: 'the Kiln Yards\' two tower stubs over the rim', kind: 'shapes', min: 2, minPx: 30, inLens: 0.6,
      shapes: YARDS.towers.map((t) => cyl(t.id, t.x, t.z, t.r0, t.h, { rTop: t.r1 })) },
    { name: 'Brea at the rim', kind: 'hero', minPx: 150 },
  ],
  // ---- Milestone 3 (§3.3)
  F51: [
    { name: 'Brea under the kite', kind: 'hero', minPx: 100 },
    { name: 'the kite', kind: 'object', object: 'survey-kite', minPx: 60 },
    { name: 'the Sounding Ring below', kind: 'shapes', minPx: 4, shapes: [site('sounding-ring', 25, 6)] },
    { name: 'Saltrow below', kind: 'shapes', minPx: 6, shapes: [site('saltrow', 45, 10)] },
  ],
  F52: [
    { name: 'Brea in the hang, side-on', kind: 'hero', minPx: 300 },
    { name: 'the whole kite', kind: 'object', object: 'survey-kite', minPx: 200, inLens: 0.95 },
  ],
  F53: [
    { name: 'Brea at T1\'s top', kind: 'hero', minPx: 200 },
    { name: 'the kite opening', kind: 'object', object: 'survey-kite', minPx: 80 },
  ],
  F54: [
    { name: 'the Organ Shelf road\'s five posts', kind: 'shapes', min: 5, minPx: 20,
      shapes: WIND_ROADS['organ-shelf'].map((p) => cyl(p.id, p.x, p.z, 0.08, POST_HEIGHT_M)) },
  ],
  F55: [
    { name: 'the flight read-out, bottom-centre', kind: 'dom', selector: '[data-readout="kite"]', minPx: 16 },
    { name: 'Brea in flight', kind: 'hero', minPx: 60 },
  ],
  F56: [
    { name: 'the Malpais ground', kind: 'ground', region: 'malpais', minShare: 0.25 },
    // a landform the lens stands against: its TOP in the safe area and unoccluded (a sampled flank would put points
    // behind a lens on its foot)
    { name: 'Rust Cone\'s top', kind: 'shapes', inLens: 1, visible: 1,
      shapes: [{ id: 'rust-cone-top', kind: 'point', x: RUST_CONE.x, z: RUST_CONE.z, y: RUST_CONE.top, up: 1 }] },
  ],
  F57: [
    { name: 'the two tower stubs, whole', kind: 'shapes', min: 2, minPx: 60, inLens: 0.9,
      shapes: YARDS.towers.map((t) => cyl(t.id, t.x, t.z, t.r0, t.h, { rTop: t.r1 })) },
    { name: 'the flue stacks (3-5)', kind: 'shapes', min: 3, minPx: 40, shapes: YARDS.stacks.map((s) => cyl(s.id, s.x, s.z, s.r, s.h)) },
    { name: 'the four wellheads', kind: 'shapes', min: 4, minPx: 6, inLens: 0.6, shapes: WELLHEADS.map((w) => cyl(w.id, w.x, w.z, w.r, w.h)) },
  ],
  F58: [
    { name: 'the hornitos (>= 5 of 3-6 m)', kind: 'shapes', min: 5, minPx: 20,
      shapes: HORNITOS.map((h) => ({ id: h.id, kind: 'cone', x: h.x, z: h.z, r: h.r, rTop: h.r * 0.3, h: h.h })) },
    { name: 'the tube shelter\'s mouth', kind: 'shapes', minPx: 30, shapes: [cyl('tube-mouth', TUBE_SHELTER.mouth.x, TUBE_SHELTER.mouth.z, TUBE_SHELTER.half, TUBE_SHELTER.height)] },
  ],

  // ---- (M3 fix round 1, EF4: "every staging of §3.3 and of the M2 set declares subjects") the M1 Frame Set and every
  // lane staging. Floors are the frames' own targets read as sizes (the header's rule): a full figure at a turntable
  // distance fills most of the frame (>= 500 px, 0.8 of her in the safe area), a figure in a scene >= 60-150 px, a face
  // close-up is her head (a 0.12 m sphere on the head bone), a screen is its panel's element, a landmark the frame
  // names is a site's cylinder (counted things >= 20 px; a far landmark >= 4-10 px), a look down at the ground its region
  ...M1_AND_LANE(),
});

/** The frames EF4's wave-2 list named (the brief's D5 set that has a staging, and §3.3's). */
export const EF4_WAVE2 = Object.freeze(['F39-look', 'F44', 'F45', 'F51', 'F52', 'F53', 'F54', 'F55', 'F56', 'F57', 'F58']);
/** (fix round 1) EF4's set is every staging: the Frame Set's and every lane's (subjects.test.mjs checks the count). */
export const EF4_FRAMES = EF4_WAVE2;

function M1_AND_LANE() {
  const hero = (minPx, extra = {}) => ({ name: 'Brea', kind: 'hero', minPx, ...extra });
  const whole = (minPx = 500) => hero(minPx, { name: 'Brea, the whole figure', inLens: 0.8 });
  const kind = (machine, minPx, min = 1, extra = {}) => ({ name: `the ${machine}${min > 1 ? ` (${min})` : ''}`, kind: 'machines', machine, min, minPx, ...extra });
  const people = (min, minPx, extra = {}) => ({ name: `${min} ${min > 1 ? 'people' : 'person'}`, kind: 'people', min, minPx, ...extra });
  const face = { name: 'her face (the head bone, 0.12 m)', kind: 'bone', bone: 'head', r: 0.12, minPx: 250 };
  const dom = (name, selector, minPx) => ({ name, kind: 'dom', selector, minPx });
  const place = (id, r, h, minPx, extra = {}) => ({ name: `${id}`, kind: 'shapes', minPx, inLens: 0.6, shapes: [site(id, r, h)], ...extra });
  const hub = (what) => [dom(`the ${what} panel`, '.mn-hub.show', 600)];
  const towers = (minPx) => ({ name: 'the Kiln Yards\' two tower stubs', kind: 'shapes', min: 2, minPx, inLens: 0.6,
    shapes: YARDS.towers.map((t) => cyl(t.id, t.x, t.z, t.r0, t.h, { rTop: t.r1 })) });
  return {
    // the M1 Frame Set (frameset.json)
    F01: [dom('the title', '.mn-title', 300)],
    F02: [hero(80), { name: 'the sun\'s disc', kind: 'sun' }, place('sounding-ring', 25, 6, 4)],
    F03: [hero(150), dom('the HUD\'s bearing strip', '.cal-strip', 20)],
    F04: [{ name: 'the Pans\' ground', kind: 'ground', region: 'pans', minShare: 0.5 }],
    F05: [hero(60)],
    F06: [hero(80)],
    F07: [place('saltrow', 45, 10, 30)],
    F08: [whole()], F09: [whole()], F10: [whole()],
    F11: [face], F12: [face], F13: [face],
    F14: [whole(450)], F15: [hero(350)], F16: [hero(400)], F17: [hero(150, { inLens: 0.5 })], F18: [hero(250)], F19: [hero(300)],
    F20: [hero(300), people(1, 300)],
    F21: [people(3, 200, { name: 'three faces', inLens: 0.25 })],
    F22: [people(2, 30)],   // a street inside the town: Saltrow's 45 m cylinder is round the lens (Node: 5 % of it in the lens)
    'F23-plumb': [hero(200), kind('plumb', 120)], 'F23-peg': [hero(200), kind('peg', 60)], 'F23-gauge': [hero(200), kind('gauge', 120)],
    F24: [hero(100), kind('plumb', 80)],
    F25: [hero(100), kind('plumb', 60), kind('peg', 15, 4)],
    F26: [dom('the Sighting card', '.calf-card', 60), kind('gauge', 60)],
    F27: hub('map'), F28: hub('Making'), F29: hub('character'),
    F30: [hero(200)],
    F31: [hero(80), kind('plumb', 40)],
    F32: [place('ninewalls', 60, 6, 10)],
    // lane stagings (tools/frames/stagings/*.mjs)
    'F45-trade': [hero(100), towers(20)],
    'F45-transit': [kind('transit', 60)],
    'F23-tiller': [hero(200), kind('tiller', 120)], 'F23-sickle': [hero(200), kind('sickle', 80)], 'F23-screed': [hero(150), kind('screed', 150)],
    F38: [hero(150), kind('tiller', 40, 3), kind('plumb', 30)],
    F39: [kind('screed', 100), kind('sickle', 40, 3), hero(100)],
    'F39-people': [kind('screed', 20), people(5, 8)],
    'F42-stowed': [whole(450)], 'F40-stowed': [whole(450)], 'F42-ready': [whole(450)], 'F42-readyfront': [whole(450)],
    F40: [whole(450)], 'F40-front': [whole(450)], F41: [whole(450)], 'F42-light': [whole(450)],
    'F40-open': [{ name: 'the Windwall open', kind: 'path', path: 'combat.windwall.prop.group', minPx: 200 }],
    F42: [hero(300), kind('sickle', 100)],
    F43: [hero(100), dom('the Kit Rack\'s sectors', '.kr-sec', 20)],
    // the town spills off the frame's edge at 60 m (Node: 43 % of its 45 m cylinder in the safe area): "Saltrow below" asks
    // for it in the frame, not whole
    'F51-cost': [place('sounding-ring', 25, 6, 4), place('saltrow', 45, 10, 6, { inLens: 0.3 })],
    F34: [place('ninewalls', 60, 6, 20)], F35: [place('ninewalls', 60, 6, 20)],
    F36: [people(5, 40)],
    F37: [hero(300), people(1, 300)],
    F46: [dom('the TRADE panel', '.tr-panel', 200)],
    F33: [place('ninewalls', 60, 6, 20)],
    'F33-scar': [{ name: 'the Holds\' ground (the Scar\'s floor)', kind: 'ground', region: 'holds', minShare: 0.2 }],
    'F33-trig': [place('ninewalls', 60, 6, 6)],
  };
}

export function subjectsFor(frame) {
  const s = frame?.subjects ?? SUBJECTS[frame?.id];
  return Array.isArray(s) && s.length ? JSON.parse(JSON.stringify(s)) : null;
}

export function validateSubjects(table = SUBJECTS) {
  const bad = [];
  for (const [id, list] of Object.entries(table)) {
    if (!Array.isArray(list) || !list.length) { bad.push(`${id}: no subjects`); continue; }
    for (const s of list) {
      if (!s.name) bad.push(`${id}: a subject with no name`);
      if (!KINDS.includes(s.kind)) bad.push(`${id}: '${s.name}' has an unknown kind '${s.kind}'`);
      if (s.kind === 'shapes' && !(s.shapes?.length)) bad.push(`${id}: '${s.name}' has no shapes`);
      if (s.min != null && s.kind === 'shapes' && s.min > s.shapes.length) bad.push(`${id}: '${s.name}' wants ${s.min} of ${s.shapes.length}`);
    }
  }
  return bad;
}

/**
 * The Node half (rule 17: "in Node from the camera matrix and the bounds where it can"): a fixed 'eye' lens on the
 * recipe's ground, its data subjects (shapes, the sun, ground regions) measured with the terrain as the only occluder.
 * Returns per subject the same verdict the page gives, with `node: true`; mesh kinds are listed as `page only`.
 */
export async function precheck(frame, { W = 1600, H = 900 } = {}) {
  const M = await import('./subject-math.mjs');
  const { heightAt } = await import('../../src/world/island/recipe.js');
  const { RegionMap } = await import('../../src/core/regions.js');
  const { Environment } = await import('../../src/world/environment.js');
  if (frame.camera?.mode !== 'eye' || !frame.at?.en) return { id: frame.id, skipped: `a '${frame.camera?.mode}' lens is measured in the page only` };
  const ground = (x, z) => heightAt(x, z);
  const L = M.eyeLens(frame, ground, W, H);
  const out = [];
  let map = null;
  for (const s of subjectsFor(frame) || []) {
    if (s.kind === 'shapes') {
      const members = s.shapes.map((sh) => {
        const pts = M.shapeSamples(sh, ground, L).map((p) => (sh.onGround ? [p[0], Math.max(p[1], ground(p[0], p[2]) + 1), p[2]] : p));
        const scr = pts.map((p) => M.project(L, p));
        const occ = pts.map((p, i) => (M.inSafe(L, scr[i]) ? !!M.groundBlocks(ground, L.pos, p, Math.max(0.3, (sh.r || 0.5) * 0.5)) : null));
        return { name: sh.id, ...M.judgeMember(L, s, scr, occ) };
      });
      out.push({ ...M.judgeSubject(s, members), node: true });
    } else if (s.kind === 'sun') {
      const { Vector3 } = await import('three');
      const d = Environment.direction(frame.hour, new Vector3());
      const p = [L.pos[0] + d.x * 4000, L.pos[1] + d.y * 4000, L.pos[2] + d.z * 4000];
      const scr = [M.project(L, p)], occ = [M.inSafe(L, scr[0]) ? !!M.groundBlocks(ground, L.pos, p, 1) : null];
      out.push({ ...M.judgeSubject(s, [{ name: 'disc', ...M.judgeMember(L, { ...s, inLens: 1, visible: 1 }, scr, occ) }]), node: true });
    } else if (s.kind === 'ground') {
      map ||= new RegionMap().build();
      const g = M.groundShare(L, ground, (x, z) => map.regionAt(x, z) === s.region);
      const pass = g.share >= (s.minShare || 0);
      out.push({ name: s.name, pass, share: g.share, groundShare: g.groundShare, why: pass ? [] : [`${(g.share * 100).toFixed(1)} % of the frame is ${s.region} ground < ${((s.minShare || 0) * 100).toFixed(0)} %`], node: true });
    } else out.push({ name: s.name, kind: s.kind, pageOnly: true });
  }
  return { id: frame.id, lens: { pos: L.pos.map((v) => +v.toFixed(1)) }, subjects: out, refusal: M.refusal(frame.id, out.filter((x) => !x.pageOnly)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const bad = validateSubjects();
  const ids = Object.keys(SUBJECTS);
  console.log(`subjects: ${ids.length} frames declare them (${ids.join(', ')}); EF4's wave-2 list ${EF4_WAVE2.filter((id) => SUBJECTS[id]).length} of ${EF4_WAVE2.length}`);
  {
    const { loadLanes } = await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'stagings/index.mjs')).href);
    const { loadFrameSet } = await import('./frameset.mjs');
    const all = [...loadFrameSet().frames, ...(await loadLanes()).frames];
    const missing = all.filter((f) => !subjectsFor(f)).map((f) => f.id);
    console.log(`every staging: ${all.length - missing.length} of ${all.length} declare subjects${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);
    if (missing.length) bad.push(`${missing.length} stagings declare no subjects`);
  }
  for (const b of bad) console.log('  FAIL', b);
  const i = args.indexOf('--precheck');
  if (i >= 0) {
    const want = new Set(args[i + 1].split(','));
    const { loadLanes } = await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'stagings/index.mjs')).href);
    const { loadFrameSet } = await import('./frameset.mjs');
    const L = await loadLanes();
    for (const f of [...loadFrameSet().frames, ...L.frames].filter((x) => want.has(x.id))) {
      const r = await precheck(f);
      if (r.skipped) { console.log(`${f.id}: ${r.skipped}`); continue; }
      console.log(`${f.id} (lens ${r.lens.pos.join(', ')}): ${r.refusal || 'every data subject passes (Node: terrain only)'}`);
      for (const s of r.subjects) console.log(`  ${s.pageOnly ? 'page only' : s.pass ? 'PASS' : 'FAIL'}  ${s.name}${s.share != null ? ` (${(s.share * 100).toFixed(1)} % of the frame; any ground ${(s.groundShare * 100).toFixed(1)} %)` : ''}${s.members ? ` (${s.members.map((m) => `${m.name} ${m.px} px, ${Math.round(m.inLens * 100)} % in, ${Math.round(m.visible * 100)} % seen`).join('; ')})` : ''}`);
    }
  }
  process.exit(bad.length ? 1 : 0);
}
