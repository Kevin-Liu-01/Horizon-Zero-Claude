/**
 * CALIMA — recipe: Pan Whites II, Guild Whites (armory W1; bible §4.2): variant I +
 * a woven-palm wide hat (0.42 m brim) that flips to a back socket in combat (every
 * copy in the merged mesh, `_PIECE` 32 on her head, 64 on her back over the stowed bow,
 * 128 on her back with the bow in her hand: 0 extra draws)
 * + an orchil capelet with a brass guild clasp. Geometry only: shares the Pan sheet.
 */
import { panVariant } from './lib/panvariant.mjs';
import { drapeInto, orientOut, rigid, TAU } from './lib/garment.mjs';
import { emptyPart, Field, V, mix } from './lib/part.mjs';
import { ROOT } from '../lib/face.mjs';

export const LANE = 'armory';
export const OUTPUTS = ['public/models/armory/armor-pan-2.glb'];
const RECIPE = 'tools/build/recipes/armor/pan-2.mjs';
export const HAT_ON_HEAD = 32, HAT_ON_BACK = 64, HAT_ON_BACK_LOW = 128;
export const HAT = { brimR: 0.21, brimY: 1.722, tiltX: -0.10, crown: 0.105, topY: 0.178 };

/** The hat, local: brim plane y = 0, crown up. Two faces come from the double-sided material. */
function hatInto(part, X, Y, Z, T, rect, joint, bit) {
  const SIDES = 16;
  // [radius, y]: brim edge rolled, brim, crown base, crown shoulder, a flat woven top
  const prof = [[HAT.brimR, -0.012], [HAT.brimR - 0.004, -0.004], [HAT.brimR - 0.05, 0.006], [HAT.crown + 0.012, 0.016], [HAT.crown, 0.04], [HAT.crown * 0.92, 0.10], [HAT.crown * 0.62, 0.155], [0.0005, HAT.topY]];
  const base = part.pos.length / 3;
  for (let r = 0; r < prof.length; r++) for (let k = 0; k <= SIDES; k++) {
    const th = (k / SIDES) * TAU;
    const [rr, y] = prof[r];
    const wob = 1 + 0.018 * Math.sin(th * 3 + 0.7) * (r < 3 ? 1 : 0.3);
    const lx = Math.cos(th) * rr * wob, lz = Math.sin(th) * rr * wob;
    part.pos.push(T[0] + X[0] * lx + Y[0] * y + Z[0] * lz, T[1] + X[1] * lx + Y[1] * y + Z[1] * lz, T[2] + X[2] * lx + Y[2] * y + Z[2] * lz);
    part.nrm.push(0, 1, 0);
    // the weave repeats: 4 tiles round, one per ring
    part.uv.push(rect[0] + rect[2] * Math.abs(((k / SIDES) * 6) % 2 - 1), rect[1] + rect[3] * (r % 2));
    part.jnt.push(joint, 0, 0, 0); part.wgt.push(1, 0, 0, 0);
  }
  const cc = SIDES + 1;
  for (let r = 0; r < prof.length - 1; r++) for (let k = 0; k < SIDES; k++) {
    const a = base + r * cc + k, b = a + 1, d = a + cc, e = d + 1;
    part.idx.push(a, b, d, b, e, d);
  }
  part.pieceBit = bit;
  return part;
}

export async function build({ out = ROOT } = {}) {
  return panVariant({
    out, file: OUTPUTS[0], recipe: RECIPE, variant: 'pan-2', name: 'Pan Whites II — Guild Whites', pieces: ['capelet', 'clasp', 'hat'],
    add: addPieces,
  });
}

