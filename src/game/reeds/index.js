import { ReedMask, BEDS, REED_KIND, COVER_LINE } from '../../world/island/reedmask.js';
import { GustClock, GUST } from './gust.js';
import { reedHidden } from './rule.js';
import { ReedDraw, MAX_BEDS } from './draw.js';

/**
 * REED COVER, LIVE (BUILD M1.6e; bible §14). `installReeds(ctx)` runs in `installGame` and publishes
 *
 *   ctx.reeds                 this system: mask, clocks, draw, state of Brea's cover, report()
 *   ctx.terrain.cutCover      the world contract the Peg calls (`[x0, z0, x1, z1], w`): cuts the one mask
 *   ctx.terrain.reedCover     the mask (src/world/island/reedmask.js), for the rows and the Peg probe
 *   player.reedRule = true    lib/hot.js then carries `player.reedHidden` to the Instruments' sight as `pReedHide`
 *
 * Every frame it judges Brea against the rule (src/game/reeds/rule.js) at her feet:
 *   - what she stands in: carrizo or junco from the mask (less the cuts), else marram from the terrain's field (less
 *     the cuts), else nothing (open ground; the golden meadow is never cover);
 *   - the wind there: the bed's gust clock (a marram colony takes the clock of its 64 m square of the world grid);
 *   - and writes player.reedHidden / reedKind / reedCover / reedWind. In reed (cover at the line) it also sets
 *     `player.inReedCover` for the HUD, the audio and her animator, which read only the marram field before.
 *
 * THE CLOCK TIME is the plants' clock (`vegetation._uTime`, the game's simulation time, which the Frame Set pins on
 * its simulation-time stagings), so the lean drawn, the wind judged and the rows agree on one time.
 */
const MARRAM_TILE = 64;

export class ReedSystem {
  constructor(ctx) {
    this.ctx = ctx;
    const T = ctx.terrain;
    const h = T ? (x, z) => T.getHeight(x, z) : () => 0;
    this.mask = new ReedMask(h);
    const env = () => ctx.environment;
    this._mood = () => {
      const e = env();
      return { calima: e?.weather === 'calima', night: (e?.nightFactor || 0) > 0.5 };
    };
    this.clocks = BEDS.map((b, i) => new GustClock(b.seed, i, this._mood));
    this._marram = new Map();     // 64 m square key -> GustClock
    this.lean = new Float32Array(MAX_BEDS);
    this.t = 0;
    this.draw = new ReedDraw(ctx, this.mask, this.lean);
    // the state judged this frame (fields, no object per frame)
    this.kind = REED_KIND.NONE; this.cover = 0; this.wind = 0; this.hidden = false; this.bed = -1;
    if (T) {
      T.cutCover = (seg, w) => this.mask.cutCover(seg, w);
      T.reedCover = this.mask;
    }
    ctx.reeds = this;
  }

  /** The time the clocks are read at (see the header). */
  clockTime(t) {
    const u = this.ctx.vegetation?._uTime;
    return u && typeof u.value === 'number' ? u.value : t;
  }

  marramClock(x, z) {
    const i = Math.floor(x / MARRAM_TILE), j = Math.floor(z / MARRAM_TILE), k = i * 4096 + j;
    let c = this._marram.get(k);
    if (!c) { c = new GustClock((0x3a7a + Math.imul(i, 7919) + Math.imul(j, 104729)) >>> 0, 0.37 + i * 3 + j * 5, this._mood); this._marram.set(k, c); }
    return c;
  }

  /** Judge a point: sets this.kind / cover / wind / bed (and returns the clock) for time tc. */
  judge(x, z, crouch, tc) {
    const M = this.mask;
    let kind = REED_KIND.NONE, cover = 0, clock = null, bed = -1;
    if (M.covers(x, z)) {
      const c = M.cover(x, z), b = c > 0 ? M.bedAt(x, z) : null;
      if (b) { kind = b.kind; cover = c; clock = this.clocks[b.id]; bed = b.id; }
    }
    // where the reed does not count for her (thin, cut, or junco while she stands), a marram colony may
    if (!(cover >= COVER_LINE && (kind === REED_KIND.CARRIZO || crouch))) {
      const T = this.ctx.terrain;
      const mr = T?.reedCoverDensity ? T.reedCoverDensity(x, z) * (1 - M.cuts.cutAt(x, z)) : 0;
      if (mr >= COVER_LINE) { kind = REED_KIND.MARRAM; cover = mr; clock = this.marramClock(x, z); bed = -1; }
    }
    this.kind = kind; this.cover = cover; this.bed = bed;
    this.wind = clock ? clock.speed(tc) : 0;
    return clock;
  }

  update(dt, t) {
    const tc = this.clockTime(t);
    this.t = tc;
    for (let i = 0; i < this.clocks.length; i++) this.lean[i] = this.clocks[i].lean(tc);
    this.draw.update(dt);
    const p = this.ctx.player;
    if (!p || !p.position) return;
    p.reedRule = true;
    const crouch = !!p.crouching;
    this.judge(p.position.x, p.position.z, crouch, tc);
    const sp = typeof p.moveSpeed === 'number' ? p.moveSpeed : 0;
    this.hidden = reedHidden(this.kind, this.cover, crouch, sp, this.wind);
    p.reedHidden = this.hidden;
    p.reedKind = this.kind;
    p.reedCover = this.cover;
    p.reedWind = this.wind;
    if ((this.kind === REED_KIND.CARRIZO || this.kind === REED_KIND.JUNCO) && this.cover >= COVER_LINE) p.inReedCover = true;
  }

  report() {
    return { mask: this.mask.stats(), cuts: this.mask.cuts.cuts, planted: this.draw.planted, draw: this.draw.stats(),
      t: this.t, wind: this.clocks.map((c) => +c.speed(this.t).toFixed(2)), lean: Array.from(this.lean.slice(0, this.clocks.length), (v) => +v.toFixed(3)),
      brea: { kind: this.kind, cover: +this.cover.toFixed(3), wind: +this.wind.toFixed(2), hidden: this.hidden }, gust: GUST };
  }

  dispose() {
    this.draw.dispose();
    const T = this.ctx.terrain;
    if (T && T.reedCover === this.mask) { delete T.cutCover; delete T.reedCover; }
  }
}

export function installReeds(ctx) {
  const sys = new ReedSystem(ctx);
  ctx.game?.systems?.push?.(sys);
  return sys;
}
