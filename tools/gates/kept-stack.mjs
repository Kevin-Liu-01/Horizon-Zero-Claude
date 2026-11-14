/**
 * THE KEPT-STACK ROWS (M0.12; docs/GATES.md §3).
 *
 * The 77 rows that guard the kept rig, the movement stack, the bow pose, the camera, save and the
 * crash family, plus the climb, slide and mantle rows added by id at M0.12. Run them with
 *
 *   node tools/gates.mjs --port <p> --kept-stack [--only <ids>]
 *
 * WHERE THEY STAND. Every row is staged on the island (named places through tools/gate-places.mjs,
 * Instruments by role through tools/gate-roster.mjs) or on the gate turntable
 * (tools/gates/turntable.mjs). None needs the photo studio:
 *
 *   - Four carried rows drove the studio (A22b, A78, A79, A79e). Their turntable versions are
 *     defined below under the SAME ids and replace the carried rows only in a `--kept-stack` run;
 *     the full carried suite still runs the studio versions until R4b (M0.7 and M1.3a run it).
 *   - In a `--kept-stack` run the runner takes the studio system out of the frame and traps
 *     `ctx.studio` before each row (NO_STUDIO); a row that touches it fails (STUDIO_TOUCHED).
 *
 * Every other row runs as registered (carried, or the lane row that shadows it by id).
 */
import { staged } from '../gate-roster.mjs';
import { placed } from '../gate-places.mjs';
import { TURNTABLE } from './turntable.mjs';

/** List A: from the 55 rows the Oct 15 survey classed CARRY (51 kept). */
export const KEPT_A = [
  'A1-boot-clean', 'A2-dodge-displacement', 'A4-draw-strength', 'A5-arrow-fired-event', 'A6-machine-foot-plant',
  'A9-perf-budget', 'A18-slope-conform', 'A18b-slope-conform-moving', 'A20-frame-loop-survives',
  'A20b-no-system-errors', 'A22-msaa', 'A22b-fov-recompile', 'A25b-nav-and-occlusion', 'A28-jump-arc',
  'A28b-canon-speeds', 'A29b-slope-no-ghost', 'A30-dodge-window', 'A32b-lookup-no-ghost', 'A43-corpse-lifecycle',
  'A44-socket-integrity', 'A44b-socket-vertex-integrity', 'A45-no-skate-per-species', 'A45b-stance-report-integrity',
  'A45c-foot-continuity', 'A46-ground-truth', 'A47-corpse-grounded', 'A47b-corpse-posed', 'A48-cadence',
  'A50-hulls-visible', 'A50b-aim-on-drawn-geometry', 'A53-conc-not-on-sprint', 'A56-cascades',
  'A58b-surface-audio-world-ground', 'A59b-cover-honesty-world-ground', 'A59c-mask-coherence-world-ground',
  'A60-stealth-lanes', 'A68-no-softlock', 'A70-hub-tabs', 'A70c-title-flow', 'A71d-conc-veil', 'A71g-tracker-live',
  'A72-settings-persist', 'A72b-accessibility', 'A73d-ui-bus', 'A74-3d', 'A78-cast-states', 'A79-time-authority',
  'A79e-pose-overlay-frozen', 'A79-runner-verdict-line', 'A80-chrome-profile-hygiene', 'A81-canon-speed-bands',
];

/** List B: re-staged rows that guard the kept rig, bow pose, camera, save and crash family (26). */
export const KEPT_B = [
  'A3-sprint-speed', 'A11-idle-alive', 'A15-foot-flat', 'A16-draw-anchor', 'A17-draw-beats', 'A107-draw-arm-path',
  'A28-run-cadence', 'A31-aim-strafe-skate', 'A31-crouch-aim', 'A31b-aim-strafe-skate-player-anim', 'A32-draw-ramp',
  'A25c-camera-vs-machine', 'A61-colliders-registered', 'A65-save-restore', 'A76-footfalls', 'A78-loop-reclaim',
  'A90-memory-stability', 'A90-rig-reclaim', 'A90b-memory-attribution', 'V1-sprint-frame', 'V2-idle-frame',
  'V3-crouch-stalk', 'V4-aim-anchor', 'V13-aim-strafe', 'V21-camera-cover', 'V49-draw-from-jog',
];

/** Added to list B at M0.12 by id: climb, slide and mantle (hero-body's rows). */
export const KEPT_TRAVERSAL = ['A-climb-1m', 'A-slide', 'V-traversal'];

/** The 77 named rows. */
export const KEPT_77 = [...KEPT_A, ...KEPT_B];
/** Everything a `--kept-stack` run selects, in run order. */
export const KEPT_STACK = [...KEPT_77, ...KEPT_TRAVERSAL];

/**
 * Run before every row of a `--kept-stack` run, after boot: the studio leaves the frame and
 * `ctx.studio` becomes a trap that counts every read.
 */
export const NO_STUDIO = `(() => {
  const ctx = window.__CTX__, G = window.__GAME__;
  if (!ctx || !G) return { removed: false, why: 'no game' };
  const s = Object.getOwnPropertyDescriptor(ctx, 'studio')?.value;
  let removed = false;
  if (s) {
    try { if (s.active) s.exit(); } catch (err) { /* leaving anyway */ }
    const i = G.systems.indexOf(s);
    if (i >= 0) { G.systems.splice(i, 1); removed = true; }
  }
  window.__STUDIO_TOUCHED__ = 0;
  Object.defineProperty(ctx, 'studio', { configurable: true, enumerable: false,
    get() { window.__STUDIO_TOUCHED__ = (window.__STUDIO_TOUCHED__ || 0) + 1; return undefined; } });
  return { removed, had: !!s };
})()`;

