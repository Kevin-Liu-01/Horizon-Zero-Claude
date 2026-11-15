/**
 * M1a r2 fix (hero-anim) — what the cloth wrap pass found on the dressed bench: its sets (outfit panels, wrap tails),
 * capsules and radii, and its stats after a short crouch. A diagnostic, not a gate.
 *
 *   node tools/gates/hero-sweep/wrap-info.mjs
 */
import { makeBench, step, reset } from './bench.mjs';

const R = await makeBench();
reset(R);
R.player.crouching = true;
let left = 0, frames = 0, deep = 0;
for (let i = 0; i < 120; i++) { step(R); const w = R.an.clothWrapInfo?.(); if (w) { frames++; if (w.left) left++; deep = Math.max(deep, w.deepLeft || 0); } }
const info = R.an.clothWrapInfo?.();
console.log(JSON.stringify({ sets: info?.sets, caps: info?.caps, crouch: { frames, framesLeft: left, deepLeft: +deep.toFixed(4) } }));
let outfit = null;
R.model.traverse((o) => { if (o.isSkinnedMesh && /outfit/.test(o.userData?.heroPart || '')) outfit = outfit || o; });
if (outfit) {
  const bn = outfit.skeleton.bones.map((b) => b.name).filter((n) => /panel/.test(n));
  console.log('outfit', outfit.name, 'verts', outfit.geometry.attributes.position.count, 'panel bones', bn.join(','));
}
