/**
 * Milestone 2 audio rows that need no browser (node --test; Tier 0 runs every *.test.mjs). The first hour's sound:
 *
 *   m2-cues-30        30 or more NEW counted cues (src/audio/m2/cues.js), each with its files on disk and a CC0 row in the
 *                     manifest; their folders on the allowlist; public/audio <= 12 MB
 *   m2-zones          the zones on the regions seam: a walk from Saltrow up the road into Ninewalls, out along the Scar
 *                     to Benchmark 1 and on to the Malpais edge, with the real region map and tracker (src/core/regions.js)
 *                     driving the real director (src/audio/m2/director.js) through its events: at every `leave` the left
 *                     region's bed weight is at or under 0.35 and at every `enter` the entered one's at or over 0.65 (the
 *                     crossfade is done on the crossing), no bed's level steps more than 0.5 dB in a frame (no cut), the
 *                     beds' summed power never dips 3 dB under the quieter side of a crossing, and Ninewalls, the Scar
 *                     and the Malpais edge each come up to 0.9 or more where she stands in them
 *   m2-kit-cues       each event and each polled state plays its cue: the Windwall's open, shut, plant, block, parry and
 *                     bash; the gaff's swing, hit, hook and rip; the pots' throw, break, cinder and seize; the Screed's
 *                     charge, stall, seal, seize and cut; the re-survey's hold, mark and true; the Kit Rack's open, step
 *                     and take; the Holds' work by act and Oro's anvil and quench; the forge's hearth and bellows
 *   m2-kinds          the Tiller's own step and coring bed; the Screed's step stays mstep/heavy (A76's third class) with
 *                     its hull as a layer; the herd-trample's wind-up plays the tell
 *   m2-trample-lead   the tell is heard 1 s or more before contact: its audible onset (the shipped recipe at the trample's
 *                     distance over the Holds' beds, 50 ms windows) against the contact time of the Tiller's own
 *                     herd-trample table (read from src/instruments/kinds/tiller.js) for every start distance the table
 *                     allows, with her standing; walking and jogging toward it are reported, not graded (the table's
 *                     0.6 s wind-up from its 8.2 m minimum gives a walker 0.96 s and a jogger 0.81 s whatever the audio
 *                     does: the tell plays on the wind-up's first frame, onset 0 s)
 *   m2-calima         calima at noon: the wind thins (the trade layer down 9 dB or more at full calima) and the far sounds
 *                     drop (a one-shot at 100 m down 8 dB or more, at 10 m unchanged); the director reads the weather's
 *                     calima weight
 *
 * Loudness, true peak and each cue's audibility at its range are measured by the offline walk
 * (tools/gates/audio/hour-walk.mjs), which decodes the shipped Ogg files with ffmpeg; that run is not a Tier 0 row.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { M2_COUNTED, FOLDERS, filesOf, CUES } from '../../../src/audio/slice/cues.js';
import { M2_CUES } from '../../../src/audio/m2/cues.js';
import { MANIFEST } from '../../../src/audio/manifest.js';
import { HourAudio, WORK_ACTS } from '../../../src/audio/m2/director.js';
import { SliceAudio } from '../../../src/audio/slice/director.js';
import { bedLevels, calimaFarGain, chargeContactS, TRAMPLE, placeBeds } from '../../../src/audio/m2/mix.js';
import { BUS_TRIM, distanceGain, airCutoff } from '../../../src/audio/slice/mix.js';
import { DEFAULT_VOLUMES } from '../../../src/audio/buses.js';
import { RegionMap, RegionTracker } from '../../../src/core/regions.js';
import { ROAD, CENTRE as NW, PLACES } from '../../../src/world/settlements/ninewalls-layout.js';
import { SALTROW_MID } from '../../../src/audio/slice/director.js';
import { biquad } from '../../../src/audio/slice/dsp.js';
import { bandLevels, BANDS } from './lufs.mjs';
import { renderCue } from './build-bank.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const AUDIO = path.join(REPO, 'public/audio');
const SR = 48000;

function walkFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(p)); else out.push(p);
  }
  return out;
}

test('m2-cues-30: 30 or more new counted cues on disk with CC0 rows; public/audio <= 12 MB', () => {
  assert.ok(M2_COUNTED.length >= 30, `new counted cues: ${M2_COUNTED.length}`);
  const rows = new Map(MANIFEST.map((r) => [r.file, r]));
  const missing = [];
  for (const c of M2_CUES) {
    for (const f of filesOf(c)) {
      if (!existsSync(path.join(AUDIO, f))) missing.push(`${f}: not on disk`);
      const r = rows.get(f);
      if (!r || r.license !== 'CC0-1.0') missing.push(`${f}: no CC0 row`);
    }
    if (!FOLDERS.includes(c.set.split('/')[0])) missing.push(`${c.set}: folder off the allowlist`);
  }
  assert.deepEqual(missing, []);
  const sets = new Set(CUES.map((c) => c.set));
  assert.equal(sets.size, CUES.length, 'a set listed twice');
  const bytes = walkFiles(AUDIO).reduce((a, f) => a + statSync(f).size, 0);
  console.log(`# m2-cues-30: ${M2_COUNTED.length} new counted cues (${M2_CUES.reduce((a, c) => a + c.n, 0)} files); public/audio ${(bytes / 1048576).toFixed(3)} MB`);
  assert.ok(bytes <= 12 * 1048576, `public/audio: ${(bytes / 1048576).toFixed(3)} MB`);
});

/* ------------------------------------------------------------------ a stand-in game for the director */

