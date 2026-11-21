import { liveKindClass } from '../kiln/live-kind.js';
import { DavitBrain, DAVIT_RULES } from './rules.js';
import { DAVIT_ROSTER } from './form.js';
import { M3_LIVE_URLS } from '../kiln/files.js';

/**
 * THE DAVIT AS A LIVE KIND (Milestone 3 wave 3c, area C; BUILD M3.4, IK6). Its body is the surfaced GLB
 * (gen-m3-art.mjs, public/models/instruments/davit.glb: wave 3c's cab lantern upright on the roof's right-front corner,
 * no round lamp on the cab's face); its brain is a `DavitBrain` (./rules.js), stepped by whoever stands it (the Yards:
 * ../kiln/yards.js, with the Yards' Kilns as `world.instruments`). Drawn from the brain: its pose; one rack plate taken
 * off the rack per repair or per plate shot off (the plates are the GLB's own `plate1..3` nodes, the highest number
 * first); the lamp calm while it follows or idles, wary while it walks to a repair or re-seats one, dark when spent.
 */
export const DAVIT_ID = 'davit';
export const DAVIT_URL = M3_LIVE_URLS.davit;

const Base = liveKindClass({ id: DAVIT_ID, displayName: 'Davit', bodyRadius: 1.3, maxHealth: 800 });

export class DavitLive extends Base {
  constructor(ctx, manager, opts = {}) {
    super(ctx, manager, opts);
    this.brain = opts.brain || new DavitBrain({ x: this.position.x, z: this.position.z, heading: this.heading });
  }

  drive() {
    const B = this.brain;
    this.pose.x = B.x; this.pose.z = B.z; this.pose.heading = B.heading;
    super.drive();
  }

  animateKind() {
    const B = this.brain;
    // the rack shows what is left: plate3 goes first, then plate2, then plate1
    for (let i = 1; i <= DAVIT_RULES.plates; i++) { const p = this.tools[`plate${i}`]; if (p) p.visible = i <= B.plates; }
    this.lampWant = B.state === 'spent' ? 'dark' : (B.state === 'to-repair' || B.state === 'reseating') ? 'wary' : 'calm';
    this.awake = B.state !== 'idle' && B.state !== 'spent';
  }
}

export const DAVIT_KIND = Object.freeze({
  id: DAVIT_ID, Cls: DavitLive, sizeClass: DAVIT_ROSTER.cls, height: DAVIT_ROSTER.H,
  // the GLB's own height (its r5Size: 4.1775 m, the sheave's top under the roster's 4.2) so the normaliser scales by 1
  spec: Object.freeze({ url: DAVIT_URL, targetHeight: 4.1775, yaw: 0 }),
});
