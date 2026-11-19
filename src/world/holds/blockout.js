/**
 * THE HOLDS AT BLOCKOUT (area A, M2 wave 1; bible §3.3-§3.4, M2.1): the landform pieces the first hour's
 * Holds beats stand on, as plain data and pure height functions of the authored frame (e, n), so the recipe,
 * the terrain worker pool and node (tools/world/holds-rows.mjs) all run the same code. No THREE, no DOM.
 *
 *   SCAR_LINE   the Screed Scar (bible §3.4: (251, -43) -> (-91, -384), 25 m wide, dead straight, berms both
 *               sides). The floor is PLANED, not levelled: across its 25 m it follows the least-squares line of
 *               the ground it was cut from (the cross-fall stays, the relief goes), smoothed along its length, and
 *               stands FLOOR_CUT below it; a spoil berm rises on each side. Its north-east 250 m run along a
 *               20-40 deg side slope, where a floor level across would need cuts of 7-13 m (holds-rows.mjs HG0
 *               prints them): that is a ruling, not a choice made here.
 *   PLUMB_TERRACE  the bench on the slope above Ninewalls where the 0:28 beat's second Plumb paints the pit walls
 *               (a small level cut; the station's lens and the herd's slope below it are checked in HG0).
 *   HERD_SLOPE  the line the Tiller herd cores up between Brea (coming from Saltrow) and the terrace: data for
 *               area C, no landform.
 *   BARRANCO    the gully north of the herd's slope whose carrizo is the beat's other road (the cane itself is
 *               wave 2, drawn from the same cover mask that drives the reed rule).
 *
 * Every piece changes the ground only inside its own footprint (FOOTPRINT, authored frame); outside it the island is
 * bit-for-bit the island before (holds-rows.mjs proves it against a base tree with --base).
 *
 * The Scar's floor profile is read once from the natural ground (`buildHoldsProfile(natural)`, called by the recipe
 * after its macro grids exist, on every thread), so no pass of the macro sees the Scar and nothing outside its band
 * moves: the sites keep their anchors and the sight rays their notches.
 */
import { SCAR, TRIG } from '../island/sites.js';
import { ISLAND_SCALE as S } from '../island/extent.js';

const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------------ the Scar ---- */
/** The Scar's line in the authored frame (sites.js publishes it in the engine frame). */
const A = Object.freeze({ e: SCAR.a.x / S, n: -SCAR.a.z / S });
const B = Object.freeze({ e: SCAR.b.x / S, n: -SCAR.b.z / S });
const LEN = Math.hypot(B.e - A.e, B.n - A.n);
const DE = (B.e - A.e) / LEN, DN = (B.n - A.n) / LEN;   // along, toward the south-west end
const PE = -DN, PN = DE;                                  // across: +v is the south-east side

/** The Scar's numbers (m). `half` the floor's half-width (to the berms' inner half-height); BERM_IN the berm's inner
 * face either side of that edge, BERM_OUT its outer face, APRON the hand-back to the ground; BERM_H its height (*). */
export const SCAR_LINE = Object.freeze({
  a: A, b: B, len: LEN, dir: Object.freeze({ e: DE, n: DN }), across: Object.freeze({ e: PE, n: PN }),
  width: SCAR.width / S, half: SCAR.width / S / 2,
  BERM_IN: 1.2, BERM_OUT: 3.2, APRON: 3.0, BERM_H: 1.05, BERM_VAR: 0.18, FLOOR_CUT: 0.25,
  /** the floor's end taper beyond each end, m */
  END: 6,
  /** smoothing of the floor's profile along the line (Gaussian sigma, m) */
  SMOOTH: 11,
});

/** (u, v): metres along the Scar from its north-east end and across it (+ south-east). */
export function scarFrame(e, n, out = { u: 0, v: 0 }) {
  const de = e - A.e, dn = n - A.n;
  out.u = de * DE + dn * DN;
  out.v = de * PE + dn * PN;
  return out;
}

