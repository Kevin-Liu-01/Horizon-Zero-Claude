/**
 * M1.1c / M1.1d ROCK AND RING PROBES — the page half (imported in the page by tools/perf/rock.mjs), run on a
 * staged, frozen Frame Set frame. Every rule below was fixed before it was first measured.
 *
 *   layers(E, C)          F05's silhouette layers. The frame (Brea hidden) and its view distance per pixel (the
 *                         scene target's depth, linearised). Walking down each pixel column, a SILHOUETTE EDGE is a
 *                         step where the distance falls by more than 1.5x from one row to the next; the nearer side
 *                         belongs to a distance class (< 60 m, 60-250, 250-600, 600-1200, 1200-4000, beyond), and
 *                         its rim luminance is the CIE L* of the graded pixels 2-6 rows below the edge. A class is a
 *                         LAYER when its edges stand in >= 3 % of the frame's columns. Neighbouring layers (by
 *                         distance) must differ by >= 6 in L* (L* is lightness in per cent). The sky's L* above the
 *                         farthest layer is reported, not counted.
 *   strata(E, C, stack)   one needle stack from 200 m (camera 200 m from its axis toward the island's centre, 0.45 of
 *                         its height up, FOV 46, aimed at mid-height): an ID render of the stack's mesh (other meshes
 *                         hidden) marks its pixels; per row above the waterline, the mean L* of the graded frame over
 *                         the middle half of the stack's width. Smoothed over 3 rows; a BAND EDGE is a row where the
 *                         mean of the 3 rows above and the 3 below differ by >= 3 L*, edges at least 4 rows apart;
 *                         bands = edges + 1. A crop is returned for the eye.
 *   ringPanels(E, C, d)   the Ring from `d` m on its face normal (eye 1.7 m over the ground there): the graded L* along
 *                         the outer ring's mid-radius on its face, 720 samples round the ring, each kept when the
 *                         depth there is within 3 m of the sample's own distance (not hidden); a PANEL is a run of
 *                         >= 2 kept samples brighter than the midpoint of the profile's 10th and 90th percentiles,
 *                         runs separated by at least one darker sample. A crop is returned.
 *   sight(E, C, from)     line of sight from a station (eye 1.7 m over the ground) to 10 points on the Ring (its
 *                         centre, its top, 8 round the outer ring): a ray is open when the ground stays under it
 *                         (sampled every 1 m, 0.3 m clearance) and no prop or settlement mesh crosses it (three's
 *                         raycaster; the Ring itself, plants and water excluded). The Ring is IN SIGHT when >= 5 of
 *                         the 10 rays are open.
 */
import * as T from 'three';

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = async (n) => { for (let i = 0; i < n; i++) await raf(); };
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const LUT = new Float32Array(256).map((_, i) => lin(i));
const Lstar = (r, g, b) => { const Y = 0.2126 * LUT[r] + 0.7152 * LUT[g] + 0.0722 * LUT[b]; return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };
const r1 = (v) => Math.round(v * 10) / 10;

function readCanvas(E, buf) {
  const gl = E.renderer.getContext();
  E.renderer.setRenderTarget(null);
  gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return buf;
}
function size(E) { const gl = E.renderer.getContext(); return [gl.drawingBufferWidth, gl.drawingBufferHeight]; }

