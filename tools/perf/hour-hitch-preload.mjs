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
 * A-late-programs (C5): every program linked while she plays, and every first use that waited over 5 ms, after the
 * boot's warm-up, named by the material build that made it; `run.verdict` (and a line at exit) is FAIL when there is any.
 * Each entry is sent to Node as it is named (within a frame or two), so a page document that is reloaded (slice-hour's
 * save rows: wake to sight is one document, reloaded at save-t1) keeps its entries; until 52b0f59 they were read only
 * at the browser's close, from the last document, and one MeshBasicMaterial linked at the Peg line (28 ms, exit run 4
 * run 3) was never listed.
 * New textures: on a frame that made textures while she plays, the textures that had their first upload are named in
 * an idle moment after it (`texNew` on the frame's record when it was a long one; up to 40: name, size, format, whose).
 * WHOLE (C5, measured whole): `node tools/perf/hour-hitch-preload.mjs --whole <HH_OUT>` grades every frame the preload
 * recorded while she played (every document, every leg), not the runner's segments: over 50 and over 33 ms, the tool's
 * own screenshot frames (__hitch pause/skip) and HH_EXCLUDE stages left out and listed.
 * `node tools/perf/hour-hitch-preload.mjs --verdict <HH_OUT>` prints that verdict again (every file in the dir: a child
 * run's too) and exits 1 on FAIL. For first-hour's leg 1 (a child process) pass the preload on as well:
 * NODE_OPTIONS="--import $PWD/tools/perf/hour-hitch-preload.mjs".
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
// a child run (first-hour's leg 1 spawns slice-hour.mjs; NODE_OPTIONS="--import <this file>" carries the preload into
// it) writes its own file beside the parent's: hour-hitch-child-<pid>.json
const CHILD = process.env.HH_PRELOADED === '1';
process.env.HH_PRELOADED = '1';
const FILE = CHILD ? `hour-hitch-child-${process.pid}.json` : 'hour-hitch.json';
run.child = CHILD;
const save = () => { if (OUT) { try { writeFileSync(path.join(OUT, FILE), JSON.stringify(run, null, 1)); } catch { /* */ } } };
if (OUT) mkdirSync(OUT, { recursive: true });

/** In the page, before any script. */
const recorder = (over) => {
  const R = (window.__hh = { gl: {}, loaf: [], last: 0, sys: null, n: 0, nLong: 0, slow: [] });
  const P = WebGL2RenderingContext.prototype;
  const WRAP = ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getProgramInfoLog', 'getShaderInfoLog',
    'texImage2D', 'texImage3D', 'texSubImage2D', 'texSubImage3D', 'texStorage2D', 'texStorage3D', 'compressedTexImage2D',
    'compressedTexSubImage2D', 'compressedTexImage3D', 'compressedTexSubImage3D', 'bufferData', 'bufferSubData', 'generateMipmap',
    'readPixels', 'getError', 'getUniformLocation', 'getActiveUniform', 'clientWaitSync', 'getQueryParameter', 'framebufferTexture2D', 'checkFramebufferStatus'];
  // C5 (the late-program row): every program LINKED while she plays, and every program whose FIRST USE (three calls
  // getProgramInfoLog once per program, on its first use) waited over LATE_USE_MS while she plays, after the boot's
  // warm-up. Each is named by the build that made it (Material.prototype.onBuild, patched once the game's three is
  // reachable: the object, its two parents, the material's type and name, and the program's key).
  R.playing = false; R.late = []; R.lateSent = 0; R.latePending = []; R.built = new WeakMap(); R.used = new WeakSet(); R.drawObj = null; R.drawMat = null; R.drawDepth = false;
  const LATE_USE_MS = 5;
  const lateNote = (kind, glp, ms) => {
    if (!R.playing || R.late.length >= 200) return;
    const b = R.built.get(glp) || R.nameDraw?.() || null;
    R.latePending.push([R.late.length, glp]);
    R.late.push({ kind, t: Math.round(performance.now()), ms: Math.round(ms * 10) / 10, who: b?.who ?? null, mat: b?.mat ?? null, key: b?.key ?? null, detail: b?.detail ?? null,
      at: (() => { const p = window.__CTX__?.player?.position; return p ? { x: Math.round(p.x), z: Math.round(p.z) } : null; })(),
      hour: window.__CTX__?.environment?.time != null ? +window.__CTX__.environment.time.toFixed(2) : null });
  };
  for (const k of WRAP) {
    const f = P[k]; if (typeof f !== 'function') continue;
    const c = (R.gl[k] = { n: 0, ms: 0 });
    // C5: a program whose first use waited (getProgramInfoLog over 5 ms) is kept for the frame's record (whose it is)
    const slow = k === 'getProgramInfoLog', link = k === 'linkProgram';
    P[k] = function (...a) {
      const t = performance.now();
      try { return f.apply(this, a); } finally {
        const d = performance.now() - t; c.n++; c.ms += d;
        if (slow) {
          if (d > 5 && R.slow.length < 8) R.slow.push([a[0], Math.round(d * 10) / 10]);
          if (!R.used.has(a[0])) { R.used.add(a[0]); if (d > LATE_USE_MS) lateNote('first-use', a[0], d); }
        }
        if (link) { const b = R.nameDraw?.(); if (b) R.built.set(a[0], b); lateNote('link', a[0], d); }
      }
    };
  }
  // the draw that the next linkProgram belongs to: three r187 links a program inside the draw that first asks for it
  // (renderObject: object.onBeforeRender, material.onBeforeRender, then the program; the shadow pass: object.onBeforeShadow
  // with the depth material). The prototypes' no-op hooks are patched once the game's three is reachable; an object or a
  // material with its own hook is seen through the other one. A link from a compile (no draw) is named by the draw before
  // it, so the entry's key and its diff are the identity; `who` is the hint.
  const hookBuild = () => {
    const C = window.__CTX__; if (!C?.scene || R.buildHooked) return;
    let m = null; C.scene.traverse((o) => { if (!m && o.material && !Array.isArray(o.material)) m = o.material; });
    if (!m) return;
    const own = (o, k) => { let p = Object.getPrototypeOf(o); while (p && !Object.prototype.hasOwnProperty.call(p, k)) p = Object.getPrototypeOf(p); return p; };
    const nm = (o) => (o ? (o.name || o.type) : '');
    // C5: what the drawn thing is, when its names say nothing (a nameless Mesh in the scene): its geometry, its
    // material's colour and flags, its place and size
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const detail = (obj, mat) => { try { return { geo: obj?.geometry ? `${obj.geometry.type}${obj.geometry.parameters ? JSON.stringify(obj.geometry.parameters).slice(0, 120) : ''}` : null,
      color: mat?.color?.getHexString?.() ?? null, opacity: mat?.opacity, side: mat?.side, transparent: mat?.transparent, blending: mat?.blending, depthWrite: mat?.depthWrite,
      fog: mat?.fog, map: !!mat?.map, renderOrder: obj?.renderOrder, at: obj?.matrixWorld ? [r3(obj.matrixWorld.elements[12]), r3(obj.matrixWorld.elements[13]), r3(obj.matrixWorld.elements[14])] : null,
      scale: obj?.scale ? [r3(obj.scale.x), r3(obj.scale.y), r3(obj.scale.z)] : null, ud: obj?.userData ? Object.keys(obj.userData).slice(0, 8) : null, matUd: mat?.userData ? Object.keys(mat.userData).slice(0, 8) : null,
      kids: obj?.children?.length ?? 0, sibs: obj?.parent ? obj.parent.children.length : null }; } catch { return null; } };
    const name = (obj, mat, depth) => ({ who: obj ? `${nm(obj.parent?.parent)}/${nm(obj.parent)}/${nm(obj)}` : null,
      mat: mat ? `${depth ? 'shadow:' : ''}${mat.type}${mat.name ? ':' + mat.name : ''}` : null, detail: detail(obj, mat) });
    const Mp = own(m, 'onBeforeRender'), Op = own(C.scene, 'onBeforeShadow') || own(C.scene, 'onBeforeRender');
    if (Mp) { const f = Mp.onBeforeRender; Mp.onBeforeRender = function (renderer, scene, camera, geometry, object, group) { R.drawObj = object; R.drawMat = this; R.drawDepth = false; return f.call(this, renderer, scene, camera, geometry, object, group); }; }
    if (Op) {
      if (Op.onBeforeRender) { const f = Op.onBeforeRender; Op.onBeforeRender = function (renderer, scene, camera, geometry, material, group) { R.drawObj = this; R.drawMat = material; R.drawDepth = false; return f.call(this, renderer, scene, camera, geometry, material, group); }; }
      if (Op.onBeforeShadow) { const f = Op.onBeforeShadow; Op.onBeforeShadow = function (renderer, object, camera, shadowCamera, geometry, depthMaterial, group) { R.drawObj = object; R.drawMat = object.material; R.drawDepth = true; return f.call(this, renderer, object, camera, shadowCamera, geometry, depthMaterial, group); }; }
    }
    R.nameDraw = () => (R.drawObj ? name(R.drawObj, Array.isArray(R.drawMat) ? R.drawMat[0] : R.drawMat, R.drawDepth) : null);
    R.buildHooked = true;
  };
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
    G.systems.forEach((s, i) => {
      // C5: a system that is a plain object (constructor Object) is named by its slot and its own fields
      let name = s.constructor?.name || 'anon';
      if (name === 'Object') name = `Object#${i}(${s.name || s.id || Object.keys(s).filter((k) => typeof s[k] !== 'function').slice(0, 3).join('/') || Object.keys(s).slice(0, 3).join('/')})`;
      for (const ph of ['update', 'interpolate']) {
        const f = s[ph]; if (typeof f !== 'function' || f.__hh) continue;
        const key = `${name}.${ph}`; R.sys[key] = 0;
        const w = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { R.sys[key] += performance.now() - t; } };
        w.__hh = true; s[ph] = w;
      }
    });
    // C5: the spatial system's three parts apart (the 18.2 ms "Object.update" at Oro, ddc31c1, was the spatial system's)
    const S = window.__CTX__?.spatial;
    if (S) for (const part of ['collision', 'nav', 'hitHulls']) {
      const o = S[part], f = o?.update; if (typeof f !== 'function' || f.__hh) continue;
      const key = `spatial.${part}.update`; R.sys[key] = 0;
      const w = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { R.sys[key] += performance.now() - t; } };
      w.__hh = true; o.update = w;
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
  // C5 (the fade's uploads): every texture a drawn material holds, read in an idle moment (never inside a frame)
  const TEX_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap',
    'lightMap', 'envMap', 'specularMap', 'clearcoatMap', 'clearcoatNormalMap', 'sheenColorMap', 'transmissionMap', 'thicknessMap', 'gradientMap', 'matcap'];
  const texOf = (each) => {
    const C = window.__CTX__, E = C?.engine, P = E?.renderer?.properties;
    if (!P) return;
    const nm = (o) => (o ? (o.name || o.type) : '');
    const seenMat = new Set();
    const visit = (o) => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) {
        if (seenMat.has(m)) continue; seenMat.add(m);
        const ts = [];
        for (const k of TEX_SLOTS) if (m[k]?.isTexture) ts.push([k, m[k]]);
        if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (v?.isTexture) ts.push([k, v]); }
        for (const [k, t] of ts) {
          const pr = P.get(t);
          if (!pr?.__webglInit && !pr?.__webglTexture) continue;
          each(t, () => `${nm(o.parent?.parent)}/${nm(o.parent)}/${nm(o)} ${m.type}${m.name ? ':' + m.name : ''}.${k}`);
        }
      }
    };
    try { C.scene?.traverse?.(visit); } catch { /* */ }
  };
  const idle = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 300 }) : setTimeout(f, 50));
  R.texSeed = () => { R.texSeen = new WeakSet(); idle(() => texOf((t) => R.texSeen.add(t))); };
  R.texScan = (t0) => {
    if (R.texScanBusy) return;
    R.texScanBusy = true;
    idle(() => {
      R.texScanBusy = false;
      const found = [];
      texOf((t, who) => {
        if (R.texSeen.has(t)) return;
        R.texSeen.add(t);
        if (found.length >= 40) return;
        const im = t.image, w = im?.width ?? im?.data?.width ?? t.mipmaps?.[0]?.width ?? null, h = im?.height ?? im?.data?.height ?? t.mipmaps?.[0]?.height ?? null;
        found.push({ name: t.name || null, w, h, fmt: t.format, compressed: !!t.isCompressedTexture, canvas: !!t.isCanvasTexture || (typeof HTMLCanvasElement !== 'undefined' && im instanceof HTMLCanvasElement),
          mips: t.generateMipmaps ? 'gen' : (t.mipmaps?.length ?? 0), who: who() });
      });
      if (!found.length) return;
      // the frame it belongs to: the long frame recorded at or just before t0 (still pending: flushed after 400 ms)
      const f = pending.filter((x) => x.t <= t0 + 1).slice(-1)[0];
      if (f) f.texNew = found;
      (R.texLog ||= []).push({ t: Math.round(t0), n: found.length, tex: found });
      try { window.__hhTex?.(JSON.stringify({ t: Math.round(t0), tex: found })); } catch { /* */ }
    });
  };
  const tick = (t) => {
    const C = window.__CTX__, E = C?.engine;
    if (!R.sys && window.__GAME__) instrument();
    const L = document.getElementById('loading'), sheet = !!L && !L.classList.contains('hidden');
    const playing = C?.state === 'playing' && !sheet;
    if (!R.buildHooked) hookBuild();
    R.playing = playing;
    // each late program's full key and what sets it apart from the nearest other program (field: theirs -> its)
    if (R.latePending.length && E?.renderer?.info?.programs) {
      const all = E.renderer.info.programs;
      for (const [i, glp] of R.latePending.splice(0)) {
        const q = all.find((x) => x.program === glp), e = R.late[i];
        if (!q || !e) continue;
        const a = (q.cacheKey || '').split(',');
        let best = null, bd = Infinity;
        for (const o of all) { if (o === q) continue; const b = (o.cacheKey || '').split(','); if (b[0] !== a[0]) continue; let d = 0; for (let j = 0; j < Math.max(a.length, b.length); j++) if (a[j] !== b[j]) d++; if (d < bd) { bd = d; best = b; } }
        e.name = q.name; e.kind0 = a[0]; e.fields = a.length;
        e.diff = best ? a.map((v, j) => (v !== best[j] ? `${j}:${(best[j] ?? '').slice(0, 40)}->${(v ?? '').slice(0, 40)}` : null)).filter(Boolean).slice(0, 12) : null;
        e.cacheKey = (q.cacheKey || '').length > 400 ? `${q.cacheKey.slice(0, 300)}...${q.cacheKey.slice(-100)}` : q.cacheKey;
      }
    }
    // C5: each late entry goes to Node once it is named (its frame's tick), so a reload does not lose it
    if (R.late.length > R.lateSent && !R.latePending.length) {
      try { window.__hhLate?.(JSON.stringify(R.late.slice(R.lateSent))); R.lateSent = R.late.length; } catch { /* */ }
    }

    const g = snapGl();
    const info = E?.renderer?.info, cur = info ? { p: info.programs?.length ?? 0, g: info.memory.geometries, x: info.memory.textures } : null;
    const heap = performance.memory?.usedJSHeapSize ?? 0;
    // C5: the textures that had their first upload on a frame that made textures (named in an idle moment after it)
    if (playing && R.texSeen && cur && prevInfo && cur.x > prevInfo.x) R.texScan(t);
    if (playing && !R.texSeen && E?.renderer) R.texSeed();
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
        if (cur && prevInfo && cur.p > prevInfo.p) {
          try {
            const fresh = info.programs.slice(prevInfo.p);
            f.programs = fresh.map((q) => q.name || q.cacheKey?.slice(0, 60) || '?');
            // C5: whose they are: the drawn objects whose material now holds one of them (name and two parents, material)
            const P = E.renderer.properties, who = [];
            const nm = (o) => (o ? (o.name || o.type) : '');
            E.scene?.traverse?.((o) => {
              if (who.length >= 6) return;
              const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
              for (const m of ms) {
                const pr = P.get(m)?.currentProgram;
                if (pr && fresh.includes(pr)) { who.push(`${nm(o.parent?.parent)}/${nm(o.parent)}/${nm(o)} ${m.type}${m.name ? ':' + m.name : ''}`); break; }
              }
            });
            f.programsOf = who;
            // and what sets each apart from the nearest program already linked (its cache key, field by field)
            const all = info.programs.slice(0, prevInfo.p);
            f.programsKey = fresh.map((q) => {
              const a = (q.cacheKey || '').split(',');
              let best = null, bd = Infinity;
              for (const o of all) { const b = (o.cacheKey || '').split(','); if (b[0] !== a[0]) continue; let d = 0; for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) d++; if (d < bd) { bd = d; best = b; } }
              const diff = [];
              if (best) for (let i = 0; i < Math.max(a.length, best.length); i++) if (a[i] !== best[i]) diff.push(`${i}:${(best[i] ?? '').slice(0, 40)}->${(a[i] ?? '').slice(0, 40)}`);
              return { kind: a[0], fields: a.length, nearest: best ? bd : null, diff: diff.slice(0, 12) };
            });
          } catch { /* */ }
        }
        if (R.slow.length) {
          try {
            const Pp = E.renderer.properties, nm = (o) => (o ? (o.name || o.type) : '');
            f.slowPrograms = R.slow.map(([glp, ms]) => {
              const q = (info.programs || []).find((x) => x.program === glp);
              const who = [];
              if (q) E.scene?.traverse?.((o) => {
                if (who.length >= 3) return;
                const ms2 = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
                for (const m of ms2) if (Pp.get(m)?.currentProgram === q) { who.push(`${nm(o.parent?.parent)}/${nm(o.parent)}/${nm(o)} ${m.type}${m.name ? ':' + m.name : ''}`); break; }
              });
              return { ms, kind: q?.cacheKey?.split(',')[0] ?? (q ? q.name : '?'), who };
            });
          } catch { /* */ }
        }
        if (R.sys) { const top = Object.entries(R.sys).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [k, Math.round(v * 10) / 10]); if (top.length) f.sys = top; }
        pending.push(f);
      }
    }
    if (R.sys) for (const k in R.sys) R.sys[k] = 0;
    R.slow.length = 0;
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