/** The authored point at (u, v) of the Scar's frame. */
export function scarPoint(u, v) {
  return { e: A.e + DE * u + PE * v, n: A.n + DN * u + PN * v };
}

/**
 * Benchmark 1 (bible §3.4: E 12, N -282, on the Scar's line) and the breaches in the spoil where its re-survey's
 * bearings cross a berm: a berm across a bearing hides the mark it points at (the Rise's ground already grazes the
 * line to T2's top: 0.22 m under it before the Scar, so a 1 m berm there hides T2 from B1's Alidade). Past the
 * breach a sight notch keeps the bearing open over the Rise's ground, as the recipe's own pass keeps the ten trig
 * rays open (a low-passed cut, SIGHT_NOTCH.margin under the line from the Alidade to the mark's top). Each breach: the berm's side, the metres along
 * the bearing's run across the band in the Scar's (u, v) frame, its half-width (full) and its ease (m).
 */
export const B1 = Object.freeze({ e: 12, n: -282 });
/** B1's Alidade over the ground (systems' HR0 eye), and the clearance the notch keeps under a bearing to a mark's top. */
export const B1_EYE = 1.55;
export const SIGHT_NOTCH = Object.freeze({ margin: 0.5, half: 1.5, ease: 3.5, from: 3 });
export const BREACHES = Object.freeze(['T2'].map((id) => {
  const t = TRIG.find((q) => q.id === id), f0 = scarFrame(B1.e, B1.n), f1 = scarFrame(t.e, t.n);
  // the bearing as a segment in the Scar's (u, v) frame, from B1 to where it leaves the Scar's band
  const side = Math.sign(f1.v - f0.v), vOut = side * (SCAR_LINE.half + SCAR_LINE.BERM_IN + SCAR_LINE.BERM_OUT + SCAR_LINE.APRON + 2);
  const k = (vOut - f0.v) / (f1.v - f0.v);
  return Object.freeze({ to: id, side, u0: f0.u, v0: f0.v, u1: f0.u + (f1.u - f0.u) * k, v1: vOut, half: 1.5, ease: 3 });
}));


/* ------------------------------------------------------------ other pieces ---- */
/** The Plumb's bench above Ninewalls: centre, the level disc's radius and its ease-out (authored frame), and its lamp
 * over its feet (plumb.js eyeHeight). 122 m NNW of Ninewalls' centre and 12 m above it, on the open face of the slope:
 * a lamp 2.5 m up cannot see past a brow below it, so the bench stands below the brow, not on it (HG0). */
export const PLUMB_TERRACE = Object.freeze({ e: -70, n: -107, r0: 2.5, r1: 5, lamp: 2.5 });

/** The herd's slope: from its foot (south-west, the side Brea comes up from Saltrow) to 39 m below the bench, outside
 * the nine walls' north-west end (settlements' ninewalls-layout.js: OUTER_R 67.65, arcs from bearing 305). */
export const HERD_SLOPE = Object.freeze([Object.freeze({ e: -140, n: -205 }), Object.freeze({ e: -65, n: -145 })]);

/** The barranco north-west of the herd's slope, from its head 18 m below the bench down to the Pans' edge: a polyline
 * downhill, its depth and half-width (m); 18-21 m from the herd's line, so the two roads are two. */
export const BARRANCO = Object.freeze({
  path: Object.freeze([[-58, -120], [-80, -133], [-100, -150], [-118, -161], [-138, -176]].map(([e, n]) => Object.freeze({ e, n }))),
  depth: 2.4, half: 3.0, bank: 7.0,
});

