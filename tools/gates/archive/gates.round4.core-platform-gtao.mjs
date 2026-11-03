/**
 * Round 4 gates — lane `core-platform-gtao` (docs/ROUND4-AUDIT.md §4,
 * docs/ROUND4-CORE-GTAO.md).
 *
 * THE DEFECT. With GTAO on (tiers high / ultra) a screen-locked plaid of
 * vertical bars and horizontal bands covered every distant vista — the massif,
 * the haze band, the rim in V33 and every V44 tile. Two causes, both measured:
 *
 *   1. (the lattice) three r169's GTAO shader reads the centre depth NEAREST at
 *      vUv and rebuilds the centre position at vUv. At half resolution every AO
 *      texel centre lands exactly on the boundary between two full-res depth
 *      texels, and float rounding picks one or the other in irregular runs of
 *      whole columns and rows. Where it picks the far one, the kernel sees the
 *      centre sunk into a receding wall and reads occlusion. Runs of columns x
 *      runs of rows = the plaid. Worst at high/DPR 1.5 (autocorrelation peak
 *      0.37 at a 30 px lag on the massif, control 0.07).
 *   2. (the far-field term) a 0.55 m radius at 150 m+ is a texel or two, and a
 *      24-bit depth step is 7 cm at 350 m, so the far AO is depth quantisation:
 *      shipped occlusion ROSE with distance (0.07 at 30-100 m, 0.12 at
 *      150-250 m) and darkened the rim 4-10 % even on ultra, where the lattice
 *      itself is absent.
 *
 * WHAT THE GATES READ. Real framebuffer pixels and the AO target itself — no
 * counters. A108 is the lattice (periodicity), A109 is the far-field term (AO vs
 * view distance, and the rim's luminance against a GTAO-off control), V33b is
 * the film. All three switch tier and pixel ratio IN-PAGE through the public
 * engine API (setQuality + basePixelRatio + resize), because the runner's page
 * is always 1600x900 at deviceScaleFactor 1; "DPR 2" therefore means
 * basePixelRatio = min(2, tier.dprCap), which is exactly what a DPR-2 display
 * gets from the engine (high caps at 1.5, ultra at 2).
 *
 * Same contract as tools/gates.config.mjs: `assert` runs in page context with
 * __CTX__/__GAME__ and resolves { pass, detail }. No backticks and no dollar-
 * brace inside the page strings below — they are template literals.
 */

