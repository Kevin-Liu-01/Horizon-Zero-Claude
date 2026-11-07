/**
 * CALIMA — recipe: Pan Whites III, Brine-Cured (armory W1; bible §4.2): variant I with
 * its linen stiffened by salt crust on the hems (`_SALT` per vertex, read by
 * src/hero/clothShader.js: crust grows up from each hem, broken by the cloth detail) +
 * celadon ceramic shoulder scutes salvaged from Gauge floats (rigid on the clavicles,
 * never the upper arm) + crusted shin guards (rigid on the calves). Shares the Pan sheet.
 */
import { panVariant } from './lib/panvariant.mjs';
import { drapeInto, rigid, skirtPanels } from './lib/garment.mjs';
import { Field, emptyPart, mix, sstep, V } from './lib/part.mjs';
import { ROOT } from '../lib/face.mjs';

export const LANE = 'armory';
export const OUTPUTS = ['public/models/armory/armor-pan-3.glb'];
const RECIPE = 'tools/build/recipes/armor/pan-3.mjs';

export async function build({ out = ROOT } = {}) {
  return panVariant({
    out, file: OUTPUTS[0], recipe: RECIPE, variant: 'pan-3', name: 'Pan Whites III — Brine-Cured', pieces: ['scutes', 'shin guards', 'brine-stiffened hem band', 'salt hems'],
    salt: (p, x, y) => {
      switch (p.slot) {
        case 'skirt': return sstep(0.90, 0.74, y) * 0.86;
        case 'under': return 0.92;
        case 'trousers': return sstep(0.6, 0.45, y) * 0.62;
        case 'boots': return sstep(0.13, 0.02, y) * 0.56;
        case 'sleeves': return sstep(0.33, 0.41, Math.abs(x)) * 0.72;
        case 'cuffs': return 0.8;
        case 'smock': return sstep(1.46, 1.52, y) * 0.5;
        case 'sash': return 0.6;
        case 'crusthem': return 0.95;
        default: return 0;
      }
    },
    add: addPieces,
  });
}

