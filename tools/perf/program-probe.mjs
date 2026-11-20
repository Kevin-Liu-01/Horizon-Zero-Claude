#!/usr/bin/env node
/**
 * C5 (M2 exit line, the first hour's hitches): WHAT A PROGRAM COSTS ON ITS FIRST USE, on this machine's Chrome.
 * The first hour's long frames at ddc31c1 were programs whose first use waited 23-35 ms in getProgramInfoLog, some of
 * them linked at the boot's warm-up 10 minutes before (the Kiln Yards' wellheads). This probe boots the title once and
 * reads, with no change to the game:
 *
 *   ext        KHR_parallel_shader_compile on the context, and three's flag for it
 *   boot       the programs at the title; how many have had their first use (three calls getProgramInfoLog once per
 *              program, on its first use: a wrapper installed before any script sees each), and whose the rest are
 *   fresh      three new programs (a MeshStandardMaterial with a key of its own each), linked as the scene pass draws:
 *              (a) first use at once; (b) first use after COMPLETION_STATUS_KHR reads true (frames and ms waited);
 *              (c) first use after 2 s of title frames with no poll
 *   resolve    (--resolve) every boot program not yet used gets its first use now (program.getUniforms()), each timed
 *   systems    the systems whose constructor is a plain Object (the hitch preload's "Object.update"): their keys
 *   shadow     the depth programs (skinning bit), the cascades' castShadow, the hour and the sun
 *
 *   node tools/perf/program-probe.mjs --port 5271 [--resolve] [--out <dir outside the repo>]
 *
 * Takes the machine-wide slot1 (tools/chrome-slot.mjs) and its own Vite (nice, 127.0.0.1). Run it through
 * tools/perf/clean-measure.sh so its numbers are a commit's.
 */
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardPort, profileDir, disposeProfile, installProfileCleanup } from '../chrome-profile.mjs';
import { takeMachineSlot, releaseMachineSlot } from '../chrome-slot.mjs';
import { RUNS, assertOutsideRepo } from '../frames/paths.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = guardPort(flag('--port'));
const RESOLVE = args.includes('--resolve');
const WARMDRAW = args.includes('--warm-draw');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const OUT = flag('--out') || path.join(RUNS, `${stamp}-${process.env.CLEAN_COMMIT || 'tree'}-program-probe`);
assertOutsideRepo(OUT, REPO);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[program-probe ${new Date().toISOString().slice(11, 19)}]`, ...a);
const portOpen = (p) => new Promise((r) => { const s = net.connect(p, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });

/** Before any script: every program's first use (getProgramInfoLog), with its ms. */
const firstUse = () => {
  const R = (window.__pp = { used: new WeakMap(), log: [] });
  const P = WebGL2RenderingContext.prototype, f = P.getProgramInfoLog;
  P.getProgramInfoLog = function (prog) {
    const t = performance.now();
    try { return f.call(this, prog); } finally {
      const d = performance.now() - t;
      if (!R.used.has(prog)) { R.used.set(prog, d); R.log.push(Math.round(d * 10) / 10); }
    }
  };
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const out = { tool: 'tools/perf/program-probe.mjs', commit: process.env.CLEAN_COMMIT || null, port: PORT, startedAt: new Date().toISOString() };
  let vite = null, browser = null, profile = null;
  try {
    if (await portOpen(PORT)) throw new Error(`port ${PORT} already in use`);
    const slot = await takeMachineSlot({ who: `perf program-probe ${PORT}`, waitS: 3600, log });
    if (!slot.ok) throw new Error(slot.why);
    vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: process.cwd(), stdio: 'ignore', detached: true });
    for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
    if (!(await portOpen(PORT))) throw new Error(`vite did not open ${PORT}`);
    installProfileCleanup();
    profile = profileDir(PORT);
    const tC = Date.now();
    browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940',
        '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.25 });
    const errors = [];
    const warns = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); else if (m.type() === 'warning' && /\[CAL\]/.test(m.text())) warns.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
    await page.evaluateOnNewDocument(firstUse);
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 180000, polling: 100 });
    out.titleS = +((Date.now() - tC) / 1000).toFixed(2);
    await sleep(4000);   // the deferred warm-up's poll (main.js _warmUpDeferred) and a few title frames
    out.page = await page.evaluate(async (RESOLVE, WARMDRAW) => {
      const C = window.__CTX__, E = C.engine, r = E.renderer, gl = r.getContext(), THREE = E.constructor.THREE || null;
      const R = window.__pp;
      const o = {};
      o.ext = { parallel: !!gl.getExtension('KHR_parallel_shader_compile'), threeHas: r.extensions.has('KHR_parallel_shader_compile'), checkShaderErrors: r.debug.checkShaderErrors,
        renderer: (() => { const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null; })() };
      o.engine = { warmUpMs: E.warmUpMs, warmUpPrograms: E.warmUpPrograms, bootRungWarm: E.bootRungWarm ? { ms: E.bootRungWarm.ms, programs: E.bootRungWarm.programs } : null };
      const nm = (x) => (x ? (x.name || x.type) : '');
      const owners = (q, k = 3) => {
        const who = [], P = r.properties;
        C.scene.traverse((ob) => {
          if (who.length >= k) return;
          const ms = Array.isArray(ob.material) ? ob.material : ob.material ? [ob.material] : [];
          for (const m of ms) if (P.get(m)?.currentProgram === q) { who.push(`${nm(ob.parent?.parent)}/${nm(ob.parent)}/${nm(ob)} ${m.type}${m.name ? ':' + m.name : ''}`); break; }
        });
        return who;
      };
      const list = r.info.programs.slice();
      const unused = list.filter((q) => !R.used.has(q.program));
      o.boot = { programs: list.length, used: list.length - unused.length, firstUseMsSum: Math.round(R.log.reduce((a, b) => a + b, 0)),
        firstUseOver5: R.log.filter((d) => d > 5).length,
        unused: unused.map((q) => ({ name: q.name, kind: (q.cacheKey || '').split(',')[0], key: (q.cacheKey || '').slice(0, 90), usedTimes: q.usedTimes, ready: (() => { try { return q.isReady(); } catch { return null; } })(), owners: owners(q) })) };
      // the shadow side
      const csm = E.csm;
      o.shadow = { hour: C.environment?.time ?? null, sunY: C.environment?.sunDir?.y ?? null, shadowMap: { enabled: r.shadowMap.enabled, autoUpdate: r.shadowMap.autoUpdate, type: r.shadowMap.type },
        cascades: csm ? csm.lights.map((l) => ({ cast: l.castShadow, vis: l.visible, intensity: +l.intensity.toFixed(3), map: !!l.shadow.map, auto: l.shadow.autoUpdate })) : null,
        depth: list.filter((q) => /^depth|^distance/.test(q.cacheKey || '')).map((q) => { const a = (q.cacheKey || '').split(','); return { kind: a[0], f55: a[55], skin: (Number(a[55]) & 32) ? 1 : 0, used: R.used.has(q.program), id: q.id, key: q.cacheKey }; }),
        warmCaster: (() => { const m = E._warmExtras?.find((x) => x.name === 'warm-skinned-caster'); return m ? { castShadow: m.castShadow, layers: m.layers.mask, drawnN: E._warmDrawnN ?? null } : null; })(),
        cameraLayers: C.camera.layers.mask };
      // the plain-Object systems
      o.systems = (window.__GAME__?.systems || []).map((s, i) => ({ i, name: s?.constructor?.name || '?', keys: s?.constructor?.name === 'Object' ? Object.keys(s).slice(0, 14) : undefined })).filter((s) => s.name === 'Object' || s.name === '?');
      // fresh programs: a material with a key of its own, linked as the scene pass draws it
      const T = window.__CAL_THREE__ || null;
      const mk = (key) => {
        const proto = C.scene.getObjectByProperty('isMesh', true);
        const mat = new proto.material.constructor();
        if (!mat.isMeshStandardMaterial) return null;
        mat.customProgramCacheKey = () => key;
        mat.onBeforeCompile = (sh) => { sh.fragmentShader = `// ${key}\n` + sh.fragmentShader; };
        const mesh = new proto.constructor(proto.geometry, mat);
        return mesh;
      };
      const linkOf = (mesh) => { const t = performance.now(); E.compileAsDrawn(mesh, C.camera, C.scene); return performance.now() - t; };
      const progOf = (mesh) => r.properties.get(mesh.material)?.currentProgram;
      const frame = () => new Promise((res) => requestAnimationFrame(() => res()));
      o.fresh = {};
      const a = mk('pp-fresh-a-' + Math.random());
      if (a) {
        const link = linkOf(a), q = progOf(a); const t = performance.now(); q.getUniforms(); o.fresh.a = { linkMs: +link.toFixed(1), firstUseMs: +(performance.now() - t).toFixed(1) };
        const b = mk('pp-fresh-b-' + Math.random()); const lb = linkOf(b), qb = progOf(b); const tb = performance.now(); let frames = 0, polls = 0;
        while (!qb.isReady() && frames < 240) { polls++; await frame(); frames++; }
        const waited = performance.now() - tb; const tu = performance.now(); qb.getUniforms();
        o.fresh.b = { linkMs: +lb.toFixed(1), readyAfterFrames: frames, readyAfterMs: +waited.toFixed(1), firstUseMs: +(performance.now() - tu).toFixed(1) };
        const c = mk('pp-fresh-c-' + Math.random()); const lc = linkOf(c), qc = progOf(c); await new Promise((res) => setTimeout(res, 2000));
        const tc = performance.now(); qc.getUniforms(); o.fresh.c = { linkMs: +lc.toFixed(1), firstUseMsAfter2s: +(performance.now() - tc).toFixed(1) };
        // (d) linked, ready by the poll, then DRAWN once into the scene target (no getUniforms of ours first): the frame's ms
        const d = mk('pp-fresh-d-' + Math.random()); linkOf(d); const qd = progOf(d); let fd = 0; while (!qd.isReady() && fd < 240) { await frame(); fd++; }
        d.frustumCulled = false; d.position.set(0, -1000, 0);
        const td = performance.now(); r.setRenderTarget(E.sceneTarget); r.render(d, C.camera); r.setRenderTarget(null); gl.finish(); o.fresh.d = { readyAfterFrames: fd, drawAndFinishMs: +(performance.now() - td).toFixed(1) };
        for (const m of [a, b, c, d]) m.material.dispose();
      }
      // (--warm-draw) the warm extras drawn once more at the title: which depth programs it links (the skinned caster's)
      if (WARMDRAW) {
        const before = new Set(r.info.programs);
        const sk = E._warmExtras.find((x) => x.name === 'warm-skinned-caster');
        const hits = { main: 0, shadow: 0, frame: 0 };
        if (sk) { sk.onBeforeRender = () => { hits.main++; }; sk.onBeforeShadow = () => { hits.shadow++; }; }
        const fr0 = r.info.render.frame;
        let err = null; try { E._drawWarmExtras(C.scene, C.camera); } catch (e) { err = String(e); }
        hits.frame = r.info.render.frame - fr0; hits.sceneIsEngine = C.scene === E.scene; hits.cameraIsEngine = C.camera === E.camera;
        hits.hold = !!E._hold; hits.ctxLost = !!E.contextLost; hits.smAuto = r.shadowMap.autoUpdate; hits.smEnabled = r.shadowMap.enabled;
        // and once more with the caster in the scene through a real frame of the loop
        if (sk) { sk.position.copy(C.camera.position); sk.frustumCulled = false; C.scene.add(sk); await frame(); await frame(); C.scene.remove(sk); }
        hits.afterLoop = { ...hits };
        o.warmDraw = { hits, err, extras: E._warmExtras.map((x) => x.name || x.type), caster: sk ? { pos: sk.position.toArray().map((v) => +v.toFixed(1)), cam: C.camera.position.toArray().map((v) => +v.toFixed(1)) } : null,
          fresh: r.info.programs.filter((q) => !before.has(q)).map((q) => (q.cacheKey || '').replace(/false,/g, 'f,').slice(0, 300)) };
      }
      if (RESOLVE) {
        const t0 = performance.now(), each = [];
        for (const q of unused) { const t = performance.now(); try { q.getUniforms(); } catch { /* */ } each.push(+(performance.now() - t).toFixed(1)); }
        o.resolve = { n: unused.length, ms: Math.round(performance.now() - t0), each };
      }
      return o;
    }, RESOLVE, WARMDRAW);
    out.errors = errors; out.warns = warns;
  } catch (e) {
    out.error = String(e?.stack || e);
    log('error', out.error);
  } finally {
    if (browser) { try { await browser.close(); } catch { /* */ } }
    if (profile) disposeProfile(profile);
    releaseMachineSlot(log);
    if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } }
    out.endedAt = new Date().toISOString();
    writeFileSync(path.join(OUT, 'program-probe.json'), JSON.stringify(out, null, 1));
    log('wrote', path.join(OUT, 'program-probe.json'));
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
