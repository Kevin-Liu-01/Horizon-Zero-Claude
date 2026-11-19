/**
 * THE POT CAST (Milestone 2 area D, wave 3; the rules and the flight are src/combat/pots.js, stepped here on sim time).
 * Installed on PlayerAnimator (installMethods); it runs after the Windwall layer and owns her LEFT arm while a cast runs
 * (the right hand keeps the gaff, or nothing; the left forearm keeps the closed Windwall).
 *
 * A pendulum, never overhand (bible §13 rule 5): the left hand goes back to the pot on the belt beside her lumbar (T)
 * and closes on it; the arm swings it down and back behind her thigh (B); then forward, low past her hip and up, her
 * hip turning into it first (F); the fingers open with the hand in front of her below her chest (R: the pot leaves
 * from the hand's own point, src/combat/pots.js `release`); the arm follows through low and comes back down (O).
 * Kevin's bars: the hand and forearm stay below her shoulders and in front of the head plane at every step.
 *
 * The three pots she carries hang on the belt at her left lumbar (`BELT`), one mesh each, shown by what she carries.
 */
import * as THREE from 'three';
import { ease } from './handling.js';
import { POT_CAST, POTS, POT_ORDER } from '../../combat/pots.js';

const Y_UP = new THREE.Vector3(0, 1, 0);
/** Off her pelvis (char, +x her left, +z forward): the belt's three pots, the take, the back swing's low point. */
const BELT = [new THREE.Vector3(0.07, 0.02, -0.15), new THREE.Vector3(0.125, 0.02, -0.125), new THREE.Vector3(0.165, 0.015, -0.075)];
const TAKE_OFF = new THREE.Vector3(0.02, 0.0, -0.035);           // the palm a little behind and outside the pot it takes
const BACK = new THREE.Vector3(0.17, -0.22, -0.20);
const LOW = new THREE.Vector3(0.13, -0.26, 0.10);
/** Off her left shoulder: the release (in front of her, below the chest) and the follow-through. */
const RELEASE = new THREE.Vector3(-0.03, -0.26, 0.38);
const FOLLOW = new THREE.Vector3(-0.05, -0.30, 0.40);
const POLE_BACK = new THREE.Vector3(0.45, -0.35, -0.82).normalize();
const POLE_FWD = new THREE.Vector3(0.70, -0.70, -0.10).normalize();
/** The hip's turn: away as the pot swings back, into the cast as it comes forward (rad, + her left). */
const HIP_BACK = 0.12, HIP_FWD = -0.14;

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _pl = new THREE.Vector3(), _sh = new THREE.Vector3();
const _w = new THREE.Vector3(), _pole = new THREE.Vector3(), _hand = new THREE.Vector3();
const _ph = ['', 0];

function bez(a, b, c, t, out) {
  const u = 1 - t;
  return out.set(u * u * a.x + 2 * u * t * b.x + t * t * c.x, u * u * a.y + 2 * u * t * b.y + t * t * c.y, u * u * a.z + 2 * u * t * b.z + t * t * c.z);
}

export class PotLayer {
  _potState() {
    return this._pots || (this._pots = { w: 0, start: new THREE.Vector3(), startOk: false, castN: -1, releasedAt: -1, simT: 0, belt: null, hip: 0, releaseH: null });
  }

  potInfo(out = {}) {
    const S = this._potState(), K = this.ctx.combat?.pots;
    K?.phase?.(_ph);
    out.phase = _ph[0]; out.k = _ph[1]; out.w = S.w; out.releasedAt = S.releasedAt; out.releaseH = S.releaseH; out.hip = S.hip;
    return out;
  }

  /** The belt's pots: three small meshes on her model, placed off her pelvis each step, shown by what she carries. */
  _potBelt(K) {
    const S = this._potState(), view = K.view;
    if (!view) return;
    if (!S.belt) {
      S.belt = BELT.map((_, i) => { const m = new THREE.Mesh(view.geo.brine, view.mat); m.name = `belt-pot-${i}`; m.castShadow = true; this.model.add(m); return m; });
    }
    // the slots in the belt's order: what she carries, Brine first
    let slot = 0;
    const held = K.casting && !K.casting.released ? K.casting.id : null;
    let skip = held ? 1 : 0;
    this._charOf(this.b.pelvis.bone, _pl);
    const sc = this.model.scale?.x || 1;
    for (const id of POT_ORDER) {
      for (let n = 0; n < K.belt.count[id] && slot < BELT.length; n++) {
        if (skip && id === held) { skip = 0; continue; }
        const m = S.belt[slot++];
        if (m.geometry !== view.geo[id]) m.geometry = view.geo[id];
        m.position.copy(_pl).add(BELT[slot - 1]).multiplyScalar(1 / sc);
        m.scale.setScalar(1 / sc);
        m.rotation.set(0.15, 0, -0.2);
        m.visible = true;
      }
    }
    for (; slot < BELT.length; slot++) S.belt[slot].visible = false;
  }

