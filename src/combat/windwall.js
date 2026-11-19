/**
 * CALIMA · the Pine Windwall as a held prop (Milestone 2 area D, wave 2: the mesh and its fan; the guard, the parry,
 * the bash and the plant are wave 3). Bible §8.1: "Windwall (crescent fan-shield, nine slats) ... guard, parry, bash,
 * and plant as 0.9 m of cover that blocks line of sight".
 *
 *   const ww = new HeldWindwall(ctx)     loads public/models/armory/windwall-pine.glb (no textures: the weapon atlas)
 *   await ww.ready
 *   ww.setOpen(k)                        0.07 closed (the stack along her forearm, its slats' edges showing, as the
 *                                        stowed copy in kit-oro.glb) .. 1 open (the crescent fan)
 *   ww.group                             the rivet at its origin, the closed slats along +Y, the face's normal +Z
 *
 * The fan is one uniform in the vertex program: each vertex carries its slat index (`_slat`, fractional on the woven
 * leaf and the lacing) and turns about +Z through the rivet by s / 8 of the spread (the recipe's `slatAngle`), so the
 * open shield is still one draw and its leaf stretches between the slats as they part.
 */
import * as THREE from 'three';
import { adoptWeaponAtlas } from '../hero/weaponAtlas.js';

export const HELD_WINDWALL_URL = '/models/armory/windwall-pine.glb';
/** The recipe's fan (tools/build/recipes/weapons/lib/orokit-geo.mjs WINDWALL): nine slats over 150 degrees. */
export const WINDWALL_FAN = Object.freeze({ slats: 9, spreadDeg: 150, closed: 0.07 });

/** Install the fan on a material (once): returns its `uOpen` uniform. */
export function installFan(material) {
  if (material.userData.wwOpen) return material.userData.wwOpen;
  const u = { value: 0 };
  const k = (WINDWALL_FAN.spreadDeg * Math.PI / 180) / (WINDWALL_FAN.slats - 1);
  material.userData.wwOpen = u;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOpen = u;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float _slat;\nuniform float uOpen;\nconst float WW_K = ${k.toFixed(6)};`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  float wwA = _slat * WW_K * uOpen; float wwC = cos(wwA), wwS = sin(wwA);
  objectNormal = vec3(wwC * objectNormal.x - wwS * objectNormal.y, wwS * objectNormal.x + wwC * objectNormal.y, objectNormal.z);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  transformed = vec3(wwC * transformed.x - wwS * transformed.y, wwS * transformed.x + wwC * transformed.y, transformed.z);`);
  };
  material.customProgramCacheKey = () => 'windwall-fan';
  material.needsUpdate = true;
  return u;
}

export class HeldWindwall {
  constructor(ctx, url = HELD_WINDWALL_URL) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'held-windwall';
    this.group.visible = false;
    this.open = WINDWALL_FAN.closed;
    this.u = null;
    this.sockets = null;
    this.ready = this._load(url);
  }

  async _load(url) {
    const loader = this.ctx.assets?.loader;
    if (!loader) return this;
    let gltf;
    try { gltf = await loader.loadAsync(url); } catch (e) { console.warn('[windwall] held windwall did not load', e); return this; }
    const root = gltf.scene;
    const sockets = {};
    adoptWeaponAtlas(root);
    root.traverse((o) => {
      // (no shadow yet: the depth pass has not got the fan, so it would cast the closed stack: wave 3 gives it one)
      if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; o.frustumCulled = false; o.material = o.material.clone(); this.u = installFan(o.material); }
      else if (o !== root && o.parent?.isMesh) sockets[o.name] = o.position.clone();
    });
    this.sockets = sockets;
    this.group.add(root);
    this.setOpen(this.open);
    return this;
  }

  setOpen(k) {
    this.open = Math.max(0, Math.min(1, +k || 0));
    if (this.u) this.u.value = this.open;
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); o.material?.dispose?.(); } });
  }
}

