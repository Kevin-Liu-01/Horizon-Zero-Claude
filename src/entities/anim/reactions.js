/**
 * REACTIONS: the hit react (light, stagger, knockdown), the interaction one-shots (pickup, interact), the
 * three clip override channels they drive, and the death fallback.
 *
 * M1.3a: these members of `PlayerAnimator` were moved here from `src/entities/playerAnimator.js` verbatim
 * (byte for byte, with the comments above each) and are installed onto `PlayerAnimator.prototype` by that
 * file (`installMethods`); `this` is the animator, as before. This class is a carrier and is never constructed.
 */
import * as THREE from 'three';
import {
  HIT_CLASSES, HIT_KNOCKDOWN_FRAC, HIT_STAGGER_FRAC, X_AXIS, Z_AXIS, _grip, _pole, _v4, clamp, damp,
  smoothstep,
} from './playerCommon.js';

export class Reactions {
  /* --------------- Round 4: reactions, traversal, interaction ------------- */

  /**
   * `player-damage` -> a graded hit react (player-anim-09).
   *
   * Round 3's react was a 0.14 rad nudge on `spine_02` decaying at k=9, which
   * measured under 3 deg of torso lean and was invisible on film. It is now a
   * CLASS: the clip channel takes weight off the locomotion tree (so the
   * dominant action visibly becomes a hit), a directional procedural lean runs
   * on top of it, and heavy hits ask player-control for camera shake.
   *
   * @param {{amount:number, from?:{position?:THREE.Vector3}}} e
   */
  _onDamage(e) {
    const p = this.ctx.player;
    const amount = Math.max(0, Number(e?.amount) || 0);
    if (amount <= 0 || this.ctx.state === 'dead') return;
    // `player-damage` is the INPUT event: it fires even when the dodge i-frames
    // eat the hit (player-control answers with `player-evaded`), and a react to
    // damage she never took would undo the roll she just earned it with.
    if (p?.invulnerable) return;
    const frac = amount / Math.max(1, p?.maxHealth ?? 100);
    let cls = frac >= HIT_KNOCKDOWN_FRAC ? 'knockdown'
      : frac >= HIT_STAGGER_FRAC ? 'stagger' : 'light';
    // player.mods.knockdownMode caps the react (armor perks): 'stagger' turns a
    // knockdown into a stagger, 'light' turns everything into a flinch
    const km = p?.mods?.knockdownMode;
    if (km === 'stagger' && cls === 'knockdown') cls = 'stagger';
    else if (km === 'light') cls = 'light';
    this.lastHitClass = cls;
    // a bigger hit always wins; a smaller one may not cut a stagger short
    const cur = this._hitT < 1 ? HIT_CLASSES[this._hitClass] : null;
    if (cur && HIT_CLASSES[cls].lean < cur.lean * 0.9) return;
    const C = HIT_CLASSES[cls];
    this._hitClass = cls;
    this._hitSlot = this.loco?.actions[C.slot] ? C.slot : null;
    this._hitDur = C.dur;
    this._hitT = 0;
    this._hitLeanPeak = C.lean;
    // push direction in CHAR space: away from the source, so the torso folds
    // over the impact rather than always rocking backwards
    let dx = 0, dz = -1;
    const src = e?.from?.position;
    if (src && p?.position) {
      const wx = p.position.x - src.x, wz = p.position.z - src.z;
      const l = Math.hypot(wx, wz);
      if (l > 0.05) {
        const h = p.heading ?? 0, s = Math.sin(h), c = Math.cos(h);
        dx = (wx / l) * c - (wz / l) * s;
        dz = (wx / l) * s + (wz / l) * c;
      }
    }
    this._hitDirX = dx; this._hitDirZ = dz;
    if (p?.addShake) p.addShake(C.shake);
  }

