/**
 * ROUND 5 — lane `look-post` gates (docs/ROUND5-PLAN.md §2 row look-post, §9;
 * docs/ROUND5-LOOK.md §7 "look-post"; report docs/ROUND5-LOOK-POST.md).
 *
 *   nice -n 10 node tools/gates.mjs --port 5251 --lane look-post
 *   nice -n 10 node tools/gates.mjs --port 5251 --only A-look-tonemap,A-look-frame-stats
 *
 * THE W1 BLOCK
 *   A-look-suite          (a) every look place stages with 0 console errors and an identical
 *                         canvas SHA-256 on two consecutive captures; (d) planted boxes at
 *                         30/120/400/900 m land in the right depth bins of the gate-only 160x90
 *                         linear-depth render; (e) the capture is the WebGL canvas (HUD = DOM = 0 px)
 *   A-look-suite-files    (runner) (b) look-stats self-test (synthetic 6 patches; fixture),
 *                         (c) refs.json <= 20 KB with 0 bytes of image data, (f) no file of this
 *                         tree matches a reference image's SHA-256
 *   A-look-tonemap        (a)-(d) through the LIVE grade pass on a HalfFloat input; (e)/(f) are the
 *                         re-measured colour rows, registered below as aliases in this block
 *   A-look-frame-stats    the five look places against their panels' bars; every LUT texel ==
 *                         look.js within 1/255
 *   A-look-random         12 seeded random poses, >= 9 meet look.field's bars
 *   A-look-bloom          (a) salt at noon: folded bloom <= 0.02 linear; (b) sun profile; (c) hostile
 *                         lamp halo; (d) bloom energy share
 *   A-look-ledger         (quiet box; orchestrator) tools/look/ab-time.mjs in the page
 *   A-gpu-attrib          (quiet box; orchestrator) tools/look/gpu-attrib.mjs in the page
 *   A-csm-layer-masks     G-post's per-cascade layer masks: CASTER_ONLY casts in every cascade and
 *                         never draws in the view; CASCADE0_ONLY draws in the view and casts in cascade 0 only
 *   A-hold-frame          U-03's engine half: a held frame submits 0 draws and the canvas keeps its image
 *   V-look-before-after   the five places, Round-5 W0 output beside the CALIMA look (film, for reading)
 *   V-look-grade, V-look-highlights, V-look-glow, V-look-random   the visual rows of ROUND5-LOOK §7
 * INHERITED (engine-gpu's must-stay-green rows, and the colour rows L-01 must re-measure, R66 h):
 *   <id>@look-post aliases of A-gpu-tier(-box), A-rt-ledger, A22-msaa, A108, A109, V20, V33b,
 *   V-gpu-tier-look (engine-gpu), A-lamp-canon-distance and A-lamp-states (instruments-core),
 *   A-brea-contrast (hero-body), A-weak40 (instruments-core's Tiller block). The originals keep their
 *   ids and lanes; the aliases run the same rows under --lane look-post.
 *
 * Staging: tools/look/places.mjs (world-props' gatePlaces.look.* when published; stand-ins on the
 * map in the tree until then, named in every detail). No species, coordinate or bone literal here.
 */