function bus() {
  const m = new Map();
  return {
    on(n, f) { (m.get(n) || m.set(n, []).get(n)).push(f); },
    off(n, f) { const a = m.get(n); if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } },
    emit(n, p) { const a = m.get(n); if (a) for (const f of a.slice()) f(p); },
  };
}

function standIn(extra = {}) {
  const played = [];
  const ctx = {
    events: bus(), player: { position: { x: 0, y: 0, z: 0 }, heading: 0 }, terrain: { getHeight: () => 0 }, environment: { w: { calima: 0 } },
    ...extra,
  };
  const game = {
    ctx, ac: {}, buses: null, bank: null, zones: null,
    playAt: (set, pos, opts) => { played.push({ set, pos: pos ? { x: pos.x, z: pos.z } : null, bus: opts?.category }); return true; },
    play2D: (set, opts) => { played.push({ set, pos: null, bus: opts?.category }); return true; },
  };
  const h = new HourAudio(game);
  game.hour = h;
  h._bind(); h.ready = true;
  return { ctx, game, h, played };
}

/** The route: Saltrow's middle -> the road's foot -> up the road -> the village -> Benchmark 1 -> the Malpais edge. */
function route() {
  const pts = [[SALTROW_MID.x, SALTROW_MID.z], ...ROAD.map(([x, z]) => [x, z]), [NW.x, NW.z], [12, 282], [NW.x, NW.z], [99.6, 81.2], [118, 60]];
  return pts;
}

