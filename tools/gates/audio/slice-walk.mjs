#!/usr/bin/env node
/**
 * THE SLICE WALK, RENDERED OFFLINE (BUILD M1.6k acceptance: "the slice walk at -18 LUFS +- 2, true peak <= -1 dB";
 * "each cue audible at its listed range"; TECH §14 "music sits 8 dB under ambience in calm play and ducks a further
 * 6 dB while any Instrument is hostile").
 *
 *   node tools/gates/audio/slice-walk.mjs [--out <dir>] [--seconds <n>]
 *
 * WHAT IS RENDERED. The SHIPPED files (public/audio/*.ogg, decoded with the system ffmpeg) mixed by the game's own
 * table (src/audio/slice/mix.js: bus trims, distance law, air high-cut, bed levels, foley levels, the cane's gust
 * levels, the music's trim and hostile duck; src/audio/buses.js DEFAULT_VOLUMES: the sliders; each set's row gain
 * from src/audio/manifest.js) along a scripted walk of "Raker's Morning" — Saltrow's street at the bell, the Pans past
 * the pumps to Sluice 3 as it opens, the Alidade on a Plumb, a crouch in the cane at the Glass through two gusts, the
 * dyke fight (a Plumb and three Pegs: chirps, mallet, shot, rush, four arrows, the vial, the topple, the lance), and
 * back to the Brazier to kindle, rest, open the map and save. The walk is a script of the slice's events at their
 * distances, NOT a capture of the running game. What is left out is said in the report (`notModelled`). The same walk
 * through the game's OWN graph (GameAudio on an OfflineAudioContext: HRTF, the reverb, the real DynamicsCompressor, the
 * Round-4 synth voices that still play) is the row A-audio-walk-graph (tools/gates/audio/walk-graph.mjs, fix round 1):
 * that row is the loudness and true-peak acceptance; this model stays for the audibility rows and the music's place.
 *
 * WHAT IS MEASURED. Integrated loudness (BS.1770-4) and true peak (4x) of the master after the safety limiter; the
 * ambience and music buses' loudness in the calm stretches (the 8 dB rule) and the music's level in the hostile
 * stretch (the 6 dB duck); and per counted cue, its level at its listed range against its place's bed, octave band by
 * octave band (audible: some band of the cue's loudest 50 ms at least 3 dB over the bed's mean in that band).
 *
 * Output (never in the repo): <out>/walk.wav (the capture, 24-bit), <out>/report.json; stdout: the summary.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUES, SLICE_COUNTED, CUE_BY_SET } from '../../../src/audio/slice/cues.js';
import { MANIFEST, SETS } from '../../../src/audio/manifest.js';
import { DEFAULT_VOLUMES } from '../../../src/audio/buses.js';
import {
  BUS_TRIM, distanceGain, cappedGain, airCutoff, MUSIC, LIMITER, shoreLevel, caneLevels, caneNear, FOLEY, creakLevel, CANE_LEAD,
} from '../../../src/audio/slice/mix.js';
import { MIX as MUSIC_MIX, STEM_SETS, BAR } from '../../../src/audio/music.js';
import { GustClock } from '../../../src/game/reeds/gust.js';
import { biquad } from '../../../src/audio/slice/dsp.js';
import { integratedLufs, truePeakDb, samplePeakDb, bandLevels, BANDS, shortTermMax } from './lufs.mjs';

const SR = 48000;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

/* ------------------------------------------------------------------ decoding the shipped bank */
const cache = new Map();
export function decode(file) {
  if (cache.has(file)) return cache.get(file);
  const abs = path.join(REPO, 'public/audio', file);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=channels', '-of', 'csv=p=0', abs], { encoding: 'utf8' });
  const ch = Number(String(probe.stdout).trim()) || 1;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', abs, '-f', 'f32le', '-ar', String(SR), '-ac', String(ch), 'pipe:1'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`decode ${file}: ${r.stderr}`);
  const all = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4);
  const n = all.length / ch;
  const chs = Array.from({ length: ch }, (_, c) => { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = all[i * ch + c]; return x; });
  cache.set(file, chs);
  return chs;
}

