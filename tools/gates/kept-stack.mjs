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
import { placed, placedSetup } from '../gate-places.mjs';
import { TURNTABLE } from './turntable.mjs';
import { buildMeasure } from './aim-rig/measure.mjs';

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

/** A78's cast, restated (docs/GATES.md 3 D, ruling 4): a Plumb, staged by its role (sentry); any other kind is no cast. */
const A78_CAST = "let m = await stageRole('sentry', { dx: 30, dz: 30, filter: (x) => typeof x.forceState === 'function' }); if (m && m.kind !== 'plumb') m = null;";

/* ------------------------------------------------------------------------------------------ */
/* A78 on the turntable: a held `attack` on a calm machine 80 m out sticks for a sim second    */
/* ------------------------------------------------------------------------------------------ */
const A78_TT = `(async () => {${TURNTABLE}${SLEEP} ${FREEZE} ${PARK}
  const ctx = __CTX__;
  // RESTATED (docs/GATES.md 3 D; the orchestrator's ruling 4, M1a regressions run): the cast is the Plumb (role sentry), a
  // kind with an attack state. The first staged kind with forceState became the neutral Gauge (dd5ecaf), which has none
  ${A78_CAST}
  if (!m) return noKindsSkip() || { pass: null, detail: 'SKIP: no living Plumb (role sentry) with forceState' };
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
  // a card with hard stair-steps reads 0 intermediates with SMAA off: any ramp SMAA adds is then an unbounded gain
  const gain = on && off && off.fraction ? +(on.fraction / off.fraction).toFixed(3)
    : on && off && off.fraction === 0 && on.fraction > 0 ? Infinity : null;
  const measured = msaaPath ? null : { smaaOn: on, smaaOff: off, gainOverOff: gain === Infinity ? 'unbounded (0 ramps with SMAA off)' : gain,
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
 * A turntable trunk for V21 (setup context: `ctx`, `sp` in scope): one vertical capsule collider (r 0.42 m,
 * 6 m, kind 'tree', camera on) at 7 m along a flat lane, and a drawn 12-sided trunk on it. Returns [collider].
 */
const TRUNK_FIXTURE = `${FLAT_LANE}
      const __veg = ctx.scene.getObjectByName('vegetation'); if (__veg) __veg.visible = false;
      const __gateTrunk = () => {
        const L = flatLane(16);
        if (!L) return [];
        const tx = L.x + Math.sin(L.heading) * 7, tz = L.z + Math.cos(L.heading) * 7, ty = ctx.terrain.getHeight(tx, tz) - 0.2;
        const id = sp.collision.register({ kind: 'tree', shape: { type: 'capsule', a: [tx, ty, tz], b: [tx, ty + 6, tz], radius: 0.42 },
          blocking: true, occluder: true, camera: true });
        let M = null, mat = null;
        ctx.scene.traverse((o) => { if (!M && o.isMesh && o.geometry && o.geometry.isBufferGeometry && o.geometry.attributes.position) M = o; });
        ctx.scene.traverse((o) => { const m = o.material; if (!mat && m && !Array.isArray(m) && /^Mesh(Standard|Lambert|Phong|Basic)Material$/.test(m.type) && !Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) mat = m; });
        if (M && mat) {
          mat = mat.clone(); mat.color.setRGB(0.22, 0.16, 0.11); mat.map = null; mat.vertexColors = false; mat.transparent = false; mat.opacity = 1;
          if (mat.emissive) mat.emissive.setRGB(0, 0, 0);
          const v = [], N = 12, R = 0.42, H = 6;
          for (let i = 0; i < N; i++) {
            const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
            const x0 = Math.sin(a0) * R, z0 = Math.cos(a0) * R, x1 = Math.sin(a1) * R, z1 = Math.cos(a1) * R;
            v.push(x0, 0, z0, x1, 0, z1, x1, H, z1, x0, 0, z0, x1, H, z1, x0, H, z0);
          }
          const g = new M.geometry.constructor();
          g.setAttribute('position', new M.geometry.attributes.position.constructor(new Float32Array(v), 3));
          g.computeVertexNormals();
          mat.side = 2;
          const trunk = new M.constructor(g, mat);
          trunk.position.set(tx, ty, tz); trunk.name = 'gate-trunk'; trunk.castShadow = true; trunk.frustumCulled = false;
          ctx.scene.add(trunk);
        }
        return [sp.collision.byId.get(id)];
      };`;

/**
 * Rows that stand as registered except for one staging line: each patch is applied to the
 * registered row's assert text (exact strings; a patch that does not apply turns the row into a
 * FAIL naming the patch, so a later edit to the row cannot silently run the old staging).
 */
export const PATCHED = [
  {
    id: 'A90b-memory-attribution',
    why: 'its allocation sweep names ctx.studio as a root to walk; the studio is out of the kept-stack frame, so the sweep no longer names it (a walk of an absent root reads the trap, not the studio)',
    patches: [
      ["'studio', 'environment', 'vegetation'", "'environment', 'vegetation'"],
    ],
  },
  {
    id: 'A72b-accessibility',
    why: 'the palette clause read --cal-accent, a token the new HUD no longer defines; the colour palettes now re-point the semantic --cal-c-* tokens (src/ui/settings.js PALETTES), so it reads --cal-c-staff',
    patches: [
      ["getPropertyValue('--cal-accent')", "getPropertyValue('--cal-c-staff')"],
    ],
  },
  {
    id: 'V21-camera-cover',
    why: 'the shot needs a tree trunk on open ground; the island has no tree within 220 m of the old valley origin (the row filmed nothing: "no tree"), so the turntable stands one 0.42 m trunk collider with a drawn trunk on a flat lane clear of every collider, and hides the reeds',
    patches: [
      ["const pitch = 0.1;", TRUNK_FIXTURE + "\n      const pitch = 0.1;"],
      [".filter((c) => c.kind === 'tree' && Math.hypot(c.ax, c.az) < 220 && c.r > 0.33);", ".filter(() => false).concat(__gateTrunk());"],
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
    const startState = { state: m.state ?? null, speed: m._speed != null ? +(+m._speed).toFixed(2) : null, at: [+m.position.x.toFixed(1), +m.position.z.toFixed(1)],
      bootPeopleWait: __CTX__.engine?.bootPeopleWait ?? null };
    let prevT = performance.now(), samples = 0, plantedPairs = 0, kFrame = 0, kMps = 0, moved = 0, slips = 0, kAt = null;
    let sx = m.position.x, sz = m.position.z;
    const t0 = performance.now();
    while (performance.now() - t0 < 5000) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now(), dt = Math.max(1e-3, (now - prevT) / 1000);
      prevT = now; samples++;
      moved += Math.hypot(m.position.x - sx, m.position.z - sz); sx = m.position.x; sz = m.position.z;
      const feet = m.debugFeet();
      for (let fi = 0; fi < feet.length; fi++) {
        const f = feet[fi];
        const on = f.planted && Math.abs(f.world.y - T.getHeight(f.world.x, f.world.z)) <= 0.25;
        const q = prev[f.name];
        if (on && q) {
          const step = Math.hypot(f.world.x - q.x, f.world.y - q.y, f.world.z - q.z);
          plantedPairs++;
          if (step > 0.02) slips++;
          if (step > kFrame) kFrame = step;
          if (step / dt > kMps) {
            kMps = step / dt;
            // (regfix 4, diagnosis only; not graded) what the worst planted pair stood in: the rendered frame's
            // wall time and sim steps, the machine's state and speed, the leg's reach use and stance time, how far
            // the solved foot sat from its plant, and whether the plant itself moved (a re-plant inside one stance)
            const L = m.gait?.legs?.[fi], E = __CTX__.engine;
            kAt = { foot: f.name, stepM: +step.toFixed(4), wallDtMs: +(dt * 1000).toFixed(2), simSteps: E?.steps ?? null,
              frameMs: E?.lastFrame?.ms != null ? +(+E.lastFrame.ms).toFixed(2) : null, state: m.state ?? null,
              speed: m._speed != null ? +(+m._speed).toFixed(2) : null, reachK: L ? +(+L.reachK).toFixed(3) : null,
              stanceT: L ? +(+L.stanceT).toFixed(3) : null, plantId: f.plantId ?? null, prevPlantId: q.plantId ?? null,
              offPlantM: L ? +Math.hypot(f.world.x - L.plant.x, f.world.z - L.plant.z).toFixed(4) : null,
              plantMovedM: L && q.px != null ? +Math.hypot(L.plant.x - q.px, L.plant.z - q.pz).toFixed(4) : null };
          }
          if (step > worstFrameM) { worstFrameM = step; worstAt = kind + ':' + f.name; }
          if (step / dt > worstMps) worstMps = step / dt;
        }
        const L = m.gait?.legs?.[fi];
        prev[f.name] = on ? { x: f.world.x, y: f.world.y, z: f.world.z, plantId: f.plantId, px: L ? L.plant.x : null, pz: L ? L.plant.z : null } : null;
      }
    }
    if (moved < 0.4 || plantedPairs < 20) { out[kind] = { skipped: 'idle', movedM: +moved.toFixed(2), plantedPairs }; continue; }
    out[kind] = { worstPlantedFrameM: +kFrame.toFixed(4), worstPlantedMps: +kMps.toFixed(3), plantedPairs, frames: samples, movedM: +moved.toFixed(2),
      slipsOver2cm: slips, worstPair: kAt, startState: startState };
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
 * V2 had no staging: it filmed her from the chase camera at the rest site, from behind and through the reeds.
 * On the turntable: open ground, reeds hidden, the lens 3.2 m out at a front three-quarter, idle 2.5 s, frozen.
 */
const V2_TT = `(async () => {${TURNTABLE}
  const C = __CTX__, p = C.player;
  C.state = 'playing';
  document.getElementById('hud').style.display = 'none';
  standAt(p, 'openGround'); p.velocity?.set?.(0, 0, 0);
  const veg = C.scene.getObjectByName('vegetation'); if (veg) veg.visible = false;
  C.input.keys.clear();
  TT.enter();
  await new Promise((r) => setTimeout(r, 2500));
  const V = C.camera.position.constructor, hd = p.heading + 0.6;
  TT.lens({ pos: new V(p.position.x + Math.sin(hd) * 3.2, p.position.y + 1.15, p.position.z + Math.cos(hd) * 3.2),
    look: new V(p.position.x, p.position.y + 0.95, p.position.z), fov: 40 });
  await new Promise((r) => setTimeout(r, 300));
  TT.freeze();
})()`;

/** V4 had no staging (the aim at the rest site, through the reeds): the same aim on open ground, reeds hidden. */
const V4_OPEN = `(async () => {
  const C = __CTX__, p = C.player;
  C.input.enabled = true; C.state = 'playing';
  standAt(p, 'openGround'); p.velocity?.set?.(0, 0, 0);
  const veg = C.scene.getObjectByName('vegetation'); if (veg) veg.visible = false;
  await new Promise((r) => setTimeout(r, 600));
  C.input.mouse.buttons |= 4;
  setTimeout(() => { C.input.mouse.buttons |= 1; }, 400);
})()`;

/**
 * The turntable versions of the four rows that drove the studio. Same ids, same bars; what the
 * studio's own shell did (its F10 key, its panel buttons, its gaze/expression overlay) is not
 * graded, because the turntable replaces that shell (REMOVE.md R4: A79b, A79f, A79d dropped).
 */
export const RESTAGED = [
  {
    id: 'V2-idle-frame', kind: 'visual', lane: 'kept-stack', stage: 'turntable',
    title: '[turntable] Idle stance reads alive and asymmetric',
    setup: placedSetup(['openGround'], V2_TT),
    settle: 1500,
    criteria: 'Weight settled into one hip (pelvis offset), relaxed asymmetric arms, natural head angle. FAIL if perfectly symmetric A-pose-with-arms-down.',
  },
  {
    id: 'V4-aim-anchor', kind: 'visual', lane: 'kept-stack', stage: 'island',
    title: '[island] Full draw anchored at cheek',
    setup: placedSetup(['openGround'], V4_OPEN),
    settle: 2600,
    criteria: 'Draw hand at cheek/jaw, elbow high and level, arrow nocked ON the string line, torso twisted toward target. FAIL if arrow floats detached or draw hand is off the face.',
  },
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

/* ========================================================================================================== */
/* M1a FREEZE: RESTATED ROWS (docs/GATES.md §3 D)                                                              */
/* ========================================================================================================== */
/**
 * Rows restated at the M1a freeze, with the reason for each in docs/GATES.md §3 D. Unlike RESTAGED and PATCHED
 * (a `--kept-stack` run only), a restated row replaces the registered row of the same id in EVERY run of
 * tools/gates.mjs: the restatement is the frozen row. Two forms:
 *   { id, why, patches: [[from, to], ...], field? }   the registered row's own assert (or `field`, e.g. 'setup')
 *                                             with exact-text swaps; a swap that no
 *                                             longer applies turns the row red (the runner's patchRow), never stale
 *   { id, why, row }                          a whole row in the registered row's place
 * Bars not named in GATES.md §3 D are untouched.
 */

/** The M1.3b rig's anchor, read with the rig's own measure (tools/gates/aim-rig/measure.mjs, sent as source) at one
 * instant: the index knuckle (index_01_r) to the jaw-corner anchor, the string's nocking point to the string fingers'
 * hook (index_02_r and middle_02_r, midway), the draw elbow's height over the draw shoulder in the aim frame and its
 * distance behind the wrist along the arrow, and, this step, the hand vertices inside the wrap volume and the hand or
 * forearm points behind the head. `__hook(nockWorld)` returns them. */
const HOOK = `
      const __rsBM = ${String(buildMeasure)};
      let __rsM = null, __rsB = null;
      const __hook = (nkWorld) => {
        const __a = __CTX__.player.animator, __m = __CTX__.player.model, __c = __CTX__.combat;
        const T3 = __m.position.constructor;
        if (!__rsM) {
          __rsM = __rsBM({ an: __a, model: __m, combat: __c }, { Vector3: T3, Quaternion: __m.quaternion.constructor });
          __rsB = {};
          __m.traverse((o) => { if (o.isBone) __rsB[o.name] = o; });
        }
        __m.updateMatrixWorld(true);
        const CP = (b) => (b ? __m.worldToLocal(b.getWorldPosition(new T3())) : null);
        const kn = CP(__rsB.index_01_r), i2 = CP(__rsB.index_02_r), m2 = CP(__rsB.middle_02_r);
        const jaw = __rsM.jawChar(new T3());
        const nk = __m.worldToLocal(nkWorld.clone());
        const dRaw = __a.debugAimRig?.()?.d || __a.debugAim?.()?.d || __a._aimDbg?.d || null;
        let elbowUpAim = null, elbowBack = null;
        if (dRaw) {
          const d = (Array.isArray(dRaw) ? new T3().fromArray(dRaw) : new T3().copy(dRaw)).normalize();
          const up = new T3(0, 1, 0).addScaledVector(d, -d.y).normalize();
          const sh = CP(__a.b.upArmR.bone), el = CP(__a.b.loArmR.bone), wr = CP(__a.b.handR.bone);
          elbowUpAim = +el.clone().sub(sh).dot(up).toFixed(4);
          elbowBack = +wr.clone().sub(el).dot(d).toFixed(4);
        }
        __rsM.begin(); __rsM.sample({ T: 0, aiming: !!__CTX__.player.aiming, draw: __c.drawStrength }); const __s = __rsM.end();
        return {
          knuckleJaw: kn ? +kn.distanceTo(jaw).toFixed(4) : null,
          hookNock: i2 && m2 ? +i2.clone().lerp(m2, 0.5).distanceTo(nk).toFixed(4) : null,
          elbowUpAim, elbowBack, wrapIn: __s.wrapIn, behind: __s.behind,
        };
      };`;

/** The rig's bars (BUILD M1.3b; aim-rig/measure.mjs BARS): the anchor, the hook, the elbow level and back. */
export const RIG_BARS = Object.freeze({ knuckleJaw: 0.03, hookNock: 0.03, elbowLo: -0.03, elbowHi: 0.05, elbowBack: 0.05 });
const B = RIG_BARS;

const A16_GRADE_OLD = `r.drawS > 0.9 && r.nockToHand <= 0.09
        && r.elbowAboveShoulderAimFrame !== null && r.elbowAboveShoulderAimFrame <= 0 && (r.aimPitch !== 0 || r.elbowAboveShoulder <= 0) && r.headClear >= 0.98 && r.launchOffDeg !== null && r.launchOffDeg <= 0.3 && r.knuckleToNock !== null && r.knuckleToNock <= 0.06 && r.fingertipToNock !== null && r.fingertipToNock <= 0.06));`;
const A16_GRADE_NEW = `r.drawS > 0.9 && r.knuckleJaw !== null && r.knuckleJaw <= ${B.knuckleJaw} && r.hookNock !== null && r.hookNock <= ${B.hookNock}
        && r.elbowUpAim !== null && r.elbowUpAim >= ${B.elbowLo} && r.elbowUpAim <= ${B.elbowHi} && r.elbowBack !== null && r.elbowBack >= ${B.elbowBack} && r.wrapIn === 0 && r.behind === 0 && r.headClear >= 0.98 && r.launchOffDeg !== null && r.launchOffDeg <= 0.3 && r.launchSteady !== null && r.launchSteady.phase === 'hold' && r.launchSteady.swayDeg === 0));`;
const A16_FAILING_OLD = `failing: bad.map(r => r.tag + ':' + [r.drawS > 0.9 ? null : 'drawS', r.nockToHand <= 0.09 ? null : 'nockToHand', r.elbowAboveShoulderAimFrame !== null && r.elbowAboveShoulderAimFrame <= 0 ? null : 'elbowAboveShoulderAimFrame', r.aimPitch !== 0 || r.elbowAboveShoulder <= 0 ? null : 'elbowAboveShoulderLevel', r.headClear >= 0.98 ? null : 'headClear', r.launchOffDeg !== null && r.launchOffDeg <= 0.3 ? null : 'launch', r.knuckleToNock !== null && r.knuckleToNock <= 0.06 ? null : 'knuckle', r.fingertipToNock !== null && r.fingertipToNock <= 0.06 ? null : 'fingertip'].filter(Boolean).join('+')) }`;
const A16_FAILING_NEW = `restated: 'M1a freeze (docs/GATES.md 3 D): the anchor is the M1.3b rig hook at the jaw corner. Graded: knuckleJaw (index_01_r to the jaw-corner anchor) <= ${B.knuckleJaw} m, hookNock (string fingers to the nocking point) <= ${B.hookNock} m, elbowUpAim in [${B.elbowLo}, ${B.elbowHi}] m, elbowBack >= ${B.elbowBack} m, wrapIn 0, behind 0, headClear, launch (loosed on Steady: the shot leaves in the hold of Steady, sway 0; M1b wave 2 ruling). Reported only: nockToHand (wrist), knuckleToNock, fingertipToNock and the old elbow reads', failing: bad.map(r => r.tag + ':' + [r.crouching !== false ? null : 'notCrouched', r.drawS > 0.9 ? null : 'drawS', r.knuckleJaw !== null && r.knuckleJaw <= ${B.knuckleJaw} ? null : 'knuckleJaw', r.hookNock !== null && r.hookNock <= ${B.hookNock} ? null : 'hookNock', r.elbowUpAim !== null && r.elbowUpAim >= ${B.elbowLo} && r.elbowUpAim <= ${B.elbowHi} ? null : 'elbowLevel', r.elbowBack !== null && r.elbowBack >= ${B.elbowBack} ? null : 'elbowBack', r.wrapIn === 0 ? null : 'handInWrap', r.behind === 0 ? null : 'behindHead', r.headClear >= 0.98 ? null : 'headClear', r.launchOffDeg !== null && r.launchOffDeg <= 0.3 ? null : 'launch', r.launchSteady !== null && r.launchSteady.phase === 'hold' && r.launchSteady.swayDeg === 0 ? null : 'notOnSteady'].filter(Boolean).join('+')) }`;

/* M1b wave 2 ruling (docs/GATES.md 3 D): the launch clause is measured on Steady (sway 0). The row tests the draw rig;
 * the slice combat kit's breath sway turns a loosed shot (src/combat/kit.js swayAt, 0 in Steady's hold) and is graded
 * by its own rows. After the pose is read (unchanged), Shift is pressed while she aims, which arms Steady (combat.js
 * _updateConcentration: a Shift press made while already aiming); the shot is loosed once Steady is in its hold with
 * the sway at 0, and the phase and sway at the instant the arrow fires are recorded (launchSteady). Shift is let go
 * after the shot; the next cell's measure() clears the keys anyway. */
const A16_LOOSE_OLD = `let fired = null; const h = (e) => { fired = e; }; C.events.on('arrow-fired', h);
          C.input.mouse.buttons &= ~1;`;
const A16_LOOSE_NEW = `let fired = null; __lst = null; const h = (e) => { fired = e; __lst = { phase: cmb.steady.phase, swayDeg: cmb.sway.deg, gauge: +cmb.steady.gauge.toFixed(3) }; }; C.events.on('arrow-fired', h);
          C.input.keys.add('ShiftLeft');
          const __s0 = performance.now();
          while (!(cmb.steady.active && cmb.steady.phase === 'hold' && cmb.sway.deg === 0) && performance.now() - __s0 < 1000) await new Promise((r) => requestAnimationFrame(r));
          C.input.mouse.buttons &= ~1;`;
const A16_LOOSE_END_OLD = `C.events.off('arrow-fired', h);
          if (!fired?.dir`;
const A16_LOOSE_END_NEW = `C.events.off('arrow-fired', h);
          C.input.keys.delete('ShiftLeft');
          if (!fired?.dir`;
const A16_ROW_END_OLD = `* 180 / Math.PI).toFixed(3);
        })() });`;
const A16_ROW_END_NEW = `* 180 / Math.PI).toFixed(3);
        })(), launchSteady: __lst });`;

const A32_LOOP_OLD = `          const hr = V(); an.getBoneWorld(HBN('handR'), hr);
          const d = nk.distanceTo(hr);
          if (ds > 0.05 && ds < 0.9 && d > ramp) { ramp = d; rampAt = ds; }
          if (ds >= 0.9) { full = Math.max(full, d); minHand = Math.min(minHand, an.debugArm('r').handHeadUnit); }`;
const A32_LOOP_NEW = `          const hk = __hook(nk);
          const d = hk.hookNock ?? 9;
          if (ds > 0.05 && ds < 0.9 && d > ramp) { ramp = d; rampAt = ds; }
          if (ds >= 0.9) { full = Math.max(full, d); knMax = Math.max(knMax, hk.knuckleJaw ?? 9); minHand = Math.min(minHand, an.debugArm('r').handHeadUnit); }
          if (ds > 0.05) { wrapIn += hk.wrapIn; behind += hk.behind; }`;
const A32_BAD_OLD = `const bad = rows.filter((r) => !(r.rampMaxNockToHand <= 0.09 && r.fullMaxNockToHand <= 0.09
                                    && r.minHandHeadUnit >= 0.88));`;
const A32_BAD_NEW = `const bad = rows.filter((r) => !(r.rampMaxNockToHand <= ${B.hookNock} && r.fullMaxNockToHand <= ${B.hookNock}
                                    && r.fullMaxKnuckleJaw <= ${B.knuckleJaw} && r.wrapInSteps === 0 && r.behindSteps === 0));`;
const A32_RET_OLD = 'return { pass: bad.length === 0, detail: { rows, failing: bad.map((r) => r.tag) } };';
const A32_RET_NEW = "return { pass: bad.length === 0, detail: { restated: 'M1a freeze (docs/GATES.md 3 D): rampMaxNockToHand and fullMaxNockToHand are the string fingers hook (index_02_r and middle_02_r, midway) to the nocking point at the current draw, every step of the ramp (draw 0.05-0.9) and of the full draw; fullMaxKnuckleJaw is index_01_r to the jaw-corner anchor; wrapInSteps and behindSteps count hand vertices in the wrap and hand or forearm points behind the head from draw 0.05 on; minHandHeadUnit is reported only', rows, failing: bad.map((r) => r.tag) } };";

const ELB_FORM_OLD = `        r.knuckleToNock != null && r.knuckleToNock <= 0.06 ? null : 'knuckleOffString',
        r.fingertipToNock != null && r.fingertipToNock <= 0.06 ? null : 'fingertipOffString'].filter(Boolean);`;
const ELB_FORM_NEW = `        r.knuckleJaw != null && r.knuckleJaw <= ${B.knuckleJaw} ? null : 'knuckleOffJawAnchor',
        r.hookNock != null && r.hookNock <= ${B.hookNock} ? null : 'stringOffHook', r.wrapIn === 0 ? null : 'handInWrap'].filter(Boolean);`;
const ELB_WRIST_OLD = `        ...(still(r) ? [!four(r) || r.wristHeadYOffLevelM <= 0.03 ? null : 'wristHeightOffLevel', r.wristHeadFrameOffLevelM <= 0.03 ? null : 'wristOffLevelAnchor'] : []),
`;
const ELB_WRIST_NEW = `        /* restated M1a (docs/GATES.md 3 D): the wrist at the level draw's place on the head is reported, not graded; the
         * anchor is graded in formOf as the index knuckle on the jaw-corner anchor at every pitch */
