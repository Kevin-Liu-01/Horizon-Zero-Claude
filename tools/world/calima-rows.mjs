#!/usr/bin/env node
/**
 * CALIMA AT NOON OVER THE HOLDS, IN NODE (M2 wave 4, areas A+F: EN3, EN4, EN5's cover parity, the weather ask). The
 * page half is tools/world/calima-noon-probe-page.mjs (film.mjs --probe), which measures the rendered frame.
 *
 *   node tools/world/calima-rows.mjs [--json <file outside the repo>]
 *
 *   EN3-vis     the CPU mirror of the fog (environment.fogParams.transmittance's main layer, calima at full weight): the
 *               distance at which a level ray at eye height keeps 5 % of a dark target's contrast, at the places of the
 *               hour's third leg (Saltrow for the Pans' reference, Ninewalls, Benchmark 1, the Malpais edge on the walk
 *               from Ninewalls, T2's deck, the Kiln Yards). Band 120-180 m. The valley mist is left out (it pools within
 *               a few metres of the Pans' floor; the rendered frame's cards include it).
 *   EN4-sun     the sun's altitude through the read-transit beat's window (11.5-12.5) from Environment.direction. The
 *               brief's bar is "over 60 deg"; the built sky's noon is its daily maximum, SUN_MAX_ELEV.
 *   EN5-cover   the cloud shadows' mean cover and fully-shadowed share per weather, the M1 term (two octaves of sin-hash
 *               value noise) against the coverage texture through CLOUD_MAP_A/B. Bar: mean within 0.02.
 *   ask         environment.askWeather's window on a bare instance (no scene): in force inside [from, to), the sky given
 *               back after, a window across midnight, clearAsk.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Environment, SKY_MODEL, skyNoiseData } from '../../src/world/environment.js';
import { ensureMacro, heightAt } from '../../src/world/island/recipe.js';
import { siteById, TRIG } from '../../src/world/island/sites.js';
import { BENCHMARKS } from '../../src/world/sites/layout.js';
import { RegionMap } from '../../src/core/regions.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;
ensureMacro();

const rows = [];
const row = (id, pass, numbers, note = '') => { rows.push({ id, pass, numbers, note }); };

/* ---------------------------------------------------------------- EN3-vis */
{
  const M = SKY_MODEL;
  const d05 = (y, falloff) => Math.log(20) / (M.CALIMA_DENS * Math.exp(-(y - M.FOG_HEIGHT_REF) * falloff) * M.EXT_CALIMA[1]);
  // the Malpais edge on the walk from Ninewalls toward the Kiln Yards: the first point of the line inside the Malpais
  const map = new RegionMap().build();
  const nw = siteById('ninewalls'), ky = siteById('kiln-yards');
  let edge = null;
  for (let t = 0; t <= 1; t += 0.005) {
    const x = nw.x + (ky.x - nw.x) * t, z = nw.z + (ky.z - nw.z) * t;
    if (map.depth('malpais', x, z) >= 0) { edge = { x: r1(x), z: r1(z) }; break; }
  }
  const b1 = BENCHMARKS.find((b) => b.id === 'bm-01');
  const t2 = TRIG.find((t) => t.id === 'T2');
  const places = {
    saltrow: siteById('saltrow'), ninewalls: nw, b1, 'malpais-edge': edge, 't2-deck': t2, 'kiln-yards': ky,
  };
  const out = {};
  let ok = true;
  for (const [id, p] of Object.entries(places)) {
    const y = heightAt(p.x, p.z) + 1.7;
    const now = d05(y, M.CALIMA_FALLOFF), trade = d05(y, M.FOG_HEIGHT_FALLOFF);
    out[id] = { x: r1(p.x), z: r1(p.z), eyeY: r1(y), d05: r1(now), d05WithTradeFalloff: r1(trade) };
    if (!(now >= 120 && now <= 180)) ok = false;
  }
  row('EN3-vis', ok, out, 'calima at full weight, level ray at eye height; band 120-180 m');
}

/* ---------------------------------------------------------------- EN4-sun */
{
  const v = { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; }, normalize() { const l = Math.hypot(this.x, this.y, this.z); this.x /= l; this.y /= l; this.z /= l; return this; } };
  const alt = {};
  let min = Infinity, max = -Infinity;
  for (const h of [11.5, 11.75, 12, 12.25, 12.5, 12.875]) {
    Environment.direction(h, v);
    const a = Math.asin(v.y) * 180 / Math.PI;
    alt[h] = r1(a);
    if (h <= 12.5) { min = Math.min(min, a); max = Math.max(max, a); }
  }
  row('EN4-sun', min > 60, { altitudeDeg: alt, windowMin: r1(min), windowMax: r1(max), dailyMax: alt[12.875] },
    'the brief asks over 60 deg; the built sky peaks at 50 deg at 12:52 (SUN_MAX_ELEV), so the bar cannot pass without a sky change that moves every accepted frame lit by the island\'s sun: a ruling');
}

