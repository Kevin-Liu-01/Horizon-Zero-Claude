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
/** The open fan's angle (rad) for a slat index (fractional for the lacing). */
export const slatAngle = (s, open = 1) => (s / (WINDWALL.slats - 1)) * WINDWALL.spread * Math.PI / 180 * open;