/** Page-context kit shared by all three gates. */
const KIT = `
  const ctx = __CTX__, e = ctx.engine, renderer = ctx.renderer, cam = ctx.camera, T = ctx.terrain;
  const gl = renderer.getContext();
  const p = ctx.player;
  p._updateCamera = () => {};
  if (ctx.studio) ctx.studio.update = () => {};
  let camFn = null;
  const draw = (n) => {
    for (let i = 0; i < (n || 5); i++) {
      if (camFn) camFn();
      e._shadowCullClock = 0;           // the cull pass is rate-limited to 10 Hz
      e.render(0.05);
    }
  };
  const W = () => renderer.domElement.width, H = () => renderer.domElement.height;

  /* --- cameras ---------------------------------------------------------- */
  /** V33's rim camera (camp, 5 m up, 09:00) rotated to a bearing. 180 = V33. */
  const rimYaw = (yawDeg) => {
    ctx.environment && ctx.environment.setWeather && ctx.environment.setWeather('clear', 0);
    ctx.environment && ctx.environment.setTime && ctx.environment.setTime(9.0);
    p.position.set(22, 0, -6); p._snapToGround && p._snapToGround();
    ctx.vegetation && ctx.vegetation.forceStream && ctx.vegetation.forceStream(22, -6);
    const y = T.getHeight(22, -6), yaw = yawDeg * Math.PI / 180;
    camFn = () => {
      cam.fov = 52; cam.updateProjectionMatrix();
      cam.position.set(22, y + 5.0, -6);
      cam.lookAt(22 + Math.sin(yaw) * 324, y + 120, -6 + Math.cos(yaw) * 324);
      cam.updateMatrixWorld(true);
    };
  };
  /** Eye height (1.7 m) at the camp looking north, 7 deg down: ground from
   *  ~2.5 m to the rim in one frame, so every AO distance is on screen. */
  const eyeNorth = () => {
    ctx.environment && ctx.environment.setWeather && ctx.environment.setWeather('clear', 0);
    ctx.environment && ctx.environment.setTime && ctx.environment.setTime(10.0);
    p.position.set(52, 0, 24); p._snapToGround && p._snapToGround();
    ctx.vegetation && ctx.vegetation.forceStream && ctx.vegetation.forceStream(22, -6);
    const gy = T.getHeight(22, -6);
    camFn = () => {
      cam.fov = 55; cam.updateProjectionMatrix();
      cam.position.set(22, gy + 1.7, -6);
      cam.lookAt(22, gy + 1.7 - 100 * Math.tan(0.12), -106);
      cam.updateMatrixWorld(true);
    };
  };
  /** 14 m up over the open meadow SW of the valley station, 40 deg lens: the
   *  whole frame is ground at 25-100 m (no tree line, no tanks in the crops). */
  const midMeadow = () => {
    ctx.environment && ctx.environment.setWeather && ctx.environment.setWeather('clear', 0);
    ctx.environment && ctx.environment.setTime && ctx.environment.setTime(10.0);
    const CX = 30, CZ = -60, b = 215 * Math.PI / 180;
    const tx = CX + Math.sin(b) * 50, tz = CZ + Math.cos(b) * 50;
    p.position.set(CX + 8, 0, CZ + 8); p._snapToGround && p._snapToGround();
    ctx.vegetation && ctx.vegetation.forceStream && ctx.vegetation.forceStream(tx, tz);
    const gy = T.getHeight(CX, CZ);
    camFn = () => {
      cam.fov = 40; cam.updateProjectionMatrix();
      cam.position.set(CX, gy + 14, CZ);
      cam.lookAt(tx, T.getHeight(tx, tz), tz);
      cam.updateMatrixWorld(true);
    };
  };
  /** 2 m above the ground, 2.6 m out from a camp hut (huts[0]), looking at
   *  where its wall meets the ground: the contact AO the fix must keep. */
  const hutClose = () => {
    ctx.environment && ctx.environment.setWeather && ctx.environment.setWeather('clear', 0);
    ctx.environment && ctx.environment.setTime && ctx.environment.setTime(10.0);
    const h = ctx.camp.huts[0];
    const wx = h.x, wz = h.z + h.r, cx = h.x, cz = h.z + h.r + 2.6;
    p.position.set(h.x + 30, 0, h.z - 30); p._snapToGround && p._snapToGround();
    ctx.vegetation && ctx.vegetation.forceStream && ctx.vegetation.forceStream(cx, cz);
    const gy = T.getHeight(cx, cz);
    camFn = () => {
      cam.fov = 55; cam.updateProjectionMatrix();
      cam.position.set(cx, gy + 2.0, cz);
      cam.lookAt(wx, T.getHeight(wx, wz) + 0.3, wz);
      cam.updateMatrixWorld(true);
    };
  };

  /* --- tier / pixel ratio ---------------------------------------------- */
  const keep = { q: e.quality, pr: e.basePixelRatio, drs: e.drsEnabled };
  e.setDynamicResolution(false);
  const setTierDpr = (tier, dpr) => {
    e.setQuality(tier);
    e.basePixelRatio = Math.min(dpr, e.tier.dprCap);
    e.renderScale = 1;
    e.resize();
  };
  const restore = () => {
    e.setQuality(keep.q);
    e.basePixelRatio = keep.pr; e.renderScale = 1; e.resize();
    e.setDynamicResolution(keep.drs);
    e.gtao.enabled = e.tier.gtao;
    camFn = null;
  };

  /* --- framebuffer reads (same task as the render: no preserveDrawingBuffer) */
  /** device-px rect, top-left origin -> top-down RGBA */
  const readRect = (x0, yTop, w, h) => {
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(x0, H() - yTop - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = new Uint8Array(w * h * 4);
    for (let r = 0; r < h; r++) out.set(buf.subarray((h - 1 - r) * w * 4, (h - r) * w * 4), r * w * 4);
    return out;
  };
  const lum = (rgba, i) => (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
  /** S x S device-px luminance crop centred at a frame fraction */
  const lumCrop = (cx, cy, S) => {
    const x0 = Math.max(0, Math.min(W() - S, Math.round(cx * W() - S / 2)));
    const y0 = Math.max(0, Math.min(H() - S, Math.round(cy * H() - S / 2)));
    const px = readRect(x0, y0, S, S), L = new Float64Array(S * S);
    for (let i = 0; i < S * S; i++) L[i] = lum(px, i);
    return L;
  };
  /** mean luminance of a frame-fraction rect */
  const meanLum = (fx0, fy0, fx1, fy1) => {
    const x0 = Math.round(fx0 * W()), y0 = Math.round(fy0 * H());
    const w = Math.round((fx1 - fx0) * W()), h = Math.round((fy1 - fy0) * H());
    const px = readRect(x0, y0, w, h);
    let s = 0;
    for (let i = 0; i < w * h; i++) s += lum(px, i);
    return s / (w * h);
  };
  const hf = (u) => {
    const s = (u & 0x8000) ? -1 : 1, ex = (u >> 10) & 0x1f, f = u & 0x3ff;
    if (ex === 0) return s * Math.pow(2, -14) * (f / 1024);
    if (ex === 31) return f ? NaN : s * Infinity;
    return s * Math.pow(2, ex - 15) * (1 + f / 1024);
  };

  /* --- autocorrelation --------------------------------------------------- */
  const fft1 = (re, im, inv) => {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  };
  const fft2 = (re, im, N, inv) => {
    const rr = new Float64Array(N), ii = new Float64Array(N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) { rr[x] = re[y * N + x]; ii[x] = im[y * N + x]; }
      fft1(rr, ii, inv);
      for (let x = 0; x < N; x++) { re[y * N + x] = rr[x]; im[y * N + x] = ii[x]; }
    }
    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) { rr[y] = re[y * N + x]; ii[y] = im[y * N + x]; }
      fft1(rr, ii, inv);
      for (let y = 0; y < N; y++) { re[y * N + x] = rr[y]; im[y * N + x] = ii[y]; }
    }
  };
  /**
   * Normalised 2-D luminance autocorrelation of an S x S crop, returning the
   * strongest PERIODIC peak: a strict local maximum (8-neighbourhood) at a
   * Chebyshev lag of 2..32 px. The crop is high-passed first (minus a tent blur
   * of radius 24, i.e. a box of radius 12 applied twice) — without it every
   * lag of a real photo correlates near 1.0 through the slow haze/illumination
   * gradient and no peak means anything; periods up to ~48 px survive, so the
   * whole 2..32 window is intact. Zero-padded to 2S (no wrap-around), and each
   * lag is divided by its overlap so long lags are not shrunk.
   */
  const acorr = (L, S) => {
    const hp = 12;
    const blur = (src) => {
      const tmp = new Float64Array(S * S), dst = new Float64Array(S * S);
      for (let y = 0; y < S; y++) {
        let acc = 0, n = 0;
        for (let x = 0; x <= hp && x < S; x++) { acc += src[y * S + x]; n++; }
        for (let x = 0; x < S; x++) {
          tmp[y * S + x] = acc / n;
          const xo = x - hp, xi = x + hp + 1;
          if (xo >= 0) { acc -= src[y * S + xo]; n--; }
          if (xi < S) { acc += src[y * S + xi]; n++; }
        }
      }
      for (let x = 0; x < S; x++) {
        let acc = 0, n = 0;
        for (let y = 0; y <= hp && y < S; y++) { acc += tmp[y * S + x]; n++; }
        for (let y = 0; y < S; y++) {
          dst[y * S + x] = acc / n;
          const yo = y - hp, yi = y + hp + 1;
          if (yo >= 0) { acc -= tmp[yo * S + x]; n--; }
          if (yi < S) { acc += tmp[yi * S + x]; n++; }
        }
      }
      return dst;
    };
    const lo = blur(blur(L)), N = S * 2;
    const re = new Float64Array(N * N), im = new Float64Array(N * N);
    let v0 = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = L[y * S + x] - lo[y * S + x];
      re[y * N + x] = d; v0 += d * d;
    }
    fft2(re, im, N, false);
    for (let i = 0; i < N * N; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
    fft2(re, im, N, true);
    const r0 = re[0] / (S * S);
    const R = (dx, dy) => {
      const ix = (dx + N) % N, iy = (dy + N) % N;
      return (re[iy * N + ix] / ((S - Math.abs(dx)) * (S - Math.abs(dy)))) / r0;
    };
    let best = { peak: -1, lag: [0, 0] };
    for (let dy = -32; dy <= 32; dy++) for (let dx = 0; dx <= 32; dx++) {
      const ch = Math.max(Math.abs(dx), Math.abs(dy));
      if (ch < 2 || (dx === 0 && dy < 0)) continue;
      const v = R(dx, dy);
      let isMax = v > best.peak;
      for (let oy = -1; oy <= 1 && isMax; oy++) for (let ox = -1; ox <= 1; ox++) {
        if ((ox || oy) && R(dx + ox, dy + oy) >= v) { isMax = false; break; }
      }
      if (isMax) best = { peak: v, lag: [dx, dy] };
    }
    return { peak: +best.peak.toFixed(3), lag: best.lag, rms: +Math.sqrt(v0 / (S * S)).toFixed(4) };
  };
`;