test('m2-zones: the beds crossfade on the regions seam\'s enter and leave, without a cut or a dip', () => {
  const map = new RegionMap().build();
  const tr = new RegionTracker(map);
  const { ctx, h } = standIn({ regions: { map } });
  for (const type of ['enter', 'leave']) tr.on(type, (e) => ctx.events.emit(`region-${type}`, e));
  const pts = route();
  const dt = 1 / 30, speed = 1.6;
  const ROW = { holds: 0.45, ninewalls: 0.5, scar: 0.45, malpais: 0.5 };
  const power = () => { const L = h.levels; return (0.4 * L.pansK) ** 2 + (0.48 * L.tradeK) ** 2 + (ROW.holds * L.holds) ** 2 + (ROW.ninewalls * L.ninewalls) ** 2 + (ROW.scar * L.scar) ** 2 + (ROW.malpais * L.malpais) ** 2; };
  const P = ctx.player.position;
  P.x = pts[0][0]; P.z = pts[0][1];
  tr.update(P.x, P.z);
  for (let i = 0; i < 90; i++) h.update(dt, true);       // settle at the start
  const crossings = [], series = [];
  let maxStep = 0, maxStepAt = null, t = 0, peakNine = 0, peakScar = 0, peakEdge = 0;
  const prev = { ...h.levels };
  tr.on('enter', (e) => crossings.push({ type: 'enter', region: e.region, t, w: h.zone[e.region === 'malpais' ? 'malpais' : e.region] }));
  tr.on('leave', (e) => crossings.push({ type: 'leave', region: e.region, t, w: h.zone[e.region === 'malpais' ? 'malpais' : e.region] }));
  for (let s = 1; s < pts.length; s++) {
    const [ax, az] = pts[s - 1], [bx, bz] = pts[s];
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / (speed * dt)));
    for (let k = 1; k <= n; k++) {
      P.x = ax + (bx - ax) * k / n; P.z = az + (bz - az) * k / n;
      t += dt;
      tr.update(P.x, P.z);
      h.update(dt, true);
      for (const key of ['holds', 'ninewalls', 'scar', 'malpais', 'pansK', 'tradeK']) {
        const a = prev[key], b = h.levels[key];
        if (a > 0.1 || b > 0.1) {      // a bed 20 dB or more under its full level is under the others: its steps are not heard
          const st = Math.abs(20 * Math.log10(Math.max(b, 0.01) / Math.max(a, 0.01)));
          if (st > maxStep) { maxStep = st; maxStepAt = { key, t: +t.toFixed(2), a: +a.toFixed(3), b: +b.toFixed(3) }; }
        }
        prev[key] = b;
      }
      peakNine = Math.max(peakNine, h.zone.nine); peakScar = Math.max(peakScar, h.levels.scar > 0 ? h.zone.scar : 0); peakEdge = Math.max(peakEdge, h.zone.edge);
      series.push([t, 10 * Math.log10(power())]);
    }
    // stand a moment at each corner where she stops (the village, B1, the edge)
    if ([pts.length - 5, pts.length - 4, pts.length - 1].includes(s)) for (let i = 0; i < 150; i++) { t += dt; h.update(dt, true); series.push([t, 10 * Math.log10(power())]); }
  }
  const at = (tt) => { let best = series[0]; for (const q of series) if (Math.abs(q[0] - tt) < Math.abs(best[0] - tt)) best = q; return best[1]; };
  const dips = [];
  for (const c of crossings) {
    const a = at(c.t - 8), b = at(c.t + 8);
    let lo = Infinity; for (const q of series) if (q[0] >= c.t - 8 && q[0] <= c.t + 8) lo = Math.min(lo, q[1]);
    dips.push({ ...c, dipDb: +(Math.min(a, b) - lo).toFixed(2) });
  }
  console.log(`# m2-zones: ${JSON.stringify({ crossings: dips.map((c) => `${c.type} ${c.region} @${c.t.toFixed(1)}s w=${c.w.toFixed(2)} dip ${c.dipDb} dB`), maxStepDb: +maxStep.toFixed(3), maxStepAt, peakNine: +peakNine.toFixed(2), peakScar: +peakScar.toFixed(2), peakEdge: +peakEdge.toFixed(2), walkS: +t.toFixed(0) })}`);
  const names = crossings.map((c) => `${c.type}:${c.region}`);
  for (const want of ['leave:pans', 'enter:holds', 'enter:malpais']) assert.ok(names.includes(want), `no ${want} on the walk: ${names.join(', ')}`);
  for (const c of crossings) {
    if (c.type === 'leave') assert.ok(c.w <= 0.35, `leave ${c.region} at ${c.t.toFixed(1)} s: its bed weight still ${c.w.toFixed(2)}`);
    else assert.ok(c.w >= 0.65, `enter ${c.region} at ${c.t.toFixed(1)} s: its bed weight only ${c.w.toFixed(2)}`);
  }
  for (const d of dips) assert.ok(d.dipDb <= 3, `the beds dip ${d.dipDb} dB at ${d.type} ${d.region}`);
  assert.ok(maxStep <= 0.5, `a bed steps ${maxStep.toFixed(2)} dB in one frame: ${JSON.stringify(maxStepAt)}`);
  assert.ok(peakNine >= 0.9 && peakScar >= 0.9 && peakEdge >= 0.9, `sub-zones: Ninewalls ${peakNine.toFixed(2)}, the Scar ${peakScar.toFixed(2)}, the edge ${peakEdge.toFixed(2)}`);
});

