import { Machine } from '../machine.js';
import { snapSockets } from './sockets.js';

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
   * Re-snap once, after `installDoctrine` has added its components. Call from
   * the top of `animate()`, past the LOD early-out.
   */
  _snapDoctrineSockets() {
    if (this._doctrineSnapped) return;
    this._doctrineSnapped = true;
    try { snapSockets(this); } catch (e) { /* proxy not buildable on this sculpt */ }
  }

  /** Species pose layer over whatever move the AI table built. */
  _updateAttack(dt) {
    super._updateAttack(dt);
    const a = this._attack;
    if (a && this.attackPose && !this.lowLOD) {
      try { this.attackPose(a); } catch (e) { /* pose layers never break a move */ }
    }
  }

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