  /**
   * Start an interaction one-shot (`pickup` / `interact`). Ignored while a
   * longer one is still running, and while she is rolling or dead — an
   * `item-gained` fired by a pickup radius mid-dodge must not cancel the roll.
   */
  _startAction(slot, dur = 0.9) {
    if (!this.loco?.actions[slot]) return;
    const p = this.ctx.player;
    if (this.ctx.state === 'dead' || p?.dodging || !p?.grounded) return;
    if (this._actT < 1 && this._actSlot && this._actT < 0.7) return;
    this._actSlot = slot;
    this._actDur = Math.max(0.25, dur);
    this._actT = 0;
  }

  /**
   * Advance the three clip override channels and their weights. Runs BEFORE
   * `loco.update`, which reads the slot names, the 0..1 scrubs and the damped
   * weights out of these fields.
   */
  _updateChannels(dt, p, dead) {
    const L = this.loco;
    /* ---- hit react ---- */
    let hitTarget = 0;
    if (this._hitT < 1 && !dead) {
      this._hitT = Math.min(this._hitT + dt / this._hitDur, 1);
      // fast attack, long decay — a symmetric sine peaks at the halfway point
      // and is back to zero in the same time, which reads as a bow, not a hit
      const A = clamp(0.14 / this._hitDur, 0.05, 0.4);
      const env = this._hitT < A ? this._hitT / A
        : 1 - smoothstep((this._hitT - A) / (1 - A), 0, 1);
      hitTarget = HIT_CLASSES[this._hitClass].w * env;
      this._hitK = this._hitT;
      this._hitLean = this._hitLeanPeak * env;
    } else {
      this._hitLean = damp(this._hitLean, 0, 9, dt);
      if (this._hitT >= 1) this._hitSlot = null;
    }
    this._hitClipW = damp(this._hitClipW, hitTarget, hitTarget > this._hitClipW ? 26 : 9, dt);
    if (this._hitClipW < 0.004 && hitTarget === 0) { this._hitClipW = 0; this._hitSlot = null; }

    /* ---- jump / fall / land (player-anim-10, on player-control's states) ---
     * Driven off the published `grounded` / `airTime` rather than only the
     * events, so a fall off a ledge — which never fires `player-jump` — still
     * gets the airborne pose. */
    let airTarget = 0;
    const airborne = !dead && !p.grounded && !p.dodging && !p.mantling;
    if (airborne) {
      this._airT += dt;
      const startDur = L?.entries.jumpStart?.info.duration ?? 0.4;
      if (this._airSlot !== 'jumpLoop' && this._airT < startDur * 0.9 && L?.actions.jumpStart) {
        this._airSlot = 'jumpStart';
        this._airK = clamp(this._airT / startDur, 0, 1);
      } else if (L?.actions.jumpLoop) {
        this._airSlot = 'jumpLoop';
        const d = L.entries.jumpLoop.info.duration || 1;
        this._airK = ((this._airT / d) % 1 + 1) % 1;
      }
      // the pose arrives over ~0.1 s so a 2-frame hop does not snap
      airTarget = smoothstep(this._airT, 0.02, 0.12);
      this._landT = 1;
    } else if (this._landT < 1 && !dead) {
      this._landT = Math.min(this._landT + dt / 0.42, 1);
      if (L?.actions.jumpLand) {
        this._airSlot = 'jumpLand';
        this._airK = this._landT;
        // scale the landing pose by how hard it was: a 0.4 m hop barely reads
        airTarget = clamp(this._landAmp, 0, 1) * (1 - smoothstep(this._landT, 0.55, 1));
      }
      this._airT = 0;
    } else {
      this._airT = 0;
      if (this._airClipW < 0.004) this._airSlot = null;
    }
    this._airClipW = damp(this._airClipW, airTarget, airTarget > this._airClipW ? 22 : 12, dt);
    if (this._airClipW < 0.004 && airTarget === 0) { this._airClipW = 0; this._airSlot = null; }
    this._airTarget = airTarget;

    /* ---- interact / pickup ---- */
    let actTarget = 0;
    if (this._actT < 1 && !dead) {
      this._actT = Math.min(this._actT + dt / this._actDur, 1);
      this._actK = this._actT;
      // never fight locomotion: the beat fades out the faster she is moving
      actTarget = 0.85 * Math.sin(Math.PI * clamp(this._actT * 1.06, 0, 1))
        * (1 - smoothstep(p.moveSpeed ?? 0, 1.2, 3.4));
    } else if (this._actClipW < 0.004) this._actSlot = null;
    this._actClipW = damp(this._actClipW, actTarget, 14, dt);
    if (this._actClipW < 0.004 && actTarget === 0) { this._actClipW = 0; this._actSlot = null; }
    this._actTarget = actTarget;
    this._hitTarget = hitTarget;

    /* ---- mantle: no clip in the pack, so it is a procedural pull-up ---- */
    if (p.mantling && this._prevMantling === false) this._mantleT = 0;
    this._prevMantling = !!p.mantling;
    if (this._mantleT < 1) this._mantleT = Math.min(this._mantleT + dt / 0.42, 1);

    /* ---- heal: no event exists, so the tell is health GOING UP ---- */
    const hp = p.health ?? 0;
    if (hp > this._prevHealth + 0.5 && !dead) this._healT = 0;
    this._prevHealth = hp;
    if (this._healT < 1) this._healT = Math.min(this._healT + dt / 0.85, 1);
  }

