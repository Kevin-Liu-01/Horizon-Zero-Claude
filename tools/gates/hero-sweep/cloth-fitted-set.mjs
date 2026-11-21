#!/usr/bin/env node
/**
 * A-cloth-fitted-set (cloth lane, kept candidate): her sash panels as the GAME dresses her, not as a staged frame does.
 *
 * In play her set is put on more than once after the grid cloth is built on her first frame: the rung warm-up behind the
 * boot sheet (src/main.js _warmRungs: the Scout on, then hers back), a save that wears the Scout, the slice's reward.
 * Each put-on binds NEW meshes (src/hero/parts.js bindPart). The rig (src/entities/anim/cloth/rig.js) re-skins the
 * meshes it was built on; a set bound after it kept its panels on the old `dyn_panel*` chains, which the rig only drives
 * from each grid's centre column: a whole panel on one chain of swing-only links, flat, standing off her hips (the flap
 * the 2026-11-21 review filmed in the first hour). Staged frames (?shot) skip the warm-up and are built once: clean.
 *
 * TWO READS, both of the RENDERED panels (every outfit mesh she draws, the caster out; a panel vertex is one with at
 * least 0.3 of its skin on a `dyn_panel*` or `cl_panel*` bone, read off the mesh's own skeleton):
 *   loose   panel vertices skinned to a `dyn_panel*` chain bone, not to the grid (bar 0: the grid cloth owns every
 *           drawn panel vertex);
 *   out     panel vertices farther than BAR_OUT (0.20 m) from where the grid cloth itself puts that point of the panel
 *           (the rig's own sample at the vertex's grid parameter; for a vertex on the grid this is its skin's place), and
 *           the panels' farthest reach from her pelvis axis (m, reported).
 *   hats    the hat copies drawn (PIECE bits 32 head, 64 and 128 back): bar 1. In the page, the bits the DRAWN program
 *           hides (none when its program was linked without the piece stage: src/core/engine.js keepPrograms' keepers
 *           before the cloth lane's fix linked the Scout's program with the prototype's empty onBeforeCompile).
 *   --diag  (page) every drawn PIECE-mask mesh in the scene, its program, and who else holds the Scout's program.
 *
 *   --node                     the Node bench (no browser): Brea dressed in the Starter, the rig built, then the Scout
 *                              fitted over it and the Starter put back (the warm-up), then the Scout (the reward); each
 *                              read standing, at a walk, a jog and the stop after it.
 *   --page --port <p>          the game from the real title: fixture(2) (the slice's end, the Scout worn) written as a
 *                              save on disk, CONTINUE, the sheet closed; read standing, then after a 2 s run and a stop.
 *                              Vite is served from CLEAN_TREE (tools/perf/clean-measure.sh) or this tree.
 * Output: one JSON line per read, and `A-cloth-fitted-set PASS|FAIL` with the worst numbers. --json <file> writes all.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BAR_OUT = 0.20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ the read (runs in Node or in the page) */
/** `M` her model, `rig` the grid cloth (or null), `bits` the loadout's hidden piece bits, `uOf(mesh)` the uHidePiece value
 *  the mesh's drawn program binds (null: unknown). Self-contained: sent to the page as source. */
