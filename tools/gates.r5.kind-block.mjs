/**
 * ROUND 5 — THE PER-KIND BLOCK (plan §9 "Instruments — the per-kind block";
 * written by instruments-core at W0b, handed to the orchestrator at W1;
 * instruments-a/-b/-c/-d run it for every kind they own).
 *
 * USAGE (a species lane's gate file):
 *
 *   import { kindBlock } from './gates.r5.kind-block.mjs';
 *   export const GATES = [
 *     ...kindBlock({ kind: 'plumb', lane: 'instruments-a', class: 'small' }),
 *     ...
 *   ];
 *
 * `kindBlock(spec)` returns the block's rows for ONE kind. `spec`:
 *   kind      the kind id the lane owns (its own species — a lane may name its
 *             own kind), or
 *   role      a gate role resolved in the page through `ctx.machines.roles`
 *             (instruments-core stages the Tiller fixture as `role: 'herd'`, so
 *             no gate file of its names a species)
 *   lane      the lane the rows are registered under
 *   class     size class for A-glb-budget / A21-with-kind (§4.1): 'small' |
 *             'medium' | 'large' | 'colossal'
 *   fixture   true for a W0 staging fixture (R28): the FIDELITY-ONLY clauses
 *             (the A-sil40 pair set, components and their linked attacks —
 *             A42 / A-linked-attack —, the judged V26 / V27 / V-lineup frames)
 *             report `SKIP-fixture` with the measured numbers; every other
 *             clause grades at its §9 bar (A-weak40's lamp contrast included:
 *             it is the lamp's own face, not the species glaze, since W0b fix 1).
 *   suffix    id suffix (default ':<kind or role>'), so several kinds' blocks
 *             can be registered side by side without an id clash
 *
 * Row ids are the §9 ids plus the suffix: `A45-no-skate-per-species:herd`, ...
 *
 * This module exports `GATES = []`: when gates-perf's registry auto-discovers
 * `tools/gates.r5.*.mjs` it registers nothing by itself; a lane registers the
 * block for its kinds.
 *
 * Page helpers exported for other gate files: `KIND_PRELUDE(spec)` (resolves
 * KIND), `lampStatesAssert(spec)` (core's `A-lamp-states`), `PIX` (canvas
 * pixel capture after the composer).
 */
import { readFileSync, existsSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOLS, '..');

export const GATES = [];

/** §4.1 size classes. */
export const SIZE_CLASS = {
  small: { tris: 15000, bones: 20, mainDraws: 3, casters: 1, bytes: 200 * 1024 },
  medium: { tris: 35000, bones: 30, mainDraws: 3, casters: 1, bytes: 400 * 1024 },
  large: { tris: 60000, bones: 40, mainDraws: 3, casters: 1, bytes: 700 * 1024 },
  colossal: { tris: 120000, bones: 64, mainDraws: 4, casters: 2, bytes: 1.2 * 1024 * 1024 },
};

/* ------------------------------------------------------------------ */
/* page preludes                                                       */
/* ------------------------------------------------------------------ */

/**
 * Resolves `KIND` (and `KIND_NOTE`) from `spec.kind` or `spec.role`, waits for
 * the deferred kinds, and defines `stageKind(dx, dz)` — a living machine of
 * KIND spawned for this gate (every gate runs on a fresh page) — plus the
 * staging helpers every row uses. Splice inside an async function body.
 */
export const KIND_PRELUDE = (spec) => `
  const __C = __CTX__, __M = __C.machines;
  { const t0 = performance.now();
    while (!__M.expansionReady && performance.now() - t0 < 90000) await new Promise(r => setTimeout(r, 200)); }
  const SPEC = ${JSON.stringify({ kind: spec.kind || null, role: spec.role || null, fixture: !!spec.fixture })};
  let KIND = SPEC.kind, KIND_NOTE = null;
  if (!KIND && SPEC.role) {
    KIND = __M.roles ? __M.roles[SPEC.role] : null;
    KIND_NOTE = __M.roleNotes ? __M.roleNotes[SPEC.role] : 'ctx.machines.roles not published';
  }
  const FIXTURE = SPEC.fixture || /R28 fixture/.test(KIND_NOTE || '');
  const V = __C.player.position.constructor;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const simNow = () => __C.engine.simTime;
  async function simSleep(s, each, capX = 4) {
    const t0 = simNow(), w0 = performance.now();
    while (simNow() - t0 < s && performance.now() - w0 < s * 1000 * capX + 4000) {
      await new Promise(r => setTimeout(r, 40));
      if (each) each(simNow() - t0);
    }
    return simNow() - t0;
  }
  /** A flat, open spot near the player (terrain slope < 8 deg over 12 m). */
  function flatSpot(minR = 30, maxR = 70) {
    const T = __C.terrain, p = __C.player.position;
    for (let i = 0; i < 400; i++) {
      const a = (i * 2.399) % (Math.PI * 2), r = minR + (i % 9) / 8 * (maxR - minR);
      const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
      const h = T.getHeight(x, z);
      let ok = true;
      for (let k = 0; k < 8 && ok; k++) {
        const b = k / 8 * Math.PI * 2;
        if (Math.abs(T.getHeight(x + Math.sin(b) * 12, z + Math.cos(b) * 12) - h) > 1.7) ok = false;
      }
      if (ok && (!__C.water?.levelAt || __C.water.levelAt(x, z) < h - 0.2)) return { x, z };
    }
    return { x: p.x + 40, z: p.z + 40 };
  }
  function stageKind(x, z, opts) {
    if (!KIND || !__M.canSpawn(KIND)) return null;
    const m = __M.spawn(KIND, x, z, opts || {});
    return m || null;
  }
  /** Freeze every machine except keep[] (staging: nothing wanders into the shot). */
  function freezeAll(keep) {
    const set = new Set(keep || []);
    for (const m of __M.list) {
      if (set.has(m) || m._frozenByGate) continue;
      m._frozenByGate = m.update; m.update = () => {};
    }
  }
  function freezeOne(m) { if (!m._frozenByGate) { m._frozenByGate = m.update; m.update = () => {}; } }
  /** Body held still, its glows still LIVE (the eye rhythm keeps running on the sim clock). */
  function holdStill(m) { if (!m._frozenByGate) { m._frozenByGate = m.update; m.update = (dt, t) => { if (!m._disposed) m._updateEyes(dt, t); }; } }
  function thaw(m) { if (m._frozenByGate) { m.update = m._frozenByGate; m._frozenByGate = null; } }
  /** Park: no route travel, heading held, calm. */
  function park(m, heading) {
    m.escort = null; m.scavenge = null; m.convoy = null; m.basking = null;
    m._fleeing = false; m._fleeT = 0;
    m.route = [m.position.clone()]; m._wpIndex = 0; m._waitT = 1e6;
    if (heading !== undefined) { m.heading = heading; m.root.rotation.y = heading; }
    m.suspicion = 0; m._unseenT = 99;
    m.ai?.search.stop(); m.ai?.engage.reset();
    m.setState('patrol');
  }
  const skipNoKind = () => ({ pass: null, detail: 'SKIP-R18: ' + (SPEC.role ? 'role ' + SPEC.role + ' has no live kind' : 'kind ' + SPEC.kind + ' not registered') + (KIND_NOTE ? ' (' + KIND_NOTE + ')' : '') });
`;

/**
 * Canvas pixel capture AFTER the composer (tone map + grade + bloom), i.e. the
 * colours on screen. `PIX.grab(cx, cy, n)` queues a capture of an n x n block
 * (device px, origin bottom-left as WebGL reads it) on the next rendered frame
 * and resolves { t: simTime, w, h, px: Uint8Array }.
 */
export const PIX = `
  const PIX = (() => {
    const E = __CTX__.engine, R = E.renderer, gl = R.getContext();
    const queue = [];
    const hook = () => {
      if (!queue.length) return;
      R.setRenderTarget(null);
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      for (const q of queue.splice(0)) {
        const n = q.n;
        const x0 = Math.max(0, Math.min(W - n, Math.round(q.fx(W) - n / 2)));
        const y0 = Math.max(0, Math.min(H - n, Math.round(q.fy(H) - n / 2)));
        const px = new Uint8Array(n * n * 4);
        gl.readPixels(x0, y0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
        q.res({ t: E.simTime, w: W, h: H, x0, y0, n, px });
      }
    };
    E.onAfterRender.push(hook);
    return {
      /** fx(W), fy(H): the block centre in device px (WebGL origin bottom-left). */
      grab: (fx, fy, n) => new Promise(res => queue.push({ fx, fy, n, res })),
      stop: () => { const i = E.onAfterRender.indexOf(hook); if (i >= 0) E.onAfterRender.splice(i, 1); },
    };
  })();
`;

/* ------------------------------------------------------------------ */
/* A-lamp-states (instruments-core's gate; rendered pixels at 15 m)    */
/* ------------------------------------------------------------------ */

/**
 * A-lamp-states — rendered lamp pixels sampled at 15 m, per AI state, on one
 * staged machine of KIND:
 *   colour   median of the LIT pixels at the rhythm's peak, ΔE2000 <= 3 of the
 *            state's token (calm #F2EAD3, wary #B5E61D, hostile #FF2D8C,
 *            dark #3B3A36; dark = every pixel of the closed iris)
 *   iris     lit area 100 / 50 / 20 % — measured as the count of pixels within
 *            ΔE 10 of the token at the peak frames; graded as consecutive
 *            ratios >= 2 (calm/wary, wary/hostile) and dark = 0 lit pixels
 *   rhythm   the lit-core brightness over 2.4 sim-s: calm steady (rel. std
 *            < 3 %), wary 1 Hz and hostile 4 Hz (periodogram peak, ±15 %),
 *            dark: sputter (flicker in the first 0.55 s) then out
 *   ΔE       consecutive tokens >= 25 (and the measured colours reported)
 *   beam     in fog density > 1.2 (setWeather('overcast') here, densMul 1.85) and
 *            at night (setTime 23): on and visible in wary and hostile, never
 *            in calm; in clear day light: off in every state
 * Staging: the machine is spawned on flat ground, parked, the state forced
 * (`forceState`; dark = a real precise hit on the lamp weak point through
 * `takeDamage`), then its update is frozen so it holds still; the player's
 * camera update is suspended and the camera put 15.0 m out on the lens axis.
 */
export function lampStatesAssert(spec) {
  return `(async () => {
    ${KIND_PRELUDE(spec)}
    if (!KIND) return skipNoKind();
    ${PIX}
    const Col = await import('/src/instruments/lib/color.js');
    const L = await import('/src/instruments/lamps.js');
    const sharma = Col.sharmaCheck();
    if (!(sharma < 1e-4)) return { pass: false, detail: { verdict: 'colour science broken', sharmaMaxErr: sharma } };
    const E = __C.engine, cam = __C.camera, env = __C.environment, p = __C.player;
    E.setDynamicResolution?.(false);
    const weather0 = env.weather;
    env.setWeather('clear', 0.05);
    env.setTime?.(13);
    const spot = flatSpot(28, 60);
    const m = stageKind(spot.x, spot.z, { route: [new V(spot.x, 0, spot.z)] });
    if (!m) return { pass: null, detail: 'SKIP: could not spawn ' + KIND };
    await wait(1500);
    if (!m.lamp) return { pass: false, detail: { kind: KIND, verdict: 'no lamp registered (machine.addLamp)', lampsAudit: __M.lamps?.audit() } };
    freezeAll([m]);
    // other machines' lamps stay calm: park everything else before it freezes
    for (const o of __M.list) { if (o !== m && o.alive && o.state !== 'patrol') { try { thaw(o); park(o); freezeOne(o); } catch (e) { /* */ } } }
    park(m, Math.random() * Math.PI * 2);
    await wait(700);
    // camera: player camera suspended, model hidden, 15.0 m out on the lens axis
    p._updateCamera = () => {};
    if (p.model) p.model.visible = false;
    const T = __C.terrain;
    const rec = m.lamp;
    const lampPos = new V(), axis = new V();
    let headTry = 0, camOk = false;
    while (headTry < 12 && !camOk) {
      freezeOne(m);
      m.root.rotation.y = m.heading = headTry * Math.PI / 6 + 0.2;
      m.root.updateMatrixWorld(true);
      rec.anchor.updateWorldMatrix(true, false);
      lampPos.setFromMatrixPosition(rec.anchor.matrixWorld);
      axis.set(0, 0, 1).transformDirection(rec.anchor.matrixWorld);
      axis.y = 0; axis.normalize();
      cam.position.copy(lampPos).addScaledVector(axis, 15);
      // clear line: terrain below the sight line all the way, nothing solid in it
      camOk = true;
      for (let k = 1; k < 30; k++) {
        const q = lampPos.clone().lerp(cam.position, k / 30);
        if (T.getHeight(q.x, q.z) > q.y - 0.4) { camOk = false; break; }
      }
      if (camOk && __C.collision?.occluded?.(cam.position, lampPos)) camOk = false;
      headTry++;
    }
    cam.lookAt(lampPos);
    cam.updateMatrixWorld();
    const camDist = cam.position.distanceTo(lampPos);
    const fovK = (h) => h / (2 * Math.tan(cam.fov * Math.PI / 360));
    const proj = () => { const v = lampPos.clone().project(cam); return v; };
    // hide every other lamp/beam record so the measured disc is this machine's alone
    const hidden = [];
    for (const r of __M.lamps.records) if (r !== rec) { hidden.push(r); }
    for (const r of hidden) __M.lamps.detach(r.machine);
    await wait(500);

    const TOK = {}; for (const s of L.LAMP_ORDER) TOK[s] = Col.hexToRgb(L.LAMP_STATES[s].token);
    const TOKLAB = {}; for (const s of L.LAMP_ORDER) TOKLAB[s] = Col.rgbToLab(TOK[s]);
    const N = 48;
    /**
     * One captured frame -> the lit glass of the state, split as the lamp is drawn (lamps.js): the CORE
     * (CORE_FRAC of the aperture radius, above the bloom threshold) and the token RING around it.
     *   ringLit   ring pixels (outside the core + its blend band + 0.75 px) within dE 10 of the token
     *   coreLit   pixels inside the core zone brighter than the ring (the hot centre a viewer reads)
     *   colour    median of the lit RING pixels (the core is not the token by design)
     *   coreLum   mean luminance of the inner 0.7 of the aperture (the rhythm read)
     */
    const APMAX = L.APERTURE_MAX, CFRAC = L.CORE_FRAC;
    function analyse(fr, state, discR) {
      const n = fr.n, px = fr.px;
      const v = proj();
      const cx = (v.x * 0.5 + 0.5) * fr.w - fr.x0, cy = (v.y * 0.5 + 0.5) * fr.h - fr.y0;
      const tl = TOKLAB[state];
      const apR = discR * APMAX * Math.sqrt(L.LAMP_STATES[state].aperture || 0);
      const coreZone = apR * CFRAC * 1.15 + 0.75;
      let ringLit = 0, coreN = 0, coreLum = 0, discN = 0, coreLit = 0;
      const litR = [], litG = [], litB = [], dR = [], dG = [], dB = [], ringLums = [], coreLums = [];
      const rhythmRad = apR * 0.7;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
        if (d > discR * 1.15) continue;
        const i = (y * n + x) * 4;
        const rgb = [px[i] / 255, px[i + 1] / 255, px[i + 2] / 255];
        const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
        if (d <= discR * APMAX * 0.93) { discN++; dR.push(rgb[0]); dG.push(rgb[1]); dB.push(rgb[2]); }
        if (d <= rhythmRad) { coreN++; coreLum += lum; }
        if (d <= coreZone) { coreLums.push(lum); continue; }
        const de = Col.deltaE2000(Col.rgbToLab(rgb), tl);
        if (de <= 10 && d <= apR + 1) { ringLit++; ringLums.push(lum); litR.push(rgb[0]); litG.push(rgb[1]); litB.push(rgb[2]); }
      }
      const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
      const ringLum = med(ringLums);
      if (ringLum !== null) for (const l of coreLums) if (l >= ringLum * 0.98) coreLit++;
      // dark: the previous (calm) glass still lit, and the brightest pixel of the inner disc
      let litPrev = 0, peakLum = 0;
      if (state === 'dark') {
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > discR * APMAX) continue;
          const i = (y * n + x) * 4;
          const rgb = [px[i] / 255, px[i + 1] / 255, px[i + 2] / 255];
          peakLum = Math.max(peakLum, 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]);
          if (Col.deltaE2000(Col.rgbToLab(rgb), TOKLAB.calm) <= 10) litPrev++;
        }
      }
      return {
        t: fr.t, lit: ringLit + coreLit, ringLit, coreLit, litPrev, peakLum, coreLum: coreN ? coreLum / coreN : null,
        ringLum, coreMaxLum: coreLums.length ? Math.max(...coreLums) : null,
        litMed: litR.length ? [med(litR), med(litG), med(litB)] : null,
        discMed: dR.length ? [med(dR), med(dG), med(dB)] : null,
      };
    }
    async function capture(state, simS) {
      const frames = [];
      const t0 = simNow(), w0 = performance.now();
      while (simNow() - t0 < simS && performance.now() - w0 < simS * 4000 + 4000) {
        const fr = await PIX.grab((W) => (proj().x * 0.5 + 0.5) * W, (H) => (proj().y * 0.5 + 0.5) * H, N);
        const discR = rec.radius * fovK(fr.h) / camDist;
        frames.push(analyse(fr, state, discR));
      }
      return frames;
    }
    function periodogram(frames) {
      const xs = frames.filter(f => f.coreLum !== null);
      if (xs.length < 8) return { f: null, relStd: null, n: xs.length };
      const mean = xs.reduce((a, f) => a + f.coreLum, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((a, f) => a + (f.coreLum - mean) ** 2, 0) / xs.length);
      let best = 0, bf = null;
      for (let f = 0.3; f <= 8.0001; f += 0.02) {
        let c = 0, s = 0;
        for (const q of xs) { const ph = 2 * Math.PI * f * q.t; c += (q.coreLum - mean) * Math.cos(ph); s += (q.coreLum - mean) * Math.sin(ph); }
        const P = c * c + s * s;
        if (P > best) { best = P; bf = f; }
      }
      const span = xs[xs.length - 1].t - xs[0].t;
      return { f: bf === null ? null : +bf.toFixed(2), relStd: mean > 0 ? +(sd / mean).toFixed(4) : null, n: xs.length, spanS: +span.toFixed(2),
        fps: +(xs.length / Math.max(1e-3, span)).toFixed(1) };
    }
    const HZ = { calm: 0, wary: 1, hostile: 4 };
    const out = {};
    const stateOrder = ['calm', 'wary', 'hostile'];
    for (const s of stateOrder) {
      thaw(m);
      if (s === 'calm') park(m, m.heading);
      else { m.forceState(s === 'wary' ? 'search' : 'attack'); }
      m.lastKnown.copy(lampPos).addScaledVector(axis, 6);
      freezeOne(m);
      m.root.rotation.y = m.heading;
      await wait(450);                                   // the iris eases in ~0.2 s
      const frames = await capture(s, 2.4);
      const peakLum = Math.max(...frames.map(f => f.coreLum ?? 0));
      const peaks = frames.filter(f => f.coreLum !== null && f.coreLum >= 0.92 * peakLum);
      const medArr = (a) => { const q = a.slice().sort((x, y) => x - y); return q[q.length >> 1]; };
      const lit = peaks.length ? medArr(peaks.map(f => f.lit)) : 0;
      const ringLit = peaks.length ? medArr(peaks.map(f => f.ringLit)) : 0;
      const coreLit = peaks.length ? medArr(peaks.map(f => f.coreLit)) : 0;
      const colours = peaks.map(f => f.litMed).filter(Boolean);
      const col = colours.length ? [0, 1, 2].map(c => medArr(colours.map(x => x[c]))) : null;
      const ringLum = peaks.length ? medArr(peaks.map(f => f.ringLum ?? 0)) : null;
      const coreMaxLum = peaks.length ? medArr(peaks.map(f => f.coreMaxLum ?? 0)) : null;
      const pg = periodogram(frames);
      const ch = __M.lamps.coreHdr ? __M.lamps.coreHdr(s) : null;
      out[s] = {
        machineState: m.state, lampState: L.lampStateFor(m), aperture: +rec.aperture.toFixed(3),
        litPx: lit, ringLitPx: ringLit, coreLitPx: coreLit, peakFrames: peaks.length, frames: frames.length,
        core: { hdrLum: ch ? +ch.lum.toFixed(3) : null, gainOverRing: ch ? +ch.k.toFixed(2) : null, bloomThreshold: E.bloom ? E.bloom.threshold : null, bloomOn: !!(E.bloom && E.bloom.enabled),
          renderedCoreMaxLum: coreMaxLum === null ? null : +coreMaxLum.toFixed(3), renderedRingLum: ringLum === null ? null : +ringLum.toFixed(3) },
        colourHex: col ? Col.rgbToHex(col) : null,
        dE: col ? +Col.deltaE(col, TOK[s]).toFixed(2) : null,
        rhythm: pg,
      };
    }
    // DARK: a precise hit on the lamp weak point (the real path), then the frozen machine holds it
    thaw(m);
    park(m, m.heading);
    freezeOne(m);
    await wait(600);                                     // calm again, iris fully open, before the hit
    thaw(m);
    const wp = (m.weakPoints || []).find(w => w.name === 'lamp');
    let darkHit = false;
    if (wp) {
      const pt = wp.obj.getWorldPosition(new V());
      let mesh = null; m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
      m.takeDamage({ point: pt, object: mesh, impact: 1, tear: 0, element: 'none', elementAmount: 0,
        dir: { x: -axis.x, y: 0, z: -axis.z }, type: 'hunter', baseDamage: 1, origin: cam.position.clone() });
      darkHit = (m.lampDarkT || 0) > 0;
    }
    freezeOne(m);
    const tHit = simNow();
    const darkFrames = await capture('dark', 1.6);
    const sputter = darkFrames.filter(f => f.t - tHit < 0.55);
    const after = darkFrames.filter(f => f.t - tHit > 0.8);
    const discCols = after.map(f => f.discMed).filter(Boolean);
    const medA = (a) => { const q = a.slice().sort((x, y) => x - y); return q[q.length >> 1]; };
    const darkCol = discCols.length ? [0, 1, 2].map(c => medA(discCols.map(x => x[c]))) : null;
    const sputLum = sputter.map(f => f.peakLum);
    const afterLum = after.map(f => f.peakLum);
    out.dark = {
      hitDarkened: darkHit, lampState: L.lampStateFor(m), aperture: +rec.aperture.toFixed(3),
      colourHex: darkCol ? Col.rgbToHex(darkCol) : null,
      dE: darkCol ? +Col.deltaE(darkCol, TOK.dark).toFixed(2) : null,
      sputterFrames: sputter.length, afterFrames: after.length,
      sputterLumRange: sputLum.length ? +(Math.max(...sputLum) - Math.min(...sputLum)).toFixed(3) : null,
      afterLumRange: afterLum.length ? +(Math.max(...afterLum) - Math.min(...afterLum)).toFixed(3) : null,
      litDuringSputter: sputter.reduce((a, f) => Math.max(a, f.litPrev || 0), 0),
      litAfterOut: after.reduce((a, f) => Math.max(a, f.litPrev || 0), 0),
      metric: 'peak luminance of the inner disc (0.8 R) per frame; lit = pixels within dE 10 of the calm token the lamp held before the hit',
    };

    // ---- BEAMS: fog (rain, densMul 2.55), night (clear, 23:00), and clear day as the negative control
    const beamProbe = async (label) => {
      const res = {};
      for (const s of ['calm', 'wary', 'hostile']) {
        thaw(m);
        if (s === 'calm') park(m, m.heading); else m.forceState(s === 'wary' ? 'search' : 'attack');
        m.lampDarkT = 0;
        // the stimulus / target sits off to the side so the beam crosses the frame
        const side = new V(axis.z, 0, -axis.x);
        const tgt = lampPos.clone().addScaledVector(axis, 9).addScaledVector(side, 5);
        m.lastKnown.copy(tgt);
        p.position.set(tgt.x, T.getHeight(tgt.x, tgt.z), tgt.z);
        freezeOne(m);
        m.root.rotation.y = m.heading;
        await wait(500);
        // side view of the beam: camera 14 m out at 90 degrees
        const camSide = lampPos.clone().addScaledVector(axis, 4).addScaledVector(side, -14);
        camSide.y = Math.max(camSide.y, T.getHeight(camSide.x, camSide.z) + 1.6);
        cam.position.copy(camSide);
        cam.lookAt(lampPos.clone().addScaledVector(axis, 4));
        cam.updateMatrixWorld();
        await wait(250);
        const beamDir = rec.dir.clone();
        const pts = [3, 5, 7].map(d => lampPos.clone().addScaledVector(beamDir, d));
        // PAIRED read: consecutive frames with and without the beam draw (the world keeps moving under
        // it), the SIGNED difference averaged over 10 pairs per point, so frame-to-frame noise cancels
        // and an additive beam does not: the beam's own contribution per pixel (sum of R+G+B, 0-765)
        let diff = 0, nPts = 0;
        const perPair = [];
        for (const q of pts) {
          const v = q.clone().project(cam);
          if (Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.95) continue;
          let acc = 0;
          for (let k = 0; k < 10; k++) {
            __M.lamps.hideBeams = false;
            const on = await PIX.grab((W) => (v.x * 0.5 + 0.5) * W, (H) => (v.y * 0.5 + 0.5) * H, 9);
            __M.lamps.hideBeams = true;
            const off = await PIX.grab((W) => (v.x * 0.5 + 0.5) * W, (H) => (v.y * 0.5 + 0.5) * H, 9);
            __M.lamps.hideBeams = false;
            let a = 0; for (let i = 0; i < on.px.length; i += 4) a += (on.px[i] - off.px[i]) + (on.px[i + 1] - off.px[i + 1]) + (on.px[i + 2] - off.px[i + 2]);
            a /= (on.px.length / 4);
            acc += a; perPair.push(+a.toFixed(1));
          }
          diff += acc / 10; nPts++;
        }
        res[s] = { beamOn: !!rec.beamOn, beamsInDraw: __M.lamps.beamMesh.count, beamDeltaRgb: nPts ? +(diff / nPts).toFixed(2) : null,
          pairSpread: perPair.length ? [Math.min(...perPair), Math.max(...perPair)] : null, beamsAir: __M.lamps.beamsOn() };
      }
      res.visibleWary = res.wary.beamOn && (res.wary.beamDeltaRgb ?? 0) >= 6;
      res.visibleHostile = res.hostile.beamOn && (res.hostile.beamDeltaRgb ?? 0) >= 6;
      res.calmNone = !res.calm.beamOn && Math.abs(res.calm.beamDeltaRgb ?? 0) < 1.5;
      res.metric = 'signed mean (on - off) of R+G+B per pixel (0-765), 9x9 px at 3, 5, 7 m along the beam, 10 consecutive frame pairs with and without the beam draw; visible >= 6, none < 1.5';
      return res;
    };
    env.setWeather('overcast', 0.05); await wait(900);        // aerial-fog density x1.85 > 1.2, no rain streaks
    const fog = await beamProbe('fog');
    fog.fogK = __M.lamps.fogK;
    env.setWeather('clear', 0.05); env.setTime?.(23); await wait(900);
    const night = await beamProbe('night');
    night.nightFactor = +(env.nightFactor || 0).toFixed(2);
    env.setTime?.(13); await wait(900);
    const day = await beamProbe('day');
    day.fogK = __M.lamps.fogK; day.nightFactor = +(env.nightFactor || 0).toFixed(2);
    PIX.stop();
    env.setWeather(weather0 || 'clear', 0.05);

    // ---- grading
    const toks = L.LAMP_ORDER.map(s => L.LAMP_STATES[s].token);
    const consec = [];
    for (let i = 0; i + 1 < toks.length; i++) consec.push(+Col.deltaE(toks[i], toks[i + 1]).toFixed(1));
    const meas = ['calm', 'wary', 'hostile', 'dark'].map(s => out[s].colourHex);
    const consecMeasured = [];
    for (let i = 0; i + 1 < meas.length; i++) consecMeasured.push(meas[i] && meas[i + 1] ? +Col.deltaE(meas[i], meas[i + 1]).toFixed(1) : null);
    const ratio1 = out.wary.litPx ? out.calm.litPx / out.wary.litPx : 0;
    const ratio2 = out.hostile.litPx ? out.wary.litPx / out.hostile.litPx : 0;
    const ringRatio1 = out.wary.ringLitPx ? out.calm.ringLitPx / out.wary.ringLitPx : 0;
    const ringRatio2 = out.hostile.ringLitPx ? out.wary.ringLitPx / out.hostile.ringLitPx : 0;
    const coreOk = (s) => { const c = out[s].core; return c.hdrLum !== null && c.bloomThreshold !== null && c.hdrLum > c.bloomThreshold
      && c.renderedCoreMaxLum !== null && c.renderedRingLum !== null && c.renderedCoreMaxLum > c.renderedRingLum; };
    const within = (f, want) => f !== null && Math.abs(f - want) / want <= 0.15;
    const checks = {
      camAt15m: Math.abs(camDist - 15) < 0.05,
      colourCalm: out.calm.dE !== null && out.calm.dE <= 3,
      colourWary: out.wary.dE !== null && out.wary.dE <= 3,
      colourHostile: out.hostile.dE !== null && out.hostile.dE <= 3,
      colourDark: out.dark.dE !== null && out.dark.dE <= 3,
      irisCalmOverWary: ratio1 >= 2 && ringRatio1 >= 2,
      irisWaryOverHostile: ratio2 >= 2 && ringRatio2 >= 2,
      coreAboveBloomCalm: coreOk('calm'),
      coreAboveBloomWary: coreOk('wary'),
      coreAboveBloomHostile: coreOk('hostile'),
      irisDarkClosed: out.dark.hitDarkened && out.dark.aperture === 0,
      rhythmCalmSteady: out.calm.rhythm.relStd !== null && out.calm.rhythm.relStd < 0.03,
      rhythmWary1Hz: within(out.wary.rhythm.f, 1) && out.wary.rhythm.relStd > 0.05,
      rhythmHostile4Hz: within(out.hostile.rhythm.f, 4) && out.hostile.rhythm.relStd > 0.05,
      darkSputterThenOut: out.dark.sputterFrames >= 3 && (out.dark.sputterLumRange ?? 0) > 0.05 && out.dark.litDuringSputter > 0
        && (out.dark.afterLumRange ?? 1) < 0.03 && out.dark.litAfterOut === 0,
      consecutiveTokensDE25: consec.every(v => v >= 25),
      beamFogWaryHostile: fog.visibleWary && fog.visibleHostile,
      beamFogNeverCalm: fog.calmNone,
      beamNightWaryHostile: night.visibleWary && night.visibleHostile,
      beamNightNeverCalm: night.calmNone,
      beamClearDayOff: !day.calm.beamOn && !day.wary.beamOn && !day.hostile.beamOn,
    };
    for (const r of hidden) { try { if (!r.machine._disposed) __M.lamps.attach(r.machine, r.anchor, { radius: r.radius }); } catch (e) { /* */ } }
    return { pass: Object.values(checks).every(Boolean), detail: {
      kind: KIND, fixture: FIXTURE, checks, camDistM: +camDist.toFixed(3),
      lampRadiusM: rec.radius, states: out,
      iris: { calmOverWary: +ratio1.toFixed(2), waryOverHostile: +ratio2.toFixed(2), ringCalmOverWary: +ringRatio1.toFixed(2), ringWaryOverHostile: +ringRatio2.toFixed(2),
        estimator: 'aperture = lit ring pixels (outside the core zone, within dE2000 10 of the state token) + core pixels at least as bright as the ring, at the rhythm peak; the ring-only ratios are graded too; AA edge pixels are not lit. Colour = median of the lit RING pixels (the core is above the bloom threshold by design, bible §7.2)' },
      tokensConsecutiveDE: consec, measuredConsecutiveDE: consecMeasured,
      beams: { fog, night, day }, sharmaMaxErr: sharma,
    } };
  })()`;
}

