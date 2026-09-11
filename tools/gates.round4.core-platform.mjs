/**
 * Round 4 lane gates — `core-platform`.
 *
 * The lane's §4 gates (A20, A20b, A21, A22, V20) live in tools/gates.config.mjs
 * where they were written in Wave 0. This file holds what Wave 0's judge asked
 * for afterwards; the runner merges every tools/gates.round4.*.mjs into the
 * suite, so nothing here needs another lane's file.
 *
 * Same contract as gates.config.mjs: `assert` runs in page context with
 * __CTX__/__GAME__ and resolves { pass, detail }. pass === null is PENDING.
 */

/**
 * A22b-fov-recompile — the studio FOV slider must never black-screen the game.
 *
 * WHAT BROKE. OutputGradePass is one fullscreen pass that tonemaps, encodes to
 * sRGB and grades. three injects <tonemapping_pars_fragment> into a
 * ShaderMaterial's prefix by itself when material.toneMapped is true AND the
 * pass happens to be the one writing to the canvas — so the shader compiled
 * fine mid-chain and failed with "function already has a body" the moment it
 * rendered to screen, and the same double-injection hazard sits on the
 * colorspace include. The pass recompiles whenever the renderer's tone mapping
 * or output colour space changes, i.e. exactly when somebody drags a camera
 * control in the studio: the FOV slider produced a black frame and a console
 * full of GLSL errors.
 *
 * WHAT THIS GATE ASSERTS, per FOV: zero console errors (the runner fails on
 * console.error too, this counts them in-page so the detail names them), and
 * the COMPOSITED frame is not a flat colour — a 64x64 downsample of the WebGL
 * canvas taken inside engine.onAfterRender (same task as the render, so the
 * drawing buffer is intact without preserveDrawingBuffer) must have luminance
 * stddev > 8. A black screen, a white screen and a screen of flat sky all read
 * ~0 and all fail. Two extra teeth beyond the spec, neither of which can
 * weaken it: the two FOVs must produce DIFFERENT images (a frozen or blank
 * canvas would otherwise pass both), and the last phase invalidates the grade
 * pass's define cache so the material genuinely RECOMPILES while it is the
 * pass writing to the canvas — the literal failing path.
 */
const A22B = `(async () => {
  const ctx = __CTX__, e = ctx.engine;
  const studio = ctx.studio;
  if (!studio || !e || !e.grade) {
    return { pass: null, detail: 'SKIP: ctx.studio or engine.grade missing — nothing to regress' };
  }

  // ---- count console errors in-page (pass-through: the runner still sees them) ----
  const errs = [];
  const realErr = console.error;
  console.error = function (...a) { errs.push(a.map(String).join(' ').slice(0, 200)); return realErr.apply(console, a); };
  const onErr = (ev) => errs.push('window.onerror: ' + String(ev.message || ev));
  window.addEventListener('error', onErr);
  const hooks0 = e.hookErrorCount || 0;
  const sys0 = (__GAME__.systemErrors || []).length;

  const waitFrames = async (n) => {
    const f0 = e.frames;
    while (e.frames - f0 < n) await new Promise(r => requestAnimationFrame(r));
  };

  /**
   * One 64x64 downsample of the live canvas, taken inside the render task.
   * Returns mean/stddev of Rec.709 luminance plus the raw signature so two
   * phases can be compared.
   */
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
        const sd = Math.sqrt(Math.max(0, sum2 / 4096 - mean * mean));
        out = { mean: +mean.toFixed(2), stddev: +sd.toFixed(2), sig,
                canvasPx: src.width + 'x' + src.height };
      } catch (err) {
        out = { mean: null, stddev: null, sig: null, error: String((err && err.message) || err) };
      }
      resolve(out);
    };
    e.onAfterRender.push(hook);
  });

  const phases = [];
  let restore = null;
  try {
    // Frame something with content in it: the spawn vista, level horizon. A
    // camera buried in the ground or pointed at flat sky would read as a flat
    // colour for honest reasons and tell us nothing about the shader.
    ctx.state = 'playing';
    const p = ctx.player;
    p.position.set(0, 0, 0); p.camYaw = Math.PI; p.camPitch = 0.02;
    if (p._snapToGround) p._snapToGround();
    await waitFrames(4);

    studio.enter();
    if (!studio.active) return { pass: false, detail: 'studio.enter() did not activate (state=' + ctx.state + ')' };
    restore = () => { try { studio.exit(); } catch (err) { /* leaving anyway */ } };
    await waitFrames(4);

    const phase = async (label, fov, prepare) => {
      const before = errs.length;
      if (prepare) prepare();
      studio._fov = fov;
      await waitFrames(6);                    // the spec's six frames
      const shot = await sampleFrame();
      phases.push({
        label, fov, cameraFov: +ctx.camera.fov.toFixed(2),
        mean: shot.mean, stddev: shot.stddev, readbackError: shot.error || null,
        consoleErrors: errs.slice(before),
        sig: shot.sig,
      });
    };

    await phase('fov-25', 25);
    await phase('fov-80', 80);
    // The literal recompile path: drop the pass's define cache so the next
    // render rebuilds material.defines and relinks the program while this pass
    // is the one writing to the canvas. That is where the double-injected
    // tonemap/colorspace chunks blew up.
    await phase('fov-55-forced-recompile', 55, () => {
      e.grade._tm = null; e.grade._cs = null;
      e.grade.material.needsUpdate = true;
    });
  } finally {
    if (restore) restore();
    console.error = realErr;
    window.removeEventListener('error', onErr);
  }

  // Two different focal lengths on the same scene cannot produce the same
  // image; if they do, the canvas is stale or empty and the stddev proved
  // nothing.
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
    verdict: pass ? 'PASS: every FOV composited a real frame with no errors'
      : 'FAIL: ' + [flat.length && 'flat frame at ' + flat.map((f) => f.label).join(','),
                    noisy.length && 'console errors at ' + noisy.map((f) => f.label).join(','),
                    !fovApplied && 'camera.fov did not follow studio._fov',
                    (fovDiff != null && fovDiff <= 2) && 'fov 25 and 80 rendered the same image (diff '
                      + fovDiff + ') — the canvas is stale',
                    hookErrors && 'engine hook errors ' + hookErrors,
                    sysErrors && 'quarantined system errors ' + sysErrors].filter(Boolean).join(' + '),
    phases, fovMeanAbsDiff: fovDiff, stddevFloor: 8,
    consoleErrors: errs.slice(0, 8), hookErrors, sysErrors,
    grade: { pass: e.grade.constructor.name, enabled: e.grade.enabled,
             defines: Object.keys(e.grade.material.defines || {}) },
    composerPasses: e.composer.passes.map((x) => x.constructor.name),
  } };
})()`;

export const GATES = [
  {
    id: 'A22b-fov-recompile', kind: 'action', lane: 'core-platform',
    title: 'Studio FOV changes never black-screen the composite: no console errors, frame is not a flat colour, and a forced grade-pass recompile survives',
    settle: 1200, timeout: 60000,
    assert: A22B,
  },
];