/* ------------------------------------------------------------------------ */
const A108 = `(async () => {
  ${KIT}
  /* Crops. The far massif (300 m+) and haze band of V33's frame, the near
   * meadow under it (10-30 m), and two open-meadow mid-ground patches of the
   * raised meadow view (AO-target view distance min/median/max 35/38/40 m and
   * 55/60/63 m). Each was chosen because its GTAO-off control stayed
   * peak-free (max 0.05-0.10 over three frames each at high@1, high@1.5 and
   * ultra@2) — real scenery is not white noise, and a crop whose control
   * already peaks cannot show whether GTAO added the peak. Rejected for that
   * reason: the strata on the V33 wall at (0.35, 0.40) (control 0.17 at lag
   * 13,-28, dipping beds), the conifer whorls at (0.5, 0.78) (0.38 at 0,26,
   * branch tiers), eye-height patches that caught the tree line or the tank
   * ribs, and meadow patches whose grass cards resolve into a 10-12 px blade
   * rhythm at DPR 2 (control 0.14-0.20).
   *
   * RULE. Crop measurable (control < BAR): GTAO on must be < BAR. The two FAR
   * crops must be measurable in every configuration — they are what the defect
   * covered. A near/mid crop whose control peaks >= BAR in one frame is
   * reported as content-limited and must not gain more than 0.03 with GTAO on;
   * more than one such crop in a configuration fails the run as unmeasured. */
  const FRAMES = [
    { stage: () => rimYaw(180), crops: { farMassif: [0.72, 0.30], hazeBand: [0.5, 0.55], nearMeadow: [0.2, 0.88] } },
    { stage: midMeadow, crops: { midGround38m: [0.35, 0.70], midGround60m: [0.5, 0.40] } },
  ];
  const FAR = { farMassif: 1, hazeBand: 1 };
  const BAR = 0.15, S = 256, SLACK = 0.03;
  const configs = [], fails = [];
  let worst = { peak: -1 };
  try {
    for (const tier of ['low', 'medium', 'high', 'ultra']) {
      e.setQuality(tier);
      if (!e.tier.gtao) { configs.push(tier + ': gtao off in this tier (not measured)'); continue; }
      for (const dpr of [1, 2]) {
        setTierDpr(tier, dpr);
        const pr = +renderer.getPixelRatio().toFixed(2);
        const tag = tier + '@' + pr;
        // the AO buffer must follow the tier it is in (setQuality used to keep the boot tier's scale)
        const wantW = Math.max(2, Math.round(W() * e.tier.gtaoScale));
        if (e.gtao.width !== wantW) fails.push(tag + ': AO buffer ' + e.gtao.width + ' px wide, tier wants ' + wantW);
        const row = { cfg: tag, ao: e.gtao.width + 'x' + e.gtao.height };
        let limited = 0;
        for (const fr of FRAMES) {
          fr.stage();
          const got = {};
          for (const on of [false, true]) {
            e.gtao.enabled = on;
            draw(5);
            const Ls = {};
            for (const k in fr.crops) Ls[k] = lumCrop(fr.crops[k][0], fr.crops[k][1], S);   // read all before any math
            for (const k in Ls) (got[k] = got[k] || {})[on ? 'on' : 'off'] = acorr(Ls[k], S);
          }
          e.gtao.enabled = e.tier.gtao;
          for (const k in got) {
            const g = got[k];
            row[k] = g.on.peak + '@' + g.on.lag.join(',') + ' (off ' + g.off.peak + ')';
            if (g.off.peak >= BAR) {
              limited++;
              row[k] += ' CONTENT-LIMITED';
              if (FAR[k]) fails.push(tag + ' ' + k + ': CONTROL peaks ' + g.off.peak + ' on a far crop — the defect region is unmeasurable');
              if (g.on.peak > g.off.peak + SLACK) fails.push(tag + ' ' + k + ': GTAO adds periodicity on a content-limited crop, ' + g.off.peak + ' -> ' + g.on.peak);
              continue;
            }
            if (g.on.peak >= BAR) fails.push(tag + ' ' + k + ': periodic peak ' + g.on.peak + ' at lag ' + g.on.lag.join(',') + ' (control ' + g.off.peak + ')');
            if (g.on.peak > worst.peak) worst = { peak: g.on.peak, lag: g.on.lag, where: tag + ' ' + k, control: g.off.peak };
          }
        }
        if (limited > 1) fails.push(tag + ': ' + limited + ' crops content-limited — this configuration was not measured');
        configs.push(row);
      }
    }
  } finally {
    restore();
  }
  if (e.gtaoPatched !== true) fails.push('engine.gtaoPatched is ' + e.gtaoPatched + ' — the depth-consistent GTAO shader is not installed');
  return { pass: fails.length === 0, detail: { bar: BAR, worstMeasured: worst, fails: fails.slice(0, 8), configs } };
})()`;