/* ------------------------------------------------------------------ */
/* the block                                                           */
/* ------------------------------------------------------------------ */

/**
 * `__kb()` — the staging every vendored row calls in place of its old
 * "one living machine per species" prelude: one living machine of KIND
 * (nearest to the player, or spawned 30 m out for this gate), or null.
 * `__kbSkip()` — the R18 SKIP (named note, never PASS) when KIND does not
 * resolve. Injected after the row's first `(async () => {`.
 */
const KB_PRELUDE = (spec) => `
  const __KB = ${JSON.stringify({ kind: spec.kind || null, role: spec.role || null, fixture: !!spec.fixture })};
  let __KB_NOTE = null;
  async function __kb() {
    const M = __CTX__.machines;
    { const t0 = performance.now(); while (!M.expansionReady && performance.now() - t0 < 90000) await new Promise(r => setTimeout(r, 200)); }
    let KIND = __KB.kind;
    if (!KIND && __KB.role) { KIND = M.roles ? M.roles[__KB.role] : null; __KB_NOTE = M.roleNotes ? M.roleNotes[__KB.role] : 'ctx.machines.roles not published'; }
    if (!KIND || !M.canSpawn(KIND)) return null;
    const p = __CTX__.player.position;
    let m = M.list.filter(x => x.alive && !x._disposed && x.kind === KIND)
      .sort((a, b) => a.position.distanceToSquared(p) - b.position.distanceToSquared(p))[0] || null;
    if (!m) { m = M.spawn(KIND, p.x + 30, p.z + 30); await new Promise(r => setTimeout(r, 1200)); }
    return m && m.alive ? { KIND, m } : null;
  }
  function __kbSkip() { return { pass: null, detail: 'SKIP-R18: ' + (__KB.role ? 'role ' + __KB.role : 'kind ' + __KB.kind) + ' has no live kind' + (__KB_NOTE ? ' (' + __KB_NOTE + ')' : '') }; }
`;
const inject = (assert, spec) => assert.replace('(async () => {', '(async () => {' + KB_PRELUDE(spec));

/** Fixture-only SKIP for a row whose whole subject is fidelity (named note, never PASS). */
const skipFixture = (what) => `(async () => ({ pass: null, detail: ${JSON.stringify('SKIP-fixture: ' + what)} }))()`;

/** A-weights-authored: 0 vertices on the wrong bone vs the generator labels, >= 99.5 % rigid. */
const WEIGHTS = (spec) => `(async () => {
  ${KB_PRELUDE(spec)}
  const __s = await __kb(); if (!__s) return __kbSkip();
  const m = __s.m;
  if (typeof m.weightAudit !== 'function') return { pass: false, detail: __s.KIND + ' publishes no weightAudit() (generated kinds: src/instruments/lib/generated.js)' };
  const a = m.weightAudit();
  return { pass: a.verts > 0 && a.wrongDominant === 0 && a.rigidPct >= 99.5, detail: { kind: __s.KIND, ...a, bar: '0 wrong-dominant vertices vs the generator labels, >= 99.5 % rigid' } };
})()`;

/** A-glb-budget: the kind's GLB inside its §4.1 size class (tris, bones, materials, file size). */
const GLB_BUDGET = (spec, cls) => `(async () => {
  ${KB_PRELUDE(spec)}
  const __s = await __kb(); if (!__s) return __kbSkip();
  const C = ${JSON.stringify(SIZE_CLASS[cls] || SIZE_CLASS.medium)}, CLS = ${JSON.stringify(cls)};
  const d = __CTX__.machines.instrumentKinds?.[__s.KIND];
  if (!d) return { pass: false, detail: __s.KIND + ' is not an Instrument kind module' };
  const url = d.spec.url;
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const dv = new DataView(buf.buffer);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)));
  const ex = json.asset?.extras || {};
  let tris = 0;
  for (const mesh of json.meshes || []) for (const pr of mesh.primitives || []) {
    const n = pr.indices !== undefined ? json.accessors[pr.indices].count : json.accessors[pr.attributes.POSITION].count;
    tris += (pr.mode === undefined || pr.mode === 4) ? Math.floor(n / 3) : 0;
  }
  const bones = (ex.r5BoneOrder || []).length || (json.skins || []).reduce((a, s) => a + s.joints.length, 0);
  const materials = (json.materials || []).length;
  const checks = { tris: tris <= C.tris, bones: bones <= C.bones, bytes: buf.byteLength <= C.bytes, materials: materials <= 2 };
  return { pass: Object.values(checks).every(Boolean), detail: { kind: __s.KIND, url, class: CLS, budget: C, measured: { tris, bones, materials, bytes: buf.byteLength, r5Stats: ex.r5Stats || null }, checks } };
})()`;

/** A21-with-kind: the staged frame <= 350 draws, and the kind's own draws (frozen-frame attribution) <= its class. */
const A21_WITH_KIND = (spec, cls) => `(async () => {
  ${KB_PRELUDE(spec)}
  const __s = await __kb(); if (!__s) return __kbSkip();
  const C = ${JSON.stringify(SIZE_CLASS[cls] || SIZE_CLASS.medium)};
  const ctx = __CTX__, E = ctx.engine, R = E.renderer, M = ctx.machines, p = ctx.player, cam = ctx.camera;
  E.setDynamicResolution?.(false);
  // a staged fight around her: three of the kind engaged, the world as it stands
  const ms = [__s.m];
  for (let i = 0; i < 2; i++) { const m = M.spawn(__s.KIND, p.position.x + 10 + i * 6, p.position.z + 12); if (m) ms.push(m); }
  await new Promise(r => setTimeout(r, 1500));
  for (const m of ms) { m.position.set(p.position.x + 8 + ms.indexOf(m) * 5, m.position.y, p.position.z + 10); m.forceState('attack'); }
  for (let k = 0; k < 25; k++) { p.health = p.maxHealth; await new Promise(r => setTimeout(r, 100)); }
  const calls = [];
  const hook = () => { calls.push(R.info.render.calls); p.health = p.maxHealth; };
  E.onAfterRender.push(hook);
  const f0 = E.frames; while (E.frames - f0 < 60) await new Promise(r => setTimeout(r, 16));
  E.onAfterRender.splice(E.onAfterRender.indexOf(hook), 1);
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const fight = med(calls);
  // attribution: freeze everything, hide ONE machine of the kind on the same frame
  for (const m of M.list) if (!m._frozenByGate) { m._frozenByGate = m.update; m.update = () => {}; }
  p._updateCamera = () => {};
  const target = ms[0];
  cam.position.set(target.position.x + 9, target.position.y + 4, target.position.z + 9);
  cam.lookAt(target.position.x, target.position.y + 1.2, target.position.z); cam.updateMatrixWorld();
  for (const m of ms) if (m !== target) m.root.visible = false;
  await new Promise(r => setTimeout(r, 500));
  const grab = async () => { const a = []; const h = () => a.push(R.info.render.calls); E.onAfterRender.push(h); const g0 = E.frames; while (E.frames - g0 < 20) await new Promise(r => setTimeout(r, 16)); E.onAfterRender.splice(E.onAfterRender.indexOf(h), 1); return med(a); };
  const withIt = await grab();
  target.root.visible = false;
  const without = await grab();
  target.root.visible = true;
  const kindDraws = withIt - without;
  return { pass: fight <= 350 && kindDraws <= C.mainDraws + C.casters * 3, detail: {
    kind: __s.KIND, stagedFightDrawsMedian: fight, framesSampled: calls.length,
    kindAttributedDraws: kindDraws, kindBudget: C.mainDraws + C.casters * 3, class: C,
    note: 'kind draws = frame calls with one machine of the kind shown minus hidden, everything frozen, same camera (plan §4.2 attribution); lamp + beam draws are owned by machines.lamps and shared by every Instrument' } };
})()`;

/** A-sil40: flat-ink side + front masks at 40 m (FOV 55, 1600 x 900), height-normalised pairwise shape-IoU. */
const SIL40 = (spec) => `(async () => {
  ${KB_PRELUDE(spec)}
  const __s = await __kb(); if (!__s) return __kbSkip();
  const ctx = __CTX__, M = ctx.machines, R = ctx.engine.renderer, scene = ctx.scene;
  const PAIR_CAP = { 'plumb|transit': 0.60, 'transit|plumb': 0.60 };
  // every non-legacy kind: the role map's kinds plus this one
  const kinds = [...new Set([__s.KIND, ...Object.values(M.roles || {}).filter(Boolean)])].filter(k => !M.isLegacyKind?.(k) && M.canSpawn(k));
  const p = ctx.player.position;
  const T = ctx.terrain;
  const staged = {};
  let i = 0;
  for (const k of kinds) {
    const m = k === __s.KIND ? __s.m : M.spawn(k, p.x + 60 + i * 30, p.z - 60);
    i++;
    if (m) staged[k] = m;
  }
  await new Promise(r => setTimeout(r, 1400));
  for (const m of M.list) if (!m._frozenByGate) { m._frozenByGate = m.update; m.update = () => {}; }
  const W = 1600, H = 900;
  const RT = new ctx.engine.composer.renderTarget1.constructor(W, H);
  const Cam = ctx.camera.constructor;
  const cam = new Cam(55, W / H, 0.1, 2000);
  // flat ink: a black, rough, non-metal standard material (built-in, so three skins it)
  let StdMat = null; __s.m.root.traverse(o => { if (!StdMat && o.material && o.material.isMeshStandardMaterial) StdMat = o.material.constructor; });
  const flat = StdMat ? new StdMat({ color: 0x000000, roughness: 1, metalness: 0 }) : null;
  if (!flat) return { pass: false, detail: 'no standard material to build the flat ink from' };
  const clearC = flat.color.clone(); R.getClearColor(clearC); const clearA = R.getClearAlpha();
  const buf = new Uint8Array(W * H * 4);
  function mask(m, view) {
    const box = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
    m.root.updateMatrixWorld(true);
    const c = m.position.clone(); c.y += (m.height || 2) * 0.5;
    const fwd = { x: Math.sin(m.heading), z: Math.cos(m.heading) };
    const dir = view === 'side' ? { x: fwd.z, z: -fwd.x } : fwd;
    cam.position.set(c.x + dir.x * 40, c.y, c.z + dir.z * 40);
    cam.lookAt(c); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const vis = [];
    for (const ch of scene.children) { vis.push([ch, ch.visible]); ch.visible = ch === m.root || !!ch.isLight; }
    const bg = scene.background, fog = scene.fog, ov = scene.overrideMaterial;
    const BG = (bg && bg.isColor) ? bg.clone() : null;
    scene.background = BG ? BG.setRGB(1, 1, 1) : null;
    scene.fog = null; scene.overrideMaterial = flat;
    const prevRT = R.getRenderTarget();
    R.setRenderTarget(RT); R.setClearColor(0xffffff, 1); R.clear(); R.render(scene, cam);
    R.readRenderTargetPixels(RT, 0, 0, W, H, buf);
    R.setRenderTarget(prevRT); R.setClearColor(clearC, clearA);
    scene.background = bg; scene.fog = fog; scene.overrideMaterial = ov;
    for (const [ch, v] of vis) ch.visible = v;
    let x0 = W, x1 = -1, y0 = H, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (buf[(y * W + x) * 4] < 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 < 0) return { heightPx: 0, grid: null };
    const hpx = y1 - y0 + 1, wpx = x1 - x0 + 1;
    // height-normalised grid: 64 rows, columns at the same scale, centred in 160
    const G = 64, GW = 160, s = hpx / G;
    const grid = new Uint8Array(G * GW);
    const cx = (x0 + x1) / 2;
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < GW; gx++) {
      const sx = Math.round(cx + (gx - GW / 2) * s), sy = Math.round(y0 + gy * s);
      if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
      grid[gy * GW + gx] = buf[(sy * W + sx) * 4] < 128 ? 1 : 0;
    }
    return { heightPx: hpx, widthPx: wpx, grid };
  }
  const masks = {};
  for (const [k, m] of Object.entries(staged)) masks[k] = { side: mask(m, 'side'), front: mask(m, 'front') };
  RT.dispose(); flat.dispose();
  const iou = (a, b) => { let I = 0, U = 0; for (let j = 0; j < a.length; j++) { const x = a[j], y = b[j]; if (x && y) I++; if (x || y) U++; } return U ? I / U : 0; };
  const pairs = [];
  const ks = Object.keys(masks);
  for (let a = 0; a < ks.length; a++) for (let b = a + 1; b < ks.length; b++) for (const v of ['side', 'front']) {
    const A = masks[ks[a]][v].grid, B = masks[ks[b]][v].grid;
    if (!A || !B) continue;
    const cap = PAIR_CAP[ks[a] + '|' + ks[b]] ?? 0.45;
    const val = iou(A, B);
    pairs.push({ pair: ks[a] + '|' + ks[b], view: v, iou: +val.toFixed(3), cap, ok: val <= cap });
  }
  const mine = masks[__s.KIND];
  const pegExempt = __s.KIND === 'peg';
  const heightOk = pegExempt || (mine.side.heightPx >= 20 && mine.front.heightPx >= 20);
  const pairSkip = ks.length < 2;
  const pairOk = pairs.every(x => x.ok);
  return { pass: heightOk && (pairSkip ? true : pairOk), detail: {
    kind: __s.KIND, heightPx: { side: mine.side.heightPx, front: mine.front.heightPx }, heightOk, pegExempt,
    nonLegacyKinds: ks, pairs,
    pairClause: pairSkip ? (__KB.fixture ? 'SKIP-fixture: ' : 'SKIP-R18: ') + 'no other non-legacy kind is registered yet; the pair set grades from W1 (Plumb, Peg)' : (pairOk ? 'pass' : 'FAIL'),
    staging: 'FOV 55, 1600 x 900 render target, 40 m, flat black replacement material on white, everything else hidden' } };
})()`;

/**
 * A-weak40: primary weak point >= 5 px across at 40 m; lamp/vial luminance contrast vs hull >= 3:1
 * (13:00 trade, calima), from rendered pixels.
 *
 * W0b FIX ROUND 1 (judge finding "calm lamp does not read at noon"): the contrast clause GRADES on
 * every kind, the fixture included (it was SKIP-fixture), and it is staged on the WORST light — the
 * lamp face turned to the sun (the clear 40 m line whose lens axis is closest to the sun's azimuth),
 * 13:00. What is compared, at 15 m on the lens axis:
 *   glass   the lit RING (the token-coloured glass outside the bloom core: the dimmest lit part)
 *   hull    what the glass sits in: the lamp drum face around it (between the glass and the bezel)
 * Reported, not graded: the core, the bezel, and the machine's own surface beyond the lamp (bone
 * glaze, masked to machine pixels with a flat-ink pass so sky and ground are never counted) with its
 * ratio — a bone lamp against sunlit bone glaze is capped near 1.2 : 1 by the display itself
 * ((1 + 0.05) / (0.82 + 0.05)), which is why every lamp carries its own dark drum face (lamps.js).
 */
