/**
 * M3 wave 1, area C: the four grey forms in one table, and the geometry every reader of them shares (the grey recipe
 * tools/build/instruments/gen-m3-blockout.mjs, the line-up page ./lineup.js, the Node rows ./*.test.mjs). Imports
 * only the kinds' own form modules, so it loads in Node and in the page alike.
 *
 *   M3_FORMS[kind]            { roster, parts, lamp, hit }
 *   expandParts(parts)        a torus becomes TORUS_SEGS struts (both builders draw exactly these)
 *   boundsOf(parts)           { min, max, size } in the body frame (every part, every strut's radius)
 */
import { KILN_ROSTER, KILN_PARTS, KILN_LAMP, KILN_HIT } from '../../../../src/instruments/kinds/kiln/form.js';
import { SPINDLE_ROSTER, SPINDLE_PARTS, SPINDLE_LAMP, SPINDLE_HIT } from '../../../../src/instruments/kinds/spindle/form.js';
import { DAVIT_ROSTER, DAVIT_PARTS, DAVIT_LAMP, DAVIT_HIT } from '../../../../src/instruments/kinds/davit/form.js';
import { SONDE_ROSTER, SONDE_PARTS, SONDE_LAMP, SONDE_HIT } from '../../../../src/instruments/kinds/sonde/form.js';

export const M3_FORMS = Object.freeze({
  kiln: Object.freeze({ roster: KILN_ROSTER, parts: KILN_PARTS, lamp: KILN_LAMP, hit: KILN_HIT }),
  spindle: Object.freeze({ roster: SPINDLE_ROSTER, parts: SPINDLE_PARTS, lamp: SPINDLE_LAMP, hit: SPINDLE_HIT }),
  davit: Object.freeze({ roster: DAVIT_ROSTER, parts: DAVIT_PARTS, lamp: DAVIT_LAMP, hit: DAVIT_HIT }),
  sonde: Object.freeze({ roster: SONDE_ROSTER, parts: SONDE_PARTS, lamp: SONDE_LAMP, hit: SONDE_HIT }),
});
export const M3_KINDS = Object.freeze(['kiln', 'spindle', 'davit', 'sonde']);

export const TORUS_SEGS = 28;

/** A part's axis unit vector. */
const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** Every part with each torus replaced by its struts (centre-line polygon, radius `tube`). */
export function expandParts(parts) {
  const out = [];
  for (const p of parts) {
    if (p.type !== 'torus') { out.push(p); continue; }
    const [cx, cy, cz] = p.c;
    const pt = (a) => {
      const u = Math.cos(a) * p.R, v = Math.sin(a) * p.R;
      if (p.axis === 'z') return [cx + u, cy + v, cz];
      if (p.axis === 'x') return [cx, cy + v, cz + u];
      return [cx + u, cy, cz + v];
    };
    for (let i = 0; i < TORUS_SEGS; i++) {
      out.push({ ...p, name: `${p.name}#${i}`, type: 'strut', a: pt((i / TORUS_SEGS) * Math.PI * 2), b: pt(((i + 1) / TORUS_SEGS) * Math.PI * 2), r: p.tube, of: p.name });
    }
  }
  return out;
}

/** Axis-aligned bounds of the parts (body frame). A torus is graded on its exact ring, not its polygon. */
export function boundsOf(parts) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  const grow = (x, y, z) => { mn[0] = Math.min(mn[0], x); mn[1] = Math.min(mn[1], y); mn[2] = Math.min(mn[2], z); mx[0] = Math.max(mx[0], x); mx[1] = Math.max(mx[1], y); mx[2] = Math.max(mx[2], z); };
  for (const p of parts) {
    if (p.type === 'box') {
      const h = p.s.map((v) => v / 2);
      grow(p.c[0] - h[0], p.c[1] - h[1], p.c[2] - h[2]); grow(p.c[0] + h[0], p.c[1] + h[1], p.c[2] + h[2]);
    } else if (p.type === 'cyl') {
      const r = Math.max(p.r, p.r2 ?? p.r), a = AX[p.axis || 'y'], hh = p.h / 2;
      const e = [0, 1, 2].map((k) => (a[k] ? hh : r));
      grow(p.c[0] - e[0], p.c[1] - e[1], p.c[2] - e[2]); grow(p.c[0] + e[0], p.c[1] + e[1], p.c[2] + e[2]);
    } else if (p.type === 'strut') {
      // a round bar's end disc reaches r * sqrt(1 - d_k^2) along axis k (d the bar's unit direction): exact for the
      // round bar, and within r(1 - cos(pi / sides)) of the builders' polygons (rule 21: the page and Node agree)
      const d = [p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]], L = Math.hypot(...d) || 1;
      const e = d.map((v) => p.r * Math.sqrt(Math.max(0, 1 - (v / L) ** 2)));
      for (const q of [p.a, p.b]) { grow(q[0] - e[0], q[1] - e[1], q[2] - e[2]); grow(q[0] + e[0], q[1] + e[1], q[2] + e[2]); }
    } else if (p.type === 'torus') {
      const o = p.R + p.tube, a = AX[p.axis || 'y'];
      const e = [0, 1, 2].map((k) => (a[k] ? p.tube : o));
      grow(p.c[0] - e[0], p.c[1] - e[1], p.c[2] - e[2]); grow(p.c[0] + e[0], p.c[1] + e[1], p.c[2] + e[2]);
    }
  }
  return { min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
}

/** The lamp part of a form (exactly one per kind). */
export const lampsOf = (parts) => parts.filter((p) => p.lamp);
