/**
 * HZD-style HUD. STUB: gauntlet builder implements health, compass, arrows,
 * objectives, damage numbers, death/victory screens.
 */
export class HUD {
  constructor(ctx) {
    this.ctx = ctx;
    this.rootEl = document.getElementById('hud');
  }
  update(dt, t) {}
}
