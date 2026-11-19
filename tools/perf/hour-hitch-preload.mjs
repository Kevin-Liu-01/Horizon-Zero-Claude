/**
 * M2 fix wave (engine, EN1): WHAT EACH LONG FRAME OF THE FIRST HOUR WAS DOING, with no change to the runner.
 * A Node preload for tools/gates/systems/first-hour.mjs (and slice-hour.mjs): it wraps `puppeteer.launch` so every page
 * the runner opens gets, before any script, the GL call counters, the long-animation-frame log and a per-frame recorder
 * (the same counters as tools/perf/hitch-probe.mjs's recorder). Every presented frame over HH_OVER ms (default 25)
 * while the game is playing and the loading sheet is closed is sent to Node as it happens, with: the interval, the
 * engine's own record (js / sim / submit / tail), the GL calls since the frame before (compiles, links, status reads,
 * uploads; count and ms), renderer.info deltas (programs, geometries, textures), the JS heap and its change, the five
 * slowest systems, the quest stage, the hour, the weather, her position and region, whether the runner was taking a
 * screenshot (its own __hitch.pause / skip: those frames are not counted by the runner), and the long-animation-frame
 * entries (their scripts) that ended near it.
 *
 *   HH_OUT=<dir outside the repo> node --import ./tools/perf/hour-hitch-preload.mjs tools/gates/systems/first-hour.mjs \
 *        --port 5271 --legs 2,3 --label world-hitch
 *
 * Writes <HH_OUT>/hour-hitch.json (rewritten on every long frame and at each browser close). Run it inside
 * tools/perf/clean-measure.sh so its numbers are a commit's.
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = process.env.HH_OUT;
const OVER = Number(process.env.HH_OVER || 25);
const run = { tool: 'tools/perf/hour-hitch-preload.mjs', commit: process.env.CLEAN_COMMIT || null, over: OVER, argv: process.argv.slice(1), startedAt: new Date().toISOString(), launches: [] };
const save = () => { if (OUT) { try { writeFileSync(path.join(OUT, 'hour-hitch.json'), JSON.stringify(run, null, 1)); } catch { /* */ } } };
if (OUT) mkdirSync(OUT, { recursive: true });

