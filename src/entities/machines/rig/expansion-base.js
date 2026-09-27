import { Machine } from '../machine.js';
import { snapSockets } from './sockets.js';
import { settleCorpseNow } from './ground.js';
import { deathDt } from '../gait.js';

/**
 * ExpansionMachine — the two things every Round-4 expansion species needs that
 * the Round-3 species did not, and nothing else.
 *
 * ## 1. Sockets are snapped AFTER the doctrine has authored its components
 *
 * `ai/doctrine.js` (machine-ai) owns the canon components of the nine new kinds
 * — the Ravager's cannon, the Shell-Walker's cargo crate, the Stormbird's six
 * engines — and `index.js` installs them by calling `installDoctrine(m, opts)`
 * immediately AFTER the constructor returns. A species constructor therefore
 * cannot snap them: `snapSockets()` has already run by the time they exist, and
 * `A44-socket-integrity` measures every part against the hull with a 0.10 m
 * budget. One re-snap on the first animated frame closes it, for both lanes'
 * parts at once, without either lane editing the other's file.
 *
 * It is a single call per machine: `snapSockets` rebuilds the hull proxy, which
 * is the same work the constructor already paid for once.
 *
 * ## 2. Species pose layers on top of the AI's generic moves
 *
 * `ai/attacks.js` builds the expansion attack tables from GENERIC builders
 * (`lunge` / `sweep` / `charge` / `volley` / `flurry`) whose ranges, cooldowns
 * and band coverage `A41b-attack-coverage` already grades. Those builders write
 * the shared pose channels, so a table move is never pure root motion — but
 * they cannot know that a Broadhead drops its horns, that a Grazer's antler
 * rotors spin up, or that a Snapmaw's whole tail leads a spin.
 *
 * `attackPose(a)` is that species layer. It runs every frame AFTER the move's
 * own `onUpdate`, so it wins the frame for the channels it writes and leaves
 * every other channel to the generic move. Gate `V27` grades exactly this:
 * "limbs are doing the work; FAIL if only the body transform changed."
 *
 * Nothing here replaces `chooseAttack()` — a species may still offer one for an
 * `authored: 'species'` row — and nothing here is required: a species that
 * implements no `attackPose` behaves exactly as it would extending `Machine`.
 */
export class ExpansionMachine extends Machine {
  /**
   * The doctrine installs its components synchronously, right after the
   * species constructor returns (`index.js` / `installDoctrine`), so a
   * microtask queued here runs after both — the earliest moment every
   * component exists. See `update()` below for why the first animated frame
   * was not early enough.
   */
  constructor(ctx, manager, opts) {
    super(ctx, manager, opts);
    queueMicrotask(() => {
      if (!this._disposed && this.root && this.alive) this._snapDoctrineSockets();
    });
  }

  /**
   * Re-snap after `installDoctrine` has added its components — keyed on the
   * part COUNT, so a component authored later than the first call is snapped
   * too.
   */
  _snapDoctrineSockets() {
    const n = this.parts ? this.parts.length : 0;
    if (this._doctrineSnapped === n) return;
    this._doctrineSnapped = n;
    try { snapSockets(this); } catch (e) { /* proxy not buildable on this sculpt */ }
  }

  /**
   * ...AND FROM `update()`, NOT ONLY FROM `animate()` (residue fix round 1,
   * `A44b-socket-vertex-integrity`).
   *
   * `Machine.update` skips `animate()` altogether while a machine is `lowLOD`,
   * so a machine that spawned beyond the animation ring never ran the re-snap:
   * probed in the running game, the Ravager, Corruptor and Snapmaw on the far
   * side of the map had `_doctrineSnapped` unset and read exactly the gaps the
   * gate has failed on for two rounds — `part:cannon` 0.26, `spike-launcher` /
   * `grenade-launcher` 0.247, `freeze-sac` 0.125 — while every species near the
   * player read 0.003. The doctrine's components sat where `installDoctrine`
   * put them until the player walked close enough to animate the machine.
   * The constructor's microtask now snaps them the moment they exist; this
   * catches a component authored later still. One integer compare per update.
   */
  update(dt, t) {
    this._snapDoctrineSockets();
    return super.update(dt, t);
  }

  /** Species pose layer over whatever move the AI table built. */
  _updateAttack(dt) {
    super._updateAttack(dt);
    const a = this._attack;
    if (a && this.attackPose && !this.lowLOD) {
      try { this.attackPose(a); } catch (e) { /* pose layers never break a move */ }
    }
  }

  /**
   * SETTLE AT DEATH. See `rig/ground.js` `settleCorpseNow` — a wreck that the
   * site lifecycle freezes before its first death frame never poses and never
   * grounds, and `A47`/`A47b`/`A47c` all grade the result.
   */
  _die() {
    super._die();
    settleCorpseNow(this);
  }

  /** The collapse runs on the wall clock (`gait.js` `deathDt`). */
  _updateDeath(dt) { super._updateDeath(deathDt(this, dt)); }

  /** Clear the species pose channels with the move. */
  _cancelAttack() {
    const had = !!this._attack;
    super._cancelAttack();
    if (had && this.clearAttackPose) {
      try { this.clearAttackPose(); } catch (e) { /* */ }
    }
  }
}

export default ExpansionMachine;