/** The bounding box (authored frame, m) outside which nothing here changes the ground. */
export const FOOTPRINT = (() => {
  let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  const grow = (e, n, r) => { e0 = Math.min(e0, e - r); e1 = Math.max(e1, e + r); n0 = Math.min(n0, n - r); n1 = Math.max(n1, n + r); };
  const reach = SCAR_LINE.half + SCAR_LINE.BERM_IN + SCAR_LINE.BERM_OUT + SCAR_LINE.APRON + 1;
  for (const u of [-SCAR_LINE.END, LEN + SCAR_LINE.END]) for (const v of [-reach, reach]) { const p = scarPoint(u, v); grow(p.e, p.n, 0); }
  grow(PLUMB_TERRACE.e, PLUMB_TERRACE.n, PLUMB_TERRACE.r1);
  for (const p of BARRANCO.path) grow(p.e, p.n, BARRANCO.half + BARRANCO.bank + 1);
  for (const br of BREACHES) { const t = TRIG.find((q) => q.id === br.to); grow(B1.e, B1.n, 8); grow(t.e, t.n, 8); }
  return Object.freeze({ e0, e1, n0, n1 });
})();

/* ------------------------------------------------------------ the profile ---- */
const STEP = 2;                       // m between profile stations
const U0 = -SCAR_LINE.END - 2 * STEP; // the first station
const NST = Math.ceil((LEN + 2 * SCAR_LINE.END + 4 * STEP) / STEP) + 1;
const P = { ready: false, c: new Float64Array(NST), s: new Float64Array(NST), terrace: 0, barr: null, notch: [] };

const _barSeg = [];
for (let i = 0; i + 1 < BARRANCO.path.length; i++) {
  const a = BARRANCO.path[i], b = BARRANCO.path[i + 1];
  _barSeg.push({ ae: a.e, an: a.n, de: b.e - a.e, dn: b.n - a.n, l2: (b.e - a.e) ** 2 + (b.n - a.n) ** 2, len: Math.hypot(b.e - a.e, b.n - a.n) });
}
const BAR_LEN = _barSeg.reduce((s, q) => s + q.len, 0);

/** Distance to the barranco's centreline and the metres along it (from its head) of the nearest point. */
function barrancoAt(e, n) {
  let best = Infinity, along = 0, acc = 0;
  for (const q of _barSeg) {
    const t = Math.min(1, Math.max(0, ((e - q.ae) * q.de + (n - q.an) * q.dn) / q.l2));
    const d = Math.hypot(e - q.ae - q.de * t, n - q.an - q.dn * t);
    if (d < best) { best = d; along = acc + t * q.len; }
    acc += q.len;
  }
  return { d: best, along };
}

/**
 * Read the pieces' reference heights from the natural ground once (`natural(e, n)` is the recipe's height without
 * this file). Idempotent; cheap (about 3000 samples).
 */