/** Pan II's pieces on Pan I's base (exported for the offline checks). */
export const addPieces = async (base) => {
      const { trim, J, bodyPart, clothField } = base;
      const surf = new Field(base.parts.filter((p) => p.slot === 'smock' || p.slot === 'sling'), 0.04);
      const jS3 = J('spine_03'), jCl = J('clavicle_l'), jCr = J('clavicle_r');
      // the capelet: rigid across the shoulders (spine_03 easing onto the clavicles), never on the upper arm
      const cap = emptyPart('capelet', { trim: true });
      const rectC = trim.rect('capelet');
      const COLS = 32;
      const inner = [], outer = [];
      const oOpen = 0.16;          // the front opening, radians either side of +Z, closed by the clasp
      for (let c = 0; c <= COLS; c++) {
        const th = Math.PI / 2 + oOpen + (TAU - 2 * oOpen) * (c / COLS);
        const cx = Math.cos(th), sx = Math.sin(th);
        inner.push([cx * 0.102, 1.462, -0.04 + sx * 0.11]);
        const side = Math.abs(cx);
        const rr = mix(0.135, 0.226, side), yy = mix(1.335, 1.462, Math.pow(side, 1.6));
        outer.push([cx * rr, yy, -0.022 + sx * mix(0.135, 0.1, side)]);
      }
      const skinCap = (p) => {
        const w = Math.min(1, Math.max(0, (Math.abs(p[0]) - 0.05) / 0.09));
        const side = p[0] >= 0 ? jCl : jCr;
        return { j: [jS3, side, 0, 0], w: [1 - w, w, 0, 0] };
      };
      drapeInto(cap, surf, inner, outer, {
        rows: 5, margin: 0.012, marginAt: (t) => mix(0.010, 0.016, t),
        uvOf: (t, c) => [rectC[0] + rectC[2] * c, rectC[1] + rectC[3] * t],
        skinOf: skinCap,
      });
      orientOut(cap, 0, -0.02, 1.2);
      cap.pieceBit = 1;             // the gates' "shoulder piece" bit; never hidden
      // the guild clasp: a brass disc and bar at the opening
      const clasp = emptyPart('clasp', { trim: true });
      const br = trim.rect('brass');
      const ci = 0.5;
      const frontP = surf.nearest(0, 1.43, 0.09, 3)[0].p;
      const c0 = [0, frontP.y + 0.004, frontP.z + 0.02];
      const R = 0.021;
      const base0 = clasp.pos.length / 3;
      clasp.pos.push(...c0); clasp.nrm.push(0, 0, 1); clasp.uv.push(br[0] + br[2] * ci, br[1] + br[3] * ci); clasp.jnt.push(jS3, 0, 0, 0); clasp.wgt.push(1, 0, 0, 0);
      for (let k = 0; k <= 12; k++) {
        const a = (k / 12) * TAU;
        const q = V.add(c0, [Math.cos(a) * R, Math.sin(a) * R, -0.006]);
        clasp.pos.push(...q); clasp.nrm.push(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.85); clasp.uv.push(br[0] + br[2] * (0.5 + 0.5 * Math.cos(a)), br[1] + br[3] * (0.5 + 0.5 * Math.sin(a))); clasp.jnt.push(jS3, 0, 0, 0); clasp.wgt.push(1, 0, 0, 0);
      }
      for (let k = 0; k < 12; k++) clasp.idx.push(base0, base0 + 1 + k, base0 + 2 + k);
      clasp.keepNormals = true;
      // the hat: on her head (rigid `Head`), and its twin hanging behind her shoulders (rigid spine_03)
      const palm = trim.rect('palm');
      const hat1 = hatInto(emptyPart('hat', { trim: true }), [1, 0, 0], V.norm([0, Math.cos(HAT.tiltX), Math.sin(HAT.tiltX)]), V.norm([0, -Math.sin(HAT.tiltX), Math.cos(HAT.tiltX)]), [0, HAT.brimY, -0.02], palm, J('Head'), HAT_ON_HEAD);
      // back socket: crown OUT, on the shoulder-blade the lance leaves free (its diagonal runs from her left hip to
      // her right shoulder). Armory W1: with the LANCE out the bow stays stowed, and its grip (the strung bow's
      // brace, 0.34 m behind the spine) stood 39 mm through the brim. So two copies: lance out, the hat rides OVER
      // the stowed bow (its brim's rolled edge clear of the grip); bow in hand, it lies in close where the bow was,
      // 0.12 m off the stowed lance
      const hat2 = hatInto(emptyPart('hat', { trim: true }), [1, 0, 0], V.norm([0, -0.12, -1]), V.norm([0, 1, -0.12]), [0.15, 1.31, -0.362], palm, jS3, HAT_ON_BACK);
      const hat3 = hatInto(emptyPart('hat', { trim: true }), [1, 0, 0], V.norm([0, -0.12, -1]), V.norm([0, 1, -0.12]), [0.15, 1.31, -0.305], palm, jS3, HAT_ON_BACK_LOW);
      void clothField;
      return [cap, clasp, hat1, hat2, hat3];
};