/* -------------------------------------------------------------- EN5-cover */
{
  const fract = (x) => x - Math.floor(x);
  const hash = (x, y) => fract(Math.sin(Math.fround(x * 127.1 + y * 311.7)) * 43758.5453);
  const vn = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    const top = a + (b - a) * fx, bot = c + (d - c) * fx;
    return top + (bot - top) * fy;
  };
  const old = [];
  for (let i = 0; i < 400; i++) for (let j = 0; j < 400; j++) { const u = 37 + i * 0.137, w = -91 + j * 0.137; old.push(vn(u, w) * 0.64 + vn(u * 2.17 + 13.7, w * 2.17 + 13.7) * 0.36); }
  const N = 256, data = skyNoiseData(N), tex = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) tex[i] = data[i * 4] / 255;
  const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const W = { trade: 0.30, calima: 0.05, fogbank: 0.70, squall: 0.92 };
  const out = {};
  let ok = true;
  for (const [name, cloud] of Object.entries(W)) {
    const thr = 0.58 - cloud * 0.20, sw = 0.30;
    const t2 = SKY_MODEL.CLOUD_MAP_A + SKY_MODEL.CLOUD_MAP_B * thr, w2 = SKY_MODEL.CLOUD_MAP_B * sw;
    let mo = 0, mn = 0, fo = 0, fn = 0;
    for (const n of old) { const m = ss(thr, thr + sw, n); mo += m; if (m > 0.98) fo++; }
    for (const n of tex) { const m = ss(t2, t2 + w2, n); mn += m; if (m > 0.98) fn++; }
    mo /= old.length; mn /= tex.length; fo /= old.length; fn /= tex.length;
    out[name] = { meanOld: r3(mo), meanTexture: r3(mn), fullOld: r3(fo), fullTexture: r3(fn) };
    if (Math.abs(mo - mn) > 0.02) ok = false;
  }
  row('EN5-cover', ok, { tileM: SKY_MODEL.CLOUD_TILE_M, metresPerGameHour: SKY_MODEL.CLOUD_SPEED_MPH, ...out },
    'cover before strength (trade 0.26, calima 0): the shadow a pixel takes is mean x strength');
}

/* -------------------------------------------------------------------- ask */
{
  const env = Object.create(Environment.prototype);
  Object.assign(env, { _asks: [], _askN: 0, _askHeld: false, _askBase: null, weather: 'trade', _time: 11.0, ctx: {} });
  const sets = [];
  env.setWeather = function (name, fade) { sets.push([this._time, name, fade]); this.weather = name; return name; };
  const steps = [];
  const id = env.askWeather('calima', { from: 12, to: 14, fade: 8, by: 'true-ground' });
  for (const h of [11.0, 11.99, 12.0, 13.5, 14.0, 15]) { env._time = h; env._tickAsks(); steps.push([h, env.weather]); }
  const want = [[11, 'trade'], [11.99, 'trade'], [12, 'calima'], [13.5, 'calima'], [14, 'trade'], [15, 'trade']];
  let ok = JSON.stringify(steps) === JSON.stringify(want);
  // across midnight, then cleared inside its window
  const id2 = env.askWeather('fogbank', { from: 23, to: 2 });
  env._time = 1.0; env._tickAsks(); const night = env.weather;
  env.clearAsk(id2); const after = env.weather;
  env.clearAsk(id);
  ok = ok && night === 'fogbank' && after === 'trade' && env.asks.length === 0;
  row('ask', ok, { steps, night, afterClear: after, sets }, 'a bare instance: the window, the hand-back, a midnight window, clearAsk');
}

const pass = rows.every((r) => r.pass);
for (const r of rows) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id}  ${JSON.stringify(r.numbers)}${r.note ? `  (${r.note})` : ''}`);
const json = flag('--json');
if (json) {
  if (path.resolve(json).startsWith(REPO)) throw new Error('--json must be outside the repo');
  writeFileSync(json, JSON.stringify({ rows, pass }, null, 2));
}
process.exitCode = rows.filter((r) => r.id !== 'EN4-sun').every((r) => r.pass) ? 0 : 1;
