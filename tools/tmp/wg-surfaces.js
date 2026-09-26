(async () => {
  const T = __CTX__.terrain, A = __CTX__.audio;
  const C = T.constructor;
  const sHist = {}, mHist = {}, rep = {};
  let total = 0;
  for (let z = -320; z <= 320; z += 3) {
    for (let x = -320; x <= 320; x += 3) {
      if (x * x + z * z > 320 * 320) continue;
      total++;
      const s = T.surfaceAt(x, z); sHist[s] = (sHist[s] || 0) + 1;
      const m = T.materialAt(x, z); mHist[m] = (mHist[m] || 0) + 1;
      if (!rep[m]) rep[m] = [x, z];
    }
  }
  // what the live consumer actually plays on each emitted surface
  const played = {};
  if (A && typeof A._footstep === 'function') {
    const P = __CTX__.player;
    const home = { x: P.position.x, z: P.position.z };
    const rec = [];
    const orig2D = A.play2D.bind(A);
    A.play2D = (id, o) => { const r = orig2D(id, o); rec.push({ id, r }); return r; };
    try {
      for (const m of Object.keys(mHist)) {
        const at = rep[m];
        P.position.x = at[0]; P.position.z = at[1];
        const mark = rec.length;
        A._footstep(0.7, false, false);
        const mine = rec.slice(mark).filter((e) => e.id.indexOf('foot/') === 0);
        played[m] = { emits: T.surfaceAt(at[0], at[1]), cues: mine.map((e) => e.id), ok: mine.filter((e) => e.r).length > 0 };
        await new Promise((r) => setTimeout(r, 95));
      }
    } finally {
      delete A.play2D;
      P.position.x = home.x; P.position.z = home.z;
      if (P._snapToGround) P._snapToGround();
    }
  }
  return {
    SURFACES: C.SURFACES, MATERIALS: C.MATERIALS, EMIT: C.SURFACE_EMIT,
    total, surfaceHist: sHist, materialHist: mHist, walked: played,
    bank: A && A.bank && A.bank.audit ? A.bank.audit() : null,
  };
})()
