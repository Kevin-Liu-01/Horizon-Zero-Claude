import * as THREE from 'three';
import { Face, installFaceGeometry, cavityWarmMesh } from './face.js';

/**
 * CALIMA · who looks at whom, and who speaks (people; BUILD M1.5f). `ctx.people.faces`.
 *
 * Every near person's face (Person.face) and Brea's (installed here on her Brea_Skin, hero-art's mesh: the rig is added at
 * load as morph targets, her geometry's vertices, index and hide mask are untouched) ask this once a frame, from the first
 * face drawn, what to do:
 *   - a dialogue card is up (the presenter's `card`: { who, text, cast }): the speaker's mouth runs the card's text at the
 *     reading cadence; every one of the scene's cast looks at the other speaker's eyes (the speaker at the one it speaks to);
 *   - Brea's field turn (the presenter's `sub`): her mouth runs it;
 *   - otherwise a person within 5.5 m whose head turns to her (Person._look) looks her in the eye; anyone else lets the eyes
 *     wander a little. Everyone blinks.
 * `live()` is false in a ?shot film unless `alive` is set (a probe that wants faces alive in a film sets it).
 */
const LOOK_R = 5.5;
const _t = new THREE.Vector3();

export class FaceDirector {
  constructor(ctx) {
    this.ctx = ctx;
    // C5: the mouth's cavity program is linked by the boot's warm-up (face.js cavityWarmMesh)
    ctx?.engine?.addWarmExtra?.(cavityWarmMesh());
    this.list = [];            // every live Face (no Set: a frame's walk allocates nothing)
    this.brea = null;
    this.alive = null;         // null: alive in play, at rest in a ?shot film
    this._frame = -1;
    this._card = null;
    this._sub = null;
    this.targets = new Map();  // Face -> Vector3 it looks at this frame
    this.breaError = null;
  }

  frame() { return this.ctx.engine?.frames ?? -1; }
  live() { return this.alive != null ? !!this.alive : !this.ctx.params?.has?.('shot'); }

  add(face) { this.list.push(face); this.targets.set(face, new THREE.Vector3()); return face; }
  remove(face) {
    const i = this.list.indexOf(face);
    if (i >= 0) this.list.splice(i, 1);
    this.targets.delete(face);
    if (this.brea === face) this.brea = null;
  }

  /** Brea's face, once her body stands (her skin's rig is built on its geometry the first time). */
  installBrea() {
    if (this.brea || this.breaError) return this.brea;
    const model = this.ctx.player?.model;
    if (!model) return null;
    let mesh = null;
    model.traverse((o) => { if (!mesh && o.isSkinnedMesh && o.name === 'Brea_Skin') mesh = o; });
    if (!mesh) { if (model.children.length) this.breaError = 'no Brea_Skin'; return null; }
    const patch = this.ctx.assets?.models?.hero?.extras?.r5Paint?.layout?.eyePatch;
    const rig = installFaceGeometry(mesh, patch);
    if (!rig) { this.breaError = mesh.geometry.userData.faceRigError || 'no rig'; return null; }
    this.brea = this.add(new Face(mesh, { seed: 4242, director: this, name: 'brea' }));
    return this.brea;
  }

  /** The face of a speaker id in the writing ('brea', 'ansel', 'mise'; M2 wave 3: 'oro' and the Holds' cast, ./holds.js). */
  faceOf(who) {
    if (who === 'brea') return this.brea;
    return this.ctx.systemsGame?.people?.[who]?.face || this.ctx.people?.person?.(who)?.face || null;
  }

  /** Once a frame, before the first face of the frame updates. */
  beforeFace(face, frame) {
    if (frame === this._frame) return;
    this._frame = frame;
    this.direct();
  }

  direct() {
    // at rest (a ?shot film): nobody looks at anyone (a person's head look reads its face's target)
    if (!this.live()) { for (let i = 0; i < this.list.length; i++) this.list[i].target = null; return; }
    const P = this.ctx.systemsGame?.present;
    const card = P?.card || null, sub = P?.sub || null;
    if (card !== this._card) {
      if (this._card) for (const who of this._card.cast || []) { const f = this.faceOf(who); if (f && who !== card?.who) f.hush(); }
      this._card = card;
      if (card) this.faceOf(card.who)?.say(card.text);
    }
    if (sub !== this._sub) {
      this._sub = sub;
      const breaName = this.ctx.systemsGame?.S?.speakers?.brea?.name;
      if (sub && (!sub.name || sub.name === breaName)) this.brea?.say(sub.text);
    }
    const L = this.list;
    for (let i = 0; i < L.length; i++) L[i].target = null;
    const brea = this.brea;
    if (card) {
      const cast = card.cast || [card.who];
      const speaker = this.faceOf(card.who);
      // the one the speaker speaks to: Brea when an NPC speaks, else the first other of the cast with a face
      let listener = null;
      if (card.who !== 'brea') listener = brea;
      else for (let i = 0; i < cast.length; i++) { if (cast[i] === 'brea') continue; const f = this.faceOf(cast[i]); if (f) { listener = f; break; } }
      for (let i = 0; i < cast.length; i++) {
        const f = this.faceOf(cast[i]);
        if (!f) continue;
        const other = f === speaker ? listener : speaker;
        if (!other || other === f) continue;
        f.target = other.eyesWorld(this.targets.get(f));
      }
      return;
    }
    // play: a near person whose head turns to her looks her in the eye
    if (!brea) return;
    brea.eyesWorld(_t);
    for (let i = 0; i < L.length; i++) {
      const f = L[i], p = f.person;
      if (!p || !p.look || p.frozen) continue;
      const g = p.group.position, dx = _t.x - g.x, dz = _t.z - g.z;
      if (dx * dx + dz * dz > LOOK_R * LOOK_R) continue;
      f.target = this.targets.get(f).copy(_t);
    }
  }

  /** What the faces are doing now (a probe's surface). */
  info() {
    return this.list.map((f) => ({ name: f.name, blinks: f.blinks, speaking: !!f.speaking, yawDeg: +(f.yaw * 57.2958).toFixed(2), pitchDeg: +(f.pitch * 57.2958).toFixed(2), target: !!f.target }));
  }

  dispose() {
    for (const f of this.list.slice()) f.dispose();
    this.list.length = 0;
    this.targets.clear();
    this.brea = null;
  }
}
