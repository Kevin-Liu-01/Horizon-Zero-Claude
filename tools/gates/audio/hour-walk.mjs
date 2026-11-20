#!/usr/bin/env node
/**
 * THE FIRST HOUR'S WALK, RENDERED OFFLINE (Milestone 2 audio acceptance: "the first-hour walk at -18 LUFS +- 2, true
 * peak <= -1 dB"; "30 or more new cues, each audible at its range").
 *
 *   node tools/gates/audio/hour-walk.mjs [--out <dir>]
 *
 * WHAT IS RENDERED. The SHIPPED files (public/audio/*.ogg, decoded with the system ffmpeg) mixed by the game's own tables
 * (src/audio/slice/mix.js: bus trims, the distance law, the air's high-cut, the foley levels, the music's trim and duck;
 * src/audio/m2/mix.js: the zones' bed levels, the calima's far drop; each set's row gain from src/audio/manifest.js)
 * along a scripted walk of legs 2 and 3 of the first hour ("The Scar" and "True Ground", 250 s): out of Saltrow and up
 * the road into the Holds (the Pans -> Holds crossing), the Tiller herd on the slope (its coring, its steps, one trample
 * tell and its hit), the second Plumb on the terrace, into Ninewalls (the work at the pits and the cistern, Oro's forge,
 * the hand-over and the Kit Rack), the Screed fight (charges, a stall on a wall, the Windwall's guard, block, parry,
 * plant and bash, the gaff's hook-rip on both seals, Brine and Cinder, one wall cut), the Scar's line to Benchmark 1
 * and the re-survey (the hold, three bearings, the lookers), the rest at the Ninewalls Brazier, then calima at noon and
 * the walk to the Malpais edge. The script is the hour's events at their distances, NOT a capture of the running game;
 * what is left out is the slice walk's list (`notModelled`).
 *
 * WHAT IS MEASURED. (1) Integrated loudness (BS.1770-4) and true peak (4x) of this walk's master after the safety
 * limiter, and of THE FIRST HOUR'S WALK: the slice's walk (tools/gates/audio/slice-walk.mjs, leg 1) followed by this one
 * (legs 2 and 3), 440 s. (2) Per first-hour counted cue (src/audio/m2/cues.js), its level at its listed range over its
 * place's beds (src/audio/m2/mix.js placeBeds), octave band by octave band (audible: some band of the cue's loudest
 * 50 ms at least 3 dB over the beds' mean in that band; a bed: its own level over the rest of its place's beds). (3) The
 * calima's far drop on a far one-shot (Oro's anvil at 100 m) and the trade wind's thinning, as rendered.
 *
 * Output (never in the repo): <out>/hour-walk.wav, <out>/first-hour-walk.wav (24-bit), <out>/report.json.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { M2_COUNTED, CUE_BY_SET } from '../../../src/audio/slice/cues.js';
import { SETS } from '../../../src/audio/manifest.js';
import { distanceGain, airCutoff, MUSIC, FOLEY, creakLevel } from '../../../src/audio/slice/mix.js';
import { bedLevels, placeBeds, calimaFarGain } from '../../../src/audio/m2/mix.js';
import { MIX as MUSIC_MIX, STEM_SETS, BAR } from '../../../src/audio/music.js';
import { biquad } from '../../../src/audio/slice/dsp.js';
import { integratedLufs, truePeakDb, samplePeakDb, bandLevels, BANDS, shortTermMax } from './lufs.mjs';
import { Mixer, renderWalk, decode, busGain, bedBands, wav24, lufsOver } from './slice-walk.mjs';

const SR = 48000;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const ramp = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const rnd = (() => { let a = 0x4011d; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();

export const HOUR_SEC = 250;

/** The zones over the walk (the director's weights, as the script crosses them). */
export function zoneAt(t) {
  const pans = 1 - ramp(t, 16, 28);                               // the crossing at about 22 s (enter holds)
  const malpais = ramp(t, 238, 248);                              // the crossing into the Malpais at about 243 s
  const holds = Math.max(0, 1 - pans - malpais);
  const nine = Math.max(ramp(t, 90, 98) * (1 - ramp(t, 166, 174)), ramp(t, 199, 205) * (1 - ramp(t, 214, 224)));
  const scar = ramp(t, 172, 178) * (1 - ramp(t, 194, 200));
  const edge = ramp(t, 224, 244);
  const calima = ramp(t, 214, 224);
  const town = 0.3 * (1 - ramp(t, 4, 14)), shore = 0.2 * (1 - ramp(t, 4, 16));
  return { pans, holds, other: 0, malpais, nine, scar, edge, calima, town, shore };
}

