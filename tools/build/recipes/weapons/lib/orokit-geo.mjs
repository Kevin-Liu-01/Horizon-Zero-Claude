/**
 * CALIMA — Oro's kit, geometry in authored metres (Milestone 2 area D, wave 2 "the look"; bible §5.2 carry, §8.1
 * roster: the Boat Gaff, the Pine Windwall, the Brine and Cinder Pots, all handed over by the Tube Smith at 0:35).
 *
 * Plain arrays { pos, nrm, uv, idx, bw } (weapongeo.mjs's `G`), cut on the cells of the shared weapon atlas
 * (`weaponTrim()`: pine, esparto, carmine, bronzeCast, bronzeBlade, leather, leatherDark, brass, cord), so the held
 * GLBs ship without textures and the stowed copies ride one draw.
 *
 * THE BOAT GAFF, local +Y along the haft from the butt (y 0) to the beak's point (y GAFF.length); the hook stands
 * out on +Z and curls back toward the butt (its bight faces the hand, so a pull draws a part into it).
 *   butt knob (cast bronze, so the fist cannot slip off it) · esparto grip over the lower 0.15 m · carmine lashing ·
 *   resin-dark pine haft · a cast bronze socket · a short square beak · the hook, its inner edge honed
 * Sockets (`GAFF_SOCKETS`): butt, grip (the right fist), grip2 (the left hand for the hook-rip's two-handed pull),
 * head (the socket's centre), hookTip, tip, stow (the frog's ring on the haft).
 *
 * THE PINE WINDWALL (`windwallGeo`), local: the rivet at the origin, closed slats along +Y; the slats fan about +Z
 * (the face's normal): slat s (0..8) turns by s / 8 of the spread (0 = the base slat, laced to the forearm cuff).
 * Every vertex carries `bw = [slat, 0]`; a fractional slat index (the lacing and the hide between slats) turns by its
 * share, so one uniform opens the whole fan in the vertex program.
 */
import { G, merge, lathe, place, basisY } from '../../armor/lib/weapongeo.mjs';

const nrmz = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* ================================================================ the gaff */

export const GAFF = {
  length: 0.625,          // butt to the beak's point (m)
  r: 0.0150,              // the haft's radius at the grip
  rHead: 0.0134,          // ... under the socket (a shaved taper)
  grip: [0.026, 0.172],   // the esparto wrap (m from the butt)
  socket: [0.488, 0.552], // the cast socket
  hookY: 0.532,           // where the hook leaves the socket
};
/** The hook's centreline in the Y-Z plane: an arc about (0, Cy, Cz), from the socket out over the top and back down. */
const HOOK = { cy: 0.525, cz: 0.046, rho: 0.030, a0: 160, a1: -62 };
export const hookAt = (deg) => { const a = deg * Math.PI / 180; return [0, HOOK.cy + HOOK.rho * Math.sin(a), HOOK.cz + HOOK.rho * Math.cos(a)]; };

export const GAFF_SOCKETS = {
  butt: [0, 0, 0],
  grip: [0, 0.098, 0],
  grip2: [0, 0.36, 0],
  head: [0, 0.52, 0],
  hookTip: hookAt(HOOK.a1),
  tip: [0, GAFF.length, 0],
  stow: [0, 0.205, 0],      // the frog's loop on the stowed haft, just above the lashing's end
};

/** A tube along a centreline `P` (array of [x,y,z]) with an elliptical section (`rx` across the hook's plane, `ry` in
 *  it, per point), u along, v around. `side` gives the section's in-plane axis per point (unit). */
