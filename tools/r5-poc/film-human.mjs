/**
 * ROUND 5 · HUMAN-PIPELINE PROOF — film the heroine with the stock harness.
 *
 *   node tools/r5-poc/film-human.mjs [--port 5240] [--outfit ranger] [--only idle-side,sprint-back]
 *                                    [--tag t] [--baseline]   (baseline = default boot, same cameras)
 *
 * Runs `tools/screenshot.mjs` once per view (fresh page each), staged on the
 * player-anim suite's flat RUNWAY (-60, -45, heading due -X), HUD hidden,
 * machines frozen, grass hidden, camera LOCKED in her own frame (the LOCKCAM
 * trick from gates.round4.player-anim.mjs) so side / front / back stay side /
 * front / back while she sprints. Writes shots/r5-poc-human-<pose>-<view>.png
 * and prints each shot's measurement JSON (gait state, overlay weights,
 * spring-chain deflection, draws, tris).
 */
import { spawnSync } from 'child_process';

const args = process.argv.slice(2);
const flag = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const PORT = flag('--port', '5240');
const OUTFIT = flag('--outfit', 'ranger');
const EXTRA = flag('--params', '');
const ONLY = flag('--only', '');
const TAG = flag('--tag', '');
/** `--baseline`: film the DEFAULT boot (no poc flag) with the same cameras, for comparison */
const BASELINE = args.includes('--baseline');

/** right / up / back in HER frame (m), look-at height, look-at forward. */
const VIEWS = {
  side: [-3.3, 1.05, 0.0, 0.92],
  front: [0.35, 1.05, -3.4, 0.92],
  back: [-0.35, 1.05, 3.4, 0.92],
};
const POSES = {
  idle: { keys: [], settle: 2600 },
  sprint: { keys: ['KeyW', 'ShiftLeft'], settle: 2100 },
};

const evalFor = (pose, view) => `(async () => {
  const C = __CTX__, p = C.player, an = p.animator;
  C.input.enabled = true; C.state = 'playing';
  for (const el of Array.from(document.body.children)) {
    if (el.id === 'app' || el.tagName === 'SCRIPT' || el.tagName === 'CANVAS') continue;
    el.style.display = 'none';
  }
  for (const m of C.machines.list) m.update = () => {};
  if (C.vegetation?.group) C.vegetation.group.visible = false;
  p.model.traverse((o) => { o.frustumCulled = false; });
  p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI * 0.5;
  const [right, up, back, aimH] = ${JSON.stringify(VIEWS[view])};
  p._updateCamera = function () {
    const s = Math.sin(this.heading), c = Math.cos(this.heading), cam = this.ctx.camera;
    cam.position.set(this.position.x + c * right - s * back, this.position.y + up, this.position.z - s * right - c * back);
    cam.lookAt(this.position.x, this.position.y + aimH, this.position.z);
  };
  C.input.keys.clear();
  for (const k of ${JSON.stringify(POSES[pose].keys)}) C.input.keys.add(k);
  await new Promise((r) => setTimeout(r, ${POSES[pose].settle}));
  const info = window.__POC__ ? await window.__POC__.info() : null;
  const ch = an._chains.map((c) => ({ root: c.links[0].name, tipOff: +Math.hypot(c.ax, c.az).toFixed(3) }));
  const P = (n) => { const v = an.getBoneWorld(n, new p.position.constructor()); return v ? [+(v.x - p.position.x).toFixed(3), +(v.y - p.position.y).toFixed(3), +(v.z - p.position.z).toFixed(3)] : null; };
  return {
    pose: '${pose}', view: '${view}', rig: an.rigName,
    speed: +Math.hypot(p.velocity.x, p.velocity.z).toFixed(2),
    w: { move: +an._moveW.toFixed(2), run: +an._runW.toFixed(2), aim: +an._aimW.toFixed(2), flat: +an._flatW.toFixed(2),
         lean: +an._leanAcc.toFixed(3), bank: +an._bank.toFixed(3), look: +an._lookW.toFixed(2) },
    loco: an.loco ? { phase: +(an.loco.phase ?? 0).toFixed(3) } : null,
    chains: ch,
    handL: P(an.KEY.handL), handR: P(an.KEY.handR), head: P(an.KEY.head),
    draws: info?.draws, tris: info?.tris, calls: C.renderer.info.render.calls,
  };
})()`;

