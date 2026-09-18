import { Watcher } from './watcher.js';
import { buildShell, retireMesh } from './rig/shells.js';
import { REDEYE_SHELL } from './rig/shells-expansion.js';
import { snapSockets } from './rig/sockets.js';

/**
 * REDEYE WATCHER — Recon T2, escort (`roster-v2 §4`, `casting-v4 §2.9`).
 *
 * `roster-v2` specs the Redeye INSIDE the Watcher row: same body, same recon
 * doctrine, "Redeye adds Energy Blast 0-55 m (40)". So this species is the
 * Watcher, and it says so by EXTENDING it rather than by copying 600 lines of
 * rig, foot lock and gait tuning that would then drift apart.
 *
 * ZERO NEW ASSET, and one deliberate subtlety: `assets.models.redeye` is
 * `/models/watcher.glb` loaded a SECOND time under its own key
 * (`variety-assets.js` SPECS), not aliased to the Watcher's entry. Aliasing
 * would share the donor's materials between the two species, and the whole
 * point of a Redeye is a state sensor that is a different colour — the frost
 * tint, the telegraph flash and the death fade all write to per-machine
 * material clones taken FROM that entry, so the entries have to be separate.
 *
 * THE RED CALM EYE. Every other machine's `calm` is the global blue in
 * `EYE_COLORS`; a Redeye's calm is already red, and that is the difference
 * between the variant and a recoloured Watcher — you cannot tell a Redeye's
 * alert state from its colour, which is exactly why it is frightening.
 * `Machine` takes `opts.eyeCalm` for this; `ai/doctrine.js` also sets it from
 * its own `BODY.redeye.eyeCalm`, so the two agree whichever built the machine.
 *
 * The DORSAL BLASTER (`tearHp` 90, torn = no `energy-blast`) is authored by
 * `ai/doctrine.js` COMPONENTS, because the attack row that needs it lives
 * there. This file adds the red dorsal trim strip that makes the variant
 * readable from BEHIND, where the sensor is not visible at all.
 */
export class Redeye extends Watcher {
  constructor(ctx, manager, opts) {
    super(ctx, manager, {
      kind: 'redeye',
      modelKind: 'redeye',
      displayName: 'Redeye Watcher',
      maxHealth: 150,
      armor: 0.08,
      level: 9,
      walkSpeed: 2.7,
      runSpeed: 7.4,
      sightRange: 46,
      eyeHeight: 1.9,
      bodyRadius: 0.92,
      attackRange: 2.8,
      eyeCalm: '#ff2a1e',
      ...opts,
    });
    buildShell(this, REDEYE_SHELL, { sensorColor: 0xff2a1e });
    /**
     * THE DONOR'S SCAN PLANE IS RETIRED (fix round 1). `Object_13` in the
     * Watcher GLB is a FOUR-TRIANGLE quad spanning body space
     * x[-2.51, 2.26] — 4.8 m across a 2.1 m machine — and it inherits the
     * state emissive, so on a Redeye it renders as two floating red slabs to
     * either side of the body. Measured in `V26a` twice. The Watcher's own
     * entry is core-platform's asset and is not touched here; this is the
     * Redeye's per-machine clone, so retiring it is a one-species call made in
     * the one species file that owns it.
     */
    this.model?.traverse((o) => {
      if (o.isMesh && o.name === 'Object_13') retireMesh(o);
    });
    snapSockets(this);
  }

  /** Re-snap once the doctrine's blaster has been authored (see the base). */
  animate(dt, t) {
    if (!this._doctrineSnapped) {
      this._doctrineSnapped = true;
      try { snapSockets(this); } catch (e) { /* proxy not buildable */ }
    }
    super.animate(dt, t);
  }
}
