/**
 * Uniform scale of a generated Instrument's rig spec (body space, metres) —
 * ONE implementation for the generators' `scale` param
 * (`tools/build/instruments/parts/kit.mjs` re-exports it) and the runtime
 * `opts.scale` of a kind (`src/instruments/kinds/plumb.js`), so a Plumb spawned
 * at scale k walks exactly the rig its generator writes at scale k (bible §7.4
 * #2 "the same generator at scale 3x and 6.5x"; gate `A-plumb-scale`).
 * Runs once per spawn, never per frame.
 */
export function scaleRig(spec, k) {
  if (!spec || k === 1) return spec;
  const s3 = (v) => v.map((x) => +(x * k).toFixed(4));
  return {
    ...spec,
    spine: spec.spine.map((s) => ({ ...s, pos: s3(s.pos), r: +(s.r * k).toFixed(4), ...(s.tip ? { tip: s3(s.tip) } : {}) })),
    tail: (spec.tail || []).map((s) => ({ ...s, pos: s3(s.pos), r: +(s.r * k).toFixed(4) })),
    legGateY: +(spec.legGateY * k).toFixed(4),
    legInboard: +((spec.legInboard || 0) * k).toFixed(4),
    ...(typeof spec.tailGateY === 'number' ? { tailGateY: +(spec.tailGateY * k).toFixed(4) } : {}),
    legs: spec.legs.map((l) => ({ ...l, hip: s3(l.hip), knee: s3(l.knee), ankle: s3(l.ankle), toe: s3(l.toe), r: +(l.r * k).toFixed(4), restFoot: s3(l.restFoot) })),
  };
}