const SLIDER = { ambience: 'ambience', sfx: 'sfx', inst: 'sfx', brea: 'voice', ui: 'ui', music: 'music' };
/** The fixed gain from a bus to the output: trim x slider x master (as src/audio/buses.js wires them). */
export function busGain(bus) {
  const v = DEFAULT_VOLUMES;
  const trim = bus === 'music' ? BUS_TRIM.music * MUSIC.trim : BUS_TRIM[bus];
  return trim * v[SLIDER[bus]] * v.master;
}

/* ------------------------------------------------------------------ the mixer */
export class Mixer {
  constructor(sec) {
    this.n = Math.round(sec * SR);
    this.bus = {};
    for (const b of ['ambience', 'sfx', 'inst', 'brea', 'ui', 'music']) this.bus[b] = [new Float32Array(this.n), new Float32Array(this.n)];
    this.rr = new Map();
    this.played = new Map();
  }
  pick(set) {
    const rows = SETS[set];
    if (!rows) throw new Error(`no set ${set}`);
    const k = this.rr.get(set) || 0;
    this.rr.set(set, k + 1);
    return rows[k % rows.length];
  }
  /**
   * A one-shot. d: metres (0 = 2D, unity into both channels); az: azimuth (rad, 0 ahead, + right) for spatial voices
   * (equal-power, centre 0.707 per channel, as the panner); vol: the call's volume (x row gain).
   */
  voice(set, t, { d = 0, az = 0, vol = 1, bus = null } = {}) {
    const row = this.pick(set);
    const cue = CUE_BY_SET.get(set);
    const B = bus || cue.bus;
    const src = decode(row.file);
    let g = vol * (row.gain ?? 1);
    let chs;
    if (d > 0) {
      g = cappedGain(g, d) * distanceGain(d);
      const x = Float32Array.from(src.length > 1 ? src[0].map((v, i) => 0.5 * (v + src[1][i])) : src[0]);
      biquad(x, 'lp', airCutoff(d), 0.4);
      const k = (Math.max(-Math.PI / 2, Math.min(Math.PI / 2, az)) + Math.PI / 2) / Math.PI;
      chs = [[x, Math.cos(k * Math.PI / 2)], [x, Math.sin(k * Math.PI / 2)]];
    } else {
      chs = src.length > 1 ? [[src[0], 1], [src[1], 1]] : [[src[0], 1], [src[0], 1]];
    }
    const o = Math.round(t * SR);
    const [L, R] = this.bus[B];
    for (let c = 0; c < 2; c++) {
      const [x, pg] = chs[c];
      const out = c ? R : L;
      const m = Math.min(x.length, this.n - o);
      const gg = g * pg;
      for (let i = Math.max(0, -o); i < m; i++) out[o + i] += x[i] * gg;
    }
    this.played.set(set, (this.played.get(set) || 0) + 1);
  }
  /** A loop from t0 to t1 with a level function level(t s) (smoothed with time constant tau), at distance d. */
  loop(set, t0, t1, level, { d = 0, tau = 0.25, bus = null, az = 0 } = {}) {
    const row = SETS[set][0];
    const cue = CUE_BY_SET.get(set);
    const B = bus || cue.bus;
    const src = decode(row.file);
    let x = src;
    let pan = [1, 1];
    let g0 = row.gain ?? 1;
    if (d > 0) {
      const m = Float32Array.from(src.length > 1 ? src[0].map((v, i) => 0.5 * (v + src[1][i])) : src[0]);
      biquad(m, 'lp', airCutoff(d), 0.4);
      x = [m];
      g0 = cappedGain(g0, d) * distanceGain(d);
      const k = (az + Math.PI / 2) / Math.PI;
      pan = [Math.cos(k * Math.PI / 2), Math.sin(k * Math.PI / 2)];
    }
    const a = Math.round(t0 * SR), b = Math.min(this.n, Math.round(t1 * SR));
    const len = x[0].length;
    const off = Math.floor(len * 0.37);
    const [L, R] = this.bus[B];
    let lv = 0;
    const k = 1 - Math.exp(-1 / (tau * SR));
    for (let i = a; i < b; i++) {
      if ((i & 63) === 0 || i === a) this._target = level(i / SR);
      lv += (this._target - lv) * k;
      const j = (i - a + off) % len;
      const g = g0 * lv;
      L[i] += x[0][j] * g * pan[0];
      R[i] += (x[1] || x[0])[j] * g * pan[1];
    }
    this.played.set(set, (this.played.get(set) || 0) + 1);
  }
  /** The bus outputs through their fixed gains, summed, then the master's safety limiter. */
  master() {
    const L = new Float32Array(this.n), R = new Float32Array(this.n);
    for (const b of Object.keys(this.bus)) {
      const g = busGain(b);
      const [bl, br] = this.bus[b];
      for (let i = 0; i < this.n; i++) { L[i] += bl[i] * g; R[i] += br[i] * g; }
    }
    return limit([L, R]);
  }
  busOut(b) {
    const g = busGain(b);
    return this.bus[b].map((x) => x.map((v) => v * g));
  }
}