let _dq = null;
/** View distance (m) per pixel of the scene target's depth, bottom-up, the size of the drawing buffer. */
function distances(E) {
  const [w, h] = size(E);
  const dt = E.depthTexture;
  const rt = new T.WebGLRenderTarget(w, h, { type: T.FloatType, depthBuffer: false });
  if (!_dq) {
    _dq = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({
      uniforms: { tD: { value: null }, uInv: { value: new T.Matrix4() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tD; uniform mat4 uInv; varying vec2 vUv;\n'
        + 'void main(){ float d = texture2D(tD, vUv).x; if (d >= 0.99999) { gl_FragColor = vec4(1e9); return; }\n'
        + ' vec4 v = uInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w; gl_FragColor = vec4(length(v.xyz), 0.0, 0.0, 1.0); }',
      depthTest: false, depthWrite: false,
    }));
    _dq.frustumCulled = false;
  }
  _dq.material.uniforms.tD.value = dt;
  _dq.material.uniforms.uInv.value.copy(E.camera.projectionMatrixInverse);
  const R = E.renderer, prev = R.getRenderTarget(), ac = R.autoClear;
  const cam = new T.OrthographicCamera();
  R.setRenderTarget(rt); R.autoClear = true; R.render(_dq, cam);
  const out = new Float32Array(w * h * 4);
  R.readRenderTargetPixels(rt, 0, 0, w, h, out);
  R.setRenderTarget(prev); R.autoClear = ac;
  rt.dispose();
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = out[i * 4];
  return d;
}

function hideHero(C) { const m = C.player?.model; const v = m?.visible; if (m) m.visible = false; return () => { if (m) m.visible = v; }; }

const CLASSES = [[0, 60], [60, 250], [250, 600], [600, 1200], [1200, 4000], [4000, Infinity]];
const classOf = (d) => { for (let i = 0; i < CLASSES.length; i++) if (d < CLASSES[i][1]) return i; return CLASSES.length - 1; };

export async function layers(E, C) {
  const undo = hideHero(C);
  const [w, h] = size(E);
  const col = new Uint8Array(w * h * 4);
  let dist;
  try { await wait(2); E.render(0); readCanvas(E, col); dist = distances(E); } finally { undo(); }
  const edges = CLASSES.map(() => ({ cols: new Set(), L: [] }));
  let skyL = [];
  const map = new Uint8Array(w * h);     // class per pixel (for the eye), 255 = sky
  for (let i = 0; i < w * h; i++) map[i] = dist[i] >= 1e8 ? 255 : classOf(dist[i]);
  for (let x = 0; x < w; x++) {
    for (let yy = h - 2; yy >= 0; yy--) {           // bottom-up buffer: row h-1 is the top of the frame
      const a = dist[(yy + 1) * w + x], b = dist[yy * w + x];
      if (!(a > b * 1.5)) continue;
      const k = classOf(b);
      let s = 0, n = 0;
      for (let j = 2; j <= 6 && yy - j >= 0; j++) { const o = ((yy - j) * w + x) * 4; s += Lstar(col[o], col[o + 1], col[o + 2]); n++; }
      if (!n) continue;
      edges[k].cols.add(x); edges[k].L.push(s / n);
      if (a >= 1e8 && yy + 4 < h) { const o = ((yy + 4) * w + x) * 4; skyL.push(Lstar(col[o], col[o + 1], col[o + 2])); }
    }
  }
  const med = (a) => { if (!a.length) return null; const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
  const rows = CLASSES.map(([lo, hi], i) => ({ class: `${lo}-${hi === Infinity ? 'inf' : hi} m`, columnsPct: r1(100 * edges[i].cols.size / w), rimL: edges[i].L.length ? r1(med(edges[i].L)) : null, edges: edges[i].L.length }));
  const layersOn = rows.filter((r) => r.columnsPct >= 3);
  const gaps = [];
  for (let i = 1; i < layersOn.length; i++) gaps.push({ between: `${layersOn[i - 1].class} / ${layersOn[i].class}`, dL: r1(Math.abs(layersOn[i].rimL - layersOn[i - 1].rimL)) });
  const passCount = layersOn.length >= 4 && layersOn.length <= 6;
  const passSep = gaps.every((g) => g.dL >= 6);
  // a quarter-size false-colour class map, top-down, RGB
  const qw = w >> 2, qh = h >> 2, pal = [[230, 60, 40], [240, 170, 40], [60, 200, 90], [40, 140, 230], [150, 80, 220], [200, 200, 200]];
  const q = new Uint8Array(qw * qh * 3);
  for (let y = 0; y < qh; y++) for (let x = 0; x < qw; x++) {
    const c = map[(h - 1 - y * 4) * w + x * 4], o = (y * qw + x) * 3;
    const p = c === 255 ? [20, 20, 30] : pal[c];
    q[o] = p[0]; q[o + 1] = p[1]; q[o + 2] = p[2];
  }
  let bin = ''; for (let i = 0; i < q.length; i += 32768) bin += String.fromCharCode.apply(null, q.subarray(i, i + 32768));
  return { classes: rows, layers: layersOn.length, gaps, skyRimL: skyL.length ? r1(med(skyL)) : null, pass: passCount && passSep, passCount, passSep, map: { w: qw, h: qh, b64: btoa(bin) } };
}

/** Render with only `keep` visible, flat white, into a byte RT; bottom-up RGBA. */
function idRender(E, C, keep) {
  const [w, h] = size(E);
  const R = E.renderer, S = C.scene;
  const rt = new T.WebGLRenderTarget(w, h, { depthBuffer: true });
  const hidden = [];
  const keepSet = new Set(); keep.traverse((o) => keepSet.add(o));
  S.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && !keepSet.has(o)) { o.visible = false; hidden.push(o); } });
  const prev = { bg: S.background, fog: S.fog, ov: S.overrideMaterial, t: R.getRenderTarget() };
  const white = new T.MeshBasicMaterial({ color: 0xffffff });
  const buf = new Uint8Array(w * h * 4);
  try {
    S.background = new T.Color(0); S.fog = null; S.overrideMaterial = white;
    R.setRenderTarget(rt); R.clear(true, true, true); R.render(S, E.camera);
    R.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  } finally {
    S.background = prev.bg; S.fog = prev.fog; S.overrideMaterial = prev.ov; R.setRenderTarget(prev.t);
    hidden.forEach((o) => { o.visible = true; }); rt.dispose(); white.dispose();
  }
  return buf;
}

