(async () => {
  const T = __CTX__.terrain, V = __CTX__.vegetation;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = performance.now();
  while (!T.routeCoverStats() && performance.now() - t0 < 45000) await sleep(200);
  const md = T._maskData, v = new Uint8Array(12);
  const at = (x, z) => {
    T._maskTexel(x, z, v);
    const ix = Math.floor((x + 360) / md.scale), iz = Math.floor((z + 360) / md.scale);
    const o = (iz * md.N + ix) * 4;
    return {
      surface: T.surfaceAt(x, z), material: T.materialAt(x, z),
      biome: T.biomeAt(x, z),
      tall: +T.tallGrassDensity(x, z).toFixed(3), hidden: T.isInTallGrass(x, z),
      tufts: +V.grassDensityAt(x, z).toFixed(2),
      bakedDuff: md.d2[o], liveDuff: v[4],
      bakedSnow: md.d3[o + 1], liveSnow: v[9],
      bakedAsh: md.d3[o + 3], liveAsh: v[11],
    };
  };
  return {
    stats: T.routeCoverStats(),
    'judgeWitness(38,-252)': at(38, -252),
    'snowBench(-60,-250)': at(-60, -250),
    'burnScar(154,-171)': at(154, -171),
    'ashCore(163,-236)': at(163, -236),
    'meadow(-60,-90)': at(-60, -90),
  };
})()
