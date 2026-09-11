import { STAGE_PRELUDE, PERF_SCENARIOS } from '../budgets.mjs';
const body = `
  const __CTX__ = window.__CTX__;
  const _t0 = performance.now();
  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {
    await new Promise(r => setTimeout(r, 150));
  }
  ${STAGE_PRELUDE}
  const unpin = ${PERF_SCENARIOS['staged-fight']};
  for (let i = 0; i < 40; i++) await new Promise(r => requestAnimationFrame(r));
  const out = {};
  const cam = __CTX__.camera;
  for (const m of (__CTX__.machines?.list || [])) {
    if (!m.alive) continue;
    const d = Math.hypot(cam.position.x - m.position.x, cam.position.z - m.position.z);
    if (d > 60) continue;
    const rows = [];
    m.root.updateMatrixWorld(true);
    m.root.traverse((o) => {
      if (!o.isMesh) return;
      let vis = true, n = o;
      while (n) { if (n.visible === false) { vis = false; break; } n = n.parent; }
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      rows.push({ name: o.name || '(unnamed)', parent: o.parent?.name || '?', vis,
                  skinned: !!o.isSkinnedMesh, mat: mat ? (mat.name || mat.type) + '#' + mat.id : '-',
                  groups: o.geometry?.groups?.length || 0,
                  noHull: !!o.userData.noHull, hiddenSculpt: !!o.userData.hiddenSculpt,
                  lodHidden: !!o.userData.lodHidden, shell: !!o.userData.shell });
    });
    out[m.kind] = { dist: +d.toFixed(1), H: +m.height.toFixed(2), tier: m._lodTier,
                    visible: rows.filter(r => r.vis).length, total: rows.length,
                    parts: (m.parts||[]).map(p => ({ n: p.name, tearHp: p.tearHp, weak: !!p.weak, el: p.elemental||null, vis: p.mesh.visible, att: p.attached })),
                    rows: rows.filter(r => r.vis) };
  }
  const info = __CTX__.engine.renderer.info.render;
  unpin();
  return { calls: info.calls, out };
`;
console.log(`(async () => {${body}})()`);
