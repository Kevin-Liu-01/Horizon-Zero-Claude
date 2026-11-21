import * as THREE from 'three';
import { liveKindClass, deg } from './live-kind.js';
import { KilnBrain, KILN_RULES } from './rules.js';
import { KILN_ROSTER } from './form.js';
import { M3_LIVE_URLS } from './files.js';
import { fireFlicker, FIRE_GLOW } from './fire.js';

export { FIRE_GLOW, fireFlicker } from './fire.js';

/**
 * THE KILN AS A LIVE KIND (Milestone 3 wave 3c, area C; BUILD M3.4, IK1-IK4). Its body is the surfaced GLB
 * (tools/build/instruments/gen-m3-art.mjs, public/models/instruments/kiln.glb); its brain is a `KilnBrain` (./rules.js):
 * its own, or the Yards encounter's (./yards.js binds each of the encounter's two Kilns to one of these: `m.brain`), so
 * what is drawn is the brain's state and nothing else (rule 21).
 *
 *   the pose      the brain's x, z and heading (the machine grounds it on the drawn terrain)
 *   the door      sprung (Brine on the hot door, IK2): it swings 108 deg on its left hinge and the coal bed is seen
 *                 behind it (the GLB's 'kiln-fire' heart and 'kiln-crust' crust, the one place a hull glows); the two
 *                 glows flicker (`fireFlicker`). Shut: they are dark (the fire sits behind the shut door)
 *   the stagger   while staggered it rocks back on its legs where it stands (the art page's motion)
 *   the stack     raised on its trunnion while it is hostile (the mortar's aim), else lowered
 *   the hose      plugged into a wellhead (or coupling): a hose from its coupling to the head
 *   the lamp      the binding's `lampWant` (./yards.js: cold dark, plugged calm, awake wary, seeing her hostile)
 *   kilnParts     { hose: { state } }: the hit-parts record a Davit reads (DavitBrain: an `off` part is re-seated)
 */
export const KILN_ID = 'kiln';
export const KILN_URL = M3_LIVE_URLS.kiln;

const Base = liveKindClass({ id: KILN_ID, displayName: 'Kiln', bodyRadius: 2.0, maxHealth: 1400 });

export class KilnLive extends Base {
  constructor(ctx, manager, opts = {}) {
    super(ctx, manager, opts);
    this.brain = opts.brain || new KilnBrain({ x: this.position.x, z: this.position.z, heading: this.heading });
    this.kilnParts = { hose: { state: 'sealed' } };
    this.fireMats = [];
    this.model.traverse((n) => {
      if (!n.isMesh) return;
      const ms = Array.isArray(n.material) ? n.material : [n.material];
      for (const m of ms) if (m && /fire|crust/.test(m.name || '')) { m.emissiveIntensity = 0; this.fireMats.push(m); }
    });
    this._open = 0;
    this._tilt = 0;
    this._t = 0;
    this._seed = Math.random() * 10;
    this.hostile = false;
    this.wellAt = null;          // { x, y, z } of the head it is plugged into (the binding's; for the hose)
    this._hose = null;
    this._hoseKey = null;
  }

  drive() {
    const B = this.brain;
    this.pose.x = B.x; this.pose.z = B.z; this.pose.heading = B.heading;
    super.drive();
  }

  animateKind(dt) {
    const B = this.brain;
    this._t += dt;
    // the door: it springs open fast and swings shut slower (IK2's window is the brain's staggerT)
    const want = B.door === 'sprung' ? 1 : 0;
    this._open += (want - this._open) * Math.min(1, dt * (want ? 14 : 4));
    if (this.tools.door) this.tools.door.rotation.y = -deg(108) * this._open;
    const g = fireFlicker(this._t, this._open > 0.02 ? Math.min(1, this._open * 1.4) : 0, this._seed);
    for (const m of this.fireMats) m.emissiveIntensity = /crust/.test(m.name) ? g * FIRE_GLOW.crustK : g;
    // the stagger: rocked back on its legs where it stands
    if (B.staggered) {
      const u = 1 - B.staggerT / KILN_RULES.staggerS;
      this.body.rotation.x = -0.05 * Math.sin(u * Math.PI) - 0.015 * Math.sin(u * 40) * (1 - u);
    } else this.body.rotation.x *= Math.max(0, 1 - dt * 6);
    // the stack: up to aim while hostile
    const tw = this.hostile ? 0.42 : 0;
    this._tilt += Math.sign(tw - this._tilt) * Math.min(Math.abs(tw - this._tilt), 0.3 * dt);
    if (this.tools.stack) this.tools.stack.rotation.x = this._tilt;
    this._hoseStep();
  }

  /** The hose from its coupling to the head while it is coupling (after half a second) or plugged. */
  _hoseStep() {
    const B = this.brain, on = (B.state === 'plugged' || (B.state === 'coupling' && B.stateT > 0.5)) && this.wellAt;
    const key = on ? `${B.well?.id}:${B.x.toFixed(2)}:${B.z.toFixed(2)}:${B.heading.toFixed(3)}` : null;
    if (key === this._hoseKey) return;
    this._hoseKey = key;
    this._dropHose();
    if (!on) return;
    const c = B.couplingWorld(), gy = this.position.y;
    const a = new THREE.Vector3(c.x, gy + c.y, c.z), b = new THREE.Vector3(this.wellAt.x, this.wellAt.y + 1.25, this.wellAt.z);
    const mid = a.clone().add(b).multiplyScalar(0.5); mid.y = Math.min(a.y, b.y) - 0.45;
    const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 20, 0.12, 8, false);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x26231f, roughness: 0.8 }));
    mesh.name = 'kiln-wellhead-hose'; mesh.castShadow = true; mesh.receiveShadow = true;
    this.ctx.scene?.add(mesh);
    this._hose = mesh;
  }

  _dropHose() {
    if (!this._hose) return;
    this._hose.removeFromParent(); this._hose.geometry.dispose(); this._hose.material.dispose(); this._hose = null;
  }

  disposeKind() { this._dropHose(); }
}

/** The descriptor `ensureKind` registers (./live-kind.js). The GLB is 1:1 (its r5Size height is the roster's 5.5 m). */
export const KILN_KIND = Object.freeze({
  id: KILN_ID, Cls: KilnLive, sizeClass: KILN_ROSTER.cls, height: KILN_ROSTER.H,
  spec: Object.freeze({ url: KILN_URL, targetHeight: KILN_ROSTER.H, yaw: 0 }),
});