/** The script: Brea's movement and the hour's events (t s, set, { d m, az rad, vol }). */
function script() {
  const S = [];
  const E = [];
  S.push([0, 16, { speed: 1.6, surface: 'foot/cobble' }]);       // Saltrow's upper street
  S.push([16, 46, { speed: 1.6, surface: 'foot/dirt' }]);        // the road's hairpins
  S.push([46, 62, { speed: 1.2, surface: 'foot/dirt', crouch: true }]);   // in the herd's lee
  S.push([62, 92, { speed: 2.0, surface: 'foot/rock', fight: true }]);    // the terrace Plumb
  S.push([92, 104, { speed: 1.5, surface: 'foot/rock' }]);       // into Ninewalls
  S.push([104, 120, { speed: 0, surface: 'foot/rock' }]);        // Oro's hand-over, the Kit Rack
  S.push([120, 166, { speed: 2.4, surface: 'foot/dirt', fight: true }]);  // the Screed
  S.push([166, 180, { speed: 3.6, surface: 'foot/gravel' }]);    // down the Scar's line
  S.push([180, 197, { speed: 0, surface: 'foot/gravel' }]);      // the re-survey on the mark
  S.push([197, 205, { speed: 3.0, surface: 'foot/dirt' }]);      // back to the village
  S.push([205, 214, { speed: 0, surface: 'foot/rock' }]);        // the rest at the Brazier
  S.push([214, 250, { speed: 1.6, surface: 'foot/rock' }]);      // calima at noon; the Malpais edge

  // Saltrow behind her: the bell, gulls; the road up
  for (const t of [2, 4.6, 7.2]) E.push([t, 'saltrow/bell', { d: 110, az: -2 }]);
  E.push([5, 'amb/gull', { d: 60, az: 1 }]);
  // the herd on the slope: its stilts, a trample tell at 22 m and its hit
  for (let k = 0; k < 10; k++) E.push([38 + k * 2.1, 'tiller/step', { d: 26 - k * 1.2, az: 0.5 }]);
  E.push([44, 'lamp/wary', { d: 22, az: 0.5 }]);
  E.push([52, 'tiller/trample', { d: 22, az: 0.4 }]);
  E.push([53.4, 'inst/strike', { d: 3, az: 0.2 }]);
  E.push([53.5, 'brea/hurt', {}]);
  E.push([55, 'lamp/calm', { d: 18, az: 0.6 }]);
  // the terrace Plumb: chirps, chime, arrows, the vial, the topple
  const F = 62;
  E.push([F + 1, 'plumb/chime', { d: 14, az: -0.3 }]);
  E.push([F + 1.6, 'lamp/hostile', { d: 14, az: -0.3 }]);
  for (let k = 0; k < 4; k++) {
    const t = F + 4 + k * 5;
    E.push([t, 'bow/nock', {}]); E.push([t + 0.5, 'bow/draw', {}]); E.push([t + 2.0, 'bow/loose', {}]); E.push([t + 2.09, 'bow/flyby', {}]);
    E.push([t + 2.5, k === 2 ? 'plumb/vial' : 'bow/hit', { d: 12, az: -0.3 }]);
  }
  E.push([F + 12, 'plumb/bob', { d: 11, az: -0.3 }]);
  E.push([F + 26, 'plumb/topple', { d: 12, az: -0.3 }]);
  E.push([F + 27, 'lamp/dark', { d: 12, az: -0.3 }]);
  E.push([F + 28, 'make/quick', {}]);
  // into Ninewalls: the work, the forge, Oro's hand-over and the Kit Rack
  for (const [t, set, d] of [[93, 'holds/hoe', 14], [95.5, 'holds/hoe', 14], [97, 'holds/bucket', 9], [99, 'holds/sow', 11], [101, 'holds/pick', 12],
    [103, 'holds/sort', 8], [106, 'holds/water', 13], [110, 'holds/hoe', 18], [114, 'holds/bucket', 10]]) E.push([t, set, { d, az: rnd() * 2 - 1 }]);
  for (const t of [100, 101.4, 102.9, 104.3, 108, 109.5, 111, 117, 118.4]) E.push([t, 'forge/anvil', { d: t < 104.5 ? 9 : 4, az: 0.7 }]);
  E.push([106, 'forge/bellows', { d: 4, az: 0.7 }]);
  E.push([112.5, 'forge/quench', { d: 4, az: 0.7 }]);
  E.push([115, 'gear/heavy', {}]); E.push([115.4, 'ui/select', {}]);
  E.push([116, 'rack/open', {}]); E.push([116.4, 'rack/step', {}]); E.push([116.7, 'rack/step', {}]); E.push([117.1, 'rack/take', {}]);
  // the Screed: it engages, charges, stalls on a wall, its seals come off to the gaff, Brine and Cinder; one wall cut
  const G = 120;
  for (let k = 0; k < 16; k++) E.push([G + 1 + k * 2.6, 'mstep/heavy', { d: Math.max(8, 60 - k * 4), az: 0.2 }]);
  for (let k = 0; k < 16; k++) E.push([G + 1.05 + k * 2.6, 'screed/step', { d: Math.max(8, 60 - k * 4), az: 0.2 }]);
  E.push([G + 2, 'lamp/hostile', { d: 58, az: 0.2 }]);
  E.push([G + 6, 'gaff/swing', {}]);
  E.push([G + 9, 'windwall/open', {}]);
  E.push([G + 12, 'screed/charge', { d: 26, az: 0.1 }]);
  E.push([G + 15.5, 'screed/stall', { d: 11, az: 0.1 }]);
  E.push([G + 17, 'windwall/shut', {}]);
  E.push([G + 18, 'gaff/swing', { vol: 1 }]); E.push([G + 18.4, 'gaff/hook', { d: 1.6, az: 0.1 }]); E.push([G + 18.6, 'gaff/rip', { d: 1.6, az: 0.1 }]);
  E.push([G + 18.7, 'screed/seal', { d: 3, az: 0.1 }]);
  E.push([G + 22, 'pot/throw', {}]); E.push([G + 23.1, 'pot/break', { d: 9, az: 0.3 }]); E.push([G + 23.5, 'pot/seize', { d: 9, az: 0.3 }]);
  E.push([G + 24, 'screed/seize', { d: 9, az: 0.3 }]);
  E.push([G + 26, 'windwall/open', {}]); E.push([G + 27.5, 'windwall/block', { d: 0.8, az: 0 }]); E.push([G + 29, 'windwall/parry', { d: 0.8, az: 0 }]);
  E.push([G + 30, 'windwall/bash', { d: 0.9, az: 0 }]);
  E.push([G + 31, 'gaff/swing', {}]); E.push([G + 31.3, 'gaff/hit', { d: 1.5, az: 0.1 }]);
  E.push([G + 32, 'screed/cut', { d: 30, az: -0.8 }]);
  E.push([G + 34, 'windwall/plant', { d: 1.2, az: 0.2 }]);
  E.push([G + 36, 'screed/charge', { d: 22, az: 0.2 }]);
  E.push([G + 39.5, 'screed/stall', { d: 4, az: 0.2 }]);
  E.push([G + 40, 'pot/throw', {}]); E.push([G + 41, 'pot/cinder', { d: 8, az: 0.2 }]);
  E.push([G + 42, 'gaff/swing', { vol: 1 }]); E.push([G + 42.4, 'gaff/hook', { d: 1.6, az: 0.2 }]); E.push([G + 42.6, 'gaff/rip', { d: 1.6, az: 0.2 }]);
  E.push([G + 42.7, 'screed/seal', { d: 3, az: 0.2 }]);
  E.push([G + 44, 'lamp/calm', { d: 4, az: 0.2 }]);
  E.push([G + 45, 'windwall/shut', {}]);
  for (const t of [G + 14, G + 33]) E.push([t, 'brea/breath-hard', {}]);
  // the Scar's line, the re-survey: the hold, three bearings, two Pegs come to look
  E.push([181, 'alidade/raise', {}]);
  E.push([185, 'alidade/mark', {}]); E.push([189, 'alidade/mark', {}]); E.push([193, 'alidade/mark', {}]);
  E.push([196, 'alidade/true', {}]);
  E.push([186, 'lamp/wary', { d: 24, az: 1.2 }]); E.push([187, 'lamp/hostile', { d: 16, az: 1.2 }]);
  E.push([190, 'peg/mallet', { d: 4, az: 1.0 }]); E.push([192, 'peg/shot', { d: 10, az: -1.0 }]);
  E.push([195, 'lamp/calm', { d: 12, az: 1.0 }]);
  // the rest at the Ninewalls Brazier (Oro's anvil heard across the village)
  E.push([206, 'brazier/kindle', { d: 2.5, az: 0.4 }]); E.push([209, 'brazier/rest', {}]);
  for (const t of [207, 208.5, 210]) E.push([t, 'forge/anvil', { d: 25, az: -0.9 }]);
  // calima at noon and the walk to the Malpais edge: the far sounds drop (the anvil 100 m behind her; the bell)
  for (const t of [218, 219.4, 220.9, 230, 231.4]) E.push([t, 'forge/anvil', { d: 100, az: -2.6 }]);
  for (const t of [236, 238.6, 241.2]) E.push([t, 'saltrow/bell', { d: 300, az: -2.8 }]);
  E.push([244, 'alidade/raise', {}]); E.push([247, 'alidade/bearing', {}]);
  return { S, E, sec: HOUR_SEC };
}

