/**
 * CALIMA · the Boat Gaff in combat's hands (Milestone 2 area D, wave 2: the gaff as a weapon she can draw, carry and
 * stow; its verbs, the three lights and the hook-rip, are wave 3). Bible §8.1: "Boat Gaff (Oro, 0:35): fast combo;
 * hook-rip pulls a component off small and medium Instruments"; §12 quick slot 3.
 *
 *   const gaff = ensureGaff(ctx)        the one gaff state, published as ctx.combat.gaff (made on first use)
 *   gaff.owned                          false until the hand-over (hero.grantOroKit)
 *   gaff.draw() / gaff.stow()           ask for it in her right hand / back on its hanger
 *   gaff.want                           what was last asked (the animator's gaffLayer runs the hands to it)
 *   gaff.prop                           the held mesh (HeldGaff): butt at its group's origin, +Z along the haft to the
 *                                       beak, the hook toward the group's +Y (the layer parents it to her right hand)
 *
 * Combat asks; it never moves a hand (M2 seams: "Props in the hands"). The right hand is the gaff's, so a draw waits for
 * the lance to be back on her back, and the lance's draw (key 2) waits for the gaff to be back on its hanger
 * (`after`, read by quickslots.js).
 */
import * as THREE from 'three';
import { adoptWeaponAtlas } from '../hero/weaponAtlas.js';

export const HELD_GAFF_URL = '/models/armory/gaff-boat.glb';

/** The held gaff: the GLB under one Group (butt at the origin, +Z along the haft to the beak, the hook on +Y). */
export class HeldGaff {
  constructor(ctx, url = HELD_GAFF_URL) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'held-gaff';
    this.group.visible = false;
    this.inner = null;
    this.sockets = null;
    this.length = 0.625;
    this.ready = this._load(url);
  }

  async _load(url) {
    const loader = this.ctx.assets?.loader;
    if (!loader) return this;
    let gltf;
    try { gltf = await loader.loadAsync(url); } catch (e) { console.warn('[gaff] held gaff did not load', e); return this; }
    const root = gltf.scene;
    // the GLB is authored along +Y with its hook on +Z: lay +Y onto the group's +Z (the hook onto -Y, then turned to +Y)
    const inner = new THREE.Group();
    inner.name = 'held-gaff-inner';
    inner.add(root);
    inner.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
    // after +Y -> +Z the GLB's +Z (the hook) is on -Y: a half turn about +Z puts it on +Y
    inner.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI));
    const sockets = {};
    root.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
      if (!o.isMesh && o !== root && o.parent && o.parent.isMesh) sockets[o.name] = o.position.clone();
    });
    this.sockets = sockets;
    if (sockets.tip) this.length = sockets.tip.y;
    adoptWeaponAtlas(root);
    this.inner = inner;
    this.group.add(inner);
    return this;
  }

  /** The grip socket's distance from the butt along the haft (m). */
  get gripY() { return this.sockets?.grip?.y ?? 0.098; }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.(); } });
    this.inner = null;
  }
}

export class GaffWeapon {
  constructor(ctx) {
    this.ctx = ctx;
    this.owned = false;
    this.want = false;
    this.after = null;        // 'lance' | 'bow' | null: what the stow hands the right hand to once it is home
    this.prop = null;
    this.requests = 0;
  }

  /** The hand-over: she owns it from now (the held mesh loads now, once). */
  grant() {
    this.owned = true;
    if (!this.prop) this.prop = new HeldGaff(this.ctx);
    return this.prop.ready;
  }

  /** Ask for it in her right hand (the lance goes back first: the layer waits for it). */
  draw() {
    if (!this.owned) return false;
    this.after = null;
    const melee = this.ctx.combat?.melee;
    if (melee && melee.stance !== 'holstered') melee.holsterLance?.(true);
    if (!this.want) this.requests++;
    this.want = true;
    return true;
  }

  /** Ask for it back on its hanger; `after` names what the right hand takes next. */
  stow(after = null) {
    this.after = after;
    if (this.want) this.requests++;
    this.want = false;
    return true;
  }

  /** The animator's report: is it in her hand (owner handR), and is its sequence idle? */
  get inHand() { return !!this.ctx.player?.animator?.gaffInHand?.(); }
}

/** The one gaff state of this game, as ctx.combat.gaff (or on ctx when there is no combat yet). */
export function ensureGaff(ctx) {
  const host = ctx.combat || ctx;
  if (!host.gaff) host.gaff = new GaffWeapon(ctx);
  return host.gaff;
}

