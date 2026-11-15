/**
 * M1.1b / M1.1e MEADOW AND GROUND PROBES — the page half (imported in the page by tools/perf/meadow.mjs), run on a
 * staged, frozen Frame Set frame.
 *
 *   setMsaa(E, n)               the main target's sample count at runtime (engine.applyTier with the tier's own row)
 *   grassCount(E, scene, C)     grass triangles: census of the main pass (submitted, instances x patch triangles) and
 *                               the meadow's own CPU mirror of its vertex keep rule (drawn)
 *   soil(E, C, opts)            soil-coloured pixels within 30 m of the lens inside the meadow: an ID render (ring 0-1
 *                               blades green, ground whose meadow density >= 0.5 within 30 m red, all else black) and the
 *                               graded frame with the same objects hidden; a red pixel (ground seen between blades) is
 *                               soil-coloured when its graded colour is outside the meadow's warm band
 *   walk(E, C, opts)            a deterministic walk from the staged lens along its bearing at `speed` m/s, `frames`
 *                               frames at 1/60 s, wind time advancing; per frame the meadow mask (ID render) and the
 *                               temporal second difference of luma |Y(t+1) - 2 Y(t) + Y(t-1)| over meadow pixels:
 *                               mean, and the share of meadow pixels over 40 / 255 (sparkle and crawl events). JPEG
 *                               frames are handed to `onFrame` when asked (the clip)
 *   topDown(E, C, x, z, opts)   an orthographic top-down render of the ground alone, `span` m across, as PNG data
 */
import * as T from 'three';

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = async (n) => { for (let i = 0; i < n; i++) await raf(); };

export async function setMsaa(E, n) {
  if (E.sceneTarget.samples === n) return n;
  E.applyTier({ ...E.tier, msaa: n }, E.quality);
  await wait(6);
  return E.sceneTarget.samples;
}

export function grassCount(E, scene, C) {
  const M = C.vegetation.meadow;
  const R = E.renderer, orig = R.renderBufferDirect, rows = {};
  R.renderBufferDirect = function (camera, sc, geometry, material, object, group) {
    if (sc !== null && camera === E.camera && object.parent === M.group) {
      const idx = geometry.index, count = idx ? idx.count : geometry.attributes.position.count;
      const r = rows[object.name] || (rows[object.name] = { draws: 0, tris: 0, instances: 0 });
      r.draws++; r.instances += object.count; r.tris += (count / 3) * object.count;
    }
    return orig.apply(this, arguments);
  };
  try { E.render(0); } finally { R.renderBufferDirect = orig; }
  const submitted = Object.values(rows).reduce((a, r) => a + r.tris, 0);
  const st = M.stats(E.camera);
  return { census: rows, submittedTris: Math.round(submitted), mirror: st };
}

/** Everything but the terrain, the meadow and the sky hidden; returns the undo. */
function isolate(C, { keepMeadow = true } = {}) {
  const keep = new Set();
  C.terrain.group.traverse((o) => keep.add(o));
  if (keepMeadow) C.vegetation.meadow.group.traverse((o) => keep.add(o));
  const hidden = [];
  C.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && !keep.has(o)) { o.visible = false; hidden.push(o); } });
  // the sea and the Glass are terrain children: they stay (they are ground the eye reads)
  return () => hidden.forEach((o) => { o.visible = true; });
}

