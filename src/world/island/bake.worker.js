/**
 * The terrain pool's worker (world-ground W1; plan §8.3 pool-terrain-build). A thin
 * message shell over the pure jobs in bake.js, scatter.js and the layer decoder: nothing
 * of the recipe is written here, which is what makes the pool byte-identical to the
 * single-thread build.
 */
import { ensureMacro } from './recipe.js';
import { bakeHeights, bakeShade, bakeMasks, bakePan, bakeSkyline } from './bake.js';
import { decodeLayer } from './layers.js';
import { KINDS, fieldReader, scatterRows, scatterStatic } from './scatter.js';

let H = null;
let F = null;

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
    } else if (m.op === 'skyline') {
      const out = bakeSkyline(H, m.r0, m.r1);
      self.postMessage({ id: m.id, out }, out.map((d) => d.buffer));
    } else if (m.op === 'pan') {
      const out = bakePan();
      self.postMessage({ id: m.id, out }, [out.buffer]);
    } else if (m.op === 'masksIn') {
      F = { H, maskA: m.maskA, maskB: m.maskB, shore: m.shore };
      self.postMessage({ id: m.id });
    } else if (m.op === 'scatterRows') {
      const out = scatterRows(F, m.tz0, m.tz1);
      const xfer = [];
      for (const k of Object.keys(KINDS)) xfer.push(out[k].rec.buffer, out[k].counts.buffer);
      self.postMessage({ id: m.id, out }, xfer);
    } else if (m.op === 'scatterStatic') {
      const out = scatterStatic(fieldReader(F));
      self.postMessage({ id: m.id, out }, Object.values(out).map((a) => a.buffer));
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