function crop(col, w, h, x0, y0, x1, y1) {
  // bottom-up RGBA -> top-down RGB crop, as base64
  x0 = Math.max(0, x0 | 0); x1 = Math.min(w - 1, x1 | 0); y0 = Math.max(0, y0 | 0); y1 = Math.min(h - 1, y1 | 0);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, q = new Uint8Array(cw * ch * 3);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const o = ((y1 - y) * w + (x0 + x)) * 4, p = (y * cw + x) * 3;
    q[p] = col[o]; q[p + 1] = col[o + 1]; q[p + 2] = col[o + 2];
  }
  let bin = ''; for (let i = 0; i < q.length; i += 32768) bin += String.fromCharCode.apply(null, q.subarray(i, i + 32768));
  return { w: cw, h: ch, b64: btoa(bin) };
}

function placeCamera(E, pos, target, fov = 46) {
  const cam = E.camera;
  const saved = { p: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
  cam.position.copy(pos); cam.lookAt(target); cam.fov = fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  return () => { cam.position.copy(saved.p); cam.quaternion.copy(saved.q); cam.fov = saved.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); };
}

/** Freeze the chase camera's own update while the probe owns the lens (best effort). */
function holdCamera(C) {
  const cc = C.cameraController || C.camera3p || null;
  const was = cc?.enabled; if (cc && 'enabled' in cc) cc.enabled = false;
  return () => { if (cc && 'enabled' in cc) cc.enabled = was; };
}