/**
 * `--lineup`: the 8-NPC variety proof — eight people built from the two CC0
 * bodies + four outfits + hair/tint variants, all playing the baked idle,
 * filmed from a fixed camera (heroine moved out of frame).
 */
const LINEUP_EVAL = `(async () => {
  const C = __CTX__, p = C.player;
  C.input.enabled = true; C.state = 'playing';
  for (const el of Array.from(document.body.children)) {
    if (el.id === 'app' || el.tagName === 'SCRIPT' || el.tagName === 'CANVAS') continue;
    el.style.display = 'none';
  }
  for (const m of C.machines.list) m.update = () => {};
  if (C.vegetation?.group) C.vegetation.group.visible = false;
  const X = -60, Z = -45;
  const info = await window.__POC__.lineup({ x: X, z: Z });
  p.position.set(X - 14, 0, Z - 6); p.velocity.set(0, 0, 0); p._snapToGround();
  const gy = C.terrain.getHeight(X, Z + 4);
  p._updateCamera = function () {
    const cam = this.ctx.camera;
    cam.position.set(X, gy + 1.25, Z - 1.6);
    cam.lookAt(X, gy + 0.95, Z + 4);
  };
  await new Promise((r) => setTimeout(r, 2200));
  const P = C.engine._perf, n = Math.min(P.n, 30);
  let calls = 0, tris = 0;
  for (let k = 1; k <= n; k++) { const j = (P.i - k + P.ms.length) % P.ms.length; calls += P.calls[j]; tris += P.tris[j]; }
  return { ...info, frameCallsAvg: Math.round(calls / n), frameTrisAvg: Math.round(tris / n) };
})()`;

/**
 * `--variants`: ONE live player, four looks, swapped at runtime through
 * __POC__.wear()/hood() (one skeleton, meshes in and out), captured as four
 * strips side by side; then 6 more swap cycles to show the dispose path holds
 * renderer memory flat.
 */
const VARIANTS_EVAL = `(async () => {
  const C = __CTX__, p = C.player, e = C.engine, api = window.__POC__;
  C.input.enabled = true; C.state = 'playing';
  for (const el of Array.from(document.body.children)) {
    if (el.id === 'app' || el.tagName === 'SCRIPT' || el.tagName === 'CANVAS') continue;
    el.style.display = 'none';
  }
  for (const m of C.machines.list) m.update = () => {};
  if (C.vegetation?.group) C.vegetation.group.visible = false;
  p.model.traverse((o) => { o.frustumCulled = false; });
  p.position.set(-60, 0, -45); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI * 0.5;
  p._updateCamera = function () {
    const s = Math.sin(this.heading), c = Math.cos(this.heading), cam = this.ctx.camera;
    const right = -1.2, back = -3.0;
    cam.position.set(this.position.x + c * right - s * back, this.position.y + 1.1, this.position.z - s * right - c * back);
    cam.lookAt(this.position.x, this.position.y + 0.95, this.position.z);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(1500);
  const dom = C.renderer.domElement, W = dom.width, H = dom.height, sw = Math.floor(W / 4);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  let want = -1;
  const grab = () => { if (want < 0) return; g.drawImage(dom, (W - sw) / 2, 0, sw, H, want * sw, 0, sw, H); g.strokeStyle = '#000'; g.lineWidth = 4; g.strokeRect(want * sw + 2, 2, sw - 4, H - 4); want = -1; };
  e.onAfterRender.push(grab);
  const shoot = async (k) => { await wait(700); want = k; const t0 = performance.now(); while (want >= 0 && performance.now() - t0 < 2000) await new Promise((r) => requestAnimationFrame(r)); };
  const mem = () => ({ geo: C.renderer.info.memory.geometries, tex: C.renderer.info.memory.textures });
  const log = [];
  log.push({ step: 'ranger', ...mem() }); await shoot(0);
  api.hood(true); await shoot(1); api.hood(false);
  log.push({ step: 'peasant', swap: await api.wear('peasant'), ...mem() }); await shoot(2);
  log.push({ step: 'none', swap: await api.wear('none'), ...mem() }); await shoot(3);
  e.onAfterRender.splice(e.onAfterRender.indexOf(grab), 1);
  // memory: settle on ranger, then 6 more full cycles; counts must return
  await api.wear('ranger'); await wait(500);
  const m0 = mem();
  for (let i = 0; i < 6; i++) { await api.wear(i % 2 ? 'ranger' : 'peasant'); await wait(250); }
  await wait(500);
  const m1 = mem();
  const el = document.createElement('img');
  el.src = cv.toDataURL('image/png');
  el.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;object-fit:fill';
  document.body.appendChild(el);
  return { log, cycle: { before: m0, after6swaps: m1 }, swaps: api.state.swaps };
})()`;