`;

/* M1a round 2 RULING (the orchestrator, docs/STATE.md "M1a round 2"): A-draw-elbow-level's full-draw elbow clause uses
 * the rig's band, -0.03 to +0.05 m over the draw shoulder in the aim frame (elbow level or back, Kevin's bar), as A16
 * does; "the elbow <= 0.20 m behind the back of the skull" at full draw is reported. Through the loose the elbow starts
 * where the full draw holds it (0.21-0.23 m behind), so the loose's elbow clause is graded against that: never more
 * than 0.02 m further back than at full draw (no swing back past the drawn elbow), the 0.20 m kept where it is the
 * looser bar. (Round 3 hero-anim; the loose clause's reading needs the orchestrator's word.) */
const ELB_FULL_OLD = `        r.elbowBehindHead <= 0.20 ? null : 'elbowBehindHead',
        r.looseSteps >= 6 ? null : 'looseSampled', r.looseMaxHandBehindHead < 0 ? null : 'looseHandBehindSkull',
        r.looseMaxElbowBehindHead <= 0.20 ? null : 'looseElbowBehindHead',`;
const ELB_FULL_NEW = `        r.elbowUpAim != null && r.elbowUpAim >= ${B.elbowLo} && r.elbowUpAim <= ${B.elbowHi} ? null : 'elbowOffRigBand',
        r.looseSteps >= 6 ? null : 'looseSampled', r.looseMaxHandBehindHead < 0 ? null : 'looseHandBehindSkull',
        r.looseMaxElbowBehindHead <= Math.max(0.20, r.elbowBehindHead + 0.02) ? null : 'looseElbowSwingsBack',`;

/** A70: the K tab, watched while it is pressed and for 30 frames after (console errors, menu warnings, page errors). */
const A70_WATCH = `const out = { tabs: [] };
        const __watch = () => {
          const w = { errs: [] }, ce = console.error, cw = console.warn;
          console.error = function (...a) { w.errs.push('error: ' + a.map(String).join(' ').slice(0, 200)); return ce.apply(console, a); };
          console.warn = function (...a) { const t = a.map(String).join(' '); if (/menus|skill/i.test(t)) w.errs.push('warn: ' + t.slice(0, 200)); return cw.apply(console, a); };
          const onErr = (ev) => w.errs.push('page: ' + String(ev.message || ev).slice(0, 200));
          window.addEventListener('error', onErr);
          w.stop = () => { console.error = ce; console.warn = cw; window.removeEventListener('error', onErr); };
          return w;
        };`;
const A70_KEY_OLD = `          key(code); await frames(8);
          const delegated = m.delegated === id;`;
const A70_KEY_NEW = `          const __k = id === 'skills' ? __watch() : null;
          key(code); await frames(8);
          if (__k) { __k.tabAt8 = m.tab; __k.hubAt8 = m.hubOpen; await frames(30); __k.tabAt38 = m.tab; __k.hubAt38 = m.hubOpen; __k.stop(); }
          const delegated = m.delegated === id;`;
const A70_OK_OLD = 'body: m.hubBody.childElementCount, ok: m.tab === id && (delegated || m.hubBody.childElementCount > 0) });';
const A70_OK_NEW = `body: m.hubBody.childElementCount,
                          ok: __k ? (__k.tabAt8 === 'skills' && __k.tabAt38 === 'skills' && __k.hubAt8 === true && __k.hubAt38 === true && __k.errs.length === 0)
                            : (m.tab === id && (delegated || m.hubBody.childElementCount > 0)),
                          ...(__k ? { restated: 'M1a freeze (docs/GATES.md 3 D): no skill screen exists; K holds the skills tab for 38 frames, the hub open, with no error or menu warning', kTabAt8: __k.tabAt8, kTabAt38: __k.tabAt38, kErrors: __k.errs } : {}) });`;

const A56_DECL_OLD = "let worst = 0, worstName = '', casters = 0, grass = 0, bush = 0, overCount = 0;";
const A56_DECL_NEW = `let worst = 0, worstName = '', casters = 0, grass = 0, bush = 0, overCount = 0, dykes = 0;
      const VEG = ['meadow-blades', 'meadow-clumps', 'meadow-cards', 'marram-near', 'glasswort', 'lavender'], veg = {};`;
const A56_COUNT_OLD = `        if (n.startsWith('grass-chunk') && (o.castShadow || o.userData.__shadowBase)) grass++;
        if (n.startsWith('bushes-') && (o.castShadow || o.userData.__shadowBase)) bush++;`;
const A56_COUNT_NEW = `        if (VEG.includes(n)) { const v = (veg[n] = veg[n] || { meshes: 0, casting: 0 }); v.meshes++; if (o.castShadow || o.userData.__shadowBase) { v.casting++; grass++; } }
        if (n === 'pan-dykes' && (o.castShadow || o.userData.__shadowBase)) dykes++;`;
const A56_OK_OLD = '&& overCount === 0 && grass > 0 && bush > 0;';
const A56_OK_NEW = '&& overCount === 0 && VEG.every((k) => veg[k]?.meshes > 0) && grass === 0 && dykes > 0;';
const A56_DET_OLD = 'grassCasterChunks: grass, bushCasterMeshes: bush,';
const A56_DET_NEW = "vegetation: veg, vegetationCasting: grass, dykeCasters: dykes, restated: 'M1a freeze (docs/GATES.md 3 D): every island plant kind present by name and none of them casting (TECH 5: grass never casts); the dyke stones cast',";

/** A71d restated: the shipped Steady presentation (BIBLE §9.7: a hairline breath meter, no veil, no desaturation),
 * the row the HUD's own lane wrote for it (gates.r5.shell-ui.mjs, which does not load), under the kept id. */
const A71D_STEADY = staged([], `(async () => {
    const frames = async (n) => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r)); };
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const hud = window.__HUD_DEBUG__;
    if (!hud?.surfaces) return { pass: false, detail: 'no window.__HUD_DEBUG__.surfaces' };
    const c = __CTX__, combat = c.combat;
    c.input.enabled = true;
    c.input.mouse.buttons |= 4;                 // aim, through the bit player.js reads
    await frames(30);
    if (!c.player.aiming) { c.input.mouse.buttons = 0; return { pass: false, detail: 'staging: RMB did not raise the aim' }; }
    const before = hud.surfaces().breath;
    c.input.keys.add('ShiftLeft');              // Steady, on the real edge combat.js arms on
    const rows = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 2600) {
      await wait(260);
      const b = hud.surfaces().breath;
      rows.push({ ms: Math.round(performance.now() - t0), frac: b.fillFrac, gauge: +(combat?.steady?.gauge ?? -1).toFixed(3), active: !!combat?.steady?.active, vis: b.visible, ts: +(c.engine?.timeScale ?? 1).toFixed(3) });
    }
    const during = hud.surfaces().breath;
    /* what the frame paints while Steady is held: no full-screen overlay, no desaturation */
    const fullscreen = [...document.querySelectorAll('body > *, #hud > *')].filter((n) => {
      if (n.id === 'app' || n.id === 'hud' || n.id === 'title' || n.id === 'loading' || n.id === 'calf-layer' || n.id === 'cal-menus' || n.id === 'cal-calima') return false;
      const cs = getComputedStyle(n), r = n.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.02) return false;
      if (r.width < innerWidth * 0.9 || r.height < innerHeight * 0.9) return false;
      const bg = cs.backgroundColor, img = cs.backgroundImage;
      return (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || img !== 'none' || cs.mixBlendMode !== 'normal';
    }).map((n) => n.id || n.className);
    const veil = document.getElementById('cal-veil');
    const canvas = (c.renderer || c.engine?.renderer)?.domElement || null;
    const canvasFilter = canvas ? (canvas.style.filter || getComputedStyle(canvas).filter || '') : null;
    c.input.keys.delete('ShiftLeft');
    c.input.mouse.buttons &= ~4;
    await frames(10);
    const released = !combat?.steady?.active;
    const fr = rows.map((r) => r.frac);
    let drains = fr.length >= 5;
    for (let i = 1; i < fr.length; i++) if (fr[i] > fr[i - 1] + 0.005) drains = false;
    const checks = {
      armed: rows.some((r) => r.active),
      visibleWhileHeld: rows.every((r) => r.vis),
      drains: drains && fr[fr.length - 1] < fr[0] - 0.08,
      isTheGauge: rows.every((r) => Math.abs(r.frac - r.gauge) < 0.06),
      hairline: during.heightPx <= 4,
      underReticle: during.belowReticlePx > 20 && during.belowReticlePx < 120,
      noVeilElement: !veil,
      noFullScreenOverlay: fullscreen.length === 0,
      noDesaturation: canvasFilter === '' || canvasFilter === 'none',
      released,
    };
    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    return { pass: failed.length === 0, detail: { restated: 'M1a freeze (docs/GATES.md 3 D): the veil row restated to the shipped Steady (BIBLE 9.7: a hairline breath meter, no veil, no desaturation)',
      failed, before, during, rows, fullscreen, canvasFilter, timeScaleWhileHeld: rows[rows.length - 1]?.ts ?? null } };
  })()`);

/* A90-memory-stability (the orchestrator's ruling after the M1a regressions run 2): ONE WARM CYCLE, THEN 30 COUNTED.
 * The row's baseline was read before its first kill, so everything the loop draws for the first time counted as
 * growth: at 6511d94 the geometry ledger (tools/instruments/a90-attrib.gates.mjs) found 61 geometries first drawn
 * during the row, 50 of them the people's distance meshes as Brea walked within 90 m, none outside the scene and one
 * freed; commits running the same game read +16 to +34 by how much of the world was drawn before the row. A first
 * draw is not a leak. Restated: one full cycle (kill, walk, respawn, wait) runs before the baseline; then exactly 30
 * counted cycles (the old 150 s held about 30; capped at 200 s so the 420 s budget holds), the corpse lifecycle and
 * every bar unchanged (heap < 25 %, geometries <= +40, textures <= +8, objects <= +60; min 25 kills). The warm
 * cycle's own deltas are reported. */
const A90_LOOP_OLD = `      if (window.gc) window.gc();
      await new Promise(res => setTimeout(res, 1500));
      const a = mem();
      const t0 = performance.now(); let kills = 0;
      while (performance.now() - t0 < 150000) {
        // W0b fix round 2 (R28 + R34): the victim is a STAGED kind's (memVictim: a living one, else one staged for the
        // loop); Round 4 killed the first living machine of any kind, i.e. the legacy roster first
        const m = await memVictim();
        const killedKind = m ? m.kind : null;
        if (m) { kill(m); kills++; W.kills++; }
        __CTX__.input.keys.add('KeyW'); await new Promise(res => setTimeout(res, 2500)); __CTX__.input.keys.delete('KeyW');
        memRespawnAfter(W, killedKind, __CTX__.player.position.x + 30, __CTX__.player.position.z + 30);
        await new Promise(res => setTimeout(res, 2500));
      }`;
const A90_LOOP_NEW = `      // restated (docs/GATES.md 3 D, the A90 warm-cycle ruling): one warm cycle, then 30 counted cycles
      const cycle = async () => {
        const m = await memVictim();
        const killedKind = m ? m.kind : null;
        if (m) { kill(m); W.kills++; }
        __CTX__.input.keys.add('KeyW'); await new Promise(res => setTimeout(res, 2500)); __CTX__.input.keys.delete('KeyW');
        memRespawnAfter(W, killedKind, __CTX__.player.position.x + 30, __CTX__.player.position.z + 30);
        await new Promise(res => setTimeout(res, 2500));
        return m ? 1 : 0;
      };
      if (window.gc) window.gc();
      await new Promise(res => setTimeout(res, 1500));
      const w0 = mem();
      const warmKills = await cycle();
      if (window.gc) window.gc();
      await new Promise(res => setTimeout(res, 1500));
      const a = mem();
      const warm = { kills: warmKills, geo: a.geo - w0.geo, tex: a.tex - w0.tex, objs: a.objs - w0.objs, before: w0 };
      const t0 = performance.now(); let kills = 0, cycles = 0;
      while (cycles < 30 && performance.now() - t0 < 200000) { kills += await cycle(); cycles++; }`;
const A90_DET_OLD = "const detail = { kills, workload: W, before: a,";
const A90_DET_NEW = "const detail = { restated: 'M1a regfix 3 (docs/GATES.md 3 D): one warm cycle, then 30 counted', cycles, loopSeconds: Math.round((performance.now() - t0) / 1000), warm, kills, workload: W, before: a,";

export const RESTATED = [
  {
    id: 'A16-draw-anchor',
    why: 'the M1.3b rig holds the string in a hook at the jaw corner (BIBLE 5.2: the draw hand at the cheek); the row measured the wrist and the knuckle against the nock, which the hook puts 0.09-0.12 m apart by design; M1b wave 2 ruling: the launch clause is measured on Steady (sway 0), since the row tests the draw rig and the breath sway is graded by its own rows',
    patches: [
      ['const V = () => new p.position.constructor();\n      const rows = [];', `const V = () => new p.position.constructor();${HOOK}\n      let __lst = null;\n      const rows = [];`],
      ['        fingertipToNock: (() => { const k = V(), t = V(); return an.debugDrawHand && an.debugDrawHand(k, t) ? +t.distanceTo(nk).toFixed(4) : null; })(),',
        '        fingertipToNock: (() => { const k = V(), t = V(); return an.debugDrawHand && an.debugDrawHand(k, t) ? +t.distanceTo(nk).toFixed(4) : null; })(),\n        ...__hook(nk),'],
      [A16_GRADE_OLD, A16_GRADE_NEW],
      [A16_FAILING_OLD, A16_FAILING_NEW],
      [A16_LOOSE_OLD, A16_LOOSE_NEW],
      [A16_LOOSE_END_OLD, A16_LOOSE_END_NEW],
      [A16_ROW_END_OLD, A16_ROW_END_NEW],
    ],
  },
  {
    id: 'A32-draw-ramp',
    why: 'the same hook: through the draw ramp the string stays in the string fingers, not at the wrist; at full draw the hand sits at the jaw corner and out of the wrap, not graded by the hand joint against the head ellipsoid',
    patches: [
      ['const V = () => new p.position.constructor();\n      const rows = [];', `const V = () => new p.position.constructor();${HOOK}\n      const rows = [];`],
      ['let ramp = 0, rampAt = 0, minHand = 9, full = 0;', 'let ramp = 0, rampAt = 0, minHand = 9, full = 0, knMax = 0, wrapIn = 0, behind = 0;'],
      [A32_LOOP_OLD, A32_LOOP_NEW],
      ['fullMaxNockToHand: +full.toFixed(4), minHandHeadUnit: +minHand.toFixed(3) });',
        'fullMaxNockToHand: +full.toFixed(4), minHandHeadUnit: +minHand.toFixed(3), fullMaxKnuckleJaw: +knMax.toFixed(4), wrapInSteps: wrapIn, behindSteps: behind });'],
      [A32_BAD_OLD, A32_BAD_NEW],
      [A32_RET_OLD, A32_RET_NEW],
    ],
  },
  {
    id: 'A-draw-elbow-level',
    why: 'the same hook: the hand on the string and the hand held at the head are graded at the rig anchor (the knuckle on the jaw corner, the string in the fingers hook, the hand out of the wrap); every chest, behind-the-head, step and crouch clause is unchanged; M1a round 2 ruling: the full-draw elbow is graded on the rig band (-0.03 to +0.05 m, aim frame), its 0.20 m behind the skull reported, and through the loose the elbow no more than 0.02 m further back than at full draw (or within 0.20 m)',
    patches: [
      ["freeze(); standAt(p, 'openGround'); await wait(300);", `freeze(); standAt(p, 'openGround'); await wait(300);${HOOK}`],
      ['          fingertipToNock: hasHand ? +ftW.distanceTo(nkW).toFixed(4) : null,', '          fingertipToNock: hasHand ? +ftW.distanceTo(nkW).toFixed(4) : null,\n          ...__hook(nkW),'],
      [ELB_FORM_OLD, ELB_FORM_NEW],
      [ELB_WRIST_OLD, ELB_WRIST_NEW],
      [ELB_FULL_OLD, ELB_FULL_NEW],
    ],
  },
  {
    id: 'A70-hub-tabs',
    why: 'no skill screen exists and the bible has no skill tree; the K tab must not bounce the hub to another tab or throw',
    patches: [
      ['const out = { tabs: [] };', A70_WATCH],
      [A70_KEY_OLD, A70_KEY_NEW],
      [A70_OK_OLD, A70_OK_NEW],
    ],
  },
  {
    id: 'A56-cascades',
    why: 'the grass and bush clause counted the old valley mesh names; on the island the plants are the meadow rings and the flora kinds, and none casts (TECH 5: grass never casts); the field dyke stones are the low casters',
    patches: [
      [A56_DECL_OLD, A56_DECL_NEW],
      [A56_COUNT_OLD, A56_COUNT_NEW],
      [A56_OK_OLD, A56_OK_NEW],
      [A56_DET_OLD, A56_DET_NEW],
    ],
  },
  {
    id: 'A78-cast-states',
    why: "the orchestrator's ruling 4 (M1a regressions run): the cast is a kind with an attack state, the Plumb (role sentry); the first staged kind with forceState became the neutral Gauge (dd5ecaf: docile, no attack rows until M2.3c), on which forceState('attack') cannot take",
    patches: [
      ["const m = await stageAny({ dx: 30, dz: 30, filter: (x) => typeof x.forceState === 'function' });", A78_CAST],
      ["const detail = 'calm=' + calm", "const detail = 'kind=' + m.kind + ' calm=' + calm"],
    ],
  },
  {
    id: 'A65-save-restore',
    field: 'setup',
    why: "the orchestrator's ruling 4 (M1a regressions run): the row reads the save the game writes, save v6 (BUILD M1.6f): the named record of the active slot (cal.v6.slot<N>.named, through the save system's own read) and its machine roster at legacy.roster. It read cal.save.v5, which nothing writes since 5baa3e7, and failed on a null record (39f7533). The reload, Continue (the title's own call) and every clause are unchanged",
    patches: [
      ["const snap = prog.saves.read('cal.save.v5');", "const snap = prog.saves.read();   // restated (GATES 3 D): the v6 named record of the active slot"],
      ['snap.world.roster', 'snap.legacy.roster'],
    ],
  },
  {
    id: 'A90-memory-stability',
    why: "the orchestrator's ruling after the M1a regressions run 2: a first draw is not a leak. The row warms one full cycle (kill, walk, respawn, wait) before its baseline, then counts 30 cycles; every bar is unchanged. At 6511d94, 50 of the 61 geometries first drawn during the row were the people's distance meshes, all in the scene",
    patches: [
      [A90_LOOP_OLD, A90_LOOP_NEW],
      [A90_DET_OLD, A90_DET_NEW],
    ],
  },
  {
    id: 'V49-draw-from-jog',
    field: 'setup',
    why: "M1a weapons round 2 (the orchestrator's task): the draw it films is the canon's left-hand butt-first draw (BIBLE 5.2: the left hand takes the haft by the butt at the left hip, swings it forward and up under the left arm, the right joins in front of the chest). The row described and filmed the old right-hand reach over the right shoulder; it films the same twelve tiles from her LEFT rear three-quarter and her LEFT side and grades the left arm's path. Every failure clause is unchanged",
    patches: [
      ['await drawRow(() => lockCam(-1.1, 1.7, 1.7, 1.35, 42));', 'await drawRow(() => lockCam(1.1, 1.7, 1.7, 1.35, 42));   // restated (GATES 3 D): her LEFT rear three-quarter'],
      ['await drawRow(() => lockCam(-2.0, 0.1, 1.5, 1.25, 42));', 'await drawRow(() => lockCam(2.0, 0.1, 1.5, 1.25, 42));   // restated: her LEFT side'],
      ['"REAR3/4 ', '"L REAR3/4 '],
      ['"SIDE ', '"L SIDE '],
    ],
    set: {
      title: 'Drawing the lance at a jog, frame by frame (restated M1a weapons round 2) — her LEFT rear-3/4 and LEFT side — the left hand takes the haft by the butt at the left hip and swings it forward and up under the left arm, the right joins in front of the chest; no arm ever up behind her head',
      criteria: 'Twelve captioned tiles, two rows of six, of ONE real draw each (the lance key, pressed mid-jog; ruling R8): ROW 1 from her LEFT rear-3/4, ROW 2 from her LEFT side, '
        + 'each at draw 0.10 / 0.25 / 0.40 / 0.55 / 0.75 and the first guard frame (the draw is played at time scale 0.25 and frozen on each tile\'s frame; the caption prints the drawK actually posed). '
        + 'The draw is the canon\'s (BIBLE 5.2, restated in docs/GATES.md 3 D): the LEFT hand reaches back at the left hip and takes the haft low, by the butt end; carries it forward and up under the left arm, '
        + 'the blade end clearing her right shoulder as the shaft pivots; the RIGHT hand joins on the haft in front of the chest and brings it into the low guard. '
        + 'Judge against the owner\'s standing complaints ("arm literally behind head", "arms crossing into her body") and the licence-clean lance reference reference/r5/gates-perf/lance-back-carry (A-reference-set, W0b). PASS requires ALL of: '
        + '(1) in every tile BOTH elbows are at or below the top of her head and, whenever one is up at shoulder height, beside or IN FRONT of her head — never up behind it; '
        + '(2) from the rear-3/4 row no forearm lies across the back of her head or neck; the left hand goes back to the haft at her left hip, low, never over a shoulder; '
        + '(3) neither arm is folded across her chest; '
        + '(4) the lance comes off her back continuously — it never appears in a new place between two tiles — and ends in her right hand in the low guard (blade forward-down) in the last tile of each row; '
        + '(5) she is still jogging (stride visible, torso leaning with the run). '
        + 'FAIL on any elbow up behind the head, a forearm across the back of the head, the lance popping between tiles, or the bow in either hand. '
        + 'A107 measures the same frames numerically (elbow <= head + 0.05 m; above the shoulder, <= 0.10 m behind the head plane).',
    },
  },
  {
    id: 'A71d-conc-veil',
    why: 'the veil it measured is gone by design (BIBLE 9.7: Steady is a hairline breath meter, no veil, no desaturation); the HUD lane replacement row never ran (its file does not load)',
    row: {
      id: 'A71d-conc-veil', kind: 'action', lane: 'kept-stack', stage: 'island', timeout: 150000, settle: 1200,
      title: 'Steady (restated M1a): a hairline breath meter under the reticle drains while it is held and is released after; no veil element, no full-screen overlay, no desaturation',
      assert: A71D_STEADY,
    },
  },
];