export function readFitted(M, rig, bits, uOf, BAR) {
  M.updateMatrixWorld(true);
  const T = M.position.constructor;
  const v = new T(), s = new T();
  let pel = null; M.traverse((o) => { if (!pel && o.isBone && o.name === 'pelvis') pel = o; });
  const pp = new T().setFromMatrixPosition(pel.matrixWorld);
  const out = { meshes: [], loose: 0, out: 0, worst: 0, reach: 0, panelVerts: 0, hats: null, hatBits: bits };
  // the rig's sample at (s, t) of a piece, and each piece's bind parameters by stem (the rig's own, P.verts)
  const pieces = rig ? rig.pieces.filter((P) => P.kind === 'panel') : [];
  const byIdx = new Map(pieces.map((P) => [P, new Map((P.verts || []).map((r) => [r.i, r]))]));
  M.traverse((o) => {
    if (!o.isSkinnedMesh || !/^outfit:/.test(o.userData?.heroPart || '') || o.name === 'Caster' || o.userData.heroCaster) return;
    if (!o.visible) return;
    const bn = o.skeleton.bones.map((b) => b.name), si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    const row = { tag: o.userData.heroPart, panel: 0, loose: 0, out: 0, worst: 0 };
    // the rig's vertex records of this mesh (bind params), when it was built on it
    const vmap = new Map();
    for (const P of pieces) for (const r of P.verts || []) if (r.mesh === o) vmap.set(r.i, [P, r]);
    for (let i = 0; i < si.count; i++) {
      let wd = 0, wc = 0, stem = null;
      for (let k = 0; k < 4; k++) {
        const nm = bn[si.getComponent(i, k)] || '', w = sw.getComponent(i, k);
        if (nm.startsWith('dyn_panel')) { wd += w; stem = nm.replace(/_\d+$|_end$/, ''); } else if (nm.startsWith('cl_panel')) wc += w;
      }
      if (wd + wc < 0.3) continue;
      row.panel++;
      o.getVertexPosition(i, v); o.localToWorld(v);
      const reach = Math.hypot(v.x - pp.x, v.z - pp.z);
      if (reach > out.reach) out.reach = reach;
      if (wd >= 0.3) row.loose++;
      // where the grid puts this point: the rig's record (on the grid) or the same stem's piece at this vertex's place
      // in its bind, found by its nearest record on the rig's built mesh
      let d = 0;
      const rec = vmap.get(i);
      if (rec) { rig._sample(rec[0], rec[1].s, rec[1].t, s); d = v.distanceTo(s); }
      else if (stem) {
        const P = pieces.find((q) => q.stem === stem);
        if (P && P.verts?.length) {
          // the source geometry's vertex i is the same vertex in every binding of the same set (bindPart shares geometry)
          const r = byIdx.get(P).get(i);
          if (r) { rig._sample(P, r.s, r.t, s); d = v.distanceTo(s); }
        }
      }
      if (d > row.worst) row.worst = d;
      if (d > BAR) row.out++;
    }
    out.meshes.push(row);
    out.loose += row.loose; out.out += row.out; out.panelVerts += row.panel; out.worst = Math.max(out.worst, row.worst);
    // the hat: which of its copies (PIECE 32 head, 64 / 128 back) the drawn program shows
    const pc = o.geometry.getAttribute('_piece') || o.geometry.getAttribute('_PIECE');
    if (pc) {
      const have = new Set();
      for (let i = 0; i < pc.count; i++) { const p = Math.round(pc.getX(i)); for (const b of [32, 64, 128]) if (p & b) have.add(b); }
      const u = uOf(o);
      out.hats = { copies: [...have], drawnBits: u, shown: [...have].filter((b) => u == null ? true : !(u & b)).length };
    }
  });
  for (const k of ['worst', 'reach']) out[k] = +out[k].toFixed(3);
  for (const m of out.meshes) m.worst = +m.worst.toFixed(3);
  return out;
}

const verdict = (reads) => {
  const loose = Math.max(...reads.map((r) => r.loose)), outN = Math.max(...reads.map((r) => r.out)), worst = Math.max(...reads.map((r) => r.worst));
  const hats = Math.max(...reads.map((r) => r.hats ? r.hats.shown : 1));
  // (no grid rig: the old chains were the cloth, before 4d11034; the row reads the grid cloth only)
  const noRig = reads.some((r) => r.rig === false);
  const pass = !noRig && loose === 0 && outN === 0 && hats <= 1;
  return { pass, noRig, loose, out: outN, worst: +worst.toFixed(3), reach: Math.max(...reads.map((r) => r.reach)), hatsShown: hats };
};