/* =====================================================================================================================
 * THE WINDWALL'S VERBS (Milestone 2 area D, wave 3; bible §8.1 "guard, parry, bash, and plant as 0.9 m of cover that
 * blocks line of sight", §12 "aim or guard RMB · bash LMB · plant Windwall X while guarding"; KT3, KT4).
 *
 * The Windwall is worn closed on her left forearm; it guards while the gaff is in her right hand (RMB), the fan opening
 * on her forearm as the arm comes up across her front. Rules only here (no THREE): the animator's windwallLayer.js runs
 * the arm from `ww.phase`, and combat asks.
 *
 *   ww.guard(on)        RMB down / up (only with the gaff out, or nothing in her hands but the Windwall)
 *   ww.bash()           LMB while guarding: the lead foot steps and the fan is driven forward
 *   ww.plant()          X while guarding: she sets it upright on the ground in front of her (0.9 m of cover)
 *   ww.pickUp()         X again within reach of it, or it is lifted when she walks away (PICKUP_FAR)
 *   ww.block(hit)       a hit coming at her: { from: {x, z}, at: sim t } -> 'parry' | 'block' | null (not covered)
 *   ww.step(dt, me)     sim time; `me` = { x, z, heading }
 * ===================================================================================================================== */

export const WINDWALL = Object.freeze({
  /** request to a full guard (s; KT3 band 0.20-0.30) and back */
  openS: 0.233, closeS: 0.2,
  /** the guard covers a hit whose source is inside this arc about her facing (deg, whole) */
  guardArcDeg: 120,
  /** the parry window: a hit landing this long after the fan locks open is parried (s; KT4 band 0.15-0.22) */
  parryS: 0.183,
  /** what a block lets through (a parry lets through nothing and staggers the striker) */
  blockK: 0.15,
  /** the bash */
  bashS: 0.45, bashImpact: 10, bashReach: 1.4, bashStagger: 0.6,
  /** the plant: the time to set it, how far in front of her, its cover (the open fan stood on its chord, 0.91 m), and
   *  how far she can walk before it is lifted back onto her arm */
  plantS: 0.5, plantAhead: 0.42, plantH: 0.91, plantW: 0.47, plantT: 0.06, pickupReach: 1.6, PICKUP_FAR: 9,
});

const DEG = Math.PI / 180;

/** Does a guard facing `heading` (rad, atan2(dx, dz)) cover a hit from (dx, dz) (the striker's offset from her)? */
export function guardCovers(heading, dx, dz) {
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return true;
  const c = (Math.sin(heading) * dx + Math.cos(heading) * dz) / d;
  return c >= Math.cos(WINDWALL.guardArcDeg * 0.5 * DEG);
}

/**
 * The planted Windwall as an occluder (src/instruments/lib/sight.js's box), standing `plantAhead` in front of (x, z) on
 * ground `y`, its face square to `heading`.
 */
export function plantShape(x, y, z, heading, out = { type: 'box', cx: 0, cy: 0, cz: 0, hx: 0, hy: 0, hz: 0, yaw: 0 }) {
  const W = WINDWALL;
  out.type = 'box';
  out.cx = x + Math.sin(heading) * W.plantAhead; out.cz = z + Math.cos(heading) * W.plantAhead;
  out.cy = y + W.plantH * 0.5;
  out.hx = W.plantW * 0.5; out.hy = W.plantH * 0.5; out.hz = W.plantT * 0.5;
  out.yaw = heading;
  return out;
}

export class WindwallState {
  constructor() {
    this.owned = false;
    this.phase = 'stowed';    // 'stowed' | 'opening' | 'guard' | 'closing' | 'bash' | 'planting' | 'planted'
    this.t = 0;               // seconds in the phase
    this.simT = 0;
    this.open = WINDWALL_FAN.closed;
    this.want = false;        // RMB
    this.guardUpAt = -1;      // sim t the fan locked open (the parry window's start)
    this.requestAt = -1;
    this.plantedAt = null;    // { x, y, z, heading } while planted
    this.bashes = 0; this.parries = 0; this.blocks = 0; this.plants = 0;
    this._bashHit = false;
  }