export function buildHoldsProfile(natural) {
  if (P.ready) return P;
  const H = SCAR_LINE.half, raw = new Float64Array(NST), rawS = new Float64Array(NST);
  for (let k = 0; k < NST; k++) {
    const u = Math.min(LEN, Math.max(0, U0 + k * STEP));
    // least squares h = c + s v over the floor's width
    let sv = 0, sh = 0, svv = 0, svh = 0, m = 0;
    for (let v = -H; v <= H + 1e-6; v += H / 5) {
      const p = scarPoint(u, v), h = natural(p.e, p.n);
      sv += v; sh += h; svv += v * v; svh += v * h; m++;
    }
    const s = (m * svh - sv * sh) / (m * svv - sv * sv);
    raw[k] = (sh - s * sv) / m; rawS[k] = s;
  }
  const sig = SCAR_LINE.SMOOTH / STEP, R = Math.ceil(sig * 3);
  for (let k = 0; k < NST; k++) {
    let wc = 0, c = 0, sl = 0;
    for (let j = -R; j <= R; j++) {
      const i = Math.min(NST - 1, Math.max(0, k + j)), w = Math.exp(-(j * j) / (2 * sig * sig));
      c += raw[i] * w; sl += rawS[i] * w; wc += w;
    }
    P.c[k] = c / wc - SCAR_LINE.FLOOR_CUT; P.s[k] = sl / wc;
  }
  // B1's bearings: the line from the Alidade (on the Scar's floor at B1) to each mark's top (its natural ground + 4 m)
  P.notch = BREACHES.map((br) => {
    const t = TRIG.find((q) => q.id === br.to), f0 = scarFrame(B1.e, B1.n);
    return { ae: B1.e, an: B1.n, ay: null, be: t.e, bn: t.n, by: natural(t.e, t.n) + 4, f0 };
  });
  // the bench stands at the natural ground of its centre: on the slope's brow, so a lamp on it sees down the slope
  // (cut deeper, the brow hides the slope; filled, its own lip does)
  P.terrace = natural(PLUMB_TERRACE.e, PLUMB_TERRACE.n);
  // the barranco's bed: the natural centreline, made to fall monotonically downhill (head to mouth), minus its depth
  const nb = Math.ceil(BAR_LEN / STEP) + 1;
  P.barr = new Float64Array(nb);
  let lo = Infinity;
  for (let k = 0; k < nb; k++) {
    const t = Math.min(BAR_LEN, k * STEP);
    let acc = 0, pe = BARRANCO.path[0].e, pn = BARRANCO.path[0].n;
    for (const q of _barSeg) { if (acc + q.len >= t) { const f = (t - acc) / q.len; pe = q.ae + q.de * f; pn = q.an + q.dn * f; break; } acc += q.len; }
    lo = Math.min(lo, natural(pe, pn));
    P.barr[k] = lo - BARRANCO.depth;
  }
  P.ready = true;
  for (const q of P.notch) q.ay = scarFloor(q.f0.u, q.f0.v) + B1_EYE;
  return P;
}

/** The Scar floor's height at (u, v), and its station values (for the rows). */
export function scarFloor(u, v) {
  const f = (Math.min(LEN + SCAR_LINE.END, Math.max(-SCAR_LINE.END, u)) - U0) / STEP;
  const k = Math.min(NST - 2, Math.max(0, Math.floor(f))), t = f - k;
  const c = P.c[k] + (P.c[k + 1] - P.c[k]) * t, s = P.s[k] + (P.s[k + 1] - P.s[k]) * t;
  return c + s * v;
}

/** 0..1: how much of the Scar's floor a point is (1 on the floor, 0 off it and on the berms), for the tint. */
export function scarWeight(e, n) {
  if (!P.ready) return 0;
  const de = e - A.e, dn = n - A.n, u = de * DE + dn * DN, v = de * PE + dn * PN;
  const av = Math.abs(v);
  if (av > SCAR_LINE.half + 1 || u < -SCAR_LINE.END || u > LEN + SCAR_LINE.END) return 0;
  const wA = u < 0 ? 1 - ss(0, SCAR_LINE.END, -u) : u > LEN ? 1 - ss(0, SCAR_LINE.END, u - LEN) : 1;
  return wA * (1 - ss(SCAR_LINE.half - 0.6, SCAR_LINE.half + 0.4, av));
}

/** A cheap hash noise in 0..1 (the berms' height varies along their length). */
function vn(x) { const i = Math.floor(x), f = x - i, a = Math.sin(i * 127.1) * 43758.5453, b = Math.sin((i + 1) * 127.1) * 43758.5453;
  const ha = a - Math.floor(a), hb = b - Math.floor(b), w = f * f * (3 - 2 * f); return ha + (hb - ha) * w; }

/**
 * The Holds' blockout applied to the natural height `h` at an authored point. Returns `h` unchanged outside the
 * footprint (the same float, so the island outside it is the island before).
 */