function sweep(P, rx, ry, side, rect, sides = 6) {
  const g = G();
  const n = P.length;
  let len = 0; const acc = [0];
  for (let i = 1; i < n; i++) { len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]); acc.push(len); }
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    const T = nrmz([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const S = side[i];
    const X = nrmz(cross(T, S));            // across the plane
    for (let k = 0; k <= sides; k++) {
      const th = (k / sides) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      g.pos.push(P[i][0] + X[0] * rx[i] * c + S[0] * ry[i] * s, P[i][1] + X[1] * rx[i] * c + S[1] * ry[i] * s, P[i][2] + X[2] * rx[i] * c + S[2] * ry[i] * s);
      const nn = nrmz([X[0] * c / Math.max(rx[i], 1e-4) + S[0] * s / Math.max(ry[i], 1e-4), X[1] * c / Math.max(rx[i], 1e-4) + S[1] * s / Math.max(ry[i], 1e-4), X[2] * c / Math.max(rx[i], 1e-4) + S[2] * s / Math.max(ry[i], 1e-4)]);
      g.nrm.push(...nn);
      g.uv.push(rect[0] + (len ? acc[i] / len : 0) * rect[2], rect[1] + (k / sides) * rect[3]);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    const a = i * (sides + 1) + k, b = a + 1, c = a + sides + 1, d = c + 1;
    g.idx.push(a, c, b, b, c, d);
  }
  return g;
}

/**
 * The Boat Gaff. `lod` 0 held (12-sided haft), 1 stowed (8). Returns { g, sockets }.
 */
export function gaffGeo(cell, { lod = 0 } = {}) {
  const g = G();
  const sides = lod ? 8 : 12;
  const L = GAFF;
  const hr = (y) => L.r + (L.rHead - L.r) * Math.max(0, Math.min(1, (y - L.grip[1]) / (L.socket[0] - L.grip[1])));
  // the butt knob: a cast bronze pommel, wider than the fist's hole
  merge(g, lathe([[0.0005, 0], [0.008, 0.002], [0.0165, 0.007], [0.0205, 0.013], [0.0200, 0.019], [0.0172, 0.024], [L.r + 0.0012, 0.027], [L.r + 0.0006, 0.030]],
    { sides: lod ? 10 : 14, rect: cell('bronzeCast'), uAlong: true }));
  // the esparto grip: a ridged cord wound over the lower haft (real relief, as the lance's wraps)
  {
    const prof = [], rows = lod ? 8 : 22;
    for (let i = 0; i <= rows; i++) {
      const y = L.grip[0] + (L.grip[1] - L.grip[0]) * (i / rows);
      const bump = i === 0 || i === rows ? 0.0007 : (i % 2 ? 0.0029 : 0.0020);
      prof.push([hr(y) + bump, y]);
    }
    merge(g, lathe(prof, { sides, rect: cell('esparto'), uAlong: false }));
  }
  // the carmine lashing that stops the wrap, three turns
  {
    const prof = [];
    for (let i = 0; i <= (lod ? 3 : 6); i++) { const y = L.grip[1] + 0.0045 * i * (lod ? 2 : 1); prof.push([hr(y) + (i % 2 ? 0.0026 : 0.0014), y]); }
    merge(g, lathe(prof, { sides, rect: cell('carmine'), uAlong: false }));
  }
  // the pine haft, shaved toward the head
  {
    const y0 = L.grip[1] + 0.027, y1 = L.socket[0] + 0.004, rows = lod ? 2 : 4;
    const prof = [];
    for (let i = 0; i <= rows; i++) { const y = y0 + (y1 - y0) * (i / rows); prof.push([hr(y), y]); }
    merge(g, lathe(prof, { sides, rect: cell('pine'), uRange: [0.1, 0.6] }));
    // under the lashing (no gap where the wrap ends)
    merge(g, lathe([[hr(L.grip[1]), L.grip[1] - 0.002], [hr(y0), y0 + 0.001]], { sides, rect: cell('pine'), uRange: [0.05, 0.1] }));
  }
  // the cast socket: a collar ring, the barrel, a second ring under the beak
  merge(g, lathe([[L.rHead + 0.0006, L.socket[0]], [L.rHead + 0.0042, L.socket[0] + 0.004], [L.rHead + 0.0042, L.socket[0] + 0.012], [L.rHead + 0.0024, L.socket[0] + 0.016],
    [L.rHead + 0.0030, L.socket[1] - 0.012], [L.rHead + 0.0046, L.socket[1] - 0.008], [L.rHead + 0.0040, L.socket[1] - 0.002], [0.0118, L.socket[1]]],
  { sides: lod ? 8 : 12, rect: cell('bronzeCast'), uAlong: true }));
  // the beak: a short square point, its faces planished
  merge(g, lathe([[0.0118, L.socket[1]], [0.0104, L.socket[1] + 0.018], [0.0074, L.socket[1] + 0.045], [0.0026, L.length - 0.006], [0.0004, L.length]],
    { sides: 4, phase: Math.PI / 4, rect: cell('bronzeBlade'), uAlong: true, vRange: [0, 0.6] }));
  // the hook: out of the socket's side, over the top and back down toward the butt, tapering to its point; the inner
  // (bight) side is the honed edge (the blade cell's v toward 1), a flat-sided forging (thinner across its plane)
  {
    const N = lod ? 8 : 14;
    const P = [], rx = [], ry = [], side = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N, deg = HOOK.a0 + (HOOK.a1 - HOOK.a0) * f;
      const p = hookAt(deg);
      // the root sinks into the socket
      if (i === 0) { p[2] = Math.min(p[2], L.rHead + 0.001); }
      P.push(p);
      const t = Math.pow(f, 0.85);
      rx.push(0.0062 * (1 - 0.78 * t) + 0.0008);
      ry.push(0.0095 * (1 - 0.86 * t) + 0.0008);
      const a = deg * Math.PI / 180;
      side.push([0, Math.sin(a), Math.cos(a)]);     // radial from the arc's centre: the in-plane thickness
    }
    merge(g, sweep(P, rx, ry, side, cell('bronzeBlade'), lod ? 5 : 7));
    // the point's tip cap
    const tip = P[P.length - 1];
    merge(g, place(lathe([[rx[N], 0], [0.0002, 0.004]], { sides: 4, rect: cell('bronzeBlade') }), ...basisY(nrmz([tip[0] - P[N - 1][0], tip[1] - P[N - 1][1], tip[2] - P[N - 1][2]]), [1, 0, 0]), tip));
  }
  // a cord lanyard through the knob (the bible's hand-gaff wrist loop), a closed ring hanging off the butt
  if (!lod) {
    const ring = [];
    const R = 0.026, cz = 0.0, cy = -0.022;
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; ring.push([0.0, cy + R * Math.cos(a) * 0.9, cz + R * Math.sin(a)]); }
    const side = ring.map((p) => nrmz([0, p[1] - cy, p[2] - cz]));
    merge(g, sweep(ring, ring.map(() => 0.0022), ring.map(() => 0.0022), side, cell('cord'), 4));
  }
  return { g, sockets: GAFF_SOCKETS };
}