function idMaterial(C) {
  const M = C.vegetation.meadow;
  return new T.ShaderMaterial({
    uniforms: { tD: { value: M._tD }, uWorldInv: { value: M._u.uWorldInv.value }, uR: { value: 30 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform sampler2D tD; uniform float uWorldInv; uniform float uR; varying vec3 vW;\n'
      + 'void main(){ float d = texture2D(tD, vW.xz * uWorldInv + 0.5).r; float dc = distance(vW.xz, cameraPosition.xz);\n'
      + ' gl_FragColor = vec4((d >= 0.5 && dc <= uR) ? 1.0 : 0.0, 0.0, clamp(distance(vW, cameraPosition) / 100.0, 0.0, 1.0), 1.0); }',
    side: T.DoubleSide,
  });
}

/** The ID render: returns Uint8 RGBA (bottom-up, drawing-buffer size). */
function idPass(E, C, rt, mat, buf) {
  const R = E.renderer, S = C.scene, M = C.vegetation.meadow;
  const swapped = [];
  C.terrain.group.traverse((o) => { if (o.isMesh && o.visible) { swapped.push([o, o.material]); o.material = mat; } });
  const prev = { bg: S.background, fog: S.fog, target: R.getRenderTarget(), tm: R.toneMapping };
  M.setIdPass(true);
  try {
    S.background = new T.Color(0); S.fog = null;
    R.setRenderTarget(rt); R.clear(true, true, true);
    R.render(S, E.camera);
    R.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buf);
  } finally {
    M.setIdPass(false);
    S.background = prev.bg; S.fog = prev.fog; R.setRenderTarget(prev.target);
    for (const [o, m] of swapped) o.material = m;
  }
  return buf;
}

function readCanvas(E, buf) {
  const gl = E.renderer.getContext();
  E.renderer.setRenderTarget(null);
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return buf;
}

/** The wider class (red-brown through gold): dark rose-brown under the grade's shadow tint is grass shade, not sand. */
function warmWide(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  if (v < 0.07) return true;
  if (s < 0.15) return false;
  let hgt = 0;
  if (mx === r) hgt = ((g - b) / (mx - mn)) * 60; else if (mx === g) hgt = (2 + (b - r) / (mx - mn)) * 60; else hgt = (4 + (r - g) / (mx - mn)) * 60;
  if (hgt < 0) hgt += 360;
  return hgt >= 340 || hgt <= 75;
}
function warm(r, g, b) {
  // the meadow's band in the graded frame: hue 8-75 deg with some chroma, or too dark to read as anything
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  if (v < 0.07) return true;
  if (s < 0.18) return false;
  let hgt = 0;
  if (mx === r) hgt = ((g - b) / (mx - mn)) * 60; else if (mx === g) hgt = (2 + (b - r) / (mx - mn)) * 60; else hgt = (4 + (r - g) / (mx - mn)) * 60;
  if (hgt < 0) hgt += 360;
  return hgt >= 8 && hgt <= 75;
}

export async function soil(E, C, { hideHero = true } = {}) {
  const gl = E.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const undo = isolate(C);
  const rt = new T.WebGLRenderTarget(w, h, { depthBuffer: true });
  const mat = idMaterial(C);
  const id = new Uint8Array(w * h * 4), col = new Uint8Array(w * h * 4);
  try {
    await wait(3);
    E.render(0); readCanvas(E, col);
    idPass(E, C, rt, mat, id);
  } finally { undo(); rt.dispose(); mat.dispose(); }
  let blade = 0, gap = 0, soilPx = 0, soilWide = 0;
  const soilAt = [];
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (id[o + 1] > 192) blade++;
    else if (id[o] > 128 && id[o + 1] < 64) {
      gap++;
      if (!warmWide(col[o], col[o + 1], col[o + 2])) soilWide++;
      if (!warm(col[o], col[o + 1], col[o + 2])) { soilPx++; if (soilAt.length < 12 && i % 7 === 0) soilAt.push([i % w, h - 1 - Math.floor(i / w), col[o], col[o + 1], col[o + 2]]); }
    }
  }
  const area = blade + gap;
  return { pixels: w * h, meadowPx: area, bladePx: blade, groundSeenPx: gap, soilColouredPx: soilPx,
    gapPct: area ? +(100 * gap / area).toFixed(3) : null, soilPct: area ? +(100 * soilPx / area).toFixed(3) : null, soilAt,
    soilPctWideClass: area ? +(100 * soilWide / area).toFixed(3) : null,
    method: 'ID render (blades of rings 0-1 green, ground with meadow density >= 0.5 within 30 m red) and the graded frame, Brea and props hidden; soil-coloured = a red pixel whose graded colour is outside hue 8-75 deg / saturation >= 0.18 and not darker than V 0.07' };
}

