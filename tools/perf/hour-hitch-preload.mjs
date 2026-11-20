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
 *
 * HH_PROFILE=1 (C5): V8's sampling profiler runs on every page in HH_PROFILE_S chunks (default 12 s; HH_PROFILE_US, default 250 us a sample; each stop and start holds the page ~0.2 s);
 * each long frame then also carries `cpu`: the functions that held the main thread inside its interval (self ms and
 * inclusive ms by name, file and line), read off the chunk that holds it. The chunk's clock is put on the page's
 * performance.now() by the readings taken either side of Profiler.start (their spread is kept as `clockMs`).
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = process.env.HH_OUT;
const OVER = Number(process.env.HH_OVER || 25);
const PROFILE = process.env.HH_PROFILE === '1';
const PROFILE_US = Number(process.env.HH_PROFILE_US || 250);
const PROFILE_S = Number(process.env.HH_PROFILE_S || 12);
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
        if (cur && prevInfo && cur.p > prevInfo.p) { try { f.programs = info.programs.slice(prevInfo.p).map((q) => q.name || q.cacheKey?.slice(0, 60) || '?'); } catch { /* */ } }
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

/** The page clock reading of a CDP profile's own clock (us): readings before and after Profiler.start. */
const pageNow = async (cdp) => {
  const r = await cdp.send('Runtime.evaluate', { expression: 'performance.now()', returnByValue: true });
  return r?.result?.value ?? null;
};
const shortUrl = (u) => (u || '').replace(/^.*\/(src|node_modules|tools)\//, '$1/').replace(/\?.*$/, '');

/**
 * Attribute one profile chunk's samples to the long frames inside it. The chunk's clock is put on the page's by the
 * game's own frames: each run of samples under main.js `_frame` is one frame's callback (a SEGMENT); the offset that
 * lines the most long frames up with a segment ending just before their rAF (within 6 ms) wins, searched around the
 * readings' estimate (Profiler.start itself takes ~100 ms, so the readings alone are too loose). Each long frame then
 * gets `cpu` from the segment that ends inside its interval: self and inclusive ms per function. `segments` keeps the
 * chunk's longest segments whether or not a long frame was matched to them.
 */
function attribute(L, prof, offGuess, spread) {
  const nodes = new Map(); for (const n of prof.nodes) nodes.set(n.id, n);
  const parent = new Map(); for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const label = (n) => { const f = n.callFrame; return `${f.functionName || '(anon)'} ${shortUrl(f.url)}:${f.lineNumber + 1}`; };
  const inFrame = new Map();
  const isFrame = (id) => {
    if (inFrame.has(id)) return inFrame.get(id);
    const n = nodes.get(id); const f = n.callFrame;
    const v = (f.functionName === '_frame' && /src\/main\.js/.test(f.url)) || (parent.has(id) ? isFrame(parent.get(id)) : false);
    inFrame.set(id, v); return v;
  };
  let ts = prof.startTime;
  const times = prof.samples.map((_, i) => (ts += prof.timeDeltas[i]) / 1000);   // profile clock, ms
  // the segments: runs of _frame samples, gaps under 2.5 ms
  const segs = []; let cur = null;
  for (let i = 0; i < prof.samples.length; i++) {
    if (!isFrame(prof.samples[i])) continue;
    const t = times[i];
    if (cur && t - cur.b <= 2.5) { cur.b = t; cur.i1 = i; } else { cur = { a: t, b: t, i0: i, i1: i }; segs.push(cur); }
  }
  const long = L.long.filter((f) => f.d > 28 && f.d < 300);
  // the offset: page = profile - off. Candidates from every (long frame, segment) pair near the guess
  let best = { off: offGuess, hits: -1 };
  const bigSegs = segs.filter((g) => g.b - g.a > 12);
  for (const f of long) for (const g of bigSegs) {
    const off = g.b - (f.t - 1);
    if (Math.abs(off - offGuess) > spread / 2 + 40) continue;
    let hits = 0;
    for (const f2 of long) if (bigSegs.some((g2) => { const e = g2.b - off; return e <= f2.t + 2 && e >= f2.t - 8; })) hits++;
    if (hits > best.hits) best = { off, hits };
  }
  const off = best.off;
  const summarize = (i0, i1) => {
    const self = {}, incl = {};
    let ms = 0;
    for (let i = i0; i <= i1; i++) {
      const dt = (prof.timeDeltas[i + 1] ?? PROFILE_US) / 1000;
      const node = nodes.get(prof.samples[i]);
      const fn = node.callFrame.functionName;
      if (fn === '(idle)') continue;
      ms += dt;
      const k = label(node); self[k] = (self[k] || 0) + dt;
      const seen = new Set();
      for (let id = node.id; id != null; id = parent.get(id)) { const kk = label(nodes.get(id)); if (seen.has(kk)) continue; seen.add(kk); incl[kk] = (incl[kk] || 0) + dt; }
    }
    const top = (o, k) => Object.entries(o).filter(([key]) => !/^\(root\)/.test(key)).sort((x, y) => y[1] - x[1]).slice(0, k).map(([key, v]) => [key, Math.round(v * 10) / 10]);
    return { busyMs: Math.round(ms * 10) / 10, self: top(self, 14), incl: top(incl, 40) };
  };
  const t0 = prof.startTime / 1000 - off, tEnd = prof.endTime / 1000 - off;
  for (const f of L.long) {
    if (f.cpu || f.t < t0 || f.t - f.d > tEnd) continue;
    // the segment that ends inside this frame's interval (the callback that held it), else the samples of the interval
    const g = segs.filter((x) => x.b - off <= f.t + 2 && x.b - off >= f.t - f.d - 2).sort((x, y) => (y.b - y.a) - (x.b - x.a))[0];
    let i0, i1;
    if (g) { i0 = g.i0; i1 = g.i1; } else {
      i0 = times.findIndex((t) => t - off >= f.t - f.d - 2); i1 = i0;
      while (i1 + 1 < times.length && times[i1 + 1] - off <= f.t + 2) i1++;
      if (i0 < 0) continue;
    }
    f.cpu = { segMs: g ? Math.round((g.b - g.a) * 10) / 10 : null, matched: best.hits, clockMs: Math.round(spread * 10) / 10, ...summarize(i0, i1) };
  }
  // the chunk's longest frames by the profile alone
  L.segments = L.segments || [];
  for (const g of segs.filter((x) => x.b - x.a > 22).sort((x, y) => (y.b - y.a) - (x.b - x.a)).slice(0, 6)) {
    const s = summarize(g.i0, g.i1);
    L.segments.push({ t: Math.round(g.b - off), segMs: Math.round((g.b - g.a) * 10) / 10, busyMs: s.busyMs, self: s.self.slice(0, 8), incl: s.incl.slice(0, 30) });
  }
}

async function profilePage(page, L) {
  const cdp = await page.createCDPSession();
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: PROFILE_US });
  L.profileChunks = 0;
  const begin = async () => {
    const before = await pageNow(cdp);
    await cdp.send('Profiler.start');
    const after = await pageNow(cdp);
    return { before, after };
  };
  let clock;
  try { clock = await begin(); } catch { return; }
  for (;;) {
    await new Promise((r) => setTimeout(r, PROFILE_S * 1000));
    let prof, next;
    try { prof = (await cdp.send('Profiler.stop')).profile; next = await begin(); } catch { return; }
    // the chunk's start (prof.startTime, us) lies between the two readings: take their middle
    const { before, after } = clock; clock = next;
    if (before == null || after == null) continue;
    const off = prof.startTime / 1000 - (before + after) / 2;
    // a long frame is sent to Node up to ~1 s after it ends: wait for the stragglers before attributing
    await new Promise((r) => setTimeout(r, 1200));
    try { attribute(L, prof, off, after - before); } catch (e) { L.profileError = String(e?.message || e); }
    // HH_PROFILE_SAVE=1: a chunk that holds a frame over 33 ms is kept whole (<HH_OUT>/cpu-<n>.cpuprofile, DevTools opens it)
    if (process.env.HH_PROFILE_SAVE === '1' && OUT && L.long.some((f) => f.d > 33.4 && f.d < 300 && f.cpu && !f.cpuFile && f.t >= prof.startTime / 1000 - off - 1)) {
      const file = `cpu-${run.launches.indexOf(L)}-${L.profileChunks}.cpuprofile`;
      try { writeFileSync(path.join(OUT, file), JSON.stringify(prof)); for (const f of L.long) if (f.cpu && !f.cpuFile && f.d > 33.4) f.cpuFile = file; } catch { /* */ }
    }
    L.profileChunks++;
    save();
  }
}

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
    if (PROFILE) profilePage(page, L).catch((e) => { L.profileError = String(e?.message || e); save(); });
    return page;
  };
  const close0 = browser.close.bind(browser);
  browser.close = async (...a) => {
    for (const p of pages) {
      try { L.summary = await p.evaluate(() => ({ frames: window.__hh?.n ?? null, long: window.__hh?.nLong ?? null, hitch: window.__hitch ? { n: window.__hitch.n, over33: window.__hitch.over33, over50: window.__hitch.over50, max: +window.__hitch.max.toFixed(1) } : null,
        walk: (window.__CTX__?.nav?._walk || []).map((w) => ({ id: w.id, cells: w.open?.length ?? null, paths: w.stats.paths, misses: w.stats.misses, long: w.stats.long || 0, alt: w.stats.alt || 0, landmarks: w.stats.landmarks || null, lmReady: !!w._lm?.ready })) })); } catch { /* */ }
    }
    L.closedAt = new Date().toISOString(); save();
    return close0(...a);
  };
  return browser;
};
