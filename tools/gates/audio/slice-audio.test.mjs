/**
 * BUILD M1.6k rows that need no browser (node --test; Tier 0 runs every *.test.mjs):
 *
 *   cues-30          30 or more distinct counted cues, each with its files on disk and a CC0 row in the manifest
 *   six-buses        the mix graph has the six buses (ambience, world SFX, Instruments, Brea, UI, music) and each
 *                    reaches the output; the UI bypasses the world low-pass; every cue names one of the six
 *   size-8mb         public/audio/ <= 8 MB
 *   no-r4-names      every folder under public/audio/ is on the slice's allowlist (cues.js FOLDERS) and every file is
 *                    a manifest row (no stray, no Round-4 set left on disk)
 *   chirp-20-of-20   20 lamp-state changes (four Instruments at 10-40 m, each calm -> wary -> hostile -> wary -> calm ->
 *                    dark) through the director's own poll: 20 chirps, each the new state's
 *   gust-lead-0.8    the cane bed rendered from the shipped recipes and levels, driven by a bed's gust clock: in every
 *                    cycle the gust is heard (+6 dB over the lull) at least 0.8 s before the wind reaches 4 m/s
 *
 * Loudness, true peak, the music's place and each cue's audibility at its range are measured by the offline walk
 * (tools/gates/audio/slice-walk.mjs), which decodes the shipped Ogg files with ffmpeg; that run is not a Tier 0 row.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUES, COUNTED, FOLDERS, BUSES, filesOf } from '../../../src/audio/slice/cues.js';
import { MANIFEST } from '../../../src/audio/manifest.js';
import { buildBuses } from '../../../src/audio/buses.js';
import { SliceAudio } from '../../../src/audio/slice/director.js';
import { caneLevels, CANE_LEAD } from '../../../src/audio/slice/mix.js';
import { GustClock } from '../../../src/game/reeds/gust.js';
import { BEDS } from '../../../src/world/island/reedmask.js';
import { renderCue } from './build-bank.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const AUDIO = path.join(REPO, 'public/audio');

function walk(dir) {
  const out = { files: [], dirs: [] };
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { out.dirs.push(path.relative(AUDIO, p)); const r = walk(p); out.files.push(...r.files); out.dirs.push(...r.dirs); } else out.files.push(path.relative(AUDIO, p));
  }
  return out;
}

test('cues-30: 30 or more distinct counted cues, each on disk with a CC0 manifest row', () => {
  assert.ok(COUNTED.length >= 30, `counted cues: ${COUNTED.length}`);
  const rows = new Map(MANIFEST.map((r) => [r.file, r]));
  const missing = [];
  for (const c of CUES) {
    const files = c.keep ? MANIFEST.filter((r) => r.set === c.set).map((r) => r.file) : filesOf(c);
    if (!files.length) missing.push(`${c.set}: no files`);
    for (const f of files) {
      if (!existsSync(path.join(AUDIO, f))) missing.push(`${f}: not on disk`);
      const r = rows.get(f);
      if (!r || r.license !== 'CC0-1.0') missing.push(`${f}: no CC0 row`);
    }
  }
  assert.deepEqual(missing, []);
});

test('six-buses: ambience, world SFX, Instruments, Brea, UI and music each reach the output', () => {
  const node = () => ({ connect() {}, gain: { value: 1 }, frequency: { value: 0 }, Q: { value: 0 }, threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 } });
  const ac = {
    sampleRate: 48000, destination: {},
    createGain: node, createBiquadFilter: node, createDynamicsCompressor: node,
    createConvolver: () => ({ connect() {}, normalize: true, buffer: null }),
    createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }),
  };
  const B = buildBuses(ac, {});
  const G = B.graph;
  const want = { ambience: 'ambBus', sfx: 'sfxBus', inst: 'instBus', brea: 'breaBus', ui: 'uiBus', music: 'musicBus' };
  for (const [bus, name] of Object.entries(want)) {
    const p = G.pathFrom(name) || [];
    assert.ok(p.includes('destination'), `${bus} (${name}) does not reach the output: ${p.join('>')}`);
    if (bus !== 'music') assert.equal(B.dryFor(bus), B[name], `a ${bus} voice's dry path`);
  }
  assert.ok(!G.pathFrom('uiBus').includes('worldLP'), 'the UI must bypass the world low-pass');
  for (const n of ['instBus', 'breaBus', 'sfxBus', 'ambBus']) assert.ok(G.pathFrom(n).includes('worldLP'), `${n} must be under the world low-pass`);
  const used = new Set(CUES.map((c) => c.bus));
  assert.deepEqual([...used].filter((b) => !BUSES.includes(b)), []);
  assert.deepEqual(BUSES.filter((b) => !used.has(b)), [], 'every bus carries a cue');
});

test('size-8mb: public/audio is 8 MB or less', () => {
  const { files } = walk(AUDIO);
  const bytes = files.reduce((a, f) => a + statSync(path.join(AUDIO, f)).size, 0);
  assert.ok(bytes <= 8 * 1048576, `public/audio: ${(bytes / 1048576).toFixed(3)} MB`);
});

test('no-r4-names: every folder is the slice\'s and every file is a manifest row', () => {
  const { files, dirs } = walk(AUDIO);
  const listed = new Set(MANIFEST.map((r) => r.file));
  const strayDirs = dirs.filter((d) => !FOLDERS.includes(d.split(path.sep)[0]) || d.includes(path.sep));
  const strayFiles = files.filter((f) => f !== 'MANIFEST.md' && !listed.has(f));
  assert.deepEqual(strayDirs, [], 'folders off the allowlist (nested folders were the Round-4 layout)');
  assert.deepEqual(strayFiles, [], 'files with no manifest row');
  const setFolders = new Set(MANIFEST.map((r) => r.set.split('/')[0]));
  assert.deepEqual([...setFolders].filter((f) => !FOLDERS.includes(f)), []);
});

test('chirp-20-of-20: a chirp on every lamp-state change', () => {
  const played = [];
  const machines = [10, 20, 30, 40].map((d, i) => ({
    kind: ['plumb', 'peg', 'peg', 'gauge'][i], alive: true, state: 'patrol', eyeHeight: 1.4,
    sc: { lampDarkT: 0, dazeT: 0 }, position: { x: d, y: 0, z: 0 },
  }));
  const game = {
    ctx: { machines: { list: machines }, player: { position: { x: 0, y: 0, z: 0 } } },
    _listener: { x: 0, y: 0, z: 0 },
    playAt: (set, pos, opts) => { played.push({ set, x: pos.x, bus: opts.category }); return true; },
  };
  const dir = new SliceAudio(game);
  dir._lamps(game.ctx.player);                                   // first sight: no chirp
  assert.equal(played.length, 0);
  const steps = [['suspicious', 'wary'], ['alert', 'hostile'], ['search', 'wary'], ['patrol', 'calm'], ['dead', 'dark']];
  const want = [];
  for (const [state, lamp] of steps) {
    for (const m of machines) {
      m.state = state; if (state === 'dead') m.alive = false;
      dir._lamps(game.ctx.player);
      want.push({ set: `lamp/${lamp}`, x: m.position.x, bus: 'inst' });
    }
  }
  assert.equal(dir.lamp.changes, 20);
  assert.equal(dir.lamp.chirps, 20, `chirps ${dir.lamp.chirps} of ${dir.lamp.changes}`);
  assert.deepEqual(played, want);
});

test('gust-lead-0.8: the gust is heard 0.8 s or more before cover opens, every cycle', () => {
  const SR = 48000;
  const gustCue = CUES.find((c) => c.set === 'amb/cane-gust'), lullCue = CUES.find((c) => c.set === 'amb/cane-lull');
  const g = renderCue(gustCue, 0).chs, l = renderCue(lullCue, 0).chs;
  const mono = (x) => x[0].map((v, i) => 0.5 * (v + x[1][i]));
  const G = mono(g), L = mono(l);
  for (const bed of [BEDS[0], BEDS[3], BEDS[9]]) {
    const clock = new GustClock(bed.seed, bed.id);
    const t0 = 30, t1 = t0 + 6 * 14;
    const n = Math.round((t1 - t0) * SR);
    // the director's rule: levels read 20 times a second from the wind 0.8 s ahead, each loop's volume smoothed with
    // its time constant (0.06 s gust, 0.12 s lull), the loops' row gains
    const kG = 1 - Math.exp(-1 / (0.06 * SR)), kL = 1 - Math.exp(-1 / (0.12 * SR));
    let vg = 0, vl = 0, tg = 0, tl = 0;
    const env = [];
    let acc = 0, cnt = 0;
    const W = Math.round(0.05 * SR);
    for (let i = 0; i < n; i++) {
      const t = t0 + i / SR;
      if (i % (SR / 20) === 0) { const lv = caneLevels(clock.speed(t + CANE_LEAD)); tg = lv.gust; tl = lv.lull; }
      vg += (tg - vg) * kG; vl += (tl - vl) * kL;
      const s = G[i % G.length] * vg * gustCue.gain + L[i % L.length] * vl * lullCue.gain;
      acc += s * s; cnt++;
      if (cnt === W) { env.push(10 * Math.log10(acc / cnt + 1e-12)); acc = 0; cnt = 0; }
    }
    const at = (t) => env[Math.max(0, Math.min(env.length - 1, Math.floor((t - t0) / 0.05)))];
    const med = (a, b) => { const v = []; for (let t = a; t < b; t += 0.05) v.push(at(t)); v.sort((x, y) => x - y); return v[v.length >> 1]; };
    const leads = [];
    for (const sp of clock.spans(t0 + 6, t1 - 4).filter((q) => q.gust && q.start >= t0 + 5 && q.start <= t1 - 4)) {
      const T = sp.start;                                       // the wind rises through 4 m/s: cover opens
      const lull = med(T - 4, T - 2.6), full = med(T + 1, T + 3);
      assert.ok(full - lull > 10, `bed ${bed.id}: the gust is only ${(full - lull).toFixed(1)} dB over the lull`);
      let onset = null;
      for (let t = T - 4; t < T + 2; t += 0.05) if (at(t) >= lull + 6) { onset = t; break; }
      leads.push(+(T - onset).toFixed(2));
    }
    assert.ok(leads.length >= 4, `bed ${bed.id}: ${leads.length} gusts`);
    for (const d of leads) assert.ok(d >= 0.8 && d <= 2.5, `bed ${bed.id}: heard ${d} s before cover opens (want 0.8-2.5): ${leads.join(', ')}`);
  }
});
