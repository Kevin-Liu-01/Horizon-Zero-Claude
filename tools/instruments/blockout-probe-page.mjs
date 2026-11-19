/**
 * The wave 1 blockouts' probe, the page half (lane instruments). Run by
 *   node tools/frames/film.mjs --port <p> --only F23-tiller,F23-sickle,F23-screed --probe /tools/instruments/blockout-probe-page.mjs
 * after each line-up frame is staged: the staged blockout's lamp anchor in its body frame and in the world, the model's
 * world bounds (posed top over its ground), its state and lamp state, and the occluder slots it publishes.
 */
export async function probe(frame) {
  const kind = { 'F23-tiller': 'tiller-blockout', 'F23-sickle': 'sickle', 'F23-screed': 'screed' }[frame?.id];
  if (!kind) return { skipped: 'line-up frames only' };
  const THREE = await import('/tools/look/three.mjs');
  const C = window.__CTX__, M = C.machines;
  const m = (M.list || []).find((x) => x.kind === kind && x.alive);
  if (!m) return { error: 'no staged ' + kind };
  const r3 = (v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
  m.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m.model);
  const a = m.lamp?.anchor, aw = a ? a.getWorldPosition(new THREE.Vector3()) : null;
  const inv = new THREE.Matrix4().copy(m.body.matrixWorld).invert();
  const sight = await import('/src/instruments/lib/sight.js');
  return {
    kind, state: m.state, lampState: M.lamps?.stateOf?.(m), entryLamp: C.assets.models[m.modelKind]?.r5Blockout?.lamp ?? null,
    anchorLocal: a ? r3(a.position) : null, anchorBody: aw ? r3(aw.clone().applyMatrix4(inv)) : null,
    bodyScale: r3(m.body.getWorldScale(new THREE.Vector3())), modelScale: r3(m.model.getWorldScale(new THREE.Vector3())),
    modelPos: r3(m.model.position), holderPos: r3(m.holder.position),
    boundsBody: (() => { const b = box.clone().applyMatrix4(inv); return { min: r3(b.min), max: r3(b.max) }; })(),
    ground: +C.terrain.getHeight(m.position.x, m.position.z).toFixed(3), rootY: +m.position.y.toFixed(3),
    anchorWorld: aw ? r3(aw) : null, rootWorld: r3(m.root.getWorldPosition(new THREE.Vector3())),
    lampSlot: m.lamp?.slot ?? null,
    lampDrawn: (() => { const L = M.lamps; if (!L || !m.lamp || m.lamp.slot < 0) return null; const e = L.lampMesh.instanceMatrix.array, o = m.lamp.slot * 16; return [+e[o + 12].toFixed(3), +e[o + 13].toFixed(3), +e[o + 14].toFixed(3)]; })(),
    lampsVisible: M.lamps?.lampMesh?.visible ?? null, lampCount: M.lamps?.lampMesh?.count ?? null,
    occluders: sight.occluderSlots().filter((s) => s.startsWith(kind + ':')).length,
  };
}