/**
 * C5's row, A-late-programs: FAIL when any program was linked, or waited over 5 ms on its first use, while she played
 * (after the boot's warm-up, the loading sheet closed). Each late program is named (whose build made it, its key).
 */
function verdict() {
  const late = run.launches.flatMap((L, i) => (L.late || []).map((e) => ({ launch: i, ...e })));
  run.late = late;
  run.verdict = { row: 'A-late-programs', pass: late.length === 0, links: late.filter((e) => e.kind === 'link').length, firstUses: late.filter((e) => e.kind === 'first-use').length };
  return run.verdict;
}
let said = false;
process.on('exit', () => {
  if (said || !run.launches.length) return;
  said = true;
  const v = verdict(); save();
  console.log(`[hour-hitch] A-late-programs: ${v.pass ? 'PASS' : 'FAIL'} (${v.links} linked in play, ${v.firstUses} first uses over 5 ms in play)`);
  for (const e of run.late) console.log(`[hour-hitch]   launch ${e.launch} ${e.kind} ${e.ms} ms at ${e.at ? `${e.at.x},${e.at.z}` : '?'} hour ${e.hour}: ${e.who ?? '?'} ${e.mat ?? '?'} [${e.key ?? '?'}]`);
});

const launch0 = puppeteer.launch.bind(puppeteer);
puppeteer.launch = async (opts) => {
  const browser = await launch0(opts);
  const L = { at: new Date().toISOString(), pages: 0, long: [], summary: null };
  run.launches.push(L); save();
  const pages = [];
  const instrument = async (page) => {
    L.pages++;
    pages.push(page);
    await page.exposeFunction('__hhSend', (json) => { try { L.long.push(...JSON.parse(json)); save(); } catch { /* */ } });
    // C5: late programs as they are named (every document: a reload keeps them), and the textures new on a frame
    await page.exposeFunction('__hhLate', (json) => { try { (L.late ||= []).push(...JSON.parse(json)); verdict(); save(); } catch { /* */ } });
    await page.exposeFunction('__hhTex', (json) => { try { (L.tex ||= []).push(JSON.parse(json)); save(); } catch { /* */ } });
    await page.evaluateOnNewDocument(`(${recorder.toString()})(${OVER});`);
    if (PROFILE) profilePage(page, L).catch((e) => { L.profileError = String(e?.message || e); save(); });
    return page;
  };
  const wrapNewPage = (host) => { const f = host.newPage.bind(host); host.newPage = async (...a) => instrument(await f(...a)); };
  wrapNewPage(browser);
  // a page in a context of its own (slice-hour.mjs runs the slice in browser.createBrowserContext())
  if (typeof browser.createBrowserContext === 'function') {
    const cc = browser.createBrowserContext.bind(browser);
    browser.createBrowserContext = async (...a) => { const c = await cc(...a); wrapNewPage(c); return c; };
  }
  const close0 = browser.close.bind(browser);
  browser.close = async (...a) => {
    for (const p of pages) {
      try { L.summary = await p.evaluate(() => ({ frames: window.__hh?.n ?? null, long: window.__hh?.nLong ?? null, hitch: window.__hitch ? { n: window.__hitch.n, over33: window.__hitch.over33, over50: window.__hitch.over50, max: +window.__hitch.max.toFixed(1) } : null,
        walk: (window.__CTX__?.nav?._walk || []).map((w) => ({ id: w.id, cells: w.open?.length ?? null, paths: w.stats.paths, misses: w.stats.misses, long: w.stats.long || 0, alt: w.stats.alt || 0, landmarks: w.stats.landmarks || null, lmReady: !!w._lm?.ready })) })); } catch { /* */ }
    }
    for (const p of pages) {
      // the entries not yet sent (the live sends hold the rest)
      try { const late = await p.evaluate(() => (window.__hh?.late ?? []).slice(window.__hh?.lateSent ?? 0)); L.late = (L.late || []).concat(late); } catch { /* */ }
    }
    L.closedAt = new Date().toISOString();
    verdict(); save();
    return close0(...a);
  };
  return browser;
};

