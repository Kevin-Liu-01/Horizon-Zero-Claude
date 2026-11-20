/**
 * THE SUBJECT CHECK'S LAW (Milestone 3 rule 17; area F's EF4). Pure: no THREE, no DOM, no node: imported by Node (the
 * pre-check from a frame's lens and the recipe's ground, tools/frames/subjects.mjs; the tests) and by the page module
 * (tools/frames/subject-page.mjs, which measures the same members on the frozen frame and adds the meshes' occlusion).
 *
 * A LENS is { pos: [x, y, z], fwd, right, up (unit, world), tanX, tanY (half-angle tangents), W, H (CSS px) }.
 * A MEMBER is one named object's sample points (world) and the tolerance (m) within which a hit in front of a sample is
 * the member itself (a merged blockout, a far side). A SUBJECT is a list of members and how many must pass (`min`).
 *
 * The bars (rule 17, per member): its screen box is at least `minPx` tall or `minShare` of the frame; at least
 * `inLens` of its samples (default 0.7) are in front of the lens and inside the safe area (5 % in from each edge); at
 * least `visible` of those (default 0.7) are unoccluded on a ray from the lens. A `ground` subject is instead the share
 * of the frame whose rays first strike its region's ground (`minShare`); a `sun` subject is its disc's centre in the
 * safe area and unoccluded.
 */
export const SAFE_INSET = 0.05;
export const DEFAULTS = Object.freeze({ inLens: 0.7, visible: 0.7, minPx: 0, minShare: 0 });

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A lens from a position and a target (world, engine frame: +y up), vertical fov (deg) and the frame's CSS size. */
export function lensLookAt(pos, target, fovDeg, W, H) {
  const fwd = norm(sub(target, pos));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const tanY = Math.tan((fovDeg * Math.PI) / 360);
  return { pos: [...pos], fwd, right, up, tanY, tanX: tanY * (W / H), W, H };
}

/** page.mjs's 'eye' lens (frame camera.mode 'eye'): on the place's ground plus `eye`, along the bearing, pitched. */
export function eyeLens(f, ground, W, H, scale = 1) {
  const D = Math.PI / 180, x = f.at.en[0] * scale, z = -f.at.en[1] * scale, c = f.camera;
  const pos = [x, ground(x, z) + (c.eye ?? 1.7), z];
  const b = (f.bearing ?? 0) * D, dx = Math.sin(b), dz = -Math.cos(b);
  const tgt = [pos[0] + dx * 100, pos[1] + Math.tan((c.pitch || 0) * D) * 100, pos[2] + dz * 100];
  return lensLookAt(pos, tgt, c.fov || 55, W, H);
}

/** A world point on the screen: CSS px (x right, y down), `front` when in front of the lens, `d` its distance. */
export function project(L, p) {
  const v = sub(p, L.pos), z = dot(v, L.fwd);
  const nx = dot(v, L.right) / (z * L.tanX), ny = dot(v, L.up) / (z * L.tanY);
  return { x: ((nx + 1) / 2) * L.W, y: ((1 - ny) / 2) * L.H, front: z > 0.05, d: Math.hypot(v[0], v[1], v[2]) };
}

/** The ray through a pixel (u, v in 0..1 of the frame, v down). */
export function rayAt(L, u, v) {
  const nx = 2 * u - 1, ny = 1 - 2 * v;
  return norm([L.fwd[0] + L.right[0] * nx * L.tanX + L.up[0] * ny * L.tanY, L.fwd[1] + L.right[1] * nx * L.tanX + L.up[1] * ny * L.tanY, L.fwd[2] + L.right[2] * nx * L.tanX + L.up[2] * ny * L.tanY]);
}

export const inSafe = (L, s, inset = SAFE_INSET) => s.front && s.x >= L.W * inset && s.x <= L.W * (1 - inset) && s.y >= L.H * inset && s.y <= L.H * (1 - inset);

/**
 * Does the ground cross the ray from `a` to `b` before `b` (less `tol` metres)? `ground(x, z)` the height. Marched in
 * steps that grow with distance (0.5 m near, at most 4 m), the ray counted blocked when it passes 0.05 m under the ground.
 */
export function groundBlocks(ground, a, b, tol = 0.3) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const u = [(b[0] - a[0]) / d, (b[1] - a[1]) / d, (b[2] - a[2]) / d];
  for (let t = 0.5; t < d - tol; t += Math.min(4, Math.max(0.5, t * 0.01))) {
    const x = a[0] + u[0] * t, y = a[1] + u[1] * t, z = a[2] + u[2] * t;
    if (y < ground(x, z) - 0.05) return { t: +t.toFixed(1) };
  }
  return null;
}

/** The first ground the ray strikes within `far` (m): { t, x, y, z } or null (sky, sea past the far). */
export function groundHit(ground, o, dir, far = 2500) {
  let prev = 0;
  for (let t = 0.5; t < far; t += Math.min(8, Math.max(0.5, t * 0.02))) {
    const x = o[0] + dir[0] * t, y = o[1] + dir[1] * t, z = o[2] + dir[2] * t;
    if (y < ground(x, z)) {
      // refine between the last step and this one
      let lo = prev, hi = t;
      for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; const mx = o[0] + dir[0] * m, my = o[1] + dir[1] * m, mz = o[2] + dir[2] * m; if (my < ground(mx, mz)) hi = m; else lo = m; }
      return { t: hi, x: o[0] + dir[0] * hi, y: o[1] + dir[1] * hi, z: o[2] + dir[2] * hi };
    }
    prev = t;
  }
  return null;
}

