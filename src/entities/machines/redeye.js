import { Watcher } from './watcher.js';
import { buildShell, retireMesh } from './rig/shells.js';
import { REDEYE_SHELL } from './rig/shells-expansion.js';
import { snapSockets } from './rig/sockets.js';
import { foldMachineMeshes } from './rig/lod.js';

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
    /**
     * THE DONOR'S OWN EYE MESHES ARE RETIRED TOO (residue fix round 1). The
     * Redeye's eye is its red lens PART; the Watcher GLB's three eye meshes
     * (`Eye001_Eye_texture_0`, `Eye_Lense_1001_Glass_Lense_0`,
     * `Eye_Camera001_Lense_-_Blue_Cameras_0`) sit inside it, are sub-pixel at
     * any range the engine's size cull leaves them drawn, and still carried hit
     * hulls — so once the authored cheek plates put aim points round the eye
     * pod, `A50b` measured 3 of 50 arrows registering on a mesh nobody can see.
     */
    this.model?.traverse((o) => {
      if (o.isMesh && /^Eye(001_Eye|_Lense_1001|_Camera001)/.test(o.name || '')) retireMesh(o);
    });
    /**
     * ONE DRAW FOR THE WHOLE SHELL (residue fix round 1). The shell is now a
     * real armour set on four bone groups (`REDEYE_SHELL`), and `buildShell`
     * makes one mesh per bone — five draws per Redeye, on a scene that is
     * already over `A21-real-draw-calls`' budget. `super()` folded the Watcher
     * before the shell existed, so the fold runs once more here:
     * `skinRigidAttachments` re-expresses each bone bucket as a rigid skin on
     * the machine's own skeleton and `mergeByMaterial` welds them into one
     * SkinnedMesh. Its own pool key, so its buffers can never collide with the
     * donor fold's `rigid|...` entries under 'redeye'; every later Redeye
     * borrows the first one's merged buffer.
     */
    foldMachineMeshes(this, { pool: 'redeye-shell' });
    snapSockets(this);
    // the doctrine's blaster exists once the spawn call returns (see the base)
    queueMicrotask(() => {
      if (!this._disposed && this.root && this.alive) this._snapDoctrineSockets();
    });
  }

  /**
   * Re-snap once the doctrine's blaster has been authored (see
   * `rig/expansion-base.js`) — from `update()`, because a far (`lowLOD`)
   * machine never animates, and keyed on the part count.
   */
  _snapDoctrineSockets() {
    const n = this.parts ? this.parts.length : 0;
    if (this._doctrineSnapped === n) return;
    this._doctrineSnapped = n;
    try { snapSockets(this); } catch (e) { /* proxy not buildable */ }
  }

  update(dt, t) {
    this._snapDoctrineSockets();
    return super.update(dt, t);
  }

  animate(dt, t) {
    this._snapDoctrineSockets();
    super.animate(dt, t);
  }
}
