import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Machine manager. STUB: spawns each machine model at a fixed spot with a slow
 * idle bob. The gauntlet builder replaces this with the real Machine classes
 * (state machines, perception, attacks, part damage).
 */
export class Machines {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];

    const spawn = (name, x, z, yaw = 0) => {
      const src = ctx.assets.models[name];
      const root = name === 'watcher' || name === 'aloy'
        ? skeletonClone(src.root)
        : src.root.clone();
      root.position.set(x, ctx.terrain.getHeight(x, z), z);
      root.rotation.y = yaw;
      ctx.scene.add(root);
      const m = {
        kind: name, root,
        position: root.position,
        alive: true, health: 100, maxHealth: 100,
        state: 'patrol',
        update(dt, t) {},
      };
      this.list.push(m);
      return m;
    };

    spawn('watcher', -30, -40, 0.8);
    spawn('watcher', -60, 10, -0.5);
    spawn('watcher', 40, -70, 2.2);
    spawn('watcher', 90, 30, 3.0);
    spawn('sawtooth', -110, -90, 0.4);
    spawn('sawtooth', 120, -130, -2.0);
    spawn('behemoth', -160, 90, 1.2);
    spawn('thunderjaw', 30, -220, 0.2);
  }

  update(dt, t) {
    for (const m of this.list) m.update(dt, t);
  }
}
