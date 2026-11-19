/**
 * IN4 at blockout (M2 wave 1, area C), browser-free:  node --test tools/instruments/blockout.test.mjs
 * Each blockout's size against bible §7.4's roster within 0.1 m (from the parts and from the built GLB's r5Size), its
 * declared class, and its triangles and draws inside its class's cap and the Holds' budget (docs/STATE.md M2 wave 0:
 * a large hull <= 80 k triangles and <= 36 draws, a medium one <= 50 k).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROSTER, boundsOf, FORMS } from '../../src/instruments/lib/blockout.js';
import { CLASS_CAPS } from '../../src/instruments/lib/sizeclass.js';
import { inspectGlb } from '../tier0/lib/glb.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GLB = { screed: 'screed.glb', sickle: 'sickle.glb', tiller: 'tiller-blockout.glb' };
const DRAWS = { large: 36, medium: 36 };

test('IN4: the blockouts stand at the roster sizes (+-0.1 m), in their classes, inside the caps and the Holds budget', () => {
  const out = {};
  for (const kind of Object.keys(GLB)) {
    const R = ROSTER[kind], b = boundsOf(kind, kind === 'tiller' ? FORMS.tiller.chosen : null);
    const buf = fs.readFileSync(path.join(ROOT, 'public/models/instruments', GLB[kind]));
    const g = inspectGlb(buf);
    const len = buf.readUInt32LE(12), j = JSON.parse(buf.slice(20, 20 + len).toString());
    const sz = j.asset.extras.r5Size;   // [x (width), y (height), z (length)]
    out[kind] = { cls: R.cls, size: sz, tris: g.triangles, draws: g.draws };
    for (const [got, want, what] of [[b.size[0], R.W, 'W'], [b.size[1], R.H, 'H'], [b.size[2], R.L, 'L'], [sz[0], R.W, 'glb W'], [sz[1], R.H, 'glb H'], [sz[2], R.L, 'glb L']]) {
      assert.ok(Math.abs(got - want) <= 0.1 + 1e-9, `${kind} ${what} ${got} vs ${want}`);
    }
    assert.ok(g.triangles <= CLASS_CAPS[R.cls].triangles, `${kind} ${g.triangles} triangles`);
    assert.ok(g.draws <= DRAWS[R.cls], `${kind} ${g.draws} draws`);
  }
  console.log(JSON.stringify(out));
});