export function renderHourWalk() {
  const { S, E, sec } = script();
  const M = new Mixer(sec);
  const segAt = (t) => S.find((s) => t >= s[0] && t < s[1])?.[2] || S[S.length - 1][2];
  const Lv = (t) => bedLevels(zoneAt(t));
  // the slice's beds under the zones (src/audio/slice/director.js _places) and the first hour's (src/audio/m2/director.js)
  M.loop('amb/pans', 0, sec, (t) => { const z = zoneAt(t); return (1 - 0.8 * z.town) * Lv(t).pansK; }, { tau: 0.6 });
  M.loop('amb/saltrow', 0, sec, (t) => zoneAt(t).town * Lv(t).pansK, { tau: 0.6 });
  M.loop('amb/shore', 0, sec, (t) => zoneAt(t).shore, { tau: 0.6 });
  M.loop('amb/trade', 0, sec, (t) => (1 - 0.6 * zoneAt(t).town) * Lv(t).tradeK, { tau: 0.8 });
  for (const [set, k] of [['amb/holds', 'holds'], ['amb/ninewalls', 'ninewalls'], ['amb/scar', 'scar'], ['amb/malpais', 'malpais'], ['amb/calima', 'calima']]) {
    M.loop(set, 0, sec, (t) => Lv(t)[k], { tau: 0.5 });
  }
  // positional loops: the herd's coring, the terrace Plumb's gyros, the forge, the Screed working, the Brazier
  M.loop('tiller/idle', 34, 60, () => 1, { d: 18, az: 0.5 });
  M.loop('tiller/idle', 36, 60, () => 1, { d: 27, az: 0.8 });
  M.loop('plumb/gyro', 60, 88, () => 1, { d: 14, az: -0.3 });
  M.loop('forge/fire', 98, 120, () => 1, { d: 6, az: 0.7 });
  M.loop('screed/idle', 120, 166, () => 1, { d: 18, az: 0.2 });
  M.loop('brazier/burn', 206, 214, () => 1, { d: 2.5, az: 0.4 });
  // the re-survey's hold: up while the arc fills (181-196)
  M.loop('alidade/hold', 182, 196, () => 1, { tau: 0.15 });
  for (let k = 0; k < 4; k++) { const t = 62 + 4 + k * 5 + 0.5; M.loop('bow/creak', t, t + 1.5, (u) => creakLevel(Math.min(1, (u - t) / 1.2), u - t < 1.2), { tau: 0.05 }); }
  // footsteps, cloth, gear (the stride rule of audio.js update())
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
      }
    } else phase = 0.38;
  }
  // the one-shots, the calima's far drop on each (GameAudio.playAt: src/audio/m2/director.js farGain)
  for (const [t, set, o] of E) {
    const far = o.d ? calimaFarGain(o.d, zoneAt(t).calima) : 1;
    M.voice(set, t, { d: o.d || 0, az: o.az || 0, vol: (o.vol ?? 1) * far });
  }
  // the music: the Pans theme, its states, the hostile duck (the slice walk's rule)
  const stateAt = (t) => (t >= 44 && t < 62 ? 'suspicious' : (t >= 62 && t < 90) || (t >= 121 && t < 165) || (t >= 186 && t < 196) ? 'combat' : (t >= 90 && t < 100) || (t >= 165 && t < 175) ? 'resolve' : 'calm');
  const hostileAt = (t) => (t >= 63.6 && t < 89) || (t >= 122 && t < 164) || (t >= 187 && t < 195);
  const duck = Math.pow(10, -MUSIC.hostileDuckDb / 20);
  for (const [key, set] of Object.entries(STEM_SETS)) {
    M.loop(set, 0, sec, (t) => { const bar = Math.floor(t / BAR) * BAR; return (MUSIC_MIX[stateAt(bar)][key] ?? 0) * (hostileAt(t) ? duck : 1); }, { tau: BAR / 3 });
  }
  return { M, sec, E };
}