/** Pan III's pieces on Pan I's base (exported for the offline checks). */
export const addPieces = async (base) => {
      const { trim, J, bodyPart } = base;
      const surf = new Field(base.parts.filter((q) => q.slot === 'smock' || q.slot === 'sling' || q.slot === 'sleeves'), 0.04);
      const scutes = emptyPart('scutes', { trim: true });
      const rc = trim.rect('celadon');
      // FIX ROUND 1 (judges: "at 20 m Pan III has Pan I's silhouette, separated only by a whiter hem and two jade
      // dots"): the scutes are a SHOULDER now. Three tiles a side, each larger and standing further off than the one
      // inside it: the two inner ones rigid on the clavicle (bible: pauldrons sit on the clavicle), the outer one a
      // flared lame that stands 3 cm off the deltoid, past the shoulder line. Like a real pauldron's lames they are
      // articulated: each takes a share of its upper arm (12 / 30 / 50 %, the same for every vertex of a tile, so each
      // stays a rigid plate), so a raised bow or draw arm lifts them instead of rising 2-4 cm through them
      for (const side of [1, -1]) {
        const jc = J(side > 0 ? 'clavicle_l' : 'clavicle_r'), ju = J(side > 0 ? 'upperarm_l' : 'upperarm_r');
        const TILES = [
          { x0: 0.136, x1: 0.192, r0: 0.062, r1: 0.066, arc: 0.92, drop: 0.004, m0: 0.013, m1: 0.018, arm: 0.12 },
          { x0: 0.170, x1: 0.236, r0: 0.068, r1: 0.076, arc: 1.0, drop: 0.012, m0: 0.016, m1: 0.024, arm: 0.3 },
          { x0: 0.212, x1: 0.300, r0: 0.074, r1: 0.094, arc: 1.06, drop: 0.034, m0: 0.019, m1: 0.034, arm: 0.5 },
        ];
        TILES.forEach((T, i) => {
          const COLS = 6;
          const inner = [], outer = [];
          for (let c = 0; c <= COLS; c++) {
            const u = 2 * c / COLS - 1, round = 1 - 0.45 * u ** 4;
            // around the shoulder's top, front to back; the front reach is two thirds of the back's (fix round 1: the
            // lance's thrust brings the deltoid's front up through a plate's front edge)
            const a = T.arc * u * (u > 0 ? 0.66 : 1);
            const yy = 1.464 - i * 0.005, zc = -0.03;
            inner.push([side * T.x0, yy - T.r0 * (1 - Math.cos(a)), zc + T.r0 * Math.sin(a)]);
            const r = T.r1 * (0.92 + 0.08 * round);
            outer.push([side * (T.x0 + (T.x1 - T.x0) * round), yy - r * (1 - Math.cos(a)) - T.drop * round, zc + r * Math.sin(a)]);
          }
          // each tile takes ONE share of the upper arm, all of it alike, so it stays a rigid plate (no stretch)
          const skin = T.arm > 0 ? () => ({ j: [jc, ju, 0, 0], w: [1 - T.arm, T.arm, 0, 0] }) : rigid(jc);
          drapeInto(scutes, surf, inner, outer, {
            rows: 2, margin: T.m0, marginAt: (t) => mix(T.m0, T.m1, t),
            uvOf: (t, c) => [rc[0] + rc[2] * c, rc[1] + rc[3] * t],
            skinOf: skin,
          });
        });
      }
      scutes.pieceBit = 1;          // the gates' "shoulder piece" bit; never hidden
      // shin guards: crusted plates over the esparto. Fix round 1: they change the leg's outline (they read in black
      // fill): wider round the shin, standing 2.5 cm off it, their top flared out under the knee like a greave's
      const guards = emptyPart('guards', { trim: true });
      const bootF = new Field(base.parts.filter((q) => q.slot === 'boots' || q.slot === 'straps'), 0.03);
      const rg = trim.rect('crust');
      for (const side of [1, -1]) {
        const cx = side * 0.111, cz = -0.06;
        const COLS = 7;
        const inner = [], outer = [];
        for (let c = 0; c <= COLS; c++) {
          const a = Math.PI / 2 - 1.2 + 2.4 * (c / COLS);
          inner.push([cx + Math.cos(a) * 0.084, 0.448, cz + Math.sin(a) * 0.1]);
          outer.push([cx + Math.cos(a) * 0.064, 0.17, cz + Math.sin(a) * 0.09]);
        }
        drapeInto(guards, bootF, inner, outer, {
          rows: 4, margin: 0.022, marginAt: (t) => mix(0.03, 0.019, t),
          uvOf: (t, c) => [rg[0] + rg[2] * c, rg[1] + rg[3] * t],
          skinOf: rigid(J(side > 0 ? 'calf_l' : 'calf_r')),
        });
      }
      // FIX ROUND 1, the third added piece (bible §4.1: <= 3): a brine-stiffened hem band. Salt-crusted linen lapped
      // over the skirt's hem and hanging 13 cm below it, so at 20 m Pan III's skirt reaches the knee where Pan I's stops
      // above it: a silhouette, not only a paler hem. Four panels on the skirt's own slits, ridden like the hem it laps
      // (the thigh's share of the skirt's last row), on the sheet's crust cell
      const skirtF = new Field(base.parts.filter((q) => q.slot === 'skirt'), 0.04);
      const slits = [-Math.PI / 2, 0.02, Math.PI / 2, Math.PI - 0.02];
      const hems = skirtPanels((slot) => emptyPart(slot, { trim: true }), skirtF, base.joints, {
        slot: 'crusthem', yTop: 0.79, yHem: 0.618, off: 0.007, flare: 0.05, slits, rows: 2, colsPer: 12, ripA: 0.003, seed: 21,
        floorY: 0.762, overlap: 0.05, weightY: () => 0.92, lip: 0.003,
        hem: (th, y0) => y0 + 0.014 * Math.pow(Math.abs(Math.sin(th)), 3) + 0.006 * Math.cos(5 * th + 0.4),
      });
      for (const h of hems) {
        // the panels' metric uv onto the crust cell (mirrored along the hem, down the band)
        for (let i = 0; i < h.uv.length; i += 2) {
          const f = h.uv[i] / 0.12, tri = Math.abs((f % 2) - 1);
          h.uv[i] = rg[0] + rg[2] * tri; h.uv[i + 1] = rg[1] + rg[3] * Math.min(1, Math.max(0, h.uv[i + 1] / 0.19));
        }
      }
      void V;
      return [scutes, guards, ...hems];
};
