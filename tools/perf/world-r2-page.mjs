/**
 * M1a ROUND 2, WORLD — the page half of tools/perf/world-r2.mjs (imported in the page on a staged, frozen frame).
 *
 *   groundHue(E, C, opts)   the ground and its stone as the eye reads them: an ID render (terrain chunks, the
 *                           vegetation group's static kinds and flora red, the meadow green, all else hidden) against
 *                           the graded frame with the same objects shown; of the red pixels, the share that reads
 *                           BLUE (hue 185-265 deg, saturation >= 0.2, value >= 0.06) and the mean hue of the dark ones
 *                           (value < 0.35). Returns a PNG-ready RGBA mask of the blue pixels when asked.
 */
import * as T from 'three';

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = async (n) => { for (let i = 0; i < n; i++) await raf(); };

function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  let h = 0;
  if (mx !== mn) {
    if (mx === r) h = ((g - b) / (mx - mn)) * 60; else if (mx === g) h = (2 + (b - r) / (mx - mn)) * 60; else h = (4 + (r - g) / (mx - mn)) * 60;
    if (h < 0) h += 360;
  }
  return [h, s, v];
}

function readCanvas(E, buf) {
  const gl = E.renderer.getContext();
  E.renderer.setRenderTarget(null);
  gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return buf;
}

export async function groundHue(E, C, { mask = false } = {}) {
  const gl = E.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, N = w * h;
  const keep = new Set(), ground = new Set();
  C.terrain.group.traverse((o) => { keep.add(o); if (o.isMesh && o !== C.terrain.isles) ground.add(o); });
  const V = C.vegetation, M = V.meadow;
  V.group.traverse((o) => { keep.add(o); if (o.isMesh && !(M && o.parent === M.group)) ground.add(o); });
  if (M) M.group.traverse((o) => keep.add(o));
  const hidden = [];
  C.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && !keep.has(o)) { o.visible = false; hidden.push(o); } });
  const col = new Uint8Array(N * 4), id = new Uint8Array(N * 4);
  const red = new T.MeshBasicMaterial({ color: 0xff0000 });
  const rt = new T.WebGLRenderTarget(w, h, { depthBuffer: true });
  const R = E.renderer, S = C.scene;
  try {
    await wait(3);
    E.render(0); readCanvas(E, col);
    const swapped = [];
    for (const o of ground) { if (o.visible) { swapped.push([o, o.material]); o.material = red; } }
    const prev = { bg: S.background, fog: S.fog, target: R.getRenderTarget() };
    M?.setIdPass(true);
    try {
      S.background = new T.Color(0); S.fog = null;
      R.setRenderTarget(rt); R.clear(true, true, true);
      R.render(S, E.camera);
      R.readRenderTargetPixels(rt, 0, 0, w, h, id);
    } finally {
      M?.setIdPass(false);
      S.background = prev.bg; S.fog = prev.fog; R.setRenderTarget(prev.target);
      for (const [o, m] of swapped) o.material = m;
    }
  } finally { hidden.forEach((o) => { o.visible = true; }); red.dispose(); rt.dispose(); }
  let n = 0, blue = 0, dark = 0, dx = 0, dy = 0;
  const out = mask ? new Uint8Array(N * 4) : null;
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    const isG = id[o] > 128 && id[o + 1] < 64;
    if (out) { out[o] = col[o] >> 2; out[o + 1] = col[o + 1] >> 2; out[o + 2] = col[o + 2] >> 2; out[o + 3] = 255; }
    if (!isG) continue;
    n++;
    const [hh, ss, vv] = hsv(col[o], col[o + 1], col[o + 2]);
    if (hh >= 185 && hh <= 265 && ss >= 0.2 && vv >= 0.06) { blue++; if (out) { out[o] = 40; out[o + 1] = 120; out[o + 2] = 255; } }
    else if (out) { out[o] = col[o]; out[o + 1] = col[o + 1]; out[o + 2] = col[o + 2]; }
    if (vv < 0.35 && ss > 0.05) { dark++; dx += Math.cos(hh * Math.PI / 180) * ss; dy += Math.sin(hh * Math.PI / 180) * ss; }
  }
  const dh = dark ? (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360 : null;
  return { groundPx: n, bluePx: blue, bluePct: n ? +(100 * blue / n).toFixed(3) : null, darkPx: dark, darkMeanHue: dh == null ? null : +dh.toFixed(1),
    w, h, mask: out,
    method: 'ID render (terrain, the vegetation group\'s static kinds and flora red; meadow green; all else hidden) against the graded frame with the same objects; blue = hue 185-265, S >= 0.2, V >= 0.06; dark mean hue = chroma-weighted circular mean over V < 0.35, S > 0.05' };
}


/**
 * M1a debt (M1.1j "no LOD seam wider than 2 px"): the crack pixels of one render (tools/perf/census-page.mjs seams' rule:
 * land and water white over magenta; a gap pixel with land within 3 px on both sides, vertically or horizontally) as a
 * list of pixel indices with their widths, so the caller can tell the chunk LOD's own cracks (in the shipped render and
 * not in the one-level render) from gaps the geometry has at any LOD (a notch of sky between two silhouettes).
 */
export function crackList(E, scene, keep) {
  const R = E.renderer, cam = E.camera;
  const size = R.getDrawingBufferSize(new T.Vector2());
  const w = size.x, h = size.y;
  const rt = new T.WebGLRenderTarget(w, h, { depthBuffer: true });
  const hidden = [];
  scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && !keep(o)) { o.visible = false; hidden.push(o); } });
  const prev = { bg: scene.background, ov: scene.overrideMaterial, fog: scene.fog, target: R.getRenderTarget(), auto: R.autoClear, sm: R.shadowMap.autoUpdate };
  const white = new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide });
  const buf = new Uint8Array(w * h * 4);
  try {
    scene.background = new T.Color(0xff00ff); scene.overrideMaterial = white; scene.fog = null;
    R.shadowMap.autoUpdate = false;
    R.setRenderTarget(rt); R.autoClear = true;
    R.render(scene, cam);
    R.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  } finally {
    scene.background = prev.bg; scene.overrideMaterial = prev.ov; scene.fog = prev.fog;
    R.setRenderTarget(prev.target); R.autoClear = prev.auto; R.shadowMap.autoUpdate = prev.sm;
    hidden.forEach((o) => { o.visible = true; });
    rt.dispose(); white.dispose();
  }
  const solid = (x, y) => buf[(y * w + x) * 4 + 1] > 128;
  const K = 3, cracks = [];
  let landPx = 0;
  for (let y = K; y < h - K; y++) {
    for (let x = K; x < w - K; x++) {
      if (solid(x, y)) { landPx++; continue; }
      let up = 0, dn = 0, lf = 0, rg = 0;
      for (let k = 1; k <= K; k++) {
        if (!up && solid(x, y + k)) up = k; if (!dn && solid(x, y - k)) dn = k;
        if (!lf && solid(x - k, y)) lf = k; if (!rg && solid(x + k, y)) rg = k;
      }
      const v = up && dn ? up + dn - 1 : 0, hz = lf && rg ? lf + rg - 1 : 0;
      if (v || hz) cracks.push([y * w + x, Math.min(v || 99, hz || 99)]);
    }
  }
  return { w, h, landPx, cracks };
}
