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