/* ------------------------------------------------------------------ audibility at range (the first hour's cues) */

export function hourAudibility() {
  const cache = new Map();
  const bedsOf = (place, calima = 0) => {
    const key = `${place}:${calima}`;
    if (!cache.has(key)) {
      let list = placeBeds(place);
      if (calima) { const L = bedLevels({ pans: 0, holds: 1, nine: 0, scar: 0, edge: 0, calima }); list = [['amb/trade', L.tradeK], ['amb/holds', L.holds]]; }
      cache.set(key, { list, bands: bedBands(list) });
    }
    return cache.get(key);
  };
  const rows = [];
  for (const c of M2_COUNTED) {
    if (c.bed) {
      // a bed: its own level (at full zone weight, or the calima's at 1) over the rest of its place's beds
      const calima = c.set === 'amb/calima' ? 1 : 0;
      const place = bedsOf(c.place, calima);
      const L = calima ? bedLevels({ pans: 0, holds: 1, calima: 1 }) : null;
      const ownLevel = calima ? L.calima : (place.list.find(([s]) => s === c.set)?.[1] ?? 1);
      const rest = place.list.filter(([s]) => s !== c.set);
      const own = bedBands([[c.set, ownLevel]]), restB = bedBands(rest);
      let bm = -Infinity, bat = 0;
      for (const f of BANDS) { const m = own[f] - restB[f]; if (m > bm) { bm = m; bat = f; } }
      rows.push({ set: c.set, bed: true, place: c.place, level: +ownLevel.toFixed(3), over: rest.map(([s, l]) => `${s}x${(+l).toFixed(2)}`).join('+'), marginDb: +bm.toFixed(1), band: bat, audible: bm >= 3 });
      continue;
    }
    const row = SETS[c.set][0];
    const src = decode(row.file);
    const x = Float32Array.from(src.length > 1 ? src[0].map((v, i) => 0.5 * (v + src[1][i])) : src[0]);
    const r = c.range || 0;
    let g = (row.gain ?? 1) * busGain(c.bus);
    if (r > 0) { g *= distanceGain(r) * Math.SQRT1_2; biquad(x, 'lp', airCutoff(r), 0.4); }
    for (let i = 0; i < x.length; i++) x[i] *= g;
    const lv = bandLevels(x, 0, null, c.loop ? 0.4 : 0.05);
    const bed = bedsOf(c.place).bands;
    let best = -Infinity, at = 0;
    for (const f of BANDS) { const m = lv[f] - bed[f]; if (m > best) { best = m; at = f; } }
    const abs = Math.max(...BANDS.map((f) => lv[f]));
    rows.push({ set: c.set, bus: c.bus, range: r, rangeFrom: c.rangeFrom, place: c.place, marginDb: +best.toFixed(1), band: at, levelDb: +abs.toFixed(1), audible: best >= 3 && abs > -80 });
  }
  return rows;
}