  /** Is the fan up and covering her (guard, or the bash's drive)? */
  get guarding() { return this.phase === 'guard' || this.phase === 'bash'; }
  get onArm() { return this.phase !== 'planting' && this.phase !== 'planted'; }

  guard(on) {
    if (!this.owned || !this.onArm) return false;
    if (on && !this.want) this.requestAt = this.simT;
    this.want = !!on;
    return true;
  }

  bash() {
    if (this.phase !== 'guard') return false;
    this.phase = 'bash'; this.t = 0; this.bashes++; this._bashHit = false;
    return true;
  }

  plant() {
    if (this.phase !== 'guard') return false;
    this.phase = 'planting'; this.t = 0; this.plants++;
    return true;
  }

  pickUp() {
    if (this.phase !== 'planted') return false;
    this.phase = 'closing'; this.t = 0; this.plantedAt = null; this.want = false;
    return true;
  }

  /**
   * A hit coming at her from `from` (world {x, z}); `me` her {x, z, heading}. Returns 'parry' | 'block' | null and
   * counts it. A parry lands inside `parryS` of the fan locking open.
   */
  block(from, me) {
    if (!this.guarding) return null;
    if (!guardCovers(me.heading, from.x - me.x, from.z - me.z)) return null;
    if (this.phase === 'guard' && this.guardUpAt >= 0 && this.simT - this.guardUpAt <= WINDWALL.parryS + 1e-9) { this.parries++; return 'parry'; }
    this.blocks++;
    return 'block';
  }

  /**
   * Sim time. Returns an event name on the step it happens ('up', 'bash-contact', 'planted', 'closed') or null.
   * `me` { x, y, z, heading } places the plant.
   */
  step(dt, me = null) {
    const W = WINDWALL;
    this.simT += dt; this.t += dt;
    let ev = null;
    switch (this.phase) {
      case 'stowed':
        this.open = WINDWALL_FAN.closed;
        if (this.want && this.owned) { this.phase = 'opening'; this.t = 0; }
        break;
      case 'opening': {
        const k = Math.min(1, this.t / W.openS);
        this.open = WINDWALL_FAN.closed + (1 - WINDWALL_FAN.closed) * k;
        if (!this.want) { this.phase = 'closing'; this.t = (1 - k) * W.closeS; }
        else if (k >= 1) { this.phase = 'guard'; this.t = 0; this.guardUpAt = this.simT; ev = 'up'; }
        break;
      }
      case 'guard':
        this.open = 1;
        if (!this.want) { this.phase = 'closing'; this.t = 0; }
        break;
      case 'bash':
        this.open = 1;
        if (!this._bashHit && this.t >= W.bashS * 0.42) { this._bashHit = true; ev = 'bash-contact'; }
        if (this.t >= W.bashS) { this.phase = this.want ? 'guard' : 'closing'; this.t = 0; if (this.phase === 'guard') this.guardUpAt = -1; }
        break;
      case 'planting':
        this.open = 1;
        if (this.t >= W.plantS) {
          this.phase = 'planted'; this.t = 0; this.want = false; ev = 'planted';
          if (me) this.plantedAt = { x: me.x, y: me.y ?? 0, z: me.z, heading: me.heading };
        }
        break;
      case 'planted':
        this.open = 1;
        if (me && this.plantedAt && Math.hypot(me.x - this.plantedAt.x, me.z - this.plantedAt.z) > W.PICKUP_FAR) this.pickUp();
        break;
      case 'closing': {
        const k = Math.min(1, this.t / W.closeS);
        this.open = 1 - (1 - WINDWALL_FAN.closed) * k;
        if (this.want && this.owned) { this.phase = 'opening'; this.t = (1 - k) * W.openS; }
        else if (k >= 1) { this.phase = 'stowed'; this.t = 0; this.open = WINDWALL_FAN.closed; ev = 'closed'; }
        break;
      }
    }
    return ev;
  }
}