test('m2-kit-cues: every event and polled state of the first hour plays its cue', () => {
  const ww = { owned: true, phase: 'stowed' };
  const gaff = { owned: true, verbs: { count: 0, verb: null } };
  const pots = { owned: true, flying: null };
  const rack = { open: false, sel: 2 };
  const resurvey = { armed: true, running: true, R: { arc: 0, done: false } };
  const person = (id, act, x, z) => ({ id, act, person: { group: { position: { x, y: 0, z } } } });
  const list = Object.keys(WORK_ACTS).map((act, i) => person(`p${i}`, act, NW.x + i, NW.z));
  const { ctx, h, played } = standIn({
    combat: { windwall: ww, gaff, pots }, quickslots: { rack }, systemsGame: { hour: { resurvey } }, people: { holds: { routines: { list } } },
  });
  let loops = 0;
  h.game.zones = { ensure: (id, set) => { if (set === 'forge/fire') loops++; return true; }, has: () => false, retire: () => true };
  h._hold = { volume: 0, rowGain: 1 };
  ctx.player.position.x = NW.x; ctx.player.position.z = NW.z;
  const step = (n = 1) => { for (let i = 0; i < n; i++) h.update(1 / 30, true); };
  step();
  const E = ctx.events, m = { position: { x: NW.x + 10, y: 0, z: NW.z }, kind: 'screed' };
  // polled: the fan, the gaff's verbs, the pot, the rack, the hold
  ww.phase = 'opening'; step(); ww.phase = 'guard'; step(); ww.phase = 'closing'; step();
  gaff.verbs.count = 1; step(); gaff.verbs.count = 2; gaff.verbs.verb = { id: 'hookRip' }; step();
  pots.flying = {}; step(); pots.flying = null; step();
  rack.open = true; step(); rack.sel = 3; step(); rack.open = false; step();
  let holdMax = 0;
  for (let i = 0; i < 30; i++) { resurvey.R.arc += 0.05; step(); holdMax = Math.max(holdMax, h._holdLevel); }
  // events
  E.emit('windwall-planted', { x: 1, z: 2, h: 0.9 });
  E.emit('windwall-block', { result: 'block' }); E.emit('windwall-block', { result: 'parry' }); E.emit('windwall-bash', { kind: 'screed' });
  E.emit('gaff-hit', { verb: 'light1', kind: 'screed', torn: false }); E.emit('gaff-hit', { verb: 'hookRip', kind: 'screed', blown: 'off' });
  step(10);
  E.emit('pot-landed', { id: 'brine', at: { x: 3, y: 0, z: 4 } }); E.emit('pot-status', { kind: 'screed', pot: 'brine' }); E.emit('pot-landed', { id: 'cinder', at: { x: 3, y: 0, z: 4 } });
  for (const n of ['screed-charge', 'screed-stalled', 'seal-off', 'screed-seized', 'screed-cut']) E.emit(n, { machine: m });
  E.emit('resurvey-bearing', {}); E.emit('resurvey-done', {});
  // the work: every act's cue at its person within a few seconds; the forge's hearth and bellows
  step(30 * 16);
  const got = new Set(played.map((p) => p.set));
  const want = ['windwall/open', 'windwall/shut', 'windwall/plant', 'windwall/block', 'windwall/parry', 'windwall/bash', 'gaff/swing', 'gaff/hit', 'gaff/hook', 'gaff/rip',
    'pot/throw', 'pot/break', 'pot/cinder', 'pot/seize', 'screed/charge', 'screed/stall', 'screed/seal', 'screed/seize', 'screed/cut', 'alidade/mark', 'alidade/true',
    'rack/open', 'rack/step', 'rack/take', ...new Set(Object.values(WORK_ACTS).map((r) => r[0])), 'forge/bellows'];
  const missing = want.filter((s) => !got.has(s));
  console.log(`# m2-kit-cues: ${want.length - missing.length}/${want.length} cues played; hold up to ${holdMax.toFixed(2)}; forge hearth ensured ${loops} times`);
  assert.deepEqual(missing, []);
  assert.ok(holdMax >= 0.9, `the re-survey's hold came up to ${holdMax.toFixed(2)}`);
  assert.ok(loops > 0, 'the forge\'s hearth loop never stood up');
  for (const set of want) assert.ok(M2_CUES.some((c) => c.set === set), `${set} is not a first-hour cue row`);
});

test('m2-kinds: the Tiller and the Screed are voiced; A76\'s heavy class still heard on the Screed', () => {
  const played = [];
  const game = { ctx: { machines: { list: [] } }, playAt: (set) => { played.push(set); return true; } };
  const S = new SliceAudio(game);
  assert.equal(S.stepSet({ kind: 'tiller' }), 'tiller/step');
  assert.equal(S.idleSet({ kind: 'tiller' }), 'tiller/idle');
  assert.equal(S.stepSet({ kind: 'screed' }), null, 'the Screed must keep mstep/heavy (A76-footfalls counts it)');
  assert.equal(S.stepLayer({ kind: 'screed' }), 'screed/step');
  assert.equal(S.idleSet({ kind: 'screed' }), 'screed/idle');
  const m = { kind: 'tiller', position: { x: 0, y: 0, z: 0 } };
  assert.equal(S.attackPhase({ machine: m, attack: 'herd-trample', phase: 'windup' }), true);
  assert.deepEqual(played, ['tiller/trample']);
  S.attackPhase({ machine: m, attack: 'auger-jab', phase: 'strike' });
  assert.deepEqual(played, ['tiller/trample', 'inst/strike']);
});

