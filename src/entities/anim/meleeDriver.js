/**
 * THE MELEE DRIVER: the animator's side of the lance. `melee.js` owns the state machine; `meleeLayer.js`
 * owns the pose; these are the entry points the combat code and the gates call (the step-in it arms is
 * stepped by the locomotion driver's stance steps).
 *
 * M1.3a: these members of `PlayerAnimator` were moved here from `src/entities/playerAnimator.js` verbatim
 * (byte for byte, with the comments above each) and are installed onto `PlayerAnimator.prototype` by that
 * file (`installMethods`); `this` is the animator, as before. This class is a carrier and is never constructed.
 */
import {
  STEP_TRIGGER_REKEY, STEP_WINDOW,
} from './playerCommon.js';

export class MeleeDriver {
  /**
   * Lance/melee measurements for the `player-melee` gates (A100-A105). Cold
   * path — it walks the rig and re-reads world matrices; never call per frame.
   */
  debugMelee() { return this.melee?.ok ? this.melee.debug() : null; }

  /** Release the melee layer's mixer actions (memory rule). */
  disposeMelee() { this.melee?.dispose?.(); this.melee = null; }

  /**
   * Arm the melee step-in (called by `melee.js::_stepIn`, which owns the
   * velocity impulse). Nothing else in the file starts a stance step, so a
   * build that never swings behaves exactly as it did before this existed.
   */
  beginMeleeStep(rekey = false) {
    this._mStepT = STEP_WINDOW;
    this._stepDbg.armed++;
    if (rekey) {
      // a new stance: re-home off it, and re-place at STEP_TRIGGER_REKEY
      this._stepHome[0] = null; this._stepHome[1] = null;
      this._mStepRekey = STEP_WINDOW;
      this._stepDbg.rekeys = (this._stepDbg.rekeys || 0) + 1;
    }
  }
}