import { readFileSync, existsSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { PLACES } from './gate-places.mjs';
import { PERF_SCENARIOS, STAGE_PRELUDE } from './budgets.mjs';
import { LOOK_BARS, PANELS, REFS_FILE, DIRECTION_DIR, selftest } from './look/look-stats.mjs';
import { LOOK_STANDINS, LOOK_CORE, randomPoses } from './look/places.mjs';
import { DRAW_OWNERS } from './gates/gates-perf.w0b.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANE = 'look-post';
const IP_CLAUSE = 'FAIL if the frame shows any element of the image IP list (ROUND5-LOOK §8); this clause outranks every likeness clause.';

/* ------------------------------------------------------------------------ */
/* node side                                                                 */
/* ------------------------------------------------------------------------ */

/** Box witness for the quiet-box rows (R45): load average and other headless Chromes. */
function boxSample() {
  const load1 = os.loadavg()[0];
  let chromes = 0;
  try { chromes = execFileSync('pgrep', ['-f', 'Chrome.*--headless'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).length; } catch { chromes = 0; }
  return { load1: +load1.toFixed(2), headlessChromeProcs: chromes, quiet: load1 < 3 };
}

function gitWitness() {
  try {
    const sha = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['-C', ROOT, 'status', '--porcelain'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).length;
    return { sha, tree: ROOT, dirtyFiles: dirty };
  } catch (e) { return { sha: null, tree: ROOT, error: String(e.message) }; }
}

/** A-look-suite (b), (c), (f): node only. */
async function suiteFiles() {
  const st = await selftest();
  const out = { selftest: { pass: st.pass, synthBad: st.synth.filter((r) => !r.ok), fixture: st.fixture } };
  // (c) refs.json: size, and no image data in any form
  let refsOk = false;
  if (existsSync(REFS_FILE)) {
    const text = readFileSync(REFS_FILE, 'utf8');
    const bytes = statSync(REFS_FILE).size;
    const dataUri = /data:image\//i.test(text);
    const b64run = /[A-Za-z0-9+/]{80,}={0,2}/.test(text);
    const pixelKey = /"(pixels|data|png|jpg|jpeg|webp|base64)"\s*:/i.test(text);
    refsOk = bytes <= 20 * 1024 && !dataUri && !b64run && !pixelKey;
    out.refs = { bytes, dataUri, base64Run: b64run, pixelKey, panels: Object.keys(JSON.parse(text).panels || {}).length };
  } else out.refs = { missing: true };
  // (f) no file of this tree has a reference image's SHA-256
  const refHashes = new Map();
  for (const f of ['kevin-nov6-keyart.jpg', 'kevin-nov6-keyart.webp', 'kevin-nov6-board.jpg', 'kevin-nov6-board.webp']) {
    const p = path.join(DIRECTION_DIR, f);
    if (existsSync(p)) refHashes.set(createHash('sha256').update(readFileSync(p)).digest('hex'), f);
  }
  let files = [];
  try { files = execFileSync('git', ['-C', ROOT, 'ls-files', '-co', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter(Boolean); } catch { files = []; }
  const sizes = new Set();
  for (const f of refHashes.keys()) sizes.add(statSync(path.join(DIRECTION_DIR, refHashes.get(f))).size);
  const hits = [];
  let hashed = 0;
  for (const f of files) {
    const p = path.join(ROOT, f);
    let s; try { s = statSync(p); } catch { continue; }
    if (!s.isFile() || !sizes.has(s.size)) continue;   // a SHA-256 match needs the same byte count
    hashed++;
    const h = createHash('sha256').update(readFileSync(p)).digest('hex');
    if (refHashes.has(h)) hits.push({ file: f, ref: refHashes.get(h) });
  }
  out.repoScan = { files: files.length, sameSizeHashed: hashed, refsKnown: refHashes.size, hits };
  const pass = st.pass && refsOk && refHashes.size > 0 && hits.length === 0;
  return { pass, detail: out };
}

/* ------------------------------------------------------------------------ */
/* page side                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * LOOK prelude (splice inside an async body). Defines:
 *   THREE, LS (stats-core), LK (look.js), frames(n), grabCanvas(), stageLook(name), unstage(),
 *   statsOf(cap), sheet(cells, title), sunYaw(), BARS, gradeBars(stats, place)
 */
const LOOK = `
  ${PLACES}
  const __C = window.__CTX__, __E = __C.engine, __R = __E.renderer, __gl = __R.getContext();
  const THREE = await import('/tools/look/three.mjs');
  const LS = await import('/tools/look/stats-core.mjs');
  const LK = await import('/src/core/look.js');
  const BARS = ${JSON.stringify(LOOK_BARS)};
  const STANDINS = ${JSON.stringify(LOOK_STANDINS)};
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const frames = async (n) => { for (let i = 0; i < n; i++) await frame(); };
  const pick = (o, k) => k.split('.').reduce((v, q) => (v == null ? v : v[q]), o);
  const gradeBars = (st, place) => {
    const B = BARS[place]; if (!B) return { pass: null, rows: [] };
    const rows = Object.entries(B.bars).map(([key, bar]) => {
      const v = pick(st, key);
      const ok = bar && bar.hueIn ? (v != null && (bar.hueIn[0] <= bar.hueIn[1] ? v >= bar.hueIn[0] && v <= bar.hueIn[1] : v >= bar.hueIn[0] || v <= bar.hueIn[1]))
        : v != null && (bar[0] == null || v >= bar[0]) && (bar[1] == null || v <= bar[1]);
      return { key, v, bar: bar.hueIn ? ['hue', ...bar.hueIn] : bar, ok };
    });
    return { pass: rows.every((r) => r.ok), met: rows.filter((r) => r.ok).length + '/' + rows.length, miss: rows.filter((r) => !r.ok) };
  };
  /** The WebGL canvas right after the frame's last draw (row 0 at the top). HUD and banners are DOM: never in it. */
  const grabCanvas = () => new Promise((res) => {
    const hook = function lookGrab() {
      const i = __E.onAfterRender.indexOf(hook); if (i >= 0) __E.onAfterRender.splice(i, 1);
      __R.setRenderTarget(null);
      const W = __gl.drawingBufferWidth, H = __gl.drawingBufferHeight;
      const raw = new Uint8Array(W * H * 4);
      __gl.readPixels(0, 0, W, H, __gl.RGBA, __gl.UNSIGNED_BYTE, raw);
      const px = new Uint8Array(W * H * 4);
      for (let y = 0; y < H; y++) px.set(raw.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
      res({ W, H, px, source: 'webgl-canvas' });
    };
    __E.onAfterRender.push(hook);
  });
  const sha = async (u8) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', u8))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const statsOf = (cap) => LS.frameStats(cap.px, cap.W, cap.H, { step: 2 });
  /** camYaw that faces the sun (camera forward = (-sin yaw, -cos yaw)). */
  const sunYaw = () => { const s = __C.environment.sunDir; return Math.atan2(-s.x, -s.z); };
  const __camSaved = { fn: null, delta: null };
  /** Freeze the presentation clock too (wind, water, fire and the camera damping read wall time): engine.clock reads 0 s. */
  const freezeWall = () => { if (!__camSaved.delta) { __camSaved.delta = __E.clock.getDelta; __E.clock.getDelta = () => 0; } };
  const unstage = () => {
    const p = __C.player;
    if (__camSaved.delta) { __E.clock.getDelta = __camSaved.delta; __camSaved.delta = null; __E.clock.getDelta(); }
    if (__camSaved.fn) { p._updateCamera = __camSaved.fn; __camSaved.fn = null; }
    __E.requestTimeScale('studio', null);
  };
  /** Stage a look place: weather, frozen hour, the grade sets for the hour, the hero, the lens. */
  const stageLook = async (name, o = {}) => {
    const pub = __C.props?.gatePlaces?.look?.[name];
    let P, source;
    if (pub) { P = { ...STANDINS[name], ...pub }; source = 'ctx.props.gatePlaces.look'; }
    else if (STANDINS[name]) {
      const b = PLACE(STANDINS[name].base);
      if (!b) return { skip: 'SKIP-R18 (place): no ' + STANDINS[name].base + ' for the ' + name + ' stand-in (' + PLACES_SOURCE + ')' };
      P = { ...STANDINS[name], x: b.x, z: b.z }; source = 'stand-in on ' + STANDINS[name].base + ' (' + PLACES_SOURCE + ')';
    } else return { skip: 'no look place ' + name };
    if (o.hour != null) P.hour = o.hour;
    if (o.x != null) { P.x = o.x; P.z = o.z; }
    if (o.sunRel != null) P.sunRel = o.sunRel;
    if (o.pitch != null) P.pitch = o.pitch;
    const env = __C.environment, p = __C.player;
    __E.requestTimeScale('studio', 0);
    env.timeFrozen = true;
    const weather = env.weatherStates?.includes(P.weather) ? P.weather : 'clear';
    env.setWeather(weather, 0.05);
    env.setTime(P.hour);
    __E.setLookHour?.(P.hour, weather);
    p.position.set(P.x, 0, P.z); p.velocity?.set?.(0, 0, 0); p._snapToGround?.();
    await frames(3);
    p.camYaw = sunYaw() + (P.sunRel || 0) * Math.PI / 180;
    p.camPitch = P.pitch ?? 0;
    // the hero faces away from the lens (1-TR, 1-MR, 1-BL: we stand behind her), unless the place says otherwise
    p.heading = p.camYaw + Math.PI + (P.heroRel || 0) * Math.PI / 180;
    if (P.cam === 'close') {
      await frames(4);
      const head = p.animator?.b?.head?.bone;
      if (!head) return { skip: 'SKIP: animator.b.head not published' };
      if (!__camSaved.fn) { __camSaved.fn = p._updateCamera; p._updateCamera = () => {}; }
      const cam = __C.camera, hp = new THREE.Vector3(), fw = new THREE.Vector3(0, 0, 1);
      head.getWorldPosition(hp);
      (p.model || head).updateMatrixWorld(true);
      fw.transformDirection((p.model || head).matrixWorld); fw.y = 0; fw.normalize();
      fw.applyAxisAngle(new THREE.Vector3(0, 1, 0), 35 * Math.PI / 180);
      cam.position.copy(hp).addScaledVector(fw, P.dist || 0.8); cam.position.y -= 0.03;
      cam.lookAt(hp.x, hp.y - 0.02, hp.z); cam.updateMatrixWorld();
    }
    await frames(o.frames ?? 24);
    // wind and time frozen (ROUND5-LOOK L-00): the sim is at timeScale 0 and the wall clock now reads 0 s per frame
    if (o.freeze !== false) { freezeWall(); await frames(3); }
    return { P, source, weather, hour: env.time };
  };
  /** A sheet of captured frames over the page (for the visual rows; the judge reads this screenshot). */
  const sheet = (cells, title, cols = 2) => {
    document.getElementById('cal-look-sheet')?.remove();
    const cv = document.createElement('canvas');
    cv.id = 'cal-look-sheet';
    cv.width = 1600; cv.height = 900;
    Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', width: '1600px', height: '900px', zIndex: 2147483647, background: '#111' });
    const g = cv.getContext('2d');
    g.fillStyle = '#111'; g.fillRect(0, 0, 1600, 900);
    g.fillStyle = '#ddd'; g.font = '15px monospace'; g.fillText(title, 10, 20);
    const rows = Math.ceil(cells.length / cols);
    const cw = 1600 / cols, ch = (900 - 30) / rows;
    const tmp = document.createElement('canvas');
    cells.forEach((c, k) => {
      const col = k % cols, row = Math.floor(k / cols);
      tmp.width = c.cap.W; tmp.height = c.cap.H;
      const id = new ImageData(new Uint8ClampedArray(c.cap.px.buffer, c.cap.px.byteOffset, c.cap.px.length), c.cap.W, c.cap.H);
      tmp.getContext('2d').putImageData(id, 0, 0);
      const s = Math.min((cw - 8) / c.cap.W, (ch - 22) / c.cap.H);
      const w = c.cap.W * s, h = c.cap.H * s;
      const x = col * cw + (cw - w) / 2, y = 30 + row * ch + 18;
      g.drawImage(tmp, x, y, w, h);
      g.fillStyle = '#ddd'; g.font = '13px monospace'; g.fillText(c.label, col * cw + 6, 30 + row * ch + 13);
    });
    document.body.appendChild(cv);
    return cv;
  };
`;

/** Wrap an async body with the LOOK prelude and a top-level unstage. */
const look = (body) => `(async () => {${LOOK}
  try {
    ${body}
  } finally { try { unstage(); } catch (e) { /* page gone */ } }
})()`;

/** A visual row's setup: start the job, return at once (setup has a 60 s clock); the sheet lands before settle ends. */
const lookJob = (body) => `window.__lookJob = (async () => {${LOOK}
  try {
    ${body}
  } catch (e) { console.warn('[look-post] film job: ' + (e && e.message)); window.__lookJobError = String(e && e.message); }
  finally { try { unstage(); } catch (e) { /* */ } window.__lookJobDone = true; }
})(); 'started'`;

/* ---------------------------------------------------------------- A-look-tonemap */

const TONEMAP = look(`
  const L = __E.look, u = __E.grade.uniforms;
  if (!L || !__E.lookActive) return { pass: false, detail: 'engine.look missing or AgX not in force' };
  // the tone map is graded at the base exposure: the hour bridge stands down and the hour EV is 0
  __E._lookOwned = true; L.set({ ev: 0 }); __E._syncLook();
  // the live grade pass, read into a float target: a 64 x 4 HalfFloat input
  const W = 64, H = 4;
  const inData = new Uint16Array(W * H * 4);
  const vals = [];
  const H16 = THREE.DataUtils;
  const put = (i, r, g, b) => { const q = [r, g, b].map((v) => H16.toHalfFloat(v)); inData[i * 4] = q[0]; inData[i * 4 + 1] = q[1]; inData[i * 4 + 2] = q[2]; inData[i * 4 + 3] = H16.toHalfFloat(1); vals[i] = q.map((h) => H16.fromHalfFloat(h)); };
  // row 0: the 64-step grey ramp 0.001 .. 32; row 1: (a) greys, (c) skew probes, the lamp tokens' HDR;
  // rows 2-3: 128 random HDR colours (seeded) for (b)
  for (let i = 0; i < 64; i++) { const v = 0.001 * Math.pow(32000, i / 63); put(i, v, v, v); }
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);
  const SKEW = [['#FFB070', 4, 14], ['#F08A5A', 3, 12], ['#FF2D8C', 6, 14], ['#6B3F73', 4, 10]];
  const row1 = [[0.02, 0.02, 0.02], [0.18, 0.18, 0.18], [1.6, 1.6, 1.6]];
  for (const [h, k] of SKEW) row1.push(hex(h).map((c) => lin(c) * k * 0.3));
  row1.forEach((v, j) => put(64 + j, v[0], v[1], v[2]));
  let seed = 0xCA11;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 128; i < 256; i++) { const e = Math.pow(2, rnd() * 10 - 6); put(i, rnd() * e, rnd() * e, rnd() * e); }
  const tex = new THREE.DataTexture(inData, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false });
  const out = new Float32Array(W * H * 4);
  const keep = { mix: L.gradeMix, a: L.setA, b: L.setB, lm: L.lutMix, vig: u.uVignette.value, ao: u.uAOMix.value, bl: u.uBloomOn.value };
  const runPass = () => {
    __E._syncLook();
    u.uAOMix.value = 0; u.uBloomOn.value = 0; u.uVignette.value = 0;
    const was = __E.grade.renderToScreen; __E.grade.renderToScreen = false;
    __E.grade.render(__R, rt, { texture: tex }, 0, false);
    __E.grade.renderToScreen = was;
    __R.readRenderTargetPixels(rt, 0, 0, W, H, out);
    __R.setRenderTarget(null);
    return out.slice();
  };
  try {
    // (a), (c), (d) at grade mix 0
    L.set({ gradeMix: 0 }); const g0 = runPass();
    const Y = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const Lst = (i, buf = g0) => { const y = Y(buf[i * 4], buf[i * 4 + 1], buf[i * 4 + 2]); return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : y * 24389 / 27; };
    const a = { '0.02': +Lst(64).toFixed(2), '0.18': +Lst(65).toFixed(2), '1.6': +Lst(66).toFixed(2) };
    const aOk = a['0.18'] >= 48.5 && a['0.18'] <= 51.5 && a['0.02'] >= 6 && a['0.02'] <= 12 && a['1.6'] >= 85 && a['1.6'] <= 91;
    const lab = (r, g, b, o = [0, 0, 0]) => LK.srgbToLab([r, g, b], o);
    const hueOf = (l) => { let h = Math.atan2(l[2], l[1]) * 180 / Math.PI; return h < 0 ? h + 360 : h; };
    const skew = SKEW.map(([h, k, bar], j) => {
      const i = 67 + j; const src = lab(...hex(h)), got = lab(g0[i * 4], g0[i * 4 + 1], g0[i * 4 + 2]);
      let d = hueOf(got) - hueOf(src); if (d > 180) d -= 360; if (d < -180) d += 360;
      return { hex: h, k, skewDeg: +d.toFixed(2), bar, ok: Math.abs(d) <= bar };
    });
    let mono = true, prev = -1, flat = [];
    for (let i = 0; i < 64; i++) { const v = Lst(i); if (!(v > prev)) { mono = false; flat.push(i); } prev = v; }
    // (b) GPU == look.evaluate within 1/255, at mix 0 and at mix 1 with both slots live
    const cmp = (buf) => { let worst = 0, at = -1; const o = [0, 0, 0];
      for (let i = 64; i < 256; i++) { if (!vals[i]) continue; L.evaluate(vals[i], o);
        for (let c = 0; c < 3; c++) { const d = Math.abs(o[c] - buf[i * 4 + c]) * 255; if (d > worst) { worst = d; at = i; } } }
      return { worst255: +worst.toFixed(3), at };
    };
    const b0 = cmp(g0);
    L.set({ gradeMix: 1, a: 'golden', b: 'calima', mix: 0.5 }); const g1 = runPass(); const b1 = cmp(g1);
    L.set({ a: 'dusk', b: 'noon', mix: 0.25 }); const g2 = runPass(); const b2 = cmp(g2);
    // invert round trip: every value the transform can show (evaluate of HDR randoms) and the lamp tokens
    L.set({ a: 'golden', b: 'golden', mix: 0 }); __E._syncLook();
    let rtWorst = 0; const o = [0, 0, 0], x = [0, 0, 0], t = [0, 0, 0];
    for (let i = 0; i < 512; i++) { const e = Math.pow(2, rnd() * 10 - 6); L.evaluate([rnd() * e, rnd() * e, rnd() * e], t);
      if (t[0] >= 0.999 || t[1] >= 0.999 || t[2] >= 0.999) continue;
      L.invert(t, x); L.evaluate(x, o); for (let c = 0; c < 3; c++) rtWorst = Math.max(rtWorst, Math.abs(o[c] - t[c]) * 255); }
    const tokens = ['#F2EAD3', '#B5E61D', '#FF2D8C', '#3B3A36'].map((h) => { const tt = hex(h); L.invert(tt, x); L.evaluate(x, o);
      return { hex: h, worst255: +Math.max(...[0, 1, 2].map((c) => Math.abs(o[c] - tt[c]) * 255)).toFixed(3) }; });
    const bOk = b0.worst255 <= 1 && b1.worst255 <= 1 && b2.worst255 <= 1 && rtWorst <= 1 && tokens.every((k) => k.worst255 <= 1);
    const pass = aOk && skew.every((s) => s.ok) && mono && bOk;
    return { pass, detail: {
      a: { ...a, ok: aOk, exposure: +L.exposure.toFixed(4) },
      b: { gpuVsEvaluate: { mix0: b0, goldenCalima50: b1, duskNoon25: b2 }, invertRoundTrip255: +rtWorst.toFixed(3), tokens, ok: bOk },
      c: skew, d: { strictlyIncreasing: mono, flatSteps: flat },
      ef: 'the re-measured colour rows run as aliases in this block: A-lamp-states@look-post, A-lamp-canon-distance@look-post, A-weak40@look-post, A-brea-contrast@look-post (A-sighting-hue: shell-ui\\'s row, not in this tree)' } };
  } finally {
    L.set({ gradeMix: keep.mix, a: keep.a, b: keep.b, mix: keep.lm }); __E._syncLook();
    u.uVignette.value = keep.vig;
    rt.dispose(); tex.dispose();
  }
`);

/* ------------------------------------------------------------ A-look-frame-stats */

const FRAME_STATS = look(`
  const places = ${JSON.stringify(Object.keys(LOOK_CORE))};
  const rows = {};
  for (const name of places) {
    const s = await stageLook(name);
    if (s.skip) { rows[name] = { skip: s.skip }; continue; }
    const cap = await grabCanvas();
    const st = statsOf(cap);
    const g = gradeBars(st, name);
    rows[name] = { source: s.source, hour: s.hour, weather: s.weather, met: g.met, pass: g.pass,
      miss: g.miss.map((m) => m.key + '=' + m.v + ' bar ' + JSON.stringify(m.bar)),
      stats: { lo20: st.lo20, mid: st.mid, hi10: st.hi10, chroma: st.chroma, spread: st.spread, p99: st.L.p99, clip: st.clip, crush: st.crush, gold: st.gold, violet: st.violet, topBottom: st.topBottom } };
    unstage();
  }
  // every LUT texel == look.js within 1/255: sample each slot's texels at their centres on the GPU
  const L = __E.look, n = L.size;
  const lutCheck = {};
  for (const set of L.sets) {
    L.set({ a: set, b: set, mix: 0 }); __E._syncLook();
    const mat = new THREE.ShaderMaterial({
      uniforms: { tLut: { value: __E.grade.uniforms.tLutA.value } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'precision highp sampler3D; uniform sampler3D tLut; varying vec2 vUv; void main(){ float x = floor(gl_FragCoord.x), y = floor(gl_FragCoord.y); float r = mod(x, ' + n + '.0), b = floor(x / ' + n + '.0); gl_FragColor = texture(tLut, (vec3(r, y, b) + 0.5) / ' + n + '.0); }',
      depthTest: false, depthWrite: false,
    });
    const rt = new THREE.WebGLRenderTarget(n * n, n, { depthBuffer: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    const sc = new THREE.Scene(); sc.add(quad); const oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    __R.setRenderTarget(rt); __R.render(sc, oc);
    const px = new Uint8Array(n * n * n * 4);
    __R.readRenderTargetPixels(rt, 0, 0, n * n, n, px);
    __R.setRenderTarget(null);
    let worst = 0; const c = [0, 0, 0], o = [0, 0, 0];
    for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
      c[0] = r / (n - 1); c[1] = g / (n - 1); c[2] = b / (n - 1);
      LK.gradeSet(c, L.grade.sets[set], o);
      const i = (g * n * n + b * n + r) * 4;
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(px[i + k] / 255 - o[k]) * 255);
    }
    lutCheck[set] = +worst.toFixed(3);
    rt.dispose(); mat.dispose(); quad.geometry.dispose();
  }
  L.set({ a: 'golden', b: 'golden', mix: 0 });
  const lutOk = Object.values(lutCheck).every((w) => w <= 1);
  // ROUND5-LOOK L-00: each look gate re-runs look.field at low and medium (the look is on at every tier)
  const tiers = {};
  const q0 = __E.quality;
  for (const tq of ['medium', 'low']) {
    __E.setQuality(tq); await frames(6);
    const s = await stageLook('field');
    if (s.skip) { tiers[tq] = { skip: s.skip }; continue; }
    const cap = await grabCanvas(); const st = statsOf(cap); const g = gradeBars(st, 'field');
    tiers[tq] = { lookOn: __E.lookActive && __E.tier.look.grade !== false && __E.grade.uniforms.uGradeMix.value > 0, met: g.met,
      miss: g.miss.map((m) => m.key + '=' + m.v), lo20hue: st.lo20.hue, midB: st.mid.b, chroma: st.chroma };
    unstage();
  }
  __E.setQuality(q0); await frames(4);
  const tiersOk = Object.values(tiers).every((t) => t.lookOn === true);
  const pass = places.every((n) => rows[n].pass === true) && lutOk && tiersOk;
  return { pass, detail: { places: rows, lutTexelWorst255: lutCheck, lutOk, fieldAtTiers: tiers, tiersLookOn: tiersOk } };
`);

/* ------------------------------------------------------------------ A-look-suite */

const SUITE = look(`
  const places = ${JSON.stringify(Object.keys(LOOK_CORE))};
  const rows = {};
  for (const name of places) {
    const s = await stageLook(name, { frames: 40 });
    if (s.skip) { rows[name] = { skip: s.skip }; continue; }
    // two consecutive captures 6 frames apart; a place still streaming in gets up to 3 pairs (reported)
    let c1, c2, h1, h2, diff = 0, pairs = 0;
    for (; pairs < 3; ) {
      pairs++;
      c1 = await grabCanvas(); await frames(6); c2 = await grabCanvas();
      h1 = await sha(c1.px); h2 = await sha(c2.px);
      diff = 0; for (let i = 0; i < c1.px.length; i += 4) if (c1.px[i] !== c2.px[i] || c1.px[i + 1] !== c2.px[i + 1] || c1.px[i + 2] !== c2.px[i + 2]) diff++;
      if (h1 === h2) break;
      await frames(30);
    }
    rows[name] = { source: s.source, identical: h1 === h2, pairs, sha: h1.slice(0, 16), diffPx: diff, diffPct: +(100 * diff / (c1.W * c1.H)).toFixed(3), size: [c1.W, c1.H], captureSource: c1.source };
    unstage();
  }
  // (d) depth bins: planted boxes at 30/120/400/900 m in front of the lens, rendered with a gate-only
  // linear-depth material at 160 x 90 (every other scene child hidden for the probe render)
  const cam = __C.camera, p = __C.player;
  const saved = p._updateCamera; p._updateCamera = () => {};
  cam.position.set(p.position.x, p.position.y + 400, p.position.z); cam.rotation.set(0, 0, 0); cam.updateMatrixWorld();
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const boxes = [30, 120, 400, 900].map((d, i) => {
    const s = d * 0.06;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial());
    const side = (i - 1.5) * 0.12 * d;
    m.position.copy(cam.position).addScaledVector(fwd, d).add(new THREE.Vector3(side, 0, 0));
    m.name = 'look-depth-probe'; __C.scene.add(m); m.updateMatrixWorld(); return { d, m };
  });
  const depthMat = new THREE.ShaderMaterial({
    vertexShader: 'varying float vD; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vD; void main(){ gl_FragColor = vec4(vD, 0.0, 0.0, 1.0); }',
  });
  const drt = new THREE.WebGLRenderTarget(160, 90, { type: THREE.FloatType });
  const probeMats = boxes.map(({ m }) => { const k = m.material; m.material = depthMat; return k; });
  const hidden = [];
  __C.scene.children.forEach((o) => { if (o.name !== 'look-depth-probe' && o.visible && !o.isLight) { hidden.push(o); o.visible = false; } });
  const cc0 = new THREE.Color(); __R.getClearColor(cc0); const ca0 = __R.getClearAlpha();
  __R.setRenderTarget(drt); __R.setClearColor(0x000000, 1); __R.clear(); __R.render(__C.scene, cam); __R.setClearColor(cc0, ca0);
  const dpx = new Float32Array(160 * 90 * 4); __R.readRenderTargetPixels(drt, 0, 0, 160, 90, dpx); __R.setRenderTarget(null);
  boxes.forEach(({ m }, k) => { m.material = probeMats[k]; }); hidden.forEach((o) => { o.visible = true; });
  const BINS = [15, 60, 200, 600, Infinity];
  const binOf = (d) => BINS.findIndex((hi) => d < hi);
  const v = new THREE.Vector3();
  const probes = boxes.map(({ d, m }) => {
    v.copy(m.position).project(cam);
    const x = Math.round((v.x * 0.5 + 0.5) * 159), y = Math.round((v.y * 0.5 + 0.5) * 89);
    const got = dpx[(y * 160 + x) * 4];
    return { planted: d, read: +got.toFixed(2), bin: binOf(got), want: binOf(d), ok: binOf(got) === binOf(d) && Math.abs(got - d) < d * 0.05 };
  });
  boxes.forEach(({ m }) => { __C.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
  depthMat.dispose(); drt.dispose(); p._updateCamera = saved;
  const aOk = places.every((n) => rows[n].identical === true);
  const dOk = probes.every((q) => q.ok);
  const eOk = places.every((n) => rows[n].captureSource === 'webgl-canvas' || rows[n].skip);
  return { pass: aOk && dOk && eOk, detail: { a: rows, d: probes, e: { captureSource: 'webgl-canvas (readPixels after the frame): the HUD and banners are DOM, 0 px', ok: eOk } } };
`);

/* -------------------------------------------------------------- A-look-random */

const RANDOM_BODY = (forSheet) => `
  const poses = ${JSON.stringify(randomPoses())};
  // anchors: every published gate place of the map in the tree
  const __S = ${JSON.stringify(LOOK_STANDINS)};
  const names = Object.keys(__S).map((k) => __S[k].base);
  const anchors = [...new Set(names)].map((k) => PLACE(k)).filter(Boolean);
  if (!anchors.length) return ${forSheet ? "sheet([], 'no places')" : "{ pass: null, detail: 'SKIP-R18 (place): no gate places on this map' }"};
  const T = __C.terrain;
  const rows = [], cells = [];
  for (const q of poses) {
    const A = anchors[q.i % anchors.length];
    const ang = q.bearing * Math.PI / 180;
    let x = A.x + Math.sin(ang) * q.dist, z = A.z + Math.cos(ang) * q.dist;
    // stay on land inside the map: pull toward the anchor until the ground is above the sea line
    for (let k = 0; k < 8 && T?.getHeight && !(T.getHeight(x, z) > 0.3); k++) { x = (x + A.x) / 2; z = (z + A.z) / 2; }
    const s = await stageLook('field', { x, z, hour: q.hour, sunRel: q.sunRel, pitch: q.pitch, frames: 18 });
    if (s.skip) { rows.push({ i: q.i, skip: s.skip }); continue; }
    const cap = await grabCanvas();
    const st = statsOf(cap);
    const g = gradeBars(st, 'field');
    rows.push({ i: q.i, hour: q.hour, at: [+x.toFixed(1), +z.toFixed(1)], met: g.met, pass: g.pass, lo20hue: st.lo20.hue, midB: st.mid.b, chroma: st.chroma, p99: st.L.p99, clip: st.clip });
    ${forSheet ? "cells.push({ cap: { W: cap.W, H: cap.H, px: cap.px }, label: '#' + q.i + ' ' + q.hour.toFixed(2) + ' h  ' + g.met });" : ''}
    unstage();
  }
`;
const RANDOM = look(`${RANDOM_BODY(false)}
  const passing = rows.filter((r) => r.pass).length;
  return { pass: passing >= 9, detail: { passing: passing + '/12 (bar >= 9)', rows } };
`);

/* -------------------------------------------------------------- A-look-bloom */

const BLOOM = look(`
  const b = __E.bloom, gu = __E.grade.uniforms;
  const out = {};
  // reads the folded bloom composite (the target whose texture the grade samples as tBloom, HalfFloat) for the current frame
  const bloomRead = () => new Promise((res) => {
    const hook = function lookBloom() {
      const i = __E.onAfterRender.indexOf(hook); if (i >= 0) __E.onAfterRender.splice(i, 1);
      const rt = __E.renderTargetLedger().rows.map((r) => r.target).find((t) => t && t.texture === gu.tBloom.value);
      if (!rt) { res({ W: 1, H: 1, buf: new Float32Array(4), folded: false }); return; }
      const W = rt.width, H = rt.height, buf = new Float32Array(W * H * 4);
      try { __R.readRenderTargetPixels(rt, 0, 0, W, H, buf); } catch (e) { /* */ }
      __R.setRenderTarget(null);
      res({ W, H, buf, folded: gu.uBloomOn.value === 1 || __E._postFold() });
    };
    __E.onAfterRender.push(hook);
  });
  const lumAt = (B, fx, fy, r = 2) => { let s = 0, n = 0; const cx = Math.round(fx * (B.W - 1)), cy = Math.round((1 - fy) * (B.H - 1));
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) { if (x < 0 || y < 0 || x >= B.W || y >= B.H) continue; const i = (y * B.W + x) * 4; s += 0.2126 * B.buf[i] + 0.7152 * B.buf[i + 1] + 0.0722 * B.buf[i + 2]; n++; } return n ? s / n : 0; };
  const energy = (B) => { let s = 0; for (let i = 0; i < B.buf.length; i += 4) s += 0.2126 * B.buf[i] + 0.7152 * B.buf[i + 1] + 0.0722 * B.buf[i + 2]; return s / (B.W * B.H); };
  // (a) noon, the open lit ground of the field stand-in (the W0 map has no salt; the brightest lit
  // ground patch in frame stands in): folded bloom at the brightest 5 % of the lower half
  let s = await stageLook('field', { hour: 13, sunRel: 180, pitch: -0.25 });
  if (s.skip) return { pass: null, detail: s.skip };
  let cap = await grabCanvas();
  let B = await bloomRead();
  const lums = []; for (let y = Math.floor(cap.H * 0.55); y < cap.H; y += 4) for (let x = 0; x < cap.W; x += 4) { const i = (y * cap.W + x) * 4; lums.push([0.2126 * cap.px[i] + 0.7152 * cap.px[i + 1] + 0.0722 * cap.px[i + 2], x, y]); }
  lums.sort((p, q) => q[0] - p[0]);
  const top = lums.slice(0, Math.max(1, Math.floor(lums.length * 0.05)));
  let bl = 0; for (const [, x, y] of top) bl = Math.max(bl, lumAt(B, x / cap.W, 1 - y / cap.H, 0));
  const Lstar = LS.srgb8ToLab(cap.px[(top[0][2] * cap.W + top[0][1]) * 4], cap.px[(top[0][2] * cap.W + top[0][1]) * 4 + 1], cap.px[(top[0][2] * cap.W + top[0][1]) * 4 + 2])[0];
  out.a = { brightestGroundLstar: +Lstar.toFixed(1), foldedBloomMax: +(bl * gu.uBloomOn.value).toFixed(4), bar: '<= 0.02 linear (salt at L* 85-92: the W0 map has none; brightest lit ground stands in)', ok: bl <= 0.02, source: s.source };
  unstage();
  // (d) bloom energy share in field (and vista); (b) the sun's profile in vista
  s = await stageLook('field'); cap = await grabCanvas(); B = await bloomRead();
  const frameLin = (c) => { let t = 0; for (let i = 0; i < c.px.length; i += 16) { const r = c.px[i] / 255, g = c.px[i + 1] / 255, bb = c.px[i + 2] / 255; t += 0.2126 * r + 0.7152 * g + 0.0722 * bb; } return t / (c.px.length / 16); };
  const eField = energy(B);
  // energy as a share of the HDR frame: bloom mean over the scene mean HDR luminance (scene target read at 1/8)
  const sceneMean = () => { const st = __E.sceneTarget; const w = 64, h = 36; const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, depthBuffer: false });
    const m = new THREE.ShaderMaterial({ uniforms: { t: { value: st.texture } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }', depthTest: false });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m), sc = new THREE.Scene(); sc.add(q);
    __R.setRenderTarget(rt); __R.render(sc, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    const buf = new Float32Array(w * h * 4); __R.readRenderTargetPixels(rt, 0, 0, w, h, buf); __R.setRenderTarget(null);
    rt.dispose(); m.dispose(); q.geometry.dispose();
    let t = 0; for (let i = 0; i < buf.length; i += 4) t += 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]; return t / (w * h); };
  const smField = sceneMean();
  out.d = { field: { bloomMean: +eField.toFixed(4), sceneMean: +smField.toFixed(4), sharePct: +(100 * eField / Math.max(1e-6, smField)).toFixed(2), bar: '<= 3 %' } };
  unstage();
  s = await stageLook('vista'); cap = await grabCanvas(); B = await bloomRead();
  const eVista = energy(B), smVista = sceneMean();
  out.d.vista = { bloomMean: +eVista.toFixed(4), sceneMean: +smVista.toFixed(4), sharePct: +(100 * eVista / Math.max(1e-6, smVista)).toFixed(2), bar: '<= 8 %' };
  out.d.ok = out.d.field.sharePct <= 3 && out.d.vista.sharePct <= 8;
  // (b) the sun in vista: L* along a ray from the sun's screen position, bloom on vs off
  const sd = __C.environment.sunDir, cam = __C.camera;
  const sp = new THREE.Vector3().copy(cam.position).addScaledVector(new THREE.Vector3(sd.x, sd.y, sd.z), 1000).project(cam);
  const inFrame = Math.abs(sp.x) < 0.95 && Math.abs(sp.y) < 0.95 && sp.z < 1;
  if (!inFrame) out.b = { ok: false, note: 'the sun is not in the vista stand-in frame (L-06 sun disc and the look.vista place are world-sky / world-props W1 work)', sunNdc: [+sp.x.toFixed(2), +sp.y.toFixed(2)] };
  else {
    const sunR = Math.max(2, (0.5 * Math.PI / 180) / (cam.fov * Math.PI / 180) * cap.H);   // L-06: a 0.5 deg disc
    const prof = async () => { const c = await grabCanvas(); const sx = (sp.x * 0.5 + 0.5) * c.W, sy = (1 - (sp.y * 0.5 + 0.5)) * c.H; const o = [];
      for (const k of [6, 10, 15, 20, 30]) { const x = Math.round(sx + k * sunR), y = Math.round(sy); if (x >= c.W) { o.push(null); continue; } const i = (y * c.W + x) * 4; o.push(+LS.srgb8ToLab(c.px[i], c.px[i + 1], c.px[i + 2])[0].toFixed(1)); } return o; };
    const on = await prof();
    b.enabled = false; await frames(3); const off = await prof(); b.enabled = __E.tier.bloom;
    const lift6 = on[0] != null && off[0] != null ? on[0] - off[0] : null;
    let mono = true; for (let k = 1; k < on.length; k++) if (on[k] != null && on[k - 1] != null && on[k] > on[k - 1] + 0.5) mono = false;
    out.b = { sunRadiusPx: +sunR.toFixed(1), lstarOn: on, lstarOff: off, lift6: lift6 == null ? null : +lift6.toFixed(1), monotonic: mono, ok: lift6 != null && lift6 >= 6 && mono };
  }
  unstage();
  // (c) a hostile lamp at 40 m: the instruments' own lamp at its solved core HDR, as a probe disc
  const lamps = __C.machines?.lamps;
  const core = lamps?.coreHdr?.('hostile'), ring = lamps?.lampHdr?.('hostile');
  if (!core) out.c = { ok: null, note: 'no lamp system in this boot' };
  else {
    s = await stageLook('field', { hour: 17.75, sunRel: 180, pitch: 0.0 });
    const cam2 = __C.camera, dir = new THREE.Vector3(); cam2.getWorldDirection(dir);
    const pos = cam2.position.clone().addScaledVector(dir, 40);
    const coreR = 0.12, ringR = 0.3;
    const mk = (r, c, z) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(c.r, c.g, c.b), fog: false }));
      m.position.copy(pos).addScaledVector(dir, -z); m.lookAt(cam2.position); m.name = 'look-lamp-probe'; __C.scene.add(m); return m; };
    const mRing = mk(ringR, ring, 0), mCore = mk(coreR, core, 0.01);
    await frames(4);
    const c = await grabCanvas();
    const pp = pos.clone().project(cam2); const cx = (pp.x * 0.5 + 0.5) * c.W, cy = (1 - (pp.y * 0.5 + 0.5)) * c.H;
    const pxPerM = c.H / (2 * Math.tan(cam2.fov * Math.PI / 360) * 40);
    const coreRpx = coreR * pxPerM, ringRpx = ringR * pxPerM;
    // the halo: how far out from the disc edge the frame stays >= 3 L* above the same ray with bloom off
    const ray = (cc) => { const o = []; for (let k = 0; k < 60; k++) { const x = Math.round(cx + ringRpx + k), y = Math.round(cy); if (x >= cc.W) break; const i = (y * cc.W + x) * 4; o.push(LS.srgb8ToLab(cc.px[i], cc.px[i + 1], cc.px[i + 2])); } return o; };
    const rayRgb = (cc) => { const o = []; for (let k = 0; k < 60; k++) { const x = Math.round(cx + ringRpx + k), y = Math.round(cy); if (x >= cc.W) break; const i = (y * cc.W + x) * 4; o.push([cc.px[i], cc.px[i + 1], cc.px[i + 2]]); } return o; };
    const rOn = ray(c);
    b.enabled = false; await frames(3); const cOff = await grabCanvas(); const rOff = ray(cOff); b.enabled = __E.tier.bloom;
    let reach = 0; for (let k = 0; k < Math.min(rOn.length, rOff.length); k++) if (rOn[k][0] - rOff[k][0] >= 3) reach = k + 1;
    const haloR = ringRpx + reach;
    const hueOf = (l) => { let h = Math.atan2(l[2], l[1]) * 180 / Math.PI; return h < 0 ? h + 360 : h; };
    const tokHue = hueOf(LK.srgbToLab([1, 0x2D / 255, 0x8C / 255], [0, 0, 0]));
    // the halo's hue is the hue of the light bloom adds (on - off in linear sRGB over the halo), not of the
    // frame (which is mostly the background behind the lamp)
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const addL = [0, 0, 0];
    const rawOn = rayRgb(c), rawOff = rayRgb(cOff);
    for (let k = 0; k < Math.max(1, reach); k++) for (let q = 0; q < 3; q++) addL[q] += Math.max(0, lin(rawOn[k][q]) - lin(rawOff[k][q]));
    const mx = Math.max(addL[0], addL[1], addL[2], 1e-9);
    const enc = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    const haloLab = LK.srgbToLab([enc(addL[0] / mx), enc(addL[1] / mx), enc(addL[2] / mx)], [0, 0, 0]);
    let dh = hueOf(haloLab) - tokHue; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
    out.c = { coreRpx: +coreRpx.toFixed(1), ringRpx: +ringRpx.toFixed(1), haloRpx: +haloR.toFixed(1), haloOverCore: +(haloR / coreRpx).toFixed(2), haloHueDelta: +dh.toFixed(1),
      ok: haloR >= 2.5 * coreRpx && Math.abs(dh) <= 15, note: 'probe discs at the lamp system\\'s solved hostile ring and core HDR (lamps.coreHdr / lampHdr), 40 m on the lens axis' };
    [mRing, mCore].forEach((m) => { __C.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    unstage();
  }
  const pass = out.a.ok && out.b?.ok && out.c?.ok && out.d.ok;
  return { pass, detail: { params: { threshold: b.threshold, strength: b.strength, radius: b.radius, smoothWidth: b.highPassUniforms?.smoothWidth?.value }, ...out } };
`);

/* --------------------------------------------------------- A-csm-layer-masks */

const LAYER_MASKS = look(`
  const EM = await import('/src/core/engine.js');
  const LAY = EM.CAL_LAYER;
  if (!LAY) return { pass: false, detail: 'CAL_LAYER not exported' };
  if (!__E.csm) return { pass: null, detail: 'PENDING: CSM is not enabled in this boot' };
  const p = __C.player, cam = __C.camera, dir = new THREE.Vector3(); cam.getWorldDirection(dir);
  const at = p.position.clone().addScaledVector(dir.setY(0).normalize(), 6);
  const mk = (layer, dx) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial()); m.castShadow = true; m.layers.set(layer);
    m.position.set(at.x + dx, (__C.terrain?.getHeight?.(at.x + dx, at.z) ?? p.position.y) + 1.2, at.z); m.name = 'look-layer-probe'; __C.scene.add(m); return m; };
  const caster = mk(LAY.CASTER_ONLY, -1), near = mk(LAY.CASCADE0_ONLY, 1), plain = mk(0, 0);
  const seen = new Map([[caster, { view: 0, shadow: new Set() }], [near, { view: 0, shadow: new Set() }], [plain, { view: 0, shadow: new Set() }]]);
  const lights = __E.csm.lights;
  for (const [m, rec] of seen) {
    m.onBeforeRender = () => { rec.view++; };
    m.onBeforeShadow = (r, o, c, shadowCamera) => { const i = lights.findIndex((l) => l.shadow.camera === shadowCamera); rec.shadow.add(i); };
  }
  // every cascade renders at least once (far cascades alternate under csmFarCadence)
  await frames(8);
  const rows = {}; for (const [m, rec] of seen) rows[m === caster ? 'CASTER_ONLY' : m === near ? 'CASCADE0_ONLY' : 'layer 0'] = { viewDraws: rec.view, cascades: [...rec.shadow].sort() };
  for (const m of seen.keys()) { __C.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  const n = lights.length;
  const all = (s) => s.length === n;
  const okCaster = rows.CASTER_ONLY.viewDraws === 0 && all(rows.CASTER_ONLY.cascades);
  const okNear = rows.CASCADE0_ONLY.viewDraws > 0 && rows.CASCADE0_ONLY.cascades.length === 1 && rows.CASCADE0_ONLY.cascades[0] === 0;
  const okPlain = rows['layer 0'].viewDraws > 0 && all(rows['layer 0'].cascades);
  const maskAfter = cam.layers.mask;
  return { pass: okCaster && okNear && okPlain && (maskAfter & (1 << LAY.CASTER_ONLY)) === 0, detail: { cascades: n, rows, cameraMaskAfterFrame: maskAfter, okCaster, okNear, okPlain } };
`);

/* ------------------------------------------------------------- A-hold-frame */

const HOLD = look(`
  const s = await stageLook('field');
  if (s.skip) return { pass: null, detail: s.skip };
  const before = await grabCanvas();
  __E.holdFrame(true);
  await frames(3);
  // a held frame submits nothing: renderer.info after a held render() is 0 calls
  const calls = []; for (let i = 0; i < 10; i++) { await frame(); calls.push(__R.info.render.calls); }
  // the canvas still shows the frame (read it without drawing: preserveDrawingBuffer is off, so read
  // through a capture of the page compositor is not available here; the last real frame is compared)
  __E.holdFrame(false);
  await frames(3);
  const after = await grabCanvas();
  let diff = 0; for (let i = 0; i < before.px.length; i += 4) if (Math.abs(before.px[i] - after.px[i]) > 2) diff++;
  const heldZero = calls.slice(2).every((c) => c === 0);
  return { pass: heldZero && diff / (before.W * before.H) < 0.01, detail: { heldDrawCalls: calls, resumedDiffPct: +(100 * diff / (before.W * before.H)).toFixed(3) } };
`);

/* ---------------------------------------------------- A-gpu-attrib, A-look-ledger */

const QUIET_NOTE = 'quiet-box timing (R45): graded at the orchestrator\'s W1-exit global run; a lane run on a busy box reports PENDING-quiet-box with its numbers';

const GPU_ATTRIB = (box, build) => `(async () => {
  ${STAGE_PRELUDE}
  const __C = window.__CTX__, __E = __C.engine;
  const A = await import('/tools/look/gpu-attrib-page.mjs');
  const res = await A.attribute({ ctx: __C, scenarios: ${JSON.stringify(Object.keys(PERF_SCENARIOS))}, stage: async (name) => {
    const SC = ${JSON.stringify(PERF_SCENARIOS)};
    const r = eval(SC[name]);
    return r;
  }, owners: ${JSON.stringify(DRAW_OWNERS.map((o) => ({ id: o.id, re: o.re.source, flags: o.re.flags, lanes: o.lanes })))} });
  const box = ${JSON.stringify(box)};
  res.build = ${JSON.stringify(build)};
  res.box = box;
  if (!res.ok) return { pass: false, detail: res };
  if (!box) return { pass: null, detail: { verdict: 'PENDING: box not sampled (run A-gpu-attrib-box with it: --lane look-post or --only A-gpu-attrib-box,A-gpu-attrib)', ...res } };
  return { pass: box.quiet ? res.sumWithin10 : null, detail: { verdict: box.quiet ? (res.sumWithin10 ? 'PASS' : 'FAIL: per-pass rows do not sum to the frame within 10 %') : 'PENDING-quiet-box (R45)', ...res } };
})()`;

const LEDGER = (box, build) => `(async () => {
  ${STAGE_PRELUDE}
  const __C = window.__CTX__, __E = __C.engine;
  const AB = await import('/tools/look/ab-time-page.mjs');
  const res = await AB.abTime({ ctx: __C, scenarios: ${JSON.stringify(Object.keys(PERF_SCENARIOS))}, stage: async (name) => {
    const SC = ${JSON.stringify(PERF_SCENARIOS)};
    return eval(SC[name]);
  }, rounds: 4, frames: 40 });
  const box = ${JSON.stringify(box)};
  res.build = ${JSON.stringify(build)};
  res.box = box;
  if (!res.ok) return { pass: false, detail: res };
  if (!box) return { pass: null, detail: { verdict: 'PENDING: box not sampled (run A-look-ledger-box with it)', ...res } };
  return { pass: box.quiet ? res.allRowsOk : null, detail: { verdict: box.quiet ? (res.allRowsOk ? 'PASS' : 'FAIL') : 'PENDING-quiet-box (R45)', ...res } };
})()`;

/* -------------------------------------------------------------- visual rows */

const BEFORE_AFTER = (places, title) => lookJob(`
  const cells = [];
  for (const [name, o] of ${JSON.stringify(places)}) {
    const s = await stageLook(name, o || {});
    if (s.skip) continue;
    __E.setLookEnabled(false); await frames(4); const a = await grabCanvas();
    __E.setLookEnabled(true); await frames(4); const b = await grabCanvas();
    const sa = statsOf(a), sb = statsOf(b);
    const tag = (st) => 'lo20 ' + st.lo20.hue + 'deg  mid b ' + st.mid.b + '  C ' + st.chroma + '  p99 ' + st.L.p99;
    cells.push({ cap: a, label: name + ' ' + s.hour.toFixed(2) + ' h  W0 (ACES)  ' + tag(sa) });
    cells.push({ cap: b, label: name + ' ' + s.hour.toFixed(2) + ' h  CALIMA  ' + tag(sb) });
    unstage();
  }
  window.__lookCells = cells.length;
  sheet(cells, ${JSON.stringify(title)}, 2);
`);

const GRADE_FILM = lookJob(`
  const cells = [];
  for (const name of ['field', 'aim']) {
    const s = await stageLook(name);
    if (s.skip) continue;
    const c = await grabCanvas(); const st = statsOf(c);
    cells.push({ cap: c, label: name + ' (' + s.source + ')  lo20 hue ' + st.lo20.hue + '  mid b ' + st.mid.b + '  chroma ' + st.chroma });
    unstage();
  }
  sheet(cells, 'V-look-grade: look.field (1-TR) and look.aim (1-BL), CALIMA look', 1);
`);

const HIGHLIGHT_FILM = lookJob(`
  const s = await stageLook('vista');
  if (s.skip) { sheet([], 'V-look-highlights: ' + s.skip); return; }
  const c = await grabCanvas(); const st = statsOf(c);
  sheet([{ cap: c, label: 'look.vista (' + s.source + ')  hi10 hue ' + st.hi10.hue + ' C ' + st.hi10.chroma + '  p99 ' + st.L.p99 + '  clip ' + st.clip + '%' }], 'V-look-highlights: the sun glow and glints read cream or peach-white, not lemon', 1);
`);

const GLOW_FILM = lookJob(`
  const cells = [];
  let s = await stageLook('aim');
  if (!s.skip) {
    const lamps = __C.machines?.lamps;
    const core = lamps?.coreHdr?.('hostile'), ring = lamps?.lampHdr?.('hostile'), calm = lamps?.coreHdr?.('calm'), calmR = lamps?.lampHdr?.('calm');
    const cam = __C.camera, dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const made = [];
    const disc = (c, r, d, side, z) => { if (!c) return; const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(c.r, c.g, c.b), fog: false }));
      const right = new THREE.Vector3().crossVectors(dir, cam.up).normalize();
      m.position.copy(cam.position).addScaledVector(dir, d).addScaledVector(right, side).addScaledVector(dir, -z); m.lookAt(cam.position); m.name = 'look-lamp-probe'; __C.scene.add(m); made.push(m); };
    disc(ring, 0.3, 18, -4.5, 0); disc(core, 0.12, 18, -4.5, 0.01); disc(calmR, 0.3, 18, 4.5, 0); disc(calm, 0.12, 18, 4.5, 0.01);
    await frames(4);
    const c = await grabCanvas();
    cells.push({ cap: c, label: 'look.aim, 17:45: hostile (left) and calm (right) lamp discs at the lamp system\\'s solved HDR, 18 m; sunlit cloth and rock must not glow' });
    made.forEach((m) => { __C.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    unstage();
  }
  s = await stageLook('field', { hour: 13, sunRel: 180, pitch: -0.2 });
  if (!s.skip) { const c = await grabCanvas(); const bl = __E.bloom; cells.push({ cap: c, label: 'noon, lit ground: nothing diffuse may glow (bloom from HDR ' + bl.threshold.toFixed(2) + ' = display L* 94, knee ' + bl.highPassUniforms.smoothWidth.value.toFixed(2) + ')' }); unstage(); }
  sheet(cells, 'V-look-glow: only true highlights glow (L-07)', 1);
`);

const RANDOM_FILM = lookJob(`${RANDOM_BODY(true)}
  sheet(cells, 'V-look-random: 12 seeded poses, hours 16:30-19:45 (stand-in map until the Pans land)', 4);
`);

/* ------------------------------------------------------------------ aliases */

const ALIAS_IDS = {
  'engine-gpu': ['A-gpu-tier-box', 'A-gpu-tier', 'A-rt-ledger', 'A22-msaa', 'A108-ao-periodicity', 'A109-ao-distance-fade', 'V20-aa-crop', 'V33b-no-ao-lattice', 'V-gpu-tier-look'],
  'instruments-core': ['A-lamp-canon-distance', 'A-lamp-states', 'A-weak40'],
  'hero-body': ['A-brea-contrast'],
};
async function aliases() {
  const out = [];
  const files = { 'engine-gpu': './gates.r5.engine-gpu.mjs', 'instruments-core': './gates.r5.instruments-core.mjs', 'hero-body': './gates.r5.hero-body.mjs' };
  for (const [lane, file] of Object.entries(files)) {
    let mod;
    try { mod = await import(file); } catch (e) { continue; }
    for (const want of ALIAS_IDS[lane]) {
      // the row by its id, or by its id with a shadow suffix (engine-gpu's sid()), or by a kind-block prefix
      const g = mod.GATES.find((r) => r.id === want) || mod.GATES.find((r) => r.id.startsWith(want + '@') || r.id.startsWith(want + ':'));
      if (!g) continue;
      const row = Object.defineProperties({}, Object.getOwnPropertyDescriptors(g));
      Object.defineProperty(row, 'id', { value: want + '@look-post', enumerable: true, writable: true, configurable: true });
      Object.defineProperty(row, 'lane', { value: LANE, enumerable: true, writable: true, configurable: true });
      Object.defineProperty(row, 'inherits', { value: { id: g.id, lane: g.lane || lane }, enumerable: true, configurable: true });
      if (row.kind === 'runner' && typeof g.check === 'function' && want === 'A-gpu-tier-box') {
        // the box witness rewrites A-gpu-tier's assert by id: point it at the alias
        const chk = g.check;
        // (a Proxy that answers to the target's id and writes the assert through to the alias row)
        row.check = (ctx) => chk({ ...ctx, GATES: ctx.GATES.filter((r) => r.id !== 'A-gpu-tier')
          .map((r) => (r.id === 'A-gpu-tier@look-post' ? new Proxy(r, { get: (t, k) => (k === 'id' ? 'A-gpu-tier' : t[k]), set: (t, k, v) => { t[k] = v; return true; } }) : r)) });
      }
      out.push(row);
      // the same row on the Round-5 W0 output in the same run (`?look=w0`), so a re-measured row that moves
      // under the look says whether the look moved it (diagnostic, not graded)
      if (W0_TWINS.includes(want)) {
        const tw = Object.defineProperties({}, Object.getOwnPropertyDescriptors(row));
        Object.defineProperty(tw, 'id', { value: want + '@look-post-w0', enumerable: true, writable: true, configurable: true });
        Object.defineProperty(tw, 'lane', { value: LANE + '-diag', enumerable: true, writable: true, configurable: true });
        Object.defineProperty(tw, 'params', { value: (g.params ? g.params + '&' : '') + 'look=w0', enumerable: true, writable: true, configurable: true });
        out.push(tw);
      }
    }
  }
  return out;
}
const W0_TWINS = ['A108-ao-periodicity', 'A-weak40', 'A-lamp-states'];

/* ------------------------------------------------------------------- the rows */

/**
 * Quiet-box rows: the box is sampled in node right before the row runs (a runner row placed first
 * rewrites the target's assert with the sample, as engine-gpu's A-gpu-tier-box does). Nothing here
 * spawns a process at import (A-port-guard).
 */
const boxRow = (id, targetId, build) => ({
  id, kind: 'runner', lane: LANE, wave: 'W1', timeout: 20000,
  title: `Box witness for ${targetId}: 1-min load average < 3 and 0 other headless Chromes, sampled in node and handed to it (R45); its clocks are graded only on a quiet box`,
  check({ GATES: all }) {
    const box = boxSample();
    const target = (all || []).find((g) => g.id === targetId);
    if (target) target.assert = build(box, gitWitness());
    return { pass: box.quiet ? true : null, detail: { ...box, handedTo: target ? target.id : null } };
  },
});

export const GATES = [
  { id: 'A-look-suite-files', kind: 'runner', lane: LANE, wave: 'W1', timeout: 240000,
    title: 'A-look-suite (b) look-stats self-test (synthetic 6 patches +-0.5, fixture +-0.3), (c) refs.json <= 20 KB with 0 bytes of image data, (f) no file of this tree matches a reference image SHA-256',
    check: () => suiteFiles() },
  { id: 'A-look-tonemap', kind: 'action', lane: LANE, wave: 'W1', timeout: 120000, settle: 1500,
    title: 'AgX + CALIMA look through the live grade pass: (a) 0.18 -> L* 50 +-1.5, 0.02 -> 6-12, 1.6 -> 85-91 at grade mix 0; (b) GPU == engine.look.evaluate within 1/255, invert round-trips within 1/255; (c) hue skew bars; (d) 64-step grey ramp 0.001-32 strictly increasing',
    assert: TONEMAP },
  { id: 'A-look-frame-stats', kind: 'action', lane: LANE, wave: 'W1', timeout: 300000, settle: 1500,
    title: 'Look staging (field, vista, aim, close, dusk) against their panels (1-TR, 1-MR, 1-BL, 1-MC, 2-MR) at ROUND5-LOOK §7 bars; every LUT texel == look.js within 1/255',
    assert: FRAME_STATS },
  { id: 'A-look-suite', kind: 'action', lane: LANE, wave: 'W1', timeout: 300000, settle: 1500,
    title: 'A-look-suite (a) every look place: 0 console errors, identical canvas SHA-256 on 2 consecutive captures; (d) planted boxes at 30/120/400/900 m in the right depth bins; (e) the capture is the WebGL canvas (HUD = 0 px)',
    assert: SUITE },
  { id: 'A-look-random', kind: 'action', lane: LANE, wave: 'W1', timeout: 300000, settle: 1500,
    title: '12 seeded random poses (16:30-19:45, 20-200 m from any gate place): >= 9 of 12 meet look.field\'s A-look-frame-stats bars',
    assert: RANDOM },
  { id: 'A-look-bloom', kind: 'action', lane: LANE, wave: 'W1', timeout: 240000, settle: 1500,
    title: 'L-07 bloom: (a) lit ground at noon folded bloom <= 0.02 linear; (b) look.vista +>= 6 L* at 6 sun radii, monotonic to 30; (c) hostile lamp at 40 m halo >= 2.5x core, hue within 15 deg; (d) bloom energy <= 8 % vista, <= 3 % field',
    assert: BLOOM },
  { id: 'A-csm-layer-masks', kind: 'action', lane: LANE, wave: 'W1', timeout: 90000, settle: 1500,
    title: 'G-post per-cascade layer masks: CASTER_ONLY casts in every cascade and never draws in the view; CASCADE0_ONLY draws in the view and casts in cascade 0 only; the camera mask is restored after the shadow pass',
    assert: LAYER_MASKS },
  { id: 'A-hold-frame', kind: 'action', lane: LANE, wave: 'W1', timeout: 90000, settle: 1500,
    title: 'U-03 engine half: engine.holdFrame(true) submits 0 draws per frame while held; the frame resumes unchanged',
    assert: HOLD },
  boxRow('A-gpu-attrib-box', 'A-gpu-attrib', GPU_ATTRIB),
  { id: 'A-gpu-attrib', kind: 'action', lane: LANE, wave: 'W1', timeout: 600000, settle: 2500,
    title: 'L-18: records the build it times; vista, herd and staged fight each give a per-pass table (skip-one marginals on the A21 whole-frame timer: shadow maps, GTAO, bloom, SMAA, grade LUT, transparent + additive; remainder = opaque scene + AgX) whose rows sum to what switching them all off removes within 10 % of the frame; per-owner hide-one marginals plus residual. ' + QUIET_NOTE,
    assert: GPU_ATTRIB(null, null) },
  boxRow('A-look-ledger-box', 'A-look-ledger', LEDGER),
  { id: 'A-look-ledger', kind: 'action', lane: LANE, wave: 'W1', timeout: 600000, settle: 2500,
    title: 'L-16: every registered look item A/B-timed on the A21 frames (>= 0.10 ms alone, the rest as one group), 4 interleaved rounds; each row <= 0.45 ms; draws <= 350. ' + QUIET_NOTE,
    assert: LEDGER(null, null) },
  { id: 'V-look-before-after', kind: 'visual', lane: LANE, wave: 'W1', timeout: 300000, settle: 150000,
    setup: BEFORE_AFTER([['field'], ['vista'], ['aim']], 'V-look-before-after (1/2): Round-5 W0 output (left) vs the CALIMA look (right), same frame, same build'),
    criteria: 'The same five frames (field, vista, aim, close, dusk), Round-5 W0 output (ACES 0.94, left) beside the CALIMA look (AgX + grade, right). Against ext:kevin-nov6-keyart.jpg@860d7e9f#1-TR, #1-MR, #1-TL and ext:kevin-nov6-stills.md@bf79cdc9#5-1: the right column reads warmer in the light and rose-violet in the shadows, highlights cream not lemon, grass amber not olive, no crushed blacks, no banding; it must not look cheaper or muddier than the left. ' + IP_CLAUSE },
  { id: 'V-look-before-after-2', kind: 'visual', lane: LANE, wave: 'W1', timeout: 300000, settle: 120000,
    setup: BEFORE_AFTER([['close'], ['dusk'], ['field', { hour: 12.5, sunRel: 140, pitch: 0.02 }]], 'V-look-before-after (2/2): close 18:45, dusk 19:45, noon (the noon set): W0 (left) vs CALIMA (right)'),
    criteria: 'As V-look-before-after, for the close-up (ext:kevin-nov6-keyart.jpg@860d7e9f#1-MC: skin warm with readable shadow side, no crushed face), dusk (ext:kevin-nov6-board.jpg@f2694e04#2-MR: violet-rose dusk, not brown) and noon (the noon set: neutral, no golden-hour cast forced on midday). ' + IP_CLAUSE },
  { id: 'V-look-grade', kind: 'visual', lane: LANE, wave: 'W1', timeout: 240000, settle: 90000,
    setup: GRADE_FILM,
    criteria: 'look.field and look.aim against ext:kevin-nov6-keyart.jpg@860d7e9f#1-TR, #1-BL and reference/r5/gates-perf/long-shadows.jpg. Pass: 1. rock and cloth shadows read violet-rose, not olive or brown; 2. sunlit grass reads amber-gold, not mustard; 3. Brea\'s violet is the most saturated hue; 4. no crushed black outside the vignette. ' + IP_CLAUSE },
  { id: 'V-look-highlights', kind: 'visual', lane: LANE, wave: 'W1', timeout: 240000, settle: 60000,
    setup: HIGHLIGHT_FILM,
    criteria: 'look.vista against ext:kevin-nov6-keyart.jpg@860d7e9f#1-MR and reference/r5/gates-perf/golden-clouds.jpg. Pass: the sun glow and sea glints read cream or peach-white, not lemon; no hue banding round the sun. ' + IP_CLAUSE },
  { id: 'V-look-glow', kind: 'visual', lane: LANE, wave: 'W1', timeout: 240000, settle: 70000,
    setup: GLOW_FILM,
    criteria: 'Against ext:kevin-nov6-keyart.jpg@860d7e9f#1-BL and reference/r5/gates-perf/spark-burst.jpg. Pass: the lamp or arrow tip has a soft halo; sunlit cloth and rock do not glow. ' + IP_CLAUSE },
  { id: 'V-look-random', kind: 'visual', lane: LANE, wave: 'W1', timeout: 300000, settle: 160000,
    setup: RANDOM_FILM,
    criteria: 'The 12 A-look-random frames, graded for R54 (R66 b) against ext:kevin-nov6-keyart.jpg@860d7e9f#1-TR and #1-MR, reference/r5/gates-perf/long-shadows.jpg and reference/r5/gates-perf/ridge-skyline.jpg: none looks cheap beside them. ' + IP_CLAUSE },
  ...(await aliases()),
];