export async function walk(E, C, { speed = 1, frames = 60, fov = null, bearing = 300, save = false, onFrame = null, t0 = 100 } = {}) {
  const gl = E.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, N = w * h;
  const cam = E.camera, p = C.player, V = C.vegetation;
  const pos0 = cam.position.clone(), q0 = cam.quaternion.clone(), fov0 = cam.fov, pp0 = p.position.clone();
  const D2R = Math.PI / 180, fw = new T.Vector3(Math.sin(bearing * D2R), 0, -Math.cos(bearing * D2R));
  const ground = (x, z) => C.terrain.getHeight(x, z);
  const g0 = ground(pos0.x, pos0.z);
  const undo = isolate(C);
  const hero = p.model; const heroVis = hero?.visible; if (hero) hero.visible = false;
  const rt = new T.WebGLRenderTarget(w, h, { depthBuffer: true });
  const mat = idMaterial(C);
  const id = new Uint8Array(N * 4), col = new Uint8Array(N * 4);
  const Y = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  const mask = [new Uint8Array(N), new Uint8Array(N), new Uint8Array(N)];
  const ut0 = V._uTime.value;
  let sumE = 0, nPix = 0, events = 0, frameMs = [];
  const band = [{ n: 0, e: 0, ev: 0 }, { n: 0, e: 0, ev: 0 }, { n: 0, e: 0, ev: 0 }];   // < 12 m, 12-30 m, > 30 m
  const dist = [new Uint8Array(N), new Uint8Array(N), new Uint8Array(N)];
  const perFrame = [];
  if (fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  try {
    for (let k = 0; k < frames; k++) {
      const s = speed * k / 60;
      const x = pos0.x + fw.x * s, z = pos0.z + fw.z * s;
      cam.position.set(x, pos0.y + (ground(x, z) - g0), z); cam.quaternion.copy(q0); cam.updateMatrixWorld();
      p.position.set(pp0.x + fw.x * s, ground(pp0.x + fw.x * s, pp0.z + fw.z * s), pp0.z + fw.z * s);
      V._uTime.value = t0 + k / 60;
      V.interpolate(0, 1 / 60);
      cam.position.set(x, pos0.y + (ground(x, z) - g0), z); cam.quaternion.copy(q0); cam.updateMatrixWorld();
      const ta = performance.now();
      E.render(0);
      readCanvas(E, col);
      const url = save && onFrame ? E.renderer.domElement.toDataURL('image/jpeg', 0.86) : null;
      frameMs.push(performance.now() - ta);
      idPass(E, C, rt, mat, id);
      const yi = Y[k % 3], mi = mask[k % 3], di = dist[k % 3];
      for (let i = 0; i < N; i++) { const o = i * 4; yi[i] = 0.2126 * col[o] + 0.7152 * col[o + 1] + 0.0722 * col[o + 2]; mi[i] = (id[o] > 128 || id[o + 1] > 64) ? 1 : 0; di[i] = id[o + 2]; }
      if (k >= 2) {
        const a = Y[(k - 2) % 3], b = Y[(k - 1) % 3], c = yi, mb = mask[(k - 1) % 3], db = dist[(k - 1) % 3];
        let fe = 0, fn = 0, fv = 0;
        for (let i = 0; i < N; i++) {
          if (!mb[i]) continue;
          const e = Math.abs(c[i] - 2 * b[i] + a[i]);
          fe += e; fn++; if (e > 40) fv++;
          const m = db[i] * (100 / 255), B = band[m < 12 ? 0 : m < 30 ? 1 : 2];
          B.n++; B.e += e; if (e > 40) B.ev++;
        }
        sumE += fe; nPix += fn; events += fv;
        perFrame.push(fn ? +(1000 * fv / fn).toFixed(2) : 0);
      }
      if (url) await onFrame(k, url);
      if (k % 10 === 9) await raf();
    }
  } finally {
    undo(); if (hero) hero.visible = heroVis;
    cam.position.copy(pos0); cam.quaternion.copy(q0); cam.fov = fov0; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    p.position.copy(pp0); V._uTime.value = ut0; V.interpolate(0, 1 / 60);
    rt.dispose(); mat.dispose();
  }
  const sorted = perFrame.slice().sort((x, y) => x - y);
  return { speed, frames, fov: fov || fov0, meanAbsD2: nPix ? +(sumE / nPix).toFixed(3) : null,
    eventsPerMille: nPix ? +(1000 * events / nPix).toFixed(3) : null, worstFramePerMille: sorted[sorted.length - 1] ?? null,
    medianFramePerMille: sorted[sorted.length >> 1] ?? null,
    bands: Object.fromEntries(['near<12m', 'mid12-30m', 'far>30m'].map((k, i) => [k, { pixelFrames: band[i].n, meanAbsD2: band[i].n ? +(band[i].e / band[i].n).toFixed(3) : null, eventsPerMille: band[i].n ? +(1000 * band[i].ev / band[i].n).toFixed(3) : null }])),
    renderMsMedian: +frameMs.sort((x, y) => x - y)[frameMs.length >> 1].toFixed(2),
    method: 'deterministic walk at 1/60 s steps along the bearing; per meadow pixel (ID render) |Y(t+1) - 2Y(t) + Y(t-1)| on graded 8-bit luma; events = over 40/255, per mille of meadow pixel-frames' };
}

/** Orthographic top-down render of the ground (terrain group only) `span` m across at (x, z), RGBA bottom-up. */
export async function topDown(E, C, x, z, { span = 40, px = 1024 } = {}) {
  const R = E.renderer, S = C.scene, cam0 = E.camera;
  const y = C.terrain.getHeight(x, z);
  // the lens 2.5 m over the highest ground in the square: the ground's distance fades read a walker's 1-28 m, not 150 m
  let top = y;
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) top = Math.max(top, C.terrain.getHeight(x + i * span / 8, z + j * span / 8));
  const oc = new T.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, 0.05, 80);
  oc.position.set(x, top + 2.5, z); oc.up.set(0, 0, -1); oc.lookAt(x, top - 10, z); oc.updateMatrixWorld();
  // the main lens stands at the site too, so terrain LOD, the far field and the cascades are the near ones
  const p0 = cam0.position.clone(), q0 = cam0.quaternion.clone();
  cam0.position.set(x, y + 1.7, z); cam0.lookAt(x, y, z - 10); cam0.updateMatrixWorld();
  C.terrain.updateLod?.(cam0);
  const undo = isolate(C, { keepMeadow: false });
  const water = C.terrain.water;
  /* fix round 1: the capture was 8-bit LINEAR (a render target gets no output transform), so black sand at
   * 0.02-0.05 linear sat in 5-13 codes and the salt clipped: dark, banded, blurred-looking. It is read as float
   * now, and each capture is mapped to sRGB with its own exposure (99th percentile luma = 0.9), so the tiling
   * check sees the texture's structure at any albedo. */
  const rt = new T.WebGLRenderTarget(px, px, { depthBuffer: true, type: T.FloatType });
  const fbuf = new Float32Array(px * px * 4);
  const buf = new Uint8Array(px * px * 4);
  try {
    await wait(2);
    E.render(0);   // the cascades and every per-frame uniform for this lens
    const prev = R.getRenderTarget();
    R.setRenderTarget(rt); R.clear(true, true, true);
    R.render(S, oc);
    R.readRenderTargetPixels(rt, 0, 0, px, px, fbuf);
    R.setRenderTarget(prev);
    const lum = new Float32Array(px * px);
    for (let i = 0; i < px * px; i++) lum[i] = 0.2126 * fbuf[i * 4] + 0.7152 * fbuf[i * 4 + 1] + 0.0722 * fbuf[i * 4 + 2];
    const srt = Float32Array.from(lum).sort();
    const p99 = Math.max(srt[Math.floor(srt.length * 0.99)], 1e-6), k = 0.9 / p99;
    const enc = (v) => { v = Math.max(0, v * k); v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.min(255, Math.round(v * 255)); };
    for (let i = 0; i < px * px; i++) { buf[i * 4] = enc(fbuf[i * 4]); buf[i * 4 + 1] = enc(fbuf[i * 4 + 1]); buf[i * 4 + 2] = enc(fbuf[i * 4 + 2]); buf[i * 4 + 3] = 255; }
  } finally {
    undo(); rt.dispose();
    cam0.position.copy(p0); cam0.quaternion.copy(q0); cam0.updateMatrixWorld(); C.terrain.updateLod?.(cam0);
  }
  return { x, z, span, px, rgba: buf, water: !!water };
}