/** In the page, before any script. */
const recorder = (over) => {
  const R = (window.__hh = { gl: {}, loaf: [], last: 0, sys: null, n: 0, nLong: 0 });
  const P = WebGL2RenderingContext.prototype;
  const WRAP = ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog',
    'texImage2D', 'texImage3D', 'texSubImage2D', 'texSubImage3D', 'texStorage2D', 'texStorage3D', 'compressedTexImage2D',
    'compressedTexSubImage2D', 'compressedTexImage3D', 'compressedTexSubImage3D', 'bufferData', 'bufferSubData', 'generateMipmap',
    'readPixels', 'getError', 'getUniformLocation', 'getActiveUniform', 'clientWaitSync', 'getQueryParameter', 'framebufferTexture2D', 'checkFramebufferStatus'];
  for (const k of WRAP) {
    const f = P[k]; if (typeof f !== 'function') continue;
    const c = (R.gl[k] = { n: 0, ms: 0 });
    P[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { c.n++; c.ms += performance.now() - t; } };
  }
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) {
      if (R.loaf.length > 200) R.loaf.shift();
      R.loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), block: Math.round(e.blockingDuration ?? 0),
        scripts: (e.scripts || []).filter((s) => s.duration >= 2).map((s) => ({ inv: s.invoker, type: s.invokerType, fn: s.sourceFunctionName, url: (s.sourceURL || '').replace(/^.*\/(src|node_modules|tools)\//, '$1/').replace(/\?.*$/, ''), at: s.sourceCharPosition, d: Math.round(s.duration), layout: Math.round(s.forcedStyleAndLayoutDuration || 0) })) });
    } }).observe({ type: 'long-animation-frame', buffered: true });
  } catch (e) { R.loafError = String(e); }
  const snapGl = () => { const o = {}; for (const k in R.gl) o[k] = [R.gl[k].n, R.gl[k].ms]; return o; };
  let prevGl = snapGl(), prevInfo = null, prevHeap = 0, pending = [];
  const instrument = () => {
    const G = window.__GAME__; if (!G?.systems || R.sys) return;
    R.sys = {};
    for (const s of G.systems) {
      const name = s.constructor?.name || 'anon';
      for (const ph of ['update', 'interpolate']) {
        const f = s[ph]; if (typeof f !== 'function' || f.__hh) continue;
        const key = `${name}.${ph}`; R.sys[key] = 0;
        const w = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { R.sys[key] += performance.now() - t; } };
        w.__hh = true; s[ph] = w;
      }
    }
  };
  const flush = () => {
    if (!pending.length) return;
    const now = performance.now();
    const ready = pending.filter((f) => now - f.t > 400);   // the long-animation-frame entry lands a little after the frame
    if (!ready.length) return;
    pending = pending.filter((f) => now - f.t <= 400);
    for (const f of ready) f.loaf = R.loaf.filter((l) => l.t + l.d >= f.t - f.d - 5 && l.t <= f.t + 5);
    try { window.__hhSend?.(JSON.stringify(ready)); } catch { /* */ }
  };
  setInterval(flush, 500);
  const tick = (t) => {
    const C = window.__CTX__, E = C?.engine;
    if (!R.sys && window.__GAME__) instrument();
    const L = document.getElementById('loading'), sheet = !!L && !L.classList.contains('hidden');
    const playing = C?.state === 'playing' && !sheet;
    const g = snapGl();
    const info = E?.renderer?.info, cur = info ? { p: info.programs?.length ?? 0, g: info.memory.geometries, x: info.memory.textures } : null;
    const heap = performance.memory?.usedJSHeapSize ?? 0;
    if (R.last && playing) {
      R.n++;
      const d = t - R.last;
      if (d > over) {
        R.nLong++;
        const dGl = {};
        for (const k in g) { const n = g[k][0] - prevGl[k][0], ms = g[k][1] - prevGl[k][1]; if (n) dGl[k] = [n, Math.round(ms * 10) / 10]; }
        const H = window.__hitch, p = C?.player?.position ?? C?.player?.mesh?.position ?? null, env = C?.environment;
        const f = { t: Math.round(t), d: Math.round(d * 10) / 10, n: R.n,
          tool: H ? { pause: H.pause, skip: H.skip, over33: H.over33, over50: H.over50 } : null,
          stage: (() => { try { const Q = C.quests || {}; return Object.fromEntries(Object.entries(Q).map(([k, q]) => [k, q?.report?.()?.reached?.slice(-1)[0] ?? null])); } catch { return null; } })(),
          spine: C?.spine?.current?.()?.id ?? null,
          hour: env?.time != null ? +env.time.toFixed(3) : null, weather: env?.weather ?? env?.weatherName ?? null,
          at: p ? { x: Math.round(p.x), z: Math.round(p.z) } : null, region: E?.regions?.tracker?.current ?? null,
          lf: E?.lastFrame ? { js: +E.lastFrame.jsMs.toFixed(1), sim: +E.lastFrame.simMs.toFixed(1), sub: +E.lastFrame.renderMs.toFixed(1), tail: +E.lastFrame.tailMs.toFixed(1), calls: E.lastFrame.calls } : null,
          gl: dGl, info: cur && prevInfo ? { p: cur.p - prevInfo.p, g: cur.g - prevInfo.g, x: cur.x - prevInfo.x } : null,
          heapMB: Math.round(heap / 1e5) / 10, heapD: Math.round((heap - prevHeap) / 1e5) / 10 };
        if (R.sys) { const top = Object.entries(R.sys).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [k, Math.round(v * 10) / 10]); if (top.length) f.sys = top; }
        pending.push(f);
      }
    }
    if (R.sys) for (const k in R.sys) R.sys[k] = 0;
    prevGl = g; prevInfo = cur; prevHeap = heap;
    R.last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const launch0 = puppeteer.launch.bind(puppeteer);
puppeteer.launch = async (opts) => {
  const browser = await launch0(opts);
  const L = { at: new Date().toISOString(), pages: 0, long: [], summary: null };
  run.launches.push(L); save();
  const pages = [];
  const newPage0 = browser.newPage.bind(browser);
  browser.newPage = async (...a) => {
    const page = await newPage0(...a);
    L.pages++;
    pages.push(page);
    await page.exposeFunction('__hhSend', (json) => { try { L.long.push(...JSON.parse(json)); save(); } catch { /* */ } });
    await page.evaluateOnNewDocument(`(${recorder.toString()})(${OVER});`);
    return page;
  };
  const close0 = browser.close.bind(browser);
  browser.close = async (...a) => {
    for (const p of pages) {
      try { L.summary = await p.evaluate(() => ({ frames: window.__hh?.n ?? null, long: window.__hh?.nLong ?? null, hitch: window.__hitch ? { n: window.__hitch.n, over33: window.__hitch.over33, over50: window.__hitch.over50, max: +window.__hitch.max.toFixed(1) } : null })); } catch { /* */ }
    }
    L.closedAt = new Date().toISOString(); save();
    return close0(...a);
  };
  return browser;
};