/* =====================================================================================================================
 * THE GAFF'S VERBS (Milestone 2 area D, wave 3; bible §8.1 "fast combo; hook-rip pulls a component off small and medium
 * Instruments", §12 "strike LMB · hook-rip R", §13 rule 5 "melee is performed by the body. Hips first"; KT1, KT3, KT7).
 *
 * Three lights chain on LMB (each press inside the last one's combo window takes the next), and the hook-rip on R. Each
 * verb's phases, sim seconds:
 *   W  wind-up    the hip turns away first, the fist comes back beside her hip (never above her shoulder)
 *   S  strike     the hip leads, the shoulders follow (KT7: >= 40 ms behind), the fist and the hook pass in front of her
 *   R  recover    back toward the ready; a press here (until `comboS` in) takes the next light
 * The hook-rip: W reach (the hook out in front at the part), H hook (contact: the part is caught), P pull (her pelvis
 * drops back 0.10-0.25 m as the part comes free, the lead foot steps back), R recover.
 * Rules only: the animator's gaffLayer.js runs the arm and the body from `gaff.verb` (read each step), and combat
 * resolves the contact on the step `gaff.contact` names.
 * ===================================================================================================================== */

export const GAFF_LIGHTS = Object.freeze([
  // 1: a forehand cut, high right to low left in front of her, the hook leading
  Object.freeze({ id: 'light1', W: 0.10, S: 0.10, R: 0.24, comboS: 0.20, impact: 16, tear: 8, reach: 1.45, arcDeg: 110 }),
  // 2: the backhand return, low left to right at her belt
  Object.freeze({ id: 'light2', W: 0.08, S: 0.10, R: 0.24, comboS: 0.20, impact: 16, tear: 8, reach: 1.45, arcDeg: 110 }),
  // 3: the hook's pull-cut: the beak driven forward at her chest and dragged back to her hip (the heaviest of the three)
  Object.freeze({ id: 'light3', W: 0.12, S: 0.12, R: 0.32, comboS: 0.0, impact: 24, tear: 14, reach: 1.55, arcDeg: 70 }),
]);
export const HOOK_RIP = Object.freeze({ id: 'hookRip', W: 0.18, H: 0.08, P: 0.28, R: 0.22, reach: 1.7, impact: 6, pelvisBack: 0.17, stepBack: 0.22 });

/** A verb's phase table: [['W', s], ['S', s], ['R', s]] (or the hook-rip's W H P R). */
export function verbPhases(v) {
  return v.id === 'hookRip' ? [['W', v.W], ['H', v.H], ['P', v.P], ['R', v.R]] : [['W', v.W], ['S', v.S], ['R', v.R]];
}
export const verbTotal = (v) => verbPhases(v).reduce((a, p) => a + p[1], 0);
/** The time of the contact (the end of S, or the end of H). */
export const verbContactAt = (v) => (v.id === 'hookRip' ? v.W + v.H : v.W + v.S);

/** The verb the gaff is playing now, and its clock (sim seconds). One at a time; a press buffers the next light. */
export class GaffVerbs {
  constructor() {
    this.verb = null;      // a GAFF_LIGHTS entry or HOOK_RIP
    this.i = -1;           // which light (0..2), -1 for the hook-rip
    this.t = 0;
    this.phase = '';
    this.k = 0;
    this.queued = false;
    this.contact = false;  // true on the one step the contact happens
    this.count = 0;
  }

  get busy() { return !!this.verb; }

  /** LMB: start light 1, or buffer the next while the current one can still chain. */
  strike() {
    if (!this.verb) { this._start(GAFF_LIGHTS[0], 0); return true; }
    if (this.i >= 0 && this.i < GAFF_LIGHTS.length - 1) { this.queued = true; return true; }
    return false;
  }

  /** R: the hook-rip (not mid-verb). */
  hookRip() {
    if (this.verb) return false;
    this._start(HOOK_RIP, -1);
    return true;
  }

  cancel() { this.verb = null; this.i = -1; this.t = 0; this.phase = ''; this.queued = false; this.contact = false; }

  _start(v, i) { this.verb = v; this.i = i; this.t = 0; this.queued = false; this.contact = false; this.count++; this._phase(); }

  _phase() {
    const P = verbPhases(this.verb);
    let a = 0;
    for (const [n, d] of P) { if (this.t < a + d) { this.phase = n; this.k = d > 0 ? (this.t - a) / d : 1; return; } a += d; }
    this.phase = P[P.length - 1][0]; this.k = 1;
  }

  /** Sim time. Returns 'contact' on the contact step, 'next' when a buffered light starts, 'end', or null. */
  step(dt) {
    this.contact = false;
    const v = this.verb;
    if (!v) return null;
    const c0 = verbContactAt(v), t0 = this.t;
    this.t += dt;
    let ev = null;
    if (t0 < c0 && this.t >= c0) { this.contact = true; ev = 'contact'; }
    // a buffered press takes the next light once this one's strike is done, inside its combo window
    if (this.queued && v.id !== 'hookRip' && this.t >= v.W + v.S && this.t <= v.W + v.S + v.comboS + 1e-9) {
      this._start(GAFF_LIGHTS[this.i + 1], this.i + 1);
      return ev ?? 'next';
    }
    if (this.t >= verbTotal(v)) { this.cancel(); return ev ?? 'end'; }
    this._phase();
    return ev;
  }
}