/** Read after the row: how many times it reached for the studio. */
export const STUDIO_TOUCHED = `(window.__STUDIO_TOUCHED__ || 0)`;

const SLEEP = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const simNow = () => (__CTX__.engine ? __CTX__.engine.simTime : performance.now() / 1000);
  async function simSleep(s, each, capX = 6) {
    const t0 = simNow(), w0 = performance.now();
    while (simNow() - t0 < s && performance.now() - w0 < s * 1000 * capX + 6000) {
      await sleep(50);
      if (each) each(simNow() - t0);
    }
    return simNow() - t0;
  }
  const waitFrames = async (n) => {
    const e = __CTX__.engine, f0 = e.frames;
    while (e.frames - f0 < n) await new Promise((r) => requestAnimationFrame(r));
  };
`;

/** Freeze every machine except the ones in `keep` so nothing wanders into the shot. */
const FREEZE = `function freezeAll(keep) {
  const set = new Set(keep || []);
  for (const m of /* r5-all-machines: freeze */ __CTX__.machines.list) {
    if (set.has(m)) continue;
    if (!m._frozenByGate) { m._frozenByGate = m.update; m.update = () => {}; }
  }
}`;

/** Park a machine: calm, no route travel, heading held. */
const PARK = `function park(m, heading) {
  m.route = [m.position.clone()];
  m._wpIndex = 0;
  m._waitT = 1e6;
  if (heading !== undefined) m.heading = heading;
  m.suspicion = 0;
  m._unseenT = 99;
  m.ai.search.stop();
  m.ai.engage.reset();
  m.setState('patrol');
}`;

/* ------------------------------------------------------------------------------------------ */
/* A22b on the turntable: FOV changes and a forced grade recompile never black-screen          */
/* ------------------------------------------------------------------------------------------ */
const A22B_TT = `(async () => {${TURNTABLE}${SLEEP}
  const ctx = __CTX__, e = ctx.engine;
  if (!e || !e.grade) return { pass: null, detail: 'SKIP: engine.grade missing — nothing to regress' };
  const errs = [];
  const realErr = console.error;
  console.error = function (...a) { errs.push(a.map(String).join(' ').slice(0, 200)); return realErr.apply(console, a); };
  const onErr = (ev) => errs.push('window.onerror: ' + String(ev.message || ev));
  window.addEventListener('error', onErr);
  const hooks0 = e.hookErrorCount || 0;
  const sys0 = (__GAME__.systemErrors || []).length;

  const sampleFrame = () => new Promise((resolve) => {
    const src = e.renderer.domElement;
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const hook = () => {
      const i = e.onAfterRender.indexOf(hook);
      if (i >= 0) e.onAfterRender.splice(i, 1);
      let out;
      try {
        g.clearRect(0, 0, 64, 64);
        g.drawImage(src, 0, 0, 64, 64);
        const d = g.getImageData(0, 0, 64, 64).data;
        const sig = new Float64Array(4096);
        let sum = 0, sum2 = 0;
        for (let k = 0; k < 4096; k++) {
          const p = k * 4;
          const l = 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2];
          sig[k] = l; sum += l; sum2 += l * l;
        }
        const mean = sum / 4096;
        out = { mean: +mean.toFixed(2), stddev: +Math.sqrt(Math.max(0, sum2 / 4096 - mean * mean)).toFixed(2), sig };
      } catch (err) { out = { mean: null, stddev: null, sig: null, error: String((err && err.message) || err) }; }
      resolve(out);
    };
    e.onAfterRender.push(hook);
  });

  const phases = [];
  try {
    ctx.state = 'playing';
    const p = ctx.player;
    standAt(p, 'spawnVista'); p.camPitch = 0.02;
    await waitFrames(6);
    TT.enter();
    TT.lensHere(55);
    await waitFrames(4);
    const phase = async (label, fov, prepare) => {
      const before = errs.length;
      if (prepare) prepare();
      TT.setFov(fov);
      await waitFrames(6);
      const shot = await sampleFrame();
      phases.push({ label, fov, cameraFov: +ctx.camera.fov.toFixed(2), mean: shot.mean, stddev: shot.stddev,
        readbackError: shot.error || null, consoleErrors: errs.slice(before), sig: shot.sig });
    };
    await phase('fov-25', 25);
    await phase('fov-80', 80);
    await phase('fov-55-forced-recompile', 55, () => {
      e.grade._tm = null; e.grade._cs = null;
      e.grade.material.needsUpdate = true;
    });
  } finally {
    TT.exit();
    console.error = realErr;
    window.removeEventListener('error', onErr);
  }
  const diffOf = (a, b) => {
    if (!a || !b) return null;
    let s = 0;
    for (let k = 0; k < 4096; k++) s += Math.abs(a[k] - b[k]);
    return +(s / 4096).toFixed(2);
  };
  const fovDiff = diffOf(phases[0] && phases[0].sig, phases[1] && phases[1].sig);
  for (const ph of phases) delete ph.sig;
  const hookErrors = (e.hookErrorCount || 0) - hooks0;
  const sysErrors = (__GAME__.systemErrors || []).length - sys0;
  const flat = phases.filter((ph) => !(ph.stddev > 8));
  const noisy = phases.filter((ph) => ph.consoleErrors.length);
  const fovApplied = phases.every((ph) => Math.abs(ph.cameraFov - ph.fov) < 0.001);
  const pass = phases.length === 3 && flat.length === 0 && noisy.length === 0
    && errs.length === 0 && hookErrors === 0 && sysErrors === 0
    && fovApplied && fovDiff != null && fovDiff > 2;
  return { pass, detail: {
    stage: 'turntable lens at the spawn vista',
    verdict: pass ? 'PASS: every FOV composited a real frame with no errors'
      : 'FAIL: ' + [flat.length && 'flat frame at ' + flat.map((f) => f.label).join(','),
                    noisy.length && 'console errors at ' + noisy.map((f) => f.label).join(','),
                    !fovApplied && 'camera.fov did not follow the turntable lens',
                    (fovDiff != null && fovDiff <= 2) && 'fov 25 and 80 rendered the same image (diff ' + fovDiff + ')',
                    hookErrors && 'engine hook errors ' + hookErrors,
                    sysErrors && 'quarantined system errors ' + sysErrors].filter(Boolean).join(' + '),
    phases, fovMeanAbsDiff: fovDiff, stddevFloor: 8, consoleErrors: errs.slice(0, 8), hookErrors, sysErrors,
    grade: { pass: e.grade.constructor.name, enabled: e.grade.enabled, defines: Object.keys(e.grade.material.defines || {}) },
  } };
})()`;

/* ------------------------------------------------------------------------------------------ */
/* A78 on the turntable: a held `attack` on a calm machine 80 m out sticks for a sim second    */
/* ------------------------------------------------------------------------------------------ */
const A78_TT = `(async () => {${TURNTABLE}${SLEEP} ${FREEZE} ${PARK}
  const ctx = __CTX__;
  const m = await stageAny({ dx: 30, dz: 30, filter: (x) => typeof x.forceState === 'function' });
  if (!m) return noKindsSkip() || { pass: null, detail: 'SKIP: no living machine of a staged kind with forceState' };
  freezeAll([m]);
  const p = ctx.player;
  m.position.set(p.position.x + 80, ctx.terrain.getHeight(p.position.x + 80, p.position.z), p.position.z);
  m.spawnPos.set(m.position.x, m.spawnPos.y, m.position.z);
  park(m, Math.PI);
  await sleep(250);
  const calm = m.state;
  if (calm === 'attack') return { pass: false, detail: 'staging failed: machine was already attacking' };
  let detail = '';
  try {
    TT.enter();
    const r = TT.hold(m, 'attack');
    const t0 = m.state;
    const seen = new Set();
    let bad = 0, n = 0;
    const elapsed = await simSleep(1.0, () => { seen.add(m.state); n++; if (m.state !== 'attack') bad++; });
    const hold = TT.debug().hold;
    detail = 'kind=' + m.kind + ' calm=' + calm + ' -> hold -> ' + t0
      + ' | ' + elapsed.toFixed(2) + 's sim, ' + n + ' samples, states={' + [...seen].join(',') + '}'
      + ' | hold=' + (hold ? hold.state + ' ' + hold.held.toFixed(2) + 's reforced=' + hold.reforced : 'NONE')
      + ' | ok=' + r.ok + ' | stage=turntable';
    if (elapsed < 0.9) return { pass: false, detail: 'sim never advanced a second (' + elapsed.toFixed(2) + 's) — ' + detail };
    if (t0 !== 'attack') return { pass: false, detail: 'forceState(attack) did not take effect at all — ' + detail };
    if (bad) return { pass: false, detail: 'drifted out of attack on ' + bad + '/' + n + ' samples — ' + detail };
    if (!hold || hold.state !== 'attack') return { pass: false, detail: 'no hold registered — ' + detail };
    TT.release();
    const released = !TT.debug().hold;
    if (!released) return { pass: false, detail: 'release left the hold standing — ' + detail };
  } finally { TT.exit(); }
  return { pass: true, detail };
})()`;

/* ------------------------------------------------------------------------------------------ */
/* A79 on the turntable: a freeze while combat is live holds against every rival               */
/* ------------------------------------------------------------------------------------------ */
const A79_TT = `(async () => {${TURNTABLE}${SLEEP} ${FREEZE}
  const ctx = __CTX__, e = ctx.engine;
  if (typeof e.requestTimeScale !== 'function') return { pass: false, detail: 'engine has no requestTimeScale authority' };
  const m = await stageAny({ dx: 30, dz: 30, filter: (x) => typeof x.forceState === 'function' });
  if (m) {
    freezeAll([m]);
    const p = ctx.player;
    m.position.set(p.position.x + 11, ctx.terrain.getHeight(p.position.x + 11, p.position.z), p.position.z);
    m.spawnPos.set(m.position.x, m.spawnPos.y, m.position.z);
    m.forceState('attack');
  }
  ctx.combat?._startHitstop?.(0.9);
  await sleep(120);
  const before = e.timeScaleSources();
  const rivalsBefore = Object.keys(before).filter((k) => k !== TT.source);
  TT.enter();
  TT.freeze();
  let detail = '';
  const t0 = performance.now();
  const sim0 = e.simTime;
  const samples = [];
  let worst = 0, polls = 0;
  const sourcesSeen = new Set();
  try {
    while (performance.now() - t0 < 2000) {
      e.requestTimeScale('hitstop', 0.03);
      e.requestTimeScale('concentration', 0.35);
      e.timeScale = 0.5;
      await sleep(40);
      const ts = e.timeScale;
      polls++;
      if (ts !== 0) { worst = Math.max(worst, Math.abs(ts)); samples.push(ts); }
      for (const k of Object.keys(e.timeScaleSources())) sourcesSeen.add(k);
    }
  } finally {
    e.requestTimeScale('hitstop', null);
    e.requestTimeScale('concentration', null);
    e.requestTimeScale('legacy', null);
  }
  const simDrift = e.simTime - sim0;
  const wall = (performance.now() - t0) / 1000;
  TT.exit();
  await sleep(200);
  const after = e.timeScale;
  const afterSources = e.timeScaleSources();
  detail = 'stage=turntable source=' + TT.source + ' machine=' + (m ? m.kind + ':' + m.state : 'none')
    + ' rivalsAtEntry=[' + rivalsBefore.join(',') + '] contested=[' + [...sourcesSeen].join(',') + ']'
    + ' | ' + polls + ' polls over ' + wall.toFixed(2) + 's wall, non-zero=' + samples.length
    + ' worst=' + worst + ' simDrift=' + simDrift.toFixed(4) + 's'
    + ' | afterExit ts=' + after + ' sources=' + JSON.stringify(afterSources);
  if (polls < 20) return { pass: false, detail: 'only ' + polls + ' polls — the page stalled, not a real 2 s — ' + detail };
  if (sourcesSeen.size < 3) return { pass: false, detail: 'the freeze was never actually contested — ' + detail };
  if (samples.length) return { pass: false, detail: 'timeScale left 0 on ' + samples.length + ' polls — ' + detail };
  if (Math.abs(simDrift) > 1e-6) return { pass: false, detail: 'world kept simulating while frozen (' + simDrift.toFixed(4) + 's) — ' + detail };
  if (after !== 1) return { pass: false, detail: 'exit did not hand time back (ts=' + after + ') — ' + detail };
  if (TT.source in afterSources) return { pass: false, detail: 'the turntable never released its claim — ' + detail };
  if (!m) return { pass: null, detail: (noKindsSkip() || { detail: 'SKIP-R18: no staged kind' }).detail + ' (the freeze half passed) — ' + detail };
  return { pass: true, detail };
})()`;

/* ------------------------------------------------------------------------------------------ */
/* A79e on the turntable: Brea's face, head and neck do not walk with the world frozen         */
/* ------------------------------------------------------------------------------------------ */
const A79E_TT = `(async () => {${TURNTABLE}${SLEEP}
  const ctx = __CTX__, e = ctx.engine;
  const a = ctx.player.animator;
  if (!a || !a.b) return { pass: null, detail: 'SKIP: no animator bone table' };
  // The carried row graded eyes, lids, head and neck1. The M0 hero rig has no eye or lid bones yet (the face is
  // M0.11), so the bar is every bone the animator names (its own bone table, face bones wherever the rig has them):
  // the same claim on more bones, never fewer than the carried four-bone floor.
  const FACE = ['eyeL', 'eyeR', 'lidUL', 'lidUR', 'lidLL', 'lidLR', 'head', 'neck1'];
  const bones = [];
  const seenB = new Set();
  for (const n of [...FACE, ...Object.keys(a.b)]) {
    const x = a.b[n];
    const bone = x && (x.bone || x);
    if (bone && bone.quaternion && !seenB.has(bone)) { seenB.add(bone); bones.push([n, bone]); }
  }
  const faceAbsent = FACE.filter((n) => !(a.b[n] && (a.b[n].bone || a.b[n]).quaternion));
  if (bones.length < 4) return { pass: null, detail: 'SKIP: only ' + bones.length + ' named bones exist on this rig' };
  // every bone of her skeleton, reported beside the bar
  const all = [];
  ctx.player.model?.traverse?.((o) => { if (o.isBone) all.push(o); });
  const p = ctx.player;
  let out;
  try {
    TT.enter();
    // a turntable lens 2.2 m in front of her at eye height, a quarter turn off her shoulder line, so
    // the animator's own look-at (which reads the camera) has a live target while the world freezes
    const head = new (ctx.camera.position.constructor)();
    a.b.head.bone.getWorldPosition(head);
    const off = p.heading + 0.46;
    const V = ctx.camera.position.constructor;
    TT.lens({ pos: new V(head.x + Math.sin(off) * 2.2, head.y + 0.05, head.z + Math.cos(off) * 2.2), look: head, fov: 36 });
    await sleep(900);                 // gaze and lids damp to the lens
    TT.freeze();
    await sleep(500);
    if (e.timeScale !== 0) return { pass: false, detail: 'could not freeze the world (ts=' + e.timeScale + ')' };
    const snap = (list) => list.map((b) => b.quaternion.clone());
    const q0 = snap(bones.map(([, b]) => b));
    const a0 = snap(all);
    const s0 = e.simTime;
    let frames = 0, raf = 0;
    const tick = () => { frames++; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    await sleep(2000);
    cancelAnimationFrame(raf);
    const q1 = snap(bones.map(([, b]) => b));
    const a1 = snap(all);
    const simDrift = e.simTime - s0;
    const angle = (x, y) => 2 * Math.acos(Math.min(1, Math.abs(x.dot(y))));
    let worst = 0, worstName = '';
    for (let i = 0; i < bones.length; i++) { const d = angle(q0[i], q1[i]); if (d > worst) { worst = d; worstName = bones[i][0]; } }
    let allWorst = 0, allName = '';
    for (let i = 0; i < all.length; i++) { const d = angle(a0[i], a1[i]); if (d > allWorst) { allWorst = d; allName = all[i].name; } }
    out = { frames, simDrift, worst, worstName, allWorst, allName };
  } finally { TT.exit(); }
  await sleep(200);
  const tsAfter = e.timeScale;
  const detail = 'stage=turntable lens 2.2 m three-quarter front | frozen 2.0 s over ' + out.frames + ' rendered frames'
    + ' (simDrift=' + out.simDrift.toFixed(4) + 's) | worst named-bone drift=' + out.worst.toFixed(4) + ' rad on ' + out.worstName
    + ' across ' + bones.length + ' named bones [' + bones.map(([n]) => n).join(',') + ']'
    + (faceAbsent.length ? ' | face bones not on this rig: ' + faceAbsent.join(',') : '')
    + ' | whole skeleton (' + all.length + ' bones, reported) worst=' + out.allWorst.toFixed(4) + ' rad on ' + out.allName
    + ' | ts after exit=' + tsAfter;
  if (out.frames < 8) return { pass: false, detail: 'only ' + out.frames + ' frames rendered while frozen — the measurement is broken, not the build — ' + detail };
  if (Math.abs(out.simDrift) > 1e-6) return { pass: false, detail: 'the world simulated while frozen — ' + detail };
  if (out.worst > 0.01) return { pass: false, detail: 'a real-dt writer walked ' + out.worstName + ' by ' + out.worst.toFixed(3) + ' rad with the world frozen — ' + detail };
  if (tsAfter !== 1) return { pass: false, detail: 'exit did not hand time back — ' + detail };
  return { pass: true, detail };
})()`;

/* ------------------------------------------------------------------------------------------ */
/* A22-msaa on the island: the shipped tier's AA chain, measured on Brea against the sky       */
/* ------------------------------------------------------------------------------------------ */
/** R25's bar (engine-gpu's AA_BAR): SMAA ramps >= 20 % of silhouette pixels and >= 1.5x the frame with SMAA off. */
export const AA_BAR = Object.freeze({ minFraction: 0.2, minGainOverOff: 1.5 });
const A22_ISLAND = `(async () => {${TURNTABLE}${SLEEP}
  const ctx = __CTX__, E = ctx.engine, R = E.renderer, BAR = ${JSON.stringify(AA_BAR)};
  const EM = await import('/src/core/engine.js');
  const SHIP = EM.QUALITY_TIERS[EM.DEFAULT_TIER];
  const aaP = E.composer.passes.find((x) => /SMAA|TAA/.test(x.constructor.name)) || null;
  const mech = { quality: E.quality, defaultTier: EM.DEFAULT_TIER, samples: E.sceneTarget.samples, tierMsaa: SHIP.msaa,
    sceneTargetIsRenderTarget1: E.composer.renderTarget1 === E.sceneTarget, aaPass: aaP ? aaP.constructor.name : null,
    smaaEnabled: !!(E.smaa && E.smaa.enabled), smaaInChain: !!E.smaa && E.composer.passes.includes(E.smaa),
    pixelRatio: +R.getPixelRatio().toFixed(3) };
  const msaaPath = SHIP.msaa >= 4;
  const mechOk = mech.sceneTargetIsRenderTarget1 && mech.smaaEnabled && mech.smaaInChain && mech.quality === EM.DEFAULT_TIER
    && (msaaPath ? mech.samples >= 4 : mech.samples === 0);
  // a crop of the live canvas at native resolution, read inside the render task
  const crop = (x0, y0, w, h) => new Promise((resolve) => {
    const src = R.domElement, cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const hook = () => {
      const i = E.onAfterRender.indexOf(hook);
      if (i >= 0) E.onAfterRender.splice(i, 1);
      try { g.drawImage(src, x0, y0, w, h, 0, 0, w, h); resolve(g.getImageData(0, 0, w, h).data); }
      catch (err) { resolve(null); }
    };
    E.onAfterRender.push(hook);
  });
  const aaMetric = (px, w, h) => {
    const Lm = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) Lm[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
    let edges = 0, inter = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let mn = 1, mx = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = Lm[(y + dy) * w + x + dx]; if (v < mn) mn = v; if (v > mx) mx = v; }
      const c = mx - mn;
      if (c <= 0.25) continue;
      edges++;
      const t = (Lm[y * w + x] - mn) / c;
      if (t >= 0.2 && t <= 0.8) inter++;
    }
    return { edges, intermediate: inter, fraction: edges ? +(inter / edges).toFixed(4) : null };
  };
  let on = null, off = null, region = null, fixture = null;
  try {
    const p = ctx.player;
    standAt(p, 'spawnVista');
    await waitFrames(6);
    TT.enter();
    // The turntable's AA card: five dark stakes, 0.25 x 3 m, at five angles, 6 m ahead of the lens and pitched up
    // into the sky, so every edge in the crop is a hard geometric silhouette against the sky (V20's basalt columns
    // were the same subject on the deleted Pans host). The stakes are the gate's; the AA chain is the engine's.
    const V = ctx.camera.position.constructor;
    const eye = new V(); p.animator.b.head.bone.getWorldPosition(eye);
    const fwd = new V(Math.sin(p.heading), 0, Math.cos(p.heading));
    const pos = eye.clone().addScaledVector(fwd, 0.6);
    const pitch = 25 * Math.PI / 180;
    const dir = new V(fwd.x * Math.cos(pitch), Math.sin(pitch), fwd.z * Math.cos(pitch)).normalize();
    TT.lens({ pos, look: pos.clone().addScaledVector(dir, 10), fov: 40 });
    let M = null, mat = null;
    ctx.scene.traverse((o) => { if (!M && o.isMesh && o.geometry && o.geometry.isBufferGeometry && o.geometry.attributes.position) M = o; });
    ctx.scene.traverse((o) => { const m = o.material; if (!mat && m && !Array.isArray(m) && m.type === 'MeshBasicMaterial') mat = m; });
    if (!mat) ctx.scene.traverse((o) => { const m = o.material; if (!mat && m && !Array.isArray(m) && /^Mesh(Standard|Lambert|Phong)Material$/.test(m.type) && !Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) mat = m; });
    mat = mat ? mat.clone() : null;
    if (mat && mat.emissive) mat.emissive.setRGB(0, 0, 0);
    if (mat && 'envMapIntensity' in mat) { mat.envMap = null; mat.envMapIntensity = 0; }
    if (mat && 'roughness' in mat) { mat.roughness = 1; mat.metalness = 0; }
    if (!M || !mat) return { pass: null, detail: 'SKIP: no mesh or MeshBasicMaterial in the scene to build the AA card from' };
    mat.color.setRGB(0.02, 0.02, 0.02); mat.map = null; mat.transparent = false; mat.opacity = 1; mat.side = 2; mat.fog = false;
    mat.depthTest = true; mat.depthWrite = true; mat.vertexColors = false; mat.needsUpdate = true;
    const up0 = new V(0, 1, 0), right = new V().crossVectors(dir, up0).normalize(), upV = new V().crossVectors(right, dir).normalize();
    const centre = pos.clone().addScaledVector(dir, 6);
    const verts = [];
    [-40, -15, 10, 30, 55].forEach((deg, i) => {
      const th = deg * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
      const o = centre.clone().addScaledVector(right, (i - 2) * 0.9);
      const pt = (u, v) => o.clone().addScaledVector(right, u * c - v * sn).addScaledVector(upV, u * sn + v * c);
      const q = [pt(-0.125, -1.5), pt(0.125, -1.5), pt(0.125, 1.5), pt(-0.125, 1.5)];
      for (const k of [0, 1, 2, 0, 2, 3]) verts.push(q[k].x, q[k].y, q[k].z);
    });
    const geo = new M.geometry.constructor();
    geo.setAttribute('position', new M.geometry.attributes.position.constructor(new Float32Array(verts), 3));
    const card = new M.constructor(geo, mat);
    card.frustumCulled = false; card.castShadow = false; card.receiveShadow = false; card.name = 'gate-aa-card';
    ctx.scene.add(card);
    fixture = () => { ctx.scene.remove(card); geo.dispose(); mat.dispose(); };
    await waitFrames(8);
    TT.freeze();
    await waitFrames(6);
    const pr = R.getPixelRatio(), W = R.domElement.width, H = R.domElement.height;
    region = { x: Math.round(W * 0.2), y: Math.round(H * 0.12), w: Math.round(W * 0.6), h: Math.round(H * 0.76), pr };
    const a = await crop(region.x, region.y, region.w, region.h);
    E.smaa.enabled = false;
    await waitFrames(4);
    const b = await crop(region.x, region.y, region.w, region.h);
    E.smaa.enabled = true;
    await waitFrames(2);
    on = a && aaMetric(a, region.w, region.h);
    off = b && aaMetric(b, region.w, region.h);
  } finally { if (E.smaa) E.smaa.enabled = true; if (fixture) fixture(); TT.exit(); }
  const gain = on && off && off.fraction ? +(on.fraction / off.fraction).toFixed(3) : null;
  const measured = msaaPath ? null : { smaaOn: on, smaaOff: off, gainOverOff: gain,
    ok: !!on && on.edges >= 200 && on.fraction >= BAR.minFraction && gain != null && gain >= BAR.minGainOverOff };
  const pass = mechOk && (msaaPath || measured.ok);
  return { pass, detail: { stage: 'island: spawn vista, the turntable AA card (five dark stakes at five angles against the sky)',
    path: msaaPath ? 'MSAA x' + mech.samples + ' + SMAA' : 'R25: SMAA-only at the shipped tier',
    mechanical: Object.assign(mech, { ok: mechOk }), measuredAA: measured, bar: BAR, region } };
})()`;

/* ------------------------------------------------------------------------------------------ */
/* A flat LANE, not a flat point: canon-speed rows run 16-20 m and must not climb               */
/* ------------------------------------------------------------------------------------------ */
/**
 * `flatLane(len)`: the nearest spot to the player (outward from where she stands, 6 m grid,
 * eight headings) whose whole `len` m run is on land, never steeper than 2 deg per metre, within
 * 0.5 m of level end to end, and clear of blocking colliders. Returns the run's heading and the
 * camera yaw that makes W run along it (camera forward is (-sin y, 0, -cos y)).
 */
export const FLAT_LANE = `function flatLane(len) {
  const C = __CTX__, T = C.terrain, p = C.player, V = p.position.constructor, n = new V();
  const h = (x, z) => T.getHeight(x, z);
  const step = Math.tan(2 * Math.PI / 180);
  const x0 = Math.round(p.position.x / 6) * 6, z0 = Math.round(p.position.z / 6) * 6;
  const pts = [];
  for (let dx = -420; dx <= 420; dx += 6) for (let dz = -420; dz <= 420; dz += 6) pts.push([dx * dx + dz * dz, x0 + dx, z0 + dz]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  for (const [, x, z] of pts) {
    const hy = h(x, z);
    if (!(hy > 1.5)) continue;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, dx = Math.sin(a), dz = Math.cos(a);
      let ok = true, lo = hy, hi = hy, prev = hy, worst = 0;
      for (let s = 1; s <= len && ok; s++) {
        const y = h(x + dx * s, z + dz * s);
        if (!(y > 1.5)) { ok = false; break; }
        const d = Math.abs(y - prev); worst = Math.max(worst, d); prev = y;
        if (d > step) ok = false;
        lo = Math.min(lo, y); hi = Math.max(hi, y);
        if (hi - lo > 0.5) ok = false;
        if (ok && s % 4 === 0) {
          T.getNormal(x + dx * s, z + dz * s, n);
          if (Math.acos(Math.max(-1, Math.min(1, n.y))) * 180 / Math.PI > 3) ok = false;
          if (ok && C.collision && C.collision.sphereQuery(x + dx * s, y + 1, z + dz * s, 2.5, [], (c) => c.blocking).length) ok = false;
        }
      }
      if (ok && C.collision && C.collision.sphereQuery(x, hy + 1, z, 3.5, [], (c) => c.blocking).length) ok = false;
      if (ok) return { x, z, heading: +a.toFixed(4), camYaw: +Math.atan2(-dx, -dz).toFixed(4), len,
        riseM: +(hi - lo).toFixed(2), worstStepDeg: +(Math.atan(worst) * 180 / Math.PI).toFixed(2) };
    }
  }
  return null;
}`;

/**
 * Rows whose lane shadow can no longer run: instruments-core re-staged A43, A90-rig-reclaim and A90b by text
 * surgery on the Round-4 rows, and that text has since moved (its rows report "re-stage edits not applied").
 * The carried rows are already staged by role (R28, R34), so a kept-stack run takes the carried row.
 */
export const USE_CARRIED = [
  { id: 'A43-corpse-lifecycle', why: 'instruments-core shadow is a PENDING stub (its re-stage text moved); the carried row stages the eight wrecks by role (R28)' },
  { id: 'A90-rig-reclaim', why: 'instruments-core shadow is a PENDING stub; the carried row cycles the staged role kinds (R28)' },
  { id: 'A90b-memory-attribution', why: 'instruments-core shadow is a PENDING stub; the carried row kills and respawns a staged kind (R28, R34)' },
];

/**
 * Rows that stand as registered except for one staging line: each patch is applied to the
 * registered row's assert text (exact strings; a patch that does not apply turns the row into a
 * FAIL naming the patch, so a later edit to the row cannot silently run the old staging).
 */
export const PATCHED = [
  {
    id: 'V21-camera-cover',
    why: 'the shot took a tree collider within 220 m of the old valley origin; on the island it takes the nearest trunk-shaped camera collider to the player (vertical capsule, 0.33 < r <= 1.5 m, >= 2 m tall; trees first)',
    patches: [
      [".filter((c) => c.kind === 'tree' && Math.hypot(c.ax, c.az) < 220 && c.r > 0.33);",
        ".filter((c) => c.type === 'capsule' && c.vertical && c.r > 0.33 && c.r <= 1.5 && (c.by - c.ay) >= 2 && c.camera !== false)\n"
        + "        .map((c) => [c.kind === 'tree' ? 0 : 1, Math.hypot(c.ax - p.position.x, c.az - p.position.z), c.id, c])\n"
        + "        .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]).map((r) => r[3]);"],
    ],
    field: 'setup',
  },
  {
    id: 'A25b-nav-and-occlusion',
    why: 'the trunk sightlines took tree colliders within 220 m of the old valley origin; the island has none there, so they take the nearest trunk-shaped occluders (vertical capsules, r <= 1.2 m, >= 2 m tall; trees first) to the player',
    patches: [
      ["const trees = sp.collision.colliders.filter((c) => c.kind === 'tree' && Math.hypot(c.ax, c.az) < 220);",
        "const __pp = ctx.player.position;\n"
        + "      const trees = sp.collision.colliders.filter((c) => c.occluder && c.type === 'capsule' && c.vertical && c.r <= 1.2 && (c.by - c.ay) >= 2)\n"
        + "        .map((c) => [c.kind === 'tree' ? 0 : 1, Math.hypot(c.ax - __pp.x, c.az - __pp.z), c.id, c])\n"
        + "        .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]).slice(0, 160).map((r) => r[3]);\n"
        + "      window.__A25B_TRUNKS__ = { n: trees.length, kinds: [...new Set(trees.map((c) => c.kind))] };"],
      ["if (!trees.length) return { pass: null, detail: 'SKIP: no tree colliders' };",
        "if (!trees.length) return { pass: null, detail: 'SKIP: no trunk-shaped occluder (vertical capsule, r <= 1.2 m) on the island' };"],
      ['occluderTests: n, trunkLinesBlocked: blockedHits, offsetLinesClear: clearHits,',
        'occluderTests: n, trunkLinesBlocked: blockedHits, offsetLinesClear: clearHits, trunks: window.__A25B_TRUNKS__,'],
    ],
  },
  {
    id: 'A28b-canon-speeds',
    why: 'flatSpot found a flat POINT (-18, -105) and the 16 m sprint ran up an 8-10 deg grade; the row now runs along a flat lane',
    patches: [
      ['const spot = flatSpot(20, 150);', FLAT_LANE + '\n      const spot = flatLane(28);'],
      ['p._snapToGround(); p.camYaw = Math.PI; p.heading = 0;', 'p._snapToGround(); p.camYaw = spot.camYaw; p.heading = spot.heading;'],
    ],
  },
];

/* ------------------------------------------------------------------------------------------ */
/* A45c on the island: a planted Instrument foot does not jump between rendered frames          */
/* ------------------------------------------------------------------------------------------ */
/**
 * The carried A45c read `footContinuity()`, which only the handle-rig FootLock publishes, and the handle rig
 * ran only on the legacy kinds (deleted at M0.3 R2), so it reported SKIP-legacy. The live Instruments plant
 * their feet through gait.js and publish them through `debugFeet()` (the source A45 reads). Same primary bar:
 * a planted foot moves <= 0.12 m in any rendered frame and <= 3 m/s. The footlock-only "lock ramp <= 9 m/s"
 * clause has no gait equivalent and is not graded.
 */
const A45C_ISLAND = `(async () => {
  { const __k = noKindsSkip(); if (__k) return __k; }
  const T = __CTX__.terrain, species = new Map();
  for (const _m of stagedPicks()) species.set(_m.kind, _m);
  const out = {}; let measured = 0, worstFrameM = 0, worstMps = 0, worstAt = null;
  for (const [kind, m] of species) {
    if (!m.debugFeet || m.debugFeet().length < 2) { out[kind] = 'no feet'; continue; }
    {
      const _p = __CTX__.player;
      _p.position.set(m.position.x + 14, 0, m.position.z + 14);
      _p._snapToGround?.();
      _p.camYaw = Math.atan2(m.position.x - _p.position.x, m.position.z - _p.position.z) + Math.PI;
      await new Promise((r) => setTimeout(r, 2200));
    }
    const prev = {};
    let prevT = performance.now(), samples = 0, plantedPairs = 0, kFrame = 0, kMps = 0, moved = 0;
    let sx = m.position.x, sz = m.position.z;
    const t0 = performance.now();
    while (performance.now() - t0 < 5000) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now(), dt = Math.max(1e-3, (now - prevT) / 1000);
      prevT = now; samples++;
      moved += Math.hypot(m.position.x - sx, m.position.z - sz); sx = m.position.x; sz = m.position.z;
      for (const f of m.debugFeet()) {
        const on = f.planted && Math.abs(f.world.y - T.getHeight(f.world.x, f.world.z)) <= 0.25;
        const q = prev[f.name];
        if (on && q) {
          const step = Math.hypot(f.world.x - q.x, f.world.y - q.y, f.world.z - q.z);
          plantedPairs++;
          if (step > kFrame) kFrame = step;
          if (step / dt > kMps) kMps = step / dt;
          if (step > worstFrameM) { worstFrameM = step; worstAt = kind + ':' + f.name; }
          if (step / dt > worstMps) worstMps = step / dt;
        }
        prev[f.name] = on ? { x: f.world.x, y: f.world.y, z: f.world.z } : null;
      }
    }
    if (moved < 0.4 || plantedPairs < 20) { out[kind] = { skipped: 'idle', movedM: +moved.toFixed(2), plantedPairs }; continue; }
    out[kind] = { worstPlantedFrameM: +kFrame.toFixed(4), worstPlantedMps: +kMps.toFixed(3), plantedPairs, frames: samples, movedM: +moved.toFixed(2) };
    measured++;
  }
  const need = Math.min(2, species.size);
  if (measured < need) return { pass: null, detail: { note: 'SKIP: fewer than ' + need + ' staged kinds walked far enough to sample', out } };
  const pass = worstFrameM <= 0.12 && worstMps <= 3;
  return { pass, detail: { stage: 'island: one walking machine of each staged kind, read through debugFeet() (gait.js)',
    barFrameM: 0.12, barMps: 3, worstPlantedFrameM: +worstFrameM.toFixed(4), worstPlantedMps: +worstMps.toFixed(3), worstAt,
    speciesMeasured: measured, out, notGraded: 'lock ramp <= 9 m/s (FootLock only; no live kind runs the handle rig)' } };
})()`;

/**
 * The turntable versions of the four rows that drove the studio. Same ids, same bars; what the
 * studio's own shell did (its F10 key, its panel buttons, its gaze/expression overlay) is not
 * graded, because the turntable replaces that shell (REMOVE.md R4: A79b, A79f, A79d dropped).
 */
export const RESTAGED = [
  {
    id: 'A45c-foot-continuity', kind: 'action', lane: 'kept-stack', stage: 'island',
    title: '[island] a PLANTED Instrument foot does not move: <= 0.12 m in any rendered frame AND <= 3 m/s (debugFeet, every staged kind that walks)',
    settle: 500, timeout: 180000,
    assert: staged([], A45C_ISLAND),
  },
  {
    id: 'A22-msaa', kind: 'action', lane: 'kept-stack', stage: 'island',
    title: '[island] A22 under R25: the scene target is composer.renderTarget1 with the shipped tier\'s sample count (>= 4 if the tier keeps MSAA, else 0) and SMAA present and enabled; measured on the turntable AA card (dark stakes against the island sky), SMAA ramps >= 20 % of silhouette pixels and >= 1.5x the same frame with SMAA off',
    settle: 1500, timeout: 120000,
    assert: placed(['spawnVista'], A22_ISLAND),
  },
  {
    id: 'A22b-fov-recompile', kind: 'action', lane: 'kept-stack', stage: 'turntable',
    title: '[turntable] FOV changes never black-screen the composite: no console errors, the frame is not a flat colour, and a forced grade-pass recompile survives',
    settle: 1200, timeout: 60000,
    assert: placed(['spawnVista'], A22B_TT),
  },
  {
    id: 'A78-cast-states', kind: 'action', lane: 'kept-stack', stage: 'turntable',
    title: '[turntable] a held `attack` on a CALM machine 80 m from the hero is still `attack` a full sim second later (forceState + pinned perception), and release hands it back',
    setup: `(async () => { __CTX__.input.enabled = true; })()`,
    settle: 600, timeout: 90000,
    assert: staged([], A78_TT),
  },
  {
    id: 'A79-time-authority', kind: 'action', lane: 'kept-stack', stage: 'turntable',
    title: '[turntable] a freeze while combat is live: engine.timeScale === 0 and simTime still for 2 s with hitstop, concentration and legacy each asking for another number every poll; exit hands time back',
    setup: `(async () => { __CTX__.input.enabled = true; })()`,
    settle: 600, timeout: 90000,
    assert: staged([], A79_TT),
  },
  {
    id: 'A79e-pose-overlay-frozen', kind: 'action', lane: 'kept-stack', stage: 'turntable',
    title: '[turntable] with the world frozen and a lens at her face, no real-dt writer walks any bone the animator names (eyes and lids where the rig has them, head, neck, spine, arms, legs; worst <= 0.01 rad over 2 s of rendered frames)',
    setup: `(async () => { __CTX__.input.enabled = true; })()`,
    settle: 600, timeout: 90000,
    assert: A79E_TT,
  },
];

/** Stage of each row, for docs/GATES.md and the report: 'turntable', 'island', 'title' or 'node'. */
export const STAGE_OF = (g) => g.stage || (g.kind === 'runner' ? 'node' : g.plain ? 'title' : 'island');
