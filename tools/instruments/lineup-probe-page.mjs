/**
 * The line-up probe, the page half (lane instruments, M2 wave 2). Run by
 *   node tools/frames/film.mjs --port <p> --only F23-tiller,F23-sickle,F23-screed --lanes --probe /tools/instruments/lineup-probe-page.mjs
 * after each line-up frame is staged and shot (the world frozen):
 *   - the staged Instrument: its kind, state, lamp state, lamp anchor (body and world) and where the lamp system drew
 *     its iris, its world bounds over its ground;
 *   - EVERY lamp the lamp system draws within 12 m of it: its machine's kind, whether that machine is still in the
 *     manager's list (a lamp whose machine is gone is a leaked lamp: wave 1's floating discs), and its drawn position;
 *   - Brea's occlusion fade as the play camera left it before the orbit lens took over (stagings/instruments.mjs
 *     records it, then clears it), and her fade uniform as filmed;
 *   - the sight-occluder slots it publishes.
 */
export async function probe(frame) {
  const kind = { 'F23-tiller': 'tiller', 'F23-sickle': 'sickle', 'F23-screed': 'screed' }[frame?.id];
  if (!kind) return { skipped: 'line-up frames only' };
  const THREE = await import('/tools/look/three.mjs');
  const C = window.__CTX__, M = C.machines, L = M.lamps;
  const list = M.list || [];
  const m = list.filter((x) => x.kind === kind && x.alive).sort((a, b) => {
    const p = C.player.position;
    return Math.hypot(a.position.x - p.x, a.position.z - p.z) - Math.hypot(b.position.x - p.x, b.position.z - p.z);
  })[0];
  if (!m) return { error: 'no staged ' + kind };
  const r3 = (v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
  m.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m.model);
  const a = m.lamp?.anchor, aw = a ? a.getWorldPosition(new THREE.Vector3()) : null;
  const inv = new THREE.Matrix4().copy(m.body.matrixWorld).invert();
  const drawnAt = (slot) => { if (!L || slot < 0) return null; const e = L.lampMesh.instanceMatrix.array, o = slot * 16; return [+e[o + 12].toFixed(3), +e[o + 13].toFixed(3), +e[o + 14].toFixed(3)]; };
  const near = [];
  for (const rec of L?.records || []) {
    const d = drawnAt(rec.slot);
    if (!d || rec.slot >= (L.lampMesh.count ?? 0)) continue;
    const dist = Math.hypot(d[0] - m.position.x, d[2] - m.position.z);
    if (dist > 12) continue;
    near.push({ kind: rec.machine?.kind ?? null, inList: list.includes(rec.machine), alive: !!rec.machine?.alive, self: rec.machine === m, drawn: d, dist: +dist.toFixed(2), radius: rec.radius });
  }
  const sight = await import('/src/instruments/lib/sight.js');
  const p = C.player;
  return {
    kind, state: m.state, lampState: L?.stateOf?.(m),
    anchorBody: aw ? r3(aw.clone().applyMatrix4(inv)) : null, anchorWorld: aw ? r3(aw) : null, lampDrawn: m.lamp ? drawnAt(m.lamp.slot) : null,
    boundsBody: (() => { const b = box.clone().applyMatrix4(inv); return { min: r3(b.min), max: r3(b.max) }; })(),
    ground: +C.terrain.getHeight(m.position.x, m.position.z).toFixed(3), rootY: +m.position.y.toFixed(3),
    lampsNear: near, leakedNear: near.filter((x) => !x.inList).length, lampRecords: L?.records?.length ?? null, lampCount: L?.lampMesh?.count ?? null,
    heroFadeBeforeReset: window.__lineupFade?.id === frame.id ? window.__lineupFade : null,
    heroFadeFilmed: { fade: p.fade, fadeCur: p._fadeCur, applied: p._fadeApplied },
    occluders: sight.occluderSlots().filter((s) => s.startsWith(kind + ':')).length,
  };
}