/* ============================================================ the Windwall */

export const WINDWALL = {
  slats: 9,
  len: 0.47,             // rivet to the slat's tip (m): the open fan stands ~0.9 m (bible: 0.9 m of cover)
  spread: 150,           // degrees from the base slat to the ninth, open
  wPivot: 0.026, wTip: 0.105, thick: 0.0042,
};
/** How far a CLOSED Windwall's slats stay fanned (a share of the spread): a closed fan shows its slats' edges. */
export const CLOSED_OPEN = 0.07;
/** The open fan's angle (rad) for a slat index (fractional for the lacing). */
export const slatAngle = (s, open = 1) => (s / (WINDWALL.slats - 1)) * WINDWALL.spread * Math.PI / 180 * open;

/** A slat's half-width at `r` from the rivet (m): narrow round the rivet, flaring to the tip, the tip rounded off. */
const slatHW = (r) => {
  const W = WINDWALL, L = W.len;
  const t = Math.max(0, Math.min(1, r / (L - 0.03)));
  let hw = 0.5 * (W.wPivot + (W.wTip - W.wPivot) * Math.pow(t, 0.85));
  if (r > L - 0.03) hw *= Math.sqrt(Math.max(0, 1 - ((r - (L - 0.03)) / 0.03) ** 2)) * 0.6 + 0.4 * (1 - (r - (L - 0.03)) / 0.03);
  return Math.max(0.0015, hw);
};
/** The slat's layer in the stack (z, m): slat 0 next to her forearm, slat 8 outermost. */
export const slatZ = (s) => (s - (WINDWALL.slats - 1) / 2) * (WINDWALL.thick + 0.0004);

