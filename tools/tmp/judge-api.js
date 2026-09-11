(() => {
  const c = __CTX__, T = c.terrain, V = c.vegetation, W = c.water || c.environment?.water;
  const has = (o, k) => (o && typeof o[k] === 'function') ? 'fn' : (o && k in o ? typeof o[k] : 'MISSING');
  const r = {
    terrain: { getHeight: has(T,'getHeight'), getNormal: has(T,'getNormal'), heightFast: has(T,'heightFast'), slopeFast: has(T,'slopeFast'), tallGrassDensity: has(T,'tallGrassDensity'), isInTallGrass: has(T,'isInTallGrass'), surfaceAt: has(T,'surfaceAt'), SURFACES: (T.constructor.SURFACES||[]).join('|'), PLAY_RADIUS: T.constructor.PLAY_RADIUS ?? T.PLAY_RADIUS ?? null, WORLD_SIZE: T.constructor.WORLD_SIZE ?? T.WORLD_SIZE ?? null, cliffMeshes: T.cliffMeshes ? (T.cliffMeshes.length ?? 'obj') : 'MISSING' },
    vegetation: { group: V.group?'obj':'MISSING', grassDensityAt: has(V,'grassDensityAt'), countGrassNear: has(V,'countGrassNear'), forceStream: has(V,'forceStream'), grassStats: has(V,'grassStats'), treeStats: has(V,'treeStats'), windAt: has(V,'windAt'), displacers: Array.isArray(V.displacers)? V.displacers.length : 'MISSING' },
    water: { pools: Array.isArray(W?.pools) ? W.pools.length : 'MISSING', levelAt: has(W,'levelAt'), depthAt: has(W,'depthAt'), flowAt: has(W,'flowAt') },
  };
  // accuracy checks
  r.waterAtCtx = !!c.water; r.waterAtEnv = !!c.environment?.water; r.checks = {
    heightFastVsGetHeight: [[0,0],[-60,-90],[150,95],[0,-330]].map(([x,z]) => +(T.heightFast(x,z) - T.getHeight(x,z)).toFixed(2)),
    depthAtRiver: +(W.depthAt(-167,-200) ?? -1).toFixed(2),
    levelAtDry: W.levelAt(0,0),
    flowAt: (() => { const v = W.flowAt(-167,-200); return v ? [+v.x.toFixed(2), +(v.z ?? v.y).toFixed(2)] : null; })(),
    isInTallGrassMatches: T.isInTallGrass(-51.8,-74) === (T.tallGrassDensity(-51.8,-74) > 0.45),
    collisionCount: c.collision?.count ? c.collision.count() : null,
  };
  return r;
})()
