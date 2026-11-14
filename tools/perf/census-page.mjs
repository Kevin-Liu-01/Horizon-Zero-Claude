/**
 * M1.1a GEOMETRY CENSUS — the page half (imported in the page by tools/perf/census.mjs). Run on a staged, frozen
 * Frame Set frame.
 *
 *   census(E, scene)        one rendered frame, every draw recorded at renderer.renderBufferDirect: which pass
 *                           (main camera, shadow cascade i, other), which object, how many triangles and vertex
 *                           invocations (index or vertex count of the draw range, times instances). Exact: it is
 *                           what was submitted, after three's frustum culling.
 *   samplers(E, material)   active sampler units of the material's linked program (arrays count per element).
 *   groupSkip(E, groups)    GPU ms of each named group of objects by paired skip-one (hidden in the main view and
 *                           the shadow pass alike), with tools/perf/attrib-page.mjs finishFrame.
 *   toggles(E, list)        GPU ms of runtime switches (A/B in one clock state): list of { id, on(), off() }.
 *   seams(E, scene, keep)   LOD-seam probe: only the objects `keep` accepts, drawn white unlit over a magenta clear;
 *                           a magenta pixel with white within 3 px on both sides (vertically or horizontally) is a
 *                           crack. Returns the count and the widest run.
 */
import * as T from 'three';
import { finishFrame } from '/tools/perf/attrib-page.mjs';

const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = async (n) => { for (let i = 0; i < n; i++) await raf(); };
const median = (a) => { const s = a.filter((v) => Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000);

/** The first named ancestor (or the object's type) as the census key. */
export function keyOf(o) {
  let p = o;
  while (p && !p.name) p = p.parent;
  const own = p ? p.name : o.type;
  // group by the top two named levels, so 'player > body' and 'terrain > chunk-3-4' read as owners
  let top = null, q = p ? p.parent : null;
  while (q) { if (q.name && q.parent && q.parent.isScene) top = q.name; q = q.parent; }
  return top && top !== own ? `${top} > ${own.replace(/-\d+(-\d+)*$/, '-*')}` : own.replace(/-\d+(-\d+)*$/, '-*');
}

export function census(E, scene) {
  const R = E.renderer;
  const maps = new Map();
  (E.csm?.lights || []).forEach((l, i) => { if (l.shadow?.map) maps.set(l.shadow.map, i); });
  const rows = new Map();
  const totals = {};
  const orig = R.renderBufferDirect;
  R.renderBufferDirect = function (camera, sc, geometry, material, object, group) {
    let pass;
    if (sc === null) {
      const i = maps.get(R.getRenderTarget());
      pass = i === undefined ? 'shadow:?' : `shadow:${i}`;
    } else pass = camera === E.camera ? 'main' : `other:${camera.type}`;
    const idx = geometry.index;
    let count = idx ? idx.count : (geometry.attributes.position?.count || 0);
    const dr = geometry.drawRange;
    count = Math.max(0, Math.min(count - dr.start, dr.count));
    if (group) count = Math.min(count, group.count);
    const inst = object.isInstancedMesh ? object.count : (geometry.isInstancedBufferGeometry ? geometry.instanceCount : 1);
    const isTri = object.isMesh && !material.wireframe;
    const tris = isTri ? (count / 3) * inst : 0;
    const verts = count * inst;
    const k = `${pass} | ${keyOf(object)}`;
    const r = rows.get(k) || { pass, key: keyOf(object), draws: 0, tris: 0, verts: 0, indexed: !!idx, instances: 0 };
    r.draws++; r.tris += tris; r.verts += verts; r.instances += inst;
    rows.set(k, r);
    const t = totals[pass] || (totals[pass] = { draws: 0, tris: 0, verts: 0 });
    t.draws++; t.tris += tris; t.verts += verts;
    return orig.apply(this, arguments);
  };
  const sm = R.shadowMap, smAuto = sm.autoUpdate;
  try {
    sm.needsUpdate = true;
    E.render(0);
  } finally {
    R.renderBufferDirect = orig;
    sm.autoUpdate = smAuto;
  }
  const list = [...rows.values()].map((r) => ({ ...r, tris: Math.round(r.tris), verts: Math.round(r.verts) }))
    .sort((a, b) => b.tris - a.tris);
  for (const t of Object.values(totals)) { t.tris = Math.round(t.tris); t.verts = Math.round(t.verts); }
  const all = Object.values(totals).reduce((a, t) => ({ draws: a.draws + t.draws, tris: a.tris + t.tris, verts: a.verts + t.verts }), { draws: 0, tris: 0, verts: 0 });
  return { totals, all, rows: list.slice(0, 80), info: { calls: R.info.render.calls, triangles: R.info.render.triangles } };
}

const SAMPLER_TYPES = (gl) => new Set([gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_2D_ARRAY,
  gl.SAMPLER_2D_ARRAY_SHADOW, gl.SAMPLER_CUBE_SHADOW, gl.INT_SAMPLER_2D, gl.INT_SAMPLER_3D, gl.INT_SAMPLER_CUBE, gl.INT_SAMPLER_2D_ARRAY,
  gl.UNSIGNED_INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_3D, gl.UNSIGNED_INT_SAMPLER_CUBE, gl.UNSIGNED_INT_SAMPLER_2D_ARRAY]);

/** Active sampler units of a material's linked program (after it has drawn once). */
export function samplers(E, material) {
  const gl = E.renderer.getContext();
  const prog = E.renderer.properties.get(material)?.currentProgram?.program;
  if (!prog) return { error: 'material has no linked program yet' };
  const types = SAMPLER_TYPES(gl);
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  const list = [];
  let units = 0;
  for (let i = 0; i < n; i++) {
    const u = gl.getActiveUniform(prog, i);
    if (!u || !types.has(u.type)) continue;
    list.push(`${u.name.replace(/\[0\]$/, '')}${u.size > 1 ? `[${u.size}]` : ''}`);
    units += u.size;
  }
  return { units, maxFragmentUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS), list };
}