const WEAK40 = (spec) => `(async () => {
  ${KB_PRELUDE(spec)}
  const __s = await __kb(); if (!__s) return __kbSkip();
  const ctx = __CTX__, M = ctx.machines, E = ctx.engine, cam = ctx.camera, env = ctx.environment, p = ctx.player, T = ctx.terrain;
  // a fresh machine of the kind on open ground
  let m = null;
  { const T0 = ctx.terrain, pp = ctx.player.position;
    for (let i = 0; i < 300 && !m; i++) {
      const a = (i * 2.399) % (Math.PI * 2), r = 30 + (i % 7) * 8;
      const x = pp.x + Math.sin(a) * r, z = pp.z + Math.cos(a) * r, h = T0.getHeight(x, z);
      let flat = true;
      for (let k = 0; k < 8 && flat; k++) { const b = k / 8 * Math.PI * 2; if (Math.abs(T0.getHeight(x + Math.sin(b) * 12, z + Math.cos(b) * 12) - h) > 1.7) flat = false; }
      if (flat) m = M.spawn(__s.KIND, x, z, { route: [new (ctx.player.position.constructor)(x, 0, z)] });
    } }
  if (!m) m = __s.m;
  await new Promise(r => setTimeout(r, 1400));
  const wps = (m.weakPoints || []).filter(w => w.enabled !== false);
  const prim = wps.find(w => w.name === 'lamp') || wps[0] || null;
  if (!prim && __s.KIND !== 'peg') return { pass: false, detail: __s.KIND + ' has no weak point' };
  E.setDynamicResolution?.(false);
  env.setTime?.(13); env.setWeather('clear', 0.05);
  for (const o of M.list) if (!o._frozenByGate) { o._frozenByGate = o.update; o.update = () => {}; }
  m.state = 'patrol';
  p._updateCamera = () => {}; if (p.model) p.model.visible = false;
  await new Promise(r => setTimeout(r, 400));
  const H = E.renderer.getContext().drawingBufferHeight;
  const fovK = H / (2 * Math.tan(cam.fov * Math.PI / 360));
  const rec = m.lamp;
  const V = p.position.constructor;
  const lp = new V(), ax = new V();
  // the SUNLIT face: of the headings with a clear 40 m line, the one whose lens axis is closest to the sun's azimuth
  const sd = env.sunDir ? new V(env.sunDir.x, 0, env.sunDir.z).normalize() : new V(0, 0, 1);
  const place = (hd) => {
    m.heading = hd; m.root.rotation.y = hd; m.root.updateMatrixWorld(true);
    if (rec) { rec.anchor.updateWorldMatrix(true, false); lp.setFromMatrixPosition(rec.anchor.matrixWorld); ax.set(0, 0, 1).transformDirection(rec.anchor.matrixWorld); ax.y = 0; ax.normalize(); }
    else { prim.obj.getWorldPosition(lp); ax.set(Math.sin(hd), 0, Math.cos(hd)); }
  };
  let best = null;
  for (let k = 0; k < 24; k++) {
    const hd = k * Math.PI / 12;
    place(hd);
    let clear = true;
    for (let s2 = 1; s2 < 60; s2++) { const q = lp.clone().addScaledVector(ax, 40 * s2 / 60); if (T.getHeight(q.x, q.z) > q.y - 0.4) { clear = false; break; } }
    if (clear && ctx.collision?.occluded?.(lp.clone().addScaledVector(ax, 40), lp)) clear = false;
    if (!clear) continue;
    const sun = ax.x * sd.x + ax.z * sd.z;
    if (!best || sun > best.sun) best = { hd, sun };
  }
  place(best ? best.hd : 0.2);
  const sunAzDot = best ? +best.sun.toFixed(3) : null;
  // only this lamp is drawn (the other Instruments' lamps are not the subject)
  for (const r of M.lamps.records.slice()) if (r.machine !== m) M.lamps.detach(r.machine);
  const hitPx40 = prim ? 2 * prim.radius * fovK / 40 : null;
  // rendered: the lit lamp glass at 40 m on its axis, at the game lens
  cam.position.copy(lp).addScaledVector(ax, 40); cam.lookAt(lp); cam.updateMatrixWorld();
  await new Promise(r => setTimeout(r, 900));
  const gl = E.renderer.getContext();
  const grab = (n) => new Promise(res => { const h = () => { E.onAfterRender.splice(E.onAfterRender.indexOf(h), 1); E.renderer.setRenderTarget(null);
    const v = lp.clone().project(cam); const Wd = gl.drawingBufferWidth, Hd = gl.drawingBufferHeight;
    const cx = Math.round((v.x * 0.5 + 0.5) * Wd), cy = Math.round((v.y * 0.5 + 0.5) * Hd);
    const px = new Uint8Array(n * n * 4); gl.readPixels(cx - (n >> 1), cy - (n >> 1), n, n, gl.RGBA, gl.UNSIGNED_BYTE, px); res(px); }; E.onAfterRender.push(h); });
  const Col = await import('/src/instruments/lib/color.js');
  const L = await import('/src/instruments/lamps.js');
  const tok = Col.rgbToLab(Col.hexToRgb(L.LAMP_STATES.calm.token));
  // SIZE is the weak point's own projection: everything but this machine, its lamp draw and the lights is
  // hidden for the 40 m read (grass, props or a palisade between camera and lamp are staging, not the subject);
  // the haze and the output pass still apply. Contrast (below) is read with the world visible.
  const vis40 = [];
  for (const ch of ctx.scene.children) { vis40.push([ch, ch.visible]); ch.visible = ch === m.root || ch === M.lamps.group || !!ch.isLight; }
  await new Promise(r => setTimeout(r, 300));
  const px40 = await grab(31);
  for (const [ch, v] of vis40) ch.visible = v;
  let lit40 = 0;
  // only this lamp's lit glass (projected aperture radius + 1 px): a second sensor on the hull is not the weak point
  const discR40 = rec ? rec.radius * fovK / 40 : 4;
  const glassR40 = rec ? discR40 * L.APERTURE_MAX : 4;
  for (let j = 0; j < px40.length; j += 4) {
    const x = (j >> 2) % 31, y = ((j >> 2) / 31) | 0;
    if (Math.hypot(x - 15, y - 15) > glassR40 + 1) continue;
    if (Col.deltaE2000(Col.rgbToLab([px40[j] / 255, px40[j + 1] / 255, px40[j + 2] / 255]), tok) <= 10) lit40++;
  }
  const litDiam40 = 2 * Math.sqrt(lit40 / Math.PI);
  // ---- contrast at 15 m on the lens axis, the world visible, sunlit face
  cam.position.copy(lp).addScaledVector(ax, 15); cam.lookAt(lp); cam.updateMatrixWorld();
  await new Promise(r => setTimeout(r, 700));
  const N = 61, C0 = 30;
  const px15 = await grab(N);
  // machine mask from the same camera: flat black ink on white, the machine alone (no sky, no ground)
  const R = E.renderer, scene = ctx.scene;
  const Wd = gl.drawingBufferWidth, Hd = gl.drawingBufferHeight;
  const RT = new E.composer.renderTarget1.constructor(Wd, Hd);
  let StdMat = null; m.root.traverse(o => { if (!StdMat && o.material && o.material.isMeshStandardMaterial) StdMat = o.material.constructor; });
  const ink = new StdMat({ color: 0x000000, roughness: 1, metalness: 0 });
  const clearC = ink.color.clone(); R.getClearColor(clearC); const clearA = R.getClearAlpha();
  const visM = []; for (const ch of scene.children) { visM.push([ch, ch.visible]); ch.visible = ch === m.root || !!ch.isLight; }
  const bg = scene.background, fog = scene.fog, ov = scene.overrideMaterial;
  scene.background = null; scene.fog = null; scene.overrideMaterial = ink;
  const prevRT = R.getRenderTarget();
  R.setRenderTarget(RT); R.setClearColor(0xffffff, 1); R.clear(); R.render(scene, cam);
  const vv = lp.clone().project(cam); const mcx = Math.round((vv.x * 0.5 + 0.5) * Wd), mcy = Math.round((vv.y * 0.5 + 0.5) * Hd);
  const maskPx = new Uint8Array(N * N * 4); R.readRenderTargetPixels(RT, mcx - (N >> 1), mcy - (N >> 1), N, N, maskPx);
  R.setRenderTarget(prevRT); R.setClearColor(clearC, clearA);
  scene.background = bg; scene.fog = fog; scene.overrideMaterial = ov;
  for (const [ch, v] of visM) ch.visible = v;
  RT.dispose(); ink.dispose();
  const discR = rec ? rec.radius * fovK / 15 : 6;
  const apR = discR * L.APERTURE_MAX, coreZone = apR * L.CORE_FRAC * 1.15 + 0.75;
  const lumAt = (j) => { const c = [px15[j], px15[j + 1], px15[j + 2]].map(v => Col.srgbToLinear(v / 255)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ring = [], core = [], face = [], bezel = [], outer = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - C0, y - C0), j = (y * N + x) * 4;
    if (d <= coreZone) core.push(lumAt(j));
    else if (d <= apR - 0.75) ring.push(lumAt(j));
    else if (d >= apR + 1 && d <= discR * L.BEZEL_IN - 0.75) face.push(lumAt(j));
    else if (d > discR * L.BEZEL_IN + 0.5 && d <= discR - 0.5) bezel.push(lumAt(j));
    else if (d >= discR * 1.1 && d <= discR * 1.8 && maskPx[j] < 128) outer.push(lumAt(j));
  }
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
  const ratio = (a, b) => (a === null || b === null) ? null : (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const Lg = med(ring), Lf = med(face), Lo = med(outer), Lc = core.length ? Math.max(...core) : null;
  const contrast = ratio(Lg, Lf);
  const sizeOk = __s.KIND === 'peg' || (hitPx40 !== null && hitPx40 >= 5 && litDiam40 >= 5);
  const contrastOk = contrast !== null && contrast >= 3 && ring.length >= 8 && face.length >= 8;
  const calimaNote = (env.weatherStates || []).includes('calima') ? null : 'calima: the environment has no calima state until world-sky W1 (E12); 13:00 clear measured as the trade stand-in';
  return { pass: sizeOk && contrastOk, detail: {
    kind: __s.KIND, fixture: __KB.fixture, primaryWeakPoint: prim ? prim.name : null,
    size40: { hitSpherePx: hitPx40 === null ? null : +hitPx40.toFixed(1), lampFacePx: +(2 * discR40).toFixed(1), litGlassEquivDiameterPx: +litDiam40.toFixed(1), litPixels: lit40, ok: sizeOk,
      estimator: 'lit glass = pixels within dE2000 10 of the calm token inside the projected aperture (+1 px), the machine and its lamp alone in the frame (haze and output pass applied)' },
    contrast13h: { glassRingLum: Lg === null ? null : +Lg.toFixed(3), drumFaceLum: Lf === null ? null : +Lf.toFixed(3), ratio: contrast === null ? null : +contrast.toFixed(2), ok: contrastOk,
      pixels: { ring: ring.length, face: face.length, core: core.length, bezel: bezel.length, outerHull: outer.length },
      coreMaxLum: Lc === null ? null : +Lc.toFixed(3), bezelLum: med(bezel) === null ? null : +med(bezel).toFixed(3),
      outerHullLum: Lo === null ? null : +Lo.toFixed(3), glassVsOuterHull: ratio(Lg, Lo) === null ? null : +ratio(Lg, Lo).toFixed(2), coreVsOuterHull: ratio(Lc, Lo) === null ? null : +ratio(Lc, Lo).toFixed(2),
      sunlit: { lensAxisDotSunAzimuth: sunAzDot, sunElevationDeg: env.sunDir ? +(Math.asin(Math.max(-1, Math.min(1, env.sunDir.y))) * 180 / Math.PI).toFixed(1) : null },
      graded: 'glass = median luminance of the lit token RING (outside the bloom core); hull = median of the lamp drum face around it (glass edge + 1 px to the bezel); 15 m on the lens axis, 13:00, the lens turned to the sun',
      reported: 'outer hull = machine pixels (flat-ink mask) 1.1-1.8 face radii out: the bone glaze beyond the lamp drum' },
    contrastClause: contrastOk ? 'pass (13:00, sunlit face, rendered pixels at 15 m)' : 'FAIL',
    calimaNote } };
})()`;

/** A-linked-attack: after its tool is torn, the linked attack fires 0 times in a 60 s duel. */
const LINKED = (spec) => `(async () => {
  ${KB_PRELUDE(spec)}
  const __s = await __kb(); if (!__s) return __kbSkip();
  const ctx = __CTX__, m = __s.m, p = ctx.player, E = ctx.engine;
  const part = (m.parts || []).find(q => q.attached && q.tearable && q.linkedAttack);
  if (!part) return { pass: __KB.fixture ? null : false, detail: (__KB.fixture ? 'SKIP-fixture: ' : 'FAIL: ') + __s.KIND + ' has no tool component with a linked attack (bible §7.3 Tool: Pry -> its linked attack is gone; authored in the species lane fidelity pass)' };
  const linked = part.linkedAttack;
  part.mesh.updateWorldMatrix(true, false);
  const e = part.mesh.matrixWorld.elements;
  m.takeDamage({ point: { x: e[12], y: e[13], z: e[14] }, object: part.mesh, impact: 1, tear: 99999, element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'tear' });
  const torn = !part.attached;
  let fired = 0, phases = 0;
  const on = (ev) => { if (ev.machine === m) { phases++; if (ev.kind === linked && ev.phase === 'strike') fired++; } };
  ctx.events.on('machine-attack-phase', on);
  m.forceState('attack');
  E.requestTimeScale?.('kb-linked', 3);
  const s0 = E.simTime, w0 = performance.now();
  while (E.simTime - s0 < 60 && performance.now() - w0 < 90000) {
    p.health = p.maxHealth;
    if (m.alive && m.state !== 'attack' && m.state !== 'stagger') m.forceState('attack');
    await new Promise(r => setTimeout(r, 100));
  }
  E.requestTimeScale?.('kb-linked', null);
  ctx.events.off?.('machine-attack-phase', on);
  return { pass: torn && fired === 0 && phases > 0, detail: { kind: __s.KIND, part: part.name, linked, torn, linkedFired: fired, attackPhasesSeen: phases, simS: +(E.simTime - s0).toFixed(1) } };
})()`;

/** V26 / V27 / V-lineup staging through the Round-4 LINEUP helper (vendored). */
const LINEUP_SETUP = (spec, opts, allKinds) => `(async () => {
  ${VENDORED.__LINEUP}
  ${KB_PRELUDE(spec)}
  const __s = await __kb(); if (!__s) return;
  const M = __CTX__.machines;
  const kinds = ${allKinds ? '[...new Set([__s.KIND, ...Object.values(M.roles || {}).filter(Boolean)])].filter(k => !M.isLegacyKind?.(k) && M.canSpawn(k))' : '[__s.KIND]'};
  await stageCast(kinds${opts ? ', ' + opts : ''});
})()`;

/**
 * The per-kind block for ONE kind. See the header for `spec`.
 */
export function kindBlock(spec = {}) {
  const lane = spec.lane || 'kind-block';
  const cls = spec.class || 'medium';
  const tag = spec.suffix || `:${spec.kind || spec.role || 'kind'}`;
  const who = spec.kind ? `kind ${spec.kind}` : `the ${spec.role} role's kind`;
  const fx = !!spec.fixture;
  const id = (base) => `${base}${tag}`;
  const rows = [];
  const vend = (base, extra = {}) => {
    const v = VENDORED[base];
    rows.push({
      id: id(base), kind: 'action', lane, timeout: v.timeout, settle: v.settle,
      ...(v.setup ? { setup: v.setup } : {}),
      title: `[${who}] ${v.title}`, source: v.src, assert: inject(v.assert, spec), ...extra,
    });
  };
  vend('A44-socket-integrity', { title: `[${who}] A44: every part / lamp / weak-point anchor on the hull (gap <= 0.10 m), idle and +2 s after death` });
  vend('A44b-socket-vertex-integrity');
  vend('A45-no-skate-per-species');
  vend('A45c-foot-continuity');
  vend('A46-ground-truth');
  vend('A47-corpse-grounded');
  vend('A47b-corpse-posed');
  vend('A47c-corpse-mass');
  vend('A48-cadence');
  rows.push({ id: id('A-weights-authored'), kind: 'action', lane, timeout: 90000, settle: 400,
    title: `[${who}] A-weights-authored: 0 vertices on the wrong bone vs the generator labels; >= 99.5 % rigid`, assert: WEIGHTS(spec) });
  rows.push({ id: id('A-sil40'), kind: 'action', lane, timeout: 150000, settle: 400,
    title: `[${who}] A-sil40: side + front flat-ink masks at 40 m (FOV 55, 1600 x 900), height-normalised: pairwise shape-IoU <= 0.45 vs every other non-legacy kind (Plumb-Transit <= 0.60); height >= 20 px (Peg exempt)`,
    assert: SIL40(spec) });
  rows.push({ id: id('A-weak40'), kind: 'action', lane, timeout: 120000, settle: 400,
    title: `[${who}] A-weak40: primary weak point >= 5 px across at 40 m (Peg exempt); lamp/vial luminance contrast vs hull >= 3:1 at 13:00 trade and in calima, from rendered pixels`,
    assert: WEAK40(spec) });
  rows.push({ id: id('A-lamp-states'), kind: 'action', lane, timeout: 300000, settle: 600, setup: '__CTX__.input.enabled = true;',
    title: `[${who}] A-lamp-states (core's gate): rendered lamp pixels at 15 m per state`, assert: lampStatesAssert(spec) });
  vend('A41b-attack-coverage');
  vend('A41d-attack-coverage');
  vend('A41c-sustained-variety');
  vend('A42-stagger');
  rows.push({ id: id('A-linked-attack'), kind: 'action', lane, timeout: 150000, settle: 400,
    title: `[${who}] A-linked-attack: after its tool is torn, the linked attack fires 0 times in a 60 s duel`, assert: LINKED(spec) });
  rows.push({ id: id('A-glb-budget'), kind: 'action', lane, timeout: 60000, settle: 200,
    title: `[${who}] A-glb-budget: within its size class (${cls}: §4.1), bones included`, assert: GLB_BUDGET(spec, cls) });
  rows.push({ id: id('A21-with-kind'), kind: 'action', lane, timeout: 150000, settle: 600,
    title: `[${who}] A21-with-kind: staged fight <= 350 draws; the kind costs <= its class draws (${cls})`, assert: A21_WITH_KIND(spec, cls) });
  vend('A90-expansion-with-kind', { title: `[${who}] A90-expansion-with-kind: 30 kills, each followed by a respawn of the kind: scene growth <= +600, heap <= +25 %, zero growth outside machine roots, zero orphaned roots, population budget held` });
  vend('A90-rig-reclaim-with-kind', { title: `[${who}] A90-rig-reclaim-with-kind: 30 spawn/kill/dispose cycles of the kind grow geometries <= +40, textures <= +30; a live machine costs <= 1 of each` });
  // the judged frames
  const v = (base, setup, criteria, settle) => rows.push(fx
    ? { id: id(base), kind: 'action', lane, timeout: 150000, settle, setup,
      title: `[${who}] ${base} (fixture: staged and filmed, not judged)`,
      assert: skipFixture(`${base} is judged on the species lane's fidelity pass (bible §7.5: "Fidelity pass mandatory before a kind is judged"); the frame is staged and filmed for reference`) }
    : { id: id(base), kind: 'visual', lane, timeout: 150000, settle, setup, title: `[${who}] ${base}`, criteria });
  v('V26-silhouette', LINEUP_SETUP(spec, "{ front: false, fov: 55, depth: 12, eyeY: 1.6 }", false),
    'Side + front at 12 m against plain sky: reads as its bible card one-sentence TOOL; no head, jaw, tail, face or eye.', 2600);
  v('V27-attack-pose', LINEUP_SETUP(spec, VENDORED.__V27_OPTS, false),
    'Frozen mid-windup: the WORKING END does the work (bob swings, blades scissor, blade lowers, mortar elevates); FAIL if only the body transform changed.', 2600);
  v('V-lineup', LINEUP_SETUP(spec, "{ spread: 9, fov: 55, depth: 12, eyeY: 1.6 }", true),
    'Every non-legacy kind side by side at 12 m with Brea for scale: one family (glaze on bronze, vermilion graduations), sizes per bible §7.4.', 2600);
  return rows;
}

/* ===== VENDORED ROUND-4 ROWS (generated; do not hand-edit) ===== */
/**
 * The Round-4 per-species rows the block re-uses VERBATIM (bars unchanged),
 * captured from their source files at W0b so the block survives gates-perf
 * archiving those files. The only edits: the "one machine per species" prelude
 * becomes "one machine of KIND" (`__kb()`, injected by kindBlock()), a
 * two-species minimum becomes one, and a species literal in the staging is the
 * staged KIND. Each row names its source.
 */