/**
 * The Pine Windwall, authored CLOSED: the rivet at the origin, the nine slats along +Y in a stack on Z (the face's
 * normal), the forearm under slat 0 (on -Z) in two leather cuffs. Every vertex carries `bw = [slat, 0]` (the slat index;
 * fractional on the woven palm leaf between two slats and on the lacing, so the vertex program fans the whole shield
 * open by one uniform: slat index s turns about +Z by `slatAngle(s, open)`). `lod` 1: the stowed copy (closed for good:
 * no leaf, one lacing). Returns { g, sockets }.
 */
export function windwallGeo(cell, { lod = 0, fan = 0 } = {}) {
  const W = WINDWALL, L = W.len, N = W.slats;
  const g = G();
  const tagS = (q, s) => { q.bw = []; for (let i = 0; i < q.pos.length; i += 3) q.bw.push(s, 0); return q; };
  const pine = cell('pine'), palm = cell('palm');
  const rows = lod ? [0.0, 0.10, 0.26, 0.40, L - 0.03, L - 0.012, L] : [0.0, 0.05, 0.12, 0.20, 0.28, 0.36, 0.42, L - 0.03, L - 0.018, L - 0.007, L];
  // the slats: a tapered board each, faces and edges, pine along its length
  for (let s = 0; s < N; s++) {
    const q = G(), z0 = slatZ(s), th = W.thick / 2;
    // four strips round the board: top (+z), bottom (-z), the two edges
    const strip = (fa, fb, nrm, v0, v1) => {
      const o = q.pos.length / 3;
      for (const r of rows) {
        const a = fa(r), b = fb(r);
        q.pos.push(...a, ...b); q.nrm.push(...nrm(r), ...nrm(r));
        const u = r / L;
        q.uv.push(pine[0] + u * pine[2], pine[1] + v0 * pine[3], pine[0] + u * pine[2], pine[1] + v1 * pine[3]);
      }
      for (let i = 0; i < rows.length - 1; i++) { const a = o + i * 2, b = a + 1, c = a + 2, d = a + 3; q.idx.push(a, c, b, b, c, d); }
    };
    // (winding: +z face counter-clockwise seen from +z)
    strip((r) => [slatHW(r), r, z0 + th], (r) => [-slatHW(r), r, z0 + th], () => [0, 0, 1], 0.1, 0.9);
    strip((r) => [-slatHW(r), r, z0 - th], (r) => [slatHW(r), r, z0 - th], () => [0, 0, -1], 0.1, 0.9);
    strip((r) => [slatHW(r), r, z0 - th], (r) => [slatHW(r), r, z0 + th], () => [1, 0, 0], 0.0, 0.1);
    strip((r) => [-slatHW(r), r, z0 + th], (r) => [-slatHW(r), r, z0 - th], () => [-1, 0, 0], 0.9, 1.0);
    // the rivet end, a cap
    { const o = q.pos.length / 3, hw = slatHW(0);
      q.pos.push(hw, 0, z0 + th, -hw, 0, z0 + th, -hw, 0, z0 - th, hw, 0, z0 - th); for (let k = 0; k < 4; k++) q.nrm.push(0, -1, 0);
      for (let k = 0; k < 4; k++) q.uv.push(pine[0], pine[1] + 0.5 * pine[3]);
      q.idx.push(o, o + 2, o + 1, o, o + 3, o + 2); }
    merge(g, tagS(q, s));
  }
  // the rivet: a cast brass boss through the stack, domed both sides (slat 0's: it does not turn)
  {
    const zr = slatZ(N - 1) + W.thick / 2 + 0.002, rv = lathe([[0.0005, -zr - 0.004], [0.008, -zr - 0.0028], [0.0118, -zr], [0.0118, zr], [0.008, zr + 0.0028], [0.0005, zr + 0.004]], { sides: lod ? 8 : 12, rect: cell('brass'), uAlong: true });
    merge(g, tagS(place(rv, [1, 0, 0], [0, 0, 1], [0, -1, 0]), 0));
  }
  // the woven palm leaf between neighbouring slats (fractional indices: it opens with them), both faces
  if (!lod) {
    const r0 = 0.10, r1 = L - 0.05, cols = 4, rws = [r0, (r0 + r1) / 2, r1];
    for (let s = 0; s < N - 1; s++) for (const side of [1, -1]) {
      const q = G(); q.bw = [];
      for (let c = 0; c <= cols; c++) {
        const f = s + c / cols, z = slatZ(s) + (slatZ(s + 1) - slatZ(s)) * (c / cols) + side * 0.0006;
        for (const r of rws) { q.pos.push(0, r, z); q.nrm.push(0, 0, side); q.uv.push(palm[0] + (c / cols) * palm[2], palm[1] + (r / L) * palm[3]); q.bw.push(f, 0); }
      }
      const R = rws.length;
      for (let c = 0; c < cols; c++) for (let i = 0; i < R - 1; i++) {
        const a = c * R + i, b = a + 1, cc = a + R, d = cc + 1;
        if (side > 0) q.idx.push(a, cc, b, b, cc, d); else q.idx.push(a, b, cc, b, d, cc);
      }
      merge(g, q);
    }
  }
  // the lacing: cord through every slat at two radii (one stowed), a fractional index per ring
  for (const rr of lod ? [0.40] : [0.24, 0.40]) {
    const P = [], side = [], fs = [];
    const steps = lod ? 4 : 16;
    for (let i = 0; i <= steps; i++) { const f = (N - 1) * (i / steps); fs.push(f); const s0 = Math.floor(Math.min(f, N - 1.0001)), k = f - s0; P.push([0, rr, slatZ(s0) + (slatZ(s0 + 1) - slatZ(s0)) * k]); side.push([1, 0, 0]); }
    // (the cord runs along z through the closed stack; open, each ring turns with its index onto the arc)
    const q = G();
    const ring = 4, rc = 0.0022, cr = cell('cord');
    for (let i = 0; i < P.length; i++) for (let k = 0; k <= ring; k++) {
      const th = (k / ring) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      q.pos.push(P[i][0] + rc * c, P[i][1] + rc * sn, P[i][2]); q.nrm.push(c, sn, 0);
      q.uv.push(cr[0] + (i / (P.length - 1)) * cr[2], cr[1] + (k / ring) * cr[3]);
    }
    for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < ring; k++) { const a = i * (ring + 1) + k, b = a + 1, c = a + ring + 1, d = c + 1; q.idx.push(a, c, b, b, c, d); }
    q.bw = []; for (let i = 0; i < P.length; i++) for (let k = 0; k <= ring; k++) q.bw.push(fs[i], 0);
    merge(g, q);
    void side;
  }
  // the two forearm cuffs under slat 0 (leather bands round the forearm's line, which runs along +Y on -Z)
  const armZ = slatZ(0) - W.thick / 2 - 0.046;
  for (const yc of [0.06, 0.19]) {
    const band = lathe([[0.0445, -0.016], [0.0478, -0.0135], [0.0478, 0.0135], [0.0445, 0.016]], { sides: lod ? 10 : 16, rect: cell('leatherDark'), uAlong: true });
    for (let i = 1; i < band.pos.length; i += 3) band.pos[i] += yc;
    for (let i = 2; i < band.pos.length; i += 3) band.pos[i] += armZ;
    merge(g, tagS(band, 0));
  }
  // (`fan`: the share of the spread baked into the positions, for the stowed copy, which has no vertex program)
  if (fan > 0) for (let i = 0, v = 0; i < g.pos.length; i += 3, v++) {
    const a = slatAngle(g.bw[v * 2], fan), c = Math.cos(a), s = Math.sin(a);
    const x = g.pos[i], y = g.pos[i + 1], nx = g.nrm[i], ny = g.nrm[i + 1];
    g.pos[i] = c * x - s * y; g.pos[i + 1] = s * x + c * y; g.nrm[i] = c * nx - s * ny; g.nrm[i + 1] = s * nx + c * ny;
  }
  const sockets = {
    pivot: [0, 0, 0],
    // the forearm's line under the cuffs: the wrist end and the elbow end (the runtime lays her forearm on it)
    cuffWrist: [0, 0.0, armZ], cuffElbow: [0, 0.24, armZ],
    tip: [0, L, slatZ(0)],
  };
  return { g, sockets };
}