export function holdsHeight(e, n, h) {
  if (!P.ready || e < FOOTPRINT.e0 || e > FOOTPRINT.e1 || n < FOOTPRINT.n0 || n > FOOTPRINT.n1) return h;
  let out = h;
  /* the Scar: the planed floor; a spoil berm standing on the floor's plane carried out past its edge (its inner face's
   * half-height on the floor's edge, so the floor reads 25 m between them); an apron that hands the plane back to the
   * ground beyond */
  const de = e - A.e, dn = n - A.n, u = de * DE + dn * DN, v = de * PE + dn * PN, av = Math.abs(v);
  const Q = SCAR_LINE, v0 = Q.half - Q.BERM_IN, vc = Q.half + Q.BERM_IN, v1 = vc + Q.BERM_OUT, v2 = v1 + Q.APRON;
  if (av < v2 && u > -Q.END && u < LEN + Q.END) {
    const wA = u < 0 ? 1 - ss(0, Q.END, -u) : u > LEN ? 1 - ss(0, Q.END, u - LEN) : 1;
    const plane = scarFloor(u, v);
    let target = plane;
    if (av > v0) {
      const side = v > 0 ? 17.3 : 3.1;
      const hb = Q.BERM_H * (1 + Q.BERM_VAR * (vn(u / 23 + side) * 2 - 1));
      target += hb * (av < vc ? ss(v0, vc, av) : 1 - ss(vc, v1, av));
      if (av > v1) target += (h - target) * ss(v1, v2, av);
      // a breach: no berm, and the floor's plane handed straight back to the ground at the edge
      for (let i = 0; i < BREACHES.length; i++) {
        const br = BREACHES[i];
        if (Math.sign(v) !== br.side) continue;
        const du = br.u1 - br.u0, dv = br.v1 - br.v0, tt = Math.min(1, Math.max(0, ((u - br.u0) * du + (v - br.v0) * dv) / (du * du + dv * dv)));
        const k = 1 - ss(br.half, br.half + br.ease, Math.hypot(u - br.u0 - du * tt, v - br.v0 - dv * tt));
        if (k > 0) target += (plane + (h - plane) * ss(v0, vc + 1, av) - target) * k;
      }
    }
    out += (target - out) * wA;
  }
  /* the Plumb's bench */
  const dt = Math.hypot(e - PLUMB_TERRACE.e, n - PLUMB_TERRACE.n);
  if (dt < PLUMB_TERRACE.r1) out += (P.terrace - out) * (1 - ss(PLUMB_TERRACE.r0, PLUMB_TERRACE.r1, dt));
  /* the barranco */
  const bq = barrancoAt(e, n);
  const bw = BARRANCO.half + BARRANCO.bank;
  if (bq.d < bw) {
    const f = Math.min(P.barr.length - 1.001, bq.along / STEP), k = Math.floor(f), t = f - k;
    const bed = P.barr[k] + (P.barr[k + 1] - P.barr[k]) * t;
    const wE = ss(0, 8, bq.along) * ss(0, 8, BAR_LEN - bq.along) * 0.85 + 0.15;   // shallow at the head and the mouth
    const bedH = out + (bed - out) * wE;
    if (bedH < out) out += (bedH - out) * (1 - ss(BARRANCO.half, bw, bq.d));
  }
  /* B1's sight notches */
  for (let i = 0; i < P.notch.length; i++) {
    const q = P.notch[i], dx = q.be - q.ae, dz = q.bn - q.an, L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
    const t = ((e - q.ae) * dx + (n - q.an) * dz) / L2, d = t * L;
    if (d < SIGHT_NOTCH.from || d > L - 4) continue;
    const off = Math.abs((e - q.ae) * dz - (n - q.an) * dx) / L;
    if (off > SIGHT_NOTCH.half + SIGHT_NOTCH.ease) continue;
    const cap = q.ay + (q.by - q.ay) * t - SIGHT_NOTCH.margin;
    if (out > cap) out += (cap - out) * (1 - ss(SIGHT_NOTCH.half, SIGHT_NOTCH.half + SIGHT_NOTCH.ease, off)) * ss(SIGHT_NOTCH.from, SIGHT_NOTCH.from + 4, d);
  }
  return out;
}