/** Sample points (world) of a data-defined shape. `ground(x, z)` stands it. Engine frame. */
export function shapeSamples(s, ground, L = null) {
  const out = [];
  if (s.kind === 'point') { const y = (s.y ?? ground(s.x, s.z)) + (s.up ?? 0); out.push([s.x, y, s.z]); return out; }
  if (s.kind === 'cylinder' || s.kind === 'cone') {
    const y0 = s.y0 ?? ground(s.x, s.z), h = s.h, r0 = s.r, r1 = s.kind === 'cone' ? (s.rTop ?? s.r * 0.3) : (s.rTop ?? s.r);
    // the half facing the lens (a far side is hidden by the shape itself), at four heights, plus the top's centre
    const toward = L ? Math.atan2(L.pos[2] - s.z, L.pos[0] - s.x) : 0;
    for (const k of [0.1, 0.4, 0.7, 0.95]) {
      const r = r0 + (r1 - r0) * k, y = y0 + h * k;
      for (const a of [-70, -35, 0, 35, 70]) { const t = toward + (a * Math.PI) / 180; out.push([s.x + Math.cos(t) * r, y, s.z + Math.sin(t) * r]); }
    }
    out.push([s.x, y0 + h, s.z]);
    return out;
  }
  throw new Error(`no samples for a '${s.kind}' shape`);
}

/** The screen box (CSS px, clipped to the frame) of the samples in front of the lens; null when none is. */
export function screenBox(L, scr) {
  const f = scr.filter((s) => s.front);
  if (!f.length) return null;
  const cl = (v, m) => Math.max(0, Math.min(m, v));
  const x0 = cl(Math.min(...f.map((s) => s.x)), L.W), x1 = cl(Math.max(...f.map((s) => s.x)), L.W);
  const y0 = cl(Math.min(...f.map((s) => s.y)), L.H), y1 = cl(Math.max(...f.map((s) => s.y)), L.H);
  return { box: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)], px: Math.round(y1 - y0), share: +(((x1 - x0) * (y1 - y0)) / (L.W * L.H)).toFixed(5) };
}

/**
 * One member's verdict from its measured samples: `scr` (project() of each sample) and `occluded[i]` for each sample
 * (true, false, or null when not tested: outside the safe area).
 */
export function judgeMember(L, spec, scr, occluded) {
  const b = { ...DEFAULTS, ...spec };
  const sb = screenBox(L, scr);
  const n = scr.length, inL = scr.map((s) => inSafe(L, s));
  const nIn = inL.filter(Boolean).length;
  const tested = occluded.filter((o, i) => inL[i] && o != null), nVis = tested.filter((o) => !o).length;
  const m = {
    px: sb?.px ?? 0, share: sb?.share ?? 0, box: sb?.box ?? null,
    inLens: +(nIn / Math.max(1, n)).toFixed(3), visible: +(tested.length ? nVis / tested.length : 0).toFixed(3), samples: n,
  };
  const why = [];
  if (!sb) why.push('behind the lens');
  else {
    if (b.minPx && m.px < b.minPx) why.push(`${m.px} px tall < ${b.minPx} px`);
    if (b.minShare && m.share < b.minShare) why.push(`${(m.share * 100).toFixed(2)} % of the frame < ${(b.minShare * 100).toFixed(2)} %`);
    if (m.inLens < b.inLens) why.push(`${(m.inLens * 100).toFixed(0)} % of it in the lens's safe area < ${(b.inLens * 100).toFixed(0)} %`);
    if (m.inLens >= b.inLens && m.visible < b.visible) why.push(`${(m.visible * 100).toFixed(0)} % of it unoccluded < ${(b.visible * 100).toFixed(0)} %`);
  }
  return { ...m, pass: !why.length, why };
}

/** A subject's verdict from its members' (`min` of them must pass; default all). */
export function judgeSubject(spec, members) {
  const need = spec.min ?? Math.max(1, members.length);
  const passed = members.filter((m) => m.pass).length;
  const why = [];
  if (!members.length) why.push(spec.missing || 'not in this build');
  else if (passed < need) why.push(`${passed} of ${members.length} pass, ${need} wanted: ${members.filter((m) => !m.pass).slice(0, 3).map((m) => `${m.name} (${m.why.join('; ')})`).join(', ')}`);
  return { name: spec.name, pass: !why.length, passed, of: members.length, need, why, members };
}

/** A ground subject's share: rays on a grid of the frame, the share whose first strike is `inRegion(x, z)` ground. */
export function groundShare(L, ground, inRegion, { nx = 48, ny = 27, far = 2500, blocked = null } = {}) {
  let hit = 0, any = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const dir = rayAt(L, (i + 0.5) / nx, (j + 0.5) / ny), g = groundHit(ground, L.pos, dir, far);
    if (!g) continue;
    any++;
    if (blocked && blocked(dir, g.t)) continue;
    if (inRegion(g.x, g.z)) hit++;
  }
  return { share: +(hit / (nx * ny)).toFixed(4), groundShare: +(any / (nx * ny)).toFixed(4), rays: nx * ny };
}

/** The verdict line a refused frame carries (run.json `error`). */
export function refusal(frameId, subjects) {
  const bad = subjects.filter((s) => !s.pass);
  return bad.length ? `not staged: ${frameId}: ${bad.map((s) => `subject '${s.name}' ${s.why.join('; ')}`).join(' | ')}` : null;
}