/**
 * C5 MEASURED WHOLE: `node tools/perf/hour-hitch-preload.mjs --whole <dir> [<dir>...]` grades every frame the preload
 * recorded while she played, in every document of every leg (a dir is one chained first-hour run: hour-hitch.json and
 * its child's), against the bar: 0 frames over 50 ms and at most 3 over 33 ms per 10 minutes of play. Left out, and
 * listed: the runners' own screenshot frames (__hitch pause or skip), and the slice child's staged rows after its run
 * (its frames once the quest closed: rakers-morning at 'return' with no spine stage left: the site-clock row). The
 * play time is the runners' own (first-hour.mjs's log lines "N s of play" when a log is given with --log, else the
 * frames' count at 60 Hz). Exit 1 when any dir fails.
 */
async function whole(dirs) {
  const { readFileSync, readdirSync, existsSync } = await import('node:fs');
  let fail = false;
  for (const dir of dirs) {
    const files = readdirSync(dir).filter((f) => /^hour-hitch(-child-\d+)?\.json$/.test(f)).sort();
    let over33 = 0, over50 = 0, frames = 0; const list = [], left = [];
    for (const f of files) {
      const r = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
      const child = /child/.test(f);
      for (const [li, L] of (r.launches || []).entries()) {
        frames += L.summary?.frames ?? 0;
        for (const fr of L.long || []) {
          if (!(fr.d > 33)) continue;
          const tool = fr.tool || {}, st = fr.stage || {};
          const why = tool.pause ? 'tool-pause' : tool.skip ? 'tool-skip'
            : (child && st['rakers-morning'] === 'return' && !fr.spine) ? 'slice-staged-rows' : null;
          const e = { file: f, launch: li, d: fr.d, stage: Object.values(st).filter(Boolean).slice(-1)[0] ?? null, spine: fr.spine ?? null,
            lf: fr.lf, gl: fr.gl, info: fr.info, texNew: fr.texNew ? fr.texNew.length : undefined };
          if (why) { if (fr.d < 300) left.push({ ...e, why }); continue; }
          over33++; if (fr.d > 50) over50++;
          list.push(e);
        }
      }
    }
    // the play time: the preload's own frame counts (every presented frame while playing), at their real intervals
    // when the summaries are missing; per 10 minutes of play
    const minutes = frames / 60 / 60;
    const per10 = minutes > 0 ? over33 / (minutes / 10) : null;
    const pass = over50 === 0 && per10 != null && per10 <= 3;
    if (!pass) fail = true;
    console.log(`C5 whole ${dir}: ${pass ? 'PASS' : 'FAIL'}: ${over50} over 50 ms, ${over33} over 33 ms in ${minutes.toFixed(1)} min of play (${per10?.toFixed(2)} per 10 min; bar 0 and <= 3)`);
    for (const e of list) console.log(`   ${e.d} ms ${e.file}#${e.launch} ${e.stage}/${e.spine} lf ${JSON.stringify(e.lf)} info ${JSON.stringify(e.info)}${e.texNew ? ` texNew ${e.texNew}` : ''}`);
    for (const e of left) console.log(`   (left out: ${e.why}) ${e.d} ms ${e.file}#${e.launch} ${e.stage}/${e.spine}`);
  }
  process.exit(fail ? 1 : 0);
}
if (process.argv[1] && /hour-hitch-preload\.mjs$/.test(process.argv[1]) && process.argv.includes('--whole')) {
  said = true;
  const i = process.argv.indexOf('--whole');
  await whole(process.argv.slice(i + 1).filter((a) => !a.startsWith('--')));
}

