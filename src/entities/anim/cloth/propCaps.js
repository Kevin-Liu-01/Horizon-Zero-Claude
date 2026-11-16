/**
 * CLOTH: THE PROP CAPSULES (the one seam between the weapons lane and the cloth lane).
 *
 * Four fixed slots a prop can occupy while the cloth must keep out of it: the stowed lance shaft, the stowed bow,
 * the lance in hand and the bow in hand. Each slot is two end points (world metres), a radius, an `on` flag and the
 * two ends' velocities (m/s, world). The weapons lane only CALLS `setPropCap` (and `clearPropCap`); the cloth lane
 * only READS the slots (`propCaps(an)`), once a frame, before its substeps. The velocities are taken here from the
 * last call's end points and the animator's own sim dt (`propCaps(an).dt`, written by the cloth each frame; 1/60 s
 * until then), never from the wall clock, so the sim-time slate repeats. The slots live in a WeakMap keyed by the
 * animator, so no field is added to it (a new field re-shapes the animator's record, R48 c).
 *
 * A slot that is not set this frame keeps its last end points and its `on` flag: a caller that stops holding a prop
 * clears it. No allocation after the first call on an animator.
 */

export const PROP_SLOTS = ['stowLance', 'stowBow', 'heldLance', 'heldBow'];
const _slots = new WeakMap();

function makeSlot(name) {
  return {
    name, on: false, r: 0, set: 0,
    a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 },
    va: { x: 0, y: 0, z: 0 }, vb: { x: 0, y: 0, z: 0 },
    // (the last call's ends, for the velocities)
    pa: { x: 0, y: 0, z: 0 }, pb: { x: 0, y: 0, z: 0 }, primed: false,
  };
}

/** The animator's four slots (created on first use). */
export function propCaps(an) {
  let P = _slots.get(an);
  if (!P) {
    P = { list: PROP_SLOTS.map(makeSlot), dt: 1 / 60 };
    for (const s of P.list) P[s.name] = s;
    _slots.set(an, P);
  }
  return P;
}

/**
 * Put prop capsule `slot` ('stowLance' | 'stowBow' | 'heldLance' | 'heldBow') at the segment `a`-`b` (any {x,y,z},
 * world metres) with radius `r` (m), on. `a` null turns the slot off. Velocities are the ends' travel since the last
 * call over the animator's sim dt; a slot just turned on starts at rest.
 */
export function setPropCap(an, slot, a, b, r) {
  const PC = propCaps(an), S = PC[slot];
  if (!S) throw new Error(`[cloth] no prop slot "${slot}"`);
  if (!a || !b || !(r > 0)) { S.on = false; S.primed = false; return S; }
  const dt = PC.dt > 0 ? PC.dt : 1 / 60;
  if (S.on && S.primed) {
    S.va.x = (a.x - S.pa.x) / dt; S.va.y = (a.y - S.pa.y) / dt; S.va.z = (a.z - S.pa.z) / dt;
    S.vb.x = (b.x - S.pb.x) / dt; S.vb.y = (b.y - S.pb.y) / dt; S.vb.z = (b.z - S.pb.z) / dt;
  } else {
    S.va.x = S.va.y = S.va.z = 0; S.vb.x = S.vb.y = S.vb.z = 0;
  }
  S.a.x = a.x; S.a.y = a.y; S.a.z = a.z; S.b.x = b.x; S.b.y = b.y; S.b.z = b.z;
  S.pa.x = a.x; S.pa.y = a.y; S.pa.z = a.z; S.pb.x = b.x; S.pb.y = b.y; S.pb.z = b.z;
  S.r = r; S.on = true; S.primed = true; S.set++;
  return S;
}

/** Turn slot `slot` off. */
export function clearPropCap(an, slot) {
  const S = propCaps(an)[slot];
  if (S) { S.on = false; S.primed = false; }
  return S;
}
