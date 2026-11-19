/**
 * NINEWALLS' WALK IN: the road's centreline, generated from the island recipe's natural ground (M2 wave 2, area B; no
 * Chrome, no three). The output is the `ROAD` table of src/world/settlements/ninewalls-layout.js: paste it there.
 *
 *   node tools/build/settlements/ninewalls-road.mjs [--grade 0.24] [--print]
 *
 * Why a road. The village stands on a knob 60-70 m above the Pans; its west and south-west faces fall at 30-37 deg
 * (tools/build/settlements/ninewalls-rows.mjs NW0 prints them). At the M2 wave 1 review the first-hour run's walk to
 * Ninewalls (leg 2) went straight up the west face along the nav grid and timed out 62 m short. The bible's walk from
 * Saltrow to the Holds is 256 m with about 60 m of climb: a graded way.
 *
 * How. A contour-following switchback on the west face: the road climbs at a fixed grade, and at every step it sits
 * where the natural ground is at its own height (a root find across the face, which rises to the east), so it is a
 * bench with almost no cut or fill. Its legs run north and south between two rows (Z_LO, Z_HI); each turn is a hairpin
 * bent upslope (east). The last leg runs into the village's open south-west, between the dwellings of the outer ring,
 * to the cistern's lane. Deterministic: the recipe is.
 */
import { heightAt as islandHeight } from '../../../src/world/island/recipe.js';
import { ninewallsNatural } from '../../../src/world/settlements/ninewalls-ground.js';

/** The ground the road is fitted to: the island before Ninewalls' own ground (the road is part of it). */
const heightAt = (x, z) => { islandHeight(x, z); return ninewallsNatural(x, z) || islandHeight(x, z); };

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
/** The road's grade (rise over run): 0.24 is 13.5 deg; her uphill pace there is about 0.75 of the flat (player.js _gradeScale). */
export const GRADE = Number(flag('--grade', 0.24));
/** Where it starts (engine x, z): the foot of the west face, on the Pans' edge, 150 m east of Saltrow's cistern. */
export const START = Object.freeze({ x: -112, z: 244 });
/** The rows the legs turn at (engine z), the hairpin's radius (m) and the height the road stops at (m). */
export const Z_LO = 200, Z_HI = 246, HAIRPIN_R = 4.5, H_END = 65.3;

/** x on row z where the natural ground stands at height h, searched within 25 m of x0 (the face rises to the east). */
function xAt(z, h, x0) {
  let a = x0 - 25, b = x0 + 25;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (heightAt(m, z) < h) a = m; else b = m; }
  return (a + b) / 2;
}

/** The road's centreline: [[x, z, h], ...] about every metre, and its stats. */
export function generate() {
  let z = START.z, h = heightAt(START.x, START.z), x = xAt(z, h, START.x), dir = -1;
  const pts = [[x, z, h]];
  let turns = 0;
  while (h < H_END && pts.length < 4000) {
    const z2 = z + dir;
    let x2 = x, h2 = h;
    for (let it = 0; it < 6; it++) { h2 = h + GRADE * Math.hypot(z2 - z, x2 - x); x2 = xAt(z2, h2, x); }
    x = x2; z = z2; h = h2; pts.push([x, z, h]);
    if ((dir < 0 && z <= Z_LO) || (dir > 0 && z >= Z_HI)) {
      const cx = x + HAIRPIN_R, cz = z;
      turns++;
      for (let k = 1; k <= 12; k++) {
        const a = Math.PI * k / 12, px = cx - HAIRPIN_R * Math.cos(a), pz = cz + dir * HAIRPIN_R * Math.sin(a) * 0.6;
        h += GRADE * Math.hypot(px - pts.at(-1)[0], pz - pts.at(-1)[1]);
        pts.push([px, pz, h]);
      }
      x = pts.at(-1)[0]; z = pts.at(-1)[1]; dir = -dir;
    }
  }
  return { pts, turns };
}

/** Thin a centreline to points at most `step` m apart where it runs straight, every point where it bends. */
export function thin(pts, step = 3) {
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const t1 = Math.atan2(b[0] - a[0], b[1] - a[1]), t2 = Math.atan2(c[0] - b[0], c[1] - b[1]);
    const turn = Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1)));
    if (acc >= step || turn > 0.12) { out.push(b); acc = 0; }
  }
  out.push(pts.at(-1));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { pts, turns } = generate();
  const T = thin(pts);
  let L = 0, cut = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  for (const p of pts) cut = Math.max(cut, Math.abs(heightAt(p[0], p[1]) - p[2]));
  console.error(`road: ${turns} hairpins, ${L.toFixed(1)} m at grade ${GRADE} (${(Math.atan(GRADE) * 180 / Math.PI).toFixed(1)} deg), ${T.length} points, worst cut or fill ${cut.toFixed(2)} m, from (${T[0].map((v) => v.toFixed(1))}) to (${T.at(-1).map((v) => v.toFixed(1))})`);
  if (args.includes('--print') || true) console.log(`export const ROAD = Object.freeze([\n${T.map((p) => `  [${p.map((v) => +v.toFixed(2)).join(', ')}]`).join(',\n')},\n].map((p) => Object.freeze(p)));`);
}