  /** Each step after the Windwall layer. Returns the arm weight it took. */
  _potLayer(dt) {
    const S = this._potState(), K = this.ctx.combat?.pots, b = this.b;
    S.simT += dt;
    if (!K?.owned || !b.handL || !b.upArmL || !b.pelvis) { S.w = 0; return 0; }
    K.step(dt);
    this._potBelt(K);
    const c = K.casting;
    if (!c) { S.w = 0; S.hip = 0; S.startOk = false; K.view?.setHeld(null); return 0; }
    if (K.casts !== S.castN) {
      S.castN = K.casts;
      this._charOf(b.handL.bone, S.start); S.startOk = true;
      // (the Windwall comes down first: the left arm is the cast's)
      const ww = this.ctx.combat?.windwall;
      if (ww?.want) ww.guard(false);
    }
    K.phase(_ph);
    const ph = _ph[0], k = _ph[1];
    this._charOf(b.pelvis.bone, _pl);
    this._charOf(b.upArmL.bone, _sh);
    // the pot it takes: the first belt slot of what she casts
    _v1.copy(_pl).add(BELT[0]).add(TAKE_OFF);
    let w = 1, hip = 0;
    const W = _w, pole = _pole;
    if (ph === 'T') {
      const e = ease(k);
      _v2.copy(S.start).lerp(_v1, 0.5); _v2.x += 0.06; _v2.y -= 0.02;
      bez(S.start, _v2, _v1, e, W);
      pole.copy(POLE_BACK);
      w = ease(Math.min(1, k * 2.2));
    } else if (ph === 'B') {
      const e = ease(k);
      W.copy(_v1).lerp(_v3.copy(_pl).add(BACK), e);
      pole.copy(POLE_BACK);
      hip = HIP_BACK * e;
    } else if (ph === 'F' || (ph === 'R')) {
      const e = ph === 'R' ? 1 : k;
      // the pendulum: from behind her thigh, low past her hip, up to the release in front of her
      _v2.copy(_pl).add(LOW);
      bez(_v3.copy(_pl).add(BACK), _v2, _v1.copy(_sh).add(RELEASE), e, W);
      pole.copy(POLE_BACK).lerp(POLE_FWD, ease(e)).normalize();
      hip = HIP_BACK + (HIP_FWD - HIP_BACK) * ease(e);
    } else {
      // the follow-through, then the arm lets go back to the clip
      const e = ease(Math.min(1, k / 0.45));
      W.copy(_sh).add(RELEASE).lerp(_v1.copy(_sh).add(FOLLOW), e);
      pole.copy(POLE_FWD);
      hip = HIP_FWD * (1 - ease(k));
      w = 1 - ease(Math.max(0, (k - 0.4) / 0.6));
    }
    S.w = w; S.hip = hip;
    // the hip leads (standing; a stride owns her hips) and the shoulders follow it
    const standW = 1 - Math.min(1, this._moveW || 0);
    if (hip !== 0) {
      this._rot(b.pelvis, Y_UP, hip * standW * w);
      if (b.spine2) this._rotL(b.spine2, Y_UP, hip * 0.3 * w);
      if (b.head) this._rotL(b.head, Y_UP, -hip * (0.3 + standW) * 0.7 * w);
    }
    this._ikArm('l', W, pole, w, null);
    // the fingers: open reaching back, closed on the pot from the end of the take to the release, open after
    const closed = (ph === 'B' || ph === 'F') || (ph === 'T' && k > 0.8);
    const grip = this.melee?.gripLFore ?? this.melee?.gripLButt ?? null;
    if (grip) this._wrapFingers('l', grip, closed ? 0.75 : 0.2, closed ? 0.45 : 0.15, w);
    else if (this._fingerL) this._curlFingers(this._fingerL, (closed ? 0.9 : 0.2) * w, (closed ? 0.5 : 0.1) * w);
    K.view?.setHeld(closed && !c.released ? c.id : null, b.handL.bone);
    // the release: the pot leaves from the hand's own point
    if (!c.released && c.t >= POT_CAST.releaseAt - 1e-9) {
      b.handL.bone.updateWorldMatrix(true, false);
      b.handL.bone.getWorldPosition(_hand);
      this._charOf(b.handL.bone, _v2);
      S.releaseH = +(_v2.y - _sh.y).toFixed(3);   // the hand off her shoulder at the release (m; <= 0: at or below it)
      K.release(_hand);
      S.releasedAt = S.simT;
    }
    return w;
  }
}

export { POTS };