// `node tools/perf/hour-hitch-preload.mjs --verdict <dir>`: the row read back from <dir>/hour-hitch.json (exit 1 on FAIL)
if (process.argv[1] && /hour-hitch-preload\.mjs$/.test(process.argv[1]) && process.argv.includes('--verdict')) {
  said = true;
  const dir = process.argv[process.argv.indexOf('--verdict') + 1];
  const { readFileSync } = await import('node:fs');
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(dir).filter((f) => /^hour-hitch(-child-\d+)?\.json$/.test(f)).sort();
  const runs = files.map((f) => ({ f, j: JSON.parse(readFileSync(path.join(dir, f), 'utf8')) }));
  const j = runs.find((r) => r.f === 'hour-hitch.json')?.j || runs[0]?.j || {};
  const late = runs.flatMap(({ f, j: r }) => (r.launches || []).flatMap((L, i) => (L.late || []).map((e) => ({ launch: `${f.replace(/\.json$/, '')}#${i}`, ...e }))));
  const nL = runs.reduce((n, r) => n + (r.j.launches || []).length, 0);
  console.log(`A-late-programs at ${j.commit ?? '?'}: ${late.length ? 'FAIL' : 'PASS'} (${late.length} late in ${nL} launches, ${files.length} files)`);
  for (const e of late) console.log(`  launch ${e.launch} ${e.kind} ${e.ms} ms at ${e.at ? `${e.at.x},${e.at.z}` : '?'} hour ${e.hour}: ${e.who ?? '?'} ${e.mat ?? '?'} [${e.key ?? '?'}]`);
  process.exit(late.length ? 1 : 0);
}
