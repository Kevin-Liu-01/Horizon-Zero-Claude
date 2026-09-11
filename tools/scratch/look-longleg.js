(async () => {
  const C = window.__CTX__;
  const _t0 = performance.now();
  while (!C.machines?.varietyReady && performance.now() - _t0 < 25000) await new Promise(r => setTimeout(r, 150));
  const m = (C.machines.list||[]).filter(x => x.alive && x.kind === 'longleg')[0];
  if (!m) return 'no longleg';
  const p = C.player;
  const D = 7;
  p.position.set(m.position.x + D, 0, m.position.z + D*0.35);
  p._snapToGround?.();
  p.camYaw = Math.atan2(m.position.x - p.position.x, m.position.z - p.position.z) + Math.PI;
  p.camPitch = 0.02;
  m.state = 'patrol'; m.suspicion = 0;
  const fn = () => { p.position.set(p.position.x, p.position.y, p.position.z); p.camYaw = Math.atan2(m.position.x - p.position.x, m.position.z - p.position.z) + Math.PI; p.camPitch = 0.02; };
  C.engine.onAfterRender.push(fn);
  for (let i = 0; i < 60; i++) await new Promise(r => requestAnimationFrame(r));
  let vis = 0, tot = 0;
  m.root.traverse(o => { if (o.isMesh) { tot++; let n=o,v=true; while(n){ if(n.visible===false){v=false;break;} n=n.parent;} if(v) vis++; } });
  return { kind: m.kind, dist: +Math.hypot(C.camera.position.x-m.position.x, C.camera.position.z-m.position.z).toFixed(1), tier: m._lodTier, vis, tot, fold: m._foldStats };
})()
