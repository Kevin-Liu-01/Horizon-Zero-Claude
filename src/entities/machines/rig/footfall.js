/**
 * The ONE machine footstep event, emitted from BOTH locomotion paths
 * (`audio-07`, gate `A76`).
 *
 * Round 4 emitted `machine-footfall` from `GaitController._footfall` only.
 * Six species run that controller; the Watcher and the Longleg run `FootLock`
 * over a clip instead, so two of the eight stayed silent walkers — measured
 * over a 5.5 s provoke: thunderjaw 24, behemoth 55, sawtooth 77, strider 170,
 * scrapper 62, watcher **0**, longleg **0**. `FootLock` already computes an
 * honest per-leg contact transition, so the emit belongs here, where both
 * callers can reach it, rather than in either one of them.
 *
 * Payload (`docs/SPEC.md` §13.5, extended — every field the audio and rumble
 * consumers ask for, and nothing that makes the caller touch the rig):
 *
 *   machine   the Machine
 *   kind      species id
 *   foot      leg id ('LF' / 'RH' / 'L' ...) — `leg` is kept as an alias
 *   index     leg index in the rig
 *   position  WORLD contact point (a live Vector3 — copy it if you keep it)
 *   speed     m/s ground speed at contact
 *   runK      0..1 walk->run blend
 *   strength  0..1 impact weight for a cue's gain
 *   mass      rough kg-ish scalar (height x body radius)
 *   surface   ctx.terrain.surfaceAt() material id, or null
 *
 * Allocation: one object literal per footstep (a handful per second per
 * machine), never in a per-frame loop.
 */
export function emitFootfall(machine, opts) {
  const ev = machine.ctx?.events;
  if (!ev) return;
  const speed = opts.speed ?? machine._speed ?? 0;
  const runK = opts.runK ?? 0;
  ev.emit('machine-footfall', {
    machine,
    kind: machine.kind,
    foot: opts.foot,
    leg: opts.foot,
    index: opts.index ?? 0,
    position: opts.position,
    speed,
    runK,
    strength: opts.strength ?? Math.min(1, 0.35 + runK * 0.65),
    mass: machine.height * Math.max(1, machine.bodyRadius),
    surface: machine.ctx.terrain?.surfaceAt
      ? machine.ctx.terrain.surfaceAt(opts.position.x, opts.position.z) : null,
  });
  machine.onFootfall?.(opts.foot, opts.index ?? 0, speed, runK);
}