export async function strata(E, C, rec) {
  const [w, h] = size(E);
  const L = C.props?.landmarks;
  const im = rec.object;
  const centre = new T.Vector3(rec.x, rec.height * 0.5, rec.z);
  const dir = new T.Vector3(-rec.x, 0, -rec.z).normalize();          // toward the island's centre
  const pos = centre.clone().addScaledVector(dir, 200); pos.y = rec.height * 0.45;
  const undoHero = hideHero(C), release = holdCamera(C);
  const restore = placeCamera(E, pos, centre, 46);
  const col = new Uint8Array(w * h * 4);
  // the other props are hidden for this view (from some 200 m stations the Ring stands in front of a stack)
  const hid = [];
  C.props.group.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine) && o.visible && o !== im) { o.visible = false; hid.push(o); } });
  let id;
  try {
    E.render(0); E.render(0); readCanvas(E, col);
    id = idRender(E, C, im);
  } finally { hid.forEach((o) => { o.visible = true; }); restore(); release(); undoHero(); }
  void L;
  // the stack's own screen box (its instance alone): project its axis
  const cam = new T.PerspectiveCamera(46, w / h, 0.5, 5000); cam.position.copy(pos); cam.lookAt(centre); cam.updateMatrixWorld();
  const pr = (x, y, z) => { const v = new T.Vector3(x, y, z).project(cam); return [(v.x * 0.5 + 0.5) * w, (v.y * 0.5 + 0.5) * h]; };
  const [, yWater] = pr(rec.x, 1.5, rec.z), [, yTop] = pr(rec.x, rec.height + 3, rec.z), [xc] = pr(rec.x, rec.height * 0.5, rec.z);
  const halfW = (rec.foot || 9) * 2.2 / 200 * (h / 2) / Math.tan(23 * Math.PI / 180);
  const x0 = Math.max(0, Math.floor(xc - halfW)), x1 = Math.min(w - 1, Math.ceil(xc + halfW));
  const prof = [];
  for (let y = Math.max(0, Math.ceil(yWater)); y <= Math.min(h - 1, Math.floor(yTop)); y++) {
    let a = -1, b = -1;
    for (let x = x0; x <= x1; x++) if (id[(y * w + x) * 4] > 128) { if (a < 0) a = x; b = x; }
    if (a < 0 || b - a < 4) continue;
    const q0 = a + ((b - a) >> 2), q1 = b - ((b - a) >> 2);
    let s = 0, n = 0;
    for (let x = q0; x <= q1; x++) { const o = (y * w + x) * 4; s += Lstar(col[o], col[o + 1], col[o + 2]); n++; }
    prof.push({ y, L: s / n });
  }
  const S = prof.map((p, i) => { let a = 0, n = 0; for (let j = i - 1; j <= i + 1; j++) if (j >= 0 && j < prof.length) { a += prof[j].L; n++; } return a / n; });
  let edges = 0, last = -1e9;
  for (let i = 3; i + 3 < S.length; i++) {
    const a = (S[i - 1] + S[i - 2] + S[i - 3]) / 3, b = (S[i + 1] + S[i + 2] + S[i + 3]) / 3;
    if (Math.abs(a - b) >= 3 && i - last >= 4) { edges++; last = i; }
  }
  const pad = 20;
  return { id: rec.id, bands: prof.length ? edges + 1 : 0, rowsPx: prof.length, meanL: prof.length ? r1(S.reduce((a, b) => a + b, 0) / S.length) : null,
    Lrange: prof.length ? [r1(Math.min(...S)), r1(Math.max(...S))] : null,
    crop: crop(col, w, h, x0 - pad, Math.max(0, yWater - 30), x1 + pad, yTop + pad) };
}

export async function ringPanels(E, C, dist = 150) {
  const [w, h] = size(E);
  const L = C.props?.landmarkSet?.ring;
  if (!L) return { error: 'ring not loaded' };
  const g = L.group, info = L.info || {};
  g.updateMatrixWorld(true);
  const centre = new T.Vector3(0, info.centreY ?? 16, 0).applyMatrix4(g.matrixWorld);
  const n = new T.Vector3(0, 0, 1).transformDirection(g.matrixWorld); n.y = 0; n.normalize();
  const pos = centre.clone().addScaledVector(n, dist);
  pos.y = C.terrain.getHeight(pos.x, pos.z) + 1.7;
  const undoHero = hideHero(C), release = holdCamera(C);
  const restore = placeCamera(E, pos, centre, 46);
  const col = new Uint8Array(w * h * 4);
  let dd;
  const tilt = (info.tiltDeg ?? 20) * Math.PI / 180;
  const outerM = new T.Matrix4().makeTranslation(0, info.centreY ?? 16, 0).multiply(new T.Matrix4().makeRotationX(Math.PI / 2 - tilt));
  const M = g.matrixWorld.clone().multiply(outerM);
  const Rm = info.outerMid ?? 16, d = (info.outerD ?? 1.6) / 2 + 0.05;
  const samples = [];
  let box = [w, h, 0, 0];
  try {
    E.render(0); E.render(0); readCanvas(E, col); dd = distances(E);
    const cam = E.camera;
    for (let i = 0; i < 720; i++) {
      const phi = (i / 720) * Math.PI * 2;
      const p = new T.Vector3(Math.sin(phi) * Rm, d, Math.cos(phi) * Rm).applyMatrix4(M);
      const v = p.clone().project(cam);
      const x = Math.round((v.x * 0.5 + 0.5) * w), y = Math.round((v.y * 0.5 + 0.5) * h);
      if (x < 0 || y < 0 || x >= w || y >= h) { samples.push(null); continue; }
      box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
      const k = y * w + x, o = k * 4;
      const seen = Math.abs(dd[k] - p.distanceTo(cam.position)) < 3;
      samples.push(seen ? Lstar(col[o], col[o + 1], col[o + 2]) : null);
    }
  } finally { restore(); release(); undoHero(); }
  const kept = samples.filter((s) => s != null);
  if (!kept.length) return { error: 'no ring samples visible', pos: pos.toArray() };
  const srt = kept.slice().sort((a, b) => a - b);
  const p10 = srt[Math.floor(srt.length * 0.1)], p90 = srt[Math.floor(srt.length * 0.9)], mid = (p10 + p90) / 2;
  let panels = 0, run = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s != null && s > mid) run++;
    else { if (run >= 2) panels++; run = 0; }
  }
  if (run >= 2) panels++;
  const pad = 40;
  return { dist, panels, keptSamples: kept.length, p10: r1(p10), p90: r1(p90), camera: pos.toArray().map(r1),
    crop: crop(col, w, h, box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad) };
}

