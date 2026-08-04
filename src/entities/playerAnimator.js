/**
 * Procedural skeleton animation for the Aloy rig (no source animations exist).
 * STUB: the gauntlet builder replaces this with full locomotion/aim/crouch blending.
 */
export class PlayerAnimator {
  constructor(ctx, model) {
    this.ctx = ctx;
    this.model = model;
    this.bones = {};
    model.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
    });
  }

  update(dt, t) {
    // breathing idle placeholder
    const pelvis = this.bones['pelvis_05'];
    if (pelvis && this.ctx.player) {
      // subtle bob with movement
      const speed = this.ctx.player.moveSpeed ?? 0;
      pelvis.position.y = (pelvis.userData.baseY ??= pelvis.position.y)
        + Math.sin(t * (4 + speed * 2)) * 0.5 * Math.min(1, speed * 0.2 + 0.06);
    }
  }
}