/** The herd-trample's own table, read from the Tiller's source (the instruments lane owns it). */
function trampleTable() {
  const src = readFileSync(path.join(REPO, 'src/instruments/kinds/tiller.js'), 'utf8');
  const row = src.match(/id: 'herd-trample', min: ([\d.]+), max: ([\d.]+)[^\n]*\n\s*params: \{([^}]*)\}/);
  assert.ok(row, 'the herd-trample row is not in src/instruments/kinds/tiller.js');
  const P = Object.fromEntries(row[3].split(',').map((kv) => kv.split(':').map((s) => s.trim())).map(([k, v]) => [k, Number(v)]));
  return { min: Number(row[1]), max: Number(row[2]), windup: P.windup, strike: P.strike, speed: P.speed, range: P.range };
}

test('m2-trample-lead: the tell is heard 1 s or more before the trample lands', () => {
  const T = trampleTable();
  const cue = M2_CUES.find((c) => c.set === TRAMPLE.set);
  const tell = renderCue(cue, 0).chs[0];
  // the Holds' beds (as the director plays them on the slope), rendered from the shipped recipes, mono
  const beds = placeBeds('holds');
  let bedMono = null;
  for (const [set, lvl] of beds) {
    const c = CUES.find((q) => q.set === set);
    const r = renderCue(c, 0).chs;
    const g = (c.gain ?? 1) * lvl * BUS_TRIM.ambience * DEFAULT_VOLUMES.ambience * DEFAULT_VOLUMES.master;
    if (!bedMono) bedMono = new Float32Array(SR * 6);
    for (let i = 0; i < bedMono.length; i++) bedMono[i] += 0.5 * (r[0][i % r[0].length] + r[1][i % r[1].length]) * g;
  }
  const bed = bandLevels(bedMono, 0, 6);
  const onsetAt = (d) => {
    const x = Float32Array.from(tell);
    biquad(x, 'lp', airCutoff(d), 0.4);
    const g = Math.min(cue.gain, 1 / distanceGain(d)) * distanceGain(d) * Math.SQRT1_2 * BUS_TRIM.inst * DEFAULT_VOLUMES.sfx * DEFAULT_VOLUMES.master;
    for (let i = 0; i < x.length; i++) x[i] *= g;
    for (let w = 0; w * 0.05 < 1.0; w++) {
      const lv = bandLevels(x, w * 0.05, (w + 1) * 0.05);
      if (BANDS.some((f) => lv[f] - bed[f] >= 3)) return w * 0.05;
    }
    return null;
  };
  const rows = [];
  for (const d0 of [T.min, 10, 14, 20, T.max]) {
    const onset = onsetAt(d0);
    for (const [who, closing] of [['standing', 0], ['walking toward it (reported)', 1.6], ['jogging toward it (reported)', 3.6]]) {
      const c = chargeContactS(T, d0, closing);
      rows.push({ d0, who, onset, contact: c == null ? null : +c.toFixed(3), lead: c == null || onset == null ? null : +(c - onset).toFixed(3) });
    }
  }
  console.log(`# m2-trample-lead: ${JSON.stringify({ table: T, rows: rows.map((r) => `${r.d0} m ${r.who}: onset ${r.onset} s, contact ${r.contact ?? 'miss'} s, lead ${r.lead ?? '-'} s`) })}`);
  for (const r of rows) {
    assert.ok(r.onset != null, `the tell is not heard over the Holds at ${r.d0} m`);
    if (r.contact == null || /reported/.test(r.who)) continue;
    assert.ok(r.lead >= TRAMPLE.leadS, `${r.d0} m, ${r.who}: heard ${r.lead} s before contact`);
  }
});

test('m2-calima: the wind thins and the far sounds drop in the calima', () => {
  const trade = 20 * Math.log10(bedLevels({ pans: 0, holds: 1, calima: 1 }).tradeK / bedLevels({ pans: 0, holds: 1, calima: 0 }).tradeK);
  const far = 20 * Math.log10(calimaFarGain(100, 1)), near = 20 * Math.log10(calimaFarGain(10, 1));
  const { ctx, h } = standIn();
  ctx.environment.w.calima = 0.75; h.update(1 / 30, true);
  console.log(`# m2-calima: ${JSON.stringify({ tradeDb: +trade.toFixed(2), at100mDb: +far.toFixed(2), at10mDb: +near.toFixed(2), directorReads: h.calima })}`);
  assert.ok(trade <= -9, `the trade wind thins only ${trade.toFixed(2)} dB`);
  assert.ok(far <= -8, `a one-shot at 100 m drops only ${far.toFixed(2)} dB`);
  assert.equal(near, 0);
  assert.equal(h.calima, 0.75);
  assert.ok(h.levels.calima > 0.7, 'the calima bed did not come up');
});
