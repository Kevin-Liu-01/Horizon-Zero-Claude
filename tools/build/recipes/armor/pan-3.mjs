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
        case 'crusthem': return sstep(0.74, 0.63, y) * 0.75 + 0.15;
        default: return 0;
      }
    },
    add: addPieces,
  });
}

/** Pan III's pieces on Pan I's base (exported for the offline checks). */
export const addPieces = async (base) => {
      const { trim, J, bodyPart } = base;
      const surf = new Field(base.parts.filter((q) => q.slot === 'smock' || q.slot === 'sling' || q.slot === 'harness' || q.slot === 'sleeves' || q.slot === 'armband'), 0.04);
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
        // (W1 exit, judges: "weighted to the upper arm, against bible §4.1/§4.2: a constant two-bone blend is not rigid
        // when the bones turn apart"): every tile is RIGID on its clavicle again. The clearance a raised arm needs comes
        // from the shape: each lame stands further off the deltoid the further out it lies (2.0 / 3.2 / 4.6 cm at its
        // outer edge), so the shrug of a full draw rises under them, not through them, and the mantle is broad enough to
        // change her shoulder line in black fill
        const TILES = [
          { x0: 0.088, x1: 0.158, r0: 0.07, r1: 0.084, arc: 1.3, drop: 0.004, m0: 0.012, m1: 0.016, arm: 0 },
          { x0: 0.132, x1: 0.2, r0: 0.074, r1: 0.09, arc: 1.22, drop: 0.012, m0: 0.016, m1: 0.026, arm: 0 },
          { x0: 0.172, x1: 0.236, r0: 0.08, r1: 0.096, arc: 1.12, drop: 0.026, m0: 0.022, m1: 0.04, arm: 0 },
        ];
        TILES.forEach((T, i) => {
          const COLS = 6;
          const inner = [], outer = [];
          for (let c = 0; c <= COLS; c++) {
            const u = 2 * c / COLS - 1, round = 1 - 0.45 * u ** 4;
            // around the shoulder's top, front to back; the front reach is two thirds of the back's (fix round 1: the
            // lance's thrust brings the deltoid's front up through a plate's front edge)
            const a = T.arc * u * (u > 0 ? 0.66 : i === 2 ? 0.7 : 1);   // (the outer lame's back reach too: the heavy swung it into the stowed bow)
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
      const rl = trim.rect('linen');
      for (const side of [1, -1]) {
        const cx = side * 0.111, cz = -0.06;
        const COLS = 7;
        const inner = [], outer = [];
        for (let c = 0; c <= COLS; c++) {
          const a = Math.PI / 2 - 1.2 + 2.4 * (c / COLS);
          // (W1 exit: up to the knee, the board's "bronze knee and shin plates": the plate's top flares over the kneecap)
          inner.push([cx + Math.cos(a) * 0.092, 0.488, cz + Math.sin(a) * 0.112]);
          outer.push([cx + Math.cos(a) * 0.064, 0.17, cz + Math.sin(a) * 0.09]);
        }
        drapeInto(guards, bootF, inner, outer, {
          rows: 3, margin: 0.022, marginAt: (t) => mix(0.036, 0.019, t),
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
        // (W1 exit, judges: "the hem band reads as fleece or fur trim", "flares as a stiff white plank off the left thigh"):
        // it is linen stiffened by brine, hanging as cloth: soft folds of its own, four rows, the skirt's thigh share easing
        // in down its length as the hem it laps does, on the sheet's linen cell (the crust is the `_SALT` the shader grows)
        slot: 'crusthem', yTop: 0.79, yHem: 0.622, off: 0.006, flare: 0.03, slits, rows: 3, colsPer: 12, ripA: 0.0075, seed: 21,
        floorY: 0.762, overlap: 0.05, weightY: (y) => 0.86 + 0.06 * Math.min(1, Math.max(0, (0.76 - y) / 0.14)), lip: 0.003,
        hem: (th, y0) => y0 + 0.014 * Math.pow(Math.abs(Math.sin(th)), 3) + 0.006 * Math.cos(5 * th + 0.4),
      });
      for (const h of hems) {
        // the panels' metric uv onto the linen cell (mirrored along the hem, down the band)
        for (let i = 0; i < h.uv.length; i += 2) {
          const f = h.uv[i] / 0.12, tri = Math.abs((f % 2) - 1);
          h.uv[i] = rl[0] + rl[2] * tri; h.uv[i + 1] = rl[1] + rl[3] * Math.min(1, Math.max(0, h.uv[i + 1] / 0.19));
        }
      }
      void V;
      return [scutes, guards, ...hems];
};
