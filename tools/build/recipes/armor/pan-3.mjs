/**
 * CALIMA — recipe: Pan Whites III, Brine-Cured (armory W1; bible §4.2): variant I with
 * its linen stiffened by salt crust on the hems (`_SALT` per vertex, read by
 * src/hero/clothShader.js: crust grows up from each hem, broken by the cloth detail) +
 * celadon ceramic shoulder scutes salvaged from Gauge floats (rigid on the clavicles,
 * never the upper arm) + crusted shin guards (rigid on the calves). Shares the Pan sheet.
 */
import { panVariant } from './lib/panvariant.mjs';
import { drapeInto, rigid } from './lib/garment.mjs';
import { Field, emptyPart, mix, sstep, V } from './lib/part.mjs';
import { ROOT } from '../lib/face.mjs';

export const LANE = 'armory';
export const OUTPUTS = ['public/models/armory/armor-pan-3.glb'];
const RECIPE = 'tools/build/recipes/armor/pan-3.mjs';

export async function build({ out = ROOT } = {}) {
  return panVariant({
    out, file: OUTPUTS[0], recipe: RECIPE, variant: 'pan-3', name: 'Pan Whites III — Brine-Cured', pieces: ['scutes', 'shin guards', 'salt hems'],
    salt: (p, x, y) => {
      switch (p.slot) {
        case 'skirt': return sstep(0.90, 0.74, y) * 0.86;
        case 'under': return 0.92;
        case 'trousers': return sstep(0.6, 0.45, y) * 0.62;
        case 'boots': return sstep(0.2, 0.03, y) * 0.66;
        case 'sleeves': return sstep(0.33, 0.41, Math.abs(x)) * 0.72;
        case 'cuffs': return 0.8;
        case 'smock': return sstep(1.46, 1.52, y) * 0.5;
        case 'sash': return 0.6;
        default: return 0;
      }
    },
    add: async (base) => {
      const { trim, J, bodyPart } = base;
      const surf = new Field(base.parts.filter((q) => q.slot === 'smock' || q.slot === 'sling' || q.slot === 'sleeves'), 0.04);
      const scutes = emptyPart('scutes', { trim: true });
      const rc = trim.rect('celadon');
      for (const side of [1, -1]) {
        const j = J(side > 0 ? 'clavicle_l' : 'clavicle_r');
        // four tiles along the shoulder, the outer lapping the inner, each a curved plate
        for (let i = 0; i < 4; i++) {
          const x0 = 0.103 + i * 0.036, x1 = x0 + 0.052;
          const COLS = 5;
          const inner = [], outer = [];
          for (let c = 0; c <= COLS; c++) {
            const a = -1.05 + 2.1 * (c / COLS);       // around the shoulder's top, front to back
            const yy = 1.47 - i * 0.004, r = 0.062 - i * 0.002;
            const zc = -0.03;
            inner.push([side * x0, yy - r * (1 - Math.cos(a)), zc + r * Math.sin(a)]);
            outer.push([side * x1, yy - r * (1 - Math.cos(a)) - 0.008, zc + (r + 0.004) * Math.sin(a)]);
          }
          drapeInto(scutes, surf, inner, outer, {
            rows: 2, margin: 0.012, marginAt: (t) => mix(0.011, 0.017, t) + i * 0.0012,
            uvOf: (t, c) => [rc[0] + rc[2] * c, rc[1] + rc[3] * t],
            skinOf: rigid(j),
          });
        }
      }
      scutes.pieceBit = 1;          // the gates' "shoulder piece" bit; never hidden
      // shin guards: crusted plates over the esparto
      const guards = emptyPart('guards', { trim: true });
      const bootF = new Field(base.parts.filter((q) => q.slot === 'boots' || q.slot === 'straps'), 0.03);
      const rg = trim.rect('crust');
      for (const side of [1, -1]) {
        const cx = side * 0.111, cz = -0.06;
        const COLS = 6;
        const inner = [], outer = [];
        for (let c = 0; c <= COLS; c++) {
          const a = Math.PI / 2 - 0.95 + 1.9 * (c / COLS);
          inner.push([cx + Math.cos(a) * 0.075, 0.442, cz + Math.sin(a) * 0.092]);
          outer.push([cx + Math.cos(a) * 0.062, 0.175, cz + Math.sin(a) * 0.09]);
        }
        drapeInto(guards, bootF, inner, outer, {
          rows: 4, margin: 0.017,
          uvOf: (t, c) => [rg[0] + rg[2] * c, rg[1] + rg[3] * t],
          skinOf: rigid(J(side > 0 ? 'calf_l' : 'calf_r')),
        });
      }
      void V;
      return [scutes, guards];
    },
  });
}