/** Hide a set of objects everywhere (main view and every shadow pass); returns the undo. */
function hide(objs) {
  const was = objs.map((o) => o.visible);
  objs.forEach((o) => { o.visible = false; });
  return () => objs.forEach((o, i) => { o.visible = was[i]; });
}

/** Paired skip-one per group: { name: [objects] } -> ms with IQR. */
export async function groupSkip(E, groups, { n = 24, pairs = 6 } = {}) {
  const rows = {}, all = [];
  for (const [name, objs] of Object.entries(groups)) {
    if (!objs.length) { rows[name] = { ms: null, objects: 0 }; continue; }
    const d = [];
    for (let i = 0; i < pairs; i++) {
      await wait(2); const on = (await finishFrame(E, n)).medianMs;
      const undo = hide(objs); await wait(2);
      let off; try { off = (await finishFrame(E, n)).medianMs; } finally { undo(); }
      if (on != null && off != null) { d.push(on - off); all.push(on); }
    }
    const s = d.slice().sort((a, b) => a - b);
    rows[name] = { ms: r3(median(d)), iqr: [r3(s[Math.floor(s.length * 0.25)]), r3(s[Math.floor(s.length * 0.75)])], objects: objs.length };
  }
  return { method: `paired skip-one by object group (hidden in every pass), ${pairs} pairs of ${n} frames, finish-to-finish`, fullMs: r3(median(all)), rows };
}

/** A/B of runtime switches in one clock state: on - off, paired. */
export async function toggles(E, list, { n = 30, pairs = 8 } = {}) {
  const rows = {};
  for (const t of list) {
    const d = [], onMs = [], offMs = [];
    try {
      for (let i = 0; i < pairs; i++) {
        t.on(); await wait(4); const a = (await finishFrame(E, n)).medianMs;
        t.off(); await wait(4); const b = (await finishFrame(E, n)).medianMs;
        if (a != null && b != null) { d.push(a - b); onMs.push(a); offMs.push(b); }
      }
    } finally { t.restore ? t.restore() : t.on(); await wait(4); }
    const s = d.slice().sort((x, y) => x - y);
    rows[t.id] = { onMinusOffMs: r3(median(d)), iqr: [r3(s[Math.floor(s.length * 0.25)]), r3(s[Math.floor(s.length * 0.75)])],
      onMs: r3(median(onMs)), offMs: r3(median(offMs)), pairs: d.length };
  }
  return rows;
}

/** LOD-seam probe on the current camera. */
export function seams(E, scene, keep) {
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
  const solid = (x, y) => { const o = (y * w + x) * 4; return buf[o + 1] > 128; };   // white has green; magenta has none
  let crack = 0, widest = 0, landPx = 0;
  const at = [];   // [x, y from the top, width] of the first crack pixels
  const K = 3;
  for (let y = K; y < h - K; y++) {
    for (let x = K; x < w - K; x++) {
      if (solid(x, y)) { landPx++; continue; }
      let up = 0, dn = 0, lf = 0, rg = 0;
      for (let k = 1; k <= K; k++) {
        if (!up && solid(x, y + k)) up = k; if (!dn && solid(x, y - k)) dn = k;
        if (!lf && solid(x - k, y)) lf = k; if (!rg && solid(x + k, y)) rg = k;
      }
      const v = up && dn ? up + dn - 1 : 0, hz = lf && rg ? lf + rg - 1 : 0;
      if (v || hz) { crack++; widest = Math.max(widest, Math.min(v || 99, hz || 99)); if (at.length < 24) at.push([x, h - 1 - y, Math.min(v || 99, hz || 99)]); }
    }
  }
  return { pixels: w * h, landPx, crackPx: crack, widestPx: widest, at, hiddenObjects: hidden.length, method: `white unlit over magenta; gap pixel with land within ${K} px on both sides` };
}