/* ------------------------------------------------------------------ Node */
async function runNode() {
  // (the game's own cloth, as cloth/mode.js gives it: no flag is set here)
  const B = await import('./bench.mjs');
  const { loadPartRow } = await import('./load.mjs');
  const { ARMOR_ROWS } = await import('../../../src/hero/rows.js');
  const { peekClothRig } = await import('../../../src/entities/anim/cloth/rig.js');
  const R = await B.makeBench({});
  B.reset(R);
  // (the bench's assets: the deferred rows load and unload as src/core/assets.js does it, by row)
  const A = R.ctx.assets;
  A.loadExtra = async (rows) => { for (const [k, spec] of Object.entries(rows)) A.models[k] = await loadPartRow(k, spec); };
  A.unload = (k) => { delete A.models[k]; };
  // the bench's player has no fade clones: the drawn uniform is the source material's own
  const uOf = (m) => m.material?.userData?.clothU?.uHidePiece?.value ?? null;
  const reads = [];
  const read = (label) => { const rig = peekClothRig(R.an); const r = readFitted(R.model, rig, R.hero.loadout._pieceBits, uOf, BAR_OUT); r.label = label; r.row = R.hero.outfit.row; r.rig = !!rig; reads.push(r); console.log(JSON.stringify({ label, row: r.row, rig: r.rig, loose: r.loose, out: r.out, worst: r.worst, reach: +r.reach.toFixed(3), hats: r.hats, meshes: r.meshes.map((m) => `${m.tag}:${m.panel}/${m.loose}/${m.out}`) })); };
  const go = (speed, n) => { R.player.velocity.set(0, 0, speed); R.player.moveSpeed = speed; for (let i = 0; i < n; i++) B.step(R); };
  const legs = (tag) => { go(0, 60); read(`${tag} stand`); go(1.5, 90); read(`${tag} walk`); go(5, 90); read(`${tag} jog`); go(0, 45); read(`${tag} stop`); };
  legs('starter');
  // the warm-up: the Scout fitted over, then hers back
  await R.hero.loadout.equipArmor('pan-2'); B.step(R);
  await R.hero.loadout.equipArmor('pan-1');
  legs('starter after warm-up');
  // the reward
  await R.hero.loadout.equipArmor('pan-2');
  legs('scout');
  return reads;
}