/** The DynamicsCompressor as a safety limiter (threshold, ratio; peak-follower with its attack and release). */
export function limit(chs) {
  // the node's effective behaviour (src/audio/slice/mix.js LIMITER): unity below the ceiling, limiting above it
  const th = Math.pow(10, LIMITER.ceiling / 20);
  const aK = 1 - Math.exp(-1 / (LIMITER.attack * SR)), rK = 1 - Math.exp(-1 / (LIMITER.release * SR));
  let env = 0, engaged = 0;
  const n = chs[0].length;
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(chs[0][i]), Math.abs(chs[1][i]));
    env += (p - env) * (p > env ? aK : rK);
    if (env > th) {
      const over = 20 * Math.log10(env / th);
      const gr = Math.pow(10, -(over - over / LIMITER.ratio) / 20);
      chs[0][i] *= gr; chs[1][i] *= gr; engaged++;
    }
  }
  limit.engagedS = engaged / SR;
  return chs;
}

/* ------------------------------------------------------------------ the walk */
const rnd = (() => { let a = 0x51ce; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();

/**
 * The script: segments of Brea's movement (speed m/s, surface set, crouch, place weights), and the events at their
 * times and distances. Times are seconds from the start of the capture.
 */
function script() {
  const S = [];   // [t0, t1, { speed, surface, crouch, town, shore, cane: dReed|null }]
  const E = [];   // [t, set, { d, az, vol }]
  S.push([0, 22, { speed: 1.6, surface: 'foot/cobble', town: 1, shore: 0.35 }]);          // down Saltrow's street
  S.push([22, 30, { speed: 1.6, surface: 'foot/dirt', town: 0.6, shore: 0.5 }]);          // the black sand at the pan edge
  S.push([30, 58, { speed: 3.6, surface: 'foot/gravel', town: 0.1, shore: 0.15 }]);        // a jog over the salt crust
  S.push([58, 72, { speed: 1.5, surface: 'foot/gravel', town: 0, shore: 0.1 }]);           // walking up to Sluice 3
  S.push([72, 84, { speed: 0, surface: 'foot/gravel', town: 0, shore: 0.05 }]);            // the Alidade on a Plumb
  S.push([84, 92, { speed: 1.2, surface: 'foot/silt', crouch: true, town: 0, shore: 0.2, cane: 6 }]);
  S.push([92, 112, { speed: 0, surface: 'foot/silt', crouch: true, town: 0, shore: 0.2, cane: 1 }]);   // still in the cane: gust, lull, gust
  S.push([112, 118, { speed: 1.4, surface: 'foot/silt', crouch: true, town: 0, shore: 0.2, cane: 1 }]);  // moving in the gust
  S.push([118, 150, { speed: 2.2, surface: 'foot/rock', town: 0, shore: 0.1, fight: true }]); // the dyke fight
  S.push([150, 168, { speed: 6.2, surface: 'foot/gravel', town: 0, shore: 0.1 }]);         // the sprint back
  S.push([168, 176, { speed: 1.4, surface: 'foot/grass', town: 0.3, shore: 0.2 }]);        // the meadow to the Brazier
  S.push([176, 190, { speed: 0, surface: 'foot/grass', town: 0.3, shore: 0.2 }]);          // kindle, rest, map, save

  // Saltrow: the bell on the hour, the work, gulls over the harbour
  for (const t of [3, 5.6, 8.2]) E.push([t, 'saltrow/bell', { d: 45, az: 0.6 }]);
  for (const [t, set, d] of [[2, 'saltrow/rake', 9], [6.5, 'saltrow/shovel', 7], [10, 'saltrow/rake', 14], [12, 'saltrow/cart', 6], [14.5, 'saltrow/hammer', 11],
    [17, 'saltrow/rake', 8], [19.5, 'saltrow/hammer', 18], [21, 'saltrow/shovel', 10], [25, 'saltrow/hammer', 30], [27, 'saltrow/rake', 26]]) E.push([t, set, { d, az: rnd() * 2 - 1 }]);
  for (const t of [4, 15, 26, 160, 182]) E.push([t, 'amb/gull', { d: 40 + rnd() * 30, az: rnd() * 2 - 1 }]);
  // the Pans: the bell carries (300 m) at the next hour, Sluice 3 opens, its float ring
  for (const t of [44, 46.6, 49.2]) E.push([t, 'saltrow/bell', { d: 300, az: -2 }]);
  E.push([62, 'gauge/gate', { d: 35, az: 0.3 }]);
  E.push([66, 'gauge/float', { d: 30, az: 0.3 }]);
  E.push([69, 'gauge/stilt', { d: 28, az: 0.3 }]);
  E.push([70.5, 'gauge/stilt', { d: 28, az: 0.3 }]);
  // the Alidade, a bearing, the Plumb's chime at 60 m, its lamp calm -> wary as she lingers
  E.push([73, 'alidade/raise', {}]);
  E.push([75.5, 'alidade/bearing', {}]);
  E.push([77, 'plumb/chime', { d: 60, az: -0.4 }]);
  E.push([80, 'lamp/wary', { d: 38, az: -0.4 }]);
  E.push([83, 'lamp/calm', { d: 38, az: -0.4 }]);
  E.push([86, 'plumb/servo', { d: 30, az: -0.4 }]);
  // the fight: Plumb at 25 m, three Pegs closing from 30 to 6 m
  const F = 118;
  E.push([F + 0.5, 'lamp/wary', { d: 25, az: -0.2 }]);
  E.push([F + 1.0, 'lamp/wary', { d: 28, az: 0.5 }]);
  E.push([F + 2.0, 'lamp/hostile', { d: 25, az: -0.2 }]);
  E.push([F + 2.3, 'lamp/hostile', { d: 26, az: 0.5 }]);
  E.push([F + 2.6, 'lamp/hostile', { d: 30, az: 0.9 }]);
  E.push([F + 2.9, 'lamp/hostile', { d: 29, az: 0.1 }]);
  for (let k = 0; k < 4; k++) {
    const t = F + 4 + k * 4.5;
    E.push([t, 'bow/nock', {}]);
    E.push([t + 0.5, 'bow/draw', {}]);
    E.push([t + 2.0, 'bow/loose', { vol: 1 }]);
    E.push([t + 2.09, 'bow/flyby', {}]);
    E.push([t + 2.6, k === 1 ? 'plumb/vial' : k === 3 ? 'bow/miss' : 'bow/hit', { d: 25, az: -0.2 }]);
  }
  E.push([F + 9.5, 'plumb/bob', { d: 22, az: -0.2 }]);
  for (let k = 0; k < 6; k++) E.push([F + 5 + k * 2.7, 'mstep/light', { d: 18 - k * 2, az: 0.4 }]);
  E.push([F + 7, 'peg/shot', { d: 20, az: 0.5 }]);
  E.push([F + 12, 'peg/rush', { d: 12, az: 0.3 }]);
  E.push([F + 13.5, 'peg/mallet', { d: 4, az: 0.3 }]);
  E.push([F + 15, 'inst/stagger', { d: 4, az: 0.3 }]);
  E.push([F + 14, 'plumb/topple', { d: 25, az: -0.2 }]);
  E.push([F + 20, 'lance/draw', {}]);
  for (let k = 0; k < 5; k++) {
    E.push([F + 21 + k * 1.3, 'lance/swing', { vol: k === 4 ? 1 : 0.8 }]);
    E.push([F + 21.25 + k * 1.3, k === 4 ? 'lance/heavy' : 'lance/hit', { d: 2.5, az: 0.2 }]);
  }
  E.push([F + 28, 'lance/pry', { d: 2.5, az: 0.2 }]);
  E.push([F + 28.5, 'lamp/dark', { d: 3, az: 0.2 }]);
  E.push([F + 28.6, 'inst/powerdown', { d: 3, az: 0.2 }]);
  E.push([F + 29.4, 'inst/collapse', { d: 3, az: 0.2 }]);
  E.push([F + 29.8, 'lamp/dark', { d: 25, az: -0.2 }]);
  E.push([F + 30, 'lamp/dark', { d: 14, az: 0.6 }]);
  E.push([F + 30.3, 'lamp/calm', { d: 30, az: 0.9 }]);
  for (const t of [F + 3, F + 10]) E.push([t, 'brea/breath-hard', {}]);
  E.push([F + 16, 'brea/hurt', {}]);
  // the sprint: the wrap and the quiver; a hop and a landing
  E.push([158, 'cloth/flap', {}]);
  E.push([158.6, 'gear/heavy', {}]);
  // the Brazier, the rest, the map, the triangle, the save
  E.push([177, 'brazier/kindle', { d: 2.5, az: 0.4 }]);
  E.push([179.3, 'make/quick', {}]);              // a bundle quick-made at the Brazier
  E.push([181, 'brazier/rest', {}]);
  E.push([184, 'ui/open', {}]); E.push([184.4, 'ui/map', {}]); E.push([185.2, 'ui/tab', {}]); E.push([185.8, 'ui/tick', {}]);
  E.push([186.5, 'ui/triangle', {}]); E.push([188, 'ui/select', {}]); E.push([188.3, 'ui/save', {}]); E.push([189, 'ui/close', {}]);
  return { S, E, sec: 190 };
}

export function renderWalk() {
  const { S, E, sec } = script();
  const M = new Mixer(sec);
  const segAt = (t) => S.find((s) => t >= s[0] && t < s[1])?.[2] || S[S.length - 1][2];
  const sm = (fn) => fn;

  // beds (2D, ambience bus), the trade wind, the shore
  M.loop('amb/pans', 0, sec, (t) => 1 - 0.8 * segAt(t).town, { tau: 0.6 });
  M.loop('amb/saltrow', 0, sec, (t) => segAt(t).town, { tau: 0.6 });
  M.loop('amb/shore', 0, sec, (t) => segAt(t).shore, { tau: 0.6 });
  M.loop('amb/trade', 0, sec, (t) => (1 - 0.6 * segAt(t).town), { tau: 0.8 });
  // wind in cane: bed 0's own gust clock, read CANE_LEAD ahead (the director's rule), from the walk's 84 s
  const clock = new GustClock(0x5eed0, 0);
  const caneAt = (t) => { const s = segAt(t); return s.cane == null ? null : s.cane; };
  const tc0 = 84 - 3;  // clock time at capture 84 s: pick a phase that puts gusts in the still stretch
  M.loop('amb/cane-gust', 84, 118, (t) => { const d = caneAt(t); if (d == null) return 0; return caneNear(d) * caneLevels(clock.speed(t - 84 + tc0 + CANE_LEAD)).gust; }, { tau: 0.06 });
  M.loop('amb/cane-lull', 84, 118, (t) => { const d = caneAt(t); if (d == null) return 0; return caneNear(d) * caneLevels(clock.speed(t - 84 + tc0 + CANE_LEAD)).lull; }, { tau: 0.12 });
  // positional loops: a pump passed at 25 m, the sluice running from 62 s, the Plumb's gyros in the fight, the Brazier
  M.loop('saltrow/pump', 30, 52, (t) => 1, { d: 25, az: -0.8 });
  M.loop('gauge/sluice', 62.3, 84, () => 1, { d: 35, az: 0.3 });
  M.loop('gauge/idle', 58, 84, () => 1, { d: 30, az: 0.3 });
  M.loop('plumb/gyro', 74, 132, () => 1, { d: 40, az: -0.4 });
  M.loop('peg/idle', 118, 146, () => 1, { d: 14, az: 0.4 });
  M.loop('brazier/burn', 177.5, sec, () => 1, { d: 2.5, az: 0.4 });
  // the bow's hold creak over each draw (rising for 1.5 s, then held)
  for (let k = 0; k < 4; k++) {
    const t = 118 + 4 + k * 4.5 + 0.5;
    M.loop('bow/creak', t, t + 1.5, (u) => creakLevel(Math.min(1, (u - t) / 1.2), u - t < 1.2), { tau: 0.05 });
  }

  // footsteps, cloth, gear from the segments (the stride rule of audio.js update())
  let phase = 0.38, stepN = 0;
  for (let t = 0; t < sec; t += 1 / 60) {
    const s = segAt(t);
    const sp = s.speed;
    if (sp > 0.6) {
      const stepLen = Math.min(1.92, Math.max(0.6, 0.5 + 0.3 * sp));
      phase += (sp / (2 * stepLen)) / 60;
      if (phase >= 0.5) {
        phase -= 0.5;
        const n = Math.min(1, sp / 8.2);
        M.voice(s.surface, t, { vol: FOLEY.step(n, !!s.crouch) });
        stepN++;
        if (stepN % 2 === 0) M.voice('cloth/brush', t + 0.02, { vol: FOLEY.cloth(n, !!s.crouch) });
        if (!s.crouch && n >= FOLEY.flapFrom) {
          if (stepN % 4 === 1) M.voice('cloth/flap', t + 0.03, { vol: FOLEY.cloth(n, false) });
          if (stepN % 3 === 0) M.voice('gear/light', t + 0.02, { vol: FOLEY.gear(n) });
        }
      }
    } else phase = 0.38;
  }
  for (const [t, set, o] of E) M.voice(set, t, { d: o.d || 0, az: o.az || 0, vol: o.vol ?? 1 });

  // the music: the Pans theme's stems from 0, the state's mix per bar (calm; suspicious at the Plumb; combat on the
  // dyke, resolve after), and the hostile duck while lamps are hostile (120.0 .. 148.5)
  const stateAt = (t) => (t >= 79 && t < 84 ? 'suspicious' : t >= 119 && t < 148.5 ? 'combat' : t >= 148.5 && t < 160 ? 'resolve' : 'calm');
  const hostileAt = (t) => t >= 120 && t < 148.5;
  const duck = Math.pow(10, -MUSIC.hostileDuckDb / 20);
  for (const [key, set] of Object.entries(STEM_SETS)) {
    M.loop(set, 0, sec, (t) => {
      const bar = Math.floor(t / BAR) * BAR;     // the state lands on the bar
      return (MUSIC_MIX[stateAt(bar)][key] ?? 0) * (hostileAt(t) ? duck : 1);
    }, { tau: BAR / 3 });
  }
  return { M, sec, S, E, stateAt, hostileAt };
}

/* ------------------------------------------------------------------ audibility at range */
/** The beds playing in each place, at their levels there (the director's _places at full town / shore / open pans). */
const PLACE_BEDS = {
  pans: [['amb/pans', 1], ['amb/trade', 1]],
  saltrow: [['amb/saltrow', 1], ['amb/trade', 0.4], ['amb/pans', 0.2]],
  shore: [['amb/shore', 1], ['amb/pans', 1], ['amb/trade', 1]],
};
/** Octave-band levels (dB) of a set of beds, mono, 8 s, through the ambience bus's fixed gain. */
export function bedBands(list) {
  const sec = 8;
  const n = sec * SR;
  const mono = new Float32Array(n);
  for (const [set, lvl] of list) {
    const row = SETS[set][0];
    const x = decode(row.file);
    const g = (row.gain ?? 1) * lvl * busGain('ambience');
    for (let i = 0; i < n; i++) mono[i] += 0.5 * (x[0][i % x[0].length] + (x[1] || x[0])[i % x[0].length]) * g;
  }
  return bandLevels(mono, 0, sec);
}
/** The bed a cue is heard over: the place's own beds at their levels there. */
function placeBed(place) { return bedBands(PLACE_BEDS[place]); }

export function audibility() {
  const beds = { pans: placeBed('pans'), saltrow: placeBed('saltrow'), shore: placeBed('shore') };
  const rows = [];
  for (const c of SLICE_COUNTED) {   // the slice's own cues (the first hour's are graded by tools/gates/audio/hour-walk.mjs)
    const row = SETS[c.set][0];
    const src = decode(row.file);
    let x = Float32Array.from(src.length > 1 ? src[0].map((v, i) => 0.5 * (v + src[1][i])) : src[0]);
    const r = c.range || 0;
    let g = (row.gain ?? 1) * busGain(c.bus);
    if (c.bus === 'music') {
      // a stem at its loudest state's mix (the tension layer in combat, under the hostile duck)
      const key = Object.keys(STEM_SETS).find((k) => STEM_SETS[k] === c.set);
      let best = 0;
      for (const [st, m] of Object.entries(MUSIC_MIX)) best = Math.max(best, (m[key] ?? 0) * (st === 'combat' ? Math.pow(10, -MUSIC.hostileDuckDb / 20) : 1));
      g *= best;
    }
    if (c.set.startsWith('amb/cane-')) {
      // the cane is a 2D bed scaled by the distance to the reed (mix.js caneNear); the gust at its full, the lull too
      g *= caneNear(r);
    } else if (r > 0) {
      g *= distanceGain(r);
      biquad(x, 'lp', airCutoff(r), 0.4);
      g *= Math.SQRT1_2;    // the panner's centre (equal power)
    }
    for (let i = 0; i < x.length; i++) x[i] *= g;
    const lv = bandLevels(x, 0, null, c.loop ? 0.4 : 0.05);
    const bed = beds[c.place || 'pans'];
    let best = -Infinity, at = 0;
    for (const f of BANDS) { const m = lv[f] - bed[f]; if (m > best) { best = m; at = f; } }
    const abs = Math.max(...BANDS.map((f) => lv[f]));
    if (c.bed) {
      // a bed is heard over the OTHER beds of its place (fix round 1: a margin, not a pass by definition): its own
      // full level against the rest of what plays there, band by band, 3 dB in some band
      const others = PLACE_BEDS[c.place || 'pans'].filter(([s]) => s !== c.set);
      const own = bedBands([[c.set, 1]]);
      const rest = bedBands(others);
      let bm = -Infinity, bat = 0;
      for (const f of BANDS) { const m = own[f] - rest[f]; if (m > bm) { bm = m; bat = f; } }
      rows.push({ set: c.set, bus: c.bus, range: 0, rangeFrom: c.rangeFrom, place: c.place, bed: true, over: others.map(([s, l]) => `${s}x${l}`).join('+'),
        marginDb: +bm.toFixed(1), band: bat, levelDb: +abs.toFixed(1), audible: bm >= 3 && abs > -50 });
      continue;
    }
    rows.push({ set: c.set, bus: c.bus, range: r, rangeFrom: c.rangeFrom, place: c.place, marginDb: +best.toFixed(1), band: at, levelDb: +abs.toFixed(1), audible: best >= 3 && abs > -80 });
  }
  return rows;
}

/* ------------------------------------------------------------------ main */
export function wav24(file, chs) {
  const n = chs[0].length, c = chs.length;
  const b = Buffer.alloc(44 + n * c * 3);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * c * 3, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(c, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * c * 3, 28); b.writeUInt16LE(c * 3, 32); b.writeUInt16LE(24, 34); b.write('data', 36); b.writeUInt32LE(n * c * 3, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let j = 0; j < c; j++) { const v = Math.max(-1, Math.min(1, chs[j][i])); b.writeIntLE(Math.round(v * 8388607), o, 3); o += 3; }
  writeFileSync(file, b);
}

export function lufsOver(chs, ranges) {
  const parts = [[], []];
  for (const [a, b] of ranges) { parts[0].push(chs[0].subarray(Math.round(a * SR), Math.round(b * SR))); parts[1].push(chs[1].subarray(Math.round(a * SR), Math.round(b * SR))); }
  const cat = (xs) => { const n = xs.reduce((s, x) => s + x.length, 0); const o = new Float32Array(n); let k = 0; for (const x of xs) { o.set(x, k); k += x.length; } return o; };
  return integratedLufs([cat(parts[0]), cat(parts[1])]);
}

async function main() {
  const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return '?'; } };
  const commit = git('rev-parse', '--short', 'HEAD');
  const dirty = git('status', '--porcelain', '--untracked-files=no', '--', 'src/audio', 'public/audio', 'tools/gates/audio').length > 0;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const out = flag('--out') || path.join(os.homedir(), '.calima-r5/review/runs', `${stamp}-${commit}-audio-walk`);
  if (path.resolve(out).startsWith(REPO + path.sep)) throw new Error('the capture goes outside the repo');
  mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  const { M, sec, stateAt, hostileAt } = renderWalk();
  const amb = M.busOut('ambience'), mus = M.busOut('music');
  const mix = M.master();
  const lufs = integratedLufs(mix);
  const tp = truePeakDb(mix);
  // the 8 dB rule: in the calm stretches the theme plays calm (0-79, 84-118, 160-190)
  const calm = [[0, 79], [84, 118], [160, 190]];
  const ambCalm = lufsOver(amb, calm), musCalm = lufsOver(mus, calm);
  const musHostile = lufsOver(mus, [[121, 148]]);
  const aud = audibility();
  // the five loudest moments (sample peak, 0.5 s apart) and the events within 0.4 s before them
  const { E } = script();
  const peaks = [];
  {
    const hop = Math.round(0.5 * SR);
    const blocks = [];
    for (let i = 0; i < mix[0].length; i += hop) {
      let pk = 0, at = i;
      for (let j = i; j < Math.min(mix[0].length, i + hop); j++) { const a = Math.max(Math.abs(mix[0][j]), Math.abs(mix[1][j])); if (a > pk) { pk = a; at = j; } }
      blocks.push([pk, at / SR]);
    }
    blocks.sort((a, b) => b[0] - a[0]);
    for (const [pk, t] of blocks.slice(0, 6)) peaks.push({ t: +t.toFixed(2), db: +(20 * Math.log10(pk)).toFixed(2), near: E.filter((e) => e[0] <= t && e[0] > t - 0.6).map((e) => `${e[1]}@${e[0]}${e[2].d ? '/' + e[2].d + 'm' : ''}`) });
  }
  const report = {
    row: 'M1.6k slice walk (offline render of the shipped bank through src/audio/slice/mix.js)', commit, dirty, seconds: sec,
    loudness: { integratedLufs: +lufs.toFixed(2), target: '-18 +- 2', pass: Math.abs(lufs + 18) <= 2 },
    truePeak: { dBTP: +tp.toFixed(2), samplePeakDb: +samplePeakDb(mix).toFixed(2), bar: '<= -1', pass: tp <= -1, limiterEngagedS: +(limit.engagedS || 0).toFixed(3) },
    shortTermMaxLufs: +shortTermMax(mix).toFixed(2),
    peaks,
    music: {
      calmAmbienceLufs: +ambCalm.toFixed(2), calmMusicLufs: +musCalm.toFixed(2), underAmbienceDb: +(ambCalm - musCalm).toFixed(2), want: MUSIC.underAmbienceDb,
      pass8: Math.abs(ambCalm - musCalm - MUSIC.underAmbienceDb) <= 1,
      hostileDuckDb: MUSIC.hostileDuckDb, hostileMusicLufs: +musHostile.toFixed(2), hostileUnderCalmDb: +(musCalm - musHostile).toFixed(2),
      passDuck: Math.abs(musCalm - musHostile - MUSIC.hostileDuckDb) <= 1,
    },
    audibility: { counted: aud.length, audible: aud.filter((r) => r.audible).length, failing: aud.filter((r) => !r.audible), rows: aud },
    played: Object.fromEntries([...M.played.entries()].sort()),
    notModelled: ['the reverb send and return (src/audio/buses.js convolver): adds a little level, mostly far cues',
      'occlusion and the rear head-shadow tilt', 'the Round-4 sidechain ducker on loud cues (lowers beds briefly)',
      'Concentration\'s world low-pass', 'HRTF (equal-power panning instead)', 'the Round-4 procedural voices still live as fallbacks'],
    ms: Date.now() - t0,
  };
  wav24(path.join(out, 'walk.wav'), mix);
  writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ out, commit, dirty, loudness: report.loudness, truePeak: report.truePeak, peaks, shortTermMaxLufs: report.shortTermMaxLufs, music: report.music, audible: `${report.audibility.audible}/${report.audibility.counted}`, failing: report.audibility.failing.map((r) => `${r.set} ${r.marginDb} dB @ ${r.range} m`) }, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