  /* ---------------------------- contract API ---------------------------- */

  /** Reaction/traversal channel state (gate A36-hit-react-visible). */
  debugReact() {
    const p = this.ctx.player;
    return {
      hitClass: this._hitClass, hitSlot: this._hitSlot,
      hitT: +this._hitT.toFixed(3), hitW: +this._hitClipW.toFixed(3),
      hitLeanDeg: +(this._hitLean * 180 / Math.PI).toFixed(2),
      torsoLeanDeg: +(this.torsoLeanDeg() ?? 0).toFixed(2),
      airSlot: this._airSlot, airW: +this._airClipW.toFixed(3),
      actSlot: this._actSlot, actW: +this._actClipW.toFixed(3),
      landT: +this._landT.toFixed(3), mantleT: +this._mantleT.toFixed(3),
      healT: +this._healT.toFixed(3),
      grounded: !!p?.grounded, airTime: +(p?.airTime ?? 0).toFixed(3),
      dominant: this.dominantAction(),
      blink: +this._blinkK.toFixed(3), shift: +this._shift.toFixed(4),
      headStab: +this._headStab.toFixed(4), pelvBob: +this._pelvBob.toFixed(4),
      crouchAimW: +this._crouchAimW.toFixed(3), carryBowW: +this._carryBowW.toFixed(3),
      fidget: this._fidgetK < 1 ? this._fidgetKind : -1,
    };
  }

  /* ------------- Round 4 overlays: react / idle life / poses -------------- */

