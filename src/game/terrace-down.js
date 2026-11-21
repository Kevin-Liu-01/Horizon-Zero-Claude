import { NEAR_M } from './sites/clock.js';

/**
 * THE TERRACE PLUMB STAYS DOWN (M2 exit line X1). "The Scar"'s 'plumb-2' completes on the terrace Plumb's topple (E10,
 * src/instruments/kinds/plumb.js `_topple`: down 4 s, then it stands). Then the quest moves on ('barbed', 'oro') and
 * nothing ended the Plumb's fight: it stood up 4.6 s later on the slope beside her, still in its alert episode, and
 * followed her down to Ninewalls at 9-14 m with its Sightline (the kind's leash is 150 m). In exit run 5 at c9f130e it hit
 * her after the topple in all four chains: 2, 0+1, 1+14 and 1 Sightlines (chain 3: 14 from 199.6 to 293 s on the walk to
 * Oro, gourd dry, 'felled by PLUMB'; the same death ended one chain each at 174b07c and cf166ee). It was not the site
 * clock (the quest owns it: SiteRefill.own, never a refill), not a re-spawn ('barbed' stands nothing up, and the 3 s tick
 * asks for a live one first), not the herd (every hit was the Plumb's Sightline).
 *
 * The rule, after the site clock's (BIBLE §17, ./sites/clock.js): once 'plumb-2' is done, a toppled quest Plumb stays down
 * (its fall held inside the lying part of the topple, its downed reaction held) while Brea is within NEAR_M (80 m) of it or
 * it is in her view. When she is past both it gets up, out of sight, and goes home calm (state 'return': its alert
 * episode and its footwork reset) on a leash to its terrace, so it never follows her to the village again.
 *
 * Node-testable: it reads the machine and the world only through these fields (tools/gates/systems/terrace-down.test.mjs):
 *   m      { alive, _disposed, _toppleT, state, position {x,z}, ai { reactions { downedT, cdT }, engage { cfg } },
 *            setState(name), territory }
 *   world  { player() -> {x,z} | null, inView(x, z) -> bool }
 */
/**
 * Where in the topple the fall is held (s): inside its lying part, which runs from fallS (0.42) to downS - riseS (3.4)
 * in plumb.js TOPPLE (the bounce has settled by 3.0: 0.04 e^(-6 x 2.58) is 1e-8 of the lay angle).
 */
export const HOLD_AT_S = 3.0;
/** Its leash home once it is up (m): its terrace and 20 m round it, and 40 m past that before it turns back. */
export const HOME = Object.freeze({ r: 20, leash: 40 });

export class TerraceDown {
  /** @param {{ done: () => boolean, world: () => ({ player(): any, inView(x:number, z:number): boolean } | null), home: {x:number, z:number} }} o */
  constructor({ done, world, home }) {
    this.done = done;
    this.world = world;
    this.home = home;
    this.log = [];
  }

  /** Is Brea past the rule (farther than NEAR_M and the Plumb not in her view)? Unknown position: no. */
  clear(m) {
    const W = this.world?.();
    const p = W?.player?.();
    if (!p) return false;
    const d = Math.hypot(m.position.x - p.x, m.position.z - p.z);
    if (d <= NEAR_M) return false;
    return !(W.inView?.(m.position.x, m.position.z) ?? false);
  }

  /** One frame for each of the quest's terrace Plumbs (`list`), with `t` the quest's clock for the log. */
  step(list, t = 0) {
    if (!this.done()) return;
    for (const m of list || []) {
      if (!m || m.alive === false || m._disposed) continue;
      let s = m._questDown;
      if (s === 'up') continue;
      if (!s) {
        // the first frame after the stage closed: lying in its topple, it is held; up already, it only goes home
        s = m._questDown = m._toppleT >= 0 ? 'held' : 'rising';
        this.log.push({ t: +t.toFixed(2), state: s });
      }
      if (s === 'held') {
        if (this.clear(m)) {
          m._questDown = 'rising';
          const p = this.world?.()?.player?.();
          this.log.push({ t: +t.toFixed(2), state: 'rising', d: p ? +Math.hypot(m.position.x - p.x, m.position.z - p.z).toFixed(1) : null });
        } else {
          if (m._toppleT > HOLD_AT_S) m._toppleT = HOLD_AT_S;
          const R = m.ai?.reactions;
          if (R) { if (!(R.downedT > 1)) R.downedT = 1; if (!(R.cdT > 2)) R.cdT = 2; }
          continue;
        }
      }
      // rising: once the topple and the downed reaction are over it goes home calm, on its leash
      if (m._toppleT >= 0 || m.state === 'downed') continue;
      m.territory = { x: this.home.x, z: this.home.z, r: HOME.r };
      const E = m.ai?.engage;
      if (E?.cfg) E.cfg = Object.freeze({ ...E.cfg, leash: HOME.leash });
      m.setState?.('return');
      m._questDown = 'up';
      this.log.push({ t: +t.toFixed(2), state: 'up' });
    }
  }
}
