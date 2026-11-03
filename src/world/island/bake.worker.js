/**
 * The terrain pool's worker (world-ground W1; plan §8.3 pool-terrain-build). A thin
 * message shell over the pure jobs in bake.js, scatter.js and the layer decoder: nothing
 * of the recipe is written here, which is what makes the pool byte-identical to the
 * single-thread build.
 */
import { ensureMacro } from './recipe.js';
import { bakeHeights, bakeShade, bakeMasks, bakePan } from './bake.js';
import { decodeLayer } from './layers.js';

let H = null;

self.onmessage = async (ev) => {
  const m = ev.data;
  try {
    if (m.op === 'macro') {
      ensureMacro(m.macro);
      self.postMessage({ id: m.id });
    } else if (m.op === 'heights') {
      const out = bakeHeights(m.r0, m.r1);
      self.postMessage({ id: m.id, out }, [out.buffer]);
    } else if (m.op === 'fields') {
      H = m.H;
      self.postMessage({ id: m.id });
    } else if (m.op === 'shade') {
      const { normals, tint } = bakeShade(H, m.r0, m.r1);
      self.postMessage({ id: m.id, out: [normals, tint] }, [normals.buffer, tint.buffer]);
    } else if (m.op === 'masks') {
      const out = bakeMasks(H, m.r0, m.r1);
      self.postMessage({ id: m.id, out }, out.map((d) => d.buffer));
    } else if (m.op === 'pan') {
      const out = bakePan();
      self.postMessage({ id: m.id, out }, [out.buffer]);
    } else if (m.op === 'layer') {
      const out = await decodeLayer(m.url);
      self.postMessage({ id: m.id, out }, [out.buffer]);
    } else {
      self.postMessage({ id: m.id, error: `unknown op ${m.op}` });
    }
  } catch (err) {
    self.postMessage({ id: m.id, error: String((err && err.stack) || err) });
  }
};