  /**
   * Hit react, hard landing, mantle pull-up and the heal hand-to-hip, all as
   * additive offsets on top of whatever the clip channels are already doing.
   * Returns the pelvis Y offset it wants (metres, character space).
   */
  _reactLayer(dt, p, dodgeW, aimW, carryW) {
    const b = this.b;
    let pdy = 0;
    const live = (1 - this._deadW) * (1 - dodgeW);

    /* ---- graded hit react (player-anim-09) ---------------------------- */
    // The torso folds AWAY from the impact: `-dirZ` pitches her back when the
    // hit came from the front, `dirX` rolls her off a hit from the side. The
    // pelvis, spine_01 and spine_02 shares are all part of the pelvis ->
    // spine_03 axis the gate measures, so this is the number, not a proxy.
    const hl = this._hitLean * live;
    if (Math.abs(hl) > 0.002) {
      // sign check: `_hitDir` is the push direction (away from the source) in
      // char space, +X is her LEFT and +Z is forward, and a positive X-axis
      // rotation pitches her FORWARD (same convention as the run lean). A hit
      // from the front therefore has to be a NEGATIVE X rotation. The first
      // drop had this inverted, so the procedural lean pushed her forward while
      // the Hit_Chest clip recoiled her back and the two cancelled: 17 deg of
      // authored react measured 3.2 deg of actual torso movement.
      const fx = this._hitDirZ * hl, sx = this._hitDirX * hl;
      this._rot(b.pelvis, X_AXIS, fx * 0.22);
      this._rot(b.spine1, X_AXIS, fx * 0.34);
      this._rot(b.spine2, X_AXIS, fx * 0.34);
      this._rot(b.spine3, X_AXIS, fx * 0.20);
      this._rot(b.pelvis, Z_AXIS, sx * 0.24);
      this._rot(b.spine1, Z_AXIS, sx * 0.36);
      this._rot(b.spine2, Z_AXIS, sx * 0.36);
      /* The head. FIX ROUND 3 (judge-player-anim-r2): this used to add
       * fx * 0.42 at the neck and fx * 0.34 at the head ON TOP of the 1.10 the
       * pelvis -> spine_03 fold already carries, so the peak of a 14 hp chest
       * hit (18.2 deg of torso) craned her chin at the sky — a limbo, not a
       * flinch. Older game's chest flinch folds the torso and keeps the face toward
       * the impact. The neck now carries at most a THIRD of the fold (0.24 of
       * 1.10) and the head counter-rotates 0.18 of it, so her gaze ends up
       * pointing back down her own chest instead of straight up, while the
       * lean A36 measures — pelvis/spine_01/spine_02/spine_03 — is untouched.
       * The head still whips first and recovers last: it rides `_hitLean`. */
      this._rot(b.neck1, X_AXIS, fx * 0.24);
      this._rot(b.head, X_AXIS, -fx * 0.18);
      this._rot(b.head, Z_AXIS, sx * 0.30);
      // knees absorb it; a knockdown drops the hips
      const brace = Math.abs(hl);
      this._rot(b.thighL, X_AXIS, -0.30 * brace);
      this._rot(b.thighR, X_AXIS, -0.30 * brace);
      this._rot(b.calfL, X_AXIS, 0.52 * brace);
      this._rot(b.calfR, X_AXIS, 0.52 * brace);
      pdy += -0.20 * brace;
      // arms fly wide unless they are holding something
      const armF = brace * (1 - aimW) * (1 - carryW);
      this._rot(b.upArmL, Z_AXIS, 0.55 * armF);
      this._rot(b.upArmR, Z_AXIS, -0.55 * armF);
      this._rot(b.loArmL, X_AXIS, -0.35 * armF);
      this._rot(b.loArmR, X_AXIS, -0.35 * armF);
    }

    /* ---- hard landing: a compression dip on top of the Jump_Land clip --- */
    if (this._landT < 1) {
      const k = Math.sin(Math.PI * clamp(this._landT * 1.25, 0, 1))
        * clamp(this._landAmp, 0, 1.4) * live;
      if (k > 0.005) {
        pdy += -0.16 * k;
        this._rot(b.thighL, X_AXIS, -0.26 * k);
        this._rot(b.thighR, X_AXIS, -0.26 * k);
        this._rot(b.calfL, X_AXIS, 0.46 * k);
        this._rot(b.calfR, X_AXIS, 0.46 * k);
        this._rot(b.footL, X_AXIS, -0.20 * k);
        this._rot(b.footR, X_AXIS, -0.20 * k);
        this._rot(b.spine1, X_AXIS, 0.16 * k);
        this._rot(b.spine2, X_AXIS, 0.14 * k);
        this._rot(b.neck1, X_AXIS, -0.16 * k);
      }
    }

    /* ---- mantle: reach, pull, plant. No clip in the pack for this ------- */
    if (this._mantleT < 1 && p.mantleClip !== 'climb1m') {
      const u = this._mantleT;
      const reach = Math.sin(Math.PI * clamp(u * 1.9, 0, 1));   // arms up first
      const pull = smoothstep(u, 0.25, 0.85);                   // then the body
      const w = live;
      this._rot(b.upArmL, X_AXIS, -1.15 * reach * w * (1 - pull * 0.6));
      this._rot(b.upArmR, X_AXIS, -1.15 * reach * w * (1 - pull * 0.6));
      this._rot(b.loArmL, X_AXIS, -0.55 * reach * w);
      this._rot(b.loArmR, X_AXIS, -0.55 * reach * w);
      this._rot(b.spine1, X_AXIS, 0.30 * pull * (1 - pull) * 4 * w);
      this._rot(b.thighL, X_AXIS, -1.05 * pull * (1 - pull) * 4 * w);
      this._rot(b.thighR, X_AXIS, -0.72 * pull * (1 - pull) * 4 * w);
      this._rot(b.calfL, X_AXIS, 1.25 * pull * (1 - pull) * 4 * w);
      this._rot(b.calfR, X_AXIS, 0.85 * pull * (1 - pull) * 4 * w);
    }


    /* ---- heal: hand to the hip pouch and back (healing-readability) ----- */
    if (this._healT < 1 && aimW < 0.6) {
      const k = Math.sin(Math.PI * this._healT) * live * (1 - aimW) * (1 - carryW);
      if (k > 0.01) {
        // right hand dips to the pouch on her left hip, then up to the chest
        _grip.set(0.17, 1.02, -0.02);
        _grip.lerp(_v4.set(0.12, 1.30, 0.16), smoothstep(this._healT, 0.45, 0.95));
        _pole.set(-0.55, -0.85, -0.2);
        this._ikArm('r', _grip, _pole, k * 0.9, null);
        this._curlFingers(this._fingerR, 0.75 * k, 0.6 * k);
        this._rot(b.spine2, X_AXIS, 0.10 * k);
        this._rot(b.neck1, X_AXIS, 0.14 * k);
        this._rot(b.head, X_AXIS, 0.10 * k);
      }
    }

    /* ---- death crumple fallback + weary slump (unchanged behaviour) ----- */
    return pdy;
  }