if (args.includes('--variants')) {
  const name = `r5-poc-human-${TAG ? TAG + '-' : ''}variants`;
  const r = spawnSync('node', ['tools/screenshot.mjs', name, '--port', PORT, '--params', 'poc=human' + (EXTRA ? '&' + EXTRA : ''),
    '--wait', '600', '--eval', VARIANTS_EVAL], { encoding: 'utf8', timeout: 240000 });
  const out = (r.stdout || '') + (r.stderr || '');
  console.log(`== ${name}  exit ${r.status}`);
  const m = out.match(/EVAL: ([\s\S]*?)\nsaved/);
  console.log(m ? JSON.stringify(JSON.parse(m[1])) : out.slice(-2500));
  if (/CONSOLE ERRORS/.test(out)) console.log(out.slice(out.indexOf('CONSOLE ERRORS')));
  process.exit(r.status ?? 1);
}

let fails = 0;
if (args.includes('--lineup')) {
  const name = `r5-poc-human-${TAG ? TAG + '-' : ''}lineup`;
  const r = spawnSync('node', ['tools/screenshot.mjs', name, '--port', PORT, '--params', 'poc=human' + (EXTRA ? '&' + EXTRA : ''),
    '--wait', '400', '--eval', LINEUP_EVAL], { encoding: 'utf8', timeout: 180000 });
  const out = (r.stdout || '') + (r.stderr || '');
  console.log(`== ${name}  exit ${r.status}`);
  const m = out.match(/EVAL: ([\s\S]*?)\nsaved/);
  console.log(m ? JSON.stringify(JSON.parse(m[1])) : out.slice(-2500));
  process.exit(r.status ?? 1);
}
for (const pose of Object.keys(POSES)) {
  for (const view of Object.keys(VIEWS)) {
    const id = `${pose}-${view}`;
    if (ONLY && !ONLY.split(',').includes(id)) continue;
    const name = `r5-poc-human-${TAG ? TAG + '-' : ''}${id}`;
    const params = BASELINE ? (EXTRA || 'q=high') : `poc=human&pocOutfit=${OUTFIT}${EXTRA ? '&' + EXTRA : ''}`;
    const r = spawnSync('node', ['tools/screenshot.mjs', name, '--port', PORT, '--params', params,
      '--wait', pose === 'sprint' ? '250' : '600', '--eval', evalFor(pose, view)], { encoding: 'utf8', timeout: 180000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const m = out.match(/EVAL: ([\s\S]*?)\nsaved/);
    console.log(`== ${name}  exit ${r.status}`);
    console.log(m ? JSON.stringify(JSON.parse(m[1])) : out.slice(-1500));
    if (/CONSOLE ERRORS/.test(out)) { fails++; console.log(out.slice(out.indexOf('CONSOLE ERRORS'))); }
  }
}
process.exitCode = fails ? 2 : 0;