/* ------------------------------------------------------------------------ */
const A109 = `(async () => {
  ${KIT}
  /* AO against view distance, read from the AO target itself: for this
   * measurement the GTAO shader writes the view distance into alpha
   * (FRAGMENT_OUTPUT is three's own hook; PD denoise reads rgb only, so the
   * frame is unchanged), then every AO texel is binned by distance. Occlusion
   * = mean(1 - ao) of the raw (pre-denoise) term in the bin. */
  const m = e.gtao.gtaoMaterial;
  const BINS = { at5m: [4, 6], at50m: [45, 55], at200m: [150, 250], beyond150m: [150, 1e9] };
  const tiers = [], fails = [];
  try {
    for (const tier of ['high', 'ultra']) {
      setTierDpr(tier, 1);
      if (!e.tier.gtao) { tiers.push({ tier, note: 'gtao off in this tier' }); continue; }
      const row = { tier };
      eyeNorth();
      e.gtao.enabled = true;
      m.defines.FRAGMENT_OUTPUT = 'vec4(vec3(ao), -viewPos.z)';
      m.needsUpdate = true;
      let a;
      try {
        draw(4);
        const rt = e.gtao.gtaoRenderTarget;
        a = new Uint16Array(rt.width * rt.height * 4);
        renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, a);
      } finally {
        delete m.defines.FRAGMENT_OUTPUT;
        m.needsUpdate = true;
      }
      const acc = {};
      for (const k in BINS) acc[k] = { n: 0, occ: 0 };
      for (let i = 0; i < a.length / 4; i++) {
        const d = hf(a[i * 4 + 3]);
        if (!(d > 2)) continue;                      // sky/cleared texels hold alpha 1
        const occ = 1 - hf(a[i * 4]);
        for (const k in BINS) if (d >= BINS[k][0] && d < BINS[k][1]) { acc[k].n++; acc[k].occ += occ; }
      }
      for (const k in BINS) row[k] = { n: acc[k].n, occ: +(acc[k].occ / Math.max(1, acc[k].n)).toFixed(4) };
      const o5 = row.at5m.occ, oFar = row.beyond150m.occ;
      row.farOverNear = +(oFar / Math.max(1e-6, o5)).toFixed(4);
      if (row.at5m.n < 500) fails.push(tier + ': only ' + row.at5m.n + ' AO texels at 4-6 m — the frame does not see near ground');
      if (row.beyond150m.n < 500) fails.push(tier + ': only ' + row.beyond150m.n + ' AO texels past 150 m');
      if (o5 < 0.05) fails.push(tier + ': near-field AO is ' + o5 + ' at 5 m — contact AO must stay visible');
      if (oFar > 0.10 * o5) fails.push(tier + ': AO past 150 m is ' + row.farOverNear + ' of its 5 m value (bar 0.10)');

      /* the far rim, GTAO on vs off, V33's frame and band */
      rimYaw(180);
      const band = [];
      for (const on of [false, true]) {
        e.gtao.enabled = on;
        draw(5);
        band.push(meanLum(0.15, 0.25, 0.85, 0.58));
      }
      e.gtao.enabled = e.tier.gtao;
      row.rimLumOff = +band[0].toFixed(4);
      row.rimLumOn = +band[1].toFixed(4);
      row.rimRatio = +(band[1] / band[0]).toFixed(4);
      if (Math.abs(row.rimRatio - 1) > 0.03) fails.push(tier + ': far rim luminance with GTAO is ' + row.rimRatio + ' of GTAO-off (bar +-3 %)');
      tiers.push(row);
    }
  } finally {
    restore();
  }
  return { pass: fails.length === 0, detail: { fails, tiers } };
})()`;