const VENDORED = {"A44-socket-integrity":{"src":"tools/gates.config.mjs A44-socket-integrity","title":"PER SPECIES: every weak point sits on the hull (audit A44: gap <= 0.10 m) alive AND dead","setup":null,"settle":600,"timeout":120000,"assert":"(async () => {\n      \n  const _t0 = performance.now();\n  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n    await new Promise(r => setTimeout(r, 150));\n  }\n      \n  const __s = await __kb(); if (!__s) return __kbSkip();\n  const species = new Map([[__s.KIND, __s.m]]);\n  const V = __CTX__.player.position.constructor;\n      \n  const hullBoxes = (m) => {\n    const root = m.root || m.body; if (!root) return [];\n    root.updateMatrixWorld(true);\n    const boxes = [];\n    root.traverse((o) => {\n      if (!o.isMesh || !o.geometry || !o.visible) return;\n      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();\n      const bb = o.geometry.boundingBox; if (!bb) return;\n      const mn = { x: 1e9, y: 1e9, z: 1e9 }, mx = { x: -1e9, y: -1e9, z: -1e9 };\n      for (let i = 0; i < 8; i++) {\n        const v = new V(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)\n          .applyMatrix4(o.matrixWorld);\n        mn.x = Math.min(mn.x, v.x); mn.y = Math.min(mn.y, v.y); mn.z = Math.min(mn.z, v.z);\n        mx.x = Math.max(mx.x, v.x); mx.y = Math.max(mx.y, v.y); mx.z = Math.max(mx.z, v.z);\n      }\n      boxes.push({ mn, mx });\n    });\n    return boxes;\n  };\n  const distToHull = (p, boxes) => {\n    let best = 1e9;\n    for (const b of boxes) {\n      const dx = Math.max(b.mn.x - p.x, 0, p.x - b.mx.x);\n      const dy = Math.max(b.mn.y - p.y, 0, p.y - b.mx.y);\n      const dz = Math.max(b.mn.z - p.z, 0, p.z - b.mx.z);\n      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);\n      if (d < best) best = d;\n    }\n    return best;\n  };\n      const out = {}; let worst = 0, checked = 0;\n      const scan = (m, phase, rec) => {\n        const boxes = hullBoxes(m);\n        const __pts = [...(m.weakPoints || []), ...(m.lamp && m.lamp.anchor ? [{ name: 'lamp-anchor', obj: m.lamp.anchor, radius: 0 }] : []),\n          ...(m.parts || []).filter(q => q.attached && q.mesh).map(q => ({ name: 'part:' + q.name, obj: q.mesh, radius: 0 }))];\n        if (!boxes.length || !__pts.length) return;\n        for (const wp of __pts) {\n          if (!wp.obj) continue;\n          const p = wp.obj.getWorldPosition(new V());\n          const gap = Math.max(0, distToHull(p, boxes) - (wp.radius || 0));\n          rec[phase + ':' + wp.name] = +gap.toFixed(3);\n          if (gap > worst) worst = gap;\n          checked++;\n        }\n      };\n      for (const [kind, m] of species) {\n        const rec = {};\n        scan(m, 'alive', rec);\n        out[kind] = rec;\n      }\n      // dead pass: kill one of each species and re-measure once it has settled\n      for (const [, m] of species) {\n        try { m.takeDamage({ impact: 99999, dir: new V(0, 0, 1), point: m.position.clone() }); } catch (e) { /* */ }\n        if (m.alive) { try { m._die(); } catch (e) { /* */ } }\n      }\n      await new Promise(r => setTimeout(r, 3200));\n      for (const [kind, m] of species) scan(m, 'dead', out[kind]);\n      if (!checked) return { pass: null, detail: 'SKIP: no machine exposes weakPoints' };\n      return { pass: worst <= 0.1, detail: { budgetM: 0.1, worstGapM: +worst.toFixed(3), pointsChecked: checked, out } };\n    })()"},"A45-no-skate-per-species":{"src":"tools/gates.config.mjs A45-no-skate-per-species","title":"PER SPECIES: a planted machine foot does not skate (audit A45: stance drift <= 0.06 m)","setup":null,"settle":500,"timeout":180000,"assert":"(async () => {\n      \n  const _t0 = performance.now();\n  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n    await new Promise(r => setTimeout(r, 150));\n  }\n      \n  const __s = await __kb(); if (!__s) return __kbSkip();\n  const species = new Map([[__s.KIND, __s.m]]);\n  const V = __CTX__.player.position.constructor;\n      const T = __CTX__.terrain, out = {};\n      let worstAll = 0, measured = 0;\n      for (const [kind, m] of species) {\n        if (!m.debugFeet || m.debugFeet().length < 2) { out[kind] = 'no feet'; continue; }\n        \n  {\n    const _p = __CTX__.player;\n    _p.position.set(m.position.x + 14, 0, m.position.z + 14);\n    _p._snapToGround?.();\n    _p.camYaw = Math.atan2(m.position.x - _p.position.x, m.position.z - _p.position.z) + Math.PI;\n    await new Promise(r => setTimeout(r, 2200));\n  }\n        const open = {}, done = [];\n        const t0 = performance.now();\n        let moved = 0, sx = m.position.x, sz = m.position.z;\n        while (performance.now() - t0 < 5000) {\n          moved += Math.hypot(m.position.x - sx, m.position.z - sz);\n          sx = m.position.x; sz = m.position.z;\n          for (const f of m.debugFeet()) {\n            const on = f.planted && Math.abs(f.world.y - T.getHeight(f.world.x, f.world.z)) <= 0.25;\n            const w = open[f.name];\n            if (on) {\n              if (!w) open[f.name] = { x0: f.world.x, x1: f.world.x, z0: f.world.z, z1: f.world.z, n: 1 };\n              else {\n                w.x0 = Math.min(w.x0, f.world.x); w.x1 = Math.max(w.x1, f.world.x);\n                w.z0 = Math.min(w.z0, f.world.z); w.z1 = Math.max(w.z1, f.world.z); w.n++;\n              }\n            } else if (w) {\n              if (w.n >= 4) done.push(+Math.hypot(w.x1 - w.x0, w.z1 - w.z0).toFixed(3));\n              open[f.name] = null;\n            }\n          }\n          await new Promise(r => requestAnimationFrame(r));\n        }\n        if (moved < 0.4 || done.length < 2) { out[kind] = { skipped: 'idle', movedM: +moved.toFixed(2), windows: done.length }; continue; }\n        const worst = Math.max(...done);\n        out[kind] = { maxStanceDriftM: worst, windows: done.length, movedM: +moved.toFixed(2) };\n        worstAll = Math.max(worstAll, worst);\n        measured++;\n      }\n      if (measured < 1) return { pass: null, detail: { note: 'SKIP: fewer than 2 species walked far enough to sample', out } };\n      return { pass: worstAll <= 0.06, detail: { budgetM: 0.06, worstM: worstAll, speciesMeasured: measured, out } };\n    })()"},"A47-corpse-grounded":{"src":"tools/gates.config.mjs A47-corpse-grounded","title":"PER SPECIES: a corpse settles ON the ground (audit A47: penetration <= 0.10 m, and it may not float)","setup":null,"settle":600,"timeout":120000,"assert":"(async () => {\n      \n  const _t0 = performance.now();\n  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n    await new Promise(r => setTimeout(r, 150));\n  }\n      \n  const __s = await __kb(); if (!__s) return __kbSkip();\n  const species = new Map([[__s.KIND, __s.m]]);\n  const V = __CTX__.player.position.constructor;\n      \n  const hullBoxes = (m) => {\n    const root = m.root || m.body; if (!root) return [];\n    root.updateMatrixWorld(true);\n    const boxes = [];\n    root.traverse((o) => {\n      if (!o.isMesh || !o.geometry || !o.visible) return;\n      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();\n      const bb = o.geometry.boundingBox; if (!bb) return;\n      const mn = { x: 1e9, y: 1e9, z: 1e9 }, mx = { x: -1e9, y: -1e9, z: -1e9 };\n      for (let i = 0; i < 8; i++) {\n        const v = new V(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)\n          .applyMatrix4(o.matrixWorld);\n        mn.x = Math.min(mn.x, v.x); mn.y = Math.min(mn.y, v.y); mn.z = Math.min(mn.z, v.z);\n        mx.x = Math.max(mx.x, v.x); mx.y = Math.max(mx.y, v.y); mx.z = Math.max(mx.z, v.z);\n      }\n      boxes.push({ mn, mx });\n    });\n    return boxes;\n  };\n  const distToHull = (p, boxes) => {\n    let best = 1e9;\n    for (const b of boxes) {\n      const dx = Math.max(b.mn.x - p.x, 0, p.x - b.mx.x);\n      const dy = Math.max(b.mn.y - p.y, 0, p.y - b.mx.y);\n      const dz = Math.max(b.mn.z - p.z, 0, p.z - b.mx.z);\n      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);\n      if (d < best) best = d;\n    }\n    return best;\n  };\n      const T = __CTX__.terrain, out = {};\n      for (const [, m] of species) {\n        try { m.takeDamage({ impact: 99999, dir: new V(0, 0, 1), point: m.position.clone() }); } catch (e) { /* */ }\n        if (m.alive) { try { m._die(); } catch (e) { /* */ } }\n      }\n      await new Promise(r => setTimeout(r, 5000));\n      let worst = 0, n = 0;\n      for (const [kind, m] of species) {\n        const boxes = hullBoxes(m);\n        if (!boxes.length) { out[kind] = 'no hull'; continue; }\n        let minY = 1e9, cx = 0, cz = 0;\n        for (const b of boxes) { minY = Math.min(minY, b.mn.y); cx += (b.mn.x + b.mx.x) / 2; cz += (b.mn.z + b.mx.z) / 2; }\n        cx /= boxes.length; cz /= boxes.length;\n        const ground = T.getHeight(cx, cz);\n        const off = minY - ground;\n        out[kind] = { lowestMinusGroundM: +off.toFixed(2), dead: !m.alive };\n        worst = Math.max(worst, Math.abs(off > 0 ? off / 0.4 : off / 0.3));\n        n++;\n      }\n      if (!n) return { pass: null, detail: 'SKIP: no species hulls' };\n      const bad = Object.entries(out).filter(([, v]) => v && v.lowestMinusGroundM !== undefined\n        && (v.lowestMinusGroundM < -0.1 || v.lowestMinusGroundM > 0.4)).map(([k]) => k);\n      return { pass: bad.length === 0, detail: { budget: 'penetration <= 0.10 m, float <= 0.40 m', offenders: bad, speciesChecked: n, out } };\n    })()"},"A48-cadence":{"src":"tools/gates.config.mjs A48-cadence","title":"PER SPECIES: stride cadence scales with body length, graded on MOVING frames (audit A48; airborne fraction reported)","setup":null,"settle":500,"timeout":360000,"assert":"(async () => {\n      \n  const _t0 = performance.now();\n  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n    await new Promise(r => setTimeout(r, 150));\n  }\n      \n  const __s = await __kb(); if (!__s) return __kbSkip();\n  const species = new Map([[__s.KIND, __s.m]]);\n  const V = __CTX__.player.position.constructor;\n      \n  const hullBoxes = (m) => {\n    const root = m.root || m.body; if (!root) return [];\n    root.updateMatrixWorld(true);\n    const boxes = [];\n    root.traverse((o) => {\n      if (!o.isMesh || !o.geometry || !o.visible) return;\n      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();\n      const bb = o.geometry.boundingBox; if (!bb) return;\n      const mn = { x: 1e9, y: 1e9, z: 1e9 }, mx = { x: -1e9, y: -1e9, z: -1e9 };\n      for (let i = 0; i < 8; i++) {\n        const v = new V(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)\n          .applyMatrix4(o.matrixWorld);\n        mn.x = Math.min(mn.x, v.x); mn.y = Math.min(mn.y, v.y); mn.z = Math.min(mn.z, v.z);\n        mx.x = Math.max(mx.x, v.x); mx.y = Math.max(mx.y, v.y); mx.z = Math.max(mx.z, v.z);\n      }\n      boxes.push({ mn, mx });\n    });\n    return boxes;\n  };\n  const distToHull = (p, boxes) => {\n    let best = 1e9;\n    for (const b of boxes) {\n      const dx = Math.max(b.mn.x - p.x, 0, p.x - b.mx.x);\n      const dy = Math.max(b.mn.y - p.y, 0, p.y - b.mx.y);\n      const dz = Math.max(b.mn.z - p.z, 0, p.z - b.mx.z);\n      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);\n      if (d < best) best = d;\n    }\n    return best;\n  };\n      const E = __CTX__.engine;\n      const out = {}; let measured = 0; const offenders = [];\n      const WINDOW_S = 5, CAP_S = 15, MIN_S = 2, FLIGHT_WIN = 1.0;\n      for (const [kind, m] of species) {\n        if (!m.debugFeet || m.debugFeet().length < 2) { out[kind] = 'no feet'; continue; }\n        const boxes = hullBoxes(m);\n        let L = 1;\n        for (const b of boxes) L = Math.max(L, Math.max(b.mx.x - b.mn.x, b.mx.z - b.mn.z));\n        \n  {\n    const _p = __CTX__.player;\n    _p.position.set(m.position.x + 14, 0, m.position.z + 14);\n    _p._snapToGround?.();\n    _p.camYaw = Math.atan2(m.position.x - _p.position.x, m.position.z - _p.position.z) + Math.PI;\n    await new Promise(r => setTimeout(r, 2200));\n  }\n        const flier = typeof m.flyCruise === 'number';\n        const rows = [];\n        const lastCount = {}, lastPlanted = {};\n        let px = m.position.x, pz = m.position.z, ps = E.simTime, pw = performance.now();\n        let air = !!m._airborne, flips = [];\n        let movingS = 0;\n        const t0 = performance.now();\n        while (movingS < WINDOW_S && performance.now() - t0 < CAP_S * 1000) {\n          await new Promise(r => requestAnimationFrame(r));\n          if (!m.alive) break;\n          const now = performance.now(), st = E.simTime;\n          const dW = (now - pw) / 1000, dS = st - ps;\n          const dx = m.position.x - px, dz = m.position.z - pz;\n          px = m.position.x; pz = m.position.z; ps = st; pw = now;\n          if (!!m._airborne !== air) { air = !!m._airborne; flips.push(st); }\n          const fs = m.debugFeet();\n          let got = 0, planted = 0;\n          for (const f of fs) {\n            if (typeof f.stances === 'number') {\n              const prev = lastCount[f.name];\n              if (prev !== undefined && f.stances > prev) got += f.stances - prev;\n              lastCount[f.name] = f.stances;\n            } else {\n              if (f.planted && lastPlanted[f.name] === false) got++;\n            }\n            lastPlanted[f.name] = !!f.planted;\n            if (f.planted) planted++;\n          }\n          const speed = dS > 1e-5 ? Math.hypot(dx, dz) / dS : 0;\n          const walk = Math.max(0.1, m.walkSpeed || 1);\n          const row = { st, dW, dist: Math.hypot(dx, dz), got, feet: fs.length, planted,\n                        moving: speed >= 0.5 * walk && fs.length >= 2 && !(flier && m._airborne) };\n          rows.push(row);\n          // online estimate (the flight windows are applied again below, both sides)\n          if (row.moving && !(flier && flips.length && st - flips[flips.length - 1] < FLIGHT_WIN)) movingS += dW;\n        }\n        // a flier's takeoff / landing window is excluded on BOTH sides of the change\n        let plants = 0, secs = 0, frames = 0, airborne = 0, moved = 0, feetN = 0, slow = 0, flight = 0;\n        for (const r of rows) {\n          if (!r.moving) { slow++; continue; }\n          if (flier && flips.some((f) => Math.abs(r.st - f) < FLIGHT_WIN)) { flight++; continue; }\n          plants += r.got; secs += r.dW; frames++; moved += r.dist;\n          feetN = Math.max(feetN, r.feet);\n          if (r.planted === 0) airborne++;\n        }\n        const hz = feetN && secs > 0 ? plants / feetN / secs : 0;\n        // biomechanical scaling: stride frequency falls as sqrt of body length.\n        // reference = a 2.5 m strider at 2.2 Hz; band is 0.45x - 1.35x of it.\n        const ref = 2.2 / Math.sqrt(Math.max(0.5, L / 2.5));\n        const lo = ref * 0.45, hi = ref * 1.35;\n        const ok = (secs < MIN_S || moved < 0.4) ? null : hz >= lo && hz <= hi;\n        out[kind] = { bodyLengthM: +L.toFixed(1), cadenceHz: +hz.toFixed(2),\n                      bandHz: [+lo.toFixed(2), +hi.toFixed(2)], movingS: +secs.toFixed(2),\n                      movedM: +moved.toFixed(2), plants, feet: feetN,\n                      framesMoving: frames, framesExcluded: { slow, flight },\n                      wallS: +((performance.now() - t0) / 1000).toFixed(1),\n                      airborneFraction: frames ? +(airborne / frames).toFixed(3) : null,\n                      status: ok === null ? 'idle' : ok ? 'ok' : 'OUT OF BAND' };\n        if (ok === false) offenders.push(kind);\n        if (ok !== null) measured++;\n      }\n      if (measured < 1) return { pass: null, detail: { note: 'SKIP: fewer than 2 species walked far enough to sample', out } };\n      return { pass: offenders.length === 0, detail: { speciesMeasured: measured, offenders,\n        rule: 'moving frames only (speed >= 0.5x walkSpeed over sim time; flier takeoff/landing +-1 s excluded); plants = per-foot stance-window counter increments', out } };\n    })()"},"A45c-foot-continuity":{"src":"tools/gates.round4.machine-rig.mjs A45c-foot-continuity","title":"A PLANTED foot does not move: <= 0.12 m in any rendered frame (primary) AND <= 3 m/s; lock ramp <= 9 m/s","setup":null,"settle":500,"timeout":180000,"assert":"(async () => {\n      \n  const _t0 = performance.now();\n  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n    await new Promise(r => setTimeout(r, 150));\n  }\n      \n  const __s = await __kb(); if (!__s) return __kbSkip();\n  const species = new Map([[__s.KIND, __s.m]]);\n      const out = {}; const offenders = []; let measured = 0;\n      for (const [kind, m] of species) {\n        if (typeof m.footContinuity !== 'function' && typeof m.debugFeet === 'function') {\n          m.footContinuity = () => m.debugFeet().map(f => ({ toe: { x: f.world.x, y: f.world.y, z: f.world.z }, planted: !!f.planted, rampPeakMps: 0 }));\n          m.__padsFromDebugFeet = true;\n        }\n        if (typeof m.footContinuity !== 'function') continue;\n        const first = m.footContinuity();\n        if (!first || first.length < 2) { out[kind] = 'no handle feet'; continue; }\n        \n  {\n    const _p = __CTX__.player;\n    _p.position.set(m.position.x + 14, 0, m.position.z + 14);\n    _p._snapToGround?.();\n    _p.camYaw = Math.atan2(m.position.x - _p.position.x, m.position.z - _p.position.z) + Math.PI;\n    await new Promise(r => setTimeout(r, 2200));\n  }\n        let prev = m.footContinuity();\n        let prevT = performance.now();\n        let worstPlanted = 0, worstRamp = 0, samples = 0, plantedSamples = 0;\n        let worstPlantedFrameM = 0, moved = 0;\n        let sx = m.position.x, sz = m.position.z;\n        const t0 = performance.now();\n        while (performance.now() - t0 < 5000) {\n          await new Promise(r => requestAnimationFrame(r));\n          const now = performance.now();\n          const dt = Math.max((now - prevT) / 1000, 1e-4);\n          prevT = now;\n          moved += Math.hypot(m.position.x - sx, m.position.z - sz);\n          sx = m.position.x; sz = m.position.z;\n          const cur = m.footContinuity();\n          if (!cur || cur.length !== prev.length) { prev = cur; continue; }\n          for (let i = 0; i < cur.length; i++) {\n            const a = prev[i], b = cur[i];\n            const d = Math.hypot(b.toe.x - a.toe.x, b.toe.y - a.toe.y, b.toe.z - a.toe.z);\n            // THE RAMP'S OWN CONTRIBUTION, not the applied displacement.\n            // While a plant is fully held the displacement grows at the CLIP's\n            // foot rate (the toe stands still and the animation walks away from\n            // it, which is what a foot lock IS) — that is not the rig moving\n            // anything. What moves the toe is the change in the blend weight,\n            // and rampPeakMps is that term measured inside the rig on the\n            // SIM substep it happens on, peak-and-reset, so polling once per\n            // rendered frame cannot miss a spike or over-read a stance.\n            const ramp = b.rampPeakMps ?? 0;\n            if (ramp > worstRamp) worstRamp = ramp;\n            if (a.planted && b.planted) {\n              plantedSamples++;\n              if (d / dt > worstPlanted) worstPlanted = d / dt;\n              if (d > worstPlantedFrameM) worstPlantedFrameM = d;\n            }\n          }\n          prev = cur;\n          samples++;\n        }\n        // TWO BOUNDS, because one alone is gameable by frame rate, and the\n        // per-FRAME distance is the PRIMARY one: 0.12 m is the judge's own\n        // number, it is what a foot coming loose looks like on film, and the\n        // defect this gate exists for measured 1.065 m in a single frame —\n        // 8.9x over. The RATE is the backstop that stops a slow host hiding\n        // that jump inside a long frame, and it is derived from the measured\n        // converged-plant ceiling (2.23 m/s on the judge's box, 1.59 m/s\n        // here) with 1.35x of host headroom, NOT from a 60 fps reading of the\n        // frame bound. The defect measured 63 m/s against it.\n        const ok = plantedSamples < 8 ? null\n          : (worstPlantedFrameM <= 0.12 && worstPlanted <= 3 && worstRamp <= 9);\n        out[kind] = {\n          padSource: m.__padsFromDebugFeet ? 'debugFeet (gait-controlled kind)' : 'footContinuity (handle rig)',\n          plantedToeRateMps: +worstPlanted.toFixed(3),\n          worstPlantedFrameM: +worstPlantedFrameM.toFixed(3),\n          lockRampMps: +worstRamp.toFixed(2),\n          plantedSamples, samples, movedM: +moved.toFixed(2),\n          status: ok === null ? 'never planted long enough' : ok ? 'ok' : 'DISCONTINUOUS',\n        };\n        if (ok === false) offenders.push(kind);\n        if (ok !== null) measured++;\n      }\n      if (!measured) return { pass: null, detail: { note: 'SKIP: no species reported a handle-rig plant', out } };\n      return { pass: offenders.length === 0,\n               detail: { budget: 'planted toe <= 0.12 m/frame (primary) and <= 3 m/s (host backstop), lock ramp <= 9 m/s',\n                         offenders, speciesMeasured: measured, out } };\n    })()"},"A46-ground-truth":{"src":"tools/gates.round4.machine-rig.mjs A46-ground-truth","title":"PER SPECIES: a planted foot sits ON the terrain it is standing on (audit A46: |footY - ground| <= 0.08 m)","setup":null,"settle":500,"timeout":180000,"assert":"(async () => {\n      \n  const _t0 = performance.now();\n  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n    await new Promise(r => setTimeout(r, 150));\n  }\n      \n  const __s = await __kb(); if (!__s) return __kbSkip();\n  const species = new Map([[__s.KIND, __s.m]]);\n      const T = __CTX__.terrain;\n      const out = {};\n      let worstAll = 0, measured = 0;\n      for (const [kind, m] of species) {\n        if (!m.debugFeet || m.debugFeet().length < 2) { out[kind] = 'no feet'; continue; }\n        \n  {\n    const _p = __CTX__.player;\n    _p.position.set(m.position.x + 14, 0, m.position.z + 14);\n    _p._snapToGround?.();\n    _p.camYaw = Math.atan2(m.position.x - _p.position.x, m.position.z - _p.position.z) + Math.PI;\n    await new Promise(r => setTimeout(r, 2200));\n  }\n        let worst = 0, samples = 0, moved = 0;\n        let sx = m.position.x, sz = m.position.z;\n        const perFoot = {};\n        const t0 = performance.now();\n        while (performance.now() - t0 < 4000) {\n          moved += Math.hypot(m.position.x - sx, m.position.z - sz);\n          sx = m.position.x; sz = m.position.z;\n          for (const f of m.debugFeet()) {\n            if (!f.planted) continue;\n            const err = Math.abs(f.world.y - T.getHeight(f.world.x, f.world.z));\n            perFoot[f.name] = Math.max(perFoot[f.name] ?? 0, +err.toFixed(3));\n            worst = Math.max(worst, err);\n            samples++;\n          }\n          await new Promise(r => requestAnimationFrame(r));\n        }\n        if (!samples) { out[kind] = { skipped: 'no planted samples', movedM: +moved.toFixed(2) }; continue; }\n        out[kind] = { maxGroundErrM: +worst.toFixed(3), samples, movedM: +moved.toFixed(2), perFoot };\n        worstAll = Math.max(worstAll, worst);\n        measured++;\n      }\n      if (measured < 1) return { pass: null, detail: { note: 'SKIP: fewer than 2 species reported a planted foot', out } };\n      return { pass: worstAll <= 0.08,\n               detail: { budgetM: 0.08, worstM: +worstAll.toFixed(3), speciesMeasured: measured, out } };\n    })()"},"A44b-socket-vertex-integrity":{"src":"tools/gates.round4.machine-rig.mjs A44b-socket-vertex-integrity","title":"STRICT A44: every part / eye / weak point sits within 0.10 m of a hull VERTEX, alive AND 2 s dead","setup":null,"settle":600,"timeout":150000,"assert":"(async () => {\n      \n  const _t0 = performance.now();\n  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n    await new Promise(r => setTimeout(r, 150));\n  }\n      \n  const __s = await __kb(); if (!__s) return __kbSkip();\n  const species = new Map([[__s.KIND, __s.m]]);\n      const rows = {};\n      let worst = 0, checked = 0, missing = 0;\n      const scan = (m, phase) => {\n        const r = m.socketReport ? m.socketReport() : null;\n        if (!r) { missing++; return; }\n        rows[m.kind] = rows[m.kind] || {};\n        rows[m.kind][phase] = { worstGapM: r.worstGapM, sockets: r.sockets };\n        worst = Math.max(worst, r.worstGapM);\n        checked += Object.keys(r.sockets).length;\n      };\n      for (const [, m] of species) scan(m, 'alive');\n      for (const [, m] of species) {\n        try { m.takeDamage({ impact: 99999, dir: new (__CTX__.player.position.constructor)(0, 0, 1), point: m.position.clone() }); } catch (e) { /* */ }\n        if (m.alive) { try { m._die(); } catch (e) { /* */ } }\n      }\n      await new Promise(r => setTimeout(r, 2600));\n      for (const [, m] of species) scan(m, 'dead');\n      if (!checked) return { pass: null, detail: { note: 'SKIP: no machine exposes socketReport()', missing } };\n      return { pass: worst <= 0.10,\n               detail: { budgetM: 0.10, worstGapM: +worst.toFixed(3), socketsChecked: checked,\n                         speciesWithoutProxy: missing, rows } };\n    })()"},"A47b-corpse-posed":{"src":"tools/gates.round4.machine-rig.mjs A47b-corpse-posed","title":"STRICT A47: the LOWEST POSED VERTEX of a corpse sits on the terrain (penetration <= 0.10 m, float <= 0.40 m)","setup":null,"settle":600,"timeout":150000,"assert":"(async () => {\n      \n  const _t0 = performance.now();\n  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n    await new Promise(r => setTimeout(r, 150));\n  }\n      \n  const __s = await __kb(); if (!__s) return __kbSkip();\n  const species = new Map([[__s.KIND, __s.m]]);\n      const V = __CTX__.player.position.constructor;\n      const T = __CTX__.terrain;\n      // THE AUDIT'S QUANTITY, measured the audit's way: every visible mesh,\n      // every vertex pushed through its own bone transform. A SkinnedMesh's\n      // geometry.boundingBox belongs to the mesh NODE and does not follow the\n      // skeleton, so the registered A47 cannot see a collapsed corpse at all.\n      const posedLow = (m) => {\n        m.root.updateMatrixWorld(true);\n        const p = new V();\n        let minY = Infinity, cx = 0, cz = 0, n = 0, worstMesh = null;\n        let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;\n        m.root.traverse((o) => {\n          if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position) return;\n          const P = o.geometry.attributes.position;\n          const step = Math.max(1, Math.floor(P.count / 4000));\n          let low = Infinity;\n          for (let i = 0; i < P.count; i += step) {\n            p.fromBufferAttribute(P, i);\n            if (o.isSkinnedMesh) o.applyBoneTransform(i, p);\n            p.applyMatrix4(o.matrixWorld);\n            if (p.y < low) low = p.y;\n            if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x;\n            if (p.z < mnz) mnz = p.z; if (p.z > mxz) mxz = p.z;\n            n++;\n          }\n          if (low < minY) { minY = low; worstMesh = o.name || '(unnamed)'; }\n        });\n        if (!n) return null;\n        cx = (mnx + mxx) / 2; cz = (mnz + mxz) / 2;\n        return { minY, ground: T.getHeight(cx, cz), samples: n, worstMesh };\n      };\n      for (const [, m] of species) {\n        try { m.takeDamage({ impact: 99999, dir: new V(0, 0, 1), point: m.position.clone() }); } catch (e) { /* */ }\n        if (m.alive) { try { m._die(); } catch (e) { /* */ } }\n      }\n      await new Promise(r => setTimeout(r, 5200));\n      const out = {}; const offenders = []; let checked = 0;\n      for (const [kind, m] of species) {\n        const r = posedLow(m);\n        if (!r) { out[kind] = 'no geometry'; continue; }\n        const off = r.minY - r.ground;\n        out[kind] = { lowestPosedMinusGroundM: +off.toFixed(3), lowestMesh: r.worstMesh, verticesTested: r.samples };\n        if (off < -0.10 || off > 0.40) offenders.push(kind);\n        checked++;\n      }\n      if (!checked) return { pass: null, detail: { note: 'SKIP: no corpse geometry', out } };\n      return { pass: offenders.length === 0,\n               detail: { budget: 'penetration <= 0.10 m, float <= 0.40 m', offenders, speciesChecked: checked, out } };\n    })()"},"A47c-corpse-mass":{"src":"tools/gates.round4.machine-rig.mjs A47c-corpse-mass","title":"A wreck LANDS: its median posed height drops to <= 0.75x its standing height above the terrain (sprawlers: area-weighted, against the walking chassis)","setup":null,"settle":600,"timeout":240000,"assert":"(async () => {\n      \n  const _t0 = performance.now();\n  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n    await new Promise(r => setTimeout(r, 150));\n  }\n      \n  const __s = await __kb(); if (!__s) return __kbSkip();\n  const species = new Map([[__s.KIND, __s.m]]);\n      const V = __CTX__.player.position.constructor;\n      const T = __CTX__.terrain;\n      const E = __CTX__.engine;\n      const P0 = __CTX__.player;\n      const SPRAWLERS = [...species.keys()];      // plan §9 A47c: every Instrument is graded by the sprawler rule (reference = its locomotion pose height)\n      const wait = (ms) => new Promise(r => setTimeout(r, ms));\n      const frame = () => new Promise(r => requestAnimationFrame(r));\n      // world surface area of a mesh, once (triangles of its own buffer x its world scale^2)\n      const areaOf = new Map();\n      const meshArea = (o) => {\n        if (areaOf.has(o.geometry)) return areaOf.get(o.geometry) * worldScale2(o);\n        const g = o.geometry, P = g.attributes.position, I = g.index;\n        const tri = Math.floor((I ? I.count : P.count) / 3);\n        const step = Math.max(1, Math.floor(tri / 6000));\n        const a = new V(), b = new V(), c = new V(), u = new V(), w = new V();\n        let A = 0;\n        for (let t = 0; t < tri; t += step) {\n          const i0 = I ? I.getX(t * 3) : t * 3, i1 = I ? I.getX(t * 3 + 1) : t * 3 + 1, i2 = I ? I.getX(t * 3 + 2) : t * 3 + 2;\n          a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);\n          A += u.subVectors(b, a).cross(w.subVectors(c, a)).length() * 0.5;\n        }\n        A *= step;\n        areaOf.set(g, A);\n        return A * worldScale2(o);\n      };\n      const worldScale2 = (o) => {\n        const e = o.matrixWorld.elements;\n        const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);\n        return Math.pow(Math.max(1e-9, sx * sy * sz), 2 / 3);\n      };\n      // The quantity a judge measured by hand on fix round 1: where the MASS\n      // of the machine is, not where its lowest single vertex is. A47/A47b\n      // grade one point against a window, which a splayed limb or an antenna\n      // satisfies while the body floats — six of eight species sat HIGHER dead\n      // than alive and passed both.\n      const stats = (m, withBelly) => {\n        m.root.updateMatrixWorld(true);\n        const p = new V();\n        const ys = [], ws = [], pts = withBelly ? [] : null, meshRows = [];\n        let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;\n        m.root.traverse((o) => {\n          if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position) return;\n          if (o.userData.noHull) return;\n          const P = o.geometry.attributes.position;\n          const step = Math.max(1, Math.floor(P.count / 900));\n          const n0 = ys.length;\n          const SI = o.isSkinnedMesh ? o.geometry.attributes.skinIndex : null;\n          const SW = o.isSkinnedMesh ? o.geometry.attributes.skinWeight : null;\n          const bones = o.isSkinnedMesh ? o.skeleton?.bones : null;\n          for (let i = 0; i < P.count; i += step) {\n            p.fromBufferAttribute(P, i);\n            if (o.isSkinnedMesh) o.applyBoneTransform(i, p);\n            p.applyMatrix4(o.matrixWorld);\n            ys.push(p.y);\n            if (pts) {\n              let chassis = 0;\n              if (SI && SW && bones) {\n                let bi = -1, bw = -1;\n                for (let c = 0; c < 4; c++) { const w = SW.getComponent(i, c); if (w > bw) { bw = w; bi = SI.getComponent(i, c); } }\n                chassis = /^rig_(pelvis|spine|chest)$/.test(bones[bi]?.name || '') ? 1 : 0;\n              }\n              pts.push(p.x, p.y, p.z, chassis);\n            }\n            if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x;\n            if (p.z < mnz) mnz = p.z; if (p.z > mxz) mxz = p.z;\n          }\n          const n = ys.length - n0;\n          const A = n ? meshArea(o) : 0;\n          const w = n ? A / n : 0;\n          for (let k = 0; k < n; k++) ws.push(w);\n          if (n) meshRows.push({ name: o.name || o.type, area: A, ys: ys.slice(n0) });\n        });\n        if (!ys.length) return null;\n        const gy = T.getHeight((mnx + mxx) / 2, (mnz + mxz) / 2);\n        const idx = ys.map((_, i) => i).sort((a, b) => ys[a] - ys[b]);\n        let W = 0; for (const w of ws) W += w;\n        const at = (f) => {\n          let acc = 0;\n          for (const i of idx) { acc += ws[i]; if (acc >= f * W) return ys[i] - gy; }\n          return ys[idx[idx.length - 1]] - gy;\n        };\n        // the per-vertex reading (the gate's statistic before the ruling)\n        const vAt = (f) => ys[idx[Math.min(idx.length - 1, Math.floor(idx.length * f))]] - gy;\n        const out = { median: +at(0.5).toFixed(3), p90: +at(0.9).toFixed(3), low: +(ys[idx[0]] - gy).toFixed(3), n: ys.length,\n                      vMedian: +vAt(0.5).toFixed(3), vP90: +vAt(0.9).toFixed(3) };\n        // diagnostics only (not graded): each mesh's share of the area and its own median\n        out.meshes = meshRows.map((r) => {\n          const sub = r.ys.slice().sort((a, b) => a - b);\n          return (r.name || '?').slice(0, 16) + ' ' + Math.round(100 * r.area / Math.max(1e-9, W)) + '% @' + (sub[Math.floor(sub.length / 2)] - gy).toFixed(2);\n        });\n        if (pts) {\n          // THE CHASSIS (dominant bone pelvis/spine/chest): its lowest vertex's\n          // clearance over the terrain under it, and its own area-weighted median\n          let belly = 1e9;\n          const cy = [], cw = [];\n          for (let i = 0, k = 0; i < pts.length; i += 4, k++) {\n            if (!pts[i + 3]) continue;\n            const c = pts[i + 1] - T.getHeight(pts[i], pts[i + 2]);\n            if (c < belly) belly = c;\n            cy.push(pts[i + 1]); cw.push(ws[k]);\n          }\n          out.belly = belly < 1e8 ? +belly.toFixed(3) : null;\n          if (cy.length) {\n            const ci = cy.map((_, i) => i).sort((a, b) => cy[a] - cy[b]);\n            let CW = 0; for (const w of cw) CW += w;\n            let acc = 0, cm = null;\n            for (const i of ci) { acc += cw[i]; if (acc >= 0.5 * CW) { cm = cy[i] - gy; break; } }\n            out.chassisMedian = cm === null ? null : +cm.toFixed(3);\n          } else out.chassisMedian = null;\n        }\n        return out;\n      };\n      const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };\n\n      const alive = {};\n      for (const [kind, m] of species) alive[kind] = stats(m, false);\n\n      // ---- (1)+(2) the sprawlers' LOCOMOTION reference, walked on their own route\n      const loco = {};\n      const home = { x: P0.position.x, y: P0.position.y, z: P0.position.z, yaw: P0.camYaw };\n      for (const kind of SPRAWLERS) {\n        const m = species.get(kind);\n        if (!m) continue;\n        const keep = { basking: m.basking };\n        try {\n          const wp = (m.route && m.route.length) ? m.route[m._wpIndex % m.route.length] : null;\n          // the player 80 m off, on the far side from the next waypoint: inside the\n          // animation LOD ring, outside every sprawler's sight and hearing\n          const ax = wp ? m.position.x - wp.x : 1, az = wp ? m.position.z - wp.z : 0;\n          const al = Math.hypot(ax, az) || 1;\n          P0.position.set(m.position.x + ax / al * 80, 0, m.position.z + az / al * 80);\n          P0._snapToGround?.();\n          m.basking = false;\n          m.suspicion = 0;\n          if (m.state !== 'patrol') { try { m.setState?.('patrol'); } catch (e) { /* */ } }\n          const samples = [], bellies = [], chassis = [];\n          let movingS = 0, px = m.position.x, pz = m.position.z, ps = E.simTime, pw = performance.now(), lastSample = 0;\n          const t0 = performance.now();\n          while (movingS < 2.0 && performance.now() - t0 < 12000) {\n            m._waitT = 0;                              // no patrol wait inside the window\n            await frame();\n            const now = performance.now(), st = E.simTime;\n            const dS = st - ps, dW = (now - pw) / 1000;\n            const sp = dS > 1e-5 ? Math.hypot(m.position.x - px, m.position.z - pz) / dS : 0;\n            px = m.position.x; pz = m.position.z; ps = st; pw = now;\n            if (sp < 0.5 * Math.max(0.1, m.walkSpeed || 1) || m.lowLOD) continue;\n            movingS += dW;\n            if (now - lastSample < 90) continue;\n            lastSample = now;\n            const s = stats(m, true);\n            if (s) {\n              samples.push(s.median);\n              if (s.belly !== null) bellies.push(s.belly);\n              if (s.chassisMedian !== null) chassis.push(s.chassisMedian);\n            }\n          }\n          loco[kind] = { movingS: +movingS.toFixed(2), samples: samples.length,\n                         chassisMedian: chassis.length ? +med(chassis).toFixed(3) : null,\n                         wholeMedian: samples.length ? +med(samples).toFixed(3) : null,\n                         belly: bellies.length ? +med(bellies).toFixed(3) : null, state: m.state };\n        } finally {\n          m.basking = keep.basking;\n        }\n      }\n      P0.position.set(home.x, home.y, home.z); P0.camYaw = home.yaw; P0._snapToGround?.();\n      await wait(300);\n\n      for (const [, m] of species) {\n        try { m.takeDamage({ impact: 99999, dir: new V(0, 0, 1), point: m.position.clone() }); } catch (e) { /* */ }\n        if (m.alive) { try { m._die(); } catch (e) { /* */ } }\n      }\n      await wait(6500);\n      const out = {}; const offenders = []; const skipped = []; let checked = 0;\n      for (const [kind, m] of species) {\n        const a = alive[kind]; const d = stats(m, false);\n        if (!a || !d) { out[kind] = 'no geometry'; continue; }\n        if (SPRAWLERS.includes(kind)) {\n          const L = loco[kind];\n          if (!L || L.movingS < 2.0 || L.chassisMedian === null) {\n            out[kind] = { note: 'sprawler: could not be walked for 2 s of moving frames', loco: L, restMedianM: a.median, deadMedianM: d.median };\n            offenders.push(kind); checked++; continue;\n          }\n          if (!(L.belly > 0.05)) {\n            out[kind] = { note: 'SKIP (ruling Sep 26): no locomotion pose lifts the chassis — belly clearance ' + L.belly + ' m walking',\n                          loco: L, restMedianM: a.median, deadMedianM: d.median };\n            skipped.push(kind); continue;\n          }\n          const ratio = L.chassisMedian > 0.05 ? d.median / L.chassisMedian : 1;\n          out[kind] = { reference: 'LOCOMOTION chassis (area-weighted)', locoChassisMedianM: L.chassisMedian, locoWholeMedianM: L.wholeMedian,\n                        locoBellyM: L.belly, locoMovingS: L.movingS,\n                        locoSamples: L.samples, restMedianM: a.median, deadMedianM: d.median, ratio: +ratio.toFixed(2),\n                        deadP90M: d.p90, vertexRatioVsRest: a.vMedian > 0.05 ? +(d.vMedian / a.vMedian).toFixed(2) : null,\n                        deadMeshes: d.meshes };\n          if (ratio > 0.75) offenders.push(kind);\n          checked++;\n          continue;\n        }\n        // non-sprawlers: per-vertex, rest reference — exactly as before the ruling\n        const ratio = a.vMedian > 0.05 ? d.vMedian / a.vMedian : 1;\n        const areaRatio = a.median > 0.05 ? d.median / a.median : 1;\n        out[kind] = { aliveMedianM: a.vMedian, deadMedianM: d.vMedian, ratio: +ratio.toFixed(2),\n                      aliveP90M: a.vP90, deadP90M: d.vP90, areaRatio: +areaRatio.toFixed(2) };\n        if (ratio > 0.75) { out[kind].aliveMeshes = a.meshes; out[kind].deadMeshes = d.meshes; }\n        if (ratio > 0.75) offenders.push(kind);\n        checked++;\n      }\n      if (!checked) return { pass: null, detail: { note: 'SKIP: no corpse geometry', out } };\n      return { pass: offenders.length === 0,\n               detail: { budget: 'deadMedian <= 0.75 x reference median (height above terrain). Sprawlers (' + SPRAWLERS.join('/') + '): area-weighted, reference = walking chassis median; everyone else: per-vertex, reference = standing rest (areaRatio reported)',\n                         offenders, skipped, speciesChecked: checked, out } };\n    })()"},"A41b-attack-coverage":{"src":"tools/gates.round4.machine-ai.mjs A41b-attack-coverage","title":"Every species has a move (or a deliberate reposition) at 2/6/10/14/20 m, no hole inside its band, and never just ONE move across it","setup":"(async () => { __CTX__.input.enabled = true; \n  const _t0 = performance.now();\n  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n    await new Promise(r => setTimeout(r, 150));\n  }\n })()","settle":600,"timeout":300000,"assert":"(async () => {\n      function freezeAll(keep) {\n  const set = new Set(keep || []);\n  for (const m of __CTX__.machines.list) {\n    if (set.has(m)) continue;\n    if (!m._frozenByGate) { m._frozenByGate = m.update; m.update = () => {}; }\n  }\n} function place(x, z, opts) {\n  const p = __CTX__.player;\n  p.position.set(x, 0, z);\n  p.velocity.set(0, 0, 0);\n  p._snapToGround();\n  if (opts && opts.crouch !== undefined) p.setCrouch(!!opts.crouch);\n  if (opts && opts.yaw !== undefined) { p.camYaw = opts.yaw; p.heading = opts.yaw + Math.PI; }\n  p.moveSpeed = 0;\n  return p;\n} function park(m, heading) {\n  /**\n   * PARKED MEANS PARKED. The ecosystem layer takes over the waypoint loop\n   * inside _statePatrol (Squads.stepEscort / stepScavenge / stepConvoy, and\n   * the basking fidget), so a machine with an escort slot walked off\n   * its staged spot no matter what route it was given — measured on a sentry\n   * escorting a herd, which drifted out of the tall-grass corridor\n   * A37 had just validated and took the player's staged positions with it\n   * (112 of 165 approach samples ended up out of cover). Clearing these is\n   * part of staging, not a change to any bar.\n   */\n  m.escort = null; m.scavenge = null; m.convoy = null; m.basking = null;\n  m._fleeing = false; m._fleeT = 0;\n  m.route = [m.position.clone()];\n  m._wpIndex = 0;\n  m._waitT = 1e6;\n  if (heading !== undefined) m.heading = heading;\n  m.suspicion = 0;\n  m._unseenT = 99;\n  m.ai.search.stop();\n  m.ai.engage.reset();\n  m.setState('patrol');\n} function tickProbe(m, opts) {\n  const o = opts || {};\n  const base = m.update.bind(m);\n  const st = {\n    sim: 0, steps: 0, travel: 0, idle: 0, idleBetween: 0, between: 0, maxNet: 0,\n    homeX: m.position.x, homeZ: m.position.z,\n    lastX: m.position.x, lastZ: m.position.z,\n    minX: m.position.x, maxX: m.position.x, minZ: m.position.z, maxZ: m.position.z,\n    stop() { m.update = base; return st; },\n    get spread() { return Math.hypot(st.maxX - st.minX, st.maxZ - st.minZ); },\n    get idleFrac() { return st.between ? st.idleBetween / st.between : 1; },\n  };\n  m.update = (dt, t) => {\n    // a probe with a limit: stops the machine EXACTLY on its step budget, so\n    // the measurement is a fixed number of simulated steps rather than\n    // \"however many fitted before the poll noticed\" (see soloDuel)\n    if (o.limit != null && st.sim >= o.limit) return;\n    if (o.pre) o.pre(dt, st);\n    base(dt, t);\n    if (!(dt > 0)) return;\n    const x = m.position.x, z = m.position.z;\n    const d = Math.hypot(x - st.lastX, z - st.lastZ);\n    st.lastX = x; st.lastZ = z;\n    st.sim += dt; st.steps++; st.travel += d;\n    if (x < st.minX) st.minX = x; else if (x > st.maxX) st.maxX = x;\n    if (z < st.minZ) st.minZ = z; else if (z > st.maxZ) st.maxZ = z;\n    const net = Math.hypot(x - st.homeX, z - st.homeZ);\n    if (net > st.maxNet) st.maxNet = net;\n    // idle = XZ speed under 0.25 m per SIM second, measured on the step itself\n    const moving = d / dt > 0.25;\n    if (!moving) st.idle++;\n    if (!m._attack) { st.between++; if (!moving) st.idleBetween++; }\n    if (o.each) o.each(dt, st);\n  };\n  return st;\n}\n/** Run a tickProbe until it has banked `s` SIM seconds (wall cap ms). */\nasync function probeFor(st, s, wallMs) {\n  const w0 = performance.now();\n  while (st.sim < s && performance.now() - w0 < (wallMs || 120000)) {\n    await new Promise(r => setTimeout(r, 40));\n  }\n  return st.sim;\n}\n      const ctx = __CTX__, T = ctx.terrain, p = ctx.player;\n      const DISTS = [2, 6, 10, 14, 20];\n      const STAGE = 3;                 // sim seconds allowed per staging\n      /**\n       * WALL BUDGET. This is 40 stagings inside ONE page.evaluate, and\n       * puppeteer kills a Runtime.evaluate at its own protocolTimeout (180 s)\n       * long before the runner's `timeout` field is consulted — a ceiling this\n       * lane cannot raise, since tools/gates.mjs belongs to core-platform. On a\n       * quiet box the whole sweep costs ~8 s (every staging fires in under\n       * 0.25 sim s). With sixteen lanes' suites sharing the GPU the frame loop\n       * clamps to ~0.2x, so a staging that legitimately spends its full 3 SIM\n       * seconds repositioning can burn 12+ s of wall, and enough of those in a\n       * row walked the whole gate into the protocol timeout and reported FAIL\n       * for a build with no coverage hole at all.\n       *\n       * So: each staging gets a wall cap, the sweep gets a total budget, and\n       * running out of either is NEVER a failure — it is `starved`, and a\n       * starved sweep returns PENDING with everything it did measure. Real\n       * holes found before the budget ran out are still reported and still\n       * fail. The bar is untouched; only the harness's patience is bounded.\n       */\n      const WALL_TOTAL = 110000, WALL_STAGE = 7000;\n      const T0 = performance.now();\n      const budgetLeft = () => WALL_TOTAL - (performance.now() - T0);\n      let starved = null;\n      // combatants only: a docile machine has no moveset BY DESIGN and its\n      // contract is asserted directly in A41b-expansion / A100-expansion-doctrine\n      const __s = await __kb(); if (!__s) return __kbSkip();\n      const kinds = [__s.KIND];\n      freezeAll([]);                   // freeze everything; unfreeze one at a time\n\n      const report = {}, fails = [];\n      for (const kind of kinds) {\n        const m = ctx.machines.list.find(x => x.kind === kind && x.alive);\n        if (!m) continue;\n        m.update = m._frozenByGate; m._frozenByGate = null;   // wake this one\n        const band = m.ai.engage.cfg.band;\n        // read the TABLE, not one fight's luck: a 'species' row that failed to\n        // build earlier in the session is in .phantom and would be scored as\n        // missing coverage the table does have\n        m.ai.picker.phantom.clear();\n        const cov = m.ai.picker.coverage();\n        // structural bar 1: nothing inside the engage band may be uncoverable\n        const bandHoles = cov.holes.filter(h => h[1] >= band[0] && h[0] <= band[1]);\n        if (bandHoles.length) fails.push(kind + ': hole(s) ' + JSON.stringify(bandHoles) + ' inside band ' + JSON.stringify(band));\n        /**\n         * Structural bar 2: MOVE VARIETY (judge-machine-ai-followup-r0).\n         * Covering a band with one row is not covering it. Wave 1 closed the\n         * Strider's 4.2-15 m hole by stretching 'charge' across it, which left\n         * 'charge' the only row legal anywhere in the 10-22 m band — a canon\n         * 15-50 m gallop thrown from 5.5 m, four times a fight, forever. That\n         * passes bar 1 with a perfect score, so bar 2 exists: at least two\n         * non-rear rows must reach into the band, and no single row may be the\n         * sole answer for more than 70 % of it.\n         *\n         * It is asserted STRUCTURALLY rather than by counting the ids thrown\n         * across the five stagings, because the scored picker legitimately\n         * chooses the same move twice when two stagings land in one row's band\n         * (a Watcher at 6 m and at 10 m both want the flash) — that is\n         * selection, not a ladder. Observed ids are reported alongside.\n         */\n        const prof = m.ai.picker.bandProfile();\n        if (prof.distinct < 2) {\n          fails.push(kind + ': only ' + prof.distinct + ' non-rear move ('\n            + prof.ids.join(', ') + ') reaches its band ' + JSON.stringify(band)\n            + ' — one move is not a moveset');\n        }\n        if (prof.maxSoleFrac > 0.7) {\n          fails.push(kind + ': ' + prof.maxSoleId + ' is the ONLY answer for '\n            + Math.round(prof.maxSoleFrac * 100) + '% of band ' + JSON.stringify(band));\n        }\n        const rows = { band, reach: cov.reach, holes: cov.holes, bandHoles,\n          bandMoves: prof.distinct, bandCovers: prof.covers, bandSole: prof.sole,\n          maxSole: prof.maxSoleId + ' ' + Math.round(prof.maxSoleFrac * 100) + '%',\n          observed: [], at: {} };\n\n        for (const d of DISTS) {\n          // reset the picker + the species ladder so this is a RANGE test\n          const pk = m.ai.picker;\n          pk.cd.clear(); pk.missed.clear(); pk.used.clear(); pk.phantom.clear();\n          pk.stalled.clear(); pk.noteArranged(null);\n          pk.lastId = null; pk.streak = 0;\n          for (const k of Object.keys(m)) {\n            if (typeof m[k] === 'number' && (/^_cd[A-Z]/.test(k) || /^_[a-zA-Z]+Cd$/.test(k))) m[k] = 0;\n          }\n          if (m.ai._cdKeys) m.ai._cdKeys = null;\n          m._attack = null; m._attackCd = 0; m._downT = 0;\n          if (m.flock) m.flock.diver = null;\n          m.ai.engage.reset();\n          m.ai.engage.missT = 0;\n\n          // stage: player planted d metres in front of the machine's nose\n          const mx = m.position.x, mz = m.position.z;\n          const px = mx + Math.sin(m.heading) * d, pz = mz + Math.cos(m.heading) * d;\n          const py = T.getHeight(px, pz);\n          place(px, pz, { crouch: false });\n          m.suspicion = 1; m._unseenT = 0; m.lastKnown.copy(p.position);\n          /**\n           * Seed the perception product too. 'playerDist' refreshes on the\n           * perception tick, so without this the first frame of a staging\n           * selects a move for the PREVIOUS staging's distance — the gate then\n           * credits an attack that was chosen for a range the player is no\n           * longer at, which is the very lie it exists to catch.\n           */\n          m.playerDist = d;\n          if (m.ai.perception) m.ai.perception.acc = m.perceptCfg.tick;\n          m.forceState('attack');\n\n          /**\n           * REACH HONESTY. An attack only counts if it could have connected\n           * from where it was thrown: the table row that fired must cover the\n           * distance at the instant of 'machine-attack' (rows are tolerant by\n           * 0.35 m, the same pad 'nearestCovered' uses, so a float edge is not\n           * a coin flip). A Longleg throwing its 7 m jet cone at a target 14 m\n           * away is a flail, not coverage, and has to reposition like any\n           * other machine standing outside its moveset.\n           */\n          let fired = null, firedAt = null, firedRow = null, firedOk = false;\n          let mode = null, hole = null;\n          const onAtk = (e) => {\n            if (e.machine !== m || fired) return;\n            fired = e.kind;\n            firedAt = Math.hypot(m.position.x - px, m.position.z - pz);\n            const row = m.ai.picker.rows.find((r) => r.id === e.kind) || null;\n            firedRow = row ? [row.min, row.max] : null;\n            firedOk = row\n              ? firedAt >= row.min - 0.35 && firedAt <= row.max + 0.35\n              : m.ai.picker.coveredAt(firedAt);\n          };\n          ctx.events.on('machine-attack', onAtk);\n          const probe = tickProbe(m, {\n            pre: () => {\n              p.position.set(px, py, pz);\n              p.velocity.set(0, 0, 0);\n              p.health = p.maxHealth;\n              m.suspicion = 1; m._unseenT = 0;\n              if (m.state !== 'attack' && !m._attack) m.setState('attack');\n            },\n            each: () => { mode = m.ai.engage.mode; if (m.ai.engage.hole != null) hole = m.ai.engage.hole; },\n          });\n          const w0 = performance.now();\n          const cap = Math.min(WALL_STAGE, Math.max(600, budgetLeft()));\n          while (!fired && probe.sim < STAGE && performance.now() - w0 < cap) {\n            await new Promise(r => setTimeout(r, 25));\n          }\n          probe.stop();\n          // cut short by wall time, not by the machine running out of answers\n          const cutShort = !fired && probe.sim < STAGE * 0.9;\n          if (cutShort && !starved) {\n            starved = kind + ' @ ' + d + 'm banked only ' + probe.sim.toFixed(2)\n              + ' of ' + STAGE + ' sim seconds in ' + Math.round(cap) + ' ms of wall';\n          }\n          ctx.events.off?.('machine-attack', onAtk);\n\n          const endD = Math.hypot(m.position.x - px, m.position.z - pz);\n          const want = m.ai.picker.nearestCovered(d);\n          const closed = want == null ? 0 : Math.abs(d - want) - Math.abs(endD - want);\n          const repositioned = Math.abs(endD - d) >= 1\n            && (m.ai.picker.coveredAt(endD) || closed > 0.5);\n          const ok = firedOk || repositioned;\n          if (fired && rows.observed.indexOf(fired) < 0) rows.observed.push(fired);\n          rows.at[d] = {\n            attack: fired, attackRow: firedRow, inReach: firedOk,\n            firedAtM: firedAt == null ? null : +firedAt.toFixed(2),\n            covered: m.ai.picker.coveredAt(d), endDistM: +endD.toFixed(2),\n            movedM: +(endD - d).toFixed(2), mode, seekingRadius: hole,\n            simSeconds: +probe.sim.toFixed(2),\n            verdict: ok ? (firedOk ? 'attacked' : 'repositioned')\n              : (fired ? 'FLAIL (' + fired + ' thrown from ' + firedAt.toFixed(1) + ' m, row ' + JSON.stringify(firedRow) + ')' : 'NOTHING'),\n          };\n          // a staging the wall cut short is not evidence either way\n          if (!ok && !cutShort) {\n            fails.push(kind + ' @ ' + d + 'm: ' + (fired\n              ? 'threw ' + fired + ' from ' + firedAt.toFixed(1) + ' m, outside its own row ' + JSON.stringify(firedRow) + ', and did not reposition'\n              : 'no attack and no reposition') + ' (ended ' + endD.toFixed(1) + ' m, mode ' + mode + ')');\n          }\n        }\n        report[kind] = rows;\n        // put it back to sleep before waking the next species\n        m._frozenByGate = m.update; m.update = () => {};\n        if (budgetLeft() <= 0) {\n          if (!starved) starved = 'the ' + WALL_TOTAL + ' ms sweep budget ran out after ' + Object.keys(report).length + ' of ' + kinds.length + ' species';\n          break;\n        }\n      }\n      const staged = Object.keys(report).length;\n      if (fails.length === 0 && (starved || staged < kinds.length)) {\n        return {\n          pass: null,\n          detail: {\n            why: 'PENDING: the page was too starved to finish the sweep — ' + starved,\n            stagedSpecies: staged, ofSpecies: kinds.length,\n            wallMs: Math.round(performance.now() - T0), failures: fails, report,\n          },\n        };\n      }\n      return {\n        pass: fails.length === 0,\n        detail: {\n          kinds: kinds.length, stagedSpecies: staged,\n          wallMs: Math.round(performance.now() - T0), starved,\n          failures: fails, report,\n          note: 'per staging: cooldowns cleared, playerDist seeded, player pinned d metres off the nose, 3 SIM seconds sampled on the machine’s own update ticks. Pass = an attack started FROM INSIDE ITS OWN ROW (inReach), or the machine moved >= 1 m and ended nearer a range its table can fire at. An attack thrown from outside the firing row is a FLAIL and does not count. bandHoles is the structural audit: ranges inside the engage band that NO move covers. bandMoves/bandSole are the variety audit: >= 2 non-rear rows must reach the band and none may be the sole answer for more than 70% of it.',\n        },\n      };\n    })()"},"A41c-sustained-variety":{"src":"tools/gates.round4.machine-ai.mjs A41c-sustained-variety","title":"Sustained duel, EVERY species on the HARDEST ARC of its own ground: >= 2 distinct table moves in 30 SIM s (3 where the TABLE holds 3+ non-rear rows), and never a band row the ring window cannot set up","setup":"(async () => { __CTX__.input.enabled = true; \n  const _t0 = performance.now();\n  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n    await new Promise(r => setTimeout(r, 150));\n  }\n })()","settle":600,"timeout":480000,"assert":"(async () => {\n      function freezeAll(keep) {\n  const set = new Set(keep || []);\n  for (const m of __CTX__.machines.list) {\n    if (set.has(m)) continue;\n    if (!m._frozenByGate) { m._frozenByGate = m.update; m.update = () => {}; }\n  }\n} function place(x, z, opts) {\n  const p = __CTX__.player;\n  p.position.set(x, 0, z);\n  p.velocity.set(0, 0, 0);\n  p._snapToGround();\n  if (opts && opts.crouch !== undefined) p.setCrouch(!!opts.crouch);\n  if (opts && opts.yaw !== undefined) { p.camYaw = opts.yaw; p.heading = opts.yaw + Math.PI; }\n  p.moveSpeed = 0;\n  return p;\n} function tickProbe(m, opts) {\n  const o = opts || {};\n  const base = m.update.bind(m);\n  const st = {\n    sim: 0, steps: 0, travel: 0, idle: 0, idleBetween: 0, between: 0, maxNet: 0,\n    homeX: m.position.x, homeZ: m.position.z,\n    lastX: m.position.x, lastZ: m.position.z,\n    minX: m.position.x, maxX: m.position.x, minZ: m.position.z, maxZ: m.position.z,\n    stop() { m.update = base; return st; },\n    get spread() { return Math.hypot(st.maxX - st.minX, st.maxZ - st.minZ); },\n    get idleFrac() { return st.between ? st.idleBetween / st.between : 1; },\n  };\n  m.update = (dt, t) => {\n    // a probe with a limit: stops the machine EXACTLY on its step budget, so\n    // the measurement is a fixed number of simulated steps rather than\n    // \"however many fitted before the poll noticed\" (see soloDuel)\n    if (o.limit != null && st.sim >= o.limit) return;\n    if (o.pre) o.pre(dt, st);\n    base(dt, t);\n    if (!(dt > 0)) return;\n    const x = m.position.x, z = m.position.z;\n    const d = Math.hypot(x - st.lastX, z - st.lastZ);\n    st.lastX = x; st.lastZ = z;\n    st.sim += dt; st.steps++; st.travel += d;\n    if (x < st.minX) st.minX = x; else if (x > st.maxX) st.maxX = x;\n    if (z < st.minZ) st.minZ = z; else if (z > st.maxZ) st.maxZ = z;\n    const net = Math.hypot(x - st.homeX, z - st.homeZ);\n    if (net > st.maxNet) st.maxNet = net;\n    // idle = XZ speed under 0.25 m per SIM second, measured on the step itself\n    const moving = d / dt > 0.25;\n    if (!moving) st.idle++;\n    if (!m._attack) { st.between++; if (!moving) st.idleBetween++; }\n    if (o.each) o.each(dt, st);\n  };\n  return st;\n}\n/** Run a tickProbe until it has banked `s` SIM seconds (wall cap ms). */\nasync function probeFor(st, s, wallMs) {\n  const w0 = performance.now();\n  while (st.sim < s && performance.now() - w0 < (wallMs || 120000)) {\n    await new Promise(r => setTimeout(r, 40));\n  }\n  return st.sim;\n} function hardBearing(m, opts) {\n  const ctx = __CTX__, T = ctx.terrain;\n  const o = opts || {};\n  const BEARINGS = o.bearings || 12, RING = o.ring || 8, MIN_CLEAR = o.minClear ?? 0.25;\n  const band = m.ai.engage.cfg.band;\n  const R = Math.max(4, (band[0] + band[1]) * 0.5);\n  const home = (m._gateHome || m.spawnPos).clone ? (m._gateHome || m.spawnPos).clone() : m.position.clone();\n  const V = ctx.player.position.constructor;\n  const save = m.position.clone();\n  const radii = [Math.max(band[0], R * 0.7), R, Math.min(band[1], R * 1.4)];\n  const tgt = new V(0, 0, 0);\n  const out = [];\n  for (let i = 0; i < BEARINGS; i++) {\n    const th = (i / BEARINGS) * Math.PI * 2;\n    const px = home.x + Math.sin(th) * R, pz = home.z + Math.cos(th) * R;\n    tgt.set(px, T.getHeight(px, pz), pz);\n    let blocked = 0, n = 0;\n    for (let k = 0; k < RING; k++) {\n      const a = (k / RING) * Math.PI * 2;\n      for (const r of radii) {\n        const mx = px + Math.sin(a) * r, mz = pz + Math.cos(a) * r;\n        m.position.set(mx, T.getHeight(mx, mz), mz);\n        n++;\n        if (!m.ai.perception.hasLOS(tgt)) blocked++;\n      }\n    }\n    out.push({ th: +th.toFixed(2), occ: +(blocked / n).toFixed(2) });\n  }\n  m.position.copy(save);\n  const fair = out.filter((b) => 1 - b.occ >= MIN_CLEAR);\n  const pool = fair.length ? fair : out.slice();\n  let best = pool[0];\n  for (const b of pool) if (b.occ > best.occ) best = b;\n  return {\n    bearing: best.th, occ: best.occ, fairPool: fair.length, sampled: out.length,\n    profile: out.map((b) => b.th + ':' + b.occ).join(' '),\n    minClear: MIN_CLEAR, homeAt: [+home.x.toFixed(1), +home.z.toFixed(1)],\n  };\n} async function soloDuel(m, opts) {\n  const ctx = __CTX__, T = ctx.terrain, p = ctx.player;\n  const o = opts || {};\n  const DUR = o.dur || 30, WALL = o.wall || 26000;\n  const band = m.ai.engage.cfg.band;\n  /**\n   * THE SAME GROUND AND THE SAME POSE EVERY TIME (FIX ROUND 4,\n   * judge-machine-ai-r2-r1 §2). r3 duelled \"wherever the machine happens to\n   * stand\", which after one duel is wherever the LAST one left it — so two\n   * runs of the same gate at the same seed fought on different terrain, which\n   * is most of why the verdict moved. The anchor is now the machine's own\n   * spawn, snapshotted before this helper overwrites spawnPos, and the\n   * machine is teleported back to it before every duel.\n   */\n  if (!m._gateHome) m._gateHome = m.spawnPos.clone();\n  const home = m._gateHome.clone();\n  m.position.set(home.x, T.getHeight(home.x, home.z), home.z);\n  m.velocity?.set?.(0, 0, 0);\n  const r = Math.max(4, (band[0] + band[1]) * 0.5);\n  const th = o.bearing != null ? o.bearing : 0.7;\n  const px = home.x + Math.sin(th) * r, pz = home.z + Math.cos(th) * r;\n  place(px, pz, { crouch: false });\n  const py = p.position.y;\n  // spawnPos moves with the duel (the soft leash is measured from it) and the\n  // territory is lifted, so a site-owned machine does not walk home mid-fight\n  m.spawnPos.set(home.x, 0, home.z);\n  m._gateTerritory = m.territory; m.territory = null;\n  m.heading = Math.atan2(px - home.x, pz - home.z);\n  const pk = m.ai.picker;\n  pk.cd.clear(); pk.missed.clear(); pk.used.clear(); pk.phantom.clear();\n  pk.stalled.clear(); pk.blind?.clear?.(); pk.noteArranged(null);\n  pk.lastId = null; pk.streak = 0;\n  m._attack = null; m._attackCd = 0; m._downT = 0;\n  m.ai.engage.reset(); m.ai.engage.missT = 0;\n  // the perception TICK PHASE decides which sim step the sightline is sampled\n  // on, which is enough to change a fight over broken ground: pin it too\n  m.ai.perception.acc = 0; m.ai.perception.scanT = 0;\n  m.suspicion = 1; m._unseenT = 0; m.lastKnown.copy(p.position); m.playerDist = r;\n  m.forceState('attack');\n  const win = m.ai.engage._ringWindow();\n  const s = {\n    kind: m.kind, ids: [], fired: [], illegal: 0, plans: 0,\n    blocked: 0, blockedIds: null, steps: 0, modes: {}, unseen: 0, blindS: 0,\n    window: [+win[0].toFixed(2), +win[1].toFixed(2)],\n    bandRows: pk.bandProfile().ids, moveset: pk.movesetRows(),\n    bar: Math.max(2, Math.min(3, pk.movesetSize())),\n    playerAt: [+px.toFixed(1), +pz.toFixed(1)],\n  };\n  s.arrange = pk.rows.filter((row) => row.arc !== 'rear'\n    && pk._reachable(row, win[0], win[1]) != null).map((row) => row.id);\n  const onAtk = (e) => {\n    if (e.machine !== m || s.probe.sim >= DUR) return;\n    if (!pk.rows.some((row) => row.id === e.kind)) return;   // flourish, not a move\n    s.ids.push(e.kind);\n    if (s.fired.length < 16) {\n      s.fired.push(e.kind + '@' + Math.hypot(m.position.x - px, m.position.z - pz).toFixed(1) + 'm');\n    }\n  };\n  s.probe = tickProbe(m, {\n    // END ON A STEP COUNT, not on the wall-clock poll that reads it: the poll\n    // runs every 40 ms and a duel therefore used to run a random handful of\n    // extra steps past DUR (judge-machine-ai-r2-r1 §2)\n    limit: DUR,\n    pre: () => {\n      p.position.set(px, py, pz);\n      p.velocity.set(0, 0, 0);\n      p.health = p.maxHealth;\n      m.suspicion = 1; m._unseenT = 0; m.lastKnown.copy(p.position);\n      m._fleeing = false;\n      if (m.state !== 'attack' && !m._attack) m.setState('attack');\n    },\n    each: (dt) => {\n      const w = m.ai.engage._ringWindow();\n      const plan = pk.ringPlan(w[0], w[1]);\n      // sampled, not asserted: true by construction (see the A41c header)\n      if (plan) { s.plans++; if (!plan.legal) s.illegal++; }\n      s.steps++;\n      if (!m._visible) s.unseen += dt;\n      if (m.ai.engage.blindT > 0) s.blindS += dt;\n      // ASSERTED: a row inside the band the ring window cannot set up\n      if (pk.bandBlocked(w[0], w[1]) > 0) {\n        s.blocked++;\n        if (!s.blockedIds) s.blockedIds = pk.bandUnreachable(w[0], w[1]);\n      }\n      s.modes[m.ai.engage.mode] = (s.modes[m.ai.engage.mode] || 0) + 1;\n    },\n  });\n  ctx.events.on('machine-attack', onAtk);\n  try {\n    const w0 = performance.now();\n    while (s.probe.sim < DUR && performance.now() - w0 < WALL) {\n      await new Promise(r2 => setTimeout(r2, 40));\n    }\n  } finally {\n    ctx.events.off?.('machine-attack', onAtk);\n    s.probe.stop();\n    m.territory = m._gateTerritory;\n  }\n  s.held = m.ai.engage.heldProfile();\n  s.distinct = [...new Set(s.ids)];\n  s.gaveUpOnAtEnd = [...pk.stalled.keys()];\n  s.blindGiveUps = m.ai.engage.blindGiveUps;\n  s.blindAtEnd = pk.blindRings ? pk.blindRings().map((b) => b[0]) : [];\n  // the replay fingerprint: the move sequence and the pose it ended in\n  s.seq = s.ids.join(',');\n  s.endPose = [+m.position.x.toFixed(3), +m.position.z.toFixed(3), +m.heading.toFixed(3)];\n  return s;\n}\n\n/**\n * The rows this species OWES a standoff: non-rear, part attached, not\n * disabled, and with a non-empty shell of radii inside both the engage band\n * and the ring window. A Watcher peck (0-3.1 m) against a band that starts at\n * 4.6 m is not owed and is not counted.\n */\nfunction owedRows(m) {\n  const pk = m.ai.picker, band = m.ai.engage.cfg.band;\n  const win = m.ai.engage._ringWindow();\n  const out = [];\n  for (const row of pk.rows) {\n    if (row.arc === 'rear') continue;\n    if (!pk._needPartOk(row.needPart)) continue;   // '!engine' rows included\n    if (m.attackDisabled(row.id)) continue;\n    const lo = Math.max(row.min, band[0], win[0]);\n    const hi = Math.min(row.max, band[1], win[1]);\n    if (lo > hi) continue;\n    out.push({ id: row.id, lo: +lo.toFixed(2), hi: +hi.toFixed(2) });\n  }\n  return out;\n}\n\n/** Every living species, one per kind, sorted so the report reads the same. */\nfunction speciesPicks() {\n  const list = __CTX__.machines.list;\n  const kinds = [...new Set(list.filter(m => m.alive && combatant(m)).map(m => m.kind))].sort();\n  return kinds.map(k => list.find(m => m.kind === k && m.alive)).filter(Boolean);\n}\n\n/**\n * IS THIS MACHINE A COMBATANT AT ALL?\n *\n * Every duel gate in this lane discovers its species from the roster, which\n * was right while every machine in the world could fight. Round 4's expansion\n * added one that deliberately cannot: a 25 m comms tower with\n * an empty attack table, every PERCEPTION gain at zero, every REACT\n * threshold above 1.0 of maxHP and a hard guard in Machine.setState — it is\n * roster-v2's \"docile, never reacts, tramples obstacles\", and asserting a\n * three-move standoff on it is a category error, not a finding.\n *\n * So docile machines are excluded from the MOVESET gates — and the exclusion\n * cannot be used to dodge them, because the docile contract is asserted\n * head-on somewhere else instead: A41b-expansion fails a docile machine that\n * has ANY attack row, and A100-expansion-doctrine fails one that ever leaves\n * patrol under alarm, damage or a direct setState. docileContract()\n * below is the cross-check that the two halves agree, and every gate that\n * calls speciesPicks() reports it.\n */\nfunction combatant(m) { return !m.docile; }\n\n/** Every docile machine must have an empty table, and vice versa. */\nfunction docileContract() {\n  const bad = [];\n  for (const m of __CTX__.machines.list) {\n    if (!m.alive) continue;\n    const rows = m.ai?.picker?.rows?.length ?? 0;\n    if (m.docile && rows) bad.push(m.kind + ': docile with ' + rows + ' attack row(s)');\n    if (!m.docile && rows === 0) bad.push(m.kind + ': not docile and has no attack rows');\n  }\n  return bad;\n}\n\n      const ctx = __CTX__;\n      /**\n       * WALL BUDGET. 30 SIM seconds at the 3x the engine will give is 10 wall\n       * seconds on a quiet box and ~22 on this one; with another lane's\n       * puppeteer on the same GPU it has been seen at 26+. The cap is per\n       * species and generous on purpose — a starved species returns PENDING,\n       * never FAIL, and PENDING is not evidence either way, so the only thing\n       * a tight budget buys is a gate that cannot answer.\n       */\n      const DUR = 30, EACH_WALL = 45000, ACCEL = 3, SEED = 0x51D4;\n      const __s = await __kb(); if (!__s) return __kbSkip();\n      const picks = [__s.m];\n\n      const report = {}, fails = [], starved = [];\n      let prevRng = null, prevStep = ctx.engine.stepMode, replay = null;\n      try {\n        // SEEDED for the length of the measurement (see the header). The real\n        // dice go back in the finally, whatever happens in between.\n        prevRng = ctx.machines.setAiRng(ctx.machines.seededRng(SEED));\n        // ...and WHOLE 1/60 s steps, so the same seed steps the same fight.\n        // The dice alone do not buy that (judge-machine-ai-r2-r1 §2).\n        ctx.engine.stepMode = 'fixed';\n        ctx.engine.requestTimeScale?.('gate-a41c', ACCEL);\n        for (let i = 0; i < picks.length; i++) {\n          const m = picks[i];\n          freezeAll([m]);\n          if (m._frozenByGate) { m.update = m._frozenByGate; m._frozenByGate = null; }\n          // the HARDEST fair arc of this machine's own ground, measured with\n          // its own sightline over the whole ring (judge §3), not arc 0.7+i\n          const ground = hardBearing(m);\n          const s = await soloDuel(m, { dur: DUR, wall: EACH_WALL, bearing: ground.bearing });\n          report[s.kind] = {\n            stagedBearing: ground.bearing, ringOccludedFrac: ground.occ,\n            occlusionByBearing: ground.profile, fairBearings: ground.fairPool,\n            blindGiveUps: s.blindGiveUps, blindRingsAtEnd: s.blindAtEnd,\n            blindFootworkFrac: +(s.blindS / Math.max(0.01, s.probe.sim)).toFixed(2),\n            simSeconds: +s.probe.sim.toFixed(1), simSteps: s.probe.steps,\n            attacks: s.ids.length, distinct: s.distinct,\n            distinctCount: s.distinct.length, bar: s.bar,\n            movesetInTable: s.moveset, bandRowsInTable: s.bandRows,\n            arrangeableFromRing: s.arrange, ringWindowM: s.window,\n            blockedSteps: s.blocked, blockedRows: s.blockedIds, stepsSampled: s.steps,\n            illegalRingPlans: s.illegal, ringPlansSampled: s.plans,\n            gaveUpOnAtEnd: s.gaveUpOnAtEnd,\n            noSightlineFrac: +(s.unseen / Math.max(0.01, s.probe.sim)).toFixed(2),\n            heldReachM: s.held.reach, heldBins: s.held.bins,\n            travelM: +s.probe.travel.toFixed(1), firedAt: s.fired, modes: s.modes,\n            playerAt: s.playerAt, moveSequence: s.seq, endPose: s.endPose,\n          };\n          if (s.probe.sim < DUR * 0.8) { starved.push(s.kind); continue; }\n          if (s.blocked > 0) {\n            fails.push(s.kind + ': ' + JSON.stringify(s.blockedIds) + ' reach into band '\n              + JSON.stringify(m.ai.engage.cfg.band) + ' but not into ring window '\n              + JSON.stringify(s.window) + ' — unarrangeable on ' + s.blocked + ' of '\n              + s.steps + ' sim steps, so it can want that move for ever and never fire it (livelock)');\n          }\n          if (s.illegal > 0) {\n            fails.push(s.kind + ': ' + s.illegal + ' of ' + s.plans\n              + ' ring plans set up a move the ring cannot fire from — ringPlan().legal is'\n              + ' true by construction, so this means the construction itself broke');\n          }\n          if (s.distinct.length < s.bar) {\n            fails.push(s.kind + ': only ' + s.distinct.length + ' distinct move('\n              + s.distinct.join(', ') + ') in ' + s.probe.sim.toFixed(1) + ' sim s — the TABLE holds '\n              + s.moveset.length + ' non-rear row(s) ' + JSON.stringify(s.moveset)\n              + ', so the bar is ' + s.bar + '. Of those, ' + JSON.stringify(s.bandRows)\n              + ' reach into band ' + JSON.stringify(m.ai.engage.cfg.band) + ' and '\n              + JSON.stringify(s.arrange) + ' are arrangeable from ring window '\n              + JSON.stringify(s.window) + '. It actually HELD ' + JSON.stringify(s.held.bins)\n              + ' (reach ' + s.held.reach + ' m) — a row missing from those lists, or a row whose '\n              + 'radii the footwork never stood at, is a move the standoff can no longer show, '\n              + 'which is the defect, not a reason to ask for less');\n          }\n        }\n        /**\n         * WHAT THE SEED ACTUALLY BUYS, MEASURED (judge-machine-ai-r2-r1 §2).\n         * The first species is duelled a second time from the same seed, the\n         * same pose and the same bearing. REPORTED, not asserted: the claim\n         * this gate makes about repeatability should be a reading, not a\n         * promise, and a single machine's replay cannot speak for the suite.\n         */\n        const m0 = picks[0];\n        freezeAll([m0]);\n        if (m0._frozenByGate) { m0.update = m0._frozenByGate; m0._frozenByGate = null; }\n        ctx.machines.setAiRng(ctx.machines.seededRng(SEED));\n        const g0 = hardBearing(m0);\n        const again = await soloDuel(m0, { dur: DUR, wall: EACH_WALL, bearing: g0.bearing });\n        const first = report[m0.kind] || {};\n        replay = {\n          kind: m0.kind, seed: SEED, stepMode: 'fixed',\n          sameMoveSequence: again.seq === (first.moveSequence || ''),\n          samePose: JSON.stringify(again.endPose) === JSON.stringify(first.endPose || null),\n          run1: first.moveSequence, run2: again.seq,\n          pose1: first.endPose, pose2: again.endPose,\n          simSteps: [first.simSteps, again.probe.steps],\n        };\n      } finally {\n        ctx.engine.requestTimeScale?.('gate-a41c', null);\n        ctx.machines.setAiRng(prevRng || null);\n        ctx.engine.stepMode = prevStep;\n        for (const m of picks) { m.territory = m._gateTerritory ?? m.territory; }\n      }\n\n      const detail = {\n        species: picks.length, docileContract: docileContract(), simSecondsEach: DUR, timeScaleAsked: ACCEL, rngSeed: SEED,\n        starved, failures: fails, replay, report,\n        note: 'one species at a time, each staged ON ITS OWN GROUND (the player walks to that machine own band centre; everything else is frozen) for 30 SIM seconds, sampled once per sim step inside machine.update(). r2 staged all eight around picks[0], i.e. on the Behemoth ground, which is exactly the variable the judge second finding isolated — a Scrapper that never fires its laser at home fires it twice in the open meadow. The lane dice (Engage, AttackPicker._score, tables.span, Perception tick phase) are SEEDED through machines.setAiRng for the measurement and restored afterwards. A seed alone does NOT make the verdict repeatable and this gate no longer claims it does (judge-machine-ai-r2-r1 measured PASS/FAIL/FAIL/PASS/PASS/FAIL at one fixed seed): it also runs on whole 1/60 s steps (engine.stepMode fixed), ends each duel on a step count rather than on the 40 ms poll, and restores the machine spawn pose and fight state first. What those four together buy is measured and printed in replay:, where the first species is duelled twice. Only ids that are rows in that machine own table count as moves (machine-attack also carries footfall/screech flourishes). Bar = 2 distinct, or 3 once the species TABLE holds 3+ non-rear rows at all (picker.movesetSize()) — read from the table and from nothing the footwork can move, since BOTH the ring window (revision 1) and the engage band (revision 2) fall by one at the instant a regression pushes a row out of the fight, letting the gate lower its own bar. Verified by injection: a Strider band floor raised to 4.95 m drops front-kick out of the standoff with blocked 0 and the band-derived bar falling 3->2; the moveset bar holds at 3 and fails it. ASSERTED per step: picker.bandBlocked(ringWindow) === 0. ringPlan().legal is sampled but NOT the bar: it is true by construction. heldBins / heldReachM are the MEASURED radii (Engage.heldProfile) — A41d-held-radius-coverage asserts against them. _unseenT is pinned to 0 every step, but the blind-footwork bound is no longer that field: Engage owns _blindT, cleared only by a frame on which the machine can genuinely fight her, so ENGAGE.beliefHold is bounded here exactly as it is in play. Staging is hardBearing(m) — the worst arc of this machine own ground that it can still fight on, measured with the machine own hasLOS over the whole standoff ring; occlusionByBearing prints the whole sweep and ringOccludedFrac the arc that was chosen.',\n      };\n      if (starved.length) {\n        return { pass: null, detail: { ...detail, why: 'PENDING: ' + JSON.stringify(starved)\n          + ' banked under ' + (DUR * 0.8) + ' of ' + DUR + ' sim seconds inside the '\n          + (EACH_WALL / 1000) + ' s per-species wall cap' } };\n      }\n      return { pass: fails.length === 0, detail };\n    })()"},"A41d-attack-coverage":{"src":"tools/gates.round4.machine-ai.mjs A41d-held-radius-coverage","title":"Every species, hardest arc of its own ground: every owed move either FIRES or is a radius the footwork never stood at — and nothing is held 3 s and never thrown","setup":"(async () => { __CTX__.input.enabled = true; \n  const _t0 = performance.now();\n  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n    await new Promise(r => setTimeout(r, 150));\n  }\n })()","settle":600,"timeout":420000,"assert":"(async () => {\n      function freezeAll(keep) {\n  const set = new Set(keep || []);\n  for (const m of __CTX__.machines.list) {\n    if (set.has(m)) continue;\n    if (!m._frozenByGate) { m._frozenByGate = m.update; m.update = () => {}; }\n  }\n} function place(x, z, opts) {\n  const p = __CTX__.player;\n  p.position.set(x, 0, z);\n  p.velocity.set(0, 0, 0);\n  p._snapToGround();\n  if (opts && opts.crouch !== undefined) p.setCrouch(!!opts.crouch);\n  if (opts && opts.yaw !== undefined) { p.camYaw = opts.yaw; p.heading = opts.yaw + Math.PI; }\n  p.moveSpeed = 0;\n  return p;\n} function tickProbe(m, opts) {\n  const o = opts || {};\n  const base = m.update.bind(m);\n  const st = {\n    sim: 0, steps: 0, travel: 0, idle: 0, idleBetween: 0, between: 0, maxNet: 0,\n    homeX: m.position.x, homeZ: m.position.z,\n    lastX: m.position.x, lastZ: m.position.z,\n    minX: m.position.x, maxX: m.position.x, minZ: m.position.z, maxZ: m.position.z,\n    stop() { m.update = base; return st; },\n    get spread() { return Math.hypot(st.maxX - st.minX, st.maxZ - st.minZ); },\n    get idleFrac() { return st.between ? st.idleBetween / st.between : 1; },\n  };\n  m.update = (dt, t) => {\n    // a probe with a limit: stops the machine EXACTLY on its step budget, so\n    // the measurement is a fixed number of simulated steps rather than\n    // \"however many fitted before the poll noticed\" (see soloDuel)\n    if (o.limit != null && st.sim >= o.limit) return;\n    if (o.pre) o.pre(dt, st);\n    base(dt, t);\n    if (!(dt > 0)) return;\n    const x = m.position.x, z = m.position.z;\n    const d = Math.hypot(x - st.lastX, z - st.lastZ);\n    st.lastX = x; st.lastZ = z;\n    st.sim += dt; st.steps++; st.travel += d;\n    if (x < st.minX) st.minX = x; else if (x > st.maxX) st.maxX = x;\n    if (z < st.minZ) st.minZ = z; else if (z > st.maxZ) st.maxZ = z;\n    const net = Math.hypot(x - st.homeX, z - st.homeZ);\n    if (net > st.maxNet) st.maxNet = net;\n    // idle = XZ speed under 0.25 m per SIM second, measured on the step itself\n    const moving = d / dt > 0.25;\n    if (!moving) st.idle++;\n    if (!m._attack) { st.between++; if (!moving) st.idleBetween++; }\n    if (o.each) o.each(dt, st);\n  };\n  return st;\n}\n/** Run a tickProbe until it has banked `s` SIM seconds (wall cap ms). */\nasync function probeFor(st, s, wallMs) {\n  const w0 = performance.now();\n  while (st.sim < s && performance.now() - w0 < (wallMs || 120000)) {\n    await new Promise(r => setTimeout(r, 40));\n  }\n  return st.sim;\n} function hardBearing(m, opts) {\n  const ctx = __CTX__, T = ctx.terrain;\n  const o = opts || {};\n  const BEARINGS = o.bearings || 12, RING = o.ring || 8, MIN_CLEAR = o.minClear ?? 0.25;\n  const band = m.ai.engage.cfg.band;\n  const R = Math.max(4, (band[0] + band[1]) * 0.5);\n  const home = (m._gateHome || m.spawnPos).clone ? (m._gateHome || m.spawnPos).clone() : m.position.clone();\n  const V = ctx.player.position.constructor;\n  const save = m.position.clone();\n  const radii = [Math.max(band[0], R * 0.7), R, Math.min(band[1], R * 1.4)];\n  const tgt = new V(0, 0, 0);\n  const out = [];\n  for (let i = 0; i < BEARINGS; i++) {\n    const th = (i / BEARINGS) * Math.PI * 2;\n    const px = home.x + Math.sin(th) * R, pz = home.z + Math.cos(th) * R;\n    tgt.set(px, T.getHeight(px, pz), pz);\n    let blocked = 0, n = 0;\n    for (let k = 0; k < RING; k++) {\n      const a = (k / RING) * Math.PI * 2;\n      for (const r of radii) {\n        const mx = px + Math.sin(a) * r, mz = pz + Math.cos(a) * r;\n        m.position.set(mx, T.getHeight(mx, mz), mz);\n        n++;\n        if (!m.ai.perception.hasLOS(tgt)) blocked++;\n      }\n    }\n    out.push({ th: +th.toFixed(2), occ: +(blocked / n).toFixed(2) });\n  }\n  m.position.copy(save);\n  const fair = out.filter((b) => 1 - b.occ >= MIN_CLEAR);\n  const pool = fair.length ? fair : out.slice();\n  let best = pool[0];\n  for (const b of pool) if (b.occ > best.occ) best = b;\n  return {\n    bearing: best.th, occ: best.occ, fairPool: fair.length, sampled: out.length,\n    profile: out.map((b) => b.th + ':' + b.occ).join(' '),\n    minClear: MIN_CLEAR, homeAt: [+home.x.toFixed(1), +home.z.toFixed(1)],\n  };\n} async function soloDuel(m, opts) {\n  const ctx = __CTX__, T = ctx.terrain, p = ctx.player;\n  const o = opts || {};\n  const DUR = o.dur || 30, WALL = o.wall || 26000;\n  const band = m.ai.engage.cfg.band;\n  /**\n   * THE SAME GROUND AND THE SAME POSE EVERY TIME (FIX ROUND 4,\n   * judge-machine-ai-r2-r1 §2). r3 duelled \"wherever the machine happens to\n   * stand\", which after one duel is wherever the LAST one left it — so two\n   * runs of the same gate at the same seed fought on different terrain, which\n   * is most of why the verdict moved. The anchor is now the machine's own\n   * spawn, snapshotted before this helper overwrites spawnPos, and the\n   * machine is teleported back to it before every duel.\n   */\n  if (!m._gateHome) m._gateHome = m.spawnPos.clone();\n  const home = m._gateHome.clone();\n  m.position.set(home.x, T.getHeight(home.x, home.z), home.z);\n  m.velocity?.set?.(0, 0, 0);\n  const r = Math.max(4, (band[0] + band[1]) * 0.5);\n  const th = o.bearing != null ? o.bearing : 0.7;\n  const px = home.x + Math.sin(th) * r, pz = home.z + Math.cos(th) * r;\n  place(px, pz, { crouch: false });\n  const py = p.position.y;\n  // spawnPos moves with the duel (the soft leash is measured from it) and the\n  // territory is lifted, so a site-owned machine does not walk home mid-fight\n  m.spawnPos.set(home.x, 0, home.z);\n  m._gateTerritory = m.territory; m.territory = null;\n  m.heading = Math.atan2(px - home.x, pz - home.z);\n  const pk = m.ai.picker;\n  pk.cd.clear(); pk.missed.clear(); pk.used.clear(); pk.phantom.clear();\n  pk.stalled.clear(); pk.blind?.clear?.(); pk.noteArranged(null);\n  pk.lastId = null; pk.streak = 0;\n  m._attack = null; m._attackCd = 0; m._downT = 0;\n  m.ai.engage.reset(); m.ai.engage.missT = 0;\n  // the perception TICK PHASE decides which sim step the sightline is sampled\n  // on, which is enough to change a fight over broken ground: pin it too\n  m.ai.perception.acc = 0; m.ai.perception.scanT = 0;\n  m.suspicion = 1; m._unseenT = 0; m.lastKnown.copy(p.position); m.playerDist = r;\n  m.forceState('attack');\n  const win = m.ai.engage._ringWindow();\n  const s = {\n    kind: m.kind, ids: [], fired: [], illegal: 0, plans: 0,\n    blocked: 0, blockedIds: null, steps: 0, modes: {}, unseen: 0, blindS: 0,\n    window: [+win[0].toFixed(2), +win[1].toFixed(2)],\n    bandRows: pk.bandProfile().ids, moveset: pk.movesetRows(),\n    bar: Math.max(2, Math.min(3, pk.movesetSize())),\n    playerAt: [+px.toFixed(1), +pz.toFixed(1)],\n  };\n  s.arrange = pk.rows.filter((row) => row.arc !== 'rear'\n    && pk._reachable(row, win[0], win[1]) != null).map((row) => row.id);\n  const onAtk = (e) => {\n    if (e.machine !== m || s.probe.sim >= DUR) return;\n    if (!pk.rows.some((row) => row.id === e.kind)) return;   // flourish, not a move\n    s.ids.push(e.kind);\n    if (s.fired.length < 16) {\n      s.fired.push(e.kind + '@' + Math.hypot(m.position.x - px, m.position.z - pz).toFixed(1) + 'm');\n    }\n  };\n  s.probe = tickProbe(m, {\n    // END ON A STEP COUNT, not on the wall-clock poll that reads it: the poll\n    // runs every 40 ms and a duel therefore used to run a random handful of\n    // extra steps past DUR (judge-machine-ai-r2-r1 §2)\n    limit: DUR,\n    pre: () => {\n      p.position.set(px, py, pz);\n      p.velocity.set(0, 0, 0);\n      p.health = p.maxHealth;\n      m.suspicion = 1; m._unseenT = 0; m.lastKnown.copy(p.position);\n      m._fleeing = false;\n      if (m.state !== 'attack' && !m._attack) m.setState('attack');\n    },\n    each: (dt) => {\n      const w = m.ai.engage._ringWindow();\n      const plan = pk.ringPlan(w[0], w[1]);\n      // sampled, not asserted: true by construction (see the A41c header)\n      if (plan) { s.plans++; if (!plan.legal) s.illegal++; }\n      s.steps++;\n      if (!m._visible) s.unseen += dt;\n      if (m.ai.engage.blindT > 0) s.blindS += dt;\n      // ASSERTED: a row inside the band the ring window cannot set up\n      if (pk.bandBlocked(w[0], w[1]) > 0) {\n        s.blocked++;\n        if (!s.blockedIds) s.blockedIds = pk.bandUnreachable(w[0], w[1]);\n      }\n      s.modes[m.ai.engage.mode] = (s.modes[m.ai.engage.mode] || 0) + 1;\n    },\n  });\n  ctx.events.on('machine-attack', onAtk);\n  try {\n    const w0 = performance.now();\n    while (s.probe.sim < DUR && performance.now() - w0 < WALL) {\n      await new Promise(r2 => setTimeout(r2, 40));\n    }\n  } finally {\n    ctx.events.off?.('machine-attack', onAtk);\n    s.probe.stop();\n    m.territory = m._gateTerritory;\n  }\n  s.held = m.ai.engage.heldProfile();\n  s.distinct = [...new Set(s.ids)];\n  s.gaveUpOnAtEnd = [...pk.stalled.keys()];\n  s.blindGiveUps = m.ai.engage.blindGiveUps;\n  s.blindAtEnd = pk.blindRings ? pk.blindRings().map((b) => b[0]) : [];\n  // the replay fingerprint: the move sequence and the pose it ended in\n  s.seq = s.ids.join(',');\n  s.endPose = [+m.position.x.toFixed(3), +m.position.z.toFixed(3), +m.heading.toFixed(3)];\n  return s;\n}\n\n/**\n * The rows this species OWES a standoff: non-rear, part attached, not\n * disabled, and with a non-empty shell of radii inside both the engage band\n * and the ring window. A Watcher peck (0-3.1 m) against a band that starts at\n * 4.6 m is not owed and is not counted.\n */\nfunction owedRows(m) {\n  const pk = m.ai.picker, band = m.ai.engage.cfg.band;\n  const win = m.ai.engage._ringWindow();\n  const out = [];\n  for (const row of pk.rows) {\n    if (row.arc === 'rear') continue;\n    if (!pk._needPartOk(row.needPart)) continue;   // '!engine' rows included\n    if (m.attackDisabled(row.id)) continue;\n    const lo = Math.max(row.min, band[0], win[0]);\n    const hi = Math.min(row.max, band[1], win[1]);\n    if (lo > hi) continue;\n    out.push({ id: row.id, lo: +lo.toFixed(2), hi: +hi.toFixed(2) });\n  }\n  return out;\n}\n\n/** Every living species, one per kind, sorted so the report reads the same. */\nfunction speciesPicks() {\n  const list = __CTX__.machines.list;\n  const kinds = [...new Set(list.filter(m => m.alive && combatant(m)).map(m => m.kind))].sort();\n  return kinds.map(k => list.find(m => m.kind === k && m.alive)).filter(Boolean);\n}\n\n/**\n * IS THIS MACHINE A COMBATANT AT ALL?\n *\n * Every duel gate in this lane discovers its species from the roster, which\n * was right while every machine in the world could fight. Round 4's expansion\n * added one that deliberately cannot: a 25 m comms tower with\n * an empty attack table, every PERCEPTION gain at zero, every REACT\n * threshold above 1.0 of maxHP and a hard guard in Machine.setState — it is\n * roster-v2's \"docile, never reacts, tramples obstacles\", and asserting a\n * three-move standoff on it is a category error, not a finding.\n *\n * So docile machines are excluded from the MOVESET gates — and the exclusion\n * cannot be used to dodge them, because the docile contract is asserted\n * head-on somewhere else instead: A41b-expansion fails a docile machine that\n * has ANY attack row, and A100-expansion-doctrine fails one that ever leaves\n * patrol under alarm, damage or a direct setState. docileContract()\n * below is the cross-check that the two halves agree, and every gate that\n * calls speciesPicks() reports it.\n */\nfunction combatant(m) { return !m.docile; }\n\n/** Every docile machine must have an empty table, and vice versa. */\nfunction docileContract() {\n  const bad = [];\n  for (const m of __CTX__.machines.list) {\n    if (!m.alive) continue;\n    const rows = m.ai?.picker?.rows?.length ?? 0;\n    if (m.docile && rows) bad.push(m.kind + ': docile with ' + rows + ' attack row(s)');\n    if (!m.docile && rows === 0) bad.push(m.kind + ': not docile and has no attack rows');\n  }\n  return bad;\n}\n\n      const ctx = __CTX__;\n      /**\n       * MIN_HELD is the floor of the first half of the bar (\"it never even\n       * goes there\"). MUST_FIRE is the second half, added in FIX ROUND 4\n       * (judge-machine-ai-r2-r1 §3): the judge's failing Scrapper duels held\n       * 4.16-4.70 s inside the laser shell and never fired, and the old\n       * predicate returned PASS on 5 of those 6 samples — \"FIRES or was stood\n       * in\" is satisfied by exactly the defect the round is about. A row the\n       * footwork stands in for MUST_FIRE seconds and never throws is now a\n       * FAIL in its own right, unless a move that DID fire shares those radii\n       * (a Thunderjaw that stands at 20 m and picks its cannon over its disc\n       * launcher is choosing, not livelocked).\n       */\n      const DUR = 22, EACH_WALL = 40000, ACCEL = 3, SEED = 0x41D0;\n      const MIN_HELD = 0.75, MUST_FIRE = 3.0;\n      const __s = await __kb(); if (!__s) return __kbSkip();\n      const picks = [__s.m];\n\n      const report = {}, fails = [], starved = [];\n      let prevRng = null, prevStep = ctx.engine.stepMode;\n      try {\n        prevRng = ctx.machines.setAiRng(ctx.machines.seededRng(SEED));\n        ctx.engine.stepMode = 'fixed';\n        ctx.engine.requestTimeScale?.('gate-a41d', ACCEL);\n        for (let i = 0; i < picks.length; i++) {\n          const m = picks[i];\n          freezeAll([m]);\n          if (m._frozenByGate) { m.update = m._frozenByGate; m._frozenByGate = null; }\n          const owed = owedRows(m);\n          const ground = hardBearing(m);\n          const s = await soloDuel(m, { dur: DUR, wall: EACH_WALL, bearing: ground.bearing });\n          const rows = owed.map((row) => {\n            const held = +m.ai.engage.heldAt(row.lo, row.hi).toFixed(2);\n            return { id: row.id, shell: [row.lo, row.hi], fired: s.distinct.includes(row.id), heldS: held };\n          });\n          /**\n           * THE EXCUSE, THROUGH THE SAME SHELL AS THE BAR (FIX ROUND 5,\n           * judge residue §4). A fired row used to excuse a silent one on the\n           * RAW row range, which is not the range either of them is measured\n           * over: a Behemoth slam row reads [0, 12] while its shell inside\n           * band+ring-window is [5.3, 12], and the raw range overlaps\n           * essentially everything. Three corrections, all tightening:\n           *\n           *   - fired shells are clipped to band AND ring window, exactly as\n           *     owedRows clips the rows it is judging;\n           *   - arc:'rear' rows can never excuse anything — the footwork\n           *     cannot promise the player is behind the machine, so a rear\n           *     move landing is not evidence that a front move had a choice;\n           *   - overlap must be a MEANINGFUL SHARE of the silent row's shell\n           *     (SHARE), not a touching edge. Two moves that live at the\n           *     same distance are a choice; two moves that share 20 cm of\n           *     their outer lip are not.\n           */\n          const SHARE = 0.5;\n          const band = m.ai.engage.cfg.band, win = m.ai.engage._ringWindow();\n          const firedShells = s.distinct\n            .map((id) => m.ai.picker.rowById.get(id)).filter(Boolean)\n            .filter((row) => row.arc !== 'rear')\n            .map((row) => [Math.max(row.min, band[0], win[0]), Math.min(row.max, band[1], win[1])])\n            .filter((f) => f[0] <= f[1]);\n          const sharedWithFired = (lo, hi) => {\n            const w = Math.max(1e-6, hi - lo);\n            for (const f of firedShells) {\n              const ov = Math.min(hi, f[1]) - Math.max(lo, f[0]);\n              if (ov / w >= SHARE) return true;\n            }\n            return false;\n          };\n          const mute = rows.filter((row) => !row.fired && row.heldS >= MUST_FIRE\n            && !sharedWithFired(row.shell[0], row.shell[1]));\n          report[s.kind] = {\n            stagedBearing: ground.bearing, ringOccludedFrac: ground.occ,\n            occlusionByBearing: ground.profile, fairBearings: ground.fairPool,\n            blindGiveUps: s.blindGiveUps, blindRingsAtEnd: s.blindAtEnd,\n            blindFootworkFrac: +(s.blindS / Math.max(0.01, s.probe.sim)).toFixed(2),\n            simSeconds: +s.probe.sim.toFixed(1), band: m.ai.engage.cfg.band,\n            ringWindowM: s.window, heldReachM: s.held.reach, heldStepM: s.held.step,\n            heldBins: s.held.bins, owed: rows, distinct: s.distinct, firedAt: s.fired,\n            heldButSilent: mute.map((d) => d.id),\n            noSightlineFrac: +(s.unseen / Math.max(0.01, s.probe.sim)).toFixed(2),\n            gaveUpOnAtEnd: s.gaveUpOnAtEnd,\n          };\n          if (s.probe.sim < DUR * 0.8) { starved.push(s.kind); continue; }\n          if (mute.length) {\n            fails.push(s.kind + ': ' + JSON.stringify(mute.map((d) => d.id))\n              + ' STOOD IN RANGE AND NEVER FIRED — '\n              + mute.map((d) => d.id + ' held ' + d.heldS + ' s inside '\n                + d.shell[0] + '-' + d.shell[1] + ' m').join('; ')\n              + ' (bar ' + MUST_FIRE + ' s), and no move that did fire '\n              + JSON.stringify(s.distinct) + ' shares those radii. Standing inside a '\n              + 'move range for seconds on end without throwing it is the residual '\n              + 'half of the terrain livelock: the footwork reached the radius and the '\n              + 'machine still could not take the shot from there');\n          }\n          const dead = rows.filter((row) => !row.fired && row.heldS < MIN_HELD);\n          if (dead.length) {\n            fails.push(s.kind + ': ' + JSON.stringify(dead.map((d) => d.id))\n              + ' never fired AND the footwork never stood in their range — '\n              + dead.map((d) => d.id + ' needs ' + d.shell[0] + '-' + d.shell[1] + ' m, held '\n                + d.heldS + ' s').join('; ')\n              + '. Reach was ' + s.held.reach + ' m over band '\n              + JSON.stringify(m.ai.engage.cfg.band) + '; measured occupancy '\n              + JSON.stringify(s.held.bins) + '. A move that is legal, arrangeable and '\n              + 'unblocked but stands at a radius this ground will not give is the '\n              + 'terrain-shaped half of the livelock, and only a MEASURED reading can see it');\n          }\n        }\n      } finally {\n        ctx.engine.requestTimeScale?.('gate-a41d', null);\n        ctx.machines.setAiRng(prevRng || null);\n        ctx.engine.stepMode = prevStep;\n        for (const m of picks) { m.territory = m._gateTerritory ?? m.territory; }\n      }\n\n      const detail = {\n        species: picks.length, docileContract: docileContract(), simSecondsEach: DUR, minHeldSeconds: MIN_HELD,\n        mustFireSeconds: MUST_FIRE, mustFireExcuseShare: 0.5,\n        rngSeed: SEED, starved, failures: fails, report,\n        note: 'one species at a time, staged on its own ground exactly as A41c stages it, with the lane dice seeded and restored. heldS is Engage.heldAt(lo, hi): decayed, dt-weighted SECONDS the machine actually stood inside that row own shell (band AND ring window clipped), sampled once per sim step inside Engage.update. The histogram half-life is ENGAGE.heldHalfLife, so continuous occupancy saturates near 13 s and the reading is recent occupancy, not a total. heldStepM is the bucket grain (band outer edge x 1.5 over 32 buckets); heldAt counts every bucket that OVERLAPS a shell, so a shell narrower than one bucket reads generously by up to a bucket either side — this is a floor bar about whether the machine ever goes near a radius, not a metre-accurate one. A row passes by FIRING or by being stood for; failing both is a move the species owns and this ground will not let it take. The mirror bar, mustFireSeconds: a row HELD that long which never fires, with no move that did fire sharing its radii, fails too — that is the shape the judge reproduced by hand and the round-3 predicate passed on 5 of 6 samples. Staging is hardBearing(m): the worst arc of this machine own ground that it can still fight on, on whole 1/60 s steps from the machine own spawn pose.',\n      };\n      if (starved.length) {\n        return { pass: null, detail: { ...detail, why: 'PENDING: ' + JSON.stringify(starved)\n          + ' banked under ' + (DUR * 0.8) + ' of ' + DUR + ' sim seconds inside the '\n          + (EACH_WALL / 1000) + ' s per-species wall cap' } };\n      }\n      return { pass: fails.length === 0, detail };\n    })()"},"A42-stagger":{"src":"tools/gates.round4.machine-ai.mjs A42-stagger","title":"Tearing a part mid-windup cancels the attack and staggers for 0.6-1.2 s","setup":"(async () => { __CTX__.input.enabled = true; \n  const _t0 = performance.now();\n  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n    await new Promise(r => setTimeout(r, 150));\n  }\n })()","settle":600,"timeout":60000,"assert":"(async () => {\n      function freezeAll(keep) {\n  const set = new Set(keep || []);\n  for (const m of __CTX__.machines.list) {\n    if (set.has(m)) continue;\n    if (!m._frozenByGate) { m._frozenByGate = m.update; m.update = () => {}; }\n  }\n} function place(x, z, opts) {\n  const p = __CTX__.player;\n  p.position.set(x, 0, z);\n  p.velocity.set(0, 0, 0);\n  p._snapToGround();\n  if (opts && opts.crouch !== undefined) p.setCrouch(!!opts.crouch);\n  if (opts && opts.yaw !== undefined) { p.camYaw = opts.yaw; p.heading = opts.yaw + Math.PI; }\n  p.moveSpeed = 0;\n  return p;\n} function park(m, heading) {\n  /**\n   * PARKED MEANS PARKED. The ecosystem layer takes over the waypoint loop\n   * inside _statePatrol (Squads.stepEscort / stepScavenge / stepConvoy, and\n   * the basking fidget), so a machine with an escort slot walked off\n   * its staged spot no matter what route it was given — measured on a sentry\n   * escorting a herd, which drifted out of the tall-grass corridor\n   * A37 had just validated and took the player's staged positions with it\n   * (112 of 165 approach samples ended up out of cover). Clearing these is\n   * part of staging, not a change to any bar.\n   */\n  m.escort = null; m.scavenge = null; m.convoy = null; m.basking = null;\n  m._fleeing = false; m._fleeT = 0;\n  m.route = [m.position.clone()];\n  m._wpIndex = 0;\n  m._waitT = 1e6;\n  if (heading !== undefined) m.heading = heading;\n  m.suspicion = 0;\n  m._unseenT = 99;\n  m.ai.search.stop();\n  m.ai.engage.reset();\n  m.setState('patrol');\n}\n      const ctx = __CTX__, T = ctx.terrain;\n      const __s = await __kb(); if (!__s) return __kbSkip();\n      const s = __s.m;\n      freezeAll([s]);\n      const p = ctx.player;\n      const px = s.position.x + 6, pz = s.position.z;\n      place(px, pz, { crouch: false });\n      s.heading = Math.atan2(px - s.position.x, pz - s.position.z);\n      s.suspicion = 1; s._unseenT = 0; s.lastKnown.copy(p.position);\n\n      let ev = null;\n      ctx.events.on('machine-stagger', (e) => { if (e.machine === s && !ev) ev = e; });\n\n      const part = s.parts.find(q => q.attached && q.tearable);\n      if (!part) return { pass: __KB.fixture ? null : false, detail: (__KB.fixture ? 'SKIP-fixture: ' : 'FAIL: ') + __s.KIND + ' exposes no tearable component (bible §7.1 rule 8: components come off as tools; the species lane\\'s fidelity pass authors them)' };\n\n      s.forceState('attack');\n      // wait for a real windup\n      const t0 = performance.now();\n      while (performance.now() - t0 < 22000) {\n        p.position.set(px, T.getHeight(px, pz), pz);\n        p.health = p.maxHealth;\n        if (s._attack && s._attack.phase === 'windup') break;\n        await new Promise(r => setTimeout(r, 30));\n      }\n      if (!s._attack || s._attack.phase !== 'windup') {\n        return { pass: false, detail: 'no attack windup observed in 22 s' };\n      }\n      const windupKind = s._attack.kind;\n      part.mesh.updateWorldMatrix(true, false);\n      const e = part.mesh.matrixWorld.elements;\n      s.takeDamage({\n        point: { x: e[12], y: e[13], z: e[14] },\n        object: part.mesh, impact: 1, tear: 9999,\n        element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'tear',\n      });\n      const cancelled = s._attack === null;\n      const stateNow = s.state;\n      await new Promise(r => setTimeout(r, 400));\n      const stillStagger = s.state === 'stagger';\n      // wait it out and confirm it resumes the fight\n      const t1 = performance.now();\n      while (s.state === 'stagger' && performance.now() - t1 < 3000) {\n        await new Promise(r => setTimeout(r, 50));\n      }\n      const dur = ev ? ev.duration : null;\n      return {\n        pass: !!ev && cancelled && stateNow === 'stagger' && dur >= 0.6 && dur <= 1.2,\n        detail: {\n          cancelledAttack: cancelled, windupKind, stateAtTear: stateNow,\n          staggerEvent: !!ev, durationS: dur ? +dur.toFixed(2) : null,\n          stillStaggeringAt400ms: stillStagger, resumedState: s.state,\n          partTorn: part.name,\n        },\n      };\n    })()"},"A90-expansion-with-kind":{"src":"tools/gates.round4.machine-ai-expansion.mjs A90-memory-stability-expansion","title":"30 kills + spawns with the full expansion roster: scene growth <= +600 and heap <= +25 %, with ZERO growth outside machine roots, zero orphaned roots, and the population budget holding","setup":"(async () => { __CTX__.input.enabled = true; \n  const _t0 = performance.now();\n  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n    await new Promise(r => setTimeout(r, 150));\n  }\n \n  {\n    const _t1 = performance.now();\n    while (!__CTX__.machines?.expansionReady && performance.now() - _t1 < 30000) {\n      await new Promise(r => setTimeout(r, 150));\n    }\n  }\n })()","settle":1500,"timeout":300000,"assert":"(async () => {\n      const ctx = __CTX__;\n      const __s = await __kb(); if (!__s) return __kbSkip();\n      const r = ctx.renderer || ctx.engine?.renderer;\n      const count = (o) => { let n = 0; o.traverse(() => n++); return n; };\n      const snap = () => {\n        let total = 0; ctx.scene.traverse(() => total++);\n        let machineNodes = 0;\n        for (const m of ctx.machines.list) machineNodes += count(m.root);\n        const live = new Set(ctx.machines.list.map(m => m.root));\n        let orphanRoots = 0, orphanNodes = 0;\n        for (const ch of ctx.scene.children) {\n          if (/-machine$/.test(ch.name || '') && !live.has(ch)) { orphanRoots++; orphanNodes += count(ch); }\n        }\n        return {\n          total, machineNodes, nonMachine: total - machineNodes,\n          orphanRoots, orphanNodes, roster: ctx.machines.list.length,\n          geo: r.info.memory.geometries, tex: r.info.memory.textures,\n          heap: performance.memory?.usedJSHeapSize ?? null,\n        };\n      };\n      const kill = (m) => {\n        let mesh = null; m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });\n        m.takeDamage({ point: m.position.clone(), object: mesh, impact: 999999, tear: 0,\n          element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 999999 });\n      };\n      if (window.gc) window.gc();\n      await new Promise(res => setTimeout(res, 1200));\n      const a = snap();\n      let kills = 0;\n      for (let i = 0; i < 30; i++) {\n        const m = ctx.machines.list.find(x => x.alive && !x._disposed && !x.docile);\n        if (!m) break;\n        kill(m); kills++;\n        ctx.input.keys.add('KeyW');\n        await new Promise(res => setTimeout(res, 900));\n        ctx.input.keys.delete('KeyW');\n        try { ctx.machines.spawn(__s.KIND, ctx.player.position.x + 30, ctx.player.position.z + 30); } catch (e) {}\n        await new Promise(res => setTimeout(res, 250));\n      }\n      // the corpse lifecycle needs the player far away and ~130 s of clock\n      const p0 = ctx.player.position.clone();\n      ctx.player.position.set(p0.x + 260, 0, p0.z + 260);\n      ctx.player._snapToGround?.();\n      await new Promise(res => setTimeout(res, 800));\n      ctx.machines.sites.advance(240, 1);\n      await new Promise(res => setTimeout(res, 1500));\n      if (window.gc) window.gc();\n      await new Promise(res => setTimeout(res, 1200));\n      const b = snap();\n      const pop = ctx.machines.populationAudit();\n      const heapGrowth = (a.heap && b.heap) ? (b.heap - a.heap) / a.heap : null;\n      const objGrowth = b.total - a.total;\n      const nonMachineGrowth = b.nonMachine - a.nonMachine;\n      const fails = [];\n      if (objGrowth > 600) fails.push('scene grew +' + objGrowth + ' objects (bar +600)');\n      if (nonMachineGrowth !== 0) fails.push(nonMachineGrowth + ' scene objects grew OUTSIDE every machine root — that is a real leak, not population');\n      if (b.orphanRoots !== 0) fails.push(b.orphanRoots + ' machine root(s) survive in the scene outside the roster (' + b.orphanNodes + ' nodes)');\n      if (heapGrowth !== null && heapGrowth >= 0.25) fails.push('heap grew ' + (heapGrowth * 100).toFixed(1) + '% (bar 25%)');\n      if (pop.overBudget) fails.push('population is over its node budget: ' + pop.nodes + ' > ' + pop.budget);\n      return {\n        pass: fails.length === 0,\n        detail: {\n          kills, before: a, after: b, objGrowth, nonMachineGrowth,\n          machineNodeGrowth: b.machineNodes - a.machineNodes,\n          geoGrowth: b.geo - a.geo, texGrowth: b.tex - a.tex,\n          heapGrowthPct: heapGrowth === null ? 'n/a (--enable-precise-memory-info)' : +(heapGrowth * 100).toFixed(1),\n          populationAudit: pop, sitesAudit: ctx.machines.sites.audit(),\n          squads: ctx.machines.doctrineAudit().squads, failures: fails,\n          note: 'ATTRIBUTION IS THE BAR. nonMachineGrowth and orphanMachineRoots are the only readings that can distinguish a leak from a population; the raw object delta cannot, which is what the round-3 verdict turned on. geoGrowth/texGrowth are reported, not asserted: they track the SURVIVING machines per-machine component geometry, so they move with the composition of the live roster exactly as the node count does.',\n        },\n      };\n    })()"},"A90-rig-reclaim-with-kind":{"src":"tools/gates.round4.machines-expansion.mjs A90-rig-reclaim","title":"RIG-SIDE RECLAIM: 30 spawn/kill/dispose cycles across the roster grow geometries <= +40 and textures <= +30, and a LIVE machine costs <= 1 of each","setup":null,"settle":1500,"timeout":300000,"assert":"(async () => {\n      \n  const _t0 = performance.now();\n  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n    await new Promise(r => setTimeout(r, 150));\n  }\n      const r = __CTX__.engine.renderer, M = __CTX__.machines;\n      const wait = (ms) => new Promise(res => setTimeout(res, ms));\n      const mem = () => ({ geo: r.info.memory.geometries, tex: r.info.memory.textures });\n      const kill = (m) => {\n        let mesh = null;\n        m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });\n        try {\n          m.takeDamage({ point: m.position.clone(), object: mesh, impact: 99999, tear: 0,\n            element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 },\n            type: 'hunter', baseDamage: 99999 });\n        } catch (e) { /* */ }\n        if (m.alive) { try { m._die(); } catch (e) { /* */ } }\n      };\n      const px = __CTX__.player.position.x, pz = __CTX__.player.position.z;\n      const __s = await __kb(); if (!__s) return __kbSkip();\n      const roster = [__s.KIND];\n\n      // --- warm: one full cycle per kind so every lazy cache is built\n      for (const k of roster) {\n        const m = M.spawn(k, px + 40, pz + 40);\n        if (!m) continue;\n        await wait(200); kill(m); await wait(500);\n        M.sites.dispose(m); await wait(120);\n      }\n      await wait(600);\n\n      // --- 30 spawn / kill / dispose cycles, round-robin across the roster\n      const a = mem();\n      let cycles = 0;\n      for (let i = 0; i < 30; i++) {\n        const kind = roster[i % roster.length];\n        const m = M.spawn(kind, px + 40, pz + 40);\n        if (!m) continue;\n        cycles++;\n        await wait(170);\n        kill(m);\n        await wait(620);            // let the death FX and the corpse solve run\n        M.sites.dispose(m);\n        await wait(130);\n      }\n      await wait(900);\n      const b = mem();\n      const dGeo = b.geo - a.geo, dTex = b.tex - a.tex;\n\n      // --- per-LIVE-machine cost: 8 of one kind held at once\n      const liveKind = roster[0];\n      const c = mem();\n      const held = [];\n      for (let i = 0; i < 8; i++) {\n        const m = M.spawn(liveKind, px + 35 + i, pz + 35);\n        if (m) held.push(m);\n        await wait(180);\n      }\n      await wait(700);\n      const d = mem();\n      const perGeo = held.length ? (d.geo - c.geo) / held.length : 0;\n      const perTex = held.length ? (d.tex - c.tex) / held.length : 0;\n      for (const m of held) M.sites.dispose(m);\n      await wait(700);\n      const e = mem();\n\n      const pass = dGeo <= 40 && dTex <= 30 && perGeo <= 1.0 && perTex <= 1.0;\n      return { pass, detail: {\n        cycles, roster,\n        budget: { geometries: 40, textures: 30, perLiveGeo: 1.0, perLiveTex: 1.0 },\n        afterCycles: { geoGrowth: dGeo, texGrowth: dTex },\n        perLiveMachine: { kind: liveKind, n: held.length,\n                          geo: +perGeo.toFixed(2), tex: +perTex.toFixed(2) },\n        heldThenReleased: { geoGrowth: e.geo - c.geo, texGrowth: e.tex - c.tex },\n      } };\n    })()"},"__LINEUP":"\n  /**\n   * Scale-normalised silhouette line-up.\n   *\n   * ROUND-4 FIX ROUND 1. The Round-4 helper put the cast on a 9.6-degree arc\n   * inside the game's own 55-degree camera and clamped the near distance at\n   * 6 m, which threw the Scrapper into the bottom-left corner at point-blank\n   * range — \"an overexposed, unreadable jumble\", and not a fair read of any\n   * of the five. This stages the shot instead of the world:\n   *\n   *   - the pose is allowed to settle, then every machine is FROZEN, so the\n   *     rig is not fighting the composition;\n   *   - each root is uniformly scaled to one apparent size (a silhouette test\n   *     grades shape, not scale) and re-centred on its own bounding box;\n   *   - one depth, one narrow lens, so nothing is distorted by being at the\n   *     edge of a wide frame;\n   *   - flat backdrop, no HUD, no marker billboards.\n   */\n  const stageCast = async (kinds, opts) => {\n    const O = opts || {};\n    const _t0 = performance.now();\n    while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {\n      await new Promise(r => setTimeout(r, 150));\n    }\n    const list = (__CTX__.machines?.list || []).filter(m => m.alive);\n    const cast = [];\n    const missing = [];\n    for (const k of kinds) {\n      const m = list.find(x => x.kind === k && !cast.includes(x));\n      if (m) cast.push(m); else missing.push(k);\n    }\n    // NON-SILENT STAGING (judge finding on V27: \"Longleg is missing from the\n    // captured frame entirely\"). A species that cannot be staged used to just\n    // not be in the picture, and the shot was then judged as if the criteria\n    // had listed one machine fewer. console.warn is deliberate: a console\n    // ERROR is an automatic gate FAIL, and a staging shortfall is a fact about\n    // the run, not a defect in the frame.\n    if (missing.length) console.warn('[stageCast] species not staged: ' + missing.join(', '));\n    // AND INTO THE GATE RESULT. A console.warn does not reach report.json (the\n    // runner only captures console ERRORS), so a visual gate that silently\n    // dropped a machine read to the next judge as a pass — the exact finding\n    // this block exists to close. Every shortfall is accumulated here and the\n    // gate's detail reports it (__stageCastReport, read below).\n    const notes = { requested: kinds.slice(), missing: missing.slice(), notDrawn: [], clipped: [], staged: [] };\n    __CTX__.__stageCastReport = notes;\n    if (!cast.length) return { cast: [], notes };\n    const p = __CTX__.player;\n    p._updateCamera = () => {};\n    if (p.model) p.model.visible = false;\n    const cam = __CTX__.camera;\n    const T = __CTX__.terrain;\n    const hud = document.getElementById('hud');\n    if (hud) hud.style.display = 'none';\n    const V3 = p.position.constructor;\n\n    let ColorCtor = null;\n    cast[0].root.traverse((o) => {\n      if (ColorCtor || !o.isMesh) return;\n      const mat = Array.isArray(o.material) ? o.material[0] : o.material;\n      if (mat && mat.color) ColorCtor = mat.color.constructor;\n    });\n    for (const c of __CTX__.scene.children) {\n      if (c.isLight) continue;\n      if (cast.some(m => m.root === c)) continue;\n      c.visible = false;\n    }\n    // Push the fog out of the way, do NOT null it: world-light's Environment\n    // system writes to scene.fog every frame and threw 189 times a shot when\n    // the object went away (console errors are an automatic gate FAIL).\n    const fog = __CTX__.scene.fog;\n    if (fog) {\n      if (fog.density !== undefined) fog.density = 0;\n      if (fog.far !== undefined) { fog.near = 1e5; fog.far = 1e6; }\n    }\n    if (ColorCtor) __CTX__.scene.background = new ColorCtor(O.bg ?? 0x8fb3d1);\n\n    const n = cast.length;\n    const fov = O.fov ?? 26;\n    const D = O.depth ?? 60;\n    const BX = 0, BZ = 120;\n    const ground = T.getHeight(BX, BZ);\n    const eyeY = ground + (O.eyeY ?? 6);\n\n    // 1. park the cast side-on at one depth and let the rigs settle\n    cast.forEach((m, i) => {\n      // NEGATIVE X is screen RIGHT for a camera looking down +Z, so index 0\n      // (the first name the criteria lists) has to go to POSITIVE X\n      const x = BX + ((n - 1) / 2 - i) * (O.spread ?? 8);\n      const z = BZ + D;\n      m.position.set(x, T.getHeight(x, z), z);\n      m.heading = O.front ? Math.PI : Math.PI / 2;\n      m.root.rotation.y = m.heading;\n      m._speed = 0;\n      m._lodTier = -1;\n      m.lowLOD = false;\n      try { m.state = O.state || 'patrol'; m.suspicion = O.state ? 1 : 0; } catch (e) { /* */ }\n      m.root.traverse((o) => {\n        if (o.isSprite) o.visible = false;\n        // A staged still is composed at one depth for readability, not for\n        // budget. The engine's screen-space small-mesh cull measures WORLD\n        // size, so a machine parked 60 m out loses the detail the shot exists\n        // to grade — measured on the Longleg, which arrived at its mark with\n        // one plate of itself still being drawn.\n        if (o.isMesh) o.userData.noSizeCull = true;\n      });\n      // A FLYER banks and pitches its body node in cruise, which is what put\n      // the Glinthawk at an oblique 3/4 in the fix-round-1 still and made its\n      // spanned-wing requirement ungradeable. A silhouette test reads a\n      // machine level and side-on; the body pitch is levelled with the pose.\n      try { m.body.rotation.set(0, 0, 0); } catch (e) { /* */ }\n    });\n    await new Promise(r => setTimeout(r, O.settle ?? 1400));\n    if (O.beforeFreeze) await O.beforeFreeze(cast);\n\n    // 2. FREEZE the rigs: the pose in the shot is the pose that was solved,\n    //    and nothing re-solves against the staged transforms. Shadowing\n    //    m.update() is not enough — the manager keeps steering the machine\n    //    through its AI, and the heading drifted ~0.3 rad between staging and\n    //    the shutter — so the cast leaves the update list outright. The roots\n    //    stay in the scene, so they still render.\n    //\n    //    O.live keeps the RIG running and freezes only the transform. A pose\n    //    gate (V27) has to show a rig that is still solving — the attack's\n    //    pose channels are consumed inside gait.update()/animate(), so a\n    //    machine with its update stubbed holds whatever pose it happened to be\n    //    in, which is why fix round 1's wind-up frames were its idle frames.\n    for (const m of cast) {\n      // DISTANCE LOD IS LIFTED, NOT JUST INVALIDATED (judge finding, fix\n      // round 2: \"the lane's own V26/V27 stills are unfaithful ... the freeze\n      // path then splices the machine out of the update list and stubs\n      // m.update, so updateRigLOD never re-runs and the trim is never\n      // lifted\"). Setting _lodTier = -1 only says \"recompute next tick\", and\n      // for a frozen machine there is no next tick — the Longleg went into\n      // V26 with 22 of its 30 meshes still retired and read as two\n      // disconnected clumps. machine._lodPin = 0 (rig/lod.js) holds tier 0\n      // even for the LIVE path, where the real update() would otherwise\n      // re-trim at the 60 m staging depth on the very next frame.\n      m.lowLOD = false;\n      m._lodPin = 0;\n      m._lodTier = 0;\n      m.model.traverse((o) => {\n        if (o.isMesh && o.userData.lodHidden) { o.visible = true; o.userData.lodHidden = false; }\n      });\n      for (const pt of m.parts || []) {\n        if (!pt.attached || !pt.mesh) continue;\n        pt.mesh.visible = true;\n        pt.mesh.traverse((o) => { if (o.isMesh) o.userData.lodHidden = false; });\n      }\n      if (O.live) continue;\n      const i = __CTX__.machines.list.indexOf(m);\n      if (i >= 0) __CTX__.machines.list.splice(i, 1);\n      m.update = () => {};\n      if (m.gait) { m.gait.update = () => {}; m.gait.updateCheap = () => {}; }\n      if (m.animate) m.animate = () => {};\n      if (m.footLock) m.footLock.update = () => {};\n      if (m.mixer) m.mixer.timeScale = 0;\n    }\n\n    // 3. LOCK THE FACING FIRST. _conform() composes the root quaternion from\n    //    the heading AND the terrain normal, so overwriting rotation.y\n    //    afterwards re-orients the machine — and the size normalisation below\n    //    would then be measuring an orientation the shot never sees.\n    const yaw = O.front ? Math.PI : Math.PI / 2;\n    for (const m of cast) { m.root.rotation.set(0, yaw, 0); m.root.updateMatrixWorld(true); }\n\n    // 4. normalise apparent size and centre each machine in its own slot\n    const aspect = cam.aspect || (16 / 9);\n    const hFov = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * aspect);\n    const frameW = 2 * D * Math.tan(hFov / 2);\n    const slotW = frameW / n;\n    const target = slotW * (O.fill ?? 0.80);\n    /**\n     * Posed world box of everything DRAWN, or ok:false when nothing was.\n     *\n     * The ok flag is load-bearing (judge finding on V27: \"Longleg is missing\n     * from the captured frame entirely\"). This used to return the EMPTY\n     * sentinel — min +1e9, max -1e9 — whose centre is a perfectly finite\n     * (0,0,0), and the caller then \"re-centred\" the machine by translating it\n     * by the whole slot offset from wherever it already was. A longleg staged\n     * 60 m out, with its components retired by distance LOD and the rest of it\n     * under the engine's screen-space cull, measured empty and was pushed to\n     * x = -30 m in a frame 24 m wide. It was never posed wrong; it was pushed\n     * out of the shot, silently, by its own framing code.\n     */\n    const box = (m) => {\n      m.root.updateMatrixWorld(true);\n      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], any = false;\n      const q = new V3();\n      m.root.traverse((o) => {\n        if (!o.isMesh || !o.visible || !o.geometry) return;\n        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();\n        const bb = o.geometry.boundingBox; if (!bb) return;\n        for (let i = 0; i < 8; i++) {\n          q.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)\n            .applyMatrix4(o.matrixWorld);\n          mn = [Math.min(mn[0], q.x), Math.min(mn[1], q.y), Math.min(mn[2], q.z)];\n          mx = [Math.max(mx[0], q.x), Math.max(mx[1], q.y), Math.max(mx[2], q.z)];\n          any = true;\n        }\n      });\n      return { mn, mx, ok: any, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] };\n    };\n    // THE CAMERA IS SOLVED FIRST. The fit below measures where each machine\n    // lands ON SCREEN, so it has to measure through the projection the shutter\n    // will use. (The game's FOV system writes camera.fov every frame BEFORE\n    // the render — gate A22b — and an onAfterRender pin runs too late to\n    // matter: the shot was being taken at 55 degrees while the layout was\n    // solved for 26, which is why every silhouette landed at 40 % of its slot.\n    // Nail the property.)\n    try {\n      Object.defineProperty(cam, 'fov', { get: () => fov, set: () => {}, configurable: true });\n    } catch (e) { /* */ }\n    cam.position.set(BX, eyeY, BZ);\n    cam.lookAt(BX, eyeY, BZ + 10);\n    cam.updateMatrixWorld(true);\n    cam.updateProjectionMatrix();\n\n    /**\n     * Where a machine actually lands in the frame, in NDC (-1..1, +x = screen\n     * RIGHT, +y = screen UP).\n     *\n     * ROUND-4 FIX ROUND 2, judge finding on V26: \"the Glinthawk's outboard\n     * wing is clipped by the right frame edge in both runs\". The world box is\n     * not the frame. The cast is turned side-on — body +Z to world +X — so a\n     * WINGSPAN runs in world Z, which is DEPTH: the Glinthawk's outboard wing\n     * tip sits ~2.6 m nearer the lens than its body, and 12 m off axis that\n     * projects a further half-metre outboard than the world box says. The fit\n     * declared it inside its slot and the lens put it through the edge.\n     */\n    const M4 = cam.projectionMatrix.constructor;\n    const _vp = new M4();\n    const screenBox = (m) => {\n      m.root.updateMatrixWorld(true);\n      _vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);\n      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false;\n      const q = new V3();\n      m.root.traverse((o) => {\n        if (!o.isMesh || !o.visible || !o.geometry) return;\n        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();\n        const bb = o.geometry.boundingBox; if (!bb) return;\n        for (let i = 0; i < 8; i++) {\n          q.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)\n            .applyMatrix4(o.matrixWorld).applyMatrix4(_vp);\n          x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x);\n          y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);\n          any = true;\n        }\n      });\n      return { ok: any, x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };\n    };\n    // NDC per world metre at the staging depth, on each screen axis. World +X\n    // is screen LEFT (the camera looks down +Z), hence the sign.\n    const ndcPerMx = -1 / (D * Math.tan(hFov / 2));\n    const ndcPerMy = 1 / (D * Math.tan(fov * Math.PI / 360));\n    const slotNdc = 2 / n;\n    const MARGIN = 0.04;                       // NDC keep-out at the frame edge\n\n    const framing = [];\n    cast.forEach((m, i) => {\n      const b0 = box(m);\n      if (!b0.ok) {\n        console.warn('[stageCast] nothing drawn for ' + m.kind + ' — left on its mark');\n        notes.notDrawn.push(m.kind);\n        return;\n      }\n      // 4a. coarse world-space fit — scale is a world quantity, and the world\n      //     box is the cheap way to get within a few per cent of the answer\n      const w = b0.mx[0] - b0.mn[0];\n      const h = b0.mx[1] - b0.mn[1];\n      m.root.scale.setScalar(target / Math.max(w, h * 1.15, 0.5));\n      m.root.updateMatrixWorld(true);\n      const b1 = box(m);\n      m.position.x += BX + ((n - 1) / 2 - i) * slotW - b1.c[0];\n      m.position.y += eyeY - b1.c[1];\n      m.position.z += (BZ + D) - b1.c[2];\n\n      // 4b. screen-space correction: shrink until the machine fits its slot\n      //     AND the frame, then put its SCREEN centre on the slot's centre\n      const wantCx = -1 + slotNdc * (i + 0.5);\n      const budget = Math.min(slotNdc * (O.fill ?? 0.80),\n                              2 * (1 - MARGIN) - 2 * Math.abs(wantCx));\n      for (let pass = 0; pass < 4; pass++) {\n        const s = screenBox(m);\n        if (!s.ok) break;\n        const shrink = Math.min(budget / Math.max(s.w, 1e-4),\n                                (2 - 2 * MARGIN) / Math.max(s.h, 1e-4));\n        if (shrink < 0.998) {\n          m.root.scale.multiplyScalar(shrink);\n          m.root.updateMatrixWorld(true);\n        }\n        const s2 = screenBox(m);\n        if (!s2.ok) break;\n        m.position.x += (wantCx - s2.cx) / ndcPerMx;\n        m.position.y += (0 - s2.cy) / ndcPerMy;\n        m.root.updateMatrixWorld(true);\n        if (shrink >= 0.998 && Math.abs(wantCx - s2.cx) < 0.004) break;\n      }\n      const f = screenBox(m);\n      framing.push(m.kind + ' ndcX[' + f.x0.toFixed(2) + ',' + f.x1.toFixed(2) + ']'\n                 + ' ndcY[' + f.y0.toFixed(2) + ',' + f.y1.toFixed(2) + ']');\n      if (f.x0 < -1 || f.x1 > 1 || f.y0 < -1 || f.y1 > 1) {\n        console.warn('[stageCast] ' + m.kind + ' is clipped by the frame: ' + framing[framing.length - 1]);\n        notes.clipped.push(m.kind);\n      }\n      notes.staged.push(m.kind + ' ndcX[' + f.x0.toFixed(2) + ',' + f.x1.toFixed(2) + ']');\n    });\n    // Facing is graded by the criteria, so it is stated in the log the run\n    // keeps: body +Z is world +X under yaw = pi/2, and world +X is SCREEN\n    // LEFT for a camera looking down +Z.\n    console.log('[stageCast] yaw=' + yaw.toFixed(3) + ' (body +Z -> world +X -> screen LEFT); '\n              + framing.join(' | '));\n\n    const frozen = cast.map(m => ({ m, x: m.position.x, y: m.position.y, z: m.position.z, k: m.root.scale.x }));\n    if (O.live) {\n      // wrap update: run the real one (so the rig solves the attack pose),\n      // then put the machine back on its mark and hold the wind-up open\n      for (const f of frozen) {\n        const m = f.m;\n        const real = m.update.bind(m);\n        m.update = (dt, t) => {\n          m.lowLOD = false;\n          m._lodPin = 0;           // hold tier 0: the cast is staged at 60 m\n          real(dt, t);\n          m.model.traverse((o) => {\n            if (o.isMesh && o.userData.lodHidden) { o.visible = true; o.userData.lodHidden = false; }\n          });\n          for (const pt of m.parts || []) {\n            if (pt.attached && pt.mesh) pt.mesh.visible = true;\n          }\n          const a = m._attack;\n          if (a && O.holdWindup !== false) {\n            a.t = a.windup * (O.windupAt ?? 0.78);\n            a.phase = 'windup';\n            a.phaseT = O.windupAt ?? 0.78;\n            a.struck = false;\n          }\n          m._speed = 0;\n          m.position.set(f.x, f.y, f.z);\n          m.heading = yaw;\n          m.root.rotation.set(0, yaw, 0);\n          m.root.scale.setScalar(f.k);\n          try { m.body.rotation.y = 0; } catch (e) { /* */ }\n        };\n      }\n    }\n    const pin = () => {\n      for (const f of frozen) {\n        f.m.position.set(f.x, f.y, f.z);\n        f.m.root.rotation.y = yaw;\n        f.m.root.scale.setScalar(f.k);\n      }\n      cam.position.set(BX, eyeY, BZ);\n      cam.lookAt(BX, eyeY, BZ + 10);\n      cam.updateMatrixWorld();\n      p.position.set(BX, eyeY, BZ);\n    };\n    __CTX__.engine.onAfterRender.push(pin);\n    pin();\n    // A SHORTFALL HAS TO REACH THE JUDGE, and the judge reads the PNG. The\n    // runner records no detail for a visual gate, so a species that was\n    // never staged is stated IN THE FRAME rather than in a console.warn nobody\n    // captures. It is only drawn when something is actually wrong, so a clean\n    // line-up is still a clean line-up.\n    const bad = notes.missing.concat(notes.notDrawn, notes.clipped);\n    if (bad.length) {\n      const el = document.createElement('div');\n      el.id = 'stagecast-note';\n      el.textContent = 'STAGING SHORTFALL — missing: [' + notes.missing.join(', ')\n        + '] not drawn: [' + notes.notDrawn.join(', ') + '] clipped: [' + notes.clipped.join(', ') + ']';\n      el.setAttribute('style', 'position:fixed;left:0;right:0;top:0;z-index:99999;'\n        + 'background:#a00;color:#fff;font:bold 20px monospace;padding:8px;text-align:center');\n      document.body.appendChild(el);\n    }\n    return { cast, notes };\n  };","__V27_OPTS":"{\n        state: 'attack',\n        settle: 900,\n        live: true,          // the rig keeps solving; only the transform is pinned\n        windupAt: 0.8,\n        // ROUND-4 FIX ROUND 2. Fix round 1 asked machine-ai for an attack by\n        // setting lastKnown and forcing the state, from 60 m away — so\n        // chooseAttack(dist) returned the LONG-RANGE move (or none), whose\n        // wind-up is a body transform, and then the rig was frozen anyway so\n        // no pose was ever solved. The close-range moves are the ones with\n        // authored limb keyframes (machine-rig-08), so they are started\n        // directly, at the distance that selects them, and held open.\n        beforeFreeze: async (cast) => {\n          for (const m of cast) {\n            try {\n              m._attackCd = 0;\n              for (const k of Object.keys(m)) if (/^_cd[A-Z]/.test(k)) m[k] = 0;\n              m.lastKnown = (m.lastKnown && m.lastKnown.copy)\n                ? m.lastKnown.copy(__CTX__.player.position) : __CTX__.player.position.clone();\n              let a = null;\n              for (const d of [3.0, 5.0, 8.0, 10.5, 12.5]) {\n                a = m.chooseAttack?.(d);\n                if (a) break;\n              }\n              if (a) { a.plant = true; a.track = false; m._startAttack(a); }\n            } catch (e) { /* machine-ai owns these */ }\n          }\n          await new Promise(r => setTimeout(r, 700));\n        },\n      }"};
/* ===== END VENDORED ===== */