  /** Procedural crumple (knees buckle -> fold -> keel over); returns pelvis drop. */
  _deathFallback() {
    const b = this.b;
    const d = this._deadW;
    const k1 = smoothstep(this._dieT, 0.0, 0.28);
    const k2 = smoothstep(this._dieT, 0.18, 0.6);
    const k3 = smoothstep(this._dieT, 0.5, 1.05);
    this._rot(b.thighL, X_AXIS, -1.3 * k1 * d);
    this._rot(b.thighR, X_AXIS, (-0.95 * k1 - 0.2 * k3) * d);
    this._rot(b.calfL, X_AXIS, 2.3 * k1 * d);
    this._rot(b.calfR, X_AXIS, (1.9 * k1 + 0.2 * k3) * d);
    const slump = 0.72 * k2 * d;
    this._rot(b.spine1, X_AXIS, slump * 0.35);
    this._rot(b.spine2, X_AXIS, slump * 0.4);
    this._rot(b.spine3, X_AXIS, slump * 0.35);
    this._rot(b.pelvis, Z_AXIS, -0.55 * k3 * d);
    this._rot(b.neck1, X_AXIS, 0.32 * k2 * d);
    this._rot(b.head, X_AXIS, 0.42 * k2 * d);
    this._rot(b.upArmL, Z_AXIS, (0.15 * k2 + 0.18 * k3) * d);
    this._rot(b.upArmR, Z_AXIS, (-0.15 * k2 - 0.25 * k3) * d);
    return (-0.5 * k1 - 0.3 * k3) * d;
  }
}