/** The calima's drop as rendered: a far one-shot (forge/anvil at 100 m) and the trade wind layer, trade vs calima. */
export function calimaDrop() {
  const one = (k) => {
    const M = new Mixer(3);
    M.voice('forge/anvil', 0.1, { d: 100, az: 0, vol: calimaFarGain(100, k) });
    return integratedLufs(M.busOut('sfx'));
  };
  const bed = (k) => {
    const L = bedLevels({ pans: 0, holds: 1, calima: k });
    const M = new Mixer(8);
    M.loop('amb/trade', 0, 8, () => L.tradeK, { tau: 0.01 });
    return integratedLufs(M.busOut('ambience'));
  };
  const near = (k) => { const M = new Mixer(3); M.voice('forge/anvil', 0.1, { d: 10, az: 0, vol: calimaFarGain(10, k) }); return integratedLufs(M.busOut('sfx')); };
  return {
    anvilAt100mDb: +(one(1) - one(0)).toFixed(2), anvilAt10mDb: +(near(1) - near(0)).toFixed(2), tradeWindDb: +(bed(1) - bed(0)).toFixed(2),
  };
}

/* ------------------------------------------------------------------ main */
function cat(a, b) {
  return [0, 1].map((c) => { const o = new Float32Array(a[c].length + b[c].length); o.set(a[c], 0); o.set(b[c], a[c].length); return o; });
}

