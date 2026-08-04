import * as THREE from 'three';

/**
 * Hunter camp: campfire + NPC. STUB baseline — builder adds fire particles,
 * light flicker, tents, respawn glow.
 */
export class Camp {
  constructor(ctx) {
    this.ctx = ctx;
    const x = 22, z = 30;
    const y = ctx.terrain.getHeight(x, z);

    const npc = ctx.assets.models.npc.root.clone();
    npc.position.set(x, y, z);
    npc.rotation.y = -2.2;
    ctx.scene.add(npc);
    this.npc = npc;
  }
  update(dt, t) {}
}