/* ------------------------------------------------------------------ page */
async function runPage() {
  const { spawn } = await import('node:child_process');
  const net = await import('node:net');
  const puppeteer = (await import('puppeteer')).default;
  const { RUNS } = await import('../../frames/paths.mjs');
  const { guardPort, profileDir, disposeProfile, installProfileCleanup } = await import('../../chrome-profile.mjs');
  const { takeMachineSlot, releaseMachineSlot } = await import('../../chrome-slot.mjs');
  const { fixture } = await import('../systems/first-hour-fixtures.mjs');
  const PORT = guardPort(flag('--port'));
  const TREE = process.env.CLEAN_TREE || REPO;
  const { execFileSync } = await import('node:child_process');
  const commit = execFileSync('git', ['-C', TREE, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const runDir = path.join(RUNS, `${stamp}-${commit}-${flag('--label', 'cloth-fitted')}`);
  mkdirSync(runDir, { recursive: true });
  const portOpen = (p) => new Promise((r) => { const s = net.connect(p, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
  let vite = null, browser = null, profile = null;
  const reads = [], cons = [];
  try {
    if (await portOpen(PORT)) throw new Error(`port ${PORT} already in use`);
    const slot = await takeMachineSlot({ who: `cloth fitted-set ${PORT}`, waitS: 1800 });
    if (!slot.ok) throw new Error(slot.why);
    vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: TREE, stdio: 'ignore', detached: true });
    for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
    installProfileCleanup();
    profile = profileDir(PORT);
    browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940',
        '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
    page.on('console', (m) => { if (m.type() === 'error') cons.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => cons.push(`pageerror: ${String(e).slice(0, 300)}`));
    const base = `http://127.0.0.1:${PORT}/`;
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__CTX__?.state === 'title' && !!window.__CTX__?.progression?.saves?.store, { timeout: 180000, polling: 200 });
    const rec = { ...fixture(2), savedAt: Date.now() };
    const wrote = await page.evaluate((r) => { const st = window.__CTX__.progression.saves.store; st.setActive(1); return st.write(r); }, rec);
    if (!wrote?.ok) throw new Error(`fixture not written: ${JSON.stringify(wrote)}`);
    await page.goto('about:blank');
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 180000, polling: 100 });
    await sleep(500);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 50 });
    await sleep(300);
    const cont = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.mn-title-item')].find((x) => /CONTINUE/.test(x.textContent));
      if (!b || b.disabled) return 'no CONTINUE on the title';
      b.click();
      const g = document.querySelector('.gs-slot.cont .gs-slot-go');
      if (!g) return 'no marked slot card';
      g.click(); return null;
    });
    if (cont) throw new Error(cont);
    await page.waitForFunction(() => window.__CTX__?.state === 'playing' && document.getElementById('loading')?.classList.contains('hidden') !== false, { timeout: 120000, polling: 100 });
    await sleep(3000);
    await page.evaluate(`window.__readFitted = ${readFitted.toString()};`);
    const read = async (label) => {
      const r = await page.evaluate(async (BAR) => {
        const C = window.__CTX__, P = C.player, an = P.animator, R = C.renderer;
        // (the app's own module instance: Vite serves it at this URL)
        const rig = (await import('/src/entities/anim/cloth/rig.js')).peekClothRig(an);
        // the value the DRAWN program binds: 0 when its program has no uHidePiece (a program linked without the piece
        // stage draws every copy, whatever the material's uniform says)
        const uOf = (m) => { const q = R.properties.get(m.material), map = q?.currentProgram?.getUniforms?.()?.map; if (!map) return null; return 'uHidePiece' in map ? (q.uniforms?.uHidePiece?.value ?? 0) : 0; };
        const out = window.__readFitted(P.model, rig, P.hero?.loadout?._pieceBits ?? null, uOf, BAR);
        out.row = P.hero?.outfit?.row; out.rig = !!rig; out.info = an.clothInfo?.()?.pieces?.map((p) => `${p.name}:${p.verts}`) ?? null;
        return out;
      }, BAR_OUT);
      r.label = label; reads.push(r);
      await page.screenshot({ path: path.join(runDir, `${label.replace(/\W+/g, '-')}.jpg`), type: 'jpeg', quality: 85 });
      console.log(JSON.stringify({ label, row: r.row, rig: r.rig, loose: r.loose, out: r.out, worst: r.worst, reach: +r.reach.toFixed(3), hats: r.hats, meshes: r.meshes.map((m) => `${m.tag}:${m.panel}/${m.loose}/${m.out}`) }));
    };
    await read('continued stand');
    await page.keyboard.down('KeyW'); await sleep(2000); await page.keyboard.up('KeyW');
    await read('after run');
    await sleep(1500);
    await read('stopped');
    // --diag: every drawn mesh that carries a PIECE mask, in the whole scene: its owner, the program it is drawn with,
    // whether that program binds uHidePiece, and the value it binds
    if (args.includes('--diag')) {
      const d = await page.evaluate(() => {
        const C = window.__CTX__, R = C.renderer, out = [];
        C.scene.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          const pc = o.geometry.getAttribute('_piece') || o.geometry.getAttribute('_PIECE');
          if (!pc) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            const pr = R.properties.get(m), prog = pr?.currentProgram;
            const map = prog?.getUniforms?.()?.map || {};
            let anc = [], q = o; while (q && anc.length < 4) { anc.push(q.name || q.type); q = q.parent; }
            out.push({ name: o.name, part: o.userData?.heroPart ?? null, visible: o.visible, inHer: (() => { let q = o; while (q) { if (q === C.player.model) return true; q = q.parent; } return false; })(), anc: anc.join('<'),
              mat: m?.name, fade: !!m?.userData?.fadeU, key: prog?.cacheKey?.slice(0, 80) ?? null, hasU: 'uHidePiece' in map, u: pr?.uniforms?.uHidePiece?.value ?? null, layers: o.layers.mask, skinned: !!o.isSkinnedMesh });
          }
        });
        // the Scout's drawn material: its own hook on a bare shader, its key, and every program of a cloth key
        let mesh = null; C.player.model.traverse((o) => { if (!mesh && /^outfit:armorPan2/.test(o.userData?.heroPart || '')) mesh = o; });
        if (mesh) {
          const m = mesh.material, fake = { vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>', fragmentShader: '#include <common>\nvoid main() {', uniforms: {} };
          let hookOk = null; try { m.onBeforeCompile(fake, R); hookOk = fake.vertexShader.includes('uHidePiece'); } catch (e) { hookOk = String(e).slice(0, 120); }
          const pr = R.properties.get(m);
          out.push({ scout: true, key: m.customProgramCacheKey?.(), progKeyTail: pr?.currentProgram?.cacheKey?.slice(-80), hookOk, obc: String(m.onBeforeCompile).slice(0, 160), version: m.version,
            programs: (R.info.programs || []).filter((p) => /hero-cloth/.test(p.cacheKey)).map((p) => {
              const gl = R.getContext(), sh = gl.getAttachedShaders(p.program) || [], src = sh.map((x) => gl.getShaderSource(x) || '').join('\n');
              const map = p.getUniforms().map || {};
              return { tail: p.cacheKey.slice(-50), used: p.usedTimes, hasU: 'uHidePiece' in map, srcHasU: src.includes('uHidePiece'), srcHasFade: src.includes('uFadeK'), srcHasDetail: src.includes('uDetail'), nU: Object.keys(map).length, mapHasFade: 'uFadeK' in map, id: p.id };
            }), cur: pr?.currentProgram?.id });
          // who else holds program `cur` (every material in the scene and the engine's keepers)
          const cur = pr?.currentProgram, holders = [];
          const look = (mm, where) => { if (!mm) return; const q = R.properties.get(mm); if (q?.currentProgram === cur || (q?.programs && [...q.programs.values()].includes(cur))) holders.push({ where, name: mm.name, fade: !!mm.userData?.fadeU, keeper: /^keeper:/.test(mm.name || ''), obcNoop: String(mm.onBeforeCompile).length < 20, keyFn: String(mm.customProgramCacheKey).slice(0, 40), same: mm === m,
            obc: String(mm.onBeforeCompile).slice(0, 90), own: Object.keys(mm).filter((k) => typeof mm[k] === 'function'), uKeys: Object.keys(q?.uniforms || {}).filter((k) => /^u[A-Z]/.test(k)), ver: mm.version, defs: JSON.stringify(mm.defines) }); };
          C.scene.traverse((o) => { for (const mm of [].concat(o.material || [])) look(mm, o.name); });
          for (const k of C.engine._keepers || []) look(k, 'keeper');
          out.push({ holders });
          // (and once more after the material is asked to compile again)
          m.needsUpdate = true; R.render(C.scene, C.camera);
          const pr2 = R.properties.get(m), p2 = pr2?.currentProgram;
          out.push({ after: true, cur: p2?.id, hasU: 'uHidePiece' in (p2?.getUniforms?.()?.map || {}) });
        }
        return out;
      });
      console.log('DIAG', JSON.stringify(d));
    }
  } finally {
    try { await browser?.close(); } catch { /* */ }
    if (profile) disposeProfile(profile);
    if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } }
    releaseMachineSlot();
  }
  writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({ commit, reads, console: cons }, null, 1));
  console.log(`run dir ${runDir}; console errors ${cons.length}`);
  return reads;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const reads = args.includes('--page') ? await runPage() : await runNode();
  const V = verdict(reads);
  console.log(`A-cloth-fitted-set ${V.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(V)}`);
  if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify({ verdict: V, reads }, null, 1));
  process.exitCode = V.pass ? 0 : 1;
}