async function main() {
  const git = (...a) => { try { return execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim(); } catch { return '?'; } };
  const commit = git('rev-parse', '--short', 'HEAD');
  const dirty = git('status', '--porcelain', '--untracked-files=no', '--', 'src/audio', 'public/audio', 'tools/gates/audio').length > 0;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const out = flag('--out') || path.join(os.homedir(), '.calima-r5/review/runs', `${stamp}-${commit}-audio-hour-walk`);
  if (path.resolve(out).startsWith(REPO + path.sep)) throw new Error('the capture goes outside the repo');
  mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  const H = renderHourWalk();
  const hour = H.M.master();
  const slice = renderWalk().M.master();
  const whole = cat(slice, hour);
  const amb = H.M.busOut('ambience'), mus = H.M.busOut('music');
  const calm = [[0, 44], [100, 120], [197, 250]];
  const ambCalm = lufsOver(amb, calm), musCalm = lufsOver(mus, calm);
  const aud = hourAudibility();
  const report = {
    row: 'Milestone 2: the first hour\'s walk (offline render of the shipped bank through src/audio/slice/mix.js and src/audio/m2/mix.js)',
    commit, dirty, seconds: { legs23: H.sec, firstHour: whole[0].length / SR },
    legs23: { integratedLufs: +integratedLufs(hour).toFixed(2), dBTP: +truePeakDb(hour).toFixed(2), samplePeakDb: +samplePeakDb(hour).toFixed(2), shortTermMaxLufs: +shortTermMax(hour).toFixed(2) },
    firstHour: { integratedLufs: +integratedLufs(whole).toFixed(2), dBTP: +truePeakDb(whole).toFixed(2), target: '-18 +- 2 LUFS, <= -1 dBTP' },
    music: { calmAmbienceLufs: +ambCalm.toFixed(2), calmMusicLufs: +musCalm.toFixed(2), underAmbienceDb: +(ambCalm - musCalm).toFixed(2) },
    calima: calimaDrop(),
    audibility: { counted: aud.length, audible: aud.filter((r) => r.audible).length, failing: aud.filter((r) => !r.audible), rows: aud },
    played: Object.fromEntries([...H.M.played.entries()].sort()),
    notModelled: ['the reverb send and return', 'occlusion', 'the Ducker', 'HRTF (equal-power panning instead)', 'the Round-4 procedural voices',
      'Concentration\'s world low-pass', 'the zones\' weights are scripted by time (the game reads the regions map at her position)'],
    ms: Date.now() - t0,
  };
  report.firstHour.pass = Math.abs(report.firstHour.integratedLufs + 18) <= 2 && report.firstHour.dBTP <= -1;
  report.legs23.pass = Math.abs(report.legs23.integratedLufs + 18) <= 2 && report.legs23.dBTP <= -1;
  wav24(path.join(out, 'hour-walk.wav'), hour);
  wav24(path.join(out, 'first-hour-walk.wav'), whole);
  writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ out, commit, dirty, legs23: report.legs23, firstHour: report.firstHour, music: report.music, calima: report.calima,
    audible: `${report.audibility.audible}/${report.audibility.counted}`, failing: report.audibility.failing.map((r) => `${r.set} ${r.marginDb} dB @ ${r.range ?? 0} m (${r.place})`) }, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