export function sight(E, C, from, label) {
  const L = C.props?.landmarkSet?.ring;
  if (!L) return { error: 'ring not loaded' };
  const g = L.group, info = L.info || {};
  g.updateMatrixWorld(true);
  const tilt = (info.tiltDeg ?? 20) * Math.PI / 180;
  const outerM = new T.Matrix4().makeTranslation(0, info.centreY ?? 16, 0).multiply(new T.Matrix4().makeRotationX(Math.PI / 2 - tilt));
  const M = g.matrixWorld.clone().multiply(outerM);
  const Rm = info.outerMid ?? 16;
  const pts = [new T.Vector3(0, 0, 0).applyMatrix4(M)];
  for (let i = 0; i < 9; i++) { const phi = (i / 9) * Math.PI * 2; pts.push(new T.Vector3(Math.sin(phi) * Rm, 0, Math.cos(phi) * Rm).applyMatrix4(M)); }
  const eye = new T.Vector3(from.x, C.terrain.getHeight(from.x, from.z) + (from.eye ?? 1.7), from.z);
  // occluders: props and settlements, not the Ring, not plants, not water
  const ringSet = new Set(); g.traverse((o) => ringSet.add(o));
  const occ = [];
  for (const root of [C.props?.group, C.settlements?.group].filter(Boolean)) root.traverse((o) => { if (o.isMesh && o.visible && !ringSet.has(o) && !/fallen/.test(o.name)) occ.push(o); });
  const rc = new T.Raycaster();
  let open = 0;
  const rays = pts.map((p) => {
    const d = p.distanceTo(eye);
    let ground = true;
    for (let s = 1; s < d - 1; s += 1) {
      const q = eye.clone().lerp(p, s / d);
      if (C.terrain.getHeight(q.x, q.z) > q.y - 0.3) { ground = false; break; }
    }
    rc.set(eye, p.clone().sub(eye).normalize()); rc.far = d - 1;
    const hit = rc.intersectObjects(occ, false)[0];
    const ok = ground && !hit;
    if (ok) open++;
    return { ok, ground, hit: hit ? hit.object.name : null };
  });
  return { station: label, eye: eye.toArray().map(r1), distM: r1(eye.distanceTo(pts[0])), open, of: pts.length, inSight: open >= 5, blockers: [...new Set(rays.filter((r) => !r.ok).map((r) => r.hit || (r.ground ? '?' : 'ground')))] };
}

/** A free look from a station at a target (for the eye only). */
export async function look(E, C, pos, target, fov = 46) {
  const [w, h] = size(E);
  const undoHero = hideHero(C), release = holdCamera(C);
  const restore = placeCamera(E, new T.Vector3(...pos), new T.Vector3(...target), fov);
  const col = new Uint8Array(w * h * 4);
  try { E.render(0); E.render(0); readCanvas(E, col); } finally { restore(); release(); undoHero(); }
  return crop(col, w, h, 0, 0, w - 1, h - 1);
}