/* ------------------------------------------------------------------------ */
const V33B_SETUP = `(() => {
  ${KIT}
  /* 4 x 4 contact sheet, 400 x 225 tiles:
   *   row 0  tier HIGH,  GTAO on — the rim vista at bearings N / E / S / W (V33 = N)
   *   row 1  tier ULTRA, GTAO on — the same four
   *   row 2  1:1 device-pixel crops of the N massif: high on | high OFF | ultra on | ultra OFF
   *   row 3  the 2 m hut-base close-up:               high on | high OFF | ultra on | ultra OFF
   * Rows 0-1 are 4x downscales (the old plaid read at this scale: bands of
   * 60 px); row 2 is where a pixel-scale lattice would have to show. */
  const TW = 400, TH = 225;
  const sheet = document.createElement('canvas');
  sheet.width = 1600; sheet.height = 900;
  const g2 = sheet.getContext('2d');
  const tmp = document.createElement('canvas');
  const tg = tmp.getContext('2d');
  const put = (rgbaTopDown, w, h, col, row, label, scale) => {
    tmp.width = w; tmp.height = h;
    tg.putImageData(new ImageData(new Uint8ClampedArray(rgbaTopDown.buffer), w, h), 0, 0);
    g2.drawImage(tmp, 0, 0, w, h, col * TW, row * TH, TW, TH);
    g2.fillStyle = '#000'; g2.globalAlpha = 0.6;
    g2.fillRect(col * TW, row * TH, 8 + label.length * 7.3, 18);
    g2.globalAlpha = 1; g2.fillStyle = '#ffe3b0';
    g2.font = '12px ui-monospace, monospace';
    g2.fillText(label, col * TW + 5, row * TH + 13);
  };
  const full = () => { draw(4); return readRect(0, 0, W(), H()); };
  const crop = () => {
    draw(4);
    const x0 = Math.round(0.5 * W() - TW / 2), y0 = Math.round(0.33 * H() - TH / 2);
    return readRect(x0, y0, TW, TH);
  };
  const YAWS = [[180, 'N'], [90, 'E'], [0, 'S'], [270, 'W']];
  try {
    ['high', 'ultra'].forEach((tier, r) => {
      setTierDpr(tier, 1);
      e.gtao.enabled = e.tier.gtao;
      YAWS.forEach(([yaw, name], c) => {
        rimYaw(yaw);
        put(full(), W(), H(), c, r, tier + ' gtao ' + (e.gtao.enabled ? 'on' : 'OFF') + '  rim ' + name);
      });
    });
    ['high', 'ultra'].forEach((tier, t) => {
      setTierDpr(tier, 1);
      rimYaw(180);
      e.gtao.enabled = true;  put(crop(), TW, TH, t * 2, 2, tier + ' on   1:1 massif crop');
      e.gtao.enabled = false; put(crop(), TW, TH, t * 2 + 1, 2, tier + ' OFF  1:1 massif crop');
      hutClose();
      e.gtao.enabled = true;  put(full(), W(), H(), t * 2, 3, tier + ' on   2 m hut base');
      e.gtao.enabled = false; put(full(), W(), H(), t * 2 + 1, 3, tier + ' OFF  2 m hut base');
      e.gtao.enabled = e.tier.gtao;
    });
  } finally {
    restore();
  }
  const img = new Image();
  img.src = sheet.toDataURL('image/png');
  img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647';
  document.body.appendChild(img);
})();`;

export const GATES = [
  {
    id: 'V33b-no-ao-lattice', kind: 'visual', lane: 'core-platform-gtao',
    title: 'GTAO on (high + ultra): no screen-locked lattice on the rim vista at four '
      + 'bearings, and contact AO still reads in a 2 m close-up',
    params: 'px=22&pz=-6&pitch=0.16',
    settle: 2600,
    timeout: 90000,
    setup: V33B_SETUP,
    criteria: 'A 4x4 contact sheet. Rows 1-2: the rim vista from the camp at bearings '
      + 'N/E/S/W with GTAO ON at tier high (row 1) and ultra (row 2). Row 3: 1:1 '
      + 'device-pixel crops of the north massif, GTAO on next to GTAO OFF, high then '
      + 'ultra. Row 4: a 2 m close-up of a camp hut where its wall meets the ground, on '
      + 'next to OFF, high then ultra. PASS: no screen-locked lattice, grid, plaid, dither or banding on the '
      + 'distant massif, the haze band or the sky edge in any tile — each "on" crop in '
      + 'row 3 is indistinguishable from its "OFF" neighbour — and in row 4 the "on" '
      + 'tiles show soft contact darkening along the wall foot and under the eaves '
      + 'that the "OFF" tiles lack, with no pattern on the ground. FAIL on any regular '
      + 'vertical bars / horizontal bands / checker on distant terrain, or if the '
      + 'close-up "on" and "OFF" tiles are identical (AO switched off rather than fixed).',
  },
  {
    id: 'A108-ao-periodicity', kind: 'action', lane: 'core-platform-gtao',
    title: 'No periodic luminance peak above 0.15 at lags 2-32 px on the far massif, '
      + 'the haze band or the mid-ground with GTAO on, at every GTAO tier and at DPR 1 '
      + 'and 2 (GTAO-off control must be peak-free on the same crops)',
    settle: 1500,
    timeout: 240000,
    assert: A108,
  },
  {
    id: 'A109-ao-distance-fade', kind: 'action', lane: 'core-platform-gtao',
    title: 'AO occlusion past 150 m is <= 10 % of its 5 m value (near AO still >= 0.05), '
      + 'and the far rim with GTAO on is within 3 % of GTAO off, at high and ultra',
    settle: 1500,
    timeout: 150000,
    assert: A109,
  },
];
